import { leerRecientes, sumarReciente, MAX_RECIENTES, type BusquedaReciente } from '@/utils/recorridoPlano'

export const CLAVE_RECIENTES_REPUESTOS = 'repuestos-recientes'

export type RecienteRepuesto = { tipo: 'equipo' | 'repuesto'; id: string; nombre: string }

function decodificar({ c, n }: BusquedaReciente): RecienteRepuesto | null {
  const tipo = c.startsWith('e:') ? 'equipo' : c.startsWith('r:') ? 'repuesto' : null
  const id = c.slice(2)
  return tipo && id.trim() ? { tipo, id, nombre: n || id } : null
}

export function leerRecientesRepuestos(): RecienteRepuesto[] {
  try {
    return leerRecientes(localStorage.getItem(CLAVE_RECIENTES_REPUESTOS))
      .map(decodificar)
      .filter((item): item is RecienteRepuesto => item !== null)
  } catch {
    return []
  }
}

function registrar(prefijo: 'e:' | 'r:', id: string, nombre: string): void {
  if (!id.trim()) return
  try {
    const anteriores = leerRecientes(localStorage.getItem(CLAVE_RECIENTES_REPUESTOS))
      .filter((item) => decodificar(item) !== null)
    const nueva: BusquedaReciente = { c: `${prefijo}${id}`, n: nombre }
    const recientes = sumarReciente(anteriores, nueva).slice(0, MAX_RECIENTES)
    localStorage.setItem(CLAVE_RECIENTES_REPUESTOS, JSON.stringify(recientes))
  } catch {
    // El historial es opcional si el almacenamiento no esta disponible.
  }
}

export function registrarRecienteEquipo(id: string, nombre: string): void {
  registrar('e:', id, nombre)
}

export function registrarRecienteRepuesto(id: string, nombre: string): void {
  registrar('r:', id, nombre)
}

export function limpiarRecientesRepuestos(): void {
  try {
    localStorage.removeItem(CLAVE_RECIENTES_REPUESTOS)
  } catch {
    // El almacenamiento puede estar bloqueado.
  }
}
