/**
 * Diagnóstico · Tarjeta A3C — lógica pura (sin React ni DOM): del código del display a los pasos
 * en el orden del manual, el teclado numérico, los códigos de un módulo, el LED → elemento y lo
 * que se guarda en el teléfono. Los datos viven en `data/baader142Diagnostico.ts`; bornes, LED y
 * estado en la foto se leen del modelo de la tarjeta (`a3c-datos.json`) al mostrarlos.
 */
import {
  AJUSTE_TOPES,
  CODIGOS_SUELTOS,
  FAMILIAS_E8,
  MOTORES,
  NOTA_DIGITOS_COINCIDEN,
  avisoDigito,
  type Diagnostico,
  type ModuloDiag,
  type MotorSm,
  type NoIndica,
  type PasoDiag,
} from '@/data/baader142Diagnostico'

export const etiquetaCodigo = (n: number) => `E ${n}`

// ─── Teclado ──────────────────────────────────────────────────────────────

export type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'borrar'

/** Hasta 3 cifras; una cifra más con el número completo empieza uno nuevo (como el mockup). */
export function teclear(actual: string, tecla: Tecla): string {
  if (tecla === 'borrar') return actual.slice(0, -1)
  return actual.length < 3 ? actual + tecla : tecla
}

// ─── Del código a los pasos ───────────────────────────────────────────────

interface Candidato { m: MotorSm; nota: string; sufijo: string }

/** Motores posibles para el dígito X de E 8NX (1 y 2 se contradicen entre p. 41 y p. 45). */
export function candidatos(x: 1 | 2 | 3 | 4 | 5): Candidato[] {
  if (x >= 3) return [{ m: MOTORES[x], nota: NOTA_DIGITOS_COINCIDEN, sufijo: '' }]
  const otro = x === 1 ? 2 : 1
  return [
    { m: MOTORES[x], nota: 'Según el protocolo (Manual 2005, p. 45).', sufijo: ' · según p. 45' },
    { m: MOTORES[otro], nota: 'Según la tabla E 8NX (Manual 2005, p. 41).', sufijo: ' · según p. 41' },
  ]
}

const SIN_REVISION: NoIndica = {
  texto: 'El manual no indica qué revisar si la falla se repite.',
  pregunta: '¿Qué se revisó la última vez que apareció este código?',
}

function pasoSensor(c: Candidato, porque: string, verificar = false): PasoDiag {
  return {
    tipo: 'elemento',
    titulo: `${c.m.cero} · sensor de posición cero ${c.m.sm}${c.sufijo}`,
    porque,
    fuente: 'Manual 2005, p. 42',
    elemento: c.m.cero,
    ...(verificar ? { verificar: true } : {}),
  }
}

function pasoAjuste(c: Candidato, tipo: 'min' | 'max' | 'todo'): PasoDiag {
  return { tipo: 'ajuste', titulo: `Ajuste de topes de ${c.m.sm} (§12.8)${c.sufijo}`, porque: AJUSTE_TOPES[tipo], fuente: AJUSTE_TOPES.fuente }
}

function base(n: number, titulo: string, fuente: string, modulo: string): Diagnostico {
  return { codigo: n, etiqueta: etiquetaCodigo(n), titulo, fuente, modulo, aviso: null, accion: null, pasos: [], noIndica: [], motores: [] }
}

/** E 8NX (N = 0…6, X = 1…5), salvo E 826 y E 827. */
function diagnosticarE8(n: number): Diagnostico | null {
  const N = Math.floor((n - 800) / 10)
  const X = n % 10
  if (N < 0 || N > 6 || X < 1 || X > 5) return null
  const cs = candidatos(X as 1 | 2 | 3 | 4 | 5)
  const c0 = cs[0]!
  const d = base(n, FAMILIAS_E8[N as 0 | 1 | 2 | 3 | 4 | 5 | 6], 'Manual 2005, p. 42', cs.length === 1 ? `${c0.m.sm} · ${c0.m.herramienta}` : `${cs.map(c => c.m.sm).join(' o ')}`)
  if (cs.length > 1) d.aviso = avisoDigito(X as 1 | 2)
  for (const c of cs) {
    if (N === 0) {
      d.pasos.push(pasoSensor(c, '«Interruptor de aproximación en el accionamiento del motor paso a paso está defectuoso».'))
      d.pasos.push({
        tipo: 'ajuste',
        titulo: `Distancia del ${c.m.cero} a la polea (§12.8)${c.sufijo}`,
        porque: `«Distancia entre los interruptores de aproximación en el accionamiento del motor paso a paso es demasiado grande» (p. 42). ${AJUSTE_TOPES.cero}`,
        fuente: 'Manual 2005, p. 42 y p. 32',
      })
    } else if (N === 3) {
      d.pasos.push(pasoSensor(c, '«Iniciador de ranura (interruptor de aproximación) en el motor paso a paso está defectuoso».', true))
    } else if (N === 4) d.pasos.push(pasoAjuste(c, 'min'))
    else if (N === 5) d.pasos.push(pasoAjuste(c, 'max'))
    else if (N === 6) d.pasos.push(pasoAjuste(c, 'todo'))
  }
  if (N === 1) {
    d.pasos.push({
      tipo: 'info',
      titulo: 'Marcha de prueba 13 (solo herramientas)',
      porque: 'Desconectar siempre el interruptor principal después de la marcha de prueba 13: el ordenador no tiene informaciones sobre las posiciones de las abrazaderas de colas.',
      fuente: 'Manual 2005, p. 47',
    })
  }
  if (N === 2) d.accion = 'Pulsar el pulsador I: la máquina hace marcha de referencia. Pulsar el pulsador I otra vez: la máquina arranca.'
  if (N === 1 || N === 2) d.noIndica.push(SIN_REVISION)
  if (N === 3) {
    d.noIndica.push({
      texto: 'El manual no dice qué sensor es el «iniciador de ranura».',
      pregunta: `¿Es el mismo sensor que el plano rotula Nullposition (${cs.map(c => c.m.cero).join(' o ')})?`,
    })
  }
  d.motores = cs.map(c => c.m)
  return d
}

