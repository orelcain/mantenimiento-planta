/**
 * CodigosFabricanteView — Buscador de códigos de fabricante (despieces oficiales).
 *
 * Busca en los catálogos de repuestos del fabricante extraídos de los manuales
 * (JSON estático en /data/codigos-fabricante/, lazy-fetch al abrir la pestaña).
 * Caso de uso: en terreno se fotografía un código grabado en una pieza
 * (ej. "GEA 3000544810") → acá se resuelve qué pieza es, a qué conjunto
 * pertenece y en qué página de qué manual está — aunque nadie la haya creado
 * aún como repuesto en el maestro.
 *
 * Catálogos disponibles: GEA termoformadora, Baader 142 (EK 2014), Baader 200,
 * Marel Eviscerado y Marel Filete. Para sumar otra máquina: generar su JSON
 * con el mismo esquema y agregarlo a CATALOGOS.
 */
import { useEffect, useMemo, useState } from 'react'
import { BookMarked, Check, Copy, Loader2, ScanSearch, Search } from 'lucide-react'
import { Input } from '@/components/ui'
import { logger } from '@/lib/logger'

interface PiezaCatalogo {
  codigo: string
  descripcion: string
  descripcionEn: string
  especificacion: string
  cantidad: string
  posicion: string
  conjunto: string
  pagina: number
  fuente: string
  /** Máquina dueña del catálogo (se estampa al cargar, del header del JSON). */
  maquina?: string
}

interface CatalogoFabricante {
  maquina: string
  sap?: string
  piezas: PiezaCatalogo[]
}

/** Catálogos publicados (public/data/codigos-fabricante/). */
const CATALOGOS = [
  { id: 'gea', url: '/data/codigos-fabricante/gea-termoformadora.json', maquina: 'TERMOFORMADORA GEA' },
  { id: 'baader-142', url: '/data/codigos-fabricante/baader-142.json', maquina: 'BAADER 142' },
  { id: 'baader-200', url: '/data/codigos-fabricante/baader-200.json', maquina: 'BAADER 200' },
  { id: 'marel-eviscerado', url: '/data/codigos-fabricante/marel-eviscerado.json', maquina: 'MAREL EVISCERADO' },
  { id: 'marel-filete', url: '/data/codigos-fabricante/marel-filete.json', maquina: 'MAREL FILETE' },
]

// Cache de módulo: el JSON (~2 MB) se baja una sola vez por sesión.
let _cache: PiezaCatalogo[] | null = null
let _cachePromise: Promise<PiezaCatalogo[]> | null = null

async function cargarCatalogos(): Promise<PiezaCatalogo[]> {
  if (_cache) return _cache
  if (!_cachePromise) {
    _cachePromise = Promise.all(
      CATALOGOS.map(async (c) => {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '')
        const res = await fetch(`${base}${c.url}`)
        if (!res.ok) throw new Error(`catálogo ${c.id}: HTTP ${res.status}`)
        const data = (await res.json()) as CatalogoFabricante
        return (data.piezas || []).map((p) => ({ ...p, maquina: data.maquina }))
      }),
    ).then((listas) => {
      _cache = listas.flat()
      return _cache
    }).catch((e) => { _cachePromise = null; throw e })
  }
  return _cachePromise
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function CodigosFabricanteView({ onBuscarEnRepuestos }: { onBuscarEnRepuestos?: (codigo: string) => void }) {
  const [piezas, setPiezas] = useState<PiezaCatalogo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    cargarCatalogos()
      .then((p) => { if (alive) setPiezas(p) })
      .catch((e) => {
        if (alive) setError('No se pudo cargar el catálogo de códigos.')
        logger.error('Error cargando catálogos de fabricante', e instanceof Error ? e : new Error(String(e)))
      })
    return () => { alive = false }
  }, [])

  const resultados = useMemo(() => {
    if (!piezas) return []
    const q = norm(query.trim())
    if (q.length < 3) return []
    // Si la consulta trae una secuencia numérica larga se busca como código,
    // tolerando prefijos ("GEA 3000544810" viene grabado así en la pieza).
    const soloDigitos = q.replace(/[^0-9]/g, '')
    const esNumerico = soloDigitos.length >= 4
    const terms = q.split(/\s+/).filter((t) => t.length >= 2)
    const scored: { p: PiezaCatalogo; score: number }[] = []
    for (const p of piezas) {
      let score = 0
      if (esNumerico) {
        if (p.codigo === soloDigitos) score = 100
        else if (p.codigo.startsWith(soloDigitos)) score = 60
        else if (p.codigo.includes(soloDigitos)) score = 30
      } else if (terms.length) {
        const blob = norm(`${p.descripcion} ${p.descripcionEn} ${p.conjunto} ${p.especificacion}`)
        const hits = terms.filter((t) => blob.includes(t)).length
        if (hits === terms.length) score = 20 + hits
      }
      if (score > 0) scored.push({ p, score })
    }
    scored.sort((a, b) => b.score - a.score || a.p.pagina - b.p.pagina)
    return scored.slice(0, 100).map((s) => s.p)
  }, [piezas, query])

  const copiar = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(codigo)
      setTimeout(() => setCopiado(null), 1500)
    }).catch(() => {})
  }

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <ScanSearch className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Códigos de fabricante</h1>
      </div>
      <p className="mb-4 text-[12.5px] text-muted-foreground">
        Despieces oficiales extraídos de los manuales. Escribe el código grabado en la pieza
        (ej. <span className="font-mono">3000544810</span>) o palabras de la descripción
        (ej. <span className="italic">placa cobertora</span>).
      </p>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Código o descripción…"
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {!error && !piezas && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…</div>
      )}
      {piezas && query.trim().length >= 3 && resultados.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin resultados en los catálogos ({piezas.length.toLocaleString('es-CL')} filas indexadas).</p>
      )}
      {piezas && query.trim().length < 3 && (
        <p className="text-[12px] text-muted-foreground/70">
          {piezas.length.toLocaleString('es-CL')} filas de despiece indexadas · catálogos: {CATALOGOS.map((c) => c.maquina).join(', ')}.
        </p>
      )}

      <div className="space-y-2">
        {resultados.map((p, i) => (
          <div key={`${p.codigo}-${p.fuente}-${p.pagina}-${i}`} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-foreground">{p.codigo}</span>
              {p.maquina && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{p.maquina}</span>}
              <button onClick={() => copiar(p.codigo)} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Copiar código">
                {copiado === p.codigo ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {p.cantidad && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">×{p.cantidad} en el conjunto</span>}
              {onBuscarEnRepuestos && (
                <button
                  onClick={() => onBuscarEnRepuestos(p.codigo)}
                  className="ml-auto text-[11px] text-primary hover:underline"
                  title="Ver si ya existe como repuesto en el maestro"
                >
                  ¿Existe en repuestos?
                </button>
              )}
            </div>
            <div className="mt-1 text-[13px] font-medium text-foreground">
              {p.descripcion}
              {p.descripcionEn && <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">({p.descripcionEn})</span>}
            </div>
            {p.especificacion && <div className="font-mono text-[11.5px] text-muted-foreground">{p.especificacion}</div>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><BookMarked className="h-3 w-3" /> {p.conjunto || 'conjunto s/n'}</span>
              <span>pág. {p.pagina}{p.posicion ? ` · pos. ${p.posicion}` : ''}</span>
              <span className="min-w-0 truncate" title={p.fuente}>{p.fuente}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
