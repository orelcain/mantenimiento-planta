/**
 * P1) Carga de archivos Excel
 *
 * Drag&Drop múltiples xlsx, detección de tipo, validación, checklist.
 */

import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  Info,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import type {
  ParsedMatrixData,
  UploadedMatrixFile,
  MatrixFileKind,
} from '@/services/grader/types'

interface Props {
  onComplete: (data: ParsedMatrixData) => void
}

interface FileParsed {
  fileMeta: UploadedMatrixFile
  partialData: Partial<ParsedMatrixData>
  file: File
}

const KIND_LABELS: Record<MatrixFileKind, string> = {
  PIEZA_PIEZA: 'Pieza-Pieza',
  PUERTA_0: 'Puerta 0 / Punto Cero',
  PORC_CALIDAD: '% Calidad',
  TOTALES_PRODUCCION: 'Totales Producción',
  TOTAL_PIEZAS_POR_FOLIO: 'Total Piezas por Folio',
  UNKNOWN: 'No reconocido',
}

const KIND_COLORS: Record<MatrixFileKind, string> = {
  PIEZA_PIEZA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PUERTA_0: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PORC_CALIDAD: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  TOTALES_PRODUCCION: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  TOTAL_PIEZAS_POR_FOLIO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  UNKNOWN: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

interface ChecklistItem {
  kind: MatrixFileKind
  label: string
  required: boolean
  found: boolean
}

export function AnalisisGraderUploadPage({ onComplete }: Props) {
  const [files, setFiles] = useState<FileParsed[]>([])
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const checklist: ChecklistItem[] = [
    { kind: 'PIEZA_PIEZA', label: 'Pieza-Pieza (base principal)', required: true, found: files.some((f) => f.fileMeta.kind === 'PIEZA_PIEZA') },
    { kind: 'PUERTA_0', label: 'Puerta 0 / Punto Cero', required: false, found: files.some((f) => f.fileMeta.kind === 'PUERTA_0') },
    { kind: 'PORC_CALIDAD', label: '% Calidad', required: false, found: files.some((f) => f.fileMeta.kind === 'PORC_CALIDAD') },
    { kind: 'TOTALES_PRODUCCION', label: 'Totales Producción', required: false, found: files.some((f) => f.fileMeta.kind === 'TOTALES_PRODUCCION') },
    { kind: 'TOTAL_PIEZAS_POR_FOLIO', label: 'Total Piezas por Folio', required: false, found: files.some((f) => f.fileMeta.kind === 'TOTAL_PIEZAS_POR_FOLIO') },
  ]

  const canContinue = files.length > 0 && files.some((f) => f.fileMeta.kind !== 'UNKNOWN')

  const handleFiles = useCallback(async (newFiles: FileList | File[]) => {
    setParsing(true)
    setError(null)

    const fileArray = Array.from(newFiles).filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
    )

    if (fileArray.length === 0) {
      setError('Solo se aceptan archivos .xlsx o .xls')
      setParsing(false)
      return
    }

    try {
      const parsed: FileParsed[] = []
      for (const file of fileArray) {
        const result = await parseFile(file)
        parsed.push({ ...result, file })
      }
      setFiles((prev) => [...prev, ...parsed])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al parsear archivo')
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.fileMeta.id !== id))
  }

  const handleContinue = () => {
    const merged = mergeParsedData(files)
    onComplete(merged)
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5" />
            Cargar Archivos Excel de Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
            )}
          >
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              Arrastra archivos Excel aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Archivos .xlsx exportados desde Matrix (1 o múltiples)
            </p>
            {parsing && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Parseando archivos...</span>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files list */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Archivos Cargados ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((f) => (
              <div
                key={f.fileMeta.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.fileMeta.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={cn('text-xs', KIND_COLORS[f.fileMeta.kind])}>
                      {KIND_LABELS[f.fileMeta.kind]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {(f.fileMeta.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                    {f.fileMeta.warnings.length > 0 && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {f.fileMeta.warnings.length} aviso(s)
                      </span>
                    )}
                  </div>
                  {f.fileMeta.warnings.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {f.fileMeta.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(f.fileMeta.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Checklist de Archivos Recomendados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((item) => (
            <div
              key={item.kind}
              className="flex items-center gap-2 text-sm"
            >
              {item.found ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <div
                  className={cn(
                    'h-4 w-4 rounded border-2',
                    item.required
                      ? 'border-amber-400'
                      : 'border-muted-foreground/30',
                  )}
                />
              )}
              <span className={item.found ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
              {item.required && !item.found && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                  Recomendado
                </Badge>
              )}
            </div>
          ))}
          {checklist[0] && !checklist[0].found && files.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              Sin archivo pieza-pieza, el dashboard mostrará métricas parciales.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Continue button */}
      <div className="flex justify-end">
        <Button onClick={handleContinue} disabled={!canContinue}>
          Continuar a Configuración de Gates
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
