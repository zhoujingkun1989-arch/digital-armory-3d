#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Soviet VSS Vintorez (6P29 · 9×39mm SP-5/SP-6)
=============================================================================================
MIT License — Digital Armory 3D (`WP-17`, BAY-21)

TsNIITochMash / Tula Arms Plant (`TOZ`) VSS "Vintorez" ("Thread Cutter") Integral Suppressed Sniper Rifle:
  - CNC-milled satin Soviet blued-steel receiver (`sRGB 0.21-0.27`, ZERO crushed black!) with integral
    left Warsaw Pact dovetail optic rail, Tula Arsenal `TOZ` star-in-triangle proof mark, crisp Cyrillic
    `ВСС «ВИНТОРЕЗ» · 9×39 · № 87412` rollmarks & solid welded closed-loop trigger guard
  - Full-length 414 mm cylindrical matte-blued integral expansion suppressor housing with rear locking
    collar, 100-400m tangent rear sight (`1 2 3 4`), welded hooded front post sight & plum-brown ribbed
    Bakelite-polymer slim lower forend
  - Iconic warm amber-honey Russian laminated birchwood skeleton thumbhole quick-detach buttstock with
    diagonal alternating plywood layers, steel vertical dovetail QD latch & grooved black rubber buttpad
  - Iconic Soviet NPZ PSO-1M2-1 4×24 illuminated side-mount sniper scope in grey-slate hammer-tone enamel
    with Cyrillic `ПСО-1М2-1 · 9×39`, calibrated `1..4` BDC elevation drum, integral left dovetail clamp,
    accordion rubber eyecup & strictly firewalled emerald-sapphire multi-coated lenses (`> 100 px` moat!)
  - Cutaway acoustic showpiece: 200 mm rifled 9×39mm barrel with 3 rows of radial gas-bleed venting ports
    + gleaming CNC brushed-stainless 6-stage slanted asymmetric diffuser baffle stack (`±28°` alternating)
  - Long-stroke gas piston bolt carrier, gleaming 6-lug cylindrical rotating bolt, coaxial firing pin,
    hammerless linear rear spring-driven firing striker, catch sear, curved trigger, AK-pattern right
    dust-shield safety lever, cross-bolt `1 / АВ` selector button & 10-round plum waffle polymer magazine
    with strictly firewalled Safety-Orange follower (`> 100 px` moat!), static steel mag spring & floorplate

