import { describe, expect, it } from 'vitest'
import { inspeccionAHtmlCorreo, inspeccionATextoPlano, type DatosCorreoInspeccion } from '../inspeccionCorreo'
import { PAUTA_POST_ASEO, pautaDeLaInspeccion, resumenDeInspeccion, type Inspeccion } from '../modeloInspeccion'
import { C } from '@/services/bitacora/bitacoraCorreo'
import type { EventoBitacora, TurnoMantencion } from '@/services/bitacora/bitacora.types'

/**
 * El correo tiene que traer lo que el PROCEDIMIENTO exige, no lo que quede bonito:
 * §10 el criterio de liberación, §8 las seis columnas del registro de desviaciones y el
 * resultado final. Estas pruebas son el contrato con el documento.
 */
// `inicio`/`fin` son Date, no texto: el correo saca de ahí el día y el horario.
const turno: TurnoMantencion = {
  id: '2026-09-20_dia',
  fecha: '2026-09-20',
  banda: 'dia',
  inicio: new Date('2026-09-20T08:00:00'),
  fin: new Date('2026-09-20T16:00:00'),
}

const inspeccion = (p: Partial<Inspeccion> = {}): Inspeccion => ({
  id: 'chonchi_2026-09-20_dia',
  plantId: 'chonchi',
  turnoId: turno.id,
  fechaTurno: turno.fecha,
  banda: 'dia',
  pautaId: PAUTA_POST_ASEO.id,
  pautaVersion: 1,
  iniciadaEn: '2026-09-20T09:20:00.000Z',
  iniciadaPorNombre: 'Danilo Cortes',
  resultados: Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const])),
  ...p,
})

const desviacion = (p: Partial<EventoBitacora> = {}): EventoBitacora =>
  ({
    id: 'e1',
    plantId: 'chonchi',
    turnoId: turno.id,
    fechaTurno: turno.fecha,
    banda: 'dia',
    tipo: 'correctivo',
    equipo: 'CINTA LARGA GRADER',
    equipoCodigo: '720004999',
    equipoId: 'n1',
    titulo: 'Fuga de aire en el racor',
    descripcion: 'Racor del cilindro suelto tras el aseo, silbido audible',
    horaInicio: '09:30',
    horaTermino: '10:10',
    impacto: 'no-aplica',
    minutosParada: null,
    ventana: null,
    pendiente: false,
    fotos: [],
    creadoPor: 'u1',
    autorNombre: 'Danilo Cortes',
    registradoPor: 'Jose Chodil',
    inspeccion: { id: 'chonchi_2026-09-20_dia', criterioId: 'neumatico' },
    ...p,
  }) as EventoBitacora

function datos(insp: Inspeccion, ds: EventoBitacora[]): DatosCorreoInspeccion {
  return {
    inspeccion: insp,
    pauta: PAUTA_POST_ASEO,
    resumen: resumenDeInspeccion(
      PAUTA_POST_ASEO,
      insp,
      ds.map((e) => ({
        id: e.id,
        criterioId: e.inspeccion?.criterioId ?? '',
        pendiente: e.pendiente && !e.cierre,
        critica: e.equipo === 'CINTA LARGA GRADER',
        desdeMin: 90,
        hastaMin: e.horaTermino ? 130 : null,
      })),
    ),
    desviaciones: ds,
    turno,
    planta: 'Planta Chonchi',
  }
}

