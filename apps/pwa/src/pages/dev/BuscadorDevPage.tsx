/**
 * Vitrina del buscador rápido con datos reales, sin sesión (solo `pnpm dev`).
 * Lee `public/dev/buscador-real.json` (equipment + repuestosIndice/sap exportados
 * con firebase-admin; el archivo no se versiona). Ctrl+K abre y cierra.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { BuscadorRapido } from '@/components/buscador/BuscadorRapido'
import { useAtajoBuscador, etiquetaAtajo } from '@/hooks/useAtajoBuscador'
import type { RepuestoDelCatalogo } from '@/services/bitacora/repuestosBitacora'
import type { Equipment } from '@/types'

const PAGINAS = [
  { name: 'Bitácora de turno', href: '/bitacora', grupo: 'Operación' },
  { name: 'Calendario de mantención', href: '/calendario-mantencion', grupo: 'Operación' },
  { name: 'Repuestos', href: '/repuestos', grupo: 'Operación' },
  { name: 'Visor de planta 3D', href: '/map', grupo: 'Planta' },
  { name: 'Análisis de turno', href: '/analisis-grader', grupo: 'Análisis' },
  { name: 'Centro de aprendizaje', href: '/aprendizaje', grupo: 'Aprender' },
  { name: 'Centro técnico documental', href: '/centro-tecnico-documental', grupo: 'Aprender' },
]

let datos: Promise<{ equipos: Equipment[]; repuestos: RepuestoDelCatalogo[] }> | null = null
const cargar = () =>
  (datos ??= fetch(`${import.meta.env.BASE_URL}dev/buscador-real.json`).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
  ))

export function BuscadorDevPage() {
  const setEquipment = useAppStore((s) => s.setEquipment)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    cargar()
      .then((d) => setEquipment(d.equipos))
      .catch((e: unknown) => setError(String(e)))
  }, [setEquipment])
  const alternar = useCallback(() => setOpen((v) => !v), [])
  useAtajoBuscador(alternar)
  const cargarRepuestos = useCallback(() => cargar().then((d) => d.repuestos), [])

  return (
    <div className="min-h-dvh bg-background p-6 text-body text-foreground">
      <p>Vitrina del buscador. {etiquetaAtajo()} abre y cierra.</p>
      {error && <p className="text-footnote text-muted-foreground">Sin datos exportados: {error}</p>}
      <BuscadorRapido open={open} onOpenChange={setOpen} paginas={PAGINAS} cargarRepuestos={cargarRepuestos} />
    </div>
  )
}
