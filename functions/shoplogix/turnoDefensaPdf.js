/**
 * turnoDefensaPdf — arma el PDF del informe post-turno.
 *
 * Seis láminas, en orden de defensa y no de dato:
 *   1. Veredicto           — la frase y cuatro cifras. Si solo se mira una, es esta.
 *   2. La falla medida bien— suma vs línea, y el reparto del solapamiento.
 *   3. Cronología          — dónde ocurrió, por máquina.
 *   4. Ritmo y contención  — cuánto cayó y cuánto demoró en volver.
 *   5. Cotejo              — contra los turnos equivalentes anteriores.
 *   6. Cierre              — qué se dice en la reunión y qué queda comprometido.
 *
 * ── Rendering ───────────────────────────────────────────────────────────────
 * Los gráficos se dibujan con primitivas de jsPDF (rectángulos y líneas), no
 * con imágenes de un servicio externo. Son barras y franjas de tiempo: no
 * necesitan una librería, y así el informe no depende de que un tercero
 * responda a las 5 de la mañana.
 *
 * ── Tildes ──────────────────────────────────────────────────────────────────
 * Los PDF que ya existen en la PWA escriben en ASCII con un `noAccents()`,
 * apoyados en que "jsPDF helvetica no renderiza tildes". Verificado el
 * 2026-08-18: el PDF declara `WinAnsiEncoding` y escribe `ó` como un solo byte
 * 0xF3, o sea las tildes salen bien. Este informe va en español correcto.
 *
 * Lo que sí hay que cuidar es lo que NO está en WinAnsi: flechas (→), ≥, ×,
 * guiones largos raros. `wa()` los traduce y descarta cualquier cosa fuera del
 * rango, para que un carácter suelto no ensucie una lámina entera.
 *
 * ── Escalas de tiempo ───────────────────────────────────────────────────────
 * Todos los instantes vienen en wall-clock-as-UTC y se formatean con getters
 * UTC: así sale la hora del reloj de planta. Convertir sería el bug.
 */

// ── Formato ──────────────────────────────────────────────────────────────────

/** Reemplaza lo que no existe en WinAnsi y descarta el resto. */
function wa(s) {
  return String(s == null ? '' : s)
    .replace(/[→]/g, '->')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[×]/g, 'x')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    // eslint-disable-next-line no-control-regex
    .replace(/[^ -ÿ]/g, '')
}

