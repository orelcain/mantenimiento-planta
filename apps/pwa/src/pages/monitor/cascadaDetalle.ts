/**
 * El detalle de cada fila de la cascada: por máquina, por causa y por hora.
 *
 * ── La regla que manda ──────────────────────────────────────────────────────
 * Cada vista REPARTE el total de su fila, no lo recalcula. La cascada ya cerró
 * (capacidad − pérdidas = lo hecho) y el detalle no puede abrir un hueco: si la
 * fila dice −270, sus máquinas suman 270, sus causas suman 270 y sus horas
 * suman 270. Los pesos salen de Shoplogix; el total, de la cascada.
 *
 *   · detenciones → peso de cada causa: `equivMin` (o `lineMin` en payloads
 *     viejos); de cada máquina y cada hora: segundos de `stopEvents`.
 *   · micro       → `stopEvents` con razón micro; sin ellos, `porMaquina[].microMin`.
 *   · vacías      → esperado − ciclos de `serieMinuto`, solo en los minutos en
 *     que la máquina contó algo (andando). Los esperados por máquina (19+16+16)
 *     no están en la escala del ritmo de la cascada: por eso se usan como peso.
 *
 * Lo que no existe se devuelve null y la UI dice «sin dato». Nunca se rellena.
 */

import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { duenoDe } from '@/services/shoplogix/monitorEventos'

import type { Cascada } from './cascadaTurno'

const ES_MICRO = /micro\s*detenc/i

/** Quién responde de una parada. Programado no entra: está fuera de la capacidad. */
export type DuenoDetalle = 'mantencion' | 'externo' | 'sin-imputar'

export interface RenglonDetalle {
  nombre: string
  piezas: number
  /** Reparto por dueño (suma `piezas`). Solo en detenciones. */
  partes?: Partial<Record<DuenoDetalle, number>>
  /** Dueño de la fila entera (vista por causa). */
  dueno?: DuenoDetalle
  minutos?: number
  veces?: number
  /** Máquinas donde ocurrió (vista por causa). */
  maquinas?: string[]
  /** pz/min que pide la máquina (vista de vacías). */
  esperado?: number | null
}

export interface HoraDetalle {
  /** «08», hora de planta. */
  hora: string
  piezas: number
  partes?: Partial<Record<DuenoDetalle, number>>
  /** Minutos de esa hora que cubre la cascada, cuando no es la hora completa. */
  parcialMin?: number
}

export interface VistasFila {
  maquina: RenglonDetalle[] | null
  causa: RenglonDetalle[] | null
  hora: HoraDetalle[] | null
}

export interface DetalleCascada {
  /** Quién responde de lo no hecho. Suma `total`. */
  responde: { mantencion: number; externo: number; sinImputar: number; micro: number; vacias: number; total: number }
  detenciones: VistasFila | null
  micro: (VistasFila & { segundosPromedio: number | null }) | null
  vacias: VistasFila | null
}

/** Reparte un entero en proporción a los pesos y cierra exacto (resto mayor). */
export function repartir(total: number, pesos: number[]): number[] | null {
  const suma = pesos.reduce((a, p) => a + Math.max(0, p), 0)
  if (!(suma > 0) || !(total > 0)) return null
  const crudo = pesos.map((p) => (Math.max(0, p) / suma) * total)
  const base = crudo.map(Math.floor)
  let falta = Math.round(total) - base.reduce((a, b) => a + b, 0)
  const orden = crudo.map((c, i) => ({ i, r: c - Math.floor(c) })).sort((a, b) => b.r - a.r)
  for (let k = 0; falta > 0 && orden.length; k = (k + 1) % orden.length, falta--) base[orden[k]!.i]! += 1
  return base
}

/** Reparto por dueño de un renglón: pesos en segundos/minutos → piezas que suman `piezas`. */
function partesDe(piezas: number, pesos: Partial<Record<DuenoDetalle, number>>): Partial<Record<DuenoDetalle, number>> {
  const claves = (Object.keys(pesos) as DuenoDetalle[]).filter((k) => (pesos[k] ?? 0) > 0)
  const r = repartir(piezas, claves.map((k) => pesos[k] ?? 0))
  const out: Partial<Record<DuenoDetalle, number>> = {}
  if (r) claves.forEach((k, i) => { if (r[i]! > 0) out[k] = r[i]! })
  return out
}

