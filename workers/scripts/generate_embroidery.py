"""
generate_embroidery.py — v2
Converts a design image into a real embroidery file using pyembroidery + Pillow.
Supports transparent (RGBA) and opaque (RGB) images.
Separates regions by color and respects angle/underlay parameters.

Usage:
  python generate_embroidery.py <FORMAT> <output_path> < params.json
"""

import sys
import json
import math
import urllib.request
import io
import pyembroidery

try:
    from PIL import Image, ImageFilter, ImageOps
    import numpy as np
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    np = None


# ── Image download ─────────────────────────────────────────────────

def download_image(url: str):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BordAI/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        return Image.open(io.BytesIO(data))
    except Exception as e:
        print(f"[WARN] Could not download image: {e}", file=sys.stderr)
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
    """
    img_rgba = np.array(img.convert("RGBA"))
    h, w = img_rgba.shape[:2]
    r, g, b, a = img_rgba[:, :, 0], img_rgba[:, :, 1], img_rgba[:, :, 2], img_rgba[:, :, 3]

    # Strategy 1: Real alpha channel?
    alpha_var = float(np.var(a))
    if alpha_var > 1000:
        print(f"[MASK] Using alpha channel (variance={alpha_var:.0f})", file=sys.stderr)
        mask = a > 30
        # Also exclude near-white opaque pixels (white artifacts)
        brightness = (r.astype(int) + g.astype(int) + b.astype(int)) // 3
        mask = mask & (brightness < 245)
        total = mask.sum()
        if total > 0:
            return _cleanup_mask(mask)

    # Strategy 2: Detect background by edge sampling
    bg_color = detect_background_color(img_rgba)
    print(f"[MASK] Detected background color: RGB({bg_color[0]},{bg_color[1]},{bg_color[2]})", file=sys.stderr)

    # Compute distance from background for each pixel
    rgb = img_rgba[:, :, :3].astype(float)
    bg = bg_color.astype(float).reshape(1, 1, 3)
    dist = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))

    mask = dist > 40  # Pixels far from background are design
    total = mask.sum()
    ratio = total / (h * w)
    print(f"[MASK] Edge-based: {total} pixels ({ratio:.1%})", file=sys.stderr)

    if 0.01 < ratio < 0.95:
        return _cleanup_mask(mask)

    # Strategy 3: Fallback — not near-white AND not near-black (catches most logos)
    print("[MASK] Fallback: brightness-based", file=sys.stderr)
    brightness = (r.astype(int) + g.astype(int) + b.astype(int)) // 3
    mask = (brightness < 230) & (brightness > 15)
    return _cleanup_mask(mask)


def _cleanup_mask(mask: np.ndarray) -> np.ndarray:
    """Morphological cleanup: close small gaps, remove tiny islands."""
    from PIL import Image as PILImage
    # Convert to PIL for filter operations
    mask_img = PILImage.fromarray((mask.astype(np.uint8) * 255))
    # Close gaps (dilate then erode)
    mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
    mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    # Remove islands (erode then dilate)
    mask_img = mask_img.filter(ImageFilter.MinFilter(3))
    mask_img = mask_img.filter(ImageFilter.MaxFilter(3))
    return np.array(mask_img) > 128


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
):
    """Generate embroidery stitches from a boolean mask."""
    if mask.sum() == 0:
        return

    # If angle != 0, rotate the mask, generate horizontal fills, rotate coordinates back
    use_rotation = abs(angle) > 5
    if use_rotation:
        mask_img = Image.fromarray((mask.astype(np.uint8) * 255))
        rotated = mask_img.rotate(-angle, expand=True, fillcolor=0)
        work_mask = np.array(rotated) > 128
        # Compute scale factors for the expanded rotated image
        rh, rw = work_mask.shape
        rad = math.radians(angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
    else:
        work_mask = mask
        rh, rw = mask.shape

    h_orig, w_orig = mask.shape
    W_emb = int(width_mm * 10)  # embroidery units (0.1mm)
    H_emb = int(height_mm * 10)

    def to_emb(px, py, from_w, from_h):
        """Convert pixel coords → embroidery units."""
        return int(px * W_emb / from_w), int(py * H_emb / from_h)

    def rotate_back(ex, ey):
        """Rotate embroidery coordinates back by +angle degrees."""
        if not use_rotation:
            return ex, ey
        # Center of embroidery space
        cx, cy = W_emb / 2, H_emb / 2
        dx, dy = ex - cx, ey - cy
        rx = dx * cos_a - dy * sin_a + cx
        ry = dx * sin_a + dy * cos_a + cy
        return int(rx), int(ry)

    wm_h, wm_w = work_mask.shape
    row_spacing_mm = 1.0 / max(density, 1)
    row_spacing_px = max(1, int(row_spacing_mm * wm_h / height_mm))

    if stitch_type in ("tatami", "fill", "satin"):
        going_right = True
        prev_x, prev_y = None, None

        for py in range(0, wm_h, row_spacing_px):
            row = work_mask[py]
            dark = np.where(row)[0]
            if len(dark) == 0:
                going_right = not going_right
                continue

            x_left, x_right = int(dark[0]), int(dark[-1])
            if x_right - x_left < 2:
                continue

            ex_l, ey = to_emb(x_left, py, wm_w, wm_h)
            ex_r, _ = to_emb(x_right, py, wm_w, wm_h)
            ex_l, ey = rotate_back(ex_l, ey)
            ex_r, _ = rotate_back(ex_r, ey)

            xs = ex_l if going_right else ex_r
            xe = ex_r if going_right else ex_l

            if prev_x is None or abs(xs - prev_x) > 120 or abs(ey - prev_y) > 120:
                pattern.add_command(pyembroidery.JUMP, xs, ey)

            pattern.add_stitch_absolute(pyembroidery.STITCH, xs, ey)
            pattern.add_stitch_absolute(pyembroidery.STITCH, xe, ey)
            prev_x, prev_y = xe, ey
            going_right = not going_right

    elif stitch_type in ("running", "triple"):
        # Find edge pixels
        edge_px = []
        skip = max(1, row_spacing_px // 2)
        for py in range(1, wm_h - 1, skip):
            for px in range(1, wm_w - 1):
                if not work_mask[py][px]:
                    continue
                if not (work_mask[py - 1][px] and work_mask[py + 1][px] and
                        work_mask[py][px - 1] and work_mask[py][px + 1]):
                    edge_px.append((px, py))

        if not edge_px:
            return

        prev_x, prev_y = None, None
        for px, py in sorted(edge_px, key=lambda p: (p[1], p[0])):
            ex, ey = to_emb(px, py, wm_w, wm_h)
            ex, ey = rotate_back(ex, ey)
            if prev_x is None or abs(ex - prev_x) > 150 or abs(ey - prev_y) > 150:
                pattern.add_command(pyembroidery.JUMP, ex, ey)
            pattern.add_stitch_absolute(pyembroidery.STITCH, ex, ey)
            prev_x, prev_y = ex, ey

        if stitch_type == "triple":
            for px, py in sorted(edge_px, key=lambda p: (-p[1], -p[0])):
                ex, ey = to_emb(px, py, wm_w, wm_h)
                ex, ey = rotate_back(ex, ey)
                pattern.add_stitch_absolute(pyembroidery.STITCH, ex, ey)


def generate_underlay(
    mask: np.ndarray,
    pattern: pyembroidery.EmbPattern,
    width_mm: float,
    height_mm: float,
    main_angle: float,
):
    """Low-density perpendicular fill for fabric stabilization."""
    underlay_angle = main_angle + 90
    stitches_from_mask(
        mask, pattern, width_mm, height_mm,
        density=2.0,  # low density
        stitch_type="tatami",
        angle=underlay_angle,
    )


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

    # Add threads
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

    # Download and process image
    img = download_image(image_url) if image_url and HAS_PIL else None

    if img is not None and HAS_PIL:
        print(f"[IMG] Downloaded: {img.size}, mode={img.mode}", file=sys.stderr)

        # Resize for embroidery resolution (~3px per mm for quality)
        scale = 3.0
        target_w = max(80, int(width_mm * scale))
        target_h = max(80, int(height_mm * scale))
        img = img.resize((target_w, target_h), Image.LANCZOS)

        # Preprocess
        img = preprocess_image(img)

        # Build design mask
        full_mask = create_design_mask(img)
        total_px = full_mask.sum()
        print(f"[IMG] Design pixels: {total_px}/{target_w * target_h} ({total_px / (target_w * target_h) * 100:.0f}%)", file=sys.stderr)

        if total_px == 0:
            print("[WARN] Mask is empty — falling back to full image", file=sys.stderr)
            full_mask = np.ones((target_h, target_w), dtype=bool)

        # Create per-color masks if multiple regions
        img_rgba = np.array(img.convert("RGBA"))
        color_masks = create_color_masks(img_rgba, full_mask, regions) if regions else [full_mask]

        # Generate stitches per region
        for i, region in enumerate(regions if regions else [{"stitch_type": "tatami", "density": 5, "angle": 0, "underlay": True}]):
            stitch_type = region.get("stitch_type", "tatami")
            density = float(region.get("density", 5))
            angle = float(region.get("angle", 0))
            underlay = region.get("underlay", True)
            region_mask = color_masks[i] if i < len(color_masks) else full_mask

            if region_mask.sum() == 0:
                print(f"[SKIP] Region '{region.get('name', i)}' has 0 pixels", file=sys.stderr)
                continue

            # Underlay first (perpendicular, low density)
            if underlay and stitch_type not in ("running",):
                print(f"[STITCH] Underlay for '{region.get('name', i)}'", file=sys.stderr)
                generate_underlay(region_mask, pattern, width_mm, height_mm, angle)

            # Main stitches
            print(f"[STITCH] {stitch_type} for '{region.get('name', i)}' angle={angle} density={density}", file=sys.stderr)
            stitches_from_mask(region_mask, pattern, width_mm, height_mm, density, stitch_type, angle)

            # Color change between regions
            if i < len(regions) - 1:
                pattern.add_command(pyembroidery.COLOR_BREAK)

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

    pattern.add_command(pyembroidery.END)
    pyembroidery.write(pattern, output_path)

    # Stats
    stitch_count = sum(1 for s in pattern.stitches if s[2] == pyembroidery.STITCH)
    print(f"[DONE] {stitch_count} stitches, {len(pattern.threadlist)} colors → {output_path}", file=sys.stderr)
    return output_path


if __name__ == "__main__":
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
