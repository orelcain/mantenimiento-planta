import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ImportCatalogoRow } from '@/types/repuestos'

interface ImportRepuestosModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
  machineName?: string
  importCatalogoDesdeExcel: (args: { rows: ImportCatalogoRow[]; placeholder?: string }) => Promise<void>
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const sanitized = value
      .trim()
      .replace(/\s+/g, '')
      .replace(/[$¢€£₱₡₲₴₺₽₹]/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
    const parsed = Number(sanitized)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeString(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function mapRowToImport(row: Record<string, unknown>): ImportCatalogoRow {
  // Normalizar claves a minúsculas sin tildes para comparación flexible
  const lower: Record<string, unknown> = {}
  Object.entries(row).forEach(([k, v]) => {
    const key = k.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .replace(/[°.]/g, '')                               // quitar ° y punto
      .trim()
    lower[key] = v
    lower[k.toLowerCase().trim()] = v // también guardar original lowercase
  })

  // CÓD. SAP / codigoSAP
  const codigoSAP = normalizeString(
    lower['cod sap'] || lower['cód. sap'] || lower['codigosap'] || lower['codigo sap'] ||
    lower['sap'] || lower['sapcode'] || lower['cod. sap']
  )

  // CÓD. MÁQUINA / codigoFabricante
  const codigoFabricante = normalizeString(
    lower['cod maquina'] || lower['cód. máquina'] || lower['cod. maquina'] ||
    lower['codigo maquina'] || lower['codigofabricante'] || lower['codigo fabricante'] ||
    lower['fabricante'] || lower['codigobaader'] || lower['codigo baader'] ||
    lower['n parte'] || lower['nro parte'] || lower['part number'] || lower['baader']
  )

  // DESCRIPCIÓN → textoBreve (nombre principal del repuesto)
  const textoBreve = normalizeString(
    lower['descripcion'] || lower['descripción'] || lower['description'] ||
    lower['textobreve'] || lower['texto breve'] || lower['nombre'] || lower['descripcion corta']
  )

  // DESC. SAP → descripcion (descripción secundaria desde SAP)
  const descripcion = normalizeString(
    lower['desc sap'] || lower['desc. sap'] || lower['descripcion sap'] ||
    lower['detalle'] || lower['texto'] || lower['descripcion detalle']
  ) || textoBreve

  // VALOR UNIT. ($) → valorUnitario
  const valorUnitario = normalizeNumber(
    lower['valor unit ($)'] || lower['valor unit. ($)'] || lower['valor unit'] ||
    lower['valorunitario'] || lower['valor unitario'] || lower['v unitario'] ||
    lower['precio unitario'] || lower['precio'] || lower['costo'] || lower['pu'],
    0
  )

  // STOCK → cantidadPorMaquina (stock en bodega)
  const cantidadPorMaquina = normalizeNumber(
    lower['stock'] || lower['cantidad'] || lower['qty'] ||
    lower['cantidadpormaquina'] || lower['cantidad por maquina'],
    0
  )

  // UBICACIÓN → ubicacionEnPlanta
  const ubicacionEnPlanta = normalizeString(
    lower['ubicacion'] || lower['ubicación'] ||
    lower['ubicacionenplanta'] || lower['ubicacion en planta']
  )

  // TIPO + SECCIÓN → observaciones (info adicional del catálogo)
  const tipo = normalizeString(lower['tipo'] || lower['type'] || lower['categoria'] || lower['categoría'])
  const seccion = normalizeString(lower['seccion'] || lower['sección'] || lower['section'])
  const obsRaw = normalizeString(lower['observaciones'] || lower['observacion'] || lower['notas'] || lower['nota'])
  const partes = [
    tipo ? `Tipo: ${tipo}` : '',
    seccion ? `Sección: ${seccion}` : '',
    obsRaw,
  ].filter(Boolean)
  const observaciones = partes.join(' | ')

  return {
    codigoSAP,
    codigoFabricante,
    textoBreve,
    descripcion,
    valorUnitario,
    cantidadPorMaquina,
    ubicacionEnPlanta,
    observaciones,
  }
}

// Detectar fila de encabezados: busca la primera fila con al menos 3 celdas no vacías
function detectHeaderRow(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
    let filledCells = 0
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell && cell.v !== undefined && cell.v !== '') filledCells++
    }
    if (filledCells >= 3) return r
  }
  return 0
}

