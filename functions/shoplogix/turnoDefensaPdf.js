/**
 * turnoDefensaPdf — arma el PDF del informe post-turno.
 *
 * Cinco láminas, en orden de defensa y no de dato, más un anexo cuando la
 * línea tiene varias máquinas:
 *   1. Veredicto       — la frase, cuatro cifras y de quién fue la pérdida.
 *   2. Fallas de equipo— qué falló, dónde, cuánto tardó la línea en volver, y
 *                        la cronología de todas las detenciones por dueño.
 *   3. Ritmo           — el ritmo bloque por bloque y dónde faltaron las piezas.
 *   4. Cotejo          — contra los turnos equivalentes, con los min de
 *                        Mantención de cada uno.
 *   5. Cierre          — el párrafo para leer en la reunión y lo que queda abierto.
 *   6. Anexo           — suma de máquinas vs minutos de línea (solo varias máquinas).
 *
 * Las frases salen de `correoTurno.textosCorreo`: el correo y el PDF dicen lo
 * mismo con las mismas palabras. La forma sigue el protocolo de
 * /sin-tics-visual (ver la paleta abajo).
 *
 * ── Rendering ───────────────────────────────────────────────────────────────
 * Los gráficos se dibujan con primitivas de jsPDF (rectángulos y líneas), no
 * con imágenes de un servicio externo: el informe no depende de que un tercero
 * responda a las 5 de la mañana.
 *
 * ── Tildes ──────────────────────────────────────────────────────────────────
 * Verificado el 2026-08-18: el PDF declara `WinAnsiEncoding` y escribe `ó` como
 * un solo byte 0xF3, o sea las tildes salen bien. Lo que NO está en WinAnsi
 * (flechas, ≥, ×, guiones largos raros) lo traduce `wa()`.
 *
 * ── Escalas de tiempo ───────────────────────────────────────────────────────
 * Todos los instantes vienen en wall-clock-as-UTC y se formatean con getters
 * UTC: así sale la hora del reloj de planta. Convertir sería el bug.
 */

const { textosCorreo, fechaLarga, listaY, etiquetaPausa, EQUIPO, ORDINAL } = require('./correoTurno')
const { perdidaPorDueno } = require('./informeTurno')

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

/**
 * "1 maquina" / "3 maquinas". Parece cosmetico y no lo es: el informe de Filete
 * decia "1 maquinas" en la cabecera y "LAS 1 - linea muerta" en el grafico, y
 * cualquiera que lo lea deja de creerle al resto de las cifras.
 */
const maquinasTexto = (n) => (n === 1 ? '1 máquina' : `${n} máquinas`)

// ── Paleta ───────────────────────────────────────────────────────────────────
// La misma del correo (correoTurno.js) y del protocolo de /sin-tics-visual:
// tinta y grises, y color SOLO donde codifica un estado. Sin franjas de color
// en la cabecera, sin cajas de KPI, sin notas con barra a la izquierda.
const C = {
  tinta: [31, 31, 31],
  gris: [95, 99, 104],
  marco: [227, 227, 227],
  fila: [236, 236, 236],
  banda: [241, 243, 244],
  barra: [201, 205, 210],
  oscuro: [60, 64, 67],
  pista: [246, 247, 248],
  pausa: [232, 234, 237],
  rojo: [179, 38, 30],
  ambar: [138, 90, 0],
}

/** Color de cada dueño de la pérdida: rojo = falla de equipo, ámbar = pendiente de imputar. */
const COLOR_DUENO = {
  mantencion: C.rojo,
  externo: [128, 134, 139],
  planificado: [128, 134, 139],
  fueraDelArbol: C.ambar,
  sinCausal: C.ambar,
  micro: C.barra,
  pausa: C.pausa,
}

// Cuatro cuerpos y nada intermedio (pt).
const T = { titulo: 18, cuerpo: 10, chico: 7.5, rotulo: 7 }

// ── Maquetación con flujo ────────────────────────────────────────────────────
//
// ⚠ jsPDF DESCARTA en silencio lo que se dibuja bajo el borde inferior de la
// hoja: no lo recorta ni avisa, simplemente no queda en el PDF. Verificado el
// 2026-08-20 con un texto en y=260 mm sobre una hoja de 210 mm.
//
// Por eso la maqueta no suma `y` a ojo: todo bloque pide espacio ANTES de
// dibujarse. Si no cabe, la lámina sigue en una página de continuación. Antes
// una página de más que un dato de menos — este informe se defiende en una
// reunión.

const W = 297 // A4 apaisado
const H = 210
const M = 16 // margen
const Y_FIN = H - 12 // última línea útil del cuerpo
const ANCHO = W - M * 2
const mmPorPt = 0.3528

function abrirLienzo(doc, d) {
  return { doc, d, y: 0, paginas: 0, pestania: '', titulo: '' }
}

/** Rótulo de hoja + identificación del turno, sobre un filete fino. */
function cabeceraHoja(L, pestania) {
  const { doc, d } = L
  doc.setFontSize(T.rotulo).setFont('helvetica', 'bold').setTextColor(...C.gris)
  doc.text(wa(pestania.toUpperCase()), M, 10)
  doc.setFont('helvetica', 'normal')
  // El número de hoja lo estampa `numerar` a la derecha; esto va antes.
  doc.text(wa(`${d.meta.areaLabel} · ${d.meta.turnoLabel} · ${d.meta.fechaLabel}`), W - M - 14, 10, { align: 'right' })
  doc.setDrawColor(...C.marco).setLineWidth(0.25).line(M, 12.5, W - M, 12.5)
}

