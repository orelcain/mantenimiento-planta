/**
 * Inspección de planta post-aseo / detención prolongada (procedimiento de Mantención,
 * traído por Orel el 20-09-2026).
 *
 * Cada domingo, después del aseo semanal, Mantención recorre una pauta y le entrega la planta
 * a Producción. Hoy eso ocurre y no queda en ninguna parte: ni qué se revisó, ni qué se
 * encontró, ni que hubo que **correr a arreglarlo** para que el proceso partiera a la hora.
 * Eso último es el trabajo que nadie cuenta.
 *
 * ⚠ El procedimiento dice que la planta no se libera con desviaciones críticas pendientes, pero
 * Orel fue explícito: «en la realidad en ese momento tenemos que correr a solucionar para que el
 * proceso arranque igual». Una app que bloquee algo que en terreno igual ocurre solo enseña a
 * saltársela. Por eso acá NO hay portón: hay tres formas honestas de liberar y el estado se
 * DEDUCE de lo encontrado, no lo marca nadie (ver `resumenDeInspeccion`).
 *
 * Una desviación NO es un registro nuevo: es un evento de bitácora con `tipo: 'inspeccion'`.
 * Así suma al MTTR, arrastra pendientes al turno siguiente y sale en el informe, sin un
 * registro paralelo que nadie cruza.
 */

/**
 * Lo que se marca en cada punto de la pauta.
 *
 * `corregido` es el escalón que faltaba (Orel, 21-09-2026). «No conforme» estaba haciendo dos
 * trabajos: *encontré algo y queda como desviación* y *encontré algo y lo arreglé ahí mismo*.
 * Con uno solo, el correo decía «No conforme» y abajo «Sin desviaciones»: se contradecía.
 *
 * Y no es hacer trampa: §8 pide que las desviaciones queden «corregidas **o controladas** antes
 * de la puesta en marcha», y §10 es el criterio de LIBERACIÓN — describe el estado al entregar
 * la planta, no lo que se vio mientras se caminaba. Lo encontrado y resuelto termina conforme,
 * con el registro de lo que se hizo.
 */
export type ResultadoCriterio = 'conforme' | 'corregido' | 'controlado' | 'no-conforme'

/**
 * `controlado` es la otra mitad de §8, la que faltaba (Orel, 21-09-2026). El procedimiento pide
 * que las desviaciones queden «corregidas **o controladas** antes de la puesta en marcha», y
 * hasta ahora la app solo sabía decir *corregidas*. El caso real: TABLERO CONTROL TOLVA RIÑONES
 * con agua adentro y la fuente de 24 V quemada — la solución final queda pendiente, pero se
 * operó a mano toda la noche para no detener el proceso.
 *
 * Marcarlo «No conforme» a secas cuenta la mitad de la historia: dice que algo estaba mal y
 * calla el trabajo que hizo que la planta igual produjera. Y no puede ser `corregido`, porque
 * no se corrigió: sigue abierto y pasa al turno siguiente.
 *
 * `controlado` = **sigue mal, opera con una medida transitoria**. Deja desviación abierta.
 */
export const LIBERA: Record<ResultadoCriterio, boolean> = {
  conforme: true,
  corregido: true,
  controlado: false,
  'no-conforme': false,
}

/** Cómo se llama cada resultado al presentarlo, y qué significa. Mismo texto en app y correo. */
export const TEXTO_RESULTADO: Record<ResultadoCriterio, { titulo: string; detalle: string }> = {
  conforme: { titulo: 'Conforme', detalle: 'Se revisó y estaba bien.' },
  corregido: { titulo: 'Corregido', detalle: 'Se encontró algo y se resolvió antes de entregar.' },
  controlado: {
    titulo: 'Controlado',
    detalle: 'No se resolvió: se opera con una medida transitoria para no detener el proceso. Queda pendiente.',
  },
  'no-conforme': { titulo: 'No conforme', detalle: 'Queda como desviación abierta, sin medida de contingencia.' },
}

