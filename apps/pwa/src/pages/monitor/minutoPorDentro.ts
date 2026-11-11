/**
 * «El minuto por dentro»: lo que dice el globo de un minuto del gráfico «Ritmo en vivo» cuando el zoom deja ver cada parada al segundo
 * (desde `EXACTO_PX_MIN`). Lógica PURA, sin React ni DOM: el componente (`GloboMinuto.tsx`) solo dibuja lo que sale de acá.
 *
 * Todo sale del doc: `pulse.serieMinuto` (piezas por minuto y esperado), `stopEvents` (inicio, duración y motivo de cada parada) y el
 * clasificador de micro (`microCausa.ts`). No hay producción medida por segundo: lo que faltó se REPARTE con el esperado de cada Baader por
 * segundo detenido (`faltaronDelMinuto`) y el globo lo dice. Lo que Shoplogix no anota de cada micro (~20 s) va rotulado «estimado».
 */
import { duenoDe, DUENO_META, type DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import { duracionExacta, faltaronDelMinuto, relojConSegundos, type FaltaronMinuto, type Tramo, type TonoRitmo } from './ejeTurno'
import { motivoLegible, type CausaMicro, type MicroClasificada } from './microCausa'
import type { ParadaDetalle } from './ritmoVivo'

/** Una Baader en un minuto, con todo lo que el globo necesita (el componente la arma desde el modelo del gráfico). */
export interface BaaderMinuto {
  id: string
  /** El nombre corto de la fila («Ev 1»). */
  nombre: string
  esperado: number | null
  /** Piezas del minuto; null si la serie de esa Baader aún no lo tiene. */
  piezas: number | null
  /** El tono del minuto (el mismo de su celda en la cinta). */
  tono: TonoRitmo
  tramos: Tramo[]
  andandoS: number
  /** Ritmo mientras anduvo (`ritmoAndando`); null = sin dato. */
  ritmo: number | null
}

export type EstadoFila = 'detenida' | 'ritmo' | 'poco' | 'sin-dato'

export interface FilaMinuto {
  id: string
  nombre: string
  piezas: number | null
  andandoS: number
  estado: EstadoFila
  ritmo: number | null
  esperado: number | null
  /** `ritmo ÷ esperado`, en %, sin acotar a 100. */
  pct: number | null
  tono: TonoRitmo
  tramos: Tramo[]
}

export interface ParadaDelMinuto {
  /** La Baader (nombre corto) y su posición en la lista (el color de su fila). */
  baader: string
  baaderId: string
  desde: string
  /** null en una parada en curso (todavía sin fin). */
  hasta: string | null
  durS: number | null
  inicioMs: number
  abierta: boolean
  razon: string | null
}

export interface DetencionDelMinuto extends ParadaDelMinuto {
  dueno: DuenoPerdida | null
  /** El nombre del dueño («Sin imputar», «Mantención») y, si lo hay, el motivo legible; null en una parada en curso. */
  duenoTxt: string | null
  motivo: string | null
}

export interface MicroDelMinuto extends ParadaDelMinuto {
  /** La causa posible (`clasificarMicros`); null si esa micro no está clasificada (por ejemplo, empieza después del último dato). */
  causa: CausaMicro | null
  /** El id de la micro clasificada: con él el globo abre su `GloboMicro`. */
  microId: string | null
}

export interface ProgramadaDelMinuto extends ParadaDelMinuto {
  /** «Colación», «Reunión inicio turno»… (`motivoLegible`). */
  motivo: string
}

export interface LecturaMinuto {
  /** Inicio del minuto (wall-as-UTC ms). */
  iniMs: number
  /** «15:13». */
  hora: string
  /** «15:13:00 → 15:14:00». */
  rango: string
  /** Suma de las piezas y del esperado de la línea (sin descontar lo programado). null si alguna Baader no tiene el dato. */
  piezas: number | null
  esperadoBruto: number | null
  faltaron: FaltaronMinuto | null
  /**
   * El resto de lo que faltó («por ritmo») no se puede atribuir a ningún ritmo: la línea contó 0 en el minuto y ninguna Baader tiene ritmo
   * andando medible (todas «sin dato», «poco tiempo» o detenidas). Una parada pactada que Shoplogix no anota y un minuto sin pescado se ven igual
   * (0 piezas): el globo lo dice «sin explicar» en vez de cargárselo al ritmo. Caso real: Filete 11:23.
   */
  restoSinExplicar: boolean
  /** Lo programado del minuto: los segundos si son iguales en todas las Baader con programada, y el motivo. */
  programado: { s: number | null; motivo: string | null } | null
  filas: FilaMinuto[]
  detenciones: DetencionDelMinuto[]
  programadas: ProgramadaDelMinuto[]
  micros: MicroDelMinuto[]
  /** «Las 3 se detuvieron en el mismo segundo: 15:13:00.» (sin el punto final) o null. */
  mismoSegundo: string | null
}

const sinRepetir = <T,>(xs: T[]) => [...new Set(xs)]

/** Arma la lectura del minuto que parte en `iniMs`. `micros`: las micro clasificadas del turno, para unir cada micro del minuto con su causa. */
export function lecturaDelMinuto(args: { iniMs: number; baaders: BaaderMinuto[]; micros: readonly MicroClasificada[] }): LecturaMinuto {
  const { iniMs, baaders, micros } = args
  const filas: FilaMinuto[] = baaders.map((b) => {
    const pct = b.ritmo != null && b.esperado != null && b.esperado > 0 ? Math.round((b.ritmo / b.esperado) * 100) : null
    const estado: EstadoFila = b.andandoS <= 0.0005 ? 'detenida' : b.ritmo != null ? 'ritmo' : b.andandoS < 30 ? 'poco' : 'sin-dato'
    return { id: b.id, nombre: b.nombre, piezas: b.piezas, andandoS: b.andandoS, estado, ritmo: b.ritmo, esperado: b.esperado, pct, tono: b.tono, tramos: b.tramos }
  })
  const todas = baaders.every((b) => b.piezas != null && b.esperado != null)
  const faltaron = faltaronDelMinuto(baaders.map((b) => ({ esperado: b.esperado, piezas: b.piezas })), baaders.map((b) => b.tramos))

  const base = (b: BaaderMinuto, p: ParadaDetalle): ParadaDelMinuto => ({
    baader: b.nombre,
    baaderId: b.id,
    desde: relojConSegundos(p.iniMs),
    hasta: p.abierta ? null : relojConSegundos(p.finMs),
    durS: p.abierta ? null : p.durS,
    inicioMs: p.iniMs,
    abierta: !!p.abierta,
    razon: p.razon,
  })
  const detenciones: DetencionDelMinuto[] = []
  const programadas: ProgramadaDelMinuto[] = []
  const microsMin: MicroDelMinuto[] = []
  const inicios: Array<{ baaderId: string; nombre: string; iniMs: number }> = []
  for (const b of baaders) {
    for (const p of sinRepetir(b.tramos.map((t) => t.parada))) {
      if (p.tipo !== 'programada' && p.iniMs >= iniMs && p.iniMs < iniMs + 60_000) inicios.push({ baaderId: b.id, nombre: b.nombre, iniMs: p.iniMs })
      if (p.tipo === 'detencion') {
        const dueno = p.abierta ? null : duenoDe(p.razon ?? '').dueno
        const motivo = p.abierta ? null : motivoLegible(p.razon)
        detenciones.push({ ...base(b, p), dueno, motivo, duenoTxt: dueno ? DUENO_META[dueno].label : null })
      } else if (p.tipo === 'programada') {
        programadas.push({ ...base(b, p), motivo: motivoLegible(p.razon) ?? 'Detención programada' })
      } else {
        const q = micros.find((x) => x.maquinaId === b.id && x.inicioMs === p.inicioCrudoMs) ?? null
        microsMin.push({ ...base(b, p), causa: q?.causa ?? null, microId: q?.id ?? null })
      }
    }
  }
  const porHora = (a: ParadaDelMinuto, b: ParadaDelMinuto) => a.inicioMs - b.inicioMs
  detenciones.sort(porHora)
  programadas.sort(porHora)
  microsMin.sort(porHora)

  /* «Las 3 se detuvieron en el mismo segundo»: dos o más Baader distintas empiezan una detención (no programada) en ese minuto, todas en el mismo segundo. */
  let mismoSegundo: string | null = null
  if (inicios.length >= 2 && new Set(inicios.map((x) => x.iniMs)).size === 1 && new Set(inicios.map((x) => x.baaderId)).size === inicios.length) {
    const todasParan = inicios.length === baaders.length && baaders.length > 1
    mismoSegundo = `${todasParan ? `Las ${baaders.length}` : inicios.map((x) => x.nombre).join(' y ')} se detuvieron en el mismo segundo: ${relojConSegundos(inicios[0]!.iniMs)}`
  }

  const segProg = faltaron?.programadaS ?? []
  const conProg = segProg.filter((s) => s > 0)
  const motivos = sinRepetir(programadas.map((p) => p.motivo))
  const programado = conProg.length === 0
    ? null
    : { s: conProg.length === segProg.length && new Set(conProg).size === 1 ? conProg[0]! : null, motivo: motivos.length === 1 ? motivos[0]! : null }

  return {
    iniMs,
    hora: relojConSegundos(iniMs).slice(0, 5),
    rango: `${relojConSegundos(iniMs)} → ${relojConSegundos(iniMs + 60_000)}`,
    piezas: todas ? faltaron?.piezas ?? baaders.reduce((a, b) => a + (b.piezas ?? 0), 0) : null,
    esperadoBruto: todas ? baaders.reduce((a, b) => a + (b.esperado ?? 0), 0) : null,
    faltaron,
    restoSinExplicar: faltaron != null && faltaron.piezas === 0 && !filas.some((f) => f.estado === 'ritmo'),
    programado,
    filas,
    detenciones,
    programadas,
    micros: microsMin,
    mismoSegundo,
  }
}

/** La duración de una parada para el globo: «2 min 15 s», o «en curso» sin fin. */
export const duracionDeParada = (p: Pick<ParadaDelMinuto, 'durS'>) => (p.durS == null ? 'en curso' : duracionExacta(p.durS))
