import type { ReactNode, ComponentType } from 'react'
import { BookOpen, ClipboardList, FileText, Gauge, Info } from 'lucide-react'
import { Badge, Card, CardContent } from '@/components/ui'
import type { Equipment } from '@/types'

/**
 * Ficha Técnica NFPA 70B — v1 (solo lectura).
 *
 * Expediente del equipo según la NFPA 70B (Centro Técnico Documental).
 * Muestra la estructura que exige la norma usando los campos que el registro
 * `equipment` ya tiene; los datos que aún no se capturan se marcan "Por capturar"
 * (se llenarán en la v2) y el historial llegará en la v3 (`maintenanceLog`).
 *
 * Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const CRITICIDAD: Record<Equipment['criticidad'], { nivel: string; label: string; cls: string }> = {
  alta: { nivel: 'A', label: 'Crítica', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', label: 'Media', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', label: 'Baja', cls: 'border-emerald-500 text-emerald-600' },
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
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${pending ? 'italic text-muted-foreground/70' : ''}`}>
        {pending ? 'Por capturar' : value ?? '—'}
      </div>
    </div>
  )
}

export function FichaTecnicaNFPA70B({ equipment }: { equipment: Equipment }) {
  const crit = CRITICIDAD[equipment.criticidad]
  const fechaInstalacion = equipment.fechaInstalacion
    ? new Date(equipment.fechaInstalacion).toLocaleDateString()
    : undefined

  return (
    <div className="space-y-3">
      {/* Datos de placa — NFPA 70B §2.2 (registros de rotulación) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionTitle icon={FileText} hint="NFPA 70B §2.2 · datos de rotulación">
            Datos de placa
          </SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Código SAP" value={equipment.codigo} />
            <Field label="Marca" value={equipment.marca} />
            <Field label="Modelo" value={equipment.modelo} />
            <Field label="N° de serie" value={equipment.numeroSerie} />
            <Field label="Instalación" value={fechaInstalacion} />
            <Field label="Potencia" pending />
            <Field label="Voltaje" pending />
            <Field label="Corriente nominal" pending />
            <Field label="RPM" pending />
          </div>
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
            <span className="text-sm text-muted-foreground">
              Condición actual: <span className="italic">por evaluar</span>
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Vida útil estimada" pending />
            <Field label="Próxima inspección" pending />
            <Field label="Frecuencia (criticidad × condición)" pending />
          </div>
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

      {/* Historial — la "historia del equipo" (maintenanceLog, v3) */}
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
          Vista preliminar (v1, solo lectura). Estructura según NFPA 70B; los campos “Por capturar”
          se completan en la v2 y el historial en la v3.
        </span>
      </div>
    </div>
  )
}
