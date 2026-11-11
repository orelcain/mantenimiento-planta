/**
 * pinShiftEnd.ts — fijar a mano la hora de cierre de un turno.
 *
 * El monitor calcula el cierre solo, de la mediana de los turnos anteriores.
 * Eso cubre el caso normal y no hay que mantenerlo. Pero a veces la persona que
 * mira la pantalla SABE algo que el historial todavía no: que hoy se corta
 * antes, que el turno nuevo va hasta tal hora. Este módulo guarda esa decisión
 * con la marca `endPinned`, y el backend la respeta por encima del historial.
 *
 * ⚠ Escribe en `graderModuleConfigs`, no en el doc del monitor: aquél tiene
 * `allow write: if false` en las reglas — NADIE puede tocarlo desde el
 * navegador, y eso no se cambia. Las reglas de `graderModuleConfigs` exigen
 * supervisor, así que la comprobación de rol de la UI no es la única defensa.
 */

import { doc, getDoc, setDoc, serverTimestamp } from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { PlantSlug } from './shoplogixMachines'
import { construirPerilla, desdePerilla } from '@/lib/horaDePlanta'

const COLLECTION = 'graderModuleConfigs'

/**
 * Cada `plantSlug` del monitor es UNA línea. Mismo mapeo que usa el backend
 * para leer la config: si los dos no coinciden, se guardaría en un documento
 * que nadie lee.
 */
const CONFIG_DOC_ID: Record<string, string> = {
  chonchi: 'global',
  yal: 'yal-eviscerado',
  filete: 'chonchi-filete',
}

