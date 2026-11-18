#!/usr/bin/env python3
"""
diffusion_worker.py — persistent Stable Diffusion worker (line-JSON protocol).

Runs on an interpreter that has torch (+CUDA) and a working diffusers install —
typically the developer's global Python (used read-only; nothing is installed
or modified). The micrograph service spawns it once and communicates over
stdin/stdout:

  request : {"seed": int, "steps": int, "guidance": float, "size": int,
             "prompt": str, "magnification": float, "out_path": str}
  response: {"ok": true, "out_path": ..., "ms": int}  or  {"ok": false, "error": ...}

The pipeline loads lazily on the first request and stays warm in memory.
"""
import os
import sys
import json
import time
import base64

def main() -> int:
    # The interpreter needs its user-site (PYTHONPATH) — do NOT strip env here.
    pipe = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            import torch
            from PIL import Image, ImageDraw
            from diffusers import StableDiffusionPipeline

            t0 = time.time()
            if pipe is None:
                model_id = os.environ.get(
                    "MICROGRAPH_MODEL", "runwayml/stable-diffusion-v1-5"
                )
                p = StableDiffusionPipeline.from_pretrained(
                    model_id, torch_dtype=torch.float16, safety_checker=None
                )
                pipe = p.to("cuda")
                pipe.enable_attention_slicing()

            gen = torch.Generator("cuda").manual_seed(int(req["seed"]))
            img = pipe(
                req["prompt"],
                num_inference_steps=int(req["steps"]),
                guidance_scale=float(req["guidance"]),
                generator=gen,
                height=int(req["size"]),
                width=int(req["size"]),
            ).images[0]

            # scale bar (SEM convention)
            draw = ImageDraw.Draw(img)
            w, h = img.size
            field_um = 3000.0 / max(float(req["magnification"]), 1.0)
            bar_um = field_um / 8.0
            nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
            bar_um = min(nice, key=lambda v: abs(v - bar_um))
            bar_px = max(24, int(w * (bar_um / field_um)))
            x1, y1 = w - bar_px - 40, h - 46
            draw.rectangle([x1, y1, x1 + bar_px, y1 + 8], fill=255, outline=0)
            draw.text((x1, y1 - 16), f"{bar_um:g} µm | {int(req['magnification'])}× SEI", fill=255)

            out_path = req["out_path"]
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            img.save(out_path, format="PNG")
            print(json.dumps({"ok": True, "out_path": out_path,
                              "ms": int((time.time() - t0) * 1000)}), flush=True)
        except Exception as exc:
            print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}),
                  flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
