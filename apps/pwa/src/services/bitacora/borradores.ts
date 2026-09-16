import type { EventoBitacora, ImpactoEvento, TipoEvento } from './bitacora.types'

/**
 * Borradores y edición entre varios (mockup aprobado 16-09-2026).
 *
 * Un evento se guarda SOLO mientras se escribe, marcado `borrador`: lo ve todo
 * el turno y se puede terminar en otro equipo. No cuenta en ningún número ni
 * sale en el correo hasta que alguien toca «Listo».
 */

export function esBorrador(e: Pick<EventoBitacora, 'estado'>): boolean {
  return e.estado === 'borrador'
}

/** Los eventos publicados. TODO número, correo, PDF o entrega de turno parte de aquí. */
export function soloListos<T extends Pick<EventoBitacora, 'estado'>>(eventos: readonly T[]): T[] {
  return eventos.filter((e) => !esBorrador(e))
}

/**
 * ¿Hay algo que valga la pena guardar? Abrir la hoja y cerrarla sin escribir
 * no puede dejar un borrador vacío en la bitácora de todos.
 */
export function tieneContenido(d: { descripcion: string; equipo: string; fotos: readonly unknown[] }): boolean {
  return d.descripcion.trim().length > 0 || d.equipo.trim().length > 0 || d.fotos.length > 0
}

/**
 * Los campos del formulario en su forma de pantalla (todo texto), para poder
 * compararlos contra lo que llega del servidor sin falsos cambios (`null` vs `''`).
 */
export interface CamposFormulario {
  tipo: TipoEvento
  equipo: string
  equipoId: string | null
  descripcion: string
  horaInicio: string
  horaTermino: string
  impacto: ImpactoEvento
  minutos: string
  ventana: string
  pendiente: boolean
}

export type CampoFormulario = keyof CamposFormulario

export const ETIQUETA_CAMPO: Record<CampoFormulario, string> = {
  tipo: 'el tipo',
  equipo: 'el equipo',
  equipoId: 'el equipo',
  descripcion: '«Qué pasó»',
  horaInicio: 'la hora de inicio',
  horaTermino: 'la hora de término',
  impacto: 'el impacto',
  minutos: 'los minutos de parada',
  ventana: 'la ventana',
  pendiente: '«Queda pendiente»',
}

type EventoFormulario = Pick<
  EventoBitacora,
  'tipo' | 'equipo' | 'equipoId' | 'descripcion' | 'horaInicio' | 'horaTermino' | 'impacto' | 'minutosParada' | 'ventana' | 'pendiente'
>

export function aFormulario(e: EventoFormulario): CamposFormulario {
  return {
    tipo: e.tipo,
    equipo: e.equipo ?? '',
    equipoId: e.equipoId ?? null,
    descripcion: e.descripcion ?? '',
    horaInicio: e.horaInicio ?? '',
    horaTermino: e.horaTermino ?? '',
    impacto: e.impacto,
    minutos: e.minutosParada != null ? String(e.minutosParada) : '',
    ventana: e.ventana ?? '',
    pendiente: Boolean(e.pendiente),
  }
}

const CAMPOS: readonly CampoFormulario[] = [
  'tipo',
  'equipo',
  'equipoId',
  'descripcion',
  'horaInicio',
  'horaTermino',
  'impacto',
  'minutos',
  'ventana',
  'pendiente',
]

export interface Fusion {
  /** Lo que debe quedar en pantalla. */
  valores: CamposFormulario
  /** Lo último que se sabe del servidor (la nueva referencia). */
  base: CamposFormulario
  /**
   * Campos que los DOS cambiaron distinto: queda lo local en pantalla y se
   * avisa, con el valor del otro a mano para adoptarlo.
   */
  conflictos: CampoFormulario[]
}

/**
 * Fusión campo por campo entre lo que hay en pantalla y lo que llegó de otro
 * equipo, respecto de la última versión conocida del servidor (`base`):
 *
 * - el otro cambió y yo no toqué ese campo → se adopta lo suyo, sin preguntar;
 * - yo cambié y el otro no → queda lo mío;
 * - los dos cambiamos lo mismo → sin conflicto;
 * - los dos cambiamos distinto → queda lo mío en pantalla y se AVISA.
 *
 * Así «empezar en el celular y seguir en el PC» funciona aunque la hoja siga
 * abierta en el celular, y nadie pisa en silencio lo que escribió otro.
 */
export function fusionarFormulario(base: CamposFormulario, local: CamposFormulario, remoto: CamposFormulario): Fusion {
  const valores: CamposFormulario = { ...local }
  const nuevaBase: CamposFormulario = { ...base }
  const conflictos: CampoFormulario[] = []
  const escribir = (destino: CamposFormulario, campo: CampoFormulario, valor: CamposFormulario[CampoFormulario]) => {
    ;(destino as unknown as Record<string, unknown>)[campo] = valor
  }
  for (const campo of CAMPOS) {
    const b = base[campo]
    const l = local[campo]
    const r = remoto[campo]
    if (r === b) continue
    // El servidor cambió: esa es la nueva referencia.
    escribir(nuevaBase, campo, r)
    if (l === b || l === r) escribir(valores, campo, r)
    else conflictos.push(campo)
  }
  // El vínculo con la jerarquía va con el texto del equipo: si se adoptó el
  // equipo del otro, también su `equipoId`.
  if (valores.equipo === remoto.equipo && local.equipo !== remoto.equipo) valores.equipoId = remoto.equipoId
  return {
    valores,
    base: nuevaBase,
    // «equipo» y «equipoId» son un solo aviso para quien lee.
    conflictos: conflictos.filter((c) => c !== 'equipoId' || !conflictos.includes('equipo')),
  }
}
