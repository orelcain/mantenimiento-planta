import { useEffect, useState } from 'react'
import { LayoutGrid, Plus, Settings2, GraduationCap, MoreHorizontal } from 'lucide-react'
import { Button, Pill, Tag, ListGroup, ListCell, CellIcon, Sheet, TabBar } from '@/components/piel'

/**
 * Vitrina VIVA de la nueva piel: `/dev/piel`.
 *
 * Para qué existe: durante la migración hay que poder ver los primitivos con
 * contenido real y comparar piel nueva vs actual en claro y oscuro, sin navegar
 * media app ni tener datos de planta cargados. Los dos conmutadores de arriba
 * escriben el mismo `localStorage` que usa la app, así que lo que se ve acá es
 * exactamente lo que se verá en el resto.
 *
 * No es una página de producción: no consume Firestore ni se enlaza en el menú.
 */

function useToggle(key: string, initial: string) {
  const [v, setV] = useState(() => localStorage.getItem(key) || initial)
  useEffect(() => {
    localStorage.setItem(key, v)
    if (key === 'app-theme') {
      document.documentElement.classList.toggle('dark', v === 'dark')
    } else if (v === 'default') {
      document.documentElement.removeAttribute('data-skin')
    } else {
      document.documentElement.setAttribute('data-skin', v)
    }
  }, [key, v])
  return [v, setV] as const
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-ctl bg-muted-foreground/10 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[7px] px-3.5 py-1 text-[0.78rem] font-medium transition-colors duration-200 ${
            value === o.value
              ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[1.25rem] font-bold tracking-[-0.02em]">{title}</h2>
        {hint && <p className="text-[0.82rem] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export default function PielShowcasePage() {
  const [skin, setSkin] = useToggle('app-skin', 'apple')
  const [theme, setTheme] = useToggle('app-theme', 'dark')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tab, setTab] = useState('turno')

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Cromo translúcido: el ÚNICO lugar donde la piel permite blur (§6). */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-border bg-card/80 px-6 py-3 backdrop-blur-xl">
        <span className="text-[0.8rem] font-semibold">
          ANTARFOOD <span className="font-normal text-muted-foreground">· Vitrina de la piel</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            value={skin}
            onChange={setSkin}
            options={[
              { value: 'apple', label: 'Piel nueva' },
              { value: 'default', label: 'Piel actual' },
            ]}
          />
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-8">
        <div>
          <h1 className="text-[2.1rem] font-bold leading-tight tracking-[-0.028em]">Primitivos</h1>
          <p className="mt-1 max-w-[60ch] text-[0.92rem] text-muted-foreground">
            Los 5 componentes desde los que se arma toda la app. Cambia piel y tema arriba: lo que
            veas acá es lo que se verá en el resto, porque comparten los mismos tokens.
          </p>
        </div>

        <Section title="Escala tipográfica" hint="8 roles, ni uno más. Los datos siempre tabulares.">
          <div className="flex flex-col gap-3 rounded-card bg-card p-5">
            <p className="text-[2.1rem] font-bold leading-tight tracking-[-0.028em]">Análisis de Turno</p>
            <p className="text-[1.25rem] font-semibold tracking-[-0.02em]">Cascada de pérdidas</p>
            <p className="text-[0.94rem] font-semibold">Sensor E825-C sin señal</p>
            <p className="text-[0.94rem]">
              La correa del elevador presenta tensión fuera del rango nominal.
            </p>
            <p className="text-[0.8rem] text-muted-foreground">
              Baader 142 N°2 · registrada 10:42 por D. Cortés
            </p>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Máquinas · Turno Día
            </p>
            <p className="text-[1.9rem] font-bold tabular-nums tracking-[-0.03em]">
              12 480 <span className="text-[1rem] font-medium text-muted-foreground">pz</span>
            </p>
          </div>
        </Section>

        <Section title="Button" hint="Máximo UN 'filled' por vista: es la acción principal de la pantalla.">
          <div className="flex flex-wrap items-center gap-3 rounded-card bg-card p-5">
            <Button>Registrar incidencia</Button>
            <Button variant="tinted">Exportar PDF</Button>
            <Button variant="plain">Ver historial ›</Button>
            <Button variant="destructive">Detener máquina</Button>
            <Button disabled>Guardar</Button>
            <Button size="sm" variant="tinted">Compacto</Button>
          </div>
        </Section>

        <Section title="Pill" hint="Texto tono 600 sobre fondo tono 500 al 8% — proporción medida, no elegida a ojo.">
          <div className="flex flex-wrap items-center gap-2.5 rounded-card bg-card p-5">
            <Pill tone="critical" dot>Crítica</Pill>
            <Pill tone="warning" dot>Media</Pill>
            <Pill tone="ok" dot>Operando</Pill>
            <Pill tone="info">Programada</Pill>
            <Pill tone="neutral" dot>Sin programar</Pill>
            <Pill tone="ok" dot="pulse">En vivo</Pill>
          </div>
        </Section>

        <Section
          title="Tag (categórico)"
          hint="Hermano de Pill, trabajo distinto: Pill dice ESTADO (hay bueno y malo), Tag dice CATEGORÍA (no hay orden). Un rodamiento en rojo semántico se leería como alerta."
        >
          <div className="flex flex-wrap items-center gap-2.5 rounded-card bg-card p-5">
            <Tag tone={1}>RODAMIENTO</Tag>
            <Tag tone={2}>SELLO/JUNTA</Tag>
            <Tag tone={3}>ELÉCTRICO</Tag>
            <Tag tone={4}>CORREA</Tag>
            <Tag tone={5}>MOTOR</Tag>
            <Tag tone={6}>SENSOR</Tag>
            <Tag tone={7}>VÁLVULA</Tag>
            <Tag tone={8}>FILTRO</Tag>
            <Tag>TORNILLERÍA</Tag>
          </div>
        </Section>

        <Section title="GroupedList" hint="Celda entera táctil (≥44px, con guantes) y separador insetado.">
          <div className="flex flex-col gap-6">
            <ListGroup title="Máquinas · 3 de 4 operando" action="Ver todas">
              <ListCell
                leading={<CellIcon className="bg-red-500">B2</CellIcon>}
                title="Baader 142 N°2"
                subtitle="Falla · motor elevador"
                value="12 min"
                valueSub="detenida"
                onClick={() => {}}
              />
              <ListCell
                leading={<CellIcon className="bg-emerald-500">GR</CellIcon>}
                title="Grader MS4/12"
                subtitle="Operando"
                value="38 pz/min"
                valueSub="meta 53"
                onClick={() => {}}
              />
              <ListCell
                leading={<CellIcon className="bg-emerald-500">B0</CellIcon>}
                title="Baader 200"
                subtitle="Operando"
                value="19 pz/min"
                valueSub="meta 19"
                onClick={() => {}}
              />
              <ListCell
                leading={<CellIcon className="bg-muted-foreground">KN</CellIcon>}
                title="Knuro"
                subtitle="Sin programar"
                value="—"
                onClick={() => {}}
              />
            </ListGroup>

            <ListGroup title="Incidencias del turno" footer="Se cierran con firma del técnico.">
              <ListCell
                trailing={<Pill tone="critical">Crítica</Pill>}
                title="Sensor E825-C sin señal"
                subtitle="Baader 142 N°2"
                value="10:42"
                onClick={() => {}}
              />
              <ListCell
                trailing={<Pill tone="warning">Media</Pill>}
                title="Tensión de correa fuera de rango"
                subtitle="Grader MS4/12"
                value="09:15"
                onClick={() => {}}
              />
              <ListCell
                trailing={<Pill tone="ok">Resuelta</Pill>}
                title="Cambio de cuchillo programado"
                subtitle="Baader 200 · 22 min"
                value="08:04"
                onClick={() => {}}
              />
            </ListGroup>
          </div>
        </Section>

        <Section title="Sheet" hint="Sube desde abajo: en un teléfono a una mano, las acciones quedan al alcance del pulgar.">
          <div className="rounded-card bg-card p-5">
            <Button variant="tinted" onClick={() => setSheetOpen(true)}>
              Cerrar incidencia…
            </Button>
          </div>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="¿Cerrar la incidencia?"
            description="Sensor E825-C sin señal · Baader 142 N°2. Se registrarán 38 min de detención imputada a ELÉCTRICO / SENSORES con tu firma."
            actions={
              <>
                <Button variant="tinted" onClick={() => setSheetOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setSheetOpen(false)}>Cerrar incidencia</Button>
              </>
            }
          />
        </Section>

        <Section title="TabBar" hint="El ＋ central deja registrar una incidencia a un toque desde cualquier pantalla.">
          <div className="overflow-hidden rounded-card border border-border">
            <TabBar
              activeId={tab}
              onSelect={setTab}
              center={{ label: 'Registrar incidencia', icon: <Plus />, onClick: () => setSheetOpen(true) }}
              items={[
                { id: 'turno', label: 'Turno', icon: <LayoutGrid /> },
                { id: 'maquinas', label: 'Máquinas', icon: <Settings2 /> },
                { id: 'aprender', label: 'Aprender', icon: <GraduationCap /> },
                { id: 'mas', label: 'Más', icon: <MoreHorizontal /> },
              ]}
            />
          </div>
        </Section>
      </main>
    </div>
  )
}
