/**
 * reaggregate-shift-window.js
 *
 * Re-agrega un turno de `shoplogix/{planta}/shifts` a su ventana real, usando los
 * intervals y states crudos que el sync ya dejó guardados en `machines/{id}`.
 *
 * Para cuándo: Shoplogix a veces re-etiqueta intervals de OTRO turno como propios
 * después del cierre. La ventana derivada se estira, los contadores del turno se
 * inflan con datos ajenos, y el día queda con doble conteo.
 *
 * Caso que lo originó — Chonchi, 3-ago-2026 "Turno 2": su reconciliación registró
 * el salto de 3.333 a 10.462 piezas 24 h después del cierre. El re-agregado a la
 * ventana real (09:15→17:00) lo devolvió a 3.319, y se comprobó que el 96,4% de
 * los ciclos retirados estaban dentro de la ventana del turno de noche — es decir,
 * eran una copia de ese turno, no datos propios.
 *
 * `resolveShiftWindow` (functions/shoplogix/sync.js, PR #376) evita que esto se
 * repita EN EL DÍA EN CURSO. Este script es para los días pasados, donde el sync
 * no consulta el rollup oficial y por tanto no puede corregirse solo.
 *
 * Aritmética: la misma de `normalizeShift` en functions/shoplogix/normalizer.js —
 * intervals cuyo `startAt` cae dentro de la ventana; states que la solapan,
 * recortados a ella. Si esa lógica cambia allá, cambiarla acá.
 *
 * Lo que NO se puede recalcular desde lo guardado:
 *   - `uptimeCycles` / `scheduledCycles`: el normalizer los suma de campos RAW por
 *     interval que no se persisten. Se PRORRATEAN por la razón de `totalCycles` y
 *     quedan marcados como aproximados en el doc.
 *   - `actualRuntime` / `expectedRuntime` / `runtimeVariance`: vienen del summary
 *     de la API. Se dejan intactos.
 *
 * Uso:
 *   node scripts/reaggregate-shift-window.js --planta chonchi --shift "2026-08-03_Turno 2"
 *   ... --desde 2026-08-03T09:15:00Z --hasta 2026-08-03T17:00:00Z   (además corrige la ventana)
 *   ... --confirm                                                    (escribe)
 *
 * Sin --desde/--hasta usa la ventana que ya tiene el doc. Respalda a _snapshots
 * antes de escribir. Idempotente: correrlo dos veces da el mismo resultado.
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
const CONFIRM = process.argv.includes('--confirm')
const PLANTA = arg('--planta')
const SHIFT = arg('--shift')
const DESDE = arg('--desde')
const HASTA = arg('--hasta')

if (!PLANTA || !SHIFT) {
  console.error('Uso: --planta <chonchi|yal|filete> --shift <YYYY-MM-DD_Nombre> [--desde ISO --hasta ISO] [--confirm]')
  process.exit(1)
}

/** Igual que MAX_SHIFT_MS en functions/shoplogix/sync.js: ventana creíble para un turno. */
const MAX_SHIFT_MS = 16 * 3600_000

const D = (t) => t?.toDate ? t.toDate() : (t?._seconds ? new Date(t._seconds * 1000) : null)
const TS = (d) => admin.firestore.Timestamp.fromDate(d)