/** "Turno Dia" y "Turno día" son el mismo turno. Igual que en el backend. */
function normShiftName(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface ShiftScheduleEntry {
  shiftId: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  endPinned?: boolean
  quota?: { value: number; unit: 'kg' | 'pieces' }
}

/**
 * Fija la hora de cierre del turno `shiftName` de una línea.
 *
 * Si el turno no existía en la config lo crea, tomando la hora de inicio del
 * turno real — un turno recién dado de alta por Shoplogix (el segundo de
 * Filete, por ejemplo) no está en ninguna config todavía.
 */
export async function pinShiftEnd(params: {
  plantSlug: PlantSlug | string
  shiftName: string
  endHour: number
  endMinute: number
  /** Inicio real del turno, para crear la entrada si no existía. */
  startAtIso?: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Sin config conocida para la planta ${params.plantSlug}`)
  if (!params.shiftName) throw new Error('Falta el nombre del turno')

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []

  const idx = actual.findIndex((e) => normShiftName(e.shiftId) === normShiftName(params.shiftName))
  const inicio = params.startAtIso ? new Date(params.startAtIso) : null
  // Wall-clock, como el resto del módulo.
  const startHour = idx >= 0 ? actual[idx]!.startHour : (inicio ? inicio.getUTCHours() : 0)
  const startMinute = idx >= 0 ? actual[idx]!.startMinute : (inicio ? inicio.getUTCMinutes() : 0)

  const entrada: ShiftScheduleEntry = {
    ...(idx >= 0 ? actual[idx]! : {}),
    shiftId: idx >= 0 ? actual[idx]!.shiftId : params.shiftName,
    startHour,
    startMinute,
    endHour: params.endHour,
    endMinute: params.endMinute,
    endPinned: true,
  }

  const siguiente = idx >= 0
    ? actual.map((e, i) => (i === idx ? entrada : e))
    : [...actual, entrada]

  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/** Quita el pin: el cierre vuelve a salir del historial. */
export async function unpinShiftEnd(params: {
  plantSlug: PlantSlug | string
  shiftName: string
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) return
  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []
  const siguiente = actual.map((e) =>
    normShiftName(e.shiftId) === normShiftName(params.shiftName) ? { ...e, endPinned: false } : e,
  )
  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * Guarda el set point operacional de la línea, con su fuente.
 *
 * Orel lo midió cronómetro en mano (silletas por minuto en la alimentación) y
 * vivía hardcodeado en el código: parecía dato del PLC. Acá queda CON fecha,
 * método y quién — «la fuente es parte del dato»— y el backend lo publica en
 * el payload del monitor. El máximo funcional NO se edita: sale del manual.
 *
 * El historial se acumula: cada cambio queda, así «¿desde cuándo corre a X?»
 * tiene respuesta sin ir a buscar en git.
 */
export async function setMonitorSetPoint(params: {
  plantSlug: PlantSlug | string
  cpm: number
  metodo: string
  por: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (!(params.cpm > 0) || params.cpm > 60) throw new Error('Set point fuera de rango')

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const previo = snap.data()?.monitorSetPoint ?? null
  const hoy = new Date()
  const dateKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const nuevo = {
    cpm: params.cpm,
    medidoEl: dateKey,
    metodo: params.metodo.trim() || null,
    por: params.por,
  }
  const historial = Array.isArray(snap.data()?.monitorSetPointHistorial)
    ? snap.data()!.monitorSetPointHistorial
    : []
  await setDoc(ref, {
    monitorSetPoint: nuevo,
    monitorSetPointHistorial: [...historial, ...(previo ? [previo] : [])].slice(-20),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Velocidad de la perilla de UNA máquina, en pz/min. `desde` es ISO y marca
 * cuándo entró en vigor: al anotar es siempre «ahora». `por` es quién la anotó.
 */
export type PerillaMaquina = {
  cpm: number
  desde: string
  por: string | null
  /** Motivo de la perilla («por el Knuro»). Cadena vacía = sin motivo. Siempre se escribe: con `merge`, una clave ausente dejaría el motivo viejo. */
  motivo?: string
}

/** Una entrada del historial de perillas: la máquina y lo que se anotó para ella. */
export type PerillaHistorial = PerillaMaquina & { machineId: string }

/** El historial guarda como máximo estas entradas; la más vieja sale primero. */
const HISTORIAL_PERILLAS_MAX = 100

/** Tope del motivo de una perilla, en caracteres. El servidor (functions/publicMonitor.js) lo vuelve a aplicar al publicar. */
const MOTIVO_PERILLA_MAX = 60

/**
 * Motivo de una perilla, saneado: sin espacios sobrantes y con tope de 60 caracteres. Se cuentan caracteres, no unidades de
 * código, para no partir un emoji. Vacío o no texto = cadena vacía, que quiere decir «sin motivo».
 */
export function normMotivoPerilla(motivo: string | null | undefined): string {
  if (typeof motivo !== 'string') return ''
  return Array.from(motivo.trim()).slice(0, MOTIVO_PERILLA_MAX).join('').trim()
}

/**
 * Anota la velocidad de la perilla de UNA máquina de la línea.
 *
 * Documento: el mismo que lee `loadPlannedShift` (functions/publicMonitor.js) para
 * esa línea. Se resuelve con `CONFIG_DOC_ID[plantSlug]`, la misma tabla que usa el
 * backend: chonchi → `global`, yal → `yal-eviscerado`, filete → `chonchi-filete`.
 * Si las dos tablas divergieran, la anotación quedaría en un documento que nadie
 * lee, por eso no hay una segunda tabla aquí.
 *
 * `desde` es siempre el momento de anotar: no se acepta una fecha de vigencia
 * anterior, porque fecharla hacia atrás cambiaría lo que ya se midió.
 *
 * Quién puede escribir: solo admin. Las reglas de `graderModuleConfigs` lo exigen
 * con `affectedKeys` sobre `monitorPerillas` y `monitorPerillasHistorial`. Esta
 * función no vuelve a comprobar el rol: la UI lo oculta y las reglas lo bloquean.
 */
export async function setMonitorPerilla(params: {
  plantSlug: PlantSlug | string
  machineId: string
  cpm: number
  por: string | null
  /** Motivo opcional («por el Knuro»): vacío o ausente = sin motivo. Se recorta a 60 caracteres. */
  motivo?: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (!params.machineId) throw new Error('Falta la máquina de la perilla')
  if (!(params.cpm >= 5 && params.cpm <= 30)) throw new Error('Perilla fuera de rango (5 a 30 pz/min)')

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const historialPrevio: PerillaHistorial[] = Array.isArray(snap.data()?.monitorPerillasHistorial)
    ? snap.data()!.monitorPerillasHistorial
    : []
  /* El motivo va siempre, null incluido: con `merge`, una clave que no se escribe dejaría el motivo de la anotación anterior. */
  const nueva: PerillaMaquina = {
    ...construirPerilla({ cpm: params.cpm, por: params.por, nowMs: Date.now() }),
    motivo: normMotivoPerilla(params.motivo),
  }
  await setDoc(ref, {
    // Merge profundo: escribe solo esta máquina y deja intactas las demás.
    monitorPerillas: { [params.machineId]: nueva },
    monitorPerillasHistorial: [...historialPrevio, { ...nueva, machineId: params.machineId }].slice(-HISTORIAL_PERILLAS_MAX),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * El historial de perillas de la línea, tal como se guardó (el más viejo primero). Lo lee el editor de la franja, y solo un
 * admin lo abre: el monitor público no trae `por`, así que quien anotó sale de aquí. La regla de lectura es la de Firestore
 * (`graderModuleConfigs` lo deja leer a cualquier sesión). Sin documento o sin historial, lista vacía.
 */
export async function leerPerillasHistorial(plantSlug: PlantSlug | string): Promise<PerillaHistorial[]> {
  const docId = CONFIG_DOC_ID[plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${plantSlug}`)
  const snap = await getDoc(doc(db, COLLECTION, docId))
  const historial = snap.data()?.monitorPerillasHistorial
  return Array.isArray(historial) ? (historial as PerillaHistorial[]) : []
}

/** Los dos modos del umbral «a ritmo» de la línea: calibrado (perilla − 1 por Baader) u óptimo (la perilla completa). */
export type ModoUmbralLinea = 'calibrado' | 'optimo'

/** El modo vigente o una entrada del historial: qué modo, cuándo entró en vigor (hora de planta) y quién lo anotó. */
export type UmbralARitmo = { modo: ModoUmbralLinea; desde: string; por: string | null }

/**
 * Anota el modo del umbral «a ritmo» de la LÍNEA. Mismo documento y mismo patrón que `setMonitorPerilla`:
 * `CONFIG_DOC_ID[plantSlug]`, `desde` = el momento de anotar y historial de como máximo `HISTORIAL_PERILLAS_MAX`.
 *
 * Quién puede escribir: solo admin. Las reglas de `graderModuleConfigs` lo exigen con `affectedKeys` sobre
 * `monitorUmbralARitmo` y `monitorUmbralARitmoHistorial`. Esta función no vuelve a comprobar el rol: la UI lo
 * oculta y las reglas lo bloquean.
 */
export async function setMonitorUmbralARitmo(params: {
  plantSlug: PlantSlug | string
  modo: ModoUmbralLinea
  por: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (params.modo !== 'calibrado' && params.modo !== 'optimo') throw new Error(`Modo de umbral desconocido: ${params.modo}`)

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const historialPrevio: UmbralARitmo[] = Array.isArray(snap.data()?.monitorUmbralARitmoHistorial)
    ? snap.data()!.monitorUmbralARitmoHistorial
    : []
  const nueva: UmbralARitmo = { modo: params.modo, desde: desdePerilla(Date.now()), por: params.por }
  await setDoc(ref, {
    monitorUmbralARitmo: nueva,
    monitorUmbralARitmoHistorial: [...historialPrevio, nueva].slice(-HISTORIAL_PERILLAS_MAX),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * El modo del umbral de la línea: `vigente` (la última anotación; null si nunca se anotó) e `historial` (la más
 * vieja primero). Lo lee el editor de admin. Sin documento, `vigente` null e `historial` vacío.
 */
export async function leerUmbralARitmo(plantSlug: PlantSlug | string): Promise<{ vigente: UmbralARitmo | null; historial: UmbralARitmo[] }> {
  const docId = CONFIG_DOC_ID[plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${plantSlug}`)
  const snap = await getDoc(doc(db, COLLECTION, docId))
  const vigente = snap.data()?.monitorUmbralARitmo ?? null
  const historial = snap.data()?.monitorUmbralARitmoHistorial
  return {
    vigente: vigente as UmbralARitmo | null,
    historial: Array.isArray(historial) ? (historial as UmbralARitmo[]) : [],
  }
}

/**
 * La cuota del turno, editable desde el monitor.
 *
 * Pedido de Orel (26-08): «la cuota ponla en el monitor para seleccionarla,
 * porque puede variar — 15.000 por turno u otra cantidad».
 *
 * No hace falta inventar dónde guardarla: la cuota YA vive por turno en
 * `graderModuleConfigs/{docId}.shiftSchedule[].quota = { value, unit }`, y el
 * backend la publica como `live.quotaPieces`. Esto solo la deja cambiar sin
 * entrar al panel de configuración, con la línea produciendo.
 *
 * Se guarda SIEMPRE en piezas: el backend descarta cualquier cuota que no
 * venga en `pieces` —una cuota en kilos comparada contra ciclos sería un
 * disparate— y el monitor mide piezas.
 *
 * Como `pinShiftEnd`, escribe en `graderModuleConfigs`, cuyas reglas exigen
 * supervisor: la comprobación de rol de la UI no es la única defensa.
 */
export async function setShiftQuota(params: {
  plantSlug: PlantSlug | string
  shiftName: string
  /** Piezas del turno. `null` borra la cuota y devuelve la del sensor. */
  piezas: number | null
  por: string | null
  /**
   * Lo que producción pidió de verdad, cuando la cuota vino en toneladas.
   *
   * ⚠ Regla de Orel (26-08): «están pidiendo TONELADAS, no cantidad de piezas;
   * para hacer 70 t depende del peso promedio del pescado, así que a veces la
   * hacen con 15.000 o más». El monitor cuenta piezas —Shoplogix entrega
   * ciclos, no kilos— así que la meta se guarda convertida, pero con el pedido
   * original al lado: sin él nadie puede saber de dónde salió el número ni
   * recalcularlo cuando cambia el calibre.
   */
  origen?: { toneladas: number; pesoPromedioKg: number } | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (params.piezas != null && !(params.piezas > 0)) {
    throw new Error('La meta tiene que ser un número de piezas mayor que cero.')
  }
  // Un dedo de más (150.000 en vez de 15.000) quedaría fijado como meta del
  // turno y descolocaría todos los porcentajes de la pantalla.
  if (params.piezas != null && params.piezas > 200_000) {
    throw new Error('Esa meta es demasiado alta: revisa el número.')
  }

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []

  const objetivo = normShiftName(params.shiftName)
  const encontrado = actual.some((e) => normShiftName(e.shiftId) === objetivo)
  if (!encontrado) {
    throw new Error(`El turno "${params.shiftName}" no está en el horario de esta línea.`)
  }

  const siguiente = actual.map((e) => {
    if (normShiftName(e.shiftId) !== objetivo) return e
    const resto = { ...e } as ShiftScheduleEntry & { quota?: unknown; quotaPor?: unknown; quotaAt?: unknown }
    if (params.piezas == null) {
      delete resto.quota
      delete resto.quotaPor
      delete resto.quotaAt
      delete (resto as { quotaOrigen?: unknown }).quotaOrigen
      return resto
    }
    return {
      ...resto,
      quota: { value: params.piezas, unit: 'pieces' },
      quotaPor: params.por ?? null,
      quotaAt: new Date().toISOString(),
      ...(params.origen
        ? { quotaOrigen: { toneladas: params.origen.toneladas, pesoPromedioKg: params.origen.pesoPromedioKg } }
        : {}),
    }
  })

  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * El peso promedio del pescado del turno, que se va ajustando mientras corre.
 *
 * Orel (26-08): «pon también el dato para poner el peso promedio además de la
 * cuota variable… así vamos poniendo el peso promedio durante el turno y
 * calcula las toneladas más o menos que se pueden lograr, porque las toneladas
 * las sacamos del Grader y no es en tiempo real ese dato, lo sacamos del Excel».
 *
 * Shoplogix cuenta ciclos: sin este número el monitor no puede decir una sola
 * tonelada. Con él, estima en vivo cuántas van y cuántas darían al cierre — y
 * si la cuota se había fijado EN TONELADAS, se recalculan las piezas meta con
 * el peso nuevo, que es justamente lo que cambia cuando cambia el calibre.
 */
export async function setPesoPromedio(params: {
  plantSlug: PlantSlug | string
  shiftName: string
  /** Kilos por pieza. `null` lo borra. */
  pesoKg: number | null
  por: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (params.pesoKg != null && !(params.pesoKg >= 0.5 && params.pesoKg <= 25)) {
    throw new Error('El peso promedio tiene que estar entre 0,5 y 25 kg.')
  }

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []
  const objetivo = normShiftName(params.shiftName)
  if (!actual.some((e) => normShiftName(e.shiftId) === objetivo)) {
    throw new Error(`El turno "${params.shiftName}" no está en el horario de esta línea.`)
  }

  const siguiente = actual.map((e) => {
    if (normShiftName(e.shiftId) !== objetivo) return e
    const entry = { ...e } as ShiftScheduleEntry & {
      pesoPromedioKg?: number
      pesoPromedioAt?: string
      pesoPromedioPor?: string | null
      pesoHistorial?: Array<{ at: string; pesoKg: number; por: string | null }>
      quota?: { value: number; unit: string }
      quotaOrigen?: { toneladas: number; pesoPromedioKg: number }
    }
    if (params.pesoKg == null) {
      delete entry.pesoPromedioKg
      delete entry.pesoPromedioAt
      delete entry.pesoPromedioPor
      delete entry.pesoHistorial
      return entry
    }
    /*
     * HISTORIAL del peso (Orel, 28-08): «es una variable cambiante… a tal
     * hora se registró tal peso, después se puso otro según la pesca y el
     * lote». Cada registro rige desde su hora hasta el siguiente, y las
     * toneladas del monitor se calculan POR TRAMOS con el peso vigente de
     * cada uno. La entry es por NOMBRE de turno y se reusa cada día, así que
     * acá solo se poda lo viejo (>20 h — turnos anteriores); el backend
     * además filtra por el arranque del turno vigente al publicar.
     */
    const corte = Date.now() - 20 * 3600_000
    entry.pesoHistorial = [
      ...(entry.pesoHistorial ?? []).filter((r) => Date.parse(r.at) >= corte),
      { at: new Date().toISOString(), pesoKg: params.pesoKg, por: params.por ?? null },
    ].slice(-24)
    entry.pesoPromedioKg = params.pesoKg
    entry.pesoPromedioAt = new Date().toISOString()
    entry.pesoPromedioPor = params.por ?? null
    // La cuota pedida en toneladas se mueve con el calibre: si el pescado sale
    // más chico, las mismas 70 t son más piezas.
    if (entry.quotaOrigen?.toneladas) {
      entry.quota = {
        value: Math.round((entry.quotaOrigen.toneladas * 1000) / params.pesoKg),
        unit: 'pieces',
      }
      entry.quotaOrigen = { ...entry.quotaOrigen, pesoPromedioKg: params.pesoKg }
    }
    return entry
  })

  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * Elimina UN registro del historial de pesos (Orel, 29-08: «editar o eliminar
 * los ya agregados» — un dedo de más en los gramos no puede quedar pegado en
 * las toneladas del turno). Editar = eliminar el malo + poner el bueno.
 *
 * `at` es la clave del registro (la ISO UTC con que se guardó; el monitor la
 * recibe en `pesoRegistros[].at`). El peso VIGENTE pasa al último registro
 * que quede; sin registros, el campo plano también se limpia — la tarjeta
 * vuelve a pedir el peso, que es lo honesto.
 */
export async function eliminarRegistroPeso(params: {
  plantSlug: PlantSlug | string
  shiftName: string
  at: string
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []
  const objetivo = normShiftName(params.shiftName)

  const siguiente = actual.map((e) => {
    if (normShiftName(e.shiftId) !== objetivo) return e
    const entry = { ...e } as ShiftScheduleEntry & {
      pesoPromedioKg?: number
      pesoPromedioAt?: string
      pesoPromedioPor?: string | null
      pesoHistorial?: Array<{ at: string; pesoKg: number; por: string | null }>
    }
    const historial = (entry.pesoHistorial ?? []).filter((r) => r.at !== params.at)
    entry.pesoHistorial = historial
    const ultimo = historial[historial.length - 1]
    if (ultimo) {
      entry.pesoPromedioKg = ultimo.pesoKg
      entry.pesoPromedioAt = ultimo.at
      entry.pesoPromedioPor = ultimo.por ?? null
    } else {
      delete entry.pesoPromedioKg
      delete entry.pesoPromedioAt
      delete entry.pesoPromedioPor
      delete entry.pesoHistorial
    }
    return entry
  })

  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}