/** «Evisceradora 1» → «Evisc. 1» para que entre en la columna; «Linea 1» queda igual. */
export function nombreMaquina(nombre: string): string {
  const t = nombre.trim()
  if (t.length <= 10) return t
  const m = /^(\D+?)\s*(\d+)$/.exec(t)
  return m ? `${m[1]!.trim().slice(0, 5)}. ${m[2]}` : t
}

/** Hora de planta (wall-clock-as-UTC) de un instante, «08». */
const horaDe = (ms: number) => new Date(ms).toISOString().slice(11, 13)
const HORA_MS = 60 * 60_000

/** Los tramos de hora de [desde, hasta): clave, inicio y minutos cubiertos. */
function horasDeVentana(desde: number, hasta: number): Array<{ clave: number; hora: string; min: number }> {
  const out: Array<{ clave: number; hora: string; min: number }> = []
  for (let h = Math.floor(desde / HORA_MS) * HORA_MS; h < hasta; h += HORA_MS) {
    const a = Math.max(h, desde); const b = Math.min(h + HORA_MS, hasta)
    out.push({ clave: h, hora: horaDe(h), min: Math.round((b - a) / 60_000) })
  }
  return out
}

/** Reparte segundos de un evento [ini, ini+s) entre las horas, recortado a la ventana. */
function sumarPorHora(acc: Map<number, number>, ini: number, s: number, desde: number, hasta: number) {
  let a = Math.max(ini, desde); const fin = Math.min(ini + s * 1000, hasta)
  while (a < fin) {
    const h = Math.floor(a / HORA_MS) * HORA_MS
    const b = Math.min(h + HORA_MS, fin)
    acc.set(h, (acc.get(h) ?? 0) + (b - a) / 1000)
    a = b
  }
}

