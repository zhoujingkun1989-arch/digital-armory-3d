#!/usr/bin/env python3
"""
Generates high-resolution 2K multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for #5 Barrett M82A1 (.50 BMG / 12.7x99mm Anti-Materiel Sniper Rifle) in public/textures/:
  - m82a1_body_albedo.png    (2048 x 1024, sRGB)
  - m82a1_body_normal.png    (2048 x 1024, Linear OpenGL tangent-space normal, flat sheet-steel normals!)
  - m82a1_body_roughness.png (2048 x 1024, Linear roughness)

UV Atlas Layout (u in [0, 1] left->right, v in [0, 1] bottom->top):
  - Band A (v in [0.68, 0.98]): Stamped sheet-steel Upper Receiver walls (Manganese-Phosphate Parkerized steel,
    roll-stamped 'BARRETT FIREARMS MFG. INC. / MURFREESBORO, TN U.S.A. / MODEL 82A1 .50 CAL', subtle edge wear)
  - Band B (v in [0.38, 0.66]):
      * u in [0.02, 0.54]: Sheet-steel Lower Receiver walls w/ SAFE (white) & FIRE (crimson) selector markings & spot welds
      * u in [0.56, 0.98]: 10-Round .50 BMG Ribbed Stamped Steel Magazine w/ 4 vertical ribs & '.50 CAL 10 RD' stamp
  - Band C (v in [0.02, 0.35]):
      * u in [0.02, 0.56], v in [0.17, 0.34]: Leupold Mark 4 matte anodized scope body + gold Leupold objective ring
      * u in [0.02, 0.56], v in [0.02, 0.16]: Scope M1 Turret Drum w/ crisp white '0..15 MIL' graduations
      * u in [0.58, 0.76], v in [0.03, 0.33]: Blue-Green Multi-Coated Optical Glass Lens swatch (roughness = 0.05)
      * u in [0.78, 0.88], v in [0.03, 0.33]: Thick Sorbothane Ribbed Recoil Buttpad elastomer swatch (roughness = 0.86)
      * u in [0.89, 0.98], v in [0.03, 0.33]: Brushed Stainless Steel cross-pins & rails swatch (roughness = 0.19)
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
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


def micro_grain(h: int, w: int, seed: int, aniso_x: float = 1.0, aniso_y: float = 1.0) -> np.ndarray:
    """High-frequency micro-crystalline manganese-phosphate grain with ZERO low-frequency wavy distortion."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h / aniso_y
    fx = np.fft.rfftfreq(w)[None, :] * w / aniso_x
    freq = np.sqrt(fx * fx + fy * fy)
    envelope = np.exp(-0.5 * ((freq - 320.0) / 140.0) ** 2)
    envelope[0, 0] = 0.0
    field = np.fft.irfft2(spec * envelope, s=(h, w))
    std = float(np.std(field)) + 1e-7
    return (field / std).astype(np.float32)


