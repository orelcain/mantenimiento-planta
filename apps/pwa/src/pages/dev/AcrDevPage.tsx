/**
 * Vitrina del ACR (`/dev/acr`): el caso real del mockup SIN Firestore.
 *
 * R1 (SPEC_ACR_R1.md §7): fila con repetición, tarjeta de 3 preguntas con IA simulada (o fallo
 * simulado que cae a armar a mano) y la revisión semanal. Causas, acciones y la propuesta son el
 * texto del mockup R1 («a validar en terreno»); no son dato verificado. El evento sale del mockup
 * (7 min, «Se corta resorte ingreso chapaleta baader 1…», turno 24-09-2026). Sin Firestore.
 */
import { useState } from 'react'
import { Button, ListCell, ListGroup } from '@/components/piel'
import { AcrRapidoSheet } from '@/components/acr/AcrRapidoSheet'
import { AcrLectura } from '@/components/acr/AcrLectura'
import { FilaAnalisis } from '@/components/acr/AcrEntrada'
import { RevisionSemanalSheet } from '@/components/acr/RevisionSemanalSheet'
import type { Acr, AccionAcr, CausaAcr, EventoRefAcr } from '@/services/acr/acr.types'
import { detectarRepeticion, type EventoRepeticion } from '@/services/acr/repeticion'
import type { PropuestaIA, ProponerAcr } from '@/services/acr/proponerAcr'

