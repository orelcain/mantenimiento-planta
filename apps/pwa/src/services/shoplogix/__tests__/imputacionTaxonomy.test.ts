/**
 * Tests del árbol oficial de imputación.
 *
 * Los casos NO son inventados: son los reasons que llegan de verdad desde
 * Shoplogix (Firestore, Yal y Chonchi, 2026-02 a 2026-08) más las hojas del
 * curso que todavía no se han visto en el dato pero que los supervisores están
 * aprendiendo a usar y van a empezar a aparecer.
 */

import { describe, it, expect } from 'vitest'
import {
  IMPUTACION_LEAVES,
  TOTAL_HOJAS_CURSO,
  categoriaLabel,
  leavesByCategoria,
  matchImputacion,
  normalizeReason,
} from '../imputacionTaxonomy'

describe('normalizeReason', () => {
  it('deja mayúsculas, sin acentos y con separadores parejos', () => {
    expect(normalizeReason('Colación')).toBe('COLACION')
    expect(normalizeReason('CAMBIO LOTE/MMPP')).toBe('CAMBIO LOTE / MMPP')
    expect(normalizeReason('  Falla   Eléctrica > Lógica ')).toBe('FALLA ELECTRICA / LOGICA')
    expect(normalizeReason(undefined)).toBe('')
  })
})

describe('el árbol cubre el curso completo', () => {
  // Las hojas de extensión (Baader 200 de Filete) no son del curso: se filtran
  // acá para que estas cuentas sigan hablando SOLO de la V12.
  const DEL_CURSO = IMPUTACION_LEAVES.filter((l) => !l.extension)

  it('tiene las 46 hojas del curso en 40 causales distinguibles', () => {
    expect(TOTAL_HOJAS_CURSO).toBe(46)
    expect(DEL_CURSO).toHaveLength(40)
  })
  it('exactamente 6 causales son ambiguas entre eléctrica y mecánica', () => {
    const ambiguas = DEL_CURSO.filter((l) => l.categorias.length > 1).map((l) => l.label)
    expect(ambiguas.sort()).toEqual(
      ['Balanzas', 'Bombas', 'Cintas', 'Estación de Calidad', 'Grader', 'Motores'].sort(),
    )
  })
})

describe('reasons REALES observados en Firestore', () => {
  const casos: Array<[string, string, string]> = [
    // reason crudo            causal esperada          categoría mostrada
    ['FALTA MMPP',             'Falta MMPP',            'MMPP'],
    ['COLACION',               'Colación',              'Programado'],
    ['CUMPLIMIENTO CUOTA',     'Cumplimiento cuota',    'Programado'],
    ['AJUSTE MANTENIMIENTO',   'Ajuste mantenimiento',  'Operacional'],
    ['LOGICA',                 'Lógica',                'Eléctrica'],
    ['EJERCICIO COMPENSATORIO - Paro', 'Ejercicio compensatorio - Paro', 'Programado'],
    ['CAMBIO TURNO',           'Cambio turno',          'Programado'],
    ['RETRASO ASEO',           'Retraso aseo',          'Operacional'],
    ['CINTAS',                 'Cintas',                'Eléctrica o Mecánica'],
    ['ENERGIA',                'Energía',               'Abastecimiento'],
    ['CONTRASTACION',          'Contrastación',         'Operacional'],
    ['CAMBIO LOTE/MMPP',       'Cambio lote / MMPP',    'Operacional'],
    ['ATASCAMIENTO',           'Atascamiento',          'MMPP'],
    ['AJUSTE OPERADOR',        'Ajuste operador',       'Operacional'],
    ['AIRE',                   'Aire',                  'Abastecimiento'],
    ['BOMBAS',                 'Bombas',                'Eléctrica o Mecánica'],
    ['MOTORES',                'Motores',               'Eléctrica o Mecánica'],
    ['BALANZAS',               'Balanzas',              'Eléctrica o Mecánica'],
    ['REUNION INICIO TURNO',   'Reunión inicio turno',  'Programado'],
    ['DETENCION PROGRAMADA',   'Detención programada',  'Programado'],
  ]
  it.each(casos)('%s → %s (%s)', (reason, causal, categoria) => {
    const m = matchImputacion(reason)
    expect(m.leaf?.label).toBe(causal)
    expect(categoriaLabel(m.leaf)).toBe(categoria)
  })
})

