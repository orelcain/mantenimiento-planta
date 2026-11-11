/**
 * Lo que la pantalla clásica (y por lo tanto el Modo TV, `?pantalla=1`) necesita del reloj único: las piezas del instante
 * reproducido, para las cifras y barras que no pasan por `MonitorV2`. Sin reproducción activa (turno cerrado, sin serie por
 * minuto) valen las piezas de siempre (`respaldo`).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { computePaceToTarget, type PaceInput, type PaceToTarget } from '@/services/shoplogix/monitorPace'
import { CifraViva } from './CifraViva'
import { FloteMas } from './FloteMas'
import { int } from './ejeTurno'
import { useReproduccion } from './useReproduccionMinuto'
import type { RelojDeDatos } from './useRelojDeDatos'

/** La cifra grande con el reloj de la cola; sin él, `respaldo` tal cual. Es la del Modo TV. */
export function CifraRepViva({ respaldo, className }: { respaldo: number; className?: string }) {
  const rep = useReproduccion()
  return rep?.activa ? <CifraViva reloj={rep.reloj} respaldo={respaldo} className={className} /> : <span className={className}>{int(respaldo)}</span>
}

/** El «+N» flotante del Modo TV: lee el mismo reloj que la cifra grande. Sin reproducción activa, nada. */
export function FloteRepViva() {
  const rep = useReproduccion()
  return rep?.activa ? <FloteMas reloj={rep.reloj} className="flote-tv" /> : null
}

/**
 * Las piezas del instante reproducido como número entero, para dibujar con ellas (una barra, una resta). Re-renderiza solo a
 * sus hijos y solo cuando cambia el entero (una pieza), no por cuadro.
 */
export function HechasVivas({ respaldo, children }: { respaldo: number; children: (hechas: number) => ReactNode }) {
  const rep = useReproduccion()
  return <HechasDeReloj reloj={rep?.activa ? rep.reloj : null} respaldo={respaldo}>{children}</HechasDeReloj>
}

/** Lo mismo con el reloj que se pase (el Duelo en PC elige entre la cola y la recta); sin reloj, `respaldo` tal cual. */
export function HechasDeReloj({ reloj, respaldo, children }: { reloj: RelojDeDatos | null; respaldo: number; children: (hechas: number) => ReactNode }) {
  const [v, setV] = useState(() => Math.round(reloj?.cuadro().valor ?? respaldo))
  useEffect(() => {
    if (!reloj) { setV(Math.round(respaldo)); return }
    return reloj.alCuadro((c) => {
      const n = Math.round(c.valor ?? respaldo)
      setV((previo) => (previo === n ? previo : n))
    })
  }, [reloj, respaldo])
  return <>{children(reloj ? v : respaldo)}</>
}

/**
 * El «ritmo necesario» y lo que falta para la meta, calculados con las piezas del instante reproducido (el mismo cálculo de
 * `computePaceToTarget`, con `producedPieces` = hechas del cuadro). Así, junto a la cifra grande del Modo TV, «hechas + faltan = meta».
 * Sin reproducción activa, o con el reloj ya en el contador, queda el `pace` de siempre. Re-renderiza solo a sus hijos, una vez por pieza.
 */
export function PaceVivo({ input, pace, children }: { input: PaceInput | null; pace: PaceToTarget | null; children: (pace: PaceToTarget | null) => ReactNode }) {
  return (
    <HechasVivas respaldo={input?.producedPieces ?? 0}>
      {(hechas) => children(input && pace && Math.round(hechas) !== Math.round(input.producedPieces)
        ? computePaceToTarget({ ...input, producedPieces: hechas })
        : pace)}
    </HechasVivas>
  )
}
