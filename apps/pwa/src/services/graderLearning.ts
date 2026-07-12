/**
 * graderLearning — Adaptador del catalogo de runbooks Z2 al formato del
 * Centro de Aprendizaje, para que el Grader use el mismo expediente que el
 * resto de las maquinas (mismo patron que baader200Learning).
 *
 * La fuente de verdad sigue siendo `services/grader/graderRunbooks.ts`, porque
 * sus `triggers` alimentan el plan de accion del Analisis de Turno
 * (`findTriggeredRunbooks`). Aqui solo se TRADUCE, nunca se copia ni se mueve.
 *
 * Reparto:
 *   Manual        → documentos oficiales, glosario Z2 y parametros del controlador
 *   Procedimientos → runbooks de contrastacion, calibracion, mantencion y limpieza
 *   Flujos        → runbooks que la app dispara sola (triggers con `metric`)
 *   Diagnostico   → runbooks de troubleshooting
 */
import { RUNBOOKS, type Runbook } from './grader/graderRunbooks'
import { GRADER_GLOSSARY } from './grader/graderGlossary'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const GRADER_LEARNING_SLUG = 'grader'
export const GRADER_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

/** Runbooks que son procedimiento programado; el resto es diagnostico reactivo. */
const PROCEDURE_CATEGORIES = new Set(['contrastacion', 'calibracion', 'mantencion', 'limpieza'])

const OFFICIAL_DOCS = [
  { label: 'Manual Marelec MS4/12', url: '/docs/grader/manual-marelec-ms4-12.pdf' },
  { label: 'SOP Contrastación — CH-MT-ME-0002', url: '/docs/grader/sop-contrastacion.pdf' },
  { label: 'SOP Balanzas y tara', url: '/docs/grader/sop-balanzas.pdf' },
]

const REFERENCE_IMAGES = [
  { label: 'Cambio de tarjeta SM221', url: '/docs/grader/troubleshooting/cambio-sm221.jpg' },
  { label: 'Motor tambor de la cinta de aceleración', url: '/docs/grader/troubleshooting/moto-tambor.jpg' },
  { label: 'Botón azul de reset en el panel Z2', url: '/docs/grader/troubleshooting/boton-azul.jpg' },
]

const allRunbooks = (): Runbook[] => Object.values(RUNBOOKS)

/** Runbooks que la app dispara sola: tienen al menos un trigger ligado a una metrica. */
function isAutoTriggered(rb: Runbook): boolean {
  return rb.triggers.some(t => !!t.metric)
}

function stepDescription(step: Runbook['steps'][number]): string {
  const extra: string[] = []
  if (step.note) extra.push(`Nota: ${step.note}`)
  if (step.requiresTool?.length) extra.push(`Requiere: ${step.requiresTool.join(', ')}`)
  if (step.durationMin) extra.push(`Duración estimada: ${step.durationMin} min`)
  return [step.instruction, ...extra].join('\n')
}

// ─────────────────────────────────────────────────────────────
// MANUAL
// Secciones didácticas curadas del manual Marelec MS4/12, del instructivo de
// básculas (menú, probar salidas, calibración fsWc) y del SOP CH-MT-ME-0002,
// más las 3 secciones de referencia (parámetros, glosario, documentos).
// Cada sección instructiva trae objetivo de aprendizaje, "el porqué" y una
// autoevaluación corta. Fuente: PDFs en OneDrive\⚙️ EQUIPOS PLANTA\⚙️ GRADER.
// ─────────────────────────────────────────────────────────────

type ManualFields = { objetivo?: string; porque?: string; content: string; quiz?: ManualSection['quiz'] }

function mk(id: string, order: number, title: string, f: ManualFields): ManualSection {
  return {
    id,
    order,
    title,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    content: f.content,
    objetivo: f.objetivo,
    porque: f.porque,
    quiz: f.quiz,
  }
}

