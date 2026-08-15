#!/usr/bin/env node
/**
 * Auditoría de gráficos — el checklist de las guías de visualización como
 * guardia de CI (destilado completo: ANTARFOOD/_GUIAS/_DESTILADO_VISUALIZACION.md).
 *
 * Uso:  node scripts/audit-graficos.mjs          (informe)
 *       node scripts/audit-graficos.mjs --ci     (falla si hay deuda NUEVA)
 *
 * Cómo funciona: cada patrón peligroso tiene una LÍNEA BASE por archivo — las
 * ocurrencias hoy legítimas (una línea truncada CON título es lícita; una barra
 * truncada no) o la deuda vieja aún sin pagar. Si un archivo supera su cupo o
 * aparece uno nuevo, el build falla con el archivo y las líneas.
 *
 * ⚠ Al agregar una excepción acá, JUSTIFICARLA en el comentario de al lado.
 * La pregunta de la guía: ¿el lector puede saber cuánto vale la barra, dónde
 * arranca el eje y qué serie es cada color, sin abrir el tooltip?
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'apps', 'pwa', 'src')
const CI = process.argv.includes('--ci')

/**
 * Patrones y su cupo por archivo (rutas relativas a apps/pwa/src, con /).
 * Cupo 0 implícito para todo archivo no listado.
 */
const REGLAS = [
  {
    id: 'eje-truncado',
    detalle: 'beginAtZero: false — en BARRAS es falsear la longitud; en líneas exige título de eje',
    patron: /beginAtZero:\s*false/g,
    base: {
      // Líneas con eje rotulado — lícitas: el dato es la forma, no la longitud.
      'components/grader/tabs/tendencia/TendenciaWeightCard.tsx': 1,
      'components/telemetry/TelemetryChart.tsx': 2, // modos line/area y mixed (líneas)
    },
  },
  {
    id: 'eje-datamin',
    detalle: "min: 'dataMin' — toda variación llena la pantalla y parece evento",
    patron: /'dataMin'/g,
    base: {
      // DEUDA vieja (#11 del inventario 2026-08-14): pendiente de banda normal.
      'pages/SensorsMonitorPage.tsx': 2,
    },
  },
  {
    id: 'leyenda-apagada',
    detalle: 'legend display/show: false — lícito SOLO con una serie y un solo color',
    patron: /legend:\s*\{\s*(?:display|show):\s*false/g,
    base: {
      // Una serie o leyenda HTML propia al lado (verificado 2026-08-15):
      'components/grader/GraderPeriodView.tsx': 3, // 355 leyenda HTML propia; 860/899 una serie
      'components/grader/GraderTurnoDetailView.tsx': 2,
      'components/grader/tabs/GraderCompuertasTab.tsx': 1,
      'components/grader/tabs/GraderLotesTab.tsx': 2,
      'components/grader/tabs/puntocero/PuntoCeroClasificacionCard.tsx': 1, // leyenda HTML propia
      'components/grader/tabs/puntocero/PuntoCeroFueraRangoCard.tsx': 1,
      'components/grader/tabs/puntocero/PuntoCeroPatronesCard.tsx': 3,
      'components/grader/tabs/puntocero/PuntoCeroSerieTemporalCard.tsx': 1,
      'components/predictive/FailureAnalysis.tsx': 1, // barras 1 serie; el pie SÍ tiene leyenda
      'components/telemetry/TelemetryChart.tsx': 1, // gauge
    },
  },
  {
    id: 'eje-sin-numeros',
    detalle: 'axisLabel show:false — sin escala no hay información, hay diseño',
    patron: /axisLabel:\s*\{\s*show:\s*false/g,
    base: {
      // Ejes CATEGÓRICOS de carril (gantt) o eje duplicado del grid de arriba:
      'components/grader/StateTimelineEC.tsx': 2,
      'components/grader/GraderTimelineChart.tsx': 1,
    },
  },
  {
    id: 'orden-lexicografico',
    detalle: '.sort() pelado sobre strings en componentes de gráfico — "10-12 lb" antes que "2-4 lb"',
    patron: /\.sort\(\)/g,
    soloEn: /components[\\/](grader|telemetry|predictive)|Chart|chart/,
    base: {
      // Claves de fecha YYYY-MM-DD: lexicográfico = cronológico.
      'components/grader/PauseKpiDashboard.tsx': 2,
      // Listas NOMINALES chicas donde el alfabeto es un orden estable y nadie
      // compara longitudes: máquinas de un tooltip, calidades en chips,
      // errores de un filtro. Los CALIBRES de estos archivos ya usan
      // compararCalibres (utils/calibres.ts).
      'components/grader/LossCascadeCard.tsx': 1,
      'components/grader/ShiftConfigPanel.tsx': 1,
      'components/grader/GraderTimelineChart.tsx': 2, // uniqueErrors ×2
    },
  },
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      yield* walk(p)
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) yield p
  }
}

let nuevas = 0
const informe = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  for (const regla of REGLAS) {
    if (regla.soloEn && !regla.soloEn.test(rel)) continue
    const hits = []
    let m
    regla.patron.lastIndex = 0
    while ((m = regla.patron.exec(src))) {
      hits.push(src.slice(0, m.index).split('\n').length)
    }
    const cupo = regla.base[rel] ?? 0
    if (hits.length > cupo) {
      nuevas += hits.length - cupo
      informe.push(`  ${rel}:${hits.join(',')}  [${regla.id}] ${hits.length} de ${cupo} permitidas — ${regla.detalle}`)
    }
  }
}

if (informe.length === 0) {
  console.log('audit-graficos: sin deuda nueva. Línea base íntegra.')
  process.exit(0)
}
console.log(`audit-graficos: ${nuevas} ocurrencia(s) FUERA de la línea base:\n`)
for (const l of informe) console.log(l)
console.log('\nSi la ocurrencia es legítima (línea con eje rotulado, una sola serie,')
console.log('eje categórico), sumala a la línea base del script CON su justificación.')
console.log('Las reglas completas: ANTARFOOD/_GUIAS/_DESTILADO_VISUALIZACION.md')
process.exit(CI ? 1 : 0)
