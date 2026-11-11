#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for the Steyr AUG A1 (StG 77 · 5.56×45mm NATO, Classic Austrian Olive-Green) in public/textures/:
  1. aug_stock_{albedo,normal,roughness}.png (2048x1024)
     - Upper UV band: Classic Austrian Olive-Green (#4b5841) satin polyamide bullpup stock
       with crisp molded STEYR MANNLICHER AUSTRIA / StG 77 markings & Steyr target logo
     - Lower UV band: Dark charcoal-grey anodized die-cast aluminum receiver & 1.5x Swarovski optic
       with SWAROVSKI OPTIK TIROL 1.5x markings & flat non-wavy normals
     - Bottom utility swatches: black rubber, emerald-blue coated glass lens, bright steel
  2. aug_mag_{albedo,normal,roughness}.png (1024x1024)
     - Translucent amber waffle-grid polycarbonate magazine revealing stacked golden
       5.56×45mm NATO brass cartridges & copper FMJ spitzer bullets behind raised waffle ribs!
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
]


def load_font(size: int):
    for fp in FONT_CANDIDATES:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def spectral_noise(
    h: int,
    w: int,
    f_low: float,
    f_high: float,
    seed: int,
    aniso_x: float = 1.0,
    aniso_y: float = 1.0,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h / aniso_y
    fx = np.fft.rfftfreq(w)[None, :] * w / aniso_x
    freq = np.sqrt(fx * fx + fy * fy)
    envelope = np.exp(-0.5 * ((freq - f_low) / max(1.0, (f_high - f_low))) ** 2)
    envelope[0, 0] = 0.0
    field = np.fft.irfft2(spec * envelope, s=(h, w))
    std = float(np.std(field)) + 1e-7
    return (field / std).astype(np.float32)


def height_to_normal_png(height: np.ndarray, strength: float, out_path: str) -> None:
    dh_dy, dh_dx = np.gradient(height)
    nx = -dh_dx * strength
    ny = dh_dy * strength
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    rgb = np.zeros((height.shape[0], height.shape[1], 3), dtype=np.uint8)
    rgb[..., 0] = np.clip((nx * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 1] = np.clip((ny * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 2] = np.clip((nz * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(out_path, optimize=True)


def save_rgb_png(arr01: np.ndarray, out_path: str) -> None:
    rgb = np.clip(arr01 * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(out_path, optimize=True)


def save_gray_png(arr01: np.ndarray, out_path: str) -> None:
    g = np.clip(arr01 * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(g, mode="L").save(out_path, optimize=True)


def draw_steyr_logo(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, col: int = 235) -> None:
    """Draws the classic Steyr Mannlicher concentric target-ring crosshair emblem."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=4)
    r_in = int(r * 0.56)
    draw.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], outline=col, width=3)
    # Crosshair ticks (top, left, right, angled bottom legs)
    draw.line([(cx, cy - r - 6), (cx, cy - r_in + 4)], fill=col, width=4)
    draw.line([(cx - r - 6, cy), (cx - r_in + 4, cy)], fill=col, width=4)
    draw.line([(cx + r_in - 4, cy), (cx + r + 6, cy)], fill=col, width=4)
    draw.line([(cx - int(r * 0.45), cy + r + 4), (cx, cy + r_in - 3)], fill=col, width=4)
    draw.line([(cx + int(r * 0.45), cy + r + 4), (cx, cy + r_in - 3)], fill=col, width=4)


# ==============================================================================
# 1. STEYR AUG A1 OLIVE-GREEN STOCK & ANODIZED OPTIC RECEIVER SUITE (2048 x 1024)
# ==============================================================================
def build_aug_stock_suite() -> None:
    W, H = 2048, 1024
    # Fine high-frequency EDM mold micro-grain ONLY (zero low-freq wavy normal noise!)
    poly_micro = spectral_noise(H, W, 240, 500, seed=901)
    anodize_micro = spectral_noise(H, W, 280, 510, seed=902)
    satin_sheen = spectral_noise(H, W, 12, 36, seed=903)

    v_grid = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))
    u_grid = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.full((H, W), 0.58, dtype=np.float32)

    # --- A. Upper Band (v >= 0.49): Classic Austrian Olive-Green (#4b5841) Polyamide 66 Stock ---
    # #4b5841 = (75/255, 88/255, 65/255) = (0.294, 0.345, 0.255)
    stock_mask = v_grid >= 0.49
    olive_rgb = np.array([0.294, 0.345, 0.255], dtype=np.float32)
    albedo[stock_mask] = (
        olive_rgb
        + poly_micro[stock_mask, None] * 0.008
        - satin_sheen[stock_mask, None] * 0.006
    )
    height[stock_mask] = poly_micro[stock_mask] * 0.11
    roughness[stock_mask] = 0.58 + poly_micro[stock_mask] * 0.03 - satin_sheen[stock_mask] * 0.03

    # Subtle molded recessed rectangular cartouche panels on Left & Right rear buttstock flanks
    panel_l = (
        (u_grid >= 0.07)
        & (u_grid <= 0.43)
        & (v_grid >= 0.67)
        & (v_grid <= 0.85)
    )
    panel_r = (
        (u_grid >= 0.57)
        & (u_grid <= 0.93)
        & (v_grid >= 0.67)
        & (v_grid <= 0.85)
    )
    panels = panel_l | panel_r
    height[panels] -= 0.35
    albedo[panels] -= 0.014
    roughness[panels] += 0.04

    # Molded grip stipple zone around pistol-grip UV patch (u in [0.38..0.62], v in [0.50..0.64])
    grip_patch = (u_grid >= 0.41) & (u_grid <= 0.59) & (v_grid >= 0.50) & (v_grid <= 0.63)
    height[grip_patch] += poly_micro[grip_patch] * 0.22
    roughness[grip_patch] = 0.70

    # --- B. Lower Band (0.08 <= v < 0.49): Dark Charcoal-Grey Anodized Optic Receiver ---
    rec_mask = (v_grid >= 0.08) & (v_grid < 0.49)
    # Authentic Steyr dark slate-charcoal cast/machined aluminum (#31373d)
    anod_rgb = np.array([0.192, 0.216, 0.239], dtype=np.float32)
    albedo[rec_mask] = anod_rgb + anodize_micro[rec_mask, None] * 0.006
    # Optically flat anodized metal surface!
    height[rec_mask] = anodize_micro[rec_mask] * 0.05
    roughness[rec_mask] = 0.41 + anodize_micro[rec_mask] * 0.02 - satin_sheen[rec_mask] * 0.025

    # Subtle silver edge wear along top/bottom rims of receiver band
    rim_wear = (
        np.exp(-((v_grid - 0.478) / 0.009) ** 2)
        + np.exp(-((v_grid - 0.092) / 0.009) ** 2)
    ) * rec_mask
    silver_rgb = np.array([0.58, 0.63, 0.68], dtype=np.float32)
    albedo = albedo * (1.0 - rim_wear[..., None] * 0.30) + silver_rgb * (rim_wear[..., None] * 0.30)
    roughness -= rim_wear * 0.08

    # --- C. Crisp Molded Stock Stamps & White Laser Receiver/Optic Markings ---
    molded_stamp = Image.new("L", (W, H), 0)
    laser_white = Image.new("L", (W, H), 0)
    red_dot_mask = Image.new("L", (W, H), 0)

    dm = ImageDraw.Draw(molded_stamp)
    dl = ImageDraw.Draw(laser_white)
    dr = ImageDraw.Draw(red_dot_mask)

    f_brand = load_font(34)
    f_sub = load_font(25)
    f_optic = load_font(28)
    f_small = load_font(21)

    # 1) Left Stock Wall (u in [0.07..0.43], v in [0.67..0.85] => py around (1 - 0.78)*H)
    lx = int(0.115 * W)
    ly = int((1.0 - 0.79) * H)
    draw_steyr_logo(dm, lx, ly + 26, 28, col=235)
    dm.text((lx + 46, ly - 4), "STEYR MANNLICHER", fill=245, font=f_brand)
    dm.text((lx + 48, ly + 36), "MADE IN AUSTRIA  ·  StG 77", fill=225, font=f_sub)

    # 2) Right Stock Wall (u in [0.57..0.93], v in [0.67..0.85])
    rx = int(0.605 * W)
    ry = int((1.0 - 0.79) * H)
    draw_steyr_logo(dm, rx, ry + 26, 26, col=235)
    dm.text((rx + 44, ry - 4), "STEYR AUG A1  5.56×45", fill=245, font=f_brand)
    dm.text((rx + 46, ry + 36), "STEYR-DAIMLER-PUCH AG  907418", fill=220, font=f_sub)

    # 3) Receiver & Swarovski 1.5x Scope Tube Markings (v in [0.12..0.45])
    # Left receiver & scope flank (u in [0.06..0.46])
    ox_l = int(0.08 * W)
    oy_scope = int((1.0 - 0.41) * H)
    oy_rec = int((1.0 - 0.23) * H)
    dl.text((ox_l, oy_scope), "SWAROVSKI OPTIK TIROL   1.5×14", fill=235, font=f_optic)
    dl.text((ox_l, oy_rec), "STEYR  CAL. .223 REM. (5.56mm NATO)   AT-77418", fill=225, font=f_sub)

    # Right receiver & scope flank (u in [0.54..0.94])
    ox_r = int(0.56 * W)
    dl.text((ox_r, oy_scope), "HABICHT 1.5×   MADE IN AUSTRIA", fill=235, font=f_optic)
    dl.text((ox_r, oy_rec), "MOD. AUG / SA   NPv PROOF   STEYR", fill=220, font=f_sub)

    # Turret elevation/windage tick scale around u = 0.49..0.54, v = 0.36..0.44
    tx0 = int(0.485 * W)
    ty0 = int((1.0 - 0.42) * H)
    for t_i in range(9):
        tx = tx0 + t_i * 11
        tick_h = 12 if t_i % 4 == 0 else 7
        dl.line([(tx, ty0), (tx, ty0 + tick_h)], fill=215, width=2)
    dl.text((tx0, ty0 + 16), "L  ← 0 →  R", fill=210, font=f_small)

    # Safety red warning indicator dot in utility zone
    dr.ellipse([int(0.66 * W), int(0.945 * H), int(0.70 * W), int(0.985 * H)], fill=255)

    molded_arr = np.asarray(molded_stamp.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0
    laser_arr = np.asarray(laser_white.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    red_arr = np.asarray(red_dot_mask, dtype=np.float32) / 255.0

    # Molded olive-highlight lettering on stock (embossed/debossed crisp relief + subtle lighter sage-olive tint)
    sage_mark = np.array([0.44, 0.50, 0.39], dtype=np.float32)
    albedo = albedo * (1.0 - molded_arr[..., None] * 0.68) + sage_mark * (molded_arr[..., None] * 0.68)
    height -= molded_arr * 0.95
    roughness = np.clip(roughness + molded_arr * 0.06, 0.05, 0.92)

    # Crisp silver-white laser engraving on dark grey anodized receiver/scope
    laser_col = np.array([0.78, 0.82, 0.86], dtype=np.float32)
    albedo = albedo * (1.0 - laser_arr[..., None] * 0.78) + laser_col * (laser_arr[..., None] * 0.78)
    height -= laser_arr * 0.55
    roughness = np.clip(roughness + laser_arr * 0.05, 0.05, 0.92)

    # --- D. Bottom Swatch Strip (v < 0.08) ---
    # 1) Black elastomer rubber swatch (u < 0.34, v < 0.075)
    rub_sw = (v_grid < 0.075) & (u_grid < 0.34)
    albedo[rub_sw] = np.array([0.095, 0.102, 0.112], dtype=np.float32)
    roughness[rub_sw] = 0.84
    height[rub_sw] = poly_micro[rub_sw] * 0.18

    # 2) Multi-coated Swarovski emerald-cyan optical glass lens swatch (0.34 <= u < 0.65, v < 0.075)
    lens_sw = (v_grid < 0.075) & (u_grid >= 0.34) & (u_grid < 0.65)
    rad_u = (u_grid - 0.495) / 0.14
    rad_v = (v_grid - 0.038) / 0.038
    lens_glow = np.clip(1.0 - 0.45 * (rad_u * rad_u + rad_v * rad_v), 0.25, 1.0)
    lens_col_in = np.array([0.08, 0.58, 0.62], dtype=np.float32)
    lens_col_edge = np.array([0.04, 0.24, 0.38], dtype=np.float32)
    albedo[lens_sw] = (
        lens_col_edge + (lens_col_in - lens_col_edge) * lens_glow[lens_sw, None]
    )
    roughness[lens_sw] = 0.06
    height[lens_sw] = 0.0

    # 3) Bright steel trunnion/rail swatch (u >= 0.72, v < 0.075)
    steel_sw = (v_grid < 0.075) & (u_grid >= 0.72)
    albedo[steel_sw] = np.array([0.78, 0.82, 0.87], dtype=np.float32)
    roughness[steel_sw] = 0.20
    height[steel_sw] = 0.0

    # Red warning dot swatch
    red_rgb = np.array([0.82, 0.14, 0.14], dtype=np.float32)
    albedo = albedo * (1.0 - red_arr[..., None]) + red_rgb * red_arr[..., None]

    save_rgb_png(albedo, os.path.join(OUT_DIR, "aug_stock_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "aug_stock_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "aug_stock_roughness.png"))
    print("[OK] Generated aug_stock_{albedo,normal,roughness}.png")


# ==============================================================================
# 2. STEYR AUG 30-RD TRANSLUCENT AMBER WAFFLE POLYMER MAGAZINE SUITE (1024 x 1024)
# ==============================================================================
def build_aug_mag_suite() -> None:
    W, H = 1024, 1024
    poly_grain = spectral_noise(H, W, 180, 420, seed=911)

    v_grid = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))
    u_grid = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))

    # Base smoked translucent honey-amber Makrolon polycarbonate (#58431f .. #765928)
    amber_dark = np.array([0.27, 0.20, 0.095], dtype=np.float32)
    amber_rib = np.array([0.39, 0.295, 0.145], dtype=np.float32)

    albedo = np.broadcast_to(amber_dark, (H, W, 3)).copy()
    albedo += poly_grain[..., None] * 0.008
    height = poly_grain * 0.08
    roughness = np.full((H, W), 0.22, dtype=np.float32)

    # --- A. Stacked Golden 5.56x45mm NATO Cartridges Visible Through Translucent Amber Wall! ---
    # Cartridges span u in [0.16, 0.84] (u=0.16 rear rim -> u=0.64 brass case/shoulder -> u=0.84 copper FMJ tip)
    # and stack vertically along v in [0.14, 0.88] (15 visible side-row rounds of the 30-rd double stack!)
    ammo_zone = (u_grid >= 0.16) & (u_grid <= 0.84) & (v_grid >= 0.14) & (v_grid <= 0.88)

    # 15 rounds along v in [0.14, 0.88] => pitch = 0.0493
    pitch = 0.0493
    phase = ((v_grid - 0.14) / pitch) * (2.0 * math.pi)
    # Smooth cylindrical highlight per brass cartridge
    cyl = np.clip(0.50 + 0.50 * np.sin(phase), 0.0, 1.0)
    gap_shadow = np.clip(0.30 + 0.70 * (np.sin(phase * 0.5) ** 2), 0.25, 1.0)

    # Cartridge anatomy along u (0.16 = case head rim, 0.60 = bottleneck shoulder, 0.68 = case mouth, 0.83 = spitzer tip)
    brass_col = np.array([0.84, 0.66, 0.24], dtype=np.float32)
    copper_col = np.array([0.78, 0.41, 0.19], dtype=np.float32)
    anneal_col = np.array([0.66, 0.52, 0.28], dtype=np.float32)

    is_case = (u_grid >= 0.18) & (u_grid < 0.60)
    is_neck = (u_grid >= 0.60) & (u_grid < 0.68)
    # Tapered spitzer bullet profile narrowing toward u = 0.83
    bullet_u = np.clip((u_grid - 0.68) / 0.15, 0.0, 1.0)
    local_v_in_round = np.abs(((v_grid - 0.14) % pitch) / pitch - 0.5) * 2.0
    bullet_radius_env = 1.0 - 0.78 * (bullet_u ** 1.5)
    is_bullet = (u_grid >= 0.68) & (u_grid <= 0.83) & (local_v_in_round <= bullet_radius_env)

    # Extractor rim groove at u in [0.195, 0.212]
    rim_groove = np.exp(-((u_grid - 0.205) / 0.008) ** 2)

    cart_layer = np.zeros((H, W, 3), dtype=np.float32)
    shade = (0.35 + 0.65 * cyl) * gap_shadow * (1.0 - 0.55 * rim_groove)

    cart_layer[is_case] = brass_col * shade[is_case, None]
    cart_layer[is_neck] = anneal_col * (shade[is_neck, None] * 0.86)
    cart_layer[is_bullet] = copper_col * (shade[is_bullet, None] * 0.92)

    has_metal = ammo_zone & (is_case | is_neck | is_bullet)
    # Blend golden 5.56mm rounds through smoked honey-amber translucent polycarbonate!
    amber_filter = np.array([0.92, 0.74, 0.40], dtype=np.float32)
    filtered_round = amber_dark * 0.42 + (cart_layer * amber_filter) * 0.68
    albedo[has_metal] = filtered_round[has_metal]
    # Glossy smooth translucent polycarbonate window cells!
    roughness[ammo_zone] = 0.15 + poly_grain[ammo_zone] * 0.015

    # --- B. Iconic Steyr AUG Raised Waffle-Grid Reinforcement Ribs! ---
    # Crisp horizontal ribs (11 bars) & vertical ribs (5 bars) forming rectangular waffle cells
    in_waffle_box = (u_grid >= 0.12) & (u_grid <= 0.88) & (v_grid >= 0.12) & (v_grid <= 0.89)

    # Horizontal waffle bars every 0.070 in v
    h_dist = np.abs(((v_grid - 0.12) % 0.070) - 0.035)
    h_rib = np.clip((0.0095 - np.abs(h_dist - 0.035)) / 0.0035, 0.0, 1.0)

    # Vertical waffle bars at u = 0.13, 0.31, 0.50, 0.69, 0.87
    v_rib = np.zeros((H, W), dtype=np.float32)
    for vu in [0.13, 0.31, 0.50, 0.69, 0.87]:
        v_rib = np.maximum(v_rib, np.clip((0.012 - np.abs(u_grid - vu)) / 0.004, 0.0, 1.0))

    # Top feed collar (v > 0.89) & front/rear spine borders (u < 0.12 or u > 0.88) are thicker opaque olive-amber polymer
    border_mask = np.clip(
        np.maximum(
            np.clip((v_grid - 0.885) / 0.012, 0.0, 1.0),
            np.maximum(
                np.clip((0.125 - u_grid) / 0.012, 0.0, 1.0),
                np.clip((u_grid - 0.875) / 0.012, 0.0, 1.0),
            ),
        ),
        0.0,
        1.0,
    )

    waffle = np.maximum(np.maximum(h_rib, v_rib) * in_waffle_box, border_mask * (v_grid >= 0.08))

    # Raised ribs attenuate internal cartridge visibility, add strong 3D normal relief & satin polymer roughness
    albedo = albedo * (1.0 - waffle[..., None] * 0.76) + amber_rib * (waffle[..., None] * 0.76)
    height += waffle * 1.35
    roughness = roughness * (1.0 - waffle * 0.85) + (0.54 + poly_grain * 0.03) * (waffle * 0.85)

    # --- C. Molded Round-Count Witness Marks (10 / 20 / 30) & STEYR 5.56 Stamp ---
    stamp = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(stamp)
    f_num = load_font(24)
    f_cal = load_font(26)

    for txt, vp in [("10", 0.66), ("20", 0.44), ("30", 0.21)]:
        py = int((1.0 - vp) * H) - 12
        ds.text((int(0.89 * W), py), txt, fill=235, font=f_num)
    ds.text((int(0.32 * W), int((1.0 - 0.945) * H)), "STEYR  5.56×45", fill=235, font=f_cal)

    st_arr = np.asarray(stamp.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    mark_col = np.array([0.62, 0.50, 0.28], dtype=np.float32)
    albedo = albedo * (1.0 - st_arr[..., None] * 0.65) + mark_col * (st_arr[..., None] * 0.65)
    height += st_arr * 0.75

    # Bottom Olive/Black Polymer Catch & Steel Lip Swatch (v < 0.075)
    lip_sw = (v_grid < 0.075) & (u_grid >= 0.50)
    albedo[lip_sw] = np.array([0.22, 0.24, 0.20], dtype=np.float32)
    roughness[lip_sw] = 0.55

    floor_sw = (v_grid < 0.075) & (u_grid < 0.50)
    albedo[floor_sw] = np.array([0.16, 0.17, 0.16], dtype=np.float32)
    roughness[floor_sw] = 0.64

    save_rgb_png(albedo, os.path.join(OUT_DIR, "aug_mag_albedo.png"))
    height_to_normal_png(height, strength=2.4, out_path=os.path.join(OUT_DIR, "aug_mag_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "aug_mag_roughness.png"))
    print("[OK] Generated aug_mag_{albedo,normal,roughness}.png")


if __name__ == "__main__":
    build_aug_stock_suite()
    build_aug_mag_suite()
