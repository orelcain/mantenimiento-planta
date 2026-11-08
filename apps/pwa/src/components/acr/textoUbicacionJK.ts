import { Q } from '@/components/grader/jackKnifePresentacion'
import { dec, dec1 } from '@/utils/formatoNumeros'
import type { UbicacionJK } from './useUbicacionJK'

/**
 * El texto de «En el Jack-Knife» para una ubicación: detalle y nivel. Lo usan la hoja del celular
 * (`AcrLectura`) y el panel de PC (`AcrDocumento`), para que digan lo mismo.
 */
export function textoUbicacionJK(u: UbicacionJK): { detalle: string; nivel: string | null } {
  if (u.estado === 'cargando') return { detalle: 'Leyendo el Jack-Knife…', nivel: null }
  if (u.estado === 'error') return { detalle: 'No se pudo leer el Jack-Knife.', nivel: null }
  if (!u.punto) return { detalle: 'Sin detenciones en los últimos 90 días', nivel: null }
  const p = u.punto
  return {
    detalle: `${Q[p.q].t}, ${p.ev} detenciones de ${dec1(p.mttr)} min, ${dec(p.min, 0)} min en ${u.turnos} turnos`,
    nivel: u.nivel !== null ? `Nivel ${u.nivel} de 5` : null,
  }
}
