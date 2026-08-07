import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Printer, QrCode, Search, X, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { PLANOS, planoPorSlug } from '@/data/planos'
import { usePlano, type Caja, type PlanoBorneLibre, type PlanoRotulo } from '@/hooks/usePlano'
import { usePlanoNotas } from '@/hooks/usePlanoNotas'
import { usePlanoSap } from '@/hooks/usePlanoSap'
import { PlanoLienzo, type Foco } from '@/components/planos/PlanoLienzo'
import { NotasAparato } from '@/components/planos/NotasAparato'

type Seleccion =
  | { tipo: 'aparato'; tag: string }
  | { tipo: 'salto'; t: string; h: number; c: number }
  | { tipo: 'borne'; t: string; h: number }
  | { tipo: 'borneLibre'; l: PlanoBorneLibre }
  | { tipo: 'rotulo'; r: PlanoRotulo }
  | null

export function PlanosElectricosPage() {
  const { slug } = useParams<{ slug: string }>()
  return slug ? <Visor slug={slug} /> : <Catalogo />
}

/* ────────────────────────────── catálogo ────────────────────────────── */

function Catalogo() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-5" style={{ color: 'var(--lc-ink)' }}>
      <header>
        <h1 className="m-0 text-xl font-semibold">Planos eléctricos</h1>
        <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--lc-ink-mid)' }}>
          El plano del fabricante, navegable: los saltos entre hojas se siguen tocando,
          cada aparato dice dónde más aparece, y los rótulos se leen en castellano.
        </p>
      </header>

      {PLANOS.map((p) => (
        <Link key={p.slug} to={`/aprendizaje/planos/${p.slug}`}
              className="flex flex-col gap-2 rounded-lg border p-4 no-underline transition-opacity hover:opacity-90"
              style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'inherit' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">{p.maquina}</span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--lc-aqua-bright)' }}>
              {p.numero} · {p.revision}
            </span>
          </div>
          <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
            {p.descripcion}
          </p>
          <div className="flex flex-wrap gap-3 font-mono text-[11px]" style={{ color: 'var(--lc-ink-lo)' }}>
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
    </div>
  )
}

/* ─────────────────────────────── visor ─────────────────────────────── */

function Visor({ slug }: { slug: string }) {
  const cat = planoPorSlug(slug)
  // Hoja inicial: la de la URL (?hoja=9, para compartir un punto del plano por
  // chat) o la última visitada en este equipo; usePlano valida contra el índice.
  const [inicial] = useState<number | undefined>(() => {
    const q = Number(new URLSearchParams(window.location.search).get('hoja'))
    if (Number.isInteger(q) && q > 0) return q
    const g = Number(localStorage.getItem(`plano-hoja:${slug}`))
    return Number.isInteger(g) && g > 0 ? g : undefined
  })
  const { indice, hoja, abrir, error } = usePlano(slug, inicial)
  const notas = usePlanoNotas(slug)
  const [sel, setSel] = useState<Seleccion>(null)
  const [foco, setFoco] = useState<Foco>(null)
  const [mostrarEs, setMostrarEs] = useState(false)
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
      setRecientes((r) => {
        const v = [nuevo.tag, ...r.filter((x) => x !== nuevo.tag)].slice(0, 6)
        localStorage.setItem(`plano-recientes:${slug}`, JSON.stringify(v))
        return v
      })
    }
    setSel((previo) => {
      if (previo && nuevo && previo !== nuevo && hoja) {
        setPilaSel((p) => [...p.slice(-14), { s: previo, h: hoja.blatt }])
      }
      return nuevo
    })
  }, [hoja, slug])

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
    const ap = new URLSearchParams(window.location.search).get('ap')?.toUpperCase()
    if (!ap || !indice.indice[ap]) return
    // si la URL tambien trae ?hoja=, mandan la hoja pedida: se busca la
    // aparicion del aparato AHI; si no hay, recien se va a la primera
    const puntos = indice.indice[ap]
    const enHojaPedida = puntos.find((pt) => pt.h === hoja.blatt)
    const destino = enHojaPedida ?? puntos[0]
    seleccionar({ tipo: 'aparato', tag: ap })
    if (destino) void irA(destino.h, undefined, destino.b)
  }, [indice, hoja, irA, seleccionar])

  const imprimirHoja = useCallback(() => {
    if (!hoja || !indice) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<title>${indice.maquina} - ${indice.plano} - Hoja ${hoja.blatt}</title>`
      + '<style>@page{size:A3 landscape;margin:8mm} body{margin:0} svg{width:100%;height:auto}'
      + 'header{font:600 12px system-ui;padding:4px 0}</style>'
      + `<header>${indice.maquina} · ${indice.plano} · Hoja ${hoja.blatt} / ${indice.hojasTotales}</header>`
      + hoja.datos.svg,
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }, [hoja, indice])

  const abrirAparato = useCallback((tag: string) => {
    const puntos = indice?.indice[tag]
    if (!puntos?.length) return
    const enEsta = puntos.find((pt) => pt.h === hoja?.blatt)
    const destino = enEsta ?? puntos[0]!
    seleccionar({ tipo: 'aparato', tag })
    setBusca('')
    void irA(destino.h, undefined, destino.b)
  }, [indice, hoja, seleccionar, irA])

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
    u.searchParams.set('hoja', String(hoja.blatt))
    if (sel?.tipo === 'aparato') u.searchParams.set('ap', sel.tag)
    else u.searchParams.delete('ap')
    window.history.replaceState(null, '', u)
  }, [hoja, slug, sel])

  const notasDe = useCallback((tag: string) => notas.notasDe('aparato', tag).length, [notas])

  // En que hojas hay conocimiento acumulado: una nota de F24 "vive" en cada
  // hoja donde F24 aparece. Alimenta el badge ambar del indice lateral.
  const notasPorHoja = useMemo(() => {
    const m = new Map<number, number>()
    if (!indice) return m
    notas.notas.forEach((n) => {
      if (n.ancla !== 'aparato') return
      const hojasDel = new Set((indice.indice[n.anclaId] ?? []).map((pt) => pt.h))
      hojasDel.forEach((h) => m.set(h, (m.get(h) ?? 0) + 1))
    })
    return m
  }, [notas.notas, indice])

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
    return <Aviso texto={error} />
  }
  if (!indice || !hoja || !meta) {
    return <Aviso texto="Cargando el plano…" />
  }

  const i = indice.hojas.findIndex((h) => h.blatt === hoja.blatt)
  const anterior = indice.hojas[i - 1]
  const siguiente = indice.hojas[i + 1]
  const resultados = buscar(busca, indice, hoja.blatt)
  const vNota = busca.trim().toLowerCase()
  if (vNota) {
    notas.notas.forEach((n) => {
      if (n.ancla !== 'aparato') return
      if (!n.texto.toLowerCase().includes(vNota) && !n.anclaId.toLowerCase().includes(vNota)) return
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
          <span className="text-[13px] font-semibold">{cat?.maquina ?? indice.maquina}</span>
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
            {indice.plano} · {indice.rev}
          </span>
        </Link>

        <div className="order-last basis-full md:order-none md:basis-auto relative min-w-[180px] flex-1 md:max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--lc-ink-ghost)' }} />
          <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} type="search"
                 placeholder="Buscar K7, Q1, B12, Messer, cuchillo…"
                 className="w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-2 font-mono text-[12.5px] outline-none"
                 style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }} />
        </div>

        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--lc-border)' }}>
          {([['DE', false], ['ES', true]] as const).map(([txt, v]) => (
            <button key={txt} type="button" onClick={() => setMostrarEs(v)} aria-pressed={mostrarEs === v}
                    className="px-3 py-1.5 text-[12px] font-semibold"
                    style={mostrarEs === v
                      ? { background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }
                      : { color: 'var(--lc-ink-mid)' }}>
              {txt}
            </button>
          ))}
        </div>

        <button type="button" title="Imprimir esta hoja" onClick={imprimirHoja}
                className="hidden rounded p-1.5 md:block" style={{ color: 'var(--lc-ink-mid)' }}>
          <Printer size={15} />
        </button>
        <button type="button" title="QR de este punto del plano" onClick={() => setMostrarQR(true)}
                className="rounded p-1.5" style={{ color: 'var(--lc-ink-mid)' }}>
          <QrCode size={15} />
        </button>
        <div className="flex items-center gap-1 font-mono text-[12px]">
          <button type="button" disabled={!anterior} onClick={() => anterior && void irA(anterior.blatt)}
                  className="rounded p-1 disabled:opacity-30" title="Hoja anterior">
            <ChevronLeft size={16} />
          </button>
          {/* Select nativo: en el teléfono el índice lateral no existe y sin
              esto la única forma de moverse era de a una hoja con las flechas. */}
          <select value={hoja.blatt} onChange={(e) => void irA(Number(e.target.value))}
                  aria-label="Ir a hoja"
                  className="cursor-pointer appearance-none rounded border-0 bg-transparent py-1 pr-0.5 font-mono text-[12px] tabular-nums outline-none"
                  style={{ color: 'var(--lc-ink)' }}>
            {(['circuitos', 'bornes'] as const).map((sec) => (
              <optgroup key={sec} label={sec === 'circuitos' ? 'Esquema de circuitos' : 'Plano de bornes'}>
                {indice.hojas.filter((h) => h.seccion === sec).map((h) => (
                  <option key={h.blatt} value={h.blatt}>{h.blatt}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="tabular-nums" style={{ color: 'var(--lc-ink-mid)' }}>/ {indice.hojasTotales}</span>
          <button type="button" disabled={!siguiente}
                  onClick={() => siguiente && void irA(siguiente.blatt)}
                  className="rounded p-1 disabled:opacity-30" title="Hoja siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {mostrarQR && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
             onClick={() => setMostrarQR(false)}>
          <div className="flex flex-col items-center gap-3 rounded-2xl p-5"
               style={{ background: 'var(--lc-surface)' }} onClick={(e) => e.stopPropagation()}>
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={window.location.href} size={208} />
            </div>
            <p className="m-0 max-w-[240px] text-center text-[11.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
              Este QR abre exactamente esta vista: hoja {hoja.blatt}
              {sel?.tipo === 'aparato' ? ` con la ficha de ${sel.tag}` : ''}. Imprímelo y pégalo en el tablero.
            </p>
            <button type="button" onClick={() => setMostrarQR(false)}
                    className="rounded-md border px-3 py-1.5 text-[12px]"
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
          {(['circuitos', 'bornes'] as const).map((sec) => {
            const grupo = indice.hojas.filter((h) => h.seccion === sec)
            if (!grupo.length) return null
            return (
              <section key={sec}>
                <h2 className="sticky top-0 z-10 m-0 flex items-baseline justify-between border-b px-2 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: 'var(--lc-surface)', color: 'var(--lc-ink-ghost)', borderColor: 'var(--lc-border)' }}>
                  {sec === 'circuitos' ? 'Esquema de circuitos' : 'Plano de bornes'}
                  <span className="font-mono normal-case tracking-normal">{grupo.length}</span>
                </h2>
                <div className="pt-1.5">
                  {grupo.map((h) => {
                    const activa = h.blatt === hoja.blatt
                    return (
                      <button key={h.blatt} type="button" onClick={() => void irA(h.blatt)}
                              aria-current={activa}
                              className="mb-0.5 flex w-full items-center gap-2 rounded-md py-1.5 pl-1.5 pr-2 text-left"
                              style={activa
                                ? { background: 'var(--lc-aqua-soft)', boxShadow: 'inset 2px 0 0 var(--lc-aqua)' }
                                : {}}>
                        <span className="w-7 shrink-0 rounded py-0.5 text-center font-mono text-[11px] tabular-nums"
                              style={activa
                                ? { background: 'var(--lc-aqua)', color: '#fff' }
                                : { background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                          {h.blatt}
                        </span>
                        <span className="line-clamp-2 min-w-0 flex-1 text-[10.5px] leading-snug"
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
                    className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11.5px] shadow-lg"
                    style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}
                    title="Deshacer el salto (Backspace)">
              <ChevronLeft size={13} /> Hoja {historial[historial.length - 1]}
            </button>
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
          className={`${abiertoMovil ? 'fixed' : 'hidden'} inset-x-2 bottom-3 z-50 max-h-[55dvh] overflow-y-auto rounded-2xl border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl md:static md:z-auto md:block md:max-h-none md:w-72 md:shrink-0 md:rounded-none md:border-0 md:border-l md:pb-3 md:shadow-none`}
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
                    className="absolute -top-1 right-8 rounded p-1.5"
                    style={{ color: 'var(--lc-ink-mid)' }}>
              {minimizada ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" aria-label="Cerrar panel"
                    onClick={() => { setSel(null); setBusca(''); setAyuda(false); setMinimizada(false); setAltoHoja(null) }}
                    className="absolute -top-1 right-0 rounded p-1.5"
                    style={{ color: 'var(--lc-ink-mid)' }}>
              <X size={16} />
            </button>
          </div>
          {esMovil && minimizada && (
            <button type="button" onClick={() => setMinimizada(false)}
                    className="flex w-full items-center gap-2 px-1 text-left text-[12.5px] font-semibold"
                    style={{ color: 'var(--lc-ink)' }}>
              {sel ? etiquetaSel(sel) : busca.trim() ? `Resultados de “${busca.trim()}”` : 'Panel'}
            </button>
          )}
          {!(esMovil && minimizada) && <>
          {!busca.trim() && pilaSel.length > 0 && (
            <button type="button" onClick={volverSel}
                    className="mb-2 flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11.5px]"
                    style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
              <ChevronLeft size={13} /> Volver a {etiquetaSel(pilaSel[pilaSel.length - 1]!.s)}
            </button>
          )}
          {busca.trim()
            ? <Resultados items={resultados}
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
                     enEstaHoja={sel?.tipo === 'aparato' ? hoja.datos.tags.filter((t) => t.t === sel.tag).length : 0} />}
          </>}
        </aside>
      </div>
    </div>
  )
}

/* ────────────────────────────── panel ────────────────────────────── */

function Panel({ sel, indice, hojaActual, notas, onIr, recientes, onAbrirAparato, resaltar, onResaltar, enEstaHoja }: {
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
}) {
  if (!sel) {
    return (
      <>
        <Titulo>Cómo se usa</Titulo>
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
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
        {recientes.length > 0 && (
          <>
            <h2 className="m-0 mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--lc-ink-ghost)' }}>
              Recientes
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {recientes.map((t) => (
                <button key={t} type="button" onClick={() => onAbrirAparato(t)}
                        className="rounded border px-2 py-1 font-mono text-[11.5px]"
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
        <p className="m-0 text-[12.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
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
        <p className="m-0 mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
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
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
          El plano no dice de qué regla es este {sel.l.t} — existe en{' '}
          {sel.l.op.length} reglas. Las nombradas en esta misma hoja van primero:
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {sel.l.op.map((o) => (
            <button key={o.k} type="button" onClick={() => onIr(o.h, undefined, o.tb)}
                    className="flex items-baseline justify-between rounded border px-2.5 py-1.5 text-left"
                    style={{ borderColor: 'var(--lc-border)' }}>
              <b className="font-mono text-[13px]" style={{ color: 'var(--lc-nuevo)' }}>{o.k}</b>
              <span className="text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>hoja {o.h}</span>
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
        <p className="m-0 mt-1.5 rounded-md border-l-2 py-1 pl-2 text-[11.5px] leading-relaxed"
           style={{ color: 'var(--lc-ink-mid)', borderColor: 'var(--lc-aqua)', background: 'var(--lc-aqua-soft)' }}>
          {indice.descs[sel.tag]}
        </p>
      )}
      <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
        {esSenal
          ? `Este potencial recorre ${new Set(puntos.map((p) => p.h)).size} hojas del plano. Síguelo:`
          : `Aparece en ${puntos.length} punto${puntos.length !== 1 ? 's' : ''} del plano.`}
      </p>
      {enEstaHoja > 1 && (
        <button type="button" onClick={onResaltar} aria-pressed={resaltar}
                className="mt-2 w-full rounded-md border px-2 py-1.5 text-[11.5px] font-medium"
                style={resaltar
                  ? { background: 'var(--lc-aqua)', borderColor: 'var(--lc-aqua)', color: '#fff' }
                  : { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
          {resaltar ? 'Quitar resaltado' : `Resaltar sus ${enEstaHoja} puntos en esta hoja`}
        </button>
      )}
      <div className="mb-4 mt-2 flex flex-wrap gap-1.5">
        {puntos.map((p) => (
          <button key={`${p.h}.${p.c}`} type="button" onClick={() => onIr(p.h, undefined, p.b)}
                  className="rounded border px-2 py-1 font-mono text-[11.5px] tabular-nums"
                  style={p.h === hojaActual
                    ? { borderColor: 'var(--lc-aqua)', color: 'var(--lc-aqua-bright)', background: 'var(--lc-aqua-soft)' }
                    : { borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
            {p.h}.{p.c}
          </button>
        ))}
      </div>

      <FichasSap notas={notas.notasDe('aparato', sel.tag)} />

      <Titulo>Notas y fotos</Titulo>
      {notas.error && (
        <p className="m-0 mb-2 text-[11.5px]" style={{ color: 'var(--lc-danger)' }}>{notas.error}</p>
      )}
      <NotasAparato
        anclaId={sel.tag}
        notas={notas.notasDe('aparato', sel.tag)}
        onCrear={(n) => notas.crear({ ancla: 'aparato', anclaId: sel.tag, ...n })}
        onBorrar={notas.borrar}
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

function buscar(
  q: string,
  indice: NonNullable<ReturnType<typeof usePlano>['indice']>,
  _hojaActual: number,
): Resultado[] {
  const v = norm(q.trim())
  if (!v) return []
  const out: Resultado[] = []

  // Aparatos: por designacion (K7, Q1, X5...). Aterrizan en su caja exacta.
  Object.entries(indice.indice).forEach(([tag, puntos]) => {
    const primero = puntos[0]
    if (primero && norm(tag).startsWith(v)) {
      out.push({
        clave: tag, detalle: `${puntos.length} puntos`, aparato: tag,
        blatt: primero.h, caja: primero.b,
      })
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
      if (k.endsWith(`:${v}`) && out.length < 40) {
        out.push({ clave: k, detalle: `borne · hoja ${dst.h}`, blatt: dst.h, caja: dst.tb })
      }
    })
  }

  // Rotulos: en el idioma que sea. Cada resultado lleva su hoja y su caja.
  for (const r of indice.busqueda) {
    if (norm(r.de).includes(v) || norm(r.es).includes(v)) {
      out.push({ clave: r.es, detalle: `${r.de} · hoja ${r.h}`, blatt: r.h, caja: r.b })
    }
    if (out.length >= 60) break
  }
  return out.slice(0, 60)
}

function Resultados({ items, onIr }: {
  items: Resultado[]
  onIr: (b: number, c?: number, caja?: Caja, aparato?: string) => void
}) {
  return (
    <>
      <Titulo>{items.length} resultado{items.length !== 1 ? 's' : ''}</Titulo>
      {!items.length && (
        <p className="m-0 text-[12px]" style={{ color: 'var(--lc-ink-ghost)' }}>
          Sin coincidencias. Prueba con una designación (K7, Q1) o una palabra
          del plano en alemán o castellano.
        </p>
      )}
      {items.map((r) => (
        <button key={`${r.clave}${r.detalle}`} type="button"
                onClick={() => onIr(r.blatt, r.col, r.caja, r.aparato)}
                className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:opacity-80">
          <b className="font-mono text-[12.5px]">{r.clave}</b>
          <span className="text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>{r.detalle}</span>
        </button>
      ))}
    </>
  )
}

/**
 * El cruce que cierra el circulo del modulo: los codigos SAP que la gente dejo
 * en las notas del aparato, resueltos contra el maestro de repuestos y el
 * stock de bodega. Veo la falla en el plano -> se que pedir y cuantos hay.
 */
function FichasSap({ notas }: { notas: ReturnType<typeof usePlanoNotas>['notas'] }) {
  const saps = useMemo(
    () => [...new Set(notas.map((n) => n.codigoSAP).filter((s): s is string => !!s))],
    [notas],
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
          <div key={f.sap} className="mb-3 rounded-lg border p-3"
               style={{ background: 'var(--lc-bg-panel)', borderColor: 'var(--lc-border)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold leading-snug">
                {f.nombre ?? 'SAP sin catalogar'}
              </span>
              <span className="shrink-0 font-mono text-[11px]" style={{ color: 'var(--lc-aqua-bright)' }}>
                {f.sap}
              </span>
            </div>
            {(f.marca || f.modeloTipo || f.codigoFabricante) && (
              <p className="m-0 mt-1 font-mono text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
                {[f.marca, f.modeloTipo, f.codigoFabricante].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {f.stockActual == null ? (
                <span className="rounded px-2 py-0.5 text-[10.5px]"
                      style={{ background: 'var(--lc-surface-hi)', color: 'var(--lc-ink-mid)' }}>
                  sin registro de bodega
                </span>
              ) : (
                <span className="rounded px-2 py-0.5 font-mono text-[11px] font-semibold"
                      style={sinStock
                        ? { background: 'var(--lc-danger-soft)', color: 'var(--lc-danger)' }
                        : bajo
                          ? { background: 'var(--lc-prep-soft)', color: 'var(--lc-prep)' }
                          : { background: 'var(--lc-nuevo-soft)', color: 'var(--lc-nuevo)' }}>
                  {f.stockActual} {f.unidad ?? 'un'} en bodega
                </span>
              )}
              {f.ubicacionBodega && (
                <span className="text-[10.5px]" style={{ color: 'var(--lc-ink-lo)' }}>{f.ubicacionBodega}</span>
              )}
              <Link to={`/repuestos?q=${encodeURIComponent(f.sap)}`}
                    className="ml-auto text-[11px] underline-offset-2 hover:underline"
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
    <h2 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--lc-ink-ghost)' }}>
      {children}
    </h2>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex h-[100dvh] items-center justify-center gap-2 text-[13px]"
         style={{ background: 'var(--lc-bg)', color: 'var(--lc-ink-mid)' }}>
      <Zap size={15} /> {texto}
    </div>
  )
}
