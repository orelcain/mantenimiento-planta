/**
 * DxfImportModal
 * Modal para importar un archivo .dxf completo al visor de planta.
 * Flujo: seleccionar archivo → parsear → elegir capas → nombrar → confirmar.
 */

import { useCallback, useRef, useState } from 'react'
import { X, Upload, FileText, Eye, EyeOff, Check, AlertTriangle, Loader } from 'lucide-react'
import { parseDxfText, type CapaDxfParseada } from './parseDxf'
import { useMapaLeafletStore, type MapaImportado, type CapaImportada } from '@/store/useMapaLeafletStore'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return `dxf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// ── Componente ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

type Step = 'upload' | 'parsing' | 'select' | 'done'

export function DxfImportModal({ onClose }: Props) {
  const [step, setStep]             = useState<Step>('upload')
  const [error, setError]           = useState<string | null>(null)
  const [warnings, setWarnings]     = useState<string[]>([])
  const [capas, setCapas]           = useState<CapaDxfParseada[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [bounds, setBounds]         = useState<[[number,number],[number,number]] | null>(null)
  const [nombre, setNombre]         = useState('Planta importada')
  const [fileName, setFileName]     = useState('')
  const inputRef                    = useRef<HTMLInputElement>(null)

  const addMapaImportado   = useMapaLeafletStore((s) => s.addMapaImportado)
  const setMapaActivo      = useMapaLeafletStore((s) => s.setMapaImportadoActivo)

  // ── Parsear archivo ─────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Solo se aceptan archivos .dxf')
      return
    }
    setFileName(file.name)
    setError(null)
    setStep('parsing')

    try {
      const text = await file.text()
      const result = parseDxfText(text)

      if (!result.capas.length) {
        setError('El archivo DXF no contiene entidades reconocibles')
        setStep('upload')
        return
      }

      setCapas(result.capas)
      setBounds(result.bounds)
      setWarnings(result.warnings)
      // Seleccionar todas por defecto
      setSelected(new Set(result.capas.map((c) => c.name)))
      // Sugerir nombre desde el nombre del archivo
      setNombre(file.name.replace(/\.dxf$/i, ''))
      setStep('select')
    } catch (e) {
      setError(`Error al parsear el DXF: ${e instanceof Error ? e.message : String(e)}`)
      setStep('upload')
    }
  }, [])

  // ── Drag & drop ─────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }, [handleFile])

  // ── Toggle selección ────────────────────────────────────────────────────

  function toggleCapa(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAll()  { setSelected(new Set(capas.map((c) => c.name))) }
  function selectNone() { setSelected(new Set()) }

  // ── Confirmar importación ───────────────────────────────────────────────

  function handleImport() {
    if (!bounds || !selected.size) return

    const capasImportadas: CapaImportada[] = capas
      .filter((c) => selected.has(c.name))
      .map((c) => ({
        name: c.name,
        color: c.color,
        visible: true,
        eliminada: false,
        entityCount: c.entityCount,
        geojson: c.geojson,
      }))

    const mapa: MapaImportado = {
      id: makeId(),
      nombre: nombre.trim() || 'Mapa DXF',
      bounds,
      capas: capasImportadas,
      createdAt: Date.now(),
    }

    addMapaImportado(mapa)
    setMapaActivo(mapa.id)
    setStep('done')
    setTimeout(onClose, 800)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-amber-400" />
            <span className="text-sm font-semibold text-gray-100">Importar DXF</span>
            {fileName && <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{fileName}</span>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ─ Upload ─ */}
          {step === 'upload' && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 hover:border-amber-500 rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors group"
            >
              <FileText size={40} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
              <p className="text-sm text-gray-400 group-hover:text-gray-200 text-center">
                Arrastrá un archivo <span className="text-amber-400 font-semibold">.dxf</span> o hacé clic para buscarlo
              </p>
              <p className="text-[11px] text-gray-600">AutoCAD R12 / R2000+ · puede tardar unos segundos en archivos grandes</p>
              <input ref={inputRef} type="file" accept=".dxf" className="hidden" onChange={onFileChange} />
            </div>
          )}

          {/* ─ Parsing ─ */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader size={32} className="text-amber-400 animate-spin" />
              <p className="text-sm text-gray-300">Parseando {fileName}…</p>
              <p className="text-[11px] text-gray-500">Convirtiendo entidades a GeoJSON</p>
            </div>
          )}

          {/* ─ Select capas ─ */}
          {step === 'select' && (
            <div className="flex flex-col gap-3">
              {/* Nombre del mapa */}
              <div>
                <label className="text-[11px] text-gray-400 font-medium mb-1 block">Nombre del mapa</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
                  placeholder="Planta principal"
                  maxLength={60}
                />
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded p-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-300">{warnings.join(' · ')}</div>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {selected.size} / {capas.length} capas seleccionadas
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll}  className="text-[10px] px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">Todas</button>
                  <button onClick={selectNone} className="text-[10px] px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">Ninguna</button>
                </div>
              </div>

              {/* Lista de capas */}
              <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto pr-1">
                {capas.map((c) => {
                  const on = selected.has(c.name)
                  return (
                    <button
                      key={c.name}
                      onClick={() => toggleCapa(c.name)}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${on ? 'bg-gray-800 hover:bg-gray-750' : 'bg-transparent hover:bg-gray-800/50 opacity-40'}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0 border border-gray-600"
                           style={{ backgroundColor: on ? c.color : 'transparent' }} />
                      {on
                        ? <Eye size={10} className="text-gray-400 shrink-0" />
                        : <EyeOff size={10} className="text-gray-600 shrink-0" />}
                      <span className="text-[11px] flex-1 truncate text-gray-200">{c.name}</span>
                      <span className="text-[10px] font-mono text-gray-500">{fmtCount(c.entityCount)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─ Done ─ */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-emerald-900/40 border border-emerald-600 flex items-center justify-center">
                <Check size={24} className="text-emerald-400" />
              </div>
              <p className="text-sm text-gray-200 font-semibold">¡Mapa importado!</p>
              <p className="text-[11px] text-gray-500">Activando "{nombre}"…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded p-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-300">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'select' && (
          <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={!selected.size || !nombre.trim()}
              className="px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded transition-colors flex items-center gap-1.5"
            >
              <Upload size={13} />
              Importar {selected.size} capa{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
