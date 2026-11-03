/**
 * Todos los textos que el monitor muestra de las causas de las micro detenciones (resumen bajo el carril «Micro», globo de la micro, ayuda ⓘ).
 *
 * Un solo módulo para que se puedan revisar juntos y para que una prueba (`__tests__/textosCausas.test.ts`) exija que ninguno diga lo que la
 * planta decidió no decir (spec del PR 3, 03-11-2026): las micro nunca ocurren porque sí, solo que los datos de hoy todavía no explican por qué, y
 * una micro también es una detención. Vocabulario:
 *  · «causa probable»: el estimado agregado, lo que supera lo habitual del turno (la calibración de `causasCalibracion.ts`).
 *  · «causa posible»: la micro coincidió con eso, pero esa coincidencia es común y no alcanza para explicarla.
 *
 * Lógica pura: no importa React. Los tipos vienen de `microCausa.ts` (solo tipos: no hay ciclo en tiempo de ejecución).
 */
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { dec1 } from '@/utils/formatoNumeros'
import { fechaDMA, SEMANAS_VENTANA, type CalibracionPlanta, type MotivoObservacion, type ParametrosCausas } from './causasCalibracion'
import type { CausaMicro, EvidenciaMicro, FormaMicro, ModoLinea } from './microCausa'
import { cronometro } from './ritmoVivo'

// ── Formatos ─────────────────────────────────────────────────────────────────

/** Espacio duro: «45 s», «9,5 min», «~7 de 18» y «Ev 1» no se parten entre dos renglones. */
export const NB = '\u00a0'
export const conNB = (texto: string) => texto.replace(/ /g, NB)
export const seg = (s: number) => `${Math.round(s)}${NB}s`
/** Una duración como en el resto del monitor (`cronometro`): «45 s», «2 min 15 s», «10 min», «1 h 02 min». Exacta, nunca en minutos con decimal. */
export const dur = (s: number) => {
  const t = Math.round(s)
  return t < 60 ? seg(t) : conNB(cronometro(t).replace(/ 00 s$/, ''))
}
/** «9,5 min»: un tiempo corrido entre dos cosas. */
export const minTxt = (min: number) => {
  const r = Math.round(min * 10) / 10
  return `${Number.isInteger(r) ? r.toLocaleString('es-CL') : dec1(r)}${NB}min`
}
export const deDe = (a: number | string, b: number | string) => `${a}${NB}de${NB}${b}`
/** Segundos con coma si hace falta: 22500 ms → «22,5», 52500 → «52,5», 15000 → «15». */
const segDeMs = (ms: number) => (Number.isInteger(ms / 1000) ? String(ms / 1000) : dec1(ms / 1000))
/** «a 4 min»: minutos enteros. */
const minEntero = (min: number) => `${Math.round(min)}${NB}min`
/** Cuántos segundos no anota Shoplogix de cada micro (real ≈ anotado + ~20 s). */
export const OCULTO_S = 20
/** Cuánto atrasa Shoplogix en anotar una micro (15-30 s después de que dejan de pasar pescados). */
export const ATRASO_ANOTA = '15 a 30 s'

/**
 * El motivo de una detención como lo muestra el resto del monitor, sin mayúsculas sostenidas: la etiqueta oficial del árbol de imputación
 * («Colación», «Reunión inicio turno») o, si no está en el árbol, el texto de Shoplogix en minúsculas con la primera mayúscula. La detención sin
 * motivo anotado («Detencion») no dice nada: devuelve null.
 */
