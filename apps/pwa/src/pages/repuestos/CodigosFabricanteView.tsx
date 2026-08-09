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
 * Marel Eviscerado, Marel Filete y Enzunchadora TP-6000. Para sumar otra máquina:
 * generar su JSON con el mismo esquema y agregarlo a CATALOGOS.
 *
 * Códigos de distribuidor: las empresas que revenden equipos (ej. GARIBALDI para
 * las enzunchadoras TRANSPAK) usan códigos propios que ENVUELVEN el código del
 * fabricante (29123 + T612025022 = prefijo + "T6-1-20250" sin guiones + sufijo).
 * Por eso el buscador también matchea por contención alfanumérica y expone
 * codigoProveedor / codigoSap cuando el catálogo los trae.
 */
import { useEffect, useMemo, useState } from 'react'
import { BookMarked, BookOpen, Check, CircleCheck, CirclePlus, Copy, Loader2, PackagePlus, ScanSearch, Search } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Input } from '@/components/ui'
import { ShareInteractiveButton } from '@/components/visor3d/ShareInteractiveButton'
import { APP_VERSION } from '@/constants'
import { useRepuestosExistentes, normCodigo } from '@/hooks/repuestos/useRepuestosExistentes'
import { logger } from '@/lib/logger'

/** Datos para prellenar la creación de un repuesto desde una pieza de catálogo. */
export interface CrearDesdeCatalogo {
  codigoFabricante: string
  textoBreve: string
  descripcion: string
  equipoNodeIds: string[]
  equipoCodigos: string[]
  equipoNombre: string
}

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
  /** Campos estampados al cargar desde el header del catálogo: */
  maquina?: string
  equipoNodeIds?: string[]
  equipoCodigos?: string[]
  equipoNombre?: string
  /** Id del manual en la colección `manuales` (si el PDF está subido a la app). */
  manualId?: string
  /** Código del distribuidor local (envuelve al código de fabricante) y su empresa. */
  codigoProveedor?: string
  proveedor?: string
  /** Código SAP ya creado para esta pieza (cruzado desde el maestro del proveedor). */
  codigoSap?: string
}

interface CatalogoFabricante {
  maquina: string
  sap?: string
  equipoNodeIds?: string[]
  equipoCodigos?: string[]
  equipoNombre?: string
  manualPorFuente?: Record<string, string>
  piezas: PiezaCatalogo[]
}

/** Catálogos publicados (public/data/codigos-fabricante/). */
const CATALOGOS = [
  { id: 'gea', url: '/data/codigos-fabricante/gea-termoformadora.json', maquina: 'TERMOFORMADORA GEA' },
  { id: 'baader-142', url: '/data/codigos-fabricante/baader-142.json', maquina: 'BAADER 142' },
  { id: 'baader-200', url: '/data/codigos-fabricante/baader-200.json', maquina: 'BAADER 200' },
  { id: 'marel-eviscerado', url: '/data/codigos-fabricante/marel-eviscerado.json', maquina: 'MAREL EVISCERADO' },
  { id: 'marel-filete', url: '/data/codigos-fabricante/marel-filete.json', maquina: 'MAREL FILETE' },
  { id: 'enzunchadora-tp6000', url: '/data/codigos-fabricante/enzunchadora-tp6000.json', maquina: 'ENZUNCHADORA TP-6000' },
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
        // ?v=<versión> evita que el navegador sirva un JSON viejo cacheado
        // (GitHub Pages manda Cache-Control max-age=600): al subir la versión,
        // la URL cambia y se baja el catálogo fresco tras cada deploy.
        const res = await fetch(`${base}${c.url}?v=${APP_VERSION}`)
        if (!res.ok) throw new Error(`catálogo ${c.id}: HTTP ${res.status}`)
        const data = (await res.json()) as CatalogoFabricante
        const manualPorFuente = data.manualPorFuente || {}
        return (data.piezas || []).map((p) => ({
          ...p,
          maquina: data.maquina,
          equipoNodeIds: data.equipoNodeIds || [],
          equipoCodigos: data.equipoCodigos || [],
          equipoNombre: data.equipoNombre || '',
          manualId: manualPorFuente[p.fuente],
        }))
      }),
    ).then((listas) => {
      _cache = listas.flat()
      return _cache
    }).catch((e) => { _cachePromise = null; throw e })
  }
  return _cachePromise
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

