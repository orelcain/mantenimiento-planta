export const meta = {
  name: 'verificar-contenido-fichas',
  description: 'Verifica el contenido de las fichas del Centro de Aprendizaje contra los manuales fuente y reporta datos que no se pueden respaldar',
  whenToUse: 'Cuando quieras evidencia de que el contenido técnico que ven los técnicos es correcto. Es el "eval" del Centro de Aprendizaje: busca datos inventados, contradicciones con el manual y cifras sin respaldo. Lanzar con: Workflow({ name: "verificar-contenido-fichas" })',
  phases: [
    { title: 'Verificar', detail: 'un agente por máquina: cruza el seed contra su manual fuente' },
    { title: 'Confirmar', detail: 'segunda opinión sobre cada hallazgo grave, para descartar falsos positivos' },
    { title: 'Sintetizar', detail: 'informe único priorizado por riesgo' },
  ],
}

/**
 * POR QUÉ EXISTE
 * El contenido de las 9 fichas se minó de PDFs (parte con Codex) y se revisó POR MUESTREO,
 * nunca de forma sistemática. En una planta, una tolerancia, un código de falla o un valor
 * eléctrico inventado es riesgo real para el técnico que lo lee. Esto lo audita.
 *
 * ALCANCE DE ESTA PASADA: solo el contenido "seed" que vive en el repo. Las secciones que
 * existen SOLO como override en Firestore (p. ej. las minadas para Grader y Marel Filete)
 * quedan fuera y hay que auditarlas en una segunda pasada leyendo Firestore.
 */

const MAQUINAS = [
  {
    slug: 'baader-142',
    seed: 'apps/pwa/src/services/baader142/baader142Content.json',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ BAADER 142',
    nota: 'Manual de instrucciones 2005-12-E (96 págs) + 4 diagramas eléctricos alemanes (Stromlaufplan). Ojo con los códigos A3C E770-E999 y los datos eléctricos 220-480V.',
  },
  {
    slug: 'baader-200',
    seed: 'apps/pwa/src/services/baader200Learning.ts',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ BAADER 200',
    nota: 'Contenido en TS (DEFAULT_B200_SECTIONS + _PART2 + _TROUBLESHOOTING). Verificar sobre todo las ~10 tolerancias de "Ajustes clave" y la regla de roscas con/sin muesca.',
  },
  {
    slug: 'detector-metales',
    seed: 'apps/pwa/src/services/detectorMetales/detectorMetalesContent.json',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ DETECTOR METALES',
    nota: 'Manual Vistus BA_Vistus-es_0_20110413 (223 págs). El diagnóstico salió de las tablas §19.3.1 (E) y §19.3.2 (W) — verificar que cada código W/E citado exista con ese significado.',
  },
  {
    slug: 'fishken',
    seed: 'apps/pwa/src/services/fishken/fishkenContent.json',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ FISHKEN',
    nota: 'Manual E-Pack S28. Envasadora/pesadora de 28 compuertas, celdas de carga, tarjetas relé NUMATO.',
  },
  {
    slug: 'marel-hg',
    seed: 'apps/pwa/src/services/marelHg/marelHgContent.json',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ MAREL EVISCERADO',
    nota: 'A600 User Manual_ES (76 págs). Es el software del clasificador A600, NO una descabezadora mecánica: si el contenido habla de mecánica de descabezado, es un hallazgo.',
  },
  {
    slug: 'marel-filete',
    seed: 'apps/pwa/src/services/marelFilete/marelFileteContent.json',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ MAREL FILETE',
    nota: 'SmartLine User Manual (81 págs ES). Línea de pesaje/clasificación, no fileteadora mecánica.',
  },
  {
    slug: 'grader',
    seed: 'apps/pwa/src/services/graderLearning.ts (traduce apps/pwa/src/services/grader/graderRunbooks.ts)',
    fuente: 'C:/Users/orelc/OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ GRADER',
    nota: 'Marelec MS4/12. Verificar la clave de servicio 8620, la fórmula fsWc y los parámetros del Z2 contra el manual.',
  },
]

const HALLAZGOS = {
  type: 'object',
  required: ['slug', 'revisado', 'hallazgos'],
  properties: {
    slug: { type: 'string' },
    revisado: {
      type: 'object',
      required: ['seccionesLeidas', 'fuentesUsadas'],
      properties: {
        seccionesLeidas: { type: 'number' },
        fuentesUsadas: { type: 'array', items: { type: 'string' } },
        noVerificable: { type: 'string', description: 'qué no se pudo cruzar y por qué (PDF escaneado, sin fuente, etc.)' },
      },
    },
    hallazgos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severidad', 'seccion', 'afirmacion', 'problema'],
        properties: {
          severidad: { type: 'string', enum: ['critico', 'medio', 'menor'] },
          seccion: { type: 'string' },
          afirmacion: { type: 'string', description: 'el texto exacto de la ficha que se cuestiona' },
          problema: { type: 'string', enum: ['contradice-el-manual', 'sin-respaldo', 'cifra-distinta', 'codigo-inexistente', 'ambiguo-o-peligroso'] },
          evidencia: { type: 'string', description: 'qué dice el manual y en qué página' },
          correccion: { type: 'string', description: 'el valor correcto si se pudo determinar' },
        },
      },
    },
  },
}

