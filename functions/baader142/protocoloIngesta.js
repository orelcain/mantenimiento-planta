/**
 * protocoloIngesta — un mensaje por video, al tema de esa máquina.
 *
 * Por qué existe: las lecturas del protocolo ahora entran por video (el operador graba
 * las 13 pantallas y lo sube al tema `PROTOCOLO BAA142 Nx`). El watcher local las
 * transcribe e ingesta, pero ese trabajo era invisible desde Telegram: si el barrido
 * quedaba incompleto, el video se rechazaba en silencio y nadie se enteraba. Eso ya
 * pasó con el video del 21-08-2026 de la N2.
 *
 * Regla de diseño: UN mensaje por video, en el tema de esa unidad. Ni acuse de
 * recibido ni "procesando" — el canal donde trabaja el operador se llena de ruido y
 * se deja de leer. El detalle de tendencia sigue yendo al DM por protocoloAlertas.
 *
 * Todo acá es función pura sobre datos ya leídos: se puede probar sin Firestore.
 */

const { MAQUINAS, UMBRALES, HERRAMIENTAS, tasa1000, nivelDeTasa } = require('./protocoloAlertas')

const URL_PROTOCOLO =
  'https://orelcain.github.io/mantenimiento-planta/aprendizaje/perilla-5?vista=protocolo'

/**
 * Link que cae en la MAQUINA del aviso. Sin esto la pagina abre en N1 por
 * defecto y el operador de la N2 tiene que darse cuenta y cambiar.
 */
function urlProtocolo(maquina) {
  const sufijo = typeof maquina === 'string' ? maquina.replace('baader-', '') : ''
  return sufijo ? `${URL_PROTOCOLO}&maquina=${sufijo}` : URL_PROTOCOLO
}

/** Los 17 contadores, con el rótulo que muestra el display. */
const ROTULOS = {
  tclip: 'TAIL CLIP', tclipc: 'T-CLIP-C', anusi: 'ANUS-I', anuso: 'ANUS-O',
  stops: 'STOPS', stopc: 'STOP-C', fish: 'FISH',
  e821: 'E821', e821c: 'E821-C', e822: 'E822', e822c: 'E822-C',
  e823: 'E823', e823c: 'E823-C', e824: 'E824', e824c: 'E824-C',
  e825: 'E825', e825c: 'E825-C',
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-CL')
}

function emojiDeNivel(nivel) {
  if (nivel === 'critico') return '🔴'
  if (nivel === 'intervenir') return '🟠'
  if (nivel === 'vigilar') return '🟡'
  return '🟢'
}

/**
 * Mensaje de una ingesta rechazada.
 *
 * Se listan los contadores que faltan con su rótulo del display, no con la clave
 * interna: el operador busca `TAIL CLIP` en el panel, no `tclip`.
 */
function componerRechazo(ing) {
  const maq = MAQUINAS[ing.maquina] || ing.maquina
  const l = [
    `⚠️ <b>Protocolo · ${maq}</b>`,
    `Video del ${ing.fecha} recibido y leído${ing.fish ? ` · ${fmtNum(ing.fish)} pescados` : ''}`,
    '',
  ]

  if (ing.regla === 'F7' && Array.isArray(ing.faltantes) && ing.faltantes.length) {
    const rot = ing.faltantes.map((k) => `<code>${ROTULOS[k] || k}</code>`).join(', ')
    l.push('<b>No se pudo cargar:</b> el barrido quedó incompleto.')
    l.push(`Faltan ${rot}.`)
    l.push('')
    l.push('Grabá otro barrido que llegue hasta <code>E825-C</code>, o completá')
    l.push('esos valores a mano en la app.')
  } else {
    l.push(`<b>No se pudo cargar</b> (${ing.regla || 'error'}).`)
    if (ing.mensaje) l.push(ing.mensaje)
  }

  l.push('')
  l.push(`🔗 <a href="${urlProtocolo(ing.maquina)}">Abrir el protocolo</a>`)
  return l.join('\n')
}

