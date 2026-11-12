#!/usr/bin/env python3
"""FN SCAR-L Mk 16 Mod 0: deterministic 2K '50 Shades of FDE' PBR atlas.

Output stems and UV island contracts:
  scar_fde_{albedo,normal,roughness}.png (2048x2048; .webp by default).
  Albedo: sRGB. Normal: OpenGL tangent space. Roughness: LINEAR RGB ORM (R=AO, G=rough, B=metal).
  Band A (v >= .68): Extruded FDE 7075-T6 monolithic upper (20.0 x 2.98 cm -> u=.02..98,
    left v=.842..987, right v=.692..837, px/py = 0.986 ~ 1:1; top plain u=.04..46, v=.855..890).
  Band B (.40 <= v < .68): Coyote polymer lower (10.60 x 2.73 cm -> left u=.02..49,
    right u=.51..98, v=.41..66, py/px = 2.065x! Compensated via 2120x546 world canvas).
  Band C (.11 <= v < .40, u < .53): Ugg-boot stock (u < .33), cheek riser (.33 <= u < .53, v >= .25),
    and diamond-checkered pistol grip (.33 <= u < .53, v < .25).
  Band D (.11 <= v < .40, u >= .53): Tan dry-film STANAG magazine (3.60 x 10.15 cm ->
    u=.58..94, v=.125..390, px/py = 3.830x! Compensated via 1080x3045 world canvas).
  Band E (v < .11): Utility swatches — rubber u < .34, nitride .34 <= u < .67, bright steel u >= .67.
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
    load_font,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    smoothstep,
    spectral_noise,
    worley_cellular,
)

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


def _edge_proximity(mask: np.ndarray, width: float = 5.0) -> np.ndarray:
    distance = ndimage.distance_transform_edt(mask).astype(np.float32)
    return (1.0 - smoothstep(0.8, width, distance)) * mask


def _draw_belgian_liege_perron(draw: ImageDraw.ImageDraw, cx: float, cy: float, h_px: float) -> None:
    """Authentic Belgian Proof House of Liège 'Perron' stepped column + 'L / CIP' proof marks."""
    lw = max(2, round(h_px * 0.08))
    # 3-step pedestal base
    for step, frac in enumerate((0.46, 0.34, 0.24)):
        y_s = cy + h_px * (0.44 - step * 0.11)
        draw.line([(cx - h_px * frac, y_s), (cx + h_px * frac, y_s)], fill=255, width=lw)
    # Central Perron column + pine-cone orb & cross at apex
    draw.line([(cx, cy + h_px * 0.22), (cx, cy - h_px * 0.26)], fill=255, width=max(2, round(lw * 1.25)))
    r_orb = h_px * 0.10
    draw.ellipse((cx - r_orb, cy - h_px * 0.38, cx + r_orb, cy - h_px * 0.18), outline=255, width=lw)
    draw.line([(cx, cy - h_px * 0.50), (cx, cy - h_px * 0.36)], fill=255, width=lw)
    draw.line([(cx - h_px * 0.09, cy - h_px * 0.44), (cx + h_px * 0.09, cy - h_px * 0.44)], fill=255, width=lw)
    # Flanking 'C I P' / 'P V' proof letters
    f_p = load_font(FONT_COND, max(12, round(h_px * 0.34)))
    draw.text((cx + h_px * 0.58, cy - h_px * 0.16), "CIP", font=f_p, fill=255, anchor="lm")
    draw.text((cx + h_px * 0.58, cy + h_px * 0.22), "PV", font=f_p, fill=255, anchor="lm")


def _draw_uid(draw: ImageDraw.ImageDraw, x: int, y: int, mod_px: int) -> None:
    """Draw fixed LC-28419 serial's 18x18 ECC200 DataMatrix with exact square modules."""
    rows = (
        "101010101010101010",
        "110010001000000101",
        "101111011101111110",
        "111011110010101111",
        "100010101010101100",
        "101101101100011111",
        "110101110010111110",
        "110010110111111101",
        "110100001001000010",
        "110101110100110101",
        "100000110111011000",
        "100110100011000111",
        "110101010110100110",
        "101100011111011111",
        "100101101001001010",
        "100110101011100101",
        "110000011010000100",
        "111111111111111111",
    )
    for r, row in enumerate(rows):
        for c, bit in enumerate(row):
            if bit == "1":
                px0, py0 = x + c * mod_px, y + r * mod_px
                draw.rectangle((px0, py0, px0 + mod_px - 1, py0 + mod_px - 1), fill=255)


