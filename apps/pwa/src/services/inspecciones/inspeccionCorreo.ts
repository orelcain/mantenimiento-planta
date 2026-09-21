import { C, FUENTE, escaparHtml, htmlFotos } from '@/services/bitacora/bitacoraCorreo'
import { etiquetaTurno, fechaTurnoLarga, horarioTurno } from '@/services/bitacora/turnoMantencion'
import { codigoEquipoDe, horarioEvento, tituloDe } from '@/services/bitacora/presentacionEvento'
import { autorVisible, type EventoBitacora, type FotoEvento, type TurnoMantencion } from '@/services/bitacora/bitacora.types'
import {
  TEXTO_LIBERACION,
  frasePorLiberacion,
  titularLiberacion,
  type CriterioPauta,
  type Inspeccion,
  type PautaInspeccion,
  type ResultadoCriterio,
  type ResumenInspeccion,
} from './modeloInspeccion'

/**
 * La inspección de planta como cuerpo de correo, con el MISMO formato que la bitácora del
 * turno (Orel, 21-09-2026: «debe generarse como se genera en turno»). Reusa sus colores,
 * tipografía y bloques desde `bitacoraCorreo`, así que las dos se ven de la misma familia y
 * pegan igual en Outlook: todo el estilo en línea y la estructura en `<table>`.
 *
 * El contenido sigue el procedimiento, no el gusto:
 *  - §10 «Criterio de liberación» → la tabla de los 7 puntos con Conforme / No conforme.
 *  - §8 «Registro de desviaciones» → una fila por desviación con las SEIS columnas que pide:
 *    equipo o área · descripción · condición encontrada · acción realizada o pendiente ·
 *    responsable · estado.
 *  - §9/§10 «Resultado final» → el recuadro de cierre con hora y responsable.
 */

export interface DatosCorreoInspeccion {
  inspeccion: Inspeccion
  pauta: PautaInspeccion
  resumen: ResumenInspeccion
  desviaciones: readonly EventoBitacora[]
  turno: TurnoMantencion
  planta: string
  /**
   * Por defecto las fotos van por URL (Outlook clásico las descarga al pegar). La variante
   * incrustada en base64 existe solo para Outlook nuevo/web, que sí las acepta.
   */
  fuenteFoto?: (foto: FotoEvento) => string
}

const abierta = (e: EventoBitacora) => e.pendiente && !e.cierre

/** De qué se compone el registro §8, para su fila de cierre. Un cero no se nombra. */
function cierreDesviaciones(r: ResumenInspeccion): string {
  if (!r.pendientes) return 'todas resueltas antes de entregar'
  const abiertas = `${r.pendientes} ${r.pendientes === 1 ? 'abierta' : 'abiertas'} al entregar`
  const resueltas = r.desviaciones - r.pendientes
  return resueltas ? `${resueltas} ${resueltas === 1 ? 'resuelta' : 'resueltas'} · ${abiertas}` : abiertas
}

/**
 * La forma del documento, decidida contra el catálogo de tics de la IA y la tradición del
 * PROTOCOLO DE ENSAYO (Orel, 21-09-2026: «primero establezcamos qué es un estilo hecho por IA
 * y reemplacémoslo por estilos profesionales ya comprobados»). Las seis reglas:
 *
 * 1. **Retícula de 12.** Todo ancho de columna es un número entero de doceavos. Seis anchos
 *    improvisados es lo que delata una tabla generada.
 * 2. **Tres filetes por tabla**, nunca verticales: uno grueso bajo el encabezado, uno fino
 *    entre filas y uno sobre la fila de cierre. La reja de cuatro bordes por celda es el tic;
 *    quitarlos todos —lo que hice en la pasada anterior— es el tic opuesto y pierde la
 *    estructura (Tufte: borrar la tinta que no es dato, no la que sí lo es).
 * 3. **Cuatro cuerpos y nada intermedio.** Dos tamaños que hay que medir para distinguirlos
 *    son uno de más (Bringhurst).
 * 4. **Color solo donde codifica** un estado. Ni fondos de sección, ni cifras pintadas.
 * 5. **Ninguna caja de color.** La conclusión se anuncia con filete y cuerpo mayor, como el
 *    total de una factura; la advertencia, con un rótulo en negrita al principio del párrafo.
 *    La tarjeta con barra de color a la izquierda es el bloque de nota de la documentación
 *    técnica web, y es el tic más reconocible de un HTML escrito por un modelo.
 * 6. **El espacio es la estructura**: 28 px sobre una sección dicen que empieza una sección
 *    mejor que una banda de color.
 *
 * La prueba de humo: en blanco y negro tiene que seguir teniendo jerarquía. Si sin el color
 * se vuelve una lista plana, el color estaba haciendo el trabajo de la tipografía.
 */
