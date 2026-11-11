/**
 * Buscador rápido (Ctrl+K / ⌘K): índice y ranking, sin React ni Firestore.
 *
 * Todo lo que se busca ya está en memoria o se calcula:
 *   · Equipos: el store `equipment` que MainLayout carga al iniciar (0 lecturas extra).
 *   · Repuestos: el índice `repuestosIndice/sap` (1 documento, se lee al abrir el buscador).
 *   · Fichas: catálogo estático del Centro de Aprendizaje.
 *   · Turnos: se calculan por fecha con el reloj de Mantención.
 *   · Páginas: los ítems del menú que el usuario ya puede ver.
 */
import type { TurnoMantencion } from '@/services/bitacora/bitacora.types'
import {
  turnoMantencionEn,
  turnoAdyacente,
  turnoDesdeId,
  etiquetaTurno,
  horarioTurno,
} from '@/services/bitacora/turnoMantencion'

export type TipoResultado = 'equipo' | 'repuesto' | 'ficha' | 'turno' | 'pagina'

export interface Acceso {
  etiqueta: string
  href: string
}

export interface ItemBuscador {
  /** Único entre todos los tipos: `equipo:<id>`, `repuesto:<sap>`… */
  id: string
  tipo: TipoResultado
  titulo: string
  /** Código SAP del equipo o del repuesto. */
  codigo?: string
  /** Segunda línea: ubicación, área o fecha. */
  detalle?: string
  /** Lo que se abre con Enter. */
  href: string
  /** Accesos del expediente (el primero repite `href`). */
  accesos?: Acceso[]
  /** Palabras extra que también encuentran el ítem («hoy», «ayer», nombre común…). */
  claves?: string
}

export const ORDEN_GRUPOS: TipoResultado[] = ['equipo', 'repuesto', 'ficha', 'turno', 'pagina']

export const NOMBRE_GRUPO: Record<TipoResultado, string> = {
  equipo: 'Equipos',
  repuesto: 'Repuestos',
  ficha: 'Centro de Aprendizaje',
  turno: 'Bitácora',
  pagina: 'Páginas',
}

/** Minúsculas, sin tildes, sin signos; deja letras, dígitos y espacios simples. */
export function normBuscador(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/**
 * «EVISCERADORA BAADER 142 N2» → «Evisceradora Baader 142 N2».
 * Las palabras con dígitos (N2, 6205, M/950-P) y las siglas cortas quedan como vienen.
 */
export function tituloLegible(s: string): string {
  const limpio = s.trim().replace(/\s+/g, ' ')
  if (limpio !== limpio.toUpperCase()) return limpio
  return limpio
    .split(' ')
    .map((p, i) => {
      // Siglas sin vocales (SKF, PLC) y palabras con dígitos quedan como vienen; «YAL» pasa a «Yal».
      if (/\d/.test(p) || (i > 0 && p.length <= 4 && !/[AEIOU]/.test(p))) return p
      const l = p.toLowerCase()
      return i === 0 ? l.charAt(0).toUpperCase() + l.slice(1) : MINUSCULAS.has(p) ? l : l.charAt(0).toUpperCase() + l.slice(1)
    })
    .join(' ')
}
const MINUSCULAS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'CON', 'PARA', 'POR', 'A'])

// ── Ranking ──────────────────────────────────────────────────────────────────

interface Indexado {
  item: ItemBuscador
  titulo: string
  codigo: string
  resto: string
  palabras: string[]
}

export function indexar(items: ItemBuscador[]): Indexado[] {
  return items.map((item) => {
    const titulo = normBuscador(item.titulo)
    const codigo = normBuscador(item.codigo ?? '')
    const resto = normBuscador(`${item.detalle ?? ''} ${item.claves ?? ''}`)
    return { item, titulo, codigo, resto, palabras: `${titulo} ${codigo} ${resto}`.split(' ').filter(Boolean) }
  })
}

/**
 * Puntaje de un ítem para una consulta ya normalizada. 0 = no aparece.
 *   1000 código exacto · 800 código que empieza con la consulta (≥3 dígitos)
 *    600 título exacto ·  500 título que empieza con la consulta
 *    300 título que contiene la consulta entera
 *    100 todas las palabras están (en título, código, detalle o claves)
 *        + 15 por palabra que está en el título y +10 por palabra que inicia una palabra
 */