export function diagnosticar(n: number): Diagnostico | null {
  if (!Number.isInteger(n)) return null
  if (n === 826) {
    const d = base(n, CODIGOS_SUELTOS[826].titulo, CODIGOS_SUELTOS[826].fuente, CODIGOS_SUELTOS[826].modulo)
    d.pasos.push({
      tipo: 'elemento',
      titulo: 'B6 · sensor de posición cero SM6',
      porque: 'Elemento del accionamiento en la tarjeta. El manual no lo liga a E 826; se muestra para ubicarlo.',
      fuente: 'Manual 2005, p. 66',
      elemento: 'B6',
      verificar: true,
    })
    d.noIndica.push({ texto: 'El manual no indica la causa ni qué revisar.', pregunta: '¿Qué bloqueó el accionamiento las veces anteriores?' })
    return d
  }
  if (n === 827) {
    const d = base(n, CODIGOS_SUELTOS[827].titulo, CODIGOS_SUELTOS[827].fuente, CODIGOS_SUELTOS[827].modulo)
    d.aviso = 'El manual dice «el interruptor de aproximación» sin decir cuál · verificar en terreno. B15 es el control del extractor (p. 66); B14, el carro delante del extractor (p. 66).'
    d.pasos.push({
      tipo: 'elemento',
      titulo: 'B15 · control del extractor',
      porque: 'Interruptor de aproximación inductivo (control extractor), según la lista de elementos eléctricos del manual.',
      fuente: 'Manual 2005, p. 66 y p. 42',
      elemento: 'B15',
    })
    d.pasos.push({
      tipo: 'ajuste',
      titulo: 'Posición del extractor (Upgrade Kit, §22.4.3)',
      porque: 'Unos 2 mm entre la abrazadera de colas abierta y la chapaleta derecha, con ambas cabezas articuladas ajustadas de forma igual. La chapaleta izquierda, al cerrarse, no toca la chapaleta derecha. El manual no lo liga a E 827 por nombre.',
      fuente: 'Manual 2005, p. 86',
    })
    d.pasos.push({
      tipo: 'elemento',
      titulo: 'B14 · carro delante del extractor',
      porque: 'El manual no liga B14 a E 827; el runbook de planta lo revisa junto a B15.',
      fuente: 'Manual 2005, p. 66',
      elemento: 'B14',
      verificar: true,
    })
    d.noIndica.push({ texto: 'El manual dice «el interruptor de aproximación», sin decir cuál.', pregunta: '¿B15, B14 o los dos?' })
    return d
  }
  if (n >= 771 && n <= 775) {
    const s = MOTORES[(n - 770) as 1 | 2 | 3 | 4 | 5]
    const d = base(
      n,
      `El transmisor de valor de rotación ${s.encoder} para el motor paso a paso ${s.sm} está defectuoso (${s.herramienta.toLowerCase()})`,
      'Manual 2005, p. 41 · solo con Upgrade Kit',
      `${s.sm} · ${s.herramienta}`,
    )
    d.pasos.push({
      tipo: 'elemento',
      titulo: `${s.encoder} · encoder ${s.sm} (canales A y B)`,
      porque: 'Señales A y B del transmisor; en la hoja 13 llega a la A3C por X9.',
      fuente: 'Plano 888, hojas 23 y 13',
      elemento: s.encoder,
    })
    d.pasos.push({
      tipo: 'info',
      titulo: 'LED de la caja de conexión (§22.4.4)',
      porque: 'Bajo cada enchufe de la caja de conexión hay dos LED: según el sentido de giro del transmisor se enciende el respectivo LED. Otro LED de la caja indica el voltaje de 24 V.',
      fuente: 'Manual 2005, p. 87',
    })
    d.noIndica.push({ texto: 'El manual no indica cómo probar el transmisor.', pregunta: '¿Se ha cambiado alguno y cómo se confirmó?' })
    return d
  }
  if (n === 770) {
    const d = base(n, CODIGOS_SUELTOS[770].titulo, CODIGOS_SUELTOS[770].fuente, CODIGOS_SUELTOS[770].modulo)
    d.noIndica.push({ texto: 'El manual no indica ubicación ni prueba de la tarjeta.', pregunta: '¿Dónde está montada?' })
    return d
  }
  if (n === 777) {
    const d = base(n, CODIGOS_SUELTOS[777].titulo, CODIGOS_SUELTOS[777].fuente, CODIGOS_SUELTOS[777].modulo)
    d.pasos.push({ tipo: 'info', titulo: 'a) Fallo de introducción o de abrazadera', porque: 'Fallo de introducción causado por el operador, fallo de abrazadera.', fuente: 'Manual 2005, p. 41' })
    d.pasos.push({ tipo: 'info', titulo: 'b) Si se repite: muelle de tracción del carro', porque: 'Al producirse el fallo regularmente, se ha roto el muelle de tracción en el carro.', fuente: 'Manual 2005, p. 41' })
    return d
  }
  if (n >= 900 && n <= 999) {
    const d = base(n, CODIGOS_SUELTOS[900].titulo, CODIGOS_SUELTOS[900].fuente, CODIGOS_SUELTOS[900].modulo)
    d.accion = 'Se ve solamente en la indicación de la unidad de control. Desconectar el interruptor principal por 5 segundos, por lo menos.'
    return d
  }
  if (n >= 800 && n <= 869) return diagnosticarE8(n)
  return null
}

