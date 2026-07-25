#!/usr/bin/env node
/**
 * Seed: procedimientos con capturas de pantalla para Marel HG — "Modificar
 * distancia de flipper" y "Activación manual de flippers de entrada Baader".
 *
 * Fuente: frames extraídos con ffmpeg de los videos del expediente del equipo
 * (716_IMG_2422.MOV y 504_video_2025-01-03_18-48-48.mp4), verificados
 * visualmente uno por uno antes de redactar los pasos — las descripciones
 * describen exactamente lo que se ve en cada captura (rótulos de pantalla,
 * botones, campos), no una suposición genérica.
 *
 * Sube las imágenes a Firebase Storage (mismo patrón que
 * upload-historical-excels-to-storage.js: token de descarga manual, URL
 * permanente).
 *
 * IMPORTANTE: Marel HG NO lee procedimientos de Firestore — usa el seed JSON
 * estático `apps/pwa/src/services/marelHg/marelHgContent.json`
 * (ver marelHgLearning.ts::listMarelHgProcedures). Por eso este script, tras
 * subir las imágenes, INSERTA los procedimientos directo en ese JSON en vez
 * de escribir a Firestore — si no, quedarían invisibles en la app.
 *
 * Idempotente: si el id del procedimiento ya existe en el JSON, lo reemplaza
 * en vez de duplicarlo. El upload de imágenes SÍ genera un token nuevo cada
 * corrida (quedan tokens huérfanos en Storage de corridas previas; no rompe
 * nada pero no vale la pena correrlo dos veces sin necesidad).
 *
 * Uso:
 *   node scripts/seed-procedimiento-flipper-marel-hg.js --dry-run
 *   node scripts/seed-procedimiento-flipper-marel-hg.js
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const isDryRun = process.argv.slice(2).includes('--dry-run')
const BASE = Date.parse('2026-07-24T21:00:00-04:00')
const SLUG = 'marel-hg'

const FRAMES_DIR = 'C:/Users/orelc/AppData/Local/Temp/claude/C--Users-orelc-OneDrive-ANTARFOOD/1ae6f8d7-510d-4123-bb95-5107fb1ee305/scratchpad/marel-hg-frames'

const JSON_SEED_PATH = path.join(__dirname, '..', 'apps', 'pwa', 'src', 'services', 'marelHg', 'marelHgContent.json')

const PROCEDURES = [
  {
    id: 'mhg-proc-modificar-distancia-flipper',
    title: 'Modificar distancia de flipper (Servicio → Distancias puerta)',
    description: 'Ajustar a qué distancia se abre cada compuerta (puerta) desde el menú Servicio del A600.',
    menuPath: ['Servicio', 'Distancias puerta'],
    steps: [
      {
        title: 'Ingresar la clave de Servicio',
        description: 'En la pantalla de inicio del A600 aparece "Introduzca la contraseña" con un teclado numérico. Escribe la clave de Servicio (ver pestaña Consulta rápida) y confirma con ✔.',
        image: `${FRAMES_DIR}/716/716_frame_01.jpg`,
      },
      {
        title: 'Abrir "Distancias puerta"',
        description: 'Se abre la tabla con las 5 puertas (flippers). Cada fila tiene: Distancia, Distancia abierta, Desplz. cierre, Umbral sujec., Ubicación y Tiempo caída. Los botones "Guardar" y "Atrás" están abajo.',
        image: `${FRAMES_DIR}/716/716_frame_02.jpg`,
      },
      {
        title: 'Seleccionar y ajustar la puerta',
        description: 'Toca la fila de la puerta a modificar (queda marcada ">N<") y luego la celda "Distancia abierta" (se resalta en azul). Usa los botones "−" / "+" para bajar o subir el valor: bajar la distancia hace que el flipper abra antes; subir la distancia hace que abra después.',
        image: `${FRAMES_DIR}/716/716_frame_08.jpg`,
      },
      {
        title: 'Guardar el cambio',
        description: 'Presiona "Guardar" (esquina inferior derecha de la tabla) para aplicar el nuevo valor. Sin este paso el ajuste no queda grabado.',
        image: null,
      },
    ],
  },
  {
    id: 'mhg-proc-activar-flippers-entrada-baader',
    title: 'Activación manual de flippers de entrada al Baader',
    description: 'Abrir manualmente una compuerta específica desde el menú Servicio, sin esperar producto — útil para pruebas y despeje de atascos.',
    menuPath: ['Servicio', 'Activación manual de puertas'],
    steps: [
      {
        title: 'Ingresar la clave de Servicio',
        description: 'Misma pantalla "Introduzca la contraseña": ingresa la clave de Servicio con el teclado numérico y confirma con ✔.',
        image: `${FRAMES_DIR}/504/504_frame_01.jpg`,
      },
      {
        title: 'Confirmar la clave',
        description: 'El campo muestra la clave enmascarada con asteriscos mientras se escribe. Verifica los dígitos antes de confirmar.',
        image: `${FRAMES_DIR}/504/504_frame_05.jpg`,
      },
      {
        title: 'Elegir la puerta y activarla',
        description: 'En la pantalla de activación manual: arriba a la derecha selecciona el número de "Puerta por ajustar" con los botones "−"/"+"; abajo a la izquierda se ve el "Tiempo apertura/cierre puerta" (ej. 0.75 s). Presiona "Iniciar/detener" (abajo a la derecha) para abrir y cerrar esa puerta manualmente.',
        image: `${FRAMES_DIR}/504/504_frame_10.jpg`,
      },
    ],
  },
]

async function main() {
  console.log(`Seed procedimientos con fotos — ${SLUG} (${PROCEDURES.length} procedimientos)${isDryRun ? ' [DRY-RUN]' : ''}`)

  if (!fs.existsSync(JSON_SEED_PATH)) {
    console.error(`No existe el seed JSON: ${JSON_SEED_PATH}`)
    process.exit(1)
  }

  let bucket = null
  if (!isDryRun) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    if (!fs.existsSync(keyPath)) {
      console.error('Falta serviceAccountKey.json en la raíz del repo.')
      process.exit(1)
    }
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
    })
    bucket = admin.storage().bucket()
  }

  async function uploadImage(localPath, storagePath) {
    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ no existe: ${localPath}`)
      process.exit(1)
    }
    if (isDryRun) {
      const kb = Math.round(fs.statSync(localPath).size / 1024)
      console.log(`    · subiría ${path.basename(localPath)} (${kb} KB) → ${storagePath}`)
      return `dry-run://${storagePath}`
    }
    const buffer = fs.readFileSync(localPath)
    const token = randomUUID()
    const file = bucket.file(storagePath)
    await file.save(buffer, {
      metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } },
    })
    const encodedPath = encodeURIComponent(storagePath)
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`
  }

  const built = []
  for (const proc of PROCEDURES) {
    console.log(`\n── ${proc.id}`)
    const steps = []
    for (let i = 0; i < proc.steps.length; i++) {
      const s = proc.steps[i]
      let imageUrl = null
      if (s.image) {
        const storagePath = `learningContent/${SLUG}/procedures/${proc.id}/step-${i + 1}.jpg`
        imageUrl = await uploadImage(s.image, storagePath)
        console.log(`  ✓ paso ${i + 1}: ${s.title}`)
      } else {
        console.log(`  ✓ paso ${i + 1}: ${s.title} (sin imagen)`)
      }
      steps.push({ order: i + 1, title: s.title, description: s.description, imageUrl })
    }
    built.push({ id: proc.id, title: proc.title, description: proc.description, steps })
  }

  // Marel HG lee procedimientos del JSON estático, no de Firestore: insertar/
  // reemplazar por id en vez de escribir un doc que la app nunca leería.
  const seedJson = JSON.parse(fs.readFileSync(JSON_SEED_PATH, 'utf8'))
  for (const proc of built) {
    const idx = seedJson.procedures.findIndex(p => p.id === proc.id)
    if (idx >= 0) {
      console.log(`\n  · reemplaza "${proc.id}" existente en el JSON (posición ${idx})`)
      seedJson.procedures[idx] = proc
    } else {
      console.log(`\n  · agrega "${proc.id}" nuevo al JSON`)
      seedJson.procedures.push(proc)
    }
  }

  if (isDryRun) {
    console.log(`\n(dry-run) no se escribió el JSON.`)
  } else {
    fs.writeFileSync(JSON_SEED_PATH, JSON.stringify(seedJson, null, 2) + '\n', 'utf8')
    console.log(`\n✓ ${JSON_SEED_PATH} actualizado (${seedJson.procedures.length} procedimientos en total).`)
  }

  console.log(`\nListo${isDryRun ? ' (dry-run, nada escrito)' : ''}.`)
}

main().catch(err => { console.error(err); process.exit(1) })