/** 1 · Qué es el Grader y cómo clasifica (Manual MS4/12, cap. 2). */
function queEsSection(): ManualSection {
  return mk('grader-manual-que-es', 1, 'El clasificador MS4/12: qué hace y cómo clasifica', {
    objetivo:
      'Al terminar vas a poder explicar el recorrido de un pescado por el Grader —se pesa, el Z2 elige una compuerta según peso, calibre y calidad, y lo desvía al bandejón— y qué significa que un pescado termine en el punto cero (P0).',
    porque:
      'el punto cero es trabajo manual y es el KPI de rechazo que mira Mantención. Entender que P0 = "no había compuerta para ese peso/calidad" separa un problema de configuración de uno mecánico y evita calibrar cuando el problema era otro.',
    content: [
      'El Grader es un clasificador Marelec MS4/12: pesa cada pescado y lo separa por peso en hasta 12 clases. Está formado por una báscula estática (los pockets), un transportador en Z, dos cintas de aceleración y la cinta de clasificación, todo gobernado por el computador Marelec Z2.',
      'El flujo es siempre el mismo: el pocket pesa el pescado, el Z2 decide a qué compuerta (flipper) corresponde según su peso, el calibre y la calidad configurada, y esa compuerta se abre para desviarlo al bandejón. Si un pescado no tiene ninguna compuerta asignada para su peso/calidad, sigue de largo hasta el final de la cinta —el punto cero (P0)— donde hay que clasificarlo a mano.',
      'Medidas / tolerancias:',
      '- Clases de salida: hasta 12 (todas al lado derecho, sin batching)',
      '- Rango de pesaje: 0 – 15 kg',
      '- Precisión: ±20 g entre 0–5 kg · ±50 g entre 5–15 kg',
      '- Velocidad de cinta: hasta 1,4 m/s',
      '- Producto máximo: 1100 mm de largo × 290 mm de ancho',
      '- Material: acero inox AISI 304 + plásticos aptos para alimentos',
      'Notas operativas:',
      '- No pasar producto fuera del rango de pesaje ni más grande que la medida máxima: la lectura se degrada y sube el rechazo a P0.',
      '- Modelo en planta: MS4/12, Nº de serie 3943 (fabr. 2012), distribuido por Marelec Chile (Puerto Montt).',
    ].join('\n\n'),
    quiz: [
      {
        question: '¿Qué le pasa a un pescado cuyo peso/calidad no tiene ninguna compuerta asignada?',
        options: ['Se detiene la cinta', 'Sigue hasta el punto cero (P0) y se clasifica a mano', 'Se vuelve a pesar automáticamente', 'Cae al primer flipper libre'],
        correctIndex: 1,
        explanation: 'Sin compuerta asignada, el pescado llega al final de la cinta (punto cero) y el operador lo clasifica manualmente en carros.',
      },
      {
        question: '¿Cuál es el rango de pesaje del MS4/12?',
        options: ['0 – 5 kg', '0 – 15 kg', '0 – 30 kg', 'Sin límite'],
        correctIndex: 1,
        explanation: 'El rango es 0–15 kg, con precisión de ±20 g bajo 5 kg y ±50 g entre 5 y 15 kg.',
      },
    ],
  })
}

/** 2 · Arranque, controles y chequeo diario (Manual MS4/12, cap. 4). */
function arranqueSection(): ManualSection {
  return mk('grader-manual-arranque', 2, 'Arranque, controles y chequeo diario', {
    objetivo:
      'Poner en marcha el Grader de forma segura y correr el chequeo diario de 3 puntos que garantiza que la clasificación va a pesar y desviar bien desde el primer pescado.',
    porque:
      'un pocket vacío que no marca ~0 g o un ojo de detección sucio arruinan la clasificación de todo el turno y disparan el rechazo. El chequeo de 30 segundos evita horas de producto mal clasificado.',
    content: [
      'El tablero eléctrico tiene 5 controles: interruptor general (power), botón de partida, botón de parada, parada de emergencia y el computador Marelec Z2. Peligro: con el equipo apagado varios componentes del tablero siguen con tensión — riesgo de electrocución.',
      'Al energizar, el Z2 tarda unos 30 segundos en arrancar y, al terminar, chequea todas las salidas: por eso TODOS los flippers abren y cierran varias veces solos. Es normal, pero es peligroso si hay un flipper bloqueado o alguien con la mano cerca.',
      'Puntos clave:',
      '- Antes de cada uso, verificar los dos ojos de detección del elevador (detectan la paleta al pasar).',
      '- Verificar los ojos de la segunda cinta de aceleración (detectan el producto al pasar).',
      '- Verificar en el Z2 que los pockets vacíos marquen entre −5 g y +5 g.',
      '- Después de cada uso: limpiar la cinta, limpiar los ojos de detección (baja presión) y limpiar toda la máquina.',
      'Notas operativas:',
      '- Los ojos de detección son estancos pero NO resisten un chorro fuerte: limpiarlos con baja presión.',
    ].join('\n\n'),
    quiz: [
      {
        question: 'Con los pockets vacíos, ¿qué debe marcar el Z2 para dar por bueno el chequeo diario?',
        options: ['Exactamente 0 g', 'Entre −5 g y +5 g', 'Menos de 50 g', 'No importa, se calibra en marcha'],
        correctIndex: 1,
        explanation: 'El indicador de peso con pockets vacíos debe estar entre −5 g y +5 g. Fuera de ese rango hay que tarar o calibrar antes de producir.',
      },
      {
        question: 'Al energizar, todos los flippers abren y cierran solos. ¿Por qué?',
        options: ['Está fallado', 'El Z2 chequea todas las salidas al terminar de arrancar (~30 s)', 'Hay que resetear', 'Es una alarma de seguridad'],
        correctIndex: 1,
        explanation: 'Es parte del arranque: tras ~30 s el Z2 verifica todas las salidas moviendo cada flipper. Es normal, pero peligroso si hay alguien cerca o un flipper trabado.',
      },
    ],
  })
}

