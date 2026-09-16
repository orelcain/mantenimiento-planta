/**
 * SolicitarRepuestoModal — Alta de una solicitud de repuesto (Fase 6).
 *
 * Dos modos:
 *  - con `repuesto` preseleccionado (desde la fila / panel de detalle) → muestra el repuesto fijo.
 *  - sin preselección (desde el topbar) → selector acotado a los repuestos del área (`options`).
 */
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Package, Search, X } from 'lucide-react'
import {
  Button,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui'
import { normalizeForSearch, haystackMatchesAll } from '@/utils/repuestos'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'
import { avisoDeStock, cantidadDesdeTexto, CANTIDAD_MAXIMA, type StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

export interface RepuestoLite {
  codigoSAP: string
  textoBreve: string
  /** Stock de bodega al abrir el formulario (ver solicitudDeRepuesto). */
  stock?: StockDeSolicitud
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Repuesto preseleccionado (fila/panel). Si es null, se usa el selector con `options`. */
  repuesto?: RepuestoLite | null
  /** Repuestos del área para el selector (cuando no hay preselección). */
  options?: RepuestoLite[]
  onSubmit: (data: NuevaSolicitud) => Promise<void>
}

export function SolicitarRepuestoModal({ open, onOpenChange, repuesto, options = [], onSubmit }: Props) {
  const [sap, setSap] = useState('')
  const [query, setQuery] = useState('')
  // TEXTO, no número: un número controlado volvía a 1 al borrar y «5» quedaba «15».
  const [cantidadTexto, setCantidadTexto] = useState('1')
  const cantidad = cantidadDesdeTexto(cantidadTexto)
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir / cambiar de repuesto preseleccionado
  useEffect(() => {
    if (open) {
      setSap(repuesto?.codigoSAP ?? '')
      setQuery('')
      setCantidadTexto('1')
      setObservaciones('')
      setError(null)
      setSaving(false)
    }
  }, [open, repuesto])

  const optionsWithSap = useMemo(
    () => options.filter((o) => o.codigoSAP?.trim()).sort((a, b) => a.textoBreve.localeCompare(b.textoBreve, 'es')),
    [options],
  )

  const selected: RepuestoLite | null = useMemo(() => {
    if (repuesto) return repuesto
    return optionsWithSap.find((o) => o.codigoSAP === sap) ?? null
  }, [repuesto, optionsWithSap, sap])

  // Búsqueda sobre las opciones del área: el dropdown plano era inusable en
  // móvil (cientos de opciones alfabéticas sin filtro). Mismo matcher que el
  // buscador principal (acentos + singular/plural).
  const MAX_RESULTADOS = 50
  const filtered = useMemo(() => {
    const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean)
    if (!terms.length) return optionsWithSap.slice(0, MAX_RESULTADOS)
    return optionsWithSap
      .filter((o) => haystackMatchesAll(normalizeForSearch(`${o.textoBreve} ${o.codigoSAP}`), terms))
      .slice(0, MAX_RESULTADOS)
  }, [optionsWithSap, query])

  const submit = async () => {
    if (!selected) { setError('Selecciona un repuesto.'); return }
    if (cantidad == null) { setError(`Escribe una cantidad entera entre 1 y ${CANTIDAD_MAXIMA}.`); return }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        codigoSAP: selected.codigoSAP,
        textoBreve: selected.textoBreve,
        cantidad,
        observaciones,
      })
      onOpenChange(false)
    } catch {
      setError('No se pudo crear la solicitud. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const aviso = selected ? avisoDeStock(selected.stock, cantidad) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Solicitar repuesto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Repuesto: fijo (preseleccionado) o selector */}
          {repuesto ? (
            <div className="rounded-card border border-border bg-muted px-3 py-2">
              <div className="text-sm font-medium text-foreground">{repuesto.textoBreve || '(sin nombre)'}</div>
              <div className="font-mono text-xs text-muted-foreground">SAP {repuesto.codigoSAP}</div>
            </div>
          ) : selected ? (
            <div>
              <label className="mb-1 block text-caption tracking-wide text-muted-foreground">Repuesto</label>
              <div className="flex items-start justify-between gap-2 rounded-card border border-transparent bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{selected.textoBreve || '(sin nombre)'}</div>
                  <div className="font-mono text-xs text-muted-foreground">SAP {selected.codigoSAP}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSap(''); setQuery('') }}
                  className="shrink-0 rounded-ctl p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Quitar repuesto seleccionado"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-caption tracking-wide text-muted-foreground">Repuesto</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o SAP…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <div className="mt-1 max-h-52 overflow-y-auto rounded-card border border-border">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Sin coincidencias en el área.</p>
                ) : (
                  filtered.map((o) => (
                    <button
                      key={o.codigoSAP}
                      type="button"
                      onClick={() => setSap(o.codigoSAP)}
                      className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="min-w-0 truncate text-sm text-foreground">{o.textoBreve || o.codigoSAP}</span>
                      <span className="shrink-0 font-mono text-caption text-muted-foreground">{o.codigoSAP}</span>
                    </button>
                  ))
                )}
                {filtered.length === MAX_RESULTADOS && (
                  <p className="border-t border-border px-3 py-1.5 text-caption text-muted-foreground">Mostrando {MAX_RESULTADOS} — afina la búsqueda para ver el resto.</p>
                )}
              </div>
            </div>
          )}

          {aviso && (
            <p
              className={['text-caption', aviso.nivel === 'sin-stock' || aviso.nivel === 'insuficiente' ? 'font-medium text-ink-warn' : 'text-muted-foreground'].join(' ')}
              role={aviso.nivel === 'sin-stock' || aviso.nivel === 'insuficiente' ? 'status' : undefined}
            >
              {aviso.texto}
            </p>
          )}

          {/* Cantidad */}
          <div>
            <label htmlFor="solicitud-cantidad" className="mb-1 block text-caption tracking-wide text-muted-foreground">Cantidad</label>
            <Input
              id="solicitud-cantidad"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cantidadTexto}
              onChange={(e) => setCantidadTexto(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => e.currentTarget.select()}
              aria-invalid={cantidad == null}
              className="w-32"
            />
          </div>

          {/* Observaciones */}
          <div>
            <label className="mb-1 block text-caption tracking-wide text-muted-foreground">Observaciones (opcional)</label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Urgencia, motivo, equipo destino…"
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-ink-crit">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !selected || cantidad == null} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
