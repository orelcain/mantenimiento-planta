/**
 * Lógica compartida de la confirmación EN TERRENO aparato → pieza física.
 * La usan el visor eléctrico (PlanosElectricosPage) y la ficha de la Tarjeta A3C, para que ambos
 * escriban el mismo doc con las mismas reglas:
 *  - plano con más de una máquina (888: N2 y N3): `planoVinculos/<slug>__<aparato>__<maquina>`
 *  - plano con una o ninguna: `planoVinculos/<slug>__<aparato>` (860, 200 y GEA no cambian)
 */
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import { maquinasDePlano } from '@/data/planos'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'

/** Id del doc de un vínculo. Solo los planos con más de una máquina llevan la máquina en el id. */
export function idVinculo(planoSlug: string, aparato: string, maquina?: MaquinaBaader | null): string {
  return maquinasDePlano(planoSlug).length > 1 && maquina
    ? `${planoSlug}__${aparato}__${maquina}`
    : `${planoSlug}__${aparato}`
}

/** «baader-n3» → «N3»: la forma corta que se dice en la planta. */
export function etiquetaMaquina(m: MaquinaBaader): string {
  return m.replace('baader-', '').toUpperCase()
}

/** Acepta `n2`, `N2` o `baader-n2` (el aviso de Telegram y los enlaces usan `?maquina=n2`). `null` si no es una máquina. */
export function parsearMaquina(q: string | null | undefined): MaquinaBaader | null {
  const v = (q ?? '').trim().toLowerCase().replace('baader-', '')
  return v === 'n1' ? 'baader-n1' : v === 'n2' ? 'baader-n2' : v === 'n3' ? 'baader-n3' : null
}

/** Lo que hay guardado de UN aparato: una respuesta por máquina + la anterior al cambio, sin máquina. */
export interface EntradaVinculos<V = VinculoTerreno> {
  porMaquina: Partial<Record<MaquinaBaader, V>>
  /** Doc viejo del plano 888 (se guardaba sin máquina): se muestra como pista y NO cuenta en ninguna. */
  sinMaquina?: V
}
export type VinculosPorAparato<V = VinculoTerreno> = Map<string, EntradaVinculos<V>>

/**
 * Agrupa los docs de un plano por aparato y máquina.
 *  - doc con `maquina` → esa máquina (si el plano la tiene)
 *  - sin `maquina` y plano de UNA máquina → esa máquina (el 860 solo sirve a N1)
 *  - sin `maquina` y plano con varias (888) → `sinMaquina`: no se sabe de cuál es, no cuenta
 *  - sin `maquina` y plano sin máquinas (200, GEA) → `sinMaquina`; ahí es el vínculo real (ver `vinculoActivo`)
 */
export function agruparVinculos<V extends { aparato: string; maquina?: MaquinaBaader }>(
  planoSlug: string | undefined,
  docs: Iterable<V>,
): VinculosPorAparato<V> {
  const maquinas = maquinasDePlano(planoSlug)
  const out: VinculosPorAparato<V> = new Map()
  for (const d of docs) {
    const e = out.get(d.aparato) ?? { porMaquina: {} }
    if (d.maquina) {
      if (maquinas.includes(d.maquina)) e.porMaquina[d.maquina] = d
    } else if (maquinas.length === 1 && maquinas[0]) {
      e.porMaquina[maquinas[0]] = d
    } else {
      e.sinMaquina = d
    }
    out.set(d.aparato, e)
  }
  return out
}

/** El vínculo que vale para la máquina activa (`null` = ninguna elegida). */
export function vinculoActivo<V>(
  planoSlug: string | undefined,
  entrada: EntradaVinculos<V> | undefined,
  maquina: MaquinaBaader | null | undefined,
): V | undefined {
  const maquinas = maquinasDePlano(planoSlug)
  if (maquinas.length === 0) return entrada?.sinMaquina
  const m = maquina ?? (maquinas.length === 1 ? maquinas[0] : undefined)
  return m ? entrada?.porMaquina[m] : undefined
}

