/**
 * Vitrina del ACR (`/dev/acr`): el caso real del mockup SIN Firestore.
 *
 * Causas y acciones son la PROPUESTA de `acr-mockup.html` («una propuesta para validar en
 * terreno»): aquí se muestran como ejemplo, no como dato verificado. El evento sale del
 * mockup (7 min, «Se corta resorte ingreso chapaleta baader 1…», turno 24-09-2026).
 * Las fotos del evento no se cargan en esta vitrina.
 */
import { useState } from 'react'
import { Button, ListCell, ListGroup } from '@/components/piel'
import { AcrSheet } from '@/components/acr/AcrSheet'
import { AcrLectura } from '@/components/acr/AcrLectura'
import type { subirFotoBitacora } from '@/services/bitacora/fotosBitacora'
import type { Acr, EventoRefAcr } from '@/services/acr/acr.types'

const EVENTO_DEMO: EventoRefAcr = {
  id: 'demo-evento-resorte-n1',
  // No se usa: la subida de foto de esta vitrina no toca Storage.
  turnoId: 'demo',
  fechaTurno: '2026-09-24',
  equipo: 'EVISCERADORA BAADER 142 N1',
  descripcion: 'Se corta resorte ingreso chapaleta baader 1. Se reemplaza y normaliza',
  minutosParada: 7,
  fotos: [],
}

/** Análisis de ejemplo: contenido del mockup (acr-mockup.html, marcos A y B). */
function acrDemo(): Acr {
  const ahora = new Date('2026-09-24T12:00:00')
  return {
    id: 'demo-acr-resorte-n1',
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: [EVENTO_DEMO.id],
    equipo: EVENTO_DEMO.equipo,
    fechaTurno: EVENTO_DEMO.fechaTurno,
    definicion: EVENTO_DEMO.descripcion,
    minutosDetencion: EVENTO_DEMO.minutosParada,
    evidencias: [],
    piezaGuardada: false,
    causas: [
      {
        id: 'c-fisica',
        texto: 'El resorte de ingreso de la chapaleta se cortó por fatiga en dos máquinas el mismo turno.',
        nivel: 'fisica',
        m6: 'maquina',
      },
      {
        id: 'c-humana',
        texto: 'Se reemplazó sin guardar el resorte cortado ni anotar sus horas de uso. La tarea no lo pide.',
        nivel: 'humana',
        m6: 'mano_obra',
      },
      {
        id: 'c-latente',
        texto: 'No hay cambio programado ni stock mínimo del resorte, y el golpe de la chapaleta solo se amortiguó en N3.',
        nivel: 'latente',
        m6: 'metodo',
      },
    ],
    acciones: [
      {
        id: 'a-humana',
        texto: 'Instruir a los turnos para revisar el resorte en cada engrase.',
        fuerza: 'debil',
        causaId: 'c-humana',
        responsable: 'jefe de turno Mantención',
        fechaLimite: null,
        estado: 'pendiente',
      },
      {
        id: 'a-latente',
        texto: 'Sumar «resorte chapaleta sin deformación» a la pauta de engrase y avisar en la PWA si se corta 2 veces en 30 días.',
        fuerza: 'media',
        causaId: 'c-latente',
        responsable: 'planificación',
        fechaLimite: null,
        estado: 'pendiente',
      },
      {
        id: 'a-fisica',
        texto: 'Instalar regulador de aire en la chapaleta de N1 y N2, igual que en N3, para bajar el golpe.',
        fuerza: 'fuerte',
        causaId: 'c-fisica',
        responsable: 'técnico línea eviscerado',
        fechaLimite: null,
        estado: 'pendiente',
      },
    ],
    verificacion: {
      criterio: 'Sin repetir la falla en EVISCERADORA BAADER 142 N1 durante 60 días',
      dias: 60,
      resultado: 'pendiente',
    },
    estado: 'borrador',
    createdBy: 'demo',
    createdByNombre: 'Demo',
    createdAt: ahora,
    updatedAt: ahora,
  }
}

/** Sin Storage: la foto queda como vista previa local del navegador. */
const subirFotoDemo: typeof subirFotoBitacora = async (_turno, _evento, archivo, etiqueta) => ({
  url: URL.createObjectURL(archivo),
  path: `demo/${archivo.name}`,
  etiqueta,
})

export function AcrDevPage() {
  const [acr, setAcr] = useState<Acr>(acrDemo)
  const [vista, setVista] = useState<'ninguna' | 'editor' | 'lectura'>('ninguna')

  return (
    <div className="mx-auto flex max-w-[40rem] flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-title2 font-semibold text-foreground">Análisis de causa raíz</h1>
        <p className="text-footnote text-muted-foreground">
          Vitrina de desarrollo (/dev/acr). Caso real de la Bitácora, sin Firestore.
        </p>
      </header>

      <ListGroup title="Evento de la Bitácora">
        <ListCell
          title={EVENTO_DEMO.equipo}
          subtitle={`24-09-2026 · ${EVENTO_DEMO.descripcion}`}
          value={`${EVENTO_DEMO.minutosParada} min`}
        />
      </ListGroup>

      <div className="flex flex-col gap-2.5">
        <Button variant="tinted" onClick={() => setVista('editor')}>
          Hoja guiada (A)
        </Button>
        <Button variant="tinted" onClick={() => setVista('lectura')}>
          Vista de lectura (B)
        </Button>
      </div>

      <p className="text-footnote text-muted-foreground">
        Causas y acciones: propuesta del mockup, a validar en terreno. El caso real tiene una foto en la Bitácora;
        esta vitrina no la carga.
      </p>

      {vista === 'editor' && (
        <AcrSheet
          open
          onClose={() => setVista('ninguna')}
          evento={EVENTO_DEMO}
          acrExistente={acr}
          onGuardar={setAcr}
          subirFoto={subirFotoDemo}
        />
      )}
      {vista === 'lectura' && (
        <AcrLectura open onClose={() => setVista('ninguna')} acr={acr} onEditar={() => setVista('editor')} />
      )}
    </div>
  )
}
