/**
 * Lógica pura de la pantalla «Por confirmar en terreno» de la Tarjeta A3C: arma los grupos por
 * módulo prioritario, el resto del plano y los conteos. Sin React ni Firestore.
 * Fuentes: prioridad curada (`data/baader142A3cPrioridad.ts`), candidatos en vivo de `partes.json`
 * y confirmaciones de `planoVinculos`.
 */
import type { ModuloPrioritario, TipoElementoPrioritario } from '@/data/baader142A3cPrioridad'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import { esPiezaFisica } from '@/utils/aprendizaje/repuestosA3c'

export type EstadoFila = 'pendiente' | 'confirmado' | 'corregido' | 'no_aplica'

export interface FilaPorConfirmar {
  codigo: string
  /** Solo en la lista prioritaria. */
  tipo?: TipoElementoPrioritario
  /** Solo en la lista prioritaria: qué leer en el equipo. */
  lectura?: string
  /** Nombre del elemento en a3c-datos (para las filas del resto y el título de la ficha). */
  nombre?: string
  /** Códigos de fabricante (`nr`) que propone el catálogo, sin repetir. */
  candidatos: string[]
  estado: EstadoFila
  vinculo?: Pick<VinculoTerreno, 'estado' | 'codigo' | 'confirmadoPorNombre' | 'actualizado'>
}

export interface GrupoPorConfirmar {
  /** Posición en la prioridad, desde 1. */
  numero: number
  modulo: ModuloPrioritario
  filas: FilaPorConfirmar[]
  confirmados: number
  total: number
}

export interface PorConfirmar {
  grupos: GrupoPorConfirmar[]
  resto: { filas: FilaPorConfirmar[]; confirmados: number; total: number }
  /** Confirmados / total de la lista prioritaria. */
  prioritarios: { confirmados: number; total: number }
  /** Confirmados / total de piezas físicas del plano (misma cuenta que `coberturaRepuestos`). */
  plano: { confirmados: number; total: number }
}

type VinculosMapa = ReadonlyMap<string, FilaPorConfirmar['vinculo'] & { estado: VinculoTerreno['estado'] }>

function estadoDe(codigo: string, vinculos: VinculosMapa | null | undefined): EstadoFila {
  return vinculos?.get(codigo)?.estado ?? 'pendiente'
}

/** Pendientes (y lo resuelto de otra forma) primero; confirmados al final. Estable. */
function ordenar(filas: FilaPorConfirmar[]): FilaPorConfirmar[] {
  const rango = (f: FilaPorConfirmar) => (f.estado === 'confirmado' ? 1 : 0)
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rango(a.f) - rango(b.f) || a.i - b.i)
    .map(x => x.f)
}

export function armarPorConfirmar(args: {
  prioridad: readonly ModuloPrioritario[]
  aparatos: Record<string, readonly { nr: string }[]> | null | undefined
  vinculos: VinculosMapa | null | undefined
  /** `a3c-datos.elementos`: designación → elemento con su nombre. */
  elementos: Record<string, { es?: string }>
}): PorConfirmar {
  const { prioridad, aparatos, vinculos, elementos } = args
  const candidatosDe = (c: string) => [...new Set((aparatos?.[c] ?? []).map(p => p.nr))]
  const fila = (codigo: string, extra: Partial<FilaPorConfirmar> = {}): FilaPorConfirmar => ({
    codigo,
    nombre: elementos[codigo]?.es,
    candidatos: candidatosDe(codigo),
    estado: estadoDe(codigo, vinculos),
    vinculo: vinculos?.get(codigo),
    ...extra,
  })

  const prioritarios = new Set<string>()
  const grupos: GrupoPorConfirmar[] = prioridad.map((modulo, i) => {
    const filas = ordenar(
      modulo.elementos.map(e => {
        prioritarios.add(e.codigo)
        return fila(e.codigo, { tipo: e.tipo, lectura: e.lectura })
      }),
    )
    return {
      numero: i + 1,
      modulo,
      filas,
      confirmados: filas.filter(f => f.estado === 'confirmado').length,
      total: filas.length,
    }
  })

  const filasResto = ordenar(
    Object.keys(elementos)
      .filter(c => esPiezaFisica(c) && !prioritarios.has(c))
      .map(c => fila(c)),
  )
  const fisicos = Object.keys(elementos).filter(esPiezaFisica)

  return {
    grupos,
    resto: {
      filas: filasResto,
      confirmados: filasResto.filter(f => f.estado === 'confirmado').length,
      total: filasResto.length,
    },
    prioritarios: {
      confirmados: grupos.reduce((n, g) => n + g.confirmados, 0),
      total: grupos.reduce((n, g) => n + g.total, 0),
    },
    plano: {
      confirmados: fisicos.filter(c => estadoDe(c, vinculos) === 'confirmado').length,
      total: fisicos.length,
    },
  }
}

/** `true` si el código es una fila de la lista (prioritaria o resto): `?el=B999` no abre nada. */
export function estaEnLista(r: PorConfirmar, codigo: string | null): codigo is string {
  if (!codigo) return false
  return r.grupos.some(g => g.filas.some(f => f.codigo === codigo)) || r.resto.filas.some(f => f.codigo === codigo)
}

/** Primera fila pendiente (en el orden en que se muestra), o la primera fila si no queda ninguna. */
export function primeraSeleccion(r: PorConfirmar): string | null {
  for (const g of r.grupos) {
    const f = g.filas.find(x => x.estado === 'pendiente')
    if (f) return f.codigo
  }
  return r.grupos[0]?.filas[0]?.codigo ?? null
}
