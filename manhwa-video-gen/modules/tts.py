"""
tts.py — Text-to-speech synthesis (local, free).

Primary engine : Kokoro ONNX  (high quality, ~80 MB model)
Fallback engine: pyttsx3       (no model files needed, lower quality)

── Setup Kokoro ────────────────────────────────────────────────────────────────
1. pip install kokoro-onnx soundfile
2. Download model files and place them next to config.py:
   • kokoro-v0_19.onnx
   • voices.json
   Releases: https://github.com/thewh1teagle/kokoro-onnx/releases

── Available Kokoro voices ─────────────────────────────────────────────────────
  Female (EN): af_heart · af_bella · af_nicole · af_sky
  Male   (EN): am_adam  · am_michael
  (Spanish voices may not be available in all releases)

── Usage ────────────────────────────────────────────────────────────────────────
    from modules.tts import synthesize, get_voice_for_speaker

    audio_path = synthesize(
        text="The city never sleeps, but Yuna needed rest.",
        output_path=Path("output/job/audio/scene_001/line_000.wav"),
        voice="am_michael",
    )
"""

from __future__ import annotations

from pathlib import Path

# ── Voice defaults ────────────────────────────────────────────────────────────
DEFAULT_VOICE  = "af_heart"     # default character voice
NARRATOR_VOICE = "am_michael"   # voice for NARRADOR lines

# Path to Kokoro model files (relative to project root)
# kokoro-onnx v0.5.0 uses kokoro-v1.0.onnx + voices-v1.0.bin
_ONNX_MODEL = Path(__file__).parent.parent / "kokoro-v1.0.onnx"
_VOICES_BIN = Path(__file__).parent.parent / "voices-v1.0.bin"

# Module-level cache so we don't reload the model on every call
_kokoro_instance = None


# ── Public API ────────────────────────────────────────────────────────────────

def synthesize(
    text: str,
    output_path: Path,
    voice: str = DEFAULT_VOICE,
    speed: float = 1.0,
    lang: str = "e",
) -> Path:
    """
    Synthesize *text* to a WAV file at *output_path*.

    Args:
        text:        Text to speak.
        output_path: Destination .wav file.
        voice:       Kokoro voice ID (e.g. "af_heart", "am_michael").
        speed:       Playback speed multiplier (0.5–2.0).
        lang:        Language code: 'e' = English, 'es' = Spanish.

    Returns the path to the saved WAV.
    """
    try:
        return _synthesize_kokoro(text, output_path, voice, speed, lang)
    except ImportError:
        print("    [TTS] kokoro-onnx not installed — falling back to pyttsx3")
        return _synthesize_pyttsx3(text, output_path)
    except FileNotFoundError as exc:
        print(f"    [TTS] Kokoro model files missing ({exc}) — falling back to pyttsx3")
        return _synthesize_pyttsx3(text, output_path)


def get_voice_for_speaker(
    speaker: str,
    character_voices: dict[str, str] | None = None,
) -> str:
    """
    Resolve the Kokoro voice ID for a given speaker name.

    Lookup order:
      1. character_voices override (from config.py)
      2. NARRADOR  → NARRATOR_VOICE
      3. Anything else → DEFAULT_VOICE
    """
    if character_voices and speaker in character_voices:
        return character_voices[speaker]
    if speaker == "NARRADOR":
        return NARRATOR_VOICE
    return DEFAULT_VOICE


# ── Kokoro engine ─────────────────────────────────────────────────────────────

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
    engine.setProperty("rate", 155)   # words per minute
    engine.setProperty("volume", 1.0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    engine.save_to_file(text, str(output_path))
    engine.runAndWait()
    return output_path
