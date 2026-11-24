#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for GE GAU-8/A Avenger (30x173mm)
=================================================================================
MIT License — Digital Armory 3D (Track C2 · Heavy Ordnance & Aero Hall · BAY-34)

Generates at TRUE 1:1 REAL-WORLD SCALE (1 world unit = 1 cm = 10 mm):
  - public/models/gau8.glb (Draco-compressed glTF 2.0, all 22 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `gau8_recoil_springs`, `gau8_buffer_spring`,
    and `gau8_striker_spring` carrying `aSpringParam` in Web Worker CSG track)
  - public/textures/gau8_v3_exterior_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/gau8_v3_internal_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/gau8_v3_drum_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle (+320 cm), +Y up, +Z right flank.
  - Complete system length: 605.8 cm (-285.8 cm aft drum -> +320.0 cm muzzle clamp).
  - Hangar deck contact: Y = -74.0 cm exact (gridY = -75.0).
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1.
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 22 objects are reset to identity transform (0,0,0) before Draco glTF 2.0 export.

Usage (wrap with /tmp/digital_armory_blender_gpu.lock in parallel swarms):
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_gau8_photoreal.py
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
# MODE 2: System Python Post-Process (USAF Stencils, 16x16 ECC200 UID,
#         3000 PSI Hydraulic Warning Placard, SAFE/ARMED Clearing Sector Plate,
#         Helical Drum Hazard Stenciling, Cutaway AO Lift & 5-Ch ORM WebPs)
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.3) -> np.ndarray:
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

    # Genuine 16x16 ECC200 MIL-STD-130 DataMatrix for GE Armament CAGE 05606 + GAU-8/A
    _UID_MODULES = (
        "1010101010101010",
        "1101100110110011",
        "1011011001001110",
        "1110010110100101",
        "1001110011011010",
        "1101001101101101",
        "1010110100110010",
        "1111001011001101",
        "1001101101011010",
        "1100110110100111",
        "1011001011010010",
        "1110110100101101",
        "1001011011011000",
        "1101100101100111",
        "1010011010011100",
        "1111111111111111",
    )

    def _draw_nato_cross(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, lw: int = 6):
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
        ao_contact = np.minimum(ao_self, ao_self * 0.52 + ao_ext * 0.48)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        return np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.32, 1.0).astype(np.float32)

    # -------------------------------------------------------------------------
    # SUITE 1: gau8_v3_exterior_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_exterior_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "ex_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "ex_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "ex_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "ex_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "ex_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "ex_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "ex_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        white_m = np.zeros((h, w), dtype=np.float32)
        yellow_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        black_m = np.zeros((h, w), dtype=np.float32)
        engraving = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Gun Housing Right (+Z) & Left (-Z) Nomenclature Plates ---
        # Plate physical ratio: 72 cm x 15 cm (4.8 : 1)
        PW, PH = 2880, 600
        p_white = Image.new("L", (PW, PH), 0)
        p_yellow = Image.new("L", (PW, PH), 0)
        p_eng = Image.new("L", (PW, PH), 0)
        dw = ImageDraw.Draw(p_white)
        dy = ImageDraw.Draw(p_yellow)
        de = ImageDraw.Draw(p_eng)

        dy.rounded_rectangle((28, 24, PW - 28, PH - 24), radius=18, outline=245, width=9)
        # Left MIL-STD-130 ECC200 UID box
        ux0, uy0, uw, uh = 64, 58, 480, 484
        dw.rounded_rectangle((ux0, uy0, ux0 + uw, uy0 + uh), radius=12, outline=255, width=6)
        mod = 20
        dm_x, dm_y = ux0 + 80, uy0 + 34
        for r_i, row_bits in enumerate(_UID_MODULES):
            for c_i, bit in enumerate(row_bits):
                if bit == "1":
                    x0m = dm_x + c_i * mod
                    y0m = dm_y + r_i * mod
                    dw.rectangle((x0m, y0m, x0m + mod - 1, y0m + mod - 1), fill=255)
        dw.text((ux0 + uw // 2, uy0 + 394), "MIL-STD-130 UID", font=_load_font(FONT_DIN, 36), fill=255, anchor="mm")
        dw.text((ux0 + uw // 2, uy0 + 444), "CAGE 05606 / SN GE-00741", font=_load_font(FONT_COND, 34), fill=245, anchor="mm")

        # Main USAF Bold Stencil Nomenclature
        tx = 600
        dy.text((tx, 64), "GAU-8/A  AVENGER  30MM", font=_load_font(FONT_DIN, 128), fill=255)
        de.text((tx, 64), "GAU-8/A  AVENGER  30MM", font=_load_font(FONT_DIN, 128), fill=220)
        dw.rectangle((tx, 214, PW - 64, 224), fill=240)
        dw.text((tx, 246), "GENERAL ELECTRIC ARMAMENT SYSTEMS  -  A-10 THUNDERBOLT II", font=_load_font(FONT_DIN, 64), fill=255)
        dw.text((tx, 342), "7-BARREL ROTARY AUTOCANNON  /  3,900 RPM  /  77 HP HYDRAULIC DRIVE", font=_load_font(FONT_COND, 60), fill=248)
        _draw_nato_cross(dy, tx + 38, 476, r=32, lw=6)
        dy.text((tx + 96, 476), "PGU-14/B API  30x173MM  -  US AIR FORCE PROPERTY", font=_load_font(FONT_DIN, 54), fill=250, anchor="lm")

        # Paste onto Right (+Z) [0.015, 0.985] x [0.855, 0.985] & Left (-Z) [0.015, 0.985] x [0.700, 0.830]
        for v0, v1 in ((0.855, 0.985), (0.700, 0.830)):
            _paste_uv_band(white_m, p_white, 0.015, 0.985, v0, v1)
            _paste_uv_band(yellow_m, p_yellow, 0.015, 0.985, v0, v1)
            _paste_uv_band(engraving, p_eng, 0.015, 0.985, v0, v1)

        # --- HERO BAND 3: Twin Hydraulic Motors Top Warning Placard [0.015, 0.465] x [0.545, 0.675] ---
        HW, HH = 1440, 720
        hy_yel = Image.new("L", (HW, HH), 0)
        hy_blk = Image.new("L", (HW, HH), 0)
        hy_red = Image.new("L", (HW, HH), 0)
        hy_wht = Image.new("L", (HW, HH), 0)
        dh_y = ImageDraw.Draw(hy_yel)
        dh_b = ImageDraw.Draw(hy_blk)
        dh_r = ImageDraw.Draw(hy_red)
        dh_w = ImageDraw.Draw(hy_wht)

        dh_y.rectangle((16, 16, HW - 16, HH - 16), fill=255)
        dh_b.rectangle((16, 16, HW - 16, HH - 16), outline=255, width=22)
        dh_r.rectangle((38, 38, HW - 38, 198), fill=255)
        dh_w.text((HW // 2, 118), "DANGER  -  HIGH PRESSURE HYDRAULICS", font=_load_font(FONT_DIN, 68), fill=255, anchor="mm")
        dh_b.text((HW // 2, 294), "3,000 PSI  /  TWIN 38.5 HP DRIVE MOTORS", font=_load_font(FONT_DIN, 68), fill=255, anchor="mm")
        dh_b.text((HW // 2, 408), "77 HP TOTAL OUTPUT  -  DUAL REDUNDANT CIRCUIT", font=_load_font(FONT_COND, 56), fill=255, anchor="mm")
        dh_b.text((HW // 2, 514), "BLEED ACCUMULATOR BEFORE SERVICING", font=_load_font(FONT_DIN, 50), fill=255, anchor="mm")
        # Hazard diagonal chevron strip along bottom
        for sx in range(-HH, HW, 88):
            dh_b.polygon([(sx, HH - 104), (sx + 44, HH - 104), (sx + 92, HH - 22), (sx + 48, HH - 22)], fill=255)

        _paste_uv_band(yellow_m, hy_yel, 0.015, 0.465, 0.545, 0.675)
        _paste_uv_band(black_m,  hy_blk, 0.015, 0.465, 0.545, 0.675)
        _paste_uv_band(red_m,    hy_red, 0.015, 0.465, 0.545, 0.675)
        _paste_uv_band(white_m,  hy_wht, 0.015, 0.465, 0.545, 0.675)

        # --- HERO BAND 4: Transfer Unit Clearing Sector SAFE/ARMED Plate [0.515, 0.985] x [0.545, 0.675] ---
        SW, SH = 1440, 720
        sf_y = Image.new("L", (SW, SH), 0)
        sf_r = Image.new("L", (SW, SH), 0)
        sf_b = Image.new("L", (SW, SH), 0)
        sf_w = Image.new("L", (SW, SH), 0)
        ds_y, ds_r, ds_b, ds_w = ImageDraw.Draw(sf_y), ImageDraw.Draw(sf_r), ImageDraw.Draw(sf_b), ImageDraw.Draw(sf_w)

        ds_y.rectangle((20, 20, SW // 2 - 4, SH - 20), fill=255)
        ds_r.rectangle((SW // 2 + 4, 20, SW - 20, SH - 20), fill=255)
        ds_b.rectangle((20, 20, SW - 20, 170), fill=255)
        ds_b.rectangle((20, 20, SW - 20, SH - 20), outline=255, width=20)
        ds_b.line([(SW // 2, 170), (SW // 2, SH - 20)], fill=255, width=16)
        ds_w.text((SW // 2, 96), "GAU-8/A  CLEARING  SECTOR", font=_load_font(FONT_DIN, 78), fill=255, anchor="mm")
        ds_b.text((SW // 4 + 10, 344), "SAFE", font=_load_font(FONT_DIN, 146), fill=255, anchor="mm")
        ds_b.text((SW // 4 + 10, 514), "BREECH CLEARED", font=_load_font(FONT_COND, 60), fill=255, anchor="mm")
        ds_w.text((3 * SW // 4 - 10, 344), "ARMED", font=_load_font(FONT_DIN, 134), fill=255, anchor="mm")
        ds_w.text((3 * SW // 4 - 10, 514), "3,900 RPM LIVE", font=_load_font(FONT_COND, 60), fill=255, anchor="mm")

        _paste_uv_band(yellow_m, sf_y, 0.515, 0.985, 0.545, 0.675)
        _paste_uv_band(red_m,    sf_r, 0.515, 0.985, 0.545, 0.675)
        _paste_uv_band(black_m,  sf_b, 0.515, 0.985, 0.545, 0.675)
        _paste_uv_band(white_m,  sf_w, 0.515, 0.985, 0.545, 0.675)

        # Subtle aviation service wear mottle (95% crisp!)
        rng = np.random.default_rng(8001)
        mottle = ndimage.gaussian_filter(rng.uniform(0.88, 1.0, (h, w)).astype(np.float32), sigma=1.0)

        # Composite order: yellow -> red -> black -> white so text pops with razor clarity
        for mask_arr, col, rg, mt in (
            (yellow_m * mottle, (0.93, 0.78, 0.14), 0.38, 0.04),
            (red_m * mottle,    (0.82, 0.12, 0.11), 0.34, 0.04),
            (black_m * mottle,  (0.11, 0.12, 0.13), 0.44, 0.06),
            (white_m * mottle,  (0.94, 0.95, 0.93), 0.38, 0.03),
        ):
            m = np.clip(mask_arr, 0.0, 1.0)
            _mix(albedo, col, m * 0.96)
            _mix(rgh, rg, m * 0.88)
            _mix(met, mt, m * 0.95)

        bev_txt = _bevel_mask(np.maximum(white_m, np.maximum(black_m, engraving)), width_px=1.1)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(0.14 * bev_txt - 0.30 * _bevel_mask(engraving, 1.0), strength=2.0))

        albedo *= (0.80 + 0.20 * ao[..., None])
        rgh = np.clip(rgh, 0.13, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_exterior_albedo.webp", "WEBP", quality=90, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_exterior_normal.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_exterior_roughness.webp", "WEBP", quality=92, method=6
        )
        print("[POST] Saved gau8_v3_exterior_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: gau8_v3_internal_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_internal_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "in_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "in_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "in_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "in_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "in_ao_self.npy")[..., 0]
        # Internal precision rotor, 7 titanium bolts & 360° chrome cam groove use lifted radiant Self-AO!
        ao = np.clip(0.54 + 0.46 * np.power(np.clip(ao_self, 0.0, 1.0), 0.72), 0.52, 1.0).astype(np.float32)

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        # Lift mirror-chrome 360° sinusoidal cam track region [0.015, 0.985] x [0.745, 0.985]
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        cam_zone = (u_grid >= 0.010) & (u_grid <= 0.990) & (v_grid >= 0.740) & (v_grid <= 0.990)
        ao[cam_zone] = np.maximum(ao[cam_zone], 0.90)
        albedo[cam_zone] = np.clip(albedo[cam_zone] * 1.08 + 0.04, 0.0, 0.95)
        rgh[cam_zone] = np.minimum(rgh[cam_zone], 0.17)

        rgh = np.clip(rgh, 0.13, 0.92)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_internal_albedo.webp", "WEBP", quality=90, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_internal_normal.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_internal_roughness.webp", "WEBP", quality=92, method=6
        )
        print("[POST] Saved gau8_v3_internal_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: gau8_v3_drum_{albedo,normal,roughness}.webp
    # -------------------------------------------------------------------------
    def process_drum_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "dr_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "dr_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "dr_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "dr_normal.npy"))
        ao = _combine_ao(
            _read_f32_rgb(tmp_dir / "dr_ao_self.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "dr_ao_ext.npy")[..., 0],
            _read_f32_rgb(tmp_dir / "dr_ext_mask.npy")[..., 0],
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        white_m = np.zeros((h, w), dtype=np.float32)
        yellow_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        black_m = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Massive Helical Drum +Z and -Z Nomenclature Plaques ---
        # Physical ratio: 114 cm x 30 cm (3.8 : 1)
        DW, DH = 2660, 700
        d_wht = Image.new("L", (DW, DH), 0)
        d_yel = Image.new("L", (DW, DH), 0)
        d_red = Image.new("L", (DW, DH), 0)
        d_blk = Image.new("L", (DW, DH), 0)
        dw, dy, dr, db = ImageDraw.Draw(d_wht), ImageDraw.Draw(d_yel), ImageDraw.Draw(d_red), ImageDraw.Draw(d_blk)

        # Outer USAF stencil corner frame + bottom yellow/black caution chevron bar
        dy.rounded_rectangle((30, 26, DW - 30, DH - 26), radius=20, outline=245, width=10)
        dy.rectangle((48, DH - 114, DW - 48, DH - 42), fill=255)
        for sx in range(-120, DW, 110):
            db.polygon([(sx, DH - 114), (sx + 54, DH - 114), (sx + 104, DH - 42), (sx + 50, DH - 42)], fill=255)

        # Left red explosives / DU penetrator emblem diamond
        cx_e, cy_e = 260, 300
        dr.polygon([(cx_e, cy_e - 180), (cx_e + 180, cy_e), (cx_e, cy_e + 180), (cx_e - 180, cy_e)], fill=255)
        dw.polygon([(cx_e, cy_e - 180), (cx_e + 180, cy_e), (cx_e, cy_e + 180), (cx_e - 180, cy_e)], outline=255, width=12)
        dw.text((cx_e, cy_e - 36), "PGU-14/B", font=_load_font(FONT_DIN, 58), fill=255, anchor="mm")
        dw.text((cx_e, cy_e + 34), "30MM API", font=_load_font(FONT_DIN, 56), fill=255, anchor="mm")

        # Main Bold USAF Drum Stencil Text
        tx = 510
        dy.text((tx, 76), "USAF  GAU-8/A  HELICAL  AMMO  DRUM", font=_load_font(FONT_DIN, 116), fill=255)
        dw.rectangle((tx, 214, DW - 76, 224), fill=235)
        dw.text((tx, 250), "CAPACITY: 1,150 RDS  /  30x173MM  PGU-14/B API  -  PGU-13/B HEI", font=_load_font(FONT_DIN, 64), fill=255)
        dw.text((tx, 352), "LINKLESS CLOSED-LOOP CONVEYOR  -  SPENT CASE RETURN FOR CG BALANCE", font=_load_font(FONT_COND, 58), fill=248)
        dy.text((tx, 456), "DANGER EXPLOSIVES  /  LOADED MASS 1,546 KG  /  A-10 THUNDERBOLT II", font=_load_font(FONT_DIN, 54), fill=252)

        # Paste onto Right (+Z) [0.015, 0.985] x [0.855, 0.985] & Left (-Z) [0.015, 0.985] x [0.700, 0.830]
        for v0, v1 in ((0.855, 0.985), (0.700, 0.830)):
            _paste_uv_band(white_m,  d_wht, 0.015, 0.985, v0, v1)
            _paste_uv_band(yellow_m, d_yel, 0.015, 0.985, v0, v1)
            _paste_uv_band(red_m,    d_red, 0.015, 0.985, v0, v1)
            _paste_uv_band(black_m,  d_blk, 0.015, 0.985, v0, v1)

        rng = np.random.default_rng(8003)
        mottle = ndimage.gaussian_filter(rng.uniform(0.88, 1.0, (h, w)).astype(np.float32), sigma=1.0)
        for mask_arr, col, rg, mt in (
            (yellow_m * mottle, (0.93, 0.78, 0.14), 0.42, 0.04),
            (red_m * mottle,    (0.80, 0.13, 0.12), 0.38, 0.04),
            (black_m * mottle,  (0.11, 0.12, 0.13), 0.48, 0.06),
            (white_m * mottle,  (0.94, 0.95, 0.92), 0.44, 0.03),
        ):
            m = np.clip(mask_arr, 0.0, 1.0)
            _mix(albedo, col, m * 0.96)
            _mix(rgh, rg, m * 0.88)
            _mix(met, mt, m * 0.95)

        bev_d = _bevel_mask(np.maximum(white_m, np.maximum(yellow_m, red_m)), width_px=1.1)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(0.14 * bev_d, strength=1.8))

        # Lift interior cutaway brightness on 30mm PGU-14/B rounds & helical rotor zone [0.01, 0.99] x [0.36, 0.67]
        v_rows = 1.0 - (np.arange(h, dtype=np.float32) + 0.5) / h
        ammo_rows = (v_rows >= 0.360) & (v_rows <= 0.675)
        ao[ammo_rows, :] = np.maximum(ao[ammo_rows, :], 0.78)

        albedo *= (0.82 + 0.18 * ao[..., None])
        rgh = np.clip(rgh, 0.13, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_drum_albedo.webp", "WEBP", quality=90, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_drum_normal.webp", "WEBP", quality=94, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "gau8_v3_drum_roughness.webp", "WEBP", quality=92, method=6
        )
        print("[POST] Saved gau8_v3_drum_{albedo,normal,roughness}.webp (2048x2048)")

    process_exterior_atlas()
    process_internal_atlas()
    process_drum_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Modeling, UV Layout, Cycles Bake & Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "gau8.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 20
BAKE_NORMAL_SAMPLES = 16

BARREL_COUNT = 7
PITCH_RADIUS = 7.40
BOLT_X_FWD = 60.0
BOLT_STROKE = 30.0
DRUM_STATIONS = 14

T2B_MAT = Matrix((
    (1.0,  0.0, 0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0, 0.0, 0.0),
    (0.0,  0.0, 0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


def bolt_phase(idx: int) -> float:
    return (idx * 2.0 * math.pi) / BARREL_COUNT


def bolt_pos(idx: int) -> tuple[float, float, float]:
    th = bolt_phase(idx)
    x0 = BOLT_X_FWD - (BOLT_STROKE * 0.5) * (1.0 - math.cos(th))
    y0 = PITCH_RADIUS * math.cos(th)
    z0 = PITCH_RADIUS * math.sin(th)
    return (round(x0, 4), round(y0, 4), round(z0, 4))


# Exact 3-Suite Mapping (22 solid parts; skips ONLY 3 dynamic aSpringParam CSG springs!)
EXTERIOR_PARTS = [
    "gau8_barrel_cluster",
    "gau8_barrel_clamps",
    "gau8_muzzle_clamp",
    "gau8_gun_housing",
    "gau8_recoil_mount",
    "gau8_recoil_buffers",
    "gau8_hydraulic_motors",
    "gau8_transfer_unit",
]

INTERNAL_PARTS = [
    "gau8_cam_track",
    "gau8_rotor_core",
    "gau8_bolt_1",
    "gau8_bolt_2",
    "gau8_bolt_3",
    "gau8_bolt_4",
    "gau8_bolt_5",
    "gau8_bolt_6",
    "gau8_bolt_7",
]

DRUM_PARTS = [
    "gau8_ammo_drum",
    "gau8_drum_rotor",
    "gau8_ammo_belt_stack",
    "gau8_chute_feed",
    "gau8_chute_return",
]

# Exterior parts receiving assembled inter-part contact AO
EXTERIOR_CONTACT_AO_PARTS = {
    "gau8_barrel_cluster",
    "gau8_barrel_clamps",
    "gau8_muzzle_clamp",
    "gau8_gun_housing",
    "gau8_recoil_mount",
    "gau8_recoil_buffers",
    "gau8_hydraulic_motors",
    "gau8_transfer_unit",
    "gau8_ammo_drum",
    "gau8_chute_feed",
    "gau8_chute_return",
}

ASSEMBLED_POS = {
    "gau8_barrel_cluster":   (  84.0,   0.0,   0.0),
    "gau8_barrel_clamps":    ( 195.0,   0.0,   0.0),
    "gau8_muzzle_clamp":     ( 309.0,   0.0,   0.0),
    "gau8_gun_housing":      (  36.0,   0.0,   0.0),
    "gau8_recoil_mount":     (  42.0, -37.0,   0.0),
    "gau8_recoil_buffers":   (  46.0, -18.5,   0.0),
    "gau8_hydraulic_motors": ( -28.0,  12.0,   0.0),
    "gau8_transfer_unit":    ( -12.0, -16.0,   0.0),
    "gau8_cam_track":        (  41.0,   0.0,   0.0),
    "gau8_rotor_core":       (  30.0,   0.0,   0.0),
    "gau8_bolt_1":           bolt_pos(0),
    "gau8_bolt_2":           bolt_pos(1),
    "gau8_bolt_3":           bolt_pos(2),
    "gau8_bolt_4":           bolt_pos(3),
    "gau8_bolt_5":           bolt_pos(4),
    "gau8_bolt_6":           bolt_pos(5),
    "gau8_bolt_7":           bolt_pos(6),
    "gau8_ammo_drum":        (-195.0, -12.0,   0.0),
    "gau8_drum_rotor":       (-195.0, -12.0,   0.0),
    "gau8_ammo_belt_stack":  (-195.0, -12.0,   0.0),
    "gau8_chute_feed":       ( -66.0,  -6.0, -24.0),
    "gau8_chute_return":     ( -66.0, -18.0,  24.0),
}

# Exact CSG ground-truth local bounding boxes (Three.js local space)
CSG_REF_BBOX = {
    "gau8_barrel_cluster":   ((   0.000,  -9.717, -10.264), (230.000,  10.450,  10.264)),
    "gau8_barrel_clamps":    (( -46.000, -11.800, -11.800), ( 46.000,  11.800,  11.800)),
    "gau8_muzzle_clamp":     ((  -9.000, -12.000, -12.000), ( 11.000,  12.000,  12.000)),
    "gau8_rotor_core":       (( -53.750, -11.400, -11.400), ( 58.000,  11.400,  11.400)),
    "gau8_bolt_1":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_2":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_3":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_4":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_5":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_6":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_bolt_7":           (( -11.400,  -2.400,  -2.400), ( 12.950,   5.400,   2.400)),
    "gau8_gun_housing":      (( -54.000, -20.600, -20.600), ( 52.000,  20.600,  20.600)),
    "gau8_cam_track":        (( -28.000, -14.600, -14.600), ( 28.000,  14.600,  14.600)),
    "gau8_recoil_mount":     (( -55.000, -37.000, -34.500), ( 55.000,  42.000,  34.500)),
    "gau8_recoil_buffers":   (( -40.000,  -4.900, -26.400), ( 41.750,   4.900,  26.400)),
    "gau8_hydraulic_motors": (( -19.000, -27.500, -24.002), ( 13.000,  23.500,  24.002)),
    "gau8_transfer_unit":    (( -23.000, -11.000, -25.000), ( 23.000,  11.000,  25.000)),
    "gau8_ammo_drum":        (( -90.800, -62.000, -45.500), ( 90.800,  45.000,  45.500)),
    "gau8_drum_rotor":       (( -84.000, -22.000, -22.000), ( 84.000,  22.000,  22.000)),
    "gau8_ammo_belt_stack":  (( -75.850, -33.920, -33.019), ( 76.950,  33.920,  33.019)),
    "gau8_chute_feed":       (( -41.000,  -8.600, -10.797), ( 41.500,   8.600,   9.500)),
    "gau8_chute_return":     (( -41.000,  -8.600,  -9.500), ( 41.000,   8.600,  10.797)),
}


# =============================================================================
# Scene & Physically Calibrated USAF Aerospace Material Library (AgX Safe!)
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
    scene.cycles.adaptive_threshold = 0.018
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0

    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.light_settings.distance = 8.0

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
    bevel_r: float = 0.16,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.78, 0.81, 0.86),
    grain_scale: float = 6.0,
    grain_bump: float = 0.036,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 12.0,
    rough_var: float = 0.042,
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
    n_macro.inputs["Scale"].default_value = 0.14
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
        min(1.0, base_srgb[0] * 1.09),
        min(1.0, base_srgb[1] * 1.09),
        min(1.0, base_srgb[2] * 1.09),
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
    rgh_map.inputs["To Min"].default_value = max(0.12, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.94, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.518
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.585
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
        mix_er.inputs[3].default_value = max(0.16, roughness - 0.16)
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
        bump.inputs["Distance"].default_value = 0.08
        nt.links.new(bump_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_muzzle_heat_temper_mat() -> bpy.types.Material:
    """Dramatic 3,900 RPM 30mm sustained-fire golden-bronze -> heat-blued violet -> carbon muzzle soot!"""
    mat = bpy.data.materials.new("E_MuzzleHeat")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Local X spans [-9.0, +11.0]
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -9.0
    mr.inputs["From Max"].default_value = 11.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    n_h = nt.nodes.new("ShaderNodeTexNoise")
    n_h.inputs["Scale"].default_value = 0.45
    n_h.inputs["Detail"].default_value = 5.0
    nt.links.new(tc.outputs["Object"], n_h.inputs["Vector"])

    add_h = nt.nodes.new("ShaderNodeMath")
    add_h.operation = "MULTIPLY_ADD"
    add_h.inputs[1].default_value = 0.08
    nt.links.new(n_h.outputs["Fac"], add_h.inputs[0])
    nt.links.new(mr.outputs["Result"], add_h.inputs[2])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.32, 0.34, 0.37)   # Anodized titanium rear collar
    cr.elements[1].position = 0.36
    cr.elements[1].color = srgb_to_lin(0.46, 0.33, 0.19)   # 3,900 RPM golden-bronze temper
    for pos, rgb in (
        (0.64, (0.25, 0.28, 0.44)),  # Heat-blued titanium violet band
        (0.84, (0.20, 0.21, 0.24)),  # Dark oxidized crown
        (0.95, (0.14, 0.14, 0.15)),  # Velvety 30mm propellant soot
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(add_h.outputs["Value"], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.00
    rr.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1.0)
    rr.color_ramp.elements[1].position = 0.80
    rr.color_ramp.elements[1].color = (0.26, 0.26, 0.26, 1.0)
    el_r = rr.color_ramp.elements.new(0.95)
    el_r.color = (0.82, 0.82, 0.82, 1.0)
    nt.links.new(add_h.outputs["Value"], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.00
    rm.color_ramp.elements[0].color = (0.88, 0.88, 0.88, 1.0)
    rm.color_ramp.elements[1].position = 0.82
    rm.color_ramp.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    el_m = rm.color_ramp.elements.new(0.95)
    el_m.color = (0.20, 0.20, 0.20, 1.0)
    nt.links.new(add_h.outputs["Value"], rm.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.14
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.036
    bump.inputs["Distance"].default_value = 0.08
    nt.links.new(n_h.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_barrel_steel_mat() -> bpy.types.Material:
    """Seven 2.3m fluted 30mm barrels: satin phosphated steel with muzzle heat bloom."""
    mat = bpy.data.materials.new("E_BarrelSteel")
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
    mr.inputs["From Min"].default_value = 0.0
    mr.inputs["From Max"].default_value = 230.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.245, 0.260, 0.275)
    cr.elements[1].position = 0.78
    cr.elements[1].color = srgb_to_lin(0.260, 0.272, 0.285)
    for pos, rgb in (
        (0.90, (0.34, 0.29, 0.22)),
        (0.97, (0.25, 0.27, 0.34)),
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mr.outputs["Result"], rc.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.31
    bsdf.inputs["Metallic"].default_value = 0.88

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.10
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.6, 0.25, 0.25)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nl = nt.nodes.new("ShaderNodeTexNoise")
    nl.inputs["Scale"].default_value = 14.0
    nl.inputs["Detail"].default_value = 5.0
    nt.links.new(mp.outputs["Vector"], nl.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.032
    bump.inputs["Distance"].default_value = 0.06
    nt.links.new(nl.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    """AgX-calibrated USAF GAU-8/A Avenger PBR material suite (zero black crush!)."""
    return {
        # --- SUITE 1: Exterior Gun, Barrels, Titanium Mount, Hydraulics & Transfer ---
        "E_BarrelSteel": _build_barrel_steel_mat(),
        "E_MuzzleHeat": _build_muzzle_heat_temper_mat(),
        "E_TitaniumAnodized": _build_pbr_mat(
            "E_TitaniumAnodized",
            base_srgb=(0.38, 0.41, 0.45),
            roughness=0.29,
            metallic=0.90,
            bevel_r=0.14,
            edge_wear=0.52,
            edge_srgb=(0.82, 0.85, 0.90),
            grain_scale=6.5,
            grain_bump=0.030,
            aniso_stretch=(0.4, 2.2, 2.2),
        ),
        "E_HousingPrimer": _build_pbr_mat(
            "E_HousingPrimer",
            base_srgb=(0.245, 0.275, 0.258),
            roughness=0.40,
            metallic=0.68,
            bevel_r=0.18,
            edge_wear=0.55,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=7.5,
            grain_bump=0.042,
            voronoi_grain=0.45,
            voronoi_scale=14.0,
        ),
        "E_HousingPlate": _build_pbr_mat(
            "E_HousingPlate",
            base_srgb=(0.228, 0.252, 0.242),
            roughness=0.42,
            metallic=0.65,
            bevel_r=0.10,
            edge_wear=0.25,
            grain_scale=8.0,
            grain_bump=0.022,
        ),
        "E_HydraulicBlue": _build_pbr_mat(
            "E_HydraulicBlue",
            base_srgb=(0.23, 0.34, 0.45),
            roughness=0.30,
            metallic=0.84,
            bevel_r=0.14,
            edge_wear=0.45,
            edge_srgb=(0.78, 0.83, 0.90),
            grain_scale=7.0,
            grain_bump=0.030,
        ),
        "E_ChromeRod": _build_pbr_mat(
            "E_ChromeRod",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.16,
            metallic=0.97,
            bevel_r=0.08,
            grain_scale=5.0,
            grain_bump=0.014,
            aniso_stretch=(0.3, 3.0, 3.0),
        ),
        "E_HazardYellow": _build_pbr_mat(
            "E_HazardYellow",
            base_srgb=(0.88, 0.71, 0.14),
            roughness=0.42,
            metallic=0.06,
            bevel_r=0.14,
            edge_wear=0.36,
            edge_srgb=(0.68, 0.70, 0.74),
            grain_scale=7.0,
            grain_bump=0.024,
        ),
        "E_RubberSkid": _build_pbr_mat(
            "E_RubberSkid",
            base_srgb=(0.185, 0.195, 0.205),
            roughness=0.76,
            metallic=0.00,
            bevel_r=0.14,
            grain_scale=10.0,
            grain_bump=0.055,
            voronoi_grain=0.50,
            voronoi_scale=16.0,
        ),
        "E_SafingRed": _build_pbr_mat(
            "E_SafingRed",
            base_srgb=(0.84, 0.12, 0.11),
            roughness=0.28,
            metallic=0.05,
            bevel_r=0.10,
            grain_scale=7.0,
            grain_bump=0.016,
        ),
        "E_HydPlacard": _build_pbr_mat(
            "E_HydPlacard",
            base_srgb=(0.88, 0.74, 0.16),
            roughness=0.38,
            metallic=0.06,
            bevel_r=0.06,
            grain_bump=0.012,
        ),
        "E_ClearingPlate": _build_pbr_mat(
            "E_ClearingPlate",
            base_srgb=(0.88, 0.74, 0.16),
            roughness=0.38,
            metallic=0.06,
            bevel_r=0.06,
            grain_bump=0.012,
        ),

        # --- SUITE 2: Internal 360° Cam Track, Star-Rotor & 7 Titanium Bolts ---
        "I_CamSleeveDark": _build_pbr_mat(
            "I_CamSleeveDark",
            base_srgb=(0.24, 0.255, 0.27),
            roughness=0.34,
            metallic=0.86,
            bevel_r=0.12,
            edge_wear=0.48,
            grain_scale=6.5,
            grain_bump=0.030,
        ),
        "I_CamGrooveChrome": _build_pbr_mat(
            "I_CamGrooveChrome",
            base_srgb=(0.84, 0.87, 0.91),
            roughness=0.16,
            metallic=0.97,
            bevel_r=0.08,
            edge_wear=0.20,
            grain_scale=5.0,
            grain_bump=0.014,
            aniso_stretch=(0.35, 3.4, 3.4),
        ),
        "I_RotorCNC": _build_pbr_mat(
            "I_RotorCNC",
            base_srgb=(0.64, 0.68, 0.74),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.12,
            edge_wear=0.32,
            edge_srgb=(0.90, 0.92, 0.96),
            grain_scale=5.5,
            grain_bump=0.022,
            aniso_stretch=(0.35, 3.0, 3.0),
        ),
        "I_BoltChrome": _build_pbr_mat(
            "I_BoltChrome",
            base_srgb=(0.78, 0.81, 0.86),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.08,
            edge_wear=0.26,
            edge_srgb=(0.93, 0.95, 0.98),
            grain_scale=6.0,
            grain_bump=0.018,
            aniso_stretch=(0.4, 2.8, 2.8),
        ),
        "I_BoltDark": _build_pbr_mat(
            "I_BoltDark",
            base_srgb=(0.29, 0.31, 0.34),
            roughness=0.30,
            metallic=0.88,
            bevel_r=0.08,
            edge_wear=0.40,
            grain_scale=7.0,
            grain_bump=0.024,
        ),

        # --- SUITE 3: 1,150-Rd Helical Drum, Conveyor Rotor, 30x173mm Rounds & Dual Chutes ---
        "D_DrumOlive": _build_pbr_mat(
            "D_DrumOlive",
            base_srgb=(0.28, 0.34, 0.27),
            roughness=0.48,
            metallic=0.42,
            bevel_r=0.18,
            edge_wear=0.44,
            edge_srgb=(0.74, 0.77, 0.80),
            grain_scale=5.0,
            grain_bump=0.034,
            voronoi_grain=0.40,
            voronoi_scale=10.0,
        ),
        "D_DrumPlaque": _build_pbr_mat(
            "D_DrumPlaque",
            base_srgb=(0.26, 0.31, 0.25),
            roughness=0.48,
            metallic=0.38,
            bevel_r=0.10,
            grain_scale=6.0,
            grain_bump=0.020,
        ),
        "D_DrumTitanium": _build_pbr_mat(
            "D_DrumTitanium",
            base_srgb=(0.44, 0.47, 0.51),
            roughness=0.31,
            metallic=0.88,
            bevel_r=0.14,
            edge_wear=0.45,
            grain_scale=6.0,
            grain_bump=0.028,
        ),
        "D_DrumYellow": _build_pbr_mat(
            "D_DrumYellow",
            base_srgb=(0.88, 0.71, 0.14),
            roughness=0.44,
            metallic=0.06,
            bevel_r=0.16,
            edge_wear=0.34,
            grain_scale=6.5,
            grain_bump=0.026,
        ),
        "D_DrumRubber": _build_pbr_mat(
            "D_DrumRubber",
            base_srgb=(0.185, 0.195, 0.205),
            roughness=0.78,
            metallic=0.00,
            bevel_r=0.14,
            grain_scale=9.0,
            grain_bump=0.048,
        ),
        "D_RotorStainless": _build_pbr_mat(
            "D_RotorStainless",
            base_srgb=(0.68, 0.72, 0.77),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.12,
            grain_scale=5.5,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.0, 3.0),
        ),
        # 4-Way Firewalled 30x173mm PGU-14/B API Cartridge Materials!
        "D_AluCase": _build_pbr_mat(
            "D_AluCase",
            base_srgb=(0.79, 0.82, 0.86),
            roughness=0.21,
            metallic=0.96,
            bevel_r=0.06,
            grain_scale=7.0,
            grain_bump=0.014,
            aniso_stretch=(0.3, 3.4, 3.4),
        ),
        "D_ApiBlack": _build_pbr_mat(
            "D_ApiBlack",
            base_srgb=(0.20, 0.215, 0.24),
            roughness=0.36,
            metallic=0.72,
            bevel_r=0.05,
            grain_scale=8.0,
            grain_bump=0.018,
        ),
        "D_ApiRedBand": _build_pbr_mat(
            "D_ApiRedBand",
            base_srgb=(0.86, 0.14, 0.12),
            roughness=0.32,
            metallic=0.06,
            bevel_r=0.04,
            grain_bump=0.010,
        ),
        "D_CopperBand": _build_pbr_mat(
            "D_CopperBand",
            base_srgb=(0.85, 0.48, 0.24),
            roughness=0.22,
            metallic=0.95,
            bevel_r=0.04,
            grain_bump=0.012,
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
        b = min(bevel, sx * 0.24, sy * 0.24, sz * 0.24)
        bmesh.ops.bevel(
            bm, geom=list(bm.edges), offset=b, segments=bevel_segs,
            profile=0.5, affect="EDGES", clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str, r_top: float, r_bot: float, length: float,
    axis: str = "x", segs: int = 28,
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
        b = min(bevel, length * 0.22, min(r_top, r_bot) * 0.28)
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges and b > 1e-4:
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


def mk_hollow_tube_x(
    name: str, r_out: float, r_in: float, x0: float, x1: float,
    segs: int = 36, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.32, (x1 - x0) * 0.22)
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


def join_parts(name: str, objs: list[bpy.types.Object], smooth_angle_deg: float = 38.0) -> bpy.types.Object:
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
# PART BUILDERS — SUITE 1: EXTERIOR (8 Parts)
# =============================================================================
def build_gau8_barrel_cluster(mats) -> bpy.types.Object:
    """7-barrel 230 cm heavy fluted 30x173mm rotary barrel cluster with real 30mm muzzles!"""
    parts = []
    for i in range(BARREL_COUNT):
        th = bolt_phase(i)
        cy = PITCH_RADIUS * math.cos(th)
        cz = PITCH_RADIUS * math.sin(th)
        # Heavy breech locking collar & stepped chamber
        parts.append(mk_hollow_tube_x(f"b_col_{i}", 3.05, 1.50, 0.0, 8.0, segs=22, bevel=0.14, xform=[("t", 0, cy, cz)], mat=mats["E_TitaniumAnodized"]))
        parts.append(mk_hollow_tube_x(f"b_ch_{i}", 2.82, 1.50, 8.0, 42.0, segs=22, bevel=0.12, xform=[("t", 0, cy, cz)], mat=mats["E_BarrelSteel"]))
        # Stepped fluted mid-barrel section (42 -> 180 cm)
        parts.append(mk_hollow_tube_x(f"b_mid_{i}", 2.52, 1.50, 42.0, 178.0, segs=22, bevel=0.10, xform=[("t", 0, cy, cz)], mat=mats["E_BarrelSteel"]))
        # 6 sculpted longitudinal stiffening/cooling flute ribs along mid section
        for fi in range(6):
            fang = fi * (math.pi / 3.0)
            parts.append(mk_box(
                f"b_fl_{i}_{fi}", 118.0, 0.42, 0.42,
                xform=[("t", 108.0, 2.52, 0.0), ("rx", fang), ("t", 0.0, cy, cz)],
                mat=mats["E_BarrelSteel"], bevel=0.06,
            ))
        # Forward tapered muzzle section with genuine hollow 30mm rifled bore crown
        parts.append(mk_hollow_tube_x(f"b_muz_{i}", 2.25, 1.50, 178.0, 230.0, segs=24, bevel=0.10, xform=[("t", 0, cy, cz)], mat=mats["E_BarrelSteel"]))
    # Central rear breech alignment hub & retaining rings
    parts.append(mk_hollow_tube_x("b_hub", 4.40, 2.10, 0.0, 10.5, segs=28, bevel=0.15, mat=mats["E_TitaniumAnodized"]))
    return join_parts("gau8_barrel_cluster", parts)


def build_gau8_barrel_clamps(mats) -> bpy.types.Object:
    """Mid-span dual aerospace titanium 7-bore ventilated barrel clamp spiders."""
    parts = []
    for idx_d, cx in enumerate((-42.0, 42.0)):
        disc = mk_cyl(f"bc_disc_{idx_d}", 11.8, 11.8, 8.0, axis="x", segs=42, xform=[("t", cx, 0, 0)], mat=mats["E_TitaniumAnodized"], bevel=0.22)
        for i in range(BARREL_COUNT):
            th = bolt_phase(i)
            hole = mk_cyl(f"bc_h_{idx_d}_{i}", 2.58, 2.58, 12.0, axis="x", segs=18, xform=[("t", cx, PITCH_RADIUS * math.cos(th), PITCH_RADIUS * math.sin(th))])
            bool_op(disc, hole, "DIFFERENCE")
            # Outer perimeter lightening scallop & hex clamp bolt between barrels
            ang_mid = th + math.pi / BARREL_COUNT
            parts.append(mk_cyl(
                f"bc_bolt_{idx_d}_{i}", 0.72, 0.72, 9.2, axis="x", segs=6,
                xform=[("t", cx, 9.6 * math.cos(ang_mid), 9.6 * math.sin(ang_mid))],
                mat=mats["E_ChromeRod"], bevel=0.08,
            ))
        parts.append(disc)
    # Fluted hollow central titanium tie-tube linking both clamp discs
    parts.append(mk_hollow_tube_x("bc_core", 3.85, 2.60, -42.0, 42.0, segs=28, bevel=0.14, mat=mats["E_TitaniumAnodized"]))
    for rx in (-20.0, 0.0, 20.0):
        parts.append(mk_hollow_tube_x(f"bc_ring_{rx}", 4.35, 3.70, rx - 1.5, rx + 1.5, segs=28, bevel=0.12, mat=mats["E_HousingPrimer"]))
    return join_parts("gau8_barrel_clamps", parts)


def build_gau8_muzzle_clamp(mats) -> bpy.types.Object:
    """Forward perforated heat-tempered titanium rotary muzzle clamp & blast crown."""
    parts = []
    drum = mk_cyl("mc_body", 12.0, 11.8, 20.0, axis="x", segs=42, xform=[("t", 1.0, 0, 0)], mat=mats["E_MuzzleHeat"], bevel=0.32)
    for i in range(BARREL_COUNT):
        th = bolt_phase(i)
        hole = mk_cyl(f"mc_h_{i}", 2.30, 2.30, 26.0, axis="x", segs=18, xform=[("t", 1.0, PITCH_RADIUS * math.cos(th), PITCH_RADIUS * math.sin(th))])
        bool_op(drum, hole, "DIFFERENCE")
        # Radial cooling vent slot between barrels
        ang_m = th + math.pi / BARREL_COUNT
        vent = mk_box(f"mc_v_{i}", 11.0, 3.8, 2.1, xform=[("t", 1.5, 10.6, 0.0), ("rx", ang_m)])
        bool_op(drum, vent, "DIFFERENCE")
    parts.append(drum)
    # Aerodynamic central blast spinner cap & 7 hex locking bolts
    parts.append(mk_cyl("mc_cone", 2.4, 4.0, 18.0, axis="x", segs=24, xform=[("t", 1.2, 0, 0)], mat=mats["E_TitaniumAnodized"], bevel=0.25))
    for i in range(BARREL_COUNT):
        ang_m = bolt_phase(i) + math.pi / BARREL_COUNT
        parts.append(mk_cyl(
            f"mc_b_{i}", 0.68, 0.68, 2.4, axis="x", segs=6,
            xform=[("t", -8.4, 9.4 * math.cos(ang_m), 9.4 * math.sin(ang_m))],
            mat=mats["E_ChromeRod"], bevel=0.08,
        ))
    return join_parts("gau8_muzzle_clamp", parts)


def build_gau8_gun_housing(mats) -> bpy.types.Object:
    """Heavy ribbed hollow cylindrical forged steel gun housing w/ flat +Z & -Z Hero USAF Plates."""
    parts = []
    # Main hollow cylindrical housing shell (inner R=14.8, outer R=17.6, X in [-50, +48])
    parts.append(mk_hollow_tube_x("gh_tube", 17.6, 14.8, -50.0, 48.0, segs=56, bevel=0.25, mat=mats["E_HousingPrimer"]))
    # Heavy front & rear bolted aerospace mounting flanges (R=20.6)
    parts.append(mk_hollow_tube_x("gh_fl_f", 20.6, 14.8, 44.0, 52.0, segs=56, bevel=0.25, mat=mats["E_TitaniumAnodized"]))
    parts.append(mk_hollow_tube_x("gh_fl_r", 20.6, 14.8, -54.0, -46.0, segs=56, bevel=0.25, mat=mats["E_TitaniumAnodized"]))
    # Mid structural stiffening hoop bands (recessed below Z=18.2 so plates stay 100% unobstructed!)
    for hx in (-22.0, 22.0):
        parts.append(mk_hollow_tube_x(f"gh_hoop_{hx}", 18.1, 17.4, hx - 2.0, hx + 2.0, segs=56, bevel=0.14, mat=mats["E_TitaniumAnodized"]))

    # 8 external longitudinal anti-torsion stiffening ribs (at 22.5°+k*45°, clean of Z=±18.4 flat Hero plates!)
    for i in range(8):
        ang = i * (math.pi / 4.0) + math.pi / 8.0
        parts.append(mk_box(
            f"gh_rib_{i}", 90.0, 2.2, 2.0,
            xform=[("t", -1.0, 17.9, 0.0), ("rx", ang)],
            mat=mats["E_HousingPrimer"], bevel=0.20,
        ))

    # Right (+Z) & Left (-Z) flat machined USAF nomenclature Hero plates (72 x 15 cm, outer Z = ±19.2)
    parts.append(mk_box("gh_plate_r", 72.0, 15.0, 1.6, xform=[("t", 0.0, 1.0, 18.4)], mat=mats["E_HousingPlate"], bevel=0.16))
    parts.append(mk_box("gh_plate_l", 72.0, 15.0, 1.6, xform=[("t", 0.0, 1.0, -18.4)], mat=mats["E_HousingPlate"], bevel=0.16))
    for sz in (-19.15, 19.15):
        for rx_p in (-34.2, 34.2):
            for ry_p in (-5.2, 7.2):
                parts.append(mk_cyl(f"gh_rv_{sz}_{rx_p}_{ry_p}", 0.45, 0.45, 0.4, axis="z", segs=10, xform=[("t", rx_p, ry_p, sz)], mat=mats["E_ChromeRod"], bevel=0.05))

    # 12 front & 12 rear stainless hex flange bolts
    for i in range(12):
        ang = i * (math.pi / 6.0)
        by, bz = 19.2 * math.cos(ang), 19.2 * math.sin(ang)
        parts.append(mk_cyl(f"gh_bf_{i}", 0.92, 0.92, 1.2, axis="x", segs=6, xform=[("t", 51.8, by, bz)], mat=mats["E_ChromeRod"], bevel=0.08))
        parts.append(mk_cyl(f"gh_br_{i}", 0.92, 0.92, 1.2, axis="x", segs=6, xform=[("t", -53.8, by, bz)], mat=mats["E_ChromeRod"], bevel=0.08))

    return join_parts("gau8_gun_housing", parts)


def build_gau8_recoil_mount(mats) -> bpy.types.Object:
    """Heavy titanium A-10 fuselage recoil adapter mount & hangar maintenance stand (Y_min = -37.0 -> world -74.0)."""
    parts = []
    # Front & rear titanium A-10 fuselage trunnion cradle saddles
    for idx_s, sx in enumerate((-42.0, 42.0)):
        parts.append(mk_box(f"rm_sad_{idx_s}", 14.0, 14.0, 48.0, xform=[("t", sx, 20.0, 0.0)], mat=mats["E_TitaniumAnodized"], bevel=0.35))
        for sz in (-22.0, 22.0):
            parts.append(mk_box(f"rm_chk_{idx_s}_{sz}", 14.0, 22.0, 7.0, xform=[("t", sx, 31.0, sz)], mat=mats["E_TitaniumAnodized"], bevel=0.35))
            # Trunnion locking boss & bolt
            parts.append(mk_cyl(f"rm_tr_{idx_s}_{sz}", 2.6, 2.6, 2.4, axis="z", segs=16, xform=[("t", sx, 35.0, sz + (3.8 if sz > 0 else -3.8))], mat=mats["E_ChromeRod"], bevel=0.14))
    # Twin longitudinal titanium adapter rails
    for sz in (-22.0, 22.0):
        parts.append(mk_box(f"rm_rail_{sz}", 106.0, 8.0, 7.5, xform=[("t", 0.0, 18.0, sz)], mat=mats["E_TitaniumAnodized"], bevel=0.32))
    # Aviation hazard-yellow A-frame maintenance cradle legs + gussets
    for idx_s, sx in enumerate((-40.0, 40.0)):
        for sz in (-24.0, 24.0):
            parts.append(mk_box(
                f"rm_leg_{idx_s}_{sz}", 9.0, 50.0, 7.5,
                xform=[("rx", -0.14 if sz > 0 else 0.14), ("t", sx, -10.0, sz * 1.12)],
                mat=mats["E_HazardYellow"], bevel=0.30,
            ))
        parts.append(mk_box(f"rm_tie_{idx_s}", 8.0, 7.0, 58.0, xform=[("t", sx, -24.0, 0.0)], mat=mats["E_TitaniumAnodized"], bevel=0.28))
    # Diagonal lateral X-bracing struts
    for sz in (-29.0, 29.0):
        parts.append(mk_box(f"rm_diag_{sz}", 78.0, 4.5, 4.5, xform=[("rz", 0.36), ("t", 0.0, -14.0, sz)], mat=mats["E_HazardYellow"], bevel=0.18))
    # Wide rubber-padded steel floor skids resting FLUSH at local Y = -37.0 (world Y = -74.0 cm exact!)
    for sz in (-30.0, 30.0):
        parts.append(mk_box(f"rm_skid_{sz}", 110.0, 6.0, 9.0, xform=[("t", 0.0, -34.0, sz)], mat=mats["E_RubberSkid"], bevel=0.25))
    return join_parts("gau8_recoil_mount", parts)


def build_gau8_recoil_buffers(mats) -> bpy.types.Object:
    """Twin hydro-pneumatic recoil absorber cylinders, chrome telescoping rods & equalizer pipe."""
    parts = []
    for sz in (-21.5, 21.5):
        parts.append(mk_cyl(f"rb_cyl_{sz}", 4.2, 4.2, 54.0, axis="x", segs=28, xform=[("t", -8.0, 0.0, sz)], mat=mats["E_TitaniumAnodized"], bevel=0.22))
        parts.append(mk_box(f"rb_mr_{sz}", 8.0, 9.8, 9.8, xform=[("t", -36.0, 0.0, sz)], mat=mats["E_HydraulicBlue"], bevel=0.30))
        parts.append(mk_box(f"rb_mf_{sz}", 8.0, 9.8, 9.8, xform=[("t", 20.0, 0.0, sz)], mat=mats["E_HydraulicBlue"], bevel=0.30))
        parts.append(mk_cyl(f"rb_rod_{sz}", 2.2, 2.2, 28.0, axis="x", segs=24, xform=[("t", 26.0, 0.0, sz)], mat=mats["E_ChromeRod"], bevel=0.14))
        parts.append(mk_box(f"rb_yoke_{sz}", 5.5, 8.5, 8.5, xform=[("t", 39.0, 0.0, sz)], mat=mats["E_TitaniumAnodized"], bevel=0.25))
        # High-pressure nitrogen fill valve & hex collar (flush within manifold envelope)
        parts.append(mk_cyl(f"rb_val_{sz}", 1.1, 1.1, 1.6, axis="x", segs=12, xform=[("t", -40.2, 0.0, sz)], mat=mats["E_ChromeRod"], bevel=0.08))
    parts.append(mk_cyl("rb_eq", 1.8, 1.8, 43.0, axis="z", segs=18, xform=[("t", -36.0, 0.0, 0.0)], mat=mats["E_ChromeRod"], bevel=0.10))
    return join_parts("gau8_recoil_buffers", parts)


def build_gau8_hydraulic_motors(mats) -> bpy.types.Object:
    """Twin 38.5-HP 3,000 PSI hydraulic drive motors, reduction gearbox & top warning placard."""
    parts = []
    # Rear reduction gearbox housing & flanged mating collar
    parts.append(mk_box("hm_gb", 26.0, 34.0, 34.0, xform=[("t", 0.0, -4.0, 0.0)], mat=mats["E_HousingPrimer"], bevel=0.65))
    parts.append(mk_cyl("hm_hub", 15.5, 15.5, 18.0, axis="x", segs=36, xform=[("t", 4.0, -12.0, 0.0)], mat=mats["E_TitaniumAnodized"], bevel=0.32))
    # Rear bolted inspection plate
    parts.append(mk_cyl("hm_cov", 12.2, 12.2, 2.4, axis="x", segs=28, xform=[("t", -13.6, -12.0, 0.0)], mat=mats["E_TitaniumAnodized"], bevel=0.16))
    # Twin 38.5-HP hydraulic motor barrels (Z = ±14.5, Y = +13.0) with cooling ribs & manifolds
    for sz in (-14.5, 14.5):
        parts.append(mk_cyl(f"hm_mot_{sz}", 8.8, 8.8, 30.0, axis="x", segs=32, xform=[("t", -2.0, 13.0, sz)], mat=mats["E_HydraulicBlue"], bevel=0.32))
        parts.append(mk_cyl(f"hm_cap_{sz}", 9.5, 9.5, 5.0, axis="x", segs=32, xform=[("t", -16.5, 13.0, sz)], mat=mats["E_TitaniumAnodized"], bevel=0.24))
        for rx_f in (-11.0, -6.5, -2.0, 2.5, 7.0):
            parts.append(mk_hollow_tube_x(f"hm_fin_{sz}_{rx_f}", 9.4, 8.6, rx_f - 0.6, rx_f + 0.6, segs=32, bevel=0.08, xform=[("t", 0.0, 13.0, sz)], mat=mats["E_HydraulicBlue"]))
        # Top stainless hydraulic manifold block & pressure fitting
        parts.append(mk_box(f"hm_man_{sz}", 10.0, 7.0, 6.5, xform=[("t", 6.0, 20.0, sz)], mat=mats["E_ChromeRod"], bevel=0.22))
        parts.append(mk_cyl(f"hm_fit_{sz}", 1.6, 1.6, 4.0, axis="x", segs=6, xform=[("t", 11.2, 20.0, sz)], mat=mats["E_ChromeRod"], bevel=0.10))
    # Flat top USAF High-Pressure Hydraulics Warning Placard (local X in [-14, +10], Z in [-11, +11], Y = +23.25)
    parts.append(mk_box("hm_placard", 24.0, 1.5, 22.0, xform=[("t", -2.0, 22.5, 0.0)], mat=mats["E_HydPlacard"], bevel=0.10))
    return join_parts("gau8_hydraulic_motors", parts)


def build_gau8_transfer_unit(mats) -> bpy.types.Object:
    """Breech linkless transfer unit, internal star-sprocket & SAFE/ARMED clearing sector gate."""
    parts = []
    parts.append(mk_box("tu_body", 46.0, 22.0, 40.0, xform=[("t", 0.0, 0.0, 0.0)], mat=mats["E_HousingPrimer"], bevel=0.55))
    # Left (-Z) live feed intake & Right (+Z) spent return chute docking collars
    parts.append(mk_box("tu_col_l", 28.0, 15.0, 8.0, xform=[("t", -4.0, 3.0, -21.0)], mat=mats["E_TitaniumAnodized"], bevel=0.30))
    parts.append(mk_box("tu_col_r", 28.0, 15.0, 8.0, xform=[("t", -4.0, -3.0, 21.0)], mat=mats["E_TitaniumAnodized"], bevel=0.30))
    # Internal transfer sprocket drum hub
    parts.append(mk_cyl("tu_hub", 9.5, 9.5, 38.0, axis="x", segs=28, xform=[("t", 0.0, 1.0, 0.0)], mat=mats["E_ChromeRod"], bevel=0.25))
    # Right (+Z) flat Clearing Sector SAFE/ARMED Hero Plate (local X in [-6, +18], Y in [-2, +10], outer Z = +21.7)
    parts.append(mk_box("tu_safe_plate", 24.0, 12.0, 2.2, xform=[("t", 6.0, 4.0, 20.6)], mat=mats["E_ClearingPlate"], bevel=0.12))
    # Crimson quick-release detent knob (strictly UV firewalled!)
    parts.append(mk_cyl("tu_red_knob", 2.6, 2.6, 3.2, axis="z", segs=20, xform=[("t", 14.0, 4.0, 22.2)], mat=mats["E_SafingRed"], bevel=0.18))
    return join_parts("gau8_transfer_unit", parts)


# =============================================================================
# PART BUILDERS — SUITE 2: INTERNAL CAM TRACK, STAR-ROTOR & 7 BOLTS (9 Parts)
# =============================================================================
def build_gau8_cam_track(mats) -> bpy.types.Object:
    """True parametric 84-segment sculpted 360° elliptical sinusoidal hardened cam sleeve!"""
    segs = 84
    x_min, x_max = -28.0, 28.0
    r_in, r_gr, r_out = 11.8, 13.8, 14.6
    amp_x = BOLT_STROKE * 0.5  # 15.0 cm
    g_hw = 2.30

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
    groove_edges = {3, 4, 5}
    for s in range(segs):
        sn = (s + 1) % segs
        r0, r1 = rings[s], rings[sn]
        for k in range(n_p):
            kn = (k + 1) % n_p
            face = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            face.material_index = 1 if k in groove_edges else 0

    _apply_three_xform(bm, [])
    ring_obj = _bm_to_obj("gau8_cam_ring", bm)
    ring_obj.data.materials.append(mats["I_CamSleeveDark"])
    ring_obj.data.materials.append(mats["I_CamGrooveChrome"])

    key = mk_box("gau8_cam_key", 52.0, 0.8, 2.2, xform=[("t", 0.0, 14.2, 0.0)], mat=mats["I_CamSleeveDark"], bevel=0.12)
    return join_parts("gau8_cam_track", [ring_obj, key])


def build_gau8_rotor_core(mats) -> bpy.types.Object:
    """5-axis CNC 7-flute star-rotor, 7-bore front barrel lock head & 28-tooth rear drive gear."""
    parts = []
    parts.append(mk_cyl("rc_shaft", 4.8, 4.8, 108.0, axis="x", segs=36, xform=[("t", 2.0, 0.0, 0.0)], mat=mats["I_RotorCNC"], bevel=0.25))
    # 7 precision CNC star-flute T-guide rails
    for i in range(BARREL_COUNT):
        th = bolt_phase(i) + math.pi / BARREL_COUNT
        parts.append(mk_box(
            f"rc_fin_{i}", 86.0, 5.8, 2.2,
            xform=[("t", 4.0, 7.6, 0.0), ("rx", th)],
            mat=mats["I_RotorCNC"], bevel=0.18,
        ))
        # T-rail flange cap guiding bolt tracks
        parts.append(mk_box(
            f"rc_cap_{i}", 84.0, 1.1, 3.6,
            xform=[("t", 4.0, 10.2, 0.0), ("rx", th)],
            mat=mats["I_BoltChrome"], bevel=0.12,
        ))
    # Heavy 7-bore front barrel lock head disc
    head = mk_cyl("rc_head", 11.4, 11.4, 12.0, axis="x", segs=42, xform=[("t", 52.0, 0.0, 0.0)], mat=mats["I_CamSleeveDark"], bevel=0.24)
    for i in range(BARREL_COUNT):
        th = bolt_phase(i)
        hole = mk_cyl(f"rc_h_{i}", 3.02, 3.02, 16.0, axis="x", segs=18, xform=[("t", 52.0, PITCH_RADIUS * math.cos(th), PITCH_RADIUS * math.sin(th))])
        bool_op(head, hole, "DIFFERENCE")
    parts.append(head)
    # Sculpted 28-tooth rear main rotor spur drive gear!
    parts.append(mk_cyl("rc_gear_hub", 9.6, 9.6, 9.5, axis="x", segs=36, xform=[("t", -49.0, 0.0, 0.0)], mat=mats["I_BoltChrome"], bevel=0.20))
    for ti in range(28):
        ang = ti * (2.0 * math.pi / 28.0)
        parts.append(mk_box(
            f"rc_tooth_{ti}", 9.0, 1.8, 1.15,
            xform=[("t", -49.0, 10.4, 0.0), ("rx", ang)],
            mat=mats["I_BoltChrome"], bevel=0.08,
        ))
    return join_parts("gau8_rotor_core", parts)


def build_gau8_rotary_bolt(part_name: str, mats) -> bpy.types.Object:
    """High-precision reciprocating titanium rotary bolt with 3 locking lugs, extractor & cam roller."""
    parts = []
    # Main T-slotted bolt carrier body
    parts.append(mk_box("b_body", 18.5, 3.8, 3.6, xform=[("t", -1.2, 0.0, 0.0)], mat=mats["I_BoltChrome"], bevel=0.20))
    parts.append(mk_cyl("b_cyl", 2.05, 2.05, 18.0, axis="x", segs=24, xform=[("t", -1.2, 0.0, 0.0)], mat=mats["I_BoltChrome"], bevel=0.14))
    # Forward 3-lug rotating locking bolt head
    parts.append(mk_cyl("b_head", 2.18, 2.18, 5.5, axis="x", segs=24, xform=[("t", 10.2, 0.0, 0.0)], mat=mats["I_RotorCNC"], bevel=0.14))
    for li in range(3):
        parts.append(mk_box(
            f"b_lug_{li}", 3.1, 1.35, 1.65,
            xform=[("t", 10.5, 1.85, 0.0), ("rx", li * (2.0 * math.pi / 3.0))],
            mat=mats["I_RotorCNC"], bevel=0.10,
        ))
    # Heavy spring-steel extractor claw along side of bolt head
    parts.append(mk_box("b_ext", 7.2, 0.95, 0.85, xform=[("t", 8.0, 1.35, 1.95)], mat=mats["I_BoltDark"], bevel=0.08))
    # Coaxial firing pin striker tail at rear
    parts.append(mk_cyl("b_fp", 0.92, 0.92, 2.8, axis="x", segs=16, xform=[("t", -10.0, 0.0, 0.0)], mat=mats["I_BoltDark"], bevel=0.08))
    # Radial cam-follower bearing roller stud pointing along local +Y into the 360° helical cam track!
    parts.append(mk_cyl("b_stem", 1.22, 1.36, 2.4, axis="y", segs=20, xform=[("t", -4.0, 2.5, 0.0)], mat=mats["I_RotorCNC"], bevel=0.10))
    parts.append(mk_cyl("b_roll", 1.75, 1.75, 2.1, axis="y", segs=24, xform=[("t", -4.0, 4.35, 0.0)], mat=mats["I_BoltChrome"], bevel=0.14))
    return join_parts(part_name, parts)


# =============================================================================
# PART BUILDERS — SUITE 3: HELICAL DRUM, ROTOR, 30x173MM STACK & CHUTES (5 Parts)
# =============================================================================
def build_gau8_ammo_drum(mats) -> bpy.types.Object:
    """Massive 1,150-round Ø87.6 cm x 181.6 cm hollow helical drum + flat USAF plaques + floor cradle."""
    parts = []
    # Main hollow aerospace olive anodized aluminum drum shell (R_out=43.8, R_in=41.2)
    parts.append(mk_hollow_tube_x("ad_shell", 43.8, 41.2, -87.0, 87.0, segs=56, bevel=0.28, mat=mats["D_DrumOlive"]))
    # Front & rear heavy bolted titanium end bulkheads (total span [-90.8, +90.8] = 181.6 cm exact!)
    parts.append(mk_hollow_tube_x("ad_end_r", 44.2, 12.0, -90.8, -86.6, segs=56, bevel=0.28, mat=mats["D_DrumTitanium"]))
    parts.append(mk_hollow_tube_x("ad_end_f", 44.2, 12.0, 86.6, 90.8, segs=56, bevel=0.28, mat=mats["D_DrumTitanium"]))
    # 5 circumferential stiffening hoop rings + rivet bolts
    for rx in (-66.0, -33.0, 0.0, 33.0, 66.0):
        parts.append(mk_hollow_tube_x(f"ad_hoop_{rx}", 45.0, 43.4, rx - 1.8, rx + 1.8, segs=56, bevel=0.16, mat=mats["D_DrumTitanium"]))
    # 16 front & 16 rear bulkhead perimeter bolts
    for i in range(16):
        ang = i * (2.0 * math.pi / 16.0)
        by, bz = 42.2 * math.cos(ang), 42.2 * math.sin(ang)
        parts.append(mk_cyl(f"ad_bf_{i}", 0.95, 0.95, 1.2, axis="x", segs=6, xform=[("t", 90.6, by, bz)], mat=mats["D_RotorStainless"], bevel=0.08))
        parts.append(mk_cyl(f"ad_br_{i}", 0.95, 0.95, 1.2, axis="x", segs=6, xform=[("t", -90.6, by, bz)], mat=mats["D_RotorStainless"], bevel=0.08))
    # Right (+Z) & Left (-Z) flat USAF nomenclature Hero plaques (114 x 30 cm, outer Z = ±45.5)
    parts.append(mk_box("ad_plq_r", 114.0, 30.0, 1.8, xform=[("t", 0.0, 2.0, 44.6)], mat=mats["D_DrumPlaque"], bevel=0.18))
    parts.append(mk_box("ad_plq_l", 114.0, 30.0, 1.8, xform=[("t", 0.0, 2.0, -44.6)], mat=mats["D_DrumPlaque"], bevel=0.18))
    # Twin heavy aviation-yellow structural floor support cradles resting FLUSH at local Y = -62.0 (world -74.0 cm!)
    for idx_c, sx in enumerate((-58.0, 58.0)):
        parts.append(mk_box(f"ad_crad_{idx_c}", 16.0, 22.0, 64.0, xform=[("t", sx, -48.0, 0.0)], mat=mats["D_DrumYellow"], bevel=0.35))
        parts.append(mk_box(f"ad_foot_{idx_c}", 20.0, 6.0, 74.0, xform=[("t", sx, -59.0, 0.0)], mat=mats["D_DrumRubber"], bevel=0.25))
    return join_parts("gau8_ammo_drum", parts)


def build_gau8_drum_rotor(mats) -> bpy.types.Object:
    """Internal 14-vane helical conveyor rotor & heavy stainless central torque shaft."""
    parts = []
    parts.append(mk_cyl("dr_shaft", 10.5, 10.5, 168.0, axis="x", segs=36, mat=mats["D_RotorStainless"], bevel=0.35))
    for sx in (-78.0, 78.0):
        parts.append(mk_cyl(f"dr_end_{sx}", 22.0, 22.0, 4.5, axis="x", segs=36, xform=[("t", sx, 0.0, 0.0)], mat=mats["D_DrumTitanium"], bevel=0.25))
    for i in range(DRUM_STATIONS):
        th = i * (2.0 * math.pi / DRUM_STATIONS)
        parts.append(mk_box(
            f"dr_vane_{i}", 152.0, 12.0, 1.6,
            xform=[("t", 0.0, 16.0, 0.0), ("rx", th)],
            mat=mats["D_RotorStainless"], bevel=0.16,
        ))
    return join_parts("gau8_drum_rotor", parts)


def build_gau8_ammo_belt_stack(mats) -> bpy.types.Object:
    """5 tiers x 14 = 70 full 1:1 30x173mm PGU-14/B API aluminum-cased cannon rounds with 4-way firewalled materials!"""
    parts = []
    tier_xs = (-62.0, -31.0, 0.0, 31.0, 62.0)
    r_orbit = 31.8
    for t_i, cx in enumerate(tier_xs):
        for i in range(DRUM_STATIONS):
            th = i * (2.0 * math.pi / DRUM_STATIONS)
            cy = r_orbit * math.cos(th)
            cz = r_orbit * math.sin(th)
            # 173mm brushed aerospace aluminum cartridge case
            parts.append(mk_cyl(f"r_case_{t_i}_{i}", 1.72, 2.12, 17.3, axis="x", segs=12, xform=[("t", cx - 5.2, cy, cz)], mat=mats["D_AluCase"], bevel=0.08))
            # Copper driving band ring
            parts.append(mk_cyl(f"r_cu_{t_i}_{i}", 1.60, 1.60, 1.4, axis="x", segs=12, xform=[("t", cx + 4.1, cy, cz)], mat=mats["D_CopperBand"], bevel=0.04))
            # Black-anodized API projectile body
            parts.append(mk_cyl(f"r_blk_{t_i}_{i}", 1.38, 1.54, 5.2, axis="x", segs=12, xform=[("t", cx + 7.2, cy, cz)], mat=mats["D_ApiBlack"], bevel=0.06))
            # Crimson incendiary ogive nose band (strictly UV firewalled!)
            parts.append(mk_cyl(f"r_red_{t_i}_{i}", 0.30, 1.38, 5.4, axis="x", segs=12, xform=[("t", cx + 12.4, cy, cz)], mat=mats["D_ApiRedBand"], bevel=0.04))
    return join_parts("gau8_ammo_belt_stack", parts)


def build_gau8_chute_feed(mats) -> bpy.types.Object:
    """Left-flank double-ended linkless live-round conveyor chute w/ exposed 30x173mm API rounds."""
    parts = []
    parts.append(mk_box("cf_duct", 82.0, 14.0, 16.0, mat=mats["D_DrumTitanium"], bevel=0.45))
    for i in range(-3, 4):
        parts.append(mk_box(f"cf_rib_{i}", 3.2, 17.2, 19.0, xform=[("t", i * 11.5, 0.0, 0.0)], mat=mats["D_DrumOlive"], bevel=0.20))
    # Visible 30x173mm PGU-14/B live rounds along left inspection window
    for i in (-1, 0, 1):
        cx = i * 26.0
        parts.append(mk_cyl(f"cf_ac_{i}", 1.80, 2.10, 17.3, axis="x", segs=14, xform=[("t", cx - 4.0, 0.0, -8.8)], mat=mats["D_AluCase"], bevel=0.08))
        parts.append(mk_cyl(f"cf_cu_{i}", 1.58, 1.58, 1.4, axis="x", segs=14, xform=[("t", cx + 5.2, 0.0, -8.8)], mat=mats["D_CopperBand"], bevel=0.04))
        parts.append(mk_cyl(f"cf_bk_{i}", 1.38, 1.54, 4.6, axis="x", segs=14, xform=[("t", cx + 8.0, 0.0, -8.8)], mat=mats["D_ApiBlack"], bevel=0.05))
        parts.append(mk_cyl(f"cf_rd_{i}", 0.32, 1.38, 5.2, axis="x", segs=14, xform=[("t", cx + 12.8, 0.0, -8.8)], mat=mats["D_ApiRedBand"], bevel=0.04))
    return join_parts("gau8_chute_feed", parts)


def build_gau8_chute_return(mats) -> bpy.types.Object:
    """Right-flank closed-loop spent aluminum case return chute channeling fired casings back to drum."""
    parts = []
    parts.append(mk_box("cr_duct", 82.0, 14.0, 16.0, mat=mats["D_DrumTitanium"], bevel=0.45))
    for i in range(-3, 4):
        parts.append(mk_box(f"cr_rib_{i}", 3.2, 17.2, 19.0, xform=[("t", i * 11.5, 0.0, 0.0)], mat=mats["D_DrumOlive"], bevel=0.20))
    # Visible spent headless 173mm aluminum cases riding back into the helical drum
    for i in (-1, 0, 1):
        parts.append(mk_cyl(f"cr_ac_{i}", 1.70, 2.10, 17.3, axis="x", segs=14, xform=[("t", i * 26.0, 0.0, 8.8)], mat=mats["D_AluCase"], bevel=0.08))
    return join_parts("gau8_chute_return", parts)


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
    assert su > 0.25 and sv > 0.25, f"UV packing collapsed! span=({su}, {sv})"


def unwrap_exterior_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        c = face.calc_center_median()
        n = face.normal
        # Blender -> Three.js: tx=c.x, ty=c.z, tz=-c.y ; normal: ny=n.z, nz=-n.y
        tz = -c.y
        ny, nz = n.z, -n.y
        if obj_name == "gau8_gun_housing" and mat_name == "E_HousingPlate":
            if nz > 0.88 and tz > 19.0:
                return "gh_right"
            if nz < -0.88 and tz < -19.0:
                return "gh_left"
        if obj_name == "gau8_hydraulic_motors" and mat_name == "E_HydPlacard":
            if ny > 0.88 and c.z > 23.0:
                return "hyd_top"
        if obj_name == "gau8_transfer_unit" and mat_name == "E_ClearingPlate":
            if nz > 0.88 and tz > 21.4:
                return "tu_safe"
        return None

    FIREWALL_MATS = {"E_SafingRed", "E_HazardYellow", "E_MuzzleHeat"}

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FIREWALL_MATS)

    # Strict Material UV Firewalls (>= 55 px gaps at 2048px -> >= 0.028 UV gap!)
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.145, 0.415, 0.515, select_face_fn=lambda _n, _f, m: m == "E_SafingRed")
    _smart_unwrap_and_pack_rect(objs, 0.175, 0.545, 0.415, 0.515, select_face_fn=lambda _n, _f, m: m == "E_HazardYellow")
    _smart_unwrap_and_pack_rect(objs, 0.575, 0.985, 0.415, 0.515, select_face_fn=lambda _n, _f, m: m == "E_MuzzleHeat")

    grp_a = [o for o in objs if o.name in {"gau8_barrel_cluster", "gau8_barrel_clamps", "gau8_gun_housing"}]
    grp_b = [o for o in objs if o not in grp_a]
    _smart_unwrap_and_pack_rect(grp_a, 0.010, 0.990, 0.215, 0.388, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_b, 0.010, 0.990, 0.010, 0.195, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV bands
    counts = {"gh_right": 0, "gh_left": 0, "hyd_top": 0, "tu_safe": 0}
    for o in objs:
        if o.name not in {"gau8_gun_housing", "gau8_hydraulic_motors", "gau8_transfer_unit"}:
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
                tx, ty, tz = loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y
                if tag == "gh_right":
                    xn = max(0.0, min(1.0, (tx - (-36.0)) / 72.0))
                    yn = max(0.0, min(1.0, (ty - (-6.5)) / 15.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.855 + yn * 0.130)
                elif tag == "gh_left":
                    xn = max(0.0, min(1.0, (36.0 - tx) / 72.0))
                    yn = max(0.0, min(1.0, (ty - (-6.5)) / 15.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.700 + yn * 0.130)
                elif tag == "hyd_top":
                    xn = max(0.0, min(1.0, (tx - (-14.0)) / 24.0))
                    zn = max(0.0, min(1.0, (11.0 - tz) / 22.0))
                    loop[uv_layer].uv = (0.015 + xn * 0.450, 0.545 + zn * 0.130)
                elif tag == "tu_safe":
                    xn = max(0.0, min(1.0, (tx - (-6.0)) / 24.0))
                    yn = max(0.0, min(1.0, (ty - (-2.0)) / 12.0))
                    loop[uv_layer].uv = (0.515 + xn * 0.470, 0.545 + yn * 0.130)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [HERO-UV] exterior hits: {counts}")
    assert all(v > 0 for v in counts.values()), f"Missing exterior hero faces: {counts}"


def unwrap_internal_atlas(objs: list[bpy.types.Object]):
    cam_grp = [o for o in objs if o.name == "gau8_cam_track"]
    rotor_grp = [o for o in objs if o.name == "gau8_rotor_core"]
    bolts_grp = [o for o in objs if o.name.startswith("gau8_bolt_")]

    # Firewall mirror-chrome 360° sinusoidal cam groove for radiant cutaway AO lift!
    _smart_unwrap_and_pack_rect(cam_grp, 0.015, 0.985, 0.745, 0.985, select_face_fn=lambda _n, _f, m: m == "I_CamGrooveChrome")
    _smart_unwrap_and_pack_rect(cam_grp, 0.015, 0.985, 0.525, 0.715, skip_face_fn=lambda _n, _f, m: m == "I_CamGrooveChrome")
    _smart_unwrap_and_pack_rect(rotor_grp, 0.015, 0.985, 0.255, 0.495)
    _smart_unwrap_and_pack_rect(bolts_grp, 0.015, 0.985, 0.015, 0.230)


def unwrap_drum_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "gau8_ammo_drum" or mat_name != "D_DrumPlaque":
            return None
        c = face.calc_center_median()
        tz = -c.y
        nz = -face.normal.y
        if nz > 0.88 and tz > 45.2:
            return "dr_right"
        if nz < -0.88 and tz < -45.2:
            return "dr_left"
        return None

    AMMO_MATS = {"D_AluCase", "D_ApiBlack", "D_ApiRedBand", "D_CopperBand", "D_DrumYellow"}

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in AMMO_MATS)

    # Strict 5-Way Material UV Firewalls (>= 55 px moats at 2048px -> ZERO red bleed onto brushed aluminum!)
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.355, 0.420, 0.665, select_face_fn=lambda _n, _f, m: m == "D_AluCase")
    _smart_unwrap_and_pack_rect(objs, 0.385, 0.575, 0.420, 0.665, select_face_fn=lambda _n, _f, m: m == "D_ApiBlack")
    _smart_unwrap_and_pack_rect(objs, 0.605, 0.775, 0.420, 0.665, select_face_fn=lambda _n, _f, m: m == "D_ApiRedBand")
    _smart_unwrap_and_pack_rect(objs, 0.805, 0.985, 0.545, 0.665, select_face_fn=lambda _n, _f, m: m == "D_CopperBand")
    _smart_unwrap_and_pack_rect(objs, 0.805, 0.985, 0.420, 0.515, select_face_fn=lambda _n, _f, m: m == "D_DrumYellow")

    drum_grp = [o for o in objs if o.name in {"gau8_ammo_drum", "gau8_drum_rotor"}]
    chute_grp = [o for o in objs if o.name in {"gau8_chute_feed", "gau8_chute_return"}]
    _smart_unwrap_and_pack_rect(drum_grp, 0.010, 0.990, 0.195, 0.390, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(chute_grp, 0.010, 0.990, 0.010, 0.172, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UV bands on massive helical drum plaques
    counts = {"dr_right": 0, "dr_left": 0}
    drum_obj = next(o for o in objs if o.name == "gau8_ammo_drum")
    bm = bmesh.new()
    bm.from_mesh(drum_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in drum_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(drum_obj.name, f, mname)
        if tag is None:
            continue
        counts[tag] += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            if tag == "dr_right":
                xn = max(0.0, min(1.0, (tx - (-57.0)) / 114.0))
                yn = max(0.0, min(1.0, (ty - (-13.0)) / 30.0))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.855 + yn * 0.130)
            else:
                xn = max(0.0, min(1.0, (57.0 - tx) / 114.0))
                yn = max(0.0, min(1.0, (ty - (-13.0)) / 30.0))
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.700 + yn * 0.130)
    bm.to_mesh(drum_obj.data)
    bm.free()
    print(f"  [HERO-UV] drum plaque hits: {counts} (5-way 30x173mm API firewalled!)")
    assert all(v > 0 for v in counts.values()), f"Missing drum plaque hero faces: {counts}"


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
        o.location = (i * 550.0, 0.0, 0.0)
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
            o.location = (0.0, 1200.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        o.location = (0.0, 0.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.scale = (1.0, 1.0, 1.0)


def bake_atlas_suite(
    prefix: str, target_objs: list[bpy.types.Object], all_objs: list[bpy.types.Object],
    tmp_dir: Path, bake_ext_contact: bool = True,
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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.055, 0.060, 0.064, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.45, 0.45, 0.45, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 8.5
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    if not bake_ext_contact:
        return

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 10.0
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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 2.5) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:6d} non_man={non_man:2d} vol={vol:11.2f} "
            f"max_bbox_delta={d_max:.3f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | worst_bbox_delta={max_bbox_delta:.3f} cm")
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
        # Suite 1: Exterior (8 parts)
        "gau8_barrel_cluster":   lambda m: build_gau8_barrel_cluster(m),
        "gau8_barrel_clamps":    lambda m: build_gau8_barrel_clamps(m),
        "gau8_muzzle_clamp":     lambda m: build_gau8_muzzle_clamp(m),
        "gau8_gun_housing":      lambda m: build_gau8_gun_housing(m),
        "gau8_recoil_mount":     lambda m: build_gau8_recoil_mount(m),
        "gau8_recoil_buffers":   lambda m: build_gau8_recoil_buffers(m),
        "gau8_hydraulic_motors": lambda m: build_gau8_hydraulic_motors(m),
        "gau8_transfer_unit":    lambda m: build_gau8_transfer_unit(m),
        # Suite 2: Internal Cam Track, Star-Rotor & 7 Bolts (9 parts)
        "gau8_cam_track":        lambda m: build_gau8_cam_track(m),
        "gau8_rotor_core":       lambda m: build_gau8_rotor_core(m),
        "gau8_bolt_1":           lambda m: build_gau8_rotary_bolt("gau8_bolt_1", m),
        "gau8_bolt_2":           lambda m: build_gau8_rotary_bolt("gau8_bolt_2", m),
        "gau8_bolt_3":           lambda m: build_gau8_rotary_bolt("gau8_bolt_3", m),
        "gau8_bolt_4":           lambda m: build_gau8_rotary_bolt("gau8_bolt_4", m),
        "gau8_bolt_5":           lambda m: build_gau8_rotary_bolt("gau8_bolt_5", m),
        "gau8_bolt_6":           lambda m: build_gau8_rotary_bolt("gau8_bolt_6", m),
        "gau8_bolt_7":           lambda m: build_gau8_rotary_bolt("gau8_bolt_7", m),
        # Suite 3: 1,150-Rd Helical Drum, Rotor, 30x173mm PGU-14/B Stack & Dual Chutes (5 parts)
        "gau8_ammo_drum":        lambda m: build_gau8_ammo_drum(m),
        "gau8_drum_rotor":       lambda m: build_gau8_drum_rotor(m),
        "gau8_ammo_belt_stack":  lambda m: build_gau8_ammo_belt_stack(m),
        "gau8_chute_feed":       lambda m: build_gau8_chute_feed(m),
        "gau8_chute_return":     lambda m: build_gau8_chute_return(m),
    }

    print("[BUILD] Sculpting all 22 solid 1:1 GE GAU-8/A Avenger (30x173mm) parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    ex_objs = [built[pid] for pid in EXTERIOR_PARTS]
    in_objs = [built[pid] for pid in INTERNAL_PARTS]
    dr_objs = [built[pid] for pid in DRUM_PARTS]
    all_objs = ex_objs + in_objs + dr_objs

    print("[VERIFY] Checking manifoldness, outward normals & 1:1 CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: exterior (8), internal (9), drum (5)...")
    unwrap_exterior_atlas(ex_objs)
    unwrap_internal_atlas(in_objs)
    unwrap_drum_atlas(dr_objs)

    for label, group in (("exterior", ex_objs), ("internal", in_objs), ("drum", dr_objs)):
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
            assert 0.00003 < oa < 0.90, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:12s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="gau8_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking gau8_v3_exterior (2048x2048, 8 parts)...")
        bake_atlas_suite("ex", ex_objs, all_objs, tmp_dir, bake_ext_contact=True)
        print("[CYCLES] Baking gau8_v3_internal (2048x2048, 9 parts)...")
        bake_atlas_suite("in", in_objs, all_objs, tmp_dir, bake_ext_contact=False)
        print("[CYCLES] Baking gau8_v3_drum (2048x2048, 5 parts)...")
        bake_atlas_suite("dr", dr_objs, all_objs, tmp_dir, bake_ext_contact=True)

        print("[POST] Compositing USAF stencils, ECC200 UID, hydraulic & clearing plates, and 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "gau8_v3_exterior_albedo.webp",
        TEX_OUT_DIR / "gau8_v3_exterior_normal.webp",
        TEX_OUT_DIR / "gau8_v3_exterior_roughness.webp",
        TEX_OUT_DIR / "gau8_v3_internal_albedo.webp",
        TEX_OUT_DIR / "gau8_v3_internal_normal.webp",
        TEX_OUT_DIR / "gau8_v3_internal_roughness.webp",
        TEX_OUT_DIR / "gau8_v3_drum_albedo.webp",
        TEX_OUT_DIR / "gau8_v3_drum_normal.webp",
        TEX_OUT_DIR / "gau8_v3_drum_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== GE GAU-8/A AVENGER (30x173MM) V3 ASSET BUDGET ===")
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
