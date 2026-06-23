import type { Equipment } from '@/types'

/**
 * Familia eléctrica (NFPA 70B) + protocolo de inspección por familia.
 *
 * La NFPA 70B organiza el mantenimiento por FAMILIA de equipo (máquina rotativa,
 * tablero/CCM, transformador, …), no por el nombre de lo que el equipo acciona.
 * La familia se DERIVA del nombre/tipo (no reescribe el campo `tipo`): así un
 * "MOTOREDUCTOR CINTA" o un "MOTOR ELECTRICO BOMBA" caen en `rotativa` y se
 * inspeccionan con la lista correcta, en vez de quedar dispersos como
 * Reductor/Bomba/Cinta. Ver docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md.
 *
 * Los checklists son plantillas de arranque alineadas a la norma; se afinan con
 * el estándar completo NFPA 70B 2023 / el RPTD N°15 (SEC).
 */

export type Familia =
  | 'rotativa'
  | 'tablero'
  | 'transformador'
  | 'proteccion'
  | 'cable'
  | 'bateria'
  | 'iluminacion'
  | 'otros'

export const FAMILIA_LABEL: Record<Familia, string> = {
  rotativa: 'Máquina rotativa',
  tablero: 'Tablero / CCM',
  transformador: 'Transformador',
  proteccion: 'Protección',
  cable: 'Cable / canalización',
  bateria: 'Banco baterías / UPS',
  iluminacion: 'Iluminación',
  otros: 'Otros',
}

/** Orden de presentación de las familias. */
export const FAMILIAS: Familia[] = [
  'rotativa',
  'tablero',
  'transformador',
  'proteccion',
  'cable',
  'bateria',
  'iluminacion',
  'otros',
]

// Reglas por palabra clave (orden: lo más específico primero; primer match gana).
// Se evalúan sobre `nombre` + `tipo` normalizados (mayúsculas, sin acentos).
const REGLAS: { re: RegExp; fam: Familia }[] = [
  { re: /TRANSFORMADOR/, fam: 'transformador' },
  { re: /TABLERO|CCM|CENTRO DE CONTROL|GABINETE|VARIADOR|\bVFD\b|PARTIDOR/, fam: 'tablero' },
  { re: /\bUPS\b|BATERIA|RECTIFICADOR|CARGADOR/, fam: 'bateria' },
  { re: /INTERRUPTOR|BREAKER|DISYUNTOR|\bREL[EÉ]\b|PROTECCION|FUSIBLE/, fam: 'proteccion' },
  { re: /LUMINARIA|ILUMINACION|\bFOCO\b|REFLECTOR|LAMPARA|PROYECTOR/, fam: 'iluminacion' },
  { re: /CABLE|CANALIZACION|\bBARRA\b|BUSWAY|\bDUCTO\b|BANDEJA PORTACABLE/, fam: 'cable' },
  {
    re: /MOTOR|MOTOREDUCTOR|MOTORREDUCTOR|MOTOTAMBOR|MOTOVENTILADOR|REDUCTOR|BOMBA|VENTILADOR|EXTRACTOR|COMPRESOR|AGITADOR|CINTA|TRANSPORTAD|ELEVADOR|CENTRIFUG|SOPLADOR|TURBINA/,
    fam: 'rotativa',
  },
]

