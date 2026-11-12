#!/usr/bin/env python3
"""Desert Eagle Mark XIX hard-chrome / elastomer material atlas, 2048x1024.

Unchanged outputs: deagle_chrome_{albedo,normal,roughness}.webp (or .png).
*_roughness is LINEAR RGB ORM (R=AO, G=roughness, B=metalness).
Fixed UV layout, v=0 bottom, v=1 top:
  Right chrome wall: u=.02..98, v=.65..98 (mapped .66..97, 25.6 x 3.35 cm);
    rear text u=.06..44, forward barrel u=.54..92; safety inset at u=.118, v=.865.
  Left chrome wall: u=.02..98, v=.30..63 (mapped .31..62, 25.6 x 3.35 cm);
    barrel u=.10..44, rear rollmarks u=.54..90; safety inset at u=.882, v=.515.
  Rubber grip: u=.02..72, v=.02..27 (flank u=.20..56, v=.04..25, 5.4 x 8.8 cm).
  Milled steel: u=.74..86, v=.02..27 (padded to u>.73/v<=.28).
  Mirror top deck: u=.87..99, v=.02..27 (padded to u>.86/v<=.28).
No painted bevel highlights: chrome reflection comes from lighting and normals.
"""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR, bevel_mask, chipped_edge_wear, cnc_toolpath, compute_convexity,
    compute_height_ao, fbm_noise, height_to_normal_map, laser_stipple_field,
    load_font, save_orm_png, save_rgb_png, scratch_field, seamless_band_noise,
    smoothstep, worley_cellular,
)

FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


def tint(albedo, mask, color):
    albedo *= 1 - mask[..., None]
    albedo += np.asarray(color, np.float32) * mask[..., None]


def paste_world_patch(target_mask, canvas_img, u0, u1, v0, v1,
                      resample=Image.Resampling.LANCZOS):
    h, w = target_mask.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    resized = canvas_img.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=resample)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    target_mask[y0:y1, x0:x1] = np.maximum(target_mask[y0:y1, x0:x1], arr)


def draw_israeli_proof_shield(draw, cx, cy, rad, width=4):
    """Israeli / CIP proof shield with 6-pointed star emblem."""
    w_sh, h_sh = int(rad * .78), int(rad * .95)
    draw.polygon([
        (cx - w_sh, cy - int(h_sh * .68)),
        (cx + w_sh, cy - int(h_sh * .68)),
        (cx + w_sh, cy + int(h_sh * .22)),
        (cx, cy + h_sh),
        (cx - w_sh, cy + int(h_sh * .22)),
    ], outline=255, width=width)
    sr = int(rad * .42)
    cy_s = cy - int(h_sh * .08)
    draw.polygon([(cx, cy_s - sr), (cx - int(sr * .86), cy_s + int(sr * .5)),
                  (cx + int(sr * .86), cy_s + int(sr * .5))], outline=255, width=max(2, width - 1))
    draw.polygon([(cx, cy_s + sr), (cx - int(sr * .86), cy_s - int(sr * .5)),
                  (cx + int(sr * .86), cy_s - int(sr * .5))], outline=255, width=max(2, width - 1))


def save_suite(albedo, height, roughness, metalness, crevice):
    """Pack with pbr_core, keeping linear normal/ORM WebPs lossless."""
    ao = np.clip(compute_height_ao(height, strength=1.2) * crevice, 46/255, 1)
    roughness = np.clip(roughness, 13/255, 234/255)
    metalness = np.clip(metalness, 6/255, 249/255)
    for field in (height, ao, roughness, metalness):
        if field.shape != height.shape or not np.isfinite(field).all():
            raise ValueError("Invalid chrome material field")
    save_rgb_png(albedo, os.path.join(OUT_DIR, "deagle_chrome_albedo.png"))
    requested = os.environ.get("PBR_OUTPUT_FORMAT")
    fmt = "png" if (requested or "webp").lower() == "png" else "webp"
    with TemporaryDirectory(prefix="deagle-linear-") as tmp:
        try:
            os.environ["PBR_OUTPUT_FORMAT"] = "png"
            normal_path = height_to_normal_map(height, 1.45,
                os.path.join(tmp, "deagle_chrome_normal.png"), seamless=False)
            orm_path = save_orm_png(ao, roughness, metalness,
                os.path.join(tmp, "deagle_chrome_roughness.png"))
        finally:
            if requested is None:
                os.environ.pop("PBR_OUTPUT_FORMAT", None)
            else:
                os.environ["PBR_OUTPUT_FORMAT"] = requested
        for kind, path in (("normal", normal_path), ("roughness", orm_path)):
            with Image.open(path) as img:
                target = os.path.join(OUT_DIR, f"deagle_chrome_{kind}.{fmt}")
                if fmt == "webp":
                    img.save(target, "WEBP", lossless=True, exact=True, method=6)
                else:
                    img.save(target, "PNG", optimize=True)
    print(f"[OK] deagle_chrome: 2048x1024 RGB normal + ORM ({fmt})", flush=True)


