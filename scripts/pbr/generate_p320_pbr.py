#!/usr/bin/env python3
"""SIG Sauer P320 M17 manufacturing/material atlas, 2048x2048.

Unchanged outputs: p320_m17_{albedo,normal,roughness}.webp (or .png).
Albedo is sRGB; normal and packed RGB ORM (AO/roughness/metalness) are linear.
Fixed UV layout (u left-to-right, v bottom-to-top):
  v=.76..98, u=.02..98: #9d8363 Coyote Tan PVD slide RIGHT, M17 UID/9mmx19.
  v=.52..74, u=.02..98: #9d8363 Coyote Tan PVD slide LEFT, SIG SAUER/P320/M17.
  v=.45..50, u=.02..56: PVD slide top deck / bullnose bevels.
  v=.45..50, u=.60..98: dark PVD milled serration recesses and cutouts.
  v=.23..44, u=.02..72: #8d7251 FDE polymer grip RIGHT, laser stipple/medallion.
  v=.01..22, u=.02..72: #8d7251 FDE polymer grip LEFT, laser stipple/medallion.
  v=.30..43, u=.75..98: brushed stainless FCU serial plate TF004912.
  v=.16..28, u=.75..98: 17-4 PH stainless FCU chassis/rails.
  v=.02..14, u=.75..98: FDE polymer edges and 17-rd magazine baseplate.
Padded material boundaries retain the original values used by the mesh.
"""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    DEFAULT_FONT_CANDIDATES as FONT_CANDIDATES_BOLD,
    MONO_FONT_CANDIDATES as FONT_CANDIDATES_MONO,
    OUT_DIR, bevel_mask, chipped_edge_wear, cnc_toolpath, compute_convexity,
    compute_height_ao, fbm_noise, height_to_normal_map, laser_stipple_field,
    load_font, save_orm_png, save_rgb_png, scratch_field, seamless_band_noise,
    smoothstep, worley_cellular,
)

# Fixed serial artwork: actual ECC200, decoded payload "US M17 TF004912".
# Generated/round-trip checked with ZXing-C++ (https://github.com/zxing-cpp/zxing-cpp).
UID_DATAMATRIX = (
    "1010101010101010", "1010010011000111", "1010101100101010", "1100010101011011",
    "1000011000010000", "1010010001010011", "1100100110100010", "1101011010000111",
    "1011100001110100", "1100110011111101", "1000010100001010", "1010101111101111",
    "1011000011100110", "1101100000011101", "1011110001101010", "1111111111111111",
)


def tint(albedo, mask, color):
    albedo *= 1 - mask[..., None]
    albedo += np.asarray(color, np.float32) * mask[..., None]


def paste_world_canvas_to_uv(target_mask, canvas_img, u0, u1, v0, v1,
                             resample=Image.Resampling.LANCZOS):
    h, w = target_mask.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1 - v1) * h)), int(round((1 - v0) * h))
    resized = canvas_img.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=resample)
    arr = np.asarray(resized, np.float32) / 255
    target_mask[y0:y1, x0:x1] = np.maximum(target_mask[y0:y1, x0:x1], arr)


def save_suite(albedo, height, roughness, metalness, crevice):
    """Use core ORM packing and OpenGL normals; linear maps encode losslessly."""
    ao = np.clip(compute_height_ao(height, strength=1.15) * crevice, 46/255, 1)
    roughness = np.clip(roughness, 13/255, 234/255)
    metalness = np.clip(metalness, 6/255, 249/255)
    for field in (height, ao, roughness, metalness):
        if field.shape != height.shape or not np.isfinite(field).all():
            raise ValueError("Invalid P320 material field")
    save_rgb_png(albedo, os.path.join(OUT_DIR, "p320_m17_albedo.png"))
    requested = os.environ.get("PBR_OUTPUT_FORMAT")
    fmt = "png" if (requested or "webp").lower() == "png" else "webp"
    with TemporaryDirectory(prefix="p320-linear-") as tmp:
        try:
            os.environ["PBR_OUTPUT_FORMAT"] = "png"
            normal_path = height_to_normal_map(height, 1.5,
                os.path.join(tmp, "p320_m17_normal.png"), seamless=False)
            orm_path = save_orm_png(ao, roughness, metalness,
                os.path.join(tmp, "p320_m17_roughness.png"))
        finally:
            if requested is None:
                os.environ.pop("PBR_OUTPUT_FORMAT", None)
            else:
                os.environ["PBR_OUTPUT_FORMAT"] = requested
        for kind, path in (("normal", normal_path), ("roughness", orm_path)):
            with Image.open(path) as img:
                target = os.path.join(OUT_DIR, f"p320_m17_{kind}.{fmt}")
                if fmt == "webp":
                    img.save(target, "WEBP", lossless=True, exact=True, method=6)
                else:
                    img.save(target, "PNG", optimize=True)
    print(f"[OK] p320_m17: 2048x2048 RGB normal + ORM ({fmt})", flush=True)


