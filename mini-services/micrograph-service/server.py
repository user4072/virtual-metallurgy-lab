#!/usr/bin/env python3
"""
micrograph-service — microstructure image generation + catalog (port 8003).

Hybrid generator:
  * diffusion path — Stable Diffusion via `diffusers`, used automatically when
    the interpreter has torch (+ CUDA) and a working diffusers install. Real
    guidance_scale / steps / seed are forwarded to the pipeline. Enable by
    running this service on an interpreter with the ML stack, e.g.:
        MICROGRAPH_PYTHON=<python with torch> python scripts/start_service.py micrograph
  * procedural path — physics-parameterized synthesis (numpy/PIL): Voronoi
    grain fields, dendrite growth, eutectic lamellae and precipitate fields
    rendered as SEM-like images. Always available, deterministic per seed,
    instant, no model downloads.

Endpoints
  GET  /micrograph/health   — capability report (torch/cuda/diffusers)
  GET  /micrograph/catalog  — merged micrograph database (real + generated)
  POST /micrograph/generate — generate one SEM-like micrograph
  POST /micrograph/save     — persist a generated image into the catalog
"""
import os
import sys
import json
import time
import math
import base64
import hashlib
import io
import importlib.util
from typing import Dict, List, Optional

import subprocess
import threading
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_DIR, "..", ".."))
GENERATED_DIR = os.path.join(REPO_ROOT, "public", "generated")
CATALOG_PATH = os.path.join(REPO_ROOT, "data", "micrographs", "catalog.json")
REF_DIR = os.path.join(REPO_ROOT, "public", "references")

os.makedirs(GENERATED_DIR, exist_ok=True)
os.makedirs(os.path.dirname(CATALOG_PATH), exist_ok=True)

# ----------------------------------------------------------------------------
# capability detection (diffusion is strictly opt-in, runs in a subprocess)
# ----------------------------------------------------------------------------
# The FastAPI service itself runs on the lightweight repo venv (numpy/PIL only).
# The diffusion path is delegated to a persistent worker subprocess on an
# interpreter that already has torch+CUDA+diffusers (MICROGRAPH_PYTHON, used
# read-only — nothing is installed into it).
ML_PYTHON = os.environ.get("MICROGRAPH_PYTHON", "py -3.12").split()
ML_ENV = {**os.environ}  # keep the caller's user-site config intact

_worker_proc = None
_worker_lock = threading.Lock()


def _probe_ml_python() -> dict:
    try:
        r = subprocess.run(
            ML_PYTHON + ["-c",
                         "import torch, diffusers, sys; print('CUDA', torch.cuda.is_available())"],
            capture_output=True, text=True, timeout=180, env=ML_ENV,
        )
        if r.returncode == 0 and "CUDA True" in r.stdout:
            return {"torch": True, "cuda": True, "diffusers": True, "device": "cuda"}
        if r.returncode == 0 and "CUDA" in r.stdout:
            return {"torch": True, "cuda": False, "diffusers": True, "device": "cpu"}
    except Exception:
        pass
    return {"torch": False, "cuda": False, "diffusers": False, "device": "cpu"}


CAPS = _probe_ml_python()
DIFFUSION_READY = CAPS["torch"] and CAPS["diffusers"] and CAPS["cuda"]


def _get_worker():
    """Spawn (once) and return the persistent diffusion worker."""
    global _worker_proc
    with _worker_lock:
        if _worker_proc is not None and _worker_proc.poll() is None:
            return _worker_proc
        worker_script = os.path.join(SERVICE_DIR, "diffusion_worker.py")
        _worker_proc = subprocess.Popen(
            ML_PYTHON + [worker_script],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding="utf-8", env=ML_ENV,
        )
        return _worker_proc


