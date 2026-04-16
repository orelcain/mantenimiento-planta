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
