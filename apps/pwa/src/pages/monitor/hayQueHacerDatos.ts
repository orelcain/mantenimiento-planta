/**
 * «¿Hay que hacer algo?» (mockup v4, tarjeta 2): acciones con dueño y lo que se gana, sacadas de las piezas de
 * Gate 0 ya clasificadas (`clasificarP0`) y del lote en curso. Puro, aparte del componente.
 *
 * Reglas (umbrales ilustrativos, a validar en terreno):
 *  - Limpiar fotocélula: ≥ 12 piezas de fotocélula en los últimos 15 min (Mantención).
 *  - Revisar gates: el lote en curso es distinto del anterior (±10 % de peso medio o +10 puntos en un calibre).
 *  - Agregar gate: una combinación de calibre y calidad sin gate que ya suma ≥ 50 kg a P0 en el turno.
 *  - Repartir un calibre: ≥ 5 piezas de «puerta no preparada» en 15 min (exige el motivo exacto de Puerta 0).
 * Los últimos 15 min se cuentan hasta la última pieza leída, no hasta el reloj.
 */
import type { PiezaP0, ResumenP0 } from '@/services/grader/espejo/motivoP0'
import { RAFAGA_UMBRAL_PZ } from '@/services/grader/espejo/motivoP0'
import type { LoteVivo } from '@/services/grader/espejo/pescaVivo'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'

export const VENTANA_ACCION_MS = 15 * 60_000
export const ACCION_FOTO_PZ = RAFAGA_UMBRAL_PZ
export const ACCION_AGREGAR_KG = 50
export const ACCION_PUERTA_PZ = 5
export const LOTE_PESO_PCT = 10
export const LOTE_CALIBRE_PTS = 10

const MOTIVO_FOTO = 'No leído por fotocélula'
const MOTIVO_PUERTA = 'Puerta no preparada'
const MOTIVO_FDL = 'Fuera de límites'

/** Lo que abre la acción al tocarla (Sheet de la tarjeta «Por qué va a P0» o «Lotes del turno»). */
export type DestinoAccion =
  | { tipo: 'tramo'; desdeMs: number; hastaMs: number }
  | { tipo: 'combo'; calibres: string[]; calidad: string }
  | { tipo: 'lote'; lote: string }

export interface Accion {
  clave: string
  dueno: 'mantencion' | 'seteo'
  titulo: string
  detalle: string
  /** Alguna pieza de la acción no trae su motivo exacto de Puerta 0. */
  estimado: boolean
  destino: DestinoAccion
}

export interface HayQueHacer {
  acciones: Accion[]
  kgMantencion: number
  kgSeteo: number
}

const coma0 = (n: number) => milesPunto(Math.round(n))
/** «8-10 lb / 10-12 lb» → «8-10 / 10-12 lb»; «12-UP lb» → «12+ lb». */
export function rotuloCalibres(c: readonly string[]): string {
  const s = c.map((x) => x.replace(' lb', '').replace('12-UP', '12+'))
  return s.length === 0 ? 'bajo 2 lb' : `${s.join(' / ')} lb`
}
const listaGates = (g: readonly number[]) => {
  const s = [...new Set(g)].sort((a, b) => a - b)
  if (s.length === 0) return ''
  return s.length === 1 ? `gate ${s[0]}` : `gates ${s.slice(0, -1).join(', ')} y ${s[s.length - 1]}`
}
const esFoto = (p: PiezaP0) => p.dueno === 'mantencion'
const esPuertaExacta = (p: PiezaP0) => p.exacto && p.motivo === MOTIVO_PUERTA
/** Piezas «Fuera de límites» por falta de gate (exactas o estimadas). La «calidad D» va a P0 a propósito. */
const sinGate = (p: PiezaP0) =>
  p.dueno === 'seteo' && (!p.exacto || p.motivo === MOTIVO_FDL) && (p.causa === 'sin-gate-peso' || p.causa === 'calidad-sin-gate')

/** El lote en curso comparado con el anterior: distinto si el peso medio cambia ±10 % o un calibre sube 10 puntos. */
export function compararLote(l: LoteVivo | null): { distinto: boolean; sube: { calibre: string; pct: number; antes: number } | null; pesoPct: number | null } {
  if (!l?.anterior) return { distinto: false, sube: null, pesoPct: null }
  const a = l.anterior.perfil
  const b = l.perfil
  const pesoPct = a.pesoMedioKg && b.pesoMedioKg ? ((b.pesoMedioKg - a.pesoMedioKg) / a.pesoMedioKg) * 100 : null
  let sube: { calibre: string; pct: number; antes: number } | null = null
  for (const [c, pct] of Object.entries(b.calibrePct)) {
    const antes = a.calibrePct[c] ?? 0
    if (pct - antes >= LOTE_CALIBRE_PTS && (!sube || pct - antes > sube.pct - sube.antes)) sube = { calibre: c, pct, antes }
  }
  return { distinto: sube !== null || (pesoPct !== null && Math.abs(pesoPct) >= LOTE_PESO_PCT), sube, pesoPct }
}

