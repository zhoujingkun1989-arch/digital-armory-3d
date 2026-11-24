#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for Benelli M4 Super 90 / USMC M1014 (12 Gauge)
===========================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 4 — Final 19/19 Grand Slam)

Generates:
  - public/models/benellim4.glb (Draco-compressed glTF 2.0, all 23 solid parts; skips ONLY the
    3 dynamic GPU-compressed helical springs carrying `aSpringParam`:
    `benellim4_recoil_spring`, `benellim4_hammer_spring`, `benellim4_mag_spring`)
  - public/textures/benellim4_v3_receiver_{albedo,normal,roughness}.webp  (2048x2048 Packed ORM)
  - public/textures/benellim4_v3_metal_{albedo,normal,roughness}.webp     (2048x2048 Packed ORM)
  - public/textures/benellim4_v3_furniture_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 unit = 1 cm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det = +1 (proper rotation +90 deg X).
  - Option A: Cycles contact AO is baked with exterior parts at assembledPos/assembledRot,
    then all 23 objects are reset to identity transform (0,0,0) before glTF export so every
    mesh resides in exact local part space matching `src/weapons/benellim4/plugin.ts`.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_benellim4_photoreal.py
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
# MODE 2: System Python Post-Process (Benelli Urbino / USMC M1014 Laser Etching,
#         Italian Gardone PSF Proof Stars, MIL-STD-1913 T2-T14, Barrel Proofs,
#         RNM Micro-Grain Blending & 5-Channel Packed ORM WebP Export)
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
    FONT_ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    FONT_FALLBACKS = (
        FONT_ARIAL,
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

    # Authentic 16x16 ECC200 DataMatrix for USMC M1014 NSN 1005-01-472-3147 / Y062418U10
    _M1014_UID_ROWS = (
        "1010101010101010",
        "1101100101001101",
        "1011011011100110",
        "1100101100110101",
        "1001110010101100",
        "1110101101010011",
        "1011001011001010",
        "1101110100110101",
        "1000101011011000",
        "1110010101100111",
        "1011101100101100",
        "1100110011010011",
        "1010011101001010",
        "1101101010110101",
        "1001010101100100",
        "1111111111111111",
    )

    def _draw_five_star(draw: ImageDraw.ImageDraw, cx: float, cy: float, r_out: float, fill: int = 255):
        r_in = r_out * 0.40
        pts = []
        for i in range(10):
            ang = -math.pi * 0.5 + i * math.pi / 5.0
            rad = r_out if (i % 2 == 0) else r_in
            pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
        draw.polygon(pts, fill=fill)

    def _draw_italian_gardone_proofs(draw: ImageDraw.ImageDraw, x: float, y: float, h_px: float):
        """Authentic Italian Banco Nazionale di Prova (Gardone Val Trompia) proof marks:
        1) Star over crowned shield 'PSF' (Polvere Senza Fumo — double nitro magnum proof, 2 stars!)
        2) Star over shield 'FINITO' (finished firearm inspection proof)
        3) Boxed Italian date-code cartouche '[CF]' (2010 USMC M1014 contract batch)
        """
        lw = max(3, round(h_px * 0.055))
        f_psf = _load_font(FONT_COND, round(h_px * 0.34))
        f_sm = _load_font(FONT_COND, round(h_px * 0.28))

        # 1) Twin stars over PSF magnum nitro shield
        c1x = x + h_px * 0.42
        _draw_five_star(draw, c1x - h_px * 0.16, y + h_px * 0.16, h_px * 0.13)
        _draw_five_star(draw, c1x + h_px * 0.16, y + h_px * 0.16, h_px * 0.13)
        sh_w, sh_t, sh_b = h_px * 0.34, y + h_px * 0.34, y + h_px * 0.94
        draw.polygon(
            [
                (c1x - sh_w, sh_t),
                (c1x + sh_w, sh_t),
                (c1x + sh_w, y + h_px * 0.72),
                (c1x, sh_b),
                (c1x - sh_w, y + h_px * 0.72),
            ],
            outline=255,
            width=lw,
        )
        draw.text((c1x, y + h_px * 0.60), "PSF", font=f_psf, fill=255, anchor="mm")

        # 2) Single star over Gardone crossed-rifles / FINITO proof shield
        c2x = x + h_px * 1.24
        _draw_five_star(draw, c2x, y + h_px * 0.16, h_px * 0.13)
        draw.polygon(
            [
                (c2x - sh_w * 0.92, sh_t),
                (c2x + sh_w * 0.92, sh_t),
                (c2x + sh_w * 0.92, y + h_px * 0.72),
                (c2x, sh_b),
                (c2x - sh_w * 0.92, y + h_px * 0.72),
            ],
            outline=255,
            width=lw,
        )
        draw.text((c2x, y + h_px * 0.60), "CIP", font=f_sm, fill=255, anchor="mm")

        # 3) Boxed Italian proof year code [CF]
        bx0 = x + h_px * 1.76
        bx1 = bx0 + h_px * 0.68
        by0 = y + h_px * 0.36
        by1 = y + h_px * 0.90
        draw.rectangle((bx0, by0, bx1, by1), outline=255, width=lw)
        draw.text(((bx0 + bx1) * 0.5, (by0 + by1) * 0.52), "CF", font=f_psf, fill=255, anchor="mm")

    # =========================================================================
    # SUITE 1: benellim4_v3_receiver (7 parts: receiver, rail, sights, trigger group)
    # =========================================================================
    def process_receiver_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "recv_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "recv_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "recv_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "recv_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "recv_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "recv_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "recv_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.34 + 0.66 * np.power(np.clip(ao, 0.0, 1.0), 0.80), 0.32, 1.0).astype(np.float32)

        # Hero UV bands for Benelli M4 Receiver flanks (X in [-10.80, +10.20], Y in [-1.92, +2.82]):
        #   Hero Band 1 (Left  Flank, -Z): u in [0.015, 0.985] (1 - xn: +X muzzle -> LEFT), v in [0.765, 0.985]
        #   Hero Band 2 (Right Flank, +Z): u in [0.015, 0.985] (xn:     -X rear   -> LEFT), v in [0.525, 0.745]
        #   Hero Band 3 (Top M1913 Rail):  u in [0.015, 0.985] (X in [-5.20, +9.40]),       v in [0.440, 0.505]
        PPCM = 220.0
        X0, XSPAN = -10.80, 21.00
        Y0, YSPAN = -1.92, 4.74
        CW, CH = int(round(XSPAN * PPCM)), int(round(YSPAN * PPCM))  # 4620 x 1043

        def yw_to_cy(yw: float) -> int:
            return int(round((1.0 - (yw - Y0) / YSPAN) * CH))

        def xw_to_cx_right(xw: float) -> int:
            return int(round((xw - X0) / XSPAN * CW))

        def xw_to_cx_left(xw: float) -> int:
            return int(round((1.0 - (xw - X0) / XSPAN) * CW))

        laser_w = np.zeros((h, w), dtype=np.float32)
        engrave_d = np.zeros((h, w), dtype=np.float32)
        uid_bg = np.zeros((h, w), dtype=np.float32)
        hull_kiss = np.zeros((h, w), dtype=np.float32)

        # --- 1) LEFT RECEIVER FLANK (-Z): BENELLI ARMI S.P.A. - URBINO - ITALY / M4 SUPER 90 / USMC M1014 ---
        # Flat unbroken flank spans X in [-8.8, +9.2], Y in [-1.25, +2.15].
        # Note: on Left flank, +X is LEFT -> cx_left(+8.6) is left edge, cx_left(-8.2) is right edge!
        l_las = Image.new("L", (CW, CH), 0)
        l_eng = Image.new("L", (CW, CH), 0)
        dl_l = ImageDraw.Draw(l_las)
        de_l = ImageDraw.Draw(l_eng)

        # Primary factory laser-etched Urbino block centered nicely on forward-mid flank (X in [-3.4 .. +8.4])
        lx0 = xw_to_cx_left(8.20)
        ly_top = yw_to_cy(1.78)
        dl_l.text((lx0, ly_top), "BENELLI ARMI S.P.A. - URBINO - ITALY", fill=255, font=_load_font(FONT_DIN, 92))
        dl_l.text((lx0, ly_top + 110), 'M4 SUPER 90  -  12 GA. 3" MAGNUM', fill=255, font=_load_font(FONT_DIN, 108))

        # Crisp dividing hairline rule + USMC M1014 military acceptance & serial row
        rule_y = ly_top + 236
        dl_l.rectangle((lx0, rule_y, lx0 + 1860, rule_y + 6), fill=215)
        dl_l.text((lx0, rule_y + 26), "USMC  M1014   JOINT SERVICE COMBAT SHOTGUN", fill=248, font=_load_font(FONT_COND, 76))
        dl_l.text((lx0, rule_y + 114), "SER.  Y062418U10", fill=252, font=_load_font(FONT_DIN, 74))

        # Authentic Italian Gardone Val Trompia Proof Stars + PSF + CIP + [CF] cartouche behind main block!
        # Placed cleanly in X in [-8.2 .. -4.2], Y in [+0.20 .. +1.65]
        px_l = xw_to_cx_left(-3.65)
        py_l = yw_to_cy(1.48)
        _draw_italian_gardone_proofs(dl_l, px_l, py_l, 220.0)
        dl_l.text((px_l + 24, py_l + 250), "MADE IN ITALY", fill=232, font=_load_font(FONT_COND, 70))
        de_l.text((px_l + 24, py_l + 250), "MADE IN ITALY", fill=210, font=_load_font(FONT_COND, 70))

        # Subtle struck proof depth under main laser letters
        de_l.text((lx0, ly_top + 110), 'M4 SUPER 90  -  12 GA. 3" MAGNUM', fill=190, font=_load_font(FONT_DIN, 108))

        _paste_uv_band(laser_w, l_las, 0.015, 0.985, 0.765, 0.985)
        _paste_uv_band(engrave_d, l_eng, 0.015, 0.985, 0.765, 0.985)

        # --- 2) RIGHT RECEIVER FLANK (+Z): BENELLI U.S.A. CORP. ACCOKEEK, MD + U.S. M1014 UID ---
        # Strictly clear of:
        #   - 3" Ejection port:  X in [+0.55, +7.95], Y in [+0.68, +2.06]
        #   - Charging slot:     X in [-4.90, +0.65], Y in [+1.25, +1.75]
        #   - Bolt release btn:  X in [+6.45, +7.55], Y in [-1.25, -0.35]
        #   - Trigger pin hole:  (-8.95, -1.73)
        r_las = Image.new("L", (CW, CH), 0)
        r_eng = Image.new("L", (CW, CH), 0)
        r_bg = Image.new("L", (CW, CH), 0)
        r_kiss = Image.new("L", (CW, CH), 0)
        dl_r = ImageDraw.Draw(r_las)
        de_r = ImageDraw.Draw(r_eng)
        db_r = ImageDraw.Draw(r_bg)
        dk_r = ImageDraw.Draw(r_kiss)

        # A) Forward-lower right flat strictly below ejection port & left of bolt-release button!
        #    X in [-2.60 .. +6.05], Y in [-1.30 .. +0.42]
        rx0 = xw_to_cx_right(-2.40)
        ry0 = yw_to_cy(0.28)
        dl_r.text((rx0, ry0), "BENELLI U.S.A. CORP.  ACCOKEEK, MD", fill=255, font=_load_font(FONT_DIN, 86))
        dl_r.text((rx0, ry0 + 98), '12 GA. 76mm (3")  -  A.R.G.O. GAS SYSTEM', fill=248, font=_load_font(FONT_COND, 74))
        dl_r.text((rx0, ry0 + 182), "U.S. PAT. 5,827,992   -   READ OWNERS MANUAL", fill=236, font=_load_font(FONT_COND, 62))
        de_r.text((rx0, ry0), "BENELLI U.S.A. CORP.  ACCOKEEK, MD", fill=185, font=_load_font(FONT_DIN, 86))

        # B) Rear right flat behind charging slot: X in [-9.40 .. -5.25], Y in [-0.75 .. +1.70]
        ux0 = xw_to_cx_right(-9.15)
        uy0 = yw_to_cy(1.52)
        ux1 = xw_to_cx_right(-5.35)
        uy1 = yw_to_cy(0.18)
        db_r.rounded_rectangle((ux0, uy0, ux1, uy1), radius=14, fill=255)
        dl_r.rounded_rectangle((ux0 + 8, uy0 + 8, ux1 - 8, uy1 - 8), radius=10, outline=255, width=5)

        plate_h = uy1 - uy0
        mod_px = max(8, (plate_h - 46) // 16)
        dm_x0 = ux0 + 26
        dm_y0 = uy0 + (plate_h - 16 * mod_px) // 2
        for ri, row_bits in enumerate(_M1014_UID_ROWS):
            for ci, bit in enumerate(row_bits):
                if bit == "1":
                    mx = dm_x0 + ci * mod_px
                    my = dm_y0 + ri * mod_px
                    dl_r.rectangle((mx, my, mx + mod_px - 1, my + mod_px - 1), fill=255)

        utx = dm_x0 + 16 * mod_px + 28
        dl_r.text((utx, uy0 + 36), "U.S.  M1014", font=_load_font(FONT_DIN, 62), fill=255)
        dl_r.text((utx, uy0 + 114), "NSN 1005-01-472", font=_load_font(FONT_COND, 52), fill=248)
        dl_r.text((utx, uy0 + 178), "CAGE  1B5Y8", font=_load_font(FONT_COND, 50), fill=244)
        dl_r.text((utx, uy0 + 236), "SN Y062418U10", font=_load_font(FONT_COND, 48), fill=244)

        # Delicate brass / crimson-hull kiss marks behind right ejection port lip (X in [-0.15 .. +0.52], Y in [0.92 .. 1.82])
        rng_k = np.random.default_rng(1014)
        for _ in range(24):
            kx = float(xw_to_cx_right(float(rng_k.uniform(-0.10, 0.50))))
            ky = float(yw_to_cy(float(rng_k.uniform(0.95, 1.78))))
            krx, kry = float(rng_k.uniform(6, 16)), float(rng_k.uniform(3, 8))
            dk_r.ellipse((kx - krx, ky - kry, kx + krx, ky + kry), fill=int(rng_k.integers(85, 215)))

        _paste_uv_band(laser_w, r_las, 0.015, 0.985, 0.525, 0.745)
        _paste_uv_band(engrave_d, r_eng, 0.015, 0.985, 0.525, 0.745)
        _paste_uv_band(uid_bg, r_bg, 0.015, 0.985, 0.525, 0.745)
        _paste_uv_band(hull_kiss, r_kiss, 0.015, 0.985, 0.525, 0.745)

        # --- 3) TOP MIL-STD-1913 PICATINNY RAIL WHITE LASER T2..T14 NUMBERS ---
        # Matches 14 lugs across X in [-5.20, +9.40] (span 14.60 cm), slots at X = -4.00 .. +8.00 (pitch 1.00 cm)
        RW, RH = int(round(14.60 * 240.0)), int(round(2.12 * 240.0))  # 3504 x 509
        rail_las = Image.new("L", (RW, RH), 0)
        dl_rail = ImageDraw.Draw(rail_las)
        f_rail = _load_font(FONT_DIN, 74)
        for slot_num in (2, 4, 6, 8, 10, 12, 14):
            # Slot i centered at X = -4.00 + (slot_num - 2) * 1.00; lug sits 0.50 cm ahead/behind
            lug_x = -4.50 + (slot_num - 1) * 1.00
            xn = (lug_x - (-5.20)) / 14.60
            rx_c = int(round(xn * RW))
            # Left flat deck shoulder (z ~ -0.60 -> ~22% from top of top-down Z[-1.06..+1.06] canvas)
            dl_rail.text((rx_c, int(RH * 0.20)), f"T{slot_num}", font=f_rail, fill=255, anchor="mm")
        _paste_uv_band(laser_w, rail_las, 0.015, 0.985, 0.440, 0.505)

        # --- 4) Brushed Satin Hard-Anodize Micro-Grain & Handling Scratches on Flanks ---
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        walls = (
            (u_grid >= 0.015)
            & (u_grid <= 0.985)
            & (
                ((v_grid >= 0.765) & (v_grid <= 0.985))
                | ((v_grid >= 0.525) & (v_grid <= 0.745))
            )
        ).astype(np.float32)

        rng = np.random.default_rng(1015)
        raw_n = rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32)
        # Silky horizontal brushed CNC micro-grain + Type-III bead-blast texture
        anodize_grain = (
            ndimage.gaussian_filter(raw_n, sigma=(0.45, 14.0)) * 0.64
            + ndimage.gaussian_filter(raw_n, sigma=(1.1, 1.1)) * 0.36
        )
        anodize_grain = np.clip(anodize_grain * 1.35, -1.0, 1.0) * walls
        oil_cloud = ndimage.gaussian_filter(
            rng.normal(0.0, 1.0, size=(h // 4, w // 4)).astype(np.float32), sigma=9.0
        )
        oil_cloud = np.repeat(np.repeat(oil_cloud, 4, axis=0), 4, axis=1)
        oil_cloud = np.clip(oil_cloud * 2.4, -1.0, 1.0) * walls

        # Subtle field-handling bare-aluminum micro-scratches on receiver flanks
        sc_img = Image.new("L", (w, h), 0)
        dsc = ImageDraw.Draw(sc_img)
        for _ in range(95):
            sx = float(rng.uniform(0.02, 0.98) * w)
            sy = float(rng.uniform(0.02, 0.47) * h)
            length = float(rng.uniform(14, 62))
            ang = math.radians(float(rng.uniform(-16, 16)))
            dsc.line(
                [(sx, sy), (sx + math.cos(ang) * length, sy + math.sin(ang) * length)],
                fill=int(rng.integers(70, 185)),
                width=1,
            )
        sc = (np.asarray(sc_img, dtype=np.float32) / 255.0) * walls
        _mix(albedo, (0.62, 0.65, 0.70), sc * 0.26)
        rgh = np.clip(rgh + 0.020 * anodize_grain + 0.022 * oil_cloud - sc * 0.055, 0.16, 0.94)
        met = np.clip(met + sc * 0.10, 0.00, 0.98)

        # Composite brass shell-rim deflection kisses behind ejection port
        hull_kiss = _smoothstep(0.14, 0.58, ndimage.gaussian_filter(hull_kiss, sigma=0.9))
        _mix(albedo, (0.76, 0.58, 0.24), hull_kiss * 0.48)
        _mix(rgh, 0.24, hull_kiss * 0.50)
        _mix(met, 0.92, hull_kiss * 0.60)

        # Composite dark matte UID DataMatrix aluminum tag background
        plate_bev = _bevel_mask(uid_bg, width_px=2.0)
        _mix(albedo, (0.085, 0.090, 0.098), uid_bg * 0.95)
        _mix(rgh, 0.36, uid_bg * 0.90)
        _mix(met, 0.42, uid_bg * 0.90)

        # Composite razor-sharp silver-white Benelli factory laser etching!
        las_bev = _bevel_mask(laser_w, width_px=1.2)
        eng_bev = _bevel_mask(engrave_d, width_px=1.4)
        decal_height = (
            0.018 * anodize_grain
            + 0.22 * plate_bev
            - 0.34 * las_bev
            - 0.44 * eng_bev
            - 0.04 * sc
        )
        _mix(albedo, (0.86, 0.88, 0.91), laser_w * 0.92)
        _mix(rgh, 0.36, laser_w * 0.82)
        _mix(met, 0.48, laser_w * 0.72)
        ao *= (1.0 - 0.12 * laser_w) * (1.0 - 0.10 * engrave_d)

        decal_nrm = _height_to_normal_01(decal_height, strength=2.4)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.16, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_receiver_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved benellim4_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    # =========================================================================
    # SUITE 2: benellim4_v3_metal (12 parts: barrel, ARGO pistons/plugs, BCG, bolt, mag tube/cap, elevator)
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
        # Gentle contact AO blend so ARGO manifold & barrel sections near forend stay luminous!
        ao_contact = np.minimum(ao_self, ao_self * 0.62 + ao_ext * 0.38)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.34, 1.0).astype(np.float32)

        # Barrel Left Upper Chamber Hero Rollmark Band:
        #   Barrel X in [26.0, 44.0] (open barrel forward of forend X=32.7!), upper-left flank (-Z, Y > +0.15)
        #   UV Band: u in [0.015, 0.985] (1 - xn: muzzle LEFT -> breech RIGHT), v in [0.895, 0.985]
        BW, BH = 3600, 340
        b_stamp = Image.new("L", (BW, BH), 0)
        db = ImageDraw.Draw(b_stamp)
        f_b1 = _load_font(FONT_DIN, 78)
        f_b2 = _load_font(FONT_COND, 62)
        # Center along X in [33.5 .. 42.5] (clearly visible ahead of polymer forend!)
        # xn = (X - 26.0) / 18.0 -> left flank cx = (1 - xn) * BW: X=42.5 -> 0.083*BW=300, X=33.5 -> 0.583*BW=2100
        db.text((340, 62), 'BENELLI ARMI  -  12 GA. 3" (76mm)  CHROME LINED', fill=255, font=f_b1)
        db.text((340, 168), '18.5" CYL.  -  READ SAFETY MANUAL  -  MADE IN ITALY', fill=242, font=f_b2)
        _draw_italian_gardone_proofs(db, 2120, 74, 175.0)

        barrel_m = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(barrel_m, b_stamp, 0.015, 0.985, 0.895, 0.985)

        # Subtle lathe-turned satin grain on barrel hero band
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        b_zone = ((u_grid >= 0.015) & (u_grid <= 0.985) & (v_grid >= 0.895) & (v_grid <= 0.985)).astype(np.float32)

        rng = np.random.default_rng(1200)
        grain_b = ndimage.gaussian_filter(rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32), sigma=(6.0, 0.55))
        grain_b = np.clip(grain_b * 1.4, -1.0, 1.0) * b_zone

        decal_h = 0.016 * grain_b - 0.42 * _bevel_mask(barrel_m, width_px=1.3)
        _mix(albedo, (0.76, 0.78, 0.80), barrel_m * 0.80)
        _mix(rgh, 0.40, barrel_m * 0.72)
        _mix(met, 0.52, barrel_m * 0.65)
        ao *= 1.0 - 0.14 * barrel_m
        rgh = np.clip(rgh + 0.018 * grain_b, 0.09, 0.92)

        decal_nrm = _height_to_normal_01(decal_h, strength=2.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.09, 0.92)
        met = np.clip(met, 0.00, 0.99)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_metal_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved benellim4_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    # =========================================================================
    # SUITE 3: benellim4_v3_furniture (4 parts: forend, recoil_tube, telestock, firewalled orange follower)
    # =========================================================================
    def process_furniture_atlas():
        alb_lin = _read_f32_rgb(tmp_dir / "furn_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "furn_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "furn_metalness.npy")[..., 0]
        nrm = _sanitize_normals(_read_f32_rgb(tmp_dir / "furn_normal.npy"))
        ao_self = _read_f32_rgb(tmp_dir / "furn_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "furn_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "furn_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.3, 0.7, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.36 + 0.64 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.34, 1.0).astype(np.float32)

        # Subtle glass-fiber nylon micro-molding grain across polymer zone (strictly outside orange follower box!)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        poly_zone = (v_grid >= 0.285).astype(np.float32)

        rng = np.random.default_rng(1019)
        poly_n = ndimage.gaussian_filter(rng.normal(0.0, 1.0, size=(h, w)).astype(np.float32), sigma=0.85)
        poly_n = np.clip(poly_n * 1.4, -1.0, 1.0) * poly_zone
        rgh = np.clip(rgh + 0.018 * poly_n, 0.16, 0.94)

        decal_nrm = _height_to_normal_01(0.015 * poly_n, strength=1.8)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.16, 0.94)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_furniture_albedo.webp", "WEBP", quality=92, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_furniture_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "benellim4_v3_furniture_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved benellim4_v3_furniture_{albedo,normal,roughness}.webp (2048x2048)")

    process_receiver_atlas()
    process_metal_atlas()
    process_furniture_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "benellim4.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 16
STOCK_ANGLE = 0.244  # 14.0 deg downward M1014 stock recoil-tube drop around +Z

# Exact Three.js (X=muzzle, Y=up, Z=right) -> Blender (X=muzzle, Y=-right, Z=up) matrix (det = +1)
T2B_MAT = Matrix((
    (1.0,  0.0,  0.0, 0.0),
    (0.0,  0.0, -1.0, 0.0),
    (0.0,  1.0,  0.0, 0.0),
    (0.0,  0.0,  0.0, 1.0),
))


def t2b(x: float, y: float, z: float) -> Vector:
    return Vector((x, -z, y))


# Exact 23 solid Benelli M4 / USMC M1014 parts across 3 dedicated 2048x2048 hero texture suites
# (skipping ONLY the 3 dynamic GPU-compressed helical springs carrying `aSpringParam`:
#  `benellim4_recoil_spring`, `benellim4_hammer_spring`, `benellim4_mag_spring`)
RECEIVER_PARTS = [
    "benellim4_receiver",
    "benellim4_picatinny_rail",
    "benellim4_front_sight",
    "benellim4_rear_sight",
    "benellim4_trigger_housing",
    "benellim4_trigger",
    "benellim4_safety_button",
]

METAL_PARTS = [
    "benellim4_barrel",
    "benellim4_argo_pistons",
    "benellim4_argo_plugs",
    "benellim4_bolt_carrier",
    "benellim4_bolt_head",
    "benellim4_cam_pin",
    "benellim4_firing_pin",
    "benellim4_charging_handle",
    "benellim4_hammer",
    "benellim4_mag_tube",
    "benellim4_mag_cap",
    "benellim4_shell_elevator",
]

FURNITURE_PARTS = [
    "benellim4_forend",
    "benellim4_recoil_tube",
    "benellim4_telestock",
    "benellim4_mag_follower",
]

# Exterior parts receiving assembled inter-part contact AO (internal & moving action parts get clean Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "benellim4_receiver",
    "benellim4_picatinny_rail",
    "benellim4_front_sight",
    "benellim4_rear_sight",
    "benellim4_trigger_housing",
    "benellim4_trigger",
    "benellim4_safety_button",
    "benellim4_barrel",
    "benellim4_charging_handle",
    "benellim4_mag_tube",
    "benellim4_mag_cap",
    "benellim4_forend",
    "benellim4_recoil_tube",
    "benellim4_telestock",
}

