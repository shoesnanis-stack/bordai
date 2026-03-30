"""
perfiles.py — Fabric profiles for embroidery generation.
Each profile contains all stitch parameters for a specific fabric type.
Values sourced from Wilcom manuals and professional digitizer knowledge.
"""

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class UnderlayConfig:
    """Underlay parameters for a given stitch category on a specific fabric."""
    underlay_type: str          # "center_run", "edge_run", "zigzag_edge_run", "none"
    density: float              # lines per mm for zigzag underlay (2.0-3.0 typical)
    inset_mm: float             # distance from edge to underlay boundary (0.3-0.6mm)


@dataclass
class FabricProfile:
    """All stitch parameters that vary by fabric type."""
    name: str
    description: str

    # Fill density (row spacing in mm — lower = denser)
    fill_density_mm: float          # 0.35-0.55mm range
    fill_stitch_length_mm: float    # length of each fill stitch (3.0-4.0mm)

    # Satin density (percentage — 75% = high quality standard)
    satin_density_pct: float        # 65-80 range

    # Pull/push compensation
    pull_compensation_mm: float     # widen columns by this amount (0.10-0.40mm)
    push_compensation_mm: float     # recorte on open ends (~0.35-0.45mm)

    # Underlay configs per stitch category
    underlay_fill: UnderlayConfig
    underlay_satin: UnderlayConfig

    # Jump/trim thresholds
    trim_threshold_mm: float        # jumps > this get TRIM (3.0mm typical)
    max_stitch_length_mm: float     # longest single stitch before concern (12mm)

    # Tie-in / tie-off
    tie_in_stitches: int            # number of securing stitches (3-4)
    tie_off_stitches: int           # number of locking stitches (3-4)
    tie_stitch_length_mm: float     # length of each tie stitch (1.0mm)

    # Stabilizer recommendation
    stabilizer: str                 # "tear-away", "cut-away", "wash-away"

    # Stitch ordering
    strategy: str                   # "layer_based" (flat) or "concentric" (cap)


# ═══════════════════════════════════════════════════════════════
# PROFILE: SHIRT (algodón, camisa, tela plana estándar)
# ═══════════════════════════════════════════════════════════════
PROFILE_SHIRT = FabricProfile(
    name="shirt",
    description="Camisa / Algodon / Tela plana",
    fill_density_mm=0.40,
    fill_stitch_length_mm=3.5,
    satin_density_pct=75.0,
    pull_compensation_mm=0.20,
    push_compensation_mm=0.40,
    underlay_fill=UnderlayConfig("zigzag_edge_run", 2.5, 0.5),
    underlay_satin=UnderlayConfig("center_run", 2.0, 0.3),
    trim_threshold_mm=3.0,
    max_stitch_length_mm=12.0,
    tie_in_stitches=3,
    tie_off_stitches=3,
    tie_stitch_length_mm=1.0,
    stabilizer="tear-away",
    strategy="layer_based",
)

# ═══════════════════════════════════════════════════════════════
# PROFILE: CAP (gorra estructurada / baseball cap)
# More aggressive pull compensation (curvature adds tension)
# Shorter trim threshold, more tie stitches
# ═══════════════════════════════════════════════════════════════
PROFILE_CAP = FabricProfile(
    name="cap",
    description="Gorra estructurada / Baseball cap",
    fill_density_mm=0.40,
    fill_stitch_length_mm=3.0,
    satin_density_pct=75.0,
    pull_compensation_mm=0.30,
    push_compensation_mm=0.40,
    underlay_fill=UnderlayConfig("zigzag_edge_run", 3.0, 0.4),
    underlay_satin=UnderlayConfig("edge_run", 2.5, 0.3),
    trim_threshold_mm=3.0,
    max_stitch_length_mm=12.0,
    tie_in_stitches=4,
    tie_off_stitches=4,
    tie_stitch_length_mm=1.0,
    stabilizer="cut-away",
    strategy="concentric",
)

# ═══════════════════════════════════════════════════════════════
# PROFILE: JACKET (chamarra, sudadera, tela gruesa)
# Lower pull compensation (rigid fabric)
# ═══════════════════════════════════════════════════════════════
PROFILE_JACKET = FabricProfile(
    name="jacket",
    description="Chamarra / Sudadera / Tela gruesa",
    fill_density_mm=0.45,
    fill_stitch_length_mm=3.5,
    satin_density_pct=75.0,
    pull_compensation_mm=0.15,
    push_compensation_mm=0.35,
    underlay_fill=UnderlayConfig("zigzag_edge_run", 2.0, 0.6),
    underlay_satin=UnderlayConfig("center_run", 2.0, 0.3),
    trim_threshold_mm=3.0,
    max_stitch_length_mm=12.0,
    tie_in_stitches=3,
    tie_off_stitches=3,
    tie_stitch_length_mm=1.0,
    stabilizer="tear-away",
    strategy="layer_based",
)

# ═══════════════════════════════════════════════════════════════
# PROFILE: PATCH (parche, tela densa para patches/emblemas)
# Tightest density for full coverage
# ═══════════════════════════════════════════════════════════════
PROFILE_PATCH = FabricProfile(
    name="patch",
    description="Parche / Emblema",
    fill_density_mm=0.35,
    fill_stitch_length_mm=3.0,
    satin_density_pct=70.0,
    pull_compensation_mm=0.15,
    push_compensation_mm=0.30,
    underlay_fill=UnderlayConfig("edge_run", 2.5, 0.3),
    underlay_satin=UnderlayConfig("center_run", 2.0, 0.2),
    trim_threshold_mm=3.0,
    max_stitch_length_mm=12.0,
    tie_in_stitches=3,
    tie_off_stitches=3,
    tie_stitch_length_mm=1.0,
    stabilizer="cut-away",
    strategy="layer_based",
)

# ═══════════════════════════════════════════════════════════════
# PROFILE: OTHER (generic fallback)
# ═══════════════════════════════════════════════════════════════
PROFILE_OTHER = FabricProfile(
    name="other",
    description="Tela generica",
    fill_density_mm=0.45,
    fill_stitch_length_mm=3.5,
    satin_density_pct=75.0,
    pull_compensation_mm=0.20,
    push_compensation_mm=0.40,
    underlay_fill=UnderlayConfig("zigzag_edge_run", 2.5, 0.5),
    underlay_satin=UnderlayConfig("center_run", 2.0, 0.3),
    trim_threshold_mm=3.0,
    max_stitch_length_mm=12.0,
    tie_in_stitches=3,
    tie_off_stitches=3,
    tie_stitch_length_mm=1.0,
    stabilizer="tear-away",
    strategy="layer_based",
)


PROFILES: Dict[str, FabricProfile] = {
    "shirt": PROFILE_SHIRT,
    "cap": PROFILE_CAP,
    "jacket": PROFILE_JACKET,
    "patch": PROFILE_PATCH,
    "other": PROFILE_OTHER,
}


def get_profile(surface: str) -> FabricProfile:
    """Get fabric profile by surface type. Falls back to 'other'."""
    return PROFILES.get(surface, PROFILE_OTHER)
