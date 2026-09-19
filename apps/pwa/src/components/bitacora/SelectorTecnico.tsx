import { useId, useState } from 'react'
import { recordarTecnico } from './tecnicoRecordado'

/**
 * «Quién registra»: el técnico elige su nombre de la planilla del calendario.
 *
 * Existe porque la bitácora se usa con la cuenta COMPARTIDA de Mantención (no
 * hay cuentas por persona): la cuenta no dice quién escribió. Primero van los
 * técnicos de turno (lo más probable, un toque) y el resto en un selector
 * nativo, que en el celular abre la lista del sistema.
 */

export function SelectorTecnico({
  etiqueta,
  deTurno,
  todos,
  valor,
  onChange,
  recordar = true,
  vacio = 'Elige tu nombre',
  obligatorio,
  sinEtiqueta = false,
}: {
  etiqueta: string
  deTurno: string[]
  todos: string[]
  valor: string
  onChange: (nombre: string) => void
  /** `false` cuando se elige a OTRO (quién registró): no es «mi nombre» y no se recuerda en el teléfono. */
  recordar?: boolean
  /** Texto de la opción vacía de la lista. */
  vacio?: string
  /** Marca «obligatorio» junto al rótulo (mismo patrón que Tipo e Impacto) mientras no hay elección. */
  obligatorio?: boolean
  /** Dentro de una fila que ya dice el rótulo: se deja solo para lectores de pantalla. */
  sinEtiqueta?: boolean
}) {
  const id = useId()
  const resto = todos.filter((n) => !deTurno.includes(n))
  const [pidioVerTodos, setVerTodos] = useState(false)
  // Derivado, no estado inicial: el nombre recordado llega DESPUÉS del primer
  // render, y si no está entre los de turno la lista completa debe verse abierta
  // (si no, no se ve a nadie elegido aunque haya un nombre).
  const verTodos = pidioVerTodos || (Boolean(valor) && !deTurno.includes(valor))
  const chip = (activo: boolean) =>
    [
      'min-h-[44px] shrink-0 rounded-full px-4 text-footnote font-semibold transition-colors duration-150 motion-reduce:transition-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      activo ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/15',
    ].join(' ')

  const elegir = (nombre: string) => {
    onChange(nombre)
    if (recordar) recordarTecnico(nombre)
  }

  return (
    <div>
      <span id={`${id}-label`} className={sinEtiqueta ? 'sr-only' : 'mb-1.5 block text-footnote text-muted-foreground'}>
        {etiqueta}
        {obligatorio && !valor && <span className="ml-1.5 text-ink-warn">obligatorio</span>}
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {deTurno.map((n) => (
          <button key={n} type="button" aria-pressed={valor === n} className={chip(valor === n)} onClick={() => elegir(n)}>
            {n}
          </button>
        ))}
        {resto.length > 0 && !verTodos && (
          <button type="button" className={chip(false)} onClick={() => setVerTodos(true)}>
            {deTurno.length ? 'Otro técnico' : 'Elegir técnico'}
          </button>
        )}
      </div>
      {(verTodos || deTurno.length === 0) && todos.length > 0 && (
        <select
          aria-label="Técnico"
          value={todos.includes(valor) ? valor : ''}
          onChange={(e) => elegir(e.target.value)}
          className="mt-2 h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-campo text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="" disabled>
            {vacio}
          </option>
          {todos.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
