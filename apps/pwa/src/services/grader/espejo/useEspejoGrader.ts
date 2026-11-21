/**
 * `useEspejoGrader(linea, ventana)`: escucha en vivo las piezas que el lector del PC
 * de planta guarda en `graderEspejo/{linea}__{fecha}/horas/{HH}` y el estado de los
 * lectores de la línea en `graderEspejoEstado`. Solo se suscribe con usuario
 * logueado (las reglas piden `isNotAnonymous`) y limpia los listeners al desmontar.
 *
 * Rendimiento (E1.1): se escucha SOLO cada documento de hora de la ventana del
 * turno con su margen (~16), no las horas de dos días; cada snapshot parsea solo
 * las filas nuevas de ese documento (`CacheHorasEspejo`), y el reparto por turno
 * (`resumirEspejo`) corre fuera del render, con espera de `ESPERA_RESUMEN_MS`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from '@/services/firestoreTracked'
import { db } from '../../firebase'
import { useSesionFirebase } from '../graderDatosHasta'
import { elegirEstado, estaVivo, minutosDesde, aMs, type EstadoLector } from './espejoEstado'
import { resumirEspejo, type PiezaEspejo, type ResumenEspejo } from './espejoFilas'
import { CacheHorasEspejo, horasDeVentana, recortarAVentana } from './espejoCache'
import { AgregadorMinutos, type CubetaMinuto } from './espejoMinutos'
import type { ShoplogixShiftWindow } from '../graderSegmenter'

/** Línea del monitor → línea del espejo (el lector la guarda como «chonchi»). */
export function lineaDelEspejo(lineId: string): string {
  return lineId === 'chonchi-eviscerado' ? 'chonchi' : lineId
}

export interface EspejoGrader {
  /** `true` hasta que llegó la primera respuesta de los estados. */
  cargando: boolean
  /** `true` hasta que respondió cada documento de hora de la ventana. */
  cargandoPiezas: boolean
  /** Piezas únicas y ordenadas de la ventana del turno (con su margen). */
  piezas: PiezaEspejo[]
  /**
   * Cubetas por minuto de la ventana (con su margen), para las series del monitor. Solo se reagrupan los
   * documentos de hora que cambiaron (`AgregadorMinutos`).
   */
  cubetas: CubetaMinuto[]
  /** Reparto por turno de `piezas`; `null` mientras se calcula para esta ventana. */
  resumen: ResumenEspejo | null
  /** `true` si alguna hora de la ventana no se pudo leer (sin permiso o sin red): el total puede estar incompleto. */
  errorPiezas: boolean
  /** Estado del lector que avisó más recientemente; `null` si nunca hubo lector. */
  estado: EstadoLector | null
  vivo: boolean
  /** Minutos desde el último latido; `null` si nunca latió. */
  minutos: number | null
}

