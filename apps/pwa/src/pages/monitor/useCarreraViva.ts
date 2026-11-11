/**
 * La carrera del turno en curso a la hora del cuadro del reloj único (spec §2: Duelo en PC y en celular): las piezas de hoy y
 * las del rival EN ESE MISMO instante (su curva leída en el minuto del cuadro). Es lo que mueve «lleva N pz», «Cárdenas va
 * ganando por N» y la cabeza de la curva de hoy junto a la cifra grande de «El turno» y la del Modo TV.
 *
 * Cambia solo cuando cambia un entero (una pieza de hoy, una del rival, la hora), no por cuadro. Sin reloj (turno cerrado, sin
 * serie por minuto) devuelve null y quien llama usa sus valores de siempre.
 */
import { useEffect, useState } from 'react'
import { horaDelCuadro } from './aEstaHora'
import { piezasAlMinuto } from './duelo'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'

export interface CarreraViva {
  hechas: number | null
  /** Lo que llevaba el rival a esta misma hora de producción. null sin curva del rival. */
  rival: number | null
  /** «N.ª hora» de producción. */
  hora: number | null
  /** Minutos de producción del cuadro (desde la primera pieza). */
  min: number | null
}

type Curva = Parameters<typeof piezasAlMinuto>[0]

function calcular(c: CuadroReloj, inicioMs: number | null, curvaRival: Curva | null): CarreraViva {
  const t = horaDelCuadro(c)
  const min = t != null && inicioMs != null ? Math.max(0, (t - inicioMs) / 60_000) : null
  return {
    hechas: c.valor != null ? Math.round(c.valor) : null,
    rival: min != null && curvaRival ? Math.round(piezasAlMinuto(curvaRival, min) ?? 0) : null,
    hora: min != null ? Math.floor(min / 60) + 1 : null,
    min,
  }
}

export function useCarreraViva(reloj: RelojDeDatos | null, inicioMs: number | null, curvaRival: Curva | null): CarreraViva | null {
  const [v, setV] = useState<CarreraViva | null>(() => (reloj ? calcular(reloj.cuadro(), inicioMs, curvaRival) : null))
  useEffect(() => {
    if (!reloj) { setV(null); return }
    return reloj.alCuadro((c) => {
      const n = calcular(c, inicioMs, curvaRival)
      setV((p) => (p && p.hechas === n.hechas && p.rival === n.rival && p.hora === n.hora ? p : n))
    })
  }, [reloj, inicioMs, curvaRival])
  return v
}