function hhmm(ms) {
  if (ms == null) return '--:--'
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function dur(sec) {
  if (sec == null) return '--'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** Duración en palabras, para los textos corridos. */
function durTexto(sec) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

const num = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '--')

// ── Paleta ───────────────────────────────────────────────────────────────────
// Misma familia que el mockup: azul petróleo de acento, semánticos aparte.
const C = {
  tinta: [12, 20, 24],
  tinta2: [65, 83, 92],
  tinta3: [123, 140, 149],
  linea: [213, 221, 225],
  fondo: [247, 249, 250],
  acento: [11, 85, 99],
  ok: [6, 118, 71],
  crit: [180, 35, 24],
  atencion: [181, 71, 8],
}

// ── Primitivas de lámina ─────────────────────────────────────────────────────

const W = 297 // A4 apaisado
const H = 210
const M = 16 // margen

function crearLamina(doc, { indice, total, titulo, subtitulo, pestania }) {
  if (indice > 1) doc.addPage()
  doc.setFillColor(...C.acento)
  doc.rect(0, 0, W, 7, 'F')
  doc.setFontSize(7.5).setTextColor(255, 255, 255).setFont('helvetica', 'bold')
  doc.text(wa(pestania.toUpperCase()), M, 4.8)
  doc.text(wa(`${indice} / ${total}`), W - M, 4.8, { align: 'right' })

  doc.setTextColor(...C.tinta).setFontSize(19).setFont('helvetica', 'bold')
  doc.text(wa(titulo), M, 20)
  if (subtitulo) {
    doc.setFontSize(9.5).setFont('helvetica', 'normal').setTextColor(...C.tinta3)
    doc.text(wa(subtitulo), M, 26.5)
  }
  doc.setDrawColor(...C.linea).setLineWidth(0.3)
  doc.line(M, 30, W - M, 30)
  return 38 // y de arranque del cuerpo
}

/** Caja de cifra grande. */
function kpi(doc, x, y, ancho, { rotulo, valor, sub, color = C.tinta }) {
  doc.setDrawColor(...C.linea).setLineWidth(0.3).rect(x, y, ancho, 24)
  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
  doc.text(wa(rotulo.toUpperCase()), x + 4, y + 6)
  doc.setFontSize(17).setFont('helvetica', 'bold').setTextColor(...color)
  doc.text(wa(valor), x + 4, y + 15)
  if (sub) {
    doc.setFontSize(7.5).setFont('helvetica', 'normal').setTextColor(...C.tinta2)
    doc.text(wa(sub), x + 4, y + 20.5)
  }
}

/** Bloque de texto con fondo, para las notas y el veredicto. */
function nota(doc, x, y, ancho, texto, { color = C.linea, tamano = 8.5, titulo } = {}) {
  const lineas = doc.setFontSize(tamano).setFont('helvetica', 'normal').splitTextToSize(wa(texto), ancho - 10)
  const alto = lineas.length * (tamano * 0.42) + (titulo ? 6 : 0) + 7
  doc.setFillColor(...C.fondo).rect(x, y, ancho, alto, 'F')
  doc.setFillColor(...color).rect(x, y, 1.2, alto, 'F')
  let ty = y + 5.5
  if (titulo) {
    doc.setFontSize(tamano).setFont('helvetica', 'bold').setTextColor(...C.tinta)
    doc.text(wa(titulo), x + 5, ty)
    ty += 5
  }
  doc.setFontSize(tamano).setFont('helvetica', 'normal').setTextColor(...C.tinta2)
  doc.text(lineas, x + 5, ty)
  return y + alto + 5
}

/** Tabla simple. `cols` = [{ t, ancho, alinear }]. */
function tabla(doc, x, y, cols, filas, { resaltar = -1 } = {}) {
  const alto = 7
  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
  let cx = x
  for (const c of cols) {
    doc.text(wa(c.t.toUpperCase()), c.alinear === 'der' ? cx + c.ancho - 2 : cx + 2, y, {
      align: c.alinear === 'der' ? 'right' : 'left',
    })
    cx += c.ancho
  }
  const ancho = cols.reduce((a, c) => a + c.ancho, 0)
  doc.setDrawColor(...C.linea).setLineWidth(0.3).line(x, y + 2, x + ancho, y + 2)

  let fy = y + 2
  filas.forEach((f, i) => {
    if (i === resaltar) {
      doc.setFillColor(224, 238, 241).rect(x, fy, ancho, alto, 'F')
    }
    cx = x
    doc.setFontSize(8).setTextColor(...C.tinta)
    cols.forEach((c, j) => {
      doc.setFont('helvetica', i === resaltar ? 'bold' : 'normal')
      if (f.colores && f.colores[j]) doc.setTextColor(...f.colores[j])
      else doc.setTextColor(...C.tinta)
      doc.text(wa(f.celdas[j]), c.alinear === 'der' ? cx + c.ancho - 2 : cx + 2, fy + 5, {
        align: c.alinear === 'der' ? 'right' : 'left',
      })
      cx += c.ancho
    })
    fy += alto
    doc.setDrawColor(...C.linea).line(x, fy, x + ancho, fy)
  })
  return fy + 5
}

// ── Láminas ──────────────────────────────────────────────────────────────────

const TOTAL_LAMINAS = 6

function lamina1Veredicto(doc, d) {
  const y = crearLamina(doc, {
    indice: 1, total: TOTAL_LAMINAS, pestania: 'Veredicto',
    titulo: `${d.meta.areaLabel} - ${d.meta.turnoLabel}`,
    subtitulo: `${d.meta.fechaLabel} - ${hhmm(d.resumen.inicioMs)} a ${hhmm(d.resumen.finMs)} - ${d.resumen.maquinas} maquinas`,
  })

  const ancho = W - M * 2
  let cy = nota(doc, M, y, ancho, d.textos.veredictoDetalle, {
    color: d.textos.veredictoBueno ? C.ok : C.atencion,
    tamano: 10,
    titulo: d.textos.veredictoTitulo,
  })

  const cajaAncho = (ancho - 9) / 4
  const principal = d.resumen.causas[0]
  kpi(doc, M, cy + 3, cajaAncho, {
    rotulo: 'Produccion', valor: num(d.resumen.ciclos), sub: d.textos.produccionSub,
    color: d.textos.veredictoBueno ? C.ok : C.tinta,
  })
  kpi(doc, M + cajaAncho + 3, cy + 3, cajaAncho, {
    rotulo: 'Ritmo normal de la linea',
    valor: d.resumen.ritmoNormal ? `${d.resumen.ritmoNormal.toFixed(1)}` : '--',
    sub: 'piezas por minuto sin problemas',
  })
  kpi(doc, M + (cajaAncho + 3) * 2, cy + 3, cajaAncho, {
    rotulo: 'Linea detenida', valor: durTexto(d.resumen.detencion.todasSec),
    sub: 'todas las maquinas a la vez', color: C.atencion,
  })
  kpi(doc, M + (cajaAncho + 3) * 3, cy + 3, cajaAncho, {
    rotulo: 'Atribuible a Mantencion',
    valor: durTexto(d.resumen.mantencionEquivSec),
    sub: `de ${durTexto(d.resumen.detencion.equivalenteLineaSec)} perdidos`,
  })

  cy += 32
  if (principal) {
    nota(doc, M, cy, ancho, d.textos.notaLamina1, { color: C.acento, titulo: 'Por que esta lamina va primero' })
  }
}

function lamina2Falla(doc, d) {
  const y = crearLamina(doc, {
    indice: 2, total: TOTAL_LAMINAS, pestania: 'La falla, medida bien',
    titulo: 'Horas-maquina no son horas de linea',
    subtitulo: `El resumen de area de Shoplogix suma las ${d.resumen.maquinas} maquinas`,
  })
  const ancho = W - M * 2

  const cols = [
    { t: 'Causa', ancho: 62 },
    { t: 'Categoria', ancho: 38 },
    { t: 'Suma del area', ancho: 30, alinear: 'der' },
    { t: 'Al menos 1', ancho: 26, alinear: 'der' },
    { t: 'Todas', ancho: 24, alinear: 'der' },
    { t: 'Equiv. linea', ancho: 28, alinear: 'der' },
    { t: 'Eventos', ancho: 20, alinear: 'der' },
  ]
  const filas = d.resumen.causas.map((c) => ({
    celdas: [
      c.imputacion && c.imputacion.hoja ? c.imputacion.hoja : c.causa,
      c.imputacion ? c.imputacion.categoriaLabel : '--',
      dur(c.sumaSec), dur(c.unionSec), dur(c.todasSec), dur(c.equivalenteLineaSec), String(c.eventos),
    ],
    colores: [null, null, [...C.tinta3], null, null, null, null],
  }))
  filas.push({
    celdas: [
      'TOTAL detencion no programada', '',
      dur(d.resumen.detencion.sumaSec), dur(d.resumen.detencion.unionSec),
      dur(d.resumen.detencion.todasSec), dur(d.resumen.detencion.equivalenteLineaSec), '',
    ],
  })
  let cy = tabla(doc, M, y, cols, filas, { resaltar: 0 })

  // Barra del reparto por nivel de solapamiento de la causa principal.
  const p = d.resumen.causas[0]
  if (p && p.unionSec > 0) {
    doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(...C.tinta)
    doc.text(wa(`Reparto de los ${durTexto(p.unionSec)} en que hubo alguna maquina detenida por ${p.imputacion && p.imputacion.hoja ? p.imputacion.hoja : p.causa}`), M, cy + 4)
    const bx = M
    const by = cy + 8
    const bw = ancho
    let acc = 0
    for (let k = 1; k < p.porNivelSec.length; k++) {
      const sec = p.porNivelSec[k]
      if (!sec) continue
      const w = (sec / p.unionSec) * bw
      const alpha = k / (p.porNivelSec.length - 1)
      doc.setFillColor(
        Math.round(255 - (255 - C.crit[0]) * alpha),
        Math.round(255 - (255 - C.crit[1]) * alpha),
        Math.round(255 - (255 - C.crit[2]) * alpha),
      )
      doc.rect(bx + acc, by, Math.max(w - 0.6, 0.6), 11, 'F')
      doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta)
      const etiqueta = k === p.porNivelSec.length - 1 ? `LAS ${k} - linea muerta` : `${k} detenida${k > 1 ? 's' : ''}`
      if (w > 24) {
        doc.text(wa(etiqueta), bx + acc + 2, by + 15)
        doc.setFont('helvetica', 'normal').setTextColor(...C.tinta2)
        doc.text(wa(dur(sec)), bx + acc + 2, by + 19)
      }
      acc += w
    }
    cy = by + 24
  }

  nota(doc, M, cy, ancho, d.textos.notaLamina2, { color: C.acento, titulo: 'Como leer esta tabla' })
}

