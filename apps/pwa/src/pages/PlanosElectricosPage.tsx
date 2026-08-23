import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Link as LinkIcon, Loader2, Printer, QrCode, Search, X, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { PLANOS, assetPlano, planoPorSlug } from '@/data/planos'
import {
  usePlano, guardarPlanoOffline,
  type Caja, type FilaDespiece, type PlanoAparato, type PlanoBorneLibre,
  type PlanoHojaMeta, type PlanoIndice, type PlanoRotulo,
} from '@/hooks/usePlano'
import { usePlanoNotas } from '@/hooks/usePlanoNotas'
import { usePlanoSap } from '@/hooks/usePlanoSap'
import { usePartesPlano } from '@/hooks/usePartesPlano'
import { usePlanoVinculos, type VinculoTerreno } from '@/hooks/usePlanoVinculos'
import { PlanoLienzo, type Foco } from '@/components/planos/PlanoLienzo'
import { NotasAparato } from '@/components/planos/NotasAparato'
import { compactarTramos, compararTags } from '@/utils/designaciones'
import { auth } from '@/services/firebase'

/** minusculas y sin acentos: "posicion" debe encontrar "POSICIÓN ZERO". */
const sinAcentos = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Misma normalización que `_normalizar_pos` en extraer_despiece_142.py: así
 *  una posición tocada en el lienzo (ya normalizada por el extractor) calza
 *  con la misma fila de la tabla, venga como venga escrita en el catálogo. */
const normalizarPos = (t: string) =>
  t.trim().replace(/ /g, '').replace(/,/g, '-').replace(/\./g, '-').replace(/[^A-Za-z0-9-]/g, '').toUpperCase()

/** Escapa para inyectar texto en el HTML de la ventana de impresión (nombres
 *  de piezas pueden traer "&"/"<" sueltos del OCR del catálogo). */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** dd-MM: la fecha corta que va junto a quién confirmó en terreno. */