export interface EstadoMaquinas {
  /** Máquinas donde ya hay una respuesta (confirmado, corregido o no_aplica). */
  resueltas: MaquinaBaader[]
  /** Resuelto en TODAS las máquinas del plano: lo único que suma al indicador global. */
  enTodas: boolean
  /** Dos máquinas respondidas con códigos distintos: piezas distintas por máquina (hallazgo, no error). */
  distintas: boolean
  /** Código que quedó en cada máquina (confirmado: el elegido; corregido: el leído). */
  codigos: Partial<Record<MaquinaBaader, string>>
}

/**
 * Regla de conteo: un aparato está «resuelto» en una máquina con CUALQUIER respuesta. Piezas
 * distintas entre máquinas también es resuelto. `sinMaquina` no cuenta.
 */
export function estadoPorMaquina(
  entrada: { porMaquina: Partial<Record<MaquinaBaader, Pick<VinculoTerreno, 'estado' | 'codigo'>>> } | undefined,
  maquinas: readonly MaquinaBaader[],
): EstadoMaquinas {
  const resueltas: MaquinaBaader[] = []
  const codigos: Partial<Record<MaquinaBaader, string>> = {}
  for (const m of maquinas) {
    const v = entrada?.porMaquina[m]
    if (!v) continue
    resueltas.push(m)
    const c = v.codigo?.trim()
    if ((v.estado === 'confirmado' || v.estado === 'corregido') && c) codigos[m] = c
  }
  return {
    resueltas,
    enTodas: maquinas.length > 0 && resueltas.length === maquinas.length,
    distintas: new Set(Object.values(codigos)).size > 1,
    codigos,
  }
}

/** Tope del campo `codigo` que exige la regla de Firestore. Pegar de más rebota con «permission-denied». */
export const MAX_CODIGO_ETIQUETA = 30

/** dd-MM: la fecha corta que va junto a quién confirmó en terreno. */
export function fechaCortaVinculo(t?: { toDate: () => Date } | null): string {
  if (!t) return ''
  const d = t.toDate()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Firestore contesta «Missing or insufficient permissions» tanto si se cayó la sesión como si el
 * dato no pasa la regla. Frente a la máquina ese texto no ayuda: se traduce a algo que se pueda hacer.
 */
export function mensajeErrorTerreno(e: unknown): string {
  const msg = e instanceof Error ? e.message : ''
  return /permission|insufficient/i.test(msg)
    ? 'No se pudo guardar: revisa que tu sesión siga abierta y que el código no sea muy largo. Si sigue igual, actualiza la app.'
    : msg || 'No se pudo guardar.'
}

export interface DatosGuardadoTerreno {
  aparato: string
  estado: VinculoTerreno['estado']
  /** Código de fabricante que propone el catálogo (se guarda tal cual al confirmar). */
  codigoCatalogo: string
  /** Código leído en la etiqueta (obligatorio al corregir). */
  codigoLeido?: string
  nota?: string
  foto?: File | null
}

type Escritor = {
  confirmar: (d: { aparato: string; estado: VinculoTerreno['estado']; codigo?: string; nota?: string; foto?: string }) => Promise<void>
  subirFoto: (f: File) => Promise<string>
}

/** `false` si falta el código de etiqueta al corregir: no se guarda nada. */
export function puedeGuardarTerreno(estado: VinculoTerreno['estado'] | null, codigoLeido?: string): boolean {
  return !!estado && (estado !== 'corregido' || !!codigoLeido?.trim())
}

/**
 * La foto va primero: si falla la subida, no se guarda un vínculo que dice tener evidencia y no la tiene.
 */
export async function guardarVinculoTerreno(vinculos: Escritor, d: DatosGuardadoTerreno): Promise<void> {
  if (!puedeGuardarTerreno(d.estado, d.codigoLeido)) return
  const urlFoto = d.foto ? await vinculos.subirFoto(d.foto) : undefined
  await vinculos.confirmar({
    aparato: d.aparato,
    estado: d.estado,
    codigo: d.estado === 'confirmado' ? d.codigoCatalogo : d.estado === 'corregido' ? d.codigoLeido?.trim() : undefined,
    nota: d.nota?.trim() || undefined,
    foto: urlFoto,
  })
}
