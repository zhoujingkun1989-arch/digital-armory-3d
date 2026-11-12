#!/usr/bin/env python3
"""Steyr AUG A1 / StG 77: deterministic, 1:1 world-calibrated PBR atlases.

Exact filenames, dimensions and UV zones:
  aug_stock_{albedo,normal,roughness}.png (2048x1024; .webp by default).
    Buttstock (14.70 x 5.50 cm -> left u=.05..45, right u=.55..95, v=.56..92, py/px = 1.203x):
      Molded cartouches u=.07..43 / .57..93, v=.67..85 (clear of olive_plain v=.88..97).
    Foregrip/pistol grip (3.80 x 5.20 cm -> u=.42..58, v=.51..62, px/py = 3.98x):
      World-isotropic tactile stipple patch u=.41..59, v=.50..63.
    Swarovski Habicht 1.5x scope (10.30 x 1.15 cm -> left u=.07..45, right u=.55..93, v=.36..45):
      Crisp white laser markings + mapped windage/elevation vernier ticks inside scope flanks.
    Die-cast aluminum receiver (8.35 x 1.68 cm -> left u=.07..45, right u=.55..93, v=.16..27, px/py = 1.39x):
      Crisp Austrian Eagle 'NPv' proof shields + caliber/serial rollmarks.
    Bottom swatches v<.075: rubber u<.34; multi-coated lens .34<=u<.65; red safety dot .66..70; bright steel u>=.72.

  aug_mag_{albedo,normal,roughness}.png (1024x1024; .webp by default).
    15 internal 5.56x45 brass/copper cartridges u=.16..84, v=.14..88, pitch=.0493.
    Smoked Makrolon polycarbonate waffle box u=.12..88, v=.12..89 (strictly B<=0.05 polymer!).
    Symmetric 10/20/30 witness index bars on 3D spine u=.880..916 + collar/margin typography outside side UV mirror.
    Bottom swatches v<.075: dark polymer u<.50 (B=.03); steel feed-lip insert u>=.50 (B=.96).
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
    fbm_noise,
    height_to_normal_png,
    laser_stipple_field,
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


def _uv_grid(h: int, w: int) -> tuple[np.ndarray, np.ndarray]:
    return (
        np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w)),
        np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w)),
    )


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


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.45) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.04, 0.92)
    metalness = np.clip(metalness, 0.02, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")
    paths = [save_rgb_png(np.clip(albedo, 0.0, 1.0), os.path.join(OUT_DIR, f"{stem}_albedo.png"))]
    normal_path = height_to_normal_png(
        height, strength=strength, out_path=os.path.join(OUT_DIR, f"{stem}_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, out_path=os.path.join(OUT_DIR, f"{stem}_roughness.png")
    )
    if Path(orm_path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normal = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
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
    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} albedo / OpenGL normal / RGB ORM:",
        *paths,
        sep="\n  ",
    )


def draw_steyr_logo(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, col: int = 255) -> None:
    """Steyr-Mannlicher concentric target reticle emblem in isotropic world coordinates."""
    inner = r * 0.56
    w_outer = max(2, round(r * 0.12))
    w_inner = max(2, round(r * 0.09))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=col, width=w_outer)
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), outline=col, width=w_inner)
    for pts in (
        ((cx, cy - r - r * 0.22), (cx, cy - inner + r * 0.14)),
        ((cx - r - r * 0.22, cy), (cx - inner + r * 0.14, cy)),
        ((cx + inner - r * 0.14, cy), (cx + r + r * 0.22, cy)),
        ((cx - r * 0.46, cy + r + r * 0.16), (cx, cy + inner - r * 0.10)),
        ((cx + r * 0.46, cy + r + r * 0.16), (cx, cy + inner - r * 0.10)),
    ):
        draw.line(pts, fill=col, width=w_outer)


def draw_austrian_npv_proof(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """Austrian Vienna/Ferlach Bundesbeschussamt Eagle shield + 'NPv' nitro proof mark."""
    lw = max(2, round(r * 0.11))
    # Spread Austrian eagle wings + breast shield
    wings = [
        (cx - r * 0.92, cy - r * 0.34),
        (cx - r * 0.35, cy - r * 0.12),
        (cx, cy - r * 0.56),
        (cx + r * 0.35, cy - r * 0.12),
        (cx + r * 0.92, cy - r * 0.34),
        (cx + r * 0.58, cy + r * 0.22),
        (cx, cy + r * 0.56),
        (cx - r * 0.58, cy + r * 0.22),
    ]
    draw.polygon(wings, outline=255, width=lw)
    draw.rectangle((cx - r * 0.26, cy - r * 0.14, cx + r * 0.26, cy + r * 0.30), fill=255)
    f_npv = load_font(FONT_COND, max(12, round(r * 0.78)))
    draw.text((cx + r * 1.12, cy + r * 0.04), "NPv", font=f_npv, fill=255, anchor="lm")


def build_aug_stock_suite() -> None:
    W, H = 2048, 1024
    u, v = _uv_grid(H, W)

    def rect(u0: float, u1: float, v0: float, v1: float) -> np.ndarray:
        return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)

    grain = np.clip(spectral_noise(H, W, 260, 510, seed=901), -2.5, 2.5)
    pebbles, edges = worley_cellular(H, W, 152, 304, seed=902)
    edm = np.clip((0.42 - pebbles) * 1.8 + (edges - 0.17) * 0.5, -1.0, 1.0)
    pores, cast_edges = worley_cellular(H, W, 256, 512, seed=903)
    casting = (0.43 - pores) * 1.5 + (cast_edges - 0.18) * 0.3
    tool = cnc_toolpath(H, W, pitch_px=3.4, angle_deg=0, seed=904)
    handling = fbm_noise(H, W, base_freq=6, octaves=4, seed=905)

    albedo = np.full((H, W, 3), (0.185, 0.196, 0.210), np.float32)
    height = np.zeros((H, W), np.float32)
    roughness = np.full((H, W), 0.58, np.float32)
    metalness = np.full((H, W), 0.03, np.float32)
    cavity = np.ones((H, W), np.float32)

    # Upper UV band (v >= 0.49): Austrian olive fiberglass-reinforced PA66 stock
    stock = v >= 0.49
    albedo[stock] = np.array([82, 95, 71], np.float32) / 255.0 + edm[stock, None] * 0.009
    height[stock] = (edm * 0.10 + grain * 0.009)[stock]
    roughness[stock] = (0.58 + edm * 0.026 - handling * 0.017)[stock]
    fibers = scratch_field(
        H, W, count=2200, min_len=2, max_len=7, angle_deg=23, angle_spread=65, seed=906, mask=stock
    )
    albedo += fibers[..., None] * np.array([0.013, 0.013, 0.008], np.float32)
    height += fibers * 0.012

    # Molded recessed cartouche panels u=.07..43 / .57..93, v=.67..85 (clear of olive_plain v>=.88)
    panels = rect(0.07, 0.43, 0.67, 0.85) | rect(0.57, 0.93, 0.67, 0.85)
    panel_relief = bevel_mask(panels, 5, profile="trapezoid")
    height -= panel_relief * 0.58
    albedo -= panel_relief[..., None] * 0.009
    roughness += panel_relief * 0.015
    cavity *= 1.0 - panel_relief * 0.04

    # Foregrip/pistol grip stipple patch (3.80 x 5.20 cm -> u=.41..59, v=.50..63, px/py = 3.98x!)
    # Compensated cell counts (cells_y=68, cells_x=46) yield 1:1 circular stipple craters in 3D!
    grip_patch = rect(0.41, 0.59, 0.50, 0.63)
    x0, x1 = int(0.41 * W), int(0.59 * W)
    y0, y1 = int((1.0 - 0.63) * H), int((1.0 - 0.50) * H)
    stipple = np.zeros((H, W), np.float32)
    stipple[y0:y1, x0:x1] = laser_stipple_field(y1 - y0, x1 - x0, cells_y=68, cells_x=46, seed=907)
    patch_bevel = bevel_mask(grip_patch, 3, profile="trapezoid")
    height += stipple * patch_bevel * 0.36
    roughness[grip_patch] = 0.70 + edm[grip_patch] * 0.015
    cavity *= 1.0 - patch_bevel * np.maximum(-stipple, 0.0) * 0.09

    seam = rect(0.025, 0.975, 0.960, 0.9615)
    height += seam * 0.16
    cavity *= 1.0 - seam * 0.04

    # Lower UV band (0.08 <= v < 0.49): Die-cast anodized aluminum receiver & Swarovski optic housing
    receiver = (v >= 0.08) & (v < 0.49)
    albedo[receiver] = np.array([0.255, 0.275, 0.298], np.float32) + casting[receiver, None] * 0.007
    height[receiver] = (casting * 0.027 + tool * 0.012 + grain * 0.004)[receiver]
    roughness[receiver] = (0.36 + casting * 0.019 - handling * 0.018)[receiver]
    metalness[receiver] = 0.56

    rims = (rect(0.025, 0.975, 0.475, 0.481) | rect(0.025, 0.975, 0.089, 0.095)) & receiver
    edge = _edge_proximity(rims, 4)
    for bounds in ((0.07, 0.45, 0.36, 0.45), (0.55, 0.93, 0.36, 0.45)):
        edge = np.maximum(edge, _edge_proximity(rect(*bounds), 4) * 0.85)
    edge *= smoothstep(-0.02, 0.40, fbm_noise(H, W, base_freq=96, octaves=3, seed=909))
    bare, oxide = chipped_edge_wear(edge * receiver, seed=910, wear_amount=0.52)
    scratches = scratch_field(
        H, W, count=130, min_len=16, max_len=58, angle_deg=-12, angle_spread=26, seed=911, mask=receiver
    )
    albedo += (scratches * 0.28)[..., None] * np.array([0.08, 0.09, 0.10], np.float32)
    roughness -= scratches * 0.072
    albedo -= oxide[..., None] * 0.014
    albedo = albedo * (1.0 - bare[..., None]) + np.array([0.58, 0.62, 0.67], np.float32) * bare[..., None]
    roughness = roughness * (1.0 - bare) + 0.20 * bare
    metalness = metalness * (1.0 - bare) + 0.96 * bare
    height -= bare * 0.045 + scratches * 0.022

    # -------------------------------------------------------------------------
    # 1:1 ISOTROPIC WORLD-SPACE MOLDED CARTOUCHES, SWAROVSKI OPTIC & NPv PROOFS
    # -------------------------------------------------------------------------
    molded_mask = np.zeros((H, W), dtype=np.float32)
    laser_mask = np.zeros((H, W), dtype=np.float32)

    # 1) Buttstock Left & Right Flanks (14.70 x 5.50 cm -> 2940 x 1100 px at 200 px/cm)
    # Cartouches sit inside panels u=.07..43 / .57..93 -> x_c in [147, 2793], v=.67..85 -> y_c in [214, 764]
    BW, BH = 2940, 1100
    for is_left in (True, False):
        b_im = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_im)
        cx_logo, cy_logo = 460, 488
        draw_steyr_logo(db, cx_logo, cy_logo, r=108, col=255)
        f_hd = load_font(FONT_SANS, 114)
        f_sub = load_font(FONT_SANS, 80)
        if is_left:
            db.text((635, 382), "STEYR MANNLICHER", font=f_hd, fill=255)
            p1 = "MADE IN AUSTRIA"
            db.text((638, 520), p1, font=f_sub, fill=255)
            bx1 = db.textbbox((638, 520), p1, font=f_sub)
            dot_x, dot_y = bx1[2] + 38, (bx1[1] + bx1[3]) // 2
            db.ellipse((dot_x - 8, dot_y - 8, dot_x + 8, dot_y + 8), fill=255)
            db.text((dot_x + 38, 520), "StG 77", font=f_sub, fill=255)
            _paste_world_mask(molded_mask, b_im, 0.05, 0.45, 0.56, 0.92)
        else:
            db.text((635, 382), "STEYR AUG A1   5.56×45", font=f_hd, fill=255)
            db.text((638, 520), "STEYR-DAIMLER-PUCH AG   907418", font=f_sub, fill=255)
            _paste_world_mask(molded_mask, b_im, 0.55, 0.95, 0.56, 0.92)

    # 2) Swarovski Habicht 1.5x14 Integral Scope (10.30 x 1.15 cm -> 2472 x 276 px at 240 px/cm)
    # Vernier turret scale is now inside mapped scope flanks (not stranded in unmapped u=0.485 gutter!)
    def _draw_vernier_arrows(d: ImageDraw.ImageDraw, cx: int, cy: int, left_lbl: str, right_lbl: str, fnt) -> None:
        d.text((cx, cy), "0", font=fnt, fill=255, anchor="mm")
        # Left vector arrow
        d.line([(cx - 24, cy), (cx - 78, cy)], fill=255, width=4)
        d.polygon([(cx - 86, cy), (cx - 68, cy - 9), (cx - 68, cy + 9)], fill=255)
        d.text((cx - 98, cy), left_lbl, font=fnt, fill=255, anchor="rm")
        # Right vector arrow
        d.line([(cx + 24, cy), (cx + 78, cy)], fill=255, width=4)
        d.polygon([(cx + 86, cy), (cx + 68, cy - 9), (cx + 68, cy + 9)], fill=255)
        d.text((cx + 98, cy), right_lbl, font=fnt, fill=255, anchor="lm")

    SW, SH = 2472, 276
    for is_left in (True, False):
        s_im = Image.new("L", (SW, SH), 0)
        ds = ImageDraw.Draw(s_im)
        f_sc = load_font(FONT_SANS, 74)
        f_ver = load_font(FONT_COND, 46)
        if is_left:
            ds.text((140, SH // 2), "SWAROVSKI OPTIK TIROL   1.5×14", font=f_sc, fill=255, anchor="lm")
            vx0 = 1860
            for k in range(9):
                tx = vx0 + k * 44
                th = 42 if k % 4 == 0 else (28 if k % 2 == 0 else 18)
                ds.line([(tx, 62), (tx, 62 + th)], fill=255, width=5 if k % 4 == 0 else 3)
            _draw_vernier_arrows(ds, vx0 + 176, 152, "L", "R", f_ver)
            _paste_world_mask(laser_mask, s_im, 0.07, 0.45, 0.36, 0.45)
        else:
            ds.text((140, SH // 2), "HABICHT 1.5×   MADE IN AUSTRIA", font=f_sc, fill=255, anchor="lm")
            vx0 = 1860
            for k in range(9):
                tx = vx0 + k * 44
                th = 42 if k % 4 == 0 else (28 if k % 2 == 0 else 18)
                ds.line([(tx, 62), (tx, 62 + th)], fill=255, width=5 if k % 4 == 0 else 3)
            _draw_vernier_arrows(ds, vx0 + 176, 152, "UP", "DN", f_ver)
            _paste_world_mask(laser_mask, s_im, 0.55, 0.93, 0.36, 0.45)

    # 3) Die-Cast Aluminum Receiver Flanks (8.35 x 1.68 cm -> 2004 x 403 px at 240 px/cm, px/py = 1.39x!)
    RW, RH = 2004, 403
    for is_left in (True, False):
        r_im = Image.new("L", (RW, RH), 0)
        dr = ImageDraw.Draw(r_im)
        f_rc = load_font(FONT_COND, 72)
        if is_left:
            draw_steyr_logo(dr, 128, RH // 2, r=52, col=255)
            dr.text((216, RH // 2), "STEYR  CAL. .223 REM. (5.56mm NATO)  AT-77418", font=f_rc, fill=255, anchor="lm")
            draw_austrian_npv_proof(dr, 1785, RH // 2, r=54)
            _paste_world_mask(laser_mask, r_im, 0.07, 0.45, 0.16, 0.27)
        else:
            dr.text((110, RH // 2), "MOD. AUG / SA   STEYR-DAIMLER-PUCH", font=f_rc, fill=255, anchor="lm")
            draw_austrian_npv_proof(dr, 1465, RH // 2, r=56)
            dr.text((1710, RH // 2), "CIP · N", font=load_font(FONT_COND, 62), fill=255, anchor="lm")
            _paste_world_mask(laser_mask, r_im, 0.55, 0.93, 0.16, 0.27)

    # Apply crisp raised PA66 polymer cartouche relief
    mark = molded_mask * stock
    mark_bevel = bevel_mask(mark, 1.4, profile="trapezoid")
    albedo += mark[..., None] * np.array([0.028, 0.031, 0.021], np.float32)
    height += mark_bevel * 0.42
    roughness -= mark * 0.022
    cavity *= 1.0 - np.clip(ndimage.maximum_filter(mark, size=3) - mark, 0.0, 1.0) * 0.08

    # Apply white laser-etched receiver/scope markings: dielectric oxide layer (B = 0.04 <= 0.05!)
    laser_mark = laser_mask * receiver
    albedo = albedo * (1.0 - laser_mark[..., None]) + np.array([0.85, 0.87, 0.85], np.float32) * laser_mark[..., None]
    height -= laser_mark * 0.085
    roughness = roughness * (1.0 - laser_mark) + 0.42 * laser_mark
    metalness = metalness * (1.0 - laser_mark) + 0.04 * laser_mark

    # Bottom utility swatches (v < 0.075)
    rubber = (v < 0.075) & (u < 0.34)
    lens = (v < 0.075) & (u >= 0.34) & (u < 0.65)
    steel = (v < 0.075) & (u >= 0.72)
    albedo[rubber] = np.array([0.180, 0.190, 0.204]) + edm[rubber, None] * 0.006
    height[rubber], roughness[rubber], metalness[rubber] = edm[rubber] * 0.10, 0.82, 0.02

    conv_aug = smoothstep(0.08, 0.50, compute_convexity(height, sigma=2.0)) * (v >= 0.08)
    albedo += (conv_aug * 0.022)[..., None]
    roughness -= conv_aug * 0.040

    ru, rv = (u - 0.495) / 0.14, (v - 0.038) / 0.038
    radius = np.sqrt(ru * ru + rv * rv)
    ar = 1.0 - smoothstep(0.05, 1.35, radius)
    lens_rgb = np.array([0.024, 0.16, 0.22], np.float32) + ar[..., None] * np.array([0.025, 0.25, 0.19], np.float32)
    ring = smoothstep(0.65, 0.85, radius) * (1.0 - smoothstep(0.86, 1.02, radius))
    lens_rgb += ring[..., None] * np.array([0.018, 0.025, 0.055], np.float32)
    albedo[lens], height[lens], roughness[lens], metalness[lens] = lens_rgb[lens], 0.0, 0.05, 0.10

    albedo[steel] = np.array([0.78, 0.82, 0.87]) + tool[steel, None] * 0.004
    height[steel], roughness[steel], metalness[steel] = tool[steel] * 0.009, 0.17, 0.97

    # Red safety indicator dot in original UV swatch (.66..70, v=.015..055): strictly dielectric B=0.03 <= 0.05!
    S = 2
    red_im = Image.new("L", (W * S, H * S), 0)
    ImageDraw.Draw(red_im).ellipse(
        tuple(int(p * S) for p in (0.66 * W, 0.945 * H, 0.70 * W, 0.985 * H)), fill=255
    )
    red = np.asarray(red_im.resize((W, H), Image.Resampling.LANCZOS), np.float32) / 255.0
    albedo = albedo * (1.0 - red[..., None]) + np.array([0.82, 0.12, 0.12], np.float32) * red[..., None]
    roughness = roughness * (1.0 - red) + 0.24 * red
    metalness = metalness * (1.0 - red) + 0.03 * red
    cavity[v < 0.08] = 1.0

    _save_suite("aug_stock", albedo, height, roughness, metalness, cavity, strength=2.2)


def build_aug_mag_suite() -> None:
    W, H = 1024, 1024
    u, v = _uv_grid(H, W)

    def rect(u0: float, u1: float, v0: float, v1: float) -> np.ndarray:
        return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)

    grain = np.clip(spectral_noise(H, W, 180, 420, seed=921), -2.5, 2.5)
    amber_dark = np.array([0.27, 0.20, 0.095], np.float32)
    amber_rib = np.array([0.405, 0.285, 0.120], np.float32)
    albedo = np.broadcast_to(amber_dark, (H, W, 3)).copy() + grain[..., None] * 0.0025
    # Cartridge relief is internal behind smooth polycarbonate windows
    height = grain * 0.009
    roughness = np.full((H, W), 0.32, np.float32)
    metalness = np.full((H, W), 0.04, np.float32)
    cavity = np.ones((H, W), np.float32)

    # Fifteen separate 5.56x45 NATO cartridges visible through smoked amber Makrolon
    pitch = 0.0493
    row = np.floor((v - 0.14) / pitch).astype(np.int32)
    safe_row = np.clip(row, 0, 14)
    rng = np.random.default_rng(922)
    stagger = rng.uniform(-0.0012, 0.0012, 15).astype(np.float32)
    tilt = rng.uniform(-0.0015, 0.0015, 15).astype(np.float32)
    centers = 0.14 + (safe_row + 0.5) * pitch
    local_v = (v - centers + stagger[safe_row] + tilt[safe_row] * (u - 0.5)) / (pitch * 0.405)

    radius = np.ones((H, W), np.float32)
    body_t = np.clip((u - 0.212) / (0.60 - 0.212), 0.0, 1.0)
    radius[:] = 1.0 - 0.14 * body_t
    groove = smoothstep(0.194, 0.198, u) * (1.0 - smoothstep(0.208, 0.212, u))
    radius -= groove * 0.12
    shoulder = smoothstep(0.60, 0.64, u)
    radius = np.where(u >= 0.60, 0.86 - 0.26 * shoulder, radius)
    bullet_t = np.clip((u - 0.68) / 0.15, 0.0, 1.0)
    bullet_radius = 0.60 * np.sqrt(1.0 - bullet_t) * (1.0 - 0.24 * bullet_t)
    radius = np.where(u >= 0.68, bullet_radius, radius)

    cross = local_v / np.maximum(radius, 0.008)
    z = np.sqrt(np.maximum(1.0 - cross * cross, 0.0))
    coverage = 1.0 - smoothstep(0.96, 1.04, np.abs(cross))
    ammo_zone = rect(0.16, 0.84, 0.14, 0.88) & (row >= 0) & (row < 15)
    coverage *= ammo_zone & (u <= 0.83)
    shade = np.clip(0.27 + 0.64 * z - 0.16 * cross, 0.16, 1.02)
    specular = np.clip(0.88 * z - 0.48 * np.clip(cross, -1.0, 1.0), 0.0, 1.0) ** 34 * 0.24
    round_tone = rng.uniform(-0.025, 0.025, 15).astype(np.float32)[safe_row]
    brass = np.array([0.84, 0.66, 0.29], np.float32)
    cart = brass * (shade + round_tone)[..., None] + specular[..., None] * np.array([1.0, 0.88, 0.60], np.float32)
    cart += grain[..., None] * 0.003
    cart *= (1.0 - groove * 0.52)[..., None]
    rim = rect(0.166, 0.179, 0.14, 0.88) * ammo_zone
    cart += (rim * (0.045 + 0.035 * z))[..., None] * np.array([1.0, 0.85, 0.50], np.float32)
    rim_cut = rect(0.180, 0.185, 0.14, 0.88) * ammo_zone
    cart *= (1.0 - rim_cut * 0.25)[..., None]

    anneal_t = np.clip((u - 0.552) / 0.112 + round_tone * 0.8, 0.0, 1.0)
    stops = (0.0, 0.28, 0.48, 0.69, 1.0)
    palette = np.array(
        [[0.74, 0.57, 0.28], [0.55, 0.38, 0.24], [0.36, 0.29, 0.39], [0.53, 0.42, 0.29], [0.76, 0.61, 0.34]],
        np.float32,
    )
    anneal_rgb = np.stack([np.interp(anneal_t, stops, palette[:, i]) for i in range(3)], axis=-1).astype(np.float32)
    anneal_mask = smoothstep(0.55, 0.578, u) * (1.0 - smoothstep(0.655, 0.672, u)) * 0.78
    cart = cart * (1.0 - anneal_mask[..., None]) + anneal_rgb * (shade * 0.94 + specular)[..., None] * anneal_mask[..., None]

    bullet = (u >= 0.68) & (u <= 0.83)
    copper = np.array([0.80, 0.42, 0.21], np.float32) * (shade * 0.97)[..., None]
    copper += specular[..., None] * np.array([0.85, 0.58, 0.34], np.float32)
    cart[bullet] = copper[bullet]
    sealant = smoothstep(0.673, 0.675, u) * (1.0 - smoothstep(0.679, 0.681, u))
    cart = cart * (1.0 - sealant[..., None]) + np.array([0.44, 0.025, 0.025], np.float32) * (shade * 0.9)[..., None] * sealant[..., None]

    # Smoked Makrolon exterior window is strictly dielectric polycarbonate (B = 0.04 <= 0.05!)
    tint = np.array([0.98, 0.86, 0.57], np.float32)
    transmitted = cart * tint * 0.83 + amber_dark * 0.19
    albedo = albedo * (1.0 - coverage[..., None]) + transmitted * coverage[..., None]
    windows = rect(0.12, 0.88, 0.12, 0.89)
    roughness[windows], metalness[windows] = 0.11, 0.04
    cavity[ammo_zone] = (0.34 + 0.66 * coverage * np.sqrt(z))[ammo_zone]
    cavity *= 1.0 - (groove * 0.11 * coverage)

    # Raised amber Makrolon waffle grid
    grid_mask = np.zeros((H, W), bool)
    for i in range(12):
        center = 0.12 + i * 0.070
        grid_mask |= rect(0.12, 0.88, center - 0.0095, center + 0.0095)
    for center in (0.13, 0.31, 0.50, 0.69, 0.87):
        grid_mask |= rect(center - 0.012, center + 0.012, 0.12, 0.89)
    grid_mask &= windows
    grid = bevel_mask(grid_mask, 3.5, profile="trapezoid")
    frame_mask = ((v > 0.885) | (u < 0.125) | (u > 0.875)) & (v >= 0.08)
    frame = bevel_mask(frame_mask, 4, profile="trapezoid")
    waffle = np.maximum(grid, frame)

    cast_shadow = ndimage.gaussian_filter(
        ndimage.shift(waffle, (3.0, 3.0), order=1, mode="nearest"), sigma=1.15
    )
    cast_shadow *= (1.0 - waffle) * windows
    albedo *= (1.0 - cast_shadow * 0.32)[..., None]
    cavity *= 1.0 - cast_shadow * 0.36
    distance = ndimage.distance_transform_edt(~(grid_mask | frame_mask)).astype(np.float32)
    wall_cavity = np.exp(-distance / 3.0) * (1.0 - waffle) * windows
    cavity *= 1.0 - wall_cavity * 0.30

    rib_color = amber_rib + grain[..., None] * 0.003
    albedo = albedo * (1.0 - waffle[..., None]) + rib_color * waffle[..., None]
    height += waffle * 1.48
    rib_rough = 0.30 + grain * 0.006 + 0.055 * (1.0 - waffle)
    roughness = roughness * (1.0 - waffle) + rib_rough * waffle
    metalness = metalness * (1.0 - waffle) + 0.04 * waffle
    cavity = cavity * (1.0 - waffle) + 0.98 * waffle

    scuffs = scratch_field(
        H, W, count=160, min_len=3, max_len=34, angle_deg=84, angle_spread=18, seed=923, mask=v >= 0.08
    )
    height -= scuffs * 0.016
    roughness += scuffs * 0.025

    # UV-SYMMETRY AWARE MOLDED MARKINGS:
    # applyAugMagUVs maps BOTH left & right side walls to u in [0.08, 0.92], v in [0.12, 0.94]
    # without mirroring u so cartridges point +X on both sides. Therefore:
    #  - Inside u in [0.882, 0.916], draw mirror-symmetric horizontal witness index bars at 10/20/30!
    #  - Outside u<=0.92 / v<=0.94 (u=0.928..0.988 and v=0.946..0.982), draw crisp '10/20/30' and
    #    'STEYR  5.56×45' so zero mirrored text ever appears on the 3D left magazine wall!
    S = 2
    stamp = Image.new("L", (W * S, H * S), 0)
    ds = ImageDraw.Draw(stamp)
    f_cnt = load_font(FONT_COND, 24 * S)
    f_top = load_font(FONT_SANS, 25 * S)
    for label, vp in (("10", 0.66), ("20", 0.44), ("30", 0.21)):
        yc = int(round((1.0 - vp) * H * S))
        # Symmetric molded witness bar + dot inside 3D front spine rib (u=.884..914)
        ds.rounded_rectangle(
            (int(0.884 * W * S), yc - 4 * S, int(0.914 * W * S), yc + 4 * S), radius=2 * S, fill=255
        )
        # Crisp numeral in showcase margin u=.928..985 (outside side mode's u<=0.92)
        ds.text((int(0.956 * W * S), yc), label, fill=255, font=f_cnt, anchor="mm")
    # Crisp Steyr logo + caliber stamp in top collar showcase band v=.948..985 (above side mode's v<=0.94)
    draw_steyr_logo(ds, 0.305 * W * S, (1.0 - 0.964) * H * S, r=13 * S, col=255)
    ds.text((int(0.335 * W * S), int((1.0 - 0.964) * H * S)), "STEYR   5.56×45   StG 77", fill=255, font=f_top, anchor="lm")

    mark = np.asarray(stamp.resize((W, H), Image.Resampling.LANCZOS), np.float32) / 255.0
    albedo += mark[..., None] * np.array([0.042, 0.031, 0.014], np.float32)
    height += bevel_mask(mark, 1.2, profile="trapezoid") * 0.30
    roughness = roughness * (1.0 - mark) + 0.31 * mark
    metalness = metalness * (1.0 - mark) + 0.04 * mark
    conv_waffle = smoothstep(0.08, 0.48, compute_convexity(height, sigma=2.0)) * (v >= 0.08)
    albedo += conv_waffle[..., None] * np.array([0.026, 0.020, 0.010], np.float32)
    roughness -= conv_waffle * 0.038

    # Bottom utility swatches: polymer floorplate (B=.03 <= .05) & steel feed-lip insert (B=.96 >= .95!)
    floor = (v < 0.075) & (u < 0.50)
    lip = (v < 0.075) & (u >= 0.50)
    albedo[floor] = np.array([0.16, 0.17, 0.16]) + grain[floor, None] * 0.002
    height[floor], roughness[floor], metalness[floor] = grain[floor] * 0.018, 0.64, 0.03
    albedo[lip] = np.array([0.24, 0.26, 0.23]) + grain[lip, None] * 0.002
    height[lip], roughness[lip], metalness[lip] = grain[lip] * 0.012, 0.28, 0.96
    cavity[v < 0.08] = 1.0

    _save_suite("aug_mag", albedo, height, roughness, metalness, cavity, strength=2.4)


if __name__ == "__main__":
    build_aug_stock_suite()
    build_aug_mag_suite()