def _diffuse(req_body: dict) -> dict:
    worker = _get_worker()
    out_path = os.path.join(GENERATED_DIR, "sd_" + str(req_body["seed"]) + ".png")
    payload = {
        "seed": req_body["seed"],
        "steps": req_body["steps"],
        "guidance": req_body["guidance"],
        "size": req_body["size"],
        "prompt": req_body["prompt"],
        "magnification": req_body["magnification"],
        "out_path": out_path,
    }
    worker.stdin.write(json.dumps(payload) + "\n")
    worker.stdin.flush()
    line = worker.stdout.readline()
    if not line:
        raise RuntimeError("diffusion worker died")
    resp = json.loads(line)
    if not resp.get("ok"):
        raise RuntimeError(resp.get("error", "worker error"))
    return resp


# ----------------------------------------------------------------------------
# catalog (real references + generated entries)
# ----------------------------------------------------------------------------
def _load_catalog() -> dict:
    if os.path.exists(CATALOG_PATH):
        with open(CATALOG_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    return {"version": 1, "entries": []}


def _save_catalog(cat: dict) -> None:
    with open(CATALOG_PATH, "w", encoding="utf-8") as fh:
        json.dump(cat, fh, indent=2, ensure_ascii=False)


# ----------------------------------------------------------------------------
# procedural synthesis (physics-parameterized)
# ----------------------------------------------------------------------------

def _mulberry32(seed: int):
    rng_state = seed & 0xFFFFFFFF

    def rand():
        nonlocal rng_state
        rng_state = (rng_state + 0x6D2B79F5) & 0xFFFFFFFF
        t = rng_state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 0xFFFFFFFF

    return rand


def _voronoi_field(size: int, seeds: np.ndarray) -> np.ndarray:
    """Per-pixel index of the nearest seed → grain id field."""
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.full((size, size), np.inf)
    ids = np.zeros((size, size), dtype=np.int32)
    for i, (sx, sy) in enumerate(seeds):
        # periodic wrap for seamless-looking boundaries
        dist = np.minimum.reduce([
            (xx - sx) ** 2 + (yy - sy) ** 2,
            (xx - sx + size) ** 2 + (yy - sy) ** 2,
            (xx - sx - size) ** 2 + (yy - sy) ** 2,
        ])
        closer = dist < d
        d[closer] = dist[closer]
        ids[closer] = i
    return ids


def _grain_image(size: int, grain_size_um: float, rng) -> np.ndarray:
    """Voronoi grains with per-grain orientation shading (SEM-like)."""
    n_grains = max(6, int(round((size / (grain_size_um * 2.2)) ** 2)))
    seeds = np.array([[rng() * size, rng() * size] for _ in range(n_grains)])
    ids = _voronoi_field(size, seeds)
    # per-grain brightness/normal variation (etching response)
    level = np.array([0.45 + 0.35 * rng() for _ in range(n_grains)])
    img = level[ids]
    # grain boundary darkening: gradient magnitude of the id field
    gx = np.abs(np.diff(ids.astype(float), axis=1, prepend=ids[:, :1]))
    gy = np.abs(np.diff(ids.astype(float), axis=0, prepend=ids[:1, :]))
    boundary = np.clip((gx + gy) * 2.5, 0, 1)
    img = img * (1.0 - 0.45 * boundary)
    return img, ids, n_grains


def _dendrites(size: int, cooling_rate: float, rng) -> np.ndarray:
    """Side-branching dendrite trunks for fast-cooling cast structures."""
    img = np.zeros((size, size))
    n_trunks = max(3, int(round(10 * min(1.0, cooling_rate / 60.0))))
    n_seg = 4 + int(3 * min(1.0, cooling_rate / 60.0))
    for _ in range(n_trunks):
        x = rng() * size
        y = rng() * size * 0.2
        ang = math.pi / 2 + (rng() - 0.5) * 0.5
        trunk_w = 2 + rng() * 2
        length = size * (0.5 + rng() * 0.4)
        xx, yy = x, y
        a = ang
        for seg in range(n_seg):
            seg_len = length / n_seg
            nx = xx + math.sin(a) * seg_len
            ny = yy + math.cos(a) * seg_len
            steps = max(2, int(seg_len))
            for t in range(steps):
                px = xx + (nx - xx) * t / steps
                py = yy + (ny - yy) * t / steps
                img[int(py) % size, int(px) % size] = 1.0
            # secondary arms
            for side in (-1, 1):
                arm_a = a + side * (math.pi / 2.4 + rng() * 0.3)
                arm_len = seg_len * (0.35 + 0.3 * rng())
                ax, ay = xx, yy
                for t in range(int(arm_len)):
                    px = ax + math.sin(arm_a) * t
                    py = ay + math.cos(arm_a) * t
                    if 0 <= int(py) < size and 0 <= int(px) < size:
                        img[int(py), int(px)] = 0.9
            xx, yy = nx, ny
            a += (rng() - 0.5) * 0.25
    img = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1)))
    return img / 255.0


