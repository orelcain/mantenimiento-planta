import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'

export type PredictiveRiskLevel = 'bajo' | 'medio' | 'alto' | 'critico'

export type PredictiveResult = {
  nivelRiesgo: PredictiveRiskLevel
  confianza: number // 0-1
  indicadores: string[]
  recomendacion: string
}

function clamp01(value: number) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function linearSlopePerMinute(readings: SensorReading[], selector: (r: SensorReading) => number) {
  // Regresión lineal simple sobre el tiempo (minutos) -> valor
  const points = readings
    .map((r) => ({ x: r.timestamp / 60000, y: selector(r) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (points.length < 3) return 0

  const n = points.length
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n

  let num = 0
  let den = 0
  for (const p of points) {
    const dx = p.x - meanX
    num += dx * (p.y - meanY)
    den += dx * dx
  }

  if (den === 0) return 0
  return num / den
}

function inferOffline(summary: SensorSummaryNode | null, nowMs: number) {
  const lastSeen = summary?.lastSeen
  if (!lastSeen) return true

  // Si pasan 60s sin ver al sensor, asumimos offline (ajustable)
  return nowMs - lastSeen > 60_000
}

export function predictFailureRisk(params: {
  summary: SensorSummaryNode | null
  readings: SensorReading[]
  nowMs?: number
}): PredictiveResult {
  const nowMs = params.nowMs ?? Date.now()
  const offline = inferOffline(params.summary, nowMs)

  const indicators: string[] = []

  if (offline) {
    return {
      nivelRiesgo: 'medio',
      confianza: 0.6,
      indicadores: ['Sensor sin reporte reciente (posible desconexión)'],
      recomendacion: 'Revisar alimentación/cableado y conectividad del ESP32.',
    }
  }

  const recent = params.readings.slice(-15)
  const last = recent[recent.length - 1]

  const temp = last?.temperature
  const hum = last?.humidity

  const tempSlope = linearSlopePerMinute(recent, (r) => r.temperature)
  const humSlope = linearSlopePerMinute(recent, (r) => r.humidity)

  let risk: PredictiveRiskLevel = 'bajo'

  // Reglas simples (MVP)
  if (typeof temp === 'number' && Number.isFinite(temp)) {
    if (temp >= 40) {
      risk = 'critico'
      indicators.push(`Temperatura crítica (${temp.toFixed(1)}°C)`) 
    } else if (temp >= 30) {
      risk = 'alto'
      indicators.push(`Temperatura en advertencia (${temp.toFixed(1)}°C)`) 
    }
  }

  if (typeof hum === 'number' && Number.isFinite(hum)) {
    if (hum >= 85) {
      risk = 'critico'
      indicators.push(`Humedad crítica (${hum.toFixed(1)}%)`)
    } else if (hum >= 70) {
      risk = risk === 'critico' ? 'critico' : 'alto'
      indicators.push(`Humedad en advertencia (${hum.toFixed(1)}%)`)
    }
  }

  // Tendencia peligrosa (sube rápido)
  if (tempSlope >= 0.8) {
    risk = risk === 'critico' ? 'critico' : 'alto'
    indicators.push(`Temperatura subiendo rápido (+${tempSlope.toFixed(2)} °C/min)`) 
  } else if (tempSlope >= 0.3) {
    risk = risk === 'critico' || risk === 'alto' ? risk : 'medio'
    indicators.push(`Temperatura con tendencia al alza (+${tempSlope.toFixed(2)} °C/min)`) 
  }

  if (humSlope >= 1.0) {
    risk = risk === 'critico' ? 'critico' : 'alto'
    indicators.push(`Humedad subiendo rápido (+${humSlope.toFixed(2)} %/min)`) 
  }

  // Fuente simulada baja confianza
  const lastSource = last?.source ?? params.summary?.temperatura?.source
  const sourcePenalty = lastSource === 'simulated' ? 0.35 : 0

  // Confianza: más lecturas => más confianza
  const baseConf = clamp01((params.readings.length ?? 0) / 30)
  const confidence = clamp01(0.35 + 0.65 * baseConf - sourcePenalty)

  if (indicators.length === 0) {
    indicators.push('Sin señales de riesgo con los datos actuales')
  }

  const recomendacion =
    risk === 'critico'
      ? 'Detener/inspeccionar el equipo y generar incidencia predictiva inmediata.'
      : risk === 'alto'
        ? 'Programar inspección. Verificar ventilación, carga y condiciones ambientales.'
        : risk === 'medio'
          ? 'Monitorear en las próximas horas y revisar si la tendencia continúa.'
          : 'Continuar monitoreo normal.'

  return {
    nivelRiesgo: risk,
    confianza: Number(confidence.toFixed(2)),
    indicadores: indicators,
    recomendacion,
  }
}