const TITULO = '21px'
const TEXTO = '14px'
const SEC = '11px'
const ROTULO = '10.5px'
/** Filete fino entre filas; el grueso y el de cierre van en tinta. */
const RAYA = '#ECECEC'
const CELDA =
  `padding:10px 14px 10px 0;border-bottom:1px solid ${RAYA};font-family:${FUENTE};font-size:${TEXTO};` +
  `line-height:1.5;color:${C.tinta};vertical-align:top;`
/** Un doceavo del ancho útil. Las columnas ocupan tracks enteros, no porcentajes inventados. */
const track = (n: number) => `${((n / 12) * 100).toFixed(4)}%`

/**
 * `HH:mm` de un ISO, o cadena vacía si no hay hora.
 *
 * ⚠ Vacío, NO un guion ni la hora de ahora: si el punto se marcó sin hora, el correo no
 * inventa una (Orel, 21-09-2026). Quien lee tiene que poder distinguir «se revisó a las 04:16»
 * de «se revisó, no sabemos a qué hora».
 */
function hora(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function tituloCorreoInspeccion({ turno, planta }: Pick<DatosCorreoInspeccion, 'turno' | 'planta'>): string {
  return `Inspección de planta post-aseo · ${planta} · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}`
}

/**
 * El estado, como un punto de color y su palabra. Antes cada celda iba pintada entera: seis
 * bloques de color por tabla, que es lo que le da a un documento ese aire de tablero generado
 * en serie. El color marca, la palabra dice — igual que los KPI de la bitácora, que ya llevan
 * el punto en el rótulo y la cifra en tinta
 * (HIG «Color»: https://developer.apple.com/design/human-interface-guidelines/color).
 */
function celdaTono(texto: string, color: string, ancho?: string): string {
  return (
    `<td style="${CELDA}white-space:nowrap;${ancho ? `width:${ancho};` : ''}">` +
    `<span style="color:${color};">●</span> ${texto}</td>`
  )
}

/** La fila de cierre: el «total» del protocolo. Dice de qué se compone el resultado. */
function filaCierre(columnas: number, izquierda: string, derecha: string): string {
  const td = `padding:11px 14px 0 0;border-top:1px solid ${C.tinta};font-family:${FUENTE};font-size:${SEC};color:${C.sec};vertical-align:top;`
  return (
    `<tr><td style="${td}">${escaparHtml(izquierda)}</td>` +
    `<td colspan="${columnas - 1}" style="${td}">${escaparHtml(derecha)}</td></tr>`
  )
}

/** El estado del punto con el color que le toca. */
function celdaEstado(estado: ResultadoCriterio | undefined, ancho?: string): string {
  const [texto, color] =
    estado === 'conforme'
      ? ['Conforme', C.ventana]
      : // Se encontró algo y se resolvió antes de entregar: libera, pero no es lo mismo que
        // un punto que estaba bien (§8, «corregidas o controladas antes de la puesta en marcha»).
        estado === 'corregido'
        ? ['Corregido', C.afectado]
        : // La otra mitad de §8: sigue mal, pero opera con una medida transitoria.
          estado === 'controlado'
          ? ['Controlado', C.pendBorde]
          : estado === 'no-conforme'
            ? ['No conforme', C.parada]
            : ['Sin revisar', C.sec]
  return celdaTono(texto, color, ancho)
}

/**
 * El estado de una DESVIACIÓN (§8). Antes decía «No conforme» en todas, incluso en las ya
 * resueltas: la columna no estaba diciendo nada. Sale de lo que el evento y su punto guardan.
 */
function estadoDesviacion(e: EventoBitacora, inspeccion: Inspeccion): string {
  const [texto, color] = !abierta(e)
    ? ['Resuelta', C.ventana]
    : inspeccion.resultados[e.inspeccion?.criterioId ?? ''] === 'controlado'
      ? ['Controlada', C.pendBorde]
      : ['Pendiente', C.parada]
  return `<span style="color:${color};">●</span> ${texto}`
}

/**
 * El punto de la pauta con lo que cubre, en cinco palabras, debajo. «Sistema eléctrico» a
 * secas no le dice nada a quien no recorrió la pauta; el texto completo del procedimiento
 * dentro de la celda multiplica por cuatro el alto de la tabla. El completo va al pie.
 */
function celdaPunto(c: CriterioPauta, ancho: string): string {
  return (
    `<td style="${CELDA}width:${ancho};">${escaparHtml(c.titulo)}` +
    (c.resumen ? `<div style="font-size:${SEC};line-height:1.4;color:${C.sec};padding-top:2px;">${escaparHtml(c.resumen)}</div>` : '') +
    `</td>`
  )
}

/** Una hora: cifras tabulares para que las columnas se lean en vertical (HIG «Typography»). */
function celdaHora(hhmm: string, ancho: string): string {
  return (
    `<td style="${CELDA}color:${C.sec};white-space:nowrap;font-variant-numeric:tabular-nums;width:${ancho};">` +
    `${escaparHtml(hhmm)}</td>`
  )
}

/** Una celda cuyo contenido ya viene armado (para meterle más de una línea). */
function celdaHtml(html: string, ancho?: string): string {
  return `<td style="${CELDA}${ancho ? `width:${ancho};` : ''}">${html}</td>`
}

function encabezadoTabla(columnas: readonly string[]): string {
  return (
    `<tr>${columnas
      .map(
        (t) =>
          `<th align="left" style="padding:0 14px 8px 0;border-bottom:1.5px solid ${C.tinta};` +
          `font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.07em;text-transform:uppercase;` +
          `color:${C.sec};">${escaparHtml(t)}</th>`,
      )
      .join('')}</tr>`
  )
}

/** El encabezado de una sección: un rótulo, y 28 px de aire encima. Nunca una banda de color. */
function seccion(titulo: string, cantidad?: number): string {
  return (
    `<div style="font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.09em;` +
    `text-transform:uppercase;color:${C.sec};margin-top:28px;">${escaparHtml(titulo)}` +
    (cantidad != null ? ` <span style="color:${C.tinta};">${cantidad}</span>` : '') +
    `</div>`
  )
}

