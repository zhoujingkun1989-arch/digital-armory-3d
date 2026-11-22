#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Metal GPU Baker for WWII Panzerkampfwagen VI
Tiger I Ausf. E — "Tiger 131" (88mm KwK 36 L/56 + Schachtellaufwerk + Maybach HL230 V12)
========================================================================================
MIT License — Digital Armory 3D (`WP-18` BAY-27)

Generates:
  - public/models/tiger1.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `tiger_recoil_springs` and `tiger_breech_spring`
    carrying `aSpringParam`)
  - public/textures/tiger1_v3_hull_zimmerit_{albedo,normal,roughness}.webp  (4096x4096 Packed ORM)
  - public/textures/tiger1_v3_turret_88mm_{albedo,normal,roughness}.webp    (4096x4096 Packed ORM)
  - public/textures/tiger1_v3_drivetrain_int_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X front/muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/tiger1/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_tiger1_photoreal.py
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
# MODE 2: System Python Post-Process (Bovington "131" Turret Number, Wehrmacht
#         Balkenkreuz, Combed Horizontal Zimmerit Normal Relief, Maybach HL230
#         Factory Data Plate, 88mm PzGr. 39 Stencils & 5-Ch Packed ORM WebPs)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    import io

    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    glb_path = Path(sys.argv[idx + 3]) if len(sys.argv) > idx + 3 else None
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

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _combine_ao(ao_self: np.ndarray, ao_ext: np.ndarray, ext_mask: np.ndarray) -> np.ndarray:
        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.48 + ao_ext * 0.52)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        return np.clip(0.20 + 0.80 * np.power(np.clip(ao, 0.0, 1.0), 0.90), 0.18, 1.0).astype(np.float32)

    def _draw_balkenkreuz(
        dw: ImageDraw.ImageDraw, db: ImageDraw.ImageDraw,
        cx: int, cy: int, size: int,
    ):
        """Authentic WWII German Wehrmacht Balkenkreuz: crisp white outer L-brackets + black inner cross."""
        half = size // 2
        arm_w = int(size * 0.25)
        arm_h = arm_w // 2
        w_thick = max(6, int(size * 0.085))
        # Black inner cross
        db.rectangle((cx - half + w_thick, cy - arm_h, cx + half - w_thick, cy + arm_h), fill=255)
        db.rectangle((cx - arm_h, cy - half + w_thick, cx + arm_h, cy + half - w_thick), fill=255)
        # Four crisp white L-angle corner brackets framing the straight cross
        # Top-Left L
        dw.rectangle((cx - half, cy - arm_h - w_thick, cx - arm_h, cy - arm_h), fill=255)
        dw.rectangle((cx - arm_h - w_thick, cy - half, cx - arm_h, cy - arm_h), fill=255)
        # Top-Right L
        dw.rectangle((cx + arm_h, cy - arm_h - w_thick, cx + half, cy - arm_h), fill=255)
        dw.rectangle((cx + arm_h, cy - half, cx + arm_h + w_thick, cy - arm_h), fill=255)
        # Bottom-Left L
        dw.rectangle((cx - half, cy + arm_h, cx - arm_h, cy + arm_h + w_thick), fill=255)
        dw.rectangle((cx - arm_h - w_thick, cy + arm_h, cx - arm_h, cy + half), fill=255)
        # Bottom-Right L
        dw.rectangle((cx + arm_h, cy + arm_h, cx + half, cy + arm_h + w_thick), fill=255)
        dw.rectangle((cx + arm_h, cy + arm_h, cx + arm_h + w_thick, cy + half), fill=255)

    def _draw_bold_131(
        dw: ImageDraw.ImageDraw, db: ImageDraw.ImageDraw,
        w_img: int, h_img: int,
    ):
        """Iconic Bovington Tank Museum Tiger '131' tactical turret numeral: bold black digits w/ crisp white outline!"""
        font = _load_font(FONT_DIN, int(h_img * 0.68))
        cx, cy = w_img // 2, int(h_img * 0.50)
        text = "131"
        # Thick white outer halo outline (classic s.Pz.Abt. 504 Bovington 131 typography, 4K crisp!)
        stroke_r = max(14, int(h_img * 0.036))
        step = max(2, stroke_r // 10)
        for ox in range(-stroke_r, stroke_r + 1, step):
            for oy in range(-stroke_r, stroke_r + 1, step):
                if ox * ox + oy * oy <= stroke_r * stroke_r:
                    dw.text((cx + ox, cy + oy), text, font=font, fill=255, anchor="mm")
        # Bold dark charcoal-black inner fill (AgX anti-crush calibrated later)
        db.text((cx, cy), text, font=font, fill=255, anchor="mm")

    def _make_zimmerit_height(
        h: int, w: int, u0: float, u1: float, v0: float, v1: float,
        ridges_v: float = 44.0, seed: int = 131,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Combed horizontal Zimmerit anti-magnetic paste normal relief w/ sharp triangular sawtooth grooves,
        hand-trowel vertical seams, and subtle localized flaked-off paste patches exposing Rotbraun primer."""
        u = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        in_band = (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
        if not np.any(in_band):
            z = np.zeros((h, w), dtype=np.float32)
            return z, z
        un = np.clip((u - u0) / max(u1 - u0, 1e-6), 0.0, 1.0)
        vn = np.clip((v - v0) / max(v1 - v0, 1e-6), 0.0, 1.0)
        # Sharp combed horizontal triangular-sawtooth ridges + realistic hand-trowel undulation
        wobble = 0.075 * np.sin(un * 20.0 * math.pi) + 0.03 * np.sin(un * 47.0 * math.pi + seed)
        phase = (vn * ridges_v + wobble) % 1.0
        # Asymmetric sawtooth-triangle profile matching real metal Zimmerit comb teeth!
        tri = np.where(phase < 0.35, phase / 0.35, (1.0 - phase) / 0.65) * 2.0 - 1.0
        # Vertical square-patch spatula joints every ~1/14th span
        seam = np.abs(np.sin(un * 14.0 * math.pi))
        seam_dip = _smoothstep(0.0, 0.11, seam)
        # Edge fade so UV borders stay clean
        fade_u = _smoothstep(0.0, 0.018, un) * _smoothstep(0.0, 0.018, 1.0 - un)
        fade_v = _smoothstep(0.0, 0.025, vn) * _smoothstep(0.0, 0.025, 1.0 - vn)
        # Subtle combat-flaked Zimmerit micro-chips strictly hugging bottom 7% & top 5% plate edges
        # (multi-octave organic Gaussian noise, NEVER splattering into the center markings!)
        edge_zone = (1.0 - _smoothstep(0.015, 0.085, vn)) * 0.90 + _smoothstep(0.935, 0.990, vn) * 0.45
        edge_zone = np.clip(edge_zone, 0.0, 1.0)
        rng_z = np.random.default_rng(seed)
        # Build band-local multi-octave organic fractal noise (zero grid-zoom diamond artifacts!)
        y_idx = np.where(np.any(in_band, axis=1))[0]
        x_idx = np.where(np.any(in_band, axis=0))[0]
        chip_mask = np.zeros((h, w), dtype=np.float32)
        if y_idx.size > 0 and x_idx.size > 0:
            y0b, y1b = int(y_idx[0]), int(y_idx[-1]) + 1
            x0b, x1b = int(x_idx[0]), int(x_idx[-1]) + 1
            bh, bw = y1b - y0b, x1b - x0b
            sc = w / 2048.0
            raw = rng_z.standard_normal((bh, bw)).astype(np.float32)
            oct1 = ndimage.gaussian_filter(raw, sigma=14.0 * sc)
            oct2 = ndimage.gaussian_filter(rng_z.standard_normal((bh, bw)).astype(np.float32), sigma=5.5 * sc)
            oct3 = ndimage.gaussian_filter(rng_z.standard_normal((bh, bw)).astype(np.float32), sigma=1.8 * sc)
            fbm = oct1 * 0.55 + oct2 * 0.30 + oct3 * 0.15
            fbm = (fbm - fbm.mean()) / max(float(fbm.std()), 1e-5)
            local_chip = _smoothstep(1.35, 1.95, fbm) * edge_zone[y0b:y1b, :]
            chip_mask[y0b:y1b, x0b:x1b] = local_chip
        chip_mask *= fade_u * fade_v * in_band.astype(np.float32)
        z_h = (tri * 0.58 * seam_dip * (1.0 - 0.85 * chip_mask) - 0.28 * chip_mask) * fade_u * fade_v * in_band.astype(np.float32)
        return z_h.astype(np.float32), chip_mask.astype(np.float32)

    # -------------------------------------------------------------------------
    # SUITE 1: tiger1_v3_hull_zimmerit_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def build_hull_zimmerit_images() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "hz_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "hz_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "hz_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "hz_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "hz_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hz_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "hz_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        res_scale = w / 2048.0
        albedo = _linear_to_srgb(alb_lin)
        white_mask = np.zeros((h, w), dtype=np.float32)
        black_mask = np.zeros((h, w), dtype=np.float32)
        zimm_h = np.zeros((h, w), dtype=np.float32)
        zimm_chip = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Left (-Z) & Right (+Z) Hull Upper Flank (Balkenkreuz + Stencil + 4K Zimmerit!) ---
        # 2x scaled PIL canvas (3840x1280) for razor-sharp 4K museum macro!
        FW, FH = 3840, 1280
        fw_img = Image.new("L", (FW, FH), 0)
        fb_img = Image.new("L", (FW, FH), 0)
        dfw = ImageDraw.Draw(fw_img)
        dfb = ImageDraw.Draw(fb_img)

        # Authentic crisp Wehrmacht Balkenkreuz centered in forward-mid hull flank
        _draw_balkenkreuz(dfw, dfb, cx=int(FW * 0.56), cy=int(FH * 0.50), size=760)
        # Historic Schwere Panzer-Abteilung 504 tactical stencil
        dfw.text((int(FW * 0.24), int(FH * 0.36)), "s.Pz.Abt. 504", font=_load_font(FONT_DIN, 144), fill=238, anchor="mm")
        dfw.text((int(FW * 0.24), int(FH * 0.56)), "Pz.Kpfw. VI  AUSF. E", font=_load_font(FONT_COND, 112), fill=228, anchor="mm")
        dfw.text((int(FW * 0.24), int(FH * 0.72)), "TIGER 131  /  Fgst. 250122", font=_load_font(FONT_COND, 92), fill=218, anchor="mm")
        dfw.text((int(FW * 0.84), int(FH * 0.44)), "57 t", font=_load_font(FONT_DIN, 140), fill=234, anchor="mm")
        dfw.text((int(FW * 0.84), int(FH * 0.64)), "8.8 cm KwK 36", font=_load_font(FONT_COND, 100), fill=224, anchor="mm")

        _paste_uv_band(white_mask, fw_img, 0.015, 0.485, 0.800, 0.985)
        _paste_uv_band(black_mask, fb_img, 0.015, 0.485, 0.800, 0.985)
        _paste_uv_band(white_mask, fw_img, 0.515, 0.985, 0.800, 0.985)
        _paste_uv_band(black_mask, fb_img, 0.515, 0.985, 0.800, 0.985)

        # Fine combed horizontal Zimmerit relief across BOTH hull flank bands + front vertical glacis band!
        zh1, zc1 = _make_zimmerit_height(h, w, 0.015, 0.485, 0.800, 0.985, ridges_v=40.0, seed=1311)
        zh2, zc2 = _make_zimmerit_height(h, w, 0.515, 0.985, 0.800, 0.985, ridges_v=40.0, seed=1312)
        zimm_h += zh1 + zh2
        zimm_chip = np.maximum(zimm_chip, np.maximum(zc1, zc2))

        # --- HERO BAND 3: Front Vertical 100mm Driver's Plate Center Emblem [0.015, 0.360] x [0.640, 0.768] ---
        PW, PH = 2560, 1120
        pw_img = Image.new("L", (PW, PH), 0)
        pb_img = Image.new("L", (PW, PH), 0)
        dpw = ImageDraw.Draw(pw_img)
        dpb = ImageDraw.Draw(pb_img)
        _draw_bold_131(dpw, dpb, PW, PH)
        _paste_uv_band(white_mask, pw_img, 0.015, 0.360, 0.640, 0.768)
        _paste_uv_band(black_mask, pb_img, 0.015, 0.360, 0.640, 0.768)
        zh3, zc3 = _make_zimmerit_height(h, w, 0.015, 0.360, 0.640, 0.768, ridges_v=30.0, seed=1313)
        zimm_h += zh3
        zimm_chip = np.maximum(zimm_chip, zc3)

        # Never chip paste directly on top of tactical numerals/cross
        zimm_chip *= (1.0 - np.clip(white_mask + black_mask, 0.0, 1.0))

        # Subtle Rotbraun red-oxide primer showing inside flaked Zimmerit edge chips
        _mix(albedo, (0.34, 0.135, 0.095), zimm_chip * 0.58)
        _mix(rgh, 0.66, zimm_chip * 0.55)
        _mix(met, 0.10, zimm_chip * 0.45)

        # Subtle Tunisian dust & field wear micro-chipping on markings (94% crisp!)
        rng = np.random.default_rng(13101)
        mottle = ndimage.gaussian_filter(rng.uniform(0.86, 1.0, (h, w)).astype(np.float32), sigma=1.1 * res_scale)
        w_paint = np.clip(white_mask * mottle, 0.0, 1.0)
        b_paint = np.clip(black_mask * mottle, 0.0, 1.0)

        # Paint white outline first, then crisp charcoal-black inner fill (AgX anti-crush sRGB 0.14!)
        _mix(albedo, (0.91, 0.895, 0.855), w_paint * 0.96)
        _mix(rgh, 0.54, w_paint * 0.88)
        _mix(met, 0.02, w_paint * 0.95)

        _mix(albedo, (0.14, 0.145, 0.152), b_paint * 0.96)
        _mix(rgh, 0.58, b_paint * 0.88)
        _mix(met, 0.03, b_paint * 0.95)

        # Crisp 4K Zimmerit crevice shading in AO, cavity dirt in albedo & tangent normal map!
        ao *= np.clip(1.0 + zimm_h * 0.24, 0.76, 1.06)
        albedo *= (0.76 + 0.24 * ao[..., None])
        nrm_zimm = _height_to_normal_01(
            zimm_h * (1.65 * res_scale) + _bevel_mask(w_paint, 1.1 * res_scale) * (0.12 * res_scale),
            strength=3.3,
        )
        nrm_final = _rnm_blend(nrm, nrm_zimm)

        # Lift interior ivory (Elfenbein) hull walls visibility inside cutaway
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        ivory_zone = (u_grid >= 0.390) & (u_grid <= 0.675) & (v_grid >= 0.640) & (v_grid <= 0.770)
        ao[ivory_zone] = np.maximum(ao[ivory_zone], 0.85)

        rgh = np.clip(rgh, 0.14, 0.96)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        img_a = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_n = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_o = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        print(f"[POST] Composited tiger1_v3_hull_zimmerit ({w}x{h})")
        return img_a, img_n, img_o

    # -------------------------------------------------------------------------
    # SUITE 2: tiger1_v3_turret_88mm_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def build_turret_88mm_images() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "t88_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "t88_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "t88_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "t88_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "t88_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "t88_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "t88_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        res_scale = w / 2048.0
        albedo = _linear_to_srgb(alb_lin)
        white_mask = np.zeros((h, w), dtype=np.float32)
        black_mask = np.zeros((h, w), dtype=np.float32)
        zimm_h = np.zeros((h, w), dtype=np.float32)
        zimm_chip = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Iconic Bovington Museum Turret Tactical Number "131" (2x 4K crisp!) ---
        TW, TH = 3600, 1560
        tw_img = Image.new("L", (TW, TH), 0)
        tb_img = Image.new("L", (TW, TH), 0)
        dtw = ImageDraw.Draw(tw_img)
        dtb = ImageDraw.Draw(tb_img)
        _draw_bold_131(dtw, dtb, TW, TH)

        _paste_uv_band(white_mask, tw_img, 0.015, 0.475, 0.785, 0.985)
        _paste_uv_band(black_mask, tb_img, 0.015, 0.475, 0.785, 0.985)
        _paste_uv_band(white_mask, tw_img, 0.510, 0.970, 0.785, 0.985)
        _paste_uv_band(black_mask, tb_img, 0.510, 0.970, 0.785, 0.985)

        # Authentic horizontal combed Zimmerit relief along BOTH turret flanks behind "131"!
        zh1, zc1 = _make_zimmerit_height(h, w, 0.015, 0.475, 0.785, 0.985, ridges_v=42.0, seed=1321)
        zh2, zc2 = _make_zimmerit_height(h, w, 0.510, 0.970, 0.785, 0.985, ridges_v=42.0, seed=1322)
        zimm_h += zh1 + zh2
        zimm_chip = np.maximum(zc1, zc2) * (1.0 - np.clip(white_mask + black_mask, 0.0, 1.0))

        _mix(albedo, (0.34, 0.135, 0.095), zimm_chip * 0.58)
        _mix(rgh, 0.66, zimm_chip * 0.55)
        _mix(met, 0.10, zimm_chip * 0.45)

        rng = np.random.default_rng(13102)
        mottle = ndimage.gaussian_filter(rng.uniform(0.88, 1.0, (h, w)).astype(np.float32), sigma=1.0 * res_scale)
        w_paint = np.clip(white_mask * mottle, 0.0, 1.0)
        b_paint = np.clip(black_mask * mottle, 0.0, 1.0)

        _mix(albedo, (0.93, 0.915, 0.875), w_paint * 0.96)
        _mix(rgh, 0.52, w_paint * 0.88)
        _mix(met, 0.02, w_paint * 0.95)

        _mix(albedo, (0.135, 0.140, 0.148), b_paint * 0.96)
        _mix(rgh, 0.56, b_paint * 0.88)
        _mix(met, 0.03, b_paint * 0.95)

        ao *= np.clip(1.0 + zimm_h * 0.24, 0.76, 1.06)
        albedo *= (0.76 + 0.24 * ao[..., None])
        nrm_zimm = _height_to_normal_01(
            zimm_h * (1.65 * res_scale) + _bevel_mask(w_paint, 1.1 * res_scale) * (0.12 * res_scale),
            strength=3.3,
        )
        nrm_final = _rnm_blend(nrm, nrm_zimm)

        # Lift cutaway interior visibility: TZF 9b sapphire lenses, turret ivory interior & chrome recoil rods
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        lens_zone = (u_grid >= 0.010) & (u_grid <= 0.165) & (v_grid >= 0.610) & (v_grid <= 0.755)
        ivory_zone = (u_grid >= 0.195) & (u_grid <= 0.500) & (v_grid >= 0.610) & (v_grid <= 0.755)
        ao[lens_zone] = np.maximum(ao[lens_zone], 0.96)
        ao[ivory_zone] = np.maximum(ao[ivory_zone], 0.86)

        rgh = np.clip(rgh, 0.06, 0.96)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        img_a = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_n = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_o = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        print(f"[POST] Composited tiger1_v3_turret_88mm ({w}x{h})")
        return img_a, img_n, img_o

    # -------------------------------------------------------------------------
    # SUITE 3: tiger1_v3_drivetrain_int_{albedo,normal,roughness}.webp (2048x2048)
    # -------------------------------------------------------------------------
    def build_drivetrain_int_images() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "di_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "di_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "di_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "di_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "di_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "di_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "di_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        dark_etch = np.zeros((h, w), dtype=np.float32)
        white_dial = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1: Maybach HL230 P45 Factory Brass/Aluminum Data Plate [0.015, 0.440] x [0.820, 0.985] ---
        MW, MH = 1480, 560
        m_etch = Image.new("L", (MW, MH), 0)
        dme = ImageDraw.Draw(m_etch)
        dme.rounded_rectangle((26, 26, MW - 26, MH - 26), radius=20, outline=255, width=10)
        dme.rounded_rectangle((46, 46, MW - 46, MH - 46), radius=14, outline=235, width=4)
        for rx_r in (78, MW - 78):
            for ry_r in (78, MH - 78):
                dme.ellipse((rx_r - 14, ry_r - 14, rx_r + 14, ry_r + 14), fill=255)
        dme.text((MW // 2, 134), "MAYBACH-MOTORENBAU  G.M.B.H.", font=_load_font(FONT_DIN, 74), fill=255, anchor="mm")
        dme.line([(110, 192), (MW - 110, 192)], fill=245, width=6)
        dme.text((MW // 2, 276), "HL 230 P45  /  V12  /  23.1 L  /  700 PS", font=_load_font(FONT_DIN, 78), fill=255, anchor="mm")
        dme.text((MW // 2, 382), "FRIEDRICHSHAFEN  -  3000 U/MIN  -  WASSERGEKUEHLT", font=_load_font(FONT_COND, 56), fill=245, anchor="mm")
        dme.text((MW // 2, 464), "OLVAR 40 12 16  +  L600C  LENKGETRIEBE", font=_load_font(FONT_COND, 52), fill=235, anchor="mm")
        _paste_uv_band(dark_etch, m_etch, 0.015, 0.440, 0.820, 0.985)

        # --- HERO BAND 2: Driver Instrument Dial Cluster [0.015, 0.300] x [0.665, 0.785] ---
        DW, DH = 960, 420
        d_white = Image.new("L", (DW, DH), 0)
        d_black = Image.new("L", (DW, DH), 0)
        ddw = ImageDraw.Draw(d_white)
        ddb = ImageDraw.Draw(d_black)
        for gx, lbl in ((190, "KM/H"), (480, "U/MIN"), (770, "C / BAR")):
            ddw.ellipse((gx - 120, 60, gx + 120, 300), outline=255, width=10)
            ddb.ellipse((gx - 108, 72, gx + 108, 288), fill=245)
            for a_i in range(11):
                ang = math.radians(-210 + a_i * 24)
                x0t = gx + int(math.cos(ang) * 76)
                y0t = 180 + int(math.sin(ang) * 76)
                x1t = gx + int(math.cos(ang) * 98)
                y1t = 180 + int(math.sin(ang) * 98)
                ddw.line([(x0t, y0t), (x1t, y1t)], fill=255, width=6)
            ddw.line([(gx, 180), (gx + 54, 126)], fill=255, width=8)
            ddw.text((gx, 355), lbl, font=_load_font(FONT_DIN, 46), fill=245, anchor="mm")
        _paste_uv_band(white_dial, d_white, 0.015, 0.300, 0.665, 0.785)
        _paste_uv_band(dark_etch, d_black, 0.015, 0.300, 0.665, 0.785)

        _mix(albedo, (0.11, 0.115, 0.125), dark_etch * 0.90)
        _mix(rgh, 0.52, dark_etch * 0.80)
        _mix(met, 0.15, dark_etch * 0.85)

        _mix(albedo, (0.94, 0.94, 0.90), white_dial * 0.95)
        _mix(rgh, 0.38, white_dial * 0.85)
        _mix(met, 0.04, white_dial * 0.92)

        # Boost cutaway brilliance on 88mm C26000 brass rounds, orange-brown V12 exhausts & aluminum radiators!
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        brass_zone = (u_grid >= 0.475) & (u_grid <= 0.750) & (v_grid >= 0.780) & (v_grid <= 0.990)
        exhaust_zone = (u_grid >= 0.780) & (u_grid <= 0.990) & (v_grid >= 0.780) & (v_grid <= 0.990)
        ao[brass_zone] = np.maximum(ao[brass_zone], 0.86)
        ao[exhaust_zone] = np.maximum(ao[exhaust_zone], 0.82)

        etch_h = -0.35 * _bevel_mask(dark_etch, 1.0) + 0.15 * _bevel_mask(white_dial, 1.0)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(etch_h, strength=2.0))

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        img_a = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_n = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        img_o = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        print(f"[POST] Composited tiger1_v3_drivetrain_int ({w}x{h})")
        return img_a, img_n, img_o

    def _encode_webp_bytes(img: Image.Image, quality: int) -> bytes:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=quality, method=6)
        return buf.getvalue()

    hz_imgs = build_hull_zimmerit_images()
    t88_imgs = build_turret_88mm_images()
    di_imgs = build_drivetrain_int_images()

    glb_bytes = glb_path.stat().st_size if (glb_path is not None and glb_path.exists()) else 1_500_000

    # Keep 2K interior drivetrain atlas razor-crisp at 88/90/88
    di_names = (
        "tiger1_v3_drivetrain_int_albedo.webp",
        "tiger1_v3_drivetrain_int_normal.webp",
        "tiger1_v3_drivetrain_int_roughness.webp",
    )
    di_blobs = {
        di_names[0]: _encode_webp_bytes(di_imgs[0], 88),
        di_names[1]: _encode_webp_bytes(di_imgs[1], 90),
        di_names[2]: _encode_webp_bytes(di_imgs[2], 88),
    }
    di_total = sum(len(b) for b in di_blobs.values())

    # Adaptive WebP quality schedule for both 4K exterior suites (start 88/90/88, step down if total > 11.50 MB!)
    QUALITY_SCHEDULE = (
        (88, 90, 88),
        (84, 86, 84),
        (80, 83, 80),
        (76, 79, 76),
        (72, 75, 72),
        (67, 70, 67),
        (62, 65, 62),
    )
    ext_specs = (
        ("tiger1_v3_hull_zimmerit_albedo.webp", hz_imgs[0], 0),
        ("tiger1_v3_hull_zimmerit_normal.webp", hz_imgs[1], 1),
        ("tiger1_v3_hull_zimmerit_roughness.webp", hz_imgs[2], 2),
        ("tiger1_v3_turret_88mm_albedo.webp", t88_imgs[0], 0),
        ("tiger1_v3_turret_88mm_normal.webp", t88_imgs[1], 1),
        ("tiger1_v3_turret_88mm_roughness.webp", t88_imgs[2], 2),
    )

    chosen_blobs: dict[str, bytes] = {}
    chosen_q = QUALITY_SCHEDULE[-1]
    for q_tuple in QUALITY_SCHEDULE:
        cand = {fname: _encode_webp_bytes(img, q_tuple[ch_idx]) for (fname, img, ch_idx) in ext_specs}
        tot_mb = (glb_bytes + di_total + sum(len(b) for b in cand.values())) / (1024 * 1024)
        print(f"[POST-ADAPT] 4K quality={q_tuple} -> projected total bundle = {tot_mb:.2f} MB (target <= 11.50 MB)")
        chosen_blobs = cand
        chosen_q = q_tuple
        if tot_mb <= 11.50:
            break

    all_blobs = {**chosen_blobs, **di_blobs}
    for fname, blob in all_blobs.items():
        (out_dir / fname).write_bytes(blob)
    final_mb = (glb_bytes + sum(len(b) for b in all_blobs.values())) / (1024 * 1024)
    print(f"[POST] Saved 9 WebP maps (4K ext q={chosen_q}, 2K int q=(88,90,88)) | bundle={final_mb:.2f} MB")
    assert final_mb <= 11.80, f"Postprocess exceeded 11.80 MB hard budget: {final_mb:.2f} MB"
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Sculptural Builder + Cycles Metal GPU Baker
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "tiger1.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE_EXT = 4096
ATLAS_SIZE_INT = 2048
BAKE_MARGIN_EXT = 10
BAKE_MARGIN_INT = 6
BAKE_AO_SAMPLES = 24
BAKE_NORMAL_SAMPLES = 12

# Exact right-handed Three.js Y-up -> Blender Z-up proper rotation (+90 deg X, det = +1):
# (bx, by, bz) = (tx, -tz, ty)
T2B_MAT = Matrix((
    (1.0,  0.0, 0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0, 0.0, 0.0),
    (0.0,  0.0, 0.0, 1.0),
))

def t2b(tx: float, ty: float, tz: float) -> tuple[float, float, float]:
    return (tx, -tz, ty)

def srgb_to_lin_ch(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def srgb_to_lin(r: float, g: float, b: float) -> tuple[float, float, float, float]:
    return (srgb_to_lin_ch(r), srgb_to_lin_ch(g), srgb_to_lin_ch(b), 1.0)

# Exact 24-Part Roster across 3 dedicated 2K suites (skips ONLY dynamic CSG springs:
# `tiger_recoil_springs` & `tiger_breech_spring`!)
HULL_ZIMMERIT_PARTS = (
    "tiger_hull_box",
    "tiger_side_fenders",
    "tiger_interleaved_wheels",
    "tiger_tracks_left",
    "tiger_tracks_right",
    "tiger_engine_deck",
    "tiger_torsion_bars",
    "tiger_turret_ring",
)

TURRET_88MM_PARTS = (
    "tiger_turret_shell",
    "tiger_cupola_hatches",
    "tiger_gun_mantlet",
    "tiger_main_gun",
    "tiger_recoil_cradle",
    "tiger_breech_block",
    "tiger_shell_guard",
    "tiger_optics_tzf9b",
)

DRIVETRAIN_INT_PARTS = (
    "tiger_maybach_v12",
    "tiger_transmission",
    "tiger_driveshaft",
    "tiger_turret_basket",
    "tiger_ammo_racks",
    "tiger_ready_round",
    "tiger_fuel_tanks",
    "tiger_crew_stations",
)

# Exact assembledPos matching src/weapons/tiger1/plugin.ts (1u = 1cm)
ASSEMBLED_POS: dict[str, tuple[float, float, float]] = {
    "tiger_hull_box":           (0.0,    0.0,    0.0),
    "tiger_side_fenders":       (0.0,   12.0,    0.0),
    "tiger_interleaved_wheels": (0.0,  -76.0,    0.0),
    "tiger_tracks_left":        (0.0,  -63.0, -140.75),
    "tiger_tracks_right":       (0.0,  -63.0,  140.75),
    "tiger_engine_deck":       (-214.0, 30.0,    0.0),
    "tiger_torsion_bars":       (-9.0, -68.0,    0.0),
    "tiger_turret_ring":        (18.0,  51.0,    0.0),
    "tiger_turret_shell":       (18.0, 100.0,    0.0),
    "tiger_cupola_hatches":     (-8.0, 160.0,   -4.0),
    "tiger_gun_mantlet":       (134.0, 102.0,    0.0),
    "tiger_main_gun":          (142.0, 102.0,    0.0),
    "tiger_recoil_cradle":      (82.0, 102.0,    0.0),
    "tiger_breech_block":       (64.0, 102.0,    0.0),
    "tiger_shell_guard":         (8.0,  92.0,    0.0),
    "tiger_optics_tzf9b":       (84.0, 106.0,  -38.0),
    "tiger_maybach_v12":      (-206.0, -12.0,    0.0),
    "tiger_transmission":      (216.0, -32.0,    0.0),
    "tiger_driveshaft":         (20.0, -44.0,    0.0),
    "tiger_turret_basket":      (18.0,   8.0,    0.0),
    "tiger_ammo_racks":         (14.0,  14.0, -124.0),
    "tiger_ready_round":       (-64.0,  72.0,  -62.0),
    "tiger_fuel_tanks":       (-202.0,  -8.0, -126.0),
    "tiger_crew_stations":      (86.0,  12.0,  -10.0),
}

EXTERIOR_CONTACT_AO_PARTS = {
    "tiger_hull_box",
    "tiger_side_fenders",
    "tiger_interleaved_wheels",
    "tiger_tracks_left",
    "tiger_tracks_right",
    "tiger_engine_deck",
    "tiger_turret_shell",
    "tiger_cupola_hatches",
    "tiger_gun_mantlet",
    "tiger_main_gun",
}

# Exact CSG fallback reference bounding boxes (Three.js local cm)
CSG_REF_BBOX: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {
    "tiger_main_gun": ((-40.00, -13.50, -13.36), (387.00, 13.50, 13.36)),
    "tiger_gun_mantlet": ((-9.00, -23.00, -69.00), (38.00, 23.00, 69.00)),
    "tiger_recoil_cradle": ((-41.00, -20.10, -22.00), (50.50, 20.30, 22.00)),
    "tiger_shell_guard": ((-32.00, -34.00, -17.90), (28.00, 20.00, 17.90)),
    "tiger_hull_box": ((-316.00, -73.00, -162.00), (316.00, 52.00, 162.00)),
    "tiger_side_fenders": ((-306.00, -15.00, -178.00), (306.00, 7.00, 178.00)),
    "tiger_interleaved_wheels": ((-310.00, -40.00, -170.00), (301.00, 67.00, 170.00)),
    "tiger_tracks_left": ((-312.50, -57.00, -36.25), (306.50, 59.05, 36.25)),
    "tiger_tracks_right": ((-312.50, -57.00, -36.25), (306.50, 59.05, 36.25)),
    "tiger_engine_deck": ((-107.50, -44.00, -142.00), (94.00, 31.00, 142.00)),
    "tiger_torsion_bars": ((-215.80, -12.80, -120.00), (209.80, 11.00, 120.00)),
    "tiger_turret_ring": ((-101.00, -5.50, -101.00), (101.00, 5.50, 101.00)),
    "tiger_turret_shell": ((-160.00, -45.00, -117.00), (116.00, 46.00, 117.00)),
    "tiger_cupola_hatches": ((-62.00, -14.00, -80.38), (68.00, 20.00, 70.00)),
    "tiger_turret_basket": ((-86.00, -39.95, -86.00), (86.00, 40.00, 86.00)),
    "tiger_fuel_tanks": ((-86.00, -5.50, -21.00), (86.00, 34.00, 23.20)),
    "tiger_breech_block": ((-25.00, -15.50, -15.50), (17.00, 17.50, 15.50)),
    "tiger_optics_tzf9b": ((-38.00, -6.00, -9.49), (42.00, 11.00, 9.49)),
    "tiger_maybach_v12": ((-82.00, -46.00, -97.64), (76.00, 49.00, 90.00)),
    "tiger_transmission": ((-48.00, -32.68, -103.00), (67.00, 23.00, 103.00)),
    "tiger_driveshaft": ((-149.00, -8.80, -8.80), (147.00, 8.80, 8.80)),
    "tiger_crew_stations": ((-125.50, -54.00, -61.00), (92.47, 77.00, 67.00)),
    "tiger_ammo_racks": ((-111.00, -27.00, -23.00), (111.00, 27.00, 23.00)),
    "tiger_ready_round": ((-46.00, -5.60, -5.60), (46.00, 5.60, 5.60)),
}

WHEEL_X_STATIONS = (-212.0, -154.0, -96.0, -38.0, 20.0, 78.0, 136.0, 194.0)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    gpu_found = False
    for dev in prefs.devices:
        if dev.type == "METAL":
            dev.use = True
            gpu_found = True
        else:
            dev.use = False
    scene.cycles.device = "GPU" if gpu_found else "CPU"
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.ao_bounces = 1
    scene.cycles.bake_type = "COMBINED"

    world = bpy.data.worlds.new("TigerWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs["Strength"].default_value = 1.0
    print(f"[CYCLES] Configured device={scene.cycles.device} (Metal GPU={gpu_found})")


# =============================================================================
# Procedural AgX-Calibrated WWII German Armor & Drivetrain Material Library
# =============================================================================
def _build_pbr_mat(
    name: str,
    base_srgb: tuple[float, float, float],
    roughness: float,
    metallic: float,
    bevel_r: float = 1.4,
    edge_wear: float = 0.35,
    edge_srgb: tuple[float, float, float] = (0.58, 0.61, 0.65),
    grain_scale: float = 0.45,
    grain_bump: float = 0.26,
    aniso_stretch: tuple[float, float, float] | None = None,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    coord_sock = tc.outputs["Object"]
    if aniso_stretch is not None:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = aniso_stretch
        nt.links.new(coord_sock, mp.inputs["Vector"])
        coord_sock = mp.outputs["Vector"]

    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.025
    n_macro.inputs["Detail"].default_value = 5.0
    n_macro.inputs["Roughness"].default_value = 0.62
    nt.links.new(tc.outputs["Object"], n_macro.inputs["Vector"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = grain_scale
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.66
    nt.links.new(coord_sock, noise.inputs["Vector"])

    # Rich tonal variation across armor/steel/rubber components
    mr_c = nt.nodes.new("ShaderNodeMix")
    mr_c.data_type = "RGBA"
    mr_c.inputs[6].default_value = srgb_to_lin(
        max(0.04, base_srgb[0] * 0.84),
        max(0.04, base_srgb[1] * 0.84),
        max(0.04, base_srgb[2] * 0.84),
    )
    mr_c.inputs[7].default_value = srgb_to_lin(
        min(0.98, base_srgb[0] * 1.14),
        min(0.98, base_srgb[1] * 1.14),
        min(0.98, base_srgb[2] * 1.14),
    )
    nt.links.new(n_macro.outputs["Fac"], mr_c.inputs[0])
    col_sock = mr_c.outputs[2]

    mr_r = nt.nodes.new("ShaderNodeMapRange")
    mr_r.clamp = True
    mr_r.inputs["From Min"].default_value = 0.24
    mr_r.inputs["From Max"].default_value = 0.76
    mr_r.inputs["To Min"].default_value = max(0.06, roughness - 0.10)
    mr_r.inputs["To Max"].default_value = min(0.95, roughness + 0.10)
    nt.links.new(n_macro.outputs["Fac"], mr_r.inputs["Value"])
    rgh_sock = mr_r.outputs["Result"]

    met_val = nt.nodes.new("ShaderNodeValue")
    met_val.outputs[0].default_value = metallic
    met_sock = met_val.outputs[0]

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if edge_wear > 0.01:
        # Per-pixel BevelNormal curvature mask (works crisply on ANY polygon density!)
        vdot = nt.nodes.new("ShaderNodeVectorMath")
        vdot.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
        nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])

        sub_c = nt.nodes.new("ShaderNodeMath")
        sub_c.operation = "SUBTRACT"
        sub_c.inputs[0].default_value = 1.0
        nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.012
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.14
        ramp.color_ramp.elements[1].color = (edge_wear, edge_wear, edge_wear, 1.0)
        nt.links.new(sub_c.outputs["Value"], ramp.inputs["Fac"])

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
        mix_er.inputs[3].default_value = max(0.18, roughness - 0.24)
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        mix_em = nt.nodes.new("ShaderNodeMix")
        mix_em.data_type = "FLOAT"
        mix_em.inputs[3].default_value = min(0.95, max(metallic, 0.84))
        nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
        nt.links.new(met_sock, mix_em.inputs[2])
        met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    if grain_bump > 0.001:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.55
        nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_dunkelgelb_camo_mat(
    name: str,
    camo_strength: float = 0.65,
    zimmerit_walls: bool = True,
    cast_steel: bool = False,
    lower_dust: bool = False,
    wheel_weathering: bool = False,
    oil_streaks: bool = False,
    rear_exhaust_soot: bool = False,
    deck_soot: bool = False,
) -> bpy.types.Material:
    """Authentic 1943 Tunisian Dunkelgelb RAL 7028 / Olivgrün ambush patina + full-wall combed Zimmerit
    + heavy rolled/cast Krupp armor pitting + two-stage Rotbraun RAL 8012 primer -> rubbed Krupp steel
    combat edge chipping + dry Tunisian sand/ochre dust (R~0.95) vs wet grease/oil weeping (R~0.22)
    + Maybach HL230 exhaust soot staining!"""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep_obj = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep_obj.inputs["Vector"])

    # Macro 3D Tunisian ambush camo modulation calibrated to Blender Perlin [0.38..0.62] PDF!
    mp_c = nt.nodes.new("ShaderNodeMapping")
    mp_c.inputs["Scale"].default_value = (0.0075, 0.012, 0.010)
    nt.links.new(tc.outputs["Object"], mp_c.inputs["Vector"])

    n_oliv = nt.nodes.new("ShaderNodeTexNoise")
    n_oliv.inputs["Scale"].default_value = 1.55
    n_oliv.inputs["Detail"].default_value = 4.5
    n_oliv.inputs["Distortion"].default_value = 0.72
    nt.links.new(mp_c.outputs["Vector"], n_oliv.inputs["Vector"])

    r_oliv = nt.nodes.new("ShaderNodeValToRGB")
    r_oliv.color_ramp.elements[0].position = 0.50
    r_oliv.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_oliv.color_ramp.elements[1].position = 0.60
    r_oliv.color_ramp.elements[1].color = (camo_strength * 0.78, camo_strength * 0.78, camo_strength * 0.78, 1.0)
    nt.links.new(n_oliv.outputs["Fac"], r_oliv.inputs["Fac"])

    mp_b = nt.nodes.new("ShaderNodeMapping")
    mp_b.inputs["Location"].default_value = (13.7, -8.4, 5.2)
    mp_b.inputs["Scale"].default_value = (0.009, 0.012, 0.011)
    nt.links.new(tc.outputs["Object"], mp_b.inputs["Vector"])

    n_rot = nt.nodes.new("ShaderNodeTexNoise")
    n_rot.inputs["Scale"].default_value = 1.85
    n_rot.inputs["Detail"].default_value = 4.5
    n_rot.inputs["Distortion"].default_value = 0.62
    nt.links.new(mp_b.outputs["Vector"], n_rot.inputs["Vector"])

    r_rot = nt.nodes.new("ShaderNodeValToRGB")
    r_rot.color_ramp.elements[0].position = 0.54
    r_rot.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_rot.color_ramp.elements[1].position = 0.64
    r_rot.color_ramp.elements[1].color = (camo_strength * 0.48, camo_strength * 0.48, camo_strength * 0.48, 1.0)
    nt.links.new(n_rot.outputs["Fac"], r_rot.inputs["Fac"])

    # Heavy rolled Krupp steel mill-scale pitting + Voronoi micro-dimples (extra coarse for cast mantlet!)
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.022
    n_macro.inputs["Detail"].default_value = 6.0
    n_macro.inputs["Roughness"].default_value = 0.64
    nt.links.new(tc.outputs["Object"], n_macro.inputs["Vector"])

    n_fine = nt.nodes.new("ShaderNodeTexNoise")
    n_fine.inputs["Scale"].default_value = 0.45 if not cast_steel else 0.78
    n_fine.inputs["Detail"].default_value = 8.0
    n_fine.inputs["Roughness"].default_value = 0.72
    nt.links.new(tc.outputs["Object"], n_fine.inputs["Vector"])

    vor_pit = nt.nodes.new("ShaderNodeTexVoronoi")
    vor_pit.feature = "F1"
    vor_pit.inputs["Scale"].default_value = 1.5 if not cast_steel else 2.4
    nt.links.new(tc.outputs["Object"], vor_pit.inputs["Vector"])

    mix_steel_h = nt.nodes.new("ShaderNodeMix")
    mix_steel_h.data_type = "FLOAT"
    mix_steel_h.inputs["Factor"].default_value = 0.38 if not cast_steel else 0.54
    nt.links.new(n_fine.outputs["Fac"], mix_steel_h.inputs[2])
    nt.links.new(vor_pit.outputs["Distance"], mix_steel_h.inputs[3])
    height_sock = mix_steel_h.outputs[0]

    # Seamless full-wall combed horizontal Zimmerit paste relief on ALL vertical armor plates (|TrueNormal.z| < 0.35)!
    if zimmerit_walls:
        sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geom.outputs["True Normal"], sep_n.inputs["Vector"])
        abs_nz = nt.nodes.new("ShaderNodeMath")
        abs_nz.operation = "ABSOLUTE"
        nt.links.new(sep_n.outputs["Z"], abs_nz.inputs[0])

        wall_mask = nt.nodes.new("ShaderNodeMapRange")
        wall_mask.clamp = True
        wall_mask.inputs["From Min"].default_value = 0.25
        wall_mask.inputs["From Max"].default_value = 0.55
        wall_mask.inputs["To Min"].default_value = 1.0
        wall_mask.inputs["To Max"].default_value = 0.0
        nt.links.new(abs_nz.outputs["Value"], wall_mask.inputs["Value"])

        # Horizontal combed Zimmerit grooves along Blender Z (~1.6 cm pitch matching 4K Hero bands!)
        wave_z = nt.nodes.new("ShaderNodeTexWave")
        wave_z.wave_type = "BANDS"
        wave_z.bands_direction = "Z"
        wave_z.wave_profile = "SAW"
        wave_z.inputs["Scale"].default_value = 0.112
        wave_z.inputs["Distortion"].default_value = 1.35
        wave_z.inputs["Detail"].default_value = 2.0
        nt.links.new(tc.outputs["Object"], wave_z.inputs["Vector"])

        mix_zh = nt.nodes.new("ShaderNodeMix")
        mix_zh.data_type = "FLOAT"
        nt.links.new(wall_mask.outputs["Result"], mix_zh.inputs[0])
        nt.links.new(height_sock, mix_zh.inputs[2])
        nt.links.new(wave_z.outputs["Fac"], mix_zh.inputs[3])
        height_sock = mix_zh.outputs[0]

    # Vertical gravity rain / oil / battle-grime streaking down armor walls
    mp_st = nt.nodes.new("ShaderNodeMapping")
    mp_st.inputs["Scale"].default_value = (0.09, 0.09, 0.015)
    nt.links.new(tc.outputs["Object"], mp_st.inputs["Vector"])
    n_st = nt.nodes.new("ShaderNodeTexNoise")
    n_st.inputs["Scale"].default_value = 1.0
    n_st.inputs["Detail"].default_value = 5.0
    nt.links.new(mp_st.outputs["Vector"], n_st.inputs["Vector"])
    r_st = nt.nodes.new("ShaderNodeValToRGB")
    r_st.color_ramp.elements[0].position = 0.52
    r_st.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_st.color_ramp.elements[1].position = 0.75
    r_st.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1.0)
    nt.links.new(n_st.outputs["Fac"], r_st.inputs["Fac"])

    # Base Dunkelgelb RAL 7028 with rich warm 1943 Tunisian desert ochre variation
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = srgb_to_lin(0.51, 0.44, 0.28)
    mix_base.inputs[7].default_value = srgb_to_lin(0.62, 0.54, 0.35)
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])

    # Layer Olivgrün RAL 6003 Tunisian ambush olive tone
    mix_oliv = nt.nodes.new("ShaderNodeMix")
    mix_oliv.data_type = "RGBA"
    mix_oliv.inputs[7].default_value = srgb_to_lin(0.32, 0.39, 0.24)
    nt.links.new(r_oliv.outputs["Color"], mix_oliv.inputs[0])
    nt.links.new(mix_base.outputs[2], mix_oliv.inputs[6])

    # Layer warm Rotbraun RAL 8017 dust/ambush streaks
    mix_rot = nt.nodes.new("ShaderNodeMix")
    mix_rot.data_type = "RGBA"
    mix_rot.inputs[7].default_value = srgb_to_lin(0.45, 0.27, 0.18)
    nt.links.new(r_rot.outputs["Color"], mix_rot.inputs[0])
    nt.links.new(mix_oliv.outputs[2], mix_rot.inputs[6])

    # Apply dark gravity rain / grime streaks
    mix_st = nt.nodes.new("ShaderNodeMix")
    mix_st.data_type = "RGBA"
    mix_st.inputs[7].default_value = srgb_to_lin(0.22, 0.19, 0.14)
    nt.links.new(r_st.outputs["Color"], mix_st.inputs[0])
    nt.links.new(mix_rot.outputs[2], mix_st.inputs[6])

    col_sock = mix_st.outputs[2]

    # Authentic dead-matte WWII field lacquer roughness (0.74-0.90)
    mr_base_r = nt.nodes.new("ShaderNodeMapRange")
    mr_base_r.clamp = True
    mr_base_r.inputs["From Min"].default_value = 0.24
    mr_base_r.inputs["From Max"].default_value = 0.76
    mr_base_r.inputs["To Min"].default_value = 0.74
    mr_base_r.inputs["To Max"].default_value = 0.90
    nt.links.new(n_macro.outputs["Fac"], mr_base_r.inputs["Value"])
    rgh_sock = mr_base_r.outputs["Result"]

    met_base = nt.nodes.new("ShaderNodeValue")
    met_base.outputs[0].default_value = 0.03
    met_sock = met_base.outputs[0]

    # -------------------------------------------------------------------------
    # TWO-STAGE WWII COMBAT EDGE WEAR:
    # Stage 1: Dunkelgelb -> German Rotbraun RAL 8012 Red-Oxide Primer (0.34, 0.11, 0.08)
    # Stage 2: Hardest corners -> Burnished Rubbed Krupp Steel (R~0.30, M~0.88)
    # -------------------------------------------------------------------------
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 2.15

    vdot = nt.nodes.new("ShaderNodeVectorMath")
    vdot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
    nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])

    sub_c = nt.nodes.new("ShaderNodeMath")
    sub_c.operation = "SUBTRACT"
    sub_c.inputs[0].default_value = 1.0
    nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])

    chip_n = nt.nodes.new("ShaderNodeTexNoise")
    chip_n.inputs["Scale"].default_value = 0.28
    chip_n.inputs["Detail"].default_value = 7.0
    chip_n.inputs["Roughness"].default_value = 0.76
    nt.links.new(tc.outputs["Object"], chip_n.inputs["Vector"])

    r_cn = nt.nodes.new("ShaderNodeValToRGB")
    r_cn.color_ramp.elements[0].position = 0.34
    r_cn.color_ramp.elements[0].color = (0.18, 0.18, 0.18, 1.0)
    r_cn.color_ramp.elements[1].position = 0.65
    r_cn.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(chip_n.outputs["Fac"], r_cn.inputs["Fac"])

    # Stage 1 mask: wider outer chip halo -> Rotbraun red-oxide primer
    r_prim = nt.nodes.new("ShaderNodeValToRGB")
    r_prim.color_ramp.elements[0].position = 0.008
    r_prim.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_prim.color_ramp.elements[1].position = 0.085
    r_prim.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1.0)
    nt.links.new(sub_c.outputs["Value"], r_prim.inputs["Fac"])

    mul_prim = nt.nodes.new("ShaderNodeMath")
    mul_prim.operation = "MULTIPLY"
    nt.links.new(r_prim.outputs["Color"], mul_prim.inputs[0])
    nt.links.new(r_cn.outputs["Color"], mul_prim.inputs[1])

    mix_prim_c = nt.nodes.new("ShaderNodeMix")
    mix_prim_c.data_type = "RGBA"
    mix_prim_c.inputs[7].default_value = srgb_to_lin(0.34, 0.11, 0.08)  # Authentic German Rotbraun RAL 8012 primer!
    nt.links.new(mul_prim.outputs["Value"], mix_prim_c.inputs[0])
    nt.links.new(col_sock, mix_prim_c.inputs[6])
    col_sock = mix_prim_c.outputs[2]

    mix_prim_r = nt.nodes.new("ShaderNodeMix")
    mix_prim_r.data_type = "FLOAT"
    mix_prim_r.inputs[3].default_value = 0.66
    nt.links.new(mul_prim.outputs["Value"], mix_prim_r.inputs[0])
    nt.links.new(rgh_sock, mix_prim_r.inputs[2])
    rgh_sock = mix_prim_r.outputs[0]

    mix_prim_m = nt.nodes.new("ShaderNodeMix")
    mix_prim_m.data_type = "FLOAT"
    mix_prim_m.inputs[3].default_value = 0.08
    nt.links.new(mul_prim.outputs["Value"], mix_prim_m.inputs[0])
    nt.links.new(met_sock, mix_prim_m.inputs[2])
    met_sock = mix_prim_m.outputs[0]

    # Stage 2 mask: hardest exposed corners -> bright rubbed Krupp steel (R~0.30, M~0.88)
    r_steel = nt.nodes.new("ShaderNodeValToRGB")
    r_steel.color_ramp.elements[0].position = 0.036
    r_steel.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_steel.color_ramp.elements[1].position = 0.165
    r_steel.color_ramp.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    nt.links.new(sub_c.outputs["Value"], r_steel.inputs["Fac"])

    mul_steel = nt.nodes.new("ShaderNodeMath")
    mul_steel.operation = "MULTIPLY"
    nt.links.new(r_steel.outputs["Color"], mul_steel.inputs[0])
    nt.links.new(r_cn.outputs["Color"], mul_steel.inputs[1])

    mix_steel_c = nt.nodes.new("ShaderNodeMix")
    mix_steel_c.data_type = "RGBA"
    mix_steel_c.inputs[7].default_value = srgb_to_lin(0.43, 0.45, 0.48)  # Burnished rubbed Krupp steel!
    nt.links.new(mul_steel.outputs["Value"], mix_steel_c.inputs[0])
    nt.links.new(col_sock, mix_steel_c.inputs[6])
    col_sock = mix_steel_c.outputs[2]

    mix_steel_r = nt.nodes.new("ShaderNodeMix")
    mix_steel_r.data_type = "FLOAT"
    mix_steel_r.inputs[3].default_value = 0.30
    nt.links.new(mul_steel.outputs["Value"], mix_steel_r.inputs[0])
    nt.links.new(rgh_sock, mix_steel_r.inputs[2])
    rgh_sock = mix_steel_r.outputs[0]

    mix_steel_m = nt.nodes.new("ShaderNodeMix")
    mix_steel_m.data_type = "FLOAT"
    mix_steel_m.inputs[3].default_value = 0.88
    nt.links.new(mul_steel.outputs["Value"], mix_steel_m.inputs[0])
    nt.links.new(met_sock, mix_steel_m.inputs[2])
    met_sock = mix_steel_m.outputs[0]

    # -------------------------------------------------------------------------
    # DRY TUNISIAN SAND / OCHRE DUST PACKED INTO LOWER HULL & WHEEL RECESSES (R ~ 0.95)
    # -------------------------------------------------------------------------
    if lower_dust or wheel_weathering:
        n_dust = nt.nodes.new("ShaderNodeTexNoise")
        n_dust.inputs["Scale"].default_value = 0.065 if wheel_weathering else 0.035
        n_dust.inputs["Detail"].default_value = 7.0
        n_dust.inputs["Roughness"].default_value = 0.74
        nt.links.new(tc.outputs["Object"], n_dust.inputs["Vector"])

        if wheel_weathering:
            # Heavy dusty recesses across interleaved road wheels (thick dry Tunisian desert ochre!)
            r_dm = nt.nodes.new("ShaderNodeMapRange")
            r_dm.clamp = True
            r_dm.inputs["From Min"].default_value = 0.36
            r_dm.inputs["From Max"].default_value = 0.72
            r_dm.inputs["To Min"].default_value = 0.14
            r_dm.inputs["To Max"].default_value = 0.62
            nt.links.new(n_dust.outputs["Fac"], r_dm.inputs["Value"])
            dust_sock = r_dm.outputs["Result"]
        else:
            # Lower hull elevation band (Blender Z = Three.js Y < -8 cm)
            mr_z = nt.nodes.new("ShaderNodeMapRange")
            mr_z.clamp = True
            mr_z.inputs["From Min"].default_value = -58.0
            mr_z.inputs["From Max"].default_value = -4.0
            mr_z.inputs["To Min"].default_value = 0.72
            mr_z.inputs["To Max"].default_value = 0.0
            nt.links.new(sep_obj.outputs["Z"], mr_z.inputs["Value"])

            mul_d = nt.nodes.new("ShaderNodeMath")
            mul_d.operation = "MULTIPLY"
            nt.links.new(mr_z.outputs["Result"], mul_d.inputs[0])
            nt.links.new(n_dust.outputs["Fac"], mul_d.inputs[1])

            sc_d = nt.nodes.new("ShaderNodeMath")
            sc_d.operation = "MULTIPLY"
            sc_d.use_clamp = True
            sc_d.inputs[1].default_value = 1.35
            nt.links.new(mul_d.outputs["Value"], sc_d.inputs[0])
            dust_sock = sc_d.outputs["Value"]

        mix_dc = nt.nodes.new("ShaderNodeMix")
        mix_dc.data_type = "RGBA"
        mix_dc.inputs[7].default_value = srgb_to_lin(0.64, 0.56, 0.40)  # Chalky Tunisian sand/ochre dust!
        nt.links.new(dust_sock, mix_dc.inputs[0])
        nt.links.new(col_sock, mix_dc.inputs[6])
        col_sock = mix_dc.outputs[2]

        mix_dr = nt.nodes.new("ShaderNodeMix")
        mix_dr.data_type = "FLOAT"
        mix_dr.inputs[3].default_value = 0.95
        nt.links.new(dust_sock, mix_dr.inputs[0])
        nt.links.new(rgh_sock, mix_dr.inputs[2])
        rgh_sock = mix_dr.outputs[0]

        mix_dmet = nt.nodes.new("ShaderNodeMix")
        mix_dmet.data_type = "FLOAT"
        mix_dmet.inputs[3].default_value = 0.00
        nt.links.new(dust_sock, mix_dmet.inputs[0])
        nt.links.new(met_sock, mix_dmet.inputs[2])
        met_sock = mix_dmet.outputs[0]

    # -------------------------------------------------------------------------
    # WET DARK GREASE / BEARING-OIL WEEPING STREAKS (R ~ 0.20..0.28!)
    # -------------------------------------------------------------------------
    if oil_streaks or wheel_weathering:
        mp_oil = nt.nodes.new("ShaderNodeMapping")
        mp_oil.inputs["Scale"].default_value = (0.14, 0.14, 0.045) if wheel_weathering else (0.04, 0.04, 0.04)
        nt.links.new(tc.outputs["Object"], mp_oil.inputs["Vector"])
        n_oil = nt.nodes.new("ShaderNodeTexNoise")
        n_oil.inputs["Scale"].default_value = 1.6
        n_oil.inputs["Detail"].default_value = 6.0
        n_oil.inputs["Distortion"].default_value = 0.55
        nt.links.new(mp_oil.outputs["Vector"], n_oil.inputs["Vector"])

        r_oil = nt.nodes.new("ShaderNodeValToRGB")
        r_oil.color_ramp.elements[0].position = 0.56 if wheel_weathering else 0.58
        r_oil.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        r_oil.color_ramp.elements[1].position = 0.71 if wheel_weathering else 0.72
        r_oil.color_ramp.elements[1].color = (0.76 if wheel_weathering else 0.68, 0.76 if wheel_weathering else 0.68, 0.76 if wheel_weathering else 0.68, 1.0)
        nt.links.new(n_oil.outputs["Fac"], r_oil.inputs["Fac"])

        oil_sock = r_oil.outputs["Color"]
        if wheel_weathering:
            # Concentrate dark wet grease weeping closer to wheel hub center (|Object Z| < 24 cm)
            abs_wz = nt.nodes.new("ShaderNodeMath")
            abs_wz.operation = "ABSOLUTE"
            nt.links.new(sep_obj.outputs["Z"], abs_wz.inputs[0])
            hub_fall = nt.nodes.new("ShaderNodeMapRange")
            hub_fall.clamp = True
            hub_fall.inputs["From Min"].default_value = 8.0
            hub_fall.inputs["From Max"].default_value = 28.0
            hub_fall.inputs["To Min"].default_value = 1.0
            hub_fall.inputs["To Max"].default_value = 0.18
            nt.links.new(abs_wz.outputs["Value"], hub_fall.inputs["Value"])

            mul_wo = nt.nodes.new("ShaderNodeMath")
            mul_wo.operation = "MULTIPLY"
            nt.links.new(oil_sock, mul_wo.inputs[0])
            nt.links.new(hub_fall.outputs["Result"], mul_wo.inputs[1])
            oil_sock = mul_wo.outputs["Value"]

        mix_oc = nt.nodes.new("ShaderNodeMix")
        mix_oc.data_type = "RGBA"
        mix_oc.inputs[7].default_value = srgb_to_lin(0.14, 0.12, 0.10)  # Wet dark bearing grease / Maybach oil
        nt.links.new(oil_sock, mix_oc.inputs[0])
        nt.links.new(col_sock, mix_oc.inputs[6])
        col_sock = mix_oc.outputs[2]

        mix_or = nt.nodes.new("ShaderNodeMix")
        mix_or.data_type = "FLOAT"
        mix_or.inputs[3].default_value = 0.22  # Wet glossy oil sheen contrasting R~0.95 dry dust!
        nt.links.new(oil_sock, mix_or.inputs[0])
        nt.links.new(rgh_sock, mix_or.inputs[2])
        rgh_sock = mix_or.outputs[0]

        mix_om = nt.nodes.new("ShaderNodeMix")
        mix_om.data_type = "FLOAT"
        mix_om.inputs[3].default_value = 0.10
        nt.links.new(oil_sock, mix_om.inputs[0])
        nt.links.new(met_sock, mix_om.inputs[2])
        met_sock = mix_om.outputs[0]

    # -------------------------------------------------------------------------
    # BLACK MAYBACH HL230 EXHAUST SOOT STAINING ON REAR HULL TRANSOM & DECK
    # -------------------------------------------------------------------------
    if rear_exhaust_soot or deck_soot:
        n_soot = nt.nodes.new("ShaderNodeTexNoise")
        n_soot.inputs["Scale"].default_value = 0.045
        n_soot.inputs["Detail"].default_value = 6.0
        nt.links.new(tc.outputs["Object"], n_soot.inputs["Vector"])

        if rear_exhaust_soot:
            # Twin vertical exhaust soot plumes centered at Three.js Z = ±36 (Blender |Y| = 36), Y > -24 (Blender Z > -24)
            abs_by = nt.nodes.new("ShaderNodeMath")
            abs_by.operation = "ABSOLUTE"
            nt.links.new(sep_obj.outputs["Y"], abs_by.inputs[0])

            sub_36 = nt.nodes.new("ShaderNodeMath")
            sub_36.operation = "SUBTRACT"
            sub_36.inputs[1].default_value = 36.0
            nt.links.new(abs_by.outputs["Value"], sub_36.inputs[0])

            dist_ex = nt.nodes.new("ShaderNodeMath")
            dist_ex.operation = "ABSOLUTE"
            nt.links.new(sub_36.outputs["Value"], dist_ex.inputs[0])

            plume_y = nt.nodes.new("ShaderNodeMapRange")
            plume_y.clamp = True
            plume_y.inputs["From Min"].default_value = 4.0
            plume_y.inputs["From Max"].default_value = 32.0
            plume_y.inputs["To Min"].default_value = 1.0
            plume_y.inputs["To Max"].default_value = 0.0
            nt.links.new(dist_ex.outputs["Value"], plume_y.inputs["Value"])

            plume_z = nt.nodes.new("ShaderNodeMapRange")
            plume_z.clamp = True
            plume_z.inputs["From Min"].default_value = -26.0
            plume_z.inputs["From Max"].default_value = 46.0
            plume_z.inputs["To Min"].default_value = 0.18
            plume_z.inputs["To Max"].default_value = 0.92
            nt.links.new(sep_obj.outputs["Z"], plume_z.inputs["Value"])

            m1 = nt.nodes.new("ShaderNodeMath")
            m1.operation = "MULTIPLY"
            nt.links.new(plume_y.outputs["Result"], m1.inputs[0])
            nt.links.new(plume_z.outputs["Result"], m1.inputs[1])

            m2 = nt.nodes.new("ShaderNodeMath")
            m2.operation = "MULTIPLY"
            m2.use_clamp = True
            nt.links.new(m1.outputs["Value"], m2.inputs[0])
            nt.links.new(n_soot.outputs["Fac"], m2.inputs[1])

            sc_s = nt.nodes.new("ShaderNodeMath")
            sc_s.operation = "MULTIPLY"
            sc_s.use_clamp = True
            sc_s.inputs[1].default_value = 1.45
            nt.links.new(m2.outputs["Value"], sc_s.inputs[0])
            soot_sock = sc_s.outputs["Value"]
        else:
            # Rear edge of engine deck near twin exhaust stacks (X_local < -55)
            mr_dx = nt.nodes.new("ShaderNodeMapRange")
            mr_dx.clamp = True
            mr_dx.inputs["From Min"].default_value = -102.0
            mr_dx.inputs["From Max"].default_value = -42.0
            mr_dx.inputs["To Min"].default_value = 0.78
            mr_dx.inputs["To Max"].default_value = 0.0
            nt.links.new(sep_obj.outputs["X"], mr_dx.inputs["Value"])

            m_ds = nt.nodes.new("ShaderNodeMath")
            m_ds.operation = "MULTIPLY"
            m_ds.use_clamp = True
            nt.links.new(mr_dx.outputs["Result"], m_ds.inputs[0])
            nt.links.new(n_soot.outputs["Fac"], m_ds.inputs[1])

            sc_ds = nt.nodes.new("ShaderNodeMath")
            sc_ds.operation = "MULTIPLY"
            sc_ds.use_clamp = True
            sc_ds.inputs[1].default_value = 1.4
            nt.links.new(m_ds.outputs["Value"], sc_ds.inputs[0])
            soot_sock = sc_ds.outputs["Value"]

        mix_sc = nt.nodes.new("ShaderNodeMix")
        mix_sc.data_type = "RGBA"
        mix_sc.inputs[7].default_value = srgb_to_lin(0.115, 0.112, 0.115)  # Carbon black Maybach HL230 soot (AgX safe)
        nt.links.new(soot_sock, mix_sc.inputs[0])
        nt.links.new(col_sock, mix_sc.inputs[6])
        col_sock = mix_sc.outputs[2]

        mix_sr = nt.nodes.new("ShaderNodeMix")
        mix_sr.data_type = "FLOAT"
        mix_sr.inputs[3].default_value = 0.92
        nt.links.new(soot_sock, mix_sr.inputs[0])
        nt.links.new(rgh_sock, mix_sr.inputs[2])
        rgh_sock = mix_sr.outputs[0]

        mix_sm = nt.nodes.new("ShaderNodeMix")
        mix_sm.data_type = "FLOAT"
        mix_sm.inputs[3].default_value = 0.02
        nt.links.new(soot_sock, mix_sm.inputs[0])
        nt.links.new(met_sock, mix_sm.inputs[2])
        met_sock = mix_sm.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.48 if cast_steel else (0.40 if zimmerit_walls else 0.34)
    bump.inputs["Distance"].default_value = 0.78
    nt.links.new(height_sock, bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_track_steel_mat(name: str, burnished_cleat: bool = False) -> bpy.types.Material:
    """Kgs 63/725/130 cast-steel track links: weathered dusty manganese steel body OR burnished cold
    cast-steel cleats/guide-horns/sprocket teeth (R~0.24..0.30, M~0.92)!"""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")

    n_m = nt.nodes.new("ShaderNodeTexNoise")
    n_m.inputs["Scale"].default_value = 0.055
    n_m.inputs["Detail"].default_value = 6.0
    n_m.inputs["Roughness"].default_value = 0.68
    nt.links.new(tc.outputs["Object"], n_m.inputs["Vector"])

    n_f = nt.nodes.new("ShaderNodeTexNoise")
    n_f.inputs["Scale"].default_value = 0.95
    n_f.inputs["Detail"].default_value = 8.0
    n_f.inputs["Roughness"].default_value = 0.70
    nt.links.new(tc.outputs["Object"], n_f.inputs["Vector"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.65

    vdot = nt.nodes.new("ShaderNodeVectorMath")
    vdot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
    nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])

    sub_c = nt.nodes.new("ShaderNodeMath")
    sub_c.operation = "SUBTRACT"
    sub_c.inputs[0].default_value = 1.0
    nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])

    r_edge = nt.nodes.new("ShaderNodeValToRGB")
    r_edge.color_ramp.elements[0].position = 0.01
    r_edge.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    r_edge.color_ramp.elements[1].position = 0.12
    r_edge.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1.0)
    nt.links.new(sub_c.outputs["Value"], r_edge.inputs["Fac"])

    if burnished_cleat:
        # Burnished cold cast-steel highlights (R~0.24..0.30, M~0.92!) on cleats, guide horns & sprocket teeth
        mc = nt.nodes.new("ShaderNodeMix")
        mc.data_type = "RGBA"
        mc.inputs[6].default_value = srgb_to_lin(0.46, 0.48, 0.52)
        mc.inputs[7].default_value = srgb_to_lin(0.66, 0.69, 0.74)
        nt.links.new(n_m.outputs["Fac"], mc.inputs[0])

        mc_e = nt.nodes.new("ShaderNodeMix")
        mc_e.data_type = "RGBA"
        mc_e.inputs[7].default_value = srgb_to_lin(0.76, 0.79, 0.84)
        nt.links.new(r_edge.outputs["Color"], mc_e.inputs[0])
        nt.links.new(mc.outputs[2], mc_e.inputs[6])

        mr_r = nt.nodes.new("ShaderNodeMapRange")
        mr_r.clamp = True
        mr_r.inputs["From Min"].default_value = 0.25
        mr_r.inputs["From Max"].default_value = 0.75
        mr_r.inputs["To Min"].default_value = 0.24
        mr_r.inputs["To Max"].default_value = 0.30
        nt.links.new(n_m.outputs["Fac"], mr_r.inputs["Value"])

        nt.links.new(mc_e.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(mr_r.outputs["Result"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.92
    else:
        # Dark oxidized manganese cast-steel link base + dry Tunisian ochre sand packed in link pockets!
        mc = nt.nodes.new("ShaderNodeMix")
        mc.data_type = "RGBA"
        mc.inputs[6].default_value = srgb_to_lin(0.24, 0.22, 0.20)
        mc.inputs[7].default_value = srgb_to_lin(0.35, 0.31, 0.27)
        nt.links.new(n_m.outputs["Fac"], mc.inputs[0])

        # Dry Tunisian dust pockets
        r_td = nt.nodes.new("ShaderNodeValToRGB")
        r_td.color_ramp.elements[0].position = 0.50
        r_td.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        r_td.color_ramp.elements[1].position = 0.68
        r_td.color_ramp.elements[1].color = (0.52, 0.52, 0.52, 1.0)
        nt.links.new(n_m.outputs["Fac"], r_td.inputs["Fac"])

        mc_d = nt.nodes.new("ShaderNodeMix")
        mc_d.data_type = "RGBA"
        mc_d.inputs[7].default_value = srgb_to_lin(0.56, 0.48, 0.34)
        nt.links.new(r_td.outputs["Color"], mc_d.inputs[0])
        nt.links.new(mc.outputs[2], mc_d.inputs[6])

        # Burnished steel edge highlights along shoe ridges
        mc_e = nt.nodes.new("ShaderNodeMix")
        mc_e.data_type = "RGBA"
        mc_e.inputs[7].default_value = srgb_to_lin(0.64, 0.67, 0.72)
        nt.links.new(r_edge.outputs["Color"], mc_e.inputs[0])
        nt.links.new(mc_d.outputs[2], mc_e.inputs[6])

        mr_d = nt.nodes.new("ShaderNodeMix")
        mr_d.data_type = "FLOAT"
        mr_d.inputs[2].default_value = 0.56
        mr_d.inputs[3].default_value = 0.93
        nt.links.new(r_td.outputs["Color"], mr_d.inputs[0])

        mr_e = nt.nodes.new("ShaderNodeMix")
        mr_e.data_type = "FLOAT"
        mr_e.inputs[3].default_value = 0.26
        nt.links.new(r_edge.outputs["Color"], mr_e.inputs[0])
        nt.links.new(mr_d.outputs[0], mr_e.inputs[2])

        mm_d = nt.nodes.new("ShaderNodeMix")
        mm_d.data_type = "FLOAT"
        mm_d.inputs[2].default_value = 0.76
        mm_d.inputs[3].default_value = 0.06
        nt.links.new(r_td.outputs["Color"], mm_d.inputs[0])

        mm_e = nt.nodes.new("ShaderNodeMix")
        mm_e.data_type = "FLOAT"
        mm_e.inputs[3].default_value = 0.92
        nt.links.new(r_edge.outputs["Color"], mm_e.inputs[0])
        nt.links.new(mm_d.outputs[0], mm_e.inputs[2])

        nt.links.new(mc_e.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(mr_e.outputs[0], bsdf.inputs["Roughness"])
        nt.links.new(mm_e.outputs[0], bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22 if burnished_cleat else 0.36
    bump.inputs["Distance"].default_value = 0.45
    nt.links.new(n_f.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_rust_exhaust_mat(name: str, shield_mode: bool = False) -> bpy.types.Material:
    """Heavy burnt-orange heat-rust oxidation + flaky iron-oxide scale + black Maybach HL230 soot!"""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    n_r = nt.nodes.new("ShaderNodeTexNoise")
    n_r.inputs["Scale"].default_value = 0.14
    n_r.inputs["Detail"].default_value = 8.0
    n_r.inputs["Roughness"].default_value = 0.78
    nt.links.new(tc.outputs["Object"], n_r.inputs["Vector"])

    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 1.8
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])

    # Multi-tone burnt-orange / dark-iron ferric rust ramp
    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.26
    cr.elements[0].color = srgb_to_lin(0.22, 0.11, 0.07) if not shield_mode else srgb_to_lin(0.45, 0.38, 0.25)
    cr.elements[1].position = 0.74
    cr.elements[1].color = srgb_to_lin(0.62, 0.25, 0.09)
    mid = cr.elements.new(0.48)
    mid.color = srgb_to_lin(0.44, 0.18, 0.08)
    nt.links.new(n_r.outputs["Fac"], rc.inputs["Fac"])

    # Black exhaust soot near upper stack rim (Blender Z = Three.js Y > +10)
    mr_top = nt.nodes.new("ShaderNodeMapRange")
    mr_top.clamp = True
    mr_top.inputs["From Min"].default_value = 4.0
    mr_top.inputs["From Max"].default_value = 26.0
    mr_top.inputs["To Min"].default_value = 0.08 if not shield_mode else 0.12
    mr_top.inputs["To Max"].default_value = 0.82 if not shield_mode else 0.56
    nt.links.new(sep.outputs["Z"], mr_top.inputs["Value"])

    mix_c = nt.nodes.new("ShaderNodeMix")
    mix_c.data_type = "RGBA"
    mix_c.inputs[7].default_value = srgb_to_lin(0.115, 0.112, 0.116)
    nt.links.new(mr_top.outputs["Result"], mix_c.inputs[0])
    nt.links.new(rc.outputs["Color"], mix_c.inputs[6])

    mr_r = nt.nodes.new("ShaderNodeMapRange")
    mr_r.clamp = True
    mr_r.inputs["From Min"].default_value = 0.25
    mr_r.inputs["From Max"].default_value = 0.75
    mr_r.inputs["To Min"].default_value = 0.84
    mr_r.inputs["To Max"].default_value = 0.94
    nt.links.new(n_r.outputs["Fac"], mr_r.inputs["Value"])

    nt.links.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mr_r.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.18 if not shield_mode else 0.22

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.7
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.52 if not shield_mode else 0.44
    bump.inputs["Distance"].default_value = 0.6
    nt.links.new(vor.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_heat_blued_steel_mat(name: str) -> bpy.types.Material:
    """Heat-blued & bronze-tempered steel for lower Maybach HL230 exhaust manifold elbows."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    n_h = nt.nodes.new("ShaderNodeTexNoise")
    n_h.inputs["Scale"].default_value = 0.16
    n_h.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_h.inputs["Vector"])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.30
    cr.elements[0].color = srgb_to_lin(0.20, 0.23, 0.35)  # Heat-blued steel
    cr.elements[1].position = 0.72
    cr.elements[1].color = srgb_to_lin(0.42, 0.26, 0.17)  # Straw-bronze temper
    mid = cr.elements.new(0.50)
    mid.color = srgb_to_lin(0.30, 0.24, 0.32)  # Violet temper band
    nt.links.new(n_h.outputs["Fac"], rc.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.38
    bsdf.inputs["Metallic"].default_value = 0.86

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.45
    nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_wood_tool_mat(name: str) -> bpy.types.Material:
    """Weathered European ash/oak hardwood grain for pioneer tools & rear wooden jack block."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.05, 0.45, 0.45)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    n_w = nt.nodes.new("ShaderNodeTexNoise")
    n_w.inputs["Scale"].default_value = 1.6
    n_w.inputs["Detail"].default_value = 7.0
    n_w.inputs["Distortion"].default_value = 1.2
    nt.links.new(mp.outputs["Vector"], n_w.inputs["Vector"])

    mc = nt.nodes.new("ShaderNodeMix")
    mc.data_type = "RGBA"
    mc.inputs[6].default_value = srgb_to_lin(0.28, 0.18, 0.10)
    mc.inputs[7].default_value = srgb_to_lin(0.48, 0.33, 0.19)
    nt.links.new(n_w.outputs["Fac"], mc.inputs[0])

    nt.links.new(mc.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.74
    bsdf.inputs["Metallic"].default_value = 0.00

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.4
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.26
    bump.inputs["Distance"].default_value = 0.3
    nt.links.new(n_w.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_kwk36_barrel_mat() -> bpy.types.Material:
    """88mm KwK 36 L/56 barrel: Dunkelgelb rear jacket -> heat-dulled ordnance grey -> iridescent muzzle-heat
    bluing/bronze temper -> deep carbon fouling soot on iconic double-baffle muzzle brake w/ metallic rim wear!"""
    mat = bpy.data.materials.new("T_KwK36Barrel")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Local X spans [-40, +387]
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -40.0
    mr.inputs["From Max"].default_value = 387.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_b = nt.nodes.new("ShaderNodeTexNoise")
    n_b.inputs["Scale"].default_value = 0.09
    n_b.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], n_b.inputs["Vector"])

    add_b = nt.nodes.new("ShaderNodeMath")
    add_b.operation = "MULTIPLY_ADD"
    add_b.inputs[1].default_value = 0.038
    nt.links.new(n_b.outputs["Fac"], add_b.inputs[0])
    nt.links.new(mr.outputs["Result"], add_b.inputs[2])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.58, 0.51, 0.35)      # Dunkelgelb rear recoil jacket
    cr.elements[1].position = 0.60
    cr.elements[1].color = srgb_to_lin(0.54, 0.48, 0.33)      # Painted mid-barrel
    for pos, rgb in (
        (0.70, (0.35, 0.31, 0.25)),    # Natural heat-scorched paint transition ring
        (0.75, (0.29, 0.30, 0.33)),    # Heat-dulled ordnance dark grey Krupp steel
        (0.86, (0.25, 0.27, 0.35)),    # Subtle muzzle-heat bluing band ahead of collar!
        (0.91, (0.34, 0.28, 0.23)),    # Warm bronze temper at threaded locking collar
        (0.95, (0.14, 0.142, 0.150)),  # Heavy carbon fouling soot on double-baffle muzzle brake!
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_b.outputs["Value"], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.00
    rr.color_ramp.elements[0].color = (0.64, 0.64, 0.64, 1.0)
    rr.color_ramp.elements[1].position = 0.82
    rr.color_ramp.elements[1].color = (0.30, 0.30, 0.30, 1.0)
    el_r = rr.color_ramp.elements.new(0.95)
    el_r.color = (0.86, 0.86, 0.86, 1.0)  # Matte velvet carbon fouling on muzzle brake
    nt.links.new(add_b.outputs["Value"], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.00
    rm.color_ramp.elements[0].color = (0.08, 0.08, 0.08, 1.0)
    rm.color_ramp.elements[1].position = 0.80
    rm.color_ramp.elements[1].color = (0.84, 0.84, 0.84, 1.0)
    el_m = rm.color_ramp.elements.new(0.95)
    el_m.color = (0.16, 0.16, 0.16, 1.0)
    nt.links.new(add_b.outputs["Value"], rm.inputs["Fac"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.32

    # Crisp rubbed steel edge wear along twin muzzle brake baffle rims & stepped barrel rings!
    vdot = nt.nodes.new("ShaderNodeVectorMath")
    vdot.operation = "DOT_PRODUCT"
    nt.links.new(bev.outputs["Normal"], vdot.inputs[0])
    nt.links.new(geom.outputs["True Normal"], vdot.inputs[1])
    sub_c = nt.nodes.new("ShaderNodeMath")
    sub_c.operation = "SUBTRACT"
    sub_c.inputs[0].default_value = 1.0
    nt.links.new(vdot.outputs["Value"], sub_c.inputs[1])
    re = nt.nodes.new("ShaderNodeValToRGB")
    re.color_ramp.elements[0].position = 0.02
    re.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    re.color_ramp.elements[1].position = 0.16
    re.color_ramp.elements[1].color = (0.62, 0.62, 0.62, 1.0)
    nt.links.new(sub_c.outputs["Value"], re.inputs["Fac"])

    mix_bc = nt.nodes.new("ShaderNodeMix")
    mix_bc.data_type = "RGBA"
    mix_bc.inputs[7].default_value = srgb_to_lin(0.48, 0.50, 0.54)
    nt.links.new(re.outputs["Color"], mix_bc.inputs[0])
    nt.links.new(rc.outputs["Color"], mix_bc.inputs[6])

    mix_br = nt.nodes.new("ShaderNodeMix")
    mix_br.data_type = "FLOAT"
    mix_br.inputs[3].default_value = 0.28
    nt.links.new(re.outputs["Color"], mix_br.inputs[0])
    nt.links.new(rr.outputs["Color"], mix_br.inputs[2])

    mix_bm = nt.nodes.new("ShaderNodeMix")
    mix_bm.data_type = "FLOAT"
    mix_bm.inputs[3].default_value = 0.88
    nt.links.new(re.outputs["Color"], mix_bm.inputs[0])
    nt.links.new(rm.outputs["Color"], mix_bm.inputs[2])

    nt.links.new(mix_bc.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(mix_br.outputs[0], bsdf.inputs["Roughness"])
    nt.links.new(mix_bm.outputs[0], bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.18
    nt.links.new(n_b.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1 (4K): Hull, Zimmerit, Fenders, Interleaved Wheels, Articulated Kgs 63 Tracks, Engine Deck ---
        "H_DunkelgelbCamo":    _build_dunkelgelb_camo_mat("H_DunkelgelbCamo", camo_strength=0.72, zimmerit_walls=True, lower_dust=True),
        "H_RearTransomCamo":   _build_dunkelgelb_camo_mat("H_RearTransomCamo", camo_strength=0.68, zimmerit_walls=True, lower_dust=True, rear_exhaust_soot=True),
        "H_EngineDeckCamo":    _build_dunkelgelb_camo_mat("H_EngineDeckCamo", camo_strength=0.70, zimmerit_walls=False, oil_streaks=True, deck_soot=True),
        "H_WheelDunkelgelb":   _build_dunkelgelb_camo_mat("H_WheelDunkelgelb", camo_strength=0.58, zimmerit_walls=False, wheel_weathering=True),
        "H_HeroFlank":         _build_dunkelgelb_camo_mat("H_HeroFlank", camo_strength=0.45, zimmerit_walls=False),
        "H_InteriorIvory":     _build_pbr_mat("H_InteriorIvory", (0.76, 0.74, 0.65), 0.68, 0.02, bevel_r=0.9, edge_wear=0.18),
        "H_RedOxideFloor":     _build_pbr_mat("H_RedOxideFloor", (0.42, 0.20, 0.16), 0.74, 0.10, bevel_r=1.0, edge_wear=0.35),
        "H_RubberTire":        _build_pbr_mat("H_RubberTire", (0.17, 0.175, 0.185), 0.88, 0.00, bevel_r=0.9, edge_wear=0.32, edge_srgb=(0.48, 0.43, 0.32), grain_scale=0.95, grain_bump=0.38),
        "H_TrackSteel":        _build_track_steel_mat("H_TrackSteel", burnished_cleat=False),
        "H_TrackCleat":        _build_track_steel_mat("H_TrackCleat", burnished_cleat=True),
        "H_GreaseHub":         _build_pbr_mat("H_GreaseHub", (0.16, 0.15, 0.14), 0.23, 0.56, bevel_r=0.7, edge_wear=0.48, edge_srgb=(0.56, 0.58, 0.62), grain_scale=0.65, grain_bump=0.18),
        "H_RustExhaust":       _build_rust_exhaust_mat("H_RustExhaust", shield_mode=False),
        "H_ExhaustShield":     _build_rust_exhaust_mat("H_ExhaustShield", shield_mode=True),
        "H_HeatBluedManifold": _build_heat_blued_steel_mat("H_HeatBluedManifold"),
        "H_WoodTool":          _build_wood_tool_mat("H_WoodTool"),
        "H_GunMetal":          _build_pbr_mat("H_GunMetal", (0.22, 0.24, 0.26), 0.36, 0.86, bevel_r=0.9, edge_wear=0.65, edge_srgb=(0.64, 0.67, 0.72), grain_scale=0.75, grain_bump=0.22),
        "H_MachinedSteel":     _build_pbr_mat("H_MachinedSteel", (0.64, 0.67, 0.71), 0.24, 0.94, bevel_r=0.6, edge_wear=0.35, aniso_stretch=(0.2, 1.8, 1.8), grain_bump=0.12),

        # --- SUITE 2 (4K): Turret #131, Cupola, 120mm Cast Mantlet, 88mm KwK 36, Cradle, Breech, Shell Guard, TZF 9b Optics ---
        "T_DunkelgelbCamo":    _build_dunkelgelb_camo_mat("T_DunkelgelbCamo", camo_strength=0.72, zimmerit_walls=True),
        "T_MantletCast":       _build_dunkelgelb_camo_mat("T_MantletCast", camo_strength=0.58, zimmerit_walls=False, cast_steel=True),
        "T_TurretHero131":     _build_dunkelgelb_camo_mat("T_TurretHero131", camo_strength=0.42, zimmerit_walls=False),
        "T_TrackSteel":        _build_track_steel_mat("T_TrackSteel", burnished_cleat=False),
        "T_TrackCleat":        _build_track_steel_mat("T_TrackCleat", burnished_cleat=True),
        "T_InteriorIvory":     _build_pbr_mat("T_InteriorIvory", (0.76, 0.74, 0.65), 0.66, 0.02, bevel_r=0.9, edge_wear=0.14),
        "T_KwK36Barrel":       _build_kwk36_barrel_mat(),
        "T_KruppBreech":       _build_pbr_mat("T_KruppBreech", (0.56, 0.59, 0.64), 0.24, 0.94, bevel_r=0.8, edge_wear=0.45, grain_bump=0.16),
        "T_ChromePiston":      _build_pbr_mat("T_ChromePiston", (0.82, 0.85, 0.89), 0.16, 0.97, bevel_r=0.5, edge_wear=0.22, grain_bump=0.08),
        "T_OrdnanceDark":      _build_pbr_mat("T_OrdnanceDark", (0.21, 0.23, 0.25), 0.36, 0.86, bevel_r=0.9, edge_wear=0.62, grain_bump=0.24),
        "T_BrassBasket":       _build_pbr_mat("T_BrassBasket", (0.78, 0.61, 0.26), 0.28, 0.90, bevel_r=0.6, edge_wear=0.30, grain_bump=0.14),
        # Deep obsidian-sapphire armored periscope glass (never cartoon sky-blue; triggers AR Fresnel!)
        "T_SapphireLens":      _build_pbr_mat("T_SapphireLens", (0.04, 0.14, 0.24), 0.06, 0.54, bevel_r=0.2, edge_wear=0.00, grain_bump=0.0),

        # --- SUITE 3 (2K): Maybach HL230 V12, Olvar Gearbox, Driveshaft, Basket, 88mm Ammo, Ready Round, Fuel Tanks, Crew ---
        "D_MaybachCast":       _build_pbr_mat("D_MaybachCast", (0.34, 0.37, 0.41), 0.38, 0.82, bevel_r=0.25, edge_wear=0.45),
        "D_AlumRadiator":      _build_pbr_mat("D_AlumRadiator", (0.75, 0.78, 0.82), 0.25, 0.94, bevel_r=0.18, edge_wear=0.24, aniso_stretch=(0.15, 2.2, 2.2)),
        "D_MaybachPlate":      _build_pbr_mat("D_MaybachPlate", (0.80, 0.78, 0.70), 0.24, 0.92, bevel_r=0.10, edge_wear=0.10),
        "D_ExhaustManif":      _build_pbr_mat("D_ExhaustManif", (0.62, 0.31, 0.16), 0.54, 0.54, bevel_r=0.20, edge_wear=0.28, edge_srgb=(0.78, 0.46, 0.26)),
        "D_GearboxSteel":      _build_pbr_mat("D_GearboxSteel", (0.48, 0.51, 0.56), 0.32, 0.88, bevel_r=0.22, edge_wear=0.42),
        "D_Driveshaft":        _build_pbr_mat("D_Driveshaft", (0.72, 0.75, 0.80), 0.20, 0.96, bevel_r=0.16, edge_wear=0.24),
        "D_BasketIvory":       _build_pbr_mat("D_BasketIvory", (0.76, 0.74, 0.67), 0.54, 0.06, bevel_r=0.24, edge_wear=0.22),
        "D_RedOxideTank":      _build_pbr_mat("D_RedOxideTank", (0.47, 0.24, 0.19), 0.56, 0.26, bevel_r=0.25, edge_wear=0.30),
        "D_Brass88mm":         _build_pbr_mat("D_Brass88mm", (0.88, 0.69, 0.25), 0.18, 0.96, bevel_r=0.12, edge_wear=0.16, edge_srgb=(0.96, 0.82, 0.44)),
        "D_CopperBand":        _build_pbr_mat("D_CopperBand", (0.85, 0.48, 0.24), 0.22, 0.95, bevel_r=0.10, edge_wear=0.14),
        "D_ApcbcBlack":        _build_pbr_mat("D_ApcbcBlack", (0.23, 0.24, 0.26), 0.34, 0.78, bevel_r=0.12, edge_wear=0.35, edge_srgb=(0.68, 0.70, 0.74)),
        "D_LeatherSeat":       _build_pbr_mat("D_LeatherSeat", (0.42, 0.25, 0.17), 0.62, 0.00, bevel_r=0.35, edge_wear=0.22, edge_srgb=(0.56, 0.36, 0.24)),
        "D_DashPanel":         _build_pbr_mat("D_DashPanel", (0.28, 0.30, 0.32), 0.42, 0.65, bevel_r=0.14, edge_wear=0.20),
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
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
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
        b = min(bevel, min(sx, sy, sz) * 0.22)
        if b > 1e-3:
            bmesh.ops.bevel(
                bm, geom=list(bm.edges), offset=b, segments=bevel_segs,
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
) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segs,
        radius1=r_bot, radius2=r_top, depth=length,
    )
    if bevel > 0.0:
        b = min(bevel, min(r_top, r_bot) * 0.25, length * 0.22)
        if b > 1e-3:
            cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-3]
            if cap_edges:
                bmesh.ops.bevel(
                    bm, geom=cap_edges, offset=b, segments=2,
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


def mk_hollow_tube_axis(
    name: str, r_out: float, r_in: float, p0: float, p1: float,
    axis: str = "x", segs: int = 36, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.32, (p1 - p0) * 0.22)
    if b > 1e-3:
        prof = [
            (r_out - b, p0), (r_out, p0 + b), (r_out, p1 - b), (r_out - b, p1),
            (r_in + b, p1), (r_in, p1 - b), (r_in, p0 + b), (r_in + b, p0),
        ]
    else:
        prof = [(r_out, p0), (r_out, p1), (r_in, p1), (r_in, p0)]

    rings = []
    for r, p in prof:
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            if axis == "x":
                ring.append(bm.verts.new((p, r * math.cos(th), r * math.sin(th))))
            elif axis == "y":
                ring.append(bm.verts.new((r * math.cos(th), p, r * math.sin(th))))
            else:
                ring.append(bm.verts.new((r * math.cos(th), r * math.sin(th), p)))
        rings.append(ring)

    n = len(rings)
    for k in range(n):
        a = rings[k]
        b_r = rings[(k + 1) % n]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((a[s], a[sn], b_r[sn], b_r[s]))

    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_2d_xz(
    name: str,
    outer_pts: list[tuple[float, float]],
    inner_pts: list[tuple[float, float]] | None,
    y0: float, y1: float,
    mat_outer: bpy.types.Material,
    mat_inner: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Strictly watertight vertical extrusion between y0..y1 in Three.js XZ plane (outer CCW, optional inner ring)."""
    bm = bmesh.new()
    n = len(outer_pts)
    if inner_pts is None:
        bot = [bm.verts.new((x, y0, z)) for (x, z) in outer_pts]
        top = [bm.verts.new((x, y1, z)) for (x, z) in outer_pts]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((bot[i], bot[ni], top[ni], top[i]))
        _apply_three_xform(bm, [])
        return _bm_to_obj(name, bm, mat_outer)

    assert len(inner_pts) == n
    ob = [bm.verts.new((x, y0, z)) for (x, z) in outer_pts]
    ot = [bm.verts.new((x, y1, z)) for (x, z) in outer_pts]
    ib = [bm.verts.new((x, y0, z)) for (x, z) in inner_pts]
    it = [bm.verts.new((x, y1, z)) for (x, z) in inner_pts]

    for i in range(n):
        ni = (i + 1) % n
        # Outer wall (mat 0)
        f_out = bm.faces.new((ob[i], ob[ni], ot[ni], ot[i]))
        f_out.material_index = 0
        # Inner wall (mat 1 if provided!)
        f_in = bm.faces.new((ib[ni], ib[i], it[i], it[ni]))
        f_in.material_index = 1 if mat_inner is not None else 0
        # Top & bottom rims (mat 0)
        f_top = bm.faces.new((ot[i], ot[ni], it[ni], it[i]))
        f_top.material_index = 0
        f_bot = bm.faces.new((ib[i], ib[ni], ob[ni], ob[i]))
        f_bot.material_index = 0

    _apply_three_xform(bm, [])
    obj = _bm_to_obj(name, bm, mat_outer)
    if mat_inner is not None:
        obj.data.materials.append(mat_inner)
    return obj


def bool_op(target: bpy.types.Object, cutter: bpy.types.Object, op: str = "DIFFERENCE", delete_cutter: bool = True):
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
    for i in range(len(target.data.materials) - 1, -1, -1):
        if target.data.materials[i] is None:
            target.data.materials.pop(index=i)


def join_parts(name: str, objs: list[bpy.types.Object], smooth_angle_deg: float = 36.0) -> bpy.types.Object:
    if len(objs) == 1:
        root = objs[0]
        root.name = name
    else:
        select_only(objs, objs[0])
        bpy.ops.object.join()
        root = bpy.context.active_object
        root.name = name
    root.data.name = name

    for i in range(len(root.data.materials) - 1, -1, -1):
        if root.data.materials[i] is None:
            root.data.materials.pop(index=i)

    angle_rad = math.radians(smooth_angle_deg)
    bm = bmesh.new()
    bm.from_mesh(root.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
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

    select_only([root], root)
    wn = root.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 50
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    return root


# =============================================================================
# SUITE 1 BUILDERS (8 Solid Parts: Hull, Fenders, Interleaved Wheels, Articulated
#                   725mm Kgs 63 Tracks L/R, Engine Deck, Torsion Bars, Turret Ring)
# =============================================================================
def _mk_curved_arc_strip(
    name: str,
    r_out: float, r_in: float,
    y0: float, y1: float,
    a0: float, a1: float,
    segs: int,
    cx: float, cz: float,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    """Strictly watertight vertical curved half-cylinder / arc sheet-metal band in Three.js XZ plane."""
    bm = bmesh.new()
    ob, ot, ib, it = [], [], [], []
    for k in range(segs + 1):
        a = a0 + (a1 - a0) * (k / segs)
        ca, sa = math.cos(a), math.sin(a)
        ob.append(bm.verts.new((cx + r_out * ca, y0, cz + r_out * sa)))
        ot.append(bm.verts.new((cx + r_out * ca, y1, cz + r_out * sa)))
        ib.append(bm.verts.new((cx + r_in * ca, y0, cz + r_in * sa)))
        it.append(bm.verts.new((cx + r_in * ca, y1, cz + r_in * sa)))
    for k in range(segs):
        bm.faces.new((ob[k], ob[k + 1], ot[k + 1], ot[k]))
        bm.faces.new((ib[k + 1], ib[k], it[k], it[k + 1]))
        bm.faces.new((ot[k], ot[k + 1], it[k + 1], it[k]))
        bm.faces.new((ib[k], ib[k + 1], ob[k + 1], ob[k]))
    # End caps at k=0 and k=segs
    bm.faces.new((ib[0], ob[0], ot[0], it[0]))
    bm.faces.new((ob[segs], ib[segs], it[segs], ot[segs]))
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def build_tiger_hull_box(mats) -> bpy.types.Object:
    parts = []
    camo = mats["H_DunkelgelbCamo"]
    rear_camo = mats["H_RearTransomCamo"]
    hero = mats["H_HeroFlank"]
    ivory = mats["H_InteriorIvory"]
    oxide = mats["H_RedOxideFloor"]
    gun = mats["H_GunMetal"]
    trk = mats["H_TrackSteel"]
    cleat = mats["H_TrackCleat"]
    wood = mats["H_WoodTool"]
    rub = mats["H_RubberTire"]

    # Bottom belly armor plate (red-oxide inner floor, Y in [-73, -67])
    parts.append(mk_box("hb_belly", 566, 6, 208, [("t", -19, -70, 0)], oxide, bevel=0.5))

    # Lower hull side walls, sponson shelves & true 10cm vertical upper hull flanks
    for sz in (-1, 1):
        parts.append(mk_box(f"hb_low_{sz}", 580, 51, 8, [("t", -12, -41.5, sz * 100)], camo, bevel=0.6))
        parts.append(mk_box(f"hb_shelf_{sz}", 592, 6, 58, [("t", -10, -15, sz * 133)], camo, bevel=0.5))
        # Outer 82mm vertical hull flank (outer face carries Hero Balkenkreuz + Zimmerit!)
        parts.append(mk_box(f"hb_up_out_{sz}", 596, 63.8, 7, [("t", -8, 19.9, sz * 158.45)], camo, bevel=0.8))
        # Inner Elfenbein ivory lining plate STRICTLY inside fighting bay (X in [-105, +199] — ZERO exterior nose leak!)
        parts.append(mk_box(f"hb_up_in_{sz}", 304, 56, 3, [("t", 47, 19, sz * 153.2)], ivory, bevel=0.3))
        # Flush Hero UV flank panel for crisp 4K Balkenkreuz + s.Pz.Abt. 504 stencil + Zimmerit!
        # X in [+15, +195] (180 cm), Y in [-7, +47] (54 cm), outer face at |Z| = 162.08 (0.13 cm proud, zero z-fight!)
        parts.append(mk_box(f"hb_hero_{sz}", 180, 54, 1.2, [("t", 105, 20, sz * 161.48)], hero))
        # Iconic Krupp interlocking finger-joint dovetail armor welds along front & rear hull corners + S-mine dischargers!
        for wy in (-2, 10, 22, 34, 46):
            parts.append(mk_box(f"hb_weld_f_{sz}_{wy}", 6.5, 6.2, 3.8, [("t", 209, wy, sz * 160.2)], camo, bevel=0.4))
            parts.append(mk_box(f"hb_weld_r_{sz}_{wy}", 6.5, 6.2, 3.8, [("t", -303, wy, sz * 160.2)], rear_camo, bevel=0.4))
        # Hull corner S-Mine (Minenabwurfvorrichtung) anti-infantry launcher tubes
        parts.append(mk_cyl(f"hb_smine_f_{sz}", 3.2, 3.2, 10.0, "y", 16, [("rx", sz * 0.22), ("t", 196, 46.2, sz * 158.0)], gun, bevel=0.35))
        parts.append(mk_cyl(f"hb_smine_r_{sz}", 3.2, 3.2, 10.0, "y", 16, [("rx", sz * 0.22), ("t", -286, 46.2, sz * 158.0)], gun, bevel=0.35))
        # Heavy braided steel tow cable stowed lengthwise along side hull roof + eye thimbles + deck clamps
        parts.append(mk_cyl(f"hb_cable_{sz}", 2.0, 2.0, 210.0, "x", 14, [("t", 20, 52.0, sz * 144.0)], trk, bevel=0.25))
        parts.append(mk_hollow_tube_axis(f"hb_ceye_f_{sz}", 4.6, 2.4, 51.0, 53.2, "y", 16, bevel=0.2, xform=[("t", 128, 0, sz * 144.0)], mat=cleat))
        parts.append(mk_hollow_tube_axis(f"hb_ceye_r_{sz}", 4.6, 2.4, 51.0, 53.2, "y", 16, bevel=0.2, xform=[("t", -88, 0, sz * 144.0)], mat=cleat))
        for cx in (-45, 25, 92):
            parts.append(mk_box(f"hb_cclmp_{sz}_{cx}", 4.2, 3.2, 6.0, [("t", cx, 52.0, sz * 144.0)], gun, bevel=0.2))

    # Row of 5 sculpted spare Kgs 63 cast-steel track links + retaining bar bolted across upper glacis nose!
    parts.append(mk_box("hb_spare_bar", 4.6, 3.6, 200.0, [("rz", -0.245), ("t", 268, 2.8, 0)], gun, bevel=0.35))
    for st_i, st_z in enumerate((-76.0, -38.0, 0.0, 38.0, 76.0)):
        parts.append(mk_box(f"hb_sp_trk_{st_i}", 26.0, 4.2, 32.0, [("rz", -0.245), ("t", 268, 0.2, st_z)], trk, bevel=0.45))
        # Twin burnished Kgs 63 traction cleats + side pin ends
        parts.append(mk_box(f"hb_sp_grA_{st_i}", 3.8, 2.2, 30.5, [("rz", -0.245), ("t", 262, 3.8, st_z)], cleat, bevel=0.2))
        parts.append(mk_box(f"hb_sp_grB_{st_i}", 3.8, 2.2, 30.5, [("rz", -0.245), ("t", 274, 0.8, st_z)], cleat, bevel=0.2))
        parts.append(mk_cyl(f"hb_sp_pin_{st_i}", 1.5, 1.5, 34.5, "z", 10, [("rz", -0.245), ("t", 256, 3.2, st_z)], cleat, bevel=0.15))

    # Front lower glacis nose beak (X=+260,Y=-73 up to X=+316,Y=-20)
    parts.append(mk_box("hb_low_glacis", 74, 10, 207.6, [("rz", 0.74), ("t", 285, -43.5, 0)], camo, bevel=0.6))
    # Sloped upper glacis deck above Olvar transmission
    parts.append(mk_box("hb_up_glacis", 112, 10, 321.6, [("rz", -0.245), ("t", 259, -6, 0)], camo, bevel=0.6))
    # Iconic 100mm Vertical Driver's Front Superstructure Plate + Ivory inner lining + Front Hero "131" band!
    parts.append(mk_box("hb_front_plate", 10, 43.8, 323.6, [("t", 206.9, 29.9, 0)], camo, bevel=0.7))
    parts.append(mk_box("hb_front_in", 2.5, 38, 302, [("t", 200.5, 29, 0)], ivory, bevel=0.2))
    parts.append(mk_box("hb_front_hero", 1.2, 36, 76, [("t", 211.48, 30, 0)], hero))

    # Driver's Fahrersehklappe 50 armored visor slit & brow hood (left, Z = -58)
    parts.append(mk_box("hb_visor_hood", 12, 14, 34, [("t", 215, 31, -58)], camo, bevel=0.6))
    parts.append(mk_box("hb_visor_slit", 4, 3.2, 24, [("t", 220, 30, -58)], gun, bevel=0.2))
    # Kugelblende 80 hemispherical ball-mount hull MG 34 (right, Z = +58)
    parts.append(mk_cyl("hb_mg_ball", 9.5, 11.2, 12, "x", 24, [("t", 216, 30, 58)], gun, bevel=0.5))
    parts.append(mk_cyl("hb_mg_sleeve", 3.2, 3.8, 12, "x", 18, [("t", 224, 30, 58)], gun, bevel=0.3))
    parts.append(mk_cyl("hb_mg_barrel", 1.7, 2.0, 22, "x", 16, [("t", 236, 30, 58)], gun, bevel=0.2))

    # Rear 82mm hull armored plate (w/ twin Maybach HL230 exhaust soot plumes!) & Elfenbein internal engine firewall
    parts.append(mk_box("hb_rear_plate", 10, 120, 324, [("t", -301, -8, 0)], rear_camo, bevel=0.7))
    parts.append(mk_box("hb_firewall", 6, 104, 200, [("t", -108, -14, 0)], ivory, bevel=0.4))

    # -------------------------------------------------------------------------
    # PLAN C — REAR TRANSOM BOSCH 20-TON SCREW JACK + WOODEN JACK BLOCK (X >= -316.0!)
    # -------------------------------------------------------------------------
    # 1. Bosch 20-ton heavy mechanical screw jack (Wagenheber) mounted horizontally lower-right rear transom
    parts.append(mk_cyl("hb_jack_body", 4.1, 4.1, 48.0, "z", 20, [("t", -311.0, -37.0, 52.0)], gun, bevel=0.35))
    for jz in (34.0, 46.0, 58.0, 70.0):
        parts.append(mk_cyl(f"hb_jack_rib_{jz}", 4.5, 4.5, 1.8, "z", 16, [("t", -311.0, -37.0, jz)], trk, bevel=0.15))
    parts.append(mk_box("hb_jack_foot", 7.8, 13.5, 3.8, [("t", -311.0, -37.0, 26.5)], trk, bevel=0.3))
    parts.append(mk_box("hb_jack_head", 8.2, 11.5, 10.5, [("t", -311.0, -36.0, 81.0)], gun, bevel=0.4))
    parts.append(mk_box("hb_jack_claw", 5.2, 6.2, 11.0, [("t", -312.4, -42.5, 44.0)], cleat, bevel=0.25))
    parts.append(mk_cyl("hb_jack_crk", 1.1, 1.1, 16.0, "y", 10, [("t", -313.8, -28.0, 84.5)], cleat, bevel=0.1))
    parts.append(mk_cyl("hb_jack_hdl", 1.3, 1.3, 8.5, "z", 10, [("t", -313.8, -21.0, 88.0)], gun, bevel=0.15))
    for jcz in (38.0, 68.0):
        parts.append(mk_box(f"hb_jack_clmp_{jcz}", 9.2, 10.5, 3.2, [("t", -309.8, -37.0, jcz)], camo, bevel=0.25))

    # 2. Steel-bound oak wooden jack block (Unterlegklotz) mounted in cradle on lower-left rear transom
    parts.append(mk_box("hb_jblk_wood", 8.2, 14.8, 38.0, [("t", -310.8, -37.0, -80.0)], wood, bevel=0.45))
    for bsz in (-96.5, -63.5):
        parts.append(mk_box(f"hb_jblk_bnd_{bsz}", 8.8, 15.4, 3.4, [("t", -310.8, -37.0, bsz)], gun, bevel=0.2))
    parts.append(mk_box("hb_jblk_crdl", 9.0, 3.0, 42.0, [("t", -310.4, -45.2, -80.0)], camo, bevel=0.25))
    parts.append(mk_cyl("hb_jblk_hdl", 1.0, 1.0, 16.0, "z", 10, [("t", -315.2, -37.0, -80.0)], cleat, bevel=0.1))

    # 3. Rear Notek convoy taillight (Abstandsrücklicht) on upper-left rear transom
    parts.append(mk_box("hb_notek_r", 6.2, 7.2, 12.0, [("t", -309.5, 35.0, -134.0)], gun, bevel=0.35))

    # Hollow Hull Roof Deck (open turret ring & open engine bay cutout!)
    parts.append(mk_box("hb_roof_fwd", 93.6, 5.8, 323.2, [("t", 163, 49.0, 0)], camo, bevel=0.5))
    for sz in (-1, 1):
        parts.append(mk_box(f"hb_roof_side_{sz}", 227.6, 5.8, 65.6, [("t", 2, 49.0, sz * 128.8)], camo, bevel=0.5))
        # Driver & Radio-Operator circular roof hatch collars + grab handles
        parts.append(mk_cyl(f"hb_crew_hatch_{sz}", 22, 23, 2.8, "y", 24, [("t", 164, 51.0, sz * 58)], camo, bevel=0.4))
        parts.append(mk_box(f"hb_crew_hnd_{sz}", 3.0, 2.2, 12.0, [("t", 174, 52.8, sz * 58)], gun, bevel=0.2))
        # Forward Bosch blackout headlights on upper glacis
        parts.append(mk_cyl(f"hb_lamp_{sz}", 6.5, 6.5, 12, "x", 20, [("t", 238, 12, sz * 120)], camo, bevel=0.5))
        parts.append(mk_box(f"hb_lamp_slit_{sz}", 1.5, 3.0, 8.5, [("t", 244, 12, sz * 120)], gun, bevel=0.2))
        # Heavy forged front tow shackles + SPARE FORGED RECOVERY C-HOOKS (Abschlepphaken, exact X <= +316.0!)
        parts.append(mk_box(f"hb_shackle_f_{sz}", 14, 14, 8, [("t", 309, -22, sz * 96)], trk, bevel=0.5))
        parts.append(mk_cyl(f"hb_shpin_f_{sz}", 3.2, 3.2, 13.5, "z", 14, [("t", 312, -22, sz * 96)], cleat, bevel=0.3))
        # Sculpted C-hook slung cleanly from front tow pin (X in [302, 316.0], Y in [-36, -15])
        parts.append(mk_box(f"hb_chook_sp_{sz}", 4.6, 17.0, 5.8, [("t", 313.5, -26.5, sz * 96)], cleat, bevel=0.4))
        parts.append(mk_box(f"hb_chook_up_{sz}", 11.0, 4.4, 5.4, [("t", 309.0, -17.5, sz * 96)], cleat, bevel=0.35))
        parts.append(mk_box(f"hb_chook_lo_{sz}", 12.0, 4.6, 5.4, [("t", 308.5, -34.0, sz * 96)], cleat, bevel=0.35))

    # -------------------------------------------------------------------------
    # PLAN C — PIONEER TOOLS CLAMPED ON HULL ROOF + REAR RADIO ANTENNA BASE (Y <= 55.4!)
    # -------------------------------------------------------------------------
    # 1. Wehrmacht Entrenching Spade (Spaten) clamped on front-left hull roof
    parts.append(mk_cyl("hb_spade_sh", 1.5, 1.5, 62.0, "x", 12, [("t", 148, 53.0, -124)], wood, bevel=0.15))
    parts.append(mk_box("hb_spade_hd", 22.0, 1.6, 15.5, [("t", 188, 52.8, -124)], gun, bevel=0.25))
    parts.append(mk_box("hb_spade_dp", 8.5, 2.2, 9.0, [("t", 115, 53.0, -124)], gun, bevel=0.25))
    for scx in (132, 168):
        parts.append(mk_box(f"hb_spade_cl_{scx}", 3.2, 3.0, 5.2, [("t", scx, 52.9, -124)], camo, bevel=0.15))

    # 2. Heavy Pioneer Axe (Beil) clamped on front-right hull roof
    parts.append(mk_cyl("hb_axe_sh", 1.5, 1.5, 58.0, "x", 12, [("t", 150, 53.0, 124)], wood, bevel=0.15))
    parts.append(mk_box("hb_axe_hd", 10.5, 3.2, 16.5, [("t", 181, 53.2, 120)], gun, bevel=0.35))
    parts.append(mk_box("hb_axe_cl", 3.4, 3.2, 5.4, [("t", 140, 52.9, 124)], camo, bevel=0.15))

    # 3. Heavy Wire Cutters (Drahtschere) clamped on front-center left hull roof
    parts.append(mk_cyl("hb_cut_h1", 1.3, 1.3, 44.0, "x", 10, [("ry", 0.06), ("t", 148, 52.8, -16.5)], rub, bevel=0.12))
    parts.append(mk_cyl("hb_cut_h2", 1.3, 1.3, 44.0, "x", 10, [("ry", -0.06), ("t", 148, 52.8, -11.5)], rub, bevel=0.12))
    parts.append(mk_box("hb_cut_jw", 14.0, 2.2, 7.2, [("t", 176, 52.8, -14.0)], gun, bevel=0.25))
    parts.append(mk_box("hb_cut_cl", 3.2, 2.8, 9.0, [("t", 156, 52.8, -14.0)], camo, bevel=0.15))

    # 4. Forged Steel Crowbar (Brechstange) clamped on front-center right hull roof
    parts.append(mk_cyl("hb_crow_sh", 1.25, 1.25, 68.0, "x", 8, [("t", 156, 52.7, 14.0)], cleat, bevel=0.1))
    parts.append(mk_box("hb_crow_tip", 8.5, 2.6, 3.4, [("rz", 0.25), ("t", 192, 53.2, 14.0)], cleat, bevel=0.2))
    parts.append(mk_box("hb_crow_cl", 3.2, 2.6, 4.6, [("t", 156, 52.7, 14.0)], camo, bevel=0.15))

    # 5. Heavy Sledgehammer (Vorschlaghammer) on rear-left sponson roof
    parts.append(mk_cyl("hb_sldg_sh", 1.5, 1.5, 56.0, "x", 12, [("t", -54, 53.0, -124)], wood, bevel=0.15))
    parts.append(mk_box("hb_sldg_hd", 8.5, 5.2, 15.0, [("t", -25, 53.3, -124)], gun, bevel=0.45))

    # 6. Gun-barrel cleaning rod bundle on rear-right sponson roof
    for ri, rz_off in enumerate((-2.2, 0.0, 2.2)):
        parts.append(mk_cyl(f"hb_crod_{ri}", 0.9, 0.9, 76.0, "x", 8, [("t", -46, 52.6, 124.0 + rz_off)], gun, bevel=0.08))
    for rcx in (-72, -20):
        parts.append(mk_box(f"hb_crod_cl_{rcx}", 3.0, 2.6, 7.6, [("t", rcx, 52.6, 124.0)], camo, bevel=0.15))

    # 7. Subtle Rear Radio Antenna Base (armored guard pot + ribbed insulator stub + folded stowage trough!)
    parts.append(mk_cyl("hb_ant_cup", 4.0, 4.4, 3.6, "y", 18, [("t", -98, 53.4, 148)], camo, bevel=0.35))
    parts.append(mk_cyl("hb_ant_ins", 2.2, 2.6, 2.2, "y", 14, [("t", -98, 54.4, 148)], rub, bevel=0.15))
    parts.append(mk_box("hb_ant_trgh", 178.0, 2.6, 4.0, [("t", -192, 52.8, 152)], wood, bevel=0.2))
    parts.append(mk_cyl("hb_ant_rod", 0.75, 0.55, 174.0, "x", 8, [("t", -192, 53.4, 152)], cleat, bevel=0.06))

    parts.append(mk_box("hb_roof_rear_beam", 32, 6, 192, [("t", -96, 49, 0)], camo, bevel=0.5))
    # Rear heavy tow pintle (reaches exact X = -316.0!)
    parts.append(mk_box("hb_pintle_r", 14, 14, 22, [("t", -309, -24, 0)], trk, bevel=0.5))

    return join_parts("tiger_hull_box", parts, smooth_angle_deg=35.0)


def build_tiger_side_fenders(mats) -> bpy.types.Object:
    parts = []
    camo = mats["H_DunkelgelbCamo"]
    gun = mats["H_GunMetal"]
    for sz in (-1, 1):
        for i in range(5):
            x_c = -236 + i * 118
            parts.append(mk_box(f"sf_top_{sz}_{i}", 114, 3.8, 16, [("t", x_c, -2, sz * 170)], camo, bevel=0.3))
            parts.append(mk_box(f"sf_lip_{sz}_{i}", 114, 14, 2.8, [("t", x_c, -8, sz * 176.6)], camo, bevel=0.25))
            # Stamped hinge barrel along inner edge
            parts.append(mk_cyl(f"sf_hinge_{sz}_{i}", 1.8, 1.8, 18, "x", 12, [("t", x_c, -0.5, sz * 162.5)], gun, bevel=0.2))
        # Iconic angled front & rear armored mudflaps
        parts.append(mk_box(f"sf_front_{sz}", 38, 18, 72, [("t", 287, -2, sz * 141)], camo, bevel=0.4))
        parts.append(mk_box(f"sf_rear_{sz}", 26, 16, 70, [("t", -293, -3, sz * 141)], camo, bevel=0.4))
    return join_parts("tiger_side_fenders", parts, smooth_angle_deg=36.0)


def build_tiger_interleaved_wheels(mats) -> bpy.types.Object:
    parts = []
    w_camo = mats["H_WheelDunkelgelb"]
    rubber = mats["H_RubberTire"]
    trk = mats["H_TrackSteel"]
    cleat = mats["H_TrackCleat"]
    grease = mats["H_GreaseHub"]
    gun = mats["H_GunMetal"]

    for sz in (-1, 1):
        # 1. Massive Front 20-Tooth Drive Sprockets (X=+262, Y_local=+28 -> world Y=-48)
        for z_ring in (162.0, 119.0):
            parts.append(mk_cyl(f"sp_ring_{sz}_{z_ring}", 37.5, 37.5, 9.5, "z", 36, [("t", 262, 28, sz * z_ring)], w_camo, bevel=0.6))
            # 20 authentic burnished cold cast-steel involute sprocket drive teeth (R~0.26, M~0.92)!
            for ti in range(20):
                ang = (ti / 20.0) * math.tau
                parts.append(mk_box(
                    f"sp_t_{sz}_{z_ring}_{ti}", 4.6, 5.2, 6.2,
                    [("t", 0, 39.2, 0), ("rz", ang), ("t", 262, 28, sz * z_ring)],
                    cleat, bevel=0.3,
                ))
        parts.append(mk_cyl(f"sp_hub_{sz}", 22, 24, 54, "z", 28, [("t", 262, 28, sz * 136)], trk, bevel=0.6))
        parts.append(mk_cyl(f"sp_cap_{sz}", 14, 17, 10, "z", 20, [("t", 262, 28, sz * 165)], grease, bevel=0.4))

        # 2. Twin-Rim Rear Tensioning Idler Wheels (X=-278, Y_local=+24 -> world Y=-52)
        for z_id in (154.0, 126.0):
            parts.append(mk_cyl(f"id_rim_{sz}_{z_id}", 32.0, 32.0, 10.5, "z", 32, [("t", -278, 24, sz * z_id)], w_camo, bevel=0.6))
            parts.append(mk_cyl(f"id_dish_{sz}_{z_id}", 25.0, 25.0, 11.4, "z", 24, [("t", -278, 24, sz * z_id)], trk, bevel=0.4))
        parts.append(mk_cyl(f"id_hub_{sz}", 15, 15, 42, "z", 20, [("t", -278, 24, sz * 136)], grease, bevel=0.5))

        # 3. THE ENGINEERING LEGEND: 3-Row Overlapping Interleaved Road Wheels (Schachtellaufwerk!)
        # Dusty Tunisian ochre recesses (R~0.95) + wet dark bearing-grease hubcap weeping (R~0.22)!
        for i, wx in enumerate(WHEEL_X_STATIONS):
            is_outer = (i % 2 == 1)
            z_rows = (162.5, 114.5) if is_outer else (148.5, 128.5)
            for zr in z_rows:
                # Vulcanized matte-charcoal outer rubber rim (R = 40.0 cm, smooth 36-seg!)
                parts.append(mk_cyl(f"rw_rub_{sz}_{i}_{zr}", 40.0, 40.0, 10.8, "z", 36, [("t", wx, 0, sz * zr)], rubber, bevel=0.65))
                # Weathered Dunkelgelb dished steel wheel disc (R = 33.2 cm)
                parts.append(mk_cyl(f"rw_disc_{sz}_{i}_{zr}", 33.2, 33.2, 11.8, "z", 32, [("t", wx, 0, sz * zr)], w_camo, bevel=0.55))
                # Recessed inner dish rim ring
                parts.append(mk_cyl(f"rw_inner_{sz}_{i}_{zr}", 23.0, 25.0, 12.6, "z", 24, [("t", wx, 0, sz * zr)], w_camo, bevel=0.4))
            # Outer-facing wheel ring of 8 heavy radial rim bolts + glossy oiled center grease hub cap
            z_face = sz * (168.8 if is_outer else 154.8)
            for bi in range(8):
                ang = (bi / 8.0) * math.tau
                parts.append(mk_cyl(
                    f"rw_b_{sz}_{i}_{bi}", 1.7, 1.7, 2.2, "z", 8,
                    [("t", wx + math.cos(ang) * 28.5, math.sin(ang) * 28.5, z_face)],
                    gun,
                ))
            parts.append(mk_cyl(
                f"rw_hub_{sz}_{i}", 9.5, 10.8, 62 if is_outer else 44, "z", 18,
                [("t", wx, 0, sz * (139.0 if is_outer else 138.5))],
                grease, bevel=0.5,
            ))

    return join_parts("tiger_interleaved_wheels", parts, smooth_angle_deg=36.0)


def _sample_tiger_track_centerline() -> list[tuple[float, float]]:
    """Computes a smooth closed CCW centerline loop in Three.js track-local XY coordinates:
    - Exact flat bottom ground run at y = -54.80 (outer grouser peaks at Y_min = -57.00 == world Y = -120.00 cm!)
    - Tight wrap around 20-tooth front drive sprocket (262, +15, R=41.85)
    - Authentic heavy WWII Tiger I upper-run catenary sag resting directly across the tops of all
      8 interleaved 800mm road wheels (y_inner = +27.2 on wheel crowns, dipping 3.6 cm between wheels!)
    - Tight wrap around twin-rim rear idler (-278, +11, R=33.85)."""
    pts: list[tuple[float, float]] = []

    # 1. Bottom ground run: (-212, -54.80) -> (+194, -54.80)
    for k in range(41):
        u = k / 40.0
        pts.append((-212.0 + 406.0 * u, -54.80))

    # 2. Wheel #8 lower exit curve around (194, -13, R=41.80) from -90 deg to front tangent angle
    sx, sy, r_sp = 262.0, 15.0, 41.85
    r_w8 = 41.80
    dx_f, dy_f = sx - 194.0, sy - (-13.0)
    ang_f_tan = math.atan2(dy_f, dx_f) - math.pi * 0.5  # ~ -67.62 deg
    for k in range(1, 9):
        th = -math.pi * 0.5 + (ang_f_tan - (-math.pi * 0.5)) * (k / 8.0)
        pts.append((194.0 + r_w8 * math.cos(th), -13.0 + r_w8 * math.sin(th)))

    # 3. Straight front lower slope up to front drive sprocket tangent
    p_fs0 = (194.0 + r_w8 * math.cos(ang_f_tan), -13.0 + r_w8 * math.sin(ang_f_tan))
    p_fs1 = (sx + r_sp * math.cos(ang_f_tan), sy + r_sp * math.sin(ang_f_tan))
    for k in range(1, 13):
        u = k / 12.0
        pts.append((p_fs0[0] + (p_fs1[0] - p_fs0[0]) * u, p_fs0[1] + (p_fs1[1] - p_fs0[1]) * u))

    # 4. Front drive sprocket wrap arc from ang_f_tan through 0 & +90 deg to +118 deg
    ang_f_top = math.radians(118.0)
    for k in range(1, 33):
        th = ang_f_tan + (ang_f_top - ang_f_tan) * (k / 32.0)
        pts.append((sx + r_sp * math.cos(th), sy + r_sp * math.sin(th)))

    # 5. Upper front heavy catenary drop from sprocket top down onto Wheel #8 top (194, +28.95)
    p_uf0 = (sx + r_sp * math.cos(ang_f_top), sy + r_sp * math.sin(ang_f_top))
    p_uf1 = (194.0, 28.95)
    for k in range(1, 17):
        u = k / 16.0
        x = p_uf0[0] + (p_uf1[0] - p_uf0[0]) * u
        y = p_uf0[1] + (p_uf1[1] - p_uf0[1]) * u - 2.6 * (math.sin(math.pi * u) ** 1.4)
        pts.append((x, y))

    # 6. Heavy WWII Tiger I upper-run multi-arch catenary sag resting across all 8 road wheels!
    #    Wheel crowns at Y_inner = +27.20 (wheel top = +27.00), dipping 3.6 cm between every wheel pair!
    wx_rev = list(reversed(WHEEL_X_STATIONS))  # +194 -> -212
    for span_i in range(len(wx_rev) - 1):
        xa, xb = wx_rev[span_i], wx_rev[span_i + 1]
        for k in range(1, 13):
            u = k / 12.0
            x = xa + (xb - xa) * u
            sag = 3.6 * 0.5 * (1.0 - math.cos(math.tau * u))
            pts.append((x, 28.95 - sag))

    # 7. Upper rear heavy catenary rise from Wheel #1 (-212, 28.95) onto Rear Idler (-278, +11, R=33.85)
    ix, iy, r_id = -278.0, 11.0, 33.85
    ang_r_top = math.radians(74.0)
    p_ur0 = (-212.0, 28.95)
    p_ur1 = (ix + r_id * math.cos(ang_r_top), iy + r_id * math.sin(ang_r_top))
    for k in range(1, 17):
        u = k / 16.0
        x = p_ur0[0] + (p_ur1[0] - p_ur0[0]) * u
        y = p_ur0[1] + (p_ur1[1] - p_ur0[1]) * u - 2.8 * (math.sin(math.pi * u) ** 1.4)
        pts.append((x, y))

    # 8. Rear idler wrap arc from +74 deg through 180 deg down to bottom-rear external tangent
    dx_r, dy_r = (-212.0) - ix, (-13.0) - iy
    dist_r = math.hypot(dx_r, dy_r)
    ang_r_bot = math.atan2(dy_r, dx_r) - math.pi * 0.5 - math.asin((r_w8 - r_id) / dist_r) + math.tau  # ~ 243.5 deg
    for k in range(1, 29):
        th = ang_r_top + (ang_r_bot - ang_r_top) * (k / 28.0)
        pts.append((ix + r_id * math.cos(th), iy + r_id * math.sin(th)))

    # 9. Straight rear lower slope down to Wheel #1 lower tangent
    p_rs0 = (ix + r_id * math.cos(ang_r_bot), iy + r_id * math.sin(ang_r_bot))
    p_rs1 = (-212.0 + r_w8 * math.cos(ang_r_bot), -13.0 + r_w8 * math.sin(ang_r_bot))
    for k in range(1, 13):
        u = k / 12.0
        pts.append((p_rs0[0] + (p_rs1[0] - p_rs0[0]) * u, p_rs0[1] + (p_rs1[1] - p_rs0[1]) * u))

    # 10. Wheel #1 lower entry curve back into (-212, -54.80)
    ang_end = 1.5 * math.pi  # 270 deg
    for k in range(1, 8):
        th = ang_r_bot + (ang_end - ang_r_bot) * (k / 8.0)
        pts.append((-212.0 + r_w8 * math.cos(th), -13.0 + r_w8 * math.sin(th)))

    return pts


def _add_prism_snz(
    bm: bmesh.types.BMesh,
    poly_sn: list[tuple[float, float]],
    z0: float, z1: float,
    cx: float, cy: float, tx: float, ty: float, nx: float, ny: float,
    mat_idx: int,
):
    """Appends one strictly watertight closed prism extruded along Z in local (s, n, z) track-link coordinates."""
    n_pts = len(poly_sn)
    v_lo = []
    v_hi = []
    for (s, n) in poly_sn:
        px = cx + s * tx + n * nx
        py = cy + s * ty + n * ny
        v_lo.append(bm.verts.new(t2b(px, py, z0)))
        v_hi.append(bm.verts.new(t2b(px, py, z1)))
    f0 = bm.faces.new(list(reversed(v_lo)))
    f0.material_index = mat_idx
    f1 = bm.faces.new(v_hi)
    f1.material_index = mat_idx
    for i in range(n_pts):
        ni = (i + 1) % n_pts
        fs = bm.faces.new((v_lo[i], v_lo[ni], v_hi[ni], v_hi[i]))
        fs.material_index = mat_idx


def build_tiger_track_belt(name: str, mats) -> bpy.types.Object:
    """Builds a museum-flagship closed loop of 96 individual sculpted 725mm Kgs 63/725/130 cast-steel
    battle track links w/ notched full-width burnished grouser cleats, twin central tapered guide horns,
    side track-pin ends, end-connector lugs, exact world Y_min = -120.00 cm ground contact & heavy upper
    catenary sag resting directly across all 8 interleaved road wheels (~14.6k tris, strictly manifold!)."""
    trk_mat = mats["H_TrackSteel"]
    cleat_mat = mats["H_TrackCleat"]

    poly = _sample_tiger_track_centerline()
    n_poly = len(poly)
    cum = [0.0]
    for i in range(n_poly):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n_poly]
        cum.append(cum[-1] + math.hypot(x1 - x0, y1 - y0))
    total_len = cum[-1]

    def sample_at(dist: float) -> tuple[float, float, float, float]:
        d = dist % total_len
        lo, hi = 0, n_poly - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if cum[mid] <= d:
                lo = mid
            else:
                hi = mid - 1
        seg_len = max(cum[lo + 1] - cum[lo], 1e-6)
        f = (d - cum[lo]) / seg_len
        x0, y0 = poly[lo]
        x1, y1 = poly[(lo + 1) % n_poly]
        x = x0 + (x1 - x0) * f
        y = y0 + (y1 - y0) * f
        tx = (x1 - x0) / seg_len
        ty = (y1 - y0) / seg_len
        return x, y, tx, ty

    n_links = 96
    pitch = total_len / n_links
    hp = pitch * 0.5

    bm = bmesh.new()
    # Precompute 8-sided circular cross-section for dry steel track pin (r = 1.32 cm)
    pin_poly = [
        (-hp * 0.94 + 1.32 * math.cos(a), -0.45 + 1.32 * math.sin(a))
        for a in [math.tau * k / 8.0 for k in range(8)]
    ]
    # Sculpted 8-point Kgs 63 shoe plate profile in (s, n)
    shoe_poly = [
        (-hp * 0.88, -1.75),
        ( hp * 0.88, -1.75),
        ( hp * 0.97, -0.95),
        ( hp * 0.97,  0.15),
        ( hp * 0.84,  0.85),
        (-hp * 0.84,  0.85),
        (-hp * 0.97,  0.15),
        (-hp * 0.97, -0.95),
    ]
    # Twin bold trapezoidal-beveled traction grouser cleats peaking at exact n = +2.20 cm!
    cleat_f = [
        ( hp * 0.16, 0.72),
        ( hp * 0.68, 0.72),
        ( hp * 0.56, 2.20),
        ( hp * 0.28, 2.20),
    ]
    cleat_r = [
        (-hp * 0.68, 0.72),
        (-hp * 0.16, 0.72),
        (-hp * 0.28, 2.20),
        (-hp * 0.56, 2.20),
    ]
    # Tapered cast-steel central guide horn profile (projects inward from n=-1.60 to n=-7.50)
    horn_poly = [
        (-hp * 0.56, -1.60),
        ( hp * 0.56, -1.60),
        ( hp * 0.22, -7.50),
        (-hp * 0.22, -7.50),
    ]
    # End-connector flank lug block profile
    lug_poly = [
        (-hp * 0.92, -1.45),
        ( hp * 0.36, -1.45),
        ( hp * 0.36,  0.88),
        (-hp * 0.92,  0.88),
    ]

    for li in range(n_links):
        cx, cy, tx, ty = sample_at((li + 0.5) * pitch)
        # Snap exact horizontal flat links on bottom ground run so Y_min = -57.000 cm with 0.000 error!
        if cy < -54.78 and abs(ty) < 0.01:
            cy = -54.80
            tx, ty = 1.0, 0.0
        nx, ny = ty, -tx  # Outward normal for CCW loop

        # 1. Main Kgs 63 cast-steel shoe body (mat 0: H_TrackSteel)
        _add_prism_snz(bm, shoe_poly, -34.55, 34.55, cx, cy, tx, ty, nx, ny, 0)
        # 2. Left & right split notched burnished grouser cleats (mat 1: H_TrackCleat) — iconic Kgs 63 tread!
        for z0_c, z1_c in ((-34.15, -3.20), (3.20, 34.15)):
            _add_prism_snz(bm, cleat_f, z0_c, z1_c, cx, cy, tx, ty, nx, ny, 1)
            _add_prism_snz(bm, cleat_r, z0_c, z1_c, cx, cy, tx, ty, nx, ny, 1)
        # 3. Twin central tapered guide horns cleanly centered inside Schachtellaufwerk wheel channel (mat 1)
        _add_prism_snz(bm, horn_poly, -2.05, -0.65, cx, cy, tx, ty, nx, ny, 1)
        _add_prism_snz(bm, horn_poly,  0.65,  2.05, cx, cy, tx, ty, nx, ny, 1)
        # 4. Full-width dry steel track pin w/ exposed side pin heads reaching exact Z = ±36.25 cm (mat 1)
        _add_prism_snz(bm, pin_poly, -36.25, 36.25, cx, cy, tx, ty, nx, ny, 1)
        # 5. Flanking cast-steel end-connector lug blocks (mat 0)
        _add_prism_snz(bm, lug_poly, -35.65, -33.85, cx, cy, tx, ty, nx, ny, 0)
        _add_prism_snz(bm, lug_poly,  33.85,  35.65, cx, cy, tx, ty, nx, ny, 0)

    # Rigidly seat lowest track grouser crest at EXACT local Y = -57.000 cm (world Y_min = -120.000 cm!)
    cur_ymin = min(v.co.z for v in bm.verts)
    dy_snap = -57.0 - cur_ymin
    if abs(dy_snap) > 1e-6:
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, 0.0, dy_snap))

    obj = _bm_to_obj(name, bm, trk_mat)
    obj.data.materials.append(cleat_mat)
    return join_parts(name, [obj], smooth_angle_deg=34.0)


def build_tiger_engine_deck(mats) -> bpy.types.Object:
    """Iconic Tiger 131 louvered Maybach engine deck + twin rear Feifel desert cyclone air cleaners w/
    corrugated armored intake hoses + open-slotted half-cylinder perforated exhaust heat shields wrapping
    burnt-orange rusted mufflers & heat-blued lower manifold elbows! Strictly X in [-107.5, +94.0]."""
    parts = []
    camo = mats["H_EngineDeckCamo"]
    gun = mats["H_GunMetal"]
    rust = mats["H_RustExhaust"]
    shield = mats["H_ExhaustShield"]
    blued = mats["H_HeatBluedManifold"]
    grease = mats["H_GreaseHub"]

    # Central armored Maybach engine access deck hatch + recessed T-handles & bolted hinge strip
    parts.append(mk_box("ed_center", 184, 7, 102, [("t", 2, 19, 0)], camo, bevel=0.6))
    parts.append(mk_cyl("ed_hinge_c", 1.8, 1.8, 96, "z", 12, [("t", 92, 22.8, 0)], grease, bevel=0.2))
    # Central circular armored snorkel / fan intake dome w/ radial armored grille ribs
    parts.append(mk_cyl("ed_dome", 20, 22, 5.5, "y", 28, [("t", -16, 24.5, 0)], camo, bevel=0.4))
    for r_ang in (0.0, 0.785, 1.571, 2.356):
        parts.append(mk_box(f"ed_drib_{r_ang:.2f}", 36, 1.8, 2.0, [("ry", r_ang), ("t", -16, 27.6, 0)], gun, bevel=0.15))
    for lx in (-74, 78):
        for lz in (-38, 38):
            parts.append(mk_box(f"ed_lug_{lx}_{lz}", 8, 4.5, 5, [("t", lx, 24.5, lz)], grease, bevel=0.3))

    for sz in (-1, 1):
        # Flanking armored radiator louvered grille decks + raised perimeter mesh frame rails
        parts.append(mk_box(f"ed_side_{sz}", 184, 7, 88, [("t", 2, 19, sz * 98)], camo, bevel=0.5))
        parts.append(mk_box(f"ed_frm_f_{sz}", 6, 3.2, 82, [("t", 86, 23.8, sz * 98)], camo, bevel=0.25))
        parts.append(mk_box(f"ed_frm_r_{sz}", 6, 3.2, 82, [("t", -82, 23.8, sz * 98)], camo, bevel=0.25))
        for lx in range(-74, 80, 11):
            parts.append(mk_box(f"ed_louv_{sz}_{lx}", 4.4, 3.4, 76, [("rz", 0.36), ("t", lx, 23.5, sz * 98)], gun, bevel=0.2))

        # ---------------------------------------------------------------------
        # 1. ICONIC TWIN CYLINDRICAL FEIFEL DESERT CYCLONE PRE-CLEANER CANISTERS
        #    Mounted on rear transom at X_local = -99.0, Z = ±84.0 (rear X = -107.4 >= -107.5!)
        # ---------------------------------------------------------------------
        # Stepped main cyclone drum (Y_local in [+2, +24.5], R = 8.4)
        parts.append(mk_cyl(f"ed_feifel_{sz}", 8.4, 8.4, 22.5, "y", 28, [("t", -99.0, 13.25, sz * 84.0)], camo, bevel=0.55))
        # Conical lower sand-separator dust hopper + bottom discharge valve cap
        parts.append(mk_cyl(f"ed_fhop_{sz}", 8.2, 3.0, 11.0, "y", 24, [("t", -99.0, -3.5, sz * 84.0)], camo, bevel=0.35))
        parts.append(mk_cyl(f"ed_fvalv_{sz}", 3.4, 3.4, 2.8, "y", 16, [("t", -99.0, -10.2, sz * 84.0)], gun, bevel=0.2))
        # Top stepped rain-cap lid + center clamping hex nut
        parts.append(mk_cyl(f"ed_fcap_{sz}", 6.8, 8.8, 3.8, "y", 24, [("t", -99.0, 26.2, sz * 84.0)], gun, bevel=0.35))
        parts.append(mk_cyl(f"ed_fnut_{sz}", 2.0, 2.0, 2.2, "y", 6, [("t", -99.0, 29.0, sz * 84.0)], gun, bevel=0.1))
        # Twin welded steel mounting strap bands + transom standoffs
        for sy_b in (6.0, 19.5):
            parts.append(mk_cyl(f"ed_fstr_{sz}_{sy_b}", 8.75, 8.75, 2.2, "y", 24, [("t", -99.0, sy_b, sz * 84.0)], gun, bevel=0.18))
            parts.append(mk_box(f"ed_fbrk_{sz}_{sy_b}", 10.0, 3.4, 14.0, [("t", -93.0, sy_b, sz * 84.0)], gun, bevel=0.25))
        # Dual armored corrugated flex-intake hoses curving forward onto engine deck collector elbow!
        # Curve from (-96, 25.0, ±84) -> (-42, 24.0, ±58)
        p0_x, p0_y, p0_z = -95.0, 25.2, sz * 84.0
        p1_x, p1_y, p1_z = -44.0, 24.2, sz * 58.0
        dx_h, dz_h = p1_x - p0_x, p1_z - p0_z
        ang_h = math.atan2(-dz_h, dx_h)
        hose_len = math.hypot(dx_h, dz_h)
        parts.append(mk_cyl(
            f"ed_fcore_{sz}", 3.8, 3.8, hose_len, "x", 16,
            [("ry", ang_h), ("t", 0.5 * (p0_x + p1_x), 0.5 * (p0_y + p1_y), 0.5 * (p0_z + p1_z))],
            gun, bevel=0.2,
        ))
        # 10 sculpted corrugated flex-hose rib rings along each armored intake hose!
        for hi in range(10):
            hu = (hi + 0.5) / 10.0
            hx = p0_x + dx_h * hu
            hy = p0_y + (p1_y - p0_y) * hu + 1.4 * math.sin(math.pi * hu)
            hz = p0_z + dz_h * hu
            parts.append(mk_cyl(
                f"ed_frib_{sz}_{hi}", 4.75, 4.75, 2.2, "x", 16,
                [("ry", ang_h), ("t", hx, hy, hz)],
                gun, bevel=0.28,
            ))
        # Armored engine-deck air intake collector manifold elbow box
        parts.append(mk_box(f"ed_fcoll_{sz}", 16.0, 7.5, 16.0, [("t", -42.0, 24.5, sz * 56.0)], camo, bevel=0.5))

        # ---------------------------------------------------------------------
        # 2. ARMORED HALF-CYLINDER PERFORATED/SLOTTED HEAT SHIELDS + RUSTED MUFFLERS
        #    & HEAT-BLUED LOWER EXHAUST MANIFOLDS (Z = ±36.0, rear X >= -107.2!)
        # ---------------------------------------------------------------------
        # Heat-blued lower exhaust manifold elbow exiting transom into muffler base
        parts.append(mk_cyl(f"ed_manif_{sz}", 4.4, 4.6, 12.0, "x", 18, [("t", -93.0, -35.5, sz * 36.0)], blued, bevel=0.35))
        parts.append(mk_cyl(f"ed_melb_{sz}", 5.0, 5.0, 10.5, "y", 18, [("t", -97.5, -37.5, sz * 36.0)], blued, bevel=0.4))
        # Heavy burnt-orange rusted vertical cast-iron exhaust muffler drum (visible through shield slots!)
        parts.append(mk_cyl(f"ed_muff_{sz}", 6.9, 6.9, 46.0, "y", 24, [("t", -97.5, -13.0, sz * 36.0)], rust, bevel=0.5))
        parts.append(mk_cyl(f"ed_mcap_{sz}", 7.3, 7.3, 3.2, "y", 20, [("t", -97.5, 10.5, sz * 36.0)], rust, bevel=0.3))
        # Upper vertical exhaust tailpipe stack + bolted flange collar + heat-blackened flared tip
        parts.append(mk_cyl(f"ed_stack_{sz}", 4.1, 4.3, 18.0, "y", 18, [("t", -97.5, 19.5, sz * 36.0)], rust, bevel=0.3))
        parts.append(mk_cyl(f"ed_flange_{sz}", 5.8, 5.8, 2.6, "y", 18, [("t", -97.5, 13.5, sz * 36.0)], blued, bevel=0.22))
        parts.append(mk_hollow_tube_axis(f"ed_stip_{sz}", 4.6, 3.3, 27.2, 29.8, "y", 18, bevel=0.18, xform=[("t", -97.5, 0, sz * 36.0)], mat=rust))

        # Armored half-cylinder perforated/slotted sheet-metal heat shield wrapping rear 200 deg arc!
        # 6 stacked curved sheet-metal louver bands separated by 2.0 cm open ventilation slots!
        a_sh0 = math.radians(82.0)
        a_sh1 = math.radians(278.0)
        for bi in range(6):
            by0 = -36.5 + bi * 8.0
            by1 = by0 + 5.8
            parts.append(_mk_curved_arc_strip(
                f"ed_shld_{sz}_{bi}", 9.6, 8.4, by0, by1, a_sh0, a_sh1, 14, -97.5, sz * 36.0, shield
            ))
        # Top curved armored rain-cap lip & side flanged transom mounting spine rails + rear vertical rib
        parts.append(_mk_curved_arc_strip(f"ed_shcap_{sz}", 9.8, 6.6, 10.2, 12.2, a_sh0, a_sh1, 14, -97.5, sz * 36.0, shield))
        for z_fl in (-9.6, 9.6):
            parts.append(mk_box(f"ed_shfl_{sz}_{z_fl}", 5.2, 48.5, 2.2, [("t", -94.2, -12.2, sz * 36.0 + z_fl)], gun, bevel=0.2))
        parts.append(mk_box(f"ed_shrib_{sz}", 1.8, 48.0, 2.4, [("t", -106.8, -12.5, sz * 36.0)], gun, bevel=0.18))

    return join_parts("tiger_engine_deck", parts, smooth_angle_deg=36.0)


def build_tiger_torsion_bars(mats) -> bpy.types.Object:
    parts = []
    steel = mats["H_MachinedSteel"]
    gun = mats["H_GunMetal"]
    for i, wx0 in enumerate(WHEEL_X_STATIONS):
        wx = wx0 + 9.0
        parts.append(mk_cyl(f"tb_barA_{i}", 2.8, 2.8, 202, "z", 16, [("t", wx - 4, 5.5, 0)], steel, bevel=0.2))
        parts.append(mk_cyl(f"tb_barB_{i}", 2.8, 2.8, 202, "z", 16, [("t", wx + 4, 5.5, 0)], steel, bevel=0.2))
        for sz in (-1, 1):
            parts.append(mk_cyl(f"tb_anc_{i}_{sz}", 5.6, 5.6, 16, "z", 16, [("t", wx, 5.5, sz * 104)], gun, bevel=0.3))
            parts.append(mk_box(f"tb_arm_{i}_{sz}", 18, 6.5, 10, [("rz", 0.68), ("t", wx - 4, -1.5, sz * 112)], gun, bevel=0.4))
            parts.append(mk_cyl(f"tb_spin_{i}_{sz}", 4.8, 4.8, 14, "z", 16, [("t", wx - 8, -8, sz * 113)], steel, bevel=0.3))
    return join_parts("tiger_torsion_bars", parts, smooth_angle_deg=36.0)


def build_tiger_turret_ring(mats) -> bpy.types.Object:
    parts = []
    steel = mats["H_MachinedSteel"]
    gun = mats["H_GunMetal"]
    parts.append(mk_hollow_tube_axis("tr_main", 101.0, 90.0, -5.5, 5.5, "y", 64, bevel=0.55, mat=steel))
    # 36 precision internal involute traverse gear teeth
    for i in range(36):
        th = (i / 36.0) * math.tau
        parts.append(mk_box(
            f"tr_t_{i}", 4.5, 7.2, 4.2,
            [("ry", -th), ("t", math.cos(th) * 89.2, 0, math.sin(th) * 89.2)],
            gun, bevel=0.2,
        ))
    return join_parts("tiger_turret_ring", parts, smooth_angle_deg=36.0)


# =============================================================================
# SUITE 2 BUILDERS (8 Solid Parts: Turret #131, Cupola, Mantlet, 88mm KwK 36,
#                   Recoil Cradle, Krupp Breech, Shell Guard, TZF 9b Optics)
# =============================================================================
def _horseshoe_profile(r_rear: float, x_front: float, z_front: float, segs: int = 36) -> list[tuple[float, float]]:
    """Iconic Tiger I horseshoe turret planform in Three.js XZ local coordinates."""
    pts: list[tuple[float, float]] = [(x_front, -z_front), (x_front, z_front)]
    # Curved horseshoe arc from +Z cheek around rear semicircular bustle (-X) to -Z cheek
    a0 = math.atan2(z_front, 28.0 - (-8.0))
    a1 = math.tau - a0
    for k in range(segs + 1):
        a = a0 + (a1 - a0) * (k / segs)
        x = -8.0 + r_rear * math.cos(a)
        z = r_rear * math.sin(a)
        pts.append((x, z))
    return pts


def _mk_conformal_turret_hero_plaque(
    name: str, sz: int, mat_hero: bpy.types.Material, mat_side: bpy.types.Material
) -> bpy.types.Object:
    """Strictly watertight curved conformal '131' flank plaque hugging the exact horseshoe turret contour
    at +0.38 cm offset over X in [-14, +88], Y in [-31, +31]. ONLY outer faces carry mat_hero (zero
    back-face UV collision!)."""
    a0 = math.atan2(98.0, 28.0 - (-8.0))
    x_join = -8.0 + 115.0 * math.cos(a0)  # ~ +31.65
    z_join = 115.0 * math.sin(a0)         # ~ +107.95

    def z_wall(x: float) -> float:
        if x >= x_join:
            return z_join + (98.0 - z_join) * (x - x_join) / (116.0 - x_join)
        return math.sqrt(max(1.0, 115.0 * 115.0 - (x + 8.0) * (x + 8.0)))

    n_seg = 14
    xs = [-14.0 + (88.0 - (-14.0)) * (k / n_seg) for k in range(n_seg + 1)]
    bm = bmesh.new()
    ob, ot, ib, it = [], [], [], []
    for x in xs:
        zw = z_wall(x)
        zo = sz * (zw + 0.38)
        zi = sz * (zw - 0.85)
        ob.append(bm.verts.new(t2b(x, -31.0, zo)))
        ot.append(bm.verts.new(t2b(x,  31.0, zo)))
        ib.append(bm.verts.new(t2b(x, -31.0, zi)))
        it.append(bm.verts.new(t2b(x,  31.0, zi)))

    for k in range(n_seg):
        f_out = bm.faces.new((ob[k], ob[k + 1], ot[k + 1], ot[k]))
        f_out.material_index = 0  # mat_hero ONLY on outer faces!
        f_in = bm.faces.new((ib[k + 1], ib[k], it[k], it[k + 1]))
        f_in.material_index = 1
        f_top = bm.faces.new((ot[k], ot[k + 1], it[k + 1], it[k]))
        f_top.material_index = 1
        f_bot = bm.faces.new((ib[k], ib[k + 1], ob[k + 1], ob[k]))
        f_bot.material_index = 1
    f_c0 = bm.faces.new((ib[0], ob[0], ot[0], it[0]))
    f_c0.material_index = 1
    f_c1 = bm.faces.new((ob[n_seg], ib[n_seg], it[n_seg], ot[n_seg]))
    f_c1.material_index = 1

    obj = _bm_to_obj(name, bm, mat_hero)
    obj.data.materials.append(mat_side)
    return obj


def build_tiger_turret_shell(mats) -> bpy.types.Object:
    camo = mats["T_DunkelgelbCamo"]
    hero = mats["T_TurretHero131"]
    ivory = mats["T_InteriorIvory"]
    gun = mats["T_OrdnanceDark"]
    trk = mats["T_TrackSteel"]
    cleat = mats["T_TrackCleat"]

    outer_pts = _horseshoe_profile(115.0, 116.0, 98.0, segs=40)
    inner_pts = _horseshoe_profile(103.0, 104.0, 86.0, segs=40)

    # True hollow 10–12 cm thick bent Krupp steel horseshoe turret wall (Elfenbein interior!)
    wall = mk_extrude_2d_xz("ts_wall", outer_pts, inner_pts, -45.0, 41.0, camo, ivory)
    # Cut open the front 88mm gun mantlet aperture!
    mantlet_cut = mk_box("ts_mant_cut", 38, 48, 128, [("t", 112, 2, 0)], camo)
    bool_op(wall, mantlet_cut, "DIFFERENCE")

    # Armored turret roof plate (Y in [+40.5, +46.0])
    roof = mk_extrude_2d_xz("ts_roof", outer_pts, None, 40.5, 46.0, camo)
    parts = [wall, roof]

    # -------------------------------------------------------------------------
    # PLAN C — DETAILED REAR ROMMELKISTE (GEPÄCKKASTEN) STOWAGE BIN (X >= -160.0!)
    # -------------------------------------------------------------------------
    parts.append(mk_box("ts_rommel_body", 40, 56, 146, [("t", -138.0, -2, 0)], camo, bevel=0.85))
    parts.append(mk_box("ts_rommel_lid", 43, 6.5, 150, [("t", -137.5, 28.5, 0)], camo, bevel=0.6))
    # Horizontal sheet-metal stiffening ribs + vertical corner weld-seam angle strips on Rommelkiste
    for ry_r in (-18.0, -2.0, 14.0):
        parts.append(mk_box(f"ts_rm_rib_{ry_r}", 1.8, 2.4, 142, [("t", -158.4, ry_r, 0)], camo, bevel=0.2))
    for rz_c in (-73.2, 73.2):
        parts.append(mk_box(f"ts_rm_wld_{rz_c}", 4.0, 56.5, 2.4, [("t", -157.5, -2, rz_c)], camo, bevel=0.2))
        parts.append(mk_box(f"ts_rm_srib_{rz_c}", 36.0, 2.4, 1.8, [("t", -138.0, -2, rz_c)], camo, bevel=0.2))
    # 3 detailed two-piece stamped padlock latch clasps w/ hasp staples on rear face (X >= -160.0!)
    for cz in (-54, 0, 54):
        parts.append(mk_box(f"ts_clasp_u_{cz}", 2.2, 7.5, 5.2, [("t", -159.1, 25.5, cz)], gun, bevel=0.22))
        parts.append(mk_box(f"ts_clasp_l_{cz}", 2.4, 6.2, 4.6, [("t", -159.0, 18.2, cz)], gun, bevel=0.22))
        parts.append(mk_cyl(f"ts_clasp_p_{cz}", 1.0, 1.0, 6.2, "z", 10, [("t", -159.2, 21.8, cz)], cleat, bevel=0.1))
    # 4 heavy rear top-lid piano hinges along Rommelkiste seam
    for hz in (-58, -20, 20, 58):
        parts.append(mk_cyl(f"ts_rm_hng_{hz}", 1.8, 1.8, 10.0, "z", 12, [("t", -117.5, 29.8, hz)], gun, bevel=0.18))

    # 3 forged crane lifting lugs along turret roof perimeter (Y <= 46.0)
    for lx_l, lz_l in ((92.0, -90.0), (92.0, 90.0), (-110.0, 0.0)):
        parts.append(mk_cyl(f"ts_lug_{lx_l}_{lz_l}", 3.2, 3.6, 5.5, "z", 14, [("t", lx_l, 42.5, lz_l)], gun, bevel=0.3))

    # -------------------------------------------------------------------------
    # CONFORMAL HERO "131" PLAQUES + REAR-FLANK SPARE KGS 63 TRACK LINKS (STRICTLY BEHIND "131"!)
    # -------------------------------------------------------------------------
    for sz in (-1, 1):
        # Smooth conformal curved Hero "131" plaque hugging horseshoe wall cleanly (X in [-14, +88])
        parts.append(_mk_conformal_turret_hero_plaque(f"ts_hero131_{sz}", sz, hero, camo))

        # Armored circular escape hatch (+Z) / pistol port (-Z) w/ hinge & rain lip at X = -35
        r_p = 12.0 if sz > 0 else 8.8
        parts.append(mk_cyl(f"ts_port_{sz}", r_p, r_p + 1.2, 5.5, "z", 22, [("t", -35, 3, sz * 112.5)], camo, bevel=0.45))
        parts.append(mk_box(f"ts_phng_{sz}", 5.0, 4.5, 4.5, [("t", -35 + r_p + 1.5, 3, sz * 113.2)], gun, bevel=0.25))

        # PLAN C — 2 Sculpted Vertical Spare Kgs 63 Track Links hung on forged U-bracket hooks per turret side!
        # Positioned at horseshoe angles 113 deg (X=-53) & 128 deg (X=-79) — strictly >35 cm BEHIND "131"!
        for sp_i, a_deg in enumerate((113.0, 128.0)):
            ar = math.radians(a_deg)
            r_trk = 117.2
            tx_c = -8.0 + r_trk * math.cos(ar)
            tz_c = sz * r_trk * math.sin(ar)
            # Tangent rotation around Y so link flat face hugs the curved horseshoe turret wall cleanly!
            ry_t = sz * (ar - math.pi * 0.5)
            # Upper & lower forged steel hanging U-hooks & retaining pin bolted to turret wall
            for hy_k in (25.5, -25.5):
                parts.append(mk_box(
                    f"ts_shk_{sz}_{sp_i}_{hy_k}", 15.0, 4.2, 6.2,
                    [("ry", ry_t), ("t", tx_c, hy_k, tz_c)],
                    gun, bevel=0.3,
                ))
            # Sculpted vertical Kgs 63 track link shoe body (52 cm tall x 13.4 cm wide x 3.4 cm thick)
            parts.append(mk_box(
                f"ts_strk_{sz}_{sp_i}", 13.4, 52.0, 3.4,
                [("ry", ry_t), ("t", tx_c, 0.0, tz_c)],
                trk, bevel=0.4,
            ))
            # Twin burnished Kgs 63 outer grouser cleat ribs facing outward from turret wall!
            for off_x in (-3.2, 3.2):
                parts.append(mk_box(
                    f"ts_sgr_{sz}_{sp_i}_{off_x}", 2.6, 50.0, 2.0,
                    [("t", off_x, 0.0, sz * 2.1), ("ry", ry_t), ("t", tx_c, 0.0, tz_c)],
                    cleat, bevel=0.2,
                ))
            # Top & bottom steel track-pin end bars
            for py_k in (-26.4, 26.4):
                parts.append(mk_cyl(
                    f"ts_spin_{sz}_{sp_i}_{py_k}", 1.35, 1.35, 14.8, "x", 10,
                    [("ry", ry_t), ("t", tx_c, py_k, tz_c)],
                    cleat, bevel=0.12,
                ))

        # Iconic forward-corner triple Nebelwurfgerät 90mm smoke-grenade dischargers (strictly IN FRONT of "131"!)
        parts.append(mk_box(f"ts_smk_brk_{sz}", 8.0, 12.0, 6.5, [("t", 104.0, 26.0, sz * 101.5)], gun, bevel=0.3))
        for si, (sy_o, sa_y) in enumerate(((-3.8, -0.18), (0.0, 0.0), (3.8, 0.18))):
            parts.append(mk_cyl(
                f"ts_smk_{sz}_{si}", 2.4, 2.5, 14.0, "x", 14,
                [("rz", 0.34), ("ry", sz * sa_y), ("t", 108.5, 28.0 + sy_o, sz * 104.0)],
                gun, bevel=0.2,
            ))

    return join_parts("tiger_turret_shell", parts, smooth_angle_deg=35.0)


def build_tiger_cupola_hatches(mats) -> bpy.types.Object:
    parts = []
    camo = mats["T_DunkelgelbCamo"]
    gun = mats["T_OrdnanceDark"]
    cleat = mats["T_TrackCleat"]
    lens = mats["T_SapphireLens"]

    # Iconic cylindrical commander's cupola (Y_local max = +20.0 -> world Y = +180.0 cm = 3.00m!)
    parts.append(mk_cyl("cp_drum", 35.6, 37.8, 28, "y", 40, [("t", -24, 0, -42)], camo, bevel=0.8))
    # Stepped welded armor base ring collar around cupola root
    parts.append(mk_cyl("cp_base_ring", 39.2, 40.0, 4.2, "y", 36, [("t", -24, -11.9, -42)], camo, bevel=0.45))
    parts.append(mk_cyl("cp_lid", 32, 33, 6, "y", 36, [("t", -24, 17, -42)], camo, bevel=0.6))
    # Heavy counterbalanced cupola hatch hinge spring drum & roof grab handle
    parts.append(mk_box("cp_hinge", 14, 7, 16, [("t", -54, 16, -42)], gun, bevel=0.4))
    parts.append(mk_cyl("cp_hspring", 3.4, 3.4, 18.0, "z", 14, [("t", -57, 16.5, -42)], cleat, bevel=0.25))
    parts.append(mk_box("cp_lgrab", 4.0, 2.2, 16.0, [("t", -4, 19.0, -42)], gun, bevel=0.2))

    # PLAN C — Iconic Circular AA MG 34 Mounting Ring Rail (Fliegerbeschussgerät) around Cupola Rim!
    parts.append(mk_hollow_tube_axis(
        "cp_aa_rail", 37.2, 34.8, 13.6, 15.6, "y", 40, bevel=0.25,
        xform=[("t", -24, 0, -42)], mat=gun,
    ))
    # 6 radial standoff brackets + sliding AA MG pintle carriage block on the ring rail
    for ri in range(6):
        ra = (ri / 6.0) * math.tau + 0.25
        rx = -24.0 + math.cos(ra) * 35.0
        rz = -42.0 + math.sin(ra) * 35.0
        parts.append(mk_box(f"cp_rstnd_{ri}", 5.0, 3.2, 3.0, [("ry", -ra), ("t", rx, 13.2, rz)], gun, bevel=0.2))
    parts.append(mk_box("cp_mg_carr", 7.0, 5.2, 9.0, [("t", 12.2, 15.6, -42.0)], cleat, bevel=0.3))

    # 7 Armored Vision-Block Periscope Slits w/ chamfered rain brows & deeply set sapphire ballistic glass!
    for i in range(7):
        ang = (i / 7.0) * math.tau
        vx = -24.0 + math.cos(ang) * 33.4
        vz = -42.0 + math.sin(ang) * 33.4
        # Armored hood shroud + upper chamfered rain-visor lip
        parts.append(mk_box(f"cp_hood_{i}", 9.6, 8.8, 13.4, [("ry", -ang), ("t", vx, 7.6, vz)], camo, bevel=0.4))
        bx = -24.0 + math.cos(ang) * 36.2
        bz = -42.0 + math.sin(ang) * 36.2
        parts.append(mk_box(f"cp_brow_{i}", 4.6, 1.8, 14.2, [("ry", -ang), ("t", bx, 11.4, bz)], gun, bevel=0.2))
        # Recessed armored vision-slit bezel + multi-coated sapphire glass pane (triggers AR Fresnel!)
        gx = -24.0 + math.cos(ang) * 38.0
        gz = -42.0 + math.sin(ang) * 38.0
        parts.append(mk_box(f"cp_gl_{i}", 1.6, 2.8, 8.8, [("ry", -ang), ("t", gx, 7.8, gz)], lens))

    # Loader's hinged rectangular roof hatch (right side) w/ twin hinge knuckles + central turret fume ventilator dome
    parts.append(mk_box("cp_loader", 54, 9.5, 48, [("t", -6, -9, 46)], camo, bevel=0.7))
    parts.append(mk_box("cp_l_handle", 16, 3.5, 4.5, [("t", 10, -3.0, 46)], gun, bevel=0.25))
    for lz_h in (30.0, 62.0):
        parts.append(mk_cyl(f"cp_lhng_{lz_h}", 2.2, 2.2, 8.0, "z", 12, [("t", -33.5, -5.2, lz_h)], gun, bevel=0.2))
    parts.append(mk_cyl("cp_vent", 15, 18, 9, "y", 24, [("t", 50, -9.5, 4)], camo, bevel=0.55))
    parts.append(mk_cyl("cp_vent_cap", 16.5, 16.5, 2.2, "y", 24, [("t", 50, -4.6, 4)], gun, bevel=0.25))

    return join_parts("tiger_cupola_hatches", parts, smooth_angle_deg=36.0)


def build_tiger_gun_mantlet(mats) -> bpy.types.Object:
    parts = []
    camo = mats["T_MantletCast"]
    gun = mats["T_OrdnanceDark"]
    # Contoured 120mm heavy rough cast-steel external shield + thickened horizontal reinforcement rib
    parts.append(mk_box("gm_plate", 18, 46, 138, [("t", 0, 0, 0)], camo, bevel=2.0))
    parts.append(mk_box("gm_rib", 22, 18, 136, [("t", 6, 0, 0)], camo, bevel=1.8))
    # Heavy conical armored barrel recoil collar
    parts.append(mk_cyl("gm_collar", 15.5, 18.8, 36, "x", 36, [("t", 20, 0, 0)], camo, bevel=1.1))
    # Coaxial MG 34 armored sleeve & perforated barrel jacket (right, Z = +32)
    parts.append(mk_cyl("gm_mg_arm", 4.8, 6.0, 22, "x", 24, [("t", 16, 0, 32)], gun, bevel=0.4))
    parts.append(mk_cyl("gm_mg_bbl", 1.7, 1.9, 18, "x", 16, [("t", 29, 0, 32)], gun, bevel=0.2))
    # Twin TZF 9b binocular armored sight apertures (left, Z = -32, -43)
    for zs in (-32, -43):
        parts.append(mk_cyl(f"gm_sight_{zs}", 4.5, 5.2, 14, "x", 20, [("t", 14, 3, zs)], gun, bevel=0.35))
    return join_parts("tiger_gun_mantlet", parts, smooth_angle_deg=36.0)


def build_tiger_main_gun(mats) -> bpy.types.Object:
    parts = []
    bbl = mats["T_KwK36Barrel"]
    # True hollow 4.93-meter Krupp 88mm KwK 36 L/56 rifled cannon barrel (48-seg silky smooth!)
    # Stepped armored recoil jacket (X_local in [-40, +60])
    parts.append(mk_hollow_tube_axis("mg_jacket", 12.2, 4.4, -40.0, 60.0, "x", 48, bevel=0.5, mat=bbl))
    # Mid tapered tube (X_local in [+59, +211])
    parts.append(mk_cyl("mg_mid", 8.0, 9.6, 152, "x", 48, [("t", 135, 0, 0)], bbl, bevel=0.4))
    # Forward slender L/56 tube with real hollow 88mm muzzle bore (X_local in [+210, +350])
    parts.append(mk_hollow_tube_axis("mg_fwd", 6.8, 4.4, 210.0, 350.0, "x", 48, bevel=0.35, mat=bbl))
    # Threaded locking collar behind muzzle brake (X_local in [+348, +358])
    parts.append(mk_hollow_tube_axis("mg_collar", 9.2, 4.4, 348.0, 358.0, "x", 36, bevel=0.4, mat=bbl))

    # Unmistakable Krupp twin-baffle conical muzzle brake (X_local in [+356, +387], exact max X = +387.0!)
    brake = mk_cyl("mg_brake", 11.8, 13.5, 31.0, "x", 40, [("t", 371.5, 0, 0)], bbl, bevel=1.2)
    bore_c = mk_cyl("mg_b_bore", 4.5, 4.5, 42.0, "x", 24, [("t", 371.5, 0, 0)], bbl)
    slot1 = mk_box("mg_b_s1", 7.4, 13.4, 34.0, [("t", 365.5, 0, 0)], bbl)
    slot2 = mk_box("mg_b_s2", 7.0, 12.2, 34.0, [("t", 377.5, 0, 0)], bbl)
    bool_op(brake, bore_c, "DIFFERENCE")
    bool_op(brake, slot1, "DIFFERENCE")
    bool_op(brake, slot2, "DIFFERENCE")
    parts.append(brake)

    return join_parts("tiger_main_gun", parts, smooth_angle_deg=38.0)


def build_tiger_recoil_cradle(mats) -> bpy.types.Object:
    parts = []
    breech = mats["T_KruppBreech"]
    chrome = mats["T_ChromePiston"]
    dark = mats["T_OrdnanceDark"]
    # Armored U-trough gun cradle + slide rails
    parts.append(mk_box("rc_base", 90, 8, 34, [("t", 5, -15, 0)], breech, bevel=0.5))
    for sz in (-1, 1):
        parts.append(mk_box(f"rc_side_{sz}", 90, 28, 6, [("t", 5, -2, sz * 18)], breech, bevel=0.45))
    # Trunnion pivot pins
    parts.append(mk_cyl("rc_trun", 6.5, 6.5, 44, "z", 24, [("t", 44, 0, 0)], chrome, bevel=0.4))
    # Gleaming chrome hydraulic recoil brake (Rohrbremse) + hydro-pneumatic recuperator (Vorholer)
    parts.append(mk_cyl("rc_brake_cyl", 5.6, 5.6, 86, "x", 32, [("t", 2, -14.5, 12)], chrome, bevel=0.4))
    parts.append(mk_cyl("rc_recup_cyl", 5.8, 5.8, 86, "x", 32, [("t", 2, 14.5, 12)], chrome, bevel=0.4))
    # Front & rear heavy clamping collars
    parts.append(mk_box("rc_cl_f", 10, 40, 40, [("t", 44, 0, 0)], dark, bevel=0.6))
    parts.append(mk_box("rc_cl_r", 8, 38, 38, [("t", -36, 0, 0)], dark, bevel=0.5))
    return join_parts("tiger_recoil_cradle", parts, smooth_angle_deg=36.0)


def build_tiger_breech_block(mats) -> bpy.types.Object:
    breech = mats["T_KruppBreech"]
    chrome = mats["T_ChromePiston"]
    dark = mats["T_OrdnanceDark"]
    # Heavy Krupp milled rectangular breech ring with open 88mm chamber throat!
    ring = mk_box("bb_ring", 42, 31, 31, [("t", -4, 0, 0)], breech, bevel=1.0)
    throat = mk_cyl("bb_throat", 5.5, 5.5, 48, "x", 28, [("t", -4, 0, 0)], dark)
    bool_op(ring, throat, "DIFFERENCE")
    parts = [
        ring,
        # Polished Krupp horizontal sliding-wedge breechblock seated in transverse mortise
        mk_box("bb_wedge", 16, 22, 26, [("t", -10, 0, -2)], chrome, bevel=0.6),
        # Semi-automatic operating crank lever & firing-pin solenoid housing
        mk_box("bb_crank", 14, 5, 12, [("t", -16, 15, 8)], dark, bevel=0.35),
        mk_cyl("bb_handle", 2.0, 2.0, 14, "y", 14, [("t", -20, 12, 12)], chrome, bevel=0.2),
    ]
    return join_parts("tiger_breech_block", parts, smooth_angle_deg=36.0)


def build_tiger_shell_guard(mats) -> bpy.types.Object:
    parts = []
    dark = mats["T_OrdnanceDark"]
    brass = mats["T_BrassBasket"]
    # Twin tubular steel recoil guard rails (Abweiser)
    for sz in (-1, 1):
        parts.append(mk_cyl(f"sg_top_{sz}", 2.0, 2.0, 58, "x", 16, [("t", -2, 18, sz * 16)], dark, bevel=0.2))
        parts.append(mk_cyl(f"sg_mid_{sz}", 2.0, 2.0, 58, "x", 16, [("t", -2, -2, sz * 16)], dark, bevel=0.2))
        parts.append(mk_cyl(f"sg_rp_{sz}", 2.0, 2.0, 32, "y", 16, [("t", -30, 4, sz * 16)], dark, bevel=0.2))
        parts.append(mk_cyl(f"sg_fp_{sz}", 2.0, 2.0, 32, "y", 16, [("t", 26, 4, sz * 16)], dark, bevel=0.2))
    parts.append(mk_box("sg_hoop", 4, 24, 34, [("t", -30, 8, 0)], dark, bevel=0.35))
    # Slatted brass-framed spent-shell catcher basket (Hülsenfangsack)
    parts.append(mk_box("sg_floor", 50, 4, 30, [("t", -2, -32, 0)], brass, bevel=0.35))
    for bx in (-24, -13, -2, 9, 20):
        parts.append(mk_box(f"sg_slL_{bx}", 2.6, 24, 2.6, [("t", bx, -19, -14)], brass, bevel=0.2))
        parts.append(mk_box(f"sg_slR_{bx}", 2.6, 24, 2.6, [("t", bx, -19, 14)], brass, bevel=0.2))
    return join_parts("tiger_shell_guard", parts, smooth_angle_deg=36.0)


def build_tiger_optics_tzf9b(mats) -> bpy.types.Object:
    parts = []
    dark = mats["T_OrdnanceDark"]
    breech = mats["T_KruppBreech"]
    lens = mats["T_SapphireLens"]
    # Twin articulated Leitz TZF 9b binocular optical tubes + strictly firewalled sapphire-cyan glass lenses!
    for z_off in (-5.2, 5.2):
        parts.append(mk_cyl(f"op_tube_{z_off}", 3.8, 4.2, 74, "x", 24, [("t", 2, 0, z_off)], dark, bevel=0.25))
        parts.append(mk_cyl(f"op_lens_{z_off}", 3.3, 3.3, 3.0, "x", 24, [("t", 40.5, 0, z_off)], lens, bevel=0.15))
        parts.append(mk_cyl(f"op_eye_{z_off}", 4.4, 3.8, 5.0, "x", 20, [("t", -35.5, 0, z_off)], dark, bevel=0.25))
    parts.append(mk_box("op_bridge", 16, 12, 18, [("t", -10, 0, 0)], breech, bevel=0.5))
    parts.append(mk_cyl("op_drum", 5.2, 5.2, 12, "y", 20, [("t", -10, 5, 0)], dark, bevel=0.35))
    return join_parts("tiger_optics_tzf9b", parts, smooth_angle_deg=36.0)


# =============================================================================
# SUITE 3 BUILDERS (8 Solid Parts: Maybach HL230 V12, Olvar Gearbox, Driveshaft,
#                   Turret Basket, 88mm Ammo Racks, Ready Round, Fuel Tanks, Crew)
# =============================================================================
def build_tiger_maybach_v12(mats) -> bpy.types.Object:
    parts = []
    cast = mats["D_MaybachCast"]
    alum = mats["D_AlumRadiator"]
    plate = mats["D_MaybachPlate"]
    exh = mats["D_ExhaustManif"]
    gear = mats["D_GearboxSteel"]
    cop = mats["D_CopperBand"]

    # Heavy cast-iron V12 crankcase & deep ribbed oil sump
    parts.append(mk_box("mv_case", 146, 36, 62, [("t", 0, -24, 0)], cast, bevel=1.2))
    # 60-degree twin V12 cylinder banks + brushed aluminum overhead-cam valve covers + 6-into-1 cast exhaust manifolds!
    for sz in (-1, 1):
        parts.append(mk_box(f"mv_bank_{sz}", 138, 34, 26, [("rx", sz * 0.52), ("t", 0, 6, sz * 24)], cast, bevel=1.0))
        parts.append(mk_box(f"mv_vcov_{sz}", 134, 8, 22, [("rx", sz * 0.52), ("t", 0, 22, sz * 33)], alum, bevel=0.6))
        # Glowing warm orange-brown heat-oxidized 6-into-1 cast-iron exhaust manifolds!
        parts.append(mk_cyl(f"mv_exh_{sz}", 5.6, 5.6, 134, "x", 24, [("t", -2, 10, sz * 40)], exh, bevel=0.4))
        for cx in (-54, -32.4, -10.8, 10.8, 32.4, 54):
            parts.append(mk_cyl(f"mv_hdr_{sz}_{cx}", 3.3, 3.3, 12, "z", 14, [("t", cx, 10, sz * 35)], exh, bevel=0.2))
        # Copper coolant transfer rail along bank
        parts.append(mk_cyl(f"mv_cool_{sz}", 2.0, 2.0, 128, "x", 12, [("t", 0, -4, sz * 36)], cop, bevel=0.15))

    # Hero Maybach HL230 P45 Factory Data Plate mounted flat on right (+Z) crankcase side for cutaway macro!
    parts.append(mk_box("mv_plate", 56, 20, 1.4, [("t", 8, -22, 31.4)], plate))

    # 4 Iconic Solex 52 JFF II downdraft carburetors + twin cylindrical air cleaner plenums atop the V-valley!
    for cx in (-42, -14, 14, 42):
        parts.append(mk_cyl(f"mv_carb_{cx}", 6.4, 5.6, 22, "y", 20, [("t", cx, 24, 0)], alum, bevel=0.35))
        parts.append(mk_cyl(f"mv_cfl_{cx}", 8.2, 8.2, 2.6, "y", 18, [("t", cx, 18, 0)], gear, bevel=0.2))
    parts.append(mk_cyl("mv_plenum", 12.0, 12.0, 118, "x", 28, [("t", 0, 37, 0)], alum, bevel=0.7))
    # Front flywheel bellhousing & PTO coupler (X_local = +70)
    parts.append(mk_cyl("mv_flywheel", 22, 22, 12, "x", 32, [("t", 70, -24, 0)], gear, bevel=0.5))

    # Twin large finned aluminum coolant radiators (left full height; right aft-lower so V12 bank shines in cutaway!)
    parts.append(mk_box("mv_rad_l", 92, 68, 36, [("t", -34, 2, -74)], alum, bevel=0.8))
    parts.append(mk_cyl("mv_fan_l", 24, 24, 10, "y", 28, [("t", -34, 40, -74)], cast, bevel=0.45))
    parts.append(mk_box("mv_rad_r", 60, 40, 34, [("t", -52, -24, 73)], alum, bevel=0.8))

    return join_parts("tiger_maybach_v12", parts, smooth_angle_deg=36.0)


def build_tiger_transmission(mats) -> bpy.types.Object:
    parts = []
    gear = mats["D_GearboxSteel"]
    cast = mats["D_MaybachCast"]
    shaft = mats["D_Driveshaft"]
    cop = mats["D_CopperBand"]
    # Maybach Olvar 40 12 16 8-speed semi-auto pre-selector gearbox housing
    parts.append(mk_box("tx_olvar", 68, 46, 68, [("t", -14, 0, 0)], gear, bevel=1.2))
    # Hydraulic pre-selector valve block + copper oil lines on top
    parts.append(mk_box("tx_valve", 32, 6, 36, [("t", -14, 20, 0)], cast, bevel=0.4))
    parts.append(mk_cyl("tx_oil1", 2.0, 2.0, 54, "x", 12, [("t", 8, 18, 22)], cop, bevel=0.15))
    # Henschel L600C dual-radius regenerative steering differential (forward)
    parts.append(mk_box("tx_l600c", 44, 44, 88, [("t", 38, -2, 0)], cast, bevel=1.1))
    # Massive transverse left/right final-drive shafts & ventilated steering disc brake drums!
    parts.append(mk_cyl("tx_axle", 9.5, 9.5, 206, "z", 28, [("t", 46, -12, 0)], shaft, bevel=0.45))
    for sz in (-1, 1):
        parts.append(mk_cyl(f"tx_disc_{sz}", 21.0, 21.0, 14, "z", 28, [("t", 46, -12, sz * 66)], gear, bevel=0.6))
        parts.append(mk_cyl(f"tx_red_{sz}", 16.0, 16.0, 14, "z", 24, [("t", 46, -12, sz * 96)], cast, bevel=0.5))
    return join_parts("tiger_transmission", parts, smooth_angle_deg=36.0)


def build_tiger_driveshaft(mats) -> bpy.types.Object:
    parts = []
    shaft = mats["D_Driveshaft"]
    gear = mats["D_GearboxSteel"]
    cast = mats["D_MaybachCast"]
    parts.append(mk_cyl("ds_tube", 5.2, 5.2, 286, "x", 28, [("t", -1, 0, 0)], shaft, bevel=0.35))
    for fx in (-144, -40, 62, 142):
        parts.append(mk_cyl(f"ds_fl_{fx}", 8.8, 8.8, 10, "x", 24, [("t", fx, 0, 0)], gear, bevel=0.35))
        parts.append(mk_box(f"ds_ykA_{fx}", 8, 17.5, 4.5, [("t", fx, 0, 0)], cast, bevel=0.25))
        parts.append(mk_box(f"ds_ykB_{fx}", 8, 4.5, 17.5, [("t", fx, 0, 0)], cast, bevel=0.25))
    return join_parts("tiger_driveshaft", parts, smooth_angle_deg=36.0)


def build_tiger_turret_basket(mats) -> bpy.types.Object:
    parts = []
    ivory = mats["D_BasketIvory"]
    gear = mats["D_GearboxSteel"]
    shaft = mats["D_Driveshaft"]
    # Suspended circular steel turret floor disc (clear above central driveshaft!)
    parts.append(mk_cyl("tb_floor", 86, 86, 5.5, "y", 48, [("t", 0, -37.2, 0)], ivory, bevel=0.45))
    # Upper mounting collar ring under turret ring
    parts.append(mk_hollow_tube_axis("tb_top_ring", 85.0, 76.0, 35.0, 40.0, "y", 48, bevel=0.35, mat=gear))
    # 4 vertical steel suspension pillars
    for ang in (0.75, 2.39, 3.9, 5.54):
        parts.append(mk_cyl(f"tb_st_{ang:.2f}", 3.4, 3.4, 72, "y", 18, [("t", math.cos(ang) * 78, 0, math.sin(ang) * 78)], gear, bevel=0.25))
    # Boehringer-Sturm hydrostatic turret traverse gearbox & manual gunner crank column
    parts.append(mk_box("tb_trav", 26, 20, 22, [("t", 32, -24, -44)], gear, bevel=0.55))
    parts.append(mk_cyl("tb_col", 4.5, 4.5, 38, "y", 18, [("t", 32, -4, -44)], shaft, bevel=0.25))
    return join_parts("tiger_turret_basket", parts, smooth_angle_deg=36.0)


def _add_88mm_round_parts(parts: list, tag: str, xc: float, yc: float, zc: float, mats, segs: int = 18):
    brass = mats["D_Brass88mm"]
    cop = mats["D_CopperBand"]
    ap = mats["D_ApcbcBlack"]
    # 88x571mmR PzGr. 39 APCBC complete round (92.0 cm total length: local X in [-46, +46])
    parts.append(mk_cyl(f"{tag}_rim", 5.6, 5.6, 1.8, "x", segs, [("t", xc - 45.1, yc, zc)], brass, bevel=0.15))
    parts.append(mk_cyl(f"{tag}_cas", 4.8, 5.2, 55.4, "x", segs, [("t", xc - 16.5, yc, zc)], brass, bevel=0.2))
    parts.append(mk_cyl(f"{tag}_drv", 4.45, 4.45, 2.2, "x", segs, [("t", xc + 12.2, yc, zc)], cop, bevel=0.12))
    parts.append(mk_cyl(f"{tag}_bdy", 4.4, 4.4, 15.0, "x", segs, [("t", xc + 20.8, yc, zc)], ap, bevel=0.15))
    parts.append(mk_cyl(f"{tag}_og1", 2.4, 4.4, 11.5, "x", segs, [("t", xc + 34.0, yc, zc)], ap, bevel=0.15))
    parts.append(mk_cyl(f"{tag}_og2", 0.55, 2.4, 6.2, "x", segs, [("t", xc + 42.9, yc, zc)], ap, bevel=0.1))


def build_tiger_ammo_racks(mats) -> bpy.types.Object:
    parts = []
    oxide = mats["D_RedOxideTank"]
    parts.append(mk_box("ar_bot", 222, 4, 46, [("t", 0, -25, 0)], oxide, bevel=0.4))
    parts.append(mk_box("ar_top", 222, 4, 46, [("t", 0, 25, 0)], oxide, bevel=0.4))
    parts.append(mk_box("ar_back", 222, 52, 4, [("t", 0, 0, -21)], oxide, bevel=0.4))
    for rx in (-108, -2, 108):
        parts.append(mk_box(f"ar_div_{rx}", 4, 52, 46, [("t", rx, 0, 0)], oxide, bevel=0.3))
    idx = 0
    for bay_x in (-56, 56):
        for row_y in (-14, 0, 14):
            for col_z in (-10, 4, 17):
                _add_88mm_round_parts(parts, f"ar_r{idx}", bay_x, row_y, col_z, mats, segs=16)
                idx += 1
    return join_parts("tiger_ammo_racks", parts, smooth_angle_deg=36.0)


def build_tiger_ready_round(mats) -> bpy.types.Object:
    parts = []
    _add_88mm_round_parts(parts, "rr_hero", 0.0, 0.0, 0.0, mats, segs=36)
    return join_parts("tiger_ready_round", parts, smooth_angle_deg=38.0)


def build_tiger_fuel_tanks(mats) -> bpy.types.Object:
    """Twin rear left-sponson 540L welded steel fuel tanks seated strictly ABOVE the hull sponson
    floor shelf (local Y in [-5.5, +34.0] -> world Y in [-13.5, +26.0] >= -15.0 cm, ZERO clip
    below hb_shelf_-1 into tiger_tracks_left!)."""
    parts = []
    oxide = mats["D_RedOxideTank"]
    brass = mats["D_Brass88mm"]
    cop = mats["D_CopperBand"]
    # Twin side-sponson fuel tanks (height 33 cm, local Y in [-5.5, +27.5] -> world Y in [-13.5, +19.5]!)
    parts.append(mk_box("ft_rear", 80, 33, 42, [("t", -46, 11.0, 0)], oxide, bevel=1.0))
    parts.append(mk_box("ft_fwd", 80, 33, 42, [("t", 46, 11.0, 0)], oxide, bevel=1.0))
    # Welded steel baffle strap ribs wrapping both tanks
    for rx_s in (-66, -26, 26, 66):
        parts.append(mk_box(f"ft_str_{rx_s}", 3.0, 33.4, 42.6, [("t", rx_s, 11.0, 0)], oxide, bevel=0.25))
    # Brass filler caps & necks (local Y_max = +34.0 -> world Y = +26.0)
    parts.append(mk_cyl("ft_cap_r", 6.5, 6.5, 8.0, "y", 20, [("t", -46, 30.0, 0)], brass, bevel=0.35))
    parts.append(mk_cyl("ft_cap_f", 6.5, 6.5, 8.0, "y", 20, [("t", 46, 30.0, 0)], brass, bevel=0.35))
    # Copper fuel balance cross-feed pipe along inner face (+Z)
    parts.append(mk_cyl("ft_pipe", 3.2, 3.2, 92, "x", 16, [("t", 0, 14.0, 20.0)], cop, bevel=0.2))
    return join_parts("tiger_fuel_tanks", parts, smooth_angle_deg=36.0)


def build_tiger_crew_stations(mats) -> bpy.types.Object:
    parts = []
    leather = mats["D_LeatherSeat"]
    cast = mats["D_MaybachCast"]
    gear = mats["D_GearboxSteel"]
    dash = mats["D_DashPanel"]

    # 1. Front-Left Driver's Station w/ Iconic Automotive Steering Wheel & Hero Gauge Cluster!
    parts.append(mk_box("cs_d_seat", 34, 8, 34, [("t", 48, -50, -44)], leather, bevel=0.8))
    parts.append(mk_box("cs_d_back", 8, 34, 34, [("t", 34, -30, -44)], leather, bevel=0.8))
    parts.append(mk_cyl("cs_d_col", 3.0, 3.0, 42, "y", 16, [("rz", -0.62), ("t", 78, -32, -44)], cast, bevel=0.25))
    # True hollow 3-spoke automotive steering wheel!
    parts.append(mk_hollow_tube_axis("cs_wheel_rim", 15.5, 12.2, -1.9, 1.9, "y", 32, bevel=0.45, xform=[("rz", -0.62), ("t", 65, -19, -44)], mat=cast))
    for sa in (0.0, 2.094, 4.189):
        parts.append(mk_box(f"cs_spk_{sa:.1f}", 14, 2.0, 2.4, [("ry", sa), ("rz", -0.62), ("t", 65, -19, -44)], gear, bevel=0.2))
    parts.append(mk_box("cs_dash", 14, 18, 34, [("t", 84, -18, -44)], dash, bevel=0.5))

    # 2. Front-Right Radio Operator / Bow MG 34 Station w/ FuG 5 Radio
    parts.append(mk_box("cs_r_seat", 32, 8, 32, [("t", 48, -50, 50)], leather, bevel=0.8))
    parts.append(mk_box("cs_r_back", 8, 30, 32, [("t", 34, -32, 50)], leather, bevel=0.8))
    parts.append(mk_box("cs_fug5", 22, 22, 26, [("t", 74, -18, 52)], cast, bevel=0.55))

    # 3. Turret Commander, Gunner & Loader Seats
    parts.append(mk_box("cs_c_seat", 26, 7, 28, [("t", -110, 58, -40)], leather, bevel=0.7))
    parts.append(mk_box("cs_c_back", 7, 22, 28, [("t", -122, 66, -40)], leather, bevel=0.7))
    parts.append(mk_cyl("cs_c_post", 3.2, 3.2, 52, "y", 14, [("t", -110, 30, -40)], gear, bevel=0.2))

    parts.append(mk_box("cs_g_seat", 26, 7, 28, [("t", -50, 40, -44)], leather, bevel=0.7))
    parts.append(mk_cyl("cs_g_post", 3.2, 3.2, 46, "y", 14, [("t", -50, 16, -44)], gear, bevel=0.2))

    parts.append(mk_box("cs_l_seat", 24, 6, 22, [("t", -68, 30, 56)], leather, bevel=0.6))
    parts.append(mk_cyl("cs_l_post", 2.8, 2.8, 38, "y", 14, [("t", -68, 10, 56)], gear, bevel=0.2))

    return join_parts("tiger_crew_stations", parts, smooth_angle_deg=36.0)


# =============================================================================
# UV Unwrapping & Strict >= 80 px Firewalled Packing (Zero Overlap, Save/Restore!)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    select_face_fn=None,
    skip_face_fn=None,
    margin: float = 0.0042,
    shape_method: str = "CONCAVE",
):
    active_objs: list[bpy.types.Object] = []
    saved_unselected_uvs: dict[str, dict[int, list[tuple[float, float]]]] = {}
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        bm.select_mode = {"FACE"}
        for v in bm.verts:
            v.select = False
        for e in bm.edges:
            e.select = False
        mat_names = [m.name if m else "" for m in o.data.materials]
        sel_count = 0
        unsel_map: dict[int, list[tuple[float, float]]] = {}
        for fi, f in enumerate(bm.faces):
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            if select_face_fn is not None:
                want = bool(select_face_fn(o.name, f, mname))
            elif skip_face_fn is not None:
                want = not bool(skip_face_fn(o.name, f, mname))
            else:
                want = True
            f.select = want
            if want:
                sel_count += 1
            else:
                unsel_map[fi] = [(loop[uv_layer].uv.x, loop[uv_layer].uv.y) for loop in f.loops]
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()
        if sel_count > 0:
            active_objs.append(o)
            saved_unselected_uvs[o.name] = unsel_map

    assert active_objs, f"No faces selected for UV packing into [{u0},{u1}]x[{v0},{v1}]!"
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    select_only(active_objs, active_objs[0])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(62.0),
        island_margin=0.0040,
        area_weight=0.0,
        correct_aspect=True,
        scale_to_bounds=False,
    )
    bpy.ops.uv.pack_islands(
        rotate=True,
        scale=True,
        margin=margin,
        margin_method="SCALED",
        shape_method=shape_method,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du = u1 - u0
    dv = v1 - v0
    pu_min, pu_max, pv_min, pv_max = 1.0, 0.0, 1.0, 0.0
    for o in active_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        unsel_map = saved_unselected_uvs[o.name]
        for fi, f in enumerate(bm.faces):
            if fi in unsel_map:
                # Strictly restore previously packed firewalled UV zones untouched!
                for loop, (su_x, su_y) in zip(f.loops, unsel_map[fi]):
                    loop[uv_layer].uv = (su_x, su_y)
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
    print(f"  [UV-PACK] {len(active_objs):2d} objs ({shape_method:7s}) -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] span=({su:.3f}, {sv:.3f})")
    assert su > 0.20 and sv > 0.20, f"UV packing collapsed! span=({su}, {sv})"


def unwrap_hull_zimmerit_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str):
        if obj_name != "tiger_hull_box" or mat_name != "H_HeroFlank":
            return None
        # Check BOTH Three.js normal AND face-center position so buried inner back-faces NEVER overwrite hero bands!
        c = face.calc_center_median()
        tnx, tnz = face.normal.x, -face.normal.y
        tz = -c.y
        if tnz > 0.85 and tz > 161.5:
            return "flank_right"
        if tnz < -0.85 and tz < -161.5:
            return "flank_left"
        if tnx > 0.85 and c.x > 211.6:
            return "front_plate"
        return None

    EXHAUST_MATS = {"H_RustExhaust", "H_HeatBluedManifold", "H_ExhaustShield"}

    def is_special(n, f, m):
        return (
            classify_hero(n, f, m) is not None
            or m in {"H_InteriorIvory", "H_RubberTire", "H_TrackCleat"}
            or m in EXHAUST_MATS
        )

    # Strict Firewalled 4K UV Zones (>= 80 px moats -> zero bleed across ivory, rust/exhaust, rubber & burnished steel!)
    _smart_unwrap_and_pack_rect(objs, 0.395, 0.670, 0.645, 0.768, select_face_fn=lambda _n, _f, m: m == "H_InteriorIvory")
    _smart_unwrap_and_pack_rect(objs, 0.700, 0.840, 0.645, 0.768, select_face_fn=lambda _n, _f, m: m in EXHAUST_MATS)
    _smart_unwrap_and_pack_rect(objs, 0.868, 0.990, 0.645, 0.768, select_face_fn=lambda _n, _f, m: m == "H_RubberTire")
    _smart_unwrap_and_pack_rect(
        objs, 0.565, 0.765, 0.010, 0.295,
        select_face_fn=lambda _n, _f, m: m == "H_TrackCleat",
        margin=0.0020, shape_method="AABB",
    )

    grp_hull = [o for o in objs if o.name in {"tiger_hull_box", "tiger_engine_deck", "tiger_side_fenders"}]
    grp_tracks = [o for o in objs if o.name in {"tiger_tracks_left", "tiger_tracks_right"}]
    grp_wheels = [o for o in objs if o not in grp_hull and o not in grp_tracks]
    _smart_unwrap_and_pack_rect(grp_hull,   0.010, 0.990, 0.320, 0.615, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_wheels, 0.010, 0.540, 0.010, 0.295, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_tracks, 0.790, 0.990, 0.010, 0.295, skip_face_fn=is_special, margin=0.0020, shape_method="AABB")

    # Project exact 1:1 non-mirrored planar Hero UV bands on hull flanks & front driver plate
    hull = next(o for o in objs if o.name == "tiger_hull_box")
    bm = bmesh.new()
    bm.from_mesh(hull.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in hull.data.materials]
    counts = {"flank_right": 0, "flank_left": 0, "front_plate": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(hull.name, f, mname)
        if tag is None:
            continue
        counts[tag] += 1
        for loop in f.loops:
            tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
            if tag == "flank_right":
                xn = max(0.0, min(1.0, (tx - 15.0) / 180.0))
                yn = max(0.0, min(1.0, (ty - (-7.0)) / 54.0))
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.800 + yn * 0.185)
            elif tag == "flank_left":
                xn = max(0.0, min(1.0, (195.0 - tx) / 180.0))
                yn = max(0.0, min(1.0, (ty - (-7.0)) / 54.0))
                loop[uv_layer].uv = (0.515 + xn * 0.470, 0.800 + yn * 0.185)
            elif tag == "front_plate":
                zn = max(0.0, min(1.0, (38.0 - tz) / 76.0))
                yn = max(0.0, min(1.0, (ty - 12.0) / 36.0))
                loop[uv_layer].uv = (0.015 + zn * 0.345, 0.640 + yn * 0.128)
    bm.to_mesh(hull.data)
    bm.free()
    print(f"  [HERO-UV] hull_zimmerit hits={counts} (zero back-face collision!)")
    assert all(v > 0 for v in counts.values()), f"Missing hull hero faces: {counts}"


