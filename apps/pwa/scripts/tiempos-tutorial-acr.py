"""Mide las palabras de cada audio del tutorial del ACR (Whisper large-v3, marcas por palabra) y escribe
src/components/acr/tiemposTutorialAcr.json, que ancla los gestos del tutorial a lo que dice ARIA.

Correr cada vez que se regrabe o se agregue un audio en public/tutorial-acr (el test
`tutorialSincronia.test.ts` falla si un audio cambió y su medida no):

    python -I apps/pwa/scripts/tiempos-tutorial-acr.py

Requiere faster-whisper y ffmpeg (los tiene el PC de Orel; ver aiko/voz/clon_local).
"""
import json, os, re, subprocess, unicodedata
import numpy as np
from faster_whisper import WhisperModel

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIOS = os.path.join(RAIZ, "public", "tutorial-acr")
SALIDA = os.path.join(RAIZ, "src", "components", "acr", "tiemposTutorialAcr.json")
SR = 16000


def normalizar(s: str) -> str:
    """Igual que `normalizarPalabra` de tutorialAcr.ts: minúsculas, sin tildes ni signos."""
    s = unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s)


def cargar(p):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


wm = WhisperModel("large-v3", device="cuda", compute_type="float16")
salida = {}
for nombre in sorted(f for f in os.listdir(AUDIOS) if f.endswith(".mp3")):
    ruta = os.path.join(AUDIOS, nombre)
    x = cargar(ruta)
    seg, _ = wm.transcribe(x, language="es", beam_size=5, word_timestamps=True, vad_filter=False,
                           initial_prompt="Bitácora, chapaleta, N1, N2, ARIA, resorte, engrase.")
    palabras = []
    for s in seg:
        for w in s.words:
            p = normalizar(w.word)
            if p:
                palabras.append([p, round(w.start, 2)])
    salida[nombre] = {"bytes": os.path.getsize(ruta), "duracion": round(len(x) / SR, 2), "palabras": palabras}
    print(nombre, salida[nombre]["duracion"], len(palabras), flush=True)

with open(SALIDA, "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")
print("escrito", SALIDA)
