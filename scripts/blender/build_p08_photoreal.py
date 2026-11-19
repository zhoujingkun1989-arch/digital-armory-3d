#!/usr/bin/env python3
"""
Digital Armory 3D — AAA Hard-Surface Blender 5.2 Generator & Cycles Baker
Exhibit #1 (PR-02): 1917 DWM Parabellum-Pistole 1908 (Luger P08, 9x19mm)

MIT License — 100% deterministic, headless, reproducible Blender 5.2 Python pipeline.

Outputs:
  - public/models/p08.glb                              (Draco-compressed glTF, 22 solid parts, Option A local space)
  - public/textures/p08_v3_metal_{albedo,normal,roughness}.webp   (2048x2048 5-Ch Packed ORM)
  - public/textures/p08_v3_walnut_{albedo,normal,roughness}.webp  (2048x2048 5-Ch Packed ORM)

Coordinate contract:
  - Three.js metric scale: 1 world unit = 1 cm = 10 mm (+X muzzle, +Y up, +Z right flank).
  - Blender glTF export_yup=True maps Blender (bx, by, bz) -> glTF (bx, bz, -by).
  - Therefore every Three.js coordinate (tx, ty, tz) is built in Blender at (tx, -tz, ty).
  - Standard Blender UVs (v=0 bottom, v=1 top) + OpenGL +Y tangent normal maps match
    glbAssetService.ts (v_three = 1 - v_gltf = v_blender) + TextureLoader(flipY=True).

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \
    --python scripts/blender/build_p08_photoreal.py
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable, Iterable, Sequence

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

# ============================================================================
# 1. METRIC CAD CONSTANTS (1:1 match with src/weapons/p08/plugin.ts)
# ============================================================================

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = REPO_ROOT / "public" / "models"
TEXTURES_DIR = REPO_ROOT / "public" / "textures"
GLB_OUT_PATH = MODELS_DIR / "p08.glb"

TEX_SIZE = 2048

P08_BORE_Y = 2.15
P08_GRIP_ANGLE_RAD = math.radians(-35.0)
P08_TOGGLE_LINK_LEN = 4.62
P08_TOGGLE_OVERCENTER_RAD = math.radians(1.5)
P08_FRONT_PIN_X0 = -0.18
P08_TOGGLE_SPAN_D0 = 2.0 * P08_TOGGLE_LINK_LEN * math.cos(P08_TOGGLE_OVERCENTER_RAD)
P08_REAR_AXLE_X0 = P08_FRONT_PIN_X0 - P08_TOGGLE_SPAN_D0  # -9.41683354
P08_KNEE_LOCAL_DX = P08_TOGGLE_LINK_LEN * math.cos(P08_TOGGLE_OVERCENTER_RAD)  # 4.61841677
P08_KNEE_LOCAL_DY = -P08_TOGGLE_LINK_LEN * math.sin(P08_TOGGLE_OVERCENTER_RAD)  # -0.12093765

# Exact Three.js assembledPos & assembledRotZ from src/weapons/p08/plugin.ts
ASSEMBLED_POSES: dict[str, tuple[tuple[float, float, float], float]] = {
    "p08_barrel": ((0.0, 0.0, 0.0), 0.0),
    "p08_barrel_extension": ((0.0, 0.0, 0.0), 0.0),
    "p08_breechblock": ((0.0, 0.0, 0.0), 0.0),
    "p08_extractor": ((0.95, 2.72, 0.0), 0.0),
    "p08_front_toggle": ((P08_FRONT_PIN_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_rear_toggle": ((P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_toggle_pins": ((P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), 0.0),
    "p08_striker": ((0.35, P08_BORE_Y, 0.0), 0.0),
    "p08_frame": ((0.0, 0.0, 0.0), 0.0),
    "p08_sideplate": ((1.35, 0.92, -0.96), 0.0),
    "p08_takedown_lever": ((2.55, 0.48, -0.95), 0.0),
    "p08_ejector": ((-1.15, 2.02, 0.72), 0.0),
    "p08_hold_open": ((-0.85, 1.28, 0.36), 0.0),
    "p08_grip_left": ((-5.65, -4.45, -0.92), 0.0),
    "p08_grip_right": ((-5.65, -4.45, 0.92), 0.0),
    "p08_trigger": ((0.55, -0.15, 0.0), 0.0),
    "p08_trigger_lever": ((1.15, 0.92, -0.82), 0.0),
    "p08_sear_bar": ((-1.85, 2.08, -1.04), 0.0),
    "p08_thumb_safety": ((-7.35, 0.45, -0.96), 0.0),
    "p08_mag_body": ((-4.45, -3.30, 0.0), P08_GRIP_ANGLE_RAD),
    "p08_mag_follower": ((-6.58, -6.34, 0.0), P08_GRIP_ANGLE_RAD),
    "p08_mag_base": ((-8.18, -8.62, 0.0), P08_GRIP_ANGLE_RAD),
}

WALNUT_PARTS = ("p08_grip_left", "p08_grip_right")
METAL_PARTS = tuple(k for k in ASSEMBLED_POSES.keys() if k not in WALNUT_PARTS)


def t2b(tx: float, ty: float, tz: float) -> Vector:
    """Maps Three.js (+X muzzle, +Y up, +Z right) -> Blender (+X muzzle, -Y right, +Z up)."""
    return Vector((tx, -tz, ty))


def b2t(bx: float, by: float, bz: float) -> tuple[float, float, float]:
    """Inverse of t2b: Blender -> Three.js."""
    return (bx, bz, -by)


def mat_three_rot_z(theta: float) -> Matrix:
    """Rotation by +theta around Three.js +Z == rotation by -theta around Blender +Y."""
    return Matrix.Rotation(-theta, 4, "Y")


def mat_three_rot_x(theta: float) -> Matrix:
    """Rotation by +theta around Three.js +X == rotation by +theta around Blender +X."""
    return Matrix.Rotation(theta, 4, "X")


def mat_three_rot_y(theta: float) -> Matrix:
    """Rotation by +theta around Three.js +Y == rotation by +theta around Blender +Z."""
    return Matrix.Rotation(theta, 4, "Z")


def mat_three_translate(tx: float, ty: float, tz: float) -> Matrix:
    return Matrix.Translation(t2b(tx, ty, tz))


# ============================================================================
# 2. SCENE, ENGINE & SYSTEM PYTHON HELPERS
# ============================================================================


def find_system_python() -> str:
    for candidate in ("/usr/bin/python3", shutil.which("python3") or "python3"):
        if candidate and os.path.exists(candidate):
            res = subprocess.run(
                [candidate, "-c", "import PIL, numpy"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if res.returncode == 0:
                return candidate
    raise RuntimeError("System python3 with PIL + numpy is required for decal/WebP encoding.")


def setup_clean_cycles_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"

    # Prefer Apple Metal GPU on macOS, fallback cleanly to CPU
    prefs = bpy.context.preferences.addons["cycles"].preferences
    device_set = False
    for backend in ("METAL", "CUDA", "OPTIX", "HIP"):
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
            gpu_devs = [d for d in prefs.devices if d.type == backend]
            if gpu_devs:
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                device_set = True
                print(f"[CYCLES] Using {backend} GPU: {[d.name for d in gpu_devs]}")
                break
        except Exception:
            continue
    if not device_set:
        scene.cycles.device = "CPU"
        print("[CYCLES] Using CPU backend")

    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2
    scene.cycles.diffuse_bounces = 1
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 0
    scene.cycles.volume_bounces = 0
    scene.render.bake.margin = 12
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_clear = False
    scene.render.bake.use_selected_to_active = False

    # Neutral world
    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs["Strength"].default_value = 1.0

    # Raw linear color management for accurate bake readback
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return scene


# ============================================================================
# 3. CRISP HISTORICAL 1917 DWM ENGRAVING DECAL GENERATOR (PIL via python3)
# ============================================================================

DECAL_GEN_CODE = r"""
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)

FONT_SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"
FONT_ITALIC = "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf"
FONT_SANS = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
FONT_COND = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"

