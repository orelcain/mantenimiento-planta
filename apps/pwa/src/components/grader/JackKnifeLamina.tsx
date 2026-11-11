import { forwardRef, type CSSProperties } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { dec1 } from '@/utils/formatoNumeros'
import type { CalculoJK, InformeJK, PuntoJK, TurnoJK } from '@/services/shoplogix/jackKnife'
import { JackKnifeGrafico } from './JackKnifeGrafico'
import { JackKnifeListas } from './JackKnifeListas'
import { pctCambio } from './jackKnifePresentacion'

interface Props {
  calc: CalculoJK; informe: InformeJK | null; turnos: TurnoJK[]; fantasmas: PuntoJK[]
  planta: string; ahoraTxt: string; antesTxt: string; minAntes?: number; minAhora: number
  vista: string; limitesBase: boolean; url: string
}
// Paleta literal aislada: el tema de la aplicación no cambia el documento exportado.
const claro = {
  width: 1600, height: 1131, padding: 48, background: '#FFFFFF', color: '#1C1C1E',
  display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'Arial, sans-serif', fontSize: 20, boxSizing: 'border-box',
  '--escala-texto': '1', '--foreground': '28 28 30', '--muted-foreground': '110 110 113', '--card': '255 255 255',
  '--tw-red-600': '215 0 21', '--tw-red-500': '255 59 48', '--jk-agu': '170 94 0',
  '--jk-cro': '46 117 182', '--success': '52 199 89', '--cat-6-ink': '110 110 113',
  '--jk-accent': '#2E75B6', '--jk-gray': '#8E8E93',
} as CSSProperties
export const JackKnifeLamina = forwardRef<HTMLDivElement, Props>(function JackKnifeLamina(p, ref) {
  const delta = p.minAntes ? (p.minAhora / p.minAntes - 1) * 100 : null
  return <div ref={ref} className="jk-lamina" style={claro}>
    <style>{`.jk-lamina .text-footnote { font-size: 20px; line-height: 1.4; } .jk-lamina .text-headline { font-size: 24px; } .jk-lamina .text-muted-foreground { color: #6E6E71; } .jk-lamina .fill-muted-foreground { fill: #6E6E71; } .jk-lamina .fill-foreground { fill: #1C1C1E; } .jk-lamina .stroke-muted-foreground { stroke: #8E8E93; } .jk-lamina .stroke-card { stroke: #FFFFFF; } .jk-lamina .border-warning { border-color: #FF9500; } .jk-lamina .border-success { border-color: #34C759; } .jk-lamina .border-destructive { border-color: #FF3B30; } .jk-lamina .text-footnote { font-size: 17px; line-height: 1.25; } .jk-lamina .text-caption { font-size: 17px; } .jk-lamina .text-headline { font-size: 24px; } .jk-lamina button { min-height: 32px; }`}</style>
    <header style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, gap: 24 }}>
      <b>Mantención · {p.planta} · {p.ahoraTxt}</b><span>{p.antesTxt ? 'vs ' + p.antesTxt : 'Sin comparar'}</span>
    </header>
    <div style={{ margin: '0' }}>
      <h1 style={{ fontSize: 56, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.minAntes !== undefined ? dec1(p.minAntes) + ' → ' : ''}{dec1(p.minAhora)} min por turno</h1>
      {delta !== null && <p style={{ color: delta < 0 ? '#217E38' : delta > 0 ? '#D70015' : '#6E6E71', fontSize: 28 }}>{pctCambio(delta / 100)}</p>}
      <p style={{ color: '#6E6E71' }}>Detención atribuida a Mantención</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32, flex: 1, minHeight: 0 }}>
      <JackKnifeGrafico calc={p.calc} ancho={900} fantasmas={p.fantasmas} />
      <JackKnifeListas calc={p.calc} informe={p.informe} turnos={p.turnos} lamina />
    </div>
    <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, fontSize: 18, color: '#6E6E71' }}>
      <p>Fuente: Shoplogix · {p.vista} · cobertura de causa {p.calc.cob === null ? 'sin datos' : Math.round(p.calc.cob * 100) + ' %'} · límites {p.limitesBase ? 'del período base' : 'recalculados'}</p>
      <QRCodeSVG value={p.url} size={104} marginSize={2} bgColor="#FFFFFF" fgColor="#1C1C1E" />
    </footer>
  </div>
})

