#!/usr/bin/env python3
"""Colt M4A1 Carbine albedo, OpenGL tangent normal and packed linear RGB ORM.

UNCHANGED UV CONTRACT:
  m4a1_receiver_{albedo,normal,roughness}.png (.webp by default): 2048x1024.
    Left lower wall (10.15 x 2.50 cm): U .02..98 (1 - xNorm), V .08..50 (px/py = 1.126x).
    Right lower wall (10.15 x 2.50 cm): U .02..98 (xNorm), V .54..96 (px/py = 1.126x).
    Upper plain anodized body: U .42..62, V .10..26 (kept clean of markings/fences).
    Selectors centered at CAD (-3.35, -0.22) -> (.748,.412)/(.252,.872); UID plate U .695 / V .805.
    Upper MIL-STD-1913 top rail (9.80 x 1.04 cm): U .15..87, V .962..992 (px/pz = 5.094x, z=-0.52 at v=.962).
    Bright steel swatch: U >= .78 / V <= .06.
  m4a1_mag_{albedo,normal,roughness}.png (.webp by default): 1024x1024.
    STANAG curved flanks (2.72 x 8.50 cm): U .08..92, V .04..96 (px/py = 2.853x).
    Five ribs U .22/.36/.50/.64/.78, V .12..69; stop bead V .725; insertion V .73..96.
    Spine resistance spot welds inside U .08..18 / .82..92; Colt CAGE 33710 stamp at V .048..112.

Roughness suffix carries linear RGB ORM: R=AO, G=roughness, B=metalness.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR,
    bevel_mask,
    chipped_edge_wear,
    cnc_toolpath,
    compute_convexity,
    compute_height_ao,
    fbm_noise,
    height_to_normal_png,
    load_font,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    worley_cellular,
)

FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
FONT_ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def _paste_world_mask(
    dest: np.ndarray,
    patch_img: Image.Image,
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    flip_y: bool = False,
) -> None:
    """Project an isotropic world-space L-mode canvas into atlas UV box [u0, u1] x [v0, v1]."""
    h, w = dest.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    if x1 <= x0 or y1 <= y0:
        return
    if flip_y:
        patch_img = patch_img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    resized = patch_img.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    np.maximum(dest[y0:y1, x0:x1], arr, out=dest[y0:y1, x0:x1])


def _uv(w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    return (
        (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w,
        1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h,
    )


def _box(u: np.ndarray, v: np.ndarray, x0: float, x1: float, y0: float, y1: float) -> np.ndarray:
    return ((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)).astype(np.float32)


def _ellipse(
    u: np.ndarray, v: np.ndarray, x: float, y: float, rx: float, ry: float, w: int, h: int
) -> np.ndarray:
    radius = np.sqrt(((u - x) / rx) ** 2 + ((v - y) / ry) ** 2)
    return np.clip((1.0 - radius) * min(rx * w, ry * h) + 0.5, 0.0, 1.0)


def _mix(field: np.ndarray, value, mask: np.ndarray) -> None:
    if field.ndim == 3:
        mask = mask[..., None]
    field *= 1.0 - mask
    field += np.asarray(value, dtype=np.float32) * mask


def _edge(mask: np.ndarray, width: float = 7.0) -> np.ndarray:
    """Distance to an island/feature boundary, measured in atlas pixels."""
    distance = ndimage.distance_transform_edt(np.pad(mask > 0.5, 1))[1:-1, 1:-1]
    return (np.clip(1.0 - (distance - 1.0) / width, 0.0, 1.0) * mask).astype(np.float32)


def _bare(
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    mask: np.ndarray,
    color: tuple[float, float, float],
    rough: float = 0.18,
    metal: float = 0.96,
) -> None:
    _mix(albedo, color, mask)
    _mix(roughness, rough, mask)
    _mix(metalness, metal, mask)
    height -= mask * 0.075


def _save(
    name: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.18) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.05, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
    root = Path(OUT_DIR)
    albedo_path = save_rgb_png(np.clip(albedo, 0.0, 1.0), str(root / f"{name}_albedo.png"))
    normal_path = height_to_normal_png(height, strength=strength, out_path=str(root / f"{name}_normal.png"))
    orm_path = save_orm_png(ao, roughness, metalness, str(root / f"{name}_roughness.png"))
    # Losslessly encode linear normal & packed RGB ORM directly from float32 source
    # arrays so lossy YUV subsampling never cross-contaminates R(AO)/G(rough)/B(metal).
    if Path(orm_path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normals = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
        normals /= np.sqrt(np.sum(normals * normals, axis=-1, keepdims=True) + 1e-8)
        normal_rgb = np.clip(np.rint((normals * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
        orm_rgb = np.clip(
            np.rint(np.stack((ao, roughness, metalness), axis=-1) * 255.0),
            (46, 12, 5),
            (255, 235, 250),
        ).astype(np.uint8)
        Image.fromarray(normal_rgb, "RGB").save(normal_path, "WEBP", lossless=True, method=5, exact=True)
        Image.fromarray(orm_rgb, "RGB").save(orm_path, "WEBP", lossless=True, method=5, exact=True)
        for p in (albedo_path, normal_path, orm_path):
            Path(p).with_suffix(".png").unlink(missing_ok=True)
    print(f"[OK] {name}: {albedo.shape[1]}x{albedo.shape[0]}, albedo / normal / RGB ORM ({Path(orm_path).suffix})")


# Genuine 16x16 ECC200 DataMatrix for CAGE+serial payload "13629W421908"
_UID_MODULES = (
    "1010101010101010",
    "1110100111100001",
    "1000100000001010",
    "1000101100100001",
    "1110100010111110",
    "1101011011100101",
    "1010111101010000",
    "1010101110000111",
    "1101000001010110",
    "1111011111001101",
    "1001001010111000",
    "1110101110111111",
    "1110001110011100",
    "1001000001101101",
    "1000111101101010",
    "1111111111111111",
)


def _draw_colt_rampant_pony(draw: ImageDraw.ImageDraw, x: float, y: float, s: float = 1.0) -> None:
    """Crisp vector Colt Rampant Pony over latitude/longitude globe in world coordinates."""
    # Latitude/longitude globe
    draw.ellipse((x + 8 * s, y + 76 * s, x + 124 * s, y + 136 * s), outline=255, width=max(2, round(3.0 * s)))
    draw.ellipse((x + 34 * s, y + 76 * s, x + 98 * s, y + 136 * s), outline=255, width=max(1, round(2.0 * s)))
    draw.line([(x + 10 * s, y + 106 * s), (x + 122 * s, y + 106 * s)], fill=255, width=max(1, round(2.2 * s)))
    draw.arc((x + 12 * s, y + 88 * s, x + 120 * s, y + 124 * s), 0, 360, fill=255, width=max(1, round(1.8 * s)))
    # Rearing Rampant Pony silhouette + broken lance
    pony = [
        (36, 74), (46, 58), (58, 52), (62, 34), (72, 20),
        (76, 6), (82, 18), (94, 20), (106, 30), (100, 40),
        (86, 38), (78, 52), (84, 64), (96, 62), (104, 46),
        (112, 48), (108, 74), (96, 82), (74, 76), (64, 86),
        (70, 106), (88, 116), (84, 124), (58, 114), (50, 90),
        (40, 96), (34, 116), (18, 124), (14, 116), (26, 106), (28, 84),
    ]
    draw.polygon([(x + px * s, y + py * s) for px, py in pony], fill=255)
    # Flowing tail & lance
    draw.line(
        [(x + 38 * s, y + 66 * s), (x + 22 * s, y + 54 * s), (x + 14 * s, y + 66 * s),
         (x + 20 * s, y + 84 * s), (x + 10 * s, y + 92 * s)],
        fill=255, width=max(2, round(4.0 * s)), joint="curve",
    )
    draw.line([(x + 90 * s, y + 36 * s), (x + 122 * s, y + 48 * s)], fill=255, width=max(2, round(2.6 * s)))
    draw.line([(x + 54 * s, y + 24 * s), (x + 84 * s, y + 34 * s)], fill=255, width=max(2, round(2.4 * s)))


def _draw_ordnance_escudo(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """U.S. Department of Defense Eagle/Stars acceptance cartouche + Colt 'VP' verified proof triangle."""
    # Outer acceptance box
    draw.rectangle((cx - r, cy - r * 0.82, cx + r, cy + r * 0.82), outline=255, width=max(2, round(r * 0.11)))
    # Three stars along top
    for dx in (-r * 0.52, 0.0, r * 0.52):
        draw.regular_polygon((cx + dx, cy - r * 0.44, r * 0.16), 5, rotation=-18, fill=255)
    # Spread eagle wings + shield
    draw.line([(cx - r * 0.72, cy - r * 0.02), (cx, cy + r * 0.14), (cx + r * 0.72, cy - r * 0.02)],
              fill=255, width=max(2, round(r * 0.13)))
    draw.polygon(
        [(cx - r * 0.28, cy + r * 0.04), (cx + r * 0.28, cy + r * 0.04),
         (cx + r * 0.22, cy + r * 0.52), (cx, cy + r * 0.66), (cx - r * 0.22, cy + r * 0.52)],
        fill=255,
    )


def _draw_vp_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Colt 'VP' Verified Proof inverted triangle stamp near front trigger guard lug."""
    pts = [(cx - r, cy - r * 0.72), (cx + r, cy - r * 0.72), (cx, cy + r * 0.95)]
    draw.polygon(pts, outline=255, width=max(2, round(r * 0.16)))
    f_vp = load_font(FONT_COND, max(10, round(r * 0.92)))
    draw.text((cx, cy - r * 0.18), "VP", font=f_vp, fill=255, anchor="mm")


