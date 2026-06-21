import * as XLSX from 'xlsx'
import type {
  CircuitoTablero,
  CondicionNFPA,
  EstadoCircuito,
  TipoTablero,
} from '@/types/tableros'
import type { TableroInput } from '@/services/tableros'

/**
 * Plantilla Excel de levantamiento de tableros (Camino "Excel" del levantamiento de campo).
 * Dos hojas: `Cabecera` (1 fila por tablero) y `Circuitos` (1 fila por circuito, ligadas por
 * la columna `tableroTag`). Usa SheetJS, ya presente en el proyecto. Ver docs/LEVANTAMIENTO_TABLEROS.md.
 */

const CABECERA_HEADERS = [
  'tag', 'nombre', 'tipo', 'areaNombre', 'ubicacionFisica', 'tensionV', 'fases',
  'iccDisponibleKA', 'alimentadoDesde', 'principal_marca', 'principal_modelo',
  'principal_ratingA', 'principal_polos', 'principal_aicKA', 'barraTensionV',
  'barraCorrienteA', 'condicionGeneral', 'observaciones',
] as const

const CIRCUITO_HEADERS = [
  'tableroTag', 'numero', 'descripcion', 'cargaNombre', 'ratingA', 'polos',
  'marca', 'modelo', 'conductorCalibre', 'estado', 'condicion', 'observacion',
] as const

const TIPOS: TipoTablero[] = ['CCM', 'TGD', 'distribucion', 'alumbrado', 'control', 'otro']
const ESTADOS: EstadoCircuito[] = ['activo', 'reserva', 'fuera_servicio']

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

function toCondicion(v: unknown): CondicionNFPA {
  const n = Number(v)
  return n === 2 || n === 3 ? (n as CondicionNFPA) : 1
}

function toTipo(v: unknown): TipoTablero {
  const s = String(v ?? '').trim()
  return (TIPOS as string[]).includes(s) ? (s as TipoTablero) : 'otro'
}

function toEstado(v: unknown): EstadoCircuito {
  const s = String(v ?? '').trim()
  return (ESTADOS as string[]).includes(s) ? (s as EstadoCircuito) : 'activo'
}

// Genera y descarga la plantilla con cabeceras + filas de ejemplo (tablero piloto).
export function downloadPlantillaTableros(): void {
  const cabecera = [
    Object.fromEntries(CABECERA_HEADERS.map((h) => [h, ''])),
    {
      tag: 'CCM-AGUAS-01', nombre: 'CCM Tratamiento de aguas', tipo: 'CCM',
      areaNombre: 'Tratamiento de aguas', ubicacionFisica: 'Sala eléctrica 1',
      tensionV: 440, fases: 3, iccDisponibleKA: 25, alimentadoDesde: 'TGD-Principal',
      principal_marca: 'Schneider', principal_modelo: 'NSX250', principal_ratingA: 250,
      principal_polos: 3, principal_aicKA: 25, barraTensionV: 440, barraCorrienteA: 250,
      condicionGeneral: 2, observaciones: 'Ejemplo — reemplazar por datos reales',
    },
  ]
  const circuitos = [
    Object.fromEntries(CIRCUITO_HEADERS.map((h) => [h, ''])),
    { tableroTag: 'CCM-AGUAS-01', numero: '1', descripcion: 'Alimentación motor', cargaNombre: 'Motor 720004608', ratingA: 40, polos: 3, marca: 'Schneider', modelo: 'GV3', conductorCalibre: '8 AWG', estado: 'activo', condicion: 1, observacion: '' },
    { tableroTag: 'CCM-AGUAS-01', numero: '2', descripcion: 'Alimentación bomba', cargaNombre: 'Bomba 720004607', ratingA: 32, polos: 3, marca: 'Schneider', modelo: 'GV2', conductorCalibre: '10 AWG', estado: 'activo', condicion: 2, observacion: 'Vibración alta' },
    { tableroTag: 'CCM-AGUAS-01', numero: '3', descripcion: 'Reserva', cargaNombre: '', ratingA: 20, polos: 3, marca: '', modelo: '', conductorCalibre: '', estado: 'reserva', condicion: 1, observacion: '' },
  ]

  const wb = XLSX.utils.book_new()
  const wsCab = XLSX.utils.json_to_sheet(cabecera, { header: [...CABECERA_HEADERS] })
  const wsCir = XLSX.utils.json_to_sheet(circuitos, { header: [...CIRCUITO_HEADERS] })
  XLSX.utils.book_append_sheet(wb, wsCab, 'Cabecera')
  XLSX.utils.book_append_sheet(wb, wsCir, 'Circuitos')
  XLSX.writeFile(wb, 'plantilla-levantamiento-tablero.xlsx')
}

// Parsea un archivo de plantilla → un tablero (primera fila con tag) + sus circuitos.
export async function parsePlantillaTableros(file: File): Promise<TableroInput | null> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const cabSheet = wb.Sheets['Cabecera'] ?? wb.Sheets[wb.SheetNames[0] ?? '']
  const cirSheet = wb.Sheets['Circuitos'] ?? wb.Sheets[wb.SheetNames[1] ?? '']
  if (!cabSheet) return null

  const cabRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cabSheet)
  const row = cabRows.find((r) => str(r.tag))
  if (!row) return null
  const tag = str(row.tag)!

  const cirRows = cirSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(cirSheet) : []
  const circuitos: CircuitoTablero[] = cirRows
    .filter((r) => {
      const t = str(r.tableroTag)
      return (!t || t === tag) && (str(r.numero) || str(r.descripcion) || str(r.cargaNombre))
    })
    .map((r) => ({
      numero: str(r.numero) ?? '',
      descripcion: str(r.descripcion) ?? '',
      cargaNombre: str(r.cargaNombre),
      ratingA: num(r.ratingA),
      polos: num(r.polos),
      marca: str(r.marca),
      modelo: str(r.modelo),
      conductorCalibre: str(r.conductorCalibre),
      estado: toEstado(r.estado),
      condicion: toCondicion(r.condicion),
      observacion: str(r.observacion),
    }))

  const fases = num(row.fases)
  const input: TableroInput = {
    tag,
    nombre: str(row.nombre) ?? tag,
    tipo: toTipo(row.tipo),
    areaNombre: str(row.areaNombre),
    ubicacionFisica: str(row.ubicacionFisica),
    tensionV: num(row.tensionV),
    fases: fases === 1 || fases === 3 ? (fases as 1 | 3) : undefined,
    iccDisponibleKA: num(row.iccDisponibleKA),
    alimentadoDesde: str(row.alimentadoDesde),
    principal: {
      marca: str(row.principal_marca),
      modelo: str(row.principal_modelo),
      ratingA: num(row.principal_ratingA),
      polos: num(row.principal_polos),
      aicKA: num(row.principal_aicKA),
    },
    barraTensionV: num(row.barraTensionV),
    barraCorrienteA: num(row.barraCorrienteA),
    condicionGeneral: toCondicion(row.condicionGeneral),
    circuitos,
    observaciones: str(row.observaciones),
  }
  return input
}
