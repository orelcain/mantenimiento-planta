/**
 * Repuestos usados en un evento de la bitácora (16/17-09-2026). Un buscador con
 * dos alcances: «En este equipo» (los vinculados al equipo elegido: una
 * consulta por equipo por sesión) y «Todos» (el índice liviano
 * `repuestosIndice/sap`: un documento de ~180 KB con código, nombre SAP y
 * nombre común, que se baja una vez por sesión). NO se carga el maestro
 * completo: son 7.700 documentos y el proyecto tiene techo de costos.
 */

export interface RepuestoDelCatalogo {
  codigoSAP: string
  nombre: string
  /** Primer nombre común del maestro ('' si no tiene). */
  nombreComun: string
  /** Ubicación en bodega o planta ("C-6"), si el maestro la tiene. */
  ubicacion: string
}

/** Lo que bodega sabe de un SAP (colección `bodega/{sap}`). */
export interface DatoBodega {
  ubicacion: string
  stock: number | null
  unidad: string
}

export interface FuenteRepuestos {
  porCodigo(codigo: string): Promise<RepuestoDelCatalogo | null>
  delEquipo(equipoId: string): Promise<RepuestoDelCatalogo[]>
  /** Todos los materiales con SAP (desde el índice liviano). */
  todos(): Promise<RepuestoDelCatalogo[]>
  /** Ubicación y stock en bodega de hasta unos pocos códigos (una lectura por código). */
  bodegaDe(codigos: readonly string[]): Promise<Map<string, DatoBodega>>
  /** Guarda el nombre común en la ficha del repuesto (primero de `nombresComunes`). */
  guardarNombreComun(codigo: string, nombreComun: string): Promise<void>
}

/** Alcance del buscador: los del equipo elegido o todos los materiales con SAP. */
export type AlcanceBusqueda = 'equipo' | 'todos'

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
 * Busca por palabras (todas deben aparecer) en el código, el nombre SAP y el
 * nombre común. Primero lo que EMPIEZA con lo escrito (nombre común, nombre o
 * código); a igualdad, por nombre.
 */
export function buscarRepuestos(
  lista: readonly RepuestoDelCatalogo[],
  texto: string,
  max = 8,
  /** Códigos que van primero (los favoritos del usuario), antes de cortar en `max`. */
  primero?: ReadonlySet<string>,
): RepuestoDelCatalogo[] {
  const q = normalizar(texto)
  if (q.length < 2) return []
  const palabras = q.split(' ')
  return lista
    .map((r) => ({
      r,
      indice: normalizar(`${r.codigoSAP} ${r.nombre} ${r.nombreComun}`),
      nombre: normalizar(r.nombre),
      comun: normalizar(r.nombreComun),
    }))
    .filter((x) => palabras.every((p) => x.indice.includes(p)))
    .sort((a, b) => {
      const fa = primero?.has(a.r.codigoSAP) ? 0 : 1
      const fb = primero?.has(b.r.codigoSAP) ? 0 : 1
      if (fa !== fb) return fa - fb
      const pa = a.comun.startsWith(q) || a.nombre.startsWith(q) || a.r.codigoSAP.startsWith(q) ? 0 : 1
      const pb = b.comun.startsWith(q) || b.nombre.startsWith(q) || b.r.codigoSAP.startsWith(q) ? 0 : 1
      return pa - pb || (a.comun || a.nombre).localeCompare(b.comun || b.nombre, 'es')
    })
    .slice(0, max)
    .map((x) => x.r)
}

/**
 * «Solo mis favoritos»: los favoritos que están en `lista` (la del equipo o la
 * de todos). Sin texto (o con menos de 2 letras), todos por nombre, para verlos
 * sin escribir; con texto, se busca dentro de ellos.
 */
export function favoritosDeLista(
  lista: readonly RepuestoDelCatalogo[],
  favoritos: ReadonlySet<string>,
  texto: string,
): RepuestoDelCatalogo[] {
  const favs = lista.filter((r) => favoritos.has(r.codigoSAP))
  if (normalizar(texto).length >= 2) return buscarRepuestos(favs, texto, favs.length)
  return [...favs].sort((a, b) => (a.nombreComun || a.nombre).localeCompare(b.nombreComun || b.nombre, 'es'))
}

/** Los favoritos de repuestos del usuario (la misma lista de Repuestos y el Centro Técnico). */
export interface FavoritosRepuestos {
  /** Claves marcadas: el código SAP (o `fab:…` para piezas sin SAP, que aquí no aparecen). */
  claves: ReadonlySet<string>
  alternar: (codigoSAP: string) => void
}

/** Las entradas del índice `repuestosIndice/sap` (`m: {sap: [nombre, comun]}`) como lista. */
export function desdeIndice(m: Record<string, unknown> | null | undefined): RepuestoDelCatalogo[] {
  const salida: RepuestoDelCatalogo[] = []
  for (const [codigoSAP, v] of Object.entries(m ?? {})) {
    if (!esCodigoSap(codigoSAP) || !Array.isArray(v)) continue
    salida.push({ codigoSAP, nombre: String(v[0] ?? '').trim(), nombreComun: String(v[1] ?? '').trim(), ubicacion: '' })
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Los nombres comunes con el nuevo al frente (sin repetirlo); '' lo quita del frente. */
export function conNombreComunAlFrente(actuales: readonly unknown[] | null | undefined, nuevo: string): string[] {
  const limpio = nuevo.trim().replace(/\s+/g, ' ').slice(0, 80)
  const resto = (actuales ?? []).map((s) => String(s ?? '').trim()).filter((s) => s && s.toLowerCase() !== limpio.toLowerCase())
  return limpio ? [limpio, ...resto] : resto
}

/** Del documento del maestro a lo que usa la bitácora (null si no tiene código SAP). */
export function desdeDocumento(_id: string, d: Record<string, unknown>): RepuestoDelCatalogo | null {
  const codigoSAP = String(d.codigoSAP ?? '').trim()
  if (!esCodigoSap(codigoSAP)) return null
  return {
    codigoSAP,
    nombre: String(d.textoBreve || d.descripcion || d.alias || d.nombreManual || '').trim(),
    nombreComun: Array.isArray(d.nombresComunes) ? String(d.nombresComunes[0] ?? '').trim() : '',
    ubicacion: String(d.ubicacionEnPlanta ?? d.ubicacionBodega ?? '').trim(),
  }
}
