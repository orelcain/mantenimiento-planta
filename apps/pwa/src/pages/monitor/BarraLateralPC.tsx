/**
 * Barra lateral del monitor v2 en PC (lg+). Mockup del 27-10, «exprés / ampliado + barra lateral».
 *
 * Riel de 56 px fijo a la izquierda que se abre a 200 px al pasar el mouse (con 120 ms de espera) o con el teclado,
 * SIN empujar el contenido: el fondo crece con `scaleX` y los rótulos aparecen con `opacity`; la página no se mueve.
 * Lleva lo que antes ocupaba la cabecera: El turno · Análisis · Duelo · Modo TV · tema · Inicio. El cambio de línea
 * (Eviscerado | Filete) ya no vive acá: es el selector de arriba de cada pestaña (`SelectorLinea`).
 * El botón de arriba la deja fijada abierta. El indicador del apartado activo se desliza (`transform`).
 * En celular no existe: sigue la barra de arriba de siempre.
 */
import { BarChart3, Clock, Home, Menu, Moon, Sun, Trophy, Tv } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Los apartados del monitor v2: lo vivo, lo que se estudia y el duelo de equipos. */
export type PestanaMonitor = 'turno' | 'analisis' | 'duelo'

export interface BarraLateralPCProps {
  pestana: PestanaMonitor
  onPestana: (p: PestanaMonitor) => void
  /** «Inicio»: solo con sesión de supervisor (el link público no tiene a dónde volver). */
  conInicio?: boolean
  onModoTv: () => void
  oscuro: boolean
  onTema: () => void
}

function Item({ icono, rotulo, activo, onClick, to, pulsado, nombre, atenuado }: {
  icono: ReactNode
  rotulo: string
  activo?: boolean
  onClick?: () => void
  to?: string
  pulsado?: boolean
  nombre?: string
  atenuado?: boolean
}) {
  const cuerpo = (
    <>
      <span className="v2-lat-ico">{icono}</span>
      <span className="v2-lat-rot">{rotulo}</span>
    </>
  )
  const clase = `v2-lat-item tap-44${activo ? ' v2-lat-activo' : ''}`
  /* El rótulo se oculta con overflow cuando el riel está cerrado: el nombre accesible va siempre. */
  if (to) return <Link to={to} className={clase} aria-label={nombre ?? rotulo}>{cuerpo}</Link>
  return (
    <button type="button" onClick={onClick} className={clase} aria-label={nombre ?? rotulo} aria-current={activo ? 'page' : undefined} aria-pressed={pulsado} disabled={atenuado}>
      {cuerpo}
    </button>
  )
}

export function BarraLateralPC({ pestana, onPestana, conInicio, onModoTv, oscuro, onTema }: BarraLateralPCProps) {
  const [fijada, setFijada] = useState(false)
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current) }, [])
  const abierta = fijada || hover || foco
  /* El indicador sigue al apartado activo: 0 = botón de menú, 1 = El turno, 2 = Análisis, 3 = Duelo (40 px de alto + 4 de hueco). */
  const fila = pestana === 'turno' ? 1 : pestana === 'analisis' ? 2 : 3

  return (
    <nav
      className="v2-lateral"
      data-abierta={abierta ? 'si' : 'no'}
      aria-label="Navegación del monitor"
    >
      <div className="v2-lat-sombra" aria-hidden />
      <div className="v2-lat-fondo" aria-hidden />
      <div
        className="v2-lat-items"
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          if (espera.current) clearTimeout(espera.current)
          espera.current = setTimeout(() => setHover(true), 120)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return
          if (espera.current) clearTimeout(espera.current)
          setHover(false)
        }}
        /* Con teclado se abre al enfocar; un clic con el mouse no la deja abierta. */
        onFocus={(e) => { if (e.target.matches(':focus-visible')) setFoco(true) }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false) }}
      >
        <i className="v2-lat-ind" aria-hidden style={{ transform: `translateY(${fila * 44}px) scaleX(${abierta ? 1 : 0.2174})` }} />
        <Item icono={<Menu className="h-[18px] w-[18px]" />} rotulo={fijada ? 'Soltar menú' : 'Fijar menú'} pulsado={fijada} onClick={() => setFijada((f) => !f)} />
        <Item icono={<Clock className="h-[18px] w-[18px]" />} rotulo="El turno" activo={pestana === 'turno'} onClick={() => onPestana('turno')} />
        <Item icono={<BarChart3 className="h-[18px] w-[18px]" />} rotulo="Análisis" activo={pestana === 'analisis'} onClick={() => onPestana('analisis')} />
        <Item icono={<Trophy className="h-[18px] w-[18px]" />} rotulo="Duelo" activo={pestana === 'duelo'} onClick={() => onPestana('duelo')} />

        <div className="v2-lat-sep" aria-hidden />
        <Item icono={<Tv className="h-[18px] w-[18px]" />} rotulo="Modo TV" onClick={onModoTv} />
        <span className="v2-lat-hueco" aria-hidden />
        <Item
          icono={oscuro ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          rotulo={oscuro ? 'Vista clara' : 'Vista oscura'}
          nombre={oscuro ? 'Cambiar a vista clara' : 'Cambiar a vista oscura'}
          onClick={onTema}
        />
        {conInicio && <Item icono={<Home className="h-[18px] w-[18px]" />} rotulo="Inicio" to="/" />}
      </div>
    </nav>
  )
}
