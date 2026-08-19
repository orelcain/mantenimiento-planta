/**
 * informeTurno — arma los datos y los TEXTOS del informe post-turno.
 *
 * Separado del PDF a propósito: acá se decide qué se afirma, y eso se testea.
 * El PDF solo dibuja lo que este módulo decidió.
 *
 * ── Las reglas de lo que se puede afirmar ───────────────────────────────────
 * 1. Nunca "sin la falla habriamos producido X piezas mas". Supone que habia
 *    materia prima esperando y que todo lo demas se habria comportado igual: un
 *    turno ideal que no ocurrio. Si el informe empieza a comparar contra turnos
 *    imaginarios, deja de ser evidencia y pasa a ser excusa.
 * 2. Lo que si se afirma es lo que paso: cuanto cayo el ritmo, cuanto demoro en
 *    volver, y como quedo el turno al lado de los turnos equivalentes.
 * 3. Un turno malo se informa como malo. Si el volumen quedo bajo la mediana,
 *    el texto lo dice; buscarle un angulo favorable a un mal turno quema la
 *    credibilidad de todos los informes buenos.
 * 4. Lo que el dato no permite distinguir se declara. Una causa que vive en dos
 *    categorias sale como "Electrica o Mecanica", no elige una.
 */

const { impactoPorCausa, ritmoDelTurno, tramosDeRitmo, recuperacion, repartoDePerdida, ocupacionDeCadena } = require('./lineImpact')
const { clasificarParaInforme } = require('./imputacion')
const { resumirTurno, armarCotejo } = require('./cotejoTurnos')

const durTexto = (sec) => {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
const num = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '--')

/**
 * Como se dice un tiempo de recuperacion. El caso 0 es real y frecuente: la
 * causa termino cuando la linea ya estaba en ritmo, o sea nunca la saco de
 * ritmo. Escribirlo como "volvio en 0 min" suena a error de calculo; decir que
 * no llego a sacarla de ritmo es lo que de verdad paso.
 */
function recuperacionEnPalabras(r) {
  if (r.minutos == null) return `${r.causa}: la linea no volvio a su ritmo en lo que quedaba de turno`
  if (r.minutos === 0) return `${r.causa}: no alcanzo a sacar la linea de su ritmo`
  return `${r.causa}: ${r.minutos} min`
}
const hhmm = (ms) => {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Nombre legible de una causa: la hoja del arbol si se pudo imputar. */
function etiquetaCausa(c) {
  if (c.esMicro) return 'micro detenciones'
  if (c.imputacion && c.imputacion.hoja) return c.imputacion.hoja
  return c.causa
}

/** La causa que mas peso tuvo, sin contar micro detenciones ni lo no imputado. */
function causaPrincipal(causas) {
  return causas.find((c) => !c.esMicro && c.imputacion && (c.imputacion.hoja || c.imputacion.fueraDelArbol)) || causas[0] || null
}

/** Intervalos de una causa por maquina, para la cronologia. */
function eventosDeCausa(machines, causa, windowStart, windowEnd) {
  const desde = windowStart ? new Date(windowStart).getTime?.() ?? windowStart : null
  const filas = impactoPorCausa({
    machines, windowStart, windowEnd, clasificar: clasificarParaInforme,
  })
  const fila = filas.find((f) => f.causa === causa)
  if (!fila) return []
  return machines.map((m) => {
    const nombre = m.machineName
    const ivs = (m.states || [])
      .filter((s) => s.type === 'downtime' && ((s.reason || '').trim() || '(sin causa imputada)') === causa)
      .map((s) => [aMs(s.startAt), aMs(s.endAt)])
      .filter(([a, b]) => a != null && b != null)
      .sort((x, y) => x[0] - y[0])
    return {
      maquina: nombre,
      intervalos: ivs,
      sec: Math.round(ivs.reduce((a, [x, y]) => a + (y - x), 0) / 1000),
      ultimoFinMs: ivs.length ? Math.max(...ivs.map(([, b]) => b)) : null,
    }
  }).filter((m) => m.intervalos.length || desde === null)
}

function aMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (t instanceof Date) return t.getTime()
  if (typeof t.toDate === 'function') return t.toDate().getTime()
  if (typeof t._seconds === 'number') return t._seconds * 1000
  return null
}

