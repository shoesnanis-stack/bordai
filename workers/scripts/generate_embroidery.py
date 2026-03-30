"""
generate_embroidery.py — v4 (production quality)
Converts a design image into a real embroidery file using pyembroidery + Pillow.
Professional-grade: fabric profiles, tie-in/tie-off, TRIM on long jumps,
proper stitch ordering, pull compensation, 3 underlay types, validation.

Usage:
  python generate_embroidery.py <FORMAT> <output_path> < params.json
  python generate_embroidery.py --test <image_path> <output_path>
"""

import sys
import json
import math
import os
import urllib.request
import io
import pyembroidery

# Add script dir to path for perfiles import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from perfiles import get_profile, FabricProfile

try:
    from PIL import Image, ImageFilter, ImageOps
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    np = None


# ── Image loading (file path preferred, URL as fallback) ──────────

def load_image(path: str = None, url: str = None):
    """Load image from local file path or URL. Returns PIL Image or None."""
    # Try local file first (most reliable — passed by Node.js)
    if path and os.path.exists(path):
        try:
            img = Image.open(path)
            print(f"[IMG] Loaded from file: {path} ({os.path.getsize(path)} bytes)", file=sys.stderr)
            return img
        except Exception as e:
            print(f"[WARN] Could not open file {path}: {e}", file=sys.stderr)

    # Fall back to URL download
    if url:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BordAI/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data))
            print(f"[IMG] Downloaded from URL: {img.size}, mode={img.mode}", file=sys.stderr)
            return img
        except Exception as e:
            print(f"[WARN] Could not download image from URL: {e}", file=sys.stderr)

    print("[WARN] No image source available (no file path and no URL)", file=sys.stderr)
    return None


# ── Smart mask detection (Step 1) ──────────────────────────────────

def preprocess_image(img: Image.Image) -> Image.Image:
    """Enhance contrast and sharpen before masking."""
    # Preserve alpha if present
    if img.mode == "RGBA":
        r, g, b, a = img.split()
        rgb = Image.merge("RGB", (r, g, b))
        rgb = ImageOps.autocontrast(rgb, cutoff=1)
        rgb = rgb.filter(ImageFilter.SHARPEN)
        r2, g2, b2 = rgb.split()
        return Image.merge("RGBA", (r2, g2, b2, a))
    else:
        img = img.convert("RGB")
        img = ImageOps.autocontrast(img, cutoff=1)
        img = img.filter(ImageFilter.SHARPEN)
        return img


def detect_background_color(img_rgba: np.ndarray) -> np.ndarray:
    """Detect background by sampling the 4 edges of the image."""
    h, w = img_rgba.shape[:2]
    edge_pixels = []

    # Top and bottom rows
    edge_pixels.extend(img_rgba[0, :, :3].tolist())
    edge_pixels.extend(img_rgba[h - 1, :, :3].tolist())
    # Left and right columns
    edge_pixels.extend(img_rgba[:, 0, :3].tolist())
    edge_pixels.extend(img_rgba[:, w - 1, :3].tolist())

    # Quantize to reduce noise (bucket by 16)
    quantized = {}
    for px in edge_pixels:
        key = (px[0] // 16, px[1] // 16, px[2] // 16)
        quantized[key] = quantized.get(key, 0) + 1

    # Most common quantized color
    best_key = max(quantized, key=quantized.get)
    bg_color = np.array([best_key[0] * 16 + 8, best_key[1] * 16 + 8, best_key[2] * 16 + 8])
    return bg_color


def create_design_mask(img: Image.Image) -> np.ndarray:
    """
    Multi-strategy mask: True = part of design, False = background.
    Handles RGBA (transparent bg), RGB (colored/white bg), and grayscale.
    Preserves interior holes (like the triangle inside the letter A).
    """
    img_rgba = np.array(img.convert("RGBA"))
    h, w = img_rgba.shape[:2]
    r, g, b, a = img_rgba[:, :, 0], img_rgba[:, :, 1], img_rgba[:, :, 2], img_rgba[:, :, 3]

    # Strategy 1: Real alpha channel?
    alpha_var = float(np.var(a))
    if alpha_var > 1000:
        print(f"[MASK] Using alpha channel (variance={alpha_var:.0f})", file=sys.stderr)
        mask = a > 30
        brightness = (r.astype(int) + g.astype(int) + b.astype(int)) // 3
        mask = mask & (brightness < 245)
        total = mask.sum()
        if total > 0:
            return _cleanup_mask(mask)

    # Strategy 2: Check if image is high-contrast (like a black logo on white)
    gray = np.array(img.convert("L"))
    dark_pct = (gray < 80).sum() / (h * w)
    light_pct = (gray > 200).sum() / (h * w)

    if dark_pct + light_pct > 0.85:
        # High contrast image: use binary threshold (cleaner for logos with holes)
        print(f"[MASK] High contrast detected (dark={dark_pct:.0%}, light={light_pct:.0%}) — using binary threshold", file=sys.stderr)
        # Design = dark pixels for dark-on-light, light pixels for light-on-dark
        if light_pct > dark_pct:
            mask = gray < 128  # dark design on light background
        else:
            mask = gray > 128  # light design on dark background
        return _cleanup_mask(mask)

    # Strategy 3: Detect background by edge sampling
    bg_color = detect_background_color(img_rgba)
    print(f"[MASK] Detected background color: RGB({bg_color[0]},{bg_color[1]},{bg_color[2]})", file=sys.stderr)

    rgb = img_rgba[:, :, :3].astype(float)
    bg = bg_color.astype(float).reshape(1, 1, 3)
    dist = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))

    mask = dist > 40
    total = mask.sum()
    ratio = total / (h * w)
    print(f"[MASK] Edge-based: {total} pixels ({ratio:.1%})", file=sys.stderr)

    if 0.01 < ratio < 0.95:
        return _cleanup_mask(mask)

    # Strategy 4: Fallback brightness
    print("[MASK] Fallback: brightness-based", file=sys.stderr)
    brightness = (r.astype(int) + g.astype(int) + b.astype(int)) // 3
    mask = (brightness < 230) & (brightness > 15)
    return _cleanup_mask(mask)


