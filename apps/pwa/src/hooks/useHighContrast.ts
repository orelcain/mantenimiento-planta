/**
 * useHighContrast — Toggle de modo alto contraste
 * Para ambientes con luz intensa (planta industrial)
 * Persiste en localStorage: 'high_contrast'
 */
import { useEffect, useState, useCallback } from 'react'

const KEY = 'high_contrast'
const CLASS = 'high-contrast'

export function useHighContrast() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) === '1')

  useEffect(() => {
    const root = document.documentElement
    if (enabled) {
      root.classList.add(CLASS)
    } else {
      root.classList.remove(CLASS)
    }
    localStorage.setItem(KEY, enabled ? '1' : '0')
  }, [enabled])

  const toggle = useCallback(() => setEnabled(prev => !prev), [])

  return { enabled, toggle }
}