export function puntuar(ix: Indexado, consulta: string): number {
  if (!consulta) return 0
  const tokens = consulta.split(' ').filter(Boolean)
  if (tokens.length === 0) return 0
  for (const t of tokens) {
    // Un número corto («142», «6205») es un modelo o medida: debe ser la palabra entera,
    // para que «baader 142» no traiga la pieza «BAADER 1422002017».
    const ok = /^\d{1,4}$/.test(t)
      ? ix.palabras.includes(t) || ix.codigo.startsWith(t)
      : ix.palabras.some((p) => p.startsWith(t)) || ix.titulo.includes(t) || ix.codigo.includes(t)
    if (!ok) return 0
  }
  let s = 100
  if (ix.codigo) {
    if (ix.codigo === consulta) s = Math.max(s, 1000)
    else if (consulta.length >= 3 && /^\d+$/.test(consulta) && ix.codigo.startsWith(consulta)) s = Math.max(s, 800)
  }
  if (ix.titulo === consulta) s = Math.max(s, 600)
  else if (ix.titulo.startsWith(consulta)) s = Math.max(s, 500)
  else if (ix.titulo.includes(consulta)) s = Math.max(s, 300)
  const enTitulo = ix.titulo.split(' ')
  for (const t of tokens) {
    if (ix.titulo.includes(t)) s += 15
    if (ix.palabras.some((p) => p.startsWith(t))) s += 10
    if (enTitulo.some((p) => p.startsWith(t))) s += 5
  }
  return s
}

export interface GrupoResultados {
  tipo: TipoResultado
  items: ItemBuscador[]
  /** Cuántos coincidieron en total (se muestran hasta `porGrupo`). */
  total: number
}

export interface OpcionesBusqueda {
  porGrupo?: number
  /** Ids recientes, el más nuevo primero: desempatan a favor de lo ya abierto. */
  recientes?: string[]
}

/**
 * Agrupa por tipo y ordena los grupos por su mejor puntaje: si se escribe un
 * código SAP de repuesto, Repuestos sube; si se escribe «baader», Equipos.
 * Empates: orden fijo de `ORDEN_GRUPOS`.
 */
export function buscar(indice: Indexado[], consultaCruda: string, op: OpcionesBusqueda = {}): GrupoResultados[] {
  const consulta = normBuscador(consultaCruda)
  if (!consulta) return []
  const porGrupo = op.porGrupo ?? 5
  const rec = new Map((op.recientes ?? []).map((id, i) => [id, i]))
  const bonoReciente = (id: string) => {
    const i = rec.get(id)
    return i === undefined ? 0 : 30 - Math.min(i, 20)
  }
  const porTipo = new Map<TipoResultado, { item: ItemBuscador; s: number }[]>()
  for (const ix of indice) {
    const s = puntuar(ix, consulta)
    if (s <= 0) continue
    const lista = porTipo.get(ix.item.tipo) ?? []
    lista.push({ item: ix.item, s: s + bonoReciente(ix.item.id) })
    porTipo.set(ix.item.tipo, lista)
  }
  const grupos: (GrupoResultados & { mejor: number })[] = []
  for (const tipo of ORDEN_GRUPOS) {
    const lista = porTipo.get(tipo)
    if (!lista?.length) continue
    lista.sort((a, b) => b.s - a.s || a.item.titulo.localeCompare(b.item.titulo, 'es'))
    grupos.push({ tipo, items: lista.slice(0, porGrupo).map((x) => x.item), total: lista.length, mejor: lista[0]!.s })
  }
  grupos.sort((a, b) => b.mejor - a.mejor || ORDEN_GRUPOS.indexOf(a.tipo) - ORDEN_GRUPOS.indexOf(b.tipo))
  return grupos.map(({ tipo, items, total }) => ({ tipo, items, total }))
}

/**
 * Parte el título en tramos para resaltar lo que coincide con la consulta,
 * comparando sin tildes ni mayúsculas pero devolviendo el texto original.
 */