/** Documento de `graderEspejoEstado` → `EstadoLector` (también lo usa Diagnóstico Matrix). */
export function aEstado(id: string, x: Record<string, unknown>): EstadoLector {
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

/** Espera antes de repartir por turno: junta los snapshots de un mismo envío del lector. */
export const ESPERA_RESUMEN_MS = 250

export function useEspejoGrader(linea: string | null, ventana: ShoplogixShiftWindow | null): EspejoGrader {
  const sesion = useSesionFirebase()
  const [estados, setEstados] = useState<EstadoLector[] | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  // Caché viva mientras no cambie la línea ni la ventana; `rev` avisa a React que cambió.
  const cache = useRef<CacheHorasEspejo>(new CacheHorasEspejo())
  const [rev, setRev] = useState(0)
  const agregador = useRef<AgregadorMinutos>(new AgregadorMinutos())
  const [pendientes, setPendientes] = useState(0)
  // El resumen guarda para qué ventana se calculó: al cambiar de turno no se muestra el anterior.
  const [resumenDe, setResumenDe] = useState<{ clave: string; r: ResumenEspejo } | null>(null)
  const [conError, setConError] = useState(false)

  const startMs = ventana?.startMs ?? NaN
  const endMs = ventana?.endMs ?? NaN
  const horas = useMemo(
    () => horasDeVentana(Number.isFinite(startMs) ? { startMs, endMs } : null),
    [startMs, endMs],
  )
  const claveHoras = horas.map((h) => `${h.fecha}/${h.hh}`).join('|')

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
    // Caché por línea y ventana: al cambiar cualquiera se descarta lo anterior.
    cache.current = new CacheHorasEspejo()
    setRev((r) => r + 1)
    setResumenDe(null)
    setConError(false)
    const claves = claveHoras ? claveHoras.split('|') : []
    setPendientes(sesion === 'con' && linea ? claves.length : 0)
    if (sesion !== 'con' || !linea) return
    const respondio = new Set<string>()
    const marcar = (k: string) => {
      if (respondio.has(k)) return
      respondio.add(k)
      setPendientes((n) => Math.max(0, n - 1))
    }
    const c = cache.current
    const bajas = claves.map((k) => {
      const [fecha, hh] = k.split('/') as [string, string]
      return onSnapshot(
        doc(db, 'graderEspejo', `${linea}__${fecha}`, 'horas', hh),
        (snap) => {
          const f = snap.exists() ? snap.data()?.filas : undefined
          const filas = Array.isArray(f) ? f.filter((s): s is string => typeof s === 'string') : []
          // Una hora borrada no debe quedarse; una sin cambios no despierta a React.
          const cambio = filas.length > 0 ? c.actualizar(k, filas) : c.quitar(k)
          if (cambio) setRev((r) => r + 1)
          marcar(k)
        },
        () => { setConError(true); marcar(k) }, /* sin permiso o sin red: se queda lo que había y se avisa */
      )
    })
    return () => { for (const b of bajas) b() }
  }, [sesion, linea, claveHoras])

  const piezas = useMemo(() => {
    void rev
    const claves = claveHoras ? claveHoras.split('|') : []
    return recortarAVentana(cache.current.piezas(claves), Number.isFinite(startMs) ? { startMs, endMs } : null)
  }, [rev, claveHoras, startMs, endMs])

  // Cubetas por documento: un snapshot reagrupa solo su hora (memo por identidad del arreglo de piezas).
  const cubetas = useMemo(() => {
    void rev
    const claves = claveHoras ? claveHoras.split('|') : []
    return agregador.current.unir(cache.current.piezasPorDoc(claves))
  }, [rev, claveHoras])

  // Reparto por turno fuera del render y con espera: varios snapshots seguidos (un
  // envío del lector toca 1-2 horas) se resuelven en un solo cálculo.
  const turnoId = ventana?.shiftId ?? null
  const sessionDate = ventana?.sessionDate ?? null
  const claveVentana = `${linea}|${claveHoras}|${startMs}|${endMs}|${sessionDate}|${turnoId}`
  useEffect(() => {
    const v = Number.isFinite(startMs) && sessionDate && turnoId
      ? { sessionDate, shiftId: turnoId, startMs, endMs }
      : null
    const id = window.setTimeout(
      () => setResumenDe({ clave: claveVentana, r: resumirEspejo(piezas, v) }),
      ESPERA_RESUMEN_MS,
    )
    return () => window.clearTimeout(id)
  }, [piezas, startMs, endMs, sessionDate, turnoId, claveVentana])
  // Dentro de la misma ventana se deja el resumen anterior hasta el recálculo (≤ 250 ms, sin
  // parpadeo cada 5 min); con otra ventana, nada hasta recalcular.
  const resumen = resumenDe && resumenDe.clave === claveVentana ? resumenDe.r : null

  const estado = useMemo(() => (estados ? elegirEstado(estados) : null), [estados])
  const ult = estado?.ultimoLatidoMs ?? null
  return {
    cargando: sesion === 'cargando' || (sesion === 'con' && estados === null),
    cargandoPiezas: pendientes > 0 || resumen === null,
    piezas,
    cubetas,
    resumen,
    errorPiezas: conError,
    estado,
    vivo: estaVivo(ult, ahora),
    minutos: minutosDesde(ult, ahora),
  }
}
