/**
 * Tarjeta «Lector del espejo del grader» de Diagnóstico Matrix: prepara el instalador
 * (e1.3) con un código de alta de un solo uso, lista las llaves y detiene un lector
 * (revocar la llave). Publica la versión que la planta debe bajar.
 * El código de alta vive solo en memoria (estado de React); en Firestore queda su hash.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui'
import { ActionSheet, Pill } from '@/components/piel'
import { Copy, KeyRound, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import { formatearFechaCorta, formatearHaceX } from '@/services/grader/diagnosticoMatrix'
import {
  crearAlta,
  leerVersionPublicada,
  listarLlaves,
  publicarVersion,
  revocarLlave,
  type LlaveEspejo,
} from '@/services/grader/espejo/espejoLlaves.service'
import {
  VIGENCIA_ALTA_MIN,
  instaladorConAlta,
  versionDeLector,
} from '@/services/grader/espejo/espejoVersionLogica'
import { INSTALAR_LECTOR_ESPEJO_PS1 } from './instalarLectorEspejoScript'
import { COMANDO_REGISTRO_LECTOR, EstadoLectorEspejo } from './EstadoLectorEspejo'
import { COMANDO_RECARGA } from '@/services/grader/espejo/espejoEstado'

const NOMBRE_POR_DEFECTO = 'PC Matrix'

/** Versión que la planta tiene publicada; `undefined` mientras se lee. */
type VersionPublicada = { version: string; publicadaEnMs: number | null } | null

/** Alta lista para copiar: el código en claro no sale de aquí. */
interface AltaLista {
  codigo: string
  venceEnMs: number
}

function aError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

