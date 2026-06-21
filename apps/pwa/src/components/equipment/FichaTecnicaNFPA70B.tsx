import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { BookOpen, Check, ClipboardList, FileText, Gauge, Info, Pencil, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, Input, Label } from '@/components/ui'
import { getEquipments, updateEquipment } from '@/services/equipment'
import { useAppStore } from '@/store'
import { logger } from '@/lib/logger'
import type { Equipment, FichaTecnica } from '@/types'

/**
 * Ficha Técnica NFPA 70B — v2 (lectura + captura de placa).
 *
 * Expediente del equipo según la NFPA 70B (Centro Técnico Documental).
 * v1: estructura solo lectura. v2: editor inline para capturar la placa eléctrica
 * y el bloque RCM (condición 1/2/3), que se guardan en `equipment.fichaTecnica`.
 * El historial (`maintenanceLog`) llega en la v3.
 *
 * Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const CRITICIDAD: Record<Equipment['criticidad'], { nivel: string; label: string; cls: string }> = {
  alta: { nivel: 'A', label: 'Crítica', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', label: 'Media', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', label: 'Baja', cls: 'border-emerald-500 text-emerald-600' },
}

const CONDICION: Record<1 | 2 | 3, { emoji: string; label: string }> = {
  1: { emoji: '🟢', label: 'Condición 1 · como nuevo' },
  2: { emoji: '🟡', label: 'Condición 2 · con desvíos' },
  3: { emoji: '🔴', label: 'Condición 3 · acción requerida' },
}

function SectionTitle({
  icon: Icon,
  children,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
    </div>
  )
}

function Field({ label, value, pending }: { label: string; value?: ReactNode; pending?: boolean }) {
  const empty = pending || value === undefined || value === null || value === ''
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${empty ? 'italic text-muted-foreground/70' : ''}`}>
        {empty ? 'Por capturar' : value}
      </div>
    </div>
  )
}

/** Quita claves vacías/undefined/NaN para no enviar basura a Firestore. */
function clean(ficha: FichaTecnica): FichaTecnica {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(ficha)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'number' && Number.isNaN(v)) continue
    out[k] = v
  }
  return out as FichaTecnica
}

