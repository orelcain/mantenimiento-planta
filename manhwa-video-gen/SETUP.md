# Manhwa Video Generator — Setup Guide

> AI-powered pipeline: text script → manhwa-style images → voiced video → YouTube-ready MP4

## Requirements

| Tool | Install |
|------|---------|
| Python 3.11+ | https://python.org |
| FFmpeg + ffprobe | See below |
| ComfyUI | https://github.com/comfyanonymous/ComfyUI |
| Kokoro TTS models | See below |

---

## 1. Install FFmpeg

**Windows**
```
winget install ffmpeg
```
Or download from https://ffmpeg.org/download.html and add the `bin/` folder to PATH.

**Linux**
```bash
sudo apt install ffmpeg
```

**macOS**
```bash
brew install ffmpeg
```

---

## 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

---

## 3. Setup Kokoro TTS (local voice synthesis)

1. Download the model files from the [kokoro-onnx releases page](https://github.com/thewh1teagle/kokoro-onnx/releases):
   - `kokoro-v0_19.onnx`
   - `voices.json`
2. Place both files in the project root (same folder as `main.py`).

> **No GPU needed** — Kokoro runs on CPU via ONNX Runtime.

### Available voices

| ID | Gender | Style |
|----|--------|-------|
| `af_heart` | Female | Warm, expressive (default character) |
| `af_bella` | Female | Clear, neutral |
| `af_nicole` | Female | Soft |
| `am_michael` | Male | Deep, narrator (default narrator) |
| `am_adam` | Male | Natural |

---

## 4. Setup ComfyUI (local image generation)

1. Clone and run ComfyUI: https://github.com/comfyanonymous/ComfyUI
2. Download a checkpoint model into `ComfyUI/models/checkpoints/`.

### Recommended free checkpoints

| Model | Style | Download |
|-------|-------|----------|
| `anything-v5.safetensors` | Anime/manhwa, great characters | CivitAI |
| `dreamshaper_8.safetensors` | Versatile, photorealistic+stylized | CivitAI |
| `meinamix_meinaV11.safetensors` | Manhwa-specific | CivitAI |

3. Update `config.py` → `COMFYUI_CHECKPOINT` with your filename.
4. Start ComfyUI:
   ```bash
   python main.py   # inside ComfyUI folder
   ```
   Default URL: `http://localhost:8188`

---

## 5. Background music (optional)

Place royalty-free MP3 tracks in `assets/music/`.
Update `config.py` → `DEFAULT_MUSIC_TRACK` with the filename.

Free sources:
- YouTube Audio Library: https://studio.youtube.com/channel/UC.../music
- Freesound: https://freesound.org (CC0 license)
- Pixabay Music: https://pixabay.com/music/

---

## 6. Run the pipeline

```bash
# Full pipeline (images + voice + video + music)
python main.py --script scripts/the_girl_at_the_threshold.txt

# Skip image generation (reuse existing PNGs — much faster for re-runs)
python main.py --script scripts/my_story.txt --skip-images

# Skip TTS (reuse existing WAVs)
python main.py --script scripts/my_story.txt --skip-tts

# No background music
python main.py --script scripts/my_story.txt --no-music

# Custom output path
python main.py --script scripts/my_story.txt --output ~/Videos/episode_01.mp4
```

Output is saved to `output/<script-name>.mp4`.

---

## 7. Write your own script

```
TÍTULO: My Story Title

PERSONAJES:
  CHARACTER_NAME: physical description for image generation
  NARRATOR_2: another character description

ESCENA 1
FONDO: scene background description (becomes the image prompt)
NARRADOR: This is narration text — spoken by the narrator voice.
CHARACTER_NAME: This is dialogue — spoken by the character voice.

ESCENA 2
FONDO: next scene background...
```

### Tips for good image prompts (FONDO)

- Be specific: lighting, time of day, location, mood
- Include character actions: "girl standing at window, looking outside"
- Style keywords are added automatically (manhwa, webtoon, etc.)
- Example: `school rooftop at night, city lights below, wind blowing, dramatic lighting`

---

## Project structure

```
manhwa-video-gen/
├── main.py                    ← Entry point
├── config.py                  ← All settings (edit this)
├── requirements.txt
├── SETUP.md                   ← This file
├── kokoro-v0_19.onnx          ← TTS model (download separately)
├── voices.json                ← TTS voices (download separately)
├── modules/
│   ├── story_parser.py        ← Parse .txt script → scenes
│   ├── image_gen.py           ← ComfyUI image generation
│   ├── tts.py                 ← Kokoro / pyttsx3 voice synthesis
│   └── video_builder.py       ← FFmpeg video assembly
├── scripts/                   ← Your story scripts (.txt)
├── assets/
│   └── music/                 ← Background music tracks
├── output/                    ← Generated videos
└── comfyui_workflows/         ← Custom ComfyUI workflow JSONs
```

---

## Roadmap

- **Phase 1** (current) — Core pipeline: script → image → voice → video ✅
- **Phase 2** — AI story generation from a single idea sentence
- **Phase 3** — Character consistency via LoRA, subtitle overlay
- **Phase 4** — Gradio UI (no command line needed)
- **Phase 5** — Web SaaS version
