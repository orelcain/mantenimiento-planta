/**
 * Primitivos visuales del Centro de Aprendizaje ("Calma industrial").
 *
 * Objetivo: una sola implementación sobria de cada patrón, para reemplazar los
 * chips/labels/cajas redefinidos a mano en cada página. Reglas:
 *  - Etiquetas en sentence case, SIN uppercase+tracking.
 *  - Metadatos = texto quieto (sin caja ni borde). Chips SOLO para lo interactivo.
 *  - Máximo un nivel de caja bordeada; secciones internas con un divisor.
 */
import type { ReactNode } from 'react'
import { LC, tint } from '@/data/learningTheme'

/** Título de sección sobrio: sentence case, peso medio, tinta media. */
export function SectionTitle({ children, icon, className = '' }: {
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 text-footnote font-semibold ${className}`} style={{ color: LC.inkMid }}>
      {icon}
      {children}
    </div>
  )
}

/** Metadato quieto: texto pequeño en tinta baja, sin caja. Para info no interactiva
 *  (counts, rutas, códigos) que antes se "badgeaba" sin necesidad. */
export function MetaText({ children, className = '', mono = false }: {
  children: ReactNode
  className?: string
  mono?: boolean
}) {
  return (
    <span
      className={`text-xs ${mono ? 'font-mono' : ''} ${className}`}
      style={{ color: LC.inkLo }}
    >
      {children}
    </span>
  )
}

/** Chip interactivo (filtro/toggle). Único estilo de chip clicable del módulo. */
export function FilterChip({ active = false, onClick, children, accent = LC.aqua, title }: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  accent?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-ctl px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        color: active ? LC.ink : LC.inkMid,
        background: active ? tint(accent, 0.16) : 'transparent',
        border: `1px solid ${active ? tint(accent, 0.5) : LC.border}`,
      }}
    >
      {children}
    </button>
  )
}

/** Etiqueta de estado pequeña y quieta (Nuevo, En preparación, N/4). Sin uppercase.
 *  `tone` decide el color; `subtle` la deja como texto+punto en vez de pill teñida. */
export function StatusTag({ children, tone = LC.inkMid, subtle = false, icon }: {
  children: ReactNode
  tone?: string
  subtle?: boolean
  icon?: ReactNode
}) {
  if (subtle) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption" style={{ color: tone }}>
        {icon}
        {children}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-ctl px-1.5 py-0.5 text-caption font-medium"
      style={{ color: tone, background: tint(tone, 0.12) }}
    >
      {icon}
      {children}
    </span>
  )
}

/** Sección con un único divisor superior (sin caja bordeada completa).
 *  Reemplaza las cajas anidadas: el contenido interior respira con espaciado. */
export function PanelSection({ title, children, className = '', first = false }: {
  title?: ReactNode
  children: ReactNode
  className?: string
  first?: boolean
}) {
  return (
    <div
      className={`${first ? '' : 'pt-4 mt-4'} ${className}`}
      style={first ? undefined : { borderTop: `1px solid ${LC.border}` }}
    >
      {title && (
        <div className="mb-2 text-footnote font-semibold" style={{ color: LC.inkMid }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
