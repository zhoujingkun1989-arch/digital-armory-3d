#!/usr/bin/env python3
"""Deterministic 2K Barrett M82A1 / M107 (.50 BMG) PBR material atlas, in public/textures/.

Output stems and size (2048 x 1024):
  - m82a1_body_albedo.png    (sRGB; .webp by default)
  - m82a1_body_normal.png    (linear OpenGL tangent-space RGB)
  - m82a1_body_roughness.png (linear RGB ORM: R=AO, G=roughness, B=metalness)

1:1 World-to-Texel Metrology & UV Layout:
  - Band A (v in [0.68, 0.98]): Stamped sheet-steel Upper Receiver (Manganese-Phosphate Parkerized).
      Left wall (25.50 x 2.50 cm -> u=.04..53, v=.695..970, py/px = 2.862x!): compensated via 5100x500
      world canvas for roll-stamped 'BARRETT FIREARMS MFG. INC. / MURFREESBORO, TN U.S.A. / MODEL 82A1 .50 CAL'
      & 27-MOA Picatinny T4..T24 markings. Right wall (37.30 x 2.50 cm -> u=.56..97, v=.695..970) w/ brass transfer.
  - Band B (v in [0.38, 0.66]):
      * u in [0.02, 0.54]: Sheet-steel Lower Receiver (24.50 x 1.70 cm -> u=.04..52, v=.40..64, py/px = 3.603x!):
        world-circular resistance spot welds + 1:1 crimson 'FIRE' & white 'SAFE' lacquer markings.
      * u in [0.56, 0.98]: 10-Round .50 BMG Ribbed Stamped Steel Magazine (6.10 x 9.05 cm -> u=.575..965,
        v=.39..65, px/py = 4.451x!): 4 CAD-aligned vertical ribs + 1:1 'BARRETT · .50 BMG · 10 RD' skirt stamp.
  - Band C (v in [0.02, 0.35]):
      * u in [0.02, 0.56], v in [0.17, 0.34]: Leupold Mark 4 4.5-14x50mm LR/T scope body (11.40 x 1.80 cm ->
        u=.04..42, v=.18..33, py/px = 1.25x) + 24k gold objective ring (u=.465..482).
      * u in [0.02, 0.56], v in [0.02, 0.16]: Leupold M1 Turret Drum (4.27 x 0.86 cm -> u=.035..545,
        v=.03..155, px/py = 1.644x) w/ crisp white 0..15 MIL vernier graduations.
      * u in [0.58, 0.76], v in [0.03, 0.33]: Multi-coated 50mm objective lens (B=.10, G=.04).
      * u in [0.78, 0.88], v in [0.03, 0.33]: Sorbothane ribbed recoil pad elastomer (B=.02, G=.88).
      * u in [0.89, 0.98], v in [0.03, 0.33]: Brushed stainless steel cross-pins & rails (B=.97, G=.17).
"""

import os
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
    diamond_knurl,
    fbm_noise,
    height_to_normal_png,
    laser_stipple_field,
    load_font,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    worley_cellular,
)

W, H = 2048, 1024
FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


def _paste_world_mask(
    dest: np.ndarray,
    patch_img: Image.Image,
    u0: float,
    u1: float,
    v0: float,
    v1: float,
) -> None:
    """Project an isotropic world-space L-mode canvas into atlas UV box [u0, u1] x [v0, v1]."""
    h, w = dest.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    if x1 <= x0 or y1 <= y0:
        return
    resized = patch_img.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    np.maximum(dest[y0:y1, x0:x1], arr, out=dest[y0:y1, x0:x1])


def _scratch_patch(bounds: tuple[float, float, float, float], **kwargs) -> np.ndarray:
    u0, u1, v0, v1 = bounds
    x0, x1 = round(u0 * W), round(u1 * W)
    y0, y1 = round((1.0 - v1) * H), round((1.0 - v0) * H)
    field = np.zeros((H, W), dtype=np.float32)
    field[y0:y1, x0:x1] = scratch_field(y1 - y0, x1 - x0, **kwargs)
    return field


