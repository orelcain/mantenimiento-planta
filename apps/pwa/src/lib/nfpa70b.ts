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

export type TareaChecklist = { id: string; tarea: string; metodo: string }

/** Protocolo de inspección NFPA 70B por familia (plantilla de arranque). */
export const CHECKLIST: Record<Familia, TareaChecklist[]> = {
  rotativa: [
    { id: 'visual', tarea: 'Inspección visual: limpieza, montaje, acoplamiento, fugas', metodo: 'Visual' },
    { id: 'termografia', tarea: 'Termografía de carcasa, rodamientos y conexiones', metodo: 'Termografía' },
    { id: 'aislacion', tarea: 'Resistencia de aislación de devanados (megóhmetro)', metodo: 'Medición · MΩ' },
    { id: 'corriente', tarea: 'Corriente por fase vs. nominal de placa', metodo: 'Medición · A' },
    { id: 'vibracion', tarea: 'Vibración de rodamientos', metodo: 'Medición · mm/s' },
    { id: 'temperatura', tarea: 'Temperatura de operación / rodamientos', metodo: 'Medición · °C' },
    { id: 'conexiones', tarea: 'Apriete de conexiones de fuerza', metodo: 'Torque' },
  ],
  tablero: [
    { id: 'visual', tarea: 'Inspección visual: limpieza, señalización, sellos, corrosión', metodo: 'Visual' },
    { id: 'termografia', tarea: 'Termografía de barras, borneras y conexiones bajo carga', metodo: 'Termografía' },
    { id: 'torque', tarea: 'Reapriete de conexiones (torque a especificación)', metodo: 'Torque · N·m' },
    { id: 'protecciones', tarea: 'Verificación/prueba de protecciones y ajustes', metodo: 'Prueba' },
    { id: 'aislacion', tarea: 'Resistencia de aislación de barras', metodo: 'Medición · MΩ' },
    { id: 'tierra', tarea: 'Continuidad de puesta a tierra', metodo: 'Medición · Ω' },
    { id: 'ventilacion', tarea: 'Ventilación / filtros y temperatura interior', metodo: 'Visual · °C' },
  ],
  transformador: [
    { id: 'visual', tarea: 'Inspección visual: fugas, nivel y estado del aceite, sílica gel', metodo: 'Visual' },
    { id: 'termografia', tarea: 'Termografía de bushings y conexiones', metodo: 'Termografía' },
    { id: 'aislacion', tarea: 'Resistencia de aislación / índice de polarización', metodo: 'Medición · MΩ' },
    { id: 'relacion', tarea: 'Relación de transformación (TTR)', metodo: 'Prueba' },
    { id: 'aceite', tarea: 'Análisis de aceite (rigidez dieléctrica / DGA)', metodo: 'Laboratorio' },
    { id: 'tierra', tarea: 'Puesta a tierra y conexiones', metodo: 'Medición · Ω' },
  ],
  proteccion: [
    { id: 'visual', tarea: 'Inspección visual y limpieza', metodo: 'Visual' },
    { id: 'disparo', tarea: 'Prueba de disparo / tiempos', metodo: 'Prueba' },
    { id: 'ajustes', tarea: 'Verificación de ajustes vs. estudio de coordinación', metodo: 'Verificación' },
    { id: 'termografia', tarea: 'Termografía de contactos / conexiones', metodo: 'Termografía' },
    { id: 'mecanismo', tarea: 'Lubricación / operación del mecanismo', metodo: 'Visual' },
  ],
  cable: [
    { id: 'visual', tarea: 'Inspección visual de aislación, terminaciones y empalmes', metodo: 'Visual' },
    { id: 'termografia', tarea: 'Termografía de terminaciones', metodo: 'Termografía' },
    { id: 'aislacion', tarea: 'Resistencia de aislación', metodo: 'Medición · MΩ' },
    { id: 'tierra', tarea: 'Continuidad de pantallas / puesta a tierra', metodo: 'Medición · Ω' },
  ],
  bateria: [
    { id: 'visual', tarea: 'Inspección visual: bornes, fugas, hinchazón, ventilación', metodo: 'Visual' },
    { id: 'tension', tarea: 'Tensión de flotación y por celda / bloque', metodo: 'Medición · V' },
    { id: 'impedancia', tarea: 'Impedancia / resistencia interna por celda', metodo: 'Medición · mΩ' },
    { id: 'termografia', tarea: 'Termografía de conexiones', metodo: 'Termografía' },
    { id: 'autonomia', tarea: 'Prueba de autonomía / descarga', metodo: 'Prueba' },
  ],
  iluminacion: [
    { id: 'visual', tarea: 'Inspección visual: estado, fijación, hermeticidad', metodo: 'Visual' },
    { id: 'nivel', tarea: 'Nivel de iluminación (luxes)', metodo: 'Medición · lx' },
    { id: 'emergencia', tarea: 'Prueba de luminarias de emergencia', metodo: 'Prueba' },
  ],
  otros: [
    { id: 'visual', tarea: 'Inspección visual general', metodo: 'Visual' },
    { id: 'termografia', tarea: 'Termografía de conexiones eléctricas', metodo: 'Termografía' },
    { id: 'conexiones', tarea: 'Apriete de conexiones', metodo: 'Torque' },
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
