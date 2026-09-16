import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SegmentedControl } from '@/components/piel'
import { EntradaPase } from '@/pages/PaseBitacoraPage'
import { AccesoQrSheet } from '@/components/bitacora/AccesoQrSheet'
import { MarcoPaseBitacora } from '@/components/layout/PaseBitacoraLayout'
import { BitacoraTurnoVista } from '@/pages/BitacoraTurnoPage'
import { FUENTE_EJEMPLO } from '@/pages/dev/BitacoraDevPage'
import { BITACORA_PLANTA } from '@/config/bitacora'
import type { DispositivoPase, EstadoPase, FuenteAccesoQr } from '@/hooks/useAccesoQrBitacora'
import { usuarioDePase, type ApiPase, type DatosQr } from '@/services/bitacora/paseBitacora'

/**
 * Vitrina del PASE DE BITÁCORA con datos de ejemplo — solo desarrollo. Nada
 * llama a la función ni escribe en la base: la API es de mentira.
 *   /dev/pase-bitacora              → entrada con el QR + «Acceso por QR»
 *   /dev/pase-bitacora?vista=modo   → la bitácora como la ve un teléfono con pase
 * PIN de ejemplo: 4729 (cualquier otro falla; 5 fallos bloquean).
 */

const TECNICOS = ['Danilo Cortes', 'Leandro Igor', 'Mauricio Gallardo', 'Matias Serpa', 'Diego Cardenas', 'Lucas Adrade']
const QR: DatosQr = { plantId: 'chonchi', token: 'ejemplo-de-token-no-sirve-1234' }
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errorFuncion = (code: string, message: string) => Object.assign(new Error(message), { code: `functions/${code}` })

function useSimulacionPase() {
  const ahora = Date.now()
  const [estado, setEstado] = useState<EstadoPase | null>({
    token: QR.token,
    venceEnMs: ahora + 30 * 86_400_000,
    conPin: ['Danilo Cortes', 'Leandro Igor', 'Mauricio Gallardo'],
    bloqueados: { x: { nombre: 'Mauricio Gallardo', hastaMs: ahora + 12 * 60_000, total: false } },
  })
  const [dispositivos, setDispositivos] = useState<DispositivoPase[]>([
    { uid: 'pase_000000000000000000000001', nombre: 'Leandro Igor', dispositivo: 'Android', creadoEnMs: ahora - 86_400_000 },
    { uid: 'pase_000000000000000000000002', nombre: 'Danilo Cortes', dispositivo: 'iPhone', creadoEnMs: ahora - 3 * 86_400_000 },
  ])
  const [fallos, setFallos] = useState(0)

  const api: ApiPase = useMemo(
    () => ({
      async info() {
        await esperar(400)
        return { plantId: 'chonchi', tecnicos: estado?.conPin ?? [], venceEnMs: estado?.venceEnMs ?? 0 }
      },
      async entrar(_qr, nombre, pin) {
        await esperar(600)
        if (pin !== '4729') {
          const n = fallos + 1
          setFallos(n)
          if (n % 5 === 0) throw errorFuncion('resource-exhausted', 'Demasiados intentos. Prueba de nuevo en 15 min.')
          const quedan = 5 - (n % 5)
          throw errorFuncion('permission-denied', `PIN incorrecto. ${quedan === 1 ? 'Queda 1 intento' : `Quedan ${quedan} intentos`} antes del bloqueo.`)
        }
        return { nombre }
      },
      async generar() {
        await esperar(400)
        setEstado((e) => ({ ...(e ?? { conPin: [], bloqueados: {} }), token: `nuevo-token-de-ejemplo-${Date.now()}`, venceEnMs: Date.now() + 30 * 86_400_000 }))
      },
      async renovar() {
        await esperar(400)
        setEstado((e) => (e ? { ...e, venceEnMs: Date.now() + 30 * 86_400_000 } : e))
      },
      async asignarPin(_p, nombre) {
        await esperar(400)
        const reinicio = Boolean(estado?.conPin.includes(nombre))
        const quitados = dispositivos.filter((d) => d.nombre === nombre).length
        if (reinicio) setDispositivos((ds) => ds.filter((d) => d.nombre !== nombre))
        setEstado((e) => (e ? { ...e, conPin: [...new Set([...e.conPin, nombre])], bloqueados: {} } : e))
        return { pin: String(1000 + Math.floor(Math.random() * 9000)), reinicio, telefonosQuitados: reinicio ? quitados : 0 }
      },
      async quitarPin(_p, nombre) {
        await esperar(400)
        const quitados = dispositivos.filter((d) => d.nombre === nombre).length
        setDispositivos((ds) => ds.filter((d) => d.nombre !== nombre))
        setEstado((e) => (e ? { ...e, conPin: e.conPin.filter((n) => n !== nombre) } : e))
        return { telefonosQuitados: quitados }
      },
      async quitarDispositivo(uid) {
        await esperar(400)
        setDispositivos((ds) => ds.filter((d) => d.uid !== uid))
      },
      async salir() {
        await esperar(300)
      },
    }),
    [estado, dispositivos, fallos],
  )
  return { estado, dispositivos, api, vencer: () => setEstado((e) => (e ? { ...e, venceEnMs: Date.now() - 1000 } : e)), sinQr: () => setEstado(null) }
}