export function detalleCascada(args: {
  live: PublicMonitorLive
  cascada: Cascada
  /** La serie minuto a minuto del turno visto (pulso vigente o archivo). */
  serieMinuto?: { desde: string; maquinas: Array<{ id: string; esperado: number | null; cycles: number[] }> } | null
}): DetalleCascada {
  const { live, cascada } = args
  const tb = live.timeBreakdown
  const pz = (k: string) => -(cascada.pasos.find((p) => p.clave === k)?.piezas ?? 0)
  const pzDet = pz('detenciones'); const pzMicro = pz('micro'); const pzVac = pz('vacias')

  const nombrePorId = new Map((live.machines ?? []).map((m) => [m.id, nombreMaquina(m.name)]))
  const maquinaDe = (m: number | undefined) => {
    if (m == null) return null
    const id = live.stopMachines?.[m]
    return id ? nombrePorId.get(id) ?? id : null
  }

  /* La ventana de la cascada, en reloj de planta. */
  const desdeMs = Date.parse(live.effectiveStart ?? live.scheduledStart ?? live.series?.[0]?.t ?? '')
  const hastaMs = cascada.corteWallMs ?? NaN
  const ventanaOk = Number.isFinite(desdeMs) && Number.isFinite(hastaMs) && hastaMs > desdeMs
  const horas = ventanaOk ? horasDeVentana(desdeMs, hastaMs) : []

  /* ── Detenciones por causa (y el dueño que define la banda) ─────────────── */
  const recuperables = tb?.recoverable ?? []
  const conEquiv = recuperables.length > 0 && recuperables.every((x) => x.equivMin != null)
  const causasDet = recuperables.filter((x) => !ES_MICRO.test(x.reason || ''))
  const razonesDet = new Set(causasDet.map((x) => x.reason))
  const razonesMicro = new Set(recuperables.filter((x) => ES_MICRO.test(x.reason || '')).map((x) => x.reason))
  const pesoCausa = causasDet.map((x) => Math.max(0, conEquiv ? x.equivMin ?? 0 : x.lineMin ?? x.min ?? 0))
  /* Sin equivalentes, la cascada suma a las detenciones lo que el desglose no
     cubre: se muestra como tal, sin dueño. */
  const sumaLinea = recuperables.reduce((a, x) => a + Math.max(0, x.lineMin ?? x.min ?? 0), 0)
  const sinDesglosar = conEquiv ? 0 : Math.max(0, (tb?.recoverableMin ?? 0) - sumaLinea)
  const filasCausa = causasDet.map((x, i) => ({ nombre: x.reason, peso: pesoCausa[i]!, veces: x.count ?? 0, min: conEquiv ? x.machineMin ?? x.min : x.lineMin ?? x.min, dueno: duenoDe(x.reason).dueno as DuenoDetalle }))
  if (sinDesglosar > 0) filasCausa.push({ nombre: 'Sin desglosar', peso: sinDesglosar, veces: 0, min: sinDesglosar, dueno: 'sin-imputar' })
  const repCausa = repartir(pzDet, filasCausa.map((f) => f.peso))
  const duenoPorRazon = new Map(filasCausa.map((f) => [f.nombre, f.dueno]))

  /* Eventos ubicados de la fila, con máquina y hora. */
  const eventos = (live.stopEvents ?? []).map((e) => ({ ...e, razon: live.stopReasons?.[e.r] ?? '', ms: Date.parse(e.f) }))
    .filter((e) => Number.isFinite(e.ms) && e.s > 0)
  const enVentana = (e: { ms: number; s: number }) => !ventanaOk || (e.ms < hastaMs && e.ms + e.s * 1000 > desdeMs)
  const recorteS = (e: { ms: number; s: number }) => ventanaOk ? Math.max(0, (Math.min(e.ms + e.s * 1000, hastaMs) - Math.max(e.ms, desdeMs)) / 1000) : e.s
  const evDet = eventos.filter((e) => razonesDet.has(e.razon) && enVentana(e))
  const evMicro = eventos.filter((e) => (razonesMicro.has(e.razon) || ES_MICRO.test(e.razon)) && enVentana(e))

  const causasPorMaquina = new Map<string, Set<string>>()
  for (const e of evDet) {
    const m = maquinaDe(e.m); if (!m) continue
    const s = causasPorMaquina.get(e.razon) ?? new Set<string>(); s.add(m); causasPorMaquina.set(e.razon, s)
  }

  let detenciones: VistasFila | null = null
  let responde = { mantencion: 0, externo: 0, sinImputar: 0 }
  if (pzDet > 0) {
    const causa = repCausa
      ? filasCausa.map((f, i) => ({
        nombre: f.nombre, piezas: repCausa[i]!, dueno: f.dueno, veces: f.veces,
        minutos: f.min != null ? Math.round(f.min) : undefined,
        maquinas: causasPorMaquina.has(f.nombre) ? [...causasPorMaquina.get(f.nombre)!].sort() : undefined,
      })).filter((r) => r.piezas > 0).sort((a, b) => b.piezas - a.piezas)
      : null
    if (causa) {
      for (const r of causa) {
        if (r.dueno === 'mantencion') responde.mantencion += r.piezas
        else if (r.dueno === 'externo') responde.externo += r.piezas
        else responde.sinImputar += r.piezas
      }
    } else responde = { mantencion: 0, externo: 0, sinImputar: pzDet }

    detenciones = {
      causa,
      maquina: porMaquina(pzDet, evDet, maquinaDe, recorteS, (e) => duenoPorRazon.get(e.razon) ?? 'sin-imputar'),
      hora: porHora(pzDet, evDet, horas, desdeMs, hastaMs, (e) => duenoPorRazon.get(e.razon) ?? 'sin-imputar'),
    }
  }

  /* ── Microdetenciones ───────────────────────────────────────────────────── */
  let micro: DetalleCascada['micro'] = null
  if (pzMicro > 0) {
    const vecesMicro = cascada.pasos.find((p) => p.clave === 'micro')?.veces ?? 0
    const segMicro = evMicro.reduce((a, e) => a + recorteS(e), 0)
    let maquina = porMaquina(pzMicro, evMicro, maquinaDe, recorteS, null)
    if (!maquina) {
      /* Sin eventos ubicados: lo que el backend ya sumó por máquina. */
      const pm = (live.mantencion?.porMaquina ?? []).filter((x) => x.microMin > 0)
      const r = repartir(pzMicro, pm.map((x) => x.microMin))
      maquina = r ? pm.map((x, i) => ({ nombre: nombreMaquina(x.name), piezas: r[i]!, veces: x.microN })).filter((x) => x.piezas > 0).sort((a, b) => b.piezas - a.piezas) : null
    }
    micro = {
      maquina,
      causa: [{ nombre: 'Microdetención', piezas: pzMicro, veces: vecesMicro }],
      hora: porHora(pzMicro, evMicro, horas, desdeMs, hastaMs, null),
      segundosPromedio: evMicro.length ? Math.round(segMicro / evMicro.length) : null,
    }
  }

  /* ── Silletas / carros vacíos ───────────────────────────────────────────── */
  let vacias: VistasFila | null = null
  if (pzVac > 0) {
    vacias = { maquina: null, causa: null, hora: null }
    const s = args.serieMinuto
    const t0 = s ? Date.parse(s.desde) : NaN
    if (s && Number.isFinite(t0) && ventanaOk) {
      const objetivoPorId = new Map((live.machines ?? []).map((m) => [m.id, m.targetCpm ?? null]))
      const porMaq: Array<{ nombre: string; deficit: number; esperado: number | null }> = []
      const porH = new Map<number, number>()
      for (const m of s.maquinas) {
        const esperado = m.esperado ?? objetivoPorId.get(m.id) ?? null
        if (!(esperado && esperado > 0)) continue
        let deficit = 0
        m.cycles.forEach((c, i) => {
          const ms = t0 + i * 60_000
          if (ms < desdeMs || ms >= hastaMs || !(c > 0)) return
          const d = Math.max(0, esperado - c)
          deficit += d
          const h = Math.floor(ms / HORA_MS) * HORA_MS
          porH.set(h, (porH.get(h) ?? 0) + d)
        })
        porMaq.push({ nombre: nombrePorId.get(m.id) ?? m.id, deficit, esperado })
      }
      const r = repartir(pzVac, porMaq.map((x) => x.deficit))
      if (r) {
        vacias.maquina = porMaq.map((x, i) => ({ nombre: x.nombre, piezas: r[i]!, esperado: x.esperado }))
          .filter((x) => x.piezas > 0).sort((a, b) => b.piezas - a.piezas)
        const rh = repartir(pzVac, horas.map((h) => porH.get(h.clave) ?? 0))
        vacias.hora = rh ? horas.map((h, i) => ({ hora: h.hora, piezas: rh[i]!, ...(h.min < 60 ? { parcialMin: h.min } : {}) })) : null
      }
    }
  }

  const total = pzDet + pzMicro + pzVac
  return {
    responde: { ...responde, micro: pzMicro, vacias: pzVac, total },
    detenciones, micro, vacias,
  }
}