function lamina3Cronologia(doc, d) {
  const p = d.resumen.causas[0]
  const y = crearLamina(doc, {
    indice: 3, total: TOTAL_LAMINAS, pestania: 'Cronologia',
    titulo: p ? `Donde ocurrio: ${p.imputacion && p.imputacion.hoja ? p.imputacion.hoja : p.causa}` : 'Sin detenciones que ubicar',
    subtitulo: p ? `${p.eventos} eventos en el turno` : '',
  })
  const ancho = W - M * 2
  if (!p) {
    nota(doc, M, y, ancho, 'El turno no registro detenciones no programadas.', { color: C.ok })
    return
  }

  const t0 = d.resumen.inicioMs
  const t1 = d.resumen.finMs
  const span = t1 - t0
  const izq = M + 42
  const anchoPista = W - M - izq
  const altoPista = 11
  const gap = 6
  let py = y + 6

  const sx = (ms) => izq + ((ms - t0) / span) * anchoPista

  // Rejilla horaria
  const primera = Math.ceil(t0 / 3_600_000) * 3_600_000
  for (let t = primera; t <= t1; t += 3_600_000) {
    doc.setDrawColor(...C.linea).setLineWidth(0.2)
    doc.line(sx(t), py - 3, sx(t), py + d.eventosPorMaquina.length * (altoPista + gap))
    doc.setFontSize(6.5).setTextColor(...C.tinta3).setFont('helvetica', 'normal')
    doc.text(wa(hhmm(t)), sx(t), py + d.eventosPorMaquina.length * (altoPista + gap) + 4, { align: 'center' })
  }

  for (const m of d.eventosPorMaquina) {
    doc.setFillColor(233, 238, 240).rect(izq, py, anchoPista, altoPista, 'F')
    doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(...C.tinta2)
    doc.text(wa(m.maquina), izq - 3, py + 7.5, { align: 'right' })
    doc.setFillColor(...C.crit)
    for (const [a, b] of m.intervalos) {
      doc.rect(sx(a), py, Math.max(sx(b) - sx(a), 0.5), altoPista, 'F')
    }
    doc.setFontSize(7).setTextColor(...C.tinta3)
    doc.text(wa(dur(m.sec)), W - M + 0, py + 7.5, { align: 'right' })
    py += altoPista + gap
  }

  nota(doc, M, py + 8, ancho, d.textos.notaLamina3, { color: C.acento, titulo: 'Para que sirve en la reunion' })
}

