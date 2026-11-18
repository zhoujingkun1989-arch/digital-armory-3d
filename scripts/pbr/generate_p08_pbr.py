#!/usr/bin/env python3
"""DWM 1917 Parabellum-Pistole 1908 / Luger P08 (9x19mm): deterministic 1:1 UV-calibrated 2K PBR atlases.

Generates 6 high-fidelity 3-channel RGB WebP maps in public/textures/ (zero residual PNGs):
  1. p08_blued_{albedo,normal,roughness}.webp (2048 x 1024)
     - v in [0.74, 1.00]: 4" Tapered Rifled Barrel & Chamber Ring ("1917" chamber date,
       "GELADEN" loaded-chamber extractor warning, "8,82" land-diameter proof, muzzle holster wear)
     - v in [0.48, 0.74]: Articulated Toggle Train & Forked Barrel Extension
       * u in [0.05, 0.44]: Intertwined "DWM" calligraphic scroll monogram on front toggle link
       * u in [0.45, 0.74]: Imperial German Crowned Eagle proofs & Gothic "S" on receiver flank
       * u in [0.75, 0.97]: 24-LPI diamond-knurled circular toggle-ear checkering (Spannstuecke)
     - v in [0.235, 0.48]: Forged Curved-Ramp Frame & Detachable Sideplate
       * u in [0.05, 0.64]: Milled "GESICHERT" safety mark, serial "4821 a" & polished cam ramps
       * u in [0.65, 0.96]: Detachable trigger-lever sideplate w/ matching "21" assembly stamp
     - v in [0.00, 0.235]: Authentic 240 deg C Golden Straw-Tempered ("Gelbangelassen") Steel
       (warm straw-gold R/G/B, B: metalness = 0.90, G: roughness = 0.22!) for crescent trigger,
       takedown locking lever, knurled thumb safety, and right-flank leaf ejector!

  2. p08_walnut_{albedo,normal,roughness}.webp (2048 x 1024)
     - u in [0.00, 0.36], v in [0.00, 1.00]: Left 20-LPI Diamond-Checkered European Walnut Grip Panel
     - u in [0.36, 0.71], v in [0.00, 1.00]: Right 20-LPI Diamond-Checkered European Walnut Grip Panel
     - u in [0.71, 1.00], v in [0.35, 1.00]: Brushed Nickel 8-Round Sheet-Steel Magazine Tube ("P.08")
     - u in [0.71, 1.00], v in [0.00, 0.35]: Machined Concentric-Grooved Alloy Base Pull-Knob ("4821 a")
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR,
    bevel_mask,
    chipped_edge_wear,
    cnc_toolpath,
    compute_height_ao,
    diamond_knurl,
    fbm_noise,
    height_to_normal_png,
    load_font,
    save_orm_png,
    save_rgb_png,
    scratch_field,
    seamless_band_noise,
    smoothstep,
)

FONT_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
FONT_ITALIC = "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"
FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


def _uv_grid(h: int, w: int) -> tuple[np.ndarray, np.ndarray]:
    return (
        np.broadcast_to((np.arange(w, dtype=np.float32)[None, :] + 0.5) / w, (h, w)),
        np.broadcast_to(1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h, (h, w)),
    )


def _paste_world_mask(
    dest: np.ndarray,
    patch_img: Image.Image,
    u0: float,
    u1: float,
    v0: float,
    v1: float,
) -> None:
    h, w = dest.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    if x1 <= x0 or y1 <= y0:
        return
    resized = patch_img.resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    np.maximum(dest[y0:y1, x0:x1], arr, out=dest[y0:y1, x0:x1])


def _edge_proximity(mask: np.ndarray, width: float = 4.5) -> np.ndarray:
    distance = ndimage.distance_transform_edt(mask).astype(np.float32)
    return (1.0 - smoothstep(0.8, width, distance)) * mask.astype(np.float32)


def _draw_dwm_scroll_monogram(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    scale: float,
    fill: int = 255,
) -> None:
    """Draws the iconic intertwined calligraphic DWM scroll cipher (Deutsche Waffen- u. Munitionsfabriken)."""
    sw = max(4, int(round(0.052 * scale)))
    thin = max(2, int(round(0.028 * scale)))

    # Ornate outer calligraphic 'D' loop & flourished top/bottom scrolls
    draw.arc(
        (cx - 0.46 * scale, cy - 0.36 * scale, cx + 0.38 * scale, cy + 0.36 * scale),
        start=-78,
        end=82,
        fill=fill,
        width=sw,
    )
    draw.line(
        [(cx - 0.24 * scale, cy - 0.35 * scale), (cx - 0.24 * scale, cy + 0.35 * scale)],
        fill=fill,
        width=sw,
    )
    # Flourish curls at left of 'D'
    draw.arc(
        (cx - 0.48 * scale, cy - 0.42 * scale, cx - 0.14 * scale, cy - 0.14 * scale),
        start=140,
        end=350,
        fill=fill,
        width=thin,
    )
    draw.arc(
        (cx - 0.48 * scale, cy + 0.14 * scale, cx - 0.14 * scale, cy + 0.42 * scale),
        start=10,
        end=220,
        fill=fill,
        width=thin,
    )

    # Intertwined 'W' sweeping through center
    w_pts = [
        (cx - 0.34 * scale, cy - 0.24 * scale),
        (cx - 0.14 * scale, cy + 0.30 * scale),
        (cx + 0.00 * scale, cy - 0.12 * scale),
        (cx + 0.14 * scale, cy + 0.30 * scale),
        (cx + 0.34 * scale, cy - 0.24 * scale),
    ]
    draw.line(w_pts, fill=fill, width=sw, joint="curve")

    # Interlaced 'M' arches crowning the cipher
    m_pts = [
        (cx - 0.30 * scale, cy + 0.26 * scale),
        (cx - 0.18 * scale, cy - 0.32 * scale),
        (cx + 0.00 * scale, cy + 0.10 * scale),
        (cx + 0.18 * scale, cy - 0.32 * scale),
        (cx + 0.30 * scale, cy + 0.26 * scale),
    ]
    draw.line(m_pts, fill=fill, width=thin, joint="curve")

    # Decorative scroll flourishes left & right
    draw.ellipse(
        (cx - 0.56 * scale, cy - 0.06 * scale, cx - 0.44 * scale, cy + 0.06 * scale),
        outline=fill,
        width=thin,
    )
    draw.ellipse(
        (cx + 0.44 * scale, cy - 0.06 * scale, cx + 0.56 * scale, cy + 0.06 * scale),
        outline=fill,
        width=thin,
    )


def _draw_imperial_proof_eagle(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    scale: float,
    fill: int = 235,
) -> None:
    """Draws a stylized Imperial German Erfurt/Spandau crowned inspection eagle stamp."""
    # Crown
    draw.polygon(
        [
            (cx - 0.20 * scale, cy - 0.26 * scale),
            (cx - 0.26 * scale, cy - 0.42 * scale),
            (cx - 0.10 * scale, cy - 0.34 * scale),
            (cx, cy - 0.46 * scale),
            (cx + 0.10 * scale, cy - 0.34 * scale),
            (cx + 0.26 * scale, cy - 0.42 * scale),
            (cx + 0.20 * scale, cy - 0.26 * scale),
        ],
        fill=fill,
    )
    # Spread wings & shield body
    draw.polygon(
        [
            (cx - 0.44 * scale, cy - 0.12 * scale),
            (cx - 0.14 * scale, cy - 0.18 * scale),
            (cx + 0.14 * scale, cy - 0.18 * scale),
            (cx + 0.44 * scale, cy - 0.12 * scale),
            (cx + 0.30 * scale, cy + 0.10 * scale),
            (cx + 0.12 * scale, cy + 0.06 * scale),
            (cx + 0.18 * scale, cy + 0.36 * scale),
            (cx, cy + 0.26 * scale),
            (cx - 0.18 * scale, cy + 0.36 * scale),
            (cx - 0.12 * scale, cy + 0.06 * scale),
            (cx - 0.30 * scale, cy + 0.10 * scale),
        ],
        fill=fill,
    )


def _save_suite(
    stem: str,
    albedo: np.ndarray,
    height: np.ndarray,
    roughness: np.ndarray,
    metalness: np.ndarray,
    cavity: np.ndarray,
    strength: float,
) -> None:
    ao = np.clip(compute_height_ao(height, strength=1.40) * cavity, 0.18, 1.0)
    roughness = np.clip(roughness, 0.04, 0.92)
    metalness = np.clip(metalness, 0.0, 0.98)
    for field in (albedo, height, roughness, metalness, ao):
        if not np.isfinite(field).all():
            raise ValueError(f"{stem} contains non-finite material samples")

    paths = [
        save_rgb_png(np.clip(albedo, 0.0, 1.0), os.path.join(OUT_DIR, f"{stem}_albedo.png"))
    ]
    normal_path = height_to_normal_png(
        height, strength=strength, out_path=os.path.join(OUT_DIR, f"{stem}_normal.png")
    )
    orm_path = save_orm_png(
        ao, roughness, metalness, out_path=os.path.join(OUT_DIR, f"{stem}_roughness.png")
    )
    if Path(orm_path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normal = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
        orm_rgb = np.clip(
            np.rint(np.stack((ao, roughness, metalness), axis=-1) * 255.0),
            (46, 11, 0),
            (255, 235, 250),
        ).astype(np.uint8)
        maps = (
            (np.rint((normal * 0.5 + 0.5) * 255.0).astype(np.uint8), normal_path),
            (orm_rgb, orm_path),
        )
        for data, path in maps:
            Image.fromarray(data, "RGB").save(
                path, "WEBP", lossless=True, method=4, exact=True
            )
    paths.extend((normal_path, orm_path))
    for path in paths:
        if Path(path).suffix == ".webp":
            Path(path).with_suffix(".png").unlink(missing_ok=True)
    print(
        f"[OK] {stem} {height.shape[1]}x{height.shape[0]} albedo / OpenGL normal / RGB ORM:",
        *paths,
        sep="\n  ",
    )


def build_p08_blued_suite() -> None:
    """Builds 2048x1024 Imperial German Rust-Blued Steel & Golden Straw-Tempered (Gelbangelassen) suite."""
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_barrel_bool = v >= 0.74
    m_toggle_bool = (v >= 0.48) & (v < 0.74) & (u < 0.75)
    m_knurl_bool = (v >= 0.48) & (v < 0.74) & (u >= 0.75)
    m_frame_bool = (v >= 0.235) & (v < 0.48)
    m_straw_bool = v < 0.235

    m_barrel = m_barrel_bool.astype(np.float32)
    m_toggle = m_toggle_bool.astype(np.float32)
    m_knurl = m_knurl_bool.astype(np.float32)
    m_frame = m_frame_bool.astype(np.float32)
    m_straw = m_straw_bool.astype(np.float32)
    m_blued = m_barrel + m_toggle + m_knurl + m_frame

    # Hand draw-filed & rust-carded Imperial DWM steel micro-grain
    fine_drawfile = cnc_toolpath(h, w, pitch_px=2.8, angle_deg=0.6, seed=1908)
    straw_buff = cnc_toolpath(h, w, pitch_px=2.2, angle_deg=12.0, seed=1914)
    oil_cloud = fbm_noise(h, w, base_freq=7.0, octaves=4, seed=1917)
    polish_band = seamless_band_noise(h, w, 110, 400, seed=1918)
    handling_scratches = scratch_field(
        h, w, count=820, min_len=6, max_len=36, angle_deg=2.0, angle_spread=11.0, seed=1919
    )

    # 1. Authentic DWM 1917 Engravings, Chamber Date, GESICHERT & GELADEN Marks
    engrave_mask = np.zeros((h, w), dtype=np.float32)
    white_fill_mask = np.zeros((h, w), dtype=np.float32)

    # Band 1 (v in [0.74, 1.00]): "1917" chamber date + "GELADEN" extractor + "8,82" bore stamp
    img_b1 = Image.new("L", (1680, 210), 0)
    db1 = ImageDraw.Draw(img_b1)
    db1.text((310, 105), "1917", fill=255, font=load_font(FONT_SERIF, 108), anchor="mm")
    db1.text((790, 105), "GELADEN", fill=255, font=load_font(FONT_SANS, 64), anchor="mm")
    db1.text((1240, 82), "8,82", fill=235, font=load_font(FONT_SERIF, 54), anchor="mm")
    db1.text((1240, 152), "4821", fill=225, font=load_font(FONT_SANS, 44), anchor="mm")
    _paste_world_mask(engrave_mask, img_b1, 0.08, 0.90, 0.76, 0.96)

    # Highlight GELADEN in crisp museum white-silver lacquer
    img_gel = Image.new("L", (420, 120), 0)
    ImageDraw.Draw(img_gel).text(
        (210, 60), "GELADEN", fill=255, font=load_font(FONT_SANS, 62), anchor="mm"
    )
    _paste_world_mask(white_fill_mask, img_gel, 0.36, 0.565, 0.80, 0.92)

    # Band 2a (u in [0.06, 0.44], v in [0.50, 0.72]): Intertwined DWM Scroll Monogram on Front Toggle
    img_dwm = Image.new("L", (760, 240), 0)
    ddwm = ImageDraw.Draw(img_dwm)
    _draw_dwm_scroll_monogram(ddwm, 380, 120, 205, fill=255)
    _paste_world_mask(engrave_mask, img_dwm, 0.06, 0.43, 0.50, 0.72)

    # Band 2b (u in [0.46, 0.74], v in [0.50, 0.72]): 3 Imperial Crowned Eagles + Nitro Proof
    img_prf = Image.new("L", (560, 220), 0)
    dprf = ImageDraw.Draw(img_prf)
    for px in (110, 235, 360):
        _draw_imperial_proof_eagle(dprf, px, 112, 115, fill=240)
    dprf.text((475, 115), "S", fill=240, font=load_font(FONT_ITALIC, 72), anchor="mm")
    _paste_world_mask(engrave_mask, img_prf, 0.46, 0.735, 0.50, 0.715)

    # Band 3a (u in [0.06, 0.63], v in [0.25, 0.46]): "GESICHERT" safety pocket + frame serial "4821 a"
    img_fr = Image.new("L", (1160, 220), 0)
    dfr = ImageDraw.Draw(img_fr)
    dfr.rounded_rectangle((46, 28, 434, 116), radius=22, outline=220, width=5)
    dfr.text((240, 72), "GESICHERT", fill=255, font=load_font(FONT_COND, 52), anchor="mm")
    dfr.text((760, 88), "4821 a", fill=245, font=load_font(FONT_SERIF, 62), anchor="mm")
    dfr.text((760, 162), "GERMANY · P.08", fill=220, font=load_font(FONT_SANS, 38), anchor="mm")
    _paste_world_mask(engrave_mask, img_fr, 0.06, 0.625, 0.255, 0.465)

    img_ges = Image.new("L", (400, 96), 0)
    ImageDraw.Draw(img_ges).text(
        (200, 48), "GESICHERT", fill=255, font=load_font(FONT_COND, 50), anchor="mm"
    )
    _paste_world_mask(white_fill_mask, img_ges, 0.08, 0.275, 0.365, 0.455)

    # Band 3b (u in [0.66, 0.95], v in [0.26, 0.46]): Sideplate boss & matching "21" stamp
    img_sp = Image.new("L", (580, 200), 0)
    dsp = ImageDraw.Draw(img_sp)
    dsp.rounded_rectangle((18, 18, 562, 182), radius=24, outline=195, width=5)
    dsp.ellipse((210, 32, 370, 168), outline=215, width=6)
    dsp.text((115, 62), "21", fill=250, font=load_font(FONT_SERIF, 54), anchor="mm")
    _paste_world_mask(engrave_mask, img_sp, 0.665, 0.948, 0.26, 0.455)

    # Band 4 (v < 0.235): Straw-tempered assembly digits "21" & thumb-lever serrations
    img_st = Image.new("L", (1840, 220), 0)
    dst = ImageDraw.Draw(img_st)
    dst.text((280, 110), "21", fill=235, font=load_font(FONT_SERIF, 56), anchor="mm")
    # Crisp anti-slip serration grooves on straw-tempered takedown & thumb safety pads (u in [0.38, 0.63])
    for sx in range(690, 1160, 22):
        dst.line([(sx, 26), (sx, 194)], fill=235, width=8)
    dst.text((1560, 110), "21", fill=225, font=load_font(FONT_SERIF, 48), anchor="mm")
    _paste_world_mask(engrave_mask, img_st, 0.05, 0.95, 0.025, 0.215)

    beveled_engrave = bevel_mask(engrave_mask > 0.30, width_px=2.2, profile="trapezoid")

    # 2. Circular 24-LPI Diamond-Knurled Toggle Ears (u in [0.75, 0.97], v in [0.48, 0.74])
    knurl_diamonds = diamond_knurl(u, v, freq_u=220.0, freq_v=110.0)
    knurl_cx, knurl_cy = 0.86, 0.61
    knurl_rad = np.hypot((u - knurl_cx) * 2.0, v - knurl_cy)
    knurl_disc = (1.0 - smoothstep(0.105, 0.118, knurl_rad)) * m_knurl
    knurl_ring = (
        smoothstep(0.098, 0.106, knurl_rad)
        * (1.0 - smoothstep(0.114, 0.122, knurl_rad))
        * m_knurl
    )

    # Muzzle & high-edge holster silver burnishing
    edge_prox = _edge_proximity(m_barrel_bool | m_frame_bool, 4.8) * smoothstep(0.72, 0.94, u)
    holster_wear, _ = chipped_edge_wear(
        edge_prox * smoothstep(-0.08, 0.46, fbm_noise(h, w, base_freq=38, octaves=3, seed=1920)),
        seed=1921,
        wear_amount=0.36,
    )

    # 3. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += (m_barrel + m_toggle + m_frame) * (
        0.011 * fine_drawfile + 0.006 * polish_band - 0.015 * handling_scratches
    )
    height -= m_blued * beveled_engrave * 0.21
    height += knurl_disc * (0.175 * knurl_diamonds) + 0.07 * knurl_ring
    height += m_straw * (
        0.009 * straw_buff + 0.004 * polish_band - 0.16 * beveled_engrave
    )

    # 4. Albedo synthesis:
    #    - Imperial German rust-blued steel (calibrated sRGB luma ~0.255 >> 0.12 floor!)
    #    - Authentic 240 deg C Golden Straw-Tempered ("Gelbangelassen") small-parts band!
    rust_blued = np.array([0.228, 0.262, 0.328], dtype=np.float32)
    knurl_blued = np.array([0.205, 0.238, 0.298], dtype=np.float32)
    silver_burnish = np.array([0.68, 0.72, 0.78], dtype=np.float32)
    engrave_steel = np.array([0.60, 0.65, 0.73], dtype=np.float32)
    white_lacquer = np.array([0.88, 0.90, 0.92], dtype=np.float32)

    # Warm golden-amber oxide interference tint ("Gelbangelassen")
    straw_gold_base = np.array([0.815, 0.658, 0.302], dtype=np.float32)
    straw_gold_warm = np.array([0.745, 0.562, 0.238], dtype=np.float32)

    albedo = np.zeros((h, w, 3), dtype=np.float32)
    albedo += (m_barrel + m_toggle + m_frame)[..., None] * (
        rust_blued[None, None, :]
        * (0.97 + 0.05 * oil_cloud[..., None] + 0.025 * fine_drawfile[..., None])
    )
    albedo += m_knurl[..., None] * (
        knurl_blued[None, None, :]
        * (0.92 + 0.14 * np.maximum(0.0, knurl_diamonds)[..., None] * knurl_disc[..., None])
    )

    # Straw-tempered temper-color gradient + subtle iridescent oil variation
    straw_var = smoothstep(-0.35, 0.45, oil_cloud)[..., None]
    straw_rgb = (
        straw_gold_warm[None, None, :] * (1.0 - straw_var)
        + straw_gold_base[None, None, :] * straw_var
    ) * (0.98 + 0.025 * straw_buff[..., None])
    albedo += m_straw[..., None] * straw_rgb

    # Engraved silver-bright steel contrast & white GESICHERT / GELADEN enamel fill
    eng_blued = np.clip(engrave_mask * m_blued, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.68 * eng_blued) + engrave_steel[None, None, :] * (0.68 * eng_blued)

    eng_straw = np.clip(engrave_mask * m_straw, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.30 * eng_straw) + (straw_gold_warm * 0.62)[None, None, :] * (0.30 * eng_straw)

    w_fill = np.clip(white_fill_mask, 0.0, 1.0)[..., None]
    albedo = albedo * (1.0 - 0.82 * w_fill) + white_lacquer[None, None, :] * (0.82 * w_fill)

    # Knurl peak thumb-burnish & muzzle holster silvering
    knurl_tips = knurl_disc * smoothstep(0.55, 0.95, knurl_diamonds)
    wear_mix = np.clip(0.62 * holster_wear + 0.32 * knurl_tips + 0.36 * knurl_ring, 0.0, 0.85)[..., None]
    albedo = albedo * (1.0 - wear_mix) + silver_burnish[None, None, :] * wear_mix

    # 5. Packed ORM (R = AO, G = Roughness, B = Metalness)
    #    Straw-tempered region strictly targets B: metalness = 0.90, G: roughness = 0.22!
    roughness = (
        (m_barrel + m_toggle + m_frame)
        * (0.195 + 0.018 * fine_drawfile - 0.014 * oil_cloud + 0.16 * engrave_mask)
        + m_knurl * (0.36 - 0.12 * knurl_tips)
        + m_straw * (0.22 + 0.012 * straw_buff + 0.08 * engrave_mask)
    )
    roughness = roughness * (1.0 - 0.35 * holster_wear) + 0.12 * (0.35 * holster_wear)

    metalness = (
        (m_barrel + m_toggle + m_frame) * 0.94
        + m_knurl * 0.92
        + m_straw * 0.90
    )
    metalness = metalness * (1.0 - 0.85 * white_fill_mask) + 0.12 * (0.85 * white_fill_mask)

    cavity = (
        1.0
        - 0.25 * beveled_engrave
        - 0.24 * knurl_disc * np.maximum(0.0, -knurl_diamonds)
    )

    _save_suite("p08_blued", albedo, height, roughness, metalness, cavity, strength=2.40)


def build_p08_walnut_suite() -> None:
    """Builds 2048x1024 20-LPI Checkered European Walnut Grips, Nickel Mag & Concentric Base Knob suite."""
    w, h = 2048, 1024
    u, v = _uv_grid(h, w)

    m_wood_bool = u < 0.71
    m_mag_tube_bool = (u >= 0.71) & (v >= 0.35)
    m_mag_knob_bool = (u >= 0.71) & (v < 0.35)

    m_wood = m_wood_bool.astype(np.float32)
    m_mag_tube = m_mag_tube_bool.astype(np.float32)
    m_mag_knob = m_mag_knob_bool.astype(np.float32)

    # 1. European Walnut (Juglans regia) heartwood figure & open vessel pores
    walnut_macro = fbm_noise(h, w, base_freq=5.5, octaves=5, seed=1928, aniso_x=1.5, aniso_y=0.72)
    grain_phase = u * 16.0 + 0.50 * walnut_macro + 0.16 * fbm_noise(h, w, base_freq=12.0, octaves=3, seed=1929)
    ring_wave = 0.5 + 0.5 * np.sin(grain_phase * np.pi * 2.0)
    wood_pores = scratch_field(
        h, w, count=3800, min_len=8, max_len=32, angle_deg=88.0, angle_spread=8.5, seed=1930
    )
    wood_fiber = cnc_toolpath(h, w, pitch_px=3.1, angle_deg=87.5, seed=1931)

    # Full-panel 20-LPI diamond hand-checkering on Left (u in [0.055, 0.335]) & Right (u in [0.395, 0.675])
    def _luger_grip_checkering(u_min: float, u_max: float) -> np.ndarray:
        in_u = smoothstep(u_min, u_min + 0.012, u) * (1.0 - smoothstep(u_max - 0.012, u_max, u))
        in_v = smoothstep(0.08, 0.095, v) * (1.0 - smoothstep(0.885, 0.905, v))
        return (in_u * in_v).astype(np.float32)

    chk_mask = np.clip(
        _luger_grip_checkering(0.055, 0.335) + _luger_grip_checkering(0.395, 0.675),
        0.0,
        1.0,
    ) * m_wood
    chk_border = _edge_proximity(chk_mask > 0.45, width=5.0)
    diamonds_20lpi = diamond_knurl(u, v, freq_u=180.0, freq_v=90.0)

    # Lower slotted blued grip retention screw heads on Left (u=0.195, v=0.125) & Right (u=0.535, v=0.125)
    screw_mask = np.zeros((h, w), dtype=np.float32)
    screw_slot = np.zeros((h, w), dtype=np.float32)
    s_img = Image.new("L", (160, 160), 0)
    sl_img = Image.new("L", (160, 160), 0)
    ImageDraw.Draw(s_img).ellipse((16, 16, 144, 144), fill=255)
    ImageDraw.Draw(sl_img).line([(26, 80), (134, 80)], fill=255, width=20)
    for uc in (0.195, 0.535):
        _paste_world_mask(screw_mask, s_img, uc - 0.022, uc + 0.022, 0.082, 0.168)
        _paste_world_mask(screw_slot, sl_img, uc - 0.022, uc + 0.022, 0.082, 0.168)

    chk_active = chk_mask * (1.0 - np.clip(screw_mask * 1.35, 0.0, 1.0))

    # 2. Brushed Nickel Sheet-Steel Magazine Tube (u >= 0.71, v >= 0.35)
    nickel_brush = cnc_toolpath(h, w, pitch_px=2.4, angle_deg=89.0, seed=1932)
    mag_wear_streaks = scratch_field(
        h, w, count=900, min_len=16, max_len=75, angle_deg=90.0, angle_spread=3.5, seed=1933
    )
    mag_stamp = np.zeros((h, w), dtype=np.float32)
    img_ms = Image.new("L", (480, 480), 0)
    dms = ImageDraw.Draw(img_ms)
    # Sheet-steel follower slot border & P.08 / Cal. 9m/m markings
    dms.rounded_rectangle((195, 36, 285, 375), radius=34, outline=230, width=8)
    dms.text((115, 425), "P.08", fill=245, font=load_font(FONT_SANS, 52), anchor="mm")
    dms.text((365, 425), "9 m/m", fill=235, font=load_font(FONT_SERIF, 44), anchor="mm")
    _paste_world_mask(mag_stamp, img_ms, 0.735, 0.965, 0.38, 0.94)
    mag_bevel = bevel_mask(mag_stamp > 0.30, width_px=2.0, profile="trapezoid")

    # 3. Concentric-Grooved Machined Alloy Magazine Base Pull-Knob (u >= 0.71, v < 0.35)
    #    Twin circular gripping ears at (u=0.79, v=0.18) and (u=0.92, v=0.18)
    r_ear1 = np.hypot((u - 0.795) * 2.0, v - 0.185)
    r_ear2 = np.hypot((u - 0.915) * 2.0, v - 0.185)
    ear_r = np.minimum(r_ear1, r_ear2)
    in_ears = (1.0 - smoothstep(0.095, 0.108, ear_r)) * m_mag_knob
    concentric_rings = np.sin(ear_r * 340.0 * np.pi * 2.0).astype(np.float32) * in_ears

    knob_stamp = np.zeros((h, w), dtype=np.float32)
    img_ks = Image.new("L", (460, 120), 0)
    ImageDraw.Draw(img_ks).text(
        (230, 60), "4821 a", fill=245, font=load_font(FONT_SERIF, 54), anchor="mm"
    )
    _paste_world_mask(knob_stamp, img_ks, 0.74, 0.96, 0.03, 0.10)
    knob_bevel = bevel_mask(knob_stamp > 0.30, width_px=2.0, profile="trapezoid")

    # 4. Heightfield synthesis
    height = np.full((h, w), 0.50, dtype=np.float32)
    height += m_wood * (
        (1.0 - chk_active) * (0.018 * wood_fiber - 0.040 * wood_pores + 0.014 * walnut_macro)
        + chk_active * (0.17 * diamonds_20lpi)
        - 0.09 * chk_border * (1.0 - screw_mask)
        + 0.05 * screw_mask
        - 0.14 * screw_slot
    )
    height += m_mag_tube * (
        0.012 * nickel_brush - 0.018 * mag_wear_streaks - 0.18 * mag_bevel
    )
    height += m_mag_knob * (
        0.135 * concentric_rings + 0.008 * nickel_brush - 0.16 * knob_bevel
    )

    # 5. Albedo synthesis
    walnut_light = np.array([0.495, 0.302, 0.165], dtype=np.float32)
    walnut_mid = np.array([0.382, 0.225, 0.124], dtype=np.float32)
    walnut_dark = np.array([0.268, 0.158, 0.088], dtype=np.float32)

    t_ring = smoothstep(0.16, 0.85, ring_wave)
    wood_rgb = (
        walnut_dark[None, None, :] * (1.0 - t_ring[..., None])
        + walnut_mid[None, None, :] * t_ring[..., None]
    )
    fig_glow = smoothstep(0.14, 0.78, walnut_macro)[..., None]
    wood_rgb = wood_rgb * (1.0 - 0.42 * fig_glow) + walnut_light[None, None, :] * (0.42 * fig_glow)
    wood_rgb *= 1.0 - 0.11 * wood_pores[..., None]

    chk_rgb = wood_rgb * (0.87 + 0.15 * np.maximum(0.0, diamonds_20lpi)[..., None])
    wood_final = wood_rgb * (1.0 - chk_active[..., None]) + chk_rgb * chk_active[..., None]

    blued_screw_col = np.array([0.23, 0.27, 0.34], dtype=np.float32)
    s_hit = np.clip(screw_mask, 0.0, 1.0)[..., None]
    wood_final = wood_final * (1.0 - s_hit) + blued_screw_col[None, None, :] * s_hit

    nickel_col = np.array([0.745, 0.772, 0.808], dtype=np.float32)
    alloy_col = np.array([0.685, 0.715, 0.758], dtype=np.float32)
    stamp_dark = np.array([0.34, 0.37, 0.42], dtype=np.float32)

    tube_rgb = nickel_col[None, None, :] * (
        0.97 + 0.03 * nickel_brush[..., None] + 0.04 * mag_wear_streaks[..., None]
    )
    m_st = np.clip(mag_stamp, 0.0, 1.0)[..., None]
    tube_rgb = tube_rgb * (1.0 - 0.55 * m_st) + stamp_dark[None, None, :] * (0.55 * m_st)

    knob_rgb = alloy_col[None, None, :] * (
        0.95 + 0.06 * concentric_rings[..., None] + 0.02 * nickel_brush[..., None]
    )
    k_st = np.clip(knob_stamp, 0.0, 1.0)[..., None]
    knob_rgb = knob_rgb * (1.0 - 0.55 * k_st) + stamp_dark[None, None, :] * (0.55 * k_st)

    albedo = (
        m_wood[..., None] * wood_final
        + m_mag_tube[..., None] * tube_rgb
        + m_mag_knob[..., None] * knob_rgb
    )

    # 6. Packed ORM (Walnut B=0.0 dielectric vs Brushed Nickel B=0.92 & Alloy Knob B=0.88!)
    s_bool = (screw_mask > 0.25).astype(np.float32)
    roughness = (
        m_wood
        * (
            (1.0 - chk_active) * (0.56 + 0.05 * wood_pores - 0.03 * walnut_macro)
            + chk_active * (0.70 - 0.04 * np.maximum(0.0, diamonds_20lpi))
        )
        * (1.0 - s_bool)
        + m_wood * s_bool * 0.22
        + m_mag_tube * (0.23 - 0.04 * mag_wear_streaks + 0.14 * mag_stamp)
        + m_mag_knob * (0.25 + 0.05 * np.abs(concentric_rings) + 0.12 * knob_stamp)
    )

    metalness = (
        m_wood * s_bool * 0.92
        + m_mag_tube * 0.92
        + m_mag_knob * 0.88
    )

    cavity = (
        1.0
        - 0.24 * chk_active * np.maximum(0.0, -diamonds_20lpi)
        - 0.18 * chk_border * (1.0 - screw_mask)
        - 0.22 * (m_mag_tube * mag_bevel + m_mag_knob * knob_bevel)
        - 0.16 * m_mag_knob * np.maximum(0.0, -concentric_rings)
    )

    _save_suite("p08_walnut", albedo, height, roughness, metalness, cavity, strength=2.45)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    build_p08_blued_suite()
    build_p08_walnut_suite()