describe('§10 · el criterio de liberación va completo', () => {
  it('trae los 7 puntos de la pauta con su estado', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    for (const c of PAUTA_POST_ASEO.criterios) expect(html).toContain(c.titulo)
    expect(html).toContain('Criterio de liberación')
    expect(html.match(/ Conforme<\/td>/g) ?? []).toHaveLength(7)
  })

  it('un punto sin marcar se dice «Sin revisar», no se esconde', () => {
    const insp = inspeccion({ resultados: { mecanico: 'conforme' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('Sin revisar')
  })

  it('la observación de un «conforme» viaja en el correo', () => {
    const insp = inspeccion({ notas: { mecanico: 'Rodillo 3 empieza a sonar' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('Rodillo 3 empieza a sonar')
    expect(inspeccionATextoPlano(datos(insp, []))).toContain('Rodillo 3 empieza a sonar')
  })
})

describe('§8 · el registro de desviaciones trae los seis datos', () => {
  const d = datos(inspeccion({ resultados: { ...inspeccion().resultados, neumatico: 'no-conforme' } }), [desviacion()])

  /**
   * El procedimiento pide seis DATOS, no seis columnas. En 680 px, seis columnas dejaban la
   * condición encontrada en una caja de veinte caracteres; cada desviación es ahora una ficha
   * numerada con sus campos rotulados, y los seis siguen estando.
   */
  it('los seis datos de §8 están, cada uno con su rótulo', () => {
    const html = inspeccionAHtmlCorreo(d)
    for (const campo of ['Anomalía', 'Condición', 'Acción', 'Responsable']) expect(html).toContain(campo)
    // Equipo y estado van en el encabezado de la ficha, no como campo rotulado.
    expect(html).toContain('CINTA LARGA GRADER')
    expect(html).toContain('Resuelta')
  })

  it('el equipo va con su código SAP y el responsable es quien registró', () => {
    const html = inspeccionAHtmlCorreo(d)
    expect(html).toContain('CINTA LARGA GRADER')
    expect(html).toContain('720004999')
    expect(html).toContain('Jose Chodil')
  })

  it('una desviación cerrada dice «Resuelta»; una abierta, que queda pendiente', () => {
    expect(inspeccionAHtmlCorreo(d)).toContain('Resuelta')
    const abierta = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })])
    expect(inspeccionAHtmlCorreo(abierta)).toContain('queda para el turno siguiente')
  })

  it('sin desviaciones lo dice, en vez de dejar la sección vacía', () => {
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), []))).toContain('Sin desviaciones detectadas')
  })

  it('avisa cuando queda abierta una que detiene una línea', () => {
    const critica = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })])
    expect(inspeccionAHtmlCorreo(critica)).toContain('detiene una línea')
    expect(inspeccionATextoPlano(critica)).toContain('Atención:')
  })
})

describe('el resultado final', () => {
  it('liberada sale con la frase del procedimiento', () => {
    const insp = inspeccion({ liberacion: { estado: 'conforme', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('Planta entregada a Producción')
    expect(html).toContain('Conforme.')
    expect(html).toContain('Danilo Cortes')
  })

  /**
   * «PLANTA LIBERADA PARA OPERACIÓN» encabezaba, en mayúsculas, los tres estados que entregan, y con un
   * pendiente abierto se leía como si no hubiera pasado nada (Orel, 21-09-2026).
   */
  it('con pendientes controlados el titular lo dice, no lo esconde', () => {
    const insp = inspeccion({ liberacion: { estado: 'con-pendientes', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    const html = inspeccionAHtmlCorreo(datos(insp, [desviacion({ pendiente: true, horaTermino: null })]))
    expect(html).toContain('Planta entregada a Producción')
    expect(html).toContain('Con pendientes controlados.')
  })

  it('no liberada sale con la suya', () => {
    const insp = inspeccion({ liberacion: { estado: 'no-liberada', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('Planta no liberada')
  })

  it('sin liberar no finge que se entregó: pide marcar la entrega', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).toContain('Falta marcar la entrega de la planta')
    expect(html).not.toContain('ENTREGADA A PRODUCCIÓN')
  })
})

describe('cómo pega en Outlook', () => {
  it('todo el estilo va en línea y la estructura en tablas', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))
    expect(html).toContain('<table')
    expect(html).not.toContain('class=')
    expect(html).not.toContain('<style')
  })

  it('escapa lo que escribe la gente', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion({ descripcion: 'Fuga <b>grande</b> & ruido' })]))
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>grande</b>')
  })
})

