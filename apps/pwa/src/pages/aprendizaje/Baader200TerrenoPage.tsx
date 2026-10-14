/**
 * Referencia de terreno · manual de ajustes BAADER 200 (opción A «el número primero»,
 * mockup aprobado 2026-09-27).
 *
 * La pregunta que responde, frente a la máquina y en 10 segundos: «¿cuánto va “a” para
 * trucha?» o «¿qué pieza es la pos. 11 y hay en bodega?». Por eso el orden es cifra →
 * otras medidas → dibujo con leyenda → pasos → si falla → lo didáctico, plegado.
 * Cada dato lleva su página del PDF original (manual V4 del fabricante o manual de planta).
 *
 * Teléfono: una columna y barra flotante anterior · Secciones · siguiente.
 * PC (contenedor ≥ 900 px): dibujo y leyenda a la izquierda, fijos; el resto a la derecha.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import {
  FUENTES,
  INDICE_TERRENO,
  SECCIONES_TERRENO,
  getSeccionTerreno,
  type EspecieId,
  type Fuente,
  type SeccionTerreno,
} from '@/data/baader200Terreno'
import { useAuthStore } from '@/store'
import { useRepuestosByCodigos } from '@/hooks/repuestos/useRepuestosByCodigos'
import { EncabezadoHerramienta, ListGroup } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  ANCLAS,
  dibujoParaPos,
  dibujoPreferido,
  vecinas,
  type EntradaBusqueda,
} from '@/utils/aprendizaje/terreno'
import { MedidaPrincipal } from '@/components/aprendizaje/terreno/MedidaPrincipal'
import { OtrasMedidas } from '@/components/aprendizaje/terreno/OtrasMedidas'
import { DibujoConLeyenda } from '@/components/aprendizaje/terreno/DibujoConLeyenda'
import { Pasos } from '@/components/aprendizaje/terreno/Pasos'
import { SiFalla } from '@/components/aprendizaje/terreno/SiFalla'
import { BuscadorTerreno } from '@/components/aprendizaje/terreno/BuscadorTerreno'
import { HojaSecciones } from '@/components/aprendizaje/terreno/HojaSecciones'
import { VisorPagina } from '@/components/aprendizaje/terreno/VisorPagina'
import { FuenteLink } from '@/components/aprendizaje/terreno/enlaces'

const RUTA = '/aprendizaje/baader-200/terreno'
const FICHA = '/aprendizaje/maquina/baader-200'

/** Lo que el buscador deja pendiente al saltar a otra sección. */
interface Salto {
  especie?: EspecieId
  pos?: string[]
  ancla?: string
}

export function Baader200TerrenoPage() {
  const { seccionId } = useParams()
  const primera = SECCIONES_TERRENO[0]
  const seccion = seccionId ? getSeccionTerreno(seccionId) : undefined
  if (!seccion) return primera ? <Navigate to={`${RUTA}/${primera.id}`} replace /> : <Navigate to={FICHA} replace />
  // key: cada sección arranca con su propio estado (especie, pieza, dibujo).
  return <Seccion key={seccion.id} seccion={seccion} />
}

function desplazar(el: Element | null, block: ScrollLogicalPosition = 'start') {
  if (!el) return
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block })
}

function visibleEntero(el: Element | null): boolean {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.bottom <= window.innerHeight
}

