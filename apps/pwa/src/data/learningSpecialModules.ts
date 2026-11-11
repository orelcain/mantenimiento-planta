/**
 * Simuladores y fichas especiales del Centro de Aprendizaje.
 * Viven aparte para que el hub y el buscador rápido (Ctrl+K) lean la misma lista.
 */
import type { ElementType } from 'react'
import { Cpu, Scale, Wind, Gauge, Activity, Waypoints, CircuitBoard } from 'lucide-react'

export interface SpecialModule {
  id: string; title: string; subtitle: string; description: string
  icon: ElementType; href: string; stats: string
  /** En desarrollo: oculto para usuarios normales; los admins lo ven con etiqueta. */
  inDevelopment?: boolean
}

export const SPECIAL_MODULES: SpecialModule[] = [
  {
    id: 'hmi-knuro', title: 'HMI Knuro', subtitle: 'Simulador de parámetros',
    description: 'Panel HMI Knuro de la Baader 142. Presets de planta y modo de práctica.',
    icon: Cpu, href: '/aprendizaje/hmi-knuro', stats: 'Presets de planta · práctica',
  },
  {
    id: 'hmi-grader', title: 'HMI Grader', subtitle: 'StaticGrader Marelec Z2',
    description: 'Clasificador automático por peso. Teclado F1-F4 y numpad con funcionalidad real.',
    icon: Scale, href: '/aprendizaje/hmi-grader', stats: '12 pockets · práctica',
  },
  {
    id: 'hmi-gea', title: 'HMI GEA PowerPak', subtitle: 'Termoformadora GEA V2',
    description: 'Simulador de la termoformadora GEA con valores en planta y ayuda de cada parámetro.',
    icon: Gauge, href: '/aprendizaje/hmi-gea', stats: 'Valores de planta · ayuda por parámetro',
  },
  {
    id: 'hmi-bombeo-s2', title: 'HMI Bombeo Acopio S2', subtitle: 'Ciclo PLC · planta Yal',
    description: 'Bombeo Sistema 2. Motor de ciclo Fase A ↔ Fase B con eventos PLC reales y sidebar interactivo.',
    icon: Wind, href: '/aprendizaje/hmi-bombeo-s2', stats: 'ciclo 90 s · 10 válvulas',
    inDevelopment: true,
  },
  {
    id: 'perilla-5', title: 'Perilla 5 · Baader 142', subtitle: 'Diagnóstico guiado',
    description: 'Las 10 posiciones del selector 5, el protocolo del Upgrade Kit y los 46 códigos E con solución paso a paso. Con registro de lecturas y tendencia por herramienta.',
    icon: Activity, href: '/aprendizaje/perilla-5',
    stats: '14 secciones · 46 códigos · 46 figuras anotables',
  },
  {
    id: 'tarjeta-a3c', title: 'Tarjeta A3C · Baader 142', subtitle: 'Qué LED prende y qué hace cada señal',
    description: 'El plano 888 de la tarjeta y la máquina, interactivo: toca un sensor, borne o LED y ve qué LED prende, dónde está y qué hace. En español o con los textos originales, con práctica.',
    icon: CircuitBoard, href: '/aprendizaje/baader-142/tarjeta-a3c',
    stats: '144 bornes · 111 LED · práctica',
  },
  {
    id: 'variadores', title: 'Variadores y partidores', subtitle: 'Catálogo de parámetros',
    description: 'Qué parámetros espera cada variador de planta y en qué menú están, para reemplazar uno sin buscar el manual.',
    icon: Gauge, href: '/aprendizaje/variadores',
    stats: '8 familias · 164 parámetros · 46 fallas',
  },
  {
    id: 'planos', title: 'Planos eléctricos', subtitle: 'El plano del fabricante, navegable',
    description: 'Los saltos entre hojas se siguen tocando, cada aparato dice dónde más aparece y los rótulos se leen en castellano.',
    icon: Waypoints, href: '/aprendizaje/planos',
    stats: '8 planos · ~300 hojas · eléctrico y neumático',
  },
]