describe('las fotos de la desviación viajan en el correo', () => {
  const conFotos = () =>
    desviacion({
      fotos: [
        { url: 'https://x/despues.jpg', path: 'p/2', etiqueta: 'despues', ancho: 1200, alto: 900 },
        { url: 'https://x/antes.jpg', path: 'p/1', etiqueta: 'antes', ancho: 1200, alto: 900 },
      ],
    })

  it('van como <img> con width y height: sin ellos Outlook las pega a 1920 px', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [conFotos()]))
    expect(html).toContain('https://x/antes.jpg')
    expect(html).toContain('https://x/despues.jpg')
    expect(html).toMatch(/<img[^>]+width="\d+"[^>]+height="\d+"/)
  })

  it('«antes» va primero: es la comparación que se quiere ver', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [conFotos()]))
    expect(html.indexOf('antes.jpg')).toBeLessThan(html.indexOf('despues.jpg'))
  })

  it('la variante incrustada reemplaza la URL por el base64', () => {
    const html = inspeccionAHtmlCorreo({
      ...datos(inspeccion(), [conFotos()]),
      fuenteFoto: (f) => (f.etiqueta === 'antes' ? 'data:image/jpeg;base64,AAA' : f.url),
    })
    expect(html).toContain('data:image/jpeg;base64,AAA')
    expect(html).not.toContain('https://x/antes.jpg')
  })

  it('el texto plano dice cuántas fotos hay, ya que no puede mostrarlas', () => {
    expect(inspeccionATextoPlano(datos(inspeccion(), [conFotos()]))).toContain('2 fotos')
  })

  it('sin fotos no deja una fila vacía en la tabla', () => {
    // La única fila a todo el ancho que puede quedar es el encabezado del grupo (el punto de
    // la pauta); la de fotos no existe si no hay fotos.
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))).not.toContain('<img')
  })
})

describe('el correo ya no se contradice', () => {
  it('«corregido» sale como tal, no como no conforme', () => {
    const insp = inspeccion({
      resultados: { ...inspeccion().resultados, mecanico: 'corregido' },
      notas: { mecanico: 'Cinta azul rozaba con la estructura, se corrige' },
    })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain(' Corregido</td>')
    expect(html).toContain('Cinta azul rozaba con la estructura, se corrige')
    expect(html).not.toContain(' No conforme</td>')
  })

  it('un «no conforme» SIN desviación lo dice, en vez de afirmar que no hubo ninguna', () => {
    const insp = inspeccion({ resultados: { ...inspeccion().resultados, mecanico: 'no-conforme' } })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('sin una desviación anotada')
    expect(html).not.toContain('Sin desviaciones detectadas')
  })

  it('sin nada que reportar sigue diciendo que no hubo desviaciones', () => {
    expect(inspeccionAHtmlCorreo(datos(inspeccion(), []))).toContain('Sin desviaciones detectadas')
  })
})

