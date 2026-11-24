#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for FN SCAR-L Mk 16 Mod 0 (5.56x45mm NATO)
======================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 3)

Generates:
  - public/models/scar.glb (Draco-compressed glTF 2.0, all 25 solid parts; skips ONLY
    dynamic GPU-compressed helical spring `scar_recoil_spring` carrying `aSpringParam`)
  - public/textures/scar_v3_upper_{albedo,normal,roughness}.webp       (2048x2048 Packed ORM)
  - public/textures/scar_v3_fde_polymer_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/scar_v3_metal_{albedo,normal,roughness}.webp       (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 25 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/scar/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_scar_photoreal.py
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
# MODE 2: System Python Post-Process (FN Herstal Rollmarks, UID DataMatrix QR,
#         T-Rail Marks, S/1/A Enamel Selector, FDE STANAG Wear & 5-Ch ORM WebPs)
# Executed automatically via subprocess from Blender mode so zero extra scripts exist.
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
        return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055).astype(np.float32)

    def _rnm_blend(base_n_01: np.ndarray, detail_n_01: np.ndarray) -> np.ndarray:
        """Reoriented Normal Mapping (RNM) blending two OpenGL tangent-space normals in [0,1]."""
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
        ny = dy * strength  # row increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.6) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float):
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

    # Genuine 18x18 ECC200 DataMatrix for SOCOM MK 16 MOD 0 CAGE 3S679 / SN LC-28419
    _SCAR_UID_ROWS = (
        "101010101010101010",
        "110010001000000101",
        "101111011101111110",
        "111011110010101111",
        "100010101010101100",
        "101101101100011111",
        "110101110010111110",
        "110010110111111101",
        "110100001001000010",
        "110101110100110101",
        "100000110111011000",
        "100110100011000111",
        "110101010110100110",
        "101100011111011111",
        "100101101001001010",
        "100110101011100101",
        "110000011010000100",
        "111111111111111111",
    )

    def _draw_belgian_liege_perron(draw: ImageDraw.ImageDraw, cx: float, cy: float, h_px: float) -> None:
        """Authentic Belgian Proof House of Liege 'Perron' stepped column + 'CIP / PV' proofs."""
        lw = max(2, round(h_px * 0.075))
        for step, frac in enumerate((0.46, 0.34, 0.24)):
            y_s = cy + h_px * (0.44 - step * 0.11)
            draw.line([(cx - h_px * frac, y_s), (cx + h_px * frac, y_s)], fill=255, width=lw)
        draw.line([(cx, cy + h_px * 0.22), (cx, cy - h_px * 0.26)], fill=255, width=max(2, round(lw * 1.25)))
        r_orb = h_px * 0.10
        draw.ellipse((cx - r_orb, cy - h_px * 0.38, cx + r_orb, cy - h_px * 0.18), outline=255, width=lw)
        draw.line([(cx, cy - h_px * 0.50), (cx, cy - h_px * 0.36)], fill=255, width=lw)
        draw.line([(cx - h_px * 0.09, cy - h_px * 0.44), (cx + h_px * 0.09, cy - h_px * 0.44)], fill=255, width=lw)
        f_p = _load_font(FONT_COND, max(12, round(h_px * 0.36)))
        draw.text((cx + h_px * 0.54, cy - h_px * 0.18), "CIP", font=f_p, fill=255, anchor="lm")
        draw.text((cx + h_px * 0.54, cy + h_px * 0.22), "PV", font=f_p, fill=255, anchor="lm")

    def _draw_fn_oval_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float) -> None:
        """Authentic Fabrique Nationale Herstal double-bordered oval 'FN' trademark cartouche."""
        w_out = max(3, round(ry * 0.11))
        w_in = max(2, round(ry * 0.055))
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=255, width=w_out)
        draw.ellipse((cx - rx * 0.88, cy - ry * 0.84, cx + rx * 0.88, cy + ry * 0.84), outline=255, width=w_in)
        f_fn = _load_font(FONT_DIN, max(18, round(ry * 1.32)))
        draw.text((cx, cy + ry * 0.03), "FN", font=f_fn, fill=255, anchor="mm")

    def process_upper_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "upper_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "upper_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "upper_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "upper_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "upper_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "upper_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "upper_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero UV bands for Monolithic Upper Receiver rear slab (X in [-6.40, +5.60], Y in [0.35, 2.52]):
        #   Hero Band 1 (Left  Flank): u in [0.015, 0.985] (1 - xNorm: +X front -> u=0.015), v in [0.765, 0.985]
        #   Hero Band 2 (Right Flank): u in [0.015, 0.985] (xNorm:     -X rear  -> u=0.015), v in [0.530, 0.750]
        #   Hero Band 3 (Top M1913 Rail, X in [-6.35, +13.55]): u in [0.015, 0.985],         v in [0.460, 0.515]
        PPCM = 300.0
        X0, XSPAN = -6.40, 12.00
        Y0, YSPAN = 0.35, 2.17
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3600 x 651

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        dark_engrave = np.zeros((h, w), dtype=np.float32)
        uid_plate_bg = np.zeros((h, w), dtype=np.float32)
        white_laser = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT FLANK: Black/White UID DataMatrix QR Plate + FN Oval + FN HERSTAL BELGIUM MK 16 MOD 0 ---
        l_eng = Image.new("L", (CW, CH), 0)
        l_bg = Image.new("L", (CW, CH), 0)
        l_wht = Image.new("L", (CW, CH), 0)
        de_l = ImageDraw.Draw(l_eng)
        db_l = ImageDraw.Draw(l_bg)
        dw_l = ImageDraw.Draw(l_wht)

        # Clear hero zone: X in [-5.55, +3.70], Y in [0.52, 1.82]
        # Strictly below charging handle keyway (Y >= 1.88) and behind front crossbolt scallops (X >= 4.02)!
        # A) MIL-STD-130 Black/White UID DataMatrix QR Plate above forward magwell (X in [+1.55, +3.65], Y in [0.72, 1.66])
        ux0 = xw_to_cx_left(3.62)
        uy0 = yw_to_cy(1.64)
        ux1 = xw_to_cx_left(1.52)
        uy1 = yw_to_cy(0.72)
        db_l.rounded_rectangle((ux0, uy0, ux1, uy1), radius=14, fill=255)
        dw_l.rounded_rectangle((ux0 + 6, uy0 + 6, ux1 - 6, uy1 - 6), radius=10, outline=255, width=4)

        # 18x18 square ECC200 DataMatrix modules inside left half of UID plate
        plate_h = uy1 - uy0
        mod_px = max(8, (plate_h - 46) // 18)  # 12 px per module -> 216x216 px crisp square QR!
        dm_x0 = ux0 + 26
        dm_y0 = uy0 + (plate_h - 18 * mod_px) // 2
        for r_i, row_bits in enumerate(_SCAR_UID_ROWS):
            for c_i, bit in enumerate(row_bits):
                if bit == "1":
                    mx0 = dm_x0 + c_i * mod_px
                    my0 = dm_y0 + r_i * mod_px
                    dw_l.rectangle((mx0, my0, mx0 + mod_px - 1, my0 + mod_px - 1), fill=255)

        utx = dm_x0 + 18 * mod_px + 26
        dw_l.text((utx, uy0 + 36), "U.S. SOCOM", font=_load_font(FONT_DIN, 50), fill=255)
        dw_l.text((utx, uy0 + 104), "MK 16 MOD 0", font=_load_font(FONT_DIN, 48), fill=255)
        dw_l.text((utx, uy0 + 168), "CAGE  3S679", font=_load_font(FONT_COND, 44), fill=248)
        dw_l.text((utx, uy0 + 216), "SN  LC-28419", font=_load_font(FONT_COND, 42), fill=248)

        # B) FN Herstal Oval Cartouche + Razor-Crisp Laser Engraving + Belgian Liege Perron Proof
        # Spans X in [-5.55, +1.18] (right of UID plate on Left flank view!)
        fn_cx = xw_to_cx_left(0.64)
        fn_cy = yw_to_cy(1.22)
        _draw_fn_oval_emblem(de_l, fn_cx, fn_cy, rx=132.0, ry=84.0)

        tx_l = fn_cx + 168
        ty_top = yw_to_cy(1.68)
        f_hd = _load_font(FONT_DIN, 86)
        f_md = _load_font(FONT_DIN, 74)
        f_sm = _load_font(FONT_DIN, 60)

        de_l.text((tx_l, ty_top), "FN HERSTAL BELGIUM", font=f_hd, fill=255)
        de_l.text((tx_l, ty_top + 96), "MK 16 MOD 0   CAL. 5.56mm NATO", font=f_md, fill=255)
        de_l.text((tx_l, ty_top + 186), "SCAR-L     SN  LC-28419", font=f_sm, fill=248)

        # Liege Perron column + CIP/PV proof behind rollmark block
        _draw_belgian_liege_perron(de_l, xw_to_cx_left(-4.95), yw_to_cy(1.18), 156.0)

        _paste_uv_band(dark_engrave, l_eng, 0.015, 0.985, 0.765, 0.985)
        _paste_uv_band(uid_plate_bg, l_bg, 0.015, 0.985, 0.765, 0.985)
        _paste_uv_band(white_laser, l_wht, 0.015, 0.985, 0.765, 0.985)

        # --- 2) RIGHT FLANK: FN HERSTAL BELGIUM / 5.56x45mm NATO 1:7" CHF + Liege Proof + Brass Kiss ---
        r_eng = Image.new("L", (CW, CH), 0)
        r_kiss = Image.new("L", (CW, CH), 0)
        de_r = ImageDraw.Draw(r_eng)
        dk_r = ImageDraw.Draw(r_kiss)

        # Clear flat zone behind brass deflector (X in [-5.65, -0.80], Y in [0.65, 1.72])
        rx0 = xw_to_cx_right(-5.35)
        ry0 = yw_to_cy(1.62)
        de_r.text((rx0, ry0), "FN HERSTAL   BELGIUM", font=_load_font(FONT_DIN, 76), fill=255)
        de_r.text((rx0, ry0 + 92), '5.56x45mm NATO   1:7" CHF', font=_load_font(FONT_DIN, 64), fill=250)
        de_r.text((rx0, ry0 + 170), "US SOCOM   MK 16 MOD 0", font=_load_font(FONT_COND, 56), fill=242)
        _draw_belgian_liege_perron(de_r, xw_to_cx_right(-1.60), yw_to_cy(1.18), 144.0)

        # Delicate brass shell-mouth kiss marks tight behind ejection port lip (X in [0.46..0.72], Y in [0.84..1.54])
        rng_k = np.random.default_rng(1607)
        for _ in range(26):
            kx = float(xw_to_cx_right(float(rng_k.uniform(0.46, 0.70))))
            ky = float(yw_to_cy(float(rng_k.uniform(0.84, 1.54))))
            krx, kry = float(rng_k.uniform(4, 14)), float(rng_k.uniform(2, 7))
            dk_r.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(80, 210)))

        _paste_uv_band(dark_engrave, r_eng, 0.015, 0.985, 0.530, 0.750)
        _paste_uv_band(brass_kiss, r_kiss, 0.015, 0.985, 0.530, 0.750)

        # --- 3) MONOLITHIC TOP MIL-STD-1913 RAIL WHITE LASER T-NUMBERS (T2 .. T26) ---
        RW, RH = int(round(19.90 * 200.0)), int(round(0.96 * 200.0))  # 3980 x 192
        rail_las = Image.new("L", (RW, RH), 0)
        dl_rail = ImageDraw.Draw(rail_las)
        f_rail = _load_font(FONT_DIN, 50)
        # Matches exact lug positions in build_scar_upper_receiver:
        # 26 lugs spanning X in [-6.32, +13.54], lug centers at lx = -5.95 + i * 0.765 (i = 0..25)
        for idx_lug in range(1, 26, 2):
            lx = -5.95 + idx_lug * 0.765
            xn = (lx - (-6.35)) / 19.90
            rx_c = int(round(xn * RW))
            # Left flat top rail deck (z ~ -0.24 -> 25% down from top of rail canvas)
            dl_rail.text((rx_c, int(RH * 0.25)), f"T{idx_lug + 1}", font=f_rail, fill=255, anchor="mm")
        _paste_uv_band(white_laser, rail_las, 0.015, 0.985, 0.460, 0.515)

        # Subtle field-handling anodize micro-scratches on upper flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.765) & (v_grid <= 0.985)) | ((v_grid >= 0.530) & (v_grid <= 0.750))
        )).astype(np.float32)

        rng_s = np.random.default_rng(1608)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(110):
            sx = float(rng_s.uniform(0.02, 0.98) * w)
            sy = float(rng_s.uniform(0.02, 0.47) * h)
            length = float(rng_s.uniform(12, 58))
            ang = math.radians(float(rng_s.uniform(-16, 16)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng_s.integers(70, 185)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls
        _mix(albedo, (0.80, 0.79, 0.76), sc * 0.28)
        rgh -= sc * 0.055
        met = np.clip(met + sc * 0.10, 0.02, 0.98)

        # Composite brass shell kisses behind right ejection port
        brass_kiss = ndimage.gaussian_filter(brass_kiss, sigma=0.9)
        brass_kiss = _smoothstep(0.12, 0.56, brass_kiss)
        _mix(albedo, (0.76, 0.59, 0.24), brass_kiss * 0.52)
        _mix(rgh, 0.22, brass_kiss * 0.55)
        _mix(met, 0.94, brass_kiss * 0.65)

        # Composite MIL-STD-130 anodized black UID plate (slight raised aluminum tag with sharp border!)
        plate_bev = _bevel_mask(uid_plate_bg, width_px=2.2)
        _mix(albedo, (0.055, 0.058, 0.064), uid_plate_bg * 0.98)
        _mix(rgh, 0.34, uid_plate_bg * 0.95)
        _mix(met, 0.28, uid_plate_bg * 0.95)

        # Composite crisp dark laser engraving on champagne-bronze anodized upper (high contrast!)
        eng_bev = _bevel_mask(dark_engrave, width_px=1.3)
        _mix(albedo, (0.115, 0.095, 0.072), dark_engrave * 0.92)
        _mix(rgh, 0.46, dark_engrave * 0.86)
        _mix(met, 0.32, dark_engrave * 0.80)
        ao *= 1.0 - 0.14 * dark_engrave

        # Composite crisp bright white UID DataMatrix + white top-rail T-numbers (strictly dielectric white!)
        wht_bev = _bevel_mask(white_laser, width_px=1.0)
        _mix(albedo, (0.93, 0.93, 0.92), white_laser * 0.97)
        _mix(rgh, 0.38, white_laser * 0.92)
        _mix(met, 0.03, white_laser * 0.97)

        decal_height = 0.26 * plate_bev - 0.54 * eng_bev - 0.14 * wht_bev - 0.04 * sc
        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_upper_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_upper_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_upper_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved scar_v3_upper_{albedo,normal,roughness}.webp (2048x2048)")

    def process_fde_polymer_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "poly_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "poly_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "poly_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "poly_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "poly_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "poly_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "poly_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero UV bands for Polymer Lower Receiver flanks (X in [-5.65, +4.95], Y in [-2.38, +0.38]):
        #   Hero Band 1 (Lower Left  Flank): u in [0.015, 0.985] (1 - xNorm), v in [0.800, 0.985]
        #   Hero Band 2 (Lower Right Flank): u in [0.015, 0.985] (xNorm),     v in [0.600, 0.785]
        PPCM = 300.0
        X0, XSPAN = -5.65, 10.60
        Y0, YSPAN = -2.38, 2.76
        LW, LH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3180 x 828

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * LH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * LW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * LW))

        sel_white = np.zeros((h, w), dtype=np.float32)
        sel_red = np.zeros((h, w), dtype=np.float32)
        mold_mark = np.zeros((h, w), dtype=np.float32)

        f_sel = _load_font(FONT_DIN, 74)
        f_mold = _load_font(FONT_COND, 46)
        # Selector pivot CAD exact: (-3.45, -0.35), radius = 0.50 cm (150 px at 300 PPCM)
        sel_r = int(round(0.49 * PPCM))
        arc_r = int(round(0.31 * PPCM))

        for is_left in (True, False):
            w_im = Image.new("L", (LW, LH), 0)
            r_im = Image.new("L", (LW, LH), 0)
            m_im = Image.new("L", (LW, LH), 0)
            dw = ImageDraw.Draw(w_im)
            dr = ImageDraw.Draw(r_im)
            dm = ImageDraw.Draw(m_im)

            sx = xw_to_cx_left(-3.45) if is_left else xw_to_cx_right(-3.45)
            sy = yw_to_cy(-0.35)

            # Molded concentric recess ring around selector hub
            dm.arc((sx - arc_r, sy - arc_r, sx + arc_r, sy + arc_r), 165, 375, fill=240, width=7)

            # Authentic SCAR S (white) / 1 (vivid crimson) / A (vivid crimson) selector markings:
            # On Left flank: +X (muzzle) is LEFT -> 'S' at 9 o'clock, '1' at 12 o'clock, 'A' at 3 o'clock
            # On Right flank: +X (muzzle) is RIGHT -> 'A' at 9 o'clock, '1' at 12 o'clock, 'S' at 3 o'clock
            left_ch, right_ch = ("S", "A") if is_left else ("A", "S")
            entries = (
                (left_ch,  -sel_r - 20,  0,          -arc_r - 20,  0,          -arc_r - 5,  0),
                ("1",       0,          -sel_r - 22,  0,          -arc_r - 20,  0,         -arc_r - 5),
                (right_ch,  sel_r + 20,  0,           arc_r + 5,   0,           arc_r + 20, 0),
            )
            for ch, ox, oy, x0_t, y0_t, x1_t, y1_t in entries:
                tgt = dw if ch == "S" else dr
                tgt.text((sx + ox, sy + oy), ch, font=f_sel, fill=255, anchor="mm")
                tgt.line([(sx + x0_t, sy + y0_t), (sx + x1_t, sy + y1_t)], fill=255, width=8)

            # Subtle molded polymer inspection/part markings on flat open upper magwell wall
            if is_left:
                mx_c = xw_to_cx_left(3.15)
                my_c = yw_to_cy(-0.76)
                dm.text((mx_c, my_c), "FN  PA66-GF30", font=f_mold, fill=230, anchor="mm")
                dm.text((mx_c, my_c + 52), "5.56 NATO", font=_load_font(FONT_COND, 40), fill=210, anchor="mm")
            else:
                mx_c = xw_to_cx_right(3.25)
                my_c = yw_to_cy(-0.76)
                dm.text((mx_c, my_c), "FN HERSTAL", font=f_mold, fill=230, anchor="mm")
                dm.text((mx_c, my_c + 52), "MK 16 LOWER", font=_load_font(FONT_COND, 40), fill=210, anchor="mm")

            v0_b, v1_b = (0.800, 0.985) if is_left else (0.600, 0.785)
            _paste_uv_band(sel_white, w_im, 0.015, 0.985, v0_b, v1_b)
            _paste_uv_band(sel_red, r_im, 0.015, 0.985, v0_b, v1_b)
            _paste_uv_band(mold_mark, m_im, 0.015, 0.985, v0_b, v1_b)

        # Subtle handling sheen around cross-pins on lower flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        lower_walls = ((u_grid >= 0.015) & (u_grid <= 0.985) & (
            ((v_grid >= 0.800) & (v_grid <= 0.985)) | ((v_grid >= 0.600) & (v_grid <= 0.785))
        )).astype(np.float32)

        for px_cm, py_cm, rad_cm in (
            (-3.45, -0.35, 0.34),
            (-1.75, -0.42, 0.18),
            (-0.35, -0.08, 0.18),
            (-5.20,  0.14, 0.22),
            ( 4.65,  0.14, 0.22),
        ):
            xn = (px_cm - X0) / XSPAN
            yn = (py_cm - Y0) / YSPAN
            for ux, vy in (
                (0.015 + (1.0 - xn) * 0.970, 0.800 + yn * 0.185),
                (0.015 + xn * 0.970,         0.600 + yn * 0.185),
            ):
                dx_cm = (u_grid - ux) * (XSPAN / 0.970)
                dy_cm = (v_grid - vy) * (YSPAN / 0.185)
                halo = np.exp(-(dx_cm * dx_cm + dy_cm * dy_cm) / (rad_cm * rad_cm)) * lower_walls
                rgh -= halo * 0.065

        # Composite recessed molded markings + vivid enamel-filled S (white) & 1/A (crimson red)
        w_bev = _bevel_mask(sel_white, width_px=1.5)
        r_bev = _bevel_mask(sel_red, width_px=1.5)
        m_bev = _bevel_mask(mold_mark, width_px=1.3)

        decal_height = -0.58 * np.maximum(w_bev, r_bev) - 0.34 * m_bev
        # Crisp white enamel 'S'
        _mix(albedo, (0.94, 0.93, 0.90), sel_white * 0.96)
        _mix(rgh, 0.30, sel_white * 0.92)
        _mix(met, 0.00, sel_white * 0.98)
        # Vivid crimson-red enamel '1' and 'A'
        _mix(albedo, (0.84, 0.055, 0.045), sel_red * 0.97)
        _mix(rgh, 0.26, sel_red * 0.92)
        _mix(met, 0.00, sel_red * 0.98)
        # Subtle darker recessed mold text in coyote polymer
        _mix(albedo, (0.39, 0.31, 0.21), mold_mark * 0.45)
        ao *= 1.0 - 0.12 * np.maximum(sel_white, sel_red) - 0.10 * mold_mark

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.18, 0.95)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_fde_polymer_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_fde_polymer_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_fde_polymer_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved scar_v3_fde_polymer_{albedo,normal,roughness}.webp (2048x2048)")

    def process_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Hero STANAG 30-Rd FDE-Coated Steel Magazine Flanks in scar_v3_metal:
        #   Right Flank: u in [0.015, 0.185], v in [0.015, 0.985] (v=0.015 bottom -> v=0.985 top)
        #   Left  Flank: u in [0.200, 0.370], v in [0.015, 0.985]
        mw, mh = 828, 3045  # 2.76 cm x 10.15 cm at 300 PPCM (exact 1:1 world aspect!)
        mag_stamp = np.zeros((h, w), dtype=np.float32)
        mag_spots = np.zeros((h, w), dtype=np.float32)

        # Spot-weld dimples along front/rear stamped steel flanges
        spot_canvas = Image.new("L", (mw, mh), 0)
        dsp = ImageDraw.Draw(spot_canvas)
        for y_frac in (0.14, 0.27, 0.40, 0.53, 0.66, 0.79, 0.91):
            cy = int(y_frac * mh)
            for x_frac in (0.075, 0.925):
                cx = int(x_frac * mw)
                dsp.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=255)

        # Lower skirt rollmark cleanly BELOW the 4th anti-crush rib (y_local=-6.25 -> y_frac=0.867)
        # and ABOVE the Ranger floorplate collar (y_local=-7.40 -> y_frac=0.980): place at y_frac in [0.905..0.955]!
        stamp_canvas = Image.new("L", (mw, mh), 0)
        dst = ImageDraw.Draw(stamp_canvas)
        dst.text((mw // 2, int(mh * 0.912)), "FN   5.56x45mm   30RD", font=_load_font(FONT_COND, 68), fill=255, anchor="mm")
        dst.text((mw // 2, int(mh * 0.946)), "FN HERSTAL - CAGE 3S679", font=_load_font(FONT_COND, 50), fill=242, anchor="mm")

        for pu0, pu1 in ((0.015, 0.185), (0.200, 0.370)):
            _paste_uv_band(mag_spots, spot_canvas, pu0, pu1, 0.015, 0.985)
            _paste_uv_band(mag_stamp, stamp_canvas, pu0, pu1, 0.015, 0.985)

        # Authentic feathered vertical magwell insertion scuffs exposing bare steel on upper straight tower
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        in_mag_u = (((u_grid >= 0.015) & (u_grid <= 0.185)) | ((u_grid >= 0.200) & (u_grid <= 0.370))).astype(np.float32)
        insert_mask = in_mag_u * _smoothstep(0.600, 0.740, v_grid) * (1.0 - _smoothstep(0.965, 0.985, v_grid))

        rng_m = np.random.default_rng(1620)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(520):
            sx = float(rng_m.uniform(0.018, 0.368) * w)
            sy = float(rng_m.uniform(0.020, 0.360) * h)
            length = float(rng_m.uniform(16, 128))
            dsc.line([(sx, sy), (sx + float(rng_m.uniform(-2.2, 2.2)), sy + length)],
                     fill=int(rng_m.integers(75, 225)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * insert_mask

        spot_bev = _bevel_mask(mag_spots, width_px=2.4)
        stamp_bev = _bevel_mask(mag_stamp, width_px=1.3)

        decal_height = -0.34 * spot_bev - 0.56 * stamp_bev - 0.06 * scuffs
        _mix(albedo, (0.72, 0.74, 0.77), scuffs * 0.62)
        _mix(rgh, 0.21, scuffs * 0.70)
        _mix(met, 0.95, scuffs * 0.76)

        _mix(albedo, (0.20, 0.175, 0.125), mag_stamp * 0.78)
        _mix(rgh, 0.48, mag_stamp * 0.70)
        ao *= 1.0 - 0.16 * mag_stamp - 0.12 * mag_spots

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.11, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "scar_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved scar_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_upper_atlas()
    process_fde_polymer_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "scar.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 28
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 25 solid FN SCAR-L Mk 16 Mod 0 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY dynamic GPU-compressed helical spring `scar_recoil_spring`!)
UPPER_PARTS = [
    "scar_upper_receiver",
    "scar_rear_sight",
    "scar_barrel_crossbolts",
]

FDE_POLYMER_PARTS = [
    "scar_lower_receiver",
    "scar_pistol_grip",
    "scar_buttstock",
    "scar_cheek_riser",
    "scar_buttpad",
    "scar_selector",
    "scar_mag_follower",
    "scar_mag_floorplate",
]

METAL_PARTS = [
    "scar_barrel",
    "scar_flash_suppressor",
    "scar_gas_block",
    "scar_gas_piston",
    "scar_bolt_carrier",
    "scar_charging_handle",
    "scar_bolt",
    "scar_firing_pin",
    "scar_recoil_rod",
    "scar_hammer",
    "scar_trigger",
    "scar_disconnector",
    "scar_mag_body",
    "scar_mag_spring",
]

# Exterior assembled parts receiving inter-part contact AO (internal/sliding parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "scar_upper_receiver",
    "scar_rear_sight",
    "scar_barrel_crossbolts",
    "scar_lower_receiver",
    "scar_pistol_grip",
    "scar_buttstock",
    "scar_cheek_riser",
    "scar_buttpad",
    "scar_barrel",
    "scar_flash_suppressor",
    "scar_gas_block",
    "scar_mag_body",
    "scar_mag_floorplate",
}

ASSEMBLED_POS = {
    "scar_upper_receiver":    (  0.000,  0.000, 0.000),
    "scar_rear_sight":        ( -5.150,  3.120, 0.000),
    "scar_barrel_crossbolts": (  5.100,  0.920, 0.000),
    "scar_lower_receiver":    (  0.000,  0.000, 0.000),
    "scar_pistol_grip":       ( -3.050, -0.880, 0.000),
    "scar_buttstock":         (-12.200,  0.850, 0.000),
    "scar_cheek_riser":       (-12.150,  2.480, 0.000),
    "scar_buttpad":           (-17.950,  0.050, 0.000),
    "scar_selector":          ( -3.450, -0.350, 0.000),
    "scar_mag_follower":      (  2.847, -7.750, 0.000),
    "scar_mag_floorplate":    (  3.170, -9.400, 0.000),
    "scar_barrel":            (  0.000,  1.050, 0.000),
    "scar_flash_suppressor":  ( 22.950,  1.050, 0.000),
    "scar_gas_block":         ( 14.700,  1.050, 0.000),
    "scar_gas_piston":        ( 12.350,  2.120, 0.000),
    "scar_bolt_carrier":      (  2.450,  1.580, 0.000),
    "scar_charging_handle":   (  4.100,  2.120, 0.000),
    "scar_bolt":              (  2.950,  1.050, 0.000),
    "scar_firing_pin":        (  1.550,  1.050, 0.000),
    "scar_recoil_rod":        ( -6.150,  2.150, 0.000),
    "scar_hammer":            ( -0.350, -0.080, 0.000),
    "scar_trigger":           ( -1.750, -0.420, 0.000),
    "scar_disconnector":      ( -1.850, -0.240, 0.000),
    "scar_mag_body":          (  2.450, -1.800, 0.000),
    "scar_mag_spring":        (  2.450, -1.800, 0.000),
}

ASSEMBLED_ROT_THREE = {
    "scar_mag_follower":   (0.0, 0.0, 0.15),
    "scar_mag_floorplate": (0.0, 0.0, 0.15),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) extracted from src/weapons/scar/meshes/*.ts
CSG_REF_BBOX = {
    "scar_upper_receiver":    ((-6.425,  0.010, -1.105), (13.625,  3.110,  1.194)),
    "scar_rear_sight":        ((-0.730, -0.080, -0.650), ( 0.730,  0.897,  0.690)),
    "scar_barrel_crossbolts": ((-1.090, -0.580, -0.945), ( 1.090,  0.380,  0.945)),
    "scar_lower_receiver":    ((-5.650, -2.380, -1.000), ( 4.950,  0.460,  0.980)),
    "scar_pistol_grip":       ((-3.765, -4.913, -0.680), ( 0.395,  0.220,  0.680)),
    "scar_buttstock":         ((-5.710, -3.320, -1.060), ( 6.000,  1.670,  0.950)),
    "scar_cheek_riser":       ((-4.218, -0.774, -0.830), ( 3.904,  0.725,  0.890)),
    "scar_buttpad":           ((-0.603, -2.511, -0.760), ( 0.229,  2.392,  0.760)),
    "scar_selector":          ((-1.011, -0.270, -1.020), ( 0.266,  0.670,  1.020)),
    "scar_mag_follower":      ((-1.180, -1.030, -0.410), ( 1.120,  0.417,  0.410)),
    "scar_mag_floorplate":    ((-1.480, -1.160, -0.660), ( 1.480,  0.200,  0.660)),
    "scar_barrel":            (( 3.328, -0.685, -0.685), (22.850,  0.685,  0.685)),
    "scar_flash_suppressor":  ((-0.880, -0.587, -0.587), ( 1.550,  0.587,  0.587)),
    "scar_gas_block":         ((-1.180, -0.950, -0.660), ( 1.870,  3.137,  0.660)),
    "scar_gas_piston":        ((-2.500, -0.395, -0.395), ( 2.450,  0.395,  0.395)),
    "scar_bolt_carrier":      ((-3.600, -0.800, -0.630), ( 7.425,  1.056,  0.630)),
    "scar_charging_handle":   ((-0.270, -0.257, -0.660), ( 0.270,  0.257,  1.833)),
    "scar_bolt":              ((-1.370, -0.525, -0.525), ( 1.520,  0.840,  0.510)),
    "scar_firing_pin":        ((-1.450, -0.215, -0.590), ( 2.876,  0.215,  0.590)),
    "scar_recoil_rod":        ((-0.390, -1.780, -0.840), ( 8.440,  0.660,  0.840)),
    "scar_hammer":            ((-1.154, -0.444, -0.522), ( 0.342,  0.342,  0.522)),
    "scar_trigger":           ((-0.900, -1.506, -0.504), ( 1.397,  0.340,  0.504)),
    "scar_disconnector":      ((-0.500, -0.460, -0.118), ( 0.600,  0.585,  0.118)),
    "scar_mag_body":          ((-1.490, -7.863, -0.620), ( 2.135,  2.718,  0.620)),
    "scar_mag_spring":        ((-0.310, -7.541, -0.336), ( 1.457, -6.073,  0.336)),
}


# =============================================================================
# Scene & Physically Calibrated "Fifty Shades of FDE" Material Library (Cycles GPU)
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
    edge_srgb: tuple[float, float, float] = (0.76, 0.78, 0.82),
    grain_scale: float = 42.0,
    grain_bump: float = 0.032,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
    rough_var: float = 0.045,
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
    n_macro.inputs["Scale"].default_value = 2.50
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.55
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.0
    n_micro.inputs["Roughness"].default_value = 0.62
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    bump_height_sock = n_micro.outputs["Fac"]
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
        bump_height_sock = mix_g.outputs[0]

    base_col_a = srgb_to_lin(*base_srgb)
    base_col_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.045),
        min(1.0, base_srgb[1] * 1.045),
        min(1.0, base_srgb[2] * 1.045),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_col_a
    mix_base.inputs[7].default_value = base_col_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])

    col_sock = mix_base.outputs[2]
    rgh_val_node = nt.nodes.new("ShaderNodeMapRange")
    rgh_val_node.inputs["From Min"].default_value = 0.25
    rgh_val_node.inputs["From Max"].default_value = 0.75
    rgh_val_node.inputs["To Min"].default_value = max(0.08, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        # Tight Cycles inside-AO convex edge curvature mask (replaces noisy vertex-density Pointiness!)
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.044

        inv_ao = nt.nodes.new("ShaderNodeMath")
        inv_ao.operation = "SUBTRACT"
        inv_ao.inputs[0].default_value = 1.0
        nt.links.new(ao_edge.outputs["AO"], inv_ao.inputs[1])

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

        mix_edge_c = nt.nodes.new("ShaderNodeMix")
        mix_edge_c.data_type = "RGBA"
        mix_edge_c.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_edge_c.inputs[0])
        nt.links.new(col_sock, mix_edge_c.inputs[6])
        col_sock = mix_edge_c.outputs[2]

        mix_edge_r = nt.nodes.new("ShaderNodeMix")
        mix_edge_r.data_type = "FLOAT"
        mix_edge_r.inputs[3].default_value = max(0.15, roughness - 0.16)
        nt.links.new(mul_w.outputs["Value"], mix_edge_r.inputs[0])
        nt.links.new(rgh_sock, mix_edge_r.inputs[2])
        rgh_sock = mix_edge_r.outputs[0]

        if metallic > 0.35:
            mix_edge_m = nt.nodes.new("ShaderNodeMix")
            mix_edge_m.data_type = "FLOAT"
            mix_edge_m.inputs[3].default_value = 0.96
            nt.links.new(mul_w.outputs["Value"], mix_edge_m.inputs[0])
            nt.links.new(met_sock, mix_edge_m.inputs[2])
            met_sock = mix_edge_m.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.018
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_scar_deflector_mat() -> bpy.types.Material:
    """SCAR satin charcoal-black anodized brass deflector with crisp subtle golden-brass
    case-mouth transfer streaks along its angled forward ramp (X in [-0.04, +0.48])."""
    mat = _build_pbr_mat(
        "U_BrassDeflector",
        base_srgb=(0.176, 0.184, 0.198),
        roughness=0.36,
        metallic=0.78,
        bevel_r=0.028,
        edge_wear=0.22,
        edge_srgb=(0.36, 0.37, 0.40),
        grain_scale=68.0,
        grain_bump=0.036,
        voronoi_grain=0.42,
        voronoi_scale=88.0,
        rough_var=0.032,
    )
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = next(n for n in nt.nodes if n.type == "TEX_COORD")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Forward deflector ramp sits at local X in [+0.02, +0.48]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 0.04
    mr_x.inputs["From Max"].default_value = 0.44
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    # Fine anisotropic brass witness scuffs (never blobby camo)
    mp_k = nt.nodes.new("ShaderNodeMapping")
    mp_k.inputs["Scale"].default_value = (1.6, 5.5, 4.2)
    nt.links.new(texcoord.outputs["Object"], mp_k.inputs["Vector"])

    n_kiss = nt.nodes.new("ShaderNodeTexNoise")
    n_kiss.inputs["Scale"].default_value = 11.0
    n_kiss.inputs["Detail"].default_value = 6.0
    n_kiss.inputs["Roughness"].default_value = 0.65
    nt.links.new(mp_k.outputs["Vector"], n_kiss.inputs["Vector"])

    ramp_k = nt.nodes.new("ShaderNodeValToRGB")
    ramp_k.color_ramp.elements[0].position = 0.56
    ramp_k.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp_k.color_ramp.elements[1].position = 0.78
    ramp_k.color_ramp.elements[1].color = (0.54, 0.54, 0.54, 1.0)
    nt.links.new(n_kiss.outputs["Fac"], ramp_k.inputs["Fac"])

    mul_k = nt.nodes.new("ShaderNodeMath")
    mul_k.operation = "MULTIPLY"
    nt.links.new(mr_x.outputs["Result"], mul_k.inputs[0])
    nt.links.new(ramp_k.outputs["Color"], mul_k.inputs[1])

    orig_col = bsdf.inputs["Base Color"].links[0].from_socket
    orig_rgh = bsdf.inputs["Roughness"].links[0].from_socket
    orig_met = bsdf.inputs["Metallic"].links[0].from_socket

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[7].default_value = srgb_to_lin(0.76, 0.60, 0.24)
    nt.links.new(mul_k.outputs["Value"], mix_c.inputs[0])
    nt.links.new(orig_col, mix_c.inputs[6])
    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])

    mix_r = nt.nodes.new("ShaderNodeMix")
    mix_r.data_type = "FLOAT"
    mix_r.inputs[3].default_value = 0.24
    nt.links.new(mul_k.outputs["Value"], mix_r.inputs[0])
    nt.links.new(orig_rgh, mix_r.inputs[2])
    nt.links.new(mix_r.outputs[0], bsdf.inputs["Roughness"])

    mix_m = nt.nodes.new("ShaderNodeMix")
    mix_m.data_type = "FLOAT"
    mix_m.inputs[3].default_value = 0.94
    nt.links.new(mul_k.outputs["Value"], mix_m.inputs[0])
    nt.links.new(orig_met, mix_m.inputs[2])
    nt.links.new(mix_m.outputs[0], bsdf.inputs["Metallic"])
    return mat


def _build_3prong_flash_mat() -> bpy.types.Material:
    """3-Prong PWS/AAC/FN Flash Suppressor: dark satin phosphate ratchet -> subtle bronze/blue
    heat temper along open tuning-fork tines -> velvety carbon crown soot at muzzle tips."""
    mat = bpy.data.materials.new("M_FlashSuppressor3Prong")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Normalize local X along [-0.88 .. +1.55] -> [0 .. 1]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = -0.88
    mr_x.inputs["From Max"].default_value = 1.55
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 4.6
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.66
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    add_n = nt.nodes.new("ShaderNodeMath")
    add_n.operation = "MULTIPLY_ADD"
    add_n.inputs[1].default_value = 0.20
    nt.links.new(n_soot.outputs["Fac"], add_n.inputs[0])
    nt.links.new(mr_x.outputs["Result"], add_n.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.175, 0.182, 0.194)
    cr.elements[1].position = 0.40
    cr.elements[1].color = srgb_to_lin(0.188, 0.194, 0.206)
    for pos, rgb in (
        (0.56, (0.35, 0.25, 0.148)),    # rich bronze exhaust heat temper
        (0.72, (0.165, 0.198, 0.285)),  # faint violet-blue thermal sheen
        (0.89, (0.068, 0.066, 0.068)),  # matte gunpowder carbon fouling at prong crown
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_n.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.46
    rr.elements[0].color = (0.26, 0.26, 0.26, 1.0)
    rr.elements[1].position = 0.92
    rr.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.72
    rm.elements[0].color = (0.89, 0.89, 0.89, 1.0)
    rm.elements[1].position = 0.95
    rm.elements[1].color = (0.14, 0.14, 0.14, 1.0)
    nt.links.new(add_n.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.022
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.042
    bump.inputs["Distance"].default_value = 0.018
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_chrome_piston_mat() -> bpy.types.Material:
    """Gleaming mirror-chrome stainless short-stroke piston tappet with realistic dark carbon
    impingement only on the cupped front high-pressure gas head (local X > +2.05)."""
    mat = bpy.data.materials.new("M_ChromePiston")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Local X in [1.95 .. 2.45] transitions mirror chrome -> subtle straw -> front carbon cup
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 1.92
    mr_x.inputs["From Max"].default_value = 2.45
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_carb = nt.nodes.new("ShaderNodeTexNoise")
    n_carb.inputs["Scale"].default_value = 6.5
    n_carb.inputs["Detail"].default_value = 5.0
    nt.links.new(texcoord.outputs["Object"], n_carb.inputs["Vector"])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.84, 0.87, 0.90)
    cr.elements[1].position = 0.55
    cr.elements[1].color = srgb_to_lin(0.82, 0.84, 0.87)
    for pos, rgb in (
        (0.76, (0.58, 0.50, 0.36)),  # straw heat tint behind gas cup
        (0.95, (0.14, 0.135, 0.130)),  # carbon deposit inside front gas cup
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr_x.outputs["Result"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.55
    rr.elements[0].color = (0.13, 0.13, 0.13, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.68, 0.68, 0.68, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.72
    rm.elements[0].color = (0.98, 0.98, 0.98, 1.0)
    rm.elements[1].position = 0.98
    rm.elements[1].color = (0.34, 0.34, 0.34, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.016
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.018
    bump.inputs["Distance"].default_value = 0.014
    nt.links.new(n_carb.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_a2_black_checkering_mat() -> bpy.types.Material:
    """Crisp black SOCOM A2 grip diamond pyramid checkering (20-LPI crisp tactile facets)."""
    mat = bpy.data.materials.new("P_A2BlackCheckering")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    mp1 = nt.nodes.new("ShaderNodeMapping")
    mp1.inputs["Rotation"].default_value = (0.0, math.radians(45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], mp1.inputs["Vector"])

    mp2 = nt.nodes.new("ShaderNodeMapping")
    mp2.inputs["Rotation"].default_value = (0.0, math.radians(-45.0), 0.0)
    nt.links.new(texcoord.outputs["Object"], mp2.inputs["Vector"])

    w1 = nt.nodes.new("ShaderNodeTexWave")
    w1.wave_type = "BANDS"
    w1.bands_direction = "X"
    w1.wave_profile = "TRI"
    w1.inputs["Scale"].default_value = 5.4
    nt.links.new(mp1.outputs["Vector"], w1.inputs["Vector"])

    w2 = nt.nodes.new("ShaderNodeTexWave")
    w2.wave_type = "BANDS"
    w2.bands_direction = "X"
    w2.wave_profile = "TRI"
    w2.inputs["Scale"].default_value = 5.4
    nt.links.new(mp2.outputs["Vector"], w2.inputs["Vector"])

    pyr = nt.nodes.new("ShaderNodeMath")
    pyr.operation = "MINIMUM"
    nt.links.new(w1.outputs["Fac"], pyr.inputs[0])
    nt.links.new(w2.outputs["Fac"], pyr.inputs[1])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.088, 0.092, 0.098)
    mix_c.inputs[7].default_value = srgb_to_lin(0.155, 0.160, 0.170)
    nt.links.new(pyr.outputs["Value"], mix_c.inputs[0])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.78
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.016
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.42
    bump.inputs["Distance"].default_value = 0.026
    nt.links.new(pyr.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: MONOLITHIC EXTRUDED UPPER (`scar_v3_upper`) ---
        # Authentic FN Gold-Bronze / Champagne Tan Type III Hard-Anodized 6061/7075 Aluminum!
        # Calibrated for true FN "50 Shades of FDE" metallic gold-tan luminance vs matte coyote lower!
        "U_ChampagneAnodize": _build_pbr_mat(
            "U_ChampagneAnodize",
            base_srgb=(0.658, 0.542, 0.348),
            roughness=0.275,
            metallic=0.88,
            bevel_r=0.030,
            edge_wear=0.22,
            edge_srgb=(0.86, 0.80, 0.66),
            grain_scale=68.0,
            grain_bump=0.024,
            aniso_stretch=(0.38, 3.2, 3.2),
            voronoi_grain=0.35,
            voronoi_scale=92.0,
            rough_var=0.030,
        ),
        "U_RailCrestFDE": _build_pbr_mat(
            "U_RailCrestFDE",
            base_srgb=(0.704, 0.592, 0.402),
            roughness=0.235,
            metallic=0.90,
            bevel_r=0.020,
            edge_wear=0.36,
            edge_srgb=(0.88, 0.84, 0.74),
            grain_scale=40.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.026,
        ),
        "U_RailSlotFDE": _build_pbr_mat(
            "U_RailSlotFDE",
            base_srgb=(0.428, 0.338, 0.210),
            roughness=0.39,
            metallic=0.80,
            bevel_r=0.015,
            grain_scale=44.0,
            grain_bump=0.024,
            rough_var=0.028,
        ),
        "U_SideRailDark": _build_pbr_mat(
            "U_SideRailDark",
            base_srgb=(0.194, 0.204, 0.218),
            roughness=0.29,
            metallic=0.85,
            bevel_r=0.020,
            edge_wear=0.34,
            edge_srgb=(0.68, 0.71, 0.76),
            grain_scale=48.0,
            grain_bump=0.026,
            aniso_stretch=(0.50, 2.8, 2.8),
            rough_var=0.030,
        ),
        "U_BrassDeflector": _build_scar_deflector_mat(),
        "U_InnerDark": _build_pbr_mat(
            "U_InnerDark",
            base_srgb=(0.175, 0.148, 0.112),
            roughness=0.48,
            metallic=0.72,
            bevel_r=0.016,
            grain_scale=38.0,
            grain_bump=0.025,
            rough_var=0.030,
        ),
        "U_DarkSteel": _build_pbr_mat(
            "U_DarkSteel",
            base_srgb=(0.196, 0.206, 0.222),
            roughness=0.28,
            metallic=0.89,
            bevel_r=0.024,
            edge_wear=0.34,
            edge_srgb=(0.72, 0.75, 0.80),
            grain_scale=52.0,
            grain_bump=0.030,
            voronoi_grain=0.40,
            voronoi_scale=78.0,
            rough_var=0.032,
        ),
        "U_SightDrum": _build_pbr_mat(
            "U_SightDrum",
            base_srgb=(0.242, 0.254, 0.272),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.018,
            edge_wear=0.36,
            edge_srgb=(0.78, 0.80, 0.85),
            grain_scale=36.0,
            grain_bump=0.022,
            rough_var=0.026,
        ),
        "U_BrightSteel": _build_pbr_mat(
            "U_BrightSteel",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.20,
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.022,
        ),

        # --- SUITE 2: FDE POLYMER LOWER, UGG-BOOT STOCK, GRIP & FOLLOWER (`scar_v3_fde_polymer`) ---
        # Darker Earthy Matte Coyote-Brown Glass-Filled Polyamide (strictly M=0.00 — clear contrast vs metallic upper!)
        "P_LowerCoyote": _build_pbr_mat(
            "P_LowerCoyote",
            base_srgb=(0.432, 0.348, 0.236),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.12,
            edge_srgb=(0.54, 0.45, 0.33),
            grain_scale=74.0,
            grain_bump=0.088,
            voronoi_grain=0.68,
            voronoi_scale=96.0,
            rough_var=0.038,
        ),
        # Iconic "Ugg-Boot" Buttstock: distinctly lighter Desert-Khaki / Sand-Tan polymer shade!
        "P_StockTan": _build_pbr_mat(
            "P_StockTan",
            base_srgb=(0.562, 0.478, 0.342),
            roughness=0.60,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.12,
            edge_srgb=(0.66, 0.58, 0.44),
            grain_scale=68.0,
            grain_bump=0.078,
            voronoi_grain=0.62,
            voronoi_scale=90.0,
            rough_var=0.036,
        ),
        # Deep Earthy Coyote Polymer Strut / Hinge Block / Ranger Floorplate collar!
        "P_CoyoteDark": _build_pbr_mat(
            "P_CoyoteDark",
            base_srgb=(0.372, 0.298, 0.202),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.10,
            edge_srgb=(0.48, 0.40, 0.29),
            grain_scale=70.0,
            grain_bump=0.084,
            voronoi_grain=0.64,
            voronoi_scale=92.0,
            rough_var=0.036,
        ),
        # Adjustable Cheek Riser: lightest Pale Desert-Sand polymer shade in "50 Shades of FDE"!
        "P_CheekRiserSand": _build_pbr_mat(
            "P_CheekRiserSand",
            base_srgb=(0.638, 0.550, 0.404),
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.10,
            edge_srgb=(0.74, 0.66, 0.52),
            grain_scale=62.0,
            grain_bump=0.064,
            voronoi_grain=0.55,
            voronoi_scale=84.0,
            rough_var=0.034,
        ),
        # Ranger Plate overmolded rubberized coyote finger pull-loop
        "P_RangerRubberTan": _build_pbr_mat(
            "P_RangerRubberTan",
            base_srgb=(0.355, 0.285, 0.194),
            roughness=0.80,
            metallic=0.00,
            bevel_r=0.034,
            grain_scale=62.0,
            grain_bump=0.082,
            voronoi_grain=0.60,
            voronoi_scale=86.0,
            rough_var=0.034,
        ),
        # Crisp Charcoal-Black SOCOM A2 Pistol Grip & Selector Levers
        "P_BlackPolymer": _build_pbr_mat(
            "P_BlackPolymer",
            base_srgb=(0.146, 0.152, 0.162),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.06,
            edge_srgb=(0.205, 0.212, 0.224),
            grain_scale=68.0,
            grain_bump=0.088,
            voronoi_grain=0.66,
            voronoi_scale=92.0,
            rough_var=0.038,
        ),
        "P_A2BlackCheckering": _build_a2_black_checkering_mat(),
        # Matte Charcoal-Black Textured Sorbothane Recoil Buttpad & Impact Ribs
        "P_RubberBlack": _build_pbr_mat(
            "P_RubberBlack",
            base_srgb=(0.106, 0.110, 0.118),
            roughness=0.86,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.08,
            edge_srgb=(0.17, 0.176, 0.186),
            grain_scale=58.0,
            grain_bump=0.084,
            rough_var=0.034,
        ),
        # Firewalled High-Visibility Safety-Orange Anti-Tilt Magazine Follower (strictly isolated UV box!)
        "P_FollowerOrange": _build_pbr_mat(
            "P_FollowerOrange",
            base_srgb=(0.90, 0.36, 0.07),
            roughness=0.42,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.12,
            edge_srgb=(0.96, 0.54, 0.26),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.034,
        ),
        "P_SteelHardware": _build_pbr_mat(
            "P_SteelHardware",
            base_srgb=(0.198, 0.208, 0.222),
            roughness=0.27,
            metallic=0.89,
            bevel_r=0.022,
            edge_wear=0.34,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=46.0,
            grain_bump=0.028,
            rough_var=0.032,
        ),
        "P_BrightSteel": _build_pbr_mat(
            "P_BrightSteel",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.018,
            grain_scale=28.0,
            grain_bump=0.018,
            rough_var=0.022,
        ),

        # --- SUITE 3: BARREL, GAS SYSTEM, MONOLITHIC BCG, FCG & STANAG MAG (`scar_v3_metal`) ---
        "M_PhosphateBarrel": _build_pbr_mat(
            "M_PhosphateBarrel",
            base_srgb=(0.194, 0.204, 0.218),
            roughness=0.275,
            metallic=0.89,
            bevel_r=0.024,
            edge_wear=0.30,
            edge_srgb=(0.72, 0.75, 0.80),
            grain_scale=44.0,
            grain_bump=0.030,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.030,
        ),
        "M_FlashSuppressor3Prong": _build_3prong_flash_mat(),
        "M_GasBlockSteel": _build_pbr_mat(
            "M_GasBlockSteel",
            base_srgb=(0.204, 0.214, 0.228),
            roughness=0.31,
            metallic=0.87,
            bevel_r=0.028,
            edge_wear=0.34,
            edge_srgb=(0.74, 0.77, 0.82),
            grain_scale=68.0,
            grain_bump=0.044,
            voronoi_grain=0.52,
            voronoi_scale=90.0,
            rough_var=0.034,
        ),
        "M_GasRegulatorHeat": _build_pbr_mat(
            "M_GasRegulatorHeat",
            base_srgb=(0.45, 0.415, 0.365),
            roughness=0.24,
            metallic=0.92,
            bevel_r=0.020,
            edge_wear=0.30,
            edge_srgb=(0.82, 0.80, 0.76),
            grain_scale=38.0,
            grain_bump=0.024,
            aniso_stretch=(3.5, 0.5, 0.5),
            rough_var=0.030,
        ),
        "M_ChromePiston": _build_chrome_piston_mat(),
        # Heavy billet machined monolithic bolt carrier: dark manganese nitride + polished CNC wear rails!
        "M_MonolithicCarrier": _build_pbr_mat(
            "M_MonolithicCarrier",
            base_srgb=(0.198, 0.208, 0.224),
            roughness=0.23,
            metallic=0.92,
            bevel_r=0.026,
            edge_wear=0.44,
            edge_srgb=(0.82, 0.84, 0.88),
            grain_scale=28.0,
            grain_bump=0.024,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.030,
        ),
        # Polished bare-steel carrier guide wear rails & hardened piston impact anvil
        "M_CarrierWearRail": _build_pbr_mat(
            "M_CarrierWearRail",
            base_srgb=(0.74, 0.77, 0.81),
            roughness=0.17,
            metallic=0.97,
            bevel_r=0.018,
            grain_scale=24.0,
            grain_bump=0.016,
            aniso_stretch=(0.25, 4.0, 4.0),
            rough_var=0.022,
        ),
        # Bright chrome 7-lug rotating bolt & full-length stainless firing pin
        "M_ChromeBolt": _build_pbr_mat(
            "M_ChromeBolt",
            base_srgb=(0.81, 0.84, 0.87),
            roughness=0.15,
            metallic=0.97,
            bevel_r=0.020,
            edge_wear=0.18,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=26.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.020,
        ),
        "M_DarkHardware": _build_pbr_mat(
            "M_DarkHardware",
            base_srgb=(0.198, 0.208, 0.222),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.34,
            edge_srgb=(0.76, 0.78, 0.83),
            grain_scale=44.0,
            grain_bump=0.026,
            rough_var=0.030,
        ),
        "M_BufferElastomer": _build_pbr_mat(
            "M_BufferElastomer",
            base_srgb=(0.106, 0.110, 0.118),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.026,
            grain_scale=54.0,
            grain_bump=0.068,
            rough_var=0.032,
        ),
        "M_FcgStainless": _build_pbr_mat(
            "M_FcgStainless",
            base_srgb=(0.74, 0.77, 0.81),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.20,
            edge_srgb=(0.89, 0.91, 0.94),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.024,
        ),
        "M_SpringSteel": _build_pbr_mat(
            "M_SpringSteel",
            base_srgb=(0.60, 0.63, 0.67),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.014,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        # Classic FDE-coated 30-rd steel STANAG magazine: distinct olive-bronze / khaki dry-film metallic!
        "M_StanagFdeCoated": _build_pbr_mat(
            "M_StanagFdeCoated",
            base_srgb=(0.402, 0.368, 0.256),
            roughness=0.37,
            metallic=0.64,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.76, 0.78, 0.81),
            grain_scale=58.0,
            grain_bump=0.032,
            voronoi_grain=0.46,
            voronoi_scale=88.0,
            rough_var=0.036,
        ),
        "M_InnerDark": _build_pbr_mat(
            "M_InnerDark",
            base_srgb=(0.090, 0.095, 0.104),
            roughness=0.50,
            metallic=0.74,
            bevel_r=0.016,
            grain_scale=36.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface Modeling Toolkit
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


def _bm_to_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material | None = None) -> bpy.types.Object:
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


def _quad_bez(p0, p1, p2, segs: int = 8):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


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
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
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
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_sphere(
    name: str, rx: float, ry: float, rz: float,
    u_segs: int = 20, v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_torus(
    name: str, major_r: float, minor_r: float, axis: str = "x",
    major_segs: int = 32, minor_segs: int = 14,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    for i in range(major_segs):
        u = 2.0 * math.pi * i / major_segs
        cu, su = math.cos(u), math.sin(u)
        ring = []
        for j in range(minor_segs):
            v = 2.0 * math.pi * j / minor_segs
            cv, sv = math.cos(v), math.sin(v)
            r = major_r + minor_r * cv
            ring.append(bm.verts.new((r * cu, r * su, minor_r * sv)))
        rings.append(ring)
    for i in range(major_segs):
        ni = (i + 1) % major_segs
        for j in range(minor_segs):
            nj = (j + 1) % minor_segs
            bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
    pre = []
    if axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "y":
        pre = [("rx", math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 40,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    closed_loop = (
        len(pts_r_x) >= 3
        and pts_r_x[0][0] > 1e-5
        and math.hypot(pts_r_x[0][0] - pts_r_x[-1][0], pts_r_x[0][1] - pts_r_x[-1][1]) < 1e-4
    )
    pts = pts_r_x[:-1] if closed_loop else list(pts_r_x)
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
    end_k = n if closed_loop else n - 1
    for k in range(end_k):
        a = rings[k]
        b = rings[(k + 1) % n]
        if len(a) == 1 and len(b) == 1:
            continue
        elif len(a) == 1 and len(b) > 1:
            for s in range(segs):
                bm.faces.new((a[0], b[(s + 1) % segs], b[s]))
        elif len(a) > 1 and len(b) == 1:
            for s in range(segs):
                bm.faces.new((a[s], a[(s + 1) % segs], b[0]))
        else:
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((a[s], a[sn], b[sn], b[s]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()

    bm = bmesh.new()
    v_bot = [bm.verts.new((p[0], p[1], z0)) for p in clean]
    v_top = [bm.verts.new((p[0], p[1], z1)) for p in clean]
    bm.faces.new(list(reversed(v_bot)))
    bm.faces.new(v_top)
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_bot[i], v_bot[ni], v_top[ni], v_top[i]))
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_x(
    name: str, pts_zy: list[tuple[float, float]], x0: float, x1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_zy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()

    bm = bmesh.new()
    v_a = [bm.verts.new((x0, p[1], p[0])) for p in clean]
    v_b = [bm.verts.new((x1, p[1], p[0])) for p in clean]
    bm.faces.new(v_a)
    bm.faces.new(list(reversed(v_b)))
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_a[i], v_b[i], v_b[ni], v_a[ni]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_y(
    name: str, pts_xz: list[tuple[float, float]], y0: float, y1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xz:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()

    bm = bmesh.new()
    v_bot = [bm.verts.new((p[0], y0, p[1])) for p in clean]
    v_top = [bm.verts.new((p[0], y1, p[1])) for p in clean]
    bm.faces.new(v_bot)
    bm.faces.new(list(reversed(v_top)))
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_bot[i], v_top[i], v_top[ni], v_bot[ni]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_stadium_z(
    name: str, cx: float, cy: float, length_x: float, height_y: float, depth_z: float,
    arc_segs: int = 8,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Rounded racetrack / stadium slot extruded through Three.js Z (for authentic CNC SCAR vents)."""
    r = height_y * 0.5
    half_straight = max(0.01, length_x * 0.5 - r)
    pts = []
    for i in range(arc_segs + 1):
        th = -math.pi * 0.5 + math.pi * i / arc_segs
        pts.append((cx + half_straight + r * math.cos(th), cy + r * math.sin(th)))
    for i in range(arc_segs + 1):
        th = math.pi * 0.5 + math.pi * i / arc_segs
        pts.append((cx - half_straight + r * math.cos(th), cy + r * math.sin(th)))
    return mk_extrude_z(name, pts, -depth_z * 0.5, depth_z * 0.5, mat=mat)


def mk_torx_star_z(
    name: str, cx: float, cy: float, z0: float, z1: float,
    r_outer: float = 0.092, r_inner: float = 0.062, lobes: int = 6,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """True 6-lobe Torx T25 star socket cutter extruded along Three.js Z."""
    pts = []
    n_pts = lobes * 4
    for i in range(n_pts):
        th = 2.0 * math.pi * i / n_pts
        wave = 0.5 * (1.0 + math.cos(lobes * th))
        r = r_inner + (r_outer - r_inner) * wave
        pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    return mk_extrude_z(name, pts, z0, z1, mat=mat)


def mk_tube_along_pts(
    name: str, pts_three: list[Vector], radius: float, ring_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts_three):
        if i == 0:
            tang = (pts_three[1] - pts_three[0]).normalized()
        elif i == len(pts_three) - 1:
            tang = (pts_three[-1] - pts_three[-2]).normalized()
        else:
            tang = (pts_three[i + 1] - pts_three[i - 1]).normalized()
        if prev_n is None:
            ref = Vector((0, 0, 1)) if abs(tang.z) < 0.85 else Vector((1, 0, 0))
            n_vec = tang.cross(ref).normalized()
        else:
            n_vec = (prev_n - tang * prev_n.dot(tang)).normalized()
        prev_n = n_vec
        b_vec = tang.cross(n_vec).normalized()
        ring = []
        for s in range(ring_segs):
            th = 2.0 * math.pi * s / ring_segs
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * radius
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_coil_spring(
    name: str, axis: str, start: float, end: float,
    center_a: float, center_b: float, coil_r: float, wire_r: float, coils: float,
    ring_segs: int = 8, steps_per_coil: int = 16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    total_steps = max(12, int(round(coils * steps_per_coil)))
    pts = []
    for i in range(total_steps + 1):
        u = i / total_steps
        ang = u * coils * 2.0 * math.pi
        ax = start + (end - start) * u
        ca = math.cos(ang) * coil_r
        sa = math.sin(ang) * coil_r
        if axis == "x":
            pts.append(Vector((ax, center_a + ca, center_b + sa)))
        elif axis == "y":
            pts.append(Vector((center_a + ca, ax, center_b + sa)))
        else:
            pts.append(Vector((center_a + ca, center_b + sa, ax)))
    return mk_tube_along_pts(name, pts, wire_r, ring_segs=ring_segs, xform=xform, mat=mat)


def mk_scar_m1913_lug(
    name: str, length_x: float, top_w_z: float, neck_w_z: float, height_y: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    with_center_trough: bool = True,
) -> bpy.types.Object:
    """Authentic MIL-STD-1913 beveled dovetail cross-lug along X with optional central sight groove."""
    ht = top_w_z * 0.5
    hm = top_w_z * 0.5 + 0.032
    hn = neck_w_z * 0.5
    if with_center_trough and top_w_z >= 0.80:
        pts_zy = [
            (-hn, 0.0),
            (-hm, height_y * 0.50),
            (-ht, height_y),
            (-0.11, height_y),
            (-0.08, height_y * 0.72),
            ( 0.08, height_y * 0.72),
            ( 0.11, height_y),
            ( ht, height_y),
            ( hm, height_y * 0.50),
            ( hn, 0.0),
        ]
    else:
        pts_zy = [
            (-hn, 0.0),
            (-hm, height_y * 0.52),
            (-ht, height_y),
            ( ht, height_y),
            ( hm, height_y * 0.52),
            ( hn, 0.0),
        ]
    return mk_extrude_x(
        name, pts_zy, -length_x * 0.5, length_x * 0.5,
        bevel=0.014, bevel_segs=2, xform=xform, mat=mat,
    )


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 20, depth: float = 0.018,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.014, length * 0.14, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.8 - bev * 0.8),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.8 - bev * 0.8),
    ]
    rings = []
    for s_idx, (ax_pos, r_base) in enumerate(stations):
        ring = []
        is_end = s_idx in (0, 3)
        for k in range(n_pts):
            th = 2.0 * math.pi * k / n_pts
            rr = r_base if is_end else (r_base if (k % 2 == 0) else (r_base - depth))
            u, v = rr * math.cos(th), rr * math.sin(th)
            if axis == "x":
                pt = (ax_pos, u, v)
            elif axis == "y":
                pt = (u, ax_pos, v)
            else:
                pt = (u, v, ax_pos)
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    for s in range(len(rings) - 1):
        for k in range(n_pts):
            kn = (k + 1) % n_pts
            bm.faces.new((rings[s][k], rings[s + 1][k], rings[s + 1][kn], rings[s][kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_helical_land(
    name: str, x0: float, x1: float, r: float, height: float, width: float,
    start_ang: float, twist_len: float, segs: int = 28,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight right-hand helical rifling land twisted along Three.js +X bore."""
    bm = bmesh.new()
    hw = width * 0.5
    hh = height * 0.5
    rings = []
    for i in range(segs + 1):
        u = i / segs
        x = x0 + (x1 - x0) * u
        ang = start_ang + ((x - x0) / twist_len) * 2.0 * math.pi
        ca, sa = math.cos(ang), math.sin(ang)
        corners_local = [
            (r - hh, -hw),
            (r + hh, -hw),
            (r + hh,  hw),
            (r - hh,  hw),
        ]
        ring = []
        for ry_l, rz_l in corners_local:
            ty = ry_l * ca - rz_l * sa
            tz = ry_l * sa + rz_l * ca
            ring.append(bm.verts.new((x, ty, tz)))
        rings.append(ring)
    for i in range(segs):
        for k in range(4):
            kn = (k + 1) % 4
            bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][kn], rings[i][kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
    assert len(objs) > 0, f"join_objects({name}): empty list"
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    select_only(objs, objs[0])
    bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = name
    res.data.name = name
    return res


def delete_objs(objs: list[bpy.types.Object]):
    for o in objs:
        if o is None:
            continue
        mesh = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def _count_non_manifold(obj: bpy.types.Object) -> int:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.free()
    return bad


def bool_subtract(target: bpy.types.Object, cutters: list[bpy.types.Object], solver: str = "EXACT") -> bpy.types.Object:
    if not cutters:
        return target
    for c in cutters:
        for m in c.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)

    for idx, cutter in enumerate(cutters):
        backup_mesh = target.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        success = False
        for slv in tried:
            select_only([target], target)
            mod = target.modifiers.new(name=f"Bool_{idx}", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = slv
            mod.object = cutter
            if slv == "EXACT":
                mod.use_self = True
                mod.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if _count_non_manifold(target) == 0 and len(target.data.polygons) > 0:
                success = True
                break
            old_m = target.data
            target.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not success:
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolF_{idx}", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = cutter
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)

    delete_objs(cutters)
    return target


def bool_union(objs: list[bpy.types.Object], name: str, solver: str = "EXACT") -> bpy.types.Object:
    assert len(objs) >= 1
    base = objs[0]
    rest = objs[1:]
    for idx, other in enumerate(rest):
        for m in other.data.materials:
            if m and m.name not in [tm.name for tm in base.data.materials if tm]:
                base.data.materials.append(m)
        backup_mesh = base.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        ok = False
        for slv in tried:
            select_only([base], base)
            mod = base.modifiers.new(name=f"Union_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = slv
            mod.object = other
            if slv == "EXACT":
                mod.use_self = True
                mod.use_hole_tolerant = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            if _count_non_manifold(base) == 0 and len(base.data.polygons) > 0:
                ok = True
                break
            old_m = base.data
            base.data = backup_mesh.copy()
            bpy.data.meshes.remove(old_m)
        if not ok:
            select_only([base], base)
            mod = base.modifiers.new(name=f"UnionF_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = other
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)
    delete_objs(rest)
    base.name = name
    base.data.name = name
    return base


def finish_part(
    obj: bpy.types.Object,
    bevel_w: float = 0.0,
    bevel_segs: int = 2,
    sharp_deg: float = 34.0,
    weighted_normals: bool = True,
    lock_flat_walls: bool = False,
) -> bpy.types.Object:
    select_only([obj], obj)
    if bevel_w > 0.0:
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.offset_type = "OFFSET"
        mod.width = bevel_w
        mod.segments = bevel_segs
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        mod.use_clamp_overlap = True
        mod.miter_outer = "MITER_ARC"
        bpy.ops.object.modifier_apply(modifier=mod.name)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    degen = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degen:
        bmesh.ops.delete(bm, geom=degen, context="FACES")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    if weighted_normals:
        select_only([obj], obj)
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 100
        wn.thresh = 0.01
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    if lock_flat_walls:
        mesh = obj.data
        mesh.update()
        loop_n = [tuple(l.normal) for l in mesh.loops]
        for poly in mesh.polygons:
            n = poly.normal
            if poly.area > 0.025:
                if abs(n.y) > 0.996:
                    fn = (0.0, 1.0 if n.y > 0.0 else -1.0, 0.0)
                    for li in poly.loop_indices:
                        loop_n[li] = fn
                elif abs(n.z) > 0.996:
                    fn = (0.0, 0.0, 1.0 if n.z > 0.0 else -1.0)
                    for li in poly.loop_indices:
                        loop_n[li] = fn
                elif abs(n.x) > 0.996:
                    fn = (1.0 if n.x > 0.0 else -1.0, 0.0, 0.0)
                    for li in poly.loop_indices:
                        loop_n[li] = fn
        mesh.normals_split_custom_set(loop_n)
        mesh.update()

    return obj


def triangulate_keep_normals(objs: list[bpy.types.Object]):
    """Triangulate BEFORE Cycles normal baking so tangent-space normal maps match exported GLB triangles 1:1."""
    for o in objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


# =============================================================================
# 25 AAA HARD-SURFACE FN SCAR-L MK 16 MOD 0 PART BUILDERS
# =============================================================================

# --- SUITE 1: MONOLITHIC UPPER, REAR SIGHT & BARREL CROSSBOLTS (3 PARTS) ---

def build_scar_upper_receiver(mats: dict) -> bpy.types.Object:
    m_ch = mats["U_ChampagneAnodize"]
    m_rc = mats["U_RailCrestFDE"]
    m_rs = mats["U_RailSlotFDE"]
    m_sr = mats["U_SideRailDark"]
    m_df = mats["U_BrassDeflector"]
    m_in = mats["U_InnerDark"]
    m_ds = mats["U_DarkSteel"]

    # Extruded FN Herstal rear receiver cross-section (flat side walls at Z = +-0.88 over Y in [0.35, 2.52] + C2 shoulder arc)
    rear_sec = [
        (-0.88, 0.35),
        (-0.88, 2.52),
    ] + _quad_bez((-0.88, 2.52), (-0.82, 2.74), (-0.56, 2.86), 5) + [
        ( 0.56, 2.86),
    ] + _quad_bez(( 0.56, 2.86), ( 0.82, 2.74), ( 0.88, 2.52), 5) + [
        ( 0.88, 0.35),
    ]
    rear_hull = mk_extrude_x("up_rear", rear_sec, -6.40, 5.60, bevel=0.032, bevel_segs=3, mat=m_ch)

    # Integral monolithic forend cross-section (X in [+5.50, +13.60], Z = +-0.82 + C2 shoulder arc)
    forend_sec = [
        (-0.82, 0.24),
        (-0.82, 2.52),
    ] + _quad_bez((-0.82, 2.52), (-0.77, 2.74), (-0.54, 2.86), 5) + [
        ( 0.54, 2.86),
    ] + _quad_bez(( 0.54, 2.86), ( 0.77, 2.74), ( 0.82, 2.52), 5) + [
        ( 0.82, 0.24),
    ]
    forend_hull = mk_extrude_x("up_forend", forend_sec, 5.50, 13.60, bevel=0.032, bevel_segs=3, mat=m_ch)
    monolith = bool_union([rear_hull, forend_hull], "up_mono")

    # Carve internal BCG/barrel raceway, FCG/magwell opening, ejection port, charging slot, flutes, scallops & vents
    cutters: list[bpy.types.Object] = [
        # Full-length internal BCG & barrel channel
        mk_box("c_raceway", 20.40, 2.16, 1.36, [("t", 3.60, 1.48, 0.0)], m_in),
        # Bottom FCG & STANAG magwell cutout
        mk_box("c_bot_open", 10.05, 0.56, 1.34, [("t", -0.58, 0.35, 0.0)], m_in),
        # Right ejection port with crisp rounded corners
        mk_box("c_eje", 3.26, 0.90, 0.68, [("t", 2.20, 1.23, 0.68)], m_in, bevel=0.042, bevel_segs=3),
        # Ambidextrous reciprocating charging handle tracks + rear keyway extraction circle
        mk_box("c_ch_slot", 6.80, 0.28, 2.12, [("t", 1.05, 2.12, 0.0)], m_in),
        mk_cyl("c_ch_hole", 0.24, 0.24, 2.12, "z", 32, [("t", -1.95, 2.12, 0.0)], m_in),
        # Machined longitudinal upper side relief flutes (X in [-5.6, +4.8])
        mk_box("c_fluteR", 10.40, 0.18, 0.14, [("t", -0.40, 2.44,  0.89)], m_rs, bevel=0.025, bevel_segs=2),
        mk_box("c_fluteL", 10.40, 0.18, 0.14, [("t", -0.40, 2.44, -0.89)], m_rs, bevel=0.025, bevel_segs=2),
    ]

    # 6 recessed circular counterbore scallops around the quick-change barrel Torx crossbolts
    for idx_b, bx in enumerate((4.28, 5.10, 5.92)):
        cutters.append(mk_cyl(f"c_scR_{idx_b}", 0.26, 0.26, 0.22, "z", 32, [("t", bx, 0.70,  0.86)], m_rs))
        cutters.append(mk_cyl(f"c_scL_{idx_b}", 0.26, 0.26, 0.22, "z", 32, [("t", bx, 0.70, -0.86)], m_rs))

    # 8 rounded stadium-profile CNC lightning / cooling vents along monolithic forend
    for idx_v, vx in enumerate((6.95, 8.75, 10.55, 12.35)):
        cutters.append(mk_stadium_z(f"c_vup_{idx_v}", vx, 2.08, 1.18, 0.32, 2.10, arc_segs=14, mat=m_in))
        cutters.append(mk_stadium_z(f"c_vlo_{idx_v}", vx, 0.62, 1.18, 0.30, 2.10, arc_segs=14, mat=m_in))

    carved_upper = bool_subtract(monolith, cutters, solver="EXACT")
    parts: list[bpy.types.Object] = [carved_upper]

    # Uninterrupted Full-Length 12-o'clock MIL-STD-1913 Monolithic Picatinny Rail (26 Beveled Lugs, Y_top = 3.11)
    parts.append(mk_box("up_top_spine", 19.86, 0.11, 0.72, [("t", 3.61, 2.91, 0.0)], m_rs, bevel=0.012, bevel_segs=1))
    for i in range(26):
        lx = -5.95 + i * 0.765
        parts.append(
            mk_scar_m1913_lug(
                f"up_top_lug_{i}", 0.44, 0.94, 0.72, 0.15,
                xform=[("t", lx, 2.96, 0.0)], mat=m_rc, with_center_trough=True,
            )
        )

    # Bolted 3-o'clock & 9-o'clock Black Hard-Anodized Forend Picatinny Rails (9 Lugs + Torx Bolts each side)
    for s_idx, side in enumerate((-1.0, 1.0)):
        parts.append(
            mk_box(f"up_srail_sp_{s_idx}", 7.25, 0.68, 0.11, [("t", 9.75, 1.34, side * 0.85)], m_sr, bevel=0.012, bevel_segs=1)
        )
        for i in range(9):
            rx = 6.55 + i * 0.80
            parts.append(
                mk_scar_m1913_lug(
                    f"up_slug_{s_idx}_{i}", 0.42, 0.72, 0.56, 0.13,
                    xform=[("rx", side * math.pi * 0.5), ("t", rx, 1.34, side * 0.89)],
                    mat=m_sr, with_center_trough=False,
                )
            )
        for t_idx, tx in enumerate((6.30, 13.20)):
            parts.append(
                mk_cyl(f"up_sbolt_{s_idx}_{t_idx}", 0.11, 0.11, 0.12, "z", 16,
                       [("t", tx, 1.34, side * 0.96)], m_ds, bevel=0.015)
            )

    # Bottom 6-o'clock Black Hard-Anodized Forend Picatinny Rail (10 Lugs, Y_min = 0.01)
    parts.append(mk_box("up_brail_sp", 7.70, 0.11, 0.72, [("t", 9.60, 0.19, 0.0)], m_sr, bevel=0.012, bevel_segs=1))
    for i in range(10):
        bx = 6.15 + i * 0.77
        parts.append(
            mk_scar_m1913_lug(
                f"up_blug_{i}", 0.42, 0.92, 0.72, 0.13,
                xform=[("rx", math.pi), ("t", bx, 0.14, 0.0)],
                mat=m_sr, with_center_trough=True,
            )
        )

    # Signature Sculpted SCAR Angled Brass Deflector behind Right Ejection Port + Folded-Stock Retention Catch
    defl_xz = [
        ( 0.50, 0.84),
        (-0.08, 1.15),
    ] + _quad_bez((-0.08, 1.15), (-0.20, 1.21), (-0.28, 1.12), 10) + [
        (-0.30, 0.84),
    ]
    parts.append(mk_extrude_y("up_deflector", defl_xz, 0.86, 1.64, bevel=0.028, bevel_segs=3, mat=m_df))
    parts.append(mk_box("up_fold_catch", 0.24, 0.36, 0.14, [("t", -0.24, 1.24, 1.04)], m_ds, bevel=0.020, bevel_segs=2))

    # Iconic FN SCAR Front Left & Right Steel Nose Sling Attachment Loops (X = +13.32, Y = 2.38, Z = +-0.88)
    for s_idx, side in enumerate((-1.0, 1.0)):
        parts.append(
            mk_torus(f"up_sling_{s_idx}", 0.18, 0.045, "x", 32, 14, [("t", 13.32, 2.38, side * 0.88)], m_ds)
        )
        parts.append(
            mk_box(f"up_sling_boss_{s_idx}", 0.26, 0.24, 0.12, [("t", 13.32, 2.38, side * 0.84)], m_ds, bevel=0.020, bevel_segs=2)
        )

    # Drilled Front & Rear Lower-Receiver Mating Takedown/Pivot Lugs (X = 4.65, -5.20)
    for l_idx, lx in enumerate((4.65, -5.20)):
        lug_raw = mk_box(f"up_lug_{l_idx}", 0.95, 0.34, 0.78, [("t", lx, 0.28, 0.0)], m_ch, bevel=0.020, bevel_segs=2)
        pin_bore = mk_cyl(f"up_lbore_{l_idx}", 0.165, 0.165, 0.96, "z", 24, [("t", lx, 0.14, 0.0)], m_ds)
        parts.append(bool_subtract(lug_raw, [pin_bore]))

    obj = join_objects(parts, "scar_upper_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=32.0, lock_flat_walls=True)


def build_scar_rear_sight(mats: dict) -> bpy.types.Object:
    m_ds = mats["U_DarkSteel"]
    m_dr = mats["U_SightDrum"]
    m_bs = mats["U_BrightSteel"]
    m_in = mats["U_InnerDark"]

    clamp_raw = mk_box("rs_clamp", 1.46, 0.28, 1.06, [("t", 0.0, 0.06, 0.0)], m_ds, bevel=0.022, bevel_segs=2)
    dovetail_cut = mk_box("rs_dt_cut", 1.56, 0.12, 0.76, [("t", 0.0, -0.05, 0.0)], m_in)
    rail_clamp = bool_subtract(clamp_raw, [dovetail_cut])

    # Drilled dual-aperture diopter peep ring (centered at local Y = 0.62 -> world Y = 3.74)
    ring_raw = mk_cyl("rs_ring", 0.28, 0.28, 0.16, "x", 28, [("t", -0.18, 0.62, 0.0)], m_ds, bevel=0.016)
    peep_cut = mk_cyl("rs_peep", 0.09, 0.09, 0.36, "x", 18, [("t", -0.18, 0.62, 0.0)], m_in)
    diopter = bool_subtract(ring_raw, [peep_cut])

    parts = [
        rail_clamp,
        diopter,
        mk_cyl("rs_xbolt", 0.12, 0.12, 1.28, "z", 20, [("t", 0.18, 0.07, 0.0)], m_bs, bevel=0.016),
        mk_cyl("rs_relbtn", 0.10, 0.10, 0.18, "z", 16, [("t", -0.38, 0.12, -0.56)], m_bs, bevel=0.014),
        # Knurled 200-600m rotary elevation cam drum
        mk_knurled_cyl("rs_elev", 0.24, 0.20, "y", flutes=20, depth=0.016, xform=[("t", -0.18, 0.24, 0.0)], mat=m_dr),
        mk_box("rs_stem", 0.38, 0.52, 0.48, [("t", -0.18, 0.44, 0.0)], m_ds, bevel=0.020, bevel_segs=2),
        mk_box("rs_fliptab", 0.26, 0.08, 0.24, [("t", -0.02, 0.44, 0.0)], m_ds, bevel=0.012),
        # Protective sight ears
        mk_box("rs_earL", 0.34, 0.46, 0.09, [("t", -0.18, 0.64, -0.34)], m_ds, bevel=0.016, bevel_segs=2),
        mk_box("rs_earR", 0.34, 0.46, 0.09, [("t", -0.18, 0.64,  0.34)], m_ds, bevel=0.016, bevel_segs=2),
        # Windage cross-shaft & knurled right micro-windage drum
        mk_cyl("rs_wshaft", 0.12, 0.12, 0.96, "z", 18, [("t", -0.18, 0.34, 0.08)], m_bs, bevel=0.012),
        mk_knurled_cyl("rs_wdrum", 0.20, 0.26, "z", flutes=18, depth=0.016, xform=[("t", -0.18, 0.34, 0.56)], mat=m_dr),
    ]
    obj = join_objects(parts, "scar_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_barrel_crossbolts(mats: dict) -> bpy.types.Object:
    m_ds = mats["U_DarkSteel"]
    m_bs = mats["U_BrightSteel"]
    m_in = mats["U_InnerDark"]

    yoke_raw = mk_box("xb_yoke", 2.18, 0.96, 1.32, [("t", 0.0, -0.10, 0.0)], m_bs, bevel=0.026, bevel_segs=2)
    barrel_cut = mk_cyl("xb_bcut", 0.60, 0.60, 2.45, "x", 32, [("t", 0.0, 0.13, 0.0)], m_in)
    yoke = bool_subtract(yoke_raw, [barrel_cut])

    parts: list[bpy.types.Object] = [yoke]
    for b_idx, bx in enumerate((-0.82, 0.0, 0.82)):
        parts.append(mk_cyl(f"xb_shaft_{b_idx}", 0.11, 0.11, 1.82, "z", 24, [("t", bx, -0.22, 0.0)], m_ds))
        for s_idx, side in enumerate((-1.0, 1.0)):
            # Conical Belleville retaining washer
            parts.append(
                mk_cyl(f"xb_wash_{b_idx}_{s_idx}", 0.23, 0.23, 0.04, "z", 32,
                       [("t", bx, -0.22, side * 0.83)], m_bs, bevel=0.010, bevel_segs=2)
            )
            # Dark steel Torx T25 bolt head with true recessed 6-lobe star socket!
            head_raw = mk_cyl(f"xb_head_{b_idx}_{s_idx}", 0.20, 0.20, 0.11, "z", 36,
                              [("t", bx, -0.22, side * 0.89)], m_ds, bevel=0.020, bevel_segs=3)
            z_in, z_out = (side * 0.88, side * 0.98) if side > 0 else (side * 0.98, side * 0.88)
            torx_cut = mk_torx_star_z(f"xb_star_{b_idx}_{s_idx}", bx, -0.22, z_in, z_out,
                                      r_outer=0.095, r_inner=0.062, lobes=6, mat=m_in)
            parts.append(bool_subtract(head_raw, [torx_cut]))

    obj = join_objects(parts, "scar_barrel_crossbolts")
    return finish_part(obj, bevel_w=0.0, sharp_deg=32.0)


# --- SUITE 2: FDE POLYMER LOWER, GRIP, UGG-BOOT STOCK, RISER, BUTTPAD, SELECTOR & FOLLOWER (8 PARTS) ---

def build_scar_lower_receiver(mats: dict) -> bpy.types.Object:
    m_lo = mats["P_LowerCoyote"]
    m_dk = mats["P_CoyoteDark"]
    m_st = mats["P_SteelHardware"]
    m_in = mats["P_BlackPolymer"]

    # Main FCG housing, vertical STANAG magwell, beveled flared skirt, front pivot ear & smoothly swept closed winter trigger guard
    fcg_hull = mk_box("lo_fcg", 6.20, 1.30, 1.64, [("t", -2.55, -0.27, 0.0)], m_lo, bevel=0.030, bevel_segs=3)
    mag_hull = mk_box("lo_mag", 4.10, 2.73, 1.68, [("t",  2.50, -0.985, 0.0)], m_lo, bevel=0.030, bevel_segs=3)
    mag_flare = mk_box("lo_flare", 4.32, 0.36, 1.84, [("t", 2.50, -2.20, 0.0)], m_lo, bevel=0.048, bevel_segs=3)
    front_piv = mk_box("lo_fpiv", 0.86, 0.98, 1.58, [("t", 4.52, -0.09, 0.0)], m_lo, bevel=0.032, bevel_segs=3)
    # Smoothly curved ergonomic winter trigger-guard outer bow welded solidly into magwell (+0.62) & rear FCG ear (-2.82)!
    guard_xy = [
        (-2.82, -0.82),
        ( 0.62, -0.82),
        ( 0.62, -1.94),
    ] + _quad_bez((0.62, -1.94), (0.58, -2.26), (0.20, -2.28), 8) + _quad_bez(
        (0.20, -2.28), (-1.10, -2.35), (-2.38, -2.28), 10
    ) + _quad_bez((-2.38, -2.28), (-2.78, -2.24), (-2.82, -1.90), 8)
    guard_raw = mk_extrude_z("lo_guard", guard_xy, -0.36, 0.36, bevel=0.046, bevel_segs=3, mat=m_lo)

    solid = bool_union([fcg_hull, mag_hull, mag_flare, front_piv, guard_raw], "lo_solid")

    cutters = [
        # Deep internal FCG pocket
        mk_box("c_lo_fcg", 5.12, 1.14, 1.18, [("t", -2.35, -0.13, 0.0)], m_dk),
        # Trigger & disconnector slot
        mk_box("c_lo_trig", 1.48, 0.78, 0.56, [("t", -1.68, -0.78, 0.0)], m_dk),
        # Gloved winter trigger guard finger opening (smooth rounded interior arch — zero corner breakthrough!)
        mk_box("c_lo_loop", 2.52, 1.04, 1.10, [("t", -1.10, -1.46, 0.0)], m_dk, bevel=0.18, bevel_segs=5),
        # Vertical 30-rd STANAG magazine through-chute + internal funnel bevel
        mk_box("c_lo_chute", 2.94, 3.15, 1.32, [("t", 2.45, -0.98, 0.0)], m_dk),
        mk_box("c_lo_fun", 3.16, 0.34, 1.52, [("t", 2.45, -2.28, 0.0)], m_dk),
        # Pistol grip mounting tang mortise & swept rear tang bevel
        mk_box("c_lo_grip", 1.65, 0.24, 0.84, [("t", -3.35, -0.88, 0.0)], m_dk),
        mk_box("c_lo_tang", 1.75, 0.56, 1.90, [("rz", 0.28), ("t", -5.15, -0.88, 0.0)], m_lo),
    ]
    carved_lower = bool_subtract(solid, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        carved_lower,
        # Molded polymer mag-release protective fence ribs (Right flank Z = +0.86)
        mk_box("lo_fR1", 1.18, 0.11, 0.08, [("t", 1.42, -0.38,  0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_fR2", 1.18, 0.11, 0.08, [("t", 1.42, -0.98,  0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_fR3", 0.12, 0.71, 0.08, [("t", 2.05, -0.68,  0.86)], m_lo, bevel=0.018, bevel_segs=2),
        # Molded polymer fence ribs framing left ambi mag release & bolt catch (Z = -0.86)
        mk_box("lo_fL1", 1.36, 0.11, 0.08, [("t", 1.25, -0.98, -0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_fL2", 0.14, 0.62, 0.10, [("t", 0.32,  0.02, -0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_fL3", 0.14, 0.62, 0.10, [("t", 1.04,  0.02, -0.86)], m_lo, bevel=0.018, bevel_segs=2),
        # Molded horizontal STANAG magwell reinforcement ribs (left & right lower magwell walls)
        mk_box("lo_mR1", 2.15, 0.14, 0.06, [("t", 3.15, -1.42,  0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_mR2", 2.15, 0.14, 0.06, [("t", 3.15, -1.82,  0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_mL1", 2.15, 0.14, 0.06, [("t", 3.15, -1.42, -0.86)], m_lo, bevel=0.018, bevel_segs=2),
        mk_box("lo_mL2", 2.15, 0.14, 0.06, [("t", 3.15, -1.82, -0.86)], m_lo, bevel=0.018, bevel_segs=2),
        # Front & rear captured steel takedown pins w/ enlarged left pull heads
        mk_cyl("lo_fpin",  0.16, 0.16, 1.76, "z", 28, [("t",  4.65,  0.14,  0.00)], m_st, bevel=0.016, bevel_segs=2),
        mk_cyl("lo_fpinh", 0.22, 0.22, 0.08, "z", 28, [("t",  4.65,  0.14, -0.89)], m_st, bevel=0.016, bevel_segs=2),
        mk_cyl("lo_rpin",  0.16, 0.16, 1.76, "z", 28, [("t", -5.20,  0.14,  0.00)], m_st, bevel=0.016, bevel_segs=2),
        mk_cyl("lo_rpinh", 0.22, 0.22, 0.08, "z", 28, [("t", -5.20,  0.14, -0.89)], m_st, bevel=0.016, bevel_segs=2),
        # Flush steel hammer & trigger cross-pin ends
        mk_cyl("lo_hpin", 0.095, 0.095, 1.68, "z", 22, [("t", -0.35, -0.08, 0.0)], m_st, bevel=0.012, bevel_segs=2),
        mk_cyl("lo_tpin", 0.085, 0.085, 1.68, "z", 22, [("t", -1.75, -0.42, 0.0)], m_st, bevel=0.012, bevel_segs=2),
        # Ambidextrous SCAR magazine release (right serrated oval button + left pivoting paddle)
        mk_box("lo_mrR", 0.84, 0.40, 0.14, [("t", 1.42, -0.68,  0.88)], m_st, bevel=0.024, bevel_segs=2),
        mk_cyl("lo_mrRc", 0.20, 0.20, 0.16, "z", 24, [("t", 1.06, -0.68,  0.89)], m_st, bevel=0.020, bevel_segs=2),
        mk_box("lo_mrL", 1.14, 0.40, 0.14, [("t", 1.26, -0.68, -0.88)], m_st, bevel=0.024, bevel_segs=2),
        mk_cyl("lo_mrLp", 0.06, 0.06, 0.46, "y", 16, [("t", 1.72, -0.68, -0.91)], m_st),
        # Iconic SCAR left-side "ping-pong paddle" bolt catch/release
        mk_box("lo_bcU", 0.58, 0.48, 0.14, [("t", 0.68,  0.22, -0.90)], m_st, bevel=0.026, bevel_segs=2),
        mk_box("lo_bcL", 0.36, 0.44, 0.13, [("t", 0.68, -0.22, -0.89)], m_st, bevel=0.024, bevel_segs=2),
        mk_cyl("lo_bcP", 0.055, 0.055, 0.62, "x", 16, [("t", 0.68, 0.00, -0.92)], m_st),
    ]

    # Vertical serration ridges on right mag-catch button & horizontal ribs on left bolt-catch paddle
    for s in range(4):
        parts.append(mk_box(f"lo_mrs_{s}", 0.05, 0.34, 0.04, [("t", 1.34 + s * 0.14, -0.68, 0.96)], m_in, bevel=0.010))
    for r in range(3):
        parts.append(mk_box(f"lo_bcr_{r}", 0.50, 0.05, 0.04, [("t", 0.68, 0.10 + r * 0.11, -0.98)], m_in, bevel=0.010))

    obj = join_objects(parts, "scar_lower_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_scar_pistol_grip(mats: dict) -> bpy.types.Object:
    """Ergonomic 3D C2 superellipse palm-swell SOCOM A2 pistol grip loft (zero flat blocky slabs!)."""
    m_bp = mats["P_BlackPolymer"]
    m_ch = mats["P_A2BlackCheckering"]
    m_rb = mats["P_RubberBlack"]

    # Loft 30 axial stations x 44 perimeter verts along swept A2 grip axis (t=0 top -> t=1 base)
    n_u = 30
    n_v = 44
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []

    for iu in range(n_u + 1):
        t = iu / n_u
        y_val = 0.16 - t * 4.78  # [+0.16 .. -4.62]
        # Frontstrap sweeps from +0.34 (top) to -1.66 (base) w/ smooth A2 middle-finger contour ridge at t=0.35
        x_front = 0.34 - 2.00 * t + 0.08 * math.sin(math.pi * t)
        x_front -= 0.10 * math.exp(-((t - 0.14) / 0.09) ** 2)   # subtle trigger-finger knuckle relief
        x_front += 0.19 * math.exp(-((t - 0.35) / 0.055) ** 2)  # ergonomic A2 middle-finger swell
        # Backstrap sweeps from -2.06 (top) to -3.68 (base) w/ gentle rounded palm swell
        x_rear = -2.06 - 1.62 * t - 0.11 * (math.sin(math.pi * t) ** 1.2)
        xc = 0.5 * (x_front + x_rear)
        rx = max(0.50, 0.5 * (x_front - x_rear))
        # Lateral palm-swell width: 0.56 top -> 0.655 palm -> 0.61 base (strictly <= 0.680 ref)
        rz = 0.56 + 0.095 * math.sin(math.pi * (t ** 0.85)) + 0.05 * t
        # Superellipse exponent: smooth organic oval front/back, subtly fuller sides
        p_exp = 2.35
        ring: list[bmesh.types.BMVert] = []
        for iv in range(n_v):
            th = (iv * 2.0 * math.pi) / n_v
            c_th, s_th = math.cos(th), math.sin(th)
            # Signed superellipse (rx, rz)
            ux = math.copysign(abs(c_th) ** (2.0 / p_exp), c_th)
            uz = math.copysign(abs(s_th) ** (2.0 / p_exp), s_th)
            # Conformal backstrap horizontal traction ribs (smooth ridges molded directly into rear surface!)
            rib_r = 0.0
            if c_th < -0.76 and 0.22 <= t <= 0.84:
                rib_mask = math.sin(math.pi * ((t - 0.22) / 0.62)) ** 0.4
                back_mask = min(1.0, (-c_th - 0.76) / 0.20)
                rib_r = 0.028 * rib_mask * back_mask * (0.5 + 0.5 * math.sin(t * 9.0 * 2.0 * math.pi))
            # Conformal slight recessed diamond-checkering side pad framing
            pad_inset = 0.0
            if abs(s_th) > 0.62 and 0.20 <= t <= 0.84:
                pad_inset = 0.014 * min(1.0, (abs(s_th) - 0.62) / 0.14) * min(
                    1.0, min(t - 0.20, 0.84 - t) / 0.06
                )
            tx = xc + (rx + rib_r) * ux
            tz = (rz + pad_inset) * uz
            # Slight downward flare at very bottom to match angled butt cap
            ty = y_val - 0.12 * (t ** 2) * (-ux)
            ring.append(bm.verts.new(t2b(tx, ty, tz)))
        rings.append(ring)

    # Connect loft quad strips & assign conformal diamond-checkering material on palm side panels
    for iu in range(n_u):
        t_mid = (iu + 0.5) / n_u
        r0, r1 = rings[iu], rings[iu + 1]
        for iv in range(n_v):
            iv2 = (iv + 1) % n_v
            th_mid = ((iv + 0.5) * 2.0 * math.pi) / n_v
            f = bm.faces.new((r0[iv], r0[iv2], r1[iv2], r1[iv]))
            if abs(math.sin(th_mid)) > 0.64 and 0.21 <= t_mid <= 0.83:
                f.material_index = 1  # P_A2BlackCheckering
            else:
                f.material_index = 0  # P_BlackPolymer

    # Watertight top & bottom caps via center pole fan
    c_top = bm.verts.new(t2b(-0.86, 0.16, 0.0))
    c_bot = bm.verts.new(t2b(-2.67, -4.64, 0.0))
    for iv in range(n_v):
        iv2 = (iv + 1) % n_v
        f_t = bm.faces.new((c_top, rings[0][iv2], rings[0][iv]))
        f_t.material_index = 0
        f_b = bm.faces.new((c_bot, rings[n_u][iv], rings[n_u][iv2]))
        f_b.material_index = 0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    grip_obj = _bm_to_obj("pg_loft", bm, m_bp)
    grip_obj.data.materials.append(m_ch)

    parts: list[bpy.types.Object] = [
        grip_obj,
        # Contoured hinged bottom battery/oil compartment cap w/ front squeeze latch
        mk_box("pg_cap", 2.08, 0.24, 1.24, [("rz", -0.15), ("t", -2.68, -4.66, 0.0)], m_rb, bevel=0.048, bevel_segs=3),
        mk_box("pg_latch", 0.34, 0.16, 0.56, [("rz", -0.15), ("t", -1.72, -4.78, 0.0)], m_bp, bevel=0.022, bevel_segs=2),
    ]

    obj = join_objects(parts, "scar_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_scar_buttstock(mats: dict) -> bpy.types.Object:
    m_st = mats["P_StockTan"]
    m_dk = mats["P_CoyoteDark"]
    m_rs = mats["P_CheekRiserSand"]
    m_hw = mats["P_SteelHardware"]
    m_bs = mats["P_BrightSteel"]

    # Iconic FN SCAR Mk 16 "Ugg-Boot" side-folding 6-position telescoping outer sleeve w/ rounded C2 polymer edges
    boot_xy = [
        ( 4.45,  1.56),
        ( 1.85,  1.54),
        (-5.65,  1.48),
        (-5.65, -3.22),
        (-4.45, -3.26),
    ] + _quad_bez((-4.45, -3.26), (-2.65, -2.45), (-0.65, -1.48), 16) + [
        ( 4.45, -1.24),
    ]
    raw_boot = mk_extrude_z("bs_boot", boot_xy, -0.64, 0.64, bevel=0.092, bevel_segs=4, mat=m_st)

    boot_cutters = [
        # Angled lower toe tactical sling slot window
        mk_box("c_bs_sl1", 1.38, 0.34, 1.80, [("rz", 0.38), ("t", -3.95, -2.55, 0.0)], m_dk, bevel=0.055, bevel_segs=3),
        # Upper rear vertical sling loop window near buttpad heel
        mk_box("c_bs_sl2", 0.32, 1.08, 1.80, [("t", -4.92, -0.82, 0.0)], m_dk, bevel=0.055, bevel_segs=3),
        # Recessed circular bezel housing the signature SCAR LOP adjustment button
        mk_cyl("c_bs_lop", 0.54, 0.54, 1.56, "z", 36, [("t", -0.65, -0.18, 0.0)], m_dk),
    ]
    # Recessed side flutes framing the 3 iconic vertical strengthening ribs on telescoping sleeve
    for f_i, rx in enumerate((3.55, 2.05, 0.55)):
        boot_cutters.append(mk_box(f"c_bs_flR_{f_i}", 1.02, 1.66, 0.22, [("t", rx, 0.14,  0.68)], m_dk, bevel=0.045, bevel_segs=3))
        boot_cutters.append(mk_box(f"c_bs_flL_{f_i}", 1.02, 1.66, 0.22, [("t", rx, 0.14, -0.68)], m_dk, bevel=0.045, bevel_segs=3))
    sculpted_boot = bool_subtract(raw_boot, boot_cutters, solver="EXACT")

    # Inner 6-position telescoping strut with milled position detent holes
    strut_raw = mk_box("bs_strut", 6.40, 2.38, 1.08, [("t", 2.25, 0.16, 0.0)], m_dk, bevel=0.042, bevel_segs=3)
    strut_cuts = [
        mk_cyl(f"c_bs_det_{p}", 0.08, 0.08, 1.24, "z", 18, [("t", 4.54 + p * 0.22, 0.16, 0.0)], m_hw)
        for p in range(4)
    ]
    detailed_strut = bool_subtract(strut_raw, strut_cuts, solver="EXACT")

    # Heavy front folding hinge block w/ vertical sliding receiver dovetail tracks
    hinge_raw = mk_box("bs_hinge", 0.66, 3.02, 1.68, [("t", 5.48, 0.16, 0.0)], m_dk, bevel=0.036, bevel_segs=3)
    hinge_blk = bool_subtract(hinge_raw, [
        mk_box("c_bs_dtL", 0.22, 3.12, 0.18, [("t", 5.74, 0.16, -0.68)], m_hw),
        mk_box("c_bs_dtR", 0.22, 3.12, 0.18, [("t", 5.74, 0.16,  0.68)], m_hw),
    ])

    parts = [
        sculpted_boot,
        detailed_strut,
        hinge_blk,
        # Left-side 3-knuckle heavy folding hinge + bright steel full-length hinge pin
        mk_cyl("bs_knT", 0.24, 0.24, 0.92, "y", 32, [("t", 5.76,  1.04, -0.82)], m_hw, bevel=0.022, bevel_segs=2),
        mk_cyl("bs_knM", 0.23, 0.23, 0.88, "y", 32, [("t", 5.76,  0.16, -0.82)], m_dk, bevel=0.022, bevel_segs=2),
        mk_cyl("bs_knB", 0.24, 0.24, 0.92, "y", 32, [("t", 5.76, -0.72, -0.82)], m_hw, bevel=0.022, bevel_segs=2),
        mk_cyl("bs_hpin", 0.11, 0.11, 2.96, "y", 24, [("t", 5.76, 0.16, -0.82)], m_bs, bevel=0.016, bevel_segs=2),
        # Left spring-loaded fold-unlock button + right folded-stock retention catch hook
        mk_box("bs_foldbtn", 0.52, 0.66, 0.22, [("t", 5.22, 0.22, -0.84)], m_hw, bevel=0.028, bevel_segs=3),
        mk_box("bs_catch",   0.56, 0.62, 0.22, [("t", 5.18, 0.22,  0.84)], m_hw, bevel=0.028, bevel_segs=3),
        # Signature large circular 6-position telescoping LOP push-button + steel bezel ring
        mk_cyl("bs_lop_bez", 0.48, 0.48, 1.32, "z", 36, [("t", -0.65, -0.18, 0.0)], m_hw, bevel=0.026, bevel_segs=3),
        mk_cyl("bs_lop_btn", 0.38, 0.38, 1.46, "z", 36, [("t", -0.65, -0.18, 0.0)], m_rs, bevel=0.032, bevel_segs=3),
    ]
    obj = join_objects(parts, "scar_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_scar_cheek_riser(mats: dict) -> bpy.types.Object:
    m_rs = mats["P_CheekRiserSand"]
    m_hw = mats["P_SteelHardware"]

    # Contoured inverted-U desert-sand cheek-weld saddle straddling buttstock comb (high-seg C2 crown)
    saddle_zy = [(-0.78, -0.60), (-0.78, 0.18)]
    saddle_zy += _quad_bez((-0.78, 0.18), (-0.74, 0.50), (0.00, 0.54), 14)
    saddle_zy += _quad_bez((0.00, 0.54), (0.74, 0.50), (0.78, 0.18), 14)
    saddle_zy += [(0.78, -0.60), (0.58, -0.60), (0.58, 0.10)]
    saddle_zy += _quad_bez((0.58, 0.10), (0.52, 0.30), (0.00, 0.32), 10)
    saddle_zy += _quad_bez((0.00, 0.32), (-0.52, 0.30), (-0.58, 0.10), 10)
    saddle_zy.append((-0.58, -0.60))

    riser_raw = mk_extrude_x(
        "cr_raw", saddle_zy, -4.15, 3.85, bevel=0.060, bevel_segs=3,
        xform=[("rz", -0.035)], mat=m_rs,
    )
    riser_body = bool_subtract(riser_raw, [
        mk_cyl("c_cr_sc", 0.34, 0.34, 1.76, "z", 28, [("t", -1.25, -0.22, 0.0)], m_rs),
        mk_box("c_cr_fr", 0.75, 0.55, 1.92, [("rz", -0.52), ("t", 3.82, 0.42, 0.0)], m_rs),
    ])

    parts = [
        riser_body,
        mk_cyl("cr_fpin", 0.11, 0.11, 1.64, "z", 24, [("t", 3.55, -0.32, 0.0)], m_hw, bevel=0.016, bevel_segs=2),
        mk_cyl("cr_shaft", 0.22, 0.22, 1.66, "z", 28, [("t", -1.25, -0.22, 0.0)], m_hw, bevel=0.020, bevel_segs=2),
        mk_knurled_cyl("cr_capR", 0.27, 0.10, "z", flutes=24, depth=0.015, xform=[("t", -1.25, -0.22, 0.84)], mat=m_hw),
    ]
    obj = join_objects(parts, "scar_cheek_riser")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_scar_buttpad(mats: dict) -> bpy.types.Object:
    m_rb = mats["P_RubberBlack"]
    m_hw = mats["P_SteelHardware"]

    pad_xy = [(0.18, 2.34), (-0.46, 2.30)]
    pad_xy += _quad_bez((-0.46, 2.30), (-0.34, 0.00), (-0.55, -2.42), 18)
    pad_xy.append((0.18, -2.46))

    pad_raw = mk_extrude_z("bp_raw", pad_xy, -0.70, 0.70, bevel=0.072, bevel_segs=4, mat=m_rb)
    pad_body = bool_subtract(pad_raw, [
        mk_box("c_bp_sock", 0.18, 4.46, 1.18, [("t",  0.16, -0.06, 0.0)], m_rb),
        mk_cyl("c_bp_scT",  0.16, 0.16, 0.36, "x", 24, [("t", -0.44,  1.52, 0.0)], m_rb),
        mk_cyl("c_bp_scB",  0.16, 0.16, 0.36, "x", 24, [("t", -0.46, -1.62, 0.0)], m_rb),
    ])

    parts: list[bpy.types.Object] = [
        pad_body,
        mk_cyl("bp_scrT", 0.10, 0.10, 0.18, "x", 20, [("t", -0.28,  1.52, 0.0)], m_hw, bevel=0.016, bevel_segs=2),
        mk_cyl("bp_scrB", 0.10, 0.10, 0.18, "x", 20, [("t", -0.30, -1.62, 0.0)], m_hw, bevel=0.016, bevel_segs=2),
    ]
    for i in range(8):
        ry = -1.95 + i * 0.54
        parts.append(mk_box(f"bp_rib_{i}", 0.12, 0.15, 1.32, [("t", -0.46, ry, 0.0)], m_rb, bevel=0.042, bevel_segs=3))

    obj = join_objects(parts, "scar_buttpad")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_scar_selector(mats: dict) -> bpy.types.Object:
    m_bp = mats["P_BlackPolymer"]
    m_hw = mats["P_SteelHardware"]

    drum_raw = mk_cyl("sel_drum", 0.22, 0.22, 1.72, "z", 24, [], m_hw, bevel=0.014)
    drum = bool_subtract(drum_raw, [
        mk_box("c_sel_cam", 0.28, 0.18, 0.62, [("t", 0.14, 0.12, 0.0)], m_hw),
        mk_cyl("c_sel_det", 0.24, 0.24, 0.08, "z", 20, [("t", 0.0, 0.0, 0.48)], m_hw),
    ])

    def _mk_fn_lever(tag: str, length_x: float, z_pos: float) -> bpy.types.Object:
        ls = [(0.24, 0.0), (0.06, 0.20)]
        ls += _quad_bez((0.06, 0.20), (-length_x * 0.55, 0.22), (-length_x, 0.14), 6)
        ls += _quad_bez((-length_x, 0.14), (-length_x - 0.10, 0.0), (-length_x, -0.14), 6)
        ls += _quad_bez((-length_x, -0.14), (-length_x * 0.55, -0.20), (0.06, -0.20), 6)
        return mk_extrude_z(tag, ls, -0.07, 0.07, bevel=0.020, bevel_segs=2,
                            xform=[("rz", -0.52), ("t", 0.0, 0.0, z_pos)], mat=m_bp)

    parts = [
        drum,
        _mk_fn_lever("sel_levL", 1.06, -0.90),
        _mk_fn_lever("sel_levR", 0.88,  0.90),
        mk_cyl("sel_hubL", 0.27, 0.27, 0.16, "z", 22, [("t", 0.0, 0.0, -0.89)], m_bp, bevel=0.018),
        mk_cyl("sel_hubR", 0.27, 0.27, 0.16, "z", 22, [("t", 0.0, 0.0,  0.89)], m_bp, bevel=0.018),
        mk_cyl("sel_scrL", 0.09, 0.09, 0.19, "z", 16, [("t", 0.0, 0.0, -0.91)], m_hw, bevel=0.012),
        mk_cyl("sel_scrR", 0.09, 0.09, 0.19, "z", 16, [("t", 0.0, 0.0,  0.91)], m_hw, bevel=0.012),
        mk_box("sel_rdgL", 0.46, 0.08, 0.06, [("rz", -0.52), ("t", -0.58, 0.34, -0.99)], m_bp, bevel=0.015),
        mk_box("sel_rdgR", 0.38, 0.08, 0.06, [("rz", -0.52), ("t", -0.48, 0.28,  0.99)], m_bp, bevel=0.015),
    ]
    obj = join_objects(parts, "scar_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_mag_follower(mats: dict) -> bpy.types.Object:
    m_fo = mats["P_FollowerOrange"]
    parts = [
        mk_box("mf_deck", 2.24, 0.22, 0.82, [("t", 0.0, 0.14, 0.0)], m_fo, bevel=0.028, bevel_segs=2),
        mk_cyl("mf_step", 0.13, 0.13, 2.14, "x", 20, [("t", 0.02, 0.29, 0.18)], m_fo, bevel=0.020),
        mk_box("mf_btab", 0.32, 0.24, 0.28, [("t", -1.02, 0.28, -0.24)], m_fo, bevel=0.020),
        mk_box("mf_fleg", 0.22, 1.18, 0.78, [("t",  0.96, -0.44, 0.0)], m_fo, bevel=0.024),
        mk_box("mf_rleg", 0.22, 1.18, 0.78, [("t", -0.96, -0.44, 0.0)], m_fo, bevel=0.024),
        mk_box("mf_boss", 1.18, 0.26, 0.38, [("t",  0.00, -0.08, 0.0)], m_fo, bevel=0.020),
    ]
    obj = join_objects(parts, "scar_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_mag_floorplate(mats: dict) -> bpy.types.Object:
    m_dk = mats["P_CoyoteDark"]
    m_rg = mats["P_RangerRubberTan"]
    m_rb = mats["P_RubberBlack"]
    m_hw = mats["P_SteelHardware"]

    collar_raw = mk_box("fp_col", 2.96, 0.44, 1.32, [("t", 0.0, -0.02, 0.0)], m_dk, bevel=0.026, bevel_segs=2)
    base_cap = bool_subtract(collar_raw, [
        mk_box("c_fp_sock", 2.70, 0.26, 1.10, [("t", 0.0, 0.12, 0.0)], m_dk),
    ])

    # Iconic FDE Ranger Plate rubberized finger pull-loop
    loop_xy = [(-1.18, -0.18), (1.18, -0.18), (0.92, -1.06)]
    loop_xy += _quad_bez((0.92, -1.06), (0.00, -1.18), (-0.92, -1.06), 8)
    loop_raw = mk_extrude_z("fp_loop", loop_xy, -0.44, 0.44, bevel=0.042, bevel_segs=2, mat=m_rg)
    ranger_loop = bool_subtract(loop_raw, [
        mk_box("c_fp_hole", 1.42, 0.50, 1.24, [("t", 0.0, -0.60, 0.0)], m_rg, bevel=0.08, bevel_segs=3),
    ])

    parts: list[bpy.types.Object] = [
        base_cap,
        ranger_loop,
        mk_cyl("fp_lock", 0.16, 0.16, 0.10, "y", 18, [("t", 0.0, -0.22, 0.0)], m_hw, bevel=0.014),
    ]
    for r in range(-2, 3):
        parts.append(mk_box(f"fp_rib_{r + 2}", 0.12, 0.08, 0.92, [("t", r * 0.34, -1.12, 0.0)], m_rb, bevel=0.018))

    obj = join_objects(parts, "scar_mag_floorplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 3: BARREL, FLASH SUPPRESSOR, GAS SYSTEM, MONOLITHIC BCG, FCG & STANAG MAG (14 PARTS) ---

def build_scar_barrel(mats: dict) -> bpy.types.Object:
    m_br = mats["M_PhosphateBarrel"]
    m_bs = mats["M_FcgStainless"]
    m_in = mats["M_InnerDark"]

    # Multi-step cold-hammer-forged 14" CQC quick-change barrel profile w/ recessed 11-deg match crown
    pts_r_x = [
        (0.000,  3.35),
        (0.620,  3.35),  # 7-lug barrel extension breech face
        (0.620,  4.75),
        (0.685,  4.78),  # Barrel extension locating flange
        (0.685,  5.05),
        (0.585,  5.10),  # Quick-change trunnion crossbolt journal
        (0.585,  6.45),
        (0.455,  6.80),  # Chamber taper under monolithic free-float forend
        (0.425, 13.55),
        (0.488, 13.62),  # SCAR gas-block journal
        (0.488, 15.80),
        (0.390, 15.88),  # Forward 14" CQC contour
        (0.390, 22.10),
        (0.320, 22.12),  # 1/2"-28 threaded muzzle spigot
        (0.320, 22.85),
        (0.168, 22.75),  # Recessed 11-deg CHF match crown
        (0.000, 22.75),
    ]
    outer = mk_lathe_x("brl_outer", pts_r_x, segs=64, mat=m_br)

    cutters = [
        mk_cyl("c_brl_bore", 0.168, 0.168, 20.20, "x", 36, [("t", 13.20, 0.0, 0.0)], m_in),
        mk_cyl("c_brl_chmb", 0.280, 0.310,  2.50, "x", 36, [("t",  4.65, 0.0, 0.0)], m_in),
        # Dual polished M4/SCAR feed ramps
        mk_cyl("c_brl_frL", 0.130, 0.160, 0.68, "y", 18, [("rz", math.pi * 0.5 - 0.32), ("t", 3.58, -0.28, -0.14)], m_bs),
        mk_cyl("c_brl_frR", 0.130, 0.160, 0.68, "y", 18, [("rz", math.pi * 0.5 - 0.32), ("t", 3.58, -0.28,  0.14)], m_bs),
        # Short-stroke piston gas port drilled up through gas-block journal
        mk_cyl("c_brl_gport", 0.045, 0.045, 0.55, "y", 16, [("t", 14.70, 0.27, 0.0)], m_in),
    ]
    hollowed = bool_subtract(outer, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [hollowed]

    # 6 Right-Hand 1:7" (17.78 cm) helical chrome-lined 5.56mm rifling lands
    for r in range(6):
        ang = (r * math.pi * 2.0) / 6.0 + 0.18
        parts.append(mk_helical_land(f"brl_land_{r}", 6.00, 22.72, 0.156, 0.036, 0.044, ang, 17.78, segs=40, mat=m_bs))

    # 7 Internal barrel extension locking lugs + polished chrome breech ring
    for k in range(1, 8):
        ang = (k * math.pi) / 4.0 + math.pi / 8.0
        parts.append(
            mk_box(f"brl_lug_{k}", 0.38, 0.14, 0.16,
                   [("rx", -ang), ("t", 3.62, math.sin(ang) * 0.39, math.cos(ang) * 0.39)],
                   m_bs, bevel=0.014, bevel_segs=2)
        )
    parts.append(mk_torus("brl_ring", 0.38, 0.055, "x", 40, 14, [("t", 3.38, 0.0, 0.0)], m_bs))

    obj = join_objects(parts, "scar_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_flash_suppressor(mats: dict) -> bpy.types.Object:
    m_fs = mats["M_FlashSuppressor3Prong"]
    m_hw = mats["M_DarkHardware"]
    m_bs = mats["M_FcgStainless"]
    m_in = mats["M_InnerDark"]

    ratchet_col = mk_cyl("fs_col", 0.54, 0.52, 0.72, "x", 48, [("t", -0.52, 0.0, 0.0)], m_fs, bevel=0.022, bevel_segs=2)
    prong_cyl = mk_cyl("fs_cyl", 0.49, 0.515, 1.71, "x", 48, [("t", 0.695, 0.0, 0.0)], m_fs, bevel=0.022, bevel_segs=2)
    raw_body = bool_union([ratchet_col, prong_cyl], "fs_raw")

    cutters: list[bpy.types.Object] = [
        mk_cyl("c_fs_bore", 0.33, 0.25, 2.80, "x", 40, [("t", 0.35, 0.0, 0.0)], m_in),
        mk_box("c_fs_wrR", 0.28, 1.12, 0.16, [("t", -0.68, 0.0,  0.54)], m_hw),
        mk_box("c_fs_wrL", 0.28, 1.12, 0.16, [("t", -0.68, 0.0, -0.54)], m_hw),
    ]
    # 3 open tuning-fork prong slots at 120 deg + outer tine weight-relief flutes
    for i in range(3):
        ang = (i * math.pi * 2.0) / 3.0 + math.pi / 6.0
        cutters.append(
            mk_box(f"c_fs_slot_{i}", 1.54, 0.35, 0.37,
                   [("rx", -ang), ("t", 0.88, math.sin(ang) * 0.35, math.cos(ang) * 0.35)],
                   m_in, bevel=0.030, bevel_segs=3)
        )
        tine_ang = ang + math.pi / 3.0
        cutters.append(
            mk_box(f"c_fs_flt_{i}", 1.18, 0.12, 0.12,
                   [("rx", -tine_ang), ("t", 0.84, math.sin(tine_ang) * 0.51, math.cos(tine_ang) * 0.51)],
                   m_fs, bevel=0.018, bevel_segs=2)
        )

    three_prong = bool_subtract(raw_body, cutters, solver="EXACT")

    # 51T Quick-Detach suppressor ratchet ring & 18 perimeter teeth
    parts: list[bpy.types.Object] = [
        three_prong,
        mk_torus("fs_rring", 0.545, 0.042, "x", 48, 14, [("t", -0.22, 0.0, 0.0)], m_bs),
    ]
    for t in range(18):
        ang = (t * math.pi * 2.0) / 18.0
        parts.append(
            mk_box(f"fs_rt_{t}", 0.11, 0.045, 0.05,
                   [("rx", -ang), ("t", -0.22, math.sin(ang) * 0.555, math.cos(ang) * 0.555)],
                   m_bs, bevel=0.010, bevel_segs=1)
        )

    obj = join_objects(parts, "scar_flash_suppressor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_gas_block(mats: dict) -> bpy.types.Object:
    m_gb = mats["M_GasBlockSteel"]
    m_rg = mats["M_GasRegulatorHeat"]
    m_hw = mats["M_DarkHardware"]
    m_bs = mats["M_FcgStainless"]
    m_in = mats["M_InnerDark"]

    solid = bool_union([
        mk_cyl("gb_bclmp", 0.66, 0.66, 2.20, "x", 48, [("t",  0.00,  0.00, 0.0)], m_gb, bevel=0.026, bevel_segs=2),
        mk_box("gb_web",   2.05, 1.25, 0.84, [("t", -0.04,  0.56, 0.0)], m_gb, bevel=0.032, bevel_segs=3),
        mk_cyl("gb_gcyl",  0.58, 0.58, 2.32, "x", 48, [("t", -0.02,  1.07, 0.0)], m_gb, bevel=0.026, bevel_segs=2),
        mk_box("gb_blug",  1.08, 0.42, 0.48, [("t",  0.08, -0.74, 0.0)], m_gb, bevel=0.024, bevel_segs=2),
        mk_box("gb_hinge", 0.98, 0.62, 0.68, [("t", -0.12,  1.78, 0.0)], m_gb, bevel=0.026, bevel_segs=2),
        mk_box("gb_tower", 0.46, 0.68, 0.48, [("t", -0.12,  2.28, 0.0)], m_gb, bevel=0.024, bevel_segs=2),
        # Iconic SCAR full circular protective front-sight hood (local Y = +2.69 -> world Y = 3.74)
        mk_cyl("gb_hood",  0.45, 0.45, 0.54, "x", 48, [("t", -0.12,  2.69, 0.0)], m_gb, bevel=0.024, bevel_segs=2),
    ], "gb_solid")

    carved = bool_subtract(solid, [
        mk_cyl("c_gb_brl", 0.49, 0.49, 2.60, "x", 36, [("t",  0.00, 0.00, 0.0)], m_in),
        mk_cyl("c_gb_pis", 0.41, 0.41, 1.68, "x", 32, [("t", -0.55, 1.07, 0.0)], m_in),
        mk_cyl("c_gb_hd",  0.35, 0.35, 0.76, "x", 36, [("t", -0.12, 2.69, 0.0)], m_in),
    ], solver="EXACT")

    # 2-Position Rotary Gas Regulator Plug ('N' / 'S') w/ cartridge-rim tool slot, wings & top detent latch
    reg_raw = mk_cyl("gb_reg", 0.42, 0.45, 0.78, "x", 36, [("t", 1.48, 1.07, 0.0)], m_rg, bevel=0.022, bevel_segs=2)
    reg_plug = bool_subtract(reg_raw, [
        mk_box("c_gb_rslot", 0.22, 0.11, 0.94, [("t", 1.86, 1.07, 0.0)], m_in),
    ])

    parts = [
        carved,
        reg_plug,
        mk_box("gb_rwings", 0.22, 0.94, 0.22, [("t", 1.72, 1.07, 0.0)], m_rg, bevel=0.018),
        mk_box("gb_rdet",   0.62, 0.12, 0.18, [("t", 1.02, 1.66, 0.0)], m_bs, bevel=0.014),
        # Elevation-adjustable front sight post & protective collar
        mk_cyl("gb_pcol", 0.11,  0.11,  0.08, "y", 18, [("t", -0.12, 2.40, 0.0)], m_bs, bevel=0.010),
        mk_cyl("gb_post", 0.048, 0.062, 0.34, "y", 14, [("t", -0.12, 2.57, 0.0)], m_bs),
        # Left fold-release button, hinge pin, side sling loop & twin retention cross-pins
        mk_cyl("gb_fbtn", 0.12, 0.12, 0.20, "z", 18, [("t", -0.12, 1.82, -0.40)], m_bs, bevel=0.014),
        mk_cyl("gb_hpin", 0.10, 0.10, 0.84, "z", 16, [("t", -0.12, 1.68,  0.00)], m_bs, bevel=0.010),
        mk_torus("gb_slg", 0.19, 0.045, "z", 22, 10, [("t", -0.08, 0.42, -0.52)], m_hw),
        mk_cyl("gb_xpin1", 0.085, 0.085, 0.96, "z", 16, [("t", -0.52, -0.42, 0.0)], m_bs, bevel=0.010),
        mk_cyl("gb_xpin2", 0.085, 0.085, 0.96, "z", 16, [("t",  0.52, -0.42, 0.0)], m_bs, bevel=0.010),
    ]
    obj = join_objects(parts, "scar_gas_block")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_gas_piston(mats: dict) -> bpy.types.Object:
    m_cp = mats["M_ChromePiston"]
    m_hw = mats["M_DarkHardware"]

    # Precision lathe-turned gleaming mirror-chrome stainless short-stroke piston tappet
    pts_r_x = [
        (0.000, -2.50),
        (0.240, -2.50),  # Hardened rear tappet striking face
        (0.240, -0.35),  # Ground tappet stem
        (0.365, -0.25),  # Travel-limiting stop flange collar
        (0.365,  0.16),
        (0.280,  0.24),  # Mid waist w/ cleaning wrench flats
        (0.280,  1.24),
        (0.395,  1.30),  # Obturation gas land 1
        (0.395,  1.54),
        (0.315,  1.58),  # Labyrinth gas ring groove 1
        (0.315,  1.70),
        (0.395,  1.74),  # Obturation gas land 2
        (0.395,  1.98),
        (0.315,  2.02),  # Labyrinth gas ring groove 2
        (0.315,  2.14),
        (0.395,  2.18),  # Front high-pressure gas cup land 3
        (0.395,  2.45),
        (0.240,  2.45),  # Cupped front gas impingement cavity
        (0.180,  2.26),
        (0.000,  2.24),
    ]
    lathe = mk_lathe_x("gp_lathe", pts_r_x, segs=36, mat=m_cp)
    carved = bool_subtract(lathe, [
        mk_box("c_gp_flL", 0.48, 0.72, 0.14, [("t", 0.74, 0.0, -0.29)], m_hw),
        mk_box("c_gp_flR", 0.48, 0.72, 0.14, [("t", 0.74, 0.0,  0.29)], m_hw),
    ])
    carved.name = "scar_gas_piston"
    carved.data.name = "scar_gas_piston"
    return finish_part(carved, bevel_w=0.0, sharp_deg=34.0)


def build_scar_bolt_carrier(mats: dict) -> bpy.types.Object:
    m_bc = mats["M_MonolithicCarrier"]
    m_wr = mats["M_CarrierWearRail"]
    m_in = mats["M_InnerDark"]

    # Heavy billet CNC-machined square-section monolithic SCAR bolt carrier + forward piston anvil
    main_blk = mk_box("bc_main", 5.60, 1.56, 1.26, [("t", -0.80, -0.02, 0.0)], m_bc, bevel=0.032, bevel_segs=2)
    guide_sp = mk_cyl("bc_spine", 0.36, 0.36, 7.60, "x", 28, [("t", 0.25, 0.70, 0.0)], m_bc, bevel=0.018)
    anvil_tb = mk_cyl("bc_anvil", 0.38, 0.42, 5.55, "x", 28, [("t", 4.65, 0.54, 0.0)], m_bc, bevel=0.018)
    raw_carrier = bool_union([main_blk, guide_sp, anvil_tb], "bc_raw")

    cutters = [
        # Bolt tail raceway bore (world Y = +1.05 -> local Y = -0.53)
        mk_cyl("c_bc_bolt", 0.44, 0.44, 4.40, "x", 28, [("t", 0.15, -0.53, 0.0)], m_in),
        # Bottom rear hammer-cocking & magazine feed-lip slot
        mk_box("c_bc_bot", 4.10, 0.58, 0.56, [("t", -1.75, -0.62, 0.0)], m_in),
        # Right ejection port scallop
        mk_box("c_bc_eje", 2.48, 0.68, 0.46, [("t", 0.65, -0.32, 0.52)], m_in, bevel=0.02, bevel_segs=1),
        # Helical cam-pin track driving 22.5-deg bolt unlock/relock
        mk_box("c_bc_cam", 1.18, 0.38, 0.60, [("ry", 0.44), ("t", 0.35, -0.02, 0.25)], m_wr),
        # Ambidextrous reversible charging-handle cross-keyway at local (+1.65, +0.54)
        mk_box("c_bc_ch", 0.58, 0.26, 1.52, [("t", 1.65, 0.54, 0.0)], m_in),
        # Top captive recoil-rod & spring blind tunnel (local Y = +0.70 -> world Y = +2.28)
        mk_cyl("c_bc_rod", 0.28, 0.28, 8.55, "x", 24, [("t", 0.52, 0.70, 0.0)], m_in),
        # Longitudinal polished wear-rail guide grooves along extruded upper tracks
        mk_box("c_bc_grL", 5.82, 0.22, 0.16, [("t", -0.80,  0.18, -0.62)], m_wr),
        mk_box("c_bc_grR", 5.82, 0.22, 0.16, [("t", -0.80,  0.18,  0.62)], m_wr),
        # Side mass-tuning lightening pockets
        mk_box("c_bc_pkL", 2.30, 0.38, 0.12, [("t", -2.05, -0.22, -0.62)], m_in, bevel=0.02, bevel_segs=1),
        mk_box("c_bc_pkR", 2.30, 0.38, 0.12, [("t", -2.05, -0.22,  0.62)], m_in, bevel=0.02, bevel_segs=1),
        # Firing-pin retaining cross-pin bore
        mk_cyl("c_bc_fp", 0.075, 0.075, 1.46, "z", 16, [("t", -0.72, -0.44, 0.0)], m_in),
    ]
    machined = bool_subtract(raw_carrier, cutters, solver="EXACT")

    # Polished hardened piston-impact anvil cap + burnished steel bearing guide rails
    parts = [
        machined,
        mk_cyl("bc_acap", 0.415, 0.415, 0.36, "x", 28, [("t", 7.24, 0.54, 0.0)], m_wr, bevel=0.020),
        mk_box("bc_wrailL", 5.40, 0.06, 0.03, [("t", -0.80, 0.36, -0.618)], m_wr),
        mk_box("bc_wrailR", 5.40, 0.06, 0.03, [("t", -0.80, 0.36,  0.618)], m_wr),
    ]
    obj = join_objects(parts, "scar_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=32.0)


def build_scar_charging_handle(mats: dict) -> bpy.types.Object:
    m_hw = mats["M_DarkHardware"]
    m_bs = mats["M_FcgStainless"]
    m_in = mats["M_InnerDark"]

    tang_raw = mk_box("ch_tang", 0.54, 0.23, 1.48, [("t", 0.0, 0.0, 0.08)], m_hw, bevel=0.018, bevel_segs=2)
    # Central arch clearance groove at local Y = +0.16 (world Y = 2.28) clearing scar_recoil_rod
    key_tang = bool_subtract(tang_raw, [
        mk_cyl("c_ch_rod", 0.24, 0.24, 0.80, "x", 20, [("t", 0.0, 0.16, 0.0)], m_in),
    ])

    parts: list[bpy.types.Object] = [
        key_tang,
        mk_sphere("ch_det", 0.065, 0.065, 0.065, 14, 10, [("t", 0.0, 0.12, 0.56)], m_bs),
        mk_cyl("ch_neck", 0.155, 0.155, 0.44, "z", 22, [("t", 0.0, 0.0, 0.96)], m_hw, bevel=0.014),
        mk_knurled_cyl("ch_drum", 0.242, 0.68, "z", flutes=16, depth=0.022, xform=[("t", 0.0, 0.0, 1.48)], mat=m_hw),
        mk_torus("ch_end", 0.212, 0.034, "z", 24, 12, [("t", 0.0, 0.0, 1.80)], m_bs),
    ]
    obj = join_objects(parts, "scar_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_bolt(mats: dict) -> bpy.types.Object:
    m_cb = mats["M_ChromeBolt"]
    m_hw = mats["M_DarkHardware"]
    m_in = mats["M_InnerDark"]

    bolt_stem = mk_cyl("blt_stem", 0.325, 0.325, 2.58, "x", 32, [("t", -0.08, 0.0, 0.0)], m_cb, bevel=0.016)
    bolt_col = mk_cyl("blt_col", 0.415, 0.415, 0.48, "x", 32, [("t",  0.95, 0.0, 0.0)], m_cb, bevel=0.016)
    body_solid = bool_union([bolt_stem, bolt_col], "blt_solid")

    # Carve recessed cartridge rim face cup & central firing-pin aperture
    carved_bolt = bool_subtract(body_solid, [
        mk_cyl("c_blt_cup", 0.275, 0.275, 0.16, "x", 26, [("t", 1.48, 0.0, 0.0)], m_in),
        mk_cyl("c_blt_fp",  0.048, 0.048, 0.55, "x", 16, [("t", 1.32, 0.0, 0.0)], m_in),
    ])

    parts: list[bpy.types.Object] = [carved_bolt]

    # 7 Heavy Chamfered Radial Locking Lugs spaced at 45 deg (slot 0 at +Z houses claw extractor)
    hx, hw, hr = 0.195, 0.0745, 0.19
    lug_xy = [(-hx, -hw), (hx - 0.08, -hw), (hx, -hw * 0.42), (hx, hw * 0.42), (hx - 0.08, hw), (-hx, hw)]
    for idx in range(1, 8):
        ang = (idx * math.pi * 2.0) / 8.0
        parts.append(
            mk_extrude_z(f"blt_lug_{idx}", lug_xy, -hr * 0.5, hr * 0.5, bevel=0.012, bevel_segs=1,
                         xform=[("rx", -ang), ("t", 1.31, math.sin(ang) * 0.43, math.cos(ang) * 0.43)], mat=m_cb)
        )

    # Slot 0 (+Z): Heavy CNC Claw Extractor w/ inward rim hook & pivot pin
    x0, x1, z_in, z_out, hook_z, h_ex = 0.46, 1.51, 0.33, 0.51, 0.29, 0.21
    ext_xz = [
        (x0, z_in + 0.03), (x0, z_out - 0.02), (x0 + 0.06, z_out),
        (x1 - 0.05, z_out), (x1, z_out - 0.05), (x1, hook_z),
        (x1 - 0.11, hook_z), (x1 - 0.15, z_in), (x0 + 0.06, z_in),
    ]
    parts.append(mk_extrude_y("blt_extr", ext_xz, -h_ex * 0.5, h_ex * 0.5, bevel=0.012, bevel_segs=1, mat=m_hw))
    parts.append(mk_cyl("blt_epin", 0.048, 0.048, 0.38, "y", 14, [("t", 0.78, 0.0, 0.42)], m_cb))

    # Vertical Rectangular-Head SCAR Cam Pin engaging carrier helical cam track
    parts.append(mk_cyl("blt_cstem", 0.14, 0.14, 0.56, "y", 20, [("t", -0.22, 0.46, 0.0)], m_hw, bevel=0.014))
    parts.append(mk_box("blt_chead", 0.33, 0.20, 0.26, [("t", -0.22, 0.74, 0.0)], m_hw, bevel=0.022, bevel_segs=2))

    # Spring-loaded cylindrical plunger ejector on bolt face
    ej_ang = 5.0 * math.pi / 4.0
    parts.append(
        mk_cyl("blt_ejec", 0.055, 0.055, 0.16, "x", 14,
               [("t", 1.44, math.sin(ej_ang) * 0.16, math.cos(ej_ang) * 0.16)], m_hw, bevel=0.008)
    )

    obj = join_objects(parts, "scar_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_firing_pin(mats: dict) -> bpy.types.Object:
    m_cb = mats["M_ChromeBolt"]
    m_hw = mats["M_DarkHardware"]

    # Precision lathe-turned full-length stainless firing pin + retaining cross-pin
    pts_r_x = [
        (0.000, -1.45),
        (0.150, -1.45),  # Flanged rear hammer-striking head
        (0.150, -1.05),
        (0.095, -1.04),  # Retaining neck
        (0.095, -0.77),
        (0.215, -0.75),  # Stop collar
        (0.215, -0.59),
        (0.105, -0.57),  # Tapered shaft
        (0.085,  2.12),
        (0.036,  2.84),  # Conical primer nose
        (0.022,  2.87),
        (0.000,  2.876),
    ]
    parts = [
        mk_lathe_x("fp_body", pts_r_x, segs=28, mat=m_cb),
        mk_cyl("fp_xpin", 0.055, 0.055, 1.18, "z", 16, [("t", -0.88, 0.16, 0.0)], m_hw, bevel=0.008),
    ]
    obj = join_objects(parts, "scar_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_scar_recoil_rod(mats: dict) -> bpy.types.Object:
    m_el = mats["M_BufferElastomer"]
    m_hw = mats["M_DarkHardware"]
    m_bs = mats["M_FcgStainless"]

    # Contoured SCAR receiver backplate matching monolithic upper chamfered roof
    plate_zy = [
        (-0.82, -1.76),
        (-0.82,  0.32),
        (-0.52,  0.64),
        ( 0.52,  0.64),
        ( 0.82,  0.32),
        ( 0.82, -1.76),
    ]
    parts: list[bpy.types.Object] = [
        mk_extrude_x("rr_plate", plate_zy, -0.29, 0.21, bevel=0.022, bevel_segs=2, mat=m_el),
        mk_box("rr_dtL", 0.14, 2.38, 0.14, [("t", -0.32, -0.56, -0.68)], m_hw, bevel=0.015),
        mk_box("rr_dtR", 0.14, 2.38, 0.14, [("t", -0.32, -0.56,  0.68)], m_hw, bevel=0.015),
        mk_box("rr_buf", 0.24, 1.52, 1.18, [("t",  0.32, -0.45,  0.00)], m_hw, bevel=0.022, bevel_segs=2),
        mk_cyl("rr_seat", 0.24, 0.28, 0.22, "x", 24, [("t", 0.34, 0.13, 0.0)], m_bs, bevel=0.016),
        mk_cyl("rr_rod",  0.115, 0.115, 8.20, "x", 22, [("t", 4.30, 0.13, 0.0)], m_bs, bevel=0.010),
        mk_cyl("rr_stop", 0.215, 0.215, 0.18, "x", 22, [("t", 8.35, 0.13, 0.0)], m_hw, bevel=0.016),
        mk_torus("rr_clip", 0.155, 0.025, "x", 22, 10, [("t", 8.24, 0.13, 0.0)], m_bs),
    ]
    # 4 Molded elastomer carrier-impact cushion ribs on forward buffer face
    for i, ry in enumerate((-0.95, -0.62, -0.28, 0.05)):
        parts.append(
            mk_cyl(f"rr_rib_{i}", 0.055, 0.055, 0.96, "z", 14, [("s", 0.65, 1.0, 1.0), ("t", 0.44, ry, 0.0)], m_el, bevel=0.022)
        )

    obj = join_objects(parts, "scar_recoil_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_hammer(mats: dict) -> bpy.types.Object:
    m_bs = mats["M_FcgStainless"]
    m_sp = mats["M_SpringSteel"]
    m_in = mats["M_InnerDark"]

    hub = mk_cyl("hm_hub", 0.25, 0.25, 1.02, "z", 24, [], m_bs, bevel=0.016)
    arm_xy = [
        (-0.24, -0.06), ( 0.16, -0.18), ( 0.24, -0.06), ( 0.16,  0.04),
        ( 0.28,  0.62), ( 0.16,  1.14), (-0.26,  1.08), (-0.42,  0.88),
        (-0.30,  0.72), (-0.44,  0.38),
    ]
    arm = mk_extrude_z("hm_arm", arm_xy, -0.22, 0.22, bevel=0.022, bevel_segs=2, xform=[("rz", 1.52)], mat=m_bs)
    solid = bool_union([hub, arm], "hm_solid")

    body = bool_subtract(solid, [
        mk_cyl("c_hm_bore", 0.095, 0.095, 1.18, "z", 18, [], m_in),
        mk_cyl("c_hm_pkL",  0.150, 0.150, 0.08, "z", 16, [("t", -0.55, 0.02, -0.23)], m_in),
        mk_cyl("c_hm_pkR",  0.150, 0.150, 0.08, "z", 16, [("t", -0.55, 0.02,  0.23)], m_in),
    ])

    parts = [
        body,
        mk_coil_spring("hm_cL", "z", -0.49, -0.25, 0.0, 0.0, 0.31, 0.032, 4.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_coil_spring("hm_cR", "z",  0.25,  0.49, 0.0, 0.0, 0.31, 0.032, 4.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_cyl("hm_brg", 0.030, 0.030, 0.48, "z", 10, [("t", -0.52, 0.12, 0.0)], m_sp),
    ]
    obj = join_objects(parts, "scar_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_trigger(mats: dict) -> bpy.types.Object:
    m_hw = mats["M_DarkHardware"]
    m_bs = mats["M_FcgStainless"]
    m_sp = mats["M_SpringSteel"]
    m_in = mats["M_InnerDark"]

    shoe_xy = [(-0.18, -0.06), (0.20, -0.06)]
    shoe_xy += _quad_bez((0.20, -0.06), (0.02, -0.82), (0.28, -1.38), 10)
    shoe_xy.append((0.04, -1.48))
    shoe_xy += _quad_bez((0.04, -1.48), (-0.26, -0.86), (-0.18, -0.06), 10)

    solid = bool_union([
        mk_cyl("tr_hub", 0.18, 0.18, 0.68, "z", 20, [], m_hw, bevel=0.014),
        mk_extrude_z("tr_shoe", shoe_xy, -0.19, 0.19, bevel=0.022, bevel_segs=2, mat=m_hw),
        mk_box("tr_sbarL", 0.94, 0.32, 0.15, [("t",  0.42, 0.18, -0.25)], m_hw, bevel=0.016),
        mk_box("tr_sbarR", 0.94, 0.32, 0.15, [("t",  0.42, 0.18,  0.25)], m_hw, bevel=0.016),
        mk_box("tr_tail",  0.84, 0.24, 0.58, [("t", -0.48, 0.05,  0.00)], m_hw, bevel=0.016),
    ], "tr_solid")

    carved = bool_subtract(solid, [
        mk_cyl("c_tr_bore", 0.085, 0.085, 1.12, "z", 16, [], m_in),
        mk_box("c_tr_disc", 1.12,  0.38,  0.24, [("t", -0.12, 0.22, 0.0)], m_in),
    ])

    parts = [
        carved,
        mk_box("tr_nose", 0.18, 0.12, 0.64, [("t", 0.82, 0.28, 0.0)], m_bs, bevel=0.012),
        mk_coil_spring("tr_cL", "z", -0.48, -0.34, 0.0, 0.0, 0.23, 0.024, 3.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_coil_spring("tr_cR", "z",  0.34,  0.48, 0.0, 0.0, 0.23, 0.024, 3.0, ring_segs=8, steps_per_coil=14, mat=m_sp),
        mk_cyl("tr_legL", 0.030, 0.030, 1.56, "x", 10, [("rz", 0.14), ("t", 0.62, 0.16, -0.38)], m_sp),
        mk_cyl("tr_legR", 0.030, 0.030, 1.56, "x", 10, [("rz", 0.14), ("t", 0.62, 0.16,  0.38)], m_sp),
    ]
    obj = join_objects(parts, "scar_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_scar_disconnector(mats: dict) -> bpy.types.Object:
    m_bs = mats["M_FcgStainless"]
    m_sp = mats["M_SpringSteel"]
    m_in = mats["M_InnerDark"]

    disc_xy = [
        (-0.48, -0.20), ( 0.48, -0.20), ( 0.58,  0.32), ( 0.32,  0.56),
        ( 0.18,  0.42), ( 0.28,  0.28), (-0.04,  0.18), (-0.42,  0.10),
    ]
    body_raw = mk_extrude_z("dc_body", disc_xy, -0.10, 0.10, bevel=0.016, bevel_segs=1, mat=m_bs)
    body = bool_subtract(body_raw, [
        mk_cyl("c_dc_piv", 0.085, 0.085, 0.36, "z", 14, [("t", 0.10, -0.12, 0.0)], m_in),
    ])
    parts = [
        body,
        mk_coil_spring("dc_sp", "y", -0.44, -0.06, -0.26, 0.0, 0.075, 0.020, 5.5, ring_segs=8, steps_per_coil=14, mat=m_sp),
    ]
    obj = join_objects(parts, "scar_disconnector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def _stanag_center_x(y: float) -> float:
    if y >= -1.20:
        return 0.0
    u = min(1.0, (-1.20 - y) / 6.40)
    return 0.72 * u * u


def build_scar_mag_body(mats: dict) -> bpy.types.Object:
    m_mg = mats["M_StanagFdeCoated"]
    m_bs = mats["M_FcgStainless"]
    m_in = mats["M_InnerDark"]

    # Smooth curved STANAG 4179 steel magazine profile matching scarExtraGeometries.ts exact curve
    half_w = 1.38
    steps = 40
    cos_a, sin_a = math.cos(0.15), math.sin(0.15)
    pts_xy: list[tuple[float, float]] = []

    for i in range(steps + 1):
        u = i / steps
        y_mid = 2.55 - u * (2.55 - (-7.60))
        x_mid = _stanag_center_x(y_mid)
        ang = 0.0 if y_mid >= -1.20 else 0.15 * ((-1.20 - y_mid) / 6.40)
        pts_xy.append((x_mid - math.cos(ang) * half_w, y_mid - math.sin(ang) * half_w))

    pts_xy.append((0.72 + cos_a * half_w, -7.60 + sin_a * half_w))

    for i in range(steps, -1, -1):
        u = i / steps
        y_mid = 2.55 - u * (2.55 - (-7.60))
        x_mid = _stanag_center_x(y_mid)
        ang = 0.0 if y_mid >= -1.20 else 0.15 * ((-1.20 - y_mid) / 6.40)
        pts_xy.append((x_mid + math.cos(ang) * half_w, y_mid + math.sin(ang) * half_w))

    raw_body = mk_extrude_z("mb_raw", pts_xy, -0.56, 0.56, bevel=0.060, bevel_segs=3, mat=m_mg)

    cutters = [
        mk_box("c_mb_thr", 2.32, 2.35, 0.88, [("t",  0.00, 1.58,  0.00)], m_in),
        mk_box("c_mb_frn", 0.42, 0.34, 0.72, [("t",  1.28, 2.48,  0.00)], m_in),
        mk_box("c_mb_bho", 0.42, 0.42, 0.46, [("t", -1.28, 2.42, -0.18)], m_in),
        mk_box("c_mb_mcL", 0.54, 0.28, 0.22, [("t", -0.82, 1.05, -0.58)], m_in),
        mk_box("c_mb_mcR", 0.54, 0.28, 0.22, [("t", -0.82, 1.05,  0.58)], m_in),
    ]
    # 10 / 20 / 30-rd rear-spine witness holes
    for w_i, wy in enumerate((-1.65, -3.95, -6.15)):
        wcx = _stanag_center_x(wy)
        wang = 0.15 * ((-1.20 - wy) / 6.40)
        cutters.append(
            mk_cyl(f"c_mb_wit_{w_i}", 0.08, 0.08, 0.44, "x", 14,
                   [("rz", wang), ("t", wcx - math.cos(wang) * 1.34, wy - math.sin(wang) * 1.34, 0.0)], m_in)
        )
    hollowed = bool_subtract(raw_body, cutters, solver="EXACT")

    parts: list[bpy.types.Object] = [
        hollowed,
        # Rear magwell over-insertion stop tab
        mk_box("mb_stop", 0.14, 0.32, 0.56, [("t", -1.42, 0.65, 0.0)], m_mg, bevel=0.018),
    ]
    # 4 Stamped horizontal anti-crush stiffening ribs
    for r_i, ry in enumerate((-2.20, -3.55, -4.90, -6.25)):
        cx = _stanag_center_x(ry)
        ang = 0.15 * ((-1.20 - ry) / 6.40)
        parts.append(mk_box(f"mb_rib_{r_i}", 2.05, 0.24, 1.24, [("rz", ang), ("t", cx, ry, 0.0)], m_mg, bevel=0.038, bevel_segs=3))

    # Twin rolled C-curl bright stainless STANAG feed lips w/ forward cartridge-release taper
    for s_idx, side in enumerate((-1.0, 1.0)):
        lip_zy = [(0.49 * side, 2.44), (0.49 * side, 2.61)]
        lip_zy += _quad_bez((0.49 * side, 2.61), (0.49 * side, 2.71), (0.39 * side, 2.71), 5)
        lip_zy.append((0.25 * side, 2.69))
        lip_zy += _quad_bez((0.25 * side, 2.69), (0.21 * side, 2.66), (0.24 * side, 2.62), 4)
        lip_zy.append((0.36 * side, 2.60))
        lip_zy += _quad_bez((0.36 * side, 2.60), (0.40 * side, 2.59), (0.40 * side, 2.52), 4)
        lip_zy.append((0.40 * side, 2.44))
        lip_obj = mk_extrude_x(f"mb_lip_{s_idx}", lip_zy, -1.18, 1.10, bevel=0.010, bevel_segs=1, mat=m_bs)
        # Apply gentle forward cartridge-release flare taper in Blender coords (tx = v.co.x, ty = v.co.z)
        bm = bmesh.new()
        bm.from_mesh(lip_obj.data)
        for v in bm.verts:
            tx, ty = v.co.x, v.co.z
            if tx > 0.35 and ty > 2.56:
                t = min(1.0, (tx - 0.35) / 0.72)
                v.co.z = ty - t * 0.06 * ((ty - 2.56) / 0.15)
        bm.to_mesh(lip_obj.data)
        bm.free()
        parts.append(lip_obj)

    obj = join_objects(parts, "scar_mag_body")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_scar_mag_spring(mats: dict) -> bpy.types.Object:
    m_sp = mats["M_SpringSteel"]
    coils = 9
    steps_per_coil = 24
    total_steps = coils * steps_per_coil
    cos_t, sin_t = math.cos(0.15), math.sin(0.15)
    pts: list[Vector] = []
    for i in range(total_steps + 1):
        u = i / total_steps
        y_mid = -7.46 + u * 1.24
        x_mid = _stanag_center_x(y_mid)
        th = u * coils * 2.0 * math.pi
        c_th, s_th = math.cos(th), math.sin(th)
        r_off = math.copysign(abs(c_th) ** 0.6, c_th) * 0.74
        dz = math.copysign(abs(s_th) ** 0.6, s_th) * 0.30
        pts.append(Vector((x_mid + cos_t * r_off, y_mid + sin_t * r_off, dz)))
    obj = mk_tube_along_pts("scar_mag_spring", pts, 0.036, ring_segs=8, mat=m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=45.0, weighted_normals=False)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart CONCAVE Packing (margin = 0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

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
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            is_hero = skip_face_fn(o.name, f, mname) if skip_face_fn else False
            f.select = not is_hero
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.004,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=0.0045,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du = u1 - u0
    dv = v1 - v0
    packed_u_min, packed_u_max = 1.0, 0.0
    packed_v_min, packed_v_max = 1.0, 0.0
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if skip_face_fn and skip_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                packed_u_min = min(packed_u_min, ux)
                packed_u_max = max(packed_u_max, ux)
                packed_v_min = min(packed_v_min, vy)
                packed_v_max = max(packed_v_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = packed_u_max - packed_u_min
    span_v = packed_v_max - packed_v_min
    print(f"  [UV-PACK] {len(objs)} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.50 and span_v > 0.50, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_upper_atlas(upper_objs: list[bpy.types.Object]):
    """Unwraps 3 monolithic upper parts into `scar_v3_upper` (2048x2048):
      - Hero Band 1 (Upper Rear Left  Flank, X in [-6.40, +5.60], Y in [0.35, 2.52]): [0.015, 0.985] x [0.765, 0.985]
      - Hero Band 2 (Upper Rear Right Flank, X in [-6.40, +5.60], Y in [0.35, 2.52]): [0.015, 0.985] x [0.530, 0.750]
      - Hero Band 3 (Top M1913 Monolithic Rail Crests, X in [-6.35, +13.55]):         [0.015, 0.985] x [0.460, 0.515]
      - Packed Region (Upper forend, rails, interior, rear sight, 6 Torx crossbolts): [0.010, 0.990] x [0.010, 0.445]
    """
    def is_hero_face(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "scar_upper_receiver":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if mat_name == "U_ChampagneAnodize":
            if -6.43 <= tx <= 5.63 and 0.33 <= ty <= 2.54:
                if nz > 0.85 and 0.855 <= tz <= 0.910:
                    return True
                if nz < -0.85 and -0.910 <= tz <= -0.855:
                    return True
        if mat_name == "U_RailCrestFDE":
            if -6.36 <= tx <= 13.56 and ty > 3.095 and ny > 0.85 and abs(tz) <= 0.49:
                return True
        return False

    _smart_unwrap_and_pack_rect(upper_objs, 0.010, 0.990, 0.010, 0.445, skip_face_fn=is_hero_face)

    up = next(o for o in upper_objs if o.name == "scar_upper_receiver")
    bm = bmesh.new()
    bm.from_mesh(up.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in up.data.materials]
    n_left = n_right = n_rail = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_face("scar_upper_receiver", f, mname):
            continue
        if mname == "U_ChampagneAnodize":
            is_right = (-f.normal.y) > 0.0
            if is_right:
                n_right += 1
            else:
                n_left += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx - (-6.40)) / 12.00))
                yn = max(0.0, min(1.0, (ty - 0.35) / 2.17))
                if is_right:
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.530 + yn * 0.220)
                else:
                    loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.765 + yn * 0.220)
        elif mname == "U_RailCrestFDE":
            n_rail += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x, -vco.y
                xn = max(0.0, min(1.0, (tx - (-6.35)) / 19.90))
                zn = max(0.0, min(1.0, (tz + 0.48) / 0.96))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.515 - zn * 0.055)
    bm.to_mesh(up.data)
    bm.free()
    print(f"  [UV-HERO] scar_v3_upper hero faces: left={n_left}, right={n_right}, top_rail={n_rail}")
    assert n_left > 0 and n_right > 0 and n_rail > 0, "Missing upper hero UV faces!"


def unwrap_fde_polymer_atlas(poly_objs: list[bpy.types.Object]):
    """Unwraps 8 FDE/black polymer & rubber parts into `scar_v3_fde_polymer` (2048x2048):
      - Hero Band 1 (Lower Left  Flank, S/1/A):            [0.015, 0.985] x [0.800, 0.985]
      - Hero Band 2 (Lower Right Flank, S/1/A):            [0.015, 0.985] x [0.600, 0.785]
      - Firewalled Box (Safety-Orange Mag Follower):       [0.015, 0.175] x [0.015, 0.215]  (>=60px moat!)
      - Isolated Box (FDE Ranger Mag Floorplate):          [0.015, 0.175] x [0.245, 0.580]
      - Isolated Box (Black A2 Grip, Buttpad & Selector):  [0.205, 0.455] x [0.015, 0.580]
      - Main FDE Polymer (Ugg Stock, Cheek Riser & Lower): [0.480, 0.985] x [0.015, 0.580]
    """
    def is_lower_hero_face(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "scar_lower_receiver" or mat_name != "P_LowerCoyote":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -5.68 <= tx <= 4.98 and -2.40 <= ty <= 0.42:
            if nz > 0.85 and 0.780 <= tz <= 0.855:
                return True
            if nz < -0.85 and -0.855 <= tz <= -0.780:
                return True
        return False

    follower_grp = [o for o in poly_objs if o.name == "scar_mag_follower"]
    floor_grp = [o for o in poly_objs if o.name == "scar_mag_floorplate"]
    grip_grp = [o for o in poly_objs if o.name == "scar_pistol_grip"]
    pad_sel_grp = [o for o in poly_objs if o.name in {"scar_buttpad", "scar_selector"}]
    fde_main_grp = [o for o in poly_objs if o.name in {"scar_buttstock", "scar_cheek_riser", "scar_lower_receiver"}]

    _smart_unwrap_and_pack_rect(follower_grp, 0.015, 0.175, 0.015, 0.215)
    _smart_unwrap_and_pack_rect(floor_grp,    0.015, 0.175, 0.245, 0.580)
    _smart_unwrap_and_pack_rect(grip_grp,     0.200, 0.340, 0.015, 0.580)
    _smart_unwrap_and_pack_rect(pad_sel_grp,  0.355, 0.465, 0.015, 0.580)
    _smart_unwrap_and_pack_rect(fde_main_grp, 0.485, 0.985, 0.015, 0.580, skip_face_fn=is_lower_hero_face)

    lo = next(o for o in poly_objs if o.name == "scar_lower_receiver")
    bm = bmesh.new()
    bm.from_mesh(lo.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in lo.data.materials]
    n_left = n_right = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_lower_hero_face("scar_lower_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        if is_right:
            n_right += 1
        else:
            n_left += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-5.65)) / 10.60))
            yn = max(0.0, min(1.0, (ty - (-2.38)) / 2.76))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.600 + yn * 0.185)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.800 + yn * 0.185)
    bm.to_mesh(lo.data)
    bm.free()
    print(f"  [UV-HERO] scar_v3_fde_polymer lower hero faces: left={n_left}, right={n_right}")
    assert n_left > 0 and n_right > 0, "Missing lower receiver hero UV faces!"


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 14 ordnance/BCG/FCG/STANAG parts into `scar_v3_metal` (2048x2048):
      - Hero Band 1 (STANAG Magazine Right Flank):             [0.015, 0.185] x [0.015, 0.985]
      - Hero Band 2 (STANAG Magazine Left  Flank):             [0.200, 0.370] x [0.015, 0.985]
      - Firewalled Mag Non-Hero (spines, ribs, feed lips):     [0.395, 0.535] x [0.015, 0.485]
      - Exterior Ordnance (barrel, 3-prong, gas block, CH):    [0.395, 0.985] x [0.505, 0.985]
      - Internal BCG/Piston/Bolt/FCG/Recoil/MagSpring:         [0.555, 0.985] x [0.015, 0.485]
    """
    def is_mag_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "scar_mag_body" or mat_name != "M_StanagFdeCoated":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if nz > 0.85 and 0.530 <= tz <= 0.585:
            return True
        if nz < -0.85 and -0.585 <= tz <= -0.530:
            return True
        return False

    mag_grp = [o for o in metal_objs if o.name == "scar_mag_body"]
    ext_ord = [o for o in metal_objs if o.name in {
        "scar_barrel", "scar_flash_suppressor", "scar_gas_block", "scar_charging_handle"
    }]
    int_mech = [o for o in metal_objs if o not in mag_grp and o not in ext_ord]

    _smart_unwrap_and_pack_rect(mag_grp,  0.395, 0.535, 0.015, 0.485, skip_face_fn=is_mag_hero_flank)
    _smart_unwrap_and_pack_rect(ext_ord,  0.395, 0.985, 0.505, 0.985)
    _smart_unwrap_and_pack_rect(int_mech, 0.555, 0.985, 0.015, 0.485)

    mag = mag_grp[0]
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    n_left = n_right = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_hero_flank("scar_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        if is_right:
            n_right += 1
        else:
            n_left += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            x_mid = _stanag_center_x(ty)
            ang = 0.0 if ty >= -1.20 else 0.15 * min(1.0, (-1.20 - ty) / 6.40)
            dx_perp = (tx - x_mid) * math.cos(ang)
            r_norm = max(0.0, min(1.0, (dx_perp + 1.38) / 2.76))
            v_norm = max(0.0, min(1.0, (ty - (-7.60)) / 10.15))
            v_val = 0.015 + v_norm * 0.970
            if is_right:
                u_val = 0.015 + r_norm * 0.170
            else:
                u_val = 0.200 + (1.0 - r_norm) * 0.170
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(mag.data)
    bm.free()
    print(f"  [UV-HERO] scar_v3_metal STANAG mag hero faces: left={n_left}, right={n_right}")
    assert n_left > 0 and n_right > 0, "Missing STANAG mag hero UV faces!"


# =============================================================================
# Cycles Multi-Channel GPU Baking Engine
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
        o.location = (i * 60.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
            o.rotation_euler = (rx, -rz, ry)
        else:
            o.hide_render = True
            o.location = (0.0, 200.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object], tmp_dir: Path):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
                 normal_op: bool = False, extra_objs_override=None):
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
    run_bake("albedo", "EMIT", samples=4, fill_color=(0.05, 0.045, 0.035, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=4, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=4, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.60
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.45
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.14) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.14:
            print(f"       !! BBOX DELTA > 0.14cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    return report


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    select_only(all_objs, all_objs[0])
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


def _build_baked_preview_mat(suite_name: str, prefix: str, normal_strength: float = 0.90) -> bpy.types.Material:
    mat = bpy.data.materials.new(f"Preview_{suite_name}")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def _load_tex(path: Path, cs: str):
        img = bpy.data.images.load(str(path), check_existing=False)
        img.colorspace_settings.name = cs
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = img
        return node

    t_alb = _load_tex(TEX_OUT_DIR / f"{prefix}_albedo.webp", "sRGB")
    t_orm = _load_tex(TEX_OUT_DIR / f"{prefix}_roughness.webp", "Non-Color")
    t_nrm = _load_tex(TEX_OUT_DIR / f"{prefix}_normal.webp", "Non-Color")

    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])
    mix_ao = nt.nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.blend_type = "MULTIPLY"
    mix_ao.inputs["Factor"].default_value = 0.55
    nt.links.new(t_alb.outputs["Color"], mix_ao.inputs[6])
    nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = normal_strength
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])

    nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def render_qa_previews(upper_objs, poly_objs, metal_objs, all_objs):
    scene = bpy.context.scene
    m_up = _build_baked_preview_mat("upper", "scar_v3_upper", 0.90)
    m_pl = _build_baked_preview_mat("poly", "scar_v3_fde_polymer", 0.92)
    m_mt = _build_baked_preview_mat("metal", "scar_v3_metal", 0.90)
    for grp, mat in ((upper_objs, m_up), (poly_objs, m_pl), (metal_objs, m_mt)):
        for o in grp:
            o.data.materials.clear()
            o.data.materials.append(mat)
    for o in all_objs:
        o.hide_render = False
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
        o.rotation_euler = (rx, -rz, ry)

    hdri = REPO_ROOT / "public" / "hdri" / "gunsmith_bench.hdr"
    wn = scene.world.node_tree
    wn.nodes.clear()
    wout = wn.nodes.new("ShaderNodeOutputWorld")
    bg = wn.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.95
    if hdri.exists():
        env = wn.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri), check_existing=False)
        wn.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.14, 0.15, 0.17, 1.0)
    wn.links.new(bg.outputs["Background"], wout.inputs["Surface"])

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.film_transparent = False
    scene.cycles.samples = 36
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"

    cam_d = bpy.data.cameras.new("QACam")
    cam_d.lens = 58.0
    cam_o = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    def _aim(pos_t, tgt_t, lens=58.0):
        cam_d.lens = lens
        p = t2b(*pos_t)
        t = t2b(*tgt_t)
        cam_o.location = p
        cam_o.rotation_euler = (t - p).to_track_quat("-Z", "Y").to_euler()

    shots = [
        ("right",        ( 4.0,  2.8,  39.0), ( 2.0, -0.5,  0.0), 50.0),
        ("left",         ( 4.0,  2.8, -39.0), ( 2.0, -0.5,  0.0), 50.0),
        ("macro_breech", ( 0.8,  1.2,  14.8), ( 0.2,  0.4,  0.0), 68.0),
        ("macro_forend", (14.5,  2.2,  16.5), (12.8,  1.2,  0.0), 65.0),
        ("macro_stock",  (-9.2, -0.5,  19.5), (-9.2, -1.2,  0.0), 62.0),
    ]
    for tag, pos_t, tgt_t, lens in shots:
        _aim(pos_t, tgt_t, lens)
        out_p = Path(f"/tmp/scar_qa_{tag}.png")
        scene.render.filepath = str(out_p)
        bpy.ops.render.render(write_still=True)
        print(f"[PREVIEW] Rendered {out_p}")


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: Monolithic Upper, Rear Sight & Barrel Crossbolts (3 parts)
        "scar_upper_receiver":    build_scar_upper_receiver,
        "scar_rear_sight":        build_scar_rear_sight,
        "scar_barrel_crossbolts": build_scar_barrel_crossbolts,
        # Suite 2: FDE Polymer Lower, Black A2 Grip, Ugg-Boot Stock, Riser, Buttpad, Selector, Follower & Floorplate (8 parts)
        "scar_lower_receiver":    build_scar_lower_receiver,
        "scar_pistol_grip":       build_scar_pistol_grip,
        "scar_buttstock":         build_scar_buttstock,
        "scar_cheek_riser":       build_scar_cheek_riser,
        "scar_buttpad":           build_scar_buttpad,
        "scar_selector":          build_scar_selector,
        "scar_mag_follower":      build_scar_mag_follower,
        "scar_mag_floorplate":    build_scar_mag_floorplate,
        # Suite 3: CHF Barrel, 3-Prong Suppressor, Gas System, Monolithic BCG, FCG & STANAG Mag (14 parts)
        "scar_barrel":            build_scar_barrel,
        "scar_flash_suppressor":  build_scar_flash_suppressor,
        "scar_gas_block":         build_scar_gas_block,
        "scar_gas_piston":        build_scar_gas_piston,
        "scar_bolt_carrier":      build_scar_bolt_carrier,
        "scar_charging_handle":   build_scar_charging_handle,
        "scar_bolt":              build_scar_bolt,
        "scar_firing_pin":        build_scar_firing_pin,
        "scar_recoil_rod":        build_scar_recoil_rod,
        "scar_hammer":            build_scar_hammer,
        "scar_trigger":           build_scar_trigger,
        "scar_disconnector":      build_scar_disconnector,
        "scar_mag_body":          build_scar_mag_body,
        "scar_mag_spring":        build_scar_mag_spring,
    }

    print("[BUILD] Sculpting all 25 solid FN SCAR-L Mk 16 Mod 0 hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    upper_objs = [built[pid] for pid in UPPER_PARTS]
    poly_objs = [built[pid] for pid in FDE_POLYMER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs = upper_objs + poly_objs + metal_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: upper (3), fde_polymer (8), metal (14)...")
    unwrap_upper_atlas(upper_objs)
    unwrap_fde_polymer_atlas(poly_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("upper", upper_objs), ("fde_polymer", poly_objs), ("metal", metal_objs)):
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
            assert 0.00003 < oa < 0.94, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:12s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    print("[TRI] Pre-bake triangulation with preserved custom split normals...")
    triangulate_keep_normals(all_objs)

    with tempfile.TemporaryDirectory(prefix="scar_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking scar_v3_upper (2048x2048, 3 monolithic upper/sight/crossbolt parts)...")
        bake_atlas_suite("upper", upper_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking scar_v3_fde_polymer (2048x2048, 8 FDE/black polymer & firewalled follower parts)...")
        bake_atlas_suite("poly", poly_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking scar_v3_metal (2048x2048, 14 barrel/piston/BCG/FCG/STANAG mag parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)

        print("[POST] Compositing FN Herstal rollmarks, UID DataMatrix QR, S/1/A selectors, STANAG wear & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--preview" in sys.argv:
        render_qa_previews(upper_objs, poly_objs, metal_objs, all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "scar_v3_upper_albedo.webp",
        TEX_OUT_DIR / "scar_v3_upper_normal.webp",
        TEX_OUT_DIR / "scar_v3_upper_roughness.webp",
        TEX_OUT_DIR / "scar_v3_fde_polymer_albedo.webp",
        TEX_OUT_DIR / "scar_v3_fde_polymer_normal.webp",
        TEX_OUT_DIR / "scar_v3_fde_polymer_roughness.webp",
        TEX_OUT_DIR / "scar_v3_metal_albedo.webp",
        TEX_OUT_DIR / "scar_v3_metal_normal.webp",
        TEX_OUT_DIR / "scar_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== FN SCAR-L MK 16 MOD 0 V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:38s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