export function resaltar(titulo: string, consultaCruda: string): { texto: string; marca: boolean }[] {
  const tokens = normBuscador(consultaCruda).split(' ').filter((t) => t.length > 0)
  if (tokens.length === 0) return [{ texto: titulo, marca: false }]
  const chars = [...titulo]
  const norm = chars.map((c) => c.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').charAt(0) || ' ')
  const plano = norm.join('')
  const marcado = new Array<boolean>(chars.length).fill(false)
  for (const t of tokens) {
    let desde = 0
    for (;;) {
      const i = plano.indexOf(t, desde)
      if (i < 0) break
      for (let k = i; k < i + t.length; k++) marcado[k] = true
      desde = i + t.length
    }
  }
  const tramos: { texto: string; marca: boolean }[] = []
  chars.forEach((c, i) => {
    const ult = tramos[tramos.length - 1]
    if (ult && ult.marca === (marcado[i] === true)) ult.texto += c
    else tramos.push({ texto: c, marca: marcado[i] === true })
  })
  return tramos
}

// ── Turnos de la Bitácora (calculados, 0 lecturas) ──────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function itemTurno(t: TurnoMantencion, ahora: Date, actual: TurnoMantencion): ItemBuscador {
  const d = t.inicio
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const difDias = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000)
  const cuando = difDias === 0 ? 'hoy' : difDias === 1 ? 'ayer' : `${DIAS[d.getDay()]} ${pad(d.getDate())}-${pad(d.getMonth() + 1)}`
  const banda = etiquetaTurno(t).replace('Turno ', '')
  const enCurso = t.id === actual.id
  return {
    id: `turno:${t.id}`,
    tipo: 'turno',
    titulo: `Turno ${banda}, ${cuando}`,
    detalle: `${DIAS[d.getDay()]} ${pad(d.getDate())}-${pad(d.getMonth() + 1)} · ${horarioTurno(t)}${enCurso ? ' · en curso' : ''}`,
    href: `/bitacora?turno=${t.id}`,
    accesos: [
      { etiqueta: 'Abrir el turno en la Bitácora', href: `/bitacora?turno=${t.id}` },
      { etiqueta: 'Historial de la Bitácora', href: '/bitacora/historial' },
    ],
    claves: `bitacora turno ${banda} ${cuando} ${pad(d.getDate())}-${pad(d.getMonth() + 1)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${t.fecha}${enCurso ? ' actual ahora' : ''}`,
  }
}

/** Los últimos `n` turnos de Mantención, el en curso primero. */
export function turnosRecientes(ahora: Date, n = 9): ItemBuscador[] {
  const actual = turnoMantencionEn(ahora)
  const out: ItemBuscador[] = []
  let t = actual
  for (let i = 0; i < n; i++) {
    out.push(itemTurno(t, ahora, actual))
    t = turnoAdyacente(t, -1)
  }
  return out
}

/**
 * Si la consulta trae una fecha «dd-mm» o «dd/mm» (opcional «-aaaa») fuera de los
 * turnos recientes, devuelve sus tres turnos. Año: el actual, o el anterior si la
 * fecha quedaría en el futuro.
 */
export function turnosDeFecha(consulta: string, ahora: Date): ItemBuscador[] {
  const m = consulta.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/)
  if (!m) return []
  const dd = Number(m[1])
  const mm = Number(m[2])
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return []
  let anio = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : ahora.getFullYear()
  if (!m[3] && new Date(anio, mm - 1, dd) > ahora) anio -= 1
  const fecha = `${anio}-${pad(mm)}-${pad(dd)}`
  const actual = turnoMantencionEn(ahora)
  return (['noche', 'dia', 'tarde'] as const)
    .map((b) => turnoDesdeId(`${fecha}_${b}`))
    .filter((t): t is TurnoMantencion => Boolean(t) && (t as TurnoMantencion).inicio <= ahora)
    .map((t) => itemTurno(t, ahora, actual))
}

// ── Constructores de ítems desde las fuentes ────────────────────────────────

export interface EquipoFuente {
  id: string
  nombre: string
  codigo?: string
  nombreComun?: string
  hierarchyPath?: string
  marca?: string
  modelo?: string
  deleted?: boolean
}

export interface FichaMaquina {
  slug: string
  name: string
  area: string
  customRoute?: string
}

/** Ficha de aprendizaje que corresponde a un equipo: todas las palabras del slug están en su nombre. */
export function fichaDeEquipo(nombreEquipo: string, fichas: FichaMaquina[]): FichaMaquina | undefined {
  const n = ` ${normBuscador(nombreEquipo)} `
  return fichas.find((f) => f.slug.split('-').every((p) => n.includes(` ${p} `)))
}

export function hrefFicha(f: FichaMaquina): string {
  return f.customRoute ?? `/aprendizaje/maquina/${f.slug}`
}