function lamina4Ritmo(doc, d) {
  const y = crearLamina(doc, {
    indice: 4, total: TOTAL_LAMINAS, pestania: 'Donde afecto y como se contuvo',
    titulo: 'El ritmo real del turno, tramo por tramo',
    subtitulo: d.resumen.ritmoNormal
      ? `Ritmo normal de la linea: ${d.resumen.ritmoNormal.toFixed(1)} piezas por minuto (mediana de los bloques limpios de esta misma noche)`
      : 'Sin bloques limpios: no se puede fijar un ritmo normal',
  })
  const ancho = W - M * 2

  // Gráfico de barras del ritmo por bloque
  const gy = y
  const gh = 46
  const maxR = Math.max(d.resumen.ritmoNormal ? d.resumen.ritmoNormal * 1.25 : 1, ...d.bloques.map((b) => b.piezasPorMin), 1)
  const bw = ancho / Math.max(d.bloques.length, 1)
  d.bloques.forEach((b, i) => {
    const h = (b.piezasPorMin / maxR) * gh
    const enRitmo = d.resumen.ritmoNormal ? b.piezasPorMin >= d.resumen.ritmoNormal * 0.9 : true
    doc.setFillColor(...(enRitmo ? C.acento : [150, 180, 188]))
    doc.rect(M + i * bw, gy + gh - h, Math.max(bw - 0.3, 0.3), h, 'F')
  })
  if (d.resumen.ritmoNormal) {
    const ry = gy + gh - (d.resumen.ritmoNormal / maxR) * gh
    doc.setDrawColor(...C.ok).setLineWidth(0.5).setLineDashPattern([1.5, 1], 0)
    doc.line(M, ry, W - M, ry)
    doc.setLineDashPattern([], 0)
    doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.ok)
    doc.text(wa(`ritmo normal ${d.resumen.ritmoNormal.toFixed(1)}`), W - M, ry - 1.5, { align: 'right' })
  }
  doc.setDrawColor(...C.linea).line(M, gy + gh, W - M, gy + gh)
  doc.setFontSize(6.5).setTextColor(...C.tinta3).setFont('helvetica', 'normal')
  doc.text(wa(hhmm(d.resumen.inicioMs)), M, gy + gh + 4)
  doc.text(wa(hhmm(d.resumen.finMs)), W - M, gy + gh + 4, { align: 'right' })

  let cy = gy + gh + 10
  const cols = [
    { t: 'Tramo', ancho: 42 },
    { t: 'Ventana', ancho: 34 },
    { t: 'Minutos', ancho: 24, alinear: 'der' },
    { t: 'Piezas', ancho: 26, alinear: 'der' },
    { t: 'Piezas/min', ancho: 28, alinear: 'der' },
    { t: '% del ritmo normal', ancho: 40, alinear: 'der' },
  ]
  const filas = d.tramos.map((t) => ({
    celdas: [
      t.enRitmo ? 'En ritmo' : 'Caida',
      `${hhmm(t.inicioMs)} a ${hhmm(t.finMs)}`,
      String(t.minutos), num(t.ciclos), t.piezasPorMin.toFixed(1),
      `${Math.round(t.pctDelRitmo * 100)}%`,
    ],
    colores: [t.enRitmo ? [...C.ok] : [...C.crit], null, null, null, null,
      t.enRitmo ? [...C.ok] : [...C.crit]],
  }))
  cy = tabla(doc, M, cy, cols, filas)

  // ── Reparto de la perdida: parada / reenganche / degradado ───────────────
  const rp = d.reparto || { totalPz: 0, eventos: [] }
  if (rp.totalPz > 0) {
    doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(...C.tinta)
    doc.text(wa('Donde falto la produccion: las piezas que faltaron para el ritmo normal, segun en que estaba la linea'), M, cy + 2)
    const by = cy + 6
    const bh = 10
    const segs = [
      { l: 'PARADA - inevitable cuando hay falla', v: rp.paradoPz, c: C.crit },
      { l: 'REENGANCHE - lo que se acorta conteniendo', v: rp.reenganchePz, c: C.atencion },
      { l: 'RITMO DEGRADADO - otra palanca', v: rp.degradadoPz, c: C.tinta3 },
    ].filter((x) => x.v > 0)
    let bx = M
    for (const sgm of segs) {
      const sw = (sgm.v / rp.totalPz) * ancho
      doc.setFillColor(...sgm.c)
      doc.rect(bx, by, Math.max(sw - 0.6, 0.6), bh, 'F')
      if (sw > 42) {
        doc.setFontSize(6.5).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
        doc.text(wa(sgm.l), bx + 1, by + bh + 4)
        doc.setFontSize(9).setTextColor(...C.tinta)
        doc.text(wa(`${Math.round((sgm.v / rp.totalPz) * 100)}%  ${num(sgm.v)} pz`), bx + 1, by + bh + 9)
      }
      bx += sw
    }
    cy = by + bh + 14

    if (rp.eventos.length) {
      cy = tabla(doc, M, cy, [
        { t: 'Caida', ancho: 26 },
        { t: 'Parada', ancho: 26, alinear: 'der' },
        { t: 'Piezas parada', ancho: 34, alinear: 'der' },
        { t: 'Reenganche', ancho: 32, alinear: 'der' },
        { t: 'Piezas reenganche', ancho: 40, alinear: 'der' },
      ], rp.eventos.map((e) => ({
        celdas: [hhmm(e.inicioMs), `${e.minParo} min`, num(e.pzParo),
          `${e.minReenganche} min`, num(e.pzReenganche)],
        colores: [null, null, null, e.minReenganche >= rp.maxReengancheMin ? [...C.atencion] : [...C.ok], null],
      })))
    }
  }

  if (d.recuperaciones.length) {
    const cajaAncho = (ancho - 3 * (d.recuperaciones.length - 1)) / Math.max(d.recuperaciones.length, 1)
    d.recuperaciones.forEach((r, i) => {
      kpi(doc, M + i * (cajaAncho + 3), cy, cajaAncho, {
        rotulo: `Recuperacion - ${r.causa}`,
        valor: r.minutos == null ? 'no volvio' : `${r.minutos} min`,
        sub: r.minutos == null ? 'la linea no recupero el ritmo' : `ultimo evento ${hhmm(r.desdeMs)}, ritmo a las ${hhmm(r.volvioMs)}`,
        color: r.minutos == null ? C.crit : C.ok,
      })
    })
    cy += 27
  }
  if (d.textos.notaReparto) {
    cy = nota(doc, M, cy, ancho, d.textos.notaReparto, { color: C.acento, titulo: 'Como leer el reparto' })
  }
  nota(doc, M, cy, ancho, d.textos.notaLamina4, { color: C.acento, titulo: 'Lo que estos numeros si prueban' })
}

