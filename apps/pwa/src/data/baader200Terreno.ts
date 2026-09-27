/**
 * Manual de ajustes BAADER 200 · «referencia de terreno».
 * Tipos, fuentes y ayudas viven en `baader200TerrenoTipos.ts`; cada sección en
 * `baader200TerrenoSecciones/<id>.ts`. Aquí solo se ensamblan y se deriva el índice.
 */
export * from './baader200TerrenoTipos'
import type { SeccionTerreno } from './baader200TerrenoTipos'
import { seccion as s_cuchillos_cola_contrabancadas } from './baader200TerrenoSecciones/cuchillos-cola-contrabancadas'
import { seccion as s_cuchillos_dorsales } from './baader200TerrenoSecciones/cuchillos-dorsales'
import { seccion as s_cuchillos_punzones } from './baader200TerrenoSecciones/cuchillos-punzones'
import { seccion as s_cuchillos_rascadores_ajuste } from './baader200TerrenoSecciones/cuchillos-rascadores-ajuste'
import { seccion as s_cuchillos_rascadores_altura } from './baader200TerrenoSecciones/cuchillos-rascadores-altura'
import { seccion as s_cuchillos_ventrales } from './baader200TerrenoSecciones/cuchillos-ventrales'
import { seccion as s_embrague } from './baader200TerrenoSecciones/embrague'
import { seccion as s_guias_espinas_superiores } from './baader200TerrenoSecciones/guias-espinas-superiores'
import { seccion as s_guias_flotantes } from './baader200TerrenoSecciones/guias-flotantes'
import { seccion as s_levantadores_aletas } from './baader200TerrenoSecciones/levantadores-aletas'
import { seccion as s_mando_cuchillos_dorsales } from './baader200TerrenoSecciones/mando-cuchillos-dorsales'
import { seccion as s_medidas_cuchillos } from './baader200TerrenoSecciones/medidas-cuchillos'
import { seccion as s_primera_alimentacion } from './baader200TerrenoSecciones/primera-alimentacion'
import { seccion as s_segunda_alimentacion } from './baader200TerrenoSecciones/segunda-alimentacion'

/** Las 14 secciones de ajuste, en el orden de la ficha (mismos ids que `baader200-sections`). */
export const SECCIONES_TERRENO: SeccionTerreno[] = [
  s_cuchillos_cola_contrabancadas,
  s_cuchillos_dorsales,
  s_cuchillos_punzones,
  s_cuchillos_rascadores_ajuste,
  s_cuchillos_rascadores_altura,
  s_cuchillos_ventrales,
  s_embrague,
  s_guias_espinas_superiores,
  s_guias_flotantes,
  s_levantadores_aletas,
  s_mando_cuchillos_dorsales,
  s_medidas_cuchillos,
  s_primera_alimentacion,
  s_segunda_alimentacion,
].sort((a, b) => a.orden - b.orden)

/** Índice para la hoja «Secciones», la barra anterior/siguiente y el buscador: derivado de las secciones. */
export interface EntradaIndice {
  numero: string
  titulo: string
  zona: string
  id?: string
}

export const INDICE_TERRENO: EntradaIndice[] = SECCIONES_TERRENO.map(s => ({
  numero: String(s.orden),
  titulo: s.titulo,
  zona: s.zona,
  id: s.id,
}))

export function getSeccionTerreno(id: string): SeccionTerreno | undefined {
  return SECCIONES_TERRENO.find(s => s.id === id)
}
