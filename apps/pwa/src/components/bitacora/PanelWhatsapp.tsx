import { Fragment, type ReactNode } from 'react'
import { Check, MessageSquareText } from 'lucide-react'
import { Button, ListCell, ListGroup } from '@/components/piel'
import { useToast } from '@/hooks/useToast'
import { copiarImagen, copiarTexto } from '@/lib/clipboard'
import type { LaminaGenerada } from '@/hooks/useLaminasWhatsapp'
import { SEPARADOR_EVENTOS, type LaminaWhatsapp } from '@/services/bitacora/bitacoraWhatsapp'

/**
 * Envío de la bitácora por WhatsApp (mockup aprobado 16-09-2026): el mensaje y
 * una lámina por evento con fotos.
 *
 * - PC (WhatsApp Web): pasos para copiar y pegar pieza por pieza, porque
 *   WhatsApp Web recibe una imagen por cada Ctrl+V.
 * - Celular: el menú de compartir del teléfono manda todo de una vez.
 */

export const PASO_MENSAJE = 'mensaje'

/** "2 fotos · antes y después · parte 1 de 2". */
function detalleLamina(l: LaminaWhatsapp): string {
  const n = l.fotos.length
  const antesDespues = l.fotos.some((f) => f.etiqueta === 'antes') && l.fotos.some((f) => f.etiqueta === 'despues')
  return [`${n} ${n === 1 ? 'foto' : 'fotos'}`, antesDespues ? 'antes y después' : '', l.partes > 1 ? `parte ${l.parte} de ${l.partes}` : '']
    .filter(Boolean)
    .join(' · ')
}

function nombreLamina(l: LaminaWhatsapp): string {
  return `Lámina ${l.numero} · ${equipoLamina(l)}`
}

const equipoLamina = (l: LaminaWhatsapp) => l.evento.equipo?.trim() || 'Sin equipo'

/** `*negrita*` y `_cursiva_` de WhatsApp, para la vista previa. */
function conFormato(linea: string): ReactNode[] {
  return linea.split(/(`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g).map((trozo, i) => {
    if (/^`[^`\n]+`$/.test(trozo))
      return (
        <code key={i} className="rounded-[5px] bg-muted-foreground/15 px-1 font-mono text-[0.95em]">
          {trozo.slice(1, -1)}
        </code>
      )
    if (/^\*[^*\n]+\*$/.test(trozo)) return <strong key={i} className="font-semibold">{trozo.slice(1, -1)}</strong>
    if (/^_[^_\n]+_$/.test(trozo)) return <em key={i}>{trozo.slice(1, -1)}</em>
    return <Fragment key={i}>{trozo}</Fragment>
  })
}

/** Una línea del mensaje como la dibuja WhatsApp: cita, viñeta, divisoria o texto. */
function LineaWhatsapp({ linea }: { linea: string }) {
  if (linea.startsWith('> '))
    return <p className="whitespace-pre-wrap break-words border-l-[3px] border-ink-ok/60 bg-muted-foreground/[0.06] py-0.5 pl-2">{conFormato(linea.slice(2))}</p>
  if (linea.startsWith('- '))
    return (
      <p className="whitespace-pre-wrap break-words pl-4 -indent-3">
        <span aria-hidden>• </span>
        {conFormato(linea.slice(2))}
      </p>
    )
  if (linea === SEPARADOR_EVENTOS) return <p className="text-muted-foreground">{linea}</p>
  return <p className="min-h-[1em] whitespace-pre-wrap break-words">{conFormato(linea)}</p>
}

export interface PasosWhatsappProps {
  texto: string
  plan: readonly LaminaWhatsapp[]
  listas: readonly LaminaGenerada[]
  /** Pasos ya copiados: `PASO_MENSAJE` o la clave de cada lámina. */
  copiados: ReadonlySet<string>
  onCopiado: (paso: string) => void
  hayEventos: boolean
}

