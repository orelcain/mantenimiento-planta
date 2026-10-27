/**
 * correoTurno — el informe de turno como correo HTML.
 *
 * No calcula nada: todo sale de `construirDatosInforme` (informeTurno.js), el
 * mismo objeto que dibuja el PDF. Así el correo y el adjunto no pueden decir
 * cifras distintas.
 *
 * ── Forma (protocolo de /sin-tics-visual) ───────────────────────────────────
 * Una columna de 680 px, tablas e inline styles (Outlook no lee <style>).
 * Cuatro cuerpos: 21 / 14 / 11 / 10,5. Un solo nivel de rótulo. Tablas con
 * marco fino, banda gris en el encabezado, filetes horizontales y fila de
 * cierre; ningún filete vertical, ninguna caja de color, ningún border-left.
 * El color solo codifica un estado (el punto del dueño de la pérdida). Las
 * barras del cotejo son celdas, no imágenes: un gráfico como imagen llega
 * bloqueado en Outlook.
 *
 * ── Qué afirma ──────────────────────────────────────────────────────────────
 * Las reglas de informeTurno.js valen aquí: nada de «habríamos producido X
 * más», un turno malo se dice malo, lo que el dato no distingue se declara.
 */

const { duenoDe, nombreCorto } = require('./informeTurno')

function durTextoMin(m) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

// ── Tokens ───────────────────────────────────────────────────────────────────
const TINTA = '#1F1F1F'
const GRIS = '#5F6368'
const MARCO = '#E3E3E3'
const FILA = '#ECECEC'
const BANDA = '#F1F3F4'
const ROJO = '#B3261E'
const AMBAR = '#8A5A00'
const BARRA = '#C9CDD2'
const FUENTE = "'Segoe UI',Calibri,Arial,sans-serif"

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const EQUIPO = { chonchi: '3 Baader 142', yal: '3 Baader 142', filete: 'Baader 200' }

/** Color del punto de cada dueño: rojo = falla de equipo, ámbar = pendiente de imputar. */
const PUNTO = {
  mantencion: ROJO,
  externo: GRIS,
  planificado: GRIS,
  fueraDelArbol: AMBAR,
  sinCausal: AMBAR,
  micro: GRIS,
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '–')
const hhmm = (ms) => {
  if (ms == null) return '--:--'
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
const minDe = (sec) => Math.round((sec || 0) / 60)

/** «2026-10-21» → «Miércoles 21-10-2026». */
function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return `${DIAS[d.getUTCDay()]} ${m[3]}-${m[2]}-${m[1]}`
}

