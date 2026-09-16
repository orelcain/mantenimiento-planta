import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'

/**
 * Datos del pase de bitácora para la hoja «Acceso por QR» (solo supervisores:
 * las reglas no dejan leerlos a nadie más). Escucha solo mientras la hoja está
 * abierta.
 */
export interface EstadoPase {
  token: string | null
  venceEnMs: number | null
  conPin: string[]
  /** Por clave del PIN: bloqueo vigente del técnico (null = sin bloqueo). */
  bloqueados: Record<string, { nombre: string; hastaMs: number | null; total: boolean } | null>
}

export interface DispositivoPase {
  uid: string
  nombre: string
  dispositivo: string
  creadoEnMs: number
}

export interface FuenteAccesoQr {
  useAccesoQr(plantId: string, activo: boolean): { estado: EstadoPase | null; dispositivos: DispositivoPase[]; cargando: boolean; error: string | null }
}

export function useAccesoQrBitacora(plantId: string, activo: boolean) {
  const [estado, setEstado] = useState<EstadoPase | null>(null)
  const [dispositivos, setDispositivos] = useState<DispositivoPase[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activo) return
    setCargando(true)
    setError(null)
    const fallar = () => {
      setError('No se pudo leer el pase. Solo un supervisor puede verlo.')
      setCargando(false)
    }
    const quitarPase = onSnapshot(
      doc(db, 'bitacoraPases', plantId),
      (snap) => {
        const d = snap.data()
        setEstado(
          d
            ? {
                token: typeof d.token === 'string' ? d.token : null,
                venceEnMs: typeof d.venceEnMs === 'number' ? d.venceEnMs : null,
                conPin: Array.isArray(d.conPin) ? d.conPin.filter((x: unknown): x is string => typeof x === 'string') : [],
                bloqueados: (d.bloqueados ?? {}) as EstadoPase['bloqueados'],
              }
            : null,
        )
        setCargando(false)
      },
      fallar,
    )
    const quitarDispositivos = onSnapshot(
      query(collection(db, 'bitacoraDispositivos'), where('plantId', '==', plantId), where('activo', '==', true)),
      (snap) =>
        setDispositivos(
          snap.docs
            .map((d) => {
              const x = d.data()
              return { uid: d.id, nombre: String(x.nombre ?? ''), dispositivo: String(x.dispositivo ?? 'Teléfono'), creadoEnMs: Number(x.creadoEnMs) || 0 }
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || b.creadoEnMs - a.creadoEnMs),
        ),
      fallar,
    )
    return () => {
      quitarPase()
      quitarDispositivos()
    }
  }, [plantId, activo])

  return { estado, dispositivos, cargando, error }
}

export const FUENTE_ACCESO_QR: FuenteAccesoQr = { useAccesoQr: useAccesoQrBitacora }
