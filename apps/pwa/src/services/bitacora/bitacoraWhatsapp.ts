import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { soloListos } from './borradores'
import { fuePendiente, gruposDelTurno, resumirBitacora } from './resumenBitacora'
import { etiquetaTurno, fechaTurnoLarga, formatoMinutos, horarioTurno } from './turnoMantencion'
import {
  capitalizarPrimera,
  etiquetaParada,
  etiquetaPendientes,
  lineaImpacto,
  lineaPendienteAnterior,
  type DatosCorreoBitacora,
} from './bitacoraCorreo'
import {
  codigoEquipoDe,
  encabezadoEvento,
  etiquetaTipo,
  lineaRepuestos,
  nombreConComun,
  normalizarRepuestos,
  tieneHora,
  tituloDe,
} from './presentacionEvento'

/**
 * Entre evento y evento del mensaje (17-09): con solo una línea en blanco, dos
 * eventos seguidos se leían como uno en la pantalla del teléfono.
 */
export const SEPARADOR_EVENTOS = '──────────'

/**
 * La bitácora para WhatsApp (decisión de Orel 16-09-2026): un MENSAJE con todo
 * el texto y una LÁMINA por evento con fotos (una imagen con las fotos, la hora,
 * el equipo y lo que se hizo).
 *
 * Por qué en piezas y no como el correo: un mensaje de WhatsApp es texto o una
 * imagen, nunca las dos intercaladas, y WhatsApp Web recibe UNA imagen por cada
 * Ctrl+V. Con la lámina, cada foto llega al chat con su contexto y se entiende
 * sola aunque se reenvíe.
 */

/** Hasta 4 fotos por lámina: con más, el evento sale en dos láminas. */
export const FOTOS_POR_LAMINA = 4

export interface LaminaWhatsapp {
  /** Cambia si cambia cualquier cosa que se dibuja: sirve para no redibujar de más. */
  clave: string
  evento: EventoBitacora
  fotos: FotoEvento[]
  /** Posición en el envío (desde 1) y total de láminas. */
  numero: number
  total: number
  /** Con más de 4 fotos el evento va en varias láminas: parte 1 de 2… */
  parte: number
  partes: number
  /** Va en el bloque «Pendiente para el turno siguiente». */
  pendiente: boolean
  /** El número del evento en el mensaje («2. EMPACADORA…»): la lámina lo repite. */
  numeroEvento: number
  /** "Turno tarde 16-09" y la planta, para la cabecera y el pie. */
  turnoCorto: string
  planta: string
}

const ORDEN_FOTO = { antes: 0, despues: 1, foto: 2 } as const

/** Antes y después juntos y en ese orden, como en el correo. */
export function fotosOrdenadas(fotos: readonly FotoEvento[]): FotoEvento[] {
  return [...fotos].sort((a, b) => ORDEN_FOTO[a.etiqueta] - ORDEN_FOTO[b.etiqueta])
}

/** Los eventos publicados en el orden del mensaje: lo hecho y después lo pendiente. */
function eventosDelMensaje(turno: TurnoMantencion, eventos: readonly EventoBitacora[]): EventoBitacora[] {
  const { hechos, pendientes } = gruposDelTurno(turno, eventos)
  return [...hechos, ...pendientes]
}

export function turnoCorto(turno: TurnoMantencion): string {
  return `${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().slice(0, 2).join('-')}`
}

