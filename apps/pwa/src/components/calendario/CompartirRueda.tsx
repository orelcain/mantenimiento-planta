import { useCallback, useState } from 'react'
import { Check, Copy, Link2, RefreshCw, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui'
import { getCurrentUser } from '@/services/auth'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { crearTokenPublico, type RuedaPublicTokenDoc } from '@/services/ruedaPublicToken.service'
import type { MaquinaRueda } from '@/services/ruedaVentanas'

/**
 * Compartir el plan con quien no tiene cuenta en la app — que son justamente las
 * áreas con las que hay que negociar el horario.
 *
 * El link lleva un SNAPSHOT (ver ruedaPublicToken.service): por eso el diálogo
 * muestra de cuándo son los datos y ofrece «Actualizar», en vez de dar a
 * entender que se sincroniza solo.
 */
export interface CompartirRuedaProps {
  maquinas: MaquinaRueda[]
}

export function CompartirRueda({ maquinas }: CompartirRuedaProps) {
  const [abierto, setAbierto] = useState(false)
  const [doc, setDoc] = useState<RuedaPublicTokenDoc | null>(null)
  const [generando, setGenerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const url = doc ? `${window.location.origin}/mantenimiento-planta/rueda/${doc.token}` : ''

  const generar = useCallback(
    async (tokenExistente?: string) => {
      setGenerando(true)
      setError(null)
      try {
        const creado = await crearTokenPublico({
          titulo: 'Ventanas de intervención',
          maquinas,
          createdBy: getCurrentUser()?.uid ?? 'anon',
          token: tokenExistente,
        })
        setDoc(creado)
      } catch (e) {
        logger.error('Rueda: no se pudo crear el link', e instanceof Error ? e : new Error(String(e)))
        setError('No se pudo crear el link. Puede que tu cuenta no tenga permiso para compartir.')
      } finally {
        setGenerando(false)
      }
    },
    [maquinas],
  )

  const abrir = useCallback(() => {
    setAbierto(true)
    if (!doc) void generar()
  }, [doc, generar])

  const copiar = useCallback(async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('El navegador no dejó copiar. Selecciona el link a mano.')
    }
  }, [url])

  const compartirNativo = useCallback(async () => {
    if (!url || typeof navigator === 'undefined' || !navigator.share) return
    try {
      await navigator.share({
        title: 'Ventanas de intervención de Mantención',
        text: 'Cuándo puede entrar Mantención a cada máquina',
        url,
      })
    } catch {
      /* el usuario canceló: no es un error que reportar */
    }
  }, [url])

  const puedeCompartirNativo = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <>
      <button
        onClick={abrir}
        className={cn(
          'flex min-h-[44px] items-center gap-2 rounded-ctl border border-border bg-card px-3.5',
          'text-footnote font-medium text-muted-foreground transition-colors duration-150',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          'motion-reduce:transition-none',
        )}
      >
        <Link2 className="h-4 w-4" />
        Compartir link
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compartir el plan</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 pt-1">
            <p className="text-center text-footnote text-muted-foreground">
              Quien abra el link ve el plan en modo lectura, sin necesidad de cuenta.
            </p>

            {generando && <p className="py-6 text-body text-muted-foreground">Creando el link…</p>}

            {error && (
              <p className="rounded-ctl bg-destructive/10 p-3 text-center text-footnote text-destructive">
                {error}
              </p>
            )}

            {doc && !generando && (
              <>
                <div className="rounded-card bg-white p-3">
                  <QRCodeSVG value={url} size={168} />
                </div>

                <p className="w-full break-all rounded-ctl bg-muted/50 p-2.5 text-center font-mono text-caption text-muted-foreground">
                  {url}
                </p>

                <div className="flex w-full flex-col gap-2">
                  <button
                    onClick={copiar}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-ctl bg-primary text-body font-medium text-primary-foreground"
                  >
                    {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiado ? 'Link copiado' : 'Copiar link'}
                  </button>

                  {puedeCompartirNativo && (
                    <button
                      onClick={compartirNativo}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-ctl border border-border text-body text-muted-foreground"
                    >
                      <Share2 className="h-4 w-4" />
                      Compartir
                    </button>
                  )}

                  <button
                    onClick={() => void generar(doc.token)}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-ctl text-footnote text-muted-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Actualizar con los cambios de ahora
                  </button>
                </div>

                <p className="text-center text-caption text-muted-foreground">
                  El link lleva una copia del plan de este momento y vale 30 días. Si editas
                  después, usa «Actualizar» para que quien lo tenga vea lo nuevo.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
