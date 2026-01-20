#!/usr/bin/env node
/**
 * Script de Generación de Datos de Migración (sin Firebase Admin)
 * Genera archivos JSON listos para importar en Firestore
 * 
 * Uso:
 *   node scripts/generate_migration_data.js
 * 
 * Esto crea:
 *   - output/machines.json
 *   - output/plant_assets.json
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// Crear directorio de salida
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✅ Directorio creado: ${OUTPUT_DIR}`);
}

console.log('\n🚀 Generando datos de migración...\n');

// ============================================================
// 1. GENERAR MÁQUINAS
// ============================================================
const machines = [
  {
    id: 'baader-200',
    nombre: 'Baader 200',
    marca: 'Baader',
    modelo: '200',
    descripcion: 'Máquina principal - Fileteadora Baader 200',
    activa: true,
    color: '#3b82f6',
    orden: 0
  },
  {
    id: 'cinta-esquelones',
    nombre: 'Cinta Esquelones',
    marca: 'Desconocido',
    modelo: 'Cinta',
    descripcion: 'Cinta de transporte para esquelones',
    activa: true,
    color: '#8b5cf6',
    orden: 1
  },
  {
    id: 'cinta-salida-filete',
    nombre: 'Cinta Salida Filete',
    marca: 'Desconocido',
    modelo: 'Cinta',
    descripcion: 'Cinta de salida para filetes',
    activa: true,
    color: '#ec4899',
    orden: 2
  },
  {
    id: 'balanza-dinamica-marel',
    nombre: 'Balanza Dinámica MAREL',
    marca: 'MAREL',
    modelo: 'Balanza Dinámica',
    descripcion: 'Sistema de pesaje dinámico',
    activa: true,
    color: '#06b6d4',
    orden: 3
  },
  {
    id: 'cinta-aceleracion-marel',
    nombre: 'Cinta Aceleración MAREL',
    marca: 'MAREL',
    modelo: 'Cinta',
    descripcion: 'Cinta de aceleración para MAREL',
    activa: true,
    color: '#10b981',
    orden: 4
  },
  {
    id: 'cinta-alimentacion-baader',
    nombre: 'Cinta Alimentación Baader',
    marca: 'Baader',
    modelo: 'Cinta',
    descripcion: 'Cinta de alimentación para Baader 200',
    activa: true,
    color: '#f59e0b',
    orden: 5
  },
  {
    id: 'volcador-bins',
    nombre: 'Volcador Bins',
    marca: 'Baader',
    modelo: 'Volcador',
    descripcion: 'Sistema de volcado de bins',
    activa: true,
    color: '#ef4444',
    orden: 6
  },
  {
    id: 'sistema-bombeo-peces-n1',
    nombre: 'Sistema Bombeo Peces N1',
    marca: 'Diversas',
    modelo: 'Sistema',
    descripcion: 'Sistema de bombeo de peces N1',
    activa: true,
    color: '#6366f1',
    orden: 7
  },
  {
    id: 'sistema-bombeo-peces-n2',
    nombre: 'Sistema Bombeo Peces N2',
    marca: 'Diversas',
    modelo: 'Sistema',
    descripcion: 'Sistema de bombeo de peces N2',
    activa: true,
    color: '#a855f7',
    orden: 8
  }
];

const machinesPath = path.join(OUTPUT_DIR, 'machines.json');
fs.writeFileSync(machinesPath, JSON.stringify(machines, null, 2));
console.log(`✅ Máquinas generadas: ${machines.length} máquinas`);
console.log(`   📁 ${machinesPath}\n`);

// ============================================================
// 2. GENERAR PLANT ASSETS (Motores/Bombas)
// ============================================================
function extraerArea(padre) {
  if (!padre) return 'General';
  if (padre.includes('ACOP')) return 'ACOPIO';
  if (padre.includes('PCHO')) return 'PLANTA CHONCHI';
  if (padre.includes('PYAL')) return 'PLANTA YAL';
  if (padre.includes('EXTE')) return 'PATIO Y SERVICIOS';
  return 'General';
}

function extraerMarca(denominacion) {
  const denom = (denominacion || '').toUpperCase();
  if (denom.includes('BAADER')) return 'Baader';
  if (denom.includes('MAREL')) return 'MAREL';
  if (denom.includes('ELECTRICO') || denom.includes('ELEC')) return 'Motoreductor';
  return 'Diverso';
}

// Leer jerarquía
const hierarchyPath = path.join(__dirname, '..', 'data', 'jerarquia', 'JERARQUIA_COMPLETA_VERIFICADA.json');
const hierarchyData = JSON.parse(fs.readFileSync(hierarchyPath, 'utf-8'));

// Extraer todos los equipos
const allEquipos = [];
for (const key of Object.keys(hierarchyData)) {
  if (key.startsWith('PAGINA_')) {
    const page = hierarchyData[key];
    if (page.equipos && Array.isArray(page.equipos)) {
      allEquipos.push(...page.equipos);
    }
  }
}

// Filtrar motores y bombas
const motorsAndPumps = allEquipos.filter(eq => {
  const denom = (eq.denominacion || '').toUpperCase();
  return denom.includes('MOTOR') || denom.includes('BOMBA');
});

const plantAssets = motorsAndPumps.map((equipo, idx) => {
  const denom = (equipo.denominacion || '').toUpperCase();
  const tipo = denom.includes('BOMBA') ? 'bomba' : 'motor';
  
  return {
    id: `asset-${equipo.codigo}`,
    codigo: equipo.codigo,
    denominacion: equipo.denominacion,
    tipo: tipo,
    padre: equipo.padre,
    area: extraerArea(equipo.padre),
    marca: extraerMarca(equipo.denominacion),
    modelo: equipo.denominacion,
    descripcion: `${tipo.toUpperCase()} - ${equipo.denominacion}`,
    especificaciones: {
      potencia: null,
      voltaje: null,
      amperaje: null,
      rpm: null
    },
    imagenes: [],
    marcadores: [],
    referencias: [],
    estado: 'operativo',
    orden: idx
  };
});

const plantAssetsPath = path.join(OUTPUT_DIR, 'plant_assets.json');
fs.writeFileSync(plantAssetsPath, JSON.stringify(plantAssets, null, 2));
console.log(`✅ PlantAssets generados: ${plantAssets.length} motores/bombas`);
console.log(`   📁 ${plantAssetsPath}\n`);

// ============================================================
// 3. RESUMEN
// ============================================================
console.log('='.repeat(60));
console.log('📊 ARCHIVOS GENERADOS');
console.log('='.repeat(60));
console.log(`\n✅ Máquinas: ${machines.length}`);
console.log(`✅ PlantAssets: ${plantAssets.length}`);
console.log(`\n📝 Próximos pasos:`);
console.log(`  1. Copiar archivos JSON a output/`);
console.log(`  2. Usar Firebase Console o Admin SDK para importar`);
console.log(`  3. O ejecutar: pnpm run firebase:import (si está configurado)\n`);

process.exit(0);
