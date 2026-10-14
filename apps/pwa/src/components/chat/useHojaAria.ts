import { useEffect, useRef, useState } from 'react'

/**
 * Estado «ARIA abierta como hoja» del ChatBot. La hoja se reinicia SOLO en un cierre real
 * (isOpen pasa de true a false). En el estado cerrado inicial no corre: si una herramienta pidió
 * abrir ARIA antes de que el chat se montara, el efecto de registro ya dejó la hoja puesta y un
 * reinicio incondicional la borraba en el mismo ciclo de montaje.
 */
export function useHojaAria(isOpen: boolean) {
  const [hoja, setHoja] = useState<{ contexto: string } | null>(null)
  const estabaAbierto = useRef(isOpen)
  useEffect(() => {
    if (estabaAbierto.current && !isOpen) setHoja(null)
    estabaAbierto.current = isOpen
  }, [isOpen])
  return [hoja, setHoja] as const
}
