import { doc, writeBatch } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION } from '@/config/bitacora'
import type { EquipoElegido } from '@/services/lineasProceso/pendientesDeUbicar'

/** Firestore acepta hasta 500 escrituras por lote. */
const LOTE = 400

/**
 * «Es este equipo»: corrige, en todos los eventos que lo nombraron a mano, el equipo por el
 * real (Orel, 21-09-2026: el técnico escribió «baader 143» y era la BAADER 142 N1).
 *
 * Se reescriben SOLO los tres campos del equipo —nombre, id del árbol y código SAP—; la
 * descripción, la hora y el resto quedan como los escribió el técnico. Es la misma corrección
 * que haría él abriendo el evento y eligiéndolo del buscador, hecha de una vez para todos.
 *
 * ⚠ Las reglas de la bitácora dejan que cualquier usuario activo edite esos campos, así que no
 * hace falta regla nueva. Pero `eventoValido` corre sobre el documento completo: si un evento
 * viejo ya no pasara la validación por otro campo, ese `update` falla y el lote entero se
 * rechaza. Por eso se escribe en lotes chicos y se devuelve cuántos quedaron.
 */
export async function reubicarEquipoDeEventos(ids: readonly string[], equipo: EquipoElegido): Promise<{ corregidos: number }> {
  let corregidos = 0
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = writeBatch(db)
    const tanda = ids.slice(i, i + LOTE)
    for (const id of tanda) {
      lote.update(doc(db, BITACORA_COLECCION, id), {
        equipo: equipo.nombre,
        equipoId: equipo.id,
        equipoCodigo: equipo.codigo || null,
      })
    }
    await lote.commit()
    corregidos += tanda.length
  }
  return { corregidos }
}
