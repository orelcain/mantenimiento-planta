/**
 * Centro de Aprendizaje · Tarjeta A3C · «Por confirmar en terreno» (ruta
 * `/aprendizaje/baader-142/tarjeta-a3c/por-confirmar`). Lista, por módulo y en orden de fallas, los
 * elementos del plano 888 cuya pieza hay que confirmar mirando el equipo. La ficha de cada uno es
 * `RepuestoA3c` (la misma de la Tarjeta): teléfono = Sheet; PC = lista a la izquierda y ficha a la
 * derecha. El elemento elegido va en `?el=` y la máquina en `?maquina=n2` para compartir el enlace.
 * El plano 888 sirve a N2 y N3 y una misma designación puede llevar piezas distintas en cada una:
 * la máquina se elige UNA vez (selector bajo el título), la lista, el KPI y la pregunta de cada
 * ficha hablan de ella, y cada fila dice en una línea gris qué pasa en la otra.
 * Prioridad: `data/baader142A3cPrioridad.ts` (curada a mano). Candidatos: `partes.json` en vivo.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronRight, Cog, Disc3, Droplet, FilePlus, ScanLine, Workflow } from 'lucide-react'
import { Button, CellIcon, Disclosure, EncabezadoHerramienta, ListCell, ListGroup, Pill, Sheet } from '@/components/piel'
import { RepuestoA3c } from '@/components/aprendizaje/a3c/RepuestoA3c'
import { SelectorMaquinaPlano } from '@/components/aprendizaje/SelectorMaquinaPlano'
import { cargarA3c, type PaqueteA3c } from '@/data/baader142A3c'
import { PRIORIDAD_A3C, type TipoElementoPrioritario } from '@/data/baader142A3cPrioridad'
import { usePartesPlano } from '@/hooks/usePartesPlano'
import { usePlanoVinculos } from '@/hooks/usePlanoVinculos'
import { useMaquinaPlano } from '@/hooks/useMaquinaPlano'
import { useAuthStore } from '@/store/authStore'
import { useAltasDeCodigo } from '@/hooks/repuestos/useAltasDeCodigo'
import { cuantosElementos, resumenElementos } from '@/utils/aprendizaje/altaCodigoA3c'
import { kpiAltas, type CodigoSinSap, type KpiAltas } from '@/utils/aprendizaje/kpiAltasA3c'
import { cn } from '@/lib/utils'
import { armarPorConfirmar, estaEnLista, primeraSeleccion, type Conteo, type FilaPorConfirmar } from '@/utils/aprendizaje/porConfirmarA3c'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { clasificarRepuesto, letraFamilia, SLUG_PLANO_A3C } from '@/utils/aprendizaje/repuestosA3c'
import { etiquetaMaquina, fechaCortaVinculo } from '@/utils/aprendizaje/vinculoTerreno'

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

  // Línea gris: qué pasa en la otra máquina (en azul si lleva una pieza distinta).
  const linea3 = sesion
    ? fila.otras.map(o => {
        const mm = etiquetaMaquina(o.maquina)
        const distinta = o.relacion === 'distinta'
        const texto =
          o.estado === 'pendiente'
            ? 'pendiente'
            : o.estado === 'no_aplica'
              ? 'no existe'
              : o.codigo
                ? <>{mono(o.codigo)}{o.relacion ? `, ${o.relacion}` : ''}</>
                : o.estado === 'corregido'
                  ? 'otra pieza'
                  : 'confirmado'
        return (
          <span key={o.maquina} className={cn(distinta && 'text-brand-ink')} data-testid={`otra-${fila.codigo}-${mm}`}>
            {mm}: {texto}
          </span>
        )
      })
    : []
  const previo = sesion && estado === 'pendiente' && fila.anteriorSinMaquina ? <span key="previo">antes sin indicar máquina</span> : null

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
      subtitle={
        <>
          {linea2}
          {(linea3.length > 0 || previo) && (
            <span className="block">
              {[...linea3, previo].filter(Boolean).flatMap((x, i) => (i === 0 ? [x] : [' · ', x]))}
            </span>
          )}
        </>
      }
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

/** KPI de la ronda: barra grande de la máquina elegida y dos chicas (la otra máquina, «En ambas»). */
function KpiRonda({ maquina, maquinas, prioritarios }: { maquina: MaquinaBaader | null; maquinas: readonly MaquinaBaader[]; prioritarios: Conteo }) {
  const pct = (n: number) => `${prioridadPct(n, prioritarios.total)}%`
  const grande = maquina ? (prioritarios.porMaquina[maquina] ?? 0) : prioritarios.enTodas
  const chicas: { clave: string; etiqueta: string; n: number; tenue: boolean }[] = [
    ...maquinas.filter(m => m !== maquina).map(m => ({ clave: m, etiqueta: etiquetaMaquina(m), n: prioritarios.porMaquina[m] ?? 0, tenue: true })),
    ...(maquina ? [{ clave: 'ambas', etiqueta: 'En ambas', n: prioritarios.enTodas, tenue: false }] : []),
  ]
  return (
    <>
      <p className="tabular-nums">
        <span className="text-display font-bold">{grande}</span>{' '}
        <span className="text-body text-muted-foreground">
          de {prioritarios.total} prioritarios resueltos {maquina ? `en ${etiquetaMaquina(maquina)}` : 'en ambas'}
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: pct(grande) }}
        />
      </div>
      {chicas.length > 0 && (
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-2 text-footnote tabular-nums" data-testid="kpi-otras">
          {chicas.map(c => (
            <Fragment key={c.clave}>
              <span className="text-muted-foreground">{c.etiqueta}</span>
              <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', c.tenue ? 'bg-muted-foreground/55' : 'bg-success')}
                  style={{ width: pct(c.n) }}
                />
              </div>
              <span>{c.n}/{prioritarios.total}</span>
            </Fragment>
          ))}
        </div>
      )}
      <p className="mt-2 text-footnote text-muted-foreground">La tarjeta cuenta lo resuelto en ambas máquinas.</p>
    </>
  )
}

