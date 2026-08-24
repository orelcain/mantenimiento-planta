/**
 * Vocabulario de planta: cómo se dice acá vs cómo lo escribió el fabricante.
 *
 * El catálogo BAADER está en castellano de traducción alemana ("cojinete",
 * "atarjea", "arandela") y el técnico escribe la palabra que usa a diario
 * ("descanso", "canaleta", "golilla").
 *
 * Estos 23 salieron VALIDADOS contra el vocabulario real del catálogo 2006 (se
 * descartó "rodamiento" porque el propio catálogo ya lo usa 22 veces), y 22 de
 * los 23 tienen destino en los catálogos de fabricante que consume Repuestos.
 *
 * Vive acá y no dentro del índice de un plano porque lo usan DOS módulos:
 * Planos lo traía en su índice y Repuestos no lo tenía — buscar "golilla" daba
 * 60 resultados en uno y "Sin resultados" en el otro, con 135 arandelas en el
 * catálogo.
 */
export const SINONIMOS_PLANTA: Record<string, string> = {
  aceite: 'lubrificante',
  balero: 'cojinete',
  bocina: 'casquillo',
  canaleta: 'atarjea',
  chumacera: 'cojinete',
  codo: 'angulo',
  cuchillo: 'cuchilla',
  descanso: 'cojinete',
  electrovalvula: 'valvula',
  fotocelula: 'proximidad',
  golilla: 'arandela',
  grampa: 'abrazadera',
  huincha: 'cinta',
  manija: 'palanca',
  manilla: 'palanca',
  oring: 'anillo',
  pinon: 'rueda dentada',
  prensa: 'abrazadera',
  rasqueta: 'rascador',
  reductor: 'engranaje',
  sello: 'junta',
  sensor: 'proximidad',
  solenoide: 'valvula',
}

/** El término del fabricante para lo que se escribió, si lo hay. */
export function sinonimoDe(consulta: string): string | null {
  return SINONIMOS_PLANTA[consulta.trim().toLowerCase()] ?? null
}
