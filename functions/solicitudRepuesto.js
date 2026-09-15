/**
 * El aviso de una solicitud de repuesto nueva (Telegram + push) — puro y probado.
 *
 * POR QUÉ EXISTE
 * --------------
 * 1. El enlace «Ver en Repuestos» abría `/repuestos` a secas. El módulo recuerda la última
 *    pestaña: quien estuvo por última vez en Bodega —justo quien entrega— aterrizaba en Bodega,
 *    donde NO hay botón de Solicitudes (verificado en el navegador el 15-09). Ahora el enlace
 *    lleva `?solicitudes=1`, que abre Áreas con el panel de Solicitudes abierto.
 * 2. El mensaje no decía si había stock. Bodega leía «AMORTIGUADOR ×2» sin saber si tenía
 *    que ir a buscarlo o a comprarlo. Ahora dice el stock al momento de pedir.
 */

const URL_BASE = 'https://orelcain.github.io/mantenimiento-planta'
const RUTA_SOLICITUDES = '/mantenimiento-planta/repuestos?solicitudes=1'

/** Escape mínimo para HTML de Telegram: los campos vienen de texto libre del usuario. */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** «Sin ubicación» (sembrado por el conteo rápido) y «-» (importación) no son lugares. */
function ubicacionReal(u) {
  const t = String(u ?? '').trim()
  return t && !/^[-–—.\s]*$/.test(t) && t.toLowerCase() !== 'sin ubicación' ? t : ''
}

/**
 * La línea de stock. `bodega` es el documento `bodega/{SAP}` o `null` si no existe: sin documento
 * el stock NO es cero, no se conoce.
 */
function lineaDeStock(bodega, cantidad) {
  if (!bodega || typeof bodega.stockActual !== 'number') return '📦 Sin registro en bodega'
  const unidad = String(bodega.unidad || 'pzas').trim() || 'pzas'
  const donde = ubicacionReal(bodega.ubicacionBodega)
  const lugar = donde ? ` · ${esc(donde)}` : ''
  if (bodega.stockActual <= 0) return `📦 <b>Sin stock en bodega</b>${lugar} — hay que comprarlo`
  if (cantidad > bodega.stockActual) return `📦 En bodega: ${bodega.stockActual} ${esc(unidad)}${lugar} — <b>no alcanza</b>`
  return `📦 En bodega: ${bodega.stockActual} ${esc(unidad)}${lugar}`
}

function mensajeTelegram(sol, bodega) {
  const nombre = esc(sol.textoBreve) || '(sin nombre)'
  const sap = esc(sol.codigoSAP) || '—'
  const cantidad = sol.cantidad ?? 1
  const solicitante = esc(sol.solicitadoPorNombre) || 'Desconocido'
  const obs = sol.observaciones ? `\n📝 ${esc(sol.observaciones)}` : ''
  return (
    `📦 <b>Nueva solicitud de repuesto</b>\n\n` +
    `🔧 ${nombre}\n` +
    `🏷️ SAP ${sap}  ·  Cantidad: <b>${cantidad}</b>\n` +
    `${lineaDeStock(bodega, cantidad)}\n` +
    `👤 ${solicitante}${obs}\n` +
    `🔗 <a href="${URL_BASE}/repuestos?solicitudes=1">Ver solicitudes</a>`
  )
}

module.exports = { mensajeTelegram, lineaDeStock, RUTA_SOLICITUDES, esc }
