/**
 * Un campo de número entero que se puede CORREGIR.
 *
 * POR QUÉ EXISTE
 * --------------
 * Los campos de la carga de trabajo eran `type=number` controlados con
 * `Math.max(min, Number(e.target.value) || min)`: al borrar el valor para escribir otro, el
 * campo volvía al mínimo en el acto y lo que se escribía después quedaba pegado detrás
 * («5» sobre unos minutos vacíos daba **55**). El mismo defecto medido en la solicitud de
 * repuestos (#1016), donde quien quería 5 pedía 15.
 *
 * Acá el texto es del campo mientras se edita; el valor sube solo cuando es un entero válido,
 * y al salir sin un número válido vuelve al último bueno. Con el autoguardado de la Rueda ya
 * arreglado, un valor equivocado se guarda de verdad: por eso importa.
 */
import { useEffect, useState } from 'react'
import { enteroDesdeTexto } from '@/lib/entero'

interface Props {
  value: number
  onChange: (valor: number) => void
  min: number
  step?: number
  className?: string
  'aria-label'?: string
  id?: string
}

export function CampoEntero({ value, onChange, min, step, className, id, ...resto }: Props) {
  const [texto, setTexto] = useState(String(value))
  const [editando, setEditando] = useState(false)

  // Mientras se edita manda el texto; si el valor cambia desde afuera, se refleja al salir.
  useEffect(() => {
    if (!editando) setTexto(String(value))
  }, [value, editando])

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      step={step}
      value={texto}
      aria-label={resto['aria-label']}
      aria-invalid={enteroDesdeTexto(texto, min) === null}
      className={className}
      onFocus={(e) => {
        setEditando(true)
        e.currentTarget.select()
      }}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^0-9]/g, '')
        setTexto(limpio)
        const n = enteroDesdeTexto(limpio, min)
        if (n !== null && n !== value) onChange(n)
      }}
      onBlur={() => {
        setEditando(false)
        // Sin número válido (quedó vacío o bajo el mínimo), vuelve al último bueno: no se inventa.
        if (enteroDesdeTexto(texto, min) === null) setTexto(String(value))
      }}
    />
  )
}
