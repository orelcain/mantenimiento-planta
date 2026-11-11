/**
 * Los datos de la tarjeta «Ritmo» de la franja y de su detalle (A3, 28-10): lo que cada Baader aporta al promedio de la línea
 * y cómo se compara consigo misma. PURO: sin React ni DOM, para que cada regla tenga su test.
 *
 * Todo sale de lo que ya publica Shoplogix (`ritmoPorMaquina`, `aporteHistorico`). Aquí solo se reparte y se compara:
 *  · Los aportes se redondean por RESTOS MAYORES para que la columna sume la línea a la vista (13,5 + 11,4 + 13,6 = 38,5 y no
 *    13,5 + 11,4 + 13,5 = 38,4 por redondear cada uno por separado).
 *  · Las comparaciones de la Línea son «promedio de la línea − suma de las referencias de sus Baader», SIN redondear antes.
 *  · Sin muestra o antes de `APORTE_MIN_PROD_MIN` minutos produciendo no se compara: un delta que no se sostiene no se muestra.
 */
import type { RitmoDeMaquina, RitmosPorMaquina } from '@/services/shoplogix/ritmoPorMaquina'
import { APORTE_MIN_PROD_MIN, deltaAporte, type ReferenciaAporte } from './aporteHistorico'

/** Menos de esto (en pz/min) es ruido: va en raya, ni logro ni caída (la misma regla de siempre de la tabla). */
export const DELTA_RUIDO = 0.3

/**
 * Redondea cada valor a `decimales` de modo que la SUMA de lo redondeado sea la suma redonda (restos mayores).
 * Si se da `objetivo`, la suma redondeada es ese objetivo redondeado; solo se acepta si no se aleja de la suma real en más de
 * un paso (0,1): más allá, forzar el total deformaría a una Baader, y se redondea cada una por separado.
 */
export function repartoPorRestos(valores: number[], decimales = 1, objetivo?: number | null): number[] {
  const f = 10 ** decimales
  const simple = valores.map((v) => Math.round(v * f) / f)
  if (valores.length === 0 || valores.some((v) => !Number.isFinite(v))) return simple
  const escalados = valores.map((v) => v * f)
  const suma = escalados.reduce((a, b) => a + b, 0)
  const meta = objetivo != null && Number.isFinite(objetivo) ? objetivo * f : suma
  if (Math.abs(meta - suma) > 1) return simple
  const total = Math.round(meta)
  const pisos = escalados.map((v) => Math.floor(v))
  const faltan = total - pisos.reduce((a, b) => a + b, 0)
  if (faltan < 0 || faltan > valores.length) return simple
  const orden = escalados.map((v, i) => ({ i, resto: v - Math.floor(v) })).sort((a, b) => b.resto - a.resto || a.i - b.i)
  const out = pisos.slice()
  for (let k = 0; k < faltan; k++) out[orden[k]!.i]! += 1
  return out.map((v) => v / f)
}

/** La comparación de la Línea: promedio de la línea − Σ referencias de sus Baader (todas deben tener referencia). */
export function deltaLinea(
  ref: ReferenciaAporte | null | undefined,
  nombres: string[],
  promedioLinea: number | null | undefined,
  producingMin: number | null | undefined,
): number | null {
  if (!ref || promedioLinea == null || !Number.isFinite(promedioLinea) || nombres.length === 0) return null
  if ((producingMin ?? 0) < APORTE_MIN_PROD_MIN) return null
  let suma = 0
  for (const n of nombres) {
    const base = ref.porMaquina.get(n)
    if (base == null || !Number.isFinite(base)) return null
    suma += base
  }
  return promedioLinea - suma
}

export interface FilaAporte {
  nombre: string
  piezas: number
  /** Aporte al promedio del turno (pz/min), ya redondeado a 0,1 por restos mayores; sin aporte (turno sin minutos produciendo), el ritmo andando. */
  aporte: number | null
  /** % del turno que la Baader estuvo andando. */
  uptimePct: number | null
  /** Piezas por minuto mientras andaba. */
  cpm: number
  /** El «ahora» de la columna del detalle (pulso del contador, media de 15 min o 0), redondeado por restos; null si no hay. */
  ahora: number | null
  /** Contra sí misma: el aporte (sin redondear) menos el de su referencia; null = sin dato (raya). */
  vsUltimo: number | null
  vsProm: number | null
}

export interface DatosAporte {
  filas: FilaAporte[]
  linea: { aporte: number | null; ahora: number | null; vsUltimo: number | null; vsProm: number | null }
  /** El aporte es el de verdad (piezas ÷ minutos de la línea); si no, es el ritmo andando de cada una y no hay comparaciones. */
  esAporte: boolean
  /** Qué columnas de comparación hay. */
  conUltimo: boolean
  conProm: boolean
  /** Cuántos turnos entran en «vs prom. N». */
  turnosProm: number | null
  /** Hay con qué comparar pero el turno aún no lleva `APORTE_MIN_PROD_MIN` min produciendo: UNA columna, «vs turnos previos». */
  antesDeRodar: boolean
  /** De dónde sale la columna «ahora» del detalle: el pulso, la media de 15 min, el cero de la línea detenida, o no hay. */
  ahoraModo: 'pulso' | 'media15' | 'cero' | null
}