describe('la entrega es una foto, no un calculo vivo', () => {
  const liberada = (resumenFoto: Parameters<typeof inspeccionAHtmlCorreo>[0]['resumen']) =>
    inspeccion({
      liberacion: { estado: 'con-pendientes', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes', resumen: resumenFoto },
    })

  it('usa los numeros del momento de liberar, no los de hoy', () => {
    // Al entregar quedaba 1 pendiente; ahora ya se cerro.
    const foto = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })]).resumen
    const ahora = datos(inspeccion(), [desviacion()])
    const html = inspeccionAHtmlCorreo({ ...ahora, inspeccion: liberada(foto) })
    expect(html).toContain('queda abierta')
  })

  it('pero dice aparte lo que cambio despues, sin reescribir la entrega', () => {
    const foto = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null })]).resumen
    const ahora = datos(inspeccion(), [desviacion()])
    const html = inspeccionAHtmlCorreo({ ...ahora, inspeccion: liberada(foto) })
    expect(html).toContain('Después de la entrega')
    expect(html).toContain('1 pendiente se resolvió')
  })

  it('sin cambios no agrega el bloque', () => {
    const d = datos(inspeccion(), [desviacion()])
    const html = inspeccionAHtmlCorreo({ ...d, inspeccion: liberada(d.resumen) })
    expect(html).not.toContain('Después de la entrega')
  })

  it('una entrega vieja, sin foto guardada, cae al resumen en vivo', () => {
    const insp = inspeccion({ liberacion: { estado: 'conforme', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes' } })
    const html = inspeccionAHtmlCorreo(datos(insp, []))
    expect(html).toContain('Planta entregada a Producción')
    expect(html).not.toContain('Después de la entrega')
  })
})

describe('las desviaciones sin equipo reconocible', () => {
  it('no se las lava como «controladas», pero tampoco se le habla a Producción del diagrama', () => {
    const d = datos(inspeccion(), [desviacion({ pendiente: true, horaTermino: null, equipoId: null, equipo: 'CINTA LARGA GRADER' })])
    const conNull = { ...d, resumen: { ...d.resumen, sinEvaluar: 1, pendientesCriticos: 0 } }
    const entregada = inspeccion({
      liberacion: { estado: 'con-pendientes', en: '2026-09-20T10:30:00.000Z', porNombre: 'Danilo Cortes', resumen: conNull.resumen },
    })
    const html = inspeccionAHtmlCorreo({ ...conNull, inspeccion: entregada })
    expect(html).not.toContain('Sin evaluar')
    expect(html).not.toContain('diagrama de líneas')
    expect(html).not.toContain('controladas')
  })
})

/**
 * El caso real del 21-09-2026: TABLERO CONTROL TOLVA RIÑONES con agua adentro y la fuente de
 * 24 V quemada. La solución final quedó pendiente, pero se operó a mano toda la noche para no
 * detener el proceso. «No conforme» a secas contaba la mitad mala y callaba el trabajo que
 * hizo que la planta produjera igual.
 */
describe('un punto controlado con contingencia', () => {
  const insp = inspeccion({
    resultados: { ...inspeccion().resultados, electrico: 'controlado' },
  })
  const abierta = desviacion({
    pendiente: true,
    horaTermino: null,
    equipo: 'TABLERO CONTROL TOLVA RIÑONES',
    descripcion: 'Ingreso de agua, fuente 24 V quemada; se opera a mano durante la noche',
    inspeccion: { id: 'chonchi_2026-09-20_dia', criterioId: 'electrico' },
  })

  it('el punto sale «Controlado», no «No conforme»', () => {
    const html = inspeccionAHtmlCorreo(datos(insp, [abierta]))
    expect(html).toContain(' Controlado</td>')
    expect(html).not.toContain(' No conforme</td>')
  })

  it('la desviación sale «Controlada» y con la medida, no como un pendiente pelado', () => {
    const html = inspeccionAHtmlCorreo(datos(insp, [abierta]))
    expect(html).toContain(' Controlada</td>')
    expect(html).toContain('Contingencia aplicada')
  })

  it('el estado de la desviación deja de decir «No conforme» cuando ya está resuelta', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))
    expect(html).toContain(' Resuelta</td>')
  })
})

describe('las desviaciones cuelgan de su punto de la pauta', () => {
  const insp = inspeccion({ resultados: { ...inspeccion().resultados, electrico: 'no-conforme' } })
  const dos = [
    desviacion({ id: 'e1', inspeccion: { id: 'chonchi_2026-09-20_dia', criterioId: 'electrico' }, equipo: 'TABLERO TOLVA' }),
    desviacion({ id: 'e2', inspeccion: { id: 'chonchi_2026-09-20_dia', criterioId: 'electrico' }, equipo: 'BOTONERA CINTA 3' }),
  ]

  it('el registro las agrupa bajo el punto, con cuántas son', () => {
    const html = inspeccionAHtmlCorreo(datos(insp, dos))
    expect(html).toContain('Sistema eléctrico')
    expect(html).toContain('2 desviaciones')
  })

  it('la observación del punto deja de salir vacía: nombra lo que cuelga de él', () => {
    const html = inspeccionAHtmlCorreo(datos(insp, dos))
    // Dice qué se encontró, con el número que enlaza a su ficha; no un puntero.
    expect(html).toContain('1. TABLERO TOLVA')
    expect(html).toContain('2. BOTONERA CINTA 3')
    // Y la acción en dos palabras: la fila del punto con falla no se lee más pobre que otra.
    expect(html).toContain('· resuelta')
    expect(html).not.toContain('del registro')
  })

  it('el texto plano también las agrupa', () => {
    expect(inspeccionATextoPlano(datos(insp, dos))).toContain('Sistema eléctrico:')
  })
})

