import { ClipboardCopy, FileDown, Loader2, MessageCircle } from 'lucide-react'
import { Button, ListCell, ListGroup, Sheet } from '@/components/piel'

/**
 * «Compartir» del turno en el teléfono (mockup iOS 27 aprobado 17-09-2026): las
 * tres salidas viven en una hoja detrás de un solo ícono de la cabecera, en vez
 * de una fila de tres botones en medio de la página. En PC siguen los botones.
 */
export function CompartirTurnoSheet({
  open,
  onClose,
  resumen,
  trabajando,
  sinEventos,
  onCorreo,
  onWhatsapp,
  onPdf,
}: {
  open: boolean
  onClose: () => void
  /** «Turno tarde 16-09 · 8 eventos · 12 fotos». */
  resumen: string
  trabajando: null | 'copiar' | 'pdf' | string
  sinEventos: boolean
  onCorreo: () => void
  onWhatsapp: () => void
  onPdf: () => void
}) {
  const icono = (children: React.ReactNode) => (
    <span className="flex size-[30px] items-center justify-center rounded-ctl bg-muted-foreground/10 text-muted-foreground [&>svg]:size-4">{children}</span>
  )
  const ocupado = Boolean(trabajando)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compartir el turno"
      description={resumen}
      actions={
        <Button variant="tinted" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {sinEventos ? (
        <p className="text-body text-muted-foreground">Todavía no hay eventos publicados en este turno.</p>
      ) : (
        <ListGroup>
          <ListCell
            leading={icono(trabajando === 'copiar' ? <Loader2 className="animate-spin" /> : <ClipboardCopy />)}
            title="Copiar para correo"
            chevron={false}
            subtitle="Con las fotos · pégalo en el correo"
            onClick={ocupado ? undefined : onCorreo}
            aria-disabled={ocupado}
          />
          <ListCell
            leading={icono(<MessageCircle />)}
            title="Enviar por WhatsApp"
            subtitle="Mensaje y una lámina por evento"
            chevron
            onClick={ocupado ? undefined : onWhatsapp}
            aria-disabled={ocupado}
          />
          <ListCell
            leading={icono(trabajando === 'pdf' ? <Loader2 className="animate-spin" /> : <FileDown />)}
            title="Exportar PDF"
            chevron={false}
            subtitle="Para imprimir o archivar"
            onClick={ocupado ? undefined : onPdf}
            aria-disabled={ocupado}
          />
        </ListGroup>
      )}
    </Sheet>
  )
}
