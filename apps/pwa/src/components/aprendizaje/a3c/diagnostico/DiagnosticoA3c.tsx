/**
 * Modo «Diagnóstico» de la Tarjeta A3C · BAADER 142 (mockup aprobado, enfoque A: código de
 * falla primero). El técnico teclea el código del display (teclas de 60 px, con guantes) y ve
 * el aviso de seguridad y los pasos en el orden del manual: LED a mirar y su estado en la foto
 * de la N2, borne X5 donde medir, hoja del plano, cita del manual, «Ver en la tarjeta» y
 * Descartado / Sospechoso. Pestañas secundarias: Módulo y LED.
 *
 * Teléfono: una columna, una mano. PC: entrada | pasos | regleta X5 con el LED del paso elegido.
 * Lo marcado y el contador de diagnósticos cerrados quedan solo en este equipo (localStorage).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, ListCell, ListGroup, SegmentedControl } from '@/components/piel'
import { cn } from '@/lib/utils'
import { GRUPOS_CODIGOS, MODULOS } from '@/data/baader142Diagnostico'
import type { Borne } from '@/data/baader142A3c'
import type { VistaTarjeta } from '@/utils/aprendizaje/a3cPlaca'
import { claveDeBorne, describir, regletaDe, type ClaveSel, type Idioma, type ModeloA3c } from '@/utils/aprendizaje/a3c'
import {
  CLAVE_LOCAL,
  cerrar,
  claveMarca,
  diagnosticar,
  guardarLocal,
  leerLocal,
  marcar,
  teclear,
  type EstadoLocal,
  type Marca,
  type Tecla,
} from '@/utils/aprendizaje/a3cDiagnostico'
import { RegletaX5 } from '../RegletaX5'
import { TecladoNumerico, VisorCodigo } from './TecladoNumerico'
import { NoIndicaCaja, ResultadoCodigo } from './ResultadoCodigo'
import { DetalleLed, DetalleModulo, ListaModulos, type Visto } from './PestanasModuloLed'
import './diagnostico.css'

type Pestana = 'codigo' | 'modulo' | 'led'
const ALTO_44 = 'h-[44px] [&>button]:h-[44px]'

export interface DiagnosticoA3cProps {
  modelo: ModeloA3c
  /** Tres columnas (PC) o una (teléfono). */
  pc: boolean
  idioma: Idioma
  /** Cambia a «Explorar» con el elemento elegido (y, si se da, en el Plano o la Placa). */
  onVerEnTarjeta: (clave: ClaveSel, vista?: VistaTarjeta) => void
}

const textoCerrados = (n: number) => `${n} ${n === 1 ? 'diagnóstico cerrado' : 'diagnósticos cerrados'} en este equipo · solo local`

