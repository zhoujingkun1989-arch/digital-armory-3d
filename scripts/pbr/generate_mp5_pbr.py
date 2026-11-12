#!/usr/bin/env python3
"""MP5A3 lacquered receiver / Navy polyamide albedo, normal and RGB ORM.

UNCHANGED UV CONTRACT:
  mp5_receiver_{albedo,normal,roughness}.png: 2048x1024.
    Right U .03..97 / V .53..97 (11.0 x 4.45 cm -> px/py = 1.7285x);
    Left  U .03..97 / V .07..51 (11.0 x 4.45 cm -> px/py = 1.7285x).
    Stock channels: U .03..64 / V .806 and U .36..97 / V .346.
    Magwell flutes: U .685/.735/.785, V .55..72;
                    U .215/.265/.315, V .09..26.
    Deflector scuffs (.625,.815); left [HK] origin (.175,.435).
    Bright steel U >= .78 / V <= .06.
  mp5_lower_{albedo,normal,roughness}.png: 1024x1024.
    Right U .05..95 / V .52..96 (8.15 x 6.75 cm -> px/py = 1.694x);
    Left  U .05..95 / V .05..49 (8.15 x 6.75 cm -> px/py = 1.694x).
    Selector pivots (.420,.885) right / (.580,.415) left.
    +X muzzle points toward +U right / -U left: pictograms mirror toward muzzle.
    Molded grip emblems at U .24 / V .62 and U .70 / V .15.

The historical roughness suffix holds R=AO, G=roughness, B=metalness.
PBR_OUTPUT_FORMAT changes only the extension. All noise is deterministic.
"""

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


def _draw_ulm_proof(draw, x, y):
    """German Beschussamt Ulm stag-antler + Federal Eagle / N nitro proof stamps."""
    # Stag antler beam + 4 tines
    draw.line([(x, y + 34), (x + 18, y + 30), (x + 34, y + 16), (x + 48, y + 3)],
              fill=255, width=4)
    for pts in (
        [(x + 14, y + 30), (x + 8, y + 19), (x + 8, y + 10)],
        [(x + 24, y + 24), (x + 22, y + 11), (x + 27, y + 4)],
        [(x + 35, y + 15), (x + 35, y + 2)],
        [(x + 37, y + 15), (x + 52, y + 17), (x + 60, y + 11)],
    ):
        draw.line(pts, fill=255, width=3)
    # German Federal Eagle over 'N' shield + Ulm 'IK' date code
    ex, ey = x + 86, y + 18
    draw.polygon([(ex - 16, ey - 14), (ex + 16, ey - 14), (ex + 12, ey + 2),
                  (ex, ey + 10), (ex - 12, ey + 2)], outline=255, width=3)
    draw.line([(ex - 22, ey - 10), (ex + 22, ey - 10)], fill=255, width=3)
    draw.text((ex + 28, y + 4), "N · IK · ULM", fill=245, font=load_font(FONT_COND, 30))


