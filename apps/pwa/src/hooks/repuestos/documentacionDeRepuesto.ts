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
  return {
    fotos: [...(rep.fotosReales || []), ...(rep.imagenesManual || []), ...(rep.gallery || [])]
      .map((i) => i.url)
      .filter(Boolean),
    tieneFicha: fichaConContenido(rep),
    manuales: (rep.vinculosManual || []).length,
  }
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
  return {
    fotos: a.fotos.length ? a.fotos : b.fotos,
    tieneFicha: a.tieneFicha || b.tieneFicha,
    manuales: Math.max(a.manuales, b.manuales),
  }
}
