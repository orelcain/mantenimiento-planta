/**
 * Diccionario centralizado de tooltips para el módulo Grader.
 * Cada clave es un identificador semántico usado por el componente InfoTooltip.
 */

export const GRADER_TOOLTIPS: Record<string, string> = {
  // KPIs
  'kpi.totalPieces': 'Total de piezas procesadas por la grader en el período analizado, incluyendo productivas y Punto Cero.',
  'kpi.pointZero': 'Piezas que no fueron clasificadas y cayeron al Gate 0 (cinta de descarte). Se busca que sea < 2%.',
  'kpi.calibreDominante': 'Calibre (rango de peso) con mayor cantidad de piezas productivas. Define qué tipo de pescado predomina.',
  'kpi.calidadDominante': 'Calidad con mayor cantidad de piezas. Premium = mejor calidad, D = descarte.',
  'kpi.avgWeight': 'Peso promedio por pieza en gramos de las piezas productivas (excluyendo Gate 0).',
  'kpi.medianWeight': 'Mediana del peso por pieza. Más robusta que el promedio ante valores extremos.',
  'kpi.uniqueLots': 'Cantidad de lotes distintos procesados. Cambios de lote pueden alterar calibres y requerir reconfiguración.',
  'kpi.productionRate': 'Piezas procesadas por hora. Indica la velocidad de la línea de producción.',

  // Punto Cero
  'pz.clasificacion': 'Desglose del 100% de las piezas Punto Cero por causa: fuera de rango, fuera de límites, no leído por fotocélula, etc.',
  'pz.causa': 'Motivo por el cual la pieza no fue clasificada. Se infiere del error reportado por la grader o del peso de la pieza.',
  'pz.pctPCero': 'Porcentaje respecto al total de piezas en Punto Cero (las causas suman 100%).',
  'pz.pctTotal': 'Porcentaje respecto al total de producción (incluyendo piezas productivas).',
  'pz.pivote': 'Tabla jerárquica que cruza Error × Calidad × Calibre. Similar al pivote del software Marelec.',
  'pz.fueraRango': 'Piezas cuyo peso está fuera de TODOS los rangos de calibre configurados.',
  'pz.trend': 'Tendencia del Punto Cero en el tiempo usando regresión lineal. Detecta si el problema crece o decrece durante el turno.',

  // Distribuciones
  'dist.calibre': 'Cantidad de piezas productivas por rango de peso (calibre). Sólo piezas gate > 0.',
  'dist.calidad': 'Cantidad de piezas productivas por grado de calidad asignado.',

  // Lotes
  'lot.analysis': 'Análisis detallado por lote extraído del archivo pieza-pieza. Muestra cómo varía el peso promedio por lote.',
  'lot.avgWeight': 'Peso promedio por pieza dentro de este lote. Diferencias >15% entre lotes indican cambio de materia prima.',
  'lot.medianWeight': 'Mediana del peso por pieza del lote. Menos sensible a outliers que el promedio.',
  'lot.stdDev': 'Desviación estándar del peso. Mayor variabilidad = piezas más heterogéneas.',
  'lot.p0pct': 'Porcentaje de piezas del lote que fueron Punto Cero. Lotes con alto P0 necesitan atención.',

  // Tendencia de peso
  'wt.trend': 'Evolución del peso promedio por pieza a lo largo del turno. Detecta cambios de materia prima y tendencias.',
  'wt.movingAvg': 'Media móvil de 5 intervalos. Suaviza fluctuaciones para mostrar la tendencia real.',
  'wt.stdDev': 'Desviación estándar del peso en cada intervalo. Alta variabilidad = piezas heterogéneas.',
  'wt.dominantLot': 'Lote con más piezas en este intervalo de tiempo.',

  // Matriz Q×C
  'matrix.qc': 'Matriz que cruza cada Calidad con cada Calibre. Muestra cuántas piezas hay en cada combinación.',
  'matrix.hhi': 'Índice Herfindahl-Hirschman: mide concentración. 0 = distribución uniforme, 1 = todo concentrado en una celda.',
  'matrix.hhiQuality': 'HHI por fila de calidad: qué tan concentrada está esa calidad en pocos calibres.',
  'matrix.hhiCalibre': 'HHI por columna de calibre: qué tan concentrado está ese calibre en pocas calidades.',
  'matrix.imbalance': 'Score de desbalance general: 0 = equilibrado entre todas las celdas, 1 = totalmente concentrado.',
  'matrix.avgWeight': 'Peso promedio por pieza en esta celda Q×C. Permite detectar inconsistencias.',
  'matrix.maxCell': 'Celda con mayor cantidad de piezas. Define la combinación Q×C dominante de la producción.',

  // Balance Gates
  'gate.balance': 'Compara la demanda por calibre (% de piezas productivas) con la cantidad de gates asignados a cada calibre.',
  'gate.demandPct': 'Porcentaje de piezas productivas de este calibre respecto al total productivo.',
  'gate.gatesAssigned': 'Cantidad de compuertas (de las 12) configuradas para recibir este calibre.',
  'gate.stats': 'Estadísticas detalladas por compuerta: peso promedio, variabilidad, utilización y match con calibre asignado.',
  'gate.avgWeight': 'Peso promedio de las piezas que pasaron por esta compuerta.',
  'gate.stdDev': 'Desviación estándar del peso en esta compuerta. Mayor valor = piezas más heterogéneas.',
  'gate.cv': 'Coeficiente de variación (StdDev/Media). Mide heterogeneidad relativa. > 15% = posible problema.',
  'gate.utilization': 'Porcentaje del total productivo que pasó por esta compuerta.',
  'gate.mismatch': 'Porcentaje de piezas que NO corresponden al calibre asignado a esta compuerta.',
  'gate.swap': 'Sugerencias automáticas de reasignación basadas en estadísticas de uso real vs configuración.',

  // Insights
  'insights.deterministic': 'Alertas generadas automáticamente por reglas estadísticas. No requieren IA.',
  'insights.ai': 'Diagnóstico generado por inteligencia artificial (Grok) analizando todos los datos cargados.',
}

/** Obtiene el texto tooltip por clave. Retorna undefined si no existe. */
export function getTooltip(key: string): string | undefined {
  return GRADER_TOOLTIPS[key]
}
