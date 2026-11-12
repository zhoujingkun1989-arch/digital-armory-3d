#!/usr/bin/env python3
"""G17 material atlases. Coordinates below are the mesh's fixed UV contract.

Output stems/sizes (WebP by default; PBR_OUTPUT_FORMAT=png also supported):
  slide_{albedo,normal,roughness} 2048x1024
  barrel_{albedo,normal,roughness} 1024x1024
  frame_{albedo,normal,roughness} 1536x1536
  mag_{albedo,normal,roughness} 1024x1024
  metal_detail_{normal,roughness}, polymer_detail_{normal,roughness} 1024x1024
All *_roughness files are LINEAR RGB ORM: R=AO, G=roughness, B=metalness.
Detail G is a multiplier centered on .88; detail B is deliberately constant 1.
Albedo contains material color, never painted lighting or airbrushed wear bars.
"""

import math
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR, bevel_mask, chipped_edge_wear, cnc_toolpath, compute_convexity,
    compute_height_ao, diamond_knurl, fbm_noise, height_to_normal_map,
    laser_stipple_field, load_font, save_orm_png, save_rgb_png, scratch_field,
    seamless_band_noise, smoothstep, worley_cellular,
)

FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


def uv_grid(h, w):
    return ((np.arange(w, dtype=np.float32)[None, :] + .5) / w,
            1.0 - (np.arange(h, dtype=np.float32)[:, None] + .5) / h)


def tint(albedo, mask, color):
    albedo *= 1.0 - mask[..., None]
    albedo += np.asarray(color, dtype=np.float32) * mask[..., None]


def paste_world_patch(target_mask, canvas_img, u0, u1, v0, v1,
                      resample=Image.Resampling.LANCZOS):
    """Project an isotropic world-space PIL 'L' canvas onto an anisotropic UV island."""
    h, w = target_mask.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    resized = canvas_img.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=resample)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    target_mask[y0:y1, x0:x1] = np.maximum(target_mask[y0:y1, x0:x1], arr)


def save_suite(stem, albedo, height, roughness, metalness, *, crevice=None,
               strength=1.6, seamless=False):
    """Core packing/normal convention, then lossless encoding for linear data.

    The photographic WebP encoder subsamples chroma. Temporary PNGs preserve
    independent ORM channels and periodic normal derivatives. Only final
    requested files are written into public/textures.
    """
    if seamless:
        pad = 48  # exceeds the largest AO Gaussian's support
        ao = compute_height_ao(np.pad(height, pad, mode="wrap"), strength=.8)
        ao = ao[pad:-pad, pad:-pad]
        ao = np.clip(ao, .80 if stem == "metal_detail" else .78, 1.0)
        roughness = np.clip(roughness, .72 if stem == "metal_detail" else .75, 1.0)
    else:
        ao = compute_height_ao(height, strength=1.15)
        # Quantization-safe limits: decoded 8-bit channels stay in contract.
        roughness = np.clip(roughness, 13/255, 234/255)
        metalness = np.clip(metalness, 6/255, 249/255)
    if crevice is not None:
        ao *= crevice
    ao = np.clip(ao, 46/255, 1.0)
    for field in (height, ao, roughness, metalness):
        if field.shape != height.shape or not np.isfinite(field).all():
            raise ValueError(f"Invalid {stem} material field")
    if albedo is not None:
        save_rgb_png(albedo, os.path.join(OUT_DIR, f"{stem}_albedo.png"))
    requested = os.environ.get("PBR_OUTPUT_FORMAT")
    fmt = "png" if (requested or "webp").lower() == "png" else "webp"
    with TemporaryDirectory(prefix=f"{stem}-linear-") as tmp:
        try:
            os.environ["PBR_OUTPUT_FORMAT"] = "png"
            normal_path = height_to_normal_map(
                height, strength, os.path.join(tmp, f"{stem}_normal.png"), seamless=seamless)
            orm_path = save_orm_png(
                ao, roughness, metalness, os.path.join(tmp, f"{stem}_roughness.png"))
        finally:
            if requested is None:
                os.environ.pop("PBR_OUTPUT_FORMAT", None)
            else:
                os.environ["PBR_OUTPUT_FORMAT"] = requested
        for kind, path in (("normal", normal_path), ("roughness", orm_path)):
            with Image.open(path) as img:
                target = os.path.join(OUT_DIR, f"{stem}_{kind}.{fmt}")
                if fmt == "webp":
                    img.save(target, "WEBP", lossless=True, exact=True, method=6)
                else:
                    img.save(target, "PNG", optimize=True)
    print(f"[OK] {stem}: {height.shape[1]}x{height.shape[0]} RGB normal + ORM ({fmt})", flush=True)


