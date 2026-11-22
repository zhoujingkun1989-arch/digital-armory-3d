#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles GPU Baker for PLA ZTZ-99A Main Battle Tank
================================================================================
MIT License — Digital Armory 3D (`WP-18` BAY-24)

Generates at TRUE 1:1 REAL-WORLD SCALE (1 world unit = 1 cm = 10 mm):
  - public/models/ztz99a.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY
    dynamic GPU-deforming helical springs `ztz99a_recoil_springs` & `ztz99a_rammer_spring`
    carrying `aSpringParam` in Web Worker CSG track)
  - public/textures/ztz99a_v3_armor_hull_{albedo,normal,roughness}.webp      (4096x4096 Packed ORM)
  - public/textures/ztz99a_v3_turret_gun_{albedo,normal,roughness}.webp      (4096x4096 Packed ORM)
  - public/textures/ztz99a_v3_interior_power_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X front/muzzle (+710 cm), +Y up (+154 cm whip tips), +Z right (+175 cm).
  - Track ground contact: Y = -120.0 cm exact (local Y_min = -50.0 cm on tracks; gridY = -121.0).
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1.
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 24 objects are reset to identity transform (0,0,0) before Draco glTF 2.0 export.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_ztz99a_photoreal.py
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
# MODE 2: System Python Post-Process (PLA Digital Camo Markings, Tactical Codes
#         `99A-108` & `ZTZ-99A / 108`, Red-Outlined PLA Stars, Digital MFD HUDs,
#         150HB V12 Engine Spec Plate, Cutaway AO Lift & 5-Ch ORM WebPs)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    glb_path = Path(sys.argv[idx + 3]) if len(sys.argv) > idx + 3 else None
    out_dir.mkdir(parents=True, exist_ok=True)

    import gc
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

    def _read_f32_scalar(path: Path) -> np.ndarray:
        arr = np.load(path).astype(np.float32)
        if arr.ndim == 3:
            return arr[..., 0].copy()
        return arr.copy()

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

    def _star_poly(cx: float, cy: float, r_out: float, r_in: float) -> list[tuple[float, float]]:
        pts = []
        for i in range(10):
            ang = -math.pi * 0.5 + i * (math.pi / 5.0)
            r = r_out if (i % 2 == 0) else r_in
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        return pts

    def _sanitize_normals(nrm: np.ndarray) -> np.ndarray:
        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad = nz_lin < 0.25
        if np.any(bad):
            nrm = nrm.copy()
            nrm[bad] = (0.5, 0.5, 1.0)
        return nrm

    def _combine_ao(ao_self: np.ndarray, ao_ext: np.ndarray, ext_mask: np.ndarray) -> np.ndarray:
        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.42 + ao_ext * 0.58)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        return np.clip(0.18 + 0.82 * np.power(np.clip(ao, 0.0, 1.0), 0.90), 0.18, 1.0).astype(np.float32)

    # -------------------------------------------------------------------------
    # SUITE 1: ztz99a_v3_armor_hull_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def process_armor_hull_atlas() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "ah_albedo.npy")
        rgh = _read_f32_scalar(tmp_dir / "ah_roughness.npy")
        met = _read_f32_scalar(tmp_dir / "ah_metalness.npy")
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "ah_normal.npy"))
        ao = _combine_ao(
            _read_f32_scalar(tmp_dir / "ah_ao_self.npy"),
            _read_f32_scalar(tmp_dir / "ah_ao_ext.npy"),
            _read_f32_scalar(tmp_dir / "ah_ext_mask.npy"),
        )

        h, w = rgh.shape
        res_scale = w / 2048.0
        albedo = _linear_to_srgb(alb_lin)
        del alb_lin
        white_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        gold_m = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Front Heavy Armored Side Skirt Panels (+Z Right & -Z Left) ---
        # 2x supersampled PIL canvas (2720x1560) for razor-sharp 4K `99A-108` & PLA Star!
        SW, SH = 2720, 1560
        s_white = Image.new("L", (SW, SH), 0)
        s_red = Image.new("L", (SW, SH), 0)
        s_gold = Image.new("L", (SW, SH), 0)
        dw = ImageDraw.Draw(s_white)
        dr = ImageDraw.Draw(s_red)
        dg = ImageDraw.Draw(s_gold)

        # Crisp tactical white corner brackets
        for bx, by, sx, sy in ((92, 96, 1, 1), (SW - 92, 96, -1, 1), (92, SH - 96, 1, -1), (SW - 92, SH - 96, -1, -1)):
            dw.line([(bx, by), (bx + sx * 170, by)], fill=238, width=20)
            dw.line([(bx, by), (bx, by + sy * 130)], fill=238, width=20)

        # Left emblem: Crisp white-and-crimson PLA Five-Pointed Tactical Star
        scx, scy = 570, 720
        dw.polygon(_star_poly(scx, scy, 356, 144), fill=255)
        dr.polygon(_star_poly(scx, scy, 304, 120), fill=255)
        dg.polygon(_star_poly(scx, scy, 324, 130), outline=255, width=24)
        # Inner tactical bars inside star (geometric emblem, zero CJK font dependency)
        dg.rectangle((scx - 88, scy - 32, scx + 88, scy + 32), fill=255)

        # Right bold tactical hull code: `99A-108`
        dw.text((1740, 530), "99A-108", font=_load_font(FONT_DIN, 430), fill=255, anchor="mm")
        dw.rectangle((1040, 824, 2450, 856), fill=245)
        dw.text((1740, 1010), "PLA HEAVY ARMOR BRIGADE", font=_load_font(FONT_COND, 148), fill=244, anchor="mm")
        dw.text((1740, 1204), "ZTZ-99A  /  55T  /  125MM ZPT-98", font=_load_font(FONT_COND, 124), fill=234, anchor="mm")

        # Band 1: Right (+Z) Front Skirt [0.015, 0.485] x [0.805, 0.985]
        # Band 2: Left  (-Z) Front Skirt [0.515, 0.985] x [0.805, 0.985]
        for u0, u1 in ((0.015, 0.485), (0.515, 0.985)):
            _paste_uv_band(white_m, s_white, u0, u1, 0.805, 0.985)
            _paste_uv_band(red_m,   s_red,   u0, u1, 0.805, 0.985)
            _paste_uv_band(gold_m,  s_gold,  u0, u1, 0.805, 0.985)

        # Subtle combat-dust edge wear mottle on paint stencils (95% crisp at 4K)
        rng = np.random.default_rng(9901)
        mottle = ndimage.gaussian_filter(
            rng.uniform(0.88, 1.0, (h, w)).astype(np.float32), sigma=1.1 * res_scale
        )
        w_p = np.clip(white_m * mottle, 0.0, 1.0)
        r_p = np.clip(red_m * mottle, 0.0, 1.0)
        g_p = np.clip(gold_m * mottle, 0.0, 1.0)
        del white_m, red_m, gold_m, mottle

        _mix(albedo, (0.91, 0.92, 0.89), w_p * 0.95)
        _mix(rgh, 0.64, w_p * 0.86)
        _mix(met, 0.02, w_p * 0.95)

        _mix(albedo, (0.76, 0.12, 0.10), r_p * 0.96)
        _mix(rgh, 0.56, r_p * 0.86)
        _mix(met, 0.03, r_p * 0.95)

        _mix(albedo, (0.90, 0.74, 0.22), g_p * 0.95)
        _mix(rgh, 0.46, g_p * 0.86)
        _mix(met, 0.30, g_p * 0.90)

        # Bake subtle crevice grime/shadow into albedo so ERA bricks, tracks, skirts & road wheels pop with tactile mass
        albedo *= (0.75 + 0.25 * ao[..., None])

        paint_bev = _bevel_mask(np.maximum(w_p, r_p), width_px=1.1 * res_scale)
        del w_p, r_p, g_p
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(0.14 * paint_bev, strength=1.8))
        del nrm, paint_bev

        rgh = np.clip(rgh, 0.14, 0.96)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)
        del ao, rgh, met

        alb_img = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        nrm_img = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        orm_img = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        del albedo, nrm_final, orm
        gc.collect()
        print(f"[POST] Composited ztz99a_v3_armor_hull ({w}x{h})")
        return alb_img, nrm_img, orm_img

    # -------------------------------------------------------------------------
    # SUITE 2: ztz99a_v3_turret_gun_{albedo,normal,roughness}.webp (4096x4096)
    # -------------------------------------------------------------------------
    def process_turret_gun_atlas() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "tg_albedo.npy")
        rgh = _read_f32_scalar(tmp_dir / "tg_roughness.npy")
        met = _read_f32_scalar(tmp_dir / "tg_metalness.npy")
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "tg_normal.npy"))
        ao = _combine_ao(
            _read_f32_scalar(tmp_dir / "tg_ao_self.npy"),
            _read_f32_scalar(tmp_dir / "tg_ao_ext.npy"),
            _read_f32_scalar(tmp_dir / "tg_ext_mask.npy"),
        )

        h, w = rgh.shape
        res_scale = w / 2048.0
        albedo = _linear_to_srgb(alb_lin)
        del alb_lin
        white_m = np.zeros((h, w), dtype=np.float32)
        red_m = np.zeros((h, w), dtype=np.float32)
        gold_m = np.zeros((h, w), dtype=np.float32)

        # --- HERO BAND 1 & 2: Unobstructed Turret Bustle Side Plates (+Z Right & -Z Left) ---
        # 2x supersampled PIL canvas (3120x1440) for razor-sharp 4K `ZTZ-99A / 108` + PLA Star!
        TW, TH = 3120, 1440
        t_white = Image.new("L", (TW, TH), 0)
        t_red = Image.new("L", (TW, TH), 0)
        t_gold = Image.new("L", (TW, TH), 0)
        dw = ImageDraw.Draw(t_white)
        dr = ImageDraw.Draw(t_red)
        dg = ImageDraw.Draw(t_gold)

        # Clean outer military stencil border frame
        dw.rounded_rectangle((72, 72, TW - 72, TH - 72), radius=48, outline=228, width=16)

        # Left side: Iconic PLA Red-Outlined Golden-Trimmed Five-Pointed Tactical Star
        scx, scy = 610, 720
        dw.polygon(_star_poly(scx, scy, 410, 164), fill=255)
        dr.polygon(_star_poly(scx, scy, 356, 140), fill=255)
        dg.polygon(_star_poly(scx, scy, 368, 146), outline=255, width=28)
        dg.rectangle((scx - 104, scy - 36, scx + 104, scy + 36), fill=255)

        # Right side: High-contrast `ZTZ-99A` & giant turret tactical number `108`
        dw.text((1980, 370), "ZTZ-99A", font=_load_font(FONT_DIN, 292), fill=255, anchor="mm")
        dw.rectangle((1150, 572, 2850, 604), fill=244)
        dw.text((1980, 944), "108", font=_load_font(FONT_IMPACT, 550), fill=255, anchor="mm")
        dw.text((1980, 1272), "125MM ZPT-98 L/50  -  FY-4 ERA  -  JD-3", font=_load_font(FONT_COND, 112), fill=238, anchor="mm")

        for u0, u1 in ((0.015, 0.485), (0.515, 0.985)):
            _paste_uv_band(white_m, t_white, u0, u1, 0.805, 0.985)
            _paste_uv_band(red_m,   t_red,   u0, u1, 0.805, 0.985)
            _paste_uv_band(gold_m,  t_gold,  u0, u1, 0.805, 0.985)

        rng = np.random.default_rng(9902)
        mottle = ndimage.gaussian_filter(
            rng.uniform(0.88, 1.0, (h, w)).astype(np.float32), sigma=1.1 * res_scale
        )
        w_p = np.clip(white_m * mottle, 0.0, 1.0)
        r_p = np.clip(red_m * mottle, 0.0, 1.0)
        g_p = np.clip(gold_m * mottle, 0.0, 1.0)
        del white_m, red_m, gold_m, mottle

        _mix(albedo, (0.92, 0.93, 0.90), w_p * 0.95)
        _mix(rgh, 0.62, w_p * 0.86)
        _mix(met, 0.02, w_p * 0.95)

        _mix(albedo, (0.78, 0.11, 0.10), r_p * 0.96)
        _mix(rgh, 0.54, r_p * 0.86)
        _mix(met, 0.03, r_p * 0.95)

        _mix(albedo, (0.91, 0.75, 0.22), g_p * 0.95)
        _mix(rgh, 0.44, g_p * 0.86)
        _mix(met, 0.32, g_p * 0.90)

        # Bake subtle crevice shadow into turret & ERA wedge albedo
        albedo *= (0.75 + 0.25 * ao[..., None])

        # Preserve glossy multi-coated AR optical lenses (CITV / Gunner Thermal / JD-3 Ruby Laser / Cupola Periscopes!)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        optic_zone = (u_grid >= 0.015) & (u_grid <= 0.215) & (v_grid >= 0.610) & (v_grid <= 0.765)
        ao[optic_zone] = np.maximum(ao[optic_zone], 0.90)
        rgh[optic_zone] = np.minimum(rgh[optic_zone], 0.08)

        # Boost chrome hydraulic recoil cylinders & breech steel for cutaway clarity
        chrome_zone = (u_grid >= 0.255) & (u_grid <= 0.520) & (v_grid >= 0.610) & (v_grid <= 0.765)
        ao[chrome_zone] = np.maximum(ao[chrome_zone], 0.86)
        rgh[chrome_zone] = np.minimum(rgh[chrome_zone], 0.18)

        paint_bev = _bevel_mask(np.maximum(w_p, r_p), width_px=1.1 * res_scale)
        del w_p, r_p, g_p
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(0.15 * paint_bev, strength=1.8))
        del nrm, paint_bev

        rgh = np.clip(rgh, 0.06, 0.96)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)
        del ao, rgh, met

        alb_img = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        nrm_img = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        orm_img = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        del albedo, nrm_final, orm
        gc.collect()
        print(f"[POST] Composited ztz99a_v3_turret_gun ({w}x{h})")
        return alb_img, nrm_img, orm_img

    # -------------------------------------------------------------------------
    # SUITE 3: ztz99a_v3_interior_power_{albedo,normal,roughness}.webp (2048x2048)
    # -------------------------------------------------------------------------
    def process_interior_power_atlas() -> tuple[Image.Image, Image.Image, Image.Image]:
        alb_lin = _read_f32_rgb(tmp_dir / "ip_albedo.npy")
        rgh = _read_f32_scalar(tmp_dir / "ip_roughness.npy")
        met = _read_f32_scalar(tmp_dir / "ip_metalness.npy")
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "ip_normal.npy"))
        ao = _combine_ao(
            _read_f32_scalar(tmp_dir / "ip_ao_self.npy"),
            _read_f32_scalar(tmp_dir / "ip_ao_ext.npy"),
            _read_f32_scalar(tmp_dir / "ip_ext_mask.npy"),
        )

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)
        del alb_lin

        # --- HERO BAND 1: Digital Fire-Control MFD Screen Graphics [0.015, 0.245] x [0.785, 0.985] ---
        MW, MH = 920, 760
        mfd_bg = Image.new("L", (MW, MH), 255)
        mfd_cyan = Image.new("L", (MW, MH), 0)
        mfd_amber = Image.new("L", (MW, MH), 0)
        dc = ImageDraw.Draw(mfd_cyan)
        da = ImageDraw.Draw(mfd_amber)

        dc.rectangle((24, 24, MW - 24, MH - 24), outline=255, width=8)
        dc.line([(24, 118), (MW - 24, 118)], fill=235, width=5)
        dc.text((MW // 2, 70), "ZTZ-99A DIGITAL FCS  -  TRACK LOCK", font=_load_font(FONT_DIN, 42), fill=255, anchor="mm")
        # Ballistic radar reticle & range ticks
        rcx, rcy = 300, 420
        for rr in (75, 155, 225):
            dc.ellipse((rcx - rr, rcy - rr, rcx + rr, rcy + rr), outline=210, width=4)
        dc.line([(rcx - 245, rcy), (rcx + 245, rcy)], fill=230, width=4)
        dc.line([(rcx, rcy - 245), (rcx, rcy + 245)], fill=230, width=4)
        da.rectangle((rcx - 28, rcy - 28, rcx + 28, rcy + 28), outline=255, width=7)
        # Right telemetry readout
        dc.text((600, 210), "AMMO: DTC10-125", font=_load_font(FONT_DIN, 36), fill=255)
        dc.text((600, 280), "RNG : 2,480 M", font=_load_font(FONT_DIN, 36), fill=255)
        dc.text((600, 350), "V0  : 1,780 M/S", font=_load_font(FONT_DIN, 36), fill=255)
        da.text((600, 440), "CAROUSEL: 22/22", font=_load_font(FONT_DIN, 36), fill=255)
        da.text((600, 515), "150HB V12: 1500HP", font=_load_font(FONT_DIN, 34), fill=255)
        dc.text((600, 595), "JD-3 LASER: ARMED", font=_load_font(FONT_DIN, 34), fill=255)

        m_bg = np.zeros((h, w), dtype=np.float32)
        m_cy = np.zeros((h, w), dtype=np.float32)
        m_am = np.zeros((h, w), dtype=np.float32)
        for v0, v1 in ((0.785, 0.844), (0.856, 0.915), (0.927, 0.986)):
            _paste_uv_band(m_bg, mfd_bg,   0.015, 0.245, v0, v1)
            _paste_uv_band(m_cy, mfd_cyan, 0.015, 0.245, v0, v1)
            _paste_uv_band(m_am, mfd_amber, 0.015, 0.245, v0, v1)

        _mix(albedo, (0.04, 0.14, 0.12), m_bg * 0.98)
        _mix(albedo, (0.14, 0.95, 0.72), m_cy * 0.98)
        _mix(albedo, (0.98, 0.78, 0.18), m_am * 0.98)
        _mix(rgh, 0.14, m_bg * 0.95)
        _mix(met, 0.05, m_bg * 0.95)
        ao = np.maximum(ao, m_bg * 0.95)

        # --- HERO BAND 2: 150HB V12 Intercooler Data Plate [0.275, 0.565] x [0.805, 0.985] ---
        EW, EH = 1120, 560
        e_dark = Image.new("L", (EW, EH), 0)
        de = ImageDraw.Draw(e_dark)
        de.rounded_rectangle((28, 28, EW - 28, EH - 28), radius=18, outline=255, width=9)
        de.text((EW // 2, 130), "NORINCO  150HB-2  V12", font=_load_font(FONT_DIN, 86), fill=255, anchor="mm")
        de.line([(80, 196), (EW - 80, 196)], fill=240, width=6)
        de.text((EW // 2, 286), "1,103 KW  (1,500 HP)  TWIN-TURBO", font=_load_font(FONT_DIN, 64), fill=255, anchor="mm")
        de.text((EW // 2, 396), "CH-1000 HYDRO-MECHANICAL POWERPACK", font=_load_font(FONT_COND, 56), fill=245, anchor="mm")
        de.text((EW // 2, 478), "ZTZ-99A INTEGRATED PROPULSION UNIT", font=_load_font(FONT_COND, 48), fill=235, anchor="mm")

        m_eng = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(m_eng, e_dark, 0.275, 0.565, 0.805, 0.985)
        _mix(albedo, (0.10, 0.11, 0.12), m_eng * 0.92)
        _mix(rgh, 0.48, m_eng * 0.85)
        _mix(met, 0.20, m_eng * 0.85)

        # Lift interior cutaway visibility while keeping realistic mechanical shadow depth
        ao = np.clip(0.46 + 0.54 * ao, 0.46, 1.0).astype(np.float32)

        eng_bev = _bevel_mask(m_eng, width_px=1.0)
        nrm_final = _rnm_blend(nrm, _height_to_normal_01(-0.30 * eng_bev, strength=2.0))
        del nrm, eng_bev, m_bg, m_cy, m_am, m_eng

        rgh = np.clip(rgh, 0.12, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)
        del ao, rgh, met

        alb_img = Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8))
        nrm_img = Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8))
        orm_img = Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8))
        del albedo, nrm_final, orm
        gc.collect()
        print(f"[POST] Composited ztz99a_v3_interior_power ({w}x{h})")
        return alb_img, nrm_img, orm_img

    ah_imgs = process_armor_hull_atlas()
    tg_imgs = process_turret_gun_atlas()
    ip_imgs = process_interior_power_atlas()

    # Adaptive WebP quality tuning: maximize 4K crispness while strictly <= 11.80 MB (target <= 11.50 MB)!
    glb_bytes = glb_path.stat().st_size if (glb_path is not None and glb_path.exists()) else 0
    TARGET_MAX_BYTES = int(11.50 * 1024 * 1024)
    HARD_MAX_BYTES = int(11.80 * 1024 * 1024)

    # Quality ladder: (q4k_alb, q4k_nrm, q4k_orm, q2k_alb, q2k_nrm, q2k_orm)
    quality_ladder = [
        (88, 90, 88, 90, 92, 90),
        (85, 87, 85, 88, 90, 88),
        (82, 84, 82, 86, 88, 86),
        (78, 81, 79, 84, 86, 84),
        (74, 78, 76, 82, 84, 82),
        (70, 75, 73, 79, 82, 79),
        (66, 72, 70, 76, 79, 76),
    ]

    out_specs = [
        ("ztz99a_v3_armor_hull_albedo.webp",        ah_imgs[0], 0),
        ("ztz99a_v3_armor_hull_normal.webp",        ah_imgs[1], 1),
        ("ztz99a_v3_armor_hull_roughness.webp",     ah_imgs[2], 2),
        ("ztz99a_v3_turret_gun_albedo.webp",        tg_imgs[0], 0),
        ("ztz99a_v3_turret_gun_normal.webp",        tg_imgs[1], 1),
        ("ztz99a_v3_turret_gun_roughness.webp",     tg_imgs[2], 2),
        ("ztz99a_v3_interior_power_albedo.webp",    ip_imgs[0], 3),
        ("ztz99a_v3_interior_power_normal.webp",    ip_imgs[1], 4),
        ("ztz99a_v3_interior_power_roughness.webp", ip_imgs[2], 5),
    ]

    final_total = 0
    chosen_profile = quality_ladder[-1]
    for profile in quality_ladder:
        tex_bytes = 0
        for fname, pil_img, q_idx in out_specs:
            p = out_dir / fname
            pil_img.save(p, "WEBP", quality=profile[q_idx], method=6)
            tex_bytes += p.stat().st_size
        final_total = glb_bytes + tex_bytes
        chosen_profile = profile
        print(
            f"[POST-BUDGET] WebP q4k=({profile[0]}/{profile[1]}/{profile[2]}) q2k=({profile[3]}/{profile[4]}/{profile[5]}) "
            f"-> GLB={glb_bytes/1048576:.2f} MB + 9 WebPs={tex_bytes/1048576:.2f} MB = {final_total/1048576:.2f} MB"
        )
        if final_total <= TARGET_MAX_BYTES:
            break

    assert final_total <= HARD_MAX_BYTES, (
        f"Bundle size {final_total/1048576:.2f} MB exceeded hard 11.80 MB cap even at lowest quality {chosen_profile}!"
    )
    print(f"[POST] Finalized 9 WebP maps cleanly at {final_total/1048576:.2f} MB (target <= 11.50 MB, cap <= 11.80 MB)")
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Modeling, UV Layout, Cycles Bake & Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_OUT = REPO_ROOT / "public" / "models" / "ztz99a.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"

ATLAS_SIZE_4K = 4096
ATLAS_SIZE_2K = 2048
BAKE_AO_SAMPLES_4K = 20
BAKE_NORMAL_SAMPLES_4K = 12
BAKE_AO_SAMPLES_2K = 24
BAKE_NORMAL_SAMPLES_2K = 16

ROAD_WHEEL_XS = (248.0, 154.0, 62.0, -30.0, -122.0, -214.0)
TRACK_CENTER_Z = 138.0
CAROUSEL_STATIONS = 22

T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 3-Suite Mapping (24 solid parts; skips ONLY `ztz99a_recoil_springs` & `ztz99a_rammer_spring`)
ARMOR_HULL_PARTS = [
    "ztz99a_hull_armor",
    "ztz99a_glacis_era",
    "ztz99a_side_skirts",
    "ztz99a_road_wheels",
    "ztz99a_tracks_left",
    "ztz99a_tracks_right",
    "ztz99a_rear_deck",
    "ztz99a_turret_ring",
]

TURRET_GUN_PARTS = [
    "ztz99a_turret_shell",
    "ztz99a_era_wedges",
    "ztz99a_main_gun",
    "ztz99a_gun_cradle",
    "ztz99a_recoil_cylinders",
    "ztz99a_breech_block",
    "ztz99a_optics_citv",
    "ztz99a_roof_armaments",
]

INTERIOR_POWER_PARTS = [
    "ztz99a_autoloader_carousel",
    "ztz99a_loading_tray",
    "ztz99a_rammer_chain",
    "ztz99a_stub_ejector",
    "ztz99a_v12_engine",
    "ztz99a_transmission",
    "ztz99a_torsion_bars",
    "ztz99a_crew_stations",
]

EXTERIOR_CONTACT_AO_PARTS = {
    "ztz99a_hull_armor",
    "ztz99a_glacis_era",
    "ztz99a_side_skirts",
    "ztz99a_road_wheels",
    "ztz99a_tracks_left",
    "ztz99a_tracks_right",
    "ztz99a_rear_deck",
    "ztz99a_turret_shell",
    "ztz99a_era_wedges",
    "ztz99a_main_gun",
    "ztz99a_gun_cradle",
    "ztz99a_optics_citv",
    "ztz99a_roof_armaments",
}

ASSEMBLED_POS = {
    "ztz99a_hull_armor":          (   0.0,   0.0,    0.0),
    "ztz99a_glacis_era":          ( 298.0, -10.0,    0.0),
    "ztz99a_side_skirts":         (   0.0, -22.0,    0.0),
    "ztz99a_road_wheels":         (   0.0, -76.0,    0.0),
    "ztz99a_tracks_left":         (   0.0, -70.0, -138.0),
    "ztz99a_tracks_right":        (   0.0, -70.0,  138.0),
    "ztz99a_rear_deck":           (-256.0,   8.0,    0.0),
    "ztz99a_turret_ring":         (  22.0,   9.5,    0.0),
    "ztz99a_turret_shell":        (   0.0,  38.0,    0.0),
    "ztz99a_era_wedges":          (  84.0,  40.0,    0.0),
    "ztz99a_main_gun":            (  85.0,  38.0,    0.0),
    "ztz99a_gun_cradle":          ( 100.0,  38.0,    0.0),
    "ztz99a_recoil_cylinders":    (  62.0,  48.0,    0.0),
    "ztz99a_breech_block":        (  62.0,  38.0,    0.0),
    "ztz99a_optics_citv":         (  18.0,  78.0,    0.0),
    "ztz99a_roof_armaments":      ( -10.0,  82.0,    0.0),
    "ztz99a_autoloader_carousel": (  22.0, -40.0,    0.0),
    "ztz99a_loading_tray":        ( -48.0, -32.0,    0.0),
    "ztz99a_rammer_chain":        (-112.0,  38.0,    0.0),
    "ztz99a_stub_ejector":        ( -42.0,  54.0,    0.0),
    "ztz99a_v12_engine":          (-216.0, -24.0,    0.0),
    "ztz99a_transmission":        (-314.0, -28.0,    0.0),
    "ztz99a_torsion_bars":        (  16.0, -63.0,    0.0),
    "ztz99a_crew_stations":       ( 100.0,  -8.0,    0.0),
}


# =============================================================================
# Scene & Physically Calibrated PLA ZTZ-99A Material Library (Cycles Metal GPU)
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
    world.light_settings.distance = 22.0

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    print(f"[SCENE] Blender {bpy.app.version_string} | Cycles device = {scene.cycles.device}")
    return scene


def _build_pla_digital_camo_mat(
    name: str,
    pixel_cm: float = 13.5,
    bevel_r: float = 2.0,
    edge_wear: float = 0.66,
    olive_srgb=(0.258, 0.326, 0.208),
    khaki_srgb=(0.512, 0.468, 0.328),
    dark_srgb=(0.155, 0.192, 0.148),
    roughness: float = 0.82,
    dust_floor_z: float = -22.0,
    dust_band_h: float = 44.0,
    dust_strength: float = 0.58,
    oil_seep: str | None = None,
    exhaust_soot: str | None = None,
) -> bpy.types.Material:
    """
    AAA 4K PLA Type 07 dead-matte 3-tone pixelated digital armor camouflage (Olive / Loess-Khaki / Deep-Pine)
    with multi-scale RHA rolled-steel mill scale + Voronoi pitting, vertical rain streaks, crusty dry loess
    mud/dust buildup (R~0.94..0.96), wet hydraulic/diesel oil seep patches (R~0.20..0.28), directional left
    exhaust soot plume & per-pixel Bevel-Curvature rubbed armor steel edge chipping!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")

    # Quantize 3D Object coordinates into crisp square digital-camo pixels (`pixel_cm` = 13.5 cm)!
    vmath_snap = nt.nodes.new("ShaderNodeVectorMath")
    vmath_snap.operation = "SNAP"
    vmath_snap.inputs[1].default_value = (pixel_cm, pixel_cm, pixel_cm)
    nt.links.new(tc.outputs["Object"], vmath_snap.inputs[0])

    # Coarser macro pixel cluster (2.3x pixel_cm) blended with fine pixels for authentic PLA Type 07 silhouette
    vmath_macro = nt.nodes.new("ShaderNodeVectorMath")
    vmath_macro.operation = "SNAP"
    vmath_macro.inputs[1].default_value = (pixel_cm * 2.3, pixel_cm * 2.3, pixel_cm * 2.3)
    nt.links.new(tc.outputs["Object"], vmath_macro.inputs[0])

    n_pix1 = nt.nodes.new("ShaderNodeTexNoise")
    n_pix1.inputs["Scale"].default_value = 0.018
    n_pix1.inputs["Detail"].default_value = 0.0
    n_pix1.inputs["Roughness"].default_value = 0.50
    nt.links.new(vmath_snap.outputs["Vector"], n_pix1.inputs["Vector"])

    n_pix2 = nt.nodes.new("ShaderNodeTexNoise")
    n_pix2.inputs["Scale"].default_value = 0.010
    n_pix2.inputs["Detail"].default_value = 0.0
    nt.links.new(vmath_macro.outputs["Vector"], n_pix2.inputs["Vector"])

    mix_pat = nt.nodes.new("ShaderNodeMix")
    mix_pat.data_type = "FLOAT"
    mix_pat.inputs["Factor"].default_value = 0.46
    nt.links.new(n_pix1.outputs["Fac"], mix_pat.inputs[2])
    nt.links.new(n_pix2.outputs["Fac"], mix_pat.inputs[3])

    # Hard-stepped 3-tone PLA digital palette calibrated to Perlin PDF -> crisp balanced 30% Dark / 39% Olive / 31% Khaki
    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    ramp_c.color_ramp.interpolation = "CONSTANT"
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(*dark_srgb)
    cr.elements[1].position = 0.454
    cr.elements[1].color = srgb_to_lin(*olive_srgb)
    el_k = cr.elements.new(0.544)
    el_k.color = srgb_to_lin(*khaki_srgb)
    nt.links.new(mix_pat.outputs[0], ramp_c.inputs["Fac"])

    # Heavy multi-scale RHA rolled-steel mill texture + Voronoi pitting (razor-sharp in 4K tank atlas!)
    n_rha = nt.nodes.new("ShaderNodeTexNoise")
    n_rha.inputs["Scale"].default_value = 0.44
    n_rha.inputs["Detail"].default_value = 10.0
    n_rha.inputs["Roughness"].default_value = 0.72
    nt.links.new(tc.outputs["Object"], n_rha.inputs["Vector"])

    v_pit = nt.nodes.new("ShaderNodeTexVoronoi")
    v_pit.feature = "F1"
    v_pit.inputs["Scale"].default_value = 1.65
    nt.links.new(tc.outputs["Object"], v_pit.inputs["Vector"])

    mix_bump_h = nt.nodes.new("ShaderNodeMix")
    mix_bump_h.data_type = "FLOAT"
    mix_bump_h.inputs["Factor"].default_value = 0.34
    nt.links.new(n_rha.outputs["Fac"], mix_bump_h.inputs[2])
    nt.links.new(v_pit.outputs["Distance"], mix_bump_h.inputs[3])
    bump_h_sock = mix_bump_h.outputs[0]

    # Large-scale tonal weathering / sun-fade modulation across armor panels
    n_macro_dust = nt.nodes.new("ShaderNodeTexNoise")
    n_macro_dust.inputs["Scale"].default_value = 0.022
    n_macro_dust.inputs["Detail"].default_value = 7.0
    n_macro_dust.inputs["Roughness"].default_value = 0.68
    nt.links.new(tc.outputs["Object"], n_macro_dust.inputs["Vector"])

    # Fine splashy loess mud clump noise for organic dried mud buildup
    n_mud_clod = nt.nodes.new("ShaderNodeTexNoise")
    n_mud_clod.inputs["Scale"].default_value = 0.14
    n_mud_clod.inputs["Detail"].default_value = 9.0
    n_mud_clod.inputs["Roughness"].default_value = 0.78
    nt.links.new(tc.outputs["Object"], n_mud_clod.inputs["Vector"])

    col_tone = nt.nodes.new("ShaderNodeMix")
    col_tone.data_type = "RGBA"
    col_tone.blend_type = "MULTIPLY"
    col_tone.inputs["Factor"].default_value = 0.24
    nt.links.new(ramp_c.outputs["Color"], col_tone.inputs[6])
    nt.links.new(n_macro_dust.outputs["Color"], col_tone.inputs[7])
    col_sock = col_tone.outputs[2]

    # Vertical rain & diesel runoff streaks (Blender Z-up!)
    map_streak = nt.nodes.new("ShaderNodeMapping")
    map_streak.inputs["Scale"].default_value = (0.048, 0.048, 0.008)
    nt.links.new(tc.outputs["Object"], map_streak.inputs["Vector"])
    n_streak = nt.nodes.new("ShaderNodeTexNoise")
    n_streak.inputs["Scale"].default_value = 1.0
    n_streak.inputs["Detail"].default_value = 6.0
    n_streak.inputs["Roughness"].default_value = 0.68
    nt.links.new(map_streak.outputs["Vector"], n_streak.inputs["Vector"])

    mr_streak = nt.nodes.new("ShaderNodeMapRange")
    mr_streak.clamp = True
    mr_streak.inputs["From Min"].default_value = 0.56
    mr_streak.inputs["From Max"].default_value = 0.76
    mr_streak.inputs["To Min"].default_value = 0.0
    mr_streak.inputs["To Max"].default_value = 0.28
    nt.links.new(n_streak.outputs["Fac"], mr_streak.inputs["Value"])

    mix_streak = nt.nodes.new("ShaderNodeMix")
    mix_streak.data_type = "RGBA"
    mix_streak.inputs[7].default_value = srgb_to_lin(0.08, 0.09, 0.07)
    nt.links.new(mr_streak.outputs["Result"], mix_streak.inputs[0])
    nt.links.new(col_sock, mix_streak.inputs[6])
    col_sock = mix_streak.outputs[2]

    # Dead-matte anti-IR CARC military paint roughness (0.74..0.92, never glossy plastic!)
    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.70, roughness - 0.09)
    rgh_map.inputs["To Max"].default_value = min(0.93, roughness + 0.09)
    nt.links.new(n_macro_dust.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = 0.02
    met_sock = met_node.outputs[0]

    sep_obj = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep_obj.inputs["Vector"])

    # Thick dry northern-China loess mud/dust buildup (Blender Z == Three.js Y -> R~0.94..0.96!)
    if dust_strength > 0.01:
        mr_dust = nt.nodes.new("ShaderNodeMapRange")
        mr_dust.clamp = True
        mr_dust.inputs["From Min"].default_value = dust_floor_z - dust_band_h * 0.65
        mr_dust.inputs["From Max"].default_value = dust_floor_z + dust_band_h * 0.35
        mr_dust.inputs["To Min"].default_value = dust_strength
        mr_dust.inputs["To Max"].default_value = 0.0
        nt.links.new(sep_obj.outputs["Z"], mr_dust.inputs["Value"])

        # Organic mud splash breakup combining macro + clod noise
        mix_dn = nt.nodes.new("ShaderNodeMix")
        mix_dn.data_type = "FLOAT"
        mix_dn.inputs["Factor"].default_value = 0.48
        nt.links.new(n_macro_dust.outputs["Fac"], mix_dn.inputs[2])
        nt.links.new(n_mud_clod.outputs["Fac"], mix_dn.inputs[3])

        mr_dn = nt.nodes.new("ShaderNodeMapRange")
        mr_dn.clamp = True
        mr_dn.inputs["From Min"].default_value = 0.22
        mr_dn.inputs["From Max"].default_value = 0.72
        mr_dn.inputs["To Min"].default_value = 0.35
        mr_dn.inputs["To Max"].default_value = 1.0
        nt.links.new(mix_dn.outputs[0], mr_dn.inputs["Value"])

        mul_dust = nt.nodes.new("ShaderNodeMath")
        mul_dust.operation = "MULTIPLY"
        mul_dust.use_clamp = True
        nt.links.new(mr_dust.outputs["Result"], mul_dust.inputs[0])
        nt.links.new(mr_dn.outputs["Result"], mul_dust.inputs[1])

        # Two-tone dry loess mud (warm pale ochre dust + darker caked soil clods)
        mix_mud_col = nt.nodes.new("ShaderNodeMix")
        mix_mud_col.data_type = "RGBA"
        mix_mud_col.inputs[6].default_value = srgb_to_lin(0.34, 0.29, 0.20)
        mix_mud_col.inputs[7].default_value = srgb_to_lin(0.49, 0.43, 0.30)
        nt.links.new(n_mud_clod.outputs["Fac"], mix_mud_col.inputs[0])

        mix_dust = nt.nodes.new("ShaderNodeMix")
        mix_dust.data_type = "RGBA"
        nt.links.new(mul_dust.outputs["Value"], mix_dust.inputs[0])
        nt.links.new(col_sock, mix_dust.inputs[6])
        nt.links.new(mix_mud_col.outputs[2], mix_dust.inputs[7])
        col_sock = mix_dust.outputs[2]

        mix_dr = nt.nodes.new("ShaderNodeMix")
        mix_dr.data_type = "FLOAT"
        mix_dr.inputs[3].default_value = 0.955
        nt.links.new(mul_dust.outputs["Value"], mix_dr.inputs[0])
        nt.links.new(rgh_sock, mix_dr.inputs[2])
        rgh_sock = mix_dr.outputs[0]

        mix_dm = nt.nodes.new("ShaderNodeMix")
        mix_dm.data_type = "FLOAT"
        mix_dm.inputs[3].default_value = 0.0
        nt.links.new(mul_dust.outputs["Value"], mix_dm.inputs[0])
        nt.links.new(met_sock, mix_dm.inputs[2])
        met_sock = mix_dm.outputs[0]

        # Add crusty dried mud micro-relief into bump height
        mix_db = nt.nodes.new("ShaderNodeMix")
        mix_db.data_type = "FLOAT"
        nt.links.new(mul_dust.outputs["Value"], mix_db.inputs[0])
        nt.links.new(bump_h_sock, mix_db.inputs[2])
        nt.links.new(n_mud_clod.outputs["Fac"], mix_db.inputs[3])
        bump_h_sock = mix_db.outputs[0]

    # Wet dark diesel / hydraulic oil seep patches (R~0.20..0.28, darkened wet oil-soaked albedo!)
    if oil_seep is not None:
        if oil_seep == "fuel_drum":
            # Vertical diesel seep streaks dripping downward from top filler caps on twin rear fuel drums
            map_oil = nt.nodes.new("ShaderNodeMapping")
            map_oil.inputs["Scale"].default_value = (0.095, 0.085, 0.022)
            nt.links.new(tc.outputs["Object"], map_oil.inputs["Vector"])
            n_oil = nt.nodes.new("ShaderNodeTexNoise")
            n_oil.inputs["Scale"].default_value = 1.0
            n_oil.inputs["Detail"].default_value = 8.0
            n_oil.inputs["Roughness"].default_value = 0.65
            nt.links.new(map_oil.outputs["Vector"], n_oil.inputs["Vector"])

            mr_oil_n = nt.nodes.new("ShaderNodeMapRange")
            mr_oil_n.clamp = True
            mr_oil_n.inputs["From Min"].default_value = 0.50
            mr_oil_n.inputs["From Max"].default_value = 0.68
            mr_oil_n.inputs["To Min"].default_value = 0.0
            mr_oil_n.inputs["To Max"].default_value = 0.92
            nt.links.new(n_oil.outputs["Fac"], mr_oil_n.inputs["Value"])

            # Concentrate near top/side filler zone (local Y > -24 -> Blender Z > -24)
            mr_oz = nt.nodes.new("ShaderNodeMapRange")
            mr_oz.clamp = True
            mr_oz.inputs["From Min"].default_value = -25.0
            mr_oz.inputs["From Max"].default_value = -6.0
            mr_oz.inputs["To Min"].default_value = 0.22
            mr_oz.inputs["To Max"].default_value = 1.0
            nt.links.new(sep_obj.outputs["Z"], mr_oz.inputs["Value"])

            oil_mask = nt.nodes.new("ShaderNodeMath")
            oil_mask.operation = "MULTIPLY"
            oil_mask.use_clamp = True
            nt.links.new(mr_oil_n.outputs["Result"], oil_mask.inputs[0])
            nt.links.new(mr_oz.outputs["Result"], oil_mask.inputs[1])
            oil_sock = oil_mask.outputs["Value"]
            oil_rgh_target = 0.22
        elif oil_seep == "rear_deck":
            # Wet hydraulic/diesel oil pools around rear engine deck hatches, hinges & cooling louver borders
            n_oil = nt.nodes.new("ShaderNodeTexNoise")
            n_oil.inputs["Scale"].default_value = 0.042
            n_oil.inputs["Detail"].default_value = 8.0
            n_oil.inputs["Roughness"].default_value = 0.64
            nt.links.new(tc.outputs["Object"], n_oil.inputs["Vector"])

            mr_oil_n = nt.nodes.new("ShaderNodeMapRange")
            mr_oil_n.clamp = True
            mr_oil_n.inputs["From Min"].default_value = 0.54
            mr_oil_n.inputs["From Max"].default_value = 0.70
            mr_oil_n.inputs["To Min"].default_value = 0.0
            mr_oil_n.inputs["To Max"].default_value = 0.88
            nt.links.new(n_oil.outputs["Fac"], mr_oil_n.inputs["Value"])

            # Focus on upper deck surface (local Y >= +6 -> Blender Z >= +6)
            mr_oz = nt.nodes.new("ShaderNodeMapRange")
            mr_oz.clamp = True
            mr_oz.inputs["From Min"].default_value = 3.0
            mr_oz.inputs["From Max"].default_value = 9.0
            mr_oz.inputs["To Min"].default_value = 0.15
            mr_oz.inputs["To Max"].default_value = 1.0
            nt.links.new(sep_obj.outputs["Z"], mr_oz.inputs["Value"])

            oil_mask = nt.nodes.new("ShaderNodeMath")
            oil_mask.operation = "MULTIPLY"
            oil_mask.use_clamp = True
            nt.links.new(mr_oil_n.outputs["Result"], oil_mask.inputs[0])
            nt.links.new(mr_oz.outputs["Result"], oil_mask.inputs[1])
            oil_sock = oil_mask.outputs["Value"]
            oil_rgh_target = 0.23
        else:
            # "wheel_dish": dark hydraulic/hub oil streaks weeping out around road-wheel center oil hubcaps!
            map_oil = nt.nodes.new("ShaderNodeMapping")
            map_oil.inputs["Scale"].default_value = (0.11, 0.08, 0.032)
            nt.links.new(tc.outputs["Object"], map_oil.inputs["Vector"])
            n_oil = nt.nodes.new("ShaderNodeTexNoise")
            n_oil.inputs["Scale"].default_value = 1.0
            n_oil.inputs["Detail"].default_value = 8.0
            n_oil.inputs["Roughness"].default_value = 0.66
            nt.links.new(map_oil.outputs["Vector"], n_oil.inputs["Vector"])

            mr_oil_n = nt.nodes.new("ShaderNodeMapRange")
            mr_oil_n.clamp = True
            mr_oil_n.inputs["From Min"].default_value = 0.44
            mr_oil_n.inputs["From Max"].default_value = 0.66
            mr_oil_n.inputs["To Min"].default_value = 0.18
            mr_oil_n.inputs["To Max"].default_value = 0.92
            nt.links.new(n_oil.outputs["Fac"], mr_oil_n.inputs["Value"])
            oil_sock = mr_oil_n.outputs["Result"]
            oil_rgh_target = 0.23

        mix_oc = nt.nodes.new("ShaderNodeMix")
        mix_oc.data_type = "RGBA"
        mix_oc.inputs[7].default_value = srgb_to_lin(0.055, 0.058, 0.048)
        nt.links.new(oil_sock, mix_oc.inputs[0])
        nt.links.new(col_sock, mix_oc.inputs[6])
        col_sock = mix_oc.outputs[2]

        mix_or = nt.nodes.new("ShaderNodeMix")
        mix_or.data_type = "FLOAT"
        mix_or.inputs[3].default_value = oil_rgh_target
        nt.links.new(oil_sock, mix_or.inputs[0])
        nt.links.new(rgh_sock, mix_or.inputs[2])
        rgh_sock = mix_or.outputs[0]

    # Directional diesel exhaust soot plume spreading rearward from left exhaust manifold!
    if exhaust_soot is not None:
        if exhaust_soot == "rear_deck":
            # Left exhaust at rear_deck local X=+26, Z=-102 -> Blender bx=+26, by=+102!
            # Plume sweeps rearward (bx from +58 down to -98) and inward from left edge (by from +115 to +22)
            mr_sx1 = nt.nodes.new("ShaderNodeMapRange")
            mr_sx1.clamp = True
            mr_sx1.inputs["From Min"].default_value = 62.0
            mr_sx1.inputs["From Max"].default_value = 18.0
            mr_sx1.inputs["To Min"].default_value = 0.0
            mr_sx1.inputs["To Max"].default_value = 1.0
            nt.links.new(sep_obj.outputs["X"], mr_sx1.inputs["Value"])

            mr_sx2 = nt.nodes.new("ShaderNodeMapRange")
            mr_sx2.clamp = True
            mr_sx2.inputs["From Min"].default_value = -105.0
            mr_sx2.inputs["From Max"].default_value = 28.0
            mr_sx2.inputs["To Min"].default_value = 0.35
            mr_sx2.inputs["To Max"].default_value = 1.0
            nt.links.new(sep_obj.outputs["X"], mr_sx2.inputs["Value"])

            mr_sy = nt.nodes.new("ShaderNodeMapRange")
            mr_sy.clamp = True
            mr_sy.inputs["From Min"].default_value = 28.0
            mr_sy.inputs["From Max"].default_value = 104.0
            mr_sy.inputs["To Min"].default_value = 0.0
            mr_sy.inputs["To Max"].default_value = 0.92
            nt.links.new(sep_obj.outputs["Y"], mr_sy.inputs["Value"])
        else:
            # "hull_left_rear": matching diesel soot plume over left rear fender & stowage bin (world X in [-345, -195], Z in [-162, -104] -> by in [+104, +162])
            mr_sx1 = nt.nodes.new("ShaderNodeMapRange")
            mr_sx1.clamp = True
            mr_sx1.inputs["From Min"].default_value = -190.0
            mr_sx1.inputs["From Max"].default_value = -238.0
            mr_sx1.inputs["To Min"].default_value = 0.0
            mr_sx1.inputs["To Max"].default_value = 1.0
            nt.links.new(sep_obj.outputs["X"], mr_sx1.inputs["Value"])

            mr_sx2 = nt.nodes.new("ShaderNodeMapRange")
            mr_sx2.clamp = True
            mr_sx2.inputs["From Min"].default_value = -355.0
            mr_sx2.inputs["From Max"].default_value = -235.0
            mr_sx2.inputs["To Min"].default_value = 0.25
            mr_sx2.inputs["To Max"].default_value = 0.78
            nt.links.new(sep_obj.outputs["X"], mr_sx2.inputs["Value"])

            mr_sy = nt.nodes.new("ShaderNodeMapRange")
            mr_sy.clamp = True
            mr_sy.inputs["From Min"].default_value = 98.0
            mr_sy.inputs["From Max"].default_value = 152.0
            mr_sy.inputs["To Min"].default_value = 0.0
            mr_sy.inputs["To Max"].default_value = 0.80
            nt.links.new(sep_obj.outputs["Y"], mr_sy.inputs["Value"])

        mul_sx = nt.nodes.new("ShaderNodeMath")
        mul_sx.operation = "MULTIPLY"
        nt.links.new(mr_sx1.outputs["Result"], mul_sx.inputs[0])
        nt.links.new(mr_sx2.outputs["Result"], mul_sx.inputs[1])

        mul_sxy = nt.nodes.new("ShaderNodeMath")
        mul_sxy.operation = "MULTIPLY"
        nt.links.new(mul_sx.outputs["Value"], mul_sxy.inputs[0])
        nt.links.new(mr_sy.outputs["Result"], mul_sxy.inputs[1])

        # Wispy turbulent soot plume breakup stretched along airflow -X
        map_soot = nt.nodes.new("ShaderNodeMapping")
        map_soot.inputs["Scale"].default_value = (0.014, 0.045, 0.045)
        nt.links.new(tc.outputs["Object"], map_soot.inputs["Vector"])
        n_soot = nt.nodes.new("ShaderNodeTexNoise")
        n_soot.inputs["Scale"].default_value = 1.0
        n_soot.inputs["Detail"].default_value = 7.0
        n_soot.inputs["Roughness"].default_value = 0.68
        nt.links.new(map_soot.outputs["Vector"], n_soot.inputs["Vector"])

        mr_sn = nt.nodes.new("ShaderNodeMapRange")
        mr_sn.clamp = True
        mr_sn.inputs["From Min"].default_value = 0.26
        mr_sn.inputs["From Max"].default_value = 0.72
        mr_sn.inputs["To Min"].default_value = 0.35
        mr_sn.inputs["To Max"].default_value = 1.0
        nt.links.new(n_soot.outputs["Fac"], mr_sn.inputs["Value"])

        mul_soot = nt.nodes.new("ShaderNodeMath")
        mul_soot.operation = "MULTIPLY"
        mul_soot.use_clamp = True
        nt.links.new(mul_sxy.outputs["Value"], mul_soot.inputs[0])
        nt.links.new(mr_sn.outputs["Result"], mul_soot.inputs[1])

        mix_sc = nt.nodes.new("ShaderNodeMix")
        mix_sc.data_type = "RGBA"
        mix_sc.inputs[7].default_value = srgb_to_lin(0.046, 0.045, 0.043)
        nt.links.new(mul_soot.outputs["Value"], mix_sc.inputs[0])
        nt.links.new(col_sock, mix_sc.inputs[6])
        col_sock = mix_sc.outputs[2]

        mix_sr = nt.nodes.new("ShaderNodeMix")
        mix_sr.data_type = "FLOAT"
        mix_sr.inputs[3].default_value = 0.94
        nt.links.new(mul_soot.outputs["Value"], mix_sr.inputs[0])
        nt.links.new(rgh_sock, mix_sr.inputs[2])
        rgh_sock = mix_sr.outputs[0]

    # Tank-scale ShaderNodeBevel drives BOTH crisp normal highlights AND per-pixel curvature edge chipping!
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if edge_wear > 0.001:
        dot_bev = nt.nodes.new("ShaderNodeVectorMath")
        dot_bev.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], dot_bev.inputs[0])
        nt.links.new(geom.outputs["True Normal"], dot_bev.inputs[1])

        sub_curv = nt.nodes.new("ShaderNodeMath")
        sub_curv.operation = "SUBTRACT"
        sub_curv.inputs[0].default_value = 1.0
        nt.links.new(dot_bev.outputs["Value"], sub_curv.inputs[1])

        mr_edge = nt.nodes.new("ShaderNodeMapRange")
        mr_edge.clamp = True
        mr_edge.inputs["From Min"].default_value = 0.012
        mr_edge.inputs["From Max"].default_value = 0.14
        mr_edge.inputs["To Min"].default_value = 0.0
        mr_edge.inputs["To Max"].default_value = min(1.0, edge_wear * 1.25)
        nt.links.new(sub_curv.outputs["Value"], mr_edge.inputs["Value"])

        n_chip = nt.nodes.new("ShaderNodeTexNoise")
        n_chip.inputs["Scale"].default_value = 0.11
        n_chip.inputs["Detail"].default_value = 7.0
        n_chip.inputs["Roughness"].default_value = 0.72
        nt.links.new(tc.outputs["Object"], n_chip.inputs["Vector"])

        mr_chip = nt.nodes.new("ShaderNodeMapRange")
        mr_chip.clamp = True
        mr_chip.inputs["From Min"].default_value = 0.34
        mr_chip.inputs["From Max"].default_value = 0.66
        mr_chip.inputs["To Min"].default_value = 0.18
        mr_chip.inputs["To Max"].default_value = 1.0
        nt.links.new(n_chip.outputs["Fac"], mr_chip.inputs["Value"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        mul_w.use_clamp = True
        nt.links.new(mr_edge.outputs["Result"], mul_w.inputs[0])
        nt.links.new(mr_chip.outputs["Result"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(0.58, 0.60, 0.63)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = 0.30
        nt.links.new(mul_w.outputs["Value"], mix_er.inputs[0])
        nt.links.new(rgh_sock, mix_er.inputs[2])
        rgh_sock = mix_er.outputs[0]

        mix_em = nt.nodes.new("ShaderNodeMix")
        mix_em.data_type = "FLOAT"
        mix_em.inputs[3].default_value = 0.88
        nt.links.new(mul_w.outputs["Value"], mix_em.inputs[0])
        nt.links.new(met_sock, mix_em.inputs[2])
        met_sock = mix_em.outputs[0]

    nt.links.new(col_sock, bsdf.inputs["Base Color"])
    nt.links.new(rgh_sock, bsdf.inputs["Roughness"])
    nt.links.new(met_sock, bsdf.inputs["Metallic"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.38
    bump.inputs["Distance"].default_value = 0.65
    nt.links.new(bump_h_sock, bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_pbr_mat(
    name: str,
    base_srgb: tuple[float, float, float],
    roughness: float,
    metallic: float,
    bevel_r: float = 1.15,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.72, 0.75, 0.80),
    edge_roughness: float | None = None,
    grain_scale: float = 0.65,
    grain_bump: float = 0.18,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    rough_var: float = 0.065,
    dust_floor_z: float | None = None,
    dust_band_h: float = 34.0,
    dust_strength: float = 0.0,
    oil_glaze: float = 0.0,
    soot_left_deck: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = aniso_stretch
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])

    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.036
    n_macro.inputs["Detail"].default_value = 7.0
    n_macro.inputs["Roughness"].default_value = 0.66
    nt.links.new(tc.outputs["Object"], n_macro.inputs["Vector"])

    n_micro = nt.nodes.new("ShaderNodeTexNoise")
    n_micro.inputs["Scale"].default_value = grain_scale
    n_micro.inputs["Detail"].default_value = 8.0
    n_micro.inputs["Roughness"].default_value = 0.68
    nt.links.new(mapping.outputs["Vector"], n_micro.inputs["Vector"])

    v_pit = nt.nodes.new("ShaderNodeTexVoronoi")
    v_pit.feature = "F1"
    v_pit.inputs["Scale"].default_value = grain_scale * 2.0
    nt.links.new(mapping.outputs["Vector"], v_pit.inputs["Vector"])

    mix_h = nt.nodes.new("ShaderNodeMix")
    mix_h.data_type = "FLOAT"
    mix_h.inputs["Factor"].default_value = 0.30
    nt.links.new(n_micro.outputs["Fac"], mix_h.inputs[2])
    nt.links.new(v_pit.outputs["Distance"], mix_h.inputs[3])
    bump_h_sock = mix_h.outputs[0]

    base_a = srgb_to_lin(
        base_srgb[0] * 0.88,
        base_srgb[1] * 0.88,
        base_srgb[2] * 0.88,
    )
    base_b = srgb_to_lin(
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.12),
        min(1.0, base_srgb[2] * 1.12),
    )
    mix_base = nt.nodes.new("ShaderNodeMix")
    mix_base.data_type = "RGBA"
    mix_base.inputs[6].default_value = base_a
    mix_base.inputs[7].default_value = base_b
    nt.links.new(n_macro.outputs["Fac"], mix_base.inputs[0])
    col_sock = mix_base.outputs[2]

    rgh_map = nt.nodes.new("ShaderNodeMapRange")
    rgh_map.clamp = True
    rgh_map.inputs["From Min"].default_value = 0.24
    rgh_map.inputs["From Max"].default_value = 0.76
    rgh_map.inputs["To Min"].default_value = max(0.05, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.96, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    sep_obj = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep_obj.inputs["Vector"])

    # Thick dry loess mud/dust buildup on lower skirts, road-wheel tires & track recesses (R~0.94..0.96)
    if dust_floor_z is not None and dust_strength > 0.01:
        n_clod = nt.nodes.new("ShaderNodeTexNoise")
        n_clod.inputs["Scale"].default_value = 0.16
        n_clod.inputs["Detail"].default_value = 8.0
        n_clod.inputs["Roughness"].default_value = 0.76
        nt.links.new(tc.outputs["Object"], n_clod.inputs["Vector"])

        mr_dz = nt.nodes.new("ShaderNodeMapRange")
        mr_dz.clamp = True
        mr_dz.inputs["From Min"].default_value = dust_floor_z - dust_band_h * 0.6
        mr_dz.inputs["From Max"].default_value = dust_floor_z + dust_band_h * 0.4
        mr_dz.inputs["To Min"].default_value = dust_strength
        mr_dz.inputs["To Max"].default_value = 0.0
        nt.links.new(sep_obj.outputs["Z"], mr_dz.inputs["Value"])

        mr_dn = nt.nodes.new("ShaderNodeMapRange")
        mr_dn.clamp = True
        mr_dn.inputs["From Min"].default_value = 0.22
        mr_dn.inputs["From Max"].default_value = 0.74
        mr_dn.inputs["To Min"].default_value = 0.38
        mr_dn.inputs["To Max"].default_value = 1.0
        nt.links.new(n_clod.outputs["Fac"], mr_dn.inputs["Value"])

        mul_d = nt.nodes.new("ShaderNodeMath")
        mul_d.operation = "MULTIPLY"
        mul_d.use_clamp = True
        nt.links.new(mr_dz.outputs["Result"], mul_d.inputs[0])
        nt.links.new(mr_dn.outputs["Result"], mul_d.inputs[1])

        mix_dc = nt.nodes.new("ShaderNodeMix")
        mix_dc.data_type = "RGBA"
        mix_dc.inputs[7].default_value = srgb_to_lin(0.45, 0.39, 0.27)
        nt.links.new(mul_d.outputs["Value"], mix_dc.inputs[0])
        nt.links.new(col_sock, mix_dc.inputs[6])
        col_sock = mix_dc.outputs[2]

        mix_dr = nt.nodes.new("ShaderNodeMix")
        mix_dr.data_type = "FLOAT"
        mix_dr.inputs[3].default_value = 0.955
        nt.links.new(mul_d.outputs["Value"], mix_dr.inputs[0])
        nt.links.new(rgh_sock, mix_dr.inputs[2])
        rgh_sock = mix_dr.outputs[0]

        mix_dm = nt.nodes.new("ShaderNodeMix")
        mix_dm.data_type = "FLOAT"
        mix_dm.inputs[3].default_value = 0.0
        nt.links.new(mul_d.outputs["Value"], mix_dm.inputs[0])
        nt.links.new(met_sock, mix_dm.inputs[2])
        met_sock = mix_dm.outputs[0]

        mix_db = nt.nodes.new("ShaderNodeMix")
        mix_db.data_type = "FLOAT"
        nt.links.new(mul_d.outputs["Value"], mix_db.inputs[0])
        nt.links.new(bump_h_sock, mix_db.inputs[2])
        nt.links.new(n_clod.outputs["Fac"], mix_db.inputs[3])
        bump_h_sock = mix_db.outputs[0]

    # Patchy glossy wet hydraulic/diesel oil glaze (R~0.20..0.27, darkened wet sheen!)
    if oil_glaze > 0.01:
        n_oil = nt.nodes.new("ShaderNodeTexNoise")
        n_oil.inputs["Scale"].default_value = 0.14
        n_oil.inputs["Detail"].default_value = 7.0
        n_oil.inputs["Roughness"].default_value = 0.62
        nt.links.new(tc.outputs["Object"], n_oil.inputs["Vector"])

        mr_oil = nt.nodes.new("ShaderNodeMapRange")
        mr_oil.clamp = True
        mr_oil.inputs["From Min"].default_value = 0.36
        mr_oil.inputs["From Max"].default_value = 0.66
        mr_oil.inputs["To Min"].default_value = 0.15 * oil_glaze
        mr_oil.inputs["To Max"].default_value = min(0.95, oil_glaze)
        nt.links.new(n_oil.outputs["Fac"], mr_oil.inputs["Value"])

        mix_oc = nt.nodes.new("ShaderNodeMix")
        mix_oc.data_type = "RGBA"
        mix_oc.inputs[7].default_value = srgb_to_lin(0.065, 0.068, 0.064)
        nt.links.new(mr_oil.outputs["Result"], mix_oc.inputs[0])
        nt.links.new(col_sock, mix_oc.inputs[6])
        col_sock = mix_oc.outputs[2]

        mix_or = nt.nodes.new("ShaderNodeMix")
        mix_or.data_type = "FLOAT"
        mix_or.inputs[3].default_value = 0.22
        nt.links.new(mr_oil.outputs["Result"], mix_or.inputs[0])
        nt.links.new(rgh_sock, mix_or.inputs[2])
        rgh_sock = mix_or.outputs[0]

    # Left-side rear-deck cooling louvers catching diesel exhaust soot plume!
    if soot_left_deck:
        mr_sy = nt.nodes.new("ShaderNodeMapRange")
        mr_sy.clamp = True
        mr_sy.inputs["From Min"].default_value = 18.0
        mr_sy.inputs["From Max"].default_value = 86.0
        mr_sy.inputs["To Min"].default_value = 0.0
        mr_sy.inputs["To Max"].default_value = 0.88
        nt.links.new(sep_obj.outputs["Y"], mr_sy.inputs["Value"])

        mr_sx = nt.nodes.new("ShaderNodeMapRange")
        mr_sx.clamp = True
        mr_sx.inputs["From Min"].default_value = 60.0
        mr_sx.inputs["From Max"].default_value = 10.0
        mr_sx.inputs["To Min"].default_value = 0.15
        mr_sx.inputs["To Max"].default_value = 1.0
        nt.links.new(sep_obj.outputs["X"], mr_sx.inputs["Value"])

        mul_so = nt.nodes.new("ShaderNodeMath")
        mul_so.operation = "MULTIPLY"
        mul_so.use_clamp = True
        nt.links.new(mr_sy.outputs["Result"], mul_so.inputs[0])
        nt.links.new(mr_sx.outputs["Result"], mul_so.inputs[1])

        mix_sc = nt.nodes.new("ShaderNodeMix")
        mix_sc.data_type = "RGBA"
        mix_sc.inputs[7].default_value = srgb_to_lin(0.050, 0.048, 0.046)
        nt.links.new(mul_so.outputs["Value"], mix_sc.inputs[0])
        nt.links.new(col_sock, mix_sc.inputs[6])
        col_sock = mix_sc.outputs[2]

        mix_sr = nt.nodes.new("ShaderNodeMix")
        mix_sr.data_type = "FLOAT"
        mix_sr.inputs[3].default_value = 0.92
        nt.links.new(mul_so.outputs["Value"], mix_sr.inputs[0])
        nt.links.new(rgh_sock, mix_sr.inputs[2])
        rgh_sock = mix_sr.outputs[0]

        mix_sm = nt.nodes.new("ShaderNodeMix")
        mix_sm.data_type = "FLOAT"
        mix_sm.inputs[3].default_value = 0.18
        nt.links.new(mul_so.outputs["Value"], mix_sm.inputs[0])
        nt.links.new(met_sock, mix_sm.inputs[2])
        met_sock = mix_sm.outputs[0]

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if edge_wear > 0.001:
        dot_bev = nt.nodes.new("ShaderNodeVectorMath")
        dot_bev.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], dot_bev.inputs[0])
        nt.links.new(geom.outputs["True Normal"], dot_bev.inputs[1])

        sub_curv = nt.nodes.new("ShaderNodeMath")
        sub_curv.operation = "SUBTRACT"
        sub_curv.inputs[0].default_value = 1.0
        nt.links.new(dot_bev.outputs["Value"], sub_curv.inputs[1])

        mr_edge = nt.nodes.new("ShaderNodeMapRange")
        mr_edge.clamp = True
        mr_edge.inputs["From Min"].default_value = 0.010
        mr_edge.inputs["From Max"].default_value = 0.13
        mr_edge.inputs["To Min"].default_value = 0.0
        mr_edge.inputs["To Max"].default_value = min(1.0, edge_wear * 1.25)
        nt.links.new(sub_curv.outputs["Value"], mr_edge.inputs["Value"])

        mul_w = nt.nodes.new("ShaderNodeMath")
        mul_w.operation = "MULTIPLY"
        mul_w.use_clamp = True
        nt.links.new(mr_edge.outputs["Result"], mul_w.inputs[0])
        nt.links.new(n_macro.outputs["Fac"], mul_w.inputs[1])

        mix_ec = nt.nodes.new("ShaderNodeMix")
        mix_ec.data_type = "RGBA"
        mix_ec.inputs[7].default_value = srgb_to_lin(*edge_srgb)
        nt.links.new(mul_w.outputs["Value"], mix_ec.inputs[0])
        nt.links.new(col_sock, mix_ec.inputs[6])
        col_sock = mix_ec.outputs[2]

        mix_er = nt.nodes.new("ShaderNodeMix")
        mix_er.data_type = "FLOAT"
        mix_er.inputs[3].default_value = edge_roughness if edge_roughness is not None else max(0.16, roughness - 0.18)
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

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.55
        nt.links.new(bump_h_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_exhaust_heat_oxide_mat() -> bpy.types.Material:
    """
    Heat-oxidized bronze -> temper-blue/violet -> charred diesel carbon soot exhaust manifold shader
    calibrated to `ztz99a_rear_deck` left exhaust grille (`bx in [-8, +60], by in [+89, +115]`).
    """
    mat = bpy.data.materials.new("H_ExhaustHeatOxide")
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Compute heat intensity peaking at the exhaust vent core (bx ≈ +26, by ≈ +106)
    sub_x = nt.nodes.new("ShaderNodeMath")
    sub_x.operation = "SUBTRACT"
    sub_x.inputs[1].default_value = 26.0
    nt.links.new(sep.outputs["X"], sub_x.inputs[0])

    abs_x = nt.nodes.new("ShaderNodeMath")
    abs_x.operation = "ABSOLUTE"
    nt.links.new(sub_x.outputs["Value"], abs_x.inputs[0])

    mr_heat = nt.nodes.new("ShaderNodeMapRange")
    mr_heat.clamp = True
    mr_heat.inputs["From Min"].default_value = 34.0
    mr_heat.inputs["From Max"].default_value = 4.0
    mr_heat.inputs["To Min"].default_value = 0.0
    mr_heat.inputs["To Max"].default_value = 1.0
    nt.links.new(abs_x.outputs["Value"], mr_heat.inputs["Value"])

    n_ox = nt.nodes.new("ShaderNodeTexNoise")
    n_ox.inputs["Scale"].default_value = 0.16
    n_ox.inputs["Detail"].default_value = 8.0
    n_ox.inputs["Roughness"].default_value = 0.70
    nt.links.new(tc.outputs["Object"], n_ox.inputs["Vector"])

    mix_f = nt.nodes.new("ShaderNodeMix")
    mix_f.data_type = "FLOAT"
    mix_f.inputs["Factor"].default_value = 0.28
    nt.links.new(mr_heat.outputs["Result"], mix_f.inputs[2])
    nt.links.new(n_ox.outputs["Fac"], mix_f.inputs[3])

    # Color ramp: bronze-rust outer -> heat-straw -> steel temper-blue/violet -> charred black exhaust core
    rc = nt.nodes.new("ShaderNodeValToRGB")
    cr = rc.color_ramp
    cr.elements[0].position = 0.08
    cr.elements[0].color = srgb_to_lin(0.45, 0.27, 0.14)
    cr.elements[1].position = 0.42
    cr.elements[1].color = srgb_to_lin(0.32, 0.20, 0.13)
    e_bl = cr.elements.new(0.62)
    e_bl.color = srgb_to_lin(0.14, 0.17, 0.28)
    e_so = cr.elements.new(0.82)
    e_so.color = srgb_to_lin(0.055, 0.052, 0.050)
    nt.links.new(mix_f.outputs[0], rc.inputs["Fac"])

    rr = nt.nodes.new("ShaderNodeValToRGB")
    rr.color_ramp.elements[0].position = 0.15
    rr.color_ramp.elements[0].color = (0.56, 0.56, 0.56, 1.0)
    rr.color_ramp.elements[1].position = 0.62
    rr.color_ramp.elements[1].color = (0.36, 0.36, 0.36, 1.0)
    e_rs = rr.color_ramp.elements.new(0.84)
    e_rs.color = (0.88, 0.88, 0.88, 1.0)
    nt.links.new(mix_f.outputs[0], rr.inputs["Fac"])

    rm = nt.nodes.new("ShaderNodeValToRGB")
    rm.color_ramp.elements[0].position = 0.15
    rm.color_ramp.elements[0].color = (0.74, 0.74, 0.74, 1.0)
    rm.color_ramp.elements[1].position = 0.62
    rm.color_ramp.elements[1].color = (0.86, 0.86, 0.86, 1.0)
    e_ms = rm.color_ramp.elements.new(0.84)
    e_ms.color = (0.16, 0.16, 0.16, 1.0)
    nt.links.new(mix_f.outputs[0], rm.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(rm.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.75
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.32
    bump.inputs["Distance"].default_value = 0.50
    nt.links.new(n_ox.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_main_gun_crown_mat() -> bpy.types.Material:
    """Satin ordnance steel 125mm muzzle crown with subtle propellant soot right at tip (local X in [605, 625])."""
    mat = bpy.data.materials.new("T_GunMuzzleSteel")
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
    mr.inputs["From Min"].default_value = 602.0
    mr.inputs["From Max"].default_value = 625.0
    nt.links.new(sep.outputs["X"], mr.inputs["Value"])

    rc = nt.nodes.new("ShaderNodeValToRGB")
    rc.color_ramp.elements[0].position = 0.0
    rc.color_ramp.elements[0].color = srgb_to_lin(0.27, 0.28, 0.30)
    rc.color_ramp.elements[1].position = 0.85
    rc.color_ramp.elements[1].color = srgb_to_lin(0.19, 0.19, 0.20)
    el = rc.color_ramp.elements.new(0.98)
    el.color = srgb_to_lin(0.14, 0.14, 0.15)
    nt.links.new(mr.outputs["Result"], rc.inputs["Fac"])

    nt.links.new(rc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.32
    bsdf.inputs["Metallic"].default_value = 0.88

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.30
    nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: Hull Armor, FY-4 Glacis ERA, Side Skirts, Road Wheels, Tracks, Rear Deck & Turret Ring (4K) ---
        "H_DigitalCamo": _build_pla_digital_camo_mat(
            "H_DigitalCamo", pixel_cm=13.5, bevel_r=2.1, edge_wear=0.72,
            dust_floor_z=-42.0, dust_band_h=52.0, dust_strength=0.84, exhaust_soot="hull_left_rear",
        ),
        "H_SkirtCamo": _build_pla_digital_camo_mat(
            "H_SkirtCamo", pixel_cm=13.5, bevel_r=1.6, edge_wear=0.62,
            dust_floor_z=-17.0, dust_band_h=24.0, dust_strength=0.82,
        ),
        "H_HeroSkirtPlate": _build_pla_digital_camo_mat(
            "H_HeroSkirtPlate", pixel_cm=13.5, bevel_r=1.4, edge_wear=0.45,
            dust_floor_z=-24.0, dust_band_h=14.0, dust_strength=0.48,
            olive_srgb=(0.245, 0.305, 0.198), khaki_srgb=(0.345, 0.368, 0.255), dark_srgb=(0.165, 0.205, 0.155),
        ),
        "H_EraCamo": _build_pla_digital_camo_mat(
            "H_EraCamo", pixel_cm=10.5, bevel_r=1.8, edge_wear=0.78,
            dust_floor_z=-16.0, dust_band_h=30.0, dust_strength=0.48,
        ),
        "H_RearDeckCamo": _build_pla_digital_camo_mat(
            "H_RearDeckCamo", pixel_cm=13.5, bevel_r=1.8, edge_wear=0.68,
            dust_floor_z=-38.0, dust_band_h=24.0, dust_strength=0.35,
            oil_seep="rear_deck", exhaust_soot="rear_deck",
        ),
        "H_FuelDrumCamo": _build_pla_digital_camo_mat(
            "H_FuelDrumCamo", pixel_cm=11.0, bevel_r=1.4, edge_wear=0.58,
            dust_floor_z=-29.0, dust_band_h=16.0, dust_strength=0.52,
            oil_seep="fuel_drum",
        ),
        "H_WheelCamo": _build_pla_digital_camo_mat(
            "H_WheelCamo", pixel_cm=11.0, bevel_r=1.4, edge_wear=0.64,
            dust_floor_z=-4.0, dust_band_h=38.0, dust_strength=0.82,
        ),
        "H_WheelDishOily": _build_pla_digital_camo_mat(
            "H_WheelDishOily", pixel_cm=11.0, bevel_r=1.1, edge_wear=0.52,
            dust_floor_z=-18.0, dust_band_h=24.0, dust_strength=0.35,
            oil_seep="wheel_dish",
        ),
        "H_AntiSlip": _build_pbr_mat(
            "H_AntiSlip", base_srgb=(0.165, 0.185, 0.148), roughness=0.93, metallic=0.01,
            bevel_r=0.9, grain_scale=2.4, grain_bump=0.48, rough_var=0.03,
        ),
        "H_SkirtRubber": _build_pbr_mat(
            "H_SkirtRubber", base_srgb=(0.175, 0.182, 0.186), roughness=0.88, metallic=0.0,
            bevel_r=1.1, grain_scale=1.1, grain_bump=0.30,
            dust_floor_z=-16.0, dust_band_h=26.0, dust_strength=0.84,
        ),
        "H_WheelTire": _build_pbr_mat(
            "H_WheelTire", base_srgb=(0.165, 0.170, 0.174), roughness=0.89, metallic=0.0,
            bevel_r=1.2, grain_scale=1.0, grain_bump=0.32,
            dust_floor_z=-2.0, dust_band_h=40.0, dust_strength=0.80,
        ),
        "H_TrackPad": _build_pbr_mat(
            "H_TrackPad", base_srgb=(0.16, 0.165, 0.17), roughness=0.91, metallic=0.0,
            bevel_r=0.55, grain_scale=1.4, grain_bump=0.34,
            dust_floor_z=-28.0, dust_band_h=36.0, dust_strength=0.66,
        ),
        "H_TrackSteel": _build_pbr_mat(
            "H_TrackSteel", base_srgb=(0.24, 0.25, 0.27), roughness=0.48, metallic=0.84,
            bevel_r=0.75, edge_wear=0.90, edge_srgb=(0.76, 0.79, 0.84), edge_roughness=0.26,
            grain_scale=0.95, grain_bump=0.28,
            dust_floor_z=-34.0, dust_band_h=28.0, dust_strength=0.42,
        ),
        "H_TrackBurnished": _build_pbr_mat(
            "H_TrackBurnished", base_srgb=(0.50, 0.53, 0.58), roughness=0.27, metallic=0.93,
            bevel_r=0.55, edge_wear=0.88, edge_srgb=(0.84, 0.87, 0.92), edge_roughness=0.22,
            grain_scale=1.1, grain_bump=0.14, aniso_stretch=(0.35, 2.4, 2.4), rough_var=0.03,
        ),
        "H_OilHubSteel": _build_pbr_mat(
            "H_OilHubSteel", base_srgb=(0.18, 0.20, 0.22), roughness=0.32, metallic=0.82,
            bevel_r=0.9, edge_wear=0.58, edge_srgb=(0.68, 0.72, 0.77), edge_roughness=0.24,
            grain_scale=0.9, grain_bump=0.20, oil_glaze=0.85,
        ),
        "H_DieselWetSteel": _build_pbr_mat(
            "H_DieselWetSteel", base_srgb=(0.16, 0.17, 0.18), roughness=0.27, metallic=0.80,
            bevel_r=0.65, edge_wear=0.55, edge_srgb=(0.66, 0.69, 0.74), edge_roughness=0.21,
            grain_scale=1.1, grain_bump=0.18, oil_glaze=0.80,
        ),
        "H_RearDeckLouvers": _build_pbr_mat(
            "H_RearDeckLouvers", base_srgb=(0.20, 0.22, 0.23), roughness=0.40, metallic=0.82,
            bevel_r=0.75, edge_wear=0.62, grain_scale=0.9, grain_bump=0.22,
            oil_glaze=0.42, soot_left_deck=True,
        ),
        "H_OrdnanceSteel": _build_pbr_mat(
            "H_OrdnanceSteel", base_srgb=(0.22, 0.24, 0.26), roughness=0.42, metallic=0.84,
            bevel_r=1.1, edge_wear=0.66, grain_scale=0.85, grain_bump=0.22,
        ),
        "H_TowCableSteel": _build_pbr_mat(
            "H_TowCableSteel", base_srgb=(0.30, 0.31, 0.33), roughness=0.38, metallic=0.88,
            bevel_r=0.45, edge_wear=0.60, edge_srgb=(0.74, 0.77, 0.82), edge_roughness=0.26,
            grain_scale=2.2, grain_bump=0.38, aniso_stretch=(0.35, 3.2, 3.2),
        ),
        "H_TurretRingSteel": _build_pbr_mat(
            "H_TurretRingSteel", base_srgb=(0.68, 0.72, 0.77), roughness=0.22, metallic=0.95,
            bevel_r=0.65, edge_wear=0.30, grain_scale=0.9, grain_bump=0.06, aniso_stretch=(0.3, 3.0, 3.0),
        ),
        "H_ExhaustBronze": _build_exhaust_heat_oxide_mat(),
        "H_LogWood": _build_pbr_mat(
            "H_LogWood", base_srgb=(0.40, 0.28, 0.17), roughness=0.86, metallic=0.0,
            bevel_r=0.9, grain_scale=0.9, grain_bump=0.34, aniso_stretch=(3.5, 0.4, 0.4),
        ),

        # --- SUITE 2: Turret Shell, Arrowhead FY-4 ERA, 125mm ZPT-98 Gun, Cradle, Recoil, Breech, CITV/JD-3 & Roof (4K) ---
        "T_DigitalCamo": _build_pla_digital_camo_mat(
            "T_DigitalCamo", pixel_cm=13.0, bevel_r=2.1, edge_wear=0.74,
            dust_floor_z=-42.0, dust_band_h=34.0, dust_strength=0.38,
        ),
        "T_HeroTurretPlate": _build_pla_digital_camo_mat(
            "T_HeroTurretPlate", pixel_cm=13.0, bevel_r=1.3, edge_wear=0.38,
            dust_floor_z=-48.0, dust_band_h=24.0, dust_strength=0.22,
            olive_srgb=(0.240, 0.298, 0.195), khaki_srgb=(0.335, 0.358, 0.248), dark_srgb=(0.165, 0.200, 0.150),
        ),
        "T_EraWedgeCamo": _build_pla_digital_camo_mat(
            "T_EraWedgeCamo", pixel_cm=10.5, bevel_r=1.9, edge_wear=0.80,
            dust_floor_z=-48.0, dust_band_h=30.0, dust_strength=0.34,
        ),
        "T_GunShroudCamo": _build_pla_digital_camo_mat(
            "T_GunShroudCamo", pixel_cm=11.5, bevel_r=1.2, edge_wear=0.54,
            dust_floor_z=-48.0, dust_band_h=24.0, dust_strength=0.20,
        ),
        "T_AntiSlip": _build_pbr_mat(
            "T_AntiSlip", base_srgb=(0.165, 0.185, 0.148), roughness=0.93, metallic=0.01,
            bevel_r=0.9, grain_scale=2.4, grain_bump=0.46, rough_var=0.03,
        ),
        "T_CanvasTarp": _build_pbr_mat(
            "T_CanvasTarp", base_srgb=(0.31, 0.32, 0.22), roughness=0.92, metallic=0.0,
            bevel_r=0.6, grain_scale=2.8, grain_bump=0.42, aniso_stretch=(1.6, 1.6, 0.7), rough_var=0.035,
        ),
        "T_CrateOlive": _build_pbr_mat(
            "T_CrateOlive", base_srgb=(0.20, 0.25, 0.17), roughness=0.68, metallic=0.18,
            bevel_r=0.9, edge_wear=0.78, edge_srgb=(0.56, 0.59, 0.63), edge_roughness=0.32,
            grain_scale=1.1, grain_bump=0.24,
        ),
        "T_WeldSteel": _build_pbr_mat(
            "T_WeldSteel", base_srgb=(0.26, 0.29, 0.24), roughness=0.52, metallic=0.52,
            bevel_r=0.45, edge_wear=0.60, edge_srgb=(0.60, 0.63, 0.67), edge_roughness=0.30,
            grain_scale=2.0, grain_bump=0.38,
        ),
        "T_AntennaFiber": _build_pbr_mat(
            "T_AntennaFiber", base_srgb=(0.14, 0.15, 0.14), roughness=0.46, metallic=0.32,
            bevel_r=0.25, grain_scale=1.4, grain_bump=0.10,
        ),
        "T_GunMuzzleSteel": _build_main_gun_crown_mat(),
        "T_OrdnanceSteel": _build_pbr_mat(
            "T_OrdnanceSteel", base_srgb=(0.22, 0.24, 0.26), roughness=0.42, metallic=0.85,
            bevel_r=1.1, edge_wear=0.68, grain_scale=0.8, grain_bump=0.22,
        ),
        "T_ChromeRod": _build_pbr_mat(
            "T_ChromeRod", base_srgb=(0.84, 0.87, 0.91), roughness=0.14, metallic=0.97,
            bevel_r=0.45, edge_wear=0.22, grain_scale=1.0, grain_bump=0.03, aniso_stretch=(0.25, 3.6, 3.6),
        ),
        "T_BreechSteel": _build_pbr_mat(
            "T_BreechSteel", base_srgb=(0.64, 0.68, 0.74), roughness=0.24, metallic=0.94,
            bevel_r=0.75, edge_wear=0.40, grain_scale=0.85, grain_bump=0.08, aniso_stretch=(0.4, 2.8, 2.8),
        ),
        "T_BrassAccent": _build_pbr_mat(
            "T_BrassAccent", base_srgb=(0.86, 0.67, 0.25), roughness=0.22, metallic=0.95,
            bevel_r=0.45, grain_scale=0.9, grain_bump=0.04,
        ),
        "T_OpticsEmerald": _build_pbr_mat(
            "T_OpticsEmerald", base_srgb=(0.028, 0.145, 0.115), roughness=0.06, metallic=0.58,
            bevel_r=0.35, grain_scale=1.0, grain_bump=0.004, rough_var=0.01,
        ),
        "T_OpticsRuby": _build_pbr_mat(
            "T_OpticsRuby", base_srgb=(0.185, 0.032, 0.044), roughness=0.06, metallic=0.56,
            bevel_r=0.35, grain_scale=1.0, grain_bump=0.004, rough_var=0.01,
        ),

        # --- SUITE 3: Carousel Autoloader, Hoist, Chain Rammer, Stub Ejector, 150HB V12, CH-1000, Torsion & Crew (2K) ---
        "I_CarouselSteel": _build_pbr_mat(
            "I_CarouselSteel", base_srgb=(0.42, 0.46, 0.52), roughness=0.32, metallic=0.88,
            bevel_r=0.35, edge_wear=0.42, grain_scale=0.7, grain_bump=0.03,
        ),
        "I_MachinedChrome": _build_pbr_mat(
            "I_MachinedChrome", base_srgb=(0.78, 0.82, 0.87), roughness=0.18, metallic=0.96,
            bevel_r=0.22, edge_wear=0.22, grain_scale=0.9, grain_bump=0.018, aniso_stretch=(0.3, 3.2, 3.2),
        ),
        "I_SabotDark": _build_pbr_mat(
            "I_SabotDark", base_srgb=(0.24, 0.26, 0.30), roughness=0.34, metallic=0.84,
            bevel_r=0.22, edge_wear=0.36, grain_scale=0.9, grain_bump=0.025,
        ),
        "I_PropellantAmber": _build_pbr_mat(
            "I_PropellantAmber", base_srgb=(0.74, 0.49, 0.20), roughness=0.44, metallic=0.08,
            bevel_r=0.22, grain_scale=1.1, grain_bump=0.032,
        ),
        "I_BrassStub": _build_pbr_mat(
            "I_BrassStub", base_srgb=(0.88, 0.68, 0.24), roughness=0.18, metallic=0.96,
            bevel_r=0.20, grain_scale=1.0, grain_bump=0.016,
        ),
        "I_EngineBlock": _build_pbr_mat(
            "I_EngineBlock", base_srgb=(0.44, 0.48, 0.54), roughness=0.38, metallic=0.82,
            bevel_r=0.40, edge_wear=0.38, grain_scale=1.0, grain_bump=0.048,
        ),
        "I_TurboSilver": _build_pbr_mat(
            "I_TurboSilver", base_srgb=(0.80, 0.83, 0.88), roughness=0.20, metallic=0.95,
            bevel_r=0.28, grain_scale=0.9, grain_bump=0.022,
        ),
        "I_EngineDataPlate": _build_pbr_mat(
            "I_EngineDataPlate", base_srgb=(0.76, 0.79, 0.83), roughness=0.24, metallic=0.92,
            bevel_r=0.18, grain_scale=0.9, grain_bump=0.015,
        ),
        "I_ExhaustBronze": _build_pbr_mat(
            "I_ExhaustBronze", base_srgb=(0.56, 0.36, 0.21), roughness=0.44, metallic=0.82,
            bevel_r=0.28, grain_scale=1.0, grain_bump=0.045,
        ),
        "I_RadiatorCopper": _build_pbr_mat(
            "I_RadiatorCopper", base_srgb=(0.74, 0.44, 0.25), roughness=0.30, metallic=0.90,
            bevel_r=0.25, grain_scale=1.6, grain_bump=0.055, aniso_stretch=(4.5, 0.6, 0.6),
        ),
        "I_SafetyYellow": _build_pbr_mat(
            "I_SafetyYellow", base_srgb=(0.94, 0.76, 0.10), roughness=0.30, metallic=0.05,
            bevel_r=0.20, grain_scale=1.0, grain_bump=0.015,
        ),
        "I_FilterRed": _build_pbr_mat(
            "I_FilterRed", base_srgb=(0.82, 0.14, 0.12), roughness=0.30, metallic=0.10,
            bevel_r=0.20, grain_scale=1.0, grain_bump=0.015,
        ),
        "I_TorsionSteel": _build_pbr_mat(
            "I_TorsionSteel", base_srgb=(0.50, 0.55, 0.62), roughness=0.28, metallic=0.92,
            bevel_r=0.22, edge_wear=0.32, grain_scale=0.8, grain_bump=0.022,
        ),
        "I_CrewSeat": _build_pbr_mat(
            "I_CrewSeat", base_srgb=(0.24, 0.26, 0.29), roughness=0.80, metallic=0.0,
            bevel_r=0.45, grain_scale=1.8, grain_bump=0.055,
        ),
        "I_MfdCyan": _build_pbr_mat(
            "I_MfdCyan", base_srgb=(0.12, 0.84, 0.64), roughness=0.14, metallic=0.06,
            bevel_r=0.12, grain_scale=1.0, grain_bump=0.005, rough_var=0.015,
        ),
        "I_HatchCamo": _build_pla_digital_camo_mat(
            "I_HatchCamo", pixel_cm=12.0, bevel_r=0.40, edge_wear=0.35, dust_strength=0.0,
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
        b = min(bevel, sx * 0.22, sy * 0.22, sz * 0.22)
        bmesh.ops.bevel(
            bm, geom=list(bm.edges), offset=b, segments=bevel_segs,
            profile=0.5, affect="EDGES", clamp_overlap=True,
        )
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_cyl(
    name: str, r_top: float, r_bot: float, length: float,
    axis: str = "x", segs: int = 48,
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
        b = min(bevel, length * 0.22, min(r_top, r_bot) * 0.25)
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


def mk_hollow_tube(
    name: str, r_out: float, r_in: float, a0: float, a1: float,
    axis: str = "x", segs: int = 56, bevel: float = 0.0,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Strictly manifold watertight hollow cylinder along +X or +Y from a0 to a1."""
    bm = bmesh.new()
    b = min(bevel, (r_out - r_in) * 0.32, (a1 - a0) * 0.22)
    if b > 1e-4:
        prof = [
            (r_out - b, a0), (r_out, a0 + b), (r_out, a1 - b), (r_out - b, a1),
            (r_in + b, a1), (r_in, a1 - b), (r_in, a0 + b), (r_in + b, a0),
        ]
    else:
        prof = [(r_out, a0), (r_out, a1), (r_in, a1), (r_in, a0)]

    rings = []
    for r, a in prof:
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            if axis == "x":
                ring.append(bm.verts.new((a, r * math.cos(th), r * math.sin(th))))
            elif axis == "y":
                ring.append(bm.verts.new((r * math.cos(th), a, r * math.sin(th))))
            else:
                ring.append(bm.verts.new((r * math.cos(th), r * math.sin(th), a)))
        rings.append(ring)

    n = len(rings)
    for k in range(n):
        ra = rings[k]
        rb = rings[(k + 1) % n]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((ra[s], ra[sn], rb[sn], rb[s]))

    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_swept_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radii: float | list[float],
    segs: int = 12,
    closed: bool = False,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Strictly manifold watertight curved/tapered tube swept along Three.js polyline via Bishop frames."""
    pts = [Vector(p) for p in points]
    if isinstance(radii, (int, float)):
        r_list = [float(radii)] * len(pts)
    else:
        r_list = [float(r) for r in radii]
    assert len(pts) >= 2 and len(pts) == len(r_list)

    n_pts = len(pts)
    tangents: list[Vector] = []
    for i in range(n_pts):
        if closed:
            d = pts[(i + 1) % n_pts] - pts[(i - 1) % n_pts]
        elif i == 0:
            d = pts[1] - pts[0]
        elif i == n_pts - 1:
            d = pts[-1] - pts[-2]
        else:
            d = pts[i + 1] - pts[i - 1]
        if d.length < 1e-6:
            d = Vector((1.0, 0.0, 0.0))
        tangents.append(d.normalized())

    # Initial orthonormal frame
    t0 = tangents[0]
    ref = Vector((0.0, 1.0, 0.0)) if abs(t0.y) < 0.88 else Vector((1.0, 0.0, 0.0))
    u_vec = t0.cross(ref).normalized()
    v_vec = t0.cross(u_vec).normalized()

    frames = [(u_vec.copy(), v_vec.copy())]
    for i in range(1, n_pts):
        t_prev = tangents[i - 1]
        t_cur = tangents[i]
        axis = t_prev.cross(t_cur)
        sin_a = axis.length
        cos_a = max(-1.0, min(1.0, t_prev.dot(t_cur)))
        if sin_a > 1e-6:
            ang = math.atan2(sin_a, cos_a)
            rot = Matrix.Rotation(ang, 3, axis.normalized())
            u_vec = (rot @ u_vec).normalized()
        u_vec = (u_vec - t_cur * u_vec.dot(t_cur)).normalized()
        v_vec = t_cur.cross(u_vec).normalized()
        frames.append((u_vec.copy(), v_vec.copy()))

    bm = bmesh.new()
    rings = []
    for i in range(n_pts):
        p = pts[i]
        r = r_list[i]
        u_v, v_v = frames[i]
        ring = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            pos = p + (u_v * math.cos(th) + v_v * math.sin(th)) * r
            ring.append(bm.verts.new(pos))
        rings.append(ring)

    n_rings = len(rings)
    loop_count = n_rings if closed else (n_rings - 1)
    for k in range(loop_count):
        ra = rings[k]
        rb = rings[(k + 1) % n_rings]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((ra[s], ra[sn], rb[sn], rb[s]))

    if not closed:
        # Chamfered manifold end-caps
        for end_idx, sign in ((0, -1.0), (n_pts - 1, 1.0)):
            p_end = pts[end_idx] + tangents[end_idx] * (sign * r_list[end_idx] * 0.35)
            u_v, v_v = frames[end_idx]
            r_cap = r_list[end_idx] * 0.45
            cap_ring = [
                bm.verts.new(p_end + (u_v * math.cos(2.0 * math.pi * s / segs) + v_v * math.sin(2.0 * math.pi * s / segs)) * r_cap)
                for s in range(segs)
            ]
            base_ring = rings[end_idx]
            for s in range(segs):
                sn = (s + 1) % segs
                if sign < 0:
                    bm.faces.new((cap_ring[s], cap_ring[sn], base_ring[sn], base_ring[s]))
                else:
                    bm.faces.new((base_ring[s], base_ring[sn], cap_ring[sn], cap_ring[s]))
            if sign < 0:
                bm.faces.new(tuple(reversed(cap_ring)))
            else:
                bm.faces.new(tuple(cap_ring))

    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def mk_weld_bead(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    radius: float = 1.25,
    ripples: int = 16,
    segs: int = 10,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Sculpted rippled submerged-arc armor weld bead rod between Three.js points p0 and p1."""
    v0, v1 = Vector(p0), Vector(p1)
    n_pts = max(4, ripples * 2 + 1)
    pts = []
    rads = []
    for i in range(n_pts):
        u = i / (n_pts - 1)
        p = v0.lerp(v1, u)
        pts.append((p.x, p.y, p.z))
        # Subtle periodic weld-puddle ripple
        r_mod = 1.0 + 0.14 * (1.0 if (i % 2 == 1) else -1.0)
        if i == 0 or i == n_pts - 1:
            r_mod = 0.78
        rads.append(radius * r_mod)
    return mk_swept_tube(name, pts, rads, segs=segs, closed=False, mat=mat)


def mk_oval_eye(
    name: str,
    center: tuple[float, float, float],
    rx: float,
    ry: float,
    tube_r: float,
    plane: str = "xz",
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight closed forged oval tow-cable eye thimble."""
    n = 16
    pts = []
    for i in range(n):
        th = 2.0 * math.pi * i / n
        a = rx * math.cos(th)
        b = ry * math.sin(th)
        if plane == "xz":
            pts.append((center[0] + a, center[1], center[2] + b))
        elif plane == "xy":
            pts.append((center[0] + a, center[1] + b, center[2]))
        else:
            pts.append((center[0], center[1] + a, center[2] + b))
    obj = mk_swept_tube(name, pts, tube_r, segs=10, closed=True, mat=mat)
    if xform:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # Object already transformed by T2B_MAT; apply additional transform in Blender space if needed
        m = Matrix.Identity(4)
        for op in xform:
            k = op[0]
            if k == "t":
                m = Matrix.Translation(t2b(op[1], op[2], op[3])) @ m
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        bm.to_mesh(obj.data)
        bm.free()
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
# SUITE 1 BUILDERS — `ztz99a_v3_armor_hull` (8 Solid GLB Parts — 4K + Plan C)
# =============================================================================
def build_ztz99a_hull_armor(mats) -> bpy.types.Object:
    """TRUE HOLLOW WELDED COMPOSITE ARMOR HULL (~14–16 cm wall thickness) w/ tow cables, pioneer tools & stowage details!"""
    parts = []
    camo = mats["H_DigitalCamo"]
    steel = mats["H_OrdnanceSteel"]
    cable_m = mats["H_TowCableSteel"]
    wood = mats["H_LogWood"]

    # Bottom armored belly floor (Y in [-74, -60], X in [-354, +314], Z in [-112, +112])
    parts.append(mk_box("ha_belly", 668, 14, 224, [("t", -20, -67, 0)], camo, bevel=1.0))

    # Left & Right vertical armored hull sidewalls (inset 0.15 cm from belly/roof planes -> zero T-junctions!)
    for s in (-1, 1):
        parts.append(mk_box(f"ha_wall_{s}", 620, 67.6, 13.8, [("t", -44, -26.0, s * 105.0)], camo, bevel=0.9))
        # Raised rear engine-bay side armor cowling (ZTZ-99A raised rear profile!)
        parts.append(mk_box(f"ha_rearwall_{s}", 215.4, 9.8, 13.6, [("t", -246, 9.2, s * 105.0)], camo, bevel=0.8))
        # Forward tapered nose cheek plates
        parts.append(mk_box(f"ha_cheek_{s}", 82, 46, 13.4, [("rz", -0.34), ("t", 306, -38, s * 104.8)], camo, bevel=0.9))

    # 68° sloped upper front composite glacis plate (16 cm armor thickness)
    parts.append(mk_box("ha_uglacis", 166, 16, 223.4, [("rz", -0.265), ("t", 298, -14, 0)], camo, bevel=1.2))
    # Lower sloped glacis plate joining nose beak (X=+378) cleanly to belly (Y=-74)
    parts.append(mk_box("ha_lglacis", 72, 14, 223.2, [("rz", 0.54), ("t", 343, -49.5, 0)], camo, bevel=1.1))
    # Rear vertical armored transom plate (X in [-354, -340])
    parts.append(mk_box("ha_transom", 14, 87.6, 223.6, [("t", -347, -30, 0)], camo, bevel=1.0))
    # Internal engine-bay armored firewall bulkhead separating fighting compartment & 150HB V12
    parts.append(mk_box("ha_firewall", 8, 65.4, 195.4, [("t", -140, -27, 0)], steel, bevel=0.5))

    # Upper hull roof deck WITH TRUE CIRCULAR TURRET RING OPENING (R=100 cm at X=+22)
    roof = mk_box("ha_roof", 363.4, 13.8, 223.0, [("t", 44, 1.0, 0)], camo, bevel=0.8)
    turret_cut = mk_cyl("ha_tcut", 100.0, 100.0, 34.0, axis="y", segs=56, xform=[("t", 22.0, 1.0, 0.0)], mat=camo)
    bool_op(roof, turret_cut, "DIFFERENCE")
    parts.append(roof)

    # Center-front driver's armored hatch, weld bead frame, anti-slip walkways & triple forward vision periscopes
    parts.append(mk_box("ha_drv_hatch", 46, 5.5, 52, [("t", 206, 10.7, 0)], camo, bevel=0.8))
    parts.append(mk_cyl("ha_drv_hinge", 2.2, 2.2, 22, axis="z", segs=16, xform=[("t", 184, 12.6, 0)], mat=steel, bevel=0.3))
    for pz in (-15.0, 0.0, 15.0):
        parts.append(mk_box(f"ha_peri_{pz}", 12, 7, 10, [("t", 232, 10.7, pz)], steel, bevel=0.4))
    # Heavy rippled submerged-arc hull glacis brow weld seam + coarse silica anti-slip walkway pads
    parts.append(mk_weld_bead("ha_glac_weld", (224.0, 8.6, -108.0), (224.0, 8.6, 108.0), radius=1.5, ripples=22, segs=10, mat=steel))
    for s in (-1, 1):
        parts.append(mk_box(f"ha_grip_f_{s}", 92, 1.4, 54, [("t", 182, 8.3, s * 74)], mats["H_AntiSlip"], bevel=0.3))
        parts.append(mk_box(f"ha_grip_m_{s}", 118, 1.4, 38, [("t", 214, 6.4, s * 141)], mats["H_AntiSlip"], bevel=0.3))

    # Cantilevered upper track fenders, mudguards, headlight cages, stowage bins & heavy tow shackles
    for s in (-1, 1):
        parts.append(mk_box(f"ha_fend_{s}", 696, 11.8, 57.6, [("t", 2, 0.1, s * 141.2)], camo, bevel=0.9))
        parts.append(mk_box(f"ha_mud_{s}", 36, 10, 55.6, [("rz", -0.55), ("t", 358, -10, s * 141.2)], camo, bevel=0.8))
        # Armored headlight guard cage + circular lamp housing
        parts.append(mk_box(f"ha_hlbox_{s}", 22, 14, 20, [("t", 324, 12.2, s * 138)], steel, bevel=0.5))
        parts.append(mk_cyl(f"ha_lamp_{s}", 5.2, 5.2, 6, axis="x", segs=24, xform=[("t", 335.2, 12.2, s * 138)], mat=mats["H_TurretRingSteel"], bevel=0.3))
        # Fender tool & external fuel stowage boxes + lid rims, hinge knuckles & latch clasps
        parts.append(mk_box(f"ha_binr_{s}", 190, 16, 44, [("t", -220, 12.2, s * 140)], camo, bevel=0.9))
        parts.append(mk_box(f"ha_binm_{s}", 140, 14, 42, [("t", 48, 11.2, s * 140)], camo, bevel=0.9))
        for lx in (-278.0, -220.0, -162.0):
            parts.append(mk_box(f"ha_br_lat_{s}_{lx}", 4.5, 7.0, 2.2, [("t", lx, 15.2, s * 162.4)], steel, bevel=0.25))
            parts.append(mk_cyl(f"ha_br_hng_{s}_{lx}", 1.3, 1.3, 8.0, axis="x", segs=10, xform=[("t", lx, 19.6, s * 118.4)], mat=steel, bevel=0.2))
        for lx in (8.0, 48.0, 88.0):
            parts.append(mk_box(f"ha_bm_lat_{s}_{lx}", 4.5, 6.5, 2.2, [("t", lx, 13.8, s * 161.4)], steel, bevel=0.25))
            parts.append(mk_cyl(f"ha_bm_hng_{s}_{lx}", 1.3, 1.3, 8.0, axis="x", segs=10, xform=[("t", lx, 17.6, s * 119.4)], mat=steel, bevel=0.2))
        # Front & rear forged towing shackles
        parts.append(mk_box(f"ha_towf_{s}", 18, 12, 14, [("t", 370, -40, s * 78)], steel, bevel=0.8))
        parts.append(mk_box(f"ha_towr_{s}", 16, 12, 14, [("t", -354.2, -46, s * 74)], steel, bevel=0.8))

        # --- PLAN C: Fender-Stowed Braided Steel Tow Cable w/ Forged Tow Eyes (strictly inboard of skirts!) ---
        # Front & rear forged oval tow eyes resting flush on front fender deck (X in [124, 304], Z in [±130, ±156])
        parts.append(mk_oval_eye(f"ha_fteye1_{s}", (296.0, 8.2, s * 134.0), 7.2, 4.6, 1.45, plane="xz", mat=steel))
        parts.append(mk_oval_eye(f"ha_fteye2_{s}", (130.0, 8.2, s * 134.0), 7.2, 4.6, 1.45, plane="xz", mat=steel))
        # Pressed steel wire-rope ferrules clamping cable into both eyes
        parts.append(mk_cyl(f"ha_ftfer1_{s}", 2.4, 2.4, 7.0, axis="x", segs=14, xform=[("t", 285.5, 8.2, s * 136.5)], mat=steel, bevel=0.3))
        parts.append(mk_cyl(f"ha_ftfer2_{s}", 2.4, 2.4, 7.0, axis="x", segs=14, xform=[("t", 140.5, 8.2, s * 136.5)], mat=steel, bevel=0.3))
        # Swept braided steel cable draped neatly along front fender (max |Z|=156.5 < 167 skirt inner face!)
        fend_cable_pts = [
            (283.0, 8.1, s * 137.0),
            (268.0, 8.0, s * 147.0),
            (242.0, 7.9, s * 154.0),
            (212.0, 7.9, s * 155.0),
            (182.0, 7.9, s * 154.0),
            (156.0, 8.0, s * 147.0),
            (143.0, 8.1, s * 137.0),
        ]
        parts.append(mk_swept_tube(f"ha_fcab_{s}", fend_cable_pts, 1.75, segs=10, closed=False, mat=cable_m))
        for cx in (242.0, 182.0):
            parts.append(mk_box(f"ha_fcclp_{s}_{cx}", 6.5, 4.6, 5.4, [("t", cx, 8.1, s * 154.2)], steel, bevel=0.3))

    # --- PLAN C: Rear Transom Draped Heavy Braided Steel Recovery Cable + Forged Tow Eyes ---
    for s in (-1, 1):
        parts.append(mk_oval_eye(f"ha_rteye_{s}", (-358.2, -46.0, s * 74.0), 4.8, 6.8, 1.65, plane="yz", mat=steel))
        parts.append(mk_cyl(f"ha_rtfer_{s}", 2.7, 2.7, 7.5, axis="z", segs=14, xform=[("t", -358.5, -46.5, s * 64.0)], mat=steel, bevel=0.35))
    rear_cable_pts = []
    for k in range(13):
        u = k / 12.0
        zc = -61.0 + u * 122.0
        sag = 9.5 * (4.0 * u * (1.0 - u))
        xc = -358.6 - 1.4 * math.sin(u * math.pi)
        rear_cable_pts.append((xc, -46.8 - sag, zc))
    parts.append(mk_swept_tube("ha_rcable", rear_cable_pts, 2.05, segs=12, closed=False, mat=cable_m))

    # --- PLAN C: Pioneer Entrenching Shovel Strapped on Right Mid-Fender Stowage Bin (`ha_binm_+1`, top Y=+18.2) ---
    parts.append(mk_cyl("ha_shv_hnd", 1.55, 1.55, 76.0, axis="x", segs=14, xform=[("t", 16.0, 20.6, 134.0)], mat=wood, bevel=0.25))
    # Forged D-grip handle yoke at rear of shovel
    parts.append(mk_box("ha_shv_d1", 9.5, 2.2, 9.0, [("t", -24.5, 20.6, 134.0)], steel, bevel=0.35))
    parts.append(mk_cyl("ha_shv_col", 2.05, 1.85, 11.0, axis="x", segs=14, xform=[("t", 57.5, 20.5, 134.0)], mat=steel, bevel=0.25))
    # Contoured pointed stamped-steel spade blade
    parts.append(mk_box("ha_shv_bld1", 20.0, 2.0, 17.5, [("t", 72.0, 19.6, 134.0)], steel, bevel=0.45))
    parts.append(mk_box("ha_shv_bld2", 11.0, 1.8, 12.0, [("ry", 0.785), ("t", 83.5, 19.5, 134.0)], steel, bevel=0.35))
    for sx in (0.0, 44.0):
        parts.append(mk_box(f"ha_shv_str_{sx}", 4.2, 4.6, 5.2, [("t", sx, 20.2, 134.0)], steel, bevel=0.25))

    # --- PLAN C: Forged Track-Tensioning Crowbar & Heavy Sledgehammer on Left Mid-Fender Bin (`ha_binm_-1`, top Y=+18.2) ---
    parts.append(mk_cyl("ha_crow_bar", 1.35, 1.35, 96.0, axis="x", segs=6, xform=[("t", 46.0, 20.0, -131.0)], mat=steel, bevel=0.2))
    parts.append(mk_box("ha_crow_tip", 10.0, 1.4, 3.8, [("t", 97.5, 19.6, -131.0)], steel, bevel=0.25))
    parts.append(mk_box("ha_crow_hook", 8.5, 3.6, 3.2, [("rz", 0.42), ("t", -4.5, 21.0, -131.0)], steel, bevel=0.3))
    parts.append(mk_cyl("ha_ham_hnd", 1.55, 1.55, 68.0, axis="x", segs=14, xform=[("t", 30.0, 20.4, -148.0)], mat=wood, bevel=0.25))
    parts.append(mk_box("ha_ham_head", 10.5, 9.2, 15.5, [("t", 68.0, 22.8, -148.0)], steel, bevel=0.9))
    for sx in (14.0, 56.0):
        parts.append(mk_box(f"ha_tool_str_{sx}", 4.2, 4.4, 24.0, [("t", sx, 20.0, -139.5)], steel, bevel=0.25))

    return join_parts("ztz99a_hull_armor", parts)


def build_ztz99a_glacis_era(mats) -> bpy.types.Object:
    parts = []
    era = mats["H_EraCamo"]
    steel = mats["H_OrdnanceSteel"]
    slope = -0.265

    # 2 rows x 6 cols of heavy bolted FY-4 dual-purpose composite ERA bricks with corner mounting studs
    for row in range(2):
        lu = -24.0 if row == 0 else 24.0
        for col in range(6):
            cz = -85.0 + col * 34.0
            parts.append(mk_box(
                f"ge_b_{row}_{col}", 42, 10.5, 31,
                [("t", lu, 13.5, cz), ("rz", slope)], era, bevel=1.1,
            ))
            # Top recessed tie-down bolt bosses on every ERA brick
            for bx in (-14.0, 14.0):
                for bz in (-10.0, 10.0):
                    parts.append(mk_cyl(
                        f"ge_bt_{row}_{col}_{bx}_{bz}", 1.3, 1.3, 2.2, axis="y", segs=6,
                        xform=[("t", lu + bx, 19.2, cz + bz), ("rz", slope)], mat=steel, bevel=0.2,
                    ))

    # Forward V-shaped ballistic splash wave-breaker bar across glacis toe
    for s in (-1, 1):
        parts.append(mk_box(
            f"ge_wave_{s}", 10, 9, 102,
            [("ry", s * 0.14), ("t", 58, -16, s * 51)], era, bevel=0.7,
        ))
    # Driver-slot center armored ERA riser plates
    parts.append(mk_box("ge_drv_era", 26, 9, 64, [("t", -50, 17, 0)], era, bevel=0.8))

    return join_parts("ztz99a_glacis_era", parts)


def build_ztz99a_side_skirts(mats) -> bpy.types.Object:
    parts = []
    panel_xs = (290.0, 178.0, 66.0, -46.0, -158.0, -270.0)
    skirt_camo = mats["H_SkirtCamo"]
    hero_plate = mats["H_HeroSkirtPlate"]
    rubber = mats["H_SkirtRubber"]
    steel = mats["H_OrdnanceSteel"]

    for s in (-1, 1):
        for i, px in enumerate(panel_xs):
            is_hero_front = (i == 0)
            is_heavy = (i < 2)
            thick_z = 8.0 if is_heavy else 4.2
            mat_p = hero_plate if is_hero_front else (skirt_camo if is_heavy else rubber)
            parts.append(mk_box(f"sk_p_{s}_{i}", 106, 62, thick_z, [("t", px, 2, s * 171)], mat_p, bevel=0.7))
            # Top armored hinge clamp + retaining bolts
            parts.append(mk_box(f"sk_h_{s}_{i}", 98, 7, 5.5, [("t", px, 31, s * 169)], steel, bevel=0.4))
            if not is_hero_front:
                for bx in (-34.0, 0.0, 34.0):
                    parts.append(mk_cyl(
                        f"sk_b_{s}_{i}_{bx}", 1.5, 1.5, 2.0, axis="z", segs=6,
                        xform=[("t", px + bx, 20, s * (171 + thick_z * 0.5 + 0.5))], mat=steel, bevel=0.2,
                    ))
                if not is_heavy:
                    # Stamped vertical stiffener ribs & lower clamp strips on ballistic rubber skirts
                    for rx in (-34.0, 0.0, 34.0):
                        parts.append(mk_box(
                            f"sk_rib_{s}_{i}_{rx}", 3.2, 48.0, 1.8,
                            [("t", px + rx, -1.0, s * (171 + thick_z * 0.5 + 0.6))], rubber, bevel=0.3,
                        ))
                    parts.append(mk_box(
                        f"sk_bar_{s}_{i}", 96.0, 4.0, 1.8,
                        [("t", px, -18.0, s * (171 + thick_z * 0.5 + 0.6))], steel, bevel=0.25,
                    ))
        # Lower flexible ballistic rubber mud-flap strip running full flank (heavy dry loess dust buildup!)
        parts.append(mk_box(f"sk_flap_{s}", 676, 12, 3.2, [("t", 10, -30, s * 172)], rubber, bevel=0.4))

    return join_parts("ztz99a_side_skirts", parts)


def build_ztz99a_road_wheels(mats) -> bpy.types.Object:
    """High-tessellation 670mm road wheels w/ dry loess dust + wet hub-oil seep, burnished sprocket teeth & twin-disc return rollers!"""
    parts = []
    tire = mats["H_WheelTire"]
    w_camo = mats["H_WheelCamo"]
    w_oily = mats["H_WheelDishOily"]
    oil_hub = mats["H_OilHubSteel"]
    steel = mats["H_OrdnanceSteel"]
    track_m = mats["H_TrackSteel"]
    burnish = mats["H_TrackBurnished"]

    for s in (-1, 1):
        zc = s * TRACK_CENTER_Z
        # 6 pairs of twin-rim stamped road wheels (48-seg dusty tires + dusty rims + oily center dishes & oil-hub caps)
        for wi, wx in enumerate(ROAD_WHEEL_XS):
            for dz in (-15.5, 15.5):
                parts.append(mk_cyl(f"rw_t_{s}_{wi}_{dz}", 33.5, 33.5, 17.0, axis="z", segs=48, xform=[("t", wx, -3.5, zc + dz)], mat=tire, bevel=1.6))
                parts.append(mk_cyl(f"rw_r_{s}_{wi}_{dz}", 25.5, 25.5, 18.2, axis="z", segs=40, xform=[("t", wx, -3.5, zc + dz)], mat=w_camo, bevel=1.2))
                # Inner stamped dish around oil hubcap with wet weeping hydraulic/hub oil streaks!
                parts.append(mk_cyl(f"rw_d_{s}_{wi}_{dz}", 17.0, 20.0, 19.0, axis="z", segs=32, xform=[("t", wx, -3.5, zc + dz)], mat=w_oily, bevel=0.8))
            # Armored center oil-hub cap (glossy wet oil seep!) & 6 hex bolts on outer face
            parts.append(mk_cyl(f"rw_h_{s}_{wi}", 10.5, 11.5, 44.0, axis="z", segs=24, xform=[("t", wx, -3.5, zc)], mat=oil_hub, bevel=0.9))
            for bi in range(6):
                ang = bi * (math.pi / 3.0)
                parts.append(mk_cyl(
                    f"rw_hb_{s}_{wi}_{bi}", 1.5, 1.5, 2.2, axis="z", segs=6,
                    xform=[("t", wx + 7.2 * math.cos(ang), -3.5 + 7.2 * math.sin(ang), zc + s * 22.8)],
                    mat=burnish, bevel=0.2,
                ))
            # Forged suspension swing arm linking road wheel hub to hull torsion bar socket
            parts.append(mk_box(f"rw_arm_{s}_{wi}", 22, 12, 18, [("t", wx - 10, 4, s * 116)], steel, bevel=0.7))

        # Front idler wheel (X=+332, local Y=+26, R=29) + burnished high-friction steel outer contact rim bands!
        for dz in (-14.0, 14.0):
            parts.append(mk_cyl(f"rw_id_{s}_{dz}", 28.4, 28.4, 15.0, axis="z", segs=44, xform=[("t", 332, 26, zc + dz)], mat=w_camo, bevel=1.2))
            parts.append(mk_hollow_tube(f"rw_idrim_{s}_{dz}", 29.1, 26.8, -6.4, 6.4, axis="z", segs=44, bevel=0.5, xform=[("t", 332, 26, zc + dz)], mat=burnish))
        parts.append(mk_cyl(f"rw_idh_{s}", 12.0, 12.0, 42.0, axis="z", segs=24, xform=[("t", 332, 26, zc)], mat=oil_hub, bevel=0.8))

        # Rear 14-tooth twin drive sprocket (X=-326, local Y=+26, R=30) w/ burnished high-friction steel teeth!
        for dz in (-16.0, 16.0):
            parts.append(mk_cyl(f"rw_sp_{s}_{dz}", 28.5, 28.5, 11.0, axis="z", segs=42, xform=[("t", -326, 26, zc + dz)], mat=track_m, bevel=0.9))
            for ti in range(14):
                ang = ti * (2.0 * math.pi / 14.0)
                parts.append(mk_box(
                    f"rw_spt_{s}_{dz}_{ti}", 6.2, 4.8, 7.5,
                    [("t", 29.5, 0, 0), ("rz", ang), ("t", -326, 26, zc + dz)], burnish, bevel=0.4,
                ))
        parts.append(mk_cyl(f"rw_sph_{s}", 17.5, 17.5, 46.0, axis="z", segs=28, xform=[("t", -326, 26, zc)], mat=oil_hub, bevel=0.9))

        # 3 upper twin-disc rubber-tired track return rollers (local Y=+54, R=9.5; center gap lets guide horns pass cleanly!)
        for ri, rx in enumerate((195.0, 15.0, -165.0)):
            for dz in (-11.5, 11.5):
                parts.append(mk_cyl(f"rw_ret_{s}_{ri}_{dz}", 9.5, 9.5, 11.0, axis="z", segs=28, xform=[("t", rx, 54, zc + dz)], mat=tire, bevel=0.7))
            parts.append(mk_cyl(f"rw_retax_{s}_{ri}", 4.2, 4.2, 36.0, axis="z", segs=18, xform=[("t", rx, 54, zc)], mat=steel, bevel=0.3))

    return join_parts("ztz99a_road_wheels", parts)


def _outer_tangent_ccw_angle(c1: tuple[float, float], r1: float, c2: tuple[float, float], r2: float) -> float:
    """Outward normal angle for CCW outer common tangent from circle (c1, r1) to circle (c2, r2)."""
    dx = c2[0] - c1[0]
    dy = c2[1] - c1[1]
    dist = math.hypot(dx, dy)
    alpha = math.atan2(dy, dx)
    ratio = max(-0.999, min(0.999, (r1 - r2) / max(dist, 1e-6)))
    return alpha - math.pi * 0.5 + math.asin(ratio)


def _build_ztz99a_track_curve() -> list[tuple[float, float]]:
    """
    Exact closed CCW inner-surface polyline for ZTZ-99A track belt in track-local (X, Y) space
    (`ztz99a_tracks_{left,right}` sits at world Y=-70.0; road wheels sit at world Y=-76.0 -> -6.0 cm offset):
      - Road wheel #0..5 centers: (248..-214, -9.5), R=33.9 -> flat bottom inner Y = -43.400 cm
        (outer rubber pad thickness = 6.600 cm -> exact ground contact local Y_min = -50.000 cm -> world -120.000 cm!)
      - Front idler center: (332.0, +20.0), R=29.4
      - Rear 14-tooth drive sprocket center: (-326.0, +20.0), R=29.5
      - 3 Upper return rollers: (195, +48.0), (15, +48.0), (-165, +48.0), R=9.3 (top at +57.3 cm, clears fender at +64.2!)
      - Authentic heavy-steel catenary sag (~2.8-3.3 cm) dipping between the 3 upper return rollers!
    """
    c_rw0 = (248.0, -9.5)
    c_rw5 = (-214.0, -9.5)
    r_rw = 33.9  # -9.5 - 33.9 = -43.400 cm exact!
    c_idl = (332.0, 20.0)
    r_idl = 29.4
    c_spr = (-326.0, 20.0)
    r_spr = 29.5
    r_ret = 9.3
    c_r0 = (195.0, 48.0)
    c_r1 = (15.0, 48.0)
    c_r2 = (-165.0, 48.0)

    def arc_pts(c, r, a0, a1, steps):
        # CCW arc strictly in [0, 2*pi) so arcs can NEVER wrap an extra 360° loop!
        delta = (a1 - a0) % (2.0 * math.pi)
        return [(c[0] + r * math.cos(a0 + delta * k / steps),
                 c[1] + r * math.sin(a0 + delta * k / steps))
                for k in range(steps + 1)]

    def line_pts(p0, p1, steps, sag_cm=0.0):
        out = []
        for k in range(steps + 1):
            u = k / steps
            x = p0[0] + (p1[0] - p0[0]) * u
            y = p0[1] + (p1[1] - p0[1]) * u - sag_cm * (4.0 * u * (1.0 - u))
            out.append((x, y))
        return out

    th_f_climb = _outer_tangent_ccw_angle(c_rw0, r_rw, c_idl, r_idl)
    th_idl_top = _outer_tangent_ccw_angle(c_idl, r_idl, c_r0, r_ret)
    th_spr_top = _outer_tangent_ccw_angle(c_r2, r_ret, c_spr, r_spr)
    th_r_climb = _outer_tangent_ccw_angle(c_spr, r_spr, c_rw5, r_rw)

    p_r0_top = (c_r0[0], c_r0[1] + r_ret)
    p_r1_top = (c_r1[0], c_r1[1] + r_ret)
    p_r2_top = (c_r2[0], c_r2[1] + r_ret)

    p_idl_exit = (c_idl[0] + r_idl * math.cos(th_idl_top), c_idl[1] + r_idl * math.sin(th_idl_top))
    p_r0_entry = (c_r0[0] + r_ret * math.cos(th_idl_top), c_r0[1] + r_ret * math.sin(th_idl_top))
    p_r2_exit = (c_r2[0] + r_ret * math.cos(th_spr_top), c_r2[1] + r_ret * math.sin(th_spr_top))
    p_spr_entry = (c_spr[0] + r_spr * math.cos(th_spr_top), c_spr[1] + r_spr * math.sin(th_spr_top))

    segs = [
        # 1. Flat ground-contact run under all 6 road wheels (exact Y = -43.400 cm)
        line_pts((-214.0, -43.4), (248.0, -43.4), 120, sag_cm=0.0),
        # 2. Front road wheel #0 lower wrap -> front climb -> front idler wrap
        arc_pts(c_rw0, r_rw, -math.pi * 0.5, th_f_climb, 16),
        line_pts(
            (c_rw0[0] + r_rw * math.cos(th_f_climb), c_rw0[1] + r_rw * math.sin(th_f_climb)),
            (c_idl[0] + r_idl * math.cos(th_f_climb), c_idl[1] + r_idl * math.sin(th_f_climb)),
            28, sag_cm=0.0,
        ),
        arc_pts(c_idl, r_idl, th_f_climb, th_idl_top, 44),
        # 3. Upper catenary return run across all 3 return rollers with authentic 2.4–3.2 cm steel track sag!
        line_pts(p_idl_exit, p_r0_entry, 44, sag_cm=2.2),
        arc_pts(c_r0, r_ret, th_idl_top, math.pi * 0.5, 6),
        line_pts(p_r0_top, p_r1_top, 60, sag_cm=3.2),
        line_pts(p_r1_top, p_r2_top, 60, sag_cm=3.2),
        arc_pts(c_r2, r_ret, math.pi * 0.5, th_spr_top, 6),
        line_pts(p_r2_exit, p_spr_entry, 52, sag_cm=2.4),
        # 4. Rear 14-tooth drive sprocket wrap -> rear climb -> rear road wheel #5 wrap
        arc_pts(c_spr, r_spr, th_spr_top, th_r_climb, 44),
        line_pts(
            (c_spr[0] + r_spr * math.cos(th_r_climb), c_spr[1] + r_spr * math.sin(th_r_climb)),
            (c_rw5[0] + r_rw * math.cos(th_r_climb), c_rw5[1] + r_rw * math.sin(th_r_climb)),
            36, sag_cm=0.0,
        ),
        arc_pts(c_rw5, r_rw, th_r_climb, -0.5 * math.pi, 16),
    ]

    poly: list[tuple[float, float]] = []
    for seg in segs:
        for pt in seg:
            if not poly or math.hypot(pt[0] - poly[-1][0], pt[1] - poly[-1][1]) > 1e-4:
                poly.append(pt)
    if len(poly) > 2 and math.hypot(poly[0][0] - poly[-1][0], poly[0][1] - poly[-1][1]) < 1e-3:
        poly.pop()
    return poly


def _sample_closed_curve(poly: list[tuple[float, float]], s_vals: list[float]):
    """Resample closed 2D CCW polyline at given arc-lengths, returning (x, y, tx, ty, nx, ny) per sample."""
    n = len(poly)
    cum = [0.0]
    for i in range(n):
        p0 = poly[i]
        p1 = poly[(i + 1) % n]
        cum.append(cum[-1] + math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
    perim = cum[-1]

    def eval_pt(s_raw: float) -> tuple[float, float]:
        s = s_raw % perim
        lo, hi = 0, n
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        seg_len = max(cum[lo + 1] - cum[lo], 1e-8)
        u = (s - cum[lo]) / seg_len
        p0 = poly[lo]
        p1 = poly[(lo + 1) % n]
        return (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)

    out = []
    ds = 1.6
    for s in s_vals:
        px, py = eval_pt(s)
        ax, ay = eval_pt(s - ds)
        bx, by = eval_pt(s + ds)
        dx, dy = bx - ax, by - ay
        dl = max(math.hypot(dx, dy), 1e-8)
        tx, ty = dx / dl, dy / dl
        # CCW loop: outward normal is (ty, -tx)
        nx, ny = ty, -tx
        out.append((px, py, tx, ty, nx, ny))
    return perim, out


def build_ztz99a_track_belt(name: str, mats, side_slot_offset: int = 0) -> bpy.types.Object:
    """
    PLAN C FLAGSHIP: 86 individual articulated double-pin sculpted ZTZ-99A track shoes per side!
    Each shoe = grouser-crested cast-steel body + twin recessed chamfered rubber road pads +
    central burnished high-friction guide horn + twin forged outer end-connector clamps & pin ends,
    wrapped tightly around sprocket, idler, flat ground run (local Y_min = -50.000 cm -> world -120.000 cm EXACT!)
    AND authentic 3.2 cm upper catenary sag between the 3 return rollers, with deterministic non-overlapping UV grid!
    """
    N_LINKS = 86
    poly = _build_ztz99a_track_curve()
    # Compute perimeter first
    perim = 0.0
    for i in range(len(poly)):
        p0, p1 = poly[i], poly[(i + 1) % len(poly)]
        perim += math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    pitch = perim / N_LINKS

    shoe_s = [(i + 0.5) * pitch for i in range(N_LINKS)]
    conn_s = [i * pitch for i in range(N_LINKS)]
    _, shoe_frames = _sample_closed_curve(poly, shoe_s)
    _, conn_frames = _sample_closed_curve(poly, conn_s)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.verify()

    # Deterministic 22 x 8 UV grid spanning U in [0.010, 0.990], V in [0.010, 0.210] (176 slots for 172 shoes!)
    GRID_COLS, GRID_ROWS = 22, 8
    U_LO, U_HI = 0.010, 0.990
    V_LO, V_HI = 0.010, 0.210
    cell_du = (U_HI - U_LO) / GRID_COLS
    cell_dv = (V_HI - V_LO) / GRID_ROWS

    def add_quad_uv(v0, v1, v2, v3, mat_idx: int, u0: float, u1: float, v_0: float, v_1: float):
        f = bm.faces.new((v0, v1, v2, v3))
        f.material_index = mat_idx
        f.smooth = False
        uvs = ((u0, v_0), (u1, v_0), (u1, v_1), (u0, v_1))
        for loop, uv in zip(f.loops, uvs):
            loop[uv_layer].uv = uv
        return f

    def add_frustum_box(
        to_b, u0_a, u1_a, d0, z0_a, z1_a, u0_b, u1_b, d1, z0_b, z1_b,
        mat_idx: int, rect: tuple[float, float, float, float],
    ):
        """Adds a strictly watertight 6-quad tapered frustum box in shoe-local (u, d, z) with non-overlapping UVs."""
        # 4 verts on d0 face, 4 verts on d1 face
        vs = [
            bm.verts.new(to_b(u0_a, d0, z0_a)),  # 0
            bm.verts.new(to_b(u1_a, d0, z0_a)),  # 1
            bm.verts.new(to_b(u1_a, d0, z1_a)),  # 2
            bm.verts.new(to_b(u0_a, d0, z1_a)),  # 3
            bm.verts.new(to_b(u0_b, d1, z0_b)),  # 4
            bm.verts.new(to_b(u1_b, d1, z0_b)),  # 5
            bm.verts.new(to_b(u1_b, d1, z1_b)),  # 6
            bm.verts.new(to_b(u0_b, d1, z1_b)),  # 7
        ]
        # Pack the 6 quads cleanly in a 3 x 2 sub-grid inside `rect`
        ru0, ru1, rv0, rv1 = rect
        du = (ru1 - ru0) / 3.0
        dv = (rv1 - rv0) / 2.0
        pad_u = du * 0.08
        pad_v = dv * 0.10
        quads = (
            (vs[0], vs[3], vs[2], vs[1]),  # d0 face
            (vs[4], vs[5], vs[6], vs[7]),  # d1 face
            (vs[0], vs[1], vs[5], vs[4]),  # z0 face
            (vs[2], vs[3], vs[7], vs[6]),  # z1 face
            (vs[1], vs[2], vs[6], vs[5]),  # u1 face
            (vs[3], vs[0], vs[4], vs[7]),  # u0 face
        )
        for qi, q in enumerate(quads):
            col = qi % 3
            row = qi // 3
            add_quad_uv(
                q[0], q[1], q[2], q[3], mat_idx,
                ru0 + col * du + pad_u, ru0 + (col + 1) * du - pad_u,
                rv0 + row * dv + pad_v, rv0 + (row + 1) * dv - pad_v,
            )

    def add_extruded_profile(
        to_b, prof_ud: list[tuple[float, float]], cap_quads_idx: list[tuple[int, int, int, int]],
        z0: float, z1: float, mat_per_edge: list[int], mat_cap: int,
        rect: tuple[float, float, float, float],
    ):
        """Extrudes a closed 2D (u, d) profile along z in [z0, z1] using pure convex quads and non-overlapping UVs."""
        m = len(prof_ud)
        v_lo = [bm.verts.new(to_b(u, d, z0)) for (u, d) in prof_ud]
        v_hi = [bm.verts.new(to_b(u, d, z1)) for (u, d) in prof_ud]
        ru0, ru1, rv0, rv1 = rect
        # Perimeter quads across left 72% of rect; end-cap quads in right 26% of rect
        u_split = ru0 + (ru1 - ru0) * 0.72
        su = (u_split - ru0) / m
        pad_u = su * 0.08
        pad_v = (rv1 - rv0) * 0.06
        for k in range(m):
            kn = (k + 1) % m
            add_quad_uv(
                v_lo[k], v_lo[kn], v_hi[kn], v_hi[k], mat_per_edge[k],
                ru0 + k * su + pad_u, ru0 + (k + 1) * su - pad_u,
                rv0 + pad_v, rv1 - pad_v,
            )
        # End caps split cleanly into convex quads on both z0 and z1
        cap_u0 = u_split + (ru1 - ru0) * 0.03
        n_cq = len(cap_quads_idx)
        cu = (ru1 - cap_u0) / max(n_cq, 1)
        cv = (rv1 - rv0) * 0.5
        cp_u = cu * 0.10
        cp_v = cv * 0.10
        for ci, (a, b, c, d) in enumerate(cap_quads_idx):
            add_quad_uv(
                v_lo[a], v_lo[d], v_lo[c], v_lo[b], mat_cap,
                cap_u0 + ci * cu + cp_u, cap_u0 + (ci + 1) * cu - cp_u,
                rv0 + cp_v, rv0 + cv - cp_v,
            )
            add_quad_uv(
                v_hi[a], v_hi[b], v_hi[c], v_hi[d], mat_cap,
                cap_u0 + ci * cu + cp_u, cap_u0 + (ci + 1) * cu - cp_u,
                rv0 + cv + cp_v, rv1 - cp_v,
            )

    # Track shoe body 10-vertex grouser-crested cross-section in (u_tan, d_out):
    # Inner face d=0, outer grouser crests at d=4.7 (front & rear), recessed pad pocket at d=3.6!
    SHOE_PROF = [
        (-6.8, 0.0),   # 0: inner rear
        ( 6.8, 0.0),   # 1: inner front
        ( 7.5, 0.9),   # 2: front pin barrel lower
        ( 7.5, 3.3),   # 3: front pin barrel upper
        ( 6.4, 4.7),   # 4: front grouser outer crest
        ( 5.0, 4.7),   # 5: front grouser inner crest
        ( 4.4, 3.6),   # 6: front pad pocket wall
        (-4.4, 3.6),   # 7: rear pad pocket wall
        (-5.0, 4.7),   # 8: rear grouser inner crest
        (-6.4, 4.7),   # 9: rear grouser outer crest
        (-7.5, 3.3),   # 10: rear pin barrel upper
        (-7.5, 0.9),   # 11: rear pin barrel lower
    ]
    SHOE_CAP_QUADS = [
        (0, 1, 2, 11),   # inner flat structural plate
        (11, 2, 3, 10),  # mid body plate
        (10, 3, 6, 7),   # recessed pocket bridge
        (6, 3, 4, 5),    # front steel grouser ridge
        (10, 7, 8, 9),   # rear steel grouser ridge
    ]
    # Edge 4->5 (front grouser crest) & edge 8->9 (rear grouser crest) get mat_idx=2 (`H_TrackBurnished`)!
    SHOE_EDGE_MATS = [0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]

    # End-connector clamp octagonal cross-section in (u_tan, d_out)
    CONN_PROF = [
        (-4.8, 1.2), (-3.6, 0.4), (3.6, 0.4), (4.8, 1.2),
        (4.8, 3.6),  (3.6, 4.5), (-3.6, 4.5), (-4.8, 3.6),
    ]
    CONN_CAP_QUADS = [
        (0, 1, 2, 3),
        (0, 3, 4, 7),
        (7, 4, 5, 6),
    ]
    CONN_EDGE_MATS = [0, 0, 0, 0, 0, 0, 0, 0]

    for i in range(N_LINKS):
        slot = side_slot_offset + i
        gc = slot % GRID_COLS
        gr = slot // GRID_COLS
        cu0 = U_LO + gc * cell_du + cell_du * 0.03
        cu1 = U_LO + (gc + 1) * cell_du - cell_du * 0.03
        cv0 = V_LO + gr * cell_dv + cell_dv * 0.04
        cv1 = V_LO + (gr + 1) * cell_dv - cell_dv * 0.04

        def sub_rect(fu0, fu1, fv0, fv1):
            return (
                cu0 + fu0 * (cu1 - cu0),
                cu0 + fu1 * (cu1 - cu0),
                cv0 + fv0 * (cv1 - cv0),
                cv0 + fv1 * (cv1 - cv0),
            )

        px, py, tx, ty, nx, ny = shoe_frames[i]

        # Rigid vertical floor guard: prevent tilted wheel-transition shoe corners from dipping below local Y = -50.000!
        y_lift = 0.0
        for uu, dd in ((-4.6, 6.6), (4.6, 6.6), (-7.5, 4.7), (7.5, 4.7)):
            wy = py + uu * ty + dd * ny
            if wy < -50.0:
                y_lift = max(y_lift, -50.0 - wy)

        def shoe_to_b(u_t: float, d_o: float, wz: float, _px=px, _py=py + y_lift, _tx=tx, _ty=ty, _nx=nx, _ny=ny):
            x3 = _px + u_t * _tx + d_o * _nx
            y3 = _py + u_t * _ty + d_o * _ny
            return Vector((x3, -wz, y3))

        # 1. Sculpted grouser-crested steel track shoe body (mat 0 = H_TrackSteel, crests = mat 2 H_TrackBurnished)
        add_extruded_profile(
            shoe_to_b, SHOE_PROF, SHOE_CAP_QUADS, -26.2, 26.2,
            SHOE_EDGE_MATS, 0, sub_rect(0.00, 1.00, 0.00, 0.44),
        )

        # 2. Twin recessed chamfered rubber road pads (mat 1 = H_TrackPad, outer surface at exact d=6.600!)
        add_frustum_box(
            shoe_to_b, -4.5, 4.5, 3.50, -23.8, -3.0, -3.8, 3.8, 6.600, -23.0, -3.8,
            1, sub_rect(0.00, 0.22, 0.50, 1.00),
        )
        add_frustum_box(
            shoe_to_b, -4.5, 4.5, 3.50, 3.0, 23.8, -3.8, 3.8, 6.600, 3.8, 23.0,
            1, sub_rect(0.24, 0.46, 0.50, 1.00),
        )

        # 3. Central forged burnished high-friction steel guide horn (mat 2 = H_TrackBurnished, inward d in [-6.2, +0.25])
        add_frustum_box(
            shoe_to_b, -3.7, 3.7, 0.25, -2.25, 2.25, -1.6, 1.6, -6.20, -1.05, 1.05,
            2, sub_rect(0.50, 0.65, 0.50, 1.00),
        )

        # 4. Twin outer forged double-pin end-connector clamps + protruding burnished pin heads at shoe junction `i`
        cpx, cpy, ctx, cty, cnx, cny = conn_frames[i]
        cy_lift = 0.0
        for uu, dd in ((-4.8, 4.5), (4.8, 4.5)):
            wy = cpy + uu * cty + dd * cny
            if wy < -49.5:
                cy_lift = max(cy_lift, -49.5 - wy)

        def conn_to_b(u_t: float, d_o: float, wz: float, _px=cpx, _py=cpy + cy_lift, _tx=ctx, _ty=cty, _nx=cnx, _ny=cny):
            x3 = _px + u_t * _tx + d_o * _nx
            y3 = _py + u_t * _ty + d_o * _ny
            return Vector((x3, -wz, y3))

        add_extruded_profile(
            conn_to_b, CONN_PROF, CONN_CAP_QUADS, -29.4, -26.0,
            CONN_EDGE_MATS, 0, sub_rect(0.68, 0.83, 0.50, 0.82),
        )
        add_extruded_profile(
            conn_to_b, CONN_PROF, CONN_CAP_QUADS, 26.0, 29.4,
            CONN_EDGE_MATS, 0, sub_rect(0.85, 1.00, 0.50, 0.82),
        )
        # Double track-pin bolt heads on outer faces of both end connectors (mat 2 = H_TrackBurnished)
        add_frustum_box(
            conn_to_b, -2.6, 2.6, 1.35, -30.2, -29.2, -2.2, 2.2, 3.45, -30.2, -29.2,
            2, sub_rect(0.68, 0.83, 0.85, 1.00),
        )
        add_frustum_box(
            conn_to_b, -2.6, 2.6, 1.35, 29.2, 30.2, -2.2, 2.2, 3.45, 29.2, 30.2,
            2, sub_rect(0.85, 1.00, 0.85, 1.00),
        )

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Verify exact ground contact local Y_min == -50.000 cm (Blender Z == Three.js Y!)
    min_y = min(v.co.z for v in bm.verts)
    max_y = max(v.co.z for v in bm.verts)
    print(f"  [TRACK] {name}: {N_LINKS} articulated shoes | perim={perim:.1f} cm | pitch={pitch:.2f} cm | local Y in [{min_y:.3f}, {max_y:.3f}]")
    assert abs(min_y - (-50.0)) < 0.02, f"{name} ground contact drifted: local min_y={min_y:.4f} != -50.000"

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mats["H_TrackSteel"])
    obj.data.materials.append(mats["H_TrackPad"])
    obj.data.materials.append(mats["H_TrackBurnished"])

    # Clean sharp-edge weighting (preserves custom deterministic non-overlapping UVs!)
    angle_rad = math.radians(38.0)
    bm2 = bmesh.new()
    bm2.from_mesh(obj.data)
    for f in bm2.faces:
        f.smooth = True
    for e in bm2.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
        else:
            e.smooth = False
    bm2.to_mesh(obj.data)
    bm2.free()
    obj.data.update()

    select_only([obj], obj)
    wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA_WITH_ANGLE"
    wn.weight = 50
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


def build_ztz99a_rear_deck(mats) -> bpy.types.Object:
    parts = []
    deck_camo = mats["H_RearDeckCamo"]
    drum_camo = mats["H_FuelDrumCamo"]
    louver_m = mats["H_RearDeckLouvers"]
    wet_steel = mats["H_DieselWetSteel"]
    steel = mats["H_OrdnanceSteel"]
    exh = mats["H_ExhaustBronze"]
    wood = mats["H_LogWood"]

    # Raised horizontal engine-deck armor cover (world X in [-354, -138], Y in [+8, +18])
    parts.append(mk_box("rd_slab", 216, 10, 206, [("t", 10, 5, 0)], deck_camo, bevel=1.0))

    # Perimeter bolted armored cooling louver frame + 20 hex mounting bolts
    parts.append(mk_box("rd_lv_fr1", 184, 2.4, 8.0, [("t", 3, 10.6, 86.0)], louver_m, bevel=0.35))
    parts.append(mk_box("rd_lv_fr2", 184, 2.4, 8.0, [("t", 3, 10.6, -86.0)], louver_m, bevel=0.35))
    parts.append(mk_box("rd_lv_fr3", 8.0, 2.4, 180.0, [("t", -88, 10.6, 0.0)], louver_m, bevel=0.35))
    parts.append(mk_box("rd_lv_fr4", 8.0, 2.4, 180.0, [("t", 94, 10.6, 0.0)], louver_m, bevel=0.35))
    for i in range(6):
        bx = -82.0 + i * 34.0
        for sz in (-86.0, 86.0):
            parts.append(mk_cyl(f"rd_lvb_{i}_{sz}", 1.35, 1.35, 2.2, axis="y", segs=6, xform=[("t", bx, 12.2, sz)], mat=wet_steel, bevel=0.2))
    for bz in (-64.0, -22.0, 22.0, 64.0):
        for bx in (-88.0, 94.0):
            parts.append(mk_cyl(f"rd_lvb2_{bx}_{bz}", 1.35, 1.35, 2.2, axis="y", segs=6, xform=[("t", bx, 12.2, bz)], mat=wet_steel, bevel=0.2))

    # 10 precision angled radiator louver cooling slats (oiled + left diesel exhaust soot plume!)
    for i in range(10):
        lx = -78.0 + i * 18.0
        parts.append(mk_box(f"rd_lv_{i}", 9.5, 3.6, 168, [("t", lx, 11.2, 0)], louver_m, bevel=0.4))

    # Twin forward engine-deck service inspection hatches w/ forged hinges & oil-seep latches
    for s in (-1, 1):
        parts.append(mk_box(f"rd_hatch_{s}", 18.0, 2.4, 62.0, [("t", 107.0, 10.6, s * 46.0)], deck_camo, bevel=0.4))
        for hz in (-20.0, 20.0):
            parts.append(mk_cyl(f"rd_hhng_{s}_{hz}", 1.4, 1.4, 7.0, axis="z", segs=12, xform=[("t", 116.0, 11.5, s * 46.0 + hz)], mat=wet_steel, bevel=0.2))
        parts.append(mk_box(f"rd_hlat_{s}", 4.5, 2.6, 10.0, [("t", 99.5, 11.8, s * 46.0)], wet_steel, bevel=0.3))

    # Left-side armored exhaust manifold grille box w/ heat-oxidized bronze/blue/charred vanes & bolted flange!
    parts.append(mk_box("rd_exh", 68, 12, 26, [("t", 26, 4, -102)], exh, bevel=0.7))
    parts.append(mk_box("rd_exh_fl", 74, 3.0, 29, [("t", 26, 9.8, -102)], wet_steel, bevel=0.35))
    for vi in range(6):
        vx = -2.0 + vi * 11.2
        parts.append(mk_box(f"rd_exh_v_{vi}", 3.6, 9.5, 20.0, [("rz", -0.35), ("t", vx, 4.8, -110.5)], exh, bevel=0.25))
    for bx in (-7.0, 15.0, 37.0, 59.0):
        parts.append(mk_cyl(f"rd_exh_b_{bx}", 1.3, 1.3, 2.0, axis="y", segs=6, xform=[("t", bx, 11.6, -102.0)], mat=wet_steel, bevel=0.2))

    # Twin 200L rear external cylindrical diesel fuel drums + wet diesel filler caps, vent valves & fuel-transfer hoses!
    for s in (-1, 1):
        parts.append(mk_cyl(f"rd_dr_{s}", 14.0, 14.0, 84.0, axis="z", segs=40, xform=[("t", -110, -16, s * 56)], mat=drum_camo, bevel=1.4))
        for rz in (-26.0, 0.0, 26.0):
            parts.append(mk_cyl(f"rd_rib_{s}_{rz}", 14.5, 14.5, 3.2, axis="z", segs=40, xform=[("t", -110, -16, s * 56 + rz)], mat=steel, bevel=0.3))
        for dz in (-24.0, 24.0):
            parts.append(mk_box(f"rd_brk_{s}_{dz}", 24, 14, 6, [("t", -98, -16, s * 56 + dz)], steel, bevel=0.4))
            # Retention clamp straps wrapping upper drum contour
            parts.append(mk_cyl(f"rd_str_{s}_{dz}", 14.8, 14.8, 2.8, axis="z", segs=32, xform=[("t", -110, -16, s * 56 + dz)], mat=wet_steel, bevel=0.2))
        # Raised threaded diesel filler neck + winged cap + vent plug on drum top (wet dark diesel sheen!)
        parts.append(mk_cyl(f"rd_fneck_{s}", 3.4, 3.8, 4.5, axis="y", segs=20, xform=[("t", -107.0, -1.2, s * 40.0)], mat=wet_steel, bevel=0.35))
        parts.append(mk_box(f"rd_fwing_{s}", 2.2, 2.0, 9.2, [("t", -107.0, 1.4, s * 40.0)], wet_steel, bevel=0.25))
        parts.append(mk_cyl(f"rd_fvent_{s}", 1.9, 1.9, 3.0, axis="y", segs=12, xform=[("t", -109.0, -1.6, s * 74.0)], mat=wet_steel, bevel=0.2))
        # Curved braided diesel-transfer feed hose connecting drum inboard end into rear deck manifold block
        hose_pts = [
            (-104.0, -10.5, s * 15.0),
            (-100.0, -6.5, s * 11.5),
            (-96.0, -2.5, s * 14.0),
            (-92.0, 1.2, s * 19.5),
            (-89.0, 2.0, s * 22.0),
        ]
        parts.append(mk_swept_tube(f"rd_hose_{s}", hose_pts, 1.45, segs=10, closed=False, mat=wet_steel))
        parts.append(mk_cyl(f"rd_hfit_{s}", 2.4, 2.4, 4.0, axis="x", segs=12, xform=[("t", -90.0, 2.0, s * 22.0)], mat=wet_steel, bevel=0.25))

    # Classic rear timber unditching log strapped beneath fuel drums w/ twin steel cinch bands
    parts.append(mk_cyl("rd_log", 6.5, 6.5, 198.0, axis="z", segs=24, xform=[("t", -104, -34, 0)], mat=wood, bevel=0.7))
    for lz in (-58.0, 58.0):
        parts.append(mk_cyl(f"rd_logb_{lz}", 7.0, 7.0, 3.6, axis="z", segs=20, xform=[("t", -104, -34, lz)], mat=steel, bevel=0.25))

    return join_parts("ztz99a_rear_deck", parts)


def build_ztz99a_turret_ring(mats) -> bpy.types.Object:
    parts = []
    ring_m = mats["H_TurretRingSteel"]
    steel = mats["H_OrdnanceSteel"]

    # High-tessellation machined outer raceway ring (64 segs!)
    parts.append(mk_hollow_tube("tr_race", 108.0, 96.0, -4.25, 4.25, axis="y", segs=64, bevel=0.6, mat=ring_m))
    # 36 precision internal traverse spur gear teeth around inner race
    for i in range(36):
        ang = i * (2.0 * math.pi / 36.0)
        parts.append(mk_box(f"tr_t_{i}", 4.5, 6.0, 4.4, [("t", 95.5, 0, 0), ("ry", ang)], ring_m, bevel=0.3))
    # 24 perimeter hull-deck mounting flange bolts
    for i in range(24):
        ang = i * (2.0 * math.pi / 24.0)
        parts.append(mk_cyl(f"tr_b_{i}", 1.8, 1.8, 2.5, axis="y", segs=6, xform=[("t", 102.5 * math.cos(ang), 4.8, 102.5 * math.sin(ang))], mat=steel, bevel=0.2))

    return join_parts("ztz99a_turret_ring", parts)


# =============================================================================
# SUITE 2 BUILDERS — `ztz99a_v3_turret_gun` (8 Solid GLB Parts — 4K + Plan C)
# =============================================================================
def build_ztz99a_turret_shell(mats) -> bpy.types.Object:
    """TRUE HOLLOW WELDED ZTZ-99A TURRET w/ unobstructed `ZTZ-99A / 108` Hero plates, cupola periscopes, weld beads, grab rails & loaded wire-grid bustle basket!"""
    parts = []
    camo = mats["T_DigitalCamo"]
    hero_plate = mats["T_HeroTurretPlate"]
    steel = mats["T_OrdnanceSteel"]
    weld_m = mats["T_WeldSteel"]
    lens = mats["T_OpticsEmerald"]
    tarp_m = mats["T_CanvasTarp"]
    crate_m = mats["T_CrateOlive"]
    strap_m = mats["T_AntiSlip"]

    # Turret roof armor deck (local Y in [+14, +28] -> world [+52, +66])
    parts.append(mk_box("ts_roof", 284, 14, 232, [("t", -19, 21, 0)], camo, bevel=1.4))

    # Left & Right hollow armored turret sidewalls + angled front composite cheeks flanking gun mantlet slot
    for s in (-1, 1):
        parts.append(mk_box(f"ts_wall_{s}", 226, 48, 22, [("t", -24, 0, s * 110)], camo, bevel=1.3))
        parts.append(mk_box(f"ts_chk_{s}", 108, 48, 22, [("ry", s * 0.66), ("t", 92, 0, s * 74)], camo, bevel=1.3))
        # UNOBSTRUCTED rear-flank flat tactical Hero plate (world X in [-160, -82], Z = ±124 -> `ZTZ-99A / 108` + PLA star!)
        parts.append(mk_box(f"ts_hero_{s}", 78, 36, 6, [("t", -121, 4, s * 124)], hero_plate, bevel=0.5))

    # Rear turret bustle backplate & lower floor tray
    parts.append(mk_box("ts_back", 20, 44, 200, [("t", -156, 3, 0)], camo, bevel=1.2))
    parts.append(mk_box("ts_bfloor", 56, 10, 196, [("t", -136, -17, 0)], camo, bevel=0.9))

    # Commander's right armored cupola ring (+Z) & Gunner's left hatch ring (-Z) w/ armored vision periscope arrays!
    parts.append(mk_cyl("ts_cmd_h", 28.0, 30.0, 7.0, axis="y", segs=36, xform=[("t", 14, 30, 56)], mat=camo, bevel=0.8))
    parts.append(mk_cyl("ts_cmd_lid", 21.5, 22.5, 3.0, axis="y", segs=32, xform=[("t", 14, 34.0, 56)], mat=camo, bevel=0.5))
    parts.append(mk_box("ts_cmd_hng", 6.5, 3.5, 11.0, [("t", -10, 34.5, 56)], steel, bevel=0.35))
    # 6-block Commander's Cupola Armored Vision Periscope Ring (angles selected to clear CITV pedestal at (16, 42)!)
    for pi, deg in enumerate((-15.0, 25.0, 65.0, 105.0, 150.0, 195.0)):
        ang = math.radians(deg)
        px = 14.0 + 25.2 * math.cos(ang)
        pz = 56.0 + 25.2 * math.sin(ang)
        # Rotate housing & emerald prism window outward along radial angle `ang` (`ry = -ang` aligns local +X with (cos, sin)!)
        parts.append(mk_box(f"ts_cper_h_{pi}", 8.2, 5.8, 10.2, [("ry", -ang), ("t", px, 35.0, pz)], camo, bevel=0.45))
        parts.append(mk_box(f"ts_cper_v_{pi}", 3.0, 1.4, 9.6, [("t", 4.6, 2.4, 0), ("ry", -ang), ("t", px, 35.0, pz)], steel, bevel=0.2))
        parts.append(mk_box(f"ts_cper_g_{pi}", 1.8, 3.4, 7.8, [("t", 3.9, 0.0, 0), ("ry", -ang), ("t", px, 35.0, pz)], lens, bevel=0.15))

    parts.append(mk_cyl("ts_gun_h", 26.0, 28.0, 6.0, axis="y", segs=36, xform=[("t", 12, 29.5, -56)], mat=camo, bevel=0.8))
    parts.append(mk_cyl("ts_gun_lid", 19.5, 20.5, 2.8, axis="y", segs=32, xform=[("t", 12, 33.2, -56)], mat=camo, bevel=0.5))
    parts.append(mk_box("ts_gun_hng", 6.0, 3.2, 10.0, [("t", -10, 33.6, -56)], steel, bevel=0.35))
    # 3-block Gunner's Forward Vision Periscope Ring w/ recessed emerald optics prisms
    for pi, deg in enumerate((-40.0, 0.0, 40.0)):
        ang = math.radians(deg)
        px = 12.0 + 23.8 * math.cos(ang)
        pz = -56.0 + 23.8 * math.sin(ang)
        parts.append(mk_box(f"ts_gper_h_{pi}", 8.0, 5.4, 9.6, [("ry", -ang), ("t", px, 34.2, pz)], camo, bevel=0.4))
        parts.append(mk_box(f"ts_gper_g_{pi}", 1.8, 3.2, 7.2, [("t", 3.8, 0.0, 0), ("ry", -ang), ("t", px, 34.2, pz)], lens, bevel=0.15))

    # Coarse anti-slip crew roof walkways, sculpted rippled weld beads & twin rear turret lifting eyes
    parts.append(mk_box("ts_grip_r", 84, 1.4, 176, [("t", -104, 28.4, 0)], mats["T_AntiSlip"], bevel=0.3))
    parts.append(mk_weld_bead("ts_weld_rear", (-160.0, 28.0, -104.0), (-160.0, 28.0, 104.0), radius=1.35, ripples=20, segs=10, mat=weld_m))
    for s in (-1, 1):
        parts.append(mk_box(f"ts_grip_f_{s}", 76, 1.4, 44, [("t", 64, 28.4, s * 76)], mats["T_AntiSlip"], bevel=0.3))
        # Rippled sculpted armor weld beads along turret roof sidewalls, angled front cheeks & vertical brow seams
        parts.append(mk_weld_bead(f"ts_weld_sd_{s}", (-158.0, 28.1, s * 115.0), (84.0, 28.1, s * 115.0), radius=1.45, ripples=24, segs=10, mat=weld_m))
        parts.append(mk_weld_bead(f"ts_weld_ck_{s}", (84.0, 28.0, s * 114.0), (122.0, 28.0, s * 36.0), radius=1.35, ripples=12, segs=10, mat=weld_m))
        parts.append(mk_weld_bead(f"ts_weld_vt_{s}", (124.0, -21.0, s * 35.0), (124.0, 24.0, s * 35.0), radius=1.25, ripples=9, segs=10, mat=weld_m))
        parts.append(mk_box(f"ts_lift_{s}", 12, 8, 6, [("t", -148, 28, s * 86)], steel, bevel=0.5))

        # --- PLAN C: Crew Tubular Steel Grab Handles (strictly ABOVE `ZTZ-99A / 108` Hero plates & on rear bustle corners!) ---
        for gi, (gx0, gx1) in enumerate(((-144.0, -100.0), (-64.0, -22.0))):
            grab_pts = [
                (gx0, 25.4, s * 114.5),
                (gx0, 26.2, s * 119.5),
                (gx0 + 3.5, 26.4, s * 121.0),
                (gx1 - 3.5, 26.4, s * 121.0),
                (gx1, 26.2, s * 119.5),
                (gx1, 25.4, s * 114.5),
            ]
            parts.append(mk_swept_tube(f"ts_grab_top_{s}_{gi}", grab_pts, 1.15, segs=10, closed=False, mat=steel))
        # Vertical rear-bustle corner crew boarding grab handles
        rgrab_pts = [
            (-164.0, -6.0, s * 98.0),
            (-169.5, -5.0, s * 101.0),
            (-170.5, -2.0, s * 101.5),
            (-170.5, 14.0, s * 101.5),
            (-169.5, 17.0, s * 101.0),
            (-164.0, 18.0, s * 98.0),
        ]
        parts.append(mk_swept_tube(f"ts_grab_rear_{s}", rgrab_pts, 1.15, segs=10, closed=False, mat=steel))

    # --- PLAN C: Dense Wire-Grid Rear Turret Bustle Stowage Basket (local X in [-206, -166]) ---
    parts.append(mk_box("ts_bsk_bot", 40, 4.5, 198, [("t", -186, -10, 0)], steel, bevel=0.4))
    for fx in (-198.0, -190.0, -182.0, -174.0):
        parts.append(mk_box(f"ts_bsk_fl_{fx}", 2.2, 2.2, 194, [("t", fx, -7.2, 0)], steel, bevel=0.2))
    parts.append(mk_box("ts_bsk_top", 5.5, 4.8, 198, [("t", -203, 21, 0)], steel, bevel=0.4))
    parts.append(mk_box("ts_bsk_mid", 5.0, 4.2, 198, [("t", -203, 6, 0)], steel, bevel=0.4))
    # Intermediate horizontal rear mesh wire bars
    for by in (-2.0, 13.5):
        parts.append(mk_cyl(f"ts_bsk_hw_{by}", 1.15, 1.15, 196.0, axis="z", segs=10, xform=[("t", -203.0, by, 0)], mat=steel, bevel=0.15))
    # Denser 13-bar vertical rear wire-grid uprights (every 16 cm across Z in [-96, +96])
    for bi in range(13):
        bz = -96.0 + bi * 16.0
        r_bar = 2.1 if (bi % 3 == 0) else 1.25
        parts.append(mk_cyl(f"ts_bsk_p_{bi}", r_bar, r_bar, 33.0, axis="y", segs=10, xform=[("t", -203.0, 6.5, bz)], mat=steel, bevel=0.15))
    for s in (-1, 1):
        parts.append(mk_box(f"ts_bsk_s_{s}", 40, 4.8, 4.8, [("t", -186, 21, s * 98)], steel, bevel=0.4))
        parts.append(mk_box(f"ts_bsk_sm_{s}", 40, 4.2, 4.5, [("t", -186, 6, s * 98)], steel, bevel=0.4))
        for by in (-2.0, 13.5):
            parts.append(mk_cyl(f"ts_bsk_sh_{s}_{by}", 1.15, 1.15, 38.0, axis="x", segs=10, xform=[("t", -185.0, by, s * 98.0)], mat=steel, bevel=0.15))
        for bx in (-194.0, -182.0, -170.0):
            parts.append(mk_cyl(f"ts_bsk_sv_{s}_{bx}", 1.25, 1.25, 32.0, axis="y", segs=10, xform=[("t", bx, 6.5, s * 98.0)], mat=steel, bevel=0.15))

    # --- PLAN C: Stowed Rolled Camouflage Canvas Tarp (right bustle bay, Z in [+14, +86]) ---
    tarp_pts = [(-185.0, 3.2, 14.0 + k * 9.0) for k in range(9)]
    tarp_rads = [9.2, 10.4, 9.8, 10.7, 10.0, 10.6, 9.9, 10.3, 9.1]
    parts.append(mk_swept_tube("ts_tarp_roll", tarp_pts, tarp_rads, segs=18, closed=False, mat=tarp_m))
    for tz in (26.0, 50.0, 74.0):
        parts.append(mk_cyl(f"ts_tarp_str_{tz}", 10.8, 10.8, 2.8, axis="z", segs=22, xform=[("t", -185.0, 3.2, tz)], mat=strap_m, bevel=0.2))

    # --- PLAN C: Stowed Steel Spare Ammo / Equipment Crate (left bustle bay, Z in [-86, -18]) ---
    parts.append(mk_box("ts_crate_body", 27.0, 16.5, 64.0, [("t", -184.5, 1.8, -52.0)], crate_m, bevel=0.85))
    parts.append(mk_box("ts_crate_lid", 29.0, 3.4, 66.0, [("t", -184.5, 11.2, -52.0)], crate_m, bevel=0.55))
    for cz in (-72.0, -52.0, -32.0):
        parts.append(mk_box(f"ts_crate_rib_{cz}", 28.4, 14.0, 2.4, [("t", -184.5, 1.5, cz)], crate_m, bevel=0.25))
    for cz in (-68.0, -36.0):
        parts.append(mk_box(f"ts_crate_lat_{cz}", 2.2, 5.5, 3.6, [("t", -198.4, 8.6, cz)], steel, bevel=0.2))
    for cz in (-84.8, -19.2):
        parts.append(mk_box(f"ts_crate_hnd_{cz}", 10.0, 2.0, 2.2, [("t", -184.5, 5.5, cz)], steel, bevel=0.2))

    return join_parts("ztz99a_turret_shell", parts)


def build_ztz99a_era_wedges(mats) -> bpy.types.Object:
    """Iconic razor-sharp ARROWHEAD FY-4 ERA composite turret cheek wedges + 3 forward side ERA bricks w/ steel substructure cleats!"""
    parts = []
    era = mats["T_EraWedgeCamo"]
    steel = mats["T_OrdnanceSteel"]

    for s in (-1, 1):
        # 4 heavy forward-swept arrowhead wedge composite ERA modules per cheek
        for k in range(4):
            u = k / 3.0
            lx = 68.0 - u * 62.0
            lz = s * (48.0 + u * 84.0)
            parts.append(mk_box(
                f"ew_up_{s}_{k}", 36, 24, 30,
                [("rx", s * 0.16), ("rz", 0.24), ("ry", s * 0.68), ("t", lx, 11, lz)], era, bevel=1.1,
            ))
            parts.append(mk_box(
                f"ew_lo_{s}_{k}", 36, 24, 30,
                [("rx", -s * 0.16), ("rz", -0.24), ("ry", s * 0.68), ("t", lx, -11, lz)], era, bevel=1.1,
            ))
            # Armored tie-down bolt cleats & mounting frame struts linking ERA wedge to turret cheek
            parts.append(mk_cyl(
                f"ew_blt_{s}_{k}", 1.8, 1.8, 3.0, axis="y", segs=6,
                xform=[("t", lx - 4, 24.5, lz - s * 4)], mat=steel, bevel=0.2,
            ))
            parts.append(mk_box(
                f"ew_strt_{s}_{k}", 14.0, 3.2, 6.0,
                [("ry", s * 0.68), ("t", lx - 14.0, 22.8, lz - s * 10.0)], steel, bevel=0.3,
            ))
            # Recessed front nose seam bracket cleat between upper & lower wedge plates
            parts.append(mk_box(
                f"ew_cl_{s}_{k}", 4.5, 4.0, 12.0,
                [("ry", s * 0.68), ("t", lx + 11.0, 0.0, lz + s * 6.0)], steel, bevel=0.25,
            ))

        # 3 heavy side turret FY-4 ERA bricks strictly forward of rear bustle stencil plate (local X in [-154, -26])
        for i in range(3):
            sx = -46.0 - i * 44.0
            parts.append(mk_box(f"ew_sd_{s}_{i}", 40, 34, 12, [("t", sx, 2, s * 136)], era, bevel=1.0))
            parts.append(mk_box(f"ew_shng_{s}_{i}", 34, 4.0, 6.5, [("t", sx, 20.5, s * 133.5)], steel, bevel=0.3))
            for bx in (-12.0, 12.0):
                for by in (-10.0, 12.0):
                    parts.append(mk_cyl(
                        f"ew_sb_{s}_{i}_{bx}_{by}", 1.5, 1.5, 2.4, axis="z", segs=6,
                        xform=[("t", sx + bx, by, s * 142.5)], mat=steel, bevel=0.2,
                    ))

    return join_parts("ztz99a_era_wedges", parts)


def build_ztz99a_main_gun(mats) -> bpy.types.Object:
    """6.25-meter 125mm ZPT-98 L/50 smoothbore barrel w/ segmented thermal shroud, fume extractor & MRS mast!"""
    parts = []
    shroud = mats["T_GunShroudCamo"]
    steel = mats["T_OrdnanceSteel"]
    muzzle = mats["T_GunMuzzleSteel"]
    chrome = mats["T_ChromeRod"]

    # Heavy rear jacket & breech coupling collar (local X in [0, 155])
    parts.append(mk_cyl("mg_rear", 10.6, 11.8, 155.0, axis="x", segs=56, xform=[("t", 77.5, 0, 0)], mat=steel, bevel=0.6))
    # Rear thermal shroud segment (local X in [155, 250])
    parts.append(mk_cyl("mg_shr1", 10.0, 10.4, 96.0, axis="x", segs=56, xform=[("t", 203.0, 0, 0)], mat=shroud, bevel=0.4))
    # Prominent concentric mid-barrel Cylindrical Bore Evacuator / Fume Extractor (local X in [246, 344], R=14.8!)
    parts.append(mk_cyl("mg_evac", 14.8, 14.8, 84.0, axis="x", segs=64, xform=[("t", 292.0, 0, 0)], mat=shroud, bevel=1.4))
    parts.append(mk_cyl("mg_evf", 11.6, 14.8, 14.0, axis="x", segs=56, xform=[("t", 339.0, 0, 0)], mat=steel, bevel=0.4))
    parts.append(mk_cyl("mg_evr", 14.8, 11.6, 14.0, axis="x", segs=56, xform=[("t", 245.0, 0, 0)], mat=steel, bevel=0.4))
    # Forward tapered thermal-shrouded barrel (local X in [342, 608])
    parts.append(mk_cyl("mg_shr2", 8.2, 9.4, 266.0, axis="x", segs=56, xform=[("t", 475.0, 0, 0)], mat=shroud, bevel=0.4))
    # 7 gleaming stainless steel thermal-shroud clamp rings
    for cx in (158.0, 206.0, 355.0, 412.0, 468.0, 524.0, 580.0):
        r_c = 10.7 if cx < 240.0 else (9.6 - (cx - 355.0) * 0.0045)
        parts.append(mk_cyl(f"mg_cl_{cx}", r_c, r_c, 4.5, axis="x", segs=48, xform=[("t", cx, 0, 0)], mat=chrome, bevel=0.3))
    # TRUE HOLLOW 125mm SMOOTHBORE MUZZLE CROWN (R_out=8.4, R_bore=6.25 -> exact 125mm bore!)
    parts.append(mk_hollow_tube("mg_muzzle", 8.4, 6.25, 605.0, 625.0, axis="x", segs=64, bevel=0.45, mat=muzzle))
    # Muzzle Reference System (MRS) collimator prism mast atop muzzle
    parts.append(mk_box("mg_mrs_b", 8.0, 9.5, 5.5, [("t", 616.0, 11.5, 0)], steel, bevel=0.4))
    parts.append(mk_cyl("mg_mrs_m", 2.2, 2.2, 3.0, axis="x", segs=16, xform=[("t", 611.5, 13.5, 0)], mat=chrome, bevel=0.2))

    return join_parts("ztz99a_main_gun", parts)


def build_ztz99a_gun_cradle(mats) -> bpy.types.Object:
    parts = []
    camo = mats["T_DigitalCamo"]
    steel = mats["T_OrdnanceSteel"]
    breech = mats["T_BreechSteel"]
    chrome = mats["T_ChromeRod"]

    # Heavy external cast-steel gun mantlet block (local X in [+6, +46], Z in [-33, +33])
    parts.append(mk_box("gc_mant", 40, 32, 66, [("t", 26, 0, 0)], camo, bevel=1.6))
    # Coaxial 7.62mm Type 86 MG armored port sleeve
    parts.append(mk_hollow_tube("gc_coax", 3.6, 1.8, 36.0, 57.0, axis="x", segs=24, bevel=0.3, xform=[("t", 0, 2, 22)], mat=steel))
    # Internal heavy U-cradle trough rails & precision trunnion pivot pins
    for s in (-1, 1):
        parts.append(mk_box(f"gc_rail_{s}", 76, 22, 7.5, [("t", -26, -2, s * 24)], breech, bevel=0.7))
        parts.append(mk_cyl(f"gc_trun_{s}", 7.5, 7.5, 14.0, axis="z", segs=32, xform=[("t", -8, 0, s * 30)], mat=chrome, bevel=0.6))
    parts.append(mk_box("gc_bot", 72, 7, 54, [("t", -26, -12, 0)], steel, bevel=0.7))

    return join_parts("ztz99a_gun_cradle", parts)


def build_ztz99a_recoil_cylinders(mats) -> bpy.types.Object:
    """Twin gleaming mirror-chrome hydraulic recoil brake & hydro-pneumatic recuperator cylinders."""
    parts = []
    steel = mats["T_OrdnanceSteel"]
    chrome = mats["T_ChromeRod"]
    breech = mats["T_BreechSteel"]
    brass = mats["T_BrassAccent"]

    for s in (-1, 1):
        cz = s * 15.5
        parts.append(mk_cyl(f"rc_cyl_{s}", 5.8, 5.8, 72.0, axis="x", segs=40, xform=[("t", -14, 0, cz)], mat=steel, bevel=0.5))
        parts.append(mk_cyl(f"rc_rod_{s}", 3.6, 3.6, 44.0, axis="x", segs=36, xform=[("t", 30, 0, cz)], mat=chrome, bevel=0.4))
        parts.append(mk_cyl(f"rc_capr_{s}", 6.8, 6.8, 6.0, axis="x", segs=32, xform=[("t", -49, 0, cz)], mat=breech, bevel=0.5))
        parts.append(mk_cyl(f"rc_capf_{s}", 6.6, 6.6, 6.0, axis="x", segs=32, xform=[("t", 21, 0, cz)], mat=breech, bevel=0.5))
        parts.append(mk_cyl(f"rc_valv_{s}", 1.8, 1.8, 4.0, axis="y", segs=16, xform=[("t", -38, 6.2, cz)], mat=brass, bevel=0.2))
    parts.append(mk_box("rc_yoke", 10, 9, 42, [("t", 46, 0, 0)], breech, bevel=0.6))

    return join_parts("ztz99a_recoil_cylinders", parts)


def build_ztz99a_breech_block(mats) -> bpy.types.Object:
    """Heavy forged steel ZPT-98 breech ring + vertical sliding wedge breechblock + brass firing solenoid."""
    parts = []
    breech = mats["T_BreechSteel"]
    chrome = mats["T_ChromeRod"]
    brass = mats["T_BrassAccent"]
    steel = mats["T_OrdnanceSteel"]

    # Forged steel breech ring with true 125mm circular chamber bore!
    outer = mk_box("bb_ring", 46, 34, 36, [("t", 0, 0, 0)], breech, bevel=1.3)
    bore = mk_cyl("bb_bore", 7.2, 7.2, 54.0, axis="x", segs=36, mat=breech)
    bool_op(outer, bore, "DIFFERENCE")
    parts.append(outer)

    # Machined vertical sliding wedge core + gleaming brass electric primer solenoid cap
    parts.append(mk_box("bb_wedge", 18, 26, 22, [("t", -6, -1, 0)], chrome, bevel=0.8))
    parts.append(mk_cyl("bb_sol", 4.8, 4.8, 7.0, axis="x", segs=28, xform=[("t", -18, 0, 0)], mat=brass, bevel=0.4))
    # Semi-auto opening cam crank lever on left side
    parts.append(mk_box("bb_crank", 18, 5, 6, [("t", -8, 12, -20)], steel, bevel=0.4))

    return join_parts("ztz99a_breech_block", parts)


def build_ztz99a_optics_citv(mats) -> bpy.types.Object:
    """Commander's panoramic CITV, Gunner's thermal sight & iconic JD-3 Laser Active Defense Dazzler w/ deep AR coated glass & armored visors!"""
    parts = []
    camo = mats["T_DigitalCamo"]
    steel = mats["T_OrdnanceSteel"]
    lens = mats["T_OpticsEmerald"]
    ruby = mats["T_OpticsRuby"]

    # 1. Gunner's primary stabilized thermal sight box w/ recessed glass, armored brow visor & side shutter doors
    parts.append(mk_box("op_gun_box", 32, 22, 26, [("t", 58, -4, -52)], camo, bevel=1.0))
    parts.append(mk_box("op_gun_hood", 8, 22, 26, [("t", 72, -4, -52)], steel, bevel=0.5))
    parts.append(mk_box("op_gun_brow", 9.0, 2.4, 24.0, [("t", 76.5, 6.2, -52)], camo, bevel=0.35))
    for sz in (-1, 1):
        parts.append(mk_box(f"op_gun_sht_{sz}", 7.0, 17.5, 2.0, [("t", 75.8, -4.0, -52 + sz * 11.4)], steel, bevel=0.25))
    parts.append(mk_box("op_gun_lens", 3.5, 13.5, 17.5, [("t", 74.2, -4, -52)], lens, bevel=0.3))

    # 2. Commander's 360° panoramic hunter-killer CITV turret w/ overhanging ballistic hood
    parts.append(mk_cyl("op_citv_ped", 14.0, 16.0, 16.0, axis="y", segs=36, xform=[("t", -2, -2, 42)], mat=camo, bevel=0.8))
    parts.append(mk_box("op_citv_head", 26, 18, 22, [("t", 0, 12, 42)], camo, bevel=0.9))
    parts.append(mk_box("op_citv_brow", 8.0, 2.2, 20.0, [("t", 14.5, 20.2, 42)], steel, bevel=0.3))
    parts.append(mk_box("op_citv_lens", 3.5, 10.5, 14.5, [("t", 13.0, 12, 42)], lens, bevel=0.3))

    # 3. Iconic ZTZ-99A JD-3 Laser Warning Dome & Active Ruby-Glass Laser Dazzler Projector Turret!
    parts.append(mk_cyl("op_lwr_b", 7.5, 9.0, 14.0, axis="y", segs=32, xform=[("t", -48, 0, -18)], mat=steel, bevel=0.6))
    parts.append(mk_cyl("op_lwr_l", 8.5, 8.5, 5.0, axis="y", segs=32, xform=[("t", -48, 9, -18)], mat=ruby, bevel=0.4))
    parts.append(mk_cyl("op_jd3_m", 9.0, 11.0, 18.0, axis="y", segs=32, xform=[("t", -68, -4, -56)], mat=camo, bevel=0.7))
    parts.append(mk_box("op_jd3_h", 30, 24, 24, [("t", -66, 18, -56)], camo, bevel=1.0))
    parts.append(mk_box("op_jd3_brow", 9.0, 2.4, 21.0, [("t", -49.0, 28.8, -56)], steel, bevel=0.3))
    parts.append(mk_box("op_jd3_l", 4.0, 15.0, 15.5, [("t", -49.8, 18, -56)], ruby, bevel=0.3))

    return join_parts("ztz99a_optics_citv", parts)


def build_ztz99a_roof_armaments(mats) -> bpy.types.Object:
    parts = []
    camo = mats["T_DigitalCamo"]
    steel = mats["T_OrdnanceSteel"]
    chrome = mats["T_ChromeRod"]
    ant_m = mats["T_AntennaFiber"]

    # Twin 6-barrel 81mm smoke grenade discharger banks flanking turret cheeks
    for s in (-1, 1):
        parts.append(mk_box(f"ra_smb_{s}", 24, 10, 12, [("t", 38, -28, s * 120)], steel, bevel=0.5))
        for i in range(6):
            row = i // 3
            col = i % 3
            parts.append(mk_hollow_tube(
                f"ra_sm_{s}_{i}", 4.1, 3.2, -15.0, 15.0, axis="x", segs=24, bevel=0.25,
                xform=[("rz", 0.38), ("ry", s * (0.22 + col * 0.14)), ("t", 46 + col * 4, -22 + row * 9, s * (118 + col * 4))],
                mat=camo,
            ))

    # Roof-mounted QJC-88 12.7x108mm Heavy Anti-Aircraft Machine Gun on commander's right pintle
    parts.append(mk_cyl("ra_pint", 4.5, 5.5, 22.0, axis="y", segs=24, xform=[("t", -26, -6, 54)], mat=steel, bevel=0.4))
    parts.append(mk_box("ra_rec", 56, 11, 10, [("t", -14, 12, 54)], steel, bevel=0.6))
    parts.append(mk_box("ra_spade", 16, 10, 14, [("t", -46, 11, 54)], steel, bevel=0.5))
    parts.append(mk_cyl("ra_bbl", 2.1, 2.8, 86.0, axis="x", segs=24, xform=[("t", 54, 13, 54)], mat=steel, bevel=0.25))
    parts.append(mk_cyl("ra_fh", 3.6, 2.2, 12.0, axis="x", segs=24, xform=[("t", 99, 13, 54)], mat=steel, bevel=0.2))
    parts.append(mk_box("ra_ammo", 22, 18, 13, [("t", -12, 9, 67)], camo, bevel=0.6))
    # QJC-88 feed chute & AA ring sight
    parts.append(mk_box("ra_chute", 12, 5.5, 6.0, [("t", -12, 13, 61)], steel, bevel=0.3))
    parts.append(mk_oval_eye("ra_aasight", (8.0, 21.5, 54.0), 4.0, 4.0, 0.55, plane="yz", mat=steel))
    parts.append(mk_cyl("ra_aas_post", 0.7, 0.7, 5.5, axis="y", segs=10, xform=[("t", 8.0, 17.5, 54.0)], mat=steel))

    # Rear digital ballistic cross-wind meteorological sensor mast
    parts.append(mk_cyl("ra_wpost", 2.2, 3.0, 40.0, axis="y", segs=20, xform=[("t", -80, 14, -20)], mat=steel, bevel=0.3))
    parts.append(mk_cyl("ra_whead", 5.0, 5.0, 4.0, axis="y", segs=24, xform=[("t", -80, 33, -20)], mat=chrome, bevel=0.3))

    # --- PLAN C: Twin Rear-Mounted Flexible Whip Communication Antennas w/ Helical Spring Bases ---
    # Mounted cleanly on rear turret roof corners (local X=-132, Z=±72 -> world X=-142, Y_base=+66, tip Y=+150 cm!)
    for s in (-1, 1):
        ax, az = -132.0, s * 72.0
        # Armored circular radio mount pot & ceramic collar sitting flush on turret roof (local Y = -16.0)
        parts.append(mk_cyl(f"ra_ant_pot_{s}", 4.4, 5.6, 6.5, axis="y", segs=20, xform=[("t", ax, -12.8, az)], mat=camo, bevel=0.45))
        parts.append(mk_cyl(f"ra_ant_ins_{s}", 3.0, 3.4, 2.2, axis="y", segs=16, xform=[("t", ax, -8.8, az)], mat=steel, bevel=0.25))
        # Sculpted 5-ring helical shock-absorber spring base
        for ci in range(5):
            cy = -7.2 + ci * 1.45
            parts.append(mk_oval_eye(f"ra_ant_sp_{s}_{ci}", (ax, cy, az), 2.35, 2.35, 0.58, plane="xz", mat=steel))
        parts.append(mk_cyl(f"ra_ant_cap_{s}", 1.9, 2.2, 2.2, axis="y", segs=14, xform=[("t", ax, 0.2, az)], mat=steel, bevel=0.2))
        # Gently rearward-swept flexible tapered whip mast (local Y in [1.0, 54.0] -> world Y_max = 137.5 cm, clean framing!)
        whip_pts = []
        whip_rads = []
        for k in range(11):
            u = k / 10.0
            wy = 1.0 + u * 53.0
            wx = ax - 13.5 * (u ** 1.85)
            wz = az + s * 3.6 * (u ** 1.6)
            whip_pts.append((wx, wy, wz))
            whip_rads.append(0.80 - 0.42 * u)
        parts.append(mk_swept_tube(f"ra_whip_{s}", whip_pts, whip_rads, segs=10, closed=False, mat=ant_m))
        # Protective ball tip on whip mast
        tx, ty, tz = whip_pts[-1]
        parts.append(mk_cyl(f"ra_whip_tip_{s}", 0.72, 0.72, 1.8, axis="y", segs=12, xform=[("t", tx, ty + 0.6, tz)], mat=ant_m, bevel=0.35))

    return join_parts("ztz99a_roof_armaments", parts)


# =============================================================================
# SUITE 3 BUILDERS — `ztz99a_v3_interior_power` (8 Solid GLB Parts — Cutaway Star!)
# =============================================================================
def build_ztz99a_autoloader_carousel(mats) -> bpy.types.Object:
    """THE CUTAWAY STAR: 22-Cassette Floor Carousel Autoloader w/ radial 125mm APFSDS darts + brass-stub propellant charges!"""
    parts = []
    car = mats["I_CarouselSteel"]
    chr_m = mats["I_MachinedChrome"]
    sabot = mats["I_SabotDark"]
    prop = mats["I_PropellantAmber"]
    brass = mats["I_BrassStub"]

    # Armored circular conveyor outer tub wall (64-seg smooth ring!) + turntable floor + central servo drive hub
    parts.append(mk_hollow_tube("ac_tub", 91.0, 85.0, -14.0, 14.0, axis="y", segs=64, bevel=0.6, mat=car))
    parts.append(mk_hollow_tube("ac_flr", 90.0, 22.0, -16.0, -11.0, axis="y", segs=48, bevel=0.4, mat=car))
    parts.append(mk_cyl("ac_hub", 21.0, 23.0, 22.0, axis="y", segs=36, xform=[("t", 0, -4, 0)], mat=car, bevel=0.8))
    parts.append(mk_cyl("ac_cap", 13.0, 13.0, 8.0, axis="y", segs=28, xform=[("t", 0, 10, 0)], mat=chr_m, bevel=0.5))

    # 22 radial dual-tier 125mm ammunition cassettes!
    for i in range(CAROUSEL_STATIONS):
        a = (i / CAROUSEL_STATIONS) * math.pi * 2.0
        cos_a = math.cos(a)
        sin_a = math.sin(a)
        r_mid = 55.0

        # Lower tier: 125mm DTC10-125 APFSDS sabot + gleaming tungsten penetrator dart tip!
        parts.append(mk_cyl(
            f"ac_sab_{i}", 4.6, 5.2, 34.0, axis="x", segs=18,
            xform=[("ry", a), ("t", cos_a * (r_mid + 6.0), -5.5, -sin_a * (r_mid + 6.0))],
            mat=sabot, bevel=0.35,
        ))
        parts.append(mk_cyl(
            f"ac_pen_{i}", 1.5, 2.2, 22.0, axis="x", segs=14,
            xform=[("ry", a), ("t", cos_a * (r_mid - 16.0), -5.5, -sin_a * (r_mid - 16.0))],
            mat=chr_m, bevel=0.25,
        ))
        # Upper tier: warm amber semi-combustible propellant charge + shining C26000 brass stub base!
        parts.append(mk_cyl(
            f"ac_chg_{i}", 5.4, 5.4, 38.0, axis="x", segs=18,
            xform=[("ry", a), ("t", cos_a * (r_mid - 4.0), 7.5, -sin_a * (r_mid - 4.0))],
            mat=prop, bevel=0.35,
        ))
        parts.append(mk_cyl(
            f"ac_stb_{i}", 5.8, 5.8, 7.5, axis="x", segs=18,
            xform=[("ry", a), ("t", cos_a * (r_mid + 19.0), 7.5, -sin_a * (r_mid + 19.0))],
            mat=brass, bevel=0.35,
        ))

    return join_parts("ztz99a_autoloader_carousel", parts)


def build_ztz99a_loading_tray(mats) -> bpy.types.Object:
    """Articulated Vertical Cassette Elevator Hoist Arm lifting a gleaming 2-piece 125mm APFSDS round up +68 cm!"""
    parts = []
    car = mats["I_CarouselSteel"]
    chr_m = mats["I_MachinedChrome"]
    sabot = mats["I_SabotDark"]
    prop = mats["I_PropellantAmber"]
    brass = mats["I_BrassStub"]

    for s in (-1, 1):
        parts.append(mk_box(f"lt_arm_{s}", 10, 52, 5.5, [("t", -24, 10, s * 14)], chr_m, bevel=0.5))
        parts.append(mk_box(f"lt_rail_{s}", 58, 5, 4.5, [("t", 4, -8, s * 11)], car, bevel=0.4))
    parts.append(mk_box("lt_tray1", 66, 4.5, 22, [("t", 4, -14, 0)], car, bevel=0.5))
    parts.append(mk_box("lt_tray2", 66, 3.5, 22, [("t", 4, 2, 0)], car, bevel=0.4))

    # Staged lower 125mm DTC10-125 APFSDS sabot + long tungsten penetrator dart (+X nose!)
    parts.append(mk_cyl("lt_sab", 5.2, 5.4, 34.0, axis="x", segs=28, xform=[("t", -4, -6, 0)], mat=sabot, bevel=0.4))
    parts.append(mk_cyl("lt_pen", 1.5, 2.2, 34.0, axis="x", segs=24, xform=[("t", 21, -6, 0)], mat=chr_m, bevel=0.3))
    # Staged upper semi-combustible propellant charge + gleaming C26000 brass stub base!
    parts.append(mk_cyl("lt_chg", 5.8, 5.8, 42.0, axis="x", segs=28, xform=[("t", 6, 10, 0)], mat=prop, bevel=0.4))
    parts.append(mk_cyl("lt_stb", 6.2, 6.2, 8.5, axis="x", segs=28, xform=[("t", -18, 10, 0)], mat=brass, bevel=0.4))

    return join_parts("ztz99a_loading_tray", parts)


def build_ztz99a_rammer_chain(mats) -> bpy.types.Object:
    parts = []
    car = mats["I_CarouselSteel"]
    chr_m = mats["I_MachinedChrome"]
    brass = mats["I_BrassStub"]

    parts.append(mk_box("rm_box", 54, 16, 22, [("t", -4, 0, 0)], car, bevel=0.8))
    parts.append(mk_cyl("rm_drum", 7.5, 7.5, 26.0, axis="z", segs=28, xform=[("t", -18, 0, 0)], mat=chr_m, bevel=0.5))
    for i in range(6):
        parts.append(mk_box(f"rm_lk_{i}", 8.2, 7.5, 11.0, [("t", -12 + i * 8.5, 0, 0)], chr_m, bevel=0.45))
    parts.append(mk_cyl("rm_head", 6.8, 7.2, 7.5, axis="x", segs=28, xform=[("t", 29, 0, 0)], mat=brass, bevel=0.5))

    return join_parts("ztz99a_rammer_chain", parts)


def build_ztz99a_stub_ejector(mats) -> bpy.types.Object:
    parts = []
    camo = mats["I_HatchCamo"]
    chr_m = mats["I_MachinedChrome"]
    brass = mats["I_BrassStub"]

    parts.append(mk_box("se_lid", 34, 6.5, 32, [("t", 0, 8, 0)], camo, bevel=0.7))
    parts.append(mk_cyl("se_hng", 3.2, 3.2, 34.0, axis="z", segs=20, xform=[("t", -17, 7, 0)], mat=chr_m, bevel=0.3))
    for s in (-1, 1):
        parts.append(mk_box(f"se_arm_{s}", 8, 18, 4.5, [("t", 6, -3, s * 11)], chr_m, bevel=0.4))
    parts.append(mk_box("se_fork", 22, 4.5, 24, [("t", 6, -10, 0)], brass, bevel=0.45))

    return join_parts("ztz99a_stub_ejector", parts)


def build_ztz99a_v12_engine(mats) -> bpy.types.Object:
    """1,500 HP 150HB 12-Cylinder Twin-Turbo Liquid-Cooled Diesel Engine w/ twin silver turbos, yellow caps & red oil filters!"""
    parts = []
    blk = mats["I_EngineBlock"]
    trb = mats["I_TurboSilver"]
    plate = mats["I_EngineDataPlate"]
    exh = mats["I_ExhaustBronze"]
    yel = mats["I_SafetyYellow"]
    red = mats["I_FilterRed"]
    car = mats["I_CarouselSteel"]

    # Massive cast V12 crankcase & oil sump
    parts.append(mk_box("v12_sump", 114, 34, 88, [("t", 0, -14, 0)], blk, bevel=1.5))

    # 60° V-banks x 6 individual cylinder heads, valve covers & bronze exhaust headers
    for s in (-1, 1):
        parts.append(mk_box(f"v12_bk_{s}", 106, 22, 30, [("rx", s * 0.48), ("t", 0, 8, s * 36)], blk, bevel=1.0))
        for c in range(6):
            cx = -42.0 + c * 16.8
            parts.append(mk_box(f"v12_hd_{s}_{c}", 13.5, 9.0, 24.0, [("rx", s * 0.48), ("t", cx, 20, s * 42)], trb, bevel=0.7))
            parts.append(mk_cyl(f"v12_ex_{s}_{c}", 4.2, 4.2, 16.0, axis="z", segs=18, xform=[("t", cx, 10, s * 58)], mat=exh, bevel=0.3))
        parts.append(mk_cyl(f"v12_man_{s}", 6.5, 6.5, 108.0, axis="x", segs=24, xform=[("t", 0, 10, s * 66)], mat=exh, bevel=0.5))

    # Twin gleaming silver-aluminum turbocharger snails + bronze turbine housings
    for s in (-1, 1):
        parts.append(mk_cyl(f"v12_tc_{s}", 12.5, 12.5, 20.0, axis="x", segs=36, xform=[("t", -34, 20, s * 22)], mat=trb, bevel=0.9))
        parts.append(mk_cyl(f"v12_tt_{s}", 9.5, 9.5, 14.0, axis="x", segs=32, xform=[("t", -48, 20, s * 22)], mat=exh, bevel=0.7))

    # Top ribbed charge-air intercooler plenum + brushed aluminum Hero spec data plate (`NORINCO 150HB-2 V12`)
    parts.append(mk_box("v12_ic", 62, 13, 34, [("t", 16, 22.5, 0)], trb, bevel=0.9))
    parts.append(mk_box("v12_plate", 52, 2.0, 26, [("t", 16, 29.8, 0)], plate, bevel=0.25))

    # Strictly firewalled Safety-Yellow oil/coolant maintenance caps & Red spin-on oil filter canisters!
    parts.append(mk_cyl("v12_cap1", 5.2, 5.2, 6.0, axis="y", segs=24, xform=[("t", 48, 28, 16)], mat=yel, bevel=0.4))
    parts.append(mk_cyl("v12_cap2", 5.2, 5.2, 6.0, axis="y", segs=24, xform=[("t", 48, 28, -16)], mat=yel, bevel=0.4))
    parts.append(mk_cyl("v12_flt1", 5.5, 5.5, 16.0, axis="y", segs=24, xform=[("t", 48, 4, 46)], mat=red, bevel=0.4))
    parts.append(mk_cyl("v12_flt2", 5.5, 5.5, 16.0, axis="y", segs=24, xform=[("t", 48, 4, -46)], mat=red, bevel=0.4))

    # Rear flywheel coupling drum
    parts.append(mk_cyl("v12_fw", 22.0, 22.0, 10.0, axis="x", segs=36, xform=[("t", -56, -10, 0)], mat=car, bevel=0.7))

    return join_parts("ztz99a_v12_engine", parts)


def build_ztz99a_transmission(mats) -> bpy.types.Object:
    parts = []
    blk = mats["I_EngineBlock"]
    trb = mats["I_TurboSilver"]
    rad = mats["I_RadiatorCopper"]

    parts.append(mk_box("tx_case", 56, 36, 126, [("t", 4, -10, 0)], blk, bevel=1.4))
    for s in (-1, 1):
        parts.append(mk_cyl(f"tx_fd_{s}", 16.0, 16.0, 26.0, axis="z", segs=32, xform=[("t", -8, -16, s * 74)], mat=trb, bevel=0.9))
        parts.append(mk_box(f"tx_rad_{s}", 64, 18, 56, [("t", 0, 22, s * 46)], rad, bevel=0.9))
        parts.append(mk_cyl(f"tx_fan_{s}", 20.0, 20.0, 6.0, axis="y", segs=36, xform=[("t", 0, 32, s * 46)], mat=trb, bevel=0.5))

    return join_parts("ztz99a_transmission", parts)


def build_ztz99a_torsion_bars(mats) -> bpy.types.Object:
    parts = []
    ts = mats["I_TorsionSteel"]
    chr_m = mats["I_MachinedChrome"]
    car = mats["I_CarouselSteel"]

    for i, wx in enumerate(ROAD_WHEEL_XS):
        lx = wx - 16.0
        parts.append(mk_cyl(f"tb_l_{i}", 3.2, 3.2, 212.0, axis="z", segs=20, xform=[("t", lx + 5.5, -1.5, 0)], mat=ts, bevel=0.3))
        parts.append(mk_cyl(f"tb_r_{i}", 3.2, 3.2, 212.0, axis="z", segs=20, xform=[("t", lx - 5.5, -1.5, 0)], mat=chr_m, bevel=0.3))
        for s in (-1, 1):
            parts.append(mk_box(f"tb_anc_{i}_{s}", 16, 11, 12, [("t", lx, -1.5, s * 108)], car, bevel=0.5))
        if i in (0, 1, 5):
            for s in (-1, 1):
                parts.append(mk_cyl(f"tb_shk_{i}_{s}", 5.5, 5.5, 28.0, axis="x", segs=24, xform=[("t", lx - 14, 4, s * 114)], mat=chr_m, bevel=0.4))

    return join_parts("ztz99a_torsion_bars", parts)


def build_ztz99a_crew_stations(mats) -> bpy.types.Object:
    parts = []
    seat = mats["I_CrewSeat"]
    car = mats["I_CarouselSteel"]
    mfd = mats["I_MfdCyan"]

    # 1. Front-Center Driver's Station (yoke wheel, seat & glowing digital dash MFD!)
    parts.append(mk_box("cs_ds", 34, 10, 42, [("t", 98, -42, 0)], seat, bevel=0.9))
    parts.append(mk_box("cs_db", 10, 42, 40, [("rz", 0.28), ("t", 80, -24, 0)], seat, bevel=0.9))
    parts.append(mk_cyl("cs_col", 3.2, 3.2, 24.0, axis="x", segs=18, xform=[("t", 128, -22, 0)], mat=car, bevel=0.3))
    parts.append(mk_box("cs_yoke", 5, 16, 32, [("t", 118, -18, 0)], seat, bevel=0.6))
    parts.append(mk_box("cs_dash", 14, 14, 46, [("t", 138, -14, 0)], car, bevel=0.6))
    parts.append(mk_box("cs_dmfd", 2.5, 10, 36, [("t", 130.5, -14, 0)], mfd, bevel=0.0))

    # 2. Left Turret Gunner's Station + Digital Ballistic Computer MFD
    parts.append(mk_box("cs_gs", 34, 9, 36, [("t", -86, 4, -58)], seat, bevel=0.9))
    parts.append(mk_box("cs_gb", 9, 38, 36, [("t", -104, 24, -58)], seat, bevel=0.9))
    parts.append(mk_box("cs_gbox", 18, 22, 32, [("t", -46, 30, -58)], car, bevel=0.7))
    parts.append(mk_box("cs_gmfd", 2.5, 16, 26, [("t", -55.5, 30, -58)], mfd, bevel=0.0))

    # 3. Right Turret Commander's Station + Panoramic CITV Tactical Display MFD
    parts.append(mk_box("cs_cs", 34, 9, 36, [("t", -88, 6, 58)], seat, bevel=0.9))
    parts.append(mk_box("cs_cb", 9, 38, 36, [("t", -106, 26, 58)], seat, bevel=0.9))
    parts.append(mk_box("cs_cbox", 18, 22, 32, [("t", -48, 34, 58)], car, bevel=0.7))
    parts.append(mk_box("cs_cmfd", 2.5, 16, 26, [("t", -57.5, 34, 58)], mfd, bevel=0.0))

    return join_parts("ztz99a_crew_stations", parts)


# =============================================================================
# UV Unwrapping & Strict >= 50 px Material Firewall Packing (All 3 Suites)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    select_face_fn=None, skip_face_fn=None,
):
    active_objs = []
    for o in objs:
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


def unwrap_armor_hull_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "ztz99a_side_skirts" or mat_name != "H_HeroSkirtPlate":
            return None
        c = face.calc_center_median()
        nz = -face.normal.y
        tz = -c.y
        if nz > 0.88 and tz > 173.0:
            return "sk_right"
        if nz < -0.88 and tz < -173.0:
            return "sk_left"
        return None

    grp_hull = [o for o in objs if o.name in {"ztz99a_hull_armor", "ztz99a_glacis_era", "ztz99a_rear_deck", "ztz99a_turret_ring"}]
    grp_gear = [o for o in objs if o.name in {"ztz99a_side_skirts", "ztz99a_road_wheels"}]
    # Note: `ztz99a_tracks_left` & `ztz99a_tracks_right` carry deterministic non-overlapping 22x8 grid UVs in [0.010, 0.990] x [0.010, 0.210]!

    _smart_unwrap_and_pack_rect(grp_hull, 0.010, 0.990, 0.425, 0.785)
    _smart_unwrap_and_pack_rect(grp_gear, 0.010, 0.990, 0.225, 0.410, skip_face_fn=lambda n, f, m: classify_hero(n, f, m) is not None)

    # Project exact 1:1 non-mirrored Hero planar UVs onto front armored side skirt panels (+Z and -Z!)
    hits = {"sk_right": 0, "sk_left": 0}
    sk_obj = next(o for o in objs if o.name == "ztz99a_side_skirts")
    bm = bmesh.new()
    bm.from_mesh(sk_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in sk_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(sk_obj.name, f, mname)
        if tag is None:
            continue
        hits[tag] += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            # Front panel centered at X=290 (span [237, 343]), Y=2 (span [-29, +33])
            yn = max(0.0, min(1.0, (ty - (-29.0)) / 62.0))
            if tag == "sk_right":
                # Right flank (+Z): -X -> left, +X -> right (reads upright left-to-right!)
                xn = max(0.0, min(1.0, (tx - 237.0) / 106.0))
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.805 + yn * 0.180)
            else:
                # Left flank (-Z): +X -> left, -X -> right (reads upright left-to-right!)
                xn = max(0.0, min(1.0, (343.0 - tx) / 106.0))
                loop[uv_layer].uv = (0.515 + xn * 0.470, 0.805 + yn * 0.180)
    bm.to_mesh(sk_obj.data)
    bm.free()
    print(f"  [HERO-UV] armor_hull skirt hits: {hits}")
    assert all(v > 0 for v in hits.values()), f"Missing armor_hull hero faces: {hits}"


def unwrap_turret_gun_atlas(objs: list[bpy.types.Object]):
    def classify_hero(obj_name: str, face, mat_name: str) -> str | None:
        if obj_name != "ztz99a_turret_shell" or mat_name != "T_HeroTurretPlate":
            return None
        c = face.calc_center_median()
        nz = -face.normal.y
        tz = -c.y
        if nz > 0.88 and tz > 125.0:
            return "ts_right"
        if nz < -0.88 and tz < -125.0:
            return "ts_left"
        return None

    FIREWALL_MATS = {
        "T_OpticsEmerald", "T_OpticsRuby", "T_ChromeRod", "T_BreechSteel",
        "T_BrassAccent", "T_CanvasTarp", "T_CrateOlive",
    }

    def is_special(n, f, m) -> bool:
        return (classify_hero(n, f, m) is not None) or (m in FIREWALL_MATS)

    # Strict >= 110 px Material Firewalls at 4K:
    #  - Deep Obsidian-Emerald & Ruby-IR Optical Lenses (CITV / Gunner Thermal / JD-3 Laser / Cupola Periscopes!)
    #  - Chrome Recoil Rods / Breech Steel
    #  - Brass Breech Solenoid Accent
    #  - Stowed Canvas Tarp & Steel Ammo Crate inside Rear Bustle Basket
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.215, 0.610, 0.765, select_face_fn=lambda _n, _f, m: m in {"T_OpticsEmerald", "T_OpticsRuby"})
    _smart_unwrap_and_pack_rect(objs, 0.255, 0.520, 0.610, 0.765, select_face_fn=lambda _n, _f, m: m in {"T_ChromeRod", "T_BreechSteel"})
    _smart_unwrap_and_pack_rect(objs, 0.560, 0.720, 0.610, 0.765, select_face_fn=lambda _n, _f, m: m == "T_BrassAccent")
    _smart_unwrap_and_pack_rect(objs, 0.755, 0.985, 0.610, 0.765, select_face_fn=lambda _n, _f, m: m in {"T_CanvasTarp", "T_CrateOlive"})

    grp_turret = [o for o in objs if o.name in {"ztz99a_turret_shell", "ztz99a_era_wedges"}]
    grp_gun = [o for o in objs if o not in grp_turret]
    _smart_unwrap_and_pack_rect(grp_turret, 0.010, 0.990, 0.305, 0.578, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_gun,    0.010, 0.990, 0.010, 0.280, skip_face_fn=is_special)

    # Project exact 1:1 non-mirrored planar Hero UVs onto unobstructed turret bustle side plates (`ZTZ-99A / 108`)
    hits = {"ts_right": 0, "ts_left": 0}
    ts_obj = next(o for o in objs if o.name == "ztz99a_turret_shell")
    bm = bmesh.new()
    bm.from_mesh(ts_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in ts_obj.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        tag = classify_hero(ts_obj.name, f, mname)
        if tag is None:
            continue
        hits[tag] += 1
        for loop in f.loops:
            tx, ty = loop.vert.co.x, loop.vert.co.z
            # Plate centered at X=-121 (span [-160, -82]), Y=+4 (span [-14, +22])
            yn = max(0.0, min(1.0, (ty - (-14.0)) / 36.0))
            if tag == "ts_right":
                xn = max(0.0, min(1.0, (tx - (-160.0)) / 78.0))
                loop[uv_layer].uv = (0.015 + xn * 0.470, 0.805 + yn * 0.180)
            else:
                xn = max(0.0, min(1.0, (-82.0 - tx) / 78.0))
                loop[uv_layer].uv = (0.515 + xn * 0.470, 0.805 + yn * 0.180)
    bm.to_mesh(ts_obj.data)
    bm.free()
    print(f"  [HERO-UV] turret_gun bustle plate hits: {hits}")
    assert all(v > 0 for v in hits.values()), f"Missing turret_gun hero faces: {hits}"


def unwrap_interior_power_atlas(objs: list[bpy.types.Object]):
    def is_mfd_face(obj_name: str, face, mat_name: str) -> bool:
        return obj_name == "ztz99a_crew_stations" and mat_name == "I_MfdCyan" and face.normal.x < -0.85

    def is_eng_plate(obj_name: str, face, mat_name: str) -> bool:
        return obj_name == "ztz99a_v12_engine" and mat_name == "I_EngineDataPlate" and face.normal.z > 0.85

    FIREWALL_MATS = {"I_MfdCyan", "I_EngineDataPlate", "I_BrassStub", "I_PropellantAmber", "I_SafetyYellow", "I_FilterRed", "I_RadiatorCopper"}

    def is_special(n, f, m) -> bool:
        return is_mfd_face(n, f, m) or is_eng_plate(n, f, m) or (m in FIREWALL_MATS)

    # Strict >= 55 px Firewalls for Brass Stubs, Amber Propellant, Safety-Yellow Caps, Red Filters & Copper Radiators!
    _smart_unwrap_and_pack_rect(objs, 0.595, 0.780, 0.805, 0.985, select_face_fn=lambda _n, _f, m: m == "I_BrassStub")
    _smart_unwrap_and_pack_rect(objs, 0.810, 0.985, 0.805, 0.985, select_face_fn=lambda _n, _f, m: m == "I_PropellantAmber")
    _smart_unwrap_and_pack_rect(objs, 0.015, 0.175, 0.625, 0.755, select_face_fn=lambda _n, _f, m: m == "I_SafetyYellow")
    _smart_unwrap_and_pack_rect(objs, 0.210, 0.370, 0.625, 0.755, select_face_fn=lambda _n, _f, m: m == "I_FilterRed")
    _smart_unwrap_and_pack_rect(objs, 0.405, 0.680, 0.625, 0.755, select_face_fn=lambda _n, _f, m: m == "I_RadiatorCopper")
    _smart_unwrap_and_pack_rect(
        objs, 0.715, 0.985, 0.625, 0.755,
        select_face_fn=lambda n, f, m: (m in {"I_MfdCyan", "I_EngineDataPlate"}) and (not is_mfd_face(n, f, m)) and (not is_eng_plate(n, f, m)),
    )

    grp_loader = [o for o in objs if o.name in {"ztz99a_autoloader_carousel", "ztz99a_loading_tray", "ztz99a_rammer_chain", "ztz99a_stub_ejector"}]
    grp_power = [o for o in objs if o not in grp_loader]
    _smart_unwrap_and_pack_rect(grp_loader, 0.010, 0.990, 0.315, 0.595, skip_face_fn=is_special)
    _smart_unwrap_and_pack_rect(grp_power,  0.010, 0.990, 0.010, 0.288, skip_face_fn=is_special)

    # Project 3 strictly disjoint landscape Hero MFD screens stacked vertically inside [0.015, 0.245] x [0.785, 0.986]
    cs_obj = next(o for o in objs if o.name == "ztz99a_crew_stations")
    bm = bmesh.new()
    bm.from_mesh(cs_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in cs_obj.data.materials]
    mfd_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_mfd_face(cs_obj.name, f, mname):
            continue
        c = f.calc_center_median()
        tx_c, tz_c = c.x, -c.y
        if tx_c > 0.0:
            v_lo, v_hi = 0.785, 0.844
        elif tz_c < 0.0:
            v_lo, v_hi = 0.856, 0.915
        else:
            v_lo, v_hi = 0.927, 0.986
        mfd_hits += 1
        ys = [l.vert.co.z for l in f.loops]
        zs = [-l.vert.co.y for l in f.loops]
        ymin, ymax = min(ys), max(ys)
        zmin, zmax = min(zs), max(zs)
        for loop in f.loops:
            ty, tz = loop.vert.co.z, -loop.vert.co.y
            zn = (tz - zmin) / max(zmax - zmin, 1e-4)
            yn = (ty - ymin) / max(ymax - ymin, 1e-4)
            loop[uv_layer].uv = (0.015 + zn * 0.230, v_lo + yn * (v_hi - v_lo))
    bm.to_mesh(cs_obj.data)
    bm.free()

    # Project Hero 150HB V12 Top Data Plate [0.275, 0.565] x [0.805, 0.985]
    v12_obj = next(o for o in objs if o.name == "ztz99a_v12_engine")
    bm = bmesh.new()
    bm.from_mesh(v12_obj.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in v12_obj.data.materials]
    eng_hits = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_eng_plate(v12_obj.name, f, mname):
            continue
        eng_hits += 1
        for loop in f.loops:
            tx, tz = loop.vert.co.x, -loop.vert.co.y
            xn = max(0.0, min(1.0, (tx - (-10.0)) / 52.0))
            zn = max(0.0, min(1.0, (13.0 - tz) / 26.0))
            loop[uv_layer].uv = (0.275 + xn * 0.290, 0.805 + zn * 0.180)
    bm.to_mesh(v12_obj.data)
    bm.free()
    print(f"  [HERO-UV] interior_power mfd_hits={mfd_hits}, v12_plate_hits={eng_hits}")
    assert mfd_hits > 0 and eng_hits > 0, f"Missing interior_power hero faces: mfd={mfd_hits}, v12={eng_hits}"


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


def _save_image_npy(img: bpy.types.Image, filepath: Path, scalar: bool = False):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    if scalar:
        ch0 = buf.reshape((h, w, 4))[::-1, :, 0].copy()
        np.save(filepath, ch0)
    else:
        rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
        np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]):
    for i, o in enumerate(all_objs):
        o.location = (i * 1600.0, 0.0, 0.0)
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
            o.location = (0.0, 2400.0, 0.0)


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
    atlas_size: int = ATLAS_SIZE_4K,
    margin_px: int = 10,
    ao_samples: int = BAKE_AO_SAMPLES_4K,
    normal_samples: int = BAKE_NORMAL_SAMPLES_4K,
):
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False, extra_objs_override=None, scalar: bool = False,
    ):
        t0 = time.time()
        img = bpy.data.images.new(f"{prefix}_{tag}", atlas_size, atlas_size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        img.generated_color = fill_color
        arr = np.empty((atlas_size * atlas_size, 4), dtype=np.float32)
        arr[:] = fill_color
        img.pixels.foreach_set(arr.ravel())
        del arr

        nodes = _attach_bake_image_node(mats_set, img)
        scene.cycles.samples = samples
        objs_to_bake = extra_objs_override if extra_objs_override is not None else target_objs
        select_only(objs_to_bake, objs_to_bake[0])

        kwargs = dict(type=bake_type, margin=margin_px, margin_type="EXTEND", use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy", scalar=scalar)
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag} ({atlas_size}px, {bake_type}, {samples} spp, m={margin_px}) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=(0.06, 0.08, 0.05, 1.0), scalar=False)
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.55, 0.55, 0.55, 1.0), scalar=True)
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0), scalar=True)
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=normal_samples, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True, scalar=False)

    scene.world.light_settings.distance = 30.0
    run_bake("ao_self", "AO", samples=ao_samples, fill_color=(1.0, 1.0, 1.0, 1.0), scalar=True)

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    if ext_targets:
        scene.world.light_settings.distance = 46.0
        run_bake("ao_ext", "AO", samples=ao_samples, fill_color=(1.0, 1.0, 1.0, 1.0), extra_objs_override=ext_targets, scalar=True)

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
        img_m = bpy.data.images.new(f"{prefix}_ext_mask", atlas_size, atlas_size, alpha=False, float_buffer=True)
        img_m.colorspace_settings.name = "Non-Color"
        arr = np.zeros((atlas_size * atlas_size, 4), dtype=np.float32)
        arr[:, 3] = 1.0
        img_m.pixels.foreach_set(arr.ravel())
        del arr
        nodes_m = _attach_bake_image_node({white_mat}, img_m)
        scene.cycles.samples = 1
        select_only(ext_targets, ext_targets[0])
        bpy.ops.object.bake(type="EMIT", margin=margin_px, margin_type="EXTEND", use_clear=False)
        _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy", scalar=True)
        _remove_bake_image_nodes(nodes_m)
        bpy.data.images.remove(img_m)
        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    else:
        np.save(tmp_dir / f"{prefix}_ao_ext.npy", np.ones((atlas_size, atlas_size), dtype=np.float32))
        np.save(tmp_dir / f"{prefix}_ext_mask.npy", np.zeros((atlas_size, atlas_size), dtype=np.float32))


# =============================================================================
# Strict Manifold, Volume & Identity-Reset Draco glTF 2.0 Verification & Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]):
    total_tris = 0
    bad_parts = []
    global_min_y = 1e9
    global_max_y = -1e9
    for o in all_objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        non_man = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        vol = bm.calc_volume(signed=True)
        tris = sum(max(1, len(f.verts) - 2) for f in bm.faces)
        loc_min_y = min(v.co.z for v in bm.verts)
        loc_max_y = max(v.co.z for v in bm.verts)
        world_min_y = ASSEMBLED_POS[o.name][1] + loc_min_y
        world_max_y = ASSEMBLED_POS[o.name][1] + loc_max_y
        global_min_y = min(global_min_y, world_min_y)
        global_max_y = max(global_max_y, world_max_y)
        total_tris += tris
        bm.free()
        status = "OK" if (non_man == 0 and vol > 0) else "FAIL"
        print(f"  [{status}] {o.name:28s} tris={tris:6d} non_man={non_man:2d} vol={vol:12.1f} worldY=[{world_min_y:7.2f}, {world_max_y:6.2f}]")
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if o.name in {"ztz99a_tracks_left", "ztz99a_tracks_right"}:
            assert abs(world_min_y - (-120.0)) < 0.02, f"{o.name} world_min_y={world_min_y:.3f} != -120.00"
    print(f"[VERIFY] {len(all_objs)} parts | total_tris={total_tris:,} | assembled worldY=[{global_min_y:.2f}, {global_max_y:.2f}]")
    assert abs(global_min_y - (-120.0)) < 0.02, f"Assembled ground contact drifted: world_min_y={global_min_y:.3f} != -120.00"
    assert not bad_parts, f"Manifold/volume failure on parts: {bad_parts}"


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
        # Suite 1: ztz99a_v3_armor_hull (8 parts — 4096x4096)
        "ztz99a_hull_armor":          lambda m: build_ztz99a_hull_armor(m),
        "ztz99a_glacis_era":          lambda m: build_ztz99a_glacis_era(m),
        "ztz99a_side_skirts":         lambda m: build_ztz99a_side_skirts(m),
        "ztz99a_road_wheels":         lambda m: build_ztz99a_road_wheels(m),
        "ztz99a_tracks_left":         lambda m: build_ztz99a_track_belt("ztz99a_tracks_left", m, side_slot_offset=0),
        "ztz99a_tracks_right":        lambda m: build_ztz99a_track_belt("ztz99a_tracks_right", m, side_slot_offset=86),
        "ztz99a_rear_deck":           lambda m: build_ztz99a_rear_deck(m),
        "ztz99a_turret_ring":         lambda m: build_ztz99a_turret_ring(m),
        # Suite 2: ztz99a_v3_turret_gun (8 parts — 4096x4096)
        "ztz99a_turret_shell":        lambda m: build_ztz99a_turret_shell(m),
        "ztz99a_era_wedges":          lambda m: build_ztz99a_era_wedges(m),
        "ztz99a_main_gun":            lambda m: build_ztz99a_main_gun(m),
        "ztz99a_gun_cradle":          lambda m: build_ztz99a_gun_cradle(m),
        "ztz99a_recoil_cylinders":    lambda m: build_ztz99a_recoil_cylinders(m),
        "ztz99a_breech_block":        lambda m: build_ztz99a_breech_block(m),
        "ztz99a_optics_citv":         lambda m: build_ztz99a_optics_citv(m),
        "ztz99a_roof_armaments":      lambda m: build_ztz99a_roof_armaments(m),
        # Suite 3: ztz99a_v3_interior_power (8 parts — 2048x2048)
        "ztz99a_autoloader_carousel": lambda m: build_ztz99a_autoloader_carousel(m),
        "ztz99a_loading_tray":        lambda m: build_ztz99a_loading_tray(m),
        "ztz99a_rammer_chain":        lambda m: build_ztz99a_rammer_chain(m),
        "ztz99a_stub_ejector":        lambda m: build_ztz99a_stub_ejector(m),
        "ztz99a_v12_engine":          lambda m: build_ztz99a_v12_engine(m),
        "ztz99a_transmission":        lambda m: build_ztz99a_transmission(m),
        "ztz99a_torsion_bars":        lambda m: build_ztz99a_torsion_bars(m),
        "ztz99a_crew_stations":       lambda m: build_ztz99a_crew_stations(m),
    }

    print("[BUILD] Sculpting all 24 solid PLA ZTZ-99A Main Battle Tank parts (1:1 scale, Plan B 4K + Plan C)...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    ah_objs = [built[pid] for pid in ARMOR_HULL_PARTS]
    tg_objs = [built[pid] for pid in TURRET_GUN_PARTS]
    ip_objs = [built[pid] for pid in INTERIOR_POWER_PARTS]
    all_objs = ah_objs + tg_objs + ip_objs

    print("[VERIFY] Checking manifoldness, outward normals, ground contact (-120.0 cm) & positive volumes...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 atlases: armor_hull 4K (8), turret_gun 4K (8), interior_power 2K (8)...")
    unwrap_armor_hull_atlas(ah_objs)
    unwrap_turret_gun_atlas(tg_objs)
    unwrap_interior_power_atlas(ip_objs)

    for label, group in (("armor_hull", ah_objs), ("turret_gun", tg_objs), ("interior_power", ip_objs)):
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
            assert 0.00005 < oa < 0.88, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:16s}: total_uv_area={tot_area:.4f} (strictly <= 0.98)")
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="ztz99a_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking ztz99a_v3_armor_hull (4096x4096, margin=10, 8 parts)...")
        bake_atlas_suite(
            "ah", ah_objs, all_objs, tmp_dir,
            atlas_size=ATLAS_SIZE_4K, margin_px=10,
            ao_samples=BAKE_AO_SAMPLES_4K, normal_samples=BAKE_NORMAL_SAMPLES_4K,
        )
        print("[CYCLES] Baking ztz99a_v3_turret_gun (4096x4096, margin=10, 8 parts)...")
        bake_atlas_suite(
            "tg", tg_objs, all_objs, tmp_dir,
            atlas_size=ATLAS_SIZE_4K, margin_px=10,
            ao_samples=BAKE_AO_SAMPLES_4K, normal_samples=BAKE_NORMAL_SAMPLES_4K,
        )
        print("[CYCLES] Baking ztz99a_v3_interior_power (2048x2048, margin=6, 8 parts)...")
        bake_atlas_suite(
            "ip", ip_objs, all_objs, tmp_dir,
            atlas_size=ATLAS_SIZE_2K, margin_px=6,
            ao_samples=BAKE_AO_SAMPLES_2K, normal_samples=BAKE_NORMAL_SAMPLES_2K,
        )

        # Export Draco GLB BEFORE --postprocess so adaptive WebP quality tuning sees exact GLB byte size!
        export_draco_glb(all_objs)

        print("[POST] Compositing 4K PLA stars, `99A-108` / `ZTZ-99A / 108` stencils, digital MFDs & adaptive ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR), str(MODELS_OUT)],
            check=True,
        )

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "ztz99a_v3_armor_hull_albedo.webp",
        TEX_OUT_DIR / "ztz99a_v3_armor_hull_normal.webp",
        TEX_OUT_DIR / "ztz99a_v3_armor_hull_roughness.webp",
        TEX_OUT_DIR / "ztz99a_v3_turret_gun_albedo.webp",
        TEX_OUT_DIR / "ztz99a_v3_turret_gun_normal.webp",
        TEX_OUT_DIR / "ztz99a_v3_turret_gun_roughness.webp",
        TEX_OUT_DIR / "ztz99a_v3_interior_power_albedo.webp",
        TEX_OUT_DIR / "ztz99a_v3_interior_power_normal.webp",
        TEX_OUT_DIR / "ztz99a_v3_interior_power_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== PLA ZTZ-99A MAIN BATTLE TANK (125MM ZPT-98 L/50) V3 PLAN B (4K) + PLAN C ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:48s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 11.80 MB / hard test <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 11.80, f"Asset budget exceeded: {total_mb:.2f} MB > 11.80 MB"


if __name__ == "__main__":
    main()
