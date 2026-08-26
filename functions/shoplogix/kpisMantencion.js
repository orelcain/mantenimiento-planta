/**
 * kpisMantencion.js — los KPIs que demuestran el trabajo de Mantención,
 * calculados desde la data cruda de Shoplogix (states + producción a 1 minuto).
 *
 * Nace del prototipo F1 (26-08-2026, Eviscerado P. Principal): ese día la Ev1
 * concentró el 100% de las fallas técnicas (KNURO 88 min) con MTBF de 19 min,
 * mientras Ev2/Ev3 cerraron con disponibilidad técnica 100%. Ese contraste —
 * quién falló, cuánto costó, qué tan rápido respondió Mantención— es lo que
 * este módulo existe para medir.
 *
 * Todo es PURO (sin Firestore ni fetch): quien llama trae los states y los
 * buckets de 1 minuto. Así se testea con `node --test` como el resto.
 *
 * ⚠ Convención de tiempos: todos los timestamps llegan como wall-clock de
 * planta sellado como UTC (la del resto del módulo Shoplogix). Acá solo se
 * restan entre sí, así que no se convierte nada.
 */

'use strict'

// ── Clasificación de causas ──────────────────────────────────────────────────
//
// Cuatro familias + producción. Aproximación por patrones sobre el reason
// (los operadores escriben a mano y varía la grafía): el árbol de imputación
// completo (46 hojas) vive en la PWA; cuando este módulo lo necesite más fino,
// el árbol se extrae a un JSON compartido — no duplicarlo acá a mano.
//
//  - planificado: pactado con Personas (colación, reunión, ejercicio…). No es
//    pérdida de nadie: exigir recuperarlo es pedir un imposible.
//  - excedido:    lo pactado que se pasó de su tiempo (Detencion Excedido).
//    Recuperable y de operación — NO infla el MTTR de Mantención.
//  - externo:     proceso/abastecimiento (MMPP, acumulación de rechazo…).
//  - micro:       microdetenciones sin causal — se cuentan APARTE: 139 en un
//    turno real; metidas al MTTR lo pulverizan sin decir nada de fallas.
//  - falla:       downtime con causal técnica (KNURO, LOGICA, mecánica…).
//    ESTE es el grupo que alimenta MTTR/MTBF/disponibilidad técnica.
//  - sin-imputar: downtime sin causal. Se reporta, no se reparte.

const RE_PLANIFICADO = /COLACI|DETENCION PROGRAMADA|REUNION|EJERCICIO|CHARLA|ASEO|LIMPIEZA|SANITIZ|PLANNED\s*DOWNTIME|CAMBIO DE TURNO/
const RE_EXTERNO = /MMPP|MATERIA PRIMA|FALTA PERSONAL|ACUMULACION|RECHAZO|ABASTEC|ESPERA/

