/**
 * ETTHeaderFields — Tabla de cabecera editable del documento ETT
 *
 * Replica visualmente la tabla de 7 filas del formato corporativo AquaChile:
 *
 *   | FECHA REQUERIMIENTO         | [fecha editable]              |
 *   | PROYECTO O SERVICIO         | [texto editable]              |
 *   | USUARIO SOLICITANTE         | [texto editable]              |
 *   | SECTOR DE REALIZACIÓN       | [texto editable]              |
 *   | FECHA INICIO DEL SERVICIO   | [fecha opcional editable]     |
 *   | FECHA TÉRMINO DEL SERVICIO  | [fecha opcional editable]     |
 *   | GARANTÍA EXIGIDA            | [texto editable]              |
 */

import type { ETTCabecera } from '@/types'
import { ETTInlineText } from './ETTInlineText'

export interface ETTHeaderFieldsProps {
  cabecera: ETTCabecera
  onChange: (cab: ETTCabecera) => void
}

function formatDateForInput(d: Date | undefined): string {
  if (!d) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseDateFromInput(str: string): Date | undefined {
  if (!str) return undefined
  const d = new Date(str + 'T12:00:00') // noon para evitar shift de timezone
  return isNaN(d.getTime()) ? undefined : d
}

function formatDateDisplay(d: Date | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Fila de la tabla: label fijo + valor editable */
function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[35%_65%] border-b border-blue-200 last:border-b-0">
      <div className="bg-gray-200 px-3 py-2 font-bold text-xs text-gray-700 border-r border-blue-200 flex items-center">
        {label}
      </div>
      <div className="px-3 py-2 text-center flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

/** Campo de fecha con input[type=date] estilizado para verse como campo amarillo */
function DateField({
  value,
  onChange,
}: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
}) {
  return (
    <div className="relative w-full">
      <input
        type="date"
        value={formatDateForInput(value)}
        onChange={(e) => onChange(parseDateFromInput(e.target.value))}
        className="w-full bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-ctl px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-400"
        title={formatDateDisplay(value) || 'Click para seleccionar fecha'}
      />
    </div>
  )
}

export function ETTHeaderFields({ cabecera, onChange }: ETTHeaderFieldsProps) {
  const update = <K extends keyof ETTCabecera>(
    key: K,
    value: ETTCabecera[K],
  ) => {
    onChange({ ...cabecera, [key]: value })
  }

  return (
    <div className="border border-blue-300 rounded-ctl overflow-hidden bg-white">
      <Row label="FECHA REQUERIMIENTO">
        <DateField
          value={cabecera.fecha_requerimiento}
          onChange={(d) => update('fecha_requerimiento', d ?? new Date())}
        />
      </Row>
      <Row label="PROYECTO O SERVICIO">
        <ETTInlineText
          value={cabecera.proyecto}
          onChange={(v) => update('proyecto', v)}
          placeholder="[Nombre del proyecto o servicio]"
        />
      </Row>
      <Row label="USUARIO SOLICITANTE">
        <ETTInlineText
          value={cabecera.usuario_solicitante}
          onChange={(v) => update('usuario_solicitante', v)}
          placeholder="[Departamento o persona]"
        />
      </Row>
      <Row label="SECTOR DE REALIZACIÓN">
        <ETTInlineText
          value={cabecera.sector_realizacion}
          onChange={(v) => update('sector_realizacion', v)}
          placeholder="[Ubicación física]"
        />
      </Row>
      <Row label="FECHA INICIO DEL SERVICIO">
        <DateField
          value={cabecera.fecha_inicio}
          onChange={(d) => update('fecha_inicio', d)}
        />
      </Row>
      <Row label="FECHA TÉRMINO DEL SERVICIO">
        <DateField
          value={cabecera.fecha_termino}
          onChange={(d) => update('fecha_termino', d)}
        />
      </Row>
      <Row label="GARANTÍA EXIGIDA">
        <ETTInlineText
          value={cabecera.garantia_texto}
          onChange={(v) => update('garantia_texto', v)}
          placeholder="06 (meses) Garantía Temporada Alta"
        />
      </Row>
    </div>
  )
}