/** Una cifra con su rótulo. Sin caja: el número pesa por tamaño, no por borde. */
function kpi(valor: string, etiqueta: string): string {
  return (
    `<td style="padding:0 34px 0 0;vertical-align:top;font-family:${FUENTE};">` +
    `<div style="font-size:${TITULO};font-weight:600;line-height:1.2;color:${C.tinta};white-space:nowrap;` +
    `font-variant-numeric:tabular-nums;">${escaparHtml(valor)}</div>` +
    `<div style="font-size:${SEC};color:${C.sec};padding-top:4px;white-space:nowrap;">${escaparHtml(etiqueta)}</div></td>`
  )
}

/**
 * Una advertencia: rótulo en negrita al principio del párrafo, bajo un filete. Antes era una
 * tarjeta con fondo tenue y barra de color a la izquierda — el tic n.º 1.
 */
function nota(html: string): string {
  return (
    `<div style="font-family:${FUENTE};border-top:1px solid ${C.linea};margin-top:16px;padding-top:12px;` +
    `font-size:${TEXTO};line-height:1.5;color:${C.tinta};">${html}</div>`
  )
}

/**
 * «Acción realizada o pendiente» (§8). No se inventa: sale de lo que el evento ya guarda —
 * si está resuelto, con cuánto tardó; si no, que queda para el turno siguiente.
 */
function accionDe(e: EventoBitacora, inspeccion: Inspeccion): string {
  if (abierta(e)) {
    return inspeccion.resultados[e.inspeccion?.criterioId ?? ''] === 'controlado'
      ? 'Contingencia aplicada. Falta la solución final, queda para el turno siguiente'
      : 'Pendiente, queda para el turno siguiente'
  }
  const h = horarioEvento(e)
  return h ? `Resuelta (${h})` : 'Resuelta'
}

