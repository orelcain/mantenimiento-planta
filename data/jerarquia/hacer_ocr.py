import easyocr
import os

reader = easyocr.Reader(['es', 'en'], gpu=False)

input_dir = r'D:\a\APP leventamiento de insidencias en planta\jerarquia\paginas_pdf'
output_file = r'D:\a\APP leventamiento de insidencias en planta\jerarquia\ocr_resultado.txt'

all_text = []

for i in range(1, 9):
    img_path = os.path.join(input_dir, f'pagina_{i:02d}.png')
    print(f'\nProcesando pagina {i}...')
    
    results = reader.readtext(img_path)
    
    page_text = f'\n{"="*60}\n=== PAGINA {i} ===\n{"="*60}\n'
    
    for detection in results:
        bbox, text, confidence = detection
        if confidence > 0.3:
            page_text += f'{text}\n'
    
    all_text.append(page_text)
    print(page_text[:500])

with open(output_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(all_text))

print(f'\n\nResultado guardado en: {output_file}')
