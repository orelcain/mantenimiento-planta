"""
preparador_videos_142 — de video del panel BAADER 142 a paquete de pantallas.

Toma el video que el sync de Telegram dejo en OneDrive, extrae los frames, localiza
el display LCD (verde sobre panel azul), deduplica por contenido y deja las pantallas
unicas listas para transcribir.

NO transcribe: eso requiere vision (ver SPEC seccion 5).

Uso:
    python preparador_videos_142.py --video <ruta.mp4> --unidad N2 --fecha 2026-08-21
    python preparador_videos_142.py --tema "<carpeta del tema de Telegram>"

Salida: _PROTOCOLO/_PENDIENTE/{registroId}/  con p_NN.png, contacto_NN.png y meta.json
"""
from __future__ import annotations

import argparse
import json
import re

import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

VERSION = "1.0.0"

ONEDRIVE = Path.home() / "OneDrive"
PROTOCOLO = (ONEDRIVE / "ANTARFOOD" / "⚙️ EQUIPOS PLANTA" /
             "⚙️ BAADER 142" / "_PROTOCOLO")
PENDIENTE = PROTOCOLO / "_PENDIENTE"

FPS = 2                 # 2 fps: a 1 fps se pierden pantallas de ~3 s
ANCHO_SALIDA = 1400     # ancho al que se amplia el display recortado
HAMMING_DUP = 6         # distancia dHash bajo la cual dos pantallas son la misma
FILAS_HOJA = 8          # pantallas por hoja de contacto

# LCD amarillo-verde del panel BAADER, en HSV de OpenCV (H 0-179)
HSV_LO = np.array([22, 70, 90], dtype=np.uint8)
HSV_HI = np.array([48, 255, 255], dtype=np.uint8)

RE_FECHA = re.compile(r"(\d{4}-\d{2}-\d{2})")
RE_UNIDAD = re.compile(r"\bN([123])\b", re.IGNORECASE)


def log(msg: str) -> None:
    # Las rutas llevan emoji; la consola de Windows es cp1252 por defecto.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(msg, flush=True)


# ---------------------------------------------------------------- extraccion

def extraer_frames(video: Path, destino: Path) -> list[Path]:
    destino.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(video),
           "-vf", f"fps={FPS}", str(destino / "f_%04d.png")]
    subprocess.run(cmd, check=True)
    return sorted(destino.glob("f_*.png"))


# ------------------------------------------------------------- deteccion LCD

def detectar_display(img: np.ndarray) -> tuple[int, int, int, int] | None:
    """Devuelve (x, y, w, h) del display, o None si no se ve en este frame.

    Recorte fijo NO sirve: la camara se mueve y el display sale del recuadro.
    Se localiza por color en cada frame.
    """
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, HSV_LO, HSV_HI)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    contornos, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contornos:
        return None

    alto_img, ancho_img = img.shape[:2]
    area_min = (alto_img * ancho_img) * 0.008
    mejor = None
    for c in contornos:
        x, y, w, h = cv2.boundingRect(c)
        if w * h < area_min or h == 0:
            continue
        rel = w / h
        if not (1.8 <= rel <= 12.0):      # el display es marcadamente apaisado
            continue
        if mejor is None or w * h > mejor[2] * mejor[3]:
            mejor = (x, y, w, h)
    return mejor


def recortar(img: np.ndarray, caja: tuple[int, int, int, int]) -> np.ndarray:
    x, y, w, h = caja
    pad_x, pad_y = int(w * 0.04), int(h * 0.18)
    alto, ancho = img.shape[:2]
    x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
    x1, y1 = min(ancho, x + w + pad_x), min(alto, y + h + pad_y)
    rec = img[y0:y1, x0:x1]
    if rec.size == 0:
        return rec
    escala = ANCHO_SALIDA / rec.shape[1]
    return cv2.resize(rec, (ANCHO_SALIDA, max(1, int(rec.shape[0] * escala))),
                      interpolation=cv2.INTER_LANCZOS4)


# ------------------------------------------------------------------- dedupe

def guardar_png(ruta: Path, img: np.ndarray) -> None:
    """cv2.imwrite falla en silencio con rutas no-ASCII en Windows.

    La ruta de _PROTOCOLO lleva emoji, asi que se codifica en memoria y se
    escriben los bytes con pathlib.
    """
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError(f"No se pudo codificar PNG: {ruta.name}")
    ruta.write_bytes(buf.tobytes())


def dhash(img: np.ndarray, lado: int = 8) -> int:
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (lado + 1, lado), interpolation=cv2.INTER_AREA)
    bits = g[:, 1:] > g[:, :-1]
    v = 0
    for b in bits.flatten():
        v = (v << 1) | int(b)
    return v


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def nitidez(img: np.ndarray) -> float:
    return cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()


# -------------------------------------------------------------------- hojas