function crearLamina(L, { pestania, titulo, subtitulo }) {
  const { doc } = L
  if (L.paginas > 0) doc.addPage()
  L.paginas += 1
  L.pestania = pestania
  L.titulo = titulo
  cabeceraHoja(L, pestania)
  doc.setFontSize(T.titulo).setFont('helvetica', 'bold').setTextColor(...C.tinta)
  const lineas = doc.splitTextToSize(wa(titulo), ANCHO)
  doc.text(lineas, M, 23)
  let y = 23 + (lineas.length - 1) * T.titulo * mmPorPt * 1.2
  if (subtitulo) {
    doc.setFontSize(T.chico + 1).setFont('helvetica', 'normal').setTextColor(...C.gris)
    const sub = doc.splitTextToSize(wa(subtitulo), ANCHO)
    doc.text(sub, M, y + 6)
    y += 6 + (sub.length - 1) * 4
  }
  L.y = y + 9
  return L.y
}

/**
 * Sigue la MISMA lámina en otra hoja. Se marca "(cont.)" para que nadie crea
 * que perdió una lámina o que hay dos versiones del mismo dato.
 */
function continuar(L) {
  const { doc } = L
  doc.addPage()
  L.paginas += 1
  cabeceraHoja(L, `${L.pestania} (cont.)`)
  doc.setFontSize(T.chico + 1).setFont('helvetica', 'normal').setTextColor(...C.gris)
  doc.text(wa(`${L.titulo} - continuación`), M, 19)
  L.y = 25
  return L.y
}

/** Reserva `alto` mm. Devuelve la `y` donde se puede dibujar de verdad. */
function sitio(L, alto) {
  if (L.y + alto > Y_FIN) continuar(L)
  return L.y
}

// ── Primitivas ───────────────────────────────────────────────────────────────

/** Rótulo de sección: el único nivel de versalitas del documento. */
function rotulo(L, texto, { x = M, arriba = 2 } = {}) {
  const y = sitio(L, arriba + 9)
  L.doc.setFontSize(T.rotulo).setFont('helvetica', 'bold').setTextColor(...C.gris)
  L.doc.text(wa(texto.toUpperCase()), x, y + arriba + 3)
  L.y = y + arriba + 6
  return L.y
}

/**
 * Párrafo. Con `titulo`, el rótulo va en negrita en su propia línea: es la
 * advertencia del protocolo, sin caja ni barra de color.
 */
function parrafo(L, texto, { titulo, tamano = T.cuerpo - 1, ancho = ANCHO, x = M, color = C.tinta, filete = false } = {}) {
  const { doc } = L
  const alto1 = tamano * mmPorPt * 1.45
  const lineas = doc.setFontSize(tamano).setFont('helvetica', 'normal').splitTextToSize(wa(texto), ancho)
  const alto = lineas.length * alto1 + (titulo ? alto1 : 0) + (filete ? 4 : 0) + 2
  let y = sitio(L, alto)
  if (filete) {
    doc.setDrawColor(...C.tinta).setLineWidth(0.6).line(x, y, x + ancho, y)
    y += 4
  }
  y += alto1 * 0.8
  if (titulo) {
    doc.setFontSize(tamano).setFont('helvetica', 'bold').setTextColor(...C.tinta)
    doc.text(wa(titulo), x, y)
    y += alto1
  }
  doc.setFontSize(tamano).setFont('helvetica', 'normal').setTextColor(...color)
  doc.text(lineas, x, y, { lineHeightFactor: 1.45 })
  L.y = y + (lineas.length - 1) * alto1 + alto1 * 0.6 + 3
  return L.y
}

/**
 * Párrafo que abre con un rótulo en negrita en la misma línea («Grader: la
 * causal…»): la advertencia del protocolo, sin caja. jsPDF no mezcla pesos en
 * un `text`, así que la primera línea se arma a mano.
 */
function parrafoRotulado(L, rot, texto, { tamano = T.cuerpo, ancho = ANCHO, x = M } = {}) {
  const { doc } = L
  const alto1 = tamano * mmPorPt * 1.45
  doc.setFontSize(tamano).setFont('helvetica', 'bold')
  const wRot = doc.getTextWidth(`${wa(rot)} `)
  doc.setFont('helvetica', 'normal')
  const palabras = wa(texto).split(' ')
  let primera = ''
  while (palabras.length && doc.getTextWidth(`${primera} ${palabras[0]}`.trim()) <= ancho - wRot) {
    primera = `${primera} ${palabras.shift()}`.trim()
  }
  const resto = palabras.length ? doc.splitTextToSize(palabras.join(' '), ancho) : []
  const alto = (1 + resto.length) * alto1 + 2
  const y = sitio(L, alto) + alto1 * 0.8
  doc.setFont('helvetica', 'bold').setTextColor(...C.tinta)
  doc.text(wa(rot), x, y)
  doc.setFont('helvetica', 'normal')
  doc.text(primera, x + wRot, y)
  if (resto.length) doc.text(resto, x, y + alto1, { lineHeightFactor: 1.45 })
  L.y = y + resto.length * alto1 + alto1 * 0.6 + 2
  return L.y
}