export interface CriterioPauta {
  id: string
  titulo: string
  /** El texto del procedimiento: guía del técnico, plegada bajo el criterio. */
  ayuda: string
  /**
   * Lo que cubre el punto, para ponerlo BAJO el título en la tabla del correo (Orel,
   * 21-09-2026). «Sistema eléctrico» a secas no le dice nada a quien no recorrió la pauta, y
   * el texto completo del procedimiento dentro de la celda multiplica por cuatro el alto de la
   * tabla: se parte en nueve líneas de treinta caracteres y separa el primer estado del último
   * por mil píxeles. El texto completo sigue al pie.
   *
   * ⚠ El presupuesto son DOS líneas de la columna, unos 80 caracteres. Con una sola —40
   * caracteres— se caía media pauta: «Equipos mecánicos» perdía pernos y estructura, y
   * «Paradas de emergencia» quedaba en tres palabras. Ajustar el resumen a la caja en vez de
   * ajustar la caja al contenido es la manera rápida de dejar el correo diciendo menos.
   *
   * Ausente en las pautas anteriores a este cambio: ahí no se muestra nada.
   */
  resumen?: string
}

export interface PautaInspeccion {
  id: string
  nombre: string
  /**
   * Sube cada vez que se edita la pauta. Cada inspección guarda con cuál se hizo, así que
   * cambiarla no reescribe la historia.
   */
  version: number
  criterios: CriterioPauta[]
}

export type EstadoLiberacion = 'conforme' | 'corregida' | 'con-pendientes' | 'no-liberada'

export interface Liberacion {
  estado: EstadoLiberacion
  /** ISO. */
  en: string
  porNombre: string
  nota?: string
  /**
   * FOTO del momento de la entrega. Un informe de liberación no es un cálculo vivo: si se
   * entrega «con pendientes controlados» y al día siguiente alguien cierra ese pendiente, el
   * mismo documento no puede decir otra cosa al volver a abrirlo. Lo que pase después es
   * historia del turno, no de la entrega (Orel, 21-09-2026).
   *
   * Ausente en las liberaciones anteriores a este cambio: ahí se cae al resumen en vivo.
   */
  resumen?: ResumenInspeccion
}

export interface Inspeccion {
  id: string
  plantId: string
  turnoId: string
  fechaTurno: string
  banda: string
  pautaId: string
  pautaVersion: number
  /**
   * Los criterios CON QUE SE EMPEZÓ. Guardábamos la versión pero leíamos la pauta viva: si
   * alguien la editaba a mitad del recorrido, un «7 de 7» se volvía «7 de 8» y quedaban
   * resultados de puntos que ya no existían (Orel, 21-09-2026). Son 7 líneas: copiarlas sale
   * más barato que versionar documentos.
   *
   * Ausente en las inspecciones anteriores a este cambio: ahí se cae a la pauta viva.
   */
  criterios?: CriterioPauta[]
  /** ISO. */
  iniciadaEn: string
  iniciadaPorNombre: string
  resultados: Record<string, ResultadoCriterio>
  /**
   * «Conforme, pero…»: lo menor que no amerita abrir un evento pero que igual hay que dejar
   * dicho (Orel, 20-09-2026). Sin este escalón el técnico elige entre perderlo o abrir una
   * desviación completa, y en la práctica lo pierde. Mismo problema que resolvió
   * «afectó sin detener» en el impacto.
   */
  notas?: Record<string, string>
  /**
   * Cuándo se marcó cada punto (ISO). Siete marcas en el mismo minuto no son un recorrido.
   *
   * ⚠ La hora es OPCIONAL (Orel, 21-09-2026). Se sellaba siempre con el reloj del momento, y
   * una pauta del domingo que se completa el lunes a las 18:09 quedaba con siete marcas a las
   * 18:09 y un «recorrido de 833 min» que nadie caminó. Mismo criterio que ya rige en los
   * eventos (`horaInicioNuevoEvento`): con el turno cerrado, mejor vacío que un número con
   * forma de hora real que nadie escribió. Sin hora, el correo no inventa ninguna.
   */
  marcas?: Record<string, string>
  liberacion?: Liberacion | null
}

