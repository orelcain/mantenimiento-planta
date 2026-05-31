#!/usr/bin/env python3
"""
Extrae las imágenes embebidas del docx de levantamiento y construye un mapa
en ORDEN DE DOCUMENTO (texto + imágenes intercalados), para poder asociar
cada foto a su equipo/área. No escribe nada a Firestore.

Salida:
  media/                 -> imageN.{jpg,png,...} extraídas
  document_order.json    -> [{type:'text'|'img', value/file, idx}]  en orden real
  image_context.json     -> por imagen: archivo + textos cercanos previos
"""
import zipfile, os, json, sys
from xml.etree import ElementTree as ET

DOCX = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\pc hp\OneDrive\ANTARFOOD\v2.1.1.1_LEVANTAMIENTO EQUIPOS PLANTA CHONCHI.docx"
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA_OUT = os.path.join(HERE, "media")
os.makedirs(MEDIA_OUT, exist_ok=True)

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

z = zipfile.ZipFile(DOCX)

# rId -> target media path
rels = {}
relx = ET.fromstring(z.read('word/_rels/document.xml.rels'))
for rel in relx:
    tgt = rel.get('Target')
    if tgt and 'media/' in tgt:
        rels[rel.get('Id')] = tgt.split('/')[-1]

# Extraer media a carpeta
extracted = []
for name in z.namelist():
    if name.startswith('word/media/'):
        data = z.read(name)
        base = name.split('/')[-1]
        with open(os.path.join(MEDIA_OUT, base), 'wb') as f:
            f.write(data)
        extracted.append(base)

# Walk recursivo en orden de documento: texto e imágenes
doc = ET.fromstring(z.read('word/document.xml'))
seq = []

def walk(el):
    for child in el:
        tag = child.tag
        if tag == W + 't':
            if child.text and child.text.strip():
                seq.append(('text', child.text.strip()))
        elif tag == A + 'blip':
            rid = child.get(R + 'embed')
            if rid and rid in rels:
                seq.append(('img', rels[rid]))
        else:
            walk(child)

walk(doc)

# document_order.json
order = [{'i': i, 'type': t, 'value': v} for i, (t, v) in enumerate(seq)]
with open(os.path.join(HERE, 'document_order.json'), 'w', encoding='utf-8') as f:
    json.dump(order, f, ensure_ascii=False, indent=0)

# Por cada imagen: los 6 textos previos (contexto del equipo)
img_ctx = []
texts_so_far = []
for t, v in seq:
    if t == 'text':
        texts_so_far.append(v)
    else:
        img_ctx.append({'file': v, 'contexto_previo': texts_so_far[-6:]})
with open(os.path.join(HERE, 'image_context.json'), 'w', encoding='utf-8') as f:
    json.dump(img_ctx, f, ensure_ascii=False, indent=1)

print(f"Media extraída: {len(extracted)} archivos en media/")
print(f"Tokens en orden: {len(seq)} (textos+imágenes)")
print(f"Imágenes referenciadas en el cuerpo: {sum(1 for t,_ in seq if t=='img')}")
print(f"Archivos: document_order.json, image_context.json")