/** «Ev 1», «Ev 1 y Ev 3», «las 3 máquinas». */
function listaMaquinas(maquinas, total) {
  if (total > 1 && maquinas.length === total) return `las ${total} máquinas`
  const orden = [...maquinas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  if (orden.length <= 1) return orden[0] || ''
  return `${orden.slice(0, -1).join(', ')} y ${orden[orden.length - 1]}`
}

/**
 * «A, B y C». Si algún elemento ya trae su propia «y» («Ajuste en Ev 1 y Ev 2»)
 * la última se separa con coma —«…en Ev 1 y Ev 2, y Knuro en Ev 1»— para que
 * no se lea como una sola lista de máquinas.
 */
function listaY(xs) {
  if (xs.length <= 1) return xs[0] || ''
  const sep = xs.some((x) => / y /.test(x)) ? ', y ' : ' y '
  return `${xs.slice(0, -1).join(', ')}${sep}${xs[xs.length - 1]}`
}

const ORDINAL = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo']

/** Las fallas de Mantención agrupadas por causa, con sus máquinas. */
function fallasPorCausa(datos) {
  const grupos = new Map()
  for (const f of (datos.fallas && datos.fallas.filas) || []) {
    const g = grupos.get(f.etiqueta) || { etiqueta: f.etiqueta, min: 0, sec: 0, maquinas: [], volvio: [] }
    g.min += f.min
    g.sec += f.sec
    g.maquinas.push(f.maquinaCorta)
    g.volvio.push(f.volvioMin)
    grupos.set(f.etiqueta, g)
  }
  return [...grupos.values()].sort((a, b) => b.sec - a.sec)
}

/**
 * Los textos del correo. Todo lo que el correo afirma con palabras sale de
 * aquí; el resto son las cifras de `datos` puestas en tablas.
 */
function textosCorreo(datos) {
  const r = datos.resumen
  const c = datos.cotejo || { comparados: 0, veredicto: 'sin-comparables' }
  const nMaq = r.maquinas
  const unaSola = nMaq === 1
  const perdida = datos.porDueno.totalMin
  const mant = datos.porDueno.filas.find((f) => f.clave === 'mantencion')
  const mantMin = mant ? mant.min : 0
  const piezas = num(r.ciclos)
  const n = c.comparados

  // ── Frase 1: cómo quedó el turno ──────────────────────────────────────────
  let veredicto
  if (datos.enCurso) {
    veredicto = `Turno en curso: van ${piezas} piezas, con datos hasta las ${hhmm(r.finMs)}.`
  } else if (c.veredicto === 'mejor-del-periodo') {
    veredicto = `Mejor turno de los últimos ${n} equivalentes: ${piezas} piezas.`
  } else if (c.veredicto === 'sobre-la-mediana') {
    veredicto = `${piezas} piezas, sobre lo habitual de los últimos ${n} turnos equivalentes.`
  } else if (c.veredicto === 'en-lo-habitual') {
    veredicto = `${piezas} piezas, dentro de lo habitual de los últimos ${n} turnos equivalentes.`
  } else if (c.veredicto === 'bajo-la-mediana') {
    veredicto = `${piezas} piezas, bajo lo habitual de los últimos ${n} turnos equivalentes.`
  } else {
    veredicto = `${piezas} piezas. No hay turnos equivalentes suficientes para compararlo.`
  }

  // ── Frase 2: de quién fue la pérdida ──────────────────────────────────────
  const causas = fallasPorCausa(datos)
  let perdidaFrase
  if (perdida === 0) {
    perdidaFrase = 'La línea no perdió tiempo por detenciones.'
  } else if (mantMin === 0) {
    perdidaFrase = `La línea perdió ${perdida} min; ninguna detención quedó imputada a Mantención.`
  } else {
    const dondeCausa = causas.map((g) => (unaSola ? g.etiqueta : `${g.etiqueta} en ${listaMaquinas(g.maquinas, nMaq)}`))
    const nDet = datos.fallas.eventos
    const det = `${nDet} ${nDet === 1 ? 'detención' : 'detenciones'}`
    perdidaFrase = `La línea perdió ${perdida} min; Mantención responde por ${mantMin}, `
      + (causas.length === 1 ? `en ${det} de ${dondeCausa[0]}.` : `en ${det}: ${listaY(dondeCausa)}.`)
  }

  // ── Frase 3: contención de la falla más pesada ────────────────────────────
  let contencion = ''
  const peor = causas[0]
  if (peor && !datos.enCurso) {
    const vs = peor.volvio
    if (vs.some((v) => v == null)) {
      contencion = `Tras ${peor.etiqueta}, la línea no volvió a su ritmo en lo que quedaba del turno.`
    } else {
      const max = Math.max(...vs)
      contencion = max === 0
        ? `${peor.etiqueta} no alcanzó a sacar la línea de su ritmo.`
        : `Tras ${peor.etiqueta}, la línea volvió a su ritmo en ${max} min.`
    }
  }
  if (datos.enCurso) {
    contencion = 'Las cifras pueden cambiar antes del cierre y no se comparan con turnos completos.'
  }

  // ── Lo que queda abierto ──────────────────────────────────────────────────
  const abiertos = []
  for (const f of (datos.fallas && datos.fallas.filas) || []) {
    if (f.turnosSeguidos >= 2) {
      abiertos.push({
        rotulo: `${f.etiqueta}${unaSola ? '' : ` en ${f.maquinaCorta}`}:`,
        texto: `${ORDINAL[f.turnosSeguidos] || `${f.turnosSeguidos}.º`} turno equivalente seguido con la misma causa. Un patrón así rara vez es azar: revisar en terreno.`,
      })
    }
  }
  const ambiguas = [...new Set(((datos.fallas && datos.fallas.filas) || []).filter((f) => f.ambigua).map((f) => f.etiqueta))]
  if (ambiguas.length) {
    abiertos.push({
      rotulo: `${listaY(ambiguas)}:`,
      texto: 'la causal no separa eléctrica de mecánica. Anotarla con el sufijo (ELECTRICA) o (MECANICA).',
    })
  }
  const filaDe = (clave) => datos.porDueno.filas.find((f) => f.clave === clave)
  const sinCausal = filaDe('sinCausal')
  if (sinCausal && sinCausal.min > 0) {
    const maqs = maquinasDe(datos, 'sinCausal')
    abiertos.push({
      rotulo: 'Sin causal:',
      texto: `${sinCausal.min} min en ${sinCausal.eventos} ${sinCausal.eventos === 1 ? 'detención' : 'detenciones'}`
        + `${unaSola || !maqs.length ? '' : ` de ${listaY(maqs)}`}. Mientras no tengan causa en Shoplogix no se pueden atribuir a nadie.`,
    })
  }
  const fuera = filaDe('fueraDelArbol')
  if (fuera && fuera.min > 0) {
    abiertos.push({
      rotulo: 'Causal fuera del árbol:',
      texto: `${listaY(fuera.causas.map((x) => `«${x.etiqueta}»`))}, ${fuera.min} min. Alguien la anotó, `
        + 'pero el árbol de imputación no la reconoce: proponerla para la próxima versión.',
    })
  }
  const dif = (datos.textos.pendientes || []).find((p) => /aviso de cierre reporto/.test(p))
  if (dif) abiertos.push({ rotulo: 'Dos fuentes:', texto: dif })

  return {
    veredicto,
    detalle: [perdidaFrase, contencion].filter(Boolean).join(' '),
    abiertos,
  }
}

/** Máquinas (nombre corto) con detenciones de un dueño. */
function maquinasDe(datos, clave) {
  const set = new Set()
  for (const c of datos.resumen.causas.filter((x) => duenoDe(x) === clave)) {
    for (const pm of c.porMaquina || []) if (pm.eventos) set.add(nombreCorto(pm.maquina))
  }
  return [...set].sort()
}

// ── Piezas de HTML ───────────────────────────────────────────────────────────

const rotulo = (txt, arriba = 28) => `<div style="font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${GRIS};margin-top:${arriba}px;margin-bottom:8px">${esc(txt)}</div>`

const th = (txt, align = 'left') => `<td${align === 'right' ? ' align="right"' : ''} style="padding:8px 10px;font-size:11px;color:${GRIS};border-bottom:1px solid ${MARCO};background:${BANDA}">${esc(txt)}</td>`

const tabla = (filas) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${MARCO};border-collapse:collapse;font-size:14px;color:${TINTA}">${filas}</table>`

function cifras(lista) {
  const ancho = Math.floor(100 / lista.length)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px"><tr>${
    lista.map((x, i) => `<td width="${ancho}%" valign="top" style="padding:0 ${i === lista.length - 1 ? 0 : 8}px 0 ${i === 0 ? 0 : 8}px">`
      + `<div style="font-size:21px;font-weight:600;line-height:1.3;color:${TINTA}">${esc(x.valor)}</div>`
      + `<div style="font-size:11px;line-height:1.5;color:${GRIS}">${esc(x.sub)}</div></td>`).join('')
  }</tr></table>`
}

function seccionDueno(datos) {
  const pd = datos.porDueno
  const filas = pd.filas.map((f) => {
    let detalle
    if (f.clave === 'micro') {
      detalle = `${num(f.eventos)} paros cortos; el sistema no pide causal`
    } else if (!f.causas.length) {
      detalle = f.clave === 'mantencion' ? 'ninguna detención imputada' : ''
    } else {
      const top = f.causas.slice(0, 3).map((x) => `${x.etiqueta} ${minDe(x.sec)}`)
      detalle = top.join(', ') + (f.causas.length > 3 ? ` y ${f.causas.length - 3} más` : '')
    }
    return `<tr><td style="padding:10px;border-top:1px solid ${FILA}"><span style="color:${PUNTO[f.clave]}">●</span> ${esc(f.etiqueta)}`
      + `<div style="font-size:11px;color:${GRIS}">${esc(detalle)}</div></td>`
      + `<td align="right" valign="top" style="padding:10px;border-top:1px solid ${FILA}">${f.min}</td></tr>`
  }).join('')

  const pausas = (datos.resumen.pausas || [])
    .map((p) => ({ etiqueta: etiquetaPausa(p.causa), min: minDe(p.todasSec) }))
    .filter((p) => p.min > 0)
  const notaPausas = pausas.length
    ? `<div style="font-size:11px;line-height:1.5;color:${GRIS};margin-top:6px">Las pausas planificadas van aparte, no son pérdida: ${esc(listaY(pausas.map((p) => `${p.etiqueta} ${p.min} min`)))}.</div>`
    : ''

  return rotulo('De quién fue la pérdida')
    + tabla(`<tr>${th('Dueño')}${th('Min de línea', 'right')}</tr>${filas}`
      + `<tr><td style="padding:10px;border-top:1px solid ${TINTA};font-weight:600">Total</td>`
      + `<td align="right" style="padding:10px;border-top:1px solid ${TINTA};font-weight:600">${pd.totalMin}</td></tr>`)
    + notaPausas
}

/** «COLACION» → «Colación»; las pausas llegan en mayúsculas desde Shoplogix. */
function etiquetaPausa(raw) {
  const s = String(raw || '').trim()
  const conocidas = {
    COLACION: 'colación',
    'REUNION INICIO TURNO': 'reunión de inicio',
    'EJERCICIO COMPENSATORIO - PARO': 'ejercicio compensatorio',
  }
  return conocidas[s.toUpperCase()] || s.toLowerCase()
}

function seccionFallas(datos) {
  const filas = (datos.fallas && datos.fallas.filas) || []
  if (!filas.length) {
    return rotulo('Fallas de equipo')
      + `<div style="font-size:14px;line-height:1.5">Ninguna detención del turno quedó imputada a Mantención.</div>`
  }
  const unaSola = datos.resumen.maquinas === 1
  const cuerpo = filas.map((f) => {
    const notas = [`media ${f.mediaMin} min por detención`]
    if (f.turnosSeguidos >= 2) notas.push(`${ORDINAL[f.turnosSeguidos] || `${f.turnosSeguidos}.º`} turno seguido`)
    let volvio
    if (f.volvioMin == null) volvio = `<span style="font-size:11px;color:${ROJO}">no volvió en el turno</span>`
    else if (f.volvioMin === 0) volvio = `<span style="font-size:11px;color:${GRIS}">no la sacó de ritmo</span>`
    else volvio = `${f.volvioMin} min`
    const titulo = unaSola ? esc(f.etiqueta) : `<b>${esc(f.maquinaCorta)}</b> · ${esc(f.etiqueta)}`
    return `<tr><td style="padding:10px;border-top:1px solid ${FILA}">${titulo}<div style="font-size:11px;color:${GRIS}">${esc(notas.join(' · '))}</div></td>`
      + `<td align="right" valign="top" style="padding:10px;border-top:1px solid ${FILA}">${f.eventos}</td>`
      + `<td align="right" valign="top" style="padding:10px;border-top:1px solid ${FILA}">${f.min}</td>`
      + `<td align="right" valign="top" style="padding:10px;border-top:1px solid ${FILA}">${volvio}</td></tr>`
  }).join('')
  return rotulo('Fallas de equipo')
    + tabla(`<tr>${th(unaSola ? 'Causa' : 'Máquina · causa')}${th('Det.', 'right')}${th('Min línea', 'right')}${th('Volvió a ritmo', 'right')}</tr>${cuerpo}`
      + `<tr><td style="padding:10px;border-top:1px solid ${TINTA};font-weight:600">Total</td>`
      + `<td align="right" style="padding:10px;border-top:1px solid ${TINTA};font-weight:600">${datos.fallas.eventos}</td>`
      + `<td align="right" style="padding:10px;border-top:1px solid ${TINTA};font-weight:600">${datos.fallas.totalMin}</td>`
      + `<td style="padding:10px;border-top:1px solid ${TINTA}"></td></tr>`)
}

function seccionCotejo(datos) {
  const c = datos.cotejo
  if (!c || !c.filas || c.filas.length < 2 || datos.enCurso) return ''
  const max = Math.max(...c.filas.map((f) => f.ciclos || 0))
  const ddmm = (id) => (/^\d{4}-(\d{2})-(\d{2})/.exec(id) || []).slice(1).reverse().join('-')
  const filas = c.filas.map((f) => {
    const hoy = f.esReferencia
    const pct = max ? Math.max(1, Math.round(((f.ciclos || 0) / max) * 100)) : 0
    const tinta = hoy ? `color:${TINTA};font-weight:600` : `color:${GRIS}`
    const borde = hoy ? `border-top:1px solid ${TINTA};` : ''
    return `<tr><td width="54" style="padding:4px 0;${borde}${tinta}">${hoy ? 'Hoy' : ddmm(f.id)}</td>`
      + `<td style="padding:4px 0;${borde}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>`
      + `<td width="${pct}%" style="background:${hoy ? TINTA : BARRA};height:8px;font-size:0;line-height:0">&nbsp;</td>`
      + `<td style="padding-left:6px;font-size:11px;white-space:nowrap;${tinta}">${num(f.ciclos)}</td></tr></table></td>`
      + `<td width="70" align="right" style="padding:4px 0;${borde}${tinta}">${f.mantencionSec == null ? '–' : minDe(f.mantencionSec)}</td></tr>`
  }).join('')

  const previos = c.filas.filter((f) => !f.esReferencia && f.mantencionSec != null).map((f) => minDe(f.mantencionSec)).sort((a, b) => a - b)
  const medMant = previos.length ? previos[Math.floor(previos.length / 2)] : null
  const notas = []
  if (c.comparados >= 3 && c.medianaPrevios != null) {
    notas.push(c.margenHabitual != null
      ? `Mediana ${num(c.medianaPrevios)} piezas; lo habitual va de ${num(c.medianaPrevios - c.margenHabitual)} a ${num(c.medianaPrevios + c.margenHabitual)}.`
      : `Mediana ${num(c.medianaPrevios)} piezas.`)
  } else {
    notas.push('Con menos de 3 turnos equivalentes la comparación es solo referencia.')
  }
  if (medMant != null) notas.push(`Mantención: mediana ${medMant} min por turno; hoy ${datos.porDueno.filas.find((f) => f.clave === 'mantencion').min}.`)
  if (c.filas.some((f) => f.mantencionSec == null)) notas.push('– = turno sin resumen guardado.')

  return rotulo(`Contra los ${c.comparados} turnos equivalentes anteriores`)
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:11px;color:${GRIS}">`
    + `<tr><td width="54" style="padding:3px 0">Turno</td><td style="padding:3px 0">Piezas</td><td width="70" align="right" style="padding:3px 0">Min Mant.</td></tr>`
    + filas + '</table>'
    + `<div style="font-size:11px;line-height:1.5;color:${GRIS};margin-top:6px">${esc(notas.join(' '))}</div>`
}

