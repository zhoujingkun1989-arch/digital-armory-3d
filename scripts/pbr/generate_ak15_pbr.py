#!/usr/bin/env python3
"""AK-15M1 albedo, OpenGL normal and RGB ORM atlases.

UV CONTRACT (unchanged; V points up, image rows point down):
  ak_receiver_{albedo,normal,roughness}.png: 2048x1024
    Right U .02..98 / V .54..96 (12.30 x 2.56 cm);
    Left  U .02..98 / V .08..50 (12.30 x 2.56 cm).
    Dimples (.675,.725)/(.325,.265); true 3D circular selector sweep about
    CAD pivot (-3.85, +0.35) with detent radius R=4.32 cm.
    Steel swatch U >= .78 / V <= .07.
  ak_mag_{albedo,normal,roughness}.png: 1024x1024
    Ribs V .16..84, U < .36 or U > .64; window U .40..60 / V .22..78.
    Steel locking-lug/feed-lip swatch U >= .78 / V <= .07.
  ak_metal_{albedo,normal,roughness}.png: 1024x1024
    Carrier V >= .50; piston V .08..48; temper U .72..90; soot U > .87.

The historical roughness filename carries R=AO, G=roughness, B=metalness.
PBR_OUTPUT_FORMAT=webp changes only the extension, never dimensions/UVs.
Fixed seeds; low-frequency oil/dye fields NEVER enter wall height.
"""

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.pbr_core import (
    OUT_DIR, bevel_mask, chipped_edge_wear, cnc_toolpath, compute_convexity,
    compute_height_ao, fbm_noise, height_to_normal_png, load_font, save_orm_png,
    save_rgb_png, scratch_field, smoothstep, worley_cellular,
)

FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"


def _uv(w, h):
    return ((np.arange(w, dtype=np.float32)[None, :] + .5) / w,
            1.0 - (np.arange(h, dtype=np.float32)[:, None] + .5) / h)


def _box(u, v, x0, x1, y0, y1):
    return ((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)).astype(np.float32)


def _ellipse(u, v, x, y, rx, ry, w, h):
    radius = np.sqrt(((u - x) / rx) ** 2 + ((v - y) / ry) ** 2)
    return np.clip((1.0 - radius) * min(rx * w, ry * h) + .5, 0, 1)


def _mix(field, value, mask):
    if field.ndim == 3:
        mask = mask[..., None]
    field *= 1.0 - mask
    field += np.asarray(value, dtype=np.float32) * mask


def _paste_world(target_mask, canvas_img, u0, u1, v0, v1,
                 resample=Image.Resampling.LANCZOS):
    h, w = target_mask.shape
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1.0 - v1) * h)), int(round((1.0 - v0) * h))
    resized = canvas_img.resize((max(1, x1 - x0), max(1, y1 - y0)), resample=resample)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    target_mask[y0:y1, x0:x1] = np.maximum(target_mask[y0:y1, x0:x1], arr)


def _edge(mask, width=7):
    """Distance to a real island/feature boundary, measured in atlas pixels."""
    distance = ndimage.distance_transform_edt(np.pad(mask > .5, 1))[1:-1, 1:-1]
    return (np.clip(1.0 - (distance - 1) / width, 0, 1) * mask).astype(np.float32)


def _bare(albedo, height, roughness, metalness, mask, color, rough=.18, metal=.96):
    _mix(albedo, color, mask)
    _mix(roughness, rough, mask)
    _mix(metalness, metal, mask)
    height -= mask * .075


def _save(name, albedo, height, roughness, metalness, cavity, strength):
    ao = np.clip(compute_height_ao(height, strength=1.15) * cavity, .18, 1.0)
    roughness = np.clip(roughness, .05, .92)
    metalness = np.clip(metalness, .02, .98)
    root = Path(OUT_DIR)
    save_rgb_png(np.clip(albedo, 0, 1), str(root / f"{name}_albedo.png"))
    normal_path = height_to_normal_png(height, strength=strength, out_path=str(root / f"{name}_normal.png"))
    path = save_orm_png(ao, roughness, metalness, str(root / f"{name}_roughness.png"))
    if Path(path).suffix == ".webp":
        dy, dx = np.gradient(height)
        normals = np.stack((-dx * strength, dy * strength, np.ones_like(height)), axis=-1)
        normals /= np.sqrt(np.sum(normals * normals, axis=-1, keepdims=True) + 1e-8)
        normal_rgb = np.clip((normals * .5 + .5) * 255, 0, 255).astype(np.uint8)
        orm_rgb = (np.stack((ao, roughness, metalness), axis=-1) * 255).astype(np.uint8)
        Image.fromarray(normal_rgb).save(normal_path, "WEBP", lossless=True, method=6)
        Image.fromarray(orm_rgb).save(path, "WEBP", lossless=True, method=6)
    print(f"[OK] {name}: {albedo.shape[1]}x{albedo.shape[0]}, albedo / normal / RGB ORM ({Path(path).suffix})")


