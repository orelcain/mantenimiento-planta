export function tipoBadgeColor(tipo?: string): string {
  if (!tipo) return 'bg-muted text-muted-foreground'
  const t = tipo.toUpperCase()
  if (['RODAMIENTO', 'COJINETE'].includes(t)) return 'bg-cat-1-tint/[0.15] text-cat-1-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SELLO/JUNTA', 'ANILLO', 'SELLO'].includes(t)) return 'bg-cat-2-tint/[0.15] text-cat-2-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['MOTOR', 'BOMBA'].includes(t)) return 'bg-cat-5-tint/[0.15] text-cat-5-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SENSOR', 'INTERRUPTOR', 'MÓDULO ELÉCT.', 'RELÉ', 'CONTACTOR',
    'FUENTE ALIM.', 'TRANSFORMADOR', 'VARIADOR', 'HMI', 'PLC'].includes(t))
    return 'bg-cat-6-tint/[0.15] text-cat-6-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['TORNILLERÍA', 'PERNO', 'TUERCA', 'PASADOR', 'ARANDELA', 'ABRAZADERA'].includes(t))
    return 'bg-muted-foreground/[0.10] text-muted-foreground pizarra:bg-muted pizarra:text-muted-foreground'
  if (['CORREA', 'CADENA', 'CINTA/BANDA'].includes(t)) return 'bg-cat-4-tint/[0.15] text-cat-4-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['VÁLVULA', 'CILINDRO NEUM.', 'NEUMÁTICA GEN.'].includes(t))
    return 'bg-cat-7-tint/[0.15] text-cat-7-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['FILTRO', 'LUBRICACIÓN'].includes(t)) return 'bg-cat-8-tint/[0.15] text-cat-8-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['RESORTE'].includes(t)) return 'bg-cat-3-tint/[0.15] text-cat-3-ink pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SOPORTE', 'CARCASA/TAPA', 'ESTRUCTURA'].includes(t)) return 'bg-muted-foreground/[0.10] text-muted-foreground pizarra:bg-muted pizarra:text-muted-foreground'
  if (['AMORTIGUADOR'].includes(t)) return 'bg-cat-5-tint/[0.15] text-cat-5-ink pizarra:bg-muted pizarra:text-muted-foreground'
  return 'bg-muted text-muted-foreground'
}