def _cleanup_mask(mask: np.ndarray) -> np.ndarray:
    """Light cleanup: remove tiny noise islands but PRESERVE holes in the design."""
    from PIL import Image as PILImage
    from scipy import ndimage
    mask_img = PILImage.fromarray((mask.astype(np.uint8) * 255))
    # Only remove tiny noise islands (erode then dilate with small kernel)
    # Do NOT close gaps (MaxFilter→MinFilter) — that fills holes!
    mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
    cleaned = np.array(mask_img) > 128

    # Preserve interior holes: label connected False regions.
    # Holes are False regions NOT touching the image border.
    try:
        inverted = ~cleaned
        labeled, num_features = ndimage.label(inverted)
        # Find which labels touch the border
        border_labels = set()
        h, w = labeled.shape
        border_labels.update(labeled[0, :].tolist())     # top
        border_labels.update(labeled[h-1, :].tolist())   # bottom
        border_labels.update(labeled[:, 0].tolist())      # left
        border_labels.update(labeled[:, w-1].tolist())    # right
        border_labels.discard(0)  # 0 is not a label

        # Count holes preserved
        hole_count = 0
        for lbl in range(1, num_features + 1):
            if lbl not in border_labels:
                # This is an interior hole — ensure it stays False
                hole_pixels = (labeled == lbl).sum()
                if hole_pixels > 5:  # ignore very tiny holes (< 5px)
                    hole_count += 1
                    # Already False in cleaned, nothing to do
                else:
                    # Fill very tiny holes (noise)
                    cleaned[labeled == lbl] = True

        if hole_count > 0:
            print(f"[MASK] Preserved {hole_count} interior holes", file=sys.stderr)
    except ImportError:
        # scipy not available — fall back to simple cleanup
        print("[MASK] scipy not available, holes may not be preserved", file=sys.stderr)

    return cleaned


# ── Color-based region separation (Step 2) ─────────────────────────

def hex_to_rgb(hex_str: str) -> tuple:
    hex_str = hex_str.lstrip("#")
    try:
        return (int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))
    except Exception:
        return (0, 0, 0)


def create_color_masks(img_rgba: np.ndarray, full_mask: np.ndarray, regions: list) -> list:
    """
    For each region, create a mask of pixels closest to that region's color.
    Only pixels within full_mask are considered.
    """
    if len(regions) <= 1:
        return [full_mask]

    rgb = img_rgba[:, :, :3].astype(float)
    h, w = rgb.shape[:2]

    # Get target colors for each region
    colors = []
    for region in regions:
        c = hex_to_rgb(region.get("color_hex", "#000000"))
        colors.append(np.array(c, dtype=float))

    # Compute distance from each pixel to each region color
    n = len(colors)
    distances = np.full((h, w, n), np.inf)
    for i, color in enumerate(colors):
        diff = rgb - color.reshape(1, 1, 3)
        distances[:, :, i] = np.sqrt(np.sum(diff ** 2, axis=2))

    # Assign each pixel to the nearest color
    nearest = np.argmin(distances, axis=2)

    # Create per-region masks (only within the design mask)
    masks = []
    for i in range(n):
        region_mask = (nearest == i) & full_mask
        masks.append(region_mask)
        pct = region_mask.sum() / max(full_mask.sum(), 1) * 100
        print(f"[COLOR] Region '{regions[i].get('name', i)}' ({regions[i].get('color_hex', '?')}): {region_mask.sum()} px ({pct:.0f}%)", file=sys.stderr)

    return masks


