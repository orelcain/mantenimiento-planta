import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'

/**
 * El nombre del equipo como lo escribe una persona, no como lo grita SAP:
 * «DESPLAZADOR AUTOMATICO 1» → «Desplazador automático 1». Solo para leer en
 * pantalla (DESIGN.md §2 ⚠️ADELANTA 2: las mayúsculas son dato, no diseño); los
 * envíos (correo, Excel, WhatsApp) siguen con el nombre tal cual está guardado.
 */

/** Siglas y modelos de la planta que `formatNombreSAP` no conoce. */
const SIGLAS_PLANTA = new Set(['GEA', 'HG', 'HB', 'FRL', 'MS4/12', 'AK300', 'TP-6000', 'E-PACK', 'NH3', 'NH₃', 'PRIL', 'CIP', 'RILES'])
/** Marcas que van con inicial mayúscula, no en bloque. */
const MARCAS = new Map([
  ['BAADER', 'Baader'],
  ['MAREL', 'Marel'],
  ['KNURO', 'Knuro'],
  ['MARELEC', 'Marelec'],
  ['FISHKEN', 'Fishken'],
  ['PIMPONEO', 'Pimponeo'],
])

export function nombreEquipoLegible(equipo: string | null | undefined): string {
  const crudo = (equipo ?? '').trim()
  if (!crudo) return ''
  // Si ya viene con minúsculas, alguien lo escribió a mano: se respeta.
  if (/[a-záéíóúñ]/.test(crudo)) return crudo
  const base = formatNombreSAP(crudo).nombre || crudo
  return base
    .split(' ')
    .map((palabra) => {
      const mayus = palabra.toUpperCase()
      if (MARCAS.has(mayus)) return MARCAS.get(mayus) as string
      if (SIGLAS_PLANTA.has(mayus)) return mayus
      // «N1», «N2», «AQ-IN-CHO-EXTE-PRIL»: los códigos van como están.
      if (/^N\d+$/i.test(palabra) || /^[A-Z]{2}(-[A-Z]{2,4})+$/i.test(palabra)) return mayus
      return palabra
    })
    .join(' ')
}
