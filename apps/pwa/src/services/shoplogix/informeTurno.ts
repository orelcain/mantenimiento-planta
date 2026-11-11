/**
 * informeTurno — modelo del informe corrido del detalle de turno (dirección A).
 *
 * Todo sale de `kpisDeTurno`, la misma fuente de la pestaña Mantención, para
 * que las cifras del informe no puedan diferir de las de esa pestaña. Dos
 * decisiones de presentación viven aquí:
 *
 * - Las tablas CIERRAN: se redondea al minuto repartiendo los restos, de modo
 *   que cada máquina sume su total y cada columna el de la línea.
 * - Las microdetenciones van como «Sin anotar», no a cuenta de Mantención:
 *   falla técnica es lo que tiene causa de equipo.
 */
import { shortMachineName } from '@/services/grader/graderMachineNames'
import { dec1 } from '@/utils/formatoNumeros'
import {
  clasificaCausa,
  reenganches,
  sanearStates,
  targetSospechoso,
  type KpisTurnoMantencion,
} from './kpisMantencionTurno'

const NB = String.fromCharCode(160)

/** Reparte `total` entero entre `valores` siguiendo los restos mayores. */
export function repartirEnteros(valores: readonly number[], total: number): number[] {
  const pisos = valores.map((v) => Math.floor(v))
  let faltan = total - pisos.reduce((a, v) => a + v, 0)
  const orden = valores
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || b.i - a.i)
  for (let k = 0; faltan !== 0 && orden.length > 0; k = (k + 1) % orden.length) {
    const i = orden[k]!.i
    if (faltan > 0) { pisos[i]! += 1; faltan -= 1 } else if (pisos[i]! > 0) { pisos[i]! -= 1; faltan += 1 }
    else if (pisos.every((p) => p === 0)) break
  }
  return pisos
}

const suma = (xs: readonly number[]) => xs.reduce((a, v) => a + v, 0)

export interface MatrizRedondeada { celdas: number[][]; filas: number[]; columnas: number[]; total: number }

/** Redondeo controlado: filas y columnas enteras que suman lo mismo. */
export function redondearMatriz(m: readonly (readonly number[])[]): MatrizRedondeada {
  const nC = m[0]?.length ?? 0
  const total = Math.round(suma(m.map(suma)))
  const filas = repartirEnteros(m.map(suma), total)
  const sumaCols = Array.from({ length: nC }, (_, j) => suma(m.map((f) => f[j]!)))
  const columnas = repartirEnteros(sumaCols, total)
  const porCol = columnas.map((tot, j) => repartirEnteros(m.map((f) => f[j]!), tot))
  const celdas = m.map((_, i) => porCol.map((c) => c[i]!))
  /* Las columnas ya cierran; mover ±1 entre dos filas de una misma columna
     cierra también las filas sin descuadrar la columna. */
  for (let vuelta = 0; vuelta < 500; vuelta++) {
    const sobra = celdas.findIndex((f, i) => suma(f) > filas[i]!)
    const falta = celdas.findIndex((f, i) => suma(f) < filas[i]!)
    if (sobra < 0 || falta < 0) break
    let mejor = -1, costo = Infinity
    for (let j = 0; j < nC; j++) {
      if (celdas[sobra]![j]! <= 0) continue
      const c = Math.abs(celdas[sobra]![j]! - 1 - m[sobra]![j]!) + Math.abs(celdas[falta]![j]! + 1 - m[falta]![j]!)
      if (c < costo) { costo = c; mejor = j }
    }
    if (mejor < 0) break
    celdas[sobra]![mejor]! -= 1
    celdas[falta]![mejor]! += 1
  }
  return { celdas, filas, columnas, total }
}

const NOMBRES: Record<string, string> = {
  LOGICA: 'Lógica de control',
  'PERNOS/RESORTES': 'Pernos y resortes',
  'RETRASO ASEO': 'Retraso de aseo',
  'ACUMULACION RECHAZO': 'Acumulación de rechazo',
  COLACION: 'Colación',
  'DETENCION PROGRAMADA': 'Detención programada',
  'EJERCICIO COMPENSATORIO - Paro': 'Ejercicio compensatorio',
  'REUNION INICIO TURNO': 'Reunión de inicio',
  'Micro Detencion': 'Microdetenciones',
}