function normaliza(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

/** 'produccion' | 'planificado' | 'excedido' | 'externo' | 'micro' | 'falla' | 'sin-imputar' */
function clasificaCausa(state) {
  if (state.type === 'uptime') return 'produccion'
  const name = String(state.name || '')
  const reason = String(state.reason || '')
  const r = normaliza(reason || name)
  if (/EXCEDID/i.test(name)) return 'excedido'
  if (/MICRO/i.test(name) && !reason) return 'micro'
  if (RE_PLANIFICADO.test(r)) return 'planificado'
  if (RE_EXTERNO.test(r)) return 'externo'
  if (!reason) return 'sin-imputar'
  return 'falla'
}

// ── Saneo de states ──────────────────────────────────────────────────────────

/**
 * Dedupe + recorte a la ventana. Las DOS trampas ya pagadas (F1, 26-08):
 *
 *  1. El bucket `Unscheduled` REPITE states del turno (igual que los
 *     intervals): sin dedupe el uptime salía DOBLE (585 min en una ventana de
 *     465) y la misma falla KNURO de 40 min aparecía dos veces.
 *  2. Un state que sigue corriendo (la DETENCION PROGRAMADA del cierre) trae
 *     su duración completa: sin recorte metía 220 min de "planificado" a un
 *     turno que solo vio 0,8 de ellos.
 *
 * @param {Array} states — con startAt/endAt como Date (o parseable)
 * @param {{start: Date, end: Date}} ventana
 * @returns {Array} states saneados, con `durationSec` = solape con la ventana
 */
function sanearStates(states, ventana) {
  const t0 = ventana.start.getTime()
  const t1 = ventana.end.getTime()
  const vistos = new Set()
  const out = []
  for (const s of states || []) {
    const a = new Date(s.startAt).getTime()
    const b = new Date(s.endAt).getTime()
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a >= t1 || b <= t0) continue
    const key = `${a}|${s.type}|${s.name || ''}|${s.reason || ''}`
    if (vistos.has(key)) continue
    vistos.add(key)
    const durationSec = (Math.min(b, t1) - Math.max(a, t0)) / 1000
    if (durationSec <= 0) continue
    out.push({ ...s, durationSec })
  }
  return out.sort((x, y) => new Date(x.startAt) - new Date(y.startAt))
}

// ── Fallas encadenadas (la "crisis") ─────────────────────────────────────────

/**
 * Fallas a menos de `gapMs` entre sí son UN evento. Medido el 26-08: KNURO
 * registró 5,5 + 11 + 40 min entre 08:51 y 09:59 con arranques fallidos entre
 * medio — tres filas en Shoplogix, UNA crisis en la línea. Contarlas separadas
 * regala un MTTR de 6 min que en la práctica fue un evento de 68.
 *
 * El umbral es 12 min porque el hueco real de esa crisis fue 11 min 15 s: la
 * máquina arrancó a media marcha (1-4 pz/min) y volvió a caer por lo mismo.
 */
function encadenarFallas(fallas, gapMs = 12 * 60_000) {
  const orden = [...fallas].sort((a, b) => new Date(a.desde) - new Date(b.desde))
  const eventos = []
  for (const f of orden) {
    const ult = eventos[eventos.length - 1]
    if (ult && new Date(f.desde).getTime() - new Date(ult.hasta).getTime() <= gapMs) {
      ult.hasta = new Date(Math.max(new Date(ult.hasta), new Date(f.hasta))).toISOString()
      ult.sec += f.sec
      if (!ult.causas.includes(f.causa)) ult.causas.push(f.causa)
      ult.paros++
    } else {
      eventos.push({ desde: new Date(f.desde).toISOString(), hasta: new Date(f.hasta).toISOString(), sec: f.sec, causas: [f.causa], paros: 1 })
    }
  }
  return eventos
}

// ── KPIs por máquina (desde states) ──────────────────────────────────────────

function kpisDeMaquina(statesSaneados) {
  const grupos = {}
  const fallas = []
  let uptimeSec = 0
  for (const st of statesSaneados) {
    const cl = clasificaCausa(st)
    if (cl === 'produccion') { uptimeSec += st.durationSec; continue }
    const g = grupos[cl] || (grupos[cl] = { n: 0, sec: 0, causas: {} })
    g.n++
    g.sec += st.durationSec
    const causa = st.reason || st.name || '(sin causa)'
    g.causas[causa] = (g.causas[causa] || 0) + st.durationSec
    if (cl === 'falla') {
      fallas.push({ desde: st.startAt, hasta: st.endAt, sec: st.durationSec, causa })
    }
  }
  const eventos = encadenarFallas(fallas)
  const fallaSec = grupos.falla ? grupos.falla.sec : 0
  const nEventos = eventos.length
  return {
    uptimeMin: uptimeSec / 60,
    grupos,
    fallas,
    /** La unidad del MTTR/MTBF es el EVENTO encadenado, no la fila de Shoplogix. */
    eventosFalla: eventos,
    mttrMin: nEventos ? (fallaSec / 60) / nEventos : null,
    mtbfMin: nEventos ? (uptimeSec / 60) / nEventos : null,
    dispTecnicaPct: (uptimeSec + fallaSec) > 0 ? (uptimeSec / (uptimeSec + fallaSec)) * 100 : null,
  }
}