function Seccion({ seccion }: { seccion: SeccionTerreno }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuthStore()

  const [especie, setEspecie] = useState<EspecieId>(seccion.medidaPrincipal?.porEspecie[0]?.especie ?? 'salmon')
  const [posActivas, setPosActivas] = useState<string[]>([])
  const [piezaActiva, setPiezaActiva] = useState<number | null>(null)
  const [dibujoId, setDibujoId] = useState(() => dibujoPreferido(seccion.dibujos)?.id ?? '')
  const [visor, setVisor] = useState<Fuente | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [hoja, setHoja] = useState(false)

  // Dos columnas según el ancho REAL del contenido (con o sin la barra lateral de la app),
  // no el de la ventana: a 1024 px con la barra lateral no caben.
  const raizRef = useRef<HTMLDivElement>(null)
  const figRef = useRef<HTMLDivElement>(null)
  const [dosColumnas, setDosColumnas] = useState(false)
  useLayoutEffect(() => {
    const el = raizRef.current
    if (!el) return
    const medir = () => setDosColumnas(el.clientWidth >= 900)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Stock en vivo solo con sesión: sin ella Firestore rechaza y la leyenda va sin stock.
  const saps = useMemo(() => seccion.leyenda.flatMap(p => p.sap ?? []), [seccion])
  const { bySap, loading } = useRepuestosByCodigos(isAuthenticated ? saps : [])

  const v = vecinas(INDICE_TERRENO, seccion.id)

  const mostrarPos = useCallback((pos: string[], opts: { pieza?: number | null; desplazar?: boolean } = {}) => {
    setPosActivas(pos)
    setPiezaActiva(opts.pieza !== undefined
      ? opts.pieza
      : (() => {
          const exacta = seccion.leyenda.findIndex(p => p.pos.length && p.pos.join() === pos.join())
          if (exacta >= 0) return exacta
          const parcial = seccion.leyenda.findIndex(p => p.pos.some(x => pos.includes(x)))
          return parcial >= 0 ? parcial : null
        })())
    setDibujoId(actual => dibujoParaPos(seccion.dibujos, pos, actual)?.id ?? actual)
    if (opts.desplazar && !visibleEntero(figRef.current)) {
      requestAnimationFrame(() => desplazar(figRef.current, 'center'))
    }
  }, [seccion])

  const verPos = useCallback((pos: string[]) => mostrarPos(pos, { desplazar: true }), [mostrarPos])

  const tocarPieza = (i: number) => {
    if (piezaActiva === i) {
      setPiezaActiva(null)
      setPosActivas([])
      return
    }
    mostrarPos(seccion.leyenda[i]?.pos ?? [], { pieza: i, desplazar: !dosColumnas })
  }

  const tocarHotspot = (pos: string) => {
    const i = seccion.leyenda.findIndex(p => p.pos.includes(pos))
    mostrarPos([pos], { pieza: i >= 0 ? i : null })
  }

  const aplicarSalto = useCallback((s: Salto) => {
    if (s.especie) setEspecie(s.especie)
    if (s.pos?.length) mostrarPos(s.pos)
    if (s.ancla) {
      const ancla = s.ancla
      requestAnimationFrame(() => desplazar(document.getElementById(ancla), ancla === ANCLAS.dibujo ? 'start' : 'center'))
    }
  }, [mostrarPos])

  // Salto pendiente del buscador cuando el resultado era de otra sección.
  useEffect(() => {
    const s = (location.state as { salto?: Salto } | null)?.salto
    if (s) aplicarSalto(s)
  }, [location.key, location.state, aplicarSalto])

  const elegirResultado = (e: EntradaBusqueda) => {
    const salto: Salto = { especie: e.especie, pos: e.pos, ancla: e.ancla }
    if (e.seccionId && e.seccionId !== seccion.id) {
      navigate(`${RUTA}/${e.seccionId}`, { state: { salto } })
    } else {
      aplicarSalto(salto)
    }
  }

  const irASeccion = (id: string) => { if (id !== seccion.id) navigate(`${RUTA}/${id}`) }

  const subtitulo = `Ajuste ${v.posicion} de ${v.total} · ${seccion.zona}`

  // ── Bloques ──
  const medida = seccion.medidaPrincipal && (
    <MedidaPrincipal medida={seccion.medidaPrincipal} especie={especie} onEspecie={setEspecie} onVerPos={verPos} onFuente={setVisor} />
  )
  const otras = <OtrasMedidas medidas={seccion.medidas} onVerPos={verPos} onFuente={setVisor} />
  const dibujo = (
    <DibujoConLeyenda
      ref={figRef}
      seccion={seccion}
      dibujoId={dibujoId}
      onDibujo={setDibujoId}
      posActivas={posActivas}
      piezaActiva={piezaActiva}
      onPieza={tocarPieza}
      onHotspot={tocarHotspot}
      hotspotsTocables={dosColumnas}
      stock={{ habilitado: isAuthenticated, loading, bySap }}
      onFuente={setVisor}
    />
  )
  const pasos = <Pasos pasos={seccion.pasos} advertencias={seccion.advertencias} onVerPos={verPos} onFuente={setVisor} />
  const siFalla = <SiFalla diagnostico={seccion.diagnostico} onFuente={setVisor} />
  const aprender = <ParaAprender seccion={seccion} onFuente={setVisor} />

  return (
    <div
      ref={raizRef}
      className={cn(
        'min-h-full w-full bg-background text-foreground',
        // Aire para la barra flotante de secciones. La ruta es de «lectura» (lib/rutasHerramienta.ts):
        // ya no hay barra de la app debajo, con o sin sesión.
        !dosColumnas && 'pb-[calc(env(safe-area-inset-bottom,0px)+96px)]',
        dosColumnas && 'pb-10',
      )}
    >
      {/* Encabezado único del marco: antes «‹ Baader 200», el título y la lupa. El buscador pasa a
          ser el control (campo de 48 px) bajo el encabezado en el celular y dentro de él en PC. */}
      <EncabezadoHerramienta
        pegajoso
        etiquetaVolver="Baader 200"
        volverA={FICHA}
        titulo={seccion.titulo}
        subtitulo={dosColumnas ? `Manual de ajustes BAADER 200 · ${subtitulo.charAt(0).toLowerCase()}${subtitulo.slice(1)}` : subtitulo}
        contextoAria={`Estoy en el manual de ajustes de la Baader 200, sección «${seccion.titulo}». `}
        control={
          <button
            type="button"
            aria-label="Buscar en el manual"
            onClick={() => setBuscando(true)}
            className="flex h-[48px] w-full items-center gap-2 rounded-full bg-muted px-4 text-left text-body text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search aria-hidden className="size-[18px] shrink-0" />
            Medida, pos. o código
          </button>
        }
      />
      <div className={cn('mx-auto w-full pt-4', dosColumnas ? 'max-w-[1180px] px-5' : 'max-w-[640px] px-4')}>
        {dosColumnas && <TiraSecciones actualId={seccion.id} onElegir={irASeccion} />}

        {dosColumnas ? (
          <div className="grid grid-cols-[minmax(0,540px)_minmax(0,1fr)] items-start gap-6">
            <div className="sticky top-[136px] max-h-[calc(100dvh-152px)] space-y-6 overflow-y-auto overscroll-contain pb-1">
              {dibujo}
            </div>
            <div className="min-w-0 space-y-6">
              {medida}
              {otras}
              {pasos}
              {siFalla}
              {aprender}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {medida}
            {otras}
            {dibujo}
            {pasos}
            {siFalla}
            {aprender}
          </div>
        )}
      </div>

      {!dosColumnas && (
        <BarraSecciones
          anterior={v.anterior}
          siguiente={v.siguiente}
          onIr={irASeccion}
          onSecciones={() => setHoja(true)}
        />
      )}

      <BuscadorTerreno abierto={buscando} onCerrar={() => setBuscando(false)} onElegir={elegirResultado} actualId={seccion.id} />
      <HojaSecciones abierta={hoja} onCerrar={() => setHoja(false)} actualId={seccion.id} onElegir={irASeccion} />
      <VisorPagina fuente={visor} onCerrar={() => setVisor(null)} />
    </div>
  )
}

// ─── Plegados didácticos ──────────────────────────────────────────────────

function ParaAprender({ seccion, onFuente }: { seccion: SeccionTerreno; onFuente: (f: Fuente) => void }) {
  const d = seccion.didactico
  if (!d?.porQue && !d?.notaAuditoria) return null
  const porQue = d.porQue
  const img = porQue
    ? seccion.dibujos.find(x => x.id === porQue.dibujoId)?.url ?? FUENTES[porQue.fuente.id].urlPagina(porQue.fuente.pagina)
    : undefined
  const fila = 'flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-body [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
  const flecha = <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
  return (
    <ListGroup title="Para aprender">
      {porQue && (
        <details className="group">
          <summary className={fila}>Por qué se ajusta así {flecha}</summary>
          <div className="space-y-2 px-4 pb-4 text-subhead leading-snug text-muted-foreground">
            <p>{porQue.texto}</p>
            {img && (
              <button
                type="button"
                onClick={() => onFuente(porQue.fuente)}
                className="block w-full overflow-hidden rounded-[14px] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Ampliar la página del manual"
              >
                <img src={img} alt="Página del manual con el principio de corte" loading="lazy" className="w-full dark:brightness-[.86]" />
              </button>
            )}
            <FuenteLink fuente={porQue.fuente} onAbrir={onFuente} />
          </div>
        </details>
      )}
      {d.notaAuditoria && (
        <details className={cn('group relative', porQue && "before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-['']")}>
          <summary className={fila}>
            Nota planta vs. fabricante
            <span className="ml-auto text-subhead text-muted-foreground">1 nota</span>
            {flecha}
          </summary>
          <p className="px-4 pb-4 text-subhead leading-snug text-muted-foreground">{d.notaAuditoria}</p>
        </details>
      )}
    </ListGroup>
  )
}

// ─── Navegación entre secciones ───────────────────────────────────────────

type Vecina = ReturnType<typeof vecinas>['anterior']

function BarraSecciones({ anterior, siguiente, onIr, onSecciones }: {
  anterior: Vecina
  siguiente: Vecina
  onIr: (id: string) => void
  onSecciones: () => void
}) {
  const lado = (e: Vecina, dir: 'ant' | 'sig') => {
    const disponible = !!e?.id && SECCIONES_TERRENO.some(s => s.id === e.id)
    return (
      <button
        type="button"
        disabled={!disponible}
        onClick={() => e?.id && onIr(e.id)}
        aria-label={e ? `${dir === 'ant' ? 'Anterior' : 'Siguiente'}: ${e.titulo}${disponible ? '' : ' (pendiente)'}` : undefined}
        className={cn(
          'flex min-h-[48px] min-w-0 items-center gap-1 rounded-full px-1.5 text-subhead leading-tight text-primary',
          'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          dir === 'sig' && 'justify-end text-right',
          !e && 'invisible',
        )}
      >
        {dir === 'ant' && <ChevronLeft aria-hidden className="size-5 shrink-0" />}
        {e && (
          <span className="min-w-0">
            <small className="block text-nota text-muted-foreground tabular-nums">
              {e.numero}{disponible ? '' : ' · pendiente'}
            </small>
            <span className="block truncate">{e.titulo}</span>
          </span>
        )}
        {dir === 'sig' && <ChevronRight aria-hidden className="size-5 shrink-0" />}
      </button>
    )
  }
  return (
    <nav
      aria-label="Secciones del manual"
      className="glass-nav fixed inset-x-3 z-30 mx-auto grid h-[60px] max-w-[616px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 rounded-full px-1.5"
      // Flota sobre la safe area (no hay barra de la app debajo en esta ruta).
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      {lado(anterior, 'ant')}
      <button
        type="button"
        onClick={onSecciones}
        className="min-h-[48px] rounded-full bg-muted px-4 text-subhead font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Secciones
      </button>
      {lado(siguiente, 'sig')}
    </nav>
  )
}

function TiraSecciones({ actualId, onElegir }: { actualId: string; onElegir: (id: string) => void }) {
  return (
    <nav aria-label="Secciones del manual" className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {INDICE_TERRENO.map(e => {
        const disponible = !!e.id && SECCIONES_TERRENO.some(s => s.id === e.id)
        const actual = e.id === actualId
        return (
          <button
            key={e.numero}
            type="button"
            disabled={!disponible}
            aria-current={actual ? 'page' : undefined}
            title={disponible ? undefined : 'Pendiente de estructurar'}
            onClick={() => e.id && onElegir(e.id)}
            className={cn(
              'min-h-[48px] shrink-0 whitespace-nowrap rounded-full px-3 text-subhead',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              actual ? 'bg-primary/[0.1] font-semibold text-brand-ink' : disponible ? 'text-foreground hover:bg-accent' : 'text-muted-foreground',
            )}
          >
            <span className="tabular-nums">{e.numero}</span> · {e.titulo}
          </button>
        )
      })}
    </nav>
  )
}