const VEREDICTO = {
  type: 'object',
  required: ['esReal', 'razon'],
  properties: {
    esReal: { type: 'boolean' },
    razon: { type: 'string' },
  },
}

const INSTRUCCIONES_EXTRACCION = `
Para leer los PDF usá Python con PyMuPDF (fitz), NO pypdf:
  import fitz; doc = fitz.open(ruta); texto = "".join(p.get_text() for p in doc)
Normalizá los PUA de fuentes símbolo: U+F084 (Wingdings3) y U+F0B7 (SymbolMT) -> "•".
Forzá stdout UTF-8 en Windows: io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8').
Si un PDF no devuelve texto es escaneado: NO lo adivines, reportalo en "noVerificable".
`

phase('Verificar')

const porMaquina = await pipeline(
  MAQUINAS,
  m => agent(
    `Auditá el contenido de la ficha de "${m.slug}" del Centro de Aprendizaje contra su manual fuente.

REPO: D:\\a\\APP leventamiento de insidencias en planta
SEED A AUDITAR: ${m.seed}
MANUALES FUENTE: ${m.fuente}
CONTEXTO: ${m.nota}

QUÉ BUSCÁS (en este orden de importancia):
1. CRÍTICO — datos que un técnico podría aplicar y hacer daño o romper la máquina: tolerancias,
   torques, presiones, tensiones, claves de servicio, códigos de falla con significado equivocado.
2. MEDIO — afirmaciones sin respaldo en el manual (no necesariamente falsas, pero inventadas o
   inferidas sin fuente).
3. MENOR — imprecisiones de redacción que podrían confundir.

REGLAS:
- Solo reportá lo que puedas respaldar citando el manual (qué dice y en qué página).
- Si el manual NO cubre un tema, eso es "sin-respaldo", no "contradice-el-manual". No los confundas.
- NO reportes diferencias de estilo, redacción o formato. Solo hechos técnicos.
- Si no encontrás nada, devolvé "hallazgos": [] — un informe vacío honesto vale más que uno inflado.
- Sé explícito en "noVerificable" con lo que no pudiste cruzar. No lo omitas.
${INSTRUCCIONES_EXTRACCION}`,
    { label: `auditar:${m.slug}`, phase: 'Verificar', schema: HALLAZGOS }
  ),
  // Segunda opinión SOLO sobre los críticos: son los que se van a accionar.
  (res, m) => {
    if (!res || !res.hallazgos) return res
    const criticos = res.hallazgos.filter(h => h.severidad === 'critico')
    if (criticos.length === 0) return res
    return parallel(criticos.map(h => () =>
      agent(
        `Intentá REFUTAR este hallazgo de auditoría. Tu trabajo es que no pase un falso positivo.

MÁQUINA: ${m.slug}
MANUAL FUENTE: ${m.fuente}
AFIRMACIÓN DE LA FICHA: "${h.afirmacion}"
PROBLEMA REPORTADO: ${h.problema}
EVIDENCIA QUE DIO EL AUDITOR: ${h.evidencia || '(no dio)'}

Andá al manual y verificá por tu cuenta. Marcá esReal=false si: el auditor leyó mal, el dato SÍ está
respaldado en otra parte del manual, o la contradicción no existe. Ante duda razonable, esReal=false
— preferimos perder un hallazgo dudoso que mandar a corregir algo que estaba bien.
${INSTRUCCIONES_EXTRACCION}`,
        { label: `refutar:${m.slug}`, phase: 'Confirmar', schema: VEREDICTO }
      ).then(v => ({ ...h, confirmado: v?.esReal === true, razonVeredicto: v?.razon }))
    )).then(criticosVerificados => ({
      ...res,
      hallazgos: [
        ...criticosVerificados.filter(Boolean),
        ...res.hallazgos.filter(h => h.severidad !== 'critico'),
      ],
    }))
  }
)

phase('Sintetizar')

const limpio = porMaquina.filter(Boolean)
const total = limpio.reduce((n, r) => n + (r.hallazgos?.length || 0), 0)
log(`${limpio.length}/${MAQUINAS.length} máquinas auditadas · ${total} hallazgos en bruto`)

const informe = await agent(
  `Escribí el informe de auditoría de contenido del Centro de Aprendizaje, en español, para Orel
(jefe de mantención, decide qué corregir primero).

DATOS: ${JSON.stringify(limpio)}

FORMATO:
1. Veredicto en una línea: ¿se puede confiar en el contenido de las fichas hoy?
2. Tabla: máquina · hallazgos críticos confirmados · medios · menores · qué no se pudo verificar.
3. Los CRÍTICOS CONFIRMADOS uno por uno: qué dice la ficha, qué dice el manual, valor correcto,
   y en qué archivo se corrige. Ordenados por riesgo para el técnico.
4. Los que quedaron descartados por la segunda opinión, en una línea cada uno (para que se vea que
   se filtraron y por qué).
5. Qué quedó sin auditar: las secciones que viven solo en Firestore, la GEA (0/4 sin contenido) y
   cualquier PDF escaneado.

Sé directo: si el contenido está bien, decilo sin adornos. Si hay algo peligroso, ponelo primero.`,
  { label: 'informe', phase: 'Sintetizar' }
)

return { informe, porMaquina: limpio, hallazgosEnBruto: total }