/** «LOGICA» → «Lógica de control»; lo desconocido, solo sin gritar. */
export function nombreCausa(c: string): string {
  const n = NOMBRES[c]
  if (n) return n
  const t = c.trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** 228 → «3 h 48», 45 → «45 min», 180 → «3 h». */
export function horasMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}${NB}min`
  const h = Math.floor(m / 60), r = m % 60
  return r === 0 ? `${h}${NB}h` : `${h}${NB}h${NB}${String(r).padStart(2, '0')}`
}

const mil = (n: number) => Math.round(n).toLocaleString('es-CL')
const lista = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

/** Los `Date` del snapshot son hora de pared sellada como UTC. */
export const horaPared = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`

export interface FilaMaquina {
  nombre: string
  piezas: number
  pctObjetivo: number | null
  produjo: number
  falla: number
  sinAnotar: number
  proceso: number
  planificado: number
  /** sinAnotar + proceso + planificado: la columna del celular. */
  otras: number
  total: number
}

export interface LineaCausa { causa: string; maquinas: string; maquinasCorto: string; veces: number; min: number }
export interface GrupoCausas {
  id: 'falla' | 'proceso' | 'sin-anotar' | 'planificado'
  titulo: string
  min: number
  veces: number | null
  maquinas: string
  lineas: LineaCausa[]
}

export interface Pendiente { hora: string; causa: string; maquina: string; min: number }

export interface InformeTurno {
  titular: string
  bajada: string
  filas: FilaMaquina[]
  linea: FilaMaquina
  grupos: GrupoCausas[]
  totalDetenido: number
  pctConCausa: number | null
  maquinaDestacada: string | null
  anotacion: { maquina: string; texto: string } | null
  objetivoPorVerificar: string[]
  respuesta: {
    mttrMin: number | null
    eventos: number
    reengancheMin: number | null
    disponibilidad: string
    piezasFalla: number | null
  }
  pendientes: Pendiente[]
}

function maquinasDe(nombres: Set<string>, nTotal: number): { largo: string; corto: string } {
  const orden = [...nombres].sort()
  if (nTotal > 1 && orden.length === nTotal) return { largo: `Las ${nTotal}`, corto: `las ${nTotal}` }
  const corto = orden.map((n) => n.replace(/^Baader\s+/, 'B'))
  if (orden.length > 1 && orden.every((n) => /^Baader\s+\d+$/.test(n))) {
    return { largo: lista(orden.map((n) => n.replace(/^Baader\s+/, ''))), corto: lista(corto) }
  }
  return { largo: lista(orden), corto: lista(corto) }
}

function reengancheMayor(k: KpisTurnoMantencion): number | null {
  const ev = k.eventos[0]
  if (!ev) return null
  const m = k.porMaquina.find((x) => x.maquina.machineName === ev.maquina)
  const mediana = m?.velocidad.medianaAndandoCpm
  if (!m || mediana == null) return null
  const buckets = (m.maquina.intervals ?? []).map((iv) => ({
    ms: iv.startAt.getTime(), c: iv.cycles || 0, e: iv.expectedCycles || 0,
  }))
  const r = reenganches(buckets, [ev], mediana * 5)[0]
  /* Resolución de 5 min: se dice «≤», igual que la pestaña Mantención. */
  return r?.min != null ? (r.min + 1) * 5 : null
}

