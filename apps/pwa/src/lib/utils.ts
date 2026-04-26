import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { logger } from '@/lib/logger'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | number | undefined): string {
  if (!date) return 'Fecha no disponible'
  
  const dateObj = new Date(date)
  // Validar que la fecha sea válida
  if (isNaN(dateObj.getTime())) {
    logger.warn('formatDate: Fecha inválida recibida')
    return 'Fecha inválida'
  }
  
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj)
}

export function formatRelativeTime(date: Date | string | number | undefined): string {
  if (!date) return 'Fecha no disponible'
  
  const target = new Date(date)
  // Validar que la fecha sea válida
  if (isNaN(target.getTime())) {
    logger.warn('formatRelativeTime: Fecha inválida recibida')
    return 'Fecha inválida'
  }
  
  const now = new Date()
  const diffMs = now.getTime() - target.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Hace un momento'
  if (diffMins < 60) return `Hace ${diffMins} min`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays < 7) return `Hace ${diffDays} días`
  return formatDate(date)
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function generateId(): string {
  // crypto.randomUUID disponible en todos los navegadores modernos
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Debounce: usar import { debounce } from '@/lib/rate-limit'
