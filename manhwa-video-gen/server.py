"""
server.py — Servidor del dashboard manhwa-video-gen
====================================================
Sirve dashboard.html + endpoints REST para controlar el pipeline.

Endpoints
---------
  GET  /                    → dashboard.html
  GET  /api/status          → pipeline_status.json (último estado)
  GET  /api/system          → estado del sistema (backends, ffmpeg, etc.)
  POST /api/run             → inicia pipeline   body: {idea, genre, backend, num_scenes}
  POST /api/stop            → cancela pipeline en curso
  GET  /output/<file>       → sirve archivos del directorio output/

Uso
---
  python server.py          → http://localhost:5274
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import unquote

PORT    = 5274
BASE    = Path(__file__).parent
OUTPUT  = BASE / "output"

# ── Cargar .env.local si existe (para desarrollo sin bat file) ────────────────
_env_file = BASE / ".env.local"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

# ── Estado del pipeline en memoria ───────────────────────────────────────────
_pipeline_proc: subprocess.Popen | None = None
_pipeline_lock = threading.Lock()


def _pipeline_running() -> bool:
    global _pipeline_proc
    with _pipeline_lock:
        if _pipeline_proc is None:
            return False
        if _pipeline_proc.poll() is not None:
            _pipeline_proc = None
            return False
        return True


# ── Detección de backends disponibles ────────────────────────────────────────

def _check_backend(name: str) -> dict:
    """Verifica si un backend de IA está disponible."""
    if name == "ollama":
        try:
            import urllib.request
            with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=3) as r:
                data = json.loads(r.read())
                models = [m["name"] for m in data.get("models", [])]
                return {"ok": bool(models), "models": models}
        except Exception:
            return {"ok": False, "models": []}

    if name == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        return {"ok": bool(key), "key_set": bool(key)}

    if name == "gemini":
        key = os.environ.get("GEMINI_API_KEY", "")
        return {"ok": bool(key), "key_set": bool(key)}

    return {"ok": False}


def _check_tool(cmd: list[str]) -> bool:
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=4)
        return r.returncode == 0
    except Exception:
        return False


def get_system_status() -> dict:
    # Cargar config para estilos + free_tier_limits
    try:
        import config as _cfg
        styles_data = {
            k: {"label": v["label"], "emoji": v.get("emoji", "")}
            for k, v in _cfg.STYLES.items()
        }
        free_limits = _cfg.FREE_TIER_LIMITS
        voices = _cfg.EDGE_VOICES_ES
    except Exception:
        styles_data = {"manhwa": {"label": "Manhwa", "emoji": "📖"}}
        free_limits = {}
        voices = {"Jorge (MX)": "es-MX-JorgeNeural"}

    backends = {
        "ollama":    _check_backend("ollama"),
        "anthropic": _check_backend("anthropic"),
        "gemini":    _check_backend("gemini"),
    }
    # Mejor backend GRATIS disponible para story gen
    best = next(
        (b for b in ["gemini", "ollama", "anthropic"] if backends[b]["ok"]),
        None
    )
    ffmpeg = _check_tool(["ffmpeg", "-version"])

    # Backends de imagen — sin network checks (evitan bloquear el handler single-thread)
    gemini_img_ok   = bool(os.environ.get("GEMINI_API_KEY"))
    hf_ok           = bool(os.environ.get("HF_API_TOKEN"))
    pollinations_ok = True   # API pública, siempre disponible
    comfyui_ok      = False  # requiere GPU local, se verifica al lanzar pipeline

    image_backends = {
        "placeholder":  {"ok": True,             "label": "Placeholder estilizado", "free": True,  "limit_key": "placeholder"},
        "pollinations": {"ok": pollinations_ok,  "label": "Pollinations.AI FLUX",   "free": True,  "limit_key": "pollinations"},
        "huggingface":  {"ok": True,             "label": "HuggingFace SDXL",       "free": True,  "limit_key": "huggingface"},
        "gemini":       {"ok": gemini_img_ok,    "label": "Gemini Imagen 3",        "free": False, "limit_key": "gemini_imagen"},
        "comfyui":      {"ok": comfyui_ok,       "label": "ComfyUI local",          "free": True,  "limit_key": "comfyui"},
    }

    # Auto-select: mejor gratis disponible (excluye gemini imagen que requiere billing)
    auto_best_image = "pollinations"  # default gratis sin billing
    for candidate in ["comfyui", "huggingface", "pollinations"]:
        if image_backends.get(candidate, {}).get("ok") and image_backends[candidate].get("free"):
            auto_best_image = candidate
            break

    return {
        "backends":      backends,
        "best_backend":  best,
        "ffmpeg":        ffmpeg,
        "pipeline_running": _pipeline_running(),
        "image_backends": image_backends,
        "tts_voices": voices,
        "styles": styles_data,
        "free_tier_limits": free_limits,
        "auto_best": {
            "story": best or "ollama",
            "image": auto_best_image,
            "audio": "edge",
            "style": "realista",  # estilo más realista por defecto para modo auto
        },
    }


def get_pipeline_status() -> dict:
    status_file = OUTPUT / "pipeline_status.json"
    try:
        return json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def list_output_videos() -> list[dict]:
    """Lista los MP4 generados más recientes."""
    try:
        mp4s = sorted(OUTPUT.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [
            {
                "name": p.name,
                "size_kb": round(p.stat().st_size / 1024),
                "url": f"/output/{p.name}",
                "ts": int(p.stat().st_mtime),
            }
            for p in mp4s[:5]
        ]
    except Exception:
        return []


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silenciar logs verbosos

    # ── CORS helper ──────────────────────────────────────────────────────────
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── JSON response helper ─────────────────────────────────────────────────
    def _json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    # ── Static file helper ───────────────────────────────────────────────────
    def _serve_file(self, path: Path):
        if not path.exists() or not path.is_file():
            self.send_response(404)
            self.end_headers()
            return
        ext = path.suffix.lower()
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".js":   "application/javascript",
            ".css":  "text/css",
            ".json": "application/json",
            ".png":  "image/png",
            ".jpg":  "image/jpeg",
            ".mp4":  "video/mp4",
            ".wav":  "audio/wav",
            ".mp3":  "audio/mpeg",
        }.get(ext, "application/octet-stream")
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    # ── GET ──────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = unquote(self.path.split("?")[0])

        if path in ("/", "/dashboard.html", "/index.html"):
            self._serve_file(BASE / "dashboard.html")

        elif path == "/api/status":
            status = get_pipeline_status()
            status["pipeline_running"] = _pipeline_running()
            status["videos"] = list_output_videos()
            self._json(status)

        elif path == "/api/system":
            self._json(get_system_status())

        elif path.startswith("/output/"):
            fname = path[len("/output/"):]
            self._serve_file(OUTPUT / fname)

        else:
            # Intentar servir como archivo estático
            self._serve_file(BASE / path.lstrip("/"))

    # ── POST ─────────────────────────────────────────────────────────────────
    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if path == "/api/run":
            self._handle_run(body)

        elif path == "/api/stop":
            self._handle_stop()

        else:
            self._json({"error": "endpoint no encontrado"}, 404)

    def _handle_run(self, params: dict):
        global _pipeline_proc

        if _pipeline_running():
            self._json({"error": "Pipeline ya en curso", "running": True}, 409)
            return

        idea = params.get("idea", "").strip()
        if not idea:
            self._json({"error": "Se requiere una idea"}, 400)
            return

        genre      = params.get("genre", "auto")
        backend    = params.get("backend", "auto")
        num_scenes = int(params.get("num_scenes", 4))
        skip_images= params.get("skip_images", True)   # default: sin imágenes hasta tener ComfyUI
        no_music   = params.get("no_music", False)
        image_backend = params.get("image_backend", "pollinations")
        style      = params.get("style", "manhwa")
        voice_key  = params.get("voice", "")

        # Auto-seleccionar backend si se pide
        if backend == "auto":
            sys_st = get_system_status()
            backend = sys_st.get("best_backend") or "ollama"

        # Auto-seleccionar image backend si se pide
        if image_backend == "auto":
            sys_st = get_system_status()
            image_backend = sys_st.get("auto_best", {}).get("image", "pollinations")

        cmd = [
            sys.executable, str(BASE / "main.py"),
            "--idea", idea,
            "--genre", genre,
            "--backend", backend,
            "--num-scenes", str(num_scenes),
            "--style", style,
        ]
        if skip_images:
            cmd.append("--skip-images")
        if not skip_images:
            cmd.extend(["--image-backend", image_backend])
        if no_music:
            cmd.append("--no-music")
        if voice_key:
            cmd.extend(["--voice", voice_key])

        env = {**os.environ,
               "PYTHONUTF8": "1",
               "PYTHONIOENCODING": "utf-8",
               "OLLAMA_MODELS": r"D:\.ollama\models"}

        with _pipeline_lock:
            _pipeline_proc = subprocess.Popen(
                cmd,
                cwd=str(BASE),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        self._json({
            "started": True,
            "pid": _pipeline_proc.pid,
            "backend": backend,
            "idea": idea,
        })

    def _handle_stop(self):
        global _pipeline_proc
        with _pipeline_lock:
            if _pipeline_proc is None or _pipeline_proc.poll() is not None:
                _pipeline_proc = None
                self._json({"stopped": False, "msg": "No hay pipeline activo"})
                return
            try:
                _pipeline_proc.terminate()
                time.sleep(0.5)
                if _pipeline_proc.poll() is None:
                    _pipeline_proc.kill()
                _pipeline_proc = None
                self._json({"stopped": True})
            except Exception as e:
                self._json({"stopped": False, "error": str(e)})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    print(f"  manhwa-video-gen dashboard")
    print(f"  http://localhost:{PORT}")
    print(f"  Ctrl+C para detener")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
