import {
  MINUTOS_POR_SLOT,
  SLOTS_POR_DIA,
  condicionDe,
  type Condicion,
  type MaquinaRueda,
} from './ruedaVentanas'

/**
 * «Tengo que hacer este trabajo, dura tanto: ¿cuándo lo meto?»
 *
 * Es la pregunta que se hace al llegar un correctivo o una preventiva suelta, y
 * hasta ahora había que buscar el hueco a ojo en la rueda. Esto lo busca contra
 * el horario real de la máquina Y contra lo que ya está puesto en ella, que es
 * la mitad que se olvida: un hueco libre en el horario puede estar tomado por
 * otra intervención ya planificada.
 *
 * No decide: propone tres opciones ordenadas y la persona elige. Un sugeridor
 * que aplica solo su propia respuesta obliga a deshacerla cuando se equivoca,
 * y aquí se equivoca seguro — no sabe que el eléctrico solo viene los martes.
 */

export interface Trabajo {
  minutos: number
  /** Si necesita la máquina detenida. Si no, también sirve con la línea corriendo. */
  requiereDetencion: boolean
}

export interface Sugerencia {
  dia: number
  inicio: number
  largo: number
  condicion: Condicion
  /**
   * Minutos libres que quedan alrededor del hueco elegido. Sirve para preferir
   * los que dejan aire: meter una tarea de 45 min en un hueco de 50 la deja sin
   * margen para el primer imprevisto.
   */
  holguraMin: number
  /** Técnicos de turno durante el hueco (el mínimo del tramo), si se conoce la dotación. */
  tecnicos?: number
}

const CONDICIONES_ORDEN: Record<Condicion, number> = {
  limpia: 0,
  colacion: 1,
  marcha: 2,
  agua: 99, // nunca se sugiere: proponerlo sería planificar un conflicto
}

function condicionesValidas(requiereDetencion: boolean): Condicion[] {
  return requiereDetencion ? ['limpia', 'colacion'] : ['limpia', 'colacion', 'marcha']
}

/**
 * Busca huecos en la semana de UNA máquina. Devuelve hasta `maximo`, ordenados
 * por: mejor condición, más holgura y antes en la semana.
 */
export function sugerirHuecos(
  maquina: MaquinaRueda,
  trabajo: Trabajo,
  maximo = 3,
  /**
   * Cuántos técnicos de Mantención están de turno en cada tramo. Sin esto, el
   * sugeridor proponía la madrugada del domingo: la máquina está libre, sí —
   * pero no hay NADIE en la planta para intervenirla.
   */
  disponibles?: (dia: number, slot: number) => number,
): Sugerencia[] {
  const largo = Math.max(1, Math.ceil(trabajo.minutos / MINUTOS_POR_SLOT))
  if (largo > SLOTS_POR_DIA) return []
  const validas = condicionesValidas(trabajo.requiereDetencion)

  const candidatas: Sugerencia[] = []

  for (let dia = 0; dia < 7; dia++) {
    const d = maquina.semana[dia]
    if (!d) continue

    /** Un tramo sirve si la condición vale y no hay otra intervención ya puesta. */
    const sirve = (i: number): Condicion | null => {
      if (d.mant[i] === '1') return null
      if (disponibles && disponibles(dia, i) <= 0) return null
      const c = condicionDe(d.areas[i] ?? '0')
      return validas.includes(c) ? c : null
    }

    // Se recorren los bloques contiguos utilizables y se propone UNA posición por
    // bloque —la del principio—: ofrecer todos los desplazamientos dentro del
    // mismo hueco llenaría la lista de opciones que son la misma.
    let inicioBloque: number | null = null
    let peor: Condicion = 'limpia'

    const cerrar = (fin: number) => {
      if (inicioBloque === null) return
      const largoBloque = fin - inicioBloque
      if (largoBloque >= largo) {
        let tecnicos: number | undefined
        if (disponibles) {
          tecnicos = Infinity
          for (let i = inicioBloque; i < inicioBloque + largo; i++) tecnicos = Math.min(tecnicos, disponibles(dia, i))
        }
        candidatas.push({
          dia,
          inicio: inicioBloque,
          largo,
          condicion: peor,
          holguraMin: (largoBloque - largo) * MINUTOS_POR_SLOT,
          ...(tecnicos !== undefined && Number.isFinite(tecnicos) ? { tecnicos } : {}),
        })
      }
      inicioBloque = null
      peor = 'limpia'
    }

    for (let i = 0; i < SLOTS_POR_DIA; i++) {
      const c = sirve(i)
      if (c === null) {
        cerrar(i)
        continue
      }
      if (inicioBloque === null) inicioBloque = i
      // La condición del bloque es la peor de sus tramos: si en medio arranca la
      // línea, la tarea entera se hace con la máquina corriendo.
      if (CONDICIONES_ORDEN[c] > CONDICIONES_ORDEN[peor]) peor = c
    }
    cerrar(SLOTS_POR_DIA)
  }

  return candidatas
    .sort(
      (a, b) =>
        CONDICIONES_ORDEN[a.condicion] - CONDICIONES_ORDEN[b.condicion] ||
        b.holguraMin - a.holguraMin ||
        a.dia - b.dia ||
        a.inicio - b.inicio,
    )
    .slice(0, maximo)
}

/** Aplica una sugerencia a la capa de intervención, sin tocar la de ocupación. */
export function aplicarSugerencia(maquina: MaquinaRueda, s: Sugerencia): MaquinaRueda {
  const dia = maquina.semana[s.dia]
  if (!dia) return maquina
  const mant = dia.mant.split('')
  for (let k = 0; k < s.largo; k++) mant[(s.inicio + k) % SLOTS_POR_DIA] = '1'
  return {
    ...maquina,
    semana: maquina.semana.map((d, i) => (i === s.dia ? { ...d, mant: mant.join('') } : d)),
  }
}