export function motivoLegible(razon: string | null | undefined): string | null {
  const t = (razon ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return null
  const hoja = matchImputacion(t).leaf
  if (hoja) return hoja.label
  const bajo = t.toLowerCase()
  if (bajo === 'detencion' || bajo === 'detención') return null
  return bajo.charAt(0).toUpperCase() + bajo.slice(1)
}

// ── Nombres ──────────────────────────────────────────────────────────────────

/** El nombre de cada causa en pantalla. */
export const ROTULO_CAUSA: Record<CausaMicro, string> = {
  arranque: 'Arranque',
  linea: 'Otra Baader paró',
  paro: 'Al volver de una detención',
  sin: 'Sin contexto',
}

/** Las formas de «Otra Baader paró»: solo se dicen en el detalle y en el ⓘ. */
export const ROTULO_FORMA: Record<ModoLinea, string> = {
  a_la_vez: 'a la vez',
  en_cadena: 'en cadena',
  tras_paro_otra: 'detención previa',
}

// ── Resumen bajo el carril «Micro» ───────────────────────────────────────────

export const TXT_RESUMEN = {
  /** Leyenda de la barra. */
  leyendaProbable: 'causa probable',
  leyendaPosible: 'causa posible',
  leyendaSin: 'sin contexto',
  /** Junto a la cifra grande: «~8 de 46 · con causa probable · estimado». En el celular, «est.». */
  conCausaProbable: 'con causa probable',
  estimado: 'estimado',
  estimadoCorto: 'est.',
  ariaChips: 'Micro detenciones por causa',
  ariaAyuda: 'Qué significan la causa probable y la posible',
  tituloAyuda: 'Micro: causa probable y posible',
  enObservacion: 'en observación',
  sinCalibracion: 'Esta línea todavía no tiene calibración: no se estima la causa probable.',
  /** En la leyenda del gráfico. */
  marcaEnBaader: 'micro en su Baader (el color es la causa posible)',
  marcaALaVez: 'detención casi a la vez en 2 o 3 Baader',
}

/** «~8 de 46» → sus dos partes: la cifra y «de 46». */
export const cifraProbable = (probable: number) => (probable > 0 ? `~${probable}` : '0')
export const deTotal = (total: number) => `de${NB}${total}${NB}micro`
/** Sin calibración no hay «~»: la cifra dice solo cuántas micro hay. */
export const cifraSinCalibrar = (total: number) => `${total}${NB}micro`
/**
 * Bajo la barra, en una línea muted: liga el total de Shoplogix con las micro que se ven, cuando se sabe el total del turno. Las de 0 s no traen duración
 * y no se clasifican. Con «De 205 micro, 135 duran 0 s…» los 8 lectores de la prueba de 5 s no sabían si el turno tuvo 70 o 205: por eso dice «estas 70».
 */
export const microDeCeroSegundos = (total: number, m: number) => `Shoplogix anotó ${total}${NB}micro: estas ${total - m} y ${m} de 0${NB}s, sin duración.`

/** El texto del chip de una causa: «Arranque», «~1 de 3», «1 min 15 s». Sin estimado (`probable` null) la cifra es solo la cantidad. */
export function textoChip(causa: CausaMicro, n: number, probable: number | null, segundos: number) {
  return {
    nombre: ROTULO_CAUSA[causa],
    cifra: probable == null || n === 0 ? `${n}${NB}micro` : `${probable > 0 ? '~' : ''}${probable}${NB}de${NB}${n}${NB}micro`,
    tiempo: dur(segundos),
  }
}

/** La descripción de la barra para quien no la ve: «46 micro: ~1 de 3 Arranque, …». */
export function ariaBarra(total: number, filas: Array<{ causa: CausaMicro; n: number; probable: number | null }>): string {
  return `${total} micro: ${filas.filter((f) => f.n > 0).map((f) => `${f.probable == null ? f.n : `${f.probable > 0 ? '~' : ''}${f.probable} de ${f.n}`} ${ROTULO_CAUSA[f.causa]}`).join(', ')}`
}

/** Para el `aria-label` del gráfico: cuántas micro se ven. */
export const resumenAccesibleMicro = (n: number) => ` ${n} micro detenciones con hora, cada una con su causa posible.`

// ── Ayuda ⓘ: «Micro: causa probable y posible» ───────────────────────────────

export interface ItemAyuda {
  /** Clave de la forma, para quien necesite el orden. */
  clave: FormaMicro
  causa: CausaMicro
  /** Lo que va en negrita. */
  titulo: string
  texto: string
}

/** Las seis reglas en el orden en que se evalúan (gana la primera que se cumple). Las cifras salen de los parámetros de la planta. */
export function itemsAyuda(P: ParametrosCausas, conVarias: boolean): ItemAyuda[] {
  const arr = minEntero(P.ARR / 60_000)
  const volver = `${ROTULO_CAUSA.paro}`
  const items: ItemAyuda[] = [
    { clave: 'arranque', causa: 'arranque', titulo: ROTULO_CAUSA.arranque, texto: `en los primeros ${arr} desde que esa Baader empieza a producir, o desde que vuelve de una detención suya de ${arr} o más.` },
  ]
  if (conVarias) items.push({ clave: 'linea_a_la_vez', causa: 'linea', titulo: `${ROTULO_CAUSA.linea} · ${ROTULO_FORMA.a_la_vez}`, texto: `otra Baader tuvo una micro o una detención no programada a ±15${NB}s.` })
  items.push({ clave: 'paro', causa: 'paro', titulo: volver, texto: `hasta ${dur(P.TRAS / 1000)} después de que terminó una detención de esa misma Baader.` })
  if (conVarias) {
    items.push(
      { clave: 'linea_en_cadena', causa: 'linea', titulo: `${ROTULO_CAUSA.linea} · ${ROTULO_FORMA.en_cadena}`, texto: `las otras dos Baader tuvieron una micro entre 22,5 y ${segDeMs(P.CAD_HI)}${NB}s antes o después.` },
      { clave: 'linea_tras_paro_otra', causa: 'linea', titulo: `${ROTULO_CAUSA.linea} · ${ROTULO_FORMA.tras_paro_otra}`, texto: `otra Baader se detuvo entre 22,5${NB}s y ${minEntero(P.OTR_HI / 60_000)} antes, por acumulación, atascamiento, falta de materia prima o ajuste del operador.` },
    )
  }
  items.push({ clave: 'sin', causa: 'sin', titulo: ROTULO_CAUSA.sin, texto: 'ninguna de las anteriores. Los datos de Shoplogix aún no muestran su causa.' })
  return items
}

/** El `title` de cada chip: lo que mide la causa (sin las cifras del estimado). */
export function definicionCausa(causa: CausaMicro, P: ParametrosCausas, conVarias: boolean): string {
  return itemsAyuda(P, conVarias).filter((i) => i.causa === causa).map((i) => (causa === 'linea' ? `${i.titulo}: ${i.texto}` : i.texto)).join(' ')
}

export const AYUDA_INTRO = 'Cada micro cuenta una sola vez, en la primera que cumple, en este orden:'

/** Una nota del ⓘ: partes de texto, algunas en negrita. */
export type NotaAyuda = Array<{ negrita?: boolean; texto: string }>

/** Las notas del ⓘ bajo la lista. `cal` null: la línea no tiene calibración y no se dice cómo se estima. */
export function notasAyuda(args: {
  cal: (CalibracionPlanta & { nombre: string }) | null
  probableTotal: number | null
  porModo: Record<ModoLinea, number> | null
  verHora: number
}): NotaAyuda[] {
  const { cal, probableTotal, porModo, verHora } = args
  const notas: NotaAyuda[] = []
  if (cal) {
    const desde = `${SEMANAS_VENTANA} semanas al ${fechaDMA(cal.fecha)}`
    notas.push([
      { negrita: true, texto: 'Causa posible' },
      { texto: ': la micro coincidió con eso. ' },
      { negrita: true, texto: `Causa probable (${cifraProbable(probableTotal ?? 0)})` },
      { texto: `: cuántas de esas coincidencias superan lo que se ve en cualquier momento del turno, estimado con las ${desde} (Causas v3, ${cal.nombre}). Ninguna micro ocurre porque sí: si no se explica, es porque los datos todavía no muestran su causa.` },
    ])
    /* «En observación» tiene dos motivos que dicen cosas OPUESTAS (pocas micro / no fueron más seguidas): se dice solo el que tiene esta planta. */
    const motivos = new Set(Object.values(cal.categorias).map((c) => (c?.estado === 'en observación' ? c.motivo ?? 'sin_exceso' : null)))
    const porQue = [
      motivos.has('sin_exceso') ? 'esas micro no fueron más seguidas que en cualquier otro momento del turno' : null,
      motivos.has('pocas') ? 'hubo muy pocas micro así para estimar cuántas se explican' : null,
    ].filter((x): x is string => x != null)
    if (porQue.length > 0) {
      notas.push([
        { negrita: true, texto: 'En observación' },
        { texto: `: en las ${SEMANAS_VENTANA} semanas, ${porQue.join(', o bien ')}. Se muestran, pero no suman a la causa probable.` },
      ])
    }
  } else {
    notas.push([{ texto: TXT_RESUMEN.sinCalibracion }])
  }
  if (porModo) {
    const total = porModo.a_la_vez + porModo.en_cadena + porModo.tras_paro_otra
    notas.push([{ texto: `Este turno, ${ROTULO_CAUSA.linea} ${total} = ${ROTULO_FORMA.a_la_vez} ${porModo.a_la_vez} · ${ROTULO_FORMA.en_cadena} ${porModo.en_cadena} · ${ROTULO_FORMA.tras_paro_otra} ${porModo.tras_paro_otra}.` }])
  }
  notas.push([{ texto: `Se ven las ${verHora} micro de 15${NB}s o más. Las de 0${NB}s Shoplogix las anota con hora, pero sin duración. Al monitor llega solo cuántas son.` }])
  return notas
}

// ── Globo de la micro ────────────────────────────────────────────────────────

export const ARIA_GLOBO = 'Micro detención y su causa posible'
export const TXT_GLOBO = {
  verDetalle: 'Ver detalle',
  /** En PC, con el mouse solo encima de la marca: el globo no recibe el mouse, así que en vez del botón se dice cómo abrirlo. */
  pistaClic: 'Clic en la marca para ver el detalle',
  causaPosible: 'Causa posible:',
  cerrar: 'Cerrar la lectura de la micro',
  pieGeneral: 'Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.',
  pieSin: 'Los datos aún no la explican. Hay que verlo en terreno.',
  /** La leyenda de ▽. */
  leyendaInicio: `la detención pudo empezar en este minuto: Shoplogix la anota con ${ATRASO_ANOTA} de atraso`,
  ariaInicio: 'la detención pudo empezar en este minuto',
  ariaReglas: 'Reglas que no aplicaron',
}

/** El encabezado de una línea: «Ev 2 · micro de 60 s (+~20 s sin anotar) · 10:02:13». */
export function tituloGlobo(nombre: string, duracionS: number, hora: string) {
  return { principal: `${conNB(nombre)} · micro de ${seg(duracionS)}`, sinAnotar: `(+~${seg(OCULTO_S)} sin anotar)`, hora }
}

/** Qué hizo otra Baader respecto de la micro (`deltaS` < 0: antes). */
const cuando = (deltaS: number) => (deltaS === 0 ? 'a la vez' : `${dur(Math.abs(deltaS))} ${deltaS < 0 ? 'antes' : 'después'}`)
const listaY = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/**
 * La línea de causa del globo, armada con los datos: «Causa posible: **Otra Baader paró** · Ev 3 con micro 15 s después».
 * `detalle` es lo que va después del nombre; `prefijo` es null en «Sin contexto» (no hay causa que posibilitar).
 */
export function lineaCausa(ev: EvidenciaMicro): { prefijo: string | null; nombre: string; detalle: string } {
  const prefijo = TXT_GLOBO.causaPosible
  switch (ev.forma) {
    case 'arranque': {
      /* La duración exacta (los pasos de Shoplogix son de 15 s): «a 9 min 36 s», nunca «a 10 min» si la micro está dentro de los 10. */
      const n = dur(Math.abs(ev.minutos) * 60)
      const detalle = ev.origen === 'pausa'
        ? `a ${n} de volver de una detención de ${dur(ev.pausaS ?? 0)}`
        : ev.minutos < 0
          ? (ev.origen === 'produccion' ? 'antes de empezar a producir' : 'antes de empezar el turno')
          : `a ${n} de ${ev.origen === 'produccion' ? 'empezar a producir' : 'empezar el turno'}`
      return { prefijo, nombre: ROTULO_CAUSA.arranque, detalle }
    }
    case 'linea_a_la_vez': {
      /* Las iguales (mismo tipo, mismo desfase y mismo motivo) se dicen juntas: «Ev 2 y Ev 3 con micro a la vez». */
      const grupos: Array<{ nombres: string[]; o: (typeof ev.otras)[number] }> = []
      for (const o of ev.otras) {
        const g = grupos.find((x) => x.o.micro === o.micro && x.o.deltaS === o.deltaS && x.o.razon === o.razon)
        if (g) g.nombres.push(o.nombre)
        else grupos.push({ nombres: [o.nombre], o })
      }
      const partes = grupos.map(({ nombres, o }) => {
        const quien = listaY(nombres.map(conNB))
        if (o.micro) return `${quien} con micro ${cuando(o.deltaS)}`
        const motivo = motivoLegible(o.razon)
        return `${quien} ${nombres.length > 1 ? 'se detuvieron' : 'se detuvo'} ${cuando(o.deltaS)}${motivo ? ` por ${motivo}` : ''}`
      })
      return { prefijo, nombre: ROTULO_CAUSA.linea, detalle: listaY(partes) }
    }
    case 'linea_en_cadena': {
      const iguales = ev.otras.every((o) => seg(Math.abs(o.deltaS)) === seg(Math.abs(ev.otras[0]!.deltaS)) && Math.sign(o.deltaS) === Math.sign(ev.otras[0]!.deltaS))
      if (iguales) return { prefijo, nombre: ROTULO_CAUSA.linea, detalle: `${listaY(ev.otras.map((o) => conNB(o.nombre)))} con micro ${cuando(ev.otras[0]!.deltaS)}` }
      const partes = ev.otras.map((o, i) => `${conNB(o.nombre)} ${i === 0 ? 'con micro ' : ''}${cuando(o.deltaS)}`)
      return { prefijo, nombre: ROTULO_CAUSA.linea, detalle: listaY(partes) }
    }
    case 'linea_tras_paro_otra': {
      const motivo = motivoLegible(ev.razon)
      return { prefijo, nombre: ROTULO_CAUSA.linea, detalle: `${conNB(ev.nombre)} se detuvo ${dur(ev.haceS)} antes${motivo ? ` por ${motivo}` : ''}` }
    }
    case 'paro':
      return { prefijo, nombre: ROTULO_CAUSA.paro, detalle: `su detención terminó ${dur(ev.haceS)} antes` }
    default:
      return { prefijo: null, nombre: ROTULO_CAUSA.sin, detalle: 'nada alrededor en los datos' }
  }
}

/** «Forma: detención previa. La detención de Ev 1 fue no programada y duró 1 min 30 s.» Null si la causa no tiene forma que decir. */
export function detalleForma(ev: EvidenciaMicro, propia: { fila: number; nombre: string; durS: number }): string | null {
  if (ev.forma === 'linea_a_la_vez') {
    const todos = [{ fila: propia.fila, txt: `${conNB(propia.nombre)} ${dur(propia.durS)}` }, ...ev.otras.map((o) => ({ fila: o.fila, txt: `${conNB(o.nombre)} ${o.micro ? '' : 'detención de '}${dur(o.durS)}` }))]
    return `Forma: ${ROTULO_FORMA.a_la_vez}. ${todos.sort((a, b) => a.fila - b.fila).map((x) => x.txt).join(' · ')}.`
  }
  if (ev.forma === 'linea_en_cadena') {
    const todos = [{ fila: propia.fila, txt: `${conNB(propia.nombre)} ${dur(propia.durS)}` }, ...ev.otras.map((o) => ({ fila: o.fila, txt: `${conNB(o.nombre)} ${dur(o.durS)}` }))]
    return `Forma: ${ROTULO_FORMA.en_cadena}. ${todos.sort((a, b) => a.fila - b.fila).map((x) => x.txt).join(' · ')}.`
  }
  if (ev.forma === 'linea_tras_paro_otra') return `Forma: ${ROTULO_FORMA.tras_paro_otra}. La detención de ${conNB(ev.nombre)} fue no programada y duró ${dur(ev.durS)}.`
  if (ev.forma === 'paro') return `La detención de ${conNB(propia.nombre)} duró ${dur(ev.durS)}.`
  return null
}

/** La causa está «en observación» en esta planta: se muestra, pero no suma a la causa probable. */
export const textoObservacion = (planta: string, fecha: string, motivo: MotivoObservacion = 'sin_exceso', obs: number | null = null) =>
  motivo === 'pocas'
    ? `En observación: en ${planta}, en las ${SEMANAS_VENTANA} semanas, hubo ${obs != null ? `solo ${obs}` : 'muy pocas'} micro así, muy pocas para estimar. No suman a la causa probable.`
    : `En observación: en ${planta}, en las ${SEMANAS_VENTANA} semanas al ${fechaDMA(fecha)}, estas micro no fueron más seguidas que en cualquier otro momento del turno. No suman a la causa probable.`

// ── Reglas que no aplicaron (el «✕» del detalle) ─────────────────────────────

export const tituloDescarte = (causa: Exclude<CausaMicro, 'sin'>) =>
  causa === 'arranque' ? 'No es arranque:' : `No es «${ROTULO_CAUSA[causa]}»:`

export function textoDescarteArranque(a: { nombre: string; ventanaMin: number; pausaMin: number; ultimaLargaHora: string | null; produccionHora: string | null; inicioHora: string | null }): string {
  const nombre = conNB(a.nombre)
  if (a.ultimaLargaHora) return `la última detención de ${minTxt(a.pausaMin)} o más de ${nombre} terminó a las ${a.ultimaLargaHora}`
  if (a.produccionHora) return `ya pasaron ${minTxt(a.ventanaMin)} desde que ${nombre} empezó a producir (${a.produccionHora}) y no tuvo detenciones de ${minTxt(a.pausaMin)} o más`
  if (a.inicioHora) return `ya pasaron ${minTxt(a.ventanaMin)} desde que empezó el turno (${a.inicioHora}) y ${nombre} no tuvo detenciones de ${minTxt(a.pausaMin)} o más`
  return `${nombre} no tuvo detenciones de ${minTxt(a.pausaMin)} o más antes de la micro`
}

export function textoDescarteLinea(a: {
  /** Los parámetros de la planta: de ellos salen las ventanas que se dicen. */
  P: ParametrosCausas
  /** La planta tiene 3 o más Baader y la regla «en cadena» está encendida: solo entonces se dice que no se cumplió. */
  conCadena: boolean
  /** Otra Baader que se detuvo antes, pero por un motivo que no cuenta (sin imputar, mecánico…). */
  fuera: { nombre: string; haceS: number; razon: string | null } | null
  /** Otra Baader con una detención programada a ±15 s. */
  programada: { nombre: string; razon: string | null } | null
}): string {
  if (a.fuera) {
    const motivo = motivoLegible(a.fuera.razon)
    return `${conNB(a.fuera.nombre)} se detuvo ${dur(a.fuera.haceS)} antes, pero ${motivo ? `por ${motivo}` : 'sin imputar'}, y eso no cuenta. Ninguna otra Baader coincidió a la vez ni en cadena`
  }
  if (a.programada) {
    const motivo = motivoLegible(a.programada.razon)
    return `ninguna otra Baader tuvo micro ni detención no programada a ±15${NB}s (${conNB(a.programada.nombre)} se detuvo, pero era programada${motivo ? `: ${motivo}` : ''})`
  }
  /* Solo lo que se evaluó (las tres formas de «Otra Baader paró»): una micro suelta de otra Baader dentro de esas ventanas NO activa ninguna regla, así que no se puede
     decir que «no se detuvieron». */
  const cadena = a.conCadena ? `, las otras dos no tuvieron micro en cadena (entre 22,5 y ${segDeMs(a.P.CAD_HI)}${NB}s antes o después)` : ''
  const previa = a.P.OTR ? ` y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5${NB}s y ${minEntero(a.P.OTR_HI / 60_000)} antes)` : ''
  return `ninguna otra Baader se detuvo a ±15${NB}s${cadena}${previa}`
}

export function textoDescarteVolver(a: { nombre: string; haceS: number | null }): string {
  return a.haceS != null
    ? `la última detención de ${conNB(a.nombre)} terminó hace ${dur(a.haceS)}`
    : `${conNB(a.nombre)} no tuvo detenciones antes de la micro`
}