export function armarInformeTurno(k: KpisTurnoMantencion, opciones: { enCurso: boolean }): InformeTurno {
  const { enCurso } = opciones
  const pm = k.porMaquina
  const nombres = pm.map((x) => shortMachineName(x.maquina.machineName))
  const matriz = pm.map((x) => {
    const r = x.reparto
    return [r.produccion, r.falla, r.micro + r['sin-imputar'] + r.resto, r.externo + r.excedido, r.planificado]
  })
  const red = redondearMatriz(matriz)
  const filas: FilaMaquina[] = pm.map((x, i) => {
    const c = red.celdas[i]!
    return {
      nombre: nombres[i]!,
      piezas: x.maquina.totalCycles || 0,
      pctObjetivo: pct(x.maquina.totalCycles || 0, x.maquina.expectedTotalCycles || 0),
      produjo: c[0]!, falla: c[1]!, sinAnotar: c[2]!, proceso: c[3]!, planificado: c[4]!,
      otras: c[2]! + c[3]! + c[4]!,
      total: red.filas[i]!,
    }
  })
  const piezas = suma(pm.map((x) => x.maquina.totalCycles || 0))
  const objetivo = suma(pm.map((x) => x.maquina.expectedTotalCycles || 0))
  const pctLinea = pct(piezas, objetivo)
  const [cProd, cFalla, cSin, cProc, cPlan] = red.columnas as [number, number, number, number, number]
  const linea: FilaMaquina = {
    nombre: 'Línea', piezas, pctObjetivo: pctLinea,
    produjo: cProd, falla: cFalla, sinAnotar: cSin, proceso: cProc, planificado: cPlan,
    otras: cSin + cProc + cPlan, total: red.total,
  }

  // Causas por grupo, con los mismos totales de las columnas de arriba.
  type Acum = { sec: number; veces: number; maqs: Set<string> }
  const porGrupo: Record<GrupoCausas['id'], Map<string, Acum>> = {
    falla: new Map(), proceso: new Map(), 'sin-anotar': new Map(), planificado: new Map(),
  }
  pm.forEach((x, i) => {
    for (const s of sanearStates(x.maquina.states ?? [], k.ventana)) {
      const fam = clasificaCausa(s)
      if (fam === 'produccion') continue
      const id: GrupoCausas['id'] = fam === 'falla' ? 'falla'
        : fam === 'planificado' ? 'planificado'
        : fam === 'externo' || fam === 'excedido' ? 'proceso' : 'sin-anotar'
      const clave = s.reason || s.name || 'Sin causa'
      const a = porGrupo[id].get(clave) ?? { sec: 0, veces: 0, maqs: new Set<string>() }
      a.sec += s.durationSec || 0
      a.veces += 1
      a.maqs.add(nombres[i]!)
      porGrupo[id].set(clave, a)
    }
  })
  const armarGrupo = (id: GrupoCausas['id'], titulo: string, min: number): GrupoCausas => {
    const orden = [...porGrupo[id].entries()].sort((a, b) => b[1].sec - a[1].sec)
    const mins = repartirEnteros(orden.map(([, a]) => a.sec / 60), min)
    const todas = new Set(orden.flatMap(([, a]) => [...a.maqs]))
    return {
      id, titulo, min,
      veces: id === 'sin-anotar' ? null : suma(orden.map(([, a]) => a.veces)),
      maquinas: maquinasDe(todas, nombres.length).largo,
      lineas: orden.map(([causa, a], i) => {
        const m = maquinasDe(a.maqs, nombres.length)
        return { causa: nombreCausa(causa), maquinas: m.largo, maquinasCorto: m.corto, veces: a.veces, min: mins[i]! }
      }).filter((l) => l.min > 0),
    }
  }
  const soloMicro = [...porGrupo['sin-anotar'].keys()].every((c) => /micro/i.test(c))
  const grupos = [
    armarGrupo('falla', 'Mantención, falla técnica', cFalla),
    armarGrupo('proceso', 'Proceso', cProc),
    armarGrupo('sin-anotar', soloMicro ? 'Sin anotar: microdetenciones' : 'Sin anotar', cSin),
    armarGrupo('planificado', 'Planificado: colación y pausas', cPlan),
  ].filter((g) => g.min > 0)
  const totalDetenido = suma(grupos.map((g) => g.min))

  // Titular: el dato manda.
  const conFalla = [...pm].filter((x) => x.reparto.falla > 0).sort((a, b) => b.reparto.falla - a.reparto.falla)
  const sanas = nombres.filter((_, i) => pm[i]!.reparto.falla === 0)
  const mayor = conFalla[0]
  const dominante = mayor && k.totalFallaMin > 0 && mayor.reparto.falla / k.totalFallaMin >= 0.6 ? mayor : null
  const maquinaDestacada = dominante ? shortMachineName(dominante.maquina.machineName) : null
  const hizo = pctLinea == null ? ''
    : pctLinea >= 48 && pctLinea <= 52 ? ` y la línea ${enCurso ? 'va en' : 'hizo'} la mitad del objetivo`
    : ` y la línea ${enCurso ? 'va en' : 'hizo'} el ${pctLinea}${NB}% del objetivo`
  const titular = k.totalFallaMin === 0
    ? `El turno ${enCurso ? 'va' : 'cerró'} sin fallas técnicas${hizo}`
    : dominante
      ? `La ${maquinaDestacada} ${enCurso ? 'lleva' : 'estuvo'} ${horasMin(dominante.reparto.falla)} en falla${hizo}`
      : `La línea ${enCurso ? 'lleva' : 'perdió'} ${horasMin(k.totalFallaMin)} ${enCurso ? 'en' : 'por'} falla técnica${hizo}`

  const principal = grupos.find((g) => g.id === 'falla')?.lineas[0]
  const fraseP = objetivo > 0 ? `Salieron ${mil(piezas)} de las ${mil(objetivo)} piezas.` : `Salieron ${mil(piezas)} piezas.`
  const fraseC = principal && k.totalFallaMin > 0
    ? ` El ${Math.round((principal.min / cFalla) * 100)}${NB}% de la falla técnica fue ${principal.causa.toLowerCase()}${!principal.maquinas.startsWith('Las') && !principal.maquinas.includes(' y ') ? ' en una sola máquina' : ''}${sanas.length === 1 ? `; la ${sanas[0]} ${enCurso ? 'va' : 'cerró'} sin falla.` : '.'}`
    : ''

  // Anotación del gráfico: cuándo le pegó a la máquina destacada.
  let anotacion: InformeTurno['anotacion'] = null
  if (dominante) {
    const causaTop = Object.entries(dominante.kpi.grupos.falla?.causas ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]
    const tramos = dominante.kpi.fallas.filter((f) => f.causa === causaTop && f.sec >= 300)
    if (causaTop && tramos.length > 0) {
      const veces = tramos.length === 1 ? '1 detención larga' : `${tramos.length} detenciones largas`
      anotacion = {
        maquina: maquinaDestacada!,
        texto: `${nombreCausa(causaTop)}: ${veces} entre ${horaPared(tramos[0]!.desde)} y ${horaPared(tramos[tramos.length - 1]!.hasta)}`,
      }
    }
  }

  const disp = pm.map((x) => x.kpi.dispTecnicaPct)
  const disponibilidad = disp.every((d) => d != null)
    ? `${lista(disp.map((d) => (d === 100 ? '100' : dec1(d as number))))}${NB}%`
    : '—'
  const pzFalla = conFalla.reduce((a, x) => a + x.reparto.falla * (x.velocidad.medianaAndandoCpm ?? 0), 0)

  const pendientes = pm
    .flatMap((x, i) => x.kpi.fallas.map((f) => ({ f, maquina: nombres[i]! })))
    .sort((a, b) => b.f.sec - a.f.sec)
    .slice(0, 3)
    .sort((a, b) => a.f.desde.getTime() - b.f.desde.getTime())
    .map(({ f, maquina }) => ({ hora: horaPared(f.desde), causa: nombreCausa(f.causa), maquina, min: Math.round(f.sec / 60) }))

  return {
    titular,
    bajada: `${fraseP}${fraseC}`,
    filas,
    linea,
    grupos,
    totalDetenido,
    pctConCausa: totalDetenido > 0 ? Math.round(((totalDetenido - cSin) / totalDetenido) * 100) : null,
    maquinaDestacada,
    anotacion,
    objetivoPorVerificar: nombres.filter((_, i) => targetSospechoso(pm[i]!.velocidad)),
    respuesta: {
      mttrMin: k.mttrGlobalMin,
      eventos: k.totalEventos,
      reengancheMin: reengancheMayor(k),
      disponibilidad,
      piezasFalla: pzFalla > 0 ? Math.round(pzFalla) : null,
    },
    pendientes,
  }
}