def subtle_cloud(h: int, w: int, seed: int) -> np.ndarray:
    """Gentle gun-oil sheen variation (used ONLY for roughness/albedo micro-sheen, NEVER normal height!)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.rfftfreq(w)[None, :] * w
    freq = np.sqrt(fx * fx + fy * fy)
    envelope = np.exp(-0.5 * ((freq - 9.0) / 8.0) ** 2)
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


def build_m82a1_body_suite() -> None:
    W, H = 2048, 1024
    phos = micro_grain(H, W, seed=501)
    brush = micro_grain(H, W, seed=502, aniso_x=3.2, aniso_y=0.35)
    oil = subtle_cloud(H, W, seed=503)

    v_grid = 1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H
    u_grid = (np.arange(W, dtype=np.float32)[None, :] + 0.5) / W

    # Base: Dark US Military Manganese-Phosphate Parkerized Steel (#292d33 -> linear-ish sRGB ~ [0.165, 0.178, 0.198])
    albedo = np.zeros((H, W, 3), dtype=np.float32)
    albedo[..., 0] = 0.168
    albedo[..., 1] = 0.180
    albedo[..., 2] = 0.198
    albedo += (phos * 0.006 - oil * 0.006)[..., None]

    # Optically FLAT sheet-steel height field (micro-crystalline grain only -> flat lavender normal map [128,128,255]!)
    height = phos * 0.045
    roughness = np.broadcast_to(0.52 - oil * 0.04 + phos * 0.02, (H, W)).copy()

    # =========================================================================
    # BAND A (v in [0.68, 0.98]): UPPER RECEIVER PARKERIZED SHEET STEEL
    # =========================================================================
    # Subtle silver edge-wear along top octagonal shoulder fold (v ~ 0.955) & bottom split seam (v ~ 0.695)
    upper_mask = (v_grid >= 0.68) & (v_grid <= 0.98)
    edge_hi = (
        np.exp(-((v_grid - 0.956) / 0.010) ** 2)
        + 0.65 * np.exp(-((v_grid - 0.695) / 0.009) ** 2)
    ) * upper_mask
    bare_steel = np.array([0.58, 0.62, 0.68], dtype=np.float32)
    wear_amt = np.clip(edge_hi * (0.35 + 0.18 * np.maximum(0.0, oil)), 0.0, 0.55)
    albedo = albedo * (1.0 - wear_amt[..., None] * 0.42) + bare_steel * (wear_amt[..., None] * 0.42)
    roughness -= wear_amt * 0.10

    # Subtle golden-brass .50 BMG case deflector kiss behind right ejection port (u ~ 0.73, v ~ 0.83)
    brass_kiss = np.exp(-(((u_grid - 0.735) / 0.022) ** 2 + ((v_grid - 0.83) / 0.030) ** 2))
    brass_col = np.array([0.70, 0.54, 0.22], dtype=np.float32)
    albedo = albedo * (1.0 - brass_kiss[..., None] * 0.36) + brass_col * (brass_kiss[..., None] * 0.36)
    roughness -= brass_kiss * 0.08

    # =========================================================================
    # BAND B (v in [0.38, 0.66]): LOWER RECEIVER & 10-RD .50 BMG RIBBED MAG
    # =========================================================================
    lower_mask = (v_grid >= 0.38) & (v_grid <= 0.66) & (u_grid < 0.55)
    albedo[lower_mask] *= 0.95  # Slightly deeper charcoal-grey phosphate on lower

    # Crisp spot-weld circular dimples along lower sheet-metal flange (v = 0.425)
    for wx in [0.08, 0.16, 0.24, 0.32, 0.40, 0.48]:
        weld = np.exp(-(((u_grid - wx) / 0.006) ** 2 + ((v_grid - 0.425) / 0.011) ** 2))
        height -= weld * 0.55
        albedo -= (weld * 0.022)[..., None]

    # Magazine sub-atlas (u in [0.56, 0.98], v in [0.38, 0.66]): 4 vertical stamped strengthening ribs!
    mag_mask = (v_grid >= 0.38) & (v_grid <= 0.66) & (u_grid >= 0.56) & (u_grid <= 0.98)
    albedo[mag_mask, 0] = 0.145 + phos[mag_mask] * 0.006
    albedo[mag_mask, 1] = 0.156 + phos[mag_mask] * 0.006
    albedo[mag_mask, 2] = 0.174 + phos[mag_mask] * 0.006
    roughness[mag_mask] = 0.48 + phos[mag_mask] * 0.02

    rib_band_v = (v_grid >= 0.42) & (v_grid <= 0.61)
    for rc in [0.63, 0.72, 0.81, 0.90]:
        rib = np.exp(-((u_grid - rc) / 0.012) ** 2) * rib_band_v
        height -= rib * 0.85
        albedo -= (rib * 0.025)[..., None]
        # Subtle highlight on rib shoulder
        rib_edge = np.exp(-((np.abs(u_grid - rc) - 0.014) / 0.004) ** 2) * rib_band_v
        albedo += (rib_edge * 0.022)[..., None]
        roughness -= rib_edge * 0.06

    # Top magwell insertion wear on upper 25% of magazine (v in [0.60, 0.66])
    mag_wear = mag_mask & (v_grid >= 0.605)
    albedo[mag_wear] = albedo[mag_wear] * 0.86 + bare_steel * 0.14
    roughness[mag_wear] = 0.35

    # =========================================================================
    # BAND C (v in [0.02, 0.35]): LEUPOLD MARK 4 SCOPE, TURRET MILS & SWATCHES
    # =========================================================================
    # 1. Matte black hard-anodized scope body + turret drum base (u in [0.02, 0.56], v in [0.02, 0.35])
    scope_mask = (v_grid >= 0.02) & (v_grid <= 0.35) & (u_grid >= 0.02) & (u_grid <= 0.56)
    albedo[scope_mask, 0] = 0.112 + phos[scope_mask] * 0.004
    albedo[scope_mask, 1] = 0.118 + phos[scope_mask] * 0.004
    albedo[scope_mask, 2] = 0.132 + phos[scope_mask] * 0.004
    roughness[scope_mask] = 0.44 + phos[scope_mask] * 0.02

    # Iconic Leupold metallic Gold Ring around front objective bell (u in [0.465, 0.482], v in [0.17, 0.34])
    gold_ring = (v_grid >= 0.17) & (v_grid <= 0.34) & (u_grid >= 0.465) & (u_grid <= 0.482)
    albedo[gold_ring] = np.array([0.84, 0.68, 0.24], dtype=np.float32)
    roughness[gold_ring] = 0.20
    height[gold_ring] += 0.35

    # Knurled grip band at top of M1 turret (v in [0.132, 0.156], u in [0.02, 0.56])
    knurl_mask = (v_grid >= 0.132) & (v_grid <= 0.156) & (u_grid >= 0.02) & (u_grid <= 0.56)
    knurl_wave = np.broadcast_to(np.sin(u_grid * 380.0 * np.pi), (H, W))
    height[knurl_mask] += knurl_wave[knurl_mask] * 0.55
    roughness[knurl_mask] = 0.58

    # 2. Blue-Green Emerald Multi-Coated Sniper Lens Swatch (u in [0.58, 0.76], v in [0.03, 0.33])
    lens_mask = (v_grid >= 0.03) & (v_grid <= 0.33) & (u_grid >= 0.58) & (u_grid <= 0.76)
    du = (u_grid - 0.67) / 0.085
    dv = (v_grid - 0.18) / 0.145
    r_lens = np.sqrt(du * du + dv * dv)
    deep_sapphire = np.array([0.045, 0.20, 0.29], dtype=np.float32)
    emerald_coat = np.array([0.08, 0.68, 0.60], dtype=np.float32)
    cyan_glint = np.array([0.55, 0.95, 0.90], dtype=np.float32)
    coat_ring = np.clip(np.exp(-((r_lens - 0.58) / 0.32) ** 2), 0.0, 1.0)
    spec_arc = np.clip(np.exp(-(((du + 0.28) / 0.22) ** 2 + ((dv - 0.30) / 0.16) ** 2)), 0.0, 1.0)
    lens_rgb = (
        deep_sapphire * (1.0 - coat_ring[..., None] * 0.68)
        + emerald_coat * (coat_ring[..., None] * 0.68)
        + cyan_glint * (spec_arc[..., None] * 0.45)
    )
    albedo[lens_mask] = np.clip(lens_rgb[lens_mask], 0.0, 1.0)
    roughness[lens_mask] = 0.05  # Mirror-smooth multi-coated optical glass!
    height[lens_mask] = 0.0

    # 3. Thick Sorbothane Ribbed Recoil Buttpad Swatch (u in [0.78, 0.88], v in [0.03, 0.33])
    pad_mask = (v_grid >= 0.03) & (v_grid <= 0.33) & (u_grid >= 0.78) & (u_grid <= 0.88)
    pad_grooves = np.broadcast_to(np.sin(v_grid * 140.0 * np.pi), (H, W))
    albedo[pad_mask] = np.array([0.082, 0.086, 0.098], dtype=np.float32)
    roughness[pad_mask] = 0.86
    height[pad_mask] = pad_grooves[pad_mask] * 0.45

    # 4. Bright Brushed Stainless Steel Swatch (u in [0.89, 0.98], v in [0.03, 0.33])
    ss_mask = (v_grid >= 0.03) & (v_grid <= 0.33) & (u_grid >= 0.89) & (u_grid <= 0.98)
    albedo[ss_mask] = np.array([0.78, 0.82, 0.87], dtype=np.float32) + brush[ss_mask, None] * 0.015
    roughness[ss_mask] = 0.19
    height[ss_mask] = brush[ss_mask] * 0.12

    # =========================================================================
    # VECTOR TEXT & MIL-GRADUATION OVERLAYS (PIL crisp anti-aliased stamps)
    # =========================================================================
    white_layer = Image.new("L", (W, H), 0)
    red_layer = Image.new("L", (W, H), 0)
    gold_layer = Image.new("L", (W, H), 0)
    engrave_layer = Image.new("L", (W, H), 0)

    dw = ImageDraw.Draw(white_layer)
    dr = ImageDraw.Draw(red_layer)
    dg = ImageDraw.Draw(gold_layer)
    de = ImageDraw.Draw(engrave_layer)

    f_title = load_font(34)
    f_sub = load_font(23)
    f_model = load_font(31)
    f_small = load_font(19)
    f_mil = load_font(18)
    f_tiny = load_font(14)

    # 1) Upper Receiver Left Wall Roll-Markings (u in [0.06, 0.50], v in [0.74, 0.92])
    ux0 = int(0.065 * W)
    uy0 = int((1.0 - 0.905) * H)
    dw.text((ux0, uy0), "BARRETT FIREARMS MFG. INC.", fill=228, font=f_title)
    dw.text((ux0, uy0 + 40), "MURFREESBORO, TN  U.S.A.", fill=200, font=f_sub)
    dw.text((ux0, uy0 + 74), "MODEL 82A1     .50 CAL", fill=238, font=f_model)
    dw.text((ux0, uy0 + 112), "SN  82A1-04917       CAGE 64872", fill=185, font=f_small)

    de.text((ux0, uy0), "BARRETT FIREARMS MFG. INC.", fill=235, font=f_title)
    de.text((ux0, uy0 + 40), "MURFREESBORO, TN  U.S.A.", fill=210, font=f_sub)
    de.text((ux0, uy0 + 74), "MODEL 82A1     .50 CAL", fill=235, font=f_model)

    # Picatinny 27-MOA T-slot numbers along upper rail edge (v ~ 0.965)
    for idx, tnum in enumerate(["T4", "T8", "T12", "T16", "T20", "T24", "27 MOA"]):
        tx = int((0.10 + idx * 0.065) * W)
        ty = int((1.0 - 0.972) * H)
        dw.text((tx, ty), tnum, fill=180, font=f_tiny)

    # 2) Lower Receiver SAFE / FIRE Selector Markings (u ~ 0.16..0.28, v ~ 0.49..0.59)
    sx = int(0.165 * W)
    sy_fire = int((1.0 - 0.585) * H)
    sy_safe = int((1.0 - 0.505) * H)
    dr.ellipse([sx - 18, sy_fire + 6, sx - 6, sy_fire + 18], fill=255)
    dr.text((sx, sy_fire), "FIRE", fill=250, font=f_sub)
    dw.ellipse([sx - 18, sy_safe + 6, sx - 6, sy_safe + 18], fill=235)
    dw.text((sx, sy_safe), "SAFE", fill=235, font=f_sub)
    dw.text((int(0.30 * W), int((1.0 - 0.555) * H)), "M82A1 / M107  LOWER", fill=165, font=f_small)

    # 3) 10-Round .50 BMG Magazine Stamp (u ~ 0.64, v ~ 0.405)
    mx = int(0.635 * W)
    my = int((1.0 - 0.415) * H)
    dw.text((mx, my), "BARRETT   .50 BMG   10 RD", fill=190, font=f_small)
    de.text((mx, my), "BARRETT   .50 BMG   10 RD", fill=210, font=f_small)

    # 4) Leupold Mark 4 Scope Body Markings (u in [0.06, 0.44], v ~ 0.25)
    scx = int(0.06 * W)
    scy = int((1.0 - 0.275) * H)
    dg.text((scx, scy), "LEUPOLD   MARK 4   4.5-14×50mm LR/T", fill=235, font=f_sub)
    dw.text((scx, scy + 32), "M1  MIL-DOT  1 CLICK = 0.1 MIL", fill=200, font=f_small)

    # 5) Scope Turret White 0..15 MIL Graduations (u in [0.03, 0.55], v in [0.03, 0.125])
    u_start, u_end = 0.035, 0.545
    y_base = int((1.0 - 0.035) * H)
    dw.line([(int(u_start * W), y_base), (int(u_end * W), y_base)], fill=235, width=2)

    total_tenths = 150  # 0.0 to 15.0 MIL (10 subdivisions per MIL -> ultra-crisp vernier look)
    for k in range(total_tenths + 1):
        if k % 2 != 0:
            continue  # Every 0.2 MIL tick for crisp pixel spacing
        u_pos = u_start + (k / float(total_tenths)) * (u_end - u_start)
        px = int(u_pos * W)
        if k % 10 == 0:
            tick_h = 26
            mil_val = k // 10
            lbl = str(mil_val)
            dw.line([(px, y_base), (px, y_base - tick_h)], fill=255, width=3)
            dw.text((px - (5 if mil_val < 10 else 9), y_base - tick_h - 21), lbl, fill=255, font=f_mil)
        else:
            tick_h = 13
            dw.line([(px, y_base), (px, y_base - tick_h)], fill=215, width=2)

    dw.text((int(0.035 * W), int((1.0 - 0.126) * H)), "UP  0..15 MIL  ->  1/10 MIL", fill=225, font=f_tiny)

    # Composite text layers into Albedo, Height & Roughness
    w_arr = np.asarray(white_layer.filter(ImageFilter.GaussianBlur(radius=0.35)), dtype=np.float32) / 255.0
    r_arr = np.asarray(red_layer.filter(ImageFilter.GaussianBlur(radius=0.35)), dtype=np.float32) / 255.0
    g_arr = np.asarray(gold_layer.filter(ImageFilter.GaussianBlur(radius=0.35)), dtype=np.float32) / 255.0
    e_arr = np.asarray(engrave_layer.filter(ImageFilter.GaussianBlur(radius=0.55)), dtype=np.float32) / 255.0

    white_ink = np.array([0.86, 0.88, 0.91], dtype=np.float32)
    red_ink = np.array([0.84, 0.15, 0.16], dtype=np.float32)
    gold_ink = np.array([0.85, 0.70, 0.28], dtype=np.float32)

    albedo = albedo * (1.0 - w_arr[..., None] * 0.84) + white_ink * (w_arr[..., None] * 0.84)
    albedo = albedo * (1.0 - r_arr[..., None] * 0.88) + red_ink * (r_arr[..., None] * 0.88)
    albedo = albedo * (1.0 - g_arr[..., None] * 0.85) + gold_ink * (g_arr[..., None] * 0.85)

    height -= e_arr * 0.95
    roughness = np.clip(roughness - g_arr * 0.18 + w_arr * 0.05, 0.04, 0.92)

    save_rgb_png(albedo, os.path.join(OUT_DIR, "m82a1_body_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "m82a1_body_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "m82a1_body_roughness.png"))
    print("[OK] Generated public/textures/m82a1_body_{albedo,normal,roughness}.png (2048x1024)")


if __name__ == "__main__":
    build_m82a1_body_suite()
