import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertCircle, ExternalLink, Clock } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { FranjaVentanas } from '@/components/calendario/FranjaVentanas'
import { ResumenPlanta } from '@/components/calendario/ResumenPlanta'
import { RuedaPlanta } from '@/components/calendario/RuedaPlanta'
import { cn } from '@/lib/utils'
import {
  cargarTokenPublico,
  esAccesoDenegado,
  type RuedaPublicTokenDoc,
} from '@/services/ruedaPublicToken.service'
import {
  DIAS_CORTOS,
  contarSemana,
  sinConfirmar,
  slotsAHorasDecimal,
} from '@/services/ruedaVentanas'

/**
 * Vista pública de la rueda de ventanas — sin login, por link o QR.
 *
 * Muestra la FRANJA y no la rueda a propósito: quien abre este link (Producción,
 * Higiene, jefatura) viene a leer cuántas horas hay y cuándo chocan, no a pintar.
 * Para esa lectura la franja gana — longitudes sobre un eje común en vez de
 * arcos, y las máquinas alineadas para ver que el choque es simultáneo.
 */
export function RuedaPublicaPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<RuedaPublicTokenDoc | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'vencido' | 'noExiste' | 'ok'>('cargando')
  const [diaIdx, setDiaIdx] = useState<number>(() => (new Date().getDay() + 6) % 7)
  const [maquinaId, setMaquinaId] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setEstado('noExiste')
      return
    }
    let vivo = true
    cargarTokenPublico(token)
      .then((doc) => {
        if (!vivo) return
        if (!doc) {
          setEstado('noExiste')
          return
        }
        if (new Date(doc.expiresAt) < new Date()) {
          setEstado('vencido')
          return
        }
        setData(doc)
        setMaquinaId(doc.maquinas[0]?.id ?? '')
        setEstado('ok')
      })
      .catch((e) => {
        if (!vivo) return
        setEstado(esAccesoDenegado(e) ? 'vencido' : 'noExiste')
      })
    return () => {
      vivo = false
    }
  }, [token])

  const totales = useMemo(() => {
    if (!data) return null
    const porMaquina = data.maquinas.map(contarSemana)
    return {
      libres: porMaquina.reduce((a, r) => a + r.libres, 0),
      agua: porMaquina.reduce((a, r) => a + r.agua, 0),
      higiene: porMaquina.reduce((a, r) => a + r.higiene, 0),
      colacionTomada: porMaquina.reduce((a, r) => a + r.colacionTomada, 0),
    }
  }, [data])

  if (estado === 'cargando') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  if (estado !== 'ok' || !data || !totales) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-title3 text-foreground">
          {estado === 'vencido' ? 'Este link ya venció' : 'Plan no encontrado'}
        </p>
        <p className="max-w-xs text-body text-muted-foreground">
          {estado === 'vencido'
            ? 'Los links del plan valen 30 días. Pídele uno nuevo a Mantención.'
            : 'El link no es válido o fue eliminado.'}
        </p>
        <button
          onClick={() => navigate('/login')}
          className="mt-2 flex min-h-[44px] items-center gap-2 rounded-ctl bg-primary px-4 text-body font-medium text-primary-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          Ir al sistema
        </button>
      </div>
    )
  }

  const creado = new Date(data.createdAt)
  const pendientes = sinConfirmar(data.maquinas)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-title1 text-foreground">Ventanas de intervención de Mantención</h1>
          <p className="max-w-[60ch] text-body text-muted-foreground">
            Cuándo puede entrar Mantención a cada máquina, y en qué horas se cruza con Higiene o con
            la línea corriendo. Solo lectura.
          </p>
          <p className="flex items-center gap-1.5 text-footnote text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Plan al{' '}
            {creado.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}
            {creado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </header>

        {/* Se nombran las máquinas pendientes en vez de descalificar el plan entero:
            lo ya confirmado sirve como evidencia aunque el resto siga en borrador. */}
        {pendientes.length > 0 && (
          <p className="rounded-card border-l-[3px] border-l-cat-4-ink bg-card p-4 text-footnote text-muted-foreground">
            <span className="font-semibold text-foreground">
              {pendientes.length === data.maquinas.length
                ? 'Ningún horario está confirmado en terreno todavía.'
                : `${pendientes.length} de ${data.maquinas.length} horarios sin confirmar en terreno:`}
            </span>{' '}
            {pendientes.length < data.maquinas.length && (
              <span className="text-foreground">{pendientes.map((m) => m.nombre).join(', ')}. </span>
            )}
            Esas horas vienen de una base de referencia y pueden no coincidir con la operación real.
          </p>
        )}

        <section className="flex flex-col gap-3 rounded-card bg-card p-4">
          <p className="text-caption text-muted-foreground">
            Suma de las {data.maquinas.length} máquinas del plan: una ventana de 4 h en dos
            máquinas cuenta 8
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Cifra valor={slotsAHorasDecimal(totales.libres)} detalle="horas-máquina por semana sin nadie encima" />
          <Cifra
            valor={slotsAHorasDecimal(totales.agua)}
            detalle="horas-máquina interviniendo con agua encima"
            alarma={totales.agua > 0}
          />
          <Cifra
            valor={slotsAHorasDecimal(totales.colacionTomada)}
            detalle="horas-máquina de línea parada que toma higiene"
            alarma={totales.colacionTomada > 0}
          />
            <Cifra valor={slotsAHorasDecimal(totales.higiene)} detalle="horas-máquina que ocupa higiene" />
          </div>
        </section>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground">Día</span>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Día de la semana">
              {DIAS_CORTOS.map((d, i) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={i === diaIdx}
                  onClick={() => setDiaIdx(i)}
                  className={cn(
                    'min-h-[44px] min-w-[3rem] rounded-ctl px-3 text-footnote font-semibold transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
                    i === diaIdx ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {data.maquinas.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pub-maquina" className="text-caption text-muted-foreground">
                Máquina del detalle semanal
              </label>
              <select
                id="pub-maquina"
                value={maquinaId}
                onChange={(e) => setMaquinaId(e.target.value)}
                className="h-11 min-w-[13rem] rounded-ctl border border-border bg-card px-3 text-body text-foreground"
              >
                {data.maquinas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <RuedaPlanta
          maquinas={data.maquinas}
          diaIdx={diaIdx}
          maquinaActivaId={maquinaId}
          onSeleccionar={setMaquinaId}
        />

        <ResumenPlanta maquinas={data.maquinas} diaIdx={diaIdx} onVerMaquina={setMaquinaId} />

        <FranjaVentanas maquinas={data.maquinas} diaIdx={diaIdx} maquinaActivaId={maquinaId} />

        <footer className="border-t border-border pt-4 text-caption text-muted-foreground">
          Cada franja son 24 horas en tramos de 5 minutos. La banda inferior de cada máquina es la
          intervención de Mantención: en rojo, los tramos en que se trabaja con higiene encima.
        </footer>
      </div>
    </div>
  )
}

function Cifra({ valor, detalle, alarma }: { valor: string; detalle: string; alarma?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-mono text-title1 tabular-nums',
          alarma ? 'text-destructive' : 'text-foreground',
        )}
      >
        {valor}
      </span>
      <span className="max-w-[18ch] text-footnote text-muted-foreground">{detalle}</span>
    </div>
  )
}
