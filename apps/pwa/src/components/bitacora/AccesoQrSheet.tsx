import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronDown, Check, KeyRound, Loader2, Printer, Smartphone } from 'lucide-react'
import { Button, ListCell, ListGroup, Pill, Sheet } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import { copiarTexto } from '@/lib/clipboard'
import type { DispositivoPase, EstadoPase } from '@/hooks/useAccesoQrBitacora'
import { diasRestantes, fechaCorta, mensajeDeError, urlDelPase, type ApiPase } from '@/services/bitacora/paseBitacora'

/**
 * «Acceso por QR» de la bitácora (mockup aprobado 16-09-2026, solo supervisores):
 * el QR del pase, los técnicos con PIN y los teléfonos que ya entraron.
 */

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

type Confirmacion = { tipo: 'generar' } | { tipo: 'reiniciar' | 'quitar-pin'; nombre: string } | { tipo: 'quitar-telefono'; uid: string }

export interface AccesoQrSheetProps {
  open: boolean
  onClose: () => void
  plantId: string
  plantaNombre: string
  /** Lista de técnicos de la bitácora (la misma de «Quién registra»). */
  tecnicos: readonly string[]
  estado: EstadoPase | null
  dispositivos: readonly DispositivoPase[]
  cargando: boolean
  error: string | null
  api: ApiPase
  /** Para probar el vencimiento en la vitrina. */
  ahoraMs?: number
}

