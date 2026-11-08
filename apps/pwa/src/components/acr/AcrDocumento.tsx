/**
 * AcrDocumento — la lectura del ACR como documento, para la página de PC (mockup B aprobado
 * el 08-11-2026). El título dice qué pasó; causas y acciones son filas con filete, sin tarjetas
 * ni píldoras; la foto y la verificación van en la columna derecha.
 *
 * Cuatro cuerpos y ninguno más: title1 / title3 / body / footnote. El celular conserva la hoja
 * de `AcrLectura`; esto solo se ve en el teléfono si alguien abre el enlace directo.
 */
import {
  ETIQUETA_6M,
  ETIQUETA_FUERZA,
  ETIQUETA_NIVEL,
  ETIQUETA_RESULTADO,
  type Acr,
  type AccionAcr,
  type ResultadoVerificacion,
} from '@/services/acr/acr.types'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'
import { fechaVerificacion } from '@/services/acr/acrHistorial'
import { fraseDetencion, totalFuertes } from './acrDocumentoTextos'
import { ControlAccionHecha, ControlResultado } from './AcrLectura'
import { useUbicacionJK } from './useUbicacionJK'
import { textoUbicacionJK } from './textoUbicacionJK'

const FILA = 'border-t border-border py-[11px]'
const FILA_CAUSA = `grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-x-4 lg:grid-cols-[88px_minmax(0,1fr)] ${FILA}`
const COLUMNAS_ACCION = 'grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-x-4 lg:grid-cols-[88px_minmax(0,1fr)] min-[1400px]:grid-cols-[88px_minmax(0,1fr)_112px_72px]'
const DATO = `flex items-baseline justify-between gap-4 ${FILA}`
const CELDA_META = 'col-start-2 text-footnote text-muted-foreground min-[1400px]:col-start-auto'

/** Solo el resultado pendiente pide atención; los otros dos se leen en la palabra. */
const PUNTO_RESULTADO: Record<ResultadoVerificacion, string | null> = {
  pendiente: 'bg-warning',
  eficaz: null,
  no_eficaz: 'bg-critical',
}

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

/** «Al cambiar…» → «al cambiar…», para seguir la frase. Respeta siglas como «PLC falla». */
function continuarFrase(texto: string): string {
  return /^\p{Lu}\p{Ll}/u.test(texto) ? texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1) : texto
}

export interface AcrDocumentoProps {
  acr: Acr
  /** Una sola columna a cualquier ancho (el panel de PC de Causa raíz). */
  compacto?: boolean
  /** Si existe, la lectura deja marcar acciones hechas y el resultado de la verificación. */
  onActualizar?: (a: Acr) => void
}

