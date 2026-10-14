/**
 * Lógica pura de la «referencia de terreno» del manual de ajustes BAADER 200:
 * formato de valores, recorte de dibujos, vecinas en el índice y buscador en memoria.
 * Sin React ni Firestore, para poder probarla con Vitest.
 */
import {
  FUENTES,
  type Dibujo,
  type EntradaIndice,
  type EspecieId,
  type Fuente,
  type SeccionTerreno,
} from '@/data/baader200Terreno'

// ─── Texto ────────────────────────────────────────────────────────────────

/**
 * Normaliza para comparar: sin acentos, minúsculas, coma decimal («177.5» = «177,5»)
 * y la puntuación de las posiciones («pos. 8·9») convertida en espacios.
 */
export function normalizar(texto: string | null | undefined): string {
  if (!texto) return ''
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/[.·«»"“”()/:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** «Manual V4 · pág. 10». */
export function etiquetaFuente(f: Fuente): string {
  return `${FUENTES[f.id].corto} · pág. ${f.pagina}`
}

/** «8·9», o «—» si la pieza no tiene número en el dibujo. */
export function posTexto(pos: readonly string[] | undefined): string {
  if (!pos || !pos.length) return '—'
  // Secciones con varios dibujos escriben 'dibujo.posición' ('35.2' = dib. 35, pos. 2; 'b.1' = fig. b).
  if (!pos.some(p => p.includes('.'))) return pos.join('·')
  const grupos: { dib: string; pos: string[] }[] = []
  for (const p of pos) {
    const i = p.indexOf('.')
    const dib = i >= 0 ? p.slice(0, i) : ''
    const n = i >= 0 ? p.slice(i + 1) : p
    const g = grupos[grupos.length - 1]
    if (g && g.dib === dib) g.pos.push(n)
    else grupos.push({ dib, pos: [n] })
  }
  return grupos.map(g => (g.dib ? `dib. ${g.dib} pos. ${g.pos.join('·')}` : `pos. ${g.pos.join('·')}`)).join(' · ')
}

/**
 * Lo que cabe en la pastilla de la leyenda: solo el primer grupo de posiciones
 * (['35.1','39.2'] → texto '1', dib '35', varios true). El detalle completo va en la fila.
 */
export function posChip(pos: readonly string[] | undefined): { texto: string; dib?: string; varios: boolean } {
  if (!pos || !pos.length) return { texto: '—', varios: false }
  const primero = pos[0] ?? ''
  const i = primero.indexOf('.')
  const dib = i >= 0 ? primero.slice(0, i) : undefined
  const mismoDib = pos.filter(p => (dib ? p.startsWith(dib + '.') : !p.includes('.')))
  return { texto: mismoDib.map(posNumero).join('·'), dib, varios: mismoDib.length < pos.length }
}

/** Número de posición sin el prefijo de dibujo: '35.2' → '2'. */
export function posNumero(p: string): string {
  const i = p.indexOf('.')
  return i >= 0 ? p.slice(i + 1) : p
}

/** «320 / 180 mm», «177,5 mm». */
export function formatoValor(valores: readonly string[], unidad?: string): string {
  const v = valores.join(' / ')
  return unidad ? `${v} ${unidad}` : v
}

// ─── Dibujos ──────────────────────────────────────────────────────────────

export interface EstiloRecorte {
  /** ancho / alto del área visible. */
  aspecto: number
  /** Posición y ancho de la página completa, en % del contenedor recortado. */
  imgAnchoPct: number
  imgIzqPct: number
  imgArribaPct: number
}

/**
 * Convierte un recorte en % de la página a la geometría CSS: un contenedor con la
 * proporción del recorte y la página entera desplazada dentro, con overflow oculto.
 * Así los hotspots (en % del recorte) caen donde corresponde a cualquier ancho.
 */
export function estiloRecorte(
  recorte: Dibujo['recorte'],
  anchoPagina: number,
  altoPagina: number,
): EstiloRecorte {
  const r = recorte ?? { x: 0, y: 0, w: 100, h: 100 }
  return {
    aspecto: (r.w * anchoPagina) / (r.h * altoPagina),
    imgAnchoPct: (100 / r.w) * 100,
    imgIzqPct: -(r.x / r.w) * 100,
    imgArribaPct: -(r.y / r.h) * 100,
  }
}

/** El dibujo con más posiciones marcadas: es el que mejor sirve para ubicar piezas. */
export function dibujoPreferido(dibujos: readonly Dibujo[]): Dibujo | undefined {
  let mejor: Dibujo | undefined
  for (const d of dibujos) {
    if (!mejor || (d.hotspots?.length ?? 0) > (mejor.hotspots?.length ?? 0)) mejor = d
  }
  return mejor
}

/**
 * Dibujo donde mostrar un grupo de posiciones: el actual si tiene al menos una;
 * si no, el primero que sí la tenga. `undefined` si ninguno la marca.
 */
export function dibujoParaPos(
  dibujos: readonly Dibujo[],
  pos: readonly string[],
  actualId?: string,
): Dibujo | undefined {
  if (!pos.length) return undefined
  const tiene = (d: Dibujo) => d.hotspots?.some(h => pos.includes(h.pos)) ?? false
  const actual = dibujos.find(d => d.id === actualId)
  if (actual && tiene(actual)) return actual
  return dibujos.find(tiene)
}

// ─── Índice de secciones ──────────────────────────────────────────────────

export interface Vecinas {
  anterior?: EntradaIndice
  siguiente?: EntradaIndice
  /** 1-based dentro del índice. */
  posicion: number
  total: number
}

export function vecinas(indice: readonly EntradaIndice[], seccionId: string): Vecinas {
  const i = indice.findIndex(e => e.id === seccionId)
  return {
    anterior: i > 0 ? indice[i - 1] : undefined,
    siguiente: i >= 0 && i < indice.length - 1 ? indice[i + 1] : undefined,
    posicion: i + 1,
    total: indice.length,
  }
}

export function agruparPorZona(indice: readonly EntradaIndice[]): { zona: string; entradas: EntradaIndice[] }[] {
  const out: { zona: string; entradas: EntradaIndice[] }[] = []
  for (const e of indice) {
    const g = out.find(z => z.zona === e.zona)
    if (g) g.entradas.push(e)
    else out.push({ zona: e.zona, entradas: [e] })
  }
  return out
}

// ─── Cifras dentro de un texto ────────────────────────────────────────────

export interface Trozo {
  texto: string
  cifra: boolean
}

/**
 * Parte un texto del manual para destacar las medidas («1,5 mm», «320 y 180 mm», «900 mm»).
 * Solo la cifra con su unidad: los números de posición («pos. 8·9») quedan como texto.
 */
export function partirCifras(texto: string): Trozo[] {
  const re = /\d+(?:,\d+)?(?:\s+y\s+\d+(?:,\d+)?)?\s?mm\b/g
  const out: Trozo[] = []
  let ultimo = 0
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0
    if (i > ultimo) out.push({ texto: texto.slice(ultimo, i), cifra: false })
    out.push({ texto: m[0], cifra: true })
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) out.push({ texto: texto.slice(ultimo), cifra: false })
  return out
}

// ─── Buscador ─────────────────────────────────────────────────────────────

/** Ids de los bloques de la página, compartidos por la página y el buscador. */
export const ANCLAS = {
  medidaPrincipal: 'terreno-medida-principal',
  dibujo: 'terreno-dibujo',
  medida: (clave: string) => `terreno-medida-${clave}`,
  paso: (i: number) => `terreno-paso-${i}`,
} as const

export type TipoResultado = 'medida' | 'pieza' | 'paso' | 'seccion'

export interface EntradaBusqueda {
  clave: string
  tipo: TipoResultado
  titulo: string
  sub: string
  /** Lo que se vino a buscar: «4 mm», «320 / 180 mm», o el número de posición. */
  valor?: string
  seccionId?: string
  /** false = la sección existe en el índice pero todavía no está estructurada. */
  disponible: boolean
  especie?: EspecieId
  pos?: string[]
  /** Id del elemento de la página al que saltar al elegir el resultado. */
  ancla?: string
  /** Haystack normalizado. */
  texto: string
  tituloNorm: string
}

function entrada(e: Omit<EntradaBusqueda, 'texto' | 'tituloNorm'>, extra: (string | undefined)[]): EntradaBusqueda {
  const texto = normalizar([e.titulo, e.sub, e.valor, ...extra].filter(Boolean).join(' '))
  return { ...e, texto, tituloNorm: normalizar(e.titulo) }
}

const posClaves = (pos: readonly string[] | undefined) => (pos ?? []).flatMap(p => [`pos ${p}`, `pos ${posNumero(p)}`])

/** Aplana las secciones estructuradas y el índice en una lista buscable. */
export function construirIndiceBusqueda(
  secciones: readonly SeccionTerreno[],
  indice: readonly EntradaIndice[],
): EntradaBusqueda[] {
  const out: EntradaBusqueda[] = []
  for (const s of secciones) {
    const base = { seccionId: s.id, disponible: true }
    const mp = s.medidaPrincipal
    if (mp) {
      for (const pe of mp.porEspecie) {
        out.push(entrada({
          ...base,
          clave: `${s.id}:mp:${pe.especie}`,
          tipo: 'medida',
          titulo: `${mp.nombre} · ${pe.etiqueta.toLowerCase()}`,
          sub: pe.incluye?.length ? `Incluye ${pe.incluye.join(', ')} · ${s.titulo}` : s.titulo,
          valor: formatoValor([pe.valor], mp.unidad),
          especie: pe.especie,
          pos: mp.pos,
          ancla: ANCLAS.medidaPrincipal,
        }, [mp.clave, mp.ajusteCon, ...posClaves(mp.pos)]))
      }
      // El valor de planta también se busca por número («30» encuentra el levantador a 30 mm).
      if (mp.valorPlanta) {
        out.push(entrada({
          ...base,
          clave: `${s.id}:mp:planta`,
          tipo: 'medida',
          titulo: `${mp.nombre} · valor de planta`,
          sub: `Manual de planta · pág. ${mp.valorPlanta.fuente.pagina} · ${s.titulo}`,
          valor: formatoValor([mp.valorPlanta.valor], mp.unidad),
          pos: mp.pos,
          ancla: ANCLAS.medidaPrincipal,
        }, [mp.clave, 'planta', ...posClaves(mp.pos)]))
      }
    }
    for (const m of s.medidas) {
      out.push(entrada({
        ...base,
        clave: `${s.id}:m:${m.clave}`,
        tipo: 'medida',
        titulo: m.nombre,
        sub: [m.pos?.length ? `pos. ${posTexto(m.pos)}` : undefined, m.soloAnual ? 'solo mantención anual' : undefined, s.titulo]
          .filter(Boolean).join(' · '),
        valor: formatoValor(m.valores, m.unidad),
        pos: m.pos,
        ancla: ANCLAS.medida(m.clave),
      }, [m.clave, m.con, ...posClaves(m.pos)]))
    }
    for (const p of s.leyenda) {
      const codigos = [...p.codigoBaader, ...(p.sap ?? []).map(c => `SAP ${c}`)]
      out.push(entrada({
        ...base,
        clave: `${s.id}:p:${p.nombre}`,
        tipo: 'pieza',
        titulo: p.nombre,
        sub: [p.pos.some(x => x.includes('.')) ? posTexto(p.pos) : undefined, p.codigoBaader.join(' / ') || 'Sin código', s.titulo]
          .filter(Boolean).join(' · '),
        valor: p.pos.length ? posChip(p.pos).texto : undefined,
        pos: p.pos,
        ancla: ANCLAS.dibujo,
      }, [...codigos, ...posClaves(p.pos)]))
    }
    s.pasos.forEach((p, i) => {
      out.push(entrada({
        ...base,
        clave: `${s.id}:paso:${i}`,
        tipo: 'paso',
        titulo: p.texto,
        sub: `Paso ${i + 1} · ${s.titulo}`,
        pos: p.pos,
        ancla: ANCLAS.paso(i),
      }, posClaves(p.pos)))
    })
  }
  for (const e of indice) {
    const disponible = !!e.id && secciones.some(s => s.id === e.id)
    out.push(entrada({
      clave: `idx:${e.numero}`,
      tipo: 'seccion',
      titulo: e.titulo,
      sub: `Sección ${e.numero} · ${e.zona}${disponible ? '' : ' · pendiente'}`,
      seccionId: e.id,
      disponible,
    }, []))
  }
  return out
}

export interface ResultadoBusqueda {
  medidas: EntradaBusqueda[]
  piezas: EntradaBusqueda[]
  pasos: EntradaBusqueda[]
  secciones: EntradaBusqueda[]
  total: number
  /** La consulta fue una posición («pos 11»): la pieza va antes que las medidas. */
  porPos: boolean
}

const VACIO: ResultadoBusqueda = { medidas: [], piezas: [], pasos: [], secciones: [], total: 0, porPos: false }

/** «pos 11», «pos. 11», «pos11» → «11». */
function posConsultada(q: string): string | null {
  const m = q.match(/^pos\s*(\d{1,2})$/)
  return m?.[1] ?? null
}

function agrupar(lista: EntradaBusqueda[], porPos = false): ResultadoBusqueda {
  const r: ResultadoBusqueda = { medidas: [], piezas: [], pasos: [], secciones: [], total: lista.length, porPos }
  for (const e of lista) {
    if (e.tipo === 'medida') r.medidas.push(e)
    else if (e.tipo === 'pieza') r.piezas.push(e)
    else if (e.tipo === 'paso') r.pasos.push(e)
    else r.secciones.push(e)
  }
  return r
}

/**
 * Busca en el índice aplanado. Todas las palabras deben aparecer (en cualquier orden);
 * primero lo que las tiene en el título («trucha» → la fila de trucha antes que la de
 * salmón, que la nombra como «trucha asalmonada»). «pos 11» busca la posición exacta.
 */
export function buscar(indice: readonly EntradaBusqueda[], consulta: string): ResultadoBusqueda {
  const q = normalizar(consulta)
  if (!q) return VACIO

  const pos = posConsultada(q)
  if (pos) {
    return agrupar(indice.filter(e => (e.tipo === 'pieza' || e.tipo === 'medida') && e.pos?.some(p => posNumero(p) === pos)), true)
  }

  const terminos = q.split(' ')
  // Los pasos son frases largas: con 1-2 letras aparecerían todos.
  const conPasos = q.length >= 3
  const puntaje = (e: EntradaBusqueda) => (terminos.every(t => e.tituloNorm.includes(t)) ? 2 : 1)
  const hallados = indice
    .filter(e => (conPasos || e.tipo !== 'paso') && terminos.every(t => e.texto.includes(t)))
    .map((e, i) => ({ e, i, p: puntaje(e) }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map(x => x.e)
  return agrupar(hallados)
}