const prioridadPct = (n: number, total: number) => (total ? (n / total) * 100 : 0)

/**
 * Fila «Sin SAP · 16 códigos» bajo el indicador de confirmación: de los códigos de fabricante del plano que
 * el maestro no tiene, cuántos ya se dieron de alta, cuántos están pedidos y cuántos faltan por pedir (las
 * tres cifras son excluyentes y suman el total). Al tocarla se abre la lista, ordenada por cuántos
 * elementos cubre cada código.
 */
function FilaSinSap({ kpi, onAbrir }: { kpi: KpiAltas; onAbrir: () => void }) {
  const pct = (n: number) => `${prioridadPct(n, kpi.total)}%`
  return (
    <div className="mt-3" data-testid="kpi-sin-sap">
      <ListGroup footer={`Cubren ${cuantosElementos(kpi.elementosCubiertos)} del plano.`}>
        <button
          type="button"
          onClick={onAbrir}
          className="relative flex min-h-[76px] w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none"
        >
          <CellIcon tone="neutral" className="mt-0.5 bg-warning/[0.15] text-ink-warn"><FilePlus aria-hidden /></CellIcon>
          <span className="min-w-0 flex-1">
            <span className="block text-body">Sin SAP · <b className="font-semibold tabular-nums">{kpi.total}</b> {kpi.total === 1 ? 'código' : 'códigos'}</span>
            <span className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <i className="block h-full bg-success" style={{ width: pct(kpi.dadasDeAlta) }} />
              <i className="block h-full bg-primary" style={{ width: pct(kpi.enBodega) }} />
            </span>
            <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-footnote tabular-nums text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-success" aria-hidden />{kpi.dadasDeAlta} {kpi.dadasDeAlta === 1 ? 'dado' : 'dados'} de alta</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" aria-hidden />{kpi.enBodega} en bodega</span>
              <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-muted ring-1 ring-inset ring-border" aria-hidden />{kpi.sinPedir} sin pedir</span>
            </span>
          </span>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
        </button>
      </ListGroup>
    </div>
  )
}

