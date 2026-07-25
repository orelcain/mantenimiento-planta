#!/usr/bin/env node
/**
 * Seed: secciones de manual minadas de los manuales oficiales (Grader
 * instruction manual, Marel M-Weigher WTR / SmartLine) para Grader y Marel
 * Filete. Fuente: grader_content_candidates.json / marel_filete_content_candidates.json
 * (generados por Codex leyendo los PDF->txt del expediente, curados y
 * verificados antes de sembrar — ver commit para el detalle de la revisión).
 *
 * Ambas máquinas leen su manual de un seed base + overrides de Firestore
 * (mergeSeedOverrides / withManualOverrides) — estos docs se AGREGAN sin
 * tocar el seed base (graderRunbooks.ts / marelFileteContent.json).
 *
 * Uso:
 *   node scripts/seed-manual-grader-filete.js --dry-run
 *   node scripts/seed-manual-grader-filete.js
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

const isDryRun = process.argv.slice(2).includes('--dry-run')
const BASE = Date.parse('2026-07-24T23:00:00-04:00')

const CANDIDATES_DIR = 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA'

function slugTitle(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50)
}

const TARGETS = [
  { slug: 'grader', idPrefix: 'grader-manual-mined-', file: `${CANDIDATES_DIR}/grader_content_candidates.json`, orderStart: 100 },
  { slug: 'marel-filete', idPrefix: 'mf-manual-mined-', file: `${CANDIDATES_DIR}/marel_filete_content_candidates.json`, orderStart: 100 },
]

async function main() {
  console.log(`Seed manual (minado) Grader + Marel Filete${isDryRun ? ' [DRY-RUN]' : ''}`)

  let db = null
  if (!isDryRun) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
    db = admin.firestore()
  }

  for (const t of TARGETS) {
    if (!fs.existsSync(t.file)) { console.error(`No existe: ${t.file}`); process.exit(1) }
    const data = JSON.parse(fs.readFileSync(t.file, 'utf8'))
    console.log(`\n── ${t.slug} (${data.manualSections.length} secciones)`)

    for (let i = 0; i < data.manualSections.length; i++) {
      const s = data.manualSections[i]
      const id = `${t.idPrefix}${slugTitle(s.title)}`
      const doc = {
        id,
        title: s.title,
        content: s.content,
        order: t.orderStart + i,
        objetivo: s.objetivo,
        porque: s.porque,
        quiz: (s.quiz || []).map(q => ({
          question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation,
        })),
        createdAt: BASE,
        updatedAt: BASE,
      }
      if (isDryRun) {
        console.log(`  · ${id} — "${s.title}" (${s.content.length} chars, quiz embebido: ${(s.quiz || []).length})`)
      } else {
        await db.collection('learningContent').doc(t.slug).collection('manual').doc(id).set(doc)
        console.log(`  ✓ ${id} guardada`)
      }
    }
  }

  console.log(`\nListo${isDryRun ? ' (dry-run, nada escrito)' : ''}.`)
}

main().catch(err => { console.error(err); process.exit(1) })
