#!/usr/bin/env node
/**
 * favoritos-equipo-grader — agrega a un usuario la lista «Sensores» de favoritos POR EQUIPO
 * en el equipo Grader del hub de Repuestos.
 *
 *   Equipo: nodo de jerarquía `uLtr5iGJPmaDgiODrdJv` («CONJ BALANZA ESTATICA "STATIC GRADER"»,
 *           linkedMachineId = grader). Es el id que el hub usa al seleccionar el equipo y el que
 *           traen los repuestos en `equipos` (machineId). Se valida antes de escribir.
 *   Lista:  «Sensores» = SAP 3300103452, 3300133489, 3300133488 (rowKey = SAP).
 *   Dónde:  user_preferences/{uid}.repuestoFavLists[<nodo>]  (solo esa clave; no toca las demás).
 *
 * Idempotente: si la lista ya existe, solo suma los SAP que falten; si no falta nada, no escribe.
 * No borra nada.
 *
 *   node scripts/favoritos-equipo-grader.js            ← DRY-RUN (default: solo muestra)
 *   node scripts/favoritos-equipo-grader.js --write    ← aplica
 *   Opciones: --uid <id> (default sIXdQHw0q8aCxJk90WSeryszQoO2) · --key <serviceAccountKey.json>
 */
'use strict'
const path = require('path')
const admin = require('firebase-admin')

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d }
const WRITE = process.argv.includes('--write')
const UID = arg('--uid', 'sIXdQHw0q8aCxJk90WSeryszQoO2')
const KEY = arg('--key', path.join(__dirname, '..', 'serviceAccountKey.json'))
const NODO = 'uLtr5iGJPmaDgiODrdJv'
const LISTA = 'Sensores'
const SAPS = ['3300103452', '3300133489', '3300133488']

admin.initializeApp({ credential: admin.credential.cert(require(KEY)) })
const db = admin.firestore()

;(async () => {
  console.log(WRITE ? '== ESCRITURA ==' : '== DRY-RUN (no escribe; usa --write para aplicar) ==')

  const nodo = await db.collection('hierarchy').doc(NODO).get()
  if (!nodo.exists) throw new Error(`El nodo ${NODO} no existe en hierarchy`)
  console.log(`Equipo: ${NODO} · «${nodo.data().nombre}» · linkedMachineId=${nodo.data().linkedMachineId}`)

  for (const sap of SAPS) {
    const q = await db.collection('repuestos').where('codigoSAP', '==', sap).get()
    if (q.empty) throw new Error(`SAP ${sap} no existe en repuestos`)
    const enEquipo = q.docs.some((d) => (d.data().equipos || []).some((e) => e === NODO || e?.machineId === NODO))
    console.log(`  SAP ${sap}: ${q.docs[0].data().textoBreve} · ${enEquipo ? 'está en este equipo' : 'ATENCIÓN: no figura en este equipo'}`)
  }

  const ref = db.collection('user_preferences').doc(UID)
  const snap = await ref.get()
  if (!snap.exists) throw new Error(`user_preferences/${UID} no existe`)
  const todas = snap.data().repuestoFavLists || {}
  const actuales = Array.isArray(todas[NODO]) ? todas[NODO] : []
  console.log(`Listas actuales del equipo: ${actuales.length ? actuales.map((l) => `${l.name}(${l.repuestoIds.length})`).join(', ') : '(ninguna)'}`)

  const idx = actuales.findIndex((l) => l.name === LISTA)
  const previa = idx > -1 ? actuales[idx].repuestoIds : []
  const faltan = SAPS.filter((s) => !previa.includes(s))
  if (faltan.length === 0) { console.log(`Nada que hacer: «${LISTA}» ya tiene los ${SAPS.length} SAP.`); return }

  const nuevas = actuales.map((l) => ({ name: l.name, repuestoIds: [...l.repuestoIds] }))
  if (idx > -1) nuevas[idx].repuestoIds.push(...faltan)
  else nuevas.push({ name: LISTA, repuestoIds: [...SAPS] })
  console.log(`Resultado para repuestoFavLists.${NODO}:`)
  console.log(JSON.stringify(nuevas, null, 2))

  if (!WRITE) { console.log('DRY-RUN: no se escribió nada.'); return }
  // Merge profundo: solo cambia la clave de este equipo.
  await ref.set({ repuestoFavLists: { [NODO]: nuevas }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
  const despues = (await ref.get()).data().repuestoFavLists[NODO].find((l) => l.name === LISTA)
  console.log(`Escrito. «${LISTA}» ahora: ${despues.repuestoIds.join(', ')}`)
})().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
