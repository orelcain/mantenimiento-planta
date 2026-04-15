"""
Manhwa Video Generator — Phase 1 Pipeline
==========================================

Usage
─────
    python main.py --script scripts/my_story.txt
    python main.py --script scripts/my_story.txt --output output/episode_01.mp4
    python main.py --script scripts/my_story.txt --skip-images   # reuse existing images
    python main.py --script scripts/my_story.txt --skip-tts      # reuse existing audio
    python main.py --script scripts/my_story.txt --no-music      # skip background music

Full pipeline
─────────────
    [.txt script]
        ↓ story_parser  → ParsedScript (scenes, characters, dialogue)
        ↓ image_gen     → PNG per scene  (ComfyUI local API)
        ↓ tts           → WAV per dialogue line  (Kokoro TTS)
        ↓ video_builder → MP4 per scene (FFmpeg Ken Burns)
        ↓ video_builder → final.mp4 (concat + optional music mix)
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import config
from modules.image_gen import generate_image, check_comfyui
from modules.story_parser import parse_script
from modules.tts import get_voice_for_speaker, synthesize
from modules.video_builder import (
    add_background_music,
    build_scene_video,
    concatenate_audio,
    concatenate_videos,
)


# ── CLI ───────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate a narrated manhwa-style video from a .txt script."
    )
    p.add_argument("--script",       required=True, help="Path to .txt script file")
    p.add_argument("--output",       default=None,  help="Output MP4 path (default: output/<title>.mp4)")
    p.add_argument("--skip-images",  action="store_true", help="Skip image generation — reuse existing PNGs")
    p.add_argument("--skip-tts",     action="store_true", help="Skip TTS — reuse existing WAVs")
    p.add_argument("--no-music",     action="store_true", help="Skip background music mixing")
    p.add_argument("--no-ken-burns", action="store_true", help="Disable Ken Burns zoom effect")
    return p.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()

    script_path = Path(args.script)
    if not script_path.exists():
        print(f"[ERROR] Script not found: {script_path}")
        sys.exit(1)

    # ── Job directories ───────────────────────────────────────────────────────
    job_name  = script_path.stem
    job_dir   = config.OUTPUT_DIR / job_name
    img_dir   = job_dir / "images"
    audio_dir = job_dir / "audio"
    clips_dir = job_dir / "clips"

    for d in (job_dir, img_dir, audio_dir, clips_dir):
        d.mkdir(parents=True, exist_ok=True)

    output_path = (
        Path(args.output) if args.output
        else config.OUTPUT_DIR / f"{job_name}.mp4"
    )

    # ── 0. Pre-flight checks ──────────────────────────────────────────────────
    print("\n── Pre-flight ──────────────────────────────────────────────────────")
    if not args.skip_images:
        if check_comfyui(config.COMFYUI_URL):
            print(f"  ComfyUI ✓  {config.COMFYUI_URL}")
        else:
            print(
                f"  [WARN] ComfyUI not reachable at {config.COMFYUI_URL}.\n"
                "         Start ComfyUI or use --skip-images to reuse existing images."
            )

    # ── 1. Parse script ───────────────────────────────────────────────────────
    print(f"\n── [1/4] Parsing script: {script_path.name} ────────────────────────")
    script = parse_script(script_path)
    print(f"  Title      : {script.title}")
    print(f"  Characters : {', '.join(script.characters) or '(none defined)'}")
    print(f"  Scenes     : {len(script.scenes)}")

    if not script.scenes:
        print("[ERROR] No scenes found. Check your script format.")
        sys.exit(1)

    # ── 2. Generate images ────────────────────────────────────────────────────
    print(f"\n── [2/4] Generating images ({len(script.scenes)} scenes) ──────────")
    scene_images: dict[int, Path] = {}

    for scene in script.scenes:
        img_path = img_dir / f"scene_{scene.number:03d}.png"
        scene_images[scene.number] = img_path

        if args.skip_images and img_path.exists():
            print(f"  Scene {scene.number:>3}: skipped (image exists)")
            continue

        # Build character appearance dict for speakers in this scene
        char_descs = {
            name: script.characters[name].appearance
            for name in scene.speakers()
            if name in script.characters
        }

        print(f"  Scene {scene.number:>3}: {scene.background[:70]}...")
        generate_image(
            prompt=scene.background,
            output_path=img_path,
            character_descriptions=char_descs or None,
            width=config.IMAGE_WIDTH,
            height=config.IMAGE_HEIGHT,
            checkpoint=config.COMFYUI_CHECKPOINT,
            comfyui_url=config.COMFYUI_URL,
        )
        print(f"           → {img_path.name}")

    # ── 3. Synthesize audio ───────────────────────────────────────────────────
    print(f"\n── [3/4] Synthesizing audio ─────────────────────────────────────────")
    scene_audio: dict[int, Path] = {}

    for scene in script.scenes:
        merged_path   = audio_dir / f"scene_{scene.number:03d}.wav"
        scene_sub_dir = audio_dir / f"scene_{scene.number:03d}"
        scene_sub_dir.mkdir(exist_ok=True)
        scene_audio[scene.number] = merged_path

        if args.skip_tts and merged_path.exists():
            print(f"  Scene {scene.number:>3}: skipped (audio exists)")
            continue

        line_paths: list[Path] = []
        for j, line in enumerate(scene.dialogue):
            line_path = scene_sub_dir / f"line_{j:03d}.wav"
            voice     = get_voice_for_speaker(line.speaker, config.CHARACTER_VOICES)
            label     = line.text[:55] + ("…" if len(line.text) > 55 else "")
            print(f"  Scene {scene.number:>3} [{line.speaker:<10}]: {label}")
            synthesize(
                text=line.text,
                output_path=line_path,
                voice=voice,
                speed=config.TTS_SPEED,
                lang=config.TTS_LANG,
            )
            line_paths.append(line_path)

        if line_paths:
            concatenate_audio(line_paths, merged_path)
        else:
            # Silent scene — generate 2 s silence
            from modules.video_builder import _write_silence
            _write_silence(merged_path, 2.0)

    # ── 4. Build video ────────────────────────────────────────────────────────
    print(f"\n── [4/4] Assembling video ───────────────────────────────────────────")
    clip_paths: list[Path] = []
    ken_burns = config.KEN_BURNS_EFFECT and not args.no_ken_burns

    for scene in script.scenes:
        clip_path = clips_dir / f"clip_{scene.number:03d}.mp4"
        print(f"  Clip {scene.number:>3}/{len(script.scenes)}  ken_burns={ken_burns}...")
        build_scene_video(
            image_path=scene_images[scene.number],
            audio_path=scene_audio[scene.number],
            output_path=clip_path,
            ken_burns=ken_burns,
            width=config.IMAGE_WIDTH,
            height=config.IMAGE_HEIGHT,
        )
        clip_paths.append(clip_path)

    # Concatenate clips
    raw_path = job_dir / "raw.mp4"
    print("  Concatenating clips...")
    concatenate_videos(clip_paths, raw_path)

    # Mix background music
    music_path = config.MUSIC_DIR / config.DEFAULT_MUSIC_TRACK
    if not args.no_music and music_path.exists():
        print(f"  Mixing music: {music_path.name}  (vol={config.MUSIC_VOLUME})")
        add_background_music(raw_path, music_path, output_path, config.MUSIC_VOLUME)
    else:
        if not args.no_music and not music_path.exists():
            print(f"  [INFO] Music file not found ({music_path}), skipping.")
        shutil.copy(raw_path, output_path)

    # ── Done ──────────────────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"  Done!  →  {output_path}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
