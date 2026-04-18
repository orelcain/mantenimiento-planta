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
      { order: 2, instruction: 'Limpiar lente del emisor y receptor de fotocélula del elevador con paño seco (sin alcohol)' },
      { order: 3, instruction: 'Limpiar fotocélula de la 2ª cinta de aceleración' },
      { order: 4, instruction: 'Entrar a MENU → Servicio → Probar entradas' },
      { order: 5, instruction: 'Pasar una pieza manualmente y verificar que la señal de entrada cambia de estado' },
      { order: 6, instruction: 'Si no dispara: ajustar ángulo del emisor ±5° hasta que detecte consistentemente' },
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
      { order: 4, instruction: 'Si lento (> 150 ms): verificar presión de aire en línea de ese flipper' },
      { order: 5, instruction: 'Revisar solenoide: desconectar y medir resistencia (valor típico 15-30 Ω)' },
      { order: 6, instruction: 'Si solenoide OK pero respuesta lenta: limpiar el cilindro neumático con compresor' },
      { order: 7, instruction: 'Si bloqueado mecánicamente: inspeccionar eje del flipper y lubricar con silicona' },
    ],
    successCriteria: ['Flipper actúa en < 100 ms al comando del Z2', 'Sin piezas desviadas incorrectamente en prueba manual'],
    triggers: [
      { condition: 'P0 "Puerta no preparada" > 1 %', metric: 'puerta_no_preparada_pct', comparator: '>' as const, threshold: 1 },
      { condition: 'Quejas de calibres mezclados en buchacas' },
      { condition: 'P0 elevado sin causa clara de peso (piezas con peso OK pero rechazadas)' },
    ],
    source: 'Manual Marelec MS4/12 - Flippers section',
  },

  'tachometro-cinta': {
    id: 'tachometro-cinta',
    title: 'Verificación y ajuste de tacómetro de cinta',
    summary: 'Verificar que el sensor de velocidad de cinta reporta correctamente para sincronía de pesaje',
    category: 'calibracion',
    z2Path: ['MENU', 'Servicio', 'Cambiar parámetros', '8620', 'Belt speed'],
    serviceKey: '8620',
    steps: [
      { order: 1, instruction: 'Anotar la velocidad de cinta configurada en el VFD (Hz)' },
      { order: 2, instruction: 'Ir a MENU → Servicio → Cambiar parámetros → Belt speed' },
      { order: 3, instruction: 'Verificar que la velocidad mostrada en Z2 coincide con la del VFD (±5 %)' },
      { order: 4, instruction: 'Si difiere: revisar rueda dentada del tacómetro — limpiar con aire comprimido' },
      { order: 5, instruction: 'Verificar distancia sensor-rueda: debe ser 1-3 mm' },
      { order: 6, instruction: 'Ajustar parámetro de pulsos/metro si se cambió la rueda dentada', note: 'Anotar valor anterior antes de modificar' },
    ],
    successCriteria: ['Velocidad Z2 coincide con VFD ± 5 %', 'Throughput (pz/h) estable entre mediciones'],
    triggers: [
      { condition: 'Throughput (pz/min) fluctúa sin cambio en velocidad real' },
      { condition: 'Piezas con peso OK pero desvío tardío (flipper actúa después de la buchaca)' },
    ],
    source: 'Manual Marelec MS4/12 - Belt speed calibration',
  },

  'redistribuir-gates': {
    id: 'redistribuir-gates',
    title: 'Redistribución de gates por calibre',
    summary: 'Reasignar rangos de peso a gates para equilibrar carga entre buchacas durante el turno',
    category: 'calibracion',
    z2Path: ['MENU', 'Cambiar parámetros', 'Gate assignment'],
    steps: [
      { order: 1, instruction: 'Revisar en pantalla principal el % de desvío por gate' },
      { order: 2, instruction: 'Identificar gates sobrecargados (> 30 % de la producción) y gates vacíos' },
      { order: 3, instruction: 'Ir a MENU → Cambiar parámetros → Gate assignment' },
      { order: 4, instruction: 'Ajustar el límite superior del calibre de gate sobrecargado para ceder rango al gate vacío' },
      { order: 5, instruction: 'Guardar y esperar 2 minutos para observar distribución actualizada' },
      { order: 6, instruction: 'Notificar al supervisor de planta el cambio de asignación (afecta conteo por buchaca)' },
    ],
    successCriteria: ['Ningún gate supera el 30 % de producción total (excepto calibre dominante)', 'Buchacas no se desbordan'],
    triggers: [
      { condition: 'Buchacas desbordándose mientras otras están vacías' },
      { condition: 'Solicitud de supervisor por cambio de talla objetivo' },
    ],
    source: 'Manual Marelec MS4/12 - Gate parameters',
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
      { order: 2, instruction: 'Verificar temperatura del motor táctilmente (no debe superar 60 °C al tacto)', requiresTool: ['Termómetro láser (opcional)'] },
      { order: 3, instruction: 'Escuchar ruido de rodamientos: golpeteo rítmico indica rodamiento desgastado' },
      { order: 4, instruction: 'Revisar tensión de la cinta — si muy tensa, es causa de sobrecalentamiento del motor' },
      { order: 5, instruction: 'Verificar que el eje del tambor gira libremente a mano (sin traba)', imageRef: '/docs/grader/troubleshooting/moto-tambor.jpg' },
      { order: 6, instruction: 'Si motor bloqueado o muy caliente: reemplazar y notificar a mantenimiento' },
    ],
    successCriteria: ['Cinta gira sin ruido anormal', 'Temperatura motor < 60 °C', 'Sin vibración excesiva'],
    triggers: [
      { condition: 'Cinta de aceleración parada o con velocidad reducida' },
      { condition: 'Ruido anormal en zona de la 2ª cinta' },
    ],
    source: 'Moto tambor cinta aceleración 2 grader.jpg (OneDrive GRADER)',
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
      { order: 2, instruction: 'Ir a MENU → Servicio → Cambiar parámetros → Eye sync', note: 'Clave 8620' },
      { order: 3, instruction: 'Anotar valor actual de Eye sync (típicamente 50-150 ms)' },
      { order: 4, instruction: 'Reducir el valor en 10 ms si hay lecturas duplicadas (mismo pez contado 2 veces)' },
      { order: 5, instruction: 'Aumentar el valor en 10 ms si hay lecturas perdidas (peces no detectados)' },
      { order: 6, instruction: 'Probar pasando 20 piezas manualmente y contar: deben ser exactamente 20 en pantalla' },
      { order: 7, instruction: 'Iterar hasta que conteo sea 100 % preciso en 20 piezas consecutivas' },
    ],
    successCriteria: ['Conteo de 20 piezas manuales = 20 exactas', 'P0 "No leído" < 0.5 % en producción'],
    triggers: [
      { condition: 'P0 "No leído por fotocélula" > 1 %', metric: 'no_leido_fotocelula_pct', comparator: '>', threshold: 1 },
      { condition: 'Cambio de velocidad de cinta significativo (> 20 %)' },
    ],
    source: 'Manual Marelec MS4/12 - Eye sync section',
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

export function filterRunbooks(
  runbooks: Record<string, Runbook>,
  query: string,
  category: RunbookCategory | 'all',
): Runbook[] {
  const q = query.toLowerCase().trim()
  return Object.values(runbooks).filter(rb => {
    if (category !== 'all' && rb.category !== category) return false
    if (!q) return true
    return (
      rb.title.toLowerCase().includes(q) ||
      rb.summary.toLowerCase().includes(q) ||
      rb.steps.some(s => s.instruction.toLowerCase().includes(q))
    )
  })
}

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
