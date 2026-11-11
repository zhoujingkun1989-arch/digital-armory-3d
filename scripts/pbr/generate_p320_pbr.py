#!/usr/bin/env python3
"""
Generates high-resolution 2K multi-channel PBR textures (Albedo + OpenGL Tangent-Space Normal + Roughness)
for #10 SIG Sauer P320 M17 (9x19mm Modular Handgun System, Coyote Tan PVD / Coyote FDE) in public/textures/:
  - p320_m17_albedo.png    (2048x2048, sRGB)
  - p320_m17_normal.png    (2048x2048, Linear OpenGL Tangent-Space Normal)
  - p320_m17_roughness.png (2048x2048, Linear Roughness)

Atlas UV Layout (u in [0, 1] left-to-right, v in [0, 1] bottom-to-top):
  - v in [0.76, 0.98], u in [0.02, 0.98]: Coyote Tan PVD (#9d8363) Slide Right Wall (M17 UID matrix & 9mmx19)
  - v in [0.52, 0.74], u in [0.02, 0.98]: Coyote Tan PVD (#9d8363) Slide Left Wall (SIG SAUER P320 & M17 rollmarks)
  - v in [0.45, 0.50], u in [0.02, 0.56]: Coyote Tan PVD Slide Top Deck & Bullnose Bevels
  - v in [0.45, 0.50], u in [0.60, 0.98]: Dark Coyote PVD Milled Serration Recesses & Cutouts
  - v in [0.23, 0.44], u in [0.02, 0.72]: Coyote FDE (#8d7251) Polymer Grip Module Right Flank + Stipple + SIG SAUER
  - v in [0.01, 0.22], u in [0.02, 0.72]: Coyote FDE (#8d7251) Polymer Grip Module Left Flank + Stipple + SIG SAUER
  - v in [0.30, 0.43], u in [0.75, 0.98]: Brushed Stainless FCU Serial Plate w/ Laser-Etched "TF004912"
  - v in [0.16, 0.28], u in [0.75, 0.98]: Brushed 17-4 PH Stainless Steel FCU Chassis Rails & Walls
  - v in [0.02, 0.14], u in [0.75, 0.98]: Coyote FDE (#8d7251) Polymer Edge & 17rd Magazine Baseplate Swatch
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "textures")
os.makedirs(OUT_DIR, exist_ok=True)

FONT_CANDIDATES_BOLD = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
]

FONT_CANDIDATES_MONO = [
    "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def load_font(candidates, size: int):
    for fp in candidates:
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


def paste_world_canvas_to_uv(
    target_mask: np.ndarray,
    canvas_img: Image.Image,
    u0: float,
    u1: float,
    v0: float,
    v1: float,
) -> None:
    H, W = target_mask.shape
    x0 = int(round(u0 * W))
    x1 = int(round(u1 * W))
    y0 = int(round((1.0 - v1) * H))
    y1 = int(round((1.0 - v0) * H))
    resized = canvas_img.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=Image.Resampling.BICUBIC)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    target_mask[y0:y1, x0:x1] = np.maximum(target_mask[y0:y1, x0:x1], arr)


def build_p320_m17_atlas() -> None:
    W, H = 2048, 2048

    # High-frequency micro-textures ONLY (optically flat CNC/molded walls, zero wavy low-freq normal noise!)
    pvd_micro = spectral_noise(H, W, 320, 680, seed=3201)
    cnc_brush = spectral_noise(H, W, 180, 560, seed=3202, aniso_x=3.5, aniso_y=0.35)
    poly_edm = spectral_noise(H, W, 260, 640, seed=3203)
    stipple_hi = spectral_noise(H, W, 420, 880, seed=3204)
    oil_subtle = spectral_noise(H, W, 8, 26, seed=3205)

    v_grid = np.broadcast_to(1.0 - (np.arange(H, dtype=np.float32)[:, None] + 0.5) / H, (H, W))
    u_grid = np.broadcast_to((np.arange(W, dtype=np.float32)[None, :] + 0.5) / W, (H, W))

    # Exact target palettes from specification:
    # 1) Warm Coyote Tan PVD metallic slide: #9d8363 -> (157, 131, 99) / 255 = (0.6157, 0.5137, 0.3882)
    coyote_pvd = np.array([0.616, 0.514, 0.388], dtype=np.float32)
    coyote_pvd_dark = np.array([0.435, 0.355, 0.262], dtype=np.float32)
    # 2) Coyote FDE polymer grip module & baseplate: #8d7251 -> (141, 114, 81) / 255 = (0.5529, 0.4471, 0.3176)
    coyote_fde = np.array([0.553, 0.447, 0.318], dtype=np.float32)
    coyote_stipple_col = np.array([0.468, 0.374, 0.262], dtype=np.float32)
    # 3) Brushed 17-4 PH Stainless FCU plate:
    fcu_stainless = np.array([0.845, 0.868, 0.902], dtype=np.float32)

    albedo = np.broadcast_to(coyote_fde, (H, W, 3)).copy()
    height = np.zeros((H, W), dtype=np.float32)
    roughness = np.full((H, W), 0.64, dtype=np.float32)

    # ==========================================================================
    # ZONE 1: COYOTE TAN PVD STAINLESS SLIDE (v >= 0.445)
    # ==========================================================================
    slide_mask = v_grid >= 0.445
    albedo[slide_mask] = (
        coyote_pvd
        + pvd_micro[slide_mask, None] * 0.007
        + cnc_brush[slide_mask, None] * 0.005
        - oil_subtle[slide_mask, None] * 0.002
    )
    # Optically flat PVD sheet/CNC surface: micro-grain only
    height[slide_mask] = pvd_micro[slide_mask] * 0.04 + cnc_brush[slide_mask] * 0.03
    roughness[slide_mask] = 0.27 + pvd_micro[slide_mask] * 0.018 - oil_subtle[slide_mask] * 0.008

    # Dark milled recess swatch for cocking serration roots & internal slide cuts (v in [0.445, 0.508], u >= 0.58)
    milled_mask = (v_grid >= 0.445) & (v_grid <= 0.508) & (u_grid >= 0.58)
    albedo[milled_mask] = coyote_pvd_dark + pvd_micro[milled_mask, None] * 0.007
    roughness[milled_mask] = 0.44

    # Subtle top-shoulder bevel specular wear lines along Left & Right slide bands
    bevel_r = np.exp(-((v_grid - 0.915) / 0.011) ** 2) * (v_grid >= 0.75)
    bevel_l = np.exp(-((v_grid - 0.675) / 0.011) ** 2) * ((v_grid >= 0.51) & (v_grid <= 0.75))
    bevel_hi = np.clip((bevel_r + bevel_l) * 0.35, 0.0, 0.35)
    pvd_edge_tint = np.array([0.725, 0.635, 0.515], dtype=np.float32)
    albedo = albedo * (1.0 - bevel_hi[..., None]) + pvd_edge_tint * bevel_hi[..., None]
    roughness -= bevel_hi * 0.06

    # Slide Rollmarks rendered in proportional 1:1 world coordinates (19.50 x 2.70 cm -> 1950 x 270 px)
    # Left Slide Wall: v in [0.52, 0.74], u in [0.02, 0.98]
    # Note: on Left view, u=0 is muzzle (+X), u=1 is rear (-X), so left-to-right text sits cleanly between serrations!
    sw_w, sw_h = 1950, 270
    slide_left_canvas = Image.new("L", (sw_w, sw_h), 0)
    dl = ImageDraw.Draw(slide_left_canvas)
    f_sig = load_font(FONT_CANDIDATES_BOLD, 66)
    f_model = load_font(FONT_CANDIDATES_BOLD, 56)
    f_m17 = load_font(FONT_CANDIDATES_BOLD, 44)
    f_sub = load_font(FONT_CANDIDATES_BOLD, 24)

    # Positioned on smooth side flat between front serrations (px 0..420) and rear serrations (px 1520..1900)
    dl.text((545, 78), "SIG SAUER", fill=245, font=f_sig)
    dl.text((955, 86), "P320", fill=245, font=f_model)
    dl.rounded_rectangle([1145, 84, 1295, 144], radius=8, outline=235, width=4)
    dl.text((1173, 92), "M17", fill=245, font=f_m17)
    dl.text((550, 158), "NEWINGTON, NH, USA", fill=195, font=f_sub)

    # Right Slide Wall: v in [0.76, 0.98], u in [0.02, 0.98] (u=0 is rear -X, u=1 is muzzle +X)
    slide_right_canvas = Image.new("L", (sw_w, sw_h), 0)
    dr = ImageDraw.Draw(slide_right_canvas)
    # US Army M17 UID Data-Matrix & cage marking forward of ejection port / rear flat
    uid_x, uid_y = 1140, 96
    dr.rectangle([uid_x, uid_y, uid_x + 62, uid_y + 62], outline=220, width=3)
    rng_uid = np.random.default_rng(17)
    for r_i in range(6):
        for c_i in range(6):
            if rng_uid.random() > 0.42:
                dr.rectangle(
                    [uid_x + 7 + c_i * 8, uid_y + 7 + r_i * 8, uid_x + 13 + c_i * 8, uid_y + 13 + r_i * 8],
                    fill=215,
                )
    dr.text((1222, 96), "US  M17   9mm × 19", fill=225, font=f_sub)
    dr.text((1222, 130), "CAGE 7Z546  P320-M17", fill=195, font=f_sub)

    slide_engrave = np.zeros((H, W), dtype=np.float32)
    paste_world_canvas_to_uv(slide_engrave, slide_left_canvas, 0.02, 0.98, 0.52, 0.74)
    paste_world_canvas_to_uv(slide_engrave, slide_right_canvas, 0.02, 0.98, 0.76, 0.98)

    engrave_col = np.array([0.315, 0.252, 0.185], dtype=np.float32)
    albedo = albedo * (1.0 - slide_engrave[..., None] * 0.78) + engrave_col * (slide_engrave[..., None] * 0.78)
    height -= slide_engrave * 0.95
    roughness = np.clip(roughness + slide_engrave * 0.16, 0.10, 0.92)

    # Subtle golden-brass case kiss marks right behind ejection port on Right Slide Wall
    brass_spot = np.exp(-(((u_grid - 0.36) / 0.022) ** 2 + ((v_grid - 0.90) / 0.024) ** 2))
    brass_col = np.array([0.76, 0.62, 0.32], dtype=np.float32)
    albedo = albedo * (1.0 - brass_spot[..., None] * 0.25) + brass_col * (brass_spot[..., None] * 0.25)

    # ==========================================================================
    # ZONE 2: COYOTE FDE POLYMER CARRY GRIP MODULE (v < 0.445, u < 0.735)
    # ==========================================================================
    grip_mask = (v_grid < 0.445) & (u_grid < 0.735)
    albedo[grip_mask] = coyote_fde + poly_edm[grip_mask, None] * 0.010
    height[grip_mask] = poly_edm[grip_mask] * 0.14
    roughness[grip_mask] = 0.66 + poly_edm[grip_mask] * 0.03

    # Build proportional 1:1 world-space Grip Flank canvases (18.8 x 10.8 cm -> 1504 x 864 px)
    # Grip world X in [-9.1, +9.7], world Y in [-9.7, +1.1]
    gw_w, gw_h = 1504, 864

    def make_grip_flank_masks(is_left: bool):
        stip_img = Image.new("L", (gw_w, gw_h), 0)
        med_border_img = Image.new("L", (gw_w, gw_h), 0)
        text_img = Image.new("L", (gw_w, gw_h), 0)

        ds = ImageDraw.Draw(stip_img)
        db = ImageDraw.Draw(med_border_img)
        dt = ImageDraw.Draw(text_img)

        def wx_wy_to_px(wx: float, wy: float):
            xn = (wx - (-9.1)) / 18.8
            yn = (wy - (-9.7)) / 10.8
            px = (1.0 - xn) * gw_w if is_left else xn * gw_w
            py = (1.0 - yn) * gw_h
            return (px, py)

        # Ergonomic P320 Carry laser-stippled grip panel polygon (-18 deg grip angle!)
        panel_world = [
            (-3.25, -1.75),
            (-6.25, -1.55),
            (-7.88, -8.35),
            (-4.95, -8.85),
        ]
        poly_px = [wx_wy_to_px(x, y) for (x, y) in panel_world]
        ds.polygon(poly_px, fill=255)

        # Smooth recessed oval/stadium medallion centered on the grip panel at (-5.45, -5.15)
        cx, cy = wx_wy_to_px(-5.48, -5.12)
        rx_px, ry_px = 148, 82
        ds.ellipse([cx - rx_px, cy - ry_px, cx + rx_px, cy + ry_px], fill=0)
        db.ellipse([cx - rx_px, cy - ry_px, cx + rx_px, cy + ry_px], outline=235, width=6)
        db.polygon(poly_px, outline=210, width=5)

        f_med = load_font(FONT_CANDIDATES_BOLD, 44)
        f_med_sub = load_font(FONT_CANDIDATES_BOLD, 22)
        dt.text((cx - 118, cy - 28), "SIG SAUER", fill=250, font=f_med)
        dt.text((cx - 48, cy + 22), "M17  FDE", fill=215, font=f_med_sub)

        # Subtle molded frame marking on dust cover
        dcx, dcy = wx_wy_to_px(5.6, 0.35)
        f_dc = load_font(FONT_CANDIDATES_BOLD, 20)
        if is_left:
            dt.text((dcx - 90, dcy - 10), "P320  CARRY  MOD.", fill=185, font=f_dc)
        else:
            dt.text((dcx - 135, dcy - 10), "NEWINGTON, NH, USA", fill=185, font=f_dc)

        return (
            stip_img.filter(ImageFilter.GaussianBlur(radius=0.8)),
            med_border_img.filter(ImageFilter.GaussianBlur(radius=0.7)),
            text_img.filter(ImageFilter.GaussianBlur(radius=0.5)),
        )

    stip_r, bord_r, txt_r = make_grip_flank_masks(is_left=False)
    stip_l, bord_l, txt_l = make_grip_flank_masks(is_left=True)

    stipple_mask = np.zeros((H, W), dtype=np.float32)
    border_mask = np.zeros((H, W), dtype=np.float32)
    grip_txt_mask = np.zeros((H, W), dtype=np.float32)

    paste_world_canvas_to_uv(stipple_mask, stip_r, 0.02, 0.72, 0.23, 0.44)
    paste_world_canvas_to_uv(border_mask, bord_r, 0.02, 0.72, 0.23, 0.44)
    paste_world_canvas_to_uv(grip_txt_mask, txt_r, 0.02, 0.72, 0.23, 0.44)

    paste_world_canvas_to_uv(stipple_mask, stip_l, 0.02, 0.72, 0.01, 0.22)
    paste_world_canvas_to_uv(border_mask, bord_l, 0.02, 0.72, 0.01, 0.22)
    paste_world_canvas_to_uv(grip_txt_mask, txt_l, 0.02, 0.72, 0.01, 0.22)

    # Apply laser-stippled grip texture (darker toasted Coyote FDE + crisp granular stipple normal + high matte roughness)
    albedo = (
        albedo * (1.0 - stipple_mask[..., None] * 0.88)
        + (coyote_stipple_col + stipple_hi[..., None] * 0.022) * (stipple_mask[..., None] * 0.88)
    )
    height += stipple_mask * (-0.35 + stipple_hi * 0.75)
    roughness = np.clip(roughness + stipple_mask * 0.17, 0.10, 0.94)

    # Molded border rim & embossed SIG SAUER medallion lettering
    molded_hi = np.array([0.685, 0.575, 0.435], dtype=np.float32)
    molded_sh = np.array([0.385, 0.305, 0.208], dtype=np.float32)
    albedo = albedo * (1.0 - border_mask[..., None] * 0.55) + molded_sh * (border_mask[..., None] * 0.55)
    height -= border_mask * 0.65

    albedo = albedo * (1.0 - grip_txt_mask[..., None] * 0.72) + molded_hi * (grip_txt_mask[..., None] * 0.72)
    height += grip_txt_mask * 0.95
    roughness = np.clip(roughness - grip_txt_mask * 0.14, 0.10, 0.94)

    # ==========================================================================
    # ZONE 3: SERIALIZED STAINLESS FCU ("TF004912") & FDE BASEPLATE SWATCH (u >= 0.74)
    # ==========================================================================
    # 3A. Serialized Stainless FCU Window Plate: u in [0.75, 0.98], v in [0.30, 0.43]
    fcu_serial_mask = (u_grid >= 0.745) & (u_grid <= 0.985) & (v_grid >= 0.295) & (v_grid <= 0.435)
    # 3B. Brushed Stainless FCU Chassis Rails/Body: u in [0.75, 0.98], v in [0.16, 0.285]
    fcu_body_mask = (u_grid >= 0.745) & (u_grid <= 0.985) & (v_grid >= 0.155) & (v_grid < 0.295)
    fcu_all = fcu_serial_mask | fcu_body_mask

    albedo[fcu_all] = fcu_stainless + cnc_brush[fcu_all, None] * 0.015
    height[fcu_all] = cnc_brush[fcu_all] * 0.08
    roughness[fcu_all] = 0.20 + pvd_micro[fcu_all] * 0.02

    # Engrave "TF004912" onto FCU Serial Plate
    ser_w, ser_h = 480, 260
    ser_canvas = Image.new("L", (ser_w, ser_h), 0)
    dser = ImageDraw.Draw(ser_canvas)
    f_ser = load_font(FONT_CANDIDATES_MONO, 64)
    f_ser_sm = load_font(FONT_CANDIDATES_BOLD, 22)
    dser.rounded_rectangle([18, 22, ser_w - 18, ser_h - 22], radius=14, outline=210, width=5)
    dser.text((54, 48), "SIG SAUER  FCU", fill=190, font=f_ser_sm)
    dser.text((48, 92), "TF004912", fill=255, font=f_ser)
    dser.text((54, 182), "MODULAR CHASSIS · US M17", fill=185, font=f_ser_sm)

    ser_mask = np.zeros((H, W), dtype=np.float32)
    paste_world_canvas_to_uv(
        ser_mask,
        ser_canvas.filter(ImageFilter.GaussianBlur(radius=0.55)),
        0.75,
        0.98,
        0.30,
        0.43,
    )
    laser_dark = np.array([0.18, 0.20, 0.23], dtype=np.float32)
    albedo = albedo * (1.0 - ser_mask[..., None] * 0.85) + laser_dark * (ser_mask[..., None] * 0.85)
    height -= ser_mask * 1.05
    roughness = np.clip(roughness + ser_mask * 0.32, 0.10, 0.94)

    # 3C. Coyote FDE Polymer Edge & 17-rd Magazine Baseplate Swatch: u in [0.75, 0.98], v in [0.02, 0.145]
    fde_sw_mask = (u_grid >= 0.745) & (u_grid <= 0.985) & (v_grid >= 0.015) & (v_grid < 0.155)
    albedo[fde_sw_mask] = coyote_fde + poly_edm[fde_sw_mask, None] * 0.009
    height[fde_sw_mask] = poly_edm[fde_sw_mask] * 0.12
    roughness[fde_sw_mask] = 0.65 + poly_edm[fde_sw_mask] * 0.03

    save_rgb_png(albedo, os.path.join(OUT_DIR, "p320_m17_albedo.png"))
    height_to_normal_png(height, strength=2.2, out_path=os.path.join(OUT_DIR, "p320_m17_normal.png"))
    save_gray_png(roughness, os.path.join(OUT_DIR, "p320_m17_roughness.png"))
    print("[OK] Generated p320_m17_{albedo,normal,roughness}.png (2048x2048)")


if __name__ == "__main__":
    build_p320_m17_atlas()