/**
 * Una pauta del domingo completada el lunes a las 18:09 quedaba con siete marcas a las 18:09.
 * Sin hora, el correo no inventa ninguna (Orel, 21-09-2026).
 */
describe('la hora del punto es opcional', () => {
  it('sin ninguna marca, la columna Hora ni siquiera aparece', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).not.toContain('>Hora<')
  })

  it('con una sola marca tampoco: una hora no es un recorrido', () => {
    const insp = inspeccion({ marcas: { electrico: '2026-09-20T12:16:00.000Z' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).not.toContain('>Hora<')
  })

  it('con dos o más marcas, la columna vuelve', () => {
    const insp = inspeccion({ marcas: { electrico: '2026-09-20T12:16:00.000Z', neumatico: '2026-09-20T12:24:00.000Z' } })
    expect(inspeccionAHtmlCorreo(datos(insp, []))).toContain('>Hora<')
  })

  it('el texto plano no pone un horario donde no lo hay', () => {
    const texto = inspeccionATextoPlano(datos(inspeccion(), []))
    expect(texto).toContain('- Sistema eléctrico: Conforme')
    expect(texto).not.toContain('Sistema eléctrico: Conforme (')
  })
})

describe('el correo explica qué se revisa en cada punto', () => {
  it('el criterio va con el punto, no en un anexo que lo repita', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).toContain('sin agua ni humedad')
    // El anexo del pie decía lo mismo una segunda vez.
    expect(html).not.toContain('Qué se revisa en cada punto')
  })

  it('termina donde termina la entrega: sin leyenda de estados ni pie de «generado con»', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).not.toContain('Qué dice cada estado')
    expect(html).not.toContain('Generado con la app')
  })
})

/**
 * La forma del documento, fijada el 21-09-2026 contra el catálogo de tics de la IA
 * (artifact «Estilo IA vs. documento profesional», hoja 3). Estas pruebas son el estándar:
 * si alguien vuelve a meter una caja de color o a pintar una celda, se cae acá.
 */
