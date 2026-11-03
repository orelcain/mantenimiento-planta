/**
 * El resumen de las causas de las micro, bajo el carril «Micro» de «Ritmo en vivo» (PR 3, variante V2 del mockup p4 y los arreglos de la prueba de 5 s):
 *  1. la cifra «~8 de 46 · con causa probable · estimado» con el ⓘ al lado;
 *  2. una barra de 16 px con las micro en orden (Arranque → Otra Baader paró → Al volver de una detención → Sin contexto): lo probable en sólido del color de
 *     la causa y el resto de la causa, la causa posible, rayado; «Sin contexto» con contorno; una causa en observación, toda rayada;
 *  3. la leyenda «■ causa probable · ▨ causa posible · sin contexto, con contorno» y los chips, cuya marca es el MISMO dibujo de su tramo.
 * Sin calibración para la línea no hay «~»: la cifra dice «46 micro», los chips muestran solo micro y tiempo y el ⓘ lo dice.
 *
 * Lógica de cuentas en `microCausa.ts` (`resumirCausas`); todos los textos en `textosCausas.ts`.
 */
import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { AIRE_BORDE, bordeLibreArriba, traerALaVista } from './bordeLibre'
import type { CalibracionPlanta } from './causasCalibracion'
import { COLOR_CAUSA, parametrosDe, resumirCausas, type CausaMicro, type MicroClasificada, type ResumenCausa } from './microCausa'
import {
  AYUDA_INTRO, TXT_RESUMEN, ariaBarra, cifraProbable, cifraSinCalibrar, definicionCausa, deTotal, itemsAyuda, microDeCeroSegundos, notasAyuda, textoChip,
} from './textosCausas'

type Marca = 'solido' | 'mixto' | 'rayado' | 'borde'

/** El dibujo de una causa (el de su tramo en la barra): «Sin contexto», contorno; sin calibración, sólido; con ella, sólido y rayado, rayado o sólido. */
function marcaDe(c: ResumenCausa, calibrada: boolean): Marca {
  if (c.causa === 'sin') return 'borde'
  if (!calibrada) return 'solido'
  const p = c.probable ?? 0
  if (p <= 0) return 'rayado'
  return p >= c.n ? 'solido' : 'mixto'
}

const conColor = (causa: CausaMicro, extra?: CSSProperties): CSSProperties => ({ ['--c' as string]: COLOR_CAUSA[causa], ...extra })

/** La marca de un chip: el mismo dibujo del tramo (sólido, mitad sólido y mitad rayado, rayado o contorno). */
function MuestraCausa({ causa, marca }: { causa: CausaMicro; marca: Marca }) {
  return (
    <i className="rv-sw" data-marca={marca} style={conColor(causa)} aria-hidden>
      {marca === 'mixto' && <><b /><u /></>}
    </i>
  )
}

/**
 * El ⓘ: «Micro: causa probable y posible». Se abre con un toque, clic o Enter; Escape y tocar fuera lo cierran; no se sale de la pantalla: se corre hacia adentro
 * a lo ancho, su alto máximo es lo que cabe en la ventana (con scroll por dentro si el texto es más largo) y en el celular se trae a la vista al abrirlo. Va por
 * ENCIMA de las tarjetas que le siguen (CSS: `.v2-tarjeta:has(.rv-cz-info)`), de modo que el botón «Ver más del turno» ya no se mezcla con sus reglas.
 */
function AyudaCausas({ resumen, cal, planta, conVarias, verHora }: { resumen: ReturnType<typeof resumirCausas>; cal: (CalibracionPlanta & { nombre: string }) | null; planta: string | null | undefined; conVarias: boolean; verHora: number }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ izq: number; ancho: number; maxAlto: number | null; arriba: boolean }>({ izq: 0, ancho: 420, maxAlto: null, arriba: false })
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) setAbierto(false) }
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  /* Al abrir se mide el botón y se corre el panel hacia adentro (antes de pintar): a 375 px no se sale de la pantalla. */
  useLayoutEffect(() => {
    if (!abierto) return
    const b = ref.current?.getBoundingClientRect()
    if (!b) return
    const vw = document.documentElement.clientWidth || window.innerWidth
    const ancho = Math.max(0, Math.min(420, vw - 32))
    let izq = 0
    if (b.left + ancho > vw - 16) izq = vw - 16 - ancho - b.left
    if (b.left + izq < 16) izq = 16 - b.left
    /* El alto: lo que cabe entre el botón y el borde de la ventana (abajo) o entre el botón y lo fijo de la página (arriba). En PC, si el texto no cabe abajo y arriba
       hay más sitio, se abre hacia arriba; en el celular se abre siempre hacia abajo y se trae a la vista (abajo). */
    const vh = window.innerHeight || document.documentElement.clientHeight
    const celular = vw < 1024
    const abajo = vh - b.bottom - 8 - 16
    const arribaLibre = b.top - 8 - (bordeLibreArriba() + AIRE_BORDE)
    const contenido = panel.current?.scrollHeight ?? 0
    const arriba = !celular && contenido > abajo && arribaLibre > abajo
    const maxAlto = celular ? Math.max(200, vh - (bordeLibreArriba() + AIRE_BORDE) - 24) : Math.max(160, arriba ? arribaLibre : abajo)
    setPos((a) => (a.izq === izq && a.ancho === ancho && a.maxAlto === maxAlto && a.arriba === arriba ? a : { izq, ancho, maxAlto, arriba }))
  }, [abierto])
  /* En el celular el panel se trae a la vista entero al abrirlo (con el botón cerca del pie de la pantalla quedaba fuera). */
  useEffect(() => {
    if (!abierto || pos.maxAlto == null || !panel.current) return
    if ((document.documentElement.clientWidth || window.innerWidth) < 1024) traerALaVista(panel.current)
  }, [abierto, pos.maxAlto])
  const P = parametrosDe(planta)
  const items = itemsAyuda(P, conVarias)
  const notas = notasAyuda({ cal, probableTotal: resumen.probableTotal, porModo: conVarias ? resumen.porModo : null, verHora })
  return (
    <span ref={ref} className="relative inline-flex self-center">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={TXT_RESUMEN.ariaAyuda}
        className="tap-44 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--v2-bien)' }}
      >
        <Info className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {abierto && (
        <div ref={panel} id={id} role="tooltip" className="v2-tip rv-cz-info" data-arriba={pos.arriba ? '' : undefined} style={{ left: pos.izq, width: pos.ancho, maxHeight: pos.maxAlto ?? undefined }}>
          <div className="ip-tit">{TXT_RESUMEN.tituloAyuda}</div>
          <p>{AYUDA_INTRO}</p>
          <ol>
            {items.map((i) => <li key={i.clave}><b>{i.titulo}</b>: {i.texto}</li>)}
          </ol>
          {notas.map((n, k) => (
            <p key={k}>{n.map((t, j) => (t.negrita ? <b key={j}>{t.texto}</b> : <span key={j}>{t.texto}</span>))}</p>
          ))}
        </div>
      )}
    </span>
  )
}

