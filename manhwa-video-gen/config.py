"""
Manhwa Video Generator — Configuración
Editá este archivo para ajustar a tu setup local.
"""
import os
from pathlib import Path

# ── Directorios ───────────────────────────────────────────────────────────────
ROOT_DIR   = Path(__file__).parent
OUTPUT_DIR = ROOT_DIR / "output"
ASSETS_DIR = ROOT_DIR / "assets"
MUSIC_DIR  = ASSETS_DIR / "music"

# ── ComfyUI ───────────────────────────────────────────────────────────────────
COMFYUI_URL        = "http://localhost:8188"
COMFYUI_CHECKPOINT = "anything-v5.safetensors"

# ── Imagen ────────────────────────────────────────────────────────────────────
IMAGE_WIDTH      = 720
IMAGE_HEIGHT     = 1280   # 9:16 vertical — YouTube Shorts / mobile
KEN_BURNS_EFFECT = True

# Backend para generación de imágenes:
#   "placeholder"   → panel oscuro con texto (sin internet, instantáneo)
#   "pollinations"  → Pollinations.AI FLUX gratuito (sin API key, requiere internet)
#   "huggingface"   → HuggingFace Inference API (gratis con HF_TOKEN, mejor calidad)
#   "gemini"        → Google Gemini Imagen 3 (requiere GEMINI_API_KEY + billing)
#   "comfyui"       → ComfyUI local (requiere GPU)
IMAGE_BACKEND = "pollinations"

# HuggingFace token para IMAGE_BACKEND="huggingface"
HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "")

# ── TTS — Motor de voz ────────────────────────────────────────────────────────
# "edge"    → Microsoft Edge TTS Neural (mejor español, requiere internet, gratis)
# "kokoro"  → Kokoro ONNX (100% offline, inglés/francés/japonés)
# "pyttsx3" → Windows SAPI (offline, calidad básica, robot)
TTS_ENGINE = "edge"
TTS_SPEED  = 1.0
TTS_LANG   = "es"

# Voces Edge TTS disponibles para español
EDGE_VOICES_ES = {
    # Femeninas
    "Dalia (MX)"   : "es-MX-DaliaNeural",
    "Marina (MX)"  : "es-MX-MarinaNeural",
    "Elvira (ES)"  : "es-ES-ElviraNeural",
    "Elena (AR)"   : "es-AR-ElenaNeural",
    "Salome (CO)"  : "es-CO-SalomeNeural",
    "Paulina (MX)" : "es-MX-BeatrizNeural",
    # Masculinas
    "Jorge (MX)"   : "es-MX-JorgeNeural",
    "Alvaro (ES)"  : "es-ES-AlvaroNeural",
    "Tomas (AR)"   : "es-AR-TomasNeural",
    "Gonzalo (CL)" : "es-CL-CatalinaNeural",
}

# Voces por personaje (MAYÚSCULAS = nombre del personaje en el guion)
CHARACTER_VOICES: dict[str, str] = {
    "NARRADOR": "es-MX-JorgeNeural",
}

# ── Generación de historias ───────────────────────────────────────────────────
# "ollama" | "gemini" | "anthropic"
STORY_BACKEND = "gemini" if os.environ.get("GEMINI_API_KEY") else "ollama"
STORY_MODEL   = "llama3.2:3b"   # solo para ollama

# ── Audio / Música ────────────────────────────────────────────────────────────
MUSIC_VOLUME        = 0.12
DEFAULT_MUSIC_TRACK = "ambient_01.mp3"

# ── Quality scores por backend (1–100) ───────────────────────────────────────
QUALITY_SCORES = {
    "story": {
        "ollama_3b":   65,
        "ollama_7b":   80,
        "gemini":      88,
        "anthropic":   92,
    },
    "image": {
        "placeholder": 15,
        "pollinations": 62,
        "huggingface": 72,
        "comfyui":     84,
        "gemini":      90,
    },
    "audio": {
        "pyttsx3": 35,
        "kokoro":  75,
        "edge":    84,
    },
    "video": {
        "ken_burns_placeholder": 25,
        "ken_burns_real":        68,
        "animated":              92,
    },
}

# ── ETA estimates (segundos por escena) ──────────────────────────────────────
ETA_SECONDS = {
    "story_total": {          # tiempo total generación guion
        "ollama_3b":  480,    # 8 min
        "ollama_7b":  1080,   # 18 min
        "gemini":     30,     # 30 s
        "anthropic":  30,
    },
    "image_per_scene": {
        "placeholder":  2,
        "pollinations": 22,
        "huggingface":  48,
        "comfyui":      120,
        "gemini":       18,
    },
    "tts_per_scene":   {      # asume ~5 líneas/escena
        "edge":    10,
        "kokoro":  20,
        "pyttsx3":  4,
    },
    "video_per_scene": {      # Ken Burns CPU i7-4702
        "ken_burns": 55,
    },
}