def _eutectic_lamellae(size: int, fraction: float, rng) -> np.ndarray:
    """Lamellar eutectic colonies in regions the lever rule says are eutectic."""
    img = np.zeros((size, size))
    n_colonies = max(2, int(round(6 * min(1.0, fraction * 3))))
    for _ in range(n_colonies):
        cx, cy = rng() * size, rng() * size
        colony_r = size * (0.12 + rng() * 0.15)
        spacing = 4 + rng() * 5
        ang = rng() * math.pi
        yy, xx = np.mgrid[0:size, 0:size]
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        mask = d < colony_r
        proj = (xx - cx) * math.cos(ang) + (yy - cy) * math.sin(ang)
        lam = 0.5 + 0.5 * np.sign(np.sin(proj / spacing))
        img[mask] = lam[mask] * (1 - d[mask] / colony_r)
    return img


def _precipitates(size: int, density: float, rng) -> np.ndarray:
    """Bright/dark precipitate dots, Orowan-style dispersion."""
    n = int(min(2500, max(0, density * size * size / 30000)))
    img = np.zeros((size, size))
    for _ in range(n):
        x, y = int(rng() * size), int(rng() * size)
        r = 1 + int(rng() * 2)
        v = 0.75 + 0.25 * rng()
        # dark ring + bright core = realistic second-phase contrast
        img[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1] = 0.35
        img[max(0, y - r + 1):y + r, max(0, x - r + 1):x + r] = v
    img = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
    return img / 255.0


def _sem_style(gray: np.ndarray, rng) -> np.ndarray:
    """Apply SEM look: noise, scanlines, vignette, gamma."""
    size = gray.shape[0]
    noise = np.random.default_rng(int(rng() * 1e9)).normal(0, 0.025, gray.shape)
    out = gray + noise
    # horizontal scanlines (SEM raster)
    rows = (np.arange(size) % 3 == 0).astype(float)[:, None]
    out = out * (1 - 0.045 * rows)
    # vignette
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    out = out * (1 - 0.18 * r ** 2)
    # gamma + contrast
    out = np.clip(out, 0, 1) ** 0.9
    return out


def _scale_bar(img: Image.Image, magnification: float) -> None:
    """Draw a scale bar + magnification label (SEM convention)."""
    draw = ImageDraw.Draw(img)
    try:
        from PIL import ImageFont
        font = ImageFont.load_default(size=13)
    except Exception:
        font = None
    w, h = img.size
    # bar length in display px: 1/8 of image width; physical length:
    # field_width_um ≈ 3000 / magnification → bar = field/8 µm
    field_um = 36000.0 / max(magnification, 1.0)  # real SEM: ~36 mm display width
    bar_um = field_um / 8.0
    nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
    bar_um = min(nice, key=lambda v: abs(v - bar_um))
    bar_px = max(24, int(w * (bar_um / field_um)))
    x1, y1 = w - bar_px - 40, h - 46
    draw.rectangle([x1, y1, x1 + bar_px, y1 + 8], fill=(255, 255, 255), outline=(0, 0, 0))
    label = f"{bar_um:g} µm | {int(magnification)}× SEI"
    draw.text((x1, y1 - 16), label, fill=(255, 255, 255),
              stroke_width=1, stroke_fill=(0, 0, 0), font=font)


