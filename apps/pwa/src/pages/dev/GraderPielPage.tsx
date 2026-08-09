import { useEffect, useState } from 'react'
import { LossCascadeCard } from '@/components/grader/LossCascadeCard'
import { fixtureShift } from './piloto/fixture'

/**
 * Vitrina del MÓDULO GRADER barrido: `/dev/grader-piel`.
 *
 * Para qué: el barrido del Grader toca 111 archivos, pero todas sus pantallas
 * exigen sesión y datos de planta, así que el resultado no se podía MIRAR — solo
 * leer en el diff. Acá se montan componentes REALES del módulo (no copias)
 * alimentados con el fixture del piloto, para poder comparar piel actual vs
 * nueva de un vistazo.
 *
 * Es una página de desarrollo: fuera del menú, con datos sintéticos y su banner.
 * Si un componente se ve mal acá, se ve mal en producción — es el mismo código.
 */
export default function GraderPielPage() {
  const [skin, setSkin] = useState(() => localStorage.getItem('app-skin') || 'apple')
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'dark')
  const shift = fixtureShift()

  useEffect(() => {
    localStorage.setItem('app-skin', skin)
    if (skin === 'default') document.documentElement.removeAttribute('data-skin')
    else document.documentElement.setAttribute('data-skin', skin)
  }, [skin])

  useEffect(() => {
    localStorage.setItem('app-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const Seg = ({ value, set, opts }: { value: string; set: (v: string) => void; opts: [string, string][] }) => (
    <div className="inline-flex rounded-ctl bg-muted-foreground/10 p-[3px]">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          className={`rounded-[7px] px-3.5 py-1 text-[0.78rem] font-medium transition-colors ${
            value === v ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)]' : 'text-muted-foreground'
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
          ANTARFOOD <span className="font-normal text-muted-foreground">· Grader con la piel nueva</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Seg value={skin} set={setSkin} opts={[['apple', 'Piel nueva'], ['default', 'Piel actual']]} />
          <Seg value={theme} set={setTheme} opts={[['light', 'Claro'], ['dark', 'Oscuro']]} />
        </div>
      </header>

      <div className="bg-red-500/[0.14] px-4 py-2 text-center text-[0.78rem] font-semibold text-red-600">
        DATOS DE PRUEBA — no provienen de planta. Sirven para juzgar el DISEÑO, no las cifras.
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-[2rem] font-bold leading-tight tracking-[-0.028em]">Módulo Grader</h1>
          <p className="mt-1 max-w-[62ch] text-[0.9rem] text-muted-foreground">
            Componentes reales del módulo (los mismos que corren en producción), tras el barrido
            de 111 archivos. Cambia piel y tema arriba para ver la diferencia.
          </p>
        </div>

        <LossCascadeCard machines={shift.machines} graderTotalPieces={12480} />
      </main>
    </div>
  )
}
