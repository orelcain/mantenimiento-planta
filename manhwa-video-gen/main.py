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
import json
import shutil
import sys
import types
import linecache
from datetime import datetime
from pathlib import Path

# ── UTF-8 en stdout/stderr (Windows CP1252 rompe los caracteres Unicode) ──────
if hasattr(sys.stdout, "reconfigure"):
    try:
        if (sys.stdout.encoding or "").lower().replace("-", "") not in ("utf8",):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── Fix Python 3.13.1 linecache bug con 'from __future__ import annotations' ──
_orig_reg = getattr(linecache, '_register_code', None)
if _orig_reg:
    def _safe_register_code(code):
        if isinstance(code, types.CodeType):
            try:
                _orig_reg(code)
            except AttributeError:
                pass
    linecache._register_code = _safe_register_code

import config

# ── Status writer para el dashboard ──────────────────────────────────────────
_STATUS_FILE = Path(__file__).parent / "output" / "pipeline_status.json"

def _write_status(stage: int, stages_total: int, stage_name: str,
                  progress: int, detail: str = "", error: str = "",
                  idea: str = "", done: bool = False) -> None:
    _STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "stage":        stage,
        "stages_total": stages_total,
        "stage_name":   stage_name,
        "progress":     progress,
        "detail":       detail,
        "idea":         idea,
        "running":      not done and not error,
        "done":         done,
        "error":        error,
        "ts":           datetime.now().isoformat(timespec="seconds"),
    }
    _STATUS_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
from modules.image_gen import generate_image, check_comfyui, check_pollinations
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
    p.add_argument("--image-backend", default=None,
                   choices=["placeholder","pollinations","huggingface","gemini","comfyui"],
                   help="Backend de generación de imágenes (default: config.IMAGE_BACKEND)")
    p.add_argument("--style", default="manhwa",
                   choices=["manhwa","anime","realista","cinematografico","cartoon","pixel_art","noir","acuarela"],
                   help="Estilo visual de imágenes (default: manhwa)")
    p.add_argument("--voice", default=None,
                   help="Voz del narrador (clave de config.EDGE_VOICES_ES, ej: 'Jorge (MX)')")
    return p.parse_args()


# ── Placeholder image (modo --skip-images) ────────────────────────────────────

