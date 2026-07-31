#!/usr/bin/env node
/**
 * fix-b200-medios-auditoria — corrige los 9 hallazgos MEDIOS de la auditoría de contenido
 * del 2026-07-30 en la Baader 200.
 *
 * POR QUÉ ES UN SCRIPT Y NO UNA EDICIÓN DE CÓDIGO: la Baader 200 NO lee su contenido del
 * repo. Lo lee de la colección Firestore `baader200-sections` (23 docs); el
 * `baader200Learning.ts` con sus ALL_DEFAULT_SECTIONS es SOLO UN FALLBACK. Corregir el .ts
 * no cambia lo que ve el técnico en pantalla.
 *
 * CRITERIO DE LA CORRECCIÓN (decidido con Orel el 2026-07-30): la mayoría de estos hallazgos
 * NO son cifras mal copiadas, sino un CHOQUE DE FUENTES. La ficha se curó desde
 * "Introducción Baader 200.pdf" —el manual práctico que se usa en planta, que da un solo valor
 * sin distinguir especie— y el auditor la contrastó contra el "509_Nuevo manual de ajuste
 * Baader 200 V4" del fabricante, que da tablas POR ESPECIE.
 *
 * La decisión NO fue elegir una fuente y borrar la otra: es MOSTRAR LAS DOS. El valor de planta
 * se conserva como `value` (es el que se usa hoy) y la cota del OEM entra como `note` de esa
 * misma medida, con su página. Así el técnico ve el número con el que trabaja y, al lado, lo
 * que dice el fabricante para su especie.
 *
 * Todas las cotas del V4 de acá abajo se leyeron directamente del PDF, no se tomaron del
 * informe de auditoría.
 *
 * Uso:
 *   node scripts/fix-b200-medios-auditoria.js            → dry-run, muestra el diff
 *   node scripts/fix-b200-medios-auditoria.js --confirm  → escribe
 *
 * ⚠ Antes de correr con --confirm:
 *   node scripts/firestore-snapshot.js --dump baader200-sections
 */

'use strict'
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

const CONFIRM = process.argv.includes('--confirm')
const COL = 'baader200-sections'

function db() {
  if (!admin.apps.length) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json')
    if (!fs.existsSync(keyPath)) {
      console.error('No se encontró serviceAccountKey.json en la raíz del repo.')
      process.exit(1)
    }
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  }
  return admin.firestore()
}

const FUENTE_PLANTA = 'Introducción Baader 200 (manual práctico de planta)'
const FUENTE_OEM = 'Nuevo manual de ajuste Baader 200 V4 (fabricante)'

/**
 * Cada entrada dice qué medida tocar y qué nota de doble fuente ponerle.
 * `matchName` busca la medida por su `name` dentro del doc.
 */
