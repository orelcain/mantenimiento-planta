/**
 * Lógica compartida de la confirmación EN TERRENO aparato → pieza física.
 * La usan el visor eléctrico (PlanosElectricosPage) y la ficha de la Tarjeta A3C, para que ambos
 * escriban el mismo doc `planoVinculos/<slug>__<aparato>` con las mismas reglas.
 */
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'

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
    ? 'No se pudo guardar: revisa que tu sesión siga abierta y que el código no sea muy largo.'
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