export function AcrDocumento({ acr, compacto = false, onActualizar }: AcrDocumentoProps) {
  const equipo = nombreEquipoLegible(acr.equipo)
  const criterio = acr.verificacion.criterio.replace(acr.equipo, equipo)
  const fuertes = acr.acciones.filter((a) => a.fuerza === 'fuerte').length
  const causaDe = (id: string | null): string | null => (id && acr.causas.find((c) => c.id === id)?.texto) || null
  const punto = PUNTO_RESULTADO[acr.verificacion.resultado]
  const cambiarAccion = (id: string, cambio: Partial<AccionAcr>) =>
    onActualizar?.({
      ...acr,
      acciones: acr.acciones.map((x) => (x.id === id ? { ...x, ...cambio } : x)),
      updatedAt: new Date(),
    })
  const cambiarResultado = (resultado: ResultadoVerificacion) =>
    onActualizar?.({ ...acr, verificacion: { ...acr.verificacion, resultado }, updatedAt: new Date() })
  const definicion = acr.definicion.trim() !== '' ? acr.definicion : equipo

  return (
    <article
      className={
        compacto
          ? 'flex flex-col gap-9'
          : 'flex flex-col gap-9 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,32%)] lg:items-start lg:gap-x-[56px] lg:gap-y-0'
      }
    >
      <div className="min-w-0">
        <p className="text-footnote text-muted-foreground">Análisis de causa raíz</p>
        {compacto ? (
          <h2 className="mt-1.5 text-title2 text-foreground [text-wrap:balance]">{definicion}</h2>
        ) : (
          <h1 className="mt-1.5 text-title1 text-foreground [text-wrap:balance]">{definicion}</h1>
        )}
        <p className="mt-2.5 text-body text-muted-foreground">
          {equipo}, turno del <span className="whitespace-nowrap tabular-nums">{fechaCorta(acr.fechaTurno)}</span>. {fraseDetencion(acr.minutosDetencion)}
        </p>

        <h2 className="mb-3 mt-8 text-title3 text-foreground">Causas</h2>
        {acr.causas.length === 0 && <p className={`text-body text-muted-foreground ${FILA}`}>Sin causas registradas</p>}
        {acr.causas.map((c) => (
          <div key={c.id} className={FILA_CAUSA}>
            <span className="text-footnote text-muted-foreground">{ETIQUETA_NIVEL[c.nivel]}</span>
            <div>
              <p className="max-w-[80ch] text-body text-foreground">{c.texto}</p>
              {c.m6 && <p className="mt-1 text-footnote text-muted-foreground">6M: {ETIQUETA_6M[c.m6]}</p>}
            </div>
          </div>
        ))}

        <h2 className="mb-3 mt-8 text-title3 text-foreground">Acciones</h2>
        {acr.acciones.length === 0 ? (
          <p className={`text-body text-muted-foreground ${FILA}`}>Sin acciones registradas</p>
        ) : (
          <>
            {!compacto && (
              <div className={`hidden pb-2 text-footnote text-muted-foreground min-[1400px]:grid ${COLUMNAS_ACCION}`}>
                <span>Fuerza</span>
                <span>Qué se hace</span>
                <span>Responsable</span>
                <span>Límite</span>
              </div>
            )}
            {acr.acciones.map((a) => {
              const ataca = causaDe(a.causaId)
              if (compacto) {
                return (
                  <div key={a.id} className={`flex flex-col gap-1.5 ${FILA}`}>
                    <span className={`text-body text-foreground ${a.fuerza === 'fuerte' ? 'font-semibold' : ''}`}>
                      {ETIQUETA_FUERZA[a.fuerza]}
                    </span>
                    <p className="max-w-[80ch] text-body text-foreground">{a.texto}</p>
                    <p className="text-footnote text-muted-foreground">{ataca ? `Ataca: ${continuarFrase(ataca)}` : 'Sin causa asociada'}</p>
                    <p className="text-footnote text-muted-foreground">Responsable: {a.responsable || 'Sin asignar'}</p>
                    <p className="text-footnote text-muted-foreground tabular-nums">
                      Límite: {a.fechaLimite ? fechaCorta(a.fechaLimite) : 'Sin fecha'}
                    </p>
                    {onActualizar && <ControlAccionHecha accion={a} onCambiar={(c) => cambiarAccion(a.id, c)} />}
                  </div>
                )
              }
              return (
                <div key={a.id} className={`${COLUMNAS_ACCION} ${FILA}`}>
                  <span className={`text-body text-foreground ${a.fuerza === 'fuerte' ? 'font-semibold' : ''}`}>
                    {ETIQUETA_FUERZA[a.fuerza]}
                  </span>
                  <div>
                    <p className="max-w-[80ch] text-body text-foreground">{a.texto}</p>
                    <p className="mt-1 text-footnote text-muted-foreground">
                      {ataca ? `Ataca: ${continuarFrase(ataca)}` : 'Sin causa asociada'}
                    </p>
                  </div>
                  <span className={CELDA_META}>
                    <span className="min-[1400px]:hidden">Responsable: </span>
                    {a.responsable || 'Sin asignar'}
                  </span>
                  <span className={`tabular-nums ${CELDA_META}`}>
                    <span className="min-[1400px]:hidden">Límite: </span>
                    {a.fechaLimite ? fechaCorta(a.fechaLimite) : 'Sin fecha'}
                  </span>
                </div>
              )
            })}
            {compacto ? (
              <p className="border-t border-foreground pt-[11px] text-footnote text-foreground">{totalFuertes(fuertes, acr.acciones.length)}</p>
            ) : (
              <div className={`${COLUMNAS_ACCION} border-t border-foreground pt-[11px]`}>
                <span className="col-start-2 text-footnote text-foreground">{totalFuertes(fuertes, acr.acciones.length)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="min-w-0">
        {acr.evidencias.length === 0 && <p className="mb-3 text-body text-muted-foreground">Sin fotos</p>}
        <div className="flex flex-col gap-4">
          {acr.evidencias.map((e, i) => {
            const origen = e.origen === 'bitacora' ? 'Foto del evento de Bitácora.' : 'Foto agregada en el análisis.'
            return (
              <figure key={e.path} className="m-0">
                <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Abrir foto: ${e.nota || 'evidencia'}`} className="block rounded-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <img src={e.url} alt={e.nota || 'Evidencia del análisis'} loading={i === 0 ? 'eager' : 'lazy'} className="block aspect-[3/2] w-full rounded-ctl object-cover" />
                </a>
                <figcaption className="mt-2 text-footnote text-muted-foreground">
                  {e.nota ? `${e.nota}. ${origen}` : origen}
                </figcaption>
              </figure>
            )
          })}
        </div>

        <div className="mt-5">
          <div className={DATO}>
            <span className="text-body text-foreground">Pieza dañada guardada</span>
            <span className="text-body text-foreground">{acr.piezaGuardada ? 'Sí' : 'No'}</span>
          </div>
          <div className={DATO}>
            <span className="text-body text-foreground">Estado del análisis</span>
            <span className="text-body text-foreground">{acr.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}</span>
          </div>
        </div>

        <h2 className="mb-3 mt-8 text-title3 text-foreground">Verificación</h2>
        <p className="text-body text-foreground">{criterio}</p>
        <p className="mt-1 text-footnote text-muted-foreground tabular-nums">Vence el {fechaCorta(fechaVerificacion(acr))}</p>
        <div className={`mt-3.5 ${DATO}`}>
          <span className="text-body text-foreground">Resultado</span>
          <span className="text-body text-foreground">
            {punto && <span aria-hidden className={`mr-2 inline-block h-2 w-2 rounded-full align-[0.08em] ${punto}`} />}
            {ETIQUETA_RESULTADO[acr.verificacion.resultado]}
          </span>
        </div>
        {onActualizar && acr.verificacion.resultado === 'pendiente' && <ControlResultado onElegir={cambiarResultado} />}

        {acr.causaJK !== undefined && (
          <>
            <h2 className="mb-3 mt-8 text-title3 text-foreground">En el Jack-Knife</h2>
            {acr.causaJK === null ? (
              <p className={`text-body text-foreground ${FILA}`}>No aparece en el Jack-Knife</p>
            ) : (
              <SeccionJK causa={acr.causaJK} />
            )}
          </>
        )}
      </aside>
    </article>
  )
}

/** Dónde cae la causa en el Jack-Knife de 90 días (mismo texto que la hoja del celular). */
function SeccionJK({ causa }: { causa: string }) {
  const { detalle, nivel } = textoUbicacionJK(useUbicacionJK(causa))
  return (
    <div className={FILA}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body text-foreground">{causa}</span>
        {nivel && <span className="text-body text-foreground tabular-nums">{nivel}</span>}
      </div>
      <p className="mt-1 text-footnote text-muted-foreground tabular-nums">{detalle}</p>
    </div>
  )
}
