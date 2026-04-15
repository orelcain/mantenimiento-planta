"""
video_builder.py — Assemble images + audio into a final MP4 video using FFmpeg.

Pipeline per scene
──────────────────
    image.png + [line_000.wav, line_001.wav, ...] → scene_NNN.mp4
        • Ken Burns zoom effect on the image
        • Dialogue audio lines merged with short pauses between them
        • Minimum hold duration so the image is never on screen < 3 s

Final assembly
──────────────
    [scene_001.mp4, scene_002.mp4, ...] → raw.mp4
        (Optional) raw.mp4 + music.mp3 → final.mp4

Requirements
────────────
    ffmpeg and ffprobe must be on PATH.
    On Windows: https://ffmpeg.org/download.html → add to PATH.
    On Linux:   sudo apt install ffmpeg
    On macOS:   brew install ffmpeg
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


# ── Helpers ───────────────────────────────────────────────────────────────────

def _run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run an ffmpeg/ffprobe command, surfacing stderr on failure."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg error (exit {result.returncode}):\n"
            f"CMD: {' '.join(cmd)}\n"
            f"STDERR: {result.stderr[-2000:]}"
        )
    return result


def get_audio_duration(audio_path: Path) -> float:
    """Return audio duration in seconds via ffprobe."""
    result = _run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            str(audio_path),
        ]
    )
    data = json.loads(result.stdout)
    for stream in data.get("streams", []):
        if "duration" in stream:
            return float(stream["duration"])
    return 3.0  # safe fallback


def _write_silence(output_path: Path, duration_sec: float, sample_rate: int = 22050) -> Path:
    """Generate a silent WAV clip of the given duration."""
    _run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"anullsrc=r={sample_rate}:cl=mono",
            "-t", str(duration_sec),
            str(output_path),
        ]
    )
    return output_path


# ── Public API ────────────────────────────────────────────────────────────────

def concatenate_audio(
    audio_paths: list[Path],
    output_path: Path,
    pause_sec: float = 0.4,
) -> Path:
    """
    Merge multiple WAV files with a short silence between each one.
    Single-file case is handled without re-encoding.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not audio_paths:
        _write_silence(output_path, 1.0)
        return output_path

    if len(audio_paths) == 1:
        shutil.copy(audio_paths[0], output_path)
        return output_path

    # Build a concat list with silence between clips
    tmp_dir = output_path.parent / f"_concat_{output_path.stem}"
    tmp_dir.mkdir(exist_ok=True)

    list_file = tmp_dir / "list.txt"
    silence_path = tmp_dir / "silence.wav"
    _write_silence(silence_path, pause_sec)

    with open(list_file, "w", encoding="utf-8") as f:
        for idx, p in enumerate(audio_paths):
            f.write(f"file '{p.absolute()}'\n")
            if idx < len(audio_paths) - 1:
                f.write(f"file '{silence_path.absolute()}'\n")

    _run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
        ]
    )

    # Cleanup temp dir
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return output_path


def build_scene_video(
    image_path: Path,
    audio_path: Path,
    output_path: Path,
    min_duration: float = 3.5,
    ken_burns: bool = True,
    width: int = 720,
    height: int = 1280,
) -> Path:
    """
    Combine a static image with audio into a scene MP4.

    The image is displayed for max(audio_duration + 0.6 s, min_duration).
    Ken Burns applies a slow zoom-in to add visual movement.
    """
    duration = max(get_audio_duration(audio_path) + 0.6, min_duration)
    frames   = int(duration * 25)   # 25 fps
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if ken_burns:
        # zoompan: start at 1.0x, zoom to 1.5x over the clip duration
        vf = (
            f"scale=8000:-1,"
            f"zoompan="
            f"z='min(zoom+0.0008,1.5)':"
            f"d={frames}:"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)',"
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,"
            f"fps=25"
        )
    else:
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,"
            f"fps=25"
        )

    _run(
        [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", str(image_path),
            "-i", str(audio_path),
            "-vf", vf,
            "-c:v", "libx264", "-tune", "stillimage", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            "-t", str(duration),
            "-r", "25",
            "-shortest",
            str(output_path),
        ]
    )
    return output_path


def concatenate_videos(clip_paths: list[Path], output_path: Path) -> Path:
    """Losslessly concatenate scene clips into one video."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    list_file = output_path.with_suffix(".concat.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        for p in clip_paths:
            f.write(f"file '{p.absolute()}'\n")

    _run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(output_path),
        ]
    )
    list_file.unlink(missing_ok=True)
    return output_path


def add_background_music(
    video_path: Path,
    music_path: Path,
    output_path: Path,
    music_volume: float = 0.12,
) -> Path:
    """
    Mix looping background music under the voice audio.
    Voice audio is kept at full volume; music is ducked to *music_volume*.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    _run(
        [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-stream_loop", "-1",
            "-i", str(music_path),
            "-filter_complex",
            (
                f"[1:a]volume={music_volume}[music];"
                "[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            ),
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(output_path),
        ]
    )
    return output_path