function lamina5Cotejo(doc, d) {
  const y = crearLamina(doc, {
    indice: 5, total: TOTAL_LAMINAS, pestania: 'Cotejo',
    titulo: `Contra los ${d.cotejo.comparados} turnos equivalentes anteriores`,
    subtitulo: 'Turnos del mismo horario y duracion, con produccion real',
  })
  const ancho = W - M * 2

  if (!d.cotejo.comparados) {
    nota(doc, M, y, ancho, 'No hay suficientes turnos equivalentes anteriores para cotejar. El informe no emite veredicto comparativo.', { color: C.atencion })
    return
  }

  const gh = 60
  const maxC = Math.max(...d.cotejo.filas.map((f) => f.ciclos || 0), 1)
  const bw = ancho / d.cotejo.filas.length
  d.cotejo.filas.forEach((f, i) => {
    const h = ((f.ciclos || 0) / maxC) * gh
    doc.setFillColor(...(f.esReferencia ? C.acento : [150, 180, 188]))
    doc.rect(M + i * bw + bw * 0.15, y + gh - h, bw * 0.7, h, 'F')
    doc.setFontSize(7).setFont('helvetica', f.esReferencia ? 'bold' : 'normal').setTextColor(...C.tinta2)
    doc.text(wa(num(f.ciclos)), M + i * bw + bw * 0.5, y + gh - h - 2, { align: 'center' })
    doc.setTextColor(...(f.esReferencia ? C.tinta : C.tinta3))
    doc.text(wa(f.id.slice(5, 10)), M + i * bw + bw * 0.5, y + gh + 5, { align: 'center' })
  })
  if (d.cotejo.medianaPrevios) {
    const my = y + gh - (d.cotejo.medianaPrevios / maxC) * gh
    doc.setDrawColor(...C.tinta3).setLineWidth(0.4).setLineDashPattern([1.5, 1], 0)
    doc.line(M, my, W - M, my)
    doc.setLineDashPattern([], 0)
    doc.setFontSize(7).setTextColor(...C.tinta2).setFont('helvetica', 'bold')
    doc.text(wa(`mediana ${num(d.cotejo.medianaPrevios)}`), W - M, my - 1.5, { align: 'right' })
  }
  doc.setDrawColor(...C.linea).line(M, y + gh, W - M, y + gh)

  nota(doc, M, y + gh + 12, ancho, d.textos.notaLamina5, { color: C.acento, titulo: 'Que dice esta comparacion' })
}

