"""Inspecciona el PDF del plano hidráulico para ver si tiene capas OCG (Optional
Content Groups) que permitan ocultar las cotas selectivamente.
"""
import pypdfium2 as pdfium
import sys

PDF = r"D:\a\APP leventamiento de insidencias en planta\apps\pwa\public\planos-aguas-assets\plano.pdf"

doc = pdfium.PdfDocument(PDF)
print(f"PDF cargado: {PDF}")
print(f"Paginas: {len(doc)}")

# Inspeccionar la pagina 0
page = doc[0]
print(f"\nPagina 0: tamano = {page.get_size()} pt")
print(f"  rotacion = {page.get_rotation()}")

# Verificar si tiene OCG/layers
try:
    # pypdfium2 expone get_meta y FPDF_GetMetaText, pero OCG requiere mas APIs.
    # Intento abrir con pikepdf que da mejor acceso a OCG.
    import pikepdf
    with pikepdf.open(PDF) as pdf:
        ocp = pdf.Root.get('/OCProperties')
        if ocp:
            ocgs = ocp.get('/OCGs', [])
            print(f"\nOCG encontrados: {len(ocgs)} capas")
            for i, ocg in enumerate(ocgs):
                name = ocg.get('/Name', '?')
                print(f"  capa {i}: name={name}, intent={ocg.get('/Intent','-')}")
            d = ocp.get('/D', {})
            print(f"\n/D config: ON={len(d.get('/ON', []))} OFF={len(d.get('/OFF', []))}")
        else:
            print("\nNO hay /OCProperties en el catalogo (sin capas OCG)")
except ImportError:
    print("\npikepdf NO instalado. Instalar con: uv pip install --system pikepdf")
    sys.exit(0)

# Tambien inspeccionar las fuentes embebidas (para ver si las cotas usan una fuente
# distinta que el resto del plano, lo cual permitiria filtrar por fuente)
print("\n--- Fuentes del PDF ---")
with pikepdf.open(PDF) as pdf:
    for i, p in enumerate(pdf.pages):
        res = p.get('/Resources')
        if res and '/Font' in res:
            fonts = res['/Font']
            for fk, fv in fonts.items():
                bn = fv.get('/BaseFont', '?')
                print(f"  pagina {i}: font {fk} = {bn}")