/** Cifras alineadas a la retícula, rótulo debajo, sin caja. */
function cifras(L, lista, { x = M, ancho = ANCHO, columnas = lista.length } = {}) {
  const { doc } = L
  const filas = Math.ceil(lista.length / columnas)
  const altoFila = 17
  const y0 = sitio(L, filas * altoFila)
  const cw = ancho / columnas
  lista.forEach((c, i) => {
    const cx = x + (i % columnas) * cw
    const cy = y0 + Math.floor(i / columnas) * altoFila
    doc.setFontSize(T.titulo).setFont('helvetica', 'bold').setTextColor(...(c.color || C.tinta))
    doc.text(wa(c.valor), cx, cy + 7)
    doc.setFontSize(T.chico).setFont('helvetica', 'normal').setTextColor(...C.gris)
    doc.text(doc.splitTextToSize(wa(c.sub), cw - 4), cx, cy + 11.5)
  })
  L.y = y0 + filas * altoFila
  return L.y
}

/**
 * Tabla «bordered» de macOS: marco fino, encabezado con banda gris, filetes
 * horizontales, fila de cierre con filete de tinta. Ningún filete vertical.
 *
 * `cols` = [{ t, ancho, alinear }]. Cada fila: { celdas, sub?, colores?, punto? }
 * — `sub` es una segunda línea chica bajo la primera celda; `punto` un color
 * para el punto de estado delante de la primera celda.
 *
 * Cuando no caben todas las filas sigue en la hoja siguiente y REPITE la
 * cabecera: una tabla decapitada en la segunda hoja es ilegible en una reunión.
 * Ninguna fila se descarta — la tabla de caídas del turno del 20-08 en Filete
 * tenía 14 y solo entraban 5.
 */
const ALTO_CAB = 6.5
const altoFila = (f) => (f.sub ? 10.5 : 7)

function tabla(L, cols, filas, { x = M, cierre = null } = {}) {
  const { doc } = L
  const ancho = cols.reduce((a, c) => a + c.ancho, 0)
  const todas = cierre ? [...filas, { ...cierre, esCierre: true }] : filas
  let i = 0
  let vueltas = 0
  do {
    // Cinturón: `sitio` siempre deja la hoja con espacio, así que el bucle
    // avanza sí o sí. El tope es por si alguien cambia esa invariante.
    vueltas += 1
    if (vueltas > todas.length + 10) break
    const y = sitio(L, ALTO_CAB + 7 * Math.min(2, todas.length - i))
    // Encabezado: banda gris tenue.
    doc.setFillColor(...C.banda).rect(x, y, ancho, ALTO_CAB, 'F')
    doc.setFontSize(T.chico).setFont('helvetica', 'normal').setTextColor(...C.gris)
    let cx = x
    for (const c of cols) {
      doc.text(wa(c.t), c.alinear === 'der' ? cx + c.ancho - 2.5 : cx + 2.5, y + 4.3, { align: c.alinear === 'der' ? 'right' : 'left' })
      cx += c.ancho
    }
    let fy = y + ALTO_CAB
    doc.setDrawColor(...C.marco).setLineWidth(0.25).line(x, fy, x + ancho, fy)
    while (i < todas.length && fy + altoFila(todas[i]) <= Y_FIN) {
      const f = todas[i]
      const af = altoFila(f)
      if (f.esCierre) doc.setDrawColor(...C.tinta).setLineWidth(0.35).line(x, fy, x + ancho, fy)
      else if (i > 0 && fy > y + ALTO_CAB) doc.setDrawColor(...C.fila).setLineWidth(0.25).line(x, fy, x + ancho, fy)
      cx = x
      cols.forEach((c, j) => {
        let tx = c.alinear === 'der' ? cx + c.ancho - 2.5 : cx + 2.5
        if (j === 0 && f.punto) {
          doc.setFillColor(...f.punto).circle(tx + 1, fy + 3.6, 0.9, 'F')
          tx += 3.5
        }
        doc.setFontSize(T.cuerpo - 1).setFont('helvetica', f.esCierre || (f.negrita && f.negrita[j]) ? 'bold' : 'normal')
        doc.setTextColor(...((f.colores && f.colores[j]) || C.tinta))
        doc.text(wa(f.celdas[j]), tx, fy + 4.8, { align: c.alinear === 'der' ? 'right' : 'left' })
        if (j === 0 && f.sub) {
          doc.setFontSize(T.chico - 0.5).setFont('helvetica', 'normal').setTextColor(...C.gris)
          doc.text(wa(f.sub), tx, fy + 8.6)
        }
        cx += c.ancho
      })
      fy += af
      i += 1
    }
    // Marco fino alrededor de lo que entró en esta hoja.
    doc.setDrawColor(...C.marco).setLineWidth(0.25).rect(x, y, ancho, fy - y)
    L.y = fy + 4
  } while (i < todas.length)
  return L.y
}

/** Eje horario bajo un gráfico de tiempo. */
function ejeHoras(doc, { t0, t1, x, ancho, y }) {
  const sx = (ms) => x + ((ms - t0) / (t1 - t0)) * ancho
  doc.setFontSize(T.rotulo - 0.5).setFont('helvetica', 'normal').setTextColor(...C.gris)
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t <= t1; t += 3_600_000) {
    doc.text(wa(hhmm(t)), sx(t), y, { align: 'center' })
  }
}

// ── Láminas ──────────────────────────────────────────────────────────────────
//
// Cinco láminas de narrativa, seis con el anexo (solo líneas de varias
// máquinas). Las HOJAS pueden ser más: una lámina con muchas filas se continúa
// en vez de perder el final.
const TOTAL_LAMINAS = 6

const mantDe = (d) => d.porDueno.filas.find((f) => f.clave === 'mantencion') || { min: 0 }

