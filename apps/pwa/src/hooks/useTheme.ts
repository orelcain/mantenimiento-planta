/**
 * Hook useTheme - Gestión del tema (dark/light) con localStorage
 * 
 * Características:
 * - Persistencia en localStorage
 * - Actualización automática del DOM
 * - Modo oscuro por defecto
 */

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'app-theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
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

    // Guardar en localStorage
    localStorage.setItem(STORAGE_KEY, theme);

    // theme-color del chrome del navegador móvil acompaña el tema
    // (#0d1722 = --background oscuro, #d7e5f2 = --background claro)
    // Se lee del token real (`--background` de la piel activa), no de un hex fijo:
    // con `?skin=apple` el claro es #F2F2F7 y el oscuro #1C1C1E.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const raw = getComputedStyle(root).getPropertyValue('--background').trim();
      const m = raw.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
      meta.setAttribute('content', m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : theme === 'dark' ? '#0d1722' : '#d7e5f2');
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return {
    theme,
    toggleTheme,
    setTheme,
    isDark: theme === 'dark',
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