/** 3 · Mapa del menú del Z2 (instructivo de básculas, pág. 2). */
function menuSection(): ManualSection {
  return mk('grader-manual-menu-z2', 3, 'Mapa del menú del Z2', {
    objetivo:
      'Ubicar en el menú del Z2 las opciones que usa Mantención sin ir tanteando, sabiendo que casi todo cuelga de Menú → Servicio.',
    porque:
      'perder tiempo buscando la ruta en el Z2 alarga cada intervención; tener el mapa mental del menú hace que probar una salida o cambiar un parámetro sea cuestión de segundos.',
    content: [
      'Estructura de navegación del Z2 (tecla E = entrar/aceptar; "Salir" = volver). Desde la pantalla principal:',
      'Puntos clave:',
      '- 1 · Cambiar programa',
      '- 2 · Modo presentación (programa / totales)',
      '- 3 · ->0<- (tara a cero)',
      '- 4 · Menú → Printers · Mostrar gráfico pesaje · Servicio · Cambiar Claves · Edit Species · Ajustar datos · Mostrar velocidad cintas · Enable/Disable Stations · Maintenance counters · Mostrar resultados clasificación · Idioma · Ajuste Red · Mostrar eventos de Sistema · Ajustar Fecha y hora · Estado',
      '- 4.3 Servicio → Optimizar filtro · Ajustar unidad de peso · Traceability Settings · Show EyeSync Differences · Show Statistics · Autochange BLDC · Status memory · Probar Entradas · Probar Salidas · Cambiar Parámetros · Monitor CPU · Versión Software · Explorar CAN bus · Activar Software · Estado Certificación',
      'Notas operativas:',
      '- Casi todo lo de Mantención (probar salidas, cambiar parámetros, contadores de mantención) cuelga de 4.3 Servicio.',
    ].join('\n\n'),
  })
}

/** 4 · Parámetros y rutas del Z2 (derivado de los runbooks). */
function parametersSection(): ManualSection {
  const routes = allRunbooks()
    .filter(rb => rb.z2Path?.length)
    .map(rb => `- ${rb.title}: ${rb.z2Path!.join(' → ')}`)
  const serviceKeys = [...new Set(allRunbooks().map(rb => rb.serviceKey).filter(Boolean))]

  return {
    id: 'grader-manual-parametros-z2',
    title: 'Parámetros y rutas del controlador Z2',
    order: 4,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    objetivo:
      'Tener a mano las rutas de menú del Z2 y las tolerancias de referencia que usan los procedimientos de contrastación, calibración y mantención de este expediente.',
    porque:
      'estas rutas y tolerancias son las que aparecen en cada runbook; conocerlas evita el error más caro del turno: modificar un parámetro sin anotar el valor anterior.',
    content: [
      'Rutas de menú y claves de servicio del Z2 que usan los procedimientos de este expediente.',
      'Medidas / tolerancias:',
      `- Clave de servicio: ${serviceKeys.join(', ') || 'no aplica'}`,
      '- Pocket vacío: −5 a +5 g',
      '- Peso patrón de contrastación: 5 000 g ± 20 g',
      '- Presión de aire: ≥ 7 bar (0,70 MPa), aire seco',
      '- Objetivo P0 (rechazo): < 2 %',
      'Puntos clave:',
      ...routes,
      'Notas operativas:',
      '- Anotar siempre el valor anterior antes de modificar un parámetro del Z2.',
      'Referencias visuales:',
      ...REFERENCE_IMAGES.map(img => `- ${img.label}: ${img.url}`),
    ].join('\n\n'),
  }
}

