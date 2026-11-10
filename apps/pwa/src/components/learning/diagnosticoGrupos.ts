import type { DiagnosisEntry } from '@/services/learningContent'

/** Caso numerado como en la ficha (CASO 01…), aunque la lista se agrupe o filtre. */
export interface CasoNumerado {
  entry: DiagnosisEntry
  numero: number
}

export interface GrupoCasos {
  id: 'sintomas' | 'codigos'
  titulo: string
  casos: CasoNumerado[]
  /** Códigos cuya solución no viene en el manual del fabricante. */
  sinSolucion: number
}

// «E 770», «E771–E775», «E 8 N X» y «Códigos de error E77x…»; no «Esófago…».
const RE_CODIGO = /^(E\s?\d|C[oó]digos? de error)/i
const RE_SIN_SOLUCION = /no entrega una soluci[oó]n separada/i

export const tituloCaso = (e: DiagnosisEntry): string => (e.title || e.symptom || '').trim()

export const esCodigoError = (e: DiagnosisEntry): boolean => RE_CODIGO.test(tituloCaso(e))

export const sinSolucionDelFabricante = (e: DiagnosisEntry): boolean => RE_SIN_SOLUCION.test(e.solution ?? '')

const normalizar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca en título, síntoma y causas, sin acentos. */
export function coincideCaso(e: DiagnosisEntry, consulta: string): boolean {
  const q = normalizar(consulta.trim())
  if (!q) return true
  return normalizar([e.title, e.symptom, ...(e.possibleCauses ?? [])].join(' ')).includes(q)
}

/** Separa síntomas de códigos de error, conservando el número original de cada caso. */
export function agruparCasos(entries: DiagnosisEntry[], consulta = ''): GrupoCasos[] {
  const numerados = entries.map((entry, i) => ({ entry, numero: i + 1 }))
  const visibles = numerados.filter(c => coincideCaso(c.entry, consulta))
  const codigos = visibles.filter(c => esCodigoError(c.entry))
  const sintomas = visibles.filter(c => !esCodigoError(c.entry))
  const grupos: GrupoCasos[] = [
    { id: 'sintomas', titulo: 'Síntomas', casos: sintomas, sinSolucion: 0 },
    {
      id: 'codigos',
      titulo: 'Códigos de error',
      casos: codigos,
      sinSolucion: codigos.filter(c => sinSolucionDelFabricante(c.entry)).length,
    },
  ]
  return grupos.filter(g => g.casos.length > 0)
}