export function PaseBitacoraDevPage() {
  const [params] = useSearchParams()
  const sim = useSimulacionPase()
  const [hoja, setHoja] = useState(false)
  const [pantalla, setPantalla] = useState<'entrada' | 'sesion' | 'qr-malo'>('entrada')
  const fuenteQr: FuenteAccesoQr = useMemo(
    () => ({ useAccesoQr: () => ({ estado: sim.estado, dispositivos: sim.dispositivos, cargando: false, error: null }) }),
    [sim.estado, sim.dispositivos],
  )
  const usuarioPase = useMemo(() => usuarioDePase('pase_000000000000000000000001', { plantId: 'chonchi', nombre: 'Leandro Igor' }), [])

  if (params.get('vista') === 'modo') {
    return (
      <MarcoPaseBitacora nombre="Leandro Igor" ruta="/bitacora">
        <BitacoraTurnoVista fuente={FUENTE_EJEMPLO} fuenteQr={fuenteQr} apiPase={sim.api} usuarioSimulado={usuarioPase} />
      </MarcoPaseBitacora>
    )
  }

  return (
    <div className="flex flex-col gap-6 bg-background p-4">
      <p className="rounded-card bg-destructive-tint px-4 py-2 text-footnote font-semibold text-destructive">
        Vitrina de desarrollo · pase de bitácora con datos de ejemplo, no llama al servidor · PIN de ejemplo 4729
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          className="max-w-md"
          ariaLabel="Pantalla de entrada"
          value={pantalla}
          onChange={setPantalla}
          segments={[
            { value: 'entrada', label: 'Entrada' },
            { value: 'qr-malo', label: 'QR malo' },
            { value: 'sesion', label: 'Con sesión' },
          ]}
        />
        <Button variant="tinted" onClick={() => setHoja(true)}>
          Abrir «Acceso por QR»
        </Button>
        <Button variant="plain" onClick={sim.vencer}>
          Vencer el QR
        </Button>
        <Button variant="plain" onClick={sim.sinQr}>
          Sin QR
        </Button>
        <a className="text-footnote text-primary underline" href="?vista=modo">
          Ver el modo bitácora
        </a>
      </div>
      <div className="rounded-card border border-border">
        <EntradaPase
          key={pantalla}
          qr={pantalla === 'qr-malo' ? null : QR}
          api={sim.api}
          sesionActual={pantalla === 'sesion' ? 'Danilo Cortes' : null}
        />
      </div>
      <AccesoQrSheet
        open={hoja}
        onClose={() => setHoja(false)}
        plantId={BITACORA_PLANTA.id}
        plantaNombre={BITACORA_PLANTA.nombre}
        tecnicos={TECNICOS}
        estado={sim.estado}
        dispositivos={sim.dispositivos}
        cargando={false}
        error={null}
        api={sim.api}
      />
    </div>
  )
}