def build_mp5_receiver_suite() -> None:
    w, h = 2048, 1024
    u, v = _uv(w, h)
    cells, boundaries = worley_cellular(h, w, 330, 570, seed=301)
    peel = (.42 - cells) * .75 + (boundaries - .17) * .3
    oil = .5 + .5 * fbm_noise(h, w, base_freq=8, octaves=4, seed=302)
    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (.208, .224, .244)  # RAL 9005 satin black baked lacquer
    albedo += (peel * .009 - oil * .003)[..., None]
    height = peel * .033
    roughness = .31 + peel * .025 - (oil - .5) * .040
    metalness = np.full((h, w), .50, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)
    walls = np.maximum(_box(u, v, .03, .97, .53, .97), _box(u, v, .03, .97, .07, .51))

    # Flat-bottomed, finite A3 stock guide channels with crisp planar bevels.
    channels = np.maximum(_box(u, v, .03, .64, .788, .824),
                          _box(u, v, .36, .97, .328, .364))
    channel_profile = bevel_mask(channels, width_px=4, profile="trapezoid")
    height -= channel_profile * .57
    cavity *= 1 - _edge(channels, 4) * .13
    albedo -= (channel_profile * .005)[..., None]

    # Six stamped, beveled magwell flutes retain exact original UV centers.
    flutes = np.zeros((h, w), dtype=np.float32)
    for xs, low, high in (((.685, .735, .785), .55, .72), ((.215, .265, .315), .09, .26)):
        for x in xs:
            flutes = np.maximum(flutes, _box(u, v, x - .010, x + .010, low, high))
    flute_profile = bevel_mask(flutes, width_px=4, profile="trapezoid")
    height -= flute_profile * .55
    cavity *= 1 - _edge(flutes, 3) * .10

    # Short, heat-affected TIG/resistance trunnion welds.
    welds = np.maximum(_box(u, v, .603, .609, .630, .770),
                       _box(u, v, .391, .397, .170, .310))
    bead = bevel_mask(welds, width_px=2, profile="round")
    ripple = .5 + .5 * np.cos(v * h * (2 * np.pi / 7.5))
    height += bead * (.105 + .045 * ripple)
    _mix(albedo, (.188, .182, .176), welds * .22)
    roughness += welds * .025

    contact = np.maximum(_edge(walls, 5), _edge(channels, 2) * .90)
    contact *= np.clip(.63 + .55 * fbm_noise(h, w, base_freq=41, octaves=3, seed=310), .12, 1.0)
    chips, oxide = chipped_edge_wear(contact, seed=311, wear_amount=.58)
    handling = scratch_field(h, w, count=85, min_len=16, max_len=52,
                             angle_deg=-10, angle_spread=28, seed=312, mask=walls)
    _mix(albedo, (.276, .292, .314), handling * .28)
    roughness -= handling * .068
    height -= handling * .022
    _mix(albedo, (.152, .148, .144), oxide * .38)
    roughness += oxide * .045
    _bare(albedo, height, roughness, metalness, chips,
          (.60, .63, .66), rough=.18, metal=.96)
    sliding = scratch_field(h, w, count=1900, min_len=25, max_len=240,
                            angle_deg=0, angle_spread=1.4, seed=313, mask=channel_profile)
    sliding = smoothstep(.15, .56, sliding)
    _bare(albedo, height, roughness, metalness, sliding, (.62, .65, .68), rough=.18, metal=.96)

    conv_rec = smoothstep(.08, .50, compute_convexity(height, sigma=2.0)) * walls
    albedo += (conv_rec * .026)[..., None]
    roughness -= conv_rec * .046

    # Individual oblique brass-transfer kisses behind ejection port.
    x0, x1 = int(.600 * w), int(.650 * w)
    y0, y1 = int((1 - .85) * h), int((1 - .78) * h)
    kiss = scratch_field(y1 - y0, x1 - x0, count=32, min_len=3, max_len=25,
                         angle_deg=-28, angle_spread=18, seed=315)
    local_u, local_v = _uv(x1 - x0, y1 - y0)
    kiss *= _ellipse(local_u, local_v, .50, .50, .39, .43, x1 - x0, y1 - y0)
    kiss = smoothstep(.13, .62, kiss)
    section = np.s_[y0:y1, x0:x1]
    _mix(albedo[section], (.63, .46, .22), kiss)
    _mix(roughness[section], .25, kiss)
    _mix(metalness[section], .96, kiss)

    # World-proportional 2.4x supersampled receiver canvases:
    # u=[0.03, 0.97], v=[0.07, 0.51] / [0.53, 0.97] map 11.0 x 4.45 cm (px/py = 1.7285x!).
    # Using isotropic 240 px/cm -> 2640 x 1068 px eliminates the 1.73x horizontal squash!
    cw, ch = 2640, 1068
    w_left, r_left, w_right = [Image.new("L", (cw, ch), 0) for _ in range(3)]
    dwl, drl, dwr = [ImageDraw.Draw(im) for im in (w_left, r_left, w_right)]

    def uv_to_canvas(u_val, v_val, v0):
        return (int(round((u_val - .03) / .94 * cw)),
                int(round((1.0 - (v_val - v0) / .44) * ch)))

    # Left flank ([HK] red box + MP5 Kal. 9mmx19 + Ulm stag-antler & Eagle/N proof)
    lx, ly = uv_to_canvas(.165, .445, .07)
    drl.rounded_rectangle((lx, ly, lx + 124, ly + 88), radius=10, outline=255, width=6)
    drl.text((lx + 62, ly + 44), "HK", fill=255, font=load_font(FONT_DIN, 68), anchor="mm")
    dwl.text((lx + 152, ly + 4), "MP5   Kal. 9mm×19", fill=255, font=load_font(FONT_DIN, 68))
    dwl.text((lx + 152, ly + 92), "DE   62 - 19408   CIP / N", fill=245, font=load_font(FONT_DIN, 44))
    _draw_ulm_proof(dwl, lx + 745, ly + 94)

    mlx, mly = uv_to_canvas(.185, .305, .07)
    dwl.text((mlx, mly), "HK  MP5  9mm×19", fill=250, font=load_font(FONT_DIN, 44))

    # Right flank (Oberndorf manufacturer rollmark + magwell caliber)
    rx, ry = uv_to_canvas(.335, .892, .53)
    dwr.text((rx, ry), "HECKLER & KOCH GMBH", fill=255, font=load_font(FONT_DIN, 46))
    dwr.text((rx, ry + 58), "OBERNDORF / N.  MADE IN GERMANY", fill=240, font=load_font(FONT_DIN, 38))
    mrx, mry = uv_to_canvas(.662, .768, .53)
    dwr.text((mrx, mry), "HK  9mm×19", fill=250, font=load_font(FONT_DIN, 44))

    white_mark = np.zeros((h, w), dtype=np.float32)
    red_mark = np.zeros((h, w), dtype=np.float32)
    _paste_world(white_mark, w_left, .03, .97, .07, .51)
    _paste_world(red_mark, r_left, .03, .97, .07, .51)
    _paste_world(white_mark, w_right, .03, .97, .53, .97)

    mark = np.maximum(white_mark, red_mark)
    height -= bevel_mask(mark, width_px=1.0, profile="trapezoid") * .52
    _mix(albedo, (.78, .80, .82), white_mark * .95)
    _mix(albedo, (.73, .052, .043), red_mark * .97)
    _mix(roughness, .38, white_mark)
    _mix(roughness, .28, red_mark)
    _mix(metalness, .03, mark)  # baked enamel infill B <= 0.05
    cavity *= 1 - mark * .09

    steel = _box(u, v, .78, 1, 0, .06)
    _mix(albedo, (.73, .76, .79), steel)
    _mix(roughness, .20, steel)
    _mix(metalness, .96, steel)
    _mix(height, cnc_toolpath(h, w, pitch_px=3, angle_deg=0, seed=319) * .025, steel)
    _mix(cavity, 1.0, steel)
    _save("mp5_receiver", albedo, height, roughness, metalness, cavity, 2.1)


