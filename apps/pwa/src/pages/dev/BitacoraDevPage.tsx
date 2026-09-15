import { useCallback, useMemo, useState } from 'react'
import { BitacoraTurnoCard } from '@/components/bitacora/BitacoraTurnoCard'
import { BitacoraTurnoVista } from '@/pages/BitacoraTurnoPage'
import type { FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA } from '@/config/bitacora'
import type { EventoBitacora, EventoBitacoraDatos, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { ordenarEventos } from '@/services/bitacora/resumenBitacora'
import { turnoMantencionEn } from '@/services/bitacora/turnoMantencion'

/**
 * Vitrina de la Bitácora con DATOS DE EJEMPLO — solo desarrollo (la ruta va
 * dentro de `import.meta.env.DEV`). Existe porque la bitácora real necesita
 * sesión y reglas desplegadas; así se revisa la línea de tiempo, el editor, el
 * copiado al correo y el PDF sin tocar la base.
 */

function fotoDeEjemplo(texto: string, tono: string, ancho = 1200, alto = 900): FotoEvento {
  const c = document.createElement('canvas')
  c.width = ancho
  c.height = alto
  const ctx = c.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, ancho, alto)
    g.addColorStop(0, tono)
    g.addColorStop(1, '#2b2b2b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, ancho, alto)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `bold ${Math.round(ancho / 12)}px sans-serif`
    ctx.fillText(texto, ancho * 0.06, alto * 0.9)
  }
  return { url: c.toDataURL('image/jpeg', 0.8), path: `ejemplo/${texto}-${Math.random()}`, etiqueta: 'foto', ancho, alto }
}

