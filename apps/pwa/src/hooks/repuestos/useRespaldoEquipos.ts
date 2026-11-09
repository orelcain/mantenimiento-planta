import { useEffect, useState } from 'react'
import {
  contarEventosBitacora,
  contarRepuestos,
  contarRepuestosConSap,
  contarRepuestosSinRepetir,
} from '@/services/repuestos/respaldoEquipos'

export interface EquipoRespaldo { nodeId: string; codigo: string }

export interface RespaldoEquipos {
  repuestos: ReadonlyMap<string, number | null>
  conSap: ReadonlyMap<string, number | null>
  eventos: ReadonlyMap<string, number | null>
  sinRepetir: { total: number | null; conSap: number | null } | null
}

const ESPERA_MS = 250

/** Conteos de los equipos en las listas y, solo repuestos, de los resultados de la búsqueda. */
export function useRespaldoEquipos(activo: boolean, equipos: EquipoRespaldo[], resultados: string[]): RespaldoEquipos {
  const [repuestos, setRepuestos] = useState<ReadonlyMap<string, number | null>>(new Map())
  const [conSap, setConSap] = useState<ReadonlyMap<string, number | null>>(new Map())
  const [eventos, setEventos] = useState<ReadonlyMap<string, number | null>>(new Map())
  const [sinRepetir, setSinRepetir] = useState<RespaldoEquipos['sinRepetir']>(null)

  const claveEquipos = equipos.map((e) => `${e.nodeId}:${e.codigo}`).join('|')
  const claveResultados = resultados.join('|')

  useEffect(() => {
    if (!activo || !claveEquipos) return
    let vivo = true
    const lista = claveEquipos.split('|').map((x) => {
      const [nodeId = '', codigo = ''] = x.split(':')
      return { nodeId, codigo }
    })
    const t = setTimeout(() => {
      const nodos = lista.map((e) => e.nodeId)
      const codigos = lista.map((e) => e.codigo).filter(Boolean)
      void Promise.all([
        Promise.all(nodos.map(contarRepuestos)),
        Promise.all(nodos.map(contarRepuestosConSap)),
        Promise.all(codigos.map(contarEventosBitacora)),
        contarRepuestosSinRepetir(nodos),
      ]).then(([rep, sap, ev, unicos]) => {
        if (!vivo) return
        setRepuestos((m) => new Map([...m, ...nodos.map((n, i) => [n, rep[i] ?? null] as const)]))
        setConSap(new Map(nodos.map((n, i) => [n, sap[i] ?? null] as const)))
        setEventos(new Map(codigos.map((c, i) => [c, ev[i] ?? null] as const)))
        setSinRepetir(unicos)
      })
    }, ESPERA_MS)
    return () => { vivo = false; clearTimeout(t) }
  }, [activo, claveEquipos])

  useEffect(() => {
    if (!activo || !claveResultados) return
    let vivo = true
    const nodos = claveResultados.split('|')
    const t = setTimeout(() => {
      void Promise.all(nodos.map(contarRepuestos)).then((rep) => {
        if (vivo) setRepuestos((m) => new Map([...m, ...nodos.map((n, i) => [n, rep[i] ?? null] as const)]))
      })
    }, ESPERA_MS)
    return () => { vivo = false; clearTimeout(t) }
  }, [activo, claveResultados])

  return { repuestos, conSap, eventos, sinRepetir }
}
