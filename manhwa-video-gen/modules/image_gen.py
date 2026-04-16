"""
image_gen.py — Generación de imágenes manhwa con múltiples backends.

Backends disponibles
────────────────────
  placeholder   → panel oscuro estilizado (sin internet, instantáneo)
  pollinations  → Pollinations.AI FLUX gratuito (sin API key)
  huggingface   → HuggingFace Inference API (gratis con HF_TOKEN)
  gemini        → Google Gemini Imagen 3 (requiere GEMINI_API_KEY)
  comfyui       → ComfyUI local (requiere GPU + ComfyUI corriendo)

Uso
───
    from modules.image_gen import generate_image
    path = generate_image(
        prompt="cyberpunk detective in neon city",
        output_path=Path("output/scene_001.png"),
        backend="pollinations",   # o "huggingface", "gemini", "comfyui"
    )
"""

from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

# Importar config para estilos (fallback si no está disponible)
try:
    sys.path.insert(0, str(Path(__file__).parent.parent))
    import config as _cfg
    _STYLES = _cfg.STYLES
    _DEFAULT_STYLE = _cfg.DEFAULT_STYLE
except Exception:
    _STYLES = {
        "manhwa": {
            "img_suffix": "manhwa style, korean webtoon art, clean lineart, vibrant colors, cinematic lighting",
            "negative": "lowres, bad anatomy, blurry, watermark",
        }
    }
    _DEFAULT_STYLE = "manhwa"

_NEGATIVE_TAGS_BASE = (
    "lowres, bad anatomy, bad hands, missing fingers, extra limbs, "
    "worst quality, low quality, blurry, watermark, signature, text, "
    "ugly, duplicate, deformed"
)


def _get_style_tags(style: str) -> tuple[str, str]:
    """Devuelve (prompt_suffix, negative) para el estilo dado."""
    style_data = _STYLES.get(style, _STYLES.get(_DEFAULT_STYLE, {}))
    suffix = style_data.get("img_suffix", "")
    negative = f"{_NEGATIVE_TAGS_BASE}, {style_data.get('negative', '')}"
    return suffix, negative


# ── Router principal ──────────────────────────────────────────────────────────

def generate_image(
    prompt: str,
    output_path: Path,
    backend: str = "pollinations",
    style: str = "manhwa",
    character_descriptions: dict[str, str] | None = None,
    width: int = 720,
    height: int = 1280,
    **kwargs,
) -> Path:
    """
    Genera una imagen con el estilo y backend elegidos.
    Hace fallback a placeholder si el backend falla.
    """
    style_suffix, negative = _get_style_tags(style)

    # Construir prompt completo con personajes + estilo
    parts = [prompt]
    if character_descriptions:
        parts.insert(0, ", ".join(character_descriptions.values()))
    if style_suffix:
        parts.append(style_suffix)
    full_prompt = ", ".join(p for p in parts if p)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        if backend == "pollinations":
            return _generate_pollinations(full_prompt, output_path, width, height)
        elif backend == "huggingface":
            return _generate_huggingface(full_prompt, output_path, width, height)
        elif backend == "gemini":
            return _generate_gemini(full_prompt, output_path, width, height)
        elif backend == "comfyui":
            return _generate_comfyui(full_prompt, output_path, width, height, **kwargs)
        else:
            # placeholder — caller (main.py) ya lo creó con _make_placeholder_image
            return output_path
    except Exception as exc:
        print(f"    [IMG] {backend} falló: {exc} — usando placeholder")
        _fallback_placeholder(output_path, width, height)
        return output_path


# ── Pollinations.AI (gratis, sin API key) ─────────────────────────────────────

def _generate_pollinations(
    prompt: str,
    output_path: Path,
    width: int,
    height: int,
) -> Path:
    """
    Genera imagen via Pollinations.AI FLUX model.
    Completamente gratis, sin autenticación, requiere internet.
    """
    import requests  # type: ignore

    encoded = urllib.parse.quote(f"{_STYLE_TAGS}, {prompt}")
    seed    = random.randint(0, 999999)
    url     = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&model=flux&nologo=true&seed={seed}"
    )
    print(f"    [Pollinations] generando ({width}×{height})…")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    output_path.write_bytes(resp.content)
    print(f"    [Pollinations] ✓ {output_path.name} ({len(resp.content)//1024} KB)")
    return output_path


# ── HuggingFace Inference API (gratis con token) ──────────────────────────────

_HF_MODELS = [
    "ogkalu/comic-diffusion",                      # estilo cómic/manhwa
    "stabilityai/stable-diffusion-xl-base-1.0",    # SDXL genérico
    "runwayml/stable-diffusion-v1-5",              # SD 1.5 fallback
]