def _draw_bullet_world(draw, cx, cy, length, height_px, dir_sign):
    """1:1 world-proportional FMJ cartridge silhouette oriented toward +X muzzle."""
    s = dir_sign
    x0, shoulder, neck, tip = -length * .5, length * .22, length * .30, length * .5
    r = height_px * .5
    pts = [
        (x0, -r), (shoulder, -r), (neck, -r * .65),
        (tip - length * .08, -r * .30), (tip, 0),
        (tip - length * .08, r * .30), (neck, r * .65),
        (shoulder, r), (x0, r),
    ]
    draw.polygon([(round(cx + x * s), round(cy + y)) for x, y in pts], fill=255)


def _draw_navy_cluster_world(w_draw, r_draw, piv_x, piv_y, dir_sign):
    """1:1 world-proportional HK Navy 0/1/7 bullet pictogram cluster."""
    s = dir_sign
    box_w, box_h = 156, 54
    for mode, dy, r_off in (("safe", 78, 152), ("semi", 0, 162), ("auto", -80, 152)):
        draw = w_draw if mode == "safe" else r_draw
        center_x = piv_x + (r_off + box_w // 2) * s
        cy = piv_y + dy
        a, b = center_x - box_w / 2, center_x + box_w / 2
        half_h = 34 if mode == "auto" else box_h / 2
        top, bottom = cy - half_h, cy + half_h

        # Circular selector index dot on true radial arc
        dot_x = piv_x + (108 if mode == "semi" else 100) * s
        draw.ellipse((dot_x - 6, cy - 6, dot_x + 6, cy + 6), fill=255)

        if mode == "auto":
            # Open-front 7-round burst pictogram box (open toward muzzle)
            rear, front = (a, b) if s > 0 else (b, a)
            draw.line([(front, top), (rear, top), (rear, bottom), (front, bottom)],
                      fill=255, width=5)
            for yy in (top + 8, cy, bottom - 8):
                draw.rectangle((front - 3, yy - 3, front + 3, yy + 3), fill=255)
            # 7 staggered bullet icons (3 + 2 + 2)
            for ox, oy in ((-42, -16), (6, -16), (52, -16),
                           (-18, 0), (30, 0),
                           (-42, 16), (6, 16)):
                _draw_bullet_world(draw, center_x + ox * s, cy + oy, 38, 10, s)
        else:
            draw.rounded_rectangle((a, top, b, bottom), radius=4, outline=255, width=5)
            _draw_bullet_world(draw, center_x, cy, 88 if mode == "safe" else 96, 22, s)
            if mode == "safe":
                # Diagonal cancel X across safe cartridge box
                draw.line([(a + 24, bottom - 6), (b - 24, top + 6)], fill=255, width=5)
                draw.line([(a + 24, top + 6), (b - 24, bottom - 6)], fill=255, width=5)


def build_mp5_lower_suite() -> None:
    w, h = 1024, 1024
    u, v = _uv(w, h)
    cells, edges = worley_cellular(h, w, 300, 180, seed=401)
    grain = (.43 - cells) * .85 + (edges - .17) * .35
    wipe = .5 + .5 * fbm_noise(h, w, base_freq=10, octaves=3, seed=402)
    albedo = np.empty((h, w, 3), dtype=np.float32)
    albedo[:] = (.185, .196, .212)
    albedo += (grain * .013 - wipe * .002)[..., None]
    height = grain * .16
    roughness = .58 + grain * .045
    metalness = np.full((h, w), .03, dtype=np.float32)
    cavity = np.ones((h, w), dtype=np.float32)
    for x, y in ((.25, .68), (.75, .21)):
        contact = np.exp(-(((u - x) / .105) ** 2 + ((v - y) / .11) ** 2))
        roughness -= contact * (.045 + wipe * .035)
        albedo += (contact * .0025)[..., None]
    fibers = scratch_field(h, w, count=420, min_len=2, max_len=6,
                           angle_deg=65, angle_spread=60, seed=407)
    height += fibers * .018
    albedo += (fibers * .002)[..., None]

    # World-proportional 2.4x supersampled Navy grip housing canvases:
    # u=[0.05, 0.95], v=[0.52, 0.96] / [0.05, 0.49] map 8.15 x 6.75 cm (px/py = 1.694x!).
    # Using isotropic 240 px/cm -> 1956 x 1620 px eliminates the 1.69x horizontal squash!
    cw, ch = 1956, 1620
    w_right, r_right, m_right = [Image.new("L", (cw, ch), 0) for _ in range(3)]
    w_left, r_left, m_left = [Image.new("L", (cw, ch), 0) for _ in range(3)]

    def uv_to_lower(u_val, v_val, v0):
        return (int(round((u_val - .05) / .90 * cw)),
                int(round((1.0 - (v_val - v0) / .44) * ch)))

    # Right flank: pivot (.420, .885), muzzle +X is +U (+1)
    prx, pry = uv_to_lower(.420, .885, .52)
    _draw_navy_cluster_world(ImageDraw.Draw(w_right), ImageDraw.Draw(r_right), prx, pry, +1)
    grx, gry = uv_to_lower(.24, .62, .52)
    dmr = ImageDraw.Draw(m_right)
    dmr.rounded_rectangle((grx, gry, grx + 138, gry + 94), radius=10, outline=255, width=6)
    dmr.text((grx + 69, gry + 47), "HK", fill=255, font=load_font(FONT_DIN, 68), anchor="mm")

    # Left flank: pivot (.580, .415), muzzle +X is -U (-1)
    plx, ply = uv_to_lower(.580, .415, .05)
    _draw_navy_cluster_world(ImageDraw.Draw(w_left), ImageDraw.Draw(r_left), plx, ply, -1)
    glx, gly = uv_to_lower(.70, .15, .05)
    dml = ImageDraw.Draw(m_left)
    dml.rounded_rectangle((glx, gly, glx + 138, gly + 94), radius=10, outline=255, width=6)
    dml.text((glx + 69, gly + 47), "HK", fill=255, font=load_font(FONT_DIN, 68), anchor="mm")

    w_mark = np.zeros((h, w), dtype=np.float32)
    r_mark = np.zeros((h, w), dtype=np.float32)
    m_mark = np.zeros((h, w), dtype=np.float32)
    _paste_world(w_mark, w_right, .05, .95, .52, .96)
    _paste_world(r_mark, r_right, .05, .95, .52, .96)
    _paste_world(m_mark, m_right, .05, .95, .52, .96)
    _paste_world(w_mark, w_left, .05, .95, .05, .49)
    _paste_world(r_mark, r_left, .05, .95, .05, .49)
    _paste_world(m_mark, m_left, .05, .95, .05, .49)

    paint = np.maximum(w_mark, r_mark)
    pocket = ndimage.maximum_filter(paint, size=3)
    recess = bevel_mask(pocket, width_px=1.5, profile="trapezoid")
    height -= recess * .73
    height += bevel_mask(paint, width_px=1.0, profile="round") * .16
    cavity *= (1 - pocket * .16) * (1 - paint * .06)
    _mix(albedo, (.136, .145, .158), np.clip(pocket - paint, 0, 1) * .78)
    _mix(albedo, (.90, .915, .925), w_mark)
    _mix(albedo, (.76, .043, .031), r_mark)
    _mix(roughness, .26, paint)
    _mix(metalness, .03, paint)  # enamel paint dielectric B <= 0.05
    height -= bevel_mask(m_mark, width_px=1.0, profile="trapezoid") * .40
    _mix(albedo, (.152, .162, .176), m_mark * .74)
    cavity *= 1 - m_mark * .13
    conv_low = smoothstep(.08, .50, compute_convexity(height, sigma=1.8)) * (1.0 - paint)
    albedo += (conv_low * .020)[..., None]
    roughness -= conv_low * .038
    _save("mp5_lower", albedo, height, roughness, metalness, cavity, 2.0)


if __name__ == "__main__":
    build_mp5_receiver_suite()
    build_mp5_lower_suite()
