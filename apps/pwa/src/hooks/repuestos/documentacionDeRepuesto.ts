import type { Repuesto } from '@/types/repuestos'

/**
 * Qué documentación carga un repuesto — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * El panel del repuesto ofrece «Ficha», «Fotos» y «Manual» con el MISMO aspecto tenga o no
 * tenga contenido. Medido sobre los 7.673 documentos del catálogo el 13-09:
 *
 *     ficha técnica     8 (0,1 %)
 *     foto real        76 (1,0 %)
 *     vínculo a manual  3 (0,04 %)
 *
 * O sea: ~99 de cada 100 clics en esos botones caen en un formulario vacío, y las 8 piezas que
 * alguien SÍ documentó son indistinguibles de las 7.665 que no. El trabajo de documentar no se
 * ve, y lo que no se ve no demuestra nada.
 *
 * `fotosCatalogo` ya se calculaba suelto dentro de `useBodega`; ficha y manual no se calculaban
 * en ninguna parte. Van juntos acá para que el badge del botón y lo que el botón abre salgan de
 * la misma expresión — el defecto recurrente de este módulo (ver `filtrosDeStock.ts`).
 */

export interface DocumentacionDeRepuesto {
  /** URLs de foto, priorizando foto real sobre captura del manual. */
  fotos: string[]
  /** ¿Tiene ficha técnica cargada? */
  tieneFicha: boolean
  /** Cuántos manuales/documentos vinculados. */
  manuales: number
  /** URL → equipos de las capturas de manual que dicen a qué equipos corresponden. */
  equiposDeFoto?: Record<string, string[]>
  /** Capturas del manual que son el DIBUJO de la pieza (con la posición marcada): el respaldo
   *  del botón «Dibujo» cuando la máquina no tiene despiece navegable. */
  dibujosManual?: DibujoManual[]
}

/** Una captura del manual con la pieza marcada, y su rótulo corto («fig. 65 · pos. 3»). */
export interface DibujoManual {
  url: string
  rotulo: string
  equipos?: string[]
}

export const SIN_DOCUMENTACION: DocumentacionDeRepuesto = { fotos: [], tieneFicha: false, manuales: 0 }

/**
 * Una ficha vacía no cuenta como ficha.
 *
 * El modal guarda `{ type: 'general', standardValues: {}, customFields: [] }` en cuanto alguien
 * lo abre y pulsa guardar sin escribir nada. Si eso contara, el badge prometería contenido que
 * no existe — justo lo que este módulo viene a evitar.
 */
function fichaConContenido(rep: Repuesto): boolean {
  const specs = rep.technicalSpecs
  if (!specs) return false
  const valores = Object.values(specs.standardValues ?? {}).filter((v) => v !== '' && v != null)
  return valores.length > 0 || (specs.customFields?.length ?? 0) > 0 || !!specs.notes?.trim()
}

export function documentacionDe(rep: Repuesto): DocumentacionDeRepuesto {
  const equiposDeFoto: Record<string, string[]> = {}
  for (const i of rep.imagenesManual || []) {
    if (i.url && Array.isArray(i.equipos) && i.equipos.length) equiposDeFoto[i.url] = i.equipos
  }
  // La «vista general» va primero: es el dibujo con la pieza marcada. El recorte de cerca
  // («código enmarcado») es la misma imagen que la miniatura de la fila, y abrir el botón
  // «Dibujo» en él se leía como «muestra la foto» (Danilo, 23-10-2026, Knuro 999 0216).
  const dibujosManual = [...(rep.imagenesManual || [])]
    .sort((a, b) => Number(esVistaGeneral(b.descripcion)) - Number(esVistaGeneral(a.descripcion)))
    .flatMap((i) => {
      const rotulo = i.url ? rotuloDeReferencia(i.descripcion) : null
      return rotulo ? [{ url: i.url, rotulo, ...(i.equipos?.length ? { equipos: i.equipos } : {}) }] : []
    })
  return {
    fotos: [...(rep.fotosReales || []), ...(rep.imagenesManual || []), ...(rep.gallery || [])]
      .map((i) => i.url)
      .filter(Boolean),
    tieneFicha: fichaConContenido(rep),
    manuales: (rep.vinculosManual || []).length,
    ...(Object.keys(equiposDeFoto).length ? { equiposDeFoto } : {}),
    ...(dibujosManual.length ? { dibujosManual } : {}),
  }
}

