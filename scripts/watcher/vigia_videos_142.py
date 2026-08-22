"""
vigia_videos_142 — dispara el preparador cuando llega un video nuevo del protocolo.

Corre DENTRO del bucle del watcher (mismo proceso, misma tarea programada): cada
~5 minutos busca videos nuevos en los temas PROTOCOLO BAA142 N1/N2/N3, corre el
preparador (video -> pantallas del display) y avisa por DM a Orel que hay un
paquete pendiente de transcripcion.

⚠ El video se MUEVE de carpeta durante su vida (verificado 2026-08-22): el sync lo
deja en `_DESCARGAS_TELEGRAM/<grupo>/<tema>/0002_nombre.mp4` y minutos despues
`organizar_telegram.py --apply` lo lleva a
`⚙️ EQUIPOS PLANTA/POR CLASIFICAR/<tema>/VIDEOS/451_nombre.mp4` — con OTRO prefijo
(msgId en vez de orden). Por eso el vigia:
  - mira LAS DOS ubicaciones por tema, y
  - identifica cada video por su NOMBRE SIN PREFIJO (`video_2026-08-21_20-32-16.mp4`),
    que es lo unico estable entre las dos etapas.

Por que el aviso va al DM y no al tema: la transcripcion es un paso interno (la
hace Claude con vision); el tema del operador recibe UN mensaje por video — el del
resultado (protocoloIngesta). "Recibido/procesando" ahi seria ruido.

Estado en _PROTOCOLO/_estado_vigia.json: nombres ya procesados por tema.
"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

VIGIA_VERSION = "1.1.0"

ONEDRIVE = Path.home() / "OneDrive"
PROTOCOLO = (ONEDRIVE / "ANTARFOOD" / "⚙️ EQUIPOS PLANTA" /
             "⚙️ BAADER 142" / "_PROTOCOLO")
ESTADO = PROTOCOLO / "_estado_vigia.json"

GRUPO = "Manuales e informacion mantencion"
FRESCO = ONEDRIVE / "_DESCARGAS_TELEGRAM" / GRUPO
CLASIFICADO = ONEDRIVE / "ANTARFOOD" / "⚙️ EQUIPOS PLANTA" / "POR CLASIFICAR"

# El .env de functions es la fuente del token del bot en este PC (gitignoreado).
ENV_FUNCTIONS = Path(r"D:\a\APP leventamiento de insidencias en planta\functions\.env")
CHAT_ORELCAIN = "52949422"   # DM de Orel (mismo ARIA_ADMIN_CHAT_ID de functions)

TEMAS = {
    "PROTOCOLO BAA142 N1": "N1",
    "PROTOCOLO BAA142 N2": "N2",
    "PROTOCOLO BAA142 N3": "N3",
}

RE_FECHA = re.compile(r"(\d{4}-\d{2}-\d{2})")
RE_PREFIJO = re.compile(r"^\d+_")
EXTENSIONES = (".mp4", ".mov")
EDAD_MINIMA_S = 60   # no tocar un archivo recien escrito/movido


def _leer_estado() -> dict:
    try:
        return json.loads(ESTADO.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _guardar_estado(est: dict) -> None:
    ESTADO.write_text(json.dumps(est, ensure_ascii=False, indent=2), encoding="utf-8")


def _token_bot() -> str | None:
    try:
        m = re.search(r"^TELEGRAM_BOT_TOKEN=(.+)$",
                      ENV_FUNCTIONS.read_text(encoding="utf-8"), re.M)
        return m.group(1).strip().strip('"') if m else None
    except Exception:
        return None


def avisar_dm(texto: str, log) -> None:
    """DM a Orel. Nunca voltea al vigia por no poder avisar."""
    tok = _token_bot()
    if not tok:
        log("  [vigia] sin token de bot: aviso omitido")
        return
    try:
        data = urllib.parse.urlencode({
            "chat_id": CHAT_ORELCAIN, "text": texto, "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }).encode()
        urllib.request.urlopen(
            urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",
                                   data=data), timeout=20)
    except Exception as e:
        log(f"  [vigia] fallo el DM: {type(e).__name__}: {e}")


def _videos_en(carpeta: Path) -> list[Path]:
    if not carpeta.is_dir():
        return []
    return [f for f in carpeta.iterdir()
            if f.is_file() and f.suffix.lower() in EXTENSIONES]


def _clave(video: Path) -> str:
    """Identidad estable: el nombre sin el prefijo numerico que cambia al moverse."""
    return RE_PREFIJO.sub("", video.name)


def _candidatos(tema: str) -> list[Path]:
    """Videos del tema en sus dos etapas, deduplicados por clave (fresco gana)."""
    frescos = _videos_en(FRESCO / tema)
    finales = _videos_en(CLASIFICADO / tema / "VIDEOS")
    vistos: dict[str, Path] = {}
    for v in finales + frescos:      # frescos al final: pisan al duplicado movido
        vistos[_clave(v)] = v
    # orden por prefijo numerico: si hay varios del mismo dia, el ultimo pisa
    def prefijo(v: Path) -> int:
        m = re.match(r"^(\d+)_", v.name)
        return int(m.group(1)) if m else 0
    return sorted(vistos.values(), key=prefijo)


def vigia_tick(log) -> None:
    """Una pasada: prepara los videos aun no procesados de los tres temas."""
    from preparador_videos_142 import procesar

    est = _leer_estado()
    procesados: dict[str, list[str]] = est.setdefault("procesados", {})
    avisados: dict[str, bool] = est.setdefault("_fallosAvisados", {})

    for tema, unidad in TEMAS.items():
        hechos = set(procesados.get(tema, []))
        for video in _candidatos(tema):
            clave = _clave(video)
            if clave in hechos:
                continue
            try:
                st = video.stat()
            except OSError:
                continue          # lo estan moviendo justo ahora; proximo tick
            edad = datetime.now().timestamp() - st.st_mtime
            if st.st_size == 0 or edad < EDAD_MINIMA_S:
                log(f"  [vigia] {tema}: {video.name} muy reciente; reintento luego")
                continue

            m = RE_FECHA.search(clave)
            if not m:
                log(f"  [vigia] {tema}: {video.name} sin fecha en el nombre; lo salto")
                hechos.add(clave)
                procesados[tema] = sorted(hechos)
                _guardar_estado(est)
                continue
            fecha = m.group(1)

            log(f"  [vigia] {tema}: video nuevo {video.name} -> preparador")
            try:
                destino = procesar(video, unidad, fecha)
                meta = json.loads((destino / "meta.json").read_text(encoding="utf-8"))
                hechos.add(clave)
                procesados[tema] = sorted(hechos)
                _guardar_estado(est)
                log(f"  [vigia] {unidad} preparado: {meta.get('nPantallas')} pantallas "
                    f"en {destino.name}/")
                avisar_dm(
                    f"📼 <b>Video del protocolo {unidad} preparado</b>\n"
                    f"{meta.get('nPantallas')} pantallas únicas · {video.name}\n"
                    f"Paquete: <code>_PENDIENTE/{fecha}_{unidad}/</code>\n\n"
                    f"Pedile a Claude «transcribe el protocolo {unidad}» para cargarlo.",
                    log,
                )
            except Exception as e:
                # NO marcar como hecho: el proximo tick reintenta.
                log(f"  [vigia] FALLO preparando {video.name}: {type(e).__name__}: {e}")
                # el DM de error va UNA vez por video; los reintentos, en silencio
                marca = f"{tema}:{clave}"
                if not avisados.get(marca):
                    avisados[marca] = True
                    _guardar_estado(est)
                    avisar_dm(
                        f"⚠️ <b>Fallo preparando el video del protocolo {unidad}</b>\n"
                        f"{video.name}\n<code>{type(e).__name__}: {e}</code>\n"
                        f"Queda reintentando cada 5 min.",
                        log,
                    )