const GRUPOS_SIN_SAP: { estado: CodigoSinSap['estado']; titulo: string }[] = [
  { estado: 'sin_pedir', titulo: 'Sin pedir' },
  { estado: 'en_bodega', titulo: 'En bodega' },
  { estado: 'dada_de_alta', titulo: 'Dados de alta' },
]

/** Los códigos sin SAP en tres grupos; tocar uno abre la ficha de su primer elemento. */
function ListaSinSap({ kpi, onElegir }: { kpi: KpiAltas; onElegir: (elemento: string) => void }) {
  return (
    <div className="flex flex-col gap-5" data-testid="lista-sin-sap">
      <p className="px-4 text-footnote text-muted-foreground">
        {kpi.total} códigos de fabricante del plano 888 que bodega no tiene. Ordenados por cuántos elementos cubren.
      </p>
      {GRUPOS_SIN_SAP.map(g => {
        const items = kpi.codigos.filter(c => c.estado === g.estado)
        if (!items.length) return null
        return (
          <ListGroup key={g.estado} title={`${g.titulo} · ${items.length}`}>
            {items.map(c => (
              <ListCell
                key={c.codigo}
                data-testid={`sin-sap-${c.codigo}`}
                title={<span className="font-mono tabular-nums">{c.codigo}</span>}
                detail={<span className="text-subhead text-foreground">{c.nombre}</span>}
                subtitle={`${resumenElementos(c.elementos)} · ${[c.nivel === 'conjunto' ? 'conjunto' : '', c.confianza === 'catalogo' ? 'según catálogo' : 'propuesto'].filter(Boolean).join(' · ')}`}
                trailing={
                  c.estado === 'dada_de_alta' ? <Pill tone="ok">SAP {c.sapCreado}</Pill>
                    : c.estado === 'en_bodega' ? <Pill tone="warning">Pendiente</Pill>
                      : undefined
                }
                chevron
                onClick={() => c.elementos[0] && onElegir(c.elementos[0])}
              />
            ))}
          </ListGroup>
        )
      })}
    </div>
  )
}