/** 5 · Probar salidas: pockets, flippers y capachos (instructivo de básculas, pág. 3-5). */
function probarSalidasSection(): ManualSection {
  return mk('grader-manual-probar-salidas', 5, 'Probar salidas: pockets, flippers y capachos', {
    objetivo:
      'Aislar una falla probando manualmente si un pocket, flipper o capacho responde a la orden neumática, sin depender de que pase producto.',
    porque:
      'cuando sube el P0 o un calibre no sale, probar la salida dice en 10 segundos si el problema es neumático/mecánico (no responde) o de configuración (responde pero no estaba asignado).',
    content: [
      'Prueba neumática manual de salidas, útil para confirmar si un pocket, flipper o capacho responde. Ruta: MENU → Servicio → Probar salidas → ingresar número. La tecla E activa la salida; "Salir" la detiene.',
      'Puntos clave:',
      '- Pockets / básculas: comandos 1, 2, 3, 4 (uno por pocket).',
      '- Flippers de la cinta larga (1 a 12): comandos 133 a 144.',
      '- Capachos de la cinta larga (1 a 12): comandos 137 a 156 (se cierran cuando el bandejón está lleno, para dar tiempo al operador a llenar los carros).',
      'Notas operativas:',
      '- Presionar E para activar y "Salir" para detener: nunca dejar una salida activada.',
      '- Si un pescado no tiene compuerta se va a punto cero (final de la cinta) y se clasifica a mano.',
    ].join('\n\n'),
    quiz: [
      {
        question: 'Para probar manualmente la báscula/pocket Nº 3, ¿qué comando se ingresa en Probar salidas?',
        options: ['135', '3', '143', '8620'],
        correctIndex: 1,
        explanation: 'Los pockets usan los comandos 1–4; el 3 prueba el pocket 3. Los 133–144 son los flippers de la cinta larga.',
      },
      {
        question: 'Después de activar una salida con la tecla E, ¿cómo se detiene?',
        options: ['Se apaga sola', 'Con "Salir"', 'Cortando el aire', 'Reiniciando el Z2'],
        correctIndex: 1,
        explanation: 'La salida queda activada hasta que se presiona "Salir". Nunca hay que dejar una salida activada.',
      },
    ],
  })
}

/** 6 · Calibración de básculas / parámetro fsWc (instructivo de básculas, pág. 6-10 + SOP CH-MT-ME-0002). */
function calibracionSection(): ManualSection {
  return mk('grader-manual-calibracion', 6, 'Calibración de básculas (parámetro fsWc)', {
    objetivo:
      'Calibrar el peso de un pocket que se descalibró aplicando la fórmula fsWc nuevo = (fsWc actual × 5000) ÷ Vb, y saber decidir cuándo hay que calibrar y cuándo el problema es mecánico.',
    porque:
      'un pocket descalibrado manda pescado al calibre equivocado durante todo el turno y arruina la contrastación. Saber la fórmula y el gatillo de ±20 g convierte una parada larga en un ajuste de minutos.',
    content: [
      'Calibración del peso de cada pocket ajustando el parámetro fsWc. Ruta: MENU → Servicio → Cambiar parámetros → clave [8620] → Static Grader → ZBelt → Pocket [1–4] → fsWc.',
      'Antes de tocar nada, tarar: presionar >0< con el pocket vacío para llevar la báscula a 0. Luego poner el peso patrón de 5000 g en el pocket y leer lo que marca la pantalla (ese valor es Vb).',
      'Se ajusta con la fórmula: fsWc nuevo = (fsWc actual × 5000) ÷ Vb. Ejemplos con fsWc actual 283911 — si la pantalla marca 5020 g → 283911 × 5000 ÷ 5020 = 282779 (el fsWc BAJA); si marca 4980 g → 283911 × 5000 ÷ 4980 = 285051 (el fsWc SUBE). Con la tecla C se borra el valor, se escribe el nuevo, luego E, OK y Salir; después se verifica que el pocket marque 5000 g. Se repite igual en los 4 pockets.',
      'Medidas / tolerancias:',
      '- Clave de servicio (parámetros): 8620',
      '- Peso patrón: 5000 g',
      '- Diferencia que obliga a recalibrar: mayor a ±20 g respecto de 5000 g',
      '- Pocket vacío tras calibrar: −5 a +5 g',
      'Notas operativas:',
      '- Recalibrar cuando: el peso se acumula gramo a gramo al abrir/cerrar la buchaca (horquilla topando la rueda azul, juego en los cilindros, fugas en tubings, roce mecánico, celda con microcortes, o-ring de vástago gastado), hay más de ±20 g de diferencia, o antes de una contrastación.',
      '- Anotar el valor fsWc anterior antes de cambiarlo.',
      'Documentos:',
      '- SOP Contrastación — CH-MT-ME-0002: /docs/grader/sop-contrastacion.pdf',
    ].join('\n\n'),
    quiz: [
      {
        question: 'El peso patrón es 5000 g y la pantalla marca 5020 g. ¿Qué hace la fórmula con el valor fsWc?',
        options: ['Lo sube', 'Lo baja', 'Lo deja igual', 'Hay que cambiar el patrón'],
        correctIndex: 1,
        explanation: '(fsWc × 5000) ÷ 5020 da un número menor: el fsWc BAJA. Si marcara 4980 (menos que 5000), el fsWc subiría.',
      },
      {
        question: '¿A partir de qué diferencia con los 5000 g conviene recalibrar el pocket?',
        options: ['±2 g', '±20 g', '±200 g', 'Solo si marca 0'],
        correctIndex: 1,
        explanation: 'Se recalibra cuando hay más de ±20 g de diferencia respecto del patrón de 5000 g, o antes de una contrastación.',
      },
      {
        question: '¿Qué se hace ANTES de poner el peso patrón en el pocket?',
        options: ['Nada, se pone directo', 'Tarar a 0 con la tecla >0<', 'Cambiar la clave', 'Bajar la velocidad de cinta'],
        correctIndex: 1,
        explanation: 'Con el pocket vacío se presiona >0< para tarar la báscula a 0; recién ahí se pone el patrón y se lee Vb.',
      },
    ],
  })
}

