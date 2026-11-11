import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardarraíl del esquema v2 del ACR en `firestore.rules`. Lee el texto de las reglas (como
 * `reglasBitacora.test.ts`): si alguien vuelve al esquema viejo o afloja el permiso de escritura,
 * falla acá y no en planta.
 */
// CRLF → LF: el archivo se guarda con fin de línea de Windows y los textos de abajo usan `\n`.
const REGLAS = readFileSync(join(process.cwd(), '..', '..', 'firestore.rules'), 'utf8').replace(/\r\n/g, '\n')

function bloque(marca: string, fin: string): string {
  const i = REGLAS.indexOf(marca)
  if (i < 0) throw new Error(`No se encontró «${marca}» en firestore.rules`)
  return REGLAS.slice(i, REGLAS.indexOf(fin, i))
}

const VALIDADOR = bloque('function isValidRootCauseAnalysis()', '\n    }')
const PERMISOS = bloque('match /rootCauseAnalysis/', '\n    }\n')

describe('firestore.rules · rootCauseAnalysis (ACR v2)', () => {
  it('el validador exige el esquema v2 y no el viejo', () => {
    expect(VALIDADOR).toContain('d.version == 2')
    expect(VALIDADOR).toContain("d.estado in ['borrador', 'cerrado']")
    expect(VALIDADOR).toContain('d.piezaGuardada is bool')
    expect(VALIDADOR).not.toContain('metodo')
    expect(VALIDADOR).not.toContain('causaRaizIdentificada')
  })

  it('el validador acota los listados (≤30 causas, acciones y evidencias)', () => {
    expect(VALIDADOR).toContain('d.causas.size() <= 30')
    expect(VALIDADOR).toContain('d.acciones.size() <= 30')
    expect(VALIDADOR).toContain('d.evidencias.size() <= 30')
  })

  it('leer y escribir es para técnicos activos; borrar, solo admin', () => {
    expect(PERMISOS).toContain('allow read: if isActiveUser();')
    expect(PERMISOS).toContain('isActiveUser()\n        && isValidRootCauseAnalysis()')
    expect(PERMISOS).toContain('allow delete: if isAdmin();')
    expect(PERMISOS).not.toContain('isSupervisor()')
    expect(PERMISOS).not.toContain('isNotAnonymous()')
  })

  it('crear exige que el autor sea quien escribe; actualizar no cambia el autor', () => {
    expect(PERMISOS).toContain('request.resource.data.createdBy == request.auth.uid')
    expect(PERMISOS).toContain('request.resource.data.createdBy == resource.data.createdBy')
  })
})