/**
 * Lo mínimo que el modelo necesita saber de una desviación. Se pasan MINUTOS DESDE EL INICIO
 * DEL TURNO (el `posicionMin` del evento) y no `HH:mm`: los turnos cruzan la medianoche y
 * restar horas de reloj daba negativo.
 */
export interface DesviacionDeInspeccion {
  id: string
  criterioId: string
  pendiente: boolean
  /**
   * «Compromete el funcionamiento del proceso» (§8 del procedimiento). No se pregunta: lo
   * responde el diagrama de líneas. Si el equipo lleva flujo, su falla para la línea.
   * `null` = no se pudo evaluar (sin equipo reconocible). No es lo mismo que «no».
   */
  critica: boolean | null
  desdeMin: number | null
  hastaMin: number | null
}

export interface ResumenInspeccion {
  total: number
  revisados: number
  conformes: number
  noConformes: number
  desviaciones: number
  pendientes: number
  /** De los pendientes, los que paran una línea. §10 los pide en cero para liberar. */
  pendientesCriticos: number
  conObservacion: number
  /** Puntos que se encontraron mal y se resolvieron antes de entregar. */
  corregidos: number
  /** Puntos que siguen mal y operan con una medida transitoria (§8, «o controladas»). */
  controlados: number
  /**
   * Puntos que quedaron sin resolver (`no-conforme` o `controlado`) y a los que NO se les anotó
   * una desviación. El correo lo dice en vez de afirmar que no hubo ninguna: era la
   * contradicción que encontró Orel.
   */
  noConformesSinDesviacion: number
  /**
   * Desviaciones abiertas que no se pudieron juzgar: sin equipo del árbol ni nombre que calce
   * con el diagrama, no hay cómo saber si detienen una línea. Decirlo es mejor que darlas por
   * inofensivas — justo el caso de los elementos sin código SAP, que son los que más pesan.
   */
  sinEvaluar: number
  /** De la primera marca a la última: distingue un recorrido de una firma de un tirón. */
  minutosDeRecorrido: number | null
  /** Qué corresponde marcar según lo encontrado. `null` = todavía falta revisar puntos. */
  sugerido: EstadoLiberacion | null
  /**
   * La CORRIDA: de la primera desviación a la última cerrada. Es el trabajo que hoy no queda
   * registrado en ninguna parte. `null` si no hubo ninguna cerrada.
   */
  minutosDeCorrida: number | null
}

/**
 * Los 7 puntos del criterio de liberación del procedimiento (§10), con la guía de las
 * secciones 3 a 7 resumida bajo cada uno.
 *
 * Vive acá como respaldo: la pauta de verdad se guarda en Firestore y se edita (Orel: «déjala
 * en Firestore por si acaso, uno nunca sabe en mantención»). Si el documento no existe todavía,
 * se usa esta.
 */
