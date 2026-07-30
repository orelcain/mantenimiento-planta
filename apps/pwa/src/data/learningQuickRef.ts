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
      { label: 'Eslabones cinta', value: 'nunca quitar eslabones para acortar la cinta. El conteo por modelo (MW1000=180 · MW1450=252 · MW1900=324) es de la familia SmartLine: confirmar contra la placa de esta máquina' },
    ],
  },
  {
    title: 'Sensor de producto',
    rows: [
      { label: 'Altura del haz', value: '5–10 mm sobre la cinta, según el producto' },
      { label: 'Ajuste', value: 'sensibilidad media, regulador vertical, selector en L (luz encendida)' },
      { label: 'Piezas finas', value: 'no debe detectar 3 mm · sí debe detectar 6 mm' },
    ],
  },
  {
    title: 'Instalación y nivelación',
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
      { label: 'Suministro eléctrico', value: '3×400V+N+PE · 3×230V+GND · 3×208V+GND' },
            { label: 'Al detener', value: 'NO apagar el interruptor principal — mantiene corriente constante y evita la condensación de humedad' },
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
      { label: 'Por turno (cada 8 h) y tras CADA limpieza', value: 'ENGRASAR máquina, palpador y bielas — expulsa el agua que entró a los cojinetes al lavar. Después quitar la grasa sobrante' },
      { label: 'Semanal', value: 'Desmontar cuchilla hendedora y reafilarla o sustituirla' },
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

const BAADER_200: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'BAADER 200' },
      { label: 'Función', value: 'Fileteadora — corte de filetes, cuchillos ventrales/dorsales/punzones/rascadores/cola' },
      { label: 'Manual vigente', value: 'Nuevo manual de ajuste Baader 200 V4' },
    ],
  },
  {
    title: 'Regla general de roscas',
    rows: [
      { label: 'Con muesca', value: 'Se saca en sentido horario · se pone en sentido antihorario' },
      { label: 'Sin muesca', value: 'Se saca en sentido antihorario · se pone en sentido horario' },
    ],
    note: 'Regla espejo — verificar siempre si la pieza tiene muesca antes de girar.',
  },
  {
    title: 'Ajustes clave (tolerancias)',
    rows: [
      { label: '1ra Alimentación — chapaletas', value: 'referencia catálogo 32-28mm; en la práctica generalmente menos' },
      { label: '2da Alimentación — chapaletas vs dorsales', value: '±0.5mm (casi chocando)' },
      { label: '2do levantador — vs contradiente', value: '5mm' },
      { label: 'Cuchillos ventrales — avance "a"', value: '5mm' },
      { label: 'Guías flotantes — abertura máxima', value: '4.8mm (ajustar SIEMPRE después de ventrales)' },
      { label: 'Ventrales vs dorsales', value: '12mm — pernos topes pos 4-5; verificar siempre al cambiar cuchillos' },
      { label: 'Dorsales — abertura "b" POR ESPECIE', value: 'Salmón 5mm · Trucha 4mm · Blanco 7mm — cubos sujetadores pos 3 (NO confundir con los 12mm)' },
      { label: 'Levante cuchillos dorsales', value: '20mm al paso de la silleta' },
      { label: 'Cuchillos punzones — separación', value: '8mm' },
      { label: 'Cuchillos rascadores — abertura', value: '17-18mm' },
      { label: 'Cuchillos ventrales — diámetro objetivo', value: '~200mm (el mayor disponible)' },
    ],
  },
  {
    title: 'Sistema de seguridad (9 puntos)',
    rows: [
      { label: '1', value: 'Límite de carrera de entrada' },
      { label: '2', value: 'Parada de emergencia' },
      { label: '3', value: 'Límite de carrera corte de cola' },
      { label: '4', value: 'Sensor de seguridad guía dorsal' },
      { label: '5-8', value: 'Sensores de seguridad pasillo (zonas 5 a 8)' },
      { label: '9', value: 'Interruptor principal' },
    ],
  },
  {
    title: 'Precauciones — cambio de cuchillos nuevos',
    rows: [
      { label: 'Medida patrón', value: 'Ajustar a 12mm entre cuchillos ventrales y dorsales' },
      { label: 'Guías flotantes', value: 'Reajustar SIEMPRE con cuchillos nuevos' },
      { label: 'Guías frontales/superior', value: 'Reajustar si es necesario' },
    ],
  },
  {
    title: 'Diagnóstico rápido (síntoma → revisar)',
    rows: [
      { label: 'Gay ping a lo largo del esquelón', value: 'Filo y altura de trabajo del cuchillo de punta; altura y abertura de rascadores' },
      { label: 'Gay ping zona cola/aleta anal', value: 'Diámetro (~200mm) y filo de ventrales; separación ventrales-dorsales (máx 12mm); resortes de guías flotantes' },
      { label: 'Espina belly', value: 'Altura de cuchillos rascadores; calidad del eviscerado (sin esófago ni riñón)' },
      { label: 'Colgajo en línea del esquelón', value: 'Filo y abertura de cuchillos de punta; abertura de desviadores y cuchillos de cola' },
      { label: 'Exceso de aleta anal', value: 'Alineamiento de guías flotantes; filo de ventrales; resortes de guías flotantes' },
      { label: 'Embrague bloqueado', value: 'Verificar objeto interpuesto ANTES de reajustar (perno M8 parker + palanca 30×30×130mm)' },
    ],
  },
]