export interface ResumenTendencia { valores: Array<{ etiqueta: string; min: number; hoy: boolean }>; texto: string }

/** Falla técnica por turno, en minutos-máquina, con su lectura en una frase. */
export function resumirTendencia(
  puntos: ReadonlyArray<{ dateKey: string; porMaquina: ReadonlyArray<{ fallaMin: number }> }>,
  dateKey: string,
): ResumenTendencia | null {
  if (puntos.length < 3) return null
  const valores = puntos.map((p) => ({
    etiqueta: String(Number(p.dateKey.slice(8, 10))),
    min: Math.round(suma(p.porMaquina.map((m) => m.fallaMin))),
    hoy: p.dateKey === dateKey,
  }))
  const orden = valores.map((v) => v.min).sort((a, b) => a - b)
  const n = orden.length
  const mediana = n % 2 ? orden[(n - 1) / 2]! : (orden[n / 2 - 1]! + orden[n / 2]!) / 2
  const ceros = orden.filter((v) => v === 0).length
  const hoy = valores.find((v) => v.hoy)?.min ?? null
  const posicion = hoy != null && hoy > 0 ? [...orden].reverse().indexOf(hoy) : -1
  const dicho = ['el más alto', 'el segundo más alto', 'el tercero más alto'][posicion]
  const cola = dicho ? `; este, ${dicho}.` : '.'
  return { valores, texto: `${ceros} de ${n} turnos ${ceros === 1 ? 'cerró' : 'cerraron'} sin falla técnica. Mediana ${Math.round(mediana)}${NB}min${cola}` }
}
