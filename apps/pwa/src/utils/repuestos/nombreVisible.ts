import { formatNombreSAP } from './formatNombreSAP'
import { normalizeForSearch } from './searchNormalize'

export interface NombreVisible {
  titulo: string
  oficial: string | null
  etiquetas: string[]
  otros: string[]
  esComun: boolean
}

type ConNombre = {
  textoBreve?: string | null
  nombresComunes?: readonly string[] | null
  alias?: string | null
  descripcion?: string | null
}

/** Clave de comparación: sin tildes, mayúsculas ni espacios. */
const clave = (t: string): string => normalizeForSearch(t).replace(/\s+/g, '')

/** Prioriza el primer nombre común y conserva las advertencias SAP sin modificar los datos. */
export function nombreVisible(r: ConNombre): NombreVisible {
  const nombres = (r.nombresComunes ?? []).map((nombre) => nombre.trim()).filter(Boolean)
  const comun = nombres[0]
  const { nombre, etiquetas } = formatNombreSAP(
    r.textoBreve?.trim() || r.descripcion?.trim() || r.alias?.trim(),
  )
  const sap = nombre || '(sin nombre)'

  if (!comun) {
    return { titulo: sap, oficial: null, etiquetas, otros: [], esComun: false }
  }

  const comunNormalizado = clave(comun)
  return {
    titulo: comun.charAt(0).toUpperCase() + comun.slice(1),
    oficial: clave(sap) === comunNormalizado ? null : sap,
    etiquetas,
    otros: nombres.slice(1).filter((otro) => clave(otro) !== comunNormalizado),
    esComun: true,
  }
}
