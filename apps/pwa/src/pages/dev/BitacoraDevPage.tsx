import { useCallback, useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { BitacoraTurnoCard } from '@/components/bitacora/BitacoraTurnoCard'
import { BitacoraTurnoVista } from '@/pages/BitacoraTurnoPage'
import type { FuenteBitacora } from '@/hooks/useBitacoraTurno'
import { BITACORA_PLANTA } from '@/config/bitacora'
import type { EventoBitacora, EventoBitacoraDatos, FotoEvento, TurnoMantencion } from '@/services/bitacora/bitacora.types'
import { ordenarEventos } from '@/services/bitacora/resumenBitacora'
import { fechaLocal, horaSugeridaParaEvento, turnoAdyacente, turnoDesdeId, turnoMantencionEn } from '@/services/bitacora/turnoMantencion'
import { HistorialBitacoraVista } from '@/pages/HistorialBitacoraPage'
import { fechaDesde, filasPorTurno, resumirPeriodo } from '@/services/bitacora/historialBitacora'
import { AJUSTES_VACIOS, type AjustesTecnicos } from '@/services/bitacora/listaTecnicos'
import { construirOpcionesEquipo, type NodoJerarquia } from '@/services/bitacora/buscarEquipos'
import type { DatoBodega, FuenteRepuestos, RepuestoDelCatalogo } from '@/services/bitacora/repuestosBitacora'

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
      equipo: 'EVISCERADORA BAADER 142 N3',
      equipoId: 'e2',
      equipoCodigo: '720004412',
      // Repuestos reales del maestro de la BAADER 142 (de ejemplo en este evento).
      repuestos: [
        { codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', cantidad: 1 },
        { codigoSAP: '3300011654', nombre: 'ANILLO 31000251', cantidad: 2 },
      ],
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
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Danilo Cortes',
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
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Matias Serpa',
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
      // Cinco fotos: en WhatsApp sale en dos láminas.
      fotos: (
        [
          ['Ronda', '#4a5a3a'],
          ['Motor', '#3a4a6a'],
          ['Bomba', '#5a3a4a'],
          ['Manómetro', '#6a5a3a'],
          ['Tablero', '#3a5a5a'],
        ] as const
      ).map(([t, tono]) => ({ ...fotoDeEjemplo(t, tono, 900, 1200), etiqueta: 'foto' as const })),
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Danilo Cortes',
    },
    {
      // Con título y tipo nuevo (16-09-2026), fotos vertical y horizontal.
      ...base,
      id: 'ej-5',
      tipo: 'correctivo',
      equipo: 'CASINO',
      titulo: 'Cambio de tubos fluorescentes',
      descripcion: 'Cambio de tubos fluorescentes en equipos de iluminación casino',
      horaInicio: h(1, 7),
      horaTermino: h(1, 30),
      impacto: 'no-aplica',
      minutosParada: null,
      ventana: null,
      pendiente: false,
      fotos: [
        { ...fotoDeEjemplo('Antes', '#6a5a3a', 900, 1600), etiqueta: 'antes' },
        { ...fotoDeEjemplo('Después', '#3a5a6a', 1600, 900), etiqueta: 'despues' },
      ],
      participantes: ['Danilo Cortes'],
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Mauricio Gallardo',
    },
    {
      // «Sin hora» y tipo escrito a mano: se ubica según cuándo se registró.
      ...base,
      id: 'ej-6',
      tipo: 'otro',
      tipoOtro: 'Mejora',
      equipo: 'EMPACADORA E-PACK',
      descripcion: 'FRL Fishken con problemas, no despicha adecuadamente y tiene manómetro roto, se reemplaza preventivamente',
      horaInicio: '',
      horaTermino: null,
      impacto: 'en-ventana',
      minutosParada: null,
      ventana: 'Colación empaque',
      pendiente: false,
      fotos: [{ ...fotoDeEjemplo('Antes', '#5a4a3a', 900, 1600), etiqueta: 'antes' }],
      participantes: ['Danilo Cortes'],
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Mauricio Gallardo',
      createdAt: Timestamp.fromMillis(turno.inicio.getTime() + (3 * 60 + 40) * 60_000),
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
      autorNombre: 'mantencion.plantach',
      registradoPor: 'Matias Serpa',
    },
  ]
}