function horaDe(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function LectorEspejoCard() {
  const { toast } = useToast()
  const versionApp = versionDeLector(INSTALAR_LECTOR_ESPEJO_PS1)
  const [llaves, setLlaves] = useState<LlaveEspejo[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [nombre, setNombre] = useState(NOMBRE_POR_DEFECTO)
  const [pidiendoNombre, setPidiendoNombre] = useState(false)
  const [creando, setCreando] = useState(false)
  /** El alta en claro vive solo aquí, en memoria, hasta que se cierra el aviso con «Listo». */
  const [alta, setAlta] = useState<AltaLista | null>(null)
  const [porDetener, setPorDetener] = useState<LlaveEspejo | null>(null)
  const [publicada, setPublicada] = useState<VersionPublicada | undefined>(undefined)
  const [errorPublicada, setErrorPublicada] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)
  const [porPublicar, setPorPublicar] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLlaves(await listarLlaves())
      setErrorLista(null)
    } catch (e) {
      logger.error('LectorEspejo listar', aError(e))
      setErrorLista('No se pudo leer la lista de llaves. Hace falta sesión de administrador.')
    }
  }, [])

  const cargarPublicada = useCallback(async () => {
    try {
      setPublicada(await leerVersionPublicada())
      setErrorPublicada(null)
    } catch (e) {
      logger.error('LectorEspejo versión publicada', aError(e))
      setErrorPublicada('No se pudo leer la versión publicada.')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { void cargarPublicada() }, [cargarPublicada])

  async function copiar(texto: string, okTitulo: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast({ title: okTitulo })
    } catch (e) {
      logger.error('LectorEspejo copiar', aError(e))
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles.', variant: 'destructive' })
    }
  }

  async function preparar() {
    setCreando(true)
    try {
      const { codigo, venceEnMs } = await crearAlta(nombre)
      setAlta({ codigo, venceEnMs })
      setNombre(NOMBRE_POR_DEFECTO)
      setPidiendoNombre(false)
    } catch (e) {
      logger.error('LectorEspejo preparar instalador', aError(e))
      toast({ title: 'No se pudo preparar el instalador', description: aError(e).message, variant: 'destructive' })
    } finally {
      setCreando(false)
    }
  }

  function copiarInstalador() {
    if (!alta) return
    let texto: string
    try {
      texto = instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, alta.codigo)
    } catch (e) {
      logger.error('LectorEspejo armar instalador', aError(e))
      toast({ title: 'No se pudo armar el instalador', description: aError(e).message, variant: 'destructive' })
      return
    }
    void copiar(texto, 'Instalador copiado')
  }

  async function publicar() {
    if (!versionApp) return
    setPorPublicar(false)
    setPublicando(true)
    try {
      await publicarVersion(versionApp)
      toast({ title: `${versionApp} publicada para planta` })
      await cargarPublicada()
    } catch (e) {
      logger.error('LectorEspejo publicar', aError(e))
      toast({ title: `No se pudo publicar ${versionApp}`, description: aError(e).message, variant: 'destructive' })
    } finally {
      setPublicando(false)
    }
  }

  async function detener(l: LlaveEspejo) {
    setPorDetener(null)
    try {
      await revocarLlave(l.hash)
      toast({ title: 'Lector detenido', description: `La llave «${l.nombre}» quedó revocada.` })
      await cargar()
    } catch (e) {
      logger.error('LectorEspejo revocar', aError(e))
      toast({ title: 'No se pudo detener el lector', description: aError(e).message, variant: 'destructive' })
    }
  }

  const ahora = Date.now()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Lector del espejo del grader</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          El lector corre en el PC de Matrix y envía cada 5 minutos lo que ve en «Pieza pieza Grader». Cada lector usa una llave propia; detenerlo revoca esa llave.
        </p>
        <p className="text-xs text-muted-foreground">
          El lector mueve las fechas del rango y desmarca «Limitar»; no toca nada más. Si Matrix no toma el rango, deja las fechas como estaban. Mientras corre, evita que el PC se suspenda; el bloqueo con contraseña de planta no se toca.
        </p>

        <ol className="list-decimal space-y-1 pl-4 text-xs" aria-label="Pasos para instalar el lector">
          <li>Prepara el instalador y cópialo.</li>
          <li>En el PC de Matrix, con «Pieza pieza Grader» en pantalla, abre PowerShell, pega y pulsa Enter (un solo pegado; el código vence en {VIGENCIA_ALTA_MIN} min y sirve una vez).</li>
          <li>Espera 2 minutos y mira «Último estado del lector»: Vivo, versión {versionApp ?? 'nueva'} y «Arranque: solo (tarea de Windows)».</li>
          <li>Desde ahí arranca solo al iniciar sesión y se repara si se cae; para detenerlo usa «Detener lector».</li>
          <li>Si algo falla, copia el comando del registro y saca una foto.</li>
        </ol>

        {alta ? (
          <div className="space-y-2 rounded-ctl border border-border p-3">
            <p className="text-xs font-medium">Instalador listo · vence a las {horaDe(alta.venceEnMs)} · sirve una sola vez</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copiarInstalador}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar instalador ({versionApp ?? '—'})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAlta(null); void cargar() }}>
                Listo
              </Button>
            </div>
          </div>
        ) : pidiendoNombre ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) void preparar() }}
          >
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre corto, por ejemplo PC Matrix"
              maxLength={60}
              autoFocus
              aria-label="Nombre del instalador"
              className="h-9 max-w-xs text-sm"
            />
            <Button size="sm" type="submit" disabled={creando || !nombre.trim()}>
              {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Preparar
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => { setPidiendoNombre(false); setNombre(NOMBRE_POR_DEFECTO) }}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setPidiendoNombre(true)}>
            <KeyRound className="h-4 w-4 mr-2" />
            Preparar instalador
          </Button>
        )}

        {errorLista && <p className="text-xs text-destructive">{errorLista}</p>}
        {llaves && llaves.length === 0 && !errorLista && (
          <p className="text-xs text-muted-foreground">Todavía no hay llaves.</p>
        )}
        {llaves && llaves.length > 0 && (
          <ul className="space-y-2">
            {llaves.map((l) => (
              <li key={l.hash} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.nombre}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Creada {l.creadaEnMs ? formatearFechaCorta(l.creadaEnMs) : '—'} · Último uso {l.ultimoUsoMs ? formatearHaceX(l.ultimoUsoMs, ahora) : 'nunca'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {l.revocada ? <Pill tone="neutral">Detenido</Pill> : <Pill tone="ok" dot>Activa</Pill>}
                  {!l.revocada && (
                    <Button size="sm" variant="outline" onClick={() => setPorDetener(l)}>
                      Detener lector
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-ctl border border-border p-3">
          <p className="text-xs font-medium">Versión del lector</p>
          <p className="text-xs tabular-nums">En esta app: {versionApp ?? '—'}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs tabular-nums">
              {publicada === undefined
                ? errorPublicada ? 'Publicada para planta: no se pudo leer' : 'Publicada para planta: leyendo…'
                : publicada
                  ? `Publicada para planta: ${publicada.version}${publicada.publicadaEnMs ? ` · ${formatearFechaCorta(publicada.publicadaEnMs)}` : ''}`
                  : 'Publicada para planta: ninguna'}
            </p>
            {versionApp && publicada?.version === versionApp ? (
              <Pill tone="ok" dot>Publicada</Pill>
            ) : versionApp && publicada !== undefined ? (
              <Button size="sm" variant="outline" disabled={publicando} onClick={() => setPorPublicar(true)}>
                {publicando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Publicar {versionApp}
              </Button>
            ) : null}
          </div>
          {errorPublicada && <p className="text-xs text-destructive">{errorPublicada}</p>}
          <p className="text-xs text-muted-foreground">Un cambio en la app no llega a planta hasta que lo publicas aquí.</p>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium">Último estado del lector</p>
          <EstadoLectorEspejo />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiar(COMANDO_REGISTRO_LECTOR, 'Comando del registro copiado')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar comando del registro
          </Button>
          <p className="text-xs text-muted-foreground">
            Pégalo en PowerShell en el PC de Matrix: muestra las últimas 25 líneas del registro del lector.
          </p>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium">Recargar días anteriores (desde e1.6)</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>En Matrix, «Pieza pieza Grader»: pon a mano el rango de los días que faltan (por ejemplo, de 00:00 del primer día a 00:00 del día siguiente al último) y desmarca «Limitar».</li>
            <li>Pega el comando en PowerShell en el PC de Matrix. El lector lee todo el rango por tramos, sin repetir piezas; el avance sale arriba, en «Recarga de historia».</li>
            <li>Cuando diga «terminada», vuelve el rango de Matrix a hoy (inicio hoy 00:00, fin pasado mañana 00:00). El lector sigue solo con el turno.</li>
          </ol>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiar(COMANDO_RECARGA, 'Comando de recarga copiado')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar comando de recarga
          </Button>
          <p className="text-xs text-muted-foreground">
            Un día completo tarda unos 5 minutos y, mientras dura, el lector no lee el turno en curso: hazlo fuera de producción si se puede. Para cancelar, borra el archivo RECARGA de esa carpeta.
          </p>
        </div>
      </CardContent>

      <ActionSheet
        open={porDetener !== null}
        title={porDetener ? `¿Detener el lector «${porDetener.nombre}»?` : ''}
        description="La llave queda revocada y el lector se cierra solo en su próximo aviso. Para volver a usarlo hay que preparar otro instalador."
        confirmLabel="Detener lector"
        onConfirm={() => { if (porDetener) void detener(porDetener) }}
        onCancel={() => setPorDetener(null)}
      />

      <ActionSheet
        open={porPublicar && versionApp !== null}
        title={`¿Publicar ${versionApp ?? ''} para planta?`}
        description="El lector de planta la baja en su próximo ciclo, comprueba su huella (sha256) y se reinicia. Si no completa un ciclo en 15 minutos, vuelve solo a la versión anterior."
        confirmLabel={`Publicar ${versionApp ?? ''}`}
        onConfirm={() => void publicar()}
        onCancel={() => setPorPublicar(false)}
      />
    </Card>
  )
}
