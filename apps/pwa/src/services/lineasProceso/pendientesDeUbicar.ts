import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/**
 * Los equipos que alguien ESCRIBIÓ A MANO en la bitácora y no calzan con nada: ni con el
 * árbol de equipos ni con un elemento `manual:` del diagrama de líneas (Orel, 21-09-2026).
 *
 * El caso que lo trajo: un técnico escribió «baader 143» —no le atinó a la búsqueda— y era
 * la BAADER 142 N1, que sí existe. El evento quedó con `equipoId: null`, el historial lo
 * declara «sin ubicar», la inspección lo declara «sin evaluar» y nadie se entera hasta que
 * intenta ubicarlo. Esta lista es lo que se le muestra al admin del editor de líneas para que
 * lo resuelva desde ahí: elegir el equipo real (y corregir los eventos), crear un elemento
 * manual con ese nombre, o decir «no es un equipo» y que no vuelva.
 *
 * ⚠ La bandeja NO se guarda: se deduce de los eventos cada vez. Guardarla sería una segunda
 * verdad que se desincroniza de la bitácora. Lo único que se persiste es la lista de nombres
 * descartados («no es un equipo»), en el grafo.
 */
export interface EquipoPendiente {
  /** Nombre normalizado (sin tildes, minúsculas, un espacio): la llave del grupo. */
  clave: string
  /** Cómo lo escribieron la última vez, para mostrarlo tal cual. */
  nombre: string
  /** Del más reciente al más antiguo. */
  eventos: EventoBitacora[]
  /** `fechaTurno` del más reciente. */
  ultimo: string
}

/**
 * Nombres comparables: sin tildes, sin dobles espacios y en minúscula. La misma llave que usa
 * `useInspeccion` para casar un evento con un elemento manual por nombre.
 */
export function claveDeNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function pendientesDeUbicar(
  eventos: readonly EventoBitacora[],
  opciones: {
    /** Nombres del árbol (nombre y alias) y de los elementos manuales del diagrama. */
    nombresConocidos: Iterable<string>
    /** Claves ya marcadas «no es un equipo». */
    descartados?: readonly string[]
  },
): EquipoPendiente[] {
  const conocidos = new Set<string>()
  for (const n of opciones.nombresConocidos) {
    const k = claveDeNombre(n)
    if (k) conocidos.add(k)
  }
  const descartados = new Set(opciones.descartados ?? [])

  const grupos = new Map<string, EquipoPendiente>()
  for (const e of eventos) {
    // Con `equipoId` el evento ya está ligado al árbol: no hay nada que ubicar.
    if (e.equipoId) continue
    const nombre = (e.equipo ?? '').trim()
    const clave = claveDeNombre(nombre)
    if (!clave || clave === 'sin equipo') continue
    if (conocidos.has(clave) || descartados.has(clave)) continue
    const g = grupos.get(clave)
    if (g) {
      g.eventos.push(e)
    } else {
      grupos.set(clave, { clave, nombre, eventos: [e], ultimo: e.fechaTurno })
    }
  }

  for (const g of grupos.values()) {
    g.eventos.sort((a, b) => (b.fechaTurno > a.fechaTurno ? 1 : b.fechaTurno < a.fechaTurno ? -1 : 0))
    g.ultimo = g.eventos[0]?.fechaTurno ?? g.ultimo
    g.nombre = g.eventos[0]?.equipo?.trim() || g.nombre
  }
  // Primero el que más se repite: es el que más falla sin cobrar. A igualdad, el más reciente.
  return [...grupos.values()].sort((a, b) => b.eventos.length - a.eventos.length || (b.ultimo > a.ultimo ? 1 : b.ultimo < a.ultimo ? -1 : 0))
}

/** Lo que hay que reescribir en cada evento al decir «es este equipo». */
export interface EquipoElegido {
  id: string
  nombre: string
  codigo: string
}
