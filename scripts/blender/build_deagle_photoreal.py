#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for IMI / Magnum Research Desert Eagle Mark XIX (.50 AE)
=====================================================================================================
MIT License — Digital Armory 3D (`PR-04` Track 2a)

Generates:
  - public/models/deagle.glb (Draco-compressed glTF 2.0, all 23 solid parts; skips ONLY the
    dynamic GPU-compressed dual recoil spring `deagle_recoil_springs` carrying `aSpringParam`)
  - public/textures/deagle_v3_hero_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM: barrel, slide, frame)
  - public/textures/deagle_v3_steel_{albedo,normal,roughness}.webp (2048x2048 Packed ORM: 17 internal/control/mag metal parts)
  - public/textures/deagle_v3_grip_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM: sculpted rubber grip, baseplate, firewalled orange follower)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 23 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/deagle/meshes/*.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_deagle_photoreal.py
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
# MODE 2: System Python Post-Process (PIL Laser Rollmarks + RNM Normal + ORM WebP)
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 2.0) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.35)
        return np.clip(dist / max(width_px, 0.5), 0.0, 1.0).astype(np.float32) * (mask > 0.05)

    def _paste_uv_band(
        target: np.ndarray, pil_l: Image.Image, u0: float, u1: float, v0: float, v1: float
    ):
        h, w = target.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        resized = pil_l.resize(
            (max(1, x1 - x0), max(1, y1 - y0)), resample=Image.Resampling.LANCZOS
        )
        arr = np.asarray(resized, dtype=np.float32) / 255.0
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], arr)

    def _mix(field: np.ndarray, val, mask: np.ndarray):
        m = mask[..., None] if field.ndim == 3 else mask
        field *= 1.0 - m
        field += np.asarray(val, dtype=np.float32) * m

    def _draw_israeli_proof_shield(
        draw: ImageDraw.ImageDraw, cx: int, cy: int, rad: int, width: int = 5
    ):
        """Israeli / IMI proof shield with crisp 6-pointed star."""
        w_sh, h_sh = int(rad * 0.78), int(rad * 0.96)
        draw.polygon(
            [
                (cx - w_sh, cy - int(h_sh * 0.68)),
                (cx + w_sh, cy - int(h_sh * 0.68)),
                (cx + w_sh, cy + int(h_sh * 0.22)),
                (cx, cy + h_sh),
                (cx - w_sh, cy + int(h_sh * 0.22)),
            ],
            outline=255,
            width=width,
        )
        sr = int(rad * 0.42)
        cy_s = cy - int(h_sh * 0.08)
        draw.polygon(
            [
                (cx, cy_s - sr),
                (cx - int(sr * 0.86), cy_s + int(sr * 0.50)),
                (cx + int(sr * 0.86), cy_s + int(sr * 0.50)),
            ],
            outline=255,
            width=max(2, width - 1),
        )
        draw.polygon(
            [
                (cx, cy_s + sr),
                (cx - int(sr * 0.86), cy_s - int(sr * 0.50)),
                (cx + int(sr * 0.86), cy_s - int(sr * 0.50)),
            ],
            outline=255,
            width=max(2, width - 1),
        )

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def process_hero_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "hero_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "hero_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "hero_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "hero_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "hero_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "hero_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "hero_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.48 + ao_ext * 0.52)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        # Luminous stainless flats with crisp dark recessed slots, serration roots & parting shadows
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.84), 0.30, 1.0).astype(
            np.float32
        )

        # Fine longitudinal brushed-stainless directional sheen on the 6 hero flank bands
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        hero_bands_mask = (
            (
                (u_grid >= 0.015)
                & (u_grid <= 0.985)
                & (
                    ((v_grid >= 0.855) & (v_grid <= 0.985))  # Slide Right
                    | ((v_grid >= 0.715) & (v_grid <= 0.845))  # Slide Left
                    | ((v_grid >= 0.365) & (v_grid <= 0.452))  # Frame Right (full cheek + dust cover)
                    | ((v_grid >= 0.270) & (v_grid <= 0.357))  # Frame Left  (full cheek + dust cover)
                )
            )
            | (
                (u_grid >= 0.015)
                & (u_grid <= 0.640)
                & (
                    ((v_grid >= 0.585) & (v_grid <= 0.700))  # Barrel Right
                    | ((v_grid >= 0.460) & (v_grid <= 0.575))  # Barrel Left
                )
            )
        ).astype(np.float32)

        rng = np.random.default_rng(5050)
        # Authentic ultra-fine FULL-RES 2048x2048 directional CNC brushed 416 satin stainless grain
        # Calibrated to R in [0.18..0.32] with silky longitudinal hairlines catching Leica softbox ribbons!
        raw_brush = rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32)
        brush_fine = ndimage.gaussian_filter(raw_brush, sigma=(0.30, 34.0))
        brush_med = ndimage.gaussian_filter(raw_brush, sigma=(0.65, 78.0))
        brush_h = np.clip(brush_fine * 2.4 + brush_med * 1.6, -1.0, 1.0).astype(np.float32)
        bright_metal = ((met > 0.90) & (rgh < 0.34)).astype(np.float32) * hero_bands_mask

        decal_height = 0.024 * brush_h * bright_metal
        albedo = np.clip(albedo + (0.016 * brush_h * bright_metal)[..., None], 0.0, 1.0)
        rgh = np.clip(rgh + 0.036 * brush_h * bright_metal, 0.16, 0.94)

        # Subtle micro handling hairlines along brushed flanks
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(380):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.72) * h)
            length = float(rng.uniform(28, 130))
            ang = math.radians(float(rng.uniform(-2.2, 2.2)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(45, 135)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * bright_metal
        decal_height -= 0.014 * sc
        rgh = np.clip(rgh - 0.016 * sc, 0.16, 0.94)
        albedo = np.clip(albedo + (0.018 * sc)[..., None], 0.0, 1.0)

        engraved = np.zeros((h, w), dtype=np.float32)
        red_dot = np.zeros((h, w), dtype=np.float32)

        # =====================================================================
        # 1) SLIDE RIGHT & LEFT HERO BANDS (23.40 cm x 3.28 cm -> 160 px/cm = 3744 x 525 px)
        #    Band 1 (Right +Z): u in [0.015, 0.985], v in [0.855, 0.985] (x in [-9.55, 13.85], y in [0.88, 4.16])
        #    Band 2 (Left  -Z): u in [0.015, 0.985], v in [0.715, 0.845] (mirrored U: +X muzzle at left!)
        # =====================================================================
        sw, sh = 3744, 525
        sx_min, sx_span = -9.55, 23.40
        sy_min, sy_span = 0.88, 3.28

        def s_r(wx: float, wy: float):
            return (
                int(round((wx - sx_min) / sx_span * sw)),
                int(round((1.0 - (wy - sy_min) / sy_span) * sh)),
            )

        def s_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - sx_min) / sx_span) * sw)),
                int(round((1.0 - (wy - sy_min) / sy_span) * sh)),
            )

        sr_eng, sl_eng = Image.new("L", (sw, sh), 0), Image.new("L", (sw, sh), 0)
        sr_red, sl_red = Image.new("L", (sw, sh), 0), Image.new("L", (sw, sh), 0)
        dsr, dsl = ImageDraw.Draw(sr_eng), ImageDraw.Draw(sl_eng)
        drr, drl = ImageDraw.Draw(sr_red), ImageDraw.Draw(sl_red)

        # RIGHT SLIDE BREECH CHEEK (unobstructed smooth brushed steel X in [-4.55, -0.82], Y in [1.18, 2.34])
        # Zero unsupported Unicode dots: pure factory ASCII rollmark typography!
        rx0, ry0 = s_r(-4.46, 2.24)
        dsr.line([(rx0, ry0 - 15), (rx0 + 575, ry0 - 15)], fill=255, width=4)
        dsr.text((rx0, ry0), "MAGNUM RESEARCH INC.", fill=255, font=_load_font(FONT_DIN, 46))
        dsr.text((rx0, ry0 + 54), "PILLAGER, MN   U.S.A.", fill=255, font=_load_font(FONT_DIN, 34))
        dsr.text((rx0, ry0 + 100), "ISRAEL MILITARY INDUSTRIES", fill=255, font=_load_font(FONT_COND, 34))
        _draw_israeli_proof_shield(dsr, rx0 + 528, ry0 + 96, 26, width=4)

        # LEFT SLIDE BREECH CHEEK (wide solid brushed steel X in [-4.55, +1.65], Y in [1.18, 2.34])
        lx0, ly0 = s_l(1.48, 2.28)
        dsl.line([(lx0, ly0 - 16), (lx0 + 920, ly0 - 16)], fill=255, width=4)
        dsl.text((lx0, ly0), "DESERT EAGLE PISTOL", fill=255, font=_load_font(FONT_DIN, 62))
        dsl.text(
            (lx0, ly0 + 68),
            "MAGNUM RESEARCH INC.   PILLAGER, MN",
            fill=255,
            font=_load_font(FONT_DIN, 38),
        )
        dsl.text(
            (lx0, ly0 + 114),
            "ISRAEL MILITARY INDUSTRIES  -  .50 ACTION EXPRESS",
            fill=255,
            font=_load_font(FONT_COND, 36),
        )
        _draw_israeli_proof_shield(dsl, lx0 + 880, ly0 + 108, 28, width=4)

        # CRIMSON RED-DOT FIRE INDICATORS on BOTH flanks cleanly exposed above the safety lever wing!
        for fn, draw_e, draw_r in ((s_r, dsr, drr), (s_l, dsl, drl)):
            dx_p, dy_p = fn(-6.08, 3.16)
            draw_r.ellipse((dx_p - 21, dy_p - 21, dx_p + 21, dy_p + 21), fill=255)
            draw_e.ellipse((dx_p - 26, dy_p - 26, dx_p + 26, dy_p + 26), outline=255, width=5)

        _paste_uv_band(engraved, sr_eng, 0.015, 0.985, 0.855, 0.985)
        _paste_uv_band(engraved, sl_eng, 0.015, 0.985, 0.715, 0.845)
        _paste_uv_band(red_dot, sr_red, 0.015, 0.985, 0.855, 0.985)
        _paste_uv_band(red_dot, sl_red, 0.015, 0.985, 0.715, 0.845)

        # =====================================================================
        # 2) BARREL RIGHT & LEFT HERO BANDS (14.14 cm x 2.18 cm -> 180 px/cm = 2545 x 392 px)
        # =====================================================================
        bw, bh = 2545, 392
        bx_min, bx_span = 1.86, 14.14
        by_min, by_span = 1.70, 2.18

        def b_r(wx: float, wy: float):
            return (
                int(round((wx - bx_min) / bx_span * bw)),
                int(round((1.0 - (wy - by_min) / by_span) * bh)),
            )

        def b_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - bx_min) / bx_span) * bw)),
                int(round((1.0 - (wy - by_min) / by_span) * bh)),
            )

        br_eng, bl_eng = Image.new("L", (bw, bh), 0), Image.new("L", (bw, bh), 0)
        dbr, dbl = ImageDraw.Draw(br_eng), ImageDraw.Draw(bl_eng)

        brx, bry = b_r(8.60, 2.66)
        dbr.text((brx, bry), ".50 AE  -  MARK XIX", fill=255, font=_load_font(FONT_DIN, 74), anchor="mm")
        blx, bly = b_l(8.60, 2.66)
        dbl.text((blx, bly), ".50 ACTION EXPRESS", fill=255, font=_load_font(FONT_DIN, 74), anchor="mm")

        _paste_uv_band(engraved, br_eng, 0.015, 0.640, 0.585, 0.700)
        _paste_uv_band(engraved, bl_eng, 0.015, 0.640, 0.460, 0.575)

        # =====================================================================
        # 3) FRAME RIGHT & LEFT FULL SIDE FLANK BANDS (26.30 cm x 4.30 cm -> 140 px/cm = 3682 x 602 px)
        #    Covers ENTIRE dust cover + receiver cheek + beavertail seamlessly (zero Y=-0.25 seam!)
        #    Band 5 (Right +Z): u in [0.015, 0.985], v in [0.365, 0.452] (x in [-10.50, 15.80], y in [-3.40, 0.90])
        #    Band 6 (Left  -Z): u in [0.015, 0.985], v in [0.270, 0.357] (mirrored U)
        # =====================================================================
        fw, fh = 3682, 602
        fx_min, fx_span = -10.50, 26.30
        fy_min, fy_span = -3.40, 4.30

        def f_r(wx: float, wy: float):
            return (
                int(round((wx - fx_min) / fx_span * fw)),
                int(round((1.0 - (wy - fy_min) / fy_span) * fh)),
            )

        def f_l(wx: float, wy: float):
            return (
                int(round((1.0 - (wx - fx_min) / fx_span) * fw)),
                int(round((1.0 - (wy - fy_min) / fy_span) * fh)),
            )

        fr_eng, fl_eng = Image.new("L", (fw, fh), 0), Image.new("L", (fw, fh), 0)
        dfr, dfl = ImageDraw.Draw(fr_eng), ImageDraw.Draw(fl_eng)

        # Right dust-cover serial rollmark (ahead of takedown lever at X=3.15!)
        frx, fry = f_r(8.60, 0.36)
        dfr.text((frx, fry), "DK 0050919   IMI", fill=255, font=_load_font(FONT_DIN, 58), anchor="mm")
        # Left dust-cover model mark
        flx, fly = f_l(8.60, 0.36)
        dfl.text((flx, fly), "DESERT EAGLE   MARK XIX", fill=255, font=_load_font(FONT_DIN, 54), anchor="mm")

        _paste_uv_band(engraved, fr_eng, 0.015, 0.985, 0.365, 0.452)
        _paste_uv_band(engraved, fl_eng, 0.015, 0.985, 0.270, 0.357)

        # Crisp dark annealed-steel CNC laser-etched rollmarks (clean dark etch, ZERO white ghost halo!)
        eng_bev = _bevel_mask(engraved, width_px=1.0)
        decal_height -= 0.36 * eng_bev
        _mix(albedo, (0.120, 0.128, 0.144), engraved * 0.96)
        _mix(rgh, 0.46, engraved * 0.92)
        _mix(met, 0.42, engraved * 0.90)
        ao *= 1.0 - 0.30 * engraved

        # Glossy crimson enamel safety fire-dot
        red_bev = _bevel_mask(red_dot, width_px=1.8)
        decal_height += 0.24 * red_bev
        _mix(albedo, (0.78, 0.042, 0.052), red_dot * 0.98)
        _mix(rgh, 0.16, red_dot * 0.95)
        _mix(met, 0.02, red_dot * 0.98)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.11, 0.94)
        met = np.clip(met, 0.02, 0.99)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_hero_albedo.webp", "WEBP", quality=98, method=6
        )
        # Lossless RGB WebP for tangent normals & Packed ORM eliminates ALL YUV 4:2:0 8x8 reflection macroblocks on satin stainless!
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_hero_normal.webp", "WEBP", lossless=True, exact=True, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_hero_roughness.webp", "WEBP", lossless=True, exact=True, method=6
        )
        print("[POST] Saved deagle_v3_hero_{albedo,normal,roughness}.webp (2048x2048, lossless normal+ORM)")

    def process_steel_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "steel_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "steel_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "steel_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "steel_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "steel_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "steel_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "steel_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.32 + 0.68 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.28, 1.0).astype(
            np.float32
        )

        # Magazine Right & Left Hero Flanks (u in [0.015, 0.195] and [0.210, 0.390], v in [0.020, 0.780])
        # Mag local coords: x in [-2.04, +2.04] (span 4.08 cm), y in [-5.85, +5.30] (span 11.15 cm)
        # Witness holes sit at x = -0.95, y = 3.2 - i*1.15 for i = 0..6 (rounds 1..7)
        mw, mh = 640, 1750
        mx_min, mx_span = -2.04, 4.08
        my_min, my_span = -5.85, 11.15
        lettering = np.zeros((h, w), dtype=np.float32)

        for pu0, pu1, is_right in ((0.015, 0.195, True), (0.210, 0.390, False)):
            mc = Image.new("L", (mw, mh), 0)
            dm = ImageDraw.Draw(mc)
            f_num = _load_font(FONT_DIN, 58)
            f_lbl = _load_font(FONT_COND, 62)

            def m2p(lx: float, ly: float):
                xn = (lx - mx_min) / mx_span
                if not is_right:
                    xn = 1.0 - xn
                return (int(round(xn * mw)), int(round((1.0 - (ly - my_min) / my_span) * mh)))

            for i in range(7):
                wy = 3.20 - i * 1.15
                # Stamp crisp round-count number aft of each countersunk witness hole (x = -1.52)
                px, py = m2p(-1.52, wy)
                dm.text((px, py), str(i + 1), fill=255, font=f_num, anchor="mm")

            # Crisp factory caliber stamp on lower front magazine body
            cx_s, cy_s = m2p(0.55, -4.45)
            dm.text((cx_s, cy_s), ".50 AE", fill=255, font=f_lbl, anchor="mm")
            _paste_uv_band(lettering, mc, pu0, pu1, 0.020, 0.780)

        # Subtle vertical insertion wear tracks along upper blued magazine flanks
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        mag_band = (
            (((u_grid >= 0.015) & (u_grid <= 0.195)) | ((u_grid >= 0.210) & (u_grid <= 0.390)))
            & (v_grid >= 0.05)
            & (v_grid <= 0.77)
        ).astype(np.float32)
        rng = np.random.default_rng(5051)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(360):
            sx = float(rng.uniform(0.02, 0.385) * w)
            sy = float(rng.uniform(0.24, 0.92) * h)
            length = float(rng.uniform(22, 140))
            dsc.line([(sx, sy), (sx + float(rng.uniform(-2, 2)), sy + length)], fill=int(rng.integers(60, 175)), width=1)
        scuffs = (np.asarray(sc_img, dtype=np.float32) / 255.0) * mag_band

        decal_height = -0.52 * _bevel_mask(lettering, width_px=1.2) - 0.03 * scuffs
        _mix(albedo, (0.86, 0.88, 0.91), lettering * 0.94)
        _mix(rgh, 0.42, lettering * 0.85)
        _mix(met, 0.22, lettering * 0.85)
        _mix(albedo, (0.48, 0.52, 0.58), scuffs * 0.32)
        rgh -= 0.06 * scuffs

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.0, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_steel_albedo.webp", "WEBP", quality=95, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_steel_normal.webp", "WEBP", lossless=True, exact=True, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_steel_roughness.webp", "WEBP", lossless=True, exact=True, method=6
        )
        print("[POST] Saved deagle_v3_steel_{albedo,normal,roughness}.webp (2048x2048, lossless normal+ORM)")

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
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.34, 1.0).astype(
            np.float32
        )

        # Dedicated Hero Grip Flank UV Bands:
        #   Right grip flank: u in [0.020, 0.475], v in [0.020, 0.715]
        #   Left  grip flank: u in [0.515, 0.970], v in [0.020, 0.715]
        #   Mapped in local grip-aligned coordinates (u_grip in [0,1] across 4.9 cm front->rear,
        #   v_grip in [0,1] across 8.6 cm bottom->top -> aspect 0.57, matching 0.455/0.695 = 0.654 almost 1:1!)
        gw, gh = 1100, 1930  # ~224 px/cm isotropic!
        panel_fill = np.zeros((h, w), dtype=np.float32)
        med_mask = np.zeros((h, w), dtype=np.float32)
        let_mask = np.zeros((h, w), dtype=np.float32)
        border_groove = np.zeros((h, w), dtype=np.float32)

        for pu0, pu1 in ((0.020, 0.475), (0.515, 0.970)):
            pnl_c = Image.new("L", (gw, gh), 0)
            med_c = Image.new("L", (gw, gh), 0)
            let_c = Image.new("L", (gw, gh), 0)
            brd_c = Image.new("L", (gw, gh), 0)
            dp, dm, dt, db = (
                ImageDraw.Draw(pnl_c),
                ImageDraw.Draw(med_c),
                ImageDraw.Draw(let_c),
                ImageDraw.Draw(brd_c),
            )

            # Razor-clean full-resolution rounded-rectangle stipple panel (ZERO quad-grid staircasing!)
            # Bottom cleanly stops at gh-405 (yn=0.210) so recessed blued grip screw sits cleanly BELOW in smooth margin!
            dp.rounded_rectangle((155, 310, gw - 155, gh - 405), radius=85, fill=255)
            db.rounded_rectangle(
                (155, 310, gw - 155, gh - 405), radius=85, outline=255, width=26
            )

            # True 1:1 circular molded IMI / MRI Spread-Wing Desert Eagle Medallion centered inside stipple panel!
            gcx, gcy, grad = int(gw * 0.50), int(gh * 0.475), 238
            dm.ellipse((gcx - grad, gcy - grad, gcx + grad, gcy + grad), fill=255)
            dt.ellipse(
                (gcx - grad + 12, gcy - grad + 12, gcx + grad - 12, gcy + grad - 12),
                outline=255,
                width=20,
            )
            dt.ellipse(
                (gcx - grad + 46, gcy - grad + 46, gcx + grad - 46, gcy + grad - 46),
                outline=255,
                width=11,
            )
            # Stylized multi-feather spread-wing Desert Eagle crest silhouette
            dt.polygon(
                [
                    (gcx - 172, gcy - 30),
                    (gcx - 110, gcy - 18),
                    (gcx - 52, gcy - 12),
                    (gcx, gcy - 48),
                    (gcx + 52, gcy - 12),
                    (gcx + 110, gcy - 18),
                    (gcx + 172, gcy - 30),
                    (gcx + 136, gcy + 4),
                    (gcx + 150, gcy + 14),
                    (gcx + 104, gcy + 26),
                    (gcx + 48, gcy + 36),
                    (gcx, gcy + 58),
                    (gcx - 48, gcy + 36),
                    (gcx - 104, gcy + 26),
                    (gcx - 150, gcy + 14),
                    (gcx - 136, gcy + 4),
                ],
                fill=255,
            )
            dt.text((gcx, gcy - 118), "IMI", fill=255, font=_load_font(FONT_DIN, 96), anchor="mm")
            dt.text((gcx, gcy + 124), "MRI", fill=255, font=_load_font(FONT_DIN, 96), anchor="mm")

            _paste_uv_band(panel_fill, pnl_c, pu0, pu1, 0.020, 0.715)
            _paste_uv_band(med_mask, med_c, pu0, pu1, 0.020, 0.715)
            _paste_uv_band(let_mask, let_c, pu0, pu1, 0.020, 0.715)
            _paste_uv_band(border_groove, brd_c, pu0, pu1, 0.020, 0.715)

        # Full-2K tactile Hogue/IMI pebble stipple strictly inside the smooth rounded panel & outside medallion!
        stipple_zone = np.clip(panel_fill * (1.0 - med_mask) * (1.0 - border_groove * 0.75), 0.0, 1.0)
        rng_g = np.random.default_rng(50919)
        n_hi = rng_g.normal(0.0, 1.0, size=(h, w)).astype(np.float32)
        peb_a = ndimage.gaussian_filter(n_hi, sigma=1.15)
        peb_b = ndimage.gaussian_filter(n_hi, sigma=2.10)
        pebble = np.clip(np.tanh((peb_a * 2.8 + peb_b * 1.4) * 1.25), -1.0, 1.0).astype(np.float32)
        peb_crest = np.clip(pebble, 0.0, 1.0)
        peb_valley = np.clip(-pebble, 0.0, 1.0)

        # Matte recessed stipple field vs sleek satin molded rubber outer rim (ZERO staircasing!)
        _mix(albedo, (0.080, 0.084, 0.090), stipple_zone * 0.85)
        albedo = np.clip(albedo + (0.024 * peb_crest * stipple_zone)[..., None] - (0.022 * peb_valley * stipple_zone)[..., None], 0.0, 1.0)
        _mix(rgh, 0.89 - 0.10 * peb_crest, stipple_zone * 0.95)
        ao *= 1.0 - 0.16 * peb_valley * stipple_zone

        med_bev = _bevel_mask(med_mask, width_px=3.2)
        let_bev = _bevel_mask(let_mask, width_px=1.5)
        brd_bev = _bevel_mask(border_groove, width_px=2.4)

        decal_height = (
            0.34 * pebble * stipple_zone
            - 0.36 * med_bev
            + 0.76 * let_bev
            - 0.48 * brd_bev
        )
        # Smooth matte-satin rubber medallion recess with raised crisp molded eagle emblem & lettering
        _mix(albedo, (0.074, 0.078, 0.084), med_mask * 0.82)
        _mix(albedo, (0.218, 0.226, 0.240), let_mask * 0.82)
        _mix(rgh, 0.68, med_mask * 0.88)
        _mix(rgh, 0.52, let_mask * 0.86)
        _mix(met, 0.0, np.maximum(panel_fill, np.maximum(med_mask, border_groove)))
        ao *= 1.0 - 0.32 * brd_bev - 0.20 * (med_mask - med_bev)

        # Firewall guarantee: strictly zero cross-bleed in the safety-orange follower box [0.010..0.230] x [0.755..0.990]
        decal_nrm = _height_to_normal_01(decal_height, strength=3.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.16, 0.96)
        met = np.clip(met, 0.0, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_grip_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_grip_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "deagle_v3_grip_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved deagle_v3_grip_{albedo,normal,roughness}.webp (2048x2048)")

    process_hero_atlas()
    process_steel_atlas()
    process_grip_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "deagle.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16
DEAGLE_GRIP_ANGLE = math.radians(-15.0)

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


# Exact 23 solid Desert Eagle Mark XIX parts split across 3 dedicated 2048x2048 PBR suites
# (skipping ONLY dynamic GPU spring `deagle_recoil_springs` carrying `aSpringParam`!)
HERO_PARTS = [
    "deagle_barrel",
    "deagle_slide",
    "deagle_frame",
]

STEEL_PARTS = [
    "deagle_bolt",
    "deagle_cam_pin",
    "deagle_firing_pin",
    "deagle_extractor",
    "deagle_safety",
    "deagle_front_sight",
    "deagle_rear_sight",
    "deagle_recoil_rods",
    "deagle_takedown_lever",
    "deagle_slide_stop",
    "deagle_mag_catch",
    "deagle_hammer",
    "deagle_hammer_strut",
    "deagle_trigger",
    "deagle_sear",
    "deagle_mag_body",
    "deagle_mag_spring",
]

GRIP_PARTS = [
    "deagle_grip",
    "deagle_mag_follower",
    "deagle_mag_baseplate",
]

# Exterior parts that receive assembled inter-part contact AO (internal parts get pure crisp Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "deagle_barrel",
    "deagle_slide",
    "deagle_frame",
    "deagle_safety",
    "deagle_front_sight",
    "deagle_rear_sight",
    "deagle_takedown_lever",
    "deagle_slide_stop",
    "deagle_mag_catch",
    "deagle_grip",
    "deagle_hammer",
    "deagle_trigger",
    "deagle_mag_baseplate",
}

ASSEMBLED_POS = {
    "deagle_barrel":         ( 0.000,  0.000,  0.000),
    "deagle_slide":          ( 0.000,  0.000,  0.000),
    "deagle_bolt":           (-1.450,  2.600,  0.000),
    "deagle_cam_pin":        (-2.250,  2.600,  0.000),
    "deagle_firing_pin":     (-4.550,  2.600,  0.000),
    "deagle_extractor":      (-0.850,  2.600,  0.000),
    "deagle_safety":         (-7.350,  2.680,  0.000),
    "deagle_front_sight":    (15.050,  4.160,  0.000),
    "deagle_rear_sight":     (-7.850,  4.160,  0.000),
    "deagle_recoil_rods":    ( 0.000,  0.000,  0.000),
    "deagle_frame":          ( 0.000,  0.000,  0.000),
    "deagle_takedown_lever": ( 3.150,  0.360,  0.000),
    "deagle_slide_stop":     (-0.850,  0.420, -1.380),
    "deagle_mag_catch":      (-2.480, -2.180,  0.000),
    "deagle_grip":           ( 0.000,  0.000,  0.000),
    "deagle_hammer":         (-7.550,  0.620,  0.000),
    "deagle_hammer_strut":   (-8.150, -3.850,  0.000),
    "deagle_trigger":        ( 0.350, -0.350,  0.000),
    "deagle_sear":           (-6.680,  0.450,  0.000),
    "deagle_mag_body":       (-5.350, -4.650,  0.000),
    "deagle_mag_follower":   (-6.334, -8.321,  0.000),
    "deagle_mag_spring":     (-6.546, -9.113,  0.000),
    "deagle_mag_baseplate":  (-6.769, -9.947,  0.000),
}

ASSEMBLED_ROT_THREE = {
    "deagle_hammer_strut":  (0.0, 0.0, DEAGLE_GRIP_ANGLE),
    "deagle_mag_body":      (0.0, 0.0, DEAGLE_GRIP_ANGLE),
    "deagle_mag_follower":  (0.0, 0.0, DEAGLE_GRIP_ANGLE),
    "deagle_mag_spring":    (0.0, 0.0, DEAGLE_GRIP_ANGLE),
    "deagle_mag_baseplate": (0.0, 0.0, DEAGLE_GRIP_ANGLE),
}

# Ground-truth CSG reference bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "deagle_barrel":         ((-1.048,  0.450, -1.410), (15.995,  4.190,  1.410)),
    "deagle_slide":          ((-9.555,  0.850, -1.440), (15.410,  4.190,  1.440)),
    "deagle_bolt":           ((-1.920, -0.757, -0.757), ( 1.310,  0.757,  0.757)),
    "deagle_cam_pin":        ((-0.320, -0.310, -0.240), ( 0.320,  0.860,  0.240)),
    "deagle_firing_pin":     ((-4.270, -0.270, -0.270), ( 4.245,  0.270,  0.270)),
    "deagle_extractor":      ((-0.982, -0.080,  0.240), ( 0.710,  0.240,  0.660)),
    "deagle_safety":         ((-0.455, -0.369, -1.620), ( 1.580,  0.362,  1.620)),
    "deagle_front_sight":    ((-0.536, -0.120, -0.660), ( 0.538,  0.535,  0.660)),
    "deagle_rear_sight":     ((-0.541, -0.120, -0.830), ( 0.584,  0.540,  0.830)),
    "deagle_recoil_rods":    (( 2.040,  0.814, -0.850), (13.720,  1.546,  0.850)),
    "deagle_frame":          ((-10.475,-10.233,-1.340), (15.776,  1.050,  1.340)),
    "deagle_takedown_lever": ((-1.405, -0.280, -1.490), ( 0.310,  0.280,  1.520)),
    "deagle_slide_stop":     ((-2.540, -0.340, -0.190), ( 2.110,  0.490,  0.540)),
    "deagle_mag_catch":      ((-0.406, -0.616, -1.510), ( 0.406,  0.476,  1.380)),
    "deagle_grip":           ((-9.335,-10.200, -1.607), (-2.634, -0.788,  1.607)),
    "deagle_hammer":         ((-2.858, -0.280, -0.280), ( 0.327,  1.141,  0.280)),
    "deagle_hammer_strut":   ((-0.276, -3.560, -0.280), ( 0.276,  4.490,  0.280)),
    "deagle_trigger":        ((-7.090, -2.369, -0.925), ( 0.444,  0.970,  0.925)),
    "deagle_sear":           ((-0.784, -0.260, -0.675), ( 0.440,  0.840,  0.675)),
    "deagle_mag_body":       ((-2.040, -5.841, -0.780), ( 2.040,  5.300,  0.780)),
    "deagle_mag_follower":   ((-1.860, -0.820, -0.630), ( 1.860,  0.614,  0.630)),
    "deagle_mag_spring":     ((-1.490, -0.731, -0.570), ( 1.490,  0.553,  0.570)),
    "deagle_mag_baseplate":  ((-2.411, -0.823, -1.035), ( 2.919,  0.618,  1.035)),
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
    world.light_settings.distance = 1.2

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
    edge_srgb: tuple[float, float, float] = (0.86, 0.88, 0.91),
    grain_scale: float = 30.0,
    grain_bump: float = 0.025,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 64.0,
    rough_var: float = 0.035,
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
    n_macro.inputs["Scale"].default_value = 0.85
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
        mix_edge_r.inputs[3].default_value = max(0.11, roughness - 0.14)
        nt.links.new(mul_w.outputs["Value"], mix_edge_r.inputs[0])
        nt.links.new(rgh_sock, mix_edge_r.inputs[2])
        rgh_sock = mix_edge_r.outputs[0]

        if metallic > 0.35:
            mix_edge_m = nt.nodes.new("ShaderNodeMix")
            mix_edge_m.data_type = "FLOAT"
            mix_edge_m.inputs[3].default_value = 0.98
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


def _build_deagle_piston_mat() -> bpy.types.Material:
    """Short-stroke stainless gas piston rod with golden-straw/bronze/violet heat temper & carbon soot crown."""
    mat = bpy.data.materials.new("H_GasPistonHeat")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Gas piston spans Object X in [13.50 .. 15.41]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 13.50
    mr_x.inputs["From Max"].default_value = 15.41
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (42.0, 2.5, 2.5)
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])
    n_lathe = nt.nodes.new("ShaderNodeTexNoise")
    n_lathe.inputs["Scale"].default_value = 1.6
    n_lathe.inputs["Detail"].default_value = 3.0
    nt.links.new(mapping.outputs["Vector"], n_lathe.inputs["Vector"])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.80, 0.82, 0.85)
    cr.elements[1].position = 0.48
    cr.elements[1].color = srgb_to_lin(0.79, 0.81, 0.84)
    for pos, rgb in (
        (0.64, (0.80, 0.70, 0.44)),  # golden straw heat temper
        (0.76, (0.65, 0.46, 0.25)),  # warm bronze temper
        (0.85, (0.40, 0.35, 0.50)),  # violet-blue temper
        (0.92, (0.20, 0.18, 0.17)),  # soot rim
        (0.96, (0.075, 0.074, 0.076)),  # charred crown
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr_x.outputs["Result"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.55
    rr.elements[0].color = (0.15, 0.15, 0.15, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.84, 0.84, 0.84, 1.0)
    el_r = rr.elements.new(0.80)
    el_r.color = (0.28, 0.28, 0.28, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.86
    rm.elements[0].color = (0.97, 0.97, 0.97, 1.0)
    rm.elements[1].position = 0.96
    rm.elements[1].color = (0.10, 0.10, 0.10, 1.0)
    nt.links.new(mr_x.outputs["Result"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.018
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.025
    bump.inputs["Distance"].default_value = 0.015
    nt.links.new(n_lathe.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_muzzle_crown_soot_mat() -> bpy.types.Material:
    """Recessed 11-deg target muzzle crown & bore throat with realistic .50 AE gunpowder carbon halo."""
    mat = bpy.data.materials.new("H_BarrelCrownSoot")
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
    mix_c.inputs[6].default_value = srgb_to_lin(0.11, 0.112, 0.120)
    mix_c.inputs[7].default_value = srgb_to_lin(0.24, 0.248, 0.262)
    nt.links.new(n_soot.outputs["Fac"], mix_c.inputs[0])

    rgh_mr = nt.nodes.new("ShaderNodeMapRange")
    rgh_mr.inputs["From Min"].default_value = 0.25
    rgh_mr.inputs["From Max"].default_value = 0.75
    rgh_mr.inputs["To Min"].default_value = 0.56
    rgh_mr.inputs["To Max"].default_value = 0.82
    nt.links.new(n_soot.outputs["Fac"], rgh_mr.inputs["Value"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(rgh_mr.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.55

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.018
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.045
    bump.inputs["Distance"].default_value = 0.015
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- HERO SUITE (deagle_v3_hero: barrel, slide, frame) ---
        # Lustrous Directional CNC Brushed Satin 416 Stainless Steel (R=0.18..0.32, Leica softbox sheen!)
        "H_BrushedStainless": _build_pbr_mat(
            "H_BrushedStainless",
            base_srgb=(0.745, 0.768, 0.798),
            roughness=0.225,
            metallic=0.965,
            bevel_r=0.030,
            edge_wear=0.0,  # Zero vertex-Pointiness triangulation streaks on large flat stainless walls!
            edge_srgb=(0.90, 0.92, 0.95),
            grain_scale=38.0,
            grain_bump=0.014,
            aniso_stretch=(0.12, 4.4, 4.4),
            rough_var=0.032,
        ),
        # Mirror-Satin Polished Hard Chrome (top rail flats, feed ramp, frame rails, crown bevel)
        "H_MirrorChrome": _build_pbr_mat(
            "H_MirrorChrome",
            base_srgb=(0.815, 0.835, 0.865),
            roughness=0.160,
            metallic=0.980,
            bevel_r=0.026,
            edge_wear=0.14,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=34.0,
            grain_bump=0.010,
            aniso_stretch=(0.24, 4.2, 4.2),
            rough_var=0.022,
        ),
        # Darker Bead-Blasted Matte Stainless (barrel/slide lightening flutes, subtle matte flats)
        "H_BeadBlastedSatin": _build_pbr_mat(
            "H_BeadBlastedSatin",
            base_srgb=(0.560, 0.585, 0.620),
            roughness=0.33,
            metallic=0.925,
            bevel_r=0.024,
            edge_wear=0.28,
            edge_srgb=(0.82, 0.84, 0.88),
            grain_scale=74.0,
            grain_bump=0.040,
            voronoi_grain=0.56,
            voronoi_scale=108.0,
            rough_var=0.042,
        ),
        # Deep Machined Recesses (Picatinny cross-slots, serration roots, bore, rail channels, magwell)
        "H_MilledRecess": _build_pbr_mat(
            "H_MilledRecess",
            base_srgb=(0.165, 0.175, 0.192),
            roughness=0.42,
            metallic=0.84,
            bevel_r=0.018,
            grain_scale=44.0,
            grain_bump=0.032,
            rough_var=0.055,
        ),
        "H_BarrelCrownSoot": _build_muzzle_crown_soot_mat(),
        "H_GasPistonHeat": _build_deagle_piston_mat(),

        # --- STEEL SUITE (deagle_v3_steel: 17 internal, control & magazine metal parts) ---
        "S_BrushedStainless": _build_pbr_mat(
            "S_BrushedStainless",
            base_srgb=(0.745, 0.768, 0.798),
            roughness=0.19,
            metallic=0.965,
            bevel_r=0.024,
            edge_wear=0.22,
            edge_srgb=(0.89, 0.91, 0.94),
            grain_scale=34.0,
            grain_bump=0.020,
            aniso_stretch=(0.24, 4.2, 4.2),
            rough_var=0.032,
        ),
        "S_DarkNitride": _build_pbr_mat(
            "S_DarkNitride",
            base_srgb=(0.145, 0.152, 0.166),
            roughness=0.25,
            metallic=0.88,
            bevel_r=0.026,
            edge_wear=0.46,
            edge_srgb=(0.72, 0.75, 0.80),
            grain_scale=34.0,
            grain_bump=0.030,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.055,
        ),
        "S_MachinedDark": _build_pbr_mat(
            "S_MachinedDark",
            base_srgb=(0.105, 0.112, 0.124),
            roughness=0.44,
            metallic=0.80,
            bevel_r=0.016,
            grain_scale=42.0,
            grain_bump=0.030,
        ),
        "S_MagBluedSteel": _build_pbr_mat(
            "S_MagBluedSteel",
            base_srgb=(0.182, 0.200, 0.232),
            roughness=0.235,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.0,  # Zero vertex-Pointiness triangulation rays around 7 witness holes!
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=36.0,
            grain_bump=0.020,
            aniso_stretch=(2.8, 0.4, 2.8),
            rough_var=0.045,
        ),
        "S_BoltFaceSoot": _build_pbr_mat(
            "S_BoltFaceSoot",
            base_srgb=(0.205, 0.195, 0.185),
            roughness=0.52,
            metallic=0.72,
            bevel_r=0.016,
            grain_scale=48.0,
            grain_bump=0.040,
            rough_var=0.080,
        ),
        "S_SpringSteel": _build_pbr_mat(
            "S_SpringSteel",
            base_srgb=(0.44, 0.47, 0.51),
            roughness=0.25,
            metallic=0.93,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.016,
        ),
        "S_SightWhite": _build_pbr_mat(
            "S_SightWhite",
            base_srgb=(0.94, 0.95, 0.96),
            roughness=0.22,
            metallic=0.00,
            bevel_r=0.010,
            grain_scale=24.0,
            grain_bump=0.006,
            rough_var=0.015,
        ),

        # --- GRIP SUITE (deagle_v3_grip: sculpted rubber grip, baseplate, firewalled orange follower) ---
        # Satin-molded ergonomic elastomer outer rim (contrasts matte 2K stippled palm panel!)
        "G_RubberSmooth": _build_pbr_mat(
            "G_RubberSmooth",
            base_srgb=(0.114, 0.119, 0.128),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.16,
            edge_srgb=(0.205, 0.214, 0.228),
            grain_scale=62.0,
            grain_bump=0.045,
            voronoi_grain=0.36,
            voronoi_scale=78.0,
            rough_var=0.045,
        ),
        "G_RubberStipple": _build_pbr_mat(
            "G_RubberStipple",
            base_srgb=(0.084, 0.088, 0.094),
            roughness=0.88,
            metallic=0.00,
            bevel_r=0.022,
            edge_wear=0.06,
            edge_srgb=(0.160, 0.168, 0.178),
            grain_scale=96.0,
            grain_bump=0.42,
            voronoi_grain=0.92,
            voronoi_scale=96.0,
            rough_var=0.046,
        ),
        "G_BluedHardware": _build_pbr_mat(
            "G_BluedHardware",
            base_srgb=(0.142, 0.150, 0.165),
            roughness=0.24,
            metallic=0.88,
            bevel_r=0.020,
            edge_wear=0.42,
            edge_srgb=(0.70, 0.74, 0.80),
            grain_scale=32.0,
            grain_bump=0.022,
        ),
        "G_StainlessHardware": _build_pbr_mat(
            "G_StainlessHardware",
            base_srgb=(0.76, 0.785, 0.815),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.018,
            grain_scale=28.0,
            grain_bump=0.018,
        ),
        "G_FollowerOrange": _build_pbr_mat(
            "G_FollowerOrange",
            base_srgb=(0.88, 0.31, 0.075),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.028,
            edge_wear=0.15,
            edge_srgb=(0.96, 0.50, 0.24),
            grain_scale=34.0,
            grain_bump=0.022,
            rough_var=0.035,
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


def mk_lathe_x(
    name: str,
    pts_r_x: list[tuple[float, float]],
    segs: int = 40,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight solid of revolution around Three.js +X from [(r, x), ...]."""
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


def mk_triangular_flute_cutter(
    name: str,
    length: float,
    end_ramp: float,
    hy_out: float,
    hy_in: float,
    depth: float,
    z_out: float = 0.20,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Convex 8-vertex trapezoidal/triangular flute cutter with smooth ramped ends (outward normals)."""
    hx_out = length * 0.5
    hx_in = max(0.05, hx_out - end_ramp)
    coords = [
        (-hx_out, -hy_out, z_out),
        ( hx_out, -hy_out, z_out),
        ( hx_out,  hy_out, z_out),
        (-hx_out,  hy_out, z_out),
        (-hx_in,  -hy_in, -depth),
        ( hx_in,  -hy_in, -depth),
        ( hx_in,   hy_in, -depth),
        (-hx_in,   hy_in, -depth),
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


def mk_beveled_groove_cutter(
    name: str,
    w_out: float,
    w_in: float,
    height: float,
    depth: float,
    z_out: float = 0.16,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Trapezoidal beveled cocking serration cutter (wider at surface -> crisp chamfered steel ribs!)."""
    hwo, hwi = w_out * 0.5, w_in * 0.5
    hh = height * 0.5
    coords = [
        (-hwo, -hh, z_out),
        ( hwo, -hh, z_out),
        ( hwo,  hh, z_out),
        (-hwo,  hh, z_out),
        (-hwi, -hh + 0.06, -depth),
        ( hwi, -hh + 0.06, -depth),
        ( hwi,  hh - 0.06, -depth),
        (-hwi,  hh - 0.06, -depth),
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

    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        if i == 0:
            tang = (pts[1] - pts[0]).normalized()
        elif i == len(pts) - 1:
            tang = (pts[-1] - pts[-2]).normalized()
        else:
            tang = (pts[i + 1] - pts[i - 1]).normalized()
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
            off = (n_vec * math.cos(th) + b_vec * math.sin(th)) * wire_r
            ring.append(bm.verts.new(p + off))
        rings.append(ring)

    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_knurled_cyl(
    name: str,
    radius: float,
    length: float,
    axis: str = "z",
    flutes: int = 20,
    depth: float = 0.016,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.015, length * 0.14, radius * 0.14)
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
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
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
                # Lock planar machined +-Z cheeks (Blender Y axis) & big planar facets optically flat!
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
# 23 AAA HARD-SURFACE DESERT EAGLE MARK XIX (.50 AE) PART BUILDERS
# =============================================================================

def _mk_polygonal_rifling_sleeve(mat: bpy.types.Material) -> bpy.types.Object:
    """Closed watertight 6-land helical right-hand polygonal rifling bore sleeve (1:19\" = 48.26 cm)."""
    x_start, x_end = 1.96, 15.80
    center_y = 2.60
    r_outer = 0.544  # strictly inside 0.545 bore wall
    r_mean = 0.525
    amp = 0.017
    lobes = 6
    twist_len = 48.26
    r_segs = 48
    a_segs = 26
    twist_tot = ((x_end - x_start) / twist_len) * 2.0 * math.pi

    bm = bmesh.new()
    in_rings = []
    out_rings = []
    for i in range(a_segs + 1):
        u = i / a_segs
        x = x_start + (x_end - x_start) * u
        phase = u * twist_tot
        ir, orng = [], []
        for j in range(r_segs):
            th = (j / r_segs) * 2.0 * math.pi
            r_in = r_mean - amp * math.cos(lobes * (th - phase))
            ir.append(bm.verts.new((x, center_y + math.cos(th) * r_in, math.sin(th) * r_in)))
            orng.append(bm.verts.new((x, center_y + math.cos(th) * r_outer, math.sin(th) * r_outer)))
        in_rings.append(ir)
        out_rings.append(orng)

    for i in range(a_segs):
        for j in range(r_segs):
            jn = (j + 1) % r_segs
            bm.faces.new((in_rings[i][j], in_rings[i + 1][j], in_rings[i + 1][jn], in_rings[i][jn]))
            bm.faces.new((out_rings[i][j], out_rings[i][jn], out_rings[i + 1][jn], out_rings[i + 1][j]))
    # End caps sealing inner & outer sleeves into a 100% manifold solid tube!
    for j in range(r_segs):
        jn = (j + 1) % r_segs
        bm.faces.new((in_rings[0][j], in_rings[0][jn], out_rings[0][jn], out_rings[0][j]))
        bm.faces.new((in_rings[-1][j], out_rings[-1][j], out_rings[-1][jn], in_rings[-1][jn]))

    _apply_three_xform(bm, [])
    return _bm_to_obj("bbl_rifling", bm, mat)


def build_deagle_barrel(mats: dict) -> bpy.types.Object:
    """B-01: Iconic 6\" Monolithic Fixed Triangular Mark XIX Barrel w/ Integral Weaver Rail,
    Sculpted Lightening Flutes, 11-deg Target Muzzle Crown, 6-Land Polygonal Rifling & Gas Cylinder."""
    m_st = mats["H_BrushedStainless"]
    m_mc = mats["H_MirrorChrome"]
    m_bb = mats["H_BeadBlastedSatin"]
    m_dk = mats["H_MilledRecess"]
    m_cr = mats["H_BarrelCrownSoot"]

    # 1. Signature Multi-Faceted Polygonal Mark XIX Cross-Section in (Z, Y) extruded X in [1.86, 15.99]
    #    Note: X=1.86 leaves crisp 0.2mm machined parting seam against slide breech hood at X=1.84!
    tri_zy = [
        (-1.14, 1.70),
        ( 1.14, 1.70),
        ( 1.38, 1.94),
        ( 1.38, 2.38),
        ( 0.84, 3.84),
        ( 0.76, 3.92),
        ( 0.94, 4.03),
        ( 0.86, 4.16),
        (-0.86, 4.16),
        (-0.94, 4.03),
        (-0.76, 3.92),
        (-0.84, 3.84),
        (-1.38, 2.38),
        (-1.38, 1.94),
    ]
    body = mk_extrude_x("bbl_body", tri_zy, 1.88, 15.96, bevel=0.036, bevel_segs=3, long_bevel=0.022, mat=m_st)

    # 2. Rear 7-Lug Cylindrical Barrel Extension (X in [-0.62, +1.94]) + Scooped Mirror Feed Ramp
    chamber_ring = mk_cyl("bbl_chamb", 0.95, 0.95, 2.56, "x", 44, [("t", 0.66, 2.60, 0.0)], m_mc, bevel=0.025)
    feed_raw = mk_box("bbl_fr_raw", 0.72, 0.74, 0.94, [("rz", 0.52), ("t", -0.56, 1.78, 0.0)], m_mc, bevel=0.02)
    ramp_scoop = mk_cyl(
        "c_ramp", 0.38, 0.44, 1.10, "x", 24, [("rz", -0.50), ("t", -0.68, 2.02, 0.0)], m_mc
    )
    feed_ramp = bool_subtract(feed_raw, [ramp_scoop])

    # 3. Under-Barrel Gas Conduit Web, Honed Front Muzzle Gas Block & Brazed Front Gas Plug
    gas_web = mk_box("bbl_gweb", 11.65, 0.26, 0.96, [("t", 8.95, 1.84, 0.0)], m_st, bevel=0.02)
    gas_boss = mk_cyl("bbl_gboss", 0.43, 0.43, 1.96, "x", 36, [("t", 14.90, 1.48, 0.0)], m_st, bevel=0.025)
    gas_plug = mk_cyl("bbl_gplug", 0.34, 0.34, 0.28, "x", 28, [("t", 15.78, 1.48, 0.0)], m_mc, bevel=0.02)

    # Bottom Frame Takedown Locking Lug (X in [2.42, 3.92], Y in [0.45, 1.82], Z in [-0.46, +0.46])
    lug_xy = [(2.42, 1.82), (3.92, 1.82), (3.78, 0.45), (2.56, 0.45)]
    lock_lug = mk_extrude_z("bbl_llug", lug_xy, -0.46, 0.46, bevel=0.02, mat=m_st)

    raw_bbl = bool_union([body, chamber_ring, feed_ramp, gas_web, gas_boss, gas_plug, lock_lug], "bbl_raw")

    cutters = []
    # .50 AE (12.7 mm) Bore & Stepped Chamber
    cutters.append(mk_cyl("c_bore", 0.545, 0.545, 17.4, "x", 44, [("t", 7.70, 2.60, 0.0)], m_dk))
    cutters.append(mk_cyl("c_chamb", 0.590, 0.590, 2.48, "x", 40, [("t", 0.68, 2.60, 0.0)], m_dk))

    # 7-Lug Barrel Extension Locking Mortises matching our 7-lug rifle-style rotary bolt (skip k=2 extractor at +Z!)
    for k in (0, 1, 3, 4, 5, 6, 7):
        ang = k * math.pi * 0.25
        cutters.append(
            mk_box(f"c_lug_{k}", 0.76, 0.36, 0.30, [("t", -0.34, 0.64, 0.0), ("rx", ang), ("t", 0.0, 2.60, 0.0)], m_dk)
        )

    # Crisp 2-Stage Recessed 11-deg Target Muzzle Crown Dish (single watertight lathe cutter — zero coplanar overlap!)
    cutters.append(
        mk_lathe_x(
            "c_crown",
            [
                (0.0, 15.76),
                (0.515, 15.76),
                (0.680, 15.920),
                (0.760, 15.965),
                (0.780, 16.08),
                (0.0, 16.08),
            ],
            segs=48,
            xform=[("t", 0.0, 2.60, 0.0)],
            mat=m_cr,
        )
    )

    # Angled Desert Eagle Lower Muzzle Face Bevel
    cutters.append(mk_box("c_mbev", 0.85, 1.45, 3.20, [("rz", 0.24), ("t", 16.34, 1.94, 0.0)], m_mc))

    # Central Anti-Glare Top Sighting Channel along Weaver Rail w/ crisp 45-deg chamfered upper lips
    sgut_zy = [
        (-0.17, 4.10),
        ( 0.17, 4.10),
        ( 0.17, 4.135),
        ( 0.215, 4.180),
        ( 0.215, 4.260),
        (-0.215, 4.260),
        (-0.215, 4.180),
        (-0.17, 4.135),
    ]
    cutters.append(mk_extrude_x("c_sgut", sgut_zy, 2.00, 14.60, mat=m_bb))

    # 8 Integral Mark XIX Precision-Beveled Weaver / Picatinny Scope Rail Cross-Slots (X = 3.25 .. 12.21)
    # Single chamfered trapezoidal prism per slot -> crisp 45-deg top edges, zero coplanar boolean seams!
    for i in range(8):
        sx = 3.25 + i * 1.28
        slot_xy = [
            (sx - 0.26, 4.005),
            (sx + 0.26, 4.005),
            (sx + 0.26, 4.122),
            (sx + 0.306, 4.168),
            (sx + 0.306, 4.290),
            (sx - 0.306, 4.290),
            (sx - 0.306, 4.168),
            (sx - 0.26, 4.122),
        ]
        cutters.append(mk_extrude_z(f"c_slot_{i}", slot_xy, -1.06, 1.06, mat=m_dk))

    # Front Sight Dovetail Slot at X = 15.05
    cutters.append(mk_box("c_fsdt", 0.56, 0.15, 2.04, [("t", 15.05, 4.13, 0.0)], m_dk))

    # Mark XIX Signature Sculpted Triangular Lightening Flutes on Upper Angled Flanks (Y in [3.08, 3.64])
    # Positioned cleanly ABOVE the smooth lower triangular cheek (Y in [2.38, 2.98]) so .50 AE markings stay razor-flat!
    flank_slope = math.atan2(1.38 - 0.84, 3.84 - 2.38)  # 0.354 rad (20.3 deg)
    for sign in (-1.0, 1.0):
        # Upper wide sculpted lightening flute (bead-blasted matte satin interior contrasting brushed cheeks!)
        xf = [("ry", math.pi)] if sign < 0 else []
        xf += [("rx", -sign * flank_slope), ("t", 8.75, 3.36, sign * 1.018)]
        cutters.append(
            mk_triangular_flute_cutter(
                f"c_flute_{int(sign)}",
                length=10.2,
                end_ramp=0.72,
                hy_out=0.25,
                hy_in=0.065,
                depth=0.145,
                xform=xf,
                mat=m_bb,
            )
        )

    # Honed Front Gas Cylinder Bore + Continuous Piston Clearance Arch (single coaxial cylinder -> zero sliver seam!)
    cutters.append(mk_cyl("c_gcyl", 0.355, 0.355, 7.145, "x", 32, [("t", 12.0475, 1.48, 0.0)], m_dk))

    # Diagonal Under-Bore Gas Bleed Port + Longitudinal Conduit + Vertical Plenum Tap (visible in [C] cutaway!)
    cutters.append(mk_cyl("c_gport1", 0.09, 0.09, 0.64, "y", 16, [("rz", -0.52), ("t", 3.55, 2.05, 0.0)], m_dk))
    cutters.append(mk_cyl("c_gport2", 0.075, 0.075, 12.00, "x", 16, [("t", 9.49, 1.95, 0.0)], m_dk))
    cutters.append(mk_cyl("c_gport3", 0.09, 0.09, 0.56, "y", 14, [("t", 15.45, 1.72, 0.0)], m_dk))

    # Semicircular Takedown Cross-Cam Notch in Lower Locking Lug
    cutters.append(mk_cyl("c_tdn", 0.26, 0.26, 1.20, "z", 22, [("t", 3.15, 0.45, 0.0)], m_dk))

    hollowed = bool_subtract(raw_bbl, cutters)
    rifling = _mk_polygonal_rifling_sleeve(m_dk)
    obj = join_objects([hollowed, rifling], "deagle_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=28.0, lock_flat_walls=True)


def build_deagle_slide(mats: dict) -> bpy.types.Object:
    """B-02: Open-Top Reciprocating Bridge Slide w/ 9 Deep 3D Beveled Slanted Cocking Serrations,
    Chamfered Ejection Port, Two-Tone Lightening Flutes & Heat-Tempered Integrated Forward Gas Piston."""
    m_st = mats["H_BrushedStainless"]
    m_mc = mats["H_MirrorChrome"]
    m_bb = mats["H_BeadBlastedSatin"]
    m_dk = mats["H_MilledRecess"]
    m_ps = mats["H_GasPistonHeat"]

    # Note: Slide bottom starts at Y=0.895 (vs frame top deck Y=0.875) -> crisp 0.2mm rail seam, ZERO Z-fighting!
    slide_zy = [
        (-1.41, 0.895),
        ( 1.41, 0.895),
        ( 1.41, 2.380),
        ( 0.86, 3.980),
        ( 0.86, 4.160),
        (-0.86, 4.160),
        (-0.86, 3.980),
        (-1.41, 2.380),
    ]
    hull = mk_extrude_x("sld_hull", slide_zy, -9.52, 13.82, bevel=0.036, bevel_segs=3, long_bevel=0.022, mat=m_st)

    cutters = []
    # 1. Open-Top Barrel Window (X >= 1.84, Y >= 1.64 -> crisp 0.2mm vertical & 0.6mm under-barrel clearance!)
    cutters.append(mk_box("c_opwin", 12.20, 2.92, 3.20, [("t", 7.94, 3.10, 0.0)], m_mc))
    # Center bridge channel (X in [1.84, 12.55]), preserving solid lower front crosspiece [12.55, 13.82]
    cutters.append(mk_box("c_bchan", 10.72, 1.02, 1.74, [("t", 7.20, 1.29, 0.0)], m_dk))

    # 2. Chamfered Flared Top-Right Ejection Port (X in [-0.62, +1.86]) exposing fluted 7-lug rotating bolt!
    cutters.append(mk_box("c_ej1", 2.52, 1.46, 2.08, [("t", 0.64, 3.65, 0.36)], m_dk))
    cutters.append(mk_box("c_ej2", 2.52, 1.86, 1.66, [("t", 0.64, 2.82, 0.86)], m_dk))
    # Crisp 45-deg brass-deflector flare bevels on rear, lower-right & top-left ejection port rims!
    cutters.append(mk_box("c_ejch_r", 0.48, 1.40, 1.25, [("ry", 0.44), ("t", -0.68, 2.92, 1.08)], m_mc))
    cutters.append(mk_box("c_ejch_b", 2.60, 0.16, 0.16, [("rx", math.pi * 0.25), ("t", 0.64, 1.90, 1.39)], m_mc))
    cutters.append(mk_box("c_ejch_t", 2.60, 0.14, 0.14, [("rx", math.pi * 0.25), ("t", 0.64, 4.14, -0.66)], m_mc))

    # 3. Internal Bolt Carrier Tunnel + Helical Cam-Pin Slot + Lower Frame Rail T-Grooves
    cutters.append(mk_cyl("c_btun", 1.02, 1.02, 10.60, "x", 34, [("t", -3.10, 2.60, 0.0)], m_dk))
    cutters.append(mk_box("c_cam", 1.44, 0.44, 0.56, [("ry", 0.46), ("t", -2.45, 3.32, -0.18)], m_dk))
    cutters.append(mk_box("c_fcav", 11.60, 1.05, 1.98, [("t", -3.75, 1.29, 0.0)], m_dk))
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_rail_{int(sign)}", 23.80, 0.22, 0.34, [("t", 2.20, 1.01, sign * 1.04)], m_dk))

    # Rear Hammer Strike Slot
    cutters.append(mk_box("c_hslot", 2.05, 2.38, 0.68, [("t", -8.85, 2.15, 0.0)], m_dk))

    # Angled Rear Slide Profile Bevel & Front Crosspiece Chin Bevel
    cutters.append(mk_box("c_rbev", 1.20, 3.80, 3.20, [("rz", -0.18), ("t", -9.92, 2.50, 0.0)], m_mc))
    cutters.append(mk_box("c_fbev", 0.75, 1.60, 3.20, [("rz", 0.24), ("t", 14.12, 1.25, 0.0)], m_mc))

    # Twin Front Recoil Rod Seat Bores (Y=1.18, Z=+-0.48)
    for sign in (-1.0, 1.0):
        cutters.append(mk_cyl(f"c_rrod_{int(sign)}", 0.22, 0.22, 1.50, "x", 22, [("t", 13.15, 1.18, sign * 0.48)], m_dk))

    # Transverse Safety Drum Bore (-7.35, 2.68) + Rear Sight Dovetail (-7.85, 4.13) + Left Slide-Stop Notch (-2.65)
    cutters.append(mk_cyl("c_saf", 0.42, 0.42, 3.10, "z", 28, [("t", -7.35, 2.68, 0.0)], m_dk))
    cutters.append(mk_box("c_rsdt", 0.58, 0.16, 2.10, [("t", -7.85, 4.13, 0.0)], m_dk))
    cutters.append(mk_box("c_ssnt", 0.72, 0.46, 0.55, [("t", -2.65, 1.04, -1.25)], m_dk))

    # Two-Tone Lightening Flutes on Forward Bridge Rails & Upper Breech Hood Shoulders
    slide_slope = math.atan2(1.41 - 0.86, 3.98 - 2.38)  # 0.331 rad (19.0 deg)
    for sign in (-1.0, 1.0):
        xf_rail = [("ry", math.pi)] if sign < 0 else []
        xf_rail += [("t", 7.25, 1.30, sign * 1.41)]
        cutters.append(
            mk_triangular_flute_cutter(
                f"c_rfl_{int(sign)}", length=9.2, end_ramp=0.58, hy_out=0.20, hy_in=0.055, depth=0.125, xform=xf_rail, mat=m_bb
            )
        )
        # Upper hood flute positioned strictly AHEAD of safety & red fire dot (X in [-5.25, -0.95])!
        xf_hood = [("ry", math.pi)] if sign < 0 else []
        xf_hood += [("rx", -sign * slide_slope), ("t", -3.10, 3.30, sign * 1.095)]
        cutters.append(
            mk_triangular_flute_cutter(
                f"c_hfl_{int(sign)}", length=4.3, end_ramp=0.48, hy_out=0.21, hy_in=0.055, depth=0.12, xform=xf_hood, mat=m_bb
            )
        )

    # 9 Deep 3D Beveled Slanted (-14 deg) Rear Cocking Serrations on BOTH Cheeks (Y in [1.06, 2.26], clean below safety!)
    for i in range(9):
        sx = -8.35 + i * 0.42
        for sign in (-1.0, 1.0):
            xf_s = [("ry", math.pi)] if sign < 0 else []
            xf_s += [("rz", -0.24), ("t", sx, 1.66, sign * 1.41)]
            cutters.append(
                mk_beveled_groove_cutter(
                    f"c_ser_{i}_{int(sign)}",
                    w_out=0.21,
                    w_in=0.11,
                    height=1.22,
                    depth=0.125,
                    z_out=0.18,
                    xform=xf_s,
                    mat=m_dk,
                )
            )

    carved = bool_subtract(hull, cutters)

    # 4. Integrated Forward-Pointing Mark XIX Short-Stroke Stainless Gas Piston (X in [13.50, 15.41], Y = 1.48)
    #    Single manifold Lathe profile with 3 crisp labyrinth gas-sealing lands & 2 deep gas-ring grooves!
    piston_profile = [
        (0.000, 13.500),
        (0.205, 13.500),
        (0.205, 13.860),
        (0.218, 13.900),
        (0.218, 14.810),
        (0.325, 14.832),  # Land 1
        (0.325, 14.956),
        (0.272, 14.968),  # Groove 1
        (0.272, 15.016),
        (0.325, 15.028),  # Land 2
        (0.325, 15.176),
        (0.272, 15.188),  # Groove 2
        (0.272, 15.236),
        (0.325, 15.248),  # Land 3
        (0.325, 15.355),
        (0.295, 15.408),  # Crown chamfer
        (0.000, 15.408),
    ]
    piston = mk_lathe_x("sld_piston", piston_profile, segs=36, xform=[("t", 0.0, 1.48, 0.0)], mat=m_ps)

    obj = join_objects([carved, piston], "deagle_slide")
    return finish_part(obj, bevel_w=0.0, sharp_deg=28.0, lock_flat_walls=True)


def build_deagle_frame(mats: dict) -> bpy.types.Object:
    """F-01: Heavy Forged Monolithic Brushed-Stainless Frame w/ Boat-Hull Dust Cover,
    Swept Undercut Beavertail, Recurved Serrated Finger-Hook Trigger Guard & Serrated Front Strap."""
    m_st = mats["H_BrushedStainless"]
    m_mc = mats["H_MirrorChrome"]
    m_dk = mats["H_MilledRecess"]

    # Main forged frame side profile (top deck at Y=0.875 leaves crisp 0.2mm seam below slide Y=0.895!)
    pts = [
        (-8.65,  0.875),
        (15.72,  0.875),
        (15.44, -0.200),
        ( 2.92, -0.200),
    ]
    pts += _quad_bez((2.92, -0.20), (2.48, -0.22), (2.28, -0.50), 8)
    pts.append((-1.72, -0.50))
    pts += _quad_bez((-1.72, -0.50), (-2.08, -0.58), (-2.05, -2.02), 10)
    pts.append((-3.82, -10.18))
    pts.append((-8.92, -9.78))
    pts.append((-6.98, -1.35))
    pts += _cubic_bez((-6.98, -1.35), (-6.75, -0.45), (-7.65, 0.05), (-9.65, 0.22), 14)
    pts += _quad_bez((-9.65, 0.22), (-10.48, 0.30), (-10.42, 0.54), 8)
    pts += _quad_bez((-10.42, 0.54), (-10.15, 0.78), (-8.65, 0.875), 8)

    main_body = mk_extrude_z("frm_body", pts, -1.325, 1.325, bevel=0.048, bevel_segs=2, mat=m_st)

    # Sweeping Contoured Recurved Combat Trigger Guard (solid outer minus smooth inner bow hole!)
    g_out = [(2.92, -0.18), (2.68, -1.85)]
    g_out += _quad_bez((2.68, -1.85), (3.02, -2.42), (2.88, -2.85), 8)
    g_out += _quad_bez((2.88, -2.85), (2.72, -3.32), (2.12, -3.34), 8)
    g_out.append((-1.58, -3.34))
    g_out += _cubic_bez((-1.58, -3.34), (-1.96, -3.30), (-1.92, -2.35), (-2.14, -2.05), 10)
    g_out.append((-1.95, -0.42))
    guard_solid = mk_extrude_z("frm_gsol", g_out, -0.64, 0.64, bevel=0.045, bevel_segs=2, mat=m_st)

    g_hole = [(2.05, -0.52)]
    g_hole += _quad_bez((2.05, -0.52), (2.22, -0.65), (2.20, -1.95), 10)
    g_hole += _quad_bez((2.20, -1.95), (2.18, -2.82), (1.65, -2.86), 8)
    g_hole.append((-1.32, -2.86))
    g_hole += _quad_bez((-1.32, -2.86), (-1.72, -2.78), (-1.72, -1.95), 8)
    g_hole.append((-1.54, -0.52))
    guard_cut = mk_extrude_z("c_ghole", g_hole, -0.90, 0.90, mat=m_dk)

    # Front finger-hook horizontal anti-slip serrations inset cleanly inside the trigger-guard front face
    # (Z in [-0.55, +0.55] keeps both outer +-0.64 side walls & bevels 100% smooth and unbroken!)
    guard_serrs = [guard_cut]
    for k in range(6):
        gy = -0.82 - k * 0.21
        gx = 2.86 - k * 0.032
        guard_serrs.append(mk_box(f"c_tgser_{k}", 0.16, 0.085, 1.10, [("t", gx, gy, 0.0)], m_dk))
    guard = bool_subtract(guard_solid, guard_serrs)

    # Full-Length CNC Mirror-Chrome Slide Guide Rails along Upper Frame Deck
    rail_l = mk_box("frm_railL", 22.40, 0.16, 0.25, [("t", 3.10, 0.96, -1.04)], m_mc, bevel=0.015)
    rail_r = mk_box("frm_railR", 22.40, 0.16, 0.25, [("t", 3.10, 0.96,  1.04)], m_mc, bevel=0.015)

    solid_frame = bool_union([main_body, guard, rail_l, rail_r], "frm_solid")

    cutters = [
        # 1. Dust-cover upper twin-channel bed for dual recoil springs & barrel locking lug
        mk_box("c_dbed", 13.60, 0.72, 1.88, [("t", 9.05, 0.62, 0.0)], m_dk),
        # 2. Internal FCG / Sear / Transfer-Bar Pocket + Rear Hammer Slot + Trigger Window
        mk_box("c_fcg", 10.80, 1.45, 1.84, [("t", -3.10, 0.32, 0.0)], m_dk),
        mk_box("c_hslot", 3.60, 1.15, 0.68, [("t", -8.90, 0.55, 0.0)], m_dk),
        mk_box("c_twind", 1.65, 1.25, 0.88, [("t", 0.18, -0.58, 0.0)], m_dk),
        # 3. Angled -15 deg .50 AE Magwell Rectangular Tunnel + Mag-Catch Cross-Bore
        mk_box("c_magw", 4.26, 13.80, 1.72, [("rz", DEAGLE_GRIP_ANGLE), ("t", -5.35, -4.65, 0.0)], m_dk),
        mk_cyl("c_mc", 0.42, 0.42, 2.95, "z", 24, [("t", -2.48, -2.18, 0.0)], m_dk),
    ]

    # Boat-hull 45 deg lower bevels along front dust cover
    for sign in (-1.0, 1.0):
        cutters.append(
            mk_box(f"c_boat_{int(sign)}", 13.30, 0.52, 0.52, [("rx", sign * 0.75), ("t", 9.20, -0.20, sign * 1.32)], m_mc)
        )

    # 11 Crisp Horizontal Traction Serrations across the exposed stainless front strap!
    for i in range(11):
        u = i / 10.0
        fx = -2.28 - u * 1.36
        fy = -2.85 - u * 6.30
        cutters.append(
            mk_box(f"c_fser_{i}", 0.18, 0.095, 2.80, [("rz", DEAGLE_GRIP_ANGLE), ("t", fx, fy, 0.0)], m_dk)
        )

    # Precision Cross-Pin Bores w/ subtle outer countersink chamfers
    for idx, (px, py, pr) in enumerate((
        ( 3.15,  0.36, 0.24),
        ( 0.35, -0.35, 0.16),
        (-6.68,  0.45, 0.14),
        (-7.55,  0.62, 0.17),
    )):
        cutters.append(mk_cyl(f"c_pin_{idx}", pr, pr, 3.10, "z", 24, [("t", px, py, 0.0)], m_dk))

    obj = bool_subtract(solid_frame, cutters)
    obj.name = "deagle_frame"
    obj.data.name = "deagle_frame"
    return finish_part(obj, bevel_w=0.0, sharp_deg=26.0, lock_flat_walls=True)


def build_deagle_grip(mats: dict) -> bpy.types.Object:
    """F-05: Organically Sculpted Wraparound Hogue/IMI Ergonomic Pebble-Stippled Rubber Grip.
    Parametrically lofted U-channel wrap with smooth palm swells, subtle finger-groove contours,
    recessed stipple panels, high thumb-web scallops & inset dark-blued gunsmith retention screws!"""
    m_sm = mats["G_RubberSmooth"]
    m_st = mats["G_RubberStipple"]
    m_hw = mats["G_BluedHardware"]

    # Sample vertical stations from bottom flush line (v=0) to top saddle (v=1)
    # Front seam: (-4.48, -10.12) -> (-2.72, -1.65)
    # Backstrap outer contour: smooth ergonomic arch (-9.25, -9.75) -> (-7.28, -1.25) -> top saddle
    def eval_backstrap(v: float):
        # Cubic bezier matching CSG backstrap arch
        p0 = (-9.25, -9.75)
        p1 = (-8.75, -7.25)
        p2 = (-7.95, -4.15)
        p3 = (-7.28, -1.25)
        u = 1.0 - v
        bx = u**3 * p0[0] + 3 * u * u * v * p1[0] + 3 * u * v * v * p2[0] + v**3 * p3[0]
        by = u**3 * p0[1] + 3 * u * u * v * p1[1] + 3 * u * v * v * p2[1] + v**3 * p3[1]
        return bx, by

    def eval_front(v: float):
        fx = -4.48 + (-2.72 - (-4.48)) * v
        fy = -10.12 + (-1.65 - (-10.12)) * v
        return fx, fy

    # Build smooth organic wraparound C-channel loft in Three.js coords directly!
    # Cross-section at each vertical station v (0..1) is a closed ring wrapping:
    #   outer right flank (front->rear) -> rounded outer backstrap -> outer left flank (rear->front) ->
    #   front-left rounded lip -> inner left wall (z=-1.355) -> inner rear wall -> inner right wall (z=+1.355) -> front-right lip
    n_v = 48
    n_flank = 18  # high-res smooth samples along each side flank (front -> rear)
    n_back = 14   # high-res samples around the rounded arched backstrap
    z_inner = 1.355  # strictly > frame +-1.325 -> ZERO coplanar overlap!

    bm = bmesh.new()
    rings = []

    for iv in range(n_v + 1):
        v = iv / n_v
        fx, fy = eval_front(v)
        bx, by = eval_backstrap(v)
        # Subtle ergonomic top thumb-web rise at top saddle (v > 0.88)
        top_taper = 1.0 - 0.14 * max(0.0, (v - 0.86) / 0.14) ** 2
        bot_taper = 1.0 - 0.05 * max(0.0, (0.08 - v) / 0.08) ** 2
        # Lush sculpted organic palm-swell envelope peaking at v ~ 0.45, tapering cleanly into rim
        palm_v = math.exp(-((v - 0.45) / 0.29) ** 2)
        # High thumb-web concave relief pinch right under the beavertail (v ~ 0.87)
        thumb_v = math.exp(-((v - 0.87) / 0.10) ** 2)
        # Hogue/IMI backstrap palm-heel swell
        heel_v = math.exp(-((v - 0.38) / 0.27) ** 2)
        # Pronounced sculpted front-edge ergonomic 3-finger swells along v in [0.14, 0.78]!
        if 0.14 <= v <= 0.78:
            u_fg = (v - 0.14) / 0.64
            fg_env = math.sin(u_fg * math.pi) ** 0.75
            finger_wave = 0.048 * math.sin(u_fg * 3.0 * 2.0 * math.pi) * fg_env
        else:
            finger_wave = 0.0

        # Inner frame backstrap surface sits near bx_in = -8.92 + (-6.98 - -8.92)*v
        bx_in = -8.92 + (-6.98 - (-8.92)) * v - 0.03  # 0.3mm behind frame steel tang -> zero clipping!
        by_in = -9.78 + (-1.35 - (-9.78)) * v

        # Top saddle contour lifts smoothly along top edge (v=1) matching CSG silhouette
        def saddle_y_boost(s_fr: float) -> float:
            if v < 0.85:
                return 0.0
            tv = (v - 0.85) / 0.15
            return tv * tv * 0.56 * math.sin(s_fr * math.pi)

        ring = []
        # 1) Right outer flank: s from 0 (front seam) to 1 (rear shoulder)
        for j in range(n_flank + 1):
            s = j / n_flank
            x = fx + (bx - fx) * s
            y = fy + (by - fy) * s + saddle_y_boost(s)
            palm_s = math.sin(s * math.pi) ** 1.08
            thumb_s = math.exp(-((s - 0.64) / 0.25) ** 2)
            fg_s = math.exp(-((s - 0.18) / 0.16) ** 2)
            z = (1.482 * bot_taper * top_taper) + 0.125 * palm_v * palm_s - 0.118 * thumb_v * thumb_s + finger_wave * fg_s
            z = max(z_inner + 0.072, min(1.606, z))
            if j == 0:
                z = z_inner + 0.082
            ring.append(bm.verts.new((x, y, z)))

        # 2) Rounded arched outer backstrap: angle th from 0 (right shoulder) to pi (left shoulder)
        z_sh = ring[-1].co.z
        x_sh, y_sh = ring[-1].co.x, ring[-1].co.y
        back_depth = 0.145 + 0.048 * heel_v - 0.03 * thumb_v
        for k in range(1, n_back):
            th = math.pi * k / n_back
            # Crisp molded horizontal backstrap traction ribs along mid-backstrap
            rib_bump = 0.018 * math.sin(v * 28.0 * math.pi) * (math.sin(th) ** 1.4) if (0.09 < v < 0.85) else 0.0
            rx = x_sh - (back_depth + rib_bump) * math.sin(th)
            ry = y_sh + 0.04 * math.sin(th)
            rz = z_sh * math.cos(th)
            ring.append(bm.verts.new((rx, ry, rz)))

        # 3) Left outer flank: s from 1 (rear shoulder) back to 0 (front seam)
        for j in range(n_flank, -1, -1):
            s = j / n_flank
            x = fx + (bx - fx) * s
            y = fy + (by - fy) * s + saddle_y_boost(s)
            palm_s = math.sin(s * math.pi) ** 1.08
            thumb_s = math.exp(-((s - 0.64) / 0.25) ** 2)
            fg_s = math.exp(-((s - 0.18) / 0.16) ** 2)
            z = (1.482 * bot_taper * top_taper) + 0.125 * palm_v * palm_s - 0.118 * thumb_v * thumb_s + finger_wave * fg_s
            z = max(z_inner + 0.072, min(1.606, z))
            if j == 0:
                z = z_inner + 0.082
            ring.append(bm.verts.new((x, y, -z)))

        # 4) Inner U-channel pocket wrapping cleanly around frame steel grip tang (z = +-1.355)
        ring.append(bm.verts.new((fx - 0.02, fy, -z_inner)))
        ring.append(bm.verts.new((bx_in, by_in, -z_inner)))
        ring.append(bm.verts.new((bx_in, by_in,  z_inner)))
        ring.append(bm.verts.new((fx - 0.02, fy,  z_inner)))
        rings.append(ring)

    n_ring = len(rings[0])
    r_idx0, r_idx1 = 0, n_flank
    l_idx0, l_idx1 = n_flank + n_back, 2 * n_flank + n_back

    # Keep ALL outer side flanks unified `G_RubberSmooth` (ZERO coarse quad staircase boundary!)
    # Full 2048x2048 pixel-accurate stippling, recessed border & IMI/MRI medallion are composited in `process_grip_atlas()`!
    # Backstrap retains tactile stipple material `G_RubberStipple` along mid-backstrap traction ribs.
    for iv in range(n_v):
        v_mid = (iv + 0.5) / n_v
        ra, rb = rings[iv], rings[iv + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            f = bm.faces.new((ra[k], ra[kn], rb[kn], rb[k]))
            is_back_panel = (r_idx1 <= k < l_idx0) and (0.08 < v_mid < 0.84)
            f.material_index = 1 if is_back_panel else 0

    # Clean planar end caps at bottom (iv=0) & top (iv=n_v) bridging outer ring to inner U-channel without n-gon self-intersections
    # Pair outer vertices smoothly to inner vertices so caps are 100% manifold quads!
    for cap_end, ring in ((0, rings[0]), (1, rings[-1])):
        # Right wall strip: outer[0..n_flank] <-> inner_right(n_ring-1 -> n_ring-2)
        in_fr_r = ring[n_ring - 1]
        in_rr_r = ring[n_ring - 2]
        in_rr_l = ring[n_ring - 3]
        in_fr_l = ring[n_ring - 4]
        # Right wall strip: outer[0..n_flank] <-> (in_fr_r, in_rr_r)
        mid_r = n_flank // 2
        for j in range(n_flank):
            a, b = ring[j], ring[j + 1]
            c = in_fr_r if j < mid_r else in_rr_r
            if cap_end == 0:
                bm.faces.new((b, a, c))
            else:
                bm.faces.new((a, b, c))
        if cap_end == 0:
            bm.faces.new((ring[mid_r], in_fr_r, in_rr_r))
        else:
            bm.faces.new((ring[mid_r], in_rr_r, in_fr_r))

        # Backstrap cap bridging ring[n_flank .. l_idx0] to (in_rr_r, in_rr_l)
        mid_b = n_flank + n_back // 2
        for k in range(n_flank, l_idx0):
            a, b = ring[k], ring[k + 1]
            c = in_rr_r if k < mid_b else in_rr_l
            if cap_end == 0:
                bm.faces.new((b, a, c))
            else:
                bm.faces.new((a, b, c))
        if cap_end == 0:
            bm.faces.new((ring[mid_b], in_rr_r, in_rr_l))
        else:
            bm.faces.new((ring[mid_b], in_rr_l, in_rr_r))

        # Left flank cap bridging ring[l_idx0 .. l_idx1] to (in_rr_l, in_fr_l)
        mid_l = l_idx0 + n_flank // 2
        for k in range(l_idx0, l_idx1):
            a, b = ring[k], ring[k + 1]
            c = in_rr_l if k < mid_l else in_fr_l
            if cap_end == 0:
                bm.faces.new((b, a, c))
            else:
                bm.faces.new((a, b, c))
        if cap_end == 0:
            bm.faces.new((ring[mid_l], in_rr_l, in_fr_l))
        else:
            bm.faces.new((ring[mid_l], in_fr_l, in_rr_l))

    # Fix: check if any edge on caps is degenerate (ring[n_ring-1] IS in_fr_r, so last cap loop doesn't duplicate!)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    degen = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degen:
        bmesh.ops.delete(bm, geom=degen, context="FACES")
    _apply_three_xform(bm, [])
    grip_body = _bm_to_obj("grip_loft", bm, m_sm)
    grip_body.data.materials.append(m_st)

    # Boolean clean mag-catch clearance cutout & recessed lower grip-pin/screw pockets
    cutters = [
        mk_cyl("c_gmc", 0.48, 0.48, 3.60, "z", 28, [("t", -2.48, -2.18, 0.0)], m_sm),
    ]
    for sign in (-1.0, 1.0):
        # Recessed screw/pin countersink pockets at lower-rear grip heel
        cutters.append(mk_cyl(f"c_gpin_{int(sign)}", 0.175, 0.175, 0.30, "z", 20, [("t", -8.15, -8.52, sign * 1.44)], m_sm))
    carved_grip = bool_subtract(grip_body, cutters)

    # Inset dark-blued slotted gunsmith grip retention screws on BOTH flanks!
    screws = []
    for sign in (-1.0, 1.0):
        scr_raw = mk_cyl(f"g_scr_{int(sign)}", 0.155, 0.155, 0.10, "z", 22, [("t", -8.15, -8.52, sign * 1.38)], m_hw, bevel=0.015)
        slot_c = mk_box(f"c_gscr_{int(sign)}", 0.34, 0.042, 0.09, [("rz", 0.38 * sign), ("t", -8.15, -8.52, sign * 1.43)], m_hw)
        screws.append(bool_subtract(scr_raw, [slot_c]))

    obj = join_objects([carved_grip, *screws], "deagle_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_deagle_bolt(mats: dict) -> bpy.types.Object:
    """B-03: Authentic Rifle-Style Fluted 7-Lug Rotating Bolt Head w/ Undercut Neck, Recessed .50 AE Breech Face,
    6 Longitudinal CNC Stem Flutes, Spring-Loaded Ejector Plunger, Stepped Extractor Mortise & Cam-Pin Bore."""
    m_st = mats["S_BrushedStainless"]
    m_dk = mats["S_MachinedDark"]
    m_so = mats["S_BoltFaceSoot"]

    # Closed axisymmetric manifold Lathe profile in (r, X): stem + undercut neck + rim + recessed face + fp bore
    bolt_prof = [
        (0.110, -1.92),
        (0.620, -1.92),
        (0.620,  0.52),
        (0.545,  0.54),
        (0.545,  0.68),
        (0.590,  0.68),
        (0.590,  1.25),
        (0.485,  1.25),
        (0.485,  1.10),
        (0.110,  1.10),
        (0.110, -1.92),
    ]
    core = mk_lathe_x("blt_core", bolt_prof, segs=48, mat=m_st)
    guide_top = mk_box("blt_gt", 1.72, 0.14, 0.24, [("t", -0.62, 0.62, 0.0)], m_st, bevel=0.016)
    strip_bot = mk_box("blt_sb", 1.45, 0.22, 0.28, [("t", 0.38, -0.64, 0.0)], m_st, bevel=0.016)

    # 7 radial AR-15/Mark XIX rifle-style locking lugs spaced every 45 deg (skip k=2 at +Z for extractor claw!)
    # Outer radius 0.765 stays within 0.01 cm of CSG_REF_BBOX (0.757) while showcasing unmistakable 7-lug geometry!
    lugs = []
    lug_xy = [(0.68, 0.46), (1.25, 0.46), (1.25, 0.715), (1.18, 0.765), (0.68, 0.765)]
    for k in (0, 1, 3, 4, 5, 6, 7):
        ang = k * math.pi * 0.25
        lugs.append(
            mk_extrude_z(f"blt_lug_{k}", lug_xy, -0.132, 0.132, bevel=0.018, bevel_segs=2, xform=[("rx", ang)], mat=m_st)
        )

    solid = bool_union([core, guide_top, strip_bot, *lugs], "blt_solid")

    cutters = [
        mk_box("c_ext", 1.52, 0.34, 0.48, [("t", 0.62, 0.08, 0.54)], m_dk),
        mk_cyl("c_epin", 0.075, 0.075, 0.68, "y", 18, [("t", 0.36, 0.08, 0.52)], m_dk),
        mk_cyl("c_ejcb", 0.105, 0.105, 0.72, "x", 20, [("t", 0.84, -0.18, -0.24)], m_dk),
        mk_cyl("c_ejrp", 0.048, 0.048, 0.74, "y", 16, [("t", 0.56, -0.18, -0.24)], m_dk),
        mk_cyl("c_cam", 0.210, 0.210, 1.44, "y", 24, [("t", -0.80, 0.25, 0.0)], m_dk),
        # Subtle recessed soot ring skim on breech floor (X in [1.09, 1.11])
        mk_cyl("c_bsoot", 0.478, 0.478, 0.03, "x", 36, [("t", 1.105, 0.0, 0.0)], m_so),
    ]
    # 6 crisp longitudinal CNC weight/debris flutes machined along cylindrical bolt stem (X in [-1.55, +0.34])!
    # Placed at angles avoiding top guide rail (0 deg), bottom strip lug (180 deg) & cam-pin bore (0/180 deg)!
    for fi, f_deg in enumerate((42.0, 90.0, 138.0, 222.0, 270.0, 318.0)):
        f_ang = math.radians(f_deg)
        flute_prof = [
            (0.000, -1.58),
            (0.085, -1.50),
            (0.115, -1.42),
            (0.115,  0.22),
            (0.085,  0.30),
            (0.000,  0.38),
        ]
        cutters.append(
            mk_lathe_x(
                f"c_bflute_{fi}",
                flute_prof,
                segs=18,
                xform=[("t", 0.0, math.cos(f_ang) * 0.655, math.sin(f_ang) * 0.655)],
                mat=m_dk,
            )
        )
    carved = bool_subtract(solid, cutters)

    # Spring-loaded flat-faced Ejector Plunger emerging from counterbore out to X = +1.31
    plunger = mk_cyl("blt_ejp", 0.080, 0.085, 0.34, "x", 22, [("t", 1.14, -0.18, -0.24)], m_st, bevel=0.014)
    obj = join_objects([carved, plunger], "deagle_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_cam_pin(mats: dict) -> bpy.types.Object:
    m_st = mats["S_BrushedStainless"]
    m_dk = mats["S_MachinedDark"]
    shaft = mk_cyl("cp_sh", 0.20, 0.20, 0.94, "y", 24, [("t", 0.0, 0.16, 0.0)], m_st, bevel=0.015)
    h_xz = [(-0.28, -0.22), (0.28, -0.22)]
    h_xz += _quad_bez((0.28, -0.22), (0.32, 0.0), (0.28, 0.22), 6)
    h_xz.append((-0.28, 0.22))
    h_xz += _quad_bez((-0.28, 0.22), (-0.32, 0.0), (-0.28, -0.22), 6)
    head = mk_extrude_y("cp_hd", h_xz, 0.50, 0.85, bevel=0.022, mat=m_st)
    body = bool_union([shaft, head], "cp_body")
    bore = mk_cyl("c_fpp", 0.13, 0.13, 0.68, "x", 18, mat=m_dk)
    obj = bool_subtract(body, [bore])
    obj.name = "deagle_cam_pin"
    obj.data.name = "deagle_cam_pin"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_firing_pin(mats: dict) -> bpy.types.Object:
    m_st = mats["S_BrushedStainless"]
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_sp = mats["S_SpringSteel"]

    needle = mk_cyl("fp_tip", 0.068, 0.095, 0.65, "x", 20, [("t", 3.92, 0.0, 0.0)], m_st, bevel=0.010)
    tri_flute = mk_cyl("fp_tri", 0.115, 0.130, 1.15, "x", 3, [("t", 3.08, 0.0, 0.0)], m_st)
    shaft_raw = mk_cyl("fp_sh", 0.16, 0.16, 5.40, "x", 24, [("t", -0.05, 0.0, 0.0)], m_st, bevel=0.012)
    notch = mk_box("c_fpn", 0.68, 0.14, 0.38, [("t", -2.80, 0.14, 0.0)], m_dk)
    shaft = bool_subtract(shaft_raw, [notch])
    collar = mk_cyl("fp_col", 0.27, 0.27, 0.28, "x", 24, [("t", -2.45, 0.0, 0.0)], m_st, bevel=0.018)
    head = mk_cyl("fp_hd", 0.22, 0.22, 1.38, "x", 24, [("t", -3.58, 0.0, 0.0)], m_nt, bevel=0.018)
    ret_spr = mk_coil_spring("fp_spr", "x", -2.28, 1.95, 0.0, 0.0, 0.23, 0.036, 17.0, 8, 14, mat=m_sp)
    obj = join_objects([needle, tri_flute, shaft, collar, head, ret_spr], "deagle_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_deagle_extractor(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_sp = mats["S_SpringSteel"]

    bar = mk_box("ext_bar", 1.34, 0.28, 0.24, [("t", 0.0, 0.08, 0.54)], m_nt, bevel=0.018)
    claw_raw = mk_box("ext_claw", 0.26, 0.32, 0.36, [("t", 0.58, 0.08, 0.42)], m_nt, bevel=0.015)
    rim_cut = mk_box("c_erim", 0.14, 0.38, 0.16, [("t", 0.45, 0.08, 0.28)], m_dk)
    claw = bool_subtract(claw_raw, [rim_cut])
    piv = mk_cyl("ext_piv", 0.14, 0.14, 0.32, "y", 18, [("t", -0.25, 0.08, 0.52)], m_nt, bevel=0.012)
    spr = mk_coil_spring("ext_spr", "x", -0.96, -0.50, 0.08, 0.50, 0.10, 0.022, 6.0, 8, 14, mat=m_sp)
    obj = join_objects([bar, claw, piv, spr], "deagle_extractor")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_safety(mats: dict) -> bpy.types.Object:
    """B-07: Slide-Mounted Ambidextrous Sculpted Tear-Drop Safety Levers w/ 3D Serrated Thumb Pads."""
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_st = mats["S_BrushedStainless"]

    drum_raw = mk_cyl("saf_drm", 0.36, 0.36, 2.86, "z", 28, mat=m_nt, bevel=0.015)
    fp_cut = mk_box("c_sfp", 0.88, 0.32, 0.46, [("t", 0.18, -0.08, 0.0)], m_dk)
    drum = bool_subtract(drum_raw, [fp_cut])

    # Sculpted forward-swept Desert Eagle tear-drop safety wing
    w_xy = [(-0.35, -0.32)]
    w_xy += _quad_bez((-0.35, -0.32), (0.45, -0.42), (1.44, -0.18), 8)
    w_xy += _quad_bez((1.44, -0.18), (1.70, 0.02), (1.40, 0.28), 8)
    w_xy += _quad_bez((1.40, 0.28), (0.45, 0.38), (-0.35, 0.32), 8)
    w_xy += _quad_bez((-0.35, 0.32), (-0.52, 0.0), (-0.35, -0.32), 6)

    parts = [drum]
    for sign in (-1.0, 1.0):
        z0, z1 = (1.42, 1.58) if sign > 0 else (-1.58, -1.42)
        wing = mk_extrude_z(f"saf_w_{int(sign)}", w_xy, z0, z1, bevel=0.028, bevel_segs=3, mat=m_nt)
        pad_raw = mk_cyl(
            f"saf_p_{int(sign)}", 0.285, 0.285, 0.13, "z", 28,
            [("s", 1.38, 0.86, 1.0), ("t", 1.14, -0.02, sign * 1.56)], m_nt, bevel=0.020
        )
        p_cuts = [
            mk_box(f"c_sp_{int(sign)}_{i}", 0.72, 0.036, 0.08, [("t", 1.14, -0.02 + i * 0.072, sign * 1.62)], m_dk)
            for i in (-2, -1, 0, 1, 2)
        ]
        pad = bool_subtract(pad_raw, p_cuts)
        screw = mk_cyl(f"saf_sc_{int(sign)}", 0.135, 0.135, 0.055, "z", 22, [("t", 0.0, 0.0, sign * 1.58)], m_st, bevel=0.010)
        parts.extend([wing, pad, screw])

    obj = join_objects(parts, "deagle_safety")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_front_sight(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_wh = mats["S_SightWhite"]
    dt = mk_box("fs_dt", 0.52, 0.14, 1.32, [("t", 0.0, -0.05, 0.0)], m_nt, bevel=0.012)
    r_xy = [(-0.52, 0.0), (0.52, 0.0), (0.22, 0.52), (-0.48, 0.52)]
    blade = mk_extrude_z("fs_bl", r_xy, -0.14, 0.14, bevel=0.016, bevel_segs=2, mat=m_nt)
    dot = mk_cyl("fs_dot", 0.085, 0.085, 0.04, "x", 20, [("t", -0.50, 0.32, 0.0)], m_wh, bevel=0.006)
    obj = join_objects([dt, blade, dot], "deagle_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_rear_sight(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_wh = mats["S_SightWhite"]
    dt = mk_box("rs_dt", 0.54, 0.14, 1.56, [("t", 0.0, -0.05, 0.0)], m_nt, bevel=0.012)
    b_xy = [(-0.52, 0.0), (0.56, 0.0), (0.32, 0.52), (-0.48, 0.52)]
    body = mk_extrude_z("rs_bd", b_xy, -0.81, 0.81, bevel=0.020, bevel_segs=2, mat=m_nt)
    united = bool_union([dt, body], "rs_un")
    notch = mk_box("c_rsn", 1.35, 0.32, 0.42, [("t", 0.0, 0.42, 0.0)], m_dk)
    slotted = bool_subtract(united, [notch])
    dot_l = mk_cyl("rs_dl", 0.075, 0.075, 0.04, "x", 18, [("t", -0.50, 0.30, -0.38)], m_wh, bevel=0.005)
    dot_r = mk_cyl("rs_dr", 0.075, 0.075, 0.04, "x", 18, [("t", -0.50, 0.30,  0.38)], m_wh, bevel=0.005)
    obj = join_objects([slotted, dot_l, dot_r], "deagle_rear_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_recoil_rods(mats: dict) -> bpy.types.Object:
    """B-10: Twin Parallel Telescoping Stainless Recoil Guide Rods & Figure-8 Retainer Yoke Plate."""
    m_st = mats["S_BrushedStainless"]
    m_dk = mats["S_MachinedDark"]
    parts = []
    for sign in (-1.0, 1.0):
        zp = sign * 0.48
        # Single stepped lathe profile per rod (100% manifold, zero overlapping sleeve caps!)
        rod_prof = [
            (0.000,  2.04),
            (0.260,  2.04),
            (0.260,  2.24),
            (0.175,  2.26),  # Outer telescoping sleeve (clears dynamic spring inner r=0.201!)
            (0.175,  7.40),
            (0.135,  7.42),  # Inner precision ground guide rod
            (0.135, 13.44),
            (0.155, 13.45),
            (0.120, 13.72),
            (0.000, 13.72),
        ]
        parts.append(mk_lathe_x(f"rr_rod_{int(sign)}", rod_prof, segs=28, xform=[("t", 0.0, 1.18, zp)], mat=m_st))

    # Sculpted Figure-8 Retainer Yoke Plate at X = 2.32
    bridge = mk_box("rr_br", 0.20, 0.64, 1.00, [("t", 2.32, 1.18, 0.0)], m_st, bevel=0.018)
    ring_l = mk_cyl("rr_rl", 0.37, 0.37, 0.20, "x", 28, [("t", 2.32, 1.18, -0.48)], m_st, bevel=0.020)
    ring_r = mk_cyl("rr_rr", 0.37, 0.37, 0.20, "x", 28, [("t", 2.32, 1.18,  0.48)], m_st, bevel=0.020)
    yoke_u = bool_union([bridge, ring_l, ring_r], "rr_yoke_u")
    saddle = mk_cyl("c_rsad", 0.26, 0.26, 0.36, "x", 22, [("t", 2.32, 1.54, 0.0)], m_dk)
    yoke = bool_subtract(yoke_u, [saddle])
    parts.append(yoke)

    obj = join_objects(parts, "deagle_recoil_rods")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_takedown_lever(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]

    shaft_raw = mk_cyl("td_sh", 0.22, 0.22, 2.78, "z", 24, mat=m_nt, bevel=0.015)
    hm_cut = mk_box("c_tdhm", 0.48, 0.22, 1.05, [("t", 0.0, 0.18, 0.0)], m_dk)
    shaft = bool_subtract(shaft_raw, [hm_cut])

    l_xy = [(0.20, -0.24), (-1.25, -0.18)]
    l_xy += _quad_bez((-1.25, -0.18), (-1.52, 0.0), (-1.25, 0.22), 8)
    l_xy.append((0.20, 0.26))
    l_xy += _quad_bez((0.20, 0.26), (0.38, 0.0), (0.20, -0.24), 6)
    lever = mk_extrude_z("td_lv", l_xy, 1.34, 1.51, bevel=0.022, bevel_segs=2, mat=m_nt)

    btn_raw = mk_knurled_cyl("td_btn", 0.275, 0.18, "z", flutes=20, depth=0.014, xform=[("t", 0.0, 0.0, -1.40)], mat=m_nt)
    grv = mk_box("c_tdb", 0.62, 0.05, 0.07, [("t", 0.0, 0.0, -1.48)], m_dk)
    btn = bool_subtract(btn_raw, [grv])

    obj = join_objects([shaft, lever, btn], "deagle_takedown_lever")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_slide_stop(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_st = mats["S_BrushedStainless"]

    piv = mk_cyl("ss_piv", 0.26, 0.26, 0.18, "z", 24, [("t", 1.85, -0.08, 0.0)], m_nt, bevel=0.016)
    arm = mk_box("ss_arm", 4.15, 0.28, 0.14, [("rz", -0.08), ("t", -0.15, 0.08, 0.0)], m_nt, bevel=0.018)
    sh_raw = mk_box("ss_sh", 0.98, 0.46, 0.26, [("t", -2.05, 0.26, -0.06)], m_nt, bevel=0.022)
    s_cuts = [mk_box(f"c_sss_{i}", 0.86, 0.048, 0.08, [("t", -2.05, 0.16 + i * 0.10, -0.18)], m_dk) for i in range(3)]
    shelf = bool_subtract(sh_raw, s_cuts)
    lug = mk_box("ss_lug", 0.42, 0.20, 0.56, [("t", -1.65, 0.18, 0.26)], m_st, bevel=0.015)

    obj = join_objects([piv, arm, shelf, lug], "deagle_slide_stop")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_mag_catch(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_sp = mats["S_SpringSteel"]

    bar = mk_box("mc_bar", 0.62, 0.82, 2.66, [("rz", DEAGLE_GRIP_ANGLE)], m_nt, bevel=0.020)
    btn_raw = mk_knurled_cyl("mc_lbtn", 0.38, 0.22, "z", flutes=24, depth=0.012, xform=[("t", 0.0, 0.0, -1.40)], mat=m_nt)
    checks = []
    for i in range(-2, 3):
        checks.append(mk_box(f"c_mch_{i}", 0.78, 0.036, 0.06, [("t", 0.0, i * 0.12, -1.50)], m_dk))
        checks.append(mk_box(f"c_mcv_{i}", 0.036, 0.78, 0.06, [("t", i * 0.12, 0.0, -1.50)], m_dk))
    left_btn = bool_subtract(btn_raw, checks)
    right_face = mk_cyl("mc_rf", 0.32, 0.32, 0.12, "z", 24, [("t", 0.0, 0.0, 1.32)], m_nt, bevel=0.014)
    spr = mk_coil_spring("mc_spr", "z", -0.35, 0.55, 0.0, -0.45, 0.14, 0.026, 5.0, 8, 14, mat=m_sp)
    obj = join_objects([bar, left_btn, right_face, spr], "deagle_mag_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_hammer(mats: dict) -> bpy.types.Object:
    """T-01: Exposed Skeletonized Single-Action Spur Hammer (baked in authentic cocked-back pose)."""
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]

    hub = mk_cyl("hm_hub", 0.28, 0.28, 0.56, "z", 24, mat=m_nt, bevel=0.018)
    h_xy = [
        (-0.34, -0.24),
        ( 0.18, -0.20),
        ( 0.30, -0.02),
        ( 0.18,  0.08),
        ( 0.28,  0.22),
        ( 0.05,  0.56),
        (-1.58,  1.12),
        (-1.92,  1.06),
        (-2.82,  0.68),
    ]
    h_xy += _quad_bez((-2.82, 0.68), (-2.90, 0.48), (-2.62, 0.40), 6)
    h_xy.append((-1.68, 0.56))
    h_xy += _quad_bez((-1.68, 0.56), (-0.92, 0.34), (-0.34, -0.24), 8)
    body_raw = mk_extrude_z("hm_bd", h_xy, -0.22, 0.22, bevel=0.025, bevel_segs=2, mat=m_nt)
    united = bool_union([hub, body_raw], "hm_un")

    # Skeletonized teardrop cutout + pivot bore + 6 crisp 3D thumb-spur serrations!
    cutters = [
        mk_cyl("c_hpiv", 0.14, 0.14, 0.72, "z", 20, mat=m_dk),
        mk_cyl("c_hlgt", 0.14, 0.14, 0.68, "z", 24, [("s", 2.15, 1.0, 1.0), ("rz", -0.24), ("t", -1.38, 0.72, 0.0)], m_dk),
    ]
    for i in range(6):
        t = i / 5.0
        cutters.append(
            mk_box(f"c_hser_{i}", 0.075, 0.12, 0.56, [("rz", 0.38), ("t", -1.96 - t * 0.74, 1.05 - t * 0.31, 0.0)], m_dk)
        )
    obj = bool_subtract(united, cutters)
    obj.name = "deagle_hammer"
    obj.data.name = "deagle_hammer"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_hammer_strut(mats: dict) -> bpy.types.Object:
    """T-02: Hammer Strut Rod & Mainspring Plunger Assembly — seated cleanly at local x=+0.52
    dead-center inside the grip backstrap housing channel (zero protrusion outside rubber backstrap,
    2mm clearance behind .50 AE magazine rear wall!)."""
    m_st = mats["S_BrushedStainless"]
    m_nt = mats["S_DarkNitride"]
    m_sp = mats["S_SpringSteel"]

    # Lower mainspring plunger rod + 18-coil spring + base cap centered inside backstrap channel (local x = +0.52)
    rod_lo = mk_cyl("hs_rod", 0.085, 0.085, 5.95, "y", 20, [("t", 0.52, -0.35, 0.0)], m_st, bevel=0.010)
    # Upper strut arm angling gently rearward to engage the exposed hammer's rear strut ear inside frame tang
    rod_hi = mk_cyl("hs_rhi", 0.085, 0.085, 1.85, "y", 20, [("rz", 0.22), ("t", 0.34, 3.45, 0.0)], m_st, bevel=0.010)
    yoke = mk_box("hs_yk", 0.26, 0.44, 0.22, [("t", 0.14, 4.28, 0.0)], m_st, bevel=0.016)
    spr = mk_coil_spring("hs_spr", "y", -3.20, 1.95, 0.52, 0.0, 0.165, 0.032, 18.0, 8, 14, mat=m_sp)
    cap = mk_cyl("hs_cap", 0.20, 0.19, 0.38, "y", 22, [("t", 0.52, -3.35, 0.0)], m_nt, bevel=0.018)
    obj = join_objects([rod_lo, rod_hi, yoke, spr, cap], "deagle_hammer_strut")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_deagle_trigger(mats: dict) -> bpy.types.Object:
    m_nt = mats["S_DarkNitride"]
    m_dk = mats["S_MachinedDark"]
    m_st = mats["S_BrushedStainless"]

    piv = mk_cyl("tr_piv", 0.16, 0.16, 0.92, "z", 22, mat=m_st, bevel=0.014)
    s_xy = [(-0.28, 0.18), (0.28, 0.18)]
    s_xy += _cubic_bez((0.28, 0.18), (0.05, -0.68), (0.08, -1.55), (0.42, -2.18), 14)
    s_xy += _quad_bez((0.42, -2.18), (0.24, -2.42), (0.02, -2.32), 6)
    s_xy += _cubic_bez((0.02, -2.32), (-0.38, -1.65), (-0.42, -0.72), (-0.28, 0.18), 14)
    shoe_raw = mk_extrude_z("tr_sh", s_xy, -0.28, 0.28, bevel=0.025, bevel_segs=2, mat=m_nt)
    grooves = [
        mk_box(f"c_trf_{z_i}", 0.08, 1.65, 0.055, [("rz", -0.14), ("t", 0.18, -1.18, z_i * 0.16)], m_dk)
        for z_i in (-1, 0, 1)
    ]
    shoe = bool_subtract(shoe_raw, grooves)

    parts = [piv, shoe]
    for sign in (-1.0, 1.0):
        parts.append(mk_box(f"tr_bar_{int(sign)}", 6.95, 0.26, 0.09, [("t", -3.45, 0.68, sign * 0.88)], m_st, bevel=0.012))
        parts.append(mk_box(f"tr_fl_{int(sign)}", 0.42, 0.62, 0.12, [("t", -0.05, 0.42, sign * 0.62)], m_st, bevel=0.012))
        parts.append(mk_box(f"tr_rh_{int(sign)}", 0.48, 0.38, 0.28, [("t", -6.85, 0.78, sign * 0.72)], m_st, bevel=0.015))
    obj = join_objects(parts, "deagle_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_sear(mats: dict) -> bpy.types.Object:
    m_st = mats["S_BrushedStainless"]
    m_nt = mats["S_DarkNitride"]
    m_sp = mats["S_SpringSteel"]
    parts = [
        mk_box("sr_blk", 0.88, 0.62, 0.96, [("t", 0.0, 0.05, 0.0)], m_st, bevel=0.022),
        mk_box("sr_nos", 0.48, 0.24, 0.44, [("rz", -0.28), ("t", -0.52, 0.22, 0.0)], m_st, bevel=0.016),
        mk_box("sr_dis", 0.28, 0.76, 0.18, [("t", 0.18, 0.46, 0.48)], m_nt, bevel=0.016),
        mk_cyl("sr_pin", 0.13, 0.13, 1.35, "z", 20, mat=m_nt, bevel=0.012),
        mk_coil_spring("sr_spr", "z", -0.48, -0.14, 0.12, 0.0, 0.11, 0.024, 4.0, 8, 14, mat=m_sp),
    ]
    obj = join_objects(parts, "deagle_sear")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_mag_body(mats: dict) -> bpy.types.Object:
    """M-01: 7-Round .50 AE Blued Steel Single-Stack Magazine Body w/ 7 Countersunk Witness Holes & Feed Lips."""
    m_bl = mats["S_MagBluedSteel"]
    m_st = mats["S_BrushedStainless"]
    m_dk = mats["S_MachinedDark"]

    rx, rz, cr = 2.04, 0.78, 0.20
    sec_xz = [(-rx + cr, -rz), (rx - cr, -rz)]
    sec_xz += _quad_bez((rx - cr, -rz), (rx, -rz), (rx, -rz + cr), 6)
    sec_xz.append((rx, rz - cr))
    sec_xz += _quad_bez((rx, rz - cr), (rx, rz), (rx - cr, rz), 6)
    sec_xz.append((-rx + cr, rz))
    sec_xz += _quad_bez((-rx + cr, rz), (-rx, rz), (-rx, rz - cr), 6)
    sec_xz.append((-rx, -rz + cr))
    sec_xz += _quad_bez((-rx, -rz + cr), (-rx, -rz), (-rx + cr, -rz), 6)

    tube = mk_extrude_y("mg_tube", sec_xz, -6.10, 5.30, bevel=0.014, mat=m_bl)
    liner = mk_box("mg_lin", 3.84, 0.42, 1.38, [("t", -0.04, 5.08, 0.0)], m_st)
    curl_l = mk_cyl("mg_cl", 0.072, 0.072, 3.36, "x", 16, [("t", -0.08, 5.225, -0.44)], m_st)
    curl_r = mk_cyl("mg_cr", 0.072, 0.072, 3.36, "x", 16, [("t", -0.08, 5.225,  0.44)], m_st)
    solid = bool_union([tube, liner, curl_l, curl_r], "mg_solid")

    cutters = [
        # Exact bottom slope plane matching grip & baseplate ly(lx) = -5.484 + 0.1848*lx
        mk_box("c_mbot", 6.20, 2.40, 2.40, [("rz", 0.1827), ("t", 0.0, -6.684, 0.0)], m_dk),
        # Internal .50 AE cartridge column
        mk_box("c_mcav", 3.82, 10.62, 1.32, [("t", 0.0, -0.44, 0.0)], m_dk),
        # Upper neck taper chamfers forming inward single-feed lips
        mk_box("c_mlL", 3.72, 0.46, 0.28, [("rx",  0.42), ("t", -0.02, 5.16, -0.80)], m_st),
        mk_box("c_mlR", 3.72, 0.46, 0.28, [("rx", -0.42), ("t", -0.02, 5.16,  0.80)], m_st),
        # Top stripping slot, semicircular .50 AE ogive scoop, rear ejector cut, mag-catch lock window
        mk_box("c_mslt", 3.52, 0.72, 0.76, [("t", 0.16, 5.16, 0.0)], m_dk),
        mk_cyl("c_mog", 0.56, 0.56, 0.84, "y", 22, [("t", 1.88, 5.12, 0.0)], m_dk),
        mk_box("c_mej", 0.54, 0.48, 0.28, [("t", -1.78, 5.16, -0.26)], m_dk),
        mk_box("c_mcat", 0.58, 0.36, 0.36, [("t", 1.55, 2.65, -0.76)], m_dk),
        # Rear full-load witness hole
        mk_cyl("c_mrw", 0.115, 0.115, 0.40, "x", 16, [("t", -2.00, -3.70, 0.0)], m_dk),
    ]
    for sign in (-1.0, 1.0):
        cutters.append(mk_box(f"c_mrib_{int(sign)}", 0.45, 7.60, 0.09, [("t", 0.68, -0.65, sign * 0.79)], m_dk))
    for i in range(7):
        wy = 3.20 - i * 1.15
        cutters.append(mk_cyl(f"c_mw_{i}", 0.125, 0.125, 1.90, "z", 18, [("t", -0.95, wy, 0.0)], m_dk))
        for sign in (-1.0, 1.0):
            cutters.append(mk_cyl(f"c_mwc_{i}_{int(sign)}", 0.168, 0.168, 0.10, "z", 18, [("t", -0.95, wy, sign * 0.76)], m_st))

    obj = bool_subtract(solid, cutters)
    obj.name = "deagle_mag_body"
    obj.data.name = "deagle_mag_body"
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_deagle_mag_follower(mats: dict) -> bpy.types.Object:
    """M-02: .50 AE High-Vis Safety-Orange Concave Cartridge-Saddle Follower (UV-firewalled!)."""
    m_fo = mats["G_FollowerOrange"]
    base = mk_box("fl_base", 3.72, 0.48, 1.26, mat=m_fo, bevel=0.035)
    rail = mk_cyl("fl_rail", 0.38, 0.38, 3.62, "x", 24, [("t", 0.0, 0.24, 0.24)], m_fo, bevel=0.025)
    act = mk_box("fl_act", 0.68, 0.32, 0.26, [("t", 1.28, 0.24, -0.50)], m_fo, bevel=0.022)
    fsk = mk_box("fl_fsk", 0.24, 0.72, 1.16, [("t", 1.68, -0.46, 0.0)], m_fo, bevel=0.022)
    rsk = mk_box("fl_rsk", 0.24, 0.72, 1.16, [("t", -1.68, -0.46, 0.0)], m_fo, bevel=0.022)
    obj = join_objects([base, rail, act, fsk, rsk], "deagle_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_deagle_mag_spring(mats: dict) -> bpy.types.Object:
    """M-03: Heavy-Duty 7-Coil Rectangular Superellipse .50 AE Magazine Spring (watertight capped!)."""
    m_sp = mats["S_SpringSteel"]
    coils = 7
    steps_per_coil = 28
    total_steps = coils * steps_per_coil
    rx, rz, wire_r = 1.44, 0.52, 0.050
    ring_segs = 8

    pts = []
    for i in range(total_steps + 1):
        u = i / total_steps
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        sx = math.copysign(abs(ct) ** 0.55, ct) * rx
        sz = math.copysign(abs(st) ** 0.55, st) * rz
        y_bot = -0.505 + 0.1848 * sx
        y_top = 0.505
        sy = (1.0 - u) * y_bot + u * y_top
        pts.append(Vector((sx, sy, sz)))

    bm = bmesh.new()
    rings = []
    prev_n = None
    for i, p in enumerate(pts):
        tang = (pts[1] - pts[0]).normalized() if i == 0 else ((pts[-1] - pts[-2]).normalized() if i == len(pts) - 1 else (pts[i + 1] - pts[i - 1]).normalized())
        if prev_n is None:
            ref = Vector((0, 1, 0)) if abs(tang.y) < 0.85 else Vector((1, 0, 0))
            n_vec = tang.cross(ref).normalized()
        else:
            n_vec = (prev_n - tang * prev_n.dot(tang)).normalized()
        prev_n = n_vec
        b_vec = tang.cross(n_vec).normalized()
        ring = [bm.verts.new(p + (n_vec * math.cos(2.0 * math.pi * s / ring_segs) + b_vec * math.sin(2.0 * math.pi * s / ring_segs)) * wire_r) for s in range(ring_segs)]
        rings.append(ring)

    for i in range(len(rings) - 1):
        for s in range(ring_segs):
            sn = (s + 1) % ring_segs
            bm.faces.new((rings[i][s], rings[i + 1][s], rings[i + 1][sn], rings[i][sn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    _apply_three_xform(bm, [])
    obj = _bm_to_obj("deagle_mag_spring", bm, m_sp)
    return finish_part(obj, bevel_w=0.0, sharp_deg=42.0)


def build_deagle_mag_baseplate(mats: dict) -> bpy.types.Object:
    """M-04: Flush-Fit Finger-Rest Polymer Magazine Floorplate w/ Blued Locking Insert & Stainless Detent."""
    m_rb = mats["G_RubberSmooth"]
    m_hw = mats["G_BluedHardware"]
    m_st = mats["G_StainlessHardware"]

    m = 0.1848
    xr, xf = -2.36, 2.86
    p_xy = [
        (xr, m * xr - 0.34),
        (xf - 0.18, m * (xf - 0.18) - 0.36),
    ]
    p_xy += _quad_bez((xf - 0.18, m * (xf - 0.18) - 0.36), (xf + 0.08, m * xf - 0.12), (xf, m * xf), 8)
    p_xy.append((xr + 0.06, m * (xr + 0.06)))
    p_xy += _quad_bez((xr + 0.06, m * (xr + 0.06)), (xr - 0.04, m * xr - 0.16), (xr, m * xr - 0.34), 6)

    pad_raw = mk_extrude_z("bp_pad", p_xy, -0.99, 0.99, bevel=0.045, bevel_segs=2, mat=m_rb)
    punch = mk_cyl("c_bpp", 0.23, 0.23, 0.24, "y", 20, [("rz", 0.1827), ("t", 0.0, -0.32, 0.0)], m_rb)
    pad = bool_subtract(pad_raw, [punch])
    ins = mk_box("bp_ins", 3.74, 0.24, 1.28, [("rz", 0.1827), ("t", 0.0, 0.16, 0.0)], m_hw, bevel=0.018)
    stud = mk_cyl("bp_stud", 0.19, 0.19, 0.40, "y", 22, [("rz", 0.1827), ("t", 0.0, -0.14, 0.0)], m_st, bevel=0.016)
    obj = join_objects([pad, ins, stud], "deagle_mag_baseplate")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart Packing (3 Dedicated 2K Atlases)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float,
    u1: float,
    v0: float,
    v1: float,
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
    assert span_u > 0.48 and span_v > 0.48, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_hero_atlas(hero_objs: list[bpy.types.Object]):
    """Unwraps deagle_barrel, deagle_slide, deagle_frame into `deagle_v3_hero` (2048x2048):
      - Band 1 (Slide Right outer flank):           u in [0.015, 0.985], v in [0.855, 0.985]
      - Band 2 (Slide Left  outer flank):           u in [0.015, 0.985], v in [0.715, 0.845] (mirrored U)
      - Band 3 (Barrel Right outer flank):          u in [0.015, 0.640], v in [0.585, 0.700]
      - Band 4 (Barrel Left  outer flank):          u in [0.015, 0.640], v in [0.460, 0.575] (mirrored U)
      - Band 5 (Frame Right full cheek+dust cover): u in [0.015, 0.985], v in [0.365, 0.452]
      - Band 6 (Frame Left  full cheek+dust cover): u in [0.015, 0.985], v in [0.270, 0.357] (mirrored U)
      - Packed A (Barrel non-hero):                 u in [0.655, 0.990], v in [0.460, 0.700]
      - Packed B (Slide & Frame non-hero):          u in [0.010, 0.990], v in [0.010, 0.255]
    """
    def is_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if mat_name != "H_BrushedStainless":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if obj_name == "deagle_slide":
            if tx < -9.50 or tx > 13.80 or ty < 0.90 or ty > 4.02:
                return False
            return (nz > 0.52 and tz > 0.82) or (nz < -0.52 and tz < -0.82)
        if obj_name == "deagle_barrel":
            if tx < 1.88 or tx > 15.95 or ty < 1.90 or ty > 3.85:
                return False
            return (nz > 0.55 and tz > 0.82) or (nz < -0.55 and tz < -0.82)
        if obj_name == "deagle_frame":
            if tx < -10.45 or tx > 15.75 or ty < -3.38 or ty > 0.88:
                return False
            # Main forged receiver/dust-cover outer cheeks (|tz| > 1.24) + disjoint trigger-guard outer cheeks (tx > -1.92, ty < -0.52, |tz| > 0.56)!
            is_main_cheek = (nz > 0.82 and tz > 1.24) or (nz < -0.82 and tz < -1.24)
            is_tg_cheek = (tx > -1.92 and ty < -0.52) and ((nz > 0.90 and tz > 0.56) or (nz < -0.90 and tz < -0.56))
            return is_main_cheek or is_tg_cheek
        return False

    bbl = [o for o in hero_objs if o.name == "deagle_barrel"]
    sf = [o for o in hero_objs if o.name in {"deagle_slide", "deagle_frame"}]
    _smart_unwrap_and_pack_rect(bbl, 0.655, 0.990, 0.460, 0.700, skip_face_fn=is_hero_flank)
    _smart_unwrap_and_pack_rect(sf, 0.010, 0.990, 0.010, 0.255, skip_face_fn=is_hero_flank)

    # Project crisp planar world-proportional UVs onto all 6 hero flank bands
    band_cfg = {
        "deagle_slide":  (-9.55, 23.40,  0.88, 3.28, (0.015, 0.985, 0.855, 0.985), (0.015, 0.985, 0.715, 0.845)),
        "deagle_barrel": ( 1.86, 14.14,  1.70, 2.18, (0.015, 0.640, 0.585, 0.700), (0.015, 0.640, 0.460, 0.575)),
        "deagle_frame":  (-10.50, 26.30, -3.40, 4.30, (0.015, 0.985, 0.365, 0.452), (0.015, 0.985, 0.270, 0.357)),
    }
    for o in hero_objs:
        x0, xsp, y0, ysp, br, bl = band_cfg[o.name]
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if not is_hero_flank(o.name, f, mname):
                continue
            is_right = (-f.normal.y) > 0.0
            u0, u1, v0, v1 = br if is_right else bl
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                xn = max(0.0, min(1.0, (tx - x0) / xsp))
                yn = max(0.0, min(1.0, (ty - y0) / ysp))
                u_val = (u0 + xn * (u1 - u0)) if is_right else (u0 + (1.0 - xn) * (u1 - u0))
                v_val = v0 + yn * (v1 - v0)
                loop[uv_layer].uv = (u_val, v_val)
        bm.to_mesh(o.data)
        bm.free()


def unwrap_steel_atlas(steel_objs: list[bpy.types.Object]):
    """Unwraps all 17 internal, control & magazine metal parts into `deagle_v3_steel` (2048x2048):
      - Mag Right Flank Hero Band: u in [0.015, 0.195], v in [0.020, 0.780]
      - Mag Left  Flank Hero Band: u in [0.210, 0.390], v in [0.020, 0.780] (mirrored U)
      - Pack A (Exterior controls + mag non-hero + sights + hammer): u in [0.405, 0.990], v in [0.010, 0.990]
      - Pack B (Internal bolt, cam pin, firing pin, recoil rods, trigger, sear, mag spring): u in [0.010, 0.395], v in [0.795, 0.990]
    """
    def is_mag_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "deagle_mag_body" or mat_name != "S_MagBluedSteel":
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        return (nz > 0.82 and tz > 0.74) or (nz < -0.82 and tz < -0.74)

    ext_and_mag = [
        o for o in steel_objs
        if o.name in {
            "deagle_mag_body", "deagle_safety", "deagle_front_sight", "deagle_rear_sight",
            "deagle_takedown_lever", "deagle_slide_stop", "deagle_mag_catch", "deagle_hammer", "deagle_bolt",
        }
    ]
    internals = [o for o in steel_objs if o not in ext_and_mag]
    _smart_unwrap_and_pack_rect(ext_and_mag, 0.405, 0.990, 0.010, 0.990, skip_face_fn=is_mag_flank)
    _smart_unwrap_and_pack_rect(internals, 0.010, 0.395, 0.795, 0.990, skip_face_fn=None)

    mag = next(o for o in steel_objs if o.name == "deagle_mag_body")
    bm = bmesh.new()
    bm.from_mesh(mag.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mag.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mag_flank("deagle_mag_body", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        u0, u1 = (0.015, 0.195) if is_right else (0.210, 0.390)
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-2.04)) / 4.08))
            yn = max(0.0, min(1.0, (ty - (-5.85)) / 11.15))
            u_val = (u0 + xn * (u1 - u0)) if is_right else (u0 + (1.0 - xn) * (u1 - u0))
            v_val = 0.020 + yn * 0.760
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(mag.data)
    bm.free()


def unwrap_grip_atlas(grip_objs: list[bpy.types.Object]):
    """Unwraps deagle_grip, deagle_mag_follower, deagle_mag_baseplate into `deagle_v3_grip` (2048x2048):
      - Hero Band 1 (Grip Right Flank w/ IMI/MRI Medallion): u in [0.020, 0.475], v in [0.020, 0.715]
      - Hero Band 2 (Grip Left  Flank w/ IMI/MRI Medallion): u in [0.515, 0.970], v in [0.020, 0.715]
      - Firewalled Box (Safety-Orange Mag Follower ONLY):    u in [0.015, 0.220], v in [0.760, 0.985]
      - Pack Box (Baseplate + Grip Backstrap/Inner/Screws):  u in [0.265, 0.985], v in [0.750, 0.985]
    """
    def is_grip_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "deagle_grip" or mat_name not in {"G_RubberSmooth", "G_RubberStipple"}:
            return False
        c = face.calc_center_median()
        n = face.normal
        tz = -c.y
        nz = -n.y
        # Exterior side flank faces (exclude backstrap & inner U-channel!)
        return (nz > 0.62 and tz > 1.38) or (nz < -0.62 and tz < -1.38)

    follower_grp = [o for o in grip_objs if o.name == "deagle_mag_follower"]
    rest_grp = [o for o in grip_objs if o.name != "deagle_mag_follower"]
    _smart_unwrap_and_pack_rect(follower_grp, 0.015, 0.220, 0.760, 0.985, skip_face_fn=None)
    _smart_unwrap_and_pack_rect(rest_grp, 0.265, 0.985, 0.750, 0.985, skip_face_fn=is_grip_hero_flank)

    # Project crisp grip-aligned 1:1 medallion UVs onto both right & left contoured grip flanks!
    # Rotate coordinates by -DEAGLE_GRIP_ANGLE (+15 deg) so the grip panel aligns upright with UV axes!
    cos_a = math.cos(-DEAGLE_GRIP_ANGLE)
    sin_a = math.sin(-DEAGLE_GRIP_ANGLE)
    cx_g, cy_g = -6.05, -5.60

    grip = next(o for o in grip_objs if o.name == "deagle_grip")
    bm = bmesh.new()
    bm.from_mesh(grip.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in grip.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_grip_hero_flank("deagle_grip", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        u0, u1 = (0.020, 0.475) if is_right else (0.515, 0.970)
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x - cx_g, vco.z - cy_g
            # Rotate into grip-local frame: gx across width (rear->front), gy along height (bottom->top)
            gx = tx * cos_a - ty * sin_a
            gy = tx * sin_a + ty * cos_a
            # Span gx in [-2.60, +2.40] (5.0 cm), gy in [-4.50, +4.45] (8.95 cm)
            xn = max(0.0, min(1.0, (gx - (-2.60)) / 5.00))
            yn = max(0.0, min(1.0, (gy - (-4.50)) / 8.95))
            u_val = (u0 + xn * (u1 - u0)) if is_right else (u0 + (1.0 - xn) * (u1 - u0))
            v_val = 0.020 + yn * 0.695
            loop[uv_layer].uv = (u_val, v_val)
    bm.to_mesh(grip.data)
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.05, 0.055, 0.06, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.55
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # Assembled exterior contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.42
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.12) else "WARN"
        print(
            f"  [{status}] {o.name:22s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.12:
            print(f"       !! BBOX DELTA > 0.12cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
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


def render_qa_previews(all_objs: list[bpy.types.Object]):
    """Optional Cycles visual QA renderer (`-- --preview`): mounts FINAL baked WebP PBR maps
    onto the exported meshes in our museum HDRI studio and renders 6 inspection plates
    to `/tmp/deagle_qa_*.png` (never writes preview images into the git repository!)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 3
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.20

    def make_baked_mat(name: str, stem: str, nrm_strength: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(name)
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        img_a = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_albedo.webp"))
        img_a.colorspace_settings.name = "sRGB"
        t_a = nt.nodes.new("ShaderNodeTexImage")
        t_a.image = img_a

        img_o = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_roughness.webp"))
        img_o.colorspace_settings.name = "Non-Color"
        t_o = nt.nodes.new("ShaderNodeTexImage")
        t_o.image = img_o

        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_o.outputs["Color"], sep.inputs["Color"])

        ao_mix = nt.nodes.new("ShaderNodeMix")
        ao_mix.data_type = "RGBA"
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs["Factor"].default_value = 0.88
        nt.links.new(t_a.outputs["Color"], ao_mix.inputs["A"])
        nt.links.new(sep.outputs["Red"], ao_mix.inputs["B"])

        nt.links.new(ao_mix.outputs["Result"], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        img_n = bpy.data.images.load(str(TEX_OUT_DIR / f"{stem}_normal.webp"))
        img_n.colorspace_settings.name = "Non-Color"
        t_n = nt.nodes.new("ShaderNodeTexImage")
        t_n.image = img_n
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nrm_strength
        nt.links.new(t_n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_h = make_baked_mat("QA_Hero", "deagle_v3_hero", 0.86)
    mat_s = make_baked_mat("QA_Steel", "deagle_v3_steel", 0.86)
    mat_g = make_baked_mat("QA_Grip", "deagle_v3_grip", 0.92)

    hero_set, grip_set = set(HERO_PARTS), set(GRIP_PARTS)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in hero_set:
            o.data.materials.append(mat_h)
        elif o.name in grip_set:
            o.data.materials.append(mat_g)
        else:
            o.data.materials.append(mat_s)
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        rx, ry, rz = ASSEMBLED_ROT_THREE.get(o.name, (0.0, 0.0, 0.0))
        o.rotation_euler = (rx, -rz, ry)
        o.hide_render = False

    wnt = scene.world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wbg = wnt.nodes.new("ShaderNodeBackground")
    hdri_path = REPO_ROOT / "public" / "hdri" / "tactical_vault.hdr"
    if hdri_path.exists():
        env_tex = wnt.nodes.new("ShaderNodeTexEnvironment")
        env_tex.image = bpy.data.images.load(str(hdri_path))
        wnt.links.new(env_tex.outputs["Color"], wbg.inputs["Color"])
        wbg.inputs["Strength"].default_value = 1.25
    else:
        wbg.inputs["Color"].default_value = (0.04, 0.05, 0.07, 1.0)
        wbg.inputs["Strength"].default_value = 1.0

    lp = wnt.nodes.new("ShaderNodeLightPath")
    bg_cam = wnt.nodes.new("ShaderNodeBackground")
    bg_cam.inputs["Color"].default_value = (0.025, 0.032, 0.044, 1.0)
    bg_cam.inputs["Strength"].default_value = 1.0
    mix_s = wnt.nodes.new("ShaderNodeMixShader")
    wnt.links.new(lp.outputs["Is Camera Ray"], mix_s.inputs["Fac"])
    wnt.links.new(wbg.outputs["Background"], mix_s.inputs[1])
    wnt.links.new(bg_cam.outputs["Background"], mix_s.inputs[2])
    wnt.links.new(mix_s.outputs["Shader"], wout.inputs["Surface"])

    def add_softbox(name: str, loc_t: tuple, aim_t: tuple, energy: float, sx: float, sy: float, col=(1.0, 0.98, 0.96)):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.shape = "RECTANGLE"
        ld.size = sx
        ld.size_y = sy
        ld.energy = energy
        ld.color = col
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = t2b(*loc_t)
        d = t2b(*aim_t) - lo.location
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    add_softbox("KeyStrip_R", ( 3.0, 22.0,  22.0), (2.5, -1.8, 0.0), 2100.0, 38.0, 10.0, (1.00, 0.98, 0.94))
    add_softbox("KeyStrip_L", ( 3.0, 22.0, -22.0), (2.5, -1.8, 0.0), 1950.0, 38.0, 10.0, (0.96, 0.99, 1.00))
    add_softbox("Fill_R",     ( 3.0,  3.0,  32.0), (2.5, -1.8, 0.0),  460.0, 34.0, 14.0, (0.98, 0.97, 0.95))
    add_softbox("Fill_L",     ( 3.0,  3.0, -32.0), (2.5, -1.8, 0.0),  440.0, 34.0, 14.0, (0.94, 0.97, 1.00))

    cam_d = bpy.data.cameras.new("QACam")
    cam = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(fname: str, eye_t: tuple, tgt_t: tuple, lens: float = 56.0):
        cam_d.lens = lens
        cam.location = t2b(*eye_t)
        d = t2b(*tgt_t) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"/tmp/{fname}"
        bpy.ops.render.render(write_still=True)
        print(f"[QA-RENDER] Saved /tmp/{fname}")

    # 1. Full Right Profile
    shoot("deagle_qa_right.png", (2.8, 3.0, 44.0), (2.5, -2.2, 0.0), lens=54.0)
    # 2. Full Left Profile
    shoot("deagle_qa_left.png", (2.8, 3.0, -44.0), (2.5, -2.2, 0.0), lens=54.0)
    # 3. 3/4 Front-Right Muzzle Crown + Beveled Weaver Scope Rail + Triangular Barrel Shroud!
    shoot("deagle_qa_iso_muzzle.png", (23.5, 11.5, 18.5), (5.5, 1.5, 0.0), lens=54.0)
    # 4. Macro Slide Serrations + Ambi Wing Safety + Ejection Port + Brushed Stainless Rollmarks!
    shoot("deagle_qa_macro_slide.png", (-2.2, 4.8, 17.5), (-2.0, 2.2, 0.0), lens=64.0)
    # 5. Macro Ergonomic Stippled Rubber Grip + IMI/MRI Medallion + Finger Swells + Frontstrap!
    shoot("deagle_qa_macro_grip.png", (-4.8, -4.5, 17.0), (-5.8, -5.2, 0.0), lens=62.0)
    # 6. Isolated Macro Fluted 7-Lug Rotary Bolt!
    for o in all_objs:
        o.hide_render = (o.name != "deagle_bolt")
    bolt_o = bpy.data.objects["deagle_bolt"]
    bolt_o.location = (0.0, 0.0, 0.0)
    shoot("deagle_qa_macro_bolt.png", (4.5, 2.2, 4.2), (-0.2, 0.0, 0.0), lens=68.0)


def main():
    t_start = time.time()
    do_preview = "--preview" in sys.argv
    reset_scene()
    mats = create_material_library()

    builders = {
        "deagle_barrel": build_deagle_barrel,
        "deagle_slide": build_deagle_slide,
        "deagle_frame": build_deagle_frame,
        "deagle_bolt": build_deagle_bolt,
        "deagle_cam_pin": build_deagle_cam_pin,
        "deagle_firing_pin": build_deagle_firing_pin,
        "deagle_extractor": build_deagle_extractor,
        "deagle_safety": build_deagle_safety,
        "deagle_front_sight": build_deagle_front_sight,
        "deagle_rear_sight": build_deagle_rear_sight,
        "deagle_recoil_rods": build_deagle_recoil_rods,
        "deagle_takedown_lever": build_deagle_takedown_lever,
        "deagle_slide_stop": build_deagle_slide_stop,
        "deagle_mag_catch": build_deagle_mag_catch,
        "deagle_hammer": build_deagle_hammer,
        "deagle_hammer_strut": build_deagle_hammer_strut,
        "deagle_trigger": build_deagle_trigger,
        "deagle_sear": build_deagle_sear,
        "deagle_mag_body": build_deagle_mag_body,
        "deagle_mag_spring": build_deagle_mag_spring,
        "deagle_grip": build_deagle_grip,
        "deagle_mag_follower": build_deagle_mag_follower,
        "deagle_mag_baseplate": build_deagle_mag_baseplate,
    }

    print("[BUILD] Sculpting all 23 solid Desert Eagle Mark XIX (.50 AE) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    hero_objs = [built[pid] for pid in HERO_PARTS]
    steel_objs = [built[pid] for pid in STEEL_PARTS]
    grip_objs = [built[pid] for pid in GRIP_PARTS]
    all_objs = hero_objs + steel_objs + grip_objs

    print("[VERIFY] Checking manifoldness, outward normals & exact CSG alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K atlases: hero (3), steel (17), grip (3)...")
    unwrap_hero_atlas(hero_objs)
    unwrap_steel_atlas(steel_objs)
    unwrap_grip_atlas(grip_objs)

    # Triangulate keeping WeightedNormal loop normals BEFORE Cycles NORMAL baking & glTF export!
    triangulate_keep_normals(all_objs)

    # Assert ZERO overlapping UV explosions across all 3 atlases!
    for label, group in (("hero", hero_objs), ("steel", steel_objs), ("grip", grip_objs)):
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
            assert 0.00003 < oa < 0.80, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="deagle_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking deagle_v3_hero (2048x2048, 3 stainless hero parts)...")
        bake_atlas_suite("hero", hero_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking deagle_v3_steel (2048x2048, 17 controls/bolt/FCG/mag metal parts)...")
        bake_atlas_suite("steel", steel_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking deagle_v3_grip (2048x2048, sculpted rubber grip + baseplate + firewalled follower)...")
        bake_atlas_suite("grip", grip_objs, all_objs, tmp_dir)

        print("[POST] Compositing laser rollmarks, red fire dots, mag witness digits, IMI/MRI grip medallion & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "deagle_v3_hero_albedo.webp",
        TEX_OUT_DIR / "deagle_v3_hero_normal.webp",
        TEX_OUT_DIR / "deagle_v3_hero_roughness.webp",
        TEX_OUT_DIR / "deagle_v3_steel_albedo.webp",
        TEX_OUT_DIR / "deagle_v3_steel_normal.webp",
        TEX_OUT_DIR / "deagle_v3_steel_roughness.webp",
        TEX_OUT_DIR / "deagle_v3_grip_albedo.webp",
        TEX_OUT_DIR / "deagle_v3_grip_normal.webp",
        TEX_OUT_DIR / "deagle_v3_grip_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== DESERT EAGLE MARK XIX (.50 AE) V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:38s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"

    if do_preview:
        print("\n[QA] Rendering 6 museum studio Cycles QA preview plates to /tmp/deagle_qa_*.png...")
        render_qa_previews(all_objs)

    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")


if __name__ == "__main__":
    main()