export function armarAporte(a: {
  maquinas: RitmosPorMaquina | null | undefined
  producingMin: number | null | undefined
  refUltimo: ReferenciaAporte | null | undefined
  refProm: ReferenciaAporte | null | undefined
  /** Promedio del turno de la línea (piezas ÷ minutos produciendo): la fila Línea. */
  promedioLinea: number | null | undefined
  /** Ninguna Baader produce ahora (la línea detenida). */
  parada: boolean
  cerrado: boolean
  /** Hay un pulso vivo elegido (`pulsoVivo`): sin él la columna «ahora» no es del pulso. */
  pulsoFresco: boolean
}): DatosAporte | null {
  const ms: RitmoDeMaquina[] = a.maquinas?.maquinas ?? []
  if (ms.length === 0) return null
  const conPulso = !a.parada && !a.cerrado && a.pulsoFresco && ms.every((m) => m.pulsoCpm != null)
  const conReparto = !conPulso && !a.parada && !a.cerrado && ms.every((m) => m.ahoraCpm != null)
  const conCero = a.parada && !a.cerrado
  const ahoraModo: DatosAporte['ahoraModo'] = conPulso ? 'pulso' : conReparto ? 'media15' : conCero ? 'cero' : null
  const ahoraCrudo = ms.map((m) => (conPulso ? m.pulsoCpm : conReparto ? m.ahoraCpm : 0) ?? 0)
  const ahoraRed = ahoraModo ? repartoPorRestos(ahoraCrudo) : null

  const esAporte = ms.every((m) => m.aporteCpm != null)
  const crudos = ms.map((m) => (esAporte ? m.aporteCpm! : m.cpm))
  const sumaCruda = crudos.reduce((x, y) => x + y, 0)
  const lineaCruda = a.promedioLinea != null && Number.isFinite(a.promedioLinea) ? a.promedioLinea : sumaCruda
  /* El aporte de cada Baader sale de su doc del corte (m.piezas) y la Línea del contador vivo: pueden diferir unas decenas de
     piezas. Si la diferencia pasa del paso de redondeo (0,1 pz/min), se reparte la Línea entre las Baader en la proporción de sus
     aportes: así la columna suma la Línea a la vista (antes caía a redondeo simple y no sumaba; 26 pz en 150 min = 0,17). */
  const reescalar = esAporte && sumaCruda > 0 && lineaCruda > 0 && Math.abs(lineaCruda - sumaCruda) > 0.1
  const base = reescalar ? crudos.map((c) => (c * lineaCruda) / sumaCruda) : crudos
  const aportes = repartoPorRestos(base, 1, esAporte ? lineaCruda : null)

  const rodado = (a.producingMin ?? 0) >= APORTE_MIN_PROD_MIN
  const hayUltimo = esAporte && a.refUltimo != null
  /* Con UN solo turno de muestra «vs prom.» repetiría «vs último»: se calla. */
  const hayProm = esAporte && a.refProm != null && a.refProm.turnos > 1
  const conUltimo = hayUltimo && rodado
  const conProm = hayProm && rodado
  const nombres = ms.map((m) => m.nombre)

  return {
    filas: ms.map((m, i) => ({
      nombre: m.nombre,
      piezas: m.piezas,
      aporte: aportes[i] ?? null,
      uptimePct: m.uptimePct,
      cpm: m.cpm,
      ahora: ahoraRed ? ahoraRed[i] ?? null : null,
      vsUltimo: conUltimo && esAporte ? deltaAporte(a.refUltimo ?? null, m.nombre, m.aporteCpm, a.producingMin) : null,
      vsProm: conProm && esAporte ? deltaAporte(a.refProm ?? null, m.nombre, m.aporteCpm, a.producingMin) : null,
    })),
    linea: {
      aporte: Math.round(lineaCruda * 10) / 10,
      ahora: ahoraRed ? Math.round(ahoraRed.reduce((x, y) => x + y * 10, 0)) / 10 : null,
      vsUltimo: conUltimo ? deltaLinea(a.refUltimo, nombres, lineaCruda, a.producingMin) : null,
      vsProm: conProm ? deltaLinea(a.refProm, nombres, lineaCruda, a.producingMin) : null,
    },
    esAporte,
    conUltimo,
    conProm,
    turnosProm: hayProm ? a.refProm!.turnos : null,
    antesDeRodar: (hayUltimo || hayProm) && !rodado,
    ahoraModo,
  }
}

/** Una comparación lista para decirse: «▲ 1,0», «▼ 0,7» o «— 0,2» (|Δ| < 0,3: ni logro ni caída). */
export function comparacion(d: number | null | undefined): { texto: string; clase: 'sube' | 'baja' | 'raya' } | null {
  if (d == null || !Number.isFinite(d)) return null
  const abs = Math.abs(d).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (Math.abs(d) < DELTA_RUIDO) return { texto: `— ${abs}`, clase: 'raya' }
  return d > 0 ? { texto: `▲ ${abs}`, clase: 'sube' } : { texto: `▼ ${abs}`, clase: 'baja' }
}
