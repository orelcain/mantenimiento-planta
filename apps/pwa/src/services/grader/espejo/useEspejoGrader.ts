/**
 * `useEspejoGrader(linea, fechas)`: escucha en vivo las piezas que el lector del PC
 * de planta guarda en `graderEspejo/{linea}__{fecha}/horas/*` y el estado de los
 * lectores de la línea en `graderEspejoEstado`. Solo se suscribe con usuario
 * logueado (las reglas piden `isNotAnonymous`) y limpia los listeners al desmontar.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from '@/services/firestoreTracked'
import { db } from '../../firebase'
import { useSesionFirebase } from '../graderDatosHasta'
import { elegirEstado, estaVivo, minutosDesde, aMs, type EstadoLector } from './espejoEstado'
import { parsearFilas, type PiezaEspejo } from './espejoFilas'

/** Línea del monitor → línea del espejo (el lector la guarda como «chonchi»). */
export function lineaDelEspejo(lineId: string): string {
  return lineId === 'chonchi-eviscerado' ? 'chonchi' : lineId
}

export interface EspejoGrader {
  /** `true` hasta que llegó la primera respuesta de los estados. */
  cargando: boolean
  /** Piezas únicas y ordenadas de las fechas pedidas. */
  piezas: PiezaEspejo[]
  /** Estado del lector que avisó más recientemente; `null` si nunca hubo lector. */
  estado: EstadoLector | null
  vivo: boolean
  /** Minutos desde el último latido; `null` si nunca latió. */
  minutos: number | null
}

function aEstado(id: string, x: Record<string, unknown>): EstadoLector {
  const est = (x.estado && typeof x.estado === 'object' ? x.estado : {}) as EstadoLector['estado']
  return {
    equipo: typeof x.equipo === 'string' ? x.equipo : id,
    linea: typeof x.linea === 'string' ? x.linea : '',
    ultimoLatidoMs: aMs(x.ultimoLatido),
    leidoEn: typeof x.leidoEn === 'string' ? x.leidoEn : null,
    informe: typeof x.informe === 'string' ? x.informe : null,
    estado: est,
  }
}

export function useEspejoGrader(linea: string | null, fechas: readonly string[]): EspejoGrader {
  const sesion = useSesionFirebase()
  const claveFechas = fechas.join('|')
  const [estados, setEstados] = useState<EstadoLector[] | null>(null)
  const [filasPorDoc, setFilasPorDoc] = useState<Record<string, string[]>>({})
  const [ahora, setAhora] = useState(() => Date.now())

  // Reloj propio: «vivo» y «hace N min» envejecen aunque Firestore no emita.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    // Al cambiar de línea no debe quedar el estado de la anterior hasta el siguiente snapshot.
    setEstados(null)
    if (sesion !== 'con' || !linea) return
    return onSnapshot(
      query(collection(db, 'graderEspejoEstado'), where('linea', '==', linea)),
      (snap) => setEstados(snap.docs.map((d) => aEstado(d.id, d.data({ serverTimestamps: 'estimate' })))),
      () => setEstados([]),
    )
  }, [sesion, linea])

  useEffect(() => {
    // Caché de filas por línea y fechas: al cambiar cualquiera se descarta lo anterior.
    setFilasPorDoc({})
    if (sesion !== 'con' || !linea) return
    const fs = claveFechas ? claveFechas.split('|') : []
    const bajas = fs.map((fecha) =>
      onSnapshot(
        collection(db, 'graderEspejo', `${linea}__${fecha}`, 'horas'),
        (snap) => {
          setFilasPorDoc((prev) => {
            const sig: Record<string, string[]> = {}
            // Se descarta lo anterior de esa fecha (una hora borrada no debe quedarse).
            for (const k of Object.keys(prev)) if (!k.startsWith(`${fecha}/`)) sig[k] = prev[k] ?? []
            for (const d of snap.docs) {
              const f = d.data().filas
              sig[`${fecha}/${d.id}`] = Array.isArray(f) ? f.filter((s): s is string => typeof s === 'string') : []
            }
            return sig
          })
        },
        () => { /* sin permiso o sin red: se queda lo que había */ },
      ),
    )
    return () => { for (const b of bajas) b() }
  }, [sesion, linea, claveFechas])

  const piezas = useMemo(() => {
    const fs = claveFechas ? claveFechas.split('|') : []
    const todas: string[] = []
    for (const [k, v] of Object.entries(filasPorDoc)) {
      if (fs.some((f) => k.startsWith(`${f}/`))) todas.push(...v)
    }
    return parsearFilas(todas).piezas
  }, [filasPorDoc, claveFechas])

  const estado = useMemo(() => (estados ? elegirEstado(estados) : null), [estados])
  const ult = estado?.ultimoLatidoMs ?? null
  return {
    cargando: sesion === 'cargando' || (sesion === 'con' && estados === null),
    piezas,
    estado,
    vivo: estaVivo(ult, ahora),
    minutos: minutosDesde(ult, ahora),
  }
}
