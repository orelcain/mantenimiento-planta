#!/usr/bin/env node

/**
 * 🎯 GENERADOR DE DATOS DE DEMOSTRACIÓN
 * 
 * Crea datos realistas para toda la aplicación:
 * 1. 150+ Repuestos para Baader 200
 * 2. 3 Mapas de la planta
 * 3. 50+ Marcadores en mapas
 * 
 * Listos para importar a Firestore
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'demo');

// Crear directorio
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('\n' + '='.repeat(70));
console.log('🎯 GENERADOR DE DATOS DE DEMOSTRACIÓN');
console.log('='.repeat(70));

// ============================================================
// 1. GENERAR REPUESTOS
// ============================================================

function generateRepuestos() {
  console.log('\n📦 Generando REPUESTOS...\n');
  
  const categorías = [
    'Rodillos y Correas',
    'Motores y Reductores',
    'Bombas y Válvulas',
    'Sensores',
    'Componentes Hidráulicos',
    'Elementos de Corte',
    'Cojinetes',
    'Sellos y Juntas',
    'Cables y Conectores',
    'Piezas de Wear'
  ];
  
  const marcas = ['SKF', 'NSK', 'TIMKEN', 'Siemens', 'ABB', 'Grundfos', 'Rexroth', 'Parker', 'Bosch', 'Festo'];
  
  const repuestos = [];
  const startSAP = 4500000000;
  
  // Generar 150 repuestos variados
  for (let i = 0; i < 150; i++) {
    const categoría = categorías[i % categorías.length];
    const marca = marcas[i % marcas.length];
    const tipoEquipo = ['Motor', 'Bomba', 'Válvula', 'Rodillo', 'Sensor', 'Compresor'][i % 6];
    
    const repuesto = {
      id: `rep-${String(i + 1).padStart(4, '0')}`,
      codigoSAP: String(startSAP + i),
      codigoBaader: `200-${categoría.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      textoBreve: `${tipoEquipo} ${marca} #${i + 1}`,
      descripcion: `${tipoEquipo} para Baader 200 - ${categoría}. Marca: ${marca}. Especificaciones técnicas incluidas.`,
      
      // Cantidades
      cantidadSolicitada: Math.floor(Math.random() * 5),
      cantidadStockBodega: Math.floor(Math.random() * 10),
      
      // Precios realistas (en CLP)
      valorUnitario: Math.floor(15000 + Math.random() * 250000),
      
      // Tags
      tags: generateTags(i),
      
      // Metadatos
      total: 0, // Se calcula
      nombreManual: `${marca} ${tipoEquipo}`,
      fechaUltimaActualizacionInventario: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
      
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    // Calcular total
    repuesto.total = (repuesto.cantidadSolicitada + repuesto.cantidadStockBodega) * repuesto.valorUnitario;
    
    repuestos.push(repuesto);
  }
  
  console.log(`  ✅ ${repuestos.length} repuestos generados`);
  
  // Guardar archivo
  const repuestosPath = path.join(OUTPUT_DIR, 'demo_repuestos.json');
  fs.writeFileSync(repuestosPath, JSON.stringify(repuestos, null, 2));
  console.log(`  📁 Guardado: ${repuestosPath}`);
  
  return repuestos;
}

function generateTags(index) {
  const tagsGlobales = [
    { nombre: 'Overhaul temporada baja', tipo: 'solicitud' },
    { nombre: 'Urgentes este mes', tipo: 'solicitud' },
    { nombre: 'Críticos', tipo: 'solicitud' },
    { nombre: 'En espera proveedor', tipo: 'solicitud' },
    { nombre: 'Pedido realizado', tipo: 'solicitud' },
    { nombre: 'Stock mínimo', tipo: 'stock' },
    { nombre: 'Overstock', tipo: 'stock' },
    { nombre: 'Obsoleto', tipo: 'stock' }
  ];
  
  const numTags = Math.floor(Math.random() * 3) + 1;
  const tags = [];
  
  for (let i = 0; i < numTags; i++) {
    const tag = tagsGlobales[Math.floor(Math.random() * tagsGlobales.length)];
    if (!tags.some(t => t.nombre === tag.nombre)) {
      tags.push({
        nombre: tag.nombre,
        tipo: tag.tipo,
        cantidad: Math.floor(Math.random() * 20),
        fecha: new Date().toISOString()
      });
    }
  }
  
  return tags;
}

// ============================================================
// 2. GENERAR MAPAS
// ============================================================

function generateMaps() {
  console.log('\n🗺️  Generando MAPAS...\n');
  
  const maps = [
    {
      id: 'map-acopio',
      nombre: 'Planta Acopio',
      descripcion: 'Mapa general del área de acopio con ubicación de equipos',
      imageUrl: '/images/maps/planta-acopio.png',
      orden: 0,
      
      // Marcadores de equipos
      marcadores: generateMarkers('ACOPIO', 40)
    },
    {
      id: 'map-chonchi',
      nombre: 'Planta Chonchi - Línea Producción',
      descripcion: 'Mapa de la línea de producción principal con motores y bombas',
      imageUrl: '/images/maps/planta-chonchi.png',
      orden: 1,
      
      marcadores: generateMarkers('CHONCHI', 30)
    },
    {
      id: 'map-yal',
      nombre: 'Planta Yal - Área de Tratamiento',
      descripcion: 'Mapa del área de tratamiento de agua y sistemas complementarios',
      imageUrl: '/images/maps/planta-yal.png',
      orden: 2,
      
      marcadores: generateMarkers('YAL', 25)
    }
  ];
  
  // Metadatos
  maps.forEach(map => {
    map.areas = [];
    map.createdAt = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString();
    map.updatedAt = new Date().toISOString();
  });
  
  console.log(`  ✅ ${maps.length} mapas generados`);
  console.log(`  📍 Total de marcadores: ${maps.reduce((sum, m) => sum + m.marcadores.length, 0)}`);
  
  // Guardar archivo
  const mapsPath = path.join(OUTPUT_DIR, 'demo_maps.json');
  fs.writeFileSync(mapsPath, JSON.stringify(maps, null, 2));
  console.log(`  📁 Guardado: ${mapsPath}`);
  
  return maps;
}

function generateMarkers(area, count) {
  const equipoNames = {
    'ACOPIO': [
      'Bomba Vacío N1', 'Bomba Flujo N1', 'Compresor N1',
      'Bomba Vacío N2', 'Bomba Flujo N2', 'Compresor N2',
      'Sistema Refrigeración', 'Extractor Aire Caliente',
      'Huinche Levante', 'Motobomba Agua'
    ],
    'CHONCHI': [
      'Fileteadora Baader N1', 'Fileteadora Baader N2', 'Cinta Alimentación',
      'Cinta Esquelones', 'Cinta Salida', 'Balanza Dinámica',
      'Volcador Bins', 'Compresor Central', 'Bomba Principal',
      'Sistema Extracción'
    ],
    'YAL': [
      'Sistema Bombeo Peces N1', 'Sistema Bombeo Peces N2',
      'Clorador Agua Dulce', 'Clorador Agua Salada',
      'Bomba Dosificación', 'Caudalímetro', 'Bomba Tratamiento',
      'Compresor Aire', 'Bomba Recirculación', 'Filtro Principal'
    ]
  };
  
  const equipos = equipoNames[area] || [];
  const marcadores = [];
  
  for (let i = 0; i < count; i++) {
    const equipo = equipos[i % equipos.length] || `Equipo ${i + 1}`;
    
    marcadores.push({
      id: `marker-${area.toLowerCase()}-${String(i + 1).padStart(3, '0')}`,
      x: Math.random(), // 0-1 (porcentaje)
      y: Math.random(),
      label: equipo,
      assetId: `asset-${720000000 + i}`,
      type: Math.random() > 0.7 ? 'motor' : 'bomba',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  
  return marcadores;
}

// ============================================================
// 3. MÁQUINAS (ya existen en el código)
// ============================================================

function generateMachines() {
  console.log('\n🤖 MÁQUINAS (referencia)...\n');
  
  const machines = [
    {
      id: 'baader-200',
      nombre: 'Baader 200',
      marca: 'Baader',
      modelo: '200',
      descripcion: 'Fileteadora principal - Máquina de proceso central',
      activa: true,
      color: '#3b82f6',
      orden: 0
    },
    {
      id: 'cinta-esquelones',
      nombre: 'Cinta Esquelones',
      marca: 'Diversas',
      modelo: 'Sistema',
      descripcion: 'Transporte de esquelones hacia siguiente etapa',
      activa: true,
      color: '#8b5cf6',
      orden: 1
    },
    {
      id: 'cinta-salida-filete',
      nombre: 'Cinta Salida Filete',
      marca: 'Diversas',
      modelo: 'Sistema',
      descripcion: 'Transporte de filetes hacia empaque',
      activa: true,
      color: '#ec4899',
      orden: 2
    },
    {
      id: 'balanza-dinamica-marel',
      nombre: 'Balanza Dinámica MAREL',
      marca: 'MAREL',
      modelo: 'Dinamica',
      descripcion: 'Pesaje automático de filetes',
      activa: true,
      color: '#f59e0b',
      orden: 3
    },
    {
      id: 'sistema-bombeo-peces-n1',
      nombre: 'Sistema Bombeo Peces N1',
      marca: 'Diversas',
      modelo: 'Sistema',
      descripcion: 'Bombeo de peces línea 1',
      activa: true,
      color: '#6366f1',
      orden: 4
    }
  ];
  
  console.log(`  ✅ ${machines.length} máquinas de referencia\n`);
  
  return machines;
}

// ============================================================
// 4. RESUMEN
// ============================================================

function createSummary(repuestos, maps, machines) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN DE GENERACIÓN');
  console.log('='.repeat(70));
  
  console.log('\n📦 REPUESTOS');
  console.log(`   Total: ${repuestos.length}`);
  console.log(`   Precio mín: $${Math.min(...repuestos.map(r => r.valorUnitario)).toLocaleString('es-CL')}`);
  console.log(`   Precio máx: $${Math.max(...repuestos.map(r => r.valorUnitario)).toLocaleString('es-CL')}`);
  console.log(`   Stock total: ${repuestos.reduce((sum, r) => sum + r.cantidadStockBodega, 0)} unidades`);
  
  console.log('\n🗺️  MAPAS');
  console.log(`   Total: ${maps.length}`);
  console.log(`   Marcadores: ${maps.reduce((sum, m) => sum + m.marcadores.length, 0)}`);
  maps.forEach(map => {
    const motorCount = map.marcadores.filter(m => m.type === 'motor').length;
    const bombaCount = map.marcadores.filter(m => m.type === 'bomba').length;
    console.log(`   - ${map.nombre}: ${motorCount} motores, ${bombaCount} bombas`);
  });
  
  console.log('\n🤖 MÁQUINAS');
  console.log(`   Total: ${machines.length}`);
  
  // Crear archivo README
  const readmePath = path.join(OUTPUT_DIR, 'README_DEMO.md');
  const readmeContent = `# 🎯 Datos de Demostración

Generado: ${new Date().toLocaleString('es-CL')}

## Contenido

### 1. Repuestos (demo_repuestos.json)
- **150 repuestos** para Baader 200
- Códigos SAP realistas
- Precios entre $15,000 y $265,000 CLP
- Tags de categorización
- Cantidades en stock y solicitadas

**Uso:**
\`\`\`bash
node scripts/import_demo_data.js --repuestos
\`\`\`

### 2. Mapas (demo_maps.json)
- **3 mapas** de planta
- **95+ marcadores** de equipos
- Coordenadas X,Y normalizadas (0-1)
- Asociación automática a equipos

**Mapas:**
1. Planta Acopio (40 marcadores)
2. Planta Chonchi (30 marcadores)
3. Planta Yal (25 marcadores)

**Uso:**
\`\`\`bash
node scripts/import_demo_data.js --maps
\`\`\`

### 3. Máquinas (referencia en código)
- **5 máquinas** principales
- Ya configuradas en useMachines.ts

## Cómo Importar

### Opción 1: Importar TODO
\`\`\`bash
node scripts/import_demo_data.js --all
\`\`\`

### Opción 2: Importar selectivamente
\`\`\`bash
node scripts/import_demo_data.js --repuestos --maps
\`\`\`

### Opción 3: Validar SIN importar (dry-run)
\`\`\`bash
node scripts/import_demo_data.js --all --dry-run
\`\`\`

## Estructura de Datos

### Repuesto
\`\`\`json
{
  "id": "rep-0001",
  "codigoSAP": "4500000000",
  "codigoBaader": "200-ROD-001",
  "textoBreve": "Motor Siemens #1",
  "descripcion": "...",
  "valorUnitario": 125000,
  "cantidadStockBodega": 5,
  "cantidadSolicitada": 2,
  "tags": [...]
}
\`\`\`

### Mapa
\`\`\`json
{
  "id": "map-acopio",
  "nombre": "Planta Acopio",
  "imageUrl": "/images/maps/planta-acopio.png",
  "marcadores": [
    {
      "id": "marker-acopio-001",
      "x": 0.45,
      "y": 0.65,
      "label": "Bomba Vacío N1",
      "type": "bomba"
    }
  ]
}
\`\`\`

## Validación

Luego de importar, verifica en la UI:

1. **Dashboard de Repuestos**
   - [ ] Aparecen 150 repuestos
   - [ ] Precios visibles
   - [ ] Tags funcionando
   - [ ] Stock actualizado

2. **Catálogo de Bases**
   - [ ] Tabla con motores/bombas
   - [ ] Filtros funcionando
   - [ ] Mapas cargados
   - [ ] Marcadores visibles

3. **Mapas Interactivos**
   - [ ] Imágenes cargan (si existen)
   - [ ] Marcadores clickeables
   - [ ] Información de equipos

## Próximos Pasos

1. ✅ Generar datos (COMPLETADO)
2. ⏳ Importar a Firestore
3. ⏳ Validar en UI
4. ⏳ Ajustar según necesidad

---

**Nota**: Estos son datos ficticios para testing. Para datos reales, usa:
- \`scripts/export_existing_data.js\` (exportar de Firestore)
- \`scripts/import_excel.js\` (importar desde Excel)
- \`scripts/import_legacy_db.js\` (importar de BD anterior)
`;
  
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`\n  📁 README: ${readmePath}`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    const repuestos = generateRepuestos();
    const maps = generateMaps();
    const machines = generateMachines();
    
    createSummary(repuestos, maps, machines);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ GENERACIÓN COMPLETADA');
    console.log('='.repeat(70));
    console.log(`\n📁 Archivos en: ${OUTPUT_DIR}`);
    console.log('\n📝 Próximo paso: node scripts/import_demo_data.js\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  }
}

main();
