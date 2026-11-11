#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR texture suites (Albedo, OpenGL Tangent-Space Normal, Roughness)
for the G17 3D Exploded View & Armory Showcase:
  - slide_{albedo,normal,roughness}.png   (2048x1024)
  - barrel_{albedo,normal,roughness}.png  (1024x1024)
  - frame_{albedo,normal,roughness}.png   (1536x1536)
  - mag_{albedo,normal,roughness}.png     (1024x1024)
  - metal_detail_{normal,roughness}.png   (512x512 seamless)
  - polymer_detail_{normal,roughness}.png (512x512 seamless)
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "textures",
)
os.makedirs(OUT_DIR, exist_ok=True)

FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
FONT_ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def load_font(path: str, size: int):
    for candidate in [path, FONT_DIN, FONT_ARIAL]:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def spectral_noise(h: int, w: int, min_freq: float, max_freq: float, seed: int, aniso_x: float = 1.0, aniso_y: float = 1.0) -> np.ndarray:
    """Fast band-limited seamless noise via inverse 2D FFT in [-1, 1]."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h * aniso_y
    fx = np.fft.fftfreq(w)[None, :] * w * aniso_x
    freq = np.hypot(fx, fy)
    mask = (freq >= min_freq) & (freq <= max_freq)
    amp = np.zeros((h, w), dtype=np.float32)
    amp[mask] = 1.0 / np.maximum(freq[mask], 1.0) ** 0.85
    phases = rng.uniform(0, 2 * np.pi, size=(h, w)).astype(np.float32)
    spectrum = amp * (np.cos(phases) + 1j * np.sin(phases))
    field = np.fft.ifft2(spectrum).real.astype(np.float32)
    std = float(np.std(field)) + 1e-6
    return np.clip(field / (2.6 * std), -1.0, 1.0)


def height_to_normal_png(height: np.ndarray, strength: float, out_path: str) -> None:
    """Converts scalar heightfield (H, W) into OpenGL (+Y up) tangent-space RGB normal map."""
    # Central differences with wrap for seamless / clean borders
    dh_dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    dh_dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    # Image Y goes down, Three.js UV V goes up -> ny = +dh_dy, nx = -dh_dx
    nx = -dh_dx
    ny = dh_dy
    nz = np.ones_like(height, dtype=np.float32)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.empty((height.shape[0], height.shape[1], 3), dtype=np.uint8)
    rgb[..., 0] = np.clip((nx * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 1] = np.clip((ny * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[..., 2] = np.clip((nz * inv_len * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(out_path, optimize=True)


def save_gray_png(arr01: np.ndarray, out_path: str) -> None:
    u8 = np.clip(arr01 * 255.0, 0, 255).astype(np.uint8)
    rgb = np.stack([u8, u8, u8], axis=-1)
    Image.fromarray(rgb, mode="RGB").save(out_path, optimize=True)


def save_rgb_png(rgb01: np.ndarray, out_path: str) -> None:
    u8 = np.clip(rgb01 * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(u8, mode="RGB").save(out_path, optimize=True)


def draw_glock_g_emblem(draw: ImageDraw.ImageDraw, x0: int, y0: int, size: int, width: int = 5):
    """Draws a crisp technical geometric G-box firearm rollmark emblem."""
    r = max(4, size // 10)
    draw.rounded_rectangle([x0, y0, x0 + size, y0 + int(size * 0.84)], radius=r, outline=255, width=width)
    pad = int(size * 0.19)
    gx0, gy0 = x0 + pad, y0 + pad
    gx1, gy1 = x0 + size - pad, y0 + int(size * 0.84) - pad
    mid_y = (gy0 + gy1) // 2
    # Inner stylized 'G' + '17' bars
    draw.line([(gx1, gy0), (gx0, gy0), (gx0, gy1), (gx1, gy1), (gx1, mid_y), (gx0 + int((gx1 - gx0) * 0.45), mid_y)], fill=255, width=max(3, width - 1))


def draw_proof_shield(draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int):
    """Draws a crisp European proof-house shield crest."""
    pts = [
        (cx - rad, cy - rad),
        (cx + rad, cy - rad),
        (cx + rad, cy + int(rad * 0.25)),
        (cx, cy + int(rad * 1.25)),
        (cx - rad, cy + int(rad * 0.25)),
    ]
    draw.polygon(pts, outline=255, width=3)
    draw.line([(cx, cy - rad + 4), (cx, cy + rad - 2)], fill=255, width=2)
    draw.line([(cx - rad + 4, cy - 2), (cx + rad - 4, cy - 2)], fill=255, width=2)


# ==============================================================================
# 1. SLIDE TEXTURE SUITE (2048 x 1024)
# ==============================================================================
def build_slide_suite():
    W, H = 2048, 1024
    # Fine Tenifer parkerized micro-grain + subtle longitudinal CNC grinding lines + oil clouds
    grain_fine = spectral_noise(H, W, 90, 420, seed=101)
    brush_long = spectral_noise(H, W, 18, 180, seed=102, aniso_x=0.14, aniso_y=2.8)
    oil_cloud = spectral_noise(H, W, 2, 14, seed=103)
    micro_scratch = spectral_noise(H, W, 40, 260, seed=104, aniso_x=0.4, aniso_y=1.8)

    # Base dark Tenifer gunmetal steel sRGB (~ #2c3440 = 0.173, 0.204, 0.251)
    base_rgb = np.zeros((H, W, 3), dtype=np.float32)
    base_rgb[..., 0] = 0.172
    base_rgb[..., 1] = 0.202
    base_rgb[..., 2] = 0.248

    mod = grain_fine * 0.014 + brush_long * 0.016 - oil_cloud * 0.018
    albedo = base_rgb + mod[..., None]

    # Height & roughness maps
    height = grain_fine * 0.35 + brush_long * 0.42 + micro_scratch * 0.15
    roughness = 0.31 - oil_cloud * 0.065 + grain_fine * 0.035 - brush_long * 0.02

    # Coordinate grids: u in [0, 1] left->right, v in [0, 1] bottom->top!
    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Subtle holstered silver-steel edge burnishing along upper shoulder curve & muzzle bullnose!
    # Right side band: v in [0.55, 0.98] -> yNorm = (v - 0.55)/0.43; muzzle at u -> 0.98
    y_norm_r = (v_grid - 0.55) / 0.43
    shoulder_r = np.exp(-((y_norm_r - 0.855) / 0.042) ** 2) * ((v_grid >= 0.55) & (v_grid <= 0.98))
    muzzle_r = np.exp(-((u_grid - 0.968) / 0.020) ** 2) * ((v_grid >= 0.56) & (v_grid <= 0.96))

    # Left side band: v in [0.08, 0.51] -> yNorm = (v - 0.08)/0.43; muzzle at u -> 0.02!
    y_norm_l = (v_grid - 0.08) / 0.43
    shoulder_l = np.exp(-((y_norm_l - 0.855) / 0.042) ** 2) * ((v_grid >= 0.08) & (v_grid <= 0.51))
    muzzle_l = np.exp(-((u_grid - 0.032) / 0.020) ** 2) * ((v_grid >= 0.09) & (v_grid <= 0.49))

    edge_wear = np.clip(
        (shoulder_r + shoulder_l) * (0.45 + 0.35 * np.maximum(0, oil_cloud))
        + (muzzle_r + muzzle_l) * (0.55 + 0.3 * np.maximum(0, grain_fine)),
        0.0,
        0.85,
    )
    silver_steel = np.array([0.48, 0.53, 0.60], dtype=np.float32)
    albedo = albedo * (1.0 - edge_wear[..., None] * 0.48) + silver_steel * (edge_wear[..., None] * 0.48)
    roughness -= edge_wear * 0.10

    # Faint warm brass-case kiss marks right behind right-side ejection port (u ~ 0.37, y_norm_r ~ 0.66)
    brass_zone = (
        np.exp(-((u_grid - 0.368) / 0.012) ** 2)
        * np.exp(-((y_norm_r - 0.68) / 0.08) ** 2)
        * np.clip(grain_fine + 0.25, 0.0, 1.0)
    )
    brass_tint = np.array([0.58, 0.47, 0.26], dtype=np.float32)
    albedo = albedo * (1.0 - brass_zone[..., None] * 0.38) + brass_tint * (brass_zone[..., None] * 0.38)

    # Bottom strip dark milled swatch (u in [0.52, 0.99], v in [0.00, 0.075]) for serration roots & internal cuts
    milled_mask = (v_grid < 0.076) & (u_grid >= 0.52)
    albedo[milled_mask] = np.array([0.085, 0.100, 0.128], dtype=np.float32) + grain_fine[milled_mask, None] * 0.01
    roughness[milled_mask] = 0.46

    # Stamped Rollmarks Mask (0..255 grayscale, white = engraved concave groove!)
    stamp_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(stamp_img)
    f_big = load_font(FONT_DIN, 62)
    f_med = load_font(FONT_DIN, 42)
    f_ser = load_font(FONT_DIN, 30)

    # Band 2 (Left side wall: v in [0.08, 0.51] -> py in [502, 942]; slab center yNorm=0.58 -> v=0.33 -> py=686)
    py_left = int((1.0 - 0.335) * H)
    draw_glock_g_emblem(draw, int(0.115 * W), py_left - 34, 86, width=5)
    draw.text((int(0.205 * W), py_left - 28), "17", fill=255, font=f_big)
    draw.text((int(0.295 * W), py_left - 16), "AUSTRIA", fill=255, font=f_med)
    draw.text((int(0.475 * W), py_left - 16), "9×19", fill=255, font=f_med)

    # Band 1 (Right side wall: v in [0.55, 0.98] -> flat vertical slab center yNorm~0.52 -> v=0.775)
    py_right = int((1.0 - 0.775) * H)
    px_right = int(0.585 * W)
    draw_proof_shield(draw, px_right, py_right + 14, 15)
    draw.text((px_right + 28, py_right - 2), "KPV 892", fill=255, font=f_ser)

    stamp_soft = np.asarray(stamp_img.filter(ImageFilter.GaussianBlur(radius=0.85)), dtype=np.float32) / 255.0
    # Concave depression into heightfield + subtle laser/parkerized contrast in albedo & roughness!
    height -= stamp_soft * 2.35
    engraved_col = np.array([0.34, 0.39, 0.46], dtype=np.float32)
    albedo = albedo * (1.0 - stamp_soft[..., None] * 0.65) + engraved_col * (stamp_soft[..., None] * 0.65)
    roughness = np.clip(roughness + stamp_soft * 0.16, 0.12, 0.85)

    save_rgb_png(albedo, os.path.join(OUT_DIR, "slide_albedo.png"))
    height_to_normal_png(height, strength=3.4, out_path=os.path.join(OUT_DIR, "slide_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "slide_roughness.png"))
    print("[OK] Generated slide_{albedo,normal,roughness}.png")


# ==============================================================================
# 2. BARREL TEXTURE SUITE (1024 x 1024)
# ==============================================================================
def build_barrel_suite():
    W, H = 1024, 1024
    grain = spectral_noise(H, W, 60, 320, seed=201)
    lathe_radial = spectral_noise(H, W, 24, 220, seed=202, aniso_x=3.2, aniso_y=0.18)
    wear_streak = spectral_noise(H, W, 12, 120, seed=203, aniso_x=0.18, aniso_y=2.4)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.215
    albedo[..., 1] = 0.252
    albedo[..., 2] = 0.308
    albedo += (grain * 0.015 + lathe_radial * 0.012)[..., None]

    height = grain * 0.28 + lathe_radial * 0.38
    roughness = 0.24 + grain * 0.03 - wear_streak * 0.025

    # Upper-right quadrant (u in [0.50, 0.98], v in [0.52, 0.98]): Top of Chamber Hood lockup rub marks
    hood_top_mask = (u_grid >= 0.50) & (v_grid >= 0.52)
    rub_band = (
        hood_top_mask
        * (np.exp(-((u_grid - 0.62) / 0.06) ** 2) + 0.7 * np.exp(-((u_grid - 0.84) / 0.05) ** 2))
        * np.clip(0.55 + 0.45 * wear_streak, 0.0, 1.0)
    )

    # Lower band (v in [0.11, 0.49]): Cylindrical outer barrel tube with "Glock smile" cycling wear rings!
    tube_mask = (v_grid >= 0.11) & (v_grid <= 0.49)
    smile_rings = (
        tube_mask
        * (
            0.85 * np.exp(-((u_grid - 0.85) / 0.032) ** 2)
            + 0.55 * np.exp(-((u_grid - 0.76) / 0.022) ** 2)
            + 0.45 * np.exp(-((u_grid - 0.42) / 0.045) ** 2)
        )
        * np.clip(0.6 + 0.4 * lathe_radial, 0.0, 1.0)
    )

    burnish = np.clip(rub_band * 0.65 + smile_rings * 0.72, 0.0, 0.85)
    bright_steel = np.array([0.62, 0.68, 0.75], dtype=np.float32)
    albedo = albedo * (1.0 - burnish[..., None] * 0.55) + bright_steel * (burnish[..., None] * 0.55)
    roughness = np.clip(roughness - burnish * 0.10, 0.10, 0.80)

    # Chamber Hood Right Side Stamp (u in [0.05, 0.47], v in [0.56, 0.94]) -> visible inside Ejection Port!
    stamp_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(stamp_img)
    f_cal = load_font(FONT_DIN, 36)
    f_ser = load_font(FONT_DIN, 26)
    # Place at u ~ 0.15..0.40, v ~ 0.76 (py ~ 245)
    draw.text((int(0.14 * W), int(0.21 * H)), "9×19", fill=255, font=f_cal)
    draw_proof_shield(draw, int(0.31 * W), int(0.232 * H), 12)
    draw.text((int(0.14 * W), int(0.275 * H)), "KPV 892", fill=255, font=f_ser)

    stamp_soft = np.asarray(stamp_img.filter(ImageFilter.GaussianBlur(radius=0.75)), dtype=np.float32) / 255.0
    height -= stamp_soft * 2.1
    stamp_col = np.array([0.46, 0.52, 0.60], dtype=np.float32)
    albedo = albedo * (1.0 - stamp_soft[..., None] * 0.7) + stamp_col * (stamp_soft[..., None] * 0.7)
    roughness = np.clip(roughness + stamp_soft * 0.14, 0.10, 0.85)

    # Swatch 1 (u in [0.64, 0.83], v in [0.00, 0.10]): Dark 9mm Bore Interior
    bore_mask = (v_grid <= 0.10) & (u_grid >= 0.64) & (u_grid <= 0.83)
    albedo[bore_mask] = np.array([0.075, 0.088, 0.110], dtype=np.float32)
    roughness[bore_mask] = 0.62

    # Swatch 2 (u in [0.85, 1.00], v in [0.00, 0.10]): Mirror-Polished Feed Ramp & Muzzle Crown!
    pol_mask = (v_grid <= 0.10) & (u_grid >= 0.85)
    albedo[pol_mask] = np.array([0.88, 0.91, 0.95], dtype=np.float32) + wear_streak[pol_mask, None] * 0.02
    roughness[pol_mask] = 0.11
    height[pol_mask] = wear_streak[pol_mask] * 0.08

    save_rgb_png(albedo, os.path.join(OUT_DIR, "barrel_albedo.png"))
    height_to_normal_png(height, strength=3.1, out_path=os.path.join(OUT_DIR, "barrel_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "barrel_roughness.png"))
    print("[OK] Generated barrel_{albedo,normal,roughness}.png")


# ==============================================================================
# 3. POLYMER RECEIVER & GEN3 STIPPLED GRIP SUITE (1536 x 1536)
# ==============================================================================
def build_frame_suite():
    W, H = 1536, 1536
    # EDM mold fine pebble leatherette grain + aggressive Gen3 grip pyramidal stipple
    pebble = spectral_noise(H, W, 95, 380, seed=301)
    pebble_med = spectral_noise(H, W, 38, 120, seed=302)
    stipple_hi = spectral_noise(H, W, 140, 520, seed=303)
    hand_sheen = spectral_noise(H, W, 3, 16, seed=304)

    # Cellular granite/stipple bump pattern: sharp raised micro-pyramids
    stipple_cells = 1.0 - np.abs(stipple_hi * 0.7 + pebble * 0.45)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Base deep charcoal-black glass-filled Nylon-66 polymer (#21252d = 0.129, 0.145, 0.176)
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.132
    albedo[..., 1] = 0.148
    albedo[..., 2] = 0.178
    albedo += (pebble * 0.008 + pebble_med * 0.006 - hand_sheen * 0.010)[..., None]

    height = pebble * 0.28 + pebble_med * 0.22
    roughness = 0.68 - hand_sheen * 0.05 + pebble * 0.03

    # Compute exact world (x, y) on Right Flank (v in [0.52, 0.98]) and Left Flank (v in [0.04, 0.50])
    # x in [-8.70, +11.20] (span 19.90), y in [-9.45, +1.15] (span 10.60)
    is_right = (v_grid >= 0.52) & (v_grid <= 0.98)
    is_left = (v_grid >= 0.04) & (v_grid <= 0.50)

    x_norm = np.where(is_right, (u_grid - 0.02) / 0.96, (0.98 - u_grid) / 0.96)
    y_norm = np.where(is_right, (v_grid - 0.52) / 0.46, (v_grid - 0.04) / 0.46)
    world_x = -8.70 + x_norm * 19.90
    world_y = -9.45 + y_norm * 10.60

    # Transform (world_x, world_y) into Grip Inset local coordinates around (-5.32, -4.92) rotated by -20 deg!
    dx = world_x - (-5.32)
    dy = world_y - (-4.92)
    ang = 20.0 * math.pi / 180.0  # inverse of -20 deg
    gx = dx * math.cos(ang) - dy * math.sin(ang)
    gy = dx * math.sin(ang) + dy * math.cos(ang)

    in_grip_panel = (is_right | is_left) & (np.abs(gx) < 0.98) & (gy > -2.46) & (gy < 2.32)

    # Apply aggressive Gen3 rough stipple inside grip panel!
    albedo[in_grip_panel] = (
        np.array([0.088, 0.100, 0.124], dtype=np.float32)
        + stipple_cells[in_grip_panel, None] * 0.018
    )
    height[in_grip_panel] = stipple_cells[in_grip_panel] * 0.95 + pebble[in_grip_panel] * 0.22
    roughness[in_grip_panel] = 0.76 + stipple_hi[in_grip_panel] * 0.04

    # Molded Recessed Medallion Box on lower-rear corner of Grip Panel!
    # In world grip coords: rear of grip is gx in [-0.76, -0.10], lower is gy in [-2.18, -1.38]
    in_medallion = in_grip_panel & (gx > -0.76) & (gx < -0.10) & (gy > -2.18) & (gy < -1.38)
    albedo[in_medallion] = np.array([0.115, 0.130, 0.158], dtype=np.float32)
    height[in_medallion] = pebble[in_medallion] * 0.12 - 0.65
    roughness[in_medallion] = 0.42

    # Stamp crisp molded 'G17' logo inside Left Grip Medallion & 'GEN3 / AUSTRIA' inside Right Grip Medallion,
    # PLUS laser-etched 'KPV 892 US' on the Under-Rail Serial Plate Swatch (u in [0.62, 0.84], v in [0.004, 0.036])!
    # Find pixel bounding box of Left & Right medallions:
    stamp_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(stamp_img)
    f_med_logo = load_font(FONT_DIN, 24)
    f_tiny = load_font(FONT_COND, 18)
    f_serial = load_font(FONT_DIN, 28)

    for side_mask, label_top, label_bot in [
        (is_left & in_medallion, "G17", "AUSTRIA"),
        (is_right & in_medallion, "GEN 3", "9×19"),
    ]:
        ys, xs = np.where(side_mask)
        if len(xs) > 20:
            cx, cy = int(np.mean(xs)), int(np.mean(ys))
            draw.rounded_rectangle([cx - 26, cy - 24, cx + 26, cy + 24], radius=4, outline=220, width=2)
            draw.text((cx - 18, cy - 19), label_top, fill=255, font=f_tiny)
            draw.text((cx - 20, cy + 1), label_bot, fill=210, font=f_tiny)

    # Bottom Swatch 1 (u in [0.60, 0.84], v in [0.002, 0.036]): Under-rail Stainless Serial Plate!
    ser_mask = (v_grid <= 0.036) & (u_grid >= 0.60) & (u_grid <= 0.84)
    albedo[ser_mask] = np.array([0.78, 0.82, 0.88], dtype=np.float32) + pebble[ser_mask, None] * 0.015
    roughness[ser_mask] = 0.22
    height[ser_mask] = 0.0

    # Engrave serial text in Swatch 1
    sx0 = int(0.635 * W)
    sy0 = int((1.0 - 0.029) * H)
    draw.text((sx0, sy0), "KPV 892 US", fill=255, font=f_serial)

    stamp_arr = np.asarray(stamp_img.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    # Raised molded letters inside polymer medallions, dark etched letters inside stainless serial swatch!
    poly_stamp = stamp_arr * (~ser_mask)
    height += poly_stamp * 1.15
    albedo += poly_stamp[..., None] * 0.06

    ser_stamp = stamp_arr * ser_mask
    height -= ser_stamp * 1.4
    albedo[ser_mask] = albedo[ser_mask] * (1.0 - ser_stamp[ser_mask, None] * 0.72)

    # Bottom Swatch 2 (u in [0.86, 1.00], v in [0.002, 0.036]): Gleaming Brushed Stainless Slide Rails!
    rail_mask = (v_grid <= 0.036) & (u_grid >= 0.86)
    albedo[rail_mask] = np.array([0.87, 0.90, 0.94], dtype=np.float32)
    roughness[rail_mask] = 0.16
    height[rail_mask] = pebble[rail_mask] * 0.06

    save_rgb_png(albedo, os.path.join(OUT_DIR, "frame_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "frame_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "frame_roughness.png"))
    print("[OK] Generated frame_{albedo,normal,roughness}.png")


# ==============================================================================
# 4. DOUBLE-STACK MAGAZINE SUITE (1024 x 1024)
# ==============================================================================
def build_mag_suite():
    W, H = 1024, 1024
    pebble = spectral_noise(H, W, 70, 300, seed=401)
    scuff = spectral_noise(H, W, 8, 48, seed=402, aniso_x=2.2, aniso_y=0.3)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.128
    albedo[..., 1] = 0.144
    albedo[..., 2] = 0.176
    albedo += (pebble * 0.012 + scuff * 0.014)[..., None]

    height = pebble * 0.42 + scuff * 0.22
    roughness = 0.50 + pebble * 0.04 - scuff * 0.05

    # Rear Spine (u in [0.06, 0.44], v in [0.15, 0.95], mapped from y in [-4.80, +5.70]):
    # Witness holes at wy = 2.40, 1.25, 0.10, -1.05, -2.20, -3.35 -> round counts 4, 6, 8, 10, 12, 17!
    stamp_img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(stamp_img)
    f_cnt = load_font(FONT_DIN, 22)
    f_cal = load_font(FONT_DIN, 26)

    round_labels = ["4", "6", "8", "10", "12", "17"]
    for i, r_txt in enumerate(round_labels):
        wy = 2.40 - i * 1.15
        v_pos = 0.15 + ((wy + 4.80) / 10.50) * 0.80
        py = int((1.0 - v_pos) * H) - 11
        # Place round count number neatly beside staggered witness hole!
        u_pos = 0.31 if (i % 2 == 0) else 0.14
        px = int(u_pos * W)
        draw.text((px, py), r_txt, fill=255, font=f_cnt)

    draw.text((int(0.19 * W), int((1.0 - 0.21) * H)), "9mm", fill=230, font=f_cal)
    # Side wall molded caliber badge (u in [0.52, 0.96], v ~ 0.32)
    draw_glock_g_emblem(draw, int(0.69 * W), int((1.0 - 0.36) * H), 48, width=3)
    draw.text((int(0.675 * W), int((1.0 - 0.28) * H)), "9×19", fill=220, font=f_cal)

    stamp_soft = np.asarray(stamp_img.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0
    height -= stamp_soft * 1.5
    stamp_col = np.array([0.36, 0.40, 0.47], dtype=np.float32)
    albedo = albedo * (1.0 - stamp_soft[..., None] * 0.58) + stamp_col * (stamp_soft[..., None] * 0.58)

    # Bottom Stainless Liner & Feed-Lips Swatch (u in [0.80, 1.00], v in [0.00, 0.12])
    st_mask = (v_grid <= 0.12) & (u_grid >= 0.80)
    albedo[st_mask] = np.array([0.86, 0.89, 0.94], dtype=np.float32)
    roughness[st_mask] = 0.17
    height[st_mask] = scuff[st_mask] * 0.08

    save_rgb_png(albedo, os.path.join(OUT_DIR, "mag_albedo.png"))
    height_to_normal_png(height, strength=3.0, out_path=os.path.join(OUT_DIR, "mag_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "mag_roughness.png"))
    print("[OK] Generated mag_{albedo,normal,roughness}.png")


# ==============================================================================
# 5. SEAMLESS DETAIL NORMAL & ROUGHNESS MAPS FOR INTERNAL MACHINED & POLYMER PARTS
# ==============================================================================
def build_detail_maps():
    W, H = 512, 512
    brush = spectral_noise(H, W, 16, 160, seed=501, aniso_x=0.16, aniso_y=2.6)
    micro = spectral_noise(H, W, 60, 240, seed=502)
    oil = spectral_noise(H, W, 3, 12, seed=503)

    metal_h = brush * 0.55 + micro * 0.22
    metal_r = np.clip(0.24 - oil * 0.05 + micro * 0.03, 0.10, 0.60)
    height_to_normal_png(metal_h, strength=2.6, out_path=os.path.join(OUT_DIR, "metal_detail_normal.png"))
    save_gray_png(metal_r, os.path.join(OUT_DIR, "metal_detail_roughness.png"))

    poly_pebble = spectral_noise(H, W, 48, 210, seed=504)
    poly_coarse = spectral_noise(H, W, 18, 64, seed=505)
    poly_h = poly_pebble * 0.60 + poly_coarse * 0.30
    poly_r = np.clip(0.54 + poly_pebble * 0.05 - oil * 0.04, 0.30, 0.80)
    height_to_normal_png(poly_h, strength=3.0, out_path=os.path.join(OUT_DIR, "polymer_detail_normal.png"))
    save_gray_png(poly_r, os.path.join(OUT_DIR, "polymer_detail_roughness.png"))
    print("[OK] Generated seamless detail_{normal,roughness}.png maps")


if __name__ == "__main__":
    build_slide_suite()
    build_barrel_suite()
    build_frame_suite()
    build_mag_suite()
    build_detail_maps()