/**
 * Arma el objeto completo que consume `turnoDefensaPdf.generarInformeTurno`.
 *
 * @param {object} p
 * @param {Array}  p.machines  docs de maquina con states/intervals/totalCycles
 * @param {*}      p.windowStart
 * @param {*}      p.windowEnd
 * @param {object} p.cotejo    salida de cotejarTurnos (o null)
 * @param {object} p.meta      { areaLabel, turnoLabel, fechaLabel, planta }
 */
function construirDatosInforme({ machines, windowStart, windowEnd, cotejo, meta }) {
  const resumen = resumirTurno({ machines, windowStart, windowEnd, clasificar: clasificarParaInforme })
  const ritmo = ritmoDelTurno({ machines, windowStart, windowEnd })
  const tramos = tramosDeRitmo({ bloques: ritmo.bloques, ritmoNormal: ritmo.ritmoNormal, pasoMin: ritmo.pasoMin })

  const principal = causaPrincipal(resumen.causas)
  const eventosPorMaquina = principal ? eventosDeCausa(machines, principal.causa, windowStart, windowEnd) : []

  // Recuperacion de las dos causas mas pesadas: desde el fin de su ultimo
  // evento hasta que la linea vuelve al ritmo normal. Es la medida de
  // contencion, y es lo unico de esta lamina que Mantencion controla directo.
  const recuperaciones = resumen.causas
    .filter((c) => !c.esMicro && c.equivalenteLineaSec > 0)
    .slice(0, 2)
    .map((c) => {
      const evs = eventosDeCausa(machines, c.causa, windowStart, windowEnd)
      const desdeMs = evs.reduce((a, m) => (m.ultimoFinMs && m.ultimoFinMs > a ? m.ultimoFinMs : a), 0)
      if (!desdeMs) return null
      const r = recuperacion({ bloques: ritmo.bloques, ritmoNormal: ritmo.ritmoNormal, desdeMs })
      return { causa: etiquetaCausa(c), desdeMs, ...r }
    })
    .filter(Boolean)

  /* Ritmo NOMINAL de la maquina: la capacidad fisica que pasa por el sensor,
     no una meta de produccion.
       filete  — Baader 200 alimentada por un operador: cadena de 5 silletas a
                 18 pz/min (dato de Orel, confirmado contra 6 turnos: ningun
                 bucket supero 18 y el maximo fue 17,0).
       chonchi/yal — Baader 142, 17 pz/min POR MAQUINA segun la tasa esperada
                 que informa Shoplogix. ⚠ Ahi el mecanismo NO es un operador
                 llenando silletas, asi que la cifra se informa sin atribuirle
                 causa: decir "silletas vacias" en el eviscerado seria inventar. */
  //
  // ⚠ El nominal es POR MAQUINA y `minutosEnMarcha` viene en minutos-maquina
  // (suma de las 3). Multiplicar aca por el numero de maquinas fue el primer
  // intento y daba 23% de ocupacion en Chonchi: capacidad de linea por tiempo
  // de maquina, o sea el mismo doble conteo del rollup pero al reves. Con el
  // nominal por maquina da 68%, coherente con su ritmo real.
  const RITMO_NOMINAL = { filete: 18, chonchi: 17, yal: 17 }
  const nominal = RITMO_NOMINAL[meta.planta] || 0
  const ocupacion = ocupacionDeCadena({ machines, ritmoNominal: nominal, windowStart, windowEnd })

  // Donde ocurrio la perdida: parado / reenganchando / andando degradado.
  const reparto = repartoDePerdida({
    machines, bloques: ritmo.bloques, ritmoNormal: ritmo.ritmoNormal, pasoMin: ritmo.pasoMin,
  })

  // Una sola cifra de produccion en todo el informe.
  //
  // El cotejo saca la produccion de `endBriefSnapshot.total` (lo que el brief
  // reporto al cierre) y el resumen la suma de `totalCycles` de las maquinas.
  // No siempre coinciden: Yal 2026-08-17 tarde da 21.125 sumando maquinas y
  // 20.916 en el brief. Si no se unifica, la lamina 1 dice un numero y la barra
  // de la lamina 5 dice otro, en el mismo PDF — y eso se lo encuentra el
  // primero que sume las barras en la reunion.
  //
  // Manda la suma de maquinas: es la misma fuente con la que se calculo todo lo
  // demas del informe. La diferencia no se tapa, se declara en los pendientes.
  let cot = cotejo
  let difFuentes = 0
  if (cot && cot.referencia && typeof resumen.ciclos === 'number') {
    difFuentes = resumen.ciclos - (cot.referencia.ciclos ?? resumen.ciclos)
    if (difFuentes !== 0) {
      const referencia = { ...cot.referencia, ciclos: resumen.ciclos }
      cot = { ...cot, referencia, ...armarCotejo(referencia, cot.comparables || []) }
    }
  }

  return {
    meta,
    resumen,
    bloques: ritmo.bloques,
    tramos,
    eventosPorMaquina,
    recuperaciones,
    reparto,
    ocupacion,
    cotejo: cot || { comparados: 0, filas: [], veredicto: 'sin-comparables' },
    textos: construirTextos({ resumen, tramos, recuperaciones, reparto, ocupacion, cotejo: cot, principal, meta, difFuentes }),
  }
}

