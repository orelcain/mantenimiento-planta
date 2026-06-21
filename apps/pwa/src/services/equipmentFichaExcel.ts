import * as XLSX from 'xlsx'
import { updateEquipment } from '@/services/equipment'
import type { Equipment, FichaTecnica } from '@/types'

/**
 * Carga masiva de la placa eléctrica (ficha NFPA 70B) por Excel.
 * Plantilla = 1 fila por equipo con los campos de placa; el import hace match
 * por `Código` y MERGEA solo las celdas con valor (no pisa lo existente con
 * vacíos). Usa SheetJS, ya presente en el proyecto.
 */

const HEADERS = [
  'Código',
  'Equipo',
  'Potencia (kW)',
  'Voltaje (V)',
  'Corriente (A)',
  'RPM',
  'Factor servicio',
  'Clase aislamiento',
  'Grado IP',
  'Condición (1-3)',
  'Vida útil (años)',
  'Frecuencia (días)',
] as const

function num(v: unknown): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s.length ? s : undefined
}

function toCondicion(v: unknown): 1 | 2 | 3 | undefined {
  const n = Number(v)
  return n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : undefined
}

function rowDe(e: Equipment): Record<string, string | number> {
  const f = e.fichaTecnica ?? {}
  return {
    'Código': e.codigo,
    'Equipo': e.nombre,
    'Potencia (kW)': f.potenciaKw ?? '',
    'Voltaje (V)': f.voltajeV ?? '',
    'Corriente (A)': f.corrienteA ?? '',
    'RPM': f.rpm ?? '',
    'Factor servicio': f.factorServicio ?? '',
    'Clase aislamiento': f.claseAislamiento ?? '',
    'Grado IP': f.gradoIP ?? '',
    'Condición (1-3)': f.condicion ?? '',
    'Vida útil (años)': f.vidaUtilAnios ?? '',
    'Frecuencia (días)': f.frecuenciaInspeccionDias ?? '',
  }
}

/** Descarga la plantilla con una fila por equipo (valores actuales pre-cargados). */
export function descargarPlantillaPlaca(equipos: Equipment[]): void {
  const rows = equipos
    .filter((e) => !e.deleted)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(rowDe)
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Placa NFPA 70B')
  XLSX.writeFile(wb, `placa-equipos-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/** Construye el parche de fichaTecnica con SOLO las celdas con valor (no pisa con vacíos). */
function patchDeFila(row: Record<string, unknown>): Partial<FichaTecnica> {
  const patch: Partial<FichaTecnica> = {}
  const set = <K extends keyof FichaTecnica>(k: K, v: FichaTecnica[K] | undefined) => {
    if (v !== undefined) patch[k] = v
  }
  set('potenciaKw', num(row['Potencia (kW)']))
  set('voltajeV', num(row['Voltaje (V)']))
  set('corrienteA', num(row['Corriente (A)']))
  set('rpm', num(row['RPM']))
  set('factorServicio', num(row['Factor servicio']))
  set('claseAislamiento', str(row['Clase aislamiento']))
  set('gradoIP', str(row['Grado IP']))
  set('condicion', toCondicion(row['Condición (1-3)']))
  set('vidaUtilAnios', num(row['Vida útil (años)']))
  set('frecuenciaInspeccionDias', num(row['Frecuencia (días)']))
  return patch
}

export type ImportPlacaResultado = {
  total: number
  actualizados: number
  sinCambios: number
  sinMatch: string[]
}

/**
 * Importa un Excel de placa: hace match por Código contra `equipos` y mergea los
 * campos con valor en `equipment.fichaTecnica`. Devuelve un resumen.
 */
export async function importarPlacaExcel(file: File, equipos: Equipment[]): Promise<ImportPlacaResultado> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('El archivo no tiene hojas.')
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error('No se pudo leer la hoja del archivo.')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  const porCodigo = new Map(equipos.filter((e) => !e.deleted).map((e) => [String(e.codigo).trim(), e]))
  const res: ImportPlacaResultado = { total: rows.length, actualizados: 0, sinCambios: 0, sinMatch: [] }

  for (const row of rows) {
    const codigo = str(row['Código'])
    if (!codigo) continue
    const eq = porCodigo.get(codigo)
    if (!eq) {
      res.sinMatch.push(codigo)
      continue
    }
    const patch = patchDeFila(row)
    if (Object.keys(patch).length === 0) {
      res.sinCambios++
      continue
    }
    const merged: FichaTecnica = { ...(eq.fichaTecnica ?? {}), ...patch }
    await updateEquipment(eq.id, { fichaTecnica: merged })
    res.actualizados++
  }
  return res
}