const BORRADOR_EJEMPLO = 'ejemplo-borrador-danilo'
const NOVEDAD_EJEMPLO = { texto: 'Leandro Igor agregó un evento', en: Date.now() }

// Las fotos de ejemplo se dibujan en canvas: generarlas una vez por turno, no
// en cada render (si no, cambian de URL y parpadean).
const cacheEjemplo = new Map<string, EventoBitacora[]>()
function ejemploDe(turno: TurnoMantencion): EventoBitacora[] {
  if (turno.id !== turnoMantencionEn().id) return []
  let lista = cacheEjemplo.get(turno.id)
  if (!lista) {
    lista = [
      ...eventosDeEjemplo(turno),
      // Un borrador de otro técnico, para ver «En redacción» y «Continuar aquí».
      {
        id: BORRADOR_EJEMPLO,
        plantId: BITACORA_PLANTA.id,
        turnoId: turno.id,
        fechaTurno: turno.fecha,
        banda: turno.banda,
        tipo: 'falla',
        equipo: 'KNURO N1',
        equipoId: null,
        descripcion: 'Pusher con golpes irregulares, se revisa el disco de pul',
        horaInicio: horaSugeridaParaEvento(turno),
        horaTermino: null,
        impacto: 'no-aplica',
        minutosParada: null,
        ventana: null,
        pendiente: false,
        fotos: [],
        creadoPor: 'ejemplo',
        autorNombre: 'mantencion.plantach',
        registradoPor: 'Danilo Cortes',
        estado: 'borrador',
        dispositivo: 'celular',
      },
    ]
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
        const { quien, ...resto } = datos
        const evento: EventoBitacora = {
          ...(previo ?? {
            id,
            plantId: BITACORA_PLANTA.id,
            turnoId: turno.id,
            fechaTurno: turno.fecha,
            banda: turno.banda,
            creadoPor: 'ejemplo',
            autorNombre: 'mantencion.plantach',
            registradoPor: quien,
          }),
          ...resto,
          ...(esNuevo
            ? {}
            : datos.fijarAutor
              ? { registradoPor: quien }
              : { actualizadoPorNombre: quien, ...(datos.registradoPor ? { registradoPor: datos.registradoPor } : {}) }),
        }
        // Cambio de turno (solo al publicar o guardar, como en el hook).
        const destino = datos.estado !== 'borrador' && datos.turnoId ? turnoDesdeId(datos.turnoId) : null
        if (destino && destino.id !== turno.id) {
          const movido = { ...evento, turnoId: destino.id, fechaTurno: destino.fecha, banda: destino.banda, posicionMin: null }
          return {
            ...prev,
            [turno.id]: lista.filter((e) => e.id !== id),
            [destino.id]: [...(prev[destino.id] ?? ejemploDe(destino)).filter((e) => e.id !== id), movido],
          }
        }
        // Un borrador se crea con el primer autoguardado: si no estaba, se agrega.
        return { ...prev, [turno.id]: esNuevo || !previo ? [...lista, evento] : lista.map((e) => (e.id === id ? evento : e)) }
      })
      if (esNuevo && datos.resuelvePendiente?.id && datos.estado !== 'borrador') {
        cerradosEjemplo.add(datos.resuelvePendiente.id)
        avisarPendientes()
      }
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
    cambiosPorSubir: 0,
    novedad: NOVEDAD_EJEMPLO,
    nuevoId: () => `nuevo-${Date.now()}`,
    guardar,
    borrar,
    mover: (id: string, posicionMin: number) =>
      setPorTurno((prev) => ({ ...prev, [turno.id]: (prev[turno.id] ?? ejemploDe(turno)).map((e) => (e.id === id ? { ...e, posicionMin } : e)) })),
    marcarPendiente: (evento: EventoBitacora, pendiente: boolean, quien: string) =>
      setPorTurno((prev) => ({
        ...prev,
        [turno.id]: (prev[turno.id] ?? ejemploDe(turno)).map((e) =>
          e.id === evento.id ? { ...e, pendiente, ...(pendiente ? { cierre: null } : {}), ...(quien ? { actualizadoPorNombre: quien } : {}) } : e,
        ),
      })),
  }
}

