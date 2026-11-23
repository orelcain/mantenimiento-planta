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
import type { LoteVivo, PerfilPesca } from '@/services/grader/espejo/pescaVivo'
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import { aPieza, type PiezaArbol } from './porQueP0Datos'

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
/** «D», «Calidad D» o «CALIDAD D»: la calidad D va a P0 a propósito, no pide gate. */
export const esCalidadD = (c: string) => /(^|\s)D$/i.test(c.trim())
/** Piezas «Fuera de límites» por falta de gate (exactas o estimadas). La «calidad D» va a P0 a propósito. */
const sinGate = (p: PiezaP0) =>
  p.dueno === 'seteo' && (!p.exacto || p.motivo === MOTIVO_FDL) && (p.causa === 'sin-gate-peso' || p.causa === 'calidad-sin-gate') && !esCalidadD(p.calidad)

const claveCombo = (calibres: readonly string[], calidad: string) => `${calibres.join('/')}|${calidad}`

/** Las piezas que explican una acción «Agregar gate»: las mismas que suma, de ese calibre y calidad, para la hoja. */
export function piezasDeCombo(porPieza: readonly PiezaP0[], calibres: readonly string[], calidad: string): PiezaArbol[] {
  const k = claveCombo(calibres, calidad)
  return porPieza.filter((p) => sinGate(p) && claveCombo(p.calibres, p.calidad) === k).map((p) => aPieza(p, p.causa === 'calidad-sin-gate' ? 'calidad' : 'calibre'))
}

export interface CompararLote {
  distinto: boolean
  /** El calibre que más sube y el que más baja (puntos de %, por peso), con su % antes y ahora. */
  sube: { calibre: string; pct: number; antes: number } | null
  baja: { calibre: string; pct: number; antes: number } | null
  pesoPct: number | null
}

/**
 * Un lote comparado con el anterior: distinto si el peso medio cambia ±10 % o un calibre sube 10 puntos. Calibre
 * POR PESO (`calibrePesoPct`, cada 2 lb): lo que trae el pescado, no el programa de las gates (como el mockup v4).
 * La diferencia se redondea a 1 decimal antes de comparar con el umbral.
 */
export function compararPerfiles(a: PerfilPesca, b: PerfilPesca): CompararLote {
  const pesoPct = a.pesoMedioKg && b.pesoMedioKg ? ((b.pesoMedioKg - a.pesoMedioKg) / a.pesoMedioKg) * 100 : null
  let sube: CompararLote['sube'] = null
  let baja: CompararLote['baja'] = null
  let dSube = -Infinity
  let dBaja = Infinity
  for (const c of new Set([...Object.keys(a.calibrePesoPct), ...Object.keys(b.calibrePesoPct)])) {
    const pct = b.calibrePesoPct[c] ?? 0
    const antes = a.calibrePesoPct[c] ?? 0
    const d = Math.round((pct - antes) * 10) / 10
    if (d > dSube) { dSube = d; sube = { calibre: c, pct, antes } }
    if (d < dBaja) { dBaja = d; baja = { calibre: c, pct, antes } }
  }
  const subeFirme = dSube >= LOTE_CALIBRE_PTS
  return { distinto: subeFirme || (pesoPct !== null && Math.abs(pesoPct) >= LOTE_PESO_PCT), sube: subeFirme ? sube : null, baja, pesoPct }
}

/** El lote en curso comparado con el anterior (ver `compararPerfiles`). */
export function compararLote(l: LoteVivo | null): CompararLote {
  if (!l?.anterior) return { distinto: false, sube: null, baja: null, pesoPct: null }
  return compararPerfiles(l.anterior.perfil, l.perfil)
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
        ? `El lote ${corto} trae más ${cal}: ${Math.round(cmp.sube.pct)} % del peso (el anterior, ${Math.round(cmp.sube.antes)} %)`
        : `El lote ${corto} pesa ${cmp.pesoPct! > 0 ? '+' : ''}${Math.round(cmp.pesoPct!)} % por pieza respecto del anterior`,
      estimado: false,
      destino: { tipo: 'lote', lote: lote.lote },
    })
  }

  const combos = new Map<string, { calibres: string[]; calidad: string; pz: number; kg: number; est: boolean }>()
  for (const p of r.porPieza) {
    if (!sinGate(p)) continue
    const k = claveCombo(p.calibres, p.calidad)
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
      detalle: `${milesPunto(c.pz)} pz · ${coma0(c.kg)} kg fueron a P0 porque ninguna gate recibe ${rotuloCalibres(c.calibres)} ${c.calidad}${c.est ? ' (estimado)' : ''}`,
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
