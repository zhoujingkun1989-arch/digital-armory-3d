#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for the Colt M4A1 Carbine (14.5" KAC RAS · 5.56×45mm NATO) in public/textures/:
  1. m4a1_receiver_{albedo,normal,roughness}.png (2048x1024)
     - Flat MIL-A-8625 Type-III Class-2 dark charcoal hard-coat anodized 7075-T6 forged aluminum
     - Crisp roll-marked / laser-engraved Colt Rampant Emblem + PROPERTY OF U.S. GOVT. / M4A1 CARBINE / CAL. 5.56MM
     - Crisp SAFE / SEMI / AUTO fire-control markings on both left & right selector bosses + DoD UID CAGE 13629 matrix
     - Optically flat forged walls (zero wavy low-frequency normal noise!)
  2. m4a1_mag_{albedo,normal,roughness}.png (1024x1024)
     - Classic USGI 30-Round STANAG 4179 Perma-Slik dry-film grey aluminum magazine
     - Crisp lengthwise stamped STANAG stiffening ribs, seam spot-welds, magwell insertion rub wear & CAGE 13629 stamp
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


def micro_grain(h: int, w: int, seed: int) -> np.ndarray:
    """High-frequency micro-bead-blast grain ONLY (zero low-frequency waviness!)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.rfftfreq(w)[None, :] * w
    freq = np.sqrt(fx * fx + fy * fy)
    # High-pass micro-grain band (f in [260..520]) so flat walls stay 100% planar
    envelope = np.exp(-0.5 * ((freq - 360.0) / 95.0) ** 2)
    envelope[freq < 180.0] = 0.0
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
# 1. COLT M4A1 FORGED 7075-T6 RECEIVER SUITE (2048 x 1024)
# ==============================================================================
def build_m4a1_receiver_suite() -> None:
    W, H = 2048, 1024
    grain = micro_grain(H, W, seed=401)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # MIL-A-8625 Type-III Class-2 Dark Charcoal Slate Anodized 7075-T6 Aluminum
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.168
    albedo[..., 1] = 0.178
    albedo[..., 2] = 0.196
    albedo += (grain * 0.0045)[..., None]

    # Optically flat forged walls: virtually zero height noise outside crisp engravings!
    height = grain * 0.018
    roughness = np.full((H, W), 0.46, dtype=np.float32) + grain * 0.012

    # Subtle upper-lower subtle batch tone nuance (forged upper slightly warmer slate if mapped to upper v band)
    edge_r = np.exp(-((v_grid - 0.945) / 0.010) ** 2) + 0.55 * np.exp(-((v_grid - 0.545) / 0.010) ** 2)
    edge_l = np.exp(-((v_grid - 0.495) / 0.010) ** 2) + 0.55 * np.exp(-((v_grid - 0.085) / 0.010) ** 2)
    edge_wear = np.clip((edge_r + edge_l) * 0.34, 0.0, 0.55)
    bare_alu = np.array([0.58, 0.62, 0.67], dtype=np.float32)
    albedo = albedo * (1.0 - edge_wear[..., None] * 0.38) + bare_alu * (edge_wear[..., None] * 0.38)
    roughness -= edge_wear * 0.08

    # Roll-marks, Laser Engravings & T-Slot Numbers
    engrave_mask = Image.new("L", (W, H), 0)
    white_laser = Image.new("L", (W, H), 0)
    de = ImageDraw.Draw(engrave_mask)
    dl = ImageDraw.Draw(white_laser)

    f_title = load_font(34)
    f_main = load_font(27)
    f_sub = load_font(21)
    f_sel = load_font(22)
    f_tiny = load_font(17)

    # --------------------------------------------------------------------------
    # LEFT WALL (v in [0.08, 0.50]):
    # Note: On Left (-Z) view, +X (magwell) is screen-LEFT (u ~ 0.06..0.38),
    # and -X (selector/stock) is screen-RIGHT (u ~ 0.64..0.90).
    # --------------------------------------------------------------------------
    mx0 = int(0.075 * W)
    my0 = int((1.0 - 0.445) * H)

    # Stylized Colt Rampant Pony & Globe Emblem Circle
    de.ellipse([mx0, my0, mx0 + 68, my0 + 68], outline=235, width=3)
    de.ellipse([mx0 + 8, my0 + 8, mx0 + 60, my0 + 60], outline=185, width=2)
    de.text((mx0 + 13, my0 + 21), "COLT", fill=245, font=f_tiny)

    # Roll-marked U.S. Government Property & M4A1 Carbine Block
    tx0 = mx0 + 84
    de.text((tx0, my0 - 4), "PROPERTY  OF  U.S.  GOVT.", fill=235, font=f_sub)
    de.text((tx0, my0 + 22), "M4A1   CARBINE", fill=255, font=f_title)
    de.text((tx0, my0 + 62), "CAL.  5.56 MM.", fill=245, font=f_main)
    de.text((tx0, my0 + 95), "W 421908", fill=235, font=f_main)

    # Manufacturer address roll-mark above trigger / magwell web
    de.text(
        (mx0 + 6, my0 + 136),
        "COLT  DEFENSE   HARTFORD, CONN.   U.S.A.",
        fill=215,
        font=f_tiny,
    )

    # Left Selector Markings around selector hub (u = 0.748, v = 0.408):
    # SAFE (+right/-X => u ~ 0.808), SEMI (top => v ~ 0.468), AUTO (+left/+X => u ~ 0.658)
    lsx = int(0.748 * W)
    lsy = int((1.0 - 0.408) * H)
    de.arc([lsx - 42, lsy - 42, lsx + 42, lsy + 42], start=165, end=15, fill=200, width=2)
    dl.text((lsx - 28, lsy - 68), "SEMI", fill=235, font=f_sel)
    dl.text((lsx + 52, lsy - 11), "SAFE", fill=235, font=f_sel)
    dl.text((lsx - 116, lsy - 11), "AUTO", fill=245, font=f_sel)

    # --------------------------------------------------------------------------
    # RIGHT WALL (v in [0.54, 0.96]):
    # On Right (+Z) view, -X (selector/stock) is screen-LEFT (u ~ 0.252),
    # and +X (magwell) is screen-RIGHT (u ~ 0.66..0.92).
    # --------------------------------------------------------------------------
    rsx = int(0.252 * W)
    rsy = int((1.0 - 0.868) * H)
    de.arc([rsx - 42, rsy - 42, rsx + 42, rsy + 42], start=165, end=15, fill=200, width=2)
    dl.text((rsx - 28, rsy - 68), "SEMI", fill=235, font=f_sel)
    dl.text((rsx - 114, rsy - 11), "SAFE", fill=235, font=f_sel)
    dl.text((rsx + 52, rsy - 11), "AUTO", fill=245, font=f_sel)

    # U.S. DoD IUID DataMatrix Sticker / Laser Plate on Right Magwell (u ~ 0.72, v ~ 0.74)
    ux0 = int(0.695 * W)
    uy0 = int((1.0 - 0.805) * H)
    dl.rounded_rectangle([ux0, uy0, ux0 + 275, uy0 + 96], radius=6, outline=220, width=3)
    # Crisp 2D DataMatrix square
    dm_x, dm_y = ux0 + 14, uy0 + 14
    dl.rectangle([dm_x, dm_y, dm_x + 68, dm_y + 68], outline=240, width=2)
    rng_dm = np.random.default_rng(13629)
    for r in range(8):
        for c in range(8):
            if rng_dm.random() > 0.45:
                dl.rectangle(
                    [dm_x + 4 + c * 8, dm_y + 4 + r * 8, dm_x + 10 + c * 8, dm_y + 10 + r * 8],
                    fill=235,
                )
    dl.text((dm_x + 84, dm_y + 2), "U.S.  M4A1", fill=240, font=f_sub)
    dl.text((dm_x + 84, dm_y + 28), "CAGE  13629", fill=225, font=f_tiny)
    dl.text((dm_x + 84, dm_y + 50), "SER  W421908", fill=225, font=f_tiny)

    # Top Flat-Top Rail White Laser T-Marks (v in [0.955, 0.995])
    for idx, t_num in enumerate(["T2", "T4", "T6", "T8", "T10", "T12"]):
        tu = int((0.18 + idx * 0.12) * W)
        ty = int((1.0 - 0.982) * H)
        dl.text((tu, ty), t_num, fill=240, font=f_tiny)

    eng_arr = np.asarray(engrave_mask.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0
    las_arr = np.asarray(white_laser.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0

    # Deep roll-mark stamp: slightly lighter silver-grey anodized recess + crisp normal bevel
    stamp_col = np.array([0.52, 0.56, 0.61], dtype=np.float32)
    albedo = albedo * (1.0 - eng_arr[..., None] * 0.62) + stamp_col * (eng_arr[..., None] * 0.62)
    height -= eng_arr * 1.35
    roughness = np.clip(roughness + eng_arr * 0.06, 0.14, 0.85)

    # Crisp white-silver laser engraving (SAFE/SEMI/AUTO, UID & T-marks)
    laser_col = np.array([0.82, 0.85, 0.89], dtype=np.float32)
    albedo = albedo * (1.0 - las_arr[..., None] * 0.78) + laser_col * (las_arr[..., None] * 0.78)
    height -= las_arr * 0.85
    roughness = np.clip(roughness + las_arr * 0.05, 0.14, 0.85)

    # Bottom right swatch (u >= 0.78, v <= 0.06): Bright machined steel / barrel extension / pins
    steel_sw = (v_grid <= 0.06) & (u_grid >= 0.78)
    albedo[steel_sw] = np.array([0.78, 0.82, 0.87], dtype=np.float32)
    roughness[steel_sw] = 0.22

    save_rgb_png(albedo, os.path.join(OUT_DIR, "m4a1_receiver_albedo.png"))
    height_to_normal_png(height, strength=2.4, out_path=os.path.join(OUT_DIR, "m4a1_receiver_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "m4a1_receiver_roughness.png"))
    print("[OK] Generated m4a1_receiver_{albedo,normal,roughness}.png")


# ==============================================================================
# 2. USGI 30-ROUND STANAG DRY-FILM GREY ALUMINUM MAGAZINE SUITE (1024 x 1024)
# ==============================================================================
def build_m4a1_mag_suite() -> None:
    W, H = 1024, 1024
    grain = micro_grain(H, W, seed=409)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Classic USGI Perma-Slik G Dry-Film Lubricant Warm-Cool Gunmetal Grey Aluminum
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.335
    albedo[..., 1] = 0.352
    albedo[..., 2] = 0.372
    albedo += (grain * 0.006)[..., None]

    # Clean flat sheet-aluminum base normal
    height = grain * 0.022
    roughness = np.full((H, W), 0.44, dtype=np.float32) + grain * 0.015

    # Upper magwell insertion rub band (v in [0.73, 0.96]): smoother burnished aluminum sheen
    magwell_band = np.clip((v_grid - 0.72) / 0.04, 0.0, 1.0) * np.clip((0.97 - v_grid) / 0.03, 0.0, 1.0)
    vert_streaks = 0.5 + 0.5 * np.sin(u_grid * 62.0 * math.pi) * np.sin(u_grid * 19.0 * math.pi)
    burnish = magwell_band * (0.28 + 0.35 * vert_streaks)
    bright_alu = np.array([0.56, 0.59, 0.64], dtype=np.float32)
    albedo = albedo * (1.0 - burnish[..., None] * 0.36) + bright_alu * (burnish[..., None] * 0.36)
    roughness -= burnish * 0.11

    # 5 Lengthwise Stamped STANAG Stiffening Ribs along u = [0.22, 0.36, 0.50, 0.64, 0.78], v in [0.12, 0.69]
    v_rib_env = np.clip((v_grid - 0.11) / 0.035, 0.0, 1.0) * np.clip((0.70 - v_grid) / 0.035, 0.0, 1.0)
    rib_total = np.zeros((H, W), dtype=np.float32)
    for ru in [0.22, 0.36, 0.50, 0.64, 0.78]:
        profile = np.exp(-((u_grid - ru) / 0.022) ** 2)
        rib_total += profile * v_rib_env

    rib_total = np.clip(rib_total, 0.0, 1.0)
    height += rib_total * 1.45
    # Subtle anodized/dry-film highlight on rib crowns & shadow in valleys
    albedo += (rib_total * 0.032)[..., None]
    roughness -= rib_total * 0.05

    # Horizontal magwell stop-rib bead at v = 0.725
    stop_bead = np.exp(-((v_grid - 0.725) / 0.012) ** 2) * ((u_grid > 0.10) & (u_grid < 0.90))
    height += stop_bead * 1.25
    albedo += (stop_bead * 0.038)[..., None]

    # Front & Rear Spine Spot-Weld Dimples (u ~ 0.09 and u ~ 0.91)
    spot_total = np.zeros((H, W), dtype=np.float32)
    for sv in [0.18, 0.30, 0.42, 0.54, 0.66, 0.80]:
        for su in [0.09, 0.91]:
            spot = np.exp(-(((u_grid - su) / 0.014) ** 2 + ((v_grid - sv) / 0.014) ** 2))
            spot_total += spot
    height -= spot_total * 0.95
    albedo -= (spot_total * 0.04)[..., None]

    # Stamped USGI Colt / CAGE 13629 Markings near lower flank
    stamp = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(stamp)
    f_mag = load_font(22)
    f_small = load_font(17)
    ds.text((int(0.26 * W), int((1.0 - 0.095) * H)), "5.56 MM    CAGE  33710", fill=225, font=f_mag)
    ds.text((int(0.24 * W), int((1.0 - 0.062) * H)), "COLT'S  MFG.  CO.  INC.   HARTFORD, CT", fill=195, font=f_small)

    st_arr = np.asarray(stamp.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    albedo -= (st_arr * 0.055)[..., None]
    height -= st_arr * 0.95

    save_rgb_png(albedo, os.path.join(OUT_DIR, "m4a1_mag_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "m4a1_mag_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "m4a1_mag_roughness.png"))
    print("[OK] Generated m4a1_mag_{albedo,normal,roughness}.png")


if __name__ == "__main__":
    build_m4a1_receiver_suite()
    build_m4a1_mag_suite()
