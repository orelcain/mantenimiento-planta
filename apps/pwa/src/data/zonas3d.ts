// Zonas basadas en planta principal.dxf (AutoCAD 2023, ESCALA 1:100)
// Dimensiones reales: 87.6 m × 44 m (área proceso) + anexo welfare sur
// Transform DXF→World: X_w = (X_dxf − 49000) / 1000 | Z_w = (Y_dxf − 37000) / 1000
// 1 unidad world = 1 m real

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

// ─── Layout real según planta principal.dxf ──────────────────────────────────
// Oeste (izq): recepción / cosecha / chiller / stunner
// Centro-oeste: nave proceso, calibrado, eviscerado (314 m²)
// Centro: columna de 6 túneles IQF (N→S), fila de túneles semicontinuos (E-O)
// Centro-este: zona empaque + paletizado
// Este (der): cámara frío 1 y 2
// Sur: sala máquinas (3 sectores), vestuarios, oficinas, casino
// Norte: sala bombas + lavado bins

export const ZONAS: Zona[] = [

  // ── RECEPCIÓN / COSECHA — extremo oeste (DXF ~12000, 44500) ─────────────
  {
    id: 'recepcion',
    pos: [-37, 0, 8],
    size: [18, 6, 24],
    label: 'RECEPCIÓN / COSECHA',
    sap: 'ZAP-001',
    categoria: 'logistica',
    equipos: ['Chiller', 'Desangrador', 'Stunner', 'Mesón recepción', 'Balanza dinámica', 'Lithium'],
    estado: 'operativo',
    descripcion: 'Recepción, aturdimiento (stunner), desangrado y enfriado de salmón desde jaulas.',
  },

  // ── NAVE PROCESO / CALIBRADO — centro-oeste (DXF ~27000, 34000) ─────────
  {
    id: 'proceso',
    pos: [-18, 0, 0],
    size: [24, 6, 24],
    label: 'NAVE PROCESO — CALIBRADO',
    sap: 'ZAP-002',
    categoria: 'produccion',
    equipos: [
      'Evisceradora Unifood',
      'Clasificador automático',
      'Mesón corte x6',
      'Mesón despinado x4',
      'Mesón prolijado x3',
    ],
    estado: 'operativo',
    descripcion: 'Eviscerado, calibrado por peso/calidad, fileteado y despinado. Área ~314 m².',
  },

  // ── SALA BOMBAS + LAVADO BINS — norte-oeste (DXF ~16000, 52000) ─────────
  {
    id: 'servicios_norte',
    pos: [-26, 0, 16],
    size: [22, 4, 10],
    label: 'SALA BOMBAS + LAVADO BINS',
    sap: 'ZAP-003',
    categoria: 'utilidades',
    equipos: ['Bomba proceso x3', 'Tablero eléctrico', 'Sistema lavado bins', 'Muestreo'],
    estado: 'operativo',
    descripcion: 'Sala de bombas, tableros eléctricos zona norte y área de lavado de bins.',
  },

  // ── TÚNELES IQF 1–6 — columna central (DXF X~51000, Y 27000–50000) ──────
  {
    id: 'tuneles_iqf',
    pos: [2, 0, 1],
    size: [10, 7, 32],
    label: 'TÚNELES IQF 1 – 6',
    sap: 'ZAP-010',
    categoria: 'frio',
    equipos: [
      'Túnel IQF 1', 'Túnel IQF 2', 'Túnel IQF 3',
      'Túnel IQF 4', 'Túnel IQF 5', 'Túnel IQF 6',
      'Evaporadores',
    ],
    estado: 'operativo',
    descripcion: 'Seis túneles IQF en columna + evaporadores — congelado individual rápido.',
  },

  // ── TÚNELES SEMICONTINUOS — fila norte (DXF X 44000–70000, Y ~54000) ────
  {
    id: 'tuneles_norte',
    pos: [8, 0, 17],
    size: [30, 6, 10],
    label: 'PRE-TÚNEL / TÚNEL SEMICONTINUO / POST-TÚNEL',
    sap: 'ZAP-011',
    categoria: 'frio',
    equipos: ['Pre-túnel', 'Túnel semicontinuo', 'Post-túnel'],
    estado: 'operativo',
    descripcion: 'Zona de congelado semicontinuo para producto en granel.',
  },

  // ── ZONA EMPAQUE — centro (DXF ~55000, 32000) ────────────────────────────
  {
    id: 'empaque',
    pos: [6, 0, -5],
    size: [12, 5, 12],
    label: 'ZONA EMPAQUE',
    sap: 'ZAP-020',
    categoria: 'produccion',
    equipos: ['Selladora campana x2', 'Envasadora al vacío', 'Etiquetadora automática'],
    estado: 'operativo',
    descripcion: 'Envasado al vacío, etiquetado y codificación de producto.',
  },

  // ── PALETIZADO — centro-este (DXF ~65000, 27000) ─────────────────────────
  {
    id: 'paletizado',
    pos: [16, 0, -10],
    size: [12, 5, 12],
    label: 'PALETIZADO',
    sap: 'ZAP-021',
    categoria: 'logistica',
    equipos: ['Pallet truck eléctrico', 'Film envolvedora', 'Andén niveladoras x2'],
    estado: 'operativo',
    descripcion: 'Paletizado, filmado y despacho de producto congelado.',
  },

  // ── CÁMARA FRÍO 1 — este (DXF ~79000, 31000) ─────────────────────────────
  {
    id: 'camara1',
    pos: [30, 0, -6],
    size: [13, 7, 13],
    label: 'CÁMARA FRÍO 1  −20 °C',
    sap: 'ZAP-030',
    categoria: 'frio',
    equipos: ['Evaporadores x4', 'Termómetro digital'],
    estado: 'operativo',
    descripcion: 'Almacenamiento congelado producto terminado.',
  },

  // ── CÁMARA FRÍO 2 — este-norte (DXF ~75000, 44000) ───────────────────────
  {
    id: 'camara2',
    pos: [26, 0, 7],
    size: [13, 7, 13],
    label: 'CÁMARA FRÍO 2  −25 °C',
    sap: 'ZAP-031',
    categoria: 'frio',
    equipos: ['Evaporadores x4'],
    estado: 'alerta',
    descripcion: 'Almacenamiento ultracongelado — revisando compresor.',
  },

  // ── SALA MÁQUINAS NORTE — (DXF ~31000, 55000) ────────────────────────────
  {
    id: 'maq_norte',
    pos: [-18, 0, 18],
    size: [14, 4, 8],
    label: 'SALA MÁQUINAS NORTE',
    sap: 'ZAP-040',
    categoria: 'utilidades',
    equipos: ['Tablero eléctrico norte', 'Caldera vapor', 'Generador emergencia'],
    estado: 'operativo',
    descripcion: 'Centro eléctrico y caldera — zona norte.',
  },

  // ── SALA MÁQUINAS SUR — (DXF ~49000, 16000) ──────────────────────────────
  {
    id: 'maq_sur',
    pos: [0, 0, -21],
    size: [20, 4, 6],
    label: 'SALA MÁQUINAS SUR',
    sap: 'ZAP-041',
    categoria: 'utilidades',
    equipos: ['Tablero principal', 'Bombas agua proceso x3', 'UPS'],
    estado: 'alerta',
    descripcion: 'Tablero principal y bombas zona sur — revisión bomba 2.',
  },

  // ── SALA COMPRESORES NH3 — este-sur (DXF ~72000, 17000) ──────────────────
  {
    id: 'compresores',
    pos: [23, 0, -20],
    size: [14, 4, 6],
    label: 'SALA COMPRESORES NH3',
    sap: 'ZAP-042',
    categoria: 'utilidades',
    equipos: ['Compresor NH3 A', 'Compresor NH3 B', 'Condensador evaporativo'],
    estado: 'operativo',
    descripcion: 'Central de refrigeración — sistema de amoniaco.',
  },

  // ── VESTUARIOS / WELFARE — sur-oeste (DXF ~18000–38000, ~9000–22000) ─────
  {
    id: 'vestuarios',
    pos: [-22, 0, -23],
    size: [24, 3.5, 12],
    label: 'VESTUARIOS + BAÑOS + GUARDAROPÍA',
    sap: 'ZAP-050',
    categoria: 'admin',
    equipos: ['Duchas damas x8', 'Duchas varones x8', 'Guardaropía', 'Lavandería'],
    estado: 'operativo',
    descripcion: 'Servicios higiénicos, cambio de ropa y lavandería de operarios.',
  },

  // ── OFICINA PRODUCCIÓN + ÁREA LIMPIA — sur-centro (DXF ~41000, 21000) ────
  {
    id: 'admin',
    pos: [-8, 0, -20],
    size: [10, 4, 6],
    label: 'OFICINA PRODUCCIÓN + ÁREA LIMPIA',
    sap: 'ZAP-051',
    categoria: 'admin',
    equipos: ['Servidores', 'Sistema SCADA', 'Cámaras CCTV x8'],
    estado: 'operativo',
    descripcion: 'Oficina de producción, control de calidad, cambio de indumentaria.',
  },

  // ── CASINO + COCINA — este-sur (DXF ~87000, 17000–21000) ─────────────────
  {
    id: 'cocina',
    pos: [37, 0, -19],
    size: [12, 4, 10],
    label: 'CASINO + COCINA',
    sap: 'ZAP-052',
    categoria: 'admin',
    equipos: ['Cocina industrial', 'Despensa', 'Comedor 60 pax', 'Camarín este'],
    estado: 'operativo',
    descripcion: 'Casino y alimentación de operarios — zona este.',
  },
]