export function FichaTecnicaNFPA70B({ equipment }: { equipment: Equipment }) {
  const { setEquipment } = useAppStore()
  const [ficha, setFicha] = useState<FichaTecnica>(equipment.fichaTecnica ?? {})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Al cambiar de equipo, recargar su ficha y salir de edición.
  useEffect(() => {
    setFicha(equipment.fichaTecnica ?? {})
    setEditing(false)
  }, [equipment.id, equipment.fichaTecnica])

  const crit = CRITICIDAD[equipment.criticidad]
  const fechaInstalacion = equipment.fechaInstalacion
    ? new Date(equipment.fechaInstalacion).toLocaleDateString()
    : undefined
  const proxima = ficha.proximaInspeccion
    ? new Date(ficha.proximaInspeccion).toLocaleDateString()
    : undefined

  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v))
  const set = (patch: Partial<FichaTecnica>) => setFicha((f) => ({ ...f, ...patch }))

  async function handleSave() {
    setSaving(true)
    try {
      const cleaned = clean(ficha)
      await updateEquipment(equipment.id, { fichaTecnica: cleaned })
      const fresh = await getEquipments()
      setEquipment(fresh)
      setFicha(cleaned)
      setEditing(false)
    } catch (err) {
      logger.error('Error guardando ficha técnica NFPA 70B', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFicha(equipment.fichaTecnica ?? {})
    setEditing(false)
  }

  return (
    <div className="space-y-3">
      {/* Datos de placa — NFPA 70B §2.2 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={FileText} hint="NFPA 70B §2.2 · datos de rotulación">
              Datos de placa
            </SectionTitle>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar ficha
              </Button>
            )}
          </div>

          {editing ? (
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Potencia (kW)</Label>
                <Input type="number" value={ficha.potenciaKw ?? ''} onChange={(e) => set({ potenciaKw: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Voltaje (V)</Label>
                <Input type="number" value={ficha.voltajeV ?? ''} onChange={(e) => set({ voltajeV: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Corriente nominal (A)</Label>
                <Input type="number" value={ficha.corrienteA ?? ''} onChange={(e) => set({ corrienteA: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">RPM</Label>
                <Input type="number" value={ficha.rpm ?? ''} onChange={(e) => set({ rpm: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Factor de servicio</Label>
                <Input type="number" step="0.01" value={ficha.factorServicio ?? ''} onChange={(e) => set({ factorServicio: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Clase aislamiento</Label>
                <Input value={ficha.claseAislamiento ?? ''} onChange={(e) => set({ claseAislamiento: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Grado IP</Label>
                <Input value={ficha.gradoIP ?? ''} onChange={(e) => set({ gradoIP: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Código SAP" value={equipment.codigo} />
              <Field label="Marca" value={equipment.marca} />
              <Field label="Modelo" value={equipment.modelo} />
              <Field label="N° de serie" value={equipment.numeroSerie} />
              <Field label="Instalación" value={fechaInstalacion} />
              <Field label="Potencia" value={ficha.potenciaKw != null ? `${ficha.potenciaKw} kW` : undefined} />
              <Field label="Voltaje" value={ficha.voltajeV != null ? `${ficha.voltajeV} V` : undefined} />
              <Field label="Corriente nominal" value={ficha.corrienteA != null ? `${ficha.corrienteA} A` : undefined} />
              <Field label="RPM" value={ficha.rpm} />
              <Field label="Factor de servicio" value={ficha.factorServicio} />
              <Field label="Clase aislamiento" value={ficha.claseAislamiento} />
              <Field label="Grado IP" value={ficha.gradoIP} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criticidad / RCM — NFPA 70B §2.4 + Cap. 9 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionTitle icon={Gauge} hint="NFPA 70B §2.4 + Cap. 9">
            Criticidad · RCM
          </SectionTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={`${crit.cls} text-sm`}>
              Criticidad {crit.nivel} · {crit.label}
            </Badge>
            {editing ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Condición:</span>
                {([1, 2, 3] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={ficha.condicion === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => set({ condicion: ficha.condicion === c ? undefined : c })}
                  >
                    {CONDICION[c].emoji} {c}
                  </Button>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                Condición actual:{' '}
                {ficha.condicion ? (
                  <span className="font-medium text-foreground">
                    {CONDICION[ficha.condicion].emoji} {CONDICION[ficha.condicion].label}
                  </span>
                ) : (
                  <span className="italic">por evaluar</span>
                )}
              </span>
            )}
          </div>

          {editing ? (
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Vida útil estimada (años)</Label>
                <Input type="number" value={ficha.vidaUtilAnios ?? ''} onChange={(e) => set({ vidaUtilAnios: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Frecuencia inspección (días)</Label>
                <Input type="number" value={ficha.frecuenciaInspeccionDias ?? ''} onChange={(e) => set({ frecuenciaInspeccionDias: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Próxima inspección</Label>
                <Input type="date" value={ficha.proximaInspeccion ?? ''} onChange={(e) => set({ proximaInspeccion: e.target.value })} />
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Vida útil estimada" value={ficha.vidaUtilAnios != null ? `${ficha.vidaUtilAnios} años` : undefined} />
              <Field label="Próxima inspección" value={proxima} />
              <Field label="Frecuencia" value={ficha.frecuenciaInspeccionDias != null ? `${ficha.frecuenciaInspeccionDias} días` : undefined} />
            </div>
          )}

          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentos — heredados del nodo de jerarquía */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionTitle icon={BookOpen} hint="manuales · planos · certificados · garantías">
            Documentos
          </SectionTitle>
          <p className="text-sm text-muted-foreground italic">
            {equipment.hierarchyNodeId
              ? 'Se heredan del nodo de jerarquía vinculado (manuales, planos, certificados, garantías).'
              : 'Equipo sin nodo de jerarquía vinculado — aún no hereda documentos.'}
          </p>
        </CardContent>
      </Card>

      {/* Historial — maintenanceLog (v3) */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionTitle icon={ClipboardList} hint="la historia del equipo">
            Historial de mantenimiento
          </SectionTitle>
          <p className="text-sm text-muted-foreground italic">
            Sin registros aún. Se poblará automáticamente desde incidencias y termografías (v3).
          </p>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Estructura según NFPA 70B (§2.2 placa · §2.4 + Cap. 9 criticidad/condición). El historial
          automático llega en la v3.
        </span>
      </div>
    </div>
  )
}
