/**
 * Indicador «Sin SAP» de la ronda Por confirmar: de los códigos de fabricante del plano que el maestro no
 * tiene, cuántos Mantención ya consiguió que bodega diera de alta, cuántos están pedidos y cuántos faltan
 * por pedir. Las tres cifras son EXCLUYENTES y suman el total (una alta rechazada vuelve a «sin pedir»).
 * Pura: sin React ni Firestore.
 */
import type { PartesPlano } from '@/hooks/usePartesPlano'
import type { AltaCodigo } from '@/hooks/repuestos/useSolicitudes'
import { compararElementos } from '@/utils/aprendizaje/altaCodigoA3c'
import { normCodigo } from '@/utils/repuestos/normCodigo'

export type EstadoAltaCodigo = 'sin_pedir' | 'en_bodega' | 'dada_de_alta'

export interface CodigoSinSap {
  codigo: string
  nombre: string
  elementos: string[]
  nivel: 'pieza' | 'conjunto'
  confianza: string
  estado: EstadoAltaCodigo
  /** SAP que dio bodega (solo `dada_de_alta`). */
  sapCreado?: string
}

export interface KpiAltas {
  total: number
  dadasDeAlta: number
  enBodega: number
  sinPedir: number
  /** Elementos distintos del plano que esos códigos cubren. */
  elementosCubiertos: number
  /** Ordenados por cuántos elementos cubre cada uno (el orden en que conviene pedirlos). */
  codigos: CodigoSinSap[]
}

export function kpiAltas(
  partes: Pick<PartesPlano, 'aparatos'> | null | undefined,
  altas: readonly Pick<AltaCodigo, 'codigoFabricante' | 'estado' | 'sapCreado'>[],
): KpiAltas {
  const porCodigo = new Map<string, CodigoSinSap>()
  for (const [elemento, piezas] of Object.entries(partes?.aparatos ?? {})) {
    for (const p of piezas) {
      if (p.sap) continue
      const k = normCodigo(p.nr)
      if (!k) continue
      const c: CodigoSinSap = porCodigo.get(k) ?? {
        codigo: p.nr,
        nombre: p.es,
        elementos: [],
        nivel: p.nivel === 'conjunto' ? 'conjunto' : 'pieza',
        confianza: p.confianza,
        estado: 'sin_pedir',
      }
      if (!c.elementos.includes(elemento)) c.elementos.push(elemento)
      porCodigo.set(k, c)
    }
  }
  const altaDe = new Map(altas.map((a) => [normCodigo(a.codigoFabricante), a]))
  for (const [k, c] of porCodigo) {
    c.elementos.sort(compararElementos)
    const a = altaDe.get(k)
    if (a?.estado === 'creada') {
      c.estado = 'dada_de_alta'
      c.sapCreado = a.sapCreado
    } else if (a?.estado === 'pendiente') c.estado = 'en_bodega'
  }
  const codigos = [...porCodigo.values()].sort(
    (a, b) => b.elementos.length - a.elementos.length || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }),
  )
  const cuenta = (e: EstadoAltaCodigo) => codigos.filter((c) => c.estado === e).length
  return {
    total: codigos.length,
    dadasDeAlta: cuenta('dada_de_alta'),
    enBodega: cuenta('en_bodega'),
    sinPedir: cuenta('sin_pedir'),
    elementosCubiertos: new Set(codigos.flatMap((c) => c.elementos)).size,
    codigos,
  }
}