def make_grip_flank_masks(is_left):
    # 2x supersampled isotropic world canvas: 18.8 x 10.8 cm -> 3008 x 1728 px (160 px/cm).
    ww, wh = 3008, 1728
    stipple, border, text, medallion = [Image.new("L", (ww, wh), 0) for _ in range(4)]
    ds, db, dt, dm = [ImageDraw.Draw(img) for img in (stipple, border, text, medallion)]

    def project(wx, wy):
        xn, yn = (wx + 9.1) / 18.8, (wy + 9.7) / 10.8
        return ((1 - xn if is_left else xn) * ww, (1 - yn) * wh)

    panel_world = [(-3.25, -1.75), (-6.25, -1.55), (-7.88, -8.35), (-4.95, -8.85)]
    poly = [project(x, y) for x, y in panel_world]
    ds.polygon(poly, fill=255)
    db.polygon(poly, outline=255, width=10)
    cx, cy = project(-5.48, -5.12)
    box = (cx - 296, cy - 164, cx + 296, cy + 164)
    ds.rounded_rectangle(box, radius=164, fill=0)
    dm.rounded_rectangle(box, radius=164, fill=255)
    db.rounded_rectangle(box, radius=164, outline=255, width=12)
    dt.text((cx, cy - 34), "SIG SAUER", fill=255,
            font=load_font(FONT_CANDIDATES_BOLD, 84), anchor="mm")
    dt.text((cx, cy + 66), "M17  FDE", fill=255,
            font=load_font(FONT_CANDIDATES_BOLD, 44), anchor="mm")
    dcx, dcy = project(5.6, .35)
    label = "P320  CARRY  MOD." if is_left else "NEWINGTON, NH, USA"
    dt.text((dcx - (180 if is_left else 270), dcy - 20), label, fill=230,
            font=load_font(FONT_CANDIDATES_BOLD, 40))
    return stipple, border, text, medallion


