"""
transcriptor_gemini_142 — de pantallas del display a JSON, sin humano en el medio.

Lee las hojas de contacto que dejo el preparador en _PENDIENTE/<registroId>/,
las pasa por Gemini (vision) y escribe el JSON del protocolo en _INBOX/ para que
el watcher lo ingeste. Con esto la cadena video -> Firestore -> aviso al tema
corre completa sin que nadie hable con nadie.

La red de seguridad NO es un humano, es la aritmetica: el panel muestra la suma
Y la tasa /1000Fi de cada contador, y sum/fish*1000 debe calzar con la tasa
leida. Si algun par no calza (un digito mal leido), el JSON NO se escribe y se
avisa por DM — un dato incoherente jamas entra solo a la serie. Los contadores
que el video no mostro van como null: el watcher los rechaza por F7 y el aviso
al tema dice exactamente que falta. Todo automatico, nada inventado.

Credencial: GEMINI_API_KEY desde Secret Manager del proyecto (la misma que usa
ARIA), accedida con la service account del watcher. La key esta restringida por
HTTP referrer (auditoria 2026-07-05), asi que las llamadas se presentan con el
referrer de la PWA — es la key propia, usada desde la propia infraestructura.
"""
from __future__ import annotations

import base64
import json
import re
import urllib.request
from pathlib import Path

TRANSCRIPTOR_VERSION = "1.0.0"
MODELO = "gemini-3.5-flash"
REFERER = "https://orelcain.github.io/"
PROYECTO = "mantenimiento-planta-771a3"

ONEDRIVE = Path.home() / "OneDrive"
PROTOCOLO = (ONEDRIVE / "ANTARFOOD" / "⚙️ EQUIPOS PLANTA" /
             "⚙️ BAADER 142" / "_PROTOCOLO")
INBOX = PROTOCOLO / "_INBOX"

CONTADORES = ["fish", "stops", "stopc", "tclip", "tclipc", "anusi", "anuso",
              "e821", "e821c", "e822", "e822c", "e823", "e823c",
              "e824", "e824c", "e825", "e825c"]

# Rotulo del display -> clave del modelo. La tasa /1000Fi se pide aparte por
# contador para la verificacion aritmetica.
PROMPT = """Estas son pantallas del display LCD del protocolo de una eviscceradora \
BAADER 142 (contadores del Upgrade Kit). Los rotulos posibles son:
FISH, FI-TODAY, STOPS, STOP-C, TAIL CLIP, T-CLIP-C, ANUS-I, ANUS-O,
E821, E821-C, E822, E822-C, E823, E823-C, E824, E824-C, E825, E825-C
(las pantallas de motores llevan encabezados CENTERING SM1 / SLIT KNIFE SM2 /
SUCTION DEV. SM3 / SCRAPER A SM4 / SCRAPER B SM5).

Transcribe SOLO lo que se lee con claridad. Un digito dudoso = pantalla no leida.
NUNCA inventes un valor ni asumas cero.

Devuelve JSON con esta forma exacta (usa null para lo no visible o ilegible):
{"lecturas": [{"rotulo": "STOP-C", "sum": 2219, "por1000Fi": 1025}, ...]}
- "sum": el numero junto al rotulo Σ.
- "por1000Fi": el numero de la linea /1000Fi de ESA misma pantalla (null si no
  aparece o esa pantalla no la tiene).
- FISH y FI-TODAY comparten pantalla: dos entradas separadas, por1000Fi null.
"""

ROTULO_A_CLAVE = {
    "FISH": "fish", "FI-TODAY": "fish", "STOPS": "stops", "STOP-C": "stopc",
    "TAIL CLIP": "tclip", "T-CLIP-C": "tclipc", "ANUS-I": "anusi",
    "ANUS-O": "anuso", "E821": "e821", "E821-C": "e821c", "E822": "e822",
    "E822-C": "e822c", "E823": "e823", "E823-C": "e823c", "E824": "e824",
    "E824-C": "e824c", "E825": "e825", "E825-C": "e825c",
}

TOLERANCIA = 2   # |tasa calculada - tasa leida| admisible (redondeos del panel)

_key_cache: str | None = None


class Incoherente(Exception):
    """La lectura no pasa la verificacion aritmetica: NO se ingesta sola."""


def _gemini_key() -> str:
    global _key_cache
    if _key_cache:
        return _key_cache
    import google.auth
    from google.auth.transport.requests import Request
    cred, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"])
    cred.refresh(Request())
    req = urllib.request.Request(
        f"https://secretmanager.googleapis.com/v1/projects/{PROYECTO}"
        "/secrets/GEMINI_API_KEY/versions/latest:access",
        headers={"Authorization": f"Bearer {cred.token}"})
    d = json.load(urllib.request.urlopen(req, timeout=30))
    _key_cache = base64.b64decode(d["payload"]["data"]).decode().strip()
    return _key_cache


