import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, Zap } from 'lucide-react'
import { PLANOS, planoPorSlug } from '@/data/planos'
import { usePlano, type Caja, type PlanoRotulo } from '@/hooks/usePlano'
import { usePlanoNotas } from '@/hooks/usePlanoNotas'
import { PlanoLienzo, type Foco } from '@/components/planos/PlanoLienzo'
import { NotasAparato } from '@/components/planos/NotasAparato'

type Seleccion =
  | { tipo: 'aparato'; tag: string }
  | { tipo: 'salto'; t: string; h: number; c: number }
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
  const { indice, hoja, abrir, error } = usePlano(slug)
  const notas = usePlanoNotas(slug)
  const [sel, setSel] = useState<Seleccion>(null)
  const [foco, setFoco] = useState<Foco>(null)
  const [mostrarEs, setMostrarEs] = useState(false)
  const [busca, setBusca] = useState('')

  const meta = useMemo(
    () => indice?.hojas.find((h) => h.blatt === hoja?.blatt) ?? null,
    [indice, hoja],
  )

  const irA = useCallback(
    async (blatt: number, col?: number, caja?: Caja) => {
      setFoco(caja ? { tipo: 'caja', b: caja } : col != null ? { tipo: 'columna', c: col } : null)
      await abrir(blatt)
    },
    [abrir],
  )

  const notasDe = useCallback((tag: string) => notas.notasDe('aparato', tag).length, [notas])

  // Pasar hoja con las flechas, como en un manual de papel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!indice || !hoja) return
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      const i = indice.hojas.findIndex((h) => h.blatt === hoja.blatt)
      const anterior = indice.hojas[i - 1]
      const siguiente = indice.hojas[i + 1]
      if (e.key === 'ArrowLeft' && anterior) void irA(anterior.blatt)
      if (e.key === 'ArrowRight' && siguiente) void irA(siguiente.blatt)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [indice, hoja, irA])

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

  return (
    // Altura del viewport, NO h-full: esta ruta se monta directo bajo #root, sin
    // layout que acote la altura, así que con h-full el cuerpo crecía hasta los
    // 2.250 px del índice de 44 hojas y el dibujo quedaba centrado fuera de la
    // pantalla. dvh además descuenta la barra del navegador en el teléfono.
    <div className="flex h-[100dvh] flex-col" style={{ background: 'var(--lc-bg)', color: 'var(--lc-ink)' }}>
      {/* riel superior */}
      <header className="flex flex-wrap items-center gap-3 border-b px-3 py-2"
              style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
        <Link to="/aprendizaje/planos" className="flex flex-col leading-tight no-underline" style={{ color: 'inherit' }}>
          <span className="text-[13px] font-semibold">{cat?.maquina ?? indice.maquina}</span>
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
            {indice.plano} · {indice.rev}
          </span>
        </Link>

        <div className="relative min-w-[180px] flex-1 md:max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--lc-ink-ghost)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} type="search"
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

        <div className="flex items-center gap-1 font-mono text-[12px]">
          <button type="button" disabled={!anterior} onClick={() => anterior && void irA(anterior.blatt)}
                  className="rounded p-1 disabled:opacity-30" title="Hoja anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums">{hoja.blatt} / {indice.hojasTotales}</span>
          <button type="button" disabled={!siguiente}
                  onClick={() => siguiente && void irA(siguiente.blatt)}
                  className="rounded p-1 disabled:opacity-30" title="Hoja siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* índice de hojas */}
        <nav className="hidden w-52 shrink-0 overflow-y-auto border-r p-2 md:block"
             style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
          {(['circuitos', 'bornes'] as const).map((sec) => (
            <section key={sec}>
              <h2 className="sticky top-0 m-0 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: 'var(--lc-surface)', color: 'var(--lc-ink-ghost)' }}>
                {sec === 'circuitos' ? 'Esquema de circuitos' : 'Plano de bornes'}
              </h2>
              {indice.hojas.filter((h) => h.seccion === sec).map((h) => (
                <button key={h.blatt} type="button" onClick={() => void irA(h.blatt)}
                        aria-current={h.blatt === hoja.blatt}
                        className="mb-0.5 block w-full rounded-md border px-2 py-1.5 text-left"
                        style={h.blatt === hoja.blatt
                          ? { background: 'var(--lc-aqua-soft)', borderColor: 'var(--lc-aqua)' }
                          : { borderColor: 'transparent' }}>
                  <span className="block font-mono text-[11.5px]" style={{ color: 'var(--lc-aqua-bright)' }}>
                    Hoja {h.blatt}
                  </span>
                  <span className="block text-[10.5px] leading-snug" style={{ color: 'var(--lc-ink-mid)' }}>
                    {mostrarEs ? h.tituloEs : h.titulo}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <main className="relative min-w-0 flex-1">
          <PlanoLienzo
            hoja={hoja.datos} meta={meta} mostrarEs={mostrarEs} notasDe={notasDe} foco={foco}
            onSalto={(h, c) => { setSel({ tipo: 'salto', t: `/${h}.${c}`, h, c }); void irA(h, c) }}
            onAparato={(tag) => { setSel({ tipo: 'aparato', tag }); setFoco(null) }}
            onRotulo={(r) => { setSel({ tipo: 'rotulo', r }); setFoco(null) }}
            onFondo={() => setSel(null)}
          />
        </main>

        <aside className="w-72 shrink-0 overflow-y-auto border-l p-3"
               style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
          {busca.trim()
            ? <Resultados items={resultados}
                onIr={(b, c, caja, aparato) => {
                  if (aparato) setSel({ tipo: 'aparato', tag: aparato })
                  // Elegir un resultado cierra la busqueda: si no, el panel se
                  // quedaba en la lista y la ficha del aparato no se veia.
                  setBusca('')
                  void irA(b, c, caja)
                }} />
            : <Panel sel={sel} indice={indice} hojaActual={hoja.blatt} notas={notas} onIr={irA} />}
        </aside>
      </div>
    </div>
  )
}

/* ────────────────────────────── panel ────────────────────────────── */

function Panel({ sel, indice, hojaActual, notas, onIr }: {
  sel: Seleccion
  indice: NonNullable<ReturnType<typeof usePlano>['indice']>
  hojaActual: number
  notas: ReturnType<typeof usePlanoNotas>
  onIr: (b: number, c?: number, caja?: Caja) => void
}) {
  if (!sel) {
    return (
      <>
        <Titulo>Cómo se usa</Titulo>
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: 'var(--lc-ink-mid)' }}>
          Toca cualquier marca de color sobre el plano.
          <br /><br />
          <b style={{ color: 'var(--lc-nuevo)' }}>Verde</b> — salto a otra hoja: te lleva y marca dónde caíste.
          <br />
          <b style={{ color: 'var(--lc-aqua-bright)' }}>Azul</b> — aparato: te lista todas las hojas donde
          aparece, y ahí puedes dejarle una nota o una foto.
          <br />
          <b style={{ color: 'var(--lc-prep)' }}>Ámbar</b> — rótulo en otro idioma con su traducción.
        </p>
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
  return (
    <>
      <Titulo>Aparato</Titulo>
      <p className="m-0 font-mono text-[17px] font-semibold" style={{ color: 'var(--lc-aqua-bright)' }}>
        {sel.tag}
      </p>
      <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--lc-ink-mid)' }}>
        Aparece en {puntos.length} punto{puntos.length !== 1 ? 's' : ''} del plano.
      </p>
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
