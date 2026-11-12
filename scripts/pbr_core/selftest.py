"""Quick correctness and 2048x1024 timing checks: python3 -m scripts.pbr_core.selftest."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

import cv2
import numpy as np
import PIL
import scipy
from PIL import Image

from scripts import pbr_core as core


def check_field(value: np.ndarray, shape: tuple[int, int], low: float, high: float) -> None:
    assert isinstance(value, np.ndarray) and value.shape == shape, (value.shape, shape)
    assert value.dtype == np.float32, value.dtype
    assert np.isfinite(value).all()
    assert float(value.min()) >= low and float(value.max()) <= high


def check_geometry() -> None:
    shape = (63, 95)
    u = np.arange(shape[1], dtype=np.float32)[None, :] / shape[1]
    v = np.arange(shape[0], dtype=np.float32)[:, None] / shape[0]
    ramp = np.broadcast_to(u, shape).copy()
    original = ramp.copy()
    cases = (
        (lambda: core.smoothstep(0.2, 0.8, ramp), 0, 1),
        (lambda: core.fbm_noise(*shape), -1, 1),
        (lambda: core.worley_cellular(*shape), 0, 1),
        (lambda: core.laser_stipple_field(*shape), -1, 1),
        (lambda: core.diamond_knurl(u, v), -1, 1),
        (lambda: core.chipped_edge_wear(ramp), 0, 1),
        (lambda: core.scratch_field(*shape, mask=ramp), 0, 1),
        (lambda: core.cnc_toolpath(*shape), -1, 1),
        (lambda: core.bevel_mask(ramp), 0, 1),
        (lambda: core.compute_height_ao(ramp), 0.18, 1),
        (lambda: core.compute_convexity(ramp), 0, 1),
    )
    for call, low, high in cases:
        first, repeat = call(), call()
        first = first if isinstance(first, tuple) else (first,)
        repeat = repeat if isinstance(repeat, tuple) else (repeat,)
        for a, b in zip(first, repeat):
            check_field(a, shape, low, high)
            np.testing.assert_array_equal(a, b)
    np.testing.assert_array_equal(ramp, original)
    np.testing.assert_allclose(core.smoothstep(0, 1, np.array([-1, 0, 0.5, 1, 2])), [0, 0, 0.5, 1, 1])
    np.testing.assert_array_equal(core.smoothstep(0.5, 0.5, np.array([0, 1])), [0, 1])
    assert not np.array_equal(core.fbm_noise(*shape, seed=1), core.fbm_noise(*shape, seed=2))

    # Compare exact Euclidean distances against every site on a periodic tile.
    h, w, cy, cx, seed = 13, 19, 3, 4, 31
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    yy *= cy / h
    xx *= cx / w
    for jitter in (0.0, 0.85, 1.0):
        sites = 0.5 + (np.random.default_rng(seed).random((cy, cx, 2), dtype=np.float32) - 0.5) * jitter
        sites += np.stack(np.meshgrid(np.arange(cy), np.arange(cx), indexing="ij"), axis=-1)
        tiled = np.concatenate([
            (sites + (dy * cy, dx * cx)).reshape(-1, 2)
            for dy in (-1, 0, 1) for dx in (-1, 0, 1)
        ])
        distances = np.sqrt((yy[..., None] - tiled[:, 0]) ** 2 + (xx[..., None] - tiled[:, 1]) ** 2)
        distances.sort(axis=-1)
        first, edge = core.worley_cellular(h, w, cy, cx, jitter, seed)
        np.testing.assert_allclose(first, distances[..., 0] / np.sqrt(2), atol=5e-7)
        np.testing.assert_allclose(edge, (distances[..., 1] - distances[..., 0]) / np.sqrt(2), atol=5e-7)
        large = core.worley_cellular(h * 2, w * 2, cy, cx, jitter, seed)
        np.testing.assert_allclose(first, large[0][::2, ::2], atol=5e-7)
        np.testing.assert_allclose(edge, large[1][::2, ::2], atol=5e-7)

    # An isolated crater has a recessed floor and a positive annular lip.
    crater = core.laser_stipple_field(96, 96, 1, 1)
    assert crater.min() < -0.8 and crater.max() > 0.35
    pyramids = core.diamond_knurl(np.array([[0, 0.25, 0.5]], np.float32), np.zeros((1, 1), np.float32), 1, 1)
    np.testing.assert_allclose(pyramids, [[-1, 0, 1]])

    mask = np.zeros(shape, np.float32)
    mask[8:-8, 8:-8] = 1
    mask[7, 12:-12] = 0.3
    bevel = core.bevel_mask(mask, 5)
    assert bevel[7, 30] > 0 and bevel[8, 30] < bevel[9, 30] < bevel[20, 30] == 1
    assert np.all(bevel[mask == 0] == 0)
    for profile in ("linear", "round", "smooth"):
        check_field(core.bevel_mask(mask, 5, profile), shape, 0, 1)
    assert np.all(core.bevel_mask(np.zeros(shape, np.float32)) == 0)
    assert core.bevel_mask(np.ones(shape, np.float32))[31, 47] == 1

    for bare, halo in (core.chipped_edge_wear(ramp, wear_amount=0), core.chipped_edge_wear(np.zeros(shape, np.float32))):
        assert not bare.any() and not halo.any()
    low, _ = core.chipped_edge_wear(ramp, wear_amount=0.4)
    high, halo = core.chipped_edge_wear(ramp, wear_amount=0.8)
    assert np.all(high >= low) and np.any(high == 1) and halo.any()
    assert not core.scratch_field(*shape, count=0).any()
    assert not core.scratch_field(*shape, mask=np.zeros(shape, np.float32)).any()
    scratches = core.scratch_field(*shape, mask=mask)
    assert scratches.any() and np.all(scratches[mask == 0] == 0)
    single = core.scratch_field(64, 96, count=1, min_len=40, max_len=40, angle_spread=0, seed=2)
    profile = single.sum(axis=0)
    support = np.flatnonzero(profile)
    assert profile[support[0]] < profile.max() * 0.3
    assert profile[support[-1]] < profile.max() * 0.3

    flat = np.zeros(shape, np.float32)
    assert np.all(core.compute_height_ao(flat) == 1)
    assert not core.compute_convexity(flat).any()
    pit = np.zeros(shape, np.float32)
    pit[25:38, 40:55] = -3
    ao = core.compute_height_ao(pit)
    assert ao[30, 42] < 0.95 and ao[3, 3] == 1
    assert np.all(core.compute_height_ao(pit, strength=0) == 1)
    convex = core.compute_convexity(-pit)
    assert convex[25:38, 40:55].max() > 0.9
    assert not convex[2:8, 2:8].any()
    for angle in (0, 90):
        tool = core.cnc_toolpath(*shape, angle_deg=angle)
        row_change, col_change = tool.mean(axis=1).std(), tool.mean(axis=0).std()
        assert row_change > col_change * 5 if angle == 0 else col_change > row_change * 5

    # Degenerate image axes, non-square cells and transposed input views.
    for small in ((1, 1), (1, 9), (9, 1)):
        field = np.zeros(small, np.float32)
        check_field(core.fbm_noise(*small), small, -1, 1)
        for value in core.worley_cellular(*small, cells_y=2, cells_x=3):
            check_field(value, small, 0, 1)
        check_field(core.compute_height_ao(field), small, 0.18, 1)
        check_field(core.compute_convexity(field), small, 0, 1)
    check_field(core.bevel_mask(mask.T), shape[::-1], 0, 1)


def check_legacy_and_encoding() -> None:
    assert core.height_to_normal_png is core.height_to_normal_map
    assert core.save_rgb_png is core.save_rgb_map
    assert core.save_gray_png is core.save_gray_map
    assert core.save_orm_png is core.save_orm_map
    assert core.PROJECT_ROOT.is_dir() and isinstance(core.OUT_DIR, str)
    assert core.DEFAULT_FONT_CANDIDATES and core.MONO_FONT_CANDIDATES
    for args in ((12,), ("/missing/font.ttf", 12), ([], 12)):
        assert core.load_font(*args) is not None
    for field in (
        core.spectral_noise(32, 48, 3, 12, 1),
        core.micro_grain(32, 48, 1, center_freq=12, band_sigma=4, highpass=6),
    ):
        assert field.shape == (32, 48) and field.dtype == np.float32
        np.testing.assert_allclose(field.std(), 1, atol=1e-5)
    check_field(core.seamless_band_noise(32, 48, 2, 12, 1), (32, 48), -1, 1)
    image = Image.new("RGB", (16, 16), (40, 130, 220))
    with patch.dict(os.environ, {"PBR_OUTPUT_FORMAT": "webp"}):
        for kind, quality in (("normal", 95), ("orm", 94), ("albedo", 92), ("roughness", 92), ("unknown", 88)):
            with patch.object(Image.Image, "save") as save:
                assert core.save_pil_channel(image, "check.png", kind) == "check.webp"
                save.assert_called_once_with("check.webp", "WEBP", quality=quality, method=4)
        with tempfile.TemporaryDirectory(prefix="pbr-core-") as tmp:
            path = core.save_pil_channel(image, str(Path(tmp) / "check.png"))
            with Image.open(path) as saved:
                assert saved.format == "WEBP" and saved.size == (16, 16)

    with tempfile.TemporaryDirectory(prefix="pbr-core-") as tmp, patch.dict(os.environ, {"PBR_OUTPUT_FORMAT": "png"}):
        out = Path(tmp)
        channels = [np.full((8, 8), value, np.float32) for value in (-0.2, 0.5, 1.2)]
        with patch.object(core, "save_pil_channel", wraps=core.save_pil_channel) as save:
            path = core.save_orm_map(*channels, str(out / "packed.webp"))
            assert save.call_args.kwargs == {"channel_kind": "orm"}
        with Image.open(path) as packed:
            assert packed.format == "PNG" and packed.mode == "RGB"
            np.testing.assert_array_equal(np.asarray(packed)[0, 0], [0, 127, 255])
        rgb = np.stack([np.clip(c, 0, 1) for c in channels], axis=-1)
        rgb_path = core.save_rgb_png(rgb, str(out / "albedo.png"))
        gray_path = core.save_gray_png(channels[1], str(out / "roughness.png"))
        with Image.open(rgb_path) as saved:
            np.testing.assert_array_equal(np.asarray(saved), (rgb * 255).astype(np.uint8))
        with Image.open(gray_path) as saved:
            assert saved.mode == "L" and np.asarray(saved)[0, 0] == 127
        slope = np.broadcast_to(np.arange(8, dtype=np.float32), (8, 8))
        for seamless in (False, True):
            path = core.height_to_normal_png(slope, 1, str(out / "normal.png"), seamless)
            with Image.open(path) as saved:
                normal = np.asarray(saved)
                assert normal[3, 3, 0] < 127 and normal[3, 3, 1] == 127 and normal[3, 3, 2] > 127
                if seamless:
                    assert normal[3, 0, 0] > 127


def benchmark() -> None:
    h, w = 1024, 2048
    u = np.arange(w, dtype=np.float32)[None, :] / w
    v = np.arange(h, dtype=np.float32)[:, None] / h
    height = (np.sin(u * 120) + np.cos(v * 80)).astype(np.float32)
    mask = np.zeros((h, w), np.float32)
    mask[80:-80, 80:-80] = 1
    proximity = np.broadcast_to(1 - np.abs(u * 2 - 1), (h, w))
    cases = {
        "smoothstep": (lambda: core.smoothstep(0.2, 0.8, height), 0, 1),
        "fbm_noise": (lambda: core.fbm_noise(h, w), -1, 1),
        "worley_cellular": (lambda: core.worley_cellular(h, w), 0, 1),
        "laser_stipple_field": (lambda: core.laser_stipple_field(h, w), -1, 1),
        "diamond_knurl": (lambda: core.diamond_knurl(u, v), -1, 1),
        "chipped_edge_wear": (lambda: core.chipped_edge_wear(proximity), 0, 1),
        "scratch_field": (lambda: core.scratch_field(h, w), 0, 1),
        "cnc_toolpath": (lambda: core.cnc_toolpath(h, w), -1, 1),
        "bevel_mask": (lambda: core.bevel_mask(mask), 0, 1),
        "compute_height_ao": (lambda: core.compute_height_ao(height), 0.18, 1),
        "compute_convexity": (lambda: core.compute_convexity(height), 0, 1),
    }
    for name, (call, low, high) in cases.items():
        times = []
        for _ in range(3):
            start = perf_counter()
            result = call()
            times.append(perf_counter() - start)
            arrays = result if isinstance(result, tuple) else (result,)
            for array in arrays:
                check_field(array, (h, w), low, high)
        worst = max(times)
        print(f"  {name:22s} {worst:.4f}s (slowest of 3)", flush=True)
        assert worst < 0.4, f"{name}: {worst:.4f}s exceeds the 0.4s budget"


if __name__ == "__main__":
    print(f"NumPy {np.__version__}, SciPy {scipy.__version__}, OpenCV {cv2.__version__}, Pillow {PIL.__version__}")
    check_geometry()
    check_legacy_and_encoding()
    print("Correctness, determinism, legacy API and encoding: PASS\n2048x1024 kernel timings:", flush=True)
    benchmark()
    print("All PBR core checks passed.")