function lamina6Cierre(doc, d) {
  const y = crearLamina(doc, {
    indice: 6, total: TOTAL_LAMINAS, pestania: 'Cierre',
    titulo: 'Lo que se dice en la reunion',
    subtitulo: 'Texto listo para leer, y lo que queda comprometido',
  })
  const ancho = W - M * 2
  let cy = nota(doc, M, y, ancho, d.textos.parrafoReunion, { color: C.acento, tamano: 10 })

  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
  doc.text(wa('LO QUE QUEDA ABIERTO'), M, cy + 4)
  cy += 8
  doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...C.tinta2)
  for (const p of d.textos.pendientes) {
    const lineas = doc.splitTextToSize(wa(`- ${p}`), ancho - 4)
    doc.text(lineas, M + 2, cy)
    cy += lineas.length * 4 + 2
  }

  doc.setFontSize(7).setTextColor(...C.tinta3).setFont('helvetica', 'normal')
  doc.text(wa(d.textos.pieDeFuente), M, H - 10)
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/**
 * Genera el PDF y devuelve un Buffer.
 *
 * No toca Firestore ni la red: recibe los datos ya calculados. Así se puede
 * probar sin credenciales y se puede regenerar un informe viejo con los datos
 * que se guardaron, sin depender de que Shoplogix siga respondiendo lo mismo.
 *
 * @param {object} d  ver `construirDatosInforme` en informeTurno.js
 * @returns {Buffer}
 */
function generarInformeTurno(d) {
  // Carga diferida: jsPDF pesa y no todas las invocaciones de la function
  // generan un PDF.
  // eslint-disable-next-line global-require
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({
    title: `Informe de turno - ${d.meta.areaLabel} - ${d.meta.fechaLabel}`,
    creator: 'PWA Mantencion',
  })

  lamina1Veredicto(doc, d)
  lamina2Falla(doc, d)
  lamina3Cronologia(doc, d)
  lamina4Ritmo(doc, d)
  lamina5Cotejo(doc, d)
  lamina6Cierre(doc, d)

  return Buffer.from(doc.output('arraybuffer'))
}

module.exports = { generarInformeTurno, wa, dur, durTexto, hhmm, TOTAL_LAMINAS }