function lamina1Veredicto(L, d, t) {
  const r = d.resumen
  const unaSola = r.maquinas === 1
  crearLamina(L, {
    pestania: 'Veredicto',
    titulo: t.veredicto,
    subtitulo: `${fechaLarga(d.meta.fechaLabel)} · ${hhmm(r.inicioMs)} a ${hhmm(r.finMs)} · `
      + `${EQUIPO[d.meta.planta] || maquinasTexto(r.maquinas)}`,
  })
  parrafo(L, t.detalle, { tamano: T.cuerpo + 1, filete: true })
  L.y += 4

  const yCol = L.y
  const izq = 120
  const mant = mantDe(d)
  const perdida = d.porDueno.totalMin
  const c = d.cotejo || {}
  cifras(L, [
    {
      valor: num(r.ciclos),
      sub: d.enCurso ? 'piezas hasta ahora' : (c.comparados >= 3 && c.medianaPrevios != null ? `piezas · mediana ${num(c.medianaPrevios)}` : 'piezas'),
    },
    { valor: `${perdida} min`, sub: 'pérdida de línea' },
    { valor: `${mant.min} min`, sub: perdida ? `de Mantención · ${Math.round((mant.min / perdida) * 100)} %` : 'de Mantención' },
    unaSola
      ? { valor: String(d.fallas.eventos), sub: d.fallas.eventos === 1 ? 'detención de Mantención' : 'detenciones de Mantención' }
      : { valor: durTexto(r.detencion.todasSec), sub: `con las ${r.maquinas} detenidas a la vez` },
  ], { ancho: izq, columnas: 2 })
  L.y += 2
  parrafo(L, unaSola
    ? 'La línea es una sola máquina: cada minuto detenido es un minuto sin producir. El total no incluye las pausas planificadas.'
    : `«Min de línea» es el tiempo detenido de cada máquina dividido por las ${r.maquinas}: un minuto con una sola Baader `
      + 'parada cuenta un tercio. Es la misma regla para Mantención y para todos los demás.',
  { titulo: 'Cómo leer las cifras', tamano: T.chico + 0.5, ancho: izq - 6 })
  const yIzq = L.y

  // Columna derecha: de quién fue la pérdida.
  L.y = yCol
  const x = M + izq + 10
  const ancho = ANCHO - izq - 10
  rotulo(L, 'De quién fue la pérdida', { x, arriba: 0 })
  tabla(L, [{ t: 'Dueño', ancho: ancho - 30 }, { t: 'Min de línea', ancho: 30, alinear: 'der' }],
    d.porDueno.filas.map((f) => ({
      celdas: [f.etiqueta, String(f.min)],
      punto: COLOR_DUENO[f.clave],
      sub: f.clave === 'micro'
        ? `${num(f.eventos)} paros cortos; el sistema no pide causal`
        : (f.causas.slice(0, 3).map((k) => `${k.etiqueta} ${Math.round(k.sec / 60)}`).join(', ')
          + (f.causas.length > 3 ? ` y ${f.causas.length - 3} más` : '')) || 'ninguna detención imputada',
    })),
    { x, cierre: { celdas: ['Total', String(perdida)] } })
  const pausas = (r.pausas || []).map((p) => ({ e: etiquetaPausa(p.causa), m: Math.round(p.todasSec / 60) })).filter((p) => p.m > 0)
  if (pausas.length) {
    parrafo(L, `Las pausas planificadas van aparte, no son pérdida: ${listaY(pausas.map((p) => `${p.e} ${p.m} min`))}.`,
      { tamano: T.chico, ancho, x, color: C.gris })
  }
  L.y = Math.max(L.y, yIzq)
}

