#!/usr/bin/env node
/**
 * Exporta UN turno real de la bitácora (solo lectura) a un JSON local para que la
 * vitrina `/dev/bitacora-real` lo muestre con datos de verdad sin tocar producción.
 *
 *   node scripts/exportar-turno-real.cjs 2026-09-17_dia
 *   node scripts/exportar-turno-real.cjs            (el turno en curso)
 *
 * Escribe `apps/pwa/dev-data/turno-real.json` (ignorado por git y FUERA de `public/`:
 * son datos de la planta y no deben entrar al build). Vite lo sirve solo en dev.
 * Trae los eventos del turno, el doc del turno (observación y técnicos
 * presentes), los pendientes abiertos de turnos anteriores y los borradores.
 */
const fs = require('node:fs')
const path = require('node:path')
const admin = require('firebase-admin')

const PLANTA = 'chonchi'
const SALIDA = path.join(__dirname, '..', 'apps', 'pwa', 'dev-data', 'turno-real.json')

/** `YYYY-MM-DD_banda` del turno en curso (día 08–16, tarde 16–00, noche 00–08). */
function turnoEnCurso(ahora = new Date()) {
  const h = ahora.getHours()
  const banda = h >= 8 && h < 16 ? 'dia' : h >= 16 ? 'tarde' : 'noche'
  const fecha = new Date(ahora)
  // El turno noche arranca a las 00:00 del mismo día.
  const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
  return `${iso}_${banda}`
}

/** Timestamps de Firestore → milisegundos; el resto, tal cual. */
function plano(valor) {
  if (valor == null) return valor
  if (typeof valor.toMillis === 'function') return { _ms: valor.toMillis() }
  if (Array.isArray(valor)) return valor.map(plano)
  if (typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, plano(v)]))
  return valor
}

async function main() {
  const turnoId = process.argv[2] || turnoEnCurso()
  if (!/^\d{4}-\d{2}-\d{2}_(dia|tarde|noche)$/.test(turnoId)) {
    console.error(`Turno inválido: ${turnoId} (esperado 2026-09-17_dia)`)
    process.exit(1)
  }
  const cred = admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json')))
  admin.initializeApp({ credential: cred })
  const db = admin.firestore()
  const col = db.collection('bitacoraEventos')

  const [eventos, pendientes, borradores, turnoDoc] = await Promise.all([
    col.where('plantId', '==', PLANTA).where('turnoId', '==', turnoId).get(),
    col.where('plantId', '==', PLANTA).where('pendiente', '==', true).get(),
    col.where('plantId', '==', PLANTA).where('estado', '==', 'borrador').get(),
    db.collection('bitacoraTurnos').doc(`${PLANTA}_${turnoId}`).get(),
  ])
  const aLista = (snap) => snap.docs.map((d) => plano({ id: d.id, ...d.data() }))
  const salida = {
    exportadoEn: new Date().toISOString(),
    turnoId,
    eventos: aLista(eventos),
    pendientes: aLista(pendientes),
    borradores: aLista(borradores),
    turno: turnoDoc.exists ? plano(turnoDoc.data()) : null,
  }
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true })
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2))
  console.log(
    `${turnoId}: ${salida.eventos.length} eventos, ${salida.pendientes.length} pendientes abiertos, ${salida.borradores.length} borradores, ` +
      `observación ${salida.turno?.observacion ? 'sí' : 'no'}, presentes ${(salida.turno?.presentes ?? []).join(', ') || '—'}\n→ ${SALIDA}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
