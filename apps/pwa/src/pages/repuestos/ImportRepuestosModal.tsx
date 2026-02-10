import { useCallback, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ImportCantidadRow } from '@/types/repuestos'

export type ImportMode = 'catalogo' | 'cantidades'

interface ImportRepuestosModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
  machineName?: string
  importCatalogoDesdeExcel: (args: { rows: Omit<ImportCantidadRow, 'cantidad'>[]; placeholder?: string }) => Promise<void>
  importCantidadesPorTag: (args: { rows: ImportCantidadRow[]; tagName: string; tipo: 'solicitud' | 'stock'; placeholder?: string }) => Promise<void>
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  if (typeof value === 'string') {
    const sanitized = value
      .trim()
      .replace(/\s+/g, '') // elimina espacios internos
      .replace(/[$¢€£₱₡₲₴₺₽₹]/g, '') // quita símbolos de moneda comunes
      .replace(/\./g, '') // quita separador de miles tipo 1.234,56
      .replace(/,/g, '.') // convierte coma decimal en punto

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

function mapRowToImport(row: Record<string, unknown>): ImportCantidadRow {
  const lower: Record<string, unknown> = {}
  Object.entries(row).forEach(([k, v]) => {
    lower[k.toLowerCase()] = v
  })

  const codigoSAP = normalizeString(
    lower['codigosap'] || lower['codigo sap'] || lower['sap'] || lower['codigo'] || lower['sapcode']
  )
  const codigoBaader = normalizeString(
    lower['codigobaader'] || lower['codigo baader'] || lower['baader'] || lower['baadercode']
  )
  const textoBreve = normalizeString(
    lower['textobreve'] || lower['texto breve'] || lower['nombre'] || lower['descripcion corta']
  )
  const descripcion = normalizeString(
    lower['descripcion'] || lower['descripción'] || lower['detalle'] || lower['texto'] || textoBreve
  )
  const cantidad = normalizeNumber(lower['cantidad'] || lower['stock'] || lower['qty'] || lower['cantidadsolicitada'], 0)
  const valorUnitario = normalizeNumber(
    lower['valorunitario'] || lower['valor unitario'] || lower['precio'] || lower['costo'] || lower['pu'],
    0
  )

  return {
    codigoSAP,
    codigoBaader,
    textoBreve,
    descripcion,
    cantidad,
    valorUnitario,
  }
}

export function ImportRepuestosModal({
  open,
  onClose,
  onSuccess,
  onError,
  machineName,
  importCatalogoDesdeExcel,
  importCantidadesPorTag,
}: ImportRepuestosModalProps) {
  const [mode, setMode] = useState<ImportMode>('catalogo')
  const [tagName, setTagName] = useState('stock')
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isReady = useMemo(() => !!file && (mode === 'catalogo' || tagName.trim().length > 0), [file, mode, tagName])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null
    setFile(nextFile)
  }

  const handleImport = useCallback(async () => {
    if (!file) return
    setIsLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) throw new Error('El archivo no tiene hojas')

      const sheet = workbook.Sheets[sheetName]
      if (!sheet) throw new Error('La hoja seleccionada está vacía')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!rows || rows.length === 0) throw new Error('El Excel está vacío')

      const mapped = rows
        .map(mapRowToImport)
        .filter((r) => r.codigoSAP || r.codigoBaader || r.textoBreve || r.descripcion)

      if (mapped.length === 0) throw new Error('No se encontraron columnas válidas (codigoSAP / codigoBaader / textoBreve / descripcion)')

      if (mode === 'catalogo') {
        await importCatalogoDesdeExcel({
          rows: mapped.map(({ cantidad: _cantidad, ...rest }) => rest),
        })
        onSuccess('Catálogo importado (sin cantidades)')
      } else {
        await importCantidadesPorTag({
          rows: mapped,
          tagName: tagName.trim(),
          tipo: 'stock',
        })
        onSuccess(`Cantidades importadas al tag "${tagName}"`)
      }

      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo importar el Excel'
      onError(message)
      console.error('Import Excel error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [file, importCatalogoDesdeExcel, importCantidadesPorTag, mode, onClose, onError, onSuccess, tagName])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar repuestos desde Excel</DialogTitle>
          <DialogDescription>
            {machineName ? `Máquina: ${machineName}` : 'Selecciona archivo Excel exportado desde la app anterior.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Modo de importación</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as ImportMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="catalogo">Solo catálogo (sin cantidades)</SelectItem>
                <SelectItem value="cantidades">Catálogo + cantidades al tag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'cantidades' && (
            <div className="space-y-2">
              <Label>Tag destino</Label>
              <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="stock" />
              <p className="text-xs text-muted-foreground">Se guardará como tag de tipo stock con la cantidad del Excel.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Archivo Excel (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
            <p className="text-xs text-muted-foreground">
              Columnas esperadas: codigoSAP, codigoBaader, textoBreve, descripcion, cantidad, valorUnitario.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!isReady || isLoading}>
            {isLoading ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
