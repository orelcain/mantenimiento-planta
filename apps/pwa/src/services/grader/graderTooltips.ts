/**
 * Diccionario centralizado de tooltips para el módulo Grader.
 * v2 — Soporte para tooltips ricos con título, fórmula y ejemplo.
 */

export interface RichTooltip {
  text: string
  title?: string
  formula?: string
  example?: string
}

export type TooltipEntry = string | RichTooltip

export const GRADER_TOOLTIPS: Record<string, TooltipEntry> = {
  // ─── KPIs ──────────────────────────────────────────────────
  'kpi.totalPieces': 'Total de piezas procesadas por la grader en el período analizado, incluyendo productivas y Punto Cero.',
  'kpi.pointZero': 'Piezas que no fueron clasificadas y cayeron al Gate 0 (cinta de descarte). Se busca que sea < 2%.',
  'kpi.calibreDominante': 'Calibre (rango de peso) con mayor cantidad de piezas productivas. Define qué tipo de pescado predomina.',
  'kpi.calidadDominante': 'Calidad con mayor cantidad de piezas. Premium = mejor calidad, D = descarte.',
  'kpi.avgWeight': {
    title: 'Media aritmética',
    text: 'Peso promedio por pieza en gramos de las piezas productivas (excluyendo Gate 0).',
    formula: 'x̄ = Σxᵢ / N',
    example: 'Si hay 3 piezas de 200g, 250g y 300g → x̄ = 250g',
  },
  'kpi.medianWeight': {
    title: 'Mediana',
    text: 'Valor central al ordenar todos los pesos de menor a mayor. Más robusta que el promedio ante valores extremos (outliers).',
    formula: 'Me = valor en posición (N+1)/2 de datos ordenados',
    example: 'Pesos: 100, 200, 800 → Mediana = 200g (vs Promedio = 367g)',
  },
  'kpi.uniqueLots': 'Cantidad de lotes distintos procesados. Cambios de lote pueden alterar calibres y requerir reconfiguración.',
  'kpi.productionRate': {
    title: 'Tasa de producción',
    text: 'Piezas procesadas por hora. Indica la velocidad de la línea de producción.',
    formula: 'Tasa = Total piezas / Horas turno',
    example: '12.000 piezas en 8h → 1.500 piezas/hora',
  },

  // ─── Punto Cero ────────────────────────────────────────────
  'pz.clasificacion': 'Desglose del 100% de las piezas Punto Cero por causa: fuera de rango, fuera de límites, no leído por fotocélula, etc.',
  'pz.causa': 'Motivo por el cual la pieza no fue clasificada. Se infiere del error reportado por la grader o del peso de la pieza.',
  'pz.pctPCero': 'Porcentaje respecto al total de piezas en Punto Cero (las causas suman 100%).',
  'pz.pctTotal': 'Porcentaje respecto al total de producción (incluyendo piezas productivas).',
  'pz.pivote': 'Tabla jerárquica que cruza Error × Calidad × Calibre. Similar al pivote del software Marelec.',
  'pz.fueraRango': 'Piezas cuyo peso está fuera de TODOS los rangos de calibre configurados.',
  'pz.trend': {
    title: 'Tendencia P0 (Regresión lineal)',
    text: 'Tendencia del Punto Cero en el tiempo. Detecta si el problema crece o decrece durante el turno.',
    formula: 'y = mx + b  (m = pendiente)',
    example: 'm > 0 → P0 aumenta con el tiempo; m < 0 → mejora',
  },

  // ─── Distribuciones ────────────────────────────────────────
  'dist.calibre': 'Cantidad de piezas productivas por rango de peso (calibre). Sólo piezas gate > 0.',
  'dist.calidad': 'Cantidad de piezas productivas por grado de calidad asignado.',

  // ─── Lotes ─────────────────────────────────────────────────
  'lot.analysis': 'Análisis detallado por lote extraído del archivo pieza-pieza. Muestra cómo varía el peso promedio por lote.',
  'lot.avgWeight': {
    title: 'Peso promedio del lote',
    text: 'Peso promedio por pieza dentro de este lote. Diferencias >15% entre lotes indican cambio de materia prima.',
    formula: 'x̄ₗ = Σxᵢ / Nₗ',
  },
  'lot.medianWeight': {
    title: 'Mediana del lote',
    text: 'Valor central del peso por pieza del lote. Menos sensible a outliers que el promedio.',
    formula: 'Me = valor en posición (N+1)/2',
    example: 'Si un lote tiene piezas muy grandes y pequeñas, la mediana refleja mejor el "peso típico".',
  },
  'lot.stdDev': {
    title: 'Desviación estándar (σ)',
    text: 'Mide cuánto se dispersan los pesos respecto a la media. Mayor valor = piezas más heterogéneas.',
    formula: 'σ = √[ Σ(xᵢ − x̄)² / N ]',
    example: 'σ = 15g → la mayoría de piezas están entre x̄±15g',
  },
  'lot.p0pct': 'Porcentaje de piezas del lote que fueron Punto Cero. Lotes con alto P0 necesitan atención.',

  // ─── Tendencia de peso ─────────────────────────────────────
  'wt.trend': {
    title: 'Tendencia de peso',
    text: 'Evolución del peso promedio por pieza a lo largo del turno. Detecta cambios de materia prima y tendencias.',
    formula: 'y = mx + b  →  pendiente m indica dirección',
  },
  'wt.movingAvg': {
    title: 'Media móvil (MA)',
    text: 'Suaviza fluctuaciones para mostrar la tendencia real. Se calcula promediando los últimos 5 intervalos.',
    formula: 'MA₅ = (x₁ + x₂ + x₃ + x₄ + x₅) / 5',
    example: 'Intervalos: 200, 210, 190, 205, 195 → MA₅ = 200g',
  },
  'wt.stdDev': {
    title: 'Desviación estándar (σ)',
    text: 'Desviación estándar del peso en cada intervalo de tiempo. Alta variabilidad indica piezas heterogéneas.',
    formula: 'σ = √[ Σ(xᵢ − x̄)² / N ]',
  },
  'wt.dominantLot': 'Lote con más piezas en este intervalo de tiempo.',

  // ─── Matriz Q×C ────────────────────────────────────────────
  'matrix.qc': 'Matriz que cruza cada Calidad con cada Calibre. Muestra cuántas piezas hay en cada combinación.',
  'matrix.hhi': {
    title: 'Índice Herfindahl-Hirschman (HHI)',
    text: 'Mide concentración de la producción. 0 = distribución perfectamente uniforme, 1 = todo concentrado en una sola celda.',
    formula: 'HHI = Σ(sᵢ²)  donde sᵢ = proporción de cada celda',
    example: 'HHI = 0.12 → buena diversificación; HHI > 0.25 → alta concentración',
  },
  'matrix.hhiQuality': {
    title: 'HHI por calidad',
    text: 'Qué tan concentrada está una calidad en pocos calibres. Bajo = esa calidad aparece en muchos calibres.',
    formula: 'HHI_fila = Σ(sⱼ²)  para cada calibre j dentro de esa calidad',
  },
  'matrix.hhiCalibre': {
    title: 'HHI por calibre',
    text: 'Qué tan concentrado está un calibre en pocas calidades. Bajo = ese calibre tiene piezas de varias calidades.',
    formula: 'HHI_col = Σ(sᵢ²)  para cada calidad i dentro de ese calibre',
  },
  'matrix.imbalance': {
    title: 'Score de desbalance',
    text: 'Indicador general de equilibrio. 0 = producción equilibrada entre todas las celdas, 1 = totalmente concentrado.',
    formula: 'Imbalance = 1 − (1/HHI_normalizado)',
  },
  'matrix.avgWeight': 'Peso promedio por pieza en esta celda Q×C. Permite detectar inconsistencias.',
  'matrix.maxCell': 'Celda con mayor cantidad de piezas. Define la combinación Q×C dominante de la producción.',

  // ─── Balance Gates ─────────────────────────────────────────
  'gate.balance': 'Compara la demanda por calibre (% de piezas productivas) con la cantidad de gates asignados a cada calibre.',
  'gate.demandPct': 'Porcentaje de piezas productivas de este calibre respecto al total productivo.',
  'gate.gatesAssigned': 'Cantidad de compuertas (de las 12) configuradas para recibir este calibre.',
  'gate.stats': 'Estadísticas detalladas por compuerta: peso promedio, variabilidad, utilización y match con calibre asignado.',
  'gate.avgWeight': {
    title: 'Peso promedio por gate',
    text: 'Peso promedio de las piezas que pasaron por esta compuerta.',
    formula: 'x̄ᵍ = Σxᵢ / Nᵍ',
  },
  'gate.stdDev': {
    title: 'Desviación estándar (σ)',
    text: 'Variabilidad del peso en esta compuerta. Mayor valor indica piezas más heterogéneas.',
    formula: 'σ = √[ Σ(xᵢ − x̄)² / N ]',
    example: 'σ = 25g con x̄ = 200g → CV = 12.5%',
  },
  'gate.cv': {
    title: 'Coeficiente de variación (CV)',
    text: 'Mide heterogeneidad relativa del peso. Permite comparar gates con distintos pesos promedio. > 15% indica posible problema.',
    formula: 'CV = (σ / x̄) × 100%',
    example: 'Si σ = 20g y x̄ = 200g → CV = 10% (aceptable)',
  },
  'gate.utilization': {
    title: 'Utilización del gate',
    text: 'Porcentaje del total productivo que pasó por esta compuerta. Gates subutilizados podrían reasignarse.',
    formula: 'Util = (Piezas_gate / Total_productivas) × 100%',
  },
  'gate.mismatch': {
    title: 'Mismatch (desajuste)',
    text: 'Porcentaje de piezas cuyo peso NO corresponde al calibre asignado a esta compuerta. Alto mismatch = mala clasificación.',
    example: 'Gate asignado a 200-300g pero recibe piezas de 150g → mismatch',
  },
  'gate.swap': 'Sugerencias automáticas de reasignación basadas en estadísticas de uso real vs configuración.',

  // ─── Insights ──────────────────────────────────────────────
  'insights.deterministic': 'Alertas generadas automáticamente por reglas estadísticas. No requieren IA.',
  'insights.ai': 'Diagnóstico generado por inteligencia artificial (Grok) analizando todos los datos cargados.',
}

/** Props listos para InfoTooltip: extrae text, title, formula, example. */
export function getTooltipProps(key: string): {
  text?: string
  title?: string
  formula?: string
  example?: string
} {
  const entry = GRADER_TOOLTIPS[key]
  if (!entry) return {}
  if (typeof entry === 'string') return { text: entry }
  return { text: entry.text, title: entry.title, formula: entry.formula, example: entry.example }
}

/** Obtiene solo el texto tooltip por clave (backward compat). */
export function getTooltip(key: string): string | undefined {
  const entry = GRADER_TOOLTIPS[key]
  if (!entry) return undefined
  return typeof entry === 'string' ? entry : entry.text
}
