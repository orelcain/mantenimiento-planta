import type { TechnicalDataType } from '@/types/repuestos'

/**
 * Los campos de cada tipo de ficha técnica y CÓMO SE LLAMAN — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * Las etiquetas vivían solo dentro de `TechnicalSpecsModal.tsx`. El PDF de la ficha
 * (`exportTechnicalSheet.ts`) no las conocía y caía a `key.toUpperCase()`, así que un campo
 * que en pantalla decía «Diámetro Pistón (mm)» salía impreso como **DIAMETROPISTON** y
 * «Presión Máx. (bar)» como **PRESIONMAX** — sin unidad, sin acentos y pegado.
 *
 * Es el mismo defecto que ya apareció tres veces en este módulo con otra cara: dos sitios
 * escriben lo mismo por su lado y uno se queda atrás (ver `filtrosDeStock.ts`). Mientras el
 * modal y el PDF lean de acá, la ficha que se ve en pantalla y la que se entrega en papel
 * usan las mismas palabras.
 *
 * El icono y el color de cada tipo NO están acá a propósito: son de la UI y arrastrarían
 * componentes de React al generador de PDF.
 */

export interface PlantillaFicha {
  /** Nombre del tipo, tal como se ofrece en el selector. */
  label: string
  /** Clave del dato → etiqueta legible (con unidad). El orden es el de la ficha. */
  fields: Record<string, string>
}

/**
 * Campos que aplican a TODOS los tipos (la sección «Datos generales» de la ficha).
 * También los imprime el PDF, así que viven acá y no dentro del modal.
 */
export const CAMPOS_COMUNES: Record<string, string> = {
  fabricante: 'Fabricante / Marca',
  modelo: 'Modelo',
  numeroSerie: 'N° Serie',
  anoInstalacion: 'Año Instalación',
  proveedor: 'Proveedor',
  garantiaMeses: 'Garantía (meses)',
}