/**
 * El resumen. `microTotal` es el total de micro del turno (con las de 0 s, que no llegan con hora ni duración): si se conoce y es mayor que las que se
 * ven, bajo la barra va una línea muted («Shoplogix anotó 205 micro: estas 70 y 135 de 0 s, sin duración.»), no junto a la cifra. Cuando el estimado es 0, la cifra dice
 * «0 de N con causa probable», sin «~». Los chips de una causa sin micro no se dibujan (la barra tampoco). `nBaader`: con una sola Baader (Filete) «Otra Baader paró» no existe y no se lista.
 */
export function ResumenCausasMicro({ micros, planta, cal, microTotal, nBaader }: { micros: readonly MicroClasificada[]; planta?: string | null; cal: (CalibracionPlanta & { nombre: string }) | null; microTotal: number | null; nBaader: number }) {
  const resumen = resumirCausas(micros, cal)
  const conVarias = nBaader > 1
  const causas = resumen.causas.filter((c) => c.causa !== 'linea' || conVarias)
  const total = resumen.total
  const ceros = microTotal != null && microTotal > total ? microTotal - total : null
  const calibrada = resumen.calibrada
  const tramos = causas.filter((c) => c.n > 0)
  return (
    <div className="rv-cz" data-calibrada={calibrada ? 'true' : 'false'}>
      <div className="rv-cz-cab">
        <span className="rv-cz-cifra tabular-nums">
          {calibrada ? <>{cifraProbable(resumen.probableTotal ?? 0)}<span className="rv-cz-de"> {deTotal(total)}</span></> : cifraSinCalibrar(total)}
        </span>
        {calibrada && (
          <span className="rv-cz-rot">
            {TXT_RESUMEN.conCausaProbable} · <span className="solo-pc">{TXT_RESUMEN.estimado}</span><span className="solo-mv" aria-hidden>{TXT_RESUMEN.estimadoCorto}</span>
          </span>
        )}
        <AyudaCausas resumen={resumen} cal={cal} planta={planta} conVarias={conVarias} verHora={total} />
      </div>
      <div className="rv-cz-barra" role="img" aria-label={ariaBarra(total, causas.map((c) => ({ causa: c.causa, n: c.n, probable: c.enObservacion ? null : c.probable })))}>
        {tramos.map((c) => {
          const marca = marcaDe(c, calibrada)
          if (marca === 'borde') return <i key={c.causa} className="s borde" data-causa={c.causa} style={conColor(c.causa, { flexGrow: c.n })} />
          if (!calibrada || marca === 'solido') return <i key={c.causa} className="s" data-causa={c.causa} style={conColor(c.causa, { flexGrow: c.n })} />
          const p = c.probable ?? 0
          return (
            <i key={c.causa} className="s par" data-causa={c.causa} style={conColor(c.causa, { flexGrow: c.n })}>
              {p > 0 && <b style={{ flexGrow: p }} />}
              {c.n - p > 0 && <u style={{ flexGrow: c.n - p }} />}
            </i>
          )
        })}
      </div>
      {calibrada && (
        <p className="rv-cz-ley">
          <i className="lg sol" aria-hidden />{TXT_RESUMEN.leyendaProbable}<i className="lg ray" aria-hidden />{TXT_RESUMEN.leyendaPosible}<i className="lg bor" aria-hidden />{TXT_RESUMEN.leyendaSin}
        </p>
      )}
      {ceros != null && <p className="rv-cz-ceros">{microDeCeroSegundos(microTotal as number, ceros)}</p>}
      <ul className="rv-mc-chips" aria-label={TXT_RESUMEN.ariaChips}>
        {tramos.map((c) => {
          /* Una causa en observación no suma al estimado: el chip dice «0 de 2 micro · 30 s», con su marca rayada y sin píldora (la explicación va en el globo y el ⓘ). */
          const t = textoChip(c.causa, c.n, c.enObservacion ? 0 : c.probable, c.segundos)
          return (
            <li key={c.causa} className="rv-mc-chip" data-causa={c.causa} title={definicionCausa(c.causa, parametrosDe(planta), conVarias)}>
              <MuestraCausa causa={c.causa} marca={marcaDe(c, calibrada)} />
              <span className="rv-mc-txt">
                <span className="rv-mc-nom">{t.nombre}</span>{' '}
                <span className="rv-mc-num"><b className="tabular-nums">{t.cifra}</b> · {t.tiempo}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
