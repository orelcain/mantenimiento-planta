import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ListGroup, ListCell, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { maquinaNueva, type MaquinaRueda, type PerfilOperacion } from '@/services/ruedaVentanas'
import type { TareaMantencion } from '@/services/ruedaCarga'

/**
 * Las máquinas del plan, editables.
 *
 * Venían fijas en el código, lo que obligaba a un despliegue para agregar un
 * equipo o corregir un nombre — y dejaba el módulo inservible para cualquier
 * planta que no fuera la lista escrita a mano.
 *
 * Al borrar se avisa qué tareas quedan sin máquina en vez de arrastrarlas en
 * silencio: una tarea apuntando a un equipo que ya no existe desaparece del
 * plan sin decir nada, y eso es exactamente cómo se pierde una preventiva.
 */

export interface EditorMaquinasProps {
  maquinas: MaquinaRueda[]
  tareas: TareaMantencion[]
  onCambiar: (m: MaquinaRueda[]) => void
  onCerrar: () => void
}

const PERFILES: Array<{ id: PerfilOperacion; label: string; detalle: string }> = [
  { id: 'simple', label: '1 turno', detalle: 'Proceso de día, higiene al cierre' },
  { id: 'doble', label: '2 turnos', detalle: 'Proceso hasta la noche, higiene de madrugada' },
]

/** Id estable a partir del nombre; el sufijo evita chocar con uno ya existente. */
function idDesde(nombre: string, existentes: Set<string>): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'maquina'
  if (!existentes.has(base)) return base
  let n = 2
  while (existentes.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export function EditorMaquinas({ maquinas, tareas, onCambiar, onCerrar }: EditorMaquinasProps) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [perfil, setPerfil] = useState<PerfilOperacion>('simple')
  const [porBorrar, setPorBorrar] = useState<MaquinaRueda | null>(null)

  const agregar = () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const id = idDesde(nombre, new Set(maquinas.map((m) => m.id)))
    onCambiar([...maquinas, maquinaNueva(id, nombre, perfil)])
    setNuevoNombre('')
  }

  const renombrar = (id: string, nombre: string) =>
    onCambiar(maquinas.map((m) => (m.id === id ? { ...m, nombre } : m)))

  const tareasDe = (id: string) => tareas.filter((t) => t.maquinaId === id)

  return (
    <ListGroup
      title="Máquinas y áreas del plan"
      action={
        <button onClick={onCerrar} className="flex items-center gap-1 text-[0.8rem] font-medium text-primary">
          <X className="h-3.5 w-3.5" />
          Listo
        </button>
      }
      footer="Sirve para cualquier cosa que ocupe tiempo del equipo: una máquina, el acopio, una sala. El horario arranca del perfil elegido y se corrige pintando."
    >
      {maquinas.map((m) => {
        const enPeligro = porBorrar?.id === m.id
        const afectadas = tareasDe(m.id)
        return (
          <div key={m.id} className="flex flex-col">
            <ListCell
              title={
                <input
                  value={m.nombre}
                  onChange={(e) => renombrar(m.id, e.target.value)}
                  aria-label={`Nombre de ${m.nombre}`}
                  className="w-full min-w-0 rounded-[4px] bg-transparent text-headline text-foreground focus:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              }
              subtitle={
                afectadas.length > 0
                  ? `${afectadas.length} ${afectadas.length === 1 ? 'tarea asignada' : 'tareas asignadas'}`
                  : 'Sin tareas asignadas'
              }
              trailing={
                <button
                  onClick={() => setPorBorrar(enPeligro ? null : m)}
                  aria-label={`Eliminar ${m.nombre}`}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-ctl',
                    enPeligro ? 'text-destructive' : 'text-muted-foreground hover:text-destructive',
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              }
            />

            {enPeligro && (
              <div className="flex flex-col gap-2.5 border-t border-border/50 bg-destructive/[0.06] px-4 py-3">
                <p className="text-footnote text-foreground">
                  Se borra el horario de la semana de <strong>{m.nombre}</strong>.
                  {afectadas.length > 0 && (
                    <>
                      {' '}
                      {afectadas.length === 1 ? 'Esta tarea queda' : 'Estas tareas quedan'} sin
                      máquina y {afectadas.length === 1 ? 'deja' : 'dejan'} de programarse:
                    </>
                  )}
                </p>
                {afectadas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {afectadas.map((t) => (
                      <Pill key={t.id} tone="warning">
                        {t.nombre}
                      </Pill>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onCambiar(maquinas.filter((x) => x.id !== m.id))
                      setPorBorrar(null)
                    }}
                    className="flex min-h-[44px] items-center rounded-ctl bg-destructive px-3.5 text-footnote font-medium text-background"
                  >
                    Eliminar igual
                  </button>
                  <button
                    onClick={() => setPorBorrar(null)}
                    className="flex min-h-[44px] items-center rounded-ctl border border-border px-3.5 text-footnote text-muted-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar()
            }}
            placeholder="Agregar máquina o área…"
            className="h-11 min-w-0 flex-1 rounded-ctl border border-border bg-background px-3 text-body text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={agregar}
            disabled={!nuevoNombre.trim()}
            className="flex h-11 items-center gap-1.5 rounded-ctl bg-primary px-3.5 text-body font-medium text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPerfil(p.id)}
              aria-pressed={perfil === p.id}
              title={p.detalle}
              className={cn(
                'flex min-h-[44px] flex-col justify-center rounded-ctl px-3 text-left',
                perfil === p.id
                  ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary'
                  : 'bg-muted/50 text-muted-foreground',
              )}
            >
              <span className="text-footnote font-semibold">{p.label}</span>
              <span className="text-caption text-muted-foreground">{p.detalle}</span>
            </button>
          ))}
        </div>
      </div>
    </ListGroup>
  )
}