/** Las láminas del envío: una por evento con fotos (dos o más si tiene más de 4). */
export function planLaminas({ turno, eventos, planta }: Pick<DatosCorreoBitacora, 'turno' | 'eventos' | 'planta'>): LaminaWhatsapp[] {
  const piezas: Array<Omit<LaminaWhatsapp, 'clave' | 'numero' | 'total'>> = []
  const corto = turnoCorto(turno)
  const delMensaje = eventosDelMensaje(turno, eventos)
  for (const [indice, evento] of delMensaje.entries()) {
    const fotos = fotosOrdenadas(evento.fotos ?? [])
    const partes = Math.ceil(fotos.length / FOTOS_POR_LAMINA)
    for (let i = 0; i < partes; i++) {
      piezas.push({
        evento,
        fotos: fotos.slice(i * FOTOS_POR_LAMINA, (i + 1) * FOTOS_POR_LAMINA),
        parte: i + 1,
        partes,
        pendiente: fuePendiente(evento),
        numeroEvento: indice + 1,
        turnoCorto: corto,
        planta,
      })
    }
  }
  return piezas.map((p, i) => ({
    ...p,
    numero: i + 1,
    total: piezas.length,
    clave: JSON.stringify([
      i + 1,
      piezas.length,
      p.turnoCorto,
      p.planta,
      p.evento.id,
      p.parte,
      p.partes,
      p.pendiente,
      p.numeroEvento,
      encabezadoEvento(p.evento),
      lineaImpacto(p.evento),
      p.evento.descripcion ?? '',
      tecnicosDelEvento(p.evento).join(', '),
      autorVisible(p.evento),
      codigoEquipoDe(p.evento),
      lineaRepuestos(p.evento),
      p.fotos.map((f) => [f.path, f.etiqueta]),
    ]),
  }))
}

/** "lámina 1" / "láminas 2 y 3". */
export function referenciaLaminas(numeros: readonly number[]): string {
  if (numeros.length <= 1) return `lámina ${numeros[0] ?? ''}`.trim()
  return `láminas ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
}

/**
 * Negrita o cursiva de WhatsApp. Un `*` o `_` dentro del texto cortaría el
 * formato a la mitad: se cambia por un carácter que se ve igual.
 */
function marcar(texto: string, marca: '*' | '_'): string {
  const limpio = texto.trim().replace(/\*/g, '∗').replace(/_/g, '‗')
  return limpio ? `${marca}${limpio}${marca}` : ''
}

/** El nombre de archivo de una lámina al compartirla desde el celular. */
export function nombreArchivoLamina(turno: TurnoMantencion, lamina: Pick<LaminaWhatsapp, 'numero'>, extension = 'jpg'): string {
  return `bitacora-${turno.fecha}-${turno.banda}-${String(lamina.numero).padStart(2, '0')}.${extension}`
}

/**
 * Código, hora o número en `monoespaciado`: además de verse ordenado, evita que
 * el teléfono lo convierta en enlace (horas subrayadas, números largos como
 * teléfono). Una comilla invertida dentro lo cortaría: se cambia por una igual.
 */
function codigo(texto: string): string {
  const limpio = texto.trim().replace(/`/g, 'ˋ')
  return limpio ? `\`${limpio}\`` : ''
}

/** Números de 8 o más dígitos del texto del técnico, en monoespaciado (no quedan como teléfono). */
export function protegerNumeros(texto: string): string {
  return texto.replace(/(^|[^\w`])(\d{8,})(?=$|[^\w`])/g, (_, antes: string, n: string) => `${antes}\`${n}\``)
}

/** "18:07–18:30" o "18:07" (sin hora: vacío). */
function horaCorta(e: EventoBitacora): string {
  if (!tieneHora(e)) return ''
  return e.horaTermino ? `${e.horaInicio}–${e.horaTermino}` : e.horaInicio
}

/**
 * El mensaje de WhatsApp (formato A2, mockup aprobado por Orel 17-09-2026):
 * secciones en mayúscula y negrita (WhatsApp no tiene tamaños de letra),
 * resumen en viñetas, eventos numerados con lo que escribió el técnico en una
 * cita, horas y códigos en monoespaciado y una línea divisoria con aire entre
 * evento y evento. Cada evento con fotos dice en qué lámina están.
 */
