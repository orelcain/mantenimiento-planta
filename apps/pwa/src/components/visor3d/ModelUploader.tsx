/**
 * ModelUploader - Componente de subida de modelos 3D
 * 
 * Features:
 * - Drag & drop + file picker
 * - Validación de formato y tamaño
 * - Barra de progreso de subida
 * - Nombre personalizable
 */

import { useState, useCallback, useRef } from 'react'
import { Upload, FileBox, AlertCircle, X, Check, Loader2 } from 'lucide-react'
import { Button, Input, Label } from '@/components/ui'
import { uploadModel3D } from '@/services/models3d'
import {
  detectFormat,
  ACCEPTED_EXTENSIONS,
  MAX_MODEL_SIZE_BYTES,
} from '@/types/models3d'

interface ModelUploaderProps {
  userId: string
  onSuccess: () => void
  onCancel: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ModelUploader({ userId, onSuccess, onCancel }: ModelUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((f: File): string | null => {
    const format = detectFormat(f.name)
    if (!format) {
      return `Formato no soportado: ${f.name.split('.').pop()}. Use .glb, .gltf, .obj o .fbx`
    }
    if (f.size > MAX_MODEL_SIZE_BYTES) {
      return `El archivo excede el tamaño máximo de ${MAX_MODEL_SIZE_BYTES / (1024 * 1024)}MB`
    }
    return null
  }, [])

  const handleFileSelect = useCallback(
    (f: File) => {
      const err = validateFile(f)
      if (err) {
        setError(err)
        return
      }
      setFile(f)
      setError(null)
      // Auto-generar nombre base
      if (!name) {
        const baseName = f.name.replace(/\.[^/.]+$/, '')
        setName(baseName)
      }
    },
    [name, validateFile]
  )

  // Drag & Drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFileSelect(f)
    },
    [handleFileSelect]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) handleFileSelect(f)
    },
    [handleFileSelect]
  )

  // Upload
  const handleUpload = useCallback(async () => {
    if (!file || !name.trim()) return
    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      await uploadModel3D(file, name.trim(), userId, (p) => setProgress(p))
      setSuccess(true)
      setTimeout(() => onSuccess(), 1000)
    } catch (err) {
      setError(`Error al subir: ${(err as Error).message}`)
      setUploading(false)
    }
  }, [file, name, userId, onSuccess])

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="p-3 bg-green-500/10 rounded-full">
          <Check className="h-8 w-8 text-green-500" />
        </div>
        <p className="text-sm font-medium">Modelo subido correctamente</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!file ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            className="hidden"
          />
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">
            Arrastra un archivo 3D o haz clic para seleccionar
          </p>
          <p className="text-xs text-muted-foreground">
            Formatos: .glb, .gltf, .obj, .fbx — Máx: {MAX_MODEL_SIZE_BYTES / (1024 * 1024)}MB
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <FileBox className="h-8 w-8 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)} — {detectFormat(file.name)?.toUpperCase()}
            </p>
          </div>
          {!uploading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => {
                setFile(null)
                setName('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Name input */}
      {file && (
        <div className="space-y-2">
          <Label htmlFor="model-name">Nombre del modelo</Label>
          <Input
            id="model-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Motor principal - Línea 2"
            disabled={uploading}
          />
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Subiendo...
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary rounded-full h-2 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* SketchUp tip */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
        <strong>Tip SketchUp:</strong> Exporte a .glb/.gltf desde{' '}
        <em>Archivo → Exportar → Modelo 3D → glTF</em>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={uploading}>
          Cancelar
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!file || !name.trim() || uploading}
          className="gap-2"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? 'Subiendo...' : 'Subir modelo'}
        </Button>
      </div>
    </div>
  )
}