const EVENTO_DEMO: EventoRefAcr = {
  id: 'demo-evento-resorte-n1',
  tipo: 'correctivo',
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

/**
 * Repetición con el detector real y los eventos reales del 24-09-2026 de `bitacoraEventos`.
 */
const HOY_DEMO = new Date(2026, 8, 24)
const EVENTO_N2: EventoRepeticion = {
  id: 'demo-evento-n2',
  equipo: 'EVISCERADORA BAADER 142 N2',
  descripcion: 'Se corta resorte ingreso chapaleta baader 2. Se reemplaza y normaliza',
  fechaTurno: '2026-09-24',
  minutosParada: 8,
}
const EVENTO_B200: EventoRepeticion = {
  id: 'demo-evento-b200',
  equipo: 'BAADER 200',
  descripcion: 'Se cortan resortes alimentacion 1 y 2 , se reutilizan los mismos',
  fechaTurno: '2026-09-24',
  minutosParada: 6,
}
const REPETICION_DEMO = detectarRepeticion(EVENTO_DEMO, [EVENTO_N2, EVENTO_B200], HOY_DEMO)

/** Propuesta simulada de la IA: el texto que muestra el mockup R1 («Propuesta IA»). */
const PROPUESTA_DEMO: PropuestaIA = {
  modelo: 'demo',
  causas: [
    { id: 'd-fisica', texto: 'Resorte cortado por fatiga', nivel: 'fisica', m6: null },
    { id: 'd-humana', texto: 'Se cambia sin registrar horas de uso', nivel: 'humana', m6: null },
    { id: 'd-latente', texto: 'Golpe de la chapaleta sin amortiguar en N1 y N2', nivel: 'latente', m6: null },
  ],
  acciones: [
    {
      id: 'd-accion',
      texto: 'Regulador de aire en N1 y N2: cambia la condición, no depende de nadie',
      fuerza: 'fuerte',
      causaId: 'd-latente',
      responsable: '',
      fechaLimite: null,
      estado: 'pendiente',
    },
  ],
}

/** La IA simulada tarda 600 ms; con «Simular fallo» responde con error (cae a armar a mano). */
const proponerDemo = (fallar: boolean): ProponerAcr => () =>
  new Promise<PropuestaIA>((resolver, rechazar) => {
    setTimeout(() => (fallar ? rechazar(new Error('Fallo simulado de la IA')) : resolver(PROPUESTA_DEMO)), 600)
  })

/** Un análisis de revisión semanal: mismos datos que la tabla del mockup («Semana del 21 al 27-09»). */
function acrRevision(id: string, equipo: string, definicion: string, acciones: AccionAcr[], causas: CausaAcr[] = []): Acr {
  const ahora = new Date('2026-09-24T12:00:00')
  return {
    id,
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: [EVENTO_DEMO.id],
    equipo,
    fechaTurno: '2026-09-24',
    definicion,
    minutosDetencion: null,
    evidencias: [],
    piezaGuardada: false,
    causas,
    acciones,
    verificacion: { criterio: `Sin repetir la falla en ${equipo} durante 60 días`, dias: 60, resultado: 'pendiente' },
    estado: 'borrador',
    createdBy: 'demo',
    createdByNombre: 'Demo',
    createdAt: ahora,
    updatedAt: ahora,
  }
}

const accionRevision = (id: string, texto: string, fuerza: AccionAcr['fuerza']): AccionAcr => ({
  id,
  texto,
  fuerza,
  causaId: null,
  responsable: '',
  fechaLimite: null,
  estado: 'pendiente',
})

const REVISION_DEMO: Acr[] = [
  acrRevision('demo-rev-1', 'EVISCERADORA BAADER 142 N1', 'Resorte chapaleta cortado', [
    accionRevision('demo-rev-1a', 'Regulador de aire en N1 y N2', 'fuerte'),
    accionRevision('demo-rev-1b', 'Revisar resorte en el engrase', 'debil'),
  ]),
  acrRevision('demo-rev-2', 'BAADER 200', 'Resortes alimentación cortados', [
    accionRevision('demo-rev-2a', 'Cambiar por nuevos, no reutilizar', 'fuerte'),
  ]),
]

export function AcrDevPage() {
  const [acr, setAcr] = useState<Acr>(acrDemo)
  const [vista, setVista] = useState<'ninguna' | 'r1' | 'lectura' | 'revision'>('ninguna')
  const [fallar, setFallar] = useState(false)
  const [revision, setRevision] = useState<Acr[]>(REVISION_DEMO)
  const [ultimo, setUltimo] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-[40rem] flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-title2 font-semibold text-foreground">Causa raíz (R1)</h1>
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

      <section className="flex flex-col gap-2">
        <p className="text-footnote font-semibold text-muted-foreground">Fila del evento, con repetición</p>
        <FilaAnalisis
          acr={null}
          cargando={false}
          aplica
          repeticion={REPETICION_DEMO}
          onVer={() => setVista('lectura')}
          onAnalizar={() => setVista('r1')}
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-footnote font-semibold text-muted-foreground">Fila con análisis ya guardado</p>
        <FilaAnalisis
          acr={acr}
          cargando={false}
          aplica
          repeticion={null}
          onVer={() => setVista('lectura')}
          onAnalizar={() => setVista('r1')}
        />
      </section>

      <div className="flex flex-col gap-2.5">
        <Button variant="tinted" onClick={() => setVista('r1')}>
          Tarjeta R1 (3 preguntas)
        </Button>
        <Button variant="tinted" onClick={() => setVista('lectura')}>
          Vista de lectura (B)
        </Button>
        <Button variant="tinted" onClick={() => setVista('revision')}>
          Revisión semanal (supervisor)
        </Button>
        <Button variant="plain" onClick={() => setFallar((v) => !v)} aria-pressed={fallar}>
          {fallar ? 'Fallo de IA simulado: activo' : 'Simular fallo de la IA'}
        </Button>
      </div>

      {ultimo && <p className="text-footnote text-muted-foreground tabular-nums">Último guardado: {ultimo}</p>}

      <p className="text-footnote text-muted-foreground">
        Causas, acciones y la propuesta de la IA son el texto del mockup R1: a validar en terreno. La IA es simulada
        (600 ms). El caso real tiene una foto en la Bitácora; esta vitrina no la carga.
      </p>

      {vista === 'r1' && (
        <AcrRapidoSheet
          open
          onClose={() => setVista('ninguna')}
          evento={EVENTO_DEMO}
          repeticion={REPETICION_DEMO}
          proponer={proponerDemo(fallar)}
          onGuardar={(a) => {
            setAcr(a)
            setUltimo(`${a.estado}, ${a.causas.length} causas, ${a.acciones.length} acciones`)
          }}
        />
      )}
      {vista === 'lectura' && (
        <AcrLectura open onClose={() => setVista('ninguna')} acr={acr} onEditar={() => setVista('r1')} />
      )}
      {vista === 'revision' && (
        <RevisionSemanalSheet
          open
          onClose={() => setVista('ninguna')}
          acrs={revision}
          periodo="21-09-2026 → 27-09-2026 (ejemplo)"
          puedeEditar
          onGuardar={(a) => setRevision((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
        />
      )}
    </div>
  )
}
