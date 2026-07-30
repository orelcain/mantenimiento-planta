/**
 * Catálogo de runbooks oficiales Marelec Z2 para el Grader.
 * Fuentes: SOP CH-MT-ME-0002, Manual Marelec MS4/12, Basculas Grader.pdf
 */

export type RunbookCategory = 'contrastacion' | 'calibracion' | 'mantencion' | 'limpieza' | 'troubleshooting'

export interface Runbook {
  id: string
  title: string
  summary: string
  category: RunbookCategory
  z2Path?: string[]
  serviceKey?: string
  formula?: { expression: string; variables: Record<string, string> }
  imageRef?: string
  steps: Array<{
    order: number
    instruction: string
    note?: string
    imageRef?: string
    durationMin?: number
    requiresTool?: string[]
  }>
  successCriteria: string[]
  triggers: Array<{
    condition: string
    metric?: string
    comparator?: '>' | '<' | '>=' | '<=' | '=='
    threshold?: number
  }>
  source: string
}

export const RUNBOOKS: Record<string, Runbook> = {
  'contrastacion-pocket': {
    id: 'contrastacion-pocket',
    title: 'Contrastación de pocket con peso patrón',
    summary: 'Verificar y recalibrar la balanza de un pocket específico usando peso patrón 5 kg',
    category: 'contrastacion',
    z2Path: ['MENU', 'Servicio', 'Cambiar parámetros', '8620', 'Static Grader', 'ZBelt', 'Pocket [1-4]', 'fsWc'],
    serviceKey: '8620',
    formula: {
      expression: 'Vp_nuevo = Vp_actual × 5000 / Vb',
      variables: {
        Vp_actual: 'Valor de calibración actual en Z2 (campo fsWc)',
        Vb: 'Lectura obtenida con el peso patrón colocado en el pocket (gramos)',
        Vp_nuevo: 'Nuevo valor a ingresar en Z2',
      },
    },
    steps: [
      { order: 1, instruction: 'Detener la producción y asegurar que la cinta quede vacía' },
      { order: 2, instruction: 'Tarar el pocket con botón >0< si muestra gramos residuales' },
      { order: 3, instruction: 'Colocar peso patrón de 5 000 g suavemente en pocket 1', requiresTool: ['Peso patrón 5 000 g'] },
      { order: 4, instruction: 'Anotar la lectura mostrada en pantalla (Vb)' },
      { order: 5, instruction: 'Ir a MENU → Servicio → Cambiar parámetros', note: 'Ingresar clave de servicio 8620' },
      { order: 6, instruction: 'Navegar a Static Grader → ZBelt → Pocket 1 → fsWc' },
      { order: 7, instruction: 'Anotar el valor actual (Vp_actual)' },
      { order: 8, instruction: 'Calcular Vp_nuevo = Vp_actual × 5000 / Vb', requiresTool: ['Calculadora'] },
      { order: 9, instruction: 'Ingresar Vp_nuevo y confirmar con Enter/OK' },
      { order: 10, instruction: 'Retirar el peso patrón, esperar 5 s, colocarlo de nuevo para validar' },
      { order: 11, instruction: 'La lectura debe mostrar 5 000 ± 20 g. Si no, repetir desde paso 3.' },
      { order: 12, instruction: 'Repetir pasos 2-11 para pockets 2, 3 y 4', durationMin: 15 },
    ],
    successCriteria: [
      'Lectura final del peso patrón en los 4 pockets: 4 980–5 020 g',
      'Pocket vacío: −5 a +5 g',
    ],
    triggers: [
      { condition: 'P0 "Fuera de límites" > 2 %', metric: 'fuera_de_limites_pct', comparator: '>', threshold: 2 },
      { condition: 'Inicio de temporada o cambio de especie' },
    ],
    source: 'SOP CH-MT-ME-0002 + Basculas Grader.pdf',
  },

  'pocket-vacio-check': {
    id: 'pocket-vacio-check',
    title: 'Check diario de pocket vacío (tara)',
    summary: 'Verificar que todos los pockets vacíos leen entre −5 y +5 g al inicio del turno',
    category: 'contrastacion',
    steps: [
      { order: 1, instruction: 'Al inicio del turno, asegurar cinta completamente vacía' },
      { order: 2, instruction: 'Presionar botón >0< (tara) en el panel si se muestra peso residual' },
      { order: 3, instruction: 'Esperar 30 segundos sin vibración' },
      { order: 4, instruction: 'Anotar lectura de cada pocket 1-4 en el registro de turno' },
      { order: 5, instruction: 'Si algún pocket lee fuera de ±5 g, proceder con runbook "contrastacion-pocket"' },
    ],
    successCriteria: ['Lectura de cada pocket vacío: −5 a +5 g'],
    triggers: [{ condition: 'Inicio de cada turno' }],
    source: 'Manual Marelec MS4/12 - Daily checkup',
  },

  'limpieza-fotocelula': {
    id: 'limpieza-fotocelula',
    title: 'Limpieza y verificación de fotocélula',
    summary: 'Limpiar sensor óptico y verificar sincronía de detección de piezas',
    category: 'limpieza',
    z2Path: ['MENU', 'Servicio', 'Probar entradas'],
    steps: [
      { order: 1, instruction: 'Detener producción' },
      { order: 2, instruction: 'Limpiar emisor y receptor de la fotocélula del elevador con BAJA PRESIÓN', note: 'Manual MS4/12 §4.2.2 pág 22: limpiar los detection eyes con baja presión y cuidado con el chorro — aunque son estancos, no resisten un chorro fuerte. El manual no prescribe paño seco ni prohíbe el alcohol.' },
      { order: 3, instruction: 'Limpiar igual la fotocélula de la 2ª cinta de aceleración' },
      { order: 4, instruction: 'Entrar a MENU → Servicio → Probar entradas' },
      { order: 5, instruction: 'Pasar una pieza manualmente y verificar que la señal de entrada cambia de estado', note: 'El chequeo diario del manual (§4.2.1) es justamente este: los dos detection eyes del elevador detectan la paleta al pasar, y los de la 2ª cinta de aceleración detectan el producto.' },
      { order: 6, instruction: 'Si no dispara: revisar alineación emisor-receptor y estado del lente', note: '⚠ El "ajustar el ángulo del emisor ±5°" que figuraba acá era una inferencia sin fuente: el fabricante no documenta ningún ajuste angular. Si la limpieza no resuelve, escalar antes que improvisar un ángulo.' },
    ],
    successCriteria: ['Ambas fotocélulas detectan 100 % de piezas pasadas manualmente'],
    triggers: [
      { condition: 'P0 "No leído por fotocélula" > 1 %', metric: 'no_leido_fotocelula_pct', comparator: '>', threshold: 1 },
    ],
    source: 'Manual Marelec MS4/12',
  },

  'presion-aire': {
    id: 'presion-aire',
    title: 'Verificación de presión de aire comprimido',
    summary: 'Verificar presión mínima 0.7 MPa (7 bar) con aire seco en el tablero neumático',
    category: 'mantencion',
    steps: [
      { order: 1, instruction: 'Ubicar manómetro en la entrada de aire del tablero neumático del grader', requiresTool: ['Manómetro'] },
      { order: 2, instruction: 'Verificar lectura: debe ser ≥ 7.0 bar (0.70 MPa)' },
      { order: 3, instruction: 'Si < 7 bar: revisar compresor principal y secador de aire' },
      { order: 4, instruction: 'Si hay condensación visible en las líneas: revisar filtro coalescente y purgar trampa de agua' },
      { order: 5, instruction: 'Purgar la trampa de agua del filtro abriendo válvula inferior 5 segundos' },
    ],
    successCriteria: ['Presión ≥ 7 bar estable', 'Aire seco (sin condensación visible en líneas)'],
    triggers: [
      { condition: 'P0 "Puerta no preparada" > 2 % (indicio falla neumática)', metric: 'puerta_no_preparada_pct', comparator: '>' as const, threshold: 2 },
      { condition: 'P0 "Fuera de límites" simultáneo en 3+ pockets (indicio de falla neumática)' },
      { condition: 'Flippers no actuando correctamente (piezas cayendo en buchaca incorrecta)' },
    ],
    source: 'Manual Marelec MS4/12 - Compressed air section',
  },

  'slow-mo-flipper': {
    id: 'slow-mo-flipper',
    title: 'Diagnóstico de flipper lento o bloqueado',
    summary: 'Identificar y resolver flipper que no actúa a tiempo, causando piezas en buchaca incorrecta',
    category: 'troubleshooting',
    z2Path: ['MENU', 'Servicio', 'Probar salidas'],
    steps: [
      { order: 1, instruction: 'Identificar el gate (1-12) con mayor incidencia de mal desvío' },
      { order: 2, instruction: 'Entrar a MENU → Servicio → Probar salidas' },
      { order: 3, instruction: 'Activar manualmente el flipper del gate afectado y observar respuesta' },
      { order: 4, instruction: 'Verificar el filtro-regulador de presión: al menos 0,5 MPa (5 bar)', note: 'Manual MS4/12 pág 37, §7.3.2' },
      { order: 5, instruction: 'Ajustar la velocidad con el regulador de caudal incorporado a la válvula de ESE flipper: CCW aumenta velocidad, CW la reduce', note: 'Regular SOLO el caudal del tubo de escape, nunca el aire que genera la fuerza (manual §7.3.2). Cada válvula lleva el número del flipper o pocket que le corresponde.' },
      { order: 6, instruction: 'Si la válvula no acciona: revisar alimentación y conexionado del solenoide', note: '⚠ El manual no publica resistencia de bobina para este equipo. No comparar contra un rango de referencia sin la hoja de datos del componente: descartar una bobina sana por un valor inventado es peor que no medir.' },
      { order: 7, instruction: 'Si bloqueado mecánicamente: inspeccionar eje del flipper y revisar juego (vertical → rodamientos 6005 2RSR; horizontal → rodamientos del vástago del cilindro)' },
    ],
    successCriteria: ['El flipper abre y cierra rápido pero SIN hacer ruido vibrante en posición abierta ni cerrada (criterio del manual §7.3.2 — el fabricante no da tiempos de respuesta)', 'Sin piezas desviadas incorrectamente en prueba manual'],
    triggers: [
      { condition: 'P0 "Puerta no preparada" > 1 %', metric: 'puerta_no_preparada_pct', comparator: '>' as const, threshold: 1 },
      { condition: 'Quejas de calibres mezclados en buchacas' },
      { condition: 'P0 elevado sin causa clara de peso (piezas con peso OK pero rechazadas)' },
    ],
    source: 'Manual Marelec MS4/12, §7.3.2 pág 37 (ajuste de velocidad de cilindros) y despiece pág 58',
  },

  'tachometro-cinta': {
    id: 'tachometro-cinta',
    title: 'Verificación y ajuste de tacómetro de cinta',
    summary: 'Verificar que el sensor de velocidad de cinta reporta correctamente para sincronía de pesaje',
    category: 'calibracion',
    z2Path: ['MENU', 'Mostrar velocidad cintas'],
    serviceKey: '8620',
    steps: [
      { order: 1, instruction: 'Anotar la velocidad de cinta configurada en el VFD (Hz)' },
      { order: 2, instruction: 'Consultar la velocidad en MENU → Mostrar velocidad cintas (opción 4.7 del desglose de menú)', note: 'Es una pantalla de CONSULTA. El instructivo "Basculas Grader" pág 2 no lista ninguna opción "Belt speed" bajo Cambiar parámetros; el árbol completo de Cambiar parámetros está en "parametros grader.pdf", que es escaneado y no se pudo verificar.' },
      { order: 3, instruction: 'Comparar la velocidad mostrada en el Z2 contra la del VFD', note: '⚠ CRITERIO INTERNO, sin respaldo del fabricante: se venía usando ±5 % de diferencia como aceptable. El manual solo especifica la velocidad MÁXIMA de cinta (1,4 m/s, pág 6) y no fija tolerancia de velocidad.' },
      { order: 4, instruction: 'Si difiere: revisar rueda dentada del tacómetro — limpiar con aire comprimido' },
      { order: 5, instruction: 'Revisar el montaje del sensor inductivo frente a la rueda', note: '⚠ SIN FUENTE: el manual lista el sensor (inductivo G485 en el transportador Z y las cintas de aceleración; proximidad M30/G485 en la cinta de clasificación) pero NO especifica distancia de montaje. El "1-3 mm" que figuraba acá no tiene respaldo — pedir la hoja de datos del G485/M30 antes de usar una cifra.' },
      { order: 6, instruction: 'Ajustar parámetro de pulsos/metro si se cambió la rueda dentada', note: 'Anotar valor anterior antes de modificar. Verificar el nombre real del parámetro en el Z2 antes de buscarlo.' },
    ],
    successCriteria: ['La velocidad que muestra el Z2 es consistente con la del VFD (umbral de ±5 % = criterio interno, no del fabricante)', 'Throughput (pz/h) estable entre mediciones'],
    triggers: [
      { condition: 'Throughput (pz/min) fluctúa sin cambio en velocidad real' },
      { condition: 'Piezas con peso OK pero desvío tardío (flipper actúa después de la buchaca)' },
    ],
    source: 'Instructivo "Basculas Grader" pág 2 (desglose de menú) + manual Marelec MS4/12 pág 6 (velocidad máx.) y págs 49-54 (sensores). Umbrales de ±5 % y de distancia sensor-rueda: criterio interno SIN respaldo documental.',
  },

  'redistribuir-gates': {
    id: 'redistribuir-gates',
    title: 'Redistribución de gates por calibre',
    summary: 'Reasignar rangos de peso a gates para equilibrar carga entre buchacas durante el turno',
    category: 'calibracion',
    z2Path: ['MENU', 'Servicio', 'Cambiar parámetros', '8620'],
    serviceKey: '8620',
    steps: [
      { order: 1, instruction: 'Revisar en pantalla principal el % de desvío por gate' },
      { order: 2, instruction: 'Identificar gates sobrecargados (> 30 % de la producción) y gates vacíos' },
      { order: 3, instruction: 'Ir a MENU → Servicio → Cambiar parámetros → clave [8620]', note: '⚠ "Cambiar Parametros" cuelga de Servicio (opción 4.3.10 del desglose de menú), NO directamente de MENU. Ninguna de las 30 opciones documentadas se llama "Gate assignment": verificar en el Z2 cómo se llama realmente la opción de asignación de calibre por compuerta antes de buscarla por ese nombre.' },
      { order: 4, instruction: 'Ajustar el límite superior del calibre de gate sobrecargado para ceder rango al gate vacío' },
      { order: 5, instruction: 'Guardar y esperar 2 minutos para observar distribución actualizada' },
      { order: 6, instruction: 'Notificar al supervisor de planta el cambio de asignación (afecta conteo por buchaca)' },
    ],
    successCriteria: ['Ningún gate supera el 30 % de producción total (excepto calibre dominante)', 'Buchacas no se desbordan'],
    triggers: [
      { condition: 'Buchacas desbordándose mientras otras están vacías' },
      { condition: 'Solicitud de supervisor por cambio de talla objetivo' },
    ],
    source: 'Instructivo "Basculas Grader" pág 2 (desglose de opciones de menú) y pág 6 (ruta MENU → Servicio → Cambiar parámetros → [8620]). El nombre exacto de la opción de asignación por compuerta NO está documentado: verificar en el Z2.',
  },

  'cambio-sm221': {
    id: 'cambio-sm221',
    title: 'Reemplazo de tarjeta SM221',
    summary: 'Procedimiento de cambio de tarjeta de entradas/salidas SM221 del Z2',
    category: 'mantencion',
    imageRef: '/docs/grader/troubleshooting/cambio-sm221.jpg',
    steps: [
      { order: 1, instruction: 'APAGAR el grader completamente desde el disyuntor principal' },
      { order: 2, instruction: 'Esperar 2 minutos para descarga de condensadores' },
      { order: 3, instruction: 'Abrir tablero eléctrico y localizar la tarjeta SM221 (PCB verde, slot lateral del Z2)', imageRef: '/docs/grader/troubleshooting/cambio-sm221.jpg' },
      { order: 4, instruction: 'Desconectar todos los cables del conector de la SM221 — fotografiar antes' },
      { order: 5, instruction: 'Retirar los 4 tornillos de fijación y extraer la tarjeta' },
      { order: 6, instruction: 'Insertar la tarjeta nueva, fijar tornillos y reconectar cables según foto' },
      { order: 7, instruction: 'Encender el grader y verificar que Z2 inicializa sin alarmas' },
      { order: 8, instruction: 'Probar todas las salidas (flippers) desde MENU → Servicio → Probar salidas' },
    ],
    successCriteria: ['Z2 inicializa sin alarmas de I/O', 'Todos los flippers responden en MENU → Probar salidas'],
    triggers: [{ condition: 'Alarma Z2 "SM221 fault" o flippers no responden al 100 %' }],
    source: 'PASOS Para cambio tarjeta sm221 grader.jpg (OneDrive GRADER)',
  },

  'motor-tambor': {
    id: 'motor-tambor',
    title: 'Revisión de motor tambor cinta de aceleración',
    summary: 'Inspeccionar el motor del tambor de la 2ª cinta ante parada o ruido anormal',
    category: 'mantencion',
    imageRef: '/docs/grader/troubleshooting/moto-tambor.jpg',
    steps: [
      { order: 1, instruction: 'Detener producción y bloquear la cinta de aceleración con calza de seguridad' },
      { order: 2, instruction: 'Medir la temperatura del motor CON TERMÓMETRO LÁSER, no con la mano', note: '⚠ Antes decía "verificar táctilmente, no debe superar 60 °C": ese umbral no tiene fuente en el manual y comprobarlo al tacto es peligroso — a 60 °C el contacto sostenido con metal quema. El manual solo pide, para el cambio de aceite, dejar enfriar el motor "a una temperatura aceptable y manejable" (§7.5.2).', requiresTool: ['Termómetro láser'] },
      { order: 3, instruction: 'Escuchar ruido de rodamientos: golpeteo rítmico indica rodamiento desgastado' },
      { order: 4, instruction: 'Revisar tensión de la cinta — si muy tensa, es causa de sobrecalentamiento del motor' },
      { order: 5, instruction: 'Verificar que el eje del tambor gira libremente a mano (sin traba)', imageRef: '/docs/grader/troubleshooting/moto-tambor.jpg' },
      { order: 6, instruction: 'Verificar la posición de montaje: la flecha del eje (lado opuesto a la caja de cables) debe apuntar hacia ARRIBA, para que las partes rotativas queden bien sumergidas en aceite. Se admite una desviación de hasta ~40°; si supera 45°, reposicionar los ejes de fijación', note: 'Manual MS4/12 §7.5.1, pág 38-39' },
      { order: 7, instruction: 'Si motor bloqueado o recalentado: reemplazar y notificar a mantenimiento. Para el cambio de aceite, usar solo aceites aptos para alimentos (Castrol Optileb GT 150, Klüber UH-1-68 o Petro Canada Purity FG EP 100) y dejar enfriar el motor antes de abrirlo', note: 'Manual MS4/12 §7.5.2' },
    ],
    successCriteria: ['Cinta gira sin ruido anormal', 'Sin vibración excesiva', 'Posición de montaje dentro de los 40° admitidos'],
    triggers: [
      { condition: 'Cinta de aceleración parada o con velocidad reducida' },
      { condition: 'Ruido anormal en zona de la 2ª cinta' },
    ],
    source: 'Moto tambor cinta aceleración 2 grader.jpg (OneDrive GRADER) + manual Marelec MS4/12 §7.5, págs 38-40. El manual NO fija ningún límite de temperatura para el drum motor.',
  },

  'ajuste-eye-sync': {
    id: 'ajuste-eye-sync',
    title: 'Ajuste de Eye Sync (sincronía sensor óptico)',
    summary: 'Calibrar el parámetro Eye Sync del Z2 para evitar lecturas duplicadas o perdidas',
    category: 'calibracion',
    z2Path: ['MENU', 'Servicio', 'Cambiar parámetros', '8620', 'Eye sync'],
    serviceKey: '8620',
    steps: [
      { order: 1, instruction: 'Verificar P0 "No leído por fotocélula" > 1 % — indica problemas de sincronía' },
      { order: 2, instruction: 'Antes de tocar nada: revisar en MENU → Servicio → Show EyeSync Differences (opción 4.3.4), que es la pantalla de CONSULTA documentada', note: '⚠ RUNBOOK NO VERIFICADO CONTRA FUENTE. Ningún documento revisado nombra un parámetro editable "Eye sync" bajo Cambiar parámetros, ni le asigna unidad ni rango. El árbol completo de Cambiar parámetros vive en "parametros grader.pdf", que es escaneado. Confirmar en el Z2 el nombre, la unidad y el rango real antes de modificar.' },
      { order: 3, instruction: 'Si existe el parámetro, ANOTAR el valor actual antes de tocarlo', note: 'El "50-150 ms típico" que figuraba acá no tiene fuente y se retiró: el valor de referencia es el que tenga esta máquina, no un rango publicado.' },
      { order: 4, instruction: 'Corregir de a un paso chico si hay lecturas duplicadas (mismo pez contado 2 veces), volviendo al valor anotado si empeora' },
      { order: 5, instruction: 'Corregir en el sentido opuesto si hay lecturas perdidas (peces no detectados)' },
      { order: 6, instruction: 'Probar pasando 20 piezas manualmente y contar: deben ser exactamente 20 en pantalla' },
      { order: 7, instruction: 'Iterar hasta que conteo sea 100 % preciso en 20 piezas consecutivas' },
    ],
    successCriteria: ['Conteo de 20 piezas manuales = 20 exactas', 'P0 "No leído" < 0.5 % en producción'],
    triggers: [
      { condition: 'P0 "No leído por fotocélula" > 1 %', metric: 'no_leido_fotocelula_pct', comparator: '>', threshold: 1 },
      { condition: 'Cambio de velocidad de cinta significativo (> 20 %)' },
    ],
    source: '⚠ SIN FUENTE DOCUMENTAL. El manual Marelec MS4/12 describe los detection eyes solo como hardware (chequeo diario pág 22; repuestos G387/G388 y G1233/G1234) y no define ningún parámetro de sincronía. Lo único documentado es la consulta "Show EyeSync Differences" (Basculas Grader pág 2, opción 4.3.4).',
  },

  'reset-boton-azul': {
    id: 'reset-boton-azul',
    title: 'Reset con botón azul (sin apagar equipo)',
    summary: 'Reiniciar la clasificación del Z2 sin detener el equipo cuando hay alarma menor',
    category: 'troubleshooting',
    imageRef: '/docs/grader/troubleshooting/boton-azul.jpg',
    steps: [
      { order: 1, instruction: 'Verificar que la alarma en Z2 es de tipo "clasificación" (no hardware)', imageRef: '/docs/grader/troubleshooting/boton-azul.jpg' },
      { order: 2, instruction: 'Detener el avance de producto (parar cinta de alimentación)' },
      { order: 3, instruction: 'Vaciar la cinta de aceleración (esperar 30 s)' },
      { order: 4, instruction: 'Presionar el botón azul en el panel lateral del Z2 por 2 segundos' },
      { order: 5, instruction: 'Verificar que la pantalla vuelve al modo de producción sin alarmas' },
      { order: 6, instruction: 'Reanudar producción y monitorear P0 durante 5 minutos' },
    ],
    successCriteria: ['Z2 vuelve a modo producción sin alarmas', 'P0 se estabiliza en valor previo a la alarma'],
    triggers: [
      { condition: 'P0 causa "otro" > 1 % (sin causa identificada)', metric: 'otro_pct', comparator: '>' as const, threshold: 1 },
      { condition: 'Alarma de clasificación en pantalla Z2' },
      { condition: 'P0 súbito al 100 % sin causa física aparente' },
    ],
    source: 'Boton azul grader.jpg (OneDrive GRADER)',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

export function findTriggeredRunbooks(dominantMatrixCause: string | null, p0Pct: number): Runbook[] {
  const causeMetricMap: Record<string, string> = {
    fuera_de_limites:     'fuera_de_limites_pct',
    no_leido_fotocelula:  'no_leido_fotocelula_pct',
    puerta_no_preparada:  'puerta_no_preparada_pct',
    otro:                 'otro_pct',
  }
  const expectedMetric = dominantMatrixCause ? causeMetricMap[dominantMatrixCause] : null

  return Object.values(RUNBOOKS).filter(rb =>
    rb.triggers.some(t => {
      if (!t.metric || !expectedMetric) return false
      if (t.metric !== expectedMetric) return false
      return p0Pct >= (t.threshold ?? 0)
    }),
  ).slice(0, 3)
}
