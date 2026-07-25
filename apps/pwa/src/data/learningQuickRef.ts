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
    title: 'Chequeo diario (antes de operar)',
    rows: [
      { label: 'Transportador elevador', value: 'los 2 ojos de detección deben ver pasar una aleta' },
      { label: '2ª cinta de aceleración', value: 'los ojos de detección deben detectar producto' },
      { label: 'Cero en Z2', value: 'con pockets vacíos, la indicación debe estar entre −5 g y +5 g' },
    ],
    note: 'Después de usar: limpiar la cinta, limpiar los ojos de detección y limpiar toda la máquina.',
  },
  {
    title: 'Limpieza',
    rows: [
      { label: 'Grado IP mínimo', value: 'IP65' },
      { label: 'Cintas', value: 'admiten alta presión' },
      { label: 'Sensores, botones, motores', value: 'solo baja presión — menos de 3 bar' },
      { label: 'Temperatura de productos de limpieza', value: 'no superar 80 °C' },
      { label: 'Después de limpiar con químicos', value: 'enjuagar siempre con agua dulce' },
    ],
  },
  {
    title: 'Neumática y flippers',
    rows: [
      { label: 'Presión filtro-regulador', value: 'mínimo 0,5 MPa (5 bar)' },
      { label: 'Velocidad de cilindro', value: 'CCW aumenta · CW reduce (regulador de caudal integrado)' },
      { label: 'Ajuste de velocidad', value: 'solo el flujo del tubo de escape, no el que crea la fuerza' },
      { label: 'Separación flipper-cinta', value: 'aprox. 0,5 mm, en abierto y cerrado' },
      { label: 'Distancia de flipper', value: 'bajar dist → abre antes · subir dist → abre después' },
    ],
  },
  {
    title: 'Mantenimiento periódico',
    rows: [
      { label: 'Mensual — flippers', value: 'holgura vertical → cambiar rodamientos; holgura horizontal → cambiar rodamientos de bola del cilindro' },
      { label: 'Semestral — cinta modular', value: 'reemplazar si se alargó, si hay desgaste superior o si quedó rígida tras limpieza profunda' },
      { label: 'Motor de tambor', value: 'flecha indentada debe apuntar hacia arriba; desviación máx. 45°' },
      { label: 'Aceite motor de tambor', value: 'Castrol Optileb GT 150 · Klüber UH-1-68 · Petro Canada Purity FG EP 100' },
    ],
  },
  {
    title: 'Conceptos',
    rows: [
      { label: 'P0 (punto cero)', value: 'pescado sin compuerta asignada → clasificación manual. KPI de rechazo.' },
      { label: 'Pocket', value: 'báscula estática donde se pesa cada pescado' },
      { label: 'Arranque Z2', value: '~30 s, luego abre/cierra todos los flippers para autochequeo' },
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
      { label: 'Manual', value: 'M-Weigher WTR 191129SPA-2, rev. 1.02, 26-02-2025 · códigos GR8251/GR8252' },
    ],
  },
  {
    title: 'Datos técnicos M-Weigher WTR',
    rows: [
      { label: 'Protección', value: 'IP65' },
      { label: 'Masa', value: 'Single Lane ~165 kg · Dual Lane ~200 kg' },
      { label: 'Temperatura ambiente', value: '7 °C a 40 °C' },
      { label: 'Altura de cinta', value: 'H950 / H1050 / H1250, ajuste ±100 mm' },
      { label: 'Eslabones cinta', value: 'MW1000=180 · MW1450=252 · MW1900=324 — nunca quitar para acortar' },
    ],
  },
  {
    title: 'Sensor de producto',
    rows: [
      { label: 'Altura del haz', value: '5–10 mm sobre la cinta (SmartLine: ~6 mm)' },
      { label: 'Ajuste', value: 'sensibilidad media, regulador vertical, selector en L (luz encendida)' },
      { label: 'Piezas finas', value: 'no debe detectar 3 mm · sí debe detectar 6 mm' },
    ],
  },
  {
    title: 'Instalación SmartLine',
    rows: [
      { label: 'Nivelación plataforma', value: 'perfectamente recta y nivelada, sin girar al atornillar al suelo' },
      { label: 'Deformación máx. plataforma', value: '0,2 mm (revisar con regla y lámina calibradora)' },
      { label: 'Desnivel entre módulos', value: '15–25 mm; entre transferencias 0,3–0,5 mm' },
      { label: 'Velocidad de cintas', value: 'alimentación ≤ pesaje ≤ descarga' },
      { label: 'Cintas contiguas', value: 'extremo con extremo, alineadas, SIN tocarse (dañan precisión)' },
    ],
  },
  {
    title: 'Neumática y eléctrico',
    rows: [
      { label: 'Aire requerido', value: 'limpio y seco, ISO 8573-1 clase 3' },
      { label: 'Presión de línea', value: 'mínimo 7 bar · sobre 10 bar puede dañar la línea' },
      { label: 'Presión de funcionamiento', value: '6 bar (85–87 psi) en regulador de cabina' },
      { label: 'Suministro SmartLine', value: '3×400V+N+PE · 3×230V+GND · 3×208V+GND' },
      { label: 'Arranque diario', value: 'Start → dejar cintas al vacío hasta ver "Steady" en el M3210' },
      { label: 'Al detener', value: 'NO apagar el interruptor principal — el calor evita condensación' },
    ],
  },
  {
    title: 'Brazos de puerta y cilindros (SmartLine)',
    rows: [
      { label: 'Separación brazo-cinta', value: '1–2 mm' },
      { label: 'Revisión semanal', value: 'cilindros de aire; limpiar biela del pistón con paño con aceite' },
      { label: 'Ajuste', value: 'ángulo/posiciones primero, luego espacio brazo-cinta (aflojar 2 pernos)' },
    ],
  },
  {
    title: 'Alarmas frecuentes',
    rows: [
      { label: 'ID 2 — Sensor de productos', value: 'bloqueo, desperdicios cerca del sensor, o transmisor/receptor desalineado' },
      { label: 'ID 8 — Peso de cinta inestable', value: 'revisar limpieza, eslabones dañados y tensión de cinta' },
      { label: 'ID 13 — Índice de cinta', value: 'comprobar eslabón metálico de índice y sensor de cinta' },
      { label: 'ID 14 — Inicialización', value: 'báscula no lista: detener alimentación y dar tiempo' },
      { label: 'Cero muy antiguo', value: 'detener alimentación para que adopte nuevo perfil cero' },
    ],
    note: 'El botón Alarma parpadea rojo/naranja/amarillo según prioridad — revisar siempre el Registro de alarmas primero.',
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