function eventosDeEjemplo(turno: TurnoMantencion): EventoBitacora[] {
  const base = {
    plantId: BITACORA_PLANTA.id,
    turnoId: turno.id,
    fechaTurno: turno.fecha,
    banda: turno.banda,
    creadoPor: 'ejemplo',
  }
  const h = (desde: number, min: number) => {
    const d = new Date(turno.inicio.getTime() + (desde * 60 + min) * 60_000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return [
    {
      ...base,
      id: 'ej-1',
      tipo: 'falla',
      equipo: 'BAADER 142',
      descripcion: 'Detención por E777. Muelle de tracción del carro cortado; se cambia y se prueba en vacío.',
      horaInicio: h(0, 20),
      horaTermino: h(0, 55),
      impacto: 'con-parada',
      minutosParada: 35,
      ventana: null,
      pendiente: false,
      fotos: [
        { ...fotoDeEjemplo('Antes', '#7a4b3a'), etiqueta: 'antes' },
        { ...fotoDeEjemplo('Después', '#3a6a7a'), etiqueta: 'despues' },
      ],
      autorNombre: 'Danilo Cortes',
    },
    {
      ...base,
      id: 'ej-2',
      tipo: 'ajuste',
      equipo: 'Grader MS4/12',
      descripcion: 'Puerta 3 descalibrada mandando piezas a puerta 0. Se recalibra la celda.',
      horaInicio: h(2, 5),
      horaTermino: h(2, 30),
      impacto: 'en-ventana',
      minutosParada: null,
      ventana: 'Colación HG',
      pendiente: false,
      fotos: [],
      autorNombre: 'Matias Serpa',
    },
    {
      ...base,
      id: 'ej-3',
      tipo: 'inspeccion',
      equipo: 'Sala de bombas NH₃',
      descripcion: 'Ronda motor 720004608 y bomba 720004607: temperatura y vibración normales.',
      horaInicio: h(5, 10),
      horaTermino: h(5, 25),
      impacto: 'no-aplica',
      minutosParada: null,
      ventana: null,
      pendiente: false,
      fotos: [{ ...fotoDeEjemplo('Ronda', '#4a5a3a', 900, 1200), etiqueta: 'foto' }],
      autorNombre: 'Danilo Cortes',
    },
    {
      ...base,
      id: 'ej-4',
      tipo: 'novedad',
      equipo: 'Enzunchadora TP-6000',
      descripcion: 'Motor de tensado con ruido. Sin repuesto en bodega; queda para el turno siguiente.',
      horaInicio: h(6, 30),
      horaTermino: null,
      impacto: 'no-aplica',
      minutosParada: null,
      ventana: null,
      pendiente: true,
      fotos: [],
      autorNombre: 'Matias Serpa',
    },
  ]
}

// Las fotos de ejemplo se dibujan en canvas: generarlas una vez por turno, no
// en cada render (si no, cambian de URL y parpadean).
const cacheEjemplo = new Map<string, EventoBitacora[]>()
function ejemploDe(turno: TurnoMantencion): EventoBitacora[] {
  if (turno.id !== turnoMantencionEn().id) return []
  let lista = cacheEjemplo.get(turno.id)
  if (!lista) {
    lista = eventosDeEjemplo(turno)
    cacheEjemplo.set(turno.id, lista)
  }
  return lista
}

function useEventosEjemplo(turno: TurnoMantencion) {
  const [porTurno, setPorTurno] = useState<Record<string, EventoBitacora[]>>({})
  const crudos = porTurno[turno.id] ?? ejemploDe(turno)
  const eventos = useMemo(() => ordenarEventos(turno, crudos), [turno, crudos])

  const guardar = useCallback(
    async (id: string, datos: EventoBitacoraDatos, esNuevo: boolean) => {
      setPorTurno((prev) => {
        const lista = prev[turno.id] ?? ejemploDe(turno)
        const previo = lista.find((e) => e.id === id)
        const evento: EventoBitacora = {
          ...(previo ?? {
            id,
            plantId: BITACORA_PLANTA.id,
            turnoId: turno.id,
            fechaTurno: turno.fecha,
            banda: turno.banda,
            creadoPor: 'ejemplo',
            autorNombre: 'Usuario de ejemplo',
          }),
          ...datos,
          ...(esNuevo ? {} : { actualizadoPorNombre: 'Usuario de ejemplo' }),
        }
        return { ...prev, [turno.id]: esNuevo ? [...lista, evento] : lista.map((e) => (e.id === id ? evento : e)) }
      })
    },
    [turno],
  )

  const borrar = useCallback(
    async (evento: EventoBitacora) => {
      setPorTurno((prev) => ({ ...prev, [turno.id]: (prev[turno.id] ?? crudos).filter((e) => e.id !== evento.id) }))
    },
    [turno, crudos],
  )

  return {
    eventos,
    cargando: false,
    error: null as string | null,
    sincronizando: false,
    ultimaSync: new Date(),
    nuevoId: () => `nuevo-${Date.now()}`,
    guardar,
    borrar,
  }
}

function useObservacionEjemplo() {
  const [texto, setTexto] = useState('')
  return {
    observacion: { texto, actualizadoPorNombre: texto ? 'Usuario de ejemplo' : null },
    guardarObservacion: async (t: string) => setTexto(t.trim()),
  }
}

const FUENTE_EJEMPLO: FuenteBitacora = {
  useEventos: useEventosEjemplo,
  useTecnicos: () => ['Danilo Cortes', 'Matias Serpa'],
  useObservacion: useObservacionEjemplo,
  subirFoto: async (_turnoId, _eventoId, archivo, etiqueta) => {
    const url = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(String(lector.result))
      lector.onerror = () => reject(new Error('No se pudo leer la foto'))
      lector.readAsDataURL(archivo)
    })
    return { url, path: `ejemplo/${archivo.name}-${Date.now()}`, etiqueta }
  },
}

export function BitacoraDevPage() {
  return (
    <div className="min-h-screen bg-background px-4 pb-10 pt-4 text-foreground md:px-8">
      <div role="note" className="mb-4 rounded-ctl bg-destructive px-4 py-2 text-footnote font-semibold text-destructive-foreground">
        Vitrina de desarrollo · datos de ejemplo, no se guarda nada
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="md:max-w-sm">
          <BitacoraTurnoCard useEventos={useEventosEjemplo} alAgregar={() => undefined} alVer={() => undefined} />
        </div>
        <BitacoraTurnoVista fuente={FUENTE_EJEMPLO} />
      </div>
    </div>
  )
}