/** 7 · Limpieza y plan de mantención (Manual MS4/12, cap. 5-6). */
function limpiezaSection(): ManualSection {
  return mk('grader-manual-limpieza-mantencion', 7, 'Limpieza y plan de mantención (día / mes / semestre)', {
    objetivo:
      'Ejecutar la limpieza sin dañar sensores ni electrónica, y saber qué revisar cada día, cada mes y cada semestre para que el Grader no falle en plena temporada.',
    porque:
      'la mayoría de las fallas de clasificación (lecturas inestables, flippers con juego, cinta rígida) nacen de limpieza mal hecha o mantención saltada. El plan día/mes/semestre es mantención preventiva demostrable.',
    content: [
      'La limpieza es parte de la calidad del producto, no un extra. Limpiar toda la máquina después de cada uso y enjuagar con agua dulce para que el producto de limpieza no dañe los materiales.',
      'Puntos clave:',
      '- Grado mínimo IP65: alta presión permitida en las cintas, pero sensores, botones y motores solo a baja presión (< 3 bar).',
      '- Producto de limpieza a máx. 80 °C; enjuague suficiente (la sobreconcentración por mal enjuague mancha el inox).',
      '- Cuidado con el chorro cerca del tablero eléctrico, el computador y el gabinete neumático.',
      'Medidas / tolerancias:',
      '- Aire comprimido de los pockets: seco (instalar secador para que no entre agua a los cilindros)',
      '- Presión de aire: ≥ 7 bar (0,70 MPa)',
      'Notas operativas:',
      '- Cada mes: revisar juego en los flippers (juego vertical → cambiar bujes; horizontal → cambiar rodamientos del vástago del cilindro), igualar la velocidad de los cilindros y probar botones, lámparas, interruptor y parada de emergencia.',
      '- Cada semestre: revisar la cinta modular (cambiar si se estiró, si la superficie está gastada o si quedó rígida tras la limpieza), el lazo de la cinta (paso suave, sin vibración ni ruido) y el desgaste de los wearstrips.',
      '- Al reapretar uniones perno-tuerca usar sellador de rosca (ej. Loctite 243): la vibración las suelta.',
      '- Los cilindros vienen lubricados de por vida; no lubricar salvo que ya estén lubricados por fuera.',
    ].join('\n\n'),
    quiz: [
      {
        question: '¿A qué presión se limpian los sensores, botones y motores?',
        options: ['Alta presión, como las cintas', 'Baja presión (< 3 bar)', 'No se limpian', 'Con vapor a 100 °C'],
        correctIndex: 1,
        explanation: 'Las cintas aguantan alta presión, pero los componentes frágiles (sensores, botones, motores) solo a baja presión, menos de 3 bar.',
      },
      {
        question: 'Un flipper con juego vertical (el producto tiende a pasar por debajo). ¿Qué se cambia?',
        options: ['Los rodamientos del vástago', 'Los bujes', 'La celda de carga', 'La cinta'],
        correctIndex: 1,
        explanation: 'Juego vertical → cambiar los bujes. El juego horizontal es el que se corrige cambiando los rodamientos del vástago del cilindro neumático.',
      },
    ],
  })
}

