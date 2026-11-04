/**
 * Lo que no se dice en ningún texto visible de las causas de las micro (decisión de Mantención, 03-11-2026): nunca «casualidad» ni «azar» (las micro no ocurren
 * por casualidad: los datos de hoy todavía no explican por qué pasan) y «paro» o «parada(s)» pasan a «detención/detenciones». Compartido por las pruebas de
 * los textos, del resumen y del globo. Desde el 04-11-2026 también «parado(s)», «microparada(s)» y «paró».
 * El límite de palabra es `\p{L}` y no `\b`: el `\b` de JS no cuenta la «ó» como letra y cortaría mal «paró».
 */
export const PROHIBIDAS = /casualidad|azar|(?<!\p{L})(?:micro)?par(?:ad[oa]s?|os?|ó)(?!\p{L})/iu

/*
 * Autoprueba del propio patrón: lo prohibido tiene que caer y las palabras que solo se le parecen tienen que pasar. Si alguien lo afloja,
 * falla al cargar este módulo, y con él cada prueba que lo usa (no hace falta otro archivo de prueba).
 */
const MALAS = ['por casualidad', 'al azar', 'un paro', 'los paros', 'Parada programada', 'las paradas', 'PARO', 'parado', 'parados', 'microparada', 'microparadas', 'paró']
const BUENAS = ['paradero', 'comparado', 'preparado', 'disparo', 'amparo', 'paradigma', 'parodia', 'Otra Baader se detuvo', 'detención', 'se detuvo', 'comparar', 'separar']
const fallo = MALAS.find((m) => !PROHIBIDAS.test(m)) ?? BUENAS.find((b) => PROHIBIDAS.test(b))
if (fallo !== undefined) throw new Error(`vocabulario.ts: el patrón de vocabulario falla con «${fallo}»`)
