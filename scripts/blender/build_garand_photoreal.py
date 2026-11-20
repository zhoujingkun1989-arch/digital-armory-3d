#!/usr/bin/env python3
"""
AAA Hard-Surface Blender 5.2 + Cycles Baker for WWII U.S. Rifle, Cal. .30, M1 (Springfield Armory Garand)
=========================================================================================================
MIT License — Digital Armory 3D (`PR-04`, Wave 2)

"The Greatest Battle Implement Ever Devised" — 1944 Springfield Armory M1 Garand (.30-06 Springfield):
  - Full-length organically lofted Hand-Rubbed Linseed-Oil American Black Walnut stock & contoured
    front/rear handguards w/ ergonomic pistol-grip wrist, cheek comb, subtle forend finger flutes,
    stamped Springfield `SA / NFR` cartouche, Crossed-Cannons Ordnance Wheel & circled `[P]` proof
  - WWII Zinc/Manganese Parkerized forged milled open-top receiver w/ rounded rear sight bridge,
    protective sight ears, 5-line Springfield Armory heel rollmark (`2847192`), drawing code
    `D 28291 32`, bright-worn op-rod raceway & sculpted beveled left-flank clip-latch thumb button
  - T105 micrometric aperture peep rear sight w/ true 3D knurled elevation (200-1200 yd) & windage drums
  - 24" stepped .30-06 barrel w/ 11-deg recessed target crown, 4-groove 1:10" helical rifling, 3 muzzle
    splines, blackened 410 stainless muzzle gas cylinder w/ M1 bayonet lug & stacking swivel, figure-8
    lock & slotted cross-valve grenade lock screw, and curved flared winged front sight
  - Iconic 3D S-bent long-stroke operating rod w/ centerless-ground bright 410 stainless labyrinth
    piston, arched 32-deg helical cam hump & swept ergonomic charging handle
  - Rotating 2-lug bolt, tang-blocked long firing pin, quick-detach milled trigger housing w/ winter
    front-of-trigger safety, swept curved steel trigger guard w/ takedown hook, blued spring-steel
    8-round en-bloc clip ("PING!"), follower arm/rod, twin-ramp bullet guide & checkered steel buttplate
    w/ hinged M10 cleaning-kit trapdoor

Generates (strict ownership):
  - public/models/garand.glb (Draco-compressed glTF 2.0, all 24 solid parts; skips ONLY the 2
    dynamically compressing GPU `aSpringParam` springs: `garand_op_rod_spring`, `garand_hammer_spring`)
  - public/textures/garand_v3_walnut_{albedo,normal,roughness}.webp   (2048x2048 Packed ORM)
  - public/textures/garand_v3_receiver_{albedo,normal,roughness}.webp (2048x2048 Packed ORM)
  - public/textures/garand_v3_metal_{albedo,normal,roughness}.webp    (2048x2048 Packed ORM)

Coordinate & Transform Contract (locked with `glbAssetService.ts` & `PartActor.tsx`):
  - Three.js / glTF space (1 world unit = 1 cm = 10 mm): +X muzzle, +Y up, +Z right flank.
  - Blender Z-up space: (bx, by, bz) = (tx, -tz, ty), det(T2B_MAT) = +1.
  - Option A: Cycles contact AO is baked with stationary exterior parts at assembledPos,
    then all 24 objects are reset to identity transform (0,0,0) before Draco glTF export.
  - UV convention: Standard Blender UV (v=0 bottom, v=1 top) baked to upright WebP
    (row 0 = top); `glbAssetService.ts` flips `v = 1 - v_gltf` so `TextureLoader(flipY=true)`
    samples 100% upright with OpenGL (+X, +Y, +Z) tangent-space normal maps.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
      --python scripts/blender/build_garand_photoreal.py
  (Pass `-- --preview` to also render Cycles studio QA plates to `/tmp/garand_qa_*.png`.)
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
# MODE 2: System Python Post-Process (Springfield Heel Rollmarks, SA/NFR &
#         Crossed-Cannons Walnut Cartouches, T105 Range Dials, En-Bloc SA Stamp,
#         Buttplate Diamond Checkering, RNM Tangent Normal Blend & Packed ORM)
# Executed automatically via subprocess from Blender mode.
# =============================================================================
if "--postprocess" in sys.argv:
    idx = sys.argv.index("--postprocess")
    tmp_dir = Path(sys.argv[idx + 1])
    out_dir = Path(sys.argv[idx + 2])
    out_dir.mkdir(parents=True, exist_ok=True)

    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    from scipy import ndimage

    FONT_SERIF_BOLD = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
    FONT_GEORGIA_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
    FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
    FONT_FALLBACKS = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    )

    def _load_font(path: str, size: int):
        for cand in (path, FONT_DIN, FONT_SERIF_BOLD, *FONT_FALLBACKS):
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
        ny = dy * strength  # row increases downward -> +dy = -dH/dv (OpenGL +Y up!)
        nz = np.ones_like(height, dtype=np.float32)
        n = np.stack((nx, ny, nz), axis=-1)
        n /= np.sqrt(np.sum(n * n, axis=-1, keepdims=True) + 1e-8)
        return np.clip(n * 0.5 + 0.5, 0.0, 1.0).astype(np.float32)

    def _bevel_mask(mask: np.ndarray, width_px: float = 2.0) -> np.ndarray:
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

    def _draw_spaced_text(
        draw: ImageDraw.ImageDraw,
        cx: float,
        cy: float,
        text: str,
        font,
        fill: int = 255,
        tracking: float = 0.0,
    ) -> None:
        if abs(tracking) < 0.1:
            draw.text((cx, cy), text, fill=fill, font=font, anchor="mm")
            return
        widths = [draw.textlength(ch, font=font) for ch in text]
        total_w = sum(widths) + tracking * max(0, len(text) - 1)
        x = cx - total_w * 0.5
        for ch, cw in zip(text, widths):
            draw.text((x + cw * 0.5, cy), ch, fill=fill, font=font, anchor="mm")
            x += cw + tracking

    def _draw_ordnance_crossed_cannons(
        draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float
    ) -> None:
        """WWII U.S. Ordnance Department Crossed Cannons inside Buckled Belt Wheel cartouche."""
        # Outer buckled ordnance belt ring (double ring)
        w_out = max(3, int(round(r * 0.10)))
        w_in = max(2, int(round(r * 0.06)))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=w_out)
        ri = r * 0.78
        draw.ellipse((cx - ri, cy - ri, cx + ri, cy + ri), outline=245, width=w_in)
        # Belt buckle at bottom (6 o'clock)
        bw, bh = r * 0.24, r * 0.22
        draw.rectangle(
            (cx - bw, cy + ri - bh * 0.3, cx + bw, cy + r + bh * 0.35),
            outline=255,
            width=max(2, int(round(r * 0.07))),
        )
        # Two crossed tapered 19th-century cannon barrels at +-38 deg
        for sign in (-1.0, 1.0):
            ang = math.radians(38.0 * sign)
            ca, sa = math.cos(ang), math.sin(ang)
            nx, ny = -sa, ca
            # Muzzle end (top, narrower) to breech cascabel (bottom, wider)
            l_top, l_bot = r * 0.64, r * 0.62
            w_muz, w_brc = r * 0.09, r * 0.155
            poly = [
                (cx - ca * l_top - nx * w_muz, cy - sa * l_top - ny * w_muz),
                (cx - ca * l_top + nx * w_muz, cy - sa * l_top + ny * w_muz),
                (cx + ca * l_bot + nx * w_brc, cy + sa * l_bot + ny * w_brc),
                (cx + ca * l_bot - nx * w_brc, cy + sa * l_bot - ny * w_brc),
            ]
            draw.polygon(poly, fill=255)
            # Breech cascabel knob
            kx, ky = cx + ca * (l_bot + r * 0.09), cy + sa * (l_bot + r * 0.09)
            kr = r * 0.09
            draw.ellipse((kx - kr, ky - kr, kx + kr, ky + kr), fill=255)
        # Flaming bomb emblem at 12 o'clock center
        bx, by, br = cx, cy - r * 0.36, r * 0.16
        draw.ellipse((bx - br, by - br, bx + br, by + br), fill=255)
        # Small flame prongs above bomb
        draw.polygon(
            [
                (bx - br * 0.7, by - br * 0.8),
                (bx, by - br * 2.15),
                (bx + br * 0.7, by - br * 0.8),
            ],
            fill=255,
        )

    def _draw_sa_nfr_cartouche(
        draw: ImageDraw.ImageDraw, cx: float, cy: float, w_box: float, h_box: float
    ) -> None:
        """Crisp WWII Springfield Armory `SA / NFR` boxed inspector cartouche."""
        x0, y0 = cx - w_box * 0.5, cy - h_box * 0.5
        x1, y1 = cx + w_box * 0.5, cy + h_box * 0.5
        stroke = max(3, int(round(h_box * 0.065)))
        draw.rectangle((x0, y0, x1, y1), outline=255, width=stroke)
        f_top = _load_font(FONT_SERIF_BOLD, int(round(h_box * 0.42)))
        f_bot = _load_font(FONT_SERIF_BOLD, int(round(h_box * 0.38)))
        _draw_spaced_text(draw, cx, cy - h_box * 0.20, "S.A.", f_top, fill=255, tracking=w_box * 0.03)
        _draw_spaced_text(draw, cx, cy + h_box * 0.22, "NFR", f_bot, fill=255, tracking=w_box * 0.04)

    def _draw_circled_p_proof(
        draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float
    ) -> None:
        """Springfield Armory circled `[P]` high-pressure proof stamp on pistol grip wrist."""
        stroke = max(3, int(round(r * 0.14)))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=stroke)
        f_p = _load_font(FONT_SERIF_BOLD, int(round(r * 1.48)))
        draw.text((cx + r * 0.04, cy - r * 0.04), "P", font=f_p, fill=255, anchor="mm")

    # -------------------------------------------------------------------------
    # ATLAS 1: garand_v3_walnut (American Black Walnut + SA/NFR + Crossed Cannons + [P])
    # -------------------------------------------------------------------------
    def process_walnut_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "walnut_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "walnut_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "walnut_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "walnut_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "walnut_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "walnut_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "walnut_ext_mask.npy")[..., 0]

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

        # Subtle hand-burnished linseed-oil grip sheen along wrist & forend (left & right hero bands)
        # Hero Band 1 (Left buttstock+cheek, X in [-46.6, -5.0]): u in [0.015, 0.985] (1-xNorm), v in [0.680, 0.985]
        # Hero Band 2 (Right buttstock+cheek, X in [-46.6, -5.0]): u in [0.015, 0.985] (xNorm), v in [0.365, 0.665]
        BW, BH = 2400, 740

        def x_to_left_px(xw: float) -> float:
            xn = max(0.0, min(1.0, (xw - (-46.60)) / (5.0 - (-46.60))))  # X in [-46.6, +5.0]
            return (1.0 - xn) * BW

        def x_to_right_px(xw: float) -> float:
            xn = max(0.0, min(1.0, (xw - (-46.60)) / (5.0 - (-46.60))))
            return xn * BW

        def y_to_px(yw: float) -> float:
            yn = max(0.0, min(1.0, (yw - (-11.80)) / (0.95 - (-11.80))))
            return (1.0 - yn) * BH

        stamp_l_img = Image.new("L", (BW, BH), 0)
        dl = ImageDraw.Draw(stamp_l_img)
        # Left receiver-wrist flat (world X ~ -10.4 to -14.2, Y ~ -2.0 to -3.6):
        # Authentic historical scale WWII Springfield Armory `S.A. / NFR` cartouche + Crossed-Cannons Ordnance Wheel!
        sa_cx = x_to_left_px(-10.8)
        sa_cy = y_to_px(-2.15)
        _draw_sa_nfr_cartouche(dl, sa_cx, sa_cy, w_box=108.0, h_box=82.0)

        cc_cx = x_to_left_px(-14.0)
        cc_cy = y_to_px(-2.40)
        _draw_ordnance_crossed_cannons(dl, cc_cx, cc_cy, r=54.0)

        # Circled `[P]` high-pressure proof stamp on right pistol-grip wrist!
        stamp_r_img = Image.new("L", (BW, BH), 0)
        dr = ImageDraw.Draw(stamp_r_img)
        pr_cx = x_to_right_px(-13.3)
        pr_cy = y_to_px(-5.10)
        _draw_circled_p_proof(dr, pr_cx, pr_cy, r=36.0)

        cartouche = np.zeros((h, w), dtype=np.float32)
        _paste_uv_band(cartouche, stamp_l_img, 0.015, 0.985, 0.680, 0.985)
        _paste_uv_band(cartouche, stamp_r_img, 0.015, 0.985, 0.365, 0.665)

        # Crisp pressed-into-walnut die stamp look: darkened compressed wood fibers + sharp indented normal!
        stamp_bev = _bevel_mask(cartouche, width_px=2.2)
        stamp_w = np.clip(cartouche * 0.92, 0.0, 1.0)
        albedo *= 1.0 - 0.56 * stamp_w[..., None]
        # Tiny warm compressed-wood rim sheen right around the die edge
        stamp_rim = np.clip(
            ndimage.gaussian_filter(cartouche, sigma=1.6) - cartouche * 0.85, 0.0, 1.0
        )
        albedo[..., 0] = np.clip(albedo[..., 0] + 0.032 * stamp_rim, 0.0, 1.0)
        albedo[..., 1] = np.clip(albedo[..., 1] + 0.018 * stamp_rim, 0.0, 1.0)
        _mix(rgh, 0.72, stamp_w * 0.85)
        ao *= 1.0 - 0.36 * stamp_w

        # Hand-burnished linseed-oil sheen on ergonomic pistol-grip wrist (X in [-19, -9])
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        left_band = (v_grid >= 0.680) & (v_grid <= 0.985) & (u_grid >= 0.015) & (u_grid <= 0.985)
        right_band = (v_grid >= 0.365) & (v_grid <= 0.665) & (u_grid >= 0.015) & (u_grid <= 0.985)
        wrist_l = left_band.astype(np.float32) * np.exp(-((u_grid - 0.33) / 0.14) ** 2)
        wrist_r = right_band.astype(np.float32) * np.exp(-((u_grid - 0.67) / 0.14) ** 2)
        burnish = np.clip(wrist_l + wrist_r, 0.0, 1.0)
        rgh = np.clip(rgh - 0.08 * burnish, 0.28, 0.92)

        decal_h = -0.68 * stamp_bev
        decal_nrm = _height_to_normal_01(decal_h, strength=4.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.24, 0.92)
        met = np.clip(met, 0.00, 0.95)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_walnut_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_walnut_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_walnut_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved garand_v3_walnut_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # ATLAS 2: garand_v3_receiver (Heel Rollmark, D28291 Code, T105 Dials, En-Bloc SA & Brass Rub)
    # -------------------------------------------------------------------------
    def process_receiver_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "recv_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "recv_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "recv_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "recv_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "recv_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "recv_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "recv_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.54 + ao_ext * 0.46)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        # Elevated AgX anti-black-crush AO floor for WWII zinc/manganese parkerized steel!
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        engraving = np.zeros((h, w), dtype=np.float32)
        white_fill = np.zeros((h, w), dtype=np.float32)
        brass_rub = np.zeros((h, w), dtype=np.float32)

        # --- 1) HERO RECEIVER HEEL STAMPING (`u in [0.020, 0.440], v in [0.680, 0.985]`) ---
        # Mapped strictly to the EXPOSED sloped heel deck behind the rear sight (X in [-8.60, -7.32]):
        # Oriented upright when looking down from +Y with muzzle (+X) at top (v=0.985) and butt (-X) at bottom!
        HW, HH = 920, 760
        heel_img = Image.new("L", (HW, HH), 0)
        dh = ImageDraw.Draw(heel_img)
        f_us = _load_font(FONT_DIN, 74)
        f_cal = _load_font(FONT_DIN, 68)
        f_sa = _load_font(FONT_DIN, 66)
        f_ser = _load_font(FONT_DIN, 78)
        cx_h = HW * 0.5
        _draw_spaced_text(dh, cx_h, 182, "U.S. RIFLE", f_us, fill=255, tracking=7.0)
        _draw_spaced_text(dh, cx_h, 286, "CAL. .30 M1", f_cal, fill=255, tracking=5.0)
        _draw_spaced_text(dh, cx_h, 394, "SPRINGFIELD", f_sa, fill=255, tracking=5.0)
        _draw_spaced_text(dh, cx_h, 496, "ARMORY", f_sa, fill=255, tracking=12.0)
        _draw_spaced_text(dh, cx_h, 622, "2847192", f_ser, fill=255, tracking=10.0)
        _paste_uv_band(engraving, heel_img, 0.020, 0.440, 0.680, 0.985)

        # --- 2) HERO RECEIVER RIGHT FLANK DRAWING NUMBER (`u in [0.460, 0.985], v in [0.680, 0.825]`) ---
        # Spans receiver X in [-8.60, +5.85], Y in [-2.28, +2.48]; Left flank occupies [0.840, 0.985] cleanly!
        RW, RH = 1150, 420
        rflk_img = Image.new("L", (RW, RH), 0)
        drf = ImageDraw.Draw(rflk_img)
        f_draw = _load_font(FONT_COND, 46)
        # Placed cleanly on the forged right lower receiver leg (X ~ -2.8..+2.0, Y ~ -1.15)
        _draw_spaced_text(drf, RW * 0.54, RH * 0.72, "D 28291 32", f_draw, fill=240, tracking=4.0)
        _paste_uv_band(engraving, rflk_img, 0.460, 0.985, 0.680, 0.825)

        # --- 3) HERO T105 ELEVATION & WINDAGE DRUM FACE MARKINGS ---
        # Left Elevation Drum cap:  u in [0.020, 0.230], v in [0.495, 0.665]
        # Right Windage Drum cap:   u in [0.250, 0.460], v in [0.495, 0.665]
        DS = 512
        dc = DS // 2
        elev_eng = Image.new("L", (DS, DS), 0)
        elev_wht = Image.new("L", (DS, DS), 0)
        de_e = ImageDraw.Draw(elev_eng)
        dw_e = ImageDraw.Draw(elev_wht)
        de_e.ellipse((24, 24, DS - 24, DS - 24), outline=210, width=7)
        de_e.ellipse((142, 142, DS - 142, DS - 142), outline=220, width=6)
        f_num = _load_font(FONT_DIN, 48)
        range_labels = ["2", "4", "6", "8", "10", "12"]
        for k in range(24):
            ang = -math.pi * 0.5 + 2.0 * math.pi * k / 24.0
            ca, sa = math.cos(ang), math.sin(ang)
            r_in = 198 if (k % 4 == 0) else 210
            r_out = 232
            w_t = 7 if (k % 4 == 0) else 4
            de_e.line([(dc + ca * r_in, dc + sa * r_in), (dc + ca * r_out, dc + sa * r_out)], fill=240, width=w_t)
            dw_e.line([(dc + ca * r_in, dc + sa * r_in), (dc + ca * r_out, dc + sa * r_out)], fill=220, width=w_t)
            if k % 4 == 0:
                lbl = range_labels[k // 4]
                tx, ty = dc + ca * 168, dc + sa * 168
                de_e.text((tx, ty), lbl, font=f_num, fill=255, anchor="mm")
                dw_e.text((tx, ty), lbl, font=f_num, fill=255, anchor="mm")
        _paste_uv_band(engraving, elev_eng, 0.020, 0.230, 0.495, 0.665)
        _paste_uv_band(white_fill, elev_wht, 0.020, 0.230, 0.495, 0.665)

        wind_eng = Image.new("L", (DS, DS), 0)
        wind_wht = Image.new("L", (DS, DS), 0)
        de_w = ImageDraw.Draw(wind_eng)
        dw_w = ImageDraw.Draw(wind_wht)
        de_w.ellipse((24, 24, DS - 24, DS - 24), outline=210, width=7)
        de_w.ellipse((142, 142, DS - 142, DS - 142), outline=220, width=6)
        f_lr = _load_font(FONT_DIN, 54)
        for k in range(16):
            ang = 2.0 * math.pi * k / 16.0
            ca, sa = math.cos(ang), math.sin(ang)
            de_w.line([(dc + ca * 204, dc + sa * 204), (dc + ca * 232, dc + sa * 232)], fill=235, width=5)
            dw_w.line([(dc + ca * 204, dc + sa * 204), (dc + ca * 232, dc + sa * 232)], fill=200, width=5)
        for lbl, px, py in (("L", dc - 165, dc), ("R", dc + 165, dc)):
            de_w.text((px, py), lbl, font=f_lr, fill=255, anchor="mm")
            dw_w.text((px, py), lbl, font=f_lr, fill=255, anchor="mm")
        # Curved directional arrows top & bottom
        de_w.arc((90, 90, DS - 90, DS - 90), 215, 325, fill=240, width=6)
        dw_w.arc((90, 90, DS - 90, DS - 90), 215, 325, fill=220, width=6)
        de_w.arc((90, 90, DS - 90, DS - 90), 35, 145, fill=240, width=6)
        dw_w.arc((90, 90, DS - 90, DS - 90), 35, 145, fill=220, width=6)
        _paste_uv_band(engraving, wind_eng, 0.250, 0.460, 0.495, 0.665)
        _paste_uv_band(white_fill, wind_wht, 0.250, 0.460, 0.495, 0.665)

        # --- 4) HERO EN-BLOC CLIP BACK SPINE `SA` STAMP & SUBTLE BRASS RUB (`u in [0.500, 0.985], v in [0.495, 0.665]`) ---
        CW, CH = 960, 360
        clip_eng = Image.new("L", (CW, CH), 0)
        clip_brs = Image.new("L", (CW, CH), 0)
        dc_e = ImageDraw.Draw(clip_eng)
        dc_b = ImageDraw.Draw(clip_brs)
        f_clip = _load_font(FONT_DIN, 86)
        # Back spine sits at right portion of clip hero band (u in [0.84, 0.98]) -> cx ~ 0.84*CW
        _draw_spaced_text(dc_e, CW * 0.85, CH * 0.50, "SA", f_clip, fill=255, tracking=6.0)
        # Subtle longitudinal .30-06 brass cartridge case rub streaks along clip flank zones (u in [0.50, 0.82])
        for row_y in (75, 130, 185, 240, 290):
            dc_b.line([(40, row_y), (660, row_y)], fill=145, width=10)
        clip_brs = clip_brs.filter(ImageFilter.GaussianBlur(radius=4.5))
        _paste_uv_band(engraving, clip_eng, 0.500, 0.985, 0.495, 0.665)
        _paste_uv_band(brass_rub, clip_brs, 0.500, 0.985, 0.495, 0.665)

        # Apply crisp recessed steel rollmarks (silver-white dry-brushed inside groove for museum legibility!)
        eng_bev = _bevel_mask(engraving, width_px=2.0)
        eng_m = np.clip(engraving * 0.92, 0.0, 1.0)
        # Deep stamped groove with subtle oxidized silver-chalk contrast so heel rollmark pops in studio shots!
        _mix(albedo, (0.56, 0.59, 0.58), eng_m * 0.72)
        _mix(rgh, 0.54, eng_m * 0.75)
        ao *= 1.0 - 0.30 * eng_m

        # Crisp ivory-white lacquer infill on T105 elevation & windage range numerals
        wht_m = np.clip(white_fill * 0.95, 0.0, 1.0)
        _mix(albedo, (0.88, 0.87, 0.82), wht_m * 0.88)
        _mix(rgh, 0.46, wht_m * 0.85)
        _mix(met, 0.08, wht_m * 0.88)

        # Subtle warm golden .30-06 brass rub along en-bloc clip walls
        brs_m = np.clip(brass_rub * 0.45, 0.0, 1.0)
        _mix(albedo, (0.64, 0.52, 0.24), brs_m * 0.42)
        _mix(rgh, 0.26, brs_m * 0.40)

        decal_h = -0.62 * eng_bev
        decal_nrm = _height_to_normal_01(decal_h, strength=4.2)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.14, 0.88)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_receiver_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_receiver_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_receiver_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved garand_v3_receiver_{albedo,normal,roughness}.webp (2048x2048)")

    # -------------------------------------------------------------------------
    # ATLAS 3: garand_v3_metal (Barrel, Gas Cylinder, Op-Rod, Bolt, Buttplate Checkering & Internals)
    # -------------------------------------------------------------------------
    def process_metal_atlas() -> None:
        alb_lin = _read_f32_rgb(tmp_dir / "metal_albedo.npy")
        rgh = _read_f32_rgb(tmp_dir / "metal_roughness.npy")[..., 0]
        met = _read_f32_rgb(tmp_dir / "metal_metalness.npy")[..., 0]
        nrm = _read_f32_rgb(tmp_dir / "metal_normal.npy")
        ao_self = _read_f32_rgb(tmp_dir / "metal_ao_self.npy")[..., 0]
        ao_ext = _read_f32_rgb(tmp_dir / "metal_ao_ext.npy")[..., 0]
        ext_mask = _read_f32_rgb(tmp_dir / "metal_ext_mask.npy")[..., 0]

        h, w = rgh.shape
        albedo = _linear_to_srgb(alb_lin)

        ext_w = _smoothstep(0.30, 0.70, ext_mask)
        ao_contact = np.minimum(ao_self, ao_self * 0.56 + ao_ext * 0.44)
        ao = ao_self * (1.0 - ext_w) + ao_contact * ext_w
        ao = np.clip(0.38 + 0.62 * np.power(np.clip(ao, 0.0, 1.0), 0.78), 0.36, 1.0).astype(np.float32)

        nz_lin = nrm[..., 2] * 2.0 - 1.0
        bad_n = nz_lin < 0.25
        if np.any(bad_n):
            nrm = nrm.copy()
            nrm[bad_n] = (0.5, 0.5, 1.0)

        # Crisp WWII steel buttplate diamond anti-slip checkering on Hero Buttplate Rear Face
        # (`u in [0.805, 0.985], v in [0.515, 0.985]`)
        u_grid = (np.arange(w, dtype=np.float32)[None, :] + 0.5) / w
        v_grid = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
        bp_u = (u_grid - 0.805) / (0.985 - 0.805)
        bp_v = (v_grid - 0.515) / (0.985 - 0.515)
        in_bp = (bp_u >= 0.04) & (bp_u <= 0.96) & (bp_v >= 0.04) & (bp_v <= 0.96)
        # Keep trapdoor circular region (centered at bp_u=0.5, bp_v=0.62) & top/bottom screw zones smooth!
        dist_trap = np.hypot((bp_u - 0.50) * 1.0, (bp_v - 0.62) * 2.8)
        dist_top_s = np.hypot((bp_u - 0.50) * 1.0, (bp_v - 0.88) * 2.8)
        dist_bot_s = np.hypot((bp_u - 0.50) * 1.0, (bp_v - 0.11) * 2.8)
        chk_mask = (
            in_bp
            & (dist_trap > 0.34)
            & (dist_top_s > 0.16)
            & (dist_bot_s > 0.16)
        ).astype(np.float32)
        chk_mask = ndimage.gaussian_filter(chk_mask, sigma=1.2)

        # Fine crisp 16-LPI diamond steel checkering pyramids
        ang1 = (bp_u * 26.0 + bp_v * 68.0) * math.pi * 2.0
        ang2 = (bp_u * 26.0 - bp_v * 68.0) * math.pi * 2.0
        tri1 = 1.0 - np.abs(((ang1 / (2.0 * math.pi)) % 1.0) * 2.0 - 1.0)
        tri2 = 1.0 - np.abs(((ang2 / (2.0 * math.pi)) % 1.0) * 2.0 - 1.0)
        diam = np.minimum(tri1, tri2).astype(np.float32)

        valley = (1.0 - diam) * chk_mask
        crest = np.power(diam, 2.2) * chk_mask
        albedo *= 1.0 - 0.34 * valley[..., None]
        albedo = np.clip(albedo + 0.08 * crest[..., None], 0.0, 1.0)
        _mix(rgh, 0.56, valley * 0.85)
        _mix(rgh, 0.24, crest * 0.85)
        ao *= 1.0 - 0.38 * valley

        decal_h = 0.72 * (diam - 0.5) * chk_mask
        decal_nrm = _height_to_normal_01(decal_h, strength=4.5)
        nrm_final = _rnm_blend(nrm, decal_nrm)

        rgh = np.clip(rgh, 0.13, 0.88)
        met = np.clip(met, 0.00, 0.98)
        orm = np.stack((ao, rgh, met), axis=-1)

        Image.fromarray(np.clip(albedo * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_metal_albedo.webp", "WEBP", quality=93, method=6
        )
        Image.fromarray(np.clip(nrm_final * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_metal_normal.webp", "WEBP", quality=96, method=6
        )
        Image.fromarray(np.clip(orm * 255.0 + 0.5, 0, 255).astype(np.uint8)).save(
            out_dir / "garand_v3_metal_roughness.webp", "WEBP", quality=94, method=6
        )
        print("[POST] Saved garand_v3_metal_{albedo,normal,roughness}.webp (2048x2048)")

    process_walnut_atlas()
    process_receiver_atlas()
    process_metal_atlas()
    sys.exit(0)


# =============================================================================
# MODE 1: Blender 5.2 Hard-Surface Modeling + Cycles GPU Baking + Draco GLB Export
# =============================================================================
import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_OUT = REPO_ROOT / "public" / "models" / "garand.glb"
TEX_OUT_DIR = REPO_ROOT / "public" / "textures"
MODELS_OUT.parent.mkdir(parents=True, exist_ok=True)
TEX_OUT_DIR.mkdir(parents=True, exist_ok=True)

ATLAS_SIZE = 2048
BAKE_AO_SAMPLES = 48
BAKE_NORMAL_SAMPLES = 24

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


# Exact 24 solid U.S. Rifle M1 Garand parts split cleanly across 3 dedicated 2048x2048 PBR suites
# (Strictly skipping ONLY the 2 dynamically compressing GPU `aSpringParam` springs:
#   - `garand_op_rod_spring` (`scaleX` compresses 1.0 -> 0.677)
#   - `garand_hammer_spring` (`scaleX` extends/compresses 0.85..1.14)!)
WALNUT_PARTS = [
    "garand_walnut_stock",
    "garand_rear_handguard",
    "garand_front_handguard",
]

RECEIVER_PARTS = [
    "garand_receiver",
    "garand_rear_sight",
    "garand_clip_latch",
    "garand_trigger_housing",
    "garand_trigger_guard",
    "garand_enbloc_clip",
]

METAL_PARTS = [
    "garand_barrel",
    "garand_gas_cylinder",
    "garand_gas_lock_screw",
    "garand_front_sight",
    "garand_op_rod",
    "garand_bolt",
    "garand_firing_pin",
    "garand_lower_band",
    "garand_buttplate",
    "garand_op_rod_catch",
    "garand_trigger",
    "garand_hammer",
    "garand_follower",
    "garand_follower_arm",
    "garand_bullet_guide",
]

SKIPPED_DYNAMIC_SPRING_PARTS = [
    "garand_op_rod_spring",
    "garand_hammer_spring",
]

# Stationary exterior parts that receive assembled inter-part contact AO
# (Reciprocating/rotating parts — op_rod, bolt, firing_pin, op_rod_catch, trigger, hammer,
#  enbloc_clip, follower, follower_arm, bullet_guide, clip_latch — receive pure Self-AO!)
EXTERIOR_CONTACT_AO_PARTS = {
    "garand_walnut_stock",
    "garand_rear_handguard",
    "garand_front_handguard",
    "garand_receiver",
    "garand_rear_sight",
    "garand_trigger_housing",
    "garand_trigger_guard",
    "garand_barrel",
    "garand_gas_cylinder",
    "garand_gas_lock_screw",
    "garand_front_sight",
    "garand_lower_band",
    "garand_buttplate",
}

# Exact assembledPos from src/weapons/garand/plugin.ts (all assembledRot = (0,0,0))
ASSEMBLED_POS = {
    "garand_barrel":          ( 0.00,  1.15,  0.00),
    "garand_gas_cylinder":    (58.40,  0.25,  0.00),
    "garand_gas_lock_screw":  (61.85,  0.38,  0.00),
    "garand_front_sight":     (59.55,  2.38,  0.00),
    "garand_op_rod":          (28.00,  0.15,  0.00),
    "garand_bolt":            (-0.65,  1.15,  0.00),
    "garand_firing_pin":      (-0.85,  1.15,  0.00),
    "garand_receiver":        ( 0.00,  0.00,  0.00),
    "garand_rear_sight":      (-6.85,  2.48,  0.00),
    "garand_walnut_stock":    ( 0.00,  0.00,  0.00),
    "garand_rear_handguard":  (18.40,  1.45,  0.00),
    "garand_front_handguard": (42.85,  0.95,  0.00),
    "garand_lower_band":      (30.65,  0.45,  0.00),
    "garand_buttplate":       (-46.95,-6.10,  0.00),
    "garand_op_rod_catch":    ( 4.85, -0.35,  0.55),
    "garand_trigger_housing": (-4.60, -2.55,  0.00),
    "garand_trigger_guard":   (-4.50, -4.35,  0.00),
    "garand_trigger":         (-5.55, -3.45,  0.00),
    "garand_hammer":          (-4.95, -1.65,  0.00),
    "garand_enbloc_clip":     (-0.95, -0.15,  0.00),
    "garand_follower":        (-0.95, -0.95,  0.00),
    "garand_follower_arm":    ( 3.85, -1.25,  0.00),
    "garand_bullet_guide":    ( 3.35, -0.45,  0.00),
    "garand_clip_latch":      (-1.15,  0.45, -1.48),
}

# Ground-truth CSG local bounding boxes from src/weapons/garand/meshes/*.ts
CSG_REF_BBOX = {
    "garand_barrel":          ((  2.000, -1.120, -1.120), ( 63.000,  1.120,  1.120)),
    "garand_gas_cylinder":    (( -3.800, -2.925, -0.950), (  3.050,  2.130,  0.950)),
    "garand_gas_lock_screw":  (( -0.550, -1.590, -0.884), (  0.640,  1.660,  0.884)),
    "garand_front_sight":     (( -0.680, -0.320, -0.640), (  0.680,  0.540,  0.640)),
    "garand_op_rod":          ((-27.650, -1.150, -0.645), ( 31.250,  1.725,  2.295)),
    "garand_bolt":            (( -3.800, -0.890, -1.010), (  2.650,  0.770,  1.430)),
    "garand_firing_pin":      (( -3.820, -0.900, -0.323), (  2.870,  0.225,  0.610)),
    "garand_receiver":        (( -8.630, -2.280, -1.420), (  6.400,  2.570,  1.550)),
    "garand_rear_sight":      (( -0.840, -0.680, -1.560), (  0.840,  0.980,  1.560)),
    "garand_walnut_stock":    ((-46.600,-11.750, -2.020), ( 30.470,  0.880,  2.020)),
    "garand_rear_handguard":  ((-11.780, -0.402, -1.520), ( 11.750,  1.270,  1.520)),
    "garand_front_handguard": ((-11.550, -0.950, -1.420), ( 11.670,  1.770,  1.420)),
    "garand_lower_band":      (( -0.680, -2.770, -1.540), (  0.680,  1.960,  1.540)),
    "garand_buttplate":       (( -0.580, -5.720, -1.940), (  0.620,  5.680,  1.940)),
    "garand_op_rod_catch":    (( -2.160, -0.634, -0.800), (  1.820,  0.680,  0.360)),
    "garand_trigger_housing": (( -3.750, -2.570, -1.000), (  3.980,  1.380,  1.000)),
    "garand_trigger_guard":   (( -3.495, -1.570, -0.610), (  2.740,  1.410,  0.610)),
    "garand_trigger":         (( -0.610, -1.631, -0.360), (  0.560,  1.620,  0.360)),
    "garand_hammer":          (( -2.537, -0.495, -0.330), (  0.550,  0.880,  0.330)),
    "garand_enbloc_clip":     (( -3.200, -1.480, -0.775), (  2.250,  1.480,  0.775)),
    "garand_follower":        (( -2.525, -0.680, -0.490), (  2.525,  0.450,  0.490)),
    "garand_follower_arm":    (( -4.754, -0.292, -0.520), (  7.245,  1.340,  0.520)),
    "garand_bullet_guide":    (( -1.280, -0.880, -0.670), (  1.350,  0.978,  0.670)),
    "garand_clip_latch":      (( -2.179, -2.105, -0.250), (  1.825,  0.395,  1.533)),
}

# Total t=1.0 exploded offset sums from src/weapons/garand/plugin.ts (incl. the 2 CSG springs for full overlap audit!)
EXPLODE_OFFSET_T1 = {
    "garand_barrel":          ( 22.0,   1.4,   0.0),
    "garand_gas_cylinder":    ( 42.0,  -3.0,   0.0),
    "garand_gas_lock_screw":  ( 58.0,  -3.0,   0.0),
    "garand_front_sight":     ( 42.0,   7.4,   0.0),
    "garand_op_rod":          (  8.5,  13.6,  11.8),
    "garand_bolt":            (-16.5,  14.2,   0.0),
    "garand_firing_pin":      (-33.5,  16.8,  -4.4),
    "garand_op_rod_spring":   (-18.5,  20.5,  11.8),
    "garand_receiver":        (  0.0,   0.0,   0.0),
    "garand_rear_sight":      ( -8.0,   9.0,   0.0),
    "garand_walnut_stock":    (-46.0, -12.0,   0.0),
    "garand_rear_handguard":  (  7.0,  16.7,  -5.5),
    "garand_front_handguard": ( 30.0,  15.0,  -5.5),
    "garand_lower_band":      ( 22.0, -12.0,   0.0),
    "garand_buttplate":       (-56.5, -12.7,   0.0),
    "garand_op_rod_catch":    (  9.7,  -8.8,   8.4),
    "garand_trigger_housing": (  5.0, -20.5,   0.0),
    "garand_trigger_guard":   ( 15.5, -28.5,   0.0),
    "garand_trigger":         ( -5.9, -28.5,  -4.3),
    "garand_hammer":          (  5.2,  -7.5,  -5.4),
    "garand_hammer_spring":   (-10.8, -21.1,   4.8),
    "garand_enbloc_clip":     (  0.0,  18.5,   0.0),
    "garand_follower":        ( -2.7,  12.0,  -7.0),
    "garand_follower_arm":    (  5.7, -11.0,  -7.2),
    "garand_bullet_guide":    ( 15.0,  -7.4,  -6.4),
    "garand_clip_latch":      ( -4.5,   4.0, -10.0),
}

CSG_SKIPPED_SPRING_INFO = {
    "garand_op_rod_spring": {
        "pos": (26.50, -0.35, 0.0),
        "bbox": ((-16.756, -0.416, -0.416), (16.756, 0.416, 0.416)),
    },
    "garand_hammer_spring": {
        "pos": (-6.35, -2.65, 0.0),
        "bbox": ((-1.740, -0.284, -0.280), (1.790, 0.284, 0.280)),
    },
}


# =============================================================================
# Scene & Physically Calibrated Cycles PBR Materials (WWII Springfield Armory)
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
    bevel_r: float = 0.030,
    edge_wear: float = 0.0,
    edge_srgb: tuple[float, float, float] = (0.72, 0.74, 0.77),
    grain_scale: float = 42.0,
    grain_bump: float = 0.030,
    aniso_stretch: tuple[float, float, float] = (1.0, 1.0, 1.0),
    voronoi_grain: float = 0.0,
    voronoi_scale: float = 82.0,
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

    # Macro gun-oil / manganese-phosphate bath mottling
    n_macro = nt.nodes.new("ShaderNodeTexNoise")
    n_macro.inputs["Scale"].default_value = 0.45
    n_macro.inputs["Detail"].default_value = 4.5
    n_macro.inputs["Roughness"].default_value = 0.56
    nt.links.new(texcoord.outputs["Object"], n_macro.inputs["Vector"])

    # Micro machining / phosphate crystal texture
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
        min(1.0, base_srgb[0] * 1.14),
        min(1.0, base_srgb[1] * 1.15),
        min(1.0, base_srgb[2] * 1.13),
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
    rgh_map.inputs["To Min"].default_value = max(0.11, roughness - rough_var)
    rgh_map.inputs["To Max"].default_value = min(0.92, roughness + rough_var)
    nt.links.new(n_macro.outputs["Fac"], rgh_map.inputs["Value"])
    rgh_sock = rgh_map.outputs["Result"]

    met_node = nt.nodes.new("ShaderNodeValue")
    met_node.outputs[0].default_value = metallic
    met_sock = met_node.outputs[0]

    # Bare-steel service wear along forged convex corners, rails, cam hump & sight ears!
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


def _build_garand_walnut_mat(name: str = "W_AmericanWalnut", is_bedding: bool = False) -> bpy.types.Material:
    """Hand-Rubbed Raw Linseed-Oil American Black Walnut (Juglans nigra) in seamless 3D Object Space!
    Flowing cathedral rings along the rifle length (+X) with slightly tilted grain flow through the wrist,
    elongated dark open vessel pores, subtle chatoyance & pure dielectric (M=0.0) satin oil sheen."""
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # Gentle 4-deg grain sweep following buttstock toe/comb axis along +X
    rot_g = nt.nodes.new("ShaderNodeMapping")
    rot_g.inputs["Rotation"].default_value = (0.0, math.radians(-4.5), 0.0)
    nt.links.new(tc.outputs["Object"], rot_g.inputs["Vector"])

    # Cathedral walnut heartwood rings stretched along +X (rifle axis!)
    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (0.065, 0.72, 0.58)
    nt.links.new(rot_g.outputs["Vector"], map_wood.inputs["Vector"])

    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.rings_direction = "X"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = 1.05
    wave.inputs["Distortion"].default_value = 7.8
    wave.inputs["Detail"].default_value = 6.5
    wave.inputs["Detail Scale"].default_value = 1.55
    wave.inputs["Detail Roughness"].default_value = 0.56
    nt.links.new(map_wood.outputs["Vector"], wave.inputs["Vector"])

    # Secondary fine straight fiber streaks along +X
    map_fib = nt.nodes.new("ShaderNodeMapping")
    map_fib.inputs["Scale"].default_value = (0.28, 3.8, 3.8)
    nt.links.new(rot_g.outputs["Vector"], map_fib.inputs["Vector"])

    n_fib = nt.nodes.new("ShaderNodeTexNoise")
    n_fib.inputs["Scale"].default_value = 1.9
    n_fib.inputs["Detail"].default_value = 7.0
    n_fib.inputs["Distortion"].default_value = 0.65
    nt.links.new(map_fib.outputs["Vector"], n_fib.inputs["Vector"])

    # Elongated dark American Black Walnut open vessel pores along +X
    map_pore = nt.nodes.new("ShaderNodeMapping")
    map_pore.inputs["Scale"].default_value = (1.15, 16.0, 16.0)
    nt.links.new(rot_g.outputs["Vector"], map_pore.inputs["Vector"])

    n_pore = nt.nodes.new("ShaderNodeTexNoise")
    n_pore.inputs["Scale"].default_value = 2.6
    n_pore.inputs["Detail"].default_value = 4.0
    nt.links.new(map_pore.outputs["Vector"], n_pore.inputs["Vector"])

    pore_m = nt.nodes.new("ShaderNodeMapRange")
    pore_m.clamp = True
    pore_m.inputs["From Min"].default_value = 0.60
    pore_m.inputs["From Max"].default_value = 0.77
    pore_m.inputs["To Min"].default_value = 0.0
    pore_m.inputs["To Max"].default_value = 1.0
    nt.links.new(n_pore.outputs["Fac"], pore_m.inputs["Value"])

    # Authentic warm medium-dark WWII Springfield linseed-oil American Black Walnut sRGB palette!
    if is_bedding:
        c_dark = srgb_to_lin(0.145, 0.075, 0.036)
        c_mid  = srgb_to_lin(0.245, 0.132, 0.068)
        c_warm = srgb_to_lin(0.320, 0.180, 0.095)
    else:
        c_dark = srgb_to_lin(0.165, 0.082, 0.039)
        c_mid  = srgb_to_lin(0.320, 0.172, 0.086)
        c_warm = srgb_to_lin(0.455, 0.258, 0.132)

    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.inputs[6].default_value = c_dark
    mix1.inputs[7].default_value = c_mid
    nt.links.new(wave.outputs["Fac"], mix1.inputs[0])

    fib_f = nt.nodes.new("ShaderNodeMapRange")
    fib_f.clamp = True
    fib_f.inputs["From Min"].default_value = 0.30
    fib_f.inputs["From Max"].default_value = 0.76
    fib_f.inputs["To Min"].default_value = 0.0
    fib_f.inputs["To Max"].default_value = 0.56
    nt.links.new(n_fib.outputs["Fac"], fib_f.inputs["Value"])

    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.inputs[7].default_value = c_warm
    nt.links.new(fib_f.outputs["Result"], mix2.inputs[0])
    nt.links.new(mix1.outputs[2], mix2.inputs[6])

    # Darken elongated open walnut pores
    pore_mul = nt.nodes.new("ShaderNodeMath")
    pore_mul.operation = "MULTIPLY"
    pore_mul.inputs[1].default_value = 0.52
    nt.links.new(pore_m.outputs["Result"], pore_mul.inputs[0])

    mix_p = nt.nodes.new("ShaderNodeMix")
    mix_p.data_type = "RGBA"
    mix_p.inputs[7].default_value = srgb_to_lin(0.095, 0.044, 0.020)
    nt.links.new(pore_mul.outputs["Value"], mix_p.inputs[0])
    nt.links.new(mix2.outputs[2], mix_p.inputs[6])
    nt.links.new(mix_p.outputs[2], bsdf.inputs["Base Color"])

    # Hand-rubbed raw linseed oil finish (R=0.38..0.54 on outer stock, 0.62 inside bedding cavity)
    r_wood = nt.nodes.new("ShaderNodeMapRange")
    r_wood.clamp = True
    r_wood.inputs["From Min"].default_value = 0.20
    r_wood.inputs["From Max"].default_value = 0.80
    r_wood.inputs["To Min"].default_value = 0.56 if is_bedding else 0.38
    r_wood.inputs["To Max"].default_value = 0.68 if is_bedding else 0.52
    nt.links.new(n_fib.outputs["Fac"], r_wood.inputs["Value"])

    r_pore = nt.nodes.new("ShaderNodeMath")
    r_pore.operation = "MULTIPLY_ADD"
    r_pore.inputs[1].default_value = 0.14
    nt.links.new(pore_m.outputs["Result"], r_pore.inputs[0])
    nt.links.new(r_wood.outputs["Result"], r_pore.inputs[2])
    nt.links.new(r_pore.outputs["Value"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.0

    # Tactile wood fiber & depressed open pore bump + subtle bevel
    h_pore = nt.nodes.new("ShaderNodeMath")
    h_pore.operation = "MULTIPLY"
    h_pore.inputs[1].default_value = -0.36
    nt.links.new(pore_m.outputs["Result"], h_pore.inputs[0])

    h_fib = nt.nodes.new("ShaderNodeMath")
    h_fib.operation = "MULTIPLY_ADD"
    h_fib.inputs[1].default_value = 0.18
    nt.links.new(n_fib.outputs["Fac"], h_fib.inputs[0])
    nt.links.new(h_pore.outputs["Value"], h_fib.inputs[2])

    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 4
    bev.inputs["Radius"].default_value = 0.025
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.020
    nt.links.new(h_fib.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def create_material_library() -> dict[str, bpy.types.Material]:
    return {
        # --- Walnut Atlas Materials (garand_v3_walnut) ---
        "W_AmericanWalnut": _build_garand_walnut_mat("W_AmericanWalnut", is_bedding=False),
        "W_WalnutBedding":  _build_garand_walnut_mat("W_WalnutBedding", is_bedding=True),
        "W_ParkerizedHW": _build_pbr_mat(
            "W_ParkerizedHW",
            base_srgb=(0.228, 0.244, 0.238),
            roughness=0.35,
            metallic=0.82,
            bevel_r=0.022,
            edge_wear=0.52,
            edge_srgb=(0.74, 0.76, 0.79),
            grain_scale=64.0,
            grain_bump=0.042,
            voronoi_grain=0.56,
            voronoi_scale=90.0,
            rough_var=0.036,
        ),
        "W_BurnishedSwivel": _build_pbr_mat(
            "W_BurnishedSwivel",
            base_srgb=(0.36, 0.39, 0.41),
            roughness=0.28,
            metallic=0.88,
            bevel_r=0.018,
            edge_wear=0.38,
            edge_srgb=(0.78, 0.80, 0.84),
            grain_scale=34.0,
            grain_bump=0.024,
            rough_var=0.030,
        ),

        # --- Receiver Atlas Materials (garand_v3_receiver) ---
        # WWII Springfield Zinc/Manganese Parkerized Forged Steel (rich greenish-slate, NEVER pitch black!)
        "R_ParkerizedForged": _build_pbr_mat(
            "R_ParkerizedForged",
            base_srgb=(0.226, 0.242, 0.236),
            roughness=0.36,
            metallic=0.80,
            bevel_r=0.030,
            edge_wear=0.56,
            edge_srgb=(0.74, 0.77, 0.80),
            grain_scale=66.0,
            grain_bump=0.046,
            voronoi_grain=0.58,
            voronoi_scale=94.0,
            rough_var=0.038,
        ),
        "R_ParkerizedDark": _build_pbr_mat(
            "R_ParkerizedDark",
            base_srgb=(0.194, 0.208, 0.204),
            roughness=0.39,
            metallic=0.81,
            bevel_r=0.026,
            edge_wear=0.50,
            edge_srgb=(0.70, 0.73, 0.76),
            grain_scale=72.0,
            grain_bump=0.050,
            voronoi_grain=0.62,
            voronoi_scale=98.0,
            rough_var=0.038,
        ),
        # Darker blued spring-steel 8-round en-bloc clip ("PING!")
        "R_EnBlocBlued": _build_pbr_mat(
            "R_EnBlocBlued",
            base_srgb=(0.172, 0.194, 0.226),
            roughness=0.22,
            metallic=0.89,
            bevel_r=0.016,
            edge_wear=0.62,
            edge_srgb=(0.78, 0.81, 0.85),
            grain_scale=38.0,
            grain_bump=0.020,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.030,
        ),
        "R_BurnishedRail": _build_pbr_mat(
            "R_BurnishedRail",
            base_srgb=(0.56, 0.59, 0.62),
            roughness=0.22,
            metallic=0.93,
            bevel_r=0.020,
            edge_wear=0.34,
            edge_srgb=(0.86, 0.88, 0.91),
            grain_scale=32.0,
            grain_bump=0.022,
            aniso_stretch=(0.35, 3.8, 3.8),
            rough_var=0.028,
        ),
        "R_BrightSteel": _build_pbr_mat(
            "R_BrightSteel",
            base_srgb=(0.78, 0.81, 0.84),
            roughness=0.18,
            metallic=0.96,
            bevel_r=0.016,
            edge_wear=0.20,
            edge_srgb=(0.92, 0.94, 0.96),
            grain_scale=28.0,
            grain_bump=0.018,
            aniso_stretch=(0.40, 3.2, 3.2),
            rough_var=0.022,
        ),
        "R_SpringSteel": _build_pbr_mat(
            "R_SpringSteel",
            base_srgb=(0.54, 0.57, 0.62),
            roughness=0.24,
            metallic=0.93,
            bevel_r=0.012,
            grain_scale=28.0,
            grain_bump=0.016,
            rough_var=0.024,
        ),

        # --- Metal / Ordnance / Barrel / Gas / Op-Rod / Bolt / Internals Atlas (garand_v3_metal) ---
        "M_ParkerizedBarrel": _build_pbr_mat(
            "M_ParkerizedBarrel",
            base_srgb=(0.214, 0.228, 0.224),
            roughness=0.33,
            metallic=0.83,
            bevel_r=0.024,
            edge_wear=0.46,
            edge_srgb=(0.72, 0.75, 0.78),
            grain_scale=44.0,
            grain_bump=0.036,
            aniso_stretch=(4.2, 0.45, 0.45),
            voronoi_grain=0.42,
            voronoi_scale=88.0,
            rough_var=0.036,
        ),
        "M_ParkerizedSteel": _build_pbr_mat(
            "M_ParkerizedSteel",
            base_srgb=(0.224, 0.239, 0.234),
            roughness=0.36,
            metallic=0.81,
            bevel_r=0.026,
            edge_wear=0.58,
            edge_srgb=(0.76, 0.78, 0.82),
            grain_scale=64.0,
            grain_bump=0.044,
            voronoi_grain=0.56,
            voronoi_scale=92.0,
            rough_var=0.038,
        ),
        # Blackened 410 stainless WWII muzzle gas cylinder (cooler slate contrast!)
        "M_GasStainless": _build_pbr_mat(
            "M_GasStainless",
            base_srgb=(0.258, 0.272, 0.282),
            roughness=0.33,
            metallic=0.85,
            bevel_r=0.024,
            edge_wear=0.54,
            edge_srgb=(0.78, 0.81, 0.84),
            grain_scale=52.0,
            grain_bump=0.038,
            voronoi_grain=0.48,
            voronoi_scale=84.0,
            rough_var=0.038,
        ),
        # Centerless-ground bright white 410 stainless op-rod piston, rifling, firing pin & gas screw
        "M_WhiteStainless": _build_pbr_mat(
            "M_WhiteStainless",
            base_srgb=(0.80, 0.83, 0.86),
            roughness=0.17,
            metallic=0.96,
            bevel_r=0.018,
            edge_wear=0.18,
            edge_srgb=(0.93, 0.95, 0.97),
            grain_scale=30.0,
            grain_bump=0.016,
            aniso_stretch=(3.8, 0.45, 0.45),
            rough_var=0.022,
        ),
        # Silver-burnished bolt lugs, hammer, follower, swivel loops & raceways
        "M_BurnishedSteel": _build_pbr_mat(
            "M_BurnishedSteel",
            base_srgb=(0.50, 0.53, 0.57),
            roughness=0.24,
            metallic=0.92,
            bevel_r=0.022,
            edge_wear=0.38,
            edge_srgb=(0.84, 0.87, 0.90),
            grain_scale=34.0,
            grain_bump=0.024,
            aniso_stretch=(0.45, 3.2, 3.2),
            rough_var=0.030,
        ),
        "M_BoreCarbon": _build_pbr_mat(
            "M_BoreCarbon",
            base_srgb=(0.118, 0.122, 0.130),
            roughness=0.48,
            metallic=0.76,
            bevel_r=0.014,
            grain_scale=46.0,
            grain_bump=0.032,
            rough_var=0.050,
        ),
    }


# =============================================================================
# Core Three.js-Coordinate BMesh & Hard-Surface Sculpting Toolkit
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


def _quad_bez(p0: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float], segs: int = 8):
    pts = []
    for i in range(1, segs + 1):
        t = i / segs
        u = 1.0 - t
        pts.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return pts


def _smoothstep_f(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / max(e1 - e0, 1e-6)))
    return t * t * (3.0 - 2.0 * t)


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


def mk_tube_along_pts(
    name: str,
    pts_three: list[Vector],
    radius,
    ring_segs: int = 16,
    ellip_scale: tuple[float, float] = (1.0, 1.0),
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    """Watertight capped swept tube (circular or elliptical strap cross-section) in Three.js space."""
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(pts_three)
    for i, p in enumerate(pts_three):
        u = i / max(1, n_pts - 1)
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
        rad = radius(u) if callable(radius) else float(radius)
        ring = []
        for s in range(ring_segs):
            th = 2.0 * math.pi * s / ring_segs
            off = (n_vec * (math.cos(th) * ellip_scale[0]) + b_vec * (math.sin(th) * ellip_scale[1])) * rad
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
    name: str, axis: str, start: float, end: float,
    center_a: float, center_b: float, coil_r: float, wire_r: float, coils: float,
    ring_segs: int = 8, steps_per_coil: int = 14,
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


def mk_knurled_cyl(
    name: str, radius: float, length: float, axis: str = "z",
    flutes: int = 28, depth: float = 0.022,
    xform: list[tuple] | None = None,
    mat: bpy.types.Material | None = None,
) -> bpy.types.Object:
    n_pts = flutes * 2
    half_l = length * 0.5
    bev = min(0.022, length * 0.14, radius * 0.12)
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


def mk_loft_x(
    name: str,
    stations: list[tuple[float, list[tuple[float, float]]]],
    mat: bpy.types.Material | None = None,
    xform: list[tuple] | None = None,
) -> bpy.types.Object:
    """Watertight multi-station 3D loft along Three.js +X.
    Each station is `(x, [(z, y), ...])` with identical vertex count per ring."""
    bm = bmesh.new()
    n_ring = len(stations[0][1])
    rings = []
    for x, zy_ring in stations:
        assert len(zy_ring) == n_ring
        rings.append([bm.verts.new((x, y, z)) for (z, y) in zy_ring])
    for s in range(len(rings) - 1):
        a = rings[s]
        b = rings[s + 1]
        for k in range(n_ring):
            kn = (k + 1) % n_ring
            bm.faces.new((a[k], b[k], b[kn], a[kn]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _apply_three_xform(bm, xform or [])
    return _bm_to_obj(name, bm, mat)


def mk_helical_lands(
    name: str,
    count: int,
    bore_r: float,
    depth: float,
    width: float,
    x0: float,
    x1: float,
    twist_cm: float,
    segs_x: int = 36,
    mat: bpy.types.Material | None = None,
) -> list[bpy.types.Object]:
    """Strictly watertight helical rifling lands or longitudinal barrel splines along +X."""
    objs = []
    embed = min(0.012, depth * 0.45)
    r_in = bore_r - depth
    r_out = bore_r + embed
    hw = width * 0.5
    for k in range(count):
        base_a = 2.0 * math.pi * k / count
        bm = bmesh.new()
        rings = []
        for s in range(segs_x + 1):
            u = s / segs_x
            x = x0 + (x1 - x0) * u
            a = base_a + ((x - x0) / twist_cm) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            pts_local = [(r_in, -hw), (r_out, -hw), (r_out, hw), (r_in, hw)]
            ring = []
            for py, pz in pts_local:
                wy = py * ca - pz * sa
                wz = py * sa + pz * ca
                ring.append(bm.verts.new((x, wy, wz)))
            rings.append(ring)
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
    sharp_deg: float = 36.0,
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
# SHARED ORGANIC WALNUT STOCK CROSS-SECTION EVALUATOR (Stock + Buttplate 1:1 Match!)
# =============================================================================
def _eval_buttstock_profile_y(x: float) -> tuple[float, float, float, float]:
    """Returns `(y_top, y_bot, half_w_mid, top_taper)` along the full M1 Garand stock X in [-46.60, +30.15].
    Crafted for the unmistakable classic WWII Springfield M1 Garand silhouette:
      - Straight high comb (-46.5..-22.0), graceful comb nose drop (-22..-16.2),
      - Ergonomic slim semi-pistol-grip wrist (-16.2..-9.2) swelling down to rounded grip cap (-13.3, -7.12),
      - Full magazine-well belly (-9.0..+6.4) sweeping gracefully into tapered forend (+6.8..+30.1)."""
    # --- Top profile (y_top) ---
    top_pts = [
        (-46.60, -0.46),
        (-40.00, -0.45),
        (-26.00, -0.42),
        (-22.20, -0.44),
        (-19.80, -0.60),
        (-17.80, -1.00),
        (-16.00, -1.32),  # Comb nose valley
        (-13.80, -1.04),
        (-11.20, -0.48),
        ( -8.62,  0.65),  # Seamless tang wood rising right up to meet receiver heel at X=-8.60!
        ( -8.20,  0.88),  # Receiver cheek top rail
        (  7.05,  0.88),
        ( 12.00,  0.88),
        ( 30.15,  0.86),
    ]
    # --- Bottom profile (y_bot) ---
    bot_pts = [
        (-46.60, -11.74),  # Butt toe
        (-39.00, -10.22),
        (-30.00,  -8.46),
        (-22.00,  -6.92),
        (-19.20,  -6.44),  # Belly cove behind pistol grip
        (-16.80,  -6.12),
        (-15.20,  -6.66),  # Smoothly rounded broad semi-pistol grip pommel cap!
        (-14.20,  -7.02),
        (-13.10,  -7.06),
        (-12.10,  -6.64),  # Front face of pistol grip ([P] proof area!)
        (-10.80,  -5.30),
        ( -9.20,  -4.46),  # Behind trigger guard
        ( -4.50,  -4.36),  # Under trigger housing
        (  2.50,  -4.22),
        (  5.80,  -4.05),  # Front of magazine belly
        (  7.20,  -2.25),  # Graceful curve up into forend!
        (  9.20,  -2.04),
        ( 18.00,  -1.94),
        ( 26.00,  -1.82),
        ( 30.15,  -1.72),
    ]
    # --- Max lateral half-width (half_w_mid) ---
    # Authentic M1 Garand walnut stock thickness profile:
    # Full 3.80cm butt, slims organically to ergonomic 2.98cm wrist, widens cleanly to 4.02cm receiver cheeks,
    # tapers gracefully along forend from 3.74cm -> 3.12cm!
    w_pts = [
        (-46.60, 1.91),
        (-38.00, 1.88),
        (-28.00, 1.84),
        (-21.00, 1.76),
        (-16.50, 1.56),  # Slim ergonomic wrist!
        (-13.50, 1.50),  # Grip hand-swell narrowest waist
        (-11.00, 1.66),
        ( -8.80, 1.98),  # Receiver bedding cheeks
        (  5.80, 1.98),
        (  7.60, 1.84),  # Forend transition
        ( 16.00, 1.74),
        ( 25.00, 1.64),
        ( 30.15, 1.56),
    ]

    def _sample(pts: list[tuple[float, float]], xv: float) -> float:
        if xv <= pts[0][0]:
            return pts[0][1]
        if xv >= pts[-1][0]:
            return pts[-1][1]
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            if x0 <= xv <= x1:
                u = (xv - x0) / max(x1 - x0, 1e-6)
                # Gentle smooth blending near transitions
                return y0 + (y1 - y0) * u
        return pts[-1][1]

    yt = _sample(top_pts, x)
    yb = _sample(bot_pts, x)
    hw = _sample(w_pts, x)
    # Top comb narrows gracefully on buttstock (0.64) vs fuller rectangular cheek rails over receiver (0.94)
    if x < -17.0:
        top_taper = 0.64
    elif x < -8.8:
        top_taper = 0.64 + 0.30 * _smoothstep_f(-17.0, -8.8, x)
    else:
        top_taper = 0.94
    return (yt, yb, hw, top_taper)


def _eval_buttstock_ring(x: float, n_ring: int = 32) -> list[tuple[float, float]]:
    """Builds a smooth organic pear/oval `(z, y)` cross-section ring at station `x` for the walnut buttstock."""
    yt, yb, hw, top_taper = _eval_buttstock_profile_y(x)
    ym = 0.5 * (yt + yb)
    hy = max(0.35, 0.5 * (yt - yb))
    ring: list[tuple[float, float]] = []
    # Smooth superellipse exponent: rounder oval on wrist/butt (2.15), crisper flat-sided cheek near receiver (2.6)
    exp_n = 2.18 + 0.50 * _smoothstep_f(-12.5, -8.8, x)
    for k in range(n_ring):
        # th=0 -> +Z right mid, th=pi/2 -> +Y top comb, th=pi -> -Z left mid, th=3pi/2 -> -Y bottom toe
        th = 2.0 * math.pi * k / n_ring
        ct, st = math.cos(th), math.sin(th)
        sz = math.copysign(abs(ct) ** (2.0 / exp_n), ct)
        sy = math.copysign(abs(st) ** (2.0 / exp_n), st)
        # Organic comb taper: narrower near top comb crest (st > 0) & gentle taper near bottom toe (st < -0.5)
        if sy > 0.0:
            w_scale = 1.0 - (1.0 - top_taper) * (sy ** 1.45)
        else:
            w_scale = 1.0 - 0.16 * (abs(sy) ** 1.8)
        z = hw * w_scale * sz
        y = ym + hy * sy
        ring.append((z, y))
    return ring


# =============================================================================
# 24 AAA HARD-SURFACE M1 GARAND PART BUILDERS
# =============================================================================

# --- GROUP A: AMERICAN BLACK WALNUT STOCK & HANDGUARDS (3 PARTS) ---

def build_garand_walnut_stock(mats: dict) -> bpy.types.Object:
    """F-03: Organically lofted American Black Walnut full-length stock (77.0 cm),
    sculpted ergonomic wrist/comb, finger-fluted forend, hollowed receiver/FCG bedding mortise,
    stamped steel front stock ferrule & recessed rear butt sling swivel!"""
    m_w = mats["W_AmericanWalnut"]
    m_b = mats["W_WalnutBedding"]
    m_hw = mats["W_ParkerizedHW"]
    m_sw = mats["W_BurnishedSwivel"]

    # 1. Seamless organically lofted rear buttstock + comb + ergonomic semi-pistol grip + receiver hull
    #    Spans X in [-46.58, +7.10] as ONE unified sculpted hardwood blank, then precision-milled inside!
    butt_xs = [
        -46.58, -45.2, -42.5, -39.0, -35.0, -30.5, -26.0, -22.2,
        -20.2, -18.5, -17.0, -15.8, -14.6, -13.4, -12.3, -11.2,
        -10.1,  -9.1,  -8.4,  -6.5,  -3.5,   0.0,   3.5,   5.8,   6.8,   7.10,
    ]
    butt_stations = [(x, _eval_buttstock_ring(x, 32)) for x in butt_xs]
    rear_blank = mk_loft_x("stk_rear_raw", butt_stations, mat=m_w)

    # Precision-mill internal receiver & trigger-housing bedding mortise out of X in [-8.58, +7.25]
    # (Leaves solid closed walnut floor beneath magazine well & seamless flush fit behind receiver heel!)
    mortise_cutters = [
        # Main central open-top receiver & clip-well mortise (Y in [-2.38, +2.22] -> solid 1.7 cm wood belly underneath!)
        mk_box("c_rec_well", 15.80, 4.60, 2.74, [("t", -0.65, -0.08, 0.0)], m_b),
        # Upper receiver top-flank shelf relief (Z in [-1.52, +1.52], X in [-8.58, +7.20], Y >= 0.15)
        mk_box("c_rec_top", 15.78, 1.40, 2.94, [("t", -0.69, 0.78, 0.0)], m_b),
        # Right-side op-rod travel channel cut along upper right cheek (Z in [+0.85, +2.30], Y >= +0.18)
        mk_box("c_oprod_ch", 12.6, 1.15, 1.35, [("t", 1.25, 0.76, 1.56)], m_b),
        # Left-side clip-latch thumb-button relief scallop (Z in [-2.20, -1.15], X in [-3.40, +0.90])
        mk_box("c_latch_rel", 4.30, 1.05, 1.10, [("t", -1.25, 0.56, -1.72)], m_b, bevel=0.08),
        # Lower trigger-housing & trigger-guard bottom through-mortise (strictly X in [-8.38, -0.62], Z in [-0.96, +0.96]!)
        mk_box("c_fcg_bay", 7.76, 4.80, 1.92, [("t", -4.50, -3.50, 0.0)], m_b),
        # Rear receiver heel bedding seat (ends flush AT receiver rear face X=-8.58 — ZERO rear notch!)
        mk_box("c_tang_pkt", 1.45, 2.30, 2.48, [("t", -7.86, 0.12, 0.0)], m_b),
    ]
    rear_stock = bool_subtract(rear_blank, mortise_cutters, solver="EXACT")

    # 2. Tapered & Finger-Fluted U-Channel Walnut Forend (X in [+6.85, +30.12])
    #    Lofted smoothly with organic rounded belly, crisp upper lip meeting rear handguard flush, and subtle WWII finger flutes!
    forend_xs = [6.85, 8.2, 10.5, 14.0, 18.0, 22.0, 26.0, 28.8, 30.10]
    forend_stations = []
    for x in forend_xs:
        u = (x - 6.85) / (30.10 - 6.85)
        hw = 1.76 - u * 0.22        # tapers gracefully from 1.76 -> 1.54
        y_top = 0.88 - u * 0.04     # 0.88 -> 0.84 (meets garand_rear_handguard skirt seamlessly!)
        y_bot = -2.02 + u * 0.30    # -2.02 -> -1.72
        # Subtle ergonomic shallow WWII finger-grip flute along upper-mid forend flank (X in [10.5, 27.5])
        flute_w = math.sin(max(0.0, min(1.0, (x - 10.0) / 17.8)) * math.pi)
        flute_d = 0.085 * (flute_w ** 1.3)
        # Inner U-trough clearance for barrel (Y=1.15, R<=0.95) & op-rod/spring (Y=-0.35, R<=0.56)
        in_w = 1.24 - u * 0.12
        in_bot = -1.24 + u * 0.14

        # Build closed 24-pt U-channel cross-section `(z, y)` (CCW in Z-Y plane)
        ring = [
            (-hw, y_top),
            (-hw + flute_d * 0.4, y_top - 0.34),
            (-hw + flute_d,       y_top - 0.72),
            (-hw + flute_d * 0.3, y_top - 1.14),
            (-hw * 0.96,          y_bot + 0.62),
            (-hw * 0.82,          y_bot + 0.28),
            (-hw * 0.56,          y_bot + 0.08),
            (-hw * 0.28,          y_bot + 0.01),
            ( 0.0,                y_bot),
            ( hw * 0.28,          y_bot + 0.01),
            ( hw * 0.56,          y_bot + 0.08),
            ( hw * 0.82,          y_bot + 0.28),
            ( hw * 0.96,          y_bot + 0.62),
            ( hw - flute_d * 0.3, y_top - 1.14),
            ( hw - flute_d,       y_top - 0.72),
            ( hw - flute_d * 0.4, y_top - 0.34),
            ( hw,                 y_top),
            # Inner U-channel trough (generous clearance for barrel + op-rod + op-rod spring!)
            ( in_w,               y_top),
            ( in_w * 0.96,        in_bot + 0.55),
            ( in_w * 0.68,        in_bot + 0.14),
            ( 0.0,                in_bot),
            (-in_w * 0.68,        in_bot + 0.14),
            (-in_w * 0.96,        in_bot + 0.55),
            (-in_w,               y_top),
        ]
        forend_stations.append((x, ring))
    walnut_forend = mk_loft_x("stk_forend", forend_stations, mat=m_w)

    # 3. Stamped Parkerized Steel Front Stock Ferrule (X in [30.02, 30.46]) matching forend contour!
    ferr_stations = []
    for x in (30.02, 30.12, 30.38, 30.46):
        bump = 0.04 if (30.08 <= x <= 30.40) else 0.0
        hw = 1.57 + bump
        y_top = 0.77 + bump * 0.4
        y_bot = -1.74 - bump * 0.6
        in_w = 1.10
        in_bot = -1.08
        ring = [
            (-hw, y_top),
            (-hw, y_top - 0.65),
            (-hw * 0.94, y_bot + 0.55),
            (-hw * 0.72, y_bot + 0.18),
            (-hw * 0.36, y_bot + 0.03),
            ( 0.0,       y_bot),
            ( hw * 0.36, y_bot + 0.03),
            ( hw * 0.72, y_bot + 0.18),
            ( hw * 0.94, y_bot + 0.55),
            ( hw,        y_top - 0.65),
            ( hw,        y_top),
            ( in_w,      y_top),
            ( in_w * 0.92, in_bot + 0.45),
            ( in_w * 0.55, in_bot + 0.08),
            ( 0.0,       in_bot),
            (-in_w * 0.55, in_bot + 0.08),
            (-in_w * 0.92, in_bot + 0.45),
            (-in_w,      y_top),
        ]
        ferr_stations.append((x, ring))
    stock_ferrule = mk_loft_x("stk_ferrule", ferr_stations, mat=m_hw)

    # 4. Recessed Rear Buttstock Sling Swivel Assembly (X ~ -38.6, Y ~ -10.15) w/ twin slotted wood screws!
    swivel_plate = mk_box("stk_sw_plt", 2.24, 0.34, 0.94, [("rz", 0.19), ("t", -38.60, -10.14, 0.0)], m_hw, bevel=0.04)
    swivel_ear = mk_box("stk_sw_ear", 0.88, 0.52, 0.68, [("rz", 0.19), ("t", -38.60, -10.34, 0.0)], m_hw, bevel=0.03)
    swivel_pin = mk_cyl("stk_sw_pin", 0.11, 0.11, 0.98, "z", 14, [("t", -38.62, -10.42, 0.0)], m_sw, bevel=0.012)
    # Twin recessed wood screws on swivel plate
    sw_scr_f = mk_cyl("stk_sw_sf", 0.16, 0.16, 0.24, "y", 16, [("rz", 0.19), ("t", -37.82, -10.04, 0.0)], m_sw, bevel=0.015)
    sw_scr_r = mk_cyl("stk_sw_sr", 0.16, 0.16, 0.24, "y", 16, [("rz", 0.19), ("t", -39.38, -10.34, 0.0)], m_sw, bevel=0.015)
    # Smooth 24-point forged rounded oval rear sling swivel loop
    swivel_loop_pts = []
    for k in range(25):
        a = -math.pi * 0.5 + math.pi * (k / 24.0)  # -pi/2 -> +pi/2 around loop U
        # smooth rounded stadium loop hanging down from (-38.62, -10.42, +-0.48)
        ca, sa = math.cos(a), math.sin(a)
        px = -38.62 - 0.68 * (ca ** 0.85)
        py = -10.42 - 1.05 * (ca ** 0.85)
        pz = 0.48 * sa + 0.16 * sa * ca
        swivel_loop_pts.append(Vector((px, py, pz)))
    swivel_loop = mk_tube_along_pts("stk_sw_loop", swivel_loop_pts, 0.092, ring_segs=14, mat=m_sw)

    obj = join_objects(
        [rear_stock, walnut_forend, stock_ferrule, swivel_plate, swivel_ear, swivel_pin, sw_scr_f, sw_scr_r, swivel_loop],
        "garand_walnut_stock",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=44.0)


def build_garand_rear_handguard(mats: dict) -> bpy.types.Object:
    """F-04: Gracefully tapered arched American Black Walnut rear handguard + stamped steel rear clip
    (assembledPos: [18.40, 1.45, 0] -> world X in [6.65, 30.15])."""
    m_w = mats["W_AmericanWalnut"]
    m_hw = mats["W_ParkerizedHW"]

    # Smooth tapered walnut arch w/ flush lower skirt meeting walnut forend at world Y ~ 0.90 (zero daylight slot!)
    n_arc = 18
    xs = [-11.72, -10.60, -8.0, -4.0, 0.0, 4.0, 8.0, 10.8, 11.72]
    stations = []
    for x in xs:
        u = (x + 11.72) / 23.44
        r_out = 1.51 - u * 0.14
        r_in = 1.11 - u * 0.11
        yc = -0.25 - u * 0.04
        y_skirt = -0.54 - u * 0.03  # local Y=-0.54 -> world Y=0.91 meeting forend Y=0.88 seamlessly!
        lip_pull = 0.04 if (x <= -11.50 or x >= 11.50) else 0.0
        ring = [(r_out - lip_pull, y_skirt)]
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            ring.append(((r_out - lip_pull) * math.cos(a), yc + (r_out - lip_pull) * math.sin(a)))
        ring.extend([(-(r_out - lip_pull), y_skirt), (-r_in, y_skirt)])
        for k in range(n_arc, -1, -1):
            a = math.pi * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        ring.append((r_in, y_skirt))
        stations.append((x, ring))
    wood_arch = mk_loft_x("rhg_wood", stations, mat=m_w)

    # Stamped parkerized spring-steel rear handguard retaining band clip (local X in [-11.78, -10.58])
    clip_stations = []
    for x in (-11.78, -11.72, -10.64, -10.58):
        r_out = 1.53 if (-11.73 <= x <= -10.63) else 1.49
        r_in = 1.42
        yc = -0.25
        ring = []
        for k in range(n_arc + 1):
            a = -0.10 + (math.pi + 0.20) * (k / n_arc)
            ring.append((r_out * math.cos(a), yc + r_out * math.sin(a)))
        for k in range(n_arc, -1, -1):
            a = -0.10 + (math.pi + 0.20) * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        clip_stations.append((x, ring))
    rear_clip = mk_loft_x("rhg_clip", clip_stations, mat=m_hw)

    # Front nose lip steel liner engaging garand_lower_band
    front_lip = mk_box("rhg_flp_l", 0.65, 0.22, 0.14, [("t", 11.40, -0.24, -1.26)], m_hw, bevel=0.015)
    front_lip_r = mk_box("rhg_flp_r", 0.65, 0.22, 0.14, [("t", 11.40, -0.24,  1.26)], m_hw, bevel=0.015)

    obj = join_objects([wood_arch, rear_clip, front_lip, front_lip_r], "garand_rear_handguard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=40.0)


def build_garand_front_handguard(mats: dict) -> bpy.types.Object:
    """F-05: Tapered pear-arched American Black Walnut front handguard + front steel ferrule cap & rear liner
    (assembledPos: [42.85, 0.95, 0] -> world X in [31.35, 54.45])."""
    m_w = mats["W_AmericanWalnut"]
    m_hw = mats["W_ParkerizedHW"]

    n_arc = 16
    xs = [-11.42, -9.5, -5.0, 0.0, 5.0, 9.2, 10.92]
    stations = []
    for x in xs:
        u = (x + 11.42) / 22.34
        r_out = 1.42 - u * 0.12
        r_in = 1.03 - u * 0.08
        y_bot = -0.94 + u * 0.12
        yc = 0.35 - u * 0.05
        ring = [
            (-r_out * 0.96, y_bot),
            (-r_out * 0.99, y_bot + 0.55),
        ]
        for k in range(n_arc + 1):
            a = math.pi - math.pi * (k / n_arc)
            ring.append((r_out * math.cos(a), yc + r_out * math.sin(a)))
        ring.extend([
            ( r_out * 0.99, y_bot + 0.55),
            ( r_out * 0.96, y_bot),
            ( r_in,         y_bot),
            ( r_in,         yc),
        ])
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        ring.append((-r_in, y_bot))
        stations.append((x, ring))
    wood_body = mk_loft_x("fhg_wood", stations, mat=m_w)

    # Stamped parkerized steel front ferrule cap (local X in [10.82, 11.66]) engaging gas cylinder rear ring!
    ferr_stations = []
    for x in (10.82, 10.90, 11.58, 11.66):
        bump = 0.035 if (10.88 <= x <= 11.60) else 0.0
        r_out = 1.31 + bump
        r_in = 0.95
        y_bot = -0.82 - bump * 0.4
        yc = 0.30
        ring = [
            (-r_out * 0.96, y_bot),
            (-r_out * 0.99, y_bot + 0.50),
        ]
        for k in range(n_arc + 1):
            a = math.pi - math.pi * (k / n_arc)
            ring.append((r_out * math.cos(a), yc + r_out * math.sin(a)))
        ring.extend([
            ( r_out * 0.99, y_bot + 0.50),
            ( r_out * 0.96, y_bot),
            ( r_in,         y_bot),
            ( r_in,         yc),
        ])
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        ring.append((-r_in, y_bot))
        ferr_stations.append((x, ring))
    ferrule_cap = mk_loft_x("fhg_ferrule", ferr_stations, mat=m_hw)

    # Rear steel spacer ring (local X in [-11.55, -11.08]) seating cleanly into lower band!
    rear_stations = []
    for x in (-11.55, -11.48, -11.12, -11.06):
        r_out = 1.43 if (-11.50 <= x <= -11.10) else 1.40
        r_in = 1.03
        y_bot = -0.94
        yc = 0.35
        ring = [(-r_out * 0.96, y_bot), (-r_out * 0.99, y_bot + 0.55)]
        for k in range(n_arc + 1):
            a = math.pi - math.pi * (k / n_arc)
            ring.append((r_out * math.cos(a), yc + r_out * math.sin(a)))
        ring.extend([(r_out * 0.99, y_bot + 0.55), (r_out * 0.96, y_bot), (r_in, y_bot), (r_in, yc)])
        for k in range(n_arc + 1):
            a = math.pi * (k / n_arc)
            ring.append((r_in * math.cos(a), yc + r_in * math.sin(a)))
        ring.append((-r_in, y_bot))
        rear_stations.append((x, ring))
    rear_spacer = mk_loft_x("fhg_spacer", rear_stations, mat=m_hw)

    # Twin small brass/steel ferrule rivet heads on ±Z flanks
    riv_l = mk_cyl("fhg_rl", 0.08, 0.08, 0.14, "z", 12, [("t", 11.24, 0.05, -1.32)], m_hw, bevel=0.015)
    riv_r = mk_cyl("fhg_rr", 0.08, 0.08, 0.14, "z", 12, [("t", 11.24, 0.05,  1.32)], m_hw, bevel=0.015)

    obj = join_objects([wood_body, ferrule_cap, rear_spacer, riv_l, riv_r], "garand_front_handguard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=40.0)


# --- GROUP B: FORGED RECEIVER, T105 SIGHT, CLIP LATCH, TRIGGER GROUP & EN-BLOC CLIP (6 PARTS) ---

def build_garand_receiver(mats: dict) -> bpy.types.Object:
    """F-01: Iconic WWII Forged Milled Open-Top Springfield Armory Receiver (assembledPos: [0,0,0]).
    Features heavy forged barrel ring, sculpted open-top clip cavity w/ beveled thumb-loading lips,
    left clip-latch window & pivot ears, lowered right ejection port w/ burnished op-rod track,
    rounded rear safety bridge, curved protective rear sight ears & sloped heel deck carrying
    `U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2847192`!"""
    m_pk = mats["R_ParkerizedForged"]
    m_dk = mats["R_ParkerizedDark"]
    m_br = mats["R_BurnishedRail"]

    # 1. Heavy Forged Cylindrical Barrel-Mounting Receiver Ring (X in [3.35, 6.40], bore Y = 1.15)
    front_ring = mk_lathe_x(
        "rec_fring",
        [
            (1.07, 3.35),
            (1.42, 3.35),
            (1.42, 6.26),
            (1.36, 6.38),
            (1.30, 6.40),
            (1.07, 6.40),
            (1.07, 3.35),
        ],
        segs=40,
        xform=[("t", 0.0, 1.15, 0.0)],
        mat=m_pk,
    )

    # 2. Forged Left Receiver Wall (Z in [-1.42, -0.88]) w/ curved top loading bevel, sight ear & sloped heel!
    left_xy = [
        (-8.60, -0.82),
        (-7.60, -1.62),
        (-6.20, -2.26),   # Rear trigger-housing lug leg
        ( 3.85, -2.26),   # Front trigger-housing lug leg
        ( 5.85, -0.45),
        ( 5.85,  1.96),
        (-4.42,  1.96),   # Open-top clip-loading rim
        (-5.25,  2.26),   # Rounded front slope of left rear-sight ear
        (-5.78,  2.46),
        (-7.18,  2.46),   # Sight ear crest
        (-7.58,  2.14),
        (-8.60,  1.44),   # Iconic sloped Springfield receiver heel!
    ]
    left_wall_raw = mk_extrude_z("rec_lw_raw", left_xy, -1.40, -0.88, bevel=0.045, bevel_segs=2, mat=m_pk)
    # Machine left clip-latch through-window (X in [-2.85, +0.55], Y in [0.12, 0.82]) + sight ear outer bevel!
    left_wall = bool_subtract(
        left_wall_raw,
        [
            mk_box("c_lw_win", 3.42, 0.72, 0.90, [("t", -1.15, 0.47, -1.14)], m_dk, bevel=0.03),
            mk_box("c_lw_rec", 4.10, 0.84, 0.14, [("t", -1.15, 0.47, -1.42)], m_dk, bevel=0.02),
        ],
        solver="EXACT",
    )

    # 3. Forged Right Receiver Wall (Z in [+0.88, +1.40]) w/ lowered ejection port & bolt/op-rod cutout!
    right_xy = [
        (-8.60, -0.82),
        (-7.60, -1.62),
        (-6.20, -2.26),
        ( 3.85, -2.26),
        ( 5.85, -0.45),
        ( 5.85,  0.74),   # Lowered right op-rod & .30-06 brass-ejection port
        (-4.32,  0.74),
        (-5.05,  1.96),   # Swept rear bridge riser
        (-5.72,  2.46),   # Right rear sight ear
        (-7.18,  2.46),
        (-7.58,  2.14),
        (-8.60,  1.44),
    ]
    right_wall = mk_extrude_z("rec_rw", right_xy, 0.88, 1.40, bevel=0.045, bevel_segs=2, mat=m_pk)

    # 4. Right Outer Op-Rod Guideway Rail (Z = +1.42) w/ bright bare-steel slide-track wear!
    oprod_rail = mk_box("rec_or_rail", 9.85, 0.44, 0.26, [("t", 0.65, 0.56, 1.42)], m_br, bevel=0.03)
    oprod_undercut = mk_box("rec_or_lip", 8.60, 0.16, 0.22, [("t", 0.95, 0.24, 1.42)], m_pk, bevel=0.02)

    # 5. Rounded Rear Safety Bridge (X in [-5.65, -4.42]) w/ underside firing-pin safety tang clearance!
    bridge_raw = mk_box("rec_brg_raw", 1.32, 0.62, 2.38, [("t", -5.04, 1.90, 0.0)], m_pk, bevel=0.055, bevel_segs=2)
    safety_bridge = bool_subtract(
        bridge_raw,
        [mk_box("c_brg_slot", 1.50, 0.28, 0.42, [("t", -5.04, 1.58, 0.0)], m_dk)],
        solver="EXACT",
    )

    # 6. Sloped Springfield Armory Receiver Heel Deck split cleanly at X=-7.34 (rear edge of T105 sight base!)
    #    Exposed Rear Heel Deck (X in [-8.58, -7.34]): dedicated distortion-free Hero Rollmark Canvas!
    heel_rear_xy = [
        (-8.58, 1.06),
        (-7.34, 1.34),
        (-7.34, 1.72),
        (-8.58, 1.46),
    ]
    heel_deck = mk_extrude_z("rec_heel_rear", heel_rear_xy, -1.28, 1.28, bevel=0.03, bevel_segs=2, mat=m_pk)
    heel_under_xy = [
        (-7.36, 1.33),
        (-5.60, 1.72),
        (-5.60, 2.08),
        (-7.36, 1.72),
    ]
    heel_under = mk_extrude_z("rec_heel_fwd", heel_under_xy, -1.26, 1.26, bevel=0.03, bevel_segs=2, mat=m_dk)

    # Rear tang block uniting left & right walls behind trigger housing (X in [-8.55, -6.30])
    rear_tang = mk_box("rec_tang", 2.25, 1.80, 1.88, [("t", -7.42, 0.22, 0.0)], m_dk, bevel=0.04)

    # Front bottom bridge tying left & right walls beneath barrel ring (X in [3.20, 5.75])
    front_floor = mk_box("rec_ffloor", 2.55, 1.15, 2.02, [("t", 4.48, -0.52, 0.0)], m_dk, bevel=0.04)

    # Internal burnished vertical en-bloc clip guide rails (X = -0.95, Z = ±0.84) & locking-lug abutments!
    clip_guide_l = mk_box("rec_cgl", 0.48, 2.86, 0.16, [("t", -0.95, -0.15, -0.84)], m_br, bevel=0.02)
    clip_guide_r = mk_box("rec_cgr", 0.48, 2.86, 0.16, [("t", -0.95, -0.15,  0.84)], m_br, bevel=0.02)
    lug_abut_l = mk_box("rec_abl", 1.15, 0.72, 0.30, [("t", 2.65, 1.16, -0.84)], m_br, bevel=0.025)
    lug_abut_r = mk_box("rec_abr", 1.15, 0.72, 0.30, [("t", 2.65, 1.16,  0.84)], m_br, bevel=0.025)

    # Left-side machined clip-latch pivot ears flanking the left window
    latch_ear_f = mk_box("rec_lef", 0.34, 0.82, 0.18, [("t",  0.72, 0.46, -1.42)], m_dk, bevel=0.02)
    latch_ear_r = mk_box("rec_ler", 0.34, 0.82, 0.18, [("t", -3.02, 0.46, -1.42)], m_dk, bevel=0.02)

    # Rear sight mounting pocket floor between protective sight ears
    sight_floor = mk_box("rec_sflt", 1.95, 0.34, 1.96, [("t", -6.65, 1.98, 0.0)], m_dk, bevel=0.025)

    obj = join_objects(
        [
            front_ring, left_wall, right_wall, oprod_rail, oprod_undercut,
            safety_bridge, heel_deck, heel_under, rear_tang, front_floor,
            clip_guide_l, clip_guide_r, lug_abut_l, lug_abut_r,
            latch_ear_f, latch_ear_r, sight_floor,
        ],
        "garand_receiver",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_rear_sight(mats: dict) -> bpy.types.Object:
    """F-02: T105 Micrometric Aperture Peep Rear Sight w/ true 3D Knurled Elevation & Windage Drums
    (assembledPos: [-6.85, 2.48, 0])."""
    m_pk = mats["R_ParkerizedForged"]
    m_dk = mats["R_ParkerizedDark"]
    m_bs = mats["R_BrightSteel"]

    # Sleek forward-nested sight base (local X in [-0.48, +0.84] -> world X in [-7.33, -6.01])
    # leaving the iconic sloped Springfield heel deck (X in [-8.60, -7.33]) 100% unobstructed!
    sight_base = mk_box("rs_base", 1.32, 0.56, 1.72, [("t", 0.18, -0.18, 0.0)], m_pk, bevel=0.035, bevel_segs=2)
    wind_bar = mk_box("rs_wbar", 0.36, 0.24, 1.80, [("t", -0.36, 0.02, 0.0)], m_dk, bevel=0.02)

    # Hooded Circular `.070"` Aperture Peep Stem (extruded along X + true circular peep bore!)
    peep_zy = [(-0.44, -0.10), (0.44, -0.10), (0.42, 0.54)]
    for k in range(1, 16):
        a = math.pi * (k / 16.0)
        peep_zy.append((0.42 * math.cos(a), 0.54 + 0.42 * math.sin(a)))
    peep_raw = mk_extrude_x("rs_peep_raw", peep_zy, -0.28, 0.28, bevel=0.025, bevel_segs=2, mat=m_dk)
    peep_stem = bool_subtract(
        peep_raw,
        [mk_cyl("c_peep_h", 0.145, 0.145, 0.85, "x", 24, [("t", 0.0, 0.54, 0.0)], m_dk)],
        solver="EXACT",
    )

    # Rear elevation rack teeth on stem
    rack_teeth = [
        mk_box(f"rs_rk_{i}", 0.10, 0.06, 0.34, [("t", -0.31, -0.02 + i * 0.12, 0.0)], m_bs, bevel=0.008)
        for i in range(5)
    ]

    # Bright cross pinion axle shaft
    cross_pinion = mk_cyl("rs_pinion", 0.21, 0.21, 3.06, "z", 24, [("t", 0.0, -0.12, 0.0)], m_bs, bevel=0.02)

    # 3D KNURLED Left Elevation Drum (-Z = -1.28) w/ Hero Flat Range Dial Cap (`2 4 6 8 10 12`)!
    elev_drum = mk_knurled_cyl(
        "rs_elev_knurl", radius=0.56, length=0.40, axis="z", flutes=28, depth=0.024,
        xform=[("t", 0.0, -0.12, -1.26)], mat=m_pk,
    )
    elev_cap = mk_cyl("rs_elev_cap", 0.48, 0.50, 0.08, "z", 32, [("t", 0.0, -0.12, -1.48)], m_dk, bevel=0.015)
    elev_screw = mk_cyl("rs_elev_scr", 0.14, 0.14, 0.06, "z", 16, [("t", 0.0, -0.12, -1.53)], m_bs, bevel=0.01)

    # 3D KNURLED Right Windage Drum (+Z = +1.28) w/ Hero Flat Windage Dial Cap (`L / R`)!
    wind_drum = mk_knurled_cyl(
        "rs_wind_knurl", radius=0.54, length=0.38, axis="z", flutes=28, depth=0.024,
        xform=[("t", 0.0, -0.12, 1.26)], mat=m_pk,
    )
    wind_cap = mk_cyl("rs_wind_cap", 0.46, 0.48, 0.08, "z", 32, [("t", 0.0, -0.12, 1.47)], m_dk, bevel=0.015)
    wind_screw = mk_cyl("rs_wind_scr", 0.14, 0.14, 0.06, "z", 16, [("t", 0.0, -0.12, 1.52)], m_bs, bevel=0.01)

    obj = join_objects(
        [sight_base, wind_bar, peep_stem, *rack_teeth, cross_pinion,
         elev_drum, elev_cap, elev_screw, wind_drum, wind_cap, wind_screw],
        "garand_rear_sight",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_clip_latch(mats: dict) -> bpy.types.Object:
    """M-05: Sculpted Beveled Left-Flank Clip-Latch Thumb Button + Coiled Spring & V-Wire Clip Ejector
    (assembledPos: [-1.15, 0.45, -1.48])."""
    m_pk = mats["R_ParkerizedForged"]
    m_br = mats["R_BurnishedRail"]
    m_bs = mats["R_BrightSteel"]
    m_sp = mats["R_SpringSteel"]

    # Sculpted beveled external thumb-bar lever riding in left receiver pocket
    bar_xy = [
        (-1.82, -0.28), ( 1.80, -0.26), ( 1.82,  0.26),
        (-0.75,  0.32), (-1.65,  0.34), (-1.82,  0.18),
    ]
    thumb_bar = mk_extrude_z("cl_bar", bar_xy, -0.14, 0.14, bevel=0.035, bevel_segs=2, mat=m_pk)

    # Prominent sculpted beveled circular thumb pad w/ tactile horizontal gripping serrations!
    thumb_btn = mk_cyl("cl_btn", 0.34, 0.39, 0.20, "z", 28, [("t", -1.18, 0.04, -0.16)], m_br, bevel=0.035)
    serr = [
        mk_box(f"cl_sr_{i}", 0.50, 0.038, 0.035, [("t", -1.18, -0.16 + i * 0.08, -0.25)], m_pk, bevel=0.006)
        for i in range(5)
    ]

    # Pivot lug & transverse pin
    pivot_pin = mk_cyl("cl_pin", 0.09, 0.09, 0.56, "y", 14, [("t", 0.15, 0.0, 0.06)], m_bs, bevel=0.01)

    # Internal forged clip-retaining hook reaching +Z into receiver clip well
    hook_xy = [(-0.28, -0.24), (0.34, -0.24), (0.42, 0.16), (0.12, 0.24), (-0.28, 0.22)]
    clip_hook = mk_extrude_z("cl_hook", hook_xy, 0.10, 0.92, bevel=0.025, bevel_segs=2,
                             xform=[("t", 0.16, -0.02, 0.0)], mat=m_bs)

    # Helical clip-latch compression spring (static on rigid rotating latch)
    latch_spring = mk_coil_spring(
        "cl_spr", "x", 0.72, 1.76, -0.04, 0.24, 0.135, 0.026, 8, ring_segs=8, steps_per_coil=12, mat=m_sp
    )

    # Iconic WWII V-wire clip ejector spring reaching under the en-bloc clip floor!
    v_pts = [
        Vector((-2.14, -1.94, 0.96)),
        Vector((-1.78, -2.02, 1.24)),
        Vector((-1.32, -2.04, 1.38)),
        Vector((-0.45, -1.96, 1.46)),
        Vector(( 0.25, -1.88, 1.48)),
        Vector(( 0.85, -1.93, 1.38)),
        Vector(( 1.15, -1.96, 1.25)),
    ]
    v_wire = mk_tube_along_pts("cl_vwire", v_pts, 0.056, ring_segs=10, mat=m_sp)

    obj = join_objects([thumb_bar, thumb_btn, *serr, pivot_pin, clip_hook, latch_spring, v_wire], "garand_clip_latch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_trigger_housing(mats: dict) -> bpy.types.Object:
    """FC-01: Quick-Detach Milled Steel Trigger Housing + Iconic Front-of-Trigger Winter Safety Lever
    (assembledPos: [-4.60, -2.55, 0])."""
    m_pk = mats["R_ParkerizedForged"]
    m_dk = mats["R_ParkerizedDark"]
    m_br = mats["R_BurnishedRail"]
    m_bs = mats["R_BrightSteel"]

    # Forged milled left & right side walls w/ lightening cutouts (leaving open interior for hammer + CSG spring!)
    plate_xy = [
        (-3.75, -1.55), ( 3.85, -1.55), ( 3.98,  0.65),
        ( 3.25,  1.38), ( 1.65,  1.38), ( 1.15,  0.55),
        (-1.85,  0.55), (-2.45,  1.28), (-3.75,  1.15),
    ]
    lw_raw = mk_extrude_z("th_lw_raw", plate_xy, -0.82, -0.54, bevel=0.028, bevel_segs=2, mat=m_pk)
    rw_raw = mk_extrude_z("th_rw_raw", plate_xy,  0.54,  0.82, bevel=0.028, bevel_segs=2, mat=m_pk)
    lw = bool_subtract(lw_raw, [mk_box("c_thl", 2.28, 1.08, 0.50, [("t", -0.20, -0.40, -0.68)], m_dk, bevel=0.04)])
    rw = bool_subtract(rw_raw, [mk_box("c_thr", 2.28, 1.08, 0.50, [("t", -0.20, -0.40,  0.68)], m_dk, bevel=0.04)])

    # Front & rear bottom bridge decks (leaving central trigger slot open!)
    bot_front = mk_box("th_bf", 1.88, 0.36, 1.56, [("t",  2.65, -1.38, 0.0)], m_dk, bevel=0.03)
    bot_rear  = mk_box("th_br", 1.58, 0.36, 1.56, [("t", -2.92, -1.38, 0.0)], m_dk, bevel=0.03)
    # Rear hammer-spring guide backplate (behind CSG hammer spring local X=-1.74 -> housing X=-3.49)
    rear_cap  = mk_box("th_rc", 0.32, 1.38, 1.34, [("t", -3.58, -0.20, 0.0)], m_pk, bevel=0.025)

    # Twin receiver locking studs protruding ±Z
    lock_l = mk_cyl("th_lkl", 0.22, 0.22, 0.26, "z", 20, [("t", 2.55, 0.92, -0.88)], m_br, bevel=0.02)
    lock_r = mk_cyl("th_lkr", 0.22, 0.22, 0.26, "z", 20, [("t", 2.55, 0.92,  0.88)], m_br, bevel=0.02)

    # Iconic M1 Garand Pivoting Front-of-Trigger Winter Safety Lever!
    # Swept curved finger paddle reaching down into front of trigger bow for gloved finger push-to-fire!
    saf_xy = [
        (-0.24,  0.34), ( 0.34,  0.34),
        ( 0.48, -0.35), ( 0.62, -0.92),
        ( 0.56, -1.34), ( 0.24, -1.44),
        (-0.14, -1.28), (-0.18, -0.78),
        (-0.24,  0.34),
    ]
    safety_lever = mk_extrude_z("th_saf", saf_xy, -0.20, 0.20, bevel=0.032, bevel_segs=2,
                                xform=[("t", 2.04, -1.14, 0.0)], mat=m_br)
    # Subtle tactile serrations on safety paddle front face
    saf_serr = [
        mk_box(f"th_ss_{i}", 0.06, 0.06, 0.32, [("t", 2.58 - i * 0.03, -2.08 + i * 0.14, 0.0)], m_pk, bevel=0.008)
        for i in range(4)
    ]

    # Bright cross pins (hammer pin & trigger pin)
    ham_pin = mk_cyl("th_hpin", 0.16, 0.16, 1.78, "z", 20, [("t", -0.35,  0.88, 0.0)], m_bs, bevel=0.02)
    trg_pin = mk_cyl("th_tpin", 0.14, 0.14, 1.78, "z", 20, [("t", -0.95, -0.68, 0.0)], m_bs, bevel=0.02)

    obj = join_objects(
        [lw, rw, bot_front, bot_rear, rear_cap, lock_l, lock_r, safety_lever, *saf_serr, ham_pin, trg_pin],
        "garand_trigger_housing",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_trigger_guard(mats: dict) -> bpy.types.Object:
    """FC-02: Swept Curved Forged/Stamped Steel Winter Trigger Guard w/ Rear Takedown Finger Loop & Twin Cam Lugs
    (assembledPos: [-4.50, -4.35, 0])."""
    m_pk = mats["R_ParkerizedForged"]
    m_br = mats["R_BurnishedRail"]

    # Upper milled trigger-guard plate (with crisp beveled edges and central trigger clearance cut!)
    upper_raw = mk_box("tg_up_raw", 5.42, 0.34, 0.88, [("t", -0.08, 0.22, 0.0)], m_pk, bevel=0.035, bevel_segs=2)
    upper_bar = bool_subtract(
        upper_raw,
        [mk_box("c_tg_slot", 2.45, 0.56, 0.52, [("t", -0.85, 0.22, 0.0)], m_pk)],
        solver="EXACT",
    )

    # Iconic Swept Curved Flattened-Strap Winter Trigger Guard Bow + Rear Takedown Finger Hook!
    # Swept with flattened strap cross-section (`ellip_scale=(0.56, 1.38)`) for authentic stamped/forged M1 bow!
    bow_ctrl = [
        Vector((-3.34,  0.32, 0.0)),   # Rear takedown finger-hook tip!
        Vector((-3.38,  0.04, 0.0)),
        Vector((-3.12, -0.10, 0.0)),   # Rounded hook belly
        Vector((-2.62,  0.04, 0.0)),
        Vector((-2.16,  0.06, 0.0)),
        Vector((-1.92, -0.44, 0.0)),
        Vector((-1.68, -0.92, 0.0)),
        Vector((-1.24, -1.24, 0.0)),
        Vector((-0.62, -1.38, 0.0)),
        Vector(( 0.15, -1.40, 0.0)),   # Generous winter-glove bow floor
        Vector(( 0.88, -1.32, 0.0)),
        Vector(( 1.46, -1.06, 0.0)),
        Vector(( 1.88, -0.66, 0.0)),
        Vector(( 2.12, -0.18, 0.0)),
        Vector(( 2.24,  0.22, 0.0)),
    ]
    bow_strap = mk_tube_along_pts(
        "tg_bow", bow_ctrl, radius=0.22, ring_segs=18, ellip_scale=(0.56, 1.38), mat=m_pk
    )

    # Twin upper camming locking lugs w/ machined cam ramps & locking pins
    lug_xy = [(-0.34, -0.58), (0.34, -0.58), (0.34, 0.36), (0.12, 0.60), (-0.28, 0.54), (-0.34, 0.18)]
    lug_l = mk_extrude_z("tg_lug_l", lug_xy, -0.60, -0.34, bevel=0.025, bevel_segs=2,
                         xform=[("t", 2.40, 0.80, 0.0)], mat=m_br)
    lug_r = mk_extrude_z("tg_lug_r", lug_xy,  0.34,  0.60, bevel=0.025, bevel_segs=2,
                         xform=[("t", 2.40, 0.80, 0.0)], mat=m_br)

    obj = join_objects([upper_bar, bow_strap, lug_l, lug_r], "garand_trigger_guard")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_enbloc_clip(mats: dict) -> bpy.types.Object:
    """M-01: Iconic WWII Darker Blued Spring-Steel 8-Round En-Bloc Clip ("PING!")
    (assembledPos: [-0.95, -0.15, 0]).
    Symmetrical top/bottom curled retaining lips, open bottom follower slot, stamped back spine,
    raised external lateral clip-latch engagement bosses & vertical stiffening ribs!"""
    m_ec = mats["R_EnBlocBlued"]
    m_br = mats["R_BurnishedRail"]

    # Symmetrical stamped spring-steel left & right U-walls with gracefully curled top/bottom retaining lips!
    left_zy = [
        (-0.34, -1.48), (-0.48, -1.48), (-0.68, -1.32),
        (-0.70, -0.90), (-0.70,  0.90), (-0.68,  1.32),
        (-0.48,  1.48), (-0.34,  1.46), (-0.34,  1.36),
        (-0.46,  1.36), (-0.58,  1.22), (-0.58, -1.22),
        (-0.46, -1.36), (-0.34, -1.36),
    ]
    right_zy = [(-z, y) for (z, y) in reversed(left_zy)]

    wall_l = mk_extrude_x("ec_wl", left_zy, -3.15, 2.25, bevel=0.015, bevel_segs=2, mat=m_ec)
    wall_r = mk_extrude_x("ec_wr", right_zy, -3.15, 2.25, bevel=0.015, bevel_segs=2, mat=m_ec)

    # Stamped rear spine uniting left & right spring-steel walls (carries Hero `SA` stamp!)
    back_wall = mk_box("ec_back", 0.16, 2.88, 1.38, [("t", -3.12, 0.0, 0.0)], m_ec, bevel=0.02)

    # Raised stamped lateral clip-latch bosses & vertical stiffening ribs on ±Z flanks!
    boss_l = mk_box("ec_bl", 0.68, 0.76, 0.09, [("t", -0.22, 0.42, -0.73)], m_br, bevel=0.018)
    boss_r = mk_box("ec_br", 0.68, 0.76, 0.09, [("t", -0.22, 0.42,  0.73)], m_br, bevel=0.018)
    rib_l  = mk_box("ec_rl", 0.28, 2.58, 0.08, [("t", -2.62, 0.00, -0.73)], m_ec, bevel=0.015)
    rib_r  = mk_box("ec_rr", 0.28, 2.58, 0.08, [("t", -2.62, 0.00,  0.73)], m_ec, bevel=0.015)
    rib_fl = mk_box("ec_rfl", 0.24, 2.48, 0.07, [("t",  1.52, 0.00, -0.73)], m_ec, bevel=0.014)
    rib_fr = mk_box("ec_rfr", 0.24, 2.48, 0.07, [("t",  1.52, 0.00,  0.73)], m_ec, bevel=0.014)

    obj = join_objects([wall_l, wall_r, back_wall, boss_l, boss_r, rib_l, rib_r, rib_fl, rib_fr], "garand_enbloc_clip")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


# --- GROUP C: 24" BARREL, GAS CYLINDER, OP-ROD, BOLT, BUTTPLATE & INTERNALS (15 PARTS) ---

def build_garand_barrel(mats: dict) -> bpy.types.Object:
    """B-01: 24-Inch (61.0 cm) .30-06 Springfield Stepped 4-Groove Rifled Barrel
    (assembledPos: [0, 1.15, 0], local X in [2.00, 63.00]).
    Features hollow .30-06 bottleneck chamber, 4 right-hand 1:10" helical rifling lands,
    11-deg recessed target crown, 3 longitudinal muzzle gas-cylinder splines, breech index cut & gas port!"""
    m_br = mats["M_ParkerizedBarrel"]
    m_ws = mats["M_WhiteStainless"]
    m_bs = mats["M_BurnishedSteel"]
    m_cb = mats["M_BoreCarbon"]

    crown_rim = 0.56
    crown_bore = 0.39
    crown_depth = 0.045

    barrel_body = mk_lathe_x(
        "brl_body",
        [
            (0.62,  2.00),  # Chamfered .30-06 chamber mouth
            (1.12,  2.00),  # Heavy breech face inside receiver ring
            (1.12,  6.25),  # Receiver thread shank
            (1.06,  6.40),  # Receiver shoulder step
            (1.04, 10.80),  # Heavy chamber reinforce cylinder
            (0.95, 11.40),  # Rear taper step
            (0.86, 29.85),  # Tapered rear contour under rear handguard
            (0.81, 30.00),  # Lower-band journal step
            (0.81, 31.35),
            (0.78, 31.50),  # Forward contour under front handguard
            (0.72, 54.60),
            (0.68, 54.75),  # 3-spline gas-cylinder seat journal
            (0.68, 61.42),
            (0.62, 61.48),  # Threaded muzzle lock spigot
            (0.62, 62.93),
            (crown_rim, 63.00),                  # Target crown outer bevel
            (crown_bore, 63.00 - crown_depth),   # Recessed 11-deg target crown dish
            (0.381, 62.92),  # Ø7.62mm (.308") rifled bore
            (0.381,  8.45),  # Rifled bore throat
            (0.425,  8.33),  # .30-06 case neck
            (0.425,  7.65),
            (0.575,  7.15),  # 17°30' .30-06 bottleneck shoulder
            (0.600,  2.08),  # 63.3mm .30-06 case body wall
            (0.620,  2.00),  # Closes watertight hollow loop
        ],
        segs=48,
        mat=m_br,
    )

    # Assign subtle dark bore carbon & bright chamber face materials onto interior bore faces
    bm = bmesh.new()
    bm.from_mesh(barrel_body.data)
    barrel_body.data.materials.append(m_cb)
    barrel_body.data.materials.append(m_ws)
    idx_cb = len(barrel_body.data.materials) - 2
    idx_ws = len(barrel_body.data.materials) - 1
    for f in bm.faces:
        c = f.calc_center_median()
        r_c = math.hypot(c.y, c.z)
        if r_c < 0.61 and 2.02 < c.x < 62.90:
            f.material_index = idx_cb
        elif c.x >= 62.92 and r_c <= 0.57:
            f.material_index = idx_ws
    bm.to_mesh(barrel_body.data)
    bm.free()

    # 4 right-hand 1:10" (25.4 cm) Springfield Armory helical rifling lands inside Ø7.62mm bore!
    rifling = mk_helical_lands(
        "brl_rif", count=4, bore_r=0.381, depth=0.018, width=0.068,
        x0=8.55, x1=62.88, twist_cm=25.4, segs_x=44, mat=m_ws,
    )

    # 3 crisp longitudinal muzzle splines (X in [55.20, 61.35]) keying garand_gas_cylinder!
    splines = mk_helical_lands(
        "brl_spl", count=3, bore_r=0.725, depth=0.045, width=0.145,
        x0=55.20, x1=61.35, twist_cm=1e9, segs_x=4, mat=m_bs,
    )

    # Muzzle lock threads relief rings (X in [61.55, 62.35])
    thr_rings = [
        mk_cyl(f"brl_thr_{i}", 0.635, 0.635, 0.06, "x", 32, [("t", 61.58 + i * 0.13, 0.0, 0.0)], m_bs, bevel=0.01)
        for i in range(6)
    ]

    # Breech extractor-cut collar & bottom muzzle gas-port transfer boss (X = 59.60)
    breech_lug = mk_box("brl_blug", 0.60, 0.34, 0.48, [("t", 2.32, 0.88, 0.56)], m_ws, bevel=0.025)
    gas_port_boss = mk_cyl("brl_gport", 0.23, 0.23, 0.30, "y", 20, [("t", 59.60, -0.72, 0.0)], m_cb, bevel=0.02)

    obj = join_objects([barrel_body, *rifling, *splines, *thr_rings, breech_lug, gas_port_boss], "garand_barrel")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_gas_cylinder(mats: dict) -> bpy.types.Object:
    """B-02: Blackened 410 Stainless Muzzle Gas Cylinder w/ M1 Bayonet T-Lug, Front Sight Dovetail & Stacking Swivel
    (assembledPos: [58.40, 0.25, 0])."""
    m_gs = mats["M_GasStainless"]
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    # Front & rear upper barrel spline rings (local Y = +0.90 -> world Y = +1.15)
    upper_ring = mk_lathe_x(
        "gc_uring",
        [
            (0.72, -3.15), (0.94, -3.15), (0.95, -3.05),
            (0.95,  2.95), (0.92,  3.02), (0.72,  3.02), (0.72, -3.15),
        ],
        segs=36, xform=[("t", 0.0, 0.90, 0.0)], mat=m_gs,
    )
    rear_ring = mk_lathe_x(
        "gc_rring",
        [
            (0.73, -3.80), (0.93, -3.80), (0.94, -3.72),
            (0.94, -3.40), (0.92, -3.34), (0.73, -3.34), (0.73, -3.80),
        ],
        segs=34, xform=[("t", 0.0, 0.90, 0.0)], mat=m_gs,
    )

    # Lower gas expansion tube (local Y = -0.60 -> world Y = -0.35; bore R=0.67 clears piston R=0.65!)
    lower_tube = mk_lathe_x(
        "gc_ltube",
        [
            (0.67, -3.80), (0.91, -3.80), (0.93, -3.68),
            (0.94, -2.20), (0.95,  2.96), (0.91,  3.05),
            (0.67,  3.05), (0.67, -3.80),
        ],
        segs=36, xform=[("t", 0.0, -0.60, 0.0)], mat=m_gs,
    )

    # Sculpted pinched-waist vertical gas-transfer bridge web (curved hourglass cross-section!)
    web_zy = [
        (-0.74, -0.50), (-0.48,  0.15), (-0.74,  0.80),
        ( 0.74,  0.80), ( 0.48,  0.15), ( 0.74, -0.50),
    ]
    mid_web = mk_extrude_x("gc_web", web_zy, -3.05, 2.85, bevel=0.04, bevel_segs=2, mat=m_gs)

    # Top milled front-sight dovetail boss
    dovetail_zy = [(-0.56, 1.72), (0.56, 1.72), (0.46, 2.12), (-0.46, 2.12)]
    sight_boss = mk_extrude_x("gc_sboss", dovetail_zy, 0.22, 2.08, bevel=0.025, bevel_segs=2, mat=m_pk)

    # Authentic M1 / M1905 Bayonet T-Lug w/ beveled side locking rails (local X in [-2.85, -1.42])
    bayo_stem = mk_box("gc_bstem", 1.40, 0.38, 0.40, [("t", -2.14, -1.56, 0.0)], m_bs, bevel=0.025)
    bayo_zy = [(-0.34, -1.85), (0.34, -1.85), (0.36, -1.68), (0.20, -1.62), (-0.20, -1.62), (-0.36, -1.68)]
    bayo_t = mk_extrude_x("gc_btlug", bayo_zy, -2.86, -1.42, bevel=0.02, bevel_segs=2, mat=m_ws)

    # Forward 3-rifle stacking swivel ears, slotted screw & smooth 24-pt curved U-loop!
    sw_ears = mk_box("gc_swear", 1.06, 0.60, 0.76, [("t", 0.76, -1.65, 0.0)], m_gs, bevel=0.04, bevel_segs=2)
    sw_screw = mk_cyl("gc_swscr", 0.14, 0.14, 0.90, "z", 16, [("t", 0.76, -1.78, 0.0)], m_ws, bevel=0.018)
    sw_pts = []
    for k in range(25):
        a = -math.pi * 0.5 + math.pi * (k / 24.0)
        ca, sa = math.cos(a), math.sin(a)
        px = 0.76 - 0.41 * (ca ** 0.85)
        py = -1.78 - 1.06 * (ca ** 0.85)
        pz = 0.44 * sa + 0.12 * sa * ca
        sw_pts.append(Vector((px, py, pz)))
    sw_loop = mk_tube_along_pts("gc_swloop", sw_pts, 0.088, ring_segs=14, mat=m_bs)

    obj = join_objects(
        [upper_ring, rear_ring, lower_tube, mid_web, sight_boss, bayo_stem, bayo_t, sw_ears, sw_screw, sw_loop],
        "garand_gas_cylinder",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_gas_lock_screw(mats: dict) -> bpy.types.Object:
    """B-03: Sculpted Figure-8 Gas Cylinder Lock & Slotted Cross-Valve Grenade Lock Screw
    (assembledPos: [61.85, 0.38, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_ws = mats["M_WhiteStainless"]
    m_bs = mats["M_BurnishedSteel"]

    # Upper barrel-muzzle thread collar & lower gas-plug collar
    upper_col = mk_lathe_x(
        "gl_ucol",
        [(0.63, -0.42), (0.88, -0.42), (0.89, -0.36), (0.89, 0.18), (0.86, 0.24), (0.63, 0.24), (0.63, -0.42)],
        segs=32, xform=[("t", 0.0, 0.77, 0.0)], mat=m_pk,
    )
    lower_col = mk_lathe_x(
        "gl_lcol",
        [(0.52, -0.42), (0.85, -0.42), (0.86, -0.36), (0.86, 0.18), (0.83, 0.24), (0.52, 0.24), (0.52, -0.42)],
        segs=32, xform=[("t", 0.0, -0.73, 0.0)], mat=m_pk,
    )
    # Curved pinched figure-8 waist joining the two rings smoothly
    waist_zy = [
        (-0.72, -0.68), (-0.54,  0.02), (-0.74,  0.72),
        ( 0.74,  0.72), ( 0.54,  0.02), ( 0.72, -0.68),
    ]
    fig8_waist = mk_extrude_x("gl_waist", waist_zy, -0.41, 0.23, bevel=0.03, bevel_segs=2, mat=m_pk)

    # Bright stainless gas cylinder lock plug screw w/ true recessed WWII cross-slot & center poppet grenade valve!
    plug_raw = mk_lathe_x(
        "gl_plug_raw",
        [
            (0.00, -0.55), (0.51, -0.52), (0.51, 0.24),
            (0.68,  0.28), (0.68,  0.56), (0.62, 0.62), (0.00, 0.62),
        ],
        segs=32, xform=[("t", 0.0, -0.73, 0.0)], mat=m_ws,
    )
    # Cut genuine crisp WWII crossed screwdriver slot (+Y/+Z) + recessed central grenade poppet bore!
    plug = bool_subtract(
        plug_raw,
        [
            mk_box("c_gl_sv", 0.34, 1.48, 0.17, [("t", 0.58, -0.73, 0.0)], m_bs),
            mk_box("c_gl_sh", 0.34, 0.17, 1.48, [("t", 0.58, -0.73, 0.0)], m_bs),
        ],
        solver="EXACT",
    )
    # Central spring-loaded M7 grenade launcher poppet valve button inside cross intersection!
    poppet = mk_cyl("gl_poppet", 0.14, 0.16, 0.16, "x", 20, [("t", 0.48, -0.73, 0.0)], m_bs, bevel=0.02)

    obj = join_objects([upper_col, lower_col, fig8_waist, plug, poppet], "garand_gas_lock_screw")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_front_sight(mats: dict) -> bpy.types.Object:
    """B-04: Sculpted Dovetail Winged Blade Front Sight w/ Flared Protective Ears & Hex Clamp Screw
    (assembledPos: [59.55, 2.38, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_ws = mats["M_WhiteStainless"]

    # Gracefully curved slender flared protective ears + tapered .062" front sight post!
    sight_zy = [
        (-0.48, -0.32), ( 0.48, -0.32),
        ( 0.42, -0.06),
        ( 0.56,  0.18), ( 0.64,  0.42), ( 0.58,  0.54), ( 0.49,  0.52),
        ( 0.42,  0.22), ( 0.30,  0.02),
        ( 0.065, 0.02), ( 0.045, 0.50), (-0.045, 0.50), (-0.065, 0.02),
        (-0.30,  0.02), (-0.42,  0.22),
        (-0.49,  0.52), (-0.58,  0.54), (-0.64,  0.42), (-0.56,  0.18),
        (-0.42, -0.06),
    ]
    sight_raw = mk_extrude_x("fs_raw", sight_zy, -0.68, 0.68, bevel=0.022, bevel_segs=2, mat=m_pk)

    # Streamlined angled front/rear taper cuts on protective wings so they look genuinely forged, not extruded slabs!
    sight_body = bool_subtract(
        sight_raw,
        [
            mk_box("c_fs_f", 0.55, 0.70, 1.50, [("rz",  0.48), ("t",  0.72, 0.48, 0.0)], m_pk),
            mk_box("c_fs_r", 0.55, 0.70, 1.50, [("rz", -0.48), ("t", -0.72, 0.48, 0.0)], m_pk),
        ],
        solver="EXACT",
    )
    clamp_screw = mk_cyl("fs_scr", 0.125, 0.125, 1.06, "z", 16, [("t", 0.14, -0.18, 0.0)], m_ws, bevel=0.015)

    obj = join_objects([sight_body, clamp_screw], "garand_front_sight")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_op_rod(mats: dict) -> bpy.types.Object:
    """B-05: Iconic WWII Curved S-Bent Long-Stroke Operating Rod w/ Centerless-Ground White Stainless Piston,
    Arched 32-deg Helical Cam Hump & Swept Ergonomic Charging Handle (assembledPos: [28.00, 0.15, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_ws = mats["M_WhiteStainless"]
    m_bs = mats["M_BurnishedSteel"]

    # 1. Centerless-ground bright white 410 stainless labyrinth gas piston head (local X in [29.50, 31.25], Y=-0.50)
    piston = mk_lathe_x(
        "or_piston",
        [
            (0.00, 29.50), (0.44, 29.55), (0.44, 30.25),
            (0.645, 30.32), (0.645, 30.58),
            (0.585, 30.61), (0.585, 30.71),  # Labyrinth gas-seal groove 1
            (0.645, 30.74), (0.645, 30.94),
            (0.585, 30.97), (0.585, 31.06),  # Labyrinth gas-seal groove 2
            (0.645, 31.09), (0.645, 31.25),
            (0.280, 31.25), (0.00,  31.14),  # Concave gas-cup face
        ],
        segs=32, xform=[("t", 0.0, -0.50, 0.0)], mat=m_ws,
    )

    # 2. Hollow forward parkerized operating-rod tube (inner R=0.43 clears CSG op-rod spring R=0.416!)
    fwd_tube = mk_lathe_x(
        "or_ftube",
        [
            (0.43, -11.20), (0.545, -11.20), (0.545, 24.50),
            (0.485, 25.20), (0.485, 29.55), (0.43, 29.55), (0.43, -11.20),
        ],
        segs=32, xform=[("t", 0.0, -0.50, 0.0)], mat=m_pk,
    )

    # 3. Signature Garand 3D S-Bend Rod sweeping organically from under barrel out to right receiver rail!
    s_pts = []
    n_bend = 28
    for i in range(n_bend + 1):
        u = i / n_bend
        s = u * u * (3.0 - 2.0 * u)
        x = -11.10 - u * 11.40
        y = -0.50 + s * 1.28
        z = s * 1.16
        s_pts.append(Vector((x, y, z)))
    s_bend = mk_tube_along_pts("or_sbend", s_pts, radius=lambda u: 0.49 - u * 0.09, ring_segs=22, mat=m_pk)

    # Underside op-rod catch engagement lug
    catch_lug = mk_box("or_clug", 1.16, 0.42, 0.44, [("t", -22.15, 0.36, 0.96)], m_bs, bevel=0.03)

    # 4. Iconic Arched Cam Hump riding over bolt operating lug (local X in [-27.65, -22.15])
    hump_xy = [(-27.65, 0.48), (-22.15, 0.48), (-22.15, 1.18)]
    hump_xy += _quad_bez((-22.15, 1.18), (-24.15, 1.80), (-25.85, 1.72), 10)
    hump_xy.append((-27.65, 1.15))
    hump_raw = mk_extrude_z("or_hump_raw", hump_xy, 1.22, 1.74, bevel=0.04, bevel_segs=2, mat=m_pk)

    # Cut genuine 4 mm dwell + 32-deg angled helical cam track slot into inner/side hump!
    slot_xy = [
        (-26.85, 0.78), (-25.95, 0.78), (-24.35, 1.26), (-23.62, 1.26),
        (-23.62, 0.96), (-24.45, 0.96), (-25.85, 0.56), (-26.85, 0.56),
    ]
    cam_hump = bool_subtract(
        hump_raw,
        [mk_extrude_z("c_or_cam", slot_xy, 1.05, 1.66, mat=m_bs)],
        solver="EXACT",
    )

    # 5. Swept Contoured Iconic Garand Charging Handle (curved neck + upturned ergonomic finger-hook paddle!)
    neck_pts = [
        Vector((-26.20, 0.96, 1.58)),
        Vector((-26.38, 0.98, 1.78)),
        Vector((-26.58, 1.04, 1.98)),
        Vector((-26.75, 1.10, 2.12)),
    ]
    handle_neck = mk_tube_along_pts("or_hneck", neck_pts, radius=0.20, ring_segs=16, ellip_scale=(0.82, 1.25), mat=m_pk)

    # Swept ergonomic charging paddle wing centered at origin BEFORE rx tilt so it sits proudly at Z=+2.10!
    paddle_xy = [
        (-0.92, -0.34), ( 0.62, -0.38), ( 0.92, -0.16),
        ( 0.88,  0.22), ( 0.42,  0.38), (-0.52,  0.34), (-0.94,  0.04),
    ]
    handle_paddle = mk_extrude_z(
        "or_hpaddle", paddle_xy, -0.18, 0.18, bevel=0.055, bevel_segs=2,
        xform=[("rx", -0.22), ("t", -26.68, 1.12, 2.08)], mat=m_bs,
    )

    obj = join_objects([piston, fwd_tube, s_bend, catch_lug, cam_hump, handle_neck, handle_paddle], "garand_op_rod")
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_garand_bolt(mats: dict) -> bpy.types.Object:
    """B-06: Forged 2-Lug Rotating Breech Bolt w/ Recessed .30-06 Bolt Face & Right Operating Cam Lug
    (assembledPos: [-0.65, 1.15, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    bolt_body = mk_lathe_x(
        "blt_body",
        [
            (0.145, -3.80), (0.68, -3.80), (0.71, -3.65),
            (0.71,  1.82), (0.66,  1.88), (0.66,  2.62),
            (0.62,  2.65), (0.54,  2.65), (0.54,  2.48),  # Recessed .30-06 cartridge head cup
            (0.145, 2.48), (0.145, -3.80),               # Coaxial firing-pin channel
        ],
        segs=36, mat=m_pk,
    )

    # Heavy forged left (-Z) & right (+Z) rotating locking lugs w/ burnished bearing faces!
    lug_l = mk_box("blt_llug", 0.76, 0.66, 0.46, [("t", 2.22, 0.04, -0.78)], m_bs, bevel=0.045, bevel_segs=2)
    lug_r = mk_box("blt_rlug", 0.76, 0.66, 0.52, [("t", 2.22, 0.04,  0.81)], m_bs, bevel=0.045, bevel_segs=2)

    # Bright machined cylindrical operating lug seating cleanly inside garand_op_rod cam slot (Z <= 1.42)!
    op_lug = mk_cyl("blt_oplug", 0.21, 0.22, 0.44, "z", 24, [("t", 2.28, 0.06, 1.20)], m_ws, bevel=0.028)

    # Underside cartridge-stripping rib, top raceway wear pad & rear hammer-cocking cam collar
    strip_rib = mk_box("blt_srib", 4.62, 0.34, 0.44, [("t",  0.15, -0.72, 0.0)], m_pk, bevel=0.035)
    top_pad   = mk_box("blt_tpad", 2.45, 0.18, 0.76, [("t", -1.85,  0.68, 0.0)], m_bs, bevel=0.03)
    rear_col  = mk_box("blt_rcol", 0.74, 0.84, 0.82, [("t", -3.42, -0.18, 0.0)], m_pk, bevel=0.04)

    obj = join_objects([bolt_body, lug_l, lug_r, op_lug, strip_rib, top_pad, rear_col], "garand_bolt")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_firing_pin(mats: dict) -> bpy.types.Object:
    """B-07: Long Tang-Blocked Firing Pin, Forged Claw Extractor & Spring Plunger Ejector
    (assembledPos: [-0.85, 1.15, 0])."""
    m_ws = mats["M_WhiteStainless"]
    m_bs = mats["M_BurnishedSteel"]
    m_pk = mats["M_ParkerizedSteel"]

    pin_shaft = mk_lathe_x(
        "fp_shaft",
        [
            (0.00, -3.65), (0.13, -3.62), (0.13, -1.20),
            (0.11, -1.15), (0.11,  2.15), (0.075, 2.45),
            (0.042, 2.82), (0.00,  2.86),
        ],
        segs=24, mat=m_ws,
    )
    # Iconic Garand rear safety tang (blocked by receiver bridge unless bolt is 100% rotated locked!)
    tang_xy = [(-3.76, -0.90), (-3.22, -0.84), (-3.18, 0.04), (-3.76, 0.08)]
    safety_tang = mk_extrude_z("fp_tang", tang_xy, -0.12, 0.12, bevel=0.025, bevel_segs=2, mat=m_ws)
    anvil_pad = mk_box("fp_anvil", 0.28, 0.64, 0.34, [("t", -3.68, -0.32, 0.0)], m_bs, bevel=0.025)

    # Forged claw extractor (+Z) & spring-loaded cylindrical ejector plunger (-Z upper)
    ext_body = mk_box("fp_extb", 1.28, 0.24, 0.18, [("t", 2.15, 0.04, 0.52)], m_pk, bevel=0.02)
    ext_hook = mk_box("fp_exth", 0.20, 0.28, 0.22, [("t", 2.77, 0.04, 0.45)], m_ws, bevel=0.02)
    ejector  = mk_cyl("fp_ejec", 0.065, 0.065, 1.18, "x", 16, [("t", 2.26, 0.16, -0.26)], m_bs, bevel=0.014)

    obj = join_objects([pin_shaft, safety_tang, anvil_pad, ext_body, ext_hook, ejector], "garand_firing_pin")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_lower_band(mats: dict) -> bpy.types.Object:
    """F-06: Contoured Arch Lower Barrel/Handguard Retaining Band & M1907 Front Sling Swivel
    (assembledPos: [30.65, 0.45, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    # Sculpted continuous curved-flank figure-8 lower barrel band (no boxy straps!)
    n_arc = 14
    outer_zy = []
    # Top semicircular arch centered at Y=+0.70, R=1.34
    for k in range(n_arc + 1):
        a = math.pi * (k / n_arc)
        outer_zy.append((1.34 * math.cos(a), 0.70 + 1.24 * math.sin(a)))
    # Smooth curved left flank down to lower swivel boss
    outer_zy.extend([(-1.42, -0.15), (-1.28, -1.15), (-0.76, -1.68), (0.76, -1.68), (1.28, -1.15), (1.42, -0.15)])
    band_raw = mk_extrude_x("lb_raw", outer_zy, -0.68, 0.68, bevel=0.045, bevel_segs=2, mat=m_pk)

    # Bore clean coaxial upper barrel passage (Y=+0.70, R=0.84) & lower op-rod passage (Y=-0.80, R=0.59)!
    band_body = bool_subtract(
        band_raw,
        [
            mk_cyl("c_lb_brl", 0.84, 0.84, 1.80, "x", 32, [("t", 0.0,  0.70, 0.0)], m_pk),
            mk_cyl("c_lb_opr", 0.59, 0.59, 1.80, "x", 28, [("t", 0.0, -0.80, 0.0)], m_pk),
        ],
        solver="EXACT",
    )

    sw_ears  = mk_box("lb_ears", 1.18, 0.48, 1.28, [("t", 0.0, -1.62, 0.0)], m_pk, bevel=0.035)
    roll_pin = mk_cyl("lb_pin", 0.11, 0.11, 3.04, "z", 16, [("t", 0.0, -0.05, 0.0)], m_ws, bevel=0.015)
    sw_pin   = mk_cyl("lb_swp", 0.10, 0.10, 1.46, "z", 14, [("t", 0.0, -1.66, 0.0)], m_ws, bevel=0.012)
    sw_pts = []
    for k in range(25):
        a = -math.pi * 0.5 + math.pi * (k / 24.0)
        ca, sa = math.cos(a), math.sin(a)
        px = -0.35 * (ca ** 0.85)
        py = -1.66 - 1.02 * (ca ** 0.85)
        pz = 0.62 * sa + 0.14 * sa * ca
        sw_pts.append(Vector((px, py, pz)))
    sw_loop = mk_tube_along_pts("lb_swloop", sw_pts, 0.090, ring_segs=14, mat=m_bs)

    obj = join_objects([band_body, sw_ears, roll_pin, sw_pin, sw_loop], "garand_lower_band")
    return finish_part(obj, bevel_w=0.0, sharp_deg=36.0)


def build_garand_buttplate(mats: dict) -> bpy.types.Object:
    """F-07: Organically Contoured Checkered Steel Buttplate w/ Hinged Circular M10 Trapdoor & Slotted Screws
    (assembledPos: [-46.95, -6.10, 0]) — matches sculpted walnut buttstock cross-section 1:1!"""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    # Base oval ring matching sculpted walnut buttstock at X=-46.58 (shifted to local Y by +6.10)!
    ref_ring = [(z, y + 6.10) for (z, y) in _eval_buttstock_ring(-46.58, 32)]

    # Loft curved contoured steel buttplate shell along local X in [-0.46, +0.34]
    # with subtle concave shoulder curve (`dx_curve`) matching real M1 Garand buttplate!
    bp_stations = []
    for x_base, sc in ((-0.46, 0.94), (-0.34, 1.01), (0.04, 1.015), (0.34, 0.985)):
        ring = []
        for (z, y) in ref_ring:
            ring.append((z * sc, y * sc))
        bp_stations.append((x_base, ring))
    plate_shell = mk_loft_x("bp_shell", bp_stations, mat=m_pk)

    # Apply gentle ergonomic concave shoulder curve to rear face vertices (`x < -0.15`)
    bm = bmesh.new()
    bm.from_mesh(plate_shell.data)
    for v in bm.verts:
        ty = v.co.z  # Blender Z = Three.js Y
        if v.co.x < -0.15:
            # Concave inward scoop at middle (ty ~ 0), curving gently rearward at heel & toe!
            u = ty / 5.65
            v.co.x += 0.14 * (1.0 - u * u) - 0.06
    bm.to_mesh(plate_shell.data)
    bm.free()

    # Rounded top heel wrap tang hugging top comb of walnut stock (local X in [-0.28, +0.62], Y ~ +5.46)
    heel_tang = mk_box("bp_htang", 0.88, 0.34, 2.28, [("t", 0.16, 5.48, 0.0)], m_pk, bevel=0.06, bevel_segs=2)

    # Hinged circular M10 cleaning-kit / oiler trapdoor on upper-mid buttplate (local Y = +1.35)
    trap_recess_rim = mk_cyl("bp_trim", 1.12, 1.14, 0.12, "x", 32, [("t", -0.34, 1.35, 0.0)], m_bs, bevel=0.025)
    trap_disc       = mk_cyl("bp_tdisc", 1.04, 1.04, 0.14, "x", 32, [("t", -0.38, 1.35, 0.0)], m_pk, bevel=0.025)
    trap_hinge      = mk_box("bp_thinge", 0.22, 0.34, 1.12, [("t", -0.42, 2.44, 0.0)], m_bs, bevel=0.03)
    thumb_lip       = mk_box("bp_tlip", 0.22, 0.26, 0.64, [("t", -0.45, 0.24, 0.0)], m_ws, bevel=0.025)

    # Upper & lower countersunk gunsmith-slotted mounting screws (proud flush on curved rear face w/ crisp 3D slot!)
    def _mk_slotted_screw(name: str, sx: float, sy: float) -> bpy.types.Object:
        head = mk_cyl(f"{name}_h", 0.34, 0.37, 0.24, "x", 24, [("t", sx, sy, 0.0)], m_bs, bevel=0.035)
        return bool_subtract(
            head,
            [mk_box(f"c_{name}", 0.26, 0.085, 0.78, [("t", sx - 0.12, sy, 0.0)], m_pk)],
            solver="EXACT",
        )

    top_screw = _mk_slotted_screw("bp_tscr", -0.45,  4.42)
    bot_screw = _mk_slotted_screw("bp_bscr", -0.49, -4.82)

    obj = join_objects(
        [plate_shell, heel_tang, trap_recess_rim, trap_disc, trap_hinge, thumb_lip, top_screw, bot_screw],
        "garand_buttplate",
    )
    return finish_part(obj, bevel_w=0.0, sharp_deg=38.0)


def build_garand_op_rod_catch(mats: dict) -> bpy.types.Object:
    """F-08: Forged Operating-Rod Catch & Accelerator Pawl Linkage (assembledPos: [4.85, -0.35, 0.55])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    body_xy = [
        (-1.85, -0.38), ( 1.65, -0.38), ( 1.82,  0.24),
        ( 1.15,  0.68), ( 0.45,  0.68), ( 0.18,  0.26),
        (-1.45,  0.26), (-1.85, -0.05),
    ]
    lever_raw = mk_extrude_z("orc_raw", body_xy, -0.17, 0.17, bevel=0.028, bevel_segs=2, mat=m_pk)
    lever = bool_subtract(
        lever_raw,
        [mk_cyl("c_orc_h", 0.14, 0.14, 0.60, "z", 18, [("t", 0.85, -0.04, 0.0)], m_bs)],
        solver="EXACT",
    )
    accel_pawl = mk_box("orc_pawl", 0.86, 0.42, 0.26, [("rz", 0.28), ("t", 1.22, -0.32, -0.24)], m_bs, bevel=0.028)
    cross_pin  = mk_cyl("orc_pin", 0.13, 0.13, 1.16, "z", 18, [("t", 0.85, -0.04, -0.22)], m_ws, bevel=0.018)
    link_arm   = mk_box("orc_arm", 1.62, 0.20, 0.22, [("t", -1.35, -0.18, -0.32)], m_pk, bevel=0.022)

    obj = join_objects([lever, accel_pawl, cross_pin, link_arm], "garand_op_rod_catch")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_trigger(mats: dict) -> bpy.types.Object:
    """FC-03: Forged Two-Stage Service Trigger & Pinned Spring Disconnector Sear (assembledPos: [-5.55, -3.45, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_ws = mats["M_WhiteStainless"]
    m_bs = mats["M_BurnishedSteel"]

    trig_xy = [(-0.42, 1.48), (-0.56, 0.65), (-0.22, 0.18)]
    trig_xy += _quad_bez((-0.22, 0.18), (-0.28, -0.72), (0.06, -1.62), 10)
    trig_xy += _quad_bez((0.06, -1.62), (0.40, -1.68), (0.52, -1.42), 6)
    trig_xy += _quad_bez((0.52, -1.42), (0.28, -0.62), (0.56, 0.25), 10)
    trig_xy.append((0.45, 1.48))

    blade_raw = mk_extrude_z("trg_raw", trig_xy, -0.22, 0.22, bevel=0.032, bevel_segs=2, mat=m_pk)
    blade = bool_subtract(
        blade_raw,
        [mk_cyl("c_trg_h", 0.135, 0.135, 0.65, "z", 18, [("t", 0.12, 0.35, 0.0)], m_bs)],
        solver="EXACT",
    )
    sec_sear = mk_box("trg_sear", 0.66, 0.68, 0.56, [("t", -0.28, 1.28, 0.0)], m_ws, bevel=0.028)
    sear_pin = mk_cyl("trg_pin", 0.09, 0.09, 0.72, "z", 16, [("t", -0.24, 0.92, 0.0)], m_bs, bevel=0.015)

    obj = join_objects([blade, sec_sear, sear_pin], "garand_trigger")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_hammer(mats: dict) -> bpy.types.Object:
    """FC-04: Forged Dual-Hook Internal Rotating Hammer w/ Hardened Strike Face (assembledPos: [-4.95, -1.65, 0])."""
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]
    m_pk = mats["M_ParkerizedSteel"]

    ham_xy = [
        (-0.42, -0.45), ( 0.46, -0.35), ( 0.55,  0.35),
        (-1.85,  0.88), (-2.45,  0.65), (-2.35,  0.05),
        (-0.92, -0.22),
    ]
    body_raw = mk_extrude_z("ham_raw", ham_xy, -0.28, 0.28, bevel=0.036, bevel_segs=2, mat=m_bs)
    body = bool_subtract(
        body_raw,
        [mk_cyl("c_ham_h", 0.175, 0.175, 0.80, "z", 20, [("t", 0.0, 0.0, 0.0)], m_pk)],
        solver="EXACT",
    )
    strike_head = mk_box("ham_nose", 0.52, 0.64, 0.64, [("rz", -0.22), ("t", -2.22, 0.48, 0.0)], m_ws, bevel=0.035)
    plunger_cup = mk_cyl("ham_cup", 0.18, 0.18, 0.66, "z", 18, [("t", -0.52, -0.32, 0.0)], m_pk, bevel=0.02)

    obj = join_objects([body, strike_head, plunger_cup], "garand_hammer")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_follower(mats: dict) -> bpy.types.Object:
    """M-02: Reversible Machined 8-Round Staggered Follower & Slide (assembledPos: [-0.95, -0.95, 0])."""
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]
    m_pk = mats["M_ParkerizedSteel"]

    main_blk = mk_box("flw_main", 5.05, 0.44, 0.98, [("t", 0.0, 0.0, 0.0)], m_bs, bevel=0.035, bevel_segs=2)
    step_top = mk_box("flw_stop", 4.86, 0.26, 0.44, [("t", 0.05,  0.31, -0.24)], m_ws, bevel=0.03)
    step_bot = mk_box("flw_sbot", 4.86, 0.22, 0.44, [("t", 0.05, -0.30,  0.24)], m_pk, bevel=0.028)
    slide    = mk_box("flw_sld",  1.66, 0.48, 0.46, [("t", 0.45, -0.44,  0.00)], m_pk, bevel=0.03)

    obj = join_objects([main_blk, step_top, step_bot, slide], "garand_follower")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_follower_arm(mats: dict) -> bpy.types.Object:
    """M-03: Pivoting Forged Follower Arm & Forked Follower Rod (assembledPos: [3.85, -1.25, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_bs = mats["M_BurnishedSteel"]
    m_ws = mats["M_WhiteStainless"]

    arm_l = mk_box("fa_arml", 5.10, 0.34, 0.20, [("rz", -0.08), ("t", -2.20, 0.08, -0.36)], m_pk, bevel=0.025)
    arm_r = mk_box("fa_armr", 5.10, 0.34, 0.20, [("rz", -0.08), ("t", -2.20, 0.08,  0.36)], m_pk, bevel=0.025)
    pivot = mk_cyl("fa_piv", 0.24, 0.24, 1.04, "z", 20, [("t", -0.35, 0.28, 0.0)], m_bs, bevel=0.025)

    rod_pts = [
        Vector((-0.25, 0.28, 0.0)),
        Vector(( 1.85, 0.56, 0.0)),
        Vector(( 4.25, 0.86, 0.0)),
        Vector(( 5.95, 0.90, 0.0)),
    ]
    rod_spine = mk_tube_along_pts("fa_rod", rod_pts, 0.145, ring_segs=16, mat=m_pk)
    washer    = mk_cyl("fa_wash", 0.44, 0.44, 0.22, "x", 24, [("t", 5.95, 0.90, 0.0)], m_ws, bevel=0.025)
    spigot    = mk_cyl("fa_spig", 0.22, 0.24, 1.25, "x", 20, [("t", 6.62, 0.90, 0.0)], m_bs, bevel=0.022)

    obj = join_objects([arm_l, arm_r, pivot, rod_spine, washer, spigot], "garand_follower_arm")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


def build_garand_bullet_guide(mats: dict) -> bpy.types.Object:
    """M-04: Forged Twin-Ramp Bullet Guide Block w/ Polished Feed Flutes (assembledPos: [3.35, -0.45, 0])."""
    m_pk = mats["M_ParkerizedSteel"]
    m_ws = mats["M_WhiteStainless"]

    blk_xy = [
        (-1.28, -0.88), ( 1.28, -0.88), ( 1.35,  0.42),
        ( 0.55,  0.95), (-0.95,  0.35), (-1.28, -0.15),
    ]
    body_raw = mk_extrude_z("bg_raw", blk_xy, -0.67, 0.67, bevel=0.035, bevel_segs=2, mat=m_pk)
    body = bool_subtract(
        body_raw,
        [mk_cyl("c_bg_h", 0.145, 0.145, 1.60, "z", 18, [("t", 0.15, -0.48, 0.0)], m_pk)],
        solver="EXACT",
    )
    ramp_l = mk_box("bg_rl", 1.42, 0.16, 0.46, [("rz", 0.36), ("t", -0.18, 0.66, -0.32)], m_ws, bevel=0.025)
    ramp_r = mk_box("bg_rr", 1.42, 0.16, 0.46, [("rz", 0.36), ("t", -0.18, 0.66,  0.32)], m_ws, bevel=0.025)

    obj = join_objects([body, ramp_l, ramp_r], "garand_bullet_guide")
    return finish_part(obj, bevel_w=0.0, sharp_deg=34.0)


# =============================================================================
# Non-Overlapping Hero UV Layout + Smart CONCAVE Packing (margin = 0.0045)
# =============================================================================
def _smart_unwrap_and_pack_rect(
    objs: list[bpy.types.Object],
    u0: float, u1: float, v0: float, v1: float,
    include_face_fn=None,
    label: str = "pack",
    margin: float = 0.0045,
) -> int:
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True

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

    du = u1 - u0
    dv = v1 - v0
    pu0, pu1 = 1.0, 0.0
    pv0, pv1 = 1.0, 0.0
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
                pu0 = min(pu0, ux)
                pu1 = max(pu1, ux)
                pv0 = min(pv0, vy)
                pv1 = max(pv1, vy)
                uv.x = u0 + ux * du
                uv.y = v0 + vy * dv
        bm.to_mesh(o.data)
        bm.free()

    su, sv = pu1 - pu0, pv1 - pv0
    print(f"  [UV-PACK:{label:14s}] {len(active_objs):2d} objs ({sel_count:5d} faces) -> [{u0:.3f},{u1:.3f}]x[{v0:.3f},{v1:.3f}] span=({su:.3f},{sv:.3f})")
    assert su > 0.45 and sv > 0.45, f"UV pack {label} collapsed! span=({su:.3f},{sv:.3f})"
    return sel_count


def unwrap_walnut_atlas(walnut_objs: list[bpy.types.Object]) -> None:
    """Disjoint, zero-bleed 2048x2048 UV atlas for `garand_v3_walnut` (3 parts):
      - Hero Band 1 (Left Buttstock & Wrist Flank, X in [-46.6, +5.0], SA/NFR + Crossed Cannons):
          u in [0.015, 0.985] (1-xNorm), v in [0.680, 0.985]
      - Hero Band 2 (Right Buttstock & Wrist Flank, X in [-46.6, +5.0], Circled [P] proof):
          u in [0.015, 0.985] (xNorm), v in [0.365, 0.665]
      - Packed Wood (Forend, Comb/Belly, Bedding, Rear & Front Handguards):
          u in [0.010, 0.800], v in [0.010, 0.350]
      - Firewalled Steel Hardware (Stock Ferrule, Swivel, Handguard Clips/Ferrules):
          u in [0.820, 0.990], v in [0.010, 0.350]
    """
    def classify_walnut_face(obj_name: str, face, mat_name: str) -> str:
        if mat_name in ("W_ParkerizedHW", "W_BurnishedSwivel"):
            return "STEEL_HW"
        if obj_name == "garand_walnut_stock" and mat_name == "W_AmericanWalnut":
            c = face.calc_center_median()
            n = face.normal
            tx, tz = c.x, -c.y
            nz = -n.y
            if -46.60 <= tx <= 5.00:
                if nz < -0.45 and tz < -0.35:
                    return "HERO_LEFT"
                if nz > 0.45 and tz > 0.35:
                    return "HERO_RIGHT"
        return "WOOD_PACK"

    c_wood = _smart_unwrap_and_pack_rect(
        walnut_objs, 0.010, 0.800, 0.010, 0.350,
        include_face_fn=lambda on, f, mn: classify_walnut_face(on, f, mn) == "WOOD_PACK",
        label="walnut_wood", margin=0.0045,
    )
    c_hw = _smart_unwrap_and_pack_rect(
        walnut_objs, 0.820, 0.990, 0.010, 0.350,
        include_face_fn=lambda on, f, mn: classify_walnut_face(on, f, mn) == "STEEL_HW",
        label="walnut_hw", margin=0.005,
    )

    hero_cnt = {"HERO_LEFT": 0, "HERO_RIGHT": 0}
    stk = next(o for o in walnut_objs if o.name == "garand_walnut_stock")
    bm = bmesh.new()
    bm.from_mesh(stk.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in stk.data.materials]
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        cls = classify_walnut_face("garand_walnut_stock", f, mname)
        if cls not in hero_cnt:
            continue
        hero_cnt[cls] += 1
        for loop in f.loops:
            vco = loop.vert.co
            tx, ty = vco.x, vco.z
            xn = max(0.0, min(1.0, (tx - (-46.60)) / (5.00 - (-46.60))))
            yn = max(0.0, min(1.0, (ty - (-11.80)) / (0.95 - (-11.80))))
            if cls == "HERO_LEFT":
                # Left flank (-Z): muzzle (+X) screen-left -> u increases with (1 - xn)!
                loop[uv_layer].uv = (0.015 + (1.0 - xn) * 0.970, 0.680 + yn * 0.305)
            else:
                # Right flank (+Z): butt (-X) screen-left -> u increases with xn!
                loop[uv_layer].uv = (0.015 + xn * 0.970, 0.365 + yn * 0.300)
    bm.to_mesh(stk.data)
    bm.free()

    print(f"  [UV-HERO] walnut: {hero_cnt} | wood={c_wood}, hw={c_hw}")
    for k, v in hero_cnt.items():
        assert v > 0, f"Walnut hero {k} captured 0 faces!"


def unwrap_receiver_atlas(recv_objs: list[bpy.types.Object]) -> None:
    """Disjoint, zero-bleed 2048x2048 UV atlas for `garand_v3_receiver` (6 parts):
      - Hero Heel Deck (`U.S. RIFLE / CAL. .30 M1 / SPRINGFIELD ARMORY / 2847192`):
          u in [0.020, 0.440] (zNorm -Z->+Z), v in [0.680, 0.985] (xNorm -X->+X)
      - Hero Receiver Right Outer Flank (`D 28291 32`):
          u in [0.460, 0.985] (xNorm), v in [0.680, 0.985] (yNorm)
      - Hero T105 Left Elevation Drum Cap (`2 4 6 8 10 12`):
          u in [0.020, 0.230], v in [0.495, 0.665]
      - Hero T105 Right Windage Drum Cap (`L / R`):
          u in [0.250, 0.460], v in [0.495, 0.665]
      - Hero En-Bloc Clip Outer Flanks & Back Spine (`SA` + brass rub):
          u in [0.500, 0.985], v in [0.495, 0.665]
      - Packed Receiver/Sight/Latch/FCG/Clip Non-Hero:
          u in [0.010, 0.990], v in [0.010, 0.478]
    """
    def classify_recv_face(obj_name: str, face, mat_name: str) -> str:
        c = face.calc_center_median()
        n = face.normal
        tx, ty, tz = c.x, c.z, -c.y
        nx, ny, nz = n.x, n.z, -n.y

        if obj_name == "garand_receiver" and mat_name == "R_ParkerizedForged":
            # Exposed sloped top heel deck strictly behind T105 rear sight (X in [-8.62, -7.30], Y > 1.30, upward normal!)
            if -8.62 <= tx <= -7.30 and ty > 1.30 and abs(tz) < 1.27 and ny > 0.78:
                return "HERO_HEEL"
            # Outer right receiver flank (+Z face, Z > 1.32, nz > 0.85)
            if -8.62 <= tx <= 5.88 and nz > 0.85 and tz > 1.32:
                return "HERO_RFLANK"
            # Outer left receiver flank (-Z face, Z < -1.32, nz < -0.85) — dedicated crisp high-res band!
            if -8.62 <= tx <= 5.88 and nz < -0.85 and tz < -1.32:
                return "HERO_LFLANK"

        if obj_name == "garand_rear_sight" and mat_name == "R_ParkerizedDark":
            # Left elevation drum outer face (-Z normal, tz < -1.48)
            if nz < -0.88 and tz < -1.48:
                return "HERO_ELEV"
            # Right windage drum outer face (+Z normal, tz > +1.47)
            if nz > 0.88 and tz > 1.47:
                return "HERO_WIND"

        if obj_name == "garand_enbloc_clip" and mat_name == "R_EnBlocBlued":
            # Outer left flank, outer right flank, or rear spine (-X face)
            if nx < -0.85 and tx < -3.14:
                return "HERO_CLIP_BACK"
            if nz < -0.85 and tz < -0.66:
                return "HERO_CLIP_L"
            if nz > 0.85 and tz > 0.66:
                return "HERO_CLIP_R"

        return "RECV_PACK"

    c_pack = _smart_unwrap_and_pack_rect(
        recv_objs, 0.010, 0.990, 0.010, 0.478,
        include_face_fn=lambda on, f, mn: classify_recv_face(on, f, mn) == "RECV_PACK",
        label="recv_pack", margin=0.0045,
    )

    hero_cnt = {
        "HERO_HEEL": 0, "HERO_RFLANK": 0, "HERO_LFLANK": 0, "HERO_ELEV": 0, "HERO_WIND": 0,
        "HERO_CLIP_BACK": 0, "HERO_CLIP_L": 0, "HERO_CLIP_R": 0,
    }
    for o in recv_objs:
        if o.name not in ("garand_receiver", "garand_rear_sight", "garand_enbloc_clip"):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        uv_layer = bm.loops.layers.uv.verify()
        mat_names = [m.name if m else "" for m in o.data.materials]
        for f in bm.faces:
            mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
            cls = classify_recv_face(o.name, f, mname)
            if cls not in hero_cnt:
                continue
            hero_cnt[cls] += 1
            for loop in f.loops:
                vco = loop.vert.co
                tx, ty, tz = vco.x, vco.z, -vco.y
                if cls == "HERO_HEEL":
                    # Exposed heel behind sight (X in [-8.58, -7.34]): u = zNorm (-Z->+Z), v = xNorm (-X->+X)!
                    zn = max(0.0, min(1.0, (tz + 1.28) / 2.56))
                    xn = max(0.0, min(1.0, (tx - (-8.58)) / ((-7.34) - (-8.58))))
                    loop[uv_layer].uv = (0.020 + zn * 0.420, 0.680 + xn * 0.305)
                elif cls == "HERO_RFLANK":
                    xn = max(0.0, min(1.0, (tx - (-8.60)) / (5.86 - (-8.60))))
                    yn = max(0.0, min(1.0, (ty - (-2.28)) / (2.48 - (-2.28))))
                    loop[uv_layer].uv = (0.460 + xn * 0.525, 0.680 + yn * 0.145)
                elif cls == "HERO_LFLANK":
                    xn = max(0.0, min(1.0, (tx - (-8.60)) / (5.86 - (-8.60))))
                    yn = max(0.0, min(1.0, (ty - (-2.28)) / (2.48 - (-2.28))))
                    loop[uv_layer].uv = (0.460 + (1.0 - xn) * 0.525, 0.840 + yn * 0.145)
                elif cls == "HERO_ELEV":
                    # Left face (-Z): muzzle (+X) left -> u increases with -tx!
                    un = max(0.0, min(1.0, 0.5 - tx / 1.04))
                    vn = max(0.0, min(1.0, 0.5 + (ty - (-0.12)) / 1.04))
                    loop[uv_layer].uv = (0.020 + un * 0.210, 0.495 + vn * 0.170)
                elif cls == "HERO_WIND":
                    # Right face (+Z): muzzle (+X) right -> u increases with +tx!
                    un = max(0.0, min(1.0, 0.5 + tx / 1.00))
                    vn = max(0.0, min(1.0, 0.5 + (ty - (-0.12)) / 1.00))
                    loop[uv_layer].uv = (0.250 + un * 0.210, 0.495 + vn * 0.170)
                elif cls == "HERO_CLIP_L":
                    xn = max(0.0, min(1.0, (tx - (-3.16)) / 5.42))
                    yn = max(0.0, min(1.0, (ty + 1.48) / 2.96))
                    loop[uv_layer].uv = (0.502 + (1.0 - xn) * 0.155, 0.495 + yn * 0.170)
                elif cls == "HERO_CLIP_R":
                    xn = max(0.0, min(1.0, (tx - (-3.16)) / 5.42))
                    yn = max(0.0, min(1.0, (ty + 1.48) / 2.96))
                    loop[uv_layer].uv = (0.665 + xn * 0.155, 0.495 + yn * 0.170)
                elif cls == "HERO_CLIP_BACK":
                    # Rear face (-X): -Z left, +Z right -> u increases with +tz!
                    zn = max(0.0, min(1.0, (tz + 0.70) / 1.40))
                    yn = max(0.0, min(1.0, (ty + 1.48) / 2.96))
                    loop[uv_layer].uv = (0.835 + zn * 0.148, 0.495 + yn * 0.170)
        bm.to_mesh(o.data)
        bm.free()

    print(f"  [UV-HERO] recv: {hero_cnt} | packed={c_pack}")
    for k, v in hero_cnt.items():
        assert v > 0, f"Receiver hero {k} captured 0 faces!"


def unwrap_metal_atlas(metal_objs: list[bpy.types.Object]) -> None:
    """Disjoint, zero-bleed 2048x2048 UV atlas for `garand_v3_metal` (15 parts):
      - Zone 1 (Barrel, Gas Cylinder, Lock Screw, Front Sight, Lower Band, Buttplate non-hero):
          u in [0.010, 0.790], v in [0.510, 0.990]
      - Hero Buttplate Rear Checkered Face:
          u in [0.805, 0.985], v in [0.515, 0.985]
      - Zone 2 (Curved Op-Rod, Rotating 2-Lug Bolt, Tang Firing Pin):
          u in [0.010, 0.580], v in [0.010, 0.495]
      - Zone 3 (FCG & Feeding Internals: Trigger, Hammer, Op-Rod Catch, Follower, Follower Arm, Bullet Guide):
          u in [0.600, 0.990], v in [0.010, 0.495]
    """
    ext_ord_names = {
        "garand_barrel", "garand_gas_cylinder", "garand_gas_lock_screw",
        "garand_front_sight", "garand_lower_band", "garand_buttplate",
    }
    action_names = {"garand_op_rod", "garand_bolt", "garand_firing_pin"}

    def classify_metal_face(obj_name: str, face, mat_name: str) -> str:
        if obj_name == "garand_buttplate" and mat_name == "M_ParkerizedSteel":
            c = face.calc_center_median()
            n = face.normal
            if n.x < -0.78 and c.x < -0.22:
                return "HERO_BUTTPLATE"
        if obj_name in ext_ord_names:
            return "ZONE_1"
        if obj_name in action_names:
            return "ZONE_2"
        return "ZONE_3"

    c1 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.010, 0.790, 0.510, 0.990,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_1",
        label="metal_z1_ord", margin=0.0045,
    )
    c2 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.010, 0.580, 0.010, 0.495,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_2",
        label="metal_z2_act", margin=0.0045,
    )
    c3 = _smart_unwrap_and_pack_rect(
        metal_objs, 0.600, 0.990, 0.010, 0.495,
        include_face_fn=lambda on, f, mn: classify_metal_face(on, f, mn) == "ZONE_3",
        label="metal_z3_int", margin=0.0045,
    )

    bp = next(o for o in metal_objs if o.name == "garand_buttplate")
    bm = bmesh.new()
    bm.from_mesh(bp.data)
    uv_layer = bm.loops.layers.uv.verify()
    mat_names = [m.name if m else "" for m in bp.data.materials]
    bp_cnt = 0
    for f in bm.faces:
        mname = mat_names[f.material_index] if f.material_index < len(mat_names) else ""
        if classify_metal_face("garand_buttplate", f, mname) != "HERO_BUTTPLATE":
            continue
        bp_cnt += 1
        for loop in f.loops:
            vco = loop.vert.co
            ty, tz = vco.z, -vco.y
            zn = max(0.0, min(1.0, (tz + 1.96) / 3.92))
            yn = max(0.0, min(1.0, (ty + 5.72) / 11.40))
            # Rear face (-X): -Z left, +Z right -> u increases with +tz!
            loop[uv_layer].uv = (0.805 + zn * 0.180, 0.515 + yn * 0.470)
    bm.to_mesh(bp.data)
    bm.free()

    print(f"  [UV-HERO] metal: HERO_BUTTPLATE={bp_cnt} | Z1={c1}, Z2={c2}, Z3={c3}")
    assert bp_cnt > 0, "Buttplate hero checkering face captured 0 faces!"


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
    default_albedo=(0.045, 0.050, 0.048, 1.0),
) -> None:
    scene = bpy.context.scene
    mats_set = {m for o in target_objs for m in o.data.materials if m is not None}

    def run_bake(
        tag: str,
        bake_type: str,
        samples: int,
        fill_color=(0.0, 0.0, 0.0, 1.0),
        normal_op: bool = False,
        extra_objs_override=None,
    ) -> None:
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

        kwargs = dict(type=bake_type, margin=5, use_clear=False)
        if normal_op:
            kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
        bpy.ops.object.bake(**kwargs)
        _save_image_npy(img, tmp_dir / f"{prefix}_{tag}.npy")
        _remove_bake_image_nodes(nodes)
        bpy.data.images.remove(img)
        print(f"[BAKE] {prefix}_{tag:10s} ({bake_type:6s}, {samples:2d} spp) done in {time.time() - t0:.1f}s")

    # 1. Isolated grid layout: pure Albedo, Roughness, Metalness, Tangent Normal & Self-AO
    _set_grid_isolated_layout(all_objs)

    saved = _route_bsdf_input_to_emit(mats_set, "Base Color")
    run_bake("albedo", "EMIT", samples=2, fill_color=default_albedo)
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Roughness")
    run_bake("roughness", "EMIT", samples=2, fill_color=(0.38, 0.38, 0.38, 1.0))
    _restore_bsdf(saved)

    saved = _route_bsdf_input_to_emit(mats_set, "Metallic")
    run_bake("metalness", "EMIT", samples=2, fill_color=(0.0, 0.0, 0.0, 1.0))
    _restore_bsdf(saved)

    run_bake("normal", "NORMAL", samples=BAKE_NORMAL_SAMPLES, fill_color=(0.5, 0.5, 1.0, 1.0), normal_op=True)

    scene.world.light_settings.distance = 0.70
    run_bake("ao_self", "AO", samples=BAKE_AO_SAMPLES, fill_color=(1.0, 1.0, 1.0, 1.0))

    # 2. Assembled stationary exterior layout: inter-part contact AO + exterior mask
    _set_assembled_exterior_layout(all_objs)
    ext_targets = [o for o in target_objs if o.name in EXTERIOR_CONTACT_AO_PARTS]
    scene.world.light_settings.distance = 0.50
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


# =============================================================================
# Hard-Contract Verification, Exploded Clearance Audit & Draco GLB Export
# =============================================================================
def verify_meshes(all_objs: list[bpy.types.Object]) -> dict:
    report = {}
    max_bbox_delta = 0.0
    total_tris = 0
    local_bboxes: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {}

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
        status = "OK" if (non_man == 0 and vol > 0 and d_max <= 0.25) else "WARN"
        print(
            f"  [{status}] {o.name:24s} tris={tris:6d} non_man={non_man:2d} vol={vol:8.2f} "
            f"max_bbox_delta={d_max:.4f} cm"
        )
        assert non_man == 0, f"MANIFOLD VIOLATION on {o.name}: non_man={non_man}"
        assert vol > 0.0, f"NEGATIVE/ZERO VOLUME on {o.name}: vol={vol}"
        if d_max > 0.25:
            print(f"       !! BBOX DELTA > 0.25cm: got min={[round(x,3) for x in bmin]} max={[round(x,3) for x in bmax]}")
            print(f"          ref min={ref_min} max={ref_max}")
        report[o.name] = {"tris": tris, "non_manifold": non_man, "vol": vol, "max_delta": d_max}

    # Check t=1.0 exploded AABB zero-clipping across ALL 26 parts (24 solid GLB + 2 CSG springs)!
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
                exp_overlaps.append((pids[i], pids[j], round(ox, 3), round(oy, 3), round(oz, 3)))
    print(
        f"[VERIFY] {len(all_objs)} solid parts | total_tris={total_tris:,} | "
        f"worst_bbox_delta={max_bbox_delta:.4f} cm | t=1.0_overlaps(all 26)={len(exp_overlaps)}"
    )
    if exp_overlaps:
        print(f"  [WARN] t=1.0 overlaps: {exp_overlaps}")
    assert len(exp_overlaps) == 0, f"t=1.0 exploded overlaps found: {exp_overlaps}"
    return report


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
    """Optional Cycles visual QA renderer (`-- --preview`): mounts FINAL baked WebP PBR maps
    onto the exported meshes in our museum HDRI studio and renders 6 inspection plates
    to `/tmp/garand_qa_*.png` (never writes preview images into the git repository!)."""
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
        ao_mix.inputs["Factor"].default_value = 0.90
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

    mat_w = make_baked_mat("QA_Walnut", "garand_v3_walnut", 0.90)
    mat_r = make_baked_mat("QA_Receiver", "garand_v3_receiver", 0.88)
    mat_m = make_baked_mat("QA_Metal", "garand_v3_metal", 0.85)

    walnut_set = set(WALNUT_PARTS)
    recv_set = set(RECEIVER_PARTS)
    for o in all_objs:
        o.data.materials.clear()
        if o.name in walnut_set:
            o.data.materials.append(mat_w)
        elif o.name in recv_set:
            o.data.materials.append(mat_r)
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

    def add_softbox(name: str, loc_t: tuple, aim_t: tuple, energy: float, sx: float, sy: float, col=(1.0, 0.98, 0.95)):
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

    add_softbox("KeyStrip_R", ( 8.0, 32.0,  36.0), (8.0, -2.0, 0.0), 6500.0, 80.0, 18.0, (1.00, 0.98, 0.94))
    add_softbox("KeyStrip_L", ( 8.0, 32.0, -36.0), (8.0, -2.0, 0.0), 6000.0, 80.0, 18.0, (0.96, 0.99, 1.00))
    add_softbox("Fill_R",     ( 8.0,  2.0,  55.0), (8.0, -2.0, 0.0), 1800.0, 90.0, 22.0, (0.98, 0.97, 0.95))
    add_softbox("Fill_L",     ( 8.0,  2.0, -55.0), (8.0, -2.0, 0.0), 1800.0, 90.0, 22.0, (0.94, 0.97, 1.00))

    cam_d = bpy.data.cameras.new("QACam")
    cam = bpy.data.objects.new("QACam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(fname: str, eye_t: tuple, tgt_t: tuple, lens: float = 55.0):
        cam_d.lens = lens
        cam.location = t2b(*eye_t)
        d = t2b(*tgt_t) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"/tmp/{fname}"
        bpy.ops.render.render(write_still=True)
        print(f"[QA-RENDER] Saved /tmp/{fname}")

    # 1. Full-Length Right Hero Profile (Complete 110.5 cm rifle buttplate-to-muzzle!)
    shoot("garand_qa_right.png", (8.0, 5.0, 158.0), (8.0, -3.2, 0.0), lens=48.0)
    # 2. Full-Length Left Hero Profile (Complete 110.5 cm rifle buttplate-to-muzzle!)
    shoot("garand_qa_left.png", (8.0, 5.0, -158.0), (8.0, -3.2, 0.0), lens=48.0)
    # 3. 3/4 Hero Receiver + 5-Line Heel Stamping + T105 Knurled Drums + En-Bloc Clip + Swept Op-Rod Handle!
    shoot("garand_qa_macro_receiver.png", (-17.5, 11.5, 14.5), (-3.5, 0.6, 0.0), lens=56.0)
    # 4. Macro Left Receiver & Wrist (`S.A. / NFR` + Crossed Cannons + Clip Latch Thumb Button + T105 Dial!)
    shoot("garand_qa_macro_left.png", (-7.0, 2.5, -24.0), (-7.8, -1.0, -1.2), lens=58.0)
    # 5. Macro Muzzle Gas Cylinder + Bayonet Lug + Stacking Swivel + Winged Front Sight + Cross Lock Screw!
    shoot("garand_qa_macro_muzzle.png", (71.0, 5.5, 18.0), (57.0, 0.5, 0.0), lens=58.0)
    # 6. Macro Checkered Buttplate + Hinged Trapdoor + Slotted Screws + Sculpted Walnut Buttstock!
    shoot("garand_qa_macro_buttplate.png", (-62.0, -1.0, -15.0), (-46.5, -5.8, 0.0), lens=56.0)


def main() -> None:
    t_start = time.time()
    do_preview = "--preview" in sys.argv
    reset_scene()
    mats = create_material_library()

    builders = {
        # Group A: American Black Walnut Stock & Handguards (3 parts)
        "garand_walnut_stock":    build_garand_walnut_stock,
        "garand_rear_handguard":  build_garand_rear_handguard,
        "garand_front_handguard": build_garand_front_handguard,
        # Group B: Receiver, T105 Sight, Clip Latch, Trigger Housing/Guard & En-Bloc Clip (6 parts)
        "garand_receiver":        build_garand_receiver,
        "garand_rear_sight":      build_garand_rear_sight,
        "garand_clip_latch":      build_garand_clip_latch,
        "garand_trigger_housing": build_garand_trigger_housing,
        "garand_trigger_guard":   build_garand_trigger_guard,
        "garand_enbloc_clip":     build_garand_enbloc_clip,
        # Group C: 24" Barrel, Gas Cylinder, Op-Rod, Bolt, Buttplate & Internals (15 parts)
        "garand_barrel":          build_garand_barrel,
        "garand_gas_cylinder":    build_garand_gas_cylinder,
        "garand_gas_lock_screw":  build_garand_gas_lock_screw,
        "garand_front_sight":     build_garand_front_sight,
        "garand_op_rod":          build_garand_op_rod,
        "garand_bolt":            build_garand_bolt,
        "garand_firing_pin":      build_garand_firing_pin,
        "garand_lower_band":      build_garand_lower_band,
        "garand_buttplate":       build_garand_buttplate,
        "garand_op_rod_catch":    build_garand_op_rod_catch,
        "garand_trigger":         build_garand_trigger,
        "garand_hammer":          build_garand_hammer,
        "garand_follower":        build_garand_follower,
        "garand_follower_arm":    build_garand_follower_arm,
        "garand_bullet_guide":    build_garand_bullet_guide,
    }

    print("[BUILD] Sculpting all 24 solid WWII U.S. Rifle M1 Garand (.30-06) hard-surface parts...")
    built: dict[str, bpy.types.Object] = {}
    for pid, fn in builders.items():
        built[pid] = fn(mats)

    walnut_objs = [built[pid] for pid in WALNUT_PARTS]
    recv_objs   = [built[pid] for pid in RECEIVER_PARTS]
    metal_objs  = [built[pid] for pid in METAL_PARTS]
    all_objs    = walnut_objs + recv_objs + metal_objs

    print("[VERIFY] Auditing manifoldness, outward normals, CSG alignment & t=1.0 exploded clearance...")
    verify_meshes(all_objs)

    print("[UV] Unwrapping & packing 3 dedicated 2K PBR suites: walnut (3), receiver (6), metal (15)...")
    unwrap_walnut_atlas(walnut_objs)
    unwrap_receiver_atlas(recv_objs)
    unwrap_metal_atlas(metal_objs)

    # Strict UV area & bounds audit across all 3 atlases!
    uv_audit = {}
    for label, group in (("walnut", walnut_objs), ("receiver", recv_objs), ("metal", metal_objs)):
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
        uv_audit[label] = tot_area
        print(f"  [UV-AUDIT] {label:8s}: total_uv_area={tot_area:.4f} (strictly <= 0.98, zero overlap!)")
        assert 0.22 < tot_area <= 0.98, f"{label} atlas UV area out of bounds: {tot_area:.4f}"

    with tempfile.TemporaryDirectory(prefix="garand_bake_") as tmp_str:
        tmp_dir = Path(tmp_str)
        print("[CYCLES] Baking garand_v3_walnut (2048x2048, 3 American Black Walnut + hardware parts)...")
        bake_atlas_suite("walnut", walnut_objs, all_objs, tmp_dir, default_albedo=(0.08, 0.03, 0.01, 1.0))
        print("[CYCLES] Baking garand_v3_receiver (2048x2048, 6 receiver/sight/FCG/en-bloc clip parts)...")
        bake_atlas_suite("recv", recv_objs, all_objs, tmp_dir, default_albedo=(0.045, 0.050, 0.048, 1.0))
        print("[CYCLES] Baking garand_v3_metal (2048x2048, 15 barrel/gas/op-rod/bolt/buttplate/internal parts)...")
        bake_atlas_suite("metal", metal_objs, all_objs, tmp_dir, default_albedo=(0.045, 0.050, 0.048, 1.0))

        print("[POST] Compositing Springfield heel rollmark, SA/NFR + Crossed Cannons, T105 dials & buttplate checkering...")
        subprocess.run(
            ["python3", str(Path(__file__).resolve()), "--postprocess", str(tmp_dir), str(TEX_OUT_DIR)],
            check=True,
        )

    export_draco_glb(all_objs)

    # Final strict <= 12.00 MB asset budget audit
    outputs = [
        MODELS_OUT,
        TEX_OUT_DIR / "garand_v3_walnut_albedo.webp",
        TEX_OUT_DIR / "garand_v3_walnut_normal.webp",
        TEX_OUT_DIR / "garand_v3_walnut_roughness.webp",
        TEX_OUT_DIR / "garand_v3_receiver_albedo.webp",
        TEX_OUT_DIR / "garand_v3_receiver_normal.webp",
        TEX_OUT_DIR / "garand_v3_receiver_roughness.webp",
        TEX_OUT_DIR / "garand_v3_metal_albedo.webp",
        TEX_OUT_DIR / "garand_v3_metal_normal.webp",
        TEX_OUT_DIR / "garand_v3_metal_roughness.webp",
    ]
    total_bytes = 0
    print("\n=== U.S. RIFLE M1 GARAND (.30-06) V3 ASSET BUDGET ===")
    for p in outputs:
        sz = p.stat().st_size
        total_bytes += sz
        print(f"  {p.name:38s}: {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL ({len(outputs)} files): {total_mb:.2f} MB (budget <= 12.00 MB)")
    print(f"  SKIPPED DYNAMIC SPRINGS: {SKIPPED_DYNAMIC_SPRING_PARTS}")
    assert total_mb <= 12.0, f"Asset budget exceeded: {total_mb:.2f} MB > 12.00 MB"

    if do_preview:
        print("\n[QA] Rendering 6 museum studio Cycles QA preview plates to /tmp/garand_qa_*.png...")
        render_qa_previews(all_objs)

    print(f"=== COMPLETE in {time.time() - t_start:.1f}s ===")


if __name__ == "__main__":
    main()