# ── Stitch generation (Steps 1+4) ─────────────────────────────────

def stitches_from_mask(
    mask: np.ndarray,
    pattern: pyembroidery.EmbPattern,
    width_mm: float,
    height_mm: float,
    density: float,
    stitch_type: str,
    angle: float = 0,
    pull_compensation_px: float = 0,
):
    """Generate embroidery stitches from a boolean mask using direct angled scanlines."""
    if mask.sum() == 0:
        return

    h, w = mask.shape
    W_emb = int(width_mm * 10)  # embroidery units (0.1mm)
    H_emb = int(height_mm * 10)

    def to_emb(px, py):
        """Convert pixel coords → embroidery units (always uses original mask dims)."""
        return int(px * W_emb / w), int(py * H_emb / h)

    row_spacing_mm = 1.0 / max(density, 1)
    row_spacing_px = max(1, int(row_spacing_mm * h / height_mm))

    if stitch_type in ("tatami", "fill", "satin"):
        _fill_with_angle(mask, pattern, w, h, W_emb, H_emb, angle,
                         row_spacing_px, to_emb, pull_compensation_px)

    elif stitch_type in ("running", "triple"):
        _running_stitch(mask, pattern, w, h, row_spacing_px, to_emb, stitch_type)


def _fill_with_angle(mask, pattern, w, h, W_emb, H_emb, angle, row_spacing_px, to_emb,
                     pull_compensation_px=0):
    """Generate fill stitches at a given angle using direct scanlines (no rotation).
    pull_compensation_px: extend each run outward by this many pixels for pull compensation."""
    rad = math.radians(angle)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    # For angle=0: scanlines are horizontal (scan along Y, stitch along X)
    # For angle=45: scanlines are diagonal
    # Scan direction is perpendicular to the fill direction
    # Fill direction: (cos_a, sin_a)
    # Scan direction: (-sin_a, cos_a)

    # Compute the range of the scan direction we need to cover
    # Project all 4 corners of the image onto the scan direction
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    scan_values = [(-sin_a * cx + cos_a * cy) for cx, cy in corners]
    scan_min = min(scan_values)
    scan_max = max(scan_values)

    going_right = True
    prev_ex, prev_ey = None, None

    # Step along scan direction
    scan_pos = scan_min
    while scan_pos <= scan_max:
        # For this scan position, find all mask pixels along the fill direction
        # The scanline equation: -sin_a * x + cos_a * y = scan_pos
        # We sample along the fill direction to find runs of True pixels

        runs = _find_runs_on_scanline(mask, w, h, cos_a, sin_a, scan_pos)

        # Apply pull compensation: extend each run outward along fill direction
        if pull_compensation_px > 0:
            comp = pull_compensation_px
            runs = [
                (xs - cos_a * comp, ys - sin_a * comp,
                 xe + cos_a * comp, ye + sin_a * comp)
                for xs, ys, xe, ye in runs
            ]

        for x_start, y_start, x_end, y_end in runs:
            ex_s, ey_s = to_emb(x_start, y_start)
            ex_e, ey_e = to_emb(x_end, y_end)

            if not going_right:
                ex_s, ey_s, ex_e, ey_e = ex_e, ey_e, ex_s, ey_s

            # Jump if far from previous stitch
            if prev_ex is None or abs(ex_s - prev_ex) > 120 or abs(ey_s - prev_ey) > 120:
                pattern.add_command(pyembroidery.JUMP, ex_s, ey_s)

            pattern.add_stitch_absolute(pyembroidery.STITCH, ex_s, ey_s)
            pattern.add_stitch_absolute(pyembroidery.STITCH, ex_e, ey_e)
            prev_ex, prev_ey = ex_e, ey_e

        going_right = not going_right
        scan_pos += row_spacing_px