export function AccesoQrSheet({ open, onClose, plantId, plantaNombre, tecnicos, estado, dispositivos, cargando, error, api, ahoraMs }: AccesoQrSheetProps) {
  const { toast } = useToast()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null)
  /** Técnico con PIN cuyas acciones (reiniciar / quitar) están desplegadas. */
  const [desplegado, setDesplegado] = useState<string | null>(null)
  const [pinNuevo, setPinNuevo] = useState<{ nombre: string; pin: string; quitados: number } | null>(null)
  const qrRef = useRef<HTMLDivElement>(null)
  const avisoPinRef = useRef<HTMLDivElement>(null)

  // El PIN aparece arriba de la hoja: se lleva a la vista (se asignó desde abajo de la lista).
  useEffect(() => {
    if (pinNuevo) avisoPinRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [pinNuevo])

  const ahora = ahoraMs ?? Date.now()
  const url = estado?.token ? urlDelPase(window.location.origin, import.meta.env.BASE_URL, { plantId, token: estado.token }) : null
  const dias = diasRestantes(estado?.venceEnMs, ahora)
  const conPin = new Set((estado?.conPin ?? []).map(normalizar))
  const bloqueoDe = (nombre: string) =>
    Object.values(estado?.bloqueados ?? {}).find((b) => b && normalizar(b.nombre) === normalizar(nombre)) ?? null
  // Los de la lista y, además, los que tienen PIN pero ya no están en ella (para poder quitárselo).
  const filas = [...tecnicos, ...(estado?.conPin ?? []).filter((n) => !tecnicos.some((t) => normalizar(t) === normalizar(n)))]
  const telefonosDe = (nombre: string) => dispositivos.filter((d) => normalizar(d.nombre) === normalizar(nombre)).length

  const ejecutar = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave)
    try {
      await fn()
    } catch (e) {
      toast({ title: 'No se pudo completar', description: mensajeDeError(e), variant: 'destructive' })
    } finally {
      setOcupado(null)
      setConfirmar(null)
    }
  }

  const asignar = (nombre: string) =>
    ejecutar(`pin:${nombre}`, async () => {
      const r = await api.asignarPin(plantId, nombre)
      setPinNuevo({ nombre, pin: r.pin, quitados: r.telefonosQuitados })
    })

  const imprimir = () => {
    const svg = qrRef.current?.querySelector('svg')?.outerHTML
    if (!svg) return
    const marco = document.createElement('iframe')
    Object.assign(marco.style, { position: 'fixed', width: '0', height: '0', border: '0', opacity: '0' })
    marco.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>QR bitácora</title>
      <style>body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;text-align:center;padding:40px;color:#1C1C1E}
      h1{font-size:30px;margin:0 0 6px}p{font-size:18px;margin:6px 0;color:#444}svg{width:320px;height:320px;margin:28px auto;display:block}</style>
      </head><body><h1>Bitácora de Mantención</h1><p>${plantaNombre}</p>${svg}
      <p><b>Escanea, elige tu nombre y escribe tu PIN.</b></p><p>El PIN lo entrega un supervisor. Solo equipo de Mantención.</p></body></html>`
    marco.onload = () => {
      marco.contentWindow?.focus()
      marco.contentWindow?.print()
      setTimeout(() => marco.remove(), 1000)
    }
    document.body.appendChild(marco)
  }

  const botonConfirmable = (c: Confirmacion, clave: string, etiqueta: string, confirmarTexto: string, accion: () => void, variante: 'plain' | 'destructive' = 'plain') => {
    const pidiendo = confirmar && JSON.stringify(confirmar) === JSON.stringify(c)
    return (
      <Button
        variant={pidiendo ? 'destructive' : variante}
        className="shrink-0"
        disabled={Boolean(ocupado)}
        onClick={() => (pidiendo ? accion() : setConfirmar(c))}
      >
        {ocupado === clave ? <Loader2 className="animate-spin" /> : null}
        {pidiendo ? confirmarTexto : etiqueta}
      </Button>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setConfirmar(null)
        setPinNuevo(null)
        onClose()
      }}
      title="Acceso por QR"
      description="Los técnicos entran a la bitácora con el QR y su PIN, sin la contraseña de Mantención. Solo ven y escriben la bitácora."
    >
      <div className="-mx-6 flex max-h-[min(70vh,680px)] flex-col gap-6 overflow-y-auto px-6 pb-1 [&>*]:shrink-0">
        {error && (
          <p role="alert" className="text-footnote font-semibold text-ink-crit">
            {error}
          </p>
        )}

        {pinNuevo && (
          <div ref={avisoPinRef} role="status" className="flex flex-col gap-2 rounded-card bg-muted-foreground/10 p-4">
            <p className="text-footnote text-muted-foreground">PIN de {pinNuevo.nombre}</p>
            <p className="text-title1 font-bold tracking-[0.3em] tabular-nums">{pinNuevo.pin}</p>
            <p className="text-footnote">
              Díctaselo ahora: no se vuelve a mostrar.
              {pinNuevo.quitados > 0 ? ` ${pinNuevo.quitados === 1 ? 'Su teléfono quedó fuera' : `Sus ${pinNuevo.quitados} teléfonos quedaron fuera`}: tiene que entrar de nuevo.` : ''}
            </p>
            <Button variant="tinted" size="sm" className="self-start" onClick={() => setPinNuevo(null)}>
              <Check /> Listo
            </Button>
          </div>
        )}

        {/* QR */}
        <section className="flex flex-col gap-3" aria-label="Código QR">
          {cargando ? (
            <div className="h-44 animate-pulse rounded-card bg-muted-foreground/10 motion-reduce:animate-none" />
          ) : !url ? (
            <div className="flex flex-col items-start gap-3 rounded-card bg-muted-foreground/10 p-4">
              <p className="text-body">Todavía no hay QR. Genéralo y asigna el PIN a cada técnico.</p>
              <Button onClick={() => void ejecutar('generar', () => api.generar(plantId))} disabled={Boolean(ocupado)}>
                {ocupado === 'generar' ? <Loader2 className="animate-spin" /> : null} Generar QR
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <div ref={qrRef} className="shrink-0 rounded-[22px] bg-white p-3">
                <QRCodeSVG value={url} size={168} level="M" />
              </div>
              <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-2">
                {dias > 0 ? (
                  <Pill tone="ok" dot>
                    Vigente · {dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}
                  </Pill>
                ) : (
                  <Pill tone="warning" dot>
                    Vencido
                  </Pill>
                )}
                <p className="text-footnote text-muted-foreground">
                  {dias > 0
                    ? `Sirve para teléfonos nuevos hasta el ${fechaCorta(estado?.venceEnMs ?? 0)}. «Renovar» mantiene el mismo QR.`
                    : 'Ya no deja entrar teléfonos nuevos; los que entraron siguen dentro. «Renovar» lo reactiva sin reimprimirlo.'}
                </p>
                {/* Cuatro acciones en dos filas parejas (17-09): sueltas se
                    repartían 2 + 1 + 1. «Generar otro» va plain: invalida el QR impreso. */}
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button variant="tinted" onClick={imprimir}>
                    <Printer /> Imprimir
                  </Button>
                  <Button variant="tinted" disabled={Boolean(ocupado)} onClick={() => void ejecutar('renovar', () => api.renovar(plantId))}>
                    {ocupado === 'renovar' ? <Loader2 className="animate-spin" /> : null} Renovar 30 días
                  </Button>
                  <Button
                    variant="tinted"
                    onClick={() =>
                      void copiarTexto(url).then(() => toast({ title: 'Enlace copiado', description: 'Sirve igual que el QR: compártelo solo con Mantención.', variant: 'success' }))
                    }
                  >
                    Copiar enlace
                  </Button>
                  {botonConfirmable(
                    { tipo: 'generar' },
                    'generar',
                    'Generar otro QR',
                    'Confirmar: el QR actual deja de servir',
                    () => void ejecutar('generar', () => api.generar(plantId)),
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Técnicos: una fila por técnico con la acción a la derecha (17-09); con
            PIN, «PIN» despliega reiniciar / quitar debajo. */}
        <ListGroup
          title={`Técnicos habilitados · ${filas.filter((n) => conPin.has(normalizar(n))).length} de ${filas.length}`}
          footer="El PIN se muestra una sola vez: la app guarda solo su huella. Quitarle o reiniciar el PIN a un técnico saca también a sus teléfonos."
        >
          {filas.map((nombre) => {
            const tiene = conPin.has(normalizar(nombre))
            const bloqueo = bloqueoDe(nombre)
            const minutos = bloqueo?.hastaMs ? Math.max(1, Math.ceil((bloqueo.hastaMs - ahora) / 60000)) : 0
            const subtitulo = !tiene
              ? 'Sin PIN'
              : bloqueo?.total
                ? 'Bloqueado por intentos: reinicia su PIN'
                : bloqueo && minutos > 0 && (bloqueo.hastaMs ?? 0) > ahora
                  ? `Bloqueado ${minutos} min por intentos fallidos`
                  : `PIN asignado${telefonosDe(nombre) ? ` · ${telefonosDe(nombre)} ${telefonosDe(nombre) === 1 ? 'teléfono' : 'teléfonos'}` : ''}`
            const abierto = desplegado === nombre
            return (
              <div
                key={nombre}
                className='relative flex flex-col px-4 py-1 before:absolute before:left-[58px] before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
              >
                <div className="flex min-h-[52px] items-center gap-3">
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground">
                    <KeyRound className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body leading-tight">{nombre}</p>
                    <p className={`text-footnote ${bloqueo ? 'font-semibold text-ink-warn' : 'text-muted-foreground'}`}>{subtitulo}</p>
                  </div>
                  {!tiene ? (
                    <Button variant="plain" className="-mr-3 shrink-0" disabled={Boolean(ocupado)} onClick={() => void asignar(nombre)}>
                      {ocupado === `pin:${nombre}` ? <Loader2 className="animate-spin" /> : null} Asignar PIN
                    </Button>
                  ) : (
                    <Button
                      variant="plain"
                      className="-mr-3 shrink-0"
                      aria-expanded={abierto}
                      onClick={() => {
                        setConfirmar(null)
                        setDesplegado(abierto ? null : nombre)
                      }}
                    >
                      PIN <ChevronDown className={`transition-transform duration-150 motion-reduce:transition-none ${abierto ? 'rotate-180' : ''}`} />
                    </Button>
                  )}
                </div>
                {tiene && abierto && (
                  <div className="flex flex-wrap justify-end gap-1 pb-2 pl-[42px]">
                    {botonConfirmable({ tipo: 'reiniciar', nombre }, `pin:${nombre}`, 'Reiniciar PIN', 'Confirmar: el PIN actual deja de servir', () => void asignar(nombre))}
                    {botonConfirmable(
                      { tipo: 'quitar-pin', nombre },
                      `quitar:${nombre}`,
                      'Quitar PIN',
                      'Confirmar: sin PIN no entra',
                      () => void ejecutar(`quitar:${nombre}`, async () => void (await api.quitarPin(plantId, nombre))),
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </ListGroup>

        {/* Teléfonos */}
        <ListGroup title={`Teléfonos con el pase · ${dispositivos.length}`} footer="«Quitar» lo corta al instante en la bitácora; las fotos, en menos de una hora.">
          {dispositivos.length === 0 ? (
            <p className="px-4 py-3 text-footnote text-muted-foreground">Ningún teléfono ha entrado todavía.</p>
          ) : (
            dispositivos.map((d) => (
              <ListCell
                key={d.uid}
                leading={
                  <span className="flex size-[30px] items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground">
                    <Smartphone className="size-4" aria-hidden />
                  </span>
                }
                title={d.nombre}
                subtitle={`${d.dispositivo}${d.creadoEnMs ? ` · desde el ${fechaCorta(d.creadoEnMs)}` : ''}`}
                trailing={botonConfirmable(
                  { tipo: 'quitar-telefono', uid: d.uid },
                  `tel:${d.uid}`,
                  'Quitar',
                  'Confirmar',
                  () => void ejecutar(`tel:${d.uid}`, () => api.quitarDispositivo(d.uid)),
                )}
              />
            ))
          )}
        </ListGroup>
      </div>
    </Sheet>
  )
}
