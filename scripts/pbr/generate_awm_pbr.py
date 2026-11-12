#!/usr/bin/env python3
"""Deterministic 2K Accuracy International AWM / L115A3 (.338 Lapua Magnum) PBR atlas.

Output names and size (2048x1024) in public/textures/:
  - awm_chassis_albedo.png    (sRGB; .webp by default)
  - awm_chassis_normal.png    (linear OpenGL tangent-space RGB)
  - awm_chassis_roughness.png (linear RGB ORM: R=AO, G=roughness, B=metalness)

1:1 World-to-Texel Metrology & UV Layout:
  - Zone A (v >= 0.48): British Olive-Drab (#3f4e35) fiberglass-reinforced polymer thumbhole chassis
      (23.0 x 6.15 cm -> right v=.870..965, left v=.640..735, u=.05..95, px/py = 5.066x!).
      World-isotropic tactile stipple panels mirrored on right (u=.158..302) & left (u=.698..842) grips;
      12 recessed hex-socket showcase fasteners in v=.81..84 / .58..61.
  - Zone B (.12 <= v < .48, u < .67): Manganese-phosphate flat-sided steel action receiver
      (10.05 x 1.75 cm -> left u=.035..340, right u=.365..650, v=.290..445, py/px = 1.46..1.56x)
      with Crown 'BNP' proof stamps + 5-rd .338 LM ribbed steel box magazine
      (6.36 x 4.50 cm -> u=.04..60, v=.140..255, px/py = 6.890x! Compensated via 1908x1350 canvas).
  - Zone C (.12 <= v < .48, u >= .67): Schmidt & Bender PM II 5-25x56 LP/MTC/LT scope body
      (19.8 x 2.30 cm -> u=.69..97, v=.15..29, py/px = 2.152x) & Double-Turn 0..14 MIL turret
      (4.90 x 0.95 cm -> u=.69..97, v=.31..47, py/px = 1.474x).
  - Zone D (v < .12): Rubber (.00..28, B=.02), CNC alloy beam (.28..56, B=.86),
      emerald multi-coated S&B lens (.56..80, B=.10), fluted stainless steel (.80..1.0, B=.98).
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


def _draw_british_bnp_crown(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """British Birmingham/London Proof House St. Edward's Crown over 'BNP' nitro proof stamp."""
    lw = max(2, round(r * 0.11))
    # Crown headband + dual arches + cross pattée
    draw.rectangle((cx - r * 0.58, cy - r * 0.08, cx + r * 0.58, cy + r * 0.06), fill=255)
    draw.arc((cx - r * 0.62, cy - r * 0.58, cx + r * 0.04, cy + r * 0.02), 180, 360, fill=255, width=lw)
    draw.arc((cx - r * 0.04, cy - r * 0.58, cx + r * 0.62, cy + r * 0.02), 180, 360, fill=255, width=lw)
    draw.line([(cx, cy - r * 0.74), (cx, cy - r * 0.42)], fill=255, width=lw)
    draw.line([(cx - r * 0.14, cy - r * 0.62), (cx + r * 0.14, cy - r * 0.62)], fill=255, width=lw)
    f_bnp = load_font(FONT_COND, max(12, round(r * 0.72)))
    draw.text((cx, cy + r * 0.46), "BNP", font=f_bnp, fill=255, anchor="mm")