def build_p320_m17_atlas():
    w = h = 2048
    u = (np.arange(w, dtype=np.float32)[None, :] + .5) / w
    v = 1 - (np.arange(h, dtype=np.float32)[:, None] + .5) / h
    pvd_micro = seamless_band_noise(h, w, 220, 850, seed=3201)
    grinding = cnc_toolpath(h, w, pitch_px=3.6, angle_deg=0, seed=3202)
    cells, facets = worley_cellular(h, w, 560, 300, seed=3203)
    poly_edm = .65 * facets - .40 * cells
    oil = fbm_noise(h, w, base_freq=5, octaves=4, seed=3204)
    pvd = np.array((157, 131, 99), np.float32) / 255
    fde = np.array((141, 114, 81), np.float32) / 255
    albedo = np.broadcast_to(fde, (h, w, 3)).copy()
    height = .11 * poly_edm
    roughness = .67 + .022 * poly_edm
    metalness = np.full((h, w), .03, np.float32)
    crevice = np.ones((h, w), np.float32)

    # ZONE 1. Coyote Tan PVD slide region v>=.445, recess region v=.445..508/u>=.58.
    slide = np.broadcast_to(v >= .445, (h, w))
    shimmer = pvd_micro[..., None] * np.array((.007, .003, -.003), np.float32)
    pvd_color = pvd + shimmer + (.004 * grinding - .002 * oil)[..., None]
    albedo[slide] = pvd_color[slide]
    height[slide] = (.022 * grinding + .018 * pvd_micro)[slide]
    roughness[slide] = (.27 + .014 * pvd_micro + .010 * grinding - .015 * oil)[slide]
    metalness[slide] = .64
    milled = (v >= .445) & (v <= .508) & (u >= .58)
    albedo[milled] = np.array((.455, .375, .280)) + .004 * pvd_micro[milled, None]
    roughness[milled], metalness[milled] = .40, .60

    # Localized forward holster/corner PVD burnish & micro-chipping with FBM breakup
    # (eliminates ruler-straight dashed horizontal stripes and vertical muzzle dots).
    breakup = smoothstep(.04, .58, fbm_noise(h, w, base_freq=36, octaves=4, seed=3211))
    proximity = np.zeros((h, w), np.float32)
    for low, high, is_right, shoulder, muzzle in ((.76, .98, True, .915, .968),
                                                  (.52, .74, False, .675, .032)):
        band = (v >= low) & (v <= high)
        xn = (u - .02) / .96 if is_right else (.98 - u) / .96
        yn = (v - low) / .22
        holster_bias = .14 + .86 * smoothstep(.62, .94, xn)
        shoulder_edge = np.clip(1 - np.abs(v - shoulder) / .0035, 0, 1) * holster_bias
        corner_gate = smoothstep(.64, .86, yn) + (1.0 - smoothstep(.08, .24, yn)) * .50
        muzzle_edge = np.clip(1 - np.abs(u - muzzle) / .0065, 0, 1) * np.clip(corner_gate, 0, 1)
        proximity = np.maximum(proximity, np.maximum(shoulder_edge, muzzle_edge) * breakup * band)

    chips, transition = chipped_edge_wear(proximity, seed=3205, wear_amount=.42)
    scuff = scratch_field(h, w, count=780, min_len=6, max_len=56,
        angle_deg=0, angle_spread=5, seed=3206, mask=np.clip(proximity * 1.5, 0, 1))
    wear = np.maximum(chips, scuff * .78)
    tint(albedo, transition * .20, (.47, .377, .27))
    tint(albedo, wear, (.70, .69, .66))
    roughness = roughness * (1 - wear) + .16 * wear
    metalness = metalness * (1 - wear) + .97 * wear
    height -= .030 * scuff + .022 * wear

    # 2x supersampled isotropic world slide canvases: 19.5 x 2.72 cm -> 3900 x 544 px (200 px/cm).
    ww, wh = 3900, 544
    left, right, uid_canvas = [Image.new("L", (ww, wh), 0) for _ in range(3)]
    dl, dr, du = [ImageDraw.Draw(img) for img in (left, right, uid_canvas)]
    dl.text((1090, 156), "SIG SAUER", fill=255, font=load_font(FONT_CANDIDATES_BOLD, 124))
    dl.text((1910, 172), "P320", fill=255, font=load_font(FONT_CANDIDATES_BOLD, 112))
    dl.rounded_rectangle((2290, 168, 2594, 290), radius=16, outline=255, width=8)
    dl.text((2442, 229), "M17", fill=255, font=load_font(FONT_CANDIDATES_BOLD, 88), anchor="mm")
    dl.text((1100, 318), "NEWINGTON, NH, USA", fill=235,
            font=load_font(FONT_CANDIDATES_BOLD, 48))

    # Crisp 1:1 square ECC200 IUID DataMatrix (128x128 world px = 6.4 x 6.4 mm on 3D slide)
    du.rounded_rectangle((2268, 178, 3045, 334), radius=12, outline=205, width=4)
    for row, bits in enumerate(UID_DATAMATRIX):
        for col, bit in enumerate(bits):
            if bit == "1":
                x, y = 2284 + col * 8, 192 + row * 8
                du.rectangle((x, y, x + 7, y + 7), fill=255)
    dr.text((2444, 192), "US  M17   9mm × 19", fill=255,
            font=load_font(FONT_CANDIDATES_BOLD, 48))
    dr.text((2444, 260), "CAGE 7Z546  SN TF004912", fill=235,
            font=load_font(FONT_CANDIDATES_BOLD, 44))

    engraving = np.zeros((h, w), np.float32)
    paste_world_canvas_to_uv(engraving, left, .02, .98, .52, .74)
    paste_world_canvas_to_uv(engraving, right, .02, .98, .76, .98)
    paste_world_canvas_to_uv(engraving, uid_canvas, .02, .98, .76, .98,
                             resample=Image.Resampling.BOX)
    tint(albedo, engraving, (.255, .198, .135))
    height -= 1.18 * bevel_mask(engraving, width_px=1.25)
    roughness = roughness * (1 - engraving) + .52 * engraving
    metalness = metalness * (1 - engraving) + .68 * engraving
    crevice *= 1 - .32 * engraving

    # Scattered brass transfer ticks in the ejection zone.
    x0, x1 = int(.342 * w), int(.379 * w)
    y0, y1 = int((1 - .924) * h), int((1 - .876) * h)
    brass = np.zeros((h, w), np.float32)
    brass[y0:y1, x0:x1] = scratch_field(y1 - y0, x1 - x0, count=21,
        min_len=2, max_len=12, angle_deg=-30, angle_spread=24, seed=3207)
    tint(albedo, brass * .70, (.72, .53, .25))
    roughness = roughness * (1 - brass) + .21 * brass
    metalness = metalness * (1 - brass) + .96 * brass

    # ZONE 2. FDE polymer v<.445/u<.735, exact mirrored grip transforms.
    grip = (v < .445) & (u < .735)
    albedo[grip] = fde + (.011 * poly_edm + .003 * pvd_micro)[grip, None]
    height[grip] = (.13 * poly_edm + .012 * pvd_micro)[grip]
    roughness[grip] = (.67 + .025 * poly_edm + .012 * pvd_micro)[grip]
    metalness[grip], crevice[grip] = .03, 1
    stipple, border, letters, medallion = [np.zeros((h, w), np.float32) for _ in range(4)]
    for is_left, v0, v1 in ((False, .23, .44), (True, .01, .22)):
        source = make_grip_flank_masks(is_left)
        for target, canvas in zip((stipple, border, letters, medallion), source):
            paste_world_canvas_to_uv(target, canvas, .02, .72, v0, v1)
    panel = bevel_mask(stipple, width_px=2)
    # Elliptical atlas cells compensate the world's unequal U/V texel density.
    craters = laser_stipple_field(h, w, cells_y=510, cells_x=270, seed=3208)
    toasted = np.array((.468, .374, .262), np.float32)
    ablated_color = toasted + (.026 * craters - .014 * smoothstep(.10, .65, -craters))[..., None]
    albedo[:] = albedo * (1 - panel[..., None]) + ablated_color * panel[..., None]
    height = height * (1 - panel) + panel * (-.16 + .48 * craters)
    roughness = roughness * (1 - panel) + panel * (.86 + .018 * craters)
    smooth_medallion = bevel_mask(medallion, width_px=3)
    height = height * (1 - smooth_medallion) - .22 * smooth_medallion
    tint(albedo, smooth_medallion, fde * .95)
    roughness = roughness * (1 - smooth_medallion) + .62 * smooth_medallion
    border_relief = bevel_mask(border, width_px=1.35)
    letter_relief = bevel_mask(letters, width_px=1.1)
    height -= .40 * border_relief
    height += .54 * letter_relief
    tint(albedo, border * .26, fde * .78)
    tint(albedo, letters * .36, fde * 1.12)
    crevice *= 1 - .18 * border - .12 * letters - .10 * (stipple - panel)

    # ZONE 3. 17-4 PH stainless FCU serial plate (2.20 x 0.60 cm -> 3.667:1 world aspect!).
    # Using isotropic 500 px/cm -> 1100x300 eliminates the 2.07x horizontal stretch on TF004912.
    serial = (u >= .745) & (u <= .985) & (v >= .295) & (v <= .435)
    body = (u >= .745) & (u <= .985) & (v >= .155) & (v < .295)
    fcu = serial | body
    steel_brush = cnc_toolpath(h, w, pitch_px=3.2, angle_deg=0, seed=3209)
    steel_scratches = scratch_field(h, w, count=900, min_len=4, max_len=35,
        angle_deg=0, angle_spread=8, seed=3210, mask=fcu.astype(np.float32))
    albedo[fcu] = np.array((.805, .825, .85)) + .006 * steel_brush[fcu, None]
    height[fcu] = (.018 * steel_brush - .016 * steel_scratches)[fcu]
    roughness[fcu] = (.17 + .010 * pvd_micro + .008 * steel_brush)[fcu]
    metalness[fcu], crevice[fcu] = .97, 1

    serial_canvas = Image.new("L", (1100, 300), 0)
    ds = ImageDraw.Draw(serial_canvas)
    ds.rounded_rectangle((28, 22, 1072, 278), radius=20, outline=255, width=7)
    ds.text((88, 48), "SIG SAUER  FCU  ·  CAGE 7Z546", fill=245,
            font=load_font(FONT_CANDIDATES_BOLD, 34))
    ds.text((84, 98), "TF004912", fill=255, font=load_font(FONT_CANDIDATES_MONO, 108))
    ds.text((88, 224), "MODULAR CHASSIS  ·  US M17", fill=235,
            font=load_font(FONT_CANDIDATES_BOLD, 32))

    serial_mark = np.zeros((h, w), np.float32)
    paste_world_canvas_to_uv(serial_mark, serial_canvas, .75, .98, .30, .43)
    serial_mark *= serial
    tint(albedo, serial_mark, (.205, .222, .244))
    height -= .98 * bevel_mask(serial_mark, width_px=1.15)
    roughness = roughness * (1 - serial_mark) + .46 * serial_mark
    metalness = metalness * (1 - serial_mark) + .64 * serial_mark
    crevice *= 1 - .30 * serial_mark

    baseplate = (u >= .745) & (u <= .985) & (v >= .015) & (v < .155)
    albedo[baseplate] = fde + .010 * poly_edm[baseplate, None]
    height[baseplate] = .13 * poly_edm[baseplate]
    roughness[baseplate] = (.64 + .025 * poly_edm)[baseplate]
    metalness[baseplate], crevice[baseplate] = .03, 1
    conv_p320 = smoothstep(.08, .50, compute_convexity(height, sigma=1.8))
    albedo += (conv_p320 * .022)[..., None]
    roughness -= conv_p320 * .040
    save_suite(albedo, height, roughness, metalness, crevice)


if __name__ == "__main__":
    build_p320_m17_atlas()
