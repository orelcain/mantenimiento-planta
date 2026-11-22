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

  it('con una hora sin leer avisa que el total puede estar incompleto y no dice «ninguna de este turno»', () => {
    render(<EspejoGraderCard estado={estado({ piezas: 9998, ultima: '2026-11-19 05:20:01' })} vivo minutos={0} resumen={VACIO} errorPiezas />)
    expect(screen.getByText(/el total puede estar incompleto/)).toBeTruthy()
    expect(screen.queryByText(/ninguna de este turno/)).toBeNull()
  })
})

describe('EspejoGraderCard: vista pública y turno del monitor (22-11)', () => {
  const T2 = { nombre: 'Turno 2', desde: '07:15', hasta: '14:50', piezas: 17836, g0: 412, baader: 16188 }
  const INTERNOS = /sesión bloqueada|Poniéndose al día|Puerta 0|Matrix|lector|CH-MANT|Pieza pieza|Respaldo|Turno B/i

  it.each(['otro-informe', 'sin-matrix', 'sin-tabla', 'licencia-en-pantalla', 'tope-10-min', 'sin-boton', 'invoke-fallo', 'tabla-inestable', 'tabla-cambio', 'excepcion', 'recarga-con-limite', 'pantalla-bloqueada', 'iniciando', 'codigo-nuevo'])('en público no muestra textos internos con el error «%s»', (codigo) => {
    const { container } = render(
      <EspejoGraderCard estado={estado({ error: codigo, parcial: true, pendientes: 300, limite: true })} vivo minutos={1} resumen={CON_PIEZAS} publico turnoMonitor={T2} />,
    )
    expect(container.textContent).not.toMatch(INTERNOS)
  })

  it('en público, sin lectura, tampoco nombra el equipo ni el respaldo', () => {
    const { container } = render(<EspejoGraderCard estado={estado({ error: 'pantalla-bloqueada' })} vivo={false} minutos={40} resumen={CON_PIEZAS} publico turnoMonitor={T2} />)
    expect(container.textContent).not.toMatch(/CH-MANT|Respaldo|sesión bloqueada/)
  })

  it('admin sigue viendo el aviso de sesión bloqueada y el avance', () => {
    render(<EspejoGraderCard estado={estado({ error: 'pantalla-bloqueada', parcial: true })} vivo minutos={1} resumen={CON_PIEZAS} turnoMonitor={T2} />)
    expect(screen.getByText(/sesión bloqueada/)).toBeTruthy()
    expect(screen.getByText(/Poniéndose al día/)).toBeTruthy()
  })

  it('con el turno cerrado dice «Turno cerrado», no «Vivo», y oculta la lectura en vivo', () => {
    render(<EspejoGraderCard estado={estado({})} vivo minutos={1} resumen={CON_PIEZAS} turnoEnCurso={false} turnoMonitor={T2} accion={<button>Leer en vivo</button>} />)
    expect(screen.getByText('Turno cerrado')).toBeTruthy()
    expect(screen.queryByText(/^Vivo/)).toBeNull()
    expect(screen.queryByText('Leer en vivo')).toBeNull()
  })

  it('con el turno cerrado y el lector caído muestra lo que trajo el espejo, no «dejó de enviar»', () => {
    render(<EspejoGraderCard estado={estado({})} vivo={false} minutos={300} resumen={CON_PIEZAS} turnoEnCurso={false} turnoMonitor={T2} publico />)
    expect(screen.getByText('17.836 piezas')).toBeTruthy()
    expect(screen.queryByText(/dejó de enviar/)).toBeNull()
  })

  it('usa el nombre, el horario y la cifra del encabezado (no la letra de Matrix ni la primera y última pieza)', () => {
    render(<EspejoGraderCard estado={estado({})} vivo minutos={1} resumen={{ ...CON_PIEZAS, total: 17876, coincidencia: { letra: 'B', pct: 99 } }} publico turnoMonitor={T2} />)
    expect(screen.getByText('17.836 piezas')).toBeTruthy()
    expect(screen.getByText(/^Turno 2 · 07:15 → 14:50 · P0 2,3 %$/)).toBeTruthy()
    expect(screen.getByText('16.188 piezas')).toBeTruthy()
    expect(screen.getByText('3 Baader (Shoplogix)')).toBeTruthy()
  })
})
