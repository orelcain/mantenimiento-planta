export interface Zona {
  id: string
  pos: [number, number, number]
  size: [number, number, number]
  label: string
  sap: string
  categoria: 'produccion' | 'frio' | 'utilidades' | 'logistica' | 'admin'
  equipos?: string[]
  estado: 'operativo' | 'alerta' | 'detenido'
  descripcion?: string
}

export interface Silo {
  id: string
  pos: [number, number, number]
  r: number
  h: number
  label: string
  tipo: 'agua' | 'hielo' | 'combustible'
}

export interface MockOT {
  id: string
  titulo: string
  estado: 'abierta' | 'programada' | 'cerrada'
  fecha: string
  prioridad: 'alta' | 'media' | 'baja'
}

export const ZONAS: Zona[] = [
  {
    id: 'nave',
    pos: [0, 0, -2],
    size: [14, 6, 10],
    label: 'NAVE PROCESO PRINCIPAL',
    sap: 'ZAP-001',
    categoria: 'produccion',
    equipos: ['HMI Principal', 'Banda transportadora', 'Mesas de proceso'],
    estado: 'operativo',
    descripcion: 'Zona principal de procesamiento de pescado',
  },
  {
    id: 'filet',
    pos: [-10, 0, 6],
    size: [8, 4.5, 6],
    label: 'SALA FILETEADO',
    sap: 'ZAP-002',
    categoria: 'produccion',
    equipos: ['Baader 200 filleting machine', 'Mesa de clasificación'],
    estado: 'alerta',
    descripcion: 'Fileteado y corte de salmón',
  },
  {
    id: 'grader',
    pos: [5, 0, 7],
    size: [6, 4, 5],
    label: 'SALA GRADING',
    sap: 'ZAP-011',
    categoria: 'produccion',
    equipos: ['Marelec MS4/12 grader', 'HMI Grader'],
    estado: 'operativo',
    descripcion: 'Clasificación por peso y calidad',
  },
  {
    id: 'frio1',
    pos: [10, 0, 7],
    size: [6, 5.5, 5],
    label: 'CÁMARA FRÍO 1 (-25°C)',
    sap: 'ZAP-003',
    categoria: 'frio',
    equipos: ['Compresor amoniaco', 'Evaporadores x4'],
    estado: 'operativo',
    descripcion: 'Almacenamiento congelado producto terminado',
  },
  {
    id: 'frio2',
    pos: [18, 0, 5],
    size: [5, 5.5, 5],
    label: 'CÁMARA FRÍO 2 (-18°C)',
    sap: 'ZAP-004',
    categoria: 'frio',
    equipos: ['Compresor secundario'],
    estado: 'operativo',
    descripcion: 'Almacenamiento producto en tránsito',
  },
  {
    id: 'maq',
    pos: [-18, 0, 2],
    size: [6, 5, 6],
    label: 'SALA MÁQUINAS',
    sap: 'ZAP-005',
    categoria: 'utilidades',
    equipos: ['Motor principal', 'Bomba 1', 'Bomba 2', 'Tablero eléctrico'],
    estado: 'alerta',
    descripcion: 'Centro de generación y distribución de energía',
  },
  {
    id: 'comp',
    pos: [21, 0, -1],
    size: [4, 4, 4],
    label: 'SALA COMPRESORES',
    sap: 'ZAP-010',
    categoria: 'utilidades',
    equipos: ['Compresor NH3 A', 'Compresor NH3 B'],
    estado: 'operativo',
    descripcion: 'Sistema de refrigeración central',
  },
  {
    id: 'ptar',
    pos: [20, 0, -8],
    size: [5, 3, 5],
    label: 'PTAR / RILES',
    sap: 'ZAP-009',
    categoria: 'utilidades',
    equipos: ['Trampa de grasas', 'Sedimentador'],
    estado: 'operativo',
    descripcion: 'Tratamiento de aguas residuales industriales',
  },
  {
    id: 'bodega',
    pos: [0, 0, 12],
    size: [10, 4, 5],
    label: 'BODEGA INSUMOS',
    sap: 'ZAP-006',
    categoria: 'logistica',
    equipos: ['Grúa horquilla', 'Sistema de racks'],
    estado: 'operativo',
    descripcion: 'Almacenamiento de materiales e insumos',
  },
  {
    id: 'despacho',
    pos: [14, 0, -13],
    size: [8, 3, 4],
    label: 'ZONA DESPACHO',
    sap: 'ZAP-012',
    categoria: 'logistica',
    equipos: ['Andén de carga', 'Balanza camión'],
    estado: 'operativo',
    descripcion: 'Recepción de materia prima y despacho producto terminado',
  },
  {
    id: 'ofic',
    pos: [-18, 0, -8],
    size: [7, 4, 5],
    label: 'OFICINAS ADMIN',
    sap: 'ZAP-007',
    categoria: 'admin',
    equipos: ['Servidores', 'Centro de comunicaciones'],
    estado: 'operativo',
    descripcion: 'Área administrativa y control de producción',
  },
  {
    id: 'porter',
    pos: [-22, 0, -14],
    size: [3, 3.5, 3],
    label: 'PORTERÍA',
    sap: 'ZAP-008',
    categoria: 'admin',
    equipos: ['Barrera automática', 'CCTV'],
    estado: 'operativo',
    descripcion: 'Control de acceso y vigilancia',
  },
]