# Exact assembledPos from src/weapons/benellim4/plugin.ts (all 23 solid parts have assembledRot = (0,0,0)!)
ASSEMBLED_POS = {
    "benellim4_barrel":          (  0.000,  1.350,  0.000),
    "benellim4_argo_pistons":    ( 15.200,  0.120,  0.000),
    "benellim4_argo_plugs":      ( 23.100,  0.120,  0.000),
    "benellim4_bolt_carrier":    (  1.200,  1.350,  0.000),
    "benellim4_bolt_head":       (  5.400,  1.350,  0.000),
    "benellim4_cam_pin":         (  3.200,  2.080,  0.000),
    "benellim4_firing_pin":      (  0.950,  1.350,  0.000),
    "benellim4_charging_handle": (  3.600,  1.500,  1.650),
    "benellim4_receiver":        (  0.000,  0.000,  0.000),
    "benellim4_picatinny_rail":  (  0.000,  0.000,  0.000),
    "benellim4_front_sight":     ( 51.600,  2.550,  0.000),
    "benellim4_rear_sight":      ( -7.800,  2.820,  0.000),
    "benellim4_forend":          ( 21.500, -0.350,  0.000),
    "benellim4_recoil_tube":     (-10.400,  0.350,  0.000),
    "benellim4_telestock":       (-27.600, -3.950,  0.000),
    "benellim4_trigger_housing": ( -6.100, -2.150,  0.000),
    "benellim4_trigger":         ( -6.200, -2.650,  0.000),
    "benellim4_hammer":          ( -5.150, -1.550,  0.000),
    "benellim4_safety_button":   ( -8.350, -3.150,  0.000),
    "benellim4_mag_tube":        ( 30.900, -1.250,  0.000),
    "benellim4_mag_cap":         ( 52.350, -1.250,  0.000),
    "benellim4_mag_follower":    ( 19.600, -1.250,  0.000),
    "benellim4_shell_elevator":  ( -3.650, -1.680,  0.000),
}

# Ground-truth CSG reference bounding boxes (Three.js local space) measured from src/weapons/benellim4/meshes/*.ts
CSG_REF_BBOX = {
    "benellim4_barrel":          ((  6.495,  -4.120,  -1.820), ( 53.500,   1.530,   1.820)),
    "benellim4_argo_pistons":    (( -8.800,  -0.400,  -1.580), (  5.400,   0.400,   1.580)),
    "benellim4_argo_plugs":      (( -1.250,  -0.642,  -1.822), (  1.360,   0.642,   1.822)),
    "benellim4_bolt_carrier":    (( -8.854,  -1.490,  -1.436), (  5.200,   0.860,   1.436)),
    "benellim4_bolt_head":       (( -4.150,  -1.360,  -1.020), (  1.510,   1.360,   1.080)),
    "benellim4_cam_pin":         (( -0.440,  -0.850,  -0.440), (  0.440,   0.620,   0.440)),
    "benellim4_firing_pin":      (( -5.920,  -0.240,  -0.240), (  5.920,   0.240,   0.240)),
    "benellim4_charging_handle": (( -0.480,  -0.480,  -0.880), (  0.480,   0.480,   1.280)),
    "benellim4_receiver":        ((-10.800,  -1.920,  -1.760), ( 10.200,   2.820,   1.950)),
    "benellim4_picatinny_rail":  (( -5.200,   2.750,  -1.060), (  9.400,   3.320,   1.060)),
    "benellim4_front_sight":     (( -1.150,  -0.150,  -0.568), (  1.050,   1.833,   0.568)),
    "benellim4_rear_sight":      (( -1.550,  -0.050,  -1.240), (  1.550,   1.555,   1.240)),
    "benellim4_forend":          ((-11.200,  -2.480,  -2.290), ( 11.200,   1.680,   2.290)),
    "benellim4_recoil_tube":     ((-22.410, -12.062,  -1.620), (  0.770,   1.448,   1.620)),
    "benellim4_telestock":       (( -7.500,  -8.105,  -1.820), (  7.838,   5.150,   2.055)),
    "benellim4_trigger_housing": (( -3.700,  -2.858,  -1.840), (  5.050,   0.955,   1.840)),
    "benellim4_trigger":         (( -0.855,  -1.961,  -0.640), (  1.245,   1.150,   0.640)),
    "benellim4_hammer":          (( -2.220,  -0.280,  -0.660), (  0.380,   1.920,   0.660)),
    "benellim4_safety_button":   (( -0.330,  -0.276,  -0.740), (  5.710,   0.840,   0.900)),
    "benellim4_mag_tube":        ((-20.900,  -1.480,  -2.140), ( 20.700,   1.480,   1.480)),
    "benellim4_mag_cap":         (( -1.050,  -1.490,  -1.490), (  1.050,   1.490,   1.490)),
    "benellim4_mag_follower":    (( -1.150,  -1.045,  -1.020), (  1.150,   1.045,   1.020)),
    "benellim4_shell_elevator":  (( -0.560,  -0.240,  -0.880), (  8.895,   1.020,   0.990)),
}


# =============================================================================
# Scene & Physically Calibrated Benelli Urbino / USMC M1014 Material Library
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
    edge_srgb: tuple[float, float, float] = (0.78, 0.81, 0.85),
    grain_scale: float = 38.0,
    grain_bump: float = 0.030,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 68.0,
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
        min(1.0, base_srgb[0] * 1.06),
        min(1.0, base_srgb[1] * 1.06),
        min(1.0, base_srgb[2] * 1.06),
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
        ao_edge = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao_edge.samples = 8
        ao_edge.inside = True
        ao_edge.only_local = True
        ao_edge.inputs["Distance"].default_value = 0.055

        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.24
        ramp.color_ramp.elements[0].color = (edge_wear, edge_wear, edge_wear, 1.0)
        ramp.color_ramp.elements[1].position = 0.64
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