def procedural_micrograph(
    alloy_system: str,
    solute_wt: float,
    solute2_wt: float,
    cooling_rate_ks: float,
    heat_treatment_c: float,
    magnification: float,
    size: int,
    seed: int,
) -> Image.Image:
    """Physics-parameterized SEM-like synthesis (deterministic per seed)."""
    rng = _mulberry32(seed)
    # effective grain size shrinks with cooling rate (solidification) — µm
    grain_size_um = max(3.0, 90.0 / (1 + 0.35 * cooling_rate_ks))
    gray, _ids, n_grains = _grain_image(size, grain_size_um, rng)

    # dendritic morphology for fast cooling cast structures
    dend = _dendrites(size, cooling_rate_ks, rng)
    dend_mix = min(0.55, cooling_rate_ks / 100.0)
    gray = gray * (1 - dend_mix) + dend * dend_mix

    # eutectic colonies near the eutectic composition
    eutectic_frac = 0.0
    if alloy_system == "Al-Cu":
        eutectic_frac = max(0.0, (solute_wt - 5.65) / (33.0 - 5.65))
    elif alloy_system == "Al-Si":
        eutectic_frac = max(0.0, (solute_wt - 1.6) / (12.6 - 1.6))
    elif alloy_system == "Fe-C":
        eutectic_frac = max(0.0, (solute_wt - 2.11) / (4.3 - 2.11))
    lam = _eutectic_lamellae(size, min(1.0, eutectic_frac), rng)
    gray = gray * (1 - 0.45 * min(1.0, eutectic_frac)) + lam * 0.45 * min(1.0, eutectic_frac)

    # precipitates from ageing (density ~ composition × ageing response)
    ppt_density = max(0.0, (solute_wt - 1.0)) * math.exp(-abs(heat_treatment_c - 190) / 220) * 260
    ppt = _precipitates(size, ppt_density, rng)
    gray = gray + 0.35 * (ppt - 0.5)

    gray = _sem_style(np.clip(gray, 0, 1), rng)
    img = Image.fromarray((gray * 255).astype(np.uint8), mode="L").convert("RGB")
    _scale_bar(img, magnification)
    return img


# ----------------------------------------------------------------------------
# API
# ----------------------------------------------------------------------------
app = FastAPI(title="micrograph service — Virtual Metallurgy Lab")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    alloySystem: str = "Al-Cu"
    soluteWtPct: float = 4.0
    solute2WtPct: float = 0.0
    coolingRateKs: float = 8.0
    heatTreatmentC: float = 190.0
    magnification: float = 2500.0
    guidanceScale: float = 7.5
    diffusionSteps: int = 30
    seed: Optional[int] = None
    size: int = 512


class SaveRequest(BaseModel):
    filename: str
    alloySystem: str
    soluteWtPct: float
    coolingRateKs: float
    heatTreatmentC: float
    magnification: float
    technique: str = "Procedural-SEM"
    caption: str = ""


@app.get("/micrograph/health")
def health():
    return {
        "ok": True,
        "capabilities": {
            **CAPS,
            "diffusion": DIFFUSION_READY,
            "procedural": True,
            "how_to_enable_diffusion": (
                "Run this service on an interpreter with torch+CUDA+diffusers "
                "(env MICROGRAPH_PYTHON=<python>) — no code changes needed."
            ),
        },
        "catalog": _load_catalog().get("version", 0),
    }


@app.get("/micrograph/catalog")
def catalog():
    cat = _load_catalog()
    return {"ok": True, **cat}


