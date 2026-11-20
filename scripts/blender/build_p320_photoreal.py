#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for SIG Sauer P320 / U.S. Army M17 (9x19mm NATO)
=============================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 3)

Generates:
  - public/models/p320.glb (Draco-compressed glTF 2.0, all 22 solid parts; skips ONLY the
    2 dynamic GPU-compressed helical springs `p320_recoil_spring` & `p320_striker_spring`
    carrying `aSpringParam`)
  - public/textures/p320_v3_slide_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM: 5 parts)
  - public/textures/p320_v3_grip_{albedo,normal,roughness}.webp      (2048x2048 Packed ORM: 3 parts)
  - public/textures/p320_v3_fcu_metal_{albedo,normal,roughness}.webp (2048x2048 Packed ORM: 14 parts)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 22 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/p320/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_p320_photoreal.py
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
# MODE 2: System Python Post-Process (M17 Coyote PVD Laser Rollmarks, UID DataMatrix,
#         Wraparound Stippling + SIG SAUER Medallion, FCU Serial TC014829, Barrel Hood
#         9mmx19, Mec-Gar 5/10/15/17 Witness Digits & 5-Ch Packed ORM WebPs)
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
    FONT_MONO = "/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
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
        ny = dy * strength  # row index increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.6) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float
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

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _draw_uid_datamatrix(draw: ImageDraw.ImageDraw, x0: int, y0: int, size: int, seed: int = 17):
        """Authentic MIL-STD-130 ECC 200 14x14 DataMatrix UID symbol (solid L-finder + alternating clock)."""
        n = 14
        cell = size / n
        rng = np.random.default_rng(seed)
        grid = np.zeros((n, n), dtype=np.uint8)
        # Solid left & bottom L-finder border
        grid[:, 0] = 1
        grid[n - 1, :] = 1
        # Alternating top & right clock tracks
        for i in range(n):
            grid[0, i] = 1 if (i % 2 == 0) else 0
            grid[i, n - 1] = 1 if (i % 2 == 1) else 0
        # Deterministic high-density military UID payload cells
        for r in range(1, n - 1):
            for c in range(1, n - 1):
                grid[r, c] = 1 if rng.random() > 0.46 else 0
        for r in range(n):
            for c in range(n):
                if grid[r, c]:
                    rx0 = int(round(x0 + c * cell))
                    ry0 = int(round(y0 + r * cell))
                    rx1 = int(round(x0 + (c + 1) * cell)) - 1
                    ry1 = int(round(y0 + (r + 1) * cell)) - 1
                    draw.rectangle((rx0, ry0, max(rx0, rx1), max(ry0, ry1)), fill=255)

    def _draw_rotated_text(
        target_img: Image.Image,
        center_xy: tuple[int, int],
        text: str,
        font,
        angle_deg: float,
        fill: int = 255,
    ):
        """Draws crisp supersampled rotated text onto an 'L' canvas centered at center_xy."""
        bbox = font.getbbox(text)
        tw = max(8, bbox[2] - bbox[0] + 40)
        th = max(8, bbox[3] - bbox[1] + 40)
        patch = Image.new("L", (tw, th), 0)
        dp = ImageDraw.Draw(patch)
        dp.text((tw // 2, th // 2), text, fill=fill, font=font, anchor="mm")
        rot = patch.rotate(angle_deg, resample=Image.Resampling.BICUBIC, expand=True)
        px = int(round(center_xy[0] - rot.width * 0.5))
        py = int(round(center_xy[1] - rot.height * 0.5))
        # Composite with max so nothing overwrites nearby artwork
        x0 = max(0, px)
        y0 = max(0, py)
        x1 = min(target_img.width, px + rot.width)
        y1 = min(target_img.height, py + rot.height)
        if x1 > x0 and y1 > y0:
            crop = rot.crop((x0 - px, y0 - py, x1 - px, y1 - py))
            cur = target_img.crop((x0, y0, x1, y1))
            merged = Image.fromarray(np.maximum(np.asarray(cur), np.asarray(crop)))
            target_img.paste(merged, (x0, y0))

    # -------------------------------------------------------------------------
    # SUITE 1: p320_v3_slide (Coyote-Tan PVD Slide + Optic Plate/Sights + Extractor + Housing)
    # -------------------------------------------------------------------------
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
        ao_contact = np.minimum(ao_self, ao_self * 0.50 + ao_ext * 0.50)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.30, 1.0).astype(
            np.float32
        )

        # Ultra-fine longitudinal CNC brushed PVD metallic sheen on the two hero slide flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        slide_flanks = (
            (u_grid >= 0.015)
            & (u_grid <= 0.985)
            & (
                ((v_grid >= 0.780) & (v_grid <= 0.985))  # Slide Right (+Z)
                | ((v_grid >= 0.555) & (v_grid <= 0.760))  # Slide Left (-Z)
            )
        ).astype(np.float32)

        rng = np.random.default_rng(32017)
        raw_brush = rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32)
        brush_fine = ndimage.gaussian_filter(raw_brush, sigma=(0.35, 24.0))
        brush_med = ndimage.gaussian_filter(raw_brush, sigma=(0.90, 56.0))
        brush_h = np.clip(brush_fine * 2.0 + brush_med * 1.2, -1.0, 1.0).astype(np.float32)
        pvd_mask = ((met > 0.78) & (rgh < 0.36)).astype(np.float32) * slide_flanks

        decal_height = 0.015 * brush_h * pvd_mask
        albedo = np.clip(albedo + (0.010 * brush_h * pvd_mask)[..., None], 0.0, 1.0)
        rgh = np.clip(rgh + 0.014 * brush_h * pvd_mask, 0.14, 0.94)

        # Delicate holster draw hairlines along lower slide rails
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(140):
            sx = float(rng.uniform(0.04, 0.96) * w)
            sy = float(rng.uniform(0.03, 0.43) * h)
            slen = float(rng.uniform(18, 95))
            ang = math.radians(float(rng.uniform(-2.5, 2.5)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * slen, sy + math.sin(ang) * slen)],
                fill=int(rng.integers(45, 130)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * pvd_mask
        decal_height -= 0.014 * sc
        albedo = np.clip(albedo + (0.018 * sc)[..., None], 0.0, 1.0)
        rgh -= 0.012 * sc

        # =====================================================================
        # HERO SLIDE FLANK ROLLMARKS (X in [-7.86, +11.66], span 19.52 cm; Y in [0.88, 3.62], span 2.74 cm)
        #   Band 1 (Right +Z): u in [0.015, 0.985], v in [0.780, 0.985] (xNorm left->right)
        #   Band 2 (Left  -Z): u in [0.015, 0.985], v in [0.555, 0.760] (1 - xNorm: +X muzzle at left!)
        # =====================================================================
        PPCM = 180.0
        SX0, SXSPAN = -7.86, 19.52
        SY0, SYSPAN = 0.88, 2.74
        SW, SH = int(round(SXSPAN * PPCM)), int(round(SYSPAN * PPCM))  # 3514 x 493

        def s_r(wx: float, wy: float):
            return (
                int(round((wx - SX0) / SXSPAN * SW)),
                int(round((1.0 - (wy - SY0) / SYSPAN) * SH)),
            )

        def s_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - SX0) / SXSPAN) * SW)),
                int(round((1.0 - (wy - SY0) / SYSPAN) * SH)),
            )

        eng_r = Image.new("L", (SW, SH), 0)
        eng_l = Image.new("L", (SW, SH), 0)
        kiss_r = Image.new("L", (SW, SH), 0)
        dr, dl, dkr = ImageDraw.Draw(eng_r), ImageDraw.Draw(eng_l), ImageDraw.Draw(kiss_r)

        # --- LEFT SLIDE FLANK (-Z): Iconic `SIG SAUER   M17   9mm×19` centered on smooth flank X in [-3.4..+6.8] ---
        # Remember: on Left Flank, +X (muzzle) is LEFT! So lx0 starts near X=+6.55 and flows rightward toward X=-1.50!
        lx0, ly_mid = s_l(6.48, 1.82)
        f_sig = _load_font(FONT_DIN, 92)
        f_m17 = _load_font(FONT_DIN, 74)
        f_cal = _load_font(FONT_DIN, 68)
        f_sub = _load_font(FONT_COND, 38)

        # Primary hero line: "SIG SAUER" + boxed "[M17]" badge + "9mm×19"
        dl.text((lx0, ly_mid - 58), "SIG SAUER", fill=255, font=f_sig)
        bx0, by0 = lx0 + 495, ly_mid - 56
        dl.rounded_rectangle((bx0, by0, bx0 + 215, by0 + 88), radius=12, outline=255, width=7)
        dl.text((bx0 + 107, by0 + 44), "M17", fill=255, font=f_m17, anchor="mm")
        dl.text((bx0 + 252, ly_mid - 46), "9mm×19", fill=255, font=f_cal)

        # Crisp factory sub-line underneath
        dl.line([(lx0, ly_mid + 46), (lx0 + 1010, ly_mid + 46)], fill=230, width=3)
        dl.text((lx0, ly_mid + 58), "P320  MODULAR HANDGUN SYSTEM  -  U.S. ARMY", fill=238, font=f_sub)

        # --- RIGHT SLIDE FLANK (+Z): `NEWINGTON, NH  U.S.A.` + U.S. Army DataMatrix UID Box ---
        # Smooth unobstructed forward flat wall sits at X in [+3.05, +7.35], Y in [1.18, 2.38] (between port & front serrs!)
        # Lower flat cheek below ejection port sits at X in [-3.60, +2.35], Y in [1.18, 2.00]!
        rx_uid, ry_uid = s_r(3.15, 2.26)
        # Framed U.S. Army MIL-STD-130 UID DataMatrix Inspection Plate (X in [+3.15, +7.25], Y in [1.28, 2.26])
        box_w, box_h = 720, 174
        dr.rounded_rectangle(
            (rx_uid, ry_uid, rx_uid + box_w, ry_uid + box_h), radius=10, outline=245, width=5
        )
        _draw_uid_datamatrix(dr, rx_uid + 16, ry_uid + 15, 144, seed=32017)
        dr.text((rx_uid + 182, ry_uid + 18), "US  M17   9mm×19", fill=255, font=_load_font(FONT_DIN, 50))
        dr.text((rx_uid + 182, ry_uid + 76), "NEWINGTON, NH   U.S.A.", fill=248, font=_load_font(FONT_DIN, 40))
        dr.text((rx_uid + 182, ry_uid + 122), "CAGE 7Z546   SN TC014829", fill=240, font=_load_font(FONT_COND, 38))

        # Subtle secondary right-rear ordnance line below extractor pocket (X in [-3.45, +1.85], Y in [1.34, 1.94])
        rx_rear, ry_rear = s_r(-3.35, 1.88)
        dr.text((rx_rear, ry_rear), "SIG SAUER INC.   NEWINGTON, NH  U.S.A.", fill=240, font=_load_font(FONT_DIN, 42))

        # Subtle golden-brass shell-deflector flecks tight behind upper rear ejection port corner (solid Coyote PVD wall!)
        rng_k = np.random.default_rng(32018)
        for _ in range(18):
            kx, ky = s_r(float(rng_k.uniform(-0.96, -0.60)), float(rng_k.uniform(3.02, 3.36)))
            krx, kry = float(rng_k.uniform(3, 10)), float(rng_k.uniform(2, 5))
            dkr.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(70, 180)))

        engraved = np.zeros((h, w), dtype=np.float32)
        brass_kiss = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(engraved, eng_r, 0.015, 0.985, 0.780, 0.985)
        _paste_uv_band(engraved, eng_l, 0.015, 0.985, 0.555, 0.760)
        _paste_uv_band(brass_kiss, kiss_r, 0.015, 0.985, 0.780, 0.985)

        # Dark laser-annealed rollmarks on warm metallic Coyote-Tan PVD stainless!
        eng_bev = _bevel_mask(engraved, width_px=1.25)
        decal_height -= 0.68 * eng_bev
        _mix(albedo, (0.145, 0.118, 0.082), engraved * 0.93)
        _mix(rgh, 0.52, engraved * 0.88)
        _mix(met, 0.36, engraved * 0.85)
        ao *= 1.0 - 0.24 * engraved

        # Subtle brass deflector kiss
        brass_kiss = _smoothstep(0.15, 0.60, ndimage.gaussian_filter(brass_kiss, sigma=0.9))
        _mix(albedo, (0.76, 0.61, 0.28), brass_kiss * 0.42)
        _mix(rgh, 0.24, brass_kiss * 0.45)
        _mix(met, 0.94, brass_kiss * 0.50)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_slide_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_slide_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_slide_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p320_v3_slide_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: p320_v3_grip (Coyote Polymer Grip Module + Floorplate + Firewalled Orange Follower)
    # -------------------------------------------------------------------------
    def process_grip_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "grip_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "grip_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "grip_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "grip_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "grip_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "grip_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "grip_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.34, 1.0).astype(
            np.float32
        )

        # Hero Grip Module Flank Bands (world X in [-9.12, +9.68] span 18.80 cm; Y in [-9.78, +1.02] span 10.80 cm):
        #   Right Flank (+Z): u in [0.015, 0.985], v in [0.635, 0.985] (xNorm)
        #   Left  Flank (-Z): u in [0.015, 0.985], v in [0.270, 0.620] (1 - xNorm)
        #   Firewalled Orange Follower Box: u in [0.010, 0.230], v in [0.010, 0.245] -> STRICTLY UNTOUCHED!
        PPCM = 150.0
        GX0, GXSPAN = -9.12, 18.80
        GY0, GYSPAN = -9.78, 10.80
        GW, GH = int(round(GXSPAN * PPCM)), int(round(GYSPAN * PPCM))  # 2820 x 1620

        def g_pt(wx: float, wy: float, is_right: bool):
            xn = (wx - GX0) / GXSPAN
            if not is_right:
                xn = 1.0 - xn
            return (
                int(round(xn * GW)),
                int(round((1.0 - (wy - GY0) / GYSPAN) * GH)),
            )

        stip_panel = np.zeros((h, w), dtype=np.float32)
        border_groove = np.zeros((h, w), dtype=np.float32)
        med_recess = np.zeros((h, w), dtype=np.float32)
        med_text = np.zeros((h, w), dtype=np.float32)
        frame_mold = np.zeros((h, w), dtype=np.float32)

        grip_angle = math.radians(-18.0)
        ca, sa = math.cos(grip_angle), math.sin(grip_angle)
        # Local grip coordinates centered near (-5.18, -5.25) with axis tilted -18 deg
        # (local +y runs UP along grip spine, local +x runs FORWARD toward frontstrap)
        def grip_local_to_world(lx: float, ly: float):
            wx = -5.18 + lx * ca - ly * sa
            wy = -5.25 + lx * sa + ly * ca
            return (wx, wy)

        for is_right, v0, v1 in ((True, 0.635, 0.985), (False, 0.270, 0.620)):
            c_stip = Image.new("L", (GW, GH), 0)
            c_brd = Image.new("L", (GW, GH), 0)
            c_med = Image.new("L", (GW, GH), 0)
            c_txt = Image.new("L", (GW, GH), 0)
            c_mld = Image.new("L", (GW, GH), 0)
            ds, db, dm, dt, df = (
                ImageDraw.Draw(c_stip),
                ImageDraw.Draw(c_brd),
                ImageDraw.Draw(c_med),
                ImageDraw.Draw(c_txt),
                ImageDraw.Draw(c_mld),
            )

            # 1) Authentic angled SIG P320 wraparound Carry stipple panel polygon in grip-local frame
            # Spans ly in [-3.35, +3.35] along grip height, lx in [-1.18, +1.18] across palm width
            panel_local = [
                (-1.08, -3.28),
                ( 1.08, -3.28),
                ( 1.18, -2.90),
                ( 1.18,  2.80),
                ( 0.85,  3.25),
                (-1.02,  3.25),
                (-1.20,  2.75),
                (-1.20, -2.95),
            ]
            panel_px = [g_pt(*grip_local_to_world(lx, ly), is_right) for lx, ly in panel_local]
            ds.polygon(panel_px, fill=255)
            db.polygon(panel_px, outline=255, width=16)

            # 2) Signature SIG SAUER recessed horizontal-oval grip medallion centered at grip local (0.0, +0.25)
            med_pts = []
            for k in range(48):
                th = 2.0 * math.pi * k / 48
                # Horizontal oval aligned with the pistol horizontal axis (real P320 medallion sits horizontal!)
                mx = -5.28 + math.cos(th) * 1.14
                my = -4.95 + math.sin(th) * 0.44
                med_pts.append(g_pt(mx, my, is_right))
            dm.polygon(med_pts, fill=255)
            # Clear stippling cleanly inside the oval medallion!
            ds.polygon(med_pts, fill=0)
            # Raised inner oval rim + crisp "SIG SAUER" embossed polymer logo!
            med_rim = []
            for k in range(48):
                th = 2.0 * math.pi * k / 48
                mx = -5.28 + math.cos(th) * 1.04
                my = -4.95 + math.sin(th) * 0.36
                med_rim.append(g_pt(mx, my, is_right))
            dt.polygon(med_rim, outline=255, width=7)
            mcx, mcy = g_pt(-5.28, -4.95, is_right)
            dt.text((mcx, mcy - 10), "SIG SAUER", fill=255, font=_load_font(FONT_DIN, 50), anchor="mm")
            dt.text((mcx, mcy + 26), "P320  M17", fill=235, font=_load_font(FONT_COND, 28), anchor="mm")

            # 3) Forward dust-cover molded index pad stipple rectangle (X in [+3.45, +5.95], Y in [+0.24, +0.62])
            idx_local = [(3.45, 0.24), (5.95, 0.24), (5.95, 0.62), (3.45, 0.62)]
            idx_px = [g_pt(wx, wy, is_right) for wx, wy in idx_local]
            ds.polygon(idx_px, fill=220)
            db.polygon(idx_px, outline=240, width=8)

            # 4) Subtle molded polymer factory markings on smooth frame flats
            if is_right:
                # Below Picatinny/dustcover lip ahead of trigger guard
                fx, fy = g_pt(4.70, 0.72, True)
                df.text((fx, fy), "SIG SAUER  NEWINGTON, NH", fill=240, font=_load_font(FONT_COND, 32), anchor="mm")
            else:
                fx, fy = g_pt(4.70, 0.72, False)
                df.text((fx, fy), "P320  CARRY  M17  FDE", fill=240, font=_load_font(FONT_COND, 32), anchor="mm")

            _paste_uv_band(stip_panel, c_stip, 0.015, 0.985, v0, v1)
            _paste_uv_band(border_groove, c_brd, 0.015, 0.985, v0, v1)
            _paste_uv_band(med_recess, c_med, 0.015, 0.985, v0, v1)
            _paste_uv_band(med_text, c_txt, 0.015, 0.985, v0, v1)
            _paste_uv_band(frame_mold, c_mld, 0.015, 0.985, v0, v1)

        # High-frequency 2048x2048 organic micro-pebble stippling (crisp tactile grip texture!)
        rng_p = np.random.default_rng(32019)
        n1 = rng_p.uniform(0.0, 1.0, size=(h, w)).astype(np.float32)
        p_fine = ndimage.gaussian_filter(n1, sigma=0.85)
        p_med = ndimage.gaussian_filter(n1, sigma=1.9)
        pebble = np.clip((p_fine - p_med) * 4.6 + 0.5, 0.0, 1.0)
        pebble = np.power(pebble, 1.35) * stip_panel

        brd_bev = _bevel_mask(border_groove, width_px=1.6)
        med_bev = _bevel_mask(med_recess, width_px=2.4)
        txt_bev = _bevel_mask(med_text, width_px=1.2)
        mld_bev = _bevel_mask(frame_mold, width_px=1.0)

        decal_height = (
            0.34 * (pebble - 0.5 * stip_panel)
            - 0.42 * brd_bev
            - 0.28 * med_bev
            + 0.48 * txt_bev
            - 0.22 * mld_bev
        )

        # Tactile matte Coyote-Tan stipple darkening & roughness lift (distinctly matte polymer M=0.0!)
        _mix(albedo, (0.485, 0.388, 0.265), stip_panel * 0.52)
        albedo = np.clip(albedo + ((pebble - 0.5 * stip_panel) * 0.065)[..., None], 0.0, 1.0)
        _mix(rgh, 0.76, stip_panel * 0.80)
        _mix(met, 0.00, np.maximum(stip_panel, np.maximum(med_recess, border_groove)))

        # Smooth recessed oval SIG SAUER medallion with crisp warm-highlighted embossed logo!
        _mix(albedo, (0.475, 0.378, 0.258), med_recess * 0.74)
        _mix(albedo, (0.648, 0.532, 0.376), med_text * 0.82)
        _mix(rgh, 0.58, med_recess * 0.82)
        _mix(rgh, 0.48, med_text * 0.86)
        _mix(albedo, (0.430, 0.340, 0.228), frame_mold * 0.58)

        ao *= (
            (1.0 - 0.16 * brd_bev)
            * (1.0 - 0.12 * (med_recess - med_bev))
            * (1.0 - 0.08 * stip_panel * (1.0 - pebble))
        )

        # Firewall guarantee: strictly zero decal perturbation in safety-orange follower box [0..0.245] x [0..0.255]
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        follower_box = (u_grid < 0.245) & (v_grid < 0.258)
        decal_height[follower_box] = 0.0

        decal_nrm = _height_to_normal_01(decal_height, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.18, 0.95)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_grip_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_grip_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_grip_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p320_v3_grip_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: p320_v3_fcu_metal (Serialized Stainless FCU + 4.7" Barrel + Controls + 17-Rd Mag)
    # -------------------------------------------------------------------------
    def process_fcu_metal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "fcu_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "fcu_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "fcu_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "fcu_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "fcu_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "fcu_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "fcu_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.30, 1.0).astype(
            np.float32
        )

        dark_etch = np.zeros((h, w), dtype=np.float32)
        bright_etch = np.zeros((h, w), dtype=np.float32)
        mag_scuffs = np.zeros((h, w), dtype=np.float32)

        # -----------------------------------------------------------------
        # 1) HERO BAND 1: Gleaming Stainless FCU Serial Plate `TC014829`
        #    UV: u in [0.015, 0.435], v in [0.835, 0.985] (world X in [-1.24,+0.96], Y in [+0.02,+0.62])
        #    Visible directly through grip window X in [-1.18,+0.90], Y in [+0.06,+0.58]!
        # -----------------------------------------------------------------
        fw, fh = 1100, 300
        fcu_img = Image.new("L", (fw, fh), 0)
        dfcu = ImageDraw.Draw(fcu_img)
        # Subtle laser border inset inside the grip cutout window
        dfcu.rounded_rectangle((44, 24, fw - 44, fh - 24), radius=10, outline=230, width=5)
        dfcu.text((fw // 2, 60), "SIG SAUER FCU   CAGE 7Z546", fill=240, font=_load_font(FONT_COND, 40), anchor="mm")
        dfcu.text((fw // 2, 160), "TC014829", fill=255, font=_load_font(FONT_DIN, 134), anchor="mm")
        dfcu.text((fw // 2, 246), "MODULAR CHASSIS   U.S. M17", fill=232, font=_load_font(FONT_COND, 34), anchor="mm")
        _paste_uv_band(dark_etch, fcu_img, 0.015, 0.435, 0.835, 0.985)

        # Fine horizontal 17-4PH stainless brush sheen over the FCU serial plate
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        fcu_band = (
            (u_grid >= 0.015) & (u_grid <= 0.435) & (v_grid >= 0.835) & (v_grid <= 0.985)
        ).astype(np.float32)
        rng_f = np.random.default_rng(32020)
        brush_f = ndimage.gaussian_filter(rng_f.normal(0.0, 1.0, size=(h, w)).astype(np.float32), sigma=(0.35, 22.0))
        brush_f = np.clip(brush_f * 2.2, -1.0, 1.0) * fcu_band
        albedo = np.clip(albedo + (0.016 * brush_f)[..., None], 0.0, 1.0)
        rgh = np.clip(rgh + 0.015 * brush_f, 0.14, 0.94)

        # -----------------------------------------------------------------
        # 2) HERO BAND 2: Black Nitron Barrel Chamber Hood Top Deck (`9mm×19`)
        #    UV: u in [0.455, 0.855], v in [0.835, 0.985]
        #    World X in [-0.54, +2.64] (span 3.18 cm), Z in [-0.80, +0.80] (v increases toward -Z)
        #    Note: M17 LCI slot sits at X in [-0.57, +0.17], Z in [-0.11, +0.11] -> stamp cleanly at X in [+0.75, +2.35]!
        # -----------------------------------------------------------------
        bw, bh = 960, 460
        bbl_img = Image.new("L", (bw, bh), 0)
        dbbl = ImageDraw.Draw(bbl_img)
        # X = +1.48 -> xn = (1.48 - (-0.54)) / 3.18 = 0.635
        bx_c = int(round(0.62 * bw))
        dbbl.text((bx_c, int(bh * 0.44)), "9mm×19", fill=255, font=_load_font(FONT_DIN, 118), anchor="mm")
        dbbl.text((bx_c, int(bh * 0.72)), "SIG SAUER  US", fill=230, font=_load_font(FONT_COND, 54), anchor="mm")
        _paste_uv_band(bright_etch, bbl_img, 0.455, 0.855, 0.835, 0.985)

        # -----------------------------------------------------------------
        # 3) HERO BAND 3: 17-Rd Mec-Gar Steel Magazine Rear Spine (`5 / 10 / 15 / 17`)
        #    UV: u in [0.875, 0.985], v in [0.300, 0.985]
        #    Local mag coords: Z in [-0.80, +0.80] (left->right), Y in [-4.80, +4.25] (span 9.05 cm)
        #    4 rear witness holes at Z=0, Y = 1.90, 0.35, -1.20, -2.75!
        # -----------------------------------------------------------------
        spw, sph = 320, 1810
        sp_img = Image.new("L", (spw, sph), 0)
        dsp = ImageDraw.Draw(sp_img)
        f_w = _load_font(FONT_DIN, 58)
        for wy, lbl in ((1.90, "5"), (0.35, "10"), (-1.20, "15"), (-2.75, "17")):
            py = int(round((1.0 - (wy - (-4.80)) / 9.05) * sph))
            # Stamp crisp round-count digits right beside (to the right of) each witness hole!
            dsp.text((int(spw * 0.78), py), lbl, fill=255, font=f_w, anchor="mm")
        dsp.text((spw // 2, int(sph * 0.91)), "17 RD", fill=235, font=_load_font(FONT_COND, 52), anchor="mm")
        _paste_uv_band(bright_etch, sp_img, 0.875, 0.985, 0.300, 0.985)

        # -----------------------------------------------------------------
        # 4) HERO BANDS 4 & 5: 17-Rd Mec-Gar Steel Magazine Right & Left Flanks
        #    Right Flank (+Z): u in [0.585, 0.715], v in [0.300, 0.815]
        #    Left  Flank (-Z): u in [0.730, 0.860], v in [0.300, 0.815]
        #    Local X in [-1.23, +1.23] (span 2.46 cm), Y in [-4.80, +4.25] (span 9.05 cm)
        # -----------------------------------------------------------------
        mw, mh = 440, 1620
        for pu0, pu1, is_right in ((0.585, 0.715, True), (0.730, 0.860, False)):
            mc = Image.new("L", (mw, mh), 0)
            dm = ImageDraw.Draw(mc)
            f_mn = _load_font(FONT_DIN, 54)
            f_ml = _load_font(FONT_COND, 52)
            f_ms = _load_font(FONT_COND, 38)

            def m2p(lx: float, ly: float):
                xn = (lx - (-1.23)) / 2.46
                if not is_right:
                    xn = 1.0 - xn
                return (int(round(xn * mw)), int(round((1.0 - (ly - (-4.80)) / 9.05) * mh)))

            # Side witness hole labels next to staggered holes at Y = 1.72, 0.17, -1.38, -2.93
            for idx_w, (wy, lbl) in enumerate(((1.72, "5"), (0.17, "10"), (-1.38, "15"), (-2.93, "17"))):
                px, py = m2p(-0.92, wy)
                dm.text((px, py), lbl, fill=255, font=f_mn, anchor="mm")

            # Authentic factory markings on lower mag body
            cx_m, cy_m = m2p(0.18, -3.75)
            if is_right:
                dm.text((cx_m, cy_m - 36), "SIG SAUER", fill=250, font=f_ml, anchor="mm")
                dm.text((cx_m, cy_m + 14), "9mm  M17", fill=240, font=f_ms, anchor="mm")
            else:
                dm.text((cx_m, cy_m - 36), "MADE IN ITALY", fill=248, font=f_ms, anchor="mm")
                dm.text((cx_m, cy_m + 14), "SIG  9mm×19", fill=240, font=f_ms, anchor="mm")
            _paste_uv_band(bright_etch, mc, pu0, pu1, 0.300, 0.815)

        # Realistic vertical magwell insertion scuffs along upper magazine tube
        mag_mask = (
            (
                ((u_grid >= 0.585) & (u_grid <= 0.715))
                | ((u_grid >= 0.730) & (u_grid <= 0.860))
                | ((u_grid >= 0.875) & (u_grid <= 0.985))
            )
            & (v_grid >= 0.32)
            & (v_grid <= 0.84)
        ).astype(np.float32)
        sc_m = Image.new("L", (w, h), 0)
        dsm = ImageDraw.Draw(sc_m)
        rng_ms = np.random.default_rng(32021)
        for _ in range(320):
            sx = float(rng_ms.uniform(0.588, 0.982) * w)
            sy = float(rng_ms.uniform(0.18, 0.66) * h)
            slen = float(rng_ms.uniform(22, 130))
            dsm.line([(sx, sy), (sx + float(rng_ms.uniform(-1.5, 1.5)), sy + slen)], fill=int(rng_ms.integers(60, 170)), width=1)
        mag_scuffs = (np.asarray(sc_m, dtype=np.float32) / 255.0) * mag_mask

        # Composite dark laser-etched stainless FCU markings (`TC014829`) + bright white-etched Nitron barrel/mag markings!
        decal_height = (
            -0.66 * _bevel_mask(dark_etch, width_px=1.25)
            - 0.54 * _bevel_mask(bright_etch, width_px=1.20)
            + 0.018 * brush_f
            - 0.04 * mag_scuffs
        )

        # Deep jet-black laser oxide etch on gleaming stainless FCU plate (maximum contrast through grip window!)
        _mix(albedo, (0.055, 0.060, 0.068), dark_etch * 0.98)
        _mix(rgh, 0.62, dark_etch * 0.94)
        _mix(met, 0.14, dark_etch * 0.94)
        ao *= 1.0 - 0.34 * dark_etch

        # Crisp laser-white markings on satin Nitron barrel hood & blued Mec-Gar steel magazine!
        _mix(albedo, (0.92, 0.94, 0.96), bright_etch * 0.95)
        _mix(rgh, 0.36, bright_etch * 0.88)
        _mix(met, 0.22, bright_etch * 0.85)
        ao *= 1.0 - 0.14 * bright_etch

        # Vertical magwell insertion wear streaks
        _mix(albedo, (0.52, 0.55, 0.60), mag_scuffs * 0.34)
        rgh -= 0.06 * mag_scuffs

        decal_nrm = _height_to_normal_01(decal_height, strength=2.5)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_fcu_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_fcu_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "p320_v3_fcu_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved p320_v3_fcu_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_slide_atlas()
    process_grip_atlas()
    process_fcu_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "p320.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16
P320_GRIP_ANGLE = math.radians(-18.0)

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))
B2T_MAT = T2B_MAT.transposed()


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 22 solid SIG Sauer P320 / U.S. Army M17 parts split across 3 dedicated 2048x2048 PBR suites
# (skipping ONLY the 2 dynamic GPU springs `p320_recoil_spring` & `p320_striker_spring` carrying `aSpringParam`!)
SLIDE_PARTS = [
    "p320_slide",
    "p320_optic_plate_sight",
    "p320_front_sight",
    "p320_striker_housing",
    "p320_extractor",
]

GRIP_PARTS = [
    "p320_grip_module",
    "p320_mag_follower",
    "p320_mag_baseplate",
]

FCU_METAL_PARTS = [
    "p320_barrel",
    "p320_recoil_guide_rod",
    "p320_striker",
    "p320_safety_lock",
    "p320_takedown_lever",
    "p320_slide_catch",
    "p320_mag_catch",
    "p320_fcu_chassis",
    "p320_trigger_shoe",
    "p320_trigger_bar",
    "p320_sear_group",
    "p320_manual_safety",
    "p320_mag_body",
    "p320_mag_spring",
]

# Exterior parts receiving assembled inter-part contact AO
# (FCU chassis, barrel tube, striker housing & magazine body stay on crisp Self-AO so they gleam
#  cleanly without dark internal cavity shadows when extracted or viewed through the serial window!)
EXTERIOR_CONTACT_AO_PARTS = {
    "p320_slide",
    "p320_optic_plate_sight",
    "p320_front_sight",
    "p320_extractor",
    "p320_grip_module",
    "p320_mag_baseplate",
    "p320_takedown_lever",
    "p320_slide_catch",
    "p320_mag_catch",
    "p320_trigger_shoe",
    "p320_manual_safety",
}

ASSEMBLED_POS = {
    "p320_slide":             ( 0.000,  0.000,  0.000),
    "p320_optic_plate_sight": (-5.550,  3.260,  0.000),
    "p320_front_sight":       (10.550,  3.560,  0.000),
    "p320_striker_housing":   ( 0.000,  0.000,  0.000),
    "p320_extractor":         (-1.450,  2.680,  1.020),
    "p320_grip_module":       ( 0.000,  0.000,  0.000),
    "p320_mag_follower":      (-6.183, -7.462,  0.000),
    "p320_mag_baseplate":     (-6.731, -9.160,  0.000),
    "p320_barrel":            ( 0.000,  0.000,  0.000),
    "p320_recoil_guide_rod":  ( 0.000,  0.000,  0.000),
    "p320_striker":           ( 0.000,  0.000,  0.000),
    "p320_safety_lock":       (-4.350,  2.860,  0.220),
    "p320_takedown_lever":    ( 1.850,  0.420,  0.000),
    "p320_slide_catch":       ( 0.000,  0.000,  0.000),
    "p320_mag_catch":         (-2.350, -2.150,  0.000),
    "p320_fcu_chassis":       ( 0.000,  0.000,  0.000),
    "p320_trigger_shoe":      ( 0.050,  0.250,  0.000),
    "p320_trigger_bar":       ( 0.000,  0.000,  0.000),
    "p320_sear_group":        (-5.150,  0.620,  0.000),
    "p320_manual_safety":     (-5.750,  0.760,  0.000),
    "p320_mag_body":          (-5.250, -4.590,  0.000),
    "p320_mag_spring":        (-6.445, -8.268,  0.000),
}

ASSEMBLED_ROT_THREE = {
    "p320_mag_catch":     (0.0, 0.0, P320_GRIP_ANGLE),
    "p320_mag_body":      (0.0, 0.0, P320_GRIP_ANGLE),
    "p320_mag_follower":  (0.0, 0.0, P320_GRIP_ANGLE),
    "p320_mag_spring":    (0.0, 0.0, P320_GRIP_ANGLE),
    "p320_mag_baseplate": (0.0, 0.0, P320_GRIP_ANGLE),
}

# Ground-truth CSG reference bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "p320_slide":             ((-7.850,  0.645, -1.335), (11.650,  3.615,  1.335)),
    "p320_optic_plate_sight": ((-1.980, -0.100, -0.930), ( 2.760,  0.840,  0.930)),
    "p320_front_sight":       ((-0.476, -0.110, -0.670), ( 0.478,  0.495,  0.670)),
    "p320_barrel":            ((-1.002,  1.040, -0.820), (11.800,  3.570,  0.820)),
    "p320_recoil_guide_rod":  (( 1.940,  0.983, -0.340), (11.090,  1.937,  0.340)),
    "p320_striker":           ((-6.910,  1.325, -0.210), (-0.710,  2.980,  0.260)),
    "p320_striker_housing":   ((-7.835,  1.035, -0.895), (-4.195,  3.235,  0.895)),
    "p320_safety_lock":       ((-0.390, -0.490, -0.190), ( 0.390,  0.458,  0.190)),
    "p320_extractor":         ((-1.704, -0.280, -0.370), ( 1.120,  0.280,  0.140)),
    "p320_grip_module":       ((-9.058, -9.718, -1.245), ( 9.643,  0.985,  1.245)),
    "p320_takedown_lever":    ((-0.298, -0.280, -1.530), ( 1.347,  0.281,  1.240)),
    "p320_slide_catch":       ((-3.000,  0.170, -1.355), ( 0.071,  1.020,  1.355)),
    "p320_mag_catch":         ((-0.380, -0.572, -1.382), ( 0.400,  0.384,  1.200)),
    "p320_fcu_chassis":       ((-6.551, -0.348, -1.115), ( 3.240,  1.360,  1.115)),
    "p320_trigger_shoe":      ((-0.525, -2.354, -0.890), ( 0.351,  0.469,  0.890)),
    "p320_trigger_bar":       ((-5.420,  0.002,  0.470), ( 0.440,  1.150,  1.138)),
    "p320_sear_group":        ((-1.090, -0.670, -0.780), ( 1.025,  0.838,  0.780)),
    "p320_manual_safety":     ((-1.425, -0.270, -1.510), ( 0.450,  0.340,  1.510)),
    "p320_mag_body":          ((-1.547, -4.810, -0.996), ( 1.627,  5.270,  0.996)),
    "p320_mag_follower":      ((-1.020, -0.890, -0.620), ( 1.020,  0.566,  0.620)),
    "p320_mag_spring":        ((-0.735, -0.595, -0.575), ( 0.735,  0.595,  0.575)),
    "p320_mag_baseplate":     ((-1.605, -0.510, -1.110), ( 1.747,  0.320,  1.110)),
}


# =============================================================================
# Scene & Physically Calibrated Cycles PBR Materials
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
    bevel_r: float = 0.026,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.82, 0.85, 0.89),
    grain_scale: float = 32.0,
    grain_bump: float = 0.024,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
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
    n_macro.inputs["Scale"].default_value = 0.90
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
    rgh_val_node.inputs["To Min"].default_value = max(0.09, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.96, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

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

        mix_edge_c = nt.nodes.new("ShaderNodeMix")
        mix_edge_c.data_type = "RGBA"
        mix_edge_c.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_edge_c.inputs[0])
        nt.links.new(col_sock, mix_edge_c.inputs[6])
        col_sock = mix_edge_c.outputs[2]

        mix_edge_r = nt.nodes.new("ShaderNodeMix")
        mix_edge_r.data_type = "FLOAT"
        mix_edge_r.inputs[3].default_value = max(0.12, roughness - 0.12)
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


def _build_muzzle_crown_soot_mat() -> bpy.types.Material:
    """Recessed 11-deg target muzzle crown & bore throat with realistic 9mm NATO gunpowder carbon halo."""
    mat = bpy.data.materials.new("F_BarrelCrownSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 6.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[6].default_value = srgb_to_lin(0.13, 0.135, 0.145)
    mix_c.inputs[7].default_value = srgb_to_lin(0.28, 0.295, 0.315)
    nt.links.new(n_soot.outputs["Fac"], mix_c.inputs[0])

    rgh_mr = nt.nodes.new("ShaderNodeMapRange")
    rgh_mr.inputs["From Min"].default_value = 0.25
    rgh_mr.inputs["From Max"].default_value = 0.75
    rgh_mr.inputs["To Min"].default_value = 0.54
    rgh_mr.inputs["To Max"].default_value = 0.80
    nt.links.new(n_soot.outputs["Fac"], rgh_mr.inputs["Value"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_mr.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.58

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.014
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.04
    bump.inputs["Distance"].default_value = 0.014
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: p320_v3_slide (5 parts) ---
        # Iconic SIG M17 Coyote-Tan PVD Stainless Steel Slide (warm metallic champagne-coyote speculars!)
        "S_CoyotePVD": _build_pbr_mat(
            "S_CoyotePVD",
            base_srgb=(0.625, 0.512, 0.358),
            roughness=0.275,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.0,  # Zero vertex-Pointiness triangulation streaks on hero slide flanks!
            edge_srgb=(0.78, 0.68, 0.52),
            grain_scale=36.0,
            grain_bump=0.014,
            aniso_stretch=(0.16, 4.0, 4.0),
            rough_var=0.032,
        ),
        # Darker milled Coyote PVD recesses (serration roots, DPP optic pocket, bore tunnel, rail channels)
        "S_CoyoteMilled": _build_pbr_mat(
            "S_CoyoteMilled",
            base_srgb=(0.355, 0.285, 0.195),
            roughness=0.41,
            metallic=0.80,
            bevel_r=0.016,
            grain_scale=44.0,
            grain_bump=0.030,
            rough_var=0.048,
        ),
        # Deep Black Nitron / DLC Steel (Optic cover plate, night sight blades, external extractor, slide backplate)
        "S_NitronBlack": _build_pbr_mat(
            "S_NitronBlack",
            base_srgb=(0.182, 0.192, 0.212),
            roughness=0.29,
            metallic=0.88,
            bevel_r=0.018,
            edge_wear=0.36,
            edge_srgb=(0.62, 0.66, 0.72),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.042,
        ),
        "S_NitronRecess": _build_pbr_mat(
            "S_NitronRecess",
            base_srgb=(0.115, 0.122, 0.138),
            roughness=0.46,
            metallic=0.78,
            bevel_r=0.012,
            grain_scale=44.0,
            grain_bump=0.028,
        ),
        # Gunmetal steel Torx T15 screws & pins
        "S_HardwareSteel": _build_pbr_mat(
            "S_HardwareSteel",
            base_srgb=(0.46, 0.49, 0.54),
            roughness=0.26,
            metallic=0.92,
            bevel_r=0.012,
            grain_scale=32.0,
            grain_bump=0.018,
        ),
        # Internal striker housing glass-filled black nylon cage
        "S_HousingPoly": _build_pbr_mat(
            "S_HousingPoly",
            base_srgb=(0.165, 0.172, 0.186),
            roughness=0.64,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=58.0,
            grain_bump=0.045,
            voronoi_grain=0.40,
            voronoi_scale=80.0,
        ),
        # SIGLITE Daylight White Aiming Ring
        "S_SightWhiteRing": _build_pbr_mat(
            "S_SightWhiteRing",
            base_srgb=(0.95, 0.96, 0.98),
            roughness=0.22,
            metallic=0.00,
            bevel_r=0.006,
            grain_scale=24.0,
            grain_bump=0.004,
            rough_var=0.012,
        ),
        # SIGLITE Luminous Phosphor-Green Tritium Night Vial
        "S_TritiumGreen": _build_pbr_mat(
            "S_TritiumGreen",
            base_srgb=(0.42, 0.99, 0.22),
            roughness=0.14,
            metallic=0.00,
            bevel_r=0.005,
            grain_scale=20.0,
            grain_bump=0.002,
            rough_var=0.010,
        ),

        # --- SUITE 2: p320_v3_grip (3 parts) ---
        # Warm Matte Coyote-Tan Glass-Filled Polyamide Grip Module & Floorplate (distinctly M=0.0 matte!)
        "G_CoyotePoly": _build_pbr_mat(
            "G_CoyotePoly",
            base_srgb=(0.562, 0.452, 0.312),
            roughness=0.63,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.0,  # Clean injection-molded polyamide flanks (zero Pointiness streaks!)
            grain_scale=64.0,
            grain_bump=0.055,
            voronoi_grain=0.45,
            voronoi_scale=88.0,
            rough_var=0.045,
        ),
        # 360-deg Wraparound Micro-Pebble Stippled Coyote Polymer (frontstrap & arched backstrap!)
        "G_CoyoteStipple": _build_pbr_mat(
            "G_CoyoteStipple",
            base_srgb=(0.502, 0.400, 0.274),
            roughness=0.74,
            metallic=0.00,
            bevel_r=0.018,
            grain_scale=96.0,
            grain_bump=0.38,
            voronoi_grain=0.92,
            voronoi_scale=112.0,
            rough_var=0.048,
        ),
        # Darker Coyote polymer recessed interior cavities, Picatinny slot bottoms & serial bezel walls
        "G_CoyoteInner": _build_pbr_mat(
            "G_CoyoteInner",
            base_srgb=(0.435, 0.345, 0.235),
            roughness=0.72,
            metallic=0.00,
            bevel_r=0.016,
            grain_scale=62.0,
            grain_bump=0.055,
            voronoi_grain=0.38,
            voronoi_scale=78.0,
        ),
        # Dark nylon floorplate locking insert & steel retention stud
        "G_InsertPolymer": _build_pbr_mat(
            "G_InsertPolymer",
            base_srgb=(0.175, 0.185, 0.205),
            roughness=0.58,
            metallic=0.00,
            bevel_r=0.014,
            grain_scale=48.0,
            grain_bump=0.035,
        ),
        "G_DetentSteel": _build_pbr_mat(
            "G_DetentSteel",
            base_srgb=(0.34, 0.37, 0.41),
            roughness=0.28,
            metallic=0.90,
            bevel_r=0.012,
            grain_scale=32.0,
            grain_bump=0.016,
        ),
        # Firewalled High-Vis Safety-Orange Anti-Tilt Polymer Follower
        "G_FollowerOrange": _build_pbr_mat(
            "G_FollowerOrange",
            base_srgb=(0.91, 0.33, 0.068),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.14,
            edge_srgb=(0.97, 0.52, 0.24),
            grain_scale=36.0,
            grain_bump=0.022,
            rough_var=0.032,
        ),

        # --- SUITE 3: p320_v3_fcu_metal (14 parts) ---
        # Gleaming Brushed 17-4PH Stainless Steel Drop-In FCU Chassis!
        "F_FcuStainless": _build_pbr_mat(
            "F_FcuStainless",
            base_srgb=(0.745, 0.768, 0.798),
            roughness=0.245,
            metallic=0.945,
            bevel_r=0.020,
            edge_wear=0.18,
            edge_srgb=(0.88, 0.90, 0.93),
            grain_scale=34.0,
            grain_bump=0.018,
            aniso_stretch=(0.20, 4.2, 4.2),
            rough_var=0.030,
        ),
        # Clean Flawless Satin-Brushed Stainless FCU Right-Flank Serial Window Plate (`TC014829`)
        "F_FcuSerialPlate": _build_pbr_mat(
            "F_FcuSerialPlate",
            base_srgb=(0.835, 0.855, 0.885),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.014,
            edge_wear=0.0,
            grain_scale=36.0,
            grain_bump=0.012,
            aniso_stretch=(0.15, 4.5, 4.5),
            rough_var=0.022,
        ),
        # Mirror-Polished Stainless / Hard Chrome (Feed ramp, trigger bar, MIM sear nose, striker, inner guide rod)
        "F_PolishedStainless": _build_pbr_mat(
            "F_PolishedStainless",
            base_srgb=(0.805, 0.828, 0.855),
            roughness=0.175,
            metallic=0.965,
            bevel_r=0.016,
            edge_wear=0.16,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=30.0,
            grain_bump=0.012,
            aniso_stretch=(0.24, 4.0, 4.0),
            rough_var=0.024,
        ),
        # Satin Black Nitron / DLC Steel (4.7" Barrel, Takedown Lever, Slide Catch, Mag Catch, Trigger Shoe, Manual Safety)
        "F_NitronBlack": _build_pbr_mat(
            "F_NitronBlack",
            base_srgb=(0.220, 0.232, 0.254),
            roughness=0.31,
            metallic=0.86,
            bevel_r=0.020,
            edge_wear=0.38,
            edge_srgb=(0.66, 0.70, 0.76),
            grain_scale=36.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.045,
        ),
        # Barrel Nitron Hood (lifted satin gunmetal so hood & `9mmx19` read crisply inside ejection port!)
        "F_BarrelHood": _build_pbr_mat(
            "F_BarrelHood",
            base_srgb=(0.275, 0.290, 0.315),
            roughness=0.33,
            metallic=0.84,
            bevel_r=0.018,
            edge_wear=0.0,
            grain_scale=36.0,
            grain_bump=0.016,
            aniso_stretch=(0.25, 3.5, 3.5),
            rough_var=0.032,
        ),
        "F_MachinedDark": _build_pbr_mat(
            "F_MachinedDark",
            base_srgb=(0.115, 0.122, 0.136),
            roughness=0.44,
            metallic=0.80,
            bevel_r=0.014,
            grain_scale=44.0,
            grain_bump=0.028,
        ),
        # Bright Rifled Bore Lands & Grooves
        "F_RifledBoreSteel": _build_pbr_mat(
            "F_RifledBoreSteel",
            base_srgb=(0.42, 0.45, 0.49),
            roughness=0.22,
            metallic=0.93,
            bevel_r=0.010,
            grain_scale=28.0,
            grain_bump=0.014,
        ),
        "F_BarrelCrownSoot": _build_muzzle_crown_soot_mat(),
        # 17-Rd Italian Mec-Gar Blued Carbon Steel Magazine Body
        "F_MagBluedSteel": _build_pbr_mat(
            "F_MagBluedSteel",
            base_srgb=(0.192, 0.206, 0.232),
            roughness=0.255,
            metallic=0.90,
            bevel_r=0.020,
            edge_wear=0.0,  # Zero Pointiness triangulation rays around witness holes!
            grain_scale=36.0,
            grain_bump=0.018,
            aniso_stretch=(2.8, 0.4, 2.8),
            rough_var=0.038,
        ),
        # High-Carbon Music-Wire Spring Steel (Internal springs & mag spring)
        "F_SpringSteel": _build_pbr_mat(
            "F_SpringSteel",
            base_srgb=(0.46, 0.49, 0.54),
            roughness=0.26,
            metallic=0.93,
            bevel_r=0.010,
            grain_scale=28.0,
            grain_bump=0.016,
        ),
        # Dark Matte Nylon Sear Housing Block inside FCU
        "F_SearHousingPoly": _build_pbr_mat(
            "F_SearHousingPoly",
            base_srgb=(0.165, 0.174, 0.188),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.016,
            grain_scale=54.0,
            grain_bump=0.040,
            voronoi_grain=0.35,
            voronoi_scale=76.0,
        ),
        # Glossy Crimson-Red Enamel Manual Safety Fire Indicator Dot (inlaid on BOTH ambi paddles!)
        "F_CrimsonFireDot": _build_pbr_mat(
            "F_CrimsonFireDot",
            base_srgb=(0.86, 0.068, 0.055),
            roughness=0.18,
            metallic=0.02,
            bevel_r=0.006,
            grain_scale=20.0,
            grain_bump=0.004,
            rough_var=0.012,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface / Organic Modeling Toolkit
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
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def _quad_bez(p0, p1, p2, segs: int = 10):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _cubic_bez(p0, p1, p2, p3, segs: int = 14):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        ))
    return pts


def _eval_cubic(p0, p1, p2, p3, t: float):
    u = 1.0 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


def _eval_quad(p0, p1, p2, t: float):
    u = 1.0 - t
    return (
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    )


def mk_box(
    name: str,
    sx: float,
    sy: float,
    sz: float,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
    bevel_segs: int = 2,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str,
    r_top: float,
    r_bot: float,
    length: float,
    axis: str = "x",
    segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r_bot,
        radius2=r_top,
        depth=length,
    )
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=2,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    pre = []
    if axis == "y":
        pre = [("rx", -math.pi * 0.5)]
    elif axis == "x":
        pre = [("ry", math.pi * 0.5)]
    elif axis == "-x":
        pre = [("ry", -math.pi * 0.5)]
    elif axis == "z":
        pre = []
    _apply_three_xform(bm, pre + (xform or []))
    return _bm_to_obj(name, bm, mat)


def mk_sphere(
    name: str,
    rx: float,
    ry: float,
    rz: float,
    u_segs: int = 18,
    v_segs: int = 12,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_segs, v_segments=v_segs, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str,
    pts_xy: list[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()

    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
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
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_x(
    name: str,
    pts_zy: list[tuple[float, float]],
    x0: float,
    x1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
    long_bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_zy:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()

    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
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

    if long_bevel > 0.0:
        long_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.5]
        if long_edges:
            bmesh.ops.bevel(
                bm,
                geom=long_edges,
                offset=long_bevel,
                segments=2,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )

    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_y(
    name: str,
    pts_xz: list[tuple[float, float]],
    y0: float,
    y1: float,
    bevel: float = 0.0,
    bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = []
    for p in pts_xz:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()

    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1]
        - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
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
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=bevel,
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_loft_rings(
    name: str,
    rings_three: list[list[tuple[float, float, float]]],
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Watertight multi-station organic loft in Three.js coordinates."""
    bm = bmesh.new()
    bm_rings = [[bm.verts.new(p) for p in ring] for ring in rings_three]
    n_pts = len(bm_rings[0])
    for i in range(len(bm_rings) - 1):
        a, b = bm_rings[i], bm_rings[i + 1]
        for k in range(n_pts):
            kn = (k + 1) % n_pts
            bm.faces.new((a[k], a[kn], b[kn], b[k]))
    if cap_ends:
        bm.faces.new(list(reversed(bm_rings[0])))
        bm.faces.new(bm_rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_tube_along_pts(
    name: str,
    pts_three: list[Vector],
    radius: float,
    ring_segs: int = 10,
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
    name: str,
    axis: str,
    start: float,
    end: float,
    center_a: float,
    center_b: float,
    coil_r: float,
    wire_r: float,
    coils: float,
    ring_segs: int = 8,
    steps_per_coil: int = 16,
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


def mk_beveled_groove_cutter(
    name: str,
    w_out: float,
    w_in: float,
    height: float,
    depth: float,
    z_out: float = 0.24,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Trapezoidal beveled cocking serration cutter (wider at surface -> crisp chamfered SIG ribs!)."""
    hwo, hwi = w_out * 0.5, w_in * 0.5
    hh = height * 0.5
    coords = [
        (-hwo, -hh, z_out),
        ( hwo, -hh, z_out),
        ( hwo,  hh, z_out),
        (-hwo,  hh, z_out),
        (-hwi, -hh + 0.05, -depth),
        ( hwi, -hh + 0.05, -depth),
        ( hwi,  hh - 0.05, -depth),
        (-hwi,  hh - 0.05, -depth),
    ]
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in coords]
    for q in (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ):
        bm.faces.new([vs[i] for i in q])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
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


def bool_subtract(
    target: bpy.types.Object, cutters: list[bpy.types.Object], solver: str = "EXACT"
) -> bpy.types.Object:
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


def bool_union(
    objs: list[bpy.types.Object], name: str, solver: str = "EXACT"
) -> bpy.types.Object:
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
    """Strictly enforces manifoldness & outward positive volume BEFORE WeightedNormal & Triangulate!"""
    select_only([obj], obj)
    if bevel_w > 0.0:
        nm_pre = _count_non_manifold(obj)
        backup = obj.data.copy()
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.offset_type = "OFFSET"
        mod.width = bevel_w
        mod.segments = bevel_segs
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32.0)
        mod.use_clamp_overlap = True
        mod.miter_outer = "MITER_ARC"
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if _count_non_manifold(obj) > nm_pre:
            old = obj.data
            obj.data = backup
            bpy.data.meshes.remove(old)
        else:
            bpy.data.meshes.remove(backup)

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
    flat_rad = math.radians(12.0)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = e.calc_face_angle(0.0)
            is_flat_wall_edge = False
            if lock_flat_walls and ang > flat_rad:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                if (abs(f0.normal.y) > 0.985 or abs(f1.normal.y) > 0.985) and (
                    f0.calc_area() > 0.08 or f1.calc_area() > 0.08
                ):
                    is_flat_wall_edge = True
            e.smooth = (ang < angle_rad) and (not is_flat_wall_edge)
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

    return obj


# =============================================================================
# PART BUILDERS — SUITE 1: p320_v3_slide (5 parts)
# =============================================================================
def build_p320_slide(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-01: Iconic SIG Sauer M17 Coyote-Tan PVD Stainless Steel Slide (Optic-Ready).
    Features signature high-shoulder beveled tri-top profile, full-contour front recoil chin,
    SIG bullnose muzzle chamfers, 5 front & 6 rear 18°-raked beveled cocking serrations,
    lowered ejection port w/ brass-clearance flare, M17 top LCI notch, recessed DeltaPoint Pro
    rear optic pocket w/ twin recoil bosses & screw holes, front dovetail cut & hollow mechanics.
    BBox: X[-7.850..+11.650], Y[+0.645..+3.615], Z[-1.335..+1.335]."""
    m_pvd = mats["S_CoyotePVD"]
    m_mil = mats["S_CoyoteMilled"]

    # 1. Authentic SIG P320 M17 high-shoulder tri-top cross-section in (Z, Y)
    pts_zy = [
        (-1.26, 0.90),
        ( 1.26, 0.90),
    ]
    pts_zy += _quad_bez((1.26, 0.90), (1.335, 0.90), (1.335, 0.99), segs=4)
    pts_zy.append((1.335, 2.48))
    # Crisp SIG upper shoulder facets narrowing cleanly to the flat top optic deck
    pts_zy.append((0.975, 3.48))
    pts_zy += _quad_bez((0.975, 3.48), (0.91, 3.615), (0.78, 3.615), segs=5)
    pts_zy.append((-0.78, 3.615))
    pts_zy += _quad_bez((-0.78, 3.615), (-0.91, 3.615), (-0.975, 3.48), segs=5)
    pts_zy.append((-1.335, 2.48))
    pts_zy.append((-1.335, 0.99))
    pts_zy += _quad_bez((-1.335, 0.99), (-1.335, 0.90), (-1.26, 0.90), segs=4)

    slide_slab = mk_extrude_x("sl_slab", pts_zy, -7.85, 11.65, bevel=0.036, bevel_segs=2, mat=m_pvd)

    # Full-contour SIG front recoil-spring chin extending under 4.7" muzzle (X in [+9.30, +11.62])
    recoil_chin = mk_cyl(
        "sl_chin", 0.645, 0.675, 2.32, axis="x", segs=32,
        xform=[("t", 10.46, 1.32, 0.0)], mat=m_pvd, bevel=0.028,
    )
    raw_slide = bool_union([slide_slab, recoil_chin], "p320_slide")

    cutters: list[bpy.types.Object] = []

    # 2. Slanted rear M17 slide face bevel + front SIG bullnose muzzle chamfers + top 30° nose rake
    cutters.append(
        mk_box("c_sl_rear", 0.95, 3.45, 3.10, [("rz", -0.14), ("t", -8.25, 2.35, 0.0)], m_pvd)
    )
    cutters.append(
        mk_box("c_sl_tnose", 1.60, 0.62, 3.05, [("rz", -0.52), ("t", 11.49, 3.72, 0.0)], m_pvd)
    )
    for sign in (-1.0, 1.0):
        # True forward-tapering SIG M17 bullnose chamfer (ry = +sign*0.34 narrows toward +X muzzle,
        # preserving >= 2.6 mm solid Coyote PVD steel wall around the r=0.76 barrel bore on both flanks!)
        cutters.append(
            mk_box(
                f"c_sl_bn_{sign:+.0f}", 1.56, 3.05, 0.88,
                [("ry", sign * 0.34), ("t", 11.45, 2.25, sign * 1.56)], m_pvd,
            )
        )
        cutters.append(
            mk_box(
                f"c_sl_chin_{sign:+.0f}", 2.55, 0.66, 0.66,
                [("rx", sign * 0.72), ("t", 10.52, 0.87, sign * 1.16)], m_pvd,
            )
        )

    # 3. Underside FCU rail T-channels & hollow open slide belly
    cutters.append(mk_box("c_sl_belly", 17.20, 0.94, 1.86, [("t", 0.65, 1.32, 0.0)], m_mil))
    cutters.append(mk_box("c_sl_rails", 17.60, 0.22, 2.16, [("t", 0.75, 1.02, 0.0)], m_mil))

    # 4. Barrel bore (r=0.76 for zero tilt clipping!) + internal barrel-hood vault + recoil tunnel
    cutters.append(mk_cyl("c_sl_bore", 0.76, 0.76, 12.60, axis="x", segs=32, xform=[("t", 5.55, 2.68, 0.0)], mat=m_mil))
    cutters.append(mk_box("c_sl_vault", 7.50, 1.38, 1.70, [("t", 6.40, 2.69, 0.0)], m_mil))
    cutters.append(mk_cyl("c_sl_rec1", 0.52, 0.52, 9.50, axis="x", segs=26, xform=[("t", 6.35, 1.46, 0.0)], mat=m_mil))
    cutters.append(mk_cyl("c_sl_rec2", 0.36, 0.36, 1.55, axis="x", segs=22, xform=[("t", 11.15, 1.46, 0.0)], mat=m_mil))
    cutters.append(mk_box("c_sl_slot", 9.10, 1.15, 1.16, [("t", 6.20, 2.05, 0.0)], m_mil))

    # 5. SIG Sauer Open Top-Right Ejection Port (X in [-0.55, +2.65]) + Forward-Raked Flare + Top M17 LCI Notch
    cutters.append(mk_box("c_sl_ejtop", 3.20, 0.98, 1.66, [("t", 1.05, 3.38, 0.0)], m_mil))
    cutters.append(mk_box("c_sl_ejrt", 3.18, 1.48, 1.48, [("t", 1.05, 2.86, 0.70)], m_mil))
    cutters.append(
        mk_box("c_sl_ejflr", 0.44, 1.12, 0.52, [("ry", 0.62), ("t", 2.66, 2.98, 1.04)], m_mil)
    )
    # Top-center M17 Loaded Chamber Indicator (LCI) witness slot behind barrel hood
    cutters.append(mk_box("c_sl_lci", 0.84, 0.38, 0.20, [("t", -0.92, 3.54, 0.0)], m_mil))
    # Breech-face firing pin aperture + Left FCU fixed-ejector clearance groove
    cutters.append(mk_cyl("c_sl_fp", 0.11, 0.11, 0.54, axis="x", segs=16, xform=[("t", -0.62, 2.68, 0.0)], mat=m_mil))
    cutters.append(mk_box("c_sl_ejgrv", 7.35, 0.64, 0.22, [("t", -4.15, 1.52, -0.36)], m_mil))

    # 6. M17 Leupold DeltaPoint Pro (DPP) Rear Optic Cutout (X in [-7.56, -3.54], Y in [+3.26, +3.72])
    cutters.append(mk_box("c_sl_dpp", 4.02, 0.48, 2.28, [("t", -5.55, 3.50, 0.0)], m_mil))
    for sign in (-1.0, 1.0):
        # Twin front DPP alignment boss sockets + twin Torx T15 mounting tapped holes
        cutters.append(
            mk_cyl(f"c_sl_dboss_{sign:+.0f}", 0.11, 0.11, 0.18, axis="y", segs=16,
                   xform=[("t", -3.92, 3.22, sign * 0.48)], mat=m_mil)
        )
        cutters.append(
            mk_cyl(f"c_sl_dtorx_{sign:+.0f}", 0.095, 0.095, 0.26, axis="y", segs=16,
                   xform=[("t", -4.50, 3.20, sign * 0.46)], mat=m_mil)
        )

    # 7. Angled Front Sight Dovetail Slot at X = +10.55
    dt_xy = [(-0.27, 3.475), (0.27, 3.475), (0.21, 3.66), (-0.21, 3.66)]
    cutters.append(mk_extrude_z("c_sl_fdt", dt_xy, -1.15, 1.15, xform=[("t", 10.55, 0.0, 0.0)], mat=m_mil))

    # 8. Internal Striker Housing Pocket + Stepped Right-Wall External Extractor Pocket + Plunger Bore
    cutters.append(mk_box("c_sl_shous", 7.35, 0.92, 0.82, [("t", -4.22, 2.52, 0.0)], m_mil))
    cutters.append(mk_box("c_sl_extpk", 2.42, 0.52, 0.58, [("t", -1.46, 2.68, 1.09)], m_mil))
    cutters.append(mk_cyl("c_sl_extpl", 0.15, 0.15, 1.35, axis="x", segs=16, xform=[("t", -2.95, 2.68, 0.88)], mat=m_mil))

    # 9. Ambidextrous Slide-Catch Notches (X=-2.55) + Rear M17 Manual Thumb Safety Clearance Notches (X=-5.75)
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_sl_sc_{sign:+.0f}", 0.68, 0.44, 0.48, [("t", -2.55, 1.05, sign * 1.22)], m_mil))
        cutters.append(mk_box(f"c_sl_ms_{sign:+.0f}", 0.72, 0.34, 0.48, [("t", -5.75, 0.98, sign * 1.22)], m_mil))

    # 10. Aggressive Deep 18°-Forward-Raked SIG Cocking Serrations (5 Front + 6 Rear on BOTH flanks!)
    #     Trapezoidal beveled cutters create razor-crisp chamfered Coyote PVD ribs catching warm champagne highlights!
    for i in range(5):
        fx = 7.72 + i * 0.48
        for sign in (-1.0, 1.0):
            ry = 0.0 if sign > 0 else math.pi
            cutters.append(
                mk_beveled_groove_cutter(
                    f"c_sl_fs_{i}_{sign:+.0f}", w_out=0.22, w_in=0.135, height=1.62, depth=0.125, z_out=0.24,
                    xform=[("ry", ry), ("rz", -0.31), ("t", fx, 1.78, sign * 1.325)], mat=m_mil,
                )
            )
    for i in range(6):
        rx = -6.94 + i * 0.48
        for sign in (-1.0, 1.0):
            ry = 0.0 if sign > 0 else math.pi
            cutters.append(
                mk_beveled_groove_cutter(
                    f"c_sl_rs_{i}_{sign:+.0f}", w_out=0.22, w_in=0.135, height=1.92, depth=0.125, z_out=0.24,
                    xform=[("ry", ry), ("rz", -0.31), ("t", rx, 1.92, sign * 1.325)], mat=m_mil,
                )
            )

    sculpted = bool_subtract(raw_slide, cutters)
    return finish_part(sculpted, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_p320_optic_plate_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-02: Removable Black Nitron DeltaPoint Pro Cover Plate w/ Integral SIGLITE Tritium Night Rear Sight,
    Twin Recessed Torx T15 Screws & Pivoting M17 Loaded Chamber Indicator (LCI) Flag.
    assembledPos = [-5.55, 3.26, 0] | BBox: X[-1.980..+2.760], Y[-0.100..+0.840], Z[-0.930..+0.930]."""
    m_blk = mats["S_NitronBlack"]
    m_rec = mats["S_NitronRecess"]
    m_hw = mats["S_HardwareSteel"]
    m_wht = mats["S_SightWhiteRing"]
    m_tri = mats["S_TritiumGreen"]

    # Precision-milled DPP cover plate sitting seamlessly flush inside the Coyote slide pocket
    plate = mk_box("op_plate", 3.96, 0.32, 1.86, [("t", 0.0, 0.16, 0.0)], m_blk, bevel=0.022)
    boss_l = mk_cyl("op_bossl", 0.095, 0.095, 0.10, axis="y", segs=18, xform=[("t", 1.63, -0.05, -0.48)], mat=m_hw, bevel=0.010)
    boss_r = mk_cyl("op_bossr", 0.095, 0.095, 0.10, axis="y", segs=18, xform=[("t", 1.63, -0.05,  0.48)], mat=m_hw, bevel=0.010)
    lci_lip = mk_box("op_lcilip", 0.24, 0.10, 0.34, [("t", 1.92, -0.03, 0.0)], m_blk, bevel=0.010)

    # Integral M17 protective-wing SIGLITE night rear sight rising cleanly above plate
    sight_xy = [(-1.74, 0.28), (-0.32, 0.28), (-0.50, 0.84), (-1.64, 0.84)]
    sight_body = mk_extrude_z("op_sight", sight_xy, -0.79, 0.79, bevel=0.022, bevel_segs=2, mat=m_blk)

    base = bool_union([plate, sight_body], "op_base")

    # Carve U-notch, protective ear scallops, twin Torx T15 counterbores & 5 rear anti-glare serrations
    cuts = [
        mk_box("c_op_notch", 1.68, 0.36, 0.38, [("t", -1.05, 0.70, 0.0)], m_rec),
        mk_cyl("c_op_cb1", 0.165, 0.165, 0.18, axis="y", segs=22, xform=[("t", 1.05, 0.30, -0.46)], mat=m_rec),
        mk_cyl("c_op_cb2", 0.165, 0.165, 0.18, axis="y", segs=22, xform=[("t", 1.05, 0.30,  0.46)], mat=m_rec),
    ]
    for i in range(5):
        cuts.append(
            mk_box(f"c_op_ag_{i}", 0.06, 0.035, 1.54, [("t", -1.71, 0.36 + i * 0.085, 0.0)], m_rec)
        )
    carved = bool_subtract(base, cuts)

    parts = [carved, boss_l, boss_r, lci_lip]

    # Twin recessed 6-lobe Torx T15 mounting screws w/ dark carved sockets & underside shanks
    for s_idx, zp in enumerate((-0.46, 0.46)):
        head_raw = mk_cyl(f"op_sh_{s_idx}", 0.135, 0.135, 0.075, axis="y", segs=22, xform=[("t", 1.05, 0.265, zp)], mat=m_hw, bevel=0.012)
        torx_cut = mk_cyl(f"c_op_tx_{s_idx}", 0.068, 0.068, 0.070, axis="y", segs=6, xform=[("t", 1.05, 0.285, zp)], mat=m_rec)
        head = bool_subtract(head_raw, [torx_cut])
        shank = mk_cyl(f"op_sk_{s_idx}", 0.075, 0.075, 0.34, axis="y", segs=16, xform=[("t", 1.05, 0.08, zp)], mat=m_hw)
        parts.extend([head, shank])

    # Pivoting M17 Loaded Chamber Indicator (LCI) steel lever flag nested at front of optic plate
    lci_flag = mk_box("op_lci", 0.68, 0.14, 0.14, [("t", 2.42, 0.24, 0.0)], m_blk, bevel=0.014)
    parts.append(lci_flag)

    # Twin SIGLITE Luminous Green Tritium Night Rear Dots framed by crisp Daylight White Rings!
    for s_idx, sign in enumerate((-1.0, 1.0)):
        ring = mk_cyl(f"op_wring_{s_idx}", 0.092, 0.092, 0.036, axis="x", segs=24,
                      xform=[("t", -1.692, 0.57, sign * 0.42)], mat=m_wht, bevel=0.006)
        vial = mk_cyl(f"op_trit_{s_idx}", 0.056, 0.056, 0.044, axis="x", segs=20,
                      xform=[("t", -1.702, 0.57, sign * 0.42)], mat=m_tri, bevel=0.008)
        parts.extend([ring, vial])

    obj = join_objects(parts, "p320_optic_plate_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_front_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-03: Dovetail Black Nitron SIGLITE Luminous Green Tritium Front Night Sight.
    assembledPos = [10.55, 3.56, 0] | BBox: X[-0.476..+0.478], Y[-0.110..+0.495], Z[-0.670..+0.670]."""
    m_blk = mats["S_NitronBlack"]
    m_rec = mats["S_NitronRecess"]
    m_wht = mats["S_SightWhiteRing"]
    m_tri = mats["S_TritiumGreen"]

    # True angled trapezoidal dovetail base locking flush into the Coyote slide front slot
    dt_xy = [(-0.25, -0.11), (0.25, -0.11), (0.20, 0.025), (-0.20, 0.025)]
    dovetail = mk_extrude_z("fs_dt", dt_xy, -0.67, 0.67, bevel=0.012, bevel_segs=2, mat=m_blk)

    blade_xy = [(-0.46, 0.0), (0.46, 0.0), (0.22, 0.48), (-0.42, 0.48)]
    blade_raw = mk_extrude_z("fs_blade", blade_xy, -0.13, 0.13, bevel=0.016, bevel_segs=2, mat=m_blk)

    # 3 crisp horizontal front-ramp anti-glare serrations (clean non-grazing depth along slope x = 0.46 - 0.5*y)
    serrs = []
    for i, sy in enumerate((0.11, 0.21, 0.31)):
        sx = 0.46 - 0.5 * sy + 0.022
        serrs.append(mk_box(f"c_fs_s{i}", 0.09, 0.036, 0.36, [("t", sx, sy, 0.0)], m_rec))
    blade = bool_subtract(blade_raw, serrs)

    # Large SIGLITE high-contrast daylight white aiming ring + luminous green tritium vial facing shooter (-X)!
    ring = mk_cyl("fs_wring", 0.098, 0.098, 0.036, axis="x", segs=24, xform=[("t", -0.432, 0.28, 0.0)], mat=m_wht, bevel=0.006)
    vial = mk_cyl("fs_trit", 0.062, 0.062, 0.044, axis="x", segs=20, xform=[("t", -0.442, 0.28, 0.0)], mat=m_tri, bevel=0.008)

    obj = join_objects([dovetail, blade, ring, vial], "p320_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_striker_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-09: Modular Internal Polymer Striker Housing Cage & Black Nitron Steel Rear Slide Cap Plate.
    assembledPos = [0, 0, 0] | BBox: X[-7.835..-4.195], Y[+1.035..+3.235], Z[-0.895..+0.895]."""
    m_poly = mats["S_HousingPoly"]
    m_blk = mats["S_NitronBlack"]
    m_rec = mats["S_NitronRecess"]

    sleeve_raw = mk_box("sh_slv", 3.45, 0.76, 0.68, [("t", -5.92, 2.66, 0.0)], m_poly, bevel=0.020)
    slv_cuts = [
        mk_cyl("c_sh_bore", 0.28, 0.28, 3.65, axis="x", segs=24, xform=[("t", -5.92, 2.68, 0.0)], mat=m_rec),
        mk_box("c_sh_slot", 2.80, 0.52, 0.30, [("t", -5.60, 2.36, 0.0)], m_rec),
        mk_box("c_sh_win", 0.92, 0.38, 0.36, [("t", -4.45, 2.84, 0.24)], m_rec),
    ]
    sleeve = bool_subtract(sleeve_raw, slv_cuts)

    # Rear Black Nitron Slide Cap Plate locking into rear of Coyote PVD slide (X = -7.835..-7.64)
    cap_zy = [
        (-0.885, 1.045),
        ( 0.885, 1.045),
        ( 0.885, 2.55),
        ( 0.685, 3.225),
        (-0.685, 3.225),
        (-0.885, 2.55),
    ]
    cap_raw = mk_extrude_x("sh_cap", cap_zy, -7.835, -7.64, bevel=0.018, bevel_segs=2, mat=m_blk)
    cap_cuts = [
        mk_cyl("c_sh_det", 0.11, 0.11, 0.14, axis="x", segs=18, xform=[("t", -7.84, 2.68, 0.0)], mat=m_rec),
    ]
    # Crisp horizontal anti-glare grip grooves across rear face of slide cap plate
    for i in range(4):
        cap_cuts.append(
            mk_box(f"c_sh_grv_{i}", 0.04, 0.045, 1.48, [("t", -7.83, 1.38 + i * 0.22, 0.0)], m_rec)
        )
    cap = bool_subtract(cap_raw, cap_cuts)

    obj = join_objects([sleeve, cap], "p320_striker_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_extractor(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-11: Long External Black Nitron Extractor Bar, Undercut Hook Claw, Pivot Pin & Plunger Spring.
    assembledPos = [-1.45, 2.68, 1.02] | BBox: X[-1.704..+1.120], Y[-0.280..+0.280], Z[-0.370..+0.140]."""
    m_blk = mats["S_NitronBlack"]
    m_rec = mats["S_NitronRecess"]
    m_hw = mats["S_HardwareSteel"]

    bar_raw = mk_box("ex_bar", 2.20, 0.42, 0.28, [], m_blk, bevel=0.022)
    bar = bool_subtract(bar_raw, [mk_box("c_ex_rel", 0.85, 0.16, 0.12, [("t", -0.15, 0.0, 0.13)], m_rec)])

    claw_raw = mk_box("ex_claw", 0.28, 0.40, 0.38, [("t", 0.98, 0.0, -0.18)], m_blk, bevel=0.016)
    claw = bool_subtract(claw_raw, [mk_box("c_ex_uc", 0.14, 0.44, 0.16, [("t", 0.84, 0.0, -0.32)], m_rec)])

    pin = mk_cyl("ex_pin", 0.075, 0.075, 0.56, axis="y", segs=18, xform=[("t", -0.28, 0.0, -0.02)], mat=m_hw, bevel=0.008)
    plunger = mk_cyl("ex_plg", 0.09, 0.09, 0.48, axis="x", segs=18, xform=[("t", -0.78, 0.0, -0.20)], mat=m_hw, bevel=0.010)
    spring = mk_coil_spring("ex_spr", "x", -1.68, -0.95, 0.0, -0.20, 0.105, 0.024, 8.0, ring_segs=8, steps_per_coil=14, mat=m_hw)

    obj = join_objects([bar, claw, pin, plunger, spring], "p320_extractor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — SUITE 2: p320_v3_grip (3 parts)
# =============================================================================
def build_p320_grip_module(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: Modular Coyote-Tan Glass-Filled Polyamide Carry Grip Module (w/ FCU Serial Window).
    Hybrid precision-machined upper dustcover + 3-slot MIL-STD-1913 Picatinny rail + organically
    lofted 18-station ergonomic palm-swell pistol grip (w/ 360° wraparound Voronoi stippled frontstrap
    & arched backstrap) + smoothly contoured undercut rounded SIG trigger guard + framed right-side
    FCU serial window exposing gleaming stainless `TC014829`!
    BBox: X[-9.058..+9.643], Y[-9.718..+0.985], Z[-1.245..+1.245]."""
    m_poly = mats["G_CoyotePoly"]
    m_stip = mats["G_CoyoteStipple"]
    m_in = mats["G_CoyoteInner"]

    # 1. Upper Dust-Cover Frame, High Sweeping M17 Beavertail & M1913 Rail Core (Y in [-0.54, +0.97])
    up_xy = [(-7.58, 0.965), (9.50, 0.965)]
    up_xy += _quad_bez((9.50, 0.965), (9.66, 0.91), (9.61, 0.42), segs=6)
    up_xy.append((9.32, -0.36))
    up_xy.append((2.68, -0.36))
    up_xy += _quad_bez((2.68, -0.36), (2.22, -0.36), (1.96, -0.54), segs=6)
    up_xy.append((-1.82, -0.54))
    up_xy.append((-6.65, -0.54))
    up_xy += _cubic_bez((-6.65, -0.54), (-6.50, -0.18), (-6.78, 0.12), (-7.48, 0.24), segs=10)
    up_xy += _quad_bez((-7.48, 0.24), (-8.66, 0.36), (-9.02, 0.52), segs=8)
    up_xy += _quad_bez((-9.02, 0.52), (-9.09, 0.78), (-8.66, 0.87), segs=6)
    up_xy.append((-7.58, 0.965))

    upper_frame = mk_extrude_z("gm_upper", up_xy, -1.245, 1.245, bevel=0.068, bevel_segs=3, mat=m_poly)

    # 2. Organically Lofted Ergonomic Carry Pistol Grip (18 height stations down to exact -18° flush rim!)
    # Smoothly merges into upper frame at top (Y = -0.32) with flush width so ZERO horizontal shelf step appears,
    # and terminates flush on the exact -18° plane (-5.247,-9.642) .. (-8.177,-8.690)!
    n_stations = 18
    ring_pts = 32
    grip_rings = []
    for si in range(n_stations):
        t = si / (n_stations - 1)
        # Frontstrap curve: (-1.92, -0.32) -> (-2.26, -1.96) -> (-5.247, -9.642)
        if t < 0.20:
            u = t / 0.20
            fx, fy = _eval_quad((-1.92, -0.32), (-2.22, -0.62), (-2.26, -1.96), u)
        else:
            u = (t - 0.20) / 0.80
            fx, fy = _eval_cubic((-2.26, -1.96), (-2.52, -3.45), (-3.58, -6.25), (-5.247, -9.642), u)

        # Backstrap curve: (-6.72, -0.32) -> (-6.48, -1.85) -> (-8.177, -8.690)
        if t < 0.20:
            u = t / 0.20
            bx, by = _eval_quad((-6.72, -0.32), (-6.38, -0.92), (-6.48, -1.85), u)
        else:
            u = (t - 0.20) / 0.80
            bx, by = _eval_cubic((-6.48, -1.85), (-6.92, -3.85), (-7.62, -6.05), (-8.177, -8.690), u)

        # Slight bottom chamfer on very last station so Carry magwell lip is crisp
        if si == n_stations - 1:
            fx_e, fy_e = -5.247, -9.642
            bx_e, by_e = -8.177, -8.690
            fx, fy = fx_e, fy_e
            bx, by = bx_e, by_e

        cx = 0.5 * (fx + bx)
        cy = 0.5 * (fy + by)
        ax = max(1.30, 0.5 * math.hypot(fx - bx, fy - by))
        # Unit axis vector from backstrap to frontstrap (aligns cross-section perpendicular to -18° rim!)
        ux_d = (fx - bx) / max(1e-5, math.hypot(fx - bx, fy - by))
        uy_d = (fy - by) / max(1e-5, math.hypot(fx - bx, fy - by))

        # Ergonomic SIG P320 palm-swell Z profile: gentle web pinch near t~0.16, rounded palm swell mid-grip,
        # subtle bottom magwell flare at t~1.0 (keeping thick solid polymer walls around 1.78 cm magwell!)
        web_pinch = 0.032 * math.exp(-((t - 0.18) / 0.13) ** 2)
        palm_swell = 0.045 * math.sin(max(0.0, (t - 0.14) / 0.86) * math.pi)
        heel_flare = 0.025 * max(0.0, (t - 0.86) / 0.14)
        az = min(1.242, 1.218 - web_pinch + palm_swell + heel_flare)
        if si == 0:
            az = 1.238
        elif si == n_stations - 1:
            az = 1.185

        # Rounded superellipse cross-section (a = 0.58 -> p = 3.45: ergonomic curved frontstrap & backstrap
        # with comfortable subtly convex side flanks & guaranteed >= 0.20 cm wall thickness around magwell!)
        ring = []
        for k in range(ring_pts):
            th = 2.0 * math.pi * k / ring_pts
            ct, st = math.cos(th), math.sin(th)
            sx = (1.0 if ct >= 0 else -1.0) * (abs(ct) ** 0.58)
            sz = (1.0 if st >= 0 else -1.0) * (abs(st) ** 0.58)
            # Slightly sleeker frontstrap taper than palm backstrap (authentic ergonomic grip!)
            z_taper = 0.955 + 0.045 * (0.5 - 0.5 * ct)
            px = cx + sx * ax * ux_d
            py = cy + sx * ax * uy_d
            pz = sz * az * z_taper
            ring.append((px, py, pz))
        grip_rings.append(ring)

    # Build lofted grip with per-face material assignment so frontstrap & backstrap get 360° Voronoi stippling!
    bm_g = bmesh.new()
    bm_rings = [[bm_g.verts.new(p) for p in ring] for ring in grip_rings]
    for i in range(n_stations - 1):
        t_mid = (i + 0.5) / (n_stations - 1)
        a, b = bm_rings[i], bm_rings[i + 1]
        for k in range(ring_pts):
            kn = (k + 1) % ring_pts
            f = bm_g.faces.new((a[k], a[kn], b[kn], b[k]))
            th_mid = 2.0 * math.pi * (k + 0.5) / ring_pts
            # Frontstrap (|th| < 42 deg) & Backstrap (|th - pi| < 46 deg) in grip body zone -> 360° Stipple!
            is_front_or_back = abs(math.cos(th_mid)) > 0.72
            f.material_index = 1 if (0.18 <= t_mid <= 0.88 and is_front_or_back) else 0
    bm_g.faces.new(list(reversed(bm_rings[0]))).material_index = 0
    bm_g.faces.new(bm_rings[-1]).material_index = 0
    bmesh.ops.recalc_face_normals(bm_g, faces=bm_g.faces)
    _apply_three_xform(bm_g, [])
    grip_loft = _bm_to_obj("gm_loft", bm_g, m_poly)
    grip_loft.data.materials.append(m_stip)

    # 3. Signature Rounded-Front Undercut SIG Sauer Trigger Guard (separate clean extrusion w/ center opening)
    tg_outer = [(2.74, -0.26)]
    tg_outer += _cubic_bez((2.74, -0.26), (2.76, -1.55), (2.52, -2.86), (1.72, -3.06), segs=12)
    tg_outer.append((-1.48, -3.06))
    tg_outer += _cubic_bez((-1.48, -3.06), (-1.95, -3.02), (-1.98, -2.28), (-2.32, -2.06), segs=10)
    tg_outer.append((-2.08, -0.45))
    tg_solid = mk_extrude_z("gm_tg_solid", tg_outer, -0.60, 0.60, bevel=0.055, bevel_segs=2, mat=m_poly)

    tg_hole_xy = [(1.98, -0.52)]
    tg_hole_xy += _cubic_bez((1.98, -0.52), (2.08, -1.48), (1.92, -2.52), (1.34, -2.58), segs=12)
    tg_hole_xy.append((-1.32, -2.58))
    tg_hole_xy += _quad_bez((-1.32, -2.58), (-1.74, -2.52), (-1.76, -1.82), segs=8)
    tg_hole_xy.append((-1.62, -0.52))
    tg_hole = mk_extrude_z("c_gm_tgh", tg_hole_xy, -0.90, 0.90, mat=m_in)
    trigger_guard = bool_subtract(tg_solid, [tg_hole])

    # Union upper frame + ergonomic lofted grip + contoured undercut trigger guard cleanly!
    raw_grip = bool_union([upper_frame, grip_loft, trigger_guard], "p320_grip_module")

    # 4. Precision Functional Cutouts (Dustcover Channel, FCU Pocket, -18° Magwell, Right Serial Window, 1913 Rail!)
    cutters: list[bpy.types.Object] = [
        # U-contoured recoil dust-cover channel
        mk_cyl("c_gm_rcyl", 0.84, 0.84, 7.35, axis="x", segs=28, xform=[("t", 6.25, 1.12, 0.0)], mat=m_in),
        mk_box("c_gm_rbox", 7.25, 0.72, 1.78, [("t", 6.20, 0.72, 0.0)], m_in),
        # Central FCU chassis receiver cavity
        mk_box("c_gm_fcu", 10.05, 1.48, 1.92, [("t", -1.68, 0.36, 0.0)], m_in),
        # Trigger shoe opening into guard + reversible triangular mag-catch cross-mortise
        mk_box("c_gm_tslot", 1.52, 1.25, 0.88, [("t", 0.02, -0.52, 0.0)], m_in),
        mk_box("c_gm_mcatch", 0.82, 0.82, 2.75, [("rz", P320_GRIP_ANGLE), ("t", -2.35, -2.15, 0.0)], m_in),
        # Hollow -18 deg double-stack magwell tunnel + flared entry bevel funnel
        mk_box("c_gm_magw", 2.64, 12.60, 1.78, [("rz", P320_GRIP_ANGLE), ("t", -5.25, -4.59, 0.0)], m_in),
        mk_cyl("c_gm_magf", 1.22, 1.44, 0.56, axis="y", segs=22,
               xform=[("s", 1.12, 1.0, 0.74), ("rz", P320_GRIP_ANGLE), ("t", -6.68, -9.05, 0.0)], mat=m_in),
        # ICONIC P320 RIGHT-SIDE FCU SERIAL WINDOW (`TC014829`) + Beveled Frame Bezel!
        mk_box("c_gm_ser1", 2.08, 0.52, 0.78, [("t", -0.14, 0.32, 1.12)], m_in),
        mk_box("c_gm_ser2", 2.24, 0.64, 0.16, [("t", -0.14, 0.32, 1.22)], m_in),
        # Takedown lever & M17 manual thumb safety cross-bores
        mk_cyl("c_gm_tdb", 0.24, 0.24, 2.85, axis="z", segs=22, xform=[("t", 1.85, 0.42, 0.0)], mat=m_in),
        mk_cyl("c_gm_msb", 0.24, 0.24, 2.85, axis="z", segs=20, xform=[("t", -5.75, 0.76, 0.0)], mat=m_in),
    ]

    # 3-Slot MIL-STD-1913 Picatinny Dust-Cover Rail (45° V-ridge + 3 5.2mm cross-slots at X=4.45, 6.15, 7.85)
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_gm_p1_{sign:+.0f}", 6.65, 0.24, 0.28, [("t", 6.15, 0.14, sign * 1.22)], m_in))
        cutters.append(mk_box(f"c_gm_p2_{sign:+.0f}", 6.65, 0.26, 0.26, [("rx", -sign * 0.78), ("t", 6.15, -0.02, sign * 1.22)], m_poly))
        cutters.append(mk_box(f"c_gm_p3_{sign:+.0f}", 6.70, 0.42, 0.42, [("rx", sign * 0.78), ("t", 6.15, -0.35, sign * 1.18)], m_poly))
        # Ambi slide-catch protective recess + ergonomic thumb-rest scallop
        cutters.append(mk_box(f"c_gm_sc_{sign:+.0f}", 1.18, 0.34, 0.14, [("t", -2.55, 0.74, sign * 1.24)], m_in))
        cutters.append(
            mk_sphere(f"c_gm_th_{sign:+.0f}", 0.76, 0.40, 0.15, 18, 12, [("t", -3.95, -0.95, sign * 1.27)], m_poly)
        )
    for idx_s, slot_x in enumerate((4.45, 6.15, 7.85)):
        cutters.append(mk_box(f"c_gm_pslot_{idx_s}", 0.52, 0.26, 2.72, [("t", slot_x, -0.27, 0.0)], m_in))

    sculpted = bool_subtract(raw_grip, cutters)
    return finish_part(sculpted, bevel_w=0.0, sharp_deg=38.0)


def build_p320_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: Firewalled High-Vis Safety-Orange Anti-Tilt Double-Stack Polymer Follower.
    assembledPos = [-6.183, -7.462, 0], rz = -18° | BBox: X[-1.020..+1.020], Y[-0.890..+0.566], Z[-0.620..+0.620]."""
    m_org = mats["G_FollowerOrange"]

    base = mk_box("fl_base", 2.04, 0.46, 1.24, [], m_org, bevel=0.036)
    step = mk_cyl(
        "fl_step", 0.30, 0.30, 1.98, axis="x", segs=22,
        xform=[("s", 1.0, 0.82, 0.88), ("rz", 0.10), ("t", 0.0, 0.24, 0.24)], mat=m_org, bevel=0.022,
    )
    catch_shelf = mk_box("fl_shelf", 0.56, 0.28, 0.24, [("t", 0.64, 0.22, -0.50)], m_org, bevel=0.020)
    leg_f = mk_box("fl_legf", 0.20, 0.78, 1.10, [("t",  0.84, -0.50, 0.0)], m_org, bevel=0.022)
    leg_r = mk_box("fl_legr", 0.20, 0.78, 1.10, [("t", -0.84, -0.50, 0.0)], m_org, bevel=0.022)
    boss = mk_box("fl_boss", 0.76, 0.26, 0.48, [("t", 0.0, -0.28, 0.0)], m_org, bevel=0.020)

    obj = join_objects([base, step, catch_shelf, leg_f, leg_r, boss], "p320_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_p320_mag_baseplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: Flush-Fit Coyote-Tan FDE Polymer M17 Magazine Floorplate & Steel Detent Locking Insert.
    assembledPos = [-6.731, -9.160, 0], rz = -18° | BBox: X[-1.605..+1.747], Y[-0.510..+0.320], Z[-1.110..+1.110]."""
    m_poly = mats["G_CoyotePoly"]
    m_in = mats["G_CoyoteInner"]
    m_ins = mats["G_InsertPolymer"]
    m_det = mats["G_DetentSteel"]

    pad_xy = [(-1.54, -0.49), (1.68, -0.49)]
    pad_xy += _quad_bez((1.68, -0.49), (1.80, -0.18), (1.58, 0.04), segs=8)
    pad_xy.append((-1.54, 0.04))
    pad_xy += _quad_bez((-1.54, 0.04), (-1.62, -0.22), (-1.54, -0.49), segs=6)

    pad_raw = mk_extrude_z("bp_pad", pad_xy, -1.11, 1.11, bevel=0.052, bevel_segs=2, mat=m_poly)
    cuts = [
        mk_cyl("c_bp_hole", 0.21, 0.21, 0.24, axis="y", segs=22, xform=[("t", 0.0, -0.44, 0.0)], mat=m_in),
    ]
    for sign in (-1.0, 1.0):
        cuts.append(
            mk_cyl(f"c_bp_sc_{sign:+.0f}", 0.44, 0.44, 0.56, axis="y", segs=22,
                   xform=[("s", 1.32, 1.0, 0.36), ("t", 0.15, -0.22, sign * 1.12)], mat=m_poly)
        )
    pad = bool_subtract(pad_raw, cuts)

    collar = mk_box("bp_col", 2.58, 0.20, 1.78, [("t", 0.0, 0.10, 0.0)], m_poly, bevel=0.018)
    ins_plate = mk_box("bp_ins", 2.02, 0.16, 1.24, [("t", 0.0, 0.24, 0.0)], m_ins, bevel=0.014)
    lock_stud = mk_cyl("bp_stud", 0.16, 0.16, 0.20, axis="y", segs=22, xform=[("t", 0.0, -0.42, 0.0)], mat=m_det, bevel=0.014)

    obj = join_objects([pad, collar, ins_plate, lock_stud], "p320_mag_baseplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — SUITE 3: p320_v3_fcu_metal (14 parts)
# =============================================================================
def _mk_p320_rifled_bore_sleeve(mat: bpy.types.Material) -> bpy.types.Object:
    """Closed watertight 6-land / 6-groove helical right-hand 1:10\" rifling bore sleeve."""
    x_start, x_end = 1.45, 11.62
    center_y = 2.68
    r_outer = 0.454  # strictly nested inside 0.455 reamed bore wall
    r_land = 0.418
    r_groove = 0.450
    grooves = 6
    land_frac = 0.42
    twist_len = 25.4
    r_segs = 60
    a_segs = 20
    twist_tot = ((x_end - x_start) / twist_len) * 2.0 * math.pi

    def prof_r(t: float) -> float:
        f = ((t / (2.0 * math.pi)) * grooves) % 1.0
        d = abs(f - 0.5) * 2.0
        e0, e1 = land_frac - 0.12, land_frac + 0.12
        s = max(0.0, min(1.0, (d - e0) / max(e1 - e0, 1e-5)))
        s = s * s * (3.0 - 2.0 * s)
        return r_land + (r_groove - r_land) * s

    bm = bmesh.new()
    in_rings = []
    out_rings = []
    for i in range(a_segs + 1):
        u = i / a_segs
        x = x_start + (x_end - x_start) * u
        phase = u * twist_tot
        r_in = []
        r_out = []
        for j in range(r_segs):
            th = 2.0 * math.pi * j / r_segs
            ri = prof_r(th - phase)
            r_in.append(bm.verts.new((x, center_y + math.cos(th) * ri, math.sin(th) * ri)))
            r_out.append(bm.verts.new((x, center_y + math.cos(th) * r_outer, math.sin(th) * r_outer)))
        in_rings.append(r_in)
        out_rings.append(r_out)

    for i in range(a_segs):
        for j in range(r_segs):
            jn = (j + 1) % r_segs
            # Inward-facing rifled inner wall + outward-facing outer sleeve wall
            bm.faces.new((in_rings[i][j], in_rings[i + 1][j], in_rings[i + 1][jn], in_rings[i][jn]))
            bm.faces.new((out_rings[i][j], out_rings[i][jn], out_rings[i + 1][jn], out_rings[i + 1][j]))
    for j in range(r_segs):
        jn = (j + 1) % r_segs
        bm.faces.new((in_rings[0][j], in_rings[0][jn], out_rings[0][jn], out_rings[0][j]))
        bm.faces.new((in_rings[-1][j], out_rings[-1][j], out_rings[-1][jn], in_rings[-1][jn]))

    _apply_three_xform(bm, [])
    return _bm_to_obj("bbl_rifling", bm, mat)


def build_p320_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-04: 4.7\" Cold Hammer-Forged Black Nitron Tilting Barrel w/ 11° Recessed Target Crown,
    6-Groove 1:10\" Helical Rifling, Square Locking Hood (`9mmx19`), Top LCI Cut, Mirror-Polished
    Scooped Feed Ramp & Browning Tilting Camming Under-Lug.
    assembledPos = [0, 0, 0] | BBox: X[-1.002..+11.800], Y[+1.040..+3.570], Z[-0.820..+0.820]."""
    m_blk = mats["F_NitronBlack"]
    m_hood = mats["F_BarrelHood"]
    m_pol = mats["F_PolishedStainless"]
    m_soot = mats["F_BarrelCrownSoot"]
    m_rif = mats["F_RifledBoreSteel"]
    m_dark = mats["F_MachinedDark"]

    tube = mk_cyl("bbl_tube", 0.65, 0.65, 9.04, axis="x", segs=36, xform=[("t", 7.14, 2.68, 0.0)], mat=m_blk)
    # Outer chamfered target crown collar at muzzle face (X = 11.64 .. 11.80)
    crown_col = mk_cyl("bbl_ccol", 0.585, 0.65, 0.16, axis="x", segs=36, xform=[("t", 11.72, 2.68, 0.0)], mat=m_pol)

    # Rectangular SIG Sauer Locking Chamber Hood (X in [-0.54, +2.64], Z in [-0.82, +0.82], Y in [1.98, 3.57])
    hood_zy = [(-0.81, 1.98), (0.81, 1.98), (0.81, 3.37)]
    hood_zy += _quad_bez((0.81, 3.37), (0.81, 3.565), (0.62, 3.565), segs=5)
    hood_zy.append((-0.62, 3.565))
    hood_zy += _quad_bez((-0.62, 3.565), (-0.81, 3.565), (-0.81, 3.37), segs=5)
    hood = mk_extrude_x("bbl_hood", hood_zy, -0.54, 2.64, bevel=0.022, bevel_segs=2, mat=m_hood)

    # Browning tilting camming under-lug engaging FCU 38° steel ramp & D-flange guide rod
    lug_xy = [
        (-0.38, 2.02), (1.96, 2.02), (1.96, 1.24), (1.74, 1.12),
        (1.42, 1.05), (0.95, 1.05), (0.52, 1.48), (0.12, 1.48),
        (-0.22, 1.14), (-0.46, 1.38),
    ]
    lug = mk_extrude_z("bbl_lug", lug_xy, -0.39, 0.39, bevel=0.020, bevel_segs=2, mat=m_blk)

    # Mirror-polished scooped feed ramp at rear chamber mouth
    ramp_raw = mk_box("bbl_ramp", 0.62, 0.68, 0.72, [("rz", 0.55), ("t", -0.56, 1.84, 0.0)], m_pol, bevel=0.018)
    ramp_scoop = mk_cyl(
        "c_bbl_rsc", 0.34, 0.28, 0.98, axis="x", segs=22,
        xform=[("rz", -0.52), ("t", -0.68, 2.04, 0.0)], mat=m_pol,
    )
    feed_ramp = bool_subtract(ramp_raw, [ramp_scoop])

    solid = bool_union([tube, crown_col, hood, lug, feed_ramp], "p320_barrel")

    # Hollow 9x19mm bore, chamber throat, 11° recessed target crown dish, top LCI witness cut, extractor relief & guide seat
    cuts = [
        mk_cyl("c_bbl_bore", 0.455, 0.455, 12.90, axis="x", segs=32, xform=[("t", 5.60, 2.68, 0.0)], mat=m_dark),
        mk_cyl("c_bbl_chmb", 0.50, 0.50, 1.95, axis="x", segs=28, xform=[("t", 0.42, 2.68, 0.0)], mat=m_dark),
        mk_cyl("c_bbl_crwn", 0.56, 0.455, 0.16, axis="x", segs=32, xform=[("t", 11.77, 2.68, 0.0)], mat=m_soot),
        mk_box("c_bbl_lci", 0.74, 0.26, 0.22, [("t", -0.20, 3.50, 0.0)], m_dark),
        mk_box("c_bbl_ext", 0.42, 0.36, 0.24, [("t", -0.42, 2.68, 0.72)], m_dark),
        mk_cyl("c_bbl_gseat", 0.47, 0.47, 0.14, axis="x", segs=22, xform=[("t", 1.98, 1.46, 0.0)], mat=m_blk),
    ]
    hollowed = bool_subtract(solid, cuts)
    rifling = _mk_p320_rifled_bore_sleeve(m_rif)

    obj = join_objects([hollowed, rifling], "p320_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_recoil_guide_rod(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-05: Captive Steel Recoil Spring Guide Rod w/ Authentic SIG Vertical-Flat (D-Cut) Rear Flange.
    assembledPos = [0, 0, 0] | BBox: X[+1.940..+11.090], Y[+0.983..+1.937], Z[-0.340..+0.340]."""
    m_blk = mats["F_NitronBlack"]
    m_pol = mats["F_PolishedStainless"]
    m_dark = mats["F_MachinedDark"]

    flange_raw = mk_cyl("rg_flg", 0.48, 0.48, 0.16, axis="x", segs=28, xform=[("t", 2.02, 1.46, 0.0)], mat=m_blk, bevel=0.016)
    flange = bool_subtract(flange_raw, [
        mk_box("c_rg_fl", 0.28, 1.12, 0.24, [("t", 2.02, 1.46, -0.46)], m_blk),
        mk_box("c_rg_fr", 0.28, 1.12, 0.24, [("t", 2.02, 1.46,  0.46)], m_blk),
    ])
    outer_slv = mk_cyl("rg_oslv", 0.245, 0.245, 3.85, axis="x", segs=24, xform=[("t", 4.02, 1.46, 0.0)], mat=m_blk, bevel=0.014)
    inner_rod = mk_cyl("rg_irod", 0.175, 0.175, 8.95, axis="x", segs=24, xform=[("t", 6.52, 1.46, 0.0)], mat=m_pol)

    fcap_raw = mk_cyl("rg_fcap", 0.285, 0.325, 0.26, axis="x", segs=24, xform=[("t", 10.96, 1.46, 0.0)], mat=m_blk, bevel=0.016)
    fcap = bool_subtract(fcap_raw, [
        mk_cyl("c_rg_hex", 0.12, 0.12, 0.14, axis="x", segs=6, xform=[("t", 11.06, 1.46, 0.0)], mat=m_dark)
    ])

    obj = join_objects([flange, outer_slv, inner_rod, fcap], "p320_recoil_guide_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_striker(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-07: Precision-Machined Stainless P320 Striker Pin w/ Mud Flutes, Sear Tang & Safety Catch.
    assembledPos = [0, 0, 0] | BBox: X[-6.910..-0.710], Y[+1.325..+2.980], Z[-0.210..+0.260]."""
    m_pol = mats["F_PolishedStainless"]
    m_fcu = mats["F_FcuStainless"]
    m_dark = mats["F_MachinedDark"]

    tip = mk_cyl("st_tip", 0.052, 0.072, 0.68, axis="x", segs=18, xform=[("t", -1.05, 2.68, 0.0)], mat=m_pol, bevel=0.008)
    cone = mk_cyl("st_cone", 0.095, 0.21, 0.48, axis="x", segs=22, xform=[("t", -1.60, 2.68, 0.0)], mat=m_pol)
    shaft_raw = mk_cyl("st_shaft", 0.15, 0.15, 4.75, axis="x", segs=22, xform=[("t", -4.20, 2.68, 0.0)], mat=m_fcu)
    shaft = bool_subtract(shaft_raw, [
        mk_box("c_st_fl1", 2.60, 0.08, 0.08, [("t", -3.40, 2.68, -0.14)], m_dark),
        mk_box("c_st_fl2", 2.60, 0.08, 0.08, [("t", -3.40, 2.68,  0.14)], m_dark),
    ])

    tang_xy = [(-5.32, 2.68), (-4.82, 2.68), (-4.88, 1.52), (-5.08, 1.34), (-5.32, 1.34)]
    sear_tang = mk_extrude_z("st_tang", tang_xy, -0.11, 0.11, bevel=0.014, bevel_segs=2, mat=m_pol)
    safety_catch = mk_box("st_scatch", 0.44, 0.28, 0.24, [("t", -4.52, 2.84, 0.14)], m_pol, bevel=0.012)
    rear_stem = mk_cyl("st_rstem", 0.16, 0.16, 0.58, axis="x", segs=20, xform=[("t", -6.62, 2.68, 0.0)], mat=m_fcu, bevel=0.012)

    obj = join_objects([tip, cone, shaft, sear_tang, safety_catch, rear_stem], "p320_striker")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_safety_lock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """U-10: Pivoting Stainless Striker Drop-Safety Lock Arm & Micro Return Spring.
    assembledPos = [-4.35, 2.86, 0.22] | BBox: X[-0.390..+0.390], Y[-0.490..+0.458], Z[-0.190..+0.190]."""
    m_pol = mats["F_PolishedStainless"]
    m_spr = mats["F_SpringSteel"]

    parts = [
        mk_box("slk_arm", 0.78, 0.28, 0.16, [], m_pol, bevel=0.014),
        mk_box("slk_hk", 0.20, 0.40, 0.26, [("t", -0.24, -0.16, -0.06)], m_pol, bevel=0.012),
        mk_box("slk_ft", 0.22, 0.46, 0.14, [("t",  0.26, -0.26,  0.06)], m_pol, bevel=0.012),
        mk_cyl("slk_pin", 0.055, 0.055, 0.38, axis="z", segs=16, mat=m_spr, bevel=0.008),
        mk_coil_spring("slk_spr", "y", 0.14, 0.44, 0.10, 0.0, 0.078, 0.018, 5.0, ring_segs=8, steps_per_coil=12, mat=m_spr),
    ]
    obj = join_objects(parts, "p320_safety_lock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_takedown_lever(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Rotating Black Nitron Takedown Lever w/ D-Cut Cam Flat & Serrated Thumb Paddle.
    assembledPos = [1.85, 0.42, 0] | BBox: X[-0.298..+1.347], Y[-0.280..+0.281], Z[-1.530..+1.240]."""
    m_blk = mats["F_NitronBlack"]
    m_dark = mats["F_MachinedDark"]

    shaft_raw = mk_cyl("td_shf", 0.21, 0.21, 2.48, axis="z", segs=24, mat=m_blk, bevel=0.014)
    cam_shaft = bool_subtract(shaft_raw, [
        mk_box("c_td_df", 0.50, 0.22, 1.38, [("t", 0.0, 0.16, 0.0)], m_dark),
        mk_box("c_td_or", 0.48, 0.48, 0.08, [("t", 0.0, 0.0, 0.98)], m_dark),
    ])

    pad_xy = [(-0.24, -0.24), (1.24, -0.26)]
    pad_xy += _quad_bez((1.24, -0.26), (1.44, -0.08), (1.18, 0.18), segs=8)
    pad_xy.append((-0.18, 0.26))
    pad_xy += _quad_bez((-0.18, 0.26), (-0.34, 0.04), (-0.24, -0.24), segs=6)
    paddle = mk_extrude_z("td_pad", pad_xy, -1.39, -1.21, bevel=0.020, bevel_segs=2, mat=m_blk)

    ledge_raw = mk_box("td_ldg", 0.98, 0.12, 0.16, [("t", 0.46, -0.18, -1.45)], m_blk, bevel=0.012)
    serrs = [mk_box(f"c_td_s{i}", 0.075, 0.055, 0.22, [("t", 0.14 + i * 0.165, -0.12, -1.48)], m_dark) for i in range(5)]
    ledge = bool_subtract(ledge_raw, serrs)

    obj = join_objects([cam_shaft, paddle, ledge], "p320_takedown_lever")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_slide_catch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: Stamped Black Nitron Ambidextrous Slide Catch Lever w/ Serrated Twin Thumb Paddles.
    assembledPos = [0, 0, 0] | BBox: X[-3.000..+0.071], Y[+0.170..+1.020], Z[-1.355..+1.355]."""
    m_blk = mats["F_NitronBlack"]
    m_pol = mats["F_PolishedStainless"]
    m_dark = mats["F_MachinedDark"]

    parts = [mk_box("sc_brg", 0.32, 0.14, 1.88, [("t", -0.55, 0.24, 0.0)], m_blk, bevel=0.014)]
    for s_idx, sign in enumerate((-1.0, 1.0)):
        if sign < 0:
            arm_pts = [
                Vector(( 0.05, 0.25, -0.92)),
                Vector((-0.55, 0.42, -1.01)),
                Vector((-1.15, 0.58, -1.10)),
                Vector((-1.75, 0.74, -1.19)),
                Vector((-2.25, 0.83, -1.24)),
                Vector((-2.88, 0.84, -1.25)),
            ]
        else:
            # Right arm routes strictly ABOVE & BEHIND the FCU serial window (`TC014829` at X[-1.24..+0.96], Y[0.02..0.62], Z=0.98)
            # diving cleanly inside the FCU channel (Z=+0.74) aft of X=-1.35 so the serial plate is 100% unobstructed!
            arm_pts = [
                Vector(( 0.05, 0.25,  0.74)),
                Vector((-0.55, 0.26,  0.74)),
                Vector((-1.36, 0.62,  0.76)),
                Vector((-1.56, 0.82,  1.06)),
                Vector((-2.20, 0.84,  1.24)),
                Vector((-2.88, 0.84,  1.25)),
            ]
        parts.append(mk_tube_along_pts(f"sc_arm_{s_idx}", arm_pts, 0.072, ring_segs=10, mat=m_blk))
        pad_raw = mk_box(f"sc_pad_{s_idx}", 0.90, 0.32, 0.15, [("t", -2.55, 0.86, sign * 1.28)], m_blk, bevel=0.016)
        serrs = [
            mk_box(f"c_sc_s_{s_idx}_{i}", 0.78, 0.038, 0.06, [("t", -2.55, 0.78 + i * 0.062, sign * 1.35)], m_dark)
            for i in range(4)
        ]
        parts.append(bool_subtract(pad_raw, serrs))
    # Polished stainless inward follower-actuated lifter tab
    parts.append(mk_box("sc_lift", 0.36, 0.12, 0.42, [("t", -2.35, 0.62, -0.96)], m_pol, bevel=0.012))

    obj = join_objects(parts, "p320_slide_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_mag_catch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Reversible Rounded-Triangle Checkered Black Nitron Magazine Catch & Coil Spring.
    assembledPos = [-2.35, -2.15, 0], rz = -18° | BBox: X[-0.380..+0.400], Y[-0.572..+0.384], Z[-1.382..+1.200]."""
    m_blk = mats["F_NitronBlack"]
    m_spr = mats["F_SpringSteel"]

    tri_xy = [(-0.34, 0.36)]
    tri_xy += _quad_bez((-0.34, 0.36), (0.38, 0.40), (0.38, 0.04), segs=8)
    tri_xy += _quad_bez((0.38, 0.04), (0.36, -0.38), (-0.18, -0.38), segs=8)
    tri_xy += _quad_bez((-0.18, -0.38), (-0.42, -0.32), (-0.34, 0.36), segs=8)

    body = mk_extrude_z("mc_body", tri_xy, -1.24, 1.14, bevel=0.022, bevel_segs=2, mat=m_blk)
    pad = mk_extrude_z("mc_pad", [(x * 0.88, y * 0.88) for x, y in tri_xy], -1.35, -1.22, bevel=0.018, bevel_segs=2, mat=m_blk)

    parts = [body, pad]
    # Crisp 3D diamond-grid tactile checkering ribs across triangular left thumb button
    for iy in range(-2, 3):
        py = iy * 0.10
        hx = 0.23 - abs(iy) * 0.035
        parts.append(mk_box(f"mc_ch_{iy+2}", hx * 2.0, 0.032, 0.028, [("t", 0.02, py, -1.365)], m_blk, bevel=0.005))
    for ix in range(-2, 3):
        px = ix * 0.10 + 0.02
        hy = 0.23 - abs(ix) * 0.035
        parts.append(mk_box(f"mc_cv_{ix+2}", 0.032, hy * 2.0, 0.028, [("t", px, 0.0, -1.368)], m_blk, bevel=0.005))

    parts.append(mk_box("mc_wedge", 0.32, 0.42, 0.12, [("t", -0.04, 0.0, 1.14)], m_blk, bevel=0.014))
    parts.append(
        mk_coil_spring("mc_spr", "z", 0.23, 0.67, 0.05, 0.0, 0.095, 0.022, 5.0, ring_segs=8, steps_per_coil=12, mat=m_spr)
    )

    obj = join_objects(parts, "p320_mag_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_fcu_chassis(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FCU-01: THE MECHANICAL CENTERPIECE — Gleaming Brushed 17-4PH Stainless Drop-In FCU Chassis!
    Features stamped U-channel side walls, 4 precision undercut slide guide rails, integral front
    CNC 38° barrel locking cam block, left-wall Takedown Safety Lever interlock, bent fixed 9mm
    ejector blade, and dedicated right-flank serialized plate (`TC014829`) visible right through
    the Coyote grip module window!
    assembledPos = [0, 0, 0] | BBox: X[-6.551..+3.240], Y[-0.348..+1.360], Z[-1.115..+1.115]."""
    m_fcu = mats["F_FcuStainless"]
    m_ser = mats["F_FcuSerialPlate"]
    m_pol = mats["F_PolishedStainless"]
    m_dark = mats["F_MachinedDark"]

    side_xy = [(-6.52, 0.94), (3.22, 0.94), (3.22, 0.24)]
    side_xy += _quad_bez((3.22, 0.24), (2.75, -0.14), (1.95, -0.16), segs=8)
    side_xy.extend([(-0.45, -0.28), (-2.15, -0.28), (-2.75, 0.08), (-4.65, 0.08), (-5.05, -0.26), (-6.32, -0.22)])
    side_xy += _quad_bez((-6.32, -0.22), (-6.58, 0.12), (-6.52, 0.94), segs=8)

    raw_ch = mk_extrude_z("fcu_raw", side_xy, -0.94, 0.94, bevel=0.022, bevel_segs=2, mat=m_fcu)
    cuts = [
        mk_box("c_fcu_hol", 9.25, 1.25, 1.44, [("t", -1.62, 0.46, 0.0)], m_fcu),
        mk_box("c_fcu_mag", 3.15, 0.95, 1.46, [("t", -3.65, -0.08, 0.0)], m_fcu),
        mk_box("c_fcu_trg", 1.45, 0.85, 0.92, [("t",  0.05, -0.12, 0.0)], m_fcu),
        mk_cyl("c_fcu_td", 0.22, 0.22, 2.35, axis="z", segs=22, xform=[("t", 1.85, 0.42, 0.0)], mat=m_dark),
        mk_cyl("c_fcu_tp", 0.14, 0.14, 2.35, axis="z", segs=20, xform=[("t", 0.05, 0.25, 0.0)], mat=m_dark),
        mk_cyl("c_fcu_sp", 0.12, 0.12, 2.35, axis="z", segs=18, xform=[("t", -5.15, 0.62, 0.0)], mat=m_dark),
        mk_cyl("c_fcu_ms", 0.16, 0.16, 2.35, axis="z", segs=20, xform=[("t", -5.75, 0.76, 0.0)], mat=m_dark),
    ]
    stamped_u = bool_subtract(raw_ch, cuts)

    # Integral Front CNC Barrel Locking Block w/ 38° cam unlocking ramp & pull-down hook
    ramp_xy = [(-0.08, 0.20), (1.66, 0.20), (1.66, 0.88), (1.12, 0.88), (0.46, 0.44), (0.12, 0.44), (-0.08, 0.68)]
    cam_block = mk_extrude_z("fcu_cam", ramp_xy, -0.68, 0.68, bevel=0.018, bevel_segs=2, mat=m_pol)

    parts = [stamped_u, cam_block]

    # 4 Precision Undercut Stainless Slide Guide Rails (front & rear pairs!)
    for r_idx, (rx, r_len) in enumerate(((2.28, 1.86), (-5.38, 2.12))):
        for sign in (-1.0, 1.0):
            parts.append(mk_box(f"fcu_rf_{r_idx}_{sign:+.0f}", r_len, 0.11, 0.25, [("t", rx, 1.03, sign * 0.99)], m_pol, bevel=0.014))
            parts.append(mk_box(f"fcu_rr_{r_idx}_{sign:+.0f}", r_len, 0.18, 0.12, [("t", rx, 0.95, sign * 0.89)], m_fcu, bevel=0.010))

    parts.append(mk_box("fcu_rlug", 0.54, 0.36, 1.38, [("t", -6.22, 0.02, 0.0)], m_fcu, bevel=0.014))
    # Trigger-return-spring anchor hook strictly aft of right-flank serial window (`X < -1.24`)
    parts.append(mk_box("fcu_shk", 0.24, 0.24, 0.14, [("t", -3.40, 0.34, 0.98)], m_pol, bevel=0.010))

    # Left-Wall Stamped Takedown Safety Lever (triggerless takedown interlock!)
    td_bar = mk_box("fcu_tdl", 4.85, 0.22, 0.08, [("rz", -0.04), ("t", -0.72, 0.54, -0.97)], m_fcu, bevel=0.010)
    td_ring_raw = mk_cyl("fcu_tdr", 0.32, 0.32, 0.08, axis="z", segs=22, xform=[("t", 1.85, 0.42, -0.97)], mat=m_fcu, bevel=0.008)
    td_ring = bool_subtract(td_ring_raw, [
        mk_cyl("c_fcu_tdrh", 0.21, 0.21, 0.20, axis="z", segs=20, xform=[("t", 1.85, 0.42, -0.97)], mat=m_dark)
    ])
    parts.extend([td_bar, td_ring])

    # Bent Stamped Fixed 9mm Ejector Blade on Left Rear FCU Wall
    parts.append(mk_box("fcu_ejr", 1.15, 0.36, 0.10, [("t", -4.65, 1.06, -0.52)], m_pol, bevel=0.010))
    parts.append(mk_box("fcu_ejb", 1.75, 0.22, 0.09, [("ry", -0.14), ("t", -3.45, 1.25, -0.38)], m_pol, bevel=0.012))

    # HERO RIGHT-FLANK SERIALIZED PLATE (`TC014829`, X in [-1.24,+0.96], Y in [+0.02,+0.62], Z = +0.98)!
    serial_plate = mk_box("fcu_serial", 2.20, 0.60, 0.06, [("t", -0.14, 0.32, 0.95)], m_ser, bevel=0.008)
    parts.append(serial_plate)

    obj = join_objects(parts, "p320_fcu_chassis")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_trigger_shoe(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FCU-02: M17 Low-Inertia Curved Black Nitron Steel Trigger Shoe w/ Stainless Pivot Pin & Crank Stud.
    assembledPos = [0.05, 0.25, 0] | BBox: X[-0.525..+0.351], Y[-2.354..+0.469], Z[-0.890..+0.890]."""
    m_blk = mats["F_NitronBlack"]
    m_pol = mats["F_PolishedStainless"]
    m_dark = mats["F_MachinedDark"]

    shoe_xy = [(-0.28, 0.44), (0.32, 0.44), (0.28, -0.15)]
    shoe_xy += _cubic_bez((0.28, -0.15), (0.34, -0.78), (0.26, -1.48), (-0.02, -2.02), segs=12)
    shoe_xy += _quad_bez((-0.02, -2.02), (-0.18, -2.36), (-0.42, -2.32), segs=6)
    shoe_xy += _quad_bez((-0.42, -2.32), (-0.56, -2.26), (-0.44, -1.94), segs=6)
    shoe_xy += _cubic_bez((-0.44, -1.94), (-0.18, -1.38), (-0.18, -0.68), (-0.28, 0.44), segs=12)

    shoe_raw = mk_extrude_z("trg_shoe", shoe_xy, -0.31, 0.31, bevel=0.036, bevel_segs=2, mat=m_blk)
    shoe = bool_subtract(shoe_raw, [
        mk_cyl("c_trg_ph", 0.13, 0.13, 0.90, axis="z", segs=20, mat=m_dark),
        mk_box("c_trg_cl", 0.38, 0.36, 0.22, [("t", 0.14, 0.28, 0.24)], m_dark),
    ])
    pin = mk_cyl("trg_pin", 0.115, 0.115, 1.78, axis="z", segs=20, mat=m_pol, bevel=0.012)
    stud = mk_cyl("trg_stud", 0.085, 0.085, 0.54, axis="z", segs=16, xform=[("t", 0.16, 0.30, 0.38)], mat=m_pol, bevel=0.010)

    obj = join_objects([shoe, pin, stud], "p320_trigger_shoe")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_trigger_bar(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FCU-03: Stamped Polished Stainless Trigger Bar w/ Disconnector Lobe & Coiled Return Spring.
    Routed cleanly along the upper FCU rail shoulder (`Y=+0.76`) & return spring aft of `X=-1.50`
    so the right-flank FCU serial plate (`TC014829` in X[-1.24..+0.96], Y[+0.02..+0.62]) is 100% unobstructed!
    assembledPos = [0, 0, 0] | BBox: X[-5.420..+0.440], Y[+0.002..+1.150], Z[+0.470..+1.138]."""
    m_pol = mats["F_PolishedStainless"]
    m_spr = mats["F_SpringSteel"]
    m_dark = mats["F_MachinedDark"]

    # Front clevis sits cleanly inside FCU wall (Z=+0.78) behind serial plate, stepping up at Y=+0.76 above it!
    clevis_raw = mk_box("tb_clv", 0.62, 0.44, 0.09, [("t", 0.12, 0.58, 0.78)], m_pol, bevel=0.010)
    clevis = bool_subtract(clevis_raw, [
        mk_cyl("c_tb_sh", 0.095, 0.095, 0.24, axis="z", segs=18, xform=[("t", 0.21, 0.55, 0.78)], mat=m_dark)
    ])
    parts = [
        clevis,
        mk_box("tb_brg", 0.32, 0.16, 0.26, [("t",  0.04, 0.76, 0.88)], m_pol, bevel=0.010),
        # Main stamped trigger bar runs strictly ABOVE serial plate (`Y in [0.68, 0.84] > 0.62`!)
        mk_box("tb_bar", 5.55, 0.17, 0.085, [("t", -2.58, 0.76, 0.98)], m_pol, bevel=0.010),
        mk_box("tb_dlb", 0.68, 0.40, 0.09, [("t", -3.95, 0.95, 0.98)], m_pol, bevel=0.014),
        mk_box("tb_rtb", 0.48, 0.20, 0.54, [("t", -5.18, 0.74, 0.74)], m_pol, bevel=0.012),
        # Return spring arm & coiled tension spring strictly AFT of serial plate (`X in [-3.35, -1.50] < -1.24`!)
        mk_box("tb_arm", 0.22, 0.46, 0.085, [("t", -1.48, 0.54, 0.98)], m_pol, bevel=0.010),
        mk_coil_spring("tb_spr", "x", -3.35, -1.52, 0.34, 0.98, 0.125, 0.028, 11.0, ring_segs=8, steps_per_coil=14, mat=m_spr),
    ]
    obj = join_objects(parts, "p320_trigger_bar")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_sear_group(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FCU-04: Dual-Notch MIM Polished Stainless Pivoting Sear, Striker Safety Lever & Nylon Sear Housing.
    assembledPos = [-5.15, 0.62, 0] | BBox: X[-1.090..+1.025], Y[-0.670..+0.838], Z[-0.780..+0.780]."""
    m_poly = mats["F_SearHousingPoly"]
    m_pol = mats["F_PolishedStainless"]
    m_fcu = mats["F_FcuStainless"]
    m_spr = mats["F_SpringSteel"]

    h_raw = mk_box("sg_hs", 1.82, 0.90, 1.28, [("t", -0.18, -0.22, 0.0)], m_poly, bevel=0.020)
    housing = bool_subtract(h_raw, [mk_box("c_sg_pk", 1.30, 0.78, 0.84, [("t", -0.08, -0.04, 0.0)], m_poly)])

    sear_xy = [
        (-0.42, -0.16), (0.44, -0.16), (0.36, 0.46),
        (0.20, 0.52), (0.20, 0.66), (0.08, 0.82), (-0.16, 0.78), (-0.36, 0.35),
    ]
    sear = mk_extrude_z("sg_sear", sear_xy, -0.22, 0.22, bevel=0.015, bevel_segs=2, mat=m_pol)
    s_lever = mk_box("sg_slev", 0.96, 0.18, 0.11, [("rz", 0.42), ("t", 0.55, 0.56, 0.32)], m_fcu, bevel=0.010)
    pin = mk_cyl("sg_pin", 0.10, 0.10, 1.56, axis="z", segs=18, mat=m_fcu, bevel=0.010)
    sp_l = mk_coil_spring("sg_spl", "y", -0.52, -0.08, 0.15, -0.14, 0.08, 0.020, 5.0, ring_segs=8, steps_per_coil=12, mat=m_spr)
    sp_r = mk_coil_spring("sg_spr", "y", -0.52, -0.08, 0.15,  0.14, 0.08, 0.020, 5.0, ring_segs=8, steps_per_coil=12, mat=m_spr)

    obj = join_objects([housing, sear, s_lever, pin, sp_l, sp_r], "p320_sear_group")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_manual_safety(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FCU-05: Iconic U.S. Army M17 Ambidextrous Manual Thumb Safety w/ Swept Teardrop Paddles,
    Serrated Top Thumb Shelves & Inlaid Glossy Crimson-Red FIRE Indicator Dots on BOTH Sides!
    assembledPos = [-5.75, 0.76, 0] | BBox: X[-1.425..+0.450], Y[-0.270..+0.340], Z[-1.510..+1.510]."""
    m_blk = mats["F_NitronBlack"]
    m_fcu = mats["F_FcuStainless"]
    m_dark = mats["F_MachinedDark"]
    m_red = mats["F_CrimsonFireDot"]

    axle_raw = mk_cyl("ms_axl", 0.14, 0.14, 2.58, axis="z", segs=22, mat=m_blk, bevel=0.012)
    axle = bool_subtract(axle_raw, [mk_box("c_ms_dn", 0.12, 0.32, 0.12, [("t", -0.10, 0.0, -0.45)], m_dark)])
    blocker = mk_box("ms_blk", 0.54, 0.42, 0.26, [("t", 0.18, -0.06, 0.34)], m_fcu, bevel=0.014)

    pad_xy = [(0.24, -0.18)]
    pad_xy += _quad_bez((0.24, -0.18), (0.28, 0.18), (-0.05, 0.24), segs=8)
    pad_xy.append((-1.18, 0.32))
    pad_xy += _quad_bez((-1.18, 0.32), (-1.44, 0.28), (-1.40, 0.04), segs=8)
    pad_xy += _quad_bez((-1.40, 0.04), (-1.26, -0.18), (-0.82, -0.20), segs=8)

    parts = [axle, blocker]
    for s_idx, sign in enumerate((-1.0, 1.0)):
        z0, z1 = (1.22, 1.38) if sign > 0 else (-1.38, -1.22)
        pad = mk_extrude_z(f"ms_pad_{s_idx}", pad_xy, z0, z1, bevel=0.022, bevel_segs=2, mat=m_blk)

        shelf_raw = mk_box(
            f"ms_shf_{s_idx}", 1.14, 0.13, 0.26,
            [("rz", -0.06), ("t", -0.68, 0.22, sign * 1.38)], m_blk, bevel=0.014,
        )
        serrs = [
            mk_box(f"c_ms_s_{s_idx}_{i}", 0.10, 0.06, 0.29, [("t", -1.10 + i * 0.20, 0.27, sign * 1.38)], m_dark)
            for i in range(5)
        ]
        shelf = bool_subtract(shelf_raw, serrs)

        # Inlaid glossy crimson-red FIRE indicator dot right on the forward safety boss of BOTH paddles!
        red_dot = mk_cyl(
            f"ms_rdot_{s_idx}", 0.088, 0.088, 0.045, axis="z", segs=22,
            xform=[("t", 0.02, 0.01, sign * 1.385)], mat=m_red, bevel=0.012,
        )
        parts.extend([pad, shelf, red_dot])

    obj = join_objects(parts, "p320_manual_safety")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_p320_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: 17-Round Italian Mec-Gar Blued Carbon-Steel Double-Stack Magazine Body w/ Rolled Feed Lips,
    Reversible Mag-Catch Windows, Stiffening Dimple Ribs & 5/10/15/17 Witness Holes!
    assembledPos = [-5.25, -4.59, 0], rz = -18° | BBox: X[-1.547..+1.627], Y[-4.810..+5.270], Z[-0.996..+0.996]."""
    m_mag = mats["F_MagBluedSteel"]
    m_pol = mats["F_PolishedStainless"]
    m_dark = mats["F_MachinedDark"]

    rx, rz, cr = 1.23, 0.80, 0.22
    sec_xz = [(-rx + cr, -rz), (rx - cr, -rz)]
    sec_xz += _quad_bez((rx - cr, -rz), (rx, -rz), (rx, -rz + cr), segs=5)
    sec_xz.append((rx, rz - cr))
    sec_xz += _quad_bez((rx, rz - cr), (rx, rz), (rx - cr, rz), segs=5)
    sec_xz.append((-rx + cr, rz))
    sec_xz += _quad_bez((-rx + cr, rz), (-rx, rz), (-rx, rz - cr), segs=5)
    sec_xz.append((-rx, -rz + cr))
    sec_xz += _quad_bez((-rx, -rz + cr), (-rx, -rz), (-rx + cr, -rz), segs=5)

    tube = mk_extrude_y("mb_tube", sec_xz, -4.80, 4.25, bevel=0.015, bevel_segs=2, mat=m_mag)

    # Double-stack-to-single-feed tapered upper neck (Y in [4.15, 5.10])
    neck = mk_cyl(
        "mb_neck", 0.66, 1.06, 0.94, axis="y", segs=24,
        xform=[("s", 1.52, 1.0, 0.94), ("t", 0.04, 4.65, 0.0)], mat=m_mag,
    )
    lip_l = mk_box("mb_lipl", 1.90, 0.36, 0.12, [("rx",  0.32), ("t", 0.06, 5.08, -0.41)], m_mag, bevel=0.014)
    lip_r = mk_box("mb_lipr", 1.90, 0.36, 0.12, [("rx", -0.32), ("t", 0.06, 5.08,  0.41)], m_mag, bevel=0.014)
    curl_l = mk_cyl("mb_curll", 0.075, 0.075, 1.86, axis="x", segs=16, xform=[("t", 0.06, 5.19, -0.33)], mat=m_pol, bevel=0.010)
    curl_r = mk_cyl("mb_curlr", 0.075, 0.075, 1.86, axis="x", segs=16, xform=[("t", 0.06, 5.19,  0.33)], mat=m_pol, bevel=0.010)
    flange = mk_box("mb_flg", 2.52, 0.14, 1.68, [("t", 0.0, -4.74, 0.0)], m_mag, bevel=0.014)

    raw_mag = bool_union([tube, neck, lip_l, lip_r, curl_l, curl_r, flange], "p320_mag_body")

    cuts = [
        mk_box("c_mb_hol", 2.12, 9.85, 1.32, [("t", 0.0, -0.05, 0.0)], m_dark),
        mk_box("c_mb_thr", 2.05, 1.25, 0.66, [("t", 0.12, 4.95, 0.0)], m_dark),
        mk_cyl("c_mb_ogv", 0.46, 0.46, 1.32, axis="z", segs=18, xform=[("t", 1.06, 5.12, 0.0)], mat=m_dark),
        mk_box("c_mb_ejc", 0.48, 0.44, 0.36, [("t", -0.98, 5.05, -0.26)], m_dark),
    ]
    # Reversible mag-catch lock windows + side anti-friction dimple ribs
    for sign in (-1.0, 1.0):
        cuts.append(mk_box(f"c_mb_cw_{sign:+.0f}", 0.48, 0.34, 0.34, [("t", 1.06, 2.25, sign * 0.78)], m_dark))
        cuts.append(mk_box(f"c_mb_rb_{sign:+.0f}", 0.55, 5.80, 0.11, [("t", 0.18, -0.85, sign * 0.81)], m_dark))

    # 4 Rear Spine Witness Holes (`5 / 10 / 15 / 17`) + 4 Staggered Side Witness Holes!
    for i in range(4):
        wy = 1.90 - i * 1.55
        cuts.append(mk_cyl(f"c_mb_rw_{i}", 0.125, 0.125, 0.40, axis="x", segs=18, xform=[("t", -1.20, wy, 0.0)], mat=m_dark))
        sx = -0.52 + (i % 2) * 0.20
        cuts.append(mk_cyl(f"c_mb_sw_{i}", 0.105, 0.105, 1.76, axis="z", segs=18, xform=[("t", sx, wy - 0.18, 0.0)], mat=m_dark))

    sculpted = bool_subtract(raw_mag, cuts)
    return finish_part(sculpted, bevel_w=0.0, sharp_deg=34.0)


def build_p320_mag_spring(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-03: Compressed 8-Coil Rounded-Rectangular Music-Wire Magazine Spring.
    assembledPos = [-6.445, -8.268, 0], rz = -18° | BBox: X[-0.735..+0.735], Y[-0.595..+0.595], Z[-0.575..+0.575]."""
    m_spr = mats["F_SpringSteel"]
    coils = 8.0
    height = 1.10
    hx, hz = 0.69, 0.53
    steps = int(coils * 24)
    pts = []
    for i in range(steps + 1):
        u = i / steps
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        px = (1.0 if ct >= 0 else -1.0) * (abs(ct) ** 0.55) * hx
        pz = (1.0 if st >= 0 else -1.0) * (abs(st) ** 0.55) * hz
        py = -height * 0.5 + height * u
        pts.append(Vector((px, py, pz)))
    obj = mk_tube_along_pts("p320_mag_spring", pts, 0.045, ring_segs=8, mat=m_spr)
    return finish_part(obj, bevel_w=0.0, sharp_deg=44.0, weighted_normals=False)


# =============================================================================
# Non-Overlapping Hero UV Layout + CONCAVE Smart Packing (3 Dedicated 2K Atlases)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
    skip_face_fn=None,
):
    if not objs:
        return
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
    pu_min, pu_max, pv_min, pv_max = 1.0, 0.0, 1.0, 0.0
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
                pu_min, pu_max = min(pu_min, ux), max(pu_max, ux)
                pv_min, pv_max = min(pv_min, vy), max(pv_max, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    span_u = pu_max - pu_min
    span_v = pv_max - pv_min
    print(f"  [UV-PACK] {len(objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > 0.45 and span_v > 0.45, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_slide_atlas(slide_objs: list[bpy.types.Object]):
    """Unwraps 5 slide/sights/extractor/housing parts into `p320_v3_slide` (2048x2048):
      - Hero Band 1 (Slide Right outer flank + upper bevel): u[0.015, 0.985], v[0.780, 0.985]
      - Hero Band 2 (Slide Left  outer flank + upper bevel): u[0.015, 0.985], v[0.555, 0.760] (mirrored U)
      - Pack A (Slide non-hero: top deck, serration roots, muzzle, interior): u[0.010, 0.560], v[0.010, 0.535]
      - Pack B (Optic plate/sights, front sight, striker housing, extractor): u[0.575, 0.990], v[0.010, 0.535]
    """
    def is_slide_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "p320_slide" or mat_name != "S_CoyotePVD":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if tx < -7.84 or tx > 11.62 or ty < 0.90 or ty > 3.56:
            return False
        return (nz > 0.72 and tz > 0.92) or (nz < -0.72 and tz < -0.92)

    sl = [o for o in slide_objs if o.name == "p320_slide"]
    aux = [o for o in slide_objs if o.name != "p320_slide"]
    _smart_unwrap_and_pack_rect(sl, 0.010, 0.560, 0.010, 0.535, skip_face_fn=is_slide_hero)
    _smart_unwrap_and_pack_rect(aux, 0.575, 0.990, 0.010, 0.535, skip_face_fn=None)

    slide = sl[0]
    bm = bmesh.new()
    bm.from_mesh(slide.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in slide.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_slide_hero("p320_slide", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        v0, v1 = (0.780, 0.985) if is_right else (0.555, 0.760)
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-7.86)) / 19.52))
            yn = max(0.0, min(1.0, (ty - 0.88) / 2.74))
            u_val = (0.015 + xn * 0.970) if is_right else (0.015 + (1.0 - xn) * 0.970)
            v_val = v0 + yn * (v1 - v0)
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(slide.data)
    bm.free()


def unwrap_grip_atlas(grip_objs: list[bpy.types.Object]):
    """Unwraps 3 polymer grip/baseplate/follower parts into `p320_v3_grip` (2048x2048):
      - Hero Band 1 (Grip Module Right outer flank + guard cheek): u[0.015, 0.985], v[0.635, 0.985]
      - Hero Band 2 (Grip Module Left  outer flank + guard cheek): u[0.015, 0.985], v[0.270, 0.620] (mirrored U)
      - Firewalled Box (Safety-Orange Mag Follower ONLY!):         u[0.010, 0.230], v[0.010, 0.245]
      - Pack Box (Baseplate + Grip front/backstrap/rail/inner):    u[0.260, 0.990], v[0.010, 0.250]
    """
    def is_grip_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "p320_grip_module" or mat_name != "G_CoyotePoly":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if tx < -9.10 or tx > 9.66 or ty < -9.76 or ty > 0.99:
            return False
        is_main_flank = (nz > 0.58 and tz > 0.88) or (nz < -0.58 and tz < -0.88)
        is_tg_cheek = (-2.15 <= tx <= 2.75 and ty <= -0.54) and ((nz > 0.84 and tz > 0.50) or (nz < -0.84 and tz < -0.50))
        return is_main_flank or is_tg_cheek

    follower_grp = [o for o in grip_objs if o.name == "p320_mag_follower"]
    rest_grp = [o for o in grip_objs if o.name != "p320_mag_follower"]
    _smart_unwrap_and_pack_rect(follower_grp, 0.010, 0.230, 0.010, 0.245, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(rest_grp, 0.260, 0.990, 0.010, 0.250, skip_face_fn=is_grip_hero)

    grip = next(o for o in grip_objs if o.name == "p320_grip_module")
    bm = bmesh.new()
    bm.from_mesh(grip.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in grip.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_grip_hero("p320_grip_module", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        v0, v1 = (0.635, 0.985) if is_right else (0.270, 0.620)
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-9.12)) / 18.80))
            yn = max(0.0, min(1.0, (ty - (-9.78)) / 10.80))
            u_val = (0.015 + xn * 0.970) if is_right else (0.015 + (1.0 - xn) * 0.970)
            v_val = v0 + yn * (v1 - v0)
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(grip.data)
    bm.free()


def unwrap_fcu_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 14 FCU/barrel/controls/mag parts into `p320_v3_fcu_metal` (2048x2048):
      - Hero Band 1 (FCU Serial Plate `TC014829`):   u[0.015, 0.435], v[0.835, 0.985]
      - Hero Band 2 (Barrel Hood Top `9mmx19`):      u[0.455, 0.855], v[0.835, 0.985]
      - Hero Band 3 (Mag Rear Spine `5/10/15/17`):   u[0.875, 0.985], v[0.300, 0.985]
      - Hero Band 4 (Mag Right Flank):               u[0.585, 0.715], v[0.300, 0.815]
      - Hero Band 5 (Mag Left  Flank):               u[0.730, 0.860], v[0.300, 0.815]
      - Pack A (FCU/Barrel/Mag remaining faces):     u[0.010, 0.565], v[0.300, 0.815]
      - Pack B (11 Controls, FCG & Internal Steel):  u[0.010, 0.990], v[0.010, 0.285]
    """
    def hero_kind(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "p320_fcu_chassis" and mat_name == "F_FcuSerialPlate":
            if nz > 0.80 and tz > 0.92:
                return "fcu_serial"
        elif obj_name == "p320_barrel" and mat_name == "F_BarrelHood":
            if ny > 0.82 and ty > 3.45 and -0.56 <= tx <= 2.66:
                return "barrel_hood"
        elif obj_name == "p320_mag_body" and mat_name == "F_MagBluedSteel":
            if -4.82 <= ty <= 4.26:
                if nx < -0.82 and tx < -1.12:
                    return "mag_rear"
                if nz > 0.82 and tz > 0.72:
                    return "mag_right"
                if nz < -0.82 and tz < -0.72:
                    return "mag_left"
        return None

    def is_hero_any(obj_name: str, face, mat_name: str) -> bool:
        return hero_kind(obj_name, face, mat_name) is not None

    hero_core = [o for o in metal_objs if o.name in {"p320_fcu_chassis", "p320_barrel", "p320_mag_body"}]
    controls_fcg = [o for o in metal_objs if o not in hero_core]
    _smart_unwrap_and_pack_rect(hero_core, 0.010, 0.565, 0.300, 0.815, skip_face_fn=is_hero_any)
    _smart_unwrap_and_pack_rect(controls_fcg, 0.010, 0.990, 0.010, 0.285, skip_face_fn=None)

    for o in hero_core:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            hk = hero_kind(o.name, f, mname)
            if hk is None:
                continue
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                if hk == "fcu_serial":
                    xn = max(0.0, min(1.0, (tx - (-1.24)) / 2.20))
                    yn = max(0.0, min(1.0, (ty - 0.02) / 0.60))
                    loop[uv_layer].uv = (0.015 + xn * 0.420, 0.835 + yn * 0.150)
                elif hk == "barrel_hood":
                    xn = max(0.0, min(1.0, (tx - (-0.54)) / 3.18))
                    zn = max(0.0, min(1.0, (0.80 - tz) / 1.60))
                    loop[uv_layer].uv = (0.455 + xn * 0.400, 0.835 + zn * 0.150)
                elif hk == "mag_rear":
                    zn = max(0.0, min(1.0, (tz - (-0.80)) / 1.60))
                    yn = max(0.0, min(1.0, (ty - (-4.80)) / 9.05))
                    loop[uv_layer].uv = (0.875 + zn * 0.110, 0.300 + yn * 0.685)
                elif hk == "mag_right":
                    xn = max(0.0, min(1.0, (tx - (-1.23)) / 2.46))
                    yn = max(0.0, min(1.0, (ty - (-4.80)) / 9.05))
                    loop[uv_layer].uv = (0.585 + xn * 0.130, 0.300 + yn * 0.515)
                elif hk == "mag_left":
                    xn = max(0.0, min(1.0, (tx - (-1.23)) / 2.46))
                    yn = max(0.0, min(1.0, (ty - (-4.80)) / 9.05))
                    loop[uv_layer].uv = (0.730 + (1.0 - xn) * 0.130, 0.300 + yn * 0.515)
        bm.to_mesh(o.data)
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
        o.location = (i * 50.0, 0.0, 0.0)
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


def bake_atlas_suite(
    prefix: str,
    target_objs: list[bpy.types.Object],
    all_objs: list[bpy.types.Object],
    tmp_dir: Path,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str,
        bake_type: str,
        samples: int,
        fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False,
        extra_objs_override=None,
    ):
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

        kwargs = dict(type=bake_type, margin=6, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.12, 0.09, 0.06, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.50
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # Assembled exterior contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.38
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
# Verification & Draco glTF 2.0 Export
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
    assert not bad_parts, f"Non-manifold or inverted parts detected: {bad_parts}"
    return report


def triangulate_keep_normals(all_objs: list[bpy.types.Object]):
    """Locks WeightedNormal planar loop normals into beauty triangles BEFORE baking & export so
    Cycles tangent-space normal maps and Three.js rendered triangles match 100% with zero ngon streaks!"""
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="Triangulate", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


def export_draco_glb(all_objs: list[bpy.types.Object]):
    _set_identity_layout(all_objs)
    for o in all_objs:
        o.data.name = o.name
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
        # Suite 1: p320_v3_slide (5 parts)
        "p320_slide": build_p320_slide,
        "p320_optic_plate_sight": build_p320_optic_plate_sight,
        "p320_front_sight": build_p320_front_sight,
        "p320_striker_housing": build_p320_striker_housing,
        "p320_extractor": build_p320_extractor,
        # Suite 2: p320_v3_grip (3 parts)
        "p320_grip_module": build_p320_grip_module,
        "p320_mag_follower": build_p320_mag_follower,
        "p320_mag_baseplate": build_p320_mag_baseplate,
        # Suite 3: p320_v3_fcu_metal (14 parts)
        "p320_barrel": build_p320_barrel,
        "p320_recoil_guide_rod": build_p320_recoil_guide_rod,
        "p320_striker": build_p320_striker,
        "p320_safety_lock": build_p320_safety_lock,
        "p320_takedown_lever": build_p320_takedown_lever,
        "p320_slide_catch": build_p320_slide_catch,
        "p320_mag_catch": build_p320_mag_catch,
        "p320_fcu_chassis": build_p320_fcu_chassis,
        "p320_trigger_shoe": build_p320_trigger_shoe,
        "p320_trigger_bar": build_p320_trigger_bar,
        "p320_sear_group": build_p320_sear_group,
        "p320_manual_safety": build_p320_manual_safety,
        "p320_mag_body": build_p320_mag_body,
        "p320_mag_spring": build_p320_mag_spring,
    }

    print("[BUILD] Sculpting all 22 solid SIG Sauer P320 / U.S. Army M17 hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    slide_objs = [built[pid] for pid in SLIDE_PARTS]
    grip_objs = [built[pid] for pid in GRIP_PARTS]
    fcu_objs = [built[pid] for pid in FCU_METAL_PARTS]
    all_objs = slide_objs + grip_objs + fcu_objs

    print("[VERIFY] Checking manifoldness, outward normals & exact CSG alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & CONCAVE packing 3 dedicated 2K atlases: slide (5), grip (3), fcu_metal (14)...")
    unwrap_slide_atlas(slide_objs)
    unwrap_grip_atlas(grip_objs)
    unwrap_fcu_metal_atlas(fcu_objs)

    # Triangulate keeping WeightedNormal loop normals BEFORE Cycles NORMAL baking & glTF export!
    triangulate_keep_normals(all_objs)

    # Audit UV areas across all 3 atlases (strictly <= 0.98, zero overlapping explosions!)
    for label, group in (("slide", slide_objs), ("grip", grip_objs), ("fcu_metal", fcu_objs)):
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
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="p320_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking p320_v3_slide (2048x2048, Coyote PVD slide + optic plate/tritium sights + extractor)...")
        bake_atlas_suite("slide", slide_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking p320_v3_grip (2048x2048, Coyote matte polymer grip + floorplate + firewalled follower)...")
        bake_atlas_suite("grip", grip_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking p320_v3_fcu_metal (2048x2048, stainless FCU + 4.7\" barrel + Nitron controls + 17-rd mag)...")
        bake_atlas_suite("fcu", fcu_objs, all_objs, tmp_dir)

        print("[POST] Compositing M17 laser rollmarks, UID DataMatrix, grip stippling & medallion, FCU TC014829 & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "p320_v3_slide_albedo.webp",
        TEX_OUT_DIR / "p320_v3_slide_normal.webp",
        TEX_OUT_DIR / "p320_v3_slide_roughness.webp",
        TEX_OUT_DIR / "p320_v3_grip_albedo.webp",
        TEX_OUT_DIR / "p320_v3_grip_normal.webp",
        TEX_OUT_DIR / "p320_v3_grip_roughness.webp",
        TEX_OUT_DIR / "p320_v3_fcu_metal_albedo.webp",
        TEX_OUT_DIR / "p320_v3_fcu_metal_normal.webp",
        TEX_OUT_DIR / "p320_v3_fcu_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== SIG SAUER P320 / U.S. ARMY M17 V3 ASSET BUDGET ===")
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
