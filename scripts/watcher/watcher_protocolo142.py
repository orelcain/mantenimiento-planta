"""
watcher_protocolo142 — ingesta las lecturas del protocolo BAADER 142 a Firestore.

Vigila _PROTOCOLO/_INBOX/*.json y escribe en la coleccion baader142Protocolo,
la MISMA que usa el Centro de Aprendizaje (Perilla 5 -> Protocolo). No crea una
coleccion paralela: el modelo canonico vive en
apps/pwa/src/services/baader142/perilla5Protocolo.ts

Decisiones que importan (ver SPEC):
  * Sondeo cada 60 s comparando (size, mtime) en dos vueltas consecutivas.
    NO se usa watchdog: OneDrive entrega archivos a medio escribir.
  * ID de documento determinista {plantId}__{maquina}__{fecha} para que
    reprocesar el mismo archivo NO duplique la lectura. La app usa addDoc
    (id automatico); ambos conviven porque todas las queries son por campo.
  * Tras escribir se RELEE el documento y se comparan maquina, fecha y fish
    antes de dar la escritura por buena.
  * Credenciales por GOOGLE_APPLICATION_CREDENTIALS. El JSON de service
    account va fuera del repo.

Uso:
    set GOOGLE_APPLICATION_CREDENTIALS=C:\\secrets\\mantenimiento-planta-sa.json
    python watcher_protocolo142.py            # bucle permanente
    python watcher_protocolo142.py --una-vuelta   # una pasada y sale
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path

VERSION = "1.0.0"
COLECCION = "baader142Protocolo"
INGESTA = "baader142ProtocoloIngesta"

ONEDRIVE = Path.home() / "OneDrive"
PROTOCOLO = (ONEDRIVE / "ANTARFOOD" / "⚙️ EQUIPOS PLANTA" /
             "⚙️ BAADER 142" / "_PROTOCOLO")
INBOX = PROTOCOLO / "_INBOX"
ERROR = PROTOCOLO / "_ERROR"
PROCESADO = PROTOCOLO / "_PROCESADO"
LOG = PROTOCOLO / "_watcher.log"

INTERVALO = 60
MAQUINAS = {"baader-n1", "baader-n2", "baader-n3"}
RE_REGISTRO = re.compile(r"^\d{4}-\d{2}-\d{2}_N[123]$")
RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Los 17 contadores del modelo canonico (perilla5Protocolo.ts).
CONTADORES = ["fish", "stops", "stopc", "tclip", "tclipc", "anusi", "anuso",
              "e821", "e821c", "e822", "e822c", "e823", "e823c",
              "e824", "e824c", "e825", "e825c"]


def log(msg: str) -> None:
    linea = f"{datetime.now().isoformat(timespec='seconds')}  {msg}"
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(linea, flush=True)
    try:
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(linea + "\n")
    except Exception:
        pass


class ErrorValidacion(Exception):
    def __init__(self, regla: str, mensaje: str,
                 faltantes: list[str] | None = None) -> None:
        super().__init__(f"{regla}: {mensaje}")
        self.regla, self.mensaje = regla, mensaje
        self.faltantes = faltantes or []


# ------------------------------------------------------------------ validar

def validar(datos: object, nombre_archivo: str) -> dict:
    if not isinstance(datos, dict):
        raise ErrorValidacion("F1", "el JSON no es un objeto")

    reg = datos.get("registroId")
    if not isinstance(reg, str) or not RE_REGISTRO.match(reg):
        raise ErrorValidacion("F2", f"registroId invalido: {reg!r}")
    if reg != nombre_archivo:
        raise ErrorValidacion(
            "F3", f"registroId {reg!r} != nombre de archivo {nombre_archivo!r}")

    fecha = datos.get("fecha")
    if not isinstance(fecha, str) or not RE_FECHA.match(fecha):
        raise ErrorValidacion("F4", f"fecha invalida: {fecha!r}")
    try:
        f = date.fromisoformat(fecha)
    except ValueError:
        raise ErrorValidacion("F4", f"fecha no parseable: {fecha!r}")
    hoy = date.today()
    if f > hoy:
        raise ErrorValidacion("F4", f"fecha en el futuro: {fecha}")
    if f < hoy - timedelta(days=400):
        raise ErrorValidacion("F4", f"fecha de hace mas de 400 dias: {fecha}")
    if not reg.startswith(fecha):
        raise ErrorValidacion("F4", f"fecha {fecha} no coincide con registroId {reg}")

    maquina = datos.get("maquina")
    if maquina not in MAQUINAS:
        raise ErrorValidacion("F5", f"maquina invalida: {maquina!r}")
    if maquina[-2:].upper() != reg[-2:]:
        raise ErrorValidacion(
            "F5", f"maquina {maquina} no coincide con el sufijo de {reg}")

    plant = datos.get("plantId")
    if not isinstance(plant, str) or not (0 < len(plant) <= 40):
        raise ErrorValidacion("F5", f"plantId invalido: {plant!r}")

    faltantes, invalidos = [], []
    for k in CONTADORES:
        v = datos.get(k)
        if v is None:
            faltantes.append(k)
        elif not isinstance(v, int) or isinstance(v, bool) or v < 0:
            invalidos.append(k)
    if invalidos:
        raise ErrorValidacion("F8", f"contadores no enteros >= 0: {invalidos}")
    if faltantes:
        # Nunca se inventa un contador ausente: un cero inventado es
        # indistinguible de un cero real y contamina la serie para siempre.
        raise ErrorValidacion(
            "F7", faltantes=faltantes, mensaje=f"faltan {len(faltantes)} contadores: {faltantes}. "
                  "Completar con un barrido de las 13 pantallas o cargarlos "
                  "en el formulario del Centro de Aprendizaje.")

    fish = datos["fish"]
    if fish <= 0:
        raise ErrorValidacion("F6", "fish debe ser > 0")

    avisos = []
    if fish < 1000:
        avisos.append("W1 muestra insuficiente: el panel no muestra /1000Fi "
                      "antes de 1000 pescados")
    return {"avisos": avisos}


def registrar_ingesta(cliente, datos: dict, resultado: str, **extra) -> None:
    """Deja el resultado de la ingesta para que la Cloud Function avise en Telegram.

    Un doc por video, exito o rechazo. Sin esto, un video rechazado se perdia en
    silencio: le paso al video de la N2 del 21-08-2026.
    """
    from google.cloud import firestore
    doc = {
        "resultado": resultado,
        "plantId": datos.get("plantId", "chonchi"),
        "maquina": datos.get("maquina"),
        "fecha": datos.get("fecha"),
        "registroId": datos.get("registroId"),
        "fish": datos.get("fish"),
        "origen": datos.get("origen", {}),
        "watcherVersion": VERSION,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    if resultado == "ok":
        # los -C alimentan el semaforo del mensaje
        for k in ("e821c", "e822c", "e823c", "e824c", "e825c"):
            doc[k] = datos.get(k)
    else:
        # Los contadores que SI se leyeron: sin esto se perderian y habria que
        # tipear los 17 a mano. El formulario de la PWA los precarga desde aca
        # (borradorDeVideo). Los que faltan van ausentes, nunca en cero.
        doc["contadores"] = {
            k: datos.get(k) for k in CONTADORES if isinstance(datos.get(k), int)
        }
    doc.update(extra)
    try:
        cliente.collection(INGESTA).document(
            f"{datos.get('registroId') or 'sin-id'}__{resultado}").set(doc)
    except Exception as e:
        # Nunca voltear la ingesta por no poder avisar.
        log(f"  [aviso] no se pudo registrar la ingesta: {type(e).__name__}: {e}")

def doc_id(datos: dict) -> str:
    return f"{datos['plantId']}__{datos['maquina']}__{datos['fecha']}"


def armar_documento(datos: dict, avisos: list[str]) -> dict:
    doc = {k: datos[k] for k in CONTADORES}
    doc.update({
        "plantId": datos["plantId"],
        "maquina": datos["maquina"],
        "fecha": datos["fecha"],
        "notas": datos.get("notas", ""),
        "creadoPor": "watcher-protocolo142",
        "creadoPorNombre": "Watcher protocolo (automatico)",
        "registroId": datos["registroId"],
        "origen": datos.get("origen", {}),
        "muestraValida": datos["fish"] >= 1000,
        "avisos": avisos,
        "watcherVersion": VERSION,
    })
    return doc


# ----------------------------------------------------------------- escribir

def escribir(cliente, datos: dict, avisos: list[str]) -> str:
    from google.cloud import firestore

    did = doc_id(datos)
    ref = cliente.collection(COLECCION).document(did)
    doc = armar_documento(datos, avisos)
    doc["createdAt"] = firestore.SERVER_TIMESTAMP
    ref.set(doc)

    # Verificacion post-escritura: no basta con que set() no lance excepcion.
    leido = ref.get()
    if not leido.exists:
        raise RuntimeError("el documento no existe despues de escribirlo")
    d = leido.to_dict() or {}
    for campo, esperado in (("registroId", datos["registroId"]),
                            ("maquina", datos["maquina"]),
                            ("fecha", datos["fecha"]),
                            ("fish", datos["fish"])):
        if d.get(campo) != esperado:
            raise RuntimeError(
                f"relectura discrepa en {campo}: {d.get(campo)!r} != {esperado!r}")
    return did


# -------------------------------------------------------------- movimientos

def destino_libre(carpeta: Path, nombre: str) -> Path:
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / nombre
    i = 1
    while ruta.exists():
        ruta = carpeta / f"{nombre}.{i}"
        i += 1
    return ruta


def mover(origen: Path, carpeta: Path) -> Path:
    ruta = destino_libre(carpeta, origen.name)
    origen.replace(ruta)
    return ruta


def a_error(archivo: Path, regla: str, mensaje: str,
            cliente=None, datos: dict | None = None,
            faltantes: list[str] | None = None) -> None:
    destino = mover(archivo, ERROR)
    lado = destino.with_suffix(destino.suffix + ".error.json")
    lado.write_text(json.dumps({
        "cuando": datetime.now().isoformat(timespec="seconds"),
        "regla": regla, "mensaje": mensaje, "watcherVersion": VERSION,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  ERROR {regla}: {mensaje}")
    log(f"  -> {destino.name} + .error.json")
    if cliente is not None and datos:
        registrar_ingesta(cliente, datos, "rechazado", regla=regla,
                          mensaje=mensaje, faltantes=faltantes or [])


# ---------------------------------------------------------------- procesar

def procesar_archivo(cliente, archivo: Path) -> None:
    log(f"procesando {archivo.name}")
    try:
        datos = json.loads(archivo.read_text(encoding="utf-8"))
    except Exception as e:
        a_error(archivo, "F1", f"JSON invalido: {e}")
        return

    try:
        res = validar(datos, archivo.stem)
    except ErrorValidacion as e:
        a_error(archivo, e.regla, e.mensaje, cliente, datos, getattr(e, "faltantes", None))
        return

    for aviso in res["avisos"]:
        log(f"  aviso {aviso}")

    try:
        did = escribir(cliente, datos, res["avisos"])
    except Exception as e:
        a_error(archivo, "ESCRITURA", f"{type(e).__name__}: {e}", cliente, datos)
        return

    registrar_ingesta(cliente, datos, "ok")
    destino = mover(archivo, PROCESADO / datos["fecha"][:4])
    log(f"  OK -> {COLECCION}/{did}  (archivo en {destino.parent.name}/)")


# -------------------------------------------------------------------- ciclo

def json_estables(vistos: dict[str, tuple[int, int]]) -> list[Path]:
    listos, ahora = [], {}
    for f in sorted(INBOX.glob("*.json")):
        try:
            st = f.stat()
        except OSError:
            continue
        if st.st_size == 0:
            continue
        firma = (st.st_size, st.st_mtime_ns)
        ahora[f.name] = firma
        if vistos.get(f.name) == firma:
            listos.append(f)
    vistos.clear()
    vistos.update(ahora)
    return listos


def hacer_cliente():
    cred = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred:
        raise SystemExit(
            "GOOGLE_APPLICATION_CREDENTIALS no esta definida. Apuntala al JSON "
            "de service account (que va FUERA del repo).")
    if not Path(cred).is_file():
        raise SystemExit(f"No existe el archivo de credenciales: {cred}")
    from google.cloud import firestore
    return firestore.Client()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--una-vuelta", action="store_true",
                    help="procesa lo estable y sale (para pruebas)")
    a = ap.parse_args()

    for carpeta in (INBOX, ERROR, PROCESADO):
        carpeta.mkdir(parents=True, exist_ok=True)

    cliente = hacer_cliente()
    log(f"watcher v{VERSION} -> coleccion {COLECCION}")

    vistos: dict[str, tuple[int, int]] = {}
    if a.una_vuelta:
        json_estables(vistos)          # primera vuelta: solo observa
        time.sleep(2)
        for f in json_estables(vistos):
            procesar_archivo(cliente, f)
        try:
            from vigia_videos_142 import vigia_tick
            vigia_tick(log)
        except Exception:
            log("fallo el vigia:\n" + traceback.format_exc())
        return

    ciclo = 0
    while True:
        try:
            for f in json_estables(vistos):
                procesar_archivo(cliente, f)
        except Exception:
            log("fallo el ciclo:\n" + traceback.format_exc())
        # Vigia de videos: cada 5 ciclos (~5 min). El sync trae videos a lo mas
        # cada 4 h; 5 min de latencia es invisible y no carga la CPU.
        ciclo += 1
        if ciclo % 5 == 0:
            try:
                from vigia_videos_142 import vigia_tick
                vigia_tick(log)
            except Exception:
                log("fallo el vigia:\n" + traceback.format_exc())
        time.sleep(INTERVALO)


if __name__ == "__main__":
    sys.exit(main())
