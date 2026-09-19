import { useId, useState } from 'react'
import { Check, Plus } from 'lucide-react'

/**
 * «También participaron»: técnicos que trabajaron en el evento además de quien
 * registra. Toggles con los presentes del turno y «+ Otro» para cualquiera de la
 * lista (un reemplazo que no quedó marcado como presente).
 */
export function SelectorParticipantes({
  presentes,
  todos,
  excluir,
  valor,
  onChange,
  sinEtiqueta = false,
}: {
  presentes: string[]
  todos: string[]
  /** Quien registra: no tiene sentido marcarlo también como participante. */
  excluir: string
  valor: string[]
  onChange: (nombres: string[]) => void
  /** Dentro de una fila que ya dice el rótulo: se deja solo para lectores de pantalla. */
  sinEtiqueta?: boolean
}) {
  const id = useId()
  const [agregando, setAgregando] = useState(false)
  const k = (s: string) => s.trim().toLowerCase()
  const esQuien = (n: string) => k(n) === k(excluir)
  const marcado = (n: string) => valor.some((v) => k(v) === k(n))
  // Visibles: los presentes + los ya marcados que no son presentes (quedan a la vista para poder quitarlos).
  const visibles = [...presentes, ...valor.filter((v) => !presentes.some((p) => k(p) === k(v)))].filter((n) => !esQuien(n))
  const disponibles = todos.filter((n) => !esQuien(n) && !visibles.some((v) => k(v) === k(n)))

  const alternar = (n: string) => onChange(marcado(n) ? valor.filter((v) => k(v) !== k(n)) : [...valor, n])

  const chip = (activo: boolean) =>
    [
      'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-footnote font-semibold transition-colors duration-150 motion-reduce:transition-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      activo ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/10 text-foreground hover:bg-muted-foreground/15',
    ].join(' ')

  return (
    <div>
      <span id={`${id}-label`} className={sinEtiqueta ? 'sr-only' : 'mb-1.5 block text-footnote text-muted-foreground'}>
        También participaron
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {visibles.map((n) => (
          <button key={n} type="button" aria-pressed={marcado(n)} className={chip(marcado(n))} onClick={() => alternar(n)}>
            {marcado(n) && <Check className="size-4" aria-hidden />}
            {n}
          </button>
        ))}
        {disponibles.length > 0 && !agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-4 text-footnote font-semibold text-primary shadow-[inset_0_0_0_1.5px_rgb(var(--muted-foreground)/0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="size-4" aria-hidden /> Otro
          </button>
        )}
      </div>
      {agregando && disponibles.length > 0 && (
        <select
          aria-label="Agregar técnico que participó"
          value=""
          autoFocus
          onChange={(e) => {
            if (e.target.value) onChange([...valor, e.target.value])
            setAgregando(false)
          }}
          onBlur={() => setAgregando(false)}
          className="mt-2 h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-campo text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="" disabled>
            Elige quién participó
          </option>
          {disponibles.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
