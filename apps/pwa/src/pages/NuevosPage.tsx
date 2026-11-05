import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, BookOpen, Package } from 'lucide-react'
import { ListCell, ListGroup } from '@/components/piel'
import { LoadingScreen } from '@/components/ui'
import { useAuthStore } from '@/store'
import { rutaMonitor } from '@/services/shoplogix/monitorDeLinea'
import {
  entrarConPaseLectura,
  leerTokenDeHash,
  mensajeDeError,
  monitoresDelPase,
  type MonitorDelPase,
} from '@/services/paseLectura'

/**
 * `/nuevos` — portal del pase de lectura (decisión de Orel 04-11-2026).
 *
 * Con `#t=<token>` en la URL entra con el pase (sin usuario ni contraseña) y
 * borra el token de la barra. Después muestra las puertas que el pase abre:
 * Centro de Aprendizaje, Repuestos y los monitores de Filete y Eviscerado.
 * Quien ya tiene sesión normal en la app NO se cambia al pase: ve las mismas
 * puertas con su cuenta.
 */
export function NuevosPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const esPase = Boolean(user?.paseLectura)
  const [token] = useState(() => leerTokenDeHash(window.location.hash))
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [monitores, setMonitores] = useState<MonitorDelPase[] | null>(null)

  // Entrar con el token del link (también si el teléfono traía un pase anterior).
  useEffect(() => {
    if (isLoading || !token) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (isAuthenticated && !esPase) return
    let vivo = true
    setEntrando(true)
    entrarConPaseLectura(token)
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
      .finally(() => { if (vivo) setEntrando(false) })
    return () => { vivo = false }
    // Solo una vez, con el token con que se abrió la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  useEffect(() => {
    if (!esPase || entrando) return
    let vivo = true
    monitoresDelPase()
      .then((m) => { if (vivo) setMonitores(m) })
      .catch((e) => { if (vivo) { setMonitores([]); setError(mensajeDeError(e)) } })
    return () => { vivo = false }
  }, [esPase, entrando])

  if (isLoading || entrando) return <LoadingScreen />

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-title2 font-bold text-foreground">Acceso de lectura</h1>
        <p className="text-body text-muted-foreground">
          {error ?? 'Para entrar necesitas el link o el QR que entrega el administrador.'}
        </p>
      </div>
    )
  }

  const icono = (Icon: typeof BookOpen) => (
    <span className="flex size-10 items-center justify-center rounded-ctl bg-primary/[0.12] text-brand-ink">
      <Icon className="size-5" />
    </span>
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-2">
      <header>
        <h1 className="text-display font-bold tracking-tight text-foreground">Bienvenido</h1>
        <p className="text-footnote text-muted-foreground">
          Material de Mantención para aprender las máquinas de planta. Todo es de solo lectura: puedes buscar y mirar, no cambiar nada.
        </p>
      </header>

      {error && esPase && (
        <p role="alert" className="rounded-ctl bg-destructive/10 px-4 py-3 text-footnote text-destructive">{error}</p>
      )}

      <ListGroup title="Aprender y buscar">
        <ListCell
          className="bg-card"
          leading={icono(BookOpen)}
          title={<span className="font-normal">Centro de Aprendizaje</span>}
          subtitle="Manuales, procedimientos, diagnósticos y simuladores por máquina"
          onClick={() => navigate('/aprendizaje')}
        />
        <ListCell
          className="bg-card"
          leading={icono(Package)}
          title={<span className="font-normal">Repuestos</span>}
          subtitle="Áreas, bodega y códigos de fabricante"
          onClick={() => navigate('/repuestos')}
        />
      </ListGroup>

      {esPase && (
        <ListGroup title="Producción en vivo">
          {monitores === null ? (
            <p className="px-4 py-3 text-footnote text-muted-foreground">Cargando monitores…</p>
          ) : monitores.length === 0 ? (
            <p className="px-4 py-3 text-footnote text-muted-foreground">Los monitores no están disponibles ahora.</p>
          ) : (
            monitores.map((m) => (
              <ListCell
                key={m.id}
                className="bg-card"
                leading={icono(Activity)}
                title={<span className="font-normal">{m.titulo}</span>}
                subtitle="Turno en curso: ritmo, detenciones y meta"
                onClick={() => navigate(rutaMonitor(m.token))}
              />
            ))
          )}
        </ListGroup>
      )}
    </div>
  )
}
