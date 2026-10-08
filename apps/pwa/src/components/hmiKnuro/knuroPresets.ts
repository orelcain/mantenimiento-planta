/**
 * Presets del simulador HMI Knuro partidos en sus datos: planta · línea · máquina.
 *
 * Los presets de Firestore se llaman «Planta Principal - BAA142 - N1»: tres datos en una frase.
 * Para elegirlos con dos controles segmentados (Planta y Máquina, la línea es texto fijo) se
 * parten por « - ». Si algún nombre no calza el patrón, hay más de una línea, más de 3 plantas
 * o más de 4 máquinas en una planta, el modelo sale `null` y la página cae a un menú emergente
 * agrupado por planta (`agruparPorPlanta`). Puro: sin React ni DOM, probado en __tests__.
 */

export interface PresetPartes {
  /** Nombre completo, tal cual está en Firestore (es la clave y el :presetId de la URL). */
  name: string
  /** «Principal», «Yal» (sin la palabra «Planta»). */
  planta: string
  /** Código de línea tal como viene: «BAA142». */
  linea: string
  /** Número de máquina: «1», «2», «3». */
  maquina: string
}

export interface ModeloPresets {
  plantas: string[]
  /** Máquinas en orden numérico, unión de todas las plantas. */
  maquinas: string[]
  linea: string
  /** planta → máquina → nombre del preset */
  mapa: Record<string, Record<string, string>>
}

const MAX_PLANTAS = 3
const MAX_MAQUINAS = 4

/** «Planta Principal - BAA142 - N1» → {planta:'Principal', linea:'BAA142', maquina:'1'}; si no calza, null. */
export function partirPreset(name: string): PresetPartes | null {
  const partes = String(name ?? '').split(/\s+[-–—]\s+/).map(s => s.trim())
  if (partes.length !== 3 || partes.some(p => !p)) return null
  const [rawPlanta, rawLinea, rawMaq] = partes as [string, string, string]
  const planta = rawPlanta.replace(/^planta\s+/i, '').trim()
  const linea = rawLinea.replace(/\s+/g, '').toUpperCase()
  const m = rawMaq.match(/^(?:n|nro\.?|n[°º])\s*(\d{1,2})$/i)
  if (!planta || !/^[A-Z]{2,5}\d{2,4}$/.test(linea) || !m) return null
  return { name, planta, linea, maquina: String(Number(m[1])) }
}

/** Modelo para los segmentados, o null si hay que caer al menú emergente. */
export function modeloPresets(names: string[]): ModeloPresets | null {
  if (names.length === 0) return null
  const plantas: string[] = []
  const maquinas = new Set<string>()
  const mapa: Record<string, Record<string, string>> = {}
  let linea: string | null = null
  for (const n of names) {
    const p = partirPreset(n)
    if (!p) return null
    if (linea === null) linea = p.linea
    else if (linea !== p.linea) return null
    if (!mapa[p.planta]) { mapa[p.planta] = {}; plantas.push(p.planta) }
    if (mapa[p.planta]![p.maquina]) return null // duplicado: ambiguo
    mapa[p.planta]![p.maquina] = n
    maquinas.add(p.maquina)
  }
  if (plantas.length > MAX_PLANTAS) return null
  if (plantas.some(pl => Object.keys(mapa[pl]!).length > MAX_MAQUINAS)) return null
  return {
    plantas,
    maquinas: [...maquinas].sort((a, b) => Number(a) - Number(b)),
    linea: linea!,
    mapa,
  }
}

/** Al cambiar de planta se conserva la máquina si existe ahí; si no, la primera disponible. */
export function presetAlCambiarPlanta(modelo: ModeloPresets, planta: string, maquinaActual: string | null): string | null {
  const fila = modelo.mapa[planta]
  if (!fila) return null
  if (maquinaActual && fila[maquinaActual]) return fila[maquinaActual]!
  const primera = modelo.maquinas.find(m => fila[m])
  return primera ? fila[primera]! : null
}

/** «BAA142» → «Baader 142». Otro código se muestra tal cual. */
export function nombreLinea(linea: string): string {
  const m = linea.match(/^BAA(\d+)$/)
  return m ? `Baader ${m[1]}` : linea
}

/** Abreviatura de planta usada en terreno (confirmada: Planta Principal = PP). */
const ABREV_PLANTA: Record<string, string> = { Principal: 'PP' }

/** Frase de lectura: «Planta Principal (PP) · Baader 142 N°1» / «Planta Yal · Baader 142 N°2». */
export function frasePreset(p: PresetPartes): string {
  const ab = ABREV_PLANTA[p.planta]
  return `Planta ${p.planta}${ab ? ` (${ab})` : ''} · ${nombreLinea(p.linea)} N°${p.maquina}`
}

/** Respaldo del menú emergente: grupos por planta (o «Otros» si el nombre no calza), en el orden dado. */
export function agruparPorPlanta(names: string[]): { grupo: string; items: { name: string; label: string }[] }[] {
  const out: { grupo: string; items: { name: string; label: string }[] }[] = []
  const idx = new Map<string, number>()
  for (const n of names) {
    const p = partirPreset(n)
    const grupo = p ? `Planta ${p.planta}` : 'Otros'
    const label = p ? `${nombreLinea(p.linea)} N°${p.maquina}` : n
    if (!idx.has(grupo)) { idx.set(grupo, out.length); out.push({ grupo, items: [] }) }
    out[idx.get(grupo)!]!.items.push({ name: n, label })
  }
  return out
}
