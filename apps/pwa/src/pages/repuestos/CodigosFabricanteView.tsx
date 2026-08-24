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
import { Link } from 'react-router-dom'
import { BookMarked, BookOpen, Check, CircleCheck, CirclePlus, Copy, Loader2, PackagePlus, ScanSearch, Search, Shapes } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Input } from '@/components/ui'
import { ShareInteractiveButton } from '@/components/visor3d/ShareInteractiveButton'
import { CATALOGOS, cargarCatalogos, type PiezaCatalogo } from './catalogosFabricante'
import { agruparPorCodigo, conRecuentoTotal, indexarGrupos } from './agruparPiezas'
import { buscarPiezas, norm } from './buscarCatalogo'
import { useRepuestosExistentes, normCodigo } from '@/hooks/repuestos/useRepuestosExistentes'
import { logger } from '@/lib/logger'

/**
 * Mapa código de fabricante → figura del despiece navegable.
 * Es el camino INVERSO del puente: el visor de planos ya lleva de una pieza a
 * `/repuestos?q=`, pero desde acá no se podía ver el DIBUJO. Se carga aparte
 * (~39 KB por máquina) en vez de leer los índices completos (~770 KB c/u).
 *
 * Son DOS máquinas: el archivo de la fileteadora ya se generaba (1.510
 * códigos) y nadie lo cargaba — el botón "Ver dibujo" solo aparecía para la
 * evisceradora aunque el dato de la otra estuviera ahí.
 */
const DESPIECES = [
  { slug: 'baader-142-despiece', archivo: 'despiece-142-figuras.json', maquina: 'BAADER 142' },
  { slug: 'baader-200-despiece', archivo: 'despiece-200-figuras.json', maquina: 'BAADER 200' },
]

/** Dónde vive un código dentro de un despiece. */
type EnDespiece = { hoja: number; fig: string; slug: string; maquina: string }