def _draw_ai_reticle(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Accuracy International precision crosshair/octagon crest."""
    lw = max(2, round(r * 0.12))
    draw.regular_polygon((cx, cy, r), 8, rotation=22.5, outline=255, width=lw)
    draw.ellipse((cx - r * 0.52, cy - r * 0.52, cx + r * 0.52, cy + r * 0.52), outline=255, width=max(1, lw - 1))
    for dx0, dy0, dx1, dy1 in (
        (-r * 1.15, 0, -r * 0.30, 0),
        (r * 0.30, 0, r * 1.15, 0),
        (0, -r * 1.15, 0, -r * 0.30),
        (0, r * 0.30, 0, r * 1.15),
    ):
        draw.line([(cx + dx0, cy + dy0), (cx + dx1, cy + dy1)], fill=255, width=lw)


def _save_maps(
    albedo: np.ndarray,
    height: np.ndarray,
    ao: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
) -> None:
    albedo_path = save_rgb_png(albedo, os.path.join(OUT_DIR, "awm_chassis_albedo.png"))
    normal_path = height_to_normal_png(
        height, strength=1.7, out_path=os.path.join(OUT_DIR, "awm_chassis_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, os.path.join(OUT_DIR, "awm_chassis_roughness.png")
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


def build_awm_chassis_suite() -> None:
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

    polymer_f1, polymer_edges = worley_cellular(H, W, cells_y=260, cells_x=380, seed=601)
    edm = polymer_edges - polymer_f1
    edm -= edm.mean()
    fine = np.random.default_rng(602).uniform(-1.0, 1.0, (H, W)).astype(np.float32)
    fiber = fbm_noise(H, W, base_freq=80, octaves=3, aniso_x=0.2, aniso_y=2.8, seed=603)
    warp = 1.0 - np.abs(2.0 * np.remainder(u * W / 5.2 + fiber * 0.08, 1.0) - 1.0)
    weft = 1.0 - np.abs(2.0 * np.remainder(v * H / 5.2 + fiber * 0.08, 1.0) - 1.0)
    weave = (warp - 0.5) * 0.7 + (weft - 0.5) * 0.3

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.full((H, W), 0.69, dtype=np.float32)
    metalness = np.full((H, W), 0.03, dtype=np.float32)
    crevice = np.ones((H, W), dtype=np.float32)

    # -------------------------------------------------------------------------
    # ZONE A (v >= 0.48): British Olive-Drab Fiberglass-Polymer Thumbhole Skins
    # -------------------------------------------------------------------------
    zone_a = v >= 0.48
    od = np.array((63, 78, 53), dtype=np.float32) / 255.0
    albedo[zone_a] = od + (
        edm[zone_a, None] * 0.026 + fiber[zone_a, None] * 0.003 + weave[zone_a, None] * 0.005
    )
    height[zone_a] = (edm * 0.17 + weave * 0.025 + fine * 0.006)[zone_a]
    roughness[zone_a] = np.clip((0.69 + edm * 0.07 + fiber * 0.012)[zone_a], 0.65, 0.76)

    # World-isotropic tactile stipple (compensating px/py = 5.066x on chassis skins!)
    # Mirrored on Right grip (u=.158..302, v=.76..932) & Left grip (u=.698..842, v=.53..702)
    tactile = laser_stipple_field(H, W, cells_y=520, cells_x=210, seed=604)
    for ua, ub, va, vb in ((0.158, 0.302, 0.76, 0.932), (0.698, 0.842, 0.53, 0.702)):
        panel = bevel_mask(box(ua, ub, va, vb), width_px=3, profile="trapezoid")
        height += panel * (tactile * 0.38 - 0.12)
        blend(panel * 0.08, od * 0.68)
        roughness[:] = roughness * (1.0 - panel) + (0.75 + fine * 0.008) * panel
        crevice *= 1.0 - panel * np.clip(-tactile, 0.0, 1.0) * 0.12

    # Molded forend fuller channels on right (u=.54..94, v=.855) & mirrored left (u=.06..46, v=.625)
    for ua, ub, vc in ((0.54, 0.94, 0.855), (0.06, 0.46, 0.625)):
        groove = bevel_mask(box(ua, ub, vc - 0.010, vc + 0.010), width_px=4, profile="trapezoid")
        height -= groove * 0.52
        crevice *= 1.0 - groove * 0.23
        blend(groove * 0.08, od * 0.78)

    for vc in (0.508, 0.737, 0.969):
        seam = bevel_mask(box(0.04, 0.96, vc - 0.0014, vc + 0.0014), width_px=1, profile="trapezoid")
        height -= seam * 0.16
        crevice *= 1.0 - seam * 0.17

    # 12 recessed hex-socket chassis fasteners in showcase strips (v=.81..84 / .58..61)
    right_bolts_uv = [(0.14, 0.83), (0.31, 0.81), (0.48, 0.84), (0.63, 0.83), (0.77, 0.83), (0.90, 0.83)]
    left_bolts_uv = [(0.10, 0.60), (0.23, 0.60), (0.37, 0.60), (0.52, 0.61), (0.69, 0.58), (0.86, 0.60)]
    for bu, bv in right_bolts_uv + left_bolts_uv:
        dx, dy = (u - bu) * W, (v - bv) * H
        radius = np.hypot(dx, dy)
        counterbore = np.clip((13.0 - radius) / 2.3, 0.0, 1.0)
        cap = 1.0 - smoothstep(8.7, 9.7, radius)
        cap_bevel = np.clip((9.5 - radius) / 1.9, 0.0, 1.0)
        hex_distance = np.maximum(
            np.abs(dx),
            np.maximum(np.abs(0.5 * dx + 0.8660254 * dy), np.abs(-0.5 * dx + 0.8660254 * dy)),
        )
        socket = 1.0 - smoothstep(3.75, 4.45, hex_distance)
        socket_bevel = np.clip((4.3 - hex_distance) / 0.95, 0.0, 1.0)
        height -= counterbore * 1.55
        height += cap_bevel * 0.73
        height -= socket_bevel * 0.88
        blend(cap, (0.215, 0.232, 0.252), rough=0.28, metal=0.58)
        blend(cap * (1.0 - cap_bevel) * 0.28, (0.32, 0.34, 0.36), rough=0.28, metal=0.58)
        blend(socket, (0.115, 0.125, 0.138), rough=0.35, metal=0.58)
        crevice *= 1.0 - counterbore * (1.0 - cap) * 0.61
        crevice *= 1.0 - socket * 0.75

    # -------------------------------------------------------------------------
    # ZONE B (.12 <= v < .48, u < .67): Flat-Sided Steel Action & .338 LM Mag
    # -------------------------------------------------------------------------
    f1, cell_edges = worley_cellular(H, W, cells_y=256, cells_x=512, seed=610)
    phosphate = cell_edges - f1
    phosphate -= phosphate.mean()
    tool = cnc_toolpath(H, W, pitch_px=2.7, angle_deg=0, seed=611)
    zone_b = (v >= 0.12) & (v < 0.48) & (u < 0.67)
    albedo[zone_b] = (0.225, 0.240, 0.260) + (
        phosphate[zone_b, None] * 0.018 + tool[zone_b, None] * 0.004
    )
    height[zone_b] = (phosphate * 0.055 + tool * 0.024)[zone_b]
    roughness[zone_b] = (0.36 + phosphate * 0.036 + tool * 0.007)[zone_b]
    metalness[zone_b] = 0.56

    edge_proximity = np.zeros((H, W), dtype=np.float32)
    for vc in (0.445, 0.288):
        edge_proximity = np.maximum(
            edge_proximity,
            np.clip(1.0 - np.abs(v - vc) * H / 3.5, 0.0, 1.0) * box(0.035, 0.65, 0.28, 0.46),
        )
    for uc in (0.035, 0.34, 0.365, 0.65):
        edge_proximity = np.maximum(
            edge_proximity,
            np.clip(1.0 - np.abs(u - uc) * W / 3.0, 0.0, 1.0) * box(0.02, 0.66, 0.29, 0.445),
        )

    # Six vertical pressed ribs in mid mag body (v=.168..234), leaving clean lower floorplate skirt v=.142..165 for 1:1 stamp!
    for rc in (0.105, 0.191, 0.277, 0.363, 0.449, 0.535):
        rib = bevel_mask(box(rc - 0.008, rc + 0.008, 0.168, 0.234), width_px=3, profile="trapezoid")
        height += rib * 0.46
        edge_proximity = np.maximum(edge_proximity, 4.0 * rib * (1.0 - rib) * 0.90)
        crevice *= 1.0 - (ndimage.maximum_filter(rib, size=3) - rib) * 0.20

    insertion = _scratch_patch(
        (0.04, 0.60, 0.236, 0.258), count=46, min_len=7, max_len=28, angle_deg=90, angle_spread=4, seed=612
    )
    handling = _scratch_patch(
        (0.035, 0.65, 0.435, 0.452), count=25, min_len=4, max_len=34, angle_deg=0, angle_spread=8, seed=613
    )
    edge_proximity *= smoothstep(-0.04, 0.42, fbm_noise(H, W, base_freq=72, octaves=3, seed=615))
    chips, oxide = chipped_edge_wear(edge_proximity, seed=614, wear_amount=0.38)
    scratches = smoothstep(0.15, 0.60, np.maximum(insertion, handling)) * zone_b
    oxide = np.maximum(oxide, (ndimage.maximum_filter(scratches, size=3) - scratches) * 0.72)
    bare = np.maximum(chips, scratches) * zone_b
    blend(oxide * 0.72, (0.168, 0.180, 0.194), rough=0.46, metal=0.52)
    blend(bare, (0.60, 0.64, 0.68), rough=0.19, metal=0.96)
    height -= bare * 0.04

    # -------------------------------------------------------------------------
    # ZONE C (.12 <= v < .48, u >= .67): Schmidt & Bender PM II 5-25x56 Scope
    # -------------------------------------------------------------------------
    zone_c = (v >= 0.12) & (v < 0.48) & (u >= 0.67)
    albedo[zone_c] = (0.198, 0.212, 0.232) + phosphate[zone_c, None] * 0.014
    height[zone_c] = phosphate[zone_c] * 0.045 + fine[zone_c] * 0.004
    roughness[zone_c] = 0.35 + phosphate[zone_c] * 0.024
    metalness[zone_c] = 0.52

    crown = box(0.67, 1.0, 0.435, 0.472)
    knurl = diamond_knurl(u, v, freq_u=220, freq_v=110)
    crown_bevel = bevel_mask(crown, width_px=1.2, profile="trapezoid")
    height += (knurl + 1.0) * 0.27 * crown_bevel
    roughness[crown] = 0.41 + phosphate[crown] * 0.018
    crevice *= 1.0 - crown_bevel * np.clip(-knurl, 0.0, 1.0) * 0.13

    # S&B Double-Turn (DT) yellow second-revolution indicator window (B = 0.03 <= 0.05!)
    bezel = bevel_mask(box(0.698, 0.962, 0.412, 0.432), width_px=2, profile="trapezoid")
    height -= bezel * 0.20
    blend(bezel, (0.145, 0.156, 0.170), rough=0.36, metal=0.52)
    dt_window = box(0.70, 0.96, 0.415, 0.430)
    window_bevel = bevel_mask(dt_window, width_px=1.4, profile="trapezoid")
    blend(window_bevel, (0.86, 0.68, 0.055), rough=0.25, metal=0.03)
    height += window_bevel * 0.08
    crevice *= 1.0 - bezel * (1.0 - window_bevel) * 0.24

    # -------------------------------------------------------------------------
    # ZONE D (v < 0.12): Rubber, CNC Alloy Beam, Multi-Coated Lens, Stainless
    # -------------------------------------------------------------------------
    rubber = (v < 0.12) & (u < 0.28)
    beam = (v < 0.12) & (u >= 0.28) & (u < 0.56)
    lens = (v < 0.12) & (u >= 0.56) & (u < 0.80)
    stainless = (v < 0.12) & (u >= 0.80)

    albedo[rubber] = (0.178, 0.188, 0.202) + tactile[rubber, None] * 0.008
    height[rubber] = tactile[rubber] * 0.07 + fine[rubber] * 0.006
    roughness[rubber], metalness[rubber] = 0.80, 0.02

    albedo[beam] = (0.265, 0.288, 0.316) + tool[beam, None] * 0.009
    height[beam] = tool[beam] * 0.04
    roughness[beam] = 0.32 + tool[beam] * 0.008
    metalness[beam] = 0.66

    lu, lv = (u - 0.68) / 0.12, (v - 0.06) / 0.06
    radius = np.hypot(lu, lv)
    coat_wave = 0.5 + 0.5 * np.cos(7.0 * radius ** 2 + 0.5 * lv)
    lens_rgb = np.array((0.018, 0.11, 0.18)) + coat_wave[..., None] * np.array((0.018, 0.23, 0.10))
    lens_rgb *= 1.0 - 0.62 * smoothstep(0.8, 1.35, radius)[..., None]
    arc = 1.0 - smoothstep(0.012, 0.037, np.abs(radius - 0.78))
    arc *= smoothstep(0.15, 0.5, lv) * (1.0 - smoothstep(-0.12, 0.28, lu))
    lens_rgb += arc[..., None] * np.array((0.35, 0.63, 0.65))
    albedo[lens] = lens_rgb[lens]
    height[lens], roughness[lens], metalness[lens] = 0.0, 0.04, 0.10

    albedo[stainless] = (0.76, 0.80, 0.84) + tool[stainless, None] * 0.015
    height[stainless] = tool[stainless] * 0.032 + fine[stainless] * 0.003
    roughness[stainless] = 0.15 + tool[stainless] * 0.008
    metalness[stainless] = 0.98

    # -------------------------------------------------------------------------
    # 1:1 ISOTROPIC WORLD-SPACE ENGRAVING, BNP PROOFS & S&B PM II MIL TURRETS
    # -------------------------------------------------------------------------
    engraved_mask = np.zeros((H, W), dtype=np.float32)
    ink_mask = np.zeros((H, W), dtype=np.float32)

    # 1) Left & Right Steel Action Receiver Walls (10.05 x 1.75 cm -> 2412 x 420 px at 240 px/cm)
    RW, RH = 2412, 420
    rec_l = Image.new("L", (RW, RH), 0)
    dr_l = ImageDraw.Draw(rec_l)
    _draw_ai_reticle(dr_l, 125, 148, r=66)
    dr_l.text((228, 52), "ACCURACY INTERNATIONAL", font=load_font(FONT_SANS, 92), fill=255)
    dr_l.text((228, 158), "ENGLAND     AW  .338 LM", font=load_font(FONT_SANS, 72), fill=255)
    dr_l.text((228, 252), "L115A3    SN GB 09-4418", font=load_font(FONT_COND, 62), fill=255)
    _draw_british_bnp_crown(dr_l, 2195, 195, r=84)
    _paste_world_mask(engraved_mask, rec_l, 0.035, 0.340, 0.290, 0.445)

    # Right Action Wall: keep x_c <= 1720 (u <= 0.568 < 0.58) & y_c <= 250 (v >= 0.353 > 0.33)
    # so neither action-top fallback (v<=0.33) nor mag-spine fallback (u>=0.58, v<=0.36) ever clips text!
    rec_r = Image.new("L", (RW, RH), 0)
    dr_r = ImageDraw.Draw(rec_r)
    dr_r.text((90, 48), "AI  PORTSMOUTH  UK", font=load_font(FONT_SANS, 82), fill=255)
    dr_r.text((90, 148), "CAL. .338 LAPUA MAGNUM", font=load_font(FONT_COND, 68), fill=255)
    _draw_british_bnp_crown(dr_r, 1560, 138, r=72)
    _paste_world_mask(engraved_mask, rec_r, 0.365, 0.650, 0.290, 0.445)

    # 2) .338 LM 5-Round Steel Magazine Skirt Stamp (6.36 x 4.50 cm -> 1908 x 1350 px at 300 px/cm)
    # Compensates 6.890x horizontal stretch (px=180.32 vs py=26.17 px/cm)!
    MW, MH = 1908, 1350
    mag_im = Image.new("L", (MW, MH), 0)
    dm_mag = ImageDraw.Draw(mag_im)
    # Place in clean lower floorplate skirt v in [0.142, 0.165] below ribs (v=0.168) & clear of insertion scratches!
    dm_mag.text(
        (MW // 2, 1192),
        "AI  ·  .338 LAPUA MAG  ·  5 RD",
        font=load_font(FONT_COND, 96),
        fill=255,
        anchor="mm",
    )
    _paste_world_mask(engraved_mask, mag_im, 0.04, 0.60, 0.140, 0.255)

    # 3) S&B PM II Turret 0..14 MIL Vernier Scale (4.90 x 0.95 cm -> 1960 x 380 px at 400 px/cm)
    # Compensates 1.474x vertical stretch! Keeps graduations inside v in [0.312, 0.408] below DT window (v=0.412)
    TW, TH = 1960, 380
    tur_im = Image.new("L", (TW, TH), 0)
    dt = ImageDraw.Draw(tur_im)
    # Bottom of turret v=0.31 -> y_c=380; DT bezel starts at v=0.412 -> hNorm=(.412-.31)/.16 = 0.6375 -> y_c >= 138
    y_base = 352
    x_pad = 54
    span_x = TW - 2 * x_pad
    dt.line([(x_pad, y_base), (TW - x_pad, y_base)], fill=255, width=4)
    f_mil = load_font(FONT_COND, 52)
    for k in range(141):
        xk = round(x_pad + (k / 140.0) * span_x)
        th_px = 58 if k % 10 == 0 else (38 if k % 5 == 0 else 20)
        lw_k = 5 if k % 10 == 0 else 3
        dt.line([(xk, y_base - th_px), (xk, y_base)], fill=255, width=lw_k)
        if k % 10 == 0:
            dt.text((xk, y_base - 88), str(k // 10), font=f_mil, fill=255, anchor="mm")
    dt.text(
        (TW // 2, 162),
        "1 CLICK = 0.1 MRAD   ·   UP / CCW",
        font=load_font(FONT_COND, 34),
        fill=235,
        anchor="mm",
    )
    _paste_world_mask(ink_mask, tur_im, 0.69, 0.97, 0.31, 0.47)

    # 4) S&B PM II 34mm Main Tube & Magnification Ring (19.80 x 2.30 cm -> 3960 x 460 px at 200 px/cm)
    # Compensates 2.152x vertical stretch!
    SW, SH = 3960, 460
    sc_im = Image.new("L", (SW, SH), 0)
    ds = ImageDraw.Draw(sc_im)
    ds.text((140, 72), "SCHMIDT & BENDER   PM II", font=load_font(FONT_SANS, 92), fill=255)
    ds.text((140, 184), "5-25×56  LP / MTC / LT    MADE IN GERMANY", font=load_font(FONT_COND, 72), fill=245)
    ds.text((140, 292), "5     7     10     12     15     20     25×", font=load_font(FONT_SANS, 78), fill=255)
    _paste_world_mask(ink_mask, sc_im, 0.69, 0.97, 0.15, 0.29)

    # Laser-engraved bright steel receiver/mag rollmarks: bare steel B = 0.95 (>= 0.95!)
    engraved = engraved_mask * zone_b
    blend(engraved, (0.70, 0.73, 0.76), rough=0.34, metal=0.95)
    height -= engraved * 0.14
    crevice *= 1.0 - engraved * 0.12

    # White enamel scope graduations & markings: dielectric ink B = 0.03 (<= 0.05!)
    ink = ink_mask * zone_c
    blend(ink, (0.89, 0.91, 0.89), rough=0.36, metal=0.03)
    height -= ink * 0.045

    conv_awm = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.0)) * (~lens)
    albedo += (conv_awm * 0.024)[..., None]
    roughness -= conv_awm * 0.042

    ao = np.clip(compute_height_ao(height, strength=1.4) * crevice, 0.18, 1.0)
    ao[lens] = 1.0
    _save_maps(
        np.clip(albedo, 0.0, 1.0),
        height,
        ao,
        np.clip(roughness, 0.04, 0.92),
        np.clip(metalness, 0.02, 0.98),
    )


if __name__ == "__main__":
    build_awm_chassis_suite()