const CAMBIOS = {
  // ── 1 · Abertura de cuchillos rascadores: 17-18 (planta) vs "g" por especie (OEM)
  'cuchillos-rascadores-altura': {
    measurements: [
      {
        matchName: 'Abertura cuchillos rascadores',
        note:
          `Valor de planta (${FUENTE_PLANTA}, pág 17): 17-18 mm, sin distinguir especie. ` +
          `Según el ${FUENTE_OEM}, pág 37, esta cota es la medida "g" entre los filos de las ` +
          `cuchillas rascadoras y DEPENDE DE LA ESPECIE: 14 mm salmón, salmón japonés, perca y ` +
          `trucha asalmonada · 18 mm yellowtail, máquina combinada yellowtail/perca y salmón de ` +
          `Noruega · 22 mm bacalao japonés. Para salmón, el OEM pide 14 mm.`,
      },
      {
        matchName: 'Altura de trabajo vs base del diente',
        note:
          `⚠ SENTIDO INVERTIDO ENTRE FUENTES. Planta (${FUENTE_PLANTA}, pág 16): "3 mm SOBRE la ` +
          `base del diente". El ${FUENTE_OEM} da las dos cotas de altura del rascador SIEMPRE ` +
          `POR DEBAJO de su referencia: el filo cortante a 1,5 mm aproximadamente POR DEBAJO del ` +
          `contradiente de la silleta (pág 34, con la biela de mando pos. 5 preajustada a 145 mm), ` +
          `y la punta de la cuchilla a 3 mm POR DEBAJO de la guía de silletas (pág 39, tornillo de ` +
          `tope pos. 11). Antes de ajustar, definir contra qué referencia se está midiendo.`,
      },
    ],
    notes: [
      'Las dos fuentes de esta sección no coinciden: el valor de planta viene del manual práctico y el del fabricante del manual de ajuste V4. Ninguna se borró; verificar cuál rige antes de tocar la máquina.',
    ],
  },

  // ── 2 y 3 · Cuchillos punzones
  'cuchillos-punzones': {
    measurements: [
      {
        matchName: 'Distancia punta diente vs cuchilla (altura trabajo)',
        note:
          `Valor de planta (${FUENTE_PLANTA}, pág 13): 3-4 mm. El ${FUENTE_OEM}, pág 28, da otra ` +
          `cosa y la desglosa: al pasar una silleta por las cuchillas de punta, la distancia al ` +
          `talón de la silleta o al flanco del PRIMER diente es de 1-1,5 mm, y a los OTROS dientes ` +
          `de 0,5-1 mm. La misma página fija además la distancia entre ambas cuchillas de punta en ` +
          `8 mm. No es una diferencia cosmética: punzones altos producen gay ping y bajos cortan la ` +
          `espina del flanco.`,
      },
      {
        matchName: 'Topes de seguridad',
        note:
          `Valor de planta (${FUENTE_PLANTA}, pág 13): 0,5 mm. El ${FUENTE_OEM}, pág 27, pide ` +
          `ajustar los tornillos de tope superiores (dib. 38, pos. 5) a una distancia de 0,3 mm ` +
          `al tope (pos. 6).`,
      },
    ],
  },

  // ── 4 · Guías flotantes
  'guias-flotantes': {
    measurements: [
      {
        matchName: 'Abertura máxima guías flotantes',
        note:
          `Valor de planta (${FUENTE_PLANTA}, pág 8): 4,8 mm como máximo, sin distinguir especie. ` +
          `En el ${FUENTE_OEM}, pág 23, la cota "e" DEPENDE DE LA ESPECIE: 6,5 mm salmón, trucha ` +
          `asalmonada y salmón japonés · 4,8 mm trucha · 8 mm abadejo de Alaska, bacalao del ` +
          `pacífico, colín, añón, bacalao japonés, perca y yellowtail. Ojo: el 4,8 mm que usa la ` +
          `ficha coincide con la columna TRUCHA, no con salmón. La misma página del V4 exige ` +
          `además una distancia exacta de 0,5-1,0 mm entre la parte delantera de las chapas guía ` +
          `y las cuchillas dorsales.`,
      },
    ],
    notes: [
      'Verificar la equivalencia de nomenclatura contra los dibujos 31-32 del V4 antes de cambiar el número: lo que en planta se llama "guías flotantes" el fabricante lo llama "chapas guía".',
    ],
  },

  // ── 5 · Cuchillos ventrales: acá el número coincide, lo que estaba mal era la palabra
  'cuchillos-ventrales': {
    renameMeasurement: {
      from: 'Avance cuchillos ventrales "a"',
      to: 'Abertura entre cuchillos ventrales "a"',
    },
    measurements: [
      {
        matchName: 'Abertura entre cuchillos ventrales "a"',
        altMatch: 'Avance cuchillos ventrales "a"',
        note:
          `La medida "a" NO es un avance: es la distancia ENTRE ambos cuchillos ventrales, que se ` +
          `ajusta con los bujes apretadores (dib. 11, pos. 8 y 9). El "avance" viene de una errata ` +
          `del manual de planta, que dice "5 m/m de aventura" por "abertura". El valor de 5 mm SÍ ` +
          `coincide con el ${FUENTE_OEM} (págs 9-10) para salmón, trucha asalmonada, salmón ` +
          `japonés, bacalao japonés, perca y yellowtail; para trucha son 4 mm y para abadejo de ` +
          `Alaska, bacalao del pacífico, colín y añón, 7 mm.`,
      },
    ],
    stepReplace: [
      {
        from: 'Ajustar la medida "a" de 5mm de avance de los cuchillos ventrales.',
        to: 'Ajustar la medida "a" de 5mm de ABERTURA ENTRE los cuchillos ventrales, con los bujes apretadores pos 8-9 (5 mm salmón · 4 mm trucha · 7 mm pescado blanco).',
      },
    ],
  },

  // ── 6 · Mando de cuchillos dorsales: los dos números están bien pero mal atribuidos
  'mando-cuchillos-dorsales': {
    measurements: [
      {
        matchName: 'Levante de cuchillos dorsales al paso silleta',
        note:
          `⚠ MAL ATRIBUIDO. Los 20 mm no son una carrera de levante: en el ${FUENTE_OEM}, pág 19, ` +
          `son una distancia de CONTROL entre las cuchillas ventrales y las dorsales, y valen bajo ` +
          `dos condiciones que hay que reproducir — con el rodillo en el punto más alto de la leva ` +
          `y el trinquete en la 4ª entalla del fiador. Medidos fuera de esas condiciones no ` +
          `significan nada.`,
      },
      {
        matchName: 'Distancia pernos pos 11 a la entalla',
        note:
          `⚠ MAL ATRIBUIDO. En el ${FUENTE_OEM}, pág 17, los 12 mm son la distancia entre el ` +
          `TRINQUETE (dib. 23, pos. 12) y el FIADOR (pos. 13), que se ajusta tras soltar los ` +
          `tornillos pos. 11 — no es una distancia "de los pernos a la entalla". El ajuste se hace ` +
          `además con la silleta desplazada a 940 mm y el trinquete levantado a la 4ª entalla desde ` +
          `la izquierda (pág 18), condiciones que la ficha no traía.`,
      },
    ],
    notes: [
      'Condiciones de ajuste según el V4 (págs 18-19): silleta a 940 mm y trinquete levantado a la 4ª entalla del fiador, contando desde la izquierda.',
    ],
  },

  // ── 7 · 1ra alimentación: el rango "32-28" no existe en ninguna fuente
  'primera-alimentacion': {
    measurements: [
      {
        matchName: 'Distancia referencia catálogo',
        newValue: '32',
        note:
          `⚠ El rango "32-28 mm" NO existe en ninguna fuente: son DOS cotas distintas y en dos ` +
          `puntos distintos de la máquina. Según el ${FUENTE_OEM}: 32 mm entre las chapaletas ` +
          `alimentadoras derecha e izquierda A LA ENTRADA, con el tornillo de tope pos. 3 (pág 2), ` +
          `y 26 mm entre las chapaletas EN LA ZONA DE SALIDA, corregibles con la biela de mando ` +
          `pos. 5, con el rodillo en el punto más alto de la leva (pág 6). Ningún manual menciona ` +
          `28 mm.`,
      },
    ],
    notes: [
      'Entrada 32 mm (tornillo de tope pos. 3) · Salida 26 mm (biela de mando pos. 5, con el rodillo en el punto más alto de la leva). Controlar la simetría respecto del centro de la máquina.',
    ],
  },

  // ── 9 · Trim D / E: los pasos publicados no salían de ninguna fuente
  'ts-trim-d-e': {
    replaceSteps: [
      {
        text:
          'Las páginas 28 y 29 del manual de planta son LÁMINAS: traen el despiece y las cotas, pero ninguna línea de texto que describa el procedimiento. Los pasos que figuraban antes acá ("ajuste normal para condición estándar" y "ajuste rápido según la materia prima del momento") no salían de ninguna fuente y se retiraron.',
      },
      {
        text:
          'Cotas que SÍ muestra la lámina de Trim D (pág 28), leídas del dibujo: una configuración con 1 mm y 5 mm, y otra con 0-2,5 mm y 0-1 mm. La lámina no rotula cuál corresponde al ajuste normal y cuál al rápido.',
      },
      {
        text:
          'Cotas que muestra la lámina de Trim E (pág 29): una configuración con 1 mm y 2 mm, y otra con 2 mm y 5 mm. Mismo caso: sin rótulo de cuál es cuál.',
      },
      {
        important: true,
        text:
          'Antes de ajustar Trim D o E, mirar la lámina del manual: acá no hay procedimiento escrito que seguir. El "ajuste rápido" que sí está documentado en el V4 (págs 41-42) es otra cosa — es la palanca del ajuste rápido de la contrabancada de corte, con su medida de 70 mm y tuerca de seguridad M10.',
      },
    ],
    notes: [
      'Sección sin procedimiento documentado: las cotas de arriba se transcribieron leyendo las láminas, no un texto. Si alguien tiene el criterio de planta para Trim D/E, vale registrarlo acá marcado como tal.',
    ],
  },

  // ── menor 10 · Silleta 1350 mm
  'cuchillos-rascadores-ajuste': {
    measurements: [
      {
        matchName: 'Posición silleta para ajuste',
        note:
          `Criterio de planta (${FUENTE_PLANTA}, pág 15): silleta a 1350 mm aprox. Ninguna otra ` +
          `fuente lo respalda y no encaja con la escala de posiciones de silleta del fabricante ` +
          `(el V4 usa 895, 900, 940, 50, 30 y 10 mm). Para los rascadores el ${FUENTE_OEM}, pág 33, ` +
          `no da una cota sino un CRITERIO: desplazar las silletas hasta que una quede con los ` +
          `dientes de transporte entre las puntas de las cuchillas rascadoras, con el rodillo pos. 4 ` +
          `en el punto más alto de la vía de leva. El absoluto "SOLO se puede realizar en esa ` +
          `posición" no está en ningún manual.`,
      },
    ],
  },

  // ── menor 11 · Sensores de seguridad de pasillo
  'sistema-seguridad': {
    stepReplace: [
      { from: '5. Sensor de seguridad pasillo (zona 5).', to: '5. Sensor de seguridad de pasillo (uno de los cuatro; el manual no asigna zona por número).' },
      { from: '6. Sensor de seguridad pasillo (zona 6).', to: '6. Sensor de seguridad de pasillo.' },
      { from: '7. Sensor de seguridad pasillo (zona 7).', to: '7. Sensor de seguridad de pasillo.' },
      { from: '8. Sensor de seguridad pasillo (zona 8).', to: '8. Sensor de seguridad de pasillo.' },
    ],
    notes: [
      'El manual de planta (pág 34) lista los cuatro sensores como un grupo y en el orden "5-7-8-6", sin asignar a cada número una zona ni un pasillo identificado. La etiqueta "zona N" que figuraba antes acá era una inferencia. Para levantar la asignación real de cada número, cruzar contra los planos eléctricos de la máquina.',
    ],
  },
}