function lamina2Fallas(L, d) {
  const r = d.resumen
  const unaSola = r.maquinas === 1
  const f = d.fallas
  crearLamina(L, {
    pestania: 'Fallas de equipo',
    titulo: f.filas.length ? 'Qué falló, dónde y cuánto tardó la línea en volver' : 'Ninguna detención quedó imputada a Mantención',
    subtitulo: f.filas.length
      ? `${f.eventos} ${f.eventos === 1 ? 'detención imputada' : 'detenciones imputadas'} a Mantención · ${f.totalMin} min de línea`
      : 'Las detenciones del turno fueron de otros dueños; la cronología de abajo las muestra todas.',
  })

  if (f.filas.length) {
    tabla(L, [
      { t: unaSola ? 'Causa' : 'Máquina · causa', ancho: 117 },
      { t: 'Det.', ancho: 22, alinear: 'der' },
      { t: 'Min de línea', ancho: 32, alinear: 'der' },
      { t: 'Media por detención', ancho: 44, alinear: 'der' },
      { t: 'Volvió a ritmo', ancho: 50, alinear: 'der' },
    ], f.filas.map((x) => {
      const notas = []
      if (x.ambigua) notas.push('eléctrica o mecánica, sin separar')
      if (x.turnosSeguidos >= 2) notas.push(`${ORDINAL[x.turnosSeguidos] || `${x.turnosSeguidos}.º`} turno equivalente seguido`)
      let volvio = `${x.volvioMin} min`
      if (x.volvioMin == null) volvio = 'no volvió en el turno'
      else if (x.volvioMin === 0) volvio = 'no la sacó de ritmo'
      return {
        celdas: [unaSola ? x.etiqueta : `${x.maquinaCorta} · ${x.etiqueta}`, String(x.eventos), String(x.min), `${x.mediaMin} min`, volvio],
        sub: notas.join(' · ') || null,
        colores: [null, null, null, null, x.volvioMin == null ? C.rojo : (x.volvioMin === 0 ? C.gris : null)],
      }
    }), { cierre: { celdas: ['Total', String(f.eventos), String(f.totalMin), '', ''] } })
  }

  // Cronología: cada detención y pausa, por máquina, del color de su dueño.
  const crono = d.cronologia || []
  if (!crono.length) return
  L.y += 2
  rotulo(L, 'Cada detención del turno, por máquina')
  const { doc } = L
  const t0 = r.inicioMs
  const t1 = r.finMs
  const izq = M + 16
  const anchoPista = W - M - izq
  const altoPista = unaSola ? 9 : 6.5
  const gap = 2.5
  const alto = crono.length * (altoPista + gap) + 14
  let py = sitio(L, alto)
  const sx = (ms) => izq + ((Math.min(Math.max(ms, t0), t1) - t0) / (t1 - t0)) * anchoPista
  for (const m of crono) {
    doc.setFillColor(...C.pista).rect(izq, py, anchoPista, altoPista, 'F')
    doc.setFontSize(T.chico).setFont('helvetica', 'normal').setTextColor(...C.gris)
    doc.text(wa(unaSola ? 'Línea' : m.maquinaCorta), M, py + altoPista / 2 + 1.2)
    // Pausas primero: van debajo de todo.
    for (const pase of ['pausa', 'resto']) {
      for (const tr of m.tramos) {
        if ((pase === 'pausa') !== (tr.dueno === 'pausa')) continue
        doc.setFillColor(...(COLOR_DUENO[tr.dueno] || C.gris))
        doc.rect(sx(tr.a), py, Math.max(sx(tr.b) - sx(tr.a), 0.35), altoPista, 'F')
      }
    }
    py += altoPista + gap
  }
  ejeHoras(doc, { t0, t1, x: izq, ancho: anchoPista, y: py + 2 })
  // Leyenda: solo los dueños que aparecen.
  const presentes = new Set(crono.flatMap((m) => m.tramos.map((tr) => tr.dueno)))
  const leyenda = [['mantencion', 'Mantención'], ['externo', 'Externo'], ['planificado', 'Planificado'],
    ['fueraDelArbol', 'Causal fuera del árbol'], ['sinCausal', 'Sin causal'], ['micro', 'Micro detenciones'], ['pausa', 'Pausa planificada']]
    .filter(([k]) => presentes.has(k))
  let lx = izq
  const ly = py + 8
  doc.setFontSize(T.chico).setFont('helvetica', 'normal').setTextColor(...C.gris)
  for (const [k, etq] of leyenda) {
    doc.setFillColor(...COLOR_DUENO[k]).rect(lx, ly - 2.4, 3, 3, 'F')
    doc.text(wa(etq), lx + 4.5, ly)
    lx += 4.5 + doc.getTextWidth(wa(etq)) + 7
  }
  L.y = ly + 6
}

