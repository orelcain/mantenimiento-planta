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
  // ─── Umbrales de configuración ─────────────────────────────
  'cfg.photocellWarn': {
    title: 'Umbral Fotocélula',
    text: 'Porcentaje de piezas no detectadas por la fotocélula de entrada. Si supera este umbral, el análisis emite una alerta de calidad de lectura.',
    example: 'Valor típico: 1%. >3% indica suciedad en el sensor o velocidad excesiva.',
  },
  'cfg.outOfLimitsWarn': {
    title: 'Umbral Fuera de Límites',
    text: 'Porcentaje de piezas rechazadas por estar fuera de todos los rangos de calibre configurados. Indica pescado fuera de especificación.',
    example: 'Valor típico: 3%. >5% puede indicar mezcla de lotes o calibrado incorrecto.',
  },
  'cfg.pointZeroWarn': {
    title: 'Umbral Punto Cero — Alerta',
    text: 'Porcentaje de piezas en Gate 0 (descarte) que activa la alerta amarilla. La meta operacional es mantenerlo por debajo de este valor.',
    example: 'Valor típico: 2%. Revisar configuración de gates si supera este límite.',
  },
  'cfg.pointZeroCritical': {
    title: 'Umbral Punto Cero — Crítico',
    text: 'Porcentaje de piezas en Gate 0 que activa la alerta roja. Requiere intervención inmediata del operador o técnico.',
    example: 'Valor típico: 3.5%. Debe ser mayor que el umbral de alerta.',
  },

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
  'lot.cv': {
    title: 'Coeficiente de variación (CV)',
    text: 'Mide la dispersión relativa del lote: compara σ contra el peso promedio. Permite comparar lotes con distintos promedios.',
    formula: 'CV = (σ / x̄) × 100%',
    example: 'Si x̄=3.000g y σ=300g → CV=10% (dispersión moderada).',
  },
  'lot.cvChart': {
    title: 'Dispersión por lote (CV%)',
    text: 'Gráfico de homogeneidad de peso por lote. Valores altos indican mezcla de calibres y mayor riesgo de desajuste en gates.',
    formula: 'CV_lote = (σ_lote / x̄_lote) × 100%',
    example: 'CV>20% sugiere revisar asignación de compuertas y estrategia de separación.',
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
  'wt.avgWeight': {
    title: 'Promedio por intervalo',
    text: 'Peso promedio de las piezas procesadas dentro de este intervalo de tiempo.',
    formula: 'x̄_intervalo = Σxᵢ / N',
  },
  'wt.medianWeight': {
    title: 'Mediana por intervalo',
    text: 'Peso central del intervalo al ordenar las piezas. Es más estable que el promedio ante outliers.',
    formula: 'Me = valor central de pesos ordenados',
  },
  'wt.cv': {
    title: 'CV por intervalo',
    text: 'Dispersión relativa en cada intervalo. Ayuda a detectar momentos del turno con mezcla de tamaños más alta.',
    formula: 'CV = (σ / x̄) × 100%',
    example: 'CV alto en una hora puntual puede justificar ajuste temporal de compuertas.',
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
  'gate.balance': {
    title: 'Balance Demanda vs Gates',
    text: 'Compara la demanda real por calibre con la asignación de gates. Calcula la asignación ideal proporcional a demanda (método largest-remainder).',
    formula: 'Ideal(c) = round(demanda_c% × N_gates / 100)',
    example: 'Si 6-8lb = 53% demanda y hay 12 gates → ideal = 6 gates',
  },
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
  'gate.swap': {
    title: 'Sugerencias de Reasignación',
    text: 'Tres tipos: (1) Corrección — la etiqueta del sistema no coincide con lo que la máquina envía al gate. '
      + '(2) Optimización — redistribuir gates de calibres con superávit a calibres con déficit. '
      + '(3) Investigación — anomalías de variabilidad que requieren verificación.',
    example: 'Si 6-8lb tiene 53% demanda y 5 gates (ideal: 6), busca un calibre con superávit para donar 1 gate.',
  },

  // ─── Neumática / Timing ────────────────────────────────────
  'pneum.responseTime': {
    title: 'Tiempo de respuesta neumático (por gate)',
    text: 'Tiempo total que tarda la compuerta en activarse desde que el controlador Z2 envía la señal eléctrica al solenoide. Cada gate tiene un tiempo distinto porque la línea neumática es más larga.',
    formula: 't_respuesta = t_válvula + t_carga_línea + t_carrera_cilindro',
    example: 'Gate 1 (2m línea): ~90ms. Gate 12 (18m línea): ~250ms. La diferencia viene de la carga de la línea.',
  },
  'pneum.valveSwitch': {
    title: 'Tiempo de conmutación del solenoide',
    text: 'Retardo fijo de la electroválvula 5/2 vías al cambiar de estado. Es constante para todas las gates (misma válvula en el manifold).',
    formula: 't_válvula = constante (dato del datasheet)',
    example: 'Válvula Festo MFH-5/2: 25ms. SMC SY3000: 35ms. Parker: 20ms.',
  },
  'pneum.lineCharge': {
    title: 'Tiempo de carga de línea neumática',
    text: 'Tiempo para llenar el tubo desde el manifold hasta la compuerta con aire a presión de trabajo. Depende críticamente del largo y diámetro del tubo.',
    formula: 't_carga = V_tubo / Q_efectivo\nV_tubo = π × (d/2)² × L\nQ_eff = Cv × Kv × √(P_suministro − P_atm)',
    example: 'Tubo 4mm ID × 2m = 25cm³ → ~15ms. Tubo 4mm ID × 18m = 226cm³ → ~140ms a 6 bar.',
  },
  'pneum.cylinderStroke': {
    title: 'Tiempo de carrera del cilindro',
    text: 'Tiempo para que el pistón complete su carrera (extender o retraer el flipper). Depende del bore, stroke y presión efectiva después de las pérdidas en la línea.',
    formula: 't_carrera = stroke / v_pistón\nv_pistón = Q_disponible / A_pistón',
    example: 'Cilindro Ø32mm × 50mm @ 5.5 bar: ~40ms. A menor presión (gate lejana) → más lento.',
  },
  'pneum.pressureDrop': {
    title: 'Caída de presión en la línea',
    text: 'Pérdida de presión entre el manifold y la compuerta por fricción del aire con las paredes del tubo. Crece con la longitud y baja con el diámetro (proporcional a d⁴).',
    formula: 'ΔP ∝ L / d⁴ (Darcy-Weisbach para flujo compresible)',
    example: 'Gate 1 (2m): ΔP ≈ 0.1 bar. Gate 12 (18m): ΔP ≈ 0.8 bar. Duplicar el diámetro reduce ΔP 16×.',
  },
  'pneum.effectivePressure': {
    title: 'Presión efectiva en la compuerta',
    text: 'Presión disponible en el cilindro después de las pérdidas en la línea. Menor presión = cilindro más lento y con menos fuerza.',
    formula: 'P_efectiva = P_suministro − ΔP_línea',
    example: 'FRL a 6 bar, ΔP = 0.5 bar → P_eff = 5.5 bar. Si P_eff < 3 bar → riesgo de falla.',
  },
  'pneum.supplyPressure': {
    title: 'Presión de suministro (FRL)',
    text: 'Presión regulada en el Filter-Regulator-Lubricator. Leer del manómetro del regulador en el panel neumático. Subir presión = más rápido pero más desgaste.',
    example: 'Típico planta: 5-7 bar. Mínimo recomendado: 4 bar. Máximo: 8 bar (límite del regulador).',
  },
  'pneum.tubeDiameter': {
    title: 'Diámetro interno del tubo',
    text: 'Diámetro INTERNO (ID), no el externo (OD). Tubo PU estándar: 6mm OD = 4mm ID. El flujo escala con d⁴, así que un tubo ligeramente más grueso tiene efecto dramático.',
    formula: 'Flujo ∝ d⁴ (Hagen-Poiseuille)',
    example: '4mm ID → 256 (d⁴). 6mm ID → 1296 (d⁴). ¡5× más flujo con solo 2mm más de diámetro!',
  },
  'pneum.lineLengthM': {
    title: 'Largo de línea por gate',
    text: 'Distancia del tubo neumático desde el manifold (bloque de electroválvulas) hasta cada flipper. Medir en planta siguiendo el tubo real (no en línea recta).',
    example: 'Si el manifold está al inicio de la grader: Gate 1 ≈ 2m, Gate 12 ≈ 18-20m.',
  },
  'pneum.cylinderBore': {
    title: 'Bore (diámetro del pistón)',
    text: 'Diámetro del pistón del cilindro neumático. Determina la fuerza: F = P × π(d/2)². Un bore mayor da más fuerza pero necesita más aire (más lento si la línea es larga).',
    formula: 'F = P × π × (bore/2)²',
    example: 'Ø25mm @ 6 bar → 295N. Ø32mm @ 6 bar → 483N. Ø50mm @ 6 bar → 1178N.',
  },
  'pneum.cylinderStrokeMm': {
    title: 'Carrera del cilindro',
    text: 'Distancia que viaja el pistón de un extremo al otro. Más largo = más tiempo de actuación.',
    example: 'Flipper típico grader: 30-80mm de carrera.',
  },
  'pneum.valveCv': {
    title: 'Coeficiente de flujo (Cv)',
    text: 'Capacidad de flujo de la electroválvula. Dato del datasheet del fabricante. Mayor Cv = más caudal = más rápido.',
    example: 'Válvula 1/8": Cv ≈ 0.3. Válvula 1/4": Cv ≈ 0.7. Válvula 3/8": Cv ≈ 1.5.',
  },
  'pneum.margin': {
    title: 'Margen de timing por gate',
    text: 'Tiempo disponible después de que la compuerta actúa y antes de que llegue la siguiente pieza. Un margen negativo significa que el flipper no alcanza a resetear.',
    formula: 'Margen = t_disponible − t_paso_salmón − t_respuesta_neumático',
    example: 'Margen > 500ms = OK (verde). 150-500ms = Ajustado (amarillo). < 150ms = Crítico (rojo). Umbrales configurables.',
  },
  'gate.timingSemaphore': {
    title: 'Semáforo de timing',
    text: 'Indicador visual del margen de tiempo de cada compuerta. Verde = holgado, Amarillo = ajustado (monitorear), Rojo = crítico (riesgo de "puerta no preparada").',
    example: 'Los umbrales son configurables. Cambiar en "Ajustes de umbrales" arriba de esta tabla.',
  },
  'threshold.timingOk': {
    title: 'Umbral verde (OK)',
    text: 'Margen mínimo para que el semáforo sea verde. Margen ≥ este valor = la compuerta trabaja con holgura.',
    example: 'Default: 0.5s. Si la producción es estable, puede bajarse a 0.3s.',
  },
  'threshold.timingWarn': {
    title: 'Umbral amarillo (Ajustado)',
    text: 'Margen mínimo para que el semáforo sea amarillo (warn). Por debajo de este valor = rojo (crítico).',
    example: 'Default: 0.15s (150ms). Bajar si la máquina opera sin errores a márgenes menores.',
  },
  'threshold.overloadWarn': {
    title: 'Umbral sobrecarga (warn)',
    text: 'Porcentaje máximo de tráfico que debería manejar una sola compuerta antes de generar alerta. Si se supera, el flipper puede no resetear a tiempo.',
    example: 'Default: 35%. Con 12 gates activas, el promedio es ~8.3% por gate.',
  },
  'threshold.overloadCritical': {
    title: 'Umbral sobrecarga (critical)',
    text: 'Porcentaje de tráfico que genera alerta CRÍTICA. A este nivel, errores de "puerta no preparada" son casi seguros.',
    example: 'Default: 50%. Significa que una sola gate maneja la mitad de la producción.',
  },

  // ─── Diagnóstico ──────────────────────────────────────────
  'insights.deterministic': 'Alertas automáticas generadas por reglas estadísticas: Punto Cero alto, mismatch, variabilidad, cambios de lote, etc. No requieren IA.',
  'insights.ai': {
    title: 'Diagnóstico IA (Groq)',
    text: 'Análisis profundo con inteligencia artificial (Llama 3.3 70B vía Groq). Envía todos los datos del turno al modelo y obtiene: causas raíz, correlaciones entre variables, y plan de acción priorizado.',
    example: 'El modelo analiza patrones que las reglas simples no capturan, como correlaciones entre lotes/gates/tiempo.',
  },
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
