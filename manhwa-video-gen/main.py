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
        description="Genera un video manhwa narrado en español desde un guion .txt o una idea de 1 línea."
    )
    # Entrada: guion existente O idea (genera el guion con IA)
    input_group = p.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--script", help="Ruta al archivo .txt del guion")
    input_group.add_argument("--idea",   help="Idea de una línea — genera el guion con IA")

    p.add_argument("--genre",    default="auto",
                   choices=["auto", "romance", "accion", "fantasia", "horror"],
                   help="Género de la historia para modo --idea (default: auto)")
    p.add_argument("--num-scenes", type=int, default=6,
                   help="Número de escenas a generar (default: 6)")
    p.add_argument("--backend",  default=None,
                   choices=["ollama", "gemini", "anthropic"],
                   help="Backend de IA para generar historia (default: config.STORY_BACKEND)")
    p.add_argument("--compare-backends", action="store_true",
                   help="Genera con los 3 backends, el jurado IA elige el mejor")
    p.add_argument("--output",       default=None,  help="Ruta del MP4 de salida")
    p.add_argument("--skip-images",  action="store_true", help="Saltear generación de imágenes")
    p.add_argument("--skip-tts",     action="store_true", help="Saltear TTS — reusar WAVs existentes")
    p.add_argument("--no-music",     action="store_true", help="Sin música de fondo")
    p.add_argument("--no-ken-burns", action="store_true", help="Desactivar efecto Ken Burns")
    return p.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()

    # ── Fase 2: generar guion con IA ─────────────────────────────────────────
    if args.idea:
        backend = args.backend or config.STORY_BACKEND
        print(f"\n── [0/4] Generando guion con IA ({backend}) ────────────────────────")

        if args.compare_backends:
            from modules.story_gen import compare_and_judge
            script_path = compare_and_judge(
                idea=args.idea,
                genre=args.genre,
                num_scenes=args.num_scenes,
            )
        else:
            from modules.story_gen import generate_story
            script_path = generate_story(
                idea=args.idea,
                genre=args.genre,
                num_scenes=args.num_scenes,
                backend=backend,
                model=config.STORY_MODEL if backend == "ollama" else None,
            )
    else:
        script_path = Path(args.script)
        if not script_path.exists():
            print(f"[ERROR] Guion no encontrado: {script_path}")
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

        if args.skip_images:
            if img_path.exists():
                print(f"  Scene {scene.number:>3}: skipped (image exists)")
            else:
                # Create a black placeholder so TTS + video can still be tested
                from PIL import Image as _PILImage
                _PILImage.new("RGB", (config.IMAGE_WIDTH, config.IMAGE_HEIGHT), (0, 0, 0)).save(img_path)
                print(f"  Scene {scene.number:>3}: placeholder (black) created")
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
            voice     = get_voice_for_speaker(
                line.speaker, config.CHARACTER_VOICES, lang=config.TTS_LANG
            )
            label     = line.text[:55] + ("…" if len(line.text) > 55 else "")
            print(f"  Escena {scene.number:>3} [{line.speaker:<10}]: {label}")
            synthesize(
                text=line.text,
                output_path=line_path,
                voice=voice,
                speed=config.TTS_SPEED,
                lang=config.TTS_LANG,
                engine=config.TTS_ENGINE,
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
