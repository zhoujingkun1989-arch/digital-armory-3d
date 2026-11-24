#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for H&K G11 K2 (4.73x33mm DM11 Caseless)
========================================================================================
MIT License — Digital Armory 3D (`WP-17` BAY-20 · "Kraut Space Magic")

Generates:
  - public/models/g11.glb (Draco-compressed glTF 2.0, all 22 solid parts; skips ONLY
    the 2 dynamic GPU-compressed helical springs carrying `aSpringParam`:
    `g11_recoil_spring`, `g11_mag_spring`)
  - public/textures/g11_v3_housing_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)
  - public/textures/g11_v3_clockwork_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/g11_v3_barrel_mag_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 22 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/g11/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_g11_photoreal.py
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
# MODE 2: System Python Post-Process (Oberndorf HK G11 K2 Rollmarks, Ulm Stag
#         Proofs, Red/White S/1/3/A Selector Icons, Hensoldt Emerald-Sapphire
#         Lenses, Clockwork Etching, 45-Rd Smoked DM11 Caseless Mag & 5-Ch ORM)
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

    def _draw_ulm_proof(draw: ImageDraw.ImageDraw, x: float, y: float, s: float = 1.0) -> None:
        """Crisp German Beschussamt Ulm stag-antler + Federal Eagle / N nitro proof stamps."""
        w_main = max(2, round(4.5 * s))
        w_tine = max(2, round(3.4 * s))
        draw.line(
            [(x, y + 36 * s), (x + 20 * s, y + 31 * s), (x + 38 * s, y + 17 * s), (x + 54 * s, y + 4 * s)],
            fill=255, width=w_main,
        )
        for pts in (
            [(x + 15 * s, y + 31 * s), (x + 9 * s, y + 19 * s), (x + 9 * s, y + 9 * s)],
            [(x + 26 * s, y + 25 * s), (x + 24 * s, y + 11 * s), (x + 30 * s, y + 3 * s)],
            [(x + 38 * s, y + 16 * s), (x + 38 * s, y + 2 * s)],
            [(x + 40 * s, y + 16 * s), (x + 57 * s, y + 18 * s), (x + 66 * s, y + 11 * s)],
        ):
            draw.line(pts, fill=255, width=w_tine)
        ex, ey = x + 96 * s, y + 18 * s
        draw.polygon(
            [
                (ex - 17 * s, ey - 15 * s), (ex + 17 * s, ey - 15 * s),
                (ex + 13 * s, ey + 2 * s), (ex, ey + 11 * s), (ex - 13 * s, ey + 2 * s),
            ],
            outline=255, width=max(2, round(3.2 * s)),
        )
        draw.line([(ex - 24 * s, ey - 10 * s), (ex + 24 * s, ey - 10 * s)], fill=255, width=max(2, round(3.2 * s)))
        draw.text((ex + 30 * s, y + 2 * s), "CIP N  KA", fill=250, font=_load_font(FONT_COND, round(34 * s)))

    def _draw_caseless_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float, w_px: float, h_px: float):
        """Mini rectangular 4.73x33mm DM11 caseless block icon for H&K G11 selector."""
        hw, hh = w_px * 0.5, h_px * 0.5
        draw.rectangle((cx - hw, cy - hh, cx + hw, cy + hh), fill=255)

    # -------------------------------------------------------------------------
    # SUITE 1 POST-PROCESS: g11_v3_housing (Olive-Charcoal Monocoque Casing,
    #   Oberndorf HK G11 K2 Rollmarks, Ulm Stag Proofs, Red/White S/1/3/A
    #   Selector Pictograms, Winding Crank Ring, Hensoldt Optic & Firewalled
    #   Emerald-Sapphire Multi-Coated Lenses!)
    # -------------------------------------------------------------------------
    def process_housing_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "housing_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "housing_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "housing_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "housing_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "housing_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "housing_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "housing_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        mold_dark = np.zeros((h, w), dtype=np.float32)
        white_ink = np.zeros((h, w), dtype=np.float32)
        red_ink = np.zeros((h, w), dtype=np.float32)

        # A) OUTER HOUSING HERO FLANKS (X in [-34.6, +30.6], span=65.2; Y in [-6.8, +6.6], span=13.4)
        #    Left  Flank (-Z): u[0.012, 0.988] (1 - xNorm: +X muzzle LEFT), v[0.760, 0.988]
        #    Right Flank (+Z): u[0.012, 0.988] (xNorm:     -X rear  LEFT),  v[0.518, 0.746]
        PPCM = 60.0
        X0, XSPAN = -34.6, 65.2
        Y0, YSPAN = -6.8, 13.4
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 3912 x 804

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        # --- 1) LEFT FLANK (-Z) ---
        lw = Image.new("L", (CW, CH), 0)
        lr = Image.new("L", (CW, CH), 0)
        lm = Image.new("L", (CW, CH), 0)
        dlw, dlr, dlm = ImageDraw.Draw(lw), ImageDraw.Draw(lr), ImageDraw.Draw(lm)

        # Crisp Oberndorf Red [HK] + White Rollmark Billboard cleanly at X in [-11.0 .. +5.5], Y in [+1.6 .. +5.4]
        # (Well forward of winding knob at X=-15.2, cleanly behind spare clips X>=+6.0, well above selector Y=-3.8!)
        bx0, bx1 = xw_to_cx_left(5.4), xw_to_cx_left(-11.0)
        by0, by1 = yw_to_cy(5.35), yw_to_cy(1.70)
        dlm.rounded_rectangle((bx0, by0, bx1, by1), radius=18, outline=220, width=5)
        # Iconic H&K Crimson [HK] Box
        dlr.rounded_rectangle((bx0 + 26, by0 + 26, bx0 + 146, by0 + 106), radius=10, outline=255, width=7)
        dlr.text((bx0 + 86, by0 + 66), "HK", fill=255, font=_load_font(FONT_DIN, 60), anchor="mm")
        dlw.text((bx0 + 168, by0 + 22), "G11 K2  -  CAL. 4.73×33 DM11", fill=255, font=_load_font(FONT_DIN, 54))
        dlw.text((bx0 + 168, by0 + 94), "HECKLER & KOCH GMBH  OBERNDORF / N.", fill=244, font=_load_font(FONT_DIN, 36))
        dlw.text((bx0 + 26, by0 + 150), "SER. 90 - 00473  -  CASELESS 2100 RPM", fill=236, font=_load_font(FONT_COND, 38))
        _draw_ulm_proof(dlw, bx0 + 570, by0 + 146, s=0.92)
        dlm.text((bx0 + 168, by0 + 22), "G11 K2  -  CAL. 4.73×33 DM11", fill=220, font=_load_font(FONT_DIN, 54))

        # Circular winding-crank bay legend around (-15.2, -0.8)
        wk_cx, wk_cy = xw_to_cx_left(-15.2), yw_to_cy(-0.8)
        wk_r = int(round(2.95 * PPCM))
        dlm.ellipse((wk_cx - wk_r, wk_cy - wk_r, wk_cx + wk_r, wk_cy + wk_r), outline=210, width=4)
        dlw.arc((wk_cx - wk_r - 12, wk_cy - wk_r - 12, wk_cx + wk_r + 12, wk_cy + wk_r + 12), 215, 325, fill=245, width=5)
        dlw.text((wk_cx, wk_cy - wk_r - 28), "SPANNEN / COCK 360°", fill=245, font=_load_font(FONT_COND, 30), anchor="mm")

        # Bottom emergency misfire clearing hatch indicator directly below rotary breech (X = -21.2)
        cl_x, cl_y = xw_to_cx_left(-21.2), yw_to_cy(-5.65)
        dlw.text((cl_x, cl_y), "AUSWURF / CLEAR", fill=232, font=_load_font(FONT_COND, 30), anchor="mm")
        for dx_tri in (-112, 112):
            dlw.polygon([(cl_x + dx_tri - 8, cl_y - 6), (cl_x + dx_tri + 8, cl_y - 6), (cl_x + dx_tri, cl_y + 7)], fill=232)

        # Subtle molded technical panel seam lines
        for sx_cm in (-27.0, -11.5, 5.8):
            sx_px = xw_to_cx_left(sx_cm)
            dlm.line([(sx_px, yw_to_cy(6.2)), (sx_px, yw_to_cy(-5.2))], fill=175, width=3)

        # Vivid Red/White `S / 1 / 3 / A` H&K Selector Cluster cleanly on flat olive flank ABOVE angled bottom edge!
        f_sel = _load_font(FONT_DIN, 38)
        for label, is_red, x_cm, y_cm in (
            ("S", False, -2.35, -2.35),
            ("1", False, -0.75, -2.25),
            ("3", True,   0.15, -2.92),
            ("A", True,   0.15, -3.62),
        ):
            tx = xw_to_cx_left(x_cm)
            ty = yw_to_cy(y_cm)
            target_d = dlr if is_red else dlw
            target_d.ellipse((tx + 24, ty - 5, tx + 34, ty + 5), fill=255)
            target_d.text((tx, ty), label, fill=255, font=f_sel, anchor="mm")
            dlm.text((tx, ty), label, fill=230, font=f_sel, anchor="mm")
            if label == "3":
                for bi in (-1, 0, 1):
                    _draw_caseless_icon(dlr, tx - 34, ty + bi * 9, 18, 6)
            elif label == "1":
                _draw_caseless_icon(dlw, tx - 34, ty, 18, 7)

        _paste_uv_band(white_ink, lw, 0.012, 0.988, 0.760, 0.988)
        _paste_uv_band(red_ink, lr, 0.012, 0.988, 0.760, 0.988)
        _paste_uv_band(mold_dark, lm, 0.012, 0.988, 0.760, 0.988)

        # --- 2) RIGHT FLANK (+Z) ---
        rw = Image.new("L", (CW, CH), 0)
        rr = Image.new("L", (CW, CH), 0)
        rm = Image.new("L", (CW, CH), 0)
        drw, drr, drm = ImageDraw.Draw(rw), ImageDraw.Draw(rr), ImageDraw.Draw(rm)

        rbx0, rbx1 = xw_to_cx_right(-24.0), xw_to_cx_right(4.5)
        rby0, rby1 = yw_to_cy(5.35), yw_to_cy(1.70)
        drm.rounded_rectangle((rbx0, rby0, rbx1, rby1), radius=18, outline=215, width=5)
        drr.rounded_rectangle((rbx0 + 28, rby0 + 26, rbx0 + 148, rby0 + 106), radius=10, outline=255, width=7)
        drr.text((rbx0 + 88, rby0 + 66), "HK", fill=255, font=_load_font(FONT_DIN, 60), anchor="mm")
        drw.text((rbx0 + 172, rby0 + 22), "G11 K2  -  4.73×33mm DM11 CASELESS", fill=255, font=_load_font(FONT_DIN, 54))
        drw.text((rbx0 + 172, rby0 + 94), "BUNDESWEHR VERSUCHSMUSTER  -  OBERNDORF / N.", fill=242, font=_load_font(FONT_DIN, 36))
        drw.text((rbx0 + 172, rby0 + 148), "ROTARY BREECH  -  3-RD 2100 RPM HYPERBURST  -  MADE IN WEST GERMANY", fill=228, font=_load_font(FONT_COND, 34))
        _draw_ulm_proof(drw, rbx1 - 310, rby0 + 142, s=0.92)

        for sx_cm in (-27.0, -11.5, 5.8):
            sx_px = xw_to_cx_right(sx_cm)
            drm.line([(sx_px, yw_to_cy(6.2)), (sx_px, yw_to_cy(-5.2))], fill=175, width=3)

        # Ambidextrous Right-Flank Red/White `S / 1 / 3 / A` Selector Cluster cleanly above bottom edge!
        for label, is_red, x_cm, y_cm in (
            ("S", False, -2.35, -2.35),
            ("1", False, -0.75, -2.25),
            ("3", True,   0.15, -2.92),
            ("A", True,   0.15, -3.62),
        ):
            tx = xw_to_cx_right(x_cm)
            ty = yw_to_cy(y_cm)
            target_d = drr if is_red else drw
            target_d.ellipse((tx - 34, ty - 5, tx - 24, ty + 5), fill=255)
            target_d.text((tx, ty), label, fill=255, font=f_sel, anchor="mm")
            drm.text((tx, ty), label, fill=230, font=f_sel, anchor="mm")
            if label == "3":
                for bi in (-1, 0, 1):
                    _draw_caseless_icon(drr, tx + 34, ty + bi * 9, 18, 6)
            elif label == "1":
                _draw_caseless_icon(drw, tx + 34, ty, 18, 7)

        _paste_uv_band(white_ink, rw, 0.012, 0.988, 0.518, 0.746)
        _paste_uv_band(red_ink, rr, 0.012, 0.988, 0.518, 0.746)
        _paste_uv_band(mold_dark, rm, 0.012, 0.988, 0.518, 0.746)

        # B) INTEGRAL CARRY-HANDLE OPTIC FLANK STAMPS (Left u[0.012,0.488], Right u[0.512,0.988], v[0.395,0.502])
        OW, OH = 1480, 300
        for is_left, (u0_o, u1_o) in ((True, (0.012, 0.488)), (False, (0.512, 0.988))):
            ow_im = Image.new("L", (OW, OH), 0)
            dow = ImageDraw.Draw(ow_im)
            txt_top = "HENSOLDT WETZLAR  -  1× / 3.5× OPTIK" if is_left else "HK G11 K2  -  INTEGRAL REFLEX OPTIK"
            txt_sub = "4.73×33 DM11  -  0 - 300 - 600 m"
            dow.text((OW // 2, 74), txt_top, fill=248, font=_load_font(FONT_DIN, 38), anchor="mm")
            dow.text((OW // 2, 126), txt_sub, fill=225, font=_load_font(FONT_COND, 30), anchor="mm")
            _paste_uv_band(white_ink, ow_im, u0_o, u1_o, 0.395, 0.502)

        # C) FIREWALLED EMERALD-SAPPHIRE MULTI-COATED HENSOLDT LENSES (u[0.855, 0.985], v[0.240, 0.365])
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        lens_zone = (
            (u_grid >= 0.855) & (u_grid <= 0.985) & (v_grid >= 0.240) & (v_grid <= 0.365)
        ).astype(np.float32)
        lu = (u_grid - 0.920) / 0.065
        lv = (v_grid - 0.3025) / 0.0625
        lr_rad = np.hypot(lu, lv)
        # Dichroic emerald-green center transitioning to sapphire-blue peripheral AR coating + crisp studio glint!
        emerald = np.array([0.055, 0.54, 0.40], dtype=np.float32)
        sapphire = np.array([0.08, 0.26, 0.68], dtype=np.float32)
        t_dich = _smoothstep(0.20, 0.95, lr_rad)
        lens_rgb = emerald * (1.0 - t_dich[..., None]) + sapphire * t_dich[..., None]
        glint = np.exp(-((lu + 0.28) ** 2 + (lv - 0.28) ** 2) / 0.09) * 0.45
        lens_rgb = np.clip(lens_rgb + glint[..., None] * np.array([0.55, 0.98, 0.92], dtype=np.float32), 0.0, 1.0)
        albedo = albedo * (1.0 - lens_zone[..., None]) + lens_rgb * lens_zone[..., None]
        rgh = rgh * (1.0 - lens_zone) + 0.07 * lens_zone
        met = met * (1.0 - lens_zone) + 0.28 * lens_zone
        ao = ao * (1.0 - lens_zone) + np.clip(1.0 - 0.25 * lr_rad * lr_rad, 0.68, 1.0) * lens_zone

        # D) HERO CIRCULAR FACE OF WINDING KNOB (`g11_winding_knob` -Z outer face: u[0.625, 0.745], v[0.015, 0.135])
        #    Machined satin gunmetal disc w/ radial concentric lathe brushing, bright beveled rim & clockwise arrow!
        wk_zone = (
            (u_grid >= 0.625) & (u_grid <= 0.745) & (v_grid >= 0.015) & (v_grid <= 0.135)
        ).astype(np.float32)
        wu = (u_grid - 0.685) / 0.060
        wv = (v_grid - 0.075) / 0.060
        wr = np.hypot(wu, wv)
        radial_brush = (np.sin(wr * 78.0) * 0.5 + 0.5) * wk_zone
        rim_bevel_hi = _smoothstep(0.84, 0.93, wr) * (1.0 - _smoothstep(0.95, 1.02, wr)) * wk_zone
        inner_groove = np.exp(-np.square((wr - 0.68) / 0.032)) * wk_zone
        albedo = albedo + ((radial_brush - 0.5 * wk_zone) * 0.065 + rim_bevel_hi * 0.24 - inner_groove * 0.14)[..., None]
        albedo = np.clip(albedo, 0.0, 1.0)
        rgh = np.clip(rgh + (radial_brush - 0.5 * wk_zone) * 0.05 - rim_bevel_hi * 0.10, 0.06, 0.94)
        # Subtle white index ticks around perimeter of machined winding knob disc
        wk_im = Image.new("L", (256, 256), 0)
        dwk = ImageDraw.Draw(wk_im)
        for ang_deg in range(0, 360, 30):
            rad_a = math.radians(ang_deg)
            p0 = (128 + math.cos(rad_a) * 96, 128 + math.sin(rad_a) * 96)
            p1 = (128 + math.cos(rad_a) * 112, 128 + math.sin(rad_a) * 112)
            dwk.line([p0, p1], fill=215, width=3)
        _paste_uv_band(white_ink, wk_im, 0.625, 0.745, 0.015, 0.135)

        # Composite recessed polymer rollmarks + crisp white & crimson enamel (ZERO touch on firewalls!)
        m_bev = _bevel_mask(mold_dark, width_px=1.4)
        w_bev = _bevel_mask(white_ink, width_px=1.3)
        r_bev = _bevel_mask(red_ink, width_px=1.3)
        decal_h = -0.46 * m_bev - 0.36 * np.maximum(w_bev, r_bev) + 0.05 * radial_brush - 0.18 * inner_groove

        _mix(albedo, (0.145, 0.160, 0.142), mold_dark * 0.72)
        _mix(rgh, 0.52, mold_dark * 0.60)
        ao *= 1.0 - 0.14 * mold_dark

        _mix(albedo, (0.94, 0.94, 0.93), white_ink * 0.96)
        _mix(rgh, 0.32, white_ink * 0.90)
        _mix(met, 0.02, white_ink * 0.96)

        _mix(albedo, (0.87, 0.068, 0.055), red_ink * 0.97)
        _mix(rgh, 0.24, red_ink * 0.90)
        _mix(met, 0.02, red_ink * 0.96)
        ao *= 1.0 - 0.08 * np.maximum(white_ink, red_ink)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.06, 0.94)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_housing_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_housing_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_housing_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g11_v3_housing_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2 POST-PROCESS: g11_v3_clockwork (Floating Inner Steel Receiver
    #   Laser Markings & Rail Wear, Brushed-Chrome 90-Deg Rotary Breech Sunburst
    #   Polish & Proof Etch, Swiss-Watch Stainless & Brass Spur Gears!)
    # -------------------------------------------------------------------------
    def process_clockwork_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "clockwork_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "clockwork_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "clockwork_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "clockwork_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "clockwork_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "clockwork_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "clockwork_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        silver_etch = np.zeros((h, w), dtype=np.float32)
        dark_etch = np.zeros((h, w), dtype=np.float32)

        # 1) Floating Inner Steel Receiver Left/Right Flanks (X in [-28.8, +14.2], Y in [-3.3, +2.2])
        #    Left  (-Z): u[0.012, 0.988], v[0.855, 0.988]
        #    Right (+Z): u[0.012, 0.988], v[0.710, 0.843]
        RW, RH = 2580, 330
        for is_left, (v0_r, v1_r) in ((True, (0.855, 0.988)), (False, (0.710, 0.843))):
            im_r = Image.new("L", (RW, RH), 0)
            dr = ImageDraw.Draw(im_r)
            # Clean unobstructed forward chassis bar X in [-9.0 .. +12.0]
            tx = int(round((1.0 - (1.5 - (-28.8)) / 43.0) * RW)) if is_left else int(round((1.5 - (-28.8)) / 43.0 * RW))
            dr.text((tx, 108), "HK G11 K2  -  VERSCHLUSSGEHÄUSE  -  SN 90-00473", fill=255, font=_load_font(FONT_DIN, 44), anchor="mm")
            dr.text((tx, 168), "4.73×33 DM11  -  2100 RPM FLOATING ACTION  -  OBERNDORF", fill=236, font=_load_font(FONT_COND, 34), anchor="mm")
            _paste_uv_band(silver_etch, im_r, 0.012, 0.988, v0_r, v1_r)

        # 2) Brushed-Chrome 90° Rotary Breech End-Cheeks (u[0.015, 0.275], v[0.430, 0.690])
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        cheek_m = ((u_grid >= 0.015) & (u_grid <= 0.275) & (v_grid >= 0.430) & (v_grid <= 0.690)).astype(np.float32)
        cu = (u_grid - 0.145) / 0.130
        cv = (v_grid - 0.560) / 0.130
        rad_c = np.hypot(cu, cv)
        # Fine concentric lathe turning grooves on the chrome rotary breech face!
        lathe_rings = (np.sin(rad_c * 115.0) * 0.5 + 0.5) * cheek_m
        rgh = np.clip(rgh + (lathe_rings - 0.5 * cheek_m) * 0.045, 0.10, 0.92)

        BC = 512
        im_bc = Image.new("L", (BC, BC), 0)
        dbc = ImageDraw.Draw(im_bc)
        dbc.text((BC // 2, 130), "HK  4.73 DM11", fill=255, font=_load_font(FONT_DIN, 42), anchor="mm")
        dbc.text((BC // 2, 382), "90° ROTARY BREECH", fill=240, font=_load_font(FONT_COND, 36), anchor="mm")
        _paste_uv_band(dark_etch, im_bc, 0.015, 0.275, 0.430, 0.690)

        # Longitudinal floating-rail sliding wear streaks on inner receiver flanks
        flank_m = ((u_grid >= 0.012) & (u_grid <= 0.988) & (
            ((v_grid >= 0.855) & (v_grid <= 0.988)) | ((v_grid >= 0.710) & (v_grid <= 0.843))
        )).astype(np.float32)
        rng_w = np.random.default_rng(4733)
        sc_w = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_w)
        for _ in range(220):
            sx = float(rng_w.uniform(0.02, 0.92) * w)
            sy = float(rng_w.uniform(0.02, 0.28) * h)
            ln = float(rng_w.uniform(40, 190))
            dsc.line([(sx, sy), (sx + ln, sy + float(rng_w.uniform(-1.5, 1.5)))],
                     fill=int(rng_w.integers(75, 200)), width=1)
        rail_wear = (np.asarray(sc_w, dtype=np.float32) / 255.0) * flank_m
        _mix(albedo, (0.64, 0.68, 0.74), rail_wear * 0.34)
        rgh -= rail_wear * 0.07

        se_bev = _bevel_mask(silver_etch, width_px=1.2)
        de_bev = _bevel_mask(dark_etch, width_px=1.2)
        decal_h = -0.40 * se_bev - 0.44 * de_bev + 0.04 * lathe_rings - 0.03 * rail_wear

        _mix(albedo, (0.86, 0.89, 0.92), silver_etch * 0.92)
        _mix(rgh, 0.30, silver_etch * 0.80)
        _mix(met, 0.92, silver_etch * 0.65)

        _mix(albedo, (0.20, 0.22, 0.25), dark_etch * 0.86)
        _mix(rgh, 0.44, dark_etch * 0.78)
        _mix(met, 0.48, dark_etch * 0.65)
        ao *= 1.0 - 0.12 * np.maximum(silver_etch, dark_etch)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.3)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.10, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_clockwork_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_clockwork_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_clockwork_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g11_v3_clockwork_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3 POST-PROCESS: g11_v3_barrel_mag (Overhead 45-Rd Smoked Caseless
    #   Mag w/ 45 Crisp Stacked Rectangular Tan-Ochre DM11 Propellant Blocks +
    #   Flush Copper Bullet Noses & 15/30/45 Marks + Strictly Firewalled
    #   Safety-Orange Horizontal Follower!)
    # -------------------------------------------------------------------------
    def _paint_dm11_mag_flank(
        albedo: np.ndarray,
        rgh: np.ndarray,
        met: np.ndarray,
        ao: np.ndarray,
        height_out: np.ndarray,
        u_grid: np.ndarray,
        v_grid: np.ndarray,
        u0: float, u1: float, v0: float, v1: float,
        is_right: bool,
    ) -> None:
        h, w = rgh.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return

        sh, sw = y1 - y0, x1 - x0
        u_1d = (np.arange(x0, x1, dtype=np.float32) + 0.5) / w
        v_1d = 1.0 - (np.arange(y0, y1, dtype=np.float32) + 0.5) / h
        u_sub = np.broadcast_to(((u_1d - u0) / max(u1 - u0, 1e-6))[None, :], (sh, sw))
        v_sub = np.broadcast_to(((v_1d - v0) / max(v1 - v0, 1e-6))[:, None], (sh, sw))
        # x_local in [-26.15, +25.95] (span = 52.10 cm); Right flank +X = +u, Left flank +X = 1 - u
        x_norm = np.clip(u_sub if is_right else (1.0 - u_sub), 0.0, 1.0)
        x_loc = -26.15 + x_norm * 52.10
        y_norm = np.clip(v_sub, 0.0, 1.0)  # 0 = bottom (-1.79), 1 = top (+1.79)
        rng = np.random.default_rng(4731 if is_right else 4732)

        # Smoked translucent-look charcoal polymer interior cavity
        cavity_col = np.array([0.165, 0.162, 0.152], dtype=np.float32)
        frame_col = np.array([0.235, 0.240, 0.232], dtype=np.float32)
        rgb = np.broadcast_to(cavity_col, (sh, sw, 3)).copy()

        # 45 stacked vertical rectangular 4.73x33mm DM11 caseless propellant blocks across x_loc in [-24.6 .. +15.0]
        # Each block pitch = 0.88 cm (8.8 mm), vertical span y_norm in [0.10 .. 0.90]
        n_rds = 45
        x_start = -24.6
        pitch = 0.88
        idx_r = np.floor((x_loc - x_start) / pitch).astype(np.int32)
        safe_r = np.clip(idx_r, 0, n_rds - 1)
        tone_j = rng.uniform(-0.032, 0.032, n_rds).astype(np.float32)[safe_r]
        local_x = (x_loc - (x_start + (safe_r + 0.5) * pitch)) / (pitch * 0.5)  # [-1, +1]

        in_block_x = (np.abs(local_x) < 0.86) & (idx_r >= 0) & (idx_r < n_rds)
        in_block_y = (y_norm >= 0.11) & (y_norm <= 0.89)
        in_block = (in_block_x & in_block_y).astype(np.float32)

        # Granular energetic mint-tan/ochre HITP caseless propellant block shading with crisp beveled vertical seams!
        edge_bevel = np.clip(1.0 - np.power(np.abs(local_x) / 0.86, 4.5), 0.20, 1.0)
        grain = ndimage.gaussian_filter(rng.normal(0.0, 0.022, (sh, sw)).astype(np.float32), sigma=0.7)
        ochre_base = np.array([0.78, 0.72, 0.48], dtype=np.float32)
        block_rgb = ochre_base * (0.70 + 0.34 * edge_bevel + tone_j + grain)[..., None]

        # Flush gleaming copper 4.73mm spitzer bullet nose embedded in the bottom of each DM11 block (y_norm in [0.11..0.30])!
        cu_t = np.clip((0.30 - y_norm) / 0.19, 0.0, 1.0)
        cu_half_w = 0.44 * (1.0 - 0.65 * cu_t)
        in_copper = ((idx_r >= 0) & (idx_r < n_rds) & (y_norm >= 0.11) & (y_norm <= 0.30) & (np.abs(local_x) <= cu_half_w)).astype(np.float32)
        cu_cyl = np.sqrt(np.maximum(1.0 - np.square(local_x / np.maximum(cu_half_w, 0.05)), 0.0))
        copper_rgb = np.array([0.88, 0.48, 0.22], dtype=np.float32) * (0.45 + 0.62 * cu_cyl)[..., None]
        block_rgb = block_rgb * (1.0 - in_copper[..., None]) + copper_rgb * in_copper[..., None]

        # Subtle primer spot at top of each DM11 block (y_norm in [0.81..0.88])
        in_prim = ((idx_r >= 0) & (idx_r < n_rds) & (y_norm >= 0.81) & (y_norm <= 0.88) & (np.abs(local_x) <= 0.32)).astype(np.float32)
        block_rgb = block_rgb * (1.0 - in_prim[..., None] * 0.65) + np.array([0.46, 0.26, 0.18], dtype=np.float32) * (in_prim[..., None] * 0.65)

        # Forward follower silhouette at x_loc in [+15.0 .. +17.0] + compressed steel spring coils in [+17.0 .. +25.4]!
        in_fol = ((x_loc >= 15.05) & (x_loc <= 16.95) & (y_norm >= 0.14) & (y_norm <= 0.86)).astype(np.float32)
        in_sp = ((x_loc >= 17.1) & (x_loc <= 25.3) & (y_norm >= 0.26) & (y_norm <= 0.74) & (np.abs(np.sin(x_loc * 10.5 + y_norm * 3.2)) > 0.74)).astype(np.float32)

        # Smoked translucent polycarbonate transmission tint
        smoke_tint = np.array([0.92, 0.90, 0.84], dtype=np.float32)
        rgb = rgb * (1.0 - in_block[..., None]) + np.clip(block_rgb * smoke_tint * 0.90 + cavity_col * 0.12, 0.0, 1.0) * in_block[..., None]
        rgb = rgb * (1.0 - in_fol[..., None] * 0.82) + np.array([0.82, 0.34, 0.07], dtype=np.float32) * (in_fol[..., None] * 0.82)
        rgb = rgb * (1.0 - in_sp[..., None] * 0.65) + np.array([0.52, 0.56, 0.62], dtype=np.float32) * (in_sp[..., None] * 0.65)

        # Molded opaque top/bottom/end structural frame borders & vertical stiffening ribs
        border = ((y_norm < 0.105) | (y_norm > 0.895) | (x_loc < -24.85) | (x_loc > 25.35)).astype(np.float32)
        border = ndimage.gaussian_filter(border, sigma=1.2)
        rgb = rgb * (1.0 - border[..., None] * 0.92) + frame_col * (border[..., None] * 0.92)

        # Crisp un-mirrored white witness markings: `15`, `30`, `45` & `HK 4.73×33 DM11 · 45 SCHUSS`
        MW, MH = 2605, 180
        w_im = Image.new("L", (MW, MH), 0)
        dw = ImageDraw.Draw(w_im)
        f_cnt = _load_font(FONT_DIN, 42)
        f_lbl = _load_font(FONT_COND, 34)

        def mx_to_px(lx: float) -> int:
            xn = (lx + 26.15) / 52.10
            return int(round((xn if is_right else (1.0 - xn)) * MW))

        for rd_num, lx_mark in ((15, -24.6 + 15 * 0.88), (30, -24.6 + 30 * 0.88), (45, -24.6 + 44.5 * 0.88)):
            px = mx_to_px(lx_mark)
            dw.line([(px, 14), (px, 38)], fill=255, width=5)
            dw.text((px, 66), str(rd_num), fill=255, font=f_cnt, anchor="mm")
        dw.text((mx_to_px(21.2), MH // 2), "HK 4.73×33 DM11 - 45 RD", fill=245, font=f_lbl, anchor="mm")

        w_arr = np.asarray(w_im.resize((sw, sh), resample=Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
        rgb = rgb * (1.0 - w_arr[..., None] * 0.95) + np.array([0.95, 0.95, 0.94], dtype=np.float32) * (w_arr[..., None] * 0.95)

        albedo[y0:y1, x0:x1] = rgb
        rgh_sub = 0.28 * (1.0 - border) + 0.56 * border
        rgh_sub = rgh_sub * (1.0 - w_arr * 0.5) + 0.34 * (w_arr * 0.5)
        rgh[y0:y1, x0:x1] = rgh_sub
        met_sub = 0.08 * (1.0 - in_copper) + 0.62 * in_copper * (1.0 - border)
        met[y0:y1, x0:x1] = met_sub
        ao[y0:y1, x0:x1] = np.clip(0.86 + 0.14 * edge_bevel * in_block - 0.18 * border, 0.55, 1.0)
        height_out[y0:y1, x0:x1] = 0.22 * border - 0.10 * w_arr + 0.08 * edge_bevel * in_block

    def process_barrel_mag_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "barrel_mag_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "barrel_mag_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "barrel_mag_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "barrel_mag_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "barrel_mag_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "barrel_mag_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "barrel_mag_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        decal_h = np.zeros((h, w), dtype=np.float32)

        # Paint both Hero Smoked Caseless Magazine Flanks (STRICTLY NEVER touching Safety-Orange firewall u[0.760,0.988], v[0.340,0.562]!)
        _paint_dm11_mag_flank(albedo, rgh, met, ao, decal_h, u_grid, v_grid, 0.012, 0.988, 0.800, 0.988, is_right=False)
        _paint_dm11_mag_flank(albedo, rgh, met, ao, decal_h, u_grid, v_grid, 0.012, 0.988, 0.598, 0.786, is_right=True)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_barrel_mag_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_barrel_mag_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "g11_v3_barrel_mag_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved g11_v3_barrel_mag_{albedo,normal,roughness}.webp (2048x2048)")

    process_housing_atlas()
    process_clockwork_atlas()
    process_barrel_mag_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "g11.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

G11_BORE_Y = 0.0
G11_MAG_Y = 3.95
G11_BREECH_X = -21.2
G11_GEAR_X = -16.95

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 22 solid H&K G11 K2 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY the 2 dynamic GPU-compressed helical springs:
#  `g11_recoil_spring`, `g11_mag_spring`!)
HOUSING_PARTS = [
    "g11_outer_housing",
    "g11_optic_handle",
    "g11_pistol_grip",
    "g11_buttplate",
    "g11_winding_knob",
    "g11_selector",
    "g11_spare_clips",
]

CLOCKWORK_PARTS = [
    "g11_inner_receiver",
    "g11_rotary_breech",
    "g11_clockwork_gears",
    "g11_driving_rod",
    "g11_gas_piston",
    "g11_loading_rammer",
    "g11_firing_pin",
    "g11_buffer_assembly",
    "g11_trigger_pack",
]

BARREL_MAG_PARTS = [
    "g11_barrel",
    "g11_flash_hider",
    "g11_trigger",
    "g11_mag_tube",
    "g11_mag_follower",
    "g11_mag_endcap",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "g11_outer_housing",
    "g11_optic_handle",
    "g11_pistol_grip",
    "g11_buttplate",
    "g11_selector",
    "g11_spare_clips",
    "g11_barrel",
    "g11_flash_hider",
    "g11_trigger",
    "g11_mag_endcap",
}

ASSEMBLED_POS = {
    "g11_barrel":          (  0.000,  0.000,  0.000),
    "g11_flash_hider":     ( 34.500,  0.000,  0.000),
    "g11_inner_receiver":  (  0.000,  0.000,  0.000),
    "g11_rotary_breech":   (-21.200,  0.000,  0.000),
    "g11_gas_piston":      (  3.200, -1.550,  0.000),
    "g11_driving_rod":     ( -9.200, -2.150,  0.000),
    "g11_outer_housing":   (  0.000,  0.000,  0.000),
    "g11_optic_handle":    ( -0.500,  6.550,  0.000),
    "g11_pistol_grip":     ( -1.800, -5.600,  0.000),
    "g11_buttplate":       (-34.600, -0.100,  0.000),
    "g11_winding_knob":    (-15.200, -0.800, -3.220),
    "g11_spare_clips":     ( 15.500,  3.600,  0.000),
    "g11_buffer_assembly": (-32.800, -1.600,  0.000),
    "g11_clockwork_gears": (-16.950,  0.000,  0.000),
    "g11_loading_rammer":  (-21.200,  5.250,  0.000),
    "g11_firing_pin":      (-24.400,  0.000,  0.000),
    "g11_trigger_pack":    ( -2.200, -4.450,  0.000),
    "g11_trigger":         (  3.200, -6.550,  0.000),
    "g11_selector":        ( -1.500, -3.800,  0.000),
    "g11_mag_tube":        (  3.600,  3.950,  0.000),
    "g11_mag_follower":    ( 19.400,  3.950,  0.000),
    "g11_mag_endcap":      ( 29.600,  3.950,  0.000),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured from src/weapons/g11/meshes/g11Geometries.ts
CSG_REF_BBOX = {
    "g11_barrel":          ((-19.0000,  -0.9800,  -0.9800), ( 35.0000,   0.9800,   0.9800)),
    "g11_flash_hider":     ((  0.0000,  -1.3450,  -0.9600), (  4.5000,   0.9600,   0.9600)),
    "g11_inner_receiver":  ((-28.8000,  -3.7750,  -2.4200), ( 14.2000,   2.2050,   2.4200)),
    "g11_rotary_breech":   (( -2.0356,  -2.0356,  -1.6800), (  2.0356,   2.0356,   1.4800)),
    "g11_gas_piston":      (( -3.2000,  -0.6200,  -0.9200), (  4.4000,   1.6500,   0.9200)),
    "g11_driving_rod":     (( -9.6000,  -0.5000,  -1.8400), (  9.4000,   0.5750,   1.8400)),
    "g11_outer_housing":   ((-34.6000,  -6.8000,  -3.2000), ( 30.6000,   6.6000,   3.2000)),
    "g11_optic_handle":    ((-14.6950,  -0.1500,  -1.9500), ( 14.6950,   5.8500,   2.2550)),
    "g11_pistol_grip":     (( -5.4000, -11.4000,  -2.1500), (  9.6000,   3.1000,   2.1500)),
    "g11_buttplate":       (( -1.4000,  -6.7000,  -3.1300), (  0.8500,   6.6000,   3.1300)),
    "g11_winding_knob":    (( -2.4200,  -2.4200,  -1.1450), (  2.4200,   2.4200,   0.6450)),
    "g11_spare_clips":     (( -9.3000,  -1.3250,  -4.2350), (  9.3000,   1.3300,   4.2350)),
    "g11_buffer_assembly": (( -1.0500,  -3.1000,  -2.1000), (  1.2500,   2.5000,   2.1000)),
    "g11_clockwork_gears": (( -2.1760,  -2.1800,  -1.8600), (  2.1760,   2.1800,   1.7750)),
    "g11_loading_rammer":  (( -1.1000,  -1.3450,  -1.0750), (  1.1000,   0.9950,   1.0750)),
    "g11_firing_pin":      (( -2.8500,  -0.5250,  -0.4333), (  1.3500,   0.4400,   0.4333)),
    "g11_trigger_pack":    (( -4.3000,  -1.4750,  -1.3300), (  4.3000,   1.3304,   1.3300)),
    "g11_trigger":         (( -5.1500,  -1.9200,  -0.5900), (  1.0500,   1.3250,   0.5900)),
    "g11_selector":        (( -0.7750,  -0.4400,  -3.6900), (  1.7750,   0.4400,   3.6900)),
    "g11_mag_tube":        ((-26.1500,  -1.7900,  -1.3100), ( 25.9500,   1.7900,   1.3100)),
    "g11_mag_follower":    (( -0.9800,  -1.3400,  -0.9600), (  0.9800,   1.3400,   0.9600)),
    "g11_mag_endcap":      (( -0.3500,  -1.7700,  -1.3400), (  1.9500,   1.7700,   1.3400)),
}


# =============================================================================
# Scene & AgX-Calibrated H&K G11 K2 Material Library (Cycles Metal GPU)
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
    bevel_r: float = 0.026,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.76, 0.80, 0.84),
    grain_scale: float = 38.0,
    grain_bump: float = 0.028,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 72.0,
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
    n_macro.inputs["Scale"].default_value = 2.60
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
        min(1.0, base_srgb[0] * 1.07),
        min(1.0, base_srgb[1] * 1.07),
        min(1.0, base_srgb[2] * 1.07),
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
    rgh_val_node.inputs["To Min"].default_value = max(0.06, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.075

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.30
        ramp.color_ramp.elements[0].color = (edge_wear, edge_wear, edge_wear, 1.0)
        ramp.color_ramp.elements[1].position = 0.76
        ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1.0)
        nt.links.new(ao_edge.outputs["AO"], ramp.inputs["Fac"])

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
        mix_edge_r.inputs[3].default_value = max(0.14, roughness - 0.14)
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
        bump.inputs["Distance"].default_value = 0.02
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_flash_hider_heat_mat() -> bpy.types.Material:
    """H&K G11 slotted flash hider: satin nitride steel -> bronze/blue 2,100 RPM temper -> soot crown."""
    mat = bpy.data.materials.new("BM_Flash_Hider_Heat")
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
    mr.inputs["From Min"].default_value = 0.5
    mr.inputs["From Max"].default_value = 4.5
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    ns = nt.nodes.new("ShaderNodeTexNoise")
    ns.inputs["Scale"].default_value = 5.5
    ns.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], ns.inputs["Vector"])

    ma = nt.nodes.new("ShaderNodeMath")
    ma.operation = "MULTIPLY_ADD"
    ma.inputs[1].default_value = 0.14
    nt.links.new(ns.outputs["Fac"], ma.inputs[0])
    nt.links.new(mr.outputs["Result"], ma.inputs[2])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = srgb_to_lin(0.218, 0.232, 0.250)
    cr.elements[1].position = 0.52
    cr.elements[1].color = srgb_to_lin(0.245, 0.258, 0.278)
    for pos, rgb in (
        (0.70, (0.34, 0.25, 0.17)),
        (0.84, (0.21, 0.23, 0.29)),
        (0.96, (0.145, 0.148, 0.155)),
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(ma.outputs["Value"], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.55
    rr.color_ramp.elements[0].color = (0.28, 0.28, 0.28, 1.0)
    rr.color_ramp.elements[1].position = 0.96
    rr.color_ramp.elements[1].color = (0.70, 0.70, 0.70, 1.0)
    nt.links.new(ma.outputs["Value"], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.76
    rm.color_ramp.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.color_ramp.elements[1].position = 0.96
    rm.color_ramp.elements[1].color = (0.32, 0.32, 0.32, 1.0)
    nt.links.new(ma.outputs["Value"], rm.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.032
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(ns.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: g11_v3_housing (AgX-Calibrated Bundeswehr Olive-Charcoal >= 0.19 sRGB!) ---
        "H_Olive_Monocoque": _build_pbr_mat(
            "H_Olive_Monocoque",
            base_srgb=(0.232, 0.256, 0.222),
            roughness=0.52,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.26,
            edge_srgb=(0.355, 0.382, 0.338),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.56,
            voronoi_scale=96.0,
            rough_var=0.044,
        ),
        "H_Dark_Polymer": _build_pbr_mat(
            "H_Dark_Polymer",
            base_srgb=(0.198, 0.212, 0.204),
            roughness=0.55,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.22,
            edge_srgb=(0.312, 0.326, 0.316),
            grain_scale=68.0,
            grain_bump=0.046,
            voronoi_grain=0.58,
            voronoi_scale=98.0,
            rough_var=0.042,
        ),
        "H_Grip_Stipple": _build_pbr_mat(
            "H_Grip_Stipple",
            base_srgb=(0.184, 0.196, 0.188),
            roughness=0.70,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.16,
            edge_srgb=(0.280, 0.294, 0.284),
            grain_scale=92.0,
            grain_bump=0.088,
            voronoi_grain=0.80,
            voronoi_scale=152.0,
            rough_var=0.044,
        ),
        "H_Rubber_Buttpad": _build_pbr_mat(
            "H_Rubber_Buttpad",
            base_srgb=(0.182, 0.188, 0.198),
            roughness=0.77,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.12,
            edge_srgb=(0.255, 0.262, 0.275),
            grain_scale=78.0,
            grain_bump=0.064,
            voronoi_grain=0.70,
            voronoi_scale=112.0,
            rough_var=0.040,
        ),
        "H_Inner_Cavity": _build_pbr_mat(
            "H_Inner_Cavity",
            base_srgb=(0.174, 0.182, 0.188),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=52.0,
            grain_bump=0.032,
            rough_var=0.036,
        ),
        "H_Control_Steel": _build_pbr_mat(
            "H_Control_Steel",
            base_srgb=(0.245, 0.260, 0.282),
            roughness=0.31,
            metallic=0.84,
            bevel_r=0.020,
            edge_wear=0.48,
            edge_srgb=(0.78, 0.82, 0.87),
            grain_scale=40.0,
            grain_bump=0.022,
            rough_var=0.028,
        ),
        "H_Winding_Steel": _build_pbr_mat(
            "H_Winding_Steel",
            base_srgb=(0.52, 0.55, 0.60),
            roughness=0.34,
            metallic=0.72,
            bevel_r=0.022,
            edge_wear=0.58,
            edge_srgb=(0.88, 0.91, 0.95),
            grain_scale=46.0,
            grain_bump=0.024,
            aniso_stretch=(2.8, 2.8, 0.5),
            rough_var=0.032,
        ),
        "H_Winding_Lever": _build_pbr_mat(
            "H_Winding_Lever",
            base_srgb=(0.30, 0.32, 0.35),
            roughness=0.46,
            metallic=0.22,
            bevel_r=0.024,
            edge_wear=0.34,
            edge_srgb=(0.54, 0.57, 0.61),
            grain_scale=58.0,
            grain_bump=0.036,
            rough_var=0.034,
        ),
        "H_Control_Stainless": _build_pbr_mat(
            "H_Control_Stainless",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.24,
            metallic=0.84,
            bevel_r=0.014,
            grain_scale=30.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "H_Selector_Red": _build_pbr_mat(
            "H_Selector_Red",
            base_srgb=(0.88, 0.08, 0.06),
            roughness=0.26,
            metallic=0.00,
            bevel_r=0.010,
            grain_scale=24.0,
            grain_bump=0.006,
            rough_var=0.012,
        ),
        "H_Optic_Lens": _build_pbr_mat(
            "H_Optic_Lens",
            base_srgb=(0.06, 0.48, 0.42),
            roughness=0.08,
            metallic=0.26,
            bevel_r=0.010,
            grain_scale=18.0,
            grain_bump=0.002,
            rough_var=0.010,
        ),

        # --- SUITE 2: g11_v3_clockwork (Luminous Brushed-Chrome Breech, Satin Stainless & Gold Brass Gears!) ---
        "C_Inner_Receiver_Steel": _build_pbr_mat(
            "C_Inner_Receiver_Steel",
            base_srgb=(0.245, 0.262, 0.285),
            roughness=0.31,
            metallic=0.84,
            bevel_r=0.022,
            edge_wear=0.48,
            edge_srgb=(0.78, 0.82, 0.88),
            grain_scale=40.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 3.4, 3.4),
            rough_var=0.028,
        ),
        "C_Chrome_Breech": _build_pbr_mat(
            "C_Chrome_Breech",
            base_srgb=(0.88, 0.91, 0.95),
            roughness=0.20,
            metallic=0.92,
            bevel_r=0.020,
            edge_wear=0.28,
            edge_srgb=(0.96, 0.98, 1.00),
            grain_scale=28.0,
            grain_bump=0.014,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.020,
        ),
        "C_Chamber_Carbon": _build_pbr_mat(
            "C_Chamber_Carbon",
            base_srgb=(0.23, 0.24, 0.26),
            roughness=0.46,
            metallic=0.66,
            bevel_r=0.012,
            grain_scale=54.0,
            grain_bump=0.030,
            rough_var=0.032,
        ),
        "C_Stainless_Gear": _build_pbr_mat(
            "C_Stainless_Gear",
            base_srgb=(0.85, 0.88, 0.92),
            roughness=0.22,
            metallic=0.93,
            bevel_r=0.016,
            edge_wear=0.34,
            edge_srgb=(0.95, 0.97, 0.99),
            grain_scale=32.0,
            grain_bump=0.016,
            aniso_stretch=(0.40, 3.5, 3.5),
            rough_var=0.022,
        ),
        "C_Clockwork_Brass": _build_pbr_mat(
            "C_Clockwork_Brass",
            base_srgb=(0.94, 0.76, 0.30),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.016,
            edge_wear=0.34,
            edge_srgb=(0.99, 0.89, 0.56),
            grain_scale=34.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.022,
        ),
        "C_Buffer_Elastomer": _build_pbr_mat(
            "C_Buffer_Elastomer",
            base_srgb=(0.26, 0.23, 0.19),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=62.0,
            grain_bump=0.044,
            rough_var=0.038,
        ),

        # --- SUITE 3: g11_v3_barrel_mag (540mm CHF Barrel, Heat Flash Hider, DM11 Mag & Safety-Orange Follower) ---
        "BM_Barrel_CHF": _build_pbr_mat(
            "BM_Barrel_CHF",
            base_srgb=(0.218, 0.232, 0.252),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.020,
            edge_wear=0.42,
            edge_srgb=(0.76, 0.80, 0.86),
            grain_scale=44.0,
            grain_bump=0.026,
            aniso_stretch=(4.5, 0.45, 0.45),
            rough_var=0.028,
        ),
        "BM_Chrome_Bore": _build_pbr_mat(
            "BM_Chrome_Bore",
            base_srgb=(0.72, 0.76, 0.82),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.010,
            grain_scale=32.0,
            grain_bump=0.014,
            aniso_stretch=(0.35, 4.0, 4.0),
            rough_var=0.020,
        ),
        "BM_Flash_Hider_Heat": _build_flash_hider_heat_mat(),
        "BM_Trigger_Steel": _build_pbr_mat(
            "BM_Trigger_Steel",
            base_srgb=(0.232, 0.246, 0.268),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.018,
            edge_wear=0.44,
            edge_srgb=(0.78, 0.82, 0.86),
            grain_scale=38.0,
            grain_bump=0.022,
            rough_var=0.028,
        ),
        "BM_Transfer_Stainless": _build_pbr_mat(
            "BM_Transfer_Stainless",
            base_srgb=(0.75, 0.78, 0.83),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.014,
            grain_scale=32.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "BM_Mag_Smoked": _build_pbr_mat(
            "BM_Mag_Smoked",
            base_srgb=(0.235, 0.232, 0.222),
            roughness=0.40,
            metallic=0.10,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.34, 0.34, 0.33),
            grain_scale=56.0,
            grain_bump=0.032,
            rough_var=0.036,
        ),
        "BM_DM11_Propellant": _build_pbr_mat(
            "BM_DM11_Propellant",
            base_srgb=(0.72, 0.57, 0.34),
            roughness=0.66,
            metallic=0.00,
            bevel_r=0.014,
            grain_scale=88.0,
            grain_bump=0.056,
            voronoi_grain=0.68,
            voronoi_scale=130.0,
            rough_var=0.044,
        ),
        "BM_DM11_Copper": _build_pbr_mat(
            "BM_DM11_Copper",
            base_srgb=(0.86, 0.46, 0.21),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.010,
            grain_scale=32.0,
            grain_bump=0.014,
            rough_var=0.020,
        ),
        "BM_Mag_Cap_Poly": _build_pbr_mat(
            "BM_Mag_Cap_Poly",
            base_srgb=(0.195, 0.206, 0.198),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.295, 0.308, 0.298),
            grain_scale=68.0,
            grain_bump=0.048,
            voronoi_grain=0.62,
            voronoi_scale=102.0,
            rough_var=0.042,
        ),
        "BM_Follower_Orange": _build_pbr_mat(
            "BM_Follower_Orange",
            base_srgb=(0.95, 0.37, 0.05),
            roughness=0.36,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.16,
            edge_srgb=(0.98, 0.56, 0.22),
            grain_scale=44.0,
            grain_bump=0.026,
            rough_var=0.032,
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
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=2,
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


def mk_lathe_x(
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 36,
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


def mk_spur_gear_z(
    name: str, teeth: int, r_root: float, r_tip: float, z0: float, z1: float,
    bore_r: float = 0.0, mat: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
) -> bpy.types.Object:
    """TRUE Involute-Profile Tapered CNC Spur Gear with chamfered root fillets & beveled crowns!"""
    pts = []
    r_mid = 0.5 * (r_root + r_tip)
    step = math.tau / teeth
    for i in range(teeth):
        a0 = i * step
        # 6-point involute-tapered tooth profile per pitch (wide root -> curved flank -> crisp land -> wide valley)
        for frac, rad in (
            (0.00, r_root),
            (0.14, r_root),
            (0.24, r_mid),
            (0.32, r_tip),
            (0.50, r_tip),
            (0.58, r_mid),
            (0.68, r_root),
        ):
            ang = a0 + frac * step
            pts.append((math.cos(ang) * rad, math.sin(ang) * rad))
    gear = mk_extrude_z(name, pts, z0, z1, bevel=0.020, bevel_segs=2, xform=xform, mat=mat)
    if bore_r > 0.05:
        hole = mk_cyl(f"{name}_bore", bore_r, bore_r, abs(z1 - z0) + 0.8, axis="z", segs=32,
                      xform=[("t", 0.0, 0.0, (z0 + z1) * 0.5)] + (xform or []), mat=mat)
        gear = bool_diff(gear, [hole])
    return gear


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else objs[0]


def join_parts(name: str, objs: list[bpy.types.Object]) -> bpy.types.Object:
    assert objs, f"join_parts({name}): empty list"
    if len(objs) == 1:
        objs[0].name = name
        objs[0].data.name = name
        return objs[0]
    select_only(objs, objs[0])
    bpy.ops.object.join()
    out = bpy.context.active_object
    out.name = name
    out.data.name = name
    return out


def _count_non_manifold(obj: bpy.types.Object) -> int:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bad = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    bm.free()
    return bad


def bool_diff(target: bpy.types.Object, cutters: list[bpy.types.Object]) -> bpy.types.Object:
    for c in cutters:
        for m in c.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)
        backup_mesh = target.data.copy()
        success = False
        for slv in ("EXACT", "MANIFOLD"):
            select_only([target], target)
            mod = target.modifiers.new(name="BoolCut", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = slv
            mod.object = c
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
            mod = target.modifiers.new(name="BoolCutF", type="BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = c
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)
        bpy.data.objects.remove(c, do_unlink=True)
    return target


def bool_union(target: bpy.types.Object, additions: list[bpy.types.Object]) -> bpy.types.Object:
    for a in additions:
        for m in a.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)
        backup_mesh = target.data.copy()
        success = False
        for slv in ("EXACT", "MANIFOLD"):
            select_only([target], target)
            mod = target.modifiers.new(name="BoolU", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = slv
            mod.object = a
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
            mod = target.modifiers.new(name="BoolUF", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = a
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)
        bpy.data.objects.remove(a, do_unlink=True)
    return target


def finalize_watertight_part(obj: bpy.types.Object, sharp_deg: float = 36.0) -> bpy.types.Object:
    """Watertight smooth shading + angle-based sharp creases + Face-Area-With-Angle Weighted Normals (0 non-manifold edges!)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
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

    select_only([obj], obj)
    wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 100
    wn.thresh = 0.01
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


def _quad_bez(p0, p1, p2, segs: int = 8):
    return [
        (
            (1 - i / segs) ** 2 * p0[0] + 2 * (1 - i / segs) * (i / segs) * p1[0] + (i / segs) ** 2 * p2[0],
            (1 - i / segs) ** 2 * p0[1] + 2 * (1 - i / segs) * (i / segs) * p1[1] + (i / segs) ** 2 * p2[1],
        )
        for i in range(1, segs + 1)
    ]


def sample_quad_bezier(p0, p1, p2, segs: int = 10) -> list[tuple[float, float]]:
    return [p0] + _quad_bez(p0, p1, p2, segs)


def sample_cubic_bezier(p0, p1, p2, p3, segs: int = 12) -> list[tuple[float, float]]:
    pts = []
    for i in range(segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def mk_loft_rings(
    name: str,
    rings_three: list[list[tuple[float, float, float]]],
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    bm = bmesh.new()
    n_ring = len(rings_three[0])
    v_rings = [[bm.verts.new(pt) for pt in r] for r in rings_three]
    for s in range(len(v_rings) - 1):
        a, b = v_rings[s], v_rings[s + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            bm.faces.new((a[k], a[kn], b[kn], b[k]))
    if cap_ends:
        bm.faces.new(list(reversed(v_rings[0])))
        bm.faces.new(v_rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_y(
    name: str,
    stations: list[tuple[float, float, float, float, float, float]],
    n_ring: int = 28,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    rings = []
    for y, xb, xf, hz, pb, pf in stations:
        xc = 0.5 * (xb + xf)
        hx = max(0.02, 0.5 * (xf - xb))
        ring = []
        for k in range(n_ring):
            th = math.tau * k / n_ring
            ct, st = math.cos(th), math.sin(th)
            pw = pf if ct >= 0.0 else pb
            inv_p = 2.0 / max(pw, 1.2)
            x = xc + math.copysign(abs(ct) ** inv_p, ct) * hx
            z = math.copysign(abs(st) ** inv_p, st) * hz
            ring.append((x, y, z))
        rings.append(ring)
    return mk_loft_rings(name, rings, mat=mat, cap_ends=cap_ends)


def mk_swept_bow(
    name: str,
    center_pts_xy: list[tuple[float, float]],
    thickness: float,
    half_z: float,
    bevel: float = 0.05,
    bevel_segs: int = 2,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in center_pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-4:
            clean.append(p)
    n = len(clean)
    ht = thickness * 0.5
    left_side, right_side = [], []
    for i in range(n):
        if i == 0:
            dx, dy = clean[1][0] - clean[0][0], clean[1][1] - clean[0][1]
        elif i == n - 1:
            dx, dy = clean[-1][0] - clean[-2][0], clean[-1][1] - clean[-2][1]
        else:
            dx, dy = clean[i + 1][0] - clean[i - 1][0], clean[i + 1][1] - clean[i - 1][1]
        ln = max(1e-6, math.hypot(dx, dy))
        nx, ny = -dy / ln, dx / ln
        left_side.append((clean[i][0] + nx * ht, clean[i][1] + ny * ht))
        right_side.append((clean[i][0] - nx * ht, clean[i][1] - ny * ht))
    poly = left_side + list(reversed(right_side))
    return mk_extrude_z(name, poly, -half_z, half_z, bevel=bevel, bevel_segs=bevel_segs, mat=mat)


def mk_stadium_2d(cx: float, cy: float, length: float, width: float, segs: int = 10, vertical: bool = False) -> list[tuple[float, float]]:
    if vertical:
        r = length * 0.5
        hl = max(0.01, width * 0.5 - r)
        pts = []
        for i in range(segs + 1):
            a = math.pi * (i / segs)
            pts.append((cx + r * math.cos(a), cy + hl + r * math.sin(a)))
        for i in range(segs + 1):
            a = math.pi + math.pi * (i / segs)
            pts.append((cx + r * math.cos(a), cy - hl + r * math.sin(a)))
        return pts
    r = width * 0.5
    hl = max(0.01, length * 0.5 - r)
    pts = []
    for i in range(segs + 1):
        a = -math.pi * 0.5 + math.pi * (i / segs)
        pts.append((cx + hl + r * math.cos(a), cy + r * math.sin(a)))
    for i in range(segs + 1):
        a = math.pi * 0.5 + math.pi * (i / segs)
        pts.append((cx - hl + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def mk_chamfered_stadium_cutter_z(
    name: str,
    cx: float, cy: float,
    z_wall: float, depth: float,
    length: float, width: float,
    chamfer: float = 0.06,
    side_sign: float = 1.0,
    through_both: bool = False,
    segs: int = 10,
    vertical: bool = False,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    if through_both:
        z_out = abs(z_wall)
        stations = [
            (-z_out - 0.18, chamfer + 0.08),
            (-z_out + chamfer, 0.0),
            (z_out - chamfer, 0.0),
            (z_out + 0.18, chamfer + 0.08),
        ]
    else:
        s = 1.0 if side_sign >= 0.0 else -1.0
        z_in = z_wall - s * depth
        z_ch = z_wall - s * chamfer
        z_ov = z_wall + s * 0.16
        stations = [(z_in, 0.0), (z_ch, 0.0), (z_ov, chamfer + 0.06)]
        if s < 0.0:
            stations.reverse()
    rings = []
    for z_pos, dr in stations:
        pts2d = mk_stadium_2d(cx, cy, length + 2.0 * dr, width + 2.0 * dr, segs=segs, vertical=vertical)
        rings.append([(x, y, z_pos) for x, y in pts2d])
    return mk_loft_rings(name, rings, mat=mat, cap_ends=True)


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 24, depth: float = 0.024,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.028, length * 0.14, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.7 - bev * 0.85),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.7 - bev * 0.85),
    ]
    rings = []
    for s_idx, (ax_pos, r_base) in enumerate(stations):
        ring = []
        is_end = s_idx in (0, 3)
        for k in range(n_pts):
            th = math.tau * k / n_pts
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


def mk_tube_along_pts(
    name: str,
    pts_three: list[Vector],
    radius: float,
    ring_segs: int = 12,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(pts_three)
    for i, p in enumerate(pts_three):
        if i == 0:
            tang = (pts_three[1] - pts_three[0]).normalized()
        elif i == n_pts - 1:
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
            th = math.tau * s / ring_segs
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
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


# =============================================================================
# 22 HIGH-DETAIL MUSEUM-GRADE H&K G11 K2 HARD-SURFACE PART BUILDERS
# =============================================================================

# --- SUITE 1: HOUSING (7 parts) ---

def build_g11_outer_housing(mats) -> bpy.types.Object:
    """Iconic Chamfered Bundeswehr Olive-Charcoal Composite Monocoque Casing (`X in [-34.6, +30.6]`)
    w/ Recessed Molded Forend Grip Serrations, Chamfered Stadium Louvers & Open Steel Sling Loops!"""
    pts = [
        (-34.6, -6.8), (-8.5, -5.8), (-3.2, -5.6),
        (3.5, -3.0), (30.6, -2.0), (30.6, 6.6), (-34.6, 6.6),
    ]
    body = mk_extrude_z("g11_outer_housing", pts, -3.20, 3.20, bevel=0.28, bevel_segs=4, mat=mats["H_Olive_Monocoque"])

    cutters = [
        # Hollow floating inner receiver cavity
        mk_box("c_recv", 48.8, 7.6, 5.10, [("t", -9.7, -1.9, 0.0)], mat=mats["H_Inner_Cavity"]),
        # Overhead 45-round horizontal caseless magazine tunnel (open at front X = +30.6!)
        mk_box("c_mag", 55.6, 3.92, 3.04, [("t", 4.0, 3.95, 0.0)], mat=mats["H_Inner_Cavity"]),
        # Front barrel shroud tunnel
        mk_box("c_bbl", 18.0, 2.50, 2.50, [("t", 22.5, 0.0, 0.0)], mat=mats["H_Inner_Cavity"]),
        # Lower trigger pack bay
        mk_box("c_fcu", 12.2, 3.80, 3.10, [("t", -1.2, -4.45, 0.0)], mat=mats["H_Inner_Cavity"]),
        # Left-flank circular pop-out winding crank bay w/ chamfered rim at (-15.2, -0.8, -3.2)
        mk_cyl("c_wk", 2.56, 2.56, 0.90, axis="z", segs=44, xform=[("t", -15.2, -0.8, -3.0)], mat=mats["H_Inner_Cavity"]),
        mk_cyl("c_wk_ch", 2.56, 2.74, 0.22, axis="z", segs=44, xform=[("t", -15.2, -0.8, -3.14)], mat=mats["H_Dark_Polymer"]),
    ]
    # 6 crisp chamfered stadium forward forend cooling louver vents on both flanks!
    for i in range(6):
        vx = 14.2 + i * 2.02
        cutters.append(
            mk_chamfered_stadium_cutter_z(
                f"c_vent_{i}", cx=vx, cy=-0.28, z_wall=3.20, depth=6.9,
                length=1.22, width=0.44, chamfer=0.06, through_both=True, segs=8, mat=mats["H_Inner_Cavity"],
            )
        )
    # 12 crisp vertical recessed molded ergonomic grip serration grooves on BOTH forend flanks (X in [11.8..26.6])!
    # Uses H_Dark_Polymer so recessed faces NEVER collide with H_Olive_Monocoque Hero UV rollmarks (which end at X=+5.4)!
    for side in (-1.0, 1.0):
        for k in range(12):
            gx = 12.0 + k * 1.32
            cutters.append(
                mk_chamfered_stadium_cutter_z(
                    f"c_fgrip_{side:+.0f}_{k}", cx=gx, cy=-1.42,
                    z_wall=side * 3.20, depth=0.14,
                    length=0.34, width=1.08, chamfer=0.045,
                    side_sign=side, segs=6, vertical=True, mat=mats["H_Dark_Polymer"],
                )
            )
    body = bool_diff(body, cutters)

    # Open steel sling bar loops + detailed bottom emergency misfire hatch + lower forend palm ribs
    f_sling_pts = sample_cubic_bezier((24.1, -2.05), (24.0, -2.52), (26.0, -2.52), (25.9, -2.05), segs=12)
    r_sling_pts = sample_cubic_bezier((-32.7, -6.45), (-32.8, -6.92), (-30.8, -6.92), (-30.9, -6.45), segs=12)
    extras = [
        body,
        mk_box("h_misfire_hatch", 4.6, 0.34, 3.4, [("t", -21.2, -6.58, 0.0)], mat=mats["H_Dark_Polymer"], bevel=0.08, bevel_segs=2),
        mk_box("h_hatch_latch", 1.15, 0.24, 1.45, [("t", -19.2, -6.68, 0.0)], mat=mats["H_Control_Steel"], bevel=0.04),
        mk_box("h_front_sbase", 2.2, 0.24, 1.35, [("t", 25.0, -2.10, 0.0)], mat=mats["H_Control_Steel"], bevel=0.04),
        mk_tube_along_pts("h_front_sling", [Vector((px, py, 0.0)) for px, py in f_sling_pts], radius=0.12, ring_segs=12, mat=mats["H_Control_Steel"]),
        mk_box("h_rear_sbase", 2.2, 0.24, 1.35, [("t", -31.8, -6.52, 0.0)], mat=mats["H_Control_Steel"], bevel=0.04),
        mk_tube_along_pts("h_rear_sling", [Vector((px, py, 0.0)) for px, py in r_sling_pts], radius=0.12, ring_segs=12, mat=mats["H_Control_Steel"]),
    ]
    # Molded underside forend tactile finger-grip ribs (X in [10.0 .. 22.8])
    for k in range(8):
        rx = 10.6 + k * 1.72
        ry = -2.74 + ((rx - 3.5) / 27.1) * 1.00 - 0.02
        extras.append(mk_box(f"h_brib_{k}", 0.55, 0.16, 4.65, [("rz", 0.037), ("t", rx, ry, 0.0)], mat=mats["H_Dark_Polymer"], bevel=0.04))

    return finalize_watertight_part(join_parts("g11_outer_housing", extras), sharp_deg=36.0)


def build_g11_optic_handle(mats) -> bpy.types.Object:
    """Sculpted Ergonomic Carry-Handle Optics Bridge Housing 1×/3.5× Hensoldt Optical Reflex Sight
    w/ Arched Finger Tunnel, Domed Emerald-Sapphire AR Lenses & Knurled Turret Drums!"""
    # Swept tapered ergonomic carry-handle bridge profile (preserves flat side nameplates Y > 2.60!)
    bridge_xy = [
        (-14.60, -0.15), (14.60, -0.15), (14.60, 2.35), (14.35, 5.55),
        (13.65, 5.66), (-13.65, 5.66), (-14.35, 5.55), (-14.60, 2.35),
    ]
    outer = mk_extrude_z("opt_body", bridge_xy, -1.95, 1.95, bevel=0.20, bevel_segs=4, mat=mats["H_Olive_Monocoque"])

    # Smoothly chamfered ergonomic stadium carry-handle grip tunnel!
    tunnel = mk_chamfered_stadium_cutter_z(
        "opt_hole", cx=0.0, cy=1.42, z_wall=1.95, depth=4.4,
        length=16.6, width=2.08, chamfer=0.16, through_both=True, segs=12, mat=mats["H_Inner_Cavity"],
    )
    # Recessed flared anti-glare objective & ocular lens hoods
    obj_cut = mk_cyl("opt_oc", 1.16, 1.16, 1.30, axis="x", segs=36, xform=[("t", 14.25, 4.10, 0.0)], mat=mats["H_Inner_Cavity"])
    ocu_cut = mk_cyl("opt_ec", 1.22, 1.22, 1.30, axis="x", segs=36, xform=[("t", -14.25, 4.10, 0.0)], mat=mats["H_Inner_Cavity"])
    frame = bool_diff(outer, [tunnel, obj_cut, ocu_cut])

    # Domed convex multi-coated emerald-sapphire optical glass lenses (`H_Optic_Lens` firewall!)
    obj_lens_pts = [(0.00, 14.22), (1.08, 14.22), (1.08, 14.36)]
    for i in range(1, 8):
        r = 1.08 * (1.0 - i / 7.0)
        x = 14.36 + 0.16 * math.sqrt(max(0.0, 1.0 - (r / 1.12) ** 2))
        obj_lens_pts.append((r, x))
    oc_lens_pts = [(0.00, -14.22), (1.14, -14.22), (1.14, -14.36)]
    for i in range(1, 8):
        r = 1.14 * (1.0 - i / 7.0)
        x = -14.36 - 0.16 * math.sqrt(max(0.0, 1.0 - (r / 1.18) ** 2))
        oc_lens_pts.append((r, x))

    # Chamfered black anodized objective & ocular lens retainer bezel rings
    f_bez = mk_lathe_x("opt_fbez", [(1.02, 14.26), (1.17, 14.26), (1.17, 14.62), (1.07, 14.62), (1.02, 14.48), (1.02, 14.26)],
                       segs=36, xform=[("t", 0.0, 4.10, 0.0)], mat=mats["H_Control_Steel"])
    r_bez = mk_lathe_x("opt_rbez", [(1.08, -14.26), (1.23, -14.26), (1.23, -14.62), (1.13, -14.62), (1.08, -14.48), (1.08, -14.26)],
                       segs=36, xform=[("t", 0.0, 4.10, 0.0)], mat=mats["H_Control_Steel"])

    parts = [
        frame,
        f_bez,
        r_bez,
        # Top STANAG backup sight rib & sculpted emergency iron sights (protective front hood + rear aperture)
        mk_box("opt_rib", 24.0, 0.36, 1.48, [("t", 0.0, 5.65, 0.0)], mat=mats["H_Dark_Polymer"], bevel=0.06, bevel_segs=2),
        mk_box("opt_iron_fl", 0.72, 0.36, 0.14, [("t", 11.4, 5.66, -0.24)], mat=mats["H_Control_Steel"], bevel=0.025),
        mk_box("opt_iron_fr", 0.72, 0.36, 0.14, [("t", 11.4, 5.66,  0.24)], mat=mats["H_Control_Steel"], bevel=0.025),
        mk_cyl("opt_iron_fp", 0.06, 0.08, 0.32, axis="y", segs=12, xform=[("t", 11.4, 5.66, 0.0)], mat=mats["H_Control_Stainless"]),
        mk_box("opt_iron_r", 0.75, 0.36, 0.92, [("t", -11.4, 5.66, 0.0)], mat=mats["H_Control_Steel"], bevel=0.04),
        # Strictly firewalled domed emerald-sapphire multi-coated lenses!
        mk_lathe_x("opt_lens_f", obj_lens_pts, segs=36, xform=[("t", 0.0, 4.10, 0.0)], mat=mats["H_Optic_Lens"]),
        mk_lathe_x("opt_lens_r", oc_lens_pts, segs=36, xform=[("t", 0.0, 4.10, 0.0)], mat=mats["H_Optic_Lens"]),
        # Deeply knurled windage, elevation & 1×/3.5× magnification selector turret drums
        mk_knurled_cyl("opt_turret_r", 0.48, 0.56, axis="z", flutes=24, depth=0.022, xform=[("t", 1.5, 4.10, 1.98)], mat=mats["H_Control_Steel"]),
        mk_knurled_cyl("opt_turret_t", 0.46, 0.32, axis="y", flutes=24, depth=0.022, xform=[("t", 1.5, 5.68, 0.0)], mat=mats["H_Control_Steel"]),
        mk_knurled_cyl("opt_mag_ring", 0.42, 0.30, axis="z", flutes=20, depth=0.020, xform=[("t", -3.8, 4.10, -1.94)], mat=mats["H_Control_Steel"]),
    ]
    return finalize_watertight_part(join_parts("g11_optic_handle", parts), sharp_deg=38.0)


def build_g11_pistol_grip(mats) -> bpy.types.Object:
    """Organically Lofted Ergonomic H&K Contoured Pistol Grip w/ Palm Swell, Finger Grooves
    & Smoothly Swept Closed Winter Trigger Guard (ZERO air gaps!)."""
    # 12-station organic superellipse pistol grip loft along Y in [-11.15, +1.05]
    # Station = (y, x_back, x_front, hz, p_back, p_front)
    grip_stations = [
        ( 1.05, -2.18,  2.08, 1.72, 2.8, 2.8),
        (-0.20, -2.28,  1.95, 1.66, 2.5, 2.4),  # upper thumb-web saddle
        (-1.55, -2.52,  1.72, 1.74, 2.3, 2.2),
        (-2.90, -2.84,  1.42, 1.88, 2.2, 2.2),  # ergonomic top finger groove
        (-4.35, -3.22,  1.10, 2.04, 2.1, 2.2),  # palm swell begins
        (-5.80, -3.62,  0.74, 2.12, 2.1, 2.3),  # anatomical palm swell peak
        (-7.35, -4.08,  0.34, 2.04, 2.1, 2.3),
        (-8.85, -4.58, -0.04, 1.92, 2.2, 2.4),
        (-10.15, -5.02, -0.32, 1.84, 2.4, 2.5),
        (-11.10, -5.32, -0.45, 1.86, 2.6, 2.6),
    ]
    grip_core = mk_loft_y("grip_core", grip_stations, n_ring=32, mat=mats["H_Dark_Polymer"], cap_ends=True)

    # Smoothly swept contoured H&K winter trigger-guard bow (solidly unioned front & rear!)
    tg_curve = (
        [(1.25, -4.05)]
        + sample_cubic_bezier((1.55, -4.05), (3.85, -4.18), (6.55, -4.22), (8.25, -4.02), segs=10)[1:]
        + sample_cubic_bezier((8.25, -4.02), (9.05, -3.90), (9.18, -3.05), (9.16, -1.20), segs=8)[1:]
        + [(9.15, 3.05)]
    )
    tguard = mk_swept_bow("grip_tg", tg_curve, thickness=0.82, half_z=1.52, bevel=0.14, bevel_segs=3, mat=mats["H_Dark_Polymer"])
    grip_body = bool_union(grip_core, [tguard])

    # Raised stippled ergonomic palm-swell traction panels + horizontal grip ribs + olive flared heel cap
    parts = [grip_body]
    for side in (-1.0, 1.0):
        parts.append(
            mk_box(
                f"grip_sw_{side:+.0f}", 2.85, 6.80, 0.16,
                [("rz", -0.25), ("t", -2.15, -6.35, side * 2.02)],
                mat=mats["H_Grip_Stipple"], bevel=0.06, bevel_segs=2,
            )
        )
    for k in range(5):
        ry = -3.8 - k * 1.25
        rx = 1.24 - k * 0.34
        parts.append(mk_box(f"grip_frib_{k}", 0.20, 0.24, 1.85, [("rz", -0.25), ("t", rx, ry, 0.0)], mat=mats["H_Grip_Stipple"], bevel=0.04))
    parts.append(mk_box("grip_heel", 5.05, 0.64, 3.72, [("rz", 0.07), ("t", -2.90, -11.02, 0.0)], mat=mats["H_Olive_Monocoque"], bevel=0.12, bevel_segs=3))

    return finalize_watertight_part(join_parts("g11_pistol_grip", parts), sharp_deg=42.0)


def build_g11_buttplate(mats) -> bpy.types.Object:
    """Sculpted Contoured Ribbed Charcoal Rubber Shoulder Buttpad & Rear Takedown Endcap."""
    bp_xy = (
        [(0.82, 6.58), (-1.18, 6.55)]
        + sample_quad_bezier((-1.18, 6.55), (-0.98, -0.05), (-1.26, -6.66), segs=12)[1:]
        + [(0.82, -6.68)]
    )
    pad = mk_extrude_z("bp_main", bp_xy, -3.12, 3.12, bevel=0.22, bevel_segs=4, mat=mats["H_Rubber_Buttpad"])
    parts = [pad]
    for i in range(10):
        u = i / 9.0
        ry = -5.55 + u * 11.00
        rx_p = -1.26 + 0.16 * (1.0 - (2.0 * u - 1.0) ** 2)
        parts.append(mk_box(f"bp_rib_{i}", 0.22, 0.42, 5.45, [("t", rx_p, ry, 0.0)], mat=mats["H_Dark_Polymer"], bevel=0.05, bevel_segs=2))
    # Dual rear takedown retention pin heads w/ chamfered retaining collars
    for py in (-4.4, 4.2):
        parts.append(mk_cyl(f"bp_pin_{py:.1f}", 0.42, 0.42, 6.26, axis="z", segs=24, xform=[("t", 0.15, py, 0.0)], mat=mats["H_Control_Steel"], bevel=0.05))
    return finalize_watertight_part(join_parts("g11_buttplate", parts), sharp_deg=38.0)


def build_g11_winding_knob(mats) -> bpy.types.Object:
    """Iconic Deeply Knurled Circular Pop-Out Clockwork Cocking Crank Knob w/ Brushed Disc & Folding Lever!"""
    # Deeply knurled cylindrical winding drum (outer flat -Z face at tz=-0.57 stays 100% captured by Hero UV!)
    disc = mk_knurled_cyl("wk_disc", 2.42, 0.64, axis="z", flutes=36, depth=0.036, xform=[("t", 0.0, 0.0, -0.25)], mat=mats["H_Winding_Steel"])
    shaft = mk_cyl("wk_shaft", 0.68, 0.68, 0.84, axis="z", segs=28, xform=[("t", 0.0, 0.0, 0.22)], mat=mats["H_Control_Stainless"], bevel=0.04)
    # Contoured tapered folding crank arm w/ chamfered finger-grip edges
    arm_xy = [(-0.62, -0.44), (2.08, -0.34), (2.22, 0.0), (2.08, 0.34), (-0.62, 0.44)]
    arm = mk_extrude_z("wk_arm", arm_xy, -0.99, -0.53, bevel=0.09, bevel_segs=3, mat=mats["H_Winding_Lever"])
    # Deeply knurled rotating cylindrical crank grip knob + slotted center axle screw!
    knob = mk_knurled_cyl("wk_knob", 0.43, 0.64, axis="z", flutes=22, depth=0.024, xform=[("t", 1.85, 0.0, -0.82)], mat=mats["H_Control_Stainless"])
    screw_raw = mk_cyl("wk_scr", 0.44, 0.44, 0.24, axis="z", segs=24, xform=[("t", 0.0, 0.0, -0.58)], mat=mats["H_Control_Stainless"], bevel=0.035)
    screw = bool_diff(screw_raw, [mk_box("wk_scr_slot", 0.62, 0.10, 0.12, [("t", 0.0, 0.0, -0.68)], mat=mats["H_Control_Stainless"])])
    return finalize_watertight_part(join_parts("g11_winding_knob", [disc, shaft, arm, knob, screw]), sharp_deg=36.0)


def build_g11_selector(mats) -> bpy.types.Object:
    """Ambidextrous H&K G11 S / 1 / 3 / A Cross-Shaft & Tapered Sculpted Selector Levers."""
    parts = [
        mk_cyl("sel_shaft", 0.42, 0.42, 6.84, axis="z", segs=28, mat=mats["H_Control_Steel"], bevel=0.035),
    ]
    lev_xy = [(-0.76, -0.42), (1.58, -0.26), (1.76, 0.0), (1.58, 0.26), (-0.76, 0.42)]
    for sgn in (-1, 1):
        z0, z1 = (3.23, 3.67) if sgn > 0 else (-3.67, -3.23)
        parts.append(mk_extrude_z(f"sel_lev_{sgn}", lev_xy, z0, z1, bevel=0.06, bevel_segs=2, mat=mats["H_Control_Steel"]))
        parts.append(mk_box(f"sel_red_{sgn}", 0.54, 0.20, 0.48, [("t", 1.38, 0.0, sgn * 3.45)], mat=mats["H_Selector_Red"], bevel=0.025))
    return finalize_watertight_part(join_parts("g11_selector", parts), sharp_deg=36.0)


def build_g11_spare_clips(mats) -> bpy.types.Object:
    """G11 K2 Side-Mounted Twin Spare 45-Rd Caseless Magazine Holding Brackets w/ Spring Latch Ears."""
    parts = []
    for x_off in (-7.8, 7.8):
        parts.append(mk_box(f"sc_top_{x_off}", 2.40, 0.42, 6.20, [("t", x_off, 1.12, 0.0)], mat=mats["H_Dark_Polymer"], bevel=0.06, bevel_segs=2))
        for sgn in (-1, 1):
            parts.append(mk_box(f"sc_clip_{x_off}_{sgn}", 2.58, 2.64, 1.34, [("t", x_off, 0.0, sgn * 3.56)], mat=mats["H_Olive_Monocoque"], bevel=0.10, bevel_segs=3))
            parts.append(mk_box(f"sc_latch_{x_off}_{sgn}", 1.10, 0.65, 0.34, [("t", x_off, -0.85, sgn * 4.06)], mat=mats["H_Control_Steel"], bevel=0.04))
    for sgn in (-1, 1):
        parts.append(mk_box(f"sc_tie_{sgn}", 18.6, 0.84, 0.54, [("t", 0.0, 0.0, sgn * 3.25)], mat=mats["H_Dark_Polymer"], bevel=0.06, bevel_segs=2))
    return finalize_watertight_part(join_parts("g11_spare_clips", parts), sharp_deg=36.0)


# --- SUITE 2: CLOCKWORK (9 parts — The Cutaway Swiss-Watch Showpiece!) ---

def build_g11_inner_receiver(mats) -> bpy.types.Object:
    """Floating CNC Steel Barreled-Action Chassis w/ Chamfered Stadium Clockwork Viewing Windows & Stainless Rails."""
    parts = []
    for sgn in (-1, 1):
        wall = mk_extrude_z(
            f"ir_wall_{sgn}",
            [(-28.8, -3.65), (14.2, -2.50), (14.2, 2.00), (-28.8, 2.00)],
            sgn * 2.10, sgn * 2.42, bevel=0.04, bevel_segs=2, mat=mats["C_Inner_Receiver_Steel"],
        )
        cut_breech = mk_cyl(f"ir_cb_{sgn}", 1.70, 1.70, 1.4, axis="z", segs=36, xform=[("t", -21.2, 0.0, sgn * 2.26)], mat=mats["C_Inner_Receiver_Steel"])
        cut_gears = mk_chamfered_stadium_cutter_z(
            f"ir_cg_{sgn}", cx=-14.35, cy=-0.10, z_wall=sgn * 2.42, depth=0.65,
            length=7.7, width=2.86, chamfer=0.06, side_sign=float(sgn), segs=10, mat=mats["C_Inner_Receiver_Steel"],
        )
        parts.append(bool_diff(wall, [cut_breech, cut_gears]))
        # Gleaming stainless longitudinal floating-action guide rails along outer upper/lower chassis edge
        parts.append(mk_box(f"ir_rail_u_{sgn}", 41.2, 0.24, 0.14, [("t", -7.3, 1.88, sgn * 2.38)], mat=mats["C_Stainless_Gear"], bevel=0.025))
        parts.append(mk_box(f"ir_rail_l_{sgn}", 41.2, 0.24, 0.14, [("t", -7.3, -2.85, sgn * 2.38)], mat=mats["C_Stainless_Gear"], bevel=0.025))

    trun = mk_box("ir_trun", 7.8, 2.75, 4.38, [("t", -15.1, 0.0, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.08, bevel_segs=2)
    trun_hole = mk_cyl("ir_th", 1.04, 1.04, 8.6, axis="x", segs=32, xform=[("t", -15.1, 0.0, 0.0)], mat=mats["C_Inner_Receiver_Steel"])
    parts.append(bool_diff(trun, [trun_hole]))

    top_rail = mk_box("ir_top", 38.7, 0.45, 4.46, [("t", -5.15, 1.98, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.05)
    feed_slot = mk_box("ir_fs", 2.4, 1.0, 1.80, [("t", -21.2, 1.98, 0.0)], mat=mats["C_Inner_Receiver_Steel"])
    parts.append(bool_diff(top_rail, [feed_slot]))

    parts.append(mk_box("ir_rear", 2.0, 5.55, 4.42, [("t", -27.8, -0.78, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.07, bevel_segs=2))
    parts.append(mk_box("ir_abut", 1.6, 1.45, 3.80, [("t", -18.6, -3.05, 0.0)], mat=mats["C_Stainless_Gear"], bevel=0.06))
    return finalize_watertight_part(join_parts("g11_inner_receiver", parts), sharp_deg=36.0)


def build_g11_rotary_breech(mats) -> bpy.types.Object:
    """THE STAR: Luminous Brushed-Chrome 90° Rotating Cylindrical Breech Block w/ Cutaway-Visible
    4.73×33mm Caseless Chamber, Brass Obturation Seals & Razor-Crisp 24-Tooth Involute Spur Gear!"""
    cyl = mk_cyl("rb_cyl", 1.98, 1.98, 2.74, axis="z", segs=56, xform=[("t", 0.0, 0.0, 0.11)], mat=mats["C_Chrome_Breech"], bevel=0.09)
    chamber_cut = mk_box("rb_ch", 4.30, 0.92, 2.10, [("t", 0.0, 0.0, 0.65)], mat=mats["C_Chamber_Carbon"], bevel=0.05)
    slotted = bool_diff(cyl, [chamber_cut])
    # Razor-crisp 24-tooth TRUE involute spur gear on -Z meshing 1:1 with clockwork planetary gear!
    gear_l = mk_spur_gear_z("rb_gl", 24, 1.86, 2.035, -1.68, -1.26, bore_r=0.68, mat=mats["C_Stainless_Gear"])
    # Brass front/rear chamber gas-obturation seal lips, concentric brass bearing ring & indexing cam boss!
    lip_top = mk_box("rb_lt", 3.32, 0.15, 0.26, [("t", 0.0, 0.52, 1.37)], mat=mats["C_Clockwork_Brass"], bevel=0.025)
    lip_bot = mk_box("rb_lb", 3.32, 0.15, 0.26, [("t", 0.0, -0.52, 1.37)], mat=mats["C_Clockwork_Brass"], bevel=0.025)
    # Recessed front +Z chamfered brass obturation bezel collar
    ring_f = bool_diff(
        mk_cyl("rb_rf_o", 1.88, 1.88, 0.12, axis="z", segs=44, xform=[("t", 0.0, 0.0, 1.43)], mat=mats["C_Clockwork_Brass"], bevel=0.02),
        [mk_cyl("rb_rf_i", 1.68, 1.68, 0.30, axis="z", segs=40, xform=[("t", 0.0, 0.0, 1.43)], mat=mats["C_Clockwork_Brass"]),
         mk_box("rb_rf_s", 4.20, 0.96, 0.40, [("t", 0.0, 0.0, 1.43)], mat=mats["C_Clockwork_Brass"])],
    )
    hub_l = mk_cyl("rb_hl", 0.58, 0.58, 0.26, axis="z", segs=28, xform=[("t", 0.0, 0.0, -1.56)], mat=mats["C_Clockwork_Brass"], bevel=0.035)
    return finalize_watertight_part(join_parts("g11_rotary_breech", [slotted, gear_l, lip_top, lip_bot, ring_f, hub_l]), sharp_deg=36.0)


def build_g11_clockwork_gears(mats) -> bpy.types.Object:
    """Swiss-Watch CNC Involute Stainless & 5-Spoke Golden C36000 Brass Planetary Gear Train
    w/ Sculpted Drive Cam Ratchet Pawl, Lightening Holes & Jewel Bearing Hub!"""
    # Rear -Z 26-tooth TRUE involute stainless spur gear w/ 5 weight-relief holes!
    gear_back = mk_spur_gear_z("cw_sl", 26, 1.92, 2.175, -1.70, -1.26, bore_r=0.72, mat=mats["C_Stainless_Gear"])
    gb_cuts = [
        mk_cyl(f"cw_gbh_{i}", 0.24, 0.24, 0.70, axis="z", segs=20,
               xform=[("t", math.cos(i * math.tau / 5.0) * 1.32, math.sin(i * math.tau / 5.0) * 1.32, -1.48)],
               mat=mats["C_Stainless_Gear"])
        for i in range(5)
    ]
    gear_back = bool_diff(gear_back, gb_cuts)

    # Front +Z SKELETONIZED 5-spoke golden C36000 brass TRUE involute watchmaker gear ring (`bore_r = 1.46`)!
    brass_ring = mk_spur_gear_z("cw_br", 22, 1.90, 2.175, 1.22, 1.58, bore_r=1.46, mat=mats["C_Clockwork_Brass"])
    spokes = []
    for i in range(5):
        a = (i / 5.0) * math.tau
        # Tapered watchmaker curved-shoulder spoke
        spk_xy = [(0.35, -0.15), (1.56, -0.09), (1.56, 0.09), (0.35, 0.15)]
        spokes.append(mk_extrude_z(f"cw_spk_{i}", spk_xy, 1.27, 1.53, bevel=0.03, bevel_segs=2, xform=[("rz", a)], mat=mats["C_Clockwork_Brass"]))

    # Sculpted Swiss-watch drive cam ratchet pawl engaging top rim of brass gear (gleams in ?cut=1!)
    pawl_curve = sample_quad_bezier((-1.35, 1.72), (-0.15, 2.02), (1.28, 1.62), segs=10)
    pawl_arm = mk_swept_bow("cw_pawl", pawl_curve, thickness=0.26, half_z=0.14, bevel=0.03, bevel_segs=2, mat=mats["C_Stainless_Gear"])
    bm_pw = bmesh.new()
    bm_pw.from_mesh(pawl_arm.data)
    for v in bm_pw.verts:
        v.co.y -= 1.42  # Blender -Y = Three.js +Z!
    bm_pw.to_mesh(pawl_arm.data)
    bm_pw.free()
    pawl_piv = mk_cyl("cw_ppiv", 0.22, 0.22, 0.42, axis="z", segs=18, xform=[("t", -1.35, 1.72, 1.42)], mat=mats["C_Clockwork_Brass"], bevel=0.025)

    parts = [
        gear_back,
        brass_ring,
        *spokes,
        pawl_arm,
        pawl_piv,
        mk_cyl("cw_hub_f", 0.64, 0.64, 0.44, axis="z", segs=32, xform=[("t", 0.0, 0.0, 1.42)], mat=mats["C_Chrome_Breech"], bevel=0.045),
        mk_cyl("cw_jewel", 0.34, 0.34, 0.58, axis="z", segs=28, xform=[("t", 0.0, 0.0, 1.48)], mat=mats["C_Clockwork_Brass"], bevel=0.035),
        mk_cyl("cw_tie", 0.30, 0.30, 3.55, axis="z", segs=22, xform=[("t", 0.0, -1.55, 0.0)], mat=mats["C_Chrome_Breech"], bevel=0.03),
        mk_cyl("cw_al", 0.45, 0.45, 0.56, axis="z", segs=24, xform=[("t", 0.0, 0.0, -1.58)], mat=mats["C_Clockwork_Brass"], bevel=0.04),
    ]
    return finalize_watertight_part(join_parts("g11_clockwork_gears", parts), sharp_deg=36.0)


def build_g11_driving_rod(mats) -> bpy.types.Object:
    """Twin Stainless Gas-Piston-Actuated Involute Toothed Steel Drive Rack (`Zahnstange`)."""
    yoke = mk_box("dr_yoke", 1.20, 0.94, 3.66, [("t", 8.80, 0.10, 0.0)], mat=mats["C_Stainless_Gear"], bevel=0.05, bevel_segs=2)
    parts = [yoke]
    # Precision trapezoidal involute rack tooth profile (16 teeth per side!)
    tooth_xy = [(-0.18, 0.04), (0.18, 0.04), (0.10, 0.46), (-0.10, 0.46)]
    for sgn in (-1, 1):
        parts.append(mk_box(f"dr_rail_{sgn}", 18.80, 0.56, 0.36, [("t", -0.20, -0.22, sgn * 1.66)], mat=mats["C_Stainless_Gear"], bevel=0.04, bevel_segs=2))
        z0, z1 = (1.49, 1.83) if sgn > 0 else (-1.83, -1.49)
        for t in range(16):
            tx = -9.15 + t * 0.52
            parts.append(mk_extrude_z(f"dr_t_{sgn}_{t}", [(x + tx, y) for x, y in tooth_xy], z0, z1, bevel=0.025, bevel_segs=1, mat=mats["C_Clockwork_Brass"]))
    return finalize_watertight_part(join_parts("g11_driving_rod", parts), sharp_deg=34.0)


def build_g11_gas_piston(mats) -> bpy.types.Object:
    """Under-Barrel Short-Stroke Gas Tap Block & Chrome Annular Piston."""
    collar = mk_box("gp_blk", 2.60, 2.20, 1.84, [("t", 3.10, 0.55, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.07, bevel_segs=2)
    bore = mk_cyl("gp_bh", 0.76, 0.76, 3.20, axis="x", segs=28, xform=[("t", 3.10, 1.55, 0.0)], mat=mats["C_Inner_Receiver_Steel"])
    gas_block = bool_diff(collar, [bore])
    piston = mk_lathe_x(
        "gp_pist",
        [
            (0.0, -3.20), (0.36, -3.20), (0.36, 0.90), (0.62, 1.00),
            (0.62, 1.55), (0.48, 1.62), (0.62, 1.72), (0.62, 2.30),
            (0.48, 2.38), (0.62, 2.48), (0.62, 3.00), (0.0, 3.00),
        ],
        segs=36, mat=mats["C_Chrome_Breech"],
    )
    return finalize_watertight_part(join_parts("g11_gas_piston", [gas_block, piston]), sharp_deg=36.0)


def build_g11_loading_rammer(mats) -> bpy.types.Object:
    """Vertical Spring-Cam Overhead Caseless Feed Rammer (`Zufuehrstoessel`) w/ Roller Follower."""
    yoke = mk_box("lr_yoke", 2.20, 0.94, 2.14, [("t", 0.0, 0.52, 0.0)], mat=mats["C_Stainless_Gear"], bevel=0.08, bevel_segs=2)
    plunger = mk_box("lr_plg", 1.15, 1.84, 0.96, [("t", 0.0, -0.42, 0.0)], mat=mats["C_Clockwork_Brass"], bevel=0.05, bevel_segs=2)
    roller = mk_cyl("lr_rol", 0.30, 0.30, 0.52, axis="z", segs=22, xform=[("t", 0.0, 0.52, 0.92)], mat=mats["C_Chrome_Breech"], bevel=0.03)
    return finalize_watertight_part(join_parts("g11_loading_rammer", [yoke, plunger, roller]), sharp_deg=36.0)


def build_g11_firing_pin(mats) -> bpy.types.Object:
    """Coaxial Hardened Stainless Striker Rod & Sear Cocking Lug."""
    rod = mk_lathe_x(
        "fp_rod",
        [
            (0.0, -2.85), (0.44, -2.85), (0.44, -1.60), (0.28, -1.45),
            (0.28, 0.65), (0.14, 0.95), (0.12, 1.35), (0.0, 1.35),
        ],
        segs=28, mat=mats["C_Stainless_Gear"],
    )
    lug = mk_box("fp_lug", 0.95, 0.94, 0.72, [("t", -2.00, -0.05, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.05, bevel_segs=2)
    return finalize_watertight_part(join_parts("g11_firing_pin", [rod, lug]), sharp_deg=36.0)


def build_g11_buffer_assembly(mats) -> bpy.types.Object:
    """Rear Hydraulic/Elastomer Floating-Action Recoil Buffer."""
    blk = mk_box("buf_blk", 2.18, 5.58, 4.18, [("t", 0.05, -0.30, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.10, bevel_segs=3)
    pad = mk_box("buf_pad", 0.55, 4.40, 3.60, [("t", 0.95, 0.10, 0.0)], mat=mats["C_Buffer_Elastomer"], bevel=0.08, bevel_segs=2)
    seat = mk_cyl("buf_seat", 0.68, 0.68, 0.90, axis="x", segs=28, xform=[("t", 0.80, -1.45, 0.0)], mat=mats["C_Stainless_Gear"], bevel=0.05)
    return finalize_watertight_part(join_parts("g11_buffer_assembly", [blk, pad, seat]), sharp_deg=36.0)


def build_g11_trigger_pack(mats) -> bpy.types.Object:
    """Internal Clockwork 3-Round Burst Counter & Sear Housing w/ Exposed Involute Ratchet & Pawl."""
    housing_raw = mk_box("tp_box", 8.58, 2.74, 2.64, [("t", 0.0, -0.10, 0.0)], mat=mats["C_Inner_Receiver_Steel"], bevel=0.09, bevel_segs=2)
    win = mk_chamfered_stadium_cutter_z("tp_win", -0.80, 0.10, 1.32, 0.55, 4.2, 1.55, chamfer=0.06, side_sign=1.0, segs=8, mat=mats["C_Inner_Receiver_Steel"])
    housing = bool_diff(housing_raw, [win])
    ratchet = mk_spur_gear_z("tp_rat", 12, 0.88, 1.12, -0.28, 1.24, bore_r=0.28, mat=mats["C_Clockwork_Brass"], xform=[("t", -1.20, 0.22, 0.0)])
    pawl = mk_box("tp_pawl", 1.85, 0.28, 0.26, [("rz", -0.22), ("t", 0.55, 0.48, 1.05)], mat=mats["C_Stainless_Gear"], bevel=0.03)
    pins = [
        mk_cyl(f"tp_p_{i}", 0.22, 0.22, 2.66, axis="z", segs=20, xform=[("t", px, py, 0.0)], mat=mats["C_Stainless_Gear"], bevel=0.025)
        for i, (px, py) in enumerate(((-2.8, -0.4), (0.6, -0.2), (2.8, 0.3)))
    ]
    return finalize_watertight_part(join_parts("g11_trigger_pack", [housing, ratchet, pawl, *pins]), sharp_deg=36.0)


# --- SUITE 3: BARREL & MAGAZINE (6 parts) ---

def build_g11_barrel(mats) -> bpy.types.Object:
    """54.0 cm (540 mm) Cold-Hammer-Forged Chrome-Lined Floating 4.73mm Barrel."""
    barrel = mk_lathe_x(
        "g11_barrel",
        [
            (0.32, -19.00), (0.98, -19.00), (0.98, -11.00), (0.82, -10.40),
            (0.82,   6.20), (0.72,   6.80), (0.72,  16.00), (0.68,  16.50),
            (0.68,  34.40), (0.64,  34.50), (0.64,  34.95), (0.58,  35.00),
            (0.25,  35.00), (0.25, -18.70), (0.32, -19.00),
        ],
        segs=44, mat=mats["BM_Barrel_CHF"],
    )
    barrel.data.materials.append(mats["BM_Chrome_Bore"])
    for poly in barrel.data.polygons:
        c = poly.center
        if math.hypot(c.y, c.z) < 0.36:
            poly.material_index = 1
    return finalize_watertight_part(barrel, sharp_deg=36.0)


def build_g11_flash_hider(mats) -> bpy.types.Object:
    """Slotted H&K G11 K2 Birdcage Flash Hider w/ Heat Temper, Grenade Ring, Chamfered Slots & Bayonet Lug."""
    body = mk_lathe_x(
        "fh_body",
        [
            (0.64, 0.00), (0.92, 0.00), (0.92, 1.05), (0.96, 1.15),
            (0.96, 1.55), (0.88, 1.65), (0.88, 4.35), (0.82, 4.50),
            (0.44, 4.50), (0.44, 1.05), (0.64, 0.95), (0.64, 0.00),
        ],
        segs=40, mat=mats["BM_Flash_Hider_Heat"],
    )
    cutters = []
    for i in range(6):
        a = (i / 6.0) * math.tau
        cutters.append(mk_box(f"fh_s_{i}", 2.20, 0.24, 1.12, [("t", 2.95, 0.0, 0.65), ("rx", a)], mat=mats["BM_Flash_Hider_Heat"], bevel=0.04))
    slotted = bool_diff(body, cutters)
    bayo = mk_box("fh_bayo", 2.40, 0.64, 0.62, [("t", 1.45, -1.02, 0.0)], mat=mats["BM_Flash_Hider_Heat"], bevel=0.06, bevel_segs=2)
    return finalize_watertight_part(join_parts("g11_flash_hider", [slotted, bayo]), sharp_deg=36.0)


def build_g11_trigger(mats) -> bpy.types.Object:
    """Smoothly Swept Curved H&K Steel Trigger Shoe + Twin Stainless Transfer Bar."""
    shoe_curve = sample_cubic_bezier((0.28, 1.20), (0.04, 0.15), (-0.08, -0.95), (0.62, -1.86), segs=12)
    shoe = mk_swept_bow("trg_shoe", shoe_curve, thickness=0.68, half_z=0.41, bevel=0.06, bevel_segs=2, mat=mats["BM_Trigger_Steel"])
    bar = mk_box("trg_bar", 5.60, 0.45, 1.18, [("t", -2.35, 1.10, 0.0)], mat=mats["BM_Transfer_Stainless"], bevel=0.04, bevel_segs=2)
    return finalize_watertight_part(join_parts("g11_trigger", [shoe, bar]), sharp_deg=36.0)


def build_g11_mag_tube(mats) -> bpy.types.Object:
    """Overhead 45-Rd Smoked Caseless Magazine Housing w/ Top/Bottom Molded Frame Rails
    (clean hollow interior for live cutaway MagazineAmmoStack & planar Hero flanks for DM11 blocks!)."""
    outer = mk_box("mag_outer", 52.10, 3.58, 2.62, [("t", -0.10, 0.0, 0.0)], mat=mats["BM_Mag_Smoked"], bevel=0.10, bevel_segs=3)
    cav = mk_box("mag_cav", 51.40, 3.04, 2.02, [("t", 0.25, 0.0, 0.0)], mat=mats["BM_Mag_Smoked"])
    throat = mk_box("mag_th", 2.20, 1.20, 1.85, [("t", -24.80, -1.55, 0.0)], mat=mats["BM_Mag_Smoked"])
    shell = bool_diff(outer, [cav, throat])
    # Top & bottom structural molded rail ribs in BM_Mag_Cap_Poly (never collides w/ BM_Mag_Smoked Hero flanks!)
    parts = [
        shell,
        mk_box("mag_top_rail_l", 50.8, 0.16, 0.26, [("t", -0.10,  1.72, -1.04)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.03),
        mk_box("mag_top_rail_r", 50.8, 0.16, 0.26, [("t", -0.10,  1.72,  1.04)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.03),
        mk_box("mag_bot_rail_l", 46.5, 0.16, 0.26, [("t",  1.60, -1.72, -1.04)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.03),
        mk_box("mag_bot_rail_r", 46.5, 0.16, 0.26, [("t",  1.60, -1.72,  1.04)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.03),
        mk_box("mag_rear_stop",   0.65, 3.54, 2.56, [("t", -25.82, 0.0, 0.0)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.06),
    ]
    return finalize_watertight_part(join_parts("g11_mag_tube", parts), sharp_deg=36.0)


def build_g11_mag_follower(mats) -> bpy.types.Object:
    """Strictly Firewalled Vivid Safety-Orange Horizontal Pusher Follower."""
    body = mk_box("fol_main", 1.96, 2.68, 1.92, mat=mats["BM_Follower_Orange"], bevel=0.09, bevel_segs=2)
    rail_t = mk_box("fol_rt", 1.82, 0.26, 1.44, [("t", 0.0, 1.21, 0.0)], mat=mats["BM_Follower_Orange"], bevel=0.035)
    rail_b = mk_box("fol_rb", 1.82, 0.26, 1.44, [("t", 0.0, -1.21, 0.0)], mat=mats["BM_Follower_Orange"], bevel=0.035)
    return finalize_watertight_part(join_parts("g11_mag_follower", [body, rail_t, rail_b]), sharp_deg=36.0)


def build_g11_mag_endcap(mats) -> bpy.types.Object:
    """Front Knurled Twist-Lock Bayonet Caseless Magazine Endcap w/ Spring Detent Latch."""
    cap = mk_box("ec_cap", 2.20, 3.54, 2.68, [("t", 0.85, 0.0, 0.0)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.14, bevel_segs=3)
    spigot = mk_box("ec_spg", 0.60, 2.70, 1.90, [("t", -0.05, 0.0, 0.0)], mat=mats["BM_Trigger_Steel"], bevel=0.05)
    parts = [cap, spigot]
    # Tactile grip ribs along left/right endcap flanks + front bayonet release button
    for k in range(4):
        rx = 0.22 + k * 0.42
        parts.append(mk_box(f"ec_rib_{k}", 0.16, 2.65, 2.74, [("t", rx, 0.0, 0.0)], mat=mats["BM_Mag_Cap_Poly"], bevel=0.03))
    parts.append(mk_cyl("ec_btn", 0.36, 0.36, 0.22, axis="x", segs=22, xform=[("t", 1.94, 0.0, 0.0)], mat=mats["BM_Trigger_Steel"], bevel=0.03))
    return finalize_watertight_part(join_parts("g11_mag_endcap", parts), sharp_deg=36.0)


# =============================================================================
# UV Unwrapping & Packing Across 3 Dedicated 2K Hero Atlases (ZERO Overlap!)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
    only_face_fn=None,
):
    if not objs:
        return
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
            if only_face_fn is not None:
                f.select = bool(only_face_fn(o.name, f, mname))
            elif skip_face_fn is not None:
                f.select = not bool(skip_face_fn(o.name, f, mname))
            else:
                f.select = True
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    du = u1 - u0
    dv = v1 - v0
    pack_margin = min(0.024, max(0.006, 0.006 / max(0.20, min(du, dv))))

    select_only(objs, objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.0055,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=pack_margin,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if only_face_fn is not None and not only_face_fn(o.name, f, mname):
                continue
            if skip_face_fn is not None and skip_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()


def unwrap_housing_atlas(housing_objs: list[bpy.types.Object]):
    """Unwraps 7 housing parts into `g11_v3_housing` (2048x2048) with >= 60 px lens & red firewalls!"""
    def is_hero_or_fw_housing(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        ty, tz = c.z, -c.y
        nz = -n.y
        if obj_name == "g11_outer_housing" and mat_name == "H_Olive_Monocoque":
            if (nz > 0.85 and tz > 2.85) or (nz < -0.85 and tz < -2.85):
                return True
        if obj_name == "g11_optic_handle":
            if mat_name == "H_Optic_Lens":
                return True
            if mat_name == "H_Olive_Monocoque" and ty > 2.60 and ((nz > 0.85 and tz > 1.70) or (nz < -0.85 and tz < -1.70)):
                return True
        if obj_name == "g11_selector" and mat_name == "H_Selector_Red":
            return True
        if obj_name == "g11_winding_knob" and mat_name == "H_Winding_Steel":
            if nz < -0.88 and tz < -0.42:
                return True
        return False

    oh = [o for o in housing_objs if o.name == "g11_outer_housing"]
    gb = [o for o in housing_objs if o.name in {"g11_pistol_grip", "g11_buttplate"}]
    os_ = [o for o in housing_objs if o.name in {"g11_optic_handle", "g11_spare_clips"}]
    ws = [o for o in housing_objs if o.name in {"g11_winding_knob", "g11_selector"}]
    opt_obj = [o for o in housing_objs if o.name == "g11_optic_handle"]
    sel_obj = [o for o in housing_objs if o.name == "g11_selector"]
    wk_obj = [o for o in housing_objs if o.name == "g11_winding_knob"]

    _smart_unwrap_and_pack_rect(oh,  0.012, 0.365, 0.012, 0.365, skip_face_fn=is_hero_or_fw_housing)
    _smart_unwrap_and_pack_rect(gb,  0.380, 0.610, 0.012, 0.365)
    _smart_unwrap_and_pack_rect(os_, 0.625, 0.825, 0.165, 0.365, skip_face_fn=is_hero_or_fw_housing)
    _smart_unwrap_and_pack_rect(ws,  0.752, 0.830, 0.012, 0.150, skip_face_fn=is_hero_or_fw_housing)

    # Project crisp circular Hero UV onto outer -Z face of `g11_winding_knob` (`u[0.625, 0.745], v[0.015, 0.135]`)
    wk = wk_obj[0]
    bm = bmesh.new()
    bm.from_mesh(wk.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in wk.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_or_fw_housing("g11_winding_knob", f, mname):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 2.42) / 4.84))
            yn = max(0.0, min(1.0, (ty + 2.42) / 4.84))
            loop[uv_layer].uv = (0.625 + (1.0 - xn) * 0.120, 0.015 + yn * 0.120)
    bm.to_mesh(wk.data)
    bm.free()

    # STRICT FIREWALL 1 (>= 61 px moat): Hensoldt Emerald-Sapphire Optical Lenses
    _smart_unwrap_and_pack_rect(opt_obj, 0.855, 0.985, 0.240, 0.365, only_face_fn=lambda _n, _f, m: m == "H_Optic_Lens")
    # STRICT FIREWALL 2 (>= 61 px moat): Vivid Crimson Selector Tip
    _smart_unwrap_and_pack_rect(sel_obj, 0.855, 0.985, 0.015, 0.140, only_face_fn=lambda _n, _f, m: m == "H_Selector_Red")

    # Project undistorted 1:1 planar hero UVs onto `g11_outer_housing` Left (-Z) & Right (+Z) flanks
    housing = oh[0]
    bm = bmesh.new()
    bm.from_mesh(housing.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in housing.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_or_fw_housing("g11_outer_housing", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-34.6)) / 65.2))
            yn = max(0.0, min(1.0, (ty - (-6.8)) / 13.4))
            if is_right:
                loop[uv_layer].uv = (0.012 + xn * 0.976, 0.518 + yn * 0.228)
            else:
                loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.976, 0.760 + yn * 0.228)
    bm.to_mesh(housing.data)
    bm.free()

    # Project undistorted planar hero UVs onto `g11_optic_handle` Left & Right optic hood flanks
    opt = opt_obj[0]
    bm = bmesh.new()
    bm.from_mesh(opt.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in opt.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if mname == "H_Optic_Lens" or not is_hero_or_fw_housing("g11_optic_handle", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 14.6) / 29.2))
            yn = max(0.0, min(1.0, (ty - 2.55) / 3.10))
            if is_right:
                loop[uv_layer].uv = (0.512 + xn * 0.476, 0.395 + yn * 0.107)
            else:
                loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.476, 0.395 + yn * 0.107)
    bm.to_mesh(opt.data)
    bm.free()


def unwrap_clockwork_atlas(cw_objs: list[bpy.types.Object]):
    """Unwraps 9 clockwork steel/chrome/brass parts into `g11_v3_clockwork` (2048x2048)."""
    def is_hero_cw(obj_name: str, face, mat_name: str) -> bool:
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        if obj_name == "g11_inner_receiver" and mat_name == "C_Inner_Receiver_Steel":
            if (nz > 0.88 and tz > 2.30) or (nz < -0.88 and tz < -2.30):
                return True
        if obj_name == "g11_rotary_breech" and mat_name == "C_Chrome_Breech":
            if abs(nz) > 0.88 and abs(tz) > 1.22:
                return True
        return False

    ir = [o for o in cw_objs if o.name == "g11_inner_receiver"]
    rb = [o for o in cw_objs if o.name == "g11_rotary_breech"]
    cg = [o for o in cw_objs if o.name == "g11_clockwork_gears"]
    rods = [o for o in cw_objs if o.name in {"g11_driving_rod", "g11_gas_piston", "g11_loading_rammer", "g11_firing_pin"}]
    fcu = [o for o in cw_objs if o.name in {"g11_trigger_pack", "g11_buffer_assembly"}]

    _smart_unwrap_and_pack_rect(rb,   0.290, 0.560, 0.430, 0.690, skip_face_fn=is_hero_cw)
    _smart_unwrap_and_pack_rect(cg,   0.575, 0.988, 0.370, 0.690)
    _smart_unwrap_and_pack_rect(ir,   0.012, 0.480, 0.012, 0.415, skip_face_fn=is_hero_cw)
    _smart_unwrap_and_pack_rect(rods, 0.495, 0.760, 0.012, 0.355)
    _smart_unwrap_and_pack_rect(fcu,  0.775, 0.988, 0.012, 0.355)

    # Project hero UVs onto `g11_inner_receiver` Left & Right outer side bars
    ir_obj = ir[0]
    bm = bmesh.new()
    bm.from_mesh(ir_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in ir_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_cw("g11_inner_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-28.8)) / 43.0))
            yn = max(0.0, min(1.0, (ty - (-3.1)) / 5.1))
            if is_right:
                loop[uv_layer].uv = (0.012 + xn * 0.976, 0.710 + yn * 0.133)
            else:
                loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.976, 0.855 + yn * 0.133)
    bm.to_mesh(ir_obj.data)
    bm.free()

    # Project hero circular sunburst UVs onto `g11_rotary_breech` Z-cheeks
    rb_obj = rb[0]
    bm = bmesh.new()
    bm.from_mesh(rb_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rb_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_cw("g11_rotary_breech", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 2.05) / 4.10))
            yn = max(0.0, min(1.0, (ty + 2.05) / 4.10))
            u = 0.015 + (xn if is_right else (1.0 - xn)) * 0.260
            v = 0.430 + yn * 0.260
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(rb_obj.data)
    bm.free()


def unwrap_barrel_mag_atlas(bm_objs: list[bpy.types.Object]):
    """Unwraps 6 barrel & caseless mag parts into `g11_v3_barrel_mag` w/ >= 70 px Safety-Orange firewall!"""
    def is_hero_mag_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "g11_mag_tube" or mat_name != "BM_Mag_Smoked":
            return False
        c = face.calc_center_median()
        tz = -c.y
        nz = -face.normal.y
        return (nz > 0.88 and tz > 1.22) or (nz < -0.88 and tz < -1.22)

    bbl = [o for o in bm_objs if o.name in {"g11_barrel", "g11_flash_hider"}]
    mag = [o for o in bm_objs if o.name == "g11_mag_tube"]
    fol = [o for o in bm_objs if o.name == "g11_mag_follower"]
    cap = [o for o in bm_objs if o.name in {"g11_mag_endcap", "g11_trigger"}]

    _smart_unwrap_and_pack_rect(bbl, 0.012, 0.725, 0.320, 0.578)
    _smart_unwrap_and_pack_rect(mag, 0.012, 0.725, 0.012, 0.305, skip_face_fn=is_hero_mag_flank)
    # STRICT FIREWALL (>= 72 px moat on all sides): Vivid Safety-Orange Horizontal Follower!
    _smart_unwrap_and_pack_rect(fol, 0.760, 0.988, 0.340, 0.562)
    _smart_unwrap_and_pack_rect(cap, 0.760, 0.988, 0.012, 0.305)

    # Project undistorted planar hero UVs onto `g11_mag_tube` Left (-Z) & Right (+Z) smoked caseless flanks!
    mag_obj = mag[0]
    bm = bmesh.new()
    bm.from_mesh(mag_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_hero_mag_flank("g11_mag_tube", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 26.15) / 52.10))
            yn = max(0.0, min(1.0, (ty + 1.79) / 3.58))
            if is_right:
                loop[uv_layer].uv = (0.012 + xn * 0.976, 0.598 + yn * 0.188)
            else:
                loop[uv_layer].uv = (0.012 + (1.0 - xn) * 0.976, 0.800 + yn * 0.188)
    bm.to_mesh(mag_obj.data)
    bm.free()


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
        o.location = (i * 80.0, 0.0, 0.0)
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
            o.location = (0.0, 220.0, 0.0)


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
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=4, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=8, fill_color=(0.04, 0.045, 0.04, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=8, fill_color=(0.55, 0.55, 0.55, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=8, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.65
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    if ext_targets:
        scene.world.light_settings.distance = 0.48
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
        bpy.ops.object.bake(type="EMIT", margin=4, use_clear=False)
        _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
        _remove_bake_image_nodes(nodes_m)
        bpy.data.images.remove(img_m)
        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    else:
        # Purely internal clockwork suite: clean Self-AO everywhere (zero exterior contact mask)
        np.save(tmp_dir / f"{prefix}_ao_ext.npy", np.ones((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))
        np.save(tmp_dir / f"{prefix}_ext_mask.npy", np.zeros((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))


# =============================================================================
# Strict Manifold, Outward-Volume & Bounding-Box Verification + Draco Export
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.16) else "WARN"
        print(
            f"  [{status}] {o.name:22s} tris={tris:5d} non_man={non_man:2d} vol={vol:8.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.4f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    return report


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

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


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: Housing (7)
        "g11_outer_housing":   build_g11_outer_housing,
        "g11_optic_handle":    build_g11_optic_handle,
        "g11_pistol_grip":     build_g11_pistol_grip,
        "g11_buttplate":       build_g11_buttplate,
        "g11_winding_knob":    build_g11_winding_knob,
        "g11_selector":        build_g11_selector,
        "g11_spare_clips":     build_g11_spare_clips,
        # Suite 2: Clockwork (9)
        "g11_inner_receiver":  build_g11_inner_receiver,
        "g11_rotary_breech":   build_g11_rotary_breech,
        "g11_clockwork_gears": build_g11_clockwork_gears,
        "g11_driving_rod":     build_g11_driving_rod,
        "g11_gas_piston":      build_g11_gas_piston,
        "g11_loading_rammer":  build_g11_loading_rammer,
        "g11_firing_pin":      build_g11_firing_pin,
        "g11_buffer_assembly": build_g11_buffer_assembly,
        "g11_trigger_pack":    build_g11_trigger_pack,
        # Suite 3: Barrel & Caseless Magazine (6)
        "g11_barrel":          build_g11_barrel,
        "g11_flash_hider":     build_g11_flash_hider,
        "g11_trigger":         build_g11_trigger,
        "g11_mag_tube":        build_g11_mag_tube,
        "g11_mag_follower":    build_g11_mag_follower,
        "g11_mag_endcap":      build_g11_mag_endcap,
    }

    print("[BUILD] Sculpting all 22 solid H&K G11 K2 (4.73x33mm DM11 Caseless) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    housing_objs = [built[pid] for pid in HOUSING_PARTS]
    clockwork_objs = [built[pid] for pid in CLOCKWORK_PARTS]
    barrel_mag_objs = [built[pid] for pid in BARREL_MAG_PARTS]
    all_objs = housing_objs + clockwork_objs + barrel_mag_objs
    assert len(all_objs) == 22, f"Expected 22 solid parts, got {len(all_objs)}"

    print("[VERIFY] Checking manifoldness, outward normals & CAD bounding-box alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: housing (7), clockwork (9), barrel_mag (6)...")
    unwrap_housing_atlas(housing_objs)
    unwrap_clockwork_atlas(clockwork_objs)
    unwrap_barrel_mag_atlas(barrel_mag_objs)

    for label, group in (("housing", housing_objs), ("clockwork", clockwork_objs), ("barrel_mag", barrel_mag_objs)):
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
            assert 0.00003 < oa < 0.85, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.15 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="g11_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking g11_v3_housing (2048x2048, 7 housing, optic, grip, crank & spare-clip parts)...")
        bake_atlas_suite("housing", housing_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking g11_v3_clockwork (2048x2048, 9 rotary breech, Swiss gear train, rack & inner chassis parts)...")
        bake_atlas_suite("clockwork", clockwork_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking g11_v3_barrel_mag (2048x2048, 6 barrel, flash hider, 45-rd DM11 mag & safety-orange follower parts)...")
        bake_atlas_suite("barrel_mag", barrel_mag_objs, all_objs, tmp_dir)

        print("[POST] Compositing Oberndorf HK G11 K2 rollmarks, Ulm proofs, S/1/3/A icons, emerald lenses, 45-rd DM11 mag & ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "g11_v3_housing_albedo.webp",
        TEX_OUT_DIR / "g11_v3_housing_normal.webp",
        TEX_OUT_DIR / "g11_v3_housing_roughness.webp",
        TEX_OUT_DIR / "g11_v3_clockwork_albedo.webp",
        TEX_OUT_DIR / "g11_v3_clockwork_normal.webp",
        TEX_OUT_DIR / "g11_v3_clockwork_roughness.webp",
        TEX_OUT_DIR / "g11_v3_barrel_mag_albedo.webp",
        TEX_OUT_DIR / "g11_v3_barrel_mag_normal.webp",
        TEX_OUT_DIR / "g11_v3_barrel_mag_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== H&K G11 K2 (4.73x33mm DM11 CASELESS) V3 ASSET BUDGET ===")
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
