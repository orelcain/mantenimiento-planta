import { useMemo, useState } from 'react'
import { PanelInspeccion } from '@/components/bitacora/PanelInspeccion'
import {
  PAUTA_POST_ASEO,
  resumenDeInspeccion,
  type EstadoLiberacion,
  type Inspeccion,
  type ResultadoCriterio,
} from '@/services/inspecciones/modeloInspeccion'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/**
 * Vitrina del panel de inspección post-aseo con DATOS DE EJEMPLO — solo desarrollo (la ruta
 * `/dev/inspeccion` va detrás de `import.meta.env.DEV`). Sin Firestore: el estado vive en
 * memoria, así que se puede marcar, anotar, corregir la hora y entregar sin sesión.
 *
 * Nació el 21-09-2026 para revisar contra el HIG «Boxes» las cajas anidadas del panel: la
 * pestaña real necesita sesión de Firebase y no se podía mirar sin ella.
 */
const AHORA = '2026-09-21T04:16:00'

const EVENTO_ELECTRICO: EventoBitacora = {
  id: 'ev-1',
  plantId: 'chonchi',
  turnoId: '2026-09-21_noche',
  fechaTurno: '2026-09-21',
  banda: 'noche',
  tipo: 'correctivo',
  equipo: 'TABLERO CONTROL TOLVA RIÑONES',
  equipoCodigo: null,
  equipoId: null,
  titulo: '',
  descripcion:
    'Tablero con ingreso de agua provocando fallas a tierra y fuente de poder 24 V quemada junto a PLC; se trabaja de forma manual durante la noche realizando cambios en cilindro neumático para no detener proceso',
  horaInicio: '',
  horaTermino: null,
  impacto: 'afecta-sin-detener',
  minutosParada: null,
  ventana: null,
  pendiente: true,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'Danilo Cortes',
  registradoPor: 'Jose Chodil',
  inspeccion: { id: 'chonchi_2026-09-21_noche', criterioId: 'electrico' },
} as unknown as EventoBitacora

export function InspeccionDevPage() {
  const [resultados, setResultados] = useState<Record<string, ResultadoCriterio>>({
    mecanico: 'corregido',
    electrico: 'controlado',
    neumatico: 'conforme',
    seguridad: 'conforme',
    operacional: 'conforme',
  })
  const [notas, setNotas] = useState<Record<string, string>>({
    mecanico: 'Cinta azul alimentación baader 142 rozaba con estructura línea manual, se corrige',
  })
  const [marcas, setMarcas] = useState<Record<string, string>>({ mecanico: AHORA })
  const [liberacion, setLiberacion] = useState<Inspeccion['liberacion']>(null)
  const [desviaciones, setDesviaciones] = useState<EventoBitacora[]>([EVENTO_ELECTRICO])

  const inspeccion: Inspeccion = useMemo(
    () => ({
      id: 'chonchi_2026-09-21_noche',
      plantId: 'chonchi',
      turnoId: '2026-09-21_noche',
      fechaTurno: '2026-09-21',
      banda: 'noche',
      pautaId: PAUTA_POST_ASEO.id,
      pautaVersion: PAUTA_POST_ASEO.version,
      iniciadaEn: '2026-09-21T04:02:00',
      iniciadaPorNombre: 'Danilo Cortes',
      resultados,
      notas,
      marcas,
      liberacion,
    }),
    [resultados, notas, marcas, liberacion],
  )

  const resumen = useMemo(
    () =>
      resumenDeInspeccion(
        PAUTA_POST_ASEO,
        inspeccion,
        desviaciones.map((e) => ({
          id: e.id,
          criterioId: e.inspeccion?.criterioId ?? '',
          pendiente: e.pendiente && !e.cierre,
          critica: null,
          desdeMin: null,
          hastaMin: null,
        })),
      ),
    [inspeccion, desviaciones],
  )

  const marcar = (criterioId: string, r: ResultadoCriterio | null) =>
    setResultados((s) => {
      const n = { ...s }
      if (r) n[criterioId] = r
      else delete n[criterioId]
      return n
    })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <p className="text-caption text-muted-foreground">
        Vitrina · datos de ejemplo · nada se guarda. Turno noche 21-09-2026, Danilo Cortes.
      </p>
      <PanelInspeccion
        pauta={PAUTA_POST_ASEO}
        inspeccion={inspeccion}
        desviaciones={desviaciones}
        resumen={resumen}
        editable
        onIniciar={() => undefined}
        onMarcar={marcar}
        onFijarHora={(criterioId, hhmm) =>
          setMarcas((s) => {
            const n = { ...s }
            if (hhmm) n[criterioId] = `2026-09-21T${hhmm}:00`
            else delete n[criterioId]
            return n
          })
        }
        onNuevaDesviacion={(criterioId, nota) =>
          setDesviaciones((s) => [
            ...s,
            {
              ...EVENTO_ELECTRICO,
              id: `ev-${s.length + 1}`,
              equipo: 'EQUIPO DE EJEMPLO',
              descripcion: nota ?? 'Desviación de ejemplo abierta desde la vitrina',
              inspeccion: { id: inspeccion.id, criterioId },
            } as EventoBitacora,
          ])
        }
        onAnotar={(criterioId, nota) =>
          setNotas((s) => {
            const n = { ...s }
            if (nota.trim()) n[criterioId] = nota.trim()
            else delete n[criterioId]
            return n
          })
        }
        onAbrirEvento={() => undefined}
        onLiberar={(estado: EstadoLiberacion) =>
          setLiberacion({ estado, en: '2026-09-21T06:16:00', porNombre: 'Danilo Cortes', resumen })
        }
        onDeshacerLiberacion={() => setLiberacion(null)}
      />
    </div>
  )
}
