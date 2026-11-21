import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EspejoGraderCard } from '../EspejoGraderCard'
import type { EstadoLector } from '@/services/grader/espejo/espejoEstado'
import type { ResumenEspejo } from '@/services/grader/espejo/espejoFilas'

afterEach(cleanup)

const AHORA = Date.parse('2026-11-21T02:00:00.000Z')

function estado(e: EstadoLector['estado']): EstadoLector {
  return { equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: AHORA, leidoEn: '2026-11-20T23:00:00-03:00', informe: 'pieza', estado: e }
}

const VACIO: ResumenEspejo = { piezas: [], total: 0, gate0: 0, p0: null, primera: null, ultima: null, turno: null, coincidencia: null }
const CON_PIEZAS: ResumenEspejo = { ...VACIO, total: 4812, primera: '21:20:05', ultima: '22:59:00', turno: { sessionDate: '2026-11-20', shiftId: 'A' } }

describe('EspejoGraderCard: avisos también en «Vivo»', () => {
  it('avisa el corte de 10 000 registros con la tarjeta en «Vivo»', () => {
    render(<EspejoGraderCard estado={estado({ limite: true, filasTabla: 10000, piezas: 9998 })} vivo minutos={0} resumen={CON_PIEZAS} />)
    expect(screen.getByText(/Vivo/)).toBeTruthy()
    expect(screen.getByText(/Matrix está cortando en 10 000 registros/)).toBeTruthy()
  })

  it('avisa el error del lector con la tarjeta en «Vivo», aunque el código no tenga frase', () => {
    const { rerender } = render(<EspejoGraderCard estado={estado({ error: 'tope-10-min' })} vivo minutos={1} resumen={VACIO} />)
    expect(screen.getByText(/pasó los 10 minutos/)).toBeTruthy()
    rerender(<EspejoGraderCard estado={estado({ error: 'codigo-nuevo' })} vivo minutos={1} resumen={VACIO} />)
    expect(screen.getByText(/codigo-nuevo/)).toBeTruthy()
  })
})

describe('EspejoGraderCard: nunca «0 piezas» a secas', () => {
  it('con piezas leídas pero ninguna del turno, dice cuántas y de cuándo es la última', () => {
    render(<EspejoGraderCard estado={estado({ piezas: 9998, ultima: '2026-11-19 05:20:01' })} vivo minutos={0} resumen={VACIO} />)
    expect(screen.queryByText(/^0 piezas$/)).toBeNull()
    expect(screen.getByText('Hay 9.998 piezas leídas, ninguna de este turno (la última es del 19-11 05:20).')).toBeTruthy()
  })

  it('con el lector recién arrancado muestra «Iniciando» y no un 0', () => {
    render(<EspejoGraderCard estado={estado({ error: 'iniciando' })} vivo minutos={0} resumen={VACIO} />)
    expect(screen.getByText(/Iniciando/)).toBeTruthy()
    expect(screen.getByText('Primera lectura en curso')).toBeTruthy()
    expect(screen.queryByText(/^0 piezas$/)).toBeNull()
  })

  it('mientras se reparten las piezas muestra «Cargando piezas…»', () => {
    render(<EspejoGraderCard estado={estado({})} vivo minutos={0} resumen={null} />)
    expect(screen.getByText('Cargando piezas…')).toBeTruthy()
  })

  it('con piezas del turno muestra la cifra y la lectura a medias', () => {
    render(<EspejoGraderCard estado={estado({ parcial: true, pendientes: 6200 })} vivo minutos={0} resumen={CON_PIEZAS} />)
    expect(screen.getByText('4.812 piezas')).toBeTruthy()
    expect(screen.getByText(/faltan 6.200 filas/)).toBeTruthy()
  })
})
