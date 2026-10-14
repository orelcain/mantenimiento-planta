/**
 * Manual de ajustes BAADER 200 · «referencia de terreno».
 *
 * Unifica las TRES fuentes que usa la planta, sin mezclarlas:
 *  - `v4`     = «Nuevo manual de ajuste Baader 200 V4» (Boanerges Service, Ing. E. Aravena; 56 págs.).
 *               Imágenes en /baader200-manual/v4/pNN.jpg (render de la página NN).
 *  - `planta` = «Introducción Baader 200 para técnicos y operadores» (Marine Harvest Chamiza, oct. 2007; 38 págs.).
 *               Imágenes en /baader200-manual/page-NN.jpg.
 *  - `rev2`   = «Nuevo manual de ajuste, Boanerges Service (rev 2)» (feb. 2022; 55 págs.). Es la versión
 *               ANTERIOR a la V4 (nov. 2024). Se cita solo donde dice algo que la V4 ya no dice (p. ej. que el
 *               segmento de leva del punzón se ajusta según el pescado). Imágenes en /baader200-manual/rev2/pNN.jpg.
 *               ⚠ Sus números de posición no siempre coinciden con los de la V4 (dib. 42: rodillo y leva cambiados).
 * Cada valor lleva su fuente y página para poder discutirlo con el PDF en la mano.
 * La leyenda de los dibujos sale del cruce manual V4 → catálogo Baader → maestro SAP
 * (Excel «Cruce manual de ajuste V4 x repuestos · 2026-09-27», carpeta DOCUMENTOS de la máquina).
 */

export type FuenteId = 'v4' | 'planta' | 'rev2'

export interface Fuente {
  id: FuenteId
  /** Página del PDF de la que sale el dato. */
  pagina: number
}

export type EspecieId = 'salmon' | 'trucha' | 'blanco'

export interface ValorPorEspecie {
  especie: EspecieId
  etiqueta: string
  valor: string
  /** Especies que comparten este valor según el manual. */
  incluye?: string[]
}

export interface MedidaPrincipal {
  clave: string
  nombre: string
  unidad: string
  porEspecie: ValorPorEspecie[]
  /** Valor único que usa la planta cuando no distingue especie. */
  valorPlanta?: { valor: string; fuente: Fuente }
  /** Posiciones del dibujo con las que se ajusta. */
  pos: string[]
  ajusteCon: string
  fuente: Fuente
}

export interface Medida {
  clave: string
  nombre: string
  valores: string[]
  unidad: string
  pos?: string[]
  /** Con qué se ajusta o controla (texto corto). */
  con?: string
  soloAnual?: boolean
  fuente: Fuente
}

export interface Paso {
  texto: string
  pos?: string[]
  /** Clave de la medida a la que apunta el paso. */
  medida?: string
  fuente: Fuente
}

export interface Advertencia {
  texto: string
  pos?: string[]
  tipo: 'soloAnual' | 'seguridad' | 'atencion'
  fuente: Fuente
}

export interface Hotspot {
  pos: string
  /** Coordenadas relativas al dibujo, en porcentaje (0-100). */
  x: number
  y: number
}

export interface Dibujo {
  id: string
  url: string
  titulo: string
  /** Recorte relativo (porcentaje) de la página completa, para no mostrar márgenes ni texto. */
  recorte?: { x: number; y: number; w: number; h: number }
  hotspots?: Hotspot[]
  fuente: Fuente
}

export interface PiezaLeyenda {
  pos: string[]
  nombre: string
  codigoBaader: string[]
  sap?: string[]
  /** «alta» = nombre y dibujo coinciden; «media» = por forma/ubicación, confirmar en la máquina. */
  confianza: 'alta' | 'media'
  revisar?: string
  tornilleria?: boolean
}

export interface Chequeo {
  texto: string
  valor?: string
  unidad?: string
}

export interface Diagnostico {
  falla: string
  /** Id de la sección de troubleshooting en `baader200-sections`, si existe. */
  seccionApp?: string
  chequeos: Chequeo[]
  fuente: Fuente
}

export interface SeccionTerreno {
  id: string
  orden: number
  titulo: string
  zona: string
  medidaPrincipal?: MedidaPrincipal
  medidas: Medida[]
  pasos: Paso[]
  advertencias: Advertencia[]
  dibujos: Dibujo[]
  leyenda: PiezaLeyenda[]
  diagnostico: Diagnostico[]
  didactico?: {
    porQue?: { texto: string; dibujoId?: string; fuente: Fuente }
    notaAuditoria?: string
  }
}

export interface FuenteInfo {
  titulo: string
  corto: string
  paginas: number
  /** Tamaño en px de los renders de página: el recorte en % necesita la proporción real. */
  ancho: number
  alto: number
  urlPagina: (n: number) => string
}

/** La app se sirve bajo `/mantenimiento-planta/`: las rutas de `public/` llevan la base. */
const BASE = import.meta.env?.BASE_URL ?? '/'

export const FUENTES: Record<FuenteId, FuenteInfo> = {
  v4: {
    titulo: 'Nuevo manual de ajuste Baader 200 V4 (Boanerges Service)',
    corto: 'Manual V4',
    paginas: 56,
    ancho: 935,
    alto: 1210,
    urlPagina: n => `${BASE}baader200-manual/v4/p${String(n).padStart(2, '0')}.jpg`,
  },
  planta: {
    titulo: 'Introducción Baader 200 para técnicos y operadores (Marine Harvest Chamiza, 2007)',
    corto: 'Manual de planta',
    paginas: 38,
    ancho: 1968,
    alto: 1496,
    urlPagina: n => `${BASE}baader200-manual/page-${String(n).padStart(2, '0')}.jpg`,
  },
  rev2: {
    titulo: 'Nuevo manual de ajuste Baader 200, rev 2 (Boanerges Service, 2022)',
    corto: 'Manual rev 2',
    paginas: 55,
    ancho: 935,
    alto: 1210,
    urlPagina: n => `${BASE}baader200-manual/rev2/p${String(n).padStart(2, '0')}.jpg`,
  },
}

export const ESPECIES: { id: EspecieId; etiqueta: string; corta: string }[] = [
  { id: 'salmon', etiqueta: 'Salmón', corta: 'Salmón' },
  { id: 'trucha', etiqueta: 'Trucha', corta: 'Trucha' },
  { id: 'blanco', etiqueta: 'Pescado blanco', corta: 'Pesc. blanco' },
]

export const V4 = (pagina: number): Fuente => ({ id: 'v4', pagina })
export const PLANTA = (pagina: number): Fuente => ({ id: 'planta', pagina })
export const REV2 = (pagina: number): Fuente => ({ id: 'rev2', pagina })

export const SALMON_INCLUYE = ['trucha asalmonada', 'salmón japonés', 'bacalao japonés', 'perca (Barsch)', 'yellowtail']
export const BLANCO_INCLUYE = ['abadejo de Alaska', 'bacalao del Pacífico', 'colín', 'añón']
