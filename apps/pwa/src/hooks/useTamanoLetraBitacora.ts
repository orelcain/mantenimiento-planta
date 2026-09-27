import { useCallback, useEffect, useState } from 'react'
import { escalaDe, escalaDesdeCuerpoIos, guardarTamanoLetra, leerTamanoLetra, type TamanoLetra } from '@/services/bitacora/tamanoLetra'

/**
 * El cuerpo de texto que iOS le da a la web según Ajustes › Pantalla y brillo ›
 * Tamaño del texto. Fuera de WebKit `-apple-system-body` no existe: null.
 */
function escalaDelTelefono(): number | null {
  if (typeof document === 'undefined' || !window.CSS?.supports?.('font', '-apple-system-body')) return null
  const sonda = document.createElement('span')
  sonda.style.font = '-apple-system-body'
  sonda.style.position = 'absolute'
  sonda.style.visibility = 'hidden'
  document.body.appendChild(sonda)
  const px = parseFloat(getComputedStyle(sonda).fontSize)
  sonda.remove()
  return escalaDesdeCuerpoIos(px)
}

/**
 * Aplica el tamaño de letra de la bitácora mientras la pantalla está abierta, en
 * `<html>` (las hojas se abren en un portal fuera de la página) y lo quita al salir:
 * el resto de la app no cambia.
 */
export function useTamanoLetraBitacora() {
  const [escalaTelefono] = useState(escalaDelTelefono)
  const [tamano, setTamano] = useState<TamanoLetra>(() => leerTamanoLetra(escalaTelefono !== null))
  const escala = escalaDe(tamano, escalaTelefono)

  useEffect(() => {
    const raiz = document.documentElement
    if (escala === 1) raiz.style.removeProperty('--escala-texto')
    else raiz.style.setProperty('--escala-texto', String(escala))
    return () => {
      raiz.style.removeProperty('--escala-texto')
    }
  }, [escala])

  const cambiar = useCallback((t: TamanoLetra) => {
    setTamano(t)
    guardarTamanoLetra(t)
  }, [])

  return { tamano, cambiar, hayTelefono: escalaTelefono !== null, escala }
}
