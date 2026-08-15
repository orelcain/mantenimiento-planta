/**
 * «Qué cambió contra ayer» + «Contra lo mejor que ya hicimos».
 *
 * Solo aparece con el TURNO CERRADO: a mitad de turno el término «duración»
 * compararía una ventana a medio crecer contra una completa y todos los números
 * darían en contra sin que nadie hubiera hecho nada mal. La pregunta en vivo
 * («¿cómo voy ahora?») ya la contesta el comparador.
 *
 * La mitad constructiva importa tanto como la otra: cuando el día fue mejor, el
 * bloque dice qué se hizo bien y cuánto valió («bajar las paradas de 78 a 33
 * min valió 577 piezas»), y cuando se rompe un récord, lo celebra. Un monitor
 * que solo reparte culpas se deja de mirar.
 */
import type { RecordsResult, VsAyerResult } from '@/services/shoplogix/monitorVsAyer'
import { nombreDeDia } from '@/services/shoplogix/monitorVsAyer'
import { Bloque } from './MonitorShiftParts'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(Math.abs(n)))
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDec = (n: number) => nf1.format(n)

function fmtDurMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m > 0 ? `${h} h ${m}` : `${h} h`
}

/** Un renglón de la cascada: signo, qué pasó, cuántas piezas. */
function Termino({ signo, titulo, detalle, piezas }: {
  signo: '+' | '−' | '·'
  titulo: string
  detalle: string
  piezas: number
}) {
  const color = signo === '+' ? 'text-emerald-700 dark:text-emerald-400'
    : signo === '−' ? 'text-red-700 dark:text-red-400'
      : 'text-muted-foreground'
  return (
    <div className="grid grid-cols-[14px_1fr_auto] items-baseline gap-2 border-t border-border/60 py-1 first:border-t-0">
      <span className={`text-center font-bold tabular-nums ${color}`}>{signo}</span>
      <span className="text-[12px]">
        {titulo}
        <span className="block text-[10.5px] text-muted-foreground/80">{detalle}</span>
      </span>
      <span className={`tabular-nums text-[12px] font-semibold ${color}`}>
        {signo === '−' ? '−' : signo === '+' ? '+' : ''}{fmtInt(piezas)} pz
      </span>
    </div>
  )
}