def draw_glock_g_emblem(draw, x0, y0, size, width=5):
    h_box = int(round(size * .86))
    draw.rounded_rectangle([x0, y0, x0 + size, y0 + h_box],
                           radius=max(4, size // 9), outline=255, width=width)
    pad = int(round(size * .20))
    x1, y1 = x0 + size - pad, y0 + h_box - pad
    ix0, iy0 = x0 + pad, y0 + pad
    mid = (iy0 + y1) // 2
    draw.line([(x1, iy0), (ix0, iy0), (ix0, y1), (x1, y1), (x1, mid),
               (ix0 + int((x1 - ix0) * .42), mid)], fill=255, width=max(2, width - 1))


def draw_austrian_npv_eagle(draw, cx, cy, rad, width=3):
    """Austrian Vienna Proof House (NPv) eagle & shield proof stamp."""
    # Heraldic shield body
    sh_w, sh_h = int(rad * .72), int(rad * .85)
    draw.polygon([
        (cx - sh_w, cy - int(sh_h * .65)),
        (cx + sh_w, cy - int(sh_h * .65)),
        (cx + sh_w, cy + int(sh_h * .25)),
        (cx, cy + sh_h),
        (cx - sh_w, cy + int(sh_h * .25)),
    ], outline=255, width=width)
    # Austrian fess bar inside shield
    draw.line([(cx - sh_w + 2, cy - int(sh_h * .12)),
               (cx + sh_w - 2, cy - int(sh_h * .12))], fill=255, width=width)
    # Spread eagle wings & crown ticks
    for s in (-1, 1):
        draw.line([(cx + s * sh_w, cy - int(sh_h * .35)),
                   (cx + s * int(rad * 1.32), cy - int(rad * .75))], fill=255, width=width)
        draw.line([(cx + s * sh_w, cy - int(sh_h * .05)),
                   (cx + s * int(rad * 1.22), cy - int(rad * .28))], fill=255, width=max(2, width - 1))
    draw.line([(cx, cy - int(sh_h * .65)), (cx, cy - int(rad * 1.15))], fill=255, width=width)


def draw_pentagon_dot(draw, cx, cy, rad):
    pts = [
        (cx + rad * math.sin(2 * math.pi * k / 5),
         cy - rad * math.cos(2 * math.pi * k / 5))
        for k in range(5)
    ]
    draw.polygon(pts, outline=255, width=max(2, int(rad * .24)))


def stamp_material(albedo, height, roughness, metalness, mask,
                   color=(.07, .078, .09), depth=1.25, metal=.68, rough=.46):
    """Recessed lettering gets relieved normals and cavity, not white paint."""
    height -= bevel_mask(mask, width_px=1.35) * depth
    tint(albedo, mask, color)
    roughness[:] = roughness * (1 - mask) + rough * mask
    metalness[:] = metalness * (1 - mask) + metal * mask


def local_ticks(h, w, u0, u1, v0, v1, seed, count=16):
    """Short brass transfer strokes, confined behind the ejection port."""
    x0, x1 = int(u0 * w), int(u1 * w)
    y0, y1 = int((1 - v1) * h), int((1 - v0) * h)
    result = np.zeros((h, w), np.float32)
    result[y0:y1, x0:x1] = scratch_field(y1 - y0, x1 - x0, count=count,
        min_len=2, max_len=9, angle_deg=-32, angle_spread=25, seed=seed)
    return result


def build_slide_suite():
    w, h = 2048, 1024
    u, v = uv_grid(h, w)
    grain, grain_edges = worley_cellular(h, w, 280, 560, seed=101)
    grinding = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=0, seed=102)
    fine = seamless_band_noise(h, w, 100, 450, seed=103)
    oil = fbm_noise(h, w, base_freq=4, octaves=4, seed=104)
    albedo = np.empty((h, w, 3), np.float32)
    albedo[:] = (.242, .260, .284)
    albedo += (.007 * grinding + .009 * (grain_edges - grain) - .004 * oil)[..., None]
    height = .028 * grinding + .038 * (grain_edges - grain) + .012 * fine
    roughness = .30 + .018 * fine + .014 * grinding - .024 * oil
    metalness = np.full((h, w), .58, np.float32)

    # Fixed right v=.55..98, left v=.08..51 (18.75 x 3.03 cm -> py/px = 1.386x).
    # Confine holster/corner wear to forward muzzle bullnose & port corners with
    # multi-scale FBM breakup — NEVER a ruler-straight silver bar or polka-dot row.
    right = (v >= .55) & (v <= .98)
    left = (v >= .08) & (v <= .51)
    breakup = smoothstep(.04, .58, fbm_noise(h, w, base_freq=34, octaves=4, seed=108))
    proximity = np.zeros((h, w), np.float32)
    for band, is_right, shoulder, muzzle in ((right, True, .55 + .855 * .43, .968),
                                             (left, False, .08 + .855 * .43, .032)):
        xn = (u - .02) / .96 if is_right else (.98 - u) / .96
        yn = (v - (.55 if is_right else .08)) / .43
        holster_bias = .16 + .84 * smoothstep(.62, .94, xn)
        shoulder_edge = np.clip(1 - np.abs(v - shoulder) / .0045, 0, 1) * holster_bias
        corner_gate = smoothstep(.68, .88, yn) + (1.0 - smoothstep(.08, .24, yn)) * .55
        muzzle_edge = np.clip(1 - np.abs(u - muzzle) / .007, 0, 1) * np.clip(corner_gate, 0, 1)
        local_prox = np.maximum(shoulder_edge, muzzle_edge) * breakup * band
        proximity = np.maximum(proximity, local_prox)

    bare, oxide = chipped_edge_wear(proximity, seed=105, wear_amount=.42)
    scratches = scratch_field(h, w, count=680, min_len=6, max_len=52,
        angle_deg=0, angle_spread=5, seed=106,
        mask=np.clip(proximity * 1.5, 0, 1))
    wear = np.maximum(bare, scratches * .75)
    tint(albedo, oxide * .24, (.185, .200, .218))
    tint(albedo, wear, (.60, .63, .67))
    roughness = roughness * (1 - wear) + .17 * wear
    wear_m = np.clip(wear * 1.45, 0.0, 1.0)
    metalness = metalness * (1 - wear_m) + .97 * wear_m
    height -= .040 * wear + .028 * scratches

    brass = local_ticks(h, w, .351, .389, .805, .864, 107, count=19)
    tint(albedo, brass * .78, (.64, .48, .23))
    brass_m = np.clip(brass * 1.45, 0.0, 1.0)
    metalness = metalness * (1 - brass_m) + .97 * brass_m
    roughness = roughness * (1 - brass) + .21 * brass

    # Bottom milled swatch, unchanged u>=.52/v<.076; top deck uses .03..49.
    milled = (v < .076) & (u >= .52)
    albedo[milled] = (.192, .208, .228)
    roughness[milled], metalness[milled] = .40, .54
    height[milled] = .035 * grinding[milled]

    # World-proportional 2x supersampled rollmarks (18.75 x 3.03 cm -> 3750 x 606 px)
    # Eliminate the 1.386x vertical UV stretch so [G], AUSTRIA, 9x19 & NPv render 1:1.
    cw, ch = 3750, 606
    left_canvas = Image.new("L", (cw, ch), 0)
    dl = ImageDraw.Draw(left_canvas)
    cy_l = int(ch * (1.0 - (.335 - .08) / .43))
    draw_glock_g_emblem(dl, 370, cy_l - 76, 168, width=10)
    dl.text((710, cy_l - 62), "17", fill=255, font=load_font(FONT_DIN, 120))
    dl.text((1045, cy_l - 42), "AUSTRIA", fill=255, font=load_font(FONT_DIN, 82))
    dl.text((1710, cy_l - 42), "9×19", fill=255, font=load_font(FONT_DIN, 82))

    right_canvas = Image.new("L", (cw, ch), 0)
    dr = ImageDraw.Draw(right_canvas)
    cy_r = int(ch * (1.0 - (.775 - .55) / .43))
    draw_austrian_npv_eagle(dr, 2175, cy_r + 6, 28, width=4)
    dr.text((2222, cy_r - 24), "NPv", fill=235, font=load_font(FONT_COND, 38))
    dr.text((2308, cy_r - 28), "KPV 892", fill=255, font=load_font(FONT_DIN, 58))
    draw_pentagon_dot(dr, 2608, cy_r + 2, 16)

    mark = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(mark, left_canvas, .02, .98, .08, .51)
    paste_world_patch(mark, right_canvas, .02, .98, .55, .98)
    stamp_material(albedo, height, roughness, metalness, mark, depth=1.55,
                   color=(.168, .182, .200), metal=.52, rough=.44)
    conv_sl = smoothstep(.08, .52, compute_convexity(height, sigma=1.8)) * (right | left)
    albedo += (conv_sl * .022)[..., None]
    roughness -= conv_sl * .040
    save_suite("slide", albedo, height, roughness, metalness,
               crevice=1 - .34 * mark, strength=1.55)


def build_barrel_suite():
    w = h = 1024
    u, v = uv_grid(h, w)
    fine = seamless_band_noise(h, w, 75, 390, seed=201)
    # Tube u is axial, v wraps circumference: turning lines run along v.
    turning = cnc_toolpath(h, w, pitch_px=3.2, angle_deg=90, seed=202)
    grinding = cnc_toolpath(h, w, pitch_px=3.6, angle_deg=0, seed=203)
    breakup = fbm_noise(h, w, base_freq=26, octaves=4, seed=204)
    albedo = np.empty((h, w, 3), np.float32)
    albedo[:] = (.222, .238, .260)
    albedo += (.008 * fine + .006 * turning)[..., None]
    height = .025 * turning + .018 * fine
    roughness = .26 + .016 * fine + .012 * turning
    metalness = np.full((h, w), .60, np.float32)

    # Original hood top u>=.50/v>=.52; tube v=.11..49. Broken contact
    # crescents follow the cylinder instead of complete white ring decals.
    hood = np.broadcast_to((u >= .50) & (v >= .52), (h, w))
    tube = (v >= .11) & (v <= .49)
    angle = (v - .11) / .38 * (2 * math.pi)
    crescent_gate = smoothstep(-.10, .50, np.cos(angle + .45))
    proximity = np.zeros((h, w), np.float32)
    for center, width, bend in ((.85, .014, .012), (.76, .009, .008), (.42, .016, .015)):
        arc = center + bend * np.cos(angle)
        contact = np.clip(1 - np.abs(u - arc) / width, 0, 1) * crescent_gate * tube
        proximity = np.maximum(proximity, contact)
    for center, width in ((.62, .025), (.84, .019)):
        track = np.clip(1 - np.abs(u - center) / width, 0, 1) * hood
        track = track * smoothstep(.54, .60, v) * (1 - smoothstep(.88, .96, v))
        proximity = np.maximum(proximity, track)
    bare, transition = chipped_edge_wear(proximity, seed=205, wear_amount=.55)
    scuff = scratch_field(h, w, count=880, min_len=4, max_len=36,
        angle_deg=90, angle_spread=8, seed=206, mask=proximity)
    rub = np.maximum(bare, scuff)
    tint(albedo, transition * .18, (.25, .27, .29))
    tint(albedo, rub, (.65, .68, .72))
    roughness = roughness * (1 - rub) + .14 * rub
    metalness = metalness * (1 - rub) + .97 * rub
    height = height * (1 - .65 * rub) - .035 * scuff
    height[hood] = .024 * grinding[hood] + .012 * fine[hood] - .035 * scuff[hood]

    # World-proportional hood_right canvas: u=.05..47, v=.56..94 maps 3.05 x 1.55 cm
    # (py/px = 1.780x). Isotropic 300 px/cm -> 915 x 465 px eliminates 1.78x stretch.
    hood_canvas = Image.new("L", (915, 465), 0)
    dh = ImageDraw.Draw(hood_canvas)
    dh.text((195, 118), "9×19", fill=255, font=load_font(FONT_DIN, 86))
    draw_austrian_npv_eagle(dh, 545, 162, 34, width=4)
    dh.text((592, 138), "AT", fill=235, font=load_font(FONT_COND, 42))
    dh.text((195, 244), "KPV 892", fill=255, font=load_font(FONT_DIN, 62))
    draw_pentagon_dot(dh, 560, 276, 20)

    mark = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(mark, hood_canvas, .05, .47, .56, .94)
    stamp_material(albedo, height, roughness, metalness, mark,
                   color=(.162, .176, .194), metal=.54, rough=.42)

    # Carbon-fouled bore interior: dielectric carbon soot B <= 0.05
    bore = (v <= .10) & (u >= .64) & (u <= .83)
    albedo[bore] = np.array((.042, .046, .052)) + .004 * fine[bore, None]
    roughness[bore], metalness[bore] = .84, .04
    height[bore] = .045 * fine[bore]

    polished = (v <= .10) & (u >= .85)
    albedo[polished] = np.array((.82, .84, .87)) + .003 * breakup[polished, None]
    roughness[polished], metalness[polished] = .08, .98
    height[polished] = .006 * grinding[polished]

    cavity = 1 - .32 * mark
    cavity[bore] *= .56
    save_suite("barrel", albedo, height, roughness, metalness, crevice=cavity, strength=1.6)


def build_frame_suite():
    w = h = 1536
    u, v = uv_grid(h, w)
    cells, facets = worley_cellular(h, w, 350, 350, seed=301)
    fine = seamless_band_noise(h, w, 180, 650, seed=302)
    hand_oil = fbm_noise(h, w, base_freq=6, octaves=3, seed=303)
    edm = .65 * facets - .35 * cells
    albedo = np.empty((h, w, 3), np.float32)
    albedo[:] = (.188, .198, .214)
    albedo += (.014 * edm + .003 * fine - .003 * hand_oil)[..., None]
    height = .18 * edm + .018 * fine
    roughness = .60 + .026 * edm + .015 * fine - .018 * hand_oil
    metalness = np.full((h, w), .03, np.float32)

    # Exact flank/world transform: u=.02..98, right v=.52..98,
    # left v=.04..50, X=-8.70..11.20 (19.90 cm), Y=-9.45..1.15 (10.60 cm).
    right, left = (v >= .52) & (v <= .98), (v >= .04) & (v <= .50)
    xn = np.where(right, (u - .02) / .96, (.98 - u) / .96)
    yn = np.where(right, (v - .52) / .46, (v - .04) / .46)
    dx, dy = -8.70 + xn * 19.90 + 5.32, -9.45 + yn * 10.60 + 4.92
    angle = math.radians(20)
    gx = dx * math.cos(angle) - dy * math.sin(angle)
    gy = dx * math.sin(angle) + dy * math.cos(angle)
    panel_mask = (right | left) & (np.abs(gx) < .98) & (gy > -2.46) & (gy < 2.32)
    panel = bevel_mask(panel_mask.astype(np.float32), width_px=3.0)
    pyramids = diamond_knurl(gx, gy, freq_u=8.0, freq_v=5.5)
    pits = laser_stipple_field(h, w, 240, 240, seed=304)
    tint(albedo, panel, (.164, .174, .190))
    albedo += (panel * (.012 * pyramids + .004 * pits))[..., None]
    height = height * (1 - panel) + panel * (-.12 + .32 * pyramids + .065 * pits)
    roughness = roughness * (1 - panel) + panel * (.74 + .018 * pits)

    # Rotated grip medallion local gx=-.76..-.10 (0.66 cm), gy=-2.18..-1.38 (0.80 cm).
    # 2x supersampled world-proportional 330x400 canvas for razor-sharp molded relief.
    medallion = panel_mask & (gx > -.76) & (gx < -.10) & (gy > -2.18) & (gy < -1.38)
    med_bevel = bevel_mask(medallion.astype(np.float32), width_px=2.2)
    height = height * (1 - med_bevel) - .38 * med_bevel
    tint(albedo, med_bevel, (.176, .186, .202))
    roughness = roughness * (1 - med_bevel) + .55 * med_bevel

    map_x = ((gx + .76) / .66 * 330).astype(np.float32)
    map_y = ((-1.38 - gy) / .80 * 400).astype(np.float32)
    molded = np.zeros((h, w), np.float32)
    for side, top, bottom in ((left, "G17", "AUSTRIA"), (right, "GEN3", "9×19")):
        canvas = Image.new("L", (330, 400), 0)
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle((14, 14, 315, 385), radius=22, outline=235, width=9)
        draw_glock_g_emblem(draw, 118, 42, 94, width=7)
        draw.text((165, 206), top, fill=255, font=load_font(FONT_COND, 92), anchor="mm")
        draw.text((165, 308), bottom, fill=255, font=load_font(FONT_COND, 62), anchor="mm")
        mapped = cv2.remap(np.asarray(canvas, np.float32) / 255.0, map_x, map_y,
                           cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT)
        molded += mapped * side * medallion
    height += .62 * bevel_mask(molded, width_px=1.2)
    tint(albedo, molded * .42, (.248, .262, .280))
    conv_fr = smoothstep(.08, .50, compute_convexity(height, sigma=1.8)) * (right | left)
    albedo += (conv_fr * .022)[..., None]
    roughness -= conv_fr * .040

    # Under-rail serial tag: u=.62..82, v=.005..033 maps 1.65 x 0.68 cm (px/pz = 2.944x!).
    # Padded swatch u=.60..84/v<=.036; four embedded rails u>=.86.
    serial = (v <= .036) & (u >= .60) & (u <= .84)
    rails = (v <= .036) & (u >= .86)
    brushed = cnc_toolpath(h, w, pitch_px=3.2, angle_deg=0, seed=305)
    albedo[serial] = np.array((.76, .78, .81)) + .008 * brushed[serial, None]
    roughness[serial], metalness[serial] = .22, .96
    height[serial] = .018 * brushed[serial]

    serial_canvas = Image.new("L", (660, 272), 0)
    ds = ImageDraw.Draw(serial_canvas)
    ds.rounded_rectangle((22, 24, 638, 248), radius=20, outline=220, width=7)
    ds.text((330, 138), "KPV 892 US", fill=255, font=load_font(FONT_DIN, 86), anchor="mm")
    mark = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(mark, serial_canvas, .62, .82, .005, .033)
    mark *= serial
    stamp_material(albedo, height, roughness, metalness, mark, depth=.98,
                   color=(.185, .198, .215), metal=.68, rough=.44)

    albedo[rails] = np.array((.82, .84, .87)) + .006 * brushed[rails, None]
    roughness[rails], metalness[rails] = .15, .98
    height[rails] = .012 * brushed[rails]
    save_suite("frame", albedo, height, roughness, metalness,
               crevice=1 - .25 * mark - .12 * molded - .10 * (panel_mask - panel), strength=1.35)


def build_mag_suite():
    w = h = 1024
    u, v = uv_grid(h, w)
    cells, edges = worley_cellular(h, w, 260, 260, seed=401)
    fine = seamless_band_noise(h, w, 80, 430, seed=402)
    edm = edges - .45 * cells
    albedo = np.empty((h, w, 3), np.float32)
    albedo[:] = (.188, .198, .214)
    albedo += (.012 * edm + .004 * fine)[..., None]
    height = .10 * edm + .018 * fine
    roughness = .59 + .025 * edm + .015 * fine
    metalness = np.full((h, w), .03, np.float32)

    insert_zone = ((v >= .42) & (v <= .96) & (u >= 0.0)).astype(np.float32)
    insertion = scratch_field(h, w, count=420, min_len=18, max_len=150,
        angle_deg=90, angle_spread=3, seed=403, mask=insert_zone)
    tint(albedo, insertion * .26, (.242, .254, .270))
    height -= .055 * insertion
    roughness -= .12 * insertion
    cavity = np.ones((h, w), np.float32)

    # Rear spine u=.06..44, v=.15..95 maps Z=-0.90..+0.90 (1.80 cm) x Y=-4.80..+5.70 (10.50 cm)
    # -> pz/py = 2.771x! Isotropic 300 px/cm world canvas = 540 x 3150 px.
    spine_canvas = Image.new("L", (540, 3150), 0)
    dsp = ImageDraw.Draw(spine_canvas)

    for i, label in enumerate(("4", "6", "8", "10", "12", "17")):
        wy = 2.40 - i * 1.15
        wz_hole = .16 if i % 2 == 0 else -.16
        vc = .15 + ((wy + 4.80) / 10.50) * .80
        uc = .06 + ((wz_hole + .90) / 1.80) * .38
        xx = (u - uc) / (.11 / 1.80 * .38)
        yy = (v - vc) / (.11 / 10.50 * .80)
        radius = np.sqrt(xx * xx + yy * yy)
        hole = 1 - smoothstep(.93, 1.07, radius)
        inside = 1 - smoothstep(.61, .84, radius)
        rim = smoothstep(.77, .94, radius) * (1 - smoothstep(.94, 1.14, radius))
        tint(albedo, hole, (.022, .024, .028))
        # Recessed brass 9x19mm cartridge case with primer/cylindrical glint
        case_curve = np.sqrt(np.clip(1 - xx * xx, 0, 1)) + np.zeros_like(yy)
        brass = np.empty_like(albedo)
        brass[:] = (.62, .44, .18)
        brass += (.11 * case_curve + .012 * fine)[..., None]
        albedo[:] = albedo * (1 - inside[..., None]) + brass * inside[..., None]
        height = height * (1 - hole) + hole * (-1.85 + .58 * inside * case_curve) - .12 * rim
        roughness = roughness * (1 - hole) + .80 * hole
        roughness = roughness * (1 - inside) + .19 * inside
        metalness = metalness * (1 - inside) + .96 * inside
        cavity *= 1 - .52 * hole - .12 * rim

        # World-proportional round-count numeral beside its staggered witness hole
        wz_txt = .46 if i % 2 == 0 else -.46
        tx = int(((wz_txt + .90) / 1.80) * 540)
        ty = int((1.0 - (wy + 4.80) / 10.50) * 3150)
        dsp.text((tx, ty), label, fill=255, font=load_font(FONT_DIN, 74), anchor="mm")

    # Bottom spine caliber mark at wy = -3.85 cm
    dsp.text((270, int((1.0 - (-3.85 + 4.80) / 10.50) * 3150)), "9mm",
             fill=255, font=load_font(FONT_DIN, 86), anchor="mm")

    # Right wall u=.52..96, v=.15..95 maps X=-1.35..+1.35 (2.70 cm) x Y=-4.80..+5.70 (10.50 cm)
    # -> px/py = 2.139x! Keep below v=.48 so other_poly (v=.56..94) never mirrors it.
    right_canvas = Image.new("L", (810, 3150), 0)
    drw = ImageDraw.Draw(right_canvas)
    draw_glock_g_emblem(drw, 295, 2240, 220, width=14)
    drw.text((405, 2555), "9×19", fill=255, font=load_font(FONT_DIN, 92), anchor="mm")
    drw.text((405, 2665), "AUSTRIA", fill=235, font=load_font(FONT_COND, 62), anchor="mm")

    mark = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(mark, spine_canvas, .06, .44, .15, .95)
    paste_world_patch(mark, right_canvas, .52, .96, .15, .95)
    stamp_material(albedo, height, roughness, metalness, mark, depth=.68,
                   color=(.146, .156, .172), metal=.03, rough=.68)
    conv_mg = smoothstep(.08, .50, compute_convexity(height, sigma=1.8)) * (v > .13)
    albedo += (conv_mg * .020)[..., None]
    roughness -= conv_mg * .036

    # Stainless liner/feed-lip swatch, unchanged u>=.80/v<=.12.
    steel = (v <= .12) & (u >= .80)
    brush = cnc_toolpath(h, w, pitch_px=3.4, angle_deg=90, seed=404)
    albedo[steel] = np.array((.80, .82, .85)) + .006 * brush[steel, None]
    roughness[steel], metalness[steel] = .18, .97
    height[steel] = .016 * brush[steel]
    cavity[steel] = 1
    save_suite("mag", albedo, height, roughness, metalness,
               crevice=cavity * (1 - .25 * mark), strength=1.5)


def build_detail_maps():
    w = h = 1024
    # Integer pitches/chatter periods make the CNC kernel toroidal too.
    brush = cnc_toolpath(h, w, pitch_px=4, angle_deg=0, seed=501)
    micro = seamless_band_noise(h, w, 110, 450, seed=502)
    oil = fbm_noise(h, w, base_freq=4, octaves=4, seed=503)
    cells, facets = worley_cellular(h, w, 280, 280, seed=504)
    height = .040 * brush + .024 * micro + .025 * (facets - cells)
    roughness = .88 + .043 * brush + .025 * micro - .032 * oil
    roughness += .88 - float(roughness.mean())
    save_suite("metal_detail", None, height, roughness, np.ones((h, w), np.float32),
               strength=1.25, seamless=True)
    cells, facets = worley_cellular(h, w, 185, 185, seed=505)
    fine = seamless_band_noise(h, w, 100, 440, seed=506)
    height = .25 * facets - .12 * cells + .035 * fine
    roughness = .88 + .080 * (cells - facets) + .035 * fine - .015 * oil
    roughness += .88 - float(roughness.mean())
    save_suite("polymer_detail", None, height, roughness, np.ones((h, w), np.float32),
               strength=1.65, seamless=True)


if __name__ == "__main__":
    build_slide_suite()
    build_barrel_suite()
    build_frame_suite()
    build_mag_suite()
    build_detail_maps()
