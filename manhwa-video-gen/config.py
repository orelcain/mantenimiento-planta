"""
Manhwa Video Generator — Configuración
Editá este archivo para ajustar a tu setup local.
"""
from pathlib import Path

# ── Directorios ───────────────────────────────────────────────────────────────
ROOT_DIR   = Path(__file__).parent
OUTPUT_DIR = ROOT_DIR / "output"
ASSETS_DIR = ROOT_DIR / "assets"
MUSIC_DIR  = ASSETS_DIR / "music"

# ── ComfyUI ───────────────────────────────────────────────────────────────────
COMFYUI_URL        = "http://localhost:8188"
# Nombre del checkpoint dentro de ComfyUI/models/checkpoints/
# Opciones gratuitas recomendadas: anything-v5.safetensors, dreamshaper_8.safetensors
COMFYUI_CHECKPOINT = "anything-v5.safetensors"

# ── Imagen ────────────────────────────────────────────────────────────────────
IMAGE_WIDTH      = 720
IMAGE_HEIGHT     = 1280   # 9:16 vertical — ideal para YouTube Shorts y mobile
KEN_BURNS_EFFECT = True   # Zoom lento en cada panel

# ── TTS — Motor de voz ────────────────────────────────────────────────────────
# Opciones: "edge" (español nativo, requiere internet) | "kokoro" (offline, solo inglés)
TTS_ENGINE = "edge"
TTS_SPEED  = 1.0
TTS_LANG   = "es"   # "es" para español, "en-us" para inglés

# Voces por personaje (MAYÚSCULAS = nombre del personaje)
# Edge TTS español: es-MX-DaliaNeural, es-MX-JorgeNeural, es-ES-ElviraNeural,
#                   es-AR-ElenaNeural, es-CO-SalomeNeural, es-ES-AlvaroNeural
# Kokoro (inglés):  af_heart, af_bella, am_michael, am_adam
CHARACTER_VOICES: dict[str, str] = {
    "NARRADOR": "es-MX-JorgeNeural",     # voz masculina mexicana para narración
    # Agregá overrides por personaje:
    # "YUNA":   "es-MX-DaliaNeural",
    # "SOMBRA": "es-ES-AlvaroNeural",
}

# ── Generación de historias (Fase 2) ──────────────────────────────────────────
# Backend de IA para generar guiones: "ollama" | "gemini" | "anthropic"
# ollama    → 100% local, gratis, sin internet (requiere Ollama corriendo)
# gemini    → Google Gemini Flash, gratis 1500 req/día (setx GEMINI_API_KEY tu-clave)
# anthropic → Claude Haiku, ~$0.001/historia (setx ANTHROPIC_API_KEY tu-clave)
STORY_BACKEND = "ollama"
STORY_MODEL   = "llama3.2:3b"   # Modelo de Ollama a usar

# ── Audio / Música ────────────────────────────────────────────────────────────
MUSIC_VOLUME        = 0.12          # 0.0–1.0, nivel de música de fondo
DEFAULT_MUSIC_TRACK = "ambient_01.mp3"   # archivo dentro de assets/music/
