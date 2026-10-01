#!/usr/bin/env node
/**
 * cuadrar-sap-29-09 — cuadra el export de stock SAP (REPUESTOS CHONCHI 29-09.xlsx, centro AI04,
 * almacén M001, enviado por el planificador el 29-09-2026) con el maestro `repuestos` y `bodega`.
 *
 *  - Fichas con ese SAP: stock = SAP, nombre = SAP (el anterior queda en `alias` si no lo tenía),
 *    completa codigoFabricante / valorUnitario / unidad si estaban vacíos.
 *  - SAP sin ficha pero cuyo código de fabricante YA existe en el despiece (doc sin SAP): se enlaza
 *    el SAP a esa ficha (misma lógica que «asignar SAP» en la app).
 *  - SAP sin ficha ni despiece: se crea ficha nueva (id = SAP, sin equipo).
 *  - bodega/{sap}: stockActual = SAP + movimiento tipo 'ajuste' con motivo trazable.
 *
 *   node scripts/cuadrar-sap-29-09.js <archivo.tsv>            ← DRY-RUN (no escribe)
 *   node scripts/cuadrar-sap-29-09.js <archivo.tsv> --write    ← aplica (tomar snapshot ANTES)
 *
 * El .tsv es el volcado del Excel: líneas "=== Sheet: X ===" y filas separadas por tabulador con
 * las columnas Centro | Material | Descripción | Libre utilización | UM | Almacén | Tipo | Valor | Moneda.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) })
const db = admin.firestore()
const FieldValue = admin.firestore.FieldValue
const WRITE = process.argv.includes('--write')
const SRC = process.argv[2]
const FUENTE = 'SAP 29-09-26 (export Jose Llaipen, REPUESTOS CHONCHI 29-09.xlsx)'
const OUT = path.join(__dirname, '..', '_snapshots', 'cuadrar-sap-29-09__plan.json')

// El volcado del adjunto perdió las vocales acentuadas mayúsculas (quedó «Ã» + U+FFFD).
// Son 10 palabras; se reparan por diccionario para que el nombre SAP quede correcto.
const TILDES = [['GUÃ�A', 'GUÍA'], ['MAGNÃ�TICA', 'MAGNÉTICA'], ['VÃ�LV', 'VÁLV'], ['VÃ�AS', 'VÍAS'], ['TRACCIÃ�N', 'TRACCIÓN'],
  ['MANÃ�METRO', 'MANÓMETRO'], ['ESFÃ�RICO', 'ESFÉRICO'], ['CONDUCCIÃ�N', 'CONDUCCIÓN'], ['Ã�NGULO', 'ÁNGULO'], ['PIÃ�ON', 'PIÑON'], ['RÃ�TULA', 'RÓTULA']]
function repararTildes(s) { for (const [a, b] of TILDES) s = s.split(a).join(b); return s }

// ── 1. leer export ──
const rows = []
let sheet = null
for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
  const m = line.match(/^=== Sheet: (.+) ===/)
  if (m) { sheet = m[1].trim(); continue }
  const c = line.replace(/\r$/, '').split('\t')
  if (!sheet || c[0] !== 'AI04') continue
  const nombre = repararTildes(c[2]).replace(/[Â ]/g, ' ').replace(/\s+/g, ' ').trim()
  rows.push({ sheet, sap: c[1].trim(), nombre, stock: Number(c[3]) || 0, um: (c[4] || '').trim(), alm: c[5], tipoSap: (c[6] || '').trim(), valor: Number(c[7]) || 0 })
}
const bySap = new Map()
for (const r of rows) {
  const cur = bySap.get(r.sap)
  if (cur) { cur.stock += r.stock; cur.valor += r.valor } else bySap.set(r.sap, { ...r })
}

// ── 2. código de fabricante desde el nombre SAP ──
function extraerFab(nombre) {
  const pn = nombre.match(/P\/N\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/.]*)/i)
  if (pn) return pn[1].replace(/[,.]$/, '')
  const toks = nombre.split(' ').filter(Boolean)
  for (let i = toks.length - 1; i >= 0; i--) {
    let t = toks[i].replace(/[,;.]$/, '')
    const tras = t.split('.').pop() // «ARTIC.94000007» → 94000007
    if (tras !== t && (tras.match(/\d/g) || []).length >= 4) t = tras
    const digits = (t.match(/\d/g) || []).length
    if (/MM$|^M\d+X|^\d+\/\d+$|^\d+X\d+|^\d+V$|^\d+W$|^\d+RPM$|^\d+HZ$|^\d+KG\.?$/i.test(t)) continue
    if (digits >= 4) return t
    // modelos alfanuméricos (SEW DRN90L4/FF, KA67B, VDT04, SM207): letras + ≥2 dígitos, ≥5 caracteres
    if (t.length >= 5 && /^[A-Z]{1,4}\d{2,}[A-Z0-9\/\-]*$/i.test(t) && !/^(INOX|AISI)/i.test(t)) return t
  }
  return ''
}
/** El nombre viejo pasa a `alias` solo si no nombra OTRO código (los nombres «pegados» a otra pieza no se conservan). */
function aliasDesde(nombreViejo, fab) {
  if (/\(.*(nota|manual|cuaderno|incompleto|cortado).*\)/i.test(nombreViejo)) return '' // anotaciones nuestras, no apodos
  const codigos = (nombreViejo.match(/[A-Z]*\d{4,}[A-Z0-9]*/gi) || []).map(normFab)
  if (codigos.some(c => c !== normFab(fab))) return '' // nombra OTRA pieza (rodamiento 6207, código ajeno…)
  const limpio = nombreViejo.replace(/[A-Z]*\d{4,}[A-Z0-9]*/gi, '').replace(/\s+/g, ' ').trim()
  return limpio.length >= 3 ? limpio : ''
}
const mismoNombre = (a, b) => String(a).toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÑ]/g, '') === String(b).toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÑ]/g, '')
const uniq = arr => Array.from(new Set((arr || []).filter(Boolean)))
const CLASE = { ZREP: 'repuesto', ZHER: 'herramienta', ZIND: 'insumo', ZEMP: 'insumo' }
const FAMILIA = { ZREP: 'REPUESTOS', ZHER: 'HERRAMIENTAS', ZIND: 'INSUMOS', ZEMP: 'INSUMOS' }
const normFab = s => String(s || '').toUpperCase().replace(/[\s\-\.\/]/g, '')
const isSapCode = s => /^\d{6,}$/.test(String(s || '').trim())
const isPlaceholder = s => !s || /^\(SIN DESCRIPCI/i.test(s)

;(async () => {
  const [repSnap, bodSnap] = await Promise.all([db.collection('repuestos').get(), db.collection('bodega').get()])
  const porSap = new Map()
  const porFab = new Map()
  repSnap.forEach(d => {
    const x = d.data()
    const s = String(x.codigoSAP || '').trim()
    if (isSapCode(s)) porSap.set(s, { id: d.id, ...x })
    const f = normFab(x.codigoFabricante)
    if (f) { if (!porFab.has(f)) porFab.set(f, []); porFab.get(f).push({ id: d.id, ...x }) }
  })
  const bodega = new Map()
  bodSnap.forEach(d => bodega.set(String(d.data().codigoSAP || d.id).trim(), { id: d.id, ...d.data() }))

  const plan = { fichas: [], enlaces: [], nuevas: [], ambiguas: [], conflictos: [], stock: [], fabCorregidos: [], fabRevisar: [] }
  const n = { renombra: 0, fabCompletado: 0, valorCompletado: 0, unidadCompletada: 0, sinCambioFicha: 0, stockIgual: 0, stockCeroSinDoc: 0 }
  for (const [sap, r] of bySap) {
    const fab = extraerFab(r.nombre)
    const valorUnit = r.stock > 0 && r.valor > 0 ? Math.round((r.valor / r.stock) * 100) / 100 : 0
    let ficha = porSap.get(sap)
    let docId = ficha?.id
    let accion = null
    if (!ficha) {
      const cands = fab ? (porFab.get(normFab(fab)) || []) : []
      const libres = cands.filter(c => !isSapCode(c.codigoSAP))
      const ocupadas = cands.filter(c => isSapCode(c.codigoSAP))
      if (libres.length === 1) { ficha = libres[0]; docId = ficha.id; accion = 'enlazar' }
      else if (libres.length > 1) {
        // misma pieza en el despiece de dos modelos (baader-142-X y baader-200-X): un SAP = una ficha →
        // se enlaza a la que tiene más equipos y hereda los equipos/áreas de las otras.
        libres.sort((a, b) => (b.equipos || []).length - (a.equipos || []).length)
        ficha = libres[0]; docId = ficha.id; accion = 'enlazar'
        ficha._fusion = { equipos: uniq(libres.flatMap(c => c.equipos || [])), equiposCodigos: uniq(libres.flatMap(c => c.equiposCodigos || [])), areaIds: uniq(libres.flatMap(c => c.areaIds || [])) }
        plan.ambiguas.push({ sap, fab, nombre: r.nombre, elegido: docId, candidatos: libres.map(c => `${c.id} · ${c.textoBreve} · ${(c.equipos || []).length} eq`) })
      }
      else if (ocupadas.length) { plan.conflictos.push({ sap, fab, nombre: r.nombre, yaConSap: ocupadas.map(c => `${c.id} sap=${c.codigoSAP} · ${c.textoBreve}`) }); accion = 'crear' }
      else accion = 'crear'
      if (accion === 'crear') docId = sap
    }
    // ── ficha ──
    if (accion === 'crear') {
      plan.nuevas.push({ sap, sheet: r.sheet, nombre: r.nombre, fab, stock: r.stock, valorUnit, um: r.um, tipoSap: r.tipoSap })
    } else {
      const upd = {}
      const antes = String(ficha.textoBreve || '').trim()
      if (!mismoNombre(antes, r.nombre)) {
        upd.textoBreve = r.nombre
        n.renombra++
        if (!isPlaceholder(antes) && !String(ficha.alias || '').trim()) {
          const alias = aliasDesde(antes, ficha.codigoFabricante || fab)
          if (alias) upd.alias = alias
        }
      }
      if (ficha._fusion) Object.assign(upd, ficha._fusion)
      const fabApp = String(ficha.codigoFabricante || '').trim()
      if (!fabApp && fab) { upd.codigoFabricante = fab; n.fabCompletado++ }
      else if (fab && fabApp && normFab(fab) !== normFab(fabApp) && accion !== 'enlazar' && /^\d{5,}$/.test(fab) && /^\d{5,}$/.test(fabApp)) {
        // solo se corrige cuando ambos son códigos numéricos claros; un modelo alfanumérico adivinado nunca pisa uno existente.
        // el nombre SAP nombra otro código: la ficha tenía el SAP pegado a otra pieza.
        if (docId === sap) { upd.codigoFabricante = fab; n.fabCorregido = (n.fabCorregido || 0) + 1; plan.fabCorregidos.push({ sap, antes: fabApp, despues: fab, nombreAntes: antes, nombreSap: r.nombre }) }
        else plan.fabRevisar.push({ sap, docId, fabApp, fabSap: fab, nombreAntes: antes, nombreSap: r.nombre })
      }
      if (!(Number(ficha.valorUnitario) > 0) && valorUnit > 0) { upd.valorUnitario = valorUnit; n.valorCompletado++ }
      if (!String(ficha.unidad || '').trim() && r.um) { upd.unidad = r.um; n.unidadCompletada++ }
      if (accion === 'enlazar') { upd.codigoSAP = sap; upd.tieneSap = true; plan.enlaces.push({ sap, docId, fab, nombreAntes: antes, nombreSap: r.nombre, stock: r.stock }) }
      if (ficha.nombreProvisional === true && upd.textoBreve !== undefined) upd.nombreProvisional = false
      if (Object.keys(upd).length) plan.fichas.push({ docId, sap, accion: accion || 'actualizar', antes: { textoBreve: antes, codigoFabricante: ficha.codigoFabricante || '', valorUnitario: ficha.valorUnitario || 0, unidad: ficha.unidad || '' }, upd })
      else n.sinCambioFicha++
    }
    // ── bodega ──
    const b = bodega.get(sap)
    if (!b && r.stock === 0) { n.stockCeroSinDoc++; continue }
    const antes = b ? (Number(b.stockActual) || 0) : null
    if (b && antes === r.stock) {
      n.stockIgual++
      if (!mismoNombre(b.textoBreve || '', r.nombre)) plan.stock.push({ sap, bid: b.id, antes, despues: r.stock, soloNombre: true, nombre: r.nombre })
      continue
    }
    plan.stock.push({ sap, bid: b ? b.id : sap, crear: !b, antes, despues: r.stock, nombre: r.nombre, um: r.um })
  }
  // ── colisiones: dos SAP del export apuntan a la MISMA ficha de despiece (SAP duplicado en SAP, «FAB. X» vs «X»).
  // Se queda con la ficha el SAP igual al id del doc, si no el de más stock; los demás pasan a ficha nueva.
  const porDoc = new Map()
  for (const e of plan.enlaces) { if (!porDoc.has(e.docId)) porDoc.set(e.docId, []); porDoc.get(e.docId).push(e) }
  for (const [docId, lista] of porDoc) {
    if (lista.length < 2) continue
    lista.sort((a, b) => (b.sap === docId) - (a.sap === docId) || b.stock - a.stock)
    for (const e of lista.slice(1)) {
      const i = plan.fichas.findIndex(f => f.docId === docId && f.sap === e.sap)
      if (i >= 0) plan.fichas.splice(i, 1)
      const r = bySap.get(e.sap)
      plan.nuevas.push({ sap: e.sap, sheet: r.sheet, nombre: r.nombre, fab: e.fab, stock: r.stock, valorUnit: r.stock > 0 && r.valor > 0 ? Math.round((r.valor / r.stock) * 100) / 100 : 0, um: r.um, tipoSap: r.tipoSap })
      plan.conflictos.push({ sap: e.sap, fab: e.fab, nombre: r.nombre, yaConSap: [`${docId} se queda con ${lista[0].sap}`] })
    }
    porDoc.set(docId, [lista[0]])
  }
  plan.enlaces = [...porDoc.values()].flat()
  // nunca crear una ficha nueva sobre un id que ya existe
  const idsExistentes = new Set(repSnap.docs.map(d => d.id))
  plan.nuevas = plan.nuevas.filter(x => { if (idsExistentes.has(x.sap)) { plan.conflictos.push({ sap: x.sap, fab: x.fab, nombre: x.nombre, yaConSap: [`ya existe un doc con id ${x.sap} (no se crea)`] }); return false } return true })
  const resumen = {
    sapUnicos: bySap.size,
    fichasActualizadas: plan.fichas.filter(f => f.accion === 'actualizar').length,
    enlaces: plan.enlaces.length,
    nuevas: plan.nuevas.length,
    nuevasConStock: plan.nuevas.filter(x => x.stock > 0).length,
    nuevasSinFab: plan.nuevas.filter(x => !x.fab).length,
    ambiguas: plan.ambiguas.length,
    conflictos: plan.conflictos.length,
    stockCambia: plan.stock.filter(s => !s.soloNombre).length,
    bodegaCrear: plan.stock.filter(s => s.crear).length,
    bodegaSoloNombre: plan.stock.filter(s => s.soloNombre).length,
    ...n,
  }
  console.log('=== CUADRAR SAP 29-09 ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===')
  console.log(JSON.stringify(resumen, null, 1))
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({ resumen, plan }, null, 1))
  console.log('plan →', OUT)
  console.log('\n-- muestra fab extraído (nuevas) --')
  plan.nuevas.slice(0, 12).forEach(x => console.log(`${x.sap} fab=${x.fab || '∅'}  ${x.nombre}`))
  console.log('\n-- nuevas SIN fab --')
  plan.nuevas.filter(x => !x.fab).slice(0, 15).forEach(x => console.log(`${x.sap} ${x.sheet}  ${x.nombre}`))
  console.log('\n-- enlaces (muestra) --')
  plan.enlaces.slice(0, 10).forEach(x => console.log(`${x.sap} → ${x.docId} [${x.fab}] «${x.nombreAntes}» → «${x.nombreSap}»`))
  console.log('\n-- ambiguas --')
  plan.ambiguas.slice(0, 10).forEach(x => console.log(x.sap, x.fab, x.nombre, '::', x.candidatos.join(' | ')))
  console.log('\n-- código de fabricante corregido por el nombre SAP --')
  plan.fabCorregidos.slice(0, 12).forEach(x => console.log(`${x.sap} ${x.antes} → ${x.despues}  «${x.nombreAntes}» → «${x.nombreSap}»`))
  console.log('\n-- código de fabricante a REVISAR (ficha de despiece con id de otro código) --')
  plan.fabRevisar.slice(0, 12).forEach(x => console.log(`${x.sap} ${x.docId} fabApp=${x.fabApp} fabSap=${x.fabSap}  «${x.nombreAntes}» → «${x.nombreSap}»`))
  console.log('\n-- conflictos (fab ya con otro SAP) --')
  plan.conflictos.slice(0, 10).forEach(x => console.log(x.sap, x.fab, x.nombre, '::', x.yaConSap.join(' | ')))
  if (!WRITE) { console.log('\nDRY-RUN: no se escribió nada.'); process.exit(0) }

  // ── escribir ──
  const now = FieldValue.serverTimestamp()
  let ops = 0
  let batch = db.batch()
  const flush = async () => { await batch.commit(); batch = db.batch(); ops = 0 }
  const add = async (fn) => { fn(batch); if (++ops >= 400) await flush() }
  for (const f of plan.fichas) {
    await add(b => b.update(db.collection('repuestos').doc(f.docId), { ...f.upd, updatedAt: now }))
    for (const campo of ['textoBreve', 'codigoFabricante']) {
      if (f.upd[campo] === undefined || !f.antes[campo]) continue
      await add(b => b.set(db.collection('repuestos').doc(f.docId).collection('historial').doc(), {
        campo, valorAnterior: f.antes[campo], valorNuevo: f.upd[campo], fecha: now, usuario: 'script', usuarioNombre: FUENTE,
      }))
    }
  }
  for (const x of plan.nuevas) {
    await add(b => b.set(db.collection('repuestos').doc(x.sap), {
      codigoSAP: x.sap, tieneSap: true, textoBreve: x.nombre, descripcion: '', codigoFabricante: x.fab || '', valorUnitario: x.valorUnit, unidad: x.um || 'UN',
      cantidadPorMaquina: 0, ubicacionEnPlanta: '', vinculosManual: [], imagenesManual: [], fotosReales: [], equipos: [], equiposCodigos: [], areaIds: [],
      clase: CLASE[x.tipoSap] || 'repuesto', familia: FAMILIA[x.tipoSap] || 'REPUESTOS', subFamilia: x.sheet, parentRepuestoId: null, nombreProvisional: false,
      origen: { de: ['sap-export'], archivo: 'REPUESTOS CHONCHI 29-09.xlsx', hoja: x.sheet, fecha: '2026-09-29' }, createdAt: now, updatedAt: now,
    }))
  }
  for (const s of plan.stock) {
    const ref = db.collection('bodega').doc(s.bid)
    if (s.soloNombre) { await add(b => b.update(ref, { textoBreve: s.nombre, updatedAt: now })); continue }
    const unidadBodega = s.um === 'M' ? 'm' : s.um === 'KG' ? 'kg' : 'pzas'
    if (s.crear) await add(b => b.set(ref, { codigoSAP: s.sap, stockActual: s.despues, stockMinimo: 0, ubicacionBodega: '', unidad: unidadBodega, textoBreve: s.nombre, fuenteStock: FUENTE, createdAt: now, updatedAt: now }))
    else await add(b => b.update(ref, { stockActual: s.despues, textoBreve: s.nombre, fuenteStock: FUENTE, updatedAt: now }))
    await add(b => b.set(ref.collection('movimientos').doc(), {
      bodegaItemId: s.bid, tipo: 'ajuste', cantidad: s.despues, stockResultante: s.despues,
      motivo: `Stock SAP 29-09-26 (export planificador): app ${s.antes === null ? 'sin ficha' : s.antes} → SAP ${s.despues}`,
      realizadoPor: 'script:cuadrar-sap-29-09', realizadoPorNombre: 'Import SAP 29-09-26', createdAt: now,
    }))
  }
  if (ops) await flush()
  console.log('\n✅ escrito. Verifica con: node scripts/normalizacion/99-stats-maestro.js')
})()