def _find_runs_on_scanline(mask, w, h, cos_a, sin_a, scan_pos):
    """Find runs of True pixels along a scanline at the given angle.
    Returns list of (x_start, y_start, x_end, y_end) for each run."""
    # Project corners onto the fill direction to find sample range
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    fill_values = [(cos_a * cx + sin_a * cy) for cx, cy in corners]
    fill_min = min(fill_values)
    fill_max = max(fill_values)

    # Sample points along the fill direction for this scanline
    runs = []
    in_run = False
    run_start = None
    prev_px, prev_py = 0, 0

    # Step size: 1 pixel
    t = fill_min
    while t <= fill_max:
        # Convert (fill_t, scan_pos) back to (x, y)
        px = cos_a * t - sin_a * scan_pos
        py = sin_a * t + cos_a * scan_pos

        ix, iy = int(round(px)), int(round(py))

        if 0 <= ix < w and 0 <= iy < h and mask[iy, ix]:
            if not in_run:
                in_run = True
                run_start = (px, py)
            prev_px, prev_py = px, py
        else:
            if in_run:
                runs.append((run_start[0], run_start[1], prev_px, prev_py))
                in_run = False

        t += 1.0

    # Close last run
    if in_run:
        runs.append((run_start[0], run_start[1], prev_px, prev_py))

    return runs


