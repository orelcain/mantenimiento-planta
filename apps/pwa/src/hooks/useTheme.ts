/**
 * Hook useTheme - Gestión del tema (dark/light) con localStorage
 *
 * Características:
 * - Persistencia en localStorage
 * - Actualización automática del DOM
 * - Modo oscuro por defecto
 * - Con la paleta Pizarra activa (`data-paleta="pizarra"`, `?skin=pizarra`) el tema
 *   sale de la INTENSIDAD (Día · Penumbra · Automático, `app-intensidad`); sin
 *   Pizarra todo este archivo se comporta exactamente como antes.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CLAVE_INTENSIDAD,
  EVENTO_INTENSIDAD,
  THEME_COLOR_PIZARRA,
  borrarAlmacen,
  escribirAlmacen,
  esIntensidad,
  oscuroDe,
  paletaPizarraActiva,
  resolverIntensidadActual,
  type Intensidad,
} from '@/lib/intensidad';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'app-theme';
const MQ_OSCURO = '(prefers-color-scheme: dark)';

const sistemaOscuroAhora = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(MQ_OSCURO).matches;

export function useTheme() {
  // Se lee una vez: lo fija el script de index.html antes del primer pintado.
  const [pizarra] = useState(paletaPizarraActiva);
  const [intensidad, setIntensidadState] = useState<Intensidad>(() =>
    pizarra ? resolverIntensidadActual().intensidad : 'auto',
  );
  const [theme, setThemeState] = useState<Theme>(() => {
    if (pizarra) return resolverIntensidadActual().oscuro ? 'dark' : 'light';
    // Leer del localStorage o usar 'dark' por defecto
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'dark' || stored === 'light') ? stored : 'dark';
  });

  useEffect(() => {
    // Aplicar el tema al <html>
    const root = window.document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Guardar en localStorage. Con Pizarra NO: `app-theme` solo se escribe al
    // elegir Día/Penumbra a propósito (ver `setIntensidad`); si no, un arranque
    // en Automático lo fijaría y taparía la elección del dispositivo.
    if (!pizarra) localStorage.setItem(STORAGE_KEY, theme);

    // theme-color del chrome del navegador móvil acompaña el tema
    // (#0d1722 = --background oscuro, #d7e5f2 = --background claro)
    // Se lee del token real (`--background` de la piel activa), no de un hex fijo:
    // con `?skin=apple` el claro es #F2F2F7 y el oscuro #1C1C1E.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const raw = getComputedStyle(root).getPropertyValue('--background').trim();
      const m = raw.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
      const respaldo = pizarra
        ? (theme === 'dark' ? THEME_COLOR_PIZARRA.penumbra : THEME_COLOR_PIZARRA.dia)
        : (theme === 'dark' ? '#0d1722' : '#d7e5f2');
      meta.setAttribute('content', m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : respaldo);
    }
  }, [theme, pizarra]);

  // Pizarra + Automático: seguir al sistema EN VIVO (p. ej. atardece en el PC).
  useEffect(() => {
    if (!pizarra || intensidad !== 'auto' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(MQ_OSCURO);
    const alCambiar = () => setThemeState(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [pizarra, intensidad]);

  // Pizarra: otra instancia del hook (p. ej. Configuración) cambió la intensidad.
  // El evento trae la intensidad en `detail`: se emite ANTES de persistir, así que
  // leer el almacenamiento acá daría el valor viejo.
  useEffect(() => {
    if (!pizarra) return;
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<unknown>).detail;
      if (esIntensidad(d)) {
        setIntensidadState(d);
        setThemeState(oscuroDe(d, sistemaOscuroAhora()) ? 'dark' : 'light');
        return;
      }
      const r = resolverIntensidadActual();
      setIntensidadState(r.intensidad);
      setThemeState(r.oscuro ? 'dark' : 'light');
    };
    window.addEventListener(EVENTO_INTENSIDAD, alCambiar);
    return () => window.removeEventListener(EVENTO_INTENSIDAD, alCambiar);
  }, [pizarra]);

  /**
   * Solo con Pizarra. Primero aplica el estado y avisa a las demás instancias;
   * recién después persiste (por dispositivo), sin lanzar si el almacenamiento
   * falla. Día/Penumbra también fijan `app-theme`. Si `app-intensidad` no se pudo
   * guardar se borra (mejor esfuerzo): un valor viejo ahí contradiría al tema visible.
   */
  const setIntensidad = useCallback((nueva: Intensidad) => {
    if (!pizarra) return;
    setIntensidadState(nueva);
    setThemeState(oscuroDe(nueva, sistemaOscuroAhora()) ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent(EVENTO_INTENSIDAD, { detail: nueva }));
    if (nueva === 'dia') escribirAlmacen(STORAGE_KEY, 'light');
    else if (nueva === 'penumbra') escribirAlmacen(STORAGE_KEY, 'dark');
    if (!escribirAlmacen(CLAVE_INTENSIDAD, nueva)) borrarAlmacen(CLAVE_INTENSIDAD);
  }, [pizarra]);

  const toggleTheme = () => {
    if (pizarra) {
      setIntensidad(theme === 'dark' ? 'dia' : 'penumbra');
      return;
    }
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: Theme) => {
    if (pizarra) {
      setIntensidad(newTheme === 'dark' ? 'penumbra' : 'dia');
      return;
    }
    setThemeState(newTheme);
  };

  return {
    theme,
    toggleTheme,
    setTheme,
    isDark: theme === 'dark',
    /** `true` si la paleta Pizarra está activa. */
    pizarra,
    /** Día · Penumbra · Automático (solo significativo con `pizarra`). */
    intensidad,
    setIntensidad,
  };
}

/**
 * ¿El documento está en oscuro AHORA? Observa la clase `dark` del <html>, así que
 * sigue al toggle de Configuración en vivo aunque este componente no lo haya montado
 * (cada `useTheme()` tiene su propio estado y no se entera de los demás).
 * DESIGN.md §6b: ningún módulo tiene tema propio; el que necesite saberlo, usa esto.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => obs.disconnect();
  }, []);
  return isDark;
}