export const PAUTA_POST_ASEO: PautaInspeccion = {
  id: 'post-aseo',
  nombre: 'Inspección post-aseo / detención prolongada',
  version: 1,
  criterios: [
    {
      id: 'mecanico',
      resumen: 'cintas, motorreductor, rodamientos, poleas, pernos y estructura',
      titulo: 'Equipos mecánicos',
      ayuda:
        'Alineación y centrado de las cintas. Motorreductor: fijaciones, lubricación y fugas. Estructura y soportes. Rodamientos, ejes, poleas y rodillos. Pernos y uniones. Sin objetos atrapados que interfieran con el movimiento.',
    },
    {
      id: 'electrico',
      resumen: 'motores, tableros, botoneras, conexiones, humedad y guardas',
      titulo: 'Sistema eléctrico',
      ayuda:
        'Motores, cajas, tableros, botoneras y conexiones accesibles. Sin agua ni humedad en componentes eléctricos. Tapas, protecciones y guardas instaladas. Sin alarmas ni indicaciones anormales en el control.',
    },
    {
      id: 'neumatico',
      resumen: 'mangueras, racores, cilindros, válvulas, presión y fugas de aire',
      titulo: 'Sistema neumático',
      ayuda:
        'Mangueras, conexiones, racores, cilindros y válvulas. Presión de trabajo. Sin fugas de aire. Cilindros y actuadores funcionando. Mangueras bien sujetas y sin daños.',
    },
    {
      id: 'seguridad',
      resumen: 'pulsadores de emergencia, sensores, enclavamientos y guardas',
      titulo: 'Paradas de emergencia y protecciones',
      ayuda:
        'Funcionamiento de las paradas de emergencia. Sensores, interruptores de seguridad y dispositivos de protección del equipo. Guardas y protecciones en su lugar.',
    },
    {
      id: 'operacional',
      resumen: 'marcha en vacío, sentido de giro, cintas, alarmas y LOTO',
      titulo: 'Prueba operacional',
      ayuda:
        'Marcha en vacío de los equipos principales. Sentido de giro de los motores. Desplazamiento de las cintas. Sistemas neumáticos. Sin alarmas ni fallas en el control. Prohibido intervenir, limpiar o ajustar con el equipo en movimiento: toda intervención con riesgo va con bloqueo y etiquetado (LOTO).',
    },
    {
      id: 'anomalias',
      resumen: 'fugas, ruidos, vibraciones, golpes, calentamientos y movimientos',
      titulo: 'Sin fugas, ruidos ni vibraciones anormales',
      ayuda: 'Durante la prueba: fugas, ruidos, vibraciones, golpes, calentamientos o movimientos anormales.',
    },
    {
      id: 'despejado',
      resumen: 'herramientas, materiales, agua, residuos, accesos y tapas repuestas',
      titulo: 'Sin herramientas ni objetos extraños',
      ayuda:
        'Sin herramientas, materiales, repuestos, piezas sueltas ni elementos de limpieza sobre los equipos. Sin acumulaciones de agua, residuos o químicos. Pisos, pasillos y accesos despejados. Tapas y protecciones desmontadas durante el aseo, reinstaladas.',
    },
  ],
}

/**
 * Qué hay que decir de la inspección de este turno, sin abrir la pestaña.
 *
 * - `toca` — es un turno de domingo y nadie la ha empezado. El aseo semanal es el domingo y
 *   la planta se entrega ahí (Orel); el procedimiento cubre además cualquier detención
 *   prolongada, así que esto PROPONE, no obliga: se puede iniciar cualquier día.
 * - `a-medias` — empezada y sin liberar. Una inspección a medias es justo lo que no puede
 *   pasar inadvertido.
 * - `sin-liberar` — todos los puntos revisados pero la planta no se ha entregado.
 */
export type AvisoInspeccion = 'toca' | 'a-medias' | 'sin-liberar' | null

export function avisoDeInspeccion(
  fechaTurno: string,
  inspeccion: Pick<Inspeccion, 'liberacion'> | null,
  resumen: Pick<ResumenInspeccion, 'revisados' | 'total'>,
): AvisoInspeccion {
  if (!inspeccion) return esDomingo(fechaTurno) ? 'toca' : null
  if (inspeccion.liberacion) return null
  return resumen.revisados >= resumen.total ? 'sin-liberar' : 'a-medias'
}

/** Qué se muestra de cada aviso, en una línea. */
export const TEXTO_AVISO: Record<Exclude<AvisoInspeccion, null>, string> = {
  toca: 'Este turno entrega planta: hay inspección post-aseo pendiente',
  'a-medias': 'La inspección post-aseo quedó a medias',
  'sin-liberar': 'La inspección está completa pero la planta no se ha liberado',
}

/** `YYYY-MM-DD` → domingo. Se arma a mediodía para que la zona horaria no corra el día. */
function esDomingo(fechaTurno: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaTurno)
  if (!m) return false
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getDay() === 0
}

/** El criterio de la pauta, o `undefined` si la pauta cambió y ese punto ya no existe. */
export function criterioDe(pauta: PautaInspeccion, id: string): CriterioPauta | undefined {
  return pauta.criterios.find((c) => c.id === id)
}

/**
 * La pauta con que se recorre ESTA inspección: la que quedó guardada al empezar, o la viva si
 * es una inspección anterior a que se guardaran.
 */
