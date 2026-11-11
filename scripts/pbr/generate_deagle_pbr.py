#!/usr/bin/env python3
"""
Generates high-resolution 2K multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for #8 Magnum Research / IMI Mark XIX Desert Eagle (.50 Action Express, Polished & Brushed Chrome):
  - public/textures/deagle_chrome_albedo.png    (2048 x 1024)
  - public/textures/deagle_chrome_normal.png    (2048 x 1024)
  - public/textures/deagle_chrome_roughness.png (2048 x 1024)

Atlas UV Layout (v=0 bottom, v=1 top in Three.js UV space):
  - v in [0.65, 0.98], u in [0.02, 0.98]: Right (+Z) Brushed/Polished Silver Chrome Wall
      * Rear slide/frame (u in [0.06, 0.44]): "IMI MADE IN ISRAEL  .50 AE" & "MAGNUM RESEARCH INC." + serial "DK0050919"
      * Red safety firing dot at (u=0.135, v=0.845)
      * Forward barrel flank (u in [0.54, 0.92]): ".50 AE" caliber stamp & satin longitudinal brush
  - v in [0.30, 0.63], u in [0.02, 0.98]: Left (-Z) Brushed/Polished Silver Chrome Wall (u=0 muzzle -> u=1 rear)
      * Forward barrel flank (u in [0.10, 0.44]): ".50 AE" caliber stamp
      * Rear slide breech (u in [0.54, 0.90]): "DESERT EAGLE PISTOL / MAGNUM RESEARCH INC. / IMI MADE IN ISRAEL"
      * Red safety firing dot at (u=0.865, v=0.495)
  - v in [0.02, 0.27], u in [0.02, 0.72]: Matte Black Stippled IMI/MR Rubber Grip Swatch (#181b20)
      * High-frequency elastomer pebble stippling + recessed MRI/IMI Desert Eagle circular medallion
  - v in [0.02, 0.27], u in [0.74, 0.86]: Dark Milled Steel Cuts / Serration Grooves / Bore Swatch
  - v in [0.02, 0.27], u in [0.87, 0.99]: Mirror-Polished Bright Chrome Top Deck / Scope Rail / Front-Strap Swatch
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
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
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


def build_deagle_chrome_suite() -> None:
    W, H = 2048, 1024

    # Ultra-fine longitudinal anisotropic brushed chrome hairlines (zero wavy dents!)
    aniso_brush = spectral_noise(H, W, 90, 340, seed=5001, aniso_x=0.16, aniso_y=3.6)
    micro_polish = spectral_noise(H, W, 240, 500, seed=5002)
    rubber_stipple = spectral_noise(H, W, 180, 460, seed=5003)
    rubber_fine = spectral_noise(H, W, 95, 240, seed=5004)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Base Platinum-Silver Chrome (#b4c0ce -> [180, 192, 206] / 255 = [0.7059, 0.7529, 0.8078])
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 180.0 / 255.0
    albedo[..., 1] = 192.0 / 255.0
    albedo[..., 2] = 206.0 / 255.0
    albedo += (aniso_brush * 0.012 + micro_polish * 0.004)[..., None]

    # Optically flat CNC chrome steel normals (128, 128, 255) on chrome panels — zero brush ripple!
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.clip(0.200 + aniso_brush * 0.010 + micro_polish * 0.004, 0.185, 0.220)

    # Subtle edge/bevel AO framing along Right [0.66..0.97] & Left [0.31..0.62] perimeters + u ends
    edge_ao_r = (
        np.exp(-((v_grid - 0.972) / 0.016) ** 2)
        + np.exp(-((v_grid - 0.658) / 0.016) ** 2)
    ) * ((v_grid >= 0.64) & (v_grid <= 0.99))
    edge_ao_l = (
        np.exp(-((v_grid - 0.622) / 0.016) ** 2)
        + np.exp(-((v_grid - 0.308) / 0.016) ** 2)
    ) * ((v_grid >= 0.29) & (v_grid <= 0.64))
    edge_ao_u = (
        np.exp(-((u_grid - 0.02) / 0.022) ** 2)
        + np.exp(-((u_grid - 0.98) / 0.022) ** 2)
    ) * (v_grid >= 0.29)
    edge_ao = np.clip(edge_ao_r + edge_ao_l + 0.55 * edge_ao_u, 0.0, 1.0)
    ao_steel_col = np.array([0.525, 0.576, 0.639], dtype=np.float32)  # #8693a3 cool bevel shadow
    albedo = albedo * (1.0 - edge_ao[..., None] * 0.30) + ao_steel_col * (edge_ao[..., None] * 0.30)
    roughness = np.clip(roughness + edge_ao * 0.025, 0.18, 0.26)

    # Crisp inboard satin-platinum bevel highlight ridge just inside top/bottom shoulders
    shoulder_r = np.exp(-((v_grid - 0.942) / 0.015) ** 2) + 0.6 * np.exp(-((v_grid - 0.688) / 0.014) ** 2)
    shoulder_l = np.exp(-((v_grid - 0.592) / 0.015) ** 2) + 0.6 * np.exp(-((v_grid - 0.338) / 0.014) ** 2)
    mirror_polish = np.clip(shoulder_r + shoulder_l, 0.0, 1.0)
    mirror_col = np.array([0.788, 0.831, 0.882], dtype=np.float32)  # #c9d4e1 bright platinum ridge
    albedo = albedo * (1.0 - mirror_polish[..., None] * 0.28) + mirror_col * (mirror_polish[..., None] * 0.28)
    roughness = np.clip(roughness - mirror_polish * 0.014, 0.18, 0.25)

    # ==========================================================================
    # Crisp Dark Rollmark Engravings + Crimson Safety Firing Dots
    # ==========================================================================
    engrave_mask = Image.new("L", (W, H), 0)
    red_dot_mask = Image.new("L", (W, H), 0)
    de = ImageDraw.Draw(engrave_mask)
    dr = ImageDraw.Draw(red_dot_mask)

    f_hero = load_font(34)
    f_mid = load_font(25)
    f_small = load_font(20)
    f_cal = load_font(30)

    # 1) LEFT WALL (v in [0.30, 0.63]; u=0.02 is +X muzzle, u=0.98 is -X rear)
    # Rear Slide Breech (X in [-7.5, +1.0] -> u in [0.56, 0.88])
    lx_slide = int(0.545 * W)
    ly_slide = int((1.0 - 0.545) * H)
    # Stylized Magnum Research eagle wing bar + crisp rollmarks
    de.line([(lx_slide, ly_slide - 10), (lx_slide + 470, ly_slide - 10)], fill=215, width=2)
    de.text((lx_slide, ly_slide), "DESERT EAGLE PISTOL", fill=255, font=f_hero)
    de.text((lx_slide, ly_slide + 40), "MAGNUM RESEARCH INC. MINNEAPOLIS MN", fill=240, font=f_mid)
    de.text((lx_slide, ly_slide + 72), "IMI  MADE IN ISRAEL   .50 AE", fill=235, font=f_small)

    # Left Forward Barrel Flank (u in [0.16, 0.36], v ~ 0.49)
    lx_bbl = int(0.20 * W)
    ly_bbl = int((1.0 - 0.505) * H)
    de.text((lx_bbl, ly_bbl), ".50 AE", fill=245, font=f_cal)

    # Left Safety Red Firing Dot (near rear slide safety drum u=0.875, v=0.515)
    ldx = int(0.882 * W)
    ldy = int((1.0 - 0.515) * H)
    dr.ellipse([ldx - 9, ldy - 9, ldx + 9, ldy + 9], fill=255)
    de.ellipse([ldx - 11, ldy - 11, ldx + 11, ldy + 11], outline=180, width=2)

    # 2) RIGHT WALL (v in [0.65, 0.98]; u=0.02 is -X rear, u=0.98 is +X muzzle)
    # Rear Slide & Frame Right Flank (u in [0.16, 0.48])
    rx_slide = int(0.165 * W)
    ry_slide = int((1.0 - 0.885) * H)
    de.text((rx_slide, ry_slide), "MAGNUM RESEARCH INC.", fill=245, font=f_mid)
    de.text((rx_slide, ry_slide + 34), "IMI MADE IN ISRAEL   .50 AE", fill=255, font=f_mid)
    # Serial number along right frame rail deck (v ~ 0.72)
    de.text((int(0.18 * W), int((1.0 - 0.735) * H)), "DK 0050919", fill=225, font=f_small)

    # Right Forward Barrel Flank (u in [0.62, 0.82], v ~ 0.84)
    de.text((int(0.66 * W), int((1.0 - 0.855) * H)), ".50 AE", fill=245, font=f_cal)

    # Right Safety Red Firing Dot (u=0.118, v=0.865)
    rdx = int(0.118 * W)
    rdy = int((1.0 - 0.865) * H)
    dr.ellipse([rdx - 9, rdy - 9, rdx + 9, rdy + 9], fill=255)
    de.ellipse([rdx - 11, rdy - 11, rdx + 11, rdy + 11], outline=180, width=2)

    eng_arr = np.asarray(engrave_mask.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0
    red_arr = np.asarray(red_dot_mask.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0

    # Apply dark laser/rollmark engraving into bright silver chrome
    eng_col = np.array([0.145, 0.168, 0.205], dtype=np.float32)
    albedo = albedo * (1.0 - eng_arr[..., None] * 0.86) + eng_col * (eng_arr[..., None] * 0.86)
    height -= eng_arr * 1.35
    roughness = np.clip(roughness + eng_arr * 0.34, 0.13, 0.85)

    # Apply crimson red enamel safety indicator dot
    red_col = np.array([0.82, 0.11, 0.13], dtype=np.float32)
    albedo = albedo * (1.0 - red_arr[..., None] * 0.95) + red_col * (red_arr[..., None] * 0.95)
    height -= red_arr * 0.85
    roughness = np.clip(roughness * (1.0 - red_arr) + 0.20 * red_arr, 0.13, 0.85)

    # ==========================================================================
    # Bottom Band Swatch 1: Matte Black Stippled IMI/MR Rubber Grip (#181b20)
    # v in [0.00, 0.28], u in [0.00, 0.73]
    # ==========================================================================
    grip_mask = (v_grid <= 0.28) & (u_grid <= 0.73)
    grip_base = np.array([0.094, 0.106, 0.125], dtype=np.float32)  # #181b20

    # Molded stipple border & horizontal finger ribs inside grip swatch
    in_panel = (v_grid >= 0.035) & (v_grid <= 0.245) & (u_grid >= 0.04) & (u_grid <= 0.69)
    stipple_tex = rubber_stipple * 0.52 + rubber_fine * 0.24
    rib_grooves = np.sin(v_grid * 64.0 * math.pi)
    rib_band = in_panel & (u_grid >= 0.06) & (u_grid <= 0.20) & (rib_grooves > 0.72)

    grip_rgb = grip_base[None, None, :] + (rubber_stipple * 0.009 + rubber_fine * 0.006)[..., None]
    albedo[grip_mask] = grip_rgb[grip_mask]
    height[grip_mask] = (stipple_tex * 0.55)[grip_mask]
    roughness[grip_mask] = np.clip(0.73 + rubber_stipple * 0.035, 0.65, 0.82)[grip_mask]

    height[rib_band] += 0.75
    albedo[rib_band] += 0.015

    # Molded circular MRI / IMI Desert Eagle Grip Medallion at (u=0.38, v=0.145)
    med_mask_img = Image.new("L", (W, H), 0)
    dm = ImageDraw.Draw(med_mask_img)
    mcx = int(0.38 * W)
    mcy = int((1.0 - 0.145) * H)
    dm.ellipse([mcx - 54, mcy - 54, mcx + 54, mcy + 54], outline=220, width=4)
    dm.ellipse([mcx - 45, mcy - 45, mcx + 45, mcy + 45], outline=150, width=2)
    # Stylized eagle chevron & IMI/MRI text inside grip medallion
    dm.polygon(
        [(mcx - 30, mcy - 6), (mcx, mcy + 12), (mcx + 30, mcy - 6), (mcx, mcy + 2)],
        fill=215,
    )
    dm.text((mcx - 24, mcy - 30), "IMI", fill=225, font=f_small)
    dm.text((mcx - 26, mcy + 14), "MRI", fill=215, font=f_small)
    med_arr = np.asarray(med_mask_img.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0

    med_col = np.array([0.165, 0.182, 0.212], dtype=np.float32)
    albedo = albedo * (1.0 - med_arr[..., None] * 0.75) + med_col * (med_arr[..., None] * 0.75)
    height += med_arr * 0.90
    roughness = np.clip(roughness - med_arr * 0.16, 0.12, 0.85)

    # ==========================================================================
    # Bottom Band Swatch 2: Dark Milled Cuts / Serrations / Bore (u in (0.73, 0.86], v <= 0.28)
    # ==========================================================================
    milled_mask = (v_grid <= 0.28) & (u_grid > 0.73) & (u_grid <= 0.86)
    albedo[milled_mask] = np.array([0.175, 0.200, 0.238], dtype=np.float32) + micro_polish[milled_mask, None] * 0.008
    height[milled_mask] = 0.0
    roughness[milled_mask] = 0.34

    # ==========================================================================
    # Bottom Band Swatch 3: Platinum-Silver Chrome Top Deck & Scope Rail (u > 0.86, v <= 0.28)
    # ==========================================================================
    deck_mask = (v_grid <= 0.28) & (u_grid > 0.86)
    deck_edge_ao = np.clip(
        np.exp(-((v_grid - 0.03) / 0.018) ** 2) + np.exp(-((v_grid - 0.25) / 0.018) ** 2),
        0.0,
        1.0,
    )
    deck_base = (
        np.array([0.718, 0.765, 0.820], dtype=np.float32)[None, None, :]
        * (1.0 - deck_edge_ao[..., None] * 0.24)
        + np.array([0.535, 0.585, 0.648], dtype=np.float32)[None, None, :] * (deck_edge_ao[..., None] * 0.24)
        + aniso_brush[..., None] * 0.006
    )
    albedo[deck_mask] = deck_base[deck_mask]
    height[deck_mask] = 0.0
    roughness[deck_mask] = 0.198

    # Thin clean neutral border lines between horizontal bands so bilinear filtering never bleeds
    sep1 = np.abs(v_grid[:, 0] - 0.285) < 0.006
    sep2 = np.abs(v_grid[:, 0] - 0.640) < 0.006
    sep = sep1 | sep2
    height[sep, :] = 0.0

    save_rgb_png(albedo, os.path.join(OUT_DIR, "deagle_chrome_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "deagle_chrome_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "deagle_chrome_roughness.png"))
    print("[OK] Generated deagle_chrome_{albedo,normal,roughness}.png (2048x1024)")


if __name__ == "__main__":
    build_deagle_chrome_suite()
