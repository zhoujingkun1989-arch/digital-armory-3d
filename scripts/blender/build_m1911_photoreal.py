#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Colt M1911A1 U.S. Army (.45 ACP)
================================================================================
MIT License — Digital Armory 3D (`BAY-30`)

Generates:
  - public/models/m1911.glb (Draco-compressed glTF 2.0, all 21 watertight solid parts;
    skips ONLY the 3 dynamically GPU-compressed `aSpringParam` springs:
    `m1911_recoil_spring`, `m1911_mainspring`, `m1911_mag_spring`)
  - public/textures/m1911_v3_walnut_{albedo,normal,roughness}.webp (2048x2048 Packed ORM, 0 alpha)
  - public/textures/m1911_v3_slide_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM, 0 alpha)
  - public/textures/m1911_v3_metal_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM, 0 alpha)

Coordinate & Transform Contract (`glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Three.js Z-rotation rz maps to Blender Y-rotation ry = -rz.
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/Rot, then all
    21 objects are reset to identity transform (0,0,0) before Draco glTF export.
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
# MODE 2: System Python Post-Process (1943 Colt Hartford / US Army Rollmarks,
#         G.H.D. Cartouche, Ordnance Crossed Cannons, 20-LPI Double-Diamond
#         Walnut Checkering, Chamber Rollmark, RNM Normals & Packed ORM WebPs)
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    from scipy import ndimage

    FONT_SERIF_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_COND, FONT_DIN, FONT_SERIF_BOLD, *FONT_FALLBACKS):
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

    def _paste_uv_band(target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float) -> None:
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return
        resized = pil_l.resize((x1 - x0, y1 - y0), resample=Image.Resampling.LANCZOS)
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray) -> None:
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _save_webp_rgb(arr01: np.ndarray, path: Path, quality: int) -> None:
        img = Image.fromarray(np.clip(arr01 * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB")
        img.save(path, "WEBP", quality=quality, method=6)

    def _draw_ordnance_wheel(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Stylized U.S. Army Ordnance Crossed-Cannons Belt Wheel Cartouche."""
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=245, width=max(3, int(r * 0.14)))
        draw.ellipse((cx - r * 0.68, cy - r * 0.68, cx + r * 0.68, cy + r * 0.68), outline=235, width=max(2, int(r * 0.08)))
        draw.line((cx - r * 0.65, cy - r * 0.45, cx + r * 0.65, cy + r * 0.45), fill=245, width=max(3, int(r * 0.13)))
        draw.line((cx - r * 0.65, cy + r * 0.45, cx + r * 0.65, cy - r * 0.45), fill=245, width=max(3, int(r * 0.13)))
        draw.ellipse((cx - r * 0.20, cy - r * 0.72, cx + r * 0.20, cy - r * 0.34), outline=245, width=max(2, int(r * 0.09)))

    def _draw_rampant_colt_badge(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Stylized Rampant Colt Prancing Horse Silhouette Crest (engraved line stamp)."""
        w = max(3, int(r * 0.11))
        # Subtle heritage oval framing + stylized rearing silhouette lines
        draw.ellipse((cx - r * 0.92, cy - r * 1.15, cx + r * 0.92, cy + r * 1.15), outline=220, width=max(2, int(r * 0.07)))
        # Hind legs -> torso -> arched neck -> raised forelegs -> broken spear cross
        draw.line((cx - r * 0.25, cy + r * 0.78, cx - r * 0.08, cy + r * 0.22), fill=255, width=w)
        draw.line((cx + r * 0.18, cy + r * 0.80, cx + r * 0.05, cy + r * 0.25), fill=255, width=w)
        draw.polygon(
            [
                (cx - r * 0.18, cy + r * 0.28),
                (cx + r * 0.18, cy + r * 0.15),
                (cx + r * 0.22, cy - r * 0.25),
                (cx - r * 0.05, cy - r * 0.62),
                (cx - r * 0.32, cy - r * 0.52),
                (cx - r * 0.20, cy - r * 0.18),
            ],
            fill=245,
        )
        draw.line((cx - r * 0.16, cy - r * 0.18, cx - r * 0.56, cy - r * 0.24), fill=255, width=w)
        draw.line((cx - r * 0.12, cy - r * 0.04, cx - r * 0.48, cy + r * 0.14), fill=255, width=w)
        draw.line((cx - r * 0.54, cy - r * 0.68, cx + r * 0.48, cy - r * 0.14), fill=235, width=max(2, int(r * 0.07)))

    # =========================================================================
    # SUITE 1: m1911_v3_walnut (Double-Diamond 20-LPI Checkered Walnut Grips)
    # =========================================================================
    def process_walnut_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "walnut_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "walnut_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "walnut_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "walnut_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "walnut_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "walnut_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "walnut_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.30, 1.0).astype(np.float32)

        # Synthesize authentic Colt 20-LPI Double-Diamond Checkering onto HERO_GRIP_L & HERO_GRIP_R!
        # Left grip outer face UV:  u in [0.025, 0.455], v in [0.040, 0.960]
        # Right grip outer face UV: u in [0.495, 0.925], v in [0.040, 0.960]
        # (Brass grip screws live in UV firewall zone u >= 0.955 -> >= 60px separation!)
        chk_height = np.zeros((h, w), dtype=np.float32)
        chk_mask_all = np.zeros((h, w), dtype=np.float32)

        def paint_double_diamond(u0: float, u1: float, v0: float, v1: float):
            x0, x1 = int(round(u0 * w)), int(round(u1 * w))
            y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
            yy, xx = np.mgrid[y0:y1, x0:x1]
            # Normalized local panel coords: lx in [-1, 1] (width 3.68 cm), ly in [-1, 1] (height 9.55 cm)
            lx = ((xx - x0) / max(1, x1 - x0)) * 2.0 - 1.0
            ly = (1.0 - (yy - y0) / max(1, y1 - y0)) * 2.0 - 1.0
            # Physical cm coords on panel
            px_cm = lx * 1.84
            py_cm = ly * 4.775

            # Outer smooth walnut border margin (0.34 cm wide perimeter frame)
            in_field = (
                _smoothstep(0.0, 0.08, 1.50 - np.abs(px_cm))
                * _smoothstep(0.0, 0.10, 4.35 - np.abs(py_cm))
            )

            # Iconic DOUBLE-DIAMOND smooth walnut islands centered at upper/lower screw bosses (py = ±3.50 cm)
            d_top = np.abs(px_cm) * 1.15 + np.abs(py_cm - 3.45) * 0.78
            d_bot = np.abs(px_cm) * 1.15 + np.abs(py_cm + 3.55) * 0.78
            diamond_keepout = np.maximum(
                1.0 - _smoothstep(1.04, 1.18, d_top),
                1.0 - _smoothstep(1.04, 1.18, d_bot),
            )
            # Crisp single border groove around each diamond & outer field
            border_groove = np.maximum(
                np.exp(-((np.abs(d_top - 1.14) / 0.045) ** 2)),
                np.exp(-((np.abs(d_bot - 1.14) / 0.045) ** 2)),
            )

            active = np.clip(in_field * (1.0 - diamond_keepout), 0.0, 1.0)

            # Crisp 60-degree double-diamond checkering pyramids (clearly visible at all camera distances!)
            freq = 5.4
            a1 = (px_cm * 0.866 + py_cm * 0.500) * freq
            a2 = (px_cm * 0.866 - py_cm * 0.500) * freq
            tri1 = 1.0 - np.abs((a1 % 1.0) * 2.0 - 1.0)
            tri2 = 1.0 - np.abs((a2 % 1.0) * 2.0 - 1.0)
            pyramid = np.minimum(tri1, tri2)  # crisp 4-faceted checkering pyramids in [0, 1]

            h_local = (pyramid - 0.55) * active - 0.65 * border_groove * in_field
            chk_height[y0:y1, x0:x1] = h_local.astype(np.float32)
            chk_mask_all[y0:y1, x0:x1] = np.clip(active + border_groove * in_field, 0.0, 1.0).astype(np.float32)

        paint_double_diamond(0.025, 0.435, 0.035, 0.965)
        paint_double_diamond(0.475, 0.885, 0.035, 0.965)

        # Darken checkering valleys & crisp warm highlight on pyramid peaks
        valley = np.clip(-chk_height, 0.0, 1.0) * chk_mask_all
        peak = np.clip(chk_height, 0.0, 1.0) * chk_mask_all
        albedo *= 1.0 - 0.56 * valley[..., None]
        albedo += (0.095, 0.058, 0.028) * peak[..., None]
        albedo = np.clip(albedo, 0.0, 1.0)
        _mix(rgh, 0.66, valley * 0.78)
        _mix(rgh, 0.34, peak * 0.55)
        ao *= 1.0 - 0.42 * valley

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(chk_height, strength=6.2))
        rgh = np.clip(rgh, 0.24, 0.84)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "m1911_v3_walnut_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "m1911_v3_walnut_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "m1911_v3_walnut_roughness.webp", 93)
        print("[POST] Saved m1911_v3_walnut_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 2: m1911_v3_slide (Parkerized Slide, Frame, Mainspring Housing, Grip Safety)
    # =========================================================================
    def process_slide_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "slide_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "slide_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "slide_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "slide_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "slide_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "slide_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "slide_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        engr_w = np.zeros((h, w), dtype=np.float32)

        # ---- 1. SLIDE LEFT FLANK HERO UV: X in [-7.80, +11.30] (19.10 cm), Y in [1.10, 2.75] (1.65 cm) ----
        # Mapped to u in [0.015, 0.985], v in [0.805, 0.985] (left flank: u = 1 - xn so +X muzzle is LEFT!)
        SW, SH = 3820, 420

        def sx_l(xw: float) -> int:
            return int(round((1.0 - (xw - (-7.80)) / 19.10) * SW))

        def sy_s(yw: float) -> int:
            return int(round((1.0 - (yw - 1.10) / 1.65) * SH))

        sl_img = Image.new("L", (SW, SH), 0)
        dsl = ImageDraw.Draw(sl_img)
        dsl.text((sx_l(6.8), sy_s(2.12)), "PATENTED APR.20,1897. SEPT.9,1902.", fill=248, font=_load_font(FONT_COND, 56), anchor="mm")
        dsl.text((sx_l(6.8), sy_s(1.64)), "DEC.19,1905. FEB.14,1911. AUG.19,1913", fill=244, font=_load_font(FONT_COND, 56), anchor="mm")
        _draw_rampant_colt_badge(dsl, sx_l(2.0), sy_s(1.90), 86.0)
        dsl.text((sx_l(-1.3), sy_s(2.12)), "COLT'S PT. F.A. MFG. CO.", fill=255, font=_load_font(FONT_SERIF_BOLD, 62), anchor="mm")
        dsl.text((sx_l(-1.3), sy_s(1.62)), "HARTFORD, CT. U.S.A.", fill=245, font=_load_font(FONT_COND, 56), anchor="mm")
        _paste_uv_band(engr_w, sl_img, 0.015, 0.985, 0.805, 0.985)

        # ---- 2. SLIDE RIGHT FLANK HERO UV: X in [-7.80, +11.30], Y in [1.10, 2.75] ----
        # Mapped to u in [0.015, 0.985], v in [0.605, 0.785] (right flank: u = xn so +X muzzle is RIGHT!)
        def sx_r(xw: float) -> int:
            return int(round(((xw - (-7.80)) / 19.10) * SW))

        sr_img = Image.new("L", (SW, SH), 0)
        dsr = ImageDraw.Draw(sr_img)
        dsr.text((sx_r(6.6), sy_s(1.88)), "MODEL OF 1911. U.S. ARMY", fill=255, font=_load_font(FONT_SERIF_BOLD, 74), anchor="mm")
        dsr.text((sx_r(-2.6), sy_s(1.88)), "CAL. .45 AUTOMATIC", fill=242, font=_load_font(FONT_COND, 62), anchor="mm")
        _paste_uv_band(engr_w, sr_img, 0.015, 0.985, 0.605, 0.785)

        # ---- 3. FRAME RIGHT FLANK HERO UV: X in [-8.20, +7.20] (15.40 cm), Y in [0.35, 1.55] (1.20 cm) ----
        # Mapped to u in [0.015, 0.985], v in [0.435, 0.585]
        FW, FH = 3080, 320

        def fx_r(xw: float) -> int:
            return int(round(((xw - (-8.20)) / 15.40) * FW))

        def fy_f(yw: float) -> int:
            return int(round((1.0 - (yw - 0.35) / 1.20) * FH))

        fr_img = Image.new("L", (FW, FH), 0)
        dfr = ImageDraw.Draw(fr_img)
        dfr.text((fx_r(3.6), fy_f(1.02)), "UNITED STATES PROPERTY", fill=255, font=_load_font(FONT_COND, 68), anchor="mm")
        dfr.text((fx_r(3.6), fy_f(0.62)), "M1911A1 U.S. ARMY", fill=248, font=_load_font(FONT_COND, 62), anchor="mm")
        dfr.text((fx_r(-1.2), fy_f(0.84)), "NO 1148920", fill=255, font=_load_font(FONT_DIN, 74), anchor="mm")
        _paste_uv_band(engr_w, fr_img, 0.015, 0.985, 0.435, 0.585)

        # ---- 4. FRAME LEFT FLANK HERO UV: X in [-8.20, +7.20], Y in [0.35, 1.55] ----
        # Mapped to u in [0.015, 0.985], v in [0.270, 0.420]
        def fx_l(xw: float) -> int:
            return int(round((1.0 - (xw - (-8.20)) / 15.40) * FW))

        fl_img = Image.new("L", (FW, FH), 0)
        dfl = ImageDraw.Draw(fl_img)
        dfl.text((fx_l(-1.9), fy_f(0.92)), "G.H.D.", fill=250, font=_load_font(FONT_SERIF_BOLD, 74), anchor="mm")
        dfl.text((fx_l(-3.6), fy_f(0.88)), "P", fill=248, font=_load_font(FONT_SERIF_BOLD, 78), anchor="mm")
        _draw_ordnance_wheel(dfl, fx_l(-5.4), fy_f(0.90), 82.0)
        _paste_uv_band(engr_w, fl_img, 0.015, 0.985, 0.270, 0.420)

        # Stamped rollmark shading: slight pale metallic edge gleam + recessed dark shadow & crisp RNM normal
        silver_w = ndimage.gaussian_filter(engr_w, sigma=0.5) * 0.58
        _mix(albedo, (0.64, 0.67, 0.72), silver_w * 0.44)
        _mix(rgh, 0.28, silver_w * 0.42)
        ao *= 1.0 - 0.36 * engr_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.58 * engr_w, strength=4.8))
        rgh = np.clip(rgh, 0.16, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "m1911_v3_slide_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "m1911_v3_slide_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "m1911_v3_slide_roughness.webp", 93)
        print("[POST] Saved m1911_v3_slide_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    # =========================================================================
    # SUITE 3: m1911_v3_metal (Barrel, Link, Controls, Fire Control & Magazine)
    # =========================================================================
    def process_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "metal_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.32, 1.0).astype(np.float32)

        # Barrel Chamber Hood Hero UV: u in [0.020, 0.980], v in [0.845, 0.985]
        CW, CH = 2400, 400
        c_img = Image.new("L", (CW, CH), 0)
        dc = ImageDraw.Draw(c_img)
        dc.text((CW * 0.48, CH * 0.38), "COLT .45 AUTO", fill=255, font=_load_font(FONT_DIN, 118), anchor="mm")
        dc.text((CW * 0.48, CH * 0.74), "P   PROOF TESTED", fill=225, font=_load_font(FONT_COND, 68), anchor="mm")

        roll_w = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(roll_w, c_img, 0.020, 0.980, 0.845, 0.985)

        albedo *= 1.0 - 0.32 * roll_w[..., None]
        _mix(rgh, 0.38, roll_w * 0.55)
        ao *= 1.0 - 0.36 * roll_w

        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.56 * roll_w, strength=4.6))
        rgh = np.clip(rgh, 0.12, 0.90)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        _save_webp_rgb(albedo, out_dir / "m1911_v3_metal_albedo.webp", 92)
        _save_webp_rgb(nrm_final, out_dir / "m1911_v3_metal_normal.webp", 95)
        _save_webp_rgb(orm, out_dir / "m1911_v3_metal_roughness.webp", 93)
        print("[POST] Saved m1911_v3_metal_{albedo,normal,roughness}.webp (2048x2048, RGB 0-alpha)")

    process_walnut_atlas()
    process_slide_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Sculpting + Cycles GPU Baking + Draco GLB
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "m1911.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 32
BAKE_NORMAL_SAMPLES = 16

M1911_BORE_Y = 2.55
M1911_GRIP_ANGLE_RAD = math.radians(-18.0)
M1911_LINK_PIVOT_X = 0.46
M1911_LINK_PIVOT_Y = 0.65
M1911_BARREL_LUG_PIN_X0 = 0.55
M1911_BARREL_LUG_PIN_Y0 = 1.35
M1911_LINK_ALPHA0 = math.atan2(
    -(M1911_BARREL_LUG_PIN_X0 - M1911_LINK_PIVOT_X),
    M1911_BARREL_LUG_PIN_Y0 - M1911_LINK_PIVOT_Y,
)

T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


WALNUT_PARTS = [
    "m1911_grip_left",
    "m1911_grip_right",
]

SLIDE_PARTS = [
    "m1911_slide",
    "m1911_frame",
    "m1911_mainspring_housing",
    "m1911_grip_safety",
]

METAL_PARTS = [
    "m1911_barrel",
    "m1911_barrel_link",
    "m1911_barrel_bushing",
    "m1911_recoil_plug",
    "m1911_recoil_guide",
    "m1911_firing_pin",
    "m1911_extractor",
    "m1911_slide_stop",
    "m1911_thumb_safety",
    "m1911_hammer",
    "m1911_trigger",
    "m1911_sear_disconnector",
    "m1911_leaf_spring",
    "m1911_mag_body",
    "m1911_mag_follower",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "m1911_grip_left",
    "m1911_grip_right",
    "m1911_slide",
    "m1911_frame",
    "m1911_mainspring_housing",
    "m1911_grip_safety",
    "m1911_barrel",
    "m1911_barrel_bushing",
    "m1911_recoil_plug",
    "m1911_slide_stop",
    "m1911_thumb_safety",
    "m1911_hammer",
    "m1911_trigger",
    "m1911_mag_body",
}

# (assembledPos(tx,ty,tz), assembledRotZ_rad)
ASSEMBLED_POSES: dict[str, tuple[tuple[float, float, float], float]] = {
    "m1911_slide":              (( 0.00,  0.00,  0.00), 0.0),
    "m1911_barrel":             (( 0.00,  0.00,  0.00), 0.0),
    "m1911_barrel_link":        (( 0.46,  0.65,  0.00), 0.0),
    "m1911_barrel_bushing":     ((10.65,  2.55,  0.00), 0.0),
    "m1911_recoil_plug":        (( 9.75,  1.30,  0.00), 0.0),
    "m1911_recoil_guide":       (( 1.95,  1.30,  0.00), 0.0),
    "m1911_firing_pin":         ((-4.45,  2.55,  0.00), 0.0),
    "m1911_extractor":          ((-4.10,  2.55,  0.56), 0.0),
    "m1911_frame":              (( 0.00,  0.00,  0.00), 0.0),
    "m1911_slide_stop":         (( 0.46,  0.65,  0.00), 0.0),
    "m1911_thumb_safety":       ((-6.85,  0.72, -1.20), 0.0),
    "m1911_mainspring_housing": ((-8.40, -4.60,  0.00), 0.0),
    "m1911_grip_left":          ((-5.05, -4.25, -1.24), 0.0),
    "m1911_grip_right":         ((-5.05, -4.25,  1.24), 0.0),
    "m1911_hammer":             ((-7.25,  1.15,  0.00), 0.0),
    "m1911_trigger":            ((-1.55, -0.35,  0.00), 0.0),
    "m1911_sear_disconnector":  ((-5.75,  0.25,  0.00), 0.0),
    "m1911_grip_safety":        ((-7.65,  0.35,  0.00), 0.0),
    "m1911_leaf_spring":        ((-7.35, -2.55,  0.00), 0.0),
    "m1911_mag_body":           ((-4.65, -3.55,  0.00), M1911_GRIP_ANGLE_RAD),
    "m1911_mag_follower":       ((-5.87, -7.31,  0.00), M1911_GRIP_ANGLE_RAD),
}

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "m1911_recoil_spring",
    "m1911_mainspring",
    "m1911_mag_spring",
]


def srgb_to_lin(r: float, g: float, b: float) -> tuple[float, float, float, float]:
    def c(v: float) -> float:
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(r), c(g), c(b), 1.0)


def reset_scene() -> bpy.types.Scene:
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
    world.light_settings.distance = 1.0

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
    bevel_r: float = 0.022,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.76, 0.79, 0.84),
    grain_scale: float = 48.0,
    grain_bump: float = 0.026,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 110.0,
    rough_var: float = 0.032,
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
    n_macro.inputs["Scale"].default_value = 0.65
    n_macro.inputs["Detail"].default_value = 4.5
    n_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 5.5
    n_micro.inputs["Roughness"].default_value = 0.64
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
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.13),
        min(1.0, base_srgb[2] * 1.14),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_col_a
    mix_base.inputs[7].default_value = base_col_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.10, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.92, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.525
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.595
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])

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
        mix_er.inputs[3].default_value = max(0.14, roughness - 0.14)
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
    bev.samples = 5
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.012
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_walnut_mat(name: str = "W_ColtWalnut") -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(18.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (0.92, 0.85, 0.14)
    nt.links.new(rot_g.outputs["Vector"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "Z"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 1.45
    wave.inputs["Distortion"].default_value = 6.2
    wave.inputs["Detail"].default_value = 5.5
    wave.inputs["Detail Scale"].default_value = 1.5
    wave.inputs["Detail Roughness"].default_value = 0.55
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (4.2, 4.2, 0.42)
    nt.links.new(rot_g.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.2
    n_fib.inputs["Detail"].default_value = 6.0
    n_fib.inputs["Distortion"].default_value = 0.55
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    c_dark = srgb_to_lin(0.165, 0.078, 0.038)
    c_mid  = srgb_to_lin(0.355, 0.180, 0.088)
    c_warm = srgb_to_lin(0.515, 0.282, 0.138)

    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = c_dark
    mix1.inputs[7].default_value = c_mid
    nt.links.new(wave.outputs["Fac"], mix1.inputs[0])

    fib_f = nt.nodes.new("ShaderNodeMapRange")
    fib_f.clamp = True
    fib_f.inputs["From Min"].default_value = 0.26
    fib_f.inputs["From Max"].default_value = 0.78
    fib_f.inputs["To Min"].default_value = 0.0
    fib_f.inputs["To Max"].default_value = 0.58
    nt.links.new(n_fib.outputs["Fac"], fib_f.inputs["Value"])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = c_warm
    nt.links.new(fib_f.outputs["Result"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])
    nt.links.new(mix2.outputs[2], bsdf.inputs["Base Color"])

    # Refined satin linseed-oil American walnut roughness (R = 0.34-0.44)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.34
    r_wood.inputs["To Max"].default_value = 0.44
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])
    nt.links.new(r_wood.outputs["Result"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.0

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.11
    bump.inputs["Distance"].default_value = 0.014
    nt.links.new(n_fib.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        "W_ColtWalnut": _build_walnut_mat("W_ColtWalnut"),
        "W_BrassScrew": _build_pbr_mat(
            "W_BrassScrew",
            base_srgb=(0.79, 0.61, 0.27),
            roughness=0.25,
            metallic=0.93,
            bevel_r=0.014,
            edge_wear=0.28,
            grain_scale=40.0,
            grain_bump=0.014,
        ),
        # AgX-calibrated WWII U.S. Army Manganese-Phosphate Parkerized Ordnance Steel (satin bevel glint, zero crush)
        "S_Parkerized": _build_pbr_mat(
            "S_Parkerized",
            base_srgb=(0.252, 0.264, 0.280),
            roughness=0.33,
            metallic=0.87,
            bevel_r=0.026,
            edge_wear=0.26,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=52.0,
            grain_bump=0.026,
            voronoi_grain=0.40,
            voronoi_scale=135.0,
            rough_var=0.032,
        ),
        "S_FrameSteel": _build_pbr_mat(
            "S_FrameSteel",
            base_srgb=(0.236, 0.248, 0.266),
            roughness=0.34,
            metallic=0.88,
            bevel_r=0.026,
            edge_wear=0.28,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=48.0,
            grain_bump=0.024,
            voronoi_grain=0.36,
            voronoi_scale=125.0,
            rough_var=0.032,
        ),
        "S_InnerDark": _build_pbr_mat(
            "S_InnerDark",
            base_srgb=(0.180, 0.192, 0.210),
            roughness=0.38,
            metallic=0.82,
            bevel_r=0.016,
            grain_scale=42.0,
            grain_bump=0.020,
        ),
        "M_BluedControl": _build_pbr_mat(
            "M_BluedControl",
            base_srgb=(0.205, 0.232, 0.284),
            roughness=0.26,
            metallic=0.90,
            bevel_r=0.022,
            edge_wear=0.52,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=42.0,
            grain_bump=0.018,
            aniso_stretch=(0.5, 3.2, 3.2),
        ),
        "M_BarrelBlue": _build_pbr_mat(
            "M_BarrelBlue",
            base_srgb=(0.212, 0.236, 0.282),
            roughness=0.25,
            metallic=0.91,
            bevel_r=0.022,
            edge_wear=0.48,
            grain_scale=46.0,
            grain_bump=0.018,
            aniso_stretch=(4.5, 0.5, 0.5),
        ),
        "M_PolishedSteel": _build_pbr_mat(
            "M_PolishedSteel",
            base_srgb=(0.76, 0.79, 0.84),
            roughness=0.18,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.97),
            grain_scale=34.0,
            grain_bump=0.014,
            aniso_stretch=(0.45, 3.5, 3.5),
        ),
        "M_Stainless": _build_pbr_mat(
            "M_Stainless",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.015,
            edge_wear=0.18,
            grain_scale=30.0,
            grain_bump=0.012,
        ),
        "M_MagTwoToneTop": _build_pbr_mat(
            "M_MagTwoToneTop",
            base_srgb=(0.64, 0.66, 0.70),
            roughness=0.26,
            metallic=0.92,
            bevel_r=0.018,
            edge_wear=0.30,
            grain_scale=36.0,
            grain_bump=0.018,
        ),
    }


# =============================================================================
# Core BMesh Modeling Toolkit (Three.js -> Blender)
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


def mk_box(name: str, sx: float, sy: float, sz: float, xform=None, mat=None, bevel: float = 0.0, bevel_segs: int = 2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(name: str, r_top: float, r_bot: float, length: float, axis: str = "x", segs: int = 32, xform=None, mat=None, bevel: float = 0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r_bot, radius2=r_top, depth=length)
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_lathe_x(name: str, pts_r_x: list[tuple[float, float]], segs: int = 40, xform=None, mat=None):
    bm = bmesh.new()
    closed_loop = len(pts_r_x) >= 3 and pts_r_x[0][0] > 1e-5 and math.hypot(pts_r_x[0][0] - pts_r_x[-1][0], pts_r_x[0][1] - pts_r_x[-1][1]) < 1e-4
    pts = pts_r_x[:-1] if closed_loop else list(pts_r_x)
    rings = []
    for r, x in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((x, 0.0, 0.0))])
        else:
            rings.append([bm.verts.new((x, r * math.cos(2.0 * math.pi * s / segs), r * math.sin(2.0 * math.pi * s / segs))) for s in range(segs)])
    n = len(rings)
    end_k = n if closed_loop else n - 1
    for k in range(end_k):
        a, b = rings[k], rings[(k + 1) % n]
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


def mk_extrude_z(name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float, bevel: float = 0.0, bevel_segs: int = 2, xform=None, mat=None):
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1] for i in range(len(clean)))
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
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(name: str, pts_three: list[Vector], radius: float, ring_segs: int = 14, closed: bool = False, xform=None, mat=None):
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(pts_three)
    for i, p in enumerate(pts_three):
        if closed:
            tang = (pts_three[(i + 1) % n_pts] - pts_three[(i - 1) % n_pts]).normalized()
        elif i == 0:
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
        rings.append([bm.verts.new(p + (n_vec * math.cos(2.0 * math.pi * s / ring_segs) + b_vec * math.sin(2.0 * math.pi * s / ring_segs)) * radius) for s in range(ring_segs)])
    end_idx = len(rings) if closed else len(rings) - 1
    for i in range(end_idx):
        ni = (i + 1) % len(rings)
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[ni][s], rings[ni][sn], rings[i][sn]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_helical_lands(name: str, count: int, bore_r: float, depth: float, width: float, x0: float, x1: float, twist_cm: float, y_off: float = 0.0, segs_x: int = 24, mat=None):
    objs = []
    r_in, r_out = bore_r - depth, bore_r + min(0.014, depth * 0.45)
    hw = width * 0.5
    for k in range(count):
        base_a = 2.0 * math.pi * k / count
        bm = bmesh.new()
        rings = []
        for s in range(segs_x + 1):
            x = x0 + (x1 - x0) * (s / segs_x)
            # Authentic Colt M1911 1:16" LEFT-HAND twist!
            a = base_a - ((x - x0) / twist_cm) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            rings.append([bm.verts.new((x, y_off + py * ca - pz * sa, py * sa + pz * ca)) for py, pz in ((r_in, -hw), (r_out, -hw), (r_out, hw), (r_in, hw))])
        for s in range(segs_x):
            for c in range(4):
                cn = (c + 1) % 4
                bm.faces.new((rings[s][c], rings[s + 1][c], rings[s + 1][cn], rings[s][cn]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _apply_three_xform(bm, [])
        objs.append(_bm_to_obj(f"{name}_{k}", bm, mat))
    return objs


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
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


def delete_objs(objs: list[bpy.types.Object]) -> None:
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


def _smoothstep_f(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def sample_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 12,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0],
            mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1],
        ))
    return pts


def sample_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 16,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        pts.append((
            mt**3 * p0[0] + 3.0 * mt**2 * t * p1[0] + 3.0 * mt * t**2 * p2[0] + t**3 * p3[0],
            mt**3 * p0[1] + 3.0 * mt**2 * t * p1[1] + 3.0 * mt * t**2 * p2[1] + t**3 * p3[1],
        ))
    return pts


def mk_swept_bow(
    name: str,
    centerline_xy: list[tuple[float, float]],
    rx_fn,
    rz_fn,
    sec_n: int = 24,
    super_exp: float = 0.72,
    xform=None,
    mat=None,
) -> bpy.types.Object:
    """Sweeps a smoothly varying superellipse cross-section along an (x, y) centerline in Three.js space."""
    bm = bmesh.new()
    rings = []
    n_pts = len(centerline_xy)
    for i, (cx, cy) in enumerate(centerline_xy):
        t = i / max(1, n_pts - 1)
        if i == 0:
            tx, ty = centerline_xy[1][0] - cx, centerline_xy[1][1] - cy
        elif i == n_pts - 1:
            tx, ty = cx - centerline_xy[-2][0], cy - centerline_xy[-2][1]
        else:
            tx, ty = centerline_xy[i + 1][0] - centerline_xy[i - 1][0], centerline_xy[i + 1][1] - centerline_xy[i - 1][1]
        tl = max(1e-6, math.hypot(tx, ty))
        nx, ny = -ty / tl, tx / tl
        rx = rx_fn(t)
        rz = rz_fn(t)
        ring = []
        for s in range(sec_n):
            a = (s / sec_n) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            px = math.copysign(abs(ca) ** super_exp, ca) * rx
            pz = math.copysign(abs(sa) ** super_exp, sa) * rz
            ring.append(bm.verts.new((cx + nx * px, cy + ny * px, pz)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(sec_n):
            sn = (s + 1) % sec_n
            bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_x(name: str, stations: list[tuple[float, list[tuple[float, float]]]], xform=None, mat=None):
    """Lofts closed (z, y) cross-section rings along Three.js X."""
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = [[bm.verts.new((x, y, z)) for (z, y) in zy_ring] for x, zy_ring in stations]
    for s in range(len(rings) - 1):
        a, b = rings[s], rings[s + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            bm.faces.new((a[k], b[k], b[kn], a[kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_y(name: str, stations: list[tuple[float, list[tuple[float, float]]]], xform=None, mat=None):
    """Lofts closed (x, z) cross-section rings along Three.js Y."""
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = [[bm.verts.new((x, y, z)) for (x, z) in xz_ring] for y, xz_ring in stations]
    for s in range(len(rings) - 1):
        a, b = rings[s], rings[s + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            bm.faces.new((a[k], b[k], b[kn], a[kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def bool_union(objs: list[bpy.types.Object], name: str, solver: str = "EXACT") -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
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


def finish_part(obj: bpy.types.Object, sharp_deg: float = 36.0, weighted_normals: bool = True) -> bpy.types.Object:
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
        e.smooth = (e.calc_face_angle(0.0) < angle_rad) if len(e.link_faces) == 2 else False
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
    return obj


# =============================================================================
# Individual High-Detail Sculpted Part Builders (21 Watertight Solid Parts)
# =============================================================================
def build_m1911_slide(mats):
    m_park, m_dark = mats["S_Parkerized"], mats["S_InnerDark"]
    # Seamless single-piece Colt M1911A1 slide profile: crisp beveled parallel slab flanks flowing
    # with C1 tangent continuity into a silky 40-segment semicircular top crown (r = 1.17 cm, peak Y = 3.72)!
    def _slide_ring(inset: float = 0.0) -> list[tuple[float, float]]:
        r = 1.17 - inset
        y_bot = 1.08 + inset
        ch = 0.045
        ring: list[tuple[float, float]] = [
            (-r + ch, y_bot),
            ( r - ch, y_bot),
            ( r,      y_bot + ch),
            ( r,      M1911_BORE_Y),
        ]
        n_arc = 36
        for k in range(1, n_arc):
            a = math.pi * (k / n_arc)  # 0 (+Z) -> pi (-Z) across top crown
            ring.append((r * math.cos(a), M1911_BORE_Y + r * math.sin(a)))
        ring.extend([
            (-r,      M1911_BORE_Y),
            (-r,      y_bot + ch),
        ])
        return ring

    # Loft slide along X in [-7.80, +11.30] with crisp front & rear muzzle/breech bevels!
    slide_stations = [
        (-7.80, _slide_ring(0.036)),
        (-7.75, _slide_ring(0.012)),
        (-7.70, _slide_ring(0.000)),
        (11.20, _slide_ring(0.000)),
        (11.26, _slide_ring(0.014)),
        (11.30, _slide_ring(0.040)),
    ]
    body = mk_loft_x("s_body", slide_stations, mat=m_park)

    # Front recoil-spring dust tunnel under muzzle w/ graceful rear stirrup taper (X in [+2.05, +11.30])
    tun_pts = [
        (0.00, 2.05), (0.28, 2.15), (0.64, 2.48), (0.74, 2.75),
        (0.74, 11.24), (0.68, 11.30), (0.00, 11.30),
    ]
    tunnel = mk_lathe_x("s_tun", tun_pts, segs=36, xform=[("t", 0.0, 1.30, 0.0)], mat=m_park)

    # Authentic tapered GI Patridge front sight blade + angled dovetailed GI U-notch rear sight
    fs_pts = [(9.72, 3.64), (10.96, 3.64), (10.68, 4.10), (10.18, 4.02), (9.88, 3.82)]
    fs = mk_extrude_z("s_fs", fs_pts, -0.115, 0.115, bevel=0.018, bevel_segs=2, mat=m_park)
    rs_pts = [(-7.26, 3.60), (-6.28, 3.60), (-6.42, 4.10), (-7.12, 4.10)]
    rs = mk_extrude_z("s_rs", rs_pts, -0.68, 0.68, bevel=0.032, bevel_segs=2, mat=m_park)
    rs_cut = mk_box("c_rs", 1.25, 0.44, 0.27, [("t", -6.76, 4.02, 0.0)], mat=m_dark)
    rs = bool_subtract(rs, [rs_cut])

    solid = bool_union([body, tunnel], "m1911_slide_solid")
    solid = join_objects([solid, fs, rs], "m1911_slide_solid")

    # Internal cutouts + lowered & beveled ejection port + 14 crisp slightly angled cocking serrations!
    cutters = [
        mk_cyl("c_bbl", 0.89, 0.89, 13.50, axis="x", segs=32, xform=[("t", 4.80, M1911_BORE_Y, 0.0)], mat=m_dark),
        mk_box("c_rail", 17.80, 1.32, 1.56, [("t", 1.60, 1.50, 0.0)], mat=m_dark),
        mk_box("c_ejp", 4.08, 1.68, 1.54, [("t", 0.95, 3.04, 0.68)], mat=m_dark, bevel=0.04),
        mk_cyl("c_rtun", 0.56, 0.56, 9.80, axis="x", segs=28, xform=[("t", 6.80, 1.30, 0.0)], mat=m_dark),
        mk_box("c_fpstop", 0.45, 1.38, 0.86, [("t", -7.72, 2.24, 0.0)], mat=m_dark),
        # Slide-stop notch & half-moon disassembly notch on lower left rail
        mk_box("c_ssnotch", 0.72, 0.44, 0.45, [("t", -3.45, 1.18, -1.10)], mat=m_dark),
        mk_cyl("c_disnotch", 0.24, 0.24, 0.48, axis="z", segs=18, xform=[("t", -5.20, 1.08, -1.10)], mat=m_dark),
    ]
    # 14 crisp angled (6° canted) V-groove cocking serrations on both rear slide flanks (X in [-7.25, -4.35])
    serr_objs = []
    for k in range(14):
        sx = -7.24 + k * 0.215
        for side in (-1.0, 1.0):
            serr_objs.append(
                mk_box(
                    f"c_ser_{k}_{int(side)}",
                    0.105, 1.56, 0.145,
                    [("ry", math.radians(45.0)), ("rz", math.radians(-5.0)), ("t", sx, 1.94, side * 1.17)],
                    mat=m_dark,
                )
            )
    cutters.append(join_objects(serr_objs, "c_serrations_all"))

    res = bool_subtract(solid, cutters)
    res.name = "m1911_slide"
    res.data.name = "m1911_slide"
    return finish_part(res, sharp_deg=34.0)


def build_m1911_barrel(mats):
    m_pol, m_bbl = mats["M_PolishedSteel"], mats["M_BarrelBlue"]
    # Precision lathe profile with bore, chamber, twin top locking ribs & crowned muzzle
    tube = mk_lathe_x(
        "b_tube",
        [
            (0.573, -1.18), (0.855, -1.18), (0.855, 1.48), (0.755, 1.52),
            (0.755,  1.58), (0.925,  1.60), (0.925, 1.96), (0.755, 1.98),
            (0.755,  2.24), (0.925,  2.26), (0.925, 2.62), (0.735, 2.66),
            (0.735, 11.48), (0.675, 11.60), (0.573, 11.60), (0.573, -1.18),
        ],
        segs=44, xform=[("t", 0.0, M1911_BORE_Y, 0.0)], mat=m_pol,
    )
    # Assign blued steel to front exposed muzzle/mid tube, polished stainless to chamber hood
    hood = mk_box("b_hood", 1.12, 0.36, 0.92, [("t", -0.72, M1911_BORE_Y + 0.72, 0.0)], mat=m_pol, bevel=0.03)
    lug_l = mk_box("b_lugl", 1.65, 1.06, 0.24, [("t", 0.55, 1.48, -0.27)], mat=m_bbl, bevel=0.03)
    lug_r = mk_box("b_lugr", 1.65, 1.06, 0.24, [("t", 0.55, 1.48,  0.27)], mat=m_bbl, bevel=0.03)
    pin_hole = mk_cyl("c_bpin", 0.14, 0.14, 1.20, axis="z", segs=18, xform=[("t", M1911_BARREL_LUG_PIN_X0, M1911_BARREL_LUG_PIN_Y0, 0.0)], mat=m_pol)
    lugs = bool_subtract(join_objects([lug_l, lug_r], "b_lugs"), [pin_hole])

    # Authentic 6-groove left-hand 1:16" (.45 ACP) rifling lands!
    lands = mk_helical_lands("b_land", 6, 0.573, 0.016, 0.18, 0.85, 11.45, 40.64, y_off=M1911_BORE_Y, segs_x=24, mat=m_pol)
    obj = join_objects([tube, hood, lugs, *lands], "m1911_barrel")
    return finish_part(obj, sharp_deg=36.0)


def build_m1911_barrel_link(mats):
    m_pol, m_ss = mats["M_PolishedSteel"], mats["M_Stainless"]
    dx_up = M1911_BARREL_LUG_PIN_X0 - M1911_LINK_PIVOT_X
    dy_up = M1911_BARREL_LUG_PIN_Y0 - M1911_LINK_PIVOT_Y
    bot_boss = mk_cyl("lk_b", 0.32, 0.32, 0.26, axis="z", segs=24, mat=m_pol, bevel=0.02)
    top_boss = mk_cyl("lk_t", 0.24, 0.24, 0.26, axis="z", segs=22, xform=[("t", dx_up, dy_up, 0.0)], mat=m_pol, bevel=0.02)
    web = mk_box("lk_w", 0.38, 0.72, 0.24, [("rz", M1911_LINK_ALPHA0), ("t", dx_up * 0.5, dy_up * 0.5, 0.0)], mat=m_pol, bevel=0.02)
    up_pin = mk_cyl("lk_p", 0.125, 0.125, 0.76, axis="z", segs=18, xform=[("t", dx_up, dy_up, 0.0)], mat=m_ss, bevel=0.015)
    body = join_objects([bot_boss, top_boss, web], "lk_body")
    hole = mk_cyl("c_lkh", 0.17, 0.17, 0.50, axis="z", segs=20, mat=m_pol)
    body = bool_subtract(body, [hole])
    return finish_part(join_objects([body, up_pin], "m1911_barrel_link"), sharp_deg=34.0)


def build_m1911_barrel_bushing(mats):
    m_blue = mats["M_BluedControl"]
    collar = mk_cyl("bb_c", 0.96, 0.96, 1.55, axis="x", segs=36, mat=m_blue, bevel=0.03)
    flange = mk_cyl("bb_f", 1.06, 1.06, 0.34, axis="x", segs=36, xform=[("t", 0.66, 0.0, 0.0)], mat=m_blue, bevel=0.03)
    apron = mk_box("bb_a", 0.32, 1.48, 1.28, [("t", 0.66, -0.96, 0.0)], mat=m_blue, bevel=0.035)
    solid = join_objects([collar, flange, apron], "bb_solid")
    bh = mk_cyl("c_bbh", 0.755, 0.755, 2.20, axis="x", segs=36, mat=m_blue)
    pc = mk_cyl("c_bbp", 0.42, 0.42, 0.60, axis="x", segs=24, xform=[("t", 0.66, -1.25, 0.0)], mat=m_blue)
    res = bool_subtract(solid, [bh, pc])
    res.name = "m1911_barrel_bushing"
    res.data.name = "m1911_barrel_bushing"
    return finish_part(res, sharp_deg=34.0)


def build_m1911_recoil_plug(mats):
    m_blue = mats["M_BluedControl"]
    plug = mk_lathe_x(
        "m1911_recoil_plug",
        [(0.44, -1.48), (0.54, -1.48), (0.54, 1.42), (0.48, 1.52), (0.0, 1.52), (0.0, 1.22), (0.44, 1.22), (0.44, -1.48)],
        segs=32, mat=m_blue,
    )
    return finish_part(plug, sharp_deg=36.0)


def build_m1911_recoil_guide(mats):
    m_pol = mats["M_PolishedSteel"]
    rod = mk_lathe_x("rg_rod", [(0.0, -0.24), (0.54, -0.24), (0.54, 0.10), (0.32, 0.14), (0.32, 4.18), (0.24, 4.30), (0.0, 4.30)], segs=28, mat=m_pol)
    flange = mk_box("rg_fl", 0.32, 1.18, 0.96, [("t", -0.08, 0.08, 0.0)], mat=m_pol, bevel=0.04)
    return finish_part(join_objects([rod, flange], "m1911_recoil_guide"), sharp_deg=34.0)


def build_m1911_firing_pin(mats):
    m_ss, m_blue = mats["M_Stainless"], mats["M_BluedControl"]
    pin = mk_lathe_x(
        "fp_pin",
        [(0.0, -3.45), (0.19, -3.45), (0.19, -2.50), (0.15, -2.40), (0.15, 2.25), (0.095, 3.05), (0.065, 3.22), (0.0, 3.24)],
        segs=22, mat=m_ss,
    )
    stop = mk_box("fp_stop", 0.28, 1.38, 0.94, [("t", -3.18, -0.22, 0.0)], mat=m_blue, bevel=0.025)
    return finish_part(join_objects([pin, stop], "m1911_firing_pin"), sharp_deg=34.0)


def build_m1911_extractor(mats):
    m_blue = mats["M_BluedControl"]
    shaft = mk_cyl("ex_sh", 0.20, 0.20, 6.80, axis="x", segs=20, mat=m_blue, bevel=0.02)
    claw = mk_box("ex_cl", 0.95, 0.44, 0.42, [("t", 3.38, 0.0, -0.14)], mat=m_blue, bevel=0.03)
    butt = mk_box("ex_bt", 0.45, 0.46, 0.36, [("t", -3.45, 0.0, 0.0)], mat=m_blue, bevel=0.025)
    return finish_part(join_objects([shaft, claw, butt], "m1911_extractor"), sharp_deg=34.0)


def build_m1911_frame(mats):
    m_fr, m_dark = mats["S_FrameSteel"], mats["S_InnerDark"]
    # 1. Main forged upper frame rail & dust cover (preserves crisp flat Hero UV flanks for US Property & G.H.D. stamps)
    rail = mk_box("f_rail", 16.00, 1.12, 2.18, [("t", -0.60, 0.96, 0.0)], mat=m_fr, bevel=0.045, bevel_segs=3)
    # Rounded underside front dust-cover chin contour flowing cleanly below slide recoil tunnel
    dc_chin = mk_cyl(
        "f_dc_chin", 0.88, 0.88, 5.40, axis="x", segs=32,
        xform=[("t", 4.65, 1.24, 0.0)], mat=m_fr, bevel=0.04,
    )
    # Gracefully curved rear frame tang cradling the beavertail grip safety underside
    tang_pts = [(-7.40, 0.82), (-9.15, 0.84)]
    tang_pts.extend(sample_quad_bezier((-9.15, 0.84), (-9.68, 0.96), (-9.62, 1.22), steps=10))
    tang_pts.extend(sample_quad_bezier((-9.62, 1.22), (-9.52, 1.44), (-8.90, 1.42), steps=8))
    tang_pts.append((-7.40, 1.42))
    tang = mk_extrude_z("f_tang", tang_pts, -0.84, 0.84, bevel=0.065, bevel_segs=3, mat=m_fr)

    # 2. Ergonomically rounded D-profile forged steel grip frame (flat grip cheeks + true cylindrical rounded frontstrap!)
    def _grip_xz_ring(inset: float = 0.0) -> list[tuple[float, float]]:
        hz = 1.07 - inset
        x_back = -2.35 + inset
        x_front_tan = 1.82 - inset * 0.4
        x_front_tip = 2.38 - inset
        ring: list[tuple[float, float]] = [
            (x_back, -hz),
            (x_front_tan, -hz),
        ]
        # Silky 16-segment cylindrical-arc frontstrap sweeping from -Z -> +X -> +Z
        n_fs = 16
        for k in range(1, n_fs):
            a = -math.pi * 0.5 + math.pi * (k / n_fs)
            px = x_front_tan + (x_front_tip - x_front_tan) * (math.cos(a) ** 0.85)
            pz = hz * math.sin(a)
            ring.append((px, pz))
        ring.extend([
            (x_front_tan, hz),
            (x_back, hz),
        ])
        return ring

    grip_stations = [
        (-5.32, _grip_xz_ring(0.06)),
        (-5.24, _grip_xz_ring(0.015)),
        (-5.14, _grip_xz_ring(0.00)),
        ( 5.18, _grip_xz_ring(0.00)),
        ( 5.30, _grip_xz_ring(0.05)),
    ]
    grip = mk_loft_y("f_grip", grip_stations, xform=[("rz", M1911_GRIP_ANGLE_RAD), ("t", -4.95, -3.75, 0.0)], mat=m_fr)

    # 3. John Browning's iconic smoothly swept curved M1911A1 trigger-guard bow!
    #    High-segment cubic Bezier centerline w/ smooth front-radiused loop & forged flares welded watertight into frame!
    tg_center: list[tuple[float, float]] = []
    tg_center.extend(
        sample_cubic_bezier((-2.45, -1.62), (-1.82, -1.96), (-0.98, -2.06), (0.38, -2.06), steps=18, include_start=True)
    )
    tg_center.extend(
        sample_cubic_bezier((0.38, -2.06), (1.76, -2.06), (2.30, -1.52), (2.30, -0.56), steps=18, include_start=False)
    )
    tg_center.extend(
        sample_cubic_bezier((2.30, -0.56), (2.30, 0.06), (2.06, 0.46), (1.96, 0.72), steps=12, include_start=False)
    )

    def _tg_rx(t: float) -> float:
        flare_r = 0.16 * ((1.0 - _smoothstep_f(0.0, 0.18, t)) ** 1.5)
        flare_f = 0.16 * (_smoothstep_f(0.82, 1.0, t) ** 1.5)
        return 0.215 + flare_r + flare_f

    def _tg_rz(t: float) -> float:
        flare_r = 0.26 * ((1.0 - _smoothstep_f(0.0, 0.22, t)) ** 1.4)
        flare_f = 0.24 * (_smoothstep_f(0.78, 1.0, t) ** 1.4)
        return 0.545 + flare_r + flare_f

    tg_bow = mk_swept_bow("f_tg_bow", tg_center, _tg_rx, _tg_rz, sec_n=24, super_exp=0.70, mat=m_fr)

    # Left-side checkered magazine catch button w/ subtle raised collar boss
    mag_btn = mk_cyl("f_mbtn", 0.34, 0.36, 0.40, axis="z", segs=24, xform=[("t", -2.55, -1.18, -1.14)], mat=m_fr, bevel=0.035)

    # Watertight boolean UNION so trigger guard, dust cover, rail & rounded grip weld with ZERO seam or floating gap!
    solid = bool_union([rail, dc_chin, tang, grip, tg_bow, mag_btn], "f_solid")

    # 4. Internal cavities + smooth sculpted 1924 M1911A1 finger-relief scallops behind the trigger bow!
    #    Build smooth angled dome-tipped scallop cutters so the A1 relief cuts read organically on both flanks
    #    while staying strictly outside |Z| >= 0.88 (0.14 cm solid frame wall outside |Z| = 0.74 magwell!).
    scallop_prof = [
        (0.00, 0.00), (0.36, 0.00), (0.58, 0.07), (0.68, 0.18), (0.72, 0.36), (0.72, 0.65), (0.00, 0.65),
    ]
    sc_l = mk_lathe_x(
        "c_rel_l", scallop_prof, segs=32,
        xform=[("ry", math.pi * 0.5), ("s", 1.15, 0.92, 1.0), ("t", -2.36, -0.56, -0.88)],
        mat=m_dark,
    )
    sc_r = mk_lathe_x(
        "c_rel_r", scallop_prof, segs=32,
        xform=[("ry", -math.pi * 0.5), ("s", 1.15, 0.92, 1.0), ("t", -2.36, -0.56,  0.88)],
        mat=m_dark,
    )

    cutters = [
        mk_box("c_mw", 3.56, 11.40, 1.48, [("rz", M1911_GRIP_ANGLE_RAD), ("t", -4.65, -3.55, 0.0)], mat=m_dark),
        mk_cyl("c_dc", 0.68, 0.68, 8.20, axis="x", segs=28, xform=[("t", 4.00, 1.38, 0.0)], mat=m_dark),
        mk_box("c_msh", 1.45, 6.60, 1.52, [("rz", M1911_GRIP_ANGLE_RAD), ("t", -7.75, -4.65, 0.0)], mat=m_dark),
        mk_cyl("c_ssp", 0.24, 0.24, 2.80, axis="z", segs=20, xform=[("t", M1911_LINK_PIVOT_X, M1911_LINK_PIVOT_Y, 0.0)], mat=m_dark),
        sc_l,
        sc_r,
    ]
    res = bool_subtract(solid, cutters)
    res.name = "m1911_frame"
    res.data.name = "m1911_frame"
    return finish_part(res, sharp_deg=36.0)


def build_m1911_slide_stop(mats):
    m_blue = mats["M_BluedControl"]
    pin = mk_cyl("ss_p", 0.165, 0.165, 2.38, axis="z", segs=24, mat=m_blue, bevel=0.02)
    arm_pts = [(-4.15, -0.30), (0.42, -0.34), (0.48, 0.34), (-3.45, 0.54)]
    arm_pts.extend(sample_quad_bezier((-3.45, 0.54), (-4.28, 0.42), (-4.26, 0.02), steps=8))
    arm = mk_extrude_z("ss_a", arm_pts, -1.40, -1.12, bevel=0.035, bevel_segs=3, mat=m_blue)
    shelf = mk_box("ss_s", 1.15, 0.38, 0.52, [("t", -3.65, 0.22, -1.42)], mat=m_blue, bevel=0.035, bevel_segs=2)
    return finish_part(join_objects([pin, arm, shelf], "m1911_slide_stop"), sharp_deg=34.0)


def build_m1911_thumb_safety(mats):
    m_blue = mats["M_BluedControl"]
    shaft = mk_cyl("ts_s", 0.18, 0.18, 2.35, axis="z", segs=20, xform=[("t", 0.0, 0.0, 1.15)], mat=m_blue, bevel=0.02)
    shield_pts = [(-1.20, -0.34), (0.70, -0.34), (0.72, 0.64), (-0.82, 0.68), (-1.22, 0.32)]
    shield = mk_extrude_z("ts_sh", shield_pts, -0.17, 0.09, bevel=0.04, bevel_segs=3, mat=m_blue)
    paddle = mk_box("ts_p", 1.38, 0.34, 0.64, [("t", -0.62, 0.42, -0.28)], mat=m_blue, bevel=0.04, bevel_segs=3)
    return finish_part(join_objects([shaft, shield, paddle], "m1911_thumb_safety"), sharp_deg=34.0)


def build_m1911_mainspring_housing(mats):
    m_park, m_dark = mats["S_Parkerized"], mats["S_InnerDark"]
    # Authentic 1924 M1911A1 smoothly arched, rounded-backstrap mainspring housing w/ crisp vertical grip serrations!
    n_st = 28
    stations = []
    for i in range(n_st + 1):
        t = i / n_st  # 0 = bottom heel (y=-3.15), 1 = top mating grip safety (y=+3.05)
        ly = -3.15 + 6.20 * t
        # Smooth asymmetric A1 ergonomic palm arch peaking smoothly in lower-mid palm (t ~ 0.40)
        arch = math.sin(math.pi * (t ** 0.86))
        x_back = -0.44 * (1.0 - t) - 0.22 * t - 0.66 * (arch ** 1.12)
        x_front = 0.75
        hz = 0.80
        # Slight heel/top edge chamfer
        end_inset = 0.045 * (1.0 - _smoothstep_f(0.0, 0.035, t) * (1.0 - _smoothstep_f(0.965, 1.0, t)))
        hz_eff = hz - end_inset
        xb_eff = x_back + end_inset
        x_arc_start = min(0.28, xb_eff + 0.56)

        ring: list[tuple[float, float]] = [
            (x_front, -hz_eff),
            (x_arc_start, -hz_eff),
        ]
        # Silky 20-segment cylindrical rounded arched backstrap w/ 7 crisp vertical A1 serration flutes!
        n_arc = 28
        serr_env = _smoothstep_f(0.07, 0.14, t) * (1.0 - _smoothstep_f(0.86, 0.93, t))
        for k in range(1, n_arc):
            a = -math.pi * 0.5 + math.pi * (k / n_arc)  # -pi/2 (-Z) -> 0 (center back) -> +pi/2 (+Z)
            ca = math.cos(a)
            sa = math.sin(a)
            # 7 crisp vertical grip serration V-grooves spanning central |a| < 1.15 rad
            serr = 0.0
            if abs(a) < 1.12 and serr_env > 0.01:
                phase = (a / 1.12) * 3.5 + 3.5  # 7 cycles across backstrap arc
                frac = phase - math.floor(phase)
                v_groove = 1.0 - abs(frac * 2.0 - 1.0)
                serr = 0.055 * (1.0 - v_groove) * serr_env * math.cos(a * 0.7)
            px = x_arc_start - (x_arc_start - xb_eff - serr) * (ca ** 0.86)
            pz = hz_eff * sa
            ring.append((px, pz))
        ring.extend([
            (x_arc_start, hz_eff),
            (x_front, hz_eff),
        ])
        stations.append((ly, ring))

    body = mk_loft_y("msh_b", stations, xform=[("rz", M1911_GRIP_ANGLE_RAD)], mat=m_park)

    # Rounded GI lanyard loop saddle & smooth forged wire ring at heel
    ring_pts = [
        Vector((-0.94 + math.cos(2.0 * math.pi * i / 24) * 0.34, -3.30 + math.sin(2.0 * math.pi * i / 24) * 0.34, 0.0))
        for i in range(24)
    ]
    lanyard = mk_tube_along_pts("msh_ring", ring_pts, 0.088, ring_segs=12, closed=True, mat=m_park)
    lug = mk_cyl("msh_lug", 0.30, 0.32, 0.56, axis="z", segs=20, xform=[("t", -0.80, -3.02, 0.0)], mat=m_park, bevel=0.04)
    bore = mk_cyl("c_mshb", 0.36, 0.36, 5.50, axis="y", segs=22, xform=[("rz", M1911_GRIP_ANGLE_RAD), ("t", 0.12, 0.45, 0.0)], mat=m_dark)
    body = bool_subtract(bool_union([body, lug], "msh_solid"), [bore])
    return finish_part(join_objects([body, lanyard], "m1911_mainspring_housing"), sharp_deg=38.0)


def _build_m1911_grip_panel(name: str, side_sign: int, mats):
    m_wal, m_brass = mats["W_ColtWalnut"], mats["W_BrassScrew"]
    # Organically crowned, perimeter-chamfered Colt M1911A1 double-diamond walnut grip panel (36x52 surface grid)!
    # Built in unrotated grip coordinates (lx in [-1.84, +1.84], ly in [-4.775, +4.775]) then rotated -18 deg so
    # counterbores & slotted brass escutcheon screws land dead-bullseye inside the two smooth walnut diamonds!
    nu, nv = 34, 48
    hw, hh = 1.84, 4.775
    r_corner = 0.28
    z_in_val = -side_sign * 0.22

    bm = bmesh.new()
    outer_grid: list[list[bmesh.types.BMVert]] = []
    inner_grid: list[list[bmesh.types.BMVert]] = []

    for iv in range(nv + 1):
        v = -1.0 + 2.0 * (iv / nv)
        row_out = []
        row_in = []
        for iu in range(nu + 1):
            u = -1.0 + 2.0 * (iu / nu)
            # Rounded-rectangle boundary mapping so all 4 corners have smooth ergonomic radius
            px = u * hw
            py = v * hh
            ax, ay = abs(px), abs(py)
            cx_lim, cy_lim = hw - r_corner, hh - r_corner
            if ax > cx_lim and ay > cy_lim:
                dx = ax - cx_lim
                dy = ay - cy_lim
                d = math.hypot(dx, dy)
                if d > 1e-6:
                    # Smoothly map corner square onto circular arc of radius r_corner
                    edge_d = max(dx, dy)
                    scale = (r_corner * (edge_d / r_corner)) / d
                    px = math.copysign(cx_lim + dx * scale, px)
                    py = math.copysign(cy_lim + dy * scale, py)

            # Normalized distance to perimeter for silky crowned palm dome & chamfered walnut borders
            du = min(1.0, abs(px) / hw)
            dv = min(1.0, abs(py) / hh)
            arch_u = math.pow(max(0.0, 1.0 - du * du), 0.44)
            arch_v = math.pow(max(0.0, 1.0 - dv * dv * 0.92), 0.36)
            crown = arch_u * (0.45 + 0.55 * arch_v)
            z_out = side_sign * (0.025 + 0.245 * crown)
            z_in = z_in_val

            row_out.append(bm.verts.new((px, py, z_out)))
            row_in.append(bm.verts.new((px, py, z_in)))
        outer_grid.append(row_out)
        inner_grid.append(row_in)

    for iv in range(nv):
        for iu in range(nu):
            if side_sign > 0:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv][iu + 1], outer_grid[iv + 1][iu + 1], outer_grid[iv + 1][iu]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv + 1][iu], inner_grid[iv + 1][iu + 1], inner_grid[iv][iu + 1]))
            else:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv + 1][iu], outer_grid[iv + 1][iu + 1], outer_grid[iv][iu + 1]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv][iu + 1], inner_grid[iv + 1][iu + 1], inner_grid[iv + 1][iu]))

    for iu in range(nu):
        bm.faces.new((inner_grid[0][iu], inner_grid[0][iu + 1], outer_grid[0][iu + 1], outer_grid[0][iu]))
        bm.faces.new((outer_grid[nv][iu], outer_grid[nv][iu + 1], inner_grid[nv][iu + 1], inner_grid[nv][iu]))
    for iv in range(nv):
        bm.faces.new((outer_grid[iv][0], outer_grid[iv + 1][0], inner_grid[iv + 1][0], inner_grid[iv][0]))
        bm.faces.new((inner_grid[iv][nu], inner_grid[iv + 1][nu], outer_grid[iv + 1][nu], outer_grid[iv][nu]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [("rz", M1911_GRIP_ANGLE_RAD)])
    panel = _bm_to_obj(f"{name}_p", bm, m_wal)

    # Deep beveled counterbores dead-center in the upper (+3.45) & lower (-3.55) walnut diamonds!
    cb_cutters = []
    screw_parts = []
    cb_r_top, cb_r_bot = (0.345, 0.285) if side_sign > 0 else (0.285, 0.345)
    sc_r_top, sc_r_bot = (0.232, 0.255) if side_sign > 0 else (0.255, 0.232)
    for idx, (sy, slot_ang) in enumerate(((3.45, 0.42), (-3.55, -0.35))):
        cb = mk_cyl(
            f"c_{name}_cb{idx}", cb_r_top, cb_r_bot, 0.34, axis="z", segs=24,
            xform=[
                ("t", 0.0, sy, side_sign * 0.22),
                ("rz", M1911_GRIP_ANGLE_RAD),
            ],
            mat=m_wal,
        )
        cb_cutters.append(cb)
        # Recessed brass escutcheon ring + domed slotted grip screw seated cleanly inside counterbore!
        esc = mk_cyl(
            f"{name}_esc{idx}", 0.275, 0.275, 0.14, axis="z", segs=24,
            xform=[("t", 0.0, sy, side_sign * 0.10), ("rz", M1911_GRIP_ANGLE_RAD)],
            mat=m_brass, bevel=0.018,
        )
        scr = mk_cyl(
            f"{name}_s{idx}", sc_r_top, sc_r_bot, 0.18, axis="z", segs=24,
            xform=[("t", 0.0, sy, side_sign * 0.19), ("rz", M1911_GRIP_ANGLE_RAD)],
            mat=m_brass, bevel=0.024,
        )
        kerf = mk_box(
            f"c_{name}_k{idx}", 0.48, 0.068, 0.12,
            [("rz", slot_ang), ("t", 0.0, sy, side_sign * 0.27), ("rz", M1911_GRIP_ANGLE_RAD)],
            mat=m_brass,
        )
        scr = bool_subtract(scr, [kerf])
        screw_parts.extend([esc, scr])

    panel = bool_subtract(panel, cb_cutters)
    return finish_part(join_objects([panel, *screw_parts], name), sharp_deg=44.0)


def build_m1911_grip_left(mats):
    return _build_m1911_grip_panel("m1911_grip_left", -1, mats)


def build_m1911_grip_right(mats):
    return _build_m1911_grip_panel("m1911_grip_right", 1, mats)


def build_m1911_hammer(mats):
    m_blue, m_pol = mats["M_BluedControl"], mats["M_PolishedSteel"]
    # Gracefully contoured GI wide-spur Colt M1911A1 hammer profile
    hm_pts = [(-0.48, -0.52), (0.46, -0.46), (0.48, 0.78)]
    hm_pts.extend(sample_quad_bezier((0.48, 0.78), (0.28, 1.48), (-0.52, 1.56), steps=10))
    hm_pts.extend(sample_quad_bezier((-0.52, 1.56), (-1.45, 1.62), (-1.84, 1.48), steps=10))
    hm_pts.extend(sample_quad_bezier((-1.84, 1.48), (-1.94, 1.24), (-1.68, 1.06), steps=8))
    hm_pts.extend(sample_quad_bezier((-1.68, 1.06), (-1.08, 0.88), (-0.72, 0.58), steps=8))
    head = mk_extrude_z("hm_h", hm_pts, -0.36, 0.36, bevel=0.042, bevel_segs=3, mat=m_blue)
    strut = mk_box("hm_st", 0.32, 3.45, 0.24, [("rz", M1911_GRIP_ANGLE_RAD - 0.12), ("t", -0.78, -1.85, 0.0)], mat=m_pol, bevel=0.02)
    return finish_part(join_objects([head, strut], "m1911_hammer"), sharp_deg=34.0)


def build_m1911_trigger(mats):
    m_blue, m_ss = mats["M_BluedControl"], mats["M_Stainless"]
    # Authentic M1911A1 short concave-curved solid milled steel trigger shoe!
    shoe_pts = [(0.96, -0.96), (2.14, -0.96)]
    shoe_pts.extend(sample_quad_bezier((2.14, -0.96), (1.84, -0.22), (2.14, 0.52), steps=14))
    shoe_pts.append((0.96, 0.52))
    shoe = mk_extrude_z("tr_sh", shoe_pts, -0.36, 0.36, bevel=0.055, bevel_segs=3, mat=m_blue)
    lbar = mk_box("tr_lb", 4.35, 1.18, 0.14, [("t", -1.15, -0.10, -0.82)], mat=m_ss, bevel=0.015)
    rbar = mk_box("tr_rb", 4.35, 1.18, 0.14, [("t", -1.15, -0.10,  0.82)], mat=m_ss, bevel=0.015)
    rear = mk_box("tr_rr", 0.28, 1.18, 1.78, [("t", -3.26, -0.10,  0.00)], mat=m_ss, bevel=0.015)
    return finish_part(join_objects([shoe, lbar, rbar, rear], "m1911_trigger"), sharp_deg=34.0)


def build_m1911_sear_disconnector(mats):
    m_pol, m_ss = mats["M_PolishedSteel"], mats["M_Stainless"]
    sear = mk_extrude_z("sd_s", [(-0.45, -0.78), (0.45, -0.78), (0.38, 0.92), (-0.32, 1.05), (-0.52, 0.45)], -0.37, 0.37, bevel=0.025, mat=m_pol)
    disc = mk_box("sd_d", 0.42, 2.38, 0.28, [("t", 0.32, 0.35, 0.0)], mat=m_ss, bevel=0.025)
    return finish_part(join_objects([sear, disc], "m1911_sear_disconnector"), sharp_deg=34.0)


def build_m1911_grip_safety(mats):
    m_park = mats["S_Parkerized"]
    # Sculpted flared M1911A1 beavertail grip safety tang w/ smooth hand-web curve & convex palm paddle!
    gs_pts = [(-0.32, -3.02), (0.64, -2.76), (0.72, 0.84)]
    # Smoothly flared upper beavertail tang sweeping gently rearward & slightly upward
    gs_pts.extend(sample_cubic_bezier((0.72, 0.84), (-0.42, 0.94), (-1.18, 1.02), (-1.62, 0.86), steps=14))
    # Rounded tang tip flowing into concave web pocket for shooter's hand
    gs_pts.extend(sample_cubic_bezier((-1.62, 0.86), (-1.78, 0.72), (-1.56, 0.46), (-1.12, 0.34), steps=12))
    gs_pts.extend(sample_cubic_bezier((-1.12, 0.34), (-0.72, 0.16), (-0.64, -0.42), (-0.82, -1.15), steps=12))
    # Ergonomic convex lower grip-safety palm paddle blending smoothly into arched mainspring housing!
    gs_pts.extend(sample_cubic_bezier((-0.82, -1.15), (-1.10, -1.85), (-1.12, -2.48), (-0.72, -2.92), steps=12))
    gs_pts.append((-0.32, -3.02))
    body = mk_extrude_z("gs_body", gs_pts, -0.78, 0.78, bevel=0.14, bevel_segs=4, mat=m_park)
    # Internal trigger-blocking safety tang
    arm = mk_box("gs_arm", 1.05, 0.46, 0.76, [("t", 1.06, 0.62, 0.0)], mat=m_park, bevel=0.03)
    res = bool_union([body, arm], "m1911_grip_safety")
    return finish_part(res, sharp_deg=38.0)


def build_m1911_leaf_spring(mats):
    m_blue = mats["M_BluedControl"]
    base = mk_box("ls_b", 0.18, 1.55, 1.12, [("t", 0.0, -1.45, 0.0), ("rz", M1911_GRIP_ANGLE_RAD)], mat=m_blue, bevel=0.015)
    l1 = mk_box("ls_1", 0.14, 3.15, 0.30, [("t", 0.16, 0.72, -0.36), ("rz", M1911_GRIP_ANGLE_RAD)], mat=m_blue, bevel=0.012)
    l2 = mk_box("ls_2", 0.14, 3.25, 0.32, [("t", 0.28, 0.78,  0.00), ("rz", M1911_GRIP_ANGLE_RAD)], mat=m_blue, bevel=0.012)
    l3 = mk_box("ls_3", 0.14, 2.75, 0.30, [("t", -0.14, 0.52, 0.36), ("rz", M1911_GRIP_ANGLE_RAD)], mat=m_blue, bevel=0.012)
    return finish_part(join_objects([base, l1, l2, l3], "m1911_leaf_spring"), sharp_deg=34.0)


def build_m1911_mag_body(mats):
    m_blue, m_top = mats["M_BluedControl"], mats["M_MagTwoToneTop"]
    lower = mk_box("mb_lo", 3.44, 7.80, 1.38, [("t", 0.0, -1.60, 0.0)], mat=m_blue, bevel=0.045)
    upper = mk_box("mb_hi", 3.44, 3.40, 1.38, [("t", 0.0,  3.80, 0.0)], mat=m_top, bevel=0.045)
    base = mk_box("mb_bp", 3.86, 0.32, 1.64, [("t", 0.05, -5.66, 0.0)], mat=m_blue, bevel=0.035)
    solid = join_objects([lower, upper, base], "mb_solid")
    cav = mk_box("c_mbc", 3.20, 10.75, 1.18, [("t", 0.0, 0.25, 0.0)], mat=m_blue)
    lip = mk_box("c_mbl", 3.60, 1.15, 0.94, [("t", 0.15, 5.15, 0.0)], mat=m_top)
    # 5 classic round witness holes down both flanks
    wh_objs = [mk_cyl(f"c_wh_{k}", 0.16, 0.16, 1.80, axis="z", segs=14, xform=[("t", -0.35, -2.80 + k * 1.45, 0.0)], mat=m_blue) for k in range(5)]
    res = bool_subtract(solid, [cav, lip, join_objects(wh_objs, "c_wh_all")])
    res.name = "m1911_mag_body"
    res.data.name = "m1911_mag_body"
    return finish_part(res, sharp_deg=34.0)


def build_m1911_mag_follower(mats):
    m_pol, m_ss = mats["M_PolishedSteel"], mats["M_Stainless"]
    deck = mk_box("mf_d", 3.06, 0.34, 1.12, [("rz", 0.08), ("t", 0.0, 0.16, 0.0)], mat=m_pol, bevel=0.025)
    dimple = mk_cyl("mf_dim", 0.14, 0.16, 0.14, axis="y", segs=16, xform=[("t", 0.35, 0.34, 0.0)], mat=m_ss, bevel=0.02)
    skirt = mk_box("mf_sk", 0.32, 0.85, 1.08, [("t", 1.32, -0.32, 0.0)], mat=m_pol, bevel=0.02)
    shelf = mk_box("mf_sh", 0.85, 0.24, 0.34, [("t", 0.65, -0.10, -0.46)], mat=m_pol, bevel=0.02)
    return finish_part(join_objects([deck, dimple, skirt, shelf], "m1911_mag_follower"), sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & Zero-Bleed Atlas Allocation (`>= 50px` Firewall & Hero Bands)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    include_face_fn=None,
    label: str = "pack",
    margin: float = 0.005,
) -> int:
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    active_objs, sel_count = [], 0
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
        obj_sel = 0
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            inc = include_face_fn(o.name, f, mname) if include_face_fn else True
            f.select = bool(inc)
            if inc:
                obj_sel += 1
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if obj_sel > 0:
            active_objs.append(o)
            sel_count += obj_sel
    if not active_objs:
        return 0
    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(angle_limit=math.radians(62.0), island_margin=0.0045, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin, margin_method="SCALED", shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    du, dv = u1 - u0, v1 - v0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if include_face_fn and not include_face_fn(o.name, f, mname):
                continue
            for loop in f.loops:
                uv = loop[uv_layer].uv
                uv.x = u0 + max(0.0, min(1.0, uv.x)) * du
                uv.y = v0 + max(0.0, min(1.0, uv.y)) * dv
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [UV-PACK:{label:14s}] {len(active_objs):2d} objs ({sel_count:5d} faces) -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}]")
    return sel_count


def unwrap_walnut_atlas(walnut_objs):
    # Zone layout (2048px):
    #  - HERO_GRIP_L: [0.025, 0.435] x [0.035, 0.965] (outer left face)
    #  - HERO_GRIP_R: [0.475, 0.885] x [0.035, 0.965] (outer right face)
    #  - WOOD_REST:   [0.905, 0.945] x [0.020, 0.620] (back/side bevels)
    #  - >= 50px FIREWALL (> 0.030 gap in U/V) -> BRASS_SCREWS: [0.915, 0.990] x [0.680, 0.985]
    def classify(on, f, mn):
        if mn == "W_BrassScrew":
            return "BRASS"
        nz = -f.normal.y
        tz = -f.calc_center_median().y
        if on == "m1911_grip_left" and nz < -0.52 and tz < -0.02:
            return "HERO_L"
        if on == "m1911_grip_right" and nz > 0.52 and tz > 0.02:
            return "HERO_R"
        return "WOOD_REST"

    _smart_unwrap_and_pack_rect(walnut_objs, 0.902, 0.992, 0.015, 0.615, lambda on, f, mn: classify(on, f, mn) == "WOOD_REST", "walnut_rest")
    _smart_unwrap_and_pack_rect(walnut_objs, 0.902, 0.992, 0.675, 0.985, lambda on, f, mn: classify(on, f, mn) == "BRASS", "walnut_brass")

    # Project flat outer grip faces along unrotated (-18 deg) panel axes for crisp double-diamond checkering!
    cos_g = math.cos(-M1911_GRIP_ANGLE_RAD)
    sin_g = math.sin(-M1911_GRIP_ANGLE_RAD)
    for o in walnut_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mn = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            cls = classify(o.name, f, mn)
            if cls not in ("HERO_L", "HERO_R"):
                continue
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z  # Three.js (x, y)
                # Undo grip tilt to get local upright panel (lx in [-1.84, 1.84], ly in [-4.775, 4.775])
                lx = tx * cos_g - ty * sin_g
                ly = tx * sin_g + ty * cos_g
                un = max(0.0, min(1.0, (lx + 1.84) / 3.68))
                vn = max(0.0, min(1.0, (ly + 4.775) / 9.55))
                if cls == "HERO_L":
                    loop[uv_layer].uv = (0.025 + (1.0 - un) * 0.410, 0.035 + vn * 0.930)
                else:
                    loop[uv_layer].uv = (0.475 + un * 0.410, 0.035 + vn * 0.930)
        bm.to_mesh(o.data)
        bm.free()


def unwrap_slide_atlas(slide_objs):
    # Hero Rollmark UV Bands (all strictly non-overlapping with >= 0.020 margins):
    #  - HERO_SLIDE_L: [0.015, 0.985] x [0.805, 0.985]
    #  - HERO_SLIDE_R: [0.015, 0.985] x [0.605, 0.785]
    #  - HERO_FRAME_R: [0.015, 0.985] x [0.435, 0.585]
    #  - HERO_FRAME_L: [0.015, 0.985] x [0.270, 0.420]
    #  - REST_PACK:    [0.015, 0.985] x [0.010, 0.252]
    def classify(on, f, mn):
        c, n = f.calc_center_median(), f.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if on == "m1911_slide" and -7.80 <= tx <= 11.30 and 1.10 <= ty <= 2.75:
            if nz < -0.82 and tz < -1.05:
                return "HERO_SLIDE_L"
            if nz > 0.82 and tz > 1.05:
                return "HERO_SLIDE_R"
        if on == "m1911_frame" and -8.20 <= tx <= 7.20 and 0.35 <= ty <= 1.55:
            if nz > 0.82 and tz > 0.98:
                return "HERO_FRAME_R"
            if nz < -0.82 and tz < -0.98:
                return "HERO_FRAME_L"
        return "REST"

    _smart_unwrap_and_pack_rect(slide_objs, 0.012, 0.988, 0.010, 0.250, lambda on, f, mn: classify(on, f, mn) == "REST", "slide_rest")

    for target_name, x0, xlen, y0, ylen, cls_l, cls_r, v_l, v_r in (
        ("m1911_slide", -7.80, 19.10, 1.10, 1.65, "HERO_SLIDE_L", "HERO_SLIDE_R", (0.805, 0.180), (0.605, 0.180)),
        ("m1911_frame", -8.20, 15.40, 0.35, 1.20, "HERO_FRAME_L", "HERO_FRAME_R", (0.270, 0.150), (0.435, 0.150)),
    ):
        obj = next(o for o in slide_objs if o.name == target_name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        uv_layer = bm.loops.layers.uv.verify()
        for f in bm.faces:
            cls = classify(target_name, f, "")
            if cls not in (cls_l, cls_r):
                continue
            for loop in f.loops:
                vco = loop.vert.co
                xn = max(0.0, min(1.0, (vco.x - x0) / xlen))
                yn = max(0.0, min(1.0, (vco.z - y0) / ylen))
                if cls == cls_l:
                    loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, v_l[0] + yn * v_l[1])
                else:
                    loop[uv_layer].uv = (0.015 + xn * 0.970, v_r[0] + yn * v_r[1])
        bm.to_mesh(obj.data)
        bm.free()


def unwrap_metal_atlas(metal_objs):
    # Zone layout with >= 50px (>= 0.028 UV) firewall between bright polished steel & dark blued controls:
    #  - HERO_CHAMBER: [0.020, 0.980] x [0.845, 0.985] (barrel chamber top hood: "COLT .45 AUTO")
    #  - POLISHED_Z:   [0.012, 0.475] x [0.012, 0.805] (bright stainless/polished steel)
    #  - BLUED_Z:      [0.515, 0.988] x [0.012, 0.805] (dark blued controls & magazine; 0.040 = 82px UV firewall!)
    bright_mats = {"M_PolishedSteel", "M_Stainless", "M_MagTwoToneTop"}

    def classify(on, f, mn):
        if on == "m1911_barrel":
            c, n = f.calc_center_median(), f.normal
            tx, ty, tz = c.x, c.z, -c.y
            ny = n.z
            if -1.25 <= tx <= 1.50 and ny > 0.65 and ty > M1911_BORE_Y + 0.55 and abs(tz) < 0.55:
                return "HERO_CHAMBER"
        if mn in bright_mats:
            return "POLISHED"
        return "BLUED"

    _smart_unwrap_and_pack_rect(metal_objs, 0.012, 0.475, 0.012, 0.805, lambda on, f, mn: classify(on, f, mn) == "POLISHED", "metal_polished")
    _smart_unwrap_and_pack_rect(metal_objs, 0.515, 0.988, 0.012, 0.805, lambda on, f, mn: classify(on, f, mn) == "BLUED", "metal_blued")

    bbl = next(o for o in metal_objs if o.name == "m1911_barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        if classify("m1911_barrel", f, "") != "HERO_CHAMBER":
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, tz = vco.x, -vco.y
            xn = max(0.0, min(1.0, (tx - (-1.25)) / 2.75))
            zn = max(0.0, min(1.0, (tz - (-0.55)) / 1.10))
            loop[uv_layer].uv = (0.020 + xn * 0.960, 0.845 + (1.0 - zn) * 0.140)
    bm.to_mesh(bbl.data)
    bm.free()


# =============================================================================
# Cycles Multi-Channel GPU Baker & Draco GLB Export
# =============================================================================
def _attach_bake_image_node(mats_set, img):
    created = []
    for mat in mats_set:
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.nodes.active = tex
        created.append((nt, tex))
    return created


def _remove_bake_image_nodes(created):
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set, input_name: str):
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
            emit.inputs["Color"].default_value = (val, val, val, 1.0) if isinstance(val, (int, float)) else tuple(val)
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        saved.append((nt, out, emit, orig_link))
    return saved


def _restore_bsdf(saved):
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img, filepath: Path):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    np.save(filepath, buf.reshape((h, w, 4))[::-1, :, :3].copy())


def _set_grid_isolated_layout(all_objs):
    for i, o in enumerate(all_objs):
        o.location = (0.0, i * 120.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs):
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            pos, rz = ASSEMBLED_POSES[o.name]
            o.location = t2b(*pos)
            # Three.js Z rotation -> Blender Y rotation (-rz) under T2B_MAT
            o.rotation_euler = (0.0, -rz, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 400.0, 0.0)
            o.rotation_euler = (0.0, 0.0, 0.0)


def _set_identity_layout(all_objs):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(prefix: str, target_objs, all_objs, tmp_dir: Path, default_albedo=(0.05, 0.055, 0.065, 1.0)):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0), normal_op=False, extra=None):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", ATLAS_SIZE, ATLAS_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        arr = np.empty((ATLAS_SIZE * ATLAS_SIZE, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())
        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs = extra if extra is not None else target_objs
        select_only(objs, objs[0])
        kw = dict(type=bake_type, margin=5, use_clear=False)
        if normal_op:
            kw.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kw)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)
    s = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", 2, default_albedo)
    _restore_bsdf(s)

    s = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", 2, (0.35, 0.35, 0.35, 1.0))
    _restore_bsdf(s)

    s = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", 2, (0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(s)

    run_bake("normal", "NORMAL", BAKE_NORMAL_SAMPLES, (0.5, 0.5, 1.0, 1.0), normal_op=True)
    scene.world.light_settings.distance = 0.65
    run_bake("ao_self", "AO", BAKE_AO_SAMPLES, (1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.45
    run_bake("ao_ext", "AO", BAKE_AO_SAMPLES, (1.0, 1.0, 1.0, 1.0), extra=ext_targets)

    white_mat = bpy.data.materials.new("__EXT_MASK__")
    nt = white_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])

    orig = {}
    for o in ext_targets:
        orig[o.name] = list(o.data.materials)
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
    bpy.ops.object.bake(type="EMIT", margin=5, use_clear=False)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    _remove_bake_image_nodes(nodes_m)
    bpy.data.images.remove(img_m)
    for o in ext_targets:
        o.data.materials.clear()
        for m in orig[o.name]:
            o.data.materials.append(m)
    bpy.data.materials.remove(white_mat)


def export_draco_glb(all_objs):
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


def verify_meshes(all_objs):
    total_tris = 0
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        total_tris += tris
        bm.free()
        assert non_man == 0, f"Non-manifold edges on {o.name}: {non_man}"
        assert vol > 0.0, f"Negative/zero volume on {o.name}: {vol}"
        print(f"  [OK] {o.name:26s} tris={tris:6d} vol={vol:8.2f}")
    print(f"[VERIFY] All {len(all_objs)} solid parts watertight | total_tris={total_tris:,}")


def main():
    t0 = time.time()
    reset_scene()
    mats = create_material_library()
    builders = {
        "m1911_grip_left":          build_m1911_grip_left,
        "m1911_grip_right":         build_m1911_grip_right,
        "m1911_slide":              build_m1911_slide,
        "m1911_frame":              build_m1911_frame,
        "m1911_mainspring_housing": build_m1911_mainspring_housing,
        "m1911_grip_safety":        build_m1911_grip_safety,
        "m1911_barrel":             build_m1911_barrel,
        "m1911_barrel_link":        build_m1911_barrel_link,
        "m1911_barrel_bushing":     build_m1911_barrel_bushing,
        "m1911_recoil_plug":        build_m1911_recoil_plug,
        "m1911_recoil_guide":       build_m1911_recoil_guide,
        "m1911_firing_pin":         build_m1911_firing_pin,
        "m1911_extractor":          build_m1911_extractor,
        "m1911_slide_stop":         build_m1911_slide_stop,
        "m1911_thumb_safety":       build_m1911_thumb_safety,
        "m1911_hammer":             build_m1911_hammer,
        "m1911_trigger":            build_m1911_trigger,
        "m1911_sear_disconnector":  build_m1911_sear_disconnector,
        "m1911_leaf_spring":        build_m1911_leaf_spring,
        "m1911_mag_body":           build_m1911_mag_body,
        "m1911_mag_follower":       build_m1911_mag_follower,
    }
    print("[BUILD] Sculpting all 21 solid Colt M1911A1 (.45 ACP) parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}
    walnut_objs = [built[pid] for pid in WALNUT_PARTS]
    slide_objs  = [built[pid] for pid in SLIDE_PARTS]
    metal_objs  = [built[pid] for pid in METAL_PARTS]
    all_objs    = walnut_objs + slide_objs + metal_objs

    verify_meshes(all_objs)
    unwrap_walnut_atlas(walnut_objs)
    unwrap_slide_atlas(slide_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("walnut", walnut_objs), ("slide", slide_objs), ("metal", metal_objs)):
        tot = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for pt in pts:
                    assert -1e-4 <= pt.x <= 1.0001 and -1e-4 <= pt.y <= 1.0001
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot += oa
            assert oa > 1e-6, f"Collapsed UV on {o.name}"
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot:.4f}")

    with tempfile.TemporaryDirectory(prefix="m1911_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir, (0.095, 0.042, 0.018, 1.0))
        bake_atlas_suite("slide", slide_objs, all_objs, tmp_dir, (0.045, 0.048, 0.055, 1.0))
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, (0.045, 0.052, 0.068, 1.0))
        subprocess.run(["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)], check=True)

    export_draco_glb(all_objs)
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "m1911_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "m1911_v3_walnut_normal.webp",
        TEX_OUT_DIR / "m1911_v3_walnut_roughness.webp",
        TEX_OUT_DIR / "m1911_v3_slide_albedo.webp",
        TEX_OUT_DIR / "m1911_v3_slide_normal.webp",
        TEX_OUT_DIR / "m1911_v3_slide_roughness.webp",
        TEX_OUT_DIR / "m1911_v3_metal_albedo.webp",
        TEX_OUT_DIR / "m1911_v3_metal_normal.webp",
        TEX_OUT_DIR / "m1911_v3_metal_roughness.webp",
    ]
    total_mb = sum(p.stat().st_size for p in outputs) / (1024 * 1024)
    print(f"=== COLT M1911A1 COMPLETE in {time.time() - t0:.1f}s | TOTAL={total_mb:.2f} MB ===")
    assert total_mb <= 10.0, f"M1911 bundle {total_mb:.2f} MB exceeds 10.0 MB budget!"


if __name__ == "__main__":
    main()
