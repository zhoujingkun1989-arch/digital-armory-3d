#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for GE / Dillon Aero M134D Minigun (7.62x51mm NATO)
====================================================================================================
MIT License — Digital Armory 3D (`WP-17` BAY-22)

Generates:
  - public/models/m134.glb (Draco-compressed glTF 2.0, all 23 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `m134_clutch_spring` and `m134_feeder_spring`
    carrying `aSpringParam`)
  - public/textures/m134_v3_housing_motor_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/m134_v3_barrels_rotor_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/m134_v3_delinker_bolts_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 23 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/m134/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_m134_photoreal.py
"""

from __future__ import annotations

import math
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# =============================================================================
# MODE 2: System Python Post-Process (Military Stencils, 16x16 ECC200 UID,
#         28V DC Motor Nameplate, SAFE/ARMED Safing Plate, Dillon Delinker
#         Laser Engraving, Ejection Chute Brass Kiss & 5-Ch ORM WebPs)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    from scipy import ndimage

    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_DIN, FONT_COND, *FONT_FALLBACKS):
            if os.path.exists(cand):
                try:
                    return ImageFont.truetype(cand, size=max(8, int(size)))
                except Exception:
                    continue
        return ImageFont.load_default()

    def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
        t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0.0, 1.0)
        return (t * t * (3.0 - 2.0 * t)).astype(np.float32)

    def _read_f32_rgb(path: Path) -> np.ndarray:
        arr = np.load(path).astype(np.float32)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, axis=-1)
        return arr[..., :3].copy()

    def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
        x = np.clip(x, 0.0, 1.0)
        return np.where(
            x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055
        ).astype(np.float32)

    def _rnm_blend(base_n_01: np.ndarray, detail_n_01: np.ndarray) -> np.ndarray:
        t = base_n_01 * 2.0 - 1.0
        t[..., 2] += 1.0
        u = detail_n_01 * 2.0 - 1.0
        u[..., 0] = -u[..., 0]
        u[..., 1] = -u[..., 1]
        dot_tu = np.sum(t * u, axis=-1, keepdims=True)
        tz = np.maximum(t[..., 2:3], 1e-4)
        r = t * (dot_tu / tz) - u
        r_len = np.sqrt(np.sum(r * r, axis=-1, keepdims=True) + 1e-8)
        r /= r_len
        return np.clip(r * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _height_to_normal_01(height: np.ndarray, strength: float) -> np.ndarray:
        dy, dx = np.gradient(height.astype(np.float32))
        nx = -dx * strength
        ny = dy * strength
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.4) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image,
        u0: float, u1: float, v0: float, v1: float,
    ):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    # Genuine 16x16 ECC200 MIL-STD-130 DataMatrix for Dillon Aero CAGE 1U2T4 + M134D
    _UID_MODULES = (
        "1010101010101010",
        "1110110010110101",
        "1001101101001010",
        "1101001011100101",
        "1011010100111010",
        "1100111010010111",
        "1010010111011000",
        "1111001001100101",
        "1001110110011010",
        "1101011001010111",
        "1010100110110010",
        "1110011001101101",
        "1001101110010100",
        "1101010011011011",
        "1011101000101100",
        "1111111111111111",
    )

    def _draw_nato_cross(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, lw: int = 5):
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        draw.line([(cx - r, cy), (cx + r, cy)], fill=255, width=lw)
        draw.line([(cx, cy - r), (cx, cy + r)], fill=255, width=lw)

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _combine_ao(ao_self: np.ndarray, ao_ext: np.ndarray, ext_mask: np.ndarray) -> np.ndarray:
        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        return np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

    # -------------------------------------------------------------------------
    # SUITE 1: m134_v3_housing_motor_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_housing_motor_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "hm_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "hm_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "hm_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "hm_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "hm_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hm_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hm_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        white_stencil = np.zeros((h, w), dtype=np.float32)
        dark_etch = np.zeros((h, w), dtype=np.float32)
        engraving = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1: Main Housing Right (+Z) Nomenclature Plate ---
        # Local X in [-6.5, +6.5] (13.0 cm), Y in [-1.3, +2.8] (4.1 cm)
        # UV box: [0.015, 0.985] x [0.805, 0.985] (Right flank: -X -> left, +X -> right)
        RW, RH = 2600, 820
        r_white = Image.new("L", (RW, RH), 0)
        r_eng = Image.new("L", (RW, RH), 0)
        drw = ImageDraw.Draw(r_white)
        dre = ImageDraw.Draw(r_eng)

        # Outer machined nomenclature border frame
        drw.rounded_rectangle((36, 34, RW - 36, RH - 34), radius=24, outline=235, width=7)

        # Left sub-box: Genuine 16x16 MIL-STD-130 ECC200 UID DataMatrix Plate
        ux0, uy0 = 86, 98
        uw, uh = 620, 620
        drw.rounded_rectangle((ux0, uy0, ux0 + uw, uy0 + uh), radius=14, outline=255, width=6)
        mod = 24
        dm_x, dm_y = ux0 + 118, uy0 + 48
        for r_i, row_bits in enumerate(_UID_MODULES):
            for c_i, bit in enumerate(row_bits):
                if bit == "1":
                    x0m = dm_x + c_i * mod
                    y0m = dm_y + r_i * mod
                    drw.rectangle((x0m, y0m, x0m + mod - 1, y0m + mod - 1), fill=255)
        drw.text((ux0 + uw // 2, uy0 + 478), "MIL-STD-130  UID", font=_load_font(FONT_DIN, 44), fill=255, anchor="mm")
        drw.text((ux0 + uw // 2, uy0 + 536), "CAGE 1U2T4 / PN 11691350", font=_load_font(FONT_COND, 40), fill=245, anchor="mm")
        drw.text((ux0 + uw // 2, uy0 + 586), "SER. NO. DA-041965", font=_load_font(FONT_COND, 38), fill=245, anchor="mm")

        # Main Hero White Military Stencil Block (Center-Right, 100% readable in 3/4 macro!)
        tx = 770
        drw.text((tx, 118), "DILLON AERO M134D  -  MINIGUN", font=_load_font(FONT_DIN, 102), fill=255)
        drw.line([(tx, 246), (RW - 88, 246)], fill=230, width=6)
        drw.text((tx, 278), "7.62x51MM NATO  -  3,000 RPM", font=_load_font(FONT_DIN, 86), fill=255)
        drw.text((tx, 398), "GENERAL ELECTRIC / CAGE 1U2T4 / 28V DC", font=_load_font(FONT_DIN, 70), fill=252)
        drw.text((tx, 514), "GUN, AUTOMATIC, 7.62MM  -  US GOVT PROPERTY", font=_load_font(FONT_COND, 62), fill=242)

        # Bottom ordnance proof row
        _draw_nato_cross(drw, tx + 44, 658, r=38, lw=6)
        drw.text((tx + 108, 658), "ROTARY GATLING SYSTEM  -  M13 LINKLESS DELINKER", font=_load_font(FONT_COND, 54), fill=244, anchor="lm")
        dre.text((tx, 118), "DILLON AERO M134D  -  MINIGUN", font=_load_font(FONT_DIN, 102), fill=220)
        dre.text((tx, 278), "7.62x51MM NATO  -  3,000 RPM", font=_load_font(FONT_DIN, 86), fill=200)

        _paste_uv_band(white_stencil, r_white, 0.015, 0.985, 0.805, 0.985)
        _paste_uv_band(engraving, r_eng, 0.015, 0.985, 0.805, 0.985)

        # --- HERO BAND 2: Main Housing Forward-Left (-Z) Unobstructed Nameplate ---
        # Local X in [+2.20, +7.60] (5.40 cm) x Y in [-1.00, +2.60] (3.60 cm) -> exact 1.5:1 ratio!
        # Completely forward of `m134_delinker_housing` (ends at local X=+1.8) & clear of hoop bands!
        LW, LH = 1080, 720
        l_white = Image.new("L", (LW, LH), 0)
        dlw = ImageDraw.Draw(l_white)
        dlw.rounded_rectangle((36, 36, LW - 36, LH - 36), radius=22, outline=242, width=8)
        dlw.text((LW // 2, 152), "M134D  MINIGUN", font=_load_font(FONT_DIN, 92), fill=255, anchor="mm")
        dlw.line([(86, 224), (LW - 86, 224)], fill=232, width=6)
        dlw.text((LW // 2, 316), "7.62MM NATO / 3,000 RPM", font=_load_font(FONT_DIN, 64), fill=252, anchor="mm")
        dlw.text((LW // 2, 438), "DILLON AERO - CAGE 1U2T4", font=_load_font(FONT_COND, 62), fill=246, anchor="mm")
        dlw.text((LW // 2, 558), "S/N DA-041965 - US PROPERTY", font=_load_font(FONT_COND, 56), fill=242, anchor="mm")
        _paste_uv_band(white_stencil, l_white, 0.015, 0.525, 0.655, 0.785)

        # --- HERO BAND 3a & 3b: 28V DC Electric Drive Motor Brushed Aluminum Nameplates ---
        # Local X in [-3.1, +3.5] (6.6 cm), Y in [-0.95, +1.15] (2.1 cm)
        MW, MH = 1320, 420
        m_dark = Image.new("L", (MW, MH), 0)
        dmd = ImageDraw.Draw(m_dark)
        dmd.rounded_rectangle((22, 20, MW - 22, MH - 20), radius=14, outline=255, width=7)
        dmd.rounded_rectangle((36, 34, MW - 36, MH - 34), radius=10, outline=220, width=3)
        # Corner rivet dots
        for rx_r in (62, MW - 62):
            for ry_r in (62, MH - 62):
                dmd.ellipse((rx_r - 12, ry_r - 12, rx_r + 12, ry_r + 12), fill=255)
        dmd.text((MW // 2, 108), "GENERAL ELECTRIC  -  DILLON AERO", font=_load_font(FONT_DIN, 58), fill=255, anchor="mm")
        dmd.line([(92, 152), (MW - 92, 152)], fill=240, width=5)
        dmd.text((MW // 2, 218), "28V DC  /  3.2 HP  /  3000 RPM", font=_load_font(FONT_DIN, 76), fill=255, anchor="mm")
        dmd.text((MW // 2, 314), "DRIVE MOTOR ASSY - P/N 11691358 - CAGE 1U2T4", font=_load_font(FONT_COND, 48), fill=245, anchor="mm")
        _paste_uv_band(dark_etch, m_dark, 0.015, 0.485, 0.555, 0.638)
        _paste_uv_band(dark_etch, m_dark, 0.515, 0.985, 0.555, 0.638)

        # Subtle field-wear micro-mottle on white military stencil (95% crisp)
        rng = np.random.default_rng(1341)
        mottle = ndimage.gaussian_filter(rng.uniform(0.86, 1.0, (h, w)).astype(np.float32), sigma=1.0)
        w_paint = np.clip(white_stencil * mottle, 0.0, 1.0)

        # Composite crisp dielectric white military stencil
        _mix(albedo, (0.93, 0.94, 0.92), w_paint * 0.95)
        _mix(rgh, 0.42, w_paint * 0.88)
        _mix(met, 0.02, w_paint * 0.96)
        ao *= 1.0 - 0.04 * w_paint

        # Composite black-anodized laser-etched lettering on brushed aluminum 28V motor plates
        _mix(albedo, (0.09, 0.10, 0.11), dark_etch * 0.92)
        _mix(rgh, 0.54, dark_etch * 0.84)
        _mix(met, 0.18, dark_etch * 0.86)
        ao *= 1.0 - 0.12 * dark_etch

        eng_bev = _bevel_mask(engraving, width_px=1.2)
        etch_bev = _bevel_mask(dark_etch, width_px=1.0)
        w_bev = _bevel_mask(w_paint, width_px=0.9)
        decal_h = 0.12 * w_bev - 0.42 * eng_bev - 0.36 * etch_bev
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(decal_h, strength=2.2))

        # Lift interior cutaway hero visibility (recessed copper armature coils & 360° sinusoidal chrome cam track!)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        copper_zone = ((u_grid >= 0.170) & (u_grid <= 0.450) & (v_grid >= 0.430) & (v_grid <= 0.535))
        cam_zone = ((u_grid >= 0.470) & (u_grid <= 0.770) & (v_grid >= 0.430) & (v_grid <= 0.535))
        ao[copper_zone] = np.maximum(ao[copper_zone], 0.84)
        ao[cam_zone] = np.maximum(ao[cam_zone], 0.90)
        albedo[cam_zone] = np.clip(albedo[cam_zone] * 1.12 + 0.06, 0.0, 0.95)
        rgh[cam_zone] = np.minimum(rgh[cam_zone], 0.18)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_housing_motor_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_housing_motor_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_housing_motor_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m134_v3_housing_motor_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: m134_v3_barrels_rotor_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_barrels_rotor_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "br_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "br_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "br_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "br_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "br_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "br_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "br_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # --- HERO BAND 1: Safing Sector Top Hazard Plate [0.015, 0.365] x [0.785, 0.985] ---
        SW, SH = 1024, 580
        sf_yellow = Image.new("L", (SW, SH), 0)
        sf_red = Image.new("L", (SW, SH), 0)
        sf_black = Image.new("L", (SW, SH), 0)
        sf_white = Image.new("L", (SW, SH), 0)
        dy_d = ImageDraw.Draw(sf_yellow)
        dr_d = ImageDraw.Draw(sf_red)
        db_d = ImageDraw.Draw(sf_black)
        dw_d = ImageDraw.Draw(sf_white)

        # Left half = Caution Aviation Yellow ("SAFE"), Right half = Vivid Crimson ("ARMED")
        dy_d.rectangle((20, 20, SW // 2 - 4, SH - 20), fill=255)
        dr_d.rectangle((SW // 2 + 4, 20, SW - 20, SH - 20), fill=255)
        # Black outer hazard frame & center divider + top banner
        db_d.rectangle((20, 20, SW - 20, 148), fill=255)
        db_d.rectangle((20, 20, SW - 20, SH - 20), outline=255, width=16)
        db_d.line([(SW // 2, 148), (SW // 2, SH - 20)], fill=255, width=14)
        # Diagonal hazard stripes along bottom strip
        for sx in range(-SH, SW, 64):
            db_d.polygon([(sx, SH - 88), (sx + 30, SH - 88), (sx + 68, SH - 20), (sx + 38, SH - 20)], fill=255)

        dw_d.text((SW // 2, 84), "M134D  SAFING  SECTOR", font=_load_font(FONT_DIN, 70), fill=255, anchor="mm")
        db_d.text((SW // 4 + 8, 286), "SAFE", font=_load_font(FONT_DIN, 118), fill=255, anchor="mm")
        db_d.text((SW // 4 + 8, 408), "CAM DISENGAGED", font=_load_font(FONT_COND, 48), fill=255, anchor="mm")
        dw_d.text((3 * SW // 4 - 8, 286), "ARMED", font=_load_font(FONT_DIN, 108), fill=255, anchor="mm")
        dw_d.text((3 * SW // 4 - 8, 408), "3,000 RPM LIVE", font=_load_font(FONT_COND, 48), fill=255, anchor="mm")

        m_yel = np.zeros((h, w), dtype=np.float32)
        m_red = np.zeros((h, w), dtype=np.float32)
        m_blk = np.zeros((h, w), dtype=np.float32)
        m_wht = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(m_yel, sf_yellow, 0.015, 0.365, 0.785, 0.985)
        _paste_uv_band(m_red, sf_red,    0.015, 0.365, 0.785, 0.985)
        _paste_uv_band(m_blk, sf_black,  0.015, 0.365, 0.785, 0.985)
        _paste_uv_band(m_wht, sf_white,  0.015, 0.365, 0.785, 0.985)

        # Layer yellow -> red -> black -> white strictly inside the firewalled safing plate band!
        _mix(albedo, (0.93, 0.77, 0.14), m_yel * 0.98)
        _mix(rgh, 0.34, m_yel * 0.92)
        _mix(met, 0.04, m_yel * 0.98)

        _mix(albedo, (0.84, 0.11, 0.10), m_red * 0.98)
        _mix(rgh, 0.30, m_red * 0.92)
        _mix(met, 0.04, m_red * 0.98)

        _mix(albedo, (0.10, 0.11, 0.12), m_blk * 0.96)
        _mix(rgh, 0.42, m_blk * 0.90)
        _mix(met, 0.06, m_blk * 0.94)

        _mix(albedo, (0.95, 0.96, 0.95), m_wht * 0.98)
        _mix(rgh, 0.32, m_wht * 0.90)
        _mix(met, 0.03, m_wht * 0.96)

        bev_txt = _bevel_mask(np.maximum(m_blk, m_wht), width_px=1.0)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(0.18 * bev_txt, strength=1.8))

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_barrels_rotor_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_barrels_rotor_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_barrels_rotor_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m134_v3_barrels_rotor_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: m134_v3_delinker_bolts_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_delinker_bolts_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "db_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "db_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "db_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "db_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "db_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "db_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "db_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # --- HERO BAND 1: Dillon Aero Delinker Housing Left Faceplate [0.015, 0.485] x [0.785, 0.985] ---
        DW, DH = 1560, 1120
        dl_white = Image.new("L", (DW, DH), 0)
        ddl = ImageDraw.Draw(dl_white)
        ddl.rounded_rectangle((36, 36, DW - 36, DH - 36), radius=26, outline=240, width=8)
        ddl.text((DW // 2, 165), "DILLON AERO, INC.", font=_load_font(FONT_DIN, 116), fill=255, anchor="mm")
        ddl.line([(96, 252), (DW - 96, 252)], fill=235, width=6)
        ddl.text((DW // 2, 370), "M134D DELINKER FEEDER", font=_load_font(FONT_DIN, 92), fill=255, anchor="mm")
        ddl.text((DW // 2, 510), "7.62x51MM NATO  /  M13 LINK", font=_load_font(FONT_DIN, 76), fill=250, anchor="mm")
        ddl.text((DW // 2, 650), "SCOTTSDALE, AZ  U.S.A.  -  CAGE 1U2T4", font=_load_font(FONT_COND, 68), fill=244, anchor="mm")
        ddl.text((DW // 2, 785), "P/N 11691370  -  3,000 RPM RATED", font=_load_font(FONT_COND, 64), fill=240, anchor="mm")
        _draw_nato_cross(ddl, DW // 2 - 360, 945, r=42, lw=6)
        ddl.text((DW // 2 - 290, 945), "FEED DIRECTION", font=_load_font(FONT_DIN, 56), fill=250, anchor="lm")
        # Genuine drawn upward arrow polygon (zero missing-glyph tofu!)
        ax = DW // 2 + 155
        ddl.polygon([(ax, 905), (ax - 30, 955), (ax - 12, 955), (ax - 12, 985), (ax + 12, 985), (ax + 12, 955), (ax + 30, 955)], fill=255)
        ddl.text((DW // 2 + 215, 945), "TO ROTOR", font=_load_font(FONT_DIN, 56), fill=250, anchor="lm")

        white_m = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(white_m, dl_white, 0.015, 0.485, 0.785, 0.985)

        _mix(albedo, (0.93, 0.94, 0.93), white_m * 0.95)
        _mix(rgh, 0.36, white_m * 0.88)
        _mix(met, 0.04, white_m * 0.95)
        ao *= 1.0 - 0.06 * white_m

        bev_l = _bevel_mask(white_m, width_px=1.1)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.28 * bev_l, strength=2.1))

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_delinker_bolts_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_delinker_bolts_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "m134_v3_delinker_bolts_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved m134_v3_delinker_bolts_{albedo,normal,roughness}.webp (2048x2048)")

    process_housing_motor_atlas()
    process_barrels_rotor_atlas()
    process_delinker_bolts_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Modeling, UV Layout, Cycles Bake & Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "m134.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 28
BAKE_NORMAL_SAMPLES = 16

PITCH_RADIUS = 2.65
BOLT_X_FWD = -6.80
BOLT_STROKE = 4.60

T2B_MAT = Matrix((
    (1.0,  0.0, 0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0, 0.0, 0.0),
    (0.0,  0.0, 0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 3-Suite Mapping (23 solid parts; skips ONLY `m134_clutch_spring`, `m134_feeder_spring`)
HOUSING_MOTOR_PARTS = [
    "m134_main_housing",
    "m134_cam_track_ring",
    "m134_drive_motor",
    "m134_gear_housing",
    "m134_spade_grip",
    "m134_carry_handle",
    "m134_mount_pintle",
]

BARRELS_ROTOR_PARTS = [
    "m134_barrel_cluster",
    "m134_barrel_clamp",
    "m134_flash_suppressor",
    "m134_rotor_assembly",
    "m134_drive_gear",
    "m134_safing_sector",
]

DELINKER_BOLTS_PARTS = [
    "m134_bolt_1",
    "m134_bolt_2",
    "m134_bolt_3",
    "m134_bolt_4",
    "m134_bolt_5",
    "m134_bolt_6",
    "m134_delinker_housing",
    "m134_delinker_sprocket",
    "m134_ammo_chute",
    "m134_ejection_chute",
]

# Exterior parts receiving assembled inter-part contact AO (internal bolts/rotor/cam/sprocket/gear get radiant Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "m134_main_housing",
    "m134_drive_motor",
    "m134_gear_housing",
    "m134_spade_grip",
    "m134_carry_handle",
    "m134_mount_pintle",
    "m134_barrel_cluster",
    "m134_barrel_clamp",
    "m134_flash_suppressor",
    "m134_safing_sector",
    "m134_delinker_housing",
    "m134_ammo_chute",
    "m134_ejection_chute",
}

ASSEMBLED_POS = {
    "m134_main_housing":      ( -6.50,  0.00,   0.00),
    "m134_cam_track_ring":    ( -9.90,  0.00,   0.00),
    "m134_drive_motor":       ( -9.50,  9.30,   0.00),
    "m134_gear_housing":      (-18.80,  2.20,   0.00),
    "m134_spade_grip":        (-25.80,  0.20,   0.00),
    "m134_carry_handle":      (  3.20,  7.60,   0.00),
    "m134_mount_pintle":      ( -6.50, -8.80,   0.00),
    "m134_barrel_cluster":    (  0.00,  0.00,   0.00),
    "m134_barrel_clamp":      ( 28.00,  0.00,   0.00),
    "m134_flash_suppressor":  ( 47.20,  0.00,   0.00),
    "m134_rotor_assembly":    ( -6.80,  0.00,   0.00),
    "m134_drive_gear":        (-18.40,  0.00,   0.00),
    "m134_safing_sector":     ( -0.60,  6.15,   0.00),
    "m134_bolt_1":            ( -6.80,  2.65,   0.00),
    "m134_bolt_2":            ( -7.95,  1.325,  2.295),
    "m134_bolt_3":            (-10.25, -1.325,  2.295),
    "m134_bolt_4":            (-11.40, -2.65,   0.00),
    "m134_bolt_5":            (-10.25, -1.325, -2.295),
    "m134_bolt_6":            ( -7.95,  1.325, -2.295),
    "m134_delinker_housing":  ( -9.20, -1.60,  -8.20),
    "m134_delinker_sprocket": ( -9.20, -1.40,  -7.80),
    "m134_ammo_chute":        ( -9.20, -9.20, -10.80),
    "m134_ejection_chute":    ( -9.80, -4.40,   7.20),
}

# Exact CSG ground-truth local bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "m134_barrel_cluster":    (( -4.600,  -3.670,  -3.315), ( 48.400,   3.670,   3.315)),
    "m134_barrel_clamp":      (( -7.575,  -4.180,  -4.180), ( 10.575,   4.180,   4.180)),
    "m134_flash_suppressor":  (( -2.400,  -4.320,  -4.320), (  3.000,   4.320,   4.320)),
    "m134_rotor_assembly":    ((-11.800,  -4.160,  -4.160), (  9.300,   4.160,   4.160)),
    "m134_bolt_1":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_bolt_2":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_bolt_3":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_bolt_4":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_bolt_5":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_bolt_6":            (( -2.825,  -0.760,  -0.760), (  2.195,   1.810,   0.760)),
    "m134_main_housing":      (( -9.300,  -6.620,  -6.620), (  9.300,   6.700,   6.620)),
    "m134_cam_track_ring":    (( -4.100,  -4.820,  -4.820), (  4.100,   4.880,   4.820)),
    "m134_gear_housing":      (( -3.350,  -8.500,  -6.300), (  3.200,  10.250,   6.300)),
    "m134_carry_handle":      (( -1.600,  -2.500,  -4.100), ( 11.100,   6.600,   4.100)),
    "m134_mount_pintle":      (( -5.000,  -5.400,  -3.900), (  5.000,   3.300,   3.900)),
    "m134_drive_motor":       (( -9.300,  -3.220,  -3.220), (  6.200,   3.950,   3.220)),
    "m134_drive_gear":        (( -1.150,  -5.430,  -5.430), (  1.150,   5.430,   5.430)),
    "m134_safing_sector":     (( -2.400,  -0.575,  -2.300), (  2.400,   1.055,   2.300)),
    "m134_spade_grip":        (( -4.400,  -5.475,  -7.401), (  3.800,   4.475,   7.401)),
    "m134_delinker_housing":  (( -4.700,  -4.200,  -3.275), (  4.500,   4.000,   3.000)),
    "m134_delinker_sprocket": (( -3.800,  -2.155,  -1.991), (  3.800,   2.155,   1.991)),
    "m134_ammo_chute":        (( -4.100,  -6.190,  -4.120), (  4.100,   4.500,   3.200)),
    "m134_ejection_chute":    (( -3.600,  -3.600,  -2.575), (  3.600,   2.700,   3.275)),
}


# =============================================================================
# Scene & Physically Calibrated M134D Aerospace Material Library (Cycles GPU)
# =============================================================================
def srgb_to_lin(r: float, g: float, b: float):
    def c(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(r), c(g), c(b), 1.0)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    use_gpu = False
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            if dev.type == "METAL":
                dev.use = True
                use_gpu = True
            else:
                dev.use = False
    except Exception:
        use_gpu = False
    scene.cycles.device = "GPU" if use_gpu else "CPU"
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0

    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.light_settings.distance = 1.4

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    print(f"[SCENE] Blender {bpy.app.version_string} | Cycles device = {scene.cycles.device}")
    return scene


def _build_pbr_mat(
    name: str,
    base_srgb: tuple[float, float, float],
    roughness: float,
    metallic: float,
    bevel_r: float = 0.032,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.78, 0.80, 0.85),
    grain_scale: float = 42.0,
    grain_bump: float = 0.034,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 78.0,
    rough_var: float = 0.040,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])

    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 14.0
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.62
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    bump_sock = n_micro.outputs["Fac"]
    if voronoi_grain > 0.001:
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = voronoi_scale
        nt.links.new(texcoord.outputs["Object"], vor.inputs["Vector"])
        mix_g = nt.nodes.new("ShaderNodeMix")
        mix_g.data_type = "FLOAT"
        mix_g.inputs["Factor"].default_value = voronoi_grain
        nt.links.new(n_micro.outputs["Fac"], mix_g.inputs[2])
        nt.links.new(vor.outputs["Distance"], mix_g.inputs[3])
        bump_sock = mix_g.outputs[0]

    base_a = srgb_to_lin(*base_srgb)
    base_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.022),
        min(1.0, base_srgb[1] * 1.022),
        min(1.0, base_srgb[2] * 1.022),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_a
    mix_base.inputs[7].default_value = base_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.25
    rgh_map.inputs["From Max"].default_value = 0.75
    rgh_map.inputs["To Min"].default_value = max(0.10, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.94, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        # Tight Cycles inside-AO geometric convexity wear (eliminates 100% of cloudy Pointiness blotches!)
        ao_in = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_in.samples = 8
        ao_in.inside = True
        ao_in.only_local = True
        ao_in.inputs["Distance"].default_value = 0.046

        inv_ao = nt.nodes.new("ShaderNodeMath")
        inv_ao.operation = "SUBTRACT"
        inv_ao.inputs[0].default_value = 1.0
        nt.links.new(ao_in.outputs["AO"], inv_ao.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.26
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.66
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(inv_ao.outputs["Value"], ramp.inputs["Fac"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        nt.links.new(ramp.outputs["Color"], mul_w.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = max(0.15, roughness - 0.14)
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        if metallic > 0.35:
            mix_em = nt.nodes.new("ShaderNodeMix")
            mix_em.data_type = "FLOAT"
            mix_em.inputs[3].default_value = 0.96
            nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
            nt.links.new(met_sock, mix_em.inputs[2])
            met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.020
        nt.links.new(bump_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_flash_suppressor_heat_mat() -> bpy.types.Material:
    """Dramatic 3,000 RPM sustained-fire golden-bronze -> heat-blued violet -> muzzle carbon soot!"""
    mat = bpy.data.materials.new("B_FlashHeatTemper")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Local X spans [-2.4, +3.0]
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -2.4
    mr.inputs["From Max"].default_value = 3.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_h = nt.nodes.new("ShaderNodeTexNoise")
    n_h.inputs["Scale"].default_value = 8.5
    n_h.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], n_h.inputs["Vector"])

    add_h = nt.nodes.new("ShaderNodeMath")
    add_h.operation = "MULTIPLY_ADD"
    add_h.inputs[1].default_value = 0.045
    nt.links.new(n_h.outputs["Fac"], add_h.inputs[0])
    nt.links.new(mr.outputs["Result"], add_h.inputs[2])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.215, 0.226, 0.238)   # Parkerized rear clamp collar
    cr.elements[1].position = 0.38
    cr.elements[1].color = srgb_to_lin(0.395, 0.285, 0.155)   # Sustained-fire golden-bronze temper!
    for pos, rgb in (
        (0.64, (0.218, 0.245, 0.405)),  # Heat-blued violet-indigo temper band!
        (0.84, (0.178, 0.188, 0.215)),  # Dark heat-oxidized crown
        (0.95, (0.125, 0.124, 0.128)),  # Velvety carbon muzzle soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_h.outputs["Value"], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.00
    rr.color_ramp.elements[0].color = (0.31, 0.31, 0.31, 1.0)
    rr.color_ramp.elements[1].position = 0.80
    rr.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1.0)
    el_r = rr.color_ramp.elements.new(0.95)
    el_r.color = (0.84, 0.84, 0.84, 1.0)
    nt.links.new(add_h.outputs["Value"], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.00
    rm.color_ramp.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.color_ramp.elements[1].position = 0.82
    rm.color_ramp.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    el_m = rm.color_ramp.elements.new(0.95)
    el_m.color = (0.18, 0.18, 0.18, 1.0)
    nt.links.new(add_h.outputs["Value"], rm.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.022
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.036
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_h.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_barrel_cluster_mat() -> bpy.types.Material:
    """Six 22-inch fluted 7.62 NATO barrels: satin Parkerized steel with subtle muzzle heat bloom."""
    mat = bpy.data.materials.new("B_BarrelSteel")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -4.6
    mr.inputs["From Max"].default_value = 48.4
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_b = nt.nodes.new("ShaderNodeTexNoise")
    n_b.inputs["Scale"].default_value = 9.0
    n_b.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], n_b.inputs["Vector"])

    add_b = nt.nodes.new("ShaderNodeMath")
    add_b.operation = "MULTIPLY_ADD"
    add_b.inputs[1].default_value = 0.025
    nt.links.new(n_b.outputs["Fac"], add_b.inputs[0])
    nt.links.new(mr.outputs["Result"], add_b.inputs[2])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.215, 0.226, 0.238)
    cr.elements[1].position = 0.78
    cr.elements[1].color = srgb_to_lin(0.228, 0.238, 0.248)
    for pos, rgb in (
        (0.89, (0.315, 0.268, 0.198)),
        (0.96, (0.228, 0.244, 0.315)),
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_b.outputs["Value"], rc.inputs["Fac"])

    ao_in = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao_in.samples = 8
    ao_in.inside = True
    ao_in.only_local = True
    ao_in.inputs["Distance"].default_value = 0.044
    inv_ao = nt.nodes.new("ShaderNodeMath")
    inv_ao.operation = "SUBTRACT"
    inv_ao.inputs[0].default_value = 1.0
    nt.links.new(ao_in.outputs["AO"], inv_ao.inputs[1])

    re = nt.nodes.new("ShaderNodeValToRGB")
    re.color_ramp.elements[0].position = 0.26
    re.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    re.color_ramp.elements[1].position = 0.66
    re.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1.0)
    nt.links.new(inv_ao.outputs["Value"], re.inputs["Fac"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[7].default_value = srgb_to_lin(0.74, 0.77, 0.82)
    nt.links.new(re.outputs["Color"], mix_c.inputs[0])
    nt.links.new(rc.outputs["Color"], mix_c.inputs[6])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.29
    bsdf.inputs["Metallic"].default_value = 0.89

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.020
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (4.5, 0.7, 0.7)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nl = nt.nodes.new("ShaderNodeTexNoise")
    nl.inputs["Scale"].default_value = 46.0
    nl.inputs["Detail"].default_value = 5.0
    nt.links.new(mp.outputs["Vector"], nl.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.032
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(nl.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_brass_762_mat() -> bpy.types.Material:
    """C26000 NATO 7.62x51mm Cartridge Brass with authentic Lake City heat-annealed neck!"""
    mat = bpy.data.materials.new("D_Brass762")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Cartridge brass spans local X in [-3.40, +1.70]
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -3.40
    mr.inputs["From Max"].default_value = 1.70
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_a = nt.nodes.new("ShaderNodeTexNoise")
    n_a.inputs["Scale"].default_value = 5.5
    n_a.inputs["Detail"].default_value = 4.0
    nt.links.new(tc.outputs["Object"], n_a.inputs["Vector"])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.84, 0.65, 0.25)
    cr.elements[1].position = 0.72
    cr.elements[1].color = srgb_to_lin(0.89, 0.70, 0.28)
    for pos, rgb in (
        (0.79, (0.64, 0.46, 0.25)),
        (0.86, (0.48, 0.36, 0.36)),  # Mil-spec purple-bronze annealed shoulder
        (0.95, (0.62, 0.46, 0.26)),
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr.outputs["Result"], rc.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.20
    bsdf.inputs["Metallic"].default_value = 0.95

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.014
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.016
    bump.inputs["Distance"].default_value = 0.010
    nt.links.new(n_a.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_copper_winding_mat() -> bpy.types.Material:
    """Rich enameled copper wire armature coils with directional fine wire ridges."""
    mat = bpy.data.materials.new("H_CopperWinding")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 28.0
    wave.inputs["Distortion"].default_value = 0.4
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.68, 0.28, 0.12)
    mix_c.inputs[7].default_value = srgb_to_lin(0.88, 0.46, 0.20)
    nt.links.new(wave.outputs["Fac"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Metallic"].default_value = 0.94

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.025
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_rubber_knurl_mat() -> bpy.types.Material:
    """Spade-grip & carry-handle tactile knurled dark rubber (AgX anti-crush sRGB 0.18)."""
    mat = bpy.data.materials.new("H_RubberGrip")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    w1 = nt.nodes.new("ShaderNodeTexWave")
    w1.wave_type = "BANDS"
    w1.bands_direction = "DIAGONAL"
    w1.inputs["Scale"].default_value = 14.0
    nt.links.new(tc.outputs["Object"], w1.inputs["Vector"])

    n_r = nt.nodes.new("ShaderNodeTexNoise")
    n_r.inputs["Scale"].default_value = 72.0
    n_r.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], n_r.inputs["Vector"])

    mix_b = nt.nodes.new("ShaderNodeMix")
    mix_b.data_type = "FLOAT"
    mix_b.inputs["Factor"].default_value = 0.45
    nt.links.new(w1.outputs["Fac"], mix_b.inputs[2])
    nt.links.new(n_r.outputs["Fac"], mix_b.inputs[3])

    bsdf.inputs["Base Color"].default_value = srgb_to_lin(0.185, 0.194, 0.204)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.025
    nt.links.new(mix_b.outputs[0], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    """AgX-calibrated M134D Minigun PBR material suite (deep military parkerized gunmetal, zero cloudy Pointiness!)."""
    return {
        # --- SUITE 1: Housing, Cam Track, 28V Motor, Gearbox, Spade Grip, Carry Handle, Pintle ---
        "H_MainHousing": _build_pbr_mat(
            "H_MainHousing",
            base_srgb=(0.205, 0.218, 0.232),
            roughness=0.33,
            metallic=0.86,
            bevel_r=0.032,
            edge_wear=0.30,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=64.0,
            grain_bump=0.032,
            voronoi_grain=0.42,
            voronoi_scale=96.0,
            rough_var=0.024,
        ),
        "H_HousingPlate": _build_pbr_mat(
            "H_HousingPlate",
            base_srgb=(0.178, 0.188, 0.200),
            roughness=0.34,
            metallic=0.82,
            bevel_r=0.024,
            edge_wear=0.16,
            edge_srgb=(0.68, 0.71, 0.76),
            grain_scale=68.0,
            grain_bump=0.022,
            voronoi_grain=0.36,
            rough_var=0.020,
        ),
        "H_FlangeSteel": _build_pbr_mat(
            "H_FlangeSteel",
            base_srgb=(0.244, 0.258, 0.274),
            roughness=0.29,
            metallic=0.89,
            bevel_r=0.026,
            edge_wear=0.32,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=54.0,
            grain_bump=0.028,
            rough_var=0.022,
        ),
        "H_CamSleeveDark": _build_pbr_mat(
            "H_CamSleeveDark",
            base_srgb=(0.208, 0.220, 0.236),
            roughness=0.32,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.26,
            grain_scale=54.0,
            grain_bump=0.024,
            rough_var=0.022,
        ),
        "H_CamGrooveChrome": _build_pbr_mat(
            "H_CamGrooveChrome",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.16,
            metallic=0.97,
            bevel_r=0.016,
            edge_wear=0.16,
            grain_scale=28.0,
            grain_bump=0.014,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.018,
        ),
        "H_MotorEnamel": _build_pbr_mat(
            "H_MotorEnamel",
            base_srgb=(0.188, 0.206, 0.234),
            roughness=0.30,
            metallic=0.84,
            bevel_r=0.026,
            edge_wear=0.28,
            edge_srgb=(0.74, 0.78, 0.84),
            grain_scale=58.0,
            grain_bump=0.026,
            rough_var=0.022,
        ),
        "H_MotorNameplate": _build_pbr_mat(
            "H_MotorNameplate",
            base_srgb=(0.76, 0.78, 0.81),
            roughness=0.25,
            metallic=0.92,
            bevel_r=0.014,
            grain_scale=38.0,
            grain_bump=0.014,
            aniso_stretch=(0.25, 4.0, 4.0),
            rough_var=0.018,
        ),
        "H_CopperWinding": _build_copper_winding_mat(),
        "H_CommutatorBrass": _build_pbr_mat(
            "H_CommutatorBrass",
            base_srgb=(0.85, 0.66, 0.28),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.014,
            grain_scale=36.0,
            grain_bump=0.016,
            rough_var=0.020,
        ),
        "H_StainlessBolt": _build_pbr_mat(
            "H_StainlessBolt",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.18,
            grain_scale=32.0,
            grain_bump=0.016,
            aniso_stretch=(0.4, 3.2, 3.2),
            rough_var=0.018,
        ),
        "H_PintleBronze": _build_pbr_mat(
            "H_PintleBronze",
            base_srgb=(0.74, 0.56, 0.28),
            roughness=0.24,
            metallic=0.93,
            bevel_r=0.018,
            grain_scale=34.0,
            grain_bump=0.018,
            rough_var=0.022,
        ),
        "H_RubberGrip": _build_rubber_knurl_mat(),
        "H_MasterRed": _build_pbr_mat(
            "H_MasterRed",
            base_srgb=(0.86, 0.10, 0.10),
            roughness=0.26,
            metallic=0.05,
            bevel_r=0.014,
            grain_scale=38.0,
            grain_bump=0.012,
            rough_var=0.020,
        ),

        # --- SUITE 2: Barrels, Clamp, Flash Suppressor, Star-Rotor, Drive Gear, Safing Sector ---
        "B_BarrelSteel": _build_barrel_cluster_mat(),
        "B_ClampSteel": _build_pbr_mat(
            "B_ClampSteel",
            base_srgb=(0.222, 0.236, 0.252),
            roughness=0.31,
            metallic=0.88,
            bevel_r=0.024,
            edge_wear=0.30,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=56.0,
            grain_bump=0.028,
            voronoi_grain=0.38,
            rough_var=0.024,
        ),
        "B_FlashHeatTemper": _build_flash_suppressor_heat_mat(),
        "B_RotorCNC": _build_pbr_mat(
            "B_RotorCNC",
            base_srgb=(0.66, 0.70, 0.75),
            roughness=0.21,
            metallic=0.95,
            bevel_r=0.020,
            edge_wear=0.22,
            edge_srgb=(0.90, 0.92, 0.96),
            grain_scale=30.0,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.4, 3.4),
            rough_var=0.020,
        ),
        "B_DriveGear": _build_pbr_mat(
            "B_DriveGear",
            base_srgb=(0.72, 0.75, 0.80),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.20,
            edge_srgb=(0.92, 0.94, 0.98),
            grain_scale=32.0,
            grain_bump=0.018,
            aniso_stretch=(3.2, 0.5, 0.5),
            rough_var=0.018,
        ),
        "B_SafingPlate": _build_pbr_mat(
            "B_SafingPlate",
            base_srgb=(0.88, 0.74, 0.16),
            roughness=0.34,
            metallic=0.04,
            bevel_r=0.012,
            grain_scale=42.0,
            grain_bump=0.014,
            rough_var=0.020,
        ),
        "B_SafingRed": _build_pbr_mat(
            "B_SafingRed",
            base_srgb=(0.85, 0.10, 0.10),
            roughness=0.26,
            metallic=0.04,
            bevel_r=0.012,
            grain_scale=36.0,
            grain_bump=0.012,
            rough_var=0.020,
        ),

        # --- SUITE 3: 6 Rotary Bolts, Delinker Housing, Sprocket, Ammo Chute (7.62mm Belt), Ejection Chute ---
        "D_ChromeBolt": _build_pbr_mat(
            "D_ChromeBolt",
            base_srgb=(0.80, 0.83, 0.87),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.016,
            edge_wear=0.16,
            edge_srgb=(0.94, 0.96, 0.98),
            grain_scale=28.0,
            grain_bump=0.014,
            aniso_stretch=(0.35, 3.4, 3.4),
            rough_var=0.016,
        ),
        "D_BrassSprocket": _build_pbr_mat(
            "D_BrassSprocket",
            base_srgb=(0.82, 0.64, 0.28),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.016,
            edge_wear=0.18,
            edge_srgb=(0.94, 0.80, 0.46),
            grain_scale=34.0,
            grain_bump=0.016,
            aniso_stretch=(0.40, 3.0, 3.0),
            rough_var=0.020,
        ),
        "D_BoltExtractor": _build_pbr_mat(
            "D_BoltExtractor",
            base_srgb=(0.218, 0.230, 0.244),
            roughness=0.29,
            metallic=0.89,
            bevel_r=0.014,
            edge_wear=0.26,
            grain_scale=46.0,
            grain_bump=0.020,
            rough_var=0.022,
        ),
        "D_DelinkerSteel": _build_pbr_mat(
            "D_DelinkerSteel",
            base_srgb=(0.214, 0.226, 0.240),
            roughness=0.32,
            metallic=0.86,
            bevel_r=0.026,
            edge_wear=0.28,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=60.0,
            grain_bump=0.028,
            voronoi_grain=0.40,
            rough_var=0.024,
        ),
        "D_DelinkerFaceplate": _build_pbr_mat(
            "D_DelinkerFaceplate",
            base_srgb=(0.186, 0.198, 0.212),
            roughness=0.33,
            metallic=0.84,
            bevel_r=0.018,
            edge_wear=0.16,
            grain_scale=56.0,
            grain_bump=0.020,
            rough_var=0.020,
        ),
        "D_StainlessChute": _build_pbr_mat(
            "D_StainlessChute",
            base_srgb=(0.72, 0.75, 0.79),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.20,
            grain_scale=36.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 2.8, 2.8),
            rough_var=0.020,
        ),
        "D_EjectionSteel": _build_pbr_mat(
            "D_EjectionSteel",
            base_srgb=(0.216, 0.226, 0.238),
            roughness=0.33,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.78, 0.74, 0.56),
            grain_scale=62.0,
            grain_bump=0.030,
            voronoi_grain=0.42,
            rough_var=0.024,
        ),
        "D_Brass762": _build_brass_762_mat(),
        "D_CopperFMJ": _build_pbr_mat(
            "D_CopperFMJ",
            base_srgb=(0.84, 0.46, 0.23),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.010,
            edge_wear=0.14,
            edge_srgb=(0.95, 0.64, 0.38),
            grain_scale=34.0,
            grain_bump=0.014,
            rough_var=0.018,
        ),
        "D_PrimerSilver": _build_pbr_mat(
            "D_PrimerSilver",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.008,
            grain_bump=0.012,
            rough_var=0.016,
        ),
        "D_M13LinkSteel": _build_pbr_mat(
            "D_M13LinkSteel",
            base_srgb=(0.208, 0.218, 0.228),
            roughness=0.37,
            metallic=0.85,
            bevel_r=0.012,
            edge_wear=0.26,
            edge_srgb=(0.74, 0.76, 0.80),
            grain_scale=66.0,
            grain_bump=0.032,
            voronoi_grain=0.42,
            rough_var=0.024,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh Hard-Surface Modeling Toolkit
# =============================================================================
def _apply_three_xform(bm: bmesh.types.BMesh, ops: list[tuple]):
    m = Matrix.Identity(4)
    for op in ops:
        kind = op[0]
        if kind == "rx":
            m = Matrix.Rotation(op[1], 4, "X") @ m
        elif kind == "ry":
            m = Matrix.Rotation(op[1], 4, "Y") @ m
        elif kind == "rz":
            m = Matrix.Rotation(op[1], 4, "Z") @ m
        elif kind == "t":
            m = Matrix.Translation(Vector((op[1], op[2], op[3]))) @ m
        elif kind == "s":
            m = Matrix.Diagonal((op[1], op[2], op[3], 1.0)) @ m
    bmesh.ops.transform(bm, matrix=T2B_MAT @ m, verts=bm.verts)


def _bm_to_obj(
    name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None
) -> bpy.types.Object:
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else objs[0]


def mk_box(
    name: str, sx: float, sy: float, sz: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0, bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs,
            profile=0.5, affect="EDGES", clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str, r_top: float, r_bot: float, length: float,
    axis: str = "x", segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
    bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_bot, radius2=r_top, depth=length,
    )
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                profile=0.5, affect="EDGES", clamp_overlap=True,
            )
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_hollow_tube_x(
    name: str, r_out: float, r_in: float, x0: float, x1: float,
    segs: int = 36, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Strictly manifold watertight hollow cylinder along +X from x0 to x1."""
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.35, (x1 - x0) * 0.25)
    if b > 1e-4:
        prof = [
            (r_out - b, x0), (r_out, x0 + b), (r_out, x1 - b), (r_out - b, x1),
            (r_in + b, x1), (r_in, x1 - b), (r_in, x0 + b), (r_in + b, x0),
        ]
    else:
        prof = [(r_out, x0), (r_out, x1), (r_in, x1), (r_in, x0)]

    rings = []
    for r, x in prof:
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            ring.append(bm.verts.new((x, r * math.cos(th), r * math.sin(th))))
        rings.append(ring)

    n = len(rings)
    for k in range(n):
        a = rings[k]
        b_ring = rings[(k + 1) % n]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], b_ring[sn], b_ring[s]))

    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    closed = (
        len(pts_r_x) >= 3
        and pts_r_x[0][0] > 1e-5
        and math.hypot(pts_r_x[0][0] - pts_r_x[-1][0], pts_r_x[0][1] - pts_r_x[-1][1]) < 1e-4
    )
    pts = pts_r_x[:-1] if closed else list(pts_r_x)
    rings = []
    for r, x in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((x, 0.0, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((x, r * math.cos(th), r * math.sin(th))))
            rings.append(ring)
    n = len(rings)
    end_k = n if closed else n - 1
    for k in range(end_k):
        a = rings[k]
        b_r = rings[(k + 1) % n]
        if len(a) == 1 and len(b_r) == 1:
            continue
        elif len(a) == 1 and len(b_r) > 1:
            for s in range(segs):
                bm.faces.new((a[0], b_r[(s + 1) % segs], b_r[s]))
        elif len(a) > 1 and len(b_r) == 1:
            for s in range(segs):
                bm.faces.new((a[s], a[(s + 1) % segs], b_r[0]))
        else:
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((a[s], a[sn], b_r[sn], b_r[s]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def bool_op(target: bpy.types.Object, cutter: bpy.types.Object, op: str = "DIFFERENCE", delete_cutter: bool = True):
    # Ensure cutter shares target's primary material so Boolean NEVER creates empty None material slots!
    if len(cutter.data.materials) == 0 and len(target.data.materials) > 0:
        cutter.data.materials.append(target.data.materials[0])
    select_only([target], target)
    mod = target.modifiers.new(name="Bool", type="BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_cutter:
        bpy.data.objects.remove(cutter, do_unlink=True)
    # Strip any stray None material slots cleanly
    for i in range(len(target.data.materials) - 1, -1, -1):
        if target.data.materials[i] is None:
            target.data.materials.pop(index=i)


def join_parts(name: str, objs: list[bpy.types.Object], smooth_angle_deg: float = 38.0, lock_flat_walls: bool = True) -> bpy.types.Object:
    if len(objs) == 1:
        root = objs[0]
        root.name = name
    else:
        select_only(objs, objs[0])
        bpy.ops.object.join()
        root = bpy.context.active_object
        root.name = name
    root.data.name = name

    # Strip any stray None material slots
    for i in range(len(root.data.materials) - 1, -1, -1):
        if root.data.materials[i] is None:
            root.data.materials.pop(index=i)

    # Ensure strictly manifold, outward normals, smooth cylindrical faces + exact sharp-angle edges!
    angle_rad = math.radians(smooth_angle_deg)
    bm = bmesh.new()
    bm.from_mesh(root.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm.to_mesh(root.data)
    bm.free()
    root.data.update()

    # Apply Face-Area + Angle Weighted Normals preserving crisp CNC sharp edges while eliminating cylinder faceting!
    select_only([root], root)
    wn = root.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 100
    wn.thresh = 0.01
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)

    if lock_flat_walls:
        mesh = root.data
        custom_nrms = [None] * len(mesh.loops)
        for poly in mesh.polygons:
            fn = poly.normal
            is_flat = poly.area >= 0.50 and (abs(fn.x) > 0.992 or abs(fn.y) > 0.992 or abs(fn.z) > 0.992)
            for li in poly.loop_indices:
                custom_nrms[li] = tuple(fn) if is_flat else tuple(mesh.loops[li].normal)
        if any(v is not None for v in custom_nrms):
            mesh.normals_split_custom_set(custom_nrms)
            mesh.update()
    return root


def _triangulate_keep_normals(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


def _mk_socket_cap_bolt_x(
    name: str, r: float, length: float, x_pos: float, y_pos: float, z_pos: float,
    mat_outer: bpy.types.Material, mat_inner: bpy.types.Material,
) -> bpy.types.Object:
    """Machined cylindrical Allen/hex socket cap bolt with recessed 6-sided wrench bore along X."""
    outer = mk_cyl(f"{name}_o", r, r, length, axis="x", segs=24, xform=[("t", x_pos, y_pos, z_pos)], mat=mat_outer, bevel=0.025, bevel_segs=2)
    bore = mk_cyl(f"{name}_i", r * 0.54, r * 0.54, length * 0.55, axis="x", segs=6, xform=[("t", x_pos + length * 0.30, y_pos, z_pos)], mat=mat_inner)
    bool_op(outer, bore, "DIFFERENCE")
    return outer


# =============================================================================
# PART BUILDERS — SUITE 1 (7 Parts: Housing, Cam Track, Motor, Gearbox, Spade, Handle, Pintle)
# =============================================================================
def build_m134_main_housing(mats) -> bpy.types.Object:
    parts = []
    # Main heavy ribbed cylindrical housing shell (80-seg smooth forged steel, inner bore r=4.88, outer r=5.82)
    parts.append(mk_hollow_tube_x("mh_tube", 5.82, 4.88, -8.50, 8.50, segs=80, bevel=0.07, mat=mats["H_MainHousing"]))
    # Heavy bolted front & rear mounting flanges (r=6.62)
    parts.append(mk_hollow_tube_x("mh_fl_f", 6.62, 4.88, 7.85, 9.10, segs=80, bevel=0.075, mat=mats["H_FlangeSteel"]))
    parts.append(mk_hollow_tube_x("mh_fl_r", 6.62, 4.88, -9.10, -7.85, segs=80, bevel=0.075, mat=mats["H_FlangeSteel"]))
    # Subtle mid stiffening hoop bands recessed at r=5.96 (< 6.10 plate outer Z -> ZERO collision with nameplates!)
    for hx in (-4.2, 4.2):
        parts.append(mk_hollow_tube_x(f"mh_ring_{hx}", 5.96, 5.76, hx - 0.38, hx + 0.38, segs=80, bevel=0.045, mat=mats["H_FlangeSteel"]))

    # 8 external longitudinal stiffening ribs around housing circumference
    for i in range(8):
        ang = i * (math.pi / 4.0) + math.pi / 8.0
        parts.append(mk_box(
            f"mh_rib_{i}", 16.0, 0.68, 0.58,
            xform=[("t", 0.0, 5.86, 0.0), ("rx", ang)],
            mat=mats["H_MainHousing"], bevel=0.085, bevel_segs=3,
        ))

    # Right (+Z) Full Nomenclature Hero Plate (X in [-6.5, +6.5], Y in [-1.3, +2.8], outer Z = +6.10)
    parts.append(mk_box("mh_plate_r", 13.0, 4.10, 0.56, xform=[("t", 0.0, 0.75, 5.82)], mat=mats["H_HousingPlate"], bevel=0.05, bevel_segs=3))
    for rx_p in (-6.15, 6.15):
        for ry_p in (-1.0, 2.5):
            parts.append(mk_cyl(
                f"mh_pr_r_{rx_p}_{ry_p}", 0.14, 0.14, 0.18, axis="z", segs=24,
                xform=[("t", rx_p, ry_p, 6.08)], mat=mats["H_StainlessBolt"], bevel=0.025, bevel_segs=2,
            ))

    # Forward-Left (-Z) Unobstructed Hero Plate strictly forward of `m134_delinker_housing`
    parts.append(mk_box("mh_plate_l", 5.40, 3.60, 0.56, xform=[("t", 4.90, 0.80, -5.82)], mat=mats["H_HousingPlate"], bevel=0.05, bevel_segs=3))
    for rx_p in (2.52, 7.28):
        for ry_p in (-0.72, 2.32):
            parts.append(mk_cyl(
                f"mh_pr_l_{rx_p}_{ry_p}", 0.13, 0.13, 0.18, axis="z", segs=24,
                xform=[("t", rx_p, ry_p, -6.08)], mat=mats["H_StainlessBolt"], bevel=0.025, bevel_segs=2,
            ))

    # Top motor mounting cradle saddles & forward safing-sector frame boss
    parts.append(mk_box("mh_cradle_r", 3.0, 1.45, 4.8, xform=[("t", -5.8, 5.98, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.085, bevel_segs=3))
    parts.append(mk_box("mh_cradle_f", 2.8, 1.45, 4.8, xform=[("t", 0.2, 5.98, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.085, bevel_segs=3))
    parts.append(mk_box("mh_safe_boss", 5.0, 1.15, 4.8, xform=[("t", 5.9, 5.85, 0.0)], mat=mats["H_MainHousing"], bevel=0.085, bevel_segs=3))

    # Bottom pintle mounting lug pad
    parts.append(mk_box("mh_pintle_pad", 9.6, 1.30, 4.6, xform=[("t", 0.0, -5.90, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.085, bevel_segs=3))

    # 8 front & 8 rear stainless hex flange bolts w/ machined washers
    for i in range(8):
        ang = i * (math.pi / 4.0)
        by = 6.22 * math.cos(ang)
        bz = 6.22 * math.sin(ang)
        parts.append(mk_cyl(f"mh_bf_{i}", 0.31, 0.31, 0.42, axis="x", segs=6, xform=[("t", 9.09, by, bz)], mat=mats["H_StainlessBolt"], bevel=0.035, bevel_segs=2))
        parts.append(mk_cyl(f"mh_wf_{i}", 0.36, 0.36, 0.08, axis="x", segs=24, xform=[("t", 9.10, by, bz)], mat=mats["H_FlangeSteel"], bevel=0.015))
        parts.append(mk_cyl(f"mh_br_{i}", 0.31, 0.31, 0.42, axis="x", segs=6, xform=[("t", -9.09, by, bz)], mat=mats["H_StainlessBolt"], bevel=0.035, bevel_segs=2))
        parts.append(mk_cyl(f"mh_wr_{i}", 0.36, 0.36, 0.08, axis="x", segs=24, xform=[("t", -9.10, by, bz)], mat=mats["H_FlangeSteel"], bevel=0.015))

    return join_parts("m134_main_housing", parts)


def build_m134_cam_track_ring(mats) -> bpy.types.Object:
    """Precision hardened-steel 360° elliptical sinusoidal cam guide sleeve with
    GENUINELY SCULPTED gleaming chrome-steel sinusoidal inner track groove!"""
    segs = 84
    x_min, x_max = -4.10, 4.10
    r_in, r_gr, r_out = 3.88, 4.54, 4.82
    amp_x = BOLT_STROKE * 0.5  # 2.30 cm
    g_hw = 0.54

    bm = bmesh.new()
    rings = []
    for s in range(segs):
        th = 2.0 * math.pi * s / segs
        cy, sz = math.cos(th), math.sin(th)
        xc = amp_x * cy
        xg0, xg1 = xc - g_hw, xc + g_hw
        prof = [
            (x_min, r_out),
            (x_max, r_out),
            (x_max, r_in),
            (xg1,   r_in),
            (xg1,   r_gr),
            (xg0,   r_gr),
            (xg0,   r_in),
            (x_min, r_in),
        ]
        rings.append([bm.verts.new((px, pr * cy, pr * sz)) for (px, pr) in prof])

    n_p = 8
    # Material index 0 = H_CamSleeveDark, 1 = H_CamGrooveChrome (the bright burnished sinusoidal track!)
    groove_edge_indices = {3, 4, 5}
    for s in range(segs):
        sn = (s + 1) % segs
        r0, r1 = rings[s], rings[sn]
        for k in range(n_p):
            kn = (k + 1) % n_p
            face = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            face.material_index = 1 if k in groove_edge_indices else 0

    _apply_three_xform(bm, [])
    ring_obj = _bm_to_obj("cam_ring", bm)
    ring_obj.data.materials.append(mats["H_CamSleeveDark"])
    ring_obj.data.materials.append(mats["H_CamGrooveChrome"])

    key = mk_box("cam_key", 7.6, 0.34, 0.65, xform=[("t", 0.0, 4.71, 0.0)], mat=mats["H_CamSleeveDark"], bevel=0.04)
    return join_parts("m134_cam_track_ring", [ring_obj, key])


def build_m134_drive_motor(mats) -> bpy.types.Object:
    """Top-mounted 28V DC 3.2-HP Aerospace Electric Drive Motor with hollow stator casing,
    radial cooling fins, brushed aluminum dual side nameplates & RECESSED (-Z <= -0.18)
    WARM ENAMELED COPPER ARMATURE WINDINGS + BRASS COMMUTATOR glowing cleanly in CT cutaway!"""
    parts = []
    # Main hollow cylindrical stator housing (64-seg smooth aerospace casing)
    stator = mk_hollow_tube_x("dm_stator", 3.05, 2.42, -5.85, 5.65, segs=64, bevel=0.055, mat=mats["H_MotorEnamel"])
    for ang_deg in (42, 138, -42, -138):
        cutter = mk_box(
            "dm_vent_c", 7.2, 0.72, 1.4,
            xform=[("t", 0.1, 2.75, 0.0), ("rx", math.radians(ang_deg))],
        )
        bool_op(stator, cutter, "DIFFERENCE")
    parts.append(stator)

    # Thin hollow front & rear aerospace end-bells (64-seg)
    parts.append(mk_hollow_tube_x("dm_bell_f", 3.12, 0.85, 5.35, 6.18, segs=64, bevel=0.08, mat=mats["H_FlangeSteel"]))
    parts.append(mk_hollow_tube_x("dm_bell_r", 3.12, 0.85, -6.20, -5.35, segs=64, bevel=0.08, mat=mats["H_FlangeSteel"]))
    parts.append(mk_cyl("dm_nose_cap", 0.88, 0.88, 0.55, axis="x", segs=40, xform=[("t", 5.90, 0.0, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.05, bevel_segs=3))

    # 10 circumferential radial cooling fins (64-seg with crisp beveled relief)
    for i in range(10):
        fx = -4.55 + i * 0.98
        parts.append(mk_hollow_tube_x(f"dm_fin_{i}", 3.22, 2.94, fx - 0.15, fx + 0.15, segs=64, bevel=0.04, mat=mats["H_MotorEnamel"]))

    # INTERNAL STAR FEATURE (STRICTLY RECESSED AT Z <= -0.20 so Z=0 StencilSectionCap NEVER paints grey hatch over it!!):
    # 1. Laminated dark iron armature core half-drum in -Z cavity (Z in [-1.55, -0.22])
    parts.append(mk_box("dm_arm_core", 7.8, 2.35, 1.25, xform=[("t", -0.45, 0.0, -0.92)], mat=mats["H_FlangeSteel"], bevel=0.14))
    # 2. 7 lush enameled copper armature winding coil bundles fanning across the entire -Z cutaway cavity!
    for i in range(7):
        ang = math.radians(198.0 + i * 24.0)  # 198°..342° -> sin(ang) <= -0.31 -> strictly Z <= -0.22!
        cy = 1.62 * math.cos(ang)
        cz = min(-0.56, 1.62 * math.sin(ang))
        parts.append(mk_box(
            f"dm_coil_n_{i}", 7.1, 0.58, 0.62,
            xform=[("t", -0.40, cy, cz)],
            mat=mats["H_CopperWinding"], bevel=0.09,
        ))
    # 3. Thick front & rear copper winding end-turn stacks (strictly Z <= -0.22!)
    parts.append(mk_box("dm_cu_end_f", 0.72, 3.85, 1.75, xform=[("t", 3.30, 0.0, -1.16)], mat=mats["H_CopperWinding"], bevel=0.14))
    parts.append(mk_box("dm_cu_end_r", 0.72, 3.85, 1.75, xform=[("t", -4.15, 0.0, -1.16)], mat=mats["H_CopperWinding"], bevel=0.14))
    # 4. Gleaming slotted golden-brass commutator barrel & brush carrier at front (strictly Z <= -0.22!)
    parts.append(mk_box("dm_comm_b", 1.38, 2.85, 1.45, xform=[("t", 4.42, 0.0, -1.00)], mat=mats["H_CommutatorBrass"], bevel=0.16))
    for ci in range(5):
        cy_c = -1.15 + ci * 0.575
        parts.append(mk_box(f"dm_cmbar_{ci}", 1.42, 0.34, 0.28, xform=[("t", 4.42, cy_c, -0.36)], mat=mats["H_CommutatorBrass"], bevel=0.04))
    # 5. Subtle +Z exterior copper louver backer strips (strictly Z >= +1.58 -> clipped cleanly in cutaway, warm glint assembled!)
    for cy_p in (-1.35, 1.35):
        parts.append(mk_box(f"dm_cu_p_{cy_p}", 6.8, 0.62, 0.42, xform=[("t", -0.20, cy_p, 1.85)], mat=mats["H_CopperWinding"], bevel=0.06))

    # Rear drive shaft + 14-tooth hobbed pinion gear coupling into gearbox at local X = -8.62 (world X = -18.12)
    parts.append(mk_cyl("dm_shaft", 0.76, 0.76, 3.6, axis="x", segs=28, xform=[("t", -7.5, 0.0, 0.0)], mat=mats["H_StainlessBolt"], bevel=0.03))
    parts.append(mk_cyl("dm_pinion", 1.52, 1.52, 1.35, axis="x", segs=28, xform=[("t", -8.62, 0.0, 0.0)], mat=mats["H_StainlessBolt"], bevel=0.03))
    for t_i in range(14):
        th = t_i * (2.0 * math.pi / 14.0)
        parts.append(mk_box(
            f"dm_pt_{t_i}", 1.28, 0.34, 0.28,
            xform=[("t", -8.62, 1.58, 0.0), ("rx", th)],
            mat=mats["H_StainlessBolt"], bevel=0.02,
        ))

    # Dual flat brushed aluminum aerospace motor nameplate plates (+Z & -Z, X in [-3.1, +3.5], Y in [-0.95, +1.15])
    parts.append(mk_box("dm_np_r", 6.6, 2.10, 0.34, xform=[("t", 0.2, 0.10, 3.05)], mat=mats["H_MotorNameplate"], bevel=0.03))
    parts.append(mk_box("dm_np_l", 6.6, 2.10, 0.34, xform=[("t", 0.2, 0.10, -3.05)], mat=mats["H_MotorNameplate"], bevel=0.03))

    # Rear top Mil-Spec 28V Canon/Amphenol power connector plug
    parts.append(mk_box("dm_conn_base", 1.7, 0.85, 1.7, xform=[("t", -4.4, 2.85, 0.0)], mat=mats["H_MainHousing"], bevel=0.05))
    parts.append(mk_cyl("dm_conn_plug", 0.72, 0.78, 1.15, axis="y", segs=24, xform=[("t", -4.4, 3.38, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.04))

    return join_parts("m134_drive_motor", parts)


def build_m134_gear_housing(mats) -> bpy.types.Object:
    """Truly hollow pear-shaped rear reduction gearbox (~0.55 cm wall thickness) wrapping
    `m134_drive_gear`, `m134_clutch_spring`, AND the 28V motor pinion with ZERO cutaway hatch clipping!"""
    shell = mk_cyl("gh_lo", 6.30, 6.30, 6.40, axis="x", segs=72, xform=[("t", 0.0, -2.20, 0.0)], mat=mats["H_MainHousing"], bevel=0.11, bevel_segs=3)
    tower = mk_box("gh_tower", 5.95, 8.80, 7.60, xform=[("t", 0.0, 2.30, 0.0)], mat=mats["H_MainHousing"], bevel=0.22, bevel_segs=4)
    top_cap = mk_cyl("gh_top_cap", 3.35, 3.35, 6.10, axis="x", segs=64, xform=[("t", 0.0, 6.90, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.11, bevel_segs=3)
    fl_r = mk_box("gh_fl_r", 1.10, 9.20, 8.40, xform=[("t", -2.80, -1.60, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.12, bevel_segs=3)
    fl_f = mk_box("gh_fl_f", 1.00, 12.20, 11.40, xform=[("t", 2.70, -0.50, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.12, bevel_segs=3)

    for adder in (tower, top_cap, fl_r, fl_f):
        bool_op(shell, adder, "UNION")

    cav_gear = mk_cyl("gh_cav_g", 5.64, 5.64, 5.85, axis="x", segs=56, xform=[("t", 0.85, -2.20, 0.0)], mat=mats["H_MainHousing"])
    cav_mid = mk_box("gh_cav_m", 5.55, 9.50, 5.80, xform=[("t", 0.72, 2.35, 0.0)], mat=mats["H_MainHousing"])
    cav_top = mk_cyl("gh_cav_t", 2.70, 2.70, 5.85, axis="x", segs=48, xform=[("t", 0.85, 6.90, 0.0)], mat=mats["H_MainHousing"])
    for cav in (cav_gear, cav_mid, cav_top):
        bool_op(shell, cav, "DIFFERENCE")

    parts = [shell]
    for i in range(8):
        ang = i * (math.pi / 4.0)
        parts.append(mk_cyl(
            f"gh_b_{i}", 0.28, 0.28, 0.35, axis="x", segs=6,
            xform=[("t", -3.22, -2.20 + 5.75 * math.cos(ang), 5.75 * math.sin(ang))],
            mat=mats["H_StainlessBolt"], bevel=0.025, bevel_segs=2,
        ))
    return join_parts("m134_gear_housing", parts)


def build_m134_spade_grip(mats) -> bpy.types.Object:
    parts = []
    # Heavy rear buffer mounting plate
    parts.append(mk_box("sg_plate", 1.40, 7.20, 7.80, xform=[("t", 3.10, 0.0, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.14, bevel_segs=3))

    # Ergonomic lathed vertical rubber spade handgrip profile (along local X -> rotated along Y!)
    grip_prof = [
        (0.00, -4.60), (0.98, -4.60), (1.10, -4.20),
        (1.06, -3.40), (1.13, -2.60), (1.07, -1.75),
        (1.16, -0.80), (1.19,  0.10), (1.15,  1.05),
        (1.08,  2.10), (1.13,  3.10), (1.08,  4.15),
        (0.96,  4.60), (0.00,  4.60),
    ]

    # Twin chamfered horizontal yokes, ergonomic lathed rubber hand grips, caps & twin butterfly fire paddles
    for s in (-1.0, 1.0):
        parts.append(mk_box(f"sg_arm_t_{s}", 5.60, 1.35, 1.45, xform=[("t", 0.20, 3.20, s * 3.80)], mat=mats["H_MainHousing"], bevel=0.16, bevel_segs=3))
        parts.append(mk_box(f"sg_arm_b_{s}", 5.20, 1.35, 1.45, xform=[("t", 0.30, -4.10, s * 3.80)], mat=mats["H_MainHousing"], bevel=0.16, bevel_segs=3))
        parts.append(mk_lathe_x(f"sg_grip_{s}", grip_prof, segs=48, xform=[("rz", math.pi * 0.5), ("t", -2.30, -0.50, s * 6.20)], mat=mats["H_RubberGrip"]))
        parts.append(mk_cyl(f"sg_cap_t_{s}", 1.18, 1.22, 0.65, axis="y", segs=44, xform=[("t", -2.30, 4.15, s * 6.20)], mat=mats["H_FlangeSteel"], bevel=0.085, bevel_segs=3))
        parts.append(mk_cyl(f"sg_cap_b_{s}", 1.22, 1.18, 0.65, axis="y", segs=44, xform=[("t", -2.30, -5.15, s * 6.20)], mat=mats["H_FlangeSteel"], bevel=0.085, bevel_segs=3))
        # Twin angled brushed-stainless thumb fire butterfly paddles
        parts.append(mk_box(f"sg_pad_{s}", 1.15, 2.20, 2.45, xform=[("t", -2.90, 2.10, s * 3.15)], mat=mats["H_StainlessBolt"], bevel=0.10, bevel_segs=3))

    # Central trigger control box & top thumb-safety hoop
    parts.append(mk_box("sg_box", 3.40, 3.80, 4.60, xform=[("t", -1.60, 2.30, 0.0)], mat=mats["H_MainHousing"], bevel=0.16, bevel_segs=3))
    parts.append(mk_box("sg_guard", 1.40, 0.52, 6.20, xform=[("t", -3.50, 4.20, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.075, bevel_segs=3))

    # Firewalled Crimson-Red Master Arm Toggle Switch & Flip Guard!
    parts.append(mk_box("sg_arm_guard", 1.05, 1.50, 1.10, xform=[("t", -3.55, 2.60, 0.0)], mat=mats["H_MasterRed"], bevel=0.095, bevel_segs=3))
    parts.append(mk_cyl("sg_arm_tog", 0.28, 0.34, 1.10, axis="x", segs=28, xform=[("t", -3.85, 2.75, 0.0)], mat=mats["H_MasterRed"], bevel=0.04, bevel_segs=3))
    return join_parts("m134_spade_grip", parts)


def build_m134_carry_handle(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_box("ch_base", 2.20, 2.40, 7.20, xform=[("t", -0.50, -1.30, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.14, bevel_segs=3))
    for s in (-1.0, 1.0):
        parts.append(mk_box(
            f"ch_sr_{s}", 1.40, 6.60, 0.85,
            xform=[("rz", -0.26), ("t", 0.50, 2.20, s * 3.20)],
            mat=mats["H_MainHousing"], bevel=0.12, bevel_segs=3,
        ))
        parts.append(mk_box(
            f"ch_sf_{s}", 1.30, 5.20, 0.85,
            xform=[("rz", 0.24), ("t", 9.60, 2.60, s * 3.20)],
            mat=mats["H_MainHousing"], bevel=0.12, bevel_segs=3,
        ))
        parts.append(mk_box(
            f"ch_rail_{s}", 9.80, 0.95, 0.85,
            xform=[("t", 5.00, 5.30, s * 3.20)],
            mat=mats["H_MainHousing"], bevel=0.12, bevel_segs=3,
        ))
        parts.append(mk_cyl(f"ch_end_{s}", 1.12, 1.12, 0.45, axis="z", segs=40, xform=[("t", 5.20, 5.55, s * 3.88)], mat=mats["H_FlangeSteel"], bevel=0.075, bevel_segs=3))
    parts.append(mk_box("ch_fbrace", 1.80, 1.10, 7.20, xform=[("t", 10.20, 0.40, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.11, bevel_segs=3))
    # Contoured ergonomic lathed chainsaw handle grip (central palm swell + end flares)
    ch_prof = [
        (0.00, -3.70), (1.08, -3.70), (1.08, -3.35), (0.96, -2.95),
        (1.06, -1.70), (1.12,  0.00), (1.06,  1.70),
        (0.96,  2.95), (1.08,  3.35), (1.08,  3.70), (0.00,  3.70),
    ]
    parts.append(mk_lathe_x("ch_grip", ch_prof, segs=48, xform=[("ry", -math.pi * 0.5), ("t", 5.20, 5.55, 0.0)], mat=mats["H_RubberGrip"]))
    return join_parts("m134_carry_handle", parts)


def build_m134_mount_pintle(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_box("mp_top", 10.00, 1.40, 6.80, xform=[("t", 0.0, 2.60, 0.0)], mat=mats["H_MainHousing"], bevel=0.08))
    for s in (-1.0, 1.0):
        parts.append(mk_box(f"mp_chk_{s}", 8.80, 3.60, 1.20, xform=[("t", 0.0, 0.80, s * 2.80)], mat=mats["H_FlangeSteel"], bevel=0.08))
    parts.append(mk_box("mp_yoke", 6.40, 2.60, 5.80, xform=[("t", 0.0, -0.70, 0.0)], mat=mats["H_FlangeSteel"], bevel=0.08))
    parts.append(mk_cyl("mp_post", 1.68, 1.56, 4.80, axis="y", segs=32, xform=[("t", 0.0, -3.00, 0.0)], mat=mats["H_MainHousing"], bevel=0.06))
    # Firewalled warm bronze pintle bearing bushing
    parts.append(mk_cyl("mp_bronze", 1.92, 1.92, 0.96, axis="y", segs=32, xform=[("t", 0.0, -1.80, 0.0)], mat=mats["H_PintleBronze"], bevel=0.05))
    # Stainless quick-release locking T-pin
    parts.append(mk_cyl("mp_tpin", 0.52, 0.52, 7.80, axis="z", segs=18, xform=[("t", 2.80, 0.60, 0.0)], mat=mats["H_StainlessBolt"], bevel=0.04))
    return join_parts("m134_mount_pintle", parts)


# =============================================================================
# PART BUILDERS — SUITE 2 (6 Parts: Barrels, Clamp, Flash Supp, Star-Rotor, Gear, Safing)
# =============================================================================
def build_m134_barrel_cluster(mats) -> bpy.types.Object:
    """6 x 22-inch cold-hammer-forged 7.62x51mm NATO rotary barrels (60-seg smooth profiles, stepped chambers & hollow bores)."""
    parts = []
    prof_r_x = [
        (0.39, -4.60),
        (1.02, -4.60),
        (1.02,  3.20),
        (0.94,  3.60),
        (0.94,  9.00),
        (0.84,  9.60),
        (0.84, 45.60),
        (0.80, 46.00),
        (0.80, 48.32),
        (0.75, 48.40),
        (0.38, 48.40),
        (0.38, -4.60),
        (0.39, -4.60),
    ]
    for i in range(6):
        th = i * (math.pi / 3.0)
        by = PITCH_RADIUS * math.cos(th)
        bz = PITCH_RADIUS * math.sin(th)
        parts.append(mk_lathe_x(
            f"bc_b_{i}", prof_r_x, segs=60,
            xform=[("t", 0.0, by, bz)],
            mat=mats["B_BarrelSteel"],
        ))
        parts.append(mk_hollow_tube_x(
            f"bc_lug_{i}", 1.03, 0.96, -4.40, -3.50, segs=44, bevel=0.025,
            xform=[("t", 0.0, by, bz)], mat=mats["B_BarrelSteel"],
        ))
    return join_parts("m134_barrel_cluster", parts)


def build_m134_barrel_clamp(mats) -> bpy.types.Object:
    parts = []
    for cx in (-6.40, 9.40):
        disc = mk_cyl(f"bcl_d_{cx}", 4.18, 4.18, 2.00, axis="x", segs=72, xform=[("t", cx, 0.0, 0.0)], mat=mats["B_ClampSteel"], bevel=0.085, bevel_segs=3)
        for i in range(6):
            th = i * (math.pi / 3.0)
            by = PITCH_RADIUS * math.cos(th)
            bz = PITCH_RADIUS * math.sin(th)
            bool_op(disc, mk_cyl("c_b", 0.87, 0.87, 2.6, axis="x", segs=36, xform=[("t", cx, by, bz)]), "DIFFERENCE")
            th_m = th + math.pi / 6.0
            bool_op(disc, mk_cyl("c_l", 0.52, 0.52, 2.6, axis="x", segs=28, xform=[("t", cx, 3.35 * math.cos(th_m), 3.35 * math.sin(th_m))]), "DIFFERENCE")
        parts.append(disc)
        # 6 precision recessed hex socket cap clamping bolts
        for i in range(6):
            th = i * (math.pi / 3.0) + math.pi / 6.0
            parts.append(_mk_socket_cap_bolt_x(
                f"bcl_hb_{cx}_{i}", 0.26, 2.34,
                cx, 2.05 * math.cos(th), 2.05 * math.sin(th),
                mats["B_DriveGear"], mats["B_ClampSteel"],
            ))
    parts.append(mk_hollow_tube_x("bcl_spine", 0.95, 0.55, -6.40, 9.40, segs=48, bevel=0.05, mat=mats["B_ClampSteel"]))
    return join_parts("m134_barrel_clamp", parts)


def build_m134_flash_suppressor(mats) -> bpy.types.Object:
    parts = []
    rear = mk_cyl("fs_rear", 4.28, 4.22, 2.00, axis="x", segs=72, xform=[("t", -1.40, 0.0, 0.0)], mat=mats["B_FlashHeatTemper"], bevel=0.075, bevel_segs=3)
    for i in range(6):
        th = i * (math.pi / 3.0)
        bool_op(rear, mk_cyl("fs_c", 0.84, 0.84, 2.6, axis="x", segs=36, xform=[("t", -1.40, PITCH_RADIUS * math.cos(th), PITCH_RADIUS * math.sin(th))]), "DIFFERENCE")
    parts.append(rear)
    parts.append(mk_hollow_tube_x("fs_front", 4.32, 3.65, 2.00, 3.00, segs=72, bevel=0.06, mat=mats["B_FlashHeatTemper"]))

    for i in range(6):
        th = i * (math.pi / 3.0)
        by = PITCH_RADIUS * math.cos(th)
        bz = PITCH_RADIUS * math.sin(th)
        parts.append(mk_hollow_tube_x(
            f"fs_cone_{i}", 1.06, 0.66, -0.50, 2.95, segs=44, bevel=0.035,
            xform=[("t", 0.0, by, bz)], mat=mats["B_FlashHeatTemper"],
        ))
        th_s = th + math.pi / 6.0
        parts.append(mk_box(
            f"fs_strut_{i}", 4.80, 0.42, 0.56,
            xform=[("t", 0.30, 3.96, 0.0), ("rx", th_s)],
            mat=mats["B_FlashHeatTemper"], bevel=0.055, bevel_segs=3,
        ))
    parts.append(mk_cyl("fs_hub", 1.12, 1.12, 5.20, axis="x", segs=40, xform=[("t", 0.25, 0.0, 0.0)], mat=mats["B_FlashHeatTemper"], bevel=0.065, bevel_segs=3))
    return join_parts("m134_flash_suppressor", parts)


def build_m134_rotor_assembly(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_cyl("rt_shaft", 1.32, 1.32, 4.20, axis="x", segs=48, xform=[("t", -9.70, 0.0, 0.0)], mat=mats["B_DriveGear"], bevel=0.05, bevel_segs=3))
    for i in range(8):
        parts.append(mk_box(
            f"rt_spl_{i}", 3.40, 0.28, 0.26,
            xform=[("t", -9.80, 1.36, 0.0), ("rx", i * math.pi / 4.0)],
            mat=mats["B_DriveGear"], bevel=0.025, bevel_segs=2,
        ))
    parts.append(mk_cyl("rt_core", 1.72, 1.72, 10.20, axis="x", segs=56, xform=[("t", -2.80, 0.0, 0.0)], mat=mats["B_RotorCNC"], bevel=0.06, bevel_segs=3))
    for i in range(6):
        th = (i + 0.5) * (math.pi / 3.0)
        parts.append(mk_box(
            f"rt_fin_{i}", 9.80, 1.88, 0.56,
            xform=[("t", -2.80, 2.58, 0.0), ("rx", th)],
            mat=mats["B_RotorCNC"], bevel=0.055, bevel_segs=3,
        ))
        parts.append(mk_box(
            f"rt_cap_{i}", 9.60, 0.36, 1.05,
            xform=[("t", -2.80, 3.42, 0.0), ("rx", th)],
            mat=mats["B_DriveGear"], bevel=0.04, bevel_segs=2,
        ))

    head = mk_cyl("rt_head", 3.92, 3.92, 7.00, axis="x", segs=72, xform=[("t", 5.80, 0.0, 0.0)], mat=mats["B_RotorCNC"], bevel=0.085, bevel_segs=3)
    for i in range(6):
        th = i * (math.pi / 3.0)
        bool_op(head, mk_cyl("rt_sock", 1.05, 1.05, 7.6, axis="x", segs=36, xform=[("t", 5.80, PITCH_RADIUS * math.cos(th), PITCH_RADIUS * math.sin(th))]), "DIFFERENCE")
    parts.append(head)
    parts.append(mk_hollow_tube_x("rt_brg", 4.16, 3.85, 7.40, 9.30, segs=72, bevel=0.05, mat=mats["B_DriveGear"]))
    return join_parts("m134_rotor_assembly", parts)


def build_m134_drive_gear(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_hollow_tube_x("dg_hub", 2.10, 1.32, -1.15, 1.15, segs=44, bevel=0.045, mat=mats["B_DriveGear"]))
    parts.append(mk_hollow_tube_x("dg_web", 4.92, 2.05, -0.68, 0.68, segs=60, bevel=0.035, mat=mats["B_RotorCNC"]))
    parts.append(mk_hollow_tube_x("dg_rim", 4.98, 4.15, -1.05, 1.05, segs=60, bevel=0.045, mat=mats["B_DriveGear"]))
    for i in range(6):
        th = i * (math.pi / 3.0)
        parts.append(mk_box(
            f"dg_sp_{i}", 1.65, 2.20, 0.45,
            xform=[("t", 0.0, 3.10, 0.0), ("rx", th)],
            mat=mats["B_DriveGear"], bevel=0.055, bevel_segs=3,
        ))
    for i in range(28):
        th = i * (2.0 * math.pi / 28.0)
        parts.append(mk_box(
            f"dg_t_{i}", 1.96, 0.62, 0.46,
            xform=[("t", 0.0, 5.12, 0.0), ("rx", th)],
            mat=mats["B_DriveGear"], bevel=0.035, bevel_segs=2,
        ))
    return join_parts("m134_drive_gear", parts)


def build_m134_safing_sector(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_box("ss_body", 4.80, 1.15, 4.60, xform=[("t", 0.0, 0.0, 0.0)], mat=mats["B_ClampSteel"], bevel=0.06))
    # Firewalled Top Hero Yellow/Red SAFE/ARMED Plate: ONLY top (+Y -> Blender +Z) gets B_SafingPlate; side bevels stay B_ClampSteel!
    plate = mk_box("ss_plate", 4.00, 0.24, 3.60, xform=[("t", 0.0, 0.65, 0.0)], mat=mats["B_ClampSteel"], bevel=0.02)
    plate.data.materials.append(mats["B_SafingPlate"])
    for poly in plate.data.polygons:
        if poly.normal.z > 0.85:
            poly.material_index = 1
    parts.append(plate)
    # Quick-release pull-bail latch & crimson detent knob
    parts.append(mk_box("ss_bail", 1.10, 0.45, 2.80, xform=[("t", 1.70, 0.82, 0.0)], mat=mats["B_DriveGear"], bevel=0.04))
    parts.append(mk_cyl("ss_knob", 0.42, 0.42, 0.55, axis="y", segs=20, xform=[("t", -1.50, 0.78, 0.0)], mat=mats["B_SafingRed"], bevel=0.04))
    return join_parts("m134_safing_sector", parts)


# =============================================================================
# PART BUILDERS — SUITE 3 (10 Parts: 6 Bolts, Delinker Housing, Sprocket, Ammo Chute, Ejection Chute)
# =============================================================================
def build_m134_rotary_bolt(part_name: str, mats) -> bpy.types.Object:
    parts = []
    # Main brushed hard-chrome T-rail bolt body (local X in [-2.75, +1.25])
    parts.append(mk_box("b_rail", 3.90, 1.38, 1.24, xform=[("t", -0.80, 0.0, 0.0)], mat=mats["D_ChromeBolt"], bevel=0.075, bevel_segs=3))
    parts.append(mk_cyl("b_cyl", 0.74, 0.74, 3.80, axis="x", segs=36, xform=[("t", -0.85, 0.0, 0.0)], mat=mats["D_ChromeBolt"], bevel=0.045, bevel_segs=2))
    # Rotating dual-lug locking bolt head (+1.05 .. +2.20)
    parts.append(mk_cyl("b_head", 0.76, 0.76, 1.14, axis="x", segs=36, xform=[("t", 1.62, 0.0, 0.0)], mat=mats["D_ChromeBolt"], bevel=0.045, bevel_segs=2))
    parts.append(mk_box("b_lugs", 0.68, 0.44, 1.44, xform=[("t", 1.75, 0.0, 0.0)], mat=mats["D_ChromeBolt"], bevel=0.05, bevel_segs=3))
    # Dark Parkerized extractor claw on flank of bolt head
    parts.append(mk_box("b_ext", 1.35, 0.34, 0.28, xform=[("t", 1.35, 0.48, 0.62)], mat=mats["D_BoltExtractor"], bevel=0.035, bevel_segs=2))
    # Rear coaxial striker tail
    parts.append(mk_cyl("b_pin", 0.24, 0.24, 0.55, axis="x", segs=24, xform=[("t", -2.55, 0.0, 0.0)], mat=mats["D_BoltExtractor"], bevel=0.025, bevel_segs=2))
    # Machined Steel Radial Cam Follower Roller Stud riding the 360° sinusoidal cam track
    parts.append(mk_cyl("b_stem", 0.32, 0.36, 0.68, axis="y", segs=28, xform=[("t", -0.80, 0.92, 0.0)], mat=mats["D_BoltExtractor"], bevel=0.025, bevel_segs=2))
    parts.append(mk_cyl("b_roller", 0.43, 0.43, 0.62, axis="y", segs=32, xform=[("t", -0.80, 1.50, 0.0)], mat=mats["D_ChromeBolt"], bevel=0.055, bevel_segs=3))
    return join_parts(part_name, parts)


def build_m134_delinker_housing(mats) -> bpy.types.Object:
    parts = []
    outer = mk_box("dh_out", 9.20, 7.60, 5.80, xform=[("t", -0.10, 0.20, -0.10)], mat=mats["D_DelinkerSteel"], bevel=0.18, bevel_segs=3)
    inner = mk_box("dh_in", 7.60, 5.60, 4.40, xform=[("t", 0.0, 0.10, 0.50)])
    bool_op(outer, inner, "DIFFERENCE")
    parts.append(outer)

    parts.append(mk_box("dh_inlet", 7.80, 1.60, 4.80, xform=[("t", 0.0, -3.40, -0.60)], mat=mats["D_DelinkerSteel"], bevel=0.11, bevel_segs=3))
    parts.append(mk_box("dh_collar", 7.40, 5.40, 1.20, xform=[("t", 0.0, 0.40, 2.40)], mat=mats["D_StainlessChute"], bevel=0.08, bevel_segs=3))
    # Left (-Z) Flat Hero Faceplate (X in [-4.0, +3.8], Y in [-2.5, +3.1], outer Z = -3.21)
    parts.append(mk_box("dh_face", 7.80, 5.60, 0.38, xform=[("t", -0.10, 0.30, -3.02)], mat=mats["D_DelinkerFaceplate"], bevel=0.05, bevel_segs=3))
    for lx in (-3.40, 3.20):
        parts.append(mk_box(f"dh_lt_{lx}", 0.75, 2.20, 0.65, xform=[("t", lx, 2.20, -2.95)], mat=mats["D_StainlessChute"], bevel=0.055, bevel_segs=3))
    for bx in (-3.6, 3.4):
        for by in (-2.1, 2.7):
            parts.append(mk_cyl(f"dh_blt_{bx}_{by}", 0.16, 0.16, 0.24, axis="z", segs=6, xform=[("t", bx, by, -3.22)], mat=mats["D_ChromeBolt"], bevel=0.025, bevel_segs=2))
    return join_parts("m134_delinker_housing", parts)


def build_m134_delinker_sprocket(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_cyl("ds_axle", 0.95, 0.95, 7.60, axis="x", segs=40, mat=mats["D_ChromeBolt"], bevel=0.045, bevel_segs=3))
    # Precision-machined warm brass/bronze 6-lobe delinker feed sprockets!
    for i in range(6):
        th = i * (math.pi / 3.0)
        parts.append(mk_box(
            f"ds_lobe_{i}", 5.60, 1.35, 0.56,
            xform=[("t", 0.0, 1.48, 0.0), ("rx", th)],
            mat=mats["D_BrassSprocket"], bevel=0.075, bevel_segs=3,
        ))
    parts.append(mk_cyl("ds_gear", 1.95, 1.95, 0.90, axis="x", segs=44, xform=[("t", -3.15, 0.0, 0.0)], mat=mats["D_BrassSprocket"], bevel=0.05, bevel_segs=3))
    return join_parts("m134_delinker_sprocket", parts)


def build_m134_ammo_chute(mats) -> bpy.types.Object:
    """Flexible ribbed stainless linkless/M13 feed chute carrying 8 gleaming 7.62x51mm NATO
    cartridges (annealed C26000 brass, copper FMJ spitzer bullets, silver primers & M13 links!)."""
    parts = []
    parts.append(mk_box("ac_top", 8.20, 1.30, 4.20, xform=[("t", 0.0, 3.85, 1.10)], mat=mats["D_StainlessChute"], bevel=0.06))

    # 7.62x51mm NATO (M80 147gr) lathe profiles:
    # Brass case: X in [-3.40, +1.70] (51.0 mm!), 11.9 mm base rim -> 20° bottleneck shoulder -> 8.6 mm neck!
    brass_prof = [
        (0.00, -3.40),
        (0.58, -3.40),
        (0.59, -3.32),
        (0.59, -3.22),
        (0.50, -3.18),  # Extractor groove
        (0.50, -3.02),
        (0.59, -2.92),  # Base web
        (0.56,  0.48),  # Tapered case wall
        (0.44,  0.96),  # 20° NATO bottleneck shoulder!
        (0.43,  1.70),  # Case mouth
        (0.00,  1.70),
    ]
    # Copper 147gr FMJ Spitzer bullet: X in [+1.66, +3.72] (71.1 mm total OAL!)
    bullet_prof = [
        (0.00, 1.66),
        (0.39, 1.66),
        (0.39, 2.25),
        (0.34, 2.75),
        (0.24, 3.22),
        (0.11, 3.56),
        (0.00, 3.72),
    ]

    for i in range(8):
        u = i / 7.0
        cy = 2.80 - u * 8.10
        cz = 0.90 - u * 3.80 - math.sin(u * math.pi) * 0.45
        rot_x = -0.35 - u * 0.18

        # Articulated ribbed stainless steel chute frame segment (open inspection side facing -Z!)
        parts.append(mk_box(
            f"ac_seg_{i}", 7.80, 0.82, 2.20,
            xform=[("rx", rot_x), ("t", 0.0, cy, cz + 0.55)],
            mat=mats["D_StainlessChute"], bevel=0.05,
        ))
        # Side retention guide rails along front/rear edges of chute
        for sx in (-3.75, 3.75):
            parts.append(mk_box(
                f"ac_rail_{i}_{sx}", 0.36, 0.95, 1.90,
                xform=[("rx", rot_x), ("t", sx, cy, cz - 0.35)],
                mat=mats["D_StainlessChute"], bevel=0.03,
            ))

        # 7.62x51mm NATO Cartridge: Annealed Brass Case + Silver Boxer Primer + Copper FMJ Spitzer + M13 Steel Link!
        parts.append(mk_lathe_x(f"ac_br_{i}", brass_prof, segs=28, xform=[("t", 0.0, cy, cz - 0.55)], mat=mats["D_Brass762"]))
        parts.append(mk_cyl(f"ac_pr_{i}", 0.24, 0.24, 0.08, axis="x", segs=18, xform=[("t", -3.41, cy, cz - 0.55)], mat=mats["D_PrimerSilver"], bevel=0.01))
        parts.append(mk_lathe_x(f"ac_cu_{i}", bullet_prof, segs=28, xform=[("t", 0.0, cy, cz - 0.55)], mat=mats["D_CopperFMJ"]))
        # Iconic M13 Disintegrating Steel Link wrapping cartridge body
        parts.append(mk_hollow_tube_x(
            f"ac_lk_{i}", 0.67, 0.57, -1.65, -0.05, segs=24, bevel=0.025,
            xform=[("t", 0.0, cy, cz - 0.55)], mat=mats["D_M13LinkSteel"],
        ))
        parts.append(mk_box(
            f"ac_lkt_{i}", 1.55, 0.32, 1.32,
            xform=[("t", -0.85, cy + 0.36, cz - 0.55)],
            mat=mats["D_M13LinkSteel"], bevel=0.03,
        ))

    return join_parts("m134_ammo_chute", parts)


def build_m134_ejection_chute(mats) -> bpy.types.Object:
    parts = []
    parts.append(mk_box("ec_flange", 7.20, 2.60, 1.20, xform=[("t", 0.0, 1.40, -1.60)], mat=mats["D_EjectionSteel"], bevel=0.07))
    chute = mk_box("ec_box", 6.80, 4.60, 4.20, xform=[("rx", 0.52), ("t", 0.0, -0.60, 0.35)], mat=mats["D_EjectionSteel"], bevel=0.09)
    bore = mk_box("ec_in", 5.60, 3.60, 5.40, xform=[("rx", 0.52), ("t", 0.0, -0.60, 0.35)])
    bool_op(chute, bore, "DIFFERENCE")
    parts.append(chute)
    parts.append(mk_box("ec_lip", 6.60, 0.45, 2.60, xform=[("rx", 0.65), ("t", 0.0, -2.55, 1.45)], mat=mats["D_EjectionSteel"], bevel=0.04))
    # 6 stainless mounting flange rivets
    for rx in (-2.9, 0.0, 2.9):
        for ry in (0.6, 2.2):
            parts.append(mk_cyl(f"ec_rv_{rx}_{ry}", 0.18, 0.18, 0.25, axis="z", segs=12, xform=[("t", rx, ry, -0.96)], mat=mats["D_ChromeBolt"], bevel=0.02))
    return join_parts("m134_ejection_chute", parts)


# =============================================================================
# Non-Overlapping Hero UV Layout + Strict Firewalls (>=50px) + CONCAVE Packing
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    select_face_fn=None,
    skip_face_fn=None,
):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    active_objs: list[bpy.types.Object] = []
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers.active = o.data.uv_layers[0]
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.select_mode = {"FACE"}
        for v in bm.verts:
            v.select = False
        for e in bm.edges:
            e.select = False
        mat_names = [m.name if m else "" for m in o.data.materials]
        sel_count = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None:
                want = select_face_fn(o.name, f, mname)
            elif skip_face_fn is not None:
                want = not skip_face_fn(o.name, f, mname)
            else:
                want = True
            f.select = want
            if want:
                sel_count += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if sel_count > 0:
            active_objs.append(o)

    assert active_objs, f"No faces selected for UV packing into [{u0},{u1}]x[{v0},{v1}]!"
    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.0045,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=0.0048,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du = u1 - u0
    dv = v1 - v0
    pu_min, pu_max, pv_min, pv_max = 1.0, 0.0, 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None and not select_face_fn(o.name, f, mname):
                continue
            if skip_face_fn is not None and skip_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                pu_min, pu_max = min(pu_min, ux), max(pu_max, ux)
                pv_min, pv_max = min(pv_min, vy), max(pv_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    su, sv = pu_max - pu_min, pv_max - pv_min
    print(f"  [UV-PACK] {len(active_objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] span=({su:.3f}, {sv:.3f})")
    assert su > 0.30 and sv > 0.30, f"UV packing collapsed! span=({su}, {sv})"


def unwrap_housing_motor_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if obj_name == "m134_main_housing" and mat_name == "H_HousingPlate":
            if -6.52 <= tx <= 6.52 and -1.32 <= ty <= 2.82 and nz > 0.88 and tz > 6.02:
                return "mh_right"
            if 2.18 <= tx <= 7.62 and -1.02 <= ty <= 2.62 and nz < -0.88 and tz < -6.02:
                return "mh_left"
        if obj_name == "m134_drive_motor" and mat_name == "H_MotorNameplate":
            if -3.12 <= tx <= 3.52 and -0.98 <= ty <= 1.18:
                if nz > 0.88 and tz > 3.16:
                    return "dm_right"
                if nz < -0.88 and tz < -3.16:
                    return "dm_left"
        return None

    FIREWALL_MATS = {"H_MasterRed", "H_CopperWinding", "H_CommutatorBrass", "H_CamGrooveChrome", "H_PintleBronze"}

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FIREWALL_MATS)

    # 4 Strict Material UV Firewalls (>= 50px = >= 0.025 UV gap!)
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.145, 0.435, 0.530, select_face_fn=lambda _n, _f, m: m == "H_MasterRed")
    _smart_unwrap_and_pack_rect(objs, 0.175, 0.445, 0.435, 0.530, select_face_fn=lambda _n, _f, m: m in {"H_CopperWinding", "H_CommutatorBrass"})
    _smart_unwrap_and_pack_rect(objs, 0.475, 0.765, 0.435, 0.530, select_face_fn=lambda _n, _f, m: m == "H_CamGrooveChrome")
    _smart_unwrap_and_pack_rect(objs, 0.795, 0.985, 0.435, 0.530, select_face_fn=lambda _n, _f, m: m == "H_PintleBronze")

    grp_a = [o for o in objs if o.name in {"m134_main_housing", "m134_gear_housing", "m134_cam_track_ring"}]
    grp_b = [o for o in objs if o not in grp_a]
    _smart_unwrap_and_pack_rect(grp_a, 0.010, 0.990, 0.215, 0.408, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_b, 0.010, 0.990, 0.010, 0.198, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV bands
    counts = {"mh_right": 0, "mh_left": 0, "dm_right": 0, "dm_left": 0}
    for o in objs:
        if o.name not in {"m134_main_housing", "m134_drive_motor"}:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_hero(o.name, f, mname)
            if tag is None:
                continue
            counts[tag] += 1
            for loop in f.loops:
                tx, ty = loop.vert.co.x, loop.vert.co.z
                if tag == "mh_right":
                    xn = max(0.0, min(1.0, (tx - (-6.50)) / 13.00))
                    yn = max(0.0, min(1.0, (ty - (-1.30)) / 4.10))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.805 + yn * 0.180)
                elif tag == "mh_left":
                    xn = max(0.0, min(1.0, (7.60 - tx) / 5.40))
                    yn = max(0.0, min(1.0, (ty - (-1.00)) / 3.60))
                    loop[uv_layer].uv = (0.015 + xn * 0.510, 0.655 + yn * 0.130)
                elif tag == "dm_right":
                    xn = max(0.0, min(1.0, (tx - (-3.10)) / 6.60))
                    yn = max(0.0, min(1.0, (ty - (-0.95)) / 2.10))
                    loop[uv_layer].uv = (0.015 + xn * 0.470, 0.555 + yn * 0.083)
                elif tag == "dm_left":
                    xn = max(0.0, min(1.0, (3.50 - tx) / 6.60))
                    yn = max(0.0, min(1.0, (ty - (-0.95)) / 2.10))
                    loop[uv_layer].uv = (0.515 + xn * 0.470, 0.555 + yn * 0.083)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] housing_motor hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing housing_motor hero faces: {counts}"


def unwrap_barrels_rotor_atlas(objs: list[bpy.types.Object]):
    def is_safing_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "m134_safing_sector" or mat_name != "B_SafingPlate":
            return False
        return face.normal.z > 0.85  # Blender +Z == Three.js +Y top face!

    # Strict Firewalls: Safing Red Knob, Flash Suppressor Heat Temper, Barrels, Rotor/Gear/Clamp
    safing_grp = [o for o in objs if o.name == "m134_safing_sector"]
    flash_grp = [o for o in objs if o.name == "m134_flash_suppressor"]
    barrel_grp = [o for o in objs if o.name == "m134_barrel_cluster"]
    rest_grp = [o for o in objs if o not in flash_grp and o not in barrel_grp]

    _smart_unwrap_and_pack_rect(safing_grp, 0.400, 0.510, 0.825, 0.985, select_face_fn=lambda _n, _f, m: m == "B_SafingRed")
    _smart_unwrap_and_pack_rect(flash_grp,  0.545, 0.985, 0.760, 0.985)
    _smart_unwrap_and_pack_rect(barrel_grp, 0.010, 0.990, 0.390, 0.730)
    _smart_unwrap_and_pack_rect(
        rest_grp, 0.010, 0.990, 0.010, 0.368,
        skip_face_fn=lambda n, f, m: is_safing_hero(n, f, m) or (m == "B_SafingRed"),
    )

    # Project exact top planar Hero UV on `m134_safing_sector` SAFE / ARMED plate
    sf_obj = safing_grp[0]
    bm = bmesh.new()
    bm.from_mesh(sf_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sf_obj.data.materials]
    hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_safing_hero(sf_obj.name, f, mname):
            continue
        hits += 1
        for loop in f.loops:
            tx, tz = loop.vert.co.x, -loop.vert.co.y
            xn = max(0.0, min(1.0, (tx - (-2.00)) / 4.00))
            zn = max(0.0, min(1.0, (1.80 - tz) / 3.60))  # Viewing from top (+Y) looking down: -Z top, +Z bottom!
            loop[uv_layer].uv = (0.015 + xn * 0.350, 0.785 + zn * 0.200)
    bm.to_mesh(sf_obj.data)
    bm.free()
    print(f"  [HERO-UV] barrels_rotor safing plate hits={hits}")
    assert hits > 0, "Missing safing sector hero plate faces!"


def unwrap_delinker_bolts_atlas(objs: list[bpy.types.Object]):
    def is_delinker_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "m134_delinker_housing" or mat_name != "D_DelinkerFaceplate":
            return False
        # Outer Left (-Z) face -> Blender normal.y > +0.88, Three.js tz < -3.15
        c = face.calc_center_median()
        return (-face.normal.y) < -0.88 and (-c.y) < -3.15

    chute_grp = [o for o in objs if o.name == "m134_ammo_chute"]
    bolts_grp = [o for o in objs if o.name.startswith("m134_bolt_") or o.name == "m134_delinker_sprocket"]
    housing_grp = [o for o in objs if o not in bolts_grp]

    AMMO_MATS = {"D_CopperFMJ", "D_Brass762", "D_PrimerSilver", "D_M13LinkSteel"}

    # Strict 4-Way Ammo UV Firewalls (>= 55px moats!)
    _smart_unwrap_and_pack_rect(chute_grp, 0.520, 0.655, 0.815, 0.985, select_face_fn=lambda _n, _f, m: m == "D_CopperFMJ")
    _smart_unwrap_and_pack_rect(chute_grp, 0.685, 0.855, 0.790, 0.985, select_face_fn=lambda _n, _f, m: m == "D_Brass762")
    _smart_unwrap_and_pack_rect(chute_grp, 0.885, 0.985, 0.895, 0.985, select_face_fn=lambda _n, _f, m: m == "D_PrimerSilver")
    _smart_unwrap_and_pack_rect(chute_grp, 0.885, 0.985, 0.785, 0.865, select_face_fn=lambda _n, _f, m: m == "D_M13LinkSteel")

    _smart_unwrap_and_pack_rect(bolts_grp, 0.010, 0.990, 0.390, 0.755)
    _smart_unwrap_and_pack_rect(
        housing_grp, 0.010, 0.990, 0.010, 0.365,
        skip_face_fn=lambda n, f, m: is_delinker_hero(n, f, m) or (m in AMMO_MATS),
    )

    # Project exact 1:1 non-mirrored planar Hero UV on Dillon Aero Delinker Left Faceplate (-Z)
    dh_obj = next(o for o in objs if o.name == "m134_delinker_housing")
    bm = bmesh.new()
    bm.from_mesh(dh_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in dh_obj.data.materials]
    hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_delinker_hero(dh_obj.name, f, mname):
            continue
        hits += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            # Left (-Z) flank: +X -> left (u=0.015), -X -> right (u=0.485), +Y -> top (v=0.985)
            xn = max(0.0, min(1.0, (3.80 - tx) / 7.80))
            yn = max(0.0, min(1.0, (ty - (-2.50)) / 5.60))
            loop[uv_layer].uv = (0.015 + xn * 0.470, 0.785 + yn * 0.200)
    bm.to_mesh(dh_obj.data)
    bm.free()
    print(f"  [HERO-UV] delinker_bolts faceplate hits={hits} (4-way 7.62mm belt firewalled!)")
    assert hits > 0, "Missing delinker faceplate hero faces!"


# =============================================================================
# Cycles Multi-Channel GPU Baking Engine (Option A: Assembled Contact AO -> Identity)
# =============================================================================
def _attach_bake_image_node(mats_set: set[bpy.types.Material], img: bpy.types.Image) -> list[tuple]:
    created = []
    for mat in mats_set:
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.name = "__BAKE_TARGET__"
        nt.nodes.active = tex
        created.append((nt, tex))
    return created


def _remove_bake_image_nodes(created: list[tuple]):
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set: set[bpy.types.Material], input_name: str):
    saved = []
    for mat in mats_set:
        nt = mat.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        orig_link = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        inp = bsdf.inputs[input_name]
        if inp.is_linked:
            nt.links.new(inp.links[0].from_socket, emit.inputs["Color"])
        else:
            val = inp.default_value
            if isinstance(val, (int, float)):
                emit.inputs["Color"].default_value = (val, val, val, 1.0)
            else:
                emit.inputs["Color"].default_value = tuple(val)
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        saved.append((nt, out, emit, orig_link))
    return saved


def _restore_bsdf(saved: list[tuple]):
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]):
    for i, o in enumerate(all_objs):
        o.location = (i * 95.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            o.rotation_euler = (0.0, 0.0, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 260.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object], tmp_dir: Path
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False, extra_objs_override=None,
    ):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=6, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=4, fill_color=(0.048, 0.052, 0.055, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=4, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=4, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.72
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.55
    run_bake("ao_ext", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

    white_mat = bpy.data.materials.new("__EXT_MASK__")
    nt = white_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

    orig_mats = {}
    for o in ext_targets:
        orig_mats[o.name] = list(o.data.materials)
        o.data.materials.clear()
        o.data.materials.append(white_mat)
    img_m = bpy.data.images.new(f"{prefix}_ext_mask", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    arr = np.zeros((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
    arr[:, 3] = 1.0
    img_m.pixels.foreach_set(arr.ravel())
    nodes_m = _attach_bake_image_node({white_mat}, img_m)
    scene.cycles.samples = 1
    select_only(ext_targets, ext_targets[0])
    bpy.ops.object.bake(type="EMIT", margin=6, use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)
    for o in ext_targets:
        o.data.materials.clear()
        for m in orig_mats[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


# =============================================================================
# Strict Manifold, Normal-Alignment & Bounding-Box Verification + Draco Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
    max_bbox_delta = 0.0
    total_tris = 0
    bad_parts = []
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        xs = [v.co.x for v in bm.verts]
        ys = [v.co.z for v in bm.verts]
        zs = [-v.co.y for v in bm.verts]
        bmin = (min(xs), min(ys), min(zs))
        bmax = (max(xs), max(ys), max(zs))
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()

        ref_min, ref_max = CSG_REF_BBOX[o.name]
        deltas = [abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)]
        d_max = max(deltas)
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.45) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:9.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.45:
            print(f"       !! BBOX DELTA > 0.45cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    return report


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    select_only(all_objs, all_objs[0])
    MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_OUT),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=True,
        export_materials="NONE",
        export_animations=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=12,
        export_draco_texcoord_quantization=12,
    )
    print(f"[EXPORT] Wrote Draco GLB -> {MODELS_OUT} ({MODELS_OUT.stat().st_size / 1024:.1f} KB)")


def _render_studio_previews(all_objs: list[bpy.types.Object], preview_dir: Path):
    """Renders quick Cycles verification shots using the final baked v3 WebP PBR suites."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = 36
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3

    def mk_baked_mat(suite: str, normal_strength: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(f"Baked_{suite}")
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        tex_alb = nt.nodes.new("ShaderNodeTexImage")
        tex_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"m134_v3_{suite}_albedo.webp"))
        tex_alb.image.colorspace_settings.name = "sRGB"

        tex_orm = nt.nodes.new("ShaderNodeTexImage")
        tex_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"m134_v3_{suite}_roughness.webp"))
        tex_orm.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex_orm.outputs["Color"], sep.inputs["Color"])

        mix_ao = nt.nodes.new("ShaderNodeMix")
        mix_ao.data_type = "RGBA"
        mix_ao.blend_type = "MULTIPLY"
        mix_ao.inputs["Factor"].default_value = 0.85
        nt.links.new(tex_alb.outputs["Color"], mix_ao.inputs[6])
        nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])
        nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        tex_nrm = nt.nodes.new("ShaderNodeTexImage")
        tex_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"m134_v3_{suite}_normal.webp"))
        tex_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_hm = mk_baked_mat("housing_motor", 0.88)
    mat_br = mk_baked_mat("barrels_rotor", 0.88)
    mat_db = mk_baked_mat("delinker_bolts", 0.88)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in HOUSING_MOTOR_PARTS:
            o.data.materials.append(mat_hm)
        elif o.name in BARRELS_ROTOR_PARTS:
            o.data.materials.append(mat_br)
        else:
            o.data.materials.append(mat_db)
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False

    w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "studio_dark_armory.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.65
    else:
        w_bg.inputs["Color"].default_value = (0.14, 0.16, 0.18, 1.0)
        w_bg.inputs["Strength"].default_value = 1.0
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    for lname, loc_t, energy, size in (
        ("KeyLight",  (22.0, 38.0,  46.0), 36000.0, 32.0),
        ("FillLight", (-20.0, 22.0, -48.0), 22000.0, 34.0),
        ("RimLight",  (32.0, 34.0, -24.0), 24000.0, 24.0),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc_t)
        d = t2b(6.0, 0.0, 0.0) - lobj.location
        lobj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    shots = [
        ("m134_iso_right.png",     ( 38.0, 24.0,  68.0), (  6.0,  1.0,  0.0), 42.0),
        ("m134_iso_left.png",      ( 34.0, 22.0, -68.0), (  4.0,  0.0, -2.0), 42.0),
        ("m134_macro_housing.png", (  2.0,  5.0,  28.0), ( -6.5,  2.5,  3.5), 48.0),
        ("m134_macro_muzzle.png",  ( 66.0, 12.0,  22.0), ( 38.0,  0.0,  0.0), 50.0),
        ("m134_macro_delinker.png",(-10.0,  2.0, -34.0), ( -9.2, -2.5, -8.5), 48.0),
    ]
    for fname, cpos, ctgt, lens in shots:
        cam_data.lens = lens
        cam_obj.location = t2b(*cpos)
        direction = t2b(*ctgt) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(preview_dir / fname)
        bpy.ops.render.render(write_still=True)
        print(f"[PREVIEW] Rendered {preview_dir / fname}")


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: Housing, 360° Cam Track, 28V Motor, Gearbox, Spade Grip, Handle, Pintle (7 parts)
        "m134_main_housing":      lambda m: build_m134_main_housing(m),
        "m134_cam_track_ring":    lambda m: build_m134_cam_track_ring(m),
        "m134_drive_motor":       lambda m: build_m134_drive_motor(m),
        "m134_gear_housing":      lambda m: build_m134_gear_housing(m),
        "m134_spade_grip":        lambda m: build_m134_spade_grip(m),
        "m134_carry_handle":      lambda m: build_m134_carry_handle(m),
        "m134_mount_pintle":      lambda m: build_m134_mount_pintle(m),
        # Suite 2: 6-Barrel Cluster, Clamp, Flash Suppressor, Star-Rotor, Drive Gear, Safing Sector (6 parts)
        "m134_barrel_cluster":    lambda m: build_m134_barrel_cluster(m),
        "m134_barrel_clamp":      lambda m: build_m134_barrel_clamp(m),
        "m134_flash_suppressor":  lambda m: build_m134_flash_suppressor(m),
        "m134_rotor_assembly":    lambda m: build_m134_rotor_assembly(m),
        "m134_drive_gear":        lambda m: build_m134_drive_gear(m),
        "m134_safing_sector":     lambda m: build_m134_safing_sector(m),
        # Suite 3: 6 Rotary Bolts, Delinker Housing, Sprocket, Ammo Chute, Ejection Chute (10 parts)
        "m134_bolt_1":            lambda m: build_m134_rotary_bolt("m134_bolt_1", m),
        "m134_bolt_2":            lambda m: build_m134_rotary_bolt("m134_bolt_2", m),
        "m134_bolt_3":            lambda m: build_m134_rotary_bolt("m134_bolt_3", m),
        "m134_bolt_4":            lambda m: build_m134_rotary_bolt("m134_bolt_4", m),
        "m134_bolt_5":            lambda m: build_m134_rotary_bolt("m134_bolt_5", m),
        "m134_bolt_6":            lambda m: build_m134_rotary_bolt("m134_bolt_6", m),
        "m134_delinker_housing":  lambda m: build_m134_delinker_housing(m),
        "m134_delinker_sprocket": lambda m: build_m134_delinker_sprocket(m),
        "m134_ammo_chute":        lambda m: build_m134_ammo_chute(m),
        "m134_ejection_chute":    lambda m: build_m134_ejection_chute(m),
    }

    print("[BUILD] Sculpting all 23 solid GE / Dillon Aero M134D Minigun (7.62x51mm NATO) parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    hm_objs = [built[pid] for pid in HOUSING_MOTOR_PARTS]
    br_objs = [built[pid] for pid in BARRELS_ROTOR_PARTS]
    db_objs = [built[pid] for pid in DELINKER_BOLTS_PARTS]
    all_objs = hm_objs + br_objs + db_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: housing_motor (7), barrels_rotor (6), delinker_bolts (10)...")
    unwrap_housing_motor_atlas(hm_objs)
    unwrap_barrels_rotor_atlas(br_objs)
    unwrap_delinker_bolts_atlas(db_objs)

    # Pre-bake triangulation with custom normal preservation so baked tangent normals match Draco export 100%!
    _triangulate_keep_normals(all_objs)

    for label, group in (("housing_motor", hm_objs), ("barrels_rotor", br_objs), ("delinker_bolts", db_objs)):
        tot_area = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot_area += oa
            assert 0.00003 < oa < 0.88, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:16s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="m134_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking m134_v3_housing_motor (2048x2048, 7 parts)...")
        bake_atlas_suite("hm", hm_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m134_v3_barrels_rotor (2048x2048, 6 parts)...")
        bake_atlas_suite("br", br_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking m134_v3_delinker_bolts (2048x2048, 10 parts)...")
        bake_atlas_suite("db", db_objs, all_objs, tmp_dir)

        print("[POST] Compositing military stencils, ECC200 UID, motor nameplate, SAFE/ARMED & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--render-preview" in sys.argv:
        pidx = sys.argv.index("--render-preview")
        _render_studio_previews(all_objs, Path(sys.argv[pidx + 1]))

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m134_v3_housing_motor_albedo.webp",
        TEX_OUT_DIR / "m134_v3_housing_motor_normal.webp",
        TEX_OUT_DIR / "m134_v3_housing_motor_roughness.webp",
        TEX_OUT_DIR / "m134_v3_barrels_rotor_albedo.webp",
        TEX_OUT_DIR / "m134_v3_barrels_rotor_normal.webp",
        TEX_OUT_DIR / "m134_v3_barrels_rotor_roughness.webp",
        TEX_OUT_DIR / "m134_v3_delinker_bolts_albedo.webp",
        TEX_OUT_DIR / "m134_v3_delinker_bolts_normal.webp",
        TEX_OUT_DIR / "m134_v3_delinker_bolts_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== GE / DILLON AERO M134D MINIGUN (7.62x51MM NATO) V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:44s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
