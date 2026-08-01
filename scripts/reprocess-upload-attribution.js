/**
 * Re-atribuye día/turno de los Excel subidos (`graderUploads`).
 *
 * Complemento de `reprocess-shift-attribution.js`, que solo cubrió los
 * resúmenes (`graderDailySummaries`). Los uploads guardan su propio
 * `sessionDate` / `shiftId`, calculados con el mismo código que tenía el bug de
 * zona horaria — por eso el calendario seguía mostrando "2f" (dos archivos) en
 * el 1-ago cuando el turno es del 31-jul.
 *
 * El calendario agrupa por el CAMPO `sessionDate` (ver
 * GraderHistoricalCalendar: uploadsByDate), no por el id del documento, así que
 * alcanza con corregir los campos. No se recrean documentos: menos riesgo y no
 * se pierden las referencias a los archivos en Storage.
 *
 * Uso:
 *   node scripts/reprocess-upload-attribution.js            # dry-run
 *   node scripts/reprocess-upload-attribution.js --apply
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
const core = require('./_grader-core.cjs')

const APPLY = process.argv.includes('--apply')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
const FP = admin.firestore.FieldPath

const COLLECTION = 'graderUploads'
const DEFAULT_LINE = 'chonchi-eviscerado'
/** Último code point del área privada BMP: ordena después de cualquier nombre de turno. */
const SHIFT_RANGE_END = String.fromCharCode(0xf8ff)

const toDate = (v) => (v && v.toDate ? v.toDate() : v ? new Date(v) : null)

function shiftDateKey(dateKey, days) {
  const t = Date.parse(`${dateKey}T12:00:00.000Z`)
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

async function loadWindows(dateKeys, plantSlug) {
  const days = new Set()
  for (const dk of dateKeys) { days.add(dk); days.add(shiftDateKey(dk, -1)) }
  const windows = []
  for (const dk of Array.from(days).sort()) {
    const snap = await db.collection(`shoplogix/${plantSlug}/shifts`)
      .where(FP.documentId(), '>=', `${dk}_`)
      // SHIFT_RANGE_END es indispensable: sin él ambos límites quedan iguales
      // y la query no devuelve NADA — el corte caería siempre al schedule
      // declarado, que es lo contrario de "Shoplogix manda".
      .where(FP.documentId(), '<=', `${dk}_` + SHIFT_RANGE_END)
      .get().catch(() => null)
    if (!snap) continue
    for (const d of snap.docs) {
      const r = d.data()
      const shiftId = String(r.shiftId ?? d.id.slice(dk.length + 1))
      if (shiftId === 'Unscheduled') continue
      const s = toDate(r.scheduledStart), e = toDate(r.scheduledEnd)
      if (!s || !e || !(e.getTime() > s.getTime())) continue
      windows.push({ sessionDate: String(r.dateKey ?? dk), shiftId, startMs: s.getTime(), endMs: e.getTime() })
    }
  }
  return windows
}

async function main() {
  const snap = await db.collection(COLLECTION).get()
  const uploads = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  console.log(`Uploads: ${uploads.length}\n`)

  // Agrupar por línea para usar la planta y el horario correctos
  const byLine = new Map()
  for (const u of uploads) {
    const line = u.plantLineId || DEFAULT_LINE
    if (!byLine.has(line)) byLine.set(line, [])
    byLine.get(line).push(u)
  }

  const cambios = []
  for (const [plantLineId, list] of byLine) {
    const cfg = core.getPlantLineConfig(plantLineId)
    const schedule = core.normalizeShiftSchedule(undefined, cfg.defaultShiftSchedule)
    const dateKeys = new Set(
      list.map((u) => (u.inferred?.startAt || '').slice(0, 10)).filter(Boolean),
    )
    const windows = await loadWindows(dateKeys, cfg.plantSlug)
    console.log(`── ${plantLineId} (${cfg.plantSlug}) · ${list.length} uploads · ventanas=${windows.length}`)

    for (const u of list) {
      const startAt = u.inferred?.startAt
      if (!startAt) {
        console.log(`   ? ${u.id} — sin inferred.startAt, no se puede recalcular`)
        continue
      }
      // Mismo orden de mando que la app: Shoplogix primero, schedule después.
      const asignado =
        core.assignFromShoplogixWindows(startAt, windows) ??
        core.assignShiftAndDate(startAt, schedule)

      if (asignado.sessionDate === u.sessionDate && asignado.shiftId === u.shiftId) continue

      // GUARDA: solo mover el upload si el turno destino EXISTE como resumen.
      //
      // Sin esto el script reescribía a ciegas: mandaba uploads a turnos que no
      // existen (quedando huérfanos en el calendario) y pisaba fechas que el
      // usuario pudo haber elegido a mano al cargar el Excel — el wizard permite
      // asignar el turno explícitamente. Exigir que el destino ya tenga resumen
      // garantiza que el archivo aterrice junto a los datos que produjo.
      const destinoId = plantLineId && plantLineId !== DEFAULT_LINE
        ? `${plantLineId}__${asignado.sessionDate}__${asignado.shiftId}`
        : `${asignado.sessionDate}__${asignado.shiftId}`
      const destino = await db.collection('graderDailySummaries').doc(destinoId).get()

      cambios.push({
        id: u.id,
        de: `${u.sessionDate} · ${u.shiftId}`,
        a: `${asignado.sessionDate} · ${asignado.shiftId}`,
        sessionDate: asignado.sessionDate,
        shiftId: asignado.shiftId,
        archivo: u.fileMeta?.name ?? '',
        aplicable: destino.exists,
        destinoId,
      })
    }
    console.log('')
  }

  const aplicables = cambios.filter((c) => c.aplicable)
  const omitidos = cambios.filter((c) => !c.aplicable)

  console.log('═══ SE MUEVEN ═══')
  if (aplicables.length === 0) console.log('  (ninguno)')
  for (const c of aplicables) {
    console.log(`  ${c.de}  →  ${c.a}`)
    console.log(`     ${c.archivo}`)
  }

  console.log('\n═══ SE DEJAN COMO ESTÁN (el turno destino no tiene resumen) ═══')
  if (omitidos.length === 0) console.log('  (ninguno)')
  for (const c of omitidos) {
    console.log(`  ${c.de}  →  ${c.a}`)
    console.log(`     no existe ${c.destinoId}`)
    console.log(`     ${c.archivo}`)
  }

  console.log(`\nTotal: ${aplicables.length} a mover · ${omitidos.length} omitidos · ${uploads.length} uploads`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se escribió nada. Correr con --apply para aplicar.')
    process.exit(0)
  }

  for (const c of aplicables) {
    await db.collection(COLLECTION).doc(c.id).set(
      { sessionDate: c.sessionDate, shiftId: c.shiftId, _updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    )
    console.log(`  ✓ ${c.id}`)
  }
  console.log('\nListo.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
