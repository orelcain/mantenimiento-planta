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
    // (#0d1722 = --background oscuro, #c5d9eb = --background claro)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1722' : '#c5d9eb');
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