export function ImportRepuestosModal({
  open,
  onClose,
  onSuccess,
  onError,
  machineName,
  importCatalogoDesdeExcel,
}: ImportRepuestosModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isReady = useMemo(() => !!file && !!selectedSheet, [file, selectedSheet])

  // Al seleccionar archivo: leer nombres de hojas y seleccionar automáticamente
  useEffect(() => {
    if (!file) {
      setSheetNames([])
      setSelectedSheet('')
      setPreviewCount(null)
      return
    }

    const readSheets = async () => {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const names = workbook.SheetNames
      setSheetNames(names)

      // Preferir hoja por máquina seleccionada o "Maestro"
      const machineSheet = machineName
        ? names.find((n) => n.toLowerCase().includes(machineName.toLowerCase().split(' ')[0] ?? ''))
        : null
      const maestro = names.find((n) => n.toLowerCase() === 'maestro')
      const auto = machineSheet || maestro || names[0]
      setSelectedSheet(auto || '')
    }

    readSheets().catch((err) => logger.error('Error leyendo hojas Excel', err instanceof Error ? err : new Error(String(err))))
  }, [file, machineName])

  // Al cambiar de hoja: calcular preview de filas a importar
  useEffect(() => {
    if (!file || !selectedSheet) { setPreviewCount(null); return }

    const readPreview = async () => {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[selectedSheet]
      if (!sheet) { setPreviewCount(null); return }

      const headerRow = detectHeaderRow(sheet)
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        range: headerRow,
      })
      const valid = rows.filter((r) => {
        const m = mapRowToImport(r)
        return m.codigoSAP || m.codigoFabricante || m.textoBreve
      })
      setPreviewCount(valid.length)
    }

    readPreview().catch(() => setPreviewCount(null))
  }, [file, selectedSheet])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null)
  }

  const handleImport = useCallback(async () => {
    if (!file || !selectedSheet) return
    setIsLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[selectedSheet]
      if (!sheet) throw new Error('Hoja no encontrada en el archivo')

      const headerRow = detectHeaderRow(sheet)
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        range: headerRow,
      })

      const mapped = rows
        .map(mapRowToImport)
        .filter((r) => r.codigoSAP || r.codigoFabricante || r.textoBreve)

      if (mapped.length === 0) throw new Error(
        'No se detectaron repuestos válidos. Verifica que la hoja tenga columnas: DESCRIPCIÓN, CÓD. SAP, CÓD. MÁQUINA o similares.'
      )

      await importCatalogoDesdeExcel({ rows: mapped })
      onSuccess(`✅ ${mapped.length} repuestos importados desde hoja "${selectedSheet}"`)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo importar el Excel'
      onError(message)
      logger.error('Import Excel error', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [file, selectedSheet, importCatalogoDesdeExcel, onClose, onError, onSuccess])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar repuestos desde Excel</DialogTitle>
          <DialogDescription>
            {machineName ? `Máquina: ${machineName}` : 'Selecciona archivo Excel para importar al catálogo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selección de archivo */}
          <div className="space-y-2">
            <Label>Archivo Excel (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
            <p className="text-xs text-muted-foreground">
              Compatible con <strong>Maestro_Repuestos_Completo</strong> y exportaciones propias.
              Columnas reconocidas: DESCRIPCIÓN, CÓD. SAP, CÓD. MÁQUINA, VALOR UNIT. ($), STOCK, UBICACIÓN, TIPO, SECCIÓN.
            </p>
          </div>

          {/* Selector de hoja — aparece al cargar archivo */}
          {sheetNames.length > 0 && (
            <div className="space-y-2">
              <Label>Hoja a importar</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              {/* Preview de filas detectadas */}
              {previewCount !== null && (
                <p className={`text-xs font-medium ${previewCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {previewCount > 0
                    ? `${previewCount.toLocaleString('es-CL')} repuestos listos para importar`
                    : 'No se detectaron repuestos válidos en esta hoja'}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!isReady || isLoading || previewCount === 0}>
            {isLoading ? 'Importando…' : `Importar${previewCount ? ` (${previewCount.toLocaleString('es-CL')})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