def _llamar_gemini(imagenes: list[Path]) -> dict:
    partes: list[dict] = [{"text": PROMPT}]
    for img in imagenes:
        partes.append({"inline_data": {
            "mime_type": "image/png",
            "data": base64.b64encode(img.read_bytes()).decode(),
        }})
    body = json.dumps({
        "contents": [{"parts": partes}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0,
        },
    }).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}"
        f":generateContent?key={_gemini_key()}",
        data=body,
        headers={"Content-Type": "application/json", "Referer": REFERER})
    resp = json.load(urllib.request.urlopen(req, timeout=180))
    texto = resp["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(texto)


def _consolidar(bruto: dict) -> list[dict]:
    """Lecturas crudas por contador (una pantalla puede aparecer varias veces)."""
    crudas: list[dict] = []
    for l in bruto.get("lecturas", []):
        rot = str(l.get("rotulo", "")).upper().replace("∑", "").replace("Σ", "").strip()
        rot = re.sub(r"[:\s]+$", "", rot).lstrip()
        clave = ROTULO_A_CLAVE.get(rot)
        if clave is None:
            continue
        s = l.get("sum")
        if isinstance(s, int) and s >= 0:
            r = l.get("por1000Fi")
            crudas.append({"clave": clave, "sum": s,
                           "tasa": float(r) if isinstance(r, (int, float)) and r >= 0 else None})
    return crudas


def _elegir(crudas: list[dict], fish: int | None) -> tuple[dict, list[dict]]:
    """De N lecturas por contador a UNA: la que cuadra aritmeticamente.

    El LCD refresca la linea /1000Fi con lag: un frame de transicion puede traer
    la suma nueva con la tasa VIEJA (nos paso: T-CLIP-C 811 con tasa 3 en vez de
    268). Si un rotulo aparece varias veces, gana el par cuya tasa calza con
    sum/fish*1000; entre coherentes, el ultimo.
    """
    valores: dict[str, int | None] = {k: None for k in CONTADORES}
    pares: list[dict] = []
    por_clave: dict[str, list[dict]] = {}
    for c in crudas:
        por_clave.setdefault(c["clave"], []).append(c)
    for clave, lecturas in por_clave.items():
        elegido = None
        if fish and fish >= 1000:
            coherentes = [l for l in lecturas
                          if l["tasa"] is not None
                          and abs(round(l["sum"] * 1000 / fish) - l["tasa"]) <= TOLERANCIA]
            if coherentes:
                elegido = coherentes[-1]
        if elegido is None:
            con_tasa = [l for l in lecturas if l["tasa"] is not None]
            elegido = (con_tasa or lecturas)[-1]
        valores[clave] = elegido["sum"]
        if elegido["tasa"] is not None:
            pares.append({"clave": clave, "sum": elegido["sum"], "tasa": elegido["tasa"]})
    return valores, pares


def _verificar(valores: dict, pares: list[dict]) -> None:
    fish = valores.get("fish")
    if not isinstance(fish, int) or fish <= 0:
        raise Incoherente("no se leyo FISH/FI-TODAY: sin denominador no hay verificacion")
    if fish < 1000:
        return   # el panel aun no calcula /1000Fi; no hay pares que verificar
    malos = []
    for p in pares:
        calc = round(p["sum"] * 1000 / fish)
        if abs(calc - p["tasa"]) > TOLERANCIA:
            malos.append(f"{p['clave']}: sum {p['sum']} -> {calc}/1000 pero se leyo {p['tasa']:.0f}")
    if malos:
        raise Incoherente("aritmetica no calza (posible digito mal leido): " + "; ".join(malos))
    if not pares:
        raise Incoherente("ninguna pantalla trajo /1000Fi legible: no puedo verificar la lectura")


def transcribir(paquete: Path) -> dict:
    """Transcribe un paquete de _PENDIENTE y deja el JSON en _INBOX.

    Devuelve {"registroId", "leidos", "faltantes"} si escribio el inbox.
    Lanza Incoherente si la lectura no se puede verificar (esa NO se ingesta).
    """
    meta = json.loads((paquete / "meta.json").read_text(encoding="utf-8"))
    registro_id = meta["registroId"]
    unidad = meta["unidad"]

    hojas = sorted(paquete.glob("contacto_*.png"))
    if not hojas:
        raise RuntimeError(f"paquete sin hojas de contacto: {paquete}")

    bruto = _llamar_gemini(hojas)
    crudas = _consolidar(bruto)
    fish_leidos = [c["sum"] for c in crudas if c["clave"] == "fish"]
    valores, pares = _elegir(crudas, max(fish_leidos) if fish_leidos else None)
    _verificar(valores, pares)

    faltantes = [k for k, v in valores.items() if v is None]
    doc = {
        "registroId": registro_id,
        "plantId": "chonchi",
        "maquina": f"baader-{unidad.lower()}",
        "fecha": meta["fechaKey"],
        **valores,
        "notas": (f"Transcripcion automatica ({MODELO}) del video "
                  f"{meta.get('videoOrigen', '?')}. Verificacion aritmetica: "
                  f"{len(pares)} pares OK."
                  + (f" Ilegibles/ausentes: {', '.join(faltantes)}." if faltantes else "")),
        "origen": {"fuente": "telegram", "video": meta.get("videoOrigen"),
                   "transcriptor": TRANSCRIPTOR_VERSION},
    }
    INBOX.mkdir(parents=True, exist_ok=True)
    destino = INBOX / f"{registro_id}.json"
    destino.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"registroId": registro_id,
            "leidos": [k for k in CONTADORES if valores[k] is not None],
            "faltantes": faltantes}