def build_m4a1_receiver_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv(w, h)
    # World-isotropic hardcoat anodize pores (px/py ~ 1.13 on lower walls)
    cells, boundaries = worley_cellular(h, w, 370, 830, seed=401)
    anodize = (0.42 - cells) * 0.80 + (boundaries - 0.17) * 0.25
    dye = fbm_noise(h, w, base_freq=14, octaves=3, seed=402)
    oil = 0.5 + 0.5 * fbm_noise(h, w, base_freq=7, octaves=4, seed=403)

    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (0.240, 0.256, 0.278)
    albedo += (anodize * 0.009 + dye * 0.003 - oil * 0.002)[..., None]
    height = anodize * 0.026
    roughness = 0.39 + anodize * 0.026 - oil * 0.024
    metalness = np.full((h, w), 0.56, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)
    walls = np.maximum(_box(u, v, 0.02, 0.98, 0.08, 0.50), _box(u, v, 0.02, 0.98, 0.54, 0.96))

    # Exact CAD cross-pin & selector CLP seepage hubs (roughness-only, zero normal halo):
    # selector (-3.35, -0.22), trigger (-1.75, -0.32), hammer (-0.35, -0.05),
    # auto-sear (-2.25, +0.11), takedown (-4.95, +0.02), pivot (+3.85, +0.02)
    cad_pins = (
        (-3.35, -0.22, 0.017),
        (-1.75, -0.32, 0.0085),
        (-0.35, -0.05, 0.0085),
        (-2.25, 0.11, 0.0075),
        (-4.95, 0.02, 0.011),
        (3.85, 0.02, 0.011),
    )
    for px_cm, py_cm, rad_u in cad_pins:
        xn = (px_cm + 5.80) / 10.15
        yn = (py_cm + 2.22) / 2.50
        for ux, vy in ((0.02 + (1.0 - xn) * 0.96, 0.08 + yn * 0.42),
                       (0.02 + xn * 0.96, 0.54 + yn * 0.42)):
            # Compensate world circle (px=193.7 px/cm, py=172.0 px/cm)
            dist2 = ((u - ux) * (10.15 / 0.96)) ** 2 + ((v - vy) * (2.50 / 0.42)) ** 2
            rad_cm = rad_u * (10.15 / 0.96)
            hub_oil = np.exp(-dist2 / (rad_cm ** 2)) * (0.68 + oil * 0.32)
            roughness -= hub_oil * 0.072
            albedo -= (hub_oil * 0.003)[..., None]

    # Low mag-catch fence relief on lower walls, strictly outside U .42..62 / V .10..26 (upper body)
    fence = np.maximum(_box(u, v, 0.567, 0.905, 0.610, 0.624), _box(u, v, 0.567, 0.578, 0.610, 0.706))
    fence = np.maximum(
        fence,
        np.maximum(_box(u, v, 0.095, 0.405, 0.150, 0.164), _box(u, v, 0.394, 0.405, 0.150, 0.246)),
    )
    fence_profile = bevel_mask(fence, width_px=3, profile="trapezoid")
    height += fence_profile * 0.24
    cavity *= 1.0 - _edge(fence, 2) * 0.05

    proximity = np.maximum(_edge(walls, 5), _edge(fence, 2) * 0.84)
    proximity *= np.clip(0.58 + 0.58 * fbm_noise(h, w, base_freq=42, octaves=3, seed=410), 0.08, 1.0)
    chips, oxide = chipped_edge_wear(proximity, seed=411, wear_amount=0.58)
    handling = scratch_field(
        h, w, count=90, min_len=16, max_len=56, angle_deg=-18, angle_spread=32, seed=412, mask=walls
    )
    _mix(albedo, (0.312, 0.330, 0.354), handling * 0.28)
    roughness -= handling * 0.068
    height -= handling * 0.022
    _mix(albedo, (0.195, 0.206, 0.218), oxide * 0.34)
    roughness += oxide * 0.045
    _bare(albedo, height, roughness, metalness, chips, (0.68, 0.70, 0.72), rough=0.20, metal=0.96)

    # -------------------------------------------------------------------------
    # 1:1 ISOTROPIC WORLD-SPACE ROLLMARKS & LASER MARKINGS
    # Lower walls: 10.15 x 2.50 cm -> 3045 x 750 px (300 px/cm)
    # -------------------------------------------------------------------------
    PPCM = 300.0
    LW, LH = int(round(10.15 * PPCM)), int(round(2.50 * PPCM))  # 3045 x 750

    engraving = np.zeros((h, w), dtype=np.float32)
    laser = np.zeros((h, w), dtype=np.float32)

    # --- LEFT LOWER WALL: u in [0.02, 0.98] (0 = +X front, LW = -X rear), v in [0.08, 0.50] ---
    left_eng = Image.new("L", (LW, LH), 0)
    left_las = Image.new("L", (LW, LH), 0)
    de_l = ImageDraw.Draw(left_eng)
    dl_l = ImageDraw.Draw(left_las)

    # Colt magwell rollmark block: u ~ 0.068..0.375 (strictly < 0.415 so upper body u=.42..62 stays clean!)
    # On 3045px canvas: x_c in [150..1080], y_c in [85..430]
    mx_c, my_c = 175, 92
    _draw_colt_rampant_pony(de_l, mx_c, my_c, s=1.42)
    _draw_vp_proof(de_l, mx_c + 72, my_c + 242, 22.0)

    tx_c = mx_c + 206
    f_prop = load_font(FONT_SANS, 34)
    f_m4 = load_font(FONT_SANS, 56)
    f_cal = load_font(FONT_SANS, 44)
    f_ser = load_font(FONT_SANS, 44)
    f_addr = load_font(FONT_COND, 30)

    de_l.text((tx_c, my_c - 2), "PROPERTY OF U.S. GOVT.", font=f_prop, fill=255)
    de_l.text((tx_c, my_c + 40), "M4A1  CARBINE", font=f_m4, fill=255)
    de_l.text((tx_c, my_c + 106), "CAL. 5.56 MM.", font=f_cal, fill=255)
    de_l.text((tx_c, my_c + 162), "W 421908", font=f_ser, fill=255)
    de_l.text((mx_c + 118, my_c + 228), "COLT DEFENSE   HARTFORD, CONN.   U.S.A.", font=f_addr, fill=255)

    # U.S. DoD acceptance eagle stamp forward of trigger pin (u ~ 0.34 -> x_c ~ 970, high on receiver y_c ~ 120, v ~ 0.43 > 0.26!)
    # Note v > 0.26 is ALSO above upper's v in [0.10, 0.26], and x_c=970 is u=0.326 < 0.42!
    _draw_ordnance_escudo(de_l, mx_c + 748, my_c + 24, 30.0)

    # Left selector markings centered at CAD (-3.35, -0.22):
    # s_left = 1 - (-3.35 + 5.80)/10.15 = 0.7586 -> x_c = 0.7586 * 3045 = 2310
    # y_norm = (-0.22 + 2.22)/2.50 = 0.800 -> y_c = (1 - 0.800) * 750 = 150 (let's use y_c=164 -> v=0.408..0.416)
    sx_l, sy_l = int(round(0.7584 * LW)), int(round((1.0 - 0.792) * LH))
    arc_r = int(round(0.245 * PPCM))  # 74 px = 2.45 mm radius true circle
    de_l.arc((sx_l - arc_r, sy_l - arc_r, sx_l + arc_r, sy_l + arc_r), 165, 375, fill=255, width=4)
    f_sel = load_font(FONT_SANS, 36)
    dl_l.text((sx_l, sy_l - arc_r - 34), "SEMI", font=f_sel, fill=255, anchor="mm")
    dl_l.text((sx_l + arc_r + 18, sy_l), "SAFE", font=f_sel, fill=255, anchor="lm")
    dl_l.text((sx_l - arc_r - 18, sy_l), "AUTO", font=f_sel, fill=255, anchor="rm")
    # radial witness ticks at 9, 12, 3 o'clock
    for dx0, dy0, dx1, dy1 in (
        (-arc_r - 12, 0, -arc_r - 2, 0),
        (0, -arc_r - 12, 0, -arc_r - 2),
        (arc_r + 2, 0, arc_r + 12, 0),
    ):
        dl_l.line([(sx_l + dx0, sy_l + dy0), (sx_l + dx1, sy_l + dy1)], fill=255, width=4)

    _paste_world_mask(engraving, left_eng, 0.02, 0.98, 0.08, 0.50)
    _paste_world_mask(laser, left_las, 0.02, 0.98, 0.08, 0.50)

    # --- RIGHT LOWER WALL: u in [0.02, 0.98] (0 = -X rear, LW = +X front), v in [0.54, 0.96] ---
    right_eng = Image.new("L", (LW, LH), 0)
    right_las = Image.new("L", (LW, LH), 0)
    de_r = ImageDraw.Draw(right_eng)
    dl_r = ImageDraw.Draw(right_las)

    sx_r, sy_r = int(round(0.2416 * LW)), int(round((1.0 - 0.792) * LH))
    de_r.arc((sx_r - arc_r, sy_r - arc_r, sx_r + arc_r, sy_r + arc_r), 165, 375, fill=255, width=4)
    dl_r.text((sx_r, sy_r - arc_r - 34), "SEMI", font=f_sel, fill=255, anchor="mm")
    dl_r.text((sx_r - arc_r - 18, sy_r), "SAFE", font=f_sel, fill=255, anchor="rm")
    dl_r.text((sx_r + arc_r + 18, sy_r), "AUTO", font=f_sel, fill=255, anchor="lm")
    for dx0, dy0, dx1, dy1 in (
        (-arc_r - 12, 0, -arc_r - 2, 0),
        (0, -arc_r - 12, 0, -arc_r - 2),
        (arc_r + 2, 0, arc_r + 12, 0),
    ):
        dl_r.line([(sx_r + dx0, sy_r + dy0), (sx_r + dx1, sy_r + dy1)], fill=255, width=4)

    # MIL-STD-130 IUID Aluminium DataMatrix Plate at U .695 / V .805:
    # u = 0.695 -> xNorm = (0.695 - 0.02)/0.96 = 0.7031 -> ux_c = 2141
    # v = 0.805 -> yNorm = (0.805 - 0.54)/0.42 = 0.6310 -> uy_c = (1 - 0.6310)*750 = 277
    ux_c, uy_c = int(round(0.7031 * LW)), int(round((1.0 - 0.635) * LH))
    pw_c, ph_c = 456, 168  # 1.52 x 0.56 cm true world plate (stays safely above fence at v=0.706 -> yNorm=0.395 -> y_c=454!)
    dl_r.rounded_rectangle((ux_c, uy_c, ux_c + pw_c, uy_c + ph_c), radius=12, outline=255, width=4)
    # 1:1 world-square 16x16 ECC200 DataMatrix: 16 * 7 = 112x112 world px (3.73 x 3.73 mm square!)
    mod_px = 7
    dm_x0, dm_y0 = ux_c + 26, uy_c + (ph_c - 16 * mod_px) // 2
    for r_idx, row_bits in enumerate(_UID_MODULES):
        for c_idx, bit in enumerate(row_bits):
            if bit == "1":
                x0_m = dm_x0 + c_idx * mod_px
                y0_m = dm_y0 + r_idx * mod_px
                dl_r.rectangle((x0_m, y0_m, x0_m + mod_px - 1, y0_m + mod_px - 1), fill=255)

    f_uid_hd = load_font(FONT_SANS, 33)
    f_uid_sm = load_font(FONT_COND, 29)
    dl_r.text((ux_c + 162, uy_c + 24), "U.S.  M4A1", font=f_uid_hd, fill=255)
    dl_r.text((ux_c + 162, uy_c + 68), "CAGE  13629", font=f_uid_sm, fill=255)
    dl_r.text((ux_c + 162, uy_c + 108), "SER   W421908", font=f_uid_sm, fill=255)

    # Colt 'C' + Cerro Forge Keyhole proof mark at rear upper tang of right lower wall
    de_r.text((int(round(0.105 * LW)), int(round(0.16 * LH))), "C", font=load_font(FONT_SANS, 34), fill=235)

    _paste_world_mask(engraving, right_eng, 0.02, 0.98, 0.54, 0.96)
    _paste_world_mask(laser, right_las, 0.02, 0.98, 0.54, 0.96)

    # --- UPPER MIL-STD-1913 PICATINNY TOP RAIL: u in [0.15, 0.87], v in [0.962, 0.992] ---
    # World span: 9.80 cm (X) x 1.04 cm (Z) -> px/pz = 5.094x!
    # Render on 2940 x 312 world canvas (300 px/cm) and flip_y=True because z=-0.52 (screen UP
    # when stock is left & muzzle is right) maps to v=0.962 and z=+0.52 maps to v=0.992!
    RW, RH = int(round(9.80 * PPCM)), int(round(1.04 * PPCM))  # 2940 x 312
    rail_las = Image.new("L", (RW, RH), 0)
    dl_rail = ImageDraw.Draw(rail_las)
    f_rail = load_font(FONT_SANS, 64)  # 2.1 mm world cap-height -> crystal-clear on 3D rail!
    for i, label in enumerate(("T2", "T4", "T6", "T8", "T10", "T12")):
        u_slot = 0.18 + i * 0.12
        rx_c = int(round(((u_slot - 0.15) / 0.72) * RW))
        dl_rail.text((rx_c, RH // 2), label, font=f_rail, fill=255, anchor="mm")
    _paste_world_mask(laser, rail_las, 0.15, 0.87, 0.962, 0.992, flip_y=True)

    # Apply deep struck rollmarks & crisp dielectric white laser-oxide/enamel (B <= 0.05!)
    height -= bevel_mask(engraving, width_px=1.2, profile="trapezoid") * 0.72
    _mix(albedo, (0.168, 0.180, 0.196), engraving * 0.78)
    _mix(roughness, 0.50, engraving)
    _mix(metalness, 0.52, engraving)
    cavity *= 1.0 - engraving * 0.16

    conv_rec = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.0)) * walls
    albedo += (conv_rec * 0.026)[..., None]
    roughness -= conv_rec * 0.048

    _mix(albedo, (0.84, 0.86, 0.87), laser * 0.96)
    height -= laser * 0.18
    _mix(roughness, 0.38, laser)
    _mix(metalness, 0.04, laser)  # White laser-oxide / enamel filler: strictly <= 0.05 dielectric!
    cavity *= 1.0 - laser * 0.05

    # Bright CNC steel swatch: U >= .78 / V <= .06
    steel = _box(u, v, 0.78, 1.0, 0.0, 0.06)
    _mix(albedo, (0.74, 0.77, 0.80), steel)
    _mix(roughness, 0.21, steel)
    _mix(metalness, 0.96, steel)
    _mix(height, cnc_toolpath(h, w, pitch_px=3.4, angle_deg=0, seed=419) * 0.026, steel)
    _mix(cavity, 1.0, steel)

    _save("m4a1_receiver", albedo, height, roughness, metalness, cavity, 2.4)