/** Las acciones del momento. `hastaMs`: la última pieza leída. */
export function hayQueHacer(r: ResumenP0, lote: LoteVivo | null, hastaMs: number): HayQueHacer {
  const acciones: Accion[] = []
  const desde = hastaMs - VENTANA_ACCION_MS
  const ult = r.porPieza.filter((p) => {
    const t = Date.parse(p.ts)
    return t > desde && t <= hastaMs
  })

  const foto = ult.filter(esFoto)
  const fotoPz = foto.reduce((s, p) => s + p.cantidad, 0)
  if (fotoPz >= ACCION_FOTO_PZ) {
    const est = foto.some((p) => !p.exacto || p.motivo !== MOTIVO_FOTO)
    acciones.push({
      clave: 'foto',
      dueno: 'mantencion',
      titulo: 'Limpiar fotocélula',
      detalle: `${fotoPz} pz en 15 min · ${coma0(foto.reduce((s, p) => s + p.kg, 0))} kg a P0${est ? ' (estimado)' : ''}`,
      estimado: est,
      destino: { tipo: 'tramo', desdeMs: desde, hastaMs },
    })
  }

  const cmp = compararLote(lote)
  if (lote && cmp.distinto) {
    const corto = `…${lote.lote.slice(-3)}`
    const cal = cmp.sube ? rotuloCalibres([cmp.sube.calibre]) : null
    acciones.push({
      clave: 'lote',
      dueno: 'seteo',
      titulo: cal ? `Revisar gates de ${cal}` : 'Revisar gates',
      detalle: cmp.sube
        ? `lote ${corto} distinto: ${cal} pasa a ${Math.round(cmp.sube.pct)} % (antes ${Math.round(cmp.sube.antes)} %)`
        : `lote ${corto} distinto: peso medio ${cmp.pesoPct! > 0 ? '+' : ''}${Math.round(cmp.pesoPct!)} %`,
      estimado: false,
      destino: { tipo: 'lote', lote: lote.lote },
    })
  }

  const combos = new Map<string, { calibres: string[]; calidad: string; pz: number; kg: number; est: boolean }>()
  for (const p of r.porPieza) {
    if (!sinGate(p)) continue
    const k = `${p.calibres.join('/')}|${p.calidad}`
    const c = combos.get(k) ?? { calibres: p.calibres, calidad: p.calidad, pz: 0, kg: 0, est: false }
    c.pz += p.cantidad
    c.kg += p.kg
    c.est ||= !p.exacto
    combos.set(k, c)
  }
  for (const c of [...combos.values()].filter((x) => x.kg >= ACCION_AGREGAR_KG).sort((a, b) => b.kg - a.kg)) {
    acciones.push({
      clave: `agregar-${c.calibres.join('/')}-${c.calidad}`,
      dueno: 'seteo',
      titulo: `Agregar gate ${rotuloCalibres(c.calibres)} ${c.calidad}`,
      detalle: `${coma0(c.kg)} kg a P0 (${milesPunto(c.pz)} pz) en el turno${c.est ? ' · estimado' : ''}`,
      estimado: c.est,
      destino: { tipo: 'combo', calibres: c.calibres, calidad: c.calidad },
    })
  }

  const puerta = ult.filter(esPuertaExacta)
  const puertaPz = puerta.reduce((s, p) => s + p.cantidad, 0)
  if (puertaPz >= ACCION_PUERTA_PZ) {
    // El calibre que más se repite en esas piezas (la zona 8-10/10-12 cuenta como sus dos calibres).
    const n = new Map<string, number>()
    for (const p of puerta) for (const c of p.calibres) n.set(c, (n.get(c) ?? 0) + p.cantidad)
    const cal = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const gates = cal ? puerta.flatMap((p) => p.gatesCalibre[cal] ?? []) : []
    acciones.push({
      clave: 'puerta',
      dueno: 'seteo',
      titulo: cal ? `Repartir ${rotuloCalibres([cal])} en más gates` : 'Repartir el calibre en más gates',
      detalle: `${puertaPz} pz de puerta no preparada en 15 min${gates.length ? ` (${listaGates(gates)})` : ''}`,
      estimado: false,
      destino: { tipo: 'tramo', desdeMs: desde, hastaMs },
    })
  }

  return { acciones, kgMantencion: r.mantencion.kg, kgSeteo: r.seteo.kg }
}
