#!/usr/bin/env python3
"""
Generates high-resolution multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for #6 Accuracy International AWM / L115A3 (.338 Lapua Magnum) in public/textures/:
  - awm_chassis_albedo.png    (2048x1024)
  - awm_chassis_normal.png    (2048x1024)
  - awm_chassis_roughness.png (2048x1024)

UV Atlas Layout (v=1 top, v=0 bottom):
  - Zone A (v in [0.50, 0.98], u in [0.02, 0.98]):
      Rich British Olive-Drab green (#3f4e35) fiberglass-reinforced polymer thumbhole chassis skins
      & folding stock panels with fine tactile stipple, molded seam lines, and recessed hex-socket bolts.
  - Zone B (v in [0.14, 0.46], u in [0.02, 0.66]):
      Dark manganese-phosphate flat-sided steel action receiver & 5-rd .338LM steel box magazine
      with optically flat steel normals and crisp "ACCURACY INTERNATIONAL ENGLAND AW .338LM" markings.
  - Zone C (v in [0.14, 0.46], u in [0.68, 0.98]):
      Schmidt & Bender PM II 5-25x56 matte black anodized scope body & tall elevation/parallax turrets
      with crisp white 0..14 MIL graduations and magnification numbers.
  - Zone D (v in [0.01, 0.11]):
      Utility swatches: matte black rubber/cheekpiece, CNC alloy beam, emerald multi-coated S&B lens glass,
      and bright stainless bolt steel.
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


def draw_hex_bolt(draw_recess: ImageDraw.ImageDraw, draw_head: ImageDraw.ImageDraw, cx: int, cy: int, r_outer: int) -> None:
    # Circular counterbore recess in OD polymer skin
    draw_recess.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=235)
    # Inner steel socket cap screw flange
    r_cap = int(r_outer * 0.72)
    draw_head.ellipse([cx - r_cap, cy - r_cap, cx + r_cap, cy + r_cap], fill=215)
    # Hexagonal Allen socket hole in center
    r_hex = int(r_outer * 0.38)
    pts = []
    for k in range(6):
        ang = k * math.pi / 3.0 + math.pi / 6.0
        pts.append((cx + int(r_hex * math.cos(ang)), cy + int(r_hex * math.sin(ang))))
    draw_recess.polygon(pts, fill=255)
    draw_head.polygon(pts, fill=40)


def build_awm_chassis_suite() -> None:
    W, H = 2048, 1024

    v_grid = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))
    u_grid = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))

    # High-frequency micro-textures ONLY (zero low-frequency wavy noise on steel or chassis!)
    poly_stipple = spectral_noise(H, W, 190, 440, seed=601)
    fiberglass_weave = spectral_noise(H, W, 95, 240, seed=602, aniso_x=1.4, aniso_y=0.9)
    steel_phos = spectral_noise(H, W, 240, 500, seed=603)

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.full((H, W), 0.55, dtype=np.float32)

    # ==========================================================================
    # ZONE A: BRITISH OLIVE-DRAB GREEN (#3f4e35) POLYMER CHASSIS (v >= 0.48)
    # ==========================================================================
    zone_a = v_grid >= 0.48
    # #3f4e35 -> (63/255, 78/255, 53/255) = (0.2471, 0.3059, 0.2078)
    od_base = np.array([0.247, 0.306, 0.208], dtype=np.float32)
    od_tex = (
        od_base[None, None, :]
        + poly_stipple[..., None] * 0.012
        + fiberglass_weave[..., None] * np.array([0.006, 0.008, 0.005], dtype=np.float32)
    )
    albedo[zone_a] = od_tex[zone_a]
    height[zone_a] = (poly_stipple * 0.26 + fiberglass_weave * 0.09)[zone_a]
    roughness[zone_a] = (0.64 + poly_stipple * 0.035 - fiberglass_weave * 0.015)[zone_a]

    # Subtle molded contour panel lines & grip stipple patches in Zone A
    stipple_patch = (
        zone_a
        & (u_grid >= 0.18)
        & (u_grid <= 0.34)
        & (((v_grid >= 0.53) & (v_grid <= 0.69)) | ((v_grid >= 0.76) & (v_grid <= 0.92)))
    )
    height[stipple_patch] += poly_stipple[stipple_patch] * 0.28
    albedo[stipple_patch] *= 0.93
    roughness[stipple_patch] = 0.74

    # Molded horizontal forend fuller groove on Right (v~0.86) and Left (v~0.63)
    groove_r = np.exp(-((v_grid - 0.855) / 0.010) ** 2) * ((u_grid >= 0.54) & (u_grid <= 0.94))
    groove_l = np.exp(-((v_grid - 0.625) / 0.010) ** 2) * ((u_grid >= 0.06) & (u_grid <= 0.46))
    grooves = groove_r + groove_l
    height -= grooves * 0.45
    albedo -= (grooves * 0.022)[..., None]

    # Recessed black-oxide hex-socket skin-fastening bolts along OD chassis flanks
    recess_img = Image.new("L", (W, H), 0)
    bolt_img = Image.new("L", (W, H), 0)
    dr_rec = ImageDraw.Draw(recess_img)
    dr_blt = ImageDraw.Draw(bolt_img)

    # Right chassis wall (v in [0.74, 0.96]), Left chassis wall (v in [0.51, 0.73])
    right_bolts_uv = [
        (0.14, 0.83), (0.31, 0.81), (0.48, 0.84),
        (0.63, 0.83), (0.77, 0.83), (0.90, 0.83),
    ]
    left_bolts_uv = [
        (0.10, 0.60), (0.23, 0.60), (0.37, 0.60),
        (0.52, 0.61), (0.69, 0.58), (0.86, 0.60),
    ]
    for bu, bv in right_bolts_uv + left_bolts_uv:
        px = int(bu * W)
        py = int((1.0 - bv) * H)
        draw_hex_bolt(dr_rec, dr_blt, px, py, r_outer=13)

    rec_arr = np.asarray(recess_img.filter(ImageFilter.GaussianBlur(radius=0.8)), dtype=np.float32) / 255.0
    blt_arr = np.asarray(bolt_img.filter(ImageFilter.GaussianBlur(radius=0.5)), dtype=np.float32) / 255.0

    height -= rec_arr * 1.35
    albedo = albedo * (1.0 - rec_arr[..., None] * 0.48) + np.array([0.09, 0.11, 0.08], dtype=np.float32) * (rec_arr[..., None] * 0.48)
    bolt_steel = np.array([0.16, 0.18, 0.20], dtype=np.float32)
    albedo = albedo * (1.0 - blt_arr[..., None] * 0.75) + bolt_steel * (blt_arr[..., None] * 0.75)
    roughness = roughness * (1.0 - blt_arr * 0.45) + 0.32 * (blt_arr * 0.45)

    # ==========================================================================
    # ZONE B: DARK PARKERIZED STEEL ACTION RECEIVER & .338LM MAG (v in [0.12, 0.48), u < 0.67)
    # ==========================================================================
    zone_b = (v_grid >= 0.12) & (v_grid < 0.48) & (u_grid < 0.67)
    steel_col = np.array([0.142, 0.162, 0.192], dtype=np.float32)
    albedo[zone_b] = (steel_col[None, None, :] + steel_phos[..., None] * 0.006)[zone_b]
    # Optically flat machined steel walls (zero wavy height noise!)
    height[zone_b] = (steel_phos * 0.06)[zone_b]
    roughness[zone_b] = (0.42 + steel_phos * 0.02)[zone_b]

    # Magazine vertical reinforcement ribs in v in [0.13, 0.26]
    mag_zone = zone_b & (v_grid < 0.265)
    rib_sin = np.sin((u_grid - 0.05) * 46.0 * math.pi)
    mag_ribs = mag_zone & (u_grid >= 0.08) & (u_grid <= 0.58) & (rib_sin > 0.70)
    height[mag_ribs] += 0.55
    albedo[mag_ribs] += 0.016
    roughness[mag_ribs] = 0.36

    # ==========================================================================
    # ZONE C: SCHMIDT & BENDER PM II 5-25x56 SCOPE & TURRETS (v in [0.12, 0.48), u >= 0.67)
    # ==========================================================================
    zone_c = (v_grid >= 0.12) & (v_grid < 0.48) & (u_grid >= 0.67)
    sb_black = np.array([0.095, 0.108, 0.128], dtype=np.float32)
    albedo[zone_c] = (sb_black[None, None, :] + steel_phos[..., None] * 0.004)[zone_c]
    height[zone_c] = (steel_phos * 0.05)[zone_c]
    roughness[zone_c] = (0.38 + steel_phos * 0.02)[zone_c]

    # Knurled turret crown grip ridges along top of Zone C (v in [0.435, 0.472])
    knurl_band = zone_c & (v_grid >= 0.435) & (v_grid <= 0.472)
    knurl_wave = np.sin(u_grid * 360.0 * math.pi)
    height[knurl_band] += knurl_wave[knurl_band] * 0.42
    roughness[knurl_band] = 0.52

    # Yellow Double-Turn (DT) visual indicator window on S&B PM II elevation turret
    dt_bar = zone_c & (v_grid >= 0.415) & (v_grid < 0.430) & (u_grid >= 0.70) & (u_grid <= 0.96)
    albedo[dt_bar] = np.array([0.82, 0.66, 0.12], dtype=np.float32)
    roughness[dt_bar] = 0.30

    # ==========================================================================
    # CRISP LASER ENGRAVINGS (RECEIVER + MAGAZINE + S&B PM II MIL TURRET TICKS)
    # ==========================================================================
    mark_white = Image.new("L", (W, H), 0)
    dw = ImageDraw.Draw(mark_white)

    f_title = load_font(30)
    f_sub = load_font(23)
    f_mil = load_font(20)
    f_tiny = load_font(17)

    # 1. Left Action Wall (u in [0.035, 0.34], v in [0.29, 0.44])
    lx = int(0.042 * W)
    ly = int((1.0 - 0.425) * H)
    dw.text((lx, ly), "ACCURACY INTERNATIONAL", fill=238, font=f_title)
    dw.text((lx, ly + 36), "ENGLAND    AW  .338 LM", fill=235, font=f_sub)
    dw.text((lx, ly + 68), "L115A3   GB  09-4418   BNP", fill=195, font=f_tiny)

    # 2. Right Action Wall (u in [0.36, 0.65], v in [0.29, 0.44])
    rx = int(0.375 * W)
    ry = int((1.0 - 0.415) * H)
    dw.text((rx, ry), "AI  PORTSMOUTH  UK", fill=215, font=f_sub)
    dw.text((rx, ry + 34), "CAL. .338 LAPUA MAGNUM", fill=205, font=f_tiny)

    # 3. 5-Round .338 LM Steel Box Magazine Stamp (v in [0.15, 0.25])
    mx = int(0.055 * W)
    my = int((1.0 - 0.225) * H)
    dw.text((mx, my), "AI  .338 LAPUA MAG   5 RD", fill=200, font=f_sub)

    # 4. Schmidt & Bender PM II Turret White MIL Ticks (u in [0.685, 0.975], v in [0.31, 0.41])
    t_x0 = int(0.690 * W)
    t_x1 = int(0.970 * W)
    t_y_base = int((1.0 - 0.325) * H)
    dw.line([(t_x0, t_y_base), (t_x1, t_y_base)], fill=235, width=2)

    num_major = 15  # 0..14 MIL
    span_px = t_x1 - t_x0
    for m in range(num_major):
        px = t_x0 + int((m / (num_major - 1)) * span_px)
        dw.line([(px, t_y_base - 22), (px, t_y_base)], fill=250, width=3)
        lbl = str(m)
        dw.text((px - (6 if m < 10 else 11), t_y_base - 46), lbl, fill=250, font=f_mil)
        if m < num_major - 1:
            # Half-mil & 0.1-mil vernier sub-ticks
            half_px = t_x0 + int(((m + 0.5) / (num_major - 1)) * span_px)
            dw.line([(half_px, t_y_base - 13), (half_px, t_y_base)], fill=225, width=2)
            for sub in [0.2, 0.4, 0.6, 0.8]:
                spx = t_x0 + int(((m + sub) / (num_major - 1)) * span_px)
                dw.line([(spx, t_y_base - 7), (spx, t_y_base)], fill=185, width=1)

    # 5. Schmidt & Bender Main Tube & Zoom Ring Markings (v in [0.15, 0.29])
    sx = int(0.692 * W)
    sy = int((1.0 - 0.275) * H)
    dw.text((sx, sy), "SCHMIDT & BENDER   PM II", fill=245, font=f_sub)
    dw.text((sx, sy + 30), "5-25×56  LP/MTC/LT   1 CLICK = 0.1 MRAD", fill=220, font=f_tiny)
    dw.text((sx, sy + 56), "5    7    10    12    15    20    25×", fill=245, font=f_mil)

    mark_arr = np.asarray(mark_white.filter(ImageFilter.GaussianBlur(radius=0.45)), dtype=np.float32) / 255.0
    engr_col = np.array([0.86, 0.89, 0.93], dtype=np.float32)
    albedo = albedo * (1.0 - mark_arr[..., None] * 0.85) + engr_col * (mark_arr[..., None] * 0.85)
    height -= mark_arr * 0.65
    roughness = np.clip(roughness + mark_arr * 0.06, 0.06, 0.90)

    # ==========================================================================
    # ZONE D: BOTTOM SWATCHES (v < 0.12)
    # ==========================================================================
    # D1: Matte Black Rubber / Cheekpiece (u < 0.28)
    sw_rubber = (v_grid < 0.12) & (u_grid < 0.28)
    albedo[sw_rubber] = np.array([0.09, 0.10, 0.12], dtype=np.float32)
    roughness[sw_rubber] = 0.78
    height[sw_rubber] = poly_stipple[sw_rubber] * 0.16

    # D2: Hard-Anodized CNC Aluminum Beam (u in [0.28, 0.56))
    sw_beam = (v_grid < 0.12) & (u_grid >= 0.28) & (u_grid < 0.56)
    albedo[sw_beam] = np.array([0.19, 0.22, 0.25], dtype=np.float32)
    roughness[sw_beam] = 0.34
    height[sw_beam] = steel_phos[sw_beam] * 0.05

    # D3: Multi-Coated Emerald-Teal Optical Lens Glass (u in [0.56, 0.80))
    sw_lens = (v_grid < 0.12) & (u_grid >= 0.56) & (u_grid < 0.80)
    lu = (u_grid - 0.68) / 0.12
    lv = (v_grid - 0.06) / 0.06
    l_rad = np.clip(np.sqrt(lu * lu + lv * lv), 0.0, 1.0)
    lens_col = (
        np.array([0.07, 0.42, 0.46], dtype=np.float32)[None, None, :] * (1.0 - 0.45 * l_rad[..., None])
        + np.array([0.05, 0.18, 0.34], dtype=np.float32)[None, None, :] * (0.45 * l_rad[..., None])
    )
    albedo[sw_lens] = lens_col[sw_lens]
    roughness[sw_lens] = 0.06
    height[sw_lens] = 0.0

    # D4: Bright Machined Stainless Steel Bolt / Rail Wear (u >= 0.80)
    sw_stain = (v_grid < 0.12) & (u_grid >= 0.80)
    albedo[sw_stain] = np.array([0.78, 0.82, 0.87], dtype=np.float32)
    roughness[sw_stain] = 0.18
    height[sw_stain] = steel_phos[sw_stain] * 0.04

    save_rgb_png(albedo, os.path.join(OUT_DIR, "awm_chassis_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "awm_chassis_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "awm_chassis_roughness.png"))
    print("[OK] Generated awm_chassis_{albedo,normal,roughness}.png in", OUT_DIR)


if __name__ == "__main__":
    build_awm_chassis_suite()