export const SILOS: Silo[] = [
  { id: 'agua1', pos: [-13, 0, 14], r: 1.5, h: 6.5, label: 'ESTANQUE AGUA 1\n(50 m³)', tipo: 'agua' },
  { id: 'agua2', pos: [-10, 0, 14], r: 1.5, h: 6.5, label: 'ESTANQUE AGUA 2\n(50 m³)', tipo: 'agua' },
  { id: 'hielo', pos: [14, 0, 14],  r: 2.2, h: 5.5, label: 'SILO HIELO ESCAMA\n(20 t)',  tipo: 'hielo' },
]

export const MOCK_OT: Record<string, MockOT[]> = {
  nave:    [
    { id: 'OT-2026-042', titulo: 'Revisión banda transportadora principal', estado: 'abierta',    fecha: '2026-04-18', prioridad: 'alta' },
    { id: 'OT-2026-047', titulo: 'Lubricación rodamientos mesa proceso',    estado: 'programada', fecha: '2026-04-28', prioridad: 'media' },
  ],
  filet:   [
    { id: 'OT-2026-051', titulo: 'Calibración cuchillas Baader 200',        estado: 'abierta',    fecha: '2026-04-20', prioridad: 'alta' },
    { id: 'OT-2026-055', titulo: 'Cambio correas de transmisión',           estado: 'programada', fecha: '2026-05-02', prioridad: 'media' },
  ],
  grader:  [],
  frio1:   [
    { id: 'OT-2026-033', titulo: 'Recarga de amoniaco sistema NH3',         estado: 'programada', fecha: '2026-04-30', prioridad: 'media' },
  ],
  frio2:   [],
  maq:     [
    { id: 'OT-2026-018', titulo: 'Falla intermitente bomba principal',      estado: 'abierta',    fecha: '2026-04-15', prioridad: 'alta' },
    { id: 'OT-2026-023', titulo: 'Revisión tablero eléctrico secundario',   estado: 'abierta',    fecha: '2026-04-21', prioridad: 'alta' },
  ],
  comp:    [],
  ptar:    [],
  bodega:  [
    { id: 'OT-2026-060', titulo: 'Mantenimiento grúa horquilla',            estado: 'programada', fecha: '2026-05-05', prioridad: 'baja' },
  ],
  despacho: [],
  ofic:    [],
  porter:  [],
}

export const ESTADO_COLORS = {
  operativo: '#5cff5c',
  alerta:    '#ffcc33',
  detenido:  '#ff3333',
} as const

export const CATEGORIA_BASE_COLOR = {
  produccion:  '#c8b89a',
  frio:        '#a8c8d8',
  utilidades:  '#c8a878',
  logistica:   '#b8c8a8',
  admin:       '#c0b8b0',
} as const

export const CATEGORIA_ACCENT = {
  produccion:  '#3b82f6',
  frio:        '#06b6d4',
  utilidades:  '#f59e0b',
  logistica:   '#8b5cf6',
  admin:       '#6b7280',
} as const