function seccionAbierto(t) {
  if (!t.abiertos.length) return ''
  return rotulo('Queda abierto')
    + t.abiertos.map((a, i) => `<div style="font-size:14px;line-height:1.5;${i ? 'margin-top:6px' : ''}"><b>${esc(a.rotulo)}</b> ${esc(a.texto)}</div>`).join('')
}

/** Asunto del correo: se lee en la bandeja sin abrirlo. */
function asuntoCorreo(datos) {
  const m = datos.meta
  const r = datos.resumen
  const mant = datos.porDueno.filas.find((f) => f.clave === 'mantencion')
  const partes = [`${m.areaLabel} · ${m.turnoLabel} · ${m.fechaLabel}`, `${num(r.ciclos)} piezas`]
  partes.push(`Mantención ${mant ? mant.min : 0} de ${datos.porDueno.totalMin} min`)
  return (datos.enCurso ? '[En curso] ' : '') + partes.join(' · ')
}

/**
 * El cuerpo HTML del correo.
 * @param {object} datos  salida de `construirDatosInforme`
 */
function correoTurnoHtml(datos) {
  const m = datos.meta
  const r = datos.resumen
  const c = datos.cotejo || {}
  const t = textosCorreo(datos)
  const unaSola = r.maquinas === 1
  const mant = datos.porDueno.filas.find((f) => f.clave === 'mantencion')
  const mantMin = mant ? mant.min : 0
  const perdida = datos.porDueno.totalMin

  const lista = [
    {
      valor: num(r.ciclos),
      sub: datos.enCurso ? 'piezas hasta ahora' : (c.comparados >= 3 && c.medianaPrevios != null ? `piezas · mediana ${num(c.medianaPrevios)}` : 'piezas'),
    },
    { valor: durTextoMin(perdida), sub: 'pérdida de línea' },
    { valor: durTextoMin(mantMin), sub: perdida ? `de Mantención · ${Math.round((mantMin / perdida) * 100)} %` : 'de Mantención' },
    unaSola
      ? { valor: String(datos.fallas.eventos), sub: datos.fallas.eventos === 1 ? 'detención de Mantención' : 'detenciones de Mantención' }
      : { valor: durTextoMin(minDe(r.detencion.todasSec)), sub: `con las ${r.maquinas} detenidas a la vez` },
  ]

  const cabecera = `<div style="font-size:10.5px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${GRIS}">Informe de turno · Mantención</div>`
    + `<div style="font-size:21px;font-weight:600;line-height:1.3;margin-top:6px">${esc(m.areaLabel)} · ${esc(m.turnoLabel)}</div>`
    + `<div style="font-size:11px;line-height:1.5;color:${GRIS};margin-top:2px">${esc(fechaLarga(m.fechaLabel))} · ${hhmm(r.inicioMs)} a ${hhmm(r.finMs)} · ${esc(EQUIPO[m.planta] || `${r.maquinas} máquinas`)}</div>`

  const veredicto = `<div style="font-size:14px;line-height:1.5;margin-top:18px;border-top:2px solid ${TINTA};padding-top:12px">`
    + `<b>${esc(t.veredicto)}</b> ${esc(t.detalle)}</div>`

  const pie = `<div style="font-size:11px;line-height:1.5;color:${GRIS};border-top:1px solid ${MARCO};margin-top:28px;padding:10px 0 22px">`
    + (unaSola
      ? 'Datos de Shoplogix. La línea es una sola máquina: cada minuto detenido es un minuto de línea. '
      : `Datos de Shoplogix. Min de línea = tiempo detenido de cada máquina dividido por las ${r.maquinas} máquinas, así no se cuenta dos veces. `)
    + 'Los tiempos son hora de planta. El detalle va en el PDF adjunto.</div>'

  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${esc(asuntoCorreo(datos))}</title></head>`
    + `<body style="margin:0;padding:0;background:#FFFFFF">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#FFFFFF;font-family:${FUENTE};color:${TINTA}">`
    + '<tr><td style="padding:24px 20px 0 20px">'
    + cabecera + veredicto + cifras(lista)
    + seccionDueno(datos) + seccionFallas(datos) + seccionCotejo(datos) + seccionAbierto(t) + pie
    + '</td></tr></table></body></html>'
}

module.exports = {
  correoTurnoHtml, textosCorreo, asuntoCorreo, fechaLarga, listaMaquinas, listaY, etiquetaPausa, EQUIPO, ORDINAL,
}
