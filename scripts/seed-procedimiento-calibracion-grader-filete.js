#!/usr/bin/env node
/**
 * Seed: procedimiento de calibración con fotos para Grader y Marel Filete.
 *
 * Fuente: frames extraídos con ffmpeg de los videos del expediente
 * (782_video del Grader — pantalla Z2 "Calibrar Báscula" y menú Servicio;
 * 767_video de Marel Filete — pantalla M6410 "Dynamic Calibration"),
 * verificados visualmente uno por uno antes de redactar los pasos.
 *
 * Grader: escribe a Firestore learningContent/grader/procedures/{id} — el
 * catálogo de runbooks de graderRunbooks.ts acepta overrides/adiciones desde
 * Firestore (mergeSeedOverrides), así que un id nuevo aparece sin tocar el
 * archivo fuente.
 *
 * Marel Filete: NO tiene ese override para procedimientos — inserta directo
 * en el JSON estático `apps/pwa/src/services/marelFilete/marelFileteContent.json`
 * (mismo patrón ya usado para Marel HG).
 *
 * Uso:
 *   node scripts/seed-procedimiento-calibracion-grader-filete.js --dry-run
 *   node scripts/seed-procedimiento-calibracion-grader-filete.js
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const isDryRun = process.argv.slice(2).includes('--dry-run')
const BASE = Date.parse('2026-07-24T22:30:00-04:00')

const FRAMES = 'C:/Users/orelc/AppData/Local/Temp/claude/C--Users-orelc-OneDrive-ANTARFOOD/1ae6f8d7-510d-4123-bb95-5107fb1ee305/scratchpad/calib-frames'

const MAREL_FILETE_JSON_PATH = path.join(__dirname, '..', 'apps', 'pwa', 'src', 'services', 'marelFilete', 'marelFileteContent.json')

const GRADER_PROC = {
  id: 'grader-proc-calibracion-basculas-guiada',
  title: 'Calibrar básculas del Grader (Servicio → Cambiar parámetros)',
  description: 'Recalibrar un pocket con peso patrón desde el panel Z2, cuando la contrastación indica desviación.',
  steps: [
    {
      order: 1,
      title: 'Autochequeo / Contrastación',
      description: 'Al iniciar, el Z2 corre un autochequeo ("Comenzando Autochequeo… Grader runtime is N hours") y muestra la pantalla StaticGrader con los 12 pockets. Desde acá se accede al menú Servicio con el teclado numérico.',
      image: `${FRAMES}/grader-782/g_01-web.jpg`,
    },
    {
      order: 2,
      title: 'Abrir Servicio',
      description: 'En el menú Servicio aparecen las opciones: Probar Salidas, Cambiar Parámetros, Monitor CPU, Versión Software, Explorar CAN bus. Usa "Abajo"/"Arriba" para moverte entre opciones.',
      image: `${FRAMES}/grader-782/g_18-web.jpg`,
    },
    {
      order: 3,
      title: 'Seleccionar "Cambiar Parámetros"',
      description: 'Resalta "Cambiar Parámetros" y confirma con el botón físico correspondiente. Este es el punto donde luego se pide la clave (ver Consulta rápida) para guardar los cambios de calibración.',
      image: `${FRAMES}/grader-782/g_21-web.jpg`,
    },
    {
      order: 4,
      title: 'Calibrar báscula con peso patrón',
      description: 'La pantalla "Calibrar Báscula" pide: "Poner un peso conocido sobre célula carga principal introduciendo el valor abajo. Presionar OK para continuar." Tara primero con ">0<", coloca el peso patrón (5 kg), ingresa el valor y confirma.',
      image: `${FRAMES}/grader-782/g_10-web.jpg`,
    },
    {
      order: 5,
      title: 'Guardar con la clave',
      description: 'Vuelve a "Cambiar Parámetros", ingresa la clave de guardado (ver Consulta rápida) y confirma. Reinicia el equipo desde la botonera para que el nuevo ajuste quede activo.',
      image: null,
    },
  ],
}

const MAREL_FILETE_PROC = {
  id: 'mf-proc-calibracion-dinamica-basculas',
  title: 'Calibración dinámica de básculas (Service → Scales)',
  description: 'Calibrar la báscula dinámica M6410 cuando la desviación estándar supera lo tolerable, desde el menú Service del controlador.',
  steps: [
    {
      order: 1,
      title: 'Entrar a Service',
      description: 'Desde la pantalla principal ("STOPPED - PRODUCTION"), toca el ícono de configuración/servicio para abrir el menú: CAN Network, I/O Tester, Motor Drives, Scales, y a la derecha Devices / Monitoring / System Setup.',
      image: `${FRAMES}/filete-767/f_01-web.jpg`,
    },
    {
      order: 2,
      title: 'Abrir "Scales"',
      description: 'En Scales aparece la tabla de básculas (Label, Type — ej. MWS2-FT, Weight, Zero, Stable, Tare) y los botones inferiores: Weight Curve, Weight Test, Configuration, Calibrate, Edit known scales.',
      image: `${FRAMES}/filete-767/f_06-web.jpg`,
    },
    {
      order: 3,
      title: 'Elegir "Dynamic Calibration"',
      description: 'Dentro de Calibrate/Weight Test se selecciona "Dynamic Calibration" del menú lateral (Sample, Quality, Dynamic Calibration). La tabla muestra Status, Weight y Quality por muestra.',
      image: `${FRAMES}/filete-767/f_08-web.jpg`,
    },
    {
      order: 4,
      title: 'Correr el test y guardar',
      description: 'Define "Sample Weight" y "Offset", presiona "Start Test" y verifica que los indicadores Stable / Zero / Sensor / Running queden en verde/estables. Revisa Average, Standard deviation (debe ser menor a 5 gramos), Minimum y Maximum. Si el "New dynamic factor" calculado es razonable, presiona "Save Calibration".',
      image: `${FRAMES}/filete-767/f_12-web.jpg`,
    },
  ],
}

async function main() {
  console.log(`Seed procedimientos de calibración con fotos${isDryRun ? ' [DRY-RUN]' : ''}`)

  let bucket = null
  if (!isDryRun) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    if (!fs.existsSync(keyPath)) { console.error('Falta serviceAccountKey.json'); process.exit(1) }
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
    })
    bucket = admin.storage().bucket()
  }

  async function uploadImage(localPath, storagePath) {
    if (!fs.existsSync(localPath)) { console.error(`  ✗ no existe: ${localPath}`); process.exit(1) }
    if (isDryRun) {
      const kb = Math.round(fs.statSync(localPath).size / 1024)
      console.log(`    · subiría ${path.basename(localPath)} (${kb} KB) → ${storagePath}`)
      return `dry-run://${storagePath}`
    }
    const buffer = fs.readFileSync(localPath)
    const token = randomUUID()
    await bucket.file(storagePath).save(buffer, {
      metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } },
    })
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`
  }

  async function buildSteps(slug, proc) {
    const steps = []
    for (const s of proc.steps) {
      let imageUrl = null
      if (s.image) {
        const storagePath = `learningContent/${slug}/procedures/${proc.id}/step-${s.order}.jpg`
        imageUrl = await uploadImage(s.image, storagePath)
        console.log(`  ✓ paso ${s.order}: ${s.title}`)
      } else {
        console.log(`  ✓ paso ${s.order}: ${s.title} (sin imagen)`)
      }
      steps.push({ order: s.order, title: s.title, description: s.description, imageUrl })
    }
    return steps
  }

  // ── Grader → Firestore ──
  console.log(`\n── Grader: ${GRADER_PROC.id}`)
  const graderSteps = await buildSteps('grader', GRADER_PROC)
  if (isDryRun) {
    console.log(`  (dry-run) doc listo con ${graderSteps.length} pasos`)
  } else {
    const db = admin.firestore()
    await db.collection('learningContent').doc('grader').collection('procedures').doc(GRADER_PROC.id).set({
      id: GRADER_PROC.id,
      title: GRADER_PROC.title,
      description: GRADER_PROC.description,
      steps: graderSteps,
      createdAt: BASE,
      updatedAt: BASE,
    })
    console.log(`  ✓ documento Firestore guardado`)
  }

  // ── Marel Filete → JSON estático ──
  console.log(`\n── Marel Filete: ${MAREL_FILETE_PROC.id}`)
  const mfSteps = await buildSteps('marel-filete', MAREL_FILETE_PROC)
  const mfProc = { id: MAREL_FILETE_PROC.id, title: MAREL_FILETE_PROC.title, description: MAREL_FILETE_PROC.description, steps: mfSteps }

  if (isDryRun) {
    console.log(`  (dry-run) doc listo con ${mfSteps.length} pasos — no se toca el JSON`)
  } else {
    if (!fs.existsSync(MAREL_FILETE_JSON_PATH)) { console.error(`No existe ${MAREL_FILETE_JSON_PATH}`); process.exit(1) }
    const seedJson = JSON.parse(fs.readFileSync(MAREL_FILETE_JSON_PATH, 'utf8'))
    if (!seedJson.procedures) seedJson.procedures = []
    const idx = seedJson.procedures.findIndex(p => p.id === mfProc.id)
    if (idx >= 0) { seedJson.procedures[idx] = mfProc; console.log(`  · reemplaza existente en el JSON`) }
    else { seedJson.procedures.push(mfProc); console.log(`  · agrega nuevo al JSON`) }
    fs.writeFileSync(MAREL_FILETE_JSON_PATH, JSON.stringify(seedJson, null, 2) + '\n', 'utf8')
    console.log(`  ✓ ${MAREL_FILETE_JSON_PATH} actualizado (${seedJson.procedures.length} procedimientos en total)`)
  }

  console.log(`\nListo${isDryRun ? ' (dry-run, nada escrito)' : ''}.`)
}

main().catch(err => { console.error(err); process.exit(1) })
