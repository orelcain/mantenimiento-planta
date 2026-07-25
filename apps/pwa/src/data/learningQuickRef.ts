/**
 * learningQuickRef — "Consulta rápida" por máquina: los datos duros que un
 * técnico necesita en terreno sin leer el manual (claves de acceso, parámetros,
 * rutas de menú del controlador, tolerancias, conceptos). Formato lámina.
 *
 * Fuentes: manual publicado en el módulo + anotaciones de los grupos Telegram
 * (bandeja _SYNC_TELEGRAM / expedientes ⚙️ EQUIPOS PLANTA, verificadas 2026-07).
 *
 * ⚠ `sensitive: true` = claves de servicio. El Centro es PÚBLICO sin login:
 * esas filas se enmascaran para visitantes y solo se muestran autenticado.
 *
 * Piloto hardcodeado. Siguiente paso si se valida: colección Firestore
 * `quickref` + editor admin, igual que el resto de learningContent.ts.
 */

export interface QuickRefRow {
  label: string
  value: string
  /** Clave/código de servicio: visible solo con sesión iniciada. */
  sensitive?: boolean
}

export interface QuickRefGroup {
  title: string
  rows: QuickRefRow[]
  /** Nota corta al pie del grupo (fuente, advertencia). */
  note?: string
}

const GRADER: QuickRefGroup[] = [
  {
    title: 'Claves de acceso',
    rows: [
      { label: 'Guardar parámetros', value: '8620', sensitive: true },
    ],
    note: 'Se aplica en "Cambiar parámetros" al salir de calibración para guardar; después reiniciar desde la botonera.',
  },
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
      { label: 'Ruta calibración', value: 'Menu › Servicio › Explorar can bus › Pocket › Calibrar báscula › Opción 1 (base Estatic)' },
      { label: 'Secuencia', value: 'Tara ">0<" › peso patrón 5.000 › Ok › retirar peso › ">0<" › Ok › salir y guardar con clave' },
      { label: 'Parámetro fino', value: 'fsWc — MENU › Servicio › Cambiar parámetros › Static Grader › ZBelt › Pocket [1–4]' },
      { label: 'Peso patrón', value: '5 kg' },
      { label: 'SOP', value: 'CH-MT-ME-0002' },
    ],
  },
  {
    title: 'Flippers y conceptos',
    rows: [
      { label: 'Distancia de flipper', value: 'bajar dist → abre antes · subir dist → abre después' },
      { label: 'P0 (punto cero)', value: 'pescado sin compuerta asignada → clasificación manual. KPI de rechazo.' },
      { label: 'Pocket', value: 'báscula estática donde se pesa cada pescado' },
    ],
  },
]

const MAREL_HG: QuickRefGroup[] = [
  {
    title: 'Claves de acceso',
    rows: [
      { label: 'Menú Servicio', value: '5638000', sensitive: true },
    ],
    note: 'Da acceso al menú Servicio del controlador.',
  },
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'Marel A600 M3310 HG' },
      { label: 'Función', value: 'corte de cabeza (heading) línea eviscerado' },
    ],
  },
  {
    title: 'Qué se puede hacer en Servicio',
    rows: [
      { label: 'Flippers entrada Baader', value: 'activación manual desde el Marel (Servicio › flippers)' },
      { label: 'Distancia de flipper', value: 'modificable en Servicio — criterio: bajar dist → abre antes · subir → abre después' },
    ],
    note: 'Paso a paso con imágenes en la pestaña Procedimientos → "Modificar distancia de flipper".',
  },
]

const MAREL_FILETE: QuickRefGroup[] = [
  {
    title: 'Claves de acceso',
    rows: [
      { label: 'Modo Servicio', value: '1300', sensitive: true },
      { label: 'Modo Avanzado', value: '11', sensitive: true },
    ],
    note: 'Da acceso a modo Servicio y modo Avanzado del controlador.',
  },
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'Marel M6410 (báscula dinámica / filete)' },
    ],
  },
]

const GEA: QuickRefGroup[] = [
  {
    title: 'Claves de acceso',
    rows: [
      { label: 'Mantención (nivel 4)', value: '1310', sensitive: true },
    ],
    note: 'Da acceso a mantención nivel 4 del panel GEA.',
  },
]

const QUICK_REF: Record<string, QuickRefGroup[]> = {
  grader: GRADER,
  'marel-hg': MAREL_HG,
  'marel-filete': MAREL_FILETE,
  'termoformadora-gea': GEA,
}

export function getQuickRef(machineSlug: string): QuickRefGroup[] | null {
  return QUICK_REF[machineSlug] ?? null
}

export function hasQuickRef(machineSlug: string): boolean {
  return machineSlug in QUICK_REF
}