export function pautaDeLaInspeccion(viva: PautaInspeccion, inspeccion: Pick<Inspeccion, 'pautaId' | 'pautaVersion' | 'criterios'> | null): PautaInspeccion {
  if (!inspeccion?.criterios?.length) return viva
  return {
    id: inspeccion.pautaId,
    nombre: viva.nombre,
    version: inspeccion.pautaVersion,
    // El `resumen` es presentación, no registro: si la inspección se abrió antes de que
    // existiera, se toma de la pauta viva en vez de dejar el renglón en blanco. Lo que SÍ es
    // registro —id, título y ayuda— sale de lo que se guardó al empezar.
    criterios: inspeccion.criterios.map((c) => ({
      ...c,
      resumen: c.resumen ?? viva.criterios.find((v) => v.id === c.id)?.resumen,
    })),
  }
}

/** ¿La pauta se editó después de que esta inspección empezó? */
export function pautaCambio(viva: PautaInspeccion, inspeccion: Pick<Inspeccion, 'pautaVersion' | 'criterios'> | null): boolean {
  return !!inspeccion?.criterios?.length && viva.version !== inspeccion.pautaVersion
}

/**
 * Cuenta lo hecho y DEDUCE qué corresponde marcar en la liberación.
 *
 * - sin desviaciones → `conforme`
 * - con desviaciones, todas cerradas → `corregida` (se corrió y se alcanzó)
 * - queda alguna abierta → `con-pendientes` (el procedimiento admite «corregidas **o
 *   controladas**»)
 *
 * `no-liberada` nunca se sugiere: es la excepción y la marca una persona a mano.
 */
export function resumenDeInspeccion(
  pauta: PautaInspeccion,
  inspeccion: Pick<Inspeccion, 'resultados'> & Partial<Pick<Inspeccion, 'notas' | 'marcas'>>,
  desviaciones: readonly DesviacionDeInspeccion[],
): ResumenInspeccion {
  let conformes = 0
  let corregidos = 0
  let controlados = 0
  let noConformes = 0
  const sinDesviacion = new Set<string>()
  for (const c of pauta.criterios) {
    const r = inspeccion.resultados[c.id]
    if (r === 'conforme') conformes += 1
    else if (r === 'corregido') corregidos += 1
    else if (r === 'controlado' || r === 'no-conforme') {
      if (r === 'controlado') controlados += 1
      else noConformes += 1
      // Los dos dejan algo abierto: los dos tienen que terminar en una desviación que pase al
      // turno siguiente. Si no la tienen, se dice.
      if (!desviaciones.some((d) => d.criterioId === c.id)) sinDesviacion.add(c.id)
    }
  }
  const revisados = conformes + corregidos + controlados + noConformes
  const abiertas = desviaciones.filter((d) => d.pendiente)
  const pendientes = abiertas.length
  const pendientesCriticos = abiertas.filter((d) => d.critica === true).length
  const sinEvaluar = abiertas.filter((d) => d.critica == null).length
  const conObservacion = pauta.criterios.filter((c) => (inspeccion.notas?.[c.id] ?? '').trim()).length

  const marcas = pauta.criterios
    .map((c) => inspeccion.marcas?.[c.id])
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((t) => Number.isFinite(t))
  const minutosDeRecorrido = marcas.length > 1 ? Math.round((Math.max(...marcas) - Math.min(...marcas)) / 60000) : null

  const inicios = desviaciones.map((d) => d.desdeMin).filter((m): m is number => m != null)
  const cierres = desviaciones.filter((d) => !d.pendiente).map((d) => d.hastaMin).filter((m): m is number => m != null)
  const minutosDeCorrida =
    inicios.length && cierres.length ? Math.max(0, Math.max(...cierres) - Math.min(...inicios)) : null

  // Un punto abierto SIN desviación anotada también deja pendientes: sugerir «conforme» ahí
  // era el mismo lavado que ya se había corregido en el correo.
  const sugerido: EstadoLiberacion | null =
    revisados < pauta.criterios.length
      ? null
      : pendientes || sinDesviacion.size
        ? 'con-pendientes'
        : desviaciones.length
          ? 'corregida'
          : 'conforme'

  return {
    total: pauta.criterios.length,
    revisados,
    conformes,
    noConformes,
    desviaciones: desviaciones.length,
    pendientes,
    pendientesCriticos,
    conObservacion,
    corregidos,
    controlados,
    noConformesSinDesviacion: sinDesviacion.size,
    sinEvaluar,
    minutosDeRecorrido,
    sugerido,
    minutosDeCorrida,
  }
}