def _make_placeholder_image(img_path: Path, scene, width: int, height: int) -> None:
    """Genera imagen placeholder estilizada con info de la escena (sin ComfyUI)."""
    import textwrap
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (width, height), (8, 8, 18))
    draw = ImageDraw.Draw(img)

    # Degradado vertical oscuro azul-violeta
    for y in range(height):
        t = y / height
        r = int(8  + t * 14)
        g = int(8  + t *  6)
        b = int(18 + t * 28)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Borde del panel
    m = 32
    draw.rectangle([m, m, width - m, height - m], outline=(55, 55, 88), width=2)
    # Barra decorativa superior
    draw.rectangle([m, m, width - m, m + 4], fill=(90, 60, 160))

    # Fuentes: intenta Consolas → Arial → default
    font_big = font_med = font_sm = font_xs = None
    for fp in [r"C:\Windows\Fonts\consola.ttf",
               r"C:\Windows\Fonts\arial.ttf",
               r"C:\Windows\Fonts\segoeui.ttf"]:
        if Path(fp).exists():
            try:
                font_big = ImageFont.truetype(fp, 80)
                font_med = ImageFont.truetype(fp, 38)
                font_sm  = ImageFont.truetype(fp, 28)
                font_xs  = ImageFont.truetype(fp, 22)
                break
            except Exception:
                pass
    if font_big is None:
        font_big = font_med = font_sm = font_xs = ImageFont.load_default()

    # Número de escena (grande, centrado)
    label = f"ESCENA {scene.number}"
    bb = draw.textbbox((0, 0), label, font=font_big)
    tw = bb[2] - bb[0]
    draw.text(((width - tw) // 2, 110), label, fill=(185, 148, 255), font=font_big)

    # Línea separadora
    draw.line([(m + 24, 225), (width - m - 24, 225)], fill=(48, 48, 72), width=1)

    # Descripción del fondo (wrapped, 28 chars/línea)
    bg = (scene.background or "").strip()[:220]
    wrapped = textwrap.fill(bg, width=28)
    draw.multiline_text((m + 24, 252), wrapped,
                        fill=(148, 148, 195), font=font_sm, spacing=10)

    # Speakers (abajo del todo)
    spks = scene.speakers()[:4]
    if spks:
        draw.text((m + 24, height - 130),
                  "  ·  ".join(spks),
                  fill=(105, 105, 145), font=font_xs)

    draw.text((m + 24, height - 90),
              "[ imagen pendiente — ComfyUI ]",
              fill=(48, 48, 68), font=font_xs)

    img_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(img_path)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()

    # Resolver backend de imágenes
    image_backend = args.image_backend or config.IMAGE_BACKEND

    # Resolver voz del narrador — override CHARACTER_VOICES si viene --voice
    if args.voice and args.voice in config.EDGE_VOICES_ES:
        voice_id = config.EDGE_VOICES_ES[args.voice]
        config.CHARACTER_VOICES["NARRADOR"] = voice_id
        print(f"   Voz narrador: {args.voice} → {voice_id}")

    idea_str = args.idea or Path(args.script).stem

    # ── Fase 2: generar guion con IA ─────────────────────────────────────────
    if args.idea:
        backend = args.backend or config.STORY_BACKEND
        print(f"\n── [0/4] Generando guion con IA ({backend}) ────────────────────────")
        _write_status(0, 4, f"Generando guion ({backend})", 10,
                      idea=idea_str, detail="Llamando a Ollama…")

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
        if image_backend == "comfyui":
            if check_comfyui(config.COMFYUI_URL):
                print(f"  ComfyUI ✓  {config.COMFYUI_URL}")
            else:
                print(f"  [WARN] ComfyUI no disponible — cambiando a pollinations")
                image_backend = "pollinations"
        elif image_backend == "pollinations":
            print(f"  Imagen: Pollinations.AI FLUX (gratis, sin API key)")
        elif image_backend == "huggingface":
            print(f"  Imagen: HuggingFace Inference API")
        elif image_backend == "gemini":
            print(f"  Imagen: Gemini Imagen 3")

    # ── 1. Parse script ───────────────────────────────────────────────────────
    print(f"\n── [1/4] Parsing script: {script_path.name} ────────────────────────")
    _write_status(1, 4, "Parseando guion", 25, idea=idea_str, detail=script_path.name)
    script = parse_script(script_path)
    print(f"  Title      : {script.title}")
    print(f"  Characters : {', '.join(script.characters) or '(none defined)'}")
    print(f"  Scenes     : {len(script.scenes)}")

    if not script.scenes:
        print("[ERROR] No scenes found. Check your script format.")
        sys.exit(1)

    # ── 2. Generate images ────────────────────────────────────────────────────
    print(f"\n── [2/4] Generating images ({len(script.scenes)} scenes) ──────────")
    _write_status(2, 4, "Generando imágenes", 30, idea=idea_str,
                  detail=f"0/{len(script.scenes)} escenas")
    scene_images: dict[int, Path] = {}

    for scene in script.scenes:
        img_path = img_dir / f"scene_{scene.number:03d}.png"
        scene_images[scene.number] = img_path

        if args.skip_images:
            _write_status(2, 4, "Generando imágenes", 30 + int(scene.number / len(script.scenes) * 20),
                          idea=idea_str, detail=f"{scene.number}/{len(script.scenes)} escenas")
            if img_path.exists():
                print(f"  Scene {scene.number:>3}: skipped (image exists)")
            else:
                _make_placeholder_image(img_path, scene, config.IMAGE_WIDTH, config.IMAGE_HEIGHT)
                print(f"  Scene {scene.number:>3}: placeholder estilizado creado")
            continue

        # ── Generar imagen con backend seleccionado ─────────────────────────
        char_descs = {
            name: script.characters[name].appearance
            for name in scene.speakers()
            if name in script.characters
        }
        print(f"  Scene {scene.number:>3}: {scene.background[:65]}…")
        generate_image(
            prompt=scene.background,
            output_path=img_path,
            backend=image_backend,
            style=args.style,
            character_descriptions=char_descs or None,
            width=config.IMAGE_WIDTH,
            height=config.IMAGE_HEIGHT,
            checkpoint=config.COMFYUI_CHECKPOINT,
            comfyui_url=config.COMFYUI_URL,
        )
        print(f"           → {img_path.name}")

    # ── 3. Synthesize audio ───────────────────────────────────────────────────
    print(f"\n── [3/4] Synthesizing audio ─────────────────────────────────────────")
    _write_status(3, 4, "Sintetizando audio (Edge TTS)", 50, idea=idea_str,
                  detail=f"0/{len(script.scenes)} escenas")
    scene_audio: dict[int, Path] = {}

    for scene in script.scenes:
        merged_path   = audio_dir / f"scene_{scene.number:03d}.wav"
        scene_sub_dir = audio_dir / f"scene_{scene.number:03d}"
        scene_sub_dir.mkdir(exist_ok=True)
        scene_audio[scene.number] = merged_path

        _write_status(3, 4, "Sintetizando audio (Edge TTS)",
                      50 + int(scene.number / len(script.scenes) * 25),
                      idea=idea_str, detail=f"Escena {scene.number}/{len(script.scenes)}")
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
    _write_status(4, 4, "Ensamblando video (FFmpeg)", 75, idea=idea_str,
                  detail=f"0/{len(script.scenes)} clips")
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
        _write_status(4, 4, "Ensamblando video (FFmpeg)",
                      75 + int(scene.number / len(script.scenes) * 20),
                      idea=idea_str, detail=f"Clip {scene.number}/{len(script.scenes)}")
        clip_paths.append(clip_path)

    # Concatenate clips
    raw_path = job_dir / "raw.mp4"
    print("  Concatenating clips...")
    _write_status(4, 4, "Ensamblando video (FFmpeg)", 95, idea=idea_str, detail="Concatenando clips…")
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
    _write_status(4, 4, "¡Video listo!", 100, idea=idea_str,
                  detail=str(output_path.name), done=True)
    print(f"\n{'─'*60}")
    print(f"  Done!  →  {output_path}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
