import type { PiezaCatalogo } from './catalogosFabricante'
import { sinonimoDe } from '@/utils/sinonimosPlanta'
import { termVariants } from '@/utils/repuestos/searchNormalize'

/** Sin acentos y en mayúsculas: el catálogo mezcla "Válvula" y "VALVULA". */
export const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()

const alnum = (s: string) => norm(s).replace(/[^A-Z0-9]/g, '')

/**
 * Un término escrito puede llegar en plural ("arandelas") y/o en chileno
 * ("golillas"). Se prueban las dos cosas COMBINADAS: primero las variantes
 * singulares del término, y para cada una, el término del fabricante.
 *
 * "golillas" → golillas, golilla → arandela.  Antes, `sinonimoDe('golillas')`
 * no existía y el plural tampoco: la consulta más natural daba 0.
 */
export function variantesDe(termino: string): string[] {
  const base = termVariants(termino.toLowerCase())
  const out = new Set<string>()
  for (const v of base) {
    out.add(norm(v))
    const a = sinonimoDe(v)
    if (a) out.add(norm(a))
  }
  return [...out]
}

/**
 * Puntúa una pieza contra la consulta. Devuelve 0 si no corresponde.
 *
 * Dos caminos: por CÓDIGO cuando la consulta trae una secuencia numérica larga
 * (lo normal: el número grabado en la pieza), y por PALABRAS si no.
 */
function puntuar(p: PiezaCatalogo, q: string, variantes: string[][], termsAlnum: string[]): number {
  const soloDigitos = q.replace(/[^0-9]/g, '')
  const alnumQ = q.replace(/[^A-Z0-9]/g, '')
  if (soloDigitos.length >= 4) {
    const alnumCod = alnum(p.codigo)
    const alnumProv = p.codigoProveedor ? alnum(p.codigoProveedor) : ''
    if (p.codigo === soloDigitos || alnumCod === alnumQ) return 100
    if (alnumProv === alnumQ || p.codigoSap === soloDigitos) return 90
    if (p.codigo.startsWith(soloDigitos) || alnumCod.startsWith(alnumQ)) return 60
    if (alnumCod.length >= 5 && alnumQ.includes(alnumCod)) return 40
    if (p.codigo.includes(soloDigitos) || (alnumProv && alnumProv.includes(alnumQ))) return 30
    return 0
  }
  if (!variantes.length) return 0
  const blob = norm(`${p.descripcion} ${p.descripcionEn} ${p.conjunto} ${p.especificacion}`)
  // El CÓDIGO también cuenta como término: los 74 códigos de la enzunchadora
  // con menos de 4 dígitos ("SW06", "HN10") no entran por el camino numérico y
  // antes eran invisibles — buscarlos decía "Sin resultados" con 189 filas
  // suyas indexadas. Se compara por prefijo, no por substring, para no meter
  // ruido con términos de 3 letras.
  const alnumCod = alnum(p.codigo)
  const hits = variantes.filter(
    (vs, i) => vs.some((v) => blob.includes(v)) || (termsAlnum[i]!.length >= 3 && alnumCod.startsWith(termsAlnum[i]!)),
  ).length
  return hits === variantes.length ? 20 + hits : 0
}

/**
 * Filtra y ordena el catálogo. Puro y sin React para poder probarlo: la lógica
 * vivía dentro del `useMemo` de la vista y no había forma de verificar que
 * "arandelas" (plural) o "SW06" (código corto) encontraran algo.
 */
export function buscarPiezas(piezas: PiezaCatalogo[], consulta: string): PiezaCatalogo[] {
  const q = norm(consulta.trim())
  if (q.length < 3) return []
  const terms = q.split(/\s+/).filter((t) => t.length >= 2)
  const variantes = terms.map(variantesDe)
  const termsAlnum = terms.map((t) => t.replace(/[^A-Z0-9]/g, ''))
  const scored: { p: PiezaCatalogo; score: number }[] = []
  for (const p of piezas) {
    const score = puntuar(p, q, variantes, termsAlnum)
    if (score > 0) scored.push({ p, score })
  }
  scored.sort((a, b) => b.score - a.score || a.p.pagina - b.p.pagina)
  return scored.map((s) => s.p)
}
