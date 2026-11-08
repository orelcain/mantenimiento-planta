import type { CuadranteJK } from '@/services/shoplogix/jackKnife'
export const Q: Record<CuadranteJK, { t: string; ink: string; dot: string; fill: string }> = {
  amb: { t: 'Agudas y crónicas', ink: 'rgb(var(--tw-red-600))', dot: 'rgb(var(--tw-red-500))', fill: 'rgb(var(--tw-red-500) / 0.08)' },
  agu: { t: 'Agudas', ink: 'rgb(var(--jk-agu))', dot: 'rgb(var(--jk-agu))', fill: 'rgb(var(--jk-agu) / 0.08)' },
  cro: { t: 'Crónicas', ink: 'rgb(var(--jk-cro))', dot: 'rgb(var(--jk-cro))', fill: 'rgb(var(--jk-cro) / 0.08)' },
  ok: { t: 'Bajo control', ink: 'rgb(var(--success))', dot: 'rgb(var(--success))', fill: 'rgb(var(--success) / 0.07)' },
}

/** Variación como «−43 %» / «+12 %» (signo menos tipográfico, sin decimales). */
export const pctCambio = (f: number): string => `${f < 0 ? "\u2212" : f > 0 ? "+" : ""}${Math.abs(Math.round(f * 100))} %`
