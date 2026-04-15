"""
image_gen.py — Generate manhwa-style images via ComfyUI local API.

Requirements
────────────
- ComfyUI running at http://localhost:8188
- A checkpoint in ComfyUI/models/checkpoints/
  Recommended free models:
    • anything-v5.safetensors  (anime/manhwa, great for characters)
    • dreamshaper_8.safetensors (versatile, photorealistic + stylized)
    • meinamix_meinaV11.safetensors (manhwa-specific)

Usage
─────
    from modules.image_gen import generate_image
    from pathlib import Path

    path = generate_image(
        prompt="young woman standing on rooftop, Seoul city lights background",
        output_path=Path("output/scene_001.png"),
        character_descriptions={"YUNA": "long black hair, gray eyes, school uniform"},
    )
"""

from __future__ import annotations

import json
import random
import time
import uuid
from pathlib import Path

import requests

# ── Style tags injected into every prompt ─────────────────────────────────────
_STYLE_TAGS = (
    "manhwa style, korean webtoon art, clean lineart, vibrant colors, "
    "detailed, high quality, cinematic lighting, dynamic composition"
)

_NEGATIVE_TAGS = (
    "lowres, bad anatomy, bad hands, missing fingers, extra limbs, "
    "worst quality, low quality, blurry, watermark, signature, text, "
    "ugly, duplicate, deformed, jpeg artifacts"
)


# ── ComfyUI workflow builder ──────────────────────────────────────────────────

def _build_workflow(
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    steps: int,
    cfg: float,
    seed: int,
    checkpoint: str,
) -> dict:
    """Return a minimal ComfyUI workflow dict for SD1.5 / SDXL checkpoints."""
    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint},
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"batch_size": 1, "height": height, "width": width},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": f"{_STYLE_TAGS}, {prompt}",
            },
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["4", 1],
                "text": f"{_NEGATIVE_TAGS}, {negative_prompt}",
            },
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": cfg,
                "denoise": 1,
                "latent_image": ["5", 0],
                "model": ["4", 0],
                "negative": ["7", 0],
                "positive": ["6", 0],
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "seed": seed,
                "steps": steps,
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "manhwa", "images": ["8", 0]},
        },
    }


# ── Public API ────────────────────────────────────────────────────────────────

def generate_image(
    prompt: str,
    output_path: Path,
    character_descriptions: dict[str, str] | None = None,
    negative_prompt: str = "",
    width: int = 720,
    height: int = 1280,
    steps: int = 25,
    cfg: float = 7.0,
    seed: int = -1,
    checkpoint: str = "anything-v5.safetensors",
    comfyui_url: str = "http://localhost:8188",
    poll_interval: float = 2.0,
) -> Path:
    """
    Generate a single manhwa-style image via ComfyUI and save it to output_path.

    Character descriptions are prepended to the prompt so the model knows
    what each character looks like. Pass the descriptions of characters that
    actually appear in this scene.

    Returns the path to the saved PNG.
    """
    if seed == -1:
        seed = random.randint(0, 2**32 - 1)

    # Build final prompt: character appearances + scene background
    full_prompt = prompt
    if character_descriptions:
        char_part = ", ".join(
            f"{desc}" for desc in character_descriptions.values()
        )
        full_prompt = f"{char_part}, {prompt}"

    workflow = _build_workflow(
        prompt=full_prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        steps=steps,
        cfg=cfg,
        seed=seed,
        checkpoint=checkpoint,
    )

    client_id = str(uuid.uuid4())

    # ── Queue the prompt ──────────────────────────────────────────────────────
    resp = requests.post(
        f"{comfyui_url}/prompt",
        json={"prompt": workflow, "client_id": client_id},
        timeout=30,
    )
    resp.raise_for_status()
    prompt_id: str = resp.json()["prompt_id"]
    print(f"    Queued [{prompt_id[:8]}] seed={seed}")

    # ── Poll history until done ───────────────────────────────────────────────
    while True:
        history_resp = requests.get(
            f"{comfyui_url}/history/{prompt_id}", timeout=10
        )
        history = history_resp.json()
        if prompt_id in history:
            outputs = history[prompt_id]["outputs"]
            break
        time.sleep(poll_interval)

    # ── Download the generated image ──────────────────────────────────────────
    image_info = next(
        img
        for node_output in outputs.values()
        for img in node_output.get("images", [])
    )

    img_resp = requests.get(
        f"{comfyui_url}/view",
        params={
            "filename": image_info["filename"],
            "subfolder": image_info.get("subfolder", ""),
            "type": image_info["type"],
        },
        timeout=60,
    )
    img_resp.raise_for_status()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(img_resp.content)
    return output_path


def check_comfyui(comfyui_url: str = "http://localhost:8188") -> bool:
    """Return True if ComfyUI is reachable."""
    try:
        requests.get(f"{comfyui_url}/system_stats", timeout=5)
        return True
    except requests.exceptions.ConnectionError:
        return False