def _draw_gis_proof(draw, cx, cy, rad, width=4):
    """Russian State Testing Station (ГИС) diamond/oval proof stamp + CIP N."""
    draw.polygon([
        (cx - int(rad * 1.35), cy),
        (cx, cy - int(rad * .82)),
        (cx + int(rad * 1.35), cy),
        (cx, cy + int(rad * .82)),
    ], outline=255, width=width)
    draw.text((cx, cy), "ГИС", fill=255, font=load_font(FONT_COND, int(rad * .92)), anchor="mm")


def build_ak_receiver_suite():
    w, h = 2048, 1024
    u, v = _uv(w, h)
    cells, boundaries = worley_cellular(h, w, 340, 680, seed=701)
    phosphate = (.42 - cells) * .7 + (boundaries - .17) * .4
    oil = .5 + .5 * fbm_noise(h, w, base_freq=7, octaves=4, seed=703)
    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (.225, .244, .268)
    albedo += (phosphate * .011 - oil * .0035)[..., None]
    height = phosphate * .035  # ONLY micro-phosphate; no broad sheet-metal dents
    roughness = .37 + phosphate * .030 - oil * .038
    metalness = np.full((h, w), .54, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)
    walls = np.maximum(_box(u, v, .02, .98, .54, .96), _box(u, v, .02, .98, .08, .50))

    dimples = np.zeros((h, w), dtype=np.float32)
    for x, y in ((.675, .725), (.325, .265)):
        recess = _ellipse(u, v, x, y, .065, .055, w, h)
        profile = bevel_mask(recess, width_px=7, profile="trapezoid")
        height -= .78 * profile
        cavity *= 1.0 - .10 * (recess - profile)
        albedo -= (.006 * profile)[..., None]
        dimples = np.maximum(dimples, recess)

    # Domed front/rear trunnion rivets (1:1 circular in 3D: py/px = 1.051x)
    rivets = ((.091, .682), (.151, .682), (.119, .865),
              (.868, .675), (.921, .837), (.386, .731))
    contact = _edge(walls, 6)
    for side in (0, 1):
        for index, (x, y) in enumerate(rivets):
            if side:
                x, y = 1.0 - x, y - .46
            rx_px = 7.5 if index < 5 else 6.5
            ry_px = rx_px * 1.051
            r = np.sqrt(((u - x) * w / rx_px) ** 2 + ((v - y) * h / ry_px) ** 2)
            dome = np.sqrt(np.clip(1.0 - r ** 2, 0, 1))
            collar = smoothstep(.93, 1.13, r) * (1.0 - smoothstep(1.13, 1.40, r))
            height += .74 * dome - .18 * collar
            cavity *= 1.0 - .18 * collar
            halo = np.exp(-(r / 2.5) ** 2)
            roughness -= .055 * halo
            albedo -= (.003 * halo)[..., None]
            contact = np.maximum(contact, collar * .85)

    # Lower internal-rail resistance spot-weld impressions (1:1 circular in 3D).
    for y in (.592, .132):
        for x in (.245, .355, .465, .575, .755):
            spot = _ellipse(u, v, x, y, 4.6 / w, (4.6 * 1.051) / h, w, h)
            height -= .28 * bevel_mask(spot, width_px=2.0, profile="round")
            cavity *= 1.0 - .08 * spot
            roughness += spot * .025

    contact = np.maximum(contact, _edge(dimples, 3) * .74)
    fracture = fbm_noise(h, w, base_freq=37, octaves=3, seed=710)
    contact *= np.clip(.63 + .55 * fracture, .12, 1.0)
    chips, oxide = chipped_edge_wear(contact, seed=711, wear_amount=.60)
    handling = scratch_field(h, w, count=85, min_len=16, max_len=52,
                             angle_deg=-12, angle_spread=26, seed=712, mask=walls)
    _mix(albedo, (.295, .316, .342), handling * .30)
    roughness -= handling * .065
    height -= handling * .024
    _mix(albedo, (.168, .165, .160), oxide * .42)
    roughness += oxide * .045
    _bare(albedo, height, roughness, metalness, chips, (.62, .65, .68))

    # Isotropic 2x supersampled world canvases for right & left walls:
    # 12.30 x 2.56 cm -> 320 px/cm = 3936 x 819 px!
    cw, ch = 3936, 819
    arc_canvas = Image.new("L", (cw, ch), 0)
    da = ImageDraw.Draw(arc_canvas)

    # TRUE 3D circular selector detent track centered on CAD pivot (-3.85, +0.35)
    # with exact CAD detent-sphere radius R = hypot(4.32, 0.06) = 4.3204 cm!
    piv_wx, piv_wy = -3.85, 0.35
    det_r = math.hypot(4.32, 0.06)
    theta_safe, theta_auto, theta_semi = 0.128, math.atan2(0.06, 4.32), -0.100

    def world_to_right_canvas(wx, wy):
        return ((wx - -6.25) / 12.30 * cw,
                (1.0 - (wy - -0.92) / 2.56) * ch)

    for stroke in range(5):
        r_stroke = det_r + (stroke - 2) * 0.011
        angles = np.linspace(theta_semi - .018 + stroke * .004,
                             theta_safe + .018 - stroke * .004, 96)
        pts = [world_to_right_canvas(piv_wx + r_stroke * math.cos(a),
                                     piv_wy + r_stroke * math.sin(a))
               for a in angles]
        da.line(pts, fill=255, width=5 if stroke == 2 else 2)

    arc_mask = np.zeros((h, w), dtype=np.float32)
    _paste_world(arc_mask, arc_canvas, .02, .98, .54, .96)
    arc = smoothstep(.10, .68, arc_mask) * walls
    oxide_arc = np.clip(ndimage.maximum_filter(arc, size=3) - arc, 0, 1)
    _mix(albedo, (.12, .10, .075), oxide_arc * .5)
    _bare(albedo, height, roughness, metalness, arc, (.67, .69, .71), rough=.17)
    height -= .22 * arc

    # Three true-circular detent dimples at exact ПР / АВ / ОД angles along R=4.32 cm
    for theta in (theta_safe, theta_auto, theta_semi):
        wx = piv_wx + det_r * math.cos(theta)
        wy = piv_wy + det_r * math.sin(theta)
        du_c = .02 + ((wx - -6.25) / 12.30) * .96
        dv_c = .54 + ((wy - -0.92) / 2.56) * .42
        detent = _ellipse(u, v, du_c, dv_c, 4.8 / w, (4.8 * 1.051) / h, w, h)
        height -= .82 * bevel_mask(detent, width_px=1.6, profile="round")
        cavity *= 1.0 - detent * .22
        _bare(albedo, height, roughness, metalness, detent, (.54, .57, .60), rough=.17)

    # Supersampled 1:1 Cyrillic markings & Izhevsk [КК] + ГИС / CIP N proof marks
    right_marks = Image.new("L", (cw, ch), 0)
    drm = ImageDraw.Draw(right_marks)
    for label, theta in (("ПР", theta_safe), ("АВ", theta_auto), ("ОД", theta_semi)):
        wx = piv_wx + (det_r + 0.24) * math.cos(theta)
        wy = piv_wy + (det_r + 0.24) * math.sin(theta)
        tx, ty = world_to_right_canvas(wx, wy)
        drm.text((tx + 16, ty), label, fill=255, font=load_font(FONT_DIN, 58), anchor="lm")

    left_marks = Image.new("L", (cw, ch), 0)
    dlm = ImageDraw.Draw(left_marks)
    lx, ly = 270, 218
    dlm.rounded_rectangle((lx, ly, lx + 140, ly + 98), radius=10, outline=255, width=6)
    dlm.text((lx + 70, ly + 49), "КК", fill=255, font=load_font(FONT_DIN, 74), anchor="mm")
    dlm.text((lx + 174, ly + 6), "АК-15   7,62×39", fill=255, font=load_font(FONT_DIN, 78))
    dlm.text((lx + 174, ly + 108), "24  6П71М  08419   СДЕЛАНО В РОССИИ",
             fill=235, font=load_font(FONT_DIN, 54))
    _draw_gis_proof(dlm, lx + 1015, ly + 52, 34, width=4)
    dlm.text((lx + 1082, ly + 52), "CIP  N", fill=235,
             font=load_font(FONT_COND, 48), anchor="lm")

    # Convexity burnish sheen across domed trunnion rivets, magwell dimple shoulders & spot welds
    conv_rec = smoothstep(.08, .50, compute_convexity(height, sigma=2.2)) * walls
    albedo += (conv_rec * .028)[..., None]
    roughness -= conv_rec * .052

    lettering = np.zeros((h, w), dtype=np.float32)
    _paste_world(lettering, right_marks, .02, .98, .54, .96)
    _paste_world(lettering, left_marks, .02, .98, .08, .50)
    _mix(albedo, (.82, .84, .85), lettering * .94)
    height -= .40 * bevel_mask(lettering, width_px=1.0, profile="trapezoid")
    _mix(roughness, .46, lettering)
    _mix(metalness, .04, lettering)  # white laser-enamel pigment B <= 0.05
    cavity *= 1.0 - .08 * lettering

    steel = _box(u, v, .78, 1.0, 0, .07)
    _mix(albedo, (.74, .77, .80), steel)
    _mix(roughness, .18, steel)
    _mix(metalness, .96, steel)
    _mix(height, cnc_toolpath(h, w, pitch_px=3.5, angle_deg=0, seed=719) * .025, steel)
    _mix(cavity, 1.0, steel)
    _save("ak_receiver", albedo, height, roughness, metalness, cavity, 2.4)


