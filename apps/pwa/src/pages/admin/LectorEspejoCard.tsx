/**
 * Tarjeta «Lector del espejo del grader» de Diagnóstico Matrix: genera la llave del
 * lector del PC de planta, lista las llaves y detiene un lector (revocar la llave).
 * La llave se muestra UNA vez al crearla; en Firestore solo queda su hash.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui'
import { ActionSheet, Pill } from '@/components/piel'
import { Copy, KeyRound, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import { formatearFechaCorta, formatearHaceX } from '@/services/grader/diagnosticoMatrix'
import { crearLlave, listarLlaves, revocarLlave, type LlaveEspejo } from '@/services/grader/espejo/espejoLlaves.service'
import { INSTALAR_LECTOR_ESPEJO_PS1 } from './instalarLectorEspejoScript'

function aError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

export function LectorEspejoCard() {
  const { toast } = useToast()
  const [llaves, setLlaves] = useState<LlaveEspejo[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [pidiendoNombre, setPidiendoNombre] = useState(false)
  const [creando, setCreando] = useState(false)
  /** La llave en claro vive solo aquí, en memoria, hasta que se cierra el aviso. */
  const [llaveNueva, setLlaveNueva] = useState<string | null>(null)
  const [porDetener, setPorDetener] = useState<LlaveEspejo | null>(null)

  const cargar = useCallback(async () => {
    try {
      setLlaves(await listarLlaves())
      setErrorLista(null)
    } catch (e) {
      logger.error('LectorEspejo listar', aError(e))
      setErrorLista('No se pudo leer la lista de llaves. Hace falta sesión de administrador.')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function copiar(texto: string, okTitulo: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast({ title: okTitulo })
    } catch (e) {
      logger.error('LectorEspejo copiar', aError(e))
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles.', variant: 'destructive' })
    }
  }

  async function generar() {
    setCreando(true)
    try {
      const { llave } = await crearLlave(nombre)
      setLlaveNueva(llave)
      setNombre('')
      setPidiendoNombre(false)
      await cargar()
    } catch (e) {
      logger.error('LectorEspejo crear', aError(e))
      toast({ title: 'No se pudo generar la llave', description: aError(e).message, variant: 'destructive' })
    } finally {
      setCreando(false)
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

        {llaveNueva ? (
          <div className="space-y-2 rounded-ctl border border-border p-3">
            <p className="text-xs font-medium">Llave del lector</p>
            <code className="block break-all rounded-ctl bg-muted px-2 py-1.5 text-xs select-all">{llaveNueva}</code>
            <p className="text-xs text-muted-foreground">No se vuelve a mostrar. Cópiala ahora; si se pierde, genera otra y detén esta.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copiar(llaveNueva, 'Llave copiada')}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar llave
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLlaveNueva(null)}>
                Ya la copié
              </Button>
            </div>
          </div>
        ) : pidiendoNombre ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) void generar() }}
          >
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre corto, por ejemplo PC Matrix"
              maxLength={60}
              autoFocus
              aria-label="Nombre de la llave"
              className="h-9 max-w-xs text-sm"
            />
            <Button size="sm" type="submit" disabled={creando || !nombre.trim()}>
              {creando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Generar
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => { setPidiendoNombre(false); setNombre('') }}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setPidiendoNombre(true)}>
            <KeyRound className="h-4 w-4 mr-2" />
            Generar llave del lector
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

        {INSTALAR_LECTOR_ESPEJO_PS1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiar(INSTALAR_LECTOR_ESPEJO_PS1, 'Instalador copiado')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar instalador del lector
          </Button>
        )}

        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Genera la llave y cópiala.</li>
          <li>Copia el instalador del lector.</li>
          <li>Pégalo en PowerShell en el PC de Matrix, con «Pieza pieza Grader» en pantalla.</li>
          <li>Pega la llave cuando el instalador la pida.</li>
        </ol>
      </CardContent>

      <ActionSheet
        open={porDetener !== null}
        title={porDetener ? `¿Detener el lector «${porDetener.nombre}»?` : ''}
        description="La llave queda revocada y el lector se cierra solo en su próximo aviso. Para volver a usarlo hay que generar otra llave."
        confirmLabel="Detener lector"
        onConfirm={() => { if (porDetener) void detener(porDetener) }}
        onCancel={() => setPorDetener(null)}
      />
    </Card>
  )
}