type Ev = { m?: number; ms: number; s: number; razon: string }

function porMaquina(
  total: number, evs: Ev[], maquinaDe: (m: number | undefined) => string | null,
  recorteS: (e: Ev) => number, duenoDeEv: ((e: Ev) => DuenoDetalle) | null,
): RenglonDetalle[] | null {
  const acc = new Map<string, { seg: number; veces: number; partes: Partial<Record<DuenoDetalle, number>> }>()
  for (const e of evs) {
    const n = maquinaDe(e.m); if (!n) continue
    const s = recorteS(e); if (!(s > 0)) continue
    const a = acc.get(n) ?? { seg: 0, veces: 0, partes: {} }
    a.seg += s; a.veces += 1
    if (duenoDeEv) { const d = duenoDeEv(e); a.partes[d] = (a.partes[d] ?? 0) + s }
    acc.set(n, a)
  }
  const filas = [...acc.entries()]
  const r = repartir(total, filas.map(([, a]) => a.seg))
  if (!r) return null
  return filas.map(([nombre, a], i) => ({
    nombre, piezas: r[i]!, minutos: Math.round(a.seg / 60), veces: a.veces,
    ...(duenoDeEv ? { partes: partesDe(r[i]!, a.partes) } : {}),
  })).filter((x) => x.piezas > 0).sort((a, b) => b.piezas - a.piezas)
}

function porHora(
  total: number, evs: Ev[], horas: Array<{ clave: number; hora: string; min: number }>,
  desde: number, hasta: number, duenoDeEv: ((e: Ev) => DuenoDetalle) | null,
): HoraDetalle[] | null {
  if (!horas.length) return null
  const seg = new Map<number, number>()
  const partes = new Map<number, Partial<Record<DuenoDetalle, number>>>()
  for (const e of evs) {
    const propio = new Map<number, number>()
    sumarPorHora(propio, e.ms, e.s, desde, hasta)
    for (const [h, s] of propio) {
      seg.set(h, (seg.get(h) ?? 0) + s)
      if (duenoDeEv) {
        const p = partes.get(h) ?? {}; const d = duenoDeEv(e); p[d] = (p[d] ?? 0) + s; partes.set(h, p)
      }
    }
  }
  const r = repartir(total, horas.map((h) => seg.get(h.clave) ?? 0))
  if (!r) return null
  return horas.map((h, i) => ({
    hora: h.hora, piezas: r[i]!,
    ...(h.min < 60 ? { parcialMin: h.min } : {}),
    ...(duenoDeEv ? { partes: partesDe(r[i]!, partes.get(h.clave) ?? {}) } : {}),
  }))
}