// Pendientes de ejemplo de turnos anteriores (entrega de turno). Store de módulo:
// el editor (useEventosEjemplo) los cierra y la sección (usePendientesEjemplo) se entera.
const cerradosEjemplo = new Set<string>()
const oyentesPendientes = new Set<() => void>()
function avisarPendientes() {
  oyentesPendientes.forEach((f) => f())
}

function usePendientesEjemplo(turno: TurnoMantencion) {
  const [, forzar] = useState(0)
  useEffect(() => {
    const f = () => forzar((n) => n + 1)
    oyentesPendientes.add(f)
    return () => {
      oyentesPendientes.delete(f)
    }
  }, [])
  const actual = turnoMantencionEn()
  const anterior = turnoAdyacente(actual, -1)
  const dosAtras = turnoAdyacente(anterior, -1)
  const base = {
    plantId: BITACORA_PLANTA.id,
    impacto: 'no-aplica' as const,
    minutosParada: null,
    ventana: null,
    pendiente: true,
    fotos: [],
    creadoPor: 'ejemplo',
    autorNombre: 'mantencion.plantach',
    horaTermino: null,
  }
  const todos: EventoBitacora[] = [
    { ...base, id: 'pend-1', turnoId: anterior.id, fechaTurno: anterior.fecha, banda: anterior.banda, tipo: 'novedad', equipo: 'ENZUNCHADORA N1', descripcion: 'Motor de tensado con ruido. Sin repuesto en bodega.', horaInicio: '22:30', registradoPor: 'Matias Serpa' },
    { ...base, id: 'pend-2', turnoId: dosAtras.id, fechaTurno: dosAtras.fecha, banda: dosAtras.banda, tipo: 'falla', equipo: 'KNURO N1', equipoId: 'e5', descripcion: 'Pusher con golpes irregulares; revisar disco de pulsos.', horaInicio: '11:40', registradoPor: 'Leandro Igor' },
  ]
  const pendientes = todos.filter((e) => !cerradosEjemplo.has(e.id) && e.turnoId !== turno.id && (turnoDesdeId(e.turnoId)?.inicio ?? turno.inicio) < turno.inicio)
  return {
    pendientes,
    cerrarNoAplica: async (p: EventoBitacora) => {
      cerradosEjemplo.add(p.id)
      avisarPendientes()
    },
  }
}

function useObservacionEjemplo() {
  const [obs, setObs] = useState({ texto: '', actualizadoPorNombre: null as string | null, presentes: null as string[] | null })
  return {
    observacion: obs,
    guardarObservacion: async (t: string, quien: string) => setObs((o) => ({ ...o, texto: t.trim(), actualizadoPorNombre: quien || null })),
    guardarPresentes: async (presentes: string[]) => setObs((o) => ({ ...o, presentes })),
  }
}

// Nombres reales de la planilla del calendario (15-09-2026), ya en formato corto.
const PLANILLA = ['Jose Chodil', 'Lucas Adrade', 'Ernesto Diaz', 'Pablo Almazabal', 'Leandro Igor', 'Danilo Cortes', 'Mauricio Gallardo', 'Diego Cardenas', 'Matias Serpa']

function useAjustesEjemplo() {
  const [ajustes, setAjustes] = useState<AjustesTecnicos>(AJUSTES_VACIOS)
  return { ajustes, guardarAjustes: async (a: AjustesTecnicos) => setAjustes(a) }
}