/** Mismo criterio que el normalizer para separar la parada programada del break. */
const isPlannedDT = (s) => {
  if (s.type !== 'break') return false
  const r = (s.reason || '').toLowerCase()
  return r.includes('planned downtime') || r.includes('detencion programada') || r.includes('detención programada')
}

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  const ref = db.collection('shoplogix').doc(PLANTA).collection('shifts').doc(SHIFT)
  const snap = await ref.get()
  if (!snap.exists) { console.error(`No existe shoplogix/${PLANTA}/shifts/${SHIFT}`); process.exit(1) }
  const padre = snap.data()

  const ini = DESDE ? new Date(DESDE) : D(padre.scheduledStart)
  const fin = HASTA ? new Date(HASTA) : D(padre.scheduledEnd)
  if (!ini || !fin || isNaN(ini) || isNaN(fin) || fin <= ini) { console.error('Ventana inválida'); process.exit(1) }

  const horas = (fin - ini) / 3600000
  console.log(`turno:   ${PLANTA}/${SHIFT}`)
  console.log(`ventana: ${ini.toISOString()} → ${fin.toISOString()} (${horas.toFixed(2)} h)${DESDE || HASTA ? '  [pasada por parámetro]' : '  [la del doc]'}`)

  // Guarda: re-agregar contra una ventana imposible no arregla nada — deja el
  // turno igual de inflado y encima borra el rastro. Pasar --desde/--hasta.
  if (horas > MAX_SHIFT_MS / 3600000) {
    console.error(`\n✗ La ventana dura ${horas.toFixed(1)} h: sigue siendo imposible.`)
    console.error('  Corrígela primero con --desde/--hasta (mira el officialSchedule del doc).')
    process.exit(1)
  }

  const maq = await ref.collection('machines').get()
  if (maq.empty) { console.error('El turno no tiene subcolección machines: nada que re-agregar'); process.exit(1) }

  const respaldo = { at: new Date().toISOString(), planta: PLANTA, shift: SHIFT, padre: { machines: padre.machines }, machines: {} }
  maq.docs.forEach((d) => { respaldo.machines[d.id] = d.data() })

  const patches = []
  const nuevasMaquinas = []

  for (const d of maq.docs) {
    const m = d.data()
    const ivAll = m.intervals || []
    const stAll = m.states || []

    const iv = ivAll.filter((x) => { const s = D(x.startAt); return s && s >= ini && s < fin })
    const st = stAll
      .filter((x) => { const s = D(x.startAt), e = D(x.endAt); return s && e && e > ini && s < fin })
      .map((x) => {
        const s = D(x.startAt), e = D(x.endAt)
        const s2 = new Date(Math.max(s.getTime(), ini.getTime()))
        const e2 = new Date(Math.min(e.getTime(), fin.getTime()))
        if (s2.getTime() === s.getTime() && e2.getTime() === e.getTime()) return x
        return { ...x, startAt: TS(s2), endAt: TS(e2), durationSec: Math.max(0, Math.round((e2 - s2) / 1000)) }
      })

    const sum = (arr, f) => arr.reduce((a, x) => a + (Number(x[f]) || 0), 0)
    const totalCycles = sum(iv, 'cycles')
    const expectedTotalCycles = sum(iv, 'expectedCycles')
    const last = iv[iv.length - 1]
    const overallRatio = expectedTotalCycles > 0 ? totalCycles / expectedTotalCycles : 0

    const br = {
      uptimeSec:          st.filter((s) => s.type === 'uptime').reduce((a, s) => a + (s.durationSec || 0), 0),
      breakSec:           st.filter((s) => s.type === 'break' && !isPlannedDT(s)).reduce((a, s) => a + (s.durationSec || 0), 0),
      plannedDowntimeSec: st.filter(isPlannedDT).reduce((a, s) => a + (s.durationSec || 0), 0),
      downtimeSec:        st.filter((s) => s.type === 'downtime').reduce((a, s) => a + (s.durationSec || 0), 0),
      setupSec:           st.filter((s) => s.type === 'setup').reduce((a, s) => a + (s.durationSec || 0), 0),
      totalTrackedSec:    0,
    }
    br.totalTrackedSec = br.uptimeSec + br.breakSec + br.plannedDowntimeSec + br.downtimeSec + br.setupSec
    const productivo = br.totalTrackedSec - br.plannedDowntimeSec
    const shiftRuntime = productivo > 0 ? br.uptimeSec / productivo : 0

    const razon = (m.totalCycles ?? 0) > 0 ? totalCycles / m.totalCycles : 0
    const uptimeCycles = Math.round((m.uptimeCycles ?? 0) * razon)
    const scheduledCycles = Math.round((m.scheduledCycles ?? 0) * razon)

    const cambia = ivAll.length !== iv.length || stAll.length !== st.length || (m.totalCycles ?? 0) !== totalCycles
    console.log(`\n── ${m.machineName || d.id} ──${cambia ? '' : '   (sin cambios)'}`)
    console.log(`   intervals ${ivAll.length}→${iv.length} · states ${stAll.length}→${st.length}`)
    console.log(`   totalCycles ${m.totalCycles ?? 0} → ${totalCycles}`)
    console.log(`   uptimeSec ${m.shiftRuntimeBreakdown?.uptimeSec ?? 0} → ${br.uptimeSec}  ·  shiftRuntime ${(m.shiftRuntime ?? 0).toFixed(3)} → ${shiftRuntime.toFixed(3)}`)
    if (razon !== 1) console.log(`   uptimeCycles ${m.uptimeCycles ?? 0} → ${uptimeCycles} (prorrateado ×${razon.toFixed(3)}, aproximado)`)

    patches.push({
      ref: d.ref,
      patch: {
        intervals: iv,
        states: st,
        totalCycles,
        expectedTotalCycles,
        totalPieces: last?.total ?? 0,
        expectedTotalPieces: last?.expectedTotal ?? 0,
        overallRatio,
        uptimeCycles,
        scheduledCycles,
        shiftRuntimeBreakdown: br,
        shiftRuntime,
        shiftStart: TS(ini),
        shiftEnd: TS(fin),
        scheduledStart: TS(ini),
        scheduledEnd: TS(fin),
        reagregado: {
          at: new Date().toISOString(),
          ventana: { desde: ini.toISOString(), hasta: fin.toISOString() },
          exacto: ['totalCycles', 'expectedTotalCycles', 'totalPieces', 'overallRatio', 'shiftRuntimeBreakdown', 'shiftRuntime', 'intervals', 'states'],
          aproximado: ['uptimeCycles', 'scheduledCycles'],
          intacto: ['actualRuntime', 'expectedRuntime', 'runtimeVariance'],
        },
      },
    })

    const enPadre = (padre.machines || []).find((x) => x.machineid === m.machineid) || {}
    nuevasMaquinas.push({
      ...enPadre,
      totalCycles,
      uptimeSec: br.uptimeSec,
      intervals: iv.length,
      states: st.length,
      ...(enPadre.shiftRuntime != null ? { shiftRuntime } : {}),
      ...(enPadre.overallRatio != null ? { overallRatio } : {}),
    })
  }

  const antes = (padre.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
  const despues = nuevasMaquinas.reduce((a, m) => a + (m.totalCycles || 0), 0)
  const quitadoPct = antes > 0 ? ((antes - despues) / antes) * 100 : 0
  console.log(`\n=== total del turno: ${antes} → ${despues} ciclos (−${quitadoPct.toFixed(1)}%) ===`)
  if (antes === despues) console.log('    (ya estaba re-agregado: nada que corregir)')

  // Guarda contra el mal uso: `normalizeShift` NO filtra los intervals por
  // ventana — guarda los que la API asignó al turno, y algunos caen legítimamente
  // en los bordes. En un turno SANO este script les recortaría esa cola: probado
  // con un turno normal de Yal, le quitaba 200 ciclos (−2%) sin que hubiera nada
  // que reparar. Un turno de verdad contaminado pierde una fracción grande (el
  // caso del 3-ago perdía 68%). Por debajo del umbral, exigir --forzar.
  const UMBRAL_PCT = 10
  if (antes !== despues && quitadoPct < UMBRAL_PCT && !process.argv.includes('--forzar')) {
    console.error(`\n✗ Solo se quitaría ${quitadoPct.toFixed(1)}% de los ciclos (umbral ${UMBRAL_PCT}%).`)
    console.error('  Esto no parece un turno contaminado sino uno sano con intervals de borde,')
    console.error('  que el sync guarda a propósito. Re-agregarlo le quitaría datos legítimos.')
    console.error('  Si de verdad quieres hacerlo, agrega --forzar.')
    process.exit(1)
  }

  if (!CONFIRM) { console.log('\n  (dry-run: usa --confirm para aplicar)'); process.exit(0) }

  const dir = path.join(__dirname, '..', '_snapshots')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `shoplogix__${PLANTA}__${SHIFT.replace(/[^\w-]/g, '_')}__pre-reagregado__${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify(respaldo, null, 2), 'utf8')
  console.log(`\nrespaldo: ${file}`)

  for (const p of patches) await p.ref.update(p.patch)
  await ref.update({
    machines: nuevasMaquinas,
    scheduledStart: TS(ini),
    scheduledEnd: TS(fin),
    ...(DESDE || HASTA ? { scheduleSource: 'official-corregido' } : {}),
    ciclosReagregados: { at: new Date().toISOString(), antes, despues },
  })
  console.log('✓ escrito')
  process.exit(0)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
