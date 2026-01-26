import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Repuesto, RepuestoFormData } from '@/types/repuestos'
import type { TagAsignado, TagGlobal } from '@/types/tags'
import { isTagAsignado } from '@/types/tags'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui'

export type RepuestoFormMode = 'create' | 'edit'

interface RepuestoFormModalProps {
  open: boolean
  mode: RepuestoFormMode
  machineName?: string
  availableTags: TagGlobal[]
  initialData?: Repuesto | null
  onClose: () => void
  onSubmit: (payload: RepuestoFormData) => Promise<void>
  loading?: boolean
}

const defaultForm: RepuestoFormData = {
  codigoSAP: '',
  codigoBaader: '',
  textoBreve: '',
  descripcion: '',
  cantidadSolicitada: 0,
  cantidadStockBodega: 0,
  valorUnitario: 0,
  tags: [],
}

const normalizeTags = (tags: (string | TagAsignado)[] | undefined, availableTags: TagGlobal[]): TagAsignado[] => {
  if (!Array.isArray(tags)) return []
  return tags.map((tag) => {
    if (isTagAsignado(tag)) {
      return { ...tag, fecha: tag.fecha ? new Date(tag.fecha) : new Date() }
    }
    const match = availableTags.find((t) => t.nombre === tag)
    const tipo = match?.tipo ?? 'solicitud'
    return { nombre: tag, tipo, cantidad: 0, fecha: new Date() }
  })
}