// Muestra de la jerarquía real (15-09-2026), con la misma forma que `hierarchy`.
const NODOS_EJEMPLO: NodoJerarquia[] = [
  { id: 'aq-in-cho', nombre: 'Aquachile Antarfood Chonchi', tipoNodo: 'area', path: [] },
  { id: 'pcho', nombre: 'PLANTA CHONCHI', tipoNodo: 'area', path: ['aq-in-cho'] },
  { id: 'pyal', nombre: 'PLANTA YAL', tipoNodo: 'area', path: ['aq-in-cho'] },
  { id: 'evis', nombre: 'EVISCERADO', tipoNodo: 'area', path: ['aq-in-cho', 'pcho'] },
  { id: 'evis-yal', nombre: 'EVISCERADO', tipoNodo: 'area', path: ['aq-in-cho', 'pyal'] },
  { id: 'empa', nombre: 'EMPARRILLADO', tipoNodo: 'area', path: ['aq-in-cho', 'pcho'] },
  { id: 'empq', nombre: 'EMPAQUE', tipoNodo: 'area', path: ['aq-in-cho', 'pcho'] },
  { id: 'e1', nombre: 'EVISCERADORA BAADER 142 N2', codigo: '720004411', tipoNodo: 'equipo', path: ['aq-in-cho', 'pyal', 'evis-yal'] },
  { id: 'e2', nombre: 'EVISCERADORA BAADER 142 N3', codigo: '720004412', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis'] },
  { id: 'e3', nombre: 'TABLERO ELECTRICO BAADER 142 N1', codigo: '720004413', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis'] },
  { id: 'e4', nombre: 'TABLERO ELECTRICO BAADER 142 N3', codigo: '720004414', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis'] },
  { id: 'e5', nombre: 'KNURO N1', codigo: '720004415', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis'] },
  { id: 'e6', nombre: 'KNURO N1', codigo: '720004416', tipoNodo: 'equipo', path: ['aq-in-cho', 'pyal', 'evis-yal'] },
  { id: 'e7', nombre: 'CELDA CARGA AK300 MARELEC STATIC GRADER', codigo: '720004417', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'empa'] },
  { id: 'e8', nombre: 'ENZUNCHADORA N1', codigo: '720004418', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'empq'] },
]
const OPCIONES_EJEMPLO = construirOpcionesEquipo(NODOS_EJEMPLO)

// Repuestos REALES del maestro asociados a la BAADER 142 N2 (sin leer la base).
const REPUESTOS_EJEMPLO: RepuestoDelCatalogo[] = [
  { codigoSAP: '3300005482', nombre: 'PRESOSTATO 10773', nombreComun: '', ubicacion: 'C-11' },
  { codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', nombreComun: '', ubicacion: 'C-6' },
  { codigoSAP: '3300011623', nombre: 'CHAPA DIRECTRIZ 519167', nombreComun: '', ubicacion: 'C-6' },
  { codigoSAP: '3300011654', nombre: 'ANILLO 31000251', nombreComun: '', ubicacion: 'C-7' },
  { codigoSAP: '3300012355', nombre: 'PERNO 1420301019', nombreComun: '', ubicacion: 'C-1' },
  { codigoSAP: '3300012357', nombre: 'PERNO 1420301017', nombreComun: '', ubicacion: 'C-1' },
]
// Materiales de OTROS equipos (reales del maestro), para probar «Todos». El nombre común es de ejemplo.
const REPUESTOS_TODOS: RepuestoDelCatalogo[] = [
  ...REPUESTOS_EJEMPLO,
  { codigoSAP: '3300135877', nombre: 'FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', nombreComun: '', ubicacion: '' },
  { codigoSAP: '3300011872', nombre: 'CORREA 37750006', nombreComun: 'Correa cuchilla circular', ubicacion: '' },
  { codigoSAP: '3300011875', nombre: 'ABRAZADERA 38010160', nombreComun: 'Resorte carros (abrazadera/mordaza)', ubicacion: '' },
]
const BODEGA_EJEMPLO: Record<string, DatoBodega> = {
  '3300135877': { ubicacion: 'B-7-2', stock: 0, unidad: 'pzas' },
  '3300011612': { ubicacion: 'C-6', stock: 4, unidad: 'un' },
}
const REPUESTOS_FALSOS: FuenteRepuestos = {
  porCodigo: async (codigo) => {
    await new Promise((r) => setTimeout(r, 300))
    return REPUESTOS_TODOS.find((r) => r.codigoSAP === codigo) ?? null
  },
  delEquipo: async (equipoId) => {
    await new Promise((r) => setTimeout(r, 500))
    return equipoId.startsWith('e') ? REPUESTOS_EJEMPLO : []
  },
  todos: async () => {
    await new Promise((r) => setTimeout(r, 400))
    return REPUESTOS_TODOS
  },
  bodegaDe: async (codigos) => new Map(codigos.filter((c) => BODEGA_EJEMPLO[c]).map((c) => [c, BODEGA_EJEMPLO[c] as DatoBodega])),
  guardarNombreComun: async (codigo, nombre) => {
    await new Promise((r) => setTimeout(r, 300))
    for (const lista of [REPUESTOS_EJEMPLO, REPUESTOS_TODOS]) for (const r of lista) if (r.codigoSAP === codigo) r.nombreComun = nombre
  },
}

/** Un borrador que Leandro dejó sin publicar en el turno anterior. */
function useBorradoresEjemplo(turno: TurnoMantencion): EventoBitacora[] {
  return useMemo(() => {
    if (turno.id !== turnoMantencionEn().id) return []
    const anterior = turnoAdyacente(turno, -1)
    return [
      {
        id: 'ejemplo-borrador-anterior',
        plantId: BITACORA_PLANTA.id,
        turnoId: anterior.id,
        fechaTurno: anterior.fecha,
        banda: anterior.banda,
        tipo: 'ajuste',
        equipo: 'GRADER MS4/12',
        equipoId: null,
        descripcion: 'Se tensó la correa de la salida 7; falta anotar',
        horaInicio: horaSugeridaParaEvento(anterior),
        horaTermino: null,
        impacto: 'en-ventana',
        minutosParada: null,
        ventana: 'Colación HG',
        pendiente: false,
        fotos: [],
        creadoPor: 'ejemplo',
        autorNombre: 'mantencion.plantach',
        registradoPor: 'Leandro Igor',
        estado: 'borrador',
      },
    ]
  }, [turno])
}

/** Tres equipos conectados: este, el celular de Danilo escribiendo y el PC de Mantención. */
function usePresenciaEjemplo(turno: TurnoMantencion, yo: { nombre: string; editandoEventoId: string | null }) {
  const presentes = useMemo(
    () => [
      { id: 'yo', plantId: BITACORA_PLANTA.id, turnoId: turno.id, dispositivoId: 'yo-ejemplo', dispositivo: 'celular' as const, nombre: yo.nombre || 'Matias Serpa', editandoEventoId: yo.editandoEventoId, vistoEnMs: Date.now(), uid: 'ejemplo' },
      { id: 'dc', plantId: BITACORA_PLANTA.id, turnoId: turno.id, dispositivoId: 'danilo-ejemplo', dispositivo: 'celular' as const, nombre: 'Danilo Cortes', editandoEventoId: BORRADOR_EJEMPLO, vistoEnMs: Date.now(), uid: 'ejemplo' },
      { id: 'pc', plantId: BITACORA_PLANTA.id, turnoId: turno.id, dispositivoId: 'pc-ejemplo', dispositivo: 'pc' as const, nombre: 'PC de Mantención', editandoEventoId: null, vistoEnMs: Date.now(), uid: 'ejemplo' },
    ],
    [turno.id, yo.nombre, yo.editandoEventoId],
  )
  return { presentes, miDispositivoId: 'yo-ejemplo' }
}

// Exportada para la vitrina del pase (solo desarrollo): la recarga en caliente no importa aquí.
// eslint-disable-next-line react-refresh/only-export-components
export const FUENTE_EJEMPLO: FuenteBitacora = {
  useEventos: useEventosEjemplo,
  useTecnicos: () => ({ deTurno: ['Danilo Cortes', 'Matias Serpa'], todos: PLANILLA }),
  useObservacion: useObservacionEjemplo,
  useAjustes: useAjustesEjemplo,
  usePendientesAnteriores: usePendientesEjemplo,
  useOpcionesEquipo: () => ({ opciones: OPCIONES_EJEMPLO, cargando: false }),
  usePresencia: usePresenciaEjemplo,
  useBorradoresAnteriores: useBorradoresEjemplo,
  repuestos: REPUESTOS_FALSOS,
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

/** Historial de ejemplo: 10 turnos hacia atrás con paradas, ventanas y pendientes. */
function useHistorialEjemplo(dias: number) {
  const eventos = useMemo(() => {
    const actual = turnoMantencionEn()
    const lista: EventoBitacora[] = []
    let t = actual
    for (let i = 0; i < Math.min(30, dias * 3); i++) {
      const base = {
        plantId: BITACORA_PLANTA.id,
        turnoId: t.id,
        fechaTurno: t.fecha,
        banda: t.banda,
        creadoPor: 'ejemplo',
        autorNombre: 'mantencion.plantach',
        fotos: [],
        pendiente: false,
        ventana: null as string | null,
        minutosParada: null as number | null,
      }
      const quien = ['Danilo Cortes', 'Matias Serpa', 'Leandro Igor'][i % 3]!
      if (i % 4 !== 3) {
        lista.push({
          ...base,
          id: `h-${i}-a`,
          tipo: 'falla',
          equipo: i % 3 === 0 ? 'EVISCERADORA BAADER 142 N3' : i % 3 === 1 ? 'KNURO N1' : 'CELDA CARGA AK300 MARELEC STATIC GRADER',
          descripcion: 'Intervención de ejemplo con parada.',
          horaInicio: '02:10',
          horaTermino: '02:45',
          impacto: 'con-parada',
          minutosParada: 10 + ((i * 7) % 45),
          registradoPor: quien,
          // Repuestos de ejemplo (códigos reales del maestro) para el bloque «Repuestos usados».
          repuestos:
            i % 3 === 0
              ? [{ codigoSAP: '3300011872', nombre: 'CORREA 37750006', nombreComun: 'Correa cuchilla circular', cantidad: 2 }]
              : i % 3 === 1
                ? [{ codigoSAP: '3300135877', nombre: 'FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', nombreComun: 'Filtro FRL', cantidad: 1 }]
                : [{ codigoSAP: '3300011619', nombre: 'CUCHILLO 94011760', cantidad: 1 }],
        })
      }
      lista.push({
        ...base,
        id: `h-${i}-b`,
        tipo: 'ajuste',
        equipo: 'ENZUNCHADORA N1',
        descripcion: 'Ajuste aprovechando la colación.',
        horaInicio: '04:00',
        horaTermino: '04:20',
        impacto: 'en-ventana',
        ventana: i % 2 ? 'Colación HG' : 'Línea sin producción',
        registradoPor: quien,
      })
      t = turnoAdyacente(t, -1)
    }
    return lista
  }, [dias])
  const filas = useMemo(() => filasPorTurno(eventos), [eventos])
  const resumen = useMemo(() => resumirPeriodo(eventos, fechaDesde(dias), fechaLocal(new Date())), [eventos, dias])
  return { eventos, filas, resumen, cargando: false, error: null as string | null }
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
        <hr className="border-border" />
        <HistorialBitacoraVista fuente={{ useHistorial: useHistorialEjemplo }} alAbrirTurno={() => undefined} />
      </div>
    </div>
  )
}
