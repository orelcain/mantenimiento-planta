/**
 * Centro de Aprendizaje · Tarjeta A3C · «Por confirmar en terreno» (ruta
 * `/aprendizaje/baader-142/tarjeta-a3c/por-confirmar`). Lista, por módulo y en orden de fallas, los
 * elementos del plano 888 cuya pieza hay que confirmar mirando el equipo. La ficha de cada uno es
 * `RepuestoA3c` (la misma de la Tarjeta): teléfono = Sheet; PC = lista a la izquierda y ficha a la
 * derecha. El elemento elegido va en `?el=` para compartir el enlace.
 * Prioridad: `data/baader142A3cPrioridad.ts` (curada a mano). Candidatos: `partes.json` en vivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Cog, Disc3, Droplet, ScanLine, Workflow } from 'lucide-react'
import { Button, CellIcon, Disclosure, ListCell, ListGroup, Pill, Sheet } from '@/components/piel'
import { RepuestoA3c } from '@/components/aprendizaje/a3c/RepuestoA3c'
import { cargarA3c, type PaqueteA3c } from '@/data/baader142A3c'
import { PRIORIDAD_A3C, TOTAL_PRIORITARIOS, type TipoElementoPrioritario } from '@/data/baader142A3cPrioridad'
import { usePartesPlano } from '@/hooks/usePartesPlano'
import { usePlanoVinculos } from '@/hooks/usePlanoVinculos'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { armarPorConfirmar, estaEnLista, primeraSeleccion, type FilaPorConfirmar } from '@/utils/aprendizaje/porConfirmarA3c'
import { clasificarRepuesto, letraFamilia, SLUG_PLANO_A3C } from '@/utils/aprendizaje/repuestosA3c'
import { fechaCortaVinculo } from '@/utils/aprendizaje/vinculoTerreno'

const RUTA_TARJETA = '/aprendizaje/baader-142/tarjeta-a3c'

const TIPO_CORTO: Record<TipoElementoPrioritario, string> = {
  motor: 'Motor',
  sensor: 'Sensor',
  encoder: 'Encoder',
  valvula: 'Válvula',
  sonda: 'Sonda',
}

function Glifo({ fila }: { fila: FilaPorConfirmar }) {
  const tipo = fila.tipo
  if (tipo === 'sensor') return <ScanLine aria-hidden />
  if (tipo === 'encoder') return <Disc3 aria-hidden />
  if (tipo === 'valvula') return <Workflow aria-hidden />
  if (tipo === 'sonda') return <Droplet aria-hidden />
  if (tipo === 'motor') return <Cog aria-hidden />
  // Resto del plano: por la letra IEC 81346 de la designación.
  const l = letraFamilia(fila.codigo)
  if (l === 'B') return <ScanLine aria-hidden />
  if (l === 'Y') return <Workflow aria-hidden />
  return <Cog aria-hidden />
}

/** ≥ lg (1024 px): dos paneles. Sin `matchMedia` (pruebas, navegadores raros) se comporta como teléfono. */
function useEsPc(): boolean {
  const q = '(min-width: 1024px)'
  const [pc, setPc] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const f = () => setPc(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return pc
}

function Fila({ fila, sesion, seleccionada, onAbrir }: { fila: FilaPorConfirmar; sesion: boolean; seleccionada: boolean; onAbrir: () => void }) {
  const estado = sesion ? fila.estado : 'pendiente'
  const v = sesion ? fila.vinculo : undefined
  const mono = (t: string) => <span className="font-mono">{t}</span>
  const candidatos = fila.candidatos.length
    ? mono(fila.candidatos.join(' o '))
    : fila.tipo
      ? 'Candidatos en la ficha'
      : 'Sin repuesto identificado'

  let linea2: React.ReactNode = candidatos
  if (estado === 'confirmado') {
    const codigo = v?.codigo ?? fila.candidatos[0]
    const partes = [codigo, v?.confirmadoPorNombre, fechaCortaVinculo(v?.actualizado)].filter(Boolean)
    linea2 = <span className="font-mono text-ink-ok">{partes.join(' · ')}</span>
  } else if (estado === 'corregido') {
    linea2 = <>Leído: {mono(v?.codigo ?? '—')}</>
  }

  let pill: React.ReactNode = null
  if (estado === 'confirmado') pill = <Pill tone="ok"><Check aria-hidden className="size-3" /> Confirmado</Pill>
  else if (estado === 'corregido') pill = <Pill tone="warning">Otra pieza</Pill>
  else if (estado === 'no_aplica') pill = <Pill tone="neutral">No existe</Pill>
  else if (fila.tipo || fila.candidatos.length) pill = <Pill tone="neutral">Pendiente</Pill>

  return (
    <ListCell
      className={cn('min-h-[60px]', seleccionada && 'bg-primary/[0.12]')}
      aria-current={seleccionada ? 'true' : undefined}
      data-testid={`fila-${fila.codigo}`}
      leading={<CellIcon tone="neutral"><Glifo fila={fila} /></CellIcon>}
      title={
        <>
          <span className="font-mono font-semibold">{fila.codigo}</span>{' '}
          <span className="font-normal text-muted-foreground">{fila.tipo ? TIPO_CORTO[fila.tipo] : fila.nombre}</span>
        </>
      }
      detail={fila.lectura ? <span className="text-subhead text-foreground">{fila.lectura}</span> : undefined}
      subtitle={linea2}
      trailing={pill}
      chevron
      onClick={onAbrir}
    />
  )
}

function Ficha({ codigo, nombre }: { codigo: string; nombre?: string }) {
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const sinRepuesto = !!partes && clasificarRepuesto(codigo, partes).estado === 'D'
  return sinRepuesto ? (
    <p className="text-subhead text-muted-foreground" data-testid="ficha-sin-repuesto">
      {codigo}{nombre ? ` · ${nombre}` : ''}: sin repuesto identificado en el catálogo.
    </p>
  ) : (
    <RepuestoA3c codigo={codigo} compacta={false} />
  )
}

export function Baader142A3cPorConfirmarPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [paquete, setPaquete] = useState<PaqueteA3c | null>(null)
  const [error, setError] = useState<string | null>(null)
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const { vinculos } = usePlanoVinculos(SLUG_PLANO_A3C)
  const sesion = useAuthStore(s => s.isAuthenticated)
  const esPc = useEsPc()

  const cargar = useCallback(() => {
    setError(null)
    cargarA3c().then(setPaquete, (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el plano.'))
  }, [])
  useEffect(cargar, [cargar])

  const datos = useMemo(
    () =>
      paquete
        ? armarPorConfirmar({
            prioridad: PRIORIDAD_A3C,
            aparatos: partes?.aparatos,
            // Sin sesión no se afirma nada confirmado.
            vinculos: sesion ? vinculos : null,
            elementos: paquete.datos.elementos,
          })
        : null,
    [paquete, partes, vinculos, sesion],
  )

  const el = params.get('el')
  // Un ?el= que no está en la lista (enlace viejo o mal escrito) se ignora: no abre una ficha
  // de familia por coincidencia ni bloquea la selección automática de la primera pendiente.
  const elValido = datos && estaEnLista(datos, el) ? el : null
  const seleccion = elValido ?? (esPc && datos ? primeraSeleccion(datos) : null)
  const elegir = (codigo: string) => setParams({ el: codigo }, { replace: true })
  const cerrar = () => setParams({}, { replace: true })
  const nombreDe = (c: string) => paquete?.datos.elementos[c]?.es

  const volver = (
    <button
      type="button"
      onClick={() => navigate(RUTA_TARJETA)}
      className="-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-full px-2 text-body text-primary hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ChevronLeft aria-hidden className="size-6" />
      Tarjeta A3C
    </button>
  )

  const cuerpo = datos ? (
    <>
      <section className="mt-4 rounded-card bg-card p-4" data-testid="kpi-por-confirmar">
        {sesion ? (
          <>
            <p className="tabular-nums">
              <span className="text-display font-bold">{datos.prioritarios.confirmados}</span>{' '}
              <span className="text-body text-muted-foreground">de {TOTAL_PRIORITARIOS} prioritarios confirmados</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${(datos.prioritarios.confirmados / TOTAL_PRIORITARIOS) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-footnote text-muted-foreground tabular-nums">
              {datos.plano.confirmados} de {datos.plano.total} en todo el plano
            </p>
          </>
        ) : (
          <p className="text-body text-muted-foreground">Inicia sesión para ver lo confirmado</p>
        )}
        <Pill tone="neutral" className="mt-3">Plano 888 · N2 y N3</Pill>
      </section>

      <div className="mt-6 flex flex-col gap-6">
        {datos.grupos.map(g => (
          <ListGroup
            key={g.modulo.id}
            title={<span className="text-headline text-foreground">{g.numero} · {g.modulo.nombre}</span>}
            action={
              <span className="text-footnote tabular-nums text-muted-foreground">
                {g.modulo.episodios} episodios{sesion ? ` · ${g.confirmados}/${g.total}` : ''}
              </span>
            }
            footer={g.modulo.resumen}
          >
            {g.filas.map(f => (
              <Fila key={f.codigo} fila={f} sesion={sesion} seleccionada={seleccion === f.codigo} onAbrir={() => elegir(f.codigo)} />
            ))}
          </ListGroup>
        ))}

        <div>
          <Disclosure
            title="Resto"
            summary={`${datos.resto.total} elementos${sesion ? ` · ${datos.resto.confirmados} confirmados` : ''}`}
            defaultOpen={false}
            storageKey="a3c-por-confirmar-resto"
            flush
          >
            {datos.resto.filas.map(f => (
              <Fila key={f.codigo} fila={f} sesion={sesion} seleccionada={seleccion === f.codigo} onAbrir={() => elegir(f.codigo)} />
            ))}
          </Disclosure>
          <p className="px-4 pt-2 text-footnote text-muted-foreground">
            Sin fallas registradas no significa que no fallen: la bitácora parte el 16-09.
          </p>
        </div>
      </div>
    </>
  ) : error ? (
    <div className="mt-4 rounded-card bg-card p-4" role="alert">
      <p className="text-subhead">No se pudo cargar el plano. Revisa la conexión e inténtalo de nuevo.</p>
      <p className="mt-1 font-mono text-caption text-muted-foreground">{error}</p>
      <Button className="mt-3" onClick={cargar}>Reintentar</Button>
    </div>
  ) : (
    <div className="mt-4 h-64 animate-pulse rounded-card bg-card motion-reduce:animate-none" role="status" aria-label="Cargando el plano" />
  )

  return (
    <div className="min-h-full w-full bg-background pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-foreground">
      <div className="mx-auto w-full max-w-[640px] px-4 lg:max-w-[1120px]">
        <div className="flex h-[52px] items-center">{volver}</div>
        <h1 className="text-display font-bold">Por confirmar en terreno</h1>
        <p className="mt-0.5 text-footnote text-muted-foreground">Ordenado por fallas en la bitácora desde el 16-09</p>
        <div className="lg:grid lg:grid-cols-[420px_1fr] lg:items-start lg:gap-6">
          <div className="min-w-0">{cuerpo}</div>
          {esPc && seleccion && (
            <aside className="sticky top-4 mt-4 max-h-[calc(100dvh-32px)] overflow-y-auto rounded-card bg-card p-5" data-testid="panel-ficha">
              <h2 className="text-headline font-semibold">
                <span className="font-mono">{seleccion}</span>
                {nombreDe(seleccion) ? <span className="font-normal text-muted-foreground"> · {nombreDe(seleccion)}</span> : null}
              </h2>
              <Ficha codigo={seleccion} nombre={nombreDe(seleccion)} />
            </aside>
          )}
        </div>
      </div>
      {!esPc && (
        <Sheet
          open={!!elValido}
          onClose={cerrar}
          title={elValido ? `${elValido}${nombreDe(elValido) ? ` · ${nombreDe(elValido)}` : ''}` : undefined}
        >
          {elValido && <Ficha codigo={elValido} nombre={nombreDe(elValido)} />}
        </Sheet>
      )}
    </div>
  )
}
