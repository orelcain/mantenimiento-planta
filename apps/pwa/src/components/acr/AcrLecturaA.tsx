/**
 * AcrLecturaA — la página del ACR en modo lectura (opción A, «secciones pareadas»,
 * aprobada el 10-11-2026). Solo bajo la piel Apple; la piel anterior sigue con
 * `AcrDocumento`.
 *
 * Mismo contenido que `AcrDocumento`, otra forma: una línea de contexto y el titular
 * a todo el ancho; debajo, en PC, dos columnas 7/5 con filete: Causas y Acciones a
 * la izquierda, Evidencia y Verificación a la derecha. En el celular, una columna en
 * ese orden. Cuatro cuerpos (`Lectura.tsx`), sin cajas.
 */
import { ETIQUETA_6M, ETIQUETA_FUERZA, ETIQUETA_NIVEL, ETIQUETA_RESULTADO, type Acr, type ResultadoVerificacion } from '@/services/acr/acr.types'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'
import { fechaVerificacion } from '@/services/acr/acrHistorial'
import { cn } from '@/lib/utils'
import { FilasLectura, LECTURA_CUERPO, LECTURA_NOTA, LECTURA_TITULO, SeccionLectura } from '@/components/piel/Lectura'
import { fraseDetencion, totalFuertes } from './acrDocumentoTextos'
import { ControlResultado } from './AcrLectura'
import { useUbicacionJK } from './useUbicacionJK'
import { textoUbicacionJK } from './textoUbicacionJK'

/** Solo el resultado pendiente pide atención; los otros dos se leen en la palabra. */
const PUNTO_RESULTADO: Record<ResultadoVerificacion, string | null> = {
  pendiente: 'bg-warning',
  eficaz: null,
  no_eficaz: 'bg-critical',
}

const TH = cn(LECTURA_NOTA, 'py-1.5 pl-2.5 lg:pl-3 first:pl-0 font-normal text-left')
const TD = 'py-[11px] lg:py-[9px] pl-2.5 lg:pl-3 first:pl-0 align-baseline'
const SOLO_PC = 'hidden lg:table-cell'

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

/** «Al cambiar…» → «al cambiar…», para seguir la frase. Respeta siglas como «PLC falla». */
function continuarFrase(texto: string): string {
  return /^\p{Lu}\p{Ll}/u.test(texto) ? texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1) : texto
}

export interface AcrLecturaAProps {
  acr: Acr
  /** Si existe, la lectura deja marcar el resultado de la verificación. */
  onActualizar?: (a: Acr) => void
}