def _running_stitch(mask, pattern, w, h, row_spacing_px, to_emb, stitch_type):
    """Generate running/triple stitches along the edge of the mask."""
    edge_px = []
    skip = max(1, row_spacing_px // 2)
    for py in range(1, h - 1, skip):
        for px in range(1, w - 1):
            if not mask[py][px]:
                continue
            if not (mask[py - 1][px] and mask[py + 1][px] and
                    mask[py][px - 1] and mask[py][px + 1]):
                edge_px.append((px, py))

    if not edge_px:
        return

    prev_x, prev_y = None, None
    for px, py in sorted(edge_px, key=lambda p: (p[1], p[0])):
        ex, ey = to_emb(px, py)
        if prev_x is None or abs(ex - prev_x) > 150 or abs(ey - prev_y) > 150:
            pattern.add_command(pyembroidery.JUMP, ex, ey)
        pattern.add_stitch_absolute(pyembroidery.STITCH, ex, ey)
        prev_x, prev_y = ex, ey

    if stitch_type == "triple":
        for px, py in sorted(edge_px, key=lambda p: (-p[1], -p[0])):
            ex, ey = to_emb(px, py)
            pattern.add_stitch_absolute(pyembroidery.STITCH, ex, ey)


def generate_underlay(mask, pattern, width_mm, height_mm, main_angle, uconfig=None):
    """Dispatch to the appropriate underlay type based on profile config."""
    if uconfig is None:
        # Fallback: simple perpendicular fill
        underlay_angle = main_angle + 90
        stitches_from_mask(mask, pattern, width_mm, height_mm,
                          density=2.0, stitch_type="tatami", angle=underlay_angle)
        return

    utype = uconfig.underlay_type
    underlay_angle = main_angle + 90

    if utype == "center_run":
        # Single running stitch along the center axis of the region
        stitches_from_mask(mask, pattern, width_mm, height_mm,
                          density=1.0, stitch_type="running", angle=0)

    elif utype == "edge_run":
        # Running stitch along edges, inset from boundary
        _underlay_edge_run(mask, pattern, width_mm, height_mm, uconfig.inset_mm)

    elif utype == "zigzag_edge_run":
        # CRITICAL ORDER: zigzag FIRST, then edge_run
        # Zigzag: perpendicular low-density fill
        stitches_from_mask(mask, pattern, width_mm, height_mm,
                          density=uconfig.density, stitch_type="tatami", angle=underlay_angle)
        # Then edge run
        _underlay_edge_run(mask, pattern, width_mm, height_mm, uconfig.inset_mm)

    elif utype == "none":
        pass  # No underlay (e.g., some 3D puff zones)

    else:
        # Unknown type — fallback to perpendicular fill
        stitches_from_mask(mask, pattern, width_mm, height_mm,
                          density=2.0, stitch_type="tatami", angle=underlay_angle)


def _underlay_edge_run(mask, pattern, width_mm, height_mm, inset_mm):
    """Running stitch at inset_mm from the edge of the mask region."""
    h, w = mask.shape
    inset_px = max(1, int(inset_mm * h / height_mm))

    # Erode the mask to get the inset boundary
    from PIL import Image as PILImg
    mask_img = PILImg.fromarray((mask.astype(np.uint8) * 255))
    for _ in range(inset_px):
        mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    eroded = np.array(mask_img) > 128

    if eroded.sum() == 0:
        return  # Region too small for edge run

    # Find edge pixels of the eroded mask
    edge_mask = np.zeros_like(eroded, dtype=bool)
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            shifted = np.roll(np.roll(eroded, dy, axis=0), dx, axis=1)
            edge_mask |= (eroded & ~shifted)

    # Generate running stitch along edge pixels
    W_emb = int(width_mm * 10)
    H_emb = int(height_mm * 10)
    edge_coords = list(zip(*np.where(edge_mask)))
    if not edge_coords:
        return

    # Sort for coherent path
    prev_y, prev_x = edge_coords[0]
    for ey, ex in sorted(edge_coords, key=lambda p: (p[0], p[1]))[::2]:
        emb_x = int(ex * W_emb / w)
        emb_y = int(ey * H_emb / h)
        pattern.add_stitch_absolute(pyembroidery.STITCH, emb_x, emb_y)


def generate_contour(
    mask: np.ndarray,
    pattern: pyembroidery.EmbPattern,
    width_mm: float,
    height_mm: float,
):
    """Generate a clean running stitch outline around the mask edges.
    Traces the perimeter of the design for clean, professional borders."""
    h, w = mask.shape
    W_emb = int(width_mm * 10)
    H_emb = int(height_mm * 10)

    def to_emb(px, py):
        return int(px * W_emb / w), int(py * H_emb / h)

    # Find edge pixels: design pixels adjacent to at least one non-design pixel
    edge_mask = np.zeros_like(mask, dtype=bool)
    for dy in [-1, 0, 1]:
        for dx in [-1, 0, 1]:
            if dy == 0 and dx == 0:
                continue
            shifted = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
            # Edge = is design AND has at least one non-design neighbor
            edge_mask |= (mask & ~shifted)

    # Trace contours using connected component ordering
    edge_coords = list(zip(*np.where(edge_mask)))  # (y, x) pairs
    if not edge_coords:
        return

    # Sort by angle from centroid for a roughly clockwise traversal
    cy = np.mean([p[0] for p in edge_coords])
    cx = np.mean([p[1] for p in edge_coords])

    # Group into connected contours using a simple nearest-neighbor chain
    remaining = set(range(len(edge_coords)))
    contours = []

    while remaining:
        # Start a new contour
        contour = []
        idx = min(remaining)  # Start from topmost-leftmost point
        remaining.remove(idx)
        contour.append(edge_coords[idx])

        # Chain to nearest unvisited neighbor
        while remaining:
            cy_cur, cx_cur = contour[-1]
            best_idx = None
            best_dist = float('inf')
            for candidate in remaining:
                cy_c, cx_c = edge_coords[candidate]
                d = abs(cy_c - cy_cur) + abs(cx_c - cx_cur)  # Manhattan distance
                if d < best_dist:
                    best_dist = d
                    best_idx = candidate
            if best_dist > 5:  # Gap too large — start new contour
                break
            remaining.remove(best_idx)
            contour.append(edge_coords[best_idx])

        if len(contour) >= 3:
            contours.append(contour)

    print(f"[CONTOUR] {len(contours)} contour(s), {sum(len(c) for c in contours)} edge pixels", file=sys.stderr)

    # Generate stitches for each contour (sub-sample every 2 pixels for cleaner lines)
    for contour in contours:
        step = max(1, len(contour) // 200)  # Max ~200 stitches per contour
        sampled = contour[::step]
        if not sampled:
            continue

        # Jump to start
        ey, ex = sampled[0]
        emb_x, emb_y = to_emb(ex, ey)
        pattern.add_command(pyembroidery.JUMP, emb_x, emb_y)

        for ey_px, ex_px in sampled:
            emb_x, emb_y = to_emb(ex_px, ey_px)
            pattern.add_stitch_absolute(pyembroidery.STITCH, emb_x, emb_y)

        # Close the contour (stitch back to start)
        ey, ex = sampled[0]
        emb_x, emb_y = to_emb(ex, ey)
        pattern.add_stitch_absolute(pyembroidery.STITCH, emb_x, emb_y)


# ── Tie-in / Tie-off (thread security) ────────────────────────────

def add_tie_in(pattern, x, y, n=3, length=10):
    """Add n short securing stitches at the START of a section.
    x, y in embroidery units. length in embroidery units (10 = 1mm)."""
    for i in range(n):
        if i % 2 == 0:
            pattern.add_stitch_absolute(pyembroidery.STITCH, x + length, y)
        else:
            pattern.add_stitch_absolute(pyembroidery.STITCH, x, y)


def add_tie_off(pattern, x, y, n=3, length=10):
    """Add n short locking stitches at the END of a section.
    Stitches back over previously stitched area."""
    for i in range(n):
        if i % 2 == 0:
            pattern.add_stitch_absolute(pyembroidery.STITCH, x - length, y)
        else:
            pattern.add_stitch_absolute(pyembroidery.STITCH, x, y)


# ── TRIM post-processor ──────────────────────────────────────────

def insert_trims_on_long_jumps(pattern, threshold_units=30):
    """Post-process: insert TRIM before any JUMP exceeding threshold.
    threshold_units: distance in 0.1mm. Default 30 = 3.0mm."""
    old_stitches = list(pattern.stitches)
    if len(old_stitches) < 2:
        return

    new_stitches = [old_stitches[0]]
    trims_added = 0

    for i in range(1, len(old_stitches)):
        x1, y1, _ = old_stitches[i - 1]
        x2, y2, cmd2 = old_stitches[i]

        dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

        # Insert TRIM before long jumps
        if cmd2 == pyembroidery.JUMP and dist > threshold_units:
            new_stitches.append((x1, y1, pyembroidery.TRIM))
            trims_added += 1

        new_stitches.append(old_stitches[i])

    if trims_added > 0:
        pattern.stitches = new_stitches
        print(f"[TRIM] Inserted {trims_added} TRIM commands on long jumps", file=sys.stderr)


# ── Color luminosity for ordering ────────────────────────────────

def color_luminosity(hex_color):
    """Return perceived luminosity (0=black, 1=white) for color sorting."""
    r, g, b = hex_to_rgb(hex_color)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


# ── Stitch sequencing (professional order) ───────────────────────

def sequence_and_generate(
    regions, color_masks, full_mask, pattern, width_mm, height_mm, profile
):
    """Generate all stitches in professional order:
    1. Fills (light→dark) with underlay per profile
    2. Satins (light→dark) with underlay per profile
    3. Running/outline stitches (light→dark)
    Each has tie-in at start and tie-off at end."""

    # Classify and sort regions
    fills = []
    satins = []
    outlines = []

    for i, region in enumerate(regions):
        entry = (i, region)
        st = region.get("stitch_type", "tatami")
        if st in ("running", "triple"):
            outlines.append(entry)
        elif st == "satin":
            satins.append(entry)
        else:
            fills.append(entry)

    # Sort each group: light colors first (higher luminosity first)
    for group in [fills, satins, outlines]:
        group.sort(key=lambda e: -color_luminosity(e[1].get("color_hex", "#000000")))

    ordered = fills + satins + outlines
    print(f"[ORDER] {len(fills)} fills + {len(satins)} satins + {len(outlines)} outlines", file=sys.stderr)

    # Build thread list in execution order
    seen_colors = []
    for _, region in ordered:
        color_hex = region.get("color_hex", "#000000")
        if color_hex not in seen_colors:
            seen_colors.append(color_hex)

    # Clear existing threads and add in correct order
    pattern.threadlist.clear()
    for hex_color in seen_colors:
        r, g, b = hex_to_rgb(hex_color)
        thread = pyembroidery.EmbThread()
        thread.color = (r << 16) | (g << 8) | b
        thread.name = hex_color
        pattern.add_thread(thread)

    # Generate stitches per region in professional order
    current_color_idx = -1
    tie_len = int(profile.tie_stitch_length_mm * 10)

    for idx, (i, region) in enumerate(ordered):
        stitch_type = region.get("stitch_type", "tatami")
        density = float(region.get("density", 5))
        angle = float(region.get("angle", 0))
        wants_underlay = region.get("underlay", True)
        color_hex = region.get("color_hex", "#000000")
        region_mask = color_masks[i] if i < len(color_masks) else full_mask

        if region_mask.sum() == 0:
            print(f"[SKIP] Region '{region.get('name', i)}' has 0 pixels", file=sys.stderr)
            continue

        # Color change if needed
        new_color_idx = seen_colors.index(color_hex) if color_hex in seen_colors else 0
        if current_color_idx != -1 and new_color_idx != current_color_idx:
            pattern.add_command(pyembroidery.COLOR_BREAK)
        current_color_idx = new_color_idx

        # Clamp density to professional range
        row_spacing_mm = 1.0 / max(density, 1)
        row_spacing_mm = max(row_spacing_mm, profile.fill_density_mm)
        row_spacing_mm = min(row_spacing_mm, 0.55)
        clamped_density = 1.0 / row_spacing_mm

        name = region.get('name', f'region_{i}')

        # Get first stitch position for tie-in (centroid of region mask)
        ys, xs = np.where(region_mask)
        cx_px, cy_px = int(np.mean(xs)), int(np.mean(ys))
        h, w = region_mask.shape
        W_emb = int(width_mm * 10)
        H_emb = int(height_mm * 10)
        cx_emb = int(cx_px * W_emb / w)
        cy_emb = int(cy_px * H_emb / h)

        # Tie-in
        pattern.add_command(pyembroidery.JUMP, cx_emb, cy_emb)
        add_tie_in(pattern, cx_emb, cy_emb, profile.tie_in_stitches, tie_len)

        # Underlay (not for running stitches)
        if wants_underlay and stitch_type not in ("running", "triple"):
            uconfig = profile.underlay_fill if stitch_type in ("tatami", "fill") else profile.underlay_satin
            print(f"[UNDERLAY] {uconfig.underlay_type} for '{name}'", file=sys.stderr)
            generate_underlay(region_mask, pattern, width_mm, height_mm, angle, uconfig)

        # Main stitches
        print(f"[STITCH] {stitch_type} for '{name}' angle={angle} density={clamped_density:.1f}", file=sys.stderr)
        stitches_from_mask(region_mask, pattern, width_mm, height_mm,
                          clamped_density, stitch_type, angle,
                          pull_compensation_px=profile.pull_compensation_mm * h / height_mm)

        # Contour outline (skip for running stitch which IS an outline)
        if stitch_type not in ("running", "triple"):
            generate_contour(region_mask, pattern, width_mm, height_mm)

        # Tie-off at last stitch position
        if pattern.stitches:
            last_x, last_y, _ = pattern.stitches[-1]
            add_tie_off(pattern, last_x, last_y, profile.tie_off_stitches, tie_len)


# ── Pre-export validation ────────────────────────────────────────

HOOP_SIZES_PY = {
    "4x4": (100, 100), "5x7": (130, 180), "6x10": (160, 260),
    "8x12": (200, 300), "10x10": (260, 260),
}

def validate_pattern(pattern, width_mm, height_mm, hoop_size, profile):
    """Pre-export validation. Returns list of warning strings."""
    warnings = []
    stitch_count = sum(1 for s in pattern.stitches if s[2] == pyembroidery.STITCH)

    if stitch_count > 500000:
        warnings.append(f"Demasiadas puntadas: {stitch_count} (max recomendado: 500,000)")
    elif stitch_count > 200000:
        warnings.append(f"Muchas puntadas: {stitch_count} — puede ser lento de bordar")

    if stitch_count < 50:
        warnings.append(f"Muy pocas puntadas: {stitch_count} — posible error de mascara")

    # Check hoop fit
    hoop_dims = HOOP_SIZES_PY.get(hoop_size, (999, 999))
    if width_mm > hoop_dims[0] or height_mm > hoop_dims[1]:
        warnings.append(f"Diseno {width_mm}x{height_mm}mm excede aro {hoop_size} ({hoop_dims[0]}x{hoop_dims[1]}mm)")

    # Count color changes
    color_changes = sum(1 for s in pattern.stitches if s[2] in (pyembroidery.COLOR_CHANGE, pyembroidery.COLOR_BREAK))
    if color_changes > 20:
        warnings.append(f"Demasiados cambios de color: {color_changes} (max recomendado: 20)")

    return warnings


# ── Main generator ─────────────────────────────────────────────────

def generate(params: dict, fmt: str, output_path: str) -> str:
    pattern = pyembroidery.EmbPattern()

    digitization = params.get("digitization", {})
    regions = digitization.get("regions", [])
    thread_colors = digitization.get("thread_colors", [])
    width_mm = float(digitization.get("width_mm", 60))
    height_mm = float(digitization.get("height_mm", 40))
    image_url = params.get("image_url")
    brief = params.get("brief", {})
    if isinstance(brief, str):
        brief = {"content": brief}

    # Load fabric profile from surface type
    meta = params.get("meta", {})
    surface = meta.get("surface", "other")
    profile = get_profile(surface)
    print(f"[PROFILE] {profile.name} — density={profile.fill_density_mm}mm, "
          f"pull={profile.pull_compensation_mm}mm, trim={profile.trim_threshold_mm}mm, "
          f"stabilizer={profile.stabilizer}", file=sys.stderr)

    # Add default threads (will be rebuilt by sequence_and_generate if image loads)
    for tc in thread_colors:
        r, g, b = hex_to_rgb(tc.get("hex", "#000000"))
        thread = pyembroidery.EmbThread()
        thread.color = (r << 16) | (g << 8) | b
        thread.name = tc.get("name", "Thread")
        pattern.add_thread(thread)

    if not thread_colors:
        t = pyembroidery.EmbThread()
        t.color = 0x000000
        t.name = "Black"
        pattern.add_thread(t)

    # Load image from file path (preferred) or URL (fallback)
    image_path = params.get("image_path")
    img = load_image(path=image_path, url=image_url) if HAS_PIL else None

    if img is not None and HAS_PIL:

        # Resize for embroidery resolution (~5px per mm)
        scale = 5.0
        target_w = max(120, int(width_mm * scale))
        target_h = max(120, int(height_mm * scale))
        img = img.resize((target_w, target_h), Image.LANCZOS)

        # Preprocess
        img = preprocess_image(img)

        # Build design mask
        full_mask = create_design_mask(img)
        total_px = full_mask.sum()
        print(f"[IMG] Design pixels: {total_px}/{target_w * target_h} "
              f"({total_px / (target_w * target_h) * 100:.0f}%)", file=sys.stderr)

        if total_px == 0:
            print("[WARN] Mask is empty — falling back to full image", file=sys.stderr)
            full_mask = np.ones((target_h, target_w), dtype=bool)

        # Create per-color masks if multiple regions
        img_rgba = np.array(img.convert("RGBA"))
        color_masks = create_color_masks(img_rgba, full_mask, regions) if regions else [full_mask]

        # If no regions defined, create a default
        if not regions:
            regions = [{"stitch_type": "tatami", "density": 5, "angle": 0,
                       "underlay": True, "color_hex": "#000000", "name": "Design"}]

        # Professional stitch sequencing: fills → satins → outlines, light → dark
        sequence_and_generate(regions, color_masks, full_mask, pattern,
                             width_mm, height_mm, profile)

    else:
        # Fallback: simple geometric pattern
        print("[WARN] No image available, using geometric fallback.", file=sys.stderr)
        W, H = int(width_mm * 10), int(height_mm * 10)
        total = max(len(regions), 1)
        for i in range(total):
            density = float(regions[i].get("density", 5)) if i < len(regions) else 5
            strip_h = H // total
            y0, y1 = i * strip_h, i * strip_h + strip_h
            gap = max(5, int(10 / density))
            going_right = True
            pattern.add_command(pyembroidery.JUMP, 0, y0)
            for y in range(y0, y1, gap):
                x0e, x1e = (0, W) if going_right else (W, 0)
                pattern.add_stitch_absolute(pyembroidery.STITCH, x0e, y)
                pattern.add_stitch_absolute(pyembroidery.STITCH, x1e, y)
                going_right = not going_right
            if i < total - 1:
                pattern.add_command(pyembroidery.COLOR_BREAK)

    # Post-processing: insert TRIM before long jumps
    trim_threshold = int(profile.trim_threshold_mm * 10)
    insert_trims_on_long_jumps(pattern, trim_threshold)

    # Pre-export validation
    hoop_size = meta.get("hoop_size", "5x7")
    warnings = validate_pattern(pattern, width_mm, height_mm, hoop_size, profile)
    for w in warnings:
        print(f"[VALIDATE] {w}", file=sys.stderr)

    pattern.add_command(pyembroidery.END)
    pyembroidery.write(pattern, output_path)

    # Stats
    stitch_count = sum(1 for s in pattern.stitches if s[2] == pyembroidery.STITCH)
    color_count = len(pattern.threadlist)
    print(f"[DONE] {stitch_count} stitches, {color_count} colors → {output_path}", file=sys.stderr)
    return output_path


if __name__ == "__main__":
    # Test mode: python generate_embroidery.py --test <image_path> <output_path>
    if len(sys.argv) >= 2 and sys.argv[1] == "--test":
        if len(sys.argv) < 4:
            print("Usage: python generate_embroidery.py --test <image_path> <output_path>", file=sys.stderr)
            sys.exit(1)

        test_image = sys.argv[2]
        test_output = sys.argv[3]
        fmt = test_output.rsplit(".", 1)[-1].upper() if "." in test_output else "DST"

        if not os.path.exists(test_image):
            print(f"Error: Image not found: {test_image}", file=sys.stderr)
            sys.exit(1)

        # Auto-generate test params by sampling image colors
        img = Image.open(test_image)
        print(f"[TEST] Image: {test_image} ({img.size}, mode={img.mode})", file=sys.stderr)

        test_params = {
            "meta": {"project_name": "Test"},
            "brief": {"content": "Test"},
            "digitization": {
                "regions": [
                    {"name": "Region principal", "stitch_type": "tatami", "density": 5, "angle": 0, "underlay": True, "color_hex": "#000000"},
                ],
                "thread_colors": [{"index": 1, "name": "Negro", "hex": "#000000"}],
                "total_stitches_estimate": 5000,
                "width_mm": 80,
                "height_mm": 80,
            },
            "image_path": test_image,
        }

        try:
            result = generate(test_params, fmt, test_output)
            print(json.dumps({"success": True, "path": result}))
        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"success": False, "error": str(e)}))
            sys.exit(1)
    else:
        # Normal mode: read params from stdin
        if len(sys.argv) < 3:
            print("Usage: python generate_embroidery.py <FORMAT> <output_path>", file=sys.stderr)
            sys.exit(1)

        fmt = sys.argv[1]
        output_path = sys.argv[2]
        raw = sys.stdin.read()
        params = json.loads(raw)

        try:
            result = generate(params, fmt, output_path)
            print(json.dumps({"success": True, "path": result}))
        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"success": False, "error": str(e)}))
            sys.exit(1)