def _window_cartridges(albedo, cavity, glass, w, h):
    """12 shaped rounds behind a flat smoked pane, without bulging its normal."""
    x0, x1 = int(.40 * w), int(.60 * w) + 1
    y0, y1 = int(.22 * h), int(.78 * h) + 1
    uu = (np.arange(x0, x1, dtype=np.float32)[None, :] + .5) / w
    vv = 1 - (np.arange(h - y1, h - y0, dtype=np.float32)[:, None] + .5) / h
    rgb = np.empty((len(vv), uu.shape[1], 3), dtype=np.float32)
    rgb[:] = (.020, .025, .026)
    visibility = np.full(rgb.shape[:2], .60, dtype=np.float32)
    rng = np.random.default_rng(825)
    for i in range(12):
        center = .257 + i * .0447 + rng.uniform(-.00065, .00065)
        centerline = center + (uu - .5) * rng.uniform(-.020, .020)
        x = (uu - .409 - rng.uniform(-.0004, .0004)) / .182
        radius = np.interp(x, [0, .030, .048, .078, .67, .76, .82, 1.0],
                           [.0165, .0165, .0125, .0158, .0135, .0083, .0083, 0]).astype(np.float32)
        bullet_t = np.clip((x - .81) / .19, 0, 1)
        radius = np.where(x > .81, .0083 * np.sqrt(np.maximum(0, 1 - bullet_t ** 1.65)), radius)
        dy = vv - centerline
        coverage = np.clip((radius - np.abs(dy)) * h + .5, 0, 1) * ((x >= 0) & (x <= 1))
        radial = np.clip(dy / np.maximum(radius, 1e-5), -1, 1)
        cylinder = np.sqrt(np.maximum(0, 1 - radial * radial))
        shine = .30 + .62 * cylinder + .12 * np.exp(-((radial - .38) / .13) ** 2)
        case = np.array((.56, .405, .185) if i not in (2, 7, 10) else (.40, .355, .205), dtype=np.float32)
        color = np.broadcast_to(case, rgb.shape).copy()
        color += rng.uniform(-.015, .015)
        bullet = np.broadcast_to(x >= .81, coverage.shape)
        color[bullet] = (.65, .345, .19)
        shoulder = ((x > .67) & (x < .76)).astype(np.float32)
        shine *= 1.0 - shoulder * .11
        rim = ((x >= 0) & (x < .030)).astype(np.float32)
        groove = ((x >= .038) & (x < .065)).astype(np.float32)
        shine *= 1.0 + rim * .16 - groove * .67
        color *= shine[..., None]
        sealant = np.broadcast_to((x >= .775) & (x <= .795), coverage.shape)
        color[sealant] = np.stack((.34 + cylinder * .10, .028 + cylinder * .018,
                                  .025 + cylinder * .01), axis=-1)[sealant]
        color = color * .67 + np.array((.009, .013, .013), dtype=np.float32)
        _mix(rgb, color, coverage)
        _mix(visibility, .71 + cylinder * .23 - groove * .12, coverage)
    follower = ((vv >= .228) & (vv <= .240) & (uu >= .411) & (uu <= .589)).astype(np.float32)
    follower = bevel_mask(follower, width_px=2, profile="trapezoid")
    _mix(rgb, (.31, .045, .033), follower)
    _mix(visibility, .78, follower)
    rows, cols = slice(h - y1, h - y0), slice(x0, x1)
    mask = glass[rows, cols]
    _mix(albedo[rows, cols], rgb, mask)
    _mix(cavity[rows, cols], visibility, mask)