const formatearFechaCorta = (t?: VinculoTerreno['actualizado']) => {
  if (!t) return ''
  const d = t.toDate()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Etiqueta de un grupo del índice lateral / select de hojas. Los planos
 *  eléctricos usan 2 claves fijas; el despiece manda su propia etiqueta de
 *  capítulo ya armada ("70 · Equipo eléctrico") — se muestra tal cual. */
const etiquetaSeccion = (sec: string) =>
  sec === 'circuitos' ? 'Esquema de circuitos' : sec === 'bornes' ? 'Plano de bornes' : sec

type Seleccion =
  | { tipo: 'aparato'; tag: string }
  | { tipo: 'salto'; t: string; h: number; c: number }
  | { tipo: 'borne'; t: string; h: number }
  | { tipo: 'borneLibre'; l: PlanoBorneLibre }
  | { tipo: 'rotulo'; r: PlanoRotulo }
  | null

export function PlanosElectricosPage() {
  const { slug } = useParams<{ slug: string }>()
  // key: al navegar de un plano a OTRO (boton "Ver en el despiece") la ruta es
  // la misma (/planos/:slug) y react-router REUSA la instancia — sin el key,
  // el visor nuevo heredaba la hoja, la seleccion y el deep-link ya consumido
  // del plano anterior (solo en el layout anonimo; con sesion MainLayout ya
  // remonta por pathname y el bug quedaba escondido).
  return slug ? <Visor key={slug} slug={slug} /> : <Catalogo />
}

/* ────────────────────────────── catálogo ────────────────────────────── */

function Catalogo() {
  // Buscador GLOBAL: un aparato o palabra buscado en LOS 8 PLANOS a la vez
  // ("¿en qué plano está el K7?"). Los índices se cargan la primera vez que
  // se busca y quedan en memoria.
  const [q, setQ] = useState('')
  const [indices, setIndices] = useState<Map<string, PlanoIndice> | null>(null)
  const [cargandoIdx, setCargandoIdx] = useState(false)
  // Se dispara UNA vez: si dependiera de `indices`, cada índice que llega
  // cambiaría la dep, correría el cleanup y cancelaría los que faltan.
  const cargaPedida = useRef(false)
  useEffect(() => {
    if (q.trim().length < 2 || cargaPedida.current) return
    cargaPedida.current = true
    setCargandoIdx(true)
    // PROGRESIVO, no todo-o-nada: buscar en los 9 planos son ~170 KB y antes
    // el primer resultado esperaba a que llegara el último (en la red de
    // planta, una eternidad). Ahora cada índice que llega ya busca, así el
    // buscador responde con lo que tiene y se va completando solo.
    let vivo = true
    let pendientes = PLANOS.length
    const sumar = (slug: string, idx: PlanoIndice) => {
      if (!vivo) return
      setIndices((prev) => new Map(prev ?? []).set(slug, idx))
    }
    PLANOS.forEach((p) => {
      void (async () => {
        try {
          const r = await fetch(assetPlano(p.slug, 'indice.json'))
          const idx = (await r.json()) as PlanoIndice
          sumar(p.slug, idx)   // el índice ya sirve: los aparatos se buscan por código
          // `busqueda` viaja aparte en los planos grandes y pesa: se trae
          // después para no retrasar el primer resultado.
          if (!idx.busqueda?.length) {
            const rb = await fetch(assetPlano(p.slug, 'busqueda.json')).catch(() => null)
            if (rb?.ok) {
              const b = (await rb.json()) as { busqueda?: PlanoIndice['busqueda'] }
              if (b.busqueda) sumar(p.slug, { ...idx, busqueda: b.busqueda })
            }
          }
        } catch { /* ese plano no entra al buscador; los demás sí */ }
        if (--pendientes === 0 && vivo) setCargandoIdx(false)
      })()
    })
    return () => { vivo = false }
  }, [q])

  const v = sinAcentos(q.trim())
  const hits: { slug: string; maquina: string; clave: string; detalle: string; href: string }[] = []
  // Quien escribe "K7" busca el esquema; quien escribe "cuchilla" busca la
  // PIEZA. Con el orden fijo del catálogo, una búsqueda por nombre llenaba
  // los primeros lugares con hojas de circuitos y el catálogo de piezas
  // quedaba fuera de la primera pantalla.
  const pareceDesignacion = /^[a-z]{1,2}\d/i.test(q.trim())
  const planosOrdenados = pareceDesignacion
    ? PLANOS
    : [...PLANOS].sort((a, b) => Number(b.modo === 'despiece') - Number(a.modo === 'despiece'))
  if (v.length >= 2 && indices) {
    for (const p of planosOrdenados) {
      const idx = indices.get(p.slug)
      if (!idx) continue
      let porPlano = 0
      for (const [tag, puntos] of Object.entries(idx.indice)) {
        if (porPlano >= 3 || hits.length >= 24) break
        if (tag.toLowerCase().startsWith(v)) {
          hits.push({ slug: p.slug, maquina: p.maquina, clave: tag,
                      detalle: `${puntos.length} punto${puntos.length !== 1 ? 's' : ''}`,
                      href: `/aprendizaje/planos/${p.slug}?ap=${encodeURIComponent(tag)}` })
          porPlano++
        }
      }
      for (const item of idx.busqueda ?? []) {
        if (porPlano >= 3 || hits.length >= 24) break
        if (sinAcentos(item.es).includes(v)) {
          // En el catálogo de piezas la referencia útil es la FIGURA, no el
          // número interno de hoja: es lo que el técnico busca en el papel.
          const fig = p.modo === 'despiece'
            ? idx.hojas.find((h) => h.blatt === item.h)?.fig
            : undefined
          hits.push({ slug: p.slug, maquina: p.maquina, clave: item.es.slice(0, 34),
                      detalle: fig ? `Fig. ${fig}` : `hoja ${item.h}`,
                      href: `/aprendizaje/planos/${p.slug}?hoja=${item.h}` })
          porPlano++
        }
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-5" style={{ color: 'var(--lc-ink)' }}>
      <header>
        <h1 className="m-0 text-xl font-semibold">Planos eléctricos</h1>
        <p className="m-0 mt-1 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
          El plano del fabricante, navegable: los saltos entre hojas se siguen tocando,
          cada aparato dice dónde más aparece, y los rótulos se leen en castellano.
        </p>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--lc-ink-ghost)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search"
                 placeholder="Buscar en todos los planos: K7, RL33, sellado, excavador…"
                 className="w-full rounded-card border bg-transparent py-2 pl-8 pr-2 font-mono text-footnote outline-none"
                 style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }} />
        </div>
        {v.length >= 2 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {cargandoIdx && (
              <p className="m-0 text-footnote" style={{ color: 'var(--lc-ink-ghost)' }}>Buscando en los {PLANOS.length} planos…</p>
            )}
            {!cargandoIdx && !hits.length && (
              <p className="m-0 text-footnote" style={{ color: 'var(--lc-ink-ghost)' }}>Sin coincidencias en ningún plano.</p>
            )}
            {hits.map((h, i) => (
              <Link key={i} to={h.href}
                    className="flex items-baseline justify-between gap-3 rounded-ctl px-2 py-1.5 no-underline hover:opacity-80"
                    style={{ background: 'var(--lc-surface)', color: 'inherit' }}>
                <span className="font-mono text-footnote" style={{ color: 'var(--lc-aqua-bright)' }}>{h.clave}</span>
                <span className="text-caption" style={{ color: 'var(--lc-ink-mid)' }}>{h.maquina.slice(0, 30)} · {h.detalle}</span>
              </Link>
            ))}
          </div>
        )}
      </header>

      {([
        ['Esquemas eléctricos y neumáticos', PLANOS.filter((p) => p.modo !== 'despiece')],
        ['Planos de partes', PLANOS.filter((p) => p.modo === 'despiece')],
      ] as const).map(([titulo, grupo]) => grupo.length > 0 && (
        <section key={titulo} className="flex flex-col gap-3">
          <h2 className="m-0 flex items-baseline gap-2 text-caption font-semibold tracking-wider"
              style={{ color: 'var(--lc-ink-ghost)' }}>
            {titulo}
            <span className="font-mono normal-case tracking-normal">{grupo.length}</span>
          </h2>
          {grupo.map((p) => (
            <Link key={p.slug} to={`/aprendizaje/planos/${p.slug}`}
                  className="flex flex-col gap-2 rounded-card border p-4 no-underline transition-opacity hover:opacity-90"
                  style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'inherit' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2 text-[15px] font-semibold">
                  {p.maquina}
                  {p.modo === 'despiece' && (
                    <span className="rounded-ctl px-1.5 py-0.5 text-caption font-medium"
                          style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                      Plano de partes
                    </span>
                  )}
                </span>
                <span className="font-mono text-caption" style={{ color: 'var(--lc-aqua-bright)' }}>
                  {p.numero} · {p.revision}
                </span>
              </div>
              <p className="m-0 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
                {p.descripcion}
              </p>
              <div className="flex flex-wrap gap-3 font-mono text-caption" style={{ color: 'var(--lc-ink-lo)' }}>
                <span>{p.hojas} hojas</span>
                <span>{p.aplicaA}</span>
                {!!p.faltantes.length && (
                  <span style={{ color: 'var(--lc-prep)' }}>
                    falta la hoja {p.faltantes.join(', ')} en el PDF original
                  </span>
                )}
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────────── visor ─────────────────────────────── */

function Visor({ slug }: { slug: string }) {
  const cat = planoPorSlug(slug)
  // Modo visor (GEA): sin texto extraible -> sin zonas ni buscador ni DE/ES;
  // lo que SI hay es navegacion completa y notas con fotos POR HOJA.
  const esVisor = cat?.modo === 'visor'
  // Despiece (catalogo de piezas): a diferencia del modo visor SI tiene
  // buscador y notas; lo que no tiene es toggle DE/ES (ya viene en espanol).
  const esDespiece = cat?.modo === 'despiece'
  // Plano ya en espanol (neumaticos GEA): el toggle DE/ES no aplica.
  const sinIdiomas = esVisor || cat?.idioma === 'es'
  // Hoja inicial: la de la URL (?hoja=9, para compartir un punto del plano por
  // chat) o la última visitada en este equipo; usePlano valida contra el índice.
  // ⚠ Los parametros se leen del ROUTER, no de window.location: al navegar
  // entre planos (boton "Ver en el despiece") window.location puede ir un
  // tick atras del render y este visor arrancaba con la hoja del plano
  // ANTERIOR (carrera intermitente que devolvia al usuario a donde estaba).
  const busquedaRuta = useLocation().search
  const [inicial] = useState<number | undefined>(() => {
    const q = Number(new URLSearchParams(busquedaRuta).get('hoja'))
    if (Number.isInteger(q) && q > 0) return q
    const g = Number(localStorage.getItem(`plano-hoja:${slug}`))
    return Number.isInteger(g) && g > 0 ? g : undefined
  })
  const { indice, hoja, abrir, cargando, error, reintentar, cargarBusqueda } = usePlano(slug, inicial)
  // ?fig=70-8 — en el catálogo de piezas la referencia que la gente se pasa
  // por chat es la FIGURA impresa, no el número de hoja del visor. Se
  // resuelve cuando llega el índice (que es quien conoce el mapa fig→hoja).
  const figPedida = new URLSearchParams(busquedaRuta).get('fig')
  const figAbierta = useRef(false)
  useEffect(() => {
    if (figAbierta.current || !indice || !figPedida) return
    const destino = indice.hojas.find((h) => h.fig === figPedida)
    if (!destino) return
    figAbierta.current = true
    void abrir(destino.blatt)
  }, [indice, figPedida, abrir])
  const notas = usePlanoNotas(slug)
  // Puente electrico -> pieza: solo trae datos en los planos que ya tienen
  // curaduria (888/860); en el resto (incluido el propio despiece) queda null.
  const partes = usePartesPlano(slug)
  // Confirmacion EN TERRENO de ese puente: quien esta frente a la maquina
  // dice si el catalogo acerto, se equivoco o el aparato ni existe ahi.
  const vinculosTerreno = usePlanoVinculos(slug)
  const [sel, setSel] = useState<Seleccion>(null)
  const [foco, setFoco] = useState<Foco>(null)
  // ES por defecto: el equipo lee castellano; el aleman queda a un toque para
  // cotejar con el original. La eleccion se recuerda por equipo.
  const [mostrarEs, setMostrarEs] = useState(
    () => (localStorage.getItem('plano-idioma') ?? 'es') === 'es',
  )
  const [busca, setBusca] = useState('')
  const [ayuda, setAyuda] = useState(false)
  // "Resaltar todos": ilumina cada aparicion del aparato/senal seleccionado
  // en la hoja actual, para seguir un cable con la vista.
  const [resaltar, setResaltar] = useState(false)
  const [mostrarQR, setMostrarQR] = useState(false)
  // Ultimos aparatos consultados en este equipo (la falla de ayer sin re-buscar)
  const [recientes, setRecientes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`plano-recientes:${slug}`) ?? '[]') as string[] }
    catch { return [] }
  })
  // La hoja inferior movil: altura ajustable arrastrando la agarradera, y
  // minimizable a una barrita (las esquinas curvas del telefono escondian el
  // contenido pegado al borde; ademas a veces solo quieres ver el plano).
  const [altoHoja, setAltoHoja] = useState<number | null>(null)
  const [minimizada, setMinimizada] = useState(false)
  const [esMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const ajuste = useRef<{ y: number; alto: number } | null>(null)
  const asideRef = useRef<HTMLElement>(null)
  const raizRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  // Con sesion la pagina vive DENTRO del layout de la app (topbar arriba):
  // 100dvh sobraba por esa altura y el scroll externo se llevaba el riel de
  // busqueda. Se mide donde empieza la pagina y se resta.
  const [altoPagina, setAltoPagina] = useState('100dvh')
  useEffect(() => {
    const medir = () => {
      const top = raizRef.current?.getBoundingClientRect().top ?? 0
      setAltoPagina(`calc(100dvh - ${Math.max(0, Math.round(top))}px)`)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  // El indice lateral sigue a la hoja activa
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [hoja?.blatt])

  // Miga de pan: tras seguir 2-3 saltos hay que poder deshacer el camino.
  const [historial, setHistorial] = useState<number[]>([])
  // Y lo mismo para el PANEL: al tocar un borne desde la ficha del SM4 se
  // perdia la ficha con sus 8 puntos, sin camino de vuelta.
  const [pilaSel, setPilaSel] = useState<{ s: NonNullable<Seleccion>; h: number }[]>([])
  const buscaRef = useRef<HTMLInputElement>(null)

  const meta = useMemo(
    () => indice?.hojas.find((h) => h.blatt === hoja?.blatt) ?? null,
    [indice, hoja],
  )

  // Grupos del select/nav lateral: 2 fijos en los planos electricos
  // ('circuitos'/'bornes'), N en el despiece (una etiqueta por capitulo).
  const secciones = useMemo(
    () => (indice ? [...new Set(indice.hojas.map((h) => h.seccion))] : []),
    [indice],
  )

  const irA = useCallback(
    async (blatt: number, col?: number, caja?: Caja) => {
      setFoco(caja ? { tipo: 'caja', b: caja } : col != null ? { tipo: 'columna', c: col } : null)
      // Cambiar de hoja apila la actual (tope 20, como un historial de navegador).
      setHistorial((h) => {
        const actual = hoja?.blatt
        return actual != null && actual !== blatt ? [...h.slice(-19), actual] : h
      })
      await abrir(blatt)
    },
    [abrir, hoja],
  )

  const seleccionar = useCallback((nuevo: Seleccion) => {
    setMinimizada(false)
    setResaltar(false)
    if (nuevo?.tipo === 'aparato') {
      // En el despiece se guarda el CÓDIGO, no la posición: un chip que dice
      // "24" no significa nada (esa posición existe en decenas de figuras),
      // y el código además reabre la ficha correcta desde cualquier hoja.
      const clave = esDespiece
        ? (hoja?.datos.filas?.find((f) => normalizarPos(f.pos) === nuevo.tag)?.nr ?? null)
        : nuevo.tag
      if (clave) {
        setRecientes((r) => {
          const v = [clave, ...r.filter((x) => x !== clave)].slice(0, 6)
          localStorage.setItem(`plano-recientes:${slug}`, JSON.stringify(v))
          return v
        })
      }
    }
    setSel((previo) => {
      if (previo && nuevo && previo !== nuevo && hoja) {
        setPilaSel((p) => [...p.slice(-14), { s: previo, h: hoja.blatt }])
      }
      return nuevo
    })
  }, [hoja, slug, esDespiece])

  const volverSel = useCallback(() => {
    setPilaSel((p) => {
      const previa = p[p.length - 1]
      if (previa) {
        setSel(previa.s)
        setFoco(null)
        void abrir(previa.h)
      }
      return p.slice(0, -1)
    })
  }, [abrir])

// Deep-link ?ap=F24: abre la ficha del aparato y salta a su primera
  // aparicion. Para mandar por chat "mira ESTE aparato", no solo la hoja.
  const apAbierto = useRef(false)
  useEffect(() => {
    if (apAbierto.current || !indice || !hoja) return
    apAbierto.current = true
    const ap = new URLSearchParams(busquedaRuta).get('ap')
    if (!ap) return
    const apN = normalizarPos(ap)
    // En el despiece un ?ap= puede ser un CÓDIGO de repuesto (así llega el
    // link desde Repuestos): la ficha útil es la de la PIEZA —con su nombre,
    // cantidad, SAP y la tabla de la figura—, no la ficha genérica de aparato.
    if (esDespiece) {
      const filaCodigo = hoja.datos.filas?.find(
        (f) => f.nr && normalizarPos(f.nr) === apN,
      )
      if (filaCodigo) {
        seleccionar({ tipo: 'aparato', tag: normalizarPos(filaCodigo.pos) })
        const tagCaja = hoja.datos.tags.find((t) => normalizarPos(t.t) === normalizarPos(filaCodigo.pos))
        if (tagCaja) setFoco({ tipo: 'caja', b: tagCaja.b })
        return
      }
    }
    if (indice.indice[apN]) {
      // si la URL tambien trae ?hoja=, mandan la hoja pedida: se busca la
      // aparicion del aparato AHI; si no hay, recien se va a la primera
      const puntos = indice.indice[apN]
      const enHojaPedida = puntos.find((pt) => pt.h === hoja.blatt)
      const destino = enHojaPedida ?? puntos[0]
      seleccionar({ tipo: 'aparato', tag: apN })
      if (destino) void irA(destino.h, undefined, destino.b)
      return
    }
    // El indice global del despiece esta indexado por codigo de repuesto, no
    // por posicion: para ?hoja=N&ap=B14 la posicion se busca entre los tags
    // de la hoja N ya abierta (validada por usePlano contra ?hoja=).
    const tagEnHoja = hoja.datos.tags.find((t) => t.t === apN)
    if (tagEnHoja) {
      seleccionar({ tipo: 'aparato', tag: apN })
      setFoco({ tipo: 'caja', b: tagEnHoja.b })
    }
  }, [indice, hoja, irA, seleccionar, busquedaRuta, esDespiece])

  const imprimirHoja = useCallback(() => {
    if (!hoja || !indice) return
    const w = window.open('', '_blank')
    if (!w) return
    const filas = esDespiece ? (hoja.datos.filas ?? []) : []
    const tieneTabla = filas.length > 0
    // En el despiece el numero de figura/hoja no dice nada en terreno: la
    // tabla de piezas es lo que hace util el papel impreso (sin ella, un SVG
    // con solo posiciones numeradas es ilegible fuera de la app).
    const titulo = tieneTabla && meta
      ? `${indice.maquina} · Figura ${meta.fig} · ${limpiarTitulo(meta.tituloEs)}`
      : `${indice.maquina} · ${indice.plano} · Hoja ${hoja.blatt} / ${indice.hojasTotales}`
    const fila = (f: FilaDespiece) => {
      const sap = f.nr ? indice.sapPorCodigo?.[f.nr] : undefined
      return `<tr><td>${escHtml(f.pos)}</td><td>${escHtml(f.es || f.de || '—')}</td>`
        + `<td>${escHtml(f.nr ?? '—')}</td>`
        + `<td>${sap ? escHtml(`SAP ${sap.s}${sap.u ? ' · ' + sap.u : ''}`) : '—'}</td></tr>`
    }
    // 2 columnas de tabla (dos <table> lado a lado, no CSS multicol sobre
    // <table>: eso fragmenta distinto entre navegadores) para que la lista
    // completa de posiciones quepa en A4 sin achicar el texto al mínimo.
    const mitad = Math.ceil(filas.length / 2)
    const tablaCols = (rows: FilaDespiece[]) =>
      `<table><thead><tr><th>Pos</th><th>Nombre</th><th>Código</th><th>SAP / bodega</th></tr></thead>`
      + `<tbody>${rows.map(fila).join('')}</tbody></table>`
    const tablaHtml = tieneTabla
      ? `<div class="tabla2col">${tablaCols(filas.slice(0, mitad))}${tablaCols(filas.slice(mitad))}</div>`
      : ''
    w.document.write(
      '<meta charset="utf-8">'
      + `<title>${escHtml(titulo)}</title>`
      + `<style>@page{size:${tieneTabla ? 'A4 portrait' : 'A3 landscape'};margin:8mm} body{margin:0;font:12px system-ui}`
      + 'svg{width:100%;height:auto} header{font:600 12px system-ui;padding:4px 0}'
      + 'table{width:100%;border-collapse:collapse;font-size:9.5px}'
      + 'th,td{border:1px solid #999;padding:2px 4px;text-align:left}'
      + 'tr{break-inside:avoid}'
      + '.tabla2col{display:flex;gap:10px;margin-top:8px}'
      + '.tabla2col table{flex:1;width:50%}</style>'
      + `<header>${titulo}</header>`
      + hoja.datos.svg
      + tablaHtml,
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }, [hoja, indice, esDespiece, meta])

  // En el despiece las claves del índice son CÓDIGOS de repuesto, no
  // posiciones: al abrir uno hay que seleccionar la FILA que lo lleva (su
  // ficha con nombre, cantidad y SAP), y eso solo se puede una vez cargada la
  // hoja destino — por eso queda pendiente hasta que llegue.
  const piezaPendiente = useRef<string | null>(null)
  useEffect(() => {
    const cod = piezaPendiente.current
    if (!cod || !hoja || !esDespiece) return
    const fila = hoja.datos.filas?.find((f) => f.nr && normalizarPos(f.nr) === normalizarPos(cod))
    if (!fila) return
    piezaPendiente.current = null
    seleccionar({ tipo: 'aparato', tag: normalizarPos(fila.pos) })
  }, [hoja, esDespiece, seleccionar])

  const abrirAparato = useCallback((tag: string) => {
    const puntos = indice?.indice[tag]
    if (!puntos?.length) return
    const enEsta = puntos.find((pt) => pt.h === hoja?.blatt)
    const destino = enEsta ?? puntos[0]!
    if (esDespiece) piezaPendiente.current = tag
    else seleccionar({ tipo: 'aparato', tag })
    setBusca('')
    void irA(destino.h, undefined, destino.b)
  }, [indice, hoja, seleccionar, irA, esDespiece])

  // Elegir una fila de la tabla del despiece (degradación cuando la posición
  // no tiene ancla OCR): si igual está dibujada en el lienzo se resalta su
  // caja, si no, solo se abre la ficha.
  const seleccionarFilaDespiece = useCallback((f: FilaDespiece) => {
    const posN = normalizarPos(f.pos)
    const tagDibujado = hoja?.datos.tags.find((t) => t.t === posN)
    seleccionar({ tipo: 'aparato', tag: posN })
    setFoco(tagDibujado ? { tipo: 'caja', b: tagDibujado.b } : null)
  }, [hoja, seleccionar])

  // Salta a otra figura del despiece (referencia "ver Fig. 70-9" de una fila).
  const irAFigura = useCallback((fig: string) => {
    const destino = indice?.hojas.find((h) => h.fig === fig)
    if (!destino) return
    seleccionar(null)
    void irA(destino.blatt)
  }, [indice, seleccionar, irA])

  const volver = useCallback(() => {
    setHistorial((h) => {
      const previa = h[h.length - 1]
      if (previa != null) {
        setFoco(null)
        void abrir(previa)
      }
      return h.slice(0, -1)
    })
  }, [abrir])

  // La hoja abierta queda en la URL (compartible) y en localStorage (reabrir
  // donde quedaste). replaceState para no ensuciar el historial del navegador.
  useEffect(() => {
    if (!hoja) return
    localStorage.setItem(`plano-hoja:${slug}`, String(hoja.blatt))
    const u = new URL(window.location.href)
    // Si la URL ya es de OTRO plano (click en "Ver en el despiece" recién
    // navegó), estampar acá pisaba el ?hoja= del destino con la hoja de ESTE
    // visor — la carrera devolvía al usuario a donde estaba. Solo se escribe
    // la URL propia.
    if (!u.pathname.endsWith(`/planos/${slug}`)) return
    u.searchParams.set('hoja', String(hoja.blatt))
    if (sel?.tipo === 'aparato') u.searchParams.set('ap', sel.tag)
    else u.searchParams.delete('ap')
    window.history.replaceState(null, '', u)
  }, [hoja, slug, sel])

  // En el despiece el mismo codigo de posicion (B1, S00...) se repite en
  // figuras distintas: anclar la nota a "fig·pos" evita que una nota de la
  // figura 70-8 aparezca colgada en una figura sin relacion.
  const anclaDeAparato = useCallback(
    (tag: string) => (esDespiece && meta?.fig ? `${meta.fig}·${tag}` : tag),
    [esDespiece, meta],
  )
  const notasDe = useCallback((tag: string) => notas.notasDe('aparato', anclaDeAparato(tag)).length, [notas, anclaDeAparato])

  // Telemetria minima para la META GRANDE: cuantas consultas recibe cada plano
  // y cada aparato. Fire-and-forget, una vez por sesion, solo con sesion.
  useEffect(() => {
    if (!indice) return
    void registrarUso(slug, 'apertura')
  }, [indice, slug])
  useEffect(() => {
    if (sel?.tipo === 'aparato') void registrarUso(slug, 'aparato', sel.tag)
  }, [sel, slug])

  // En que hojas hay conocimiento acumulado: una nota de F24 "vive" en cada
  // hoja donde F24 aparece. Alimenta el badge ambar del indice lateral.
  const notasPorHoja = useMemo(() => {
    const m = new Map<number, number>()
    if (!indice) return m
    notas.notas.forEach((n) => {
      if (n.ancla !== 'aparato') return
      // En el despiece el ancla es "fig·pos" (ej. "70-8·B1") y las claves de
      // indice.indice son códigos de fabricante: NUNCA calzan. La hoja se
      // deriva directo de la figura antes del "·".
      const hojasDel = esDespiece
        ? (() => {
            const fig = n.anclaId.split('·')[0]
            const b = indice.hojas.find((h) => h.fig === fig)?.blatt
            return b != null ? new Set([b]) : new Set<number>()
          })()
        : new Set((indice.indice[n.anclaId] ?? []).map((pt) => pt.h))
      hojasDel.forEach((h) => m.set(h, (m.get(h) ?? 0) + 1))
    })
    return m
  }, [notas.notas, indice, esDespiece])

  // Teclado: ← → pasan hoja, "/" enfoca el buscador, Backspace deshace el salto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!indice || !hoja) return
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === '/') { e.preventDefault(); buscaRef.current?.focus(); return }
      if (e.key === 'Backspace') { e.preventDefault(); volver(); return }
      const i = indice.hojas.findIndex((h) => h.blatt === hoja.blatt)
      const anterior = indice.hojas[i - 1]
      const siguiente = indice.hojas[i + 1]
      if (e.key === 'ArrowLeft' && anterior) void irA(anterior.blatt)
      if (e.key === 'ArrowRight' && siguiente) void irA(siguiente.blatt)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [indice, hoja, irA, volver])

  if (error) {
    return <Aviso texto={error} onReintentar={reintentar} />
  }
  if (!indice || !hoja || !meta) {
    return <Aviso texto="Cargando el plano…" />
  }

  const i = indice.hojas.findIndex((h) => h.blatt === hoja.blatt)
  const anterior = indice.hojas[i - 1]
  const siguiente = indice.hojas[i + 1]
  const { items: resultados, total: totalResultados } = buscar(busca, indice, hoja.blatt, esDespiece)
  const vNota = busca.trim().toLowerCase()
  if (vNota) {
    notas.notas.forEach((n) => {
      if (n.ancla !== 'aparato') return
      if (!n.texto.toLowerCase().includes(vNota) && !n.anclaId.toLowerCase().includes(vNota)) return
      // En el despiece indice.indice esta por codigo de fabricante, no por
      // "fig·pos": la hoja de la nota se deriva de la figura del ancla.
      if (esDespiece) {
        const [fig, pos] = n.anclaId.split('·')
        const destino = indice.hojas.find((h) => h.fig === fig)
        if (destino && resultados.length < 60) {
          resultados.push({ clave: pos ?? n.anclaId, detalle: `nota en fig. ${fig}: ${n.texto.slice(0, 26)}…`,
                            blatt: destino.blatt, aparato: pos ?? n.anclaId })
        }
        return
      }
      const primera = indice.indice[n.anclaId]?.[0]
      if (primera && resultados.length < 60) {
        resultados.push({ clave: n.anclaId, detalle: `nota: ${n.texto.slice(0, 26)}…`,
                          blatt: primera.h, caja: primera.b, aparato: n.anclaId })
      }
    })
  }
  // En movil el panel es una hoja inferior: cerrada = plano completo.
  const abiertoMovil = sel !== null || !!busca.trim() || ayuda

  return (
    // Altura del viewport, NO h-full: esta ruta se monta directo bajo #root, sin
    // layout que acote la altura, así que con h-full el cuerpo crecía hasta los
    // 2.250 px del índice de 44 hojas y el dibujo quedaba centrado fuera de la
    // pantalla. dvh además descuenta la barra del navegador en el teléfono.
    <div ref={raizRef} className="flex flex-col" style={{ height: altoPagina, background: 'var(--lc-bg)', color: 'var(--lc-ink)' }}>
      {/* riel superior */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b px-3 py-2"
              style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
        <Link to="/aprendizaje/planos" className="flex flex-col leading-tight no-underline" style={{ color: 'inherit' }}>
          <span className="text-footnote font-semibold">{cat?.maquina ?? indice.maquina}</span>
          <span className="font-mono text-caption" style={{ color: 'var(--lc-ink-mid)' }}>
            {indice.plano} · {indice.rev}
          </span>
        </Link>

        <div className="order-last basis-full md:order-none md:basis-auto relative min-w-[180px] flex-1 md:max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--lc-ink-ghost)' }} />
          <input ref={buscaRef} value={busca}
                 onChange={(e) => { setBusca(e.target.value); if (e.target.value.trim()) cargarBusqueda() }} type="search"
                 placeholder={esVisor ? 'Buscar hoja por título: sellado, vacío, freno…'
                              : esDespiece ? 'Buscar pieza: cuchilla, resorte, código…'
                              : 'Buscar K7, Q1, B12, Messer, cuchillo…'}
                 className="w-full rounded-card border bg-transparent py-1.5 pl-8 pr-2 font-mono text-footnote outline-none"
                 style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }} />
        </div>

        {/* Destacados: acceso rapido de uso diario (piezas de desgaste). En
            escritorio va arriba del indice lateral; en movil no hay indice,
            asi que se muestra acá, en el riel de busqueda. */}
        {esDespiece && !!indice.destacados?.length && (
          <div className="order-last flex basis-full gap-2 overflow-x-auto md:hidden">
            {indice.destacados.map((d, i) => (
              <button key={i} type="button" onClick={() => void irA(d.hoja)}
                      className="flex shrink-0 flex-col items-start rounded-card border px-2.5 py-1.5 text-left"
                      style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)' }}>
                <span className="text-footnote font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>{d.etiqueta}</span>
                <span className="text-caption" style={{ color: 'var(--lc-ink-mid)' }}>{d.detalle}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`${sinIdiomas ? 'hidden' : 'flex'} overflow-hidden rounded-card border`} style={{ borderColor: 'var(--lc-border)' }}>
          {([['DE', false], ['ES', true]] as const).map(([txt, v]) => (
            <button key={txt} type="button"
                    onClick={() => { setMostrarEs(v); localStorage.setItem('plano-idioma', v ? 'es' : 'de') }}
                    aria-pressed={mostrarEs === v}
                    className="px-3 py-1.5 text-footnote font-semibold"
                    style={mostrarEs === v
                      ? { background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }
                      : { color: 'var(--lc-ink-mid)' }}>
              {txt}
            </button>
          ))}
        </div>

        <button type="button" title="Imprimir esta hoja" onClick={imprimirHoja}
                className="rounded-ctl p-1.5" style={{ color: 'var(--lc-ink-mid)' }}>
          <Printer size={15} />
        </button>
        <BotonOffline slug={slug} indice={indice} />
        <button type="button" title="Copiar link de esta vista"
                onClick={() => {
                  // En el despiece se comparte por FIGURA: el link queda
                  // legible ("...?fig=70-8") y sobrevive a que el extractor
                  // renumere las hojas al sumar material al catálogo.
                  const u = new URL(window.location.href)
                  if (esDespiece && meta?.fig) {
                    u.searchParams.delete('hoja')
                    u.searchParams.set('fig', meta.fig)
                  }
                  void navigator.clipboard?.writeText(u.toString())
                }}
                className="rounded-ctl p-1.5" style={{ color: 'var(--lc-ink-mid)' }}>
          <LinkIcon size={15} />
        </button>
        <button type="button" title="QR de este punto del plano" onClick={() => setMostrarQR(true)}
                className="rounded-ctl p-1.5" style={{ color: 'var(--lc-ink-mid)' }}>
          <QrCode size={15} />
        </button>
        <div className="flex items-center gap-1 font-mono text-footnote">
          <button type="button" disabled={!anterior} onClick={() => anterior && void irA(anterior.blatt)}
                  className="rounded-ctl p-1 disabled:opacity-30" title="Hoja anterior">
            <ChevronLeft size={16} />
          </button>
          {/* Select nativo: en el teléfono el índice lateral no existe y sin
              esto la única forma de moverse era de a una hoja con las flechas. */}
          <select value={hoja.blatt} onChange={(e) => void irA(Number(e.target.value))}
                  aria-label="Ir a hoja"
                  className="cursor-pointer appearance-none rounded-ctl border-0 bg-transparent py-1 pr-0.5 font-mono text-footnote tabular-nums outline-none"
                  style={{ color: 'var(--lc-ink)' }}>
            {secciones.map((sec) => (
              <optgroup key={sec} label={etiquetaSeccion(sec)}>
                {indice.hojas.filter((h) => h.seccion === sec).map((h) => (
                  <option key={h.blatt} value={h.blatt}>{h.blatt}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="tabular-nums" style={{ color: 'var(--lc-ink-mid)' }}>/ {indice.hojasTotales}</span>
          <button type="button" disabled={!siguiente}
                  onClick={() => siguiente && void irA(siguiente.blatt)}
                  className="rounded-ctl p-1 disabled:opacity-30" title="Hoja siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {mostrarQR && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
             onClick={() => setMostrarQR(false)}>
          <div className="flex flex-col items-center gap-3 rounded-panel p-5"
               style={{ background: 'var(--lc-surface)' }} onClick={(e) => e.stopPropagation()}>
            <div className="rounded-card bg-white p-3">
              <QRCodeSVG value={window.location.href} size={208} />
            </div>
            <p className="m-0 max-w-[240px] text-center text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
              Este QR abre exactamente esta vista: hoja {hoja.blatt}
              {sel?.tipo === 'aparato' ? ` con la ficha de ${sel.tag}` : ''}. Imprímelo y pégalo en el tablero.
            </p>
            <button type="button" onClick={() => setMostrarQR(false)}
                    className="rounded-ctl border px-3 py-1.5 text-footnote"
                    style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* índice de hojas */}
        <nav ref={navRef} className="hidden w-56 shrink-0 overflow-y-auto border-r px-2 pb-2 md:block"
             style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
          {esDespiece && !!indice.destacados?.length && (
            <div className="flex flex-col gap-1.5 pb-2 pt-2">
              {indice.destacados.map((d, i) => (
                <button key={i} type="button" onClick={() => void irA(d.hoja)}
                        className="flex flex-col items-start gap-0.5 rounded-ctl border px-2 py-1.5 text-left"
                        style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)' }}>
                  <span className="text-caption font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>{d.etiqueta}</span>
                  <span className="text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>{d.detalle}</span>
                </button>
              ))}
            </div>
          )}
          {secciones.map((sec) => {
            const grupo = indice.hojas.filter((h) => h.seccion === sec)
            if (!grupo.length) return null
            return (
              <section key={sec}>
                <h2 className="sticky top-0 z-10 m-0 flex items-baseline justify-between border-b px-2 pb-1.5 pt-3 text-caption font-semibold tracking-wider"
                    style={{ background: 'var(--lc-surface)', color: 'var(--lc-ink-ghost)', borderColor: 'var(--lc-border)' }}>
                  {etiquetaSeccion(sec)}
                  <span className="font-mono normal-case tracking-normal">{grupo.length}</span>
                </h2>
                <div className="pt-1.5">
                  {grupo.map((h) => {
                    const activa = h.blatt === hoja.blatt
                    return (
                      <button key={h.blatt} type="button" onClick={() => void irA(h.blatt)}
                              aria-current={activa}
                              className="mb-0.5 flex w-full items-center gap-2 rounded-ctl py-1.5 pl-1.5 pr-2 text-left"
                              style={activa
                                ? { background: 'var(--lc-aqua-soft)', boxShadow: 'inset 2px 0 0 var(--lc-aqua)' }
                                : {}}>
                        <span className="w-7 shrink-0 rounded-ctl py-0.5 text-center font-mono text-caption tabular-nums"
                              style={activa
                                ? { background: 'var(--lc-aqua)', color: '#fff' }
                                : { background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                          {h.blatt}
                        </span>
                        <span className="line-clamp-2 min-w-0 flex-1 text-caption leading-snug"
                              style={{ color: activa ? 'var(--lc-ink)' : 'var(--lc-ink-mid)' }}>
                          {limpiarTitulo(mostrarEs ? h.tituloEs : h.titulo)}
                        </span>
                        {(notasPorHoja.get(h.blatt) ?? 0) > 0 && (
                          <span title={`${notasPorHoja.get(h.blatt)} nota(s) de aparatos de esta hoja`}
                                className="shrink-0 rounded-full px-1.5 font-mono text-[9.5px]"
                                style={{ background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }}>
                            {notasPorHoja.get(h.blatt)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </nav>

        <main className="relative min-w-0 flex-1">
          <button type="button" aria-label="Cómo se usa"
                  onClick={() => setAyuda(true)}
                  className="absolute bottom-24 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg md:hidden"
                  style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
            ?
          </button>
          {historial.length > 0 && (
            <button type="button" onClick={volver}
                    className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-card border px-2.5 py-1.5 font-mono text-footnote shadow-lg"
                    style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}
                    title="Deshacer el salto (Backspace)">
              <ChevronLeft size={13} /> Hoja {historial[historial.length - 1]}
            </button>
          )}
          {cargando && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
              <span className="rounded-full border px-3 py-1 text-caption shadow"
                    style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
                Cargando hoja…
              </span>
            </div>
          )}
          <PlanoLienzo
            hoja={hoja.datos} meta={meta} mostrarEs={mostrarEs} notasDe={notasDe} foco={foco}
            resaltarTag={resaltar && sel?.tipo === 'aparato' ? sel.tag : null}
            onSalto={(h, c) => { seleccionar({ tipo: 'salto', t: `/${h}.${c}`, h, c }); void irA(h, c) }}
            onBorne={(b) => { seleccionar({ tipo: 'borne', t: b.t, h: b.h }); void irA(b.h, undefined, b.tb) }}
            onBorneLibre={(l) => { seleccionar({ tipo: 'borneLibre', l }); setFoco(null) }}
            onAparato={(tag) => { seleccionar({ tipo: 'aparato', tag }); setFoco(null) }}
            onRotulo={(r) => { seleccionar({ tipo: 'rotulo', r }); setFoco(null) }}
            onFondo={() => setSel(null)}
          />
        </main>

        <aside
          ref={asideRef}
          className={`${abiertoMovil ? 'fixed' : 'hidden'} inset-x-2 bottom-3 z-50 max-h-[55dvh] overflow-y-auto rounded-panel border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl md:static md:z-auto md:block md:max-h-none md:w-72 md:shrink-0 md:rounded-none md:border-0 md:border-l md:pb-3 md:shadow-none`}
          style={{
            background: 'var(--lc-surface)', borderColor: 'var(--lc-border)',
            ...(esMovil && minimizada ? { height: 52, overflowY: 'hidden' as const } : {}),
            ...(esMovil && !minimizada && altoHoja ? { height: altoHoja, maxHeight: '82dvh' } : {}),
          }}>
          {/* agarradera (arrastra para ajustar la altura) + minimizar + cerrar */}
          <div
            className="relative mb-2 -mt-1 cursor-ns-resize touch-none pt-1 md:hidden"
            onPointerDown={(e) => {
              ajuste.current = { y: e.clientY, alto: asideRef.current?.getBoundingClientRect().height ?? 300 }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const a = ajuste.current
              if (!a) return
              const alto = Math.min(a.alto + (a.y - e.clientY), window.innerHeight * 0.82)
              if (alto < 110) { setMinimizada(true); setAltoHoja(null) }
              else { setMinimizada(false); setAltoHoja(Math.max(alto, 140)) }
            }}
            onPointerUp={() => { ajuste.current = null }}
          >
            <div className="mx-auto h-1 w-12 rounded-full" style={{ background: 'var(--lc-border)' }} />
            <button type="button" aria-label={minimizada ? 'Expandir panel' : 'Minimizar panel'}
                    onClick={() => { setMinimizada((m) => !m) }}
                    className="absolute -top-1 right-8 rounded-ctl p-1.5"
                    style={{ color: 'var(--lc-ink-mid)' }}>
              {minimizada ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" aria-label="Cerrar panel"
                    onClick={() => { setSel(null); setBusca(''); setAyuda(false); setMinimizada(false); setAltoHoja(null) }}
                    className="absolute -top-1 right-0 rounded-ctl p-1.5"
                    style={{ color: 'var(--lc-ink-mid)' }}>
              <X size={16} />
            </button>
          </div>
          {esMovil && minimizada && (
            <button type="button" onClick={() => setMinimizada(false)}
                    className="flex w-full items-center gap-2 px-1 text-left text-footnote font-semibold"
                    style={{ color: 'var(--lc-ink)' }}>
              {sel ? etiquetaSel(sel) : busca.trim() ? `Resultados de “${busca.trim()}”` : 'Panel'}
            </button>
          )}
          {!(esMovil && minimizada) && <>
          {!busca.trim() && pilaSel.length > 0 && (
            <button type="button" onClick={volverSel}
                    className="mb-2 flex w-full items-center gap-1.5 rounded-ctl border px-2 py-1.5 text-left text-footnote"
                    style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
              <ChevronLeft size={13} /> Volver a {etiquetaSel(pilaSel[pilaSel.length - 1]!.s)}
            </button>
          )}
          {esVisor && busca.trim()
            ? <Resultados items={resultados} total={totalResultados}
                onIr={(b, c, caja, aparato) => {
                  if (aparato) seleccionar({ tipo: 'aparato', tag: aparato })
                  setBusca('')
                  void irA(b, c, caja)
                }} />
            : esVisor
            ? <>
                <Titulo>Notas de la hoja {hoja.blatt}</Titulo>
                <p className="m-0 mb-2 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
                  Este plano viene sin texto seleccionable (modo visor): navega con el
                  índice y deja acá lo que conviene saber de esta hoja — fotos incluidas.
                </p>
                {notas.error && (
                  <p className="m-0 mb-2 text-footnote" style={{ color: 'var(--lc-danger)' }}>{notas.error}</p>
                )}
                <NotasAparato
                  anclaId={`hoja ${hoja.blatt}`}
                  notas={notas.notasDe('hoja', String(hoja.blatt))}
                  onCrear={(n) => notas.crear({ ancla: 'hoja', anclaId: String(hoja.blatt), ...n })}
                  onBorrar={notas.borrar}
                  onEditar={notas.editar}
                />
              </>
            : busca.trim()
            ? <Resultados items={resultados} total={totalResultados}
                onIr={(b, c, caja, aparato) => {
                  if (aparato) seleccionar({ tipo: 'aparato', tag: aparato })
                  // Elegir un resultado cierra la busqueda: si no, el panel se
                  // quedaba en la lista y la ficha del aparato no se veia.
                  setBusca('')
                  void irA(b, c, caja)
                }} />
            : <Panel sel={sel} indice={indice} hojaActual={hoja.blatt} notas={notas} onIr={irA}
                     recientes={recientes} onAbrirAparato={abrirAparato}
                     resaltar={resaltar} onResaltar={() => setResaltar((v) => !v)}
                     enEstaHoja={sel?.tipo === 'aparato' ? hoja.datos.tags.filter((t) => t.t === sel.tag).length : 0}
                     esDespiece={esDespiece} meta={meta} filas={hoja.datos.filas ?? []}
                     tagsHoja={hoja.datos.tags} onSeleccionarFila={seleccionarFilaDespiece}
                     onIrFigura={irAFigura} anclaDeAparato={anclaDeAparato}
                     partes={partes} slug={slug} sapPorCodigo={indice.sapPorCodigo}
                     vinculosTerreno={vinculosTerreno} />}
          </>}
        </aside>
      </div>
    </div>
  )
}

/* ────────────────────────────── panel ────────────────────────────── */

function Panel({
  sel, indice, hojaActual, notas, onIr, recientes, onAbrirAparato, resaltar, onResaltar, enEstaHoja,
  esDespiece, meta, filas, tagsHoja, onSeleccionarFila, onIrFigura, anclaDeAparato, partes, slug,
  sapPorCodigo, vinculosTerreno,
}: {
  sel: Seleccion
  indice: NonNullable<ReturnType<typeof usePlano>['indice']>
  hojaActual: number
  notas: ReturnType<typeof usePlanoNotas>
  onIr: (b: number, c?: number, caja?: Caja) => void
  recientes: string[]
  onAbrirAparato: (tag: string) => void
  resaltar: boolean
  onResaltar: () => void
  enEstaHoja: number
  esDespiece: boolean
  meta: PlanoHojaMeta | null
  /** Tabla completa de la figura actual (solo despiece). */
  filas: FilaDespiece[]
  /** Posiciones con ancla OCR de la hoja actual (solo despiece). */
  tagsHoja: PlanoAparato[]
  onSeleccionarFila: (f: FilaDespiece) => void
  onIrFigura: (fig: string) => void
  anclaDeAparato: (tag: string) => string
  partes: ReturnType<typeof usePartesPlano>
  slug: string
  /** código → SAP/bodega, para la lista copiable de la figura. */
  sapPorCodigo?: Record<string, { s: string; n: string; u: string }>
  /** códigos que el catálogo marca como piezas de desgaste */
  desgaste?: string[]
  vinculosTerreno: ReturnType<typeof usePlanoVinculos>
}) {
  const [copiadoLista, setCopiadoLista] = useState(false)
  // En el despiece, llegar a una figura y NO ver sus piezas obliga a adivinar
  // qué número tocar (y la mitad de las figuras tiene posiciones sin ancla).
  // Sin selección, el panel ES la lista de piezas de esta figura.
  if (!sel && esDespiece && filas.length > 0) {
    return (
      <>
        <Titulo>Piezas de esta figura</Titulo>
        {meta && (
          <p className="m-0 mb-2 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
            Figura {meta.fig} · {meta.tituloEs} — {filas.length} piezas. Toca una para ver su
            código, cuántas lleva y dónde está en bodega.
            {/* Pedir a bodega es copiar la lista a mano desde el teléfono:
                un toque la deja lista para pegar en el chat del turno. */}
            <button type="button"
                    onClick={() => {
                      const lineas = filas.map((f) => {
                        const sap = f.nr ? sapPorCodigo?.[f.nr] : undefined
                        return [
                          `${f.pos}. ${f.es || f.de || ''}`.trim(),
                          f.nr ?? '',
                          f.q != null ? `x${f.q}` : '',
                          sap ? `SAP ${sap.s}${sap.u ? ` (${sap.u})` : ''}` : '',
                        ].filter(Boolean).join(' · ')
                      })
                      const texto = [
                        `BAADER 142 · Figura ${meta.fig} · ${meta.tituloEs}`,
                        ...lineas,
                      ].join('\n')
                      void navigator.clipboard?.writeText(texto)
                      setCopiadoLista(true)
                      setTimeout(() => setCopiadoLista(false), 2000)
                    }}
                    className="ml-1 underline underline-offset-2"
                    style={{ color: 'var(--lc-aqua-bright)' }}>
              {copiadoLista ? '¡Lista copiada!' : 'Copiar la lista'}
            </button>
          </p>
        )}
        <div className="rounded-ctl border" style={{ borderColor: 'var(--lc-border)' }}>
          {filas.map((f) => (
            <button key={`${f.pos}-${f.nr ?? ''}`} type="button" onClick={() => onSeleccionarFila(f)}
                    className="flex w-full items-baseline justify-between gap-2 border-b px-2 py-2 text-left last:border-b-0"
                    style={{ borderColor: 'var(--lc-border)', minHeight: 44 }}>
              <span className="w-9 shrink-0 font-mono text-caption tabular-nums"
                    style={{ color: 'var(--lc-aqua-bright)' }}>{f.pos}</span>
              <span className="min-w-0 flex-1 text-footnote leading-snug"
                    style={{ color: 'var(--lc-ink)' }}>{f.es || f.de}</span>
              {f.nr && (
                <span className="shrink-0 font-mono text-caption tabular-nums"
                      style={{ color: 'var(--lc-ink-mid)' }}>{f.nr}</span>
              )}
            </button>
          ))}
        </div>
      </>
    )
  }

  if (!sel) {
    return (
      <>
        <Titulo>Cómo se usa</Titulo>
        <p className="m-0 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
          Toca cualquier marca de color sobre el plano.
          <br /><br />
          <b style={{ color: 'var(--lc-nuevo)' }}>Verde</b> — salto a otra hoja: te lleva y marca dónde caíste.
          Con <b>línea punteada</b> es un borne: te lleva a su columna de cableado.
          <br />
          <b style={{ color: 'var(--lc-aqua-bright)' }}>Azul</b> — aparato: te lista todas las hojas donde
          aparece, y ahí puedes dejarle una nota o una foto.
          <br />
          <b style={{ color: 'var(--lc-prep)' }}>Ámbar</b> — rótulo en otro idioma con su traducción.
        </p>
        {/* Cuánto del plano ya está conectado al catálogo de piezas. Es el
            número que demuestra el avance del puente y sube solo: con cada
            vínculo confirmado en terreno pasa de «zona» a «pieza exacta». */}
        {partes?.cobertura && (
          <>
            <Titulo>Puente al catálogo de piezas</Titulo>
            <p className="m-0 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
              <b style={{ color: 'var(--lc-ink)' }}>
                {partes.cobertura.exacta + partes.cobertura.zona} de {partes.cobertura.total}
              </b>{' '}
              aparatos de este plano ya llevan al despiece:{' '}
              <b>{partes.cobertura.exacta}</b> con la pieza exacta
              {partes.cobertura.conSap > 0 && ` (${partes.cobertura.conSap} con su código SAP)`} y{' '}
              <b>{partes.cobertura.zona}</b> con el gabinete donde están montados.
              {partes.cobertura.sinDato > 0 && (
                <> Quedan <b>{partes.cobertura.sinDato}</b> por identificar.</>
              )}
            </p>
            {/* El número que demuestra el avance REAL, no el propuesto por
                catálogo: solo sube cuando alguien lo verifica en la máquina. */}
            {vinculosTerreno.resumen.confirmados + vinculosTerreno.resumen.corregidos > 0 && (
              <p className="m-0 mt-1 text-footnote" style={{ color: 'var(--lc-nuevo)' }}>
                <b>{vinculosTerreno.resumen.confirmados + vinculosTerreno.resumen.corregidos}</b>{' '}
                confirmados en terreno
              </p>
            )}
            {/* La ruta de trabajo, viva: los que tienen pieza propuesta y
                todavía nadie verificó. Tocar uno lleva directo a su ficha
                para confirmarlo ahí mismo — el checklist de papel deja de
                ser necesario. */}
            <PendientesTerreno partes={partes} vinculos={vinculosTerreno.vinculos}
                               onAbrir={onAbrirAparato} />
          </>
        )}
        {recientes.length > 0 && (
          <>
            <h2 className="m-0 mb-2 mt-4 text-caption font-semibold tracking-wider"
                style={{ color: 'var(--lc-ink-ghost)' }}>
              Recientes
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {/* Solo los que el índice sabe abrir: en el despiece quedaron
                  guardadas posiciones sueltas ("24") de antes de guardar el
                  código, y un chip que no lleva a ninguna parte es peor que
                  no estar. Se filtran al mostrar; el uso los reemplaza solo. */}
              {recientes.filter((t) => indice.indice[t]).map((t) => (
                <button key={t} type="button" onClick={() => onAbrirAparato(t)}
                        className="rounded-ctl border px-2 py-1 font-mono text-footnote"
                        style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-aqua-bright)' }}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </>
    )
  }

  if (sel.tipo === 'salto') {
    return (
      <>
        <Titulo>Salto de hoja</Titulo>
        <p className="m-0 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
          El circuito continúa en la <b>hoja {sel.h}</b>, columna <b>{sel.c}</b>.
        </p>
      </>
    )
  }

  if (sel.tipo === 'borne') {
    return (
      <>
        <Titulo>Borne</Titulo>
        <p className="m-0 font-mono text-[17px] font-semibold" style={{ color: 'var(--lc-nuevo)' }}>
          {sel.t}
        </p>
        <p className="m-0 mt-1 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
          Su columna de cableado está en la <b>hoja {sel.h}</b> del plano de bornes:
          ahí dice qué cable llega, su color y hacia dónde sigue.
        </p>
      </>
    )
  }

  if (sel.tipo === 'borneLibre') {
    return (
      <>
        <Titulo>Borne {sel.l.t}</Titulo>
        <p className="m-0 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
          El plano no dice de qué regla es este {sel.l.t} — existe en{' '}
          {sel.l.op.length} reglas. Las nombradas en esta misma hoja van primero:
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {sel.l.op.map((o) => (
            <button key={o.k} type="button" onClick={() => onIr(o.h, undefined, o.tb)}
                    className="flex items-baseline justify-between rounded-ctl border px-2.5 py-1.5 text-left"
                    style={{ borderColor: 'var(--lc-border)' }}>
              <b className="font-mono text-footnote" style={{ color: 'var(--lc-nuevo)' }}>{o.k}</b>
              <span className="text-caption" style={{ color: 'var(--lc-ink-mid)' }}>hoja {o.h}</span>
            </button>
          ))}
        </div>
      </>
    )
  }

  if (sel.tipo === 'rotulo') {
    return (
      <>
        <Titulo>Rótulo traducido</Titulo>
        <p className="m-0 text-[14px] font-semibold" style={{ color: 'var(--lc-prep)' }}>{sel.r.de}</p>
        <p className="m-0 text-[18px] font-semibold">{sel.r.es}</p>
      </>
    )
  }

  // Despiece: la posición tocada (o elegida desde la tabla) es una pieza del
  // catálogo, no un aparato del esquema eléctrico — ficha completamente
  // distinta (opción "Pila" del mockup). Si la posición no está en la tabla
  // de esta figura (no debería pasar: los tags salen de esas mismas filas),
  // se sigue de largo a la ficha genérica de más abajo.
  if (esDespiece && meta) {
    const filaSel = filas.find((f) => normalizarPos(f.pos) === normalizarPos(sel.tag))
    if (filaSel) {
      return (
        <FichaPieza
          fila={filaSel} filas={filas} meta={meta} tagsHoja={tagsHoja} selTag={sel.tag}
          notas={notas} onSeleccionarFila={onSeleccionarFila} onIrFigura={onIrFigura}
          anclaId={anclaDeAparato(sel.tag)} slug={slug} sapPorCodigo={indice.sapPorCodigo}
          usosPorCodigo={indice.usosPorCodigo} umbralComun={indice.umbralComun}
                      desgaste={indice.desgaste}
        />
      )
    }
  }

  const puntos = indice.indice[sel.tag] ?? []
  const esSenal = /^(0\/)?\d{1,3}V\d{0,2}$/.test(sel.tag)
  const esRegla = /^X\d{1,2}$/.test(sel.tag)
  return (
    <>
      <Titulo>{esSenal ? 'Señal' : esRegla ? 'Regla de bornes' : 'Aparato'}</Titulo>
      <p className="m-0 font-mono text-[17px] font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>
        {sel.tag}
      </p>
      {!esSenal && indice.descs?.[sel.tag] && (
        <p className="m-0 mt-1.5 rounded-ctl border-l-2 py-1 pl-2 text-footnote leading-relaxed"
           style={{ color: 'var(--lc-ink-mid)', borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)' }}>
          {indice.descs[sel.tag]}
        </p>
      )}
      <p className="m-0 mt-1 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
        {esSenal
          ? `Este potencial recorre ${new Set(puntos.map((p) => p.h)).size} hojas del plano. Síguelo:`
          : `Aparece en ${puntos.length} punto${puntos.length !== 1 ? 's' : ''} del plano.`}
      </p>
      {enEstaHoja > 1 && (
        <button type="button" onClick={onResaltar} aria-pressed={resaltar}
                className="mt-2 w-full rounded-ctl border px-2 py-1.5 text-footnote font-medium"
                style={resaltar
                  ? { background: 'var(--lc-aqua)', borderColor: 'var(--lc-aqua)', color: '#fff' }
                  : { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
          {resaltar ? 'Quitar resaltado' : `Resaltar sus ${enEstaHoja} puntos en esta hoja`}
        </button>
      )}
      <div className="mb-4 mt-2 flex flex-wrap gap-1.5">
        {puntos.map((p) => (
          <button key={`${p.h}.${p.c}`} type="button" onClick={() => onIr(p.h, undefined, p.b)}
                  className="rounded-ctl border px-2 py-1 font-mono text-footnote tabular-nums"
                  style={p.h === hojaActual
                    ? { borderColor: 'var(--lc-aqua)', color: 'var(--lc-aqua-bright)', background: 'var(--lc-aqua-soft)' }
                    : { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
            {p.h}.{p.c}
          </button>
        ))}
      </div>

      <PiezaFisica sel={sel} partes={partes} slug={slug} vinculosTerreno={vinculosTerreno} />

      <FichasSap notas={notas.notasDe('aparato', anclaDeAparato(sel.tag))} />

      <Titulo>Notas y fotos</Titulo>
      {notas.error && (
        <p className="m-0 mb-2 text-footnote" style={{ color: 'var(--lc-danger)' }}>{notas.error}</p>
      )}
      <NotasAparato
        anclaId={sel.tag}
        notas={notas.notasDe('aparato', anclaDeAparato(sel.tag))}
        onCrear={(n) => notas.crear({ ancla: 'aparato', anclaId: anclaDeAparato(sel.tag), ...n })}
        onBorrar={notas.borrar}
        onEditar={notas.editar}
      />
    </>
  )
}

type Resultado = {
  clave: string
  detalle: string
  blatt: number
  col?: number
  caja?: Caja
  aparato?: string
}

/** lowercase + sin acentos: "vacio" encuentra "Vacío" y "kuhlwasser" a "Kühlwasser". */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Detalle de un resultado de figura en el despiece: la figura + su título
 *  dice algo en terreno; "hoja N" es un numero de pagina interno crudo. */
const figuraDetalle = (indice: PlanoIndice, blatt: number): string => {
  const h = indice.hojas.find((hh) => hh.blatt === blatt)
  return h ? `Fig. ${h.fig} · ${limpiarTitulo(h.tituloEs)}` : `hoja ${blatt}`
}

function buscar(
  q: string,
  indice: NonNullable<ReturnType<typeof usePlano>['indice']>,
  _hojaActual: number,
  esDespiece: boolean,
): { items: Resultado[]; total: number } {
  const v = norm(q.trim())
  if (!v) return { items: [], total: 0 }
  const out: Resultado[] = []
  // Vocabulario de planta: el catálogo está en castellano de traducción
  // alemana ("cojinete", "atarjea", "arandela") y el técnico escribe la
  // palabra que usa a diario ("descanso", "canaleta", "golilla"). El mapa
  // viene del índice, ya validado contra el vocabulario real del catálogo.
  const alias = indice.sinonimos?.[v.toLowerCase()]
  const vAlias = alias ? norm(alias) : null

  // Aparatos: por designacion (K7, Q1, X5...) o codigo de fabricante en el
  // despiece. Aterrizan en su caja exacta.
  Object.entries(indice.indice).forEach(([tag, puntos]) => {
    const primero = puntos[0]
    if (primero && norm(tag).startsWith(v)) {
      out.push({
        clave: tag, detalle: `${puntos.length} puntos`, aparato: tag,
        blatt: primero.h, caja: primero.b,
      })
    }
  })

  // Hojas por su titulo ("SELLADO" -> las hojas de la estacion de sellado).
  indice.hojas.forEach((h) => {
    if (sinAcentos(h.tituloEs).includes(v) || sinAcentos(h.titulo).includes(v)) {
      out.push({ clave: `Hoja ${h.blatt}`, detalle: h.tituloEs.slice(0, 34), blatt: h.blatt })
    }
  })

  // Bornes: "X5:97", "X5.97", "X5 97" o el numero pelado "97".
  const claveBorne = v.toUpperCase().replace(/[.\s]+/g, ':')
  if (/^X\d/.test(claveBorne)) {
    Object.entries(indice.bornesIdx).forEach(([k, dst]) => {
      if (k.startsWith(claveBorne)) {
        out.push({ clave: k, detalle: `borne · hoja ${dst.h}`, blatt: dst.h, caja: dst.tb })
      }
    })
  } else if (/^\d{1,3}$/.test(v)) {
    Object.entries(indice.bornesIdx).forEach(([k, dst]) => {
      if (k.endsWith(`:${v}`)) {
        out.push({ clave: k, detalle: `borne · hoja ${dst.h}`, blatt: dst.h, caja: dst.tb })
      }
    })
  }

  // Rotulos / piezas: en el idioma que sea. Cada resultado lleva su hoja y
  // su caja. En el despiece "hoja N" no dice nada — se muestra la figura.
  for (const r of indice.busqueda) {
    const es = norm(r.es)
    const de = norm(r.de)
    const calza = de.includes(v) || es.includes(v)
      || (vAlias != null && (es.includes(vAlias) || de.includes(vAlias)))
    if (calza) {
      const detalle = esDespiece ? figuraDetalle(indice, r.h) : `${r.de} · hoja ${r.h}`
      out.push({ clave: r.es, detalle, blatt: r.h, caja: r.b })
    }
  }

  // El total real (antes de truncar) para poder decir "60 de N" en vez de
  // fingir que 60 es todo lo que había.
  return { items: out.slice(0, 60), total: out.length }
}

function Resultados({ items, total, onIr }: {
  items: Resultado[]
  /** Total de coincidencias antes de truncar a 60; si es mayor a items.length
   *  se avisa en vez de dejar creer que eso es todo lo que había. */
  total?: number
  onIr: (b: number, c?: number, caja?: Caja, aparato?: string) => void
}) {
  const truncado = total != null && total > items.length
  return (
    <>
      <Titulo>{items.length} resultado{items.length !== 1 ? 's' : ''}</Titulo>
      {!items.length && (
        <p className="m-0 text-footnote" style={{ color: 'var(--lc-ink-ghost)' }}>
          Sin coincidencias. Prueba con una designación (K7, Q1) o una palabra
          del plano en alemán o castellano.
        </p>
      )}
      {items.map((r) => (
        <button key={`${r.clave}${r.detalle}`} type="button"
                onClick={() => onIr(r.blatt, r.col, r.caja, r.aparato)}
                className="flex w-full items-baseline justify-between gap-2 rounded-ctl px-2 py-1.5 text-left hover:opacity-80">
          <b className="font-mono text-footnote">{r.clave}</b>
          <span className="text-caption" style={{ color: 'var(--lc-ink-mid)' }}>{r.detalle}</span>
        </button>
      ))}
      {truncado && (
        <p className="m-0 mt-1 text-caption" style={{ color: 'var(--lc-ink-ghost)' }}>
          {items.length} de {total} — afina la búsqueda.
        </p>
      )}
    </>
  )
}


/**
 * Ficha de una pieza del despiece (opción "Pila" del mockup, sin pestañas):
 * el nombre en español manda, el código de repuesto es lo primero copiable,
 * y la tabla completa de la figura queda debajo para saltar a otra posición
 * sin volver al lienzo — la degradación pensada para las que no tienen
 * ancla OCR (se eligen desde la tabla en vez de tocarlas en el dibujo).
 */
function FichaPieza({
  fila, filas, meta, tagsHoja, selTag, notas, onSeleccionarFila, onIrFigura, anclaId, slug,
  sapPorCodigo, usosPorCodigo, umbralComun, desgaste,
}: {
  fila: FilaDespiece
  filas: FilaDespiece[]
  meta: PlanoHojaMeta
  tagsHoja: PlanoAparato[]
  selTag: string
  notas: ReturnType<typeof usePlanoNotas>
  onSeleccionarFila: (f: FilaDespiece) => void
  onIrFigura: (fig: string) => void
  anclaId: string
  slug: string
  /** código de fabricante -> SAP, del índice del despiece (planos viejos no lo traen). */
  sapPorCodigo?: Record<string, { s: string; n: string; u: string }>
  /** código de fabricante -> en cuántas figuras distintas se usa (solo códigos con >1 uso). */
  usosPorCodigo?: Record<string, number>
  /** desde cuántos usos una pieza pasa de "específica" a "ferretería común". */
  umbralComun?: number
  /** códigos que el catálogo lista como piezas de desgaste (consumibles). */
  desgaste?: string[]
}) {
  const [copiado, setCopiado] = useState(false)
  // Una vez por sesion por posicion (registrarUso ya dedupe): mide cuantas
  // fichas de pieza se abren de verdad, no solo cuantas posiciones se tocan.
  useEffect(() => {
    void registrarUso(slug, 'pieza', fila.pos)
  }, [slug, fila.pos])

  const posN = normalizarPos(fila.pos)
  const enPlanoElectrico = /^[A-Z]\d+$/.test(posN)
  const sap = fila.nr ? sapPorCodigo?.[fila.nr] : undefined
  // Sin curaduria manual detras de esta tabla (sale directo del catalogo
  // escaneado): nunca se marca "confirmado" desde aca.
  const badge = !fila.nr
    ? { txt: 'sin registro', bg: 'var(--lc-surface-hi)', fg: 'var(--lc-ink-mid)' }
    : { txt: 'propuesto', bg: 'var(--lc-prep-soft)', fg: 'var(--lc-prep)' }

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Titulo>Pieza</Titulo>
        <span className="rounded-ctl px-1.5 py-0.5 text-caption font-medium" style={{ background: badge.bg, color: badge.fg }}>
          {badge.txt}
        </span>
      </div>
      <p className="m-0 text-[17px] font-semibold leading-snug">{fila.es || fila.de || fila.pos}</p>
      {fila.de && fila.es && (
        <p className="m-0 mt-0.5 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>{fila.de}</p>
      )}
      {/* Cuántas van en la máquina: pedir 1 cuando lleva 32 es un viaje
          perdido a bodega. Solo se muestra si el catálogo lo dice (x1 no). */}
      {/* Consumible: el técnico lo ve dentro de SU conjunto (un cojinete en
          la fig 13-1) sin tener que saber que también está en la figura 00. */}
      {fila.nr && desgaste?.includes(fila.nr) && (
        <p className="m-0 mt-1 inline-block rounded-ctl px-2 py-0.5 text-caption font-semibold"
           style={{ background: 'var(--lc-nuevo-soft)', color: 'var(--lc-nuevo)' }}>
          Pieza de desgaste — se cambia seguido
        </p>
      )}
      {fila.q != null && (
        <p className="m-0 mt-1 inline-block rounded-ctl px-2 py-0.5 text-caption font-semibold"
           style={{ background: 'var(--lc-prep-soft)', color: 'var(--lc-ink-mid)' }}>
          Lleva {fila.q} unidades
        </p>
      )}

      {fila.nr && (
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[17px] font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>{fila.nr}</span>
          <button type="button" title="Copiar código"
                  onClick={() => {
                    void navigator.clipboard?.writeText(fila.nr!)
                    setCopiado(true)
                    setTimeout(() => setCopiado(false), 1500)
                  }}
                  className="rounded-ctl p-1" style={{ color: copiado ? 'var(--lc-nuevo)' : 'var(--lc-ink-mid)' }}>
            {copiado ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {fila.nr && usosPorCodigo?.[fila.nr] != null && (
        <p className="m-0 mt-1 text-caption" style={{ color: 'var(--lc-ink-mid)' }}>
          {umbralComun != null && usosPorCodigo[fila.nr]! > umbralComun
            ? `Pieza común: se usa en toda la máquina (${usosPorCodigo[fila.nr]} figuras)`
            : `Esta misma pieza va en otras ${usosPorCodigo[fila.nr]! - 1} figuras`}
        </p>
      )}

      <p className="m-0 mt-2 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
        Figura {meta.fig} · {meta.tituloEs}
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {fila.fig && (
          <button type="button" onClick={() => onIrFigura(fila.fig!)}
                  className="flex min-h-[44px] items-center justify-center rounded-ctl border px-3 text-center text-footnote font-medium"
                  style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
            Ver figura {fila.fig}
          </button>
        )}
        {enPlanoElectrico && (
          <Link to={`/aprendizaje/planos/baader-142-888?ap=${encodeURIComponent(posN)}`}
                className="flex min-h-[44px] items-center justify-center rounded-ctl border px-3 text-center text-footnote font-medium no-underline"
                style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
            Ver en plano eléctrico → {posN}
          </Link>
        )}
        {fila.nr && !sap && (
          <Link to={`/repuestos?q=${encodeURIComponent(fila.nr)}`}
                className="text-caption underline-offset-2 hover:underline"
                style={{ color: 'var(--lc-aqua-bright)' }}>
            Buscar {fila.nr} en repuestos
          </Link>
        )}
      </div>

      {sap && (
        <>
          {/* El dato estatico del indice se ve SIEMPRE (el visor corre anonimo
              via QR y la coleccion repuestos exige sesion): SAP + nombre +
              ubicacion de bodega. FichasSap suma el stock vivo con sesion. */}
          <p className="m-0 mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-caption"
             style={{ color: 'var(--lc-ink-mid)' }}>
            <span className="rounded-ctl px-2 py-0.5 font-mono"
                  style={{ background: 'var(--lc-surface-hi)' }}>SAP {sap.s}</span>
            {sap.n && <span>{sap.n}</span>}
            {sap.u && <span>· bodega {sap.u}</span>}
          </p>
          <FichasSap saps={[sap.s]} />
        </>
      )}

      <Titulo>Posiciones de esta figura</Titulo>
      <div className="max-h-[38vh] overflow-y-auto rounded-ctl border" style={{ borderColor: 'var(--lc-border)' }}>
        {filas.map((f) => {
          const fPosN = normalizarPos(f.pos)
          const activa = fPosN === posN
          const anclada = tagsHoja.some((t) => t.t === fPosN)
          return (
            <button key={f.pos} type="button" onClick={() => onSeleccionarFila(f)}
                    className="flex w-full items-baseline justify-between gap-2 border-b px-2 py-1.5 text-left last:border-b-0"
                    style={{
                      borderColor: 'var(--lc-border)',
                      background: activa ? 'var(--lc-aqua-soft)' : undefined,
                      opacity: anclada || activa ? 1 : 0.55,
                    }}>
              <span className="shrink-0 font-mono text-footnote font-semibold"
                    style={{ color: activa ? 'var(--lc-aqua-bright)' : 'var(--lc-ink-mid)' }}>
                {f.pos}
              </span>
              <span className="min-w-0 flex-1 truncate text-caption" style={{ color: 'var(--lc-ink-mid)' }}>
                {f.es || f.de || '—'}
              </span>
              {f.nr && (
                <span className="shrink-0 font-mono text-caption" style={{ color: 'var(--lc-ink-lo)' }}>{f.nr}</span>
              )}
            </button>
          )
        })}
      </div>

      <FichasSap notas={notas.notasDe('aparato', anclaId)} />

      <Titulo>Notas y fotos</Titulo>
      {notas.error && (
        <p className="m-0 mb-2 text-footnote" style={{ color: 'var(--lc-danger)' }}>{notas.error}</p>
      )}
      <NotasAparato
        anclaId={selTag}
        notas={notas.notasDe('aparato', anclaId)}
        onCrear={(n) => notas.crear({ ancla: 'aparato', anclaId, ...n })}
        onBorrar={notas.borrar}
        onEditar={notas.editar}
      />
    </>
  )
}

/**
 * Puente eléctrico → pieza física: solo aparece en los planos que ya tienen
 * curaduría (`partes.json`) y solo si ESTE aparato tiene una pieza vinculada.
 * Vive aparte del cruce SAP (`FichasSap`, debajo): son fuentes distintas —
 * esta sale del catálogo de fábrica, esa de lo que la gente anotó a mano.
 */
function PiezaFisica({ sel, partes, slug, vinculosTerreno }: {
  sel: { tipo: 'aparato'; tag: string }
  partes: ReturnType<typeof usePartesPlano>
  slug: string
  vinculosTerreno: ReturnType<typeof usePlanoVinculos>
}) {
  const pieza = partes?.aparatos[sel.tag]?.[0]
  if (!partes) return null
  if (!pieza) return <ZonaSugerida tag={sel.tag} partes={partes} slug={slug} />

  // Otras designaciones de la MISMA figura con un código distinto: el aviso
  // de "es otro modelo" sale de los datos, no de un texto fijo.
  const otras = Object.entries(partes.aparatos)
    .flatMap(([tag, entradas]) => entradas.map((e) => ({ tag, ...e })))
    .filter((e) => e.fig === pieza.fig && e.nr !== pieza.nr && e.tag !== sel.tag)
  const nrOtras = otras[0]?.nr
  // Compactar respetando HUECOS (compactarTramos, con tests): "B1–B12"
  // escondería que B10 usa el mismo modelo que B14.
  const tramos = compactarTramos([...new Set(otras.map((o) => o.tag))])
  const aviso = tramos.length > 0 && nrOtras
    ? `Ojo: ${tramos.join(', ')} llevan el ${nrOtras}. Este ${sel.tag} es otro modelo.`
    : null

  return (
    <div className="mb-3 rounded-card border p-3" style={{ background: 'var(--lc-bg-panel)', borderColor: 'var(--lc-border)' }}>
      <Titulo>Pieza física</Titulo>
      <PiezaTerreno tag={sel.tag} pieza={pieza} vinculosTerreno={vinculosTerreno} />
      {aviso && (
        <p className="m-0 mt-2 rounded-ctl border-l-2 py-1 pl-2 text-footnote leading-relaxed"
           style={{ borderColor: 'var(--lc-prep)', background: 'var(--lc-prep-soft)', color: 'var(--lc-ink-mid)' }}>
          {aviso}
        </p>
      )}
      <Link to={`/aprendizaje/planos/${partes.despiece}?hoja=${pieza.hoja}&ap=${encodeURIComponent(pieza.pos)}`}
            onClick={(e) => { e.stopPropagation(); void registrarUso(slug, 'salto-a-despiece', sel.tag) }}
            className="mt-2 flex min-h-[44px] items-center justify-center rounded-ctl border px-3 text-center text-footnote font-medium no-underline"
            style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
        Ver en el despiece
      </Link>
    </div>
  )
}

/**
 * Estado + acciones de la confirmación EN TERRENO de este aparato. El
 * catálogo solo propone (badge gris "según catálogo"); la palabra de quien
 * está frente a la máquina es la que convierte esa propuesta en certeza —
 * o la corrige, o dice que ese aparato ni existe ahí.
 */
function PiezaTerreno({ tag, pieza, vinculosTerreno }: {
  tag: string
  pieza: { es: string; de?: string; nr: string; sap?: string; sapUbicacion?: string; confianza: string }
  vinculosTerreno: ReturnType<typeof usePlanoVinculos>
}) {
  const v = vinculosTerreno.vinculos.get(tag)
  const [abierto, setAbierto] = useState(false)
  const [opcion, setOpcion] = useState<VinculoTerreno['estado'] | null>(null)
  const [codigoLeido, setCodigoLeido] = useState('')
  const [nota, setNota] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)

  const abrirFormulario = () => {
    setOpcion(null)
    setCodigoLeido('')
    setNota('')
    setErrorLocal(null)
    setAbierto(true)
  }

  const guardar = async () => {
    if (!opcion || (opcion === 'corregido' && !codigoLeido.trim())) return
    setGuardando(true)
    setErrorLocal(null)
    try {
      // La foto va primero: si falla la subida, no se guarda un vínculo que
      // dice tener evidencia y no la tiene.
      const urlFoto = foto ? await vinculosTerreno.subirFoto(foto) : undefined
      await vinculosTerreno.confirmar({
        aparato: tag,
        estado: opcion,
        codigo: opcion === 'confirmado' ? pieza.nr : opcion === 'corregido' ? codigoLeido.trim() : undefined,
        nota: nota.trim() || undefined,
        foto: urlFoto,
      })
      setAbierto(false)
      setFoto(null)
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {v?.estado === 'no_aplica' ? (
        <p className="m-0 rounded-ctl p-2 text-footnote leading-relaxed"
           style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
          Este aparato no existe en esta máquina (verificado en terreno).
        </p>
      ) : (
        <>
          {/* El badge va DEBAJO, no al lado: compitiendo por el ancho del
              panel partía nombres como "Sensores de proximidad inductivo" en
              cuatro líneas de una palabra. El nombre manda. */}
          <div className="flex flex-col items-start gap-1">
            <span className="text-footnote font-semibold leading-snug">{pieza.es}</span>
            {v?.estado === 'confirmado' ? (
              <span className="shrink-0 rounded-ctl px-2 py-0.5 text-caption"
                    style={{ background: 'var(--lc-nuevo-soft)', color: 'var(--lc-nuevo)' }}>
                Confirmado en terreno
              </span>
            ) : v?.estado === 'corregido' ? (
              <span className="shrink-0 rounded-ctl px-2 py-0.5 text-caption"
                    style={{ background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }}>
                Corregido en terreno
              </span>
            ) : (
              <span className="shrink-0 rounded-ctl px-2 py-0.5 text-caption"
                    style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                {pieza.confianza === 'catalogo' ? 'según catálogo BAADER 2006' : 'propuesto'}
              </span>
            )}
          </div>
          {pieza.de && (
            <p className="m-0 mt-0.5 text-caption" style={{ color: 'var(--lc-ink-lo)' }}>{pieza.de}</p>
          )}
          {v?.estado === 'corregido' ? (
            <>
              <p className="m-0 mt-1.5 font-mono text-[15px] font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>
                {v.codigo}
              </p>
              <p className="m-0 mt-0.5 text-caption" style={{ color: 'var(--lc-ink-ghost)' }}>
                el catálogo decía <span className="font-mono line-through">{pieza.nr}</span>
              </p>
            </>
          ) : (
            <p className="m-0 mt-1.5 font-mono text-[15px] font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>
              {pieza.nr}
            </p>
          )}
          {pieza.sap && (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-ctl px-2 py-0.5 text-caption"
                  style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
              SAP {pieza.sap}{pieza.sapUbicacion ? ` · ${pieza.sapUbicacion}` : ''}
            </span>
          )}
        </>
      )}
      {v && (
        <p className="m-0 mt-1 text-caption" style={{ color: 'var(--lc-ink-lo)' }}>
          Por {v.confirmadoPorNombre || 'alguien'} · {formatearFechaCorta(v.actualizado)}
        </p>
      )}

      {!auth.currentUser ? (
        <p className="m-0 mt-2 text-caption" style={{ color: 'var(--lc-ink-ghost)' }}>
          Inicia sesión para confirmar en terreno
        </p>
      ) : abierto ? (
        <FormularioTerreno
          opcion={opcion} onOpcion={setOpcion}
          codigo={codigoLeido} onCodigo={setCodigoLeido}
          nota={nota} onNota={setNota}
          fotoNombre={foto?.name ?? null} onFoto={setFoto}
          guardando={guardando} error={errorLocal ?? vinculosTerreno.error}
          onGuardar={() => void guardar()} onCancelar={() => setAbierto(false)}
        />
      ) : (
        <button type="button" onClick={abrirFormulario}
                className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-ctl border px-3 text-center text-footnote font-medium"
                style={v
                  ? { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }
                  : { borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
          {v ? 'Corregir' : 'Confirmar en terreno'}
        </button>
      )}
    </>
  )
}

/** El formulario en línea (no modal: el panel ya es hoja inferior en móvil). */
function FormularioTerreno({
  opcion, onOpcion, codigo, onCodigo, nota, onNota, fotoNombre, onFoto,
  guardando, error, onGuardar, onCancelar,
}: {
  opcion: VinculoTerreno['estado'] | null
  onOpcion: (o: VinculoTerreno['estado']) => void
  codigo: string
  onCodigo: (v: string) => void
  nota: string
  onNota: (v: string) => void
  fotoNombre: string | null
  onFoto: (f: File | null) => void
  guardando: boolean
  error: string | null
  onGuardar: () => void
  onCancelar: () => void
}) {
  const opciones: { valor: VinculoTerreno['estado']; etiqueta: string }[] = [
    { valor: 'confirmado', etiqueta: 'Sí, es esta pieza' },
    { valor: 'corregido', etiqueta: 'Es otra pieza' },
    { valor: 'no_aplica', etiqueta: 'No existe en esta máquina' },
  ]
  const puedeGuardar = !!opcion && (opcion !== 'corregido' || codigo.trim().length > 0) && !guardando
  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-ctl border p-2" style={{ borderColor: 'var(--lc-border)' }}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" onClick={() => onOpcion(o.valor)} aria-pressed={opcion === o.valor}
                className="flex min-h-[44px] items-center rounded-ctl border px-3 text-left text-footnote font-medium"
                style={opcion === o.valor
                  ? { borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }
                  : { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
          {o.etiqueta}
        </button>
      ))}
      {opcion === 'corregido' && (
        <input type="text" inputMode="numeric" placeholder="código de la etiqueta" value={codigo}
               onChange={(e) => onCodigo(e.target.value)}
               className="min-h-[44px] rounded-ctl border px-3 text-footnote"
               style={{ borderColor: 'var(--lc-border)', background: 'var(--lc-surface)', color: 'var(--lc-ink)' }} />
      )}
      <textarea rows={2} maxLength={500} placeholder="Nota (opcional)" value={nota}
                onChange={(e) => onNota(e.target.value)}
                className="rounded-ctl border px-3 py-2 text-footnote"
                style={{ borderColor: 'var(--lc-border)', background: 'var(--lc-surface)', color: 'var(--lc-ink)' }} />
      {/* La foto de la etiqueta es lo que vuelve irrefutable el vínculo: el
          que venga después no tiene que creer, ve la placa. `capture` abre
          la cámara directo en el teléfono. */}
      <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-ctl border px-3 text-footnote font-medium"
             style={{ borderColor: 'var(--lc-border)', color: fotoNombre ? 'var(--lc-nuevo)' : 'var(--lc-ink-mid)' }}>
        <Camera size={15} />
        {fotoNombre ? 'Foto lista ✓' : 'Foto de la etiqueta (opcional)'}
        <input type="file" accept="image/*" capture="environment" className="hidden"
               onChange={(e) => onFoto(e.target.files?.[0] ?? null)} />
      </label>
      {error && (
        <p className="m-0 rounded-ctl p-2 text-footnote" style={{ background: 'var(--lc-danger-soft)', color: 'var(--lc-danger)' }}>
          {error}
        </p>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={onCancelar}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-ctl border px-3 text-footnote font-medium"
                style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
          Cancelar
        </button>
        <button type="button" onClick={onGuardar} disabled={!puedeGuardar}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-ctl border px-3 text-footnote font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua)', color: '#fff' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

/**
 * Cuando el aparato NO tiene una pieza exacta vinculada por designación pero
 * su letra IEC 81346 (K, Q, F, S, Y, M, SM, B...) sí tiene familia en el
 * despiece: no promete la pieza, solo dice en qué caja de distribución
 * buscarla — 134 aparatos pasan de "nada" a esto.
 */
/**
 * Los aparatos con pieza propuesta que todavía nadie verificó en la máquina.
 * Es la ruta de trabajo del próximo recorrido: se toca uno, se abre su ficha
 * y se confirma ahí mismo. Muestra hasta 8 para no volverse un muro.
 */
function PendientesTerreno({ partes, vinculos, onAbrir }: {
  partes: ReturnType<typeof usePartesPlano>
  vinculos: Map<string, VinculoTerreno>
  onAbrir: (tag: string) => void
}) {
  const pendientes = Object.keys(partes?.aparatos ?? {})
    .filter((t) => !vinculos.has(t))
    .sort(compararTags)
  if (!pendientes.length) {
    return partes?.aparatos && Object.keys(partes.aparatos).length > 0 ? (
      <p className="m-0 mt-1 text-footnote" style={{ color: 'var(--lc-nuevo)' }}>
        Todas las piezas propuestas están verificadas en terreno.
      </p>
    ) : null
  }
  return (
    <>
      <p className="m-0 mt-2 text-footnote" style={{ color: 'var(--lc-ink-mid)' }}>
        Falta verificar en la máquina ({pendientes.length}):
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {pendientes.slice(0, 8).map((t) => (
          <button key={t} type="button" onClick={() => onAbrir(t)}
                  className="rounded-ctl border px-2 py-1 font-mono text-footnote"
                  style={{ borderColor: 'var(--lc-prep)', color: 'var(--lc-prep)' }}>
            {t}
          </button>
        ))}
        {pendientes.length > 8 && (
          <span className="self-center text-caption" style={{ color: 'var(--lc-ink-ghost)' }}>
            +{pendientes.length - 8} más
          </span>
        )}
      </div>
    </>
  )
}

function ZonaSugerida({ tag, partes, slug }: {
  tag: string
  partes: NonNullable<ReturnType<typeof usePartesPlano>>
  slug: string
}) {
  const letra = tag.match(/^[A-Z]+/)?.[0]
  const familia = letra ? partes.familias?.[letra] : undefined
  if (!familia?.figuras.length) return null
  return (
    <div className="mb-3 rounded-card border p-3" style={{ background: 'var(--lc-bg-panel)', borderColor: 'var(--lc-border)' }}>
      <Titulo>Dónde buscarlo en el despiece</Titulo>
      <p className="m-0 text-footnote leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
        {tag} es de {familia.etiqueta}. En el catálogo de piezas vive en:
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {familia.figuras.slice(0, 3).map((f) => (
          <Link key={f.fig} to={`/aprendizaje/planos/${partes.despiece}?hoja=${f.hoja}`}
                onClick={(e) => { e.stopPropagation(); void registrarUso(slug, 'salto-a-despiece', tag) }}
                className="flex min-h-[44px] items-center justify-center rounded-ctl border px-3 text-center text-footnote font-medium no-underline"
                style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
            Fig {f.fig} · {f.titulo}
          </Link>
        ))}
      </div>
      <p className="m-0 mt-2 text-caption leading-relaxed" style={{ color: 'var(--lc-ink-lo)' }}>
        El catálogo no rotula la designación eléctrica: esto es el gabinete/conjunto
        donde está montado, no la pieza exacta.
      </p>
    </div>
  )
}

/**
 * El cruce que cierra el circulo del modulo: los codigos SAP que la gente dejo
 * en las notas del aparato, resueltos contra el maestro de repuestos y el
 * stock de bodega. Veo la falla en el plano -> se que pedir y cuantos hay.
 */
function FichasSap({ notas, saps: sapsDirectos }: {
  notas?: ReturnType<typeof usePlanoNotas>['notas']
  /** SAPs a mostrar directo, sin pasar por notas (p.ej. el cruce del catálogo del despiece). */
  saps?: string[]
}) {
  const saps = useMemo(
    () => [...new Set([
      ...(sapsDirectos ?? []),
      ...(notas ?? []).map((n) => n.codigoSAP).filter((s): s is string => !!s),
    ])],
    [notas, sapsDirectos],
  )
  const info = usePlanoSap(saps)
  const fichas = saps.map((s) => info[s]).filter((f): f is NonNullable<typeof f> => !!f)
  if (!fichas.length) return null
  return (
    <>
      <Titulo>Repuesto vinculado</Titulo>
      {fichas.map((f) => {
        const sinStock = f.stockActual != null && f.stockActual <= 0
        const bajo = f.stockActual != null && f.stockMinimo != null
          && f.stockActual > 0 && f.stockActual < f.stockMinimo
        return (
          <div key={f.sap} className="mb-3 rounded-card border p-3"
               style={{ background: 'var(--lc-bg-panel)', borderColor: 'var(--lc-border)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-footnote font-semibold leading-snug">
                {f.nombre ?? 'SAP sin catalogar'}
              </span>
              <span className="shrink-0 font-mono text-caption" style={{ color: 'var(--lc-aqua-bright)' }}>
                {f.sap}
              </span>
            </div>
            {(f.marca || f.modeloTipo || f.codigoFabricante) && (
              <p className="m-0 mt-1 font-mono text-caption" style={{ color: 'var(--lc-ink-mid)' }}>
                {[f.marca, f.modeloTipo, f.codigoFabricante].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {f.stockActual == null ? (
                <span className="rounded-ctl px-2 py-0.5 text-caption"
                      style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                  sin registro de bodega
                </span>
              ) : (
                <span className="rounded-ctl px-2 py-0.5 font-mono text-caption font-semibold"
                      style={sinStock
                        ? { background: 'var(--lc-danger-soft)', color: 'var(--lc-danger)' }
                        : bajo
                          ? { background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }
                          : { background: 'var(--lc-nuevo-soft)', color: 'var(--lc-nuevo)' }}>
                  {f.stockActual} {f.unidad ?? 'un'} en bodega
                </span>
              )}
              {f.ubicacionBodega && (
                <span className="text-caption" style={{ color: 'var(--lc-ink-lo)' }}>{f.ubicacionBodega}</span>
              )}
              <Link to={`/repuestos?q=${encodeURIComponent(f.sap)}`}
                    className="ml-auto text-caption underline-offset-2 hover:underline"
                    style={{ color: 'var(--lc-aqua-bright)' }}>
                Ver en Repuestos
              </Link>
            </div>
          </div>
        )
      })}
    </>
  )
}

/** Registra una consulta (plano o aparato) para los KPIs de uso del modulo.
 *  Silencioso: sin sesion o sin red simplemente no registra. */
async function registrarUso(slug: string, tipo: 'apertura' | 'aparato' | 'pieza' | 'salto-a-despiece', tag?: string) {
  try {
    const { auth: a, db: base } = await import('@/services/firebase')
    if (!a.currentUser) return
    const clave = `uso:${slug}:${tipo}:${tag ?? ''}`
    if (sessionStorage.getItem(clave)) return
    sessionStorage.setItem(clave, '1')
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
    await addDoc(collection(base, 'planoUsos'), {
      plantId: 'chonchi',
      planoSlug: slug,
      tipo,
      ...(tag ? { tag } : {}),
      uid: a.currentUser.uid,
      dia: new Date().toISOString().slice(0, 10),
      ts: serverTimestamp(),
    })
  } catch { /* telemetria jamas molesta al usuario */ }
}

/** Boton "Disponible sin señal": descarga las hojas del plano a la cache del
 *  navegador para las zonas de planta sin cobertura. */
function BotonOffline({ slug, indice }: { slug: string; indice: PlanoIndice | null }) {
  const clave = `plano-offline:${slug}`
  const [estado, setEstado] = useState<'no' | 'bajando' | 'si'>(
    () => (localStorage.getItem(clave) ? 'si' : 'no'),
  )
  const [avance, setAvance] = useState(0)
  if (!indice) return null
  const bajar = async () => {
    setEstado('bajando')
    try {
      await guardarPlanoOffline(slug, indice.hojas.map((h) => h.blatt),
        (hechas, total) => setAvance(Math.round((hechas / total) * 100)))
      localStorage.setItem(clave, new Date().toISOString())
      setEstado('si')
    } catch {
      setEstado('no')
    }
  }
  return (
    <button type="button"
            title={estado === 'si' ? 'Guardado para usar sin señal' : 'Guardar para usar sin señal'}
            onClick={() => { if (estado === 'no') void bajar() }}
            className="flex items-center gap-1 rounded-ctl p-1.5 font-mono text-caption"
            style={{ color: estado === 'si' ? 'var(--lc-nuevo)' : 'var(--lc-ink-mid)' }}>
      {estado === 'bajando' ? <><Loader2 size={14} className="animate-spin" />{avance}%</>
        : estado === 'si' ? <><Check size={14} /><Download size={12} /></>
        : <Download size={15} />}
    </button>
  )
}

/** Limpia los restos de extraccion del titulo de una hoja (asteriscos del
 *  bloque de notas, separadores colgando) para el indice lateral. */
function limpiarTitulo(t: string): string {
  const limpio = t.replace(/\*\)\s*/g, '').replace(/\s*\u00b7\s*$/, '').trim()
  return limpio || 'Continuaci\u00f3n del esquema'
}

/** Nombre corto de una seleccion, para el boton de volver del panel. */
function etiquetaSel(s: NonNullable<Seleccion>): string {
  switch (s.tipo) {
    case 'aparato': return s.tag
    case 'borne': return `borne ${s.t}`
    case 'borneLibre': return `borne ${s.l.t}`
    case 'salto': return `salto ${s.t}`
    case 'rotulo': return `«${s.r.es.slice(0, 22)}»`
  }
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="m-0 mb-2 text-caption font-semibold tracking-wider"
        style={{ color: 'var(--lc-ink-ghost)' }}>
      {children}
    </h2>
  )
}

function Aviso({ texto, onReintentar }: { texto: string; onReintentar?: () => void }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center text-footnote"
         style={{ background: 'var(--lc-bg)', color: 'var(--lc-ink-mid)' }}>
      <span className="flex items-center gap-2"><Zap size={15} /> {texto}</span>
      {/* En planta la señal se corta a mitad de la descarga: sin este botón
          el único camino era recargar la página y perder la hoja abierta. */}
      {onReintentar && (
        <button type="button" onClick={onReintentar}
                className="flex min-h-[44px] items-center rounded-ctl border px-4 font-medium"
                style={{ borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)', color: 'var(--lc-aqua-bright)' }}>
          Reintentar
        </button>
      )}
    </div>
  )
}
