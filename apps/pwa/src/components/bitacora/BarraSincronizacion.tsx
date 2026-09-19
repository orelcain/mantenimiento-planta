import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Monitor, Smartphone } from "lucide-react";
import { Tag, type TagTone } from "@/components/piel";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { PresenciaBitacora } from "@/services/bitacora/bitacora.types";
import {
  estadoSincronizacion,
  iniciales,
  NOMBRE_DISPOSITIVO,
} from "@/services/bitacora/presencia";
import { horaDe } from "@/services/bitacora/turnoMantencion";
import { dispositivoActual } from "@/services/bitacora/dispositivo";

/** Cuánto se muestra «Leandro agregó un evento» antes de volver a «Todo al día». */
const NOVEDAD_MS = 8_000;

/**
 * Barra de sincronización de la bitácora (mockup aprobado 16-09-2026).
 *
 * Responde tres preguntas de una mirada: ¿lo que veo es lo que ven los demás?,
 * ¿se me está quedando algo en el teléfono?, ¿quién más está en la bitácora
 * ahora? En el celular la lista de conectados se abre con un toque; en el PC
 * va abierta.
 */
export function BarraSincronizacion({
  cargando,
  error,
  ultimaSync,
  cambiosPorSubir,
  novedad,
  presentes,
  miDispositivoId,
  editandoPorEvento,
  tonoDe,
  compacta = false,
}: {
  cargando: boolean;
  error: string | null;
  ultimaSync: Date | null;
  cambiosPorSubir: number;
  novedad: { texto: string; en: number } | null;
  presentes: readonly PresenciaBitacora[];
  miDispositivoId: string;
  /** Para decir «escribiendo» en quien tiene un evento abierto. */
  editandoPorEvento?: (eventoId: string) => boolean;
  tonoDe: (nombre: string) => TagTone;
  /**
   * PC (mockup «Dos ejes», 18-09-2026): una LÍNEA (punto · estado · avatares)
   * junto al turno, y la lista de conectados en un panel al tocarla. El estado
   * describe el contenido, no es una acción: no va en tarjeta ni en la toolbar.
   */
  compacta?: boolean;
}) {
  const enLinea = useOnlineStatus();
  const [ahora, setAhora] = useState(() => Date.now());
  const [abierta, setAbierta] = useState(false);
  const [panel, setPanel] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  // El panel se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!panel) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setPanel(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [panel]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const estado = estadoSincronizacion({
    enLinea,
    cambiosPorSubir,
    fotosSubiendo: 0,
  });
  const dondeEstoy = NOMBRE_DISPOSITIVO[dispositivoActual()];
  const novedadVigente =
    novedad && ahora - novedad.en < NOVEDAD_MS ? novedad.texto : null;

  let titulo: string;
  let detalle: string;
  if (error) {
    titulo = "Sin conexión con la bitácora";
    detalle = error;
  } else if (cargando) {
    titulo = "Cargando…";
    detalle = "Buscando los eventos del turno";
  } else if (estado === "sin-senal") {
    titulo = "Sin señal";
    detalle = cambiosPorSubir
      ? `${cambiosPorSubir} ${cambiosPorSubir === 1 ? "cambio guardado" : "cambios guardados"} en este ${dondeEstoy} · se suben solos`
      : "Puedes seguir registrando: se sube solo al volver la señal";
  } else if (estado === "guardando") {
    // HIG «Progress indicators»: nada de «Guardando…» genérico; se dice qué falta.
    titulo = "Enviando";
    detalle = `${cambiosPorSubir} ${cambiosPorSubir === 1 ? "cambio por enviar" : "cambios por enviar"}`;
  } else {
    // HIG «Feedback», como Mail: el estado dice cuándo fue la última
    // actualización, en pasivo, sin pedir nada.
    titulo = "Al día";
    detalle = novedadVigente ?? (ultimaSync ? `Actualizado ${horaDe(ultimaSync)}` : "Actualizado");
  }

  const punto =
    error || estado === "sin-senal"
      ? "bg-ink-warn"
      : estado === "guardando" || cargando
        ? null
        : "bg-ink-ok";
  const otros = presentes.filter((p) => p.dispositivoId !== miDispositivoId);
  const yo = presentes.find((p) => p.dispositivoId === miDispositivoId);
  // Sin nada que decir (al día, nadie más, sin novedad) la barra es una LÍNEA
  // de estado en el teléfono, no una tarjeta (17-09): el estado no es
  // contenido. Tocarla abre la tarjeta con el detalle; en PC va siempre entera.
  const tranquila = titulo === "Al día" && !novedadVigente && otros.length === 0;
  const modoLinea = tranquila && !abierta;

  const lista = (
    <ul className="flex flex-col gap-1.5" aria-label="Conectados ahora">
      {presentes.map((p) => {
        const soyYo = p.dispositivoId === miDispositivoId;
        const escribiendo = Boolean(p.editandoEventoId && editandoPorEvento?.(p.editandoEventoId));
        return (
          <li key={p.dispositivoId} className="flex min-h-[28px] items-center gap-2 text-footnote">
            <Avatar p={p} tono={tonoDe(p.nombre)} chico />
            <span className="font-semibold">{p.nombre}</span>
            <span className="text-muted-foreground">
              · {NOMBRE_DISPOSITIVO[p.dispositivo]}
              {soyYo ? " · este equipo" : ""}
              {!soyYo && escribiendo ? " · escribiendo" : ""}
            </span>
          </li>
        );
      })}
      {otros.length === 0 && <li className="text-footnote italic text-muted-foreground">Nadie más tiene la bitácora abierta ahora.</li>}
    </ul>
  );

  return (
    <>
    {compacta && (
      <div ref={raiz} className="relative hidden md:block">
        <button
          type="button"
          onClick={() => setPanel((v) => !v)}
          aria-expanded={panel}
          aria-label={`${titulo}: ${detalle}. ${presentes.length} ${presentes.length === 1 ? "conectado" : "conectados"}`}
          className="flex h-11 items-center gap-2.5 rounded-full px-3 text-footnote text-muted-foreground transition-colors duration-150 hover:bg-muted-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          {punto ? (
            <span className={`size-2 shrink-0 rounded-full ${punto}`} aria-hidden />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          )}
          <span className={`min-w-0 truncate ${error || estado === "sin-senal" ? "font-semibold text-ink-warn" : ""}`} role="status" aria-live="polite">
            {titulo === "Al día" ? detalle : `${titulo} · ${detalle}`}
          </span>
          {presentes.length > 0 && (
            <span className="flex items-center pl-1">
              {presentes.slice(0, 4).map((p, i) => (
                <Avatar key={p.dispositivoId} p={p} tono={tonoDe(p.nombre)} chico className={i > 0 ? "-ml-1" : ""} />
              ))}
              <span className="pl-1.5 tabular-nums">{presentes.length}</span>
            </span>
          )}
          <ChevronDown className={`size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${panel ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {panel && (
          <div className="glass-nav absolute left-0 top-full z-40 mt-2 w-[340px] rounded-[26px] p-4">
            <p className="pb-2 text-footnote font-semibold">{titulo}</p>
            <p className="pb-3 text-footnote text-muted-foreground">{detalle}</p>
            {lista}
          </div>
        )}
      </div>
    )}
    {modoLinea && (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-expanded={false}
        aria-label="Estado de sincronización: ver detalle"
        className="flex min-h-[44px] w-full items-center gap-2 rounded-full px-4 text-footnote text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
      >
        <span className="size-2 shrink-0 rounded-full bg-ink-ok" aria-hidden />
        <span className="min-w-0 truncate">
          {detalle}
          {yo?.nombre.trim() ? ` · ${yo.nombre} en el ${NOMBRE_DISPOSITIVO[yo.dispositivo]}` : ""}
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0" aria-hidden />
      </button>
    )}
    <section
      aria-label="Sincronización"
      className={`${modoLinea ? "hidden" : "flex"} ${compacta ? "md:hidden" : modoLinea ? "md:flex" : ""} flex-col gap-2 rounded-card bg-card px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none`}
    >
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <div
          className="flex min-w-0 items-center gap-2.5"
          role="status"
          aria-live="polite"
        >
          {punto ? (
            <span
              className={`size-2.5 shrink-0 rounded-full ${punto}`}
              aria-hidden
            />
          ) : (
            <Loader2
              className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <p
              className={`text-subhead font-semibold ${error || estado === "sin-senal" ? "text-ink-warn" : ""}`}
            >
              {titulo}
            </p>
            <p className="text-footnote text-muted-foreground">{detalle}</p>
          </div>
        </div>

        {/* Quién está: toque para ver la lista (en PC va siempre abierta). */}
        {presentes.length > 0 && (
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            aria-label={`${presentes.length} ${presentes.length === 1 ? "conectado" : "conectados"}: ${presentes.map((p) => p.nombre).join(", ")}`}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:pointer-events-none"
          >
            <span className="flex items-center">
              {presentes.slice(0, 4).map((p, i) => (
                <Avatar
                  key={p.dispositivoId}
                  p={p}
                  tono={tonoDe(p.nombre)}
                  className={i > 0 ? "-ml-1" : ""}
                />
              ))}
            </span>
            <span className="text-footnote tabular-nums text-muted-foreground">
              {presentes.length}
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none md:hidden ${abierta ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        )}
      </div>

      {presentes.length > 0 && (
        <ul
          className={`${abierta ? "flex" : "hidden"} flex-wrap gap-x-4 gap-y-1.5 md:flex`}
          aria-label="Conectados ahora"
        >
          {presentes.map((p) => {
            const soyYo = p.dispositivoId === miDispositivoId;
            const escribiendo = Boolean(
              p.editandoEventoId && editandoPorEvento?.(p.editandoEventoId),
            );
            return (
              <li
                key={p.dispositivoId}
                className="flex min-h-[28px] items-center gap-2 text-footnote"
              >
                <Avatar p={p} tono={tonoDe(p.nombre)} chico />
                <span className="font-semibold">{p.nombre}</span>
                <span className="text-muted-foreground">
                  · {NOMBRE_DISPOSITIVO[p.dispositivo]}
                  {soyYo ? " · este equipo" : ""}
                  {!soyYo && escribiendo ? " · escribiendo" : ""}
                </span>
              </li>
            );
          })}
          {otros.length === 0 && (
            <li className="text-footnote text-muted-foreground">
              Nadie más tiene la bitácora abierta ahora.
            </li>
          )}
        </ul>
      )}
    </section>
    </>
  );
}

function Avatar({
  p,
  tono,
  chico,
  className = "",
}: {
  p: PresenciaBitacora;
  tono: TagTone;
  chico?: boolean;
  className?: string;
}) {
  const tamano = chico ? "size-6" : "size-[30px]";
  // El tinte del Tag es translúcido: sin un fondo sólido debajo, al
  // superponerse se veían las iniciales del de atrás a través del de adelante.
  return (
    <span
      className={`${className} shrink-0 rounded-full bg-card ring-2 ring-card`}
    >
      <Tag
        tone={p.dispositivo === "pc" && !p.nombre.trim() ? "neutral" : tono}
        className={`${tamano} justify-center rounded-full p-0`}
        title={`${p.nombre} · ${NOMBRE_DISPOSITIVO[p.dispositivo]}`}
      >
        {p.dispositivo === "pc" && /^pc\b/i.test(p.nombre) ? (
          <Monitor className="size-3.5" aria-hidden />
        ) : p.dispositivo === "celular" && !p.nombre.trim() ? (
          <Smartphone className="size-3.5" aria-hidden />
        ) : (
          <span className="text-caption font-semibold">
            {iniciales(p.nombre)}
          </span>
        )}
      </Tag>
    </span>
  );
}