# ── Free tier limits (información pública al 2026-04) ────────────────────────
# Se muestra en dashboard para que usuario no sobrepase cuotas gratuitas.
FREE_TIER_LIMITS = {
    # Story generation
    "ollama": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "100% local, sin límite",
    },
    "gemini_flash": {                     # gemini-2.5-flash (texto)
        "rpm": 15, "daily": 1500,
        "free": True,
        "note": "Gratis · 15 req/min · 1M tokens/día",
    },
    "gemini_pro": {                       # gemini-2.5-pro (texto)
        "rpm": 2, "daily": 50,
        "free": True,
        "note": "Gratis · 2 req/min · 50 req/día",
    },
    "anthropic": {
        "rpm": None, "daily": None,
        "free": False,
        "note": "Requiere API key o Pro",
    },
    # Image generation
    "placeholder": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "Offline, instantáneo",
    },
    "pollinations": {
        "rpm": 5, "daily": None,
        "free": True,
        "note": "Gratis · ~5 req/min · sin límite diario",
    },
    "huggingface": {
        "rpm": 10, "daily": 1000,
        "free": True,
        "note": "Gratis · 1000 req/mes con token HF",
    },
    "gemini_imagen": {                    # Imagen 3 via Gemini
        "rpm": None, "daily": None,
        "free": False,
        "note": "Requiere billing (no gratis)",
    },
    "comfyui": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "100% local, sin límite (requiere GPU)",
    },
    # Audio / TTS
    "edge": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "Gratis · sin límite oficial",
    },
    "kokoro": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "100% offline",
    },
    "pyttsx3": {
        "rpm": None, "daily": None,
        "free": True,
        "note": "100% offline (Windows SAPI)",
    },
}

# ── Estilos visuales para imagen ─────────────────────────────────────────────
# Cada estilo añade sufijo al prompt y controla negative_prompt.
STYLES = {
    "manhwa": {
        "label": "Manhwa/Webtoon",
        "emoji": "📖",
        "img_suffix": (
            "manhwa style, korean webtoon aesthetic, vertical panel, dramatic "
            "lighting, detailed character design, clean lineart, vibrant colors, "
            "cinematic composition"
        ),
        "negative": "photorealistic, 3d render, blurry, western cartoon",
    },
    "anime": {
        "label": "Anime",
        "emoji": "🌸",
        "img_suffix": (
            "anime style, studio ghibli inspired, cel-shaded, soft pastel colors, "
            "expressive characters, detailed anime background, sharp lineart"
        ),
        "negative": "photorealistic, western cartoon, 3d render, blurry",
    },
    "realista": {
        "label": "Realista (Foto)",
        "emoji": "📷",
        "img_suffix": (
            "photorealistic, cinematic lighting, highly detailed skin texture, "
            "8k resolution, professional photography, shallow depth of field, "
            "natural colors, film grain"
        ),
        "negative": "cartoon, anime, illustration, drawing, low quality",
    },
    "cinematografico": {
        "label": "Cinematográfico",
        "emoji": "🎬",
        "img_suffix": (
            "cinematic shot, film still, movie poster composition, dramatic "
            "atmospheric lighting, wide angle lens, anamorphic, color graded, "
            "cinemascope, epic"
        ),
        "negative": "amateur, flat lighting, low quality",
    },
    "cartoon": {
        "label": "Cartoon/Pixar",
        "emoji": "🎨",
        "img_suffix": (
            "3d cartoon style, pixar disney inspired, vibrant saturated colors, "
            "expressive exaggerated features, soft rendering, wholesome"
        ),
        "negative": "photorealistic, anime, dark, grim",
    },
    "pixel_art": {
        "label": "Pixel Art Retro",
        "emoji": "🕹️",
        "img_suffix": (
            "pixel art style, 16-bit retro game aesthetic, limited color palette, "
            "sharp pixels, detailed sprite, SNES-era graphics"
        ),
        "negative": "smooth, photorealistic, 3d render, anti-aliased",
    },
    "noir": {
        "label": "Noir (B&N)",
        "emoji": "🕶️",
        "img_suffix": (
            "film noir style, black and white, high contrast chiaroscuro, "
            "dramatic shadows, 1940s aesthetic, moody atmosphere, cigarette smoke, "
            "venetian blind shadows"
        ),
        "negative": "colorful, bright, cheerful, saturated",
    },
    "acuarela": {
        "label": "Acuarela",
        "emoji": "🖌️",
        "img_suffix": (
            "watercolor painting, soft brush strokes, paper texture visible, "
            "pastel colors, artistic traditional illustration, loose linework"
        ),
        "negative": "photorealistic, digital, sharp, 3d render",
    },
}

DEFAULT_STYLE = "manhwa"


# ── Auto-select best free backend ────────────────────────────────────────────
# Prioriza gratis ilimitado > gratis con cuota > requiere billing.
# Dentro de la misma categoría, prioriza mayor calidad.

def best_free_story_backend(availability: dict) -> str:
    """Elige el mejor backend de historia GRATIS disponible.
    availability: dict de /api/system['backends'] → {name: {ok: bool}}
    """
    # Prioridad: gemini (gratis, rápido, alta calidad) > ollama (local) > anthropic (pago)
    priority = ["gemini", "ollama", "anthropic"]
    for b in priority:
        if availability.get(b, {}).get("ok"):
            return b
    return "ollama"


def best_free_image_backend(availability: dict) -> str:
    """Elige el mejor backend de imagen GRATIS (sin billing).
    availability: dict de /api/system['image_backends']
    """
    # Prioridad GRATIS realista: comfyui (local si ok) > huggingface > pollinations > placeholder
    # Excluimos gemini_imagen porque requiere billing
    priority = ["comfyui", "huggingface", "pollinations", "placeholder"]
    for b in priority:
        if availability.get(b, {}).get("ok"):
            return b
    return "placeholder"


def best_free_audio_backend() -> str:
    """Edge TTS es siempre el mejor gratis para español."""
    return "edge"