export function RepuestoFormModal({
  open,
  mode,
  machineName,
  availableTags,
  initialData,
  onClose,
  onSubmit,
  loading = false,
}: RepuestoFormModalProps) {
  const [form, setForm] = useState<RepuestoFormData>(defaultForm)
  const [tagName, setTagName] = useState('')
  const [tagCantidad, setTagCantidad] = useState('0')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (initialData) {
        setForm({
          codigoSAP: initialData.codigoSAP || '',
          codigoBaader: initialData.codigoBaader || '',
          textoBreve: initialData.textoBreve || '',
          descripcion: initialData.descripcion || '',
          cantidadSolicitada: initialData.cantidadSolicitada || 0,
          cantidadStockBodega: initialData.cantidadStockBodega || 0,
          valorUnitario: initialData.valorUnitario || 0,
          tags: normalizeTags(initialData.tags, availableTags),
        })
      } else {
        setForm(defaultForm)
      }
    }
  }, [open, initialData, availableTags])

  const tagOptions = useMemo(() => availableTags.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [availableTags])

  const handleAddTag = () => {
    if (!tagName) return
    const cantidad = Number(tagCantidad)
    if (!Number.isFinite(cantidad) || cantidad < 0) return

    const tipo = availableTags.find((t) => t.nombre === tagName)?.tipo ?? 'solicitud'
    setForm((prev) => {
      const existing = (prev.tags || []).find(
        (t) => isTagAsignado(t) && t.nombre === tagName && t.tipo === tipo
      ) as TagAsignado | undefined

      const nextTags = Array.isArray(prev.tags) ? [...prev.tags] : []
      if (existing) {
        return {
          ...prev,
          tags: nextTags.map((t) =>
            isTagAsignado(t) && t.nombre === tagName && t.tipo === tipo
              ? { ...t, cantidad }
              : t
          ),
        }
      }

      const nuevo: TagAsignado = { nombre: tagName, tipo, cantidad, fecha: new Date() }
      return { ...prev, tags: [...nextTags, nuevo] }
    })
    setTagCantidad('0')
  }

  const handleRemoveTag = (name: string, tipo: TagAsignado['tipo']) => {
    setForm((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => !(isTagAsignado(t) && t.nombre === name && t.tipo === tipo)),
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    try {
      const payload: RepuestoFormData = {
        codigoSAP: form.codigoSAP.trim(),
        codigoBaader: form.codigoBaader.trim(),
        textoBreve: form.textoBreve.trim(),
        descripcion: form.descripcion?.trim() || '',
        valorUnitario: Number(form.valorUnitario) || 0,
        cantidadSolicitada: Number(form.cantidadSolicitada) || 0,
        cantidadStockBodega: Number(form.cantidadStockBodega) || 0,
        tags: form.tags && form.tags.length > 0 ? form.tags : [],
      }

      if (!payload.textoBreve) {
        setError('El texto breve es obligatorio.')
        return
      }

      await onSubmit(payload)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el repuesto.'
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nuevo repuesto' : 'Editar repuesto'}
          </DialogTitle>
          {machineName && (
            <p className="text-sm text-muted-foreground mt-1">
              Asociado a: <span className="font-medium text-foreground">{machineName}</span>
            </p>
          )}
        </DialogHeader>

        <form className="space-y-5 py-2" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="codigoSAP">Código SAP</Label>
              <Input
                id="codigoSAP"
                value={form.codigoSAP}
                onChange={(e) => setForm({ ...form, codigoSAP: e.target.value })}
                placeholder="Ej: 123-456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigoBaader">Código interno</Label>
              <Input
                id="codigoBaader"
                value={form.codigoBaader}
                onChange={(e) => setForm({ ...form, codigoBaader: e.target.value })}
                placeholder="Ej: BA-200"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="textoBreve">Texto breve</Label>
              <Input
                id="textoBreve"
                value={form.textoBreve}
                onChange={(e) => setForm({ ...form, textoBreve: e.target.value })}
                required
                placeholder="Nombre del repuesto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorUnitario">Valor unitario (USD)</Label>
              <Input
                id="valorUnitario"
                type="number"
                min="0"
                step="0.01"
                value={form.valorUnitario}
                onChange={(e) => setForm({ ...form, valorUnitario: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Detalles, proveedor, especificaciones..."
              rows={3}
            />
          </div>

          {/* Legacy fields ocultos por ahora */}
          {/* <div className="grid gap-4 md:grid-cols-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-border/50">
            <div className="space-y-2">
              <Label htmlFor="cantidadSolicitada" className="text-xs uppercase tracking-wide text-muted-foreground">Cantidad Solicitada</Label>
              <Input
                id="cantidadSolicitada"
                type="number"
                min="0"
                className="bg-background"
                value={form.cantidadSolicitada}
                onChange={(e) => setForm({ ...form, cantidadSolicitada: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cantidadStockBodega" className="text-xs uppercase tracking-wide text-muted-foreground">Stock Actual</Label>
              <Input
                id="cantidadStockBodega"
                type="number"
                min="0"
                className="bg-background"
                value={form.cantidadStockBodega}
                onChange={(e) => setForm({ ...form, cantidadStockBodega: Number(e.target.value) })}
              />
            </div>
          </div> */}

          {/* Sección de Tags oculta por ahora - Modo Catálogo solo */}
          {/* 
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base font-semibold">Inventario por Evento (Tags)</Label>
            
            <div className="flex gap-2 items-end">
               <div className="flex-1 space-y-1">
                 <Label className="text-xs text-muted-foreground">Seleccionar Tag</Label>
                 <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                >
                  <option value="">Selecciona un tag...</option>
                  {tagOptions.map((tag) => (
                    <option key={tag.nombre} value={tag.nombre}>
                      {tag.nombre} ({tag.tipo === 'stock' ? 'Stock' : 'Solicitud'})
                    </option>
                  ))}
                </select>
               </div>

                <div className="w-24 space-y-1">
                   <Label className="text-xs text-muted-foreground">Cantidad</Label>
                   <Input
                    type="number"
                    min="0"
                    translate="no"
                    value={tagCantidad}
                    onChange={(e) => setTagCantidad(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <Button type="button" variant="secondary" onClick={handleAddTag} className="mb-[1px]">
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir
                </Button>
            </div>
          </div> 
          */}

          {/* Legacy Tags Display - Disabled
          {form.tags && form.tags.length > 0 && false ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 text-sm font-semibold text-foreground">Tags asignados</div>
              <div className="flex flex-wrap gap-2">
                {form.tags.map((tag) => {
                  if (!isTagAsignado(tag)) return null
                  return (
                    <span
                      key={`${tag.nombre}-${tag.tipo}`}
                      className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs"
                    >
                      <span className="font-semibold uppercase text-muted-foreground">{tag.tipo === 'stock' ? 'Stock' : 'Solicitud'}</span>
                      <span className="text-foreground">{tag.nombre}</span>
                      <span className="font-mono text-foreground">{tag.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.nombre, tag.tipo)}
                        className="text-muted-foreground transition hover:text-destructive"
                        aria-label={`Quitar ${tag.nombre}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          ) : null}
          */}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {mode === 'create' ? 'Crear repuesto' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