export function VsAyerBloque({ r, records }: {
  r: VsAyerResult | null
  records: RecordsResult | null
}) {
  if (!r && !records) return null

  /*
   * Los términos se muestran de MAYOR a menor efecto: el orden fijo del
   * servicio es para auditar; acá manda qué explicó el día. El residuo va
   * siempre último — es el «no sabemos», no una causa.
   */
  const terminos = r
    ? [...r.terminos].sort((a, b) =>
      (a.clave === 'residuo' ? -1 : Math.abs(a.piezas)) < (b.clave === 'residuo' ? -1 : Math.abs(b.piezas)) ? 1 : -1)
    : []

  const gano = r != null && r.diff >= 0
  const masRapido = r != null && r.ritmoHoy > r.ritmoAyer

  const textos: Record<string, (t: { hoy: number; ayer: number }) => { t: string; d: string } | null> = {
    duracion: (t) => ({
      t: t.hoy < t.ayer ? 'El turno duró menos' : 'Turno más largo',
      d: `${fmtDurMin(t.hoy)} contra ${fmtDurMin(t.ayer)} de ventana`,
    }),
    convenio: (t) => (t.hoy === t.ayer ? null : {
      t: t.hoy > t.ayer ? 'Más convenio' : 'Menos convenio',
      d: `${Math.round(t.hoy)} min contra ${Math.round(t.ayer)}`,
    }),
    paradas: (t) => (t.hoy === t.ayer ? null : {
      t: t.hoy < t.ayer ? 'Menos paradas evitables' : 'Más paradas evitables',
      d: `${Math.round(t.hoy)} min contra ${Math.round(t.ayer)}`,
    }),
    ritmo: (t) => ({
      t: t.hoy > t.ayer ? 'Línea más rápida' : 'Línea más lenta',
      d: `${fmtDec(t.hoy)} contra ${fmtDec(t.ayer)} pz/min andando`,
    }),
    residuo: () => ({ t: 'Huecos de sensor y redondeo', d: '' }),
  }

  return (
    <Bloque
      id="vs-ayer"
      titulo="Qué cambió contra ayer"
      extra={r && (
        <span className={`tabular-nums font-semibold ${gano ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
          {gano ? '+' : '−'}{fmtInt(r.diff)} pz
        </span>
      )}
    >
      {r && r.datosIncompletos && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Los datos de {nombreDeDia(r.ayer.dateKey)} están incompletos: la diferencia no se puede
          repartir sin inventar. Queda solo el total: {r.diff >= 0 ? '+' : '−'}{fmtInt(r.diff)} pz.
        </p>
      )}

      {r && !r.datosIncompletos && (
        <>
          {/* La frase primero: el número grande ya está en el título. Lo que
              esta línea evita es la lectura floja «hizo menos = fue más lento»,
              que el 14-08 era exactamente al revés. */}
          <p className="mt-2 text-[13px] leading-snug">
            Se hicieron <b className="tabular-nums">{fmtInt(r.diff)} pz {gano ? 'más' : 'menos'}</b>{' '}
            que el {nombreDeDia(r.ayer.dateKey)}
            {!gano && masRapido && (
              <>
                {' '}— pero <b>no por lentitud</b>: la línea fue{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {fmtDec(r.ritmoHoy - r.ritmoAyer)} pz/min más rápida
                </span>
              </>
            )}
            .
          </p>

          <div className="mt-2">
            {terminos.map((t) => {
              const tx = textos[t.clave]?.(t)
              if (!tx || Math.round(t.piezas) === 0) return null
              const signo = t.clave === 'residuo' ? '·' : t.piezas > 0 ? '+' : '−'
              return <Termino key={t.clave} signo={signo} titulo={tx.t} detalle={tx.d} piezas={t.piezas} />
            })}
            <div className="flex items-baseline justify-between border-t-2 border-border pt-1.5 text-[12px] font-bold">
              <span>Diferencia del día</span>
              <span className={`tabular-nums ${gano ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {gano ? '+' : '−'}{fmtInt(r.diff)} pz
              </span>
            </div>
          </div>

          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/70">
            Contra el último turno del mismo nombre con datos completos. Piezas estimadas al ritmo
            andando de cada día.
          </p>
        </>
      )}

      {records && (
        // Aire en vez de línea (§38): el espacio separa igual, con menos tinta.
        <div className={r ? 'mt-4' : 'mt-2'}>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Contra lo mejor que ya hicimos
            <span className="normal-case tracking-normal"> · {records.muestras} turnos</span>
          </p>
          <ul className="mt-1 space-y-1">
            {records.componentes.map((c) => {
              const fmt = c.clave === 'ritmo' ? (v: number) => `${fmtDec(v)} pz/min`
                : c.clave === 'paradas' ? (v: number) => `${Math.round(v)} min`
                  : (v: number) => `${Math.round(v)}%`
              const nombre = c.clave === 'ritmo' ? 'Ritmo andando'
                : c.clave === 'paradas' ? 'Paradas evitables'
                  : 'Tiempo produciendo'
              return (
                <li key={c.clave} className="text-[12px]">
                  <span className="flex items-baseline justify-between gap-2">
                    <span>
                      {c.esNuevo && <span aria-hidden>🏆 </span>}
                      {c.esNuevo ? <b>{nombre} · récord nuevo</b> : nombre}
                    </span>
                    <span className="tabular-nums font-semibold">{fmt(c.hoy)}</span>
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground/80">
                    {c.esNuevo
                      ? `el anterior era ${fmt(c.record)} (${nombreDeDia(c.recordDe)})`
                      : `el récord es ${fmt(c.record)} (${nombreDeDia(c.recordDe)})`}
                    {!c.esNuevo && c.brechaPiezas != null && c.brechaPiezas > 0 && (
                      <> — esa brecha vale +{fmtInt(c.brechaPiezas)} pz</>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/70">
            Récords de lo que el turno controla: la duración y el convenio los pone el calendario.
            El de «más piezas» no compite — era solo el turno más largo.
          </p>
        </div>
      )}
    </Bloque>
  )
}