/** Los pasos de WhatsApp Web: copiar el mensaje y después cada lámina. */
export function PasosWhatsapp({ texto, plan, listas, copiados, onCopiado, hayEventos }: PasosWhatsappProps) {
  const { toast } = useToast()
  const porClave = new Map(listas.map((g) => [g.lamina.clave, g]))
  const siguiente = [PASO_MENSAJE, ...plan.map((l) => l.clave)].find((p) => !copiados.has(p))

  if (!hayEventos) {
    return (
      <p className="rounded-card bg-card px-4 py-6 text-center text-footnote text-muted-foreground">
        Aún no hay eventos publicados para enviar.
      </p>
    )
  }

  const copiarMensaje = async () => {
    try {
      await copiarTexto(texto)
      onCopiado(PASO_MENSAJE)
      toast({ title: 'Mensaje copiado', description: 'Pégalo en el chat con Ctrl+V y envíalo.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo copiar el mensaje', variant: 'destructive' })
    }
  }

  const copiarLamina = async (g: LaminaGenerada) => {
    try {
      await copiarImagen(g.png)
      onCopiado(g.lamina.clave)
      toast({
        title: `Lámina ${g.lamina.numero} copiada`,
        description:
          'Pégala en el chat con Ctrl+V y envíala.' +
          (g.fallidas ? ` ${g.fallidas === 1 ? 'Una foto no se pudo cargar' : `${g.fallidas} fotos no se pudieron cargar`}.` : ''),
        variant: g.fallidas ? 'default' : 'success',
      })
    } catch {
      toast({
        title: 'No se pudo copiar la imagen',
        description: 'Este navegador no deja copiar imágenes. Usa Chrome o Edge.',
        variant: 'destructive',
      })
    }
  }

  /** `corta` = la etiqueta en el celular, donde la fila es angosta. */
  const boton = (paso: string, etiqueta: string, corta: string, accion: () => void, listo = true) => {
    const hecho = copiados.has(paso)
    return (
      <Button
        variant={paso === siguiente ? 'tinted' : 'plain'}
        className="shrink-0 px-3"
        onClick={accion}
        disabled={!listo}
        aria-label={`${etiqueta}${hecho ? ' (ya copiado)' : ''}`}
      >
        {hecho ? (
          <>
            <Check className="text-ink-ok" aria-hidden /> Copiado
          </>
        ) : (
          <>
            <span className="md:hidden">{corta}</span>
            <span className="hidden md:inline">{etiqueta}</span>
          </>
        )}
      </Button>
    )
  }

  return (
    <ListGroup
      footer={
        plan.length
          ? 'En WhatsApp Web: Ctrl+V y Enter en cada pieza. Los eventos sin fotos van solo en el mensaje.'
          : 'Ningún evento tiene fotos: basta con el mensaje.'
      }
    >
      <ListCell
        leading={
          <span className="flex size-12 items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground">
            <MessageSquareText className="size-5" aria-hidden />
          </span>
        }
        title="Mensaje"
        subtitle="Resumen y eventos del turno"
        trailing={boton(PASO_MENSAJE, 'Copiar mensaje', 'Copiar', () => void copiarMensaje())}
      />
      {plan.map((l) => {
        const g = porClave.get(l.clave)
        return (
          <ListCell
            key={l.clave}
            leading={
              g ? (
                <img src={g.url} alt="" className="size-12 rounded-ctl bg-muted-foreground/10 object-cover" />
              ) : (
                <span className="block size-12 animate-pulse rounded-ctl bg-muted-foreground/10 motion-reduce:animate-none" aria-hidden />
              )
            }
            title={equipoLamina(l)}
            subtitle={g ? `Lámina ${l.numero} · ${detalleLamina(l)}` : 'Preparando la lámina…'}
            trailing={boton(l.clave, `Copiar lámina ${l.numero}`, 'Copiar', () => g && void copiarLamina(g), Boolean(g))}
          />
        )
      })}
    </ListGroup>
  )
}

/** Cómo se verá en el chat: el mensaje y las láminas, en el orden en que se envían. */
export function VistaPreviaWhatsapp({ texto, listas }: { texto: string; listas: readonly LaminaGenerada[] }) {
  return (
    <div className="flex flex-col items-end gap-2 rounded-card bg-muted-foreground/10 p-4">
      <div className="max-w-[92%] rounded-[22px] bg-card px-4 py-3 text-footnote shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
        {texto.split('\n').map((linea, i) => (
          <LineaWhatsapp key={i} linea={linea} />
        ))}
      </div>
      {listas.map((g) => (
        <img
          key={g.lamina.clave}
          src={g.url}
          alt={`${nombreLamina(g.lamina)}: ${detalleLamina(g.lamina)}`}
          className="w-[260px] max-w-[80%] rounded-[22px] bg-card p-1 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
        />
      ))}
    </div>
  )
}