// ── KPIs desde la producción a 1 minuto ──────────────────────────────────────

/**
 * @param {Array<{c: number, e: number}>} buckets — ciclos y esperado por minuto.
 *
 * `e === 0` es cómo Shoplogix marca el tiempo SIN expectativa (colación,
 * planificado): un minuto en cero con e=0 no es una caída — es la llave de la
 * "caída no planificada" sin adivinar horarios.
 */
function velocidadDesde1min(buckets) {
  const andando = (buckets || []).filter((b) => b.c > 0 && b.e > 0)
  const n = andando.length
  if (n === 0) return { minAndando: 0, pctLleno: null, pctMedio: null, pctBajo: null, pzPerdidasVelocidad: 0, medianaAndando: null }
  const orden = andando.map((b) => b.c).sort((a, b) => a - b)
  return {
    minAndando: n,
    pctLleno: (andando.filter((b) => b.c >= 0.9 * b.e).length / n) * 100,
    pctMedio: (andando.filter((b) => b.c >= 0.5 * b.e && b.c < 0.9 * b.e).length / n) * 100,
    pctBajo: (andando.filter((b) => b.c < 0.5 * b.e).length / n) * 100,
    pzPerdidasVelocidad: Math.round(andando.reduce((a, b) => a + Math.max(0, b.e - b.c), 0)),
    medianaAndando: orden[Math.floor(n / 2)],
  }
}

/**
 * Minutos con TODAS las máquinas en cero. `noPlanificada` exige que al menos
 * una tuviera esperado > 0 — con e=0 en todas, la planta simplemente no estaba
 * operando (colación, fin de turno) y contarlo sería el mismo error que hundió
 * el % produciendo con el Planned Downtime.
 *
 * @param {Array<Array<{c:number,e:number}>>} series — una por máquina, mismos índices.
 */
function caidaDeLinea(series) {
  if (!series?.length || !series[0]?.length) return { minCaidaTotal: 0, minCaidaNoPlanificada: 0 }
  const n = series[0].length
  let total = 0, noPlan = 0
  for (let i = 0; i < n; i++) {
    if (!series.every((s) => (s[i]?.c ?? 0) === 0)) continue
    total++
    if (series.some((s) => (s[i]?.e ?? 0) > 0)) noPlan++
  }
  return { minCaidaTotal: total, minCaidaNoPlanificada: noPlan }
}

/**
 * Reenganche: minutos desde el fin de cada EVENTO de falla hasta que la
 * máquina vuelve a su ritmo demostrado.
 *
 * ⚠ El umbral es el 90% de la MEDIANA ANDANDO de la propia máquina, no del
 * esperado teórico: el 26-08 la Ev1 (esperado 19) jamás pasó de 15 y contra el
 * teórico el reenganche daba "nunca" en las cuatro fallas.
 *
 * @param {Array<{ms:number,c:number,e:number}>} buckets — con timestamp en ms.
 * @param {Array<{hasta: string|Date}>} eventosFalla — fines de evento.
 */
function reenganches(buckets, eventosFalla, medianaAndando) {
  if (!medianaAndando) return []
  const umbral = 0.9 * medianaAndando
  return (eventosFalla || []).map((ev) => {
    const finMs = new Date(ev.hasta).getTime()
    const despues = (buckets || []).filter((b) => b.ms >= finMs && b.e > 0)
    const idx = despues.findIndex((b) => b.c >= umbral)
    return { hasta: new Date(ev.hasta).toISOString(), min: idx < 0 ? null : idx }
  })
}

module.exports = {
  clasificaCausa,
  sanearStates,
  encadenarFallas,
  kpisDeMaquina,
  velocidadDesde1min,
  caidaDeLinea,
  reenganches,
}