/**
 * Mensaje de una ingesta exitosa: confirma que la PWA ya tiene el dato y dice
 * qué mirar. A diferencia de protocoloAlertas, este NO calla cuando está sana:
 * el operador subió un video y necesita saber que llegó.
 */
function componerCargada(ing) {
  const maq = MAQUINAS[ing.maquina] || ing.maquina
  const fish = Number(ing.fish) || 0

  const evaluadas = HERRAMIENTAS
    .map((h) => {
      const tasa = tasa1000(ing[h.c], fish)
      return { ...h, tasa, nivel: nivelDeTasa(tasa) }
    })
    .sort((a, b) => b.tasa - a.tasa)

  const conAlerta = evaluadas.filter((h) => h.nivel !== 'normal')
  const peor = conAlerta.length ? conAlerta[0].nivel : 'normal'

  // Sin 1000 pescados el panel todavía no muestra /1000Fi: las tasas no significan
  // nada y presentarlas con semáforo sería mentir. La cabecera tampoco lleva
  // semáforo — un 🔴 arriba y un "no se compara" abajo se contradicen.
  if (fish < 1000) {
    const l = [
      `⚠️ <b>Protocolo · ${maq}</b>`,
      `Lectura del ${ing.fecha} cargada · ${fmtNum(fish)} pescados`,
    ]
    l.push('')
    l.push('⚠️ <b>Muestra insuficiente</b> (menos de 1.000 pescados).')
    l.push('El panel no calcula /1000Fi todavía: la lectura queda guardada pero')
    l.push('no se compara ni dispara semáforo.')
    l.push('')
    l.push(`🔗 <a href="${urlProtocolo(ing.maquina)}">Ver la tendencia</a>`)
    return l.join('\n')
  }

  const l = [
    `${emojiDeNivel(peor)} <b>Protocolo · ${maq}</b>`,
    `Lectura del ${ing.fecha} cargada · ${fmtNum(fish)} pescados`,
  ]

  l.push('')
  if (conAlerta.length === 0) {
    l.push('🟢 Las cinco herramientas por debajo de')
    l.push(`${UMBRALES.vigilar} correcciones /1000. Nada que revisar.`)
  } else {
    for (const h of conAlerta) {
      const cab = h.nivel === 'critico' ? '🔴 CRÍTICO'
        : h.nivel === 'intervenir' ? '🟠 Intervenir' : '🟡 Vigilar'
      l.push(`${cab} · <b>${h.nombre} ${h.sm}</b>: <b>${h.tasa}</b> /1000`)
    }
    const orden = HERRAMIENTAS.map((h) => h.sm)
    const sanas = evaluadas
      .filter((h) => h.nivel === 'normal')
      .sort((a, b) => orden.indexOf(a.sm) - orden.indexOf(b.sm))
    if (sanas.length) {
      l.push(`🟢 Sin novedad: ${sanas.map((h) => h.sm).join(' · ')}`)
    }
    l.push('')
    const p = conAlerta[0]
    l.push(`<b>A revisar primero:</b> ${p.nombre} (${p.sm}) — motor paso a paso ${p.sm.slice(2)},`)
    l.push(`inductivo ${p.ind}, su cable y bloqueos mecánicos.`)
  }

  l.push('')
  l.push(`🔗 <a href="${urlProtocolo(ing.maquina)}">Ver la tendencia</a>`)
  return l.join('\n')
}

/** Un mensaje por video. Devuelve null si el doc no es accionable. */
function componerIngesta(ing) {
  if (!ing || !ing.maquina || !ing.fecha) return null
  if (ing.resultado === 'ok') return componerCargada(ing)
  if (ing.resultado === 'rechazado') return componerRechazo(ing)
  return null
}

module.exports = {
  ROTULOS,
  URL_PROTOCOLO,
  componerIngesta,
  componerCargada,
  componerRechazo,
}
