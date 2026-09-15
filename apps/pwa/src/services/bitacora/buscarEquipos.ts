/**
 * Buscador de «Equipo o área» de la bitácora sobre la jerarquía de la app.
 *
 * - Sin tildes ni mayúsculas, por palabras (todas deben aparecer, en cualquier
 *   orden: "142 baader" encuentra "EVISCERADORA BAADER 142 N2").
 * - Busca en nombre, alias y código SAP.
 * - Cada opción lleva PLANTA y ÁREA: hay equipos con el mismo nombre en Chonchi
 *   y en Yal, y sin eso se elige el equivocado.
 * - Orden: primero lo que EMPIEZA con lo escrito, luego palabras que empiezan
 *   así, luego el resto; a igualdad, lo ya usado en la bitácora arriba.
 */

export interface NodoJerarquia {
  id: string
  nombre: string
  alias?: string
  codigo?: string
  tipoNodo?: 'area' | 'equipo'
  parentId?: string | null
  path?: string[]
  activo?: boolean
  oculto?: boolean
}

export interface OpcionEquipo {
  id: string
  nombre: string
  tipo: 'area' | 'equipo'
  codigo: string
  planta: string
  area: string
  /** Texto normalizado donde se busca. */
  indice: string
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** "PLANTA CHONCHI" → "Planta Chonchi" para el subtítulo. */
function tituloLegible(s: string): string {
  const t = s.trim()
  if (t !== t.toUpperCase()) return t
  return t
    .toLowerCase()
    .split(' ')
    .map((p) => (p.length > 2 || /^n\d/.test(p) ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ')
}

/**
 * Arma las opciones desde los nodos. `path` va de la raíz al padre:
 * path[0] = empresa, path[1] = planta. El área es el ancestro de tipo `area`
 * más cercano (distinto de la planta y la empresa).
 */
export function construirOpcionesEquipo(nodos: readonly NodoJerarquia[]): OpcionEquipo[] {
  const porId = new Map(nodos.map((n) => [n.id, n]))
  const opciones: OpcionEquipo[] = []
  for (const n of nodos) {
    if (n.activo === false || n.oculto) continue
    const ruta = n.path ?? []
    // La raíz (empresa) y las plantas no son opciones útiles para un evento.
    if (ruta.length < 2) continue
    const planta = porId.get(ruta[1] ?? '')?.nombre ?? ''
    let area = ''
    for (let i = ruta.length - 1; i >= 2; i--) {
      const anc = porId.get(ruta[i] ?? '')
      if (anc && anc.tipoNodo === 'area') {
        area = anc.nombre
        break
      }
    }
    const tipo = n.tipoNodo === 'area' ? 'area' : 'equipo'
    opciones.push({
      id: n.id,
      nombre: n.nombre.trim(),
      tipo,
      codigo: n.codigo ?? '',
      planta: tituloLegible(planta),
      area: tituloLegible(area),
      indice: normalizar(`${n.nombre} ${n.alias ?? ''} ${n.codigo ?? ''}`),
    })
  }
  return opciones
}

export function buscarEquipos(
  opciones: readonly OpcionEquipo[],
  texto: string,
  { max = 8, usados = [] as readonly string[] } = {},
): OpcionEquipo[] {
  const q = normalizar(texto)
  if (q.length < 2) return []
  const terminos = q.split(' ')
  const usadosSet = new Set(usados.map(normalizar))
  const puntaje = (o: OpcionEquipo) => {
    const nombre = normalizar(o.nombre)
    let p = 0
    if (nombre.startsWith(q)) p += 100
    else if (terminos.every((t) => nombre.split(' ').some((w) => w.startsWith(t)))) p += 50
    if (usadosSet.has(nombre)) p += 30
    if (o.tipo === 'equipo') p += 5
    return p
  }
  return opciones
    .filter((o) => terminos.every((t) => o.indice.includes(t)))
    .map((o) => ({ o, p: puntaje(o) }))
    .sort((a, b) => b.p - a.p || a.o.nombre.localeCompare(b.o.nombre, 'es'))
    .slice(0, max)
    .map((x) => x.o)
}