describe('trampas de matching', () => {
  it('CAMBIO LOTE / MMPP no se come la regla de MMPP (bug del substring suelto)', () => {
    // Antes "CAMBIO LOTE/MMPP" calzaba con el substring 'mmpp' y se contaba
    // como falta de materia prima. Es un cambio de lote, no una falta.
    const m = matchImputacion('CAMBIO LOTE/MMPP')
    expect(m.leaf?.label).toBe('Cambio lote / MMPP')
    expect(m.leaf?.categorias).toEqual(['operacional'])
  })
  it('RETRASO ASEO es la hoja operacional, no la pausa de aseo', () => {
    expect(matchImputacion('RETRASO ASEO').leaf?.label).toBe('Retraso aseo')
  })
  it('Planned Downtime no es del árbol: es relleno post-turno', () => {
    const m = matchImputacion('Planned Downtime')
    expect(m.leaf).toBeNull()
    expect(m.bucket).toBe('fuera-turno')
  })
  it('DETENCION PROGRAMADA no es Planned Downtime — conviven en el mismo mes', () => {
    // Verificado en Firestore: feb-2026 Yal tuvo 1.902 min de DETENCION
    // PROGRAMADA (n=19) y 17.955 min de Planned Downtime (n=43) a la vez.
    expect(matchImputacion('DETENCION PROGRAMADA').bucket).toBe('planificado')
    expect(matchImputacion('Planned Downtime').bucket).toBe('fuera-turno')
  })
  it('causal nueva desconocida no se disfraza: queda sin match', () => {
    const m = matchImputacion('CAUSAL QUE NADIE VIO')
    expect(m.leaf).toBeNull()
    expect(m.bucket).toBeNull()
  })
})

/*
 * El curso se escribio para la Baader 142 de Yal. Filete tiene una 200, y sus
 * cuchillerias caian en "sin imputar": 140 min de fallas mecanicas que no se
 * podian mostrar como de Mantencion. Los nombres salieron de Firestore
 * (shoplogix/filete/shifts, 12 turnos al 14-08), no de la imaginacion.
 */
describe('extension Filete / Baader 200', () => {
  it('las tres cuchillerias son falla mecanica de Mantencion', () => {
    for (const r of ['Baader 200/CUCHILLERIA DORSAL', 'Baader 200/CUCHILLERIA RASCADOR',
                     'Baader 200/CUCHILLERIA PUNZON']) {
      const m = matchImputacion(r)
      expect(m.bucket).toBe('mantencion')
      expect(m.leaf?.categorias).toEqual(['mecanica'])
      expect(m.leaf?.equipo).toBe('baader200')
    }
  })

  it('una cuchilleria que no conocemos cae en la generica, no en sin imputar', () => {
    expect(matchImputacion('Baader 200/CUCHILLERIA LATERAL').leaf?.label).toBe('Cuchillería')
  })

  it('la especifica gana a la generica: el orden del array importa', () => {
    expect(matchImputacion('Baader 200/CUCHILLERIA DORSAL').leaf?.label).toBe('Cuchillería dorsal')
  })

  it('no se roba la hoja del curso: CUCHILLOS / GUILLOTINAS sigue siendo del 142', () => {
    const m = matchImputacion('CUCHILLOS / GUILLOTINAS')
    expect(m.leaf?.label).toBe('Cuchillos / Guillotinas')
    expect(m.leaf?.equipo).toBe('baader142')
    expect(m.leaf?.extension).toBeUndefined()
  })

  it('GEA es la auxiliar de Filete, ambigua como las demas auxiliares', () => {
    const m = matchImputacion('Equipo Auxiliar/GEA')
    expect(m.bucket).toBe('mantencion')
    expect(m.ambigua).toBe(true)
  })

  it('las hojas del curso siguen siendo 46: la extension NO cuenta', () => {
    expect(TOTAL_HOJAS_CURSO).toBe(46)
    expect(leavesByCategoria().flatMap((c) => c.hojas).some((h) => h.extension)).toBe(false)
  })
})