/** Cómo se llama cada estado al presentarlo, y qué significa. */
export const TEXTO_LIBERACION: Record<EstadoLiberacion, { titulo: string; detalle: string }> = {
  conforme: { titulo: 'Conforme', detalle: 'Sin desviaciones.' },
  corregida: {
    titulo: 'Corregida antes del arranque',
    detalle: 'Se encontró algo y se resolvió antes de entregar la planta.',
  },
  'con-pendientes': {
    titulo: 'Con pendientes controlados',
    detalle: 'Queda algo abierto, sin riesgo para operar. Pasa al turno siguiente.',
  },
  'no-liberada': { titulo: 'No liberada', detalle: 'La planta no arranca. Excepción.' },
}

/**
 * El titular del resultado final. Lo que hay que saber de un vistazo es UNA cosa: si la planta
 * quedó en manos de Producción o no. La condición en que se entregó es el renglón siguiente
 * —es un rótulo secundario, no un segundo titular— y por eso va aparte
 * (HIG «Labels»: https://developer.apple.com/design/human-interface-guidelines/labels).
 *
 * Antes decía «PLANTA LIBERADA PARA OPERACIÓN» en mayúsculas para los tres estados que
 * entregan: gritaba y, con un pendiente abierto, sonaba a que no había pasado nada
 * (Orel, 21-09-2026).
 */
export function titularLiberacion(estado: EstadoLiberacion): string {
  return estado === 'no-liberada' ? 'Planta no liberada' : 'Planta entregada a Producción'
}

/** La frase de la liberación, con la corrida cuando la hubo. */
export function frasePorLiberacion(estado: EstadoLiberacion, r: ResumenInspeccion): string {
  if (estado === 'conforme') {
    return r.corregidos
      ? `${r.total} de ${r.total} conformes, ${r.corregidos} ${r.corregidos === 1 ? 'corregido' : 'corregidos'} antes de entregar.`
      : `${r.total} de ${r.total} conformes.`
  }
  if (estado === 'corregida') {
    const cuanto = r.minutosDeCorrida != null ? ` en ${r.minutosDeCorrida} min` : ''
    return `${r.desviaciones} ${r.desviaciones === 1 ? 'desviación resuelta' : 'desviaciones resueltas'}${cuanto} antes del arranque.`
  }
  if (estado === 'con-pendientes') {
    const base = `${r.pendientes} de ${r.desviaciones} ${r.pendientes === 1 ? 'desviación queda abierta' : 'desviaciones quedan abiertas'}`
    // La contingencia ES el trabajo de Mantención: sin ella el proceso se detenía. Decirla en
    // la misma frase que el pendiente evita que el correo cuente solo la mitad mala.
    const conMedida = r.controlados ? ', con contingencia aplicada' : ''
    // §10 pide las críticas en cero para liberar. No se bloquea, pero no se dice «controladas»
    // cuando algo que para una línea sigue abierto: eso sería lavarlo.
    if (r.pendientesCriticos) return `${base}${conMedida}. ${r.pendientesCriticos} de ellas detiene una línea.`
    // No se puede decir «controladas» de algo que no se pudo evaluar.
    if (r.sinEvaluar) return `${base}${conMedida}. ${r.sinEvaluar} sin poder evaluar si ${r.sinEvaluar === 1 ? 'detiene' : 'detienen'} una línea.`
    return `${base}${conMedida || ', controladas'}.`
  }
  return `${r.pendientes} ${r.pendientes === 1 ? 'desviación impide' : 'desviaciones impiden'} entregar la planta.`
}