function lamina3Ritmo(L, d) {
  const r = d.resumen
  const rp = d.reparto || { totalPz: 0, eventos: [] }
  let titulo = 'El ritmo del turno, bloque por bloque'
  if (rp.totalPz === 0) titulo = 'El turno corrió a su ritmo de punta a punta'
  else if (!rp.eventos.length) titulo = 'El turno no tuvo caídas de línea: lo que faltó fue ritmo'
  crearLamina(L, {
    pestania: 'Ritmo y contención',
    titulo,
    subtitulo: r.ritmoNormal
      ? `Ritmo normal ${r.ritmoNormal.toFixed(1).replace('.', ',')} piezas por minuto: la mediana de los bloques de 5 min sin detenciones de este mismo turno`
      : 'Sin bloques limpios: no se puede fijar un ritmo normal',
  })
  const { doc } = L

  // Barras del ritmo por bloque: oscuras en ritmo, grises bajo él.
  const gh = 40
  const gy = sitio(L, gh + 10)
  const bloques = d.bloques || []
  const maxR = Math.max(r.ritmoNormal ? r.ritmoNormal * 1.15 : 1, ...bloques.map((b) => b.piezasPorMin), 1)
  const t0 = r.inicioMs
  const t1 = r.finMs
  const izq = M + 16
  const ancho = W - M - izq
  const bw = ancho / Math.max(bloques.length, 1)
  bloques.forEach((b, i) => {
    const h = (b.piezasPorMin / maxR) * gh
    const enRitmo = r.ritmoNormal ? b.piezasPorMin >= r.ritmoNormal * 0.9 : true
    doc.setFillColor(...(enRitmo ? C.oscuro : C.barra))
    doc.rect(izq + i * bw, gy + gh - h, Math.max(bw - 0.3, 0.3), h, 'F')
  })
  doc.setDrawColor(...C.tinta).setLineWidth(0.3).line(izq, gy + gh, W - M, gy + gh)
  doc.setFontSize(T.rotulo - 0.5).setFont('helvetica', 'normal').setTextColor(...C.gris)
  doc.text('pz/min', M, gy + 3)
  doc.text(wa(String(Math.round(maxR))), izq - 2, gy + 2, { align: 'right' })
  doc.text('0', izq - 2, gy + gh, { align: 'right' })
  if (r.ritmoNormal) {
    const ry = gy + gh - (r.ritmoNormal / maxR) * gh
    doc.setDrawColor(...C.tinta).setLineWidth(0.3).setLineDashPattern([1.2, 1], 0)
    doc.line(izq, ry, W - M, ry)
    doc.setLineDashPattern([], 0)
    // El valor va en el margen del eje: sobre las barras tapaba las últimas.
    doc.setTextColor(...C.tinta)
    doc.text(wa(r.ritmoNormal.toFixed(1).replace('.', ',')), izq - 2, ry + 1, { align: 'right' })
  }
  if (t0 != null && t1 != null) ejeHoras(doc, { t0, t1, x: izq, ancho, y: gy + gh + 4 })
  L.y = gy + gh + 9

  if (rp.totalPz > 0) {
    const yCol = L.y
    const col = 125
    rotulo(L, `Dónde faltaron las ${num(rp.totalPz)} piezas`)
    const by = sitio(L, 8)
    const segs = [
      { l: 'Con la línea parada', v: rp.paradoPz, c: C.oscuro },
      { l: 'Volviendo a tomar ritmo', v: rp.reenganchePz, c: C.rojo },
      { l: 'Andando bajo su ritmo', v: rp.degradadoPz, c: C.barra },
    ]
    let bx = M
    for (const sg of segs) {
      const sw = (sg.v / rp.totalPz) * col
      if (sw > 0) doc.setFillColor(...sg.c).rect(bx, by, Math.max(sw - 0.4, 0.4), 4, 'F')
      bx += sw
    }
    L.y = by + 6
    const pct = (v) => `${Math.round((v / rp.totalPz) * 100)} %`
    tabla(L, [{ t: 'Cómo estaba la línea', ancho: col - 52 }, { t: 'Piezas', ancho: 26, alinear: 'der' }, { t: 'Parte', ancho: 26, alinear: 'der' }],
      segs.map((sg) => ({ celdas: [sg.l, num(sg.v), pct(sg.v)], punto: sg.c })),
      { cierre: { celdas: ['Total', num(rp.totalPz), '100 %'] } })
    const yIzq = L.y

    // Columna derecha: contención y capacidad.
    L.y = yCol
    const x = M + col + 12
    const anchoNota = ANCHO - col - 12
    const peor = rp.eventos.reduce((a, e) => Math.max(a, e.minReenganche || 0), 0)
    parrafo(L, `Lo que Mantención controla es cuánto tarda la línea en volver, no cuánto dura la falla. El reenganche `
      + `fue ${pct(rp.reenganchePz)} de lo que faltó${rp.eventos.length ? `; el más largo tomó ${peor} min` : ''}.`
      + (rp.degradadoPz > rp.paradoPz + rp.reenganchePz
        ? ' Lo que más costó fue andar bajo el ritmo, y eso no se arregla conteniendo mejor una avería: son micro detenciones o abastecimiento.'
        : ''),
    { titulo: 'Contención', tamano: T.chico + 1, x, ancho: anchoNota })
    const oc = d.ocupacion
    if (oc && oc.ocupacion != null) {
      const pc = Math.round(oc.ocupacion * 100)
      parrafo(L, d.meta.planta === 'filete'
        ? `Con la cadena en marcha pasaron ${num(oc.pasaron)} silletas y se llenaron ${num(oc.llenas)}: ${pc} %. `
          + 'La cadena gira siempre a 18 pz/min; lo que Shoplogix llama «pérdida de velocidad» son silletas que pasaron vacías.'
        : `En marcha la línea usó ${pc} % de su capacidad (${num(oc.llenas)} de ${num(oc.pasaron)} a ${oc.ritmoNominal} pz/min por máquina). `
          + 'El dato no dice si la brecha es alimentación, calibre o la máquina: eso se establece en terreno.',
      { titulo: d.meta.planta === 'filete' ? 'Silletas' : 'Capacidad', tamano: T.chico + 1, x, ancho: anchoNota })
    }
    /* Las caídas van bajo las notas, en la columna derecha: a todo el ancho
       empujaban la tabla a una hoja de continuación con dos filas. Si son
       muchas, la tabla sigue en la hoja siguiente en esa misma columna. */
    if (rp.eventos.length) {
      L.y += 1
      rotulo(L, 'Cada caída de línea', { x })
      tabla(L, [
        { t: 'Caída', ancho: 22 },
        { t: 'Parada', ancho: 24, alinear: 'der' },
        { t: 'Piezas parada', ancho: 34, alinear: 'der' },
        { t: 'Reenganche', ancho: 28, alinear: 'der' },
        { t: 'Piezas al volver', ancho: anchoNota - 108, alinear: 'der' },
      ], rp.eventos.map((e) => ({
        celdas: [hhmm(e.inicioMs), `${e.minParo} min`, num(e.pzParo), `${e.minReenganche} min`, num(e.pzReenganche)],
        colores: [null, null, null, e.minReenganche >= (rp.maxReengancheMin || Infinity) ? C.rojo : null, null],
      })), { x })
    }
    L.y = Math.max(L.y, yIzq)
  }
}