def _draw_barrett_crest(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Stylized Barrett Firearms swept-wing 'B' shield emblem."""
    lw = max(2, round(r * 0.12))
    shield = [
        (cx - r * 0.85, cy - r * 0.78),
        (cx + r * 0.85, cy - r * 0.78),
        (cx + r * 0.72, cy + r * 0.24),
        (cx, cy + r * 0.88),
        (cx - r * 0.72, cy + r * 0.24),
    ]
    draw.polygon(shield, outline=255, width=lw)
    f_b = load_font(FONT_SANS, max(16, round(r * 1.12)))
    draw.text((cx, cy - r * 0.04), "B", font=f_b, fill=255, anchor="mm")


def _draw_leupold_medallion(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Leupold & Stevens crosshair duplex reticle ring emblem."""
    lw = max(2, round(r * 0.13))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
    for dx0, dy0, dx1, dy1 in (
        (-r, 0, -r * 0.28, 0),
        (r * 0.28, 0, r, 0),
        (0, -r, 0, -r * 0.28),
        (0, r * 0.28, 0, r),
    ):
        draw.line([(cx + dx0, cy + dy0), (cx + dx1, cy + dy1)], fill=255, width=lw)
    f_l = load_font(FONT_SANS, max(12, round(r * 0.78)))
    draw.text((cx + r * 0.34, cy - r * 0.36), "L", font=f_l, fill=255, anchor="mm")


def _save_maps(
    albedo: np.ndarray,
    height: np.ndarray,
    ao: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
) -> None:
    albedo_path = save_rgb_png(albedo, os.path.join(OUT_DIR, "m82a1_body_albedo.png"))
    normal_path = height_to_normal_png(
        height, strength=1.7, out_path=os.path.join(OUT_DIR, "m82a1_body_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, os.path.join(OUT_DIR, "m82a1_body_roughness.png")
    )
    if Path(orm_path).suffix == ".webp":
        orm = np.stack((ao, roughness, metalness), axis=-1)
        orm_rgb = np.clip(np.rint(orm * 255.0), (46, 11, 5), (255, 235, 250)).astype(np.uint8)
        Image.fromarray(orm_rgb, "RGB").save(orm_path, "WEBP", lossless=True, method=4, exact=True)
        dy, dx = np.gradient(height)
        normal = np.stack((-1.7 * dx, 1.7 * dy, np.ones_like(height)), axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        rgb = np.clip(np.rint((normal * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
        Image.fromarray(rgb, "RGB").save(normal_path, "WEBP", lossless=True, method=4, exact=True)
        for p in (albedo_path, normal_path, orm_path):
            Path(p).with_suffix(".png").unlink(missing_ok=True)
    for path in (albedo_path, normal_path, orm_path):
        print(f"[OK] {path} (2048x1024 RGB)")


def build_m82a1_body_suite() -> None:
    u = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))
    v = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))

    def box(u0: float, u1: float, v0: float, v1: float) -> np.ndarray:
        return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)

    def blend(mask, color, rough=None, metal=None):
        weight = np.asarray(mask, dtype=np.float32)
        albedo[:] = albedo * (1.0 - weight[..., None]) + np.asarray(color, dtype=np.float32) * weight[..., None]
        if rough is not None:
            roughness[:] = roughness * (1.0 - weight) + rough * weight
        if metal is not None:
            metalness[:] = metalness * (1.0 - weight) + metal * weight

    f1, cell_edges = worley_cellular(H, W, cells_y=256, cells_x=512, seed=501)
    phosphate = cell_edges - f1
    phosphate -= phosphate.mean()
    grain = np.random.default_rng(502).uniform(-1.0, 1.0, (H, W)).astype(np.float32)
    oil = fbm_noise(H, W, base_freq=5, octaves=5, aniso_x=0.6, aniso_y=2.4, seed=503)
    oil_wet = smoothstep(-0.1, 0.8, oil)

    albedo = np.empty((H, W, 3), dtype=np.float32)
    albedo[:] = (0.248, 0.264, 0.284)
    albedo += (phosphate * 0.025 + grain * 0.0015 - oil_wet * 0.006)[..., None]
    height = phosphate * 0.085 + grain * 0.008
    roughness = 0.44 + phosphate * 0.042 - (oil_wet - 0.4) * 0.042
    metalness = np.full((H, W), 0.56, dtype=np.float32)
    crevice = np.ones((H, W), dtype=np.float32)

    # -------------------------------------------------------------------------
    # BAND A/B: Stamped Sheet-Steel Upper, Lower & .50 BMG 10-Rd Magazine
    # -------------------------------------------------------------------------
    upper = box(0.0, 1.0, 0.68, 0.98)
    lower = box(0.02, 0.54, 0.38, 0.66)
    mag = box(0.56, 0.98, 0.38, 0.66)
    albedo[lower] *= 0.96
    albedo[mag] = (0.226, 0.242, 0.262) + phosphate[mag, None] * 0.023

    fold_proximity = np.maximum(
        np.clip(1.0 - np.abs(v - 0.956) * H / 5.0, 0.0, 1.0),
        np.clip(1.0 - np.abs(v - 0.695) * H / 3.5, 0.0, 1.0),
    ) * upper
    flange_proximity = np.maximum(
        np.clip(1.0 - np.abs(v - 0.640) * H / 3.0, 0.0, 1.0),
        np.clip(1.0 - np.abs(v - 0.400) * H / 3.0, 0.0, 1.0),
    ) * lower
    edge_proximity = np.maximum(fold_proximity, flange_proximity)

    seam = bevel_mask(box(0.025, 0.975, 0.6925, 0.6955), width_px=1, profile="trapezoid")
    height -= seam * 0.12
    crevice *= 1.0 - 0.16 * seam

    # 1:1 WORLD-CIRCULAR resistance spot-weld depressions on sheet-steel lower flange!
    # applyM82LowerUVs maps 24.5 cm -> u_span=0.48 (px=40.12 px/cm) and 1.70 cm -> v_span=0.24 (py=144.56 px/cm)
    # Measuring r_cm directly in world centimeters eliminates the 3.603x horizontal ellipse distortion!
    for wx in (0.08, 0.155, 0.23, 0.305, 0.38, 0.455):
        dx_cm = (u - wx) * (24.5 / 0.48)
        dy_cm = (v - 0.425) * (1.70 / 0.24)
        r_cm = np.hypot(dx_cm, dy_cm)
        bowl = np.clip((0.155 - r_cm) / 0.035, 0.0, 1.0) * lower
        heat_ring = smoothstep(0.14, 0.165, r_cm) * (1.0 - smoothstep(0.195, 0.235, r_cm)) * lower
        height -= 0.46 * bowl
        blend(heat_ring * 0.24, (0.185, 0.194, 0.204))
        roughness += heat_ring * 0.032
        crevice *= 1.0 - 0.19 * bowl

    # Four flat-crowned stamped ribs aligned to CAD rx = [-2.05, -0.70, +0.65, +2.00]
    for rc in (0.640, 0.727, 0.813, 0.900):
        rib = bevel_mask(box(rc - 0.011, rc + 0.011, 0.422, 0.610), width_px=4, profile="trapezoid")
        height += rib * 0.72
        shoulder = 4.0 * rib * (1.0 - rib)
        edge_proximity = np.maximum(edge_proximity, shoulder * 0.92)
        foot = ndimage.maximum_filter(rib, size=3) - rib
        crevice *= 1.0 - foot * 0.22

    handling = _scratch_patch(
        (0.025, 0.975, 0.946, 0.966), count=40, min_len=5, max_len=50, angle_deg=0, angle_spread=7, seed=510
    ) * upper
    handling += _scratch_patch(
        (0.03, 0.96, 0.687, 0.705), count=30, min_len=4, max_len=34, angle_deg=0, angle_spread=10, seed=511
    ) * upper
    insertion = _scratch_patch(
        (0.565, 0.975, 0.60, 0.655), count=62, min_len=9, max_len=58, angle_deg=90, angle_spread=4, seed=512
    ) * mag

    edge_proximity *= smoothstep(-0.04, 0.42, fbm_noise(H, W, base_freq=80, octaves=3, seed=515))
    chips, oxide = chipped_edge_wear(edge_proximity, seed=513, wear_amount=0.40)
    cuts = smoothstep(0.14, 0.58, np.maximum(handling, insertion))
    oxide = np.maximum(oxide, (ndimage.maximum_filter(cuts, size=3) - cuts) * 0.78)
    bare = np.maximum(chips, cuts)
    blend(oxide * 0.72, (0.165, 0.176, 0.188), rough=0.52, metal=0.52)
    blend(bare, (0.60, 0.64, 0.68), rough=0.19, metal=0.96)
    height -= bare * 0.045

    # Brass/copper case impact streaks behind right ejection port
    transfer = _scratch_patch(
        (0.706, 0.766, 0.796, 0.864), count=34, min_len=3, max_len=24, angle_deg=-28, angle_spread=15, seed=514
    )
    impact = np.clip(1.0 - ((u - 0.735) / 0.032) ** 2 - ((v - 0.83) / 0.036) ** 2, 0.0, 1.0)
    copper = smoothstep(0.10, 0.54, transfer) * impact * upper
    blend(copper, (0.68, 0.42, 0.19), rough=0.24, metal=0.96)
    height += copper * 0.016

    # -------------------------------------------------------------------------
    # BAND C (v in [0.02, 0.35]): Leupold Mark 4 Scope, Lens, Buttpad, Stainless
    # -------------------------------------------------------------------------
    scope = box(0.02, 0.56, 0.02, 0.35)
    albedo[scope] = (0.204, 0.218, 0.238) + phosphate[scope, None] * 0.014
    roughness[scope] = 0.38 + phosphate[scope] * 0.025
    metalness[scope] = 0.54
    height[scope] = phosphate[scope] * 0.048 + grain[scope] * 0.004

    gold = box(0.465, 0.482, 0.17, 0.34)
    gold_bevel = bevel_mask(gold, width_px=2, profile="trapezoid")
    albedo[gold] = (0.95, 0.75, 0.30) + grain[gold, None] * 0.005
    roughness[gold], metalness[gold] = 0.15, 0.97
    height += gold_bevel * 0.32
    crevice *= 1.0 - (ndimage.maximum_filter(gold_bevel, size=3) - gold_bevel) * 0.12

    knurl_mask = box(0.02, 0.56, 0.132, 0.156)
    knurl = diamond_knurl(u, v, freq_u=200, freq_v=100)
    knurl_bevel = bevel_mask(knurl_mask, width_px=1.2, profile="trapezoid")
    height += (knurl + 1.0) * 0.28 * knurl_bevel
    roughness[knurl_mask] = 0.44 + phosphate[knurl_mask] * 0.02
    crevice *= 1.0 - knurl_bevel * np.clip(-knurl, 0.0, 1.0) * 0.12

    lens = box(0.58, 0.76, 0.03, 0.33)
    lu, lv = (u - 0.67) / 0.085, (v - 0.18) / 0.145
    radius = np.hypot(lu, lv)
    interference = 0.5 + 0.5 * np.cos(7.5 * radius ** 2 + 0.65 * lv)
    lens_rgb = np.array((0.025, 0.09, 0.22)) + interference[..., None] * np.array((0.018, 0.25, 0.075))
    rim = smoothstep(0.78, 1.30, radius)
    lens_rgb *= 1.0 - 0.66 * rim[..., None]
    arc = 1.0 - smoothstep(0.008, 0.025, np.abs(radius - 0.77))
    arc *= smoothstep(0.12, 0.45, lv) * (1.0 - smoothstep(-0.12, 0.25, lu))
    lens_rgb += arc[..., None] * np.array((0.38, 0.64, 0.65))
    albedo[lens] = lens_rgb[lens]
    roughness[lens], metalness[lens], height[lens] = 0.04, 0.10, 0.0

    pad = box(0.78, 0.88, 0.03, 0.33)
    pores = laser_stipple_field(H, W, cells_y=350, cells_x=700, seed=520)
    albedo[pad] = (0.178, 0.186, 0.198) + pores[pad, None] * 0.010
    height[pad] = pores[pad] * 0.075
    roughness[pad] = 0.84 + grain[pad] * 0.012
    metalness[pad] = 0.02
    for vc in np.arange(0.045, 0.325, 0.018):
        groove = bevel_mask(box(0.78, 0.88, vc - 0.0027, vc + 0.0027), width_px=1.8, profile="trapezoid")
        height -= groove * 0.50
        crevice *= 1.0 - groove * 0.28

    stainless = box(0.89, 0.98, 0.03, 0.33)
    brush = cnc_toolpath(H, W, pitch_px=2.8, angle_deg=0, seed=521)
    albedo[stainless] = (0.74, 0.78, 0.82) + brush[stainless, None] * 0.016
    height[stainless] = brush[stainless] * 0.035 + grain[stainless] * 0.004
    roughness[stainless] = 0.17 + brush[stainless] * 0.009
    metalness[stainless] = 0.97

    # -------------------------------------------------------------------------
    # 1:1 ISOTROPIC WORLD-SPACE BARRETT ROLLMARKS, SELECTORS & LEUPOLD M1 DRUM
    # -------------------------------------------------------------------------
    stamped_mask = np.zeros((H, W), dtype=np.float32)
    etched_mask = np.zeros((H, W), dtype=np.float32)
    fire_mask = np.zeros((H, W), dtype=np.float32)
    safe_mask = np.zeros((H, W), dtype=np.float32)
    logo_mask = np.zeros((H, W), dtype=np.float32)

    # 1) Upper Left Receiver Wall (25.50 x 2.50 cm -> 5100 x 500 px at 200 px/cm, py/px = 2.862x!)
    UW, UH = 5100, 500
    up_st = Image.new("L", (UW, UH), 0)
    up_ls = Image.new("L", (UW, UH), 0)
    ds_u = ImageDraw.Draw(up_st)
    dl_u = ImageDraw.Draw(up_ls)

    _draw_barrett_crest(ds_u, 420, 232, r=104)
    ds_u.text((575, 92), "BARRETT FIREARMS MFG. INC.", font=load_font(FONT_SANS, 92), fill=255)
    ds_u.text((575, 194), "MURFREESBORO, TN   U.S.A.", font=load_font(FONT_SANS, 66), fill=255)
    ds_u.text((575, 280), "MODEL 82A1       .50 CAL", font=load_font(FONT_SANS, 82), fill=255)
    ds_u.text((575, 376), "SN  82A1-04917         CAGE  64872", font=load_font(FONT_COND, 56), fill=245)

    # Left side top 27-MOA Picatinny rail slot numbers (front +X = T24 -> rear -X = T4 + 27 MOA)
    f_rt = load_font(FONT_SANS, 40)
    rail_labels = ("T24", "T20", "T16", "T12", "T8", "T4", "27 MOA")
    for idx, lbl in enumerate(rail_labels):
        xc = int(round((0.12 + idx * 0.125) * UW))
        dl_u.text((xc, 32), lbl, font=f_rt, fill=255, anchor="mm")

    _paste_world_mask(stamped_mask, up_st, 0.04, 0.53, 0.695, 0.970)
    _paste_world_mask(etched_mask, up_ls, 0.04, 0.53, 0.695, 0.970)

    # Right Upper Receiver Wall (37.30 x 2.50 cm -> 3730 x 250 px at 100 px/cm, py/px = 5.00x!)
    # Placed above v=0.82 (y_c <= 130) so top_inner (v in [0.72, 0.80]) stays 100% clean!
    URW, URH = 3730, 250
    up_r_st = Image.new("L", (URW, URH), 0)
    ds_ur = ImageDraw.Draw(up_r_st)
    ds_ur.text((2420, 72), "U.S.  M107  ·  CAL. .50 BMG", font=load_font(FONT_COND, 44), fill=240)
    _paste_world_mask(stamped_mask, up_r_st, 0.56, 0.97, 0.695, 0.970)

    # 2) Lower Left Receiver Wall (24.50 x 1.70 cm -> 4900 x 340 px at 200 px/cm, py/px = 3.603x!)
    # CAD selector at (-2.95, -0.48) -> sLeft = 0.2102 (x_c = 1030), yNorm = 0.5706 (y_c = 146).
    # Keep FIRE / SAFE in x_c in [1160..1620] (u in [0.154..0.199] < 0.28) so right lower stays clean!
    LW, LH = 4900, 340
    lo_st = Image.new("L", (LW, LH), 0)
    lo_fr = Image.new("L", (LW, LH), 0)
    lo_sf = Image.new("L", (LW, LH), 0)
    ds_l = ImageDraw.Draw(lo_st)
    df_l = ImageDraw.Draw(lo_fr)
    dsf_l = ImageDraw.Draw(lo_sf)

    f_sel = load_font(FONT_SANS, 64)
    # 1:1 world-circular crimson & white detent indicator dots (r = 14 px = 0.70 mm true circle!)
    dot_r = 14
    df_l.ellipse((1195 - dot_r, 82 - dot_r, 1195 + dot_r, 82 + dot_r), fill=255)
    df_l.text((1232, 82), "FIRE", font=f_sel, fill=255, anchor="lm")
    dsf_l.ellipse((1195 - dot_r, 206 - dot_r, 1195 + dot_r, 206 + dot_r), fill=255)
    dsf_l.text((1232, 206), "SAFE", font=f_sel, fill=255, anchor="lm")

    ds_l.text((2680, 128), "M82A1 / M107   CAGE 64872", font=load_font(FONT_COND, 56), fill=245, anchor="lm")

    _paste_world_mask(stamped_mask, lo_st, 0.04, 0.52, 0.40, 0.64)
    _paste_world_mask(fire_mask, lo_fr, 0.04, 0.52, 0.40, 0.64)
    _paste_world_mask(safe_mask, lo_sf, 0.04, 0.52, 0.40, 0.64)

    # 3) 10-Round .50 BMG Stamped Steel Magazine Skirt (6.10 x 9.05 cm -> 1830 x 2715 px at 300 px/cm)
    # Compensates 4.451x horizontal stretch (px=130.94 vs py=29.42 px/cm)!
    MW, MH = 1830, 2715
    mag_st = Image.new("L", (MW, MH), 0)
    dm_m = ImageDraw.Draw(mag_st)
    # Below vertical ribs (v < 0.422 -> yNorm < 0.123 -> y_c > 2380)
    dm_m.text(
        (MW // 2, 2535),
        "BARRETT   ·   .50 BMG   ·   10 RD",
        font=load_font(FONT_COND, 92),
        fill=250,
        anchor="mm",
    )
    _paste_world_mask(stamped_mask, mag_st, 0.575, 0.965, 0.39, 0.65)

    # 4) Leupold Mark 4 4.5-14x50mm LR/T Main Tube (11.40 x 1.80 cm -> 2736 x 432 px at 240 px/cm)
    SW, SH = 2736, 432
    sc_logo = Image.new("L", (SW, SH), 0)
    sc_etch = Image.new("L", (SW, SH), 0)
    dlg = ImageDraw.Draw(sc_logo)
    det = ImageDraw.Draw(sc_etch)

    _draw_leupold_medallion(dlg, 170, 146, r=66)
    dlg.text((272, 146), "LEUPOLD   MARK 4   4.5-14×50mm LR/T", font=load_font(FONT_SANS, 78), fill=255, anchor="lm")
    det.text((272, 268), "M1  MIL-DOT   ·   1 CLICK = 0.1 MIL   ·   SN 184920L", font=load_font(FONT_COND, 62), fill=250, anchor="lm")

    _paste_world_mask(logo_mask, sc_logo, 0.04, 0.42, 0.18, 0.33)
    _paste_world_mask(etched_mask, sc_etch, 0.04, 0.42, 0.18, 0.33)

    # 5) Leupold M1 Turret Drum 0..15 MIL Vernier Scale (4.27 x 0.86 cm -> 1708 x 344 px at 400 px/cm)
    # Compensates 1.644x horizontal stretch! Keeps scale below diamond-knurled crown (v=0.132 -> y_c >= 64)
    TW, TH = 1708, 344
    tur_im = Image.new("L", (TW, TH), 0)
    dt = ImageDraw.Draw(tur_im)
    y_base = 318
    x_pad = 36
    span_x = TW - 2 * x_pad
    dt.line([(x_pad, y_base), (TW - x_pad, y_base)], fill=255, width=4)
    f_mil = load_font(FONT_COND, 52)
    for k in range(151):
        xk = round(x_pad + (k / 150.0) * span_x)
        th_px = 68 if k % 10 == 0 else (44 if k % 5 == 0 else 22)
        lw_k = 5 if k % 10 == 0 else 3
        dt.line([(xk, y_base - th_px), (xk, y_base)], fill=255, width=lw_k)
        if k % 10 == 0:
            dt.text((xk, y_base - 102), str(k // 10), font=f_mil, fill=255, anchor="mm")
    dt.text(
        (TW // 2, 112),
        "UP  0..15 MIL   >   1 CLICK = 0.1 MIL",
        font=load_font(FONT_COND, 38),
        fill=240,
        anchor="mm",
    )
    _paste_world_mask(etched_mask, tur_im, 0.035, 0.545, 0.030, 0.155)

    # Composite roll-stamped depressions, dielectric white laser/ink, lacquer, and 24k gold inlay
    stamped = stamped_mask * (upper | lower | mag)
    lip = np.clip(ndimage.maximum_filter(stamped, size=3) - stamped, 0.0, 1.0)
    albedo += (lip * 0.020)[..., None]
    blend(stamped * 0.85, (0.168, 0.180, 0.195))
    height -= stamped * 0.24
    crevice *= 1.0 - stamped * 0.17

    conv_m82 = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.0)) * (~lens)
    albedo += (conv_m82 * 0.026)[..., None]
    roughness -= conv_m82 * 0.046

    # White laser-etched / enamel-filled turret & rail markings: dielectric B = 0.04 (<= 0.05!)
    etched = etched_mask * (upper | scope)
    blend(etched, (0.85, 0.87, 0.88), rough=0.34, metal=0.04)
    height -= etched * 0.055

    # Crimson 'FIRE' & white 'SAFE' selector lacquer: strictly dielectric B = 0.03 (<= 0.05!)
    for mask_arr, col_rgb in ((fire_mask, (0.76, 0.030, 0.045)), (safe_mask, (0.91, 0.92, 0.88))):
        ink = mask_arr * lower
        blend(ink, col_rgb, rough=0.16, metal=0.03)
        height += ink * 0.018

    # Leupold 24k gold-filled medallion & model script: bare noble metal B = 0.97 (>= 0.95!)
    gold_script = logo_mask * scope * (~gold)
    blend(gold_script, (0.86, 0.70, 0.30), rough=0.22, metal=0.97)
    height -= gold_script * 0.04

    ao = np.clip(compute_height_ao(height, strength=1.35) * crevice, 0.18, 1.0)
    ao[lens] = 1.0
    _save_maps(
        np.clip(albedo, 0.0, 1.0),
        height,
        ao,
        np.clip(roughness, 0.04, 0.92),
        np.clip(metalness, 0.02, 0.98),
    )


if __name__ == "__main__":
    build_m82a1_body_suite()