export function AcrLecturaA({ acr, onActualizar }: AcrLecturaAProps) {
  const equipo = nombreEquipoLegible(acr.equipo)
  const criterio = acr.verificacion.criterio.replace(acr.equipo, equipo)
  const fuertes = acr.acciones.filter((a) => a.fuerza === 'fuerte').length
  const causaDe = (id: string | null): string | null => (id && acr.causas.find((c) => c.id === id)?.texto) || null
  const punto = PUNTO_RESULTADO[acr.verificacion.resultado]
  const cambiarResultado = (resultado: ResultadoVerificacion) =>
    onActualizar?.({ ...acr, verificacion: { ...acr.verificacion, resultado }, updatedAt: new Date() })
  const definicion = acr.definicion.trim() !== '' ? acr.definicion : equipo

  return (
    <article className="flex flex-col gap-[22px]" data-testid="acr-lectura">
      <div>
        <p className={LECTURA_NOTA}>
          {equipo}, turno del <span className="whitespace-nowrap tabular-nums">{fechaCorta(acr.fechaTurno)}</span>.{' '}
          {fraseDetencion(acr.minutosDetencion)} {acr.estado === 'cerrado' ? 'Análisis cerrado.' : 'Análisis en borrador.'}
        </p>
        <h1 className={cn(LECTURA_TITULO, 'mt-1.5 max-w-[920px]')}>{definicion}</h1>
      </div>

      <div className="flex flex-col gap-[26px] lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-x-12">
        <div className="flex min-w-0 flex-col gap-[26px]">
          <SeccionLectura titulo="Causas">
            {acr.causas.length === 0 ? (
              <p className={cn(LECTURA_CUERPO, 'border-t border-border py-[9px] text-muted-foreground')}>Sin causas registradas</p>
            ) : (
              <dl className={cn('m-0', LECTURA_CUERPO)}>
                {acr.causas.map((c) => (
                  <div key={c.id} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-[9px]">
                    <dt className="text-muted-foreground">{ETIQUETA_NIVEL[c.nivel]}</dt>
                    <dd className="m-0 max-w-[80ch]">
                      {c.texto}
                      {c.m6 && <span className={cn(LECTURA_NOTA, 'mt-1 block')}>6M: {ETIQUETA_6M[c.m6]}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </SeccionLectura>

          <SeccionLectura titulo="Acciones">
            {acr.acciones.length === 0 ? (
              <p className={cn(LECTURA_CUERPO, 'border-t border-border py-[9px] text-muted-foreground')}>Sin acciones registradas</p>
            ) : (
              <>
                <table className={cn('w-full border-collapse', LECTURA_CUERPO)}>
                  <caption className="sr-only">Acciones del análisis</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Qué se hace</th>
                      <th scope="col" className={TH}>Fuerza</th>
                      <th scope="col" className={cn(TH, SOLO_PC)}>Responsable</th>
                      <th scope="col" className={cn(TH, SOLO_PC, 'text-right')}>Límite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acr.acciones.map((a) => {
                      const ataca = causaDe(a.causaId)
                      const responsable = a.responsable || 'Sin asignar'
                      const limite = a.fechaLimite ? fechaCorta(a.fechaLimite) : 'Sin fecha'
                      return (
                        <tr key={a.id} className="border-t border-border">
                          <td className={TD}>
                            <span className="block max-w-[80ch]">{a.texto}</span>
                            <span className={cn(LECTURA_NOTA, 'mt-1 block')}>
                              {ataca ? `Ataca: ${continuarFrase(ataca)}` : 'Sin causa asociada'}
                            </span>
                            {/* En el celular no caben las columnas: responsable y límite van bajo la acción. */}
                            <span className={cn(LECTURA_NOTA, 'block tabular-nums lg:hidden')}>
                              {`Responsable: ${responsable}. Límite: ${limite}.`}
                            </span>
                          </td>
                          <td className={cn(TD, 'whitespace-nowrap', a.fuerza === 'fuerte' && 'font-semibold')}>
                            {ETIQUETA_FUERZA[a.fuerza]}
                          </td>
                          <td className={cn(TD, SOLO_PC, 'whitespace-nowrap')}>{responsable}</td>
                          <td className={cn(TD, SOLO_PC, 'whitespace-nowrap text-right tabular-nums')}>{limite}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className={cn(LECTURA_NOTA, 'mt-2 font-semibold text-foreground')}>
                  {totalFuertes(fuertes, acr.acciones.length)}
                </p>
              </>
            )}
          </SeccionLectura>
        </div>

        <div className="flex min-w-0 flex-col gap-[26px]">
          <SeccionLectura titulo="Evidencia">
            {acr.evidencias.length === 0 && <p className={cn(LECTURA_CUERPO, 'text-muted-foreground')}>Sin fotos</p>}
            <div className="flex flex-col gap-4">
              {acr.evidencias.map((e, i) => {
                const origen = e.origen === 'bitacora' ? 'Foto del evento de Bitácora.' : 'Foto agregada en el análisis.'
                return (
                  <figure key={e.path} className="m-0">
                    <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Abrir foto: ${e.nota || 'evidencia'}`} className="block max-w-[560px] rounded-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <img src={e.url} alt={e.nota || 'Evidencia del análisis'} loading={i === 0 ? 'eager' : 'lazy'} className="block aspect-[3/2] w-full object-cover" />
                    </a>
                    <figcaption className={cn(LECTURA_NOTA, 'mt-1.5')}>
                      {e.nota ? `${e.nota}. ${origen}` : origen}
                    </figcaption>
                  </figure>
                )
              })}
            </div>
            <p className={cn(LECTURA_NOTA, acr.evidencias.length > 0 ? 'mt-0' : 'mt-1')}>
              {acr.piezaGuardada ? 'Pieza dañada guardada.' : 'Pieza dañada no guardada.'}
            </p>
          </SeccionLectura>

          <SeccionLectura titulo="Verificación">
            <p className={LECTURA_CUERPO}>{criterio}</p>
            <FilasLectura
              className="mt-2"
              filas={[
                { rotulo: 'Vence', valor: fechaCorta(fechaVerificacion(acr)) },
                {
                  rotulo: 'Resultado',
                  valor: (
                    <>
                      {punto && <span aria-hidden className={`mr-2 inline-block h-2 w-2 rounded-full align-[0.08em] ${punto}`} />}
                      {ETIQUETA_RESULTADO[acr.verificacion.resultado]}
                    </>
                  ),
                },
              ]}
            />
            {onActualizar && acr.verificacion.resultado === 'pendiente' && <ControlResultado onElegir={cambiarResultado} />}
          </SeccionLectura>

          {acr.causaJK !== undefined && (
            <SeccionLectura titulo="En el Jack-Knife">
              {acr.causaJK === null ? (
                <p className={LECTURA_CUERPO}>No aparece en el Jack-Knife</p>
              ) : (
                <UbicacionJK causa={acr.causaJK} />
              )}
            </SeccionLectura>
          )}
        </div>
      </div>
    </article>
  )
}

/** Dónde cae la causa en el Jack-Knife de 90 días (mismo texto que la hoja del celular). */
function UbicacionJK({ causa }: { causa: string }) {
  const { detalle, nivel } = textoUbicacionJK(useUbicacionJK(causa))
  return (
    <div className={LECTURA_CUERPO}>
      <div className="flex items-baseline justify-between gap-4">
        <span>{causa}</span>
        {nivel && <span className="tabular-nums">{nivel}</span>}
      </div>
      <p className={cn(LECTURA_NOTA, 'mt-1 tabular-nums')}>{detalle}</p>
    </div>
  )
}