const FISHKEN: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'Fishken E-Pack S28' },
      { label: 'Función', value: 'Envasadora/pesadora combinatoria — arma cajas dentro de un peso objetivo combinando 28 compuertas' },
      { label: 'Software', value: 'E-Pack S28 (control) + FishKen Web (reportes)' },
    ],
  },
  {
    title: 'Eléctrico',
    rows: [
      { label: 'General moto vibradores', value: 'Automático de 80 A' },
      { label: 'Moto vibradores de empaque', value: 'Tienen automáticos propios en el tablero, además del general' },
    ],
  },
  {
    title: 'Menú principal E-Pack',
    rows: [
      { label: 'Iniciar Proceso', value: 'Controla el proceso productivo y muestra los datos en vivo' },
      { label: 'Servicio FishKen', value: 'Calibración, ajuste de puertas y pruebas de conexión' },
    ],
  },
  {
    title: 'Servicio FishKen (3 tareas)',
    rows: [
      { label: 'Calibración', value: 'Calibración del sistema de pesaje' },
      { label: 'Ajuste de puertas', value: 'Habilitar/deshabilitar compuertas (casilla Activo + Guardar Cambios)' },
      { label: 'Pruebas de conexión', value: 'Base de Datos · Tarjetas de Relé (NUMATO) · Tarjetas de Pesaje' },
    ],
  },
  {
    title: 'Estadísticas del proceso',
    rows: [
      { label: 'Compuerta habilitada', value: 'Se ve con transparencia' },
      { label: 'Compuerta deshabilitada', value: 'Se ve en color ROJO' },
      { label: '% de sobrepeso', value: 'Cuánto se pasa la caja del peso objetivo — cuanto menor, mejor' },
      { label: 'Productividad', value: 'kg/h y cajas/h' },
    ],
    note: 'Las estadísticas se cuentan desde el último reinicio o carga de configuración.',
  },
  {
    title: 'Diagnóstico rápido (síntoma → revisar)',
    rows: [
      { label: 'Compuerta en rojo', value: 'Deshabilitada a propósito o por problema de pesaje — Ajuste de puertas para reactivar' },
      { label: 'Sobrepeso/rechazo alto', value: 'Compuerta con pesaje impreciso, rango de celda mal configurado o celda sucia/descalibrada' },
      { label: 'No guarda/lee datos, sin reportes', value: 'Falla Base de Datos — Pruebas de conexión' },
      { label: 'Compuertas no accionan', value: 'Falla Tarjetas de Relé (NUMATO) — revisar cableado/tarjeta' },
      { label: 'Pesaje ausente o errático', value: 'Falla Tarjetas de Pesaje o celda de carga desconectada/dañada' },
    ],
  },
  {
    title: 'Reportes FishKen Web',
    rows: [
      { label: 'Por Especie', value: 'General y Detallado' },
      { label: 'Por Calidad', value: 'General y Detallado' },
      { label: 'Por Calibre', value: 'General y Detallado' },
    ],
  },
]

