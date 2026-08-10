import { useEffect, useState } from 'react'
import { IncidentsPage } from '@/pages/IncidentsPage'
import { useAppStore } from '@/store'
import type { Incident } from '@/types'

/**
 * Vitrina de la PANTALLA REAL de Incidencias ya convertida al diseño Apple:
 * `/dev/incidencias-piel`.
 *
 * Monta el componente de producción tal cual —no una copia— sembrando el store
 * de Zustand con incidencias sintéticas. Así se puede juzgar el rediseño sin
 * sesión ni datos de planta; si acá se ve mal, se ve mal en producción.
 */
const AHORA = Date.now()

const DEMO: Incident[] = [
  ['Sensor E825-C sin señal', 'El elevador no confirma posición; el ciclo queda esperando.', 'critica', 'pendiente', 12, 2],
  ['Tensión de correa fuera de rango', 'La correa del transportador patina bajo carga.', 'alta', 'confirmada', 95, 1],
  ['Nivel de aceite hidráulico bajo', 'Se rellenó y se dejó en observación por posible fuga.', 'media', 'en_proceso', 180, 0],
  ['Cambio de cuchillo programado', 'Mantención preventiva del turno, sin incidencia asociada.', 'baja', 'cerrada', 420, 3],
  ['Ruido anómalo en reductor', 'Se escucha golpeteo a régimen alto; pendiente de medición.', 'alta', 'resuelta', 900, 0],
  ['Falso contacto en tablero de bombas', 'Reportado por turno noche; no se pudo reproducir.', 'media', 'rechazada', 1500, 1],
].map(([titulo, descripcion, prioridad, status, minAtras, fotos], i) => ({
  id: `demo-${i}`,
  tipo: 'correctivo',
  titulo,
  descripcion,
  prioridad,
  status,
  fotos: Array.from({ length: fotos as number }, (_, k) => `f${k}`),
  reportadoPor: 'demo-user',
  creadoPor: 'demo-user',
  asignadoA: i % 2 === 0 ? 'demo-tech' : undefined,
  createdAt: new Date(AHORA - (minAtras as number) * 60_000),
})) as unknown as Incident[]

export default function IncidenciasPielPage() {
  const setIncidents = useAppStore((s) => s.setIncidents)
  const [skin, setSkin] = useState(() => localStorage.getItem('app-skin') || 'apple')
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'dark')

  useEffect(() => { setIncidents(DEMO) }, [setIncidents])
  useEffect(() => {
    localStorage.setItem('app-skin', skin)
    if (skin === 'default') document.documentElement.removeAttribute('data-skin')
    else document.documentElement.setAttribute('data-skin', skin)
  }, [skin])
  useEffect(() => {
    localStorage.setItem('app-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const Seg = ({ v, set, opts }: { v: string; set: (x: string) => void; opts: [string, string][] }) => (
    <div className="inline-flex rounded-ctl bg-muted-foreground/10 p-[3px]">
      {opts.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => set(val)}
          className={`rounded-[7px] px-3.5 py-1 text-[0.78rem] font-medium ${
            v === val ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)]' : 'text-muted-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-border bg-card/80 px-5 py-3 backdrop-blur-xl">
        <span className="text-[0.8rem] font-semibold">
          ANTARFOOD <span className="font-normal text-muted-foreground">· Incidencias rediseñada</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Seg v={skin} set={setSkin} opts={[['apple', 'Piel nueva'], ['default', 'Piel actual']]} />
          <Seg v={theme} set={setTheme} opts={[['light', 'Claro'], ['dark', 'Oscuro']]} />
        </div>
      </header>
      <div className="bg-red-500/[0.15] px-4 py-2 text-center text-[0.78rem] font-semibold text-ink-crit">
        DATOS DE PRUEBA — la pantalla es la de producción; las incidencias son inventadas.
      </div>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <IncidentsPage />
      </main>
    </div>
  )
}