/** Pasos que se marcan (Descartado / Sospechoso): los que no son solo información. */
export const pasosMarcables = (d: Diagnostico) => d.pasos.map((p, i) => ({ p, i })).filter(x => x.p.tipo !== 'info')

/** Todos los códigos que el manual trae (para buscar qué códigos nombran un elemento). */
export const CODIGOS_MANUAL: number[] = (() => {
  const out: number[] = []
  for (let n = 770; n <= 899; n++) if (diagnosticar(n)) out.push(n)
  return out
})()

/** Códigos cuyos pasos nombran el elemento (para la pestaña LED y Módulo). */
export function codigosDeElemento(clave: string): number[] {
  return CODIGOS_MANUAL.filter(n => diagnosticar(n)!.pasos.some(p => p.elemento === clave))
}

export interface GrupoCodigos { titulo: string | null; codigos: number[] }

/** Códigos de un módulo; en SM1/SM2, dos grupos (según el protocolo y según la tabla). */
export function codigosDeModulo(mod: ModuloDiag): GrupoCodigos[] {
  if (mod.codigos) return [{ titulo: null, codigos: mod.codigos }]
  if (!mod.sm) return []
  const familia = (x: number) => [0, 1, 2, 3, 4, 5, 6].map(N => 800 + N * 10 + x)
  const encoder = 770 + mod.sm
  if (!mod.digitoEnDuda) return [{ titulo: null, codigos: [...familia(mod.sm), encoder] }]
  const otro = mod.digitoEnDuda === 1 ? 2 : 1
  return [
    { titulo: 'Según el protocolo (p. 45)', codigos: [...familia(mod.digitoEnDuda), encoder] },
    { titulo: 'Según la tabla E 8NX (p. 41)', codigos: familia(otro) },
  ]
}

// ─── Lo que se guarda en el teléfono (sin nube) ──────────────────────────

export type Marca = 'descartado' | 'sospechoso'
export interface EstadoLocal {
  /** `«E 803»#índice del paso` → marca. */
  marcas: Record<string, Marca>
  cerrados: number
}

export const CLAVE_LOCAL = 'a3c-diagnostico-v1'

export function leerLocal(): EstadoLocal {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? 'null') as Partial<EstadoLocal> | null
    return {
      marcas: v?.marcas && typeof v.marcas === 'object' ? v.marcas : {},
      cerrados: typeof v?.cerrados === 'number' && v.cerrados >= 0 ? Math.floor(v.cerrados) : 0,
    }
  } catch {
    return { marcas: {}, cerrados: 0 }
  }
}

export function guardarLocal(e: EstadoLocal): void {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(e))
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

export const claveMarca = (d: Diagnostico, i: number) => `${d.etiqueta}#${i}`

/** Marca o desmarca (tocar la misma marca la quita). */
export function marcar(e: EstadoLocal, clave: string, m: Marca): EstadoLocal {
  const marcas = { ...e.marcas }
  if (marcas[clave] === m) delete marcas[clave]
  else marcas[clave] = m
  return { ...e, marcas }
}

export function revisados(e: EstadoLocal, d: Diagnostico): number {
  return pasosMarcables(d).filter(({ i }) => e.marcas[claveMarca(d, i)]).length
}

/** Cierra el diagnóstico: suma uno al contador y limpia las marcas de ese código. */
export function cerrar(e: EstadoLocal, d: Diagnostico): EstadoLocal {
  const marcas = Object.fromEntries(Object.entries(e.marcas).filter(([k]) => !k.startsWith(`${d.etiqueta}#`)))
  return { marcas, cerrados: e.cerrados + 1 }
}
