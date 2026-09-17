/**
 * Repuestos usados en un evento de la bitácora (16-09-2026): se agregan por
 * código SAP (una lectura) o buscando por nombre entre los repuestos del
 * equipo elegido (una consulta por equipo por sesión). NO se carga el maestro
 * completo: son 7.673 documentos y el proyecto tiene techo de costos.
 */

export interface RepuestoDelCatalogo {
  codigoSAP: string
  nombre: string
  /** Ubicación en bodega o planta ("C-6"), si el maestro la tiene. */
  ubicacion: string
}

export interface FuenteRepuestos {
  porCodigo(codigo: string): Promise<RepuestoDelCatalogo | null>
  delEquipo(equipoId: string): Promise<RepuestoDelCatalogo[]>
}

/** "3300 0116 12" → "3300011612". */
export function limpiarCodigo(texto: string): string {
  return texto.replace(/\s+/g, '').trim()
}

/** Un código SAP de material: solo dígitos, entre 6 y 12. */
export function esCodigoSap(codigo: string): boolean {
  return /^\d{6,12}$/.test(codigo)
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Busca por palabras (todas deben aparecer) en el código y el nombre. Primero
 * los que empiezan con lo escrito; a igualdad, por nombre.
 */
export function buscarRepuestos(lista: readonly RepuestoDelCatalogo[], texto: string, max = 8): RepuestoDelCatalogo[] {
  const q = normalizar(texto)
  if (q.length < 2) return []
  const palabras = q.split(' ')
  return lista
    .map((r) => ({ r, indice: normalizar(`${r.codigoSAP} ${r.nombre}`), nombre: normalizar(r.nombre) }))
    .filter((x) => palabras.every((p) => x.indice.includes(p)))
    .sort((a, b) => {
      const pa = a.nombre.startsWith(q) || a.r.codigoSAP.startsWith(q) ? 0 : 1
      const pb = b.nombre.startsWith(q) || b.r.codigoSAP.startsWith(q) ? 0 : 1
      return pa - pb || a.nombre.localeCompare(b.nombre, 'es')
    })
    .slice(0, max)
    .map((x) => x.r)
}

/** Del documento del maestro a lo que usa la bitácora (null si no tiene código SAP). */
export function desdeDocumento(_id: string, d: Record<string, unknown>): RepuestoDelCatalogo | null {
  const codigoSAP = String(d.codigoSAP ?? '').trim()
  if (!esCodigoSap(codigoSAP)) return null
  return {
    codigoSAP,
    nombre: String(d.textoBreve || d.descripcion || d.alias || d.nombreManual || '').trim(),
    ubicacion: String(d.ubicacionEnPlanta ?? d.ubicacionBodega ?? '').trim(),
  }
}
