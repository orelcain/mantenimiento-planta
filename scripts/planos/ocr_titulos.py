# -*- coding: utf-8 -*-
"""Saca el titulo y el numero de hoja GEA del cajetin de cada pagina, por OCR.

Los PDF GEA traen el texto convertido a contornos (0 palabras extraibles), pero
el cajetin impreso dice el titulo de la hoja y su numero real (con saltos:
la pagina 41 es la HOJA 264). Se recorta el cajetin, se OCRea con rapidocr y
las palabras pegadas ("FRENOLAMINASUPERIOR") se separan con un diccionario
tecnico por coincidencia voraz de izquierda a derecha.

Uso:  python scripts/planos/ocr_titulos.py <slug>
Salida: scripts/planos/titulos/<slug>.json  {pagina: {"h": hojaGea, "t": titulo}}
"""
import fitz, json, os, re, sys

VOCAB = """
ALIMENTACION TENSION POTENCIA CONEXION INDICE BORNES LISTA PIEZAS PARADA
EMERGENCIA INTERRUPTOR PRINCIPAL SERVICIO CALEFACCION PREVIA ESTACION SELLADO
FORMADO CORTE TRANSVERSAL LONGITUDINAL BOMBA BOMBAS VACIO MANDO REGULACION
MOTOR AVANCE CINTA TRANSPORTADORA CONVERTIDOR FRECUENCIA FRENO LAMINA SUPERIOR
INFERIOR DESARROLLO DESBOBINADO CODIFICACION SEGURIDAD PUERTA PUERTAS VALVULA
VALVULAS DOSIFICADOR IMPRESORA ETIQUETADORA FOTOCELULA SENSOR SENSORES CADENA
TRANSPORTE ELEVADOR ASPIRADOR TIRAS MARGINALES RECORTE CAN BUS MODULO ENTRADA
ENTRADAS SALIDA SALIDAS DIGITAL DIGITALES ANALOGICA ANALOGICAS AGUA
REFRIGERACION AIRE COMPRIMIDO MAQUINA CONTADOR CONTADORA PANEL TACTIL PANTALLA
DISTRIBUCION ARMARIO TERMOSTATO EQUIPO ESQUEMA CIRCUITOS FUSIBLE FUSIBLES
CONTACTOR RELE GUARDAMOTOR VARIADOR SERVO POSICION LEVANTAMIENTO DESCENSO
MORDAZA MORDAZAS PLACA CALENTAMIENTO ZONA ZONAS GAS ATMOSFERA EVACUACION
INYECCION MEZCLA TEMPERATURA PRESION NIVEL CAUDAL MARCHA PARO CICLO AJUSTE
CENTRAL PERIFERIA OPCION OPCIONES RESERVA LUZ ILUMINACION SENAL SENALES TORRE
BALIZA VENTILADOR REFRIGERADOR INTERFAZ COMUNICACION RED ETHERNET PROFIBUS
ALARMA ALARMAS PARO SISTEMA CONTROL X20 EPS DELTA ROBOT CARGADOR DESCARGA
ELEVACION AVERIA TERMINAL OPERADOR IMPRESION CODIGO FECHA LOTE Y DE DEL LA EL
LOS LAS CON PARA POR
""".split()
VOCAB = sorted(set(VOCAB), key=len, reverse=True)


def segmentar(blob):
    """Separa MAYUSCULASPEGADAS con el vocabulario, voraz de izq a der."""
    out, resto = [], blob
    while resto:
        for w in VOCAB:
            if resto.startswith(w):
                out.append(w)
                resto = resto[len(w):]
                break
        else:
            # letra sin palabra conocida: se acumula hasta el proximo match
            if out and out[-1] not in VOCAB:
                out[-1] += resto[0]
            else:
                out.append(resto[0])
            resto = resto[1:]
    return " ".join(out)


def limpiar(texto):
    t = re.sub(r"[^A-ZÑ&0-9+\-./ ]", "", texto.upper())
    partes = []
    for tok in t.split():
        if re.search(r"[A-Z]{7,}", tok):
            partes.append(segmentar(tok))
        else:
            partes.append(tok)
    return " ".join(partes).strip()


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from rapidocr_onnxruntime import RapidOCR

    slug = sys.argv[1]
    cfgs = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "configs.json"), encoding="utf-8"))
    cfg = cfgs[slug]
    pdf = os.path.join(os.environ.get("ONEDRIVE", os.path.expanduser("~/OneDrive")), *cfg["pdf"].split("/"))
    doc = fitz.open(pdf)
    ocr = RapidOCR()

    salida, sin_titulo = {}, []
    for i in range(doc.page_count):
        pg = doc[i]
        r = pg.rect
        clip = fitz.Rect(r.width * 0.28, r.height * 0.865, r.width, r.height)
        pix = pg.get_pixmap(matrix=fitz.Matrix(5, 5), clip=clip)
        res, _ = ocr(pix.tobytes("png"))
        titulo, hoja_gea = "", ""
        for l in res or []:
            x0 = min(p[0] for p in l[0]); y0 = min(p[1] for p in l[0])
            txt = l[1].strip()
            if y0 < 75 and 250 < x0 < 2300:
                titulo = (titulo + " " + txt).strip()
            if y0 > 150 and x0 > 2450 and re.match(r"^[\d*.,]+$", txt):
                hoja_gea = txt.replace(",", ".").rstrip("*")
        titulo = limpiar(titulo)
        if titulo:
            salida[str(i + 1)] = {"h": hoja_gea, "t": titulo[:70]}
        else:
            sin_titulo.append(i + 1)
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{doc.page_count}…")

    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "titulos")
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, f"{slug}.json"), "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)
    print(f"OK {len(salida)}/{doc.page_count} titulos -> titulos/{slug}.json")
    if sin_titulo:
        print(f"   sin titulo OCR: paginas {sin_titulo}")


if __name__ == "__main__":
    main()
