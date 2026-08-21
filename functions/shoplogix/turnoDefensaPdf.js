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

/**
 * "1 maquina" / "3 maquinas". Parece cosmetico y no lo es: el informe de Filete
 * decia "1 maquinas" en la cabecera y "LAS 1 - linea muerta" en el grafico, y
 * cualquiera que lo lea deja de creerle al resto de las cifras.
 */
const maquinasTexto = (n) => (n === 1 ? '1 maquina' : `${n} maquinas`)

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

// ── Maquetación con flujo ────────────────────────────────────────────────────
//
// ⚠ jsPDF DESCARTA en silencio lo que se dibuja bajo el borde inferior de la
// hoja: no lo recorta ni avisa, simplemente no queda en el PDF. Verificado el
// 2026-08-20 con un texto en y=260 mm sobre una hoja de 210 mm.
//
// Por eso la maqueta no puede ir sumando `y` a ojo, que es lo que hacía. En los
// 8 informes que se revisaron ese día la lámina 4 se pasaba del borde SIEMPRE, y
// con ella se perdían los KPI de ocupación de la cadena, la nota de cómo leer el
// reparto y la nota que declara lo que el informe NO afirma. El PDF salía bien
// formado y el bloque no estaba: nada lo delataba salvo mirar la hoja.
//
// Regla nueva: todo bloque pide espacio ANTES de dibujarse. Si no cabe, la
// lámina sigue en una página de continuación. Antes una página de más que un
// dato de menos — este informe se defiende en una reunión.

const W = 297 // A4 apaisado
const H = 210
const M = 16 // margen
const Y_FIN = H - 12 // última línea útil del cuerpo

/** Estado de maquetación: la hoja en curso y hasta dónde se llenó. */
function abrirLienzo(doc) {
  return { doc, y: 0, paginas: 0, pestania: '', titulo: '' }
}