export function bitacoraATextoWhatsapp(datos: DatosCorreoBitacora, laminas: readonly LaminaWhatsapp[] = planLaminas(datos)): string {
  const { turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [] } = datos
  const eventos = soloListos(todos)
  const r = resumirBitacora(eventos)
  const ordenados = eventosDelMensaje(turno, eventos)
  const hechos = ordenados.filter((e) => !fuePendiente(e))
  const pendientes = ordenados.filter(fuePendiente)
  const numeroDe = new Map(ordenados.map((e, i) => [e.id, i + 1]))

  const numeros = new Map<string, number[]>()
  for (const l of laminas) numeros.set(l.evento.id, [...(numeros.get(l.evento.id) ?? []), l.numero])

  const bloque = (e: EventoBitacora) => {
    const equipo = e.equipo?.trim() ?? ''
    const titulo = tituloDe(e)
    const principal = equipo || titulo || etiquetaTipo(e)
    const hora = horaCorta(e)
    const cod = codigoEquipoDe(e)
    const descripcion = (e.descripcion ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `> ${protegerNumeros(l)}`)
    const repuestos = normalizarRepuestos(e.repuestos)
    const tecnicosEvento = tecnicosDelEvento(e)
    return [
      `${marcar(`${numeroDe.get(e.id) ?? ''}. ${principal}`, '*')}${hora ? ` · ${codigo(hora)}` : ''}`,
      equipo && titulo ? marcar(titulo, '*') : '',
      marcar(lineaImpacto(e), '_'),
      cod ? `${/^\d+$/.test(cod) ? 'N° de equipo' : 'Ubicación técnica'} ${codigo(cod)}` : '',
      ...descripcion,
      ...(repuestos.length
        ? // Nombre común y, entre paréntesis, el del maestro SAP (pedido de Orel 17-09: bodega busca por ese).
          ['Repuestos usados:', ...repuestos.map((x) => `- ${codigo(x.codigoSAP)} ${nombreConComun(x)} ×${x.cantidad}`.replace(/\s+×/, ' ×'))]
        : []),
      tecnicosEvento.length ? `Técnicos: ${tecnicosEvento.join(', ')}` : '',
      e.fotos?.length
        ? `Fotos: ${e.fotos.length}${numeros.has(e.id) ? ` · ${referenciaLaminas(numeros.get(e.id) ?? [])}` : ''}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  const entreEventos = `\n\n${SEPARADOR_EVENTOS}\n\n`

  const cabecera = [
    marcar('BITÁCORA DE MANTENCIÓN', '*'),
    marcar(`${etiquetaTurno(turno)} · ${capitalizarPrimera(fechaTurnoLarga(turno))}`, '*'),
    `${codigo(horarioTurno(turno).replace(/\s*–\s*/, '–'))} · ${planta}`,
    tecnicos.length ? `Técnicos: ${tecnicos.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const resumen = [
    marcar('RESUMEN', '*'),
    `- ${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'}`,
    `- ${formatoMinutos(r.minutosParada)} ${etiquetaParada(r)}${r.mttrMin != null ? ` · MTTR ${formatoMinutos(r.mttrMin)}` : ''}`,
    `- ${r.enVentana} sin detener producción`,
    `- ${r.pendientesDelTurno} ${etiquetaPendientes(r)}`,
    ...(r.pendientesCerrados > 0
      ? [`- ${r.pendientesCerrados} ${r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados'}`]
      : []),
  ].join('\n')

  const partes: string[] = [cabecera]
  if (!eventos.length) partes.push('Sin eventos registrados en el turno.')
  else partes.push(resumen)
  if (observacion?.trim()) {
    partes.push([marcar('OBSERVACIONES DEL TURNO', '*'), ...observacion.trim().split(/\r?\n/).filter((l) => l.trim()).map((l) => `> ${l.trim()}`)].join('\n'))
  }
  if (hechos.length) partes.push(`${marcar('EVENTOS DEL TURNO', '*')}\n\n${hechos.map(bloque).join(entreEventos)}`)
  if (pendientes.length) {
    if (hechos.length) partes.push(SEPARADOR_EVENTOS)
    partes.push(`${marcar('PENDIENTE PARA EL TURNO SIGUIENTE', '*')}\n\n${pendientes.map(bloque).join(entreEventos)}`)
  }
  if (pendientesAnteriores.length) {
    if (ordenados.length) partes.push(SEPARADOR_EVENTOS)
    partes.push([marcar('SIGUE PENDIENTE DE TURNOS ANTERIORES', '*'), ...pendientesAnteriores.map((e) => `- ${protegerNumeros(lineaPendienteAnterior(e))}`)].join('\n'))
  }
  return partes.join('\n\n')
}