def hojas_de_contacto(pantallas: list[np.ndarray], destino: Path) -> list[Path]:
    salidas = []
    for i in range(0, len(pantallas), FILAS_HOJA):
        grupo = pantallas[i:i + FILAS_HOJA]
        ancho = max(p.shape[1] for p in grupo)
        piezas = []
        for p in grupo:
            if p.shape[1] != ancho:
                p = cv2.copyMakeBorder(p, 0, 0, 0, ancho - p.shape[1],
                                       cv2.BORDER_CONSTANT, value=(0, 0, 0))
            piezas.append(p)
            piezas.append(np.zeros((6, ancho, 3), dtype=np.uint8))
        hoja = np.vstack(piezas[:-1])
        ruta = destino / f"contacto_{i // FILAS_HOJA + 1:02d}.png"
        guardar_png(ruta, hoja)
        salidas.append(ruta)
    return salidas


# --------------------------------------------------------------------- main

def procesar(video: Path, unidad: str, fecha: str) -> Path:
    registro_id = f"{fecha}_{unidad}"
    destino = PENDIENTE / registro_id
    destino.mkdir(parents=True, exist_ok=True)
    # OneDrive bloquea el rmdir del directorio (WinError 5): se vacia el
    # contenido y se reusa la carpeta en vez de recrearla.
    for viejo in destino.iterdir():
        if viejo.is_file():
            try:
                viejo.unlink()
            except PermissionError:
                log(f"  [aviso] no se pudo borrar {viejo.name} (OneDrive lo tiene tomado)")

    with tempfile.TemporaryDirectory() as tmp:
        frames = extraer_frames(video, Path(tmp))
        log(f"  frames extraidos: {len(frames)}")

        candidatos: list[tuple[int, np.ndarray, float]] = []
        sin_display = 0
        for f in frames:
            img = cv2.imread(str(f))
            if img is None:
                continue
            caja = detectar_display(img)
            if caja is None:
                sin_display += 1
                continue
            rec = recortar(img, caja)
            if rec.size == 0:
                continue
            candidatos.append((dhash(rec), rec, nitidez(rec)))

        log(f"  display detectado en {len(candidatos)} / {len(frames)} "
            f"(sin display: {sin_display})")

    # dedupe conservando, por grupo, el frame mas nitido
    grupos: list[list[tuple[int, np.ndarray, float]]] = []
    for cand in candidatos:
        for g in grupos:
            if hamming(cand[0], g[0][0]) <= HAMMING_DUP:
                g.append(cand)
                break
        else:
            grupos.append([cand])

    pantallas = [max(g, key=lambda t: t[2])[1] for g in grupos]
    log(f"  pantallas unicas tras dedupe: {len(pantallas)}")

    for i, p in enumerate(pantallas, 1):
        guardar_png(destino / f"p_{i:02d}.png", p)
    hojas = hojas_de_contacto(pantallas, destino)

    meta = {
        "registroId": registro_id,
        "unidad": unidad,
        "fechaKey": fecha,
        "videoOrigen": video.name,
        "nPantallas": len(pantallas),
        "nFramesConDisplay": len(candidatos),
        "hojas": [h.name for h in hojas],
        "preparadorVersion": VERSION,
    }
    (destino / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return destino


def desde_tema(carpeta: Path) -> tuple[Path, str, str]:
    indice = json.loads((carpeta / "_indice.json").read_text(encoding="utf-8"))
    m = RE_UNIDAD.search(indice.get("tema", "") or carpeta.name)
    if not m:
        raise SystemExit(f"No se pudo deducir la unidad del tema: {carpeta.name}")
    unidad = "N" + m.group(1)

    videos = [it for it in indice.get("items", []) if it.get("tipo") == "video"]
    if not videos:
        raise SystemExit("El tema no tiene videos.")
    ultimo = max(videos, key=lambda it: it.get("id", 0))

    fm = RE_FECHA.search(str(ultimo.get("fecha", "")))
    if not fm:
        raise SystemExit("El item no trae fecha usable.")

    archivos = sorted(carpeta.glob("*.mp4")) + sorted(carpeta.glob("*.MP4"))
    if not archivos:
        raise SystemExit("No hay archivo .mp4 en la carpeta del tema.")
    return archivos[-1], unidad, fm.group(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video")
    ap.add_argument("--unidad")
    ap.add_argument("--fecha")
    ap.add_argument("--tema")
    a = ap.parse_args()

    if a.tema:
        video, unidad, fecha = desde_tema(Path(a.tema))
    elif a.video and a.unidad and a.fecha:
        video, unidad, fecha = Path(a.video), a.unidad.upper(), a.fecha
    else:
        raise SystemExit("Usar --tema <carpeta>  o  --video + --unidad + --fecha")

    log(f"Video   : {video.name}")
    log(f"Registro: {fecha}_{unidad}")
    destino = procesar(video, unidad, fecha)
    log(f"Listo -> {destino}")


if __name__ == "__main__":
    sys.exit(main())