interface CodigosFabricanteViewProps {
  /** Salta a la pestaña Áreas con este código pre-buscado ("¿Existe en repuestos?"). */
  onBuscarEnRepuestos?: (codigo: string) => void
  /** Salta a Áreas y abre el form de crear repuesto prellenado desde el catálogo. */
  onCrearRepuesto?: (data: CrearDesdeCatalogo) => void
  /**
   * Modo invitado (ruta pública /catalogo, sin sesión): solo buscar códigos.
   * Los catálogos son archivos estáticos ya públicos, así que no hace falta
   * Firestore — y se OMITE a propósito todo lo que sí lo necesita: el enlace al
   * PDF del manual (documento del fabricante, solo para gente logueada) y el
   * cruce contra el maestro. Sin esto, un invitado dispararía lecturas que las
   * reglas rechazan.
   */
  publico?: boolean
}

export function CodigosFabricanteView({ onBuscarEnRepuestos, onCrearRepuesto, publico = false }: CodigosFabricanteViewProps) {
  const [piezas, setPiezas] = useState<PiezaCatalogo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  // Mapa manualId → URL del PDF (colección `manuales`), para el enlace "Ver manual".
  const [manualUrls, setManualUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    cargarCatalogos()
      .then((p) => { if (alive) setPiezas(p) })
      .catch((e) => {
        if (alive) setError('No se pudo cargar el catálogo de códigos.')
        logger.error('Error cargando catálogos de fabricante', e instanceof Error ? e : new Error(String(e)))
      })
    // Una sola lectura de `manuales` (colección chica) para resolver los PDF
    // subidos. En modo invitado se omite: las reglas la rechazan y los manuales
    // del fabricante no se publican.
    if (!publico) {
      getDocs(collection(db, 'manuales'))
        .then((snap) => {
          if (!alive) return
          const m: Record<string, string> = {}
          snap.forEach((d) => { const u = d.data().url; if (u) m[d.id] = u })
          setManualUrls(m)
        })
        .catch((e) => logger.warn('No se pudieron cargar URLs de manuales', { error: e instanceof Error ? e.message : String(e) }))
    }
    return () => { alive = false }
  }, [publico])

  const resultados = useMemo(() => {
    if (!piezas) return []
    const q = norm(query.trim())
    if (q.length < 3) return []
    // Si la consulta trae una secuencia numérica larga se busca como código,
    // tolerando prefijos ("GEA 3000544810" viene grabado así en la pieza).
    // También se compara sin separadores ("T6-1-20250" ↔ "T6120250") para que
    // el código del distribuidor (29123T612025022, que envuelve al del
    // fabricante) y el código con/sin guiones encuentren la misma pieza.
    const soloDigitos = q.replace(/[^0-9]/g, '')
    const alnumQ = q.replace(/[^A-Z0-9]/g, '')
    const esNumerico = soloDigitos.length >= 4
    const terms = q.split(/\s+/).filter((t) => t.length >= 2)
    const scored: { p: PiezaCatalogo; score: number }[] = []
    for (const p of piezas) {
      let score = 0
      if (esNumerico) {
        const alnumCod = norm(p.codigo).replace(/[^A-Z0-9]/g, '')
        const alnumProv = p.codigoProveedor ? norm(p.codigoProveedor).replace(/[^A-Z0-9]/g, '') : ''
        if (p.codigo === soloDigitos || alnumCod === alnumQ) score = 100
        else if (alnumProv === alnumQ || p.codigoSap === soloDigitos) score = 90
        else if (p.codigo.startsWith(soloDigitos) || alnumCod.startsWith(alnumQ)) score = 60
        else if (alnumCod.length >= 5 && alnumQ.includes(alnumCod)) score = 40
        else if (p.codigo.includes(soloDigitos) || (alnumProv && alnumProv.includes(alnumQ))) score = 30
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

  // ¿cuáles de los códigos en pantalla ya existen como repuesto en el maestro?
  // (requiere sesión: en modo invitado no se consulta)
  const { existentes } = useRepuestosExistentes(publico ? [] : resultados.map((p) => p.codigo))

  const copiar = (codigo: string) => {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(codigo)
      setTimeout(() => setCopiado(null), 1500)
    }).catch(() => {})
  }

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        {!publico && <ScanSearch className="h-5 w-5 shrink-0 text-primary" />}
        {!publico && <h1 className="text-lg font-bold text-foreground">Códigos de fabricante</h1>}
        {/* Compartir con bodega: link fijo + QR a la vista pública de solo lectura */}
        {!publico && (
          <ShareInteractiveButton
            className="ml-auto"
            url={`${window.location.origin}${import.meta.env.BASE_URL}catalogo`}
            title="Códigos de fabricante"
            description="Buscador de los despieces oficiales de las máquinas de planta (solo lectura)."
          />
        )}
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
        {resultados.map((p, i) => {
          // undefined = aún no verificado · null = no existe · objeto = ya creado
          const existe = existentes.get(normCodigo(p.codigo))
          return (
          <div key={`${p.codigo}-${p.fuente}-${p.pagina}-${i}`} className="rounded-card border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-foreground">{p.codigo}</span>
              {p.maquina && <span className="rounded-ctl bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{p.maquina}</span>}
              <button onClick={() => copiar(p.codigo)} className="rounded-ctl p-0.5 text-muted-foreground hover:text-primary" title="Copiar código">
                {copiado === p.codigo ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {p.cantidad && <span className="rounded-ctl bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">×{p.cantidad} en el conjunto</span>}
              {/* Estado en el maestro: lo que falta sembrar se ve de un vistazo */}
              {existe === undefined ? null : existe ? (
                <span
                  className="inline-flex items-center gap-1 rounded-ctl bg-emerald-500/[0.15] px-1.5 py-0.5 text-[10px] font-medium text-emerald-600"
                  title={existe.textoBreve || 'Ya está en el maestro'}
                >
                  <CircleCheck className="h-3 w-3" />
                  {existe.codigoSAP ? `En repuestos · SAP ${existe.codigoSAP}` : 'En repuestos · sin SAP'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-ctl bg-amber-500/[0.15] px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                  <CirclePlus className="h-3 w-3" /> No está en repuestos
                </span>
              )}
            </div>
            <div className="mt-1 text-[13px] font-medium text-foreground">
              {p.descripcion}
              {p.descripcionEn && <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">({p.descripcionEn})</span>}
            </div>
            {p.especificacion && <div className="font-mono text-[11.5px] text-muted-foreground">{p.especificacion}</div>}
            {/* Códigos equivalentes: distribuidor local (envuelve al de fabricante) y SAP */}
            {(p.codigoProveedor || p.codigoSap) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {p.codigoProveedor && (
                  <button
                    onClick={() => copiar(p.codigoProveedor!)}
                    className="inline-flex items-center gap-1 rounded-ctl bg-primary/[0.15] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-sky-600 hover:bg-primary/[0.15] dark:text-sky-400"
                    title={`Código ${p.proveedor || 'del distribuidor'} — clic para copiar`}
                  >
                    {p.proveedor || 'Distribuidor'}: {p.codigoProveedor}
                    {copiado === p.codigoProveedor ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
                {p.codigoSap && (
                  <button
                    onClick={() => copiar(p.codigoSap!)}
                    className="inline-flex items-center gap-1 rounded-ctl bg-cat-6-tint/[0.15] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-violet-600 hover:bg-cat-6-tint/[0.15] dark:text-violet-400"
                    title="Código SAP ya creado para esta pieza — clic para copiar"
                  >
                    SAP: {p.codigoSap}
                    {copiado === p.codigoSap ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><BookMarked className="h-3 w-3" /> {p.conjunto || 'conjunto s/n'}</span>
              <span>pág. {p.pagina}{p.posicion ? ` · pos. ${p.posicion}` : ''}</span>
              <span className="min-w-0 truncate" title={p.fuente}>{p.fuente}</span>
            </div>
            {/* Acciones: abrir el PDF del manual en la página exacta + sembrar el maestro */}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
              {p.manualId && manualUrls[p.manualId] && (
                <a
                  href={`${manualUrls[p.manualId]}#page=${p.pagina}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-ctl border border-border px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted hover:text-primary"
                  title={`Abrir ${p.fuente} en la página ${p.pagina}`}
                >
                  <BookOpen className="h-3.5 w-3.5" /> Ver manual · pág. {p.pagina}
                </a>
              )}
              {/* Ya creado → ir a verlo. No creado → sembrarlo prellenado. */}
              {existe && onBuscarEnRepuestos ? (
                <button
                  onClick={() => onBuscarEnRepuestos(existe.codigoSAP || p.codigo)}
                  className="inline-flex items-center gap-1 rounded-ctl border border-border px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted hover:text-primary"
                  title={existe.textoBreve || 'Abrir en Áreas'}
                >
                  <PackagePlus className="h-3.5 w-3.5" /> Ver repuesto
                </button>
              ) : !existe && onCrearRepuesto ? (
                <button
                  onClick={() => onCrearRepuesto({
                    codigoFabricante: p.codigo,
                    textoBreve: p.descripcion || p.descripcionEn || p.codigo,
                    descripcion: [p.descripcionEn, p.especificacion, p.conjunto ? `Conjunto: ${p.conjunto}` : '', `Manual: ${p.fuente} pág. ${p.pagina}`].filter(Boolean).join(' · '),
                    equipoNodeIds: p.equipoNodeIds || [],
                    equipoCodigos: p.equipoCodigos || [],
                    equipoNombre: p.equipoNombre || '',
                  })}
                  className="inline-flex items-center gap-1 rounded-ctl border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/10"
                  title="Crear este repuesto en el maestro, prellenado"
                >
                  <PackagePlus className="h-3.5 w-3.5" /> Agregar a repuestos
                </button>
              ) : null}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