function lamina4Cotejo(L, d) {
  const c = d.cotejo || { comparados: 0, filas: [] }
  const banda = c.comparados >= 3 && c.medianaPrevios != null && c.margenHabitual != null
  crearLamina(L, {
    pestania: 'Cotejo',
    titulo: c.comparados ? `Contra los ${c.comparados} turnos equivalentes anteriores` : 'Sin turnos equivalentes para comparar',
    subtitulo: banda
      ? `Mismo horario y duración. Lo habitual va de ${num(c.medianaPrevios - c.margenHabitual)} a ${num(c.medianaPrevios + c.margenHabitual)} piezas`
      : 'Mismo horario y duración',
  })
  if (!c.comparados || !c.filas.length) {
    parrafo(L, 'No hay suficientes turnos equivalentes anteriores para cotejar. El informe no emite veredicto comparativo.')
    return
  }
  if (d.enCurso) {
    parrafo(L, 'El turno sigue en curso: se muestra contra turnos completos solo como referencia, la comparación no vale.',
      { titulo: 'Atención', color: C.tinta })
  }
  const { doc } = L
  const gh = 70
  const izq = M + 30
  const ancho = W - M - izq
  const y = sitio(L, gh + 26)
  const maxC = Math.max(...c.filas.map((f) => f.ciclos || 0), 1)
  const sy = (v) => y + gh - (v / maxC) * gh
  const bw = ancho / c.filas.length
  if (banda) {
    const top = sy(Math.min(c.medianaPrevios + c.margenHabitual, maxC))
    doc.setFillColor(...C.banda).rect(izq, top, ancho, sy(c.medianaPrevios - c.margenHabitual) - top, 'F')
  }
  c.filas.forEach((f, i) => {
    const h = ((f.ciclos || 0) / maxC) * gh
    const cx = izq + i * bw + bw / 2
    doc.setFillColor(...(f.esReferencia ? C.tinta : C.barra))
    doc.rect(izq + i * bw + bw * 0.18, y + gh - h, bw * 0.64, h, 'F')
    doc.setFontSize(T.chico).setFont('helvetica', f.esReferencia ? 'bold' : 'normal').setTextColor(...(f.esReferencia ? C.tinta : C.gris))
    doc.text(wa(num(f.ciclos)), cx, y + gh - h - 1.5, { align: 'center' })
    doc.text(wa(f.esReferencia ? 'Hoy' : `${f.id.slice(8, 10)}-${f.id.slice(5, 7)}`), cx, y + gh + 5, { align: 'center' })
    doc.text(wa(f.mantencionSec == null ? '–' : String(Math.round(f.mantencionSec / 60))), cx, y + gh + 13, { align: 'center' })
  })
  doc.setDrawColor(...C.tinta).setLineWidth(0.3).line(izq, y + gh, W - M, y + gh)
  doc.setDrawColor(...C.fila).setLineWidth(0.25).line(M, y + gh + 8, W - M, y + gh + 8)
  doc.setFontSize(T.chico).setFont('helvetica', 'normal').setTextColor(...C.gris)
  doc.text('Turno', M, y + gh + 5)
  doc.text('Min de Mantención', M, y + gh + 13)
  L.y = y + gh + 20

  const notas = []
  if (banda) notas.push('La franja gris es lo que estos turnos varían entre sí: un turno dentro de ella es normal, sin reproche y sin celebrarlo.')
  else notas.push('Con menos de 3 turnos equivalentes la comparación es solo referencia.')
  if (c.filas.some((f) => f.mantencionSec == null)) notas.push('«–» = turno sin resumen guardado al cierre.')
  parrafo(L, notas.join(' '), { tamano: T.chico + 1, color: C.gris })
}

function lamina5Cierre(L, d, t) {
  crearLamina(L, { pestania: 'Cierre', titulo: 'Para leer en la reunión' })
  parrafo(L, `${t.veredicto} ${t.detalle}`, { tamano: T.cuerpo + 2, ancho: 200, filete: true })
  L.y += 4
  rotulo(L, 'Queda abierto')
  const abiertos = [...t.abiertos]
  if (d.resumen.scrapTotal === 0) {
    abiertos.push({
      rotulo: 'Calidad del OEE:',
      texto: 'sale 100 % porque Shoplogix no informa rechazo para estas máquinas; no se midió, así que ese 100 % no es un resultado.',
    })
  }
  if (!abiertos.length) abiertos.push({ rotulo: 'Nada pendiente:', texto: 'todas las detenciones tienen causal reconocida.' })
  for (const a of abiertos) parrafoRotulado(L, a.rotulo, a.texto, { ancho: 230 })
  L.y += 3
  rotulo(L, 'Lo que este informe no dice')
  parrafo(L, 'Cuántas piezas se habrían hecho sin las fallas. Ese número supone que había materia prima esperando y que todo '
    + 'lo demás se habría comportado igual: un turno que no ocurrió.', { tamano: T.cuerpo, ancho: 230 })

  // El pie va en la ÚLTIMA hoja de la lámina, que con pendientes largos puede no ser esta.
  const { doc } = L
  doc.setFontSize(T.rotulo).setTextColor(...C.gris).setFont('helvetica', 'normal')
  doc.text(wa(`Datos de Shoplogix, planta ${d.meta.planta}. Los tiempos son hora de planta. Generado automáticamente desde la PWA de Mantención.`), M, H - 8)
}

/**
 * Anexo: cómo se cuentan los minutos. Existe para corregir el doble conteo del
 * rollup de Shoplogix, que suma las máquinas del área. Con UNA sola máquina no
 * hay nada que corregir —suma, unión, todas y equivalente son el mismo número—
 * y la lámina no se dibuja: una lámina que argumenta algo que su propia tabla
 * desmiente le quita autoridad al resto del informe.
 */