export function itemsEquipos(equipos: EquipoFuente[], fichas: FichaMaquina[]): ItemBuscador[] {
  return equipos
    .filter((e) => !e.deleted && e.nombre)
    .map((e) => {
      const ficha = fichaDeEquipo(e.nombre, fichas)
      const ruta = (e.hierarchyPath ?? '').split('>').map((p) => p.trim()).filter(Boolean)
      // Sin la raíz (empresa) ni el propio equipo: «Planta Yal › Proceso › Eviscerado».
      const ubicacion = ruta.slice(1, -1).map(tituloLegible).join(' › ')
      const fichaHref = `/equipment?abrir=${encodeURIComponent(e.id)}&tab=ficha`
      const accesos: Acceso[] = [
        { etiqueta: 'Abrir la ficha del equipo', href: fichaHref },
        { etiqueta: 'Buscar sus repuestos', href: `/repuestos?q=${encodeURIComponent(e.nombre)}` },
      ]
      if (ficha) accesos.push({ etiqueta: `Centro de Aprendizaje: ${ficha.name}`, href: hrefFicha(ficha) })
      return {
        id: `equipo:${e.id}`,
        tipo: 'equipo' as const,
        titulo: tituloLegible(e.nombre),
        codigo: e.codigo || undefined,
        detalle: ubicacion || undefined,
        href: fichaHref,
        accesos,
        claves: [e.nombreComun, e.marca, e.modelo].filter(Boolean).join(' '),
      }
    })
}

export interface RepuestoFuente {
  codigoSAP: string
  nombre: string
  nombreComun: string
  ubicacion: string
}

export function itemsRepuestos(repuestos: RepuestoFuente[]): ItemBuscador[] {
  return repuestos
    // El índice trae algunos códigos con comillas invertidas o espacios («`3300138481`»).
    .map((r) => ({ ...r, codigoSAP: r.codigoSAP.replace(/[`'"\s]/g, '') }))
    .filter((r) => r.codigoSAP && r.nombre)
    .map((r) => {
      const href = `/repuestos?q=${encodeURIComponent(r.codigoSAP)}`
      return {
        id: `repuesto:${r.codigoSAP}`,
        tipo: 'repuesto' as const,
        titulo: tituloLegible(r.nombre),
        codigo: r.codigoSAP,
        detalle: [r.nombreComun, r.ubicacion && `Bodega ${r.ubicacion}`].filter(Boolean).join(' · ') || undefined,
        href,
        accesos: [{ etiqueta: 'Ver en Repuestos', href }],
        claves: r.nombreComun,
      }
    })
}

export interface ModuloAprendizaje {
  id: string
  title: string
  subtitle: string
  href: string
  inDevelopment?: boolean
}

export function itemsFichas(maquinas: FichaMaquina[], modulos: ModuloAprendizaje[], esAdmin: boolean): ItemBuscador[] {
  const deMaquinas = maquinas.map((m) => ({
    id: `ficha:${m.slug}`,
    tipo: 'ficha' as const,
    titulo: m.name,
    detalle: tituloLegible(m.area),
    href: hrefFicha(m),
    accesos: [{ etiqueta: 'Abrir en el Centro de Aprendizaje', href: hrefFicha(m) }],
    claves: m.slug.replace(/-/g, ' '),
  }))
  const deModulos = modulos
    .filter((m) => !m.inDevelopment || esAdmin)
    .map((m) => ({
      id: `ficha:${m.id}`,
      tipo: 'ficha' as const,
      titulo: m.title,
      detalle: m.subtitle,
      href: m.href,
      accesos: [{ etiqueta: 'Abrir en el Centro de Aprendizaje', href: m.href }],
    }))
  return [...deMaquinas, ...deModulos]
}

export interface PaginaFuente {
  name: string
  href: string
  grupo?: string
}

export function itemsPaginas(paginas: PaginaFuente[]): ItemBuscador[] {
  const vistos = new Set<string>()
  return paginas
    .filter((p) => (vistos.has(p.href) ? false : (vistos.add(p.href), true)))
    .map((p) => ({
      id: `pagina:${p.href}`,
      tipo: 'pagina' as const,
      titulo: p.name,
      detalle: p.grupo,
      href: p.href,
      accesos: [{ etiqueta: 'Ir a la página', href: p.href }],
    }))
}
