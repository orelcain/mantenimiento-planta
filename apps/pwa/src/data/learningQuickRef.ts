/**
 * learningQuickRef — "Consulta rápida" por máquina: los datos duros que un
 * técnico necesita en terreno sin leer el manual (parámetros clave, rutas de
 * menú del controlador, tolerancias, conceptos). Formato lámina escaneable.
 *
 * Piloto hardcodeado (Grader, con datos del manual ya publicado en el módulo).
 * Siguiente paso si se valida: colección Firestore `quickref` + editor admin,
 * igual que el resto del contenido de learningContent.ts.
 */

export interface QuickRefRow {
  label: string
  value: string
}

export interface QuickRefGroup {
  title: string
  rows: QuickRefRow[]
  /** Nota corta al pie del grupo (fuente, advertencia). */
  note?: string
}

const GRADER: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'Marelec MS4/12' },
      { label: 'N° de serie', value: '3943 (fabr. 2012)' },
      { label: 'Controlador', value: 'Marelec Z2' },
      { label: 'Distribuidor', value: 'Marelec Chile · Puerto Montt' },
    ],
  },
  {
    title: 'Capacidad y tolerancias',
    rows: [
      { label: 'Clases de salida', value: 'hasta 12 (lado derecho)' },
      { label: 'Rango de pesaje', value: '0 – 15 kg' },
      { label: 'Precisión', value: '±20 g (0–5 kg) · ±50 g (5–15 kg)' },
      { label: 'Velocidad de cinta', value: 'hasta 1,4 m/s' },
      { label: 'Producto máximo', value: '1100 × 290 mm' },
    ],
    note: 'Producto fuera de rango degrada la lectura y sube el rechazo a P0.',
  },
  {
    title: 'Calibración de básculas',
    rows: [
      { label: 'Parámetro', value: 'fsWc' },
      { label: 'Ruta Z2', value: 'MENU › Servicio › Cambiar parámetros › 8620 › Static Grader › ZBelt › Pocket [1–4] › fsWc' },
      { label: 'Peso patrón', value: '5 kg' },
      { label: 'SOP', value: 'CH-MT-ME-0002' },
    ],
  },
  {
    title: 'Conceptos clave',
    rows: [
      { label: 'P0 (punto cero)', value: 'pescado sin compuerta asignada → clasificación manual. KPI de rechazo.' },
      { label: 'Flipper', value: 'compuerta que desvía el pescado al bandejón según peso/calibre/calidad' },
      { label: 'Pocket', value: 'báscula estática donde se pesa cada pescado' },
    ],
  },
]

const QUICK_REF: Record<string, QuickRefGroup[]> = {
  grader: GRADER,
}

export function getQuickRef(machineSlug: string): QuickRefGroup[] | null {
  return QUICK_REF[machineSlug] ?? null
}

export function hasQuickRef(machineSlug: string): boolean {
  return machineSlug in QUICK_REF
}
