/**
 * Último técnico elegido en ESTE teléfono (cada técnico suele usar el suyo,
 * aunque todos entren con la cuenta compartida de Mantención).
 * Archivo aparte del componente para no romper el fast refresh de Vite.
 */
const CLAVE = 'bitacora.tecnico.v1'

export function tecnicoRecordado(): string {
  try {
    return localStorage.getItem(CLAVE) ?? ''
  } catch {
    return ''
  }
}

export function recordarTecnico(nombre: string) {
  try {
    if (nombre.trim()) localStorage.setItem(CLAVE, nombre.trim())
  } catch {
    /* sin almacenamiento local: solo hay que volver a elegir */
  }
}
