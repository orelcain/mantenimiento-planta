import pdfplumber

pdf_path = r'D:\a\APP leventamiento de insidencias en planta\jerarquia\JERARQUIA UBICACION TECNICA PLANTA CHONCHI.pdf'

with pdfplumber.open(pdf_path) as pdf:
    print(f'Total paginas: {len(pdf.pages)}')
    
    all_text = []
    for i, page in enumerate(pdf.pages):
        print(f'\n{"="*60}')
        print(f'=== PAGINA {i+1} ===')
        print(f'{"="*60}')
        
        # Extraer tablas
        tables = page.extract_tables()
        if tables:
            for table in tables:
                for row in table:
                    if row:
                        clean_row = [str(cell).strip() if cell else '' for cell in row]
                        print('\t'.join(clean_row))
                        all_text.append('\t'.join(clean_row))
        else:
            text = page.extract_text()
            if text:
                print(text)
                all_text.append(text)

# Guardar todo a archivo
with open(r'D:\a\APP leventamiento de insidencias en planta\jerarquia\pdf_extraido.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(all_text))

print('\n\nArchivo guardado en pdf_extraido.txt')
