/**
 * Planta y área en la piel Apple: una línea-botón «Planta, Área» que abre una hoja
 * con las dos listas. La piel anterior sigue con sus dos filas de chips.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { PlantLineTabs } from '../PlantLineTabs'
import { PLANTS, getPlantOf, getAreasOfPlant, DEFAULT_PLANT_LINE_ID } from '@/config/plantLines'

const id = DEFAULT_PLANT_LINE_ID
const planta = PLANTS.find((p) => p.id === getPlantOf(id))!
const areas = getAreasOfPlant(getPlantOf(id))
const areaActiva = areas.find((a) => a.id === id)!
const otraArea = areas.find((a) => a.id !== id && !a.comingSoon)

describe('PlantLineTabs · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('muestra una sola línea-botón con «Planta, Área»', () => {
    render(<PlantLineTabs selected={id} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: `${planta.label}, ${areaActiva.areaLabel}` })).toBeTruthy()
  })

  it('al tocarla abre una hoja con la lista de plantas y la de áreas', () => {
    render(<PlantLineTabs selected={id} onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: `${planta.label}, ${areaActiva.areaLabel}` }))
    expect(screen.getByText('Planta y área')).toBeTruthy()
    expect(screen.getByRole('button', { name: planta.label })).toBeTruthy()
    expect(screen.getByRole('button', { name: areaActiva.areaLabel })).toBeTruthy()
  })

  it('elegir un área la emite y cierra la hoja', () => {
    const onSelect = vi.fn()
    render(<PlantLineTabs selected={id} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: `${planta.label}, ${areaActiva.areaLabel}` }))
    if (!otraArea) return // la planta por defecto tiene más de un área; si cambia, no hay nada que elegir
    fireEvent.click(screen.getByRole('button', { name: otraArea.areaLabel }))
    expect(onSelect).toHaveBeenCalledWith(otraArea.id)
    expect(screen.queryByText('Planta y área')).toBeNull()
  })

  it('el área activa va marcada con aria-current', () => {
    render(<PlantLineTabs selected={id} onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: `${planta.label}, ${areaActiva.areaLabel}` }))
    expect(screen.getByRole('button', { name: areaActiva.areaLabel }).getAttribute('aria-current')).toBe('true')
  })

  it('con la piel anterior siguen los chips de áreas a la vista', () => {
    document.documentElement.removeAttribute('data-skin')
    render(<PlantLineTabs selected={id} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: areaActiva.areaLabel })).toBeTruthy()
    expect(screen.queryByRole('button', { name: `${planta.label}, ${areaActiva.areaLabel}` })).toBeNull()
  })
})
