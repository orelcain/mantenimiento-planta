#!/usr/bin/env node
/**
 * Seed: fotos + hotspots de la pestaña "Componentes del equipo" del Grader.
 * Migra el contenido que vivía hardcodeado en GraderVisualPilot.tsx a
 * `learningContent/grader/components/{id}` para que sea editable desde el
 * admin (LearningAdminMachinePage, tab "Componentes").
 *
 * Uso:
 *   node scripts/seed-grader-components.js --dry-run
 *   node scripts/seed-grader-components.js
 */

'use strict'
const admin = require('firebase-admin')
const path = require('path')

const isDryRun = process.argv.slice(2).includes('--dry-run')
const BASE = Date.parse('2026-07-26T00:00:00-04:00')
const SLUG = 'grader'

const SECTIONS = [
  {
    id: 'hero',
    order: 1,
    file: 'grader-cinta-capachos-sensor.jpg',
    title: 'Banda de clasificación',
    aspectRatio: 1280 / 960,
    points: [
      { id: 'fotocelula', x: 58, y: 57, label: 'Fotocélula de lectura', description: 'Montada en el riel antes de los capachos; detecta el producto para disparar el flipper a tiempo. Mantener el lente limpio.' },
      { id: 'cinta', x: 45, y: 80, label: 'Cinta transportadora', description: 'Traslada el producto ya pesado/medido hacia los capachos. Revisar guías laterales y tensión de banda en cada limpieza.' },
      { id: 'capacho', x: 75, y: 42, label: 'Capacho de clasificación', description: 'Accionado por cilindro neumático; vuelca el producto al canal según su categoría. Riesgo de atrapamiento entre el cilindro y el brazo — no acercar manos con el equipo en marcha.' },
    ],
  },
  {
    id: 'transmisor',
    order: 2,
    file: 'grader-fotocelula-transmisor.jpg',
    title: 'Fotocélula — transmisor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 32, y: 45, label: 'Transmisor QS186LEQ8', description: 'Emisor láser Clase I que dispara el haz hacia el receptor (se alcanza a ver el punto rojo llegando al otro lado, a la derecha del encuadre). Alimentación 10-30VDC.' },
    ],
  },
  {
    id: 'receptor',
    order: 3,
    file: 'grader-fotocelula-receptor.jpg',
    title: 'Fotocélula — receptor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 52, y: 55, label: 'Receptor QS18VP6RQ8', description: 'Recibe el haz del transmisor y confirma que el paso está libre. Alimentación 10-30VDC.' },
    ],
  },
  {
    id: 'zeta-difusor',
    order: 4,
    file: 'grader-cinta-zeta-difusor.jpg',
    title: 'Cinta elevadora Zeta — sensor difusor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 63, y: 38, label: 'Sensor difusor T18SP6DQ', description: 'Configurado como difusor: un solo sensor capta directamente las paletas de la cinta elevadora Zeta, sin receptor aparte.' },
    ],
  },
  {
    id: 'panoramica',
    order: 5,
    file: 'grader-panoramica-general.jpg',
    title: 'Vista panorámica de la máquina',
    aspectRatio: 1280 / 783,
    points: [
      { id: 'tambor', x: 25, y: 72, label: 'Tambor / mesa de distribución', description: 'Recibe el producto y lo reparte hacia la cinta elevadora.' },
      { id: 'panel', x: 22, y: 45, label: 'Panel de control', description: 'Caja de botoneras protegida con plástico junto a la línea.' },
      { id: 'salida', x: 75, y: 48, label: 'Cinta de salida hacia clasificación', description: 'Lleva el producto pesado hacia la báscula y los capachos (fuera de este encuadre). No incluye la cinta larga del Grader.' },
    ],
  },
  {
    id: 'pockets',
    order: 6,
    file: 'grader-4-pockets-cinta-zeta.jpg',
    title: 'Los 4 pockets y la cinta Zeta',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'zeta', x: 35, y: 25, label: 'Cinta elevadora Zeta', description: 'Sube el producto en pendiente hacia los 4 pockets.' },
      { id: 'pockets4', x: 45, y: 40, label: 'Los 4 pockets', description: 'Divisores de acero que separan el producto en 4 carriles antes de bajar a la cinta de salida.' },
      { id: 'salida-inf', x: 45, y: 83, label: 'Cinta de salida inferior', description: 'Cinta de placas plásticas que recibe el producto de los 4 pockets.' },
    ],
  },
  {
    id: 'motores',
    order: 7,
    file: 'grader-motores-en-orden.jpg',
    title: 'Motores de la Grader, en orden',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'm1', x: 48, y: 25, label: 'Motor 1 — SK90LH/4', description: '1.50kW, 230/400V, 1415 rpm.' },
      { id: 'm2', x: 48, y: 45, label: 'Motor 2 — TM113B25-0434', description: '0.25kW, 230/400V, 1.10 m/s.' },
      { id: 'm3', x: 48, y: 63, label: 'Motor 3 — TM113B25-0434', description: '0.25kW, 230/400V (segunda unidad idéntica).' },
      { id: 'm4', x: 48, y: 83, label: 'Motor 4 — TM160A30-0220', description: '1.50kW, 230/400V, 1.30 m/s.' },
    ],
  },
  {
    id: 'sm206',
    order: 8,
    file: 'grader-tarjeta-sm206.jpg',
    title: 'Tarjeta SM206',
    aspectRatio: 1858 / 2165,
    points: [
      { id: 'tarjeta', x: 45, y: 45, label: 'Tarjeta SM206', description: 'Controla las celdas de pesaje de los pockets; conector J2 con líneas CAN (CANL/CANH).' },
    ],
  },
  {
    id: 'celda',
    order: 9,
    file: 'grader-celda-pesaje.jpg',
    title: 'Celda de pesaje',
    aspectRatio: 2160 / 3840,
    points: [
      { id: 'celda1', x: 55, y: 55, label: 'Celda de pesaje AK300 (Scaime)', description: 'Cada pocket usa una celda de este tipo; capacidad máxima 300.3 kg.' },
    ],
  },
  {
    id: 'cilindros',
    order: 10,
    file: 'grader-cilindros-exteriores-operador.jpg',
    title: 'Cilindros exteriores, lado operador',
    aspectRatio: 1280 / 410,
    points: [
      { id: 'cilindros-fila', x: 50, y: 28, label: 'Cilindros neumáticos de accionamiento', description: 'Fila de cilindros que accionan los capachos, vista desde el lado operador.' },
      { id: 'cajas', x: 45, y: 55, label: 'Cajas de conexión', description: 'Cajas eléctricas que agrupan el cableado de sensores y electroválvulas de esta zona.' },
    ],
  },
]

async function main() {
  console.log(`Seed Componentes del equipo — Grader (${SECTIONS.length} fotos)${isDryRun ? ' [DRY-RUN]' : ''}`)

  let db = null
  if (!isDryRun) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
    db = admin.firestore()
  }

  for (const s of SECTIONS) {
    const doc = { ...s, createdAt: BASE, updatedAt: BASE }
    if (isDryRun) {
      console.log(`  · ${s.id} — "${s.title}" (${s.points.length} puntos, aspectRatio ${s.aspectRatio.toFixed(3)})`)
    } else {
      await db.collection('learningContent').doc(SLUG).collection('components').doc(s.id).set(doc)
      console.log(`  ✓ ${s.id} guardada`)
    }
  }

  console.log(`\nListo${isDryRun ? ' (dry-run, nada escrito)' : ''}.`)
}

main().catch(err => { console.error(err); process.exit(1) })