function norm(s?: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

/** Familia eléctrica derivada del nombre/tipo del equipo. */
export function familiaDe(eq: Pick<Equipment, 'nombre' | 'tipo'>): Familia {
  const hay = `${norm(eq.nombre)} ${norm(eq.tipo)}`
  for (const r of REGLAS) if (r.re.test(hay)) return r.fam
  return 'otros'
}

export type TareaChecklist = {
  id: string
  tarea: string
  /** cualitativo = se evalúa (conforme/observación); medicion = se cuantifica con valor + unidad. */
  tipo: 'cualitativo' | 'medicion'
  unidad?: string
  /** Rango aceptable SUGERIDO (afinar con el fabricante / norma). Fuera de rango → se resalta. */
  rango?: { min?: number; max?: number }
  /** Especificación: dónde/cómo/condición (p.ej. "lado eje", "borne 1–6", "solo sin proceso, sin carga"). */
  nota?: string
  /** Si requiere instrumento, habilita "N/A por falta de instrumento". */
  instrumento?: string
}

/**
 * Protocolo de inspección NFPA 70B por familia (plantilla de arranque).
 * Los rangos son SUGERIDOS: afinar con el manual del fabricante / la norma.
 */
export const CHECKLIST: Record<Familia, TareaChecklist[]> = {
  rotativa: [
    { id: 'visual', tarea: 'Inspección visual: limpieza, montaje, acoplamiento, fugas', tipo: 'cualitativo' },
    { id: 'tempCarcasa', tarea: 'Termografía carcasa (lado eje)', tipo: 'medicion', unidad: '°C', rango: { max: 70 }, nota: 'En proceso solo el lado del eje; el lado del aspa requiere parada.', instrumento: 'cámara termográfica' },
    { id: 'tempRodamiento', tarea: 'Temperatura rodamiento (lado eje)', tipo: 'medicion', unidad: '°C', rango: { max: 80 }, nota: 'Rodamiento accesible, con carga de proceso.', instrumento: 'termómetro IR' },
    { id: 'corrienteL1', tarea: 'Corriente L1', tipo: 'medicion', unidad: 'A', nota: 'Comparar entre fases (desbalance < 10%) y vs. placa.', instrumento: 'pinza amperimétrica' },
    { id: 'corrienteL2', tarea: 'Corriente L2', tipo: 'medicion', unidad: 'A', instrumento: 'pinza amperimétrica' },
    { id: 'corrienteL3', tarea: 'Corriente L3', tipo: 'medicion', unidad: 'A', instrumento: 'pinza amperimétrica' },
    { id: 'vibracion', tarea: 'Vibración de rodamientos', tipo: 'medicion', unidad: 'mm/s', rango: { max: 4.5 }, nota: 'Ref. ISO 10816. Sin vibrómetro → N/A por falta de instrumento.', instrumento: 'vibrómetro' },
    { id: 'aislacion', tarea: 'Aislación devanado–tierra', tipo: 'medicion', unidad: 'MΩ', rango: { min: 1 }, nota: 'SIN energía, motor frío. Mín ~ (1 MΩ/kV) + 1.', instrumento: 'megóhmetro' },
    { id: 'indicePolarizacion', tarea: 'Índice de polarización (R10min/R1min)', tipo: 'medicion', rango: { min: 2 }, nota: 'SIN energía. Aislación sana ≥ 2.', instrumento: 'megóhmetro' },
    { id: 'bornera', tarea: 'Termografía de bornera', tipo: 'medicion', unidad: '°C', nota: 'SOLO sin proceso: bornera abierta, SIN carga. Indicar borne (1–6) en el detalle.', instrumento: 'cámara termográfica' },
    { id: 'conexiones', tarea: 'Apriete de conexiones de fuerza', tipo: 'cualitativo', nota: 'Reapriete SOLO sin energía.' },
  ],
  tablero: [
    { id: 'visual', tarea: 'Inspección visual: limpieza, señalización, sellos, corrosión', tipo: 'cualitativo' },
    { id: 'termografiaBarras', tarea: 'Termografía de barras/borneras (bajo carga)', tipo: 'medicion', unidad: '°C', rango: { max: 60 }, nota: 'Con carga; por mirilla IR o tras retirar tapa según procedimiento. Indicar punto.', instrumento: 'cámara termográfica' },
    { id: 'torque', tarea: 'Reapriete de conexiones (torque)', tipo: 'cualitativo', nota: 'SOLO sin energía. Torque a especificación; indicar borne.' },
    { id: 'protecciones', tarea: 'Verificación/prueba de protecciones y ajustes', tipo: 'cualitativo', nota: 'Comparar con estudio de coordinación.' },
    { id: 'aislacionBarras', tarea: 'Aislación de barras', tipo: 'medicion', unidad: 'MΩ', rango: { min: 1 }, nota: 'SIN energía.', instrumento: 'megóhmetro' },
    { id: 'tierra', tarea: 'Continuidad de puesta a tierra', tipo: 'medicion', unidad: 'Ω', rango: { max: 5 }, instrumento: 'telurómetro' },
    { id: 'ventilacion', tarea: 'Ventilación / filtros y temperatura interior', tipo: 'cualitativo', nota: 'Filtros limpios; ventiladores operativos.' },
  ],
  transformador: [
    { id: 'visual', tarea: 'Inspección visual: fugas, nivel de aceite, sílica gel', tipo: 'cualitativo' },
    { id: 'termografia', tarea: 'Termografía de bushings y conexiones', tipo: 'medicion', unidad: '°C', rango: { max: 70 }, instrumento: 'cámara termográfica' },
    { id: 'aislacion', tarea: 'Aislación / índice de polarización', tipo: 'medicion', unidad: 'MΩ', rango: { min: 1 }, nota: 'SIN energía.', instrumento: 'megóhmetro' },
    { id: 'relacion', tarea: 'Relación de transformación (TTR)', tipo: 'cualitativo', nota: 'Desviación < 0.5% vs. placa.', instrumento: 'TTR' },
    { id: 'aceite', tarea: 'Rigidez dieléctrica del aceite', tipo: 'medicion', unidad: 'kV', rango: { min: 30 }, nota: 'Muestra a laboratorio (DGA si aplica).' },
    { id: 'tierra', tarea: 'Puesta a tierra y conexiones', tipo: 'medicion', unidad: 'Ω', rango: { max: 5 }, instrumento: 'telurómetro' },
  ],
  proteccion: [
    { id: 'visual', tarea: 'Inspección visual y limpieza', tipo: 'cualitativo' },
    { id: 'disparo', tarea: 'Prueba de disparo / tiempos', tipo: 'cualitativo', nota: 'SIN energía / banco de pruebas.', instrumento: 'maleta de inyección' },
    { id: 'ajustes', tarea: 'Verificación de ajustes vs. coordinación', tipo: 'cualitativo' },
    { id: 'termografia', tarea: 'Termografía de contactos', tipo: 'medicion', unidad: '°C', rango: { max: 60 }, instrumento: 'cámara termográfica' },
    { id: 'mecanismo', tarea: 'Lubricación / operación del mecanismo', tipo: 'cualitativo' },
  ],
  cable: [
    { id: 'visual', tarea: 'Inspección visual de aislación, terminaciones y empalmes', tipo: 'cualitativo' },
    { id: 'termografia', tarea: 'Termografía de terminaciones', tipo: 'medicion', unidad: '°C', rango: { max: 60 }, instrumento: 'cámara termográfica' },
    { id: 'aislacion', tarea: 'Resistencia de aislación', tipo: 'medicion', unidad: 'MΩ', rango: { min: 1 }, nota: 'SIN energía.', instrumento: 'megóhmetro' },
    { id: 'tierra', tarea: 'Continuidad de pantallas / PAT', tipo: 'medicion', unidad: 'Ω', rango: { max: 5 }, instrumento: 'telurómetro' },
  ],
  bateria: [
    { id: 'visual', tarea: 'Inspección visual: bornes, fugas, hinchazón, ventilación', tipo: 'cualitativo' },
    { id: 'tension', tarea: 'Tensión de flotación / por celda', tipo: 'medicion', unidad: 'V', nota: 'Comparar entre celdas; indicar celda fuera de rango.', instrumento: 'multímetro' },
    { id: 'impedancia', tarea: 'Impedancia interna por celda', tipo: 'medicion', unidad: 'mΩ', instrumento: 'medidor de impedancia' },
    { id: 'termografia', tarea: 'Termografía de conexiones', tipo: 'medicion', unidad: '°C', rango: { max: 50 }, instrumento: 'cámara termográfica' },
    { id: 'autonomia', tarea: 'Prueba de autonomía / descarga', tipo: 'cualitativo' },
  ],
  iluminacion: [
    { id: 'visual', tarea: 'Inspección visual: estado, fijación, hermeticidad', tipo: 'cualitativo' },
    { id: 'nivel', tarea: 'Nivel de iluminación', tipo: 'medicion', unidad: 'lx', instrumento: 'luxómetro' },
    { id: 'emergencia', tarea: 'Prueba de luminarias de emergencia', tipo: 'cualitativo' },
  ],
  otros: [
    { id: 'visual', tarea: 'Inspección visual general', tipo: 'cualitativo' },
    { id: 'termografia', tarea: 'Termografía de conexiones eléctricas', tipo: 'medicion', unidad: '°C', rango: { max: 60 }, instrumento: 'cámara termográfica' },
    { id: 'conexiones', tarea: 'Apriete de conexiones', tipo: 'cualitativo', nota: 'SOLO sin energía.' },
  ],
}

/** Protocolo de inspección NFPA 70B para un equipo (según su familia). */
export function checklistDe(eq: Pick<Equipment, 'nombre' | 'tipo'>): TareaChecklist[] {
  return CHECKLIST[familiaDe(eq)]
}

export type CampoMedicion = { id: string; label: string; unidad: string }

/**
 * Series de comportamiento a registrar por familia (mediciones oportunistas,
 * en proceso y en reposo). Base de las tendencias de confiabilidad.
 */
export const MEDICIONES_POR_FAMILIA: Record<Familia, CampoMedicion[]> = {
  rotativa: [
    { id: 'corrienteL1', label: 'Corriente L1', unidad: 'A' },
    { id: 'corrienteL2', label: 'Corriente L2', unidad: 'A' },
    { id: 'corrienteL3', label: 'Corriente L3', unidad: 'A' },
    { id: 'tempCarcasa', label: 'Temp. carcasa', unidad: '°C' },
    { id: 'tempRodamiento', label: 'Temp. rodamiento', unidad: '°C' },
    { id: 'vibracion', label: 'Vibración', unidad: 'mm/s' },
    { id: 'rpm', label: 'RPM bajo carga', unidad: 'rpm' },
    { id: 'consumo', label: 'Consumo', unidad: 'kW' },
  ],
  tablero: [
    { id: 'tempMax', label: 'Temp. máx (termografía)', unidad: '°C' },
    { id: 'tempAmbiente', label: 'Temp. ambiente', unidad: '°C' },
    { id: 'deltaT', label: 'ΔT vs. referencia', unidad: '°C' },
    { id: 'corriente', label: 'Corriente general', unidad: 'A' },
  ],
  transformador: [
    { id: 'tempAceite', label: 'Temp. aceite', unidad: '°C' },
    { id: 'tempDevanado', label: 'Temp. devanado', unidad: '°C' },
    { id: 'carga', label: 'Carga', unidad: '%' },
  ],
  proteccion: [
    { id: 'tempContactos', label: 'Temp. contactos', unidad: '°C' },
    { id: 'corriente', label: 'Corriente', unidad: 'A' },
  ],
  cable: [
    { id: 'tempTerminacion', label: 'Temp. terminación', unidad: '°C' },
    { id: 'corriente', label: 'Corriente', unidad: 'A' },
  ],
  bateria: [
    { id: 'tensionFlotacion', label: 'Tensión flotación', unidad: 'V' },
    { id: 'tempBanco', label: 'Temp. banco', unidad: '°C' },
  ],
  iluminacion: [{ id: 'nivel', label: 'Nivel iluminación', unidad: 'lx' }],
  otros: [
    { id: 'temperatura', label: 'Temperatura', unidad: '°C' },
    { id: 'corriente', label: 'Corriente', unidad: 'A' },
  ],
}

/** Campos de medición sugeridos para un equipo (según su familia). */
export function medicionesDe(eq: Pick<Equipment, 'nombre' | 'tipo'>): CampoMedicion[] {
  return MEDICIONES_POR_FAMILIA[familiaDe(eq)]
}