function glossarySection(): ManualSection {
  const terms = Object.values(GRADER_GLOSSARY).map(entry => {
    const alts = entry.alts?.length ? ` (también: ${entry.alts.join(', ')})` : ''
    return `- ${entry.label}${alts}: ${entry.description}`
  })
  return {
    id: 'grader-manual-glosario',
    title: 'Glosario Marelec Z2',
    order: 8,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    objetivo:
      'Reconocer las siglas y términos del clasificador (fsWc, P0, ZBelt, pocket, flipper, capacho…) que aparecen en el Z2, en los runbooks y en los reportes de turno.',
    content: [
      `Vocabulario del clasificador y de la planta: ${terms.length} términos usados en los runbooks, en el Z2 y en los reportes de turno.`,
      'Puntos clave:',
      ...terms,
    ].join('\n\n'),
  }
}

function docsSection(): ManualSection {
  return {
    id: 'grader-manual-documentos',
    title: 'Documentos oficiales',
    order: 9,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    objetivo:
      'Saber a qué documento oficial recurrir para cada tarea y qué hacer cuando un runbook y el manual no coinciden.',
    content: [
      'Fuentes oficiales del clasificador Marelec. Todo runbook de este expediente se apoya en alguno de estos documentos.',
      'Documentos:',
      ...OFFICIAL_DOCS.map(doc => `- ${doc.label}: ${doc.url}`),
      'Notas operativas:',
      '- Ante discrepancia entre un runbook y el manual oficial, manda el manual: reportar la diferencia a Mantención.',
    ].join('\n\n'),
  }
}

export function listGraderManualSections(): ManualSection[] {
  return [
    queEsSection(),
    arranqueSection(),
    menuSection(),
    parametersSection(),
    probarSalidasSection(),
    calibracionSection(),
    limpiezaSection(),
    glossarySection(),
    docsSection(),
  ]
}

// ─────────────────────────────────────────────────────────────
// PROCEDIMIENTOS
// ─────────────────────────────────────────────────────────────

export function listGraderProcedures(): Procedure[] {
  return allRunbooks()
    .filter(rb => PROCEDURE_CATEGORIES.has(rb.category))
    .map(rb => ({
      id: `grader-procedure-${rb.id}`,
      title: rb.title,
      description: [rb.summary, `Fuente: ${rb.source}`].join('\n\n'),
      menuPath: rb.z2Path,
      formula: rb.formula,
      successCriteria: rb.successCriteria,
      steps: rb.steps.map(step => ({
        order: step.order,
        title: `Paso ${step.order}`,
        description: stepDescription(step),
        imageUrl: step.imageRef ?? null,
      })),
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
      createdBy: 'grader-adapter',
    }))
}

// ─────────────────────────────────────────────────────────────
// FLUJOS — "¿Que hago cuando...?"
// ─────────────────────────────────────────────────────────────

export function listGraderFlows(): Flow[] {
  return allRunbooks()
    .filter(isAutoTriggered)
    .map(rb => ({
      id: `grader-flow-${rb.id}`,
      title: rb.title,
      trigger: rb.triggers.map(t => t.condition).join(' · '),
      actions: [
        ...rb.steps.map(step => step.instruction),
        `Verificar: ${rb.successCriteria.join(' · ')}`,
      ],
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
    }))
}

// ─────────────────────────────────────────────────────────────
// DIAGNOSTICO
// ─────────────────────────────────────────────────────────────

export function listGraderDiagnosis(): DiagnosisEntry[] {
  return allRunbooks()
    .filter(rb => rb.category === 'troubleshooting')
    .map(rb => ({
      id: `grader-diagnosis-${rb.id}`,
      title: rb.title,
      symptom: rb.summary,
      possibleCauses: rb.triggers.map(t => t.condition),
      solution: [
        ...rb.steps.map(step => `${step.order}. ${stepDescription(step)}`),
        '',
        `Criterios de éxito: ${rb.successCriteria.join(' · ')}`,
        `Fuente: ${rb.source}`,
      ].join('\n'),
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
    }))
}