function lamina6Anexo(L, d) {
  const r = d.resumen
  if (r.maquinas <= 1) return
  crearLamina(L, {
    pestania: 'Anexo',
    titulo: 'Cómo se cuentan los minutos',
    subtitulo: `El resumen de área de Shoplogix suma las ${r.maquinas} máquinas; este informe no`,
  })
  const causas = r.causas.filter((c) => !c.esMicro)
  const micro = r.causas.find((c) => c.esMicro)
  tabla(L, [
    { t: 'Causa', ancho: 85 },
    { t: 'Suma de máquinas', ancho: 38, alinear: 'der' },
    { t: 'Al menos 1 parada', ancho: 38, alinear: 'der' },
    { t: `Las ${r.maquinas} paradas`, ancho: 34, alinear: 'der' },
    { t: 'Min de línea', ancho: 46, alinear: 'der' },
    { t: 'Det.', ancho: 24, alinear: 'der' },
  ], causas.map((c) => ({
    celdas: [c.imputacion && c.imputacion.hoja ? c.imputacion.hoja : c.causa, dur(c.sumaSec), dur(c.unionSec), dur(c.todasSec), dur(c.equivalenteLineaSec), String(c.eventos)],
    sub: c.imputacion ? c.imputacion.categoriaLabel : null,
    colores: [null, C.gris, null, null, null, null],
    negrita: [false, false, false, false, true, false],
  })), {
    cierre: {
      celdas: ['Total con micro detenciones', dur(r.detencion.sumaSec), dur(r.detencion.unionSec), dur(r.detencion.todasSec), dur(r.detencion.equivalenteLineaSec), ''],
    },
  })
  if (micro) {
    parrafo(L, `Incluye ${num(micro.eventos)} micro detenciones (${dur(micro.equivalenteLineaSec)} de línea): paros de segundos `
      + 'que el sistema no pide imputar. Se cuentan, pero no compiten con las causas de arriba.', { tamano: T.chico + 0.5, color: C.gris })
  }
  const p = causas[0]
  if (p && p.sumaSec > p.equivalenteLineaSec) {
    parrafo(L, `${p.imputacion && p.imputacion.hoja ? p.imputacion.hoja : p.causa} aparece con ${dur(p.sumaSec)} en el resumen de área `
      + `porque se suma en cada máquina. La línea perdió ${dur(p.equivalenteLineaSec)} de capacidad y estuvo entera detenida `
      + `${dur(p.todasSec)}. Citar la suma multiplica la falla por el número de máquinas que tocó.`,
    { titulo: 'Por qué importa', tamano: T.chico + 1.5, ancho: 230 })
  }
}

/**
 * Estampa "hoja / total" cuando ya se sabe el total. No se puede hacer al
 * dibujar la cabecera: el número de hojas depende de cuántas filas tuvo el turno.
 */
function numerar(doc) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(T.rotulo).setTextColor(...C.gris).setFont('helvetica', 'bold')
    doc.text(wa(`${p} / ${total}`), W - M, 10, { align: 'right' })
  }
}

/** Anota cada `doc.text` para poder auditar la maqueta desde un test. */
function instrumentar(doc, registro) {
  const original = doc.text.bind(doc)
  doc.text = (txt, x, y, opciones) => {
    const lineas = Array.isArray(txt) ? txt : [txt]
    registro.push({
      texto: lineas.join(' '),
      x,
      y,
      yFin: y + (lineas.length - 1) * doc.getLineHeight(),
      pagina: doc.getCurrentPageInfo().pageNumber,
    })
    return original(txt, x, y, opciones)
  }
  return doc
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/**
 * Datos guardados antes de que existieran `porDueno` y `fallas` (o armados a
 * mano en un test) se completan con lo mínimo: el reparto por dueño sale de
 * las causas, y sin máquinas no hay fallas por máquina que mostrar.
 */
function completar(d) {
  return {
    ...d,
    porDueno: d.porDueno || perdidaPorDueno(d.resumen.causas || []),
    fallas: d.fallas || { filas: [], totalMin: 0, eventos: 0 },
    cronologia: d.cronologia || [],
  }
}

/**
 * Genera el PDF y devuelve un Buffer.
 *
 * No toca Firestore ni la red: recibe los datos ya calculados. Así se puede
 * probar sin credenciales y se puede regenerar un informe viejo con los datos
 * que se guardaron, sin depender de que Shoplogix siga respondiendo lo mismo.
 *
 * @param {object} d  ver `construirDatosInforme` en informeTurno.js
 * @param {object} [opciones]
 * @param {Array}  [opciones.registro]  si viene, se llena con todo lo escrito
 *        ({ texto, x, y, yFin, pagina }). Es la única forma de verificar en un
 *        test que nada quedó bajo el borde, porque jsPDF lo descarta sin avisar.
 * @returns {Buffer}
 */
function generarInformeTurno(d, { registro } = {}) {
  // Carga diferida: jsPDF pesa y no todas las invocaciones de la function
  // generan un PDF.
  // eslint-disable-next-line global-require
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({
    title: `Informe de turno - ${d.meta.areaLabel} - ${d.meta.fechaLabel}`,
    creator: 'PWA Mantención',
  })
  if (registro) instrumentar(doc, registro)

  const datos = completar(d)
  const t = textosCorreo(datos)
  const L = abrirLienzo(doc, datos)
  lamina1Veredicto(L, datos, t)
  lamina2Fallas(L, datos)
  lamina3Ritmo(L, datos)
  lamina4Cotejo(L, datos)
  lamina5Cierre(L, datos, t)
  lamina6Anexo(L, datos)
  numerar(doc)

  return Buffer.from(doc.output('arraybuffer'))
}

module.exports = { generarInformeTurno, wa, dur, durTexto, hhmm, TOTAL_LAMINAS, Y_FIN, H }
