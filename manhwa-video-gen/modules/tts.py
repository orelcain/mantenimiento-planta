"""
tts.py — Text-to-speech synthesis (local, gratis).

Motores disponibles
───────────────────
  1. Edge TTS   (Microsoft Neural, sin costo, requiere internet)
     → Voces en ESPAÑOL nativo: es-MX-DaliaNeural, es-MX-JorgeNeural,
       es-ES-ElviraNeural, es-AR-ElenaNeural, etc.
     → pip install edge-tts

  2. Kokoro ONNX (alta calidad, 100% offline)
     → Solo inglés, francés, japonés, chino
     → pip install kokoro-onnx soundfile
     → Modelos: kokoro-v1.0.onnx + voices-v1.0.bin

  3. pyttsx3 (fallback, calidad básica)
     → pip install pyttsx3

Configuración en config.py
──────────────────────────
  TTS_ENGINE = "edge"    # "edge" | "kokoro" | "pyttsx3"
  TTS_LANG   = "es"      # "es" | "en-us"

Voces Edge TTS para español
────────────────────────────
  Femeninas: es-MX-DaliaNeural · es-ES-ElviraNeural · es-AR-ElenaNeural
             es-MX-MarinaNeural · es-CO-SalomeNeural
  Masculinas: es-MX-JorgeNeural · es-ES-AlvaroNeural · es-AR-TomasNeural
"""

import asyncio
import subprocess
import sys
from pathlib import Path

# ── Valores por defecto ───────────────────────────────────────────────────────
# Edge TTS — voces para español latinoamericano
DEFAULT_VOICE_ES  = "es-MX-DaliaNeural"    # personajes femeninos / default
NARRATOR_VOICE_ES = "es-MX-JorgeNeural"    # NARRADOR

# Kokoro (inglés, fallback)
DEFAULT_VOICE_EN  = "af_heart"
NARRATOR_VOICE_EN = "am_michael"

# Rutas de modelos Kokoro
_ONNX_MODEL = Path(__file__).parent.parent / "kokoro-v1.0.onnx"
_VOICES_BIN = Path(__file__).parent.parent / "voices-v1.0.bin"

# Cache del modelo Kokoro
_kokoro_instance = None


# ── API pública ───────────────────────────────────────────────────────────────

def synthesize(
    text: str,
    output_path: Path,
    voice: str = DEFAULT_VOICE_ES,
    speed: float = 1.0,
    lang: str = "es",
    engine: str = "edge",
) -> Path:
    """
    Sintetiza *text* y guarda el audio en *output_path* (.wav o .mp3).

    Args:
        text:        Texto a narrar.
        output_path: Archivo destino (.wav).
        voice:       ID de voz (Edge: "es-MX-DaliaNeural" / Kokoro: "af_heart").
        speed:       Multiplicador de velocidad (0.5–2.0).
        lang:        Código de idioma: "es", "en-us".
        engine:      Motor TTS: "edge", "kokoro", "pyttsx3".
    """
    if engine == "edge":
        try:
            return _synthesize_edge(text, output_path, voice, speed)
        except Exception as exc:
            print(f"    [TTS] Edge TTS falló ({exc}) — usando pyttsx3")
            return _synthesize_pyttsx3(text, output_path)

    elif engine == "kokoro":
        try:
            return _synthesize_kokoro(text, output_path, voice, speed, lang)
        except (ImportError, FileNotFoundError) as exc:
            print(f"    [TTS] Kokoro no disponible ({exc}) — usando Edge TTS")
            return _synthesize_edge(text, output_path, DEFAULT_VOICE_ES, speed)

    else:  # pyttsx3
        return _synthesize_pyttsx3(text, output_path)


def get_voice_for_speaker(
    speaker: str,
    character_voices: dict[str, str] | None = None,
    lang: str = "es",
) -> str:
    """
    Resuelve la voz para un personaje dado.

    Orden de prioridad:
      1. character_voices (override manual en config.py)
      2. NARRADOR → voz de narrador según idioma
      3. Cualquier otro → voz default según idioma
    """
    if character_voices and speaker in character_voices:
        return character_voices[speaker]
    if speaker == "NARRADOR":
        return NARRATOR_VOICE_ES if lang.startswith("es") else NARRATOR_VOICE_EN
    return DEFAULT_VOICE_ES if lang.startswith("es") else DEFAULT_VOICE_EN


# ── Motor Edge TTS ────────────────────────────────────────────────────────────

def _synthesize_edge(
    text: str,
    output_path: Path,
    voice: str,
    speed: float = 1.0,
) -> Path:
    """Sintetiza con Microsoft Edge TTS (requiere internet)."""
    import edge_tts  # type: ignore

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Edge TTS exporta MP3 — lo convertimos a WAV con FFmpeg
    mp3_path = output_path.with_suffix(".mp3")

    # Convertir speed a porcentaje de Edge TTS (+0%, +10%, -5%, etc.)
    rate_pct = int((speed - 1.0) * 100)
    rate_str = f"{rate_pct:+d}%"

    async def _run():
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        await communicate.save(str(mp3_path))

    asyncio.run(_run())

    # Convertir MP3 → WAV para mantener compatibilidad con el pipeline
    _mp3_to_wav(mp3_path, output_path)
    mp3_path.unlink(missing_ok=True)

    return output_path


def _mp3_to_wav(mp3_path: Path, wav_path: Path) -> None:
    """Convierte MP3 a WAV usando FFmpeg."""
    # Buscar ffmpeg en PATH + ubicación de winget
    ffmpeg_candidates = [
        "ffmpeg",
        r"C:\Users\pc hp\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe",
    ]
    ffmpeg_exe = next(
        (f for f in ffmpeg_candidates
         if _is_executable(f)),
        "ffmpeg"
    )
    subprocess.run(
        [ffmpeg_exe, "-y", "-i", str(mp3_path), str(wav_path)],
        capture_output=True, check=True
    )


def _is_executable(path: str) -> bool:
    from shutil import which
    if which(path):
        return True
    return Path(path).is_file()


# ── Motor Kokoro ──────────────────────────────────────────────────────────────

def _synthesize_kokoro(
    text: str,
    output_path: Path,
    voice: str,
    speed: float,
    lang: str,
) -> Path:
    import soundfile as sf  # type: ignore
    from kokoro_onnx import Kokoro  # type: ignore

    global _kokoro_instance
    if _kokoro_instance is None:
        if not _ONNX_MODEL.exists():
            raise FileNotFoundError(_ONNX_MODEL)
        if not _VOICES_BIN.exists():
            raise FileNotFoundError(_VOICES_BIN)
        _kokoro_instance = Kokoro(str(_ONNX_MODEL), str(_VOICES_BIN))

    samples, sample_rate = _kokoro_instance.create(
        text, voice=voice, speed=speed, lang=lang
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), samples, sample_rate)
    return output_path


# ── pyttsx3 fallback ──────────────────────────────────────────────────────────

def _synthesize_pyttsx3(text: str, output_path: Path) -> Path:
    import pyttsx3  # type: ignore

    engine = pyttsx3.init()
    engine.setProperty("rate", 150)
    engine.setProperty("volume", 1.0)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    engine.save_to_file(text, str(output_path))
    engine.runAndWait()
    return output_path