export function inspeccionAHtmlCorreo({ inspeccion, pauta, resumen: vivo, desviaciones, turno, planta, fuenteFoto }: DatosCorreoInspeccion): string {
  const l = inspeccion.liberacion
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  // Entregada: manda la FOTO de ese momento. Sin foto (entregas anteriores a este cambio) o
  // sin entregar todavía, el resumen en vivo.
  const resumen = l?.resumen ?? vivo
  const cambios = l?.resumen ? cambiosDesdeLaEntrega(l.resumen, vivo) : ''

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${C.sec};">` +
    `${escaparHtml(pauta.nombre)} · ${escaparHtml(planta)}</div>` +
    `<div style="font-family:${FUENTE};font-size:${TITULO};font-weight:600;line-height:1.2;color:${C.tinta};padding-top:4px;">` +
    `${escaparHtml(etiquetaTurno(turno))} · ${escaparHtml(fechaTurnoLarga(turno))}</div>` +
    `<div style="font-family:${FUENTE};font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:4px;">` +
    `${escaparHtml(horarioTurno(turno).replace('–', 'a'))} · Realizada por ${escaparHtml(inspeccion.iniciadaPorNombre)}` +
    `${hora(inspeccion.iniciadaEn) ? ` · Inicio ${hora(inspeccion.iniciadaEn)}` : ''} · Pauta v${inspeccion.pautaVersion}</div>`

  /**
   * La cabecera de cifras dice lo que la fila de cierre de la tabla NO dice. El desglose por
   * estado (5 conformes, 1 corregido, 1 controlado) es el «total» de la tabla y vive ahí:
   * repetirlo acá arriba era la duplicación que deja a los dos bloques diciendo lo mismo.
   */
  const kpis = [
    kpi(`${resumen.revisados} de ${resumen.total}`, 'puntos revisados'),
    resumen.desviaciones > 0 ? kpi(String(resumen.desviaciones), resumen.desviaciones === 1 ? 'desviación' : 'desviaciones') : '',
    // La CORRIDA: lo que se alcanzó a arreglar antes de entregar. Es el trabajo que no se ve.
    resumen.minutosDeCorrida != null ? kpi(`${resumen.minutosDeCorrida} min`, 'corrigiendo antes de arrancar') : '',
    resumen.minutosDeRecorrido ? kpi(`${resumen.minutosDeRecorrido} min`, 'de recorrido') : '',
  ].join('')

  /**
   * Las desviaciones ordenadas POR PUNTO DE LA PAUTA. Un punto puede tener varias, y hasta
   * ahora el correo las tiraba todas en una lista suelta: «Sistema eléctrico: No conforme» con
   * la observación vacía arriba, y abajo un evento que no se sabía de dónde salía
   * (Orel, 21-09-2026). Van enlazadas en los dos sentidos.
   */
  const porCriterio = new Map<string, EventoBitacora[]>()
  for (const e of desviaciones) {
    const k = e.inspeccion?.criterioId ?? ''
    porCriterio.set(k, [...(porCriterio.get(k) ?? []), e])
  }
  /** Las que no calzan con ningún punto (la pauta cambió, o el evento llegó sin criterio). */
  const sueltas = desviaciones.filter((e) => !pauta.criterios.some((c) => c.id === e.inspeccion?.criterioId))

  /**
   * Las fichas numeradas en el orden en que se imprimen: por punto de la pauta, las sueltas al
   * final. El número es lo que deja que el criterio de liberación apunte a su ficha sin
   * repetir el nombre del equipo tres centímetros más arriba de la ficha misma.
   */
  const numeroDe = new Map<string, number>()
  const numeroDeFicha = new Map<string, number[]>()
  ;[
    ...pauta.criterios.flatMap((c) => (porCriterio.get(c.id) ?? []).map((e) => ({ criterioId: c.id, e }))),
    ...sueltas.map((e) => ({ criterioId: '', e })),
  ].forEach(({ criterioId, e }, i) => {
    numeroDe.set(e.id, i + 1)
    numeroDeFicha.set(criterioId, [...(numeroDeFicha.get(criterioId) ?? []), i + 1])
  })

  // §10 · Criterio de liberación. La columna Hora solo existe si ALGÚN punto tiene hora: una
  // columna entera de guiones no informa, estorba.
  const hayHoras = pauta.criterios.some((c) => hora(inspeccion.marcas?.[c.id]))
  const filasCriterios = pauta.criterios
    .map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      const nums = numeroDeFicha.get(c.id) ?? []
      // La observación del punto no puede quedar en blanco cuando SÍ hubo algo: si no se
      // escribió una nota, lo dice la referencia a la ficha del registro. Numerada, porque
      // repetir el nombre del equipo tres centímetros más arriba de su propia ficha sobra.
      const cuerpo =
        [
          nota ? `<div>${escaparHtml(nota)}</div>` : '',
          nums.length
            ? `<div style="font-size:${SEC};color:${C.sec};${nota ? 'padding-top:4px;' : ''}">` +
              `${nums.length === 1 ? 'Desviación' : 'Desviaciones'} ${nums.join(', ')} del registro</div>`
            : '',
        ]
          .filter(Boolean)
          .join('')
      return (
        // 4 + 2 (+1) + 5 o 6 tracks: la suma es 12 siempre.
        `<tr>${celdaPunto(c, track(4))}${celdaEstado(inspeccion.resultados[c.id], track(2))}` +
        (hayHoras ? celdaHora(hora(inspeccion.marcas?.[c.id]), track(1)) : '') +
        celdaHtml(cuerpo, track(hayHoras ? 5 : 6)) +
        `</tr>`
      )
    })
    .join('')

  /** De qué se compone el «7 de 7»: el total de la tabla, no un adorno. */
  const desglose = [
    resumen.conformes ? `${resumen.conformes} ${resumen.conformes === 1 ? 'conforme' : 'conformes'}` : '',
    resumen.corregidos ? `${resumen.corregidos} ${resumen.corregidos === 1 ? 'corregido' : 'corregidos'}` : '',
    resumen.controlados ? `${resumen.controlados} ${resumen.controlados === 1 ? 'controlado' : 'controlados'}` : '',
    resumen.noConformes ? `${resumen.noConformes} sin resolver` : '',
    resumen.total - resumen.revisados ? `${resumen.total - resumen.revisados} sin revisar` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const tablaCriterios =
    seccion('Criterio de liberación') +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
    encabezadoTabla(['Punto de la pauta', 'Estado', ...(hayHoras ? ['Hora'] : []), 'Observación']) +
    filasCriterios +
    filaCierre(hayHoras ? 4 : 3, `${resumen.total} ${resumen.total === 1 ? 'punto' : 'puntos'}`, desglose) +
    `</table>`

  /**
   * §8 · Registro de desviaciones. Deja de ser una tabla de SEIS columnas y pasa a ser una
   * FICHA por desviación, con los seis campos rotulados (Orel, 21-09-2026).
   *
   * El procedimiento pide seis datos, no seis columnas. En 680 px, seis columnas dejaban la
   * condición encontrada —que es la sustancia— en una caja de veinte caracteres de ancho: una
   * fila de ocho líneas con cinco columnas casi vacías al lado. La hoja 3 del estándar pide
   * entre 45 y 90 caracteres por línea; así la condición se lee en cuatro líneas anchas.
   * Es la forma del protocolo de ensayo: cada hallazgo es un registro numerado con sus campos
   * al lado, no una fila de planilla.
   */
  const ficha = (e: EventoBitacora, n: number) => {
    const equipo = [e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')
    const campo = (rotulo: string, valor: string) =>
      `<tr><td style="padding:3px 14px 3px 0;font-family:${FUENTE};font-size:${SEC};color:${C.sec};` +
      `vertical-align:top;width:${track(2)};">${escaparHtml(rotulo)}</td>` +
      `<td style="padding:3px 0;font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.tinta};` +
      `vertical-align:top;">${escaparHtml(valor)}</td></tr>`
    // El encabezado de la ficha: número y equipo a la izquierda, estado a la derecha, sobre
    // el mismo eje que el resto del documento.
    const cabecera =
      `<tr><td colspan="2" style="padding:16px 0 6px;font-family:${FUENTE};">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">` +
      `<tr><td style="font-family:${FUENTE};font-size:${TEXTO};font-weight:600;color:${C.tinta};vertical-align:top;">` +
      `<span style="color:${C.sec};font-weight:400;font-variant-numeric:tabular-nums;">${n}</span>&nbsp;&nbsp;${escaparHtml(equipo)}</td>` +
      `<td align="right" style="font-family:${FUENTE};font-size:${TEXTO};color:${C.tinta};white-space:nowrap;vertical-align:top;">` +
      `${estadoDesviacion(e, inspeccion)}</td></tr></table></td></tr>`
    const fotos = (e.fotos ?? []).length
      ? // La «condición encontrada» se ve mejor que se cuenta: antes y después van juntos.
        `<tr><td colspan="2" style="padding:8px 0 4px;">${htmlFotos(e.fotos ?? [], fuente)}</td></tr>`
      : ''
    return (
      cabecera +
      campo('Anomalía', tituloDe(e) || e.descripcion) +
      campo('Condición', e.descripcion) +
      campo('Acción', accionDe(e, inspeccion)) +
      campo('Responsable', autorVisible(e)) +
      fotos +
      `<tr><td colspan="2" style="padding:0;border-bottom:1px solid ${RAYA};font-size:0;line-height:0;">&nbsp;</td></tr>`
    )
  }

  const grupo = (titulo: string, cuantas: number) =>
    // En formato oración, no en versalitas: el rótulo en versalitas ya lo usa la SECCIÓN, y dos
    // niveles de versalitas apilados son el tic n.º 6. Este es un encabezado de contenido.
    `<tr><td colspan="2" style="padding:22px 0 8px;border-bottom:1.5px solid ${C.tinta};` +
    `font-family:${FUENTE};font-size:${TEXTO};font-weight:600;color:${C.tinta};">${escaparHtml(titulo)}` +
    `<span style="font-weight:400;color:${C.sec};"> · ${cuantas} ${cuantas === 1 ? 'desviación' : 'desviaciones'}</span></td></tr>`

  const numerada = (e: EventoBitacora) => ficha(e, numeroDe.get(e.id) ?? 0)
  const filasDesviaciones =
    pauta.criterios
      .map((c) => {
        const suyas = porCriterio.get(c.id) ?? []
        return suyas.length ? grupo(c.titulo, suyas.length) + suyas.map(numerada).join('') : ''
      })
      .join('') +
    (sueltas.length ? grupo('Sin punto de la pauta', sueltas.length) + sueltas.map(numerada).join('') : '') +
    filaCierre(
      2,
      `${desviaciones.length} ${desviaciones.length === 1 ? 'desviación' : 'desviaciones'}`,
      cierreDesviaciones(resumen),
    )

  const tablaDesviaciones = desviaciones.length
    ? seccion('Registro de desviaciones', desviaciones.length) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:4px;">` +
      filasDesviaciones +
      `</table>`
    : seccion('Registro de desviaciones') +
      `<p style="font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.sec};margin:10px 0 0;">` +
      (resumen.noConformesSinDesviacion
        ? // Decirlo es lo unico honesto: el punto quedo abierto y no se anoto nada.
          `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} sin resolver y sin una desviación anotada. Ver el criterio de liberación, arriba.`
        : 'Sin desviaciones detectadas durante la inspección.') +
      `</p>`

  const sinJuzgar = resumen.sinEvaluar
    ? nota(
        `<b style="font-weight:600;">Sin evaluar.</b> ${resumen.sinEvaluar} ${resumen.sinEvaluar === 1 ? 'desviación abierta no calza' : 'desviaciones abiertas no calzan'} con ningún equipo del diagrama de líneas, ` +
          `así que no se sabe si ${resumen.sinEvaluar === 1 ? 'detiene' : 'detienen'} una línea.`,
      )
    : ''

  const aviso = resumen.pendientesCriticos
    ? nota(
        `<b style="font-weight:600;color:${C.parada};">Atención.</b> ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.`,
      )
    : ''

  // §10 · Resultado final.
  /**
   * El cierre del documento. Filete grueso, titular en el cuerpo mayor y, bajo otro filete, la
   * firma: quién entregó y a qué hora. Es la forma del «Resultado» de un protocolo de ensayo y
   * del total de una factura. Antes era una caja verde con barra de color — el tic n.º 1.
   * El único color que queda es el punto de estado, porque ahí sí codifica.
   */
  const cierre = (punto: string, titular: string, cuerpo: string, firma: string) =>
    `<div style="font-family:${FUENTE};border-top:2px solid ${C.tinta};margin-top:10px;padding-top:14px;">` +
    `<div style="font-size:${TITULO};font-weight:600;line-height:1.25;color:${C.tinta};">` +
    `<span style="color:${punto};">●</span> ${escaparHtml(titular)}</div>` +
    `<div style="font-size:${TEXTO};line-height:1.5;color:${C.tinta};padding-top:7px;">${cuerpo}</div>` +
    (firma
      ? `<div style="font-size:${SEC};color:${C.sec};border-top:1px solid ${C.linea};margin-top:13px;padding-top:11px;">${escaparHtml(firma)}</div>`
      : '') +
    `</div>`

  const resultado = l
    ? seccion('Resultado final') +
      cierre(
        l.estado === 'no-liberada' ? C.parada : C.ventana,
        titularLiberacion(l.estado),
        `<b style="font-weight:600;">${escaparHtml(TEXTO_LIBERACION[l.estado].titulo)}.</b> ${escaparHtml(frasePorLiberacion(l.estado, resumen))}`,
        `Entregada${hora(l.en) ? ` a las ${hora(l.en)}` : ''} · ${l.porNombre}${l.nota ? ` · ${l.nota}` : ''} · Mantención`,
      )
    : // Sin entrega marcada el correo NO puede decir que la planta está entregada; pero tampoco
      // puede quedarse en una frase gris que se lee como «la planta está parada». Es un aviso
      // al que lo está por enviar: falta un paso en la app (Orel, 21-09-2026).
      seccion('Resultado final') +
      cierre(
        C.pendBorde,
        'Falta marcar la entrega de la planta',
        'El recorrido está registrado; todavía no se dice en qué condición quedó la planta al pasar a Producción. ' +
          'Se marca en la app, en «Liberación de planta».',
        '',
      )

  /**
   * Qué hay DETRÁS de cada punto. «Sistema eléctrico: Conforme» no le dice nada a quien no
   * recorrió la pauta; el procedimiento sí lo detalla (§§3-7). Va al final y en letra chica:
   * es material de consulta para el que quiera verificar qué se revisó, no parte del resumen
   * (Orel, 21-09-2026).
   */
  const queSeRevisa =
    `<div style="font-family:${FUENTE};border-top:1px solid ${C.linea};margin-top:34px;padding-top:16px;">` +
    `<div style="font-size:${ROTULO};font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${C.sec};">` +
    `Qué se revisa en cada punto</div>` +
    pauta.criterios
      .map(
        (c) =>
          `<div style="font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:7px;">` +
          `<b style="color:${C.tinta};font-weight:600;">${escaparHtml(c.titulo)}.</b> ${escaparHtml(c.ayuda)}</div>`,
      )
      .join('') +
    `<div style="font-size:${ROTULO};font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${C.sec};padding-top:18px;">` +
    `Qué dice cada estado</div>` +
    [
      ['Conforme', C.ventana, 'se revisó y estaba bien'],
      ['Corregido', C.afectado, 'se encontró algo y se resolvió antes de entregar'],
      ['Controlado', C.pendBorde, 'sigue abierto; se opera con una medida transitoria'],
      ['No conforme', C.parada, 'sigue abierto, sin contingencia'],
    ]
      .map(
        ([nombre, color, que]) =>
          `<div style="font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:5px;">` +
          `<span style="color:${color};">●</span> <b style="color:${C.tinta};font-weight:600;">${nombre}</b> · ${que}</div>`,
      )
      .join('') +
    `</div>`

  const pie =
    `<div style="font-family:${FUENTE};font-size:${ROTULO};line-height:1.5;color:${C.sec};padding-top:18px;">` +
    `Generado con la app de Mantención · ${escaparHtml(etiquetaTurno(turno))} ${escaparHtml(turno.fecha.split('-').reverse().join('-'))}` +
    ` · Las desviaciones quedan también en la bitácora del turno.</div>`

  return `<div style="max-width:680px;color:${C.tinta};">${encabezado}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:22px 0 2px;"><tr>${kpis}</tr></table>` +
    `${tablaCriterios}${tablaDesviaciones}${aviso}${sinJuzgar}${resultado}${cambios}${queSeRevisa}${pie}</div>`
}

/**
 * Lo que cambió DESPUÉS de entregar la planta. No reescribe la entrega —esa es una foto— pero
 * tampoco la deja incompleta: si un pendiente se cerró al día siguiente, se dice aparte.
 */
function cambiosDesdeLaEntrega(foto: ResumenInspeccion, ahora: ResumenInspeccion): string {
  const partes: string[] = []
  const cerradas = foto.pendientes - ahora.pendientes
  if (cerradas > 0) partes.push(`${cerradas} ${cerradas === 1 ? 'pendiente se resolvió' : 'pendientes se resolvieron'}`)
  const nuevas = ahora.desviaciones - foto.desviaciones
  if (nuevas > 0) partes.push(`${nuevas} ${nuevas === 1 ? 'desviación nueva' : 'desviaciones nuevas'}`)
  if (!partes.length) return ''
  return (
    `<div style="font-family:${FUENTE};font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:11px;border-top:1px solid ${C.linea};margin-top:16px;">` +
    `Después de la entrega: ${escaparHtml(partes.join(' · '))}. Los números de arriba son los del momento de liberar.</div>`
  )
}

/** La misma inspección en texto plano, para el cuerpo alterno del correo y para WhatsApp. */
export function inspeccionATextoPlano({ inspeccion, pauta, resumen: vivo, desviaciones, turno, planta }: DatosCorreoInspeccion): string {
  const l = inspeccion.liberacion
  const resumen = l?.resumen ?? vivo
  const etiqueta = (id: string) => {
    const r = inspeccion.resultados[id]
    return r === 'conforme'
      ? 'Conforme'
      : r === 'corregido'
        ? 'Corregido'
        : r === 'controlado'
          ? 'Controlado'
          : r === 'no-conforme'
            ? 'No conforme'
            : 'Sin revisar'
  }

  const partes: string[] = [
    `${pauta.nombre.toUpperCase()} · ${planta}`,
    `${etiquetaTurno(turno)} · ${fechaTurnoLarga(turno)}`,
    `Realizada por ${inspeccion.iniciadaPorNombre}${hora(inspeccion.iniciadaEn) ? ` · Inicio ${hora(inspeccion.iniciadaEn)}` : ''} · Pauta v${inspeccion.pautaVersion}`,
    '',
    'CRITERIO DE LIBERACIÓN',
    ...pauta.criterios.map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      const h = hora(inspeccion.marcas?.[c.id])
      const suyas = desviaciones.filter((e) => e.inspeccion?.criterioId === c.id)
      const cuelgan = suyas.length ? `. ${suyas.length} ${suyas.length === 1 ? 'desviación' : 'desviaciones'} en el registro` : ''
      return `- ${c.titulo}: ${etiqueta(c.id)}${h ? ` (${h})` : ''}${nota ? `. ${nota}` : ''}${cuelgan}`
    }),
    '',
    'REGISTRO DE DESVIACIONES',
  ]

  if (!desviaciones.length) {
    partes.push(
      resumen.noConformesSinDesviacion
        ? `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} sin resolver y sin una desviación anotada.`
        : 'Sin desviaciones detectadas durante la inspección.',
    )
  }
  else {
    // Agrupadas por punto de la pauta, igual que en el HTML: una desviación suelta no deja
    // saber de qué punto salió.
    const linea = (e: EventoBitacora, n: number) => {
      const fotos = (e.fotos ?? []).length
      return (
        `  ${n}. ${[e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')}: ${e.descripcion}` +
        ` | ${accionDe(e, inspeccion)} | ${autorVisible(e)}` +
        (fotos ? ` | ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : '')
      )
    }
    let n = 0
    for (const c of pauta.criterios) {
      const suyas = desviaciones.filter((e) => e.inspeccion?.criterioId === c.id)
      if (suyas.length) partes.push(`${c.titulo}:`, ...suyas.map((e) => linea(e, ++n)))
    }
    const sueltas = desviaciones.filter((e) => !pauta.criterios.some((c) => c.id === e.inspeccion?.criterioId))
    if (sueltas.length) partes.push('Sin punto de la pauta:', ...sueltas.map((e) => linea(e, ++n)))
  }

  if (resumen.sinEvaluar) {
    const n = resumen.sinEvaluar
    partes.push(
      '',
      `Sin evaluar: ${n} ${n === 1 ? 'desviación abierta no calza' : 'desviaciones abiertas no calzan'} con ningún equipo del diagrama de líneas.`,
    )
  }
  if (resumen.pendientesCriticos) {
    partes.push('', `Atención: ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.`)
  }

  partes.push('', 'RESULTADO FINAL')
  partes.push(
    l
      ? `${titularLiberacion(l.estado)}\n` +
        `${TEXTO_LIBERACION[l.estado].titulo}. ${frasePorLiberacion(l.estado, resumen)}\n` +
        `Entregada${hora(l.en) ? ` a las ${hora(l.en)}` : ''} por ${l.porNombre}`
      : 'Falta marcar la entrega de la planta. El recorrido está registrado; todavía no se dice en qué condición quedó la planta al pasar a Producción.',
  )
  partes.push('', `${resumen.revisados} de ${resumen.total} puntos revisados${resumen.minutosDeRecorrido != null ? ` en ${resumen.minutosDeRecorrido} min` : ''}.`)
  partes.push('', 'QUÉ SE REVISA EN CADA PUNTO', ...pauta.criterios.map((c) => `- ${c.titulo}: ${c.ayuda}`))
  return partes.join('\n')
}