export const PLANTILLAS_FICHA: Record<string, PlantillaFicha> = {
  motor: {
    label: 'Motor Eléctrico',
    fields: {
      potencia: 'Potencia (HP/kW)',
      rpm: 'RPM',
      voltaje: 'Voltaje (V)',
      amperaje: 'Amperaje (A)',
      frecuencia: 'Frecuencia (Hz)',
      frame: 'Frame / Carcasa',
      fases: 'Fases',
      tipoArranque: 'Tipo de Arranque',
      gradoProteccion: 'Grado Protección (IP)',
      claseAislacion: 'Clase de Aislación',
    },
  },
  bomba: {
    label: 'Bomba',
    fields: {
      tipoBomba: 'Tipo de Bomba',
      caudal: 'Caudal (L/min)',
      presion: 'Presión (bar/psi)',
      altura: 'Altura (m)',
      entrada: 'Entrada (pulgadas)',
      salida: 'Salida (pulgadas)',
      materialCuerpo: 'Material Cuerpo',
      tipoSello: 'Tipo de Sello',
    },
  },
  reductor: {
    label: 'Reductor / Motorreductor',
    fields: {
      relacion: 'Relación (Ratio)',
      torqueSalida: 'Torque Salida (Nm)',
      ejeSalida: 'Eje Salida (mm)',
      ejeEntrada: 'Eje Entrada (mm)',
      tipoReductor: 'Tipo (Helicoidal/Sin fin/Planetario)',
      posicionMontaje: 'Posición de Montaje',
    },
  },
  cinta: {
    label: 'Cinta Transportadora',
    fields: {
      anchoBanda: 'Ancho Banda (mm)',
      largoTotal: 'Largo Total (mm)',
      materialBanda: 'Material Banda',
      tipoBanda: 'Tipo de Banda',
      velocidad: 'Velocidad (m/min)',
      capacidad: 'Capacidad (kg/h)',
    },
  },
  valvula: {
    label: 'Válvula',
    fields: {
      tipoValvula: 'Tipo (Bola/Mariposa/Globo/Check)',
      diametro: 'Diámetro (pulgadas)',
      presionTrabajo: 'Presión de Trabajo (bar)',
      materialCuerpo: 'Material Cuerpo',
      tipoConexion: 'Tipo de Conexión',
      actuador: 'Tipo de Actuador',
    },
  },
  sensor: {
    label: 'Sensor / Instrumento',
    fields: {
      tipoSensor: 'Tipo (Temp/Presión/Flujo/Nivel/pH)',
      rangoMedicion: 'Rango de Medición',
      senalSalida: 'Señal Salida (4-20mA/0-10V/Digital)',
      conexionProceso: 'Conexión al Proceso',
      alimentacion: 'Alimentación (V)',
      precision: 'Precisión (%)',
    },
  },
  cilindro: {
    label: 'Cilindro Neumático/Hidráulico',
    fields: {
      tipoCilindro: 'Tipo (Neumático/Hidráulico)',
      diametroPiston: 'Diámetro Pistón (mm)',
      carrera: 'Carrera (mm)',
      presionMax: 'Presión Máx. (bar)',
      tipoMontaje: 'Tipo de Montaje',
      amortiguacion: 'Amortiguación',
    },
  },
  compresor: {
    label: 'Compresor',
    fields: {
      tipoCompresor: 'Tipo (Pistón/Tornillo/Centrífugo)',
      caudalAire: 'Caudal (CFM / m³/min)',
      presionMax: 'Presión Máx. (bar)',
      potenciaMotor: 'Potencia Motor (HP)',
      refrigerante: 'Refrigerante/Lubricante',
      volumenTanque: 'Volumen Tanque (L)',
    },
  },
  intercambiador: {
    label: 'Intercambiador de Calor',
    fields: {
      tipoIntercambiador: 'Tipo (Placas/Tubular/Carcasa)',
      capacidadTermica: 'Capacidad Térmica (kW)',
      flujoCaliente: 'Flujo Lado Caliente',
      flujoFrio: 'Flujo Lado Frío',
      materialPlacas: 'Material Placas/Tubos',
      conexiones: 'Conexiones (pulgadas)',
    },
  },
  filtro: {
    label: 'Filtro',
    fields: {
      tipoFiltro: 'Tipo (Bolsa/Cartucho/Prensa/Arena)',
      retencion: 'Tamaño Retención (μm)',
      caudalMax: 'Caudal Máx. (L/min)',
      materialCuerpo: 'Material Cuerpo',
      superficieFiltrado: 'Superficie Filtrado (m²)',
    },
  },
  general: {
    label: 'General / Otro',
    fields: {},
  },
}

/**
 * Normaliza los tipos legacy que quedaron guardados en Firestore antes de que los nombres
 * pasaran a español. Sin esto, una ficha vieja de bomba cae a «General» y pierde sus etiquetas.
 */
export function normalizarTipoFicha(t: string | undefined): string {
  if (t === 'pump') return 'bomba'
  if (t === 'conveyor') return 'cinta'
  return t || 'general'
}

/**
 * Cómo se llama ese dato en la ficha. Es la ÚNICA forma de etiquetar un campo estándar: así
 * el PDF imprime «Diámetro Pistón (mm)» y no «DIAMETROPISTON».
 *
 * Busca primero en la plantilla del tipo y después en los campos comunes. Si la clave no está
 * en ninguna (ficha vieja, dato importado), devuelve la clave tal cual para no perder el dato.
 */
export function etiquetaDeCampo(tipo: TechnicalDataType | string | undefined, clave: string): string {
  const plantilla = PLANTILLAS_FICHA[normalizarTipoFicha(tipo)] ?? PLANTILLAS_FICHA['general']!
  return plantilla.fields[clave] ?? CAMPOS_COMUNES[clave] ?? clave
}