/**
 * Los textos del informe. Todo lo que se afirma sale de acá, para que se pueda
 * leer de una sola vez qué es capaz de decir el informe y qué no.
 */
function construirTextos({ resumen, recuperaciones, reparto, ocupacion, cotejo, principal, meta, difFuentes = 0 }) {
  const c = cotejo || { comparados: 0, veredicto: 'sin-comparables' }
  const hayFalla = principal && principal.equivalenteLineaSec > 0
  const etiqueta = principal ? etiquetaCausa(principal) : null

  // ── Veredicto ─────────────────────────────────────────────────────────────
  let veredictoTitulo
  let veredictoDetalle
  let veredictoBueno = false
  let produccionSub = 'ciclos del turno'

  if (c.veredicto === 'mejor-del-periodo') {
    veredictoBueno = true
    produccionSub = `la mas alta de los ultimos ${c.comparados} turnos`
    veredictoTitulo = hayFalla
      ? 'La falla costo tiempo de maquina, no costo piezas.'
      : 'Turno sin fallas y con la mayor produccion del periodo.'
    veredictoDetalle = hayFalla
      ? `El turno cerro con ${num(resumen.ciclos)} ciclos, la produccion mas alta de los ultimos ${c.comparados} turnos equivalentes, `
        + `pese a ${durTexto(principal.sumaSec)} de ${etiqueta} en el resumen de area de Shoplogix `
        + `(equivalentes a ${durTexto(principal.equivalenteLineaSec)} de linea completa).`
      : `El turno cerro con ${num(resumen.ciclos)} ciclos, la produccion mas alta de los ultimos ${c.comparados} turnos equivalentes.`
  } else if (c.veredicto === 'sobre-la-mediana') {
    veredictoBueno = true
    produccionSub = `sobre la mediana de los ultimos ${c.comparados} turnos`
    veredictoTitulo = 'El turno cerro sobre lo habitual.'
    veredictoDetalle = `${num(resumen.ciclos)} ciclos, ${num(Math.abs(c.difVsMediana))} por encima de la mediana `
      + `de los ultimos ${c.comparados} turnos equivalentes`
      + (hayFalla ? `, con ${durTexto(principal.equivalenteLineaSec)} de linea perdidos por ${etiqueta}.` : '.')
  } else if (c.veredicto === 'bajo-la-mediana') {
    produccionSub = `bajo la mediana de los ultimos ${c.comparados} turnos`
    veredictoTitulo = 'El turno cerro bajo lo habitual.'
    // Sin adornos: un turno malo se informa como malo, y el informe apunta a lo
    // que hay que revisar en vez de buscarle un angulo favorable.
    veredictoDetalle = `${num(resumen.ciclos)} ciclos, ${num(Math.abs(c.difVsMediana))} por debajo de la mediana `
      + `de los ultimos ${c.comparados} turnos equivalentes. `
      + (hayFalla
        ? `La detencion no programada suma ${durTexto(resumen.detencion.equivalenteLineaSec)} de linea completa: `
          + `revisar si alcanza para explicar la diferencia o si el turno corrio menos horas.`
        : 'No hubo detenciones no programadas relevantes: la diferencia hay que buscarla en las horas efectivas de corrida o en el abastecimiento.')
  } else {
    veredictoTitulo = `Turno cerrado con ${num(resumen.ciclos)} ciclos.`
    // Decir por que faltan comparables, no solo que faltan: distingue un
    // problema de calendario (este turno se corre pocas veces) de uno de datos.
    const d = c.diagnostico
    let porque = ''
    if (d) {
      if (d.mismaVentana === 0) {
        porque = `En los ultimos ${d.diasMirados} dias no hubo ningun turno con el mismo horario y duracion: `
          + 'este turno no se repite seguido, o le cambiaron la hora de inicio.'
      } else if (d.sinProduccion) {
        porque = `En los ultimos ${d.diasMirados} dias hubo ${d.mismaVentana} turnos con el mismo horario, `
          + `pero ${d.sinProduccion === 1 ? 'uno de ellos no produjo' : `${d.sinProduccion} de ellos no produjeron`}: `
          + `quedan ${c.comparados} para comparar y hacen falta 3.`
      } else {
        porque = `Solo ${c.comparados} turnos equivalentes anteriores en los ultimos ${d.diasMirados} dias.`
      }
    }
    veredictoDetalle = `No hay suficientes turnos equivalentes anteriores para emitir un veredicto comparativo. ${porque} `
      + 'El informe muestra lo que paso en el turno, sin compararlo.'
  }

  // ── Notas por lamina ──────────────────────────────────────────────────────
  const notaLamina1 = 'La reunion suele empezar por la cifra grande del resumen de area, que suma las maquinas y por eso '
    + 'exagera el impacto. Esta lamina entrega el veredicto antes que el detalle; el detalle queda atras para sostenerlo si alguien lo pide.'

  const notaLamina2 = `El resumen de area suma las ${resumen.maquinas} maquinas: una falla aparece con la duracion sumada, `
    + 'no con el tiempo que la linea estuvo afectada. "Todas" es el unico tiempo en que la linea estuvo realmente parada; '
    + '"Equiv. linea" es la perdida de capacidad, y es la columna que se traduce a produccion. '
    + 'Una causa que el arbol de imputacion no puede separar sale como "Electrica o Mecanica": el dato de Shoplogix no distingue cual fue.'

  const notaLamina3 = 'Permite responder a que hora fue sin abrir Shoplogix, y muestra si las maquinas cayeron juntas '
    + '(un problema de linea) o escalonadas (fallas independientes). Cuando las tres caen a la misma hora, casi siempre es '
    + 'una sola causa aguas arriba o aguas abajo, no tres fallas.'

  // ── Reparto de la perdida ─────────────────────────────────────────────────
  // Es lo que responde a "las fallas van a ocurrir siempre; lo que importa es
  // contener". El porcentaje de reenganche es el unico de los tres que mide
  // contencion: los otros dos se atacan con otras palancas.
  const rp = reparto || { totalPz: 0, eventos: [] }
  const pct = (n) => (rp.totalPz ? Math.round((n / rp.totalPz) * 100) : 0)
  let notaReparto = ''
  if (rp.totalPz > 0) {
    const peor = rp.eventos.reduce((a, e) => (e.minReenganche > (a ? a.minReenganche : -1) ? e : a), null)
    notaReparto = `De las piezas que faltaron para el ritmo normal, ${pct(rp.paradoPz)}% falto con la linea `
      + `parada, ${pct(rp.reenganchePz)}% mientras volvia a tomar ritmo y ${pct(rp.degradadoPz)}% andando `
      + 'por debajo de su ritmo sin paro grande. '
    if (rp.paradoPz + rp.reenganchePz > 0) {
      notaReparto += `El reenganche es el unico de los tres que mide contencion: es lo que se acorta `
        + `respondiendo mas rapido. Acá fue ${pct(rp.reenganchePz)}%`
        + (peor && peor.minReenganche ? `, y el peor tomo ${peor.minReenganche} min. ` : '. ')
    }
    if (rp.degradadoPz > rp.paradoPz + rp.reenganchePz) {
      notaReparto += 'Ojo con el tramo degradado: es mas grande que todo lo perdido por las caidas, y no se '
        + 'arregla conteniendo mejor una averia — son micro detenciones o abastecimiento, otra palanca.'
    }
  }

  // El titulo de la lamina 4 sigue a lo que paso. Un tercio de los turnos no
  // tiene NINGUNA caida: dejarles el titulo de "tramo por tramo" con la tabla
  // de caidas vacia hace que el informe se vea roto justo cuando no hubo
  // fallas, que es cuando mas conviene que se lea bien.
  let tituloLamina4 = 'El ritmo real del turno, tramo por tramo'
  if (rp.totalPz === 0) {
    tituloLamina4 = 'El turno corrio a su ritmo de punta a punta'
  } else if (!rp.eventos.length) {
    tituloLamina4 = 'El turno no tuvo detenciones: lo que falto fue ritmo'
  } else if (rp.degradadoPz > rp.paradoPz + rp.reenganchePz) {
    tituloLamina4 = 'Hubo caidas, pero lo que mas costo fue el ritmo'
  }

  // ── Ocupacion de la cadena ────────────────────────────────────────────────
  let notaOcupacion = ''
  if (ocupacion && ocupacion.ocupacion != null) {
    const pctOcu = Math.round(ocupacion.ocupacion * 100)
    if (meta.planta === 'filete') {
      notaOcupacion = `Con la cadena en marcha pasaron ${num(ocupacion.pasaron)} silletas y se llenaron `
        + `${num(ocupacion.llenas)}: ${pctOcu}%. Las otras ${num(ocupacion.vacias)} pasaron vacias. `
        + 'Shoplogix llama a esa diferencia "perdida de velocidad", pero la cadena nunca bajo el ritmo: '
        + 'gira siempre a 18 pz/min y el sensor cuenta cada pescado que se posiciona. '
        + `O sea de cada 10 silletas se llenaron ${(pctOcu / 10).toFixed(1)}.`
      if (resumen.causas.some((cc) => cc.esMicro)) {
        notaOcupacion += ' Las micro detenciones son la otra cara de lo mismo: son los huecos entre pescado '
          + 'y pescado, no fallas de maquina.'
      }
    } else {
      // En el eviscerado el mecanismo no es un operador llenando silletas: se
      // informa la brecha sin atribuirle causa.
      notaOcupacion = `La linea uso ${pctOcu}% de su capacidad mientras estuvo en marcha `
        + `(${num(ocupacion.llenas)} de ${num(ocupacion.pasaron)} posibles a ${ocupacion.ritmoNominal} pz/min). `
        + 'Shoplogix informa esa brecha como "perdida de velocidad". Que la causa sea alimentacion, '
        + 'calibre o la maquina misma es lo que hay que establecer en terreno: el dato no lo dice.'
    }
  }

  let notaLamina4 = 'Lo que importa no es cuanto duro la falla, sino cuanto tardo la linea en volver a su ritmo y si lo sostuvo hasta el cierre. '
  if (recuperaciones.length && recuperaciones.every((r) => r.minutos != null)) {
    notaLamina4 += `Aca, tras el ultimo evento de cada causa: ${recuperaciones.map(recuperacionEnPalabras).join('; ')}. `
      + 'Eso es contencion, y es medible. '
  } else if (recuperaciones.some((r) => r.minutos == null)) {
    notaLamina4 += 'Atencion: despues de al menos una de las causas la linea NO volvio a su ritmo normal en lo que quedaba de turno. '
      + 'Eso es arrastre, y es lo que hay que evitar. '
  }
  notaLamina4 += 'Lo que este informe no dice: cuantas piezas se habrian hecho sin la falla. Ese numero supone que habia materia '
    + 'prima esperando y que todo lo demas se habria comportado igual, o sea un turno ideal que no ocurrio.'

  const notaLamina5 = c.comparados >= 3
    ? 'Cada barra es un turno del mismo horario y duracion. Sirve para ver si la detencion de este turno se noto de verdad '
      + 'en el volumen, o si el volumen lo explican otras cosas: las horas efectivas de corrida y el abastecimiento.'
    : 'Con pocos turnos equivalentes la comparacion no se sostiene; se muestra solo como referencia.'

  // ── Parrafo para leer en la reunion ───────────────────────────────────────
  const partes = []
  if (hayFalla) {
    partes.push(`El turno registro ${durTexto(principal.sumaSec)} de ${etiqueta} en el resumen de area de Shoplogix, `
      + `equivalentes a ${durTexto(principal.equivalenteLineaSec)} de linea completa y `
      + `${durTexto(principal.todasSec)} con todas las maquinas detenidas a la vez.`)
  } else {
    partes.push('El turno no registro detenciones no programadas relevantes.')
  }
  const conCaida = recuperaciones.filter((r) => r.minutos)
  if (recuperaciones.length && recuperaciones.every((r) => r.minutos != null)) {
    partes.push(conCaida.length
      ? `La linea volvio a su ritmo normal en ${conCaida.map((r) => `${r.minutos} min`).join(' y ')} y lo sostuvo: la falla no dejo arrastre.`
      : 'Ninguna de las causas alcanzo a sacar la linea de su ritmo normal.')
  }
  if (c.veredicto === 'mejor-del-periodo') {
    partes.push(`Cerro con ${num(resumen.ciclos)} ciclos, la mayor produccion de los ultimos ${c.comparados} turnos equivalentes.`)
  } else if (c.veredicto === 'bajo-la-mediana') {
    partes.push(`Cerro con ${num(resumen.ciclos)} ciclos, bajo la mediana de los ultimos ${c.comparados} turnos equivalentes.`)
  } else if (c.comparados) {
    partes.push(`Cerro con ${num(resumen.ciclos)} ciclos, sobre la mediana de los ultimos ${c.comparados} turnos equivalentes.`)
  }
  if (resumen.mantencionEquivSec > 0) {
    partes.push(`Del tiempo perdido, ${durTexto(resumen.mantencionEquivSec)} de linea son atribuibles a Mantencion `
      + `y ${durTexto(Math.max(resumen.detencion.equivalenteLineaSec - resumen.mantencionEquivSec, 0))} no lo son.`)
  }

  // ── Lo que queda abierto ──────────────────────────────────────────────────
  const pendientes = []
  const pausaMayor = (resumen.pausas || [])[0]
  if (pausaMayor && pausaMayor.todasSec > resumen.detencion.todasSec) {
    // Redactado con cuidado: esto sale automatico todos los dias y habla de una
    // pausa que es de Produccion. Se informa como dato de donde esta el tiempo,
    // no como reproche — el objetivo es que la conversacion exista, no ganarla.
    pendientes.push(`Para tener presente: ${etiquetaCausa(pausaMayor)} concentro ${durTexto(pausaMayor.todasSec)} de linea detenida, `
      + `el bloque mas grande del turno. Es tiempo planificado y no una falla; se anota solo porque si alguna vez se busca capacidad, `
      + 'ahi hay mas que en las detenciones.')
  }
  if (principal && principal.eventos >= 5) {
    pendientes.push(`${etiquetaCausa(principal)} cayo ${principal.eventos} veces en el turno. Un patron asi rara vez es azar: revisar en terreno.`)
  }
  const ambiguas = resumen.causas.filter((x) => x.imputacion && x.imputacion.ambigua)
  if (ambiguas.length) {
    pendientes.push(`${ambiguas.map(etiquetaCausa).join(', ')}: el dato no permite separar electrica de mecanica. `
      + 'Pedir que la causal se anote con el sufijo (ELECTRICA) o (MECANICA), como ya se hace en Chonchi.')
  }
  const sinCausa = resumen.causas.filter((x) => x.imputacion && x.imputacion.sinCausa)
  if (sinCausa.length && resumen.sinCausaEquivSec > 60) {
    pendientes.push(`${durTexto(resumen.sinCausaEquivSec)} de linea sin causal anotada. Sin causal no hay analisis posible de ese tiempo.`)
  }
  const fuera = resumen.causas.filter((x) => x.imputacion && x.imputacion.fueraDelArbol)
  if (fuera.length) {
    pendientes.push(`Causales en uso que el curso de imputacion no cubre: ${fuera.map((x) => x.causa).join(', ')}. `
      + 'Proponerlas para la proxima version del arbol.')
  }
  if (difFuentes) {
    // Se declara aunque sea chico: dos fuentes que no cuadran en un turno
    // pueden no cuadrar en grande en otro, y el informe pierde autoridad si el
    // que lo lee descubre la diferencia antes que nosotros.
    pendientes.push(`La suma de las maquinas da ${num(resumen.ciclos)} ciclos y el aviso de cierre reporto `
      + `${num(resumen.ciclos - difFuentes)}: ${num(Math.abs(difFuentes))} de diferencia. El informe usa la suma de las maquinas. `
      + 'Vale cerrar de donde sale la diferencia.')
  }
  // Shoplogix no alimenta rechazo para estas maquinas: 204 turnos revisados de
  // las tres plantas, cero scrap SIEMPRE. El "Calidad 100%" de su waterfall no
  // es una medicion, es la ausencia del dato — y alguien lo puede citar como
  // logro. Se advierte una vez, y solo si de verdad no vino nada.
  if (resumen.scrapTotal === 0) {
    pendientes.push('La pata de Calidad del OEE sale 100% porque Shoplogix no informa rechazo para estas maquinas, '
      + 'no porque se haya medido y dado cero. Mientras siga asi, ese 100% no es un resultado.')
  }
  if (!pendientes.length) pendientes.push('Sin observaciones: el turno no dejo pendientes de imputacion ni patrones que revisar.')

  return {
    veredictoTitulo,
    veredictoDetalle,
    veredictoBueno,
    produccionSub,
    notaLamina1,
    notaLamina2,
    notaLamina3,
    tituloLamina4,
    notaLamina4,
    notaReparto,
    notaOcupacion,
    notaLamina5,
    parrafoReunion: partes.join(' '),
    pendientes,
    pieDeFuente: `Generado automaticamente al cierre del turno desde los datos de Shoplogix. `
      + `Planta ${meta.planta}. Los tiempos son hora de planta.`,
  }
}

module.exports = { construirDatosInforme, construirTextos, etiquetaCausa, causaPrincipal, eventosDeCausa }
