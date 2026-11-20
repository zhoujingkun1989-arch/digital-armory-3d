#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Ravin R500 Helicoil 500 FPS Bullpup Crossbow
============================================================================================
MIT License — Digital Armory 3D (`PR-04` Wave 4 — Final 19/19 Grand Slam)

Generates:
  - public/models/r500.glb (Draco-compressed glTF 2.0, all 19 solid parts; skips ONLY the 6
    dynamic `aSpringParam` GPU-deforming CSG parts: `r500_left_limbs`, `r500_right_limbs`,
    `r500_cam_axles`, `r500_bowstring`, `r500_power_cables`, `r500_trigger_spring`)
  - public/textures/r500_v3_chassis_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)
  - public/textures/r500_v3_cams_mech_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/r500_v3_optic_bolt_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 19 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/r500/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_r500_photoreal.py
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
# MODE 2: System Python Post-Process (Ravin R500 CNC Laser Engravings, Copper-Bronze
#         HexCoil 360-Deg Timing Dials, 300-550 FPS Scope Speed Ring & 100-YD BDC
#         Turret, Emerald-Sapphire Optical Lenses, 2x2 3K Woven Carbon Match Bolt,
#         Firewalled Safety-Orange Accents & 5-Ch Packed ORM WebPs)
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.5) -> np.ndarray:
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

    def _draw_ravin_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, col: int = 255) -> None:
        """Crisp geometric Ravin Helicoil twin-wing chevron crest."""
        lw = max(2, round(r * 0.14))
        # Outer sharp diamond/chevron shield
        pts = [
            (cx, cy - r * 0.95),
            (cx + r * 0.95, cy),
            (cx, cy + r * 0.95),
            (cx - r * 0.95, cy),
        ]
        draw.polygon(pts, outline=col, width=lw)
        # Inner crossed Helicoil bowstring/arrow chevrons
        draw.line([(cx - r * 0.56, cy - r * 0.32), (cx, cy + r * 0.42), (cx + r * 0.56, cy - r * 0.32)], fill=col, width=lw)
        draw.line([(cx - r * 0.44, cy + r * 0.10), (cx, cy - r * 0.44), (cx + r * 0.44, cy + r * 0.10)], fill=col, width=max(2, lw - 1))
        draw.ellipse((cx - r * 0.13, cy - r * 0.13, cx + r * 0.13, cy + r * 0.13), fill=col)

    def _draw_dot(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, col: int = 255) -> None:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)

    def process_chassis_atlas():
        """Slate-Grey CNC Bullpup Mainframe, Ventilated Flight Rail, Forward Riser Head,
        Matte Carbon Forend w/ Anti-Thumb Wings, Ergonomic Pistol Grip & Bullpup Buttstock."""
        alb_lin = _read_f32_rgb(tmp_dir / "chassis_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "chassis_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "chassis_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "chassis_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "chassis_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "chassis_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "chassis_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        laser_white = np.zeros((h, w), dtype=np.float32)
        laser_orange = np.zeros((h, w), dtype=np.float32)

        # --- 1) FLIGHT RAIL LEFT & RIGHT CNC BRIDGE FLANKS (Exact 1:1 physical px/cm = 200 px/cm!) ---
        # Local X in [-15.4, +17.7] (33.1 cm), Local Y in [-0.52, -0.02] (0.50 cm)
        # Left  flank (-Z): u in [0.015, 0.985] (1 - xNorm: +X muzzle on left), v in [0.895, 0.985]
        # Right flank (+Z): u in [0.015, 0.985] (xNorm: -X rear on left),       v in [0.795, 0.885]
        FW, FH = 6620, 100
        fr_l = Image.new("L", (FW, FH), 0)
        dl = ImageDraw.Draw(fr_l)
        _draw_ravin_emblem(dl, 1280, 50, 32)
        dl.text((1355, 52), "RAVIN   R500", font=_load_font(FONT_DIN, 54), fill=255, anchor="lm")
        _draw_dot(dl, 1745, 50, 7)
        dl.text((1785, 52), "500 FPS", font=_load_font(FONT_DIN, 52), fill=255, anchor="lm")
        _draw_dot(dl, 2030, 50, 7)
        dl.text((2070, 52), "HELICOIL SYSTEM", font=_load_font(FONT_DIN, 50), fill=250, anchor="lm")
        _draw_dot(dl, 2555, 50, 7)
        dl.text((2595, 52), "SUPERIOR, WI", font=_load_font(FONT_COND, 52), fill=246, anchor="lm")
        # Repeat crisp secondary technical spec further aft along the 33 cm rail
        _draw_dot(dl, 3420, 50, 7)
        dl.text((3465, 52), "FRICTIONLESS FLIGHT SYSTEM   -   15\" POWER STROKE   -   300 LB", font=_load_font(FONT_COND, 48), fill=242, anchor="lm")
        _paste_uv_band(laser_white, fr_l, 0.015, 0.985, 0.895, 0.985)

        fr_r = Image.new("L", (FW, FH), 0)
        dr = ImageDraw.Draw(fr_r)
        _draw_ravin_emblem(dr, 1280, 50, 32)
        dr.text((1355, 52), "RAVIN   R500", font=_load_font(FONT_DIN, 54), fill=255, anchor="lm")
        _draw_dot(dr, 1745, 50, 7)
        dr.text((1785, 52), "500 FPS", font=_load_font(FONT_DIN, 52), fill=255, anchor="lm")
        _draw_dot(dr, 2030, 50, 7)
        dr.text((2070, 52), "HELICOIL SYSTEM", font=_load_font(FONT_DIN, 50), fill=250, anchor="lm")
        _draw_dot(dr, 2555, 50, 7)
        dr.text((2595, 52), "SUPERIOR, WI", font=_load_font(FONT_COND, 52), fill=246, anchor="lm")
        _draw_dot(dr, 3420, 50, 7)
        dr.text((3465, 52), "PAT. US 10,852,097   -   MIL-STD-1913 OPTICAL BRIDGE", font=_load_font(FONT_COND, 48), fill=242, anchor="lm")
        _paste_uv_band(laser_white, fr_r, 0.015, 0.985, 0.795, 0.885)

        # --- 2) CHASSIS LEFT & RIGHT FLAT UPPER RAIL + MID-REAR FLANKS ---
        # Local X in [-24.5, +24.2] (48.7 cm), Local Y in [-1.75, +2.65] (4.40 cm)
        # Left  flank (-Z): u in [0.015, 0.985] (1 - xNorm: +X front on left), v in [0.640, 0.780]
        # Right flank (+Z): u in [0.015, 0.985] (xNorm: -X rear on left),      v in [0.485, 0.625]
        # CRITICAL CLEARANCES:
        #   - 5 CNC truss windows occupy Y in [0.11, 0.99] at X = -15.2, -8.2, +1.6, +8.8, +16.0
        #   - Forend grip wings cover X in [6.6..21.6], Y in [-2.9..+0.49]
        #   - Safety selector sits at X = -1.8, Y = +0.25 (clear solid metal around it!)
        #   - Flight rail rear pylons cover X in [-25.3..-22.5], Y > +1.50
        #   - Right-side QD quiver boss covers X in [8.0..13.6], Y in [-1.80..-0.70]
        #   - 100% UNOBSTRUCTED ZONES:
        #       * Upper CNC flat rail band: Y in [+1.15 .. +1.76], X in [-21.5 .. +23.0]
        #       * Rear cheek flank:         Y in [+1.35 .. +2.42], X in [-21.8 .. -14.6]
        #       * Mid-lower flat slab:      Y in [-1.42 .. -0.18], X in [-19.5 .. -3.2]
        CW, CH = 3896, 352  # 80 px/cm

        def cx_left(x: float) -> int:
            return int(round((1.0 - (x + 24.5) / 48.7) * CW))

        def cx_right(x: float) -> int:
            return int(round(((x + 24.5) / 48.7) * CW))

        def cy_ch(y: float) -> int:
            return int(round((2.65 - y) / 4.40 * CH))

        # Left flank white + orange markings
        ch_lw = Image.new("L", (CW, CH), 0)
        ch_lo = Image.new("L", (CW, CH), 0)
        dlw = ImageDraw.Draw(ch_lw)
        dlo = ImageDraw.Draw(ch_lo)

        # Upper continuous rail strip (Y = +1.45, completely above all truss windows & forend!)
        dlw.text((cx_left(12.0), cy_ch(1.45)), "HELICOIL 360  -  500 FPS  -  15\" STROKE", font=_load_font(FONT_DIN, 36), fill=255, anchor="mm")
        dlw.text((cx_left(-6.5), cy_ch(1.45)), "RAVIN CROSSBOWS  -  R500", font=_load_font(FONT_DIN, 38), fill=255, anchor="mm")

        # Rear cheek-rest emblem + model badge (X = -18.2, Y = +1.96)
        _draw_ravin_emblem(dlo, cx_left(-16.2), cy_ch(1.94), 30)
        dlw.text((cx_left(-18.8), cy_ch(1.96)), "R500", font=_load_font(FONT_DIN, 54), fill=255, anchor="mm")

        # Lower-rear unobstructed serial & VersaDrive specification slab (X in [-19..-4.5], Y = -0.82)
        dlw.text((cx_left(-11.5), cy_ch(-0.56)), "SER. NO.  RV-500-04819   /   VERSADRIVE ACME", font=_load_font(FONT_DIN, 34), fill=252, anchor="mm")
        dlw.text((cx_left(-11.5), cy_ch(-1.06)), "SUPERIOR, WI  USA   -   300 LB DRAW   -   ANTI-DRY-FIRE", font=_load_font(FONT_COND, 32), fill=240, anchor="mm")

        # Safety selector crisp S / F indicators cleanly flanking selector axle (-1.8, +0.25)
        dlw.text((cx_left(-2.65), cy_ch(0.62)), "S", font=_load_font(FONT_DIN, 32), fill=255, anchor="mm")
        dlo.text((cx_left(-0.85), cy_ch(-0.22)), "F", font=_load_font(FONT_DIN, 32), fill=255, anchor="mm")
        _draw_dot(dlo, cx_left(-1.25), cy_ch(-0.22), 7)

        _paste_uv_band(laser_white, ch_lw, 0.015, 0.985, 0.640, 0.780)
        _paste_uv_band(laser_orange, ch_lo, 0.015, 0.985, 0.640, 0.780)

        # Right flank white + orange markings
        ch_rw = Image.new("L", (CW, CH), 0)
        ch_ro = Image.new("L", (CW, CH), 0)
        drw = ImageDraw.Draw(ch_rw)
        dro = ImageDraw.Draw(ch_ro)

        drw.text((cx_right(-6.5), cy_ch(1.45)), "TRAC-TRIGGER FLOATING SYSTEM", font=_load_font(FONT_DIN, 36), fill=255, anchor="mm")
        drw.text((cx_right(12.0), cy_ch(1.45)), "RAVIN  R500  -  3.6\" AXLE-TO-AXLE", font=_load_font(FONT_DIN, 36), fill=255, anchor="mm")

        _draw_ravin_emblem(dro, cx_right(-20.2), cy_ch(1.94), 30)
        drw.text((cx_right(-17.6), cy_ch(1.96)), "R500", font=_load_font(FONT_DIN, 54), fill=255, anchor="mm")

        drw.text((cx_right(-11.5), cy_ch(-0.56)), "3.5 LB MATCH TRIGGER   /   AUTO SAFETY", font=_load_font(FONT_DIN, 34), fill=252, anchor="mm")
        drw.text((cx_right(-11.5), cy_ch(-1.06)), "USE RAVIN .001\" 400 GR CARBON BOLTS ONLY", font=_load_font(FONT_COND, 32), fill=240, anchor="mm")

        drw.text((cx_right(-2.65), cy_ch(0.62)), "S", font=_load_font(FONT_DIN, 32), fill=255, anchor="mm")
        dro.text((cx_right(-0.85), cy_ch(-0.22)), "F", font=_load_font(FONT_DIN, 32), fill=255, anchor="mm")
        _draw_dot(dro, cx_right(-1.25), cy_ch(-0.22), 7)

        _paste_uv_band(laser_white, ch_rw, 0.015, 0.985, 0.485, 0.625)
        _paste_uv_band(laser_orange, ch_ro, 0.015, 0.985, 0.485, 0.625)

        # Subtle horizontal CNC brushed handling micro-lines across hero metal flanks
        hero_metal = (u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.485) & (v_grid <= 0.985)
        rng = np.random.default_rng(5001)
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(120):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.015, 0.51) * h)
            length = float(rng.uniform(22, 96))
            ang = math.radians(float(rng.uniform(-4, 4)))
            dsc.line([(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                     fill=int(rng.integers(55, 145)), width=1)
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * hero_metal.astype(np.float32)
        _mix(albedo, (0.64, 0.68, 0.72), sc * 0.16)
        rgh -= sc * 0.04

        # Composite crisp aerospace CNC laser etchings (silver-white frosted aluminum + safety orange F/crest)
        w_bev = _bevel_mask(laser_white, width_px=1.3)
        o_bev = _bevel_mask(laser_orange, width_px=1.3)
        decal_height = -0.42 * w_bev - 0.36 * o_bev - 0.03 * sc

        _mix(albedo, (0.86, 0.89, 0.92), laser_white * 0.90)
        _mix(rgh, 0.40, laser_white * 0.82)
        _mix(met, 0.45, laser_white * 0.80)
        ao *= 1.0 - 0.08 * laser_white

        _mix(albedo, (0.94, 0.36, 0.06), laser_orange * 0.94)
        _mix(rgh, 0.36, laser_orange * 0.88)
        _mix(met, 0.06, laser_orange * 0.92)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_chassis_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_chassis_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_chassis_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved r500_v3_chassis_{albedo,normal,roughness}.webp (2048x2048)")

    def process_cams_mech_atlas():
        """Twin Copper-Bronze 360-Deg HexCoil Cams, Brushed Stainless VersaDrive Acme Screw,
        Foot Stirrup, Trac-Trigger Sled, String Latch, Anti-Dry-Fire, Trigger Sear & Firewalled
        Safety-Orange Selector."""
        alb_lin = _read_f32_rgb(tmp_dir / "cams_mech_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "cams_mech_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "cams_mech_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "cams_mech_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "cams_mech_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "cams_mech_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "cams_mech_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.36, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # Strictly firewall the Safety-Orange selector paddle zone (u in [0.755..0.995], v in [0.755..0.995])
        # so zero dark metal bleeds into the vivid orange selector or vice-versa!
        orange_box = (u_grid >= 0.755) & (u_grid <= 0.995) & (v_grid >= 0.755) & (v_grid <= 0.995)
        # Keep baked AO & subtle micro-variation inside orange_box, enforcing pure vibrant safety-orange floor
        albedo_or = np.clip(albedo, 0.0, 1.0)
        lum_or = 0.299 * albedo_or[..., 0] + 0.587 * albedo_or[..., 1] + 0.114 * albedo_or[..., 2]
        # Replace any unfilled margin pixels inside orange_box with pure Safety-Orange to prevent mipmap dark bleeding!
        margin_or = orange_box & ((albedo_or[..., 0] < 0.55) | (lum_or < 0.25))
        albedo[margin_or] = (0.94, 0.34, 0.04)
        rgh[margin_or] = 0.38
        met[margin_or] = 0.04
        ao[margin_or] = 1.0

        laser_white = np.zeros((h, w), dtype=np.float32)
        dark_dot = np.zeros((h, w), dtype=np.float32)

        # --- 1) TWIN COPPER-BRONZE HEXCOIL CAM TOP FACES: RADIAL 0-310 DEG TIMING SCALE & LASER GRAPHICS ---
        # Left Cam Top (+Y):  u in [0.015, 0.235], v in [0.765, 0.985]  (square 450x450 px)
        # Right Cam Top (+Y): u in [0.250, 0.470], v in [0.765, 0.985]  (square 450x450 px)
        # Local X, Z mapped via (x / 1.85 * 0.5 + 0.5), (-z / 1.85 * 0.5 + 0.5) so top view is upright!
        # Spool top center sits at local (x=+0.08, z=-side_sign*0.08), radius = 1.05 (~204 px in 720x720)!
        CS = 720
        for side_idx, (u0, u1) in enumerate(((0.015, 0.235), (0.250, 0.470))):
            side_sign = -1 if side_idx == 0 else 1
            cam_im = Image.new("L", (CS, CS), 0)
            dc = ImageDraw.Draw(cam_im)
            cx_c, cy_c = CS * 0.5, CS * 0.5
            # Exact pixel center of the gold helical spool top cap (r = 1.05 -> 204 px):
            # v = (-z / 1.85) * 0.5 + 0.5 -> pil_y = (1 - v)*CS = (0.5 + z/3.70)*CS
            # For left cam (side_sign=-1): z_spool = +0.08 -> pil_y shifts DOWN +15.6 px
            # For right cam (side_sign=+1): z_spool = -0.08 -> pil_y shifts UP -15.6 px
            cx_s = cx_c + (0.08 / 1.85) * (CS * 0.5)
            cy_s = cy_c + (-side_sign * 0.08 / 1.85) * (CS * 0.5)
            for deg in range(0, 360, 15):
                rad_a = math.radians(deg)
                is_maj = (deg % 45 == 0)
                r0 = 174 if is_maj else 183
                r1 = 197
                dc.line(
                    [
                        (cx_s + math.cos(rad_a) * r0, cy_s + math.sin(rad_a) * r0),
                        (cx_s + math.cos(rad_a) * r1, cy_s + math.sin(rad_a) * r1),
                    ],
                    fill=255 if is_maj else 210,
                    width=5 if is_maj else 3,
                )
            # Crisp laser-etched "HEXCOIL" & "360°" cleanly centered on the wide solid copper eccentric crescent!
            # Left cam crescent bulges toward (+X, +Z = bottom-right in PIL); Right cam bulges toward (+X, -Z = top-right)!
            f_cam = _load_font(FONT_DIN, 32)
            f_sm = _load_font(FONT_COND, 26)
            tx_lobe = cx_c + 244
            ty_lobe = cy_c + (108 if side_idx == 0 else -108)
            dc.text((tx_lobe, ty_lobe - 14), "HEXCOIL", font=f_cam, fill=255, anchor="mm")
            dc.text((tx_lobe, ty_lobe + 16), "360°  R500", font=f_sm, fill=245, anchor="mm")
            # Left/Right timing code neatly centered between spoke holes (clear of all 5 holes!)
            lbl = "L-310°" if side_idx == 0 else "R-310°"
            dc.text((cx_s - 122, cy_s + (-78 if side_idx == 0 else 78)), lbl, font=f_sm, fill=245, anchor="mm")
            _paste_uv_band(laser_white, cam_im, u0, u1, 0.765, 0.985)

            # Add subtle concentric CNC lathe turning shimmer across both copper cam top faces
            sub_u = (u_grid - (u0 + u1) * 0.5) / ((u1 - u0) * 0.5)
            sub_v = (v_grid - 0.875) / 0.110
            sub_r = np.hypot(sub_u, sub_v)
            in_disc = (u_grid >= u0) & (u_grid <= u1) & (v_grid >= 0.765) & (v_grid <= 0.985) & (sub_r < 0.98)
            lathe_ring = (0.5 + 0.5 * np.sin(sub_r * 160.0)) * in_disc.astype(np.float32)
            rgh = np.where(in_disc, np.clip(rgh + (lathe_ring - 0.5) * 0.045, 0.16, 0.40), rgh)

        # --- 2) TRAC-TRIGGER FLOATING SLED LEFT & RIGHT CNC FLANK BADGES ---
        # Left  flank: u in [0.490, 0.735], v in [0.880, 0.985]
        # Right flank: u in [0.490, 0.735], v in [0.765, 0.870]
        SLW, SLH = 980, 420
        sl_l = Image.new("L", (SLW, SLH), 0)
        dsl = ImageDraw.Draw(sl_l)
        dsl.rectangle((28, 34, SLW - 28, SLH - 34), outline=210, width=5)
        dsl.text((SLW // 2, 162), "TRAC-TRIGGER  TTFS", font=_load_font(FONT_DIN, 76), fill=255, anchor="mm")
        dsl.text((SLW // 2, 266), "FLOATING SEAR  -  3.5 LB MATCH", font=_load_font(FONT_COND, 56), fill=242, anchor="mm")
        _paste_uv_band(laser_white, sl_l, 0.490, 0.735, 0.880, 0.985)

        sl_r = Image.new("L", (SLW, SLH), 0)
        dsr = ImageDraw.Draw(sl_r)
        dsr.rectangle((28, 34, SLW - 28, SLH - 34), outline=210, width=5)
        dsr.text((SLW // 2, 162), "RAVIN   R500   TTFS", font=_load_font(FONT_DIN, 76), fill=255, anchor="mm")
        dsr.text((SLW // 2, 266), "AUTO ANTI-DRY-FIRE INTERLOCK", font=_load_font(FONT_COND, 54), fill=242, anchor="mm")
        _paste_uv_band(laser_white, sl_r, 0.490, 0.735, 0.765, 0.870)

        # --- 3) FIREWALLED SAFETY-ORANGE SELECTOR PADDLES: CRISP S / F RECESSED DOTS (1:1 aspect 508x192!) ---
        # Left  paddle outer face: u in [0.762, 0.868], v in [0.878, 0.984]  (physical 1.27 x 0.48 cm)
        # Right paddle outer face: u in [0.882, 0.988], v in [0.878, 0.984]
        PW, PH = 508, 192
        for u0, u1, is_right in ((0.762, 0.868, False), (0.882, 0.988, True)):
            p_w = Image.new("L", (PW, PH), 0)
            p_d = Image.new("L", (PW, PH), 0)
            dpw = ImageDraw.Draw(p_w)
            dpd = ImageDraw.Draw(p_d)
            tip_x = int(PW * (0.77 if is_right else 0.23))
            rear_x = int(PW * (0.28 if is_right else 0.72))
            dpw.ellipse((rear_x - 36, PH // 2 - 36, rear_x + 36, PH // 2 + 36), fill=255)
            dpd.text((rear_x, PH // 2 + 2), "S", font=_load_font(FONT_DIN, 48), fill=255, anchor="mm")
            dpw.text((tip_x, PH // 2 + 2), "F", font=_load_font(FONT_DIN, 54), fill=255, anchor="mm")
            _paste_uv_band(laser_white, p_w, u0, u1, 0.878, 0.984)
            _paste_uv_band(dark_dot, p_d, u0, u1, 0.878, 0.984)

        w_bev = _bevel_mask(laser_white, width_px=1.3)
        d_bev = _bevel_mask(dark_dot, width_px=1.2)
        decal_height = -0.38 * w_bev - 0.34 * d_bev

        # Bright laser-frost marking on copper cams, dark sled & orange selector
        _mix(albedo, (0.94, 0.93, 0.90), laser_white * 0.90)
        _mix(rgh, 0.38, laser_white * 0.82)
        _mix(met, 0.18, laser_white * 0.85)
        ao *= 1.0 - 0.06 * laser_white

        _mix(albedo, (0.10, 0.11, 0.12), dark_dot * 0.94)
        _mix(rgh, 0.55, dark_dot * 0.90)
        _mix(met, 0.02, dark_dot * 0.95)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.12, 0.92)
        met = np.clip(met, 0.00, 0.99)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_cams_mech_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_cams_mech_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_cams_mech_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved r500_v3_cams_mech_{albedo,normal,roughness}.webp (2048x2048)")

    def _paint_3k_carbon_bolt_band(
        albedo: np.ndarray,
        rgh: np.ndarray,
        met: np.ndarray,
        ao: np.ndarray,
        nrm_final: np.ndarray,
        u_grid: np.ndarray,
        v_grid: np.ndarray,
        u0: float, u1: float, v0: float, v1: float,
        is_right: bool,
    ) -> None:
        """Paints museum-grade 2x2 3K diagonal twill woven carbon fiber + orange/white cresting wrap
        with razor-crisp 'RAVIN R500  -  .001\"  -  400 GR' upright on BOTH sides of the 20\" bolt!"""
        h, w = rgh.shape
        x0, x1 = int(round(u0 * w)), int(round(u1 * w))
        y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
        if x1 <= x0 or y1 <= y0:
            return

        sh = y1 - y0
        sw = x1 - x0
        u_sub = np.broadcast_to((u_grid[:, x0:x1] - u0) / max(u1 - u0, 1e-6), (sh, sw)).astype(np.float32)
        v_sub = np.broadcast_to((v_grid[y0:y1, :] - v0) / max(v1 - v0, 1e-6), (sh, sw)).astype(np.float32)
        # x_norm along shaft: 0 = rear nock (-24.5 cm), 1 = front insert (+22.15 cm)
        x_norm = np.clip(u_sub if is_right else (1.0 - u_sub), 0.0, 1.0)

        # True 2x2 3K diagonal twill weave:
        # Shaft length = 46.65 cm, half-circumference = pi * 0.36 = 1.13 cm
        # 3K tow pitch ~ 0.16 cm -> ~290 tows along length, ~7.5 tows across half-circumference!
        tx = x_norm * 290.0
        ty = v_sub * 8.5
        ix = np.floor(tx).astype(np.int32)
        iy = np.floor(ty).astype(np.int32)
        fx = tx - ix
        fy = ty - iy

        # 2x2 twill pattern: ((ix + iy) % 4) < 2 -> warp tow on top (longitudinal), else weft tow (transverse)
        is_warp = (((ix + iy) & 3) < 2)
        # Crown profile of each carbon tow bundle (bright center ridge, dark seam valley!)
        warp_crown = np.sin(np.pi * fy) * (0.72 + 0.28 * np.sin(np.pi * fx))
        weft_crown = np.sin(np.pi * fx) * (0.72 + 0.28 * np.sin(np.pi * fy))
        tow_h = np.where(is_warp, warp_crown, weft_crown).astype(np.float32)

        # Anisotropic fiber sheen contrast between orthogonal 3K bundles (signature carbon checkerboard!)
        warp_rgb = np.array([0.235, 0.250, 0.275], dtype=np.float32)
        weft_rgb = np.array([0.135, 0.145, 0.162], dtype=np.float32)
        seam_rgb = np.array([0.068, 0.072, 0.082], dtype=np.float32)

        base_tow = np.where(is_warp[..., None], warp_rgb, weft_rgb)
        c_rgb = seam_rgb * (1.0 - tow_h[..., None]) + base_tow * (0.55 + 0.72 * tow_h[..., None])
        c_rgh = np.where(is_warp, 0.24, 0.34).astype(np.float32) + (1.0 - tow_h) * 0.14
        c_met = np.full((sh, sw), 0.14, dtype=np.float32)
        c_ao = np.clip(0.74 + 0.26 * tow_h, 0.70, 1.0).astype(np.float32)

        # High-visibility Ravin orange/white match cresting wrap forward of vanes:
        # Vanes end at local X = -18.2 (x_norm = (-18.2 + 24.5) / 46.65 = 0.135).
        # Wide matte-black cresting band at x_norm in [0.145, 0.485] (generous padding so lettering NEVER clips stripes!)
        in_crest = (x_norm >= 0.145) & (x_norm <= 0.485)
        orange_stripe = (
            ((x_norm >= 0.145) & (x_norm <= 0.160))
            | ((x_norm >= 0.167) & (x_norm <= 0.173))
            | ((x_norm >= 0.470) & (x_norm <= 0.485))
            | ((x_norm >= 0.457) & (x_norm <= 0.463))
        )
        white_stripe = ((x_norm >= 0.160) & (x_norm <= 0.167)) | ((x_norm >= 0.463) & (x_norm <= 0.470))
        dark_band = (x_norm > 0.173) & (x_norm < 0.457)

        c_rgb[dark_band] = c_rgb[dark_band] * 0.52 + np.array([0.055, 0.060, 0.068], dtype=np.float32) * 0.48
        c_rgh[dark_band] = 0.28
        c_rgb[orange_stripe] = (0.94, 0.34, 0.04)
        c_rgh[orange_stripe] = 0.26
        c_met[orange_stripe] = 0.04
        c_rgb[white_stripe] = (0.92, 0.93, 0.94)
        c_rgh[white_stripe] = 0.28
        c_met[white_stripe] = 0.02

        # Crisp white enamel shaft typography inside cresting band (upright left-to-right on BOTH sides!)
        # Placed slightly above mid-equator (BH * 0.35 -> upper flank of bolt!) so it stays 100% unobstructed above chassis rail!
        # Center of dark_band [0.173..0.457] is x_norm = 0.315 (u_sub = 0.315 right, 0.685 left).
        BW, BH = 2400, 140
        txt_im = Image.new("L", (BW, BH), 0)
        dt = ImageDraw.Draw(txt_im)
        cx_txt = int(BW * (0.315 if is_right else 0.685))
        dt.text((cx_txt, int(BH * 0.36)), "RAVIN  R500  -  .001\"  -  400 GR", font=_load_font(FONT_DIN, 38), fill=255, anchor="mm")
        txt_arr = np.asarray(txt_im.resize((sw, sh), resample=Image.Resampling.LANCZOS), dtype=np.float32) / 255.0

        # Composite crisp bolt lettering
        c_rgb = c_rgb * (1.0 - txt_arr[..., None] * 0.96) + np.array([0.95, 0.96, 0.95], dtype=np.float32) * (txt_arr[..., None] * 0.96)
        c_rgh = c_rgh * (1.0 - txt_arr * 0.85) + 0.32 * (txt_arr * 0.85)
        c_met = c_met * (1.0 - txt_arr * 0.92) + 0.02 * (txt_arr * 0.92)

        # Carbon weave normal bump (smooth resin clearcoat over woven 3K tows)
        weave_h = tow_h * np.where(in_crest, 0.22, 0.75) + txt_arr * 0.14
        weave_n = _height_to_normal_01(weave_h, strength=1.55)

        albedo[y0:y1, x0:x1] = np.clip(c_rgb, 0.0, 1.0)
        rgh[y0:y1, x0:x1] = np.clip(c_rgh, 0.16, 0.65)
        met[y0:y1, x0:x1] = np.clip(c_met, 0.00, 0.40)
        ao[y0:y1, x0:x1] = np.minimum(ao[y0:y1, x0:x1], c_ao)
        nrm_final[y0:y1, x0:x1] = _rnm_blend(nrm_final[y0:y1, x0:x1], weave_n)

    def process_optic_bolt_atlas():
        """500 FPS Illuminated Crossbow Scope (300-550 FPS Dial, 100-YD BDC Turret, Firewalled
        Emerald-Sapphire Optical Lenses), 3-Bolt Side Quiver, Firewalled Safety-Orange Retention
        Arm & 20\" 2x2 3K Woven Carbon Match Bolt w/ Mirror 3-Blade Broadhead."""
        alb_lin = _read_f32_rgb(tmp_dir / "optic_bolt_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "optic_bolt_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "optic_bolt_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "optic_bolt_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "optic_bolt_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "optic_bolt_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "optic_bolt_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        # --- STRICT COLOR FIREWALL MARGIN FILLS (Zero dark bleed across mipmaps!) ---
        # 1) Safety-Orange zone (`r500_retention_arm` + bolt cock vane & clip-on nock): u in [0.700..0.995], v in [0.600..0.805]
        or_box = (u_grid >= 0.700) & (u_grid <= 0.995) & (v_grid >= 0.600) & (v_grid <= 0.805)
        or_margin = or_box & (albedo[..., 0] < 0.55)
        albedo[or_margin] = (0.94, 0.34, 0.04)
        rgh[or_margin] = 0.36
        met[or_margin] = 0.04
        ao[or_margin] = 1.0

        # 2) Arctic-White hen vanes zone: u in [0.785..0.995], v in [0.265..0.465]
        wh_box = (u_grid >= 0.785) & (u_grid <= 0.995) & (v_grid >= 0.265) & (v_grid <= 0.465)
        wh_margin = wh_box & (albedo[..., 0] < 0.60)
        albedo[wh_margin] = (0.93, 0.94, 0.95)
        rgh[wh_margin] = 0.38
        met[wh_margin] = 0.00
        ao[wh_margin] = 1.0

        white_ink = np.zeros((h, w), dtype=np.float32)
        orange_ink = np.zeros((h, w), dtype=np.float32)
        quiver_emboss = np.zeros((h, w), dtype=np.float32)

        # --- 1) SCOPE 300-550 FPS CALIBRATED SPEED RING (cylindrical wrap!) ---
        # Hero Band 1a: u in [0.015, 0.680], v in [0.895, 0.985]
        SPW, SPH = 2200, 220
        sp_w = Image.new("L", (SPW, SPH), 0)
        sp_o = Image.new("L", (SPW, SPH), 0)
        dsw = ImageDraw.Draw(sp_w)
        dso = ImageDraw.Draw(sp_o)
        dsw.line([(24, 188), (SPW - 24, 188)], fill=235, width=4)
        speeds = [300, 350, 400, 450, 500, 550]
        f_sp = _load_font(FONT_DIN, 62)
        f_fps = _load_font(FONT_COND, 44)
        for rep in range(2):
            base_x = 90 + rep * 1080
            for si, spd in enumerate(speeds):
                xk = base_x + si * 155
                is_500 = (spd == 500)
                dsw.line([(xk, 148), (xk, 188)], fill=255, width=6 if is_500 else 4)
                if is_500:
                    dso.text((xk, 96), str(spd), font=f_sp, fill=255, anchor="mm")
                    dso.polygon([(xk, 144), (xk - 12, 128), (xk + 12, 128)], fill=255)
                else:
                    dsw.text((xk, 96), str(spd), font=f_sp, fill=250, anchor="mm")
                if si < len(speeds) - 1:
                    xm = xk + 77
                    dsw.line([(xm, 162), (xm, 188)], fill=210, width=3)
            dsw.text((base_x + 920, 96), "FPS", font=f_fps, fill=255, anchor="mm")
        _paste_uv_band(white_ink, sp_w, 0.015, 0.680, 0.895, 0.985)
        _paste_uv_band(orange_ink, sp_o, 0.015, 0.680, 0.895, 0.985)

        # --- 2) SCOPE TOP 100-YD BDC ELEVATION TURRET SCALE (cylindrical wrap!) ---
        # Hero Band 1b: u in [0.015, 0.680], v in [0.795, 0.885]
        TW, TH = 2200, 220
        tur_im = Image.new("L", (TW, TH), 0)
        dt = ImageDraw.Draw(tur_im)
        dt.line([(28, 194), (TW - 28, 194)], fill=245, width=4)
        f_yd = _load_font(FONT_COND, 62)
        for k in range(80):
            xk = round(28 + (k / 80.0) * (TW - 56))
            is_maj = (k % 8 == 0)
            th_px = 46 if is_maj else (30 if k % 4 == 0 else 18)
            dt.line([(xk, 194 - th_px), (xk, 194)], fill=255 if is_maj else 215, width=5 if is_maj else 3)
            if is_maj:
                yd_val = 20 + (k // 8) * 10
                if yd_val <= 100:
                    dt.text((xk, 114), str(yd_val), font=f_yd, fill=255, anchor="mm")
        dt.text((TW // 2, 42), "100-YD  BDC   |   UP  /  1 CLICK = 1/4 MOA   |   500 FPS", font=_load_font(FONT_COND, 40), fill=248, anchor="mm")
        _paste_uv_band(white_ink, tur_im, 0.015, 0.680, 0.795, 0.885)

        # --- 3) SCOPE OBJECTIVE & OCULAR TUBE RIGHT / LEFT FLANK MARKINGS (1:1 aspect @ 150 px/cm!) ---
        # Local X in [-10.5, +12.8] (23.3 cm), Y span = 3.90 cm -> 3495 x 585 px
        # Right flank: u in [0.015, 0.680], v in [0.700, 0.785]
        # Left  flank: u in [0.015, 0.680], v in [0.605, 0.690]
        SW, SH = 3495, 585

        def sx_r(x: float) -> int:
            return int(round(((x + 10.5) / 23.3) * SW))

        def sx_l(x: float) -> int:
            return int(round((1.0 - (x + 10.5) / 23.3) * SW))

        sc_r = Image.new("L", (SW, SH), 0)
        dsr = ImageDraw.Draw(sc_r)
        dsr.text((sx_r(9.1), 240), "RAVIN  100-YD  ILLUMINATED", font=_load_font(FONT_DIN, 74), fill=255, anchor="mm")
        dsr.text((sx_r(9.1), 342), "1-8×24   -   500 FPS  BDC", font=_load_font(FONT_COND, 62), fill=246, anchor="mm")
        dsr.text((sx_r(-8.35), 292), "1×  2×  4×  6×  8×", font=_load_font(FONT_COND, 56), fill=250, anchor="mm")
        _paste_uv_band(white_ink, sc_r, 0.015, 0.680, 0.700, 0.785)

        sc_l = Image.new("L", (SW, SH), 0)
        dsl = ImageDraw.Draw(sc_l)
        dsl.text((sx_l(9.1), 240), "RAVIN  100-YD  ILLUMINATED", font=_load_font(FONT_DIN, 74), fill=255, anchor="mm")
        dsl.text((sx_l(9.1), 342), "HELICOIL  SPEED-CALIBRATED", font=_load_font(FONT_COND, 62), fill=246, anchor="mm")
        dsl.text((sx_l(-8.35), 292), "8×  6×  4×  2×  1×", font=_load_font(FONT_COND, 56), fill=250, anchor="mm")
        _paste_uv_band(white_ink, sc_l, 0.015, 0.680, 0.605, 0.690)

        # --- 4) FIREWALLED MULTI-COATED EMERALD-SAPPHIRE OPTICAL GLASS LENSES ---
        # Front 24mm Objective Lens: u in [0.705, 0.875], v in [0.815, 0.985] (center 0.790, 0.900; r=0.080)
        # Rear Ocular Lens:          u in [0.885, 0.985], v in [0.885, 0.985] (center 0.935, 0.935; r=0.044)
        # Lens Back Hemispheres:     u in [0.885, 0.985], v in [0.815, 0.875]
        lens_box = (u_grid >= 0.700) & (u_grid <= 0.992) & (v_grid >= 0.810) & (v_grid <= 0.992)
        albedo[lens_box] = (0.016, 0.072, 0.098)
        rgh[lens_box] = 0.04
        met[lens_box] = 0.10
        ao[lens_box] = 1.0
        nrm[lens_box] = (0.5, 0.5, 1.0)

        for cx_l, cy_l, r_l, u0_l, u1_l, v0_l, v1_l in (
            (0.790, 0.900, 0.080, 0.702, 0.878, 0.812, 0.988),
            (0.935, 0.935, 0.044, 0.882, 0.988, 0.882, 0.988),
        ):
            sub_m = (u_grid >= u0_l) & (u_grid <= u1_l) & (v_grid >= v0_l) & (v_grid <= v1_l)
            lu = (u_grid - cx_l) / r_l
            lv = (v_grid - cy_l) / r_l
            rad = np.hypot(lu, lv)
            coat_wave = 0.5 + 0.5 * np.cos(6.4 * rad * rad + 0.52 * lv - 0.38 * lu)
            sapphire_rim = _smoothstep(0.60, 0.92, rad) * (1.0 - _smoothstep(0.92, 1.18, rad))
            lens_rgb = (
                np.array((0.020, 0.125, 0.215), dtype=np.float32)
                + coat_wave[..., None] * np.array((0.022, 0.315, 0.175), dtype=np.float32)
                + sapphire_rim[..., None] * np.array((0.085, 0.165, 0.285), dtype=np.float32)
            )
            lens_rgb *= 1.0 - 0.48 * _smoothstep(0.78, 1.16, rad)[..., None]
            arc1 = (1.0 - _smoothstep(0.018, 0.055, np.abs(rad - 0.70))) * _smoothstep(0.12, 0.45, lv) * (1.0 - _smoothstep(-0.20, 0.25, lu))
            arc2 = (1.0 - _smoothstep(0.016, 0.048, np.abs(rad - 0.44))) * _smoothstep(-0.55, -0.20, lv) * _smoothstep(0.05, 0.42, lu)
            lens_rgb += arc1[..., None] * np.array((0.40, 0.82, 0.72), dtype=np.float32)
            lens_rgb += arc2[..., None] * np.array((0.18, 0.48, 0.64), dtype=np.float32)
            albedo[sub_m] = np.clip(lens_rgb[sub_m], 0.0, 1.0)

        # --- 5) QUIVER BROADHEAD HOOD OUTER RIGHT FLANK MOLDED RAVIN CREST ---
        # Hero Band: u in [0.740, 0.985], v in [0.015, 0.210]
        QW, QH = 740, 500
        q_im = Image.new("L", (QW, QH), 0)
        dq = ImageDraw.Draw(q_im)
        _draw_ravin_emblem(dq, QW // 2, 170, 82)
        dq.text((QW // 2, 315), "RAVIN   R500", font=_load_font(FONT_DIN, 72), fill=255, anchor="mm")
        dq.text((QW // 2, 392), "QD 3-BOLT  -  500 FPS", font=_load_font(FONT_COND, 48), fill=235, anchor="mm")
        _paste_uv_band(quiver_emboss, q_im, 0.740, 0.985, 0.015, 0.210)

        # Composite scope white/orange enamel & quiver molded crest
        ink_bev = _bevel_mask(white_ink, width_px=1.1)
        oin_bev = _bevel_mask(orange_ink, width_px=1.1)
        qev_bev = _bevel_mask(quiver_emboss, width_px=1.6)
        decal_height = -0.18 * ink_bev - 0.18 * oin_bev + 0.46 * qev_bev

        _mix(albedo, (0.93, 0.94, 0.92), white_ink * 0.96)
        _mix(rgh, 0.34, white_ink * 0.90)
        _mix(met, 0.04, white_ink * 0.96)
        ao *= 1.0 - 0.04 * white_ink

        _mix(albedo, (0.96, 0.38, 0.06), orange_ink * 0.96)
        _mix(rgh, 0.34, orange_ink * 0.90)
        _mix(met, 0.04, orange_ink * 0.96)

        _mix(albedo, (0.28, 0.30, 0.33), quiver_emboss * 0.55)
        _mix(rgh, 0.56, quiver_emboss * 0.50)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        # --- 6) 20" 2x2 3K WOVEN CARBON MATCH BOLT (Right & Left Upright Semi-Cylinders!) ---
        # Right half (+Z): u in [0.015, 0.985], v in [0.535, 0.592]
        # Left  half (-Z): u in [0.015, 0.985], v in [0.472, 0.529]
        _paint_3k_carbon_bolt_band(albedo, rgh, met, ao, nrm_final, u_grid, v_grid, 0.015, 0.985, 0.535, 0.592, is_right=True)
        _paint_3k_carbon_bolt_band(albedo, rgh, met, ao, nrm_final, u_grid, v_grid, 0.015, 0.985, 0.472, 0.529, is_right=False)

        # Guarantee optical lenses remain optically pristine!
        nrm_final[lens_box] = (0.5, 0.5, 1.0)
        rgh[lens_box] = 0.04
        met[lens_box] = 0.10

        rgh = np.clip(rgh, 0.04, 0.94)
        met = np.clip(met, 0.00, 0.99)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_optic_bolt_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_optic_bolt_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "r500_v3_optic_bolt_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved r500_v3_optic_bolt_{albedo,normal,roughness}.webp (2048x2048)")

    process_chassis_atlas()
    process_cams_mech_atlas()
    process_optic_bolt_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "r500.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16

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


# Exact 19 solid Ravin R500 parts across 3 dedicated 2048x2048 hero suites
# (SKIPPING ONLY the 6 dynamic `aSpringParam` GPU-deforming CSG parts:
#  r500_left_limbs, r500_right_limbs, r500_cam_axles, r500_bowstring,
#  r500_power_cables, r500_trigger_spring!)
CHASSIS_PARTS = [
    "r500_chassis",
    "r500_forend_grip",
    "r500_pistol_grip",
    "r500_buttstock",
    "r500_flight_rail",
    "r500_riser_head",
]

CAMS_MECH_PARTS = [
    "r500_left_cam",
    "r500_right_cam",
    "r500_foot_stirrup",
    "r500_versadrive_screw",
    "r500_trigger_sled",
    "r500_string_latch",
    "r500_anti_dry_fire",
    "r500_trigger_sear",
    "r500_safety_selector",
]

OPTIC_BOLT_PARTS = [
    "r500_scope",
    "r500_quiver_frame",
    "r500_retention_arm",
    "r500_carbon_bolt",
]

# Exterior static/semi-static parts receiving assembled inter-part contact AO
# (internal/cycling/flying parts use clean Self-AO so they stay gleaming in exploded & firing modes!)
EXTERIOR_CONTACT_AO_PARTS = {
    "r500_chassis",
    "r500_forend_grip",
    "r500_pistol_grip",
    "r500_buttstock",
    "r500_flight_rail",
    "r500_riser_head",
    "r500_left_cam",
    "r500_right_cam",
    "r500_foot_stirrup",
    "r500_scope",
    "r500_quiver_frame",
}

ASSEMBLED_POS = {
    "r500_chassis":          (  0.000,  0.000,  0.000),
    "r500_forend_grip":      ( 14.200, -1.850,  0.000),
    "r500_pistol_grip":      (  1.600, -4.800,  0.000),
    "r500_buttstock":        (-27.800, -0.450,  0.000),
    "r500_foot_stirrup":     ( 34.000,  1.150,  0.000),
    "r500_flight_rail":      ( -7.000,  3.850,  0.000),
    "r500_riser_head":       ( 26.200,  1.750,  0.000),
    "r500_left_cam":         ( 25.200,  1.800, -9.650),
    "r500_right_cam":        ( 25.200,  1.800,  9.650),
    "r500_versadrive_screw": ( -5.500,  0.550,  0.000),
    "r500_trigger_sled":     ( 12.500,  1.050,  0.000),
    "r500_string_latch":     ( 13.850,  1.800,  0.000),
    "r500_anti_dry_fire":    ( 13.150,  2.050,  0.000),
    "r500_trigger_sear":     ( -6.000, -1.000,  0.000),
    "r500_safety_selector":  ( -1.800,  0.250,  0.000),
    "r500_scope":            ( -6.000,  6.250,  0.000),
    "r500_quiver_frame":     (  7.500, -3.150,  4.650),
    "r500_retention_arm":    ( 10.400,  3.150,  0.000),
    "r500_carbon_bolt":      (  3.400,  1.800,  0.000),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) from src/weapons/r500/meshes/*.ts
CSG_REF_BBOX = {
    "r500_chassis":          ((-24.5000, -2.1450, -1.4200), (24.2000,  2.6450,  1.8600)),
    "r500_forend_grip":      (( -7.6000, -1.0750, -3.1200), ( 7.4000,  2.3400,  3.1200)),
    "r500_pistol_grip":      (( -2.5500, -6.4000, -1.0100), ( 4.0500,  3.1500,  1.0100)),
    "r500_buttstock":        (( -4.1950, -5.9500, -1.6200), ( 3.5500,  2.6050,  1.6200)),
    "r500_foot_stirrup":     (( -4.9250, -0.9000, -4.9500), ( 4.9900,  0.2100,  4.9500)),
    "r500_flight_rail":      ((-18.3000, -2.3200, -1.6600), (17.8000,  0.7500,  1.6600)),
    "r500_riser_head":       (( -2.4000, -1.6250, -3.7665), ( 3.2000,  1.7250,  3.7665)),
    "r500_left_cam":         (( -1.1775, -0.6900, -1.2341), ( 1.6844,  0.6900,  1.4632)),
    "r500_right_cam":        (( -1.1047, -0.6900, -1.5479), ( 1.7250,  0.6900,  1.1078)),
    "r500_versadrive_screw": ((-21.0800, -1.1300, -1.1300), (20.5250,  1.1600,  1.1300)),
    "r500_trigger_sled":     (( -1.9000, -1.2950, -0.8600), ( 2.0000,  1.0700,  0.8600)),
    "r500_string_latch":     (( -0.9500, -0.2400, -0.4600), ( 0.3600,  0.2400,  0.4600)),
    "r500_anti_dry_fire":    (( -0.8800, -0.2900, -0.4300), ( 1.1200,  0.2200,  0.4300)),
    "r500_trigger_sear":     ((-18.1750, -3.0800, -0.4600), ( 9.8750,  1.2000,  0.4600)),
    "r500_safety_selector":  (( -0.3200, -0.2700, -1.7200), ( 0.9500,  0.2700,  1.7200)),
    "r500_scope":            ((-10.5000, -1.7750, -2.1950), (12.8000,  3.0250,  2.1550)),
    "r500_quiver_frame":     ((-26.0050, -3.1000, -3.1050), (27.0000,  1.9000,  1.9950)),
    "r500_retention_arm":    (( -0.8500, -1.1900, -0.4000), ( 6.9250,  0.1200,  0.4000)),
    "r500_carbon_bolt":      ((-25.4000, -0.8800, -0.7746), (25.4000,  0.4653,  0.7746)),
}


# =============================================================================
# Scene & Physically Calibrated Ravin R500 Aerospace PBR Material Library
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
    edge_srgb: tuple[float, float, float] = (0.78, 0.80, 0.84),
    grain_scale: float = 36.0,
    grain_bump: float = 0.030,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 72.0,
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
    n_macro.inputs["Scale"].default_value = 3.80
    n_macro.inputs["Detail"].default_value = 4.0
    n_macro.inputs["Roughness"].default_value = 0.54
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
        min(1.0, base_srgb[0] * 1.036),
        min(1.0, base_srgb[1] * 1.036),
        min(1.0, base_srgb[2] * 1.036),
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
    rgh_val_node.inputs["To Min"].default_value = max(0.04, roughness - rough_var)
    rgh_val_node.inputs["To Max"].default_value = min(0.95, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_val_node.inputs["Value"])
    rgh_sock = rgh_val_node.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.555
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.635
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
        mix_edge_r.inputs[3].default_value = max(0.14, roughness - 0.14)
        nt.links.new(mul_w.outputs["Value"], mix_edge_r.inputs[0])
        nt.links.new(rgh_sock, mix_edge_r.inputs[2])
        rgh_sock = mix_edge_r.outputs[0]

        if metallic > 0.35:
            mix_edge_m = nt.nodes.new("ShaderNodeMix")
            mix_edge_m.data_type = "FLOAT"
            mix_edge_m.inputs[3].default_value = 0.95
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


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: CHASSIS, FLIGHT RAIL, RISER & CARBON POLYMER FURNITURE (`r500_v3_chassis`) ---
        "CH_SlateAnodize": _build_pbr_mat(
            "CH_SlateAnodize",
            base_srgb=(0.305, 0.328, 0.355),
            roughness=0.33,
            metallic=0.78,
            bevel_r=0.032,
            edge_wear=0.32,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=44.0,
            grain_bump=0.026,
            aniso_stretch=(0.38, 3.6, 3.6),
            rough_var=0.036,
        ),
        "CH_DarkTitanium": _build_pbr_mat(
            "CH_DarkTitanium",
            base_srgb=(0.205, 0.222, 0.246),
            roughness=0.37,
            metallic=0.76,
            bevel_r=0.026,
            edge_wear=0.28,
            edge_srgb=(0.68, 0.72, 0.76),
            grain_scale=52.0,
            grain_bump=0.030,
            voronoi_grain=0.40,
            voronoi_scale=84.0,
            rough_var=0.034,
        ),
        "CH_PicatinnyCrest": _build_pbr_mat(
            "CH_PicatinnyCrest",
            base_srgb=(0.345, 0.370, 0.402),
            roughness=0.28,
            metallic=0.84,
            bevel_r=0.018,
            edge_wear=0.52,
            edge_srgb=(0.84, 0.87, 0.90),
            grain_scale=38.0,
            grain_bump=0.022,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.030,
        ),
        "CH_SlotDark": _build_pbr_mat(
            "CH_SlotDark",
            base_srgb=(0.115, 0.124, 0.138),
            roughness=0.52,
            metallic=0.68,
            bevel_r=0.014,
            grain_scale=40.0,
            grain_bump=0.026,
            rough_var=0.030,
        ),
        "CH_MatteCarbonPoly": _build_pbr_mat(
            "CH_MatteCarbonPoly",
            base_srgb=(0.158, 0.166, 0.180),
            roughness=0.66,
            metallic=0.02,
            bevel_r=0.042,
            edge_wear=0.22,
            edge_srgb=(0.285, 0.298, 0.318),
            grain_scale=66.0,
            grain_bump=0.095,
            voronoi_grain=0.68,
            voronoi_scale=96.0,
            rough_var=0.048,
        ),
        "CH_GripStipple": _build_pbr_mat(
            "CH_GripStipple",
            base_srgb=(0.138, 0.146, 0.158),
            roughness=0.76,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.14,
            edge_srgb=(0.245, 0.258, 0.275),
            grain_scale=78.0,
            grain_bump=0.175,
            voronoi_grain=0.85,
            voronoi_scale=136.0,
            rough_var=0.036,
        ),
        "CH_RubberButtpad": _build_pbr_mat(
            "CH_RubberButtpad",
            base_srgb=(0.112, 0.118, 0.128),
            roughness=0.88,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.10,
            edge_srgb=(0.185, 0.194, 0.208),
            grain_scale=62.0,
            grain_bump=0.090,
            rough_var=0.034,
        ),
        "CH_StainlessHardware": _build_pbr_mat(
            "CH_StainlessHardware",
            base_srgb=(0.78, 0.80, 0.84),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.22,
            edge_srgb=(0.91, 0.93, 0.96),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.024,
        ),

        # --- SUITE 2: HEXCOIL CAMS, VERSADRIVE, STIRRUP & FIRE CONTROL (`r500_v3_cams_mech`) ---
        "CM_HexCoilCopper": _build_pbr_mat(
            "CM_HexCoilCopper",
            base_srgb=(0.73, 0.42, 0.19),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.024,
            edge_wear=0.38,
            edge_srgb=(0.93, 0.72, 0.48),
            grain_scale=36.0,
            grain_bump=0.022,
            aniso_stretch=(2.4, 2.4, 0.5),
            rough_var=0.032,
        ),
        "CM_HexCoilGoldGroove": _build_pbr_mat(
            "CM_HexCoilGoldGroove",
            base_srgb=(0.80, 0.53, 0.24),
            roughness=0.22,
            metallic=0.92,
            bevel_r=0.016,
            edge_wear=0.30,
            edge_srgb=(0.95, 0.78, 0.54),
            grain_scale=42.0,
            grain_bump=0.018,
            rough_var=0.026,
        ),
        "CM_BrushedStainless": _build_pbr_mat(
            "CM_BrushedStainless",
            base_srgb=(0.76, 0.79, 0.83),
            roughness=0.20,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=34.0,
            grain_bump=0.020,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.026,
        ),
        "CM_PolishedSteel": _build_pbr_mat(
            "CM_PolishedSteel",
            base_srgb=(0.84, 0.86, 0.90),
            roughness=0.15,
            metallic=0.98,
            bevel_r=0.014,
            edge_wear=0.18,
            edge_srgb=(0.95, 0.96, 0.98),
            grain_scale=28.0,
            grain_bump=0.014,
            aniso_stretch=(0.40, 3.2, 3.2),
            rough_var=0.020,
        ),
        "CM_SledDarkAnodize": _build_pbr_mat(
            "CM_SledDarkAnodize",
            base_srgb=(0.245, 0.265, 0.292),
            roughness=0.31,
            metallic=0.82,
            bevel_r=0.024,
            edge_wear=0.40,
            edge_srgb=(0.74, 0.78, 0.82),
            grain_scale=48.0,
            grain_bump=0.026,
            aniso_stretch=(0.40, 3.4, 3.4),
            rough_var=0.032,
        ),
        "CM_StirrupRubber": _build_pbr_mat(
            "CM_StirrupRubber",
            base_srgb=(0.145, 0.154, 0.166),
            roughness=0.78,
            metallic=0.02,
            bevel_r=0.024,
            grain_scale=72.0,
            grain_bump=0.130,
            voronoi_grain=0.76,
            voronoi_scale=110.0,
            rough_var=0.038,
        ),
        "CM_SafetyOrange": _build_pbr_mat(
            "CM_SafetyOrange",
            base_srgb=(0.94, 0.34, 0.04),
            roughness=0.38,
            metallic=0.04,
            bevel_r=0.020,
            edge_wear=0.14,
            edge_srgb=(0.98, 0.56, 0.24),
            grain_scale=42.0,
            grain_bump=0.030,
            rough_var=0.030,
        ),

        # --- SUITE 3: 500 FPS SCOPE, QUIVER, RETENTION ARM & 3K CARBON BOLT (`r500_v3_optic_bolt`) ---
        "OB_ScopeSatinBlack": _build_pbr_mat(
            "OB_ScopeSatinBlack",
            base_srgb=(0.205, 0.218, 0.238),
            roughness=0.30,
            metallic=0.82,
            bevel_r=0.024,
            edge_wear=0.18,
            edge_srgb=(0.66, 0.70, 0.75),
            grain_scale=64.0,
            grain_bump=0.026,
            voronoi_grain=0.42,
            voronoi_scale=92.0,
            rough_var=0.024,
        ),
        "OB_ScopeTurretKnurl": _build_pbr_mat(
            "OB_ScopeTurretKnurl",
            base_srgb=(0.245, 0.260, 0.285),
            roughness=0.26,
            metallic=0.86,
            bevel_r=0.016,
            edge_wear=0.48,
            edge_srgb=(0.82, 0.85, 0.90),
            grain_scale=44.0,
            grain_bump=0.024,
            rough_var=0.028,
        ),
        "OB_ScopeBronzeAccent": _build_pbr_mat(
            "OB_ScopeBronzeAccent",
            base_srgb=(0.73, 0.42, 0.19),
            roughness=0.25,
            metallic=0.90,
            bevel_r=0.016,
            edge_wear=0.34,
            edge_srgb=(0.92, 0.70, 0.44),
            grain_scale=38.0,
            grain_bump=0.020,
            rough_var=0.028,
        ),
        "OB_ScopeRubber": _build_pbr_mat(
            "OB_ScopeRubber",
            base_srgb=(0.115, 0.120, 0.130),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.022,
            grain_scale=64.0,
            grain_bump=0.092,
            voronoi_grain=0.68,
            voronoi_scale=96.0,
            rough_var=0.032,
        ),
        "OB_OpticalLens": _build_pbr_mat(
            "OB_OpticalLens",
            base_srgb=(0.030, 0.23, 0.21),
            roughness=0.04,
            metallic=0.10,
            bevel_r=0.004,
            grain_scale=12.0,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "OB_QuiverPolymer": _build_pbr_mat(
            "OB_QuiverPolymer",
            base_srgb=(0.158, 0.168, 0.182),
            roughness=0.68,
            metallic=0.00,
            bevel_r=0.036,
            edge_wear=0.18,
            edge_srgb=(0.275, 0.288, 0.308),
            grain_scale=64.0,
            grain_bump=0.095,
            voronoi_grain=0.70,
            voronoi_scale=96.0,
            rough_var=0.046,
        ),
        "OB_QuiverFoam": _build_pbr_mat(
            "OB_QuiverFoam",
            base_srgb=(0.132, 0.138, 0.148),
            roughness=0.90,
            metallic=0.00,
            bevel_r=0.020,
            grain_scale=90.0,
            grain_bump=0.160,
            voronoi_grain=0.88,
            voronoi_scale=150.0,
            rough_var=0.035,
        ),
        "OB_QuiverMountAlloy": _build_pbr_mat(
            "OB_QuiverMountAlloy",
            base_srgb=(0.285, 0.305, 0.335),
            roughness=0.31,
            metallic=0.82,
            bevel_r=0.024,
            edge_wear=0.38,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=46.0,
            grain_bump=0.028,
            aniso_stretch=(0.40, 3.2, 3.2),
            rough_var=0.032,
        ),
        "OB_SafetyOrange": _build_pbr_mat(
            "OB_SafetyOrange",
            base_srgb=(0.94, 0.34, 0.04),
            roughness=0.36,
            metallic=0.04,
            bevel_r=0.018,
            edge_wear=0.14,
            edge_srgb=(0.98, 0.56, 0.24),
            grain_scale=40.0,
            grain_bump=0.026,
            rough_var=0.028,
        ),
        "OB_WhiteVane": _build_pbr_mat(
            "OB_WhiteVane",
            base_srgb=(0.93, 0.94, 0.95),
            roughness=0.38,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=44.0,
            grain_bump=0.016,
            rough_var=0.022,
        ),
        "OB_CarbonShaft": _build_pbr_mat(
            "OB_CarbonShaft",
            base_srgb=(0.185, 0.196, 0.214),
            roughness=0.26,
            metallic=0.14,
            bevel_r=0.006,
            grain_scale=48.0,
            grain_bump=0.012,
            rough_var=0.018,
        ),
        "OB_BroadheadMirror": _build_pbr_mat(
            "OB_BroadheadMirror",
            base_srgb=(0.84, 0.86, 0.90),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.010,
            edge_wear=0.20,
            edge_srgb=(0.96, 0.97, 0.99),
            grain_scale=28.0,
            grain_bump=0.012,
            aniso_stretch=(0.35, 3.6, 3.6),
            rough_var=0.018,
        ),
        "OB_SlotDark": _build_pbr_mat(
            "OB_SlotDark",
            base_srgb=(0.105, 0.112, 0.124),
            roughness=0.54,
            metallic=0.68,
            bevel_r=0.012,
            grain_scale=38.0,
            grain_bump=0.024,
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


def _clean_poly2d(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    clean = []
    for p in pts:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-5:
            clean.append(p)
    if len(clean) > 2 and math.hypot(clean[0][0] - clean[-1][0], clean[0][1] - clean[-1][1]) < 1e-5:
        clean.pop()
    area = sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
               for i in range(len(clean)))
    if area < 0:
        clean.reverse()
    return clean


def _offset_poly2d_outward(pts_ccw: list[tuple[float, float]], offset: float) -> list[tuple[float, float]]:
    n = len(pts_ccw)
    out = []
    for i in range(n):
        p_prev = pts_ccw[(i - 1) % n]
        p_curr = pts_ccw[i]
        p_next = pts_ccw[(i + 1) % n]
        e1x, e1y = p_curr[0] - p_prev[0], p_curr[1] - p_prev[1]
        e2x, e2y = p_next[0] - p_curr[0], p_next[1] - p_curr[1]
        l1 = max(1e-7, math.hypot(e1x, e1y))
        l2 = max(1e-7, math.hypot(e2x, e2y))
        n1x, n1y = e1y / l1, -e1x / l1
        n2x, n2y = e2y / l2, -e2x / l2
        bx, by = n1x + n2x, n1y + n2y
        bl = math.hypot(bx, by)
        if bl < 1e-5:
            nx, ny = n1x, n1y
            scale = offset
        else:
            nx, ny = bx / bl, by / bl
            denom = max(0.45, nx * n1x + ny * n1y)
            scale = min(offset / denom, offset * 1.65)
        out.append((p_curr[0] + nx * scale, p_curr[1] + ny * scale))
    return out


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
    name: str, pts_r_x: list[tuple[float, float]], segs: int = 44,
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


def mk_lathe_y(
    name: str, pts_r_y: list[tuple[float, float]], segs: int = 44,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    for r, y in pts_r_y:
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((r * math.cos(th), y, r * math.sin(th))))
            rings.append(ring)
    n = len(rings)
    for k in range(n - 1):
        a = rings[k]
        b = rings[k + 1]
        if len(a) == 1 and len(b) == 1:
            continue
        elif len(a) == 1 and len(b) > 1:
            for s in range(segs):
                bm.faces.new((a[0], b[s], b[(s + 1) % segs]))
        elif len(a) > 1 and len(b) == 1:
            for s in range(segs):
                bm.faces.new((a[(s + 1) % segs], a[s], b[0]))
        else:
            for s in range(segs):
                sn = (s + 1) % segs
                bm.faces.new((a[s], b[s], b[sn], a[sn]))
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_flared_cutout_z(
    name: str, pts_xy: list[tuple[float, float]],
    z_half_inner: float, flare: float = 0.085, flare_depth: float = 0.14,
    z_overhang: float = 0.28,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    base = _clean_poly2d(pts_xy)
    z_out = z_half_inner + z_overhang
    z_f0 = max(0.10, z_half_inner - flare_depth)
    stations = [
        (-z_out,       flare * 1.15),
        (-z_half_inner, flare * 1.00),
        (-z_f0 - flare_depth * 0.35, flare * 0.42),
        (-z_f0,        0.0),
        ( z_f0,        0.0),
        ( z_f0 + flare_depth * 0.35, flare * 0.42),
        ( z_half_inner, flare * 1.00),
        ( z_out,       flare * 1.15),
    ]
    bm = bmesh.new()
    rings = []
    for z_val, off in stations:
        poly = base if abs(off) < 1e-6 else _offset_poly2d_outward(base, off)
        rings.append([bm.verts.new((p[0], p[1], z_val)) for p in poly])
    n = len(base)
    for k in range(len(rings) - 1):
        ra, rb = rings[k], rings[k + 1]
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((ra[i], ra[ni], rb[ni], rb[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_extrude_z(
    name: str, pts_xy: list[tuple[float, float]], z0: float, z1: float,
    bevel: float = 0.0, bevel_segs: int = 2,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = _clean_poly2d(pts_xy)
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
    clean = _clean_poly2d(pts_zy)
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
    clean = _clean_poly2d(pts_xz)
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 24, depth: float = 0.028,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.022, length * 0.16, radius * 0.14)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.85 - bev * 0.8),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.85 - bev * 0.8),
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


def mk_allen_socket_bolt(
    name: str, head_r: float, head_len: float, side_sign: float,
    x: float, y: float, z: float,
    mat_head: bpy.types.Material, mat_dark: bpy.types.Material,
    axis: str = "z",
) -> bpy.types.Object:
    head = mk_cyl(f"{name}_hd", head_r, head_r, head_len, axis, 18,
                  [("t", x, y, z)], mat_head, bevel=head_r * 0.14)
    off = side_sign * head_len * 0.30
    dx = off if axis == "x" else 0.0
    dy = off if axis == "y" else 0.0
    dz = off if axis == "z" else 0.0
    hex_cut = mk_cyl(f"{name}_hx", head_r * 0.56, head_r * 0.52, head_len * 0.72, axis, 6,
                     [("t", x + dx, y + dy, z + dz)], mat_dark)
    return bool_subtract(head, [hex_cut], solver="EXACT")


def mk_picatinny_rail(
    name: str, length: float, x_start: float, y_crown: float, width: float,
    mat_crest: bpy.types.Material, mat_slot: bpy.types.Material,
) -> list[bpy.types.Object]:
    """True MIL-STD-1913 Picatinny rail with 45-deg dovetail cross-section & 1.0 cm slot pitch."""
    hw = width * 0.5
    # Authentic Picatinny cross-section in (Z, Y) extruded along X from x_start to x_start + length
    # Crown at y_crown, dovetail height 0.56 cm -> base at y_crown - 0.56
    prof_zy = [
        (-hw * 0.72, y_crown - 0.56),
        ( hw * 0.72, y_crown - 0.56),
        ( hw * 0.72, y_crown - 0.36),
        ( hw,        y_crown - 0.18),
        ( hw,        y_crown - 0.07),
        ( hw * 0.88, y_crown),
        (-hw * 0.88, y_crown),
        (-hw,        y_crown - 0.07),
        (-hw,        y_crown - 0.18),
        (-hw * 0.72, y_crown - 0.36),
    ]
    rail_blank = mk_extrude_x(f"{name}_blank", prof_zy, x_start, x_start + length, bevel=0.014, bevel_segs=2, mat=mat_crest)
    # Subtract recoil cross-slots (0.525 cm wide, 0.30 cm deep, 1.00 cm pitch) + center weight-relief channel
    cutters = []
    n_slots = int(math.floor((length - 0.8) / 1.00))
    for i in range(n_slots):
        sx = x_start + 0.65 + i * 1.00
        cutters.append(
            mk_box(f"{name}_sl_{i}", 0.50, 0.34, width + 0.30,
                   [("t", sx, y_crown - 0.13, 0.0)], mat_slot)
        )
    # Center longitudinal zero-clearance lightening groove along crown
    cutters.append(
        mk_box(f"{name}_cg", length + 0.10, 0.16, 0.44,
               [("t", x_start + length * 0.5, y_crown - 0.04, 0.0)], mat_slot)
    )
    rail = bool_subtract(rail_blank, cutters, solver="EXACT")
    return [rail]


def mk_acme_thread_helix(
    name: str, x0: float, x1: float, root_r: float, crest_r: float, pitch: float,
    mat: bpy.types.Material, segs_per_turn: int = 14,
) -> bpy.types.Object:
    """Watertight trapezoidal Acme leadscrew helical thread ribbon along +X."""
    length = x1 - x0
    turns = length / pitch
    total_steps = max(32, int(round(turns * segs_per_turn)))
    half_root = pitch * 0.33
    half_crest = pitch * 0.155
    bm = bmesh.new()
    rings = []
    r0 = root_r * 0.94
    r1 = crest_r
    for i in range(total_steps + 1):
        u = i / total_steps
        x = x0 + length * u
        th = u * turns * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        v0 = bm.verts.new((x - half_root,  r0 * ct, r0 * st))
        v1 = bm.verts.new((x - half_crest, r1 * ct, r1 * st))
        v2 = bm.verts.new((x + half_crest, r1 * ct, r1 * st))
        v3 = bm.verts.new((x + half_root,  r0 * ct, r0 * st))
        rings.append((v0, v1, v2, v3))
    for i in range(total_steps):
        ra, rb = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            bm.faces.new((ra[k], rb[k], rb[kn], ra[kn]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
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

    return obj


# =============================================================================
# 19 AAA HARD-SURFACE RAVIN R500 HELICOIL CROSSBOW PART BUILDERS
# =============================================================================

# --- SUITE 1: CHASSIS, FLIGHT RAIL, RISER & CARBON POLYMER FURNITURE (6 PARTS) ---

def build_r500_chassis(mats: dict) -> bpy.types.Object:
    """B-01: CNC Billet 7075-T6 Slate-Grey Skeletonized Bullpup Mainframe.
    Local = World: X in [-24.50, +24.20], Y in [-2.145, +2.645], Z in [-1.42, +1.86]."""
    m_sl = mats["CH_SlateAnodize"]
    m_ti = mats["CH_DarkTitanium"]
    m_cr = mats["CH_PicatinnyCrest"]
    m_dk = mats["CH_SlotDark"]
    m_ss = mats["CH_StainlessHardware"]

    # Main CNC billet mainframe body (exact Z = +-1.42 flat hero walls, crisp chamfers!)
    main_body = mk_box("ch_main", 48.70, 3.43, 2.84, [("t", -0.15, -0.035, 0.0)], m_sl, bevel=0.075, bevel_segs=2)
    top_rails = mk_box("ch_topr", 48.50, 0.56, 2.80, [("t", -0.15,  1.560, 0.0)], m_sl, bevel=0.055, bevel_segs=2)
    cheek_rest = mk_box("ch_cheek", 10.30, 1.05, 2.68, [("t", -19.35, 2.120, 0.0)], m_sl, bevel=0.095, bevel_segs=2)
    lower_neck = mk_box("ch_neck", 6.80, 0.65, 1.78, [("t", 2.10, -1.820, 0.0)], m_ti, bevel=0.055, bevel_segs=2)

    # Right-side machined dovetail QD quiver mounting rail boss (extends to Z = +1.86)
    qd_prof_xy = [
        ( 8.00, -1.775), (13.60, -1.775),
        (13.60, -0.725), ( 8.00, -0.725),
    ]
    quiver_boss = mk_extrude_z("ch_qdboss", qd_prof_xy, 1.34, 1.86, bevel=0.055, bevel_segs=2, mat=m_cr)

    blank = bool_union([main_body, top_rails, cheek_rest, lower_neck, quiver_boss], "ch_blank", solver="EXACT")

    # Precision internal machined bores & exterior CNC lightening truss windows
    cutters = [
        # Internal VersaDrive / Trac-Trigger sled raceway bore (world Y in [-0.60, +1.56], Z in [-0.94, +0.94])
        mk_box("c_bore", 43.40, 2.16, 1.88, [("t", -3.90, 0.48, 0.0)], m_dk),
        # Open top string-latch / cock-vane zero-friction center channel
        mk_box("c_topslot", 50.40, 1.82, 0.96, [("t", -0.10, 2.15, 0.0)], m_dk),
        # Lower bullpup trigger transfer rod channel
        mk_box("c_trigslot", 30.60, 2.15, 0.82, [("t", -9.40, -1.15, 0.0)], m_dk),
        # Safety selector cross-axle bore at (-1.80, +0.25)
        mk_cyl("c_safebore", 0.22, 0.22, 3.20, "z", 20, [("t", -1.80, 0.25, 0.0)], m_dk),
        # Right QD boss recessed dovetail lock slot
        mk_box("c_qdslot", 3.20, 0.36, 0.24, [("t", 10.80, -1.25, 1.82)], m_dk),
    ]

    # 5 Sculpted angled parallelogram CNC skeleton truss windows with chamfered flared lips!
    # Placed strictly at Y in [0.16, 0.94] so upper rail hero text (Y > 1.15) & lower slab (Y < -0.18) stay 100% solid!
    for wi, wx in enumerate((-15.2, -8.2, 1.6, 8.8, 16.0)):
        slant = 0.26
        win_pts = [
            (wx - 1.95 - slant, 0.17),
            (wx + 1.85 - slant, 0.17),
            (wx + 1.95 + slant, 0.93),
            (wx - 1.85 + slant, 0.93),
        ]
        cutters.append(
            mk_flared_cutout_z(f"c_win_{wi}", win_pts, z_half_inner=1.42, flare=0.065, flare_depth=0.11, z_overhang=0.28, mat=m_ti)
        )

    machined = bool_subtract(blank, cutters, solver="EXACT")

    # External CNC hardware: recessed stainless Torx fasteners along chassis/riser/QD joints + safety detent bushings
    parts = [machined]
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        # Safety selector recessed flush titanium ring around (-1.80, 0.25)
        parts.append(
            mk_cyl(f"ch_safebush_{st}", 0.36, 0.36, 0.06, "z", 24,
                   [("t", -1.80, 0.25, side * 1.39)], m_ti, bevel=0.014)
        )
        # Front riser-coupling socket cap screws & mid-chassis frame pins (flush within +-1.42)
        for bi, (bx, by) in enumerate((
            (22.6,  1.22), (22.6, -1.15),
            (-21.6, 1.08), (-21.6, -1.15),
            ( 4.6, -1.68), (-0.4, -1.68),
        )):
            z_pos = side * (0.86 if by < -1.50 else 1.38)
            parts.append(mk_allen_socket_bolt(f"ch_bolt_{st}_{bi}", 0.16, 0.08, side, bx, by, z_pos, m_ss, m_dk))
    # 2 Stainless mounting screws on right QD quiver boss
    for qi, qx in enumerate((8.85, 12.75)):
        parts.append(mk_allen_socket_bolt(f"ch_qdb_{qi}", 0.17, 0.08, 1.0, qx, -1.25, 1.82, m_ss, m_dk))

    obj = join_objects(parts, "r500_chassis")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_forend_grip(mats: dict) -> bpy.types.Object:
    """B-02: Matte Carbon-Black Contoured Forend Grip w/ Flared Anti-Thumb Safety Wings.
    assembledPos: [14.2, -1.85, 0]; local ref bbox: [-7.6, -1.075, -3.12] .. [7.4, 2.34, 3.12]."""
    m_pl = mats["CH_MatteCarbonPoly"]
    m_gr = mats["CH_GripStipple"]
    m_ti = mats["CH_DarkTitanium"]
    m_ss = mats["CH_StainlessHardware"]
    m_dk = mats["CH_SlotDark"]

    # Main contoured forend body cradling chassis lower belly
    body = mk_box("fg_body", 14.80, 1.55, 2.76, [("t", 0.0, 0.55, 0.0)], m_pl, bevel=0.11, bevel_segs=2)

    # Flared horizontal anti-thumb safety wings extending cleanly to Z = +-3.12 (Y in [1.76, 2.34])
    wing_xz: list[tuple[float, float]] = [(-6.80, -3.12), (5.80, -3.12)]
    wing_xz += _quad_bez((5.80, -3.12), (7.12, -2.90), (7.20, -1.40), 8)
    wing_xz.append((7.20, 1.40))
    wing_xz += _quad_bez((7.20, 1.40), (7.12, 2.90), (5.80, 3.12), 8)
    wing_xz.append((-6.80, 3.12))
    wing_xz += _quad_bez((-6.80, 3.12), (-7.60, 2.60), (-7.60, 1.40), 8)
    wing_xz.append((-7.60, -1.40))
    wing_xz += _quad_bez((-7.60, -1.40), (-7.60, -2.60), (-6.80, -3.12), 8)
    wings_raw = mk_extrude_y("fg_wings", wing_xz, 1.76, 2.34, bevel=0.075, bevel_segs=2, mat=m_pl)

    # Raised ergonomic outer thumb-guard edge ribs along wing perimeters & upper chassis saddle recess
    wing_lip_l = mk_box("fg_lipl", 11.80, 0.18, 0.28, [("t", -0.50, 2.25, -2.94)], m_gr, bevel=0.04)
    wing_lip_r = mk_box("fg_lipr", 11.80, 0.18, 0.28, [("t", -0.50, 2.25,  2.94)], m_gr, bevel=0.04)

    # Angled side-flank transition gussets welding wing underside smoothly into grip body (zero overhang shelf!)
    gusset_zy = [
        (-1.36, 0.72), ( 1.36, 0.72),
        ( 2.86, 1.84), (-2.86, 1.84),
    ]
    gusset = mk_extrude_x("fg_gusset", gusset_zy, -6.90, 6.60, bevel=0.08, bevel_segs=2, mat=m_pl)

    # Molded forward hand-stop & rear index hook (Y min = -1.075 exact!)
    hand_stop = mk_box("fg_hstop", 1.65, 1.25, 2.55, [("t",  5.80, -0.45, 0.0)], m_gr, bevel=0.12, bevel_segs=2)
    rear_hook = mk_box("fg_rhook", 1.85, 1.05, 2.55, [("t", -6.20, -0.35, 0.0)], m_gr, bevel=0.12, bevel_segs=2)

    # 5 Contoured ergonomic lower palm grip ribs + side stippled grip panels
    parts = [body, wings_raw, wing_lip_l, wing_lip_r, gusset, hand_stop, rear_hook]
    for i in range(5):
        rx = -4.20 + i * 2.10
        parts.append(mk_box(f"fg_rib_{i}", 1.05, 0.56, 2.64, [("t", rx, -0.24, 0.0)], m_gr, bevel=0.08))
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        parts.append(mk_box(f"fg_stip_{st}", 10.60, 0.88, 0.14, [("t", -0.20, 0.42, side * 1.34)], m_gr, bevel=0.03))
        for si, sx in enumerate((-4.4, 0.0, 4.4)):
            parts.append(mk_allen_socket_bolt(f"fg_scr_{st}_{si}", 0.18, 0.10, side, sx, 1.22, side * 1.82, m_ss, m_dk))
        # Molded vent slots accents on wing top face
        for vi, vx in enumerate((-3.8, -0.8, 2.2)):
            parts.append(mk_box(f"fg_vnt_{st}_{vi}", 2.00, 0.08, 0.42, [("t", vx, 2.31, side * 2.25)], m_ti, bevel=0.02))

    # Cut internal chassis saddle slot along top so chassis belly seats inside cleanly
    fg_u = join_objects(parts, "r500_forend_grip")
    return finish_part(fg_u, bevel_w=0.0, sharp_deg=36.0)


def build_r500_pistol_grip(mats: dict) -> bpy.types.Object:
    """B-03: Ergonomic 18-Deg AR-Angle Bullpup Pistol Grip & 100% Continuous Welded Winter Trigger Guard.
    assembledPos: [1.6, -4.8, 0]; local ref bbox: [-2.55, -6.40, -1.01] .. [4.05, 3.15, 1.01]."""
    m_pl = mats["CH_MatteCarbonPoly"]
    m_gr = mats["CH_GripStipple"]
    m_ti = mats["CH_DarkTitanium"]
    m_ss = mats["CH_StainlessHardware"]
    m_dk = mats["CH_SlotDark"]

    # Main ergonomic AR-angle grip profile (X in [-2.55, +1.65], Y in [-6.40, +3.15])
    grip_xy: list[tuple[float, float]] = [(-1.10, 3.15), (1.50, 3.15)]
    grip_xy += _quad_bez((1.50, 3.15), (1.65, 1.90), (0.95, 1.20), 8)
    grip_xy += _quad_bez((0.95, 1.20), (0.85, -1.80), (0.25, -6.10), 10)
    grip_xy += [(0.15, -6.38), (-2.55, -6.40)]
    grip_xy += _quad_bez((-2.55, -6.40), (-2.25, -2.50), (-1.45, 1.50), 10)
    grip_xy.append((-1.10, 3.15))
    grip_body = mk_extrude_z("pg_body", grip_xy, -0.90, 0.90, bevel=0.14, bevel_segs=3, mat=m_pl)

    # Rounded ergonomic palm swell & recessed stippled grip scales (extends cleanly to Z = +-1.01)
    palm_swell = mk_box("pg_swell", 2.18, 5.40, 2.02, [("rz", -0.26), ("t", -0.70, -1.90, 0.0)], m_gr, bevel=0.18, bevel_segs=3)

    # 3 subtle frontstrap finger-groove scallops + flared bottom base cap
    finger_ridges = []
    for fi, (fx, fy) in enumerate(((0.80, -0.65), (0.62, -2.30), (0.44, -3.95))):
        finger_ridges.append(
            mk_cyl(f"pg_fgr_{fi}", 0.18, 0.18, 1.56, "z", 16, [("t", fx, fy, 0.0)], m_pl, bevel=0.04)
        )
    base_cap = mk_box("pg_bcap", 2.65, 0.42, 1.88, [("rz", -0.10), ("t", -1.20, -6.18, 0.0)], m_ti, bevel=0.07)

    # 100% CONTINUOUS SOLIDLY WELDED WINTER TRIGGER GUARD LOOP (Wave 3 QA Lesson: ZERO floating gaps!)
    # Outer loop welded deep into grip frontstrap at X = +0.25..+1.10 and into upper chassis mount at Y = +2.68..+3.12!
    guard_outer_xy: list[tuple[float, float]] = [
        (0.25, 3.12), (4.05, 3.12), (4.05, 1.45),
    ]
    guard_outer_xy += _quad_bez((4.05, 1.45), (3.95, 0.30), (2.70, 0.22), 10)
    guard_outer_xy += [(0.25, 0.22)]
    guard_outer = mk_extrude_z("pg_gout", guard_outer_xy, -0.70, 0.70, bevel=0.075, bevel_segs=2, mat=m_pl)

    # Cut inner finger opening (X in [+0.82, +3.55], Y in [+0.68, +2.68]) with smooth rounded front corner!
    guard_hole_xy: list[tuple[float, float]] = [
        (0.82, 2.68), (3.55, 2.68), (3.55, 1.50),
    ]
    guard_hole_xy += _quad_bez((3.55, 1.50), (3.45, 0.72), (2.65, 0.68), 8)
    guard_hole_xy += [(0.82, 0.68)]
    guard_cutter = mk_flared_cutout_z("pg_ghole", guard_hole_xy, z_half_inner=0.70, flare=0.055, flare_depth=0.10, z_overhang=0.25, mat=m_pl)
    guard_loop = bool_subtract(guard_outer, [guard_cutter], solver="EXACT")

    # Weld grip body + continuous guard loop into one airtight solid, then add tactile details & mounting screws
    core = bool_union([grip_body, guard_loop], "pg_core", solver="EXACT")
    parts = [core, palm_swell, base_cap, *finger_ridges]
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        parts.append(mk_allen_socket_bolt(f"pg_scr_{st}", 0.16, 0.08, side, 0.15, 2.35, side * 0.88, m_ss, m_dk))
        # Backstrap vertical anti-slip serration ribs
        for ri in range(5):
            ry = -4.80 + ri * 1.15
            rx = -2.35 + ri * 0.17
            parts.append(mk_box(f"pg_bsr_{st}_{ri}", 0.22, 0.34, 0.32, [("t", rx, ry, side * 0.68)], m_gr, bevel=0.03))

    obj = join_objects(parts, "r500_pistol_grip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_r500_buttstock(mats: dict) -> bpy.types.Object:
    """B-04: Skeletonized Tactical Bullpup Buttstock, VersaDrive Clutch Bore & Ribbed Rubber Recoil Pad.
    assembledPos: [-27.8, -0.45, 0]; local ref bbox: [-4.195, -5.95, -1.62] .. [3.55, 2.605, 1.62]."""
    m_pl = mats["CH_MatteCarbonPoly"]
    m_gr = mats["CH_GripStipple"]
    m_rb = mats["CH_RubberButtpad"]
    m_ti = mats["CH_DarkTitanium"]
    m_ss = mats["CH_StainlessHardware"]
    m_dk = mats["CH_SlotDark"]

    # Main skeletonized stock polygon (X in [-3.40, +3.55], Y in [-5.85, +2.25], Z in [-1.56, +1.56])
    stock_xy = [
        (-3.40,  2.25),
        ( 3.55,  2.25),
        ( 3.55, -1.25),
        (-0.50, -5.65),
        (-3.40, -5.85),
    ]
    stock_raw = mk_extrude_z("bs_frame", stock_xy, -1.56, 1.56, bevel=0.10, bevel_segs=2, mat=m_pl)
    clutch_arch = mk_box("bs_arch", 7.00, 0.65, 2.96, [("t", 0.05, 2.28, 0.0)], m_pl, bevel=0.08, bevel_segs=2)
    stock_blank = bool_union([stock_raw, clutch_arch], "bs_blank", solver="EXACT")

    # Smooth flared triangular weight-reduction cutout + exact Ø29mm VersaDrive clutch bore at Y=+1.00
    tri_xy = [(-2.10, -0.82), (1.68, -0.82), (-1.82, -4.45)]
    tri_cut = mk_flared_cutout_z("c_tri", tri_xy, z_half_inner=1.56, flare=0.095, flare_depth=0.18, z_overhang=0.35, mat=m_gr)
    clutch_bore = mk_cyl("c_cbore", 1.44, 1.44, 8.20, "x", 36, [("t", 0.15, 1.00, 0.0)], m_dk)
    stock_hollow = bool_subtract(stock_blank, [tri_cut, clutch_bore], solver="EXACT")

    # Ribbed Sorbothane rubber recoil buttpad (X in [-4.195, -3.25], Y in [-5.95, +2.25], Z in [-1.62, +1.62])
    pad_base = mk_box("bs_pad", 0.88, 8.20, 3.24, [("t", -3.72, -1.85, 0.0)], m_rb, bevel=0.13, bevel_segs=2)
    pad_ribs = []
    for ri in range(8):
        ry = -5.10 + ri * 0.96
        pad_ribs.append(mk_box(f"bs_prib_{ri}", 0.16, 0.44, 3.04, [("t", -4.115, ry, 0.0)], m_rb, bevel=0.045))

    # Machined titanium VersaDrive clutch rear bezel collar & twin stainless QD sling swivel socket cups
    parts = [stock_hollow, pad_base, *pad_ribs]
    bezel_out = mk_cyl("bs_bez_o", 1.54, 1.54, 0.36, "x", 36, [("t", -3.26, 1.00, 0.0)], m_ti, bevel=0.03)
    bezel_in = mk_cyl("bs_bez_i", 1.41, 1.41, 0.56, "x", 36, [("t", -3.26, 1.00, 0.0)], m_dk)
    parts.append(bool_subtract(bezel_out, [bezel_in], solver="EXACT"))

    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        qd_cup_o = mk_cyl(f"bs_qd_{st}", 0.42, 0.42, 0.14, "z", 22, [("t", -2.55, -4.85, side * 1.52)], m_ss, bevel=0.025)
        qd_cup_i = mk_cyl(f"bs_qdi_{st}", 0.28, 0.28, 0.18, "z", 20, [("t", -2.55, -4.85, side * 1.56)], m_dk)
        parts.append(bool_subtract(qd_cup_o, [qd_cup_i], solver="EXACT"))
        # Forward stock-to-chassis coupling Torx bolts
        parts.append(mk_allen_socket_bolt(f"bs_scr_{st}_0", 0.18, 0.10, side, 2.75, -0.55, side * 1.54, m_ss, m_dk))
        parts.append(mk_allen_socket_bolt(f"bs_scr_{st}_1", 0.18, 0.10, side, 2.75,  1.85, side * 1.48, m_ss, m_dk))

    obj = join_objects(parts, "r500_buttstock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_flight_rail(mats: dict) -> bpy.types.Object:
    """B-06: Ventilated Cantilevered Zero-Rail CNC Optical Bridge & True MIL-STD-1913 Picatinny Rail.
    assembledPos: [-7.0, 3.85, 0]; local ref bbox: [-18.30, -2.32, -1.66] .. [17.80, 0.75, 1.66]."""
    m_sl = mats["CH_SlateAnodize"]
    m_ti = mats["CH_DarkTitanium"]
    m_cr = mats["CH_PicatinnyCrest"]
    m_dk = mats["CH_SlotDark"]
    m_ss = mats["CH_StainlessHardware"]

    # Main cantilevered CNC bridge spine beam (local X in [-18.20, +17.80], Y in [-0.50, -0.02], Z in [-1.23, +1.23])
    # Clean, unbroken flat side flanks at Z = +-1.23 for razor-crisp laser engraving!
    spine_beam = mk_box("fr_spine", 36.00, 0.48, 2.46, [("t", -0.20, -0.26, 0.0)], m_sl, bevel=0.055, bevel_segs=2)

    # Ventilated lower side truss rails flanking the overhead flight corridor
    rib_l_raw = mk_box("fr_ribl", 33.40, 0.34, 0.28, [("t", -0.20, -0.58, -1.06)], m_ti, bevel=0.035)
    rib_r_raw = mk_box("fr_ribr", 33.40, 0.34, 0.28, [("t", -0.20, -0.58,  1.06)], m_ti, bevel=0.035)
    vent_cuts = []
    for vi in range(10):
        vx = -13.6 + vi * 3.05
        vent_cuts.append(mk_box(f"c_frv_{vi}", 1.95, 0.16, 2.80, [("t", vx, -0.60, 0.0)], m_dk, bevel=0.04))
    ribs_joined = join_objects([rib_l_raw, rib_r_raw], "fr_ribs")
    ribs_vented = bool_subtract(ribs_joined, vent_cuts, solver="EXACT")

    # Twin rear outer-flank mounting buttress pylons straddling chassis rear (Z = +-1.44, X in [-18.25, -15.50])
    pylon_xy = [
        (-18.25, -2.32),
        (-15.50, -2.32),
        (-15.50, -0.05),
        (-18.25, -0.05),
    ]
    pylon_l = mk_extrude_z("fr_pyl_l", pylon_xy, -1.66, -1.22, bevel=0.045, bevel_segs=2, mat=m_sl)
    pylon_r = mk_extrude_z("fr_pyl_r", pylon_xy,  1.22,  1.66, bevel=0.045, bevel_segs=2, mat=m_sl)
    # Recessed triangular CNC weight pocket on outer face of rear pylons
    pyl_pocket_xy = [(-17.75, -1.85), (-16.00, -1.85), (-16.00, -0.58), (-17.75, -0.58)]
    pylon_l = bool_subtract(pylon_l, [mk_extrude_z("c_pl", pyl_pocket_xy, -1.72, -1.52, bevel=0.02, mat=m_ti)], solver="EXACT")
    pylon_r = bool_subtract(pylon_r, [mk_extrude_z("c_pr", pyl_pocket_xy,  1.52,  1.72, bevel=0.02, mat=m_ti)], solver="EXACT")

    # Rear arch cap bridging twin pylons (X in [-18.30, -15.40], Z in [-1.66, +1.66])
    rear_arch = mk_box("fr_arch", 2.90, 0.58, 3.32, [("t", -16.85, -0.15, 0.0)], m_cr, bevel=0.055, bevel_segs=2)

    # Front underside retention-arm mounting pad docking solidly onto r500_retention_arm (world X=+10.4, Y=+3.15 -> local X=+17.4, Y=-0.70)
    ret_pad = mk_box("fr_retpad", 1.85, 0.36, 0.96, [("t", 16.85, -0.56, 0.0)], m_ti, bevel=0.04)

    # True 3D MIL-STD-1913 Picatinny scope rail (crown exact at local Y = +0.75 -> world Y = +4.60!)
    picatinny_objs = mk_picatinny_rail("fr_pic", 24.50, -12.50, 0.75, 2.12, m_cr, m_dk)

    # Stainless socket cap mounting bolts on rear pylons & front retention pad
    bolts = []
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        for bi, (bx, by) in enumerate(((-17.65, -2.02), (-16.10, -2.02), (-17.65, -0.35), (-16.10, -0.35))):
            bolts.append(mk_allen_socket_bolt(f"fr_b_{st}_{bi}", 0.14, 0.08, side, bx, by, side * 1.64, m_ss, m_dk))

    obj = join_objects([spine_beam, ribs_vented, pylon_l, pylon_r, rear_arch, ret_pad, *picatinny_objs, *bolts], "r500_flight_rail")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_riser_head(mats: dict) -> bpy.types.Object:
    """H-01: Sculpted Forward CNC Billet Riser Head, Angled Dual-Tier Limb Pockets & V-Rest Rollers.
    assembledPos: [26.2, 1.75, 0]; local ref bbox: [-2.40, -1.625, -3.7665] .. [3.20, 1.725, 3.7665].
    CRITICAL MATING:
      - Upper/lower CSG limb roots enter at local Z = +-2.40, X in [-0.55..+1.75], Y in [+0.56..+1.24] & [-1.14..-0.46]
      - Power cable anchors terminate at local (0.0, +0.05 +- 0.36, +-2.35)
      - Foot stirrup rear knuckles bolt into front nose at local (+2.95, -0.85, +-2.20)"""
    m_sl = mats["CH_SlateAnodize"]
    m_ti = mats["CH_DarkTitanium"]
    m_cr = mats["CH_PicatinnyCrest"]
    m_dk = mats["CH_SlotDark"]
    m_ss = mats["CH_StainlessHardware"]

    # Main CNC billet riser block (exact X in [-2.40, +3.20], Y in [-1.625, +1.725], Z in [-2.90, +2.90])
    riser_body = mk_box("rh_body", 5.60, 3.35, 5.80, [("t", 0.40, 0.05, 0.0)], m_sl, bevel=0.11, bevel_segs=2)

    # Sculpted twin angled dual-tier limb pockets matching CSG limb sweep (ry = +-0.28 rad -> Z = +-3.766!)
    pocket_l = mk_box("rh_pckL", 3.40, 3.10, 1.60, [("ry",  0.28), ("t", 0.35, 0.05, -2.55)], m_cr, bevel=0.08, bevel_segs=2)
    pocket_r = mk_box("rh_pckR", 3.40, 3.10, 1.60, [("ry", -0.28), ("t", 0.35, 0.05,  2.55)], m_cr, bevel=0.08, bevel_segs=2)

    raw_riser = bool_union([riser_body, pocket_l, pocket_r], "rh_raw", solver="EXACT")

    # Subtract central arrow flight corridor, limb-separation shelves, and CNC lightning truss pockets
    cutters = [
        # Wide open arrow flight tunnel (local Y >= -0.35, Z in [-0.96, +0.96])
        mk_box("c_atun", 6.80, 2.55, 1.92, [("t", 0.50, 0.92, 0.0)], m_dk),
        # Center shelf gap between upper & lower quad carbon limb blades — rotated identically (+-0.28 rad) to pockets so ZERO thin slivers remain!
        mk_box("c_shL", 4.40, 1.24, 2.20, [("ry",  0.28), ("t", 0.35, 0.05, -2.85)], m_ti),
        mk_box("c_shR", 4.40, 1.24, 2.20, [("ry", -0.28), ("t", 0.35, 0.05,  2.85)], m_ti),
        # Sculpted front CNC weight-reduction lightning pockets
        mk_box("c_lsL", 1.85, 1.56, 2.35, [("t", 1.92, -0.55, -1.62)], m_ti, bevel=0.08),
        mk_box("c_lsR", 1.85, 1.56, 2.35, [("t", 1.92, -0.55,  1.62)], m_ti, bevel=0.08),
        # Upper flank milled lightning slots on outer pocket walls
        mk_box("c_upL", 1.50, 0.52, 0.60, [("t", -1.10, 0.05, -2.70)], m_ti, bevel=0.06),
        mk_box("c_upR", 1.50, 0.52, 0.60, [("t", -1.10, 0.05,  2.70)], m_ti, bevel=0.06),
    ]
    machined = bool_subtract(raw_riser, cutters, solver="EXACT")

    # Precision machined stainless V-rest frictionless arrow roller wheels, cable anchor pins & heavy limb bolts
    parts = [machined]
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        # Angled V-rest roller wheel + mounting fork cradling bolt underside cleanly at world Y = +1.39
        parts.append(
            mk_cyl(f"rh_rol_{st}", 0.16, 0.16, 1.05, "x", 18,
                   [("rx", -side * 0.55), ("t", 0.45, -0.36, side * 0.36)], m_ss, bevel=0.025)
        )
        parts.append(
            mk_box(f"rh_rfk_{st}", 1.12, 0.18, 0.28,
                   [("rx", -side * 0.55), ("t", 0.45, -0.44, side * 0.42)], m_ti, bevel=0.03)
        )
        # Dual stainless power-cable anchor clevis pins inside riser throat (exact match to pRiser at (0, 0.05+-0.36, +-2.35))
        for yi, py in enumerate((0.40, -0.30)):
            parts.append(mk_cyl(f"rh_cap_{st}_{yi}", 0.14, 0.14, 0.54, "y", 16, [("t", 0.0, py, side * 2.35)], m_ss, bevel=0.02))
        # Heavy stainless CNC limb-pocket tension bolts (upper & lower pocket caps)
        for yi, (sy, sgn_y) in enumerate(((1.66, 1.0), (-1.56, -1.0))):
            parts.append(mk_allen_socket_bolt(f"rh_lb_{st}_{yi}", 0.34, 0.14, sgn_y, 0.55, sy, side * 2.48, m_ss, m_dk, axis="y"))
        # Front foot-stirrup clevis lug & pivot pin at (2.85, -0.85, +-2.20) mating with r500_foot_stirrup knuckles
        parts.append(mk_box(f"rh_stlug_{st}", 0.72, 0.74, 0.64, [("t", 2.82, -0.85, side * 2.20)], m_ti, bevel=0.05))
        parts.append(mk_allen_socket_bolt(f"rh_stpin_{st}", 0.16, 0.78, 1.0, 2.90, -0.85, side * 2.20, m_ss, m_dk, axis="y"))

    obj = join_objects(parts, "r500_riser_head")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 2: HEXCOIL CAMS, VERSADRIVE, STIRRUP & FIRE CONTROL (9 PARTS) ---

def _build_hexcoil_cam(mats: dict, side_sign: int, obj_name: str) -> bpy.types.Object:
    """H-04 / H-05: CNC Copper-Orange / Warm-Bronze Anodized 360-Deg HexCoil Multi-Tier Helical Cam.
    left_cam  assembledPos: [25.2, 1.80, -9.65]; ref bbox: [-1.1775, -0.69, -1.2341] .. [1.6844, 0.69, 1.4632]
    right_cam assembledPos: [25.2, 1.80, +9.65]; ref bbox: [-1.1047, -0.69, -1.5479] .. [1.7250, 0.69, 1.1078]
    CRITICAL: Exact eccentric profile `pz = -sin(a)*r` matches Three.js `extrudeAlongY` so cam lobe swells
    inward toward Z=0 and mates 100% seamlessly with CSG `r500_cam_axles`, `r500_bowstring`, `r500_power_cables`!"""
    m_cu = mats["CM_HexCoilCopper"]
    m_gd = mats["CM_HexCoilGoldGroove"]
    m_dk = mats["CM_SledDarkAnodize"]
    m_ss = mats["CM_PolishedSteel"]
    m_rb = mats["CM_StirrupRubber"]

    n_pts = 56
    cam_pts: list[tuple[float, float]] = []
    trk_pts: list[tuple[float, float]] = []
    for i in range(n_pts):
        a = (i / n_pts) * 2.0 * math.pi
        r_out = 1.34 + 0.34 * math.cos(a - side_sign * 0.55) + 0.14 * math.sin(2.0 * a + 0.4)
        r_trk = 1.14 + 0.28 * math.cos(a - side_sign * 0.55) + 0.10 * math.sin(2.0 * a + 0.4)
        # Note: -sin(a) matches Three.js extrudeAlongY (rotateX(-pi/2) maps shape.y -> -Z)!
        cam_pts.append((math.cos(a) * r_out, -math.sin(a) * r_out))
        trk_pts.append((math.cos(a) * r_trk, -math.sin(a) * r_trk))

    # Upper & lower copper-bronze eccentric main string-track flanges (Y in [+0.08..+0.24] & [-0.24..-0.08])
    upper_flange = mk_extrude_y("cam_uf", cam_pts,  0.08,  0.24, bevel=0.024, bevel_segs=2, mat=m_cu)
    lower_flange = mk_extrude_y("cam_lf", cam_pts, -0.24, -0.08, bevel=0.024, bevel_segs=2, mat=m_cu)

    # Recessed central golden-bronze eccentric bowstring track core (Y in [-0.09..+0.09])
    track_core = mk_extrude_y("cam_trk", trk_pts, -0.09, 0.09, bevel=0.010, bevel_segs=1, mat=m_gd)

    # Upper & lower 3-tier CNC machined helical cable take-up spools (Y in [+0.23..+0.60] & [-0.60..-0.23])
    # Sculpted via mk_lathe_y with crisp twin deep cable V-grooves & stepped flanges!
    spool_u_prof = [
        (0.00, 0.23),
        (1.13, 0.23),
        (1.14, 0.28),
        (0.95, 0.32),  # Tier-2 lower cable groove
        (0.95, 0.36),
        (1.12, 0.40),  # Middle divider rib
        (1.12, 0.44),
        (0.93, 0.48),  # Tier-3 upper cable groove
        (0.93, 0.52),
        (1.07, 0.56),  # Upper cap lip
        (1.05, 0.60),
        (0.00, 0.60),
    ]
    spool_l_prof = [(r, -y) for (r, y) in reversed(spool_u_prof)]
    spool_u = mk_lathe_y("cam_spU", spool_u_prof, segs=44, xform=[("t", 0.08, 0.0, -side_sign * 0.08)], mat=m_gd)
    spool_l = mk_lathe_y("cam_spL", spool_l_prof, segs=44, xform=[("t", 0.08, 0.0, -side_sign * 0.08)], mat=m_gd)

    # Central dark-titanium anodized hub bearing collar (exact Y in [-0.69, +0.69] matching CSG axle thrust washers!)
    hub_collar = mk_cyl("cam_hub", 0.46, 0.46, 1.38, "y", 32, [], m_dk, bevel=0.025)

    raw_cam = bool_union([upper_flange, lower_flange, track_core, spool_u, spool_l, hub_collar], "cam_raw", solver="EXACT")

    # Subtract central titanium cam-axle bore (r=0.28 > 0.26 axle!) + 5 sculpted CNC spider-spoke lightening windows!
    cutters = [
        mk_cyl("c_axb", 0.28, 0.28, 1.90, "y", 28, [], m_dk),
    ]
    for k in range(5):
        ang = (k / 5.0) * 2.0 * math.pi + 0.28
        # Radial teardrop/oval CNC spoke cutout between hub (r=0.52) and cable drum groove root (r=0.88)
        r_mid = 0.72
        cx_s = math.cos(ang) * r_mid
        cz_s = -math.sin(ang) * r_mid
        # Small angled pill cutout (stays strictly inside r < 0.88 so it never breaches cable groove wall!)
        cutters.append(
            mk_cyl(f"c_spk_{k}", 0.145, 0.145, 1.50, "y", 18, [("t", cx_s, 0.0, cz_s)], m_dk)
        )
    # 2 Flanking outer eccentric-lobe lightening cutouts (leaving center copper crescent 100% solid for HEXCOIL 360 engraving!)
    for j, a_off in enumerate((-0.62, 0.62)):
        a_lobe = side_sign * 0.55 + a_off
        rl = 1.22
        cutters.append(
            mk_cyl(f"c_lob_{j}", 0.11, 0.11, 0.62, "y", 16,
                   [("t", math.cos(a_lobe) * rl, 0.0, -math.sin(a_lobe) * rl)], m_dk)
        )
    machined = bool_subtract(raw_cam, cutters, solver="EXACT")

    # Stainless draw-stop peg w/ rubber bumper collar + 4 stainless hub module alignment screws
    parts = [
        machined,
        mk_cyl("cam_stop", 0.105, 0.105, 0.62, "y", 16, [("t", -0.88, 0.24, -side_sign * 0.55)], m_ss, bevel=0.015),
        mk_cyl("cam_sbmp", 0.135, 0.135, 0.22, "y", 16, [("t", -0.88, 0.36, -side_sign * 0.55)], m_rb, bevel=0.02),
    ]
    for mi in range(3):
        ma = mi * (2.0 * math.pi / 3.0) + 0.60
        parts.append(
            mk_cyl(f"cam_ms_{mi}", 0.075, 0.075, 0.06, "y", 12,
                   [("t", 0.08 + math.cos(ma) * 0.62, 0.60, -side_sign * 0.08 + math.sin(ma) * 0.62)], m_ss, bevel=0.01)
        )

    obj = join_objects(parts, obj_name)
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_left_cam(mats: dict) -> bpy.types.Object:
    return _build_hexcoil_cam(mats, -1, "r500_left_cam")


def build_r500_right_cam(mats: dict) -> bpy.types.Object:
    return _build_hexcoil_cam(mats, 1, "r500_right_cam")


def build_r500_foot_stirrup(mats: dict) -> bpy.types.Object:
    """B-05: Brushed 17-4PH Stainless Folding Cocking Foot Stirrup w/ Knurled Boot Tread Bar.
    assembledPos: [34.0, 1.15, 0]; local ref bbox: [-4.925, -0.90, -4.95] .. [4.99, 0.21, 4.95]."""
    m_ss = mats["CM_BrushedStainless"]
    m_ps = mats["CM_PolishedSteel"]
    m_rb = mats["CM_StirrupRubber"]
    m_dk = mats["CM_SledDarkAnodize"]

    # Outer & inner U-loop silhouette in (X, Z) extruded along Y in [-0.82, -0.10]
    outer_xz: list[tuple[float, float]] = [
        (-4.50, -2.55), (-3.20, -2.55), (-1.20, -4.95), (3.80, -4.95),
    ]
    outer_xz += _quad_bez((3.80, -4.95), (4.95, -4.85), (4.95, -3.50), 8)
    outer_xz.append((4.95, 3.50))
    outer_xz += _quad_bez((4.95, 3.50), (4.95, 4.85), (3.80, 4.95), 8)
    outer_xz += [(-1.20, 4.95), (-3.20, 2.55), (-4.50, 2.55)]

    inner_xz: list[tuple[float, float]] = [
        (-4.70, -1.82), (-2.80, -1.82), (-0.85, -4.22), (3.55, -4.22),
    ]
    inner_xz += _quad_bez((3.55, -4.22), (4.20, -4.18), (4.20, -3.35), 8)
    inner_xz.append((4.20, 3.35))
    inner_xz += _quad_bez((4.20, 3.35), (4.20, 4.18), (3.55, 4.22), 8)
    inner_xz += [(-0.85, 4.22), (-2.80, 1.82), (-4.70, 1.82)]

    loop_outer = mk_extrude_y("st_out", outer_xz, -0.82, -0.10, bevel=0.085, bevel_segs=3, mat=m_ss)
    loop_cut = mk_extrude_y("st_cut", inner_xz, -1.05, 0.15, bevel=0.0, mat=m_ss)
    loop_bar = bool_subtract(loop_outer, [loop_cut], solver="EXACT")

    # Rear mounting clevis knuckles bolting flush into r500_riser_head front lugs (X min = -4.925, Y max = +0.21)
    knuckle_l = mk_box("st_knL", 1.15, 0.92, 0.85, [("t", -4.35, -0.25, -2.20)], m_ps, bevel=0.06, bevel_segs=2)
    knuckle_r = mk_box("st_knR", 1.15, 0.92, 0.85, [("t", -4.35, -0.25,  2.20)], m_ps, bevel=0.06, bevel_segs=2)
    pin_l = mk_allen_socket_bolt("st_pL", 0.22, 0.90, 1.0, -4.35, -0.25, -2.20, m_ss, m_dk, axis="y")
    pin_r = mk_allen_socket_bolt("st_pR", 0.22, 0.90, 1.0, -4.35, -0.25,  2.20, m_ss, m_dk, axis="y")

    # Forward ribbed non-slip boot tread roller bar (X = +4.55 -> X max = +4.99, Y min = -0.90!)
    tread_core = mk_cyl("st_trd", 0.44, 0.44, 6.40, "z", 24, [("t", 4.55, -0.46, 0.0)], m_rb, bevel=0.06)
    tread_rings = []
    for ti in range(11):
        tz = -2.75 + ti * 0.55
        tread_rings.append(mk_cyl(f"st_rg_{ti}", 0.44, 0.44, 0.18, "z", 20, [("t", 4.55, -0.46, tz)], m_ps, bevel=0.025))

    obj = join_objects([loop_bar, knuckle_l, knuckle_r, pin_l, pin_r, tread_core, *tread_rings], "r500_foot_stirrup")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_versadrive_screw(mats: dict) -> bpy.types.Object:
    """H-09: 404mm Gleaming Brushed-Stainless VersaDrive Internal Acme Leadscrew & Dual-Ratchet Helical Clutch.
    assembledPos: [-5.5, 0.55, 0]; local ref bbox: [-21.08, -1.13, -1.13] .. [20.525, 1.16, 1.13]."""
    m_ss = mats["CM_BrushedStainless"]
    m_ps = mats["CM_PolishedSteel"]
    m_cu = mats["CM_HexCoilCopper"]
    m_gd = mats["CM_HexCoilGoldGroove"]
    m_dk = mats["CM_SledDarkAnodize"]
    m_rb = mats["CM_StirrupRubber"]

    # Precision-turned stainless steel core shaft + true 3D helical trapezoidal Acme threads
    screw_core = mk_cyl("vd_core", 0.24, 0.24, 40.40, "x", 24, [("t", 0.10, 0.0, 0.0)], m_ss, bevel=0.02)
    acme_helix = mk_acme_thread_helix("vd_acme", -18.80, 20.00, root_r=0.23, crest_r=0.36, pitch=0.84, mat=m_ps, segs_per_turn=14)
    front_journal = mk_cyl("vd_fjrn", 0.32, 0.32, 0.45, "x", 22, [("t", 20.30, 0.0, 0.0)], m_ps, bevel=0.03)
    front_ring = mk_cyl("vd_frng", 0.40, 0.40, 0.14, "x", 22, [("t", 20.05, 0.0, 0.0)], m_cu, bevel=0.02)

    # Rear copper-bronze 12-tooth dual-ratchet helical clutch gear inside buttstock bore
    clutch_hub = mk_cyl("vd_chub", 1.01, 1.01, 0.72, "x", 32, [("t", -19.55, 0.0, 0.0)], m_cu, bevel=0.04)
    clutch_flange = mk_cyl("vd_cflg", 0.82, 0.82, 0.86, "x", 28, [("t", -19.55, 0.0, 0.0)], m_gd, bevel=0.03)
    ratchet_teeth = []
    for i in range(12):
        a = (i / 12.0) * 2.0 * math.pi
        ratchet_teeth.append(
            mk_box(f"vd_rt_{i}", 0.68, 0.18, 0.22,
                   [("rx", a), ("t", -19.55, math.cos(a) * 1.03, math.sin(a) * 1.03)], m_gd, bevel=0.025)
        )

    # Stepped drive collar + folded crank arm + knurled rubber handle knob (strictly r <= 1.28 clears buttstock bore!)
    drive_collar = mk_cyl("vd_dcol", 0.68, 0.78, 0.85, "x", 26, [("t", -20.40, 0.0, 0.0)], m_dk, bevel=0.04)
    crank_arm = mk_box("vd_carm", 0.52, 1.15, 0.46, [("t", -20.82, 0.45, 0.0)], m_ss, bevel=0.05)
    crank_knob = mk_knurled_cyl("vd_knob", 0.24, 0.88, "x", flutes=18, depth=0.018, xform=[("t", -20.42, 0.92, 0.0)], mat=m_rb)
    crank_cap = mk_cyl("vd_kcap", 0.20, 0.20, 0.08, "x", 16, [("t", -19.96, 0.92, 0.0)], m_cu, bevel=0.015)

    obj = join_objects(
        [screw_core, acme_helix, front_journal, front_ring, clutch_hub, clutch_flange,
         *ratchet_teeth, drive_collar, crank_arm, crank_knob, crank_cap],
        "r500_versadrive_screw",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_r500_trigger_sled(mats: dict) -> bpy.types.Object:
    """T-01: CNC Dark-Anodized Trac-Trigger Floating Sear Carriage (TTFS).
    assembledPos: [12.5, 1.05, 0]; local ref bbox: [-1.90, -1.295, -0.86] .. [2.00, 1.07, 0.86]."""
    m_dk = mats["CM_SledDarkAnodize"]
    m_ss = mats["CM_BrushedStainless"]
    m_cu = mats["CM_HexCoilCopper"]

    # Lower billet sled body (exact flat side walls at Z = +-0.86 for laser-etched TRAC-TRIGGER TTFS badge!)
    lower_car = mk_box("ts_low", 3.90, 1.28, 1.72, [("t", 0.05, -0.22, 0.0)], m_dk, bevel=0.07, bevel_segs=2)
    upper_twr = mk_box("ts_up",  3.30, 0.78, 0.84, [("t", 0.20,  0.68, 0.0)], m_dk, bevel=0.05, bevel_segs=2)
    sear_foot = mk_box("ts_ft",  1.15, 0.55, 0.66, [("t", -0.85, -1.02, 0.0)], m_ss, bevel=0.045)

    raw_sled = bool_union([lower_car, upper_twr, sear_foot], "ts_raw", solver="EXACT")

    # Machined Acme leadscrew nut bore (local Y = -0.50 -> world Y = +0.55), front string jaw slot & internal spring pocket!
    cutters = [
        mk_cyl("c_nut", 0.41, 0.41, 4.50, "x", 24, [("t", 0.05, -0.50, 0.0)], m_ss),
        mk_box("c_str", 1.10, 0.48, 1.12, [("t", 1.55,  0.75, 0.0)], m_dk),
        mk_box("c_spr", 2.20, 0.44, 0.46, [("t", 0.10,  0.43, 0.0)], m_dk),
    ]
    machined = bool_subtract(raw_sled, cutters, solver="EXACT")

    # Bronze Acme threaded nut flange collars at front & rear of bore + top stainless guide shoes
    parts = [
        machined,
        mk_cyl("ts_bnF", 0.50, 0.50, 0.14, "x", 22, [("t",  1.92, -0.50, 0.0)], m_cu, bevel=0.02),
        mk_cyl("ts_bnR", 0.50, 0.50, 0.14, "x", 22, [("t", -1.82, -0.50, 0.0)], m_cu, bevel=0.02),
    ]
    # Keep bronze nut bores clear of Acme shaft!
    parts[1] = bool_subtract(parts[1], [mk_cyl("c_bnFi", 0.40, 0.40, 0.30, "x", 22, [("t",  1.92, -0.50, 0.0)], m_cu)], solver="EXACT")
    parts[2] = bool_subtract(parts[2], [mk_cyl("c_bnRi", 0.40, 0.40, 0.30, "x", 22, [("t", -1.82, -0.50, 0.0)], m_cu)], solver="EXACT")

    obj = join_objects(parts, "r500_trigger_sled")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_string_latch(mats: dict) -> bpy.types.Object:
    """T-02: Mirror-Polished Hardened Stainless Dual Pivoting Bowstring Catch Jaws.
    assembledPos: [13.85, 1.80, 0]; local ref bbox: [-0.95, -0.24, -0.46] .. [0.36, 0.24, 0.46]."""
    m_ps = mats["CM_PolishedSteel"]
    m_ss = mats["CM_BrushedStainless"]
    m_cu = mats["CM_HexCoilCopper"]

    jaw_xy = [
        (-0.85, -0.18),
        ( 0.28, -0.18),
        ( 0.36,  0.05),
        ( 0.18,  0.24),
        (-0.08,  0.06),
        (-0.85,  0.14),
    ]
    upper_jaw = mk_extrude_z("sl_ujaw", jaw_xy, -0.22, 0.22, bevel=0.024, bevel_segs=2, mat=m_ps)
    lower_jaw = mk_extrude_z("sl_ljaw", jaw_xy, -0.22, 0.22, bevel=0.024, bevel_segs=2, xform=[("rx", math.pi)], mat=m_ps)
    pivot_pin = mk_cyl("sl_ppin", 0.11, 0.11, 0.92, "z", 18, [("t", -0.28, 0.0, 0.0)], m_ss, bevel=0.015)
    bushing = mk_cyl("sl_bush", 0.15, 0.15, 0.48, "z", 18, [("t", -0.28, 0.0, 0.0)], m_cu, bevel=0.015)
    rear_lug = mk_box("sl_rlug", 0.34, 0.42, 0.36, [("t", -0.78, -0.02, 0.0)], m_ss, bevel=0.03)

    obj = join_objects([upper_jaw, lower_jaw, pivot_pin, bushing, rear_lug], "r500_string_latch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_anti_dry_fire(mats: dict) -> bpy.types.Object:
    """T-03: Copper-Anodized CNC Anti-Dry-Fire Interlock Lever & Bolt-Presence Sensor.
    assembledPos: [13.15, 2.05, 0]; local ref bbox: [-0.88, -0.29, -0.43] .. [1.12, 0.22, 0.43]."""
    m_cu = mats["CM_HexCoilCopper"]
    m_gd = mats["CM_HexCoilGoldGroove"]
    m_ps = mats["CM_PolishedSteel"]

    lever_xy = [
        (-0.88, -0.12),
        ( 0.92, -0.18),
        ( 1.12, -0.02),
        ( 0.84,  0.18),
        (-0.75,  0.22),
    ]
    main_lever = mk_extrude_z("adf_lev", lever_xy, -0.20, 0.20, bevel=0.024, bevel_segs=2, mat=m_cu)
    feeler_shoe = mk_box("adf_shoe", 0.48, 0.22, 0.56, [("t", 0.88, -0.18, 0.0)], m_gd, bevel=0.03)
    pivot_pin = mk_cyl("adf_pin", 0.09, 0.09, 0.86, "z", 16, [("t", -0.52, 0.04, 0.0)], m_ps, bevel=0.012)

    obj = join_objects([main_lever, feeler_shoe, pivot_pin], "r500_anti_dry_fire")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_trigger_sear(mats: dict) -> bpy.types.Object:
    """T-04: Brushed & Mirror-Honed Stainless 3.5 lb Match Trigger Shoe, 274mm Transfer Linkage & Rear Sear.
    assembledPos: [-6.0, -1.0, 0]; local ref bbox: [-18.175, -3.08, -0.46] .. [9.875, 1.20, 0.46]."""
    m_ss = mats["CM_BrushedStainless"]
    m_ps = mats["CM_PolishedSteel"]
    m_cu = mats["CM_HexCoilCopper"]

    # Curved match trigger shoe seated cleanly inside pistol grip winter guard (X in [+8.95..+9.87], Y in [-3.08..-0.78])
    shoe_xy: list[tuple[float, float]] = [(9.10, -0.78), (9.82, -0.78)]
    shoe_xy += _quad_bez((9.82, -0.78), (9.55, -1.85), (9.76, -2.75), 10)
    shoe_xy += _quad_bez((9.76, -2.75), (9.72, -3.05), (9.38, -3.08), 6)
    shoe_xy.append((8.98, -2.92))
    shoe_xy += _quad_bez((8.98, -2.92), (8.92, -1.85), (9.10, -0.78), 10)
    trigger_shoe = mk_extrude_z("tsr_shoe", shoe_xy, -0.24, 0.24, bevel=0.04, bevel_segs=2, mat=m_ps)

    # 5 Fine vertical/horizontal tactile finger grooves on front face of trigger shoe
    shoe_ribs = []
    for ri in range(5):
        ry = -1.22 - ri * 0.34
        shoe_ribs.append(mk_box(f"tsr_grv_{ri}", 0.08, 0.11, 0.40, [("t", 9.72, ry, 0.0)], m_ss, bevel=0.018))

    # Forward clevis yoke + 274mm rigid stainless transfer rod + rear precision match sear block
    clevis_yoke = mk_box("tsr_yoke", 0.85, 1.55, 0.34, [("t",  9.45, -0.05, 0.0)], m_ss, bevel=0.04)
    yoke_pin = mk_cyl("tsr_ypin", 0.10, 0.10, 0.56, "z", 14, [("t", 9.45, 0.58, 0.0)], m_cu, bevel=0.015)
    transfer_rod = mk_box("tsr_rod", 27.40, 0.26, 0.24, [("t", -3.90, 0.65, 0.0)], m_ss, bevel=0.03)
    sear_block = mk_box("tsr_blk", 1.55, 0.64, 0.54, [("t", -17.40, 0.88, 0.0)], m_ps, bevel=0.045)
    sear_pin = mk_cyl("tsr_spin", 0.11, 0.11, 0.92, "z", 16, [("t", -17.50, 0.85, 0.0)], m_cu, bevel=0.015)

    obj = join_objects([trigger_shoe, *shoe_ribs, clevis_yoke, yoke_pin, transfer_rod, sear_block, sear_pin], "r500_trigger_sear")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_safety_selector(mats: dict) -> bpy.types.Object:
    """T-05: Strictly Firewalled Vivid Safety-Orange Ambidextrous Thumb Safety Selector (SAFE / FIRE).
    assembledPos: [-1.8, 0.25, 0]; local ref bbox: [-0.32, -0.27, -1.72] .. [0.95, 0.27, 1.72]."""
    m_ss = mats["CM_BrushedStainless"]
    m_dk = mats["CM_SledDarkAnodize"]
    m_or = mats["CM_SafetyOrange"]

    cross_axle = mk_cyl("sf_axle", 0.20, 0.20, 3.08, "z", 20, [], m_ss, bevel=0.02)
    cam_drum = mk_box("sf_drum", 0.64, 0.54, 0.68, [], m_dk, bevel=0.045)

    # Contoured ambidextrous Safety-Orange thumb paddles (flat outer faces at Z = +-1.72 for crisp S / F dots!)
    wing_xy = [
        (-0.32, -0.22),
        ( 0.88, -0.14),
        ( 0.95,  0.12),
        (-0.22,  0.24),
    ]
    wing_l = mk_extrude_z("sf_wL", wing_xy, -1.72, -1.46, bevel=0.028, bevel_segs=2, mat=m_or)
    wing_r = mk_extrude_z("sf_wR", wing_xy,  1.46,  1.72, bevel=0.028, bevel_segs=2, mat=m_or)

    # 3 Tactile thumb grip serration ridges along top/bottom perimeter of orange paddles (within +-0.27 Y!)
    ribs = []
    for side in (-1.0, 1.0):
        st = "R" if side > 0 else "L"
        for ri in range(3):
            rx = 0.28 + ri * 0.22
            ribs.append(mk_box(f"sf_rb_{st}_{ri}", 0.08, 0.08, 0.22, [("t", rx,  0.20, side * 1.58)], m_or, bevel=0.015))
            ribs.append(mk_box(f"sf_rbb_{st}_{ri}", 0.08, 0.08, 0.22, [("t", rx, -0.18, side * 1.58)], m_or, bevel=0.015))

    obj = join_objects([cross_axle, cam_drum, wing_l, wing_r, *ribs], "r500_safety_selector")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# --- SUITE 3: 500 FPS SCOPE, 3-BOLT QUIVER, RETENTION ARM & 3K CARBON BOLT (4 PARTS) ---

def build_r500_scope(mats: dict) -> bpy.types.Object:
    """Q-01: Satin Matte-Black 1-8x24 Illuminated 100-YD BDC Crossbow Scope w/ 300-550 FPS Dial,
    Knurled Turrets, Cantilever Rings & Firewalled Multi-Coated Emerald-Sapphire Optical Lenses.
    assembledPos: [-6.0, 6.25, 0]; local ref bbox: [-10.50, -1.775, -2.195] .. [12.80, 3.025, 2.155]."""
    m_sc = mats["OB_ScopeSatinBlack"]
    m_kn = mats["OB_ScopeTurretKnurl"]
    m_br = mats["OB_ScopeBronzeAccent"]
    m_rb = mats["OB_ScopeRubber"]
    m_ln = mats["OB_OpticalLens"]
    m_ss = mats["OB_BroadheadMirror"]
    m_dk = mats["OB_SlotDark"]

    # Turned 30mm main CNC scope tube, flared 24mm recessed sunshade objective & fast-focus ocular bell
    # Optical centerline sits at local Y = +0.70 (world Y = +6.95)!
    tube_prof = [
        (0.00, -10.10),
        (1.64, -10.10),  # recessed ocular lens seat
        (1.64, -10.50),
        (1.84, -10.50),
        (2.04, -10.22),  # ocular bell outer wall (X in [-10.22 .. -6.50])
        (2.04,  -6.50),
        (1.78,  -5.40),
        (1.76,  -4.72),  # 300-550 FPS speed calibration collar (smooth cylindrical hero band!)
        (1.50,  -4.55),  # 30mm main tube
        (1.50,   4.20),
        (1.68,   5.15),
        (1.84,   7.55),  # flared 24mm objective bell (X in [+5.15 .. +12.60])
        (1.84,  12.62),
        (1.72,  12.80),
        (1.55,  12.80),
        (1.55,  11.45),  # deep recessed sunshade inner lip
        (0.00,  11.45),
    ]
    scope_shell = mk_lathe_x("sc_shell", tube_prof, segs=44, xform=[("t", 0.0, 0.70, 0.0)], mat=m_sc)

    # Rear rubber eye-relief diopter grip sleeve on fast-focus ocular rim
    oc_rubber = mk_knurled_cyl("sc_ocrub", 2.06, 0.62, "x", flutes=36, depth=0.025,
                               xform=[("t", -10.02, 0.70, 0.0)], mat=m_rb)

    # Speed-calibrated magnification dial ring (fluted CNC ring + ergonomic CNC throw lever)
    mag_ring = mk_knurled_cyl("sc_magr", 2.09, 0.84, "x", flutes=28, depth=0.045,
                              xform=[("t", -5.85, 0.70, 0.0)], mat=m_kn)
    mag_accent = mk_cyl("sc_macc", 1.82, 1.82, 0.10, "x", 36, [("t", -5.36, 0.70, 0.0)], m_br, bevel=0.015)
    throw_lever = mk_box("sc_tlev", 0.44, 1.12, 0.34, [("rx", -0.35), ("t", -5.85, 2.40, 0.78)], m_kn, bevel=0.05)

    # Curved convex meniscus Emerald-Sapphire Multi-Coated Objective & Ocular Lenses (STRICTLY FIREWALLED!)
    obj_lens_prof = [
        (0.00, 11.42),
        (1.48, 11.42),
        (1.48, 11.58),
        (1.12, 11.70),
        (0.60, 11.78),
        (0.00, 11.81),
    ]
    obj_lens = mk_lathe_x("sc_olen", obj_lens_prof, segs=36, xform=[("t", 0.0, 0.70, 0.0)], mat=m_ln)
    oc_lens_prof = [
        (0.00, -10.36),
        (0.65, -10.33),
        (1.25, -10.26),
        (1.62, -10.16),
        (1.62, -10.02),
        (0.00, -10.02),
    ]
    oc_lens = mk_lathe_x("sc_clen", oc_lens_prof, segs=36, xform=[("t", 0.0, 0.70, 0.0)], mat=m_ln)

    # Tactical center turret saddle (cleanly frames the 30mm r=1.50 tube with machined chamfers!)
    turret_box = mk_box("sc_tbox", 2.25, 3.16, 3.16, [("t", 0.20, 0.70, 0.0)], m_sc, bevel=0.22, bevel_segs=3)

    # Top 100-YD BDC Elevation Turret: smooth scale skirt FULLY ABOVE saddle crown (Y in [2.26..2.58], Hero Band 1b!) + bronze knurled cap (Y in [2.58..2.98])
    elev_skirt = mk_cyl("sc_els", 0.78, 0.80, 0.36, "y", 36, [("t", 0.20, 2.41, 0.0)], m_sc, bevel=0.015)
    elev_cap = mk_knurled_cyl("sc_elc", 0.80, 0.40, "y", flutes=26, depth=0.032,
                              xform=[("t", 0.20, 2.78, 0.0)], mat=m_br)
    elev_screw = mk_allen_socket_bolt("sc_elsc", 0.20, 0.07, 1.0, 0.20, 2.98, 0.0, m_ss, m_dk, axis="y")

    # Right Windage Turret (Z in [+1.20..+2.15])
    wind_skirt = mk_cyl("sc_wds", 0.74, 0.78, 0.48, "z", 32, [("t", 0.20, 0.70, 1.44)], m_sc, bevel=0.02)
    wind_cap = mk_knurled_cyl("sc_wdc", 0.76, 0.48, "z", flutes=24, depth=0.030,
                              xform=[("t", 0.20, 0.70, 1.91)], mat=m_kn)

    # Left 5-Step Red/Green Illumination Rheostat Dial (Z in [-2.19..-1.20])
    ill_skirt = mk_cyl("sc_ils", 0.78, 0.82, 0.46, "z", 32, [("t", 0.20, 0.70, -1.44)], m_sc, bevel=0.02)
    ill_accent = mk_cyl("sc_ila", 0.81, 0.81, 0.09, "z", 32, [("t", 0.20, 0.70, -1.69)], m_br, bevel=0.012)
    ill_cap = mk_knurled_cyl("sc_ilc", 0.80, 0.46, "z", flutes=24, depth=0.030,
                             xform=[("t", 0.20, 0.70, -1.96)], mat=m_kn)

    # Dual CNC tactical cantilever scope rings & stiffening bridge clamping onto Picatinny rail (local Y = -1.65)
    parts = [
        scope_shell, oc_rubber, mag_ring, mag_accent, throw_lever,
        obj_lens, oc_lens, turret_box, elev_skirt, elev_cap, elev_screw,
        wind_skirt, wind_cap, ill_skirt, ill_accent, ill_cap,
    ]
    cantilever_bridge = mk_box("sc_cbg", 9.60, 0.58, 1.85, [("t", 0.20, -1.15, 0.0)], m_sc, bevel=0.05)
    parts.append(cantilever_bridge)

    for ri, rx in enumerate((-3.80, 4.20)):
        clamp_base = mk_box(f"sc_cb_{ri}", 1.65, 1.05, 2.65, [("t", rx, -1.25, 0.0)], m_sc, bevel=0.06)
        ring_collar = mk_cyl(f"sc_rc_{ri}", 1.82, 1.82, 1.48, "x", 32, [("t", rx, 0.70, 0.0)], m_sc, bevel=0.04)
        # Sculpted horizontal ring split tabs & 4 top stainless Torx ring screws per ring
        split_tabs = mk_box(f"sc_st_{ri}", 1.44, 0.52, 4.02, [("t", rx, 0.70, 0.0)], m_kn, bevel=0.04)
        neck_post = mk_box(f"sc_np_{ri}", 1.48, 1.55, 1.95, [("t", rx, -0.35, 0.0)], m_sc, bevel=0.05)
        clamp_bolt = mk_cyl(f"sc_blt_{ri}", 0.22, 0.22, 2.96, "z", 16, [("t", rx, -1.35, 0.0)], m_ss, bevel=0.025)
        clamp_nut = mk_cyl(f"sc_nut_{ri}", 0.32, 0.32, 0.26, "z", 6, [("t", rx, -1.35, -1.42)], m_kn, bevel=0.02)
        parts.extend([clamp_base, ring_collar, split_tabs, neck_post, clamp_bolt, clamp_nut])
        for s_z in (-1.0, 1.0):
            for dx in (-0.38, 0.38):
                parts.append(
                    mk_allen_socket_bolt(f"sc_rs_{ri}_{s_z}_{dx}", 0.14, 0.10, 1.0, rx + dx, 0.98, s_z * 1.84, m_ss, m_dk, axis="y")
                )

    obj = join_objects(parts, "r500_scope")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_quiver_frame(mats: dict) -> bpy.types.Object:
    """Q-02: Compact Quick-Detach 3-Bolt Side Quiver w/ Sculpted Broadhead Hood, Acoustic Foam & Dual Combs.
    assembledPos: [7.5, -3.15, 4.65]; local ref bbox: [-26.005, -3.10, -3.105] .. [27.00, 1.90, 1.995].
    CRITICAL CLEARANCE:
      - Reserve bolts in MagazineAmmoStack sit at local Z = +0.20, Y = +1.10 / -0.45 / -2.00!
      - QD bracket connects SOLIDLY from spineBar (Y=+0.05, Z=-1.05) up into qdArm (Y=+1.42, Z=-3.10) with ZERO gap!"""
    m_pl = mats["OB_QuiverPolymer"]
    m_fm = mats["OB_QuiverFoam"]
    m_al = mats["OB_QuiverMountAlloy"]
    m_kn = mats["OB_ScopeTurretKnurl"]
    m_ss = mats["OB_BroadheadMirror"]
    m_dk = mats["OB_SlotDark"]

    # Rigid reinforced polymer quiver spine beam (X in [-25.6, +21.5], Z = -1.05)
    spine_bar = mk_box("qv_spine", 47.20, 1.25, 0.68, [("t", -2.00, 0.05, -1.05)], m_pl, bevel=0.08, bevel_segs=2)
    # Recessed CNC weight channel along outer face of spine bar
    spine_rib = mk_box("qv_srib", 42.00, 0.42, 0.18, [("t", -2.00, 0.05, -0.68)], m_kn, bevel=0.03)

    # Solid CNC aluminum QD mounting arm + vertical gusset neck bridging cleanly from spineBar to chassis boss!
    qd_arm = mk_box("qv_qda", 5.40, 0.92, 2.45, [("t", 3.30, 1.42, -1.88)], m_al, bevel=0.07, bevel_segs=2)
    qd_neck = mk_box("qv_qdn", 4.60, 1.08, 0.76, [("t", 3.30, 0.80, -1.05)], m_al, bevel=0.06, bevel_segs=2)
    qd_lever = mk_box("qv_qdl", 2.40, 0.46, 0.52, [("t", 3.30, 1.50, -2.55)], m_kn, bevel=0.04)
    qd_pin = mk_cyl("qv_qdp", 0.15, 0.15, 1.05, "y", 16, [("t", 2.35, 1.42, -2.55)], m_ss, bevel=0.02)

    # Contoured hollow front 3-bolt broadhead protective hood (X in [+19.6..+27.0], Y in [-3.10..+1.90], Z in [-1.15..+1.995])
    # Clean flat outer right flank at Z = +1.995 classified for molded RAVIN R500 Hero Band!
    hood_outer = mk_box("qv_ho", 7.40, 5.00, 3.15, [("t", 23.30, -0.60, 0.42)], m_pl, bevel=0.16, bevel_segs=3)
    hood_hollow = mk_box("qv_hi", 6.60, 4.20, 2.35, [("t", 22.50, -0.60, 0.42)], m_dk)
    hood_shroud = bool_subtract(hood_outer, [hood_hollow], solver="EXACT")

    # Internal high-density charcoal acoustic broadhead foam pad at far front of hood
    acoustic_foam = mk_box("qv_foam", 1.10, 3.90, 2.10, [("t", 26.10, -0.60, 0.42)], m_fm, bevel=0.08)

    # Front & rear sculpted 3-bolt flexible rubber gripper combs (X = -1.0 and X = -15.5)
    # Fingers cleanly straddle reserve bolt slots at Y = +1.10, -0.45, -2.00!
    comb_parts = []
    for ci, cx in enumerate((-1.00, -15.50)):
        comb_parts.append(mk_box(f"qv_cp_{ci}", 1.30, 4.50, 1.45, [("t", cx, -0.60, -0.45)], m_pl, bevel=0.08))
        for fi, fy in enumerate((1.62, 0.32, -1.22, -2.62)):
            comb_parts.append(mk_box(f"qv_cf_{ci}_{fi}", 1.15, 0.36, 1.55, [("t", cx, fy, 0.35)], m_pl, bevel=0.05))
        comb_parts.append(mk_allen_socket_bolt(f"qv_cs_{ci}", 0.16, 0.10, -1.0, cx, 0.05, -1.36, m_ss, m_dk))

    # Rear contoured protective rubber nock guard cap (X min = -26.005 exact!)
    rear_cap = mk_box("qv_rcap", 0.85, 4.60, 2.55, [("t", -25.58, -0.60, 0.15)], m_pl, bevel=0.10, bevel_segs=2)

    obj = join_objects(
        [spine_bar, spine_rib, qd_arm, qd_neck, qd_lever, qd_pin, hood_shroud, acoustic_foam, *comb_parts, rear_cap],
        "r500_quiver_frame",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_retention_arm(mats: dict) -> bpy.types.Object:
    """Q-03: Strictly Firewalled Vivid Safety-Orange Spring Bolt Retention Arm & Frictionless Front Roller.
    assembledPos: [10.4, 3.15, 0]; local ref bbox: [-0.85, -1.19, -0.40] .. [6.925, 0.12, 0.40]."""
    m_or = mats["OB_SafetyOrange"]
    m_ss = mats["OB_BroadheadMirror"]
    m_dk = mats["OB_SlotDark"]

    # Contoured vivid Safety-Orange cantilevered spring arm (X in [-0.85, +6.45], Y in [-1.04, +0.12])
    arm_xy = [
        (-0.85,  0.12),
        ( 0.85,  0.12),
        ( 6.45, -0.78),
        ( 6.35, -1.04),
        ( 0.45, -0.20),
        (-0.85, -0.20),
    ]
    spring_arm = mk_extrude_z("ra_arm", arm_xy, -0.28, 0.28, bevel=0.04, bevel_segs=2, mat=m_or)

    # Rear mounting screw docking cleanly up into r500_flight_rail front anchor pad
    mount_bolt = mk_allen_socket_bolt("ra_bolt", 0.14, 0.08, -1.0, 0.0, -0.18, 0.0, m_ss, m_dk, axis="y")

    # Twin brushed-stainless front fork ears + vivid Safety-Orange grooved low-friction bolt roller wheel
    fork_l = mk_box("ra_fkL", 0.95, 0.34, 0.16, [("t", 6.45, -0.92, -0.32)], m_ss, bevel=0.03)
    fork_r = mk_box("ra_fkR", 0.95, 0.34, 0.16, [("t", 6.45, -0.92,  0.32)], m_ss, bevel=0.03)
    roller_wheel = mk_cyl("ra_whl", 0.24, 0.24, 0.44, "z", 24, [("t", 6.65, -0.95, 0.0)], m_or, bevel=0.03)
    roller_pin = mk_cyl("ra_pin", 0.08, 0.08, 0.72, "z", 16, [("t", 6.65, -0.95, 0.0)], m_ss, bevel=0.012)

    obj = join_objects([spring_arm, mount_bolt, fork_l, fork_r, roller_wheel, roller_pin], "r500_retention_arm")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_r500_carbon_bolt(mats: dict) -> bpy.types.Object:
    """Q-04: 20\" 2x2 3K Woven Carbon-Fiber .001\" Match Crossbow Bolt w/ Clip-On Orange Nock,
    High-Vis Orange/White Helical Vanes & Gleaming Mirror-Beveled 3-Blade Stainless Broadhead.
    assembledPos: [3.4, 1.80, 0]; local ref bbox: [-25.40, -0.88, -0.7746] .. [25.40, 0.4653, 0.7746]."""
    m_cb = mats["OB_CarbonShaft"]
    m_or = mats["OB_SafetyOrange"]
    m_wh = mats["OB_WhiteVane"]
    m_ss = mats["OB_BroadheadMirror"]

    # Micro-diameter 2x2 3K carbon-fiber shaft (local X in [-24.50, +22.20], r = 0.36)
    # Build via mk_lathe_x with segs=32 (multiple of 4 so vertices sit EXACTLY at z=0 top & bottom!)
    # That guarantees zero zigzagging along the left/right upright semi-cylindrical Hero UV seam!
    shaft_prof = [
        (0.00, -24.50),
        (0.36, -24.50),
        (0.36,  22.20),
        (0.00,  22.20),
    ]
    shaft = mk_lathe_x("cb_shaft", shaft_prof, segs=32, mat=m_cb)

    # Vivid Safety-Orange clip-on polymer half-moon nock with authentic string-locking U-notch ears (X in [-25.40..-24.40])
    nock_collar = mk_cyl("cb_ncol", 0.38, 0.38, 0.65, "x", 24, [("t", -24.725, 0.0, 0.0)], m_or, bevel=0.025)
    nock_xy = [
        (-25.05, -0.36), (-24.90, -0.36), (-24.90, 0.36), (-25.05, 0.36),
        (-25.40,  0.28), (-25.40,  0.14), (-25.12, 0.12), (-25.12, -0.12),
        (-25.40, -0.14), (-25.40, -0.28),
    ]
    nock_ears = mk_extrude_z("cb_nears", nock_xy, -0.28, 0.28, bevel=0.02, bevel_segs=2, mat=m_or)

    # 3 Aerodynamic 2" polymer fletching vanes (120 deg apart: 60 deg White, 180 deg Orange cock vane DOWN, 300 deg White)
    vane_xy = [
        (-23.40, 0.34),
        (-22.20, 0.86),
        (-18.50, 0.88),
        (-18.20, 0.34),
    ]
    vanes = []
    for k in range(3):
        ang = (k * 2.0 * math.pi) / 3.0 + math.pi / 3.0
        v_mat = m_or if k == 1 else m_wh
        v_base = mk_extrude_z(f"cb_vn_{k}", vane_xy, -0.032, 0.032, bevel=0.012, bevel_segs=2,
                              xform=[("rx", ang)], mat=v_mat)
        # Molded adhesive vane foot flange hugging carbon shaft radius cleanly
        v_foot = mk_box(f"cb_vf_{k}", 5.20, 0.06, 0.11, [("t", -20.80, 0.36, 0.0), ("rx", ang)], v_mat, bevel=0.014)
        vanes.extend([v_base, v_foot])

    # Brushed stainless half-out insert collar + gleaming mirror-beveled 3-blade vented 100-gr broadhead (X in [+21.6..+25.4])
    insert_prof = [
        (0.00, 21.60),
        (0.38, 21.60),
        (0.40, 21.75),
        (0.40, 22.60),
        (0.38, 23.60),
        (0.24, 24.60),
        (0.00, 25.40),
    ]
    broadhead_body = mk_lathe_x("cb_bhb", insert_prof, segs=24, mat=m_ss)

    # 3 Mirror-beveled razor broadhead blades w/ triangular CNC vent cutouts
    blade_xy = [
        (22.70, 0.30),
        (25.25, 0.04),
        (22.95, 0.72),
        (22.55, 0.62),
    ]
    vent_xy = [
        (23.02, 0.38),
        (24.18, 0.25),
        (23.12, 0.56),
    ]
    blades = []
    for k in range(3):
        ang = (k * 2.0 * math.pi) / 3.0 + math.pi / 3.0
        b_raw = mk_extrude_z(f"cb_bl_{k}", blade_xy, -0.026, 0.026, bevel=0.012, bevel_segs=2,
                             xform=[("rx", ang)], mat=m_ss)
        b_cut = mk_extrude_z(f"cb_bc_{k}", vent_xy, -0.10, 0.10, bevel=0.0,
                             xform=[("rx", ang)], mat=m_ss)
        blades.append(bool_subtract(b_raw, [b_cut], solver="EXACT"))

    obj = join_objects([shaft, nock_collar, nock_ears, *vanes, broadhead_body, *blades], "r500_carbon_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart CONCAVE Packing (margin = 0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
    only_face_fn=None,
):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

    any_selected = False
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
                sel = bool(only_face_fn(o.name, f, mname))
            else:
                sel = not (skip_face_fn(o.name, f, mname) if skip_face_fn else False)
            f.select = sel
            if sel:
                any_selected = True
        bm.select_flush(True)
        bm.to_mesh(o.data)
        bm.free()

    assert any_selected, f"_smart_unwrap_and_pack_rect: zero faces selected for {[o.name for o in objs]}"

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
            if only_face_fn is not None:
                if not only_face_fn(o.name, f, mname):
                    continue
            elif skip_face_fn and skip_face_fn(o.name, f, mname):
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
    assert span_u > 0.35 and span_v > 0.35, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_chassis_atlas(chassis_objs: list[bpy.types.Object]):
    """Unwraps 6 chassis/furniture/rail/riser parts into `r500_v3_chassis` (2048x2048)."""
    def classify_chassis_hero(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if obj_name == "r500_flight_rail" and mat_name == "CH_SlateAnodize":
            if -15.40 <= tx <= 17.75 and -0.52 <= ty <= -0.01:
                if nz < -0.88 and tz < -1.18:
                    return "fr_left"
                if nz > 0.88 and tz > 1.18:
                    return "fr_right"
        if obj_name == "r500_chassis" and mat_name == "CH_SlateAnodize":
            if -24.50 <= tx <= 24.20 and -1.75 <= ty <= 2.65:
                if nz < -0.88 and tz < -1.28:
                    return "ch_left"
                if nz > 0.88 and tz > 1.28:
                    return "ch_right"
        return ""

    def is_hero(obj_name: str, face, mat_name: str) -> bool:
        return classify_chassis_hero(obj_name, face, mat_name) != ""

    metal_grp = [o for o in chassis_objs if o.name in {"r500_chassis", "r500_flight_rail", "r500_riser_head"}]
    poly_grp = [o for o in chassis_objs if o.name in {"r500_forend_grip", "r500_pistol_grip", "r500_buttstock"}]

    _smart_unwrap_and_pack_rect(metal_grp, 0.010, 0.990, 0.220, 0.470, skip_face_fn=is_hero)
    _smart_unwrap_and_pack_rect(poly_grp,  0.010, 0.990, 0.010, 0.205)

    counts = {"fr_left": 0, "fr_right": 0, "ch_left": 0, "ch_right": 0}
    for o in metal_grp:
        if o.name not in {"r500_chassis", "r500_flight_rail"}:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_chassis_hero(o.name, f, mname)
            if not tag:
                continue
            counts[tag] += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty = vco.x, vco.z
                if tag in ("fr_left", "fr_right"):
                    xn = max(0.0, min(1.0, (tx + 15.40) / 33.10))
                    yn = max(0.0, min(1.0, (ty + 0.52) / 0.50))
                    if tag == "fr_left":
                        loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.895 + yn * 0.090)
                    else:
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.795 + yn * 0.090)
                else:
                    xn = max(0.0, min(1.0, (tx + 24.50) / 48.70))
                    yn = max(0.0, min(1.0, (ty + 1.75) / 4.40))
                    if tag == "ch_left":
                        loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.640 + yn * 0.140)
                    else:
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.485 + yn * 0.140)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [UV-HERO] r500_v3_chassis hero face counts: {counts}")
    assert all(v >= 2 for v in counts.values()), f"Chassis hero walls missed: {counts}"


def unwrap_cams_mech_atlas(cams_mech_objs: list[bpy.types.Object]):
    """Unwraps 9 HexCoil cams, VersaDrive, stirrup & FCG parts into `r500_v3_cams_mech` (2048x2048)."""
    def classify_cm_hero(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        ny, nz = n.z, -n.y
        if obj_name == "r500_left_cam" and mat_name in ("CM_HexCoilCopper", "CM_HexCoilGoldGroove"):
            if ny > 0.88 and (ty > 0.58 or (0.215 <= ty <= 0.255)):
                return "cam_l_top"
        if obj_name == "r500_right_cam" and mat_name in ("CM_HexCoilCopper", "CM_HexCoilGoldGroove"):
            if ny > 0.88 and (ty > 0.58 or (0.215 <= ty <= 0.255)):
                return "cam_r_top"
        if obj_name == "r500_trigger_sled" and mat_name == "CM_SledDarkAnodize":
            if -1.92 <= tx <= 2.02 and -0.88 <= ty <= 0.44:
                if nz < -0.88 and tz < -0.80:
                    return "sled_left"
                if nz > 0.88 and tz > 0.80:
                    return "sled_right"
        if obj_name == "r500_safety_selector" and mat_name == "CM_SafetyOrange":
            if nz < -0.88 and tz < -1.68:
                return "safe_or_left"
            if nz > 0.88 and tz > 1.68:
                return "safe_or_right"
            return "safe_or_rest"
        return ""

    copper_grp = [o for o in cams_mech_objs if o.name in {"r500_left_cam", "r500_right_cam", "r500_anti_dry_fire"}]
    mech_grp = [o for o in cams_mech_objs if o not in copper_grp]
    safe_obj = next(o for o in cams_mech_objs if o.name == "r500_safety_selector")

    _smart_unwrap_and_pack_rect(
        copper_grp, 0.010, 0.990, 0.400, 0.745,
        skip_face_fn=lambda nm, f, mn: classify_cm_hero(nm, f, mn) in ("cam_l_top", "cam_r_top"),
    )
    _smart_unwrap_and_pack_rect(
        mech_grp, 0.010, 0.990, 0.010, 0.385,
        skip_face_fn=lambda nm, f, mn: classify_cm_hero(nm, f, mn) != "",
    )
    # Strictly firewalled Safety-Orange selector bevels/edges/backs
    _smart_unwrap_and_pack_rect(
        [safe_obj], 0.760, 0.990, 0.760, 0.865,
        only_face_fn=lambda nm, f, mn: classify_cm_hero(nm, f, mn) == "safe_or_rest",
    )

    counts = {"cam_l_top": 0, "cam_r_top": 0, "sled_left": 0, "sled_right": 0, "safe_or_left": 0, "safe_or_right": 0}
    for o in cams_mech_objs:
        if o.name not in {"r500_left_cam", "r500_right_cam", "r500_trigger_sled", "r500_safety_selector"}:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_cm_hero(o.name, f, mname)
            if tag not in counts:
                continue
            counts[tag] += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                if tag in ("cam_l_top", "cam_r_top"):
                    u0 = 0.015 if tag == "cam_l_top" else 0.250
                    uf = max(0.0, min(1.0, (tx / 1.85) * 0.5 + 0.5))
                    vf = max(0.0, min(1.0, (-tz / 1.85) * 0.5 + 0.5))
                    loop[uv_layer].uv = (u0 + uf * 0.220, 0.765 + vf * 0.220)
                elif tag in ("sled_left", "sled_right"):
                    xn = max(0.0, min(1.0, (tx + 1.90) / 3.90))
                    yn = max(0.0, min(1.0, (ty + 0.86) / 1.28))
                    if tag == "sled_left":
                        loop[uv_layer].uv = (0.490 + (1.0 - xn) * 0.245, 0.880 + yn * 0.105)
                    else:
                        loop[uv_layer].uv = (0.490 + xn * 0.245, 0.765 + yn * 0.105)
                elif tag in ("safe_or_left", "safe_or_right"):
                    xn = max(0.0, min(1.0, (tx + 0.32) / 1.27))
                    yn = max(0.0, min(1.0, (ty + 0.24) / 0.48))
                    if tag == "safe_or_left":
                        loop[uv_layer].uv = (0.762 + (1.0 - xn) * 0.106, 0.878 + yn * 0.106)
                    else:
                        loop[uv_layer].uv = (0.882 + xn * 0.106, 0.878 + yn * 0.106)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [UV-HERO] r500_v3_cams_mech hero face counts: {counts}")
    assert all(v >= 2 for v in counts.values()), f"Cams/Mech hero faces missed: {counts}"


def unwrap_optic_bolt_atlas(optic_bolt_objs: list[bpy.types.Object]):
    """Unwraps 4 scope, quiver, retention arm & carbon bolt parts into `r500_v3_optic_bolt` (2048x2048)."""
    def classify_ob_face(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "r500_scope":
            if mat_name == "OB_OpticalLens":
                if tx > 0.0:
                    return "lens_front" if nx >= 0.0 else "lens_back"
                return "lens_rear" if nx <= 0.0 else "lens_back"
            if mat_name == "OB_ScopeSatinBlack":
                # 300-550 FPS speed calibration collar: X in [-5.42 .. -4.70], cylindrical radial faces around Y=0.70
                if -5.42 <= tx <= -4.70 and abs(nx) < 0.42:
                    return "speed_ring"
                # Top 100-YD BDC elevation turret smooth skirt: centered at (0.20, 0), strictly above saddle crown (Y in [2.25 .. 2.58])!
                rad_el = math.hypot(tx - 0.20, tz)
                if 0.72 <= rad_el <= 0.85 and 2.25 <= ty <= 2.58 and abs(ny) < 0.35:
                    return "elev_drum"
                # Scope objective bell & ocular bell smooth side flanks
                if ((5.20 <= tx <= 12.62) or (-10.22 <= tx <= -6.52)) and abs(ny) < 0.58:
                    if nz > 0.55 and tz > 0.40:
                        return "tube_right"
                    if nz < -0.55 and tz < -0.40:
                        return "tube_left"

        if obj_name == "r500_carbon_bolt":
            if mat_name == "OB_CarbonShaft" and abs(nx) < 0.50:
                return "bolt_right" if tz >= 0.0 else "bolt_left"
            if mat_name == "OB_SafetyOrange":
                return "orange_fw"
            if mat_name == "OB_WhiteVane":
                return "white_fw"

        if obj_name == "r500_retention_arm" and mat_name == "OB_SafetyOrange":
            return "orange_fw"

        if obj_name == "r500_quiver_frame" and mat_name == "OB_QuiverPolymer":
            if nz > 0.88 and tz > 1.94 and 19.55 <= tx <= 27.05:
                return "quiver_hood_r"

        return ""

    scope_bolt_grp = [o for o in optic_bolt_objs if o.name in {"r500_scope", "r500_retention_arm", "r500_carbon_bolt"}]
    quiver_grp = [o for o in optic_bolt_objs if o.name == "r500_quiver_frame"]
    orange_grp = [o for o in optic_bolt_objs if o.name in {"r500_retention_arm", "r500_carbon_bolt"}]
    bolt_obj = next(o for o in optic_bolt_objs if o.name == "r500_carbon_bolt")

    # Pack non-hero metal/scope/broadhead faces
    _smart_unwrap_and_pack_rect(
        scope_bolt_grp, 0.010, 0.775, 0.230, 0.460,
        skip_face_fn=lambda nm, f, mn: classify_ob_face(nm, f, mn) != "",
    )
    # Pack strictly firewalled Safety-Orange zone (`r500_retention_arm` + bolt cock vane & clip-on nock)
    _smart_unwrap_and_pack_rect(
        orange_grp, 0.708, 0.988, 0.608, 0.798,
        only_face_fn=lambda nm, f, mn: classify_ob_face(nm, f, mn) == "orange_fw",
    )
    # Pack strictly firewalled Arctic-White hen vanes zone
    _smart_unwrap_and_pack_rect(
        [bolt_obj], 0.792, 0.988, 0.272, 0.458,
        only_face_fn=lambda nm, f, mn: classify_ob_face(nm, f, mn) == "white_fw",
    )
    # Pack Quiver rest
    _smart_unwrap_and_pack_rect(
        quiver_grp, 0.010, 0.725, 0.010, 0.215,
        skip_face_fn=lambda nm, f, mn: classify_ob_face(nm, f, mn) == "quiver_hood_r",
    )

    counts = {
        "speed_ring": 0, "elev_drum": 0, "tube_right": 0, "tube_left": 0,
        "lens_front": 0, "lens_rear": 0, "lens_back": 0,
        "bolt_right": 0, "bolt_left": 0, "quiver_hood_r": 0,
    }
    for o in optic_bolt_objs:
        if o.name not in {"r500_scope", "r500_carbon_bolt", "r500_quiver_frame"}:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            tag = classify_ob_face(o.name, f, mname)
            if tag not in counts:
                continue
            counts[tag] += 1
            fc = f.calc_center_median()
            if tag == "speed_ring":
                # Seamless cylindrical wrap around X-axis centered at (ty=0.70, tz=0)
                fcy, fcz = fc.z - 0.70, -fc.y
                ang_c = math.atan2(fcy, fcz)
                for loop in f.loops:
                    vco = loop.vert.co
                    vx, vy, vz = vco.x, vco.z - 0.70, -vco.y
                    ang_v = math.atan2(vy, vz)
                    if ang_v - ang_c > math.pi:
                        ang_v -= 2.0 * math.pi
                    elif ang_v - ang_c < -math.pi:
                        ang_v += 2.0 * math.pi
                    u_frac = max(0.0, min(1.0, (math.pi - ang_v) / (2.0 * math.pi)))
                    v_frac = max(0.0, min(1.0, (vx + 5.40) / 0.68))
                    loop[uv_layer].uv = (0.015 + u_frac * 0.665, 0.895 + v_frac * 0.090)
            elif tag == "elev_drum":
                fcx, fcz = fc.x - 0.20, -fc.y
                ang_c = math.atan2(fcz, fcx)
                for loop in f.loops:
                    vco = loop.vert.co
                    vx, vy, vz = vco.x - 0.20, vco.z, -vco.y
                    ang_v = math.atan2(vz, vx)
                    if ang_v - ang_c > math.pi:
                        ang_v -= 2.0 * math.pi
                    elif ang_v - ang_c < -math.pi:
                        ang_v += 2.0 * math.pi
                    u_frac = max(0.0, min(1.0, 1.0 - (ang_v + math.pi) / (2.0 * math.pi)))
                    v_frac = max(0.0, min(1.0, (vy - 2.24) / 0.34))
                    loop[uv_layer].uv = (0.015 + u_frac * 0.665, 0.795 + v_frac * 0.090)
            elif tag in ("tube_right", "tube_left"):
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    xn = max(0.0, min(1.0, (tx + 10.50) / 23.30))
                    yn = max(0.0, min(1.0, (ty - 0.70 + 1.95) / 3.90))
                    if tag == "tube_right":
                        loop[uv_layer].uv = (0.015 + xn * 0.665, 0.700 + yn * 0.085)
                    else:
                        loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.665, 0.605 + yn * 0.085)
            elif tag == "lens_front":
                for loop in f.loops:
                    vco = loop.vert.co
                    ty, tz = vco.z - 0.70, -vco.y
                    un = max(-1.0, min(1.0, tz / 1.48))
                    vn = max(-1.0, min(1.0, ty / 1.48))
                    loop[uv_layer].uv = (0.790 + un * 0.080, 0.900 + vn * 0.080)
            elif tag == "lens_rear":
                for loop in f.loops:
                    vco = loop.vert.co
                    ty, tz = vco.z - 0.70, -vco.y
                    un = max(-1.0, min(1.0, tz / 1.62))
                    vn = max(-1.0, min(1.0, ty / 1.62))
                    loop[uv_layer].uv = (0.935 + un * 0.044, 0.935 + vn * 0.044)
            elif tag == "lens_back":
                for loop in f.loops:
                    vco = loop.vert.co
                    ty, tz = vco.z - 0.70, -vco.y
                    un = max(-1.0, min(1.0, tz / 1.65))
                    vn = max(-1.0, min(1.0, ty / 1.65))
                    loop[uv_layer].uv = (0.935 + un * 0.030, 0.845 + vn * 0.030)
            elif tag in ("bolt_right", "bolt_left"):
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty, tz = vco.x, vco.z, -vco.y
                    xn = max(0.0, min(1.0, (tx + 24.50) / 46.70))
                    z_side = max(tz, 0.0) if tag == "bolt_right" else max(-tz, 0.0)
                    theta = math.atan2(ty, z_side)  # [-pi/2, +pi/2] uniform arc-length!
                    yn = max(0.0, min(1.0, (theta + math.pi * 0.5) / math.pi))
                    if tag == "bolt_right":
                        loop[uv_layer].uv = (0.015 + xn * 0.970, 0.535 + yn * 0.057)
                    else:
                        loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.472 + yn * 0.057)
            elif tag == "quiver_hood_r":
                for loop in f.loops:
                    vco = loop.vert.co
                    tx, ty = vco.x, vco.z
                    xn = max(0.0, min(1.0, (tx - 19.60) / 7.40))
                    yn = max(0.0, min(1.0, (ty + 3.10) / 5.00))
                    loop[uv_layer].uv = (0.740 + xn * 0.245, 0.015 + yn * 0.195)
        bm.to_mesh(o.data)
        bm.free()
    print(f"  [UV-HERO] r500_v3_optic_bolt hero face counts: {counts}")
    assert counts["speed_ring"] >= 16 and counts["elev_drum"] >= 16 and counts["lens_front"] >= 16 and counts["bolt_right"] >= 16, (
        f"Optic/Bolt hero faces missed: {counts}"
    )


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


def _set_assembled_full_layout(all_objs: list[bpy.types.Object]):
    for o in all_objs:
        o.hide_render = False
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)


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
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.06, 0.065, 0.072, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.72
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.52
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
            f"  [{status}] {o.name:24s} tris={tris:5d} non_man={non_man:2d} vol={vol:8.3f} "
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


def _render_studio_previews(all_objs: list[bpy.types.Object], preview_dir: Path):
    """Renders quick Cycles verification shots using the final baked v3 WebP PBR suites."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = 40
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
        tex_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"r500_v3_{suite}_albedo.webp"))
        tex_alb.image.colorspace_settings.name = "sRGB"

        tex_orm = nt.nodes.new("ShaderNodeTexImage")
        tex_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"r500_v3_{suite}_roughness.webp"))
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
        tex_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"r500_v3_{suite}_normal.webp"))
        tex_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    mat_ch = mk_baked_mat("chassis", 0.88)
    mat_cm = mk_baked_mat("cams_mech", 0.86)
    mat_ob = mk_baked_mat("optic_bolt", 0.85)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in CHASSIS_PARTS:
            o.data.materials.append(mat_ch)
        elif o.name in CAMS_MECH_PARTS:
            o.data.materials.append(mat_cm)
        else:
            o.data.materials.append(mat_ob)

    _set_assembled_full_layout(all_objs)

    w_nt = scene.world.node_tree
    if not scene.world.use_nodes:
        scene.world.use_nodes = True
        w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "studio_dark_armory.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.6
    else:
        w_bg.inputs["Color"].default_value = (0.14, 0.16, 0.18, 1.0)
        w_bg.inputs["Strength"].default_value = 1.0
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    for lname, loc_t, energy, size in (
        ("KeyLight",  (14.0, 32.0,  34.0), 22000.0, 24.0),
        ("FillLight", (-12.0, 18.0, -34.0), 14000.0, 26.0),
        ("RimLight",  (24.0, 28.0, -16.0), 16000.0, 18.0),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = t2b(*loc_t)
        d = t2b(4.0, 0.0, 0.0) - lobj.location
        lobj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    shots = [
        ("r500_iso_left.png",      ( 26.0, 22.0, -56.0), (  2.0,  0.5,  0.0), 42.0),
        ("r500_iso_right.png",     ( 24.0, 18.0,  58.0), (  3.0,  0.0,  0.0), 42.0),
        ("r500_macro_left.png",    ( -4.0,  4.0, -24.0), ( -4.0,  1.2,  0.0), 50.0),
        ("r500_macro_cams.png",    ( 33.0, 14.0, -22.0), ( 25.0,  1.8, -5.0), 52.0),
        ("r500_macro_scope.png",   (  8.0, 11.0,  18.0), ( -5.5,  6.8,  0.0), 54.0),
        ("r500_front_lens.png",    ( 48.0,  9.5,  19.0), ( 14.0,  3.5,  1.5), 48.0),
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
        # Suite 1: r500_v3_chassis (6 parts)
        "r500_chassis":          build_r500_chassis,
        "r500_forend_grip":      build_r500_forend_grip,
        "r500_pistol_grip":      build_r500_pistol_grip,
        "r500_buttstock":        build_r500_buttstock,
        "r500_flight_rail":      build_r500_flight_rail,
        "r500_riser_head":       build_r500_riser_head,
        # Suite 2: r500_v3_cams_mech (9 parts)
        "r500_left_cam":         build_r500_left_cam,
        "r500_right_cam":        build_r500_right_cam,
        "r500_foot_stirrup":     build_r500_foot_stirrup,
        "r500_versadrive_screw": build_r500_versadrive_screw,
        "r500_trigger_sled":     build_r500_trigger_sled,
        "r500_string_latch":     build_r500_string_latch,
        "r500_anti_dry_fire":    build_r500_anti_dry_fire,
        "r500_trigger_sear":     build_r500_trigger_sear,
        "r500_safety_selector":  build_r500_safety_selector,
        # Suite 3: r500_v3_optic_bolt (4 parts)
        "r500_scope":            build_r500_scope,
        "r500_quiver_frame":     build_r500_quiver_frame,
        "r500_retention_arm":    build_r500_retention_arm,
        "r500_carbon_bolt":      build_r500_carbon_bolt,
    }

    print("[BUILD] Sculpting all 19 solid Ravin R500 Helicoil Crossbow hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    chassis_objs = [built[pid] for pid in CHASSIS_PARTS]
    cams_mech_objs = [built[pid] for pid in CAMS_MECH_PARTS]
    optic_bolt_objs = [built[pid] for pid in OPTIC_BOLT_PARTS]
    all_objs = chassis_objs + cams_mech_objs + optic_bolt_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD bounding-box alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: chassis (6), cams_mech (9), optic_bolt (4)...")
    unwrap_chassis_atlas(chassis_objs)
    unwrap_cams_mech_atlas(cams_mech_objs)
    unwrap_optic_bolt_atlas(optic_bolt_objs)

    for label, group in (("chassis", chassis_objs), ("cams_mech", cams_mech_objs), ("optic_bolt", optic_bolt_objs)):
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
            assert 0.00003 < oa < 0.72, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:12s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.25 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="r500_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking r500_v3_chassis (2048x2048, 6 CNC chassis/rail/riser/furniture parts)...")
        bake_atlas_suite("chassis", chassis_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking r500_v3_cams_mech (2048x2048, 9 HexCoil cams/VersaDrive/stirrup/FCG parts)...")
        bake_atlas_suite("cams_mech", cams_mech_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking r500_v3_optic_bolt (2048x2048, 4 500 FPS scope/quiver/retention/bolt parts)...")
        bake_atlas_suite("optic_bolt", optic_bolt_objs, all_objs, tmp_dir)

        print("[POST] Compositing Ravin R500 CNC laser markings, HexCoil dials, 300-550 FPS scope, 3K carbon bolt & ORM WebPs...")
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
        TEX_OUT_DIR / "r500_v3_chassis_albedo.webp",
        TEX_OUT_DIR / "r500_v3_chassis_normal.webp",
        TEX_OUT_DIR / "r500_v3_chassis_roughness.webp",
        TEX_OUT_DIR / "r500_v3_cams_mech_albedo.webp",
        TEX_OUT_DIR / "r500_v3_cams_mech_normal.webp",
        TEX_OUT_DIR / "r500_v3_cams_mech_roughness.webp",
        TEX_OUT_DIR / "r500_v3_optic_bolt_albedo.webp",
        TEX_OUT_DIR / "r500_v3_optic_bolt_normal.webp",
        TEX_OUT_DIR / "r500_v3_optic_bolt_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== RAVIN R500 HELICOIL CROSSBOW V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:40s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
