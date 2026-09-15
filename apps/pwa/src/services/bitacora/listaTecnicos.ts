/**
 * Lista de técnicos de la bitácora = planilla del calendario + ajustes propios.
 *
 * El calendario sigue siendo la FUENTE (si llega un técnico nuevo a la planilla,
 * aparece solo). Sobre ella la bitácora guarda tres ajustes, sin tocar el
 * calendario: nombres AGREGADOS (un contratista), nombres OCULTOS (borrados de
 * la bitácora) y RENOMBRES (corregir "Adrade" → "Andrade").
 *
 * Los eventos guardan el nombre como texto, así que borrar o renombrar aquí no
 * cambia la autoría de lo ya registrado.
 */

export interface AjustesTecnicos {
  agregados: string[]
  ocultos: string[]
  /** nombre original (del calendario o agregado) → nombre corregido */
  renombres: Record<string, string>
}

export const AJUSTES_VACIOS: AjustesTecnicos = { agregados: [], ocultos: [], renombres: {} }

export interface TecnicoDeLista {
  /** Nombre ORIGINAL: la clave estable para ocultar o renombrar. */
  clave: string
  nombre: string
  origen: 'calendario' | 'agregado'
}

export const claveNombre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

export function limpiarNombre(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** Aplica los ajustes a la planilla. Sin repetidos (sin distinguir tildes/mayúsculas). */
export function construirListaTecnicos(calendario: readonly string[], ajustes: AjustesTecnicos | null | undefined): TecnicoDeLista[] {
  const a = ajustes ?? AJUSTES_VACIOS
  const ocultos = new Set(a.ocultos.map(claveNombre))
  const renombre = new Map(Object.entries(a.renombres ?? {}).map(([k, v]) => [claveNombre(k), limpiarNombre(v)]))
  const vistos = new Set<string>()
  const lista: TecnicoDeLista[] = []
  const sumar = (original: string, origen: TecnicoDeLista['origen']) => {
    const clave = limpiarNombre(original)
    if (!clave || ocultos.has(claveNombre(clave))) return
    const nombre = renombre.get(claveNombre(clave)) || clave
    const k = claveNombre(nombre)
    if (vistos.has(k)) return
    vistos.add(k)
    lista.push({ clave, nombre, origen })
  }
  calendario.forEach((n) => sumar(n, 'calendario'))
  a.agregados.forEach((n) => sumar(n, 'agregado'))
  return lista
}

export function agregarTecnico(a: AjustesTecnicos, nombre: string): AjustesTecnicos {
  const n = limpiarNombre(nombre)
  if (!n) return a
  const k = claveNombre(n)
  // Si estaba oculto (borrado antes), agregarlo lo vuelve a mostrar.
  const ocultos = a.ocultos.filter((o) => claveNombre(o) !== k)
  const agregados = a.agregados.some((x) => claveNombre(x) === k) ? a.agregados : [...a.agregados, n]
  return { ...a, ocultos, agregados }
}

export function renombrarTecnico(a: AjustesTecnicos, clave: string, nuevo: string): AjustesTecnicos {
  const n = limpiarNombre(nuevo)
  if (!n) return a
  const renombres = { ...a.renombres }
  if (claveNombre(n) === claveNombre(clave)) delete renombres[clave]
  else renombres[clave] = n
  return { ...a, renombres }
}

export function quitarTecnico(a: AjustesTecnicos, t: TecnicoDeLista): AjustesTecnicos {
  if (t.origen === 'agregado') {
    const k = claveNombre(t.clave)
    const renombres = { ...a.renombres }
    delete renombres[t.clave]
    return { ...a, agregados: a.agregados.filter((x) => claveNombre(x) !== k), renombres }
  }
  // Del calendario no se borra: se oculta en la bitácora.
  return a.ocultos.some((o) => claveNombre(o) === claveNombre(t.clave)) ? a : { ...a, ocultos: [...a.ocultos, t.clave] }
}

/**
 * Técnicos presentes del turno: los guardados a mano o, si nadie los ajustó, los
 * que el calendario pone de turno (traducidos por los renombres y sin ocultos).
 */
export function tecnicosPresentes(
  guardados: readonly string[] | null | undefined,
  deTurnoCalendario: readonly string[],
  lista: readonly TecnicoDeLista[],
): { nombres: string[]; ajustado: boolean } {
  const porClave = new Map(lista.map((t) => [claveNombre(t.clave), t.nombre]))
  if (guardados) {
    // Se guardaron como texto: si después se corrigió un nombre en la lista, se
    // muestra el corregido. Quien ya no está en la lista se conserva tal cual
    // (estuvo presente ese turno).
    const porNombre = new Map(lista.map((t) => [claveNombre(t.nombre), t.nombre]))
    const nombres = guardados.map((g) => porClave.get(claveNombre(g)) ?? porNombre.get(claveNombre(g)) ?? g)
    return { nombres: [...new Set(nombres)], ajustado: true }
  }
  const nombres = deTurnoCalendario.map((n) => porClave.get(claveNombre(n))).filter((n): n is string => Boolean(n))
  return { nombres, ajustado: false }
}