Generates (strict ownership):
  - public/models/vss.glb (Draco-compressed glTF 2.0, exact 22 solid parts; skips ONLY the 2
    dynamically compressing GPU `aSpringParam` springs: `vss_recoil_spring`, `vss_striker_spring`)
  - public/textures/vss_v3_receiver_supp_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/vss_v3_wood_optic_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)
  - public/textures/vss_v3_metal_{albedo,normal,roughness}.webp         (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Option A: Cycles contact AO is baked with stationary exterior parts at assembledPos,
    then all 22 objects are reset to identity transform (0,0,0) before Draco glTF export.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_vss_photoreal.py
  (Pass `-- --preview` to also render 6 Cycles studio QA plates to `/tmp/vss_qa_*.png`.)
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
# MODE 2: System Python Post-Process (Tula TOZ Star-in-Triangle, Cyrillic
#         `ВСС «ВИНТОРЕЗ» · 9×39 · № 87412`, `ПСО-1М2-1 · 9×39`, 1..4 BDC &
#         Rear Sight Scales, Firewalled Lenses, RNM Normals & 5-Ch Packed ORM)
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

    FONT_CYR_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    FONT_CYR_SANS = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"
    FONT_CYR_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_CYR_BOLD, FONT_CYR_SANS, *FONT_FALLBACKS):
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

    def _bevel_mask(mask: np.ndarray, width_px: float = 1.6) -> np.ndarray:
        dist = ndimage.distance_transform_edt(mask > 0.30)
        return (np.clip(dist / max(width_px, 0.5), 0.0, 1.0) * (mask > 0.05)).astype(np.float32)

    def _paste_uv_band(
        target: np.ndarray,
        pil_l: Image.Image,
        u0: float,
        u1: float,
        v0: float,
        v1: float,
    ) -> None:
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

    def _draw_tula_toz_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Tula Arms Plant (ТОЗ) classic Soviet Star-inside-Triangle arsenal proof mark."""
        lw = max(3, int(round(r * 0.11)))
        # Upright triangle
        tri = [
            (cx, cy - r * 1.05),
            (cx - r * 0.96, cy + r * 0.72),
            (cx + r * 0.96, cy + r * 0.72),
        ]
        draw.polygon(tri, outline=255, width=lw)
        # 5-pointed Soviet star inside triangle
        star_pts = []
        r_out = r * 0.48
        r_in = r * 0.20
        scy = cy + r * 0.10
        for k in range(10):
            ang = -math.pi * 0.5 + k * math.pi / 5.0
            rr = r_out if k % 2 == 0 else r_in
            star_pts.append((cx + rr * math.cos(ang), scy + rr * math.sin(ang)))
        draw.polygon(star_pts, fill=255)

    def _draw_npz_emblem(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
        """Novosibirsk Instrument-Making Plant (НПЗ) hammer-and-sickle / optical prism crest."""
        lw = max(2, int(round(r * 0.12)))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=lw)
        # Optical prism triangle + central horizontal crosshair
        prism = [
            (cx, cy - r * 0.62),
            (cx - r * 0.56, cy + r * 0.46),
            (cx + r * 0.56, cy + r * 0.46),
        ]
        draw.polygon(prism, outline=255, width=lw)
        draw.line([(cx - r * 0.85, cy), (cx + r * 0.85, cy)], fill=255, width=max(2, lw - 1))

    # -------------------------------------------------------------------------
    # SUITE 1: vss_v3_receiver_supp (Tula Receiver Rollmarks, 400m Sight & Plum Forend)
    # -------------------------------------------------------------------------
    def process_receiver_supp_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "rs_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "rs_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "rs_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "rs_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "rs_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "rs_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "rs_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.55 + ao_ext * 0.45)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        engraving = np.zeros((h, w), dtype=np.float32)
        white_fill = np.zeros((h, w), dtype=np.float32)

        # --- 1) HERO RIGHT RECEIVER FLANK (+Z, X in [-12.2, +6.2], Y in [-2.10, +1.95]) ---
        # Mapped to u in [0.015, 0.985] (xNorm), v in [0.800, 0.985] (yNorm)
        # Note: Safety lever covers Y in [+0.28, +1.73] across X in [-9.6, +2.4], so lower band
        # Y in [-1.80, +0.05] is 100% unobstructed for razor-sharp Tula Cyrillic rollmarks!
        RW, RH = 3000, 660

        def rx_to_px(xw: float) -> float:
            return ((xw - (-12.2)) / 18.4) * RW

        def lx_to_px(xw: float) -> float:
            return (1.0 - (xw - (-12.2)) / 18.4) * RW

        def ry_to_px(yw: float) -> float:
            return (1.0 - (yw - (-2.10)) / 4.05) * RH

        right_img = Image.new("L", (RW, RH), 0)
        dr = ImageDraw.Draw(right_img)
        _draw_tula_toz_emblem(dr, rx_to_px(4.35), ry_to_px(-0.85), r=76)
        dr.text(
            (rx_to_px(-1.35), ry_to_px(-0.42)),
            "ВСС «ВИНТОРЕЗ»  ·  9×39",
            font=_load_font(FONT_CYR_BOLD, 90),
            fill=255,
            anchor="mm",
        )
        dr.text(
            (rx_to_px(-1.35), ry_to_px(-1.08)),
            "ТОЗ  1989   ·   № 87412   ·   6П29",
            font=_load_font(FONT_CYR_SANS, 60),
            fill=245,
            anchor="mm",
        )
        # Selector indicator stamps cleanly above/behind selector without colliding with pins
        dr.text(
            (rx_to_px(-10.15), ry_to_px(-0.95)),
            "ОД / АВ",
            font=_load_font(FONT_CYR_BOLD, 54),
            fill=250,
            anchor="mm",
        )
        # Safety markings at upper right front
        dr.text(
            (rx_to_px(4.35), ry_to_px(0.95)),
            "ПР",
            font=_load_font(FONT_CYR_BOLD, 56),
            fill=250,
            anchor="mm",
        )
        dr.text(
            (rx_to_px(4.35), ry_to_px(0.28)),
            "ОГ",
            font=_load_font(FONT_CYR_BOLD, 56),
            fill=250,
            anchor="mm",
        )
        _paste_uv_band(engraving, right_img, 0.015, 0.985, 0.800, 0.985)

        # --- 2) HERO LEFT RECEIVER FLANK (-Z, X in [-12.2, +6.2], Y in [-2.10, +1.95]) ---
        # Mapped to u in [0.015, 0.985] (1-xNorm), v in [0.605, 0.785] (yNorm)
        # Dovetail rail covers X in [-10.6, +0.4], Y in [-0.15, +1.35]; lower receiver pins sit at Y=-1.75!
        left_img = Image.new("L", (RW, RH), 0)
        dl = ImageDraw.Draw(left_img)
        _draw_tula_toz_emblem(dl, lx_to_px(3.55), ry_to_px(0.45), r=86)
        dl.text(
            (lx_to_px(3.55), ry_to_px(-0.92)),
            "ТОЗ  1989",
            font=_load_font(FONT_CYR_BOLD, 62),
            fill=255,
            anchor="mm",
        )
        dl.text(
            (lx_to_px(-4.75), ry_to_px(-0.92)),
            "ВСС «ВИНТОРЕЗ»  ·  9×39  ·  № 87412",
            font=_load_font(FONT_CYR_BOLD, 74),
            fill=255,
            anchor="mm",
        )
        _paste_uv_band(engraving, left_img, 0.015, 0.985, 0.605, 0.785)

        # --- 3) HERO 400m TANGENT REAR SIGHT LEAF (`1 · 2 · 3 · 4`) ---
        # Mapped to u in [0.020, 0.480], v in [0.460, 0.590]
        SW, SH = 1200, 320
        sight_img = Image.new("L", (SW, SH), 0)
        ds = ImageDraw.Draw(sight_img)
        f_num = _load_font(FONT_CYR_BOLD, 78)
        for idx_r, lbl in enumerate(("1", "2", "3", "4")):
            # Rear (-X) to front (+X)
            tx_px = int(170 + idx_r * 270)
            ds.line([(tx_px, 28), (tx_px, 118)], fill=255, width=7)
            ds.line([(tx_px, 202), (tx_px, 292)], fill=255, width=7)
            ds.text((tx_px, 160), lbl, font=f_num, fill=255, anchor="mm")
        _paste_uv_band(white_fill, sight_img, 0.020, 0.480, 0.460, 0.590)

        # Composite crisp silver-etched Soviet receiver rollmarks & bright white sight numerals
        eng_bev = _bevel_mask(engraving, width_px=1.6)
        wf_bev = _bevel_mask(white_fill, width_px=1.2)
        decal_h = -0.68 * eng_bev - 0.35 * wf_bev

        _mix(albedo, (0.78, 0.81, 0.85), engraving * 0.85)
        _mix(rgh, 0.34, engraving * 0.78)
        _mix(met, 0.92, engraving * 0.80)
        ao *= 1.0 - 0.14 * engraving

        _mix(albedo, (0.93, 0.94, 0.91), white_fill * 0.96)
        _mix(rgh, 0.36, white_fill * 0.90)
        _mix(met, 0.04, white_fill * 0.94)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.6)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.16, 0.92)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_receiver_supp_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_receiver_supp_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_receiver_supp_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vss_v3_receiver_supp_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 2: vss_v3_wood_optic (Russian Birch Laminate, PSO-1M2-1, Lenses & Orange Follower)
    # -------------------------------------------------------------------------
    def process_wood_optic_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "wo_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "wo_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "wo_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "wo_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "wo_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "wo_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "wo_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h

        white_ink = np.zeros((h, w), dtype=np.float32)

        # --- 1) PSO-1M2-1 LEFT FLANK MARKINGS (`ПСО-1М2-1 · 9×39` + NPZ Emblem) ---
        # Hero Band: u in [0.015, 0.640] (1-xNorm across X_loc in [-5.2, +16.2]), v in [0.835, 0.985]
        # Battery housing front edge sits at X_loc = +4.42 (x_px = 1211, y_px >= 274).
        # Shifting emblem & two Cyrillic lines forward (right edge <= 1030 px) gives >180 px (~1.8 cm) clean daylight!
        PW, PH = 2200, 420
        pl_img = Image.new("L", (PW, PH), 0)
        dpl = ImageDraw.Draw(pl_img)
        _draw_npz_emblem(dpl, 255, 188, r=66)
        dpl.text((715, 142), "ПСО-1М2-1  ·  9×39", font=_load_font(FONT_CYR_BOLD, 76), fill=255, anchor="mm")
        dpl.text((715, 228), "НПЗ  ·  4×24  ·  № 910482", font=_load_font(FONT_CYR_SANS, 50), fill=245, anchor="mm")
        _paste_uv_band(white_ink, pl_img, 0.015, 0.640, 0.835, 0.985)

        # --- 2) PSO-1M2-1 RIGHT FLANK MARKINGS (`ПСО-1М2-1 · СП-5 / СП-6`) ---
        # Hero Band: u in [0.015, 0.640] (xNorm across X_loc in [-5.2, +16.2]), v in [0.680, 0.820]
        # Place cleanly forward of right windage turret (X_loc = +0.3 -> x_px ~ 565), spanning [980..2020]!
        pr_img = Image.new("L", (PW, PH), 0)
        dpr = ImageDraw.Draw(pr_img)
        dpr.text((1460, 144), "ПСО-1М2-1  ·  4×24", font=_load_font(FONT_CYR_BOLD, 82), fill=255, anchor="mm")
        dpr.text((1460, 248), "СП-5 / СП-6  ·  100–400 м", font=_load_font(FONT_CYR_SANS, 56), fill=245, anchor="mm")
        _paste_uv_band(white_ink, pr_img, 0.015, 0.640, 0.680, 0.820)

        # --- 3) PSO-1M2-1 BDC ELEVATION DRUM (`1 .. 4` = 100–400m subsonic graduations) ---
        # Hero Band: u in [0.015, 0.440], v in [0.555, 0.665]
        TW, TH = 1600, 260
        tur_img = Image.new("L", (TW, TH), 0)
        dt = ImageDraw.Draw(tur_img)
        dt.line([(24, 224), (TW - 24, 224)], fill=255, width=4)
        f_bdc = _load_font(FONT_CYR_BOLD, 68)
        labels = ("1", "1.5", "2", "2.5", "3", "3.5", "4")
        for k in range(36):
            xk = int(32 + (k / 36.0) * (TW - 64))
            th_px = 58 if k % 5 == 0 else 28
            dt.line([(xk, 224 - th_px), (xk, 224)], fill=255, width=4 if k % 5 == 0 else 2)
        for idx_l, lbl in enumerate(labels):
            xl = int(110 + idx_l * ((TW - 220) / (len(labels) - 1)))
            dt.text((xl, 118), lbl, font=f_bdc, fill=255, anchor="mm")
        dt.text((TW // 2, 42), "ВВЕРХ / 9×39 СП-5 (×100 м)", font=_load_font(FONT_CYR_BOLD, 38), fill=245, anchor="mm")
        _paste_uv_band(white_ink, tur_img, 0.015, 0.440, 0.555, 0.665)

        # --- 4) STRICTLY FIREWALLED EMERALD-SAPPHIRE MULTI-COATED OPTICAL LENSES ---
        # Moat: u in [0.695, 0.985], v in [0.760, 0.985] (>110 px clear from all other UV zones!)
        # Objective Lens disk: center (0.785, 0.872), r = 0.082
        # Ocular Lens disk:    center (0.928, 0.872), r = 0.052
        lens_box = (u_grid >= 0.690) & (u_grid <= 0.990) & (v_grid >= 0.755) & (v_grid <= 0.990)
        albedo[lens_box] = (0.018, 0.072, 0.098)
        rgh[lens_box] = 0.05
        met[lens_box] = 0.14
        ao[lens_box] = 1.0
        nrm[lens_box] = (0.5, 0.5, 1.0)

        for cx_l, cy_l, r_l, u0_l, u1_l in (
            (0.785, 0.872, 0.082, 0.692, 0.872),
            (0.928, 0.872, 0.052, 0.873, 0.988),
        ):
            sub_m = (u_grid >= u0_l) & (u_grid <= u1_l) & (v_grid >= 0.758) & (v_grid <= 0.988)
            lu = (u_grid - cx_l) / r_l
            lv = (v_grid - cy_l) / r_l
            rad = np.hypot(lu, lv)
            # Soviet LZOS emerald-violet-sapphire optical broadband anti-reflective thin-film interference!
            coat_wave = 0.5 + 0.5 * np.cos(6.6 * rad * rad + 0.52 * lv - 0.38 * lu)
            violet_ring = _smoothstep(0.50, 0.86, rad) * (1.0 - _smoothstep(0.88, 1.16, rad))
            lens_rgb = (
                np.array((0.022, 0.115, 0.190), dtype=np.float32)
                + coat_wave[..., None] * np.array((0.028, 0.345, 0.175), dtype=np.float32)
                + violet_ring[..., None] * np.array((0.235, 0.068, 0.285), dtype=np.float32)
            )
            lens_rgb *= 1.0 - 0.44 * _smoothstep(0.80, 1.16, rad)[..., None]
            arc1 = (1.0 - _smoothstep(0.018, 0.055, np.abs(rad - 0.68))) * _smoothstep(0.10, 0.45, lv) * (1.0 - _smoothstep(-0.18, 0.25, lu))
            arc2 = (1.0 - _smoothstep(0.016, 0.048, np.abs(rad - 0.42))) * _smoothstep(-0.55, -0.20, lv) * _smoothstep(0.05, 0.42, lu)
            lens_rgb += arc1[..., None] * np.array((0.40, 0.88, 0.72), dtype=np.float32)
            lens_rgb += arc2[..., None] * np.array((0.46, 0.22, 0.68), dtype=np.float32)
            albedo[sub_m] = np.clip(lens_rgb[sub_m], 0.0, 1.0)

        # Composite PSO-1 white enamel Cyrillic inscriptions & BDC ticks
        ink_bev = _bevel_mask(white_ink, width_px=1.2)
        decal_h = -0.22 * ink_bev
        _mix(albedo, (0.93, 0.94, 0.91), white_ink * 0.96)
        _mix(rgh, 0.34, white_ink * 0.90)
        _mix(met, 0.04, white_ink * 0.95)
        ao *= 1.0 - 0.06 * white_ink

        decal_nrm = _height_to_normal_01(decal_h, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)
        nrm_final[lens_box] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.05, 0.94)
        met = np.clip(met, 0.00, 0.96)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_wood_optic_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_wood_optic_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_wood_optic_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vss_v3_wood_optic_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # SUITE 3: vss_v3_metal (6-Stage Baffle Stack, Ported Barrel, 6-Lug Bolt & Striker)
    # -------------------------------------------------------------------------
    def process_metal_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        albedo = _linear_to_srgb(alb_lin)
        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.58 + ao_ext * 0.42)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.82), 0.34, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        rgh = np.clip(rgh, 0.14, 0.90)
        met = np.clip(met, 0.08, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "vss_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved vss_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_receiver_supp_atlas()
    process_wood_optic_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 LTS Hard-Surface Sculptor, UV Packer & Cycles GPU Baker
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "vss.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 40
BAKE_NORMAL_SAMPLES = 16

# Exact Three.js (+X muzzle, +Y up, +Z right) -> Blender (+X muzzle, +Y left, +Z up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))

def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))

# Exact 22 solid VSS Vintorez parts across 3 dedicated 2048x2048 suites
# (Skipping ONLY dynamic GPU `aSpringParam` springs `vss_recoil_spring` & `vss_striker_spring`!)
RECEIVER_SUPP_PARTS = [
    "vss_receiver",
    "vss_dust_cover",
    "vss_suppressor_tube",
    "vss_rear_sight",
    "vss_safety_lever",
    "vss_selector_switch",
    "vss_forend",
]

WOOD_OPTIC_PARTS = [
    "vss_wood_stock",
    "vss_pso1_scope",
    "vss_mag_body",
    "vss_mag_follower",
]

METAL_PARTS = [
    "vss_barrel",
    "vss_baffle_stack",
    "vss_bolt_carrier",
    "vss_bolt",
    "vss_striker",
    "vss_firing_pin",
    "vss_recoil_guide",
    "vss_trigger",
    "vss_sear",
    "vss_mag_spring",
    "vss_mag_floorplate",
]

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "vss_recoil_spring",
    "vss_striker_spring",
]

# Stationary exterior parts receiving inter-part contact AO at assembledPos
EXTERIOR_CONTACT_AO_PARTS = {
    "vss_receiver",
    "vss_dust_cover",
    "vss_suppressor_tube",
    "vss_rear_sight",
    "vss_safety_lever",
    "vss_selector_switch",
    "vss_forend",
    "vss_wood_stock",
    "vss_pso1_scope",
    "vss_mag_body",
    "vss_mag_floorplate",
}

# Exact assembledPos from src/weapons/vss/plugin.ts (all assembledRot = (0, 0, 0))
ASSEMBLED_POS = {
    "vss_barrel":          (  6.00,   1.05,  0.00),
    "vss_baffle_stack":    ( 36.30,   1.35,  0.00),
    "vss_bolt_carrier":    ( -0.50,   1.75,  0.00),
    "vss_bolt":            (  1.80,   1.05,  0.00),
    "vss_firing_pin":      (  1.40,   1.05,  0.00),
    "vss_recoil_guide":    ( -6.80,   2.28,  0.00),
    "vss_receiver":        (  0.00,   0.00,  0.00),
    "vss_dust_cover":      ( -3.00,   2.25,  0.00),
    "vss_suppressor_tube": ( 26.70,   1.35,  0.00),
    "vss_rear_sight":      ( 16.20,   3.65,  0.00),
    "vss_forend":          ( 12.60,  -0.35,  0.00),
    "vss_wood_stock":      (-26.80,  -4.60,  0.00),
    "vss_pso1_scope":      ( -4.50,   6.15, -0.35),
    "vss_striker":         ( -6.40,   0.95,  0.00),
    "vss_trigger":         ( -5.60,  -2.55,  0.00),
    "vss_sear":            ( -6.40,  -0.75,  0.00),
    "vss_safety_lever":    ( -5.00,   0.85,  1.82),
    "vss_selector_switch": ( -8.20,  -2.55,  0.00),
    "vss_mag_body":        (  1.40,  -6.80,  0.00),
    "vss_mag_follower":    (  1.55,  -8.95,  0.00),
    "vss_mag_spring":      (  1.78, -10.90,  0.00),
    "vss_mag_floorplate":  (  1.92, -12.60,  0.00),
}

# Ground-truth CSG local bounding boxes from src/weapons/vss/meshes/vssGeometries.ts
CSG_REF_BBOX = {
    "vss_barrel":          (( -1.200, -0.920, -0.920), ( 20.000,  1.730,  0.920)),
    "vss_baffle_stack":    ((-10.100, -1.620, -1.620), ( 10.100,  1.620,  1.620)),
    "vss_bolt_carrier":    (( -8.200, -1.075, -1.140), ( 14.800,  0.970,  3.570)),
    "vss_bolt":            (( -4.300, -0.860, -0.810), (  3.300,  1.040,  0.810)),
    "vss_firing_pin":      (( -4.300, -0.220, -0.217), (  3.825,  0.220,  0.217)),
    "vss_recoil_guide":    (( -5.100, -0.460, -0.510), (  4.775,  0.500,  0.510)),
    "vss_receiver":        ((-12.200, -5.150, -2.180), (  6.200,  1.950,  1.620)),
    "vss_dust_cover":      (( -9.150, -0.850, -1.650), (  9.050,  0.950,  1.650)),
    "vss_suppressor_tube": ((-20.700, -1.980, -1.980), ( 20.700,  3.545,  1.980)),
    "vss_rear_sight":      (( -3.100, -0.415, -0.810), (  3.100,  0.620,  0.810)),
    "vss_forend":          (( -6.600, -1.575, -2.020), (  6.600,  1.274,  2.020)),
    "vss_wood_stock":      ((-15.205, -5.920, -1.780), ( 15.195,  5.395,  1.780)),
    "vss_pso1_scope":      ((-16.900, -6.425, -2.240), ( 17.000,  2.625,  2.525)),
    "vss_striker":         (( -3.150, -0.920, -0.600), (  3.250,  0.580,  0.600)),
    "vss_trigger":         (( -1.550, -2.102, -0.490), (  1.850,  1.605,  0.490)),
    "vss_sear":            (( -2.550, -0.530, -0.590), (  2.350,  0.845,  0.600)),
    "vss_safety_lever":    (( -4.500, -0.670, -0.280), (  7.400,  0.680,  0.440)),
    "vss_selector_switch": (( -0.540, -0.540, -1.745), (  0.540,  0.540,  1.745)),
    "vss_mag_body":        (( -2.952, -5.820, -1.220), (  3.521,  5.920,  1.220)),
    "vss_mag_follower":    (( -2.300, -0.525, -0.860), (  2.400,  0.495,  0.860)),
    "vss_mag_spring":      (( -2.015, -1.425, -0.685), (  2.015,  1.425,  0.685)),
    "vss_mag_floorplate":  (( -2.980, -0.405, -1.300), (  3.220,  0.260,  1.300)),
}

EXPLODE_OFFSET_T1 = {
    "vss_barrel":          ( 14.0,   0.0,   0.0),
    "vss_baffle_stack":    ( 36.0,  -3.5,   0.0),
    "vss_bolt_carrier":    ( -4.5,   9.2,   0.0),
    "vss_bolt":            (  7.5,   4.2,   5.8),
    "vss_firing_pin":      ( -2.0,   4.4,   9.5),
    "vss_recoil_guide":    (-20.0,   9.5,   0.0),
    "vss_recoil_spring":   (-22.0,  15.0,   0.0),
    "vss_receiver":        (  0.0,   0.0,   0.0),
    "vss_dust_cover":      ( -2.0,  15.5,   0.0),
    "vss_suppressor_tube": ( 36.0,   8.5,   0.0),
    "vss_rear_sight":      ( 26.0,  15.5,   0.0),
    "vss_forend":          ( 14.0, -10.5,   0.0),
    "vss_wood_stock":      (-24.0,  -5.5,   0.0),
    "vss_pso1_scope":      ( -4.0,  14.0, -13.0),
    "vss_striker":         (-14.5,   5.0,   5.2),
    "vss_striker_spring":  (-24.5,   5.0,   5.2),
    "vss_trigger":         ( -5.5, -13.5,   0.0),
    "vss_sear":            (-11.5,  -8.5,   5.2),
    "vss_safety_lever":    ( -4.0,  -1.5,  10.5),
    "vss_selector_switch": (-14.5, -13.5,   6.5),
    "vss_mag_body":        (  3.5, -12.5,   0.0),
    "vss_mag_follower":    ( 14.5, -11.5,   0.0),
    "vss_mag_spring":      ( 14.5, -18.5,   0.0),
    "vss_mag_floorplate":  (  3.5, -24.5,   0.0),
}

CSG_SKIPPED_SPRING_INFO = {
    "vss_recoil_spring": {
        "pos": (-6.40, 2.28, 0.0),
        "bbox": ((-5.062, -0.362, -0.362), (6.262, 0.362, 0.362)),
    },
    "vss_striker_spring": {
        "pos": (-9.20, 0.95, 0.0),
        "bbox": ((-2.460, -0.340, -0.340), (2.456, 0.340, 0.340)),
    },
}


# =============================================================================
# Scene & Physically Calibrated Soviet Cold-War Material Library
# =============================================================================
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
    bevel_r: float = 0.028,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.74, 0.77, 0.81),
    grain_scale: float = 48.0,
    grain_bump: float = 0.032,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 82.0,
    rough_var: float = 0.038,
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
    n_macro.inputs["Scale"].default_value = 0.52
    n_macro.inputs["Detail"].default_value = 4.5
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
        min(1.0, base_srgb[0] * 1.12),
        min(1.0, base_srgb[1] * 1.12),
        min(1.0, base_srgb[2] * 1.12),
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
    rgh_map.inputs["To Min"].default_value = max(0.08, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.92, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    if edge_wear > 0.001:
        geom = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.530
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.605
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
    bev.samples = 6
    bev.inputs["Radius"].default_value = bevel_r

    if grain_bump > 0.0005:
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = grain_bump
        bump.inputs["Distance"].default_value = 0.016
        nt.links.new(bump_height_sock, bump.inputs["Height"])
        nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bev.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def _build_russian_birch_laminate_mat(name: str = "WO_RussianBirchLaminate") -> bpy.types.Material:
    """Hand-rubbed warm amber-honey Russian Laminated Birchwood (Tula Plywood Stock) in 3D Object Space!
    Combines two authentic physical wood layers:
      1. Stacked ~3.5 mm Russian birch plywood veneers with gently tilted lamination planes so sculpted
         outer & thumbhole bevels reveal crisp alternating phenolic-resin/honey contour rings AND the flat
         cheeks sweep through subtle multi-veneer waves;
      2. Flowing longitudinal birch cathedral grain rings, fine fibers & dark shellac-filled wood pores
         running along +X so every cheek angle reads as rich hand-oiled Tula laminated birch under AgX!"""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # 1. Stacked Russian birch plywood lamination layers (primary axis Blender Y = Three.js -Z thickness)
    # Tilted 6.5 deg so flat cheeks sweep across 2-3 broad flowing veneer reveals while the rounded
    # thumbhole fillet & outer stock bevel cut across 4-5 crisp alternating honey/mahogany ply rings!
    map_ply = nt.nodes.new("ShaderNodeMapping")
    map_ply.inputs["Rotation"].default_value = (math.radians(6.5), math.radians(-3.8), math.radians(2.2))
    map_ply.inputs["Scale"].default_value = (0.055, 2.55, 0.34)
    nt.links.new(tc.outputs["Object"], map_ply.inputs["Vector"])

    wave_ply = nt.nodes.new("ShaderNodeTexWave")
    wave_ply.wave_type = "BANDS"
    wave_ply.bands_direction = "Y"
    wave_ply.wave_profile = "SIN"
    wave_ply.inputs["Scale"].default_value = 1.65
    wave_ply.inputs["Distortion"].default_value = 2.6
    wave_ply.inputs["Detail"].default_value = 4.0
    wave_ply.inputs["Detail Scale"].default_value = 1.35
    wave_ply.inputs["Detail Roughness"].default_value = 0.50
    nt.links.new(map_ply.outputs["Vector"], wave_ply.inputs["Vector"])

    # 2. Flowing longitudinal Russian birch cathedral growth rings along rifle axis (+X)
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(-4.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    map_cat = nt.nodes.new("ShaderNodeMapping")
    map_cat.inputs["Scale"].default_value = (0.058, 0.68, 0.72)
    nt.links.new(rot_g.outputs["Vector"], map_cat.inputs["Vector"])

    wave_cat = nt.nodes.new("ShaderNodeTexWave")
    wave_cat.wave_type = "RINGS"
    wave_cat.rings_direction = "X"
    wave_cat.wave_profile = "SIN"
    wave_cat.inputs["Scale"].default_value = 1.15
    wave_cat.inputs["Distortion"].default_value = 6.2
    wave_cat.inputs["Detail"].default_value = 5.5
    wave_cat.inputs["Detail Scale"].default_value = 1.45
    wave_cat.inputs["Detail Roughness"].default_value = 0.54
    nt.links.new(map_cat.outputs["Vector"], wave_cat.inputs["Vector"])

    # 3. Fine straight birchwood fiber streaks + elongated shellac-filled wood pores along +X
    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.24, 3.8, 4.0)
    nt.links.new(rot_g.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 2.1
    n_fib.inputs["Detail"].default_value = 8.0
    n_fib.inputs["Distortion"].default_value = 0.72
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    map_pore = nt.nodes.new("ShaderNodeMapping")
    map_pore.inputs["Scale"].default_value = (1.10, 14.5, 14.5)
    nt.links.new(rot_g.outputs["Vector"], map_pore.inputs["Vector"])

    n_pore = nt.nodes.new("ShaderNodeTexNoise")
    n_pore.inputs["Scale"].default_value = 2.4
    n_pore.inputs["Detail"].default_value = 4.0
    nt.links.new(map_pore.outputs["Vector"], n_pore.inputs["Vector"])

    pore_m = nt.nodes.new("ShaderNodeMapRange")
    pore_m.clamp = True
    pore_m.inputs["From Min"].default_value = 0.62
    pore_m.inputs["From Max"].default_value = 0.79
    pore_m.inputs["To Min"].default_value = 0.0
    pore_m.inputs["To Max"].default_value = 0.45
    nt.links.new(n_pore.outputs["Fac"], pore_m.inputs["Value"])

    # Blend 58% lamination ply pattern + 42% cathedral birch grain for authentic Russian plywood depth
    mix_grain_fac = nt.nodes.new("ShaderNodeMix")
    mix_grain_fac.data_type = "FLOAT"
    mix_grain_fac.inputs[0].default_value = 0.44
    nt.links.new(wave_ply.outputs["Fac"], mix_grain_fac.inputs[2])
    nt.links.new(wave_cat.outputs["Fac"], mix_grain_fac.inputs[3])

    # Rich Tula amber-honey shellac birch laminate palette (crisp AgX readability, dark phenolic resin seams!)
    ramp_ply = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_ply.color_ramp
    cr.elements[0].position = 0.16
    cr.elements[0].color = srgb_to_lin(0.165, 0.068, 0.028)  # dark toasted mahogany phenolic resin glue line
    cr.elements[1].position = 0.85
    cr.elements[1].color = srgb_to_lin(0.625, 0.388, 0.158)  # luminous golden-honey Russian birch veneer
    mid1 = cr.elements.new(0.40)
    mid1.color = srgb_to_lin(0.355, 0.178, 0.070)            # warm toasted chestnut veneer
    mid2 = cr.elements.new(0.65)
    mid2.color = srgb_to_lin(0.505, 0.288, 0.114)            # rich amber-honey birch heartwood
    nt.links.new(mix_grain_fac.outputs[0], ramp_ply.inputs["Fac"])

    # Overlay fine fiber tonal variation
    mix_fib = nt.nodes.new("ShaderNodeMix")
    mix_fib.data_type = "RGBA"
    mix_fib.inputs[7].default_value = srgb_to_lin(0.245, 0.118, 0.048)
    fib_f = nt.nodes.new("ShaderNodeMapRange")
    fib_f.clamp = True
    fib_f.inputs["From Min"].default_value = 0.24
    fib_f.inputs["From Max"].default_value = 0.78
    fib_f.inputs["To Min"].default_value = 0.0
    fib_f.inputs["To Max"].default_value = 0.40
    nt.links.new(n_fib.outputs["Fac"], fib_f.inputs["Value"])
    nt.links.new(fib_f.outputs["Result"], mix_fib.inputs[0])
    nt.links.new(ramp_ply.outputs["Color"], mix_fib.inputs[6])

    # Darken fine shellac-filled wood pores subtly
    mix_pore = nt.nodes.new("ShaderNodeMix")
    mix_pore.data_type = "RGBA"
    mix_pore.inputs[7].default_value = srgb_to_lin(0.125, 0.056, 0.024)
    nt.links.new(pore_m.outputs["Result"], mix_pore.inputs[0])
    nt.links.new(mix_fib.outputs[2], mix_pore.inputs[6])
    nt.links.new(mix_pore.outputs[2], bsdf.inputs["Base Color"])

    # Hand-rubbed satin Russian amber shellac finish (R = 0.34..0.44, pure dielectric M = 0.0)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.34
    r_wood.inputs["To Max"].default_value = 0.44
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])
    nt.links.new(r_wood.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0

    # Combined longitudinal fiber + pore micro-bump for tactile hand-oiled wood grain under grazing light
    bump_h = nt.nodes.new("ShaderNodeMath")
    bump_h.operation = "SUBTRACT"
    nt.links.new(n_fib.outputs["Fac"], bump_h.inputs[0])
    nt.links.new(pore_m.outputs["Result"], bump_h.inputs[1])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.028
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.020
    nt.links.new(bump_h.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_baffle_cnc_soot_mat(name: str = "M_BaffleCNC") -> bpy.types.Material:
    """Gleaming CNC brushed stainless/alloy 6-stage acoustic diffuser baffle stack with subtle
    9x39mm subsonic propellant heat tint & light carbon fouling near the rear blast baffles."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Rear baffles (local X ~ -9..-2) see hottest gas directly off barrel muzzle -> subtle bronze/soot patina,
    # while forward baffles & machined spine rails stay bright gleaming CNC stainless!
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 4.5
    mr_x.inputs["From Max"].default_value = -9.5
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 2.6
    n_soot.inputs["Detail"].default_value = 5.5
    n_soot.inputs["Roughness"].default_value = 0.60
    nt.links.new(tc.outputs["Object"], n_soot.inputs["Vector"])

    mul_s = nt.nodes.new("ShaderNodeMath")
    mul_s.operation = "MULTIPLY"
    nt.links.new(mr_x.outputs["Result"], mul_s.inputs[0])
    nt.links.new(n_soot.outputs["Fac"], mul_s.inputs[1])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.08
    cr.elements[0].color = srgb_to_lin(0.76, 0.79, 0.83)   # gleaming brushed CNC alloy
    cr.elements[1].position = 0.82
    cr.elements[1].color = srgb_to_lin(0.28, 0.25, 0.23)   # subtle warm propellant soot patina
    el_mid = cr.elements.new(0.45)
    el_mid.color = srgb_to_lin(0.56, 0.52, 0.46)           # light straw-bronze gas heat tint
    nt.links.new(mul_s.outputs["Value"], ramp_c.inputs["Fac"])

    r_map = nt.nodes.new("ShaderNodeMapRange")
    r_map.clamp = True
    r_map.inputs["From Min"].default_value = 0.10
    r_map.inputs["From Max"].default_value = 0.80
    r_map.inputs["To Min"].default_value = 0.20
    r_map.inputs["To Max"].default_value = 0.48
    nt.links.new(mul_s.outputs["Value"], r_map.inputs["Value"])

    m_map = nt.nodes.new("ShaderNodeMapRange")
    m_map.clamp = True
    m_map.inputs["From Min"].default_value = 0.15
    m_map.inputs["From Max"].default_value = 0.85
    m_map.inputs["To Min"].default_value = 0.95
    m_map.inputs["To Max"].default_value = 0.62
    nt.links.new(mul_s.outputs["Value"], m_map.inputs["Value"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])
    nt.links.new(m_map.outputs["Result"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.022
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.025
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- SUITE 1: vss_v3_receiver_supp (7 parts) ---
        # AgX-calibrated Soviet CNC-milled blued steel (sRGB 0.22-0.27, ZERO crushed black!)
        "RS_MilledBlued": _build_pbr_mat(
            "RS_MilledBlued",
            base_srgb=(0.228, 0.242, 0.264),
            roughness=0.31,
            metallic=0.86,
            bevel_r=0.028,
            edge_wear=0.52,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=54.0,
            grain_bump=0.032,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.035,
        ),
        "RS_SuppMatteBlued": _build_pbr_mat(
            "RS_SuppMatteBlued",
            base_srgb=(0.218, 0.228, 0.244),
            roughness=0.37,
            metallic=0.84,
            bevel_r=0.024,
            edge_wear=0.42,
            edge_srgb=(0.70, 0.73, 0.78),
            grain_scale=64.0,
            grain_bump=0.038,
            aniso_stretch=(3.8, 0.45, 0.45),
            voronoi_grain=0.45,
            voronoi_scale=88.0,
            rough_var=0.038,
        ),
        "RS_DustCoverBlued": _build_pbr_mat(
            "RS_DustCoverBlued",
            base_srgb=(0.238, 0.252, 0.274),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.022,
            edge_wear=0.55,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=46.0,
            grain_bump=0.026,
            rough_var=0.032,
        ),
        "RS_SelectorSteel": _build_pbr_mat(
            "RS_SelectorSteel",
            base_srgb=(0.68, 0.71, 0.75),
            roughness=0.22,
            metallic=0.94,
            bevel_r=0.018,
            edge_wear=0.24,
            grain_scale=32.0,
            grain_bump=0.018,
            rough_var=0.024,
        ),
        # Iconic Soviet dark plum-brown fiberglass-Bakelite polymer forend
        "RS_PlumPolymer": _build_pbr_mat(
            "RS_PlumPolymer",
            base_srgb=(0.285, 0.172, 0.186),
            roughness=0.50,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.24,
            edge_srgb=(0.42, 0.29, 0.31),
            grain_scale=68.0,
            grain_bump=0.092,
            voronoi_grain=0.66,
            voronoi_scale=104.0,
            rough_var=0.046,
        ),

        # --- SUITE 2: vss_v3_wood_optic (4 parts) ---
        "WO_RussianBirchLaminate": _build_russian_birch_laminate_mat("WO_RussianBirchLaminate"),
        "WO_RubberPad": _build_pbr_mat(
            "WO_RubberPad",
            base_srgb=(0.168, 0.176, 0.188),
            roughness=0.82,
            metallic=0.00,
            bevel_r=0.030,
            edge_wear=0.14,
            edge_srgb=(0.25, 0.26, 0.28),
            grain_scale=56.0,
            grain_bump=0.075,
            rough_var=0.035,
        ),
        # Iconic Soviet grey-slate hammer-tone enamel cast alloy PSO-1M2-1 scope!
        "WO_PSO1HammerGrey": _build_pbr_mat(
            "WO_PSO1HammerGrey",
            base_srgb=(0.382, 0.412, 0.442),
            roughness=0.36,
            metallic=0.58,
            bevel_r=0.026,
            edge_wear=0.44,
            edge_srgb=(0.76, 0.79, 0.83),
            grain_scale=44.0,
            grain_bump=0.068,
            voronoi_grain=0.72,
            voronoi_scale=56.0,
            rough_var=0.045,
        ),
        "WO_ScopeSteelClamp": _build_pbr_mat(
            "WO_ScopeSteelClamp",
            base_srgb=(0.224, 0.238, 0.260),
            roughness=0.31,
            metallic=0.86,
            bevel_r=0.022,
            edge_wear=0.48,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=50.0,
            grain_bump=0.030,
            rough_var=0.032,
        ),
        "WO_ScopeLens": _build_pbr_mat(
            "WO_ScopeLens",
            base_srgb=(0.04, 0.28, 0.24),
            roughness=0.05,
            metallic=0.14,
            bevel_r=0.008,
            grain_bump=0.0,
            rough_var=0.0,
        ),
        "WO_PlumMag": _build_pbr_mat(
            "WO_PlumMag",
            base_srgb=(0.276, 0.166, 0.180),
            roughness=0.49,
            metallic=0.00,
            bevel_r=0.026,
            edge_wear=0.24,
            edge_srgb=(0.41, 0.28, 0.30),
            grain_scale=64.0,
            grain_bump=0.085,
            voronoi_grain=0.64,
            voronoi_scale=98.0,
            rough_var=0.044,
        ),
        "WO_MagSteel": _build_pbr_mat(
            "WO_MagSteel",
            base_srgb=(0.26, 0.28, 0.31),
            roughness=0.30,
            metallic=0.86,
            bevel_r=0.018,
            edge_wear=0.46,
            grain_scale=44.0,
            grain_bump=0.024,
            rough_var=0.030,
        ),
        "WO_FollowerOrange": _build_pbr_mat(
            "WO_FollowerOrange",
            base_srgb=(0.90, 0.36, 0.08),
            roughness=0.40,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.16,
            edge_srgb=(0.97, 0.56, 0.28),
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.032,
        ),

        # --- SUITE 3: vss_v3_metal (11 parts) ---
        "M_BaffleCNC": _build_baffle_cnc_soot_mat("M_BaffleCNC"),
        "M_ChromeStainless": _build_pbr_mat(
            "M_ChromeStainless",
            base_srgb=(0.80, 0.83, 0.87),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.20,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=30.0,
            grain_bump=0.016,
            aniso_stretch=(0.45, 3.4, 3.4),
            rough_var=0.022,
        ),
        "M_BarrelBlued": _build_pbr_mat(
            "M_BarrelBlued",
            base_srgb=(0.242, 0.258, 0.280),
            roughness=0.30,
            metallic=0.86,
            bevel_r=0.022,
            edge_wear=0.44,
            edge_srgb=(0.74, 0.77, 0.81),
            grain_scale=46.0,
            grain_bump=0.030,
            aniso_stretch=(4.2, 0.45, 0.45),
            rough_var=0.034,
        ),
        "M_CarrierBlued": _build_pbr_mat(
            "M_CarrierBlued",
            base_srgb=(0.230, 0.244, 0.266),
            roughness=0.30,
            metallic=0.87,
            bevel_r=0.024,
            edge_wear=0.54,
            edge_srgb=(0.76, 0.79, 0.83),
            grain_scale=48.0,
            grain_bump=0.028,
            aniso_stretch=(0.45, 3.0, 3.0),
            rough_var=0.034,
        ),
        "M_SpringPhosphated": _build_pbr_mat(
            "M_SpringPhosphated",
            base_srgb=(0.48, 0.51, 0.56),
            roughness=0.26,
            metallic=0.92,
            bevel_r=0.012,
            grain_scale=30.0,
            grain_bump=0.018,
            rough_var=0.025,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh Hard-Surface Sculpting Primitives
# =============================================================================
def _apply_three_xform(bm: bmesh.types.BMesh, ops: list[tuple]) -> None:
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "y",
    flutes: int = 28, depth: float = 0.025,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.024, length * 0.14, radius * 0.12)
    bm = bmesh.new()
    stations = [
        (-half_l, radius - depth * 0.7 - bev * 0.9),
        (-half_l + bev, radius),
        (half_l - bev, radius),
        (half_l, radius - depth * 0.7 - bev * 0.9),
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


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object | None = None) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active if active is not None else (objs[0] if objs else None)


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
    assert len(objs) > 0, f"join_objects({name}): empty"
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


def bool_union(target: bpy.types.Object, additions: list[bpy.types.Object], solver: str = "EXACT") -> bpy.types.Object:
    if not additions:
        return target
    for a in additions:
        for m in a.data.materials:
            if m and m.name not in [tm.name for tm in target.data.materials if tm]:
                target.data.materials.append(m)

    for idx, add in enumerate(additions):
        backup_mesh = target.data.copy()
        tried = [solver, "MANIFOLD" if solver == "EXACT" else "EXACT"]
        success = False
        for slv in tried:
            select_only([target], target)
            mod = target.modifiers.new(name=f"BoolU_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = slv
            mod.object = add
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
            mod = target.modifiers.new(name=f"BoolUF_{idx}", type="BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.use_self = True
            mod.use_hole_tolerant = True
            mod.object = add
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.meshes.remove(backup_mesh)

    delete_objs(additions)
    return target


def _smoothstep_f(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


def sample_quad_bezier(p0, p1, p2, segs: int = 10) -> list[tuple[float, float]]:
    pts = []
    for i in range(segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


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
    v_back = [bm.verts.new((x0, p[1], p[0])) for p in clean]
    v_front = [bm.verts.new((x1, p[1], p[0])) for p in clean]
    bm.faces.new(v_back)
    bm.faces.new(list(reversed(v_front)))
    n = len(clean)
    for i in range(n):
        ni = (i + 1) % n
        bm.faces.new((v_back[i], v_front[i], v_front[ni], v_back[ni]))
    if bevel > 0.0:
        cap_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(bm, geom=cap_edges, offset=bevel, segments=bevel_segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


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


def mk_loft_x(
    name: str,
    stations: list[tuple[float, float, float, float, float, float, float]],
    n_ring: int = 28,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Organic superellipse loft along X: station = (x, y_bot, y_top, hz_bot, hz_top, p_bot, p_top)."""
    rings = []
    for x, yb, yt, hzb, hzt, pb, pt in stations:
        yc = 0.5 * (yb + yt)
        hy = max(0.02, 0.5 * (yt - yb))
        ring = []
        for k in range(n_ring):
            th = math.tau * k / n_ring
            ct, st = math.cos(th), math.sin(th)
            hz = hzt if st >= 0.0 else hzb
            pw = pt if st >= 0.0 else pb
            inv_p = 2.0 / max(pw, 1.2)
            z = math.copysign(abs(ct) ** inv_p, ct) * hz
            y = yc + math.copysign(abs(st) ** inv_p, st) * hy
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


def mk_stadium_2d(cx: float, cy: float, length: float, width: float, segs: int = 10) -> list[tuple[float, float]]:
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
        pts2d = mk_stadium_2d(cx, cy, length + 2.0 * dr, width + 2.0 * dr, segs=segs)
        rings.append([(x, y, z_pos) for x, y in pts2d])
    return mk_loft_rings(name, rings, mat=mat, cap_ends=True)


def finish_part(
    obj: bpy.types.Object,
    sharp_deg: float = 36.0,
    weighted_normals: bool = True,
) -> bpy.types.Object:
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
# 22 HIGH-DETAIL VSS VINTOREZ (6P29) HARD-SURFACE PART SCULPTORS
# =============================================================================

# --- SUITE 1: RECEIVER, SUPPRESSOR, COVER, SIGHT, SAFETY, SELECTOR & FOREND ---

def build_vss_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: CNC-Milled Blued Steel Receiver with Authentic 45° Warsaw Pact Dovetail Rail,
    Smoothly Swept Welded Closed-Loop Trigger Guard & Hollow Bolt/FCG Cavity."""
    m = mats["RS_MilledBlued"]
    m_st = mats["RS_SelectorSteel"]

    # Main CNC-milled forged receiver block (keep flat flanks across X in [-12.18, +6.18] for TOZ Cyrillic Hero UVs!)
    body = mk_box("recv_body", 18.4, 4.05, 3.24, [("t", -3.0, -0.075, 0.0)], m, bevel=0.08, bevel_segs=3)
    # Smoothly swept closed-loop Soviet curved trigger-guard bow (watertight union with receiver floor!)
    tg_curve = (
        [(-2.12, -1.78)]
        + sample_cubic_bezier((-2.12, -2.02), (-2.26, -4.22), (-2.85, -4.90), (-4.25, -4.90), segs=10)[1:]
        + sample_quad_bezier((-4.25, -4.90), (-6.35, -4.94), (-8.45, -4.90), segs=8)[1:]
        + sample_cubic_bezier((-8.45, -4.90), (-9.85, -4.88), (-10.28, -4.10), (-10.35, -2.02), segs=10)[1:]
        + [(-10.35, -1.78)]
    )
    tguard = mk_swept_bow("recv_tg", tg_curve, thickness=0.44, half_z=0.66, bevel=0.07, bevel_segs=3, mat=m)
    body = bool_union(body, [tguard])

    # Hollow interior cavity for bolt carrier, 6-lug bolt, linear striker & trigger group + bottom magwell + front bore
    cav = mk_box("recv_cav", 16.8, 3.65, 2.48, [("t", -3.0, 0.25, 0.0)], m)
    magw = mk_box("recv_magw", 6.1, 2.55, 2.46, [("t", 1.2, -1.60, 0.0)], m)
    bore = mk_cyl("recv_bore", 0.82, 0.82, 3.2, axis="x", segs=32, xform=[("t", 5.4, 1.05, 0.0)], mat=m)
    supp_ring = mk_cyl("recv_sring", 1.70, 1.70, 0.75, axis="x", segs=36, xform=[("t", 6.1, 1.35, 0.0)], mat=m)
    bool_subtract(body, [cav, magw, bore, supp_ring])

    # Authentic 45° trapezoidal Warsaw Pact left-side dovetail optic rail with lightening groove & recoil stop
    rail_zy = [
        (-1.58, -0.15), (-1.86, -0.15), (-1.98, 0.04), (-2.18, 0.14),
        (-2.18, 1.06), (-1.98, 1.16), (-1.86, 1.35), (-1.58, 1.35),
    ]
    rail = mk_extrude_x("recv_rail_dove", rail_zy, -10.6, 0.4, bevel=0.04, bevel_segs=2, mat=m)
    # Sculpted curved magazine release paddle directly ahead of trigger guard
    latch_xy = [
        (-2.22, -2.02), (-1.64, -2.02), (-1.62, -3.15), (-1.92, -3.82), (-2.30, -3.68), (-2.10, -2.92),
    ]
    maglatch = mk_extrude_z("recv_maglatch", latch_xy, -0.56, 0.56, bevel=0.06, bevel_segs=2, mat=m)

    parts = [body, rail, maglatch]
    for rx in (-9.2, -5.1, -1.0):
        parts.append(mk_cyl(f"recv_riv_{rx}", 0.22, 0.24, 0.12, axis="z", segs=18, xform=[("t", rx, 0.60, -2.18)], mat=m_st, bevel=0.03))
    # Trigger/sear transverse axle pins strictly clear of lower Cyrillic rollmark text!
    for px, py in ((-5.8, -1.78), (-8.4, -1.74), (-2.1, -2.28)):
        parts.append(mk_cyl(f"recv_pin_{px}", 0.15, 0.15, 3.30, axis="z", segs=16, xform=[("t", px, py, 0.0)], mat=m_st, bevel=0.02))
    # Rear vertical QD stock dovetail tenon + flush front trunnion reinforcing collar
    parts.append(mk_box("recv_qd_tenon", 0.65, 2.95, 2.55, [("t", -11.95, -0.55, 0.0)], m, bevel=0.06, bevel_segs=2))
    parts.append(mk_cyl("recv_front_collar", 0.90, 0.90, 0.70, axis="x", segs=36, xform=[("t", 5.85, 1.05, 0.0)], mat=m, bevel=0.04))

    return finish_part(join_objects(parts, "vss_receiver"), sharp_deg=36.0)


def build_vss_dust_cover(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Smoothly Arched Stamped Blued-Steel Receiver Top Dust Cover w/ 3 Curved Embossed Ribs."""
    m = mats["RS_DustCoverBlued"]
    # True 16-segment smooth arched Russian stamped steel cross-section (Z, Y)
    outer_zy = [(-1.62, -0.85), (-1.62, -0.02)]
    for i in range(15):
        ang = math.pi * (1.0 - i / 14.0)
        outer_zy.append((1.62 * math.cos(ang), -0.02 + 0.97 * math.sin(ang)))
    outer_zy.append((1.62, -0.85))
    shell = mk_extrude_x("dc_outer", outer_zy, -9.15, 9.05, bevel=0.06, bevel_segs=2, mat=m)

    inner_zy = [(-1.42, -0.95), (-1.42, -0.06)]
    for i in range(15):
        ang = math.pi * (1.0 - i / 14.0)
        inner_zy.append((1.42 * math.cos(ang), -0.06 + 0.80 * math.sin(ang)))
    inner_zy.append((1.42, -0.95))
    inner = mk_extrude_x("dc_inner", inner_zy, -8.82, 8.72, mat=m)
    e_port = mk_box("dc_eport", 5.8, 1.28, 1.48, [("t", 4.6, -0.26, 1.22)], m, bevel=0.08, bevel_segs=2)
    rear_slot = mk_box("dc_rslot", 0.95, 0.75, 1.10, [("t", -9.05, -0.05, 0.0)], m, bevel=0.04)
    bool_subtract(shell, [inner, e_port, rear_slot])

    parts = [shell]
    # 3 iconic embossed curved Soviet stamped top stiffening ribs hugging the arch crown!
    rib_zy = []
    for i in range(11):
        ang = math.radians(146.0 - i * 11.2)
        rib_zy.append((1.58 * math.cos(ang), -0.02 + 1.02 * math.sin(ang)))
    for i in range(10, -1, -1):
        ang = math.radians(146.0 - i * 11.2)
        rib_zy.append((1.44 * math.cos(ang), -0.02 + 0.88 * math.sin(ang)))
    for rx in (-6.2, -4.4, -2.6):
        parts.append(mk_extrude_x(f"dc_rib_{rx}", rib_zy, rx - 0.26, rx + 0.26, bevel=0.04, bevel_segs=2, mat=m))
    # Rolled ejection port reinforcement lip
    parts.append(mk_box("dc_lip", 6.1, 0.14, 0.22, [("t", 4.6, 0.42, 1.54)], m, bevel=0.04))

    return finish_part(join_objects(parts, "vss_dust_cover"), sharp_deg=36.0)


def build_vss_suppressor_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: 414mm Full-Length Cylindrical Integral Suppressor Tube w/ Circumferential TIG Weld Beads,
    Knurled Rear Locking Collar & Welded Circular Arched Hooded Front Sight."""
    m_supp = mats["RS_SuppMatteBlued"]
    m_blk = mats["RS_MilledBlued"]

    # Main expansion cylinder with stepped rear collar & clean circumferential TIG weld beads!
    pts_outer = [
        (0.00, -20.70), (1.98, -20.70), (1.98, -19.12),
        # Rear collar circumferential TIG weld bead
        (1.94, -19.04), (1.91, -18.92), (1.86, -18.82),
        # Rear sight pedestal weld bead zone
        (1.86, -13.62), (1.90, -13.50), (1.90, -13.38), (1.86, -13.26),
        (1.86,  -7.74), (1.90,  -7.62), (1.90,  -7.50), (1.86,  -7.38),
        # Mid-tube acoustic expansion chamber seam weld bead
        (1.86,   5.18), (1.89,   5.30), (1.89,   5.42), (1.86,   5.54),
        # Front sight sleeve weld bead
        (1.86,  17.08), (1.90,  17.20), (1.90,  17.32), (1.86,  17.44),
        # Front muzzle endcap weld bead & beveled crown
        (1.86,  20.02), (1.90,  20.14), (1.90,  20.24), (1.86,  20.36),
        (1.72,  20.70), (0.00,  20.70),
    ]
    tube = mk_lathe_x("supp_body", pts_outer, segs=56, mat=m_supp)
    # Hollow expansion interior + eccentric bullet exit aperture at bore world Y = 1.05 (local Y = -0.30)
    inner = mk_cyl("supp_in", 1.68, 1.68, 40.5, axis="x", segs=40, xform=[("t", -0.48, 0.0, 0.0)], mat=m_supp)
    exit_hole = mk_cyl("supp_exit", 0.56, 0.56, 2.6, axis="x", segs=28, xform=[("t", 20.2, -0.30, 0.0)], mat=m_supp)
    exit_crown = mk_cyl("supp_crown", 0.68, 0.56, 0.28, axis="x", segs=28, xform=[("t", 20.62, -0.30, 0.0)], mat=m_supp)
    bool_subtract(tube, [inner, exit_hole, exit_crown])

    # Welded Soviet circular arched hooded front sight ring (replaces boxy ears!)
    hood_outer = mk_cyl("supp_fs_hood", 0.72, 0.72, 1.48, axis="x", segs=36, xform=[("t", 18.4, 2.84, 0.0)], mat=m_blk, bevel=0.05)
    hood_inner = mk_cyl("supp_fs_hin", 0.52, 0.52, 1.90, axis="x", segs=30, xform=[("t", 18.4, 2.84, 0.0)], mat=m_blk)
    hood_top_cut = mk_cyl("supp_fs_htop", 0.32, 0.32, 0.90, axis="y", segs=20, xform=[("t", 18.4, 3.45, 0.0)], mat=m_blk)
    hood = bool_subtract(hood_outer, [hood_inner, hood_top_cut])

    # Tapered front sight pedestal base + welded rear tangent sight base
    fs_base_xy = [(17.20, 1.72), (19.55, 1.72), (19.25, 2.48), (17.55, 2.48)]
    fs_base = mk_extrude_z("supp_fs_base", fs_base_xy, -0.62, 0.62, bevel=0.07, bevel_segs=2, mat=m_blk)
    rs_ped_xy = [(-13.40, 1.66), (-7.55, 1.66), (-7.85, 2.34), (-13.15, 2.34)]
    rs_ped = mk_extrude_z("supp_rbase", rs_ped_xy, -0.74, 0.74, bevel=0.07, bevel_segs=2, mat=m_blk)

    parts = [
        tube,
        mk_knurled_cyl("supp_knurl", 1.98, 1.18, axis="x", flutes=40, depth=0.032, xform=[("t", -19.95, 0.0, 0.0)], mat=m_blk),
        mk_cyl("supp_detbtn", 0.24, 0.24, 0.28, axis="y", segs=18, xform=[("t", -19.85, -1.98, 0.0)], mat=m_blk, bevel=0.03),
        rs_ped,
        fs_base,
        hood,
        mk_cyl("supp_fs_drum", 0.28, 0.28, 1.24, axis="z", segs=22, xform=[("t", 18.4, 2.44, 0.0)], mat=m_blk, bevel=0.03),
        mk_cyl("supp_fs_post", 0.075, 0.115, 0.78, axis="y", segs=16, xform=[("t", 18.4, 2.86, 0.0)], mat=m_blk),
    ]
    return finish_part(join_objects(parts, "vss_suppressor_tube"), sharp_deg=36.0)


def build_vss_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: 100-400m Subsonic Curved-Ramp Tangent Leaf Rear Sight w/ Dual Knurled Slider Buttons."""
    m = mats["RS_MilledBlued"]
    m_st = mats["RS_SelectorSteel"]
    # Curved Soviet stepped tangent elevation ramp walls on left/right flanks
    ramp_xy = (
        [(-3.08, -0.40), (3.08, -0.40), (3.08, 0.12)]
        + sample_quad_bezier((3.08, 0.12), (0.20, 0.18), (-2.95, 0.34), segs=10)[1:]
        + [(-3.08, 0.34)]
    )
    base = mk_extrude_z("rs_base", ramp_xy, -0.68, 0.68, bevel=0.05, bevel_segs=2, mat=m)
    # Flat top tangent sight leaf (exact HERO_SIGHT top plane for `1 2 3 4` graduations!)
    leaf = mk_box("rs_leaf", 5.4, 0.34, 1.06, [("t", -0.2, 0.30, 0.0)], m, bevel=0.03, bevel_segs=2)
    # Contoured sliding range cursor + dual knurled release buttons
    slider = mk_box("rs_slider", 1.15, 0.52, 1.36, [("t", 0.55, 0.34, 0.0)], m, bevel=0.06, bevel_segs=2)
    btn_l = mk_knurled_cyl("rs_btnL", 0.22, 0.28, axis="z", flutes=18, depth=0.020, xform=[("t", 0.55, 0.36, -0.68)], mat=m_st)
    btn_r = mk_knurled_cyl("rs_btnR", 0.22, 0.28, axis="z", flutes=18, depth=0.020, xform=[("t", 0.55, 0.36, 0.68)], mat=m_st)
    # Front hinge pin + rear V-notch sight blade ears
    hinge_pin = mk_cyl("rs_hpin", 0.14, 0.14, 1.46, axis="z", segs=16, xform=[("t", 2.65, 0.18, 0.0)], mat=m_st, bevel=0.02)
    ear_l = mk_box("rs_earL", 0.34, 0.36, 0.42, [("t", -2.85, 0.44, -0.32)], m, bevel=0.04)
    ear_r = mk_box("rs_earR", 0.34, 0.36, 0.42, [("t", -2.85, 0.44, 0.32)], m, bevel=0.04)
    return finish_part(join_objects([base, leaf, slider, btn_l, btn_r, hinge_pin, ear_l, ear_r], "vss_rear_sight"), sharp_deg=36.0)


def build_vss_safety_lever(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05/FC-05: AK-Derived Right-Side Stamped Dust-Cover Safety Flap."""
    m = mats["RS_MilledBlued"]
    pivot = mk_cyl("saf_piv", 0.64, 0.64, 0.46, axis="z", segs=28, xform=[("t", -3.7, -0.05, -0.03)], mat=m, bevel=0.05)
    bar_pts = [
        (-4.0, -0.32), (6.5, -0.22), (7.35, -0.10), (7.35, 0.58),
        (6.2, 0.66), (-3.8, 0.54),
    ]
    bar = mk_extrude_z("saf_bar", bar_pts, -0.08, 0.16, bevel=0.05, bevel_segs=2, mat=m)
    shelf = mk_box("saf_shelf", 1.55, 0.42, 0.46, [("t", 6.62, 0.08, 0.21)], m, bevel=0.06, bevel_segs=2)
    detent = mk_cyl("saf_det", 0.14, 0.14, 0.18, axis="z", segs=14, xform=[("t", 5.8, -0.08, -0.14)], mat=m)
    return finish_part(join_objects([pivot, bar, shelf, detent], "vss_safety_lever"), sharp_deg=36.0)


def build_vss_selector_switch(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-06: VSS Cross-Bolt Semi/Full-Auto Fire Selector Button (`1 / АВ`) behind Trigger."""
    m_st = mats["RS_SelectorSteel"]
    m_blk = mats["RS_MilledBlued"]
    shaft = mk_cyl("sel_shaft", 0.36, 0.36, 2.75, axis="z", segs=28, mat=m_blk, bevel=0.035)
    btn_l = mk_knurled_cyl("sel_btnL", 0.54, 0.44, axis="z", flutes=24, depth=0.026, xform=[("t", 0.0, 0.0, -1.52)], mat=m_st)
    btn_r = mk_knurled_cyl("sel_btnR", 0.54, 0.44, axis="z", flutes=24, depth=0.026, xform=[("t", 0.0, 0.0, 1.52)], mat=m_st)
    return finish_part(join_objects([shaft, btn_l, btn_r], "vss_selector_switch"), sharp_deg=36.0)


def build_vss_forend(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: Organically Contoured Soviet Dark Plum-Brown Deeply Ribbed & Checkered Bakelite Forend."""
    m = mats["RS_PlumPolymer"]
    m_blk = mats["RS_MilledBlued"]

    # Tapered organic ergonomic boat-hull cross-section lofted along X in [-6.45, +6.35]
    # Station = (x, y_bot, y_top, hz_bot, hz_top, p_bot, p_top)
    fg_stations = [
        (-6.45, -1.48, 1.24, 1.72, 1.94, 2.4, 3.0),
        (-5.20, -1.55, 1.26, 1.82, 1.98, 2.2, 2.8),
        (-1.80, -1.56, 1.27, 1.84, 1.99, 2.1, 2.8),
        ( 1.80, -1.54, 1.27, 1.82, 1.98, 2.1, 2.8),
        ( 4.80, -1.46, 1.25, 1.76, 1.95, 2.2, 2.8),
        ( 6.32, -1.34, 1.22, 1.66, 1.88, 2.4, 3.0),
    ]
    body = mk_loft_x("fg_body", fg_stations, n_ring=32, mat=m, cap_ends=True)

    # U-channel saddle cradling suppressor tube (R = 1.89 centered at Y_loc = +1.70) + sculpted finger-grip flutes!
    cutters = [
        mk_cyl("fg_saddle", 1.89, 1.89, 14.6, axis="x", segs=40, xform=[("t", 0.0, 1.70, 0.0)], mat=m),
    ]
    # 6 deep sculpted circumferential finger-grip flutes carved cleanly between the 7 primary ribs!
    for i in range(6):
        fx = -4.0 + i * 1.60
        for side in (-1.0, 1.0):
            cutters.append(
                mk_chamfered_stadium_cutter_z(
                    f"fg_flute_{i}_{side:+.0f}", cx=fx, cy=-0.32,
                    z_wall=side * 1.94, depth=0.16,
                    length=0.58, width=1.42, chamfer=0.05,
                    side_sign=side, segs=8, mat=m,
                )
            )
    bool_subtract(body, cutters)

    parts = [body]
    # 7 iconic Soviet proud contoured vertical finger-grip ribs wrapping flanks + diagonal checkered micro-bosses!
    for i in range(7):
        rx = -4.8 + i * 1.60
        parts.append(mk_box(f"fg_rib_{i}", 0.30, 1.72, 4.02, [("t", rx, -0.34, 0.0)], m, bevel=0.07, bevel_segs=2))
    # Sculpted checkered longitudinal traction rails & steel retaining caps front & rear
    for side in (-1.0, 1.0):
        for ky in (-0.82, -0.34, 0.14):
            parts.append(mk_box(f"fg_chk_{side:+.0f}_{ky:.2f}", 10.6, 0.16, 0.14,
                                [("t", 0.0, ky, side * 1.92)], m, bevel=0.035))
    # Contoured blued-steel front & rear retaining ferrules (saddle-cut so they hug the suppressor cleanly!)
    fcap_raw = mk_box("fg_fcap", 0.38, 2.48, 3.66, [("t", 6.40, -0.16, 0.0)], m_blk, bevel=0.06, bevel_segs=2)
    fcap = bool_subtract(fcap_raw, [mk_cyl("fg_fc_cut", 1.88, 1.88, 1.2, axis="x", segs=36, xform=[("t", 6.40, 1.70, 0.0)], mat=m_blk)])
    rcap_raw = mk_box("fg_rcap", 0.32, 2.52, 3.72, [("t", -6.44, -0.14, 0.0)], m_blk, bevel=0.05, bevel_segs=2)
    rcap = bool_subtract(rcap_raw, [mk_cyl("fg_rc_cut", 1.88, 1.88, 1.2, axis="x", segs=36, xform=[("t", -6.44, 1.70, 0.0)], mat=m_blk)])
    parts.extend([fcap, rcap])
    return finish_part(join_objects(parts, "vss_forend"), sharp_deg=38.0)


# --- SUITE 2: RUSSIAN BIRCH LAMINATE STOCK, PSO-1M2-1 SCOPE, PLUM MAG & ORANGE FOLLOWER ---

def _chaikin_smooth_open(pts: list[tuple[float, float]], iterations: int = 2) -> list[tuple[float, float]]:
    """Endpoint-preserving quadratic Chaikin smoothing for organic curves between pinned corners."""
    cur = list(pts)
    for _ in range(iterations):
        if len(cur) < 3:
            break
        nxt = [cur[0]]
        for i in range(len(cur) - 1):
            x0, y0 = cur[i]
            x1, y1 = cur[i + 1]
            if i > 0:
                nxt.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            if i < len(cur) - 2:
                nxt.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        nxt.append(cur[-1])
        cur = nxt
    return cur


def _chaikin_smooth_closed(pts: list[tuple[float, float]], iterations: int = 2) -> list[tuple[float, float]]:
    """Closed-loop quadratic Chaikin smoothing for silky-smooth organic thumbhole apertures."""
    cur = list(pts)
    for _ in range(iterations):
        n = len(cur)
        nxt = []
        for i in range(n):
            x0, y0 = cur[i]
            x1, y1 = cur[(i + 1) % n]
            nxt.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            nxt.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        cur = nxt
    return cur


def _mk_filleted_hole_cutter(
    name: str,
    pts_xy: list[tuple[float, float]],
    z_half: float,
    fillet_r: float = 0.36,
    fillet_segs: int = 6,
    z_over: float = 2.35,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    clean = list(pts_xy)
    area = sum(
        clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
        for i in range(len(clean))
    )
    if area < 0:
        clean.reverse()
    n = len(clean)

    normals: list[tuple[float, float]] = []
    for i in range(n):
        p_prev = clean[(i - 1) % n]
        p_cur = clean[i]
        p_next = clean[(i + 1) % n]
        dx1, dy1 = p_cur[0] - p_prev[0], p_cur[1] - p_prev[1]
        l1 = max(1e-6, math.hypot(dx1, dy1))
        dx2, dy2 = p_next[0] - p_cur[0], p_next[1] - p_cur[1]
        l2 = max(1e-6, math.hypot(dx2, dy2))
        nx = (dy1 / l1) + (dy2 / l2)
        ny = (-dx1 / l1) + (-dx2 / l2)
        ln = max(1e-6, math.hypot(nx, ny))
        normals.append((nx / ln, ny / ln))

    z_base = z_half + 0.015 - fillet_r
    stations: list[tuple[float, float]] = [(-z_over, fillet_r + 0.07)]
    for k in range(fillet_segs, -1, -1):
        ang = (k / fillet_segs) * (0.5 * math.pi)
        stations.append((-(z_base + fillet_r * math.sin(ang)), fillet_r * (1.0 - math.cos(ang))))
    for k in range(0, fillet_segs + 1):
        ang = (k / fillet_segs) * (0.5 * math.pi)
        stations.append((+(z_base + fillet_r * math.sin(ang)), fillet_r * (1.0 - math.cos(ang))))
    stations.append((+z_over, fillet_r + 0.07))

    bm = bmesh.new()
    rings = []
    for z_pos, dr in stations:
        ring = [
            bm.verts.new((clean[i][0] + normals[i][0] * dr, clean[i][1] + normals[i][1] * dr, z_pos))
            for i in range(n)
        ]
        rings.append(ring)

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    for s in range(len(rings) - 1):
        for i in range(n):
            ni = (i + 1) % n
            bm.faces.new((rings[s][i], rings[s][ni], rings[s + 1][ni], rings[s + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, [])
    return _bm_to_obj(name, bm, mat)


def build_vss_wood_stock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: Organically 3D-Sculpted Russian Laminated Birchwood Skeleton Thumbhole Buttstock
    w/ Raised Cheek-Comb Swell, Ergonomic Pistol-Grip Palm Contour, Slender Thumb-Web Waist,
    6-Seg Filleted Thumbhole Arch, Vented Ribbed Rubber Buttpad & Open Steel Sling Loop!"""
    m_wood = mats["WO_RussianBirchLaminate"]
    m_rub = mats["WO_RubberPad"]
    m_st = mats["WO_ScopeSteelClamp"]

    seg_bottom_grip = _chaikin_smooth_open([
        (-13.85, -5.82),
        (-11.20, -5.48),
        ( -7.20, -4.90),
        ( -1.50, -4.62),
        (  4.50, -4.72),
        (  7.80, -5.50),
        ( 10.60, -5.60),
        ( 11.75, -4.62),
        ( 12.15, -2.55),
        ( 13.05, -0.20),
        ( 14.40,  2.35),
    ], iterations=2)
    seg_top_comb = _chaikin_smooth_open([
        ( 14.65,  5.05),
        ( 11.80,  5.05),
        (  9.20,  4.45),
        (  6.20,  4.62),
        (  1.50,  5.25),
        (-13.85,  5.25),
    ], iterations=2)
    outer_profile = seg_bottom_grip + seg_top_comb
    wood = mk_extrude_z("stk_wood", outer_profile, -1.68, 1.68, bevel=0.46, bevel_segs=6, mat=m_wood)

    hole_ctrl = [
        (-9.25, -2.65), (-7.50, -3.12), (-1.20, -3.02), ( 4.70, -2.92),
        ( 6.45, -2.15), ( 7.65,  0.40), ( 8.05,  2.15), ( 6.95,  2.95),
        ( 4.30,  3.12), (-7.45,  3.08), (-9.30,  2.10), (-9.70,  0.05),
    ]
    hole_profile = _chaikin_smooth_closed(hole_ctrl, iterations=2)
    hole = _mk_filleted_hole_cutter(
        "stk_hole", hole_profile, z_half=1.68, fillet_r=0.38, fillet_segs=6, z_over=2.35, mat=m_wood
    )
    bool_subtract(wood, [hole])

    # Clean manifold surface grid via bisect planes -> true 3D anatomical birchwood sculpting!
    # Exposes breathtaking multi-ply Russian birch lamination contour rings across EVERY swell & waist!
    bm = bmesh.new()
    bm.from_mesh(wood.data)
    for bx in (-12.5, -10.8, -9.0, -7.0, -5.0, -3.0, -1.0, 1.0, 3.0, 5.0, 7.0, 8.8, 10.4, 11.8, 13.2):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(bx, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
    for bz_h in (-4.4, -3.2, -1.8, -0.4, 1.0, 2.4, 3.8):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0.0, 0.0, bz_h), plane_no=(0.0, 0.0, 1.0))

    for v in bm.verts:
        tx, ty, tz = v.co.x, v.co.z, -v.co.y
        # Smooth blend to exact 1.0 at rear buttpad seam (tx <= -13.3) and steel QD tang (tx >= 13.8)
        end_m = _smoothstep_f(-13.4, -10.6, tx) * (1.0 - _smoothstep_f(11.8, 14.0, tx))
        # 1) Sculpted cheek-comb swell along upper strut (-10.5 .. +4.5, ty > 2.2)
        cheek_w = _smoothstep_f(-11.5, -7.0, tx) * (1.0 - _smoothstep_f(1.5, 6.2, tx)) * _smoothstep_f(1.8, 3.6, ty)
        # 2) Slender anatomical thumb-web waist above pistol grip (+8.0 .. +13.5, ty in [1.2 .. 4.8])
        waist_w = _smoothstep_f(6.8, 9.6, tx) * (1.0 - _smoothstep_f(12.2, 14.2, tx)) * _smoothstep_f(0.8, 3.2, ty)
        # 3) Anatomical pistol-grip palm swell (+7.5 .. +12.6, ty in [-4.8 .. +0.6])
        palm_w = _smoothstep_f(6.5, 9.2, tx) * (1.0 - _smoothstep_f(11.8, 13.4, tx)) * (1.0 - _smoothstep_f(-0.4, 1.8, ty))
        # 4) Slender tapered lower skeleton strut (-10.5 .. +6.5, ty < -2.4)
        strut_w = _smoothstep_f(-11.8, -8.5, tx) * (1.0 - _smoothstep_f(4.2, 7.6, tx)) * (1.0 - _smoothstep_f(-3.6, -1.6, ty))

        target_sz = 1.0 + 0.045 * cheek_w - 0.21 * waist_w + 0.03 * palm_w - 0.24 * strut_w
        sz = 1.0 + end_m * (target_sz - 1.0)
        # Slight ergonomic Monte-Carlo cheek-piece bias on left shooting side (-Z) for authentic SVD/VSS feel!
        v.co.y = -(tz * sz)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(wood.data)
    bm.free()

    # Contoured vented ribbed black vulcanized rubber recoil buttpad (X_loc in [-15.18, -13.78])
    pad_xy = (
        [(-13.78, 5.26), (-14.98, 5.20)]
        + sample_quad_bezier((-14.98, 5.20), (-14.78, -0.28), (-15.05, -5.82), segs=12)[1:]
        + [(-13.78, -5.84)]
    )
    pad = mk_extrude_z("stk_pad", pad_xy, -1.72, 1.72, bevel=0.22, bevel_segs=4, mat=m_rub)
    # 3 pairs of sculpted lateral shock-absorbing recoil vent slots + 2 rear mounting screw recesses!
    pad_cuts = []
    for vy in (-3.2, -0.2, 2.8):
        for side in (-1.0, 1.0):
            pad_cuts.append(
                mk_chamfered_stadium_cutter_z(
                    f"stk_pvent_{vy:.1f}_{side:+.0f}", cx=-14.38, cy=vy,
                    z_wall=side * 1.70, depth=0.38,
                    length=0.52, width=1.18, chamfer=0.05,
                    side_sign=side, segs=8, mat=m_rub,
                )
            )
    for sy in (-3.8, 3.2):
        pad_cuts.append(mk_cyl(f"stk_pscr_{sy:.1f}", 0.24, 0.24, 0.55, axis="x", segs=16, xform=[("t", -15.05, sy, 0.0)], mat=m_rub))
    bool_subtract(pad, pad_cuts)

    # Open rounded steel rear sling swivel loop on contoured oval mounting baseplate
    sling_base = mk_cyl("stk_sling_base", 0.52, 0.56, 0.36, axis="y", segs=22, xform=[("t", -11.4, -5.44, 0.0)], mat=m_st, bevel=0.05)
    sling_loop_pts = sample_cubic_bezier((-11.95, -5.35), (-12.05, -5.88), (-10.75, -5.88), (-10.85, -5.35), segs=14)
    sling_loop = mk_tube_along_pts("stk_sling_loop", [Vector((px, py, 0.0)) for px, py in sling_loop_pts], radius=0.11, ring_segs=12, mat=m_st)

    parts = [wood, pad, sling_base, sling_loop]
    for k in range(10):
        u = k / 9.0
        ry = -4.95 + u * 9.35
        rx_pad = -15.08 + 0.14 * (1.0 - (2.0 * u - 1.0) ** 2)
        parts.append(mk_box(f"stk_pad_rib_{k}", 0.14, 0.34, 3.16, [("t", rx_pad, ry, 0.0)], m_rub, bevel=0.04))
    # Steel Quick-Detach vertical dovetail receiver bracket & knurled spring release button
    parts.append(mk_box("stk_qd_lug", 1.12, 3.05, 2.76, [("t", 14.62, 3.88, 0.0)], m_st, bevel=0.07, bevel_segs=2))
    parts.append(mk_knurled_cyl("stk_qd_btn", 0.34, 0.36, axis="z", flutes=20, depth=0.020, xform=[("t", 14.35, 3.85, -1.48)], mat=m_st))

    return finish_part(join_objects(parts, "vss_wood_stock"), sharp_deg=42.0)


def build_vss_pso1_scope(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-07: Museum-Grade Soviet NPZ PSO-1M2-1 4×24 Illuminated Side-Mount Scope in Hammer-Tone Grey Enamel
    w/ Smooth 5-Bellows Accordion Rubber Eyecup, Domed Emerald-Violet AR Lenses, Knurled BDC Drums,
    Coin-Slotted AA Battery Cap & Chamfered Stadium Side-Mount Arm!"""
    m_grey = mats["WO_PSO1HammerGrey"]
    m_rub = mats["WO_RubberPad"]
    m_st = mats["WO_ScopeSteelClamp"]
    m_lens = mats["WO_ScopeLens"]

    # 1. Stepped PSO-1M2-1 main body + extendable sliding sunshade hood collar (preserves HERO_PSO_L/R!)
    pts_scope = [
        (0.00, -9.10), (1.38, -9.10), (1.46, -8.88), (1.46, -6.20),
        (1.22, -5.20), (1.22,  8.50), (1.48,  9.45), (1.60, 10.40),
        (1.64, 10.55), (1.64, 11.10), (1.58, 11.20), (1.62, 11.30),
        (1.62, 16.95), (1.46, 16.95), (1.46, 15.16), (0.00, 15.16),
    ]
    body = mk_lathe_x("pso_body", pts_scope, segs=48, mat=m_grey)
    oc_cut = mk_cyl("pso_occut", 1.24, 1.24, 0.90, axis="x", segs=36, xform=[("t", -9.00, 0.0, 0.0)], mat=m_grey)
    bool_subtract(body, [oc_cut])

    parts = [body]

    # 2. Silky-smooth 5-bellows pleated accordion black rubber eyecup (-X: X_loc in [-16.90, -9.05])
    pts_eyecup = [(1.34, -9.05), (1.44, -9.25)]
    n_bel = 40
    for i in range(n_bel + 1):
        u = i / n_bel
        x_b = -9.25 - u * 5.35  # -9.25 -> -14.60 (5 smooth sinusoidal pleats!)
        r_b = 1.33 + 0.14 * u + 0.16 * math.sin(u * 5.0 * math.tau)
        pts_eyecup.append((r_b, x_b))
    # Flared anatomical contoured rubber eye flange (-14.60 -> -16.90)
    pts_eyecup.extend([
        (1.48, -15.35), (1.60, -16.35), (1.56, -16.75), (1.46, -16.90),
        (1.30, -16.90), (1.24, -16.40), (1.22, -14.20), (1.02, -9.05), (1.34, -9.05),
    ])
    parts.append(mk_lathe_x("pso_eyecup", pts_eyecup, segs=44, mat=m_rub))

    # 3. Domed convex meniscus multi-coated emerald-violet AR objective & ocular lenses + retainer rings!
    obj_pts = [(0.00, 15.12), (1.44, 15.12), (1.44, 15.22)]
    for i in range(1, 9):
        u = i / 8.0
        r = 1.44 * (1.0 - u)
        x = 15.22 + 0.16 * math.sqrt(max(0.0, 1.0 - (r / 1.48) ** 2))
        obj_pts.append((r, x))
    parts.append(mk_lathe_x("pso_obj_lens", obj_pts, segs=36, mat=m_lens))

    oc_pts = [(0.00, -8.54), (1.22, -8.54), (1.22, -8.62)]
    for i in range(1, 8):
        u = i / 7.0
        r = 1.22 * (1.0 - u)
        x = -8.62 - 0.12 * math.sqrt(max(0.0, 1.0 - (r / 1.26) ** 2))
        oc_pts.append((r, x))
    parts.append(mk_lathe_x("pso_oc_lens", oc_pts, segs=36, mat=m_lens))

    # Chamfered black anodized objective lens retaining bezel ring
    ret_pts = [(1.34, 15.14), (1.47, 15.14), (1.47, 15.46), (1.38, 15.46), (1.34, 15.32), (1.34, 15.14)]
    parts.append(mk_lathe_x("pso_obj_bezel", ret_pts, segs=40, mat=m_st))

    # 4. Calibrated top BDC elevation drum (`1..4` = 100-400m) + deeply knurled crown & zero-reset cap screws!
    parts.append(mk_cyl("pso_elev_base", 0.96, 1.04, 0.56, axis="y", segs=36, xform=[("t", 0.3, 1.38, 0.0)], mat=m_grey, bevel=0.05))
    parts.append(mk_cyl("pso_elev_drum", 0.94, 0.94, 0.62, axis="y", segs=40, xform=[("t", 0.3, 1.92, 0.0)], mat=m_grey, bevel=0.03))
    parts.append(mk_knurled_cyl("pso_elev_cap", 0.96, 0.34, axis="y", flutes=34, depth=0.026, xform=[("t", 0.3, 2.40, 0.0)], mat=m_st))
    parts.append(mk_cyl("pso_elev_stud", 0.24, 0.24, 0.08, axis="y", segs=20, xform=[("t", 0.3, 2.58, 0.0)], mat=m_grey, bevel=0.02))
    # Right-side windage turret (+Z) with stepped collar & knurled cap
    parts.append(mk_cyl("pso_wind_base", 0.72, 0.80, 0.76, axis="z", segs=32, xform=[("t", 0.3, 0.0, 1.48)], mat=m_grey, bevel=0.05))
    parts.append(mk_knurled_cyl("pso_wind_cap", 0.76, 0.48, axis="z", flutes=28, depth=0.026, xform=[("t", 0.3, 0.0, 2.18)], mat=m_st))
    parts.append(mk_cyl("pso_wind_stud", 0.20, 0.20, 0.08, axis="z", segs=18, xform=[("t", 0.3, 0.0, 2.44)], mat=m_grey, bevel=0.02))

    # 5. Left-front AA battery housing + deeply knurled coin-slotted battery cap & pleated rubber illumination boot!
    parts.append(mk_cyl("pso_batt", 0.50, 0.52, 2.15, axis="y", segs=28, xform=[("t", 3.9, -1.55, -1.10)], mat=m_grey, bevel=0.04))
    batt_cap = mk_knurled_cyl("pso_batt_cap", 0.55, 0.38, axis="y", flutes=24, depth=0.024, xform=[("t", 3.9, -2.72, -1.10)], mat=m_st)
    batt_slot = mk_box("pso_batt_slot", 0.78, 0.14, 0.10, [("t", 3.9, -2.90, -1.10)], m_st)
    parts.append(bool_subtract(batt_cap, [batt_slot]))
    parts.append(mk_cyl("pso_illum_sw", 0.20, 0.26, 0.74, axis="x", segs=18, xform=[("t", 2.8, -1.65, -1.45)], mat=m_rub, bevel=0.05))

    # 6. Sculpted cast grey integral Warsaw Pact side-mount bracket arm w/ chamfered stadium lightening windows!
    parts.append(mk_box("pso_bridge", 9.6, 1.35, 2.30, [("t", -0.6, -1.45, -0.78)], m_grey, bevel=0.12, bevel_segs=3))
    arm = mk_box("pso_arm", 9.6, 4.95, 0.84, [("t", -0.6, -3.90, -1.78)], m_grey, bevel=0.10, bevel_segs=3)
    win1 = mk_chamfered_stadium_cutter_z("pso_win1", -2.7, -3.65, 2.20, 2.0, 3.20, 2.05, chamfer=0.08, through_both=True, segs=10, mat=m_grey)
    win2 = mk_chamfered_stadium_cutter_z("pso_win2",  1.5, -3.65, 2.20, 2.0, 3.20, 2.05, chamfer=0.08, through_both=True, segs=10, mat=m_grey)
    bool_subtract(arm, [win1, win2])
    parts.append(arm)
    # Bottom blued-steel dovetail clamp jaw + serrated castle tension nut + smoothly swept quick-throw lock lever!
    parts.append(mk_box("pso_clamp_jaw", 10.6, 1.58, 1.10, [("t", -0.6, -5.62, -1.68)], m_st, bevel=0.08, bevel_segs=2))
    lever_curve = sample_quad_bezier((-0.40, -5.75), (-2.45, -6.18), (-4.75, -6.08), segs=10)
    lever = mk_swept_bow("pso_clamp_lever", lever_curve, thickness=0.36, half_z=0.16, bevel=0.04, bevel_segs=2, mat=m_st)
    # Shift lever in Z to sit flush at -2.08
    bm_lv = bmesh.new()
    bm_lv.from_mesh(lever.data)
    for v in bm_lv.verts:
        v.co.y += 2.08  # Blender +Y = Three.js -Z!
    bm_lv.to_mesh(lever.data)
    bm_lv.free()
    parts.append(lever)
    parts.append(mk_knurled_cyl("pso_clamp_pin", 0.36, 0.42, axis="z", flutes=16, depth=0.025, xform=[("t", -0.4, -5.70, -2.04)], mat=m_st))

    return finish_part(join_objects(parts, "vss_pso1_scope"), sharp_deg=38.0)


def build_vss_mag_body(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: 10-Round 9×39mm Soviet Dark Plum-Brown Waffle-Ribbed Polymer Curved Magazine."""
    m = mats["WO_PlumMag"]
    m_st = mats["WO_MagSteel"]
    outer = mk_extrude_z(
        "mag_outer",
        [(-2.85, 5.82), (3.12, 5.82), (3.42, -5.72), (-2.48, -5.72)],
        -1.16, 1.16, bevel=0.16, bevel_segs=3, mat=m,
    )
    cav = mk_extrude_z(
        "mag_cav",
        [(-2.42, 6.05), (2.68, 6.05), (2.98, -5.95), (-2.05, -5.95)],
        -0.94, 0.94, bevel=0.04, mat=m,
    )
    bool_subtract(outer, [cav])

    parts = [outer]
    # Crisp 3D beveled Soviet waffle-grid reinforcing lattice ribs on both outer flanks!
    for i in range(4):
        ry = -3.8 + i * 2.35
        x_shift = 0.35 - (ry / 11.5) * 0.25
        parts.append(mk_box(f"mag_hrib_{i}", 5.45, 0.22, 2.44, [("t", x_shift, ry, 0.0)], m, bevel=0.04, bevel_segs=2))
    for k in range(3):
        rx = -1.35 + k * 1.65
        parts.append(mk_box(f"mag_vrib_{k}", 0.22, 9.6, 2.42, [("t", rx, -0.35, 0.0)], m, bevel=0.04, bevel_segs=2))
    # Steel-reinforced feed lip collar + front & rear locking lugs
    parts.append(mk_box("mag_front_lug", 0.56, 0.66, 1.46, [("t", 3.25, 4.95, 0.0)], m_st, bevel=0.05))
    parts.append(mk_box("mag_rear_lug", 0.54, 0.92, 1.38, [("t", -2.92, 4.15, 0.0)], m_st, bevel=0.05))
    parts.append(mk_box("mag_lip_l", 5.55, 0.52, 0.16, [("t", 0.14, 5.56, -1.04)], m_st, bevel=0.03))
    parts.append(mk_box("mag_lip_r", 5.55, 0.52, 0.16, [("t", 0.14, 5.56,  1.04)], m_st, bevel=0.03))

    return finish_part(join_objects(parts, "vss_mag_body"), sharp_deg=36.0)


def build_vss_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: Strictly Firewalled High-Visibility Safety-Orange Anti-Tilt 9×39mm Follower."""
    m = mats["WO_FollowerOrange"]
    skirt = mk_box("fol_skirt", 4.68, 0.84, 1.72, [("t", 0.05, -0.10, 0.0)], m, bevel=0.08, bevel_segs=2)
    step = mk_box("fol_step", 4.44, 0.34, 0.82, [("t", 0.08, 0.32, -0.42)], m, bevel=0.06, bevel_segs=2)
    return finish_part(join_objects([skirt, step], "vss_mag_follower"))


# --- SUITE 3: PERFORATED BARREL, 6-STAGE BAFFLE STACK, 6-LUG BOLT, LINEAR STRIKER & INTERNALS ---

def build_vss_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-01: 200mm Precision Rifled 9×39mm Barrel w/ 3 Rows of Chamfered Countersunk Radial
    Gas-Bleed Venting Ports & Detailed Compact Under-Suppressor Gas Tap Collar."""
    m_bbl = mats["M_BarrelBlued"]
    m_chr = mats["M_ChromeStainless"]

    pts_bbl = [
        (0.00, -1.20), (0.92, -1.20), (0.92, 1.05), (0.80, 1.25),
        (0.76, 19.82), (0.68, 20.00), (0.00, 20.00),
    ]
    bbl = mk_lathe_x("bbl_body", pts_bbl, segs=44, mat=m_bbl)
    pts_bore = [
        (0.00, -1.50), (0.57, -1.50), (0.57, 2.60), (0.45, 3.20),
        (0.45, 20.30), (0.00, 20.30),
    ]
    bore_cut = mk_lathe_x("bbl_bore", pts_bore, segs=36, mat=m_chr)

    # 3 rows × 6 radial gas-bleed venting ports with gleaming chamfered outer countersinks!
    cutters = [bore_cut]
    for i in range(6):
        px = 7.2 + i * 2.05
        # Row 1 (horizontal ±Z ports + chamfered outer bevels)
        cutters.append(mk_cyl(f"bbl_p1_{i}", 0.14, 0.14, 2.2, axis="z", segs=16, xform=[("t", px, 0.0, 0.0)], mat=m_chr))
        for side in (-1.0, 1.0):
            cutters.append(mk_cyl(
                f"bbl_p1c_{i}_{side:+.0f}", 0.20 if side > 0 else 0.12, 0.12 if side > 0 else 0.20, 0.14,
                axis="z", segs=16, xform=[("t", px, 0.0, side * 0.74)], mat=m_chr,
            ))
        # Row 2 & 3 (angled ±55° ports)
        for sgn in (-1.0, 1.0):
            cutters.append(mk_cyl(
                f"bbl_p2_{i}_{sgn}", 0.13, 0.13, 2.2, axis="y", segs=16,
                xform=[("rx", math.radians(55.0 * sgn)), ("t", px + 0.95, 0.0, 0.0)],
                mat=m_chr,
            ))
    bool_subtract(bbl, cutters)

    gas_block = mk_box("bbl_gblock", 4.35, 1.48, 1.48, [("t", 11.6, 0.78, 0.0)], m_bbl, bevel=0.08, bevel_segs=2)
    gas_cyl = mk_cyl("bbl_gcyl", 0.48, 0.48, 5.1, axis="x", segs=28, xform=[("t", 10.6, 1.25, 0.0)], mat=m_bbl, bevel=0.04)
    gas_bore = mk_cyl("bbl_gbore", 0.36, 0.36, 5.4, axis="x", segs=24, xform=[("t", 10.2, 1.25, 0.0)], mat=m_chr)
    bool_subtract(gas_cyl, [gas_bore])
    pin1 = mk_cyl("bbl_gpin1", 0.11, 0.11, 1.54, axis="z", segs=14, xform=[("t", 10.4, 0.42, 0.0)], mat=m_chr, bevel=0.015)
    pin2 = mk_cyl("bbl_gpin2", 0.11, 0.11, 1.54, axis="z", segs=14, xform=[("t", 12.8, 0.42, 0.0)], mat=m_chr, bevel=0.015)

    return finish_part(join_objects([bbl, gas_block, gas_cyl, pin1, pin2], "vss_barrel"), sharp_deg=36.0)


def build_vss_baffle_stack(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-02: THE ACOUSTIC CUTAWAY SHOWPIECE — Gleaming CNC Machined 6-Stage Slanted Asymmetric
    Diffuser Baffle Stack (`±28°`) w/ Chamfered Bore Lips, Grooved Flanges & Machined Tie-Spines!"""
    m = mats["M_BaffleCNC"]
    m_rail = mats["M_ChromeStainless"]

    parts = []
    # Grooved CNC rear & front alignment flanges
    rear_pts = [
        (0.00, -10.10), (1.58, -10.10), (1.62, -10.02), (1.62, -9.74),
        (1.52, -9.70), (1.52, -9.56), (1.62, -9.52), (1.62, -9.24),
        (1.58, -9.18), (0.00, -9.18),
    ]
    rear_ring = mk_lathe_x("baf_rear", rear_pts, segs=44, mat=m_rail)
    bool_subtract(rear_ring, [mk_cyl("baf_br", 0.54, 0.54, 1.8, axis="x", segs=30, xform=[("t", -9.64, -0.30, 0.0)], mat=m_rail)])
    front_pts = [(r, -x) for r, x in reversed(rear_pts)]
    front_ring = mk_lathe_x("baf_front", front_pts, segs=44, mat=m_rail)
    bool_subtract(front_ring, [mk_cyl("baf_bf", 0.54, 0.54, 1.8, axis="x", segs=30, xform=[("t", 9.64, -0.30, 0.0)], mat=m_rail)])

    spine_top = mk_box("baf_stop", 19.8, 0.30, 0.86, [("t", 0.0, 1.43, 0.0)], m_rail, bevel=0.05, bevel_segs=2)
    spine_bot = mk_box("baf_sbot", 19.8, 0.30, 0.86, [("t", 0.0, -1.43, 0.0)], m_rail, bevel=0.05, bevel_segs=2)
    spine_l = mk_box("baf_sl", 19.6, 0.62, 0.22, [("t", 0.0, 0.0, -1.48)], m_rail, bevel=0.04)
    parts.extend([rear_ring, front_ring, spine_top, spine_bot, spine_l])

    # 6 slanted asymmetric CNC diffuser baffle plates alternating +28° / -28° w/ chamfered bore lips!
    for i in range(6):
        bx = -7.30 + i * 2.92
        tilt = math.radians(28.0 if i % 2 == 0 else -28.0)
        plate = mk_cyl(
            f"baf_p_{i}", 1.59, 1.59, 0.36, axis="x", segs=40,
            xform=[("rz", tilt), ("t", bx, 0.0, 0.0)],
            mat=m, bevel=0.05,
        )
        notch_y = 1.42 if i % 2 == 0 else -1.42
        notch = mk_box(f"baf_n_{i}", 1.45, 0.96, 1.32, [("t", bx, notch_y, 0.0)], m, bevel=0.06)
        bore_p = mk_cyl(f"baf_bp_{i}", 0.54, 0.54, 2.8, axis="x", segs=30, xform=[("t", bx, -0.30, 0.0)], mat=m_rail)
        cham_p = mk_cyl(f"baf_bc_{i}", 0.64, 0.52, 0.28, axis="x", segs=28, xform=[("t", bx + 0.24, -0.30, 0.0)], mat=m_rail)
        bool_subtract(plate, [notch, bore_p, cham_p])
        parts.append(plate)

    core = join_objects(parts, "vss_baffle_stack")
    return finish_part(core, sharp_deg=36.0)


def build_vss_bolt_carrier(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-03: Long-Stroke Gas-Piston Bolt Carrier w/ Milled Cam Channel & Swept Right Charging Handle."""
    m_blk = mats["M_CarrierBlued"]
    m_chr = mats["M_ChromeStainless"]

    body = mk_box("bc_body", 12.2, 1.85, 2.26, [("t", -2.1, -0.15, 0.0)], m_blk, bevel=0.10, bevel_segs=2)
    bolt_bore = mk_cyl("bc_bbore", 0.68, 0.68, 12.8, axis="x", segs=28, xform=[("t", -2.1, -0.70, 0.0)], mat=m_chr)
    cam_slot = mk_box("bc_cam", 3.6, 0.68, 0.56, [("ry", math.radians(22.0)), ("t", 1.2, 0.25, 0.22)], m_chr)
    bool_subtract(body, [bolt_bore, cam_slot])

    rod = mk_cyl("bc_rod", 0.30, 0.34, 10.6, axis="x", segs=28, xform=[("t", 8.2, 0.55, 0.0)], mat=m_chr, bevel=0.03)
    pts_head = [
        (0.00, 12.90), (0.42, 12.90), (0.42, 13.30), (0.34, 13.35), (0.34, 13.48),
        (0.42, 13.53), (0.42, 13.92), (0.34, 13.97), (0.34, 14.10), (0.42, 14.15),
        (0.42, 14.68), (0.34, 14.80), (0.00, 14.80),
    ]
    piston_head = mk_lathe_x("bc_phead", pts_head, segs=32, xform=[("t", 0.0, 0.55, 0.0)], mat=m_chr)

    ch_pts = sample_quad_bezier((1.05, -0.10), (2.40, -0.10), (3.18, 0.24), segs=10)
    ch_stem = mk_tube_along_pts("bc_ch_stem", [Vector((3.1, py, pz)) for pz, py in ch_pts], radius=0.30, ring_segs=18, mat=m_blk)
    ch_knob = mk_cyl("bc_ch_knob", 0.40, 0.36, 0.78, axis="y", segs=24, xform=[("t", 3.1, 0.14, 3.18)], mat=m_blk, bevel=0.07)

    return finish_part(join_objects([body, rod, piston_head, ch_stem, ch_knob], "vss_bolt_carrier"), sharp_deg=36.0)


def build_vss_bolt(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-04: Gleaming Brushed-Stainless 6-Lug Cylindrical Precision Rotating Bolt."""
    m = mats["M_ChromeStainless"]
    m_blk = mats["M_CarrierBlued"]
    # Local origin at [1.8, 1.05, 0] -> X in [-4.3, +3.3]
    parts = [mk_cyl("bolt_body", 0.62, 0.60, 7.6, axis="x", segs=32, xform=[("t", -0.5, 0.0, 0.0)], mat=m, bevel=0.04)]
    # 6 symmetric radial locking lugs spaced every 60° around bolt head!
    for k in range(6):
        ang = k * math.pi / 3.0
        parts.append(mk_box(
            f"bolt_lug_{k}", 1.08, 0.34, 0.32,
            [("t", 2.68, 0.68, 0.0), ("rx", ang)],
            m, bevel=0.04,
        ))
    # Top helical cam lug & right claw extractor
    parts.append(mk_box("bolt_cam_lug", 0.78, 0.52, 0.42, [("t", -0.8, 0.78, 0.0)], m, bevel=0.05))
    parts.append(mk_box("bolt_ext", 2.1, 0.24, 0.24, [("t", 1.8, 0.12, 0.58)], m_blk, bevel=0.03))
    bolt = join_objects(parts, "vss_bolt")
    # Recessed 9×39mm bolt face + coaxial firing pin bore
    face = mk_cyl("bolt_face", 0.52, 0.52, 0.38, axis="x", segs=24, xform=[("t", 3.22, 0.0, 0.0)], mat=m)
    fp_bore = mk_cyl("bolt_fpb", 0.20, 0.20, 8.6, axis="x", segs=18, xform=[("t", -0.5, 0.0, 0.0)], mat=m)
    bool_subtract(bolt, [face, fp_bore])
    return finish_part(bolt)


def build_vss_striker(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: VSS Signature Hammerless Linear Rear Spring-Driven Firing Striker."""
    m = mats["M_ChromeStainless"]
    m_blk = mats["M_CarrierBlued"]
    # Local origin at [-6.4, 0.95, 0] -> X in [-3.15, +3.25]
    sleeve = mk_cyl("str_sleeve", 0.56, 0.58, 6.35, axis="x", segs=28, xform=[("t", 0.05, 0.0, 0.0)], mat=m, bevel=0.04)
    # Rear coaxial spring pocket
    pocket = mk_cyl("str_pock", 0.36, 0.36, 3.4, axis="x", segs=20, xform=[("t", -1.8, 0.0, 0.0)], mat=m)
    bool_subtract(sleeve, [pocket])
    sear_lug = mk_box("str_sear_lug", 1.72, 0.62, 0.66, [("t", -0.30, -0.61, 0.0)], m, bevel=0.05)
    guide_wings = mk_box("str_wings", 4.75, 0.32, 1.20, [("t", -0.20, 0.10, 0.0)], m_blk, bevel=0.04)
    return finish_part(join_objects([sleeve, sear_lug, guide_wings], "vss_striker"))


def build_vss_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-05: Coaxial Hardened Stainless Firing Pin."""
    m = mats["M_ChromeStainless"]
    pts = [
        (0.00, -4.30), (0.22, -4.30), (0.22, -3.10), (0.16, -2.95),
        (0.14, 2.85), (0.06, 3.82), (0.00, 3.82),
    ]
    return finish_part(mk_lathe_x("vss_firing_pin", pts, segs=24, mat=m))


def build_vss_recoil_guide(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """S-06: Telescoping Steel Recoil Guide Rod & Dust-Cover Latch Block."""
    m_blk = mats["M_CarrierBlued"]
    m_chr = mats["M_ChromeStainless"]
    rear_lug = mk_box("rg_lug", 1.10, 0.96, 1.02, [("t", -4.55, 0.02, 0.0)], m_blk, bevel=0.06)
    rod = mk_cyl("rg_rod", 0.20, 0.22, 9.2, axis="x", segs=20, xform=[("t", 0.10, 0.0, 0.0)], mat=m_chr, bevel=0.02)
    collar = mk_cyl("rg_col", 0.38, 0.38, 0.46, axis="x", segs=20, xform=[("t", 4.55, 0.0, 0.0)], mat=m_blk, bevel=0.03)
    return finish_part(join_objects([rear_lug, rod, collar], "vss_recoil_guide"))


def build_vss_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Smoothly Swept Curved Heat-Treated Steel Trigger & Horizontal Sear Transfer Linkage."""
    m = mats["M_CarrierBlued"]
    yoke = mk_box("tr_yoke", 3.4, 1.24, 0.96, [("t", 0.15, 0.98, 0.0)], m, bevel=0.07, bevel_segs=2)
    shoe_curve = sample_cubic_bezier((0.04, 0.44), (-0.12, -0.52), (-0.34, -1.32), (0.48, -2.02), segs=12)
    shoe = mk_swept_bow("tr_shoe", shoe_curve, thickness=0.48, half_z=0.29, bevel=0.06, bevel_segs=2, mat=m)
    return finish_part(join_objects([yoke, shoe], "vss_trigger"), sharp_deg=36.0)


def build_vss_sear(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-04: Linear Striker Catch Sear, Disconnector & Auto-Safety Trip Lever."""
    m = mats["M_ChromeStainless"]
    m_blk = mats["M_CarrierBlued"]
    bar = mk_box("sr_bar", 4.90, 0.80, 1.16, [("t", -0.10, -0.12, 0.0)], m, bevel=0.06)
    hook = mk_box("sr_hook", 1.16, 0.84, 0.84, [("t", -0.30, 0.42, 0.0)], m, bevel=0.05)
    trip = mk_box("sr_trip", 0.92, 0.72, 0.56, [("t", 1.75, 0.35, 0.32)], m_blk, bevel=0.04)
    return finish_part(join_objects([bar, hook, trip], "vss_sear"))


def build_vss_mag_spring(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-03: Static Solid Rectangular Zig-Zag Steel Magazine Drive Spring."""
    m = mats["M_SpringPhosphated"]
    # Local origin at [1.78, -10.90, 0] -> spans Y in [-1.42, +1.42]
    pts = []
    coils = 6
    steps = coils * 18
    rx, rz = 1.92, 0.60
    half_h = 1.36
    for i in range(steps + 1):
        u = i / steps
        th = u * coils * 2.0 * math.pi
        ct, st = math.cos(th), math.sin(th)
        sx = math.copysign(abs(ct) ** 0.55, ct) * rx
        sz = math.copysign(abs(st) ** 0.55, st) * rz
        sy = -half_h + 2.0 * half_h * u
        pts.append(Vector((sx, sy, sz)))
    return finish_part(mk_tube_along_pts("vss_mag_spring", pts, radius=0.065, ring_segs=8, mat=m))


def build_vss_mag_floorplate(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: Stamped Blued-Steel Quick-Slide Magazine Floorplate with Locking Detent Button."""
    m = mats["M_CarrierBlued"]
    m_chr = mats["M_ChromeStainless"]
    plate = mk_box("mfp_plate", 6.20, 0.60, 2.58, [("t", 0.12, -0.06, 0.0)], m, bevel=0.07, bevel_segs=2)
    detent = mk_cyl("mfp_det", 0.32, 0.32, 0.24, axis="y", segs=18, xform=[("t", 0.20, -0.28, 0.0)], mat=m_chr, bevel=0.03)
    return finish_part(join_objects([plate, detent], "vss_mag_floorplate"))


# =============================================================================
# Disjoint Zero-Bleed UV Unwrapping & Hero/Firewall Packing (CONCAVE >= 0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    include_face_fn=None,
    label: str = "pack",
    margin: float = 0.0048,
) -> int:
    active_objs = []
    sel_count = 0
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
        margin=margin,
        margin_method="SCALED",
        shape_method="CONCAVE",
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    du, dv = u1 - u0, v1 - v0
    pu0, pu1, pv0, pv1 = 1.0, 0.0, 1.0, 0.0
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
                ux = max(0.0, min(1.0, uv.x))
                vy = max(0.0, min(1.0, uv.y))
                pu0, pu1 = min(pu0, ux), max(pu1, ux)
                pv0, pv1 = min(pv0, vy), max(pv1, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    su, sv = pu1 - pu0, pv1 - pv0
    print(f"  [UV-PACK:{label:15s}] {len(active_objs):2d} objs ({sel_count:5d} faces) -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] span=({su:.3f},{sv:.3f})")
    assert su > 0.35 and sv > 0.35, f"UV pack {label} collapsed: ({su:.3f},{sv:.3f})"
    return sel_count


def unwrap_receiver_supp_atlas(objs: list[bpy.types.Object]) -> None:
    """Disjoint 2K UV atlas for `vss_v3_receiver_supp` (7 parts):
      - HERO_RECV_RIGHT (+Z): u in [0.015, 0.985], v in [0.800, 0.985]
      - HERO_RECV_LEFT  (-Z): u in [0.015, 0.985], v in [0.605, 0.785]
      - HERO_REAR_SIGHT (+Y): u in [0.020, 0.480], v in [0.460, 0.590]
      - PACK_RS_STEEL:        u in [0.010, 0.715], v in [0.010, 0.445]
      - PACK_RS_PLUM (moat!): u in [0.745, 0.990], v in [0.010, 0.585]
    """
    def classify(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "vss_forend" and mat_name == "RS_PlumPolymer":
            return "PLUM_PACK"
        if obj_name == "vss_receiver" and mat_name == "RS_MilledBlued":
            if -12.18 <= tx <= 6.18 and -2.08 <= ty <= 1.92:
                if nz > 0.85 and tz > 1.50:
                    return "HERO_R"
                if nz < -0.85 and -1.68 < tz < -1.50:
                    return "HERO_L"
        if obj_name == "vss_rear_sight" and mat_name == "RS_MilledBlued":
            if ny > 0.85 and ty > 0.42 and -2.85 <= tx <= 2.45 and abs(tz) <= 0.54:
                return "HERO_SIGHT"
        return "STEEL_PACK"

    c_steel = _smart_unwrap_and_pack_rect(
        objs, 0.010, 0.715, 0.010, 0.445,
        include_face_fn=lambda on, f, mn: classify(on, f, mn) == "STEEL_PACK",
        label="rs_steel", margin=0.0048,
    )
    c_plum = _smart_unwrap_and_pack_rect(
        objs, 0.745, 0.990, 0.010, 0.585,
        include_face_fn=lambda on, f, mn: classify(on, f, mn) == "PLUM_PACK",
        label="rs_plum", margin=0.0050,
    )

    hero_cnt = {"HERO_R": 0, "HERO_L": 0, "HERO_SIGHT": 0}
    for o in objs:
        if o.name not in ("vss_receiver", "vss_rear_sight"):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            cls = classify(o.name, f, mname)
            if cls not in hero_cnt:
                continue
            hero_cnt[cls] += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                if cls == "HERO_R":
                    xn = max(0.0, min(1.0, (tx - (-12.2)) / 18.4))
                    yn = max(0.0, min(1.0, (ty - (-2.10)) / 4.05))
                    loop[uv_layer].uv = (0.015 + xn * 0.970, 0.800 + yn * 0.185)
                elif cls == "HERO_L":
                    xn = max(0.0, min(1.0, (tx - (-12.2)) / 18.4))
                    yn = max(0.0, min(1.0, (ty - (-2.10)) / 4.05))
                    loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.605 + yn * 0.180)
                elif cls == "HERO_SIGHT":
                    xn = max(0.0, min(1.0, (tx - (-2.90)) / 5.40))
                    zn = max(0.0, min(1.0, (tz + 0.55) / 1.10))
                    loop[uv_layer].uv = (0.020 + xn * 0.460, 0.460 + (1.0 - zn) * 0.130)
        bm.to_mesh(o.data)
        bm.free()

    print(f"  [UV-HERO] receiver_supp: {hero_cnt} | steel={c_steel}, plum={c_plum}")
    for k, v in hero_cnt.items():
        assert v > 0, f"Receiver/Supp hero {k} captured 0 faces!"


def unwrap_wood_optic_atlas(objs: list[bpy.types.Object]) -> None:
    """Disjoint 2K UV atlas for `vss_v3_wood_optic` (4 parts) with >100px UV firewalls:
      - HERO_PSO1_LEFT:      u in [0.015, 0.640], v in [0.835, 0.985]
      - HERO_PSO1_RIGHT:     u in [0.015, 0.640], v in [0.680, 0.820]
      - HERO_PSO1_ELEV:      u in [0.015, 0.440], v in [0.555, 0.665]
      - PACK_WOOD:           u in [0.010, 0.640], v in [0.010, 0.535]
      - FIREWALL_LENS:       u in [0.695, 0.985], v in [0.760, 0.985] (>110 px moat!)
      - FIREWALL_FOLLOWER:   u in [0.700, 0.985], v in [0.460, 0.705] (>110 px moat!)
      - PACK_OPTIC_MAG:      u in [0.690, 0.990], v in [0.010, 0.405] (>100 px moat!)
    """
    def classify(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "vss_mag_follower":
            return "FW_FOLLOWER"
        if obj_name == "vss_wood_stock":
            return "WOOD_PACK"
        if obj_name == "vss_pso1_scope":
            if mat_name == "WO_ScopeLens":
                return "FW_LENS_OBJ" if tx > 0.0 else "FW_LENS_OC"
            if mat_name == "WO_PSO1HammerGrey":
                # Top BDC elevation drum outer cylinder (X near 0.3, Y in [1.62, 2.22], radial normal)
                if abs(tx - 0.30) <= 0.98 and 1.62 <= ty <= 2.22 and abs(ny) < 0.35:
                    return "HERO_ELEV"
                # Scope main tube & bell left/right flanks for crisp Cyrillic markings
                if -5.0 <= tx <= 15.8 and -1.15 <= ty <= 1.15:
                    if nz < -0.55 and tz < -0.70:
                        return "HERO_PSO_L"
                    if nz > 0.55 and tz > 0.70:
                        return "HERO_PSO_R"
        return "OPTIC_MAG_PACK"

    c_wood = _smart_unwrap_and_pack_rect(
        objs, 0.010, 0.640, 0.010, 0.535,
        include_face_fn=lambda on, f, mn: classify(on, f, mn) == "WOOD_PACK",
        label="wo_wood", margin=0.0048,
    )
    c_fol = _smart_unwrap_and_pack_rect(
        objs, 0.700, 0.985, 0.460, 0.705,
        include_face_fn=lambda on, f, mn: classify(on, f, mn) == "FW_FOLLOWER",
        label="wo_follower_fw", margin=0.0060,
    )
    c_om = _smart_unwrap_and_pack_rect(
        objs, 0.690, 0.990, 0.010, 0.405,
        include_face_fn=lambda on, f, mn: classify(on, f, mn) == "OPTIC_MAG_PACK",
        label="wo_optic_mag", margin=0.0048,
    )

    hero_cnt = {"HERO_PSO_L": 0, "HERO_PSO_R": 0, "HERO_ELEV": 0, "FW_LENS_OBJ": 0, "FW_LENS_OC": 0}
    pso = next(o for o in objs if o.name == "vss_pso1_scope")
    bm = bmesh.new()
    bm.from_mesh(pso.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in pso.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify("vss_pso1_scope", f, mname)
        if cls not in hero_cnt:
            continue
        hero_cnt[cls] += 1
        # Check seam wrap on elevation drum cylindrical angle (counter-clockwise so numbers read L->R upright!)
        if cls == "HERO_ELEV":
            angs = []
            for loop in f.loops:
                vco = loop.vert.co
                tx, tz = vco.x - 0.30, -vco.y
                angs.append((math.atan2(-tz, tx) + math.pi) / (2.0 * math.pi))
            wrap = (max(angs) - min(angs)) > 0.5
            for loop, a in zip(f.loops, angs):
                vco = loop.vert.co
                ty = vco.z
                u_n = (a - 1.0) if (wrap and a > 0.5) else a
                u_n = max(0.0, min(1.0, u_n))
                v_n = max(0.0, min(1.0, (ty - 1.60) / 0.64))
                loop[uv_layer].uv = (0.015 + u_n * 0.425, 0.555 + v_n * 0.110)
            continue

        for loop in f.loops:
            vco = loop.vert.co
            tx, ty, tz = vco.x, vco.z, -vco.y
            if cls == "HERO_PSO_L":
                xn = max(0.0, min(1.0, (tx - (-5.2)) / 21.4))
                yn = max(0.0, min(1.0, (ty + 1.55) / 3.10))
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.625, 0.835 + yn * 0.150)
            elif cls == "HERO_PSO_R":
                xn = max(0.0, min(1.0, (tx - (-5.2)) / 21.4))
                yn = max(0.0, min(1.0, (ty + 1.55) / 3.10))
                loop[uv_layer].uv = (0.015 + xn * 0.625, 0.680 + yn * 0.140)
            elif cls == "FW_LENS_OBJ":
                lu = max(-1.0, min(1.0, tz / 1.48))
                lv = max(-1.0, min(1.0, ty / 1.48))
                loop[uv_layer].uv = (0.785 + lu * 0.080, 0.872 + lv * 0.080)
            elif cls == "FW_LENS_OC":
                lu = max(-1.0, min(1.0, -tz / 1.26))
                lv = max(-1.0, min(1.0, ty / 1.26))
                loop[uv_layer].uv = (0.928 + lu * 0.050, 0.872 + lv * 0.050)
    bm.to_mesh(pso.data)
    bm.free()

    print(f"  [UV-HERO] wood_optic: {hero_cnt} | wood={c_wood}, follower={c_fol}, optic_mag={c_om}")
    for k, v in hero_cnt.items():
        assert v > 0, f"Wood/Optic hero {k} captured 0 faces!"


def unwrap_metal_atlas(objs: list[bpy.types.Object]) -> None:
    """Disjoint 2K UV atlas for `vss_v3_metal` (11 cutaway ordnance & acoustic parts):
      - Zone 1 (6-stage baffle stack + 200mm ported barrel): u in [0.010, 0.990], v in [0.510, 0.990]
      - Zone 2 (bolt carrier + 6-lug bolt + striker + firing pin): u in [0.010, 0.560], v in [0.010, 0.495]
      - Zone 3 (guide rod + trigger + sear + mag spring + floorplate): u in [0.580, 0.990], v in [0.010, 0.495]
    """
    z1 = {"vss_barrel", "vss_baffle_stack"}
    z2 = {"vss_bolt_carrier", "vss_bolt", "vss_striker", "vss_firing_pin"}

    c1 = _smart_unwrap_and_pack_rect(
        objs, 0.010, 0.990, 0.510, 0.990,
        include_face_fn=lambda on, f, mn: on in z1,
        label="metal_z1_acoust", margin=0.0048,
    )
    c2 = _smart_unwrap_and_pack_rect(
        objs, 0.010, 0.560, 0.010, 0.495,
        include_face_fn=lambda on, f, mn: on in z2,
        label="metal_z2_action", margin=0.0048,
    )
    c3 = _smart_unwrap_and_pack_rect(
        objs, 0.580, 0.990, 0.010, 0.495,
        include_face_fn=lambda on, f, mn: on not in z1 and on not in z2,
        label="metal_z3_fcgmag", margin=0.0048,
    )
    print(f"  [UV-PACK] metal: Z1={c1}, Z2={c2}, Z3={c3}")


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


def _remove_bake_image_nodes(created: list[tuple]) -> None:
    for nt, tex in created:
        nt.nodes.remove(tex)


def _route_bsdf_input_to_emit(mats_set: set[bpy.types.Material], input_name: str) -> list[tuple]:
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


def _restore_bsdf(saved: list[tuple]) -> None:
    for nt, out, emit, orig_link in saved:
        if orig_link is not None:
            nt.links.new(orig_link, out.inputs["Surface"])
        nt.nodes.remove(emit)


def _save_image_npy(img: bpy.types.Image, filepath: Path) -> None:
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgb = buf.reshape((h, w, 4))[::-1, :, :3].copy()
    np.save(filepath, rgb)


def _set_grid_isolated_layout(all_objs: list[bpy.types.Object]) -> None:
    for i, o in enumerate(all_objs):
        o.location = (0.0, i * 120.0, 0.0)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False


def _set_assembled_exterior_layout(all_objs: list[bpy.types.Object]) -> None:
    for o in all_objs:
        if o.name in EXTERIOR_CONTACT_AO_PARTS:
            o.hide_render = False
            px, py, pz = ASSEMBLED_POS[o.name]
            o.location = t2b(px, py, pz)
            o.rotation_euler = (0.0, 0.0, 0.0)
        else:
            o.hide_render = True
            o.location = (0.0, 400.0, 0.0)


def _set_identity_layout(all_objs: list[bpy.types.Object]) -> None:
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
    default_albedo=(0.045, 0.050, 0.055, 1.0),
) -> None:
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(tag: str, bake_type: str, samples: int, fill_color=(0.0, 0.0, 0.0, 1.0),
                 normal_op: bool = False, extra_objs_override=None) -> None:
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

        kwargs = dict(type=bake_type, margin=5, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=default_albedo)
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.35, 0.35, 0.35, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.72
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    if ext_targets:
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
        bpy.ops.object.bake(type="EMIT", margin=5, use_clear=False)
        _save_image_npy(img_m, tmp_dir / f"{prefix}_ext_mask.npy")
        _remove_bake_image_nodes(nodes_m)
        bpy.data.images.remove(img_m)

        for o in ext_targets:
            o.data.materials.clear()
            for m in orig_mats[o.name]:
                o.data.materials.append(m)
        bpy.data.materials.remove(white_mat)
    else:
        np.save(tmp_dir / f"{prefix}_ao_ext.npy", np.ones((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))
        np.save(tmp_dir / f"{prefix}_ext_mask.npy", np.zeros((ATLAS_SIZE, ATLAS_SIZE, 3), dtype=np.float32))


# =============================================================================
# Hard-Contract Verification, Exploded Clearance Audit & Draco GLB Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> None:
    total_tris = 0
    local_bboxes = {}
    max_bbox_delta = 0.0

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

        local_bboxes[o.name] = (bmin, bmax)
        ref_min, ref_max = CSG_REF_BBOX[o.name]
        deltas = [abs(bmin[i] - ref_min[i]) for i in range(3)] + [abs(bmax[i] - ref_max[i]) for i in range(3)]
        d_max = max(deltas)
        max_bbox_delta = max(max_bbox_delta, d_max)
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.35) else "WARN"
        print(f"  [{status}] {o.name:22s} tris={tris:6d} non_man={non_man:2d} vol={vol:8.2f} max_delta={d_max:.3f}cm")
        assert non_man == 0, f"MANIFOLD VIOLATION on {o.name}: non_man={non_man}"
        assert vol > 0.0, f"NEGATIVE/ZERO VOLUME on {o.name}: vol={vol}"

    exp_boxes = {}
    for pid, (bmin, bmax) in local_bboxes.items():
        ap = ASSEMBLED_POS[pid]
        eo = EXPLODE_OFFSET_T1[pid]
        shift = (ap[0] + eo[0], ap[1] + eo[1], ap[2] + eo[2])
        exp_boxes[pid] = (
            (bmin[0] + shift[0], bmin[1] + shift[1], bmin[2] + shift[2]),
            (bmax[0] + shift[0], bmax[1] + shift[1], bmax[2] + shift[2]),
        )
    for sp_id, info in CSG_SKIPPED_SPRING_INFO.items():
        ap = info["pos"]
        bmin, bmax = info["bbox"]
        eo = EXPLODE_OFFSET_T1[sp_id]
        shift = (ap[0] + eo[0], ap[1] + eo[1], ap[2] + eo[2])
        exp_boxes[sp_id] = (
            (bmin[0] + shift[0], bmin[1] + shift[1], bmin[2] + shift[2]),
            (bmax[0] + shift[0], bmax[1] + shift[1], bmax[2] + shift[2]),
        )

    exp_overlaps = []
    pids = list(exp_boxes.keys())
    for i in range(len(pids)):
        for j in range(i + 1, len(pids)):
            a0, a1 = exp_boxes[pids[i]]
            b0, b1 = exp_boxes[pids[j]]
            ox = min(a1[0], b1[0]) - max(a0[0], b0[0])
            oy = min(a1[1], b1[1]) - max(a0[1], b0[1])
            oz = min(a1[2], b1[2]) - max(a0[2], b0[2])
            if ox > 0.05 and oy > 0.05 and oz > 0.05:
                exp_overlaps.append((pids[i], pids[j], round(ox, 2), round(oy, 2), round(oz, 2)))
    print(f"[VERIFY] {len(all_objs)} solid parts | total_tris={total_tris:,} | worst_delta={max_bbox_delta:.3f}cm | t=1.0_overlaps={len(exp_overlaps)}")
    assert len(exp_overlaps) == 0, f"t=1.0 exploded overlaps found: {exp_overlaps}"


def export_draco_glb(all_objs: list[bpy.types.Object]) -> None:
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


def render_qa_previews(all_objs: list[bpy.types.Object]) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 3
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25

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

    mat_rs = make_baked_mat("QA_RS", "vss_v3_receiver_supp", 0.88)
    mat_wo = make_baked_mat("QA_WO", "vss_v3_wood_optic", 0.90)
    mat_m = make_baked_mat("QA_M", "vss_v3_metal", 0.84)

    rs_set, wo_set = set(RECEIVER_SUPP_PARTS), set(WOOD_OPTIC_PARTS)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in rs_set:
            o.data.materials.append(mat_rs)
        elif o.name in wo_set:
            o.data.materials.append(mat_wo)
        else:
            o.data.materials.append(mat_m)
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)
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

    def add_softbox(name: str, loc_t: tuple, aim_t: tuple, energy: float, sx: float, sy: float):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y, ld.energy = sx, sy, energy
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = t2b(*loc_t)
        lo.rotation_euler = (t2b(*aim_t) - lo.location).to_track_quat("-Z", "Y").to_euler()

    add_softbox("KeyR", (4.0, 28.0,  34.0), (2.0, -1.0, 0.0), 5500.0, 72.0, 16.0)
    add_softbox("KeyL", (4.0, 28.0, -34.0), (2.0, -1.0, 0.0), 5500.0, 72.0, 16.0)
    add_softbox("FillR", (4.0, 2.0,  48.0), (2.0, -1.0, 0.0), 1600.0, 80.0, 20.0)
    add_softbox("FillL", (4.0, 2.0, -48.0), (2.0, -1.0, 0.0), 1600.0, 80.0, 20.0)

    cam_d = bpy.data.cameras.new("QACam")
    cam = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(fname: str, eye_t: tuple, tgt_t: tuple, lens: float = 52.0):
        cam_d.lens = lens
        cam.location = t2b(*eye_t)
        cam.rotation_euler = (t2b(*tgt_t) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"/tmp/{fname}"
        bpy.ops.render.render(write_still=True)
        print(f"[QA-RENDER] Saved /tmp/{fname}")

    # 1. Right Hero Profile (Full 89.4 cm rifle)
    shoot("vss_qa_right.png", (3.0, 3.0, 128.0), (3.0, -1.5, 0.0), lens=48.0)
    # 2. Left Hero Profile (PSO-1M2-1 side mount + laminated thumbhole birch stock!)
    shoot("vss_qa_left.png", (3.0, 3.0, -128.0), (3.0, -1.5, 0.0), lens=48.0)
    # 3. Macro Right Receiver Rollmark + Trigger Guard + Safety + Plum Mag + PSO-1!
    shoot("vss_qa_macro_right.png", (2.0, 1.8, 25.0), (-2.0, -0.5, 0.0), lens=55.0)
    # 4. Macro Left PSO-1M2-1 Scope + Birch Laminated Stock + Dovetail Clamp!
    shoot("vss_qa_macro_pso1.png", (-14.0, 6.5, -28.0), (-6.0, 2.8, -1.0), lens=54.0)
    # 5. Cutaway Reveal (hide outer shells to inspect 200mm ported barrel + 6-stage baffle stack + 6-lug bolt + linear striker!)
    for hide_name in ("vss_suppressor_tube", "vss_forend", "vss_dust_cover", "vss_mag_body"):
        bpy.data.objects[hide_name].hide_render = True
    shoot("vss_qa_internals.png", (16.0, 7.5, 58.0), (14.0, 0.5, 0.0), lens=50.0)


def main() -> None:
    t_start = time.time()
    do_preview = "--preview" in sys.argv
    reset_scene()
    mats = create_material_library()

    builders = {
        # Suite 1: Receiver, Suppressor, Dust Cover, Sight, Safety, Selector & Forend (7 parts)
        "vss_receiver":        build_vss_receiver,
        "vss_dust_cover":      build_vss_dust_cover,
        "vss_suppressor_tube": build_vss_suppressor_tube,
        "vss_rear_sight":      build_vss_rear_sight,
        "vss_safety_lever":    build_vss_safety_lever,
        "vss_selector_switch": build_vss_selector_switch,
        "vss_forend":          build_vss_forend,
        # Suite 2: Laminated Birch Stock, PSO-1M2-1 Scope, Plum Mag & Orange Follower (4 parts)
        "vss_wood_stock":      build_vss_wood_stock,
        "vss_pso1_scope":      build_vss_pso1_scope,
        "vss_mag_body":        build_vss_mag_body,
        "vss_mag_follower":    build_vss_mag_follower,
        # Suite 3: Perforated Barrel, 6-Stage Baffle Stack, 6-Lug Bolt, Linear Striker & Internals (11 parts)
        "vss_barrel":          build_vss_barrel,
        "vss_baffle_stack":    build_vss_baffle_stack,
        "vss_bolt_carrier":    build_vss_bolt_carrier,
        "vss_bolt":            build_vss_bolt,
        "vss_striker":         build_vss_striker,
        "vss_firing_pin":      build_vss_firing_pin,
        "vss_recoil_guide":    build_vss_recoil_guide,
        "vss_trigger":         build_vss_trigger,
        "vss_sear":            build_vss_sear,
        "vss_mag_spring":      build_vss_mag_spring,
        "vss_mag_floorplate":  build_vss_mag_floorplate,
    }

    print("[BUILD] Sculpting all 22 solid Soviet VSS Vintorez (9x39mm) hard-surface parts...")
    built = {pid: fn(mats) for pid, fn in builders.items()}

    rs_objs = [built[pid] for pid in RECEIVER_SUPP_PARTS]
    wo_objs = [built[pid] for pid in WOOD_OPTIC_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    all_objs = rs_objs + wo_objs + metal_objs
    assert len(all_objs) == 22

    print("[VERIFY] Auditing manifoldness, outward volume, CSG alignment & t=1.0 exploded clearance...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K PBR suites: receiver_supp (7), wood_optic (4), metal (11)...")
    unwrap_receiver_supp_atlas(rs_objs)
    unwrap_wood_optic_atlas(wo_objs)
    unwrap_metal_atlas(metal_objs)

    for label, group in (("receiver_supp", rs_objs), ("wood_optic", wo_objs), ("metal", metal_objs)):
        tot_area = 0.0
        for o in group:
            uvs = o.data.uv_layers.active.data
            oa = 0.0
            for p in o.data.polygons:
                pts = [uvs[li].uv for li in p.loop_indices]
                for pt in pts:
                    assert -1e-4 <= pt.x <= 1.0001 and -1e-4 <= pt.y <= 1.0001, (
                        f"Out-of-bounds UV on {o.name}: ({pt.x:.4f}, {pt.y:.4f})"
                    )
                for i in range(1, len(pts) - 1):
                    a, b, c = pts[0], pts[i], pts[i + 1]
                    oa += 0.5 * abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y))
            tot_area += oa
            assert 0.00002 < oa < 0.85, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:14s}: total_uv_area={tot_area:.4f} (strictly <= 0.98)")
        assert 0.18 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="vss_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking vss_v3_receiver_supp (2048x2048, 7 parts)...")
        bake_atlas_suite("rs", rs_objs, all_objs, tmp_dir, default_albedo=(0.042, 0.046, 0.052, 1.0))
        print("[CYCLES] Baking vss_v3_wood_optic (2048x2048, 4 parts)...")
        bake_atlas_suite("wo", wo_objs, all_objs, tmp_dir, default_albedo=(0.10, 0.05, 0.02, 1.0))
        print("[CYCLES] Baking vss_v3_metal (2048x2048, 11 parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, default_albedo=(0.055, 0.060, 0.066, 1.0))

        print("[POST] Compositing Tula TOZ Cyrillic rollmarks, PSO-1M2-1 markings, lenses & 5-ch Packed ORM...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "vss_v3_receiver_supp_albedo.webp",
        TEX_OUT_DIR / "vss_v3_receiver_supp_normal.webp",
        TEX_OUT_DIR / "vss_v3_receiver_supp_roughness.webp",
        TEX_OUT_DIR / "vss_v3_wood_optic_albedo.webp",
        TEX_OUT_DIR / "vss_v3_wood_optic_normal.webp",
        TEX_OUT_DIR / "vss_v3_wood_optic_roughness.webp",
        TEX_OUT_DIR / "vss_v3_metal_albedo.webp",
        TEX_OUT_DIR / "vss_v3_metal_normal.webp",
        TEX_OUT_DIR / "vss_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== VSS VINTOREZ (9x39mm) V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:42s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"  SKIPPED DYNAMIC SPRINGS: {SKIPPED_DYNAMIC_SPRING_PARTS}")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"

    if do_preview:
        print("\n[QA] Rendering 5 Cycles studio QA plates to /tmp/vss_qa_*.png...")
        render_qa_previews(all_objs)

    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")


if __name__ == "__main__":
    main()
