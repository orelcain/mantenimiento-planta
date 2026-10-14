/**
 * Lógica pura de la pantalla «Por confirmar en terreno» de la Tarjeta A3C: arma los grupos por
 * módulo prioritario, el resto del plano y los conteos. Sin React ni Firestore.
 * Fuentes: prioridad curada (`data/baader142A3cPrioridad.ts`), candidatos en vivo de `partes.json`
 * y confirmaciones de `planoVinculos`.
 */
import type { ModuloPrioritario, TipoElementoPrioritario } from '@/data/baader142A3cPrioridad'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { esPiezaFisica } from '@/utils/aprendizaje/repuestosA3c'
import { estadoPorMaquina, type EntradaVinculos } from '@/utils/aprendizaje/vinculoTerreno'

export type EstadoFila = 'pendiente' | 'confirmado' | 'corregido' | 'no_aplica'

type VinculoFila = Pick<VinculoTerreno, 'estado' | 'codigo' | 'confirmadoPorNombre' | 'actualizado'>

/** Lo que dice la OTRA máquina de un elemento (para la línea gris de la fila). */
export interface OtraMaquinaFila {
  maquina: MaquinaBaader
  estado: EstadoFila
  /** Código que quedó en esa máquina (confirmado o leído). */
  codigo?: string
  /** Respecto de la máquina elegida: mismo código o distinto (solo si ambas tienen código). */
  relacion?: 'igual' | 'distinta'
}

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
  /** Estado en la máquina elegida (`pendiente` si no hay ninguna elegida). */
  estado: EstadoFila
  vinculo?: VinculoFila
  /** Las demás máquinas del plano (todas, si no hay una elegida). */
  otras: OtraMaquinaFila[]
  /** Resuelto en todas las máquinas del plano. */
  enTodas: boolean
  /** Hay respuestas con códigos distintos entre máquinas. */
  distintas: boolean
  /** Hay una confirmación vieja sin máquina (solo pista: no cuenta en ninguna). */
  anteriorSinMaquina: boolean
}

export interface GrupoPorConfirmar {
  /** Posición en la prioridad, desde 1. */
  numero: number
  modulo: ModuloPrioritario
  filas: FilaPorConfirmar[]
  /** Resueltos en la máquina elegida. */
  resueltos: number
  total: number
}

/** Conteo de una lista: por máquina, de la elegida y en todas. */
export interface Conteo {
  total: number
  /** Resueltos en la máquina elegida (0 si no hay una elegida). */
  resueltos: number
  porMaquina: Partial<Record<MaquinaBaader, number>>
  /** Resueltos en todas las máquinas del plano. */
  enTodas: number
}

export interface PorConfirmar {
  grupos: GrupoPorConfirmar[]
  resto: { filas: FilaPorConfirmar[]; resueltos: number; total: number }
  /** Lista prioritaria. */
  prioritarios: Conteo
  /** Todas las piezas físicas del plano (misma cuenta que `coberturaRepuestos`). */
  plano: Conteo
}

type VinculosMapa = ReadonlyMap<string, EntradaVinculos<VinculoFila>>

/** Máquinas del plano 888: N2 y N3. */
const MAQUINAS_888: readonly MaquinaBaader[] = ['baader-n2', 'baader-n3']

const resuelta = (f: FilaPorConfirmar) => f.estado !== 'pendiente'

/** Pendientes de la máquina elegida primero; lo resuelto al final. Estable. */
function ordenar(filas: FilaPorConfirmar[]): FilaPorConfirmar[] {
  const rango = (f: FilaPorConfirmar) => (resuelta(f) ? 1 : 0)
  return filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rango(a.f) - rango(b.f) || a.i - b.i)
    .map(x => x.f)
}

export function armarPorConfirmar(args: {
  prioridad: readonly ModuloPrioritario[]
  aparatos: Record<string, readonly { nr: string }[]> | null | undefined
  /** Vínculos agrupados por aparato y máquina (`usePlanoVinculos().porAparato`). */
  porAparato: VinculosMapa | null | undefined
  /** Máquina elegida, o null. */
  maquina: MaquinaBaader | null
  /** Máquinas del plano (por defecto N2 y N3 del 888). */
  maquinas?: readonly MaquinaBaader[]
  /** `a3c-datos.elementos`: designación → elemento con su nombre. */
  elementos: Record<string, { es?: string }>
}): PorConfirmar {
  const { prioridad, aparatos, porAparato, maquina, elementos } = args
  const maquinas = args.maquinas ?? MAQUINAS_888
  const candidatosDe = (c: string) => [...new Set((aparatos?.[c] ?? []).map(p => p.nr))]
  const fila = (codigo: string, extra: Partial<FilaPorConfirmar> = {}): FilaPorConfirmar => {
    const entrada = porAparato?.get(codigo)
    const est = estadoPorMaquina(entrada, maquinas)
    const propio = maquina ? entrada?.porMaquina[maquina] : undefined
    const codigoPropio = maquina ? est.codigos[maquina] : undefined
    return {
      codigo,
      nombre: elementos[codigo]?.es,
      candidatos: candidatosDe(codigo),
      estado: propio?.estado ?? 'pendiente',
      vinculo: propio,
      otras: maquinas
        .filter(m => m !== maquina)
        .map(m => {
          const v = entrada?.porMaquina[m]
          const c = est.codigos[m]
          return {
            maquina: m,
            estado: v?.estado ?? 'pendiente',
            codigo: c,
            relacion: c && codigoPropio ? (c === codigoPropio ? 'igual' : 'distinta') : undefined,
          } satisfies OtraMaquinaFila
        }),
      enTodas: est.enTodas,
      distintas: est.distintas,
      anteriorSinMaquina: !!entrada?.sinMaquina,
      ...extra,
    }
  }
  const conteo = (filas: FilaPorConfirmar[]): Conteo => ({
    total: filas.length,
    resueltos: filas.filter(resuelta).length,
    porMaquina: Object.fromEntries(
      maquinas.map(m => [m, filas.filter(f => estadoPorMaquina(porAparato?.get(f.codigo), [m]).enTodas).length]),
    ),
    enTodas: filas.filter(f => f.enTodas).length,
  })

  const prioritarios = new Set<string>()
  const grupos: GrupoPorConfirmar[] = prioridad.map((modulo, i) => {
    const filas = ordenar(
      modulo.elementos.map(e => {
        prioritarios.add(e.codigo)
        return fila(e.codigo, { tipo: e.tipo, lectura: e.lectura })
      }),
    )
    return { numero: i + 1, modulo, filas, resueltos: filas.filter(resuelta).length, total: filas.length }
  })

  const filasResto = ordenar(
    Object.keys(elementos)
      .filter(c => esPiezaFisica(c) && !prioritarios.has(c))
      .map(c => fila(c)),
  )

  return {
    grupos,
    resto: { filas: filasResto, resueltos: filasResto.filter(resuelta).length, total: filasResto.length },
    prioritarios: conteo(grupos.flatMap(g => g.filas)),
    plano: conteo(Object.keys(elementos).filter(esPiezaFisica).map(c => fila(c))),
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