def _build_argo_piston_chrome_mat() -> bpy.types.Material:
    """Gleaming Mirror-Chrome 17-4PH ARGO Short-Stroke Pistons w/ authentic gas-face carbon scorch ring!"""
    mat = bpy.data.materials.new("M_ArgoMirrorChrome")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    # Piston local X spans [-8.80 .. +5.40]; gas cup scorch ring concentrates near front X in [4.05 .. 5.40]
    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 3.90
    mr_x.inputs["From Max"].default_value = 5.40
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 6.5
    n_soot.inputs["Detail"].default_value = 5.0
    n_soot.inputs["Roughness"].default_value = 0.65
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    mul_s = nt.nodes.new("ShaderNodeMath")
    mul_s.operation = "MULTIPLY_ADD"
    mul_s.inputs[1].default_value = 0.22
    nt.links.new(n_soot.outputs["Fac"], mul_s.inputs[0])
    nt.links.new(mr_x.outputs["Result"], mul_s.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.89, 0.91, 0.94)  # mirror hard-chrome piston shaft & flutes
    cr.elements[1].position = 0.52
    cr.elements[1].color = srgb_to_lin(0.87, 0.89, 0.92)
    for pos, rgb in (
        (0.72, (0.62, 0.52, 0.38)),  # subtle straw-bronze gas heat tint on forward land
        (0.88, (0.28, 0.26, 0.25)),  # thin 12ga carbon ring near gas cup lip
        (0.98, (0.14, 0.14, 0.15)),  # gas-face carbon cup interior
    ):
        el = cr.elements.new(pos)
        el.color = srgb_to_lin(*rgb)
    nt.links.new(mul_s.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.62
    rr.elements[0].color = (0.11, 0.11, 0.11, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.58, 0.58, 0.58, 1.0)
    nt.links.new(mul_s.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.78
    rm.elements[0].color = (0.98, 0.98, 0.98, 1.0)
    rm.elements[1].position = 0.98
    rm.elements[1].color = (0.42, 0.42, 0.42, 1.0)
    nt.links.new(mul_s.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (4.0, 0.45, 0.45)
    nt.links.new(texcoord.outputs["Object"], mapping.inputs["Vector"])
    n_grain = nt.nodes.new("ShaderNodeTexNoise")
    n_grain.inputs["Scale"].default_value = 32.0
    n_grain.inputs["Detail"].default_value = 4.0
    nt.links.new(mapping.outputs["Vector"], n_grain.inputs["Vector"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.016
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.016
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(n_grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def _build_muzzle_crown_soot_mat() -> bpy.types.Material:
    """18.5" 12-Gauge Mobilchoke Crown: satin parkerized steel -> realistic 12ga gunpowder muzzle soot."""
    mat = bpy.data.materials.new("M_MuzzleCrownSoot")
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    texcoord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(texcoord.outputs["Object"], sep.inputs["Vector"])

    mr_x = nt.nodes.new("ShaderNodeMapRange")
    mr_x.clamp = True
    mr_x.inputs["From Min"].default_value = 52.30
    mr_x.inputs["From Max"].default_value = 53.50
    nt.links.new(sep.outputs["X"], mr_x.inputs["Value"])

    n_soot = nt.nodes.new("ShaderNodeTexNoise")
    n_soot.inputs["Scale"].default_value = 5.5
    n_soot.inputs["Detail"].default_value = 5.0
    nt.links.new(texcoord.outputs["Object"], n_soot.inputs["Vector"])

    mul_s = nt.nodes.new("ShaderNodeMath")
    mul_s.operation = "MULTIPLY_ADD"
    mul_s.inputs[1].default_value = 0.16
    nt.links.new(n_soot.outputs["Fac"], mul_s.inputs[0])
    nt.links.new(mr_x.outputs["Result"], mul_s.inputs[2])

    ramp_c = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp_c.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = srgb_to_lin(0.222, 0.238, 0.232)
    cr.elements[1].position = 0.62
    cr.elements[1].color = srgb_to_lin(0.185, 0.190, 0.188)
    el = cr.elements.new(0.94)
    el.color = srgb_to_lin(0.095, 0.095, 0.100)
    nt.links.new(mul_s.outputs["Value"], ramp_c.inputs["Fac"])

    ramp_r = nt.nodes.new("ShaderNodeValToRGB")
    rr = ramp_r.color_ramp
    rr.elements[0].position = 0.55
    rr.elements[0].color = (0.34, 0.34, 0.34, 1.0)
    rr.elements[1].position = 0.96
    rr.elements[1].color = (0.76, 0.76, 0.76, 1.0)
    nt.links.new(mul_s.outputs["Value"], ramp_r.inputs["Fac"])

    ramp_m = nt.nodes.new("ShaderNodeValToRGB")
    rm = ramp_m.color_ramp
    rm.elements[0].position = 0.76
    rm.elements[0].color = (0.84, 0.84, 0.84, 1.0)
    rm.elements[1].position = 0.98
    rm.elements[1].color = (0.28, 0.28, 0.28, 1.0)
    nt.links.new(mul_s.outputs["Value"], ramp_m.inputs["Fac"])

    nt.links.new(ramp_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(ramp_r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(ramp_m.outputs["Color"], bsdf.inputs["Metallic"])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 5
    bev.inputs["Radius"].default_value = 0.020
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.032
    bump.inputs["Distance"].default_value = 0.016
    nt.links.new(n_soot.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Suite 1: benellim4_v3_receiver (Satin Type-III Charcoal 7075-T6 Aluminum, Sights & FCG) ---
        # Calibrated strictly for AgX satin-anodized dark aluminum (cool slate sheen clearly distinct from matte polymer & olive-parkerized barrel!)
        "R_AnodizedCharcoal": _build_pbr_mat(
            "R_AnodizedCharcoal",
            base_srgb=(0.194, 0.206, 0.226),
            roughness=0.28,
            metallic=0.87,
            bevel_r=0.026,
            edge_wear=0.38,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=62.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 2.8, 2.8),
            voronoi_grain=0.32,
            voronoi_scale=92.0,
            rough_var=0.036,
        ),
        "R_RailSightsAnodized": _build_pbr_mat(
            "R_RailSightsAnodized",
            base_srgb=(0.180, 0.192, 0.210),
            roughness=0.30,
            metallic=0.86,
            bevel_r=0.022,
            edge_wear=0.44,
            edge_srgb=(0.78, 0.81, 0.86),
            grain_scale=56.0,
            grain_bump=0.026,
            voronoi_grain=0.38,
            voronoi_scale=88.0,
            rough_var=0.034,
        ),
        "R_TriggerGuardAlu": _build_pbr_mat(
            "R_TriggerGuardAlu",
            base_srgb=(0.184, 0.196, 0.214),
            roughness=0.31,
            metallic=0.85,
            bevel_r=0.026,
            edge_wear=0.40,
            edge_srgb=(0.76, 0.79, 0.84),
            grain_scale=60.0,
            grain_bump=0.026,
            voronoi_grain=0.36,
            voronoi_scale=88.0,
            rough_var=0.034,
        ),
        "R_TriggerBluedSteel": _build_pbr_mat(
            "R_TriggerBluedSteel",
            base_srgb=(0.235, 0.246, 0.264),
            roughness=0.29,
            metallic=0.86,
            bevel_r=0.022,
            edge_wear=0.54,
            edge_srgb=(0.84, 0.86, 0.90),
            grain_scale=42.0,
            grain_bump=0.024,
            aniso_stretch=(0.4, 3.2, 3.2),
            rough_var=0.030,
        ),
        "R_StainlessAccent": _build_pbr_mat(
            "R_StainlessAccent",
            base_srgb=(0.80, 0.83, 0.87),
            roughness=0.19,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.22,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=30.0,
            grain_bump=0.018,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.022,
        ),
        "R_InnerDark": _build_pbr_mat(
            "R_InnerDark",
            base_srgb=(0.118, 0.125, 0.136),
            roughness=0.46,
            metallic=0.76,
            bevel_r=0.016,
            grain_scale=42.0,
            grain_bump=0.024,
            rough_var=0.028,
        ),
        # Strictly firewalled vivid crimson-red safety fire band & cartridge-drop dot!
        "R_SafetyCrimson": _build_pbr_mat(
            "R_SafetyCrimson",
            base_srgb=(0.88, 0.08, 0.06),
            roughness=0.28,
            metallic=0.06,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.010,
            rough_var=0.020,
        ),
        # Strictly firewalled crisp white tritium Ghost-Ring sight dots!
        "R_TritiumWhite": _build_pbr_mat(
            "R_TritiumWhite",
            base_srgb=(0.96, 0.97, 0.98),
            roughness=0.22,
            metallic=0.00,
            bevel_r=0.008,
            grain_scale=24.0,
            grain_bump=0.008,
            rough_var=0.016,
        ),

        # --- Suite 2: benellim4_v3_metal (18.5" Parkerized Barrel, Mirror-Chrome ARGO Pistons & Rotating Bolt) ---
        # Authentic warm olive-slate USMC manganese-phosphate steel (distinct contrast vs cool-slate 7075-T6 receiver!)
        "M_ParkerizedSteel": _build_pbr_mat(
            "M_ParkerizedSteel",
            base_srgb=(0.214, 0.230, 0.218),
            roughness=0.34,
            metallic=0.84,
            bevel_r=0.024,
            edge_wear=0.42,
            edge_srgb=(0.78, 0.80, 0.83),
            grain_scale=48.0,
            grain_bump=0.030,
            aniso_stretch=(4.2, 0.5, 0.5),
            voronoi_grain=0.36,
            voronoi_scale=88.0,
            rough_var=0.036,
        ),
        "M_KnurledBlackSteel": _build_pbr_mat(
            "M_KnurledBlackSteel",
            base_srgb=(0.218, 0.228, 0.238),
            roughness=0.33,
            metallic=0.85,
            bevel_r=0.020,
            edge_wear=0.58,
            edge_srgb=(0.84, 0.86, 0.90),
            grain_scale=52.0,
            grain_bump=0.036,
            voronoi_grain=0.44,
            voronoi_scale=88.0,
            rough_var=0.034,
        ),
        "M_MuzzleCrownSoot": _build_muzzle_crown_soot_mat(),
        "M_ArgoMirrorChrome": _build_argo_piston_chrome_mat(),
        "M_BrushedStainless": _build_pbr_mat(
            "M_BrushedStainless",
            base_srgb=(0.82, 0.85, 0.89),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.020,
            edge_wear=0.24,
            edge_srgb=(0.94, 0.96, 0.98),
            grain_scale=30.0,
            grain_bump=0.020,
            aniso_stretch=(0.4, 3.6, 3.6),
            rough_var=0.024,
        ),
        "M_HardChromeBore": _build_pbr_mat(
            "M_HardChromeBore",
            base_srgb=(0.86, 0.88, 0.92),
            roughness=0.14,
            metallic=0.98,
            bevel_r=0.014,
            grain_scale=24.0,
            grain_bump=0.012,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.018,
        ),
        "M_OiledActionSteel": _build_pbr_mat(
            "M_OiledActionSteel",
            base_srgb=(0.232, 0.244, 0.262),
            roughness=0.28,
            metallic=0.86,
            bevel_r=0.026,
            edge_wear=0.56,
            edge_srgb=(0.85, 0.87, 0.91),
            grain_scale=34.0,
            grain_bump=0.026,
            aniso_stretch=(0.38, 3.4, 3.4),
            rough_var=0.032,
        ),
        "M_BrassDetent": _build_pbr_mat(
            "M_BrassDetent",
            base_srgb=(0.82, 0.65, 0.28),
            roughness=0.24,
            metallic=0.94,
            bevel_r=0.014,
            edge_wear=0.20,
            edge_srgb=(0.92, 0.78, 0.42),
            grain_scale=30.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),
        "M_InnerDark": _build_pbr_mat(
            "M_InnerDark",
            base_srgb=(0.115, 0.122, 0.132),
            roughness=0.46,
            metallic=0.76,
            bevel_r=0.016,
            grain_scale=38.0,
            grain_bump=0.024,
            rough_var=0.026,
        ),

        # --- Suite 3: benellim4_v3_furniture (Fiberglass-Reinforced Nylon Forend/Stock, Steel Tube, Safety-Orange Follower) ---
        # Rich tactical matte obsidian-charcoal glass-filled nylon (distinct dielectric roughness & Voronoi pebble vs metal!)
        "F_NylonForend": _build_pbr_mat(
            "F_NylonForend",
            base_srgb=(0.142, 0.148, 0.160),
            roughness=0.60,
            metallic=0.00,
            bevel_r=0.032,
            edge_wear=0.14,
            edge_srgb=(0.24, 0.25, 0.27),
            grain_scale=68.0,
            grain_bump=0.115,
            voronoi_grain=0.68,
            voronoi_scale=112.0,
            rough_var=0.044,
        ),
        "F_NylonStock": _build_pbr_mat(
            "F_NylonStock",
            base_srgb=(0.136, 0.142, 0.154),
            roughness=0.62,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.14,
            edge_srgb=(0.23, 0.24, 0.26),
            grain_scale=70.0,
            grain_bump=0.110,
            voronoi_grain=0.68,
            voronoi_scale=108.0,
            rough_var=0.044,
        ),
        "F_GripStipple": _build_pbr_mat(
            "F_GripStipple",
            base_srgb=(0.128, 0.134, 0.144),
            roughness=0.70,
            metallic=0.00,
            bevel_r=0.024,
            edge_wear=0.10,
            edge_srgb=(0.22, 0.23, 0.25),
            grain_scale=92.0,
            grain_bump=0.185,
            voronoi_grain=0.86,
            voronoi_scale=145.0,
            rough_var=0.042,
        ),
        "F_CheekElastomer": _build_pbr_mat(
            "F_CheekElastomer",
            base_srgb=(0.134, 0.140, 0.150),
            roughness=0.56,
            metallic=0.00,
            bevel_r=0.038,
            edge_wear=0.08,
            edge_srgb=(0.21, 0.22, 0.24),
            grain_scale=52.0,
            grain_bump=0.055,
            voronoi_grain=0.44,
            voronoi_scale=80.0,
            rough_var=0.032,
        ),
        "F_ButtpadRubber": _build_pbr_mat(
            "F_ButtpadRubber",
            base_srgb=(0.116, 0.122, 0.130),
            roughness=0.84,
            metallic=0.00,
            bevel_r=0.034,
            edge_wear=0.08,
            edge_srgb=(0.19, 0.20, 0.21),
            grain_scale=70.0,
            grain_bump=0.125,
            voronoi_grain=0.72,
            voronoi_scale=96.0,
            rough_var=0.038,
        ),
        "F_SteelRecoilTube": _build_pbr_mat(
            "F_SteelRecoilTube",
            base_srgb=(0.240, 0.252, 0.268),
            roughness=0.30,
            metallic=0.86,
            bevel_r=0.024,
            edge_wear=0.50,
            edge_srgb=(0.82, 0.84, 0.88),
            grain_scale=40.0,
            grain_bump=0.026,
            aniso_stretch=(4.0, 0.45, 0.45),
            rough_var=0.030,
        ),
        "F_SteelCapStainless": _build_pbr_mat(
            "F_SteelCapStainless",
            base_srgb=(0.78, 0.81, 0.85),
            roughness=0.20,
            metallic=0.95,
            bevel_r=0.018,
            edge_wear=0.24,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=30.0,
            grain_bump=0.020,
            rough_var=0.024,
        ),
        # Strictly firewalled vivid Safety-Orange anodized aluminum magazine follower!
        "F_FollowerOrange": _build_pbr_mat(
            "F_FollowerOrange",
            base_srgb=(0.94, 0.34, 0.06),
            roughness=0.28,
            metallic=0.68,
            bevel_r=0.024,
            edge_wear=0.22,
            edge_srgb=(0.98, 0.56, 0.26),
            grain_scale=36.0,
            grain_bump=0.022,
            aniso_stretch=(3.5, 0.5, 0.5),
            rough_var=0.030,
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


def _rounded_rect_pts(hw: float, hh: float, r: float, corner_segs: int = 5) -> list[tuple[float, float]]:
    r = min(r, hw * 0.95, hh * 0.95)
    pts = []
    corners = [
        ( hw - r,  hh - r, 0.0,           math.pi * 0.5),
        (-hw + r,  hh - r, math.pi * 0.5, math.pi),
        (-hw + r, -hh + r, math.pi,       math.pi * 1.5),
        ( hw - r, -hh + r, math.pi * 1.5, math.pi * 2.0),
    ]
    for cx, cy, a0, a1 in corners:
        for i in range(corner_segs + 1):
            a = a0 + (a1 - a0) * (i / corner_segs)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
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


def mk_lathe_y(
    name: str, pts_r_y: list[tuple[float, float]], segs: int = 32,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    bm = bmesh.new()
    closed_loop = (
        len(pts_r_y) >= 3
        and pts_r_y[0][0] > 1e-5
        and math.hypot(pts_r_y[0][0] - pts_r_y[-1][0], pts_r_y[0][1] - pts_r_y[-1][1]) < 1e-4
    )
    pts = pts_r_y[:-1] if closed_loop else list(pts_r_y)
    rings = []
    for r, y in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((0.0, y, 0.0))])
        else:
            ring = []
            for s in range(segs):
                th = 2.0 * math.pi * s / segs
                ring.append(bm.verts.new((r * math.cos(th), y, r * math.sin(th))))
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


def mk_loft_rings(
    name: str,
    rings_three: list[list[tuple[float, float, float]]],
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
    cap_ends: bool = True,
) -> bpy.types.Object:
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "x",
    flutes: int = 24, depth: float = 0.025,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.020, length * 0.14, radius * 0.14)
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
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)

    angle_rad = math.radians(sharp_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < angle_rad
            if lock_flat_walls and e.smooth:
                f0, f1 = e.link_faces[0], e.link_faces[1]
                flat0 = abs(f0.normal.y) > 0.96 and f0.calc_area() > 0.15
                flat1 = abs(f1.normal.y) > 0.96 and f1.calc_area() > 0.15
                if flat0 != flat1:
                    e.smooth = False
        else:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    if weighted_normals:
        select_only([obj], obj)
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.weight = 50
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


def triangulate_all_keep_normals(all_objs: list[bpy.types.Object]):
    """Triangulate all meshes BEFORE Cycles tangent-normal baking so baked tangent frames
    match exported Draco glTF triangles 1:1 (zero diagonal facet streaks!)."""
    for o in all_objs:
        select_only([o], o)
        mod = o.modifiers.new(name="TriangulatePreBake", type="TRIANGULATE")
        mod.quad_method = "BEAUTY"
        mod.ngon_method = "BEAUTY"
        mod.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


# =============================================================================
# PART BUILDERS — ATLAS 1: RECEIVER, RAIL, SIGHTS & TRIGGER PACK (7 parts)
# =============================================================================
def build_benellim4_receiver(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-01: MIL-STD-8625 Type-III Hard-Anodized 7075-T6 Aluminum Receiver.
    assembledPos: [0, 0, 0] | spans X in [-10.80, +10.20], Y in [-1.92, +2.82], Z in [-1.76, +1.95]."""
    m_alu = mats["R_AnodizedCharcoal"]
    m_satin = mats["R_RailSightsAnodized"]
    m_dark = mats["R_InnerDark"]
    m_steel = mats["R_TriggerBluedSteel"]

    # 1. Authentic Benelli M4 receiver side silhouette: flat optic/LPA sight deck extends back to X = -9.15
    #    so the LPA Ghost-Ring rear sight seats 100% flush with zero overhang!
    prof_xy = [
        (-10.80, -1.35),
        (-8.80, -1.92),
        (10.20, -1.92),
        (10.20, 2.48),
        (9.45, 2.82),
        (-9.15, 2.82),
    ]
    prof_xy += _quad_bez((-9.15, 2.82), (-10.25, 2.62), (-10.80, 1.48), segs=12)
    raw = mk_extrude_z("bm4_recv_raw", prof_xy, -1.75, 1.75, bevel=0.072, bevel_segs=3, mat=m_alu)

    # 2. Carve internal bolt/elevator cavity, front barrel & mag sockets, dual ARGO bulkhead holes,
    #    angled stock socket, 3" beveled +Z ejection port, charging-handle slot, flared loading port,
    #    trigger-pack cross-pin hole, and subtle upper Benelli receiver shoulder bevels!
    # Rounded stadium 3" ejection port cutter (+Z flank: X in [+0.55, +7.95], Y in [+0.68, +2.06])
    ej_pts = _rounded_rect_pts(3.70, 0.69, 0.24, corner_segs=6)
    ej_cut = mk_extrude_z(
        "c_recv_eject", ej_pts, 0.90, 2.10, bevel=0.0,
        xform=[("t", 4.25, 1.37, 0.0)], mat=m_dark,
    )
    # Crisp 45-deg exterior chamfer flare around the 3" ejection port lip (+Z outer surface!)
    ej_bev_pts = _rounded_rect_pts(3.78, 0.77, 0.28, corner_segs=6)
    ej_bev_cut = mk_loft_rings(
        "c_recv_ej_bev",
        [
            [(p[0] + 4.25, p[1] + 1.37, 1.66) for p in ej_pts],
            [(p[0] + 4.25, p[1] + 1.37, 1.78) for p in ej_bev_pts],
            [(p[0] + 4.25, p[1] + 1.37, 1.92) for p in ej_bev_pts],
        ],
        mat=m_satin,
    )
    # Charging handle travel slot extending cleanly back to X = -4.90 so full -8.4cm BCG stroke clears!
    chg_pts = _rounded_rect_pts(2.85, 0.25, 0.14, corner_segs=4)
    chg_cut = mk_extrude_z(
        "c_recv_chg", chg_pts, 0.90, 2.10, bevel=0.0,
        xform=[("t", -2.10, 1.50, 0.0)], mat=m_dark,
    )
    # Flared bottom loading port & trigger-pack mortise (X in [-9.60, +7.20], leaves 3.0cm front bridge!)
    load_cut = mk_box("c_recv_load", 16.80, 1.15, 2.34, [("t", -1.20, -1.68, 0.0)], mat=m_dark)
    # 45-deg speed-load bevel flare around bottom loading port lips (X in [-2.4, +7.1])
    flare_l = mk_box("c_recv_fl_l", 9.6, 0.44, 0.44, [("rx", math.pi * 0.25), ("t", 2.35, -1.94, -1.16)], mat=m_dark)
    flare_r = mk_box("c_recv_fl_r", 9.6, 0.44, 0.44, [("rx", math.pi * 0.25), ("t", 2.35, -1.94,  1.16)], mat=m_dark)

    # Upper octagonal Benelli receiver shoulder chamfers (keep flat hero walls Y in [-1.70, +2.22] untouched!)
    sh_l = mk_box("c_recv_sh_l", 22.0, 0.52, 0.52, [("rx", math.pi * 0.25), ("t", -0.3, 2.86, -1.78)], mat=m_satin)
    sh_r = mk_box("c_recv_sh_r", 22.0, 0.52, 0.52, [("rx", math.pi * 0.25), ("t", -0.3, 2.86,  1.78)], mat=m_satin)

    cutters = [
        # Main internal bolt carrier & elevator tunnel
        mk_box("c_recv_cav", 19.60, 3.66, 2.64, [("t", -0.25, 0.52, 0.0)], mat=m_dark),
        # Front 18.5" barrel extension socket (Y = +1.35)
        mk_cyl("c_recv_bbl", 1.41, 1.41, 4.80, axis="x", segs=36, xform=[("t", 8.80, 1.35, 0.0)], mat=m_dark),
        # Front 7-rd magazine tube socket (Y = -1.25, tight fit r=1.255 -> zero seam peek!)
        mk_cyl("c_recv_mag", 1.255, 1.255, 3.60, axis="x", segs=32, xform=[("t", 9.20, -1.25, 0.0)], mat=m_dark),
        # Twin front bulkhead ARGO tappet pass-through holes (Y = +0.12, Z = ±1.18)
        mk_cyl("c_recv_argol", 0.265, 0.265, 3.60, axis="x", segs=20, xform=[("t", 9.20, 0.12, -1.18)], mat=m_dark),
        mk_cyl("c_recv_argor", 0.265, 0.265, 3.60, axis="x", segs=20, xform=[("t", 9.20, 0.12,  1.18)], mat=m_dark),
        # Rear angled recoil-tube socket (Y = +0.35, rotated STOCK_ANGLE)
        mk_cyl("c_recv_rec", 0.94, 0.94, 3.40, axis="x", segs=28,
               xform=[("rz", STOCK_ANGLE), ("t", -10.10, 0.35, 0.0)], mat=m_dark),
        # Trigger housing retention cross-pin through-bore at (-8.95, -1.73)
        mk_cyl("c_recv_tpin", 0.225, 0.225, 4.00, axis="z", segs=20, xform=[("t", -8.95, -1.73, 0.0)], mat=m_dark),
        ej_cut,
        ej_bev_cut,
        chg_cut,
        load_cut,
        flare_l,
        flare_r,
        sh_l,
        sh_r,
    ]
    shell = bool_subtract(raw, cutters)

    # 3. Sculpted shell/hull deflector bump tight behind +Z ejection port
    deflector = mk_box("bm4_deflector", 0.68, 0.90, 0.24, [("t", 0.15, 1.38, 1.83)], m_satin, bevel=0.05)

    # 4. Iconic Benelli M4 round tactical bolt-release button (+Z flank below front of ejection port!)
    #    Positioned at X = +6.95, Y = -0.82 (strictly clear of right-flank rollmarks at X in [-2.4..+6.05]!)
    rel_collar = mk_cyl("bm4_rel_col", 0.42, 0.45, 0.10, axis="z", segs=24,
                        xform=[("t", 6.95, -0.82, 1.76)], mat=m_satin, bevel=0.02)
    rel_btn = mk_knurled_cyl("bm4_rel_btn", 0.34, 0.16, axis="z", flutes=20, depth=0.014,
                             xform=[("t", 6.95, -0.82, 1.84)], mat=m_steel)

    # 5. Subtle receiver front magazine-tube collar reinforcement ring & pin escutcheons
    pin_esc_l = mk_cyl("bm4_pesc_l", 0.30, 0.30, 0.04, axis="z", segs=20,
                       xform=[("t", -8.95, -1.73, -1.74)], mat=m_satin, bevel=0.01)
    pin_esc_r = mk_cyl("bm4_pesc_r", 0.30, 0.30, 0.04, axis="z", segs=20,
                       xform=[("t", -8.95, -1.73,  1.74)], mat=m_satin, bevel=0.01)
    pin_esc_l = bool_subtract(pin_esc_l, [mk_cyl("c_pl", 0.225, 0.225, 0.20, axis="z", segs=20, xform=[("t", -8.95, -1.73, -1.74)], mat=m_dark)])
    pin_esc_r = bool_subtract(pin_esc_r, [mk_cyl("c_pr", 0.225, 0.225, 0.20, axis="z", segs=20, xform=[("t", -8.95, -1.73,  1.74)], mat=m_dark)])

    obj = join_objects([shell, deflector, rel_collar, rel_btn, pin_esc_l, pin_esc_r], "benellim4_receiver")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0, lock_flat_walls=True)


def build_benellim4_picatinny_rail(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-02: Top MIL-STD-1913 Picatinny Optic Rail w/ Sight Relief Channel & 4 Countersunk Torx Screws.
    assembledPos: [0, 0, 0] | spans X in [-5.20, +9.40], Y in [+2.75, +3.32], Z in [-1.06, +1.06]."""
    m_rail = mats["R_RailSightsAnodized"]
    m_dark = mats["R_InnerDark"]
    m_ss = mats["R_StainlessAccent"]

    # Authentic MIL-STD-1913 45-deg dovetail cross-section in (Z, Y) extruded X in [-5.20, +9.40]
    rail_zy = [
        (-0.92, 2.75),
        (-0.92, 2.83),
        (-0.80, 2.85),
        (-1.06, 3.09),
        (-0.83, 3.32),
        ( 0.83, 3.32),
        ( 1.06, 3.09),
        ( 0.80, 2.85),
        ( 0.92, 2.83),
        ( 0.92, 2.75),
    ]
    raw = mk_extrude_x("bm4_rail_raw", rail_zy, -5.20, 9.40, bevel=0.018, bevel_segs=2, mat=m_rail)

    # Central iron-sight clearance channel (lets Ghost Ring sight line pass cleanly above rail floor!)
    cutters = [
        mk_box("c_rail_chan", 14.80, 0.30, 0.66, [("t", 2.10, 3.22, 0.0)], mat=m_dark),
    ]
    # 13 precision MIL-STD-1913 transverse recoil slots w/ crisp 45-deg lug chamfers (X = -4.00..+8.00)
    for i in range(13):
        sx = -4.00 + i * 1.00
        slot_prof = [
            (sx - 0.26, 3.03), (sx + 0.26, 3.03),
            (sx + 0.26, 3.27), (sx + 0.31, 3.33),
            (sx + 0.31, 3.40), (sx - 0.31, 3.40),
            (sx - 0.31, 3.33), (sx - 0.26, 3.27),
        ]
        cutters.append(mk_extrude_z(f"c_rslot_{i}", slot_prof, -1.14, 1.14, mat=m_dark))
    rail_milled = bool_subtract(raw, cutters)

    # 4 recessed stainless steel countersunk Torx mounting screws at X = -4.10, -0.40, +3.60, +7.80
    parts = [rail_milled]
    for si, sx in enumerate((-4.10, -0.40, 3.60, 7.80)):
        screw = mk_cyl(f"bm4_rscr_{si}", 0.18, 0.14, 0.14, axis="y", segs=18,
                       xform=[("t", sx, 3.03, 0.0)], mat=m_ss, bevel=0.015)
        torx = mk_cyl(f"c_torx_{si}", 0.075, 0.075, 0.08, axis="y", segs=6,
                      xform=[("t", sx, 3.09, 0.0)], mat=m_dark)
        parts.append(bool_subtract(screw, [torx]))

    obj = join_objects(parts, "benellim4_picatinny_rail")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_front_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-03: Protective-Wing Tritium Ghost-Ring Front Sight Tower.
    assembledPos: [51.6, 2.55, 0] | spans X in [-1.15, +1.05], Y in [-0.15, +1.83], Z in [-0.57, +0.57]."""
    m_sight = mats["R_RailSightsAnodized"]
    m_steel = mats["R_TriggerBluedSteel"]
    m_ss = mats["R_StainlessAccent"]
    m_white = mats["R_TritiumWhite"]
    m_dark = mats["R_InnerDark"]

    # Silver-brazed sight tower base with concave underside saddle hugging the r=1.12 barrel (local Y=-1.20)
    base_xy = [
        (-1.15, -0.15),
        ( 1.05, -0.15),
        ( 0.85,  0.30),
        ( 0.56,  1.12),
        (-0.66,  1.12),
        (-0.92,  0.35),
    ]
    base_raw = mk_extrude_z("fs_base_raw", base_xy, -0.46, 0.46, bevel=0.035, bevel_segs=2, mat=m_sight)
    # Sculpted curved saddle cut matching barrel r=1.12 centered at local Y = -1.20 (world Y = 1.35)
    saddle_cut = mk_cyl("c_fs_bbl", 1.08, 1.08, 2.60, axis="x", segs=32, xform=[("t", 0.0, -1.20, 0.0)], mat=m_dark)
    base = bool_subtract(base_raw, [saddle_cut])

    # Flared left & right steel protective combat wings
    wing_xy = [
        (-0.58, 0.92),
        ( 0.44, 0.92),
        ( 0.34, 1.78),
        (-0.18, 1.82),
        (-0.54, 1.56),
    ]
    wing_l = mk_extrude_z("fs_wl", wing_xy, -0.08, 0.08, bevel=0.022, bevel_segs=2,
                          xform=[("rx",  0.14), ("t", 0.0, 0.0, -0.42)], mat=m_sight)
    wing_r = mk_extrude_z("fs_wr", wing_xy, -0.08, 0.08, bevel=0.022, bevel_segs=2,
                          xform=[("rx", -0.14), ("t", 0.0, 0.0,  0.42)], mat=m_sight)

    # Central square combat front blade + threaded stainless hex adjustment nut + white tritium dot!
    post = mk_box("fs_post", 0.22, 0.72, 0.18, [("t", -0.06, 1.34, 0.0)], m_steel, bevel=0.018)
    hex_nut = mk_cyl("fs_hex", 0.17, 0.17, 0.20, axis="y", segs=6,
                     xform=[("t", -0.06, 1.10, 0.0)], mat=m_ss, bevel=0.014)
    # Vivid white tritium dot facing shooter (-X), level with rear ghost-ring center (world Y = 3.97 -> local 1.42)
    tritium_bezel = mk_cyl("fs_tbez", 0.095, 0.095, 0.05, axis="x", segs=18,
                           xform=[("t", -0.165, 1.48, 0.0)], mat=m_ss, bevel=0.008)
    tritium_dot = mk_cyl("fs_tdot", 0.072, 0.072, 0.055, axis="x", segs=18,
                         xform=[("t", -0.185, 1.48, 0.0)], mat=m_white, bevel=0.008)

    obj = join_objects([base, wing_l, wing_r, post, hex_nut, tritium_bezel, tritium_dot], "benellim4_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_rear_sight(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-04: Italian LPA Winged Adjustable Ghost-Ring Aperture Rear Sight w/ Twin White Dots.
    assembledPos: [-7.8, 2.82, 0] | spans X in [-1.55, +1.55], Y in [-0.04, +1.55], Z in [-1.24, +1.24]."""
    m_sight = mats["R_RailSightsAnodized"]
    m_steel = mats["R_TriggerBluedSteel"]
    m_ss = mats["R_StainlessAccent"]
    m_white = mats["R_TritiumWhite"]
    m_dark = mats["R_InnerDark"]

    # Base mounting saddle sitting 100% flush on flat receiver roof
    saddle_xy = [(-1.54, -0.04), (1.54, -0.04), (1.42, 0.50), (-1.42, 0.50)]
    saddle = mk_extrude_z("rs_saddle", saddle_xy, -1.06, 1.06, bevel=0.04, bevel_segs=2, mat=m_sight)
    # Recessed inner aperture bed + 2 stainless Torx mounting bolts
    bed_cut = mk_box("c_rs_bed", 1.80, 0.24, 1.32, [("t", -0.12, 0.44, 0.0)], mat=m_dark)
    saddle = bool_subtract(saddle, [bed_cut])

    # Twin sculpted Italian LPA protective combat wings
    lpa_wing_xy = [
        (-1.12, 0.36),
        ( 0.88, 0.36),
        ( 0.58, 1.48),
        (-0.36, 1.54),
        (-1.02, 1.32),
    ]
    wing_l = mk_extrude_z("rs_wl", lpa_wing_xy, -0.98, -0.74, bevel=0.032, bevel_segs=2, mat=m_sight)
    wing_r = mk_extrude_z("rs_wr", lpa_wing_xy,  0.74,  0.98, bevel=0.032, bevel_segs=2, mat=m_sight)

    # Precision-turned hollow Ghost-Ring aperture (center Y = +1.13 -> world Y = +3.95)
    ring = mk_lathe_x(
        "rs_ghost",
        [
            (0.24, -0.28), (0.43, -0.28), (0.45, -0.24), (0.45, 0.12),
            (0.43,  0.16), (0.24,  0.16), (0.24, -0.28),
        ],
        segs=36, xform=[("t", -0.10, 1.13, 0.0)], mat=m_steel,
    )
    stem = mk_box("rs_stem", 0.38, 0.54, 0.46, [("t", -0.10, 0.62, 0.0)], m_steel, bevel=0.025)
    elev_screw = mk_cyl("rs_elev", 0.16, 0.16, 0.18, axis="y", segs=18,
                        xform=[("t", 0.52, 0.52, 0.0)], mat=m_ss, bevel=0.015)

    # Windage adjustment screw drum protruding cleanly on both flanks w/ cartridge-rim slots
    wind_raw = mk_cyl("rs_wind", 0.27, 0.27, 2.46, axis="z", segs=24,
                      xform=[("t", 0.46, 0.42, 0.0)], mat=m_ss, bevel=0.024)
    slot_l = mk_box("c_wslot_l", 0.44, 0.08, 0.12, [("t", 0.46, 0.42, -1.22)], mat=m_dark)
    slot_r = mk_box("c_wslot_r", 0.44, 0.08, 0.12, [("t", 0.46, 0.42,  1.22)], mat=m_dark)
    wind_drum = bool_subtract(wind_raw, [slot_l, slot_r])

    # Twin crisp tritium white rear reference dots flanking the ghost-ring aperture (strictly firewalled UV!)
    dot_l = mk_cyl("rs_dot_l", 0.060, 0.060, 0.055, axis="x", segs=16,
                   xform=[("t", -0.39, 1.13, -0.33)], mat=m_white, bevel=0.008)
    dot_r = mk_cyl("rs_dot_r", 0.060, 0.060, 0.055, axis="x", segs=16,
                   xform=[("t", -0.39, 1.13,  0.33)], mat=m_white, bevel=0.008)

    # Front & rear saddle countersunk mounting screws
    scr_f = mk_cyl("rs_scrf", 0.14, 0.14, 0.10, axis="y", segs=14, xform=[("t", 1.06, 0.48, 0.0)], mat=m_ss, bevel=0.01)
    scr_r = mk_cyl("rs_scrr", 0.14, 0.14, 0.10, axis="y", segs=14, xform=[("t", -1.18, 0.48, 0.0)], mat=m_ss, bevel=0.01)

    obj = join_objects(
        [saddle, wing_l, wing_r, ring, stem, elev_screw, wind_drum, dot_l, dot_r, scr_f, scr_r],
        "benellim4_rear_sight",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_trigger_housing(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-01: Monolithic Hard-Anodized Alloy Trigger Guard Housing w/ Solidly Welded Bow,
    Safety Boss, Cartridge-Drop Pocket, Takedown Pin & Anchored Stainless Shell-Stop Latch.
    assembledPos: [-6.1, -2.15, 0] | spans X in [-3.70, +5.05], Y in [-2.86, +0.96], Z in [-1.84, +1.84]."""
    m_alu = mats["R_TriggerGuardAlu"]
    m_steel = mats["R_TriggerBluedSteel"]
    m_ss = mats["R_StainlessAccent"]
    m_dark = mats["R_InnerDark"]

    # 1. Upper milled fire-control chassis deck (X in [-3.70, +3.90], Y in [-0.20, +0.94], Z in [-0.84, +0.84])
    deck = mk_box("th_deck", 7.60, 1.14, 1.68, [("t", 0.10, 0.37, 0.0)], m_alu, bevel=0.045)

    # 2. Oversized winter-glove trigger guard loop SOLIDLY WELDED front & rear into deck (legs rise to Y=+0.26!)
    #    Zero air gaps anywhere around the loop!
    bow_xy = [
        (-3.10,  0.26),
        (-2.86, -0.35),
        (-2.40, -2.58),
    ]
    bow_xy += _quad_bez((-2.40, -2.58), (-0.35, -3.12), (1.96, -2.44), segs=12)
    bow_xy += [
        ( 2.75, -0.22),
        ( 2.85,  0.26),
        ( 2.04,  0.26),
        ( 1.98, -0.20),
        ( 1.48, -1.94),
    ]
    bow_xy += _quad_bez((1.48, -1.94), (-0.35, -2.50), (-1.84, -2.06), segs=12)
    bow_xy += [
        (-2.14, -0.25),
        (-2.22,  0.26),
    ]
    bow = mk_extrude_z("th_bow", bow_xy, -0.58, 0.58, bevel=0.042, bevel_segs=2, mat=m_alu)

    # 3. Reinforced rear cross-bolt safety boss integrated seamlessly onto rear guard leg at (-2.25, -1.00, 0)
    #    Matches benellim4_safety_button world [-8.35, -3.15, 0] = housing local [-2.25, -1.00, 0]!
    saf_boss = mk_cyl("th_saf_boss", 0.44, 0.44, 1.24, axis="z", segs=24,
                      xform=[("t", -2.25, -1.00, 0.0)], mat=m_alu, bevel=0.03)

    # 4. Reinforced front-right cartridge-drop lever housing boss at (+2.95, -0.38, +0.42)
    #    Solidly supports benellim4_safety_button's dropTab at housing local (+3.00, -0.38, +0.68) — zero float!
    drop_boss = mk_box("th_drop_boss", 1.15, 0.66, 0.52, [("t", 2.95, -0.38, 0.42)], m_alu, bevel=0.035)

    # 5. Monolithic union of deck + bow + safety boss + drop boss -> 100% solid welded trigger guard!
    chassis = bool_union([deck, bow, saf_boss, drop_boss], "th_chassis_union")

    # Carve internal FCG hammer/trigger cavity, trigger blade pass-through slot, safety through-bore & takedown hole
    cutters = [
        mk_box("c_th_cav", 6.15, 0.96, 1.04, [("t", 0.10, 0.54, 0.0)], mat=m_dark),
        mk_box("c_th_tslot", 1.65, 0.65, 0.62, [("t", -0.10, -0.12, 0.0)], mat=m_dark),
        mk_cyl("c_th_safbore", 0.27, 0.27, 1.60, axis="z", segs=24, xform=[("t", -2.25, -1.00, 0.0)], mat=m_dark),
    ]
    chassis = bool_subtract(chassis, cutters)

    # 6. Single-pin takedown cross-pin at housing local (-2.85, +0.42, 0) (world (-8.95, -1.73, 0))
    tpin = mk_cyl("th_tpin", 0.215, 0.215, 3.66, axis="z", segs=24,
                  xform=[("t", -2.85, 0.42, 0.0)], mat=m_steel, bevel=0.025)
    tpin_cup_l = mk_cyl("c_tp_l", 0.11, 0.05, 0.10, axis="z", segs=16, xform=[("t", -2.85, 0.42, -1.82)], mat=m_dark)
    tpin_cup_r = mk_cyl("c_tp_r", 0.05, 0.11, 0.10, axis="z", segs=16, xform=[("t", -2.85, 0.42,  1.82)], mat=m_dark)
    tpin = bool_subtract(tpin, [tpin_cup_l, tpin_cup_r])

    # 7. Right-side brushed stainless Shell Stop Latch anchored cleanly via pivot boss & pin (zero floating!)
    latch_bar = mk_box("th_latch", 3.82, 0.28, 0.15, [("t", 3.14, 0.56, 0.89)], m_ss, bevel=0.018)
    latch_anchor = mk_box("th_lanch", 1.95, 0.34, 0.22, [("t", 2.25, 0.56, 0.78)], m_alu, bevel=0.02)
    latch_pin = mk_cyl("th_lpin", 0.09, 0.09, 0.34, axis="y", segs=14,
                       xform=[("t", 2.45, 0.56, 0.86)], mat=m_steel, bevel=0.01)

    obj = join_objects([chassis, tpin, latch_bar, latch_anchor, latch_pin], "benellim4_trigger_housing")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_trigger(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-02: Curved Hardened Steel Combat Trigger & Semi-Auto Stainless Disconnector.
    assembledPos: [-6.2, -2.65, 0] | spans X in [-0.855, +1.245], Y in [-1.96, +1.15], Z in [-0.64, +0.64]."""
    m_steel = mats["R_TriggerBluedSteel"]
    m_ss = mats["R_StainlessAccent"]

    # Swept ergonomic combat trigger shoe
    blade_xy = [(-0.38, 0.65), (0.56, 0.65)]
    blade_xy += _quad_bez((0.56, 0.65), (0.16, -0.55), (0.48, -1.68), segs=10)
    blade_xy += _quad_bez((0.48, -1.68), (0.40, -1.96), (0.06, -1.95), segs=6)
    blade_xy += _quad_bez((0.06, -1.95), (-0.42, -0.88), (-0.38, 0.65), segs=10)
    blade = mk_extrude_z("trg_blade", blade_xy, -0.26, 0.26, bevel=0.035, bevel_segs=2, mat=m_steel)

    # Upper machined sear carrier bar
    sear_bar = mk_box("trg_sear", 2.02, 0.36, 0.56, [("t", 0.22, 0.68, 0.0)], m_steel, bevel=0.025)
    # Hinged stainless semi-auto disconnector hook
    disc_xy = [(-0.82, 0.74), (0.52, 0.74), (0.44, 1.12), (-0.18, 1.14), (-0.56, 0.96), (-0.82, 0.92)]
    disconnector = mk_extrude_z("trg_disc", disc_xy, -0.13, 0.13, bevel=0.018, bevel_segs=2, mat=m_ss)
    # Pivot axle seated squarely inside trigger housing walls
    pivot = mk_cyl("trg_piv", 0.115, 0.115, 1.28, axis="z", segs=18,
                   xform=[("t", 0.05, 0.62, 0.0)], mat=m_ss, bevel=0.015)

    obj = join_objects([blade, sear_bar, disconnector, pivot], "benellim4_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_safety_button(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-05: Oversized Tactical Triangular Cross-Bolt Safety w/ Crimson Fire Band & Cartridge Drop Lever.
    assembledPos: [-8.35, -3.15, 0] | spans X in [-0.33, +5.71], Y in [-0.28, +0.84], Z in [-0.74, +0.90]."""
    m_steel = mats["R_TriggerBluedSteel"]
    m_ss = mats["R_StainlessAccent"]
    m_red = mats["R_SafetyCrimson"]

    # Main cross-bolt shaft (Z in [-0.74, +0.74], passes through trigger guard safety boss!)
    shaft = mk_cyl("saf_shaft", 0.25, 0.25, 1.46, axis="z", segs=24, mat=m_steel, bevel=0.02)
    # Iconic vivid crimson-red fire-ready indicator ring on left protruding side (-Z: [-0.70, -0.45])
    # Strictly firewalled UV island (zero crimson bleed onto steel!)
    red_band = mk_cyl("saf_red", 0.268, 0.268, 0.24, axis="z", segs=28,
                      xform=[("t", 0.0, 0.0, -0.57)], mat=m_red, bevel=0.014)

    # Authentic Benelli M4 oversized tactical triangular right-side safety push-head (+Z in [+0.66, +0.89])
    tri_xy = [(-0.30, -0.22), (0.32, -0.22), (0.04, 0.34)]
    tri_head = mk_extrude_z("saf_tri", tri_xy, 0.66, 0.89, bevel=0.04, bevel_segs=2, mat=m_steel)
    # 3 fine grip serration ribs on right safety pad face
    ribs = []
    for ri, ry in enumerate((-0.10, 0.02, 0.14)):
        rw = 0.36 - ri * 0.08
        ribs.append(mk_box(f"saf_rib_{ri}", rw, 0.036, 0.025, [("t", 0.02, ry, 0.89)], m_steel, bevel=0.006))

    # Front-right Cartridge Drop Lever (world (-3.10, -2.53, +0.68)) w/ internal pivot stem anchored into trigger housing!
    drop_tab = mk_box("saf_drop", 0.90, 0.42, 0.20, [("t", 5.25, 0.62, 0.69)], m_ss, bevel=0.025)
    drop_stem = mk_cyl("saf_dstem", 0.13, 0.13, 0.44, axis="z", segs=16,
                       xform=[("t", 5.02, 0.62, 0.48)], mat=m_steel, bevel=0.012)
    # Crisp crimson warning dot inlaid on outer face of Cartridge Drop Lever (firewalled crimson UV!)
    drop_red = mk_cyl("saf_dred", 0.095, 0.095, 0.055, axis="z", segs=18,
                      xform=[("t", 5.42, 0.62, 0.79)], mat=m_red, bevel=0.008)

    obj = join_objects([shaft, red_band, tri_head, *ribs, drop_tab, drop_stem, drop_red], "benellim4_safety_button")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 2: 18.5" BARREL, ARGO PISTONS, ROTATING BOLT & MAG TUBE (12 parts)
# =============================================================================
def build_benellim4_barrel(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-01: 18.5" Heavy Parkerized 12-Gauge Chrome-Lined Barrel w/ Dual ARGO Gas Cylinders & Mobilchoke Crown.
    assembledPos: [0, 1.35, 0] | spans X in [+6.50, +53.50], Y in [-4.12, +1.53], Z in [-1.82, +1.82]."""
    m_park = mats["M_ParkerizedSteel"]
    m_soot = mats["M_MuzzleCrownSoot"]
    m_chrome = mats["M_HardChromeBore"]
    m_ss = mats["M_BrushedStainless"]
    m_dark = mats["M_InnerDark"]

    # 1. Main 18.5" (47.0 cm) heavy manganese-phosphate 12ga barrel exterior & chrome smoothbore (48 segs!)
    #    Split cleanly into main body (X in [10.18, 52.35]) + muzzle choke zone (X in [52.30, 53.50]) + chrome breech
    main_bbl = mk_lathe_x(
        "bbl_main",
        [
            (1.03, 10.18), (1.40, 10.18), (1.44, 10.24), (1.44, 15.20),
            (1.26, 17.80), (1.18, 24.50), (1.13, 48.50), (1.16, 48.62),
            (1.16, 49.78), (1.12, 49.90), (1.12, 52.45), (0.935, 52.45),
            (0.925, 15.80), (1.03, 14.40), (1.03, 10.18),
        ],
        segs=48, mat=m_park,
    )

    # Muzzle Mobilchoke crown section (X in [52.40, 53.50]) w/ 4 authentic choke-tube wrench notches!
    muzzle_raw = mk_lathe_x(
        "bbl_muzzle_raw",
        [
            (0.925, 52.40), (1.12, 52.40), (1.12, 53.43), (1.09, 53.50),
            (0.96, 53.50), (0.925, 53.36), (0.925, 52.40),
        ],
        segs=48, mat=m_soot,
    )
    choke_notches = []
    for ni in range(4):
        ang = ni * math.pi * 0.5
        choke_notches.append(
            mk_box(f"c_choke_{ni}", 0.24, 0.14, 0.14,
                   [("rx", ang), ("t", 53.44, math.cos(ang) * 0.96, math.sin(ang) * 0.96)], mat=m_dark)
        )
    muzzle_crown = bool_subtract(muzzle_raw, choke_notches)

    # Hard-chrome barrel extension collar & feed hood (X in [6.50, 10.22], gleams inside ejection port!)
    ext_collar = mk_lathe_x(
        "bbl_ext",
        [
            (1.06, 6.50), (1.39, 6.50), (1.40, 6.56), (1.40, 10.20),
            (1.03, 10.20), (1.03, 6.56), (1.06, 6.50),
        ],
        segs=40, mat=m_chrome,
    )
    feed_hood = mk_box("bbl_fhood", 1.85, 0.40, 1.32, [("t", 7.42, 1.32, 0.0)], m_chrome, bevel=0.04)

    # 2. Twin Symmetrical ARGO Gas Cylinders under barrel immediately ahead of chamber (X in [14.2, 22.8], Y=-1.23, Z=±1.18)
    argo_parts = []
    for zi, z_sign in enumerate((-1.0, 1.0)):
        cyl = mk_lathe_x(
            f"bbl_argo_{zi}",
            [
                (0.415, 14.20), (0.61, 14.20), (0.635, 14.42), (0.635, 22.58),
                (0.605, 22.80), (0.415, 22.80), (0.415, 14.20),
            ],
            segs=32, xform=[("t", 0.0, -1.23, z_sign * 1.18)], mat=m_park,
        )
        # Angled gas-tap boss connecting cylinder into barrel chamber-forward gas port
        boss = mk_cyl(f"bbl_gboss_{zi}", 0.28, 0.34, 1.15, axis="y", segs=18,
                      xform=[("rx", -z_sign * 0.62), ("t", 16.05, -0.70, z_sign * 0.66)], mat=m_park, bevel=0.02)
        argo_parts.extend([cyl, boss])

    # Investment-cast ARGO manifold bridge contoured with circular underside clearance around r=1.28 mag tube!
    bridge_raw = mk_box("bbl_abridge", 5.80, 1.04, 2.66, [("t", 17.80, -0.78, 0.0)], m_park, bevel=0.06)
    mag_relief = mk_cyl("c_ab_mag", 1.30, 1.30, 6.40, axis="x", segs=32, xform=[("t", 17.80, -2.60, 0.0)], mat=m_dark)
    # Subtract cylinder bores through bridge so ARGO pistons slide cleanly inside!
    bore_l = mk_cyl("c_ab_bl", 0.415, 0.415, 6.40, axis="x", segs=28, xform=[("t", 17.80, -1.23, -1.18)], mat=m_dark)
    bore_r = mk_cyl("c_ab_br", 0.415, 0.415, 6.40, axis="x", segs=28, xform=[("t", 17.80, -1.23,  1.18)], mat=m_dark)
    bridge = bool_subtract(bridge_raw, [mag_relief, bore_l, bore_r])

    # 3. Front barrel support guide ring clamping around underbarrel mag tube (local Y = -2.60, X in [48.65, 49.75])
    front_ring = mk_lathe_x(
        "bbl_fring",
        [
            (1.29, 48.65), (1.51, 48.65), (1.52, 48.72), (1.52, 49.68),
            (1.51, 49.75), (1.29, 49.75), (1.29, 48.65),
        ],
        segs=36, xform=[("t", 0.0, -2.60, 0.0)], mat=m_park,
    )
    front_web = mk_box("bbl_fweb", 1.02, 0.86, 0.88, [("t", 49.20, -1.22, 0.0)], m_park, bevel=0.04)

    # Interior gleaming chrome smoothbore liner ring visible down the muzzle
    bore_shine = mk_lathe_x(
        "bbl_cbore",
        [(0.922, 15.80), (0.925, 15.80), (0.925, 53.30), (0.922, 53.30), (0.922, 15.80)],
        segs=32, mat=m_ss,
    )

    obj = join_objects(
        [main_bbl, muzzle_crown, ext_collar, feed_hood, *argo_parts, bridge, front_ring, front_web, bore_shine],
        "benellim4_barrel",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_argo_pistons(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-02: Twin Symmetrical Mirror-Chrome Self-Regulating Short-Stroke ARGO Tappet Pistons
    w/ Longitudinal Self-Cleaning Flutes & Authentic Gas-Face Carbon Scorch Ring.
    assembledPos: [15.2, 0.12, 0] | spans X in [-8.80, +5.40], Y in [-0.40, +0.40], Z in [-1.58, +1.58]."""
    m_chrome = mats["M_ArgoMirrorChrome"]
    m_ss = mats["M_BrushedStainless"]

    parts = []
    for zi, z_sign in enumerate((-1.0, 1.0)):
        z_off = z_sign * 1.18
        body = mk_lathe_x(
            f"argo_p_{zi}",
            [
                (0.0, -8.80), (0.21, -8.80), (0.23, -8.72), (0.23, -1.40),
                (0.39, -1.15), (0.39, 1.35), (0.33, 1.42), (0.33, 2.35),
                (0.39, 2.42), (0.39, 3.65), (0.34, 3.72), (0.34, 4.45),
                (0.40, 4.52), (0.40, 5.40), (0.26, 5.40), (0.22, 4.72),
                (0.0, 4.72),
            ],
            segs=32, xform=[("t", 0.0, 0.0, z_off)], mat=m_chrome,
        )
        parts.append(body)
        # 6 precision self-cleaning carbon-scraper ribs along the piston body
        for fi in range(6):
            ang = fi * math.pi / 3.0 + math.pi / 6.0
            rib = mk_box(
                f"argo_fl_{zi}_{fi}", 2.25, 0.062, 0.062,
                [("rx", ang), ("t", 2.50, math.cos(ang) * 0.368, z_off + math.sin(ang) * 0.368)],
                mat=m_ss, bevel=0.012,
            )
            parts.append(rib)

    obj = join_objects(parts, "benellim4_argo_pistons")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_argo_plugs(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-03: Twin Knurled Black-Steel ARGO Gas Cylinder End-Caps & Self-Regulating Exhaust Valves.
    assembledPos: [23.1, 0.12, 0] | spans X in [-1.25, +1.36], Y in [-0.64, +0.64], Z in [-1.82, +1.82]."""
    m_knurl = mats["M_KnurledBlackSteel"]
    m_park = mats["M_ParkerizedSteel"]
    m_ss = mats["M_BrushedStainless"]

    parts = []
    for zi, z_sign in enumerate((-1.0, 1.0)):
        z_off = z_sign * 1.18
        plug = mk_lathe_x(
            f"ap_body_{zi}",
            [
                (0.0, -1.25), (0.36, -1.25), (0.39, -1.18), (0.39, -0.25),
                (0.57, -0.18), (0.59, -0.12), (0.59, 0.88), (0.46, 0.96),
                (0.46, 1.32), (0.18, 1.36), (0.18, 0.92), (0.0, 0.92),
            ],
            segs=32, xform=[("t", 0.0, 0.0, z_off)], mat=m_park,
        )
        # 20-flute machined diamond-knurl grip collar
        knurl = mk_knurled_cyl(
            f"ap_kn_{zi}", 0.635, 0.96, axis="x", flutes=20, depth=0.028,
            xform=[("t", 0.38, 0.0, z_off)], mat=m_knurl,
        )
        # 6-sided hex wrench nose boss + internal stainless self-regulating relief poppet!
        hex_boss = mk_cyl(
            f"ap_hex_{zi}", 0.49, 0.49, 0.36, axis="x", segs=6,
            xform=[("t", 1.12, 0.0, z_off)], mat=m_knurl, bevel=0.018,
        )
        poppet = mk_cyl(
            f"ap_pop_{zi}", 0.15, 0.15, 0.14, axis="x", segs=18,
            xform=[("t", 1.04, 0.0, z_off)], mat=m_ss, bevel=0.015,
        )
        parts.extend([plug, knurl, hex_boss, poppet])

    obj = join_objects(parts, "benellim4_argo_plugs")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_bolt_carrier(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-04: Heavy Machined Oiled-Steel Bolt Carrier w/ Dual ARGO Anvil Shoulders,
    38-deg Helical Cam Track & Hinged Stainless Rat-Tail Recoil Link.
    assembledPos: [1.2, 1.35, 0] | spans X in [-8.85, +5.20], Y in [-1.49, +0.86], Z in [-1.44, +1.44]."""
    m_bcg = mats["M_OiledActionSteel"]
    m_ss = mats["M_BrushedStainless"]
    m_dark = mats["M_InnerDark"]

    # Main CNC-machined carrier slab + dual forward ARGO impact towers
    slab = mk_box("bcg_slab", 9.60, 1.54, 2.16, [("t", -0.20, 0.08, 0.0)], m_bcg, bevel=0.075)
    tow_l = mk_box("bcg_tl", 2.45, 1.18, 0.64, [("t", 3.92, -0.82, -1.06)], m_bcg, bevel=0.045)
    tow_r = mk_box("bcg_tr", 2.45, 1.18, 0.64, [("t", 3.92, -0.82,  1.06)], m_bcg, bevel=0.045)
    body = bool_union([slab, tow_l, tow_r], "bcg_solid")

    # Carve axial bolt-stem tunnel, 38-deg helical cam track, +Z charging handle socket & bottom hammer trough
    cutters = [
        mk_cyl("c_bcg_tun", 0.65, 0.65, 10.60, axis="x", segs=32, mat=m_dark),
        mk_box("c_bcg_cam", 1.76, 0.66, 0.76, [("ry", 0.46), ("t", 1.95, 0.68, 0.08)], mat=m_dark),
        mk_cyl("c_bcg_chg", 0.27, 0.27, 0.98, axis="z", segs=20, xform=[("t", 2.40, 0.15, 0.85)], mat=m_dark),
        mk_box("c_bcg_ham", 7.20, 0.56, 1.06, [("t", -0.80, -0.58, 0.0)], mat=m_dark),
    ]
    machined = bool_subtract(body, cutters)

    # Hardened stainless ARGO piston impact anvil faces (local X=+5.02 -> world X=+6.22..+6.40!)
    anv_l = mk_cyl("bcg_al", 0.26, 0.26, 0.36, axis="x", segs=24, xform=[("t", 5.02, -1.23, -1.18)], mat=m_ss, bevel=0.025)
    anv_r = mk_cyl("bcg_ar", 0.26, 0.26, 0.36, axis="x", segs=24, xform=[("t", 5.02, -1.23,  1.18)], mat=m_ss, bevel=0.025)

    # Hinged rear rat-tail recoil link plunging into angled stock recoil tube (14.0 deg = STOCK_ANGLE)
    fork = mk_box("bcg_fork", 1.12, 0.44, 0.64, [("t", -5.15, -0.22, 0.0)], m_bcg, bevel=0.035)
    hpin = mk_cyl("bcg_hpin", 0.115, 0.115, 0.82, axis="z", segs=16, xform=[("t", -5.10, -0.22, 0.0)], mat=m_ss, bevel=0.015)
    rod = mk_cyl("bcg_rod", 0.21, 0.18, 3.85, axis="x", segs=22,
                 xform=[("rz", STOCK_ANGLE), ("t", -6.95, -0.68, 0.0)], mat=m_ss, bevel=0.035)

    obj = join_objects([machined, anv_l, anv_r, fork, hpin, rod], "benellim4_bolt_carrier")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_bolt_head(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-05: Gleaming Brushed-Stainless / Hard-Chrome 2-Lug Rotating Bolt Head & Heavy Claw Extractor.
    assembledPos: [5.4, 1.35, 0] | spans X in [-4.15, +1.51], Y in [-1.36, +1.36], Z in [-1.02, +1.08]."""
    m_ss = mats["M_BrushedStainless"]
    m_chrome = mats["M_HardChromeBore"]
    m_dark_st = mats["M_OiledActionSteel"]
    m_dark = mats["M_InnerDark"]

    # Hollow bolt tail stem + recessed 12-gauge breech face cup + axial firing-pin bore
    core_raw = mk_lathe_x(
        "bh_core",
        [
            (0.13, -4.15), (0.61, -4.15), (0.61, -0.05), (1.02, 0.08),
            (1.02, 1.42), (0.98, 1.46), (0.84, 1.46), (0.82, 1.32),
            (0.13, 1.32), (0.13, -4.15),
        ],
        segs=36, mat=m_ss,
    )
    # Bore actual vertical cam-pin hole through bolt stem at local X = -2.20 (world X = 3.20!)
    # and subtle left-side ejector slot!
    cam_bore = mk_cyl("c_bh_cam", 0.315, 0.315, 1.40, axis="y", segs=24, xform=[("t", -2.20, 0.0, 0.0)], mat=m_dark)
    ej_slot = mk_box("c_bh_ej", 0.85, 0.24, 0.36, [("t", 1.15, 0.0, -0.92)], mat=m_dark)
    core = bool_subtract(core_raw, [cam_bore, ej_slot])

    # Massive opposing Benelli 2-lug radial locking lugs (top & bottom, X in [+0.32, +1.26])
    lug_t = mk_box("bh_lugt", 0.94, 0.44, 0.86, [("t", 0.79,  1.14, 0.0)], m_chrome, bevel=0.055)
    lug_b = mk_box("bh_lugb", 0.94, 0.44, 0.86, [("t", 0.79, -1.14, 0.0)], m_chrome, bevel=0.055)

    # Heavy tempered spring-steel right-side (+Z) claw extractor + pivot pin
    ext_bar = mk_box("bh_ext", 1.28, 0.34, 0.22, [("t", 0.84, 0.12, 0.96)], m_dark_st, bevel=0.028)
    ext_hook = mk_box("bh_ehk", 0.18, 0.36, 0.28, [("t", 1.42, 0.12, 0.88)], m_ss, bevel=0.020)
    ext_pin = mk_cyl("bh_epin", 0.075, 0.075, 0.44, axis="y", segs=14,
                     xform=[("t", 0.62, 0.12, 0.94)], mat=m_chrome, bevel=0.008)

    obj = join_objects([core, lug_t, lug_b, ext_bar, ext_hook, ext_pin], "benellim4_bolt_head")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_cam_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-06: Hardened Cylindrical Bolt Cam Pin w/ Firing-Pin Safety Through-Hole.
    assembledPos: [3.2, 2.08, 0] | spans X in [-0.44, +0.44], Y in [-0.85, +0.62], Z in [-0.44, +0.44]."""
    m_steel = mats["M_OiledActionSteel"]
    m_ss = mats["M_BrushedStainless"]
    m_dark = mats["M_InnerDark"]

    shaft_raw = mk_lathe_y(
        "cp_shaft",
        [
            (0.0, -0.85), (0.28, -0.85), (0.31, -0.81), (0.31, 0.17),
            (0.44, 0.21), (0.44, 0.57), (0.39, 0.62), (0.0, 0.62),
        ],
        segs=28, mat=m_steel,
    )
    # Actual firing-pin safety cross-bore at world Y = 1.35 (local Y = -0.73)!
    fp_hole = mk_cyl("c_cp_fp", 0.135, 0.135, 0.80, axis="x", segs=18, xform=[("t", 0.0, -0.58, 0.0)], mat=m_dark)
    shaft = bool_subtract(shaft_raw, [fp_hole])
    idx_flat = mk_box("cp_flat", 0.62, 0.26, 0.56, [("t", 0.0, 0.48, 0.0)], m_ss, bevel=0.025)

    obj = join_objects([shaft, idx_flat], "benellim4_cam_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_firing_pin(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-07: Long Floating Tool-Steel Firing Pin w/ Anti-Inertia Stop Collar.
    assembledPos: [0.95, 1.35, 0] | spans X in [-5.92, +5.92], Y in [-0.24, +0.24], Z in [-0.24, +0.24]."""
    m_ss = mats["M_BrushedStainless"]
    pin = mk_lathe_x(
        "benellim4_firing_pin",
        [
            (0.0, -5.92), (0.21, -5.92), (0.24, -5.86), (0.24, -5.15),
            (0.12, -5.08), (0.12, 0.85), (0.22, 0.92), (0.22, 1.24),
            (0.105, 1.32), (0.105, 4.45), (0.055, 5.78), (0.035, 5.90),
            (0.0, 5.92),
        ],
        segs=28, mat=m_ss,
    )
    return finish_part(pin, bevel_w=0.0, sharp_deg=36.0)


def build_benellim4_charging_handle(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """B-08: Knurled Rotating Tactical Combat Bolt Handle (+Z).
    assembledPos: [3.6, 1.50, 1.65] | spans X in [-0.48, +0.48], Y in [-0.48, +0.48], Z in [-0.88, +1.28]."""
    m_steel = mats["M_OiledActionSteel"]
    m_knurl = mats["M_KnurledBlackSteel"]
    m_ss = mats["M_BrushedStainless"]

    # Turned handle core rotated from +X to +Z via ("ry", -pi/2)
    core = mk_lathe_x(
        "ch_core",
        [
            (0.0, -0.88), (0.22, -0.88), (0.25, -0.82), (0.25, -0.05),
            (0.42, 0.08), (0.45, 0.16), (0.45, 0.42), (0.40, 0.46),
            (0.45, 0.50), (0.45, 0.78), (0.40, 0.82), (0.45, 0.86),
            (0.45, 1.18), (0.40, 1.26), (0.18, 1.28), (0.0, 1.23),
        ],
        segs=32, xform=[("ry", -math.pi * 0.5)], mat=m_steel,
    )
    # 3 distinct knurled tactile grip rings along the rotating tactical handle drum!
    kn1 = mk_knurled_cyl("ch_kn1", 0.48, 0.24, axis="z", flutes=22, depth=0.022, xform=[("t", 0.0, 0.0, 0.29)], mat=m_knurl)
    kn2 = mk_knurled_cyl("ch_kn2", 0.48, 0.26, axis="z", flutes=22, depth=0.022, xform=[("t", 0.0, 0.0, 0.64)], mat=m_knurl)
    kn3 = mk_knurled_cyl("ch_kn3", 0.48, 0.28, axis="z", flutes=22, depth=0.022, xform=[("t", 0.0, 0.0, 1.01)], mat=m_knurl)
    detent = mk_box("ch_det", 0.30, 0.14, 0.30, [("t", 0.0, 0.0, -0.62)], m_ss, bevel=0.018)

    obj = join_objects([core, kn1, kn2, kn3, detent], "benellim4_charging_handle")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_hammer(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """FC-03: Forged 17-4PH Brushed Stainless Internal Rotating Hammer.
    assembledPos: [-5.15, -1.55, 0] | spans X in [-2.22, +0.38], Y in [-0.28, +1.92], Z in [-0.66, +0.66]."""
    m_ss = mats["M_BrushedStainless"]
    m_chrome = mats["M_HardChromeBore"]

    ham_xy = [
        (-0.35, -0.28),
        ( 0.38, -0.28),
        ( 0.22,  0.55),
        (-1.55,  1.48),
        (-1.88,  1.92),
        (-2.22,  1.52),
        (-0.62,  0.25),
    ]
    body = mk_extrude_z("ham_body", ham_xy, -0.29, 0.29, bevel=0.036, bevel_segs=2, mat=m_ss)
    hub = mk_cyl("ham_hub", 0.32, 0.32, 0.64, axis="z", segs=24, mat=m_ss, bevel=0.02)
    axle = mk_cyl("ham_axle", 0.14, 0.14, 1.32, axis="z", segs=20, mat=m_chrome, bevel=0.018)

    obj = join_objects([body, hub, axle], "benellim4_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_mag_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-01: Full-Length 18.5" Parkerized Steel 7-Round Tubular Magazine w/ Slotted Sling Mount & Brass Detent.
    assembledPos: [30.9, -1.25, 0] | spans X in [-20.90, +20.70], Y in [-1.48, +1.48], Z in [-2.14, +1.48]."""
    m_park = mats["M_ParkerizedSteel"]
    m_steel = mats["M_OiledActionSteel"]
    m_brass = mats["M_BrassDetent"]
    m_dark = mats["M_InnerDark"]

    # Seamless 7-round steel tubular magazine with crisp front threads
    tube = mk_lathe_x(
        "mt_tube",
        [
            (1.05, -20.90), (1.24, -20.90), (1.27, -20.20), (1.27, 19.35),
            (1.22, 19.45), (1.22, 19.65), (1.25, 19.72), (1.22, 19.80),
            (1.25, 19.88), (1.22, 19.96), (1.25, 20.04), (1.22, 20.12),
            (1.25, 20.20), (1.22, 20.28), (1.22, 20.70), (1.05, 20.70),
            (1.05, -20.90),
        ],
        segs=40, mat=m_park,
    )

    # Reversible M1014 front tactical side-sling swivel plate w/ TRUE hollowed oval sling slot!
    collar = mk_lathe_x(
        "mt_scol",
        [(1.27, 18.85), (1.48, 18.85), (1.48, 19.35), (1.27, 19.35), (1.27, 18.85)],
        segs=32, mat=m_steel,
    )
    ear_raw = mk_box("mt_sear_raw", 0.36, 1.36, 0.90, [("t", 19.10, 0.0, -1.69)], m_steel, bevel=0.04)
    slot_pts = _rounded_rect_pts(0.46, 0.22, 0.14, corner_segs=4)
    ear_slot = mk_extrude_x(
        "c_mt_sslot", slot_pts, 18.70, 19.50,
        xform=[("rx", math.pi * 0.5), ("t", 0.0, 0.0, -1.80)], mat=m_dark,
    )
    ear = bool_subtract(ear_raw, [ear_slot])

    # Warm C360 brass spring-loaded magazine-cap ratchet detent plunger
    detent = mk_cyl("mt_bdet", 0.09, 0.09, 0.26, axis="x", segs=16,
                    xform=[("t", 19.45, 1.18, 0.0)], mat=m_brass, bevel=0.015)

    obj = join_objects([tube, collar, ear, detent], "benellim4_mag_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_mag_cap(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-02: Heavy Knurled Ratcheting Magazine Tube Retention Cap.
    assembledPos: [52.35, -1.25, 0] | spans X in [-1.05, +1.05], Y in [-1.49, +1.49], Z in [-1.49, +1.49]."""
    m_park = mats["M_ParkerizedSteel"]
    m_knurl = mats["M_KnurledBlackSteel"]

    cap = mk_lathe_x(
        "mc_core",
        [
            (1.23, -1.05), (1.42, -1.05), (1.44, -0.96), (1.44, 0.78),
            (1.36, 0.98), (0.92, 1.05), (0.86, 0.88), (0.0, 0.88),
            (0.0, -0.35), (1.23, -0.35), (1.23, -1.05),
        ],
        segs=40, mat=m_park,
    )
    knurl = mk_knurled_cyl(
        "mc_knurl", 1.485, 1.54, axis="x", flutes=24, depth=0.036,
        xform=[("t", -0.08, 0.0, 0.0)], mat=m_knurl,
    )
    obj = join_objects([cap, knurl], "benellim4_mag_cap")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_benellim4_shell_elevator(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-05: Pivoting Brushed-Stainless Anti-Pinch Forked Shell Carrier / Elevator.
    assembledPos: [-3.65, -1.68, 0] | spans X in [-0.56, +8.895], Y in [-0.24, +1.02], Z in [-0.88, +0.99]."""
    m_ss = mats["M_BrushedStainless"]
    m_chrome = mats["M_HardChromeBore"]
    m_steel = mats["M_OiledActionSteel"]

    # Stamped curved U-trough carrier spoon (extruded along X in [+0.22, +7.08])
    u_zy = [(-0.84, 0.36), (-0.84, -0.14)]
    u_zy += _quad_bez((-0.84, -0.14), (0.0, -0.34), (0.84, -0.14), segs=8)
    u_zy += [(0.84, 0.36), (0.68, 0.36), (0.68, -0.04)]
    u_zy += _quad_bez((0.68, -0.04), (0.0, -0.20), (-0.68, -0.04), segs=8)
    u_zy += [(-0.68, 0.36)]
    spoon = mk_extrude_x("el_spoon", u_zy, 0.22, 7.08, bevel=0.020, bevel_segs=2, mat=m_ss)

    # Iconic Benelli forked anti-pinch twin front prongs leaving central thumb gap!
    prong_l = mk_box("el_pl", 1.96, 0.22, 0.38, [("t", 7.91, -0.04, -0.58)], m_chrome, bevel=0.032)
    prong_r = mk_box("el_pr", 1.96, 0.22, 0.38, [("t", 7.91, -0.04,  0.58)], m_chrome, bevel=0.032)

    # Rear stamped pivot ears, carrier dog latch & chrome pivot axle (local origin = exact hinge pivot!)
    ear_l = mk_box("el_el", 0.96, 0.72, 0.16, [("t", 0.12, 0.22, -0.76)], m_ss, bevel=0.022)
    ear_r = mk_box("el_er", 0.96, 0.72, 0.16, [("t", 0.12, 0.22,  0.76)], m_ss, bevel=0.022)
    dog = mk_box("el_dog", 0.76, 0.92, 0.22, [("t", -0.18, 0.56, 0.88)], m_steel, bevel=0.025)
    axle = mk_cyl("el_axle", 0.12, 0.12, 1.76, axis="z", segs=18, mat=m_chrome, bevel=0.018)

    obj = join_objects([spoon, prong_l, prong_r, ear_l, ear_r, dog, axle], "benellim4_shell_elevator")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# PART BUILDERS — ATLAS 3: FOREND, RECOIL TUBE/GRIP, TELESTOCK & FOLLOWER (4 parts)
# =============================================================================
def build_benellim4_forend(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-05: 2-Piece Glass-Reinforced Sculpted Ergonomic Polymer Forend / Handguard.
    Features rounded stadium ARGO cooling vents and 11 pairs of angled concave tactile
    finger-traction cove flutes carved seamlessly into the contoured palm swells (zero boxy sticks!).
    assembledPos: [21.5, -0.35, 0] | spans X in [-11.20, +11.20], Y in [-2.48, +1.68], Z in [-2.29, +2.29]."""
    m_poly = mats["F_NylonForend"]
    m_grip = mats["F_GripStipple"]

    # Contoured ergonomic U-trough cross-section in (Z, Y) extruded along X in [-11.20, +11.20]
    # Smoothly rounded ergonomic palm swell out to Z=±2.27 while keeping inner Z=±1.88 & floor Y=-2.18 100% clear!
    u_zy = [
        (-1.68,  1.68),
        (-2.22,  0.54),
    ]
    u_zy += _quad_bez((-2.22, 0.54), (-2.33, -1.78), (-1.34, -2.48), segs=12)
    u_zy.append((1.34, -2.48))
    u_zy += _quad_bez((1.34, -2.48), (2.33, -1.78), (2.22, 0.54), segs=12)
    u_zy += [
        ( 1.68,  1.68),
        ( 1.38,  1.68),
        ( 1.88,  0.48),
    ]
    u_zy += _quad_bez((1.88, 0.48), (1.92, -1.56), (1.16, -2.18), segs=10)
    u_zy.append((-1.16, -2.18))
    u_zy += _quad_bez((-1.16, -2.18), (-1.92, -1.56), (-1.88, 0.48), segs=10)
    u_zy.append((-1.38, 1.68))

    raw = mk_extrude_x("fe_raw", u_zy, -11.20, 11.20, bevel=0.085, bevel_segs=3, mat=m_poly)

    # Carve 6 pairs of rounded underside ARGO gas-vent louvers, 4 pairs of rounded upper cooling slots,
    # 2-piece bottom clamshell parting seam, tapered nose relief, AND 11 pairs of angled concave tactile flutes!
    cutters = [
        mk_box("c_fe_seam", 22.60, 0.14, 0.08, [("t", 0.0, -2.46, 0.0)], mat=m_poly),
    ]
    v_lo_pts = _rounded_rect_pts(0.78, 0.28, 0.22, corner_segs=5)
    for i in range(6):
        vx = -7.50 + i * 2.85
        cutters.append(
            mk_extrude_z(f"c_fe_vl_{i}", v_lo_pts, -0.34, 0.34, xform=[("rx", math.pi * 0.5), ("t", vx, -2.28, -1.14)], mat=m_poly)
        )
        cutters.append(
            mk_extrude_z(f"c_fe_vr_{i}", v_lo_pts, -0.34, 0.34, xform=[("rx", math.pi * 0.5), ("t", vx, -2.28,  1.14)], mat=m_poly)
        )
    v_up_pts = _rounded_rect_pts(0.92, 0.17, 0.14, corner_segs=5)
    for i in range(4):
        sx = -6.20 + i * 3.80
        cutters.append(mk_extrude_z(f"c_fe_ul_{i}", v_up_pts, -2.35, -1.45, xform=[("t", sx, 1.18, 0.0)], mat=m_poly))
        cutters.append(mk_extrude_z(f"c_fe_ur_{i}", v_up_pts,  1.45,  2.35, xform=[("t", sx, 1.18, 0.0)], mat=m_poly))
    # Front tapered upper shoulder relief so forend nose hugs barrel smoothly
    cutters.append(mk_box("c_fe_nose", 2.60, 1.20, 4.80, [("rz", -0.34), ("t", 10.75, 1.52, 0.0)], mat=m_poly))

    # 11 pairs of angled (10 deg) concave tactile finger-traction cove flutes carved directly into the
    # rounded polymer palm flanks (depth reaches |Z|=2.12, safely outside inner cavity |Z|=1.88!)
    for r in range(11):
        rx = -9.15 + r * 1.83
        for si, z_sign in enumerate((-1.0, 1.0)):
            flute = mk_cyl(
                f"c_fe_fl_{r}_{si}", 0.215, 0.215, 2.08, axis="y", segs=16,
                xform=[("rz", -0.175), ("t", rx, -0.45, z_sign * 2.335)],
                mat=m_grip, bevel=0.06,
            )
            cutters.append(flute)

    body = bool_subtract(raw, cutters)
    body.name = "benellim4_forend"
    body.data.name = "benellim4_forend"
    return finish_part(body, bevel_w=0.0, sharp_deg=38.0)


def build_benellim4_recoil_tube(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-06: 3-Position Notched Steel Receiver Extension / Recoil Tube + Ergonomic Stippled M1014 Pistol Grip.
    assembledPos: [-10.4, 0.35, 0] | spans X in [-22.41, +0.77], Y in [-12.06, +1.45], Z in [-1.62, +1.62]."""
    m_steel = mats["F_SteelRecoilTube"]
    m_ss = mats["F_SteelCapStainless"]
    m_poly = mats["F_NylonStock"]
    m_stip = mats["F_GripStipple"]

    # 1. Hollow alloy-steel 3-position notched recoil buffer tube angled at STOCK_ANGLE (0.244 rad = 14 deg)
    tube_raw = mk_lathe_x(
        "rt_tube",
        [
            (0.78, -22.20), (1.36, -22.20), (1.36, -18.50), (1.21, -18.35),
            (1.21, -17.45), (1.36, -17.30), (1.36, -11.80), (1.21, -11.65),
            (1.21, -10.75), (1.36, -10.60), (1.36, -4.80),  (1.21, -4.65),
            (1.21, -3.75),  (1.38, -3.60),  (1.38,  0.45),  (0.78,  0.45),
            (0.78, -22.20),
        ],
        segs=36, xform=[("rz", STOCK_ANGLE)], mat=m_steel,
    )
    # Authentic Benelli M1014 longitudinal underside locking keyway channel connecting the 3 notches!
    keyway = mk_box("c_rt_key", 16.50, 0.32, 0.38,
                    [("t", -11.20, -1.32, 0.0), ("rz", STOCK_ANGLE)], mat=m_steel)
    tube = bool_subtract(tube_raw, [keyway])

    # Threaded stainless rear buffer retention end-plug w/ spanner wrench slot
    cap_raw = mk_cyl(
        "rt_cap", 1.34, 1.34, 0.86, axis="x", segs=32,
        xform=[("t", -22.35, 0.0, 0.0), ("rz", STOCK_ANGLE)], mat=m_ss, bevel=0.06,
    )
    cap_slot = mk_box("c_rt_cs", 0.35, 0.24, 1.80,
                      [("t", -22.74, 0.0, 0.0), ("rz", STOCK_ANGLE)], mat=m_steel)
    rear_cap = bool_subtract(cap_raw, [cap_slot])

    # 2. Ergonomic Sculpted Rubberized M1014 Pistol Grip:
    #    - Upper wrap-around receiver tang collar extending seamlessly to local X=+0.72 (zero gap against trigger housing!)
    #    - Organic multi-station superellipse lofted grip shaft w/ palm swell, contoured front finger grooves & rounded backstrap!
    collar_xy = [
        ( 0.72, -1.68),
        ( 0.42, -0.82),
        (-0.55, -0.45),
        (-2.90, -1.35),
        (-2.55, -2.50),
        ( 0.36, -2.85),
        ( 0.72, -2.30),
    ]
    grip_collar = mk_extrude_z("rt_gcol", collar_xy, -1.42, 1.42, bevel=0.22, bevel_segs=3, mat=m_poly)

    # Organic lofted pistol grip body from Y = -2.10 down to Y = -11.45 (smooth superellipse cross-sections!)
    grip_stations = [
        # (y, x_front, x_back, half_z, super_exp)
        (-2.05,  0.30, -2.62, 1.38, 2.4),
        (-3.10,  0.14, -2.96, 1.42, 2.3),
        (-4.15, -0.22, -3.28, 1.48, 2.2),  # finger groove 1 crest
        (-4.85, -0.18, -3.48, 1.52, 2.1),  # palm swell max
        (-5.90, -0.62, -3.80, 1.54, 2.1),
        (-6.75, -0.64, -4.06, 1.50, 2.1),  # finger groove 2 crest
        (-7.85, -1.06, -4.38, 1.46, 2.2),
        (-8.75, -1.08, -4.64, 1.44, 2.2),  # finger groove 3 crest
        (-9.95, -1.50, -4.96, 1.46, 2.3),
        (-11.20, -1.84, -5.24, 1.50, 2.4),
        (-11.55, -1.92, -5.22, 1.48, 2.4),
    ]
    n_ring = 36
    grip_rings = []
    for y_st, xf, xb, hz, p_exp in grip_stations:
        xc = 0.5 * (xf + xb)
        hx = 0.5 * (xf - xb)
        ring = []
        for k in range(n_ring):
            th = 2.0 * math.pi * k / n_ring
            ct, st = math.cos(th), math.sin(th)
            # Smooth rounded superellipse (organic ergonomic palm contour, zero boxy edges!)
            sx = math.copysign(abs(ct) ** (2.0 / p_exp), ct) * hx
            sz = math.copysign(abs(st) ** (2.0 / p_exp), st) * hz
            ring.append((xc + sx, y_st, sz))
        grip_rings.append(ring)
    grip_shaft = mk_loft_rings("rt_gshaft", grip_rings, mat=m_poly, cap_ends=True)

    grip_raw = bool_union([grip_collar, grip_shaft], "rt_grip_union")
    # Bore clean clearance through top of grip for the steel recoil tube!
    tube_bore = mk_cyl("c_rt_gbore", 1.36, 1.36, 6.40, axis="x", segs=32,
                       xform=[("t", -1.50, 0.0, 0.0), ("rz", STOCK_ANGLE)], mat=m_poly)
    grip_body = bool_subtract(grip_raw, [tube_bore])

    # Rounded contoured grip base pommel cap
    pom_rings = []
    for dy, sc in ((-0.26, 0.94), (-0.12, 1.03), (0.12, 1.02), (0.28, 0.95)):
        ring = []
        for k in range(n_ring):
            th = 2.0 * math.pi * k / n_ring
            ct, st = math.cos(th), math.sin(th)
            sx = math.copysign(abs(ct) ** 0.78, ct) * 1.84 * sc
            sz = math.copysign(abs(st) ** 0.78, st) * 1.60 * sc
            ring.append((sx, dy, sz))
        pom_rings.append(ring)
    pommel = mk_loft_rings("rt_pommel", pom_rings, xform=[("rz", 0.14), ("t", -3.55, -11.48, 0.0)], mat=m_poly)

    # Organic contoured rubberized micro-stippled side grip pads conforming 100% flush to the superellipse palm swell!
    stip_stations = [
        # (y, xf_grip, xb_grip, hz_grip, p_exp, pad_x_frac)
        (-3.65, -0.04, -3.12, 1.45, 2.25, 0.56),
        (-5.40, -0.40, -3.64, 1.53, 2.10, 0.62),
        (-7.40, -0.88, -4.24, 1.48, 2.15, 0.60),
        (-9.95, -1.50, -4.96, 1.46, 2.30, 0.56),
    ]
    stip_rings_l, stip_rings_r = [], []
    for y_st, xf_g, xb_g, hz_g, p_e, x_frac in stip_stations:
        xc_g = 0.5 * (xf_g + xb_g)
        hx_g = 0.5 * (xf_g - xb_g)
        hx_p = hx_g * x_frac
        rl, rr = [], []
        for k in range(20):
            th = 2.0 * math.pi * k / 20
            ct, st = math.cos(th), math.sin(th)
            dx = ct * hx_p
            px = xc_g + dx
            # Exact superellipse outer Z of the grip shaft at px -> zero fin overhang!
            u_x = min(0.96, abs(dx) / max(hx_g, 1e-4))
            z_surf = hz_g * ((1.0 - (u_x ** p_e)) ** (1.0 / p_e))
            # Outer face sits +0.028 cm proud of curved cheek; inner face embeds -0.10 cm inside grip!
            off = 0.028 if st >= 0.0 else -0.10
            edge_taper = max(0.0, st) * 0.028 + min(0.0, st) * 0.10
            rl.append((px, y_st, -(z_surf + edge_taper)))
            rr.append((px, y_st,  (z_surf + edge_taper)))
        stip_rings_l.append(rl)
        stip_rings_r.append(rr)
    stip_l = mk_loft_rings("rt_st_l", stip_rings_l, mat=m_stip)
    stip_r = mk_loft_rings("rt_st_r", stip_rings_r, mat=m_stip)

    obj = join_objects([tube, rear_cap, grip_body, pommel, stip_l, stip_r], "benellim4_recoil_tube")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_benellim4_telestock(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """F-07: Iconic USMC M1014 Skeletonized Collapsible Telestock w/ Continuously Welded Strut,
    Molded Elastomer Cheek Rest, Slotted Sling Loop, Steel Release Button & Ribbed Rubber Buttpad!
    assembledPos: [-27.6, -3.95, 0] | spans X in [-7.50, +7.84], Y in [-8.11, +5.15], Z in [-1.82, +2.06]."""
    m_poly = mats["F_NylonStock"]
    m_cheek = mats["F_CheekElastomer"]
    m_rub = mats["F_ButtpadRubber"]
    m_steel = mats["F_SteelRecoilTube"]

    # 1. Cylindrical sliding collar enveloping the 14-deg notched recoil tube
    collar_outer = mk_cyl(
        "ts_col_out", 1.82, 1.82, 12.00, axis="x", segs=36,
        xform=[("t", 0.80, 0.0, 0.0), ("rz", STOCK_ANGLE), ("t", 0.80, 0.20, 0.0)],
        mat=m_poly, bevel=0.08,
    )

    # 2. TRUE CLOSED MONOLITHIC SKELETONIZED LOWER FRAME (fixes CSG floating lower strut completely!)
    #    Rear molded butt column (Z in [-1.36, +1.36]) + sleek skeletonized lower strut (Z in [-0.86, +0.86])
    #    welded seamlessly into both front sliding collar & rear butt column!
    rear_col_xy = [
        (-6.52, -7.85),
        (-4.72, -7.85),
        (-4.52,  2.72),
        (-6.52,  2.72),
    ]
    rear_col_raw = mk_extrude_z("ts_rcol", rear_col_xy, -1.36, 1.36, bevel=0.12, bevel_segs=3, mat=m_poly)
    sling_pts = _rounded_rect_pts(0.24, 0.90, 0.18, corner_segs=6)
    sling_cut = mk_extrude_z("c_ts_sling", sling_pts, -1.80, 1.80,
                             xform=[("t", -5.58, -5.85, 0.0)], mat=m_poly)
    rear_col = bool_subtract(rear_col_raw, [sling_cut])

    # Continuous closed diagonal strut & front collar neck (Z in [-0.86, +0.86])
    strut_outer_xy = [
        ( 5.55,  1.25),   # solidly anchored inside front sliding collar!
        ( 5.40, -0.58),   # sculpted front release-housing skirt
        ( 3.78, -1.62),   # smooth ergonomic curve into diagonal lower strut
        (-5.15, -7.75),   # solidly anchored into lower heel of rear butt column!
        (-5.15, -5.60),   # inner heel weld
        ( 2.85, -0.25),   # inner neck transition
        ( 3.65,  1.15),   # solidly anchored inside sliding collar
    ]
    strut_solid = mk_extrude_z("ts_strut", strut_outer_xy, -0.86, 0.86, bevel=0.12, bevel_segs=3, mat=m_poly)

    # Union sliding collar + rear butt column + closed skeleton strut, then bore clean central r=1.40 tube passage!
    frame_union = bool_union([collar_outer, rear_col, strut_solid], "ts_frame_union")
    tube_pass = mk_cyl(
        "c_ts_bore", 1.40, 1.40, 15.00, axis="x", segs=36,
        xform=[("t", 0.80, 0.0, 0.0), ("rz", STOCK_ANGLE), ("t", 0.80, 0.20, 0.0)],
        mat=m_poly,
    )
    stock_frame = bool_subtract(frame_union, [tube_pass])

    # 3. Sculpted Organic Arched Elastomer Cheekpiece Saddle (true Benelli M1014 domed comb contour!)
    #    Cross-section arched smoothly across Z in [-1.72, +1.72], extruded along STOCK_ANGLE over sliding collar!
    cheek_zy = [(-1.72, 1.38)]
    cheek_zy += _quad_bez((-1.72, 1.38), (-1.66, 3.05), (-0.82, 3.44), segs=7)
    cheek_zy += _quad_bez((-0.82, 3.44), ( 0.00, 3.60), ( 0.82, 3.44), segs=6)
    cheek_zy += _quad_bez(( 0.82, 3.44), ( 1.66, 3.05), ( 1.72, 1.38), segs=7)
    cheek_zy += [( 1.48, 0.92), (-1.48, 0.92)]
    cheek_raw = mk_extrude_x(
        "ts_cheek", cheek_zy, -5.65, 5.15, bevel=0.34, bevel_segs=4,
        xform=[("rz", STOCK_ANGLE), ("t", 0.55, 0.22, 0.0)], mat=m_cheek,
    )
    # Trim underside of cheekpiece cleanly against recoil-tube passage bore
    cheek_bore = mk_cyl(
        "c_ts_cbore", 1.41, 1.41, 15.00, axis="x", segs=32,
        xform=[("t", 0.80, 0.0, 0.0), ("rz", STOCK_ANGLE), ("t", 0.80, 0.20, 0.0)],
        mat=m_cheek,
    )
    cheek = bool_subtract(cheek_raw, [cheek_bore])

    # 4. Spring-loaded right-thumb cylindrical telescope release button + steel bezel ring (+Z flank)
    btn_bezel = mk_cyl("ts_bbez", 0.56, 0.56, 0.20, axis="z", segs=24,
                       xform=[("t", 4.60, 0.25, 1.62)], mat=m_poly, bevel=0.03)
    btn_knob = mk_knurled_cyl("ts_btn", 0.45, 0.48, axis="z", flutes=22, depth=0.018,
                              xform=[("t", 4.60, 0.25, 1.81)], mat=m_steel)

    # 5. Thick Contoured Vulcanized Black Rubber Recoil Buttpad w/ rounded heel/toe & 12 traction ribs!
    pad_xy = [
        (-6.34, -8.08), (-7.20, -8.08),
    ]
    pad_xy += _quad_bez((-7.20, -8.08), (-7.50, -7.85), (-7.50, -7.10), segs=6)
    pad_xy.append((-7.50, 1.85))
    pad_xy += _quad_bez((-7.50, 1.85), (-7.50, 2.74), (-7.08, 2.74), segs=6)
    pad_xy.append((-6.34, 2.74))
    pad_raw = mk_extrude_z("ts_pad_raw", pad_xy, -1.62, 1.62, bevel=0.22, bevel_segs=3, mat=m_rub)
    pad_cuts = []
    for ri in range(12):
        ry = -7.35 + ri * 0.84
        pad_cuts.append(mk_box(f"c_pad_g_{ri}", 0.18, 0.16, 3.32, [("t", -7.48, ry, 0.0)], mat=m_rub))
    # 2 recessed buttpad screw pockets centered strictly between traction grooves (zero tangent grazing!)
    for si, sy in enumerate((-5.25, 0.63)):
        pad_cuts.append(mk_cyl(f"c_pad_sc_{si}", 0.13, 0.13, 0.28, axis="x", segs=16,
                               xform=[("t", -7.44, sy, 0.0)], mat=m_rub))
    buttpad = bool_subtract(pad_raw, pad_cuts)

    obj = join_objects([stock_frame, cheek, btn_bezel, btn_knob, buttpad], "benellim4_telestock")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0, lock_flat_walls=True)


def build_benellim4_mag_follower(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """M-04: High-Visibility Safety-Orange Anodized Aluminum 6-Fluted Cup Follower.
    assembledPos: [19.6, -1.25, 0] | spans X in [-1.15, +1.15], Y in [-1.045, +1.045], Z in [-1.02, +1.02]."""
    m_org = mats["F_FollowerOrange"]

    cup = mk_lathe_x(
        "fl_cup",
        [
            (0.0, -1.12), (0.45, -1.02), (0.96, -1.15), (1.02, -1.06),
            (1.02, 0.72), (0.86, 0.82), (0.86, 1.15), (0.64, 1.15),
            (0.64, -0.68), (0.0, -0.68), (0.0, -1.12),
        ],
        segs=36, mat=m_org,
    )
    parts = [cup]
    for i in range(6):
        ang = i * math.pi / 3.0
        rib = mk_box(
            f"fl_rib_{i}", 1.56, 0.072, 0.072,
            [("rx", ang), ("t", -0.18, math.cos(ang) * 1.005, math.sin(ang) * 1.005)],
            mat=m_org, bevel=0.016,
        )
        parts.append(rib)

    obj = join_objects(parts, "benellim4_mag_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# UV Unwrapping & CONCAVE Packing for 3 Dedicated 2K Hero Atlases (Zero Bleed!)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    skip_face_fn=None,
    only_face_fn=None,
    min_span: float = 0.45,
):
    if not objs:
        return

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

    if not any_selected:
        return

    select_only(objs, objs[0])
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
        margin=0.005,
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
    print(f"  [UV-PACK] {len(objs):2d} objs -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] raw_span=({span_u:.3f}, {span_v:.3f})")
    assert span_u > min_span and span_v > min_span, f"UV packing collapsed! span=({span_u}, {span_v})"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]):
    """Unwraps 7 receiver/rail/sights/trigger parts into `benellim4_v3_receiver` (2048x2048):
      - Hero Band 1 (Receiver Left  Flank, -Z): u[0.015,0.985], v[0.765,0.985] (un-mirrored Urbino + M1014!)
      - Hero Band 2 (Receiver Right Flank, +Z): u[0.015,0.985], v[0.525,0.745] (BENELLI U.S.A. + UID plate!)
      - Hero Band 3 (Top M1913 Rail Crown):     u[0.015,0.985], v[0.440,0.505] (T2..T14 laser numbers!)
      - Firewalled Accent 1 (Crimson Safety):   u[0.012,0.140], v[0.012,0.195] (82 px moat around crimson!)
      - Firewalled Accent 2 (Tritium White):    u[0.012,0.140], v[0.235,0.415] (82 px moat around white dots!)
      - Main Packed Region (sights, trigger, rest): u[0.180,0.988], v[0.012,0.422]
    """
    def is_recv_hero_flank(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "benellim4_receiver" or mat_name != "R_AnodizedCharcoal":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        if -10.75 <= tx <= 10.15 and -1.86 <= ty <= 2.32:
            if (nz > 0.85 and tz > 1.62) or (nz < -0.85 and tz < -1.62):
                return True
        return False

    def is_rail_top_deck(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "benellim4_picatinny_rail" or mat_name != "R_RailSightsAnodized":
            return False
        c = face.calc_center_median()
        n = face.normal
        ty = c.z
        ny = n.z  # Blender +Z = Three.js +Y up
        return ny > 0.90 and ty > 3.24

    def is_crimson(obj_name: str, face, mat_name: str) -> bool:
        return mat_name == "R_SafetyCrimson"

    def is_tritium(obj_name: str, face, mat_name: str) -> bool:
        return mat_name == "R_TritiumWhite"

    def is_special(obj_name: str, face, mat_name: str) -> bool:
        return (
            is_recv_hero_flank(obj_name, face, mat_name)
            or is_rail_top_deck(obj_name, face, mat_name)
            or is_crimson(obj_name, face, mat_name)
            or is_tritium(obj_name, face, mat_name)
        )

    # 1) Pack main body faces strictly away from crimson/tritium firewalls (82 px moat!)
    _smart_unwrap_and_pack_rect(recv_objs, 0.180, 0.988, 0.012, 0.422, skip_face_fn=is_special)
    # 2) Pack strictly firewalled Crimson safety band & cartridge drop dot
    saf_objs = [o for o in recv_objs if o.name == "benellim4_safety_button"]
    _smart_unwrap_and_pack_rect(saf_objs, 0.012, 0.140, 0.012, 0.195, only_face_fn=is_crimson, min_span=0.35)
    # 3) Pack strictly firewalled Tritium white sight dots (front & rear sights)
    sight_objs = [o for o in recv_objs if o.name in {"benellim4_front_sight", "benellim4_rear_sight"}]
    _smart_unwrap_and_pack_rect(sight_objs, 0.012, 0.140, 0.235, 0.415, only_face_fn=is_tritium, min_span=0.35)

    # 4) Exact undistorted planar projection for Left & Right Receiver Flanks
    recv = next(o for o in recv_objs if o.name == "benellim4_receiver")
    bm = bmesh.new()
    bm.from_mesh(recv.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in recv.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_recv_hero_flank("benellim4_receiver", f, mname):
            continue
        is_right = (-f.normal.y) > 0.0
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx + 10.80) / 21.00))
            yn = max(0.0, min(1.0, (ty + 1.92) / 4.74))
            if is_right:
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.525 + yn * 0.220)
            else:
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.765 + yn * 0.220)
    bm.to_mesh(recv.data)
    bm.free()

    # 5) Exact undistorted top-down projection for M1913 Picatinny Rail Top Crown (T2..T14!)
    rail = next(o for o in recv_objs if o.name == "benellim4_picatinny_rail")
    bm = bmesh.new()
    bm.from_mesh(rail.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in rail.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_rail_top_deck("benellim4_picatinny_rail", f, mname):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, tz = vco.x, -vco.y
            xn = max(0.0, min(1.0, (tx + 5.20) / 14.60))
            zn = max(0.0, min(1.0, (tz + 1.06) / 2.12))
            # v = 0.505 is top of rail band (-Z left flank shoulder -> row 0 in PIL!), v = 0.440 is +Z right!
            loop[uv_layer].uv = (0.015 + xn * 0.970, 0.505 - zn * 0.065)
    bm.to_mesh(rail.data)
    bm.free()


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]):
    """Unwraps 12 metal parts into `benellim4_v3_metal` (2048x2048):
      - Hero Band (18.5" Barrel Left Upper Flank X[26..44]): u[0.015,0.985], v[0.895,0.985]
      - Exterior Pack (barrel, mag tube, mag cap, ARGO plugs, handle): u[0.012,0.988], v[0.460,0.880]
      - Internal Action & Chrome ARGO Pack (pistons, BCG, bolt, pins, hammer, elevator): u[0.012,0.988], v[0.012,0.445]
    """
    def is_barrel_hero(obj_name: str, face, mat_name: str) -> bool:
        if obj_name != "benellim4_barrel" or mat_name != "M_ParkerizedSteel":
            return False
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nz = -n.y
        return 26.0 <= tx <= 44.0 and -0.78 <= ty <= 0.78 and tz < -0.58 and nz < -0.62

    ext_grp = [o for o in metal_objs if o.name in {
        "benellim4_barrel", "benellim4_mag_tube", "benellim4_mag_cap",
        "benellim4_argo_plugs", "benellim4_charging_handle",
    }]
    int_grp = [o for o in metal_objs if o not in ext_grp]

    _smart_unwrap_and_pack_rect(ext_grp, 0.012, 0.988, 0.460, 0.880, skip_face_fn=is_barrel_hero)
    _smart_unwrap_and_pack_rect(int_grp, 0.012, 0.988, 0.012, 0.445)

    bbl = next(o for o in metal_objs if o.name == "benellim4_barrel")
    bm = bmesh.new()
    bm.from_mesh(bbl.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bbl.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if not is_barrel_hero("benellim4_barrel", f, mname):
            continue
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - 26.0) / 18.0))
            yn = max(0.0, min(1.0, (ty + 0.82) / 1.64))
            # Left flank (-Z): muzzle (+X, xn=1) -> LEFT (u=0.015), breech (xn=0) -> RIGHT (u=0.985)
            loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.895 + yn * 0.090)
    bm.to_mesh(bbl.data)
    bm.free()


def unwrap_furniture_atlas(furn_objs: list[bpy.types.Object]):
    """Unwraps 4 furniture & follower parts into `benellim4_v3_furniture` (2048x2048):
      - STRICT FIREWALLED BOX (Safety-Orange Mag Follower ONLY): u[0.012,0.215], v[0.012,0.245]
      - 92 px EMPTY MOAT separating follower from ALL polymer & steel (u[0.215..0.260], v[0.245..0.290])!
      - Steel Recoil Tube & Cap Band:                            u[0.260,0.988], v[0.012,0.245]
      - Matte Nylon Polymer Furniture Pack (forend, grip, stock): u[0.012,0.988], v[0.290,0.988]
    """
    follower_grp = [o for o in furn_objs if o.name == "benellim4_mag_follower"]
    non_fl_grp = [o for o in furn_objs if o.name != "benellim4_mag_follower"]

    def is_steel_tube_face(obj_name: str, face, mat_name: str) -> bool:
        return mat_name in {"F_SteelRecoilTube", "F_SteelCapStainless"}

    _smart_unwrap_and_pack_rect(follower_grp, 0.012, 0.215, 0.012, 0.245)
    _smart_unwrap_and_pack_rect(non_fl_grp,   0.260, 0.988, 0.012, 0.245, only_face_fn=is_steel_tube_face)
    _smart_unwrap_and_pack_rect(non_fl_grp,   0.012, 0.988, 0.290, 0.988, skip_face_fn=is_steel_tube_face)


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
    run_bake("albedo", "EMIT", samples=8, fill_color=(0.04, 0.045, 0.05, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=8, fill_color=(0.5, 0.5, 0.5, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=8, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.55
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.25) else "WARN"
        print(
            f"  [{status}] {o.name:28s} tris={tris:5d} non_man={non_man:2d} vol={vol:7.3f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        if non_man > 0 or vol <= 0:
            bad_parts.append((o.name, non_man, vol))
        if d_max > 0.25:
            print(f"       !! BBOX DELTA > 0.25cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
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


def _render_studio_previews(all_objs: list[bpy.types.Object]):
    """Renders 5 museum Cycles QA preview shots using final baked benellim4_v3_* WebP PBR suites."""
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.25
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3

    def mk_baked_mat(suite: str, nrm_str: float = 0.85) -> bpy.types.Material:
        mat = bpy.data.materials.new(f"Baked_{suite}")
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        t_alb = nt.nodes.new("ShaderNodeTexImage")
        t_alb.image = bpy.data.images.load(str(TEX_OUT_DIR / f"benellim4_v3_{suite}_albedo.webp"))
        t_alb.image.colorspace_settings.name = "sRGB"
        t_orm = nt.nodes.new("ShaderNodeTexImage")
        t_orm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"benellim4_v3_{suite}_roughness.webp"))
        t_orm.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])
        mix_ao = nt.nodes.new("ShaderNodeMix")
        mix_ao.data_type = "RGBA"
        mix_ao.blend_type = "MULTIPLY"
        mix_ao.inputs["Factor"].default_value = 0.85
        nt.links.new(t_alb.outputs["Color"], mix_ao.inputs[6])
        nt.links.new(sep.outputs["Red"], mix_ao.inputs[7])
        nt.links.new(mix_ao.outputs[2], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = bpy.data.images.load(str(TEX_OUT_DIR / f"benellim4_v3_{suite}_normal.webp"))
        t_nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = nrm_str
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        return mat

    m_r = mk_baked_mat("receiver", 0.85)
    m_m = mk_baked_mat("metal", 0.85)
    m_f = mk_baked_mat("furniture", 0.88)
    for o in all_objs:
        o.data.materials.clear()
        o.data.materials.append(m_r if o.name in RECEIVER_PARTS else (m_m if o.name in METAL_PARTS else m_f))
        px, py, pz = ASSEMBLED_POS[o.name]
        o.location = t2b(px, py, pz)
        o.rotation_euler = (0.0, 0.0, 0.0)
        o.hide_render = False

    w_nt = scene.world.node_tree
    w_nt.nodes.clear()
    w_out = w_nt.nodes.new("ShaderNodeOutputWorld")
    w_bg = w_nt.nodes.new("ShaderNodeBackground")
    hdri = REPO_ROOT / "public" / "hdri" / "studio_dark_armory.hdr"
    if hdri.exists():
        env = w_nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        w_nt.links.new(env.outputs["Color"], w_bg.inputs["Color"])
        w_bg.inputs["Strength"].default_value = 1.65
    w_nt.links.new(w_bg.outputs["Background"], w_out.inputs["Surface"])

    for lname, loc_t, energy, size in (
        ("KeyL", (22.0, 32.0, 58.0), 42000.0, 34.0),
        ("FillL", (-14.0, 14.0, -54.0), 26000.0, 34.0),
        ("RimL", (16.0, 44.0, -18.0), 30000.0, 22.0),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(lname, ld)
        scene.collection.objects.link(lo)
        lo.location = t2b(*loc_t)
        lo.rotation_euler = (t2b(10.0, 0.0, 0.0) - lo.location).to_track_quat("-Z", "Y").to_euler()

    cd = bpy.data.cameras.new("QACam")
    co = bpy.data.objects.new("QACam", cd)
    scene.collection.objects.link(co)
    scene.camera = co

    shots = [
        ("/tmp/benellim4_qa_right.png",       ( 24.0,  7.0,  86.0), (  9.0, -1.5, 0.0), 48.0, None),
        ("/tmp/benellim4_qa_left.png",        ( 22.0,  7.0, -86.0), (  9.0, -1.5, 0.0), 48.0, None),
        ("/tmp/benellim4_qa_macro_breech.png",(  5.5,  3.2,  26.0), (  3.0,  0.5, 0.0), 58.0, None),
        ("/tmp/benellim4_qa_macro_forend.png",( 25.0,  4.0,  26.0), ( 20.5, -0.5, 0.0), 55.0, None),
        ("/tmp/benellim4_qa_macro_argo.png",  ( 21.0,  4.0,  24.0), ( 17.5,  0.2, 0.0), 55.0, {"benellim4_forend"}),
    ]
    for fp, cpos, ctgt, lens, hide_set in shots:
        for o in all_objs:
            o.hide_render = bool(hide_set and o.name in hide_set)
        cd.lens = lens
        co.location = t2b(*cpos)
        co.rotation_euler = (t2b(*ctgt) - co.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = fp
        bpy.ops.render.render(write_still=True)
        print(f"  [QA-RENDER] Saved {fp}")


def main():
    t_start = time.time()
    reset_scene()
    mats = create_material_library()

    builders = {
        # Atlas 1: Receiver, M1913 Rail, Ghost-Ring Sights & Trigger Pack (7 parts)
        "benellim4_receiver":        build_benellim4_receiver,
        "benellim4_picatinny_rail":  build_benellim4_picatinny_rail,
        "benellim4_front_sight":     build_benellim4_front_sight,
        "benellim4_rear_sight":      build_benellim4_rear_sight,
        "benellim4_trigger_housing": build_benellim4_trigger_housing,
        "benellim4_trigger":         build_benellim4_trigger,
        "benellim4_safety_button":   build_benellim4_safety_button,
        # Atlas 2: 18.5" Barrel, ARGO Pistons/Plugs, Rotating Bolt, Hammer, Mag Tube & Elevator (12 parts)
        "benellim4_barrel":          build_benellim4_barrel,
        "benellim4_argo_pistons":    build_benellim4_argo_pistons,
        "benellim4_argo_plugs":      build_benellim4_argo_plugs,
        "benellim4_bolt_carrier":    build_benellim4_bolt_carrier,
        "benellim4_bolt_head":       build_benellim4_bolt_head,
        "benellim4_cam_pin":         build_benellim4_cam_pin,
        "benellim4_firing_pin":      build_benellim4_firing_pin,
        "benellim4_charging_handle": build_benellim4_charging_handle,
        "benellim4_hammer":          build_benellim4_hammer,
        "benellim4_mag_tube":        build_benellim4_mag_tube,
        "benellim4_mag_cap":         build_benellim4_mag_cap,
        "benellim4_shell_elevator":  build_benellim4_shell_elevator,
        # Atlas 3: Tactical Forend, 3-Position Recoil Tube/Grip, M1014 Telestock & Orange Follower (4 parts)
        "benellim4_forend":          build_benellim4_forend,
        "benellim4_recoil_tube":     build_benellim4_recoil_tube,
        "benellim4_telestock":       build_benellim4_telestock,
        "benellim4_mag_follower":    build_benellim4_mag_follower,
    }

    print("[BUILD] Sculpting all 23 solid Benelli M4 / USMC M1014 hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    recv_objs = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs = [built[pid] for pid in METAL_PARTS]
    furn_objs = [built[pid] for pid in FURNITURE_PARTS]
    all_objs = recv_objs + metal_objs + furn_objs

    print("[VERIFY] Checking manifoldness, outward normals & CAD alignment...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K hero atlases: receiver (7), metal (12), furniture (4)...")
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)
    unwrap_furniture_atlas(furn_objs)

    for label, group in (("receiver", recv_objs), ("metal", metal_objs), ("furniture", furn_objs)):
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
            assert 0.00003 < oa < 0.75, f"Abnormal UV area on {o.name}: {oa:.5f}"
        print(f"  [UV-AUDIT] {label:10s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.20 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    print("[TRI] Pre-bake triangulation with preserved custom normals (1:1 tangent-frame lock)...")
    triangulate_all_keep_normals(all_objs)

    with tempfile.TemporaryDirectory(prefix="benellim4_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking benellim4_v3_receiver (2048x2048, 7 hero receiver/rail/sights/FCG parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking benellim4_v3_metal (2048x2048, 12 barrel/ARGO/bolt/mag/elevator parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir)
        print("[CYCLES] Baking benellim4_v3_furniture (2048x2048, 4 forend/grip-tube/telestock/follower parts)...")
        bake_atlas_suite("furn", furn_objs, all_objs, tmp_dir)

        print("[POST] Compositing Benelli Urbino / USMC M1014 rollmarks, PSF proofs, T2-T14 & 5-Ch ORM WebPs...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    if "--preview" in sys.argv:
        print("\n[QA] Rendering 5 museum studio Cycles QA preview plates to /tmp/benellim4_qa_*.png...")
        _render_studio_previews(all_objs)

    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "benellim4_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "benellim4_v3_receiver_normal.webp",
        TEX_OUT_DIR / "benellim4_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "benellim4_v3_metal_albedo.webp",
        TEX_OUT_DIR / "benellim4_v3_metal_normal.webp",
        TEX_OUT_DIR / "benellim4_v3_metal_roughness.webp",
        TEX_OUT_DIR / "benellim4_v3_furniture_albedo.webp",
        TEX_OUT_DIR / "benellim4_v3_furniture_normal.webp",
        TEX_OUT_DIR / "benellim4_v3_furniture_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== BENELLI M4 / USMC M1014 V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:42s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"


if __name__ == "__main__":
    main()
