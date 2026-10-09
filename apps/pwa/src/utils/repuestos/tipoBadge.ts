export function tipoBadgeColor(tipo?: string): string {
  if (!tipo) return 'bg-muted text-muted-foreground'
  const t = tipo.toUpperCase()
  if (['RODAMIENTO', 'COJINETE'].includes(t)) return 'bg-blue-500/15 text-blue-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SELLO/JUNTA', 'ANILLO', 'SELLO'].includes(t)) return 'bg-green-500/15 text-green-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['MOTOR', 'BOMBA'].includes(t)) return 'bg-red-500/15 text-red-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SENSOR', 'INTERRUPTOR', 'MÓDULO ELÉCT.', 'RELÉ', 'CONTACTOR',
    'FUENTE ALIM.', 'TRANSFORMADOR', 'VARIADOR', 'HMI', 'PLC'].includes(t))
    return 'bg-purple-500/15 text-purple-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['TORNILLERÍA', 'PERNO', 'TUERCA', 'PASADOR', 'ARANDELA', 'ABRAZADERA'].includes(t))
    return 'bg-zinc-500/15 text-zinc-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['CORREA', 'CADENA', 'CINTA/BANDA'].includes(t)) return 'bg-orange-500/15 text-orange-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['VÁLVULA', 'CILINDRO NEUM.', 'NEUMÁTICA GEN.'].includes(t))
    return 'bg-cyan-500/15 text-cyan-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['FILTRO', 'LUBRICACIÓN'].includes(t)) return 'bg-yellow-500/15 text-yellow-500 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['RESORTE'].includes(t)) return 'bg-teal-500/15 text-teal-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['SOPORTE', 'CARCASA/TAPA', 'ESTRUCTURA'].includes(t)) return 'bg-slate-500/15 text-slate-400 pizarra:bg-muted pizarra:text-muted-foreground'
  if (['AMORTIGUADOR'].includes(t)) return 'bg-rose-500/15 text-rose-400 pizarra:bg-muted pizarra:text-muted-foreground'
  return 'bg-muted text-muted-foreground'
}
