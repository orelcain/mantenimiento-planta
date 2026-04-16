"""
Manhwa Video Generator — Configuration
Edit this file to match your local setup.
"""
from pathlib import Path

# ── Directories ───────────────────────────────────────────────────────────────
ROOT_DIR   = Path(__file__).parent
OUTPUT_DIR = ROOT_DIR / "output"
ASSETS_DIR = ROOT_DIR / "assets"
MUSIC_DIR  = ASSETS_DIR / "music"

# ── ComfyUI ───────────────────────────────────────────────────────────────────
COMFYUI_URL        = "http://localhost:8188"
# Name of the checkpoint file inside ComfyUI/models/checkpoints/
# Good free options: anything-v5.safetensors, dreamshaper_8.safetensors
COMFYUI_CHECKPOINT = "anything-v5.safetensors"

# ── Image ─────────────────────────────────────────────────────────────────────
IMAGE_WIDTH      = 720
IMAGE_HEIGHT     = 1280   # 9:16 vertical — ideal for YouTube Shorts & mobile
KEN_BURNS_EFFECT = True   # Slow zoom on each panel

# ── TTS (Kokoro) ──────────────────────────────────────────────────────────────
# Install: pip install kokoro-onnx soundfile
# Models:  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
# Files needed: kokoro-v1.0.onnx + voices-v1.0.bin (place next to this file)
TTS_SPEED = 1.0
TTS_LANG  = "en-us"   # kokoro-onnx v0.5.0 codes: 'en-us', 'en-gb', 'es'

# Map speaker names (uppercase) to Kokoro voice IDs.
# Female EN: af_heart, af_bella, af_nicole, af_sky
# Male EN:   am_adam, am_michael
CHARACTER_VOICES: dict[str, str] = {
    "NARRADOR": "am_michael",
    # Add per-character overrides here:
    # "YUNA":   "af_heart",
    # "SOMBRA": "am_adam",
}

# ── Audio / Music ─────────────────────────────────────────────────────────────
MUSIC_VOLUME        = 0.12          # 0.0–1.0, background music level
DEFAULT_MUSIC_TRACK = "ambient_01.mp3"   # file inside assets/music/