describe('la forma del documento: protocolo, no plantilla', () => {
  const html = () => inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))

  it('ninguna caja de color: ni fondos de sección ni barras a la izquierda', () => {
    // El tic n.º 1: la tarjeta con `border-left` y fondo tenue del bloque de nota de la
    // documentación técnica. La conclusión se anuncia con filete y cuerpo mayor.
    expect(html()).not.toContain('border-left')
    expect(html()).not.toContain(`background:${C.okFondo}`)
    expect(html()).not.toContain(`background:${C.pendFondo}`)
    expect(html()).not.toContain(`background:${C.critFondo}`)
  })

  it('ningún filete vertical: las tablas no son rejas', () => {
    expect(html()).not.toMatch(/border:1px solid/)
  })

  it('cada tabla cierra con su total, como una factura', () => {
    const h = inspeccionAHtmlCorreo(datos(inspeccion({ resultados: { ...inspeccion().resultados, neumatico: 'corregido' } }), [desviacion()]))
    expect(h).toContain('7 puntos')
    expect(h).toContain('6 conformes · 1 corregido')
    expect(h).toContain('todas resueltas antes de entregar')
  })

  it('cuatro cuerpos y nada intermedio', () => {
    const cuerpos = new Set([...html().matchAll(/font-size:([\d.]+)px/g)].map((m) => m[1] ?? ''))
    expect([...cuerpos].sort()).toEqual(['10.5', '11', '14', '21'])
  })

  it('el color solo aparece donde codifica un estado', () => {
    // Fuera de los puntos de estado, el documento es tinta sobre papel: en blanco y negro
    // tiene que conservar la jerarquía.
    const conColor = [...html().matchAll(/color:(#[0-9A-Fa-f]{6})/g)].map((m) => (m[1] ?? '').toUpperCase())
    const semanticos = [C.ventana, C.parada, C.afectado, C.pendBorde].map((c) => c.toUpperCase())
    const neutros = [C.tinta, C.sec].map((c) => c.toUpperCase())
    expect(conColor.every((c) => semanticos.includes(c) || neutros.includes(c))).toBe(true)
  })
})

/**
 * «Sistema eléctrico» a secas no le dice nada a quien no recorrió la pauta. El texto completo
 * del procedimiento dentro de la celda multiplicaba por cuatro el alto de la tabla —nueve
 * líneas de treinta caracteres por punto—, así que va cinco palabras arriba y el completo al
 * pie (Orel, 21-09-2026).
 */
describe('cada punto dice lo que cubre', () => {
  it('el criterio de cada punto va bajo su título, no en un anexo', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).toContain('tapas y guardas instaladas')
    // Tres o cuatro líneas de la columna. Y con un VERBO: un punto de pauta se aprueba contra
    // un criterio, no contra una lista de piezas.
    for (const c of PAUTA_POST_ASEO.criterios) {
      expect((c.resumen ?? '').length).toBeLessThanOrEqual(190)
      expect(c.resumen ?? '').toMatch(/\b(sin|con|ni|en)\b/i)
    }
  })

  it('una inspección abierta antes del cambio igual lo muestra: el resumen es presentación', () => {
    const vieja = inspeccion({ criterios: PAUTA_POST_ASEO.criterios.map(({ id, titulo, ayuda }) => ({ id, titulo, ayuda })) })
    const pauta = pautaDeLaInspeccion(PAUTA_POST_ASEO, vieja)
    expect(pauta.criterios[1]?.resumen).toContain('sin agua ni humedad')
  })
})

/**
 * `tituloDe` viene vacío en casi todos los eventos —el título es opcional en la bitácora— y el
 * respaldo `|| descripcion` hacía que la ficha imprimiera el mismo párrafo como Anomalía y como
 * Condición (Orel, 21-09-2026).
 */
describe('la ficha no se repite a sí misma', () => {
  it('sin título propio, el evento no sale con la condición dos veces', () => {
    const sinTitulo = desviacion({ titulo: '', descripcion: 'Racor del cilindro suelto tras el aseo' })
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [sinTitulo]))
    expect(html.match(/Racor del cilindro suelto tras el aseo/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('Anomalía')
    // La observación del punto se queda con el equipo: el detalle vive una sola vez, en la ficha.
    expect(html).toContain('1. CINTA LARGA GRADER')
  })

  it('con título propio, los dos campos están y dicen cosas distintas', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), [desviacion()]))
    expect(html).toContain('Anomalía')
    expect(html).toContain('Fuga de aire en el racor')
    expect(html).toContain('Racor del cilindro suelto tras el aseo, silbido audible')
  })
})

/**
 * La fila de cifras se gana su lugar cuando trae lo que la tabla no dice (corrida, recorrido,
 * críticas). Con una o dos, repetía el cierre de la tabla como dos números sueltos.
 */
describe('la cabecera de cifras', () => {
  it('con menos de tres cifras no aparece: la tabla ya las cierra', () => {
    const html = inspeccionAHtmlCorreo(datos(inspeccion(), []))
    expect(html).not.toContain('puntos revisados</div>')
    expect(html).toContain('7 puntos')
  })

  it('con corrida y recorrido, sí', () => {
    const insp = inspeccion({ marcas: { electrico: '2026-09-20T12:16:00.000Z', neumatico: '2026-09-20T12:40:00.000Z' } })
    const html = inspeccionAHtmlCorreo(datos(insp, [desviacion()]))
    expect(html).toContain('puntos revisados')
    expect(html).toContain('de recorrido')
  })
})
