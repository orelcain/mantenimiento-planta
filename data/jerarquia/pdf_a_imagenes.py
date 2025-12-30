import pdfplumber
from PIL import Image
import io

pdf_path = r'D:\a\APP leventamiento de insidencias en planta\jerarquia\JERARQUIA UBICACION TECNICA PLANTA CHONCHI.pdf'
output_dir = r'D:\a\APP leventamiento de insidencias en planta\jerarquia\paginas_pdf'

import os
os.makedirs(output_dir, exist_ok=True)

with pdfplumber.open(pdf_path) as pdf:
    print(f'Total paginas: {len(pdf.pages)}')
    
    for i, page in enumerate(pdf.pages):
        # Convertir pagina a imagen
        img = page.to_image(resolution=150)
        img_path = os.path.join(output_dir, f'pagina_{i+1:02d}.png')
        img.save(img_path)
        print(f'Guardada: {img_path}')

print(f'\nImagenes guardadas en: {output_dir}')