function useFigurasDespiece() {
  const [mapa, setMapa] = useState<Record<string, EnDespiece[]> | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all(
      DESPIECES.map(({ slug, archivo, maquina }) =>
        fetch(`${import.meta.env.BASE_URL}data/${archivo}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { codigos?: Record<string, [number, string]> } | null) =>
            Object.entries(d?.codigos ?? {}).map(
              ([cod, [hoja, fig]]) => [cod, { hoja, fig, slug, maquina }] as const,
            ))
          .catch(() => []),
      ),
    ).then((partes) => {
      if (!vivo) return
      // Un código puede estar en LAS DOS máquinas (220 lo están: tornillos,
      // arandelas). Se guardan todas sus ubicaciones y se muestra un botón por
      // máquina — quedarse con una sola mandaría al de la fileteadora al
      // dibujo de la evisceradora.
      const acc: Record<string, EnDespiece[]> = {}
      for (const [cod, donde] of partes.flat()) (acc[cod] ??= []).push(donde)
      setMapa(acc)
    })
    return () => {
      vivo = false
    }
  }, [])
  return mapa
}

/** Datos para prellenar la creación de un repuesto desde una pieza de catálogo. */
export interface CrearDesdeCatalogo {
  codigoFabricante: string
  textoBreve: string
  descripcion: string
  equipoNodeIds: string[]
  equipoCodigos: string[]
  equipoNombre: string
}

/** ¿Los dos textos dicen lo mismo? (sin acentos, espacios ni mayúsculas). */
const mismoTexto = (a: string, b: string) =>
  norm(a).replace(/\s+/g, ' ').trim() === norm(b).replace(/\s+/g, ' ').trim()

/** Tope de tarjetas en pantalla. Con el aviso de abajo, ya no esconde nada. */
const TOPE = 100

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

  // Reintento a mano: un catálogo puede fallar por un parpadeo de la señal y
  // quedaba fuera TODA la sesión — la vista pide los catálogos una sola vez al
  // montar. El aviso decía la verdad pero no ofrecía salida.
  const [intento, setIntento] = useState(0)
  const [faltantes, setFaltantes] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    // Progresivo: se pinta lo que va llegando en vez de esperar a los 6.
    cargarCatalogos((parcial, faltan) => {
      if (!alive) return
      setPiezas(parcial)
      // Decir CUÁLES faltan, no un "algo falló" genérico: si el técnico busca
      // una pieza de la GEA tiene que saber que ese catálogo no cargó, en vez
      // de creer que su código no existe.
      setFaltantes(faltan)
      setError(faltan.length ? `No cargó el catálogo de ${faltan.join(', ')}. El resto sí se puede buscar.` : null)
    })
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
  }, [publico, intento])

  // Índice del catálogo completo por (código, máquina): se calcula una vez y
  // sirve para contar en cuántos lugares va una pieza, sin importar la consulta.
  const indiceTodo = useMemo(() => (piezas ? indexarGrupos(piezas) : null), [piezas])

  const resultadosMemo = useMemo(() => {
    if (!piezas) return { lista: [], total: 0 }
    // La búsqueda vive en `buscarCatalogo.ts` (pura y testeada): acepta el
    // plural ("arandelas"), el vocabulario de planta ("golillas") y los códigos
    // cortos de la enzunchadora ("SW06"), que no entran por el camino numérico.
    const encontradas = buscarPiezas(piezas, query)
    // Agrupar ANTES del tope: `31800105` tenía 159 filas y el corte en 100 se
    // las comía todas con la misma pieza, escondiendo el resto de resultados.
    // Ahora el tope cuenta PIEZAS distintas, que es lo que el técnico mira.
    // Con el recuento del catálogo completo: "va en N lugares de la máquina"
    // no puede depender de lo que se haya escrito en el buscador.
    const todas = conRecuentoTotal(agruparPorCodigo(encontradas), indiceTodo)
    // El total viaja aparte para poder DECIR que se cortó: un listado de 100
    // sin aviso se lee como "esto es todo lo que hay".
    return { lista: todas.slice(0, TOPE), total: todas.length }
  }, [piezas, query, indiceTodo])
  const { lista, total } = resultadosMemo

  // ¿cuáles de los códigos en pantalla ya existen como repuesto en el maestro?
  // (requiere sesión: en modo invitado no se consulta)
  const { existentes } = useRepuestosExistentes(publico ? [] : lista.map((g) => g.rep.codigo))
  const figurasDespiece = useFigurasDespiece()

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
      <p className="mb-4 text-footnote text-muted-foreground">
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

      {error && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-500">
          {error}
          {faltantes.length > 0 && (
            <button type="button" onClick={() => setIntento((n) => n + 1)}
                    className="min-h-[44px] rounded-ctl border border-current px-3 text-footnote font-medium">
              Reintentar
            </button>
          )}
        </p>
      )}
      {!error && !piezas && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…</div>
      )}
      {piezas && query.trim().length >= 3 && total === 0 && (
        <p className="text-sm text-muted-foreground">Sin resultados en los catálogos ({piezas.length.toLocaleString('es-CL')} filas indexadas).</p>
      )}
      {piezas && query.trim().length < 3 && (
        <p className="text-footnote text-muted-foreground">
          {piezas.length.toLocaleString('es-CL')} filas de despiece indexadas · catálogos: {CATALOGOS.map((c) => c.maquina).join(', ')}.
        </p>
      )}
      {/* Cuántas piezas hay de verdad. Un listado cortado en 100 sin avisar se
          lee como "esto es todo": el técnico que no ve la suya cree que no
          está en el catálogo, cuando lo que falta es afinar la búsqueda. */}
      {total > 0 && (
        <p className="text-footnote text-muted-foreground">
          {total > TOPE
            ? `${TOPE} de ${total.toLocaleString('es-CL')} piezas — afiná la búsqueda para ver el resto.`
            : `${total} pieza${total === 1 ? '' : 's'}.`}
        </p>
      )}

      <div className="space-y-2">
        {lista.map((g, i) => {
          const p = g.rep
          // undefined = aún no verificado · null = no existe · objeto = ya creado
          const existe = existentes.get(normCodigo(p.codigo))
          return (
          <div key={`${p.codigo}-${p.maquina}-${i}`} className="rounded-card border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-foreground">{p.codigo}</span>
              {p.maquina && <span className="rounded-ctl bg-primary/10 px-1.5 py-0.5 text-caption font-medium text-primary">{p.maquina}</span>}
              <button onClick={() => copiar(p.codigo)} className="rounded-ctl p-0.5 text-muted-foreground hover:text-primary" title="Copiar código">
                {copiado === p.codigo ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {p.cantidad && <span className="rounded-ctl bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">×{p.cantidad} en el conjunto</span>}
              {/* Estado en el maestro: lo que falta sembrar se ve de un vistazo */}
              {existe === undefined ? null : existe ? (
                <span
                  className="inline-flex items-center gap-1 rounded-ctl bg-emerald-500/[0.15] px-1.5 py-0.5 text-caption font-medium text-ink-ok"
                  title={existe.textoBreve || 'Ya está en el maestro'}
                >
                  <CircleCheck className="h-3 w-3" />
                  {existe.codigoSAP ? `En repuestos · SAP ${existe.codigoSAP}` : 'En repuestos · sin SAP'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-ctl bg-amber-500/[0.15] px-1.5 py-0.5 text-caption font-medium text-ink-warn">
                  <CirclePlus className="h-3 w-3" /> No está en repuestos
                </span>
              )}
            </div>
            <div className="mt-1 text-footnote font-medium text-foreground">
              {p.descripcion?.trim()
                ? p.descripcion
                : /* 47 piezas de la BAADER 200 no traen nombre en el manual: la
                     tarjeta salía muda y parecía la app rota, no el catálogo. */
                  <span className="font-normal italic text-muted-foreground">El manual no le pone nombre</span>}
              {/* El original entre paréntesis solo si DICE algo distinto: 1.071
                  de 7.387 piezas (la TP-6000 y la MAREL EVISCERADO vienen solo
                  en inglés) mostraban el mismo texto dos veces seguidas. */}
              {p.descripcionEn && !mismoTexto(p.descripcion, p.descripcionEn) && (
                <span className="ml-1.5 text-footnote font-normal text-muted-foreground">({p.descripcionEn})</span>
              )}
            </div>
            {p.especificacion && <div className="font-mono text-footnote text-muted-foreground">{p.especificacion}</div>}
            {/* Códigos equivalentes: distribuidor local (envuelve al de fabricante) y SAP */}
            {(p.codigoProveedor || p.codigoSap) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {p.codigoProveedor && (
                  <button
                    onClick={() => copiar(p.codigoProveedor!)}
                    className="inline-flex items-center gap-1 rounded-ctl bg-primary/[0.15] px-1.5 py-0.5 font-mono text-caption font-medium text-ink-info hover:bg-primary/[0.15] dark:text-ink-info"
                    title={`Código ${p.proveedor || 'del distribuidor'} — clic para copiar`}
                  >
                    {p.proveedor || 'Distribuidor'}: {p.codigoProveedor}
                    {copiado === p.codigoProveedor ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
                {p.codigoSap && (
                  <button
                    onClick={() => copiar(p.codigoSap!)}
                    className="inline-flex items-center gap-1 rounded-ctl bg-cat-6-tint/[0.15] px-1.5 py-0.5 font-mono text-caption font-medium text-cat-6-ink hover:bg-cat-6-tint/[0.15] dark:text-cat-6-ink"
                    title="Código SAP ya creado para esta pieza — clic para copiar"
                  >
                    SAP: {p.codigoSap}
                    {copiado === p.codigoSap ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
              {g.esComun ? (
                /* Ferretería: va en tantos lugares que la figura no identifica
                   nada. Decirlo es más útil que listar 159 ubicaciones. */
                <span className="inline-flex items-center gap-1">
                  <BookMarked className="h-3 w-3" /> Pieza común · va en {g.apariciones.length} lugares de la máquina
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1"><BookMarked className="h-3 w-3" /> {p.conjunto || 'conjunto s/n'}</span>
                  <span>pág. {p.pagina}{p.posicion ? ` · pos. ${p.posicion}` : ''}</span>
                  {g.apariciones.length > 1 && (
                    <span title={g.apariciones.map((a) => `${a.conjunto || 's/n'} · pág. ${a.pagina}`).join(' | ')}>
                      y en {g.apariciones.length - 1} lugar{g.apariciones.length > 2 ? 'es' : ''} más
                    </span>
                  )}
                </>
              )}
              <span className="min-w-0 truncate" title={p.fuente}>{p.fuente}</span>
            </div>
            {/* Acciones: abrir el PDF del manual en la página exacta + sembrar el maestro */}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
              {/* Camino inverso del puente: si esta pieza tiene dibujo en el
                  despiece navegable, se va derecho a su figura explotada. */}
              {(() => {
                const enDespiece = figurasDespiece?.[p.codigo]
                if (!enDespiece?.length) return null
                // Con una sola máquina el botón no la nombra (sería ruido);
                // con dos hay que decir cuál es cuál.
                const varias = enDespiece.length > 1
                return enDespiece.map((d) => (
                  <Link
                    key={d.slug}
                    to={`/aprendizaje/planos/${d.slug}?hoja=${d.hoja}&ap=${encodeURIComponent(p.codigo)}`}
                    className="inline-flex items-center gap-1 rounded-ctl border border-primary/40 bg-primary/[0.08] px-2 py-1 text-caption font-medium text-ink-info transition hover:bg-primary/[0.15]"
                    title={`Ver el dibujo explotado en la ${d.maquina} (figura ${d.fig})`}
                  >
                    <Shapes className="h-3.5 w-3.5" />
                    {varias ? `${d.maquina} · fig. ${d.fig}` : `Ver dibujo · fig. ${d.fig}`}
                  </Link>
                ))
              })()}
              {p.manualId && manualUrls[p.manualId] && (
                <a
                  href={`${manualUrls[p.manualId]}#page=${p.pagina}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-ctl border border-border px-2 py-1 text-caption font-medium text-foreground transition hover:bg-muted hover:text-primary"
                  title={`Abrir ${p.fuente} en la página ${p.pagina}`}
                >
                  <BookOpen className="h-3.5 w-3.5" /> Ver manual · pág. {p.pagina}
                </a>
              )}
              {/* Ya creado → ir a verlo. No creado → sembrarlo prellenado. */}
              {existe && onBuscarEnRepuestos ? (
                <button
                  onClick={() => onBuscarEnRepuestos(existe.codigoSAP || p.codigo)}
                  className="inline-flex items-center gap-1 rounded-ctl border border-border px-2 py-1 text-caption font-medium text-foreground transition hover:bg-muted hover:text-primary"
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
                  className="inline-flex items-center gap-1 rounded-ctl border border-primary/40 bg-primary/5 px-2 py-1 text-caption font-medium text-primary transition hover:bg-primary/10"
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