def unwrap_turret_88mm_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str):
        if obj_name != "tiger_turret_shell" or mat_name != "T_TurretHero131":
            return None
        c = face.calc_center_median()
        tnz = -face.normal.y
        tz = -c.y
        if tnz > 0.70 and tz > 50.0:
            return "turret_right"
        if tnz < -0.70 and tz < -50.0:
            return "turret_left"
        return None

    def is_special(n, f, m):
        return (
            classify_hero(n, f, m) is not None
            or m in {"T_SapphireLens", "T_InteriorIvory", "T_BrassBasket", "T_ChromePiston"}
        )

    # Strict Firewalls: TZF 9b Sapphire Lenses, Turret Ivory Interior, Brass Basket, Chrome Piston!
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.160, 0.615, 0.750, select_face_fn=lambda _n, _f, m: m == "T_SapphireLens")
    _smart_unwrap_and_pack_rect(objs, 0.200, 0.495, 0.615, 0.750, select_face_fn=lambda _n, _f, m: m == "T_InteriorIvory")
    _smart_unwrap_and_pack_rect(objs, 0.530, 0.760, 0.615, 0.750, select_face_fn=lambda _n, _f, m: m == "T_BrassBasket")
    _smart_unwrap_and_pack_rect(objs, 0.790, 0.985, 0.615, 0.750, select_face_fn=lambda _n, _f, m: m == "T_ChromePiston")

    grp_ext = [o for o in objs if o.name in {"tiger_turret_shell", "tiger_cupola_hatches", "tiger_gun_mantlet", "tiger_main_gun"}]
    grp_int = [o for o in objs if o not in grp_ext]
    _smart_unwrap_and_pack_rect(grp_ext, 0.010, 0.990, 0.300, 0.585, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_int, 0.010, 0.990, 0.010, 0.275, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero "131" UV bands on BOTH curved turret cheeks (X in [-14, +88])
    tur = next(o for o in objs if o.name == "tiger_turret_shell")
    bm = bmesh.new()
    bm.from_mesh(tur.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in tur.data.materials]
    counts = {"turret_right": 0, "turret_left": 0}
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(tur.name, f, mname)
        if tag is None:
            continue
        counts[tag] += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            if tag == "turret_right":
                xn = max(0.0, min(1.0, (tx - (-14.0)) / 102.0))
                yn = max(0.0, min(1.0, (ty - (-31.0)) / 62.0))
                loop[uv_layer].uv = (0.015 + xn * 0.460, 0.785 + yn * 0.200)
            elif tag == "turret_left":
                xn = max(0.0, min(1.0, (88.0 - tx) / 102.0))
                yn = max(0.0, min(1.0, (ty - (-31.0)) / 62.0))
                loop[uv_layer].uv = (0.510 + xn * 0.460, 0.785 + yn * 0.200)
    # Audit that T_InteriorIvory remained 100% locked inside its firewall zone [0.200, 0.495] x [0.615, 0.750]!
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if mname == "T_InteriorIvory":
            for loop in f.loops:
                uv = loop[uv_layer].uv
                assert 0.195 <= uv.x <= 0.500 and 0.610 <= uv.y <= 0.755, f"T_InteriorIvory UV escaped firewall: {uv}"
    bm.to_mesh(tur.data)
    bm.free()
    print(f"  [HERO-UV] turret_88mm '131' hits={counts} (conformal plaques + T_InteriorIvory/Sapphire firewalled!)")
    assert all(v > 0 for v in counts.values()), f"Missing turret '131' hero faces: {counts}"


def unwrap_drivetrain_int_atlas(objs: list[bpy.types.Object]):
    def is_maybach_hero(n, f, m):
        return n == "tiger_maybach_v12" and m == "D_MaybachPlate" and (-f.normal.y) > 0.85

    def is_dash_hero(n, f, m):
        return n == "tiger_crew_stations" and m == "D_DashPanel" and f.normal.x < -0.85

    FIREWALLED = {"D_Brass88mm", "D_CopperBand", "D_ApcbcBlack", "D_ExhaustManif", "D_LeatherSeat"}

    def is_special(n, f, m):
        return is_maybach_hero(n, f, m) or is_dash_hero(n, f, m) or m in FIREWALLED

    # Strict 5-Way Interior Firewalls (>= 55px moats -> zero bleed between brass, copper, black APCBC, orange exhaust & leather!)
    _smart_unwrap_and_pack_rect(objs, 0.480, 0.745, 0.790, 0.985, select_face_fn=lambda _n, _f, m: m == "D_Brass88mm")
    _smart_unwrap_and_pack_rect(objs, 0.785, 0.985, 0.790, 0.985, select_face_fn=lambda _n, _f, m: m == "D_ExhaustManif")
    _smart_unwrap_and_pack_rect(objs, 0.340, 0.560, 0.640, 0.760, select_face_fn=lambda _n, _f, m: m == "D_ApcbcBlack")
    _smart_unwrap_and_pack_rect(objs, 0.595, 0.745, 0.640, 0.760, select_face_fn=lambda _n, _f, m: m == "D_CopperBand")
    _smart_unwrap_and_pack_rect(objs, 0.785, 0.985, 0.640, 0.760, select_face_fn=lambda _n, _f, m: m == "D_LeatherSeat")

    grp_pwr = [o for o in objs if o.name in {"tiger_maybach_v12", "tiger_transmission", "tiger_driveshaft"}]
    grp_rest = [o for o in objs if o not in grp_pwr]
    _smart_unwrap_and_pack_rect(grp_pwr,  0.010, 0.990, 0.320, 0.610, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_rest, 0.010, 0.990, 0.010, 0.295, skip_face_fn=is_special)

    # Project Maybach HL230 Factory Data Plate & Driver Gauge Panel Hero UVs
    mv = next(o for o in objs if o.name == "tiger_maybach_v12")
    bm = bmesh.new()
    bm.from_mesh(mv.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in mv.data.materials]
    mv_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_maybach_hero(mv.name, f, mname):
            continue
        mv_hits += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            xn = max(0.0, min(1.0, (tx - (-20.0)) / 56.0))
            yn = max(0.0, min(1.0, (ty - (-32.0)) / 20.0))
            loop[uv_layer].uv = (0.015 + xn * 0.425, 0.820 + yn * 0.165)
    bm.to_mesh(mv.data)
    bm.free()

    cs = next(o for o in objs if o.name == "tiger_crew_stations")
    bm = bmesh.new()
    bm.from_mesh(cs.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in cs.data.materials]
    cs_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_dash_hero(cs.name, f, mname):
            continue
        cs_hits += 1
        for loop in f.loops:
            ty, tz = loop.vert.co.z, -loop.vert.co.y
            zn = max(0.0, min(1.0, (tz - (-61.0)) / 34.0))
            yn = max(0.0, min(1.0, (ty - (-27.0)) / 18.0))
            loop[uv_layer].uv = (0.015 + zn * 0.285, 0.665 + yn * 0.120)
    bm.to_mesh(cs.data)
    bm.free()
    print(f"  [HERO-UV] drivetrain_int maybach_plate={mv_hits} driver_dash={cs_hits}")
    assert mv_hits > 0 and cs_hits > 0, f"Missing drivetrain hero faces: mv={mv_hits}, cs={cs_hits}"


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
        o.location = (i * 1200.0, 0.0, 0.0)
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
            o.location = (0.0, 3500.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object],
    tmp_dir: Path, atlas_size: int, bake_margin: int,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False, extra_objs_override=None,
    ):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", atlas_size, atlas_size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
        arr = np.empty((atlas_size * atlas_size, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        if not objs_to_bake:
            _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
            _remove_bake_image_nodes(nodes)
            bpy.data.images.remove(img)
            return
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=bake_margin, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({atlas_size}px, {bake_type}, {samples} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.14, 0.12, 0.08, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    # Tank-scale AO ray distance (~32 cm self crevices, ~46 cm exterior contact!)
    scene.world.light_settings.distance = 32.0
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 46.0
    run_bake("ao_ext", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets)

    # Exterior mask pass
    img_m = bpy.data.images.new(f"{prefix}_ext_mask", atlas_size, atlas_size, alpha=False, float_buffer=True)
    img_m.colorspace_settings.name = "Non-Color"
    arr = np.zeros((atlas_size * atlas_size, 4), dtype=np.float32)
    arr[:, 3] = 1.0
    img_m.pixels.foreach_set(arr.ravel())
    if ext_targets:
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
        nodes_m = _attach_bake_image_node({white_mat}, img_m)
        scene.cycles.samples = 1
        select_only(ext_targets, ext_targets[0])
        bpy.ops.object.bake(type="EMIT", margin=bake_margin, use_clear=False)
        _remove_bake_image_nodes(nodes_m)
        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
    bpy.data.images.remove(img_m)


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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 4.5) else "WARN"
        extra = ""
        if o.name in {"tiger_tracks_left", "tiger_tracks_right"}:
            world_ymin = bmin[1] + ASSEMBLED_POS[o.name][1]
            extra = f" world_Y_min={world_ymin:.3f} cm"
            assert abs(world_ymin - (-120.0)) < 0.05, f"{o.name} ground contact drifted: {world_ymin:.3f} cm"
        elif o.name == "tiger_fuel_tanks":
            world_ymin = bmin[1] + ASSEMBLED_POS[o.name][1]
            extra = f" world_Y_min={world_ymin:.3f} cm (sponson clear >= -15.0)"
            assert world_ymin >= -15.0, f"tiger_fuel_tanks pokes below sponson shelf: world_Y_min={world_ymin:.3f} cm"
        print(
            f"  [{status}] {o.name:26s} tris={tris:6d} non_man={non_man:2d} vol={vol:11.1f} "
            f"max_bbox_delta={d_max:.3f} cm{extra}"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.3f} cm")
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"
    assert max_bbox_delta <= 4.5, f"CAD bbox delta exceeded 4.5 cm: {max_bbox_delta:.3f} cm"
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


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1 (4K): tiger1_v3_hull_zimmerit (8 solid parts)
        "tiger_hull_box":           lambda m: build_tiger_hull_box(m),
        "tiger_side_fenders":       lambda m: build_tiger_side_fenders(m),
        "tiger_interleaved_wheels": lambda m: build_tiger_interleaved_wheels(m),
        "tiger_tracks_left":        lambda m: build_tiger_track_belt("tiger_tracks_left", m),
        "tiger_tracks_right":       lambda m: build_tiger_track_belt("tiger_tracks_right", m),
        "tiger_engine_deck":        lambda m: build_tiger_engine_deck(m),
        "tiger_torsion_bars":       lambda m: build_tiger_torsion_bars(m),
        "tiger_turret_ring":        lambda m: build_tiger_turret_ring(m),
        # Suite 2 (4K): tiger1_v3_turret_88mm (8 solid parts)
        "tiger_turret_shell":       lambda m: build_tiger_turret_shell(m),
        "tiger_cupola_hatches":     lambda m: build_tiger_cupola_hatches(m),
        "tiger_gun_mantlet":        lambda m: build_tiger_gun_mantlet(m),
        "tiger_main_gun":           lambda m: build_tiger_main_gun(m),
        "tiger_recoil_cradle":      lambda m: build_tiger_recoil_cradle(m),
        "tiger_breech_block":       lambda m: build_tiger_breech_block(m),
        "tiger_shell_guard":        lambda m: build_tiger_shell_guard(m),
        "tiger_optics_tzf9b":       lambda m: build_tiger_optics_tzf9b(m),
        # Suite 3 (2K): tiger1_v3_drivetrain_int (8 solid parts)
        "tiger_maybach_v12":        lambda m: build_tiger_maybach_v12(m),
        "tiger_transmission":       lambda m: build_tiger_transmission(m),
        "tiger_driveshaft":         lambda m: build_tiger_driveshaft(m),
        "tiger_turret_basket":      lambda m: build_tiger_turret_basket(m),
        "tiger_ammo_racks":         lambda m: build_tiger_ammo_racks(m),
        "tiger_ready_round":        lambda m: build_tiger_ready_round(m),
        "tiger_fuel_tanks":         lambda m: build_tiger_fuel_tanks(m),
        "tiger_crew_stations":      lambda m: build_tiger_crew_stations(m),
    }

    print("[BUILD] Sculpting all 24 solid WWII Tiger I Ausf. E 'Tiger 131' (Plan B 4K + Plan C Flagship) parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    hz_objs = [built[pid] for pid in HULL_ZIMMERIT_PARTS]
    t88_objs = [built[pid] for pid in TURRET_88MM_PARTS]
    di_objs = [built[pid] for pid in DRIVETRAIN_INT_PARTS]
    all_objs = hz_objs + t88_objs + di_objs

    print("[VERIFY] Checking manifoldness, outward normals, ground contact & tight CAD alignment (<= 4.5 cm)...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 2x 4K exterior + 1x 2K interior atlases (firewalled, zero overlap)...")
    unwrap_hull_zimmerit_atlas(hz_objs)
    unwrap_turret_88mm_atlas(t88_objs)
    unwrap_drivetrain_int_atlas(di_objs)

    for label, group in (("hull_zimmerit", hz_objs), ("turret_88mm", t88_objs), ("drivetrain_int", di_objs)):
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
            assert 0.00002 < oa < 0.88, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:16s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.15 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    if "--verify-only" in sys.argv:
        print("[VERIFY-ONLY] All 24 meshes + 3 UV atlases verified! Skipping Cycles bake.")
        return

    with tempfile.TemporaryDirectory(prefix="tiger1_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print(f"[CYCLES] Baking tiger1_v3_hull_zimmerit ({ATLAS_SIZE_EXT}x{ATLAS_SIZE_EXT}, margin={BAKE_MARGIN_EXT}, 8 parts)...")
        bake_atlas_suite("hz", hz_objs, all_objs, tmp_dir, ATLAS_SIZE_EXT, BAKE_MARGIN_EXT)
        print(f"[CYCLES] Baking tiger1_v3_turret_88mm ({ATLAS_SIZE_EXT}x{ATLAS_SIZE_EXT}, margin={BAKE_MARGIN_EXT}, 8 parts)...")
        bake_atlas_suite("t88", t88_objs, all_objs, tmp_dir, ATLAS_SIZE_EXT, BAKE_MARGIN_EXT)
        print(f"[CYCLES] Baking tiger1_v3_drivetrain_int ({ATLAS_SIZE_INT}x{ATLAS_SIZE_INT}, margin={BAKE_MARGIN_INT}, 8 parts)...")
        bake_atlas_suite("di", di_objs, all_objs, tmp_dir, ATLAS_SIZE_INT, BAKE_MARGIN_INT)

        # Export Draco GLB BEFORE --postprocess so adaptive WebP encoding knows exact GLB byte size!
        export_draco_glb(all_objs)

        print("[POST] Compositing 4K Bovington '131', Balkenkreuz, Zimmerit relief, Maybach plate & adaptive ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR), str(MODELS_OUT)],
            check=True,
        )

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "tiger1_v3_hull_zimmerit_albedo.webp",
        TEX_OUT_DIR / "tiger1_v3_hull_zimmerit_normal.webp",
        TEX_OUT_DIR / "tiger1_v3_hull_zimmerit_roughness.webp",
        TEX_OUT_DIR / "tiger1_v3_turret_88mm_albedo.webp",
        TEX_OUT_DIR / "tiger1_v3_turret_88mm_normal.webp",
        TEX_OUT_DIR / "tiger1_v3_turret_88mm_roughness.webp",
        TEX_OUT_DIR / "tiger1_v3_drivetrain_int_albedo.webp",
        TEX_OUT_DIR / "tiger1_v3_drivetrain_int_normal.webp",
        TEX_OUT_DIR / "tiger1_v3_drivetrain_int_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== WWII TIGER I AUSF. E 'TIGER 131' (88MM KwK 36 L/56) PLAN B+C 4K ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:44s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (strict budget <= 11.80 MB / hard <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 11.80, f"Asset budget exceeded: {total_mb:.2f} MB > 11.80 MB"


if __name__ == "__main__":
    main()
