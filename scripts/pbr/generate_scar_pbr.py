#!/usr/bin/env python3
"""
Generates high-resolution 2K multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for #7 FN SCAR-L Mk 16 Mod 0 (5.56x45mm NATO, Belgian "50 Shades of FDE") in public/textures/:
  - scar_fde_albedo.png    (2048x2048, sRGB)
  - scar_fde_normal.png    (2048x2048, Linear OpenGL tangent-space normal — flat anodized/sheet walls!)
  - scar_fde_roughness.png (2048x2048, Linear roughness)
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO_ROOT, "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
]


def load_font(size: int):
    for fp in FONT_PATHS:
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


def build_scar_fde_suite() -> None:
    W, H = 2048, 2048

    # High-frequency micro-textures ONLY (zero wavy low-frequency normal noise!)
    anod_grain = spectral_noise(H, W, 320, 680, seed=1601)
    extrusion_streak = spectral_noise(H, W, 90, 260, seed=1602, aniso_x=0.22, aniso_y=3.2)
    poly_stipple = spectral_noise(H, W, 240, 580, seed=1603)
    grip_diamond = spectral_noise(H, W, 380, 760, seed=1604)

    # v_grid & u_grid broadcast to full (H, W)
    v_1d = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_1d = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W
    v_grid = np.broadcast_to(v_1d, (H, W))
    u_grid = np.broadcast_to(u_1d, (H, W))

    albedo = np.zeros((H, W, 3), dtype=np.float32)
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.full((H, W), 0.55, dtype=np.float32)

    # ==========================================================================
    # BAND A (v in [0.68, 1.00]): MONOLITHIC EXTRUDED ALUMINUM UPPER (#a78b62)
    # Metallic Champagne / Golden-Tan Type-III Hardcoat Anodized Aluminum
    # ==========================================================================
    m_upper = v_grid >= 0.68
    # Rich Belgian champagne-bronze FDE (#a78b62 = [0.655, 0.545, 0.384], boosted slightly on sunlit satin)
    champagne_rgb = np.array([0.668, 0.556, 0.392], dtype=np.float32)
    albedo[m_upper] = (
        champagne_rgb
        + anod_grain[m_upper, None] * 0.005
        + extrusion_streak[m_upper, None] * 0.006
    )
    # Optically FLAT extruded aluminum walls — micro-anodized grain only!
    height[m_upper] = anod_grain[m_upper] * 0.035 + extrusion_streak[m_upper] * 0.02
    roughness[m_upper] = 0.33 + anod_grain[m_upper] * 0.018

    # Subtle recessed longitudinal extrusion flute line on Left (v~0.902) and Right (v~0.752)
    flute_l = np.exp(-((v_grid - 0.902) / 0.0045) ** 2) * ((u_grid > 0.08) & (u_grid < 0.92))
    flute_r = np.exp(-((v_grid - 0.752) / 0.0045) ** 2) * ((u_grid > 0.08) & (u_grid < 0.92))
    flutes = flute_l + flute_r
    albedo -= (flutes * 0.028)[..., None]
    height -= flutes * 0.35

    # Dark anodized Picatinny rail shadow band at very top of Left (v > 0.975) & Right (v in [0.822, 0.836])
    rail_band = ((v_grid >= 0.975) | ((v_grid >= 0.822) & (v_grid <= 0.836)))
    albedo[rail_band] *= 0.86
    roughness[rail_band] = 0.38

    # Subtle brass case kiss marks behind Right-side ejection port (u in [0.30, 0.35], v in [0.73, 0.77])
    brass_kiss = np.exp(-(((u_grid - 0.325) / 0.016) ** 2 + ((v_grid - 0.750) / 0.014) ** 2))
    brass_rgb = np.array([0.78, 0.63, 0.28], dtype=np.float32)
    albedo = albedo * (1.0 - brass_kiss[..., None] * 0.35) + brass_rgb * (brass_kiss[..., None] * 0.35)

    # ==========================================================================
    # BAND B (v in [0.40, 0.68)): MATTE COYOTE-TAN POLYMER LOWER (#8f7654)
    # ==========================================================================
    m_lower = (v_grid >= 0.40) & (v_grid < 0.68)
    coyote_rgb = np.array([0.561, 0.463, 0.329], dtype=np.float32)  # #8f7654 exact!
    albedo[m_lower] = coyote_rgb + poly_stipple[m_lower, None] * 0.008
    height[m_lower] = poly_stipple[m_lower] * 0.11
    roughness[m_lower] = 0.69 + poly_stipple[m_lower] * 0.025

    # Subtle molded magazine-well reinforcement fence ridge on lower walls
    mw_ridge_l = (
        (u_grid >= 0.05) & (u_grid <= 0.23) & (np.abs(v_grid - 0.495) < 0.006)
    ).astype(np.float32)
    mw_ridge_r = (
        (u_grid >= 0.77) & (u_grid <= 0.95) & (np.abs(v_grid - 0.495) < 0.006)
    ).astype(np.float32)
    albedo += ((mw_ridge_l + mw_ridge_r) * 0.022)[..., None]
    height += (mw_ridge_l + mw_ridge_r) * 0.32

    # ==========================================================================
    # BAND C (v in [0.11, 0.40), u < 0.53): "50 SHADES OF FDE" STOCK, RISER & GRIP
    #  - Ugg-Boot Buttstock (u in [0.00, 0.33]): Warm Mustard Earth Tan (#9d835b)
    #  - Cheek Riser (u in [0.33, 0.53], v >= 0.25): Lighter Sand-Tan (#ad936c)
    #  - Ergonomic Pistol Grip (u in [0.33, 0.53], v < 0.25): Deep Coyote Tan (#846c4b) w/ stipple
    # ==========================================================================
    m_stock = (v_grid >= 0.11) & (v_grid < 0.40) & (u_grid < 0.33)
    stock_rgb = np.array([0.616, 0.514, 0.357], dtype=np.float32)  # #9d835b
    albedo[m_stock] = stock_rgb + poly_stipple[m_stock, None] * 0.008
    height[m_stock] = poly_stipple[m_stock] * 0.12
    roughness[m_stock] = 0.64 + poly_stipple[m_stock] * 0.02

    m_riser = (v_grid >= 0.25) & (v_grid < 0.40) & (u_grid >= 0.33) & (u_grid < 0.53)
    riser_rgb = np.array([0.678, 0.576, 0.424], dtype=np.float32)  # #ad936c
    albedo[m_riser] = riser_rgb + poly_stipple[m_riser, None] * 0.007
    height[m_riser] = poly_stipple[m_riser] * 0.09
    roughness[m_riser] = 0.58 + poly_stipple[m_riser] * 0.02

    m_grip = (v_grid >= 0.11) & (v_grid < 0.25) & (u_grid >= 0.33) & (u_grid < 0.53)
    grip_rgb = np.array([0.518, 0.424, 0.294], dtype=np.float32)  # #846c4b
    albedo[m_grip] = grip_rgb + grip_diamond[m_grip, None] * 0.014
    height[m_grip] = grip_diamond[m_grip] * 0.28
    roughness[m_grip] = 0.75 + grip_diamond[m_grip] * 0.03

    # ==========================================================================
    # BAND D (v in [0.11, 0.40), u >= 0.53): FDE TAN 30-RD STANAG MAGAZINE (#a2875e)
    # ==========================================================================
    m_mag = (v_grid >= 0.11) & (v_grid < 0.40) & (u_grid >= 0.53)
    mag_rgb = np.array([0.635, 0.529, 0.369], dtype=np.float32)  # #a2875e
    albedo[m_mag] = mag_rgb + anod_grain[m_mag, None] * 0.006 + extrusion_streak[m_mag, None] * 0.005
    height[m_mag] = anod_grain[m_mag] * 0.05
    roughness[m_mag] = 0.46 + anod_grain[m_mag] * 0.02

    # Stamped STANAG horizontal strengthening ribs inside Band D (4 crisp flat-top ribs)
    for rv in [0.165, 0.215, 0.265, 0.315]:
        rib = (
            (u_grid >= 0.58)
            & (u_grid <= 0.94)
            & (np.abs(v_grid - rv) < 0.0085)
        ).astype(np.float32)
        albedo += (rib * 0.024)[..., None]
        height += rib * 0.42
        roughness -= rib * 0.03

    # Subtle magwell insertion wear near top of STANAG mag (v in [0.355, 0.395])
    mag_wear = (
        (v_grid >= 0.355) & (v_grid < 0.398) & (u_grid >= 0.55) & (u_grid <= 0.96)
    ).astype(np.float32) * (0.28 + 0.22 * np.maximum(0.0, extrusion_streak))
    steel_under = np.array([0.52, 0.54, 0.56], dtype=np.float32)
    albedo = albedo * (1.0 - mag_wear[..., None] * 0.32) + steel_under * (mag_wear[..., None] * 0.32)
    roughness -= mag_wear * 0.08

    # ==========================================================================
    # BAND E (v < 0.11): HARDWARE, RUBBER BUTTPAD, NITRIDE STEEL & CHROME SWATCHES
    # ==========================================================================
    m_rubber = (v_grid < 0.11) & (u_grid < 0.34)
    albedo[m_rubber] = np.array([0.115, 0.125, 0.145], dtype=np.float32)
    height[m_rubber] = poly_stipple[m_rubber] * 0.12
    roughness[m_rubber] = 0.84

    m_dark_steel = (v_grid < 0.11) & (u_grid >= 0.34) & (u_grid < 0.67)
    albedo[m_dark_steel] = np.array([0.155, 0.180, 0.215], dtype=np.float32)
    height[m_dark_steel] = anod_grain[m_dark_steel] * 0.05
    roughness[m_dark_steel] = 0.32

    m_bright_steel = (v_grid < 0.11) & (u_grid >= 0.67)
    albedo[m_bright_steel] = np.array([0.80, 0.84, 0.89], dtype=np.float32)
    height[m_bright_steel] = anod_grain[m_bright_steel] * 0.03
    roughness[m_bright_steel] = 0.18

    # ==========================================================================
    # VECTOR LASER ENGRAVINGS, PICATINNY T-MARKS & RED/BLACK S-1-A SELECTOR MARKS
    # ==========================================================================
    overlay_rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    engrave_mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(overlay_rgba)
    dengr = ImageDraw.Draw(engrave_mask)

    f_title = load_font(36)
    f_sub = load_font(27)
    f_tiny = load_font(19)
    f_tmark = load_font(17)
    f_sel = load_font(36)

    def v_to_py(v_val: float) -> int:
        return int((1.0 - v_val) * H)

    # 1. Left Upper Receiver Wall (v in [0.84, 0.98], u in [0.02, 0.98]):
    #    FN HERSTAL BELGIUM / SCAR-L CAL. 5.56MM + FN Oval Logo + Data-Matrix QR!
    ux0 = int(0.50 * W)
    uy0 = v_to_py(0.945)

    # FN Oval Cartouche
    draw.ellipse([ux0, uy0 + 2, ux0 + 92, uy0 + 54], outline=(46, 38, 28, 235), width=4)
    dengr.ellipse([ux0, uy0 + 2, ux0 + 92, uy0 + 54], outline=210, width=4)
    draw.text((ux0 + 20, uy0 + 9), "FN", fill=(44, 36, 26, 240), font=f_title)
    dengr.text((ux0 + 20, uy0 + 9), "FN", fill=220, font=f_title)

    # Primary SCAR-L Receiver Rollmark
    draw.text(
        (ux0 + 112, uy0 - 2),
        "FN HERSTAL BELGIUM",
        fill=(42, 34, 24, 240),
        font=f_title,
    )
    dengr.text((ux0 + 112, uy0 - 2), "FN HERSTAL BELGIUM", fill=225, font=f_title)

    draw.text(
        (ux0 + 112, uy0 + 40),
        "SCAR-L   CAL. 5.56MM",
        fill=(42, 34, 24, 240),
        font=f_title,
    )
    dengr.text((ux0 + 112, uy0 + 40), "SCAR-L   CAL. 5.56MM", fill=225, font=f_title)

    draw.text(
        (ux0 + 112, uy0 + 82),
        "MK 16 MOD 0     SN  LC-28419",
        fill=(58, 48, 34, 220),
        font=f_sub,
    )
    dengr.text(
        (ux0 + 112, uy0 + 82),
        "MK 16 MOD 0     SN  LC-28419",
        fill=185,
        font=f_sub,
    )

    # UID 2D Data-Matrix Laser Square next to serial
    qx, qy = ux0 + 22, uy0 + 68
    draw.rectangle([qx, qy, qx + 52, qy + 52], fill=(235, 228, 212, 215), outline=(48, 40, 30, 230), width=2)
    rng_qr = np.random.default_rng(1699)
    for r in range(6):
        for c in range(6):
            if rng_qr.random() > 0.42:
                cx0 = qx + 5 + c * 7
                cy0 = qy + 5 + r * 7
                draw.rectangle([cx0, cy0, cx0 + 5, cy0 + 5], fill=(42, 35, 25, 235))

    # Right Upper Receiver Wall subtle NATO / proof mark (u ~ 0.62, v ~ 0.78)
    rx0, ry0 = int(0.58 * W), v_to_py(0.785)
    draw.text((rx0, ry0), "NATO  5.56×45   1/7\"", fill=(52, 42, 30, 205), font=f_sub)
    dengr.text((rx0, ry0), "NATO  5.56×45   1/7\"", fill=175, font=f_sub)

    # 2. White Laser-Etched Picatinny Rail T-Marks along Top Edge of Left & Right Upper
    for idx, tnum in enumerate(range(38, 2, -4)):
        u_pos = 0.06 + idx * 0.095
        if u_pos < 0.94:
            # Left upper top rail T-marks (v ~ 0.976)
            draw.text((int(u_pos * W), v_to_py(0.986)), f"T{tnum}", fill=(244, 240, 230, 220), font=f_tmark)
            # Right upper top rail T-marks (v ~ 0.824, reversed order front-to-rear)
            t_r = 40 - tnum
            draw.text((int(u_pos * W), v_to_py(0.835)), f"T{t_r}", fill=(244, 240, 230, 220), font=f_tmark)

    # 3. Iconic FN SCAR Lower Receiver Red/Black "S / 1 / A" Selector Markings!
    #    Left Lower Wall: selector pivot around (u = 0.392, v = 0.595)
    #    Right Lower Wall: selector pivot around (u = 0.608, v = 0.595)
    scar_red = (198, 34, 34, 248)
    scar_black = (28, 26, 24, 245)

    # Left wall selector marks (S forward-left, 1 top, A rear-right)
    lsx, lsy = int(0.392 * W), v_to_py(0.585)
    draw.text((lsx - 74, lsy - 14), "S", fill=scar_black, font=f_sel)
    dengr.text((lsx - 74, lsy - 14), "S", fill=195, font=f_sel)
    draw.line([(lsx - 42, lsy + 4), (lsx - 24, lsy + 4)], fill=scar_black, width=4)

    draw.text((lsx - 11, lsy - 82), "1", fill=scar_red, font=f_sel)
    dengr.text((lsx - 11, lsy - 82), "1", fill=195, font=f_sel)
    draw.line([(lsx, lsy - 40), (lsx, lsy - 22)], fill=scar_red, width=4)

    draw.text((lsx + 50, lsy - 14), "A", fill=scar_red, font=f_sel)
    dengr.text((lsx + 50, lsy - 14), "A", fill=195, font=f_sel)
    draw.line([(lsx + 24, lsy + 4), (lsx + 42, lsy + 4)], fill=scar_red, width=4)

    # Right wall selector marks (A rear-left, 1 top, S forward-right)
    rsx, rsy = int(0.608 * W), v_to_py(0.585)
    draw.text((rsx - 76, rsy - 14), "A", fill=scar_red, font=f_sel)
    dengr.text((rsx - 76, rsy - 14), "A", fill=195, font=f_sel)
    draw.line([(rsx - 42, rsy + 4), (rsx - 24, rsy + 4)], fill=scar_red, width=4)

    draw.text((rsx - 11, rsy - 82), "1", fill=scar_red, font=f_sel)
    dengr.text((rsx - 11, rsy - 82), "1", fill=195, font=f_sel)
    draw.line([(rsx, rsy - 40), (rsx, rsy - 22)], fill=scar_red, width=4)

    draw.text((rsx + 50, rsy - 14), "S", fill=scar_black, font=f_sel)
    dengr.text((rsx + 50, rsy - 14), "S", fill=195, font=f_sel)
    draw.line([(rsx + 24, rsy + 4), (rsx + 42, rsy + 4)], fill=scar_black, width=4)

    # 4. STANAG Magazine Floor/Body Stencil in Band D
    mx0, my0 = int(0.65 * W), v_to_py(0.148)
    draw.text((mx0, my0), "FN  5.56×45MM  30RD", fill=(62, 50, 34, 210), font=f_tiny)
    dengr.text((mx0, my0), "FN  5.56×45MM  30RD", fill=150, font=f_tiny)

    # Composite RGBA markings cleanly onto Albedo + Normal + Roughness
    ov_np = np.asarray(overlay_rgba, dtype=np.float32) / 255.0
    alpha = ov_np[..., 3:4]
    albedo = albedo * (1.0 - alpha) + ov_np[..., :3] * alpha

    engr_np = (
        np.asarray(engrave_mask.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32)
        / 255.0
    )
    height -= engr_np * 0.65
    roughness = np.clip(roughness + engr_np * 0.08, 0.14, 0.90)

    save_rgb_png(albedo, os.path.join(OUT_DIR, "scar_fde_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "scar_fde_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "scar_fde_roughness.png"))
    print("[OK] Generated scar_fde_{albedo,normal,roughness}.png (2048x2048)")


if __name__ == "__main__":
    build_scar_fde_suite()