def build_deagle_chrome_suite():
    w, h = 2048, 1024
    u = (np.arange(w, dtype=np.float32)[None, :] + .5) / w
    v = 1 - (np.arange(h, dtype=np.float32)[:, None] + .5) / h
    fine_brush = cnc_toolpath(h, w, pitch_px=2.8, angle_deg=0, seed=5001)
    slow_brush = cnc_toolpath(h, w, pitch_px=6.3, angle_deg=.22, seed=5002)
    polish = seamless_band_noise(h, w, 150, 480, seed=5003)
    oil = fbm_noise(h, w, base_freq=7, octaves=3, seed=5004)
    micro_scratches = scratch_field(h, w, count=3200, min_len=3, max_len=42,
        angle_deg=0, angle_spread=5, seed=5005)
    albedo = np.empty((h, w, 3), np.float32)
    albedo[:] = (.715, .738, .765)
    albedo += (.005 * fine_brush + .003 * slow_brush + .002 * polish)[..., None]
    height = .012 * fine_brush + .008 * slow_brush + .006 * polish - .016 * micro_scratches
    roughness = np.clip(.18 + .011 * fine_brush + .007 * slow_brush + .006 * polish
                        - .010 * micro_scratches - .005 * oil, .15, .21)
    metalness = np.full((h, w), .98, np.float32)
    crevice = np.ones((h, w), np.float32)

    # Crisp 2-3 px mechanical bevels + localized holster/muzzle burnish with FBM breakup.
    walls = ((u >= .02) & (u <= .98)
             & (((v >= .65) & (v <= .98)) | ((v >= .30) & (v <= .63))))
    bevel = bevel_mask(walls.astype(np.float32), width_px=3, profile="trapezoid")
    rim = walls.astype(np.float32) - bevel
    height += .10 * bevel
    crevice *= 1 - .15 * rim
    breakup = smoothstep(.05, .58, fbm_noise(h, w, base_freq=36, octaves=4, seed=5010))
    proximity = np.zeros((h, w), np.float32)
    for low, high, is_right in ((.65, .98, True), (.30, .63, False)):
        band = (v >= low) & (v <= high)
        xn = (u - .02) / .96 if is_right else (.98 - u) / .96
        holster_bias = .18 + .82 * smoothstep(.58, .94, xn)
        edge = np.maximum(np.clip(1 - np.abs(v - (high - .012)) / .0038, 0, 1),
                          np.clip(1 - np.abs(v - (low + .012)) / .0038, 0, 1))
        proximity = np.maximum(proximity, edge * holster_bias * breakup * band)
    chips, _ = chipped_edge_wear(proximity, seed=5006, wear_amount=.38)
    holster = scratch_field(h, w, count=640, min_len=5, max_len=44,
        angle_deg=0, angle_spread=6, seed=5007, mask=proximity)
    burnish = np.maximum(chips, holster)
    tint(albedo, burnish * .26, (.79, .81, .84))
    roughness = roughness * (1 - burnish) + .12 * burnish
    height -= .014 * holster

    # Isotropic 2.5x supersampled world canvases for chrome walls:
    # u=[0.02, 0.98], vL=[0.31, 0.62], vR=[0.66, 0.97] map 25.6 x 3.35 cm (py/px = 1.234x).
    # Using 200 px/cm -> 5120 x 670 px renders safety dots as 1:1 true circles & un-squashes text.
    cw, ch = 5120, 670
    eng_l, eng_r, dot_l, dot_r = [Image.new("L", (cw, ch), 0) for _ in range(4)]
    del_d, der_d, ddl_d, ddr_d = [ImageDraw.Draw(im) for im in (eng_l, eng_r, dot_l, dot_r)]
    hero = load_font(FONT_DIN, 78)
    mid = load_font(FONT_DIN, 54)
    small = load_font(FONT_DIN, 44)
    caliber = load_font(FONT_DIN, 68)

    def uv_to_world_px(u_val, v_val, v0, v1):
        return (int(round((u_val - .02) / .96 * cw)),
                int(round((1.0 - (v_val - v0) / (v1 - v0)) * ch)))

    # Left chrome wall (v=[0.31, 0.62]; frame samples v<=0.42, slide/barrel v>=0.43)
    lx, ly = uv_to_world_px(.545, .545, .31, .62)
    del_d.line([(lx, ly - 22), (lx + 1260, ly - 22)], fill=255, width=5)
    del_d.text((lx, ly), "DESERT EAGLE PISTOL", fill=255, font=hero)
    del_d.text((lx, ly + 92), "MAGNUM RESEARCH INC. MINNEAPOLIS MN", fill=255, font=mid)
    del_d.text((lx, ly + 162), "IMI  MADE IN ISRAEL   .50 AE", fill=255, font=small)
    draw_israeli_proof_shield(del_d, lx + 1215, ly + 182, 32, width=4)
    bx_l, by_l = uv_to_world_px(.20, .505, .31, .62)
    del_d.text((bx_l, by_l), ".50 AE", fill=255, font=caliber)

    sx_l, sy_l = uv_to_world_px(.882, .515, .31, .62)
    ddl_d.ellipse((sx_l - 23, sy_l - 23, sx_l + 23, sy_l + 23), fill=255)
    del_d.ellipse((sx_l - 28, sy_l - 28, sx_l + 28, sy_l + 28), outline=255, width=5)

    # Right chrome wall (v=[0.66, 0.97]; frame samples v<=0.77, slide/barrel v>=0.79)
    rx, ry = uv_to_world_px(.165, .885, .66, .97)
    der_d.text((rx, ry), "MAGNUM RESEARCH INC.", fill=255, font=mid)
    der_d.text((rx, ry + 78), "IMI  MADE IN ISRAEL   .50 AE", fill=255, font=mid)
    draw_israeli_proof_shield(der_d, rx + 1015, ry + 102, 32, width=4)
    fx_r, fy_r = uv_to_world_px(.18, .735, .66, .97)
    der_d.text((fx_r, fy_r), "DK 0050919", fill=255, font=small)
    bx_r, by_r = uv_to_world_px(.66, .855, .66, .97)
    der_d.text((bx_r, by_r), ".50 AE", fill=255, font=caliber)

    sx_r, sy_r = uv_to_world_px(.118, .865, .66, .97)
    ddr_d.ellipse((sx_r - 23, sy_r - 23, sx_r + 23, sy_r + 23), fill=255)
    der_d.ellipse((sx_r - 28, sy_r - 28, sx_r + 28, sy_r + 28), outline=255, width=5)

    engraved = np.zeros((h, w), dtype=np.float32)
    red = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(engraved, eng_l, .02, .98, .31, .62)
    paste_world_patch(engraved, eng_r, .02, .98, .66, .97)
    paste_world_patch(red, dot_l, .02, .98, .31, .62)
    paste_world_patch(red, dot_r, .02, .98, .66, .97)

    height -= 1.35 * bevel_mask(engraved, width_px=1.15)
    tint(albedo, engraved, (.185, .202, .224))
    roughness = roughness * (1 - engraved) + .52 * engraved
    metalness = metalness * (1 - engraved) + .56 * engraved
    crevice *= 1 - .34 * engraved

    height += .30 * bevel_mask(red, width_px=2.0, profile="round")
    tint(albedo, red, (.58, .022, .034))
    roughness = roughness * (1 - red) + .14 * red
    metalness = metalness * (1 - red) + .03 * red

    # Fixed padded grip swatch u<=.73, v<=.28; flank u=.20..56, v=.04..25 maps 5.4 x 8.8 cm
    # (px = 136.53 px/cm, py = 24.44 px/cm -> anisotropy = 5.587x!).
    # Compensate stipple cell counts (cells_y = 2.8x cells_x on 2048x1024) for 1:1 round pebbles!
    grip = (v <= .28) & (u <= .73)
    cells, facets = worley_cellular(h, w, 520, 186, seed=5008)
    pebble = laser_stipple_field(h, w, 350, 125, seed=5009)
    elastomer = .28 * facets - .14 * cells + .22 * pebble
    albedo[grip] = np.array((.184, .195, .210)) + (.014 * facets + .006 * pebble)[grip, None]
    height[grip] = elastomer[grip]
    roughness[grip] = (.78 + .018 * polish + .018 * cells)[grip]
    metalness[grip] = .02
    crevice[grip] = 1

    panel_mask = (v >= .035) & (v <= .245) & (u >= .04) & (u <= .69)
    panel = bevel_mask(panel_mask.astype(np.float32), width_px=3)
    height -= .14 * panel
    crevice *= 1 - .12 * (panel_mask.astype(np.float32) - panel)

    # Raised elastomer finger ribs along backstrap/frontstrap swatch u=.06..18
    rib_img = Image.new("L", (w, h), 0)
    rib_draw = ImageDraw.Draw(rib_img)
    for vc in np.arange(.055, .24, .03125):
        rib_draw.rounded_rectangle((int(.06 * w), int((1 - vc - .005) * h),
            int(.18 * w), int((1 - vc + .005) * h)), radius=3, fill=255)
    ribs = bevel_mask(np.asarray(rib_img, np.float32) / 255, width_px=2)
    height += .35 * ribs
    tint(albedo, ribs * .18, (.230, .242, .258))

    # World-proportional 1:1 circular IMI / MRI eagle grip medallion!
    # Flank u=[0.20, 0.56], v=[0.04, 0.25] = 5.4 x 8.8 cm -> 300 px/cm = 1620 x 2640 px.
    # A 340 px radius circle (2.27 cm diameter) on 1620x2640 maps to rx=155 px, ry=28 px in UV,
    # which un-stretches by 5.59x into an exact 1:1 true circle on the 3D rubber grip!
    gw, gh = 1620, 2640
    med_c, let_c = Image.new("L", (gw, gh), 0), Image.new("L", (gw, gh), 0)
    dm, dt = ImageDraw.Draw(med_c), ImageDraw.Draw(let_c)
    gcx, gcy, grad = gw // 2, gh // 2, 345
    dm.ellipse((gcx - grad, gcy - grad, gcx + grad, gcy + grad), fill=255)
    dt.ellipse((gcx - grad + 14, gcy - grad + 14, gcx + grad - 14, gcy + grad - 14),
               outline=255, width=22)
    dt.ellipse((gcx - grad + 58, gcy - grad + 58, gcx + grad - 58, gcy + grad - 58),
               outline=255, width=13)
    # Stylized spread-wing Desert Eagle silhouette across center
    dt.polygon([
        (gcx - 215, gcy - 34), (gcx - 65, gcy - 12), (gcx, gcy - 54),
        (gcx + 65, gcy - 12), (gcx + 215, gcy - 34),
        (gcx + 145, gcy + 26), (gcx, gcy + 68), (gcx - 145, gcy + 26),
    ], fill=255)
    dt.text((gcx, gcy - 155), "IMI", fill=255, font=load_font(FONT_DIN, 128), anchor="mm")
    dt.text((gcx, gcy + 168), "MRI", fill=255, font=load_font(FONT_DIN, 128), anchor="mm")

    med_mask = np.zeros((h, w), dtype=np.float32)
    let_mask = np.zeros((h, w), dtype=np.float32)
    paste_world_patch(med_mask, med_c, .20, .56, .04, .25)
    paste_world_patch(let_mask, let_c, .20, .56, .04, .25)
    med = bevel_mask(med_mask, width_px=2.5)
    let_bevel = bevel_mask(let_mask, width_px=1.0)
    height = height * (1 - med) - .26 * med + .44 * let_bevel
    tint(albedo, med, (.165, .176, .192))
    tint(albedo, let_mask * .48, (.245, .258, .276))
    roughness = roughness * (1 - med) + .70 * med
    crevice *= 1 - .16 * let_mask - .10 * (med_mask - med)
    metalness[grip] = .02  # medallion is molded rubber dielectric (B <= 0.05)

    # Padded lower swatches retain exact original pixel regions.
    milled = (v <= .28) & (u > .73) & (u <= .86)
    albedo[milled] = np.array((.225, .242, .264)) + .005 * polish[milled, None]
    height[milled] = .018 * fine_brush[milled]
    roughness[milled], metalness[milled], crevice[milled] = .36, .58, .90
    deck = (v <= .28) & (u > .86)
    albedo[deck] = np.array((.76, .78, .805)) + .002 * fine_brush[deck, None]
    height[deck] = .004 * fine_brush[deck] - .006 * micro_scratches[deck]
    roughness[deck], metalness[deck], crevice[deck] = .09, .98, 1
    sep = (np.abs(v[:, 0] - .285) < .006) | (np.abs(v[:, 0] - .640) < .006)
    height[sep, :] = 0
    conv_dg = smoothstep(.08, .50, compute_convexity(height, sigma=1.8)) * (~sep[:, None])
    albedo += (conv_dg * .020)[..., None]
    roughness -= conv_dg * .034
    save_suite(albedo, height, roughness, metalness, crevice)


if __name__ == "__main__":
    build_deagle_chrome_suite()
