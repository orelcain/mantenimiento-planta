#!/usr/bin/env node
/**
 * Encuentra (y opcionalmente borra) incidencias que no dicen nada, y normaliza
 * los títulos con espacios de más.
 *
 * POR QUÉ
 * -------
 * De las 13 incidencias que hay, una tiene por título `"\n´\n"` y por
 * descripción `"}"`. Se creó el 05-02-2026 y sigue **en proceso**: aparece en
 * la lista entre las 3 "En Proceso", ARIA la cuenta entre las abiertas del día
 * ("Incidencia sin título (´)") y suma a los pendientes.
 *
 * Otros tres títulos terminan en espacio ("Baader sucia ", "Sensor tolva ",
 * "probar bomba recirculado "), que es lo que hace que dos incidencias iguales
 * no se vean iguales.
 *
 * El código ya no deja crear otra sin texto (`createIncident` valida). Esto es
 * para lo que quedó escrito.
 *
 * ⚠️ BORRA DATOS con --write. Por defecto solo lista.
 *
 * USO
 *   node scripts/limpiar-incidencias-sin-texto.js              # solo mira
 *   node scripts/limpiar-incidencias-sin-texto.js --write      # normaliza títulos
 *   node scripts/limpiar-incidencias-sin-texto.js --write --borrar-vacias
 */
const admin = require('firebase-admin')
const path = require('path')

const ESCRIBIR = process.argv.includes('--write')
const BORRAR = process.argv.includes('--borrar-vacias')

const normalizar = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '')
const diceAlgo = (t) => {
  const l = normalizar(t)
  return l.length > 0 && /[\p{L}\p{N}]/u.test(l)
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))),
  })
  const db = admin.firestore()
  const snap = await db.collection('incidents').get()

  const vacias = []
  const aNormalizar = []
  const porTitulo = new Map()

  for (const doc of snap.docs) {
    const x = doc.data()
    const titulo = normalizar(x.titulo)

    if (!diceAlgo(x.titulo)) {
      vacias.push({ ref: doc.ref, id: doc.id, titulo: JSON.stringify(x.titulo), desc: JSON.stringify(x.descripcion), estado: x.status })
      continue
    }
    if (titulo !== x.titulo || normalizar(x.descripcion) !== x.descripcion) {
      aNormalizar.push({ ref: doc.ref, id: doc.id, antes: JSON.stringify(x.titulo), despues: JSON.stringify(titulo) })
    }
    const mismo = porTitulo.get(titulo.toLowerCase()) || []
    mismo.push({ id: doc.id, estado: x.status })
    porTitulo.set(titulo.toLowerCase(), mismo)
  }

  console.log(`incidencias: ${snap.size}\n`)

  console.log(`SIN TEXTO (${vacias.length}):`)
  vacias.forEach((v) => console.log(`  ${v.id} · título ${v.titulo} · descripción ${v.desc} · estado: ${v.estado}`))

  console.log(`\nTÍTULOS A NORMALIZAR (${aNormalizar.length}):`)
  aNormalizar.forEach((v) => console.log(`  ${v.id} · ${v.antes} -> ${v.despues}`))

  const duplicados = [...porTitulo.entries()].filter(([, v]) => v.length > 1)
  console.log(`\nTÍTULOS REPETIDOS (${duplicados.length}) — decisión tuya, el script no los toca:`)
  duplicados.forEach(([t, v]) => console.log(`  "${t}" ×${v.length}: ${v.map((x) => x.id + ' (' + x.estado + ')').join(', ')}`))

  if (!ESCRIBIR) {
    console.log('\nSolo lectura: nada se escribió. Usar --write (y --borrar-vacias si corresponde).')
    process.exit(0)
  }

  for (const v of aNormalizar) {
    const x = (await v.ref.get()).data()
    await v.ref.update({ titulo: normalizar(x.titulo), descripcion: normalizar(x.descripcion) })
  }
  console.log(`\ntítulos normalizados: ${aNormalizar.length}`)

  if (BORRAR) {
    for (const v of vacias) await v.ref.delete()
    console.log(`incidencias sin texto borradas: ${vacias.length}`)
  } else {
    console.log('las incidencias sin texto NO se borraron (falta --borrar-vacias)')
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