def build_m4a1_mag_suite() -> None:
    w, h = 1024, 1024
    u, v = _uv(w, h)
    # World-isotropic Perma-Slik G dry-film moly crystals (px/py = 2.853x on curved mag flanks)
    cells, edges = worley_cellular(h, w, 240, 680, seed=409)
    crystals = (0.42 - cells) * 0.70 + (edges - 0.17) * 0.35
    film = fbm_noise(h, w, base_freq=18, octaves=3, aniso_x=2.4, aniso_y=1.0, seed=420)

    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (0.390, 0.405, 0.420)
    albedo += (crystals * 0.012 + film * 0.006)[..., None]
    height = crystals * 0.034
    roughness = 0.46 + crystals * 0.036 + film * 0.016
    metalness = np.full((h, w), 0.62, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)

    # Five flat-topped stamped ribs at exact UV centers .22/.36/.50/.64/.78, V .12..69
    rib_masks = np.zeros((h, w), dtype=np.float32)
    for x in (0.22, 0.36, 0.50, 0.64, 0.78):
        rib_masks = np.maximum(rib_masks, _box(u, v, x - 0.022, x + 0.022, 0.12, 0.69))
    ribs = bevel_mask(rib_masks, width_px=5, profile="trapezoid")
    height += ribs * 0.88
    roughness -= ribs * 0.035

    bead_mask = _box(u, v, 0.10, 0.90, 0.713, 0.737)
    bead = bevel_mask(bead_mask, width_px=4, profile="trapezoid")
    height += bead * 0.66

    contact = np.maximum(_edge(rib_masks, 3) * 0.92, _edge(bead_mask, 3))
    contact = np.maximum(contact, _edge(_box(u, v, 0.08, 0.92, 0.045, 0.96), 5))

    # World-circular resistance spot welds along front & rear spines (compensated for px/py = 2.853x!)
    rx_weld = 0.0255  # 0.083 cm in U (316.2 px/cm)
    ry_weld = 0.0090  # 0.083 cm in V (110.8 px/cm) -> 1:1 circular spot welds in 3D!
    for y in (0.18, 0.30, 0.42, 0.54, 0.66, 0.80):
        for x in (0.118, 0.882):
            spot = _ellipse(u, v, x, y, rx_weld, ry_weld, w, h)
            height -= bevel_mask(spot, width_px=3, profile="round") * 0.38
            r_world = np.sqrt(((u - x) / rx_weld) ** 2 + ((v - y) / ry_weld) ** 2)
            temper = smoothstep(0.88, 1.08, r_world) * (1.0 - smoothstep(1.16, 1.58, r_world))
            _mix(albedo, (0.355, 0.338, 0.312), temper * 0.24)
            cavity *= 1.0 - spot * 0.10

    insertion = _box(u, v, 0.08, 0.92, 0.73, 0.96)
    scuffs = scratch_field(
        h, w, count=440, min_len=28, max_len=185, angle_deg=90, angle_spread=3.5, seed=424, mask=insertion
    )
    burnish = insertion * (0.5 + 0.5 * fbm_noise(h, w, base_freq=26, octaves=3, seed=425))
    roughness -= burnish * 0.055
    contact *= np.clip(0.60 + 0.56 * fbm_noise(h, w, base_freq=33, octaves=3, seed=423), 0.10, 1.0)
    chips, oxide = chipped_edge_wear(contact, seed=426, wear_amount=0.64)
    cuts = smoothstep(0.22, 0.62, scuffs)
    oxide = np.maximum(oxide, np.clip(ndimage.maximum_filter(cuts, size=3) - cuts, 0.0, 1.0) * 0.30)
    _mix(albedo, (0.300, 0.312, 0.325), oxide * 0.40)
    roughness += oxide * 0.045
    _bare(
        albedo, height, roughness, metalness, np.maximum(chips, cuts),
        (0.71, 0.73, 0.75), rough=0.20, metal=0.96,
    )

    conv_mag = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.2))
    albedo += (conv_mag * 0.028)[..., None]
    roughness -= conv_mag * 0.048

    # 1:1 Isotropic World-Space USGI Colt CAGE 33710 Skirt Rollmark (2.72 x 8.50 cm -> 816 x 2550 px)
    MW, MH = 816, 2550
    mag_stamp = Image.new("L", (MW, MH), 0)
    dm = ImageDraw.Draw(mag_stamp)
    f_cage = load_font(FONT_COND, 56)
    f_mfg = load_font(FONT_COND, 40)
    # Place at bottom skirt v in [0.050, 0.112] -> yNorm in [0.011, 0.078] -> y_c near bottom of 2550px canvas
    dm.text((MW // 2, int(round(MH * 0.936))), "5.56 MM   NATO   CAGE 33710", font=f_cage, fill=255, anchor="mm")
    dm.text(
        (MW // 2, int(round(MH * 0.968))),
        "COLT'S MFG. CO. INC.   HARTFORD, CT  U.S.A.",
        font=f_mfg,
        fill=240,
        anchor="mm",
    )
    lettering = np.zeros((h, w), dtype=np.float32)
    _paste_world_mask(lettering, mag_stamp, 0.08, 0.92, 0.04, 0.96)

    height -= bevel_mask(lettering, width_px=1.2, profile="trapezoid") * 0.56
    _mix(albedo, (0.285, 0.300, 0.316), lettering * 0.68)
    roughness += lettering * 0.045
    cavity *= 1.0 - lettering * 0.16

    _save("m4a1_mag", albedo, height, roughness, metalness, cavity, 2.2)


if __name__ == "__main__":
    build_m4a1_receiver_suite()
    build_m4a1_mag_suite()