export default function DiagnosticoA3c({ modelo, pc, idioma, onVerEnTarjeta }: DiagnosticoA3cProps) {
  const [pestana, setPestana] = useState<Pestana>('codigo')
  const [codigo, setCodigo] = useState('')
  const [local, setLocalEstado] = useState<EstadoLocal>(leerLocal)
  /**
   * Código con «Máquina parada y asegurada» confirmado: uno solo, solo en esta sesión y nunca
   * guardado. Cambiar de código (p. ej. a E 821, que manda arrancar) obliga a confirmar de nuevo.
   */
  const [asegurado, setAsegurado] = useState<string | null>(null)
  const [elegido, setElegido] = useState<number | null>(null)
  const [moduloId, setModuloId] = useState<string | null>(null)
  const [focoModulo, setFocoModulo] = useState<string | null>(null)
  const [led, setLed] = useState('')
  const [visto, setVisto] = useState<Visto>('encendido')
  const [aviso, setAviso] = useState('')
  const resultadoRef = useRef<HTMLDivElement>(null)

  /** Escribe sobre lo último guardado (otra pestaña pudo cerrar o marcar entretanto). */
  const actualizarLocal = (f: (e: EstadoLocal) => EstadoLocal) => {
    const nuevo = f(leerLocal())
    guardarLocal(nuevo)
    setLocalEstado(nuevo)
  }
  useEffect(() => {
    const alCambiar = (ev: StorageEvent) => {
      if (ev.key === null || ev.key === CLAVE_LOCAL) setLocalEstado(leerLocal())
    }
    window.addEventListener('storage', alCambiar)
    return () => window.removeEventListener('storage', alCambiar)
  }, [])

  const d = useMemo(() => (codigo.length === 3 ? diagnosticar(Number(codigo)) : null), [codigo])
  const mod = MODULOS.find(x => x.id === moduloId) ?? null
  const nLed = led ? Number(led) : null

  const irACodigo = (n: number) => {
    setCodigo(String(n))
    setAsegurado(null)
    setElegido(null)
    setPestana('codigo')
    setAviso('')
  }
  const alTeclear = (t: Tecla) => {
    setCodigo(c => teclear(c, t))
    setAsegurado(null)
    setElegido(null)
    setAviso('')
  }
  const verResultado = () => {
    const el = resultadoRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })
  }
  const ver = (clave: ClaveSel, vista?: VistaTarjeta) => onVerEnTarjeta(clave, vista)
  const verElemento = (k: string) => ver(`e:${k}`)

  // ─── Lo que muestra la columna de la regleta (PC) ───
  const pasoFoco = d && (elegido != null && d.pasos[elegido]?.elemento ? d.pasos[elegido] : d.pasos.find(p => p.elemento))
  const claveFoco: ClaveSel | null =
    pestana === 'codigo' ? (pasoFoco?.elemento ? `e:${pasoFoco.elemento}` : null)
      : pestana === 'modulo' ? ((focoModulo ?? mod?.elementos[0]) ? `e:${focoModulo ?? mod!.elementos[0]}` : null)
        : nLed != null && modelo.bornes.has(nLed) ? claveDeBorne(modelo, nLed) : null
  const elegidoEfectivo = d && pasoFoco ? d.pasos.indexOf(pasoFoco) : null

  // ─── Entrada ───
  const selector = (
    <SegmentedControl<Pestana>
      ariaLabel="Entrar al diagnóstico por"
      value={pestana}
      onChange={setPestana}
      segments={[{ value: 'codigo', label: 'Código' }, { value: 'modulo', label: 'Módulo' }, { value: 'led', label: 'LED' }]}
      className={cn(ALTO_44, 'w-full')}
    />
  )

  const familias = pc ? (
    <ListGroup title="Códigos del manual" className="[&_h2]:normal-case">
      {GRUPOS_CODIGOS.map(g => (
        <ListCell
          key={g.etiqueta}
          onClick={() => irACodigo(g.desde)}
          title={<span className="font-mono font-semibold tabular-nums">{g.etiqueta}</span>}
          subtitle={g.texto}
          className="min-h-[52px]"
        />
      ))}
    </ListGroup>
  ) : (
    <div>
      <p className="px-1 pb-2 text-footnote font-semibold text-muted-foreground">O elegir familia</p>
      <div className="flex flex-wrap gap-2">
        {GRUPOS_CODIGOS.map(g => (
          <button
            key={g.etiqueta}
            type="button"
            onClick={() => irACodigo(g.desde)}
            className="inline-flex h-[44px] items-center rounded-full bg-card px-4 text-subhead font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {g.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )

  const entrada =
    pestana === 'codigo' ? (
      <>
        <VisorCodigo prefijo="E" valor={codigo} vacio="8__" nota="del display" etiqueta="Código" />
        <TecladoNumerico nombre="Teclado del código" onTecla={alTeclear} onVer={verResultado} etiquetaVer="Ver" />
        {familias}
      </>
    ) : pestana === 'modulo' ? (
      <ListaModulos
        elegido={moduloId}
        onElegir={id => {
          setModuloId(id)
          setFocoModulo(null)
          if (!pc) setTimeout(verResultado, 0)
        }}
      />
    ) : (
      <>
        <VisorCodigo prefijo="LED" valor={led} vacio="—" nota="X5 de la tarjeta" etiqueta="LED" />
        <SegmentedControl<Visto>
          ariaLabel="Cómo ves el LED"
          value={visto}
          onChange={setVisto}
          segments={[{ value: 'encendido', label: 'Lo veo encendido' }, { value: 'apagado', label: 'Lo veo apagado' }]}
          className={cn(ALTO_44, 'w-full')}
        />
        <TecladoNumerico nombre="Teclado del LED" onTecla={t => setLed(c => teclear(c, t))} onVer={verResultado} etiquetaVer="Ver" />
      </>
    )

  // ─── Detalle ───
  let detalle: ReactNode = null
  if (pestana === 'codigo') {
    if (d) {
      detalle = (
        <ResultadoCodigo
          d={d}
          modelo={modelo}
          local={local}
          asegurada={asegurado === d.etiqueta}
          elegido={pc ? elegidoEfectivo : null}
          onConfirmar={() => setAsegurado(d.etiqueta)}
          onMarcar={(i, m: Marca) => actualizarLocal(e => marcar(e, claveMarca(d, i), m))}
          onCerrar={() => {
            actualizarLocal(e => cerrar(e, d))
            setAsegurado(null)
            setAviso(`Diagnóstico de ${d.etiqueta} cerrado.`)
          }}
          onVer={verElemento}
          onElegir={pc ? setElegido : undefined}
        />
      )
    } else if (codigo.length === 3) {
      detalle = (
        <NoIndicaCaja
          x={{ texto: `El manual no tiene ese código: E ${codigo} no está en la tabla de fallos (Manual 2005, p. 41–42).`, pregunta: 'Revisa el número en el display. ¿Qué código muestra exactamente?' }}
        />
      )
    } else if (pc) {
      detalle = <p className="rounded-card bg-card p-4 text-subhead text-muted-foreground">Escribe el código del display (tres cifras) o elige una familia de la lista.</p>
    }
  } else if (pestana === 'modulo') {
    detalle = mod ? (
      <DetalleModulo mod={mod} modelo={modelo} onElemento={k => (pc ? setFocoModulo(k) : verElemento(k))} onCodigo={irACodigo} />
    ) : pc ? (
      <p className="rounded-card bg-card p-4 text-subhead text-muted-foreground">Elige la herramienta de la máquina que falla.</p>
    ) : null
  } else if (nLed != null && nLed > 0) {
    detalle = <DetalleLed n={nLed} visto={visto} modelo={modelo} onVer={c => ver(c)} onCodigo={irACodigo} />
  } else if (pc) {
    detalle = <p className="rounded-card bg-card p-4 text-subhead text-muted-foreground">Escribe el número del LED (el mismo del borne X5) y si lo ves encendido o apagado.</p>
  }

  const contador = (
    <p className="px-1 text-footnote tabular-nums text-muted-foreground" data-testid="contador-diagnosticos">
      {textoCerrados(local.cerrados)}
    </p>
  )
  const avisoVivo = (
    <p className="sr-only" role="status" aria-live="polite">
      {aviso}
    </p>
  )

  if (!pc) {
    return (
      <div className="mt-3 flex flex-col gap-3" data-testid="diagnostico-a3c">
        {selector}
        {entrada}
        <div ref={resultadoRef} className="scroll-mt-3">
          {detalle}
        </div>
        {aviso && <p className="px-1 text-subhead font-semibold">{aviso}</p>}
        {contador}
        {avisoVivo}
      </div>
    )
  }

  return (
    <div
      className="grid items-start gap-5"
      style={{ gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr) minmax(280px, 380px)' }}
      data-testid="diagnostico-a3c"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {selector}
        {entrada}
        {contador}
      </div>
      <div ref={resultadoRef} className="min-w-0">
        {aviso && <p className="mb-3 rounded-card bg-card p-4 text-subhead font-semibold">{aviso}</p>}
        {detalle}
      </div>
      <PanelRegleta
        modelo={modelo}
        clave={claveFoco}
        idioma={idioma}
        onBorne={n => {
          setLed(String(n))
          setPestana('led')
        }}
        onVer={ver}
      />
      {avisoVivo}
    </div>
  )
}

/** PC: la regleta del elemento elegido, con su LED (pulsa solo si es la señal real del elemento). */
function PanelRegleta({
  modelo,
  clave,
  idioma,
  onBorne,
  onVer,
}: {
  modelo: ModeloA3c
  clave: ClaveSel | null
  idioma: Idioma
  onBorne: (n: number) => void
  onVer: (clave: ClaveSel, vista?: VistaTarjeta) => void
}) {
  const item = clave ? describir(modelo, clave, 'es') : null
  const n0 = item?.bornes[0]
  const r = n0 != null ? regletaDe(n0) : undefined
  const bornes = useMemo(() => {
    if (!r) return new Map<number, Borne>()
    return new Map<number, Borne>([...modelo.bornes].filter(([n]) => n >= r.desde && n <= r.hasta))
  }, [modelo, r])
  const elegidos = useMemo(() => new Set(item?.bornes ?? []), [item])
  const encendidos = useMemo(() => new Set(item?.modoLed === 'senal' ? item.leds : []), [item])
  const grupo = useMemo(() => new Set(item?.modoLed === 'contorno' ? item.leds : []), [item])
  const senal = item?.modoLed === 'senal' && item.leds.length > 0
  // Filas de 44 px: la regleta no cabe entera; se recorre hasta el borne del elemento.
  const cajaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cont = cajaRef.current?.querySelector<HTMLElement>('[data-orientacion="vertical"]')
    const celda = n0 != null ? cont?.querySelector<HTMLElement>(`[data-n="${n0}"]`) : null
    if (!cont || !celda) return
    cont.scrollTop += celda.getBoundingClientRect().top - cont.getBoundingClientRect().top - cont.clientHeight / 2 + celda.offsetHeight / 2
  }, [n0, clave])
  return (
    <aside className="sticky top-4 flex min-w-0 flex-col gap-3" aria-label="Regleta X5 del paso elegido" data-testid="panel-regleta">
      <div className="rounded-card bg-card p-4">
        <p className="text-footnote font-semibold text-muted-foreground">Regleta X5{r ? ` · ${r.desde}–${r.hasta}` : ''}</p>
        <p className="mt-1 text-subhead leading-snug">
          {!item
            ? 'Elige un paso, un elemento o un LED.'
            : !item.leds.length
              ? `${item.codigo}: sin LED en la regleta X5.`
              : senal
                ? `${item.codigo} · LED ${item.leds.join(' y ')} pulsa porque es la señal del elemento.${item.foto ? ` ${item.foto}` : ''}`
                : `${item.codigo} · LED ${item.leds.join(' y ')} con contorno: no se enciende.${item.foto ? ` ${item.foto}` : ''}`}
        </p>
        {r && (
          <div ref={cajaRef} className="a3cd-regleta mt-3 h-[min(52vh,520px)]">
            <RegletaX5
              bornes={bornes}
              elegidos={elegidos}
              encendidos={encendidos}
              grupo={grupo}
              idioma={idioma}
              compacta={false}
              vertical
              onElegir={onBorne}
            />
          </div>
        )}
        <div className="a3cd-leyenda mt-3 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="a3c-punto a3c-encendido" />señal del elemento</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="a3c-punto" />otro LED</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="a3c-punto a3c-grupo" />grupo o estado</span>
        </div>
      </div>
      {item && clave && (
        <div className="rounded-card bg-card p-4">
          <p className="pb-2 text-footnote font-semibold text-muted-foreground">Abrir en</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="tinted" onClick={() => onVer(clave, 'plano')}>Plano · hoja 23</Button>
            <Button variant="tinted" onClick={() => onVer(clave, 'placa')}>Placa N2</Button>
            <Button variant="plain" onClick={() => onVer(clave)}>Ficha {item.codigo}</Button>
          </div>
        </div>
      )}
    </aside>
  )
}