def _generate_huggingface(
    prompt: str,
    output_path: Path,
    width: int,
    height: int,
) -> Path:
    import requests  # type: ignore

    token = os.environ.get("HF_API_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    payload = {
        "inputs": f"{_STYLE_TAGS}, {prompt}",
        "parameters": {
            "negative_prompt": _NEGATIVE_TAGS,
            "width": min(width, 1024),
            "height": min(height, 1024),
        },
    }

    for model in _HF_MODELS:
        url = f"https://api-inference.huggingface.co/models/{model}"
        print(f"    [HuggingFace] {model}…")
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=90)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image"):
                output_path.write_bytes(resp.content)
                print(f"    [HuggingFace] ✓ {output_path.name}")
                return output_path
            elif resp.status_code == 503:
                print(f"    [HuggingFace] modelo cargando, esperando 20s…")
                time.sleep(20)
                # retry
                resp = requests.post(url, headers=headers, json=payload, timeout=90)
                if resp.status_code == 200:
                    output_path.write_bytes(resp.content)
                    return output_path
        except Exception as exc:
            print(f"    [HuggingFace] {model} error: {exc}")
            continue

    raise RuntimeError("HuggingFace: todos los modelos fallaron")


# ── Gemini Imagen (requiere GEMINI_API_KEY + billing) ─────────────────────────

def _generate_gemini(
    prompt: str,
    output_path: Path,
    width: int,
    height: int,
) -> Path:
    import google.generativeai as genai  # type: ignore

    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY no configurada")

    genai.configure(api_key=key)
    print(f"    [Gemini Imagen] generando…")

    # Intentar Imagen 3
    try:
        model = genai.ImageGenerationModel("imagen-3.0-generate-001")
        result = model.generate_images(
            prompt=f"{_STYLE_TAGS}, {prompt}",
            number_of_images=1,
            aspect_ratio="9:16",
        )
        result.images[0].save(str(output_path))
        print(f"    [Gemini Imagen3] ✓ {output_path.name}")
        return output_path
    except Exception as exc:
        print(f"    [Gemini Imagen3] falló ({exc}), intentando Flash…")

    # Fallback: gemini-2.0-flash-exp con modalidad imagen
    model = genai.GenerativeModel("gemini-2.0-flash-exp")
    response = model.generate_content(
        f"Draw a manhwa-style illustration for this scene: {prompt}. "
        "Style: korean webtoon, clean lines, vibrant colors.",
        generation_config={"response_modalities": ["IMAGE"]},
    )
    for part in response.candidates[0].content.parts:
        if hasattr(part, "inline_data") and part.inline_data.mime_type.startswith("image/"):
            output_path.write_bytes(part.inline_data.data)
            print(f"    [Gemini Flash] ✓ {output_path.name}")
            return output_path

    raise RuntimeError("Gemini: no se generó ninguna imagen")


# ── ComfyUI (local, requiere GPU) ─────────────────────────────────────────────

def _generate_comfyui(
    prompt: str,
    output_path: Path,
    width: int,
    height: int,
    steps: int = 25,
    cfg: float = 7.0,
    seed: int = -1,
    checkpoint: str = "anything-v5.safetensors",
    comfyui_url: str = "http://localhost:8188",
    poll_interval: float = 2.0,
) -> Path:
    import requests  # type: ignore

    if seed == -1:
        seed = random.randint(0, 2**32 - 1)

    workflow = {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"batch_size": 1, "height": height, "width": width}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": f"{_STYLE_TAGS}, {prompt}"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": _NEGATIVE_TAGS}},
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": cfg, "denoise": 1, "latent_image": ["5", 0],
                "model": ["4", 0], "negative": ["7", 0], "positive": ["6", 0],
                "sampler_name": "euler_ancestral", "scheduler": "normal",
                "seed": seed, "steps": steps,
            },
        },
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "manhwa", "images": ["8", 0]}},
    }

    client_id = str(uuid.uuid4())
    resp = requests.post(f"{comfyui_url}/prompt", json={"prompt": workflow, "client_id": client_id}, timeout=30)
    resp.raise_for_status()
    prompt_id = resp.json()["prompt_id"]

    while True:
        history = requests.get(f"{comfyui_url}/history/{prompt_id}", timeout=10).json()
        if prompt_id in history:
            outputs = history[prompt_id]["outputs"]
            break
        time.sleep(poll_interval)

    image_info = next(
        img for node_output in outputs.values() for img in node_output.get("images", [])
    )
    img_resp = requests.get(
        f"{comfyui_url}/view",
        params={"filename": image_info["filename"], "subfolder": image_info.get("subfolder", ""), "type": image_info["type"]},
        timeout=60,
    )
    img_resp.raise_for_status()
    output_path.write_bytes(img_resp.content)
    return output_path


# ── Fallback placeholder mínimo ───────────────────────────────────────────────

def _fallback_placeholder(output_path: Path, width: int, height: int) -> None:
    try:
        from PIL import Image
        Image.new("RGB", (width, height), (10, 10, 20)).save(output_path)
    except Exception:
        pass


# ── Check backends ────────────────────────────────────────────────────────────

def check_comfyui(comfyui_url: str = "http://localhost:8188") -> bool:
    try:
        import requests  # type: ignore
        requests.get(f"{comfyui_url}/system_stats", timeout=5)
        return True
    except Exception:
        return False


def check_pollinations() -> bool:
    try:
        import urllib.request
        with urllib.request.urlopen("https://image.pollinations.ai/", timeout=5) as r:
            return r.status < 500
    except Exception:
        return False


def check_huggingface() -> bool:
    try:
        import urllib.request
        req = urllib.request.Request("https://huggingface.co", method="HEAD")
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status < 500
    except Exception:
        return False