function aplicar(doc, plan) {
  const out = JSON.parse(JSON.stringify(doc))
  const cambios = []

  if (plan.renameMeasurement && Array.isArray(out.measurements)) {
    for (const m of out.measurements) {
      if (m.name === plan.renameMeasurement.from) {
        m.name = plan.renameMeasurement.to
        cambios.push(`  measurement renombrada: "${plan.renameMeasurement.from}" → "${plan.renameMeasurement.to}"`)
      }
    }
  }

  for (const spec of plan.measurements || []) {
    const m = (out.measurements || []).find(x => x.name === spec.matchName || x.name === spec.altMatch)
    if (!m) {
      cambios.push(`  ⚠ NO ENCONTRADA la medida "${spec.matchName}" — se omite`)
      continue
    }
    if (spec.newValue && m.value !== spec.newValue) {
      cambios.push(`  value "${m.value}" → "${spec.newValue}" en "${m.name}"`)
      m.value = spec.newValue
    }
    m.note = m.note ? `${m.note} · ${spec.note}` : spec.note
    cambios.push(`  note agregada a "${m.name}" (${spec.note.length} chars)`)
  }

  for (const rep of plan.stepReplace || []) {
    for (const s of out.steps || []) {
      if (s.text === rep.from) {
        s.text = rep.to
        cambios.push(`  step reemplazado: "${rep.from.slice(0, 45)}…"`)
      }
    }
  }

  if (plan.replaceSteps) {
    cambios.push(`  steps reemplazados por completo: ${(out.steps || []).length} → ${plan.replaceSteps.length}`)
    out.steps = plan.replaceSteps
  }

  for (const n of plan.notes || []) {
    out.notes = out.notes || []
    if (!out.notes.includes(n)) {
      out.notes.push(n)
      cambios.push(`  nota agregada (${n.length} chars)`)
    }
  }

  return { out, cambios }
}

async function main() {
  const firestore = db()
  console.log(CONFIRM ? '=== ESCRIBIENDO ===' : '=== DRY-RUN (agregá --confirm para escribir) ===\n')
  let tocados = 0

  for (const [id, plan] of Object.entries(CAMBIOS)) {
    const ref = firestore.collection(COL).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      console.log(`✗ ${id}: NO EXISTE en ${COL} — se omite`)
      continue
    }
    const { out, cambios } = aplicar(snap.data(), plan)
    console.log(`\n▸ ${id}`)
    cambios.forEach(c => console.log(c))
    if (CONFIRM) {
      await ref.set({ ...out, updatedBy: 'auditoria-medios-2026-07-30', updatedAt: Date.now() }, { merge: false })
      tocados++
    }
  }

  console.log(
    CONFIRM
      ? `\n✓ ${tocados} documentos actualizados en ${COL}.`
      : `\n(dry-run: no se escribió nada)`
  )
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
