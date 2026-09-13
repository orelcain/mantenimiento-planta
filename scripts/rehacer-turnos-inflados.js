/**
 * rehacer-turnos-inflados.js
 *
 * Rehace los resúmenes de `graderDailySummaries` que quedaron con las piezas
 * contadas DOS VECES.
 *
 * **Qué pasó.** `load-missing-shifts.js` dedupeaba las filas con una clave que
 * incluía el lote. El Excel del mes y el recorte por turno traen los mismos
 * registros, pero el recorte no trae las columnas `lot`, `product`,
 * `conservation` ni `shift`: con `lot` en la clave, las dos copias del mismo
 * turno eran claves distintas y las piezas se sumaban dos veces. Doce turnos de
 * julio 2025 se guardaron así — el 2025-07-08 con 11.228 piezas cuando el turno
 * tuvo 5.614. Y el KPI de Puerta 0 quedó a la MITAD, porque el porcentaje se
 * calcula contra ese total inflado (419/11.228 = 3,73 % en vez de 7,46 %).
 *
 * La clave ya está corregida en `load-missing-shifts.js` y en el PWA (#973);
 * esto arregla lo que quedó escrito.
 *
 * **A quiénes toca.** Solo a los resúmenes que nombran a la vez el Excel del mes
 * y un recorte `_pp.xlsx`, que son los únicos que pudieron doblarse, y solo si
 * los escribió `load-missing-shifts.js`. Los otros 335 se generaron con los dos
 * recortes y ya están bien; los 50 que escribió la app no se tocan, porque la
 * app calcula campos que este pipeline no produce y pisarlos sería destruirlos.
 *
 * **Con qué se rehace.** Con los recortes del propio turno, que contienen el
 * turno completo — es exactamente como se generaron los 335 sanos.
 *
 * Antes de escribir deja un respaldo JSON de cada documento tal como está hoy.
 *
 * Uso:
 *   node scripts/rehacer-turnos-inflados.js            # dry-run: mide y compara
 *   node scripts/rehacer-turnos-inflados.js --confirm  # escribe, de a uno
 */

'use strict'
const fs = require('fs')
const path = require('path')
const {
  db, bucket, nuevoSegmento, procesarArchivo, construirSummary, escribirSegmento,
} = require('./load-missing-shifts')

const CONFIRM = process.argv.includes('--confirm')
const RESPALDO = path.join(__dirname, '..', '.respaldos', `turnos-inflados-${new Date().toISOString().slice(0, 10)}.json`)

const esExcelDelMes = (n) => /^Pieza pieza Grader STATICGRADER1/.test(n)
const esRecortePP = (n) => /_pp\.xlsx$/i.test(n)

;(async () => {
  console.log(CONFIRM ? '⚠️  MODO ESCRITURA (--confirm)\n' : '🔍 DRY RUN — no se escribe nada. Usa --confirm para aplicar.\n')

  const sums = (await db.collection('graderDailySummaries').get()).docs
  const afectados = sums
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      const f = s.sourceFileNames ?? []
      return f.some(esExcelDelMes) && f.some(esRecortePP) && s.loadedBy === 'load-missing-shifts.js'
    })
  console.log(`resúmenes: ${sums.length} · candidatos (mes + recorte, escritos por el script): ${afectados.length}\n`)
  if (afectados.length === 0) { console.log('nada que hacer.'); process.exit(0) }

  // Los uploads de esos turnos: los recortes, que traen el turno completo.
  const ups = (await db.collection('graderUploads').get()).docs.map((d) => d.data())
  const porTurno = new Map()
  for (const u of ups) {
    if (!u.fileMeta?.storagePath || !u.sessionDate || !u.shiftId) continue
    const k = `${u.sessionDate}__${u.shiftId}`
    if (!porTurno.has(k)) porTurno.set(k, [])
    porTurno.get(k).push({ path: u.fileMeta.storagePath, name: u.fileMeta.name })
  }

  const respaldo = []
  const filas = []
  for (const viejo of afectados) {
    const archivos = porTurno.get(viejo.id) ?? []
    if (archivos.length === 0) { filas.push({ id: viejo.id, nota: 'SIN RECORTES EN STORAGE — se salta' }); continue }

    const segmentos = new Map()
    for (const a of archivos) {
      const [buf] = await bucket.file(a.path).download()
      procesarArchivo(buf, a.name, segmentos, new Set())
    }
    const seg = segmentos.get(viejo.id)
    if (!seg || seg.totalPieces === 0) { filas.push({ id: viejo.id, nota: 'el recorte no produce ese turno — se salta' }); continue }

    const nuevo = construirSummary(seg, 'rehacer-turnos-inflados')
    filas.push({
      id: viejo.id, seg, nuevo,
      piezasAntes: viejo.totalPieces, piezasDespues: nuevo.totalPieces,
      p0Antes: viejo.pointZeroPieces, p0Despues: nuevo.pointZeroPieces,
      pctAntes: viejo.pointZeroPct, pctDespues: nuevo.pointZeroPct,
      factor: viejo.totalPieces / (nuevo.totalPieces || 1),
    })
    respaldo.push(viejo)
  }

  console.log('turno                          piezas antes → después   factor   P0 %  antes → después')
  for (const f of filas) {
    if (f.nota) { console.log(`  ${f.id.padEnd(30)} ${f.nota}`); continue }
    console.log(`  ${f.id.padEnd(30)} ${String(f.piezasAntes).padStart(7)} → ${String(f.piezasDespues).padStart(7)}   ${f.factor.toFixed(3)}   ${String(f.pctAntes).padStart(6)} → ${String(f.pctDespues).padStart(6)}`)
  }

  const aEscribir = filas.filter((f) => !f.nota && f.piezasAntes !== f.piezasDespues)
  console.log(`\ncon diferencia: ${aEscribir.length} de ${filas.length}`)
  const dobles = aEscribir.filter((f) => Math.abs(f.factor - 2) < 0.01).length
  console.log(`de esos, exactamente al doble: ${dobles}`)

  if (!CONFIRM) { console.log('\n(dry-run: no se escribió nada — usa --confirm para aplicar)'); process.exit(0) }

  fs.mkdirSync(path.dirname(RESPALDO), { recursive: true })
  fs.writeFileSync(RESPALDO, JSON.stringify(respaldo, null, 2), 'utf8')
  console.log(`\nrespaldo de ${respaldo.length} documentos → ${RESPALDO}`)

  let n = 0
  for (const f of aEscribir) {
    await escribirSegmento(f.seg, f.nuevo)   // de a uno, nunca en lote
    n++
    console.log(`  ✓ ${f.id} · ${f.piezasAntes} → ${f.piezasDespues} pz`)
  }
  console.log(`\nreescritos: ${n}`)
  process.exit(0)
})().catch((e) => { console.error('ERR', e); process.exit(1) })