const DETECTOR_METALES: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Familia', value: 'Sartorius Vistus (variantes C/H/T/E/S/R/EI según abertura y electrónica)' },
      { label: 'Detecta', value: 'Metales ferrosos, no ferrosos (aluminio, latón, bronce) y aceros inoxidables (magnéticos y no magnéticos)' },
      { label: 'Más difícil de detectar', value: 'Acero inoxidable no magnético (AISI 304 / V2A)' },
    ],
  },
  {
    title: 'Zona libre de metales',
    rows: [
      { label: 'Aguas arriba/abajo — transporte inox', value: '3 veces la altura de la abertura' },
      { label: 'Aguas arriba/abajo — transporte acero', value: '4 veces la altura de la abertura' },
      { label: 'Izquierda/derecha/arriba/abajo', value: 'Al menos el equivalente a la altura de la abertura' },
    ],
    note: 'Si no se puede mantener la zona libre, la sensibilidad se reduce.',
  },
  {
    title: 'Perfiles de producto',
    rows: [
      { label: 'Antes de inspeccionar', value: 'Crear perfil + aprender el efecto de producto (mínimo 3 piezas libres de metal)' },
      { label: 'Nombre/N° artículo', value: 'Máximo 15 caracteres para verse completos' },
      { label: 'Editar ajustes de detección', value: 'Solo ingeniero o responsable de mantenimiento' },
    ],
  },
  {
    title: 'Semáforo y mensajes',
    rows: [
      { label: 'Rojo — Error (E)', value: 'Detección se detiene, dispara relé Error. Confirma: ingeniero' },
      { label: 'Amarillo — Advertencia (W)', value: 'Detección sigue funcionando. Confirma: operador o ingeniero' },
      { label: 'Informativo — Evento (M)', value: 'Detección funciona normal (ej. USB conectado)' },
      { label: 'Detección (X)', value: 'Se disparó la detección de metal' },
    ],
    note: 'Solventar la causa SIEMPRE antes de confirmar — un error confirmado sin resolver reaparece.',
  },
  {
    title: 'Diagnóstico rápido (código → acción)',
    rows: [
      { label: 'W0008 — recipiente lleno', value: 'Vaciar el recipiente colector' },
      { label: 'W0017/W0018 — cinta vs impulsos', value: 'Revisar transmisor de impulsos y sensor inicio/parada de cinta' },
      { label: 'W0019 — transporte sucio', value: 'Limpiar; si no mejora, sustituir cinta o cadena' },
      { label: 'W0020 — acumulación de metal', value: 'Revisar origen de detecciones y aprendizaje del producto' },
      { label: 'EFF07 — separación muy corta', value: 'Aumentar distancia entre separador y detector' },
      { label: 'EFF08 — campo transmisor bajo', value: 'Aumentar tensión del transmisor en "Cambiar datos producto"' },
      { label: 'Falsos rechazos recurrentes', value: 'Reaprender efecto de producto; revisar zona libre de metales' },
      { label: 'E01xx / FFFF / software', value: 'No accionable en planta — notificar a Sartorius Mechatronics' },
    ],
  },
  {
    title: 'Mantenimiento del terminal',
    rows: [
      { label: 'Batería reloj interno', value: 'Litio 3V tipo CR2032 — dura ~3 años' },
      { label: 'Al agotarse', value: 'Se pierden fecha y hora; reajustar tras cambiarla' },
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
  {
    title: 'Ajuste producto congelado',
    rows: [
      { label: 'Valor teórico sensor de vacío', value: '2 hPa → 1 hPa' },
      { label: 'Retraso de vacío (moldeo)', value: '0.50 → 0.60' },
      { label: 'Duración de moldeo', value: '2.00 → 2.20' },
      { label: 'Vacío de moldeo', value: '1.00 → 1.20' },
    ],
    note: 'Valores de referencia del ajuste para producto congelado — verificar contra receta activa antes de aplicar.',
  },
  {
    title: 'Pasos de regulación (film y velocidad)',
    rows: [
      { label: 'Tensión de film', value: 'De 500 en 500 (valor de referencia 14500, antes 12000)' },
      { label: 'Velocidad de caída', value: 'De 50 en 50 (valor de referencia 200)' },
      { label: 'Leva film superior', value: 'Ajuste normal por parámetros (hoja 3630) — mecánico muy rara vez' },
      { label: 'Film inferior (tras modificación técnico GEA)', value: 'Ya NO requiere tensar en cada reanudación del proceso' },
    ],
  },
  {
    title: 'Estaciones de formado y sellado',
    rows: [
      { label: 'Formado — placas delgadas', value: '2 por lado' },
      { label: 'Sellado — placas retiradas', value: '1 por lado' },
      { label: 'Sellado — abertura de elevación', value: '25 → 55' },
      { label: 'Ajuste de aceleración/velocidad', value: 'Aceleración 60% → 10% · Velocidad 85% → 20% · Elevación 35 → 25' },
    ],
  },
  {
    title: 'Recetas',
    rows: [
      { label: 'Flujo', value: 'Cargar receta → Agregar nueva → Guardar parámetros modificados' },
    ],
  },
]

/**
 * Enzunchadora Transpak TP-6000-1. Todo sale del manual de operación
 * (`TRANSPAK_TP-6000-1_Manual_operacion_y_repuestos.pdf`, págs. 1-22).
 * SIN grupo "Claves de acceso": esta máquina no tiene clave de servicio
 * documentada en su manual — no se inventa una.
 */
const ENZUNCHADORA: QuickRefGroup[] = [
  {
    title: 'Identificación',
    rows: [
      { label: 'Modelo', value: 'Transpak TP-6000-1' },
      { label: 'Tipo', value: 'Flejadora automática de cajas · sellado por CALOR' },
      { label: 'Peso de la máquina', value: '220 kg' },
      { label: 'Dimensiones', value: 'Ancho 1430 mm · Profundidad 620 mm' },
      { label: 'Altura de mesa', value: '810 mm' },
    ],
  },
  {
    title: 'Fleje admitido',
    rows: [
      { label: 'Material', value: 'Solo PP (polipropileno)' },
      { label: 'NO usar', value: 'Fleje PET ni cordón de poliéster' },
      { label: 'Ancho', value: '8 a 12 mm (3/8" - 1/2")' },
      { label: 'Espesor', value: '0,55 a 0,75 mm' },
      { label: 'Diámetro de bobina', value: '200 mm (8" nominal)' },
      { label: 'Cambio de ancho', value: 'Requiere kit de conversión (opcional)' },
    ],
    note: 'Fleje fuera del rango de espesor obliga a reajustar el mecanismo de avance: si no, el fleje se sale de la pista del arco.',
  },
  {
    title: 'Límites del paquete',
    rows: [
      { label: 'Peso máximo', value: '100 kg' },
      { label: 'Tamaño mínimo', value: '100 mm ancho x 20 mm alto' },
      { label: 'Posición', value: 'Centrado en el cabezal de sellado' },
      { label: 'Temp. ambiente admitida', value: '5 °C a 40 °C' },
      { label: 'Ruido', value: '83 dB(A)' },
    ],
  },
  {
    title: 'Ajustes clave',
    rows: [
      { label: 'Tensión (rango 0-10)', value: 'Caja de cartón: 4 o 5' },
      { label: 'Temperatura (rango 1-6)', value: 'Fijar en 3 o 4' },
      { label: 'Holgura avance/recogida', value: 'IGUAL al espesor del fleje en uso' },
      { label: 'Holgura de fábrica', value: 'Ajustada para fleje de 0,55 a 0,60 mm' },
      { label: 'Acumulador: falta fleje', value: 'Aflojar tuerca y girar tornillo ANTIHORARIO' },
      { label: 'Acumulador: sobra fleje', value: 'Aflojar tuerca y girar tornillo HORARIO' },
    ],
    note: 'La temperatura se corrige DE A POCO: si está muy alta o muy baja no se logra sello. No saltar de un extremo al otro.',
  },
  {
    title: 'Temporizadores T1 y T2',
    rows: [
      { label: 'T1 — qué controla', value: 'Recogida del fleje (take-up) = el tensado' },
      { label: 'T1 trifásica', value: '≈ 0,4 s' },
      { label: 'T1 monofásica', value: '≈ 0,3 s' },
      { label: 'T2 — qué controla', value: 'Alimentación del fleje (feed)' },
      { label: 'T2 trifásica', value: '≈ 0,8 s (arco estándar 850x600)' },
      { label: 'T2 monofásica', value: '≈ 0,7 s (arco estándar 850x600)' },
    ],
    note: 'Si el fleje NO llega al sellado, el parámetro es T2. Si sale FLOJO, es T1. T1 se fija pensando en el paquete más pequeño a flejar.',
  },
  {
    title: 'Datos eléctricos',
    rows: [
      { label: 'Monofásica (1PH)', value: 'AC 110 / 220 / 230 / 240 V · 50/60 Hz' },
      { label: 'Trifásica (3PH)', value: 'AC 220 / 380 / 400 V · 50/60 Hz' },
      { label: 'Puesta a tierra', value: 'Obligatoria; cablear según código eléctrico local' },
      { label: 'Alargadores', value: 'PROHIBIDOS por el manual' },
      { label: 'Relé de sobrecarga', value: 'Corta solo; para reponer accionar el switch magnético' },
    ],
  },
  {
    title: 'Chequeo antes de operar',
    rows: [
      { label: '1. EPP', value: 'Protección ocular + guantes de seguridad' },
      { label: '2. Tensión', value: 'Verificar que la alimentación sea la correcta' },
      { label: '3. Fleje', value: 'Confirmar que sea PP, no PET' },
      { label: '4. Precalentamiento', value: 'Esperar ≈ 3 minutos antes de flejar' },
      { label: '5. En marcha', value: 'Manos y cuerpo FUERA del área del arco' },
      { label: '6. Atender', value: 'Humo o ruido anormal = detener' },
    ],
    note: 'En pausas cortas dejar el STOP BLOQUEADO: la máquina para pero el calentador mantiene temperatura y no se pierden los 3 minutos.',
  },
  {
    title: 'Diagnóstico rápido',
    rows: [
      { label: 'Piloto NO enciende', value: 'Suministro · fusible · cable cortado · STOP bloqueado' },
      { label: 'Piloto ON, no opera', value: 'Switch START/STOP · 1 de los 3 cables · correa de motores' },
      { label: 'Fleje no llega al sellado', value: 'T2 muy corto · fleje torcido al cargar · se sale de la pista' },
      { label: 'Fleje sin sellar', value: 'Temperatura · cable del calentador · LS-3 · tensión muy alta' },
      { label: 'Fleje flojo', value: 'T1 muy corto · perilla de tensión · resortes de tensión' },
      { label: 'Avance irregular', value: 'Cantidad en acumulador · suciedad en unidad de alimentación' },
    ],
    note: 'La tabla completa de troubleshooting del manual (26 causas con su remedio) está en la pestaña Diagnóstico.',
  },
]

const QUICK_REF: Record<string, QuickRefGroup[]> = {
  grader: GRADER,
  'marel-hg': MAREL_HG,
  'marel-filete': MAREL_FILETE,
  'termoformadora-gea': GEA,
  'baader-142': BAADER_142,
  'baader-200': BAADER_200,
  fishken: FISHKEN,
  'detector-metales': DETECTOR_METALES,
  'enzunchadora-n2': ENZUNCHADORA,
}

export function getQuickRef(machineSlug: string): QuickRefGroup[] | null {
  return QUICK_REF[machineSlug] ?? null
}

export function hasQuickRef(machineSlug: string): boolean {
  return machineSlug in QUICK_REF
}
