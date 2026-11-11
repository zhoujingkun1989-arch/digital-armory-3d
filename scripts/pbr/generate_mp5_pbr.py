#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for the Heckler & Koch MP5A3 (9×19mm Parabellum, BAY-03) in public/textures/:
  1. mp5_receiver_{albedo,normal,roughness}.png (2048x1024)
     - Satin German RAL 9005 baked black lacquer over stamped sheet steel
     - Optically flat sheet-steel normals (zero wavy Perlin dents!)
     - Longitudinal MP5A3 stock-channel shading & vertical magwell strengthening flutes
     - Crisp German roll-marks: [HK] MP5 Kal. 9mm×19, Ulm proof marks & serial 62-19408
  2. mp5_lower_{albedo,normal,roughness}.png    (1024x1024)
     - Matte fiberglass-reinforced German polyamide Navy trigger housing
     - Iconic White & Signal-Red H&K Navy Bullet-Pictogram selector markings (Safe / Semi / Full-Auto)
       oriented toward +X muzzle on BOTH right and left flanks + molded HK grip emblem!
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO_ROOT, "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
    "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
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


# ==============================================================================
# 1. H&K MP5A3 STAMPED FLUTED UPPER RECEIVER SUITE (2048 x 1024)
# ==============================================================================
def build_mp5_receiver_suite() -> None:
    W, H = 2048, 1024
    # Fine German manganese-phosphate micro-grain under satin RAL 9005 black lacquer
    micro_grain = spectral_noise(H, W, 260, 520, seed=301)
    oil_film = spectral_noise(H, W, 6, 20, seed=302)
    rail_brush = spectral_noise(H, W, 18, 160, seed=303, aniso_x=3.5, aniso_y=0.35)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Deep satin German black enamel (#1b1e24)
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.112
    albedo[..., 1] = 0.124
    albedo[..., 2] = 0.146
    albedo += (micro_grain * 0.004 - oil_film * 0.004)[..., None]

    # Optically flat stamped steel sheet normals (no wavy low-freq height!)
    height = micro_grain * 0.045
    roughness = np.broadcast_to(0.36 - oil_film * 0.035 + micro_grain * 0.015, (H, W)).copy()

    # 1) Longitudinal MP5A3 Retractable Stock Guide Flute / Channel on Right & Left walls
    # Right wall: u in [0.03..0.64], v ~ 0.806; Left wall: u in [0.36..0.97], v ~ 0.346
    chan_r_mask = (u_grid >= 0.03) & (u_grid <= 0.64)
    chan_l_mask = (u_grid >= 0.36) & (u_grid <= 0.97)
    chan_r = chan_r_mask * np.exp(-((v_grid - 0.806) / 0.018) ** 2)
    chan_l = chan_l_mask * np.exp(-((v_grid - 0.346) / 0.018) ** 2)
    stock_flute = chan_r + chan_l

    height -= stock_flute * 0.65
    albedo -= (stock_flute * 0.022)[..., None]
    # Subtle silver sliding wear inside the MP5A3 stock channel rails!
    slide_wear = stock_flute * np.clip(0.35 + 0.25 * rail_brush, 0.0, 0.65)
    silver_steel = np.array([0.58, 0.63, 0.70], dtype=np.float32)
    albedo = albedo * (1.0 - slide_wear[..., None] * 0.26) + silver_steel * (slide_wear[..., None] * 0.26)
    roughness -= slide_wear * 0.10

    # 2) Vertical Stamped Magazine-Well Strengthening Flutes (3 parallel vertical ribs on each side!)
    # Right magwell: u in [0.68, 0.74, 0.80], v in [0.55..0.72]
    # Left magwell:  u in [0.20, 0.26, 0.32], v in [0.09..0.26]
    mw_v_r = np.clip(1.0 - np.abs(v_grid - 0.635) / 0.085, 0.0, 1.0)
    mw_v_l = np.clip(1.0 - np.abs(v_grid - 0.175) / 0.085, 0.0, 1.0)
    flute_sum = np.zeros((H, W), dtype=np.float32)
    for uc in [0.685, 0.735, 0.785]:
        flute_sum += mw_v_r * np.exp(-((u_grid - uc) / 0.010) ** 2)
    for uc in [0.215, 0.265, 0.315]:
        flute_sum += mw_v_l * np.exp(-((u_grid - uc) / 0.010) ** 2)

    height -= flute_sum * 0.58
    albedo -= (flute_sum * 0.020)[..., None]
    # Subtle crisp highlight on flute shoulders
    flute_rim = np.abs(np.gradient(flute_sum, axis=1))
    albedo += (flute_rim * 0.08)[..., None]

    # 3) Subtle Brass Case Deflection Scuffs behind Right Ejection Port (u ~ 0.63, v ~ 0.80)
    brass_spot = np.exp(-(((u_grid - 0.625) / 0.018) ** 2 + ((v_grid - 0.815) / 0.028) ** 2))
    brass_col = np.array([0.72, 0.56, 0.22], dtype=np.float32)
    albedo = albedo * (1.0 - brass_spot[..., None] * 0.32) + brass_col * (brass_spot[..., None] * 0.32)

    # 4) Crisp German Heckler & Koch Roll-Marks & Ulm Proof Stamps
    stamp_white = Image.new("L", (W, H), 0)
    stamp_red = Image.new("L", (W, H), 0)
    dw = ImageDraw.Draw(stamp_white)
    dr = ImageDraw.Draw(stamp_red)

    f_hk_box = load_font(38)
    f_title = load_font(36)
    f_sub = load_font(24)
    f_small = load_font(20)

    # LEFT SIDE (v in [0.07..0.51], reads left-to-right on Left camera view!):
    # Place crisp [HK] MP5 9mm×19 above/near left magwell & receiver flank (u ~ 0.16..0.52, v ~ 0.41)
    lx = int(0.175 * W)
    ly = int((1.0 - 0.435) * H)
    dr.rounded_rectangle([lx, ly, lx + 74, ly + 48], radius=5, outline=245, width=4)
    dr.text((lx + 9, ly + 4), "HK", fill=250, font=f_hk_box)

    dw.text((lx + 92, ly + 4), "MP5    Kal. 9mm×19", fill=245, font=f_title)
    dw.text((lx + 92, ly + 48), "DE   62 - 19408     CIP / N   ULM", fill=205, font=f_sub)

    # Left Magwell vertical stamp: "9mm×19" above flutes
    dw.text((int(0.215 * W), int((1.0 - 0.305) * H)), "HK  MP5  9mm×19", fill=225, font=f_sub)

    # RIGHT SIDE (v in [0.53..0.97], reads left-to-right on Right camera view!):
    rx = int(0.35 * W)
    ry = int((1.0 - 0.885) * H)
    dw.text((rx, ry), "HECKLER & KOCH GMBH", fill=220, font=f_sub)
    dw.text((rx, ry + 28), "OBERNDORF / N.  MADE IN GERMANY", fill=195, font=f_small)
    dw.text((int(0.675 * W), int((1.0 - 0.765) * H)), "HK  9mm×19", fill=225, font=f_sub)

    w_arr = np.asarray(stamp_white.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0
    r_arr = np.asarray(stamp_red.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0

    engraved_silver = np.array([0.84, 0.87, 0.91], dtype=np.float32)
    hk_red_col = np.array([0.84, 0.16, 0.16], dtype=np.float32)

    albedo = albedo * (1.0 - w_arr[..., None] * 0.82) + engraved_silver * (w_arr[..., None] * 0.82)
    albedo = albedo * (1.0 - r_arr[..., None] * 0.88) + hk_red_col * (r_arr[..., None] * 0.88)
    height -= (w_arr + r_arr) * 0.95
    roughness = np.clip(roughness + w_arr * 0.06, 0.14, 0.82)

    # Bottom right swatch (u >= 0.78, v <= 0.06): bright polished steel for claw mount / weld accents
    bright_sw = (v_grid <= 0.06) & (u_grid >= 0.78)
    albedo[bright_sw] = np.array([0.80, 0.84, 0.89], dtype=np.float32)
    roughness[bright_sw] = 0.20

    save_rgb_png(albedo, os.path.join(OUT_DIR, "mp5_receiver_albedo.png"))
    height_to_normal_png(height, strength=2.1, out_path=os.path.join(OUT_DIR, "mp5_receiver_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "mp5_receiver_roughness.png"))
    print("[OK] Generated mp5_receiver_{albedo,normal,roughness}.png")


# ==============================================================================
# Helper: Draw Authentic H&K Bullet Silhouette & Navy Pictogram Boxes
# ==============================================================================
def draw_bullet_icon(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    length: float,
    height_px: float,
    dir_sign: int,
    fill_val: int = 255,
) -> None:
    """
    Draws a horizontal cartridge/bullet silhouette centered at (cx, cy).
    dir_sign = +1 -> bullet tip points RIGHT (+u, for Right flank +Z).
    dir_sign = -1 -> bullet tip points LEFT  (-u, for Left flank -Z).
    """
    half_l = length * 0.5
    half_h = height_px * 0.5
    body_len = length * 0.62

    if dir_sign > 0:
        x0 = cx - half_l
        x_shoulder = x0 + body_len
        x_tip = cx + half_l
        pts = [
            (x0, cy - half_h),
            (x_shoulder, cy - half_h),
            (x_tip, cy),
            (x_shoulder, cy + half_h),
            (x0, cy + half_h),
        ]
        # Rim groove
        draw.polygon(pts, fill=fill_val)
    else:
        x0 = cx + half_l
        x_shoulder = x0 - body_len
        x_tip = cx - half_l
        pts = [
            (x0, cy - half_h),
            (x_shoulder, cy - half_h),
            (x_tip, cy),
            (x_shoulder, cy + half_h),
            (x0, cy + half_h),
        ]
        draw.polygon(pts, fill=fill_val)


def draw_hk_pictogram_cluster(
    draw_white: ImageDraw.ImageDraw,
    draw_red: ImageDraw.ImageDraw,
    piv_px: int,
    piv_py: int,
    dir_sign: int,
) -> None:
    """
    Draws the 3 iconic H&K Navy Bullet-Pictogram markings around selector pivot (piv_px, piv_py):
      1) SAFE (lower-forward): White closed box + White bullet silhouette with diagonal cross-out
      2) SEMI (mid-forward):   Red closed box   + 1 Red bullet silhouette
      3) AUTO (upper-forward): Red open-front box + 5/7 staggered Red bullet silhouettes!
    """
    # Arc index dots between pivot and boxes (sized so all 3 boxes sit cleanly inside tray wall!)
    dx_base = 72 * dir_sign
    box_w = 76
    box_h = 24

    # 1. SAFE (Lower-forward: py + 29)
    sx_c = piv_px + dx_base + (box_w // 2) * dir_sign
    sy_c = piv_py + 29
    draw_white.ellipse([piv_px + 46 * dir_sign - 3, sy_c - 3, piv_px + 46 * dir_sign + 3, sy_c + 3], fill=250)
    bx0, bx1 = min(sx_c - box_w // 2, sx_c + box_w // 2), max(sx_c - box_w // 2, sx_c + box_w // 2)
    by0, by1 = sy_c - box_h // 2, sy_c + box_h // 2
    draw_white.rectangle([bx0, by0, bx1, by1], outline=250, width=3)
    # Hollow/crossed white bullet for SAFE (0)
    draw_bullet_icon(draw_white, sx_c, sy_c, length=40, height_px=10, dir_sign=dir_sign, fill_val=235)
    draw_white.line([(bx0 + 12, by1 - 3), (bx1 - 12, by0 + 3)], fill=255, width=3)
    draw_white.line([(bx0 + 12, by0 + 3), (bx1 - 12, by1 - 3)], fill=255, width=3)

    # 2. SEMI-AUTO (Horizontal-forward: py + 0)
    mx_c = piv_px + int(dx_base * 1.06) + (box_w // 2) * dir_sign
    my_c = piv_py
    draw_red.ellipse([piv_px + 50 * dir_sign - 3, my_c - 3, piv_px + 50 * dir_sign + 3, my_c + 3], fill=255)
    mbx0, mbx1 = min(mx_c - box_w // 2, mx_c + box_w // 2), max(mx_c - box_w // 2, mx_c + box_w // 2)
    mby0, mby1 = my_c - box_h // 2, my_c + box_h // 2
    draw_red.rectangle([mbx0, mby0, mbx1, mby1], outline=255, width=3)
    draw_bullet_icon(draw_red, mx_c, my_c, length=44, height_px=10.5, dir_sign=dir_sign, fill_val=255)

    # 3. FULL-AUTO (Upper-forward: py - 30) - Open-front red box w/ 6 staggered burst bullets!
    ax_c = piv_px + dx_base + (box_w // 2) * dir_sign
    ay_c = piv_py - 30
    draw_red.ellipse([piv_px + 46 * dir_sign - 3, ay_c - 3, piv_px + 46 * dir_sign + 3, ay_c + 3], fill=255)
    abx0, abx1 = min(ax_c - box_w // 2, ax_c + box_w // 2), max(ax_c - box_w // 2, ax_c + box_w // 2)
    aby0, aby1 = ay_c - (box_h + 4) // 2, ay_c + (box_h + 4) // 2
    # Top, bottom, and rear walls of open-front HK full-auto box (+ dashed front!)
    draw_red.line([(abx0, aby0), (abx1, aby0)], fill=255, width=3)
    draw_red.line([(abx0, aby1), (abx1, aby1)], fill=255, width=3)
    rear_x = abx0 if dir_sign > 0 else abx1
    front_x = abx1 if dir_sign > 0 else abx0
    draw_red.line([(rear_x, aby0), (rear_x, aby1)], fill=255, width=3)
    # Dotted front opening of HK full-auto pictogram
    for dy_dot in [aby0 + 3, (aby0 + aby1) // 2, aby1 - 3]:
        draw_red.rectangle([front_x - 2, dy_dot - 2, front_x + 2, dy_dot + 2], fill=255)

    # Staggered burst of red bullets inside the Full-Auto box
    offsets = [
        (-17 * dir_sign, -6),
        (9 * dir_sign, -6),
        (-5 * dir_sign, 0),
        (21 * dir_sign, 0),
        (-17 * dir_sign, 6),
        (9 * dir_sign, 6),
    ]
    for ox, oy in offsets:
        draw_bullet_icon(draw_red, ax_c + ox, ay_c + oy, length=20, height_px=5.0, dir_sign=dir_sign, fill_val=255)


# ==============================================================================
# 2. H&K MP5 NAVY POLYMER LOWER GRIP HOUSING SUITE (1024 x 1024)
# ==============================================================================
def build_mp5_lower_suite() -> None:
    W, H = 1024, 1024
    # Authentic matte German glass-fiber polyamide micro-stipple (uniform, non-blotchy)
    pebble = spectral_noise(H, W, 110, 360, seed=401)
    mold_sheen = spectral_noise(H, W, 8, 28, seed=402)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.116
    albedo[..., 1] = 0.125
    albedo[..., 2] = 0.144
    albedo += (pebble * 0.006 - mold_sheen * 0.004)[..., None]

    height = pebble * 0.16
    roughness = np.broadcast_to(0.70 + pebble * 0.025 - mold_sheen * 0.025, (H, W)).copy()

    # Selector pivot UV coordinates matching applyMp5GripHousingUVs in mp5Geometries.ts:
    # Local grip housing bounds: x in [-4.35, +3.80] (span 8.15), y in [-5.80, +0.95] (span 6.75)
    # Selector axle at world [-3.15, -0.55] - assembledPos [-2.15, -0.35] = local (-1.00, -0.20)
    # xNorm_sel = (-1.00 - -4.35) / 8.15 = 0.4110
    # yNorm_sel = (-0.20 - -5.80) / 6.75 = 0.8296
    # Right flank (+Z): u = 0.05 + xNorm * 0.90 => u_sel_R = 0.420; v = 0.52 + yNorm * 0.44 => v_sel_R = 0.885
    # Left flank  (-Z): u = 0.05 + (1 - xNorm) * 0.90 => u_sel_L = 0.580; v = 0.05 + yNorm * 0.44 => v_sel_L = 0.415

    mask_white = Image.new("L", (W, H), 0)
    mask_red = Image.new("L", (W, H), 0)
    mask_mold = Image.new("L", (W, H), 0)

    dw = ImageDraw.Draw(mask_white)
    dr = ImageDraw.Draw(mask_red)
    dm = ImageDraw.Draw(mask_mold)

    # Right Flank (+Z, +X muzzle is +u right):
    piv_rx = int(0.420 * W)
    piv_ry = int((1.0 - 0.885) * H)
    draw_hk_pictogram_cluster(dw, dr, piv_rx, piv_ry, dir_sign=+1)

    # Left Flank (-Z, +X muzzle is -u left):
    piv_lx = int(0.580 * W)
    piv_ly = int((1.0 - 0.415) * H)
    draw_hk_pictogram_cluster(dw, dr, piv_lx, piv_ly, dir_sign=-1)

    # Molded recessed "HK" logo near bottom of Navy polymer pistol grip on both sides!
    f_grip = load_font(30)
    for gx, gy in [(int(0.24 * W), int((1.0 - 0.62) * H)), (int(0.70 * W), int((1.0 - 0.15) * H))]:
        dm.rounded_rectangle([gx, gy, gx + 62, gy + 40], radius=4, outline=220, width=3)
        dm.text((gx + 8, gy + 3), "HK", fill=220, font=f_grip)

    w_arr = np.asarray(mask_white.filter(ImageFilter.GaussianBlur(radius=0.45)), dtype=np.float32) / 255.0
    r_arr = np.asarray(mask_red.filter(ImageFilter.GaussianBlur(radius=0.45)), dtype=np.float32) / 255.0
    m_arr = np.asarray(mask_mold.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0

    # Crisp German White & Signal-Red lacquer infill inside recessed pictogram engravings!
    paint_white = np.array([0.93, 0.95, 0.97], dtype=np.float32)
    paint_red = np.array([0.86, 0.14, 0.14], dtype=np.float32)

    albedo = albedo * (1.0 - w_arr[..., None] * 0.92) + paint_white * (w_arr[..., None] * 0.92)
    albedo = albedo * (1.0 - r_arr[..., None] * 0.94) + paint_red * (r_arr[..., None] * 0.94)
    albedo -= (m_arr * 0.018)[..., None]

    height -= (w_arr + r_arr) * 0.85
    height -= m_arr * 0.75

    # Glossy enamel paint infill inside matte polymer housing
    roughness = np.clip(roughness - (w_arr + r_arr) * 0.34, 0.22, 0.86)

    save_rgb_png(albedo, os.path.join(OUT_DIR, "mp5_lower_albedo.png"))
    height_to_normal_png(height, strength=2.0, out_path=os.path.join(OUT_DIR, "mp5_lower_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "mp5_lower_roughness.png"))
    print("[OK] Generated mp5_lower_{albedo,normal,roughness}.png")


if __name__ == "__main__":
    build_mp5_receiver_suite()
    build_mp5_lower_suite()
