#!/usr/bin/env node
/**
 * Analiza gaps ≥5min entre piezas consecutivas de todos los turnos cacheados.
 * Output: /tmp/gaps.csv con (fecha, horario, dow, gap_start_local_HM, duration_min)
 *
 * Nota: los timestamps en los JSON vienen como ISO con sufijo Z pero SON hora
 * local de planta (el parser del Excel Marelec no convierte zona). Por eso se
 * usa getUTCHours/getUTCMinutes para leer la hora "tal cual" del string.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const cacheDir = path.join(__dirname, '.cache')
const outPath = path.join(os.tmpdir(), 'gaps.csv')
const files = fs.readdirSync(cacheDir).filter(f => /^shift-\d{4}-\d{2}-\d{2}__Turno_(d_a|noche)\.json$/.test(f))

const out = ['fecha,horario,dow,gap_start_local,duration_min']
let totalGaps = 0
let processedShifts = 0

for (const file of files) {
  const match = file.match(/shift-(\d{4}-\d{2}-\d{2})__Turno_(d_a|noche)\.json/)
  if (!match) continue
  const [, fecha, horarioRaw] = match
  const horario = horarioRaw === 'd_a' ? 'dia' : 'noche'
  const d0 = new Date(`${fecha}T12:00:00Z`)
  const dow = d0.getUTCDay() === 0 ? 7 : d0.getUTCDay() // 1=Lun..7=Dom

  let content, data
  try {
    content = fs.readFileSync(path.join(cacheDir, file), 'utf8')
    data = JSON.parse(content)
  } catch (e) {
    continue
  }
  const pp = data.pp || []
  if (pp.length < 2) continue

  const ts = pp.map(p => new Date(p.ts).getTime()).filter(n => !isNaN(n)).sort((a, b) => a - b)

  for (let i = 1; i < ts.length; i++) {
    const gapMin = (ts[i] - ts[i - 1]) / 60000
    if (gapMin < 5) continue
    const d = new Date(ts[i - 1])
    const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    out.push(`${fecha},${horario},${dow},${hm},${gapMin.toFixed(1)}`)
    totalGaps++
  }
  processedShifts++
  content = null
  data = null
}

fs.writeFileSync(outPath, out.join('\n'))
console.log(`Processed ${processedShifts} shifts, ${totalGaps} gaps ≥5min → ${outPath}`)