def load_font(path, size):
    for p in (path, FONT_SERIF, FONT_SANS, "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def save_mask(img, name, blur_px=1.1):
    # Subtle Gaussian ramp yields razor-crisp V-carved bevel slopes in Cycles Bump!
    blurred = img.filter(ImageFilter.GaussianBlur(radius=blur_px))
    # Combine sharp core + sloped shoulder
    a_raw = np.asarray(img, dtype=np.float32) / 255.0
    a_blur = np.asarray(blurred, dtype=np.float32) / 255.0
    comb = np.clip(0.58 * a_raw + 0.42 * np.minimum(1.0, a_blur * 1.45), 0.0, 1.0)
    Image.fromarray(np.rint(comb * 255.0).astype(np.uint8), "L").save(
        os.path.join(out_dir, name)
    )

# 1. "1917" Chamber Ring Date (museum scale serif, crisp)
img = Image.new("L", (1024, 512), 0)
d = ImageDraw.Draw(img)
d.text((512, 256), "1917", fill=255, font=load_font(FONT_SERIF, 240), anchor="mm")
save_mask(img, "decal_1917.png", blur_px=1.4)

# 2. Intertwined Calligraphic "DWM" Scroll Monogram (authentic Berlin DWM cipher!)
img = Image.new("L", (1024, 512), 0)
d = ImageDraw.Draw(img)
cx, cy, sc = 512.0, 256.0, 390.0
sw = 18
thin = 10
# Ornate calligraphic 'D' outer bow & vertical stem with serifs
d.arc((cx - 0.56*sc, cy - 0.40*sc, cx + 0.42*sc, cy + 0.40*sc), start=-82, end=82, fill=255, width=sw)
d.line([(cx - 0.28*sc, cy - 0.39*sc), (cx - 0.28*sc, cy + 0.39*sc)], fill=255, width=sw)
d.arc((cx - 0.62*sc, cy - 0.46*sc, cx - 0.18*sc, cy - 0.14*sc), start=130, end=355, fill=255, width=thin)
d.arc((cx - 0.62*sc, cy + 0.14*sc, cx - 0.18*sc, cy + 0.46*sc), start=5, end=230, fill=255, width=thin)
# Sweeping interlaced 'W'
w_pts = [
    (cx - 0.42*sc, cy - 0.28*sc),
    (cx - 0.16*sc, cy + 0.34*sc),
    (cx + 0.00*sc, cy - 0.12*sc),
    (cx + 0.16*sc, cy + 0.34*sc),
    (cx + 0.42*sc, cy - 0.28*sc),
]
d.line(w_pts, fill=255, width=sw, joint="curve")
# Crowned interlaced 'M'
m_pts = [
    (cx - 0.36*sc, cy + 0.30*sc),
    (cx - 0.20*sc, cy - 0.36*sc),
    (cx + 0.00*sc, cy + 0.10*sc),
    (cx + 0.20*sc, cy - 0.36*sc),
    (cx + 0.36*sc, cy + 0.30*sc),
]
d.line(m_pts, fill=255, width=thin, joint="curve")
# Side calligraphic flourish curls
d.arc((cx - 0.72*sc, cy - 0.12*sc, cx - 0.44*sc, cy + 0.12*sc), start=30, end=330, fill=255, width=thin)
d.arc((cx + 0.44*sc, cy - 0.12*sc, cx + 0.72*sc, cy + 0.12*sc), start=210, end=150, fill=255, width=thin)
save_mask(img, "decal_dwm.png", blur_px=1.3)

# 3. 3 Crisp Imperial German Crowned Inspection Proofs + Imperial Eagle (right chamber flank)
img = Image.new("L", (1024, 384), 0)
d = ImageDraw.Draw(img)
def draw_crown_letter(x, y, s, ch):
    # Bold crisp Imperial crown silhouette (readable cleanly at 2K macro!)
    d.polygon([
        (x - 0.28*s, y - 0.06*s),
        (x - 0.36*s, y - 0.34*s),
        (x - 0.14*s, y - 0.20*s),
        (x, y - 0.42*s),
        (x + 0.14*s, y - 0.20*s),
        (x + 0.36*s, y - 0.34*s),
        (x + 0.28*s, y - 0.06*s),
    ], fill=255)
    d.rectangle((x - 0.30*s, y - 0.06*s, x + 0.30*s, y + 0.04*s), fill=255)
    d.text((x, y + 0.30*s), ch, fill=255, font=load_font(FONT_SERIF, int(0.52*s)), anchor="mm")

def draw_eagle(x, y, s):
    # Bold crisp Reichsadler military acceptance stamp
    d.polygon([
        (x - 0.22*s, y - 0.26*s),
        (x - 0.28*s, y - 0.44*s),
        (x - 0.10*s, y - 0.34*s),
        (x, y - 0.48*s),
        (x + 0.10*s, y - 0.34*s),
        (x + 0.28*s, y - 0.44*s),
        (x + 0.22*s, y - 0.26*s),
    ], fill=255)
    d.polygon([
        (x - 0.50*s, y - 0.10*s),
        (x - 0.16*s, y - 0.18*s),
        (x + 0.16*s, y - 0.18*s),
        (x + 0.50*s, y - 0.10*s),
        (x + 0.36*s, y + 0.14*s),
        (x + 0.16*s, y + 0.08*s),
        (x + 0.24*s, y + 0.42*s),
        (x, y + 0.30*s),
        (x - 0.24*s, y + 0.42*s),
        (x - 0.16*s, y + 0.08*s),
        (x - 0.36*s, y + 0.14*s),
    ], fill=255)

draw_crown_letter(175, 195, 220, "B")
draw_crown_letter(395, 195, 220, "R")
draw_crown_letter(615, 195, 220, "S")
draw_eagle(845, 195, 240)
save_mask(img, "decal_proofs.png", blur_px=1.0)

# 4. "GELADEN" on left side step of extractor
img = Image.new("L", (1024, 256), 0)
d = ImageDraw.Draw(img)
d.text((512, 128), "GELADEN", fill=255, font=load_font(FONT_SANS, 148), anchor="mm")
save_mask(img, "decal_geladen.png", blur_px=1.1)

# 5. "GESICHERT" in recessed left safety pocket of frame
img = Image.new("L", (1024, 256), 0)
d = ImageDraw.Draw(img)
d.text((512, 128), "GESICHERT", fill=255, font=load_font(FONT_COND, 148), anchor="mm")
save_mask(img, "decal_gesichert.png", blur_px=1.2)

# 6. Matching assembly digit "21" (sideplate, takedown lever, front toggle)
img = Image.new("L", (512, 512), 0)
d = ImageDraw.Draw(img)
d.text((256, 256), "21", fill=255, font=load_font(FONT_SERIF, 240), anchor="mm")
save_mask(img, "decal_21.png", blur_px=1.3)

# 7. Serial number "4821" + script "a" (frame front / mag base bottom)
img = Image.new("L", (1024, 512), 0)
d = ImageDraw.Draw(img)
d.text((512, 190), "4821", fill=255, font=load_font(FONT_SERIF, 185), anchor="mm")
d.text((512, 365), "a", fill=255, font=load_font(FONT_ITALIC, 150), anchor="mm")
save_mask(img, "decal_serial.png", blur_px=1.3)

# 8. "P.08" & "9 m/m" subtle stamp for magazine tube
img = Image.new("L", (512, 512), 0)
d = ImageDraw.Draw(img)
d.text((256, 210), "P.08", fill=255, font=load_font(FONT_SANS, 130), anchor="mm")
d.text((256, 355), "9 m/m", fill=240, font=load_font(FONT_SERIF, 96), anchor="mm")
save_mask(img, "decal_mag_p08.png", blur_px=1.2)

print("[DECALS] Generated 8 crisp engraving masks")
"""


def generate_decal_images(sys_py: str, temp_dir: str) -> dict[str, bpy.types.Image]:
    subprocess.run([sys_py, "-c", DECAL_GEN_CODE, temp_dir], check=True)
    decals: dict[str, bpy.types.Image] = {}
    for fname in (
        "decal_1917.png",
        "decal_dwm.png",
        "decal_proofs.png",
        "decal_geladen.png",
        "decal_gesichert.png",
        "decal_21.png",
        "decal_serial.png",
        "decal_mag_p08.png",
    ):
        img = bpy.data.images.load(os.path.join(temp_dir, fname))
        img.colorspace_settings.name = "Non-Color"
        img.pack()
        decals[fname.replace(".png", "")] = img
    return decals


# ============================================================================
# 4. HARD-SURFACE BMESH & MODIFIER TOOLKIT
# ============================================================================


def sample_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 12,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        x = mt * mt * p0[0] + 2.0 * mt * t * p1[0] + t * t * p2[0]
        y = mt * mt * p0[1] + 2.0 * mt * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def sample_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 16,
    include_start: bool = False,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    start = 0 if include_start else 1
    for i in range(start, steps + 1):
        t = i / steps
        mt = 1.0 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def rounded_polygon_2d(
    corners: Sequence[tuple[float, float, float]],
    arc_steps: int = 6,
) -> list[tuple[float, float]]:
    """
    Takes [(x, y, corner_radius), ...] in CCW or CW order and returns a smoothly
    filleted 2D polygon loop.
    """
    n = len(corners)
    out: list[tuple[float, float]] = []
    for i in range(n):
        p_prev = Vector((corners[(i - 1) % n][0], corners[(i - 1) % n][1]))
        p_curr = Vector((corners[i][0], corners[i][1]))
        p_next = Vector((corners[(i + 1) % n][0], corners[(i + 1) % n][1]))
        r = corners[i][2]
        if r <= 1e-5:
            out.append((p_curr.x, p_curr.y))
            continue
        v1 = p_prev - p_curr
        v2 = p_next - p_curr
        l1 = v1.length
        l2 = v2.length
        if l1 < 1e-6 or l2 < 1e-6:
            out.append((p_curr.x, p_curr.y))
            continue
        u1 = v1 / l1
        u2 = v2 / l2
        dot = max(-0.999, min(0.999, u1.dot(u2)))
        half_ang = 0.5 * math.acos(dot)
        tan_h = math.tan(half_ang)
        if tan_h < 1e-5:
            out.append((p_curr.x, p_curr.y))
            continue
        dist = min(r / tan_h, l1 * 0.45, l2 * 0.45)
        r_eff = dist * tan_h
        t1 = p_curr + u1 * dist
        t2 = p_curr + u2 * dist
        bis = (u1 + u2)
        if bis.length < 1e-6:
            out.append((p_curr.x, p_curr.y))
            continue
        bis.normalize()
        center = p_curr + bis * (r_eff / max(1e-5, math.sin(half_ang)))
        a1 = math.atan2(t1.y - center.y, t1.x - center.x)
        a2 = math.atan2(t2.y - center.y, t2.x - center.x)
        da = (a2 - a1 + math.pi) % (2.0 * math.pi) - math.pi
        for s in range(arc_steps + 1):
            a = a1 + da * (s / arc_steps)
            out.append((center.x + math.cos(a) * r_eff, center.y + math.sin(a) * r_eff))
    return out


def new_mesh_obj(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    set_smooth_shading(obj)
    return obj


def set_smooth_shading(obj: bpy.types.Object) -> None:
    mesh = obj.data
    n = len(mesh.polygons)
    if n > 0:
        mesh.polygons.foreach_set("use_smooth", [True] * n)


def cleanup_mesh(obj: bpy.types.Object, merge_dist: float = 0.0012) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0005, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def make_box_three(
    name: str,
    sx: float,
    sy: float,
    sz: float,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    bevel_segs: int = 3,
) -> bpy.types.Object:
    """Creates a solid box in Three.js coordinates, optionally multi-segment beveled."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # Scale in Blender: X=sx, Y=sz, Z=sy
    scale_m = Matrix.Diagonal((sx, sz, sy, 1.0))
    bmesh.ops.transform(bm, matrix=scale_m, verts=bm.verts)
    if bevel > 0.0:
        b = min(bevel, min(sx, sy, sz) * 0.42)
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=b,
            offset_type="OFFSET",
            segments=bevel_segs,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
    rot_m = (
        mat_three_rot_z(rot_three[2])
        @ mat_three_rot_y(rot_three[1])
        @ mat_three_rot_x(rot_three[0])
    )
    xform = mat_three_translate(*center) @ rot_m
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_cylinder_three(
    name: str,
    radius1: float,
    radius2: float,
    length: float,
    axis: str = "X",
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 36,
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_caps: float = 0.0,
) -> bpy.types.Object:
    """Watertight cylinder/frustum along Three.js axis 'X', 'Y', or 'Z'."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius1,
        radius2=radius2,
        depth=length,
    )
    if bevel_caps > 0.0:
        cap_edges = [e for e in bm.edges if len(e.link_faces) == 2 and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-4]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=min(bevel_caps, length * 0.35, min(radius1, radius2) * 0.4),
                segments=3,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
    # Blender cone is along +Z (= Three.js +Y)
    if axis == "X":
        # +Z_b -> +X_b: rotate +90 deg around Y_b
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "Y")
    elif axis == "Z":
        # +Z_b -> -Y_b (Three.js +Z): rotate +90 deg around X_b
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        axis_m = Matrix.Identity(4)

    rot_m = (
        mat_three_rot_z(rot_three[2])
        @ mat_three_rot_y(rot_three[1])
        @ mat_three_rot_x(rot_three[0])
    )
    xform = mat_three_translate(*center) @ rot_m @ axis_m
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_revolve_three(
    name: str,
    profile: Sequence[tuple[float, float]],
    axis: str = "X",
    segments: int = 48,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """
    Strictly watertight solid of revolution around Three.js axis 'X', 'Y', or 'Z'.
    `profile` is [(r, coord_along_axis), ...]:
      - Solid: starts at r=0 and ends at r=0
      - Hollow closed ring: profile[0] == profile[-1] with all r > 0
    """
    bm = bmesh.new()
    is_closed_loop = (
        len(profile) >= 3
        and profile[0][0] > 1e-6
        and abs(profile[0][0] - profile[-1][0]) < 1e-6
        and abs(profile[0][1] - profile[-1][1]) < 1e-6
    )
    pts = list(profile[:-1]) if is_closed_loop else list(profile)

    rings: list[list[bmesh.types.BMVert] | bmesh.types.BMVert] = []
    for r, coord in pts:
        if r <= 1e-6:
            v = bm.verts.new((0.0, 0.0, coord))
            rings.append(v)
        else:
            ring: list[bmesh.types.BMVert] = []
            for s in range(segments):
                a = (2.0 * math.pi * s) / segments
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), coord)))
            rings.append(ring)

    n_rings = len(rings)
    pair_count = n_rings if is_closed_loop else n_rings - 1
    for i in range(pair_count):
        r0 = rings[i]
        r1 = rings[(i + 1) % n_rings]
        if isinstance(r0, list) and isinstance(r1, list):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
                except ValueError:
                    pass
        elif isinstance(r0, bmesh.types.BMVert) and isinstance(r1, list):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0, r1[sn], r1[s]))
                except ValueError:
                    pass
        elif isinstance(r0, list) and isinstance(r1, bmesh.types.BMVert):
            for s in range(segments):
                sn = (s + 1) % segments
                try:
                    bm.faces.new((r0[s], r0[sn], r1))
                except ValueError:
                    pass

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    if axis == "X":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "Y")
    elif axis == "Z":
        axis_m = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        axis_m = Matrix.Identity(4)

    rot_m = (
        mat_three_rot_z(rot_three[2])
        @ mat_three_rot_y(rot_three[1])
        @ mat_three_rot_x(rot_three[0])
    )
    xform = mat_three_translate(*center) @ rot_m @ axis_m
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return new_mesh_obj(name, bm)


def make_extrude_z_three(
    name: str,
    poly_xy: Sequence[tuple[float, float]],
    z0: float,
    z1: float,
    bevel: float = 0.0,
    bevel_segs: int = 3,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_three: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """
    Extrudes a 2D (tx, ty) polygon cleanly along Three.js Z from z0 to z1,
    with optional smooth multi-segment bevel on the front/back cap rims AND sharp corners.
    """
    # Filter consecutive duplicate points
    clean_pts: list[tuple[float, float]] = []
    for p in poly_xy:
        if not clean_pts or math.hypot(p[0] - clean_pts[-1][0], p[1] - clean_pts[-1][1]) > 1e-5:
            clean_pts.append(p)
    if len(clean_pts) > 2 and math.hypot(clean_pts[0][0] - clean_pts[-1][0], clean_pts[0][1] - clean_pts[-1][1]) < 1e-5:
        clean_pts.pop()

    # Ensure CCW in (tx, ty)
    area = 0.0
    for i in range(len(clean_pts)):
        x0, y0 = clean_pts[i]
        x1, y1 = clean_pts[(i + 1) % len(clean_pts)]
        area += x0 * y1 - x1 * y0
    if area < 0:
        clean_pts.reverse()

    bm = bmesh.new()
    v_bot = [bm.verts.new(t2b(x, y, z0)) for (x, y) in clean_pts]
    v_top = [bm.verts.new(t2b(x, y, z1)) for (x, y) in clean_pts]
    n = len(clean_pts)
    bm.faces.new(v_bot)
    bm.faces.new(list(reversed(v_top)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((v_bot[i], v_bot[j], v_top[j], v_top[i]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    if bevel > 0.0:
        b = min(bevel, abs(z1 - z0) * 0.42)
        # Bevel front/back perimeter edges + sharp silhouette corners
        cap_edges = [
            e for e in bm.edges
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(24.0)
        ]
        if cap_edges:
            bmesh.ops.bevel(
                bm,
                geom=cap_edges,
                offset=b,
                offset_type="OFFSET",
                segments=bevel_segs,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )

    rot_m = (
        mat_three_rot_z(rot_three[2])
        @ mat_three_rot_y(rot_three[1])
        @ mat_three_rot_x(rot_three[0])
    )
    xform = mat_three_translate(*center) @ rot_m
    bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
    return new_mesh_obj(name, bm)


def bool_op(
    target: bpy.types.Object,
    cutter: bpy.types.Object,
    operation: str = "DIFFERENCE",
    delete_cutter: bool = True,
) -> bpy.types.Object:
    """Applies a clean EXACT boolean modifier and removes the temporary cutter."""
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new("Bool", "BOOLEAN")
    mod.operation = operation
    mod.object = cutter
    mod.solver = "EXACT"
    mod.use_self = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_cutter:
        mesh_data = cutter.data
        bpy.data.objects.remove(cutter, do_unlink=True)
        if mesh_data.users == 0:
            bpy.data.meshes.remove(mesh_data)
    cleanup_mesh(target, merge_dist=0.00025)
    return target


def join_objects(target: bpy.types.Object, others: Sequence[bpy.types.Object]) -> bpy.types.Object:
    if not others:
        return target
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for o in others:
        o.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    return target


def _count_non_manifold(mesh: bpy.types.Mesh) -> tuple[int, int]:
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bnd = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.free()
    return bnd, nm


def finalize_hard_surface(
    obj: bpy.types.Object,
    bevel_width: float = 0.032,
    bevel_segments: int = 3,
    bevel_angle_deg: float = 34.0,
    use_bevel: bool = True,
    triangulate: bool = False,
) -> bpy.types.Object:
    """
    Applies real multi-segment bevel (strictly manifold-guarded!) + Weighted Normal (keep_sharp=True)
    for liquid studio shading and guaranteed zero stencil-cutaway leaks.
    """
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    cleanup_mesh(obj, merge_dist=0.0003)
    set_smooth_shading(obj)

    if use_bevel and bevel_width > 0.0:
        bnd_pre, nm_pre = _count_non_manifold(obj.data)
        backup = obj.data.copy()
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = bevel_segments
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(bevel_angle_deg)
        bev.use_clamp_overlap = True
        bev.miter_outer = "MITER_ARC"
        bev.harden_normals = False
        bpy.ops.object.modifier_apply(modifier=bev.name)
        bnd_post, nm_post = _count_non_manifold(obj.data)
        if bnd_post > bnd_pre or nm_post > nm_pre:
            # Roll back destructive post-boolean bevel on tight slivers; pre-boolean 3D bevels +
            # WeightedNormal + Cycles ShaderNodeBevel preserve crisp rounded edges with 100% manifoldness!
            old = obj.data
            obj.data = backup
            bpy.data.meshes.remove(old)
        else:
            bpy.data.meshes.remove(backup)

    # Mark crisp mechanical creases (> 42 deg) & strictly enforce outward positive volume BEFORE WeightedNormal!
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < math.radians(42.0)
    bm.to_mesh(obj.data)
    bm.free()

    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    wn.weight = 100
    wn.thresh = 0.01
    bpy.ops.object.modifier_apply(modifier=wn.name)

    # Always triangulate AFTER WeightedNormal with keep_custom_normals=True so large flat machined
    # N-gon walls lock in 100% exact planar area-weighted loop normals (zero glTF-export ngon streaks!)
    tri = obj.modifiers.new("Triangulate", "TRIANGULATE")
    tri.quad_method = "BEAUTY"
    tri.ngon_method = "BEAUTY"
    tri.keep_custom_normals = True
    bpy.ops.object.modifier_apply(modifier=tri.name)

    obj.data.update()
    return obj


def verify_manifold_and_bbox(obj: bpy.types.Object) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    non_manif = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    vol = bm.calc_volume(signed=True)
    if vol < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        obj.data.free_normals_split() if hasattr(obj.data, "free_normals_split") else None
        vol = -vol
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    xs, ys, zs = [], [], []
    for v in bm.verts:
        tx, ty, tz = b2t(v.co.x, v.co.y, v.co.z)
        xs.append(tx)
        ys.append(ty)
        zs.append(tz)
    bm.free()

    # Verify outward custom loop normals match geometric face normals (catches any inverted split normals!)
    mesh = obj.data
    corner_normals = mesh.corner_normals
    dot_sum = 0.0
    n_loops = 0
    for poly in mesh.polygons:
        fn = poly.normal
        for li in poly.loop_indices:
            dot_sum += corner_normals[li].vector.dot(fn)
            n_loops += 1
    mean_dot = (dot_sum / n_loops) if n_loops > 0 else 1.0
    if mean_dot < 0.70:
        raise RuntimeError(f"{obj.name} has inverted custom split normals! mean_dot={mean_dot:.3f}")

    return {
        "tris": tris,
        "boundary": boundary,
        "non_manifold": non_manif,
        "volume": round(vol, 4),
        "norm_dot": round(mean_dot, 3),
        "min": [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)],
        "max": [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
    }


def assign_material_slot(obj: bpy.types.Object, mat: bpy.types.Material, face_pred: Callable | None = None) -> None:
    if mat.name not in [m.name for m in obj.data.materials if m]:
        obj.data.materials.append(mat)
    idx = [m.name for m in obj.data.materials].index(mat.name)
    if face_pred is None:
        for p in obj.data.polygons:
            p.material_index = idx
    else:
        for p in obj.data.polygons:
            if face_pred(p, obj.data):
                p.material_index = idx


# ============================================================================
# 5. ALL 22 AAA HARD-SURFACE P08 PART BUILDERS
# ============================================================================


def build_p08_barrel() -> bpy.types.Object:
    """U-01: 4" (102mm) Tapered Rifled 9x19mm Barrel w/ Dovetailed Barleycorn Front Sight & 11-deg Target Crown."""
    # High-res turned barrel blank with authentic DWM Luger concave shoulder & pencil taper
    profile = [
        (0.0, 1.72),
        (0.73, 1.72),
        (0.78, 1.76),
        (0.78, 3.36),
        (0.865, 3.43),  # Witness shoulder
        (0.875, 3.48),
        (0.875, 3.76),
        (0.845, 3.83),
        (0.785, 3.92),  # Graceful concave transition
        (0.742, 4.06),
        (0.720, 4.30),
        (0.680, 5.80),
        (0.635, 8.50),
        (0.592, 11.24),  # Slender 4" Luger conical taper
        (0.625, 11.30),  # Integral Kornsattel front sight collar
        (0.668, 11.37),
        (0.672, 11.44),
        (0.672, 12.08),
        (0.660, 12.14),
        (0.610, 12.20),  # Muzzle face (exact X_max = 12.20!)
        (0.490, 12.20),
        (0.440, 12.10),  # 11-degree recessed target crown!
        (0.440, 3.95),   # Rifled bore interior (r = 0.44)
        (0.472, 3.85),   # Throat leade
        (0.472, 2.75),   # 9x19mm tapered chamber
        (0.498, 1.80),
        (0.525, 1.72),
        (0.0, 1.72),
    ]
    # Note: the hollow bore loops back to (0, 1.72) only if open; better to make solid revolve
    # and boolean-subtract a true 6-groove helical rifled bore cutter + chamber + feed ramp!
    solid_profile = [
        (0.0, 1.72),
        (0.73, 1.72),
        (0.78, 1.77),
        (0.78, 3.36),
        (0.865, 3.43),
        (0.875, 3.49),
        (0.875, 3.76),
        (0.845, 3.83),
        (0.780, 3.94),
        (0.738, 4.12),
        (0.700, 5.20),
        (0.652, 7.60),
        (0.594, 11.24),
        (0.630, 11.31),
        (0.670, 11.38),
        (0.672, 12.08),
        (0.658, 12.14),
        (0.608, 12.20),
        (0.0, 12.20),
    ]
    barrel = make_revolve_three(
        "p08_barrel", solid_profile, axis="X", segments=64, center=(0.0, P08_BORE_Y, 0.0)
    )

    # Sculpted dovetailed front sight base (Kornsockel)
    base_pts = rounded_polygon_2d(
        [
            (11.34, P08_BORE_Y + 0.56, 0.03),
            (12.10, P08_BORE_Y + 0.56, 0.03),
            (12.05, P08_BORE_Y + 0.89, 0.04),
            (11.40, P08_BORE_Y + 0.89, 0.04),
        ],
        arc_steps=4,
    )
    sight_base = make_extrude_z_three("sight_base", base_pts, -0.25, 0.25, bevel=0.035, bevel_segs=3)

    # Iconic undercut triangular German barleycorn sight blade (Dachkorn, apex Y=3.30)
    blade_pts = [
        (11.38, P08_BORE_Y + 0.84),
        (12.04, P08_BORE_Y + 0.84),
        (11.90, P08_BORE_Y + 1.15),  # Y = 3.30 cm
        (11.83, P08_BORE_Y + 1.15),
        (11.44, P08_BORE_Y + 0.96),
    ]
    sight_blade = make_extrude_z_three("sight_blade", blade_pts, -0.10, 0.10, bevel=0.025, bevel_segs=2)

    barrel = bool_op(barrel, sight_base, "UNION")
    barrel = bool_op(barrel, sight_blade, "UNION")

    # Build true 6-groove helical rifled bore cutter (9x19mm 1:250mm RH twist!)
    # Starts at x=3.65 strictly inside the wider chamber radius (0.48 > 0.464) for clean 0-sliver boolean!
    bm_bore = bmesh.new()
    n_len = 28
    n_ang = 48
    x_start, x_end = 3.65, 12.26
    rings = []
    for ix in range(n_len + 1):
        u = ix / n_len
        x = x_start + (x_end - x_start) * u
        twist = u * (8.4 / 25.0) * 2.0 * math.pi
        ring = []
        for ia in range(n_ang):
            a = (ia / n_ang) * 2.0 * math.pi
            # 6 sharp lands & grooves
            groove = 1.0 if math.sin(6.0 * (a - twist)) > 0.12 else 0.0
            r = 0.442 + 0.022 * groove
            # 11-degree target crown flare at muzzle (x > 12.08)
            if x > 12.08:
                r = max(r, 0.442 + (x - 12.08) * 0.72)
            ring.append(bm_bore.verts.new(t2b(x, P08_BORE_Y + r * math.cos(a), r * math.sin(a))))
        rings.append(ring)
    for ix in range(n_len):
        for ia in range(n_ang):
            ian = (ia + 1) % n_ang
            bm_bore.faces.new((rings[ix][ia], rings[ix][ian], rings[ix + 1][ian], rings[ix + 1][ia]))
    v_c0 = bm_bore.verts.new(t2b(x_start, P08_BORE_Y, 0.0))
    v_c1 = bm_bore.verts.new(t2b(x_end, P08_BORE_Y, 0.0))
    for ia in range(n_ang):
        ian = (ia + 1) % n_ang
        bm_bore.faces.new((v_c0, rings[0][ian], rings[0][ia]))
        bm_bore.faces.new((v_c1, rings[-1][ia], rings[-1][ian]))
    bore_cutter = new_mesh_obj("bore_cutter", bm_bore)

    # Tapered 9x19mm chamber cutter (X in [1.65, 3.96])
    chamber_cutter = make_revolve_three(
        "chamber_cutter",
        [(0.0, 1.65), (0.505, 1.65), (0.495, 2.50), (0.474, 3.85), (0.448, 4.02), (0.0, 4.02)],
        axis="X",
        segments=40,
        center=(0.0, P08_BORE_Y, 0.0),
    )
    # Lower polished cartridge feed throat (Zufuehrrampe) & 12 o'clock extractor claw cut
    feed_ramp = make_box_three("feed_ramp", 0.60, 0.44, 0.54, center=(1.90, P08_BORE_Y - 0.42, 0.0), rot_three=(0.0, 0.0, 0.46))
    ext_cut = make_box_three("ext_cut", 0.46, 0.30, 0.26, center=(1.90, P08_BORE_Y + 0.52, 0.0))

    barrel = bool_op(barrel, bore_cutter, "DIFFERENCE")
    barrel = bool_op(barrel, chamber_cutter, "DIFFERENCE")
    barrel = bool_op(barrel, feed_ramp, "DIFFERENCE")
    barrel = bool_op(barrel, ext_cut, "DIFFERENCE")

    return finalize_hard_surface(barrel, bevel_width=0.022, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_barrel_extension() -> bpy.types.Object:
    """U-02: Forked U-Channel Barrel Extension (Gabelgehaeuse) w/ Sculpted Chamber Ring & Rear Axle Ears."""
    # Main forked receiver outer upper skirt (strictly Y >= 1.375 above frame top rail Y=1.36 ->
    # crisp 0.15 mm machined parting line, ZERO coplanar Z-fighting with p08_frame!)
    pts: list[tuple[float, float]] = [
        (3.48, 1.375),
        (3.48, 2.98),
        (3.38, 3.08),  # Chamfered front chamber ring crown
        (1.62, 3.08),
        (1.48, 2.96),
        (1.24, 2.82),  # Step down into forked U-channel rails
        (-8.86, 2.82),
    ]
    pts.extend(sample_quad_bezier((-8.86, 2.82), (-9.94, 2.82), (-9.94, 2.15), steps=20))
    pts.extend(sample_quad_bezier((-9.94, 2.15), (-9.94, 1.38), (-9.15, 1.38), steps=20))
    pts.append((3.48, 1.375))
    ext = make_extrude_z_three("p08_barrel_extension", pts, -1.02, 1.02, bevel=0.055, bevel_segs=3)

    # Sculpt authentic arched/chamfered side bevels along the chamber ring upper corners (Luger signature!)
    for sz in (-1.0, 1.0):
        ch_chamfer = make_box_three(
            "ch_chamfer",
            2.20,
            0.55,
            0.55,
            center=(2.48, 3.12, sz * 1.04),
            rot_three=(sz * math.radians(38.0), 0.0, 0.0),
        )
        ext = bool_op(ext, ch_chamfer, "DIFFERENCE")

    # Narrower internal lower guide-rail tongue (Z in [-0.60, +0.60]) riding cleanly INSIDE p08_frame's
    # [-0.64, +0.64] upper raceway (real Luger rail clearance, ZERO outer coplanar overlap!)
    guide_tongue = make_box_three(
        "guide_tongue", 4.10, 0.44, 1.20, center=(0.55, 1.24, 0.0), bevel=0.03, bevel_segs=2
    )
    # Left-flank external sculpted sear-bar housing rail
    sear_housing = make_box_three(
        "sear_housing", 4.55, 0.56, 0.30, center=(-1.85, 2.08, -1.03), bevel=0.045, bevel_segs=3
    )
    # Lower recoil lug / takedown-cam foot beneath chamber ring
    recoil_foot = make_box_three(
        "recoil_foot", 1.55, 0.44, 0.72, center=(2.15, 1.04, 0.0), bevel=0.04, bevel_segs=3
    )
    ext = bool_op(ext, guide_tongue, "UNION")
    ext = bool_op(ext, sear_housing, "UNION")
    ext = bool_op(ext, recoil_foot, "UNION")

    # Subtract internal U-channel fork, magazine feed clearance, barrel thread bore, axle holes, sear & ejector slots
    u_channel = make_box_three("u_chan", 11.86, 1.98, 1.26, center=(-4.24, 2.43, 0.0))
    mag_clear = make_box_three("mag_clear", 3.85, 0.88, 1.12, center=(-0.75, 1.22, 0.0))
    bbl_bore = make_cylinder_three("bbl_bore", 0.79, 0.79, 2.30, axis="X", center=(2.56, P08_BORE_Y, 0.0), segments=44)
    rear_axle_bore = make_cylinder_three(
        "axle_bore", 0.242, 0.242, 2.40, axis="Z", center=(P08_REAR_AXLE_X0, P08_BORE_Y, 0.0), segments=48
    )
    sear_groove = make_box_three("sear_grv", 4.48, 0.34, 0.28, center=(-1.85, 2.08, -1.08))
    ejector_slot = make_box_three("ej_slot", 3.15, 0.32, 0.26, center=(-1.15, 2.02, 0.74))

    for c in (u_channel, mag_clear, bbl_bore, rear_axle_bore, sear_groove, ejector_slot):
        ext = bool_op(ext, c, "DIFFERENCE")

    return finalize_hard_surface(ext, bevel_width=0.032, bevel_segments=3, bevel_angle_deg=34.0)


def build_p08_breechblock() -> bpy.types.Object:
    """U-03: Bright Brushed White-Steel Rectangular Sliding Breechblock (Verschlussstueck)."""
    body = make_box_three(
        "p08_breechblock", 2.68, 1.22, 1.16, center=(0.66, P08_BORE_Y, 0.0), bevel=0.055, bevel_segs=3
    )
    strip_rib = make_box_three(
        "strip_rib", 2.15, 0.28, 0.42, center=(0.88, P08_BORE_Y - 0.65, 0.0), bevel=0.035, bevel_segs=3
    )
    body = bool_op(body, strip_rib, "UNION")

    # Subtract rear clevis, top extractor channel, striker bore, firing pin hole, recessed bolt face, grooves
    cutters = [
        make_box_three("clevis", 1.06, 0.94, 0.56, center=(-0.22, P08_BORE_Y, 0.0)),
        make_box_three("ext_ch", 2.28, 0.36, 0.36, center=(0.92, P08_BORE_Y + 0.52, 0.0)),
        make_cylinder_three("str_bore", 0.25, 0.25, 2.52, axis="X", center=(0.58, P08_BORE_Y, 0.0), segments=32),
        make_cylinder_three("fp_hole", 0.09, 0.09, 0.50, axis="X", center=(1.88, P08_BORE_Y, 0.0), segments=20),
        make_cylinder_three("bolt_face", 0.51, 0.51, 0.14, axis="X", center=(1.98, P08_BORE_Y, 0.0), segments=36),
        make_box_three("ej_grv", 2.78, 0.24, 0.22, center=(0.66, P08_BORE_Y - 0.12, 0.52)),
        make_box_three("sear_win", 1.35, 0.26, 0.28, center=(0.22, P08_BORE_Y - 0.06, -0.48)),
    ]
    for c in cutters:
        body = bool_op(body, c, "DIFFERENCE")

    # Front cross-pin boss spanning the rear clevis at (P08_FRONT_PIN_X0, P08_BORE_Y)
    pin_boss = make_cylinder_three(
        "front_pin_boss", 0.158, 0.158, 1.14, axis="Z", center=(P08_FRONT_PIN_X0, P08_BORE_Y, 0.0), segments=28, bevel_caps=0.02
    )
    body = bool_op(body, pin_boss, "UNION")
    return finalize_hard_surface(body, bevel_width=0.025, bevel_segments=2, bevel_angle_deg=35.0)


def build_p08_extractor() -> bpy.types.Object:
    """U-04: Top-Pivoting Extractor & 'GELADEN' Loaded-Chamber Indicator (Auszieher)."""
    pts = [
        (-1.02, -0.10),
        (1.05, -0.10),
        (1.08, -0.24),  # Front rim hook claw
        (0.92, -0.24),
        (0.84, -0.06),
        (1.04, 0.08),
        (0.38, 0.18),   # Raised tactile GELADEN step
        (-0.35, 0.18),
        (-0.52, 0.06),
        (-1.02, 0.04),
    ]
    bar = make_extrude_z_three("p08_extractor", pts, -0.15, 0.15, bevel=0.012, bevel_segs=2)
    pin = make_cylinder_three("ext_pin", 0.065, 0.065, 0.40, axis="Z", center=(-0.12, -0.04, 0.0), segments=20, bevel_caps=0.012)
    bar = bool_op(bar, pin, "UNION")
    return finalize_hard_surface(bar, bevel_width=0.0, use_bevel=False)


def build_p08_front_toggle() -> bpy.types.Object:
    """U-05: Articulated Front Toggle Link (Vordergelenk) w/ flat 'DWM' deck & striker-cocking toe."""
    kx = -P08_KNEE_LOCAL_DX  # -4.6184
    ky = P08_KNEE_LOCAL_DY   # -0.1209

    pts: list[tuple[float, float]] = [
        (0.42, -0.32),
        (0.44, 0.28),
    ]
    pts.extend(sample_quad_bezier((0.44, 0.28), (0.22, 0.56), (-0.28, 0.58), steps=8))
    pts.append((kx + 0.48, 0.58))  # Flat top deck for DWM scroll monogram
    pts.extend(sample_quad_bezier((kx + 0.48, 0.58), (kx - 0.52, 0.54), (kx - 0.52, ky), steps=10))
    pts.extend(sample_quad_bezier((kx - 0.52, ky), (kx - 0.52, ky - 0.48), (kx + 0.35, ky - 0.46), steps=10))
    pts.extend([
        (-0.55, -0.36),
        (-0.18, -0.52),  # Striker-cocking cam toe (Spannnase)
    ])
    link = make_extrude_z_three("p08_front_toggle", pts, -0.54, 0.54, bevel=0.048, bevel_segs=3)

    # Subtle authentic recessed side lightening flutes along mid-section (cleanly inset from rim bevel!)
    for sz in (-1.0, 1.0):
        flute = make_box_three(
            "flute", 2.55, 0.34, 0.16, center=(-2.35, 0.04, sz * 0.56), bevel=0.025, bevel_segs=2
        )
        link = bool_op(link, flute, "DIFFERENCE")

    # Trim front tongue (Z in [-0.26, +0.26]), rear knee clevis slot (Z in [-0.24, +0.24]), & exact hinge bores
    cutters = [
        make_box_three("ft_r", 1.15, 1.32, 0.34, center=(0.05, 0.0, 0.44)),
        make_box_three("ft_l", 1.15, 1.32, 0.34, center=(0.05, 0.0, -0.44)),
        make_box_three("knee_slot", 1.25, 1.32, 0.50, center=(kx - 0.05, ky, 0.0)),
        make_cylinder_three("pin_f", 0.165, 0.165, 1.40, axis="Z", center=(0.0, 0.0, 0.0), segments=28),
        make_cylinder_three("pin_k", 0.210, 0.210, 1.40, axis="Z", center=(kx, ky, 0.0), segments=32),
    ]
    for c in cutters:
        link = bool_op(link, c, "DIFFERENCE")

    return finalize_hard_surface(link, bevel_width=0.028, bevel_segments=3, bevel_angle_deg=34.0)


def build_p08_rear_toggle() -> bpy.types.Object:
    """
    U-06: Articulated Rear Toggle Link (Hintergelenk) — iconic Luger signature!
    Features twin circular diamond-knurled toggle knobs (Spannstuecke) with deep spherical
    concave finger cups, real 3D peripheral knurl teeth, integral V-notch rear sight & S-link lug.
    """
    kx = P08_KNEE_LOCAL_DX  # +4.6184
    ky = P08_KNEE_LOCAL_DY  # -0.1209

    pts: list[tuple[float, float]] = [(-0.50, -0.44)]
    pts.extend(sample_quad_bezier((-0.50, -0.44), (-0.54, 0.52), (-0.05, 0.72), steps=10))
    pts.extend([
        (0.22, 1.06),  # Integral V-notch rear sight bridge (Kimme)
        (0.58, 1.06),
        (0.88, 0.62),
        (kx - 0.45, 0.56),
    ])
    pts.extend(sample_quad_bezier((kx - 0.45, 0.56), (kx + 0.48, 0.52), (kx + 0.48, ky), steps=10))
    pts.extend(sample_quad_bezier((kx + 0.48, ky), (kx + 0.48, ky - 0.46), (kx - 0.35, ky - 0.44), steps=10))
    pts.extend([
        (0.35, -0.42),
        (-0.12, -0.58),  # Lower S-link hook lug
    ])
    bridge = make_extrude_z_three("p08_rear_toggle", pts, -0.56, 0.56, bevel=0.048, bevel_segs=3)

    # Iconic twin circular toggle gripping drums (Spannstuecke) at (3.30, 0.26, +-Z)
    # Zero-spoke smooth cosine concave finger dish ending in 3 flat coplanar quad rings at center!
    def build_toggle_drum(sign_z: float) -> bpy.types.Object:
        z_in = 0.50
        z_outer = 1.48
        prof = [
            (0.0, z_in),
            (0.62, z_in),
            (0.76, 0.60),
            (0.845, 0.68),
            (0.845, 1.36),
            (0.818, 1.425),
            (0.770, 1.465),
            (0.720, z_outer),
            (0.640, z_outer),
        ]
        # Smooth cosine bowl (dz/dr = 0 at both rim & center -> ZERO radial triangle-fan shading spokes!)
        z_floor = z_outer - 0.175
        for k in range(1, 11):
            u = k / 10.0  # 0 at rim (r=0.64) -> 1 at flat center floor (r=0.09)
            r = 0.640 - u * (0.640 - 0.090)
            # Cosine S-curve: slope is strictly 0 at both rim (u=0) and floor (u=1)
            depth_t = 0.5 * (1.0 - math.cos(u * math.pi))
            prof.append((r, z_outer - 0.175 * depth_t))
        # Flat coplanar inner quad rings before closing pole -> 100% spoke-free center!
        prof.append((0.045, z_floor))
        prof.append((0.0, z_floor))
        if sign_z < 0:
            prof = [(r, -z) for (r, z) in reversed(prof)]
        return make_revolve_three(
            f"drum_{'R' if sign_z > 0 else 'L'}",
            prof,
            axis="Z",
            segments=64,
            center=(3.30, 0.26, 0.0),
        )

    left_drum = build_toggle_drum(-1.0)
    right_drum = build_toggle_drum(+1.0)
    bridge = bool_op(bridge, left_drum, "UNION")
    bridge = bool_op(bridge, right_drum, "UNION")

    # Trim front knee tongue, V-notch rear sight cut, rear axle & front knee bores
    cutters = [
        make_box_three("kt_r", 1.30, 1.32, 0.42, center=(kx + 0.02, ky, 0.45)),
        make_box_three("kt_l", 1.30, 1.32, 0.42, center=(kx + 0.02, ky, -0.45)),
        make_box_three("v_notch", 0.68, 0.28, 0.28, center=(0.40, 1.12, 0.0), rot_three=(math.pi * 0.25, 0.0, 0.0)),
        make_cylinder_three("rear_bore", 0.242, 0.242, 1.50, axis="Z", center=(0.0, 0.0, 0.0), segments=32),
        make_cylinder_three("knee_bore", 0.210, 0.210, 1.50, axis="Z", center=(kx, ky, 0.0), segments=32),
    ]
    for c in cutters:
        bridge = bool_op(bridge, c, "DIFFERENCE")

    # Finalize bridge bevels before adding crisp 3D diamond knurling pyramids on both drums
    bridge = finalize_hard_surface(bridge, bevel_width=0.028, bevel_segments=3, bevel_angle_deg=34.0)

    # Real 3D beveled diamond knurling pyramids around cylindrical drum rims (28 cols x 5 rows x 2 drums)
    bm_k = bmesh.new()
    n_cols = 28
    n_rows = 5
    z_band_min, z_band_max = 0.72, 1.32
    dz = (z_band_max - z_band_min) / n_rows
    r_base = 0.828
    r_peak = 0.878
    da = (2.0 * math.pi) / n_cols
    for sign_z in (-1.0, 1.0):
        for row in range(n_rows):
            zc = sign_z * (z_band_min + (row + 0.5) * dz)
            a_shift = (0.5 * da) if (row % 2 == 1) else 0.0
            for col in range(n_cols):
                ac = col * da + a_shift
                # 4-sided diamond pyramid with tiny flat crest (real machined knurl tooth!)
                a0 = ac - da * 0.46
                a1 = ac + da * 0.46
                za = zc - dz * 0.46
                zb = zc + dz * 0.46

                def pt(rr: float, aa: float, zz: float) -> Vector:
                    return t2b(3.30 + rr * math.cos(aa), 0.26 + rr * math.sin(aa), zz)

                v_n = bm_k.verts.new(pt(r_base, ac, zb))
                v_s = bm_k.verts.new(pt(r_base, ac, za))
                v_e = bm_k.verts.new(pt(r_base, a1, zc))
                v_w = bm_k.verts.new(pt(r_base, a0, zc))
                # Tiny plateau diamond at peak so light catches crisp specular glints!
                da_t = da * 0.11
                dz_t = dz * 0.11
                t_n = bm_k.verts.new(pt(r_peak, ac, zc + dz_t))
                t_s = bm_k.verts.new(pt(r_peak, ac, zc - dz_t))
                t_e = bm_k.verts.new(pt(r_peak, ac + da_t, zc))
                t_w = bm_k.verts.new(pt(r_peak, ac - da_t, zc))

                bm_k.faces.new((t_n, t_e, t_s, t_w))
                bm_k.faces.new((v_n, v_e, t_e, t_n))
                bm_k.faces.new((v_e, v_s, t_s, t_e))
                bm_k.faces.new((v_s, v_w, t_w, t_s))
                bm_k.faces.new((v_w, v_n, t_n, t_w))
                bm_k.faces.new((v_w, v_s, v_e, v_n))  # Closed base -> watertight!

    knurl_obj = new_mesh_obj("knurl_teeth", bm_k)
    # Tag knurl teeth in a vertex group so UV unwrapper packs them compactly (zero confetti!)
    vg_knurl = knurl_obj.vertex_groups.new(name="knurl_teeth")
    vg_knurl.add(list(range(len(knurl_obj.data.vertices))), 1.0, "REPLACE")
    join_objects(bridge, [knurl_obj])
    return bridge


def build_p08_toggle_pins() -> bpy.types.Object:
    """U-07: Ultra-Smooth 64-Seg CNC-Turned Bright Steel Rear Cross-Axle Pin & Center Knee-Joint Pin."""
    kx = P08_KNEE_LOCAL_DX
    ky = P08_KNEE_LOCAL_DY

    # Rear axle pin: 64 radial segments + smooth 4-step rounded flanged cap rim (100% circular at macro zoom!)
    rear_pin = make_revolve_three(
        "p08_toggle_pins",
        [
            (0.0, -1.06),
            (0.165, -1.06),
            (0.205, -1.045),
            (0.235, -1.005),
            (0.235, 0.94),
            (0.305, 0.955),
            (0.320, 0.975),
            (0.320, 1.040),
            (0.308, 1.062),
            (0.285, 1.076),
            (0.250, 1.080),
            (0.120, 1.080),
            (0.0, 1.080),
        ],
        axis="Z",
        segments=64,
    )
    # Hollow oil-relief center knee-joint hinge pin at (kx, ky, 0)
    knee_pin = make_revolve_three(
        "knee_pin",
        [
            (0.08, -0.59),
            (0.165, -0.59),
            (0.195, -0.57),
            (0.205, -0.54),
            (0.205, 0.51),
            (0.268, 0.525),
            (0.280, 0.545),
            (0.280, 0.595),
            (0.265, 0.614),
            (0.240, 0.620),
            (0.08, 0.620),
            (0.08, -0.59),
        ],
        axis="Z",
        segments=64,
        center=(kx, ky, 0.0),
    )
    join_objects(rear_pin, [knee_pin])
    return finalize_hard_surface(rear_pin, bevel_width=0.0, use_bevel=False)


def build_p08_striker() -> bpy.types.Object:
    """U-08: 3-Flute Gas-Vented Hollow Cylindrical Striker (Schlagbolzen)."""
    tube = make_revolve_three(
        "p08_striker",
        [
            (0.145, -0.92),
            (0.225, -0.92),
            (0.225, 0.68),
            (0.160, 0.82),
            (0.072, 1.38),
            (0.052, 1.59),
            (0.025, 1.62),
            (0.0, 1.62),
            (0.0, 0.55),
            (0.145, 0.48),
            (0.145, -0.92),
        ],
        axis="X",
        segments=36,
    )
    # 3 longitudinal gas-vent flutes with rounded ends
    for k in range(3):
        a = (k * 2.0 * math.pi) / 3.0 + 0.35
        flute = make_cylinder_three(
            f"flute_{k}",
            0.052,
            0.052,
            1.30,
            axis="X",
            center=(-0.08, math.cos(a) * 0.22, math.sin(a) * 0.22),
            segments=16,
            bevel_caps=0.04,
        )
        tube = bool_op(tube, flute, "DIFFERENCE")

    sear_lug = make_box_three("sear_lug", 0.36, 0.22, 0.24, center=(-0.22, -0.05, -0.28), bevel=0.028, bevel_segs=2)
    tube = bool_op(tube, sear_lug, "UNION")
    return finalize_hard_surface(tube, bevel_width=0.012, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_frame() -> bpy.types.Object:
    """
    F-01: Masterpiece Forged Curved-Ramp Frame (Griffstueck) — centerpiece silhouette!
    Sculpted gooseneck front dust-cover, authentic narrowed rounded D-section semicircular trigger guard bow,
    solid forged magazine housing & smooth knuckle arch behind trigger guard (ZERO exposed magazine!),
    smoothly rounded steel frontstrap & backstrap at 55-deg grip angle, graceful curved rear unlocking
    ramps (Kurvenstuecke), rear stock lug T-dovetail & lanyard loop, checkered mag release button,
    snug recessed sideplate & GESICHERT safety pockets, hollow 55-deg magazine well & recoil spring tunnel!
    """
    # 1. Forged upper frame body + curved rear toggle cam ramps + solid magazine-throat housing!
    # Note: extends solidly behind trigger guard down into the 55-deg frontstrap with smooth knuckle curve.
    upper_pts: list[tuple[float, float]] = [
        (3.10, 1.36),
        (-8.25, 1.36),
    ]
    # Iconic graceful curved rear unlocking ramps (Kurvenstuecke)
    upper_pts.extend(sample_quad_bezier((-8.25, 1.36), (-9.05, 1.48), (-9.62, 2.56), steps=16))
    upper_pts.append((-10.00, 2.48))  # Exact OAL datum X_min = -10.00 cm
    upper_pts.extend(sample_quad_bezier((-10.00, 2.48), (-9.98, 1.25), (-8.85, 0.55), steps=14))
    upper_pts.extend(sample_quad_bezier((-8.85, 0.55), (-6.80, -0.05), (-5.20, -0.45), steps=10))
    # Smooth curved Luger knuckle arch sweeping solidly across magazine throat to trigger guard root!
    upper_pts.extend(sample_quad_bezier((-5.20, -0.45), (-1.95, -1.55), (-0.52, -0.48), steps=10))
    upper_pts.extend(sample_quad_bezier((-0.52, -0.48), (-0.30, 0.22), (0.38, 0.28), steps=8))
    upper_pts.extend([
        (2.35, 0.28),
        (3.10, 0.44),
    ])
    frame = make_extrude_z_three("p08_frame", upper_pts, -1.02, 1.02, bevel=0.055, bevel_segs=3)

    # Smoothly rounded gooseneck front dust-cover taper under front rail (authentic Luger chin!)
    for sz in (-1.0, 1.0):
        chin_cut = make_box_three(
            "chin_cut", 1.80, 0.60, 0.36, center=(2.55, 0.20, sz * 1.00), rot_three=(sz * 0.48, 0.0, 0.0)
        )
        frame = bool_op(frame, chin_cut, "DIFFERENCE")

    # 2. Iconic 55-degree steel grip frame with smoothly rounded exposed steel frontstrap & backstrap!
    # Merges smoothly inside upper_pts (up to s_up=5.85) for zero diagonal seam crease!
    c35 = math.cos(math.radians(35.0))
    s35 = math.sin(math.radians(35.0))
    g0x, g0y = -5.65, -4.45

    def grip_xy(sf: float, su: float) -> tuple[float, float]:
        return (g0x + sf * c35 + su * s35, g0y - sf * s35 + su * c35)

    grip_pts: list[tuple[float, float]] = [
        grip_xy(-2.12, 4.10),   # Backstrap merges cleanly into upper frame tang
        grip_xy(-2.12, -4.40),  # 55-deg backstrap
        (-9.92, -7.85),         # Stock-lug heel transition
        (-7.22, -9.55),         # Exact bottom mag well rim (Y_min = -9.55!)
        grip_xy(2.02, -4.92),   # Lower frontstrap corner
        grip_xy(2.02, 5.20),    # 55-deg frontstrap sealing magazine throat cleanly behind trigger guard!
        grip_xy(0.10, 5.85),    # Solid merge inside upper frame housing
    ]
    grip_forging = make_extrude_z_three("grip_forging", grip_pts, -1.00, 1.00, bevel=0.12, bevel_segs=4)
    frame = bool_op(frame, grip_forging, "UNION")

    # 3. Authentic NARROWED smoothly-rounded semicircular trigger guard bow (width 1.04 cm, NOT blocky 2.04 cm!)
    # Joins seamlessly into the solid steel frontstrap knuckle behind trigger & dust cover in front!
    tg_centerline: list[tuple[float, float]] = []
    tg_centerline.extend(sample_cubic_bezier((-0.90, -0.58), (-1.22, -2.02), (0.36, -2.02), (0.36, -2.02), steps=14, include_start=True))
    tg_centerline.extend(sample_cubic_bezier((0.36, -2.02), (2.06, -2.02), (2.08, -0.60), (2.05, 0.36), steps=14, include_start=False))

    bm_tg = bmesh.new()
    sec_n = 16
    rx_t, rz_t = 0.195, 0.52  # 3.9 mm radial thickness, 10.4 mm authentic Luger guard width!
    tg_rings = []
    for i, (cx, cy) in enumerate(tg_centerline):
        if i == 0:
            tx, ty = tg_centerline[1][0] - cx, tg_centerline[1][1] - cy
        elif i == len(tg_centerline) - 1:
            tx, ty = cx - tg_centerline[-2][0], cy - tg_centerline[-2][1]
        else:
            tx, ty = tg_centerline[i + 1][0] - tg_centerline[i - 1][0], tg_centerline[i + 1][1] - tg_centerline[i - 1][1]
        tl = math.hypot(tx, ty)
        nx, ny = -ty / tl, tx / tl
        ring = []
        for s in range(sec_n):
            a = (s / sec_n) * 2.0 * math.pi
            ca, sa = math.cos(a), math.sin(a)
            px = math.copysign(abs(ca) ** 0.78, ca) * rx_t
            pz = math.copysign(abs(sa) ** 0.78, sa) * rz_t
            ring.append(bm_tg.verts.new(t2b(cx + nx * px, cy + ny * px, pz)))
        tg_rings.append(ring)
    for i in range(len(tg_rings) - 1):
        for s in range(sec_n):
            sn = (s + 1) % sec_n
            bm_tg.faces.new((tg_rings[i][s], tg_rings[i][sn], tg_rings[i + 1][sn], tg_rings[i + 1][s]))
    bm_tg.faces.new(list(reversed(tg_rings[0])))
    bm_tg.faces.new(tg_rings[-1])
    tg_bow = new_mesh_obj("tg_bow", bm_tg)
    frame = bool_op(frame, tg_bow, "UNION")

    # 4. Sculpted rear stock lug (Anschlagkolben-Warze) w/ T-dovetail & lanyard loop (Fangriemenoese)
    stock_lug = make_box_three(
        "stock_lug", 0.65, 1.55, 0.92, center=(-9.25, -7.25, 0.0), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD), bevel=0.045, bevel_segs=3
    )
    frame = bool_op(frame, stock_lug, "UNION")

    lanyard_bar = make_box_three(
        "lanyard_bar", 0.22, 0.62, 0.56, center=(-9.32, -6.15, 0.0), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD), bevel=0.04, bevel_segs=2
    )
    lanyard_hole = make_cylinder_three("lanyard_hole", 0.14, 0.14, 0.70, axis="Z", center=(-9.26, -6.12, 0.0), segments=16)
    lanyard_bar = bool_op(lanyard_bar, lanyard_hole, "DIFFERENCE")
    frame = bool_op(frame, lanyard_bar, "UNION")

    # 5. Authentic checkered circular magazine catch button on LEFT flank (-Z = -1.16)
    mag_btn = make_revolve_three(
        "mag_catch_btn",
        [
            (0.0, -1.16),
            (0.28, -1.16),
            (0.34, -1.12),
            (0.34, -0.72),
            (0.0, -0.72),
        ],
        axis="Z",
        segments=28,
        center=(-2.05, -0.82, 0.0),
    )
    frame = bool_op(frame, mag_btn, "UNION")

    # 6. Precision internal cutouts: upper raceway, S-link slot, SNUG left sideplate mortise,
    #    trigger slot, GESICHERT safety recess, 55-deg magazine well, recoil spring tunnel, grip recesses!
    mag_well = make_box_three(
        "mag_well", 2.68, 12.6, 1.42, center=(-4.45, -3.30, 0.0), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD)
    )
    recoil_tunnel = make_cylinder_three(
        "recoil_tunnel", 0.45, 0.45, 8.20, axis="Y", center=(-7.15, -4.55, 0.0), segments=28, rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD)
    )
    # Shallow grip panel seating steps strictly bounded INSIDE frontstrap/backstrap & below upper frame shoulder!
    # Keeps solid steel mag-well side walls above the grips & exposed rounded steel front/back straps!
    step_cx, step_cy = grip_xy(0.0, -0.20)
    left_grip_step = make_box_three(
        "lg_step", 3.30, 8.65, 0.34, center=(step_cx, step_cy, -0.94), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD)
    )
    right_grip_step = make_box_three(
        "rg_step", 3.30, 8.65, 0.34, center=(step_cx, step_cy, 0.94), rot_three=(0.0, 0.0, P08_GRIP_ANGLE_RAD)
    )

    cutters = [
        # Upper raceway stops at X = +2.82 so front dust-cover nose (X in [2.82, 3.10]) is solid forged steel for "4821 a"!
        make_box_three("upper_race", 13.02, 2.20, 1.28, center=(-3.69, 1.75, 0.0)),
        make_box_three("s_slot", 2.20, 3.80, 0.68, center=(-7.85, 0.15, 0.0)),
        # Snug sideplate mortise: X in [-0.08, +2.78] (solid steel front wall X in [2.78, 3.10]!)
        make_box_three("sideplate_mort", 2.86, 1.28, 0.46, center=(1.35, 0.96, -0.88)),
        make_box_three("trig_slot", 1.28, 1.05, 0.64, center=(0.55, 0.12, 0.0)),
        make_box_three("safety_recess", 2.15, 1.25, 0.24, center=(-7.15, 0.72, -0.98)),
        # Takedown cam bore strictly inside frame from left face (does not pierce front dust cover!)
        make_cylinder_three("td_bore", 0.175, 0.175, 1.30, axis="Z", center=(2.55, 0.48, -0.50), segments=24),
        mag_well,
        recoil_tunnel,
        left_grip_step,
        right_grip_step,
    ]
    for c in cutters:
        frame = bool_op(frame, c, "DIFFERENCE")

    return finalize_hard_surface(frame, bevel_width=0.028, bevel_segments=3, bevel_angle_deg=34.0)