def _save_suite(
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.35) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.04, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError("SCAR material contains non-finite samples")
    paths = [save_rgb_png(albedo, os.path.join(OUT_DIR, "scar_fde_albedo.png"))]
    normal_path = height_to_normal_png(
        height, strength=2.2, out_path=os.path.join(OUT_DIR, "scar_fde_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, out_path=os.path.join(OUT_DIR, "scar_fde_roughness.png")
    )
    if Path(orm_path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normal = np.stack((-dx * 2.2, dy * 2.2, np.ones_like(height)), axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        orm_rgb = np.clip(
            np.rint(np.stack((ao, roughness, metalness), axis=-1) * 255.0),
            (46, 11, 5),
            (255, 235, 250),
        ).astype(np.uint8)
        maps = (
            (np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8), normal_path),
            (orm_rgb, orm_path),
        )
        for data, path in maps:
            Image.fromarray(data, "RGB").save(path, "WEBP", lossless=True, method=4, exact=True)
    paths.extend((normal_path, orm_path))
    for path in paths:
        if Path(path).suffix == ".webp":
            Path(path).with_suffix(".png").unlink(missing_ok=True)
    print("[OK] SCAR 2048x2048 albedo / OpenGL normal / RGB ORM:", *paths, sep="\n  ")


def build_scar_fde_suite() -> None:
    W, H = 2048, 2048
    v = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))
    u = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))

    def rect(u0: float, u1: float, v0: float, v1: float) -> np.ndarray:
        return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)

    grain = np.clip(spectral_noise(H, W, 340, 740, seed=1601), -2.5, 2.5)
    tool = cnc_toolpath(H, W, pitch_px=3.7, angle_deg=0, seed=1602)
    pores, cells = worley_cellular(H, W, 510, 510, seed=1603)
    anodize = (0.43 - pores) * 1.5 + (cells - 0.18) * 0.35
    pebble, edges = worley_cellular(H, W, 325, 325, seed=1604)
    leather = np.clip((0.42 - pebble) * 1.8 + (edges - 0.18) * 0.6, -1.0, 1.0)
    oil = fbm_noise(H, W, base_freq=7, octaves=4, seed=1605)

    albedo = np.zeros((H, W, 3), np.float32)
    height = np.zeros((H, W), np.float32)
    roughness = np.full((H, W), 0.55, np.float32)
    metalness = np.full((H, W), 0.03, np.float32)
    cavity = np.ones((H, W), np.float32)

    def coat(mask, rgb, rough, metal, relief, variation):
        albedo[mask] = np.asarray(rgb, np.float32) / 255.0 + variation[mask, None]
        height[mask] = relief[mask]
        roughness[mask], metalness[mask] = rough, metal

    def expose(mask, rgb, rough, metal):
        a = np.clip(mask, 0.0, 1.0)
        albedo[:] = albedo * (1.0 - a[..., None]) + np.asarray(rgb, np.float32) * a[..., None]
        roughness[:] = roughness * (1.0 - a) + rough * a
        metalness[:] = metalness * (1.0 - a) + metal * a

    # -------------------------------------------------------------------------
    # BAND A (v >= 0.68): Extruded 7075-T6 FDE Hardcoat Anodized Monolithic Upper
    # -------------------------------------------------------------------------
    upper = v >= 0.68
    coat(
        upper,
        (171, 143, 102),
        0.31,
        0.62,
        anodize * 0.026 + grain * 0.008 + tool * 0.014,
        anodize * 0.005 + tool * 0.003 + oil * 0.002,
    )
    roughness[upper] += (anodize * 0.016 + grain * 0.004 - oil * 0.022)[upper]

    flutes = np.zeros((H, W), np.float32)
    for center in (0.902, 0.752):
        flutes = np.maximum(
            flutes, bevel_mask(rect(0.08, 0.92, center - 0.0045, center + 0.0045), 3, profile="trapezoid")
        )
    height -= flutes * 0.48
    albedo -= flutes[..., None] * 0.009
    cavity *= 1.0 - flutes * 0.045

    rails = (v >= 0.975) | ((v >= 0.822) & (v <= 0.836))
    albedo[rails] *= 0.86
    roughness[rails] = 0.34 + grain[rails] * 0.005

    walls = rect(0.02, 0.98, 0.842, 0.987) | rect(0.02, 0.98, 0.692, 0.837)
    edge = np.maximum(_edge_proximity(walls, 6), _edge_proximity(rails, 5))
    port = rect(0.355, 0.60, 0.722, 0.784)
    port_lip = ndimage.binary_dilation(port, iterations=3) & ~port
    corner_u = np.minimum(np.abs(u - 0.355), np.abs(u - 0.60)) * W
    corner_v = np.minimum(np.abs(v - 0.722), np.abs(v - 0.784)) * H
    corners = 1.0 - smoothstep(4, 23, np.maximum(corner_u, corner_v))
    edge = np.maximum(edge, port_lip * corners * 0.96) * upper
    edge *= smoothstep(-0.02, 0.40, fbm_noise(H, W, base_freq=92, octaves=3, seed=1609))
    bare, oxide = chipped_edge_wear(edge, seed=1610, wear_amount=0.54)
    scratches = scratch_field(
        H, W, count=300, min_len=6, max_len=55, angle_deg=-8, angle_spread=24, seed=1611, mask=upper
    )
    wear = np.maximum(bare, smoothstep(0.42, 0.84, scratches) * 0.76)
    albedo -= oxide[..., None] * np.array([0.022, 0.018, 0.010], np.float32)
    expose(wear, (0.64, 0.67, 0.70), 0.18, 0.96)
    height -= wear * 0.045 + scratches * 0.025

    # Brass deflector case-kiss marks behind right ejection port (u=.30..35, v=.73..77)
    x0, x1 = int(0.30 * W), int(0.35 * W)
    y0, y1 = int((1.0 - 0.77) * H), int((1.0 - 0.73) * H)
    kiss = np.zeros((H, W), np.float32)
    kiss[y0:y1, x0:x1] = scratch_field(
        y1 - y0, x1 - x0, count=19, min_len=7, max_len=34, angle_deg=-32, angle_spread=21, seed=1612
    )
    kiss *= rect(0.30, 0.35, 0.73, 0.77)
    expose(kiss * 0.78, (0.68, 0.51, 0.24), 0.22, 0.96)
    height += kiss * 0.018

    # -------------------------------------------------------------------------
    # BAND B (0.40 <= v < 0.68): VDI-3400 EDM Coyote Polymer Lower Receiver
    # -------------------------------------------------------------------------
    lower = (v >= 0.40) & (v < 0.68)
    coat(
        lower,
        (143, 118, 84),
        0.70,
        0.03,
        leather * 0.105 + grain * 0.011,
        leather * 0.010 + grain * 0.0015,
    )
    roughness[lower] += (leather * 0.027 + grain * 0.004)[lower]
    fence_mask = rect(0.05, 0.23, 0.489, 0.501) | rect(0.77, 0.95, 0.489, 0.501)
    fence = bevel_mask(fence_mask, 3, profile="trapezoid")
    height += fence * 0.65
    albedo += fence[..., None] * 0.006
    seam = rect(0.03, 0.97, 0.652, 0.653) * lower
    height += seam * 0.14
    cavity *= 1.0 - seam * 0.045

    # -------------------------------------------------------------------------
    # BAND C (0.11 <= v < 0.40, u < 0.53): Ugg-Boot Stock, Cheek Riser & Grip
    # -------------------------------------------------------------------------
    stock = (v >= 0.11) & (v < 0.40) & (u < 0.33)
    riser = (v >= 0.25) & (v < 0.40) & (u >= 0.33) & (u < 0.53)
    grip = (v >= 0.11) & (v < 0.25) & (u >= 0.33) & (u < 0.53)
    for mask, color, rough, amplitude in (
        (stock, (157, 131, 91), 0.64, 0.10),
        (riser, (173, 147, 108), 0.58, 0.07),
        (grip, (132, 108, 75), 0.78, 0.10),
    ):
        coat(
            mask, color, rough, 0.03,
            leather * amplitude + grain * 0.01,
            leather * 0.008 + grain * 0.001,
        )
        roughness[mask] += leather[mask] * 0.018
    for bounds in ((0.035, 0.295, 0.162, 0.335), (0.35, 0.51, 0.273, 0.379)):
        panel = bevel_mask(rect(*bounds), 4, profile="trapezoid")
        height -= panel * 0.20
        albedo -= panel[..., None] * 0.005
        cavity *= 1.0 - panel * 0.025
    hinge = bevel_mask(rect(0.292, 0.315, 0.145, 0.36), 3, profile="trapezoid")
    height += hinge * 0.30
    checkering = diamond_knurl(u, v, freq_u=124, freq_v=124)
    grip_panel = bevel_mask(rect(0.344, 0.516, 0.122, 0.238), 5, profile="trapezoid")
    height += grip_panel * (checkering + 0.25) * 0.52
    albedo += (grip_panel * checkering * 0.012)[..., None]
    cavity *= 1.0 - grip_panel * np.maximum(-checkering, 0.0) * 0.12

    # -------------------------------------------------------------------------
    # BAND D (0.11 <= v < 0.40, u >= 0.53): FDE Dry-Film STANAG 30-Rd Magazine
    # -------------------------------------------------------------------------
    magazine = (v >= 0.11) & (v < 0.40) & (u >= 0.53)
    coat(
        magazine,
        (166, 139, 98),
        0.44,
        0.60,
        anodize * 0.032 + tool * 0.012,
        anodize * 0.006 + tool * 0.002,
    )
    roughness[magazine] += (anodize * 0.02 + grain * 0.004)[magazine]
    rib_mask = np.zeros((H, W), bool)
    for rv in (0.165, 0.215, 0.265, 0.315):
        rib_mask |= rect(0.58, 0.94, rv - 0.0085, rv + 0.0085)
    ribs = bevel_mask(rib_mask, 4, profile="trapezoid")
    height += ribs * 1.12
    albedo += ribs[..., None] * 0.008
    roughness -= ribs * 0.025
    cavity *= 1.0 - _edge_proximity(rib_mask, 5) * 0.055

    insertion = rect(0.55, 0.96, 0.355, 0.398) * magazine
    x0, x1 = int(0.55 * W), int(0.96 * W)
    y0, y1 = int((1.0 - 0.398) * H), int((1.0 - 0.355) * H)
    insert_scratches = np.zeros((H, W), np.float32)
    insert_scratches[y0:y1, x0:x1] = scratch_field(
        y1 - y0, x1 - x0, count=90, min_len=9, max_len=74, angle_deg=90, angle_spread=5, seed=1620
    )
    insert_scratches *= insertion
    mag_edge = np.maximum(
        _edge_proximity(rect(0.55, 0.96, 0.12, 0.395), 6),
        _edge_proximity(rib_mask, 4) * 0.90,
    ) * magazine
    mag_edge *= smoothstep(0.0, 0.42, fbm_noise(H, W, base_freq=110, octaves=3, seed=1622))
    mag_bare, mag_oxide = chipped_edge_wear(mag_edge, seed=1621, wear_amount=0.50)
    mag_wear = np.maximum(mag_bare, smoothstep(0.24, 0.80, insert_scratches))
    albedo -= mag_oxide[..., None] * 0.017
    expose(mag_wear, (0.55, 0.58, 0.61), 0.21, 0.96)
    height -= mag_wear * 0.055 + insert_scratches * 0.035

    # -------------------------------------------------------------------------
    # BAND E (v < 0.11): Utility Swatches — Rubber, Nitride Steel, Bright Steel
    # -------------------------------------------------------------------------
    rubber = (v < 0.11) & (u < 0.34)
    nitride = (v < 0.11) & (u >= 0.34) & (u < 0.67)
    steel = (v < 0.11) & (u >= 0.67)
    coat(rubber, (46, 50, 56), 0.82, 0.02, leather * 0.11, leather * 0.006)
    coat(nitride, (58, 64, 72), 0.31, 0.58, anodize * 0.03 + tool * 0.009, anodize * 0.005)
    coat(steel, (204, 214, 227), 0.16, 0.97, tool * 0.013, tool * 0.006)
    cavity[v < 0.11] = 1.0

    # -------------------------------------------------------------------------
    # 1:1 ISOTROPIC WORLD-SPACE ROLLMARKS, CIP PROOFS, SELECTORS & T-NUMBERS
    # -------------------------------------------------------------------------
    engrave_mask = np.zeros((H, W), dtype=np.float32)
    laser_mask = np.zeros((H, W), dtype=np.float32)
    black_mask = np.zeros((H, W), dtype=np.float32)
    red_mask = np.zeros((H, W), dtype=np.float32)

    # 1) Upper Left & Right Walls (20.0 x 2.98 cm -> 4000 x 596 px at 200 px/cm)
    UW, UH = 4000, 596
    up_l_eng = Image.new("L", (UW, UH), 0)
    up_l_las = Image.new("L", (UW, UH), 0)
    de_ul = ImageDraw.Draw(up_l_eng)
    dl_ul = ImageDraw.Draw(up_l_las)

    # Keep u >= 0.50 (x_c >= 2000) so 'top' mode (u in [0.04, 0.46]) stays 100% clean!
    ux0, uy0 = 2020, 172
    # FN Herstal oval cartouche
    de_ul.ellipse((ux0, uy0 + 4, ux0 + 186, uy0 + 108), outline=255, width=6)
    de_ul.text((ux0 + 93, uy0 + 56), "FN", font=load_font(FONT_SANS, 70), fill=255, anchor="mm")
    # 1:1 world-square 18x18 ECC200 DataMatrix (18 * 5 = 90 x 90 px = 4.5 x 4.5 mm!)
    _draw_uid(de_ul, ux0 + 48, uy0 + 132, mod_px=5)

    f_fn_hd = load_font(FONT_SANS, 68)
    f_fn_md = load_font(FONT_SANS, 52)
    de_ul.text((ux0 + 224, uy0 - 4), "FN HERSTAL BELGIUM", font=f_fn_hd, fill=255)
    de_ul.text((ux0 + 224, uy0 + 76), "SCAR-L   CAL. 5.56MM", font=f_fn_hd, fill=255)
    de_ul.text((ux0 + 224, uy0 + 158), "MK 16 MOD 0     SN  LC-28419", font=f_fn_md, fill=255)

    # Belgian Liège Perron + CIP / PV proof stamp behind serial block
    _draw_belgian_liege_perron(de_ul, ux0 + 1345, uy0 + 108, 124.0)

    # Left side top M1913 rail T-numbers: front (+X, x_c small) = T38 -> rear (-X, x_c large) = T2
    f_t = load_font(FONT_SANS, 34)
    for idx, number in enumerate(range(38, 1, -2)):
        xc = int(round((0.042 + idx * (0.89 / 18.0)) * UW))
        dl_ul.text((xc, 24), f"T{number}", font=f_t, fill=255, anchor="mm")

    _paste_world_mask(engrave_mask, up_l_eng, 0.02, 0.98, 0.842, 0.987)
    _paste_world_mask(laser_mask, up_l_las, 0.02, 0.98, 0.842, 0.987)

    # Upper Right Wall: u in [0.02, 0.98], v in [0.692, 0.837] (0 = -X rear, UW = +X front)
    up_r_eng = Image.new("L", (UW, UH), 0)
    up_r_las = Image.new("L", (UW, UH), 0)
    de_ur = ImageDraw.Draw(up_r_eng)
    dl_ur = ImageDraw.Draw(up_r_las)

    # Forward of ejection port (u >= 0.61 -> x_c >= 2460), v ~ 0.785 -> y_c ~ 214
    de_ur.text((2460, 206), 'NATO  5.56×45   1/7"', font=load_font(FONT_SANS, 52), fill=240)
    _draw_belgian_liege_perron(de_ur, 3260, 232, 96.0)
    for idx, number in enumerate(range(2, 39, 2)):
        xc = int(round((0.042 + idx * (0.89 / 18.0)) * UW))
        dl_ur.text((xc, 24), f"T{number}", font=f_t, fill=255, anchor="mm")

    _paste_world_mask(engrave_mask, up_r_eng, 0.02, 0.98, 0.692, 0.837)
    _paste_world_mask(laser_mask, up_r_las, 0.02, 0.98, 0.692, 0.837)

    # 2) Polymer Lower Ambi Selector Markings (10.60 x 2.73 cm -> 2120 x 546 px at 200 px/cm)
    # Compensates 2.065x vertical stretch (py=187.55 vs px=90.81 px/cm)!
    LW, LH = 2120, 546
    f_sel = load_font(FONT_SANS, 64)
    sel_r = 104  # 0.52 cm true 3D circle radius around CAD selector pivot (-3.45, -0.35)!

    for is_left in (True, False):
        blk_im = Image.new("L", (LW, LH), 0)
        red_im = Image.new("L", (LW, LH), 0)
        db = ImageDraw.Draw(blk_im)
        dr = ImageDraw.Draw(red_im)

        # CAD selector (-3.45, -0.35) -> xNorm = 0.20755; yNorm = 0.708 (v=0.587, clear of v=0.652 seam)
        xn_piv = 1.0 - 0.20755 if is_left else 0.20755
        sx, sy = int(round(xn_piv * LW)), int(round((1.0 - 0.705) * LH))
        left_char, right_char = ("S", "A") if is_left else ("A", "S")

        # 9 o'clock, 12 o'clock ('1'), 3 o'clock on true 1:1 world circle
        for char, ox, oy, tx0, ty0, tx1, ty1 in (
            (left_char, -sel_r - 30, 0, -sel_r + 12, 0, -sel_r + 44, 0),
            ("1", 0, -sel_r - 28, 0, -sel_r + 12, 0, -sel_r + 44),
            (right_char, sel_r + 30, 0, sel_r - 44, 0, sel_r - 12, 0),
        ):
            target = db if char == "S" else dr
            target.text((sx + ox, sy + oy), char, font=f_sel, fill=255, anchor="mm")
            target.line([(sx + tx0, sy + ty0), (sx + tx1, sy + ty1)], fill=255, width=7)

        u0_l, u1_l = (0.02, 0.49) if is_left else (0.51, 0.98)
        _paste_world_mask(black_mask, blk_im, u0_l, u1_l, 0.41, 0.66)
        _paste_world_mask(red_mask, red_im, u0_l, u1_l, 0.41, 0.66)

    # 3) Band D FDE Magazine Skirt Rollmark (3.60 x 10.15 cm -> 1080 x 3045 px at 300 px/cm)
    # Compensates 3.830x horizontal stretch (px=204.80 vs py=53.46 px/cm)!
    MW, MH = 1080, 3045
    mag_eng = Image.new("L", (MW, MH), 0)
    dm_mag = ImageDraw.Draw(mag_eng)
    # Below lowest rib (v=0.1565 -> yNorm = (0.1565 - 0.125)/0.265 = 0.1189 -> y_c > 2683)
    dm_mag.text(
        (MW // 2, 2815),
        "FN   5.56×45MM   30RD",
        font=load_font(FONT_COND, 62),
        fill=245,
        anchor="mm",
    )
    dm_mag.text(
        (MW // 2, 2912),
        "FN HERSTAL · CAGE 3S679",
        font=load_font(FONT_COND, 44),
        fill=225,
        anchor="mm",
    )
    _paste_world_mask(engrave_mask, mag_eng, 0.58, 0.94, 0.125, 0.390)

    # Composite markings into albedo, height, roughness, cavity, and strictly calibrated ORM metalness
    expose(engrave_mask * 0.90, (0.215, 0.180, 0.132), 0.38, 0.56)
    height -= engrave_mask * 0.22
    cavity *= 1.0 - engrave_mask * 0.14

    # White laser-etched T-slot numbers: dielectric white oxide/pigment (B = 0.04 <= 0.05!)
    expose(laser_mask, (0.90, 0.89, 0.84), 0.40, 0.04)
    height -= laser_mask * 0.065

    # Polymer lower enamel selector fills: strictly dielectric paint (B = 0.03 <= 0.05!)
    for mark_arr, col_rgb in ((black_mask * lower, (0.145, 0.138, 0.130)), (red_mask * lower, (0.74, 0.045, 0.035))):
        expose(mark_arr, col_rgb, 0.25, 0.03)
        height -= mark_arr * 0.24
        cavity *= 1.0 - mark_arr * 0.075

    conv_scar = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.0)) * (v >= 0.11)
    albedo += (conv_scar * 0.024)[..., None]
    roughness -= conv_scar * 0.042

    _save_suite(np.clip(albedo, 0.0, 1.0), height, roughness, metalness, cavity)


if __name__ == "__main__":
    build_scar_fde_suite()
