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

const BAADER_142: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'BAADER 142' },
      { label: 'Función', value: 'Evisceradora de salmones y truchas marinas frescos y enteros con cabeza; corte princesa; extracción de vísceras por vacío' },
      { label: 'Controlador', value: 'A3C' },
    ],
  },
  {
    title: 'Rango de trabajo',
    rows: [
      { label: 'Pescado', value: 'Salmón y trucha marina; fresco, no en rigor mortis; con aleta anal' },
      { label: 'Tamaño', value: '2 - 7 kgs, no eviscerado, con cabeza' },
      { label: 'Rendimiento', value: '1-16 pescados/min' },
      { label: 'No admitido', value: 'Peces/pescados en rigidez cadavérica (rigor mortis) o congelados' },
      { label: 'Ruido', value: '80 dB(A)' },
    ],
    note: 'Usar protección auditiva.',
  },
  {
    title: 'Servicios (utilities)',
    rows: [
      { label: 'Agua', value: '10 litros/min, 2 bar mínimo, toma 3/4 pulg.; manguera 3/4 pulg., diámetro interior 19 mm' },
      { label: 'Aire comprimido', value: '125 litros/min, 6 bar mínimo, 4 bar servicio, toma 3/8 pulg.; manguera 3/8 pulg., diámetro interior 10 mm; DIN ISO 8573-1 clase 7.4.3' },
      { label: 'Vacío', value: '15 m3/min, 0,4 bar presión negativa, DN 80/DN 100' },
      { label: 'Energía', value: '4 kW' },
      { label: 'Corte por agua/controlador', value: 'No instalar grifos de cierre delante de la máquina; sobre 50°C el controlador desconecta la máquina' },
    ],
  },
  {
    title: 'Datos eléctricos',
    rows: [
      { label: 'Red 220V/230V 50 Hz', value: 'Nennstrom 16 A; F0 <=25 A; Steuerspannung AC 110 V; Steuerspannung DC 24 V' },
      { label: 'Red 220V 60 Hz', value: 'Nennstrom 16 A; F0 <=25 A; Steuerspannung AC 110 V; Steuerspannung DC 24 V' },
      { label: 'Red 380V/400V/415V 50 Hz', value: 'Nennstrom 9 A; F0 <=25 A; Steuerspannung AC 110 V; Steuerspannung DC 24 V' },
      { label: 'Red 440V 60 Hz', value: 'Nennstrom 8 A; F0 <=25 A; Steuerspannung AC 110 V; Steuerspannung DC 24 V' },
      { label: 'Red 480V 60 Hz', value: 'Nennstrom 8 A; F0 <=25 A; Steuerspannung AC 110 V; Steuerspannung DC 24 V' },
      { label: 'M1', value: '0,37 kW Messerantrieb' },
      { label: 'M2', value: '0,75 kW Kontrollband' },
      { label: 'M3', value: '0,75 kW Exzenterschneckenpresse' },
      { label: 'F1/F2/F3-F4/F5', value: 'Según tabla: F1 2,7 A/1,3 A/1,2 A/1,1 A por tensión; F2 1,4 A/0,8 A/0,7 A; F3,F4 10 A; F5 2,4- 4 A o 1- 1,6 A / 0,6- 1 A' },
    ],
    note: 'Valores tomados de los Stromlauf- u. Klemmenplan 142.70.00.860 / 142.70.00.851.',
  },
  {
    title: 'Selector 5 (programas)',
    rows: [
      { label: 'Cleaning Position', value: 'Grifos esféricos para tubos de aspiración abiertos' },
      { label: 'Test 12', value: 'Marcha de prueba de máquina completa' },
      { label: 'Test 13', value: 'Marcha de prueba solo herramientas' },
      { label: 'Height [mm]', value: 'Valor actual de altura del palpador' },
      { label: 'Service for Stepmotors', value: 'Ajuste de motores paso a paso' },
      { label: 'Stop for justage 1 F/min', value: 'Parada en posición cero de abrazadera de colas' },
      { label: 'Reset Fishcounter', value: 'Contador de pescados vuelve a cero' },
      { label: 'Después de seleccionar tamaño/corte', value: 'Volver selector 5 a la posición de clase de pescado' },
    ],
  },
  {
    title: 'Limpieza',
    rows: [
      { label: 'P3-topax 17', value: '2 - 5%; espumar desde abajo hacia arriba; tiempo de acción 15 minutos' },
      { label: 'P3-topax 56', value: '2 - 5%; usar 1 vez por semana para capas de cal en lugar de P3-topax 17' },
      { label: 'Enjuague principal', value: 'Agua potable 60°C máximo, baja presión 30 bar máximo, desde arriba hacia abajo' },
      { label: 'P3-topax 91', value: '1%; desinfección a 30 bar máximo; tiempo de acción unos 10-15 minutos' },
      { label: 'Aclarado final', value: 'Agua potable, 20°C aprox., baja presión 30 bar máximo' },
      { label: 'Limpieza diaria', value: 'Selector 5 en limpieza; arrancar bomba de vacío; introducir bastante agua en aberturas de aspiración; no desconectar interruptor principal' },
    ],
    note: 'No rociar con spray cajas de distribución ni aparatos eléctricos.',
  },
  {
    title: 'Mantenimiento periódico',
    rows: [
      { label: 'Diario', value: 'Verificar palpador por marcha suave; cambiar hoja de membrana; verificar cuchillas y hojas' },
      { label: 'Diario BNM (BUSCH)', value: 'Rociar bomba con 10 l de agua; girar interruptores 360°; resetear contador' },
      { label: 'Semanal', value: 'Lubrificar máquina, palpador y bielas; desmontar cuchilla hendedora y reafilarla o sustituirla' },
      { label: 'Semanal controles', value: 'Hermeticidad de mangueras, tensión de correas dentadas y sujeciones' },
      { label: 'Presiones semanales', value: 'Aire 4 bar, agua 2 bar, vacío -0,4 bar' },
      { label: 'Lubricante', value: 'GLS 380/N3' },
      { label: 'Pistola de grasa', value: 'Presión máxima en boquilla no debería sobrepasar 190 bar' },
      { label: 'Spray FLC 65', value: 'Palpador, cabezas articuladas y cadena: intervalo 40 horas' },
    ],
  },
  {
    title: 'Chequeo antes de operar',
    rows: [
      { label: 'Cubiertas y placas', value: 'Montadas antes de poner la máquina en marcha' },
      { label: 'Dispositivos de seguridad', value: 'Inspeccionar funcionamiento correcto; la máquina debe pararse al levantar cubiertas, girar puertas protectoras o accionar emergencias' },
      { label: 'Arranque', value: 'Cerrar cubiertas y puertas; selector 5 en limpieza; arrancar bomba de vacío; selector 5 a clase de pescado; selector 4 a velocidad; pulsar I' },
      { label: 'Primeros pescados', value: 'Hacer pasar 2-3 pescados y corregir con interruptores 1-3 si es necesario' },
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
  'baader-142': BAADER_142,
}

export function getQuickRef(machineSlug: string): QuickRefGroup[] | null {
  return QUICK_REF[machineSlug] ?? null
}

export function hasQuickRef(machineSlug: string): boolean {
  return machineSlug in QUICK_REF
}
