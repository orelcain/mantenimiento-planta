/**
 * SolicitudesPanel · altas de código (ficha A3C): chip, tarjeta, «Registrar SAP creado», «Rechazar», y que
 * una alta NUNCA pase por Aprobar/Entregar (no se descuenta stock).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), addDoc: vi.fn(), updateDoc: vi.fn(), onSnapshot: () => () => {},
  query: () => ({}), orderBy: () => ({}), serverTimestamp: () => 'TS', Timestamp: class {},
}))

import { SolicitudesPanel } from '../SolicitudesPanel'
import type { AltaCodigo, SolicitudItem, SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'

afterEach(cleanup)

const normal = (extra: Partial<SolicitudRepuesto> = {}): SolicitudRepuesto => ({
  id: 'n1', codigoSAP: '3300080929', textoBreve: 'MODULO RELE 42203310', cantidad: 2, estado: 'pendiente',
  solicitadoPor: 'u2', solicitadoPorNombre: 'Ana', createdAt: new Date(2026, 9, 8, 11, 2), ...extra,
})
const alta = (extra: Partial<AltaCodigo> = {}): AltaCodigo => ({
  id: 'alta_42203183', tipo: 'alta_codigo', codigoSAP: '', textoBreve: 'Relé en miniatura 24V DC', cantidad: 1, estado: 'pendiente',
  solicitadoPor: 'u3', solicitadoPorNombre: 'Danilo', createdAt: new Date(2026, 9, 8, 14, 20),
  codigoFabricante: '42203183', codigoNorm: '42203183', fig: '120 (2014)', pos: '321', fuentes: [], nivel: 'pieza', confianza: 'catalogo', planoSlug: 'baader-142-888',
  maquina: 'N2', elemento: 'K20', elementos: ['K20', 'K22'], observaciones: 'De respaldo', ...extra,
})

type Props = React.ComponentProps<typeof SolicitudesPanel>
interface Opciones {
  onAvanzar?: Props['onAvanzar']
  onRegistrarSap?: Props['onRegistrarSap']
  onRechazarAlta?: Props['onRechazarAlta']
  buscarSap?: Props['buscarSap']
  stockDe?: Props['stockDe']
}
const montar = (solicitudes: SolicitudItem[], o: Opciones = {}) =>
  render(
    <SolicitudesPanel
      open
      onOpenChange={() => {}}
      solicitudes={solicitudes}
      loading={false}
      onAvanzar={o.onAvanzar ?? (async () => {})}
      onRegistrarSap={o.onRegistrarSap ?? (async () => {})}
      onRechazarAlta={o.onRechazarAlta ?? (async () => {})}
      buscarSap={o.buscarSap}
      stockDe={o.stockDe ?? (() => ({ configurado: true, stockActual: 5, unidad: 'pzas', ubicacionBodega: 'C-7' }))}
    />,
  )
const tarjeta = (id: string) => screen.getByTestId(`alta-${id}`)

describe('chips y filtro', () => {
  it('«Altas de código» aparece solo si hay altas; Todas y Pendientes las incluyen, Aprobadas y Entregadas no', () => {
    montar([normal(), normal({ id: 'n2', estado: 'aprobada' }), alta(), alta({ id: 'alta_2', codigoFabricante: '2', estado: 'creada', sapCreado: '3300112345' })])
    const chip = (t: RegExp) => screen.getByRole('button', { name: t }).textContent
    expect(chip(/^Todas/)).toContain('(4)')
    expect(chip(/^Pendientes/)).toContain('(2)')
    expect(chip(/^Aprobadas/)).toContain('(1)')
    expect(chip(/^Entregadas/)).toContain('(0)')
    expect(chip(/^Altas de código/)).toContain('(2)')
    cleanup()
    montar([normal()])
    expect(screen.queryByRole('button', { name: /Altas de código/ })).toBeNull()
  })

  it('filtrar por «Altas de código» deja solo las altas', () => {
    montar([normal(), alta()])
    fireEvent.click(screen.getByRole('button', { name: /^Altas de código/ }))
    expect(screen.queryByText('MODULO RELE 42203310')).toBeNull()
    expect(screen.getAllByText('Relé en miniatura 24V DC').length).toBeGreaterThan(0)
  })
})

describe('tarjeta de alta', () => {
  it('etiqueta, fabricante, contexto del plano y aviso; sin línea de stock', () => {
    const stockDe = vi.fn(() => ({ configurado: true as const, stockActual: 5, unidad: 'pzas', ubicacionBodega: 'C-7' }))
    montar([alta({ nivel: 'conjunto', confianza: 'propuesto' })], { stockDe })
    const t = tarjeta('alta_42203183').textContent ?? ''
    expect(t).toContain('Alta de código')
    expect(t).toContain('Relé en miniatura 24V DC')
    expect(t).toContain('Fabricante 42203183')
    expect(t).toContain('K20 en N2 · catálogo 2014 fig. 120 pos. 321 · también K22')
    expect(t).toContain('Conjunto completo · código propuesto, sin confirmar en terreno')
    expect(t).toContain('De respaldo')
    expect(t).toContain('Alta pendiente')
    expect(t).toContain('×1')
    expect(t).not.toMatch(/en bodega|Sin stock|stock/i)
    expect(stockDe).not.toHaveBeenCalled()
  })

  it('no lleva Aprobar ni Entregar: lleva «Registrar SAP creado» y «Rechazar»', () => {
    montar([alta()])
    const t = within(tarjeta('alta_42203183'))
    expect(t.queryByRole('button', { name: /Aprobar|Entregar/ })).toBeNull()
    expect(t.getByRole('button', { name: /Registrar SAP creado/ })).toBeTruthy()
    expect(t.getByRole('button', { name: /Rechazar/ })).toBeTruthy()
  })

  it('el pedido normal sigue con su Aprobar y llama a onAvanzar; el alta nunca lo llama', async () => {
    const onAvanzar = vi.fn(async () => {})
    montar([normal(), alta()], { onAvanzar })
    fireEvent.click(screen.getAllByRole('button', { name: /Aprobar/ })[0]!)
    await waitFor(() => expect(onAvanzar).toHaveBeenCalledWith('n1', 'aprobada'))
    fireEvent.click(within(tarjeta('alta_42203183')).getByRole('button', { name: /Rechazar/ }))
    fireEvent.click(within(tarjeta('alta_42203183')).getByRole('button', { name: 'Cancelar' }))
    expect(onAvanzar).toHaveBeenCalledTimes(1)
  })

  it('creada: SAP, quién, «Código nuevo» o «Ya existía», y sin acciones', () => {
    montar([
      alta({ estado: 'creada', sapCreado: '3300112290', origenSap: 'nuevo', creadaPorNombre: 'Pedro', creadaAt: new Date(2026, 9, 9, 14, 20) }),
      alta({ id: 'alta_2', codigoFabricante: '2', estado: 'creada', sapCreado: '3300000001', origenSap: 'ya_existia', creadaPorNombre: 'Pedro', creadaAt: new Date(2026, 9, 9, 15, 0) }),
    ])
    const t = tarjeta('alta_42203183').textContent ?? ''
    expect(t).toContain('Creada')
    expect(t).toContain('SAP 3300112290')
    expect(t).toContain('por Pedro · en 1 d')
    expect(t).toContain('Código nuevo')
    expect(tarjeta('alta_2').textContent).toContain('Ya existía')
    expect(within(tarjeta('alta_42203183')).queryByRole('button', { name: /Registrar|Rechazar/ })).toBeNull()
  })

  it('rechazada: motivo y quién; sin acciones', () => {
    montar([alta({ estado: 'rechazada', motivoRechazo: 'Falta foto de la etiqueta', rechazadaPorNombre: 'Pedro', rechazadaAt: new Date(2026, 9, 8, 16, 0) })])
    const t = tarjeta('alta_42203183').textContent ?? ''
    expect(t).toContain('Rechazada')
    expect(t).toContain('Motivo: «Falta foto de la etiqueta»')
    expect(t).toContain('por Pedro')
    expect(within(tarjeta('alta_42203183')).queryByRole('button', { name: /Registrar|Rechazar/ })).toBeNull()
  })

  it('con foto, enlaza a ella', () => {
    montar([alta({ fotoUrl: 'https://foto/etiqueta.jpg' })])
    expect((within(tarjeta('alta_42203183')).getByText('1 foto').closest('a') as HTMLAnchorElement).href).toBe('https://foto/etiqueta.jpg')
  })
})

describe('Registrar SAP creado', () => {
  const abrir = () => {
    fireEvent.click(within(tarjeta('alta_42203183')).getByRole('button', { name: /Registrar SAP creado/ }))
    return within(screen.getAllByTestId('alta-form-sap-alta_42203183')[0]!)
  }

  it('pide 10 dígitos: cuenta cuántos lleva y deja «Guardar SAP» apagado hasta completarlos', () => {
    montar([alta()])
    const f = abrir()
    const campo = f.getByLabelText('SAP creado') as HTMLInputElement
    expect(campo.maxLength).toBe(10)
    fireEvent.change(campo, { target: { value: '3300112' } })
    expect(f.getByText('7 de 10 dígitos')).toBeTruthy()
    expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(campo, { target: { value: '33001123AB4' } })
    expect(campo.value).toBe('330011234')
    fireEvent.change(campo, { target: { value: '3300112345' } })
    expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('guarda el SAP como «Código nuevo» por defecto y cierra el bloque', async () => {
    const onRegistrarSap = vi.fn(async () => {})
    const a = alta()
    montar([a], { onRegistrarSap })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    fireEvent.click(f.getByRole('button', { name: /Guardar SAP/ }))
    await waitFor(() => expect(onRegistrarSap).toHaveBeenCalledWith(a, '3300112345', 'nuevo'))
    await waitFor(() => expect(screen.queryAllByTestId('alta-form-sap-alta_42203183')).toHaveLength(0))
  })

  it('«Ya existía» manda origen ya_existia', async () => {
    const onRegistrarSap = vi.fn(async () => {})
    const a = alta()
    montar([a], { onRegistrarSap })
    const f = abrir()
    fireEvent.click(f.getByRole('button', { name: 'Ya existía' }))
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    fireEvent.click(f.getByRole('button', { name: /Guardar SAP/ }))
    await waitFor(() => expect(onRegistrarSap).toHaveBeenCalledWith(a, '3300112345', 'ya_existia'))
  })

  it('si ese SAP ya es OTRO repuesto del maestro, lo dice con su nombre y no deja guardar', async () => {
    const buscarSap = vi.fn(async () => ({ nombre: 'MODULO RELE 42203310', codigoFabricante: '42203310' }))
    montar([alta()], { buscarSap })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300080929' } })
    expect(await f.findByText(/3300080929 ya es «MODULO RELE 42203310» en el maestro: revisa el número/)).toBeTruthy()
    expect(buscarSap).toHaveBeenCalledWith('3300080929')
    expect((f.getByLabelText('SAP creado') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true')
    expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('si el SAP ya es el MISMO repuesto (mismo código de fabricante), avisa pero deja guardar', async () => {
    montar([alta()], { buscarSap: vi.fn(async () => ({ nombre: 'RELE MINIATURA 24VDC', codigoFabricante: '4220 3183' })) })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    expect(await f.findByText(/Ya está en el maestro como «RELE MINIATURA 24VDC»/)).toBeTruthy()
    expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('si NO se pudo comprobar el SAP en el maestro, no se guarda a ciegas: pide reintentar', async () => {
    const buscarSap = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
    montar([alta()], { buscarSap })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    expect(await f.findByText(/No se pudo comprobar el SAP en el maestro/)).toBeTruthy()
    expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(f.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect((f.getByRole('button', { name: /Guardar SAP/ }) as HTMLButtonElement).disabled).toBe(false))
    expect(buscarSap).toHaveBeenCalledTimes(2)
  })

  it('un error de negocio del servicio (otro operador ya la cerró, SAP de otro repuesto) se muestra con su texto', async () => {
    const e = Object.assign(new Error('Otra persona ya resolvió esta alta. Recarga la lista.'), { name: 'ErrorAltaSap' })
    montar([alta()], { onRegistrarSap: vi.fn(async () => { throw e }) })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    fireEvent.click(f.getByRole('button', { name: /Guardar SAP/ }))
    expect((await f.findByRole('alert')).textContent).toBe('Otra persona ya resolvió esta alta. Recarga la lista.')
  })

  it('si guardar falla, lo dice y no cierra', async () => {
    montar([alta()], { onRegistrarSap: vi.fn(async () => { throw new Error('x') }) })
    const f = abrir()
    fireEvent.change(f.getByLabelText('SAP creado'), { target: { value: '3300112345' } })
    fireEvent.click(f.getByRole('button', { name: /Guardar SAP/ }))
    expect((await f.findByRole('alert')).textContent).toContain('No se pudo guardar')
    expect(screen.getAllByTestId('alta-form-sap-alta_42203183').length).toBeGreaterThan(0)
  })
})

describe('Rechazar', () => {
  const abrir = () => {
    fireEvent.click(within(tarjeta('alta_42203183')).getByRole('button', { name: /^Rechazar$/ }))
    return within(screen.getAllByTestId('alta-form-rechazo-alta_42203183')[0]!)
  }

  it('el motivo es obligatorio', () => {
    montar([alta()])
    const f = abrir()
    expect((f.getByRole('button', { name: /^Rechazar$/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(f.getByLabelText('Motivo del rechazo'), { target: { value: '   ' } })
    expect((f.getByRole('button', { name: /^Rechazar$/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(f.getByLabelText('Motivo del rechazo'), { target: { value: 'No es ese código' } })
    expect((f.getByRole('button', { name: /^Rechazar$/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('un motivo sugerido rellena el campo (máx. 300) y rechaza con él', async () => {
    const onRechazarAlta = vi.fn(async () => {})
    const a = alta()
    montar([a], { onRechazarAlta })
    const f = abrir()
    expect((f.getByLabelText('Motivo del rechazo') as HTMLTextAreaElement).maxLength).toBe(300)
    fireEvent.click(f.getByRole('button', { name: 'Confirmar en terreno primero' }))
    expect((f.getByLabelText('Motivo del rechazo') as HTMLTextAreaElement).value).toBe('Confirmar en terreno primero')
    fireEvent.click(f.getByRole('button', { name: /^Rechazar$/ }))
    await waitFor(() => expect(onRechazarAlta).toHaveBeenCalledWith(a, 'Confirmar en terreno primero'))
  })

  it('ofrece los tres motivos sugeridos', () => {
    montar([alta()])
    const f = abrir()
    for (const m of ['Falta foto de la etiqueta', 'Confirmar en terreno primero', 'Pedir el conjunto completo']) {
      expect(f.getByRole('button', { name: m })).toBeTruthy()
    }
  })

  it('solo hay un bloque abierto a la vez', () => {
    montar([alta()])
    abrir()
    fireEvent.click(within(tarjeta('alta_42203183')).getByRole('button', { name: /Registrar SAP creado/ }))
    expect(screen.queryByTestId('alta-form-rechazo-alta_42203183')).toBeNull()
    expect(screen.getAllByTestId('alta-form-sap-alta_42203183').length).toBeGreaterThan(0)
  })
})

describe('quien no es de bodega', () => {
  it('sin onRegistrarSap/onRechazarAlta las altas se ven pero sin acciones (evita un permission-denied)', () => {
    render(<SolicitudesPanel open onOpenChange={() => {}} solicitudes={[alta()]} loading={false} onAvanzar={async () => {}} />)
    expect(tarjeta('alta_42203183').textContent).toContain('Alta pendiente')
    expect(screen.queryByRole('button', { name: /Registrar SAP/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Rechazar/ })).toBeNull()
  })
})