export function Baader142A3cPorConfirmarPage() {
  const [params, setParams] = useSearchParams()
  const [paquete, setPaquete] = useState<PaqueteA3c | null>(null)
  const [error, setError] = useState<string | null>(null)
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const { maquina, setMaquina, maquinas } = useMaquinaPlano(SLUG_PLANO_A3C)
  const { porAparato } = usePlanoVinculos(SLUG_PLANO_A3C)
  const sesion = useAuthStore(s => s.isAuthenticated)
  const esPc = useEsPc()
  const { altas } = useAltasDeCodigo()
  const kpiSinSap = useMemo(() => (partes ? kpiAltas(partes, altas) : null), [partes, altas])
  const [sinSapAbierto, setSinSapAbierto] = useState(false)

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
            porAparato: sesion ? porAparato : null,
            maquina,
            maquinas,
            elementos: paquete.datos.elementos,
          })
        : null,
    [paquete, partes, porAparato, sesion, maquina, maquinas],
  )

  const el = params.get('el')
  // Un ?el= que no está en la lista (enlace viejo o mal escrito) se ignora: no abre una ficha
  // de familia por coincidencia ni bloquea la selección automática de la primera pendiente.
  const elValido = datos && estaEnLista(datos, el) ? el : null
  const seleccion = elValido ?? (esPc && datos ? primeraSeleccion(datos) : null)
  // Conservan el resto de la query (?maquina=…): `setParams({ el })` la borraba.
  const elegir = (codigo: string) =>
    setParams(prev => { const n = new URLSearchParams(prev); n.set('el', codigo); return n }, { replace: true })
  const cerrar = () =>
    setParams(prev => { const n = new URLSearchParams(prev); n.delete('el'); return n }, { replace: true })
  const nombreDe = (c: string) => paquete?.datos.elementos[c]?.es

  const cuerpo = datos ? (
    <>
      <section className="mt-4 rounded-card bg-card p-4" data-testid="kpi-por-confirmar">
        {sesion ? (
          <>
            <KpiRonda maquina={maquina} maquinas={maquinas} prioritarios={datos.prioritarios} />
            <p className="mt-2 text-footnote text-muted-foreground tabular-nums">
              {maquina ? etiquetaMaquina(maquina) : 'En ambas'}: {maquina ? datos.plano.porMaquina[maquina] ?? 0 : datos.plano.enTodas} de {datos.plano.total} en todo el plano
            </p>
          </>
        ) : (
          <p className="text-body text-muted-foreground">Inicia sesión para ver lo confirmado</p>
        )}
        <Pill tone="neutral" className="mt-3">Plano 888 · N2 y N3</Pill>
      </section>
      {sesion && kpiSinSap && kpiSinSap.total > 0 && <FilaSinSap kpi={kpiSinSap} onAbrir={() => setSinSapAbierto(true)} />}

      <div className="mt-6 flex flex-col gap-6">
        {datos.grupos.map(g => (
          <ListGroup
            key={g.modulo.id}
            title={<span className="text-headline text-foreground">{g.numero} · {g.modulo.nombre}</span>}
            action={
              <span className="text-footnote tabular-nums text-muted-foreground">
                {g.modulo.episodios} episodios{sesion && maquina ? ` · ${g.resueltos}/${g.total} en ${etiquetaMaquina(maquina)}` : ''}
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
            summary={`${datos.resto.total} elementos${sesion && maquina ? ` · ${datos.resto.resueltos} resueltos en ${etiquetaMaquina(maquina)}` : ''}`}
            defaultOpen={false}
            storageKey="a3c-por-confirmar-resto"
            className="[&>button]:min-h-[48px]"
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
      <EncabezadoHerramienta
        pegajoso
        etiquetaVolver="Tarjeta A3C"
        volverA={RUTA_TARJETA}
        titulo="Por confirmar en terreno"
        subtitulo="Ordenado por fallas en la bitácora desde el 16-09"
        contextoAria="Estoy en «Por confirmar en terreno» de la Tarjeta A3C de la Baader 142. "
      />
      <div className="mx-auto w-full max-w-[640px] px-4 lg:max-w-[1120px]">
        <div className="lg:grid lg:grid-cols-[420px_1fr] lg:items-start lg:gap-6">
          <div className="min-w-0">
            {sesion && (
              // Cromo de navegación (translúcido): es la única superficie translúcida y no es contenido.
              <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-10 -mx-4 bg-background/80 lg:top-[120px] px-4 pb-2.5 pt-2 backdrop-blur-xl lg:mx-0 lg:px-0" data-testid="selector-maquina">
                <SelectorMaquinaPlano maquina={maquina} maquinas={maquinas} onChange={setMaquina} />
                <p className="mt-1.5 text-footnote text-muted-foreground tabular-nums">
                  {maquina ? `Respondes por ${etiquetaMaquina(maquina)} · plano 888` : '¿En cuál máquina estás? Elígela para responder.'}
                </p>
              </div>
            )}
            {cuerpo}
          </div>
          {esPc && seleccion && (
            <aside className="sticky top-[136px] mt-4 max-h-[calc(100dvh-152px)] overflow-y-auto rounded-card bg-card p-5" data-testid="panel-ficha">
              <h2 className="text-headline font-semibold">
                <span className="font-mono">{seleccion}</span>
                {nombreDe(seleccion) ? <span className="font-normal text-muted-foreground"> · {nombreDe(seleccion)}</span> : null}
              </h2>
              <Ficha codigo={seleccion} nombre={nombreDe(seleccion)} />
            </aside>
          )}
        </div>
      </div>
      {kpiSinSap && (
        <Sheet open={sinSapAbierto} onClose={() => setSinSapAbierto(false)} surface="grouped" title="Sin SAP" headerAction={<Button variant="plain" onClick={() => setSinSapAbierto(false)}>Listo</Button>}>
          <ListaSinSap kpi={kpiSinSap} onElegir={el => { setSinSapAbierto(false); elegir(el) }} />
        </Sheet>
      )}
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