def build_ak_mag_suite():
    w, h = 1024, 1024
    u, v = _uv(w, h)
    cells, edges = worley_cellular(h, w, 260, 260, seed=801)
    grain = (.42 - cells) * .8 + (edges - .17) * .4
    wipe = fbm_noise(h, w, base_freq=10, octaves=3, seed=802)
    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (.192, .204, .220)
    albedo += (grain * .014 + wipe * .003)[..., None]
    height = grain * .16
    roughness = .60 + grain * .042 - wipe * .018
    metalness = np.full((h, w), .03, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)

    rib_mask = np.zeros((h, w), dtype=np.float32)
    for center in (.25, .361111, .472222, .583333, .694444, .805556):
        for a, b in ((.08, .355), (.645, .92)):
            rib_mask = np.maximum(rib_mask, _box(u, v, a, b, center - .014, center + .014))
    ribs = bevel_mask(rib_mask, width_px=3.5, profile="trapezoid")
    height += ribs * .82
    roughness -= ribs * .045
    albedo += (ribs * .008)[..., None]
    cavity *= 1.0 - .10 * _edge(rib_mask, 2)

    window = _box(u, v, .40, .60, .22, .78)
    glass = _box(u, v, .406, .594, .226, .774)
    rim = np.clip(window - glass, 0, 1)
    height -= .82 * bevel_mask(window, width_px=4, profile="trapezoid")
    height += .20 * bevel_mask(rim, width_px=1.8, profile="trapezoid")
    _mix(height, -.79, glass)  # optically flat PC front surface
    _mix(roughness, .43, rim)
    _mix(roughness, .08, glass)
    _mix(metalness, .04, glass)  # Makrolon polycarbonate dielectric B <= 0.05
    cavity *= 1.0 - rim * .27
    _window_cartridges(albedo, cavity, glass, w, h)
    cavity *= 1.0 - _edge(glass, 4) * .23
    _mix(albedo, (.148, .158, .172), rim * .78)

    insertion = _box(u, v, .08, .92, .82, .96)
    scuffs = scratch_field(h, w, count=520, min_len=12, max_len=105,
                          angle_deg=90, angle_spread=5, seed=809, mask=insertion)
    _mix(albedo, (.255, .266, .282), scuffs * .58)
    roughness -= scuffs * .14
    height -= scuffs * .04

    conv_mag = smoothstep(.08, .48, compute_convexity(height, sigma=2.0)) * (1.0 - glass)
    albedo += (conv_mag * .026)[..., None]
    roughness -= conv_mag * .045

    # World-proportional 1:1 magazine witness numbers & caliber stamp!
    # applyAkMagUVs maps rSpan=2.70 cm -> u=.08..92 (318.6 px/cm) and
    # arcSpan=10.86 cm -> v=.10..95 (80.2 px/cm): px/py = 3.975x!
    # Using isotropic 320 px/cm -> 864 x 3475 px un-squashes text 3.98x on the 3D mag!
    mw, mh = 864, 3475
    mag_canvas = Image.new("L", (mw, mh), 0)
    dm = ImageDraw.Draw(mag_canvas)
    font_num = load_font(FONT_COND, 86)
    for label, v_val in (("10", .72), ("15", .60), ("20", .48), ("25", .36), ("30", .25)):
        cy = int((1.0 - (v_val - .10) / .85) * mh)
        x_tick0 = int((.603 - .08) / .84 * mw)
        x_tick1 = int((.624 - .08) / .84 * mw)
        dm.line([(x_tick0, cy), (x_tick1, cy)], fill=255, width=7)
        dm.text((x_tick1 + 14, cy), label, fill=255, font=font_num, anchor="lm")

    cy_cal = int((1.0 - (.155 - .10) / .85) * mh)
    dm.text((mw // 2, cy_cal), "7,62×39", fill=255, font=load_font(FONT_COND, 102), anchor="mm")

    lettering = np.zeros((h, w), dtype=np.float32)
    _paste_world(lettering, mag_canvas, .08, .92, .10, .95)
    height += .32 * bevel_mask(lettering, width_px=1.0, profile="trapezoid")
    _mix(albedo, (.52, .54, .55), lettering * .88)
    roughness -= lettering * .05
    _mix(metalness, .03, lettering)

    steel = _box(u, v, .78, 1, 0, .07)
    _mix(albedo, (.70, .73, .76), steel)
    _mix(roughness, .20, steel)
    _mix(metalness, .96, steel)
    _mix(height, cnc_toolpath(h, w, pitch_px=3, angle_deg=0, seed=819) * .025, steel)
    _mix(cavity, 1.0, steel)
    _save("ak_mag", albedo, height, roughness, metalness, cavity, 2.2)


def build_ak_metal_suite():
    w, h = 1024, 1024
    u, v = _uv(w, h)
    cells, edges = worley_cellular(h, w, 320, 320, seed=902)
    grain = (.4 - cells) * .7 + (edges - .18) * .3
    milling = cnc_toolpath(h, w, pitch_px=5.5, angle_deg=5, seed=901)
    lathe = cnc_toolpath(h, w, pitch_px=2.8, angle_deg=90, seed=904)
    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (.32, .345, .372)
    albedo += (milling * .006 + grain * .012)[..., None]
    height = milling * .045 + grain * .025
    roughness = .285 + grain * .035 + milling * .012
    metalness = np.full((h, w), .64, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)

    rails = np.maximum(_box(u, v, .03, .52, .585, .603), _box(u, v, .03, .52, .871, .889))
    rail_u_taper = smoothstep(.03, .085, u) * (1.0 - smoothstep(.43, .52, u))
    rail_v_band = np.maximum(np.exp(-((v - .594) / .0072) ** 2),
                             np.exp(-((v - .880) / .0072) ** 2))
    rail_contact = (rail_u_taper * rail_v_band).astype(np.float32)
    height -= .12 * bevel_mask(rails, width_px=2, profile="trapezoid") * rail_u_taper
    tracks = scratch_field(h, w, count=1400, min_len=28, max_len=210,
                           angle_deg=0, angle_spread=1.5, seed=907, mask=rail_contact)
    chips, halo = chipped_edge_wear(rail_contact * .92, seed=908, wear_amount=.58)
    _mix(albedo, (.17, .18, .18), halo * .22)
    _bare(albedo, height, roughness, metalness, np.maximum(chips, smoothstep(.18, .55, tracks)),
          (.59, .62, .64), rough=.18, metal=.96)

    piston = _box(u, v, 0, 1, .08, .48)
    _mix(albedo, np.array((.79, .815, .835), dtype=np.float32) + lathe[..., None] * .009, piston)
    _mix(height, lathe * .018 + grain * .008, piston)
    _mix(roughness, .13 + grain * .012, piston)
    _mix(metalness, .98, piston)

    stops = [.72, .755, .79, .825, .855, .90]
    colors = np.array(((.79, .815, .835), (.77, .68, .43), (.66, .50, .25),
                       (.40, .34, .49), (.57, .40, .255), (.36, .30, .235)), dtype=np.float32)
    temper_rgb = np.stack([np.broadcast_to(np.interp(u, stops, colors[:, c]), (h, w)) for c in range(3)], axis=-1)
    temper = piston * smoothstep(.72, .755, u)
    _mix(albedo, temper_rgb, temper * .80)
    roughness += temper * .055

    crust = .5 + .5 * fbm_noise(h, w, base_freq=45, octaves=4, seed=903)
    soot = piston * smoothstep(.875, .968, u + (crust - .5) * .028)
    rings = np.zeros((h, w), dtype=np.float32)
    for x in (.918, .945, .973):
        rings = np.maximum(rings, _box(u, v, x - .0035, x + .0035, .08, .48))
    height -= bevel_mask(rings, width_px=1.6, profile="trapezoid") * .32
    soot = np.maximum(soot, rings * .90)
    _mix(albedo, np.array((.036, .038, .040), dtype=np.float32) + crust[..., None] * .016, soot)
    _mix(roughness, .87 + (crust - .5) * .05, soot)
    _mix(metalness, .03, soot)  # amorphous carbon soot dielectric B <= 0.05
    height += soot * ((crust - .5) * .17 + grain * .16)
    cavity *= 1.0 - rings * .24
    _save("ak_metal", albedo, height, roughness, metalness, cavity, 2.4)


if __name__ == "__main__":
    build_ak_receiver_suite()
    build_ak_mag_suite()
    build_ak_metal_suite()