def build_p08_sideplate() -> bpy.types.Object:
    """F-02: Detachable Left Trigger-Lever Sideplate (Abzugsblech) w/ domed oval bellcrank boss."""
    pts: list[tuple[float, float]] = [
        (-1.42, -0.52),
        (0.85, -0.52),
    ]
    pts.extend(sample_quad_bezier((0.85, -0.52), (1.24, -0.52), (1.42, -0.10), steps=10))
    pts.extend([
        (1.42, 0.58),
        (-1.42, 0.64),
    ])
    plate = make_extrude_z_three("p08_sideplate", pts, -0.14, 0.12, bevel=0.032, bevel_segs=3)

    # Smooth contoured rounded-oval raised bellcrank boss on outer left face (-Z)
    boss_pts = rounded_polygon_2d(
        [
            (-0.90, -0.48, 0.22),
            (0.54, -0.48, 0.22),
            (0.54, 0.56, 0.22),
            (-0.90, 0.56, 0.22),
        ],
        arc_steps=6,
    )
    boss = make_extrude_z_three("boss", boss_pts, -0.19, -0.04, bevel=0.045, bevel_segs=3)
    plate = bool_op(plate, boss, "UNION")

    inner_pocket = make_box_three("inner_pkt", 1.52, 1.08, 0.20, center=(-0.18, 0.02, 0.08))
    td_notch = make_cylinder_three("td_notch", 0.28, 0.28, 0.50, axis="Z", center=(1.18, -0.46, 0.0), segments=28)
    plate = bool_op(plate, inner_pocket, "DIFFERENCE")
    plate = bool_op(plate, td_notch, "DIFFERENCE")
    return finalize_hard_surface(plate, bevel_width=0.022, bevel_segments=3, bevel_angle_deg=36.0)