/** Cabecera de hoja. El número de página se estampa al final, en `numerar`. */
function encabezado(doc, { pestania, titulo, subtitulo }) {
  doc.setFillColor(...C.acento)
  doc.rect(0, 0, W, 7, 'F')
  doc.setFontSize(7.5).setTextColor(255, 255, 255).setFont('helvetica', 'bold')
  doc.text(wa(pestania.toUpperCase()), M, 4.8)

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

/** Abre una lámina nueva. */
function crearLamina(L, { pestania, titulo, subtitulo }) {
  if (L.paginas > 0) L.doc.addPage()
  L.paginas += 1
  L.pestania = pestania
  L.titulo = titulo
  L.y = encabezado(L.doc, { pestania, titulo, subtitulo })
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
  // Cabecera compacta: repetir el título a 19 pt cuesta 38 mm de hoja y hacía
  // que una nota de 24 mm se quedara sola en una página entera. Basta con decir
  // de qué lámina viene.
  doc.setFillColor(...C.acento)
  doc.rect(0, 0, W, 7, 'F')
  doc.setFontSize(7.5).setTextColor(255, 255, 255).setFont('helvetica', 'bold')
  doc.text(wa(`${L.pestania} (cont.)`.toUpperCase()), M, 4.8)
  doc.setTextColor(...C.tinta3).setFontSize(9).setFont('helvetica', 'normal')
  doc.text(wa(`${L.titulo} - continuación`), M, 15)
  doc.setDrawColor(...C.linea).setLineWidth(0.3)
  doc.line(M, 18, W - M, 18)
  L.y = 24
  return L.y
}

/** Reserva `alto` mm. Devuelve la `y` donde se puede dibujar de verdad. */
function sitio(L, alto) {
  if (L.y + alto > Y_FIN) continuar(L)
  return L.y
}

/** Cuánto queda hasta el borde útil. */
const resto = (L) => Y_FIN - L.y

// ── Primitivas de lámina ─────────────────────────────────────────────────────

/** Caja de cifra grande. Alto fijo: 24 mm. */
const ALTO_KPI = 24

function kpi(doc, x, y, ancho, { rotulo, valor, sub, color = C.tinta }) {
  doc.setDrawColor(...C.linea).setLineWidth(0.3).rect(x, y, ancho, ALTO_KPI)
  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
  doc.text(wa(rotulo.toUpperCase()), x + 4, y + 6)
  doc.setFontSize(17).setFont('helvetica', 'bold').setTextColor(...color)
  doc.text(wa(valor), x + 4, y + 15)
  if (sub) {
    doc.setFontSize(7.5).setFont('helvetica', 'normal').setTextColor(...C.tinta2)
    doc.text(wa(sub), x + 4, y + 20.5)
  }
}

/** Fila de cajas repartidas a lo ancho, pidiendo espacio antes. */
function filaKpis(L, cajas, { ancho = W - M * 2 } = {}) {
  if (!cajas.length) return L.y
  const y = sitio(L, ALTO_KPI)
  const cw = (ancho - 3 * (cajas.length - 1)) / cajas.length
  cajas.forEach((c, i) => kpi(L.doc, M + i * (cw + 3), y, cw, c))
  L.y = y + ALTO_KPI + 3
  return L.y
}

/** Alto que va a ocupar una nota, sin dibujarla. */
function altoNota(doc, ancho, texto, { tamano = 8.5, titulo } = {}) {
  const lineas = doc.setFontSize(tamano).setFont('helvetica', 'normal').splitTextToSize(wa(texto), ancho - 10)
  return { lineas, alto: lineas.length * (tamano * 0.42) + (titulo ? 6 : 0) + 7 }
}

/**
 * Bloque de texto con fondo, para las notas y el veredicto.
 *
 * Si no cabe entera se pasa a la hoja siguiente completa, en vez de partirse:
 * media nota explicativa confunde más que la nota en la página de al lado.
 */
function nota(L, texto, { color = C.linea, tamano = 8.5, titulo, ancho = W - M * 2, x = M } = {}) {
  const { doc } = L
  const { lineas, alto } = altoNota(doc, ancho, texto, { tamano, titulo })
  const y = sitio(L, alto)
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
  L.y = y + alto + 5
  return L.y
}

const ALTO_FILA = 7

function cabeceraTabla(doc, x, y, cols) {
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
  return y + 2
}

/**
 * Tabla que fluye. `cols` = [{ t, ancho, alinear }].
 *
 * Cuando no caben todas las filas sigue en la hoja siguiente y REPITE la
 * cabecera: una tabla decapitada en la segunda hoja es ilegible en una reunión.
 * Ninguna fila se descarta — la tabla de caídas del turno del 20-08 en Filete
 * tenía 14 y solo entraban 5.
 */
function tabla(L, cols, filas, { resaltar = -1, x = M } = {}) {
  const { doc } = L
  const ancho = cols.reduce((a, c) => a + c.ancho, 0)
  let i = 0
  let vueltas = 0
  do {
    // Cinturón: `sitio` siempre deja la hoja en y=24 y ahí caben filas, así que
    // el bucle avanza sí o sí. El tope es por si alguien cambia esa invariante:
    // una Cloud Function colgada a las 5 de la mañana no deja informe ni error.
    vueltas += 1
    if (vueltas > filas.length + 10) break
    // Cabecera + al menos dos filas, si no la continuación no aporta nada.
    const y = sitio(L, 2 + ALTO_FILA * Math.min(2, filas.length - i))
    let fy = cabeceraTabla(doc, x, y, cols)
    while (i < filas.length && fy + ALTO_FILA <= Y_FIN) {
      const f = filas[i]
      if (i === resaltar) doc.setFillColor(224, 238, 241).rect(x, fy, ancho, ALTO_FILA, 'F')
      let cx = x
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
      fy += ALTO_FILA
      doc.setDrawColor(...C.linea).line(x, fy, x + ancho, fy)
      i += 1
    }
    L.y = fy + 5
  } while (i < filas.length)
  return L.y
}

/** Línea suelta de texto chico, pidiendo espacio. */
function pie(L, texto, { tamano = 7.5, color = C.tinta3, ancho = W - M * 2 } = {}) {
  const { doc } = L
  const lineas = doc.setFontSize(tamano).setFont('helvetica', 'normal').splitTextToSize(wa(texto), ancho)
  const alto = lineas.length * (tamano * 0.42) + 3
  const y = sitio(L, alto)
  doc.setTextColor(...color)
  doc.text(lineas, M, y + 3)
  L.y = y + alto + 3
  return L.y
}

/** Rótulo en negrita sobre un gráfico. */
function rotulo(L, texto, { alto = 6 } = {}) {
  const y = sitio(L, alto)
  L.doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(...C.tinta)
  L.doc.text(wa(texto), M, y + 4)
  L.y = y + alto
  return L.y
}

// ── Láminas ──────────────────────────────────────────────────────────────────

// Seis láminas de narrativa. Las HOJAS pueden ser más: una lámina con muchas
// filas se continúa en vez de perder el final.
const TOTAL_LAMINAS = 6

function lamina1Veredicto(L, d) {
  crearLamina(L, {
    pestania: 'Veredicto',
    titulo: `${d.meta.areaLabel} - ${d.meta.turnoLabel}`,
    subtitulo: `${d.meta.fechaLabel} - ${hhmm(d.resumen.inicioMs)} a ${hhmm(d.resumen.finMs)} - ${maquinasTexto(d.resumen.maquinas)}`,
  })

  nota(L, d.textos.veredictoDetalle, {
    color: d.textos.veredictoBueno ? C.ok : C.atencion,
    tamano: 10,
    titulo: d.textos.veredictoTitulo,
  })

  filaKpis(L, [
    {
      rotulo: 'Produccion', valor: num(d.resumen.ciclos), sub: d.textos.produccionSub,
      color: d.textos.veredictoBueno ? C.ok : C.tinta,
    },
    {
      rotulo: 'Ritmo normal de la linea',
      valor: d.resumen.ritmoNormal ? `${d.resumen.ritmoNormal.toFixed(1)}` : '--',
      sub: 'piezas por minuto sin problemas',
    },
    {
      rotulo: 'Linea detenida', valor: durTexto(d.resumen.detencion.todasSec),
      sub: d.resumen.maquinas === 1 ? 'sin producir' : 'todas las maquinas a la vez', color: C.atencion,
    },
    {
      rotulo: 'Atribuible a Mantencion',
      valor: durTexto(d.resumen.mantencionEquivSec),
      sub: `de ${durTexto(d.resumen.detencion.equivalenteLineaSec)} perdidos`,
    },
  ])

  L.y += 3
  if (d.resumen.causas[0]) {
    nota(L, d.textos.notaLamina1, { color: C.acento, titulo: 'Por que esta lamina va primero' })
  }
}

function lamina2Falla(L, d) {
  /*
   * ⚠ Esta lamina existe para corregir el doble conteo del rollup de Shoplogix,
   * que suma las maquinas del area. Con UNA sola maquina no hay nada que
   * corregir: suma, union, todas y equivalente son el MISMO numero, y la lamina
   * quedaba explicando un doble conteo inexistente mientras mostraba cuatro
   * columnas identicas — 1:17:50 cuatro veces en el informe de Filete del 20-08.
   * Eso no es un detalle de formato: una lamina que argumenta algo que su propia
   * tabla desmiente le quita autoridad a todo el resto del informe.
   *
   * Con una maquina la lamina cambia de trabajo: deja de corregir y pasa a
   * detallar las detenciones, que es lo que si tiene para decir.
   */
  const unaSolaMaquina = d.resumen.maquinas === 1

  crearLamina(L, {
    pestania: unaSolaMaquina ? 'Las detenciones' : 'La falla, medida bien',
    titulo: unaSolaMaquina ? 'En que se fue el tiempo detenido' : 'Horas-maquina no son horas de linea',
    subtitulo: unaSolaMaquina
      ? 'La linea es una sola maquina: cada minuto detenido es un minuto sin producir'
      : `El resumen de area de Shoplogix suma las ${d.resumen.maquinas} maquinas`,
  })

  const cols = unaSolaMaquina
    ? [
      { t: 'Causa', ancho: 84 },
      { t: 'Categoria', ancho: 52 },
      { t: 'Linea detenida', ancho: 34, alinear: 'der' },
      { t: 'Eventos', ancho: 24, alinear: 'der' },
      { t: 'Promedio', ancho: 28, alinear: 'der' },
    ]
    : [
      { t: 'Causa', ancho: 62 },
      { t: 'Categoria', ancho: 38 },
      { t: 'Suma del area', ancho: 30, alinear: 'der' },
      { t: 'Al menos 1', ancho: 26, alinear: 'der' },
      { t: 'Todas', ancho: 24, alinear: 'der' },
      { t: 'Equiv. linea', ancho: 28, alinear: 'der' },
      { t: 'Eventos', ancho: 20, alinear: 'der' },
    ]
  // Las micro detenciones van al pie, no en la tabla: son cientos de eventos de
  // segundos que inflan la tabla y compiten visualmente con la falla que
  // importa. Se resumen en una linea, que es lo que aportan.
  const micro = d.resumen.causas.find((c) => c.esMicro)
  const causasReales = d.resumen.causas.filter((c) => !c.esMicro)
  const filas = causasReales.map((c) => {
    const nombre = c.imputacion && c.imputacion.hoja ? c.imputacion.hoja : c.causa
    const categoria = c.imputacion ? c.imputacion.categoriaLabel : '--'
    /* El promedio por evento reemplaza a las columnas que sobran: separa una
       averia larga de muchas paradas cortas, que suman igual y se atacan
       distinto. Es lo unico que la tabla de una maquina no decia. */
    if (unaSolaMaquina) {
      return {
        celdas: [nombre, categoria, dur(c.equivalenteLineaSec), String(c.eventos),
          c.eventos ? dur(Math.round(c.equivalenteLineaSec / c.eventos)) : '--'],
        colores: [null, [...C.tinta3], null, null, null],
      }
    }
    return {
      celdas: [nombre, categoria,
        dur(c.sumaSec), dur(c.unionSec), dur(c.todasSec), dur(c.equivalenteLineaSec), String(c.eventos)],
      colores: [null, null, [...C.tinta3], null, null, null, null],
    }
  })
  filas.push({
    celdas: unaSolaMaquina
      ? ['TOTAL (con micro detenciones)', '', dur(d.resumen.detencion.equivalenteLineaSec), '', '']
      : [
        'TOTAL (con micro detenciones)', '',
        dur(d.resumen.detencion.sumaSec), dur(d.resumen.detencion.unionSec),
        dur(d.resumen.detencion.todasSec), dur(d.resumen.detencion.equivalenteLineaSec), '',
      ],
  })
  tabla(L, cols, filas, { resaltar: 0 })

  if (micro) {
    pie(L, `Aparte: ${micro.eventos} micro detenciones, ${dur(micro.sumaSec)} sumados `
      + `(${dur(micro.equivalenteLineaSec)} de linea). Son paros de segundos que el sistema no pide imputar; `
      + 'se cuentan pero no compiten con las causas de arriba.')
  }

  // Barra del reparto por nivel de solapamiento de la causa principal.
  const p = d.resumen.causas[0]
  // Con UNA maquina no hay solapamiento que repartir: la barra seria un
  // rectangulo lleno etiquetado "LAS 1 - linea muerta", que no explica nada y
  // ademas esta mal escrito.
  if (p && p.unionSec > 0 && d.resumen.maquinas > 1) {
    const y = sitio(L, 30)
    L.y = y
    rotulo(L, `Reparto de los ${durTexto(p.unionSec)} en que hubo alguna maquina detenida por ${p.imputacion && p.imputacion.hoja ? p.imputacion.hoja : p.causa}`)
    const { doc } = L
    const ancho = W - M * 2
    const by = L.y + 2
    let acc = 0
    for (let k = 1; k < p.porNivelSec.length; k++) {
      const sec = p.porNivelSec[k]
      if (!sec) continue
      const w = (sec / p.unionSec) * ancho
      const alpha = k / (p.porNivelSec.length - 1)
      doc.setFillColor(
        Math.round(255 - (255 - C.crit[0]) * alpha),
        Math.round(255 - (255 - C.crit[1]) * alpha),
        Math.round(255 - (255 - C.crit[2]) * alpha),
      )
      doc.rect(M + acc, by, Math.max(w - 0.6, 0.6), 11, 'F')
      doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta)
      const etiqueta = k === p.porNivelSec.length - 1 ? `LAS ${k} - linea muerta` : `${k} detenida${k > 1 ? 's' : ''}`
      if (w > 24) {
        doc.text(wa(etiqueta), M + acc + 2, by + 15)
        doc.setFont('helvetica', 'normal').setTextColor(...C.tinta2)
        doc.text(wa(dur(sec)), M + acc + 2, by + 19)
      }
      acc += w
    }
    L.y = by + 24
  }

  nota(L, d.textos.notaLamina2, { color: C.acento, titulo: 'Como leer esta tabla' })
}

