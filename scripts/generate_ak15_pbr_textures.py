#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for the Kalashnikov AK-15M1 (6П71М · Model 2023–2025, 7.62×39mm) in public/textures/:
  1. ak_receiver_{albedo,normal,roughness}.png (2048x1024)
  2. ak_mag_{albedo,normal,roughness}.png      (1024x1024)
  3. ak_metal_{albedo,normal,roughness}.png    (1024x1024)
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

CYRILLIC_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
]


def load_cyrillic_font(size: int):
    for fp in CYRILLIC_FONTS:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def spectral_noise(h: int, w: int, f_low: float, f_high: float, seed: int, aniso_x: float = 1.0, aniso_y: float = 1.0) -> np.ndarray:
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


# ==============================================================================
# 1. AK-15M1 STAMPED RECEIVER SUITE (2048 x 1024)
# ==============================================================================
def build_ak_receiver_suite():
    W, H = 2048, 1024
    # Authentic Russian Izhevsk flat stamped sheet-steel baked nigrosine enamel over fine manganese phosphate
    phos_grain = spectral_noise(H, W, 220, 480, seed=701)
    oil_sheen = spectral_noise(H, W, 5, 18, seed=703)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.138
    albedo[..., 1] = 0.154
    albedo[..., 2] = 0.182
    albedo += (phos_grain * 0.006 - oil_sheen * 0.005)[..., None]

    # Keep stamped sheet-metal walls optically flat (only micro-phosphate grain, zero wavy dents!)
    height = phos_grain * 0.08
    roughness = np.broadcast_to((0.50 - oil_sheen * 0.04 + phos_grain * 0.02), (H, W)).copy()

    # Subtle stamped oval magazine-well reinforcement dimple on Right (u~0.68, v~0.72) & Left (u~0.32, v~0.26)
    dimple_r = np.exp(-(((u_grid - 0.675) / 0.065) ** 2 + ((v_grid - 0.725) / 0.055) ** 2))
    dimple_l = np.exp(-(((u_grid - 0.325) / 0.065) ** 2 + ((v_grid - 0.265) / 0.055) ** 2))
    dimples = dimple_r + dimple_l
    height -= dimples * 0.85
    albedo -= (dimples * 0.022)[..., None]

    # Subtle top-edge & magwell lip silver edge wear on Right (v in [0.54, 0.96]) and Left (v in [0.08, 0.50])
    edge_r = np.exp(-((v_grid - 0.948) / 0.013) ** 2) + 0.5 * np.exp(-((v_grid - 0.552) / 0.012) ** 2)
    edge_l = np.exp(-((v_grid - 0.488) / 0.013) ** 2) + 0.5 * np.exp(-((v_grid - 0.092) / 0.012) ** 2)
    edge_wear = np.clip((edge_r + edge_l) * (0.38 + 0.22 * np.maximum(0, oil_sheen)), 0.0, 0.68)
    bare_steel = np.array([0.56, 0.61, 0.68], dtype=np.float32)
    albedo = albedo * (1.0 - edge_wear[..., None] * 0.42) + bare_steel * (edge_wear[..., None] * 0.42)
    roughness -= edge_wear * 0.09

    # Draw iconic curved AK safety-selector scratch arc + Cyrillic ПР / АВ / ОД on Right Wall
    # AND Kalashnikov Concern [КК] АК-15 7,62×39 2024 white laser markings on Left Wall!
    stamp_white = Image.new("L", (W, H), 0)
    scratch_mask = Image.new("L", (W, H), 0)
    dw = ImageDraw.Draw(stamp_white)
    ds = ImageDraw.Draw(scratch_mask)

    f_cyr = load_cyrillic_font(30)
    f_logo = load_cyrillic_font(40)
    f_sub = load_cyrillic_font(28)

    # Right side (v in [0.54, 0.96]): selector detents around u = 0.525, v = 0.835 (ПР), 0.755 (АВ), 0.675 (ОД)
    dw.text((int(0.535 * W), int((1.0 - 0.855) * H)), "ПР", fill=225, font=f_cyr)
    dw.text((int(0.538 * W), int((1.0 - 0.775) * H)), "АВ", fill=235, font=f_cyr)
    dw.text((int(0.532 * W), int((1.0 - 0.695) * H)), "ОД", fill=235, font=f_cyr)

    # Iconic AK curved selector detent scratch arc!
    arc_pts = []
    for k in range(28):
        ang = -0.32 + (k / 27.0) * 0.58
        ux = 0.21 + 0.305 * math.cos(ang)
        vy = 0.755 - 0.22 * math.sin(ang)
        arc_pts.append((int(ux * W), int((1.0 - vy) * H)))
    ds.line(arc_pts, fill=240, width=4)
    for pt in [arc_pts[2], arc_pts[14], arc_pts[26]]:
        ds.ellipse([pt[0] - 6, pt[1] - 4, pt[0] + 6, pt[1] + 4], fill=255)

    # Left side (v in [0.08, 0.50]): u = 0.08..0.46 near front trunnion (reads left-to-right on Left view!)
    lx0 = int(0.085 * W)
    ly0 = int((1.0 - 0.385) * H)
    dw.rounded_rectangle([lx0, ly0, lx0 + 68, ly0 + 48], radius=5, outline=245, width=3)
    dw.text((lx0 + 8, ly0 + 4), "КК", fill=250, font=f_logo)
    dw.text((lx0 + 86, ly0 + 2), "АК-15   7,62×39", fill=245, font=f_logo)
    dw.text((lx0 + 86, ly0 + 54), "24  6П71М  08419   СДЕЛАНО В РОССИИ", fill=205, font=f_sub)

    white_arr = np.asarray(stamp_white.filter(ImageFilter.GaussianBlur(radius=0.6)), dtype=np.float32) / 255.0
    scratch_arr = np.asarray(scratch_mask.filter(ImageFilter.GaussianBlur(radius=0.8)), dtype=np.float32) / 255.0

    laser_col = np.array([0.80, 0.83, 0.88], dtype=np.float32)
    albedo = albedo * (1.0 - white_arr[..., None] * 0.78) + laser_col * (white_arr[..., None] * 0.78)
    height -= white_arr * 1.15
    roughness = np.clip(roughness + white_arr * 0.08, 0.12, 0.85)

    albedo = albedo * (1.0 - scratch_arr[..., None] * 0.65) + bare_steel * (scratch_arr[..., None] * 0.65)
    height -= scratch_arr * 1.45
    roughness = np.clip(roughness - scratch_arr * 0.16, 0.12, 0.85)

    # Bottom bright steel swatch (u in [0.78, 1.00], v <= 0.07) for internal rails & ejector!
    rail_sw = (v_grid <= 0.07) & (u_grid >= 0.78)
    albedo[rail_sw] = np.array([0.82, 0.86, 0.91], dtype=np.float32)
    roughness[rail_sw] = 0.18

    save_rgb_png(albedo, os.path.join(OUT_DIR, "ak_receiver_albedo.png"))
    height_to_normal_png(height, strength=2.6, out_path=os.path.join(OUT_DIR, "ak_receiver_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "ak_receiver_roughness.png"))
    print("[OK] Generated ak_receiver_{albedo,normal,roughness}.png")


# ==============================================================================
# 2. AK-15 30-ROUND 7.62x39 WINDOWED POLYMER MAGAZINE SUITE (1024 x 1024)
# ==============================================================================
def build_ak_mag_suite():
    W, H = 1024, 1024
    pebble = spectral_noise(H, W, 75, 310, seed=801)
    scuff = spectral_noise(H, W, 8, 42, seed=802, aniso_x=0.35, aniso_y=2.0)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Matte Russian glass-filled black polyamide ПА6С
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.125
    albedo[..., 1] = 0.140
    albedo[..., 2] = 0.170
    albedo += (pebble * 0.008 + scuff * 0.010)[..., None]

    height = pebble * 0.28 + scuff * 0.16
    roughness = 0.68 + pebble * 0.03 - scuff * 0.04

    # Molded anti-slip horizontal/diagonal ribs across polymer side flanks
    rib_wave = np.sin(v_grid * 18.0 * math.pi)
    rib_mask = (v_grid >= 0.16) & (v_grid <= 0.84) & ((u_grid < 0.36) | (u_grid > 0.64)) & (rib_wave > 0.65)
    height[rib_mask] += 0.95
    albedo[rib_mask] += 0.015

    # Transparent Smoked Polycarbonate Observation Window (u in [0.40, 0.60], v in [0.22, 0.78])
    # revealing stacked golden-brass & copper-jacketed 7.62x39mm cartridges inside!
    win_mask = (u_grid >= 0.40) & (u_grid <= 0.60) & (v_grid >= 0.22) & (v_grid <= 0.78)
    # 12 visible stacked cartridges along v in [0.24, 0.76]
    round_phase = ((v_grid - 0.22) / 0.046) * math.pi * 2.0
    cyl_shade = np.broadcast_to(0.55 + 0.45 * np.cos(round_phase), (H, W))
    # Brass case in center-left of window, copper neck/tip glint toward front
    brass_col = np.array([0.62, 0.46, 0.16], dtype=np.float32)
    smoked_tint = np.array([0.09, 0.09, 0.10], dtype=np.float32)
    cart_rgb = smoked_tint + brass_col * (cyl_shade[..., None] * 0.62)

    # Red follower indicator bar near top-middle of window (at 25-30 rd level or bottom)!
    albedo[win_mask] = cart_rgb[win_mask]
    roughness[win_mask] = 0.13  # Glossy clear polycarbonate!
    height[win_mask] = -0.55

    # Molded round-count witness numbers (10, 15, 20, 25, 30) + 7,62x39 stamp!
    stamp = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(stamp)
    f_num = load_cyrillic_font(22)
    f_cal = load_cyrillic_font(28)

    marks = [("10", 0.72), ("15", 0.60), ("20", 0.48), ("25", 0.36), ("30", 0.25)]
    for txt, vp in marks:
        py = int((1.0 - vp) * H) - 10
        draw.text((int(0.625 * W), py), txt, fill=240, font=f_num)
        draw.line([(int(0.602 * W), py + 11), (int(0.618 * W), py + 11)], fill=230, width=2)

    draw.text((int(0.41 * W), int((1.0 - 0.15) * H)), "7,62×39", fill=235, font=f_cal)

    st_arr = np.asarray(stamp.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    mark_col = np.array([0.66, 0.71, 0.78], dtype=np.float32)
    albedo = albedo * (1.0 - st_arr[..., None] * 0.65) + mark_col * (st_arr[..., None] * 0.65)
    height += st_arr * 0.85

    # Bottom Steel Locking Lugs & Feed Lips Swatch (u >= 0.78, v <= 0.07)
    st_sw = (v_grid <= 0.07) & (u_grid >= 0.78)
    albedo[st_sw] = np.array([0.78, 0.82, 0.88], dtype=np.float32)
    roughness[st_sw] = 0.20

    save_rgb_png(albedo, os.path.join(OUT_DIR, "ak_mag_albedo.png"))
    height_to_normal_png(height, strength=2.3, out_path=os.path.join(OUT_DIR, "ak_mag_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "ak_mag_roughness.png"))
    print("[OK] Generated ak_mag_{albedo,normal,roughness}.png")


# ==============================================================================
# 3. AK-15 BOLT CARRIER & HEAT-TINTED LONG-STROKE GAS PISTON SUITE (1024 x 1024)
# ==============================================================================
def build_ak_metal_suite():
    W, H = 1024, 1024
    lathe = spectral_noise(H, W, 20, 210, seed=901, aniso_x=0.20, aniso_y=2.8)
    grain = spectral_noise(H, W, 65, 280, seed=902)
    soot_noise = spectral_noise(H, W, 14, 90, seed=903)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    # Upper band (v >= 0.50): Machined dark steel bolt carrier body
    albedo[..., 0] = 0.165
    albedo[..., 1] = 0.190
    albedo[..., 2] = 0.230
    albedo += (grain * 0.012 + lathe * 0.010)[..., None]

    height = grain * 0.25 + lathe * 0.35
    roughness = 0.30 + grain * 0.03

    # Lower band (v in [0.08, 0.48]): Chrome-plated stainless Long-Stroke Gas Piston!
    piston_mask = (v_grid >= 0.08) & (v_grid <= 0.48) & (u_grid >= 0.0)
    chrome_rgb = np.array([0.84, 0.87, 0.92], dtype=np.float32)
    albedo[piston_mask] = chrome_rgb + lathe[piston_mask, None] * 0.018
    roughness[piston_mask] = 0.16 + grain[piston_mask] * 0.02

    # Warm golden-bronze thermal bluing near piston neck (u in [0.72, 0.90]) + carbon soot at piston head (u > 0.88)!
    heat_band = piston_mask * np.exp(-((u_grid - 0.83) / 0.065) ** 2)
    bronze_tint = np.array([0.68, 0.50, 0.28], dtype=np.float32)
    albedo = albedo * (1.0 - heat_band[..., None] * 0.55) + bronze_tint * (heat_band[..., None] * 0.55)

    soot_band = piston_mask * np.clip((u_grid - 0.87) / 0.09 + soot_noise * 0.12, 0.0, 1.0)
    soot_rgb = np.array([0.09, 0.095, 0.105], dtype=np.float32)
    albedo = albedo * (1.0 - soot_band[..., None] * 0.82) + soot_rgb * (soot_band[..., None] * 0.82)
    roughness = np.clip(roughness + soot_band * 0.42, 0.12, 0.85)

    save_rgb_png(albedo, os.path.join(OUT_DIR, "ak_metal_albedo.png"))
    height_to_normal_png(height, strength=2.4, out_path=os.path.join(OUT_DIR, "ak_metal_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "ak_metal_roughness.png"))
    print("[OK] Generated ak_metal_{albedo,normal,roughness}.png")


if __name__ == "__main__":
    build_ak_receiver_suite()
    build_ak_mag_suite()
    build_ak_metal_suite()