def build_p08_takedown_lever() -> bpy.types.Object:
    """
    F-03: 240-deg-C Straw-Gold Rotating Takedown Lever (Zerlegehebel).
    Includes real 3D serrated thumb pad on -Z outer face & inward locking cam shaft (+Z into frame)!
    """
    pts: list[tuple[float, float]] = [
        (0.22, 0.22),
        (-0.78, -0.35),
    ]
    pts.extend(sample_quad_bezier((-0.78, -0.35), (-0.88, -0.68), (-0.52, -0.68), steps=10))
    pts.append((0.22, -0.18))
    lever = make_extrude_z_three("p08_takedown_lever", pts, -0.22, 0.0, bevel=0.030, bevel_segs=3)

    # Locking cam shaft extending INWARD (+Z) into frame bore (fixing legacy CSG outward-rod bug!)
    shaft = make_revolve_three(
        "td_shaft",
        [
            (0.0, -0.21),
            (0.23, -0.21),
            (0.24, -0.17),
            (0.24, 0.12),
            (0.16, 0.14),
            (0.16, 0.88),
            (0.13, 0.92),
            (0.0, 0.92),
        ],
        axis="Z",
        segments=28,
    )
    lever = bool_op(lever, shaft, "UNION")

    # Crisp 3D anti-slip serration grooves across outer left thumb paddle (-Z = -0.22)
    for k in range(6):
        gx = -0.66 + k * 0.105
        gy = -0.46 + k * 0.055
        groove = make_box_three(
            f"td_ser_{k}", 0.036, 0.34, 0.055, center=(gx, gy, -0.225), rot_three=(0.0, 0.0, 0.52)
        )
        lever = bool_op(lever, groove, "DIFFERENCE")

    return finalize_hard_surface(lever, bevel_width=0.016, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_ejector() -> bpy.types.Object:
    """F-04: Straw-Gold Right-Flank Leaf-Spring Ejector Blade (Auswerfer)."""
    body = make_box_three("p08_ejector", 2.88, 0.24, 0.14, bevel=0.028, bevel_segs=3)
    rear = make_box_three("ej_rear", 0.36, 0.40, 0.20, center=(-1.26, 0.0, 0.03), bevel=0.025, bevel_segs=2)
    front = make_box_three("ej_front", 0.42, 0.22, 0.26, center=(1.22, 0.0, -0.11), bevel=0.025, bevel_segs=2)
    body = bool_op(body, rear, "UNION")
    body = bool_op(body, front, "UNION")
    return finalize_hard_surface(body, bevel_width=0.015, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_hold_open() -> bpy.types.Object:
    """F-05: Bright Steel Internal Last-Round Hold-Open Latch & Leaf Spring (Verschlussfang)."""
    pts = [
        (-1.12, -0.12),
        (0.75, -0.12),
        (1.12, 0.26),
        (0.84, 0.26),
        (0.45, 0.04),
        (-1.12, 0.04),
    ]
    latch = make_extrude_z_three("p08_hold_open", pts, -0.12, 0.12, bevel=0.018, bevel_segs=2)
    tab = make_box_three("ho_tab", 0.34, 0.16, 0.32, center=(0.18, -0.14, -0.06), bevel=0.018, bevel_segs=2)
    spr = make_box_three("ho_spr", 1.52, 0.058, 0.14, center=(-0.24, -0.175, 0.0), rot_three=(0.0, 0.0, -0.06), bevel=0.010, bevel_segs=2)
    latch = bool_op(latch, tab, "UNION")
    latch = bool_op(latch, spr, "UNION")
    return finalize_hard_surface(latch, bevel_width=0.0, use_bevel=False)


def build_p08_walnut_grip(side: str) -> bpy.types.Object:
    """
    F-06 / F-07: Organically Contoured 3D Double-Curved Palm-Swell European Black Walnut Grip Panel!
    Built directly in exact 55-deg grip-parallel coordinates (s_fwd, s_up) so front & back edges
    hug the rounded blued steel frontstrap & backstrap seamlessly with ZERO exposed magazine gap!
    Features smooth hand-fitted perimeter, upper mag-catch scallop, recessed beveled counterbore
    and REAL 3D domed blued slotted steel grip screw centered near heel!
    """
    assert side in ("left", "right")
    sign_z = 1.0 if side == "right" else -1.0
    part_name = "p08_grip_right" if side == "right" else "p08_grip_left"

    c35 = math.cos(math.radians(35.0))
    s35 = math.sin(math.radians(35.0))

    def eval_xy(u: float, v: float) -> tuple[float, float]:
        """u in [-1, 1] rear->front (55-deg parallel!), v in [-1, 1] bottom->top."""
        # Subtle organic corner rounding at the 4 grip corners
        rc = max(0.0, abs(u) - 0.85) / 0.15
        vc = max(0.0, abs(v) - 0.88) / 0.12
        shrink = 0.045 * (rc * rc) * (vc * vc)
        ue = u * (1.0 - shrink)
        ve = v * (1.0 - shrink)

        # Strictly 55-deg parallel s_fwd span covering entire recessed grip step [-1.72, +1.70]!
        sf = -1.72 + 0.5 * (ue + 1.0) * (1.70 - (-1.72))
        # Bottom edge runs cleanly along magazine heel; top edge sweeps up gracefully toward mag catch!
        su_bot = -4.55 - 0.14 * ue
        su_top = 3.92 + 0.34 * ue
        su = su_bot + 0.5 * (ve + 1.0) * (su_top - su_bot)

        tx = sf * c35 + su * s35
        ty = -sf * s35 + su * c35
        return (tx, ty)

    nu, nv = 36, 52
    bm = bmesh.new()

    # Seated flush onto frame grip step (Z_world = +-0.72 -> z_local = -sign_z * 0.20)
    # Swells organically outward with lush ergonomic palm arch to Z_world = +-1.38 (+sign_z * 0.46)!
    z_in_base = -sign_z * 0.21

    outer_grid: list[list[bmesh.types.BMVert]] = []
    inner_grid: list[list[bmesh.types.BMVert]] = []

    for iv in range(nv + 1):
        v = -1.0 + 2.0 * (iv / nv)
        row_out = []
        row_in = []
        for iu in range(nu + 1):
            u = -1.0 + 2.0 * (iu / nu)
            x, y = eval_xy(u, v)

            du = min(1.0, abs(u))
            dv = min(1.0, abs(v))
            arch_u = math.pow(max(0.0, 1.0 - du * du), 0.50)
            arch_v = math.pow(max(0.0, 1.0 - dv * dv * 0.86), 0.36)
            palm_swell = 0.09 + 0.37 * arch_u * (0.50 + 0.50 * arch_v)

            z_out = sign_z * palm_swell
            z_in = z_in_base + sign_z * (0.12 * (1.0 - arch_u * arch_v))

            row_out.append(bm.verts.new(t2b(x, y, z_out)))
            row_in.append(bm.verts.new(t2b(x, y, z_in)))
        outer_grid.append(row_out)
        inner_grid.append(row_in)

    for iv in range(nv):
        for iu in range(nu):
            if sign_z > 0:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv][iu + 1], outer_grid[iv + 1][iu + 1], outer_grid[iv + 1][iu]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv + 1][iu], inner_grid[iv + 1][iu + 1], inner_grid[iv][iu + 1]))
            else:
                bm.faces.new((outer_grid[iv][iu], outer_grid[iv + 1][iu], outer_grid[iv + 1][iu + 1], outer_grid[iv][iu + 1]))
                bm.faces.new((inner_grid[iv][iu], inner_grid[iv][iu + 1], inner_grid[iv + 1][iu + 1], inner_grid[iv + 1][iu]))

    for iu in range(nu):
        bm.faces.new((inner_grid[0][iu], inner_grid[0][iu + 1], outer_grid[0][iu + 1], outer_grid[0][iu]))
        bm.faces.new((outer_grid[nv][iu], outer_grid[nv][iu + 1], inner_grid[nv][iu + 1], inner_grid[nv][iu]))
    for iv in range(nv):
        bm.faces.new((outer_grid[iv][0], outer_grid[iv + 1][0], inner_grid[iv + 1][0], inner_grid[iv][0]))
        bm.faces.new((inner_grid[iv][nu], inner_grid[iv + 1][nu], outer_grid[iv + 1][nu], outer_grid[iv][nu]))

    grip = new_mesh_obj(part_name, bm)

    # Authentic subtle semicircular upper mag-catch relief scallop on left panel ONLY (cradling mag button at world (-2.05, -0.82) -> local (+3.60, +3.63))
    if side == "left":
        mag_relief = make_cylinder_three(
            "mag_btn_relief", 0.48, 0.48, 1.50, axis="Z", center=(3.60, 3.63, 0.0), segments=28
        )
        grip = bool_op(grip, mag_relief, "DIFFERENCE")

    # Authentic centered lower grip retention screw at (s_fwd = 0.0, s_up = -3.72) -> local (-2.134, -3.047)!
    screw_x = -3.72 * s35
    screw_y = -3.72 * c35
    counterbore = make_revolve_three(
        "counterbore",
        [
            (0.0, 0.05),
            (0.245, 0.05),
            (0.245, 0.27),
            (0.320, 0.39),
            (0.350, 0.65),
            (0.0, 0.65),
        ] if sign_z > 0 else [
            (0.0, -0.65),
            (0.350, -0.65),
            (0.320, -0.39),
            (0.245, -0.27),
            (0.245, -0.05),
            (0.0, -0.05),
        ],
        axis="Z",
        segments=32,
        center=(screw_x, screw_y, 0.0),
    )
    grip = bool_op(grip, counterbore, "DIFFERENCE")
    grip = finalize_hard_surface(grip, bevel_width=0.016, bevel_segments=2, bevel_angle_deg=42.0, use_bevel=False)

    # Real 3D domed blued slotted steel grip screw seated cleanly inside the beveled counterbore!
    screw_prof = [
        (0.0, 0.06),
        (0.228, 0.06),
        (0.228, 0.27),
        (0.205, 0.315),
        (0.140, 0.344),
        (0.0, 0.352),
    ]
    if sign_z < 0:
        screw_prof = [(r, -z) for (r, z) in reversed(screw_prof)]
    screw = make_revolve_three(
        f"grip_screw_{side}", screw_prof, axis="Z", segments=32, center=(screw_x, screw_y, 0.0)
    )
    slot_cut = make_box_three(
        "screw_slot", 0.50, 0.066, 0.14, center=(screw_x, screw_y, sign_z * 0.335), rot_three=(0.0, 0.0, math.radians(24.0))
    )
    screw = bool_op(screw, slot_cut, "DIFFERENCE")
    screw = finalize_hard_surface(screw, bevel_width=0.008, bevel_segments=2, bevel_angle_deg=38.0)

    vg_wood = grip.vertex_groups.new(name="walnut_wood")
    vg_wood.add(list(range(len(grip.data.vertices))), 1.0, "REPLACE")
    vg_screw = screw.vertex_groups.new(name="blued_screw")
    vg_screw.add(list(range(len(screw.data.vertices))), 1.0, "REPLACE")

    join_objects(grip, [screw])
    return grip


def build_p08_trigger() -> bpy.types.Object:
    """FC-01: Gleaming 240-deg-C Straw-Gold Wide Crescent Trigger (Abzug) w/ white steel pivot pin."""
    pts: list[tuple[float, float]] = [
        (-0.32, 0.44),  # Upper bellcrank cam nose
        (0.36, 0.36),
        (0.28, -0.18),
    ]
    # Deeply sculpted classic Luger half-moon crescent finger shoe!
    pts.extend(sample_quad_bezier((0.28, -0.18), (0.68, -0.88), (0.14, -1.58), steps=16))
    pts.append((-0.22, -1.52))
    pts.extend(sample_quad_bezier((-0.22, -1.52), (0.24, -0.88), (-0.16, -0.24), steps=16))
    pts.append((-0.48, 0.12))

    # Rich rounded bevel on the ergonomic crescent trigger face!
    shoe = make_extrude_z_three("p08_trigger", pts, -0.28, 0.28, bevel=0.068, bevel_segs=4)
    pin_hole = make_cylinder_three("trig_hole", 0.112, 0.112, 0.80, axis="Z", center=(0.0, 0.0, 0.0), segments=24)
    shoe = bool_op(shoe, pin_hole, "DIFFERENCE")
    shoe = finalize_hard_surface(shoe, bevel_width=0.020, bevel_segments=2, bevel_angle_deg=38.0, use_bevel=False)

    vg_straw = shoe.vertex_groups.new(name="straw_gold")
    vg_straw.add(list(range(len(shoe.data.vertices))), 1.0, "REPLACE")

    pin = make_cylinder_three("trig_pin", 0.105, 0.105, 0.68, axis="Z", center=(0.0, 0.0, 0.0), segments=24, bevel_caps=0.016)
    vg_steel = pin.vertex_groups.new(name="white_steel")
    vg_steel.add(list(range(len(pin.data.vertices))), 1.0, "REPLACE")

    join_objects(shoe, [pin])
    return shoe


def build_p08_trigger_lever() -> bpy.types.Object:
    """FC-02: Bright Steel Sideplate L-Shaped Bellcrank Transfer Lever (Abzugshebel) tucked cleanly inside sideplate."""
    lower = make_box_three("p08_trigger_lever", 0.30, 0.88, 0.18, center=(-0.18, -0.04, 0.05), rot_three=(0.0, 0.0, 0.20), bevel=0.026, bevel_segs=2)
    upper = make_box_three("tl_up", 0.96, 0.28, 0.20, center=(-0.22, 0.44, -0.05), bevel=0.026, bevel_segs=2)
    pin = make_cylinder_three("tl_pin", 0.082, 0.082, 0.96, axis="Y", center=(0.18, 0.06, -0.02), segments=20, bevel_caps=0.015)
    lower = bool_op(lower, upper, "UNION")
    lower = bool_op(lower, pin, "UNION")
    return finalize_hard_surface(lower, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)


def build_p08_sear_bar() -> bpy.types.Object:
    """FC-03: Blued Horizontal Left-Flank Sear Bar w/ Bright White Steel Disconnector Plunger."""
    bar = make_box_three("p08_sear_bar", 4.18, 0.26, 0.16, bevel=0.026, bevel_segs=2)
    tooth = make_box_three("sear_tooth", 0.42, 0.24, 0.24, center=(-0.95, 0.0, 0.10), bevel=0.022, bevel_segs=2)
    leaf = make_box_three("sear_leaf", 1.85, 0.06, 0.14, center=(-0.65, 0.16, -0.04), bevel=0.012, bevel_segs=2)
    bar = bool_op(bar, tooth, "UNION")
    bar = bool_op(bar, leaf, "UNION")
    bar = finalize_hard_surface(bar, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)
    vg_blued = bar.vertex_groups.new(name="rust_blued")
    vg_blued.add(list(range(len(bar.data.vertices))), 1.0, "REPLACE")

    plunger = make_cylinder_three("sear_plunger", 0.11, 0.11, 0.36, axis="Z", center=(1.85, -0.04, 0.04), segments=24, bevel_caps=0.02)
    vg_white = plunger.vertex_groups.new(name="white_steel")
    vg_white.add(list(range(len(plunger.data.vertices))), 1.0, "REPLACE")

    join_objects(bar, [plunger])
    return bar


def build_p08_thumb_safety() -> bpy.types.Object:
    """
    FC-04: 240-deg-C Straw-Gold Knurled Thumb Safety Lever & White-Steel Blocking Bar (Sicherungshebel).
    Includes outward-facing (-Z) checkered circular thumb disc (fixing legacy CSG inward bug!).
    """
    pts: list[tuple[float, float]] = [
        (0.18, -0.22),
        (-0.88, 0.78),
    ]
    pts.extend(sample_quad_bezier((-0.88, 0.78), (-1.22, 1.12), (-0.82, 1.32), steps=10))
    pts.append((0.32, 0.18))
    arm = make_extrude_z_three("p08_thumb_safety", pts, -0.14, 0.08, bevel=0.026, bevel_segs=3)

    # Raised circular checkered thumb pad (Daumenstueck) protruding cleanly outward on LEFT (-Z = -0.26)
    disc = make_revolve_three(
        "thumb_disc",
        [
            (0.0, -0.26),
            (0.32, -0.26),
            (0.36, -0.21),
            (0.36, 0.04),
            (0.0, 0.04),
        ],
        axis="Z",
        segments=32,
        center=(-0.92, 0.98, 0.0),
    )
    arm = bool_op(arm, disc, "UNION")
    # Crisp 3D cross-checkering grooves across the circular thumb pad (-Z = -0.26)
    for k in range(-2, 3):
        off = k * 0.11
        g1 = make_box_three("sg1", 0.76, 0.026, 0.04, center=(-0.92, 0.98 + off, -0.265), rot_three=(0.0, 0.0, math.radians(30.0)))
        g2 = make_box_three("sg2", 0.026, 0.76, 0.04, center=(-0.92 + off, 0.98, -0.265), rot_three=(0.0, 0.0, math.radians(30.0)))
        arm = bool_op(arm, g1, "DIFFERENCE")
        arm = bool_op(arm, g2, "DIFFERENCE")
    arm = finalize_hard_surface(arm, bevel_width=0.014, bevel_segments=2, bevel_angle_deg=38.0)

    vg_straw = arm.vertex_groups.new(name="straw_gold")
    vg_straw.add(list(range(len(arm.data.vertices))), 1.0, "REPLACE")

    # Bright steel forward sliding sear-blocking bar (Sicherungsstange)
    bar = make_box_three("block_bar", 2.35, 0.20, 0.14, center=(1.15, 0.86, 0.12), bevel=0.022, bevel_segs=2)
    vg_white = bar.vertex_groups.new(name="white_steel")
    vg_white.add(list(range(len(bar.data.vertices))), 1.0, "REPLACE")

    join_objects(arm, [bar])
    return arm


def build_p08_mag_body() -> bpy.types.Object:
    """
    M-01: Brushed-Nickel 55-deg Folded Sheet-Steel 8-Round Magazine Body (Magazingehaeuse).
    Smooth 0.15 cm folded corner radii, rear stiffening spine rib, curved tapered single-feed top lips,
    exact hollow interior cavity (x in [-1.10, +1.12], z in [-0.53, +0.53]) clearing all 8 stacked
    9x19mm rounds with zero clipping, right loading-button slot (+Z) & left guide slot (-Z)!
    """
    outer = make_box_three("p08_mag_body", 2.52, 11.20, 1.28, bevel=0.14, bevel_segs=4)
    spine = make_box_three("mag_spine", 0.24, 11.08, 0.54, center=(-1.26, 0.0, 0.0), bevel=0.045, bevel_segs=3)
    outer = bool_op(outer, spine, "UNION")

    # Hollow 8-round 9x19mm interior cavity (matches magazineStackSpecs.ts cleanly!)
    cavity = make_box_three("mag_cav", 2.22, 11.00, 1.06, center=(0.02, 0.22, 0.0))
    # Top tapered bullet presentation feed throat opening cleanly between feed lips
    feed_scoop = make_box_three("feed_scoop", 1.82, 1.22, 0.86, center=(0.44, 5.45, 0.0))
    # Right-flank (+Z) full-length loading thumb-button slot with rounded ends (matches p08_mag_follower!)
    right_slot = make_box_three("slot_r", 0.32, 8.65, 0.45, center=(0.12, -0.25, 0.58), bevel=0.14, bevel_segs=3)
    # Left-flank (-Z) matching guide-pin slot (authentic P08 folded magazine!)
    left_slot = make_box_three("slot_l", 0.26, 8.65, 0.45, center=(0.12, -0.25, -0.58), bevel=0.11, bevel_segs=3)
    # Magazine catch locking window
    catch_win = make_box_three("catch_win", 0.52, 0.34, 0.36, center=(0.85, 3.15, -0.56))

    for c in (cavity, feed_scoop, right_slot, left_slot, catch_win):
        outer = bool_op(outer, c, "DIFFERENCE")

    return finalize_hard_surface(outer, bevel_width=0.020, bevel_segments=2, bevel_angle_deg=36.0)


