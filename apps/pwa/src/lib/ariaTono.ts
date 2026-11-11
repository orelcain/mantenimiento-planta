/**
 * Tono de una respuesta de ARIA → qué clip de expresión muestra el avatar mientras habla.
 * Reglas simples y en orden: error › alerta › buena noticia › saludo › explicando (por defecto).
 * «falla» NO cuenta como alerta: ARIA explica fallas a cada rato y la cara de alerta se gastaría.
 */
export type TonoAvatar = 'saludo' | 'explicando' | 'buena_noticia' | 'error' | 'alerta'

const ERROR = /\b(no pude|no logr[eé]|no se pudo|int[eé]ntalo de nuevo|lo siento|perd[oó]n|sin conexi[oó]n|hubo un error|ocurri[oó] un error)/i
const ALERTA = /\b(atenci[oó]n|alerta|urgente|cr[ií]tic[oa]|peligro|detenid[oa])\b/i
const BUENA = /\b(buena noticia|resuelt[oa]|solucionad[oa]|ya est[aá] funcionando|operativ[oa] de nuevo|excelente|felicitaciones|mejor[oó])/i
const SALUDO = /^\s*[¡!]?\s*(hola|buen[oa]s (d[ií]as|tardes|noches))\b/i

export function tonoDeTexto(texto: string): TonoAvatar {
  const t = (texto || '').slice(0, 400) // el tono se decide al inicio de la respuesta
  if (ERROR.test(t)) return 'error'
  if (ALERTA.test(t)) return 'alerta'
  if (BUENA.test(t)) return 'buena_noticia'
  if (SALUDO.test(t)) return 'saludo'
  return 'explicando'
}