@app.post("/micrograph/generate")
def generate(req: GenerateRequest):
    t0 = time.time()
    seed = req.seed if req.seed is not None else int(time.time() * 1000) & 0x7FFFFFFF
    size = int(min(max(req.size, 256), 768))
    # round to a multiple of 8 (SD latent requirement)
    size = (size // 8) * 8

    if DIFFUSION_READY and req.diffusionSteps > 0:
        try:
            prompt = (
                f"scanning electron microscope micrograph of {req.alloySystem} alloy, "
                f"{req.soluteWtPct:.1f} wt% solute, "
                f"{'fine dendritic' if req.coolingRateKs > 20 else 'equiaxed grain'} structure, "
                f"precipitates after ageing at {req.heatTreatmentC:.0f} C, "
                f"high detail, grayscale, scientific"
            )
            resp = _diffuse({
                "seed": seed,
                "steps": req.diffusionSteps,
                "guidance": req.guidanceScale,
                "size": size,
                "prompt": prompt,
                "magnification": req.magnification,
            })
            with open(resp["out_path"], "rb") as fh:
                image_b64 = base64.b64encode(fh.read()).decode()
            import shutil
            try:
                shutil.copyfile(resp["out_path"], os.path.join(GENERATED_DIR, f"gen_{seed}.png"))
            except Exception:
                pass
            return {
                "ok": True,
                "backend": "diffusion",
                "model": os.environ.get("MICROGRAPH_MODEL", "runwayml/stable-diffusion-v1-5"),
                "seed": seed,
                "steps": req.diffusionSteps,
                "guidanceScale": req.guidanceScale,
                "imageB64": image_b64,
                "inferenceMs": round((time.time() - t0) * 1000),
            }
        except Exception as exc:
            # fall through to procedural on any diffusion failure
            print(f"[micrograph] diffusion failed, falling back: {exc}", file=sys.stderr)

    img = procedural_micrograph(
        req.alloySystem, req.soluteWtPct, req.solute2WtPct,
        req.coolingRateKs, req.heatTreatmentC, req.magnification, size, seed,
    )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    # persist for the save-to-catalog flow (stable filename per seed)
    try:
        with open(os.path.join(GENERATED_DIR, f"gen_{seed}.png"), "wb") as fh:
            fh.write(buf.getvalue())
    except Exception as exc:
        print(f"[micrograph] could not persist render: {exc}", file=sys.stderr)
    return {
        "ok": True,
        "backend": "procedural",
        "model": "physics-parameterized synthesis (Voronoi grains + dendrites + eutectic + precipitates)",
        "seed": seed,
        "steps": 0,
        "guidanceScale": 0,
        "imageB64": base64.b64encode(buf.getvalue()).decode(),
        "inferenceMs": round((time.time() - t0) * 1000),
    }


@app.post("/micrograph/save")
def save(req: SaveRequest):
    path = os.path.join(GENERATED_DIR, os.path.basename(req.filename))
    if not os.path.exists(path):
        return {"ok": False, "error": "unknown filename"}
    cat = _load_catalog()
    digest = hashlib.sha256(open(path, "rb").read()).hexdigest()[:12]
    entry = {
        "id": f"gen-{digest}",
        "file": f"/generated/{os.path.basename(req.filename)}",
        "source": "VML procedural/diffusion generator",
        "sourcePage": "",
        "author": "Virtual Metallurgy Lab",
        "license": "Generated (MIT, same as code)",
        "caption": req.caption or f"Generated {req.alloySystem} micrograph at {req.soluteWtPct:.1f} wt% solute, {req.coolingRateKs:.0f} K/s, aged {req.heatTreatmentC:.0f} °C",
        "alloy": req.alloySystem,
        "system": req.alloySystem,
        "technique": req.technique,
        "magnification": f"{int(req.magnification)}×",
        "category": "generated",
        "origin": "generated",
        "width": 512, "height": 512,
        "year": "",
    }
    cat["entries"] = [e for e in cat.get("entries", []) if e.get("id") != entry["id"]]
    cat["entries"].append(entry)
    _save_catalog(cat)
    return {"ok": True, "entry": entry, "total": len(cat["entries"])}


if __name__ == "__main__":
    print("capabilities:", CAPS, "| diffusion:", DIFFUSION_READY, file=sys.stderr)
    port = int(os.environ.get("MICROGRAPH_PORT", "8003"))
    uvicorn.run(app, host="127.0.0.1", port=port)