def build_p08_mag_follower() -> bpy.types.Object:
    """M-02: Machined Steel Cartridge Follower w/ 3D Knurled External Thumb Loading Button (+Z)."""
    plat = make_box_three("p08_mag_follower", 1.92, 0.68, 0.94, rot_three=(0.0, 0.0, 0.42), bevel=0.055, bevel_segs=3)
    skirt = make_box_three("fol_skirt", 1.48, 0.85, 0.86, center=(-0.08, -0.45, 0.0), bevel=0.04, bevel_segs=2)
    plat = bool_op(plat, skirt, "UNION")

    # Iconic circular knurled thumb loading button protruding cleanly out the RIGHT (+Z) slot (Z_max = +0.96)
    btn = make_revolve_three(
        "fol_btn",
        [
            (0.0, 0.15),
            (0.14, 0.15),
            (0.14, 0.64),
            (0.38, 0.68),
            (0.38, 0.88),
            (0.33, 0.96),
            (0.0, 0.96),
        ],
        axis="Z",
        segments=32,
        center=(0.12, -0.12, 0.0),
    )
    # Subtle flush guide pin end on left (-Z)
    left_pin = make_cylinder_three("fol_lpin", 0.12, 0.12, 0.30, axis="Z", center=(0.12, -0.12, -0.34), segments=20, bevel_caps=0.02)
    plat = bool_op(plat, btn, "UNION")
    plat = bool_op(plat, left_pin, "UNION")

    # Crisp 3D peripheral gripping ribs around the circular thumb button
    bm_r = bmesh.new()
    for k in range(18):
        a = (k / 18.0) * 2.0 * math.pi
        bx = 0.12 + math.cos(a) * 0.38
        by = -0.12 + math.sin(a) * 0.38
        bmesh.ops.create_cube(bm_r, size=1.0)
        # Just use make_box_three and join cleanly
    bm_r.free()

    ribs = []
    for k in range(16):
        a = (k / 16.0) * 2.0 * math.pi
        ribs.append(
            make_box_three(
                f"fb_rib_{k}",
                0.042,
                0.042,
                0.20,
                center=(0.12 + math.cos(a) * 0.378, -0.12 + math.sin(a) * 0.378, 0.78),
                rot_three=(0.0, 0.0, a),
                bevel=0.008,
                bevel_segs=1,
            )
        )
    plat = finalize_hard_surface(plat, bevel_width=0.016, bevel_segments=2, bevel_angle_deg=38.0)
    join_objects(plat, ribs)
    return plat


def build_p08_mag_base() -> bpy.types.Object:
    """
    M-04: Sculpted Double-Ear Concentric-Grooved Aluminum/Walnut Pull-Knob Floorplate (Magazinboden).
    Features 6 REAL 3D concentric V-grooves turned into BOTH circular pull-knob ears (+-Z),
    beveled walnut-accent collar, brushed alloy plug & blued transverse retention pin!
    """
    plug = make_box_three("p08_mag_base", 2.12, 0.72, 0.98, center=(0.0, 0.36, 0.0), bevel=0.055, bevel_segs=3)
    collar = make_box_three("mb_collar", 2.62, 0.50, 1.34, center=(0.0, -0.14, 0.0), bevel=0.075, bevel_segs=3)
    base = bool_op(plug, collar, "UNION")

    # Build twin circular pull-knob ears with 6 ACTUAL 3D CONCENTRIC V-GROOVES on outer faces!
    def build_concentric_ear(sign_z: float) -> bpy.types.Object:
        prof: list[tuple[float, float]] = [
            (0.0, 0.44),
            (0.66, 0.44),
            (0.66, 0.87),
            (0.60, 0.96),
            (0.57, 0.98),
        ]
        # 5 crisp concentric turned anti-slip V-grooves stepping radially inward from r=0.55 to r=0.08!
        for g in range(5):
            r_hi = 0.54 - g * 0.095
            r_mid = r_hi - 0.032
            r_lo = r_hi - 0.064
            prof.append((r_hi, 0.98))
            prof.append((r_mid, 0.938))  # Real 0.42 mm deep turned V-groove!
            prof.append((r_lo, 0.98))
        prof.append((0.0, 0.98))
        if sign_z < 0:
            prof = [(r, -z) for (r, z) in reversed(prof)]
        return make_revolve_three(
            f"mb_ear_{'R' if sign_z > 0 else 'L'}",
            prof,
            axis="Z",
            segments=44,
            center=(-0.15, -0.38, 0.0),
        )

    ear_l = build_concentric_ear(-1.0)
    ear_r = build_concentric_ear(+1.0)
    base = bool_op(base, ear_l, "UNION")
    base = bool_op(base, ear_r, "UNION")
    base = finalize_hard_surface(base, bevel_width=0.020, bevel_segments=2, bevel_angle_deg=38.0)

    vg_alloy = base.vertex_groups.new(name="mag_alloy")
    vg_alloy.add(list(range(len(base.data.vertices))), 1.0, "REPLACE")

    pin = make_cylinder_three("mb_pin", 0.068, 0.068, 1.36, axis="Z", center=(0.45, 0.25, 0.0), segments=20, bevel_caps=0.012)
    vg_blued = pin.vertex_groups.new(name="rust_blued")
    vg_blued.add(list(range(len(pin.data.vertices))), 1.0, "REPLACE")

    join_objects(base, [pin])
    return base


# ============================================================================
# 6. CLEAN NON-OVERLAPPING UV UNWRAPPING & PACKING
# ============================================================================


def unwrap_walnut_grips(grip_objs: list[bpy.types.Object]) -> None:
    """
    Unwraps p08_grip_left & p08_grip_right cleanly into 2048x2048 p08_v3_walnut:
      - Zero seams across the entire curved 20-LPI checkered outer wood face!
      - Smooth planar-aligned projection on outer faces + smart unwrap on rim/inner/screw,
        then cleanly packed non-overlapping into [0, 1]^2.
    """
    bpy.ops.object.select_all(action="DESELECT")
    for obj in grip_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = grip_objs[0]

    for obj in grip_objs:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")

        # Mark sharp seams along perimeter & counterbore rim so LSCM/Smart keeps outer face 100% continuous!
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        sign_y = -1.0 if obj.name == "p08_grip_right" else 1.0  # Blender +Y = left (-Z), -Y = right (+Z)
        for e in bm.edges:
            if len(e.link_faces) == 2:
                n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
                # Seam wherever outer palm face meets rim wall or screw counterbore
                is_out0 = n0.y * sign_y > 0.45
                is_out1 = n1.y * sign_y > 0.45
                e.seam = (is_out0 != is_out1) or (e.calc_face_angle(0.0) > math.radians(52.0))
        bm.to_mesh(obj.data)
        bm.free()

        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")

    # Pack both grips jointly into non-overlapping [0, 1]^2
    bpy.ops.object.select_all(action="DESELECT")
    for obj in grip_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = grip_objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.008)
    bpy.ops.object.mode_set(mode="OBJECT")


def unwrap_metal_parts(metal_objs: list[bpy.types.Object]) -> None:
    """
    3-Zone Color-Separated Zero-Bleed UV Atlas Packer for 2048x2048 p08_v3_metal:
      - Zone A (u in [0.008, 0.725], v in [0.008, 0.992]): Imperial Rust-Blued parts ONLY
        (ZERO adjacent white/gold islands -> mathematically impossible to bleed white dots onto blued seams!)
      - Zone B (u in [0.742, 0.992], v in [0.335, 0.992]): Bright White Steel / Brushed Nickel / Alloy parts
      - Zone C (u in [0.742, 0.992], v in [0.008, 0.318]): 240-deg-C Straw-Gold parts
    Eliminates Smart-UV confetti by using angle_limit=66 deg + compact cylindrical unwrap on the
    280 3D toggle knurling teeth, dedicating maximum texel resolution to 1917, DWM, 3 Imperial proofs,
    GELADEN, GESICHERT & 21!
    """
    zone_a_names = {
        "p08_barrel", "p08_barrel_extension", "p08_extractor", "p08_front_toggle",
        "p08_rear_toggle", "p08_frame", "p08_sideplate", "p08_sear_bar",
    }
    zone_c_names = {
        "p08_trigger", "p08_takedown_lever", "p08_thumb_safety", "p08_ejector",
    }

    hero_boost: dict[str, float] = {
        "p08_extractor": 3.4,
        "p08_sideplate": 2.3,
        "p08_front_toggle": 2.8,
        "p08_barrel_extension": 2.2,
        "p08_rear_toggle": 1.15,
        "p08_frame": 1.40,
        "p08_barrel": 0.95,
        "p08_sear_bar": 0.65,
        "p08_breechblock": 1.35,
        "p08_mag_body": 1.05,
        "p08_mag_base": 0.95,
        "p08_mag_follower": 0.80,
        "p08_toggle_pins": 0.95,
        "p08_striker": 0.75,
        "p08_trigger_lever": 0.65,
        "p08_hold_open": 0.65,
        "p08_trigger": 1.35,
        "p08_takedown_lever": 1.45,
        "p08_thumb_safety": 1.15,
        "p08_ejector": 0.75,
    }

    # 1. Cohesive Smart UV Project (angle_limit=66 deg keeps bevel strips joined!)
    for obj in metal_objs:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")

        # For p08_rear_toggle, unwrap main bridge cleanly & pack 280 3D knurl teeth into 2 compact cylindrical strips!
        if obj.name == "p08_rear_toggle" and obj.vertex_groups.get("knurl_teeth"):
            vg_idx = obj.vertex_groups["knurl_teeth"].index
            knurl_v = {v.index for v in obj.data.vertices if any(g.group == vg_idx and g.weight > 0.5 for g in v.groups)}
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="DESELECT")
            bpy.ops.object.mode_set(mode="OBJECT")
            for p in obj.data.polygons:
                p.select = not all(vi in knurl_v for vi in p.vertices)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(66.0),
                island_margin=0.012,
                area_weight=0.25,
                correct_aspect=True,
                scale_to_bounds=False,
            )
            bpy.ops.object.mode_set(mode="OBJECT")

            # Project ALL 280 knurl teeth cleanly into 2 tidy compact UV strips (zero confetti!)
            uv_layer = obj.data.uv_layers.active.data
            for p in obj.data.polygons:
                if all(vi in knurl_v for vi in p.vertices):
                    side_off = 0.0 if p.center.y < 0.0 else 0.14
                    for li in p.loop_indices:
                        co = obj.data.vertices[obj.data.loops[li].vertex_index].co
                        ang = math.atan2(co.z - 0.26, co.x - 3.30)  # [-pi, pi]
                        u_k = ((ang + math.pi) / (2.0 * math.pi)) * 0.26
                        v_k = ((abs(co.y) - 0.70) / 0.65) * 0.09 + side_off
                        uv_layer[li].uv.x = u_k
                        uv_layer[li].uv.y = v_k
        else:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(66.0),
                island_margin=0.012,
                area_weight=0.25,
                correct_aspect=True,
                scale_to_bounds=False,
            )
            bpy.ops.object.mode_set(mode="OBJECT")

    def pack_zone(zone_objs: list[bpy.types.Object], u_bounds: tuple[float, float], v_bounds: tuple[float, float], margin: float) -> None:
        if not zone_objs:
            return
        bpy.ops.object.select_all(action="DESELECT")
        for obj in zone_objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = zone_objs[0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        bpy.ops.object.mode_set(mode="OBJECT")

        # Apply hero engraving texel boosts & shrink hidden internal bores/cavities + knurl strips
        for obj in zone_objs:
            s_obj = hero_boost.get(obj.name, 1.0)
            mesh = obj.data
            uv_layer = mesh.uv_layers.active.data
            knurl_vg = obj.vertex_groups.get("knurl_teeth")
            knurl_v = (
                {v.index for v in mesh.vertices if any(g.group == knurl_vg.index and g.weight > 0.5 for g in v.groups)}
                if knurl_vg else set()
            )
            for poly in mesh.polygons:
                c = poly.center
                n = poly.normal
                s = s_obj
                if obj.name == "p08_barrel":
                    if math.hypot(c.y, c.z - P08_BORE_Y) < 0.54:
                        s *= 0.22
                elif obj.name == "p08_rear_toggle":
                    if knurl_v and all(vi in knurl_v for vi in poly.vertices):
                        s = 0.24  # Compact knurl strips — never starve 1917/DWM/proofs!
                elif obj.name == "p08_mag_body":
                    if abs(c.y) < 0.54 and abs(c.x) < 1.12:
                        s *= 0.25
                elif obj.name == "p08_barrel_extension":
                    # Massive hero texel boost for top "1917" deck & right-flank 3 Imperial proofs!
                    if c.x > 1.40 and (n.z > 0.76 or n.y < -0.76):
                        s *= 2.40
                elif obj.name == "p08_front_toggle":
                    if n.z > 0.78 and c.z > 0.46:
                        s *= 2.20
                elif obj.name == "p08_frame":
                    if -8.1 < c.x < -6.0 and c.y > 0.76 and n.y > 0.72:
                        s *= 2.25
                    elif abs(c.y) < 0.72 and c.z < 1.0:
                        s *= 0.25
                elif obj.name == "p08_mag_base":
                    if poly.area < 0.015:
                        s *= 0.45
                if abs(s - 1.0) > 1e-3:
                    for li in poly.loop_indices:
                        uv_layer[li].uv.x *= s
                        uv_layer[li].uv.y *= s

        bpy.ops.object.select_all(action="DESELECT")
        for obj in zone_objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = zone_objs[0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=margin)
        bpy.ops.object.mode_set(mode="OBJECT")

        # Affine-map packed [0, 1]^2 strictly into zone sub-rectangle
        u0, u1 = u_bounds
        v0, v1 = v_bounds
        du, dv = u1 - u0, v1 - v0
        for obj in zone_objs:
            uv_layer = obj.data.uv_layers.active.data
            for loop_uv in uv_layer:
                loop_uv.uv.x = u0 + loop_uv.uv.x * du
                loop_uv.uv.y = v0 + loop_uv.uv.y * dv

    zone_a = [o for o in metal_objs if o.name in zone_a_names]
    zone_c = [o for o in metal_objs if o.name in zone_c_names]
    zone_b = [o for o in metal_objs if o.name not in zone_a_names and o.name not in zone_c_names]

    pack_zone(zone_a, (0.008, 0.724), (0.008, 0.992), margin=0.010)
    pack_zone(zone_b, (0.742, 0.992), (0.338, 0.992), margin=0.014)
    pack_zone(zone_c, (0.742, 0.992), (0.008, 0.318), margin=0.016)


# ============================================================================
# 7. PHYSICALLY-BASED CYCLES SHADERS + OBJECT-SPACE DECAL PROJECTION
# ============================================================================


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_srgb_to_lin(rgb: tuple[float, float, float]) -> tuple[float, float, float, 1.0]:
    return (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]), 1.0)


def add_normal_gated_decal(
    nt: bpy.types.NodeTree,
    tex_coord_out,
    img: bpy.types.Image,
    plane_axes: tuple[str, str],
    u_range: tuple[float, float],
    v_range: tuple[float, float],
    normal_axis: str,
    normal_sign: float,
    normal_thresh: float = 0.72,
    depth_axis: str | None = None,
    depth_range: tuple[float, float] | None = None,
) -> bpy.types.NodeSocket:
    """
    Projects a crisp high-res PIL engraving mask in exact 3D Object Space, strictly gated by:
      1) u in [u_min, u_max], v in [v_min, v_max] (zero tiling/bleed!)
      2) Face normal pointing along normal_sign * normal_axis (> normal_thresh)
      3) Optional depth slice (e.g. only top deck of chamber ring, never underside!)
    Returns a clean [0, 1] scalar mask socket!
    """
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex_coord_out, sep.inputs["Vector"])

    def map_axis(ax_name: str, lo: float, hi: float):
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = False
        mr.inputs["From Min"].default_value = lo
        mr.inputs["From Max"].default_value = hi
        mr.inputs["To Min"].default_value = 0.0
        mr.inputs["To Max"].default_value = 1.0
        nt.links.new(sep.outputs[ax_name], mr.inputs["Value"])
        return mr.outputs["Result"]

    u_sock = map_axis(plane_axes[0], u_range[0], u_range[1])
    v_sock = map_axis(plane_axes[1], v_range[0], v_range[1])

    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(u_sock, comb.inputs["X"])
    nt.links.new(v_sock, comb.inputs["Y"])

    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.extension = "CLIP"
    tex.interpolation = "Cubic"
    nt.links.new(comb.outputs["Vector"], tex.inputs["Vector"])

    # Strict normal gate in object space (transform True Normal from World -> Object!)
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    vec_xform = nt.nodes.new("ShaderNodeVectorTransform")
    vec_xform.vector_type = "NORMAL"
    vec_xform.convert_from = "WORLD"
    vec_xform.convert_to = "OBJECT"
    nt.links.new(geom.outputs["True Normal"], vec_xform.inputs["Vector"])

    n_sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(vec_xform.outputs["Vector"], n_sep.inputs["Vector"])

    n_mul = nt.nodes.new("ShaderNodeMath")
    n_mul.operation = "MULTIPLY"
    n_mul.inputs[1].default_value = normal_sign
    nt.links.new(n_sep.outputs[normal_axis], n_mul.inputs[0])

    n_gate = nt.nodes.new("ShaderNodeMapRange")
    n_gate.clamp = True
    n_gate.inputs["From Min"].default_value = normal_thresh
    n_gate.inputs["From Max"].default_value = min(0.98, normal_thresh + 0.14)
    n_gate.inputs["To Min"].default_value = 0.0
    n_gate.inputs["To Max"].default_value = 1.0
    nt.links.new(n_mul.outputs["Value"], n_gate.inputs["Value"])

    out_mul = nt.nodes.new("ShaderNodeMath")
    out_mul.operation = "MULTIPLY"
    nt.links.new(tex.outputs["Color"], out_mul.inputs[0])
    nt.links.new(n_gate.outputs["Result"], out_mul.inputs[1])
    cur = out_mul.outputs["Value"]

    if depth_axis and depth_range:
        d_lo, d_hi = depth_range
        gt = nt.nodes.new("ShaderNodeMapRange")
        gt.clamp = True
        gt.inputs["From Min"].default_value = d_lo - 0.04
        gt.inputs["From Max"].default_value = d_lo + 0.04
        gt.inputs["To Min"].default_value = 0.0
        gt.inputs["To Max"].default_value = 1.0
        nt.links.new(sep.outputs[depth_axis], gt.inputs["Value"])

        lt = nt.nodes.new("ShaderNodeMapRange")
        lt.clamp = True
        lt.inputs["From Min"].default_value = d_hi - 0.04
        lt.inputs["From Max"].default_value = d_hi + 0.04
        lt.inputs["To Min"].default_value = 1.0
        lt.inputs["To Max"].default_value = 0.0
        nt.links.new(sep.outputs[depth_axis], lt.inputs["Value"])

        m1 = nt.nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY"
        nt.links.new(gt.outputs["Result"], m1.inputs[0])
        nt.links.new(lt.outputs["Result"], m1.inputs[1])

        m2 = nt.nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY"
        nt.links.new(cur, m2.inputs[0])
        nt.links.new(m1.outputs["Value"], m2.inputs[1])
        cur = m2.outputs["Value"]

    return cur


