import { nombreVisible, type NombreVisible } from './nombreVisible'

type FuenteNombre = {
  codigoSAP?: string | null
  textoBreve?: string | null
  nombresComunes?: readonly string[] | null
  alias?: string | null
  descripcion?: string | null
}

/** Hay al menos un nombre común con texto (un `['   ']` no cuenta). */
export const tieneComun = (r: { nombresComunes?: readonly string[] | null }): boolean =>
  !!r.nombresComunes?.some((n) => n.trim())

const claveSap = (sap?: string | null): string => (sap ?? '').trim()

/**
 * Índice SAP -> repuesto del catálogo ya cargado. Si un SAP aparece en varias filas
 * (una por máquina) gana la primera que trae nombre común.
 */
export function indicePorSap<T extends FuenteNombre>(items: readonly T[]): Map<string, T> {
  const mapa = new Map<string, T>()
  for (const it of items) {
    const sap = claveSap(it.codigoSAP)
    if (!sap) continue
    const previo = mapa.get(sap)
    if (!previo || (!tieneComun(previo) && tieneComun(it))) mapa.set(sap, it)
  }
  return mapa
}

/**
 * Nombre para MOSTRAR de algo que persiste solo `textoBreve` (solicitud, conteo):
 * se resuelve contra el catálogo por SAP; si no está, se usa el texto guardado.
 * No modifica lo persistido.
 */
export function nombreVisiblePorSap(
  indice: ReadonlyMap<string, FuenteNombre>,
  codigoSAP: string | null | undefined,
  textoBreveGuardado?: string | null,
): NombreVisible {
  const cat = indice.get(claveSap(codigoSAP))
  return nombreVisible({
    textoBreve: cat?.textoBreve?.trim() || textoBreveGuardado || codigoSAP || '',
    nombresComunes: cat?.nombresComunes,
    alias: cat?.alias,
    descripcion: cat?.descripcion,
  })
}

/** Título corto para diálogos y avisos: el nombre visible, o el SAP si no hay ningún nombre. */
export function tituloOCodigo(r: FuenteNombre): string {
  const tieneNombre = !!(r.textoBreve?.trim() || r.nombresComunes?.some((n) => n.trim()))
  return !tieneNombre && r.codigoSAP?.trim() ? r.codigoSAP.trim() : nombreVisible(r).titulo
}

/**
 * Texto corrido para ARIA: «Cuchillo circular baader 200 (SAP: Cuchillo 94011760)».
 * Con nombre común va primero y el nombre SAP entre paréntesis. Sin nombre común queda el texto
 * SAP tal cual llega (no se reformatea el chat para quien no tiene apodo).
 */
export function nombreParaTexto(r: FuenteNombre): string {
  const nv = nombreVisible(r)
  if (!nv.esComun) return r.textoBreve?.trim() || r.descripcion?.trim() || '(sin nombre)'
  return nv.oficial ? `${nv.titulo} (SAP: ${nv.oficial})` : nv.titulo
}

/** Texto buscable de un repuesto para ARIA: nombre SAP, descripción, TODOS los nombres comunes, SAP y fabricante. */
export function textoBuscableRepuesto(r: FuenteNombre & { codigoFabricante?: string | null }, extra = ''): string {
  return [r.textoBreve, r.descripcion, ...(r.nombresComunes ?? []), r.codigoSAP, r.codigoFabricante, extra]
    .map((t) => t || '')
    .join(' ')
}