// Estanques fuera del edificio (norte del recinto)
export const SILOS: Silo[] = [
  { id: 'agua1', pos: [-30, 0, 28], r: 2.2, h: 7.5, label: 'ESTANQUE AGUA 1\n(80 m³)', tipo: 'agua' },
  { id: 'agua2', pos: [-24, 0, 28], r: 2.2, h: 7.5, label: 'ESTANQUE AGUA 2\n(80 m³)', tipo: 'agua' },
  { id: 'hielo', pos: [ 18, 0, 28], r: 3.0, h: 6.5, label: 'SILO HIELO ESCAMA\n(30 t)',  tipo: 'hielo' },
]

export const MOCK_OT: Record<string, MockOT[]> = {
  recepcion: [
    { id: 'OT-2026-062', titulo: 'Revisión cinta transportadora chiller', estado: 'programada', fecha: '2026-04-28', prioridad: 'media' },
  ],
  proceso: [
    { id: 'OT-2026-042', titulo: 'Revisión banda canoa principal',          estado: 'abierta',    fecha: '2026-04-18', prioridad: 'alta' },
    { id: 'OT-2026-047', titulo: 'Lubricación guías mesas despinado',        estado: 'programada', fecha: '2026-04-28', prioridad: 'media' },
    { id: 'OT-2026-052', titulo: 'Cambio cuchillas Mesón Corte Cabeza',      estado: 'cerrada',    fecha: '2026-04-10', prioridad: 'media' },
  ],
  servicios_norte: [],
  tuneles_iqf: [
    { id: 'OT-2026-033', titulo: 'Recarga gas refrigerante NH3 — túnel 3',  estado: 'programada', fecha: '2026-04-30', prioridad: 'media' },
    { id: 'OT-2026-060', titulo: 'Temperatura fuera rango túnel 5 −21°C',   estado: 'abierta',    fecha: '2026-04-21', prioridad: 'alta' },
  ],
  tuneles_norte: [],
  empaque: [
    { id: 'OT-2026-055', titulo: 'Selladora campana B — fuga de vacío',     estado: 'abierta',    fecha: '2026-04-20', prioridad: 'alta' },
  ],
  paletizado: [],
  camara1: [],
  camara2: [
    { id: 'OT-2026-061', titulo: 'Revisión compresor cámara 2',              estado: 'abierta',    fecha: '2026-04-21', prioridad: 'alta' },
  ],
  maq_norte: [
    { id: 'OT-2026-038', titulo: 'Inspección aceite caldera vapor',          estado: 'programada', fecha: '2026-05-01', prioridad: 'baja' },
  ],
  maq_sur: [
    { id: 'OT-2026-018', titulo: 'Falla intermitente bomba agua 2',         estado: 'abierta',    fecha: '2026-04-15', prioridad: 'alta' },
    { id: 'OT-2026-023', titulo: 'Revisión tablero eléctrico — cubículo 3', estado: 'abierta',    fecha: '2026-04-21', prioridad: 'alta' },
  ],
  compresores: [
    { id: 'OT-2026-038b', titulo: 'Inspección aceite compresor NH3 A',      estado: 'programada', fecha: '2026-05-01', prioridad: 'baja' },
  ],
  vestuarios: [],
  admin: [],
  cocina: [],
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