/**
 * Del texto de una captura del manual a un rótulo corto, o null si no es una captura con la
 * pieza ubicada. Las cuatro fuentes que hay (medido 16-10-2026, 4.099 capturas):
 *   «Referencia despiece Baader 200 pág. 178 - Fig. 22-1 pos. 55 (519437)» → «fig. 22-1 · pos. 55»
 *   «Referencia GEA PowerPak 5550 · catálogo mecánico pág. 102 - pos. 50 (…)» → «pág. 102 · pos. 50»
 *   «Referencia Marel filete · libro de repuestos 8009254 pág. 8 - dibujo 3519267 pos. 7 (…)» → «dibujo 3519267 · pos. 7»
 *   «Referencia manual Knuro KF 3.01 pág. 120 - 999 0608 (vista general)» → «pág. 120»
 */
export function rotuloDeReferencia(descripcion: string | undefined | null): string | null {
  const d = (descripcion ?? '').trim()
  if (!/^Referencia\b/i.test(d)) return null
  const fig = d.match(/\bFig\.\s*([\w.-]+)/i)?.[1]
  const dib = d.match(/\bdibujo\s+([\w.-]+)/i)?.[1]
  const pag = d.match(/\bpág\.\s*(\d+)/i)?.[1]
  const pos = d.match(/\bpos\.\s*([\w-]+)/i)?.[1]
  const donde = fig ? `fig. ${fig}` : dib ? `dibujo ${dib}` : pag ? `pág. ${pag}` : null
  if (!donde) return null
  return pos ? `${donde} · pos. ${pos}` : donde
}

/** ¿La captura es la vista general de la figura (no el recorte de cerca del código)? */
function esVistaGeneral(descripcion: string | undefined | null): boolean {
  return /\(vista general\)/i.test(descripcion ?? '')
}

/**
 * El dibujo del manual que corresponde a lo que se mira: con un equipo en foco, el de SU manual
 * (misma regla que `fotosParaEquipos`). Devuelve todas las capturas visibles para recorrerlas en
 * el visor y el rótulo de la primera.
 */
export function dibujoDeManual(
  dibujos: readonly DibujoManual[] | undefined,
  contexto: readonly string[] | null | undefined,
): { urls: string[]; rotulo: string } | null {
  if (!dibujos?.length) return null
  const enFoco = contexto?.length ? dibujos.filter((d) => !d.equipos || d.equipos.some((id) => contexto.includes(id))) : []
  const lista = enFoco.length ? enFoco : dibujos
  return { urls: lista.map((d) => d.url), rotulo: lista[0]!.rotulo }
}

/**
 * Las fotos que corresponden a lo que se está mirando.
 *
 * Una pieza estándar (p. ej. un tornillo Baader) se usa en la 142 y en la 200 y tiene una
 * captura de cada manual: mirando la 142 debe verse el dibujo de la 142, no el de la 200
 * (Danilo, 11-10-2026: «la segunda foto no tiene ningún repuesto»). Reglas:
 * - sin equipo en contexto (búsqueda general): todas;
 * - fotos sin `equipos` (reales, galería, capturas antiguas): siempre;
 * - si el filtro dejara la fila sin fotos, se muestran todas (mejor una foto de otra máquina
 *   que ninguna).
 */
export function fotosParaEquipos(
  fotos: readonly string[],
  equiposDeFoto: Readonly<Record<string, readonly string[]>> | undefined,
  contexto: readonly string[] | null | undefined,
): string[] {
  if (!contexto?.length || !equiposDeFoto) return [...fotos]
  const visibles = fotos.filter((u) => {
    const eq = equiposDeFoto[u]
    return !eq || eq.some((id) => contexto.includes(id))
  })
  return visibles.length ? visibles : [...fotos]
}

/**
 * Lo mejor de dos documentos de la MISMA pieza.
 *
 * Un repuesto aparece N veces en la colección plana (una por equipo) y a veces son documentos
 * distintos con el mismo SAP — `3300138387` tiene dos. Antes solo se rescataban las fotos del
 * duplicado: una ficha que viviera en el segundo documento se perdía por el orden de llegada.
 */
export function fusionarDocumentacion(
  a: DocumentacionDeRepuesto,
  b: DocumentacionDeRepuesto,
): DocumentacionDeRepuesto {
  const equiposDeFoto = a.equiposDeFoto || b.equiposDeFoto ? { ...b.equiposDeFoto, ...a.equiposDeFoto } : undefined
  return {
    fotos: a.fotos.length ? a.fotos : b.fotos,
    tieneFicha: a.tieneFicha || b.tieneFicha,
    manuales: Math.max(a.manuales, b.manuales),
    ...(equiposDeFoto ? { equiposDeFoto } : {}),
    ...(a.dibujosManual?.length || b.dibujosManual?.length ? { dibujosManual: a.dibujosManual?.length ? a.dibujosManual : b.dibujosManual } : {}),
  }
}