function lamina3Cronologia(L, d) {
  const p = d.resumen.causas[0]
  crearLamina(L, {
    pestania: 'Cronologia',
    titulo: p ? `Donde ocurrio: ${p.imputacion && p.imputacion.hoja ? p.imputacion.hoja : p.causa}` : 'Sin detenciones que ubicar',
    subtitulo: p ? `${p.eventos} eventos en el turno` : '',
  })
  if (!p) {
    nota(L, 'El turno no registro detenciones no programadas.', { color: C.ok })
    return
  }

  const { doc } = L
  const t0 = d.resumen.inicioMs
  const t1 = d.resumen.finMs
  const span = t1 - t0
  const izq = M + 42
  const anchoPista = W - M - izq
  const altoPista = 11
  const gap = 6
  const n = d.eventosPorMaquina.length
  const altoBloque = n * (altoPista + gap) + 12
  let py = sitio(L, altoBloque) + 6

  const sx = (ms) => izq + ((ms - t0) / span) * anchoPista

  // Rejilla horaria
  const primera = Math.ceil(t0 / 3_600_000) * 3_600_000
  for (let t = primera; t <= t1; t += 3_600_000) {
    doc.setDrawColor(...C.linea).setLineWidth(0.2)
    doc.line(sx(t), py - 3, sx(t), py + n * (altoPista + gap))
    doc.setFontSize(6.5).setTextColor(...C.tinta3).setFont('helvetica', 'normal')
    doc.text(wa(hhmm(t)), sx(t), py + n * (altoPista + gap) + 4, { align: 'center' })
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
  L.y = py + 8

  nota(L, d.textos.notaLamina3, { color: C.acento, titulo: 'Para que sirve en la reunion' })
}

/**
 * La lámina que se salía de la hoja.
 *
 * Apila gráfico, tabla de tramos, barra del reparto, tabla de caídas, KPI de
 * recuperación, KPI de ocupación y tres notas. Con 9 tramos y 14 caídas eso son
 * dos hojas largas, y antes se dibujaba todo en una sumando `y` a ojo: lo que
 * pasaba del borde desaparecía. El orden es de más a menos defendible, así que
 * si algo queda en la segunda hoja, que sea el detalle y no el veredicto.
 */
function lamina4Ritmo(L, d) {
  crearLamina(L, {
    pestania: 'Donde afecto y como se contuvo',
    titulo: d.textos.tituloLamina4 || 'El ritmo real del turno, tramo por tramo',
    subtitulo: d.resumen.ritmoNormal
      ? `Ritmo normal de la linea: ${d.resumen.ritmoNormal.toFixed(1)} piezas por minuto (mediana de los bloques limpios de este mismo turno)`
      : 'Sin bloques limpios: no se puede fijar un ritmo normal',
  })
  const { doc } = L
  const ancho = W - M * 2

  // Gráfico de barras del ritmo por bloque
  const gh = 46
  const gy = sitio(L, gh + 8)
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
  L.y = gy + gh + 10

  tabla(L, [
    { t: 'Tramo', ancho: 42 },
    { t: 'Ventana', ancho: 34 },
    { t: 'Minutos', ancho: 24, alinear: 'der' },
    { t: 'Piezas', ancho: 26, alinear: 'der' },
    { t: 'Piezas/min', ancho: 28, alinear: 'der' },
    { t: '% del ritmo normal', ancho: 40, alinear: 'der' },
  ], d.tramos.map((t) => ({
    celdas: [
      t.enRitmo ? 'En ritmo' : 'Caida',
      `${hhmm(t.inicioMs)} a ${hhmm(t.finMs)}`,
      String(t.minutos), num(t.ciclos), t.piezasPorMin.toFixed(1),
      `${Math.round(t.pctDelRitmo * 100)}%`,
    ],
    colores: [t.enRitmo ? [...C.ok] : [...C.crit], null, null, null, null,
      t.enRitmo ? [...C.ok] : [...C.crit]],
  })))

  // ── Reparto de la perdida: parada / reenganche / degradado ───────────────
  const rp = d.reparto || { totalPz: 0, eventos: [] }
  if (rp.totalPz > 0) {
    // La barra y sus etiquetas son un solo bloque: partirlas deja los
    // porcentajes huérfanos en la hoja siguiente.
    L.y = sitio(L, 30)
    rotulo(L, rp.eventos.length
      ? 'Donde falto la produccion: las piezas que faltaron para el ritmo normal, segun en que estaba la linea'
      : 'El turno no registro caidas de linea. Las piezas que faltaron para el ritmo normal se perdieron andando:')
    const by = L.y
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
    L.y = by + bh + 14

    if (rp.eventos.length) {
      tabla(L, [
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

  filaKpis(L, d.recuperaciones.map((r) => ({
    rotulo: `Recuperacion - ${r.causa}`,
    valor: r.minutos == null ? 'no volvio' : `${r.minutos} min`,
    sub: r.minutos == null ? 'la linea no recupero el ritmo' : `ultimo evento ${hhmm(r.desdeMs)}, ritmo a las ${hhmm(r.volvioMs)}`,
    color: r.minutos == null ? C.crit : C.ok,
  })))

  // Ocupacion de la cadena: la traduccion de la "perdida de velocidad".
  const oc = d.ocupacion
  if (oc && oc.ocupacion != null) {
    const pct = Math.round(oc.ocupacion * 100)
    filaKpis(L, [
      {
        rotulo: d.meta.planta === 'filete' ? 'Silletas llenas' : 'Capacidad usada',
        valor: `${pct}%`,
        sub: `${num(oc.llenas)} de ${num(oc.pasaron)} a ${oc.ritmoNominal} pz/min`,
        color: pct >= 80 ? C.ok : pct >= 55 ? C.tinta : C.atencion,
      },
      {
        rotulo: d.meta.planta === 'filete' ? 'Silletas vacias' : 'Capacidad sin usar',
        valor: num(oc.vacias),
        sub: 'lo que Shoplogix llama perdida de velocidad',
        color: C.atencion,
      },
      {
        rotulo: 'Cadena en marcha',
        valor: durTexto(oc.minutosEnMarcha * 60),
        sub: 'solo este tiempo deja pasar capacidad',
      },
    ])
    if (d.textos.notaOcupacion) {
      nota(L, d.textos.notaOcupacion, {
        color: C.acento,
        titulo: d.meta.planta === 'filete' ? 'La "perdida de velocidad", traducida' : 'Sobre la "perdida de velocidad"',
      })
    }
  }

  if (d.textos.notaReparto) {
    nota(L, d.textos.notaReparto, { color: C.acento, titulo: 'Como leer el reparto' })
  }
  nota(L, d.textos.notaLamina4, { color: C.acento, titulo: 'Lo que estos numeros si prueban' })
}

function lamina5Cotejo(L, d) {
  crearLamina(L, {
    pestania: 'Cotejo',
    titulo: `Contra los ${d.cotejo.comparados} turnos equivalentes anteriores`,
    subtitulo: 'Turnos del mismo horario y duracion, con produccion real',
  })
  const { doc } = L
  const ancho = W - M * 2

  if (!d.cotejo.comparados) {
    nota(L, 'No hay suficientes turnos equivalentes anteriores para cotejar. El informe no emite veredicto comparativo.', { color: C.atencion })
    return
  }

  const gh = 60
  const y = sitio(L, gh + 12)
  const maxC = Math.max(...d.cotejo.filas.map((f) => f.ciclos || 0), 1)
  const conDet = d.cotejo.filas.filter((f) => typeof f.detencionLineaSec === 'number')
  const maxDet = Math.max(...conDet.map((f) => f.detencionLineaSec), 0)
  const bw = ancho / d.cotejo.filas.length
  d.cotejo.filas.forEach((f, i) => {
    const h = ((f.ciclos || 0) / maxC) * gh
    doc.setFillColor(...(f.esReferencia ? C.acento : [150, 180, 188]))
    doc.rect(M + i * bw + bw * 0.15, y + gh - h, bw * 0.7, h, 'F')
    doc.setFontSize(7).setFont('helvetica', f.esReferencia ? 'bold' : 'normal').setTextColor(...C.tinta2)
    doc.text(wa(num(f.ciclos)), M + i * bw + bw * 0.5, y + gh - h - 2, { align: 'center' })
    doc.setTextColor(...(f.esReferencia ? C.tinta : C.tinta3))
    doc.text(wa(f.id.slice(5, 10)), M + i * bw + bw * 0.5, y + gh + 5, { align: 'center' })

    // Detencion de linea de ese turno, cuando esta cacheada. Va como barra
    // fina encima de la de produccion: la pregunta que responde es "este turno
    // tuvo mas falla de lo normal", y para eso hay que ver las dos juntas.
    if (typeof f.detencionLineaSec === 'number' && maxDet > 0) {
      const hd = (f.detencionLineaSec / maxDet) * (gh * 0.35)
      doc.setFillColor(...C.crit)
      doc.rect(M + i * bw + bw * 0.15 + bw * 0.7 + 1, y + gh - hd, bw * 0.16, hd, 'F')
    }
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
  L.y = y + gh + 8

  pie(L, conDet.length > 1
    ? `Barra ancha: ciclos producidos. Barra fina roja: detencion de linea (${conDet.length} de ${d.cotejo.filas.length} turnos la tienen calculada).`
    : 'Barra ancha: ciclos producidos. La detencion de los turnos previos aparecera a medida que se vayan cerrando con el informe activo.',
  { tamano: 7 })

  nota(L, d.textos.notaLamina5, { color: C.acento, titulo: 'Que dice esta comparacion' })
}

function lamina6Cierre(L, d) {
  crearLamina(L, {
    pestania: 'Cierre',
    titulo: 'Lo que se dice en la reunion',
    subtitulo: 'Texto listo para leer, y lo que queda comprometido',
  })
  const { doc } = L
  const ancho = W - M * 2
  nota(L, d.textos.parrafoReunion, { color: C.acento, tamano: 10 })

  const yTit = sitio(L, 12)
  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...C.tinta3)
  doc.text(wa('LO QUE QUEDA ABIERTO'), M, yTit + 4)
  L.y = yTit + 8

  for (const p of d.textos.pendientes) {
    doc.setFontSize(8.5).setFont('helvetica', 'normal')
    const lineas = doc.splitTextToSize(wa(`- ${p}`), ancho - 4)
    const alto = lineas.length * 4 + 2
    const y = sitio(L, alto)
    doc.setTextColor(...C.tinta2)
    doc.text(lineas, M + 2, y)
    L.y = y + alto
  }

  // El pie va en la ULTIMA hoja, que con pendientes largos puede no ser esta.
  doc.setFontSize(7).setTextColor(...C.tinta3).setFont('helvetica', 'normal')
  doc.text(wa(d.textos.pieDeFuente), M, H - 10)
}

/**
 * Estampa "hoja / total" cuando ya se sabe el total. No se puede hacer al
 * dibujar la cabecera: el número de hojas depende de cuántos tramos y caídas
 * tuvo el turno.
 */
function numerar(doc) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5).setTextColor(255, 255, 255).setFont('helvetica', 'bold')
    doc.text(wa(`${p} / ${total}`), W - M, 4.8, { align: 'right' })
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
    creator: 'PWA Mantencion',
  })
  if (registro) instrumentar(doc, registro)

  const L = abrirLienzo(doc)
  lamina1Veredicto(L, d)
  lamina2Falla(L, d)
  lamina3Cronologia(L, d)
  lamina4Ritmo(L, d)
  lamina5Cotejo(L, d)
  lamina6Cierre(L, d)
  numerar(doc)

  return Buffer.from(doc.output('arraybuffer'))
}

module.exports = { generarInformeTurno, wa, dur, durTexto, hhmm, TOTAL_LAMINAS, Y_FIN, H }
