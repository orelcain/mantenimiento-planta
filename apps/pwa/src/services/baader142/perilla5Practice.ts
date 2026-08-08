/**
 * Puente runbook → herramienta Perilla 5 (modo práctica de la BAADER 142).
 *
 * Espejo de graderHmiPractice.ts: mapea ids de contenido de la ficha baader-142
 * (diagnosis/procedures del seed) a una vista concreta de la herramienta embebida
 * (pestaña + búsqueda precargada). La herramienta lee ?t= y ?q= de su URL.
 */

export interface Perilla5Target {
  /** Pestaña de la herramienta: p0..p8, pf, pv, pm, px, pr. */
  tab: string
  /** Texto a precargar en el buscador de códigos (solo aplica con tab 'px'). */
  query?: string
  label: string
}

/** runbookId (sin prefijos de sección) → destino en la herramienta. */
export const PERILLA5_TARGETS: Record<string, Perilla5Target> = {
  'e801-e805': { tab: 'px', query: '80', label: 'Códigos E801–E805 — no encuentra el cero' },
  'e811-e815': { tab: 'px', query: '81', label: 'Códigos E811–E815 — marcha de prueba' },
  'e821-e825': { tab: 'px', query: '82', label: 'Códigos E821–E825 — no alcanzó el cero en producción' },
  'e826': { tab: 'px', query: '826', label: 'E826 — accionamiento bloqueado' },
  'e827': { tab: 'px', query: '827', label: 'E827 — extractor fuera de posición' },
  'e831-e835': { tab: 'px', query: '83', label: 'Códigos E831–E835 — inductivo defectuoso' },
  'e841-e845': { tab: 'px', query: '84', label: 'Códigos E841–E845 — tope mínimo' },
  'e851-e855': { tab: 'px', query: '85', label: 'Códigos E851–E855 — tope máximo' },
  'e861-e865': { tab: 'px', query: '86', label: 'Códigos E861–E865 — recorrido mín→cero' },
  'e777': { tab: 'px', query: '777', label: 'E777 — pescado en la entrada' },
  'e900-e999': { tab: 'px', query: '900', label: 'E900–E999 — control colgado' },
  'e770': { tab: 'px', query: '770', label: 'E770 — tarjeta del contador' },
  'e771': { tab: 'px', query: '771', label: 'E771 — transmisor B21' },
  'e772': { tab: 'px', query: '772', label: 'E772 — transmisor B22' },
  'e773': { tab: 'px', query: '773', label: 'E773 — transmisor B23' },
  'e774': { tab: 'px', query: '774', label: 'E774 — transmisor B24' },
  'e775': { tab: 'px', query: '775', label: 'E775 — transmisor B25' },
  'no-water-cooling-for-computer': { tab: 'px', query: 'water', label: 'no water-cooling — refrigeración del A3C' },
  'e8nx': { tab: 'px', label: 'Cómo se compone un código E8xx' },
  'ajustar-topes-motores': { tab: 'p5', label: 'Posición 5 — ajuste de topes de motores' },
  'ajustar-palpador-medicion': { tab: 'p4', label: 'Posición 4 — altura del palpador' },
  'ajustar-chapaleta-largos': { tab: 'p6', label: 'Posición 6 — justage y medidas' },
  'ajustar-centraje': { tab: 'p6', label: 'Posición 6 — justage y medidas' },
  'limpieza-diaria': { tab: 'p0', label: 'Posición limpieza — grifos y punto cero' },
  'limpieza-principal': { tab: 'p0', label: 'Posición limpieza — grifos y punto cero' },
  'mantenimiento-lubrificacion': { tab: 'pr', label: 'Rondas — lubricación y chequeos' },
}

/** Quita los prefijos de sección del id de contenido de la ficha 142. */
function runbookIdFromContentId(contentId: string): string {
  return contentId.replace(/^b142-(diag|proc)-/, '')
}

/** URL del modo práctica, o null si ese contenido no tiene destino mapeado. */
export function perilla5PracticeUrl(contentOrRunbookId: string): string | null {
  const runbookId = runbookIdFromContentId(contentOrRunbookId)
  const target = PERILLA5_TARGETS[runbookId]
  if (!target) return null
  const params = new URLSearchParams({ t: target.tab })
  if (target.query) params.set('q', target.query)
  return `/aprendizaje/perilla-5?${params.toString()}`
}