def build_metal_material(
    name: str,
    base_srgb: tuple[float, float, float],
    alt_srgb: tuple[float, float, float],
    roughness_base: float,
    metalness_base: float,
    grain_scale: tuple[float, float, float] = (8.0, 48.0, 48.0),
    grain_bump: float = 0.022,
    bevel_radius: float = 0.028,
    engrave_specs: Sequence[dict] = (),
    bake_img: bpy.types.Image | None = None,
) -> bpy.types.Material:
    """
    Constructs a physically-calibrated Cycles metal shader with:
      - Authentic draw-filed/brushed anisotropic grain + organic oil-sheen variation
      - Subtle edge wear via Pointiness/AO highlight
      - Ray-traced ShaderNodeBevel fillet normals + Object-Space V-carved engravings
      - Built-in AO (Self-AO + Assembled Contact-AO) + micro-cavity wiring for 3-pass baking!
    """
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.name = "OUT"
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.name = "BSDF"

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # 1. Directional draw-filed / brushed steel grain (anisotropic noise in Object Space)
    map_g = nt.nodes.new("ShaderNodeMapping")
    map_g.inputs["Scale"].default_value = grain_scale
    nt.links.new(tc.outputs["Object"], map_g.inputs["Vector"])

    noise_grain = nt.nodes.new("ShaderNodeTexNoise")
    noise_grain.inputs["Scale"].default_value = 3.5
    noise_grain.inputs["Detail"].default_value = 8.0
    noise_grain.inputs["Roughness"].default_value = 0.62
    nt.links.new(map_g.outputs["Vector"], noise_grain.inputs["Vector"])

    # 2. Macro gun-oil / rust-carding cloud variation
    noise_oil = nt.nodes.new("ShaderNodeTexNoise")
    noise_oil.inputs["Scale"].default_value = 0.85
    noise_oil.inputs["Detail"].default_value = 5.0
    noise_oil.inputs["Roughness"].default_value = 0.55
    nt.links.new(tc.outputs["Object"], noise_oil.inputs["Vector"])

    # Combine grain + oil into color mix factor
    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.inputs["A"].default_value = rgb_srgb_to_lin(base_srgb)
    mix_col.inputs["B"].default_value = rgb_srgb_to_lin(alt_srgb)
    nt.links.new(noise_oil.outputs["Fac"], mix_col.inputs["Factor"])

    # Subtle grain modulation on base color (0.94..1.06)
    g_mod = nt.nodes.new("ShaderNodeMapRange")
    g_mod.inputs["From Min"].default_value = 0.25
    g_mod.inputs["From Max"].default_value = 0.75
    g_mod.inputs["To Min"].default_value = 0.94
    g_mod.inputs["To Max"].default_value = 1.07
    nt.links.new(noise_grain.outputs["Fac"], g_mod.inputs["Value"])

    col_mul = nt.nodes.new("ShaderNodeMix")
    col_mul.data_type = "RGBA"
    col_mul.blend_type = "MULTIPLY"
    col_mul.inputs["Factor"].default_value = 1.0
    nt.links.new(mix_col.outputs["Result"], col_mul.inputs["A"])
    nt.links.new(g_mod.outputs["Result"], col_mul.inputs["B"])
    cur_color = col_mul.outputs["Result"]

    # Roughness modulation from oil cloud + brushed grain
    r_oil = nt.nodes.new("ShaderNodeMapRange")
    r_oil.inputs["From Min"].default_value = 0.2
    r_oil.inputs["From Max"].default_value = 0.8
    r_oil.inputs["To Min"].default_value = max(0.08, roughness_base - 0.032)
    r_oil.inputs["To Max"].default_value = min(0.85, roughness_base + 0.042)
    nt.links.new(noise_oil.outputs["Fac"], r_oil.inputs["Value"])

    r_g = nt.nodes.new("ShaderNodeMapRange")
    r_g.inputs["From Min"].default_value = 0.0
    r_g.inputs["From Max"].default_value = 1.0
    r_g.inputs["To Min"].default_value = -0.018
    r_g.inputs["To Max"].default_value = 0.018
    nt.links.new(noise_grain.outputs["Fac"], r_g.inputs["Value"])

    r_add = nt.nodes.new("ShaderNodeMath")
    r_add.operation = "ADD"
    r_add.use_clamp = True
    nt.links.new(r_oil.outputs["Result"], r_add.inputs[0])
    nt.links.new(r_g.outputs["Result"], r_add.inputs[1])
    cur_rough = r_add.outputs["Value"]

    cur_metal_val = nt.nodes.new("ShaderNodeValue")
    cur_metal_val.outputs[0].default_value = metalness_base
    cur_metal = cur_metal_val.outputs[0]

    # Micro-bump height (starts with brushed draw-file grain)
    h_grain = nt.nodes.new("ShaderNodeMath")
    h_grain.operation = "MULTIPLY"
    h_grain.inputs[1].default_value = grain_bump
    nt.links.new(noise_grain.outputs["Fac"], h_grain.inputs[0])
    cur_height = h_grain.outputs["Value"]

    micro_ao_val = nt.nodes.new("ShaderNodeValue")
    micro_ao_val.outputs[0].default_value = 1.0
    cur_micro_ao = micro_ao_val.outputs[0]

    # 3. Apply crisp normal-gated object-space historical engravings!
    for idx, spec in enumerate(engrave_specs):
        mask = add_normal_gated_decal(
            nt,
            tc.outputs["Object"],
            spec["image"],
            spec["axes"],
            spec["u_range"],
            spec["v_range"],
            spec["n_axis"],
            spec["n_sign"],
            spec.get("n_thresh", 0.72),
            spec.get("d_axis"),
            spec.get("d_range"),
        )
        # Carve crisp recessed V-groove into heightfield
        eng_depth = spec.get("depth", 0.16)
        d_mul = nt.nodes.new("ShaderNodeMath")
        d_mul.operation = "MULTIPLY"
        d_mul.inputs[1].default_value = eng_depth
        nt.links.new(mask, d_mul.inputs[0])

        h_sub = nt.nodes.new("ShaderNodeMath")
        h_sub.operation = "SUBTRACT"
        nt.links.new(cur_height, h_sub.inputs[0])
        nt.links.new(d_mul.outputs["Value"], h_sub.inputs[1])
        cur_height = h_sub.outputs["Value"]

        # Blend engraved color (brighter brushed steel stamp OR crisp white lacquer for GELADEN/GESICHERT!)
        fill_srgb = spec.get("fill_srgb", (0.58, 0.63, 0.71))
        fill_strength = spec.get("fill_strength", 0.65)
        f_mul = nt.nodes.new("ShaderNodeMath")
        f_mul.operation = "MULTIPLY"
        f_mul.inputs[1].default_value = fill_strength
        nt.links.new(mask, f_mul.inputs[0])

        cm = nt.nodes.new("ShaderNodeMix")
        cm.data_type = "RGBA"
        nt.links.new(f_mul.outputs["Value"], cm.inputs["Factor"])
        nt.links.new(cur_color, cm.inputs["A"])
        cm.inputs["B"].default_value = rgb_srgb_to_lin(fill_srgb)
        cur_color = cm.outputs["Result"]

        # Engraved recess slightly rougher
        rm = nt.nodes.new("ShaderNodeMix")
        rm.data_type = "FLOAT"
        nt.links.new(mask, rm.inputs["Factor"])
        nt.links.new(cur_rough, rm.inputs["A"])
        rm.inputs["B"].default_value = spec.get("roughness", 0.42)
        cur_rough = rm.outputs["Result"]

        # Optional dielectric white paint fill lowers metalness cleanly!
        if "metalness" in spec:
            mm = nt.nodes.new("ShaderNodeMix")
            mm.data_type = "FLOAT"
            nt.links.new(mask, mm.inputs["Factor"])
            nt.links.new(cur_metal, mm.inputs["A"])
            mm.inputs["B"].default_value = spec["metalness"]
            cur_metal = mm.outputs["Result"]

        # Micro-cavity AO inside stamped groove (unless bright white enamel)
        if spec.get("cavity_darken", 0.25) > 0:
            am = nt.nodes.new("ShaderNodeMix")
            am.data_type = "FLOAT"
            nt.links.new(mask, am.inputs["Factor"])
            nt.links.new(cur_micro_ao, am.inputs["A"])
            am.inputs["B"].default_value = 1.0 - spec.get("cavity_darken", 0.25)
            cur_micro_ao = am.outputs["Result"]

    # 4. Ray-traced Bevel Normal + Noise-Free Convex Edge Burnishing + Bump Micro-Relief
    bevel_node = nt.nodes.new("ShaderNodeBevel")
    bevel_node.samples = 8
    bevel_node.inputs["Radius"].default_value = bevel_radius

    # Subtle authentic holster/handling edge silvering via 1 - dot(BevelNormal, TrueNormal)!
    geom_e = nt.nodes.new("ShaderNodeNewGeometry")
    dot_e = nt.nodes.new("ShaderNodeVectorMath")
    dot_e.operation = "DOT_PRODUCT"
    nt.links.new(bevel_node.outputs["Normal"], dot_e.inputs[0])
    nt.links.new(geom_e.outputs["True Normal"], dot_e.inputs[1])

    edge_mask = nt.nodes.new("ShaderNodeMapRange")
    edge_mask.clamp = True
    edge_mask.inputs["From Min"].default_value = 0.996
    edge_mask.inputs["From Max"].default_value = 0.84
    edge_mask.inputs["To Min"].default_value = 0.0
    edge_mask.inputs["To Max"].default_value = 0.20
    nt.links.new(dot_e.outputs["Value"], edge_mask.inputs["Value"])

    # Modulate edge silvering slightly with organic oil noise so it looks hand-rubbed, never CG wireframe!
    edge_mod = nt.nodes.new("ShaderNodeMath")
    edge_mod.operation = "MULTIPLY"
    nt.links.new(edge_mask.outputs["Result"], edge_mod.inputs[0])
    nt.links.new(noise_oil.outputs["Fac"], edge_mod.inputs[1])

    col_edge = nt.nodes.new("ShaderNodeMix")
    col_edge.data_type = "RGBA"
    nt.links.new(edge_mod.outputs["Value"], col_edge.inputs["Factor"])
    nt.links.new(cur_color, col_edge.inputs["A"])
    col_edge.inputs["B"].default_value = rgb_srgb_to_lin((0.74, 0.78, 0.84))
    cur_color = col_edge.outputs["Result"]

    rgh_edge = nt.nodes.new("ShaderNodeMix")
    rgh_edge.data_type = "FLOAT"
    nt.links.new(edge_mod.outputs["Value"], rgh_edge.inputs["Factor"])
    nt.links.new(cur_rough, rgh_edge.inputs["A"])
    rgh_edge.inputs["B"].default_value = max(0.14, roughness_base - 0.06)
    cur_rough = rgh_edge.outputs["Result"]

    bump_node = nt.nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = 0.85
    bump_node.inputs["Distance"].default_value = 0.045
    nt.links.new(cur_height, bump_node.inputs["Height"])
    nt.links.new(bevel_node.outputs["Normal"], bump_node.inputs["Normal"])

    # 5. Crevice-Only Dual Ray-Traced Cycles Ambient Occlusion!
    # Shortened radius (0.48 / 0.42 cm) & calibrated floor keeps broad flat steel faces at 0.95-1.00
    # while sharpening true crevices, screw slots, flutes & inter-part contact seams!
    ao_self = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao_self.samples = 16
    ao_self.only_local = True
    ao_self.inputs["Distance"].default_value = 0.48

    ao_world = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao_world.samples = 16
    ao_world.only_local = False
    ao_world.inputs["Distance"].default_value = 0.42

    ao_w_remap = nt.nodes.new("ShaderNodeMapRange")
    ao_w_remap.clamp = True
    ao_w_remap.inputs["From Min"].default_value = 0.14
    ao_w_remap.inputs["From Max"].default_value = 0.85
    ao_w_remap.inputs["To Min"].default_value = 0.72
    ao_w_remap.inputs["To Max"].default_value = 1.0
    nt.links.new(ao_world.outputs["AO"], ao_w_remap.inputs["Value"])

    ao_s_remap = nt.nodes.new("ShaderNodeMapRange")
    ao_s_remap.clamp = True
    ao_s_remap.inputs["From Min"].default_value = 0.12
    ao_s_remap.inputs["From Max"].default_value = 0.88
    ao_s_remap.inputs["To Min"].default_value = 0.54
    ao_s_remap.inputs["To Max"].default_value = 1.0
    nt.links.new(ao_self.outputs["AO"], ao_s_remap.inputs["Value"])

    ao_comb1 = nt.nodes.new("ShaderNodeMath")
    ao_comb1.operation = "MULTIPLY"
    nt.links.new(ao_s_remap.outputs["Result"], ao_comb1.inputs[0])
    nt.links.new(ao_w_remap.outputs["Result"], ao_comb1.inputs[1])

    ao_final = nt.nodes.new("ShaderNodeMath")
    ao_final.operation = "MULTIPLY"
    ao_final.use_clamp = True
    nt.links.new(ao_comb1.outputs["Value"], ao_final.inputs[0])
    nt.links.new(cur_micro_ao, ao_final.inputs[1])

    # Wire Principled BSDF (used for NORMAL bake + preview renders)
    nt.links.new(cur_color, bsdf.inputs["Base Color"])
    nt.links.new(cur_rough, bsdf.inputs["Roughness"])
    nt.links.new(cur_metal, bsdf.inputs["Metallic"])
    nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    # Dedicated Emission helper nodes for instant noise-free ALBEDO & ORM bakes!
    emit_albedo = nt.nodes.new("ShaderNodeEmission")
    emit_albedo.name = "EMIT_ALBEDO"
    emit_albedo.inputs["Strength"].default_value = 1.0
    nt.links.new(cur_color, emit_albedo.inputs["Color"])

    orm_comb = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(ao_final.outputs["Value"], orm_comb.inputs["Red"])
    nt.links.new(cur_rough, orm_comb.inputs["Green"])
    nt.links.new(cur_metal, orm_comb.inputs["Blue"])

    emit_orm = nt.nodes.new("ShaderNodeEmission")
    emit_orm.name = "EMIT_ORM"
    emit_orm.inputs["Strength"].default_value = 1.0
    nt.links.new(orm_comb.outputs["Color"], emit_orm.inputs["Color"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # Bake target Image Texture node
    tex_bake = nt.nodes.new("ShaderNodeTexImage")
    tex_bake.name = "BAKE_TARGET"
    if bake_img is not None:
        tex_bake.image = bake_img
    nt.nodes.active = tex_bake
    return mat


def build_walnut_grip_material(
    name: str,
    side: str,
    bake_img: bpy.types.Image,
) -> bpy.types.Material:
    """
    Museum-grade Hand-Oiled European Black Walnut (Juglans regia) material w/
    razor-sharp 20-LPI pyramidal diamond checkering strictly bounded inside a
    smooth hand-rubbed carved walnut perimeter border & screw collar!
    Evaluated in exact 3D Object Space -> zero UV stretching, ~15 texels/mm!
    """
    sign_y = -1.0 if side == "right" else 1.0  # Blender +Y = left (-Z), -Y = right (+Z)

    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.name = "OUT"
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.name = "BSDF"

    tc = nt.nodes.new("ShaderNodeTexCoord")

    # 1. Rotate Object (X, Z) into 55-deg grip-aligned coordinates (s_fwd, s_up)!
    # In Blender local space: X = tx, Z = ty, Y = -tz.
    # Rotate around Blender Y by -35 deg so X' = s_fwd (across grip) and Z' = s_up (along grip)!
    rot_grip = nt.nodes.new("ShaderNodeMapping")
    rot_grip.inputs["Rotation"].default_value = (0.0, math.radians(-35.0), 0.0)
    nt.links.new(tc.outputs["Object"], rot_grip.inputs["Vector"])

    sep_g = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(rot_grip.outputs["Vector"], sep_g.inputs["Vector"])

    # 2. Rich European Black Walnut (Juglans regia) heartwood figure & open wood vessel pores!
    map_wood = nt.nodes.new("ShaderNodeMapping")
    map_wood.inputs["Scale"].default_value = (1.65, 1.5, 0.24)
    nt.links.new(rot_grip.outputs["Vector"], map_wood.inputs["Vector"])

    # Organic burl-distorted cathedral wood rings (never rigid parallel stripes!)
    wave_ring = nt.nodes.new("ShaderNodeTexWave")
    wave_ring.wave_type = "RINGS"
    wave_ring.rings_direction = "Z"
    wave_ring.wave_profile = "SIN"
    wave_ring.inputs["Scale"].default_value = 0.92
    wave_ring.inputs["Distortion"].default_value = 9.5
    wave_ring.inputs["Detail"].default_value = 7.0
    wave_ring.inputs["Detail Scale"].default_value = 1.65
    wave_ring.inputs["Detail Roughness"].default_value = 0.62
    nt.links.new(map_wood.outputs["Vector"], wave_ring.inputs["Vector"])

    noise_fig = nt.nodes.new("ShaderNodeTexNoise")
    noise_fig.inputs["Scale"].default_value = 1.8
    noise_fig.inputs["Detail"].default_value = 6.0
    noise_fig.inputs["Distortion"].default_value = 0.8
    nt.links.new(map_wood.outputs["Vector"], noise_fig.inputs["Vector"])

    # Fine elongated open walnut vessel pores along grip spine
    map_pore = nt.nodes.new("ShaderNodeMapping")
    map_pore.inputs["Scale"].default_value = (26.0, 26.0, 2.4)
    nt.links.new(rot_grip.outputs["Vector"], map_pore.inputs["Vector"])

    noise_pore = nt.nodes.new("ShaderNodeTexNoise")
    noise_pore.inputs["Scale"].default_value = 3.2
    noise_pore.inputs["Detail"].default_value = 4.0
    nt.links.new(map_pore.outputs["Vector"], noise_pore.inputs["Vector"])

    pore_mask = nt.nodes.new("ShaderNodeMapRange")
    pore_mask.clamp = True
    pore_mask.inputs["From Min"].default_value = 0.62
    pore_mask.inputs["From Max"].default_value = 0.78
    pore_mask.inputs["To Min"].default_value = 0.0
    pore_mask.inputs["To Max"].default_value = 1.0
    nt.links.new(noise_pore.outputs["Fac"], pore_mask.inputs["Value"])

    # Rich warm antique linseed-oiled European walnut palette
    c_dark = rgb_srgb_to_lin((0.205, 0.108, 0.056))
    c_mid = rgb_srgb_to_lin((0.375, 0.212, 0.106))
    c_light = rgb_srgb_to_lin((0.515, 0.308, 0.160))

    w_mix1 = nt.nodes.new("ShaderNodeMix")
    w_mix1.data_type = "RGBA"
    w_mix1.inputs["A"].default_value = c_dark
    w_mix1.inputs["B"].default_value = c_mid
    nt.links.new(wave_ring.outputs["Fac"], w_mix1.inputs["Factor"])

    fig_f = nt.nodes.new("ShaderNodeMapRange")
    fig_f.clamp = True
    fig_f.inputs["From Min"].default_value = 0.32
    fig_f.inputs["From Max"].default_value = 0.76
    fig_f.inputs["To Min"].default_value = 0.0
    fig_f.inputs["To Max"].default_value = 0.52
    nt.links.new(noise_fig.outputs["Fac"], fig_f.inputs["Value"])

    w_mix2 = nt.nodes.new("ShaderNodeMix")
    w_mix2.data_type = "RGBA"
    nt.links.new(fig_f.outputs["Result"], w_mix2.inputs["Factor"])
    nt.links.new(w_mix1.outputs["Result"], w_mix2.inputs["A"])
    w_mix2.inputs["B"].default_value = c_light

    # Darken wood pores slightly
    pore_col = nt.nodes.new("ShaderNodeMix")
    pore_col.data_type = "RGBA"
    pore_col.inputs["B"].default_value = rgb_srgb_to_lin((0.14, 0.070, 0.034))
    p_fac = nt.nodes.new("ShaderNodeMath")
    p_fac.operation = "MULTIPLY"
    p_fac.inputs[1].default_value = 0.48
    nt.links.new(pore_mask.outputs["Result"], p_fac.inputs[0])
    nt.links.new(p_fac.outputs["Value"], pore_col.inputs["Factor"])
    nt.links.new(w_mix2.outputs["Result"], pore_col.inputs["A"])

    # 3. Authentic 20-LPI Diamond Checkering Boundary Mask (uniform ~3.2 mm carved smooth border around ALL 4 sides!)
    # Our grip panel spans s_fwd in [-1.72, +1.70], s_up in [-4.55 - 0.08*sf, +3.92 + 0.20*sf]
    def band_mask(sock, lo: float, hi: float, feather: float = 0.055):
        m_lo = nt.nodes.new("ShaderNodeMapRange")
        m_lo.clamp = True
        m_lo.inputs["From Min"].default_value = lo
        m_lo.inputs["From Max"].default_value = lo + feather
        nt.links.new(sock, m_lo.inputs["Value"])

        m_hi = nt.nodes.new("ShaderNodeMapRange")
        m_hi.clamp = True
        m_hi.inputs["From Min"].default_value = hi - feather
        m_hi.inputs["From Max"].default_value = hi
        m_hi.inputs["To Min"].default_value = 1.0
        m_hi.inputs["To Max"].default_value = 0.0
        nt.links.new(sock, m_hi.inputs["Value"])

        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(m_lo.outputs["Result"], mul.inputs[0])
        nt.links.new(m_hi.outputs["Result"], mul.inputs[1])
        return mul.outputs["Value"]

    in_fwd = band_mask(sep_g.outputs["X"], -1.36, 1.34, 0.05)

    # Slanted top/bottom checkering limits parallel to the grip's authentic top/bottom edges!
    # su_rel = s_up - 0.16 * s_fwd -> top edge sits at ~3.92, bottom at ~-4.55
    sf_slope = nt.nodes.new("ShaderNodeMath")
    sf_slope.operation = "MULTIPLY"
    sf_slope.inputs[1].default_value = 0.16
    nt.links.new(sep_g.outputs["X"], sf_slope.inputs[0])

    su_rel = nt.nodes.new("ShaderNodeMath")
    su_rel.operation = "SUBTRACT"
    nt.links.new(sep_g.outputs["Z"], su_rel.inputs[0])
    nt.links.new(sf_slope.outputs["Value"], su_rel.inputs[1])

    in_up = band_mask(su_rel.outputs["Value"], -4.16, 3.55, 0.055)

    in_rect = nt.nodes.new("ShaderNodeMath")
    in_rect.operation = "MULTIPLY"
    nt.links.new(in_fwd, in_rect.inputs[0])
    nt.links.new(in_up, in_rect.inputs[1])

    # Clear circular smooth collar around centered lower grip screw at Object (X=-2.134, Z=-3.047)!
    s35_val = math.sin(math.radians(35.0))
    c35_val = math.cos(math.radians(35.0))
    sc_x = -3.72 * s35_val
    sc_z = -3.72 * c35_val

    sep_obj = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep_obj.inputs["Vector"])

    dx_s = nt.nodes.new("ShaderNodeMath")
    dx_s.operation = "SUBTRACT"
    dx_s.inputs[1].default_value = sc_x
    nt.links.new(sep_obj.outputs["X"], dx_s.inputs[0])

    dz_s = nt.nodes.new("ShaderNodeMath")
    dz_s.operation = "SUBTRACT"
    dz_s.inputs[1].default_value = sc_z
    nt.links.new(sep_obj.outputs["Z"], dz_s.inputs[0])

    comb_s = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(dx_s.outputs["Value"], comb_s.inputs["X"])
    nt.links.new(dz_s.outputs["Value"], comb_s.inputs["Y"])

    dist_s = nt.nodes.new("ShaderNodeVectorMath")
    dist_s.operation = "LENGTH"
    nt.links.new(comb_s.outputs["Vector"], dist_s.inputs[0])

    clear_screw = nt.nodes.new("ShaderNodeMapRange")
    clear_screw.clamp = True
    clear_screw.inputs["From Min"].default_value = 0.42
    clear_screw.inputs["From Max"].default_value = 0.50
    nt.links.new(dist_s.outputs["Value"], clear_screw.inputs["Value"])

    # Gate strictly to outer palm-facing wood surface!
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    vxf = nt.nodes.new("ShaderNodeVectorTransform")
    vxf.vector_type = "NORMAL"
    vxf.convert_from = "WORLD"
    vxf.convert_to = "OBJECT"
    nt.links.new(geom.outputs["True Normal"], vxf.inputs["Vector"])
    n_sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(vxf.outputs["Vector"], n_sep.inputs["Vector"])

    n_side = nt.nodes.new("ShaderNodeMath")
    n_side.operation = "MULTIPLY"
    n_side.inputs[1].default_value = sign_y
    nt.links.new(n_sep.outputs["Y"], n_side.inputs[0])

    n_gate = nt.nodes.new("ShaderNodeMapRange")
    n_gate.clamp = True
    n_gate.inputs["From Min"].default_value = 0.52
    n_gate.inputs["From Max"].default_value = 0.72
    nt.links.new(n_side.outputs["Value"], n_gate.inputs["Value"])

    m_chk1 = nt.nodes.new("ShaderNodeMath")
    m_chk1.operation = "MULTIPLY"
    nt.links.new(in_rect.outputs["Value"], m_chk1.inputs[0])
    nt.links.new(clear_screw.outputs["Result"], m_chk1.inputs[1])

    chk_mask = nt.nodes.new("ShaderNodeMath")
    chk_mask.operation = "MULTIPLY"
    nt.links.new(m_chk1.outputs["Value"], chk_mask.inputs[0])
    nt.links.new(n_gate.outputs["Result"], chk_mask.inputs[1])

    # Carved V-groove border outline right along the edge of the checkering field!
    b_lo = nt.nodes.new("ShaderNodeMapRange")
    b_lo.clamp = True
    b_lo.inputs["From Min"].default_value = 0.05
    b_lo.inputs["From Max"].default_value = 0.50
    nt.links.new(chk_mask.outputs["Value"], b_lo.inputs["Value"])

    b_hi = nt.nodes.new("ShaderNodeMapRange")
    b_hi.clamp = True
    b_hi.inputs["From Min"].default_value = 0.50
    b_hi.inputs["From Max"].default_value = 0.95
    b_hi.inputs["To Min"].default_value = 1.0
    b_hi.inputs["To Max"].default_value = 0.0
    nt.links.new(chk_mask.outputs["Value"], b_hi.inputs["Value"])

    border_groove = nt.nodes.new("ShaderNodeMath")
    border_groove.operation = "MULTIPLY"
    nt.links.new(b_lo.outputs["Result"], border_groove.inputs[0])
    nt.links.new(b_hi.outputs["Result"], border_groove.inputs[1])

    # 4. Ultra-Crisp 20-LPI Hand-Cut Pyramidal Diamond Checkering (20 lines per inch = 7.87 lines/cm!)
    # Authentic diamond ratio 3:1 (~34 deg / -34 deg crossing V-grooves -> sharp 4-faceted pyramids!)
    # Use Blender ShaderNodeTexWave (SAW/TRIANGLE profile!) along +32 deg and -32 deg in (s_fwd, s_up)!
    def make_checkering_lines(angle_deg: float):
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0.0, math.radians(angle_deg), 0.0)
        nt.links.new(rot_grip.outputs["Vector"], mp.inputs["Vector"])

        wv = nt.nodes.new("ShaderNodeTexWave")
        wv.wave_type = "BANDS"
        wv.bands_direction = "X"
        wv.wave_profile = "TRI"  # Razor-sharp linear V-grooves & pointed diamond crests!
        # Wave period in Blender is 1/(Scale * 0.5) => Scale = 1.35 * 7.87/pi? Let's calibrate exact pitch:
        # In Blender WaveTexture BANDS X, bands repeat every (1 / (Scale * 0.15915...)) = 2*pi / (Scale * 20)?
        # Exact Blender formula: n = x * 20.0 * Scale (for BANDS), TRI repeats every 2*pi -> period = 2*pi / (20*Scale) = 0.31416 / Scale!
        # For 20 LPI = 0.127 cm pitch -> Scale = 0.31416 / 0.127 = 2.47! (Let's use 2.25 for super-crisp readable 18-20 LPI at 2K!)
        wv.inputs["Scale"].default_value = 2.25
        wv.inputs["Distortion"].default_value = 0.0
        nt.links.new(mp.outputs["Vector"], wv.inputs["Vector"])
        return wv.outputs["Fac"]

    line_a = make_checkering_lines(+33.0)
    line_b = make_checkering_lines(-33.0)

    # Sharp diamond pyramid height = min(line_a, line_b)!!
    # Think about geometry: two crossing linear V-grooves carve a 4-sided pyramid whose exact height is min(tri_a, tri_b)!
    pyr_h = nt.nodes.new("ShaderNodeMath")
    pyr_h.operation = "MINIMUM"
    nt.links.new(line_a, pyr_h.inputs[0])
    nt.links.new(line_b, pyr_h.inputs[1])

    # Slight crest darkening in valleys & warm linseed polish highlight on diamond tips
    chk_tint = nt.nodes.new("ShaderNodeMapRange")
    chk_tint.clamp = True
    chk_tint.inputs["From Min"].default_value = 0.0
    chk_tint.inputs["From Max"].default_value = 1.0
    chk_tint.inputs["To Min"].default_value = 0.58
    chk_tint.inputs["To Max"].default_value = 1.06
    nt.links.new(pyr_h.outputs["Value"], chk_tint.inputs["Value"])

    chk_col_mul = nt.nodes.new("ShaderNodeMix")
    chk_col_mul.data_type = "RGBA"
    chk_col_mul.blend_type = "MULTIPLY"
    nt.links.new(chk_mask.outputs["Value"], chk_col_mul.inputs["Factor"])
    nt.links.new(pore_col.outputs["Result"], chk_col_mul.inputs["A"])
    nt.links.new(chk_tint.outputs["Result"], chk_col_mul.inputs["B"])

    # Darken carved border groove slightly
    final_wood_col = nt.nodes.new("ShaderNodeMix")
    final_wood_col.data_type = "RGBA"
    nt.links.new(border_groove.outputs["Value"], final_wood_col.inputs["Factor"])
    nt.links.new(chk_col_mul.outputs["Result"], final_wood_col.inputs["A"])
    final_wood_col.inputs["B"].default_value = rgb_srgb_to_lin((0.14, 0.075, 0.04))

    # Heightfield: wood pores + diamond checkering pyramids - carved border groove
    h_pore = nt.nodes.new("ShaderNodeMath")
    h_pore.operation = "MULTIPLY"
    h_pore.inputs[1].default_value = -0.055
    nt.links.new(pore_mask.outputs["Result"], h_pore.inputs[0])

    h_pyr = nt.nodes.new("ShaderNodeMath")
    h_pyr.operation = "MULTIPLY"
    nt.links.new(pyr_h.outputs["Value"], h_pyr.inputs[0])
    nt.links.new(chk_mask.outputs["Value"], h_pyr.inputs[1])

    h_pyr_sc = nt.nodes.new("ShaderNodeMath")
    h_pyr_sc.operation = "MULTIPLY"
    h_pyr_sc.inputs[1].default_value = 0.32
    nt.links.new(h_pyr.outputs["Value"], h_pyr_sc.inputs[0])

    h_bdr = nt.nodes.new("ShaderNodeMath")
    h_bdr.operation = "MULTIPLY"
    h_bdr.inputs[1].default_value = -0.20
    nt.links.new(border_groove.outputs["Value"], h_bdr.inputs[0])

    h_sum1 = nt.nodes.new("ShaderNodeMath")
    h_sum1.operation = "ADD"
    nt.links.new(h_pore.outputs["Value"], h_sum1.inputs[0])
    nt.links.new(h_pyr_sc.outputs["Value"], h_sum1.inputs[1])

    h_total = nt.nodes.new("ShaderNodeMath")
    h_total.operation = "ADD"
    nt.links.new(h_sum1.outputs["Value"], h_total.inputs[0])
    nt.links.new(h_bdr.outputs["Value"], h_total.inputs[1])

    # Wood roughness: satin hand-rubbed border (0.46) vs rougher cut checkering (0.64) + pores
    r_smooth = nt.nodes.new("ShaderNodeMapRange")
    r_smooth.clamp = True
    r_smooth.inputs["From Min"].default_value = 0.0
    r_smooth.inputs["From Max"].default_value = 1.0
    r_smooth.inputs["To Min"].default_value = 0.44
    r_smooth.inputs["To Max"].default_value = 0.56
    nt.links.new(pore_mask.outputs["Result"], r_smooth.inputs["Value"])

    r_chk = nt.nodes.new("ShaderNodeMapRange")
    r_chk.clamp = True
    r_chk.inputs["From Min"].default_value = 0.0
    r_chk.inputs["From Max"].default_value = 1.0
    r_chk.inputs["To Min"].default_value = 0.70
    r_chk.inputs["To Max"].default_value = 0.56
    nt.links.new(pyr_h.outputs["Value"], r_chk.inputs["Value"])

    wood_rough = nt.nodes.new("ShaderNodeMix")
    wood_rough.data_type = "FLOAT"
    nt.links.new(chk_mask.outputs["Value"], wood_rough.inputs["Factor"])
    nt.links.new(r_smooth.outputs["Result"], wood_rough.inputs["A"])
    nt.links.new(r_chk.outputs["Result"], wood_rough.inputs["B"])

    # Micro-AO inside checkering valleys & carved border groove
    ao_pyr = nt.nodes.new("ShaderNodeMapRange")
    ao_pyr.clamp = True
    ao_pyr.inputs["From Min"].default_value = 0.0
    ao_pyr.inputs["From Max"].default_value = 0.75
    ao_pyr.inputs["To Min"].default_value = 0.46
    ao_pyr.inputs["To Max"].default_value = 1.0
    nt.links.new(pyr_h.outputs["Value"], ao_pyr.inputs["Value"])

    micro_ao1 = nt.nodes.new("ShaderNodeMix")
    micro_ao1.data_type = "FLOAT"
    micro_ao1.inputs["A"].default_value = 1.0
    nt.links.new(chk_mask.outputs["Value"], micro_ao1.inputs["Factor"])
    nt.links.new(ao_pyr.outputs["Result"], micro_ao1.inputs["B"])

    micro_ao2 = nt.nodes.new("ShaderNodeMix")
    micro_ao2.data_type = "FLOAT"
    nt.links.new(border_groove.outputs["Value"], micro_ao2.inputs["Factor"])
    nt.links.new(micro_ao1.outputs["Result"], micro_ao2.inputs["A"])
    micro_ao2.inputs["B"].default_value = 0.52

    # Ray-traced Self-AO + Assembled Contact-AO (crevice-only so broad walnut face stays luminous!)
    ao_self = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao_self.samples = 16
    ao_self.only_local = True
    ao_self.inputs["Distance"].default_value = 0.48

    ao_world = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao_world.samples = 16
    ao_world.only_local = False
    ao_world.inputs["Distance"].default_value = 0.42

    ao_w_r = nt.nodes.new("ShaderNodeMapRange")
    ao_w_r.clamp = True
    ao_w_r.inputs["From Min"].default_value = 0.14
    ao_w_r.inputs["From Max"].default_value = 0.85
    ao_w_r.inputs["To Min"].default_value = 0.72
    ao_w_r.inputs["To Max"].default_value = 1.0
    nt.links.new(ao_world.outputs["AO"], ao_w_r.inputs["Value"])

    ao_s_r = nt.nodes.new("ShaderNodeMapRange")
    ao_s_r.clamp = True
    ao_s_r.inputs["From Min"].default_value = 0.12
    ao_s_r.inputs["From Max"].default_value = 0.88
    ao_s_r.inputs["To Min"].default_value = 0.50
    ao_s_r.inputs["To Max"].default_value = 1.0
    nt.links.new(ao_self.outputs["AO"], ao_s_r.inputs["Value"])

    ao_m1 = nt.nodes.new("ShaderNodeMath")
    ao_m1.operation = "MULTIPLY"
    nt.links.new(ao_s_r.outputs["Result"], ao_m1.inputs[0])
    nt.links.new(ao_w_r.outputs["Result"], ao_m1.inputs[1])

    ao_final = nt.nodes.new("ShaderNodeMath")
    ao_final.operation = "MULTIPLY"
    ao_final.use_clamp = True
    nt.links.new(ao_m1.outputs["Value"], ao_final.inputs[0])
    nt.links.new(micro_ao2.outputs["Result"], ao_final.inputs[1])

    # Bevel + Bump normals
    bev = nt.nodes.new("ShaderNodeBevel")
    bev.samples = 6
    bev.inputs["Radius"].default_value = 0.025

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.95
    bump.inputs["Distance"].default_value = 0.065
    nt.links.new(h_total.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bev.outputs["Normal"], bump.inputs["Normal"])

    nt.links.new(final_wood_col.outputs["Result"], bsdf.inputs["Base Color"])
    nt.links.new(wood_rough.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    emit_albedo = nt.nodes.new("ShaderNodeEmission")
    emit_albedo.name = "EMIT_ALBEDO"
    emit_albedo.inputs["Strength"].default_value = 1.0
    nt.links.new(final_wood_col.outputs["Result"], emit_albedo.inputs["Color"])

    orm_comb = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(ao_final.outputs["Value"], orm_comb.inputs["Red"])
    nt.links.new(wood_rough.outputs["Result"], orm_comb.inputs["Green"])
    orm_comb.inputs["Blue"].default_value = 0.0  # Pure dielectric walnut!

    emit_orm = nt.nodes.new("ShaderNodeEmission")
    emit_orm.name = "EMIT_ORM"
    emit_orm.inputs["Strength"].default_value = 1.0
    nt.links.new(orm_comb.outputs["Color"], emit_orm.inputs["Color"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_bake = nt.nodes.new("ShaderNodeTexImage")
    tex_bake.name = "BAKE_TARGET"
    tex_bake.image = bake_img
    nt.nodes.active = tex_bake
    return mat


def switch_materials_mode(materials: Iterable[bpy.types.Material], mode: str, bake_img: bpy.types.Image) -> None:
    """Switches material outputs between 'BSDF' (Normal bake), 'EMIT_ALBEDO', and 'EMIT_ORM'."""
    for mat in materials:
        nt = mat.node_tree
        out = nt.nodes.get("OUT")
        src_node = nt.nodes.get(mode)
        tex = nt.nodes.get("BAKE_TARGET")
        if tex:
            tex.image = bake_img
            nt.nodes.active = tex
        if out and src_node:
            for lnk in list(out.inputs["Surface"].links):
                nt.links.remove(lnk)
            out_sock = src_node.outputs["BSDF"] if mode == "BSDF" else src_node.outputs["Emission"]
            nt.links.new(out_sock, out.inputs["Surface"])


# ============================================================================
# 8. CYCLES 3-PASS GPU BAKER & WEBP ENCODER
# ============================================================================

WEBP_PACK_CODE = r"""
import os
import sys
import numpy as np
from PIL import Image

tmp_dir, out_dir, prefix = sys.argv[1], sys.argv[2], sys.argv[3]

albedo_lin = np.load(os.path.join(tmp_dir, f"{prefix}_albedo.npy"))   # (H, W, 3) float32 linear
normal_lin = np.load(os.path.join(tmp_dir, f"{prefix}_normal.npy"))   # (H, W, 3) float32 [0..1]
orm_lin    = np.load(os.path.join(tmp_dir, f"{prefix}_orm.npy"))      # (H, W, 3) float32 [0..1]

# Flip vertical axis: Blender img.pixels row 0 is bottom (v=0), PIL row 0 is top (y=0)!
albedo_lin = np.clip(albedo_lin[::-1, :, :], 0.0, 1.0)
normal_lin = np.clip(normal_lin[::-1, :, :], 0.0, 1.0)
orm_lin    = np.clip(orm_lin[::-1, :, :], 0.0, 1.0)

# Exact sRGB encoding for Albedo
albedo_srgb = np.where(
    albedo_lin <= 0.0031308,
    albedo_lin * 12.92,
    1.055 * np.power(np.maximum(albedo_lin, 0.0031308), 1.0 / 2.4) - 0.055,
)
albedo_u8 = np.clip(np.rint(albedo_srgb * 255.0), 0, 255).astype(np.uint8)

# Re-normalize tangent normals & guard neutral background
n_vec = normal_lin * 2.0 - 1.0
n_len = np.linalg.norm(n_vec, axis=-1, keepdims=True)
bad = n_len[..., 0] < 0.25
n_vec = np.where(n_len > 1e-5, n_vec / np.maximum(n_len, 1e-5), np.array([0.0, 0.0, 1.0], dtype=np.float32))
n_vec[bad] = np.array([0.0, 0.0, 1.0], dtype=np.float32)
normal_u8 = np.clip(np.rint((n_vec * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)

# Calibrated ORM bounds: R=AO [0.20..1.0], G=Roughness [0.06..0.92], B=Metalness [0.0..1.0]
ao = np.clip(orm_lin[..., 0], 0.20, 1.0)
rgh = np.clip(orm_lin[..., 1], 0.06, 0.92)
met = np.clip(orm_lin[..., 2], 0.0, 1.0)
orm_u8 = np.clip(np.rint(np.stack((ao, rgh, met), axis=-1) * 255.0), 0, 255).astype(np.uint8)

alb_path = os.path.join(out_dir, f"{prefix}_albedo.webp")
nrm_path = os.path.join(out_dir, f"{prefix}_normal.webp")
orm_path = os.path.join(out_dir, f"{prefix}_roughness.webp")

Image.fromarray(albedo_u8, "RGB").save(alb_path, "WEBP", quality=97, method=6)
Image.fromarray(normal_u8, "RGB").save(nrm_path, "WEBP", quality=98, method=6)
Image.fromarray(orm_u8, "RGB").save(orm_path, "WEBP", quality=96, method=6)

for p in (alb_path, nrm_path, orm_path):
    print(f"  [WEBP] {os.path.basename(p)}: {os.path.getsize(p) / 1024:.1f} KB")
"""


def bake_atlas_suite(
    scene: bpy.types.Scene,
    objs: list[bpy.types.Object],
    materials: list[bpy.types.Material],
    prefix: str,
    temp_dir: str,
    sys_py: str,
) -> None:
    print(f"\n[BAKE] Starting 3-pass {TEX_SIZE}x{TEX_SIZE} Cycles GPU bake for {prefix} ({len(objs)} objects)...")
    t0 = time.time()

    def make_bake_image(tag: str, fill_rgba: tuple[float, float, float, float]) -> bpy.types.Image:
        img = bpy.data.images.new(f"{prefix}_{tag}", TEX_SIZE, TEX_SIZE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        buf = np.empty((TEX_SIZE * TEX_SIZE, 4), dtype=np.float32)
        buf[:] = fill_rgba
        img.pixels.foreach_set(buf.ravel())
        return img

    img_albedo = make_bake_image("albedo", (0.10, 0.12, 0.16, 1.0))
    img_normal = make_bake_image("normal", (0.5, 0.5, 1.0, 1.0))
    img_orm = make_bake_image("orm", (1.0, 0.35, 0.90 if "metal" in prefix else 0.0, 1.0))

    # Select ONLY target objects for baking (all 22 remain visible in scene for assembled contact AO!)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    # Pass 1: Albedo (EMIT, linear)
    switch_materials_mode(materials, "EMIT_ALBEDO", img_albedo)
    scene.cycles.samples = 4
    bpy.ops.object.bake(type="EMIT")
    alb_arr = np.empty(TEX_SIZE * TEX_SIZE * 4, dtype=np.float32)
    img_albedo.pixels.foreach_get(alb_arr)
    np.save(os.path.join(temp_dir, f"{prefix}_albedo.npy"), alb_arr.reshape(TEX_SIZE, TEX_SIZE, 4)[:, :, :3])
    print(f"  Pass 1 Albedo done ({time.time() - t0:.1f}s)")

    # Pass 2: Tangent-Space OpenGL (+Y) Normal (BSDF w/ ShaderNodeBevel + Bump)
    t1 = time.time()
    switch_materials_mode(materials, "BSDF", img_normal)
    scene.cycles.samples = 8
    bpy.ops.object.bake(
        type="NORMAL",
        normal_space="TANGENT",
        normal_r="POS_X",
        normal_g="POS_Y",
        normal_b="POS_Z",
    )
    nrm_arr = np.empty(TEX_SIZE * TEX_SIZE * 4, dtype=np.float32)
    img_normal.pixels.foreach_get(nrm_arr)
    np.save(os.path.join(temp_dir, f"{prefix}_normal.npy"), nrm_arr.reshape(TEX_SIZE, TEX_SIZE, 4)[:, :, :3])
    print(f"  Pass 2 Normal done ({time.time() - t1:.1f}s)")

    # Pass 3: Packed ORM (R=Ray-Traced Self+Contact AO * Micro-Cavity, G=Roughness, B=Metalness)
    t2 = time.time()
    switch_materials_mode(materials, "EMIT_ORM", img_orm)
    scene.cycles.samples = 12  # x 16 internal AO rays = 192 AO rays/texel!
    bpy.ops.object.bake(type="EMIT")
    orm_arr = np.empty(TEX_SIZE * TEX_SIZE * 4, dtype=np.float32)
    img_orm.pixels.foreach_get(orm_arr)
    np.save(os.path.join(temp_dir, f"{prefix}_orm.npy"), orm_arr.reshape(TEX_SIZE, TEX_SIZE, 4)[:, :, :3])
    print(f"  Pass 3 Packed ORM done ({time.time() - t2:.1f}s)")

    # Encode crisp WebP maps via system Python + PIL
    subprocess.run([sys_py, "-c", WEBP_PACK_CODE, temp_dir, str(TEXTURES_DIR), prefix], check=True)

    # Free heavy float bake images from RAM
    for im in (img_albedo, img_normal, img_orm):
        bpy.data.images.remove(im)


# ============================================================================
# 9. OPTIONAL CYCLES STUDIO PREVIEW RENDERER (FOR SELF-INSPECTION!)
# ============================================================================


def render_cycles_preview(
    scene: bpy.types.Scene,
    all_objs: list[bpy.types.Object],
    preview_dir: str,
) -> None:
    os.makedirs(preview_dir, exist_ok=True)
    print(f"\n[PREVIEW] Rendering Cycles studio verification shots using baked WebP maps into {preview_dir}...")

    # Load actual baked WebP textures back into clean Principled BSDF materials!
    def make_baked_preview_mat(mat_name: str, prefix: str, normal_str: float) -> bpy.types.Material:
        mat = bpy.data.materials.new(mat_name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")

        t_alb = nt.nodes.new("ShaderNodeTexImage")
        t_alb.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_albedo.webp"))
        t_alb.image.colorspace_settings.name = "sRGB"

        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_normal.webp"))
        t_nrm.image.colorspace_settings.name = "Non-Color"

        t_orm = nt.nodes.new("ShaderNodeTexImage")
        t_orm.image = bpy.data.images.load(str(TEXTURES_DIR / f"{prefix}_roughness.webp"))
        t_orm.image.colorspace_settings.name = "Non-Color"

        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_orm.outputs["Color"], sep.inputs["Color"])

        # Multiply Albedo by AO slightly for Cycles preview parity with Three.js aoMap
        ao_mix = nt.nodes.new("ShaderNodeMix")
        ao_mix.data_type = "RGBA"
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs["Factor"].default_value = 0.85
        nt.links.new(t_alb.outputs["Color"], ao_mix.inputs["A"])
        nt.links.new(sep.outputs["Red"], ao_mix.inputs["B"])

        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_str
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])

        nt.links.new(ao_mix.outputs["Result"], bsdf.inputs["Base Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.18 if "metal" in prefix else 0.04
            bsdf.inputs["Coat Roughness"].default_value = 0.22
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return mat

    mat_m = make_baked_preview_mat("PrevMetal", "p08_v3_metal", 0.72)
    mat_w = make_baked_preview_mat("PrevWalnut", "p08_v3_walnut", 0.85)

    for obj in all_objs:
        obj.data.materials.clear()
        obj.data.materials.append(mat_w if obj.name in WALNUT_PARTS else mat_m)

    # Load actual project studio HDRI (`tactical_vault.hdr`) for 1:1 Three.js lighting parity!
    hdri_path = REPO_ROOT / "public" / "hdri" / "tactical_vault.hdr"
    world = scene.world
    wnt = world.node_tree
    wnt.nodes.clear()
    wout = wnt.nodes.new("ShaderNodeOutputWorld")
    wbg = wnt.nodes.new("ShaderNodeBackground")
    if hdri_path.exists():
        env = wnt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri_path))
        wnt.links.new(env.outputs["Color"], wbg.inputs["Color"])
        wbg.inputs["Strength"].default_value = 1.35
    else:
        wbg.inputs["Color"].default_value = (0.35, 0.38, 0.44, 1.0)
        wbg.inputs["Strength"].default_value = 1.5
    wnt.links.new(wbg.outputs["Background"], wout.inputs["Surface"])

    # Add soft studio key + rim area lights
    def add_light(name, loc, target, energy, size, color=(1.0, 0.98, 0.95)):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    add_light("Key", t2b(6.0, 14.0, 18.0), t2b(0.5, -2.0, 0.0), 650.0, 14.0, (1.0, 0.97, 0.93))
    add_light("Rim", t2b(-12.0, 10.0, -14.0), t2b(0.0, -1.0, 0.0), 420.0, 10.0, (0.86, 0.92, 1.0))
    add_light("LeftFill", t2b(-4.0, 6.0, -18.0), t2b(-1.0, -1.5, 0.0), 380.0, 14.0, (0.95, 0.97, 1.0))

    cam_d = bpy.data.cameras.new("PrevCam")
    cam_d.lens = 68.0
    cam_o = bpy.data.objects.new("PrevCam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92

    shots = [
        ("preview_full_iso_right.jpg", t2b(16.0, 7.5, 31.0), t2b(0.5, -2.8, 0.0), 50.0),
        ("preview_full_right.jpg", t2b(0.8, -2.5, 34.0), t2b(0.8, -2.5, 0.0), 50.0),
        ("preview_full_left.jpg", t2b(0.8, -2.5, -34.0), t2b(0.8, -2.5, 0.0), 50.0),
        ("preview_macro_top_1917_dwm.jpg", t2b(-6.5, 13.5, -7.0), t2b(0.5, 2.5, 0.0), 65.0),
        ("preview_macro_left_controls.jpg", t2b(-3.5, 2.2, -16.5), t2b(-2.5, -0.5, -0.8), 62.0),
    ]
    for fname, loc, tgt, lens in shots:
        cam_d.lens = lens
        cam_o.location = loc
        cam_o.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(preview_dir, fname)
        bpy.ops.render.render(write_still=True)
        print(f"  [SHOT] {fname}")


# ============================================================================
# 10. MAIN ORCHESTRATOR
# ============================================================================


def main() -> None:
    t_start = time.time()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURES_DIR.mkdir(parents=True, exist_ok=True)

    preview_dir = None
    if "--preview" in sys.argv:
        idx = sys.argv.index("--preview")
        if idx + 1 < len(sys.argv):
            preview_dir = sys.argv[idx + 1]

    sys_py = find_system_python()
    scene = setup_clean_cycles_scene()

    with tempfile.TemporaryDirectory(prefix="p08_v3_") as temp_dir:
        decals = generate_decal_images(sys_py, temp_dir)

        print("\n[BUILD] Constructing all 22 AAA hard-surface Luger P08 parts...")
        builders: dict[str, Callable[[], bpy.types.Object]] = {
            "p08_barrel": build_p08_barrel,
            "p08_barrel_extension": build_p08_barrel_extension,
            "p08_breechblock": build_p08_breechblock,
            "p08_extractor": build_p08_extractor,
            "p08_front_toggle": build_p08_front_toggle,
            "p08_rear_toggle": build_p08_rear_toggle,
            "p08_toggle_pins": build_p08_toggle_pins,
            "p08_striker": build_p08_striker,
            "p08_frame": build_p08_frame,
            "p08_sideplate": build_p08_sideplate,
            "p08_takedown_lever": build_p08_takedown_lever,
            "p08_ejector": build_p08_ejector,
            "p08_hold_open": build_p08_hold_open,
            "p08_grip_left": lambda: build_p08_walnut_grip("left"),
            "p08_grip_right": lambda: build_p08_walnut_grip("right"),
            "p08_trigger": build_p08_trigger,
            "p08_trigger_lever": build_p08_trigger_lever,
            "p08_sear_bar": build_p08_sear_bar,
            "p08_thumb_safety": build_p08_thumb_safety,
            "p08_mag_body": build_p08_mag_body,
            "p08_mag_follower": build_p08_mag_follower,
            "p08_mag_base": build_p08_mag_base,
        }

        part_objs: dict[str, bpy.types.Object] = {}
        stats: dict[str, dict] = {}
        total_tris = 0
        for pid, fn in builders.items():
            obj = fn()
            obj.name = pid
            obj.data.name = pid
            st = verify_manifold_and_bbox(obj)
            stats[pid] = st
            total_tris += st["tris"]
            part_objs[pid] = obj
            print(
                f"  {pid:22s} tris={st['tris']:5d}  bnd={st['boundary']} nm={st['non_manifold']} "
                f"ndot={st['norm_dot']:.3f} min={st['min']} max={st['max']}"
            )
            if st["boundary"] > 0 or st["non_manifold"] > 0:
                print(f"    [WARN] {pid} has boundary={st['boundary']} non_manifold={st['non_manifold']}")

        print(f"[BUILD] All 22 solid parts built! Total triangles: {total_tris:,}")

        # Clean joint non-overlapping UVs
        print("\n[UV] Unwrapping & packing p08_v3_walnut (2 parts) & p08_v3_metal (20 parts)...")
        walnut_objs = [part_objs[p] for p in WALNUT_PARTS]
        metal_objs = [part_objs[p] for p in METAL_PARTS]
        unwrap_walnut_grips(walnut_objs)
        unwrap_metal_parts(metal_objs)

        # Build authentic physically-calibrated Cycles shaders
        print("\n[SHADERS] Wiring Imperial Rust-Blued, 240-deg-C Straw-Gold, White Steel, Nickel & 20-LPI Walnut shaders...")

        # Palette dead-center sweet spot for Three.js `tactical_vault.hdr` studio + AgX:
        # Deep lustrous DWM charcoal-indigo Imperial Rust Bluing on both key-lit right & rim-lit left flanks!
        RUST_BLUE_A = (0.242, 0.278, 0.338)
        RUST_BLUE_B = (0.312, 0.352, 0.418)
        STRAW_GOLD_A = (0.925, 0.795, 0.445)   # Luminous champagne-straw 240-deg-C Gelbangelassen!
        STRAW_GOLD_B = (0.840, 0.680, 0.320)   # Warm golden-amber temper variation
        WHITE_STEEL_A = (0.820, 0.845, 0.875)  # Bright lapped ordnance white steel
        WHITE_STEEL_B = (0.700, 0.735, 0.775)
        NICKEL_A = (0.830, 0.835, 0.805)       # Warm brushed nickel sheet steel
        NICKEL_B = (0.720, 0.730, 0.700)
        ALLOY_A = (0.765, 0.790, 0.820)        # Machined duralumin concentric pull-knob alloy
        ALLOY_B = (0.655, 0.682, 0.718)

        metal_materials: list[bpy.types.Material] = []

        # Base shared metal materials (calibrated for deep lustrous steel on both key & fill sides!)
        m_rust_plain = build_metal_material(
            "M_RustBlued", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.265, metalness_base=0.87,
            grain_scale=(5.0, 44.0, 44.0), grain_bump=0.024, bevel_radius=0.032,
        )
        m_straw_plain = build_metal_material(
            "M_StrawGold", STRAW_GOLD_A, STRAW_GOLD_B, roughness_base=0.24, metalness_base=0.88,
            grain_scale=(10.0, 48.0, 48.0), grain_bump=0.018, bevel_radius=0.024,
        )
        m_white_steel = build_metal_material(
            "M_WhiteSteel", WHITE_STEEL_A, WHITE_STEEL_B, roughness_base=0.24, metalness_base=0.90,
            grain_scale=(6.0, 56.0, 56.0), grain_bump=0.028, bevel_radius=0.022,
        )
        m_mag_alloy = build_metal_material(
            "M_MagAlloy", ALLOY_A, ALLOY_B, roughness_base=0.28, metalness_base=0.88,
            grain_scale=(24.0, 24.0, 24.0), grain_bump=0.018, bevel_radius=0.024,
            engrave_specs=[
                # Subtle "4821 a" serial stamp on underside of magazine base (Z_b = -0.39.. -0.45, n_axis='Z', n_sign=-1)
                {
                    "image": decals["decal_serial"],
                    "axes": ("X", "Y"),
                    "u_range": (-0.65, 0.65),
                    "v_range": (-0.36, 0.36),
                    "n_axis": "Z",
                    "n_sign": -1.0,
                    "n_thresh": 0.80,
                    "d_axis": "Z",
                    "d_range": (-0.60, -0.30),
                    "depth": 0.14,
                    "fill_srgb": (0.28, 0.31, 0.36),
                    "fill_strength": 0.62,
                    "roughness": 0.45,
                },
            ],
        )

        # Hero engraved metal materials (exact museum-scale Object-Space projections — ZERO stretching!)
        # 1. Barrel Extension: "1917" atop chamber ring (+Z_b) + 3 crisp Imperial proofs on right flank (-Y_b)!
        m_ext = build_metal_material(
            "M_BarrelExt", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.265, metalness_base=0.87,
            grain_scale=(5.0, 44.0, 44.0), grain_bump=0.022, bevel_radius=0.032,
            engrave_specs=[
                {
                    "image": decals["decal_1917"],
                    "axes": ("Y", "X"),
                    "u_range": (0.48, -0.48),
                    "v_range": (2.22, 2.86),
                    "n_axis": "Z",
                    "n_sign": 1.0,
                    "n_thresh": 0.84,
                    "d_axis": "Z",
                    "d_range": (2.98, 3.16),
                    "depth": 0.22,
                    "fill_srgb": (0.80, 0.84, 0.90),
                    "fill_strength": 0.78,
                    "roughness": 0.44,
                },
                {
                    "image": decals["decal_proofs"],
                    "axes": ("X", "Z"),
                    "u_range": (1.62, 3.28),   # Crisp row of 3 Imperial Crowned Proofs + Reichsadler
                    "v_range": (1.98, 2.58),   # 6.0 mm museum-scale crisp proofs!
                    "n_axis": "Y",
                    "n_sign": -1.0,
                    "n_thresh": 0.84,
                    "d_axis": "Y",
                    "d_range": (-1.08, -0.88),
                    "depth": 0.22,
                    "fill_srgb": (0.78, 0.82, 0.88),
                    "fill_strength": 0.76,
                    "roughness": 0.44,
                },
            ],
        )

        # 2. Front Toggle: Iconic intertwined "DWM" calligraphic scroll monogram upright across top deck (+Z_b)!
        m_ftog = build_metal_material(
            "M_FrontToggle", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.265, metalness_base=0.87,
            grain_scale=(6.0, 44.0, 44.0), grain_bump=0.020, bevel_radius=0.028,
            engrave_specs=[
                {
                    "image": decals["decal_dwm"],
                    "axes": ("Y", "X"),
                    "u_range": (0.46, -0.46),
                    "v_range": (-2.92, -1.86),
                    "n_axis": "Z",
                    "n_sign": 1.0,
                    "n_thresh": 0.86,
                    "d_axis": "Z",
                    "d_range": (0.50, 0.64),
                    "depth": 0.22,
                    "fill_srgb": (0.82, 0.86, 0.92),
                    "fill_strength": 0.80,
                    "roughness": 0.42,
                },
            ],
        )

        # 3. Extractor: Crisp museum-scale white-filled "GELADEN" ONLY on left vertical step (+Y_b)!
        m_ext_claw = build_metal_material(
            "M_Extractor", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.265, metalness_base=0.87,
            grain_scale=(10.0, 50.0, 50.0), grain_bump=0.018, bevel_radius=0.016,
            engrave_specs=[
                {
                    "image": decals["decal_geladen"],
                    "axes": ("X", "Z"),
                    "u_range": (0.34, -0.32),
                    "v_range": (0.04, 0.175),
                    "n_axis": "Y",
                    "n_sign": 1.0,
                    "n_thresh": 0.78,
                    "d_axis": "Y",
                    "d_range": (0.10, 0.20),
                    "depth": 0.14,
                    "fill_srgb": (0.92, 0.94, 0.96),
                    "fill_strength": 0.88,
                    "roughness": 0.48,
                    "metalness": 0.10,
                    "cavity_darken": 0.0,
                },
            ],
        )

        # 4. Frame: Crisp recessed "GESICHERT" in left safety pocket (+Y_b) + subtle "4821 a" serial!
        m_frame = build_metal_material(
            "M_Frame", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.27, metalness_base=0.87,
            grain_scale=(5.0, 44.0, 44.0), grain_bump=0.022, bevel_radius=0.030,
            engrave_specs=[
                {
                    "image": decals["decal_gesichert"],
                    "axes": ("X", "Z"),
                    "u_range": (-6.18, -7.68),
                    "v_range": (0.74, 1.04),
                    "n_axis": "Y",
                    "n_sign": 1.0,
                    "n_thresh": 0.82,
                    "d_axis": "Y",
                    "d_range": (0.80, 0.96),
                    "depth": 0.16,
                    "fill_srgb": (0.90, 0.92, 0.95),
                    "fill_strength": 0.82,
                    "roughness": 0.50,
                    "metalness": 0.12,
                    "cavity_darken": 0.05,
                },
                {
                    "image": decals["decal_serial"],
                    "axes": ("Y", "Z"),
                    "u_range": (0.62, -0.62),
                    "v_range": (0.58, 1.18),
                    "n_axis": "X",
                    "n_sign": 1.0,
                    "n_thresh": 0.82,
                    "d_axis": "X",
                    "d_range": (2.98, 3.16),
                    "depth": 0.16,
                    "fill_srgb": (0.76, 0.80, 0.86),
                    "fill_strength": 0.72,
                    "roughness": 0.42,
                },
            ],
        )

        # 5. Sideplate: Crisp matching "21" assembly stamp on upper-left flat of outer left face (+Y_b)!
        m_sideplate = build_metal_material(
            "M_Sideplate", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.265, metalness_base=0.87,
            grain_scale=(6.0, 44.0, 44.0), grain_bump=0.020, bevel_radius=0.026,
            engrave_specs=[
                {
                    "image": decals["decal_21"],
                    "axes": ("X", "Z"),
                    "u_range": (1.28, 0.72),
                    "v_range": (0.04, 0.52),
                    "n_axis": "Y",
                    "n_sign": 1.0,
                    "n_thresh": 0.84,
                    "d_axis": "Y",
                    "d_range": (0.10, 0.18),
                    "depth": 0.18,
                    "fill_srgb": (0.78, 0.82, 0.88),
                    "fill_strength": 0.74,
                    "roughness": 0.42,
                },
            ],
        )

        # 6. Takedown Lever: Luminous champagne-straw w/ tiny matching "21" on upper pivot hub!
        m_td_lever = build_metal_material(
            "M_TakedownLever", STRAW_GOLD_A, STRAW_GOLD_B, roughness_base=0.24, metalness_base=0.88,
            grain_scale=(12.0, 48.0, 48.0), grain_bump=0.016, bevel_radius=0.020,
            engrave_specs=[
                {
                    "image": decals["decal_21"],
                    "axes": ("X", "Z"),
                    "u_range": (0.16, -0.14),
                    "v_range": (-0.10, 0.16),
                    "n_axis": "Y",
                    "n_sign": 1.0,
                    "n_thresh": 0.82,
                    "d_axis": "Y",
                    "d_range": (0.18, 0.26),
                    "depth": 0.14,
                    "fill_srgb": (0.50, 0.38, 0.18),
                    "fill_strength": 0.50,
                    "roughness": 0.38,
                },
            ],
        )

        # 7. Brushed Nickel Sheet-Steel Magazine Tube w/ vertical insertion scuffs & subtle "P.08 / 9 m/m"!
        m_mag_nickel = build_metal_material(
            "M_MagNickel", NICKEL_A, NICKEL_B, roughness_base=0.25, metalness_base=0.90,
            grain_scale=(42.0, 42.0, 5.0), grain_bump=0.020, bevel_radius=0.022,
            engrave_specs=[
                {
                    "image": decals["decal_mag_p08"],
                    "axes": ("X", "Z"),
                    "u_range": (0.70, -0.70),
                    "v_range": (-4.95, -3.55),
                    "n_axis": "Y",
                    "n_sign": 1.0,
                    "n_thresh": 0.82,
                    "d_axis": "Y",
                    "d_range": (0.58, 0.70),
                    "depth": 0.14,
                    "fill_srgb": (0.34, 0.37, 0.41),
                    "fill_strength": 0.55,
                    "roughness": 0.44,
                },
            ],
        )

        metal_materials.extend([
            m_rust_plain, m_straw_plain, m_white_steel, m_mag_alloy,
            m_ext, m_ftog, m_ext_claw, m_frame, m_sideplate, m_td_lever, m_mag_nickel,
        ])

        # Helper to assign per-vertex-group multi-materials (e.g. straw trigger + white pin, walnut grip + blued screw!)
        def apply_vg_materials(obj: bpy.types.Object, vg_to_mat: dict[str, bpy.types.Material], default_mat: bpy.types.Material) -> None:
            obj.data.materials.clear()
            mats_list = [default_mat]
            for m in vg_to_mat.values():
                if m not in mats_list:
                    mats_list.append(m)
            for m in mats_list:
                obj.data.materials.append(m)
            vg_idx_to_mat_slot: dict[int, int] = {}
            for vg_name, m in vg_to_mat.items():
                vg = obj.vertex_groups.get(vg_name)
                if vg:
                    vg_idx_to_mat_slot[vg.index] = mats_list.index(m)
            # Map each vertex to its assigned material slot
            v_slot = [0] * len(obj.data.vertices)
            for v in obj.data.vertices:
                for g in v.groups:
                    if g.group in vg_idx_to_mat_slot and g.weight > 0.5:
                        v_slot[v.index] = vg_idx_to_mat_slot[g.group]
                        break
            for p in obj.data.polygons:
                # Majority vote of face vertices
                slots = [v_slot[vi] for vi in p.vertices]
                p.material_index = max(set(slots), key=slots.count)

        # Assign all 20 metal parts
        simple_assign = {
            "p08_barrel": m_rust_plain,
            "p08_barrel_extension": m_ext,
            "p08_breechblock": m_white_steel,
            "p08_extractor": m_ext_claw,
            "p08_front_toggle": m_ftog,
            "p08_rear_toggle": m_rust_plain,
            "p08_toggle_pins": m_white_steel,
            "p08_striker": m_white_steel,
            "p08_frame": m_frame,
            "p08_sideplate": m_sideplate,
            "p08_takedown_lever": m_td_lever,
            "p08_ejector": m_straw_plain,
            "p08_hold_open": m_white_steel,
            "p08_trigger_lever": m_white_steel,
            "p08_mag_body": m_mag_nickel,
            "p08_mag_follower": m_white_steel,
        }
        for pid, mat in simple_assign.items():
            part_objs[pid].data.materials.clear()
            part_objs[pid].data.materials.append(mat)

        apply_vg_materials(part_objs["p08_trigger"], {"straw_gold": m_straw_plain, "white_steel": m_white_steel}, m_straw_plain)
        apply_vg_materials(part_objs["p08_sear_bar"], {"rust_blued": m_rust_plain, "white_steel": m_white_steel}, m_rust_plain)
        apply_vg_materials(part_objs["p08_thumb_safety"], {"straw_gold": m_straw_plain, "white_steel": m_white_steel}, m_straw_plain)
        apply_vg_materials(part_objs["p08_mag_base"], {"mag_alloy": m_mag_alloy, "rust_blued": m_rust_plain}, m_mag_alloy)

        # Build Walnut materials (left + right + recessed blued slotted grip screw!)
        dummy_img = bpy.data.images.new("TmpWalnut", 16, 16)
        m_walnut_l = build_walnut_grip_material("M_WalnutLeft", "left", dummy_img)
        m_walnut_r = build_walnut_grip_material("M_WalnutRight", "right", dummy_img)
        m_grip_screw = build_metal_material(
            "M_GripScrewBlued", RUST_BLUE_A, RUST_BLUE_B, roughness_base=0.27, metalness_base=0.86,
            grain_scale=(20.0, 20.0, 20.0), grain_bump=0.014, bevel_radius=0.012, bake_img=dummy_img,
        )
        walnut_materials = [m_walnut_l, m_walnut_r, m_grip_screw]

        apply_vg_materials(part_objs["p08_grip_left"], {"walnut_wood": m_walnut_l, "blued_screw": m_grip_screw}, m_walnut_l)
        apply_vg_materials(part_objs["p08_grip_right"], {"walnut_wood": m_walnut_r, "blued_screw": m_grip_screw}, m_walnut_r)

        # Move ALL 22 parts to exact assembled world pose for true Cycles Contact AO baking!
        for pid, obj in part_objs.items():
            (tx, ty, tz), rot_z = ASSEMBLED_POSES[pid]
            obj.location = t2b(tx, ty, tz)
            obj.rotation_euler = Euler((0.0, -rot_z, 0.0), "XYZ")
            obj.scale = (1.0, 1.0, 1.0)
        bpy.context.view_layer.update()

        # Run 3-Pass GPU Metal Cycles Baking for BOTH 2048x2048 PBR suites!
        bake_atlas_suite(scene, walnut_objs, walnut_materials, "p08_v3_walnut", temp_dir, sys_py)
        bake_atlas_suite(scene, metal_objs, metal_materials, "p08_v3_metal", temp_dir, sys_py)

        # Optional self-inspection Cycles studio renders (while still in assembled world poses!)
        if preview_dir:
            render_cycles_preview(scene, list(part_objs.values()), preview_dir)

        # Option A Export Contract: reset ALL 22 parts to identity transform (exact local part space!)
        print("\n[EXPORT] Resetting all 22 objects to Option A identity transforms & exporting Draco GLB...")
        # Remove any preview lights/cameras if added
        for o in list(bpy.data.objects):
            if o.name not in part_objs:
                bpy.data.objects.remove(o, do_unlink=True)

        for pid, obj in part_objs.items():
            obj.location = (0.0, 0.0, 0.0)
            obj.rotation_euler = (0.0, 0.0, 0.0)
            obj.scale = (1.0, 1.0, 1.0)
            # Clear materials so GLB carries zero redundant texture/material payloads
            obj.data.materials.clear()
        bpy.context.view_layer.update()

        bpy.ops.object.select_all(action="DESELECT")
        for obj in part_objs.values():
            obj.select_set(True)

        bpy.ops.export_scene.gltf(
            filepath=str(GLB_OUT_PATH),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,
            export_materials="NONE",
            export_vertex_color="NONE",
            export_animations=False,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=12,
            export_draco_texcoord_quantization=12,
        )

    # Print final asset budget summary
    files = [
        GLB_OUT_PATH,
        TEXTURES_DIR / "p08_v3_metal_albedo.webp",
        TEXTURES_DIR / "p08_v3_metal_normal.webp",
        TEXTURES_DIR / "p08_v3_metal_roughness.webp",
        TEXTURES_DIR / "p08_v3_walnut_albedo.webp",
        TEXTURES_DIR / "p08_v3_walnut_normal.webp",
        TEXTURES_DIR / "p08_v3_walnut_roughness.webp",
    ]
    total_bytes = 0
    print("\n================ P08 V3 ASSET SUMMARY ================")
    for f in files:
        sz = f.stat().st_size
        total_bytes += sz
        print(f"  {f.relative_to(REPO_ROOT)!s:48s} {sz / 1024:8.1f} KB")
    total_mb = total_bytes / (1024 * 1024)
    print(f"  TOTAL COMBINED SIZE: {total_mb:.2f} MB (budget <= 10.00 MB)")
    print(f"  TOTAL TRIANGLES:     {total_tris:,}")
    print(f"  ELAPSED TIME:        {time.time() - t_start:.1f}s")
    print("======================================================")
    if total_mb > 10.0:
        raise RuntimeError(f"Asset budget exceeded: {total_mb:.2f} MB > 10.00 MB")


if __name__ == "__main__":
    main()
