import { useMemo, useState } from 'react'
import { PendientesDeUbicar, type OpcionUbicar } from '@/components/lineasProceso/PendientesDeUbicar'
import { claveDeNombre, pendientesDeUbicar } from '@/services/lineasProceso/pendientesDeUbicar'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/**
 * Vitrina del grupo «Nombrados a mano en la bitácora» con DATOS DE EJEMPLO — solo desarrollo
 * (`/dev/pendientes`, detrás de `import.meta.env.DEV`). Sin Firestore: elegir un equipo o
 * descartar un nombre solo cambia el estado en memoria. Nació el 21-09-2026 para mirar la
 * bandeja sin sesión; el editor real la muestra dentro de «Qué le falta a este diagrama».
 */
const ev = (id: string, equipo: string, fechaTurno: string, turnoId: string, quien: string, descripcion: string): EventoBitacora =>
  ({
    id,
    plantId: 'chonchi',
    turnoId,
    fechaTurno,
    banda: turnoId.endsWith('noche') ? 'noche' : 'dia',
    tipo: 'correctivo',
    equipo,
    equipoId: null,
    equipoCodigo: null,
    titulo: '',
    descripcion,
    horaInicio: '',
    horaTermino: null,
    impacto: 'no-aplica',
    minutosParada: null,
    ventana: null,
    pendiente: false,
    fotos: [],
    creadoPor: 'u1',
    autorNombre: quien,
    registradoPor: quien,
  }) as unknown as EventoBitacora

const EVENTOS: EventoBitacora[] = [
  ev('1', 'baader 143', '2026-09-21', '2026-09-21_noche', 'Danilo Cortes', 'Cuchillo trabado, se cambia el disco y se prueba'),
  ev('2', 'Baader 143', '2026-09-18', '2026-09-18_dia', 'Jose Chodil', 'Ajuste de guías de entrada'),
  ev('3', 'TABLERO CONTROL TOLVA RIÑONES', '2026-09-21', '2026-09-21_noche', 'Jose Chodil', 'Ingreso de agua, fuente 24 V quemada; se opera a mano'),
  ev('4', 'Sala de bombas NH3', '2026-09-14', '2026-09-14_dia', 'Danilo Cortes', 'Fuga menor en válvula, se ajusta prensa'),
]

const OPCIONES: OpcionUbicar[] = [
  { id: 'n1', nombre: 'EVISCERADORA BAADER 142 N1', codigo: '720004410', ruta: 'Planta Chonchi › Eviscerado', peso: 1 / 3 },
  { id: 'n2', nombre: 'EVISCERADORA BAADER 142 N2', codigo: '720004411', ruta: 'Planta Chonchi › Eviscerado', peso: 1 / 3 },
  { id: 'n3', nombre: 'EVISCERADORA BAADER 142 N3', codigo: '720004412', ruta: 'Planta Chonchi › Eviscerado', peso: 1 / 3 },
  { id: 'g1', nombre: 'GRADER MS4', codigo: '720004980', ruta: 'Planta Chonchi › Emparrillado', peso: 1 },
  { id: 't1', nombre: 'TOLVA GENERAL RILES', codigo: '720005120', ruta: 'Planta Chonchi › Riles' },
  { id: 'k1', nombre: 'KNURO N1', codigo: '720004301', ruta: 'Planta Chonchi › Filete', peso: 0.5 },
]

export function PendientesDevPage() {
  const [corregidos, setCorregidos] = useState<Set<string>>(() => new Set())
  const [descartados, setDescartados] = useState<string[]>([])
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [registro, setRegistro] = useState<string[]>([])

  const grupos = useMemo(
    () => pendientesDeUbicar(EVENTOS.filter((e) => !corregidos.has(e.id)), { nombresConocidos: OPCIONES.map((o) => o.nombre), descartados }),
    [corregidos, descartados],
  )

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <p className="text-caption text-muted-foreground">Vitrina · datos de ejemplo · nada se guarda. El grupo vive en el panel derecho del editor de líneas.</p>
      <div className="rounded-card border border-border bg-card p-4">
        <PendientesDeUbicar
          grupos={grupos}
          opciones={OPCIONES}
          trabajando={trabajando}
          onElegir={(g, eq) => {
            setTrabajando(g.clave)
            window.setTimeout(() => {
              setCorregidos((s) => new Set([...s, ...g.eventos.map((e) => e.id)]))
              setRegistro((r) => [`«${g.nombre}» → ${eq.nombre} (${g.eventos.length})`, ...r])
              setTrabajando(null)
            }, 600)
          }}
          onCrearManual={(nombre) => setRegistro((r) => [`crear manual «${nombre}»`, ...r])}
          onDescartar={(g) => {
            setDescartados((d) => [...d, claveDeNombre(g.nombre)])
            setRegistro((r) => [`descartado «${g.nombre}»`, ...r])
          }}
        />
      </div>
      {registro.length > 0 && (
        <ul className="text-caption text-muted-foreground">
          {registro.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
