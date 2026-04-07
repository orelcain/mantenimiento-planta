import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
} from '@/services/firestoreTracked'
import { db } from './firebase'

const SECTIONS_COL = 'baader200-sections'
const CONFIG_COL   = 'baader200-config'
const HISTORY_COL  = 'baader200-history'

export interface B200Step {
  text: string
  important?: boolean
}

export interface B200Measurement {
  name: string
  value: string
  unit?: string
  note?: string
}

export interface B200ImageCrop {
  x: number
  y: number
  w: number
  h: number
}

export interface B200Image {
  url: string
  caption?: string
  crop?: B200ImageCrop
  size?: 'half' | 'full'
}

export interface B200Section {
  id: string
  title: string
  order: number
  type: 'ajuste' | 'troubleshooting' | 'seguridad' | 'precaucion'
  description: string
  steps: B200Step[]
  measurements: B200Measurement[]
  notes: string[]
  images: B200Image[]
  updatedAt: Date
  updatedBy: string
}

export interface B200HistoryEntry {
  id?: string
  sectionId: string
  sectionTitle: string
  action: 'create' | 'update' | 'delete'
  userId: string
  userName: string
  timestamp: Date
}

export async function getB200Sections(): Promise<B200Section[]> {
  const snap = await getDocs(collection(db, SECTIONS_COL))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      title: data.title as string,
      order: data.order as number ?? 0,
      type: data.type as B200Section['type'],
      description: data.description as string ?? '',
      steps: (data.steps as B200Step[]) ?? [],
      measurements: (data.measurements as B200Measurement[]) ?? [],
      notes: (data.notes as string[]) ?? [],
      images: (data.images as B200Image[]) ?? [],
      updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
      updatedBy: data.updatedBy as string ?? '',
    }
  }).sort((a, b) => a.order - b.order)
}

export async function saveB200Section(
  section: Omit<B200Section, 'updatedAt'>,
  userId: string,
): Promise<void> {
  await setDoc(doc(db, SECTIONS_COL, section.id), {
    ...section,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}

export async function deleteB200Section(id: string): Promise<void> {
  await deleteDoc(doc(db, SECTIONS_COL, id))
}

export async function getB200SectionOrder(): Promise<string[]> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'section-order'))
  return snap.exists() ? (snap.data().order as string[]) ?? [] : []
}

export async function saveB200SectionOrder(order: string[]): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'section-order'), { order, updatedAt: serverTimestamp() })
}

export async function addB200History(
  entry: Omit<B200HistoryEntry, 'id' | 'timestamp'>,
): Promise<void> {
  await addDoc(collection(db, HISTORY_COL), {
    ...entry,
    timestamp: serverTimestamp(),
  })
}

/** Obtiene la clave de edición de Baader 200 desde Firestore */
export async function getB200EditPwd(): Promise<string> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'edit-pwd'))
  return snap.exists() ? (snap.data().pwd as string) || 'admin' : 'admin'
}

/** Guarda la clave de edición de Baader 200 en Firestore */
export async function saveB200EditPwd(pwd: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'edit-pwd'), { pwd, updatedAt: serverTimestamp() })
}

export async function getB200History(limitCount = 50): Promise<B200HistoryEntry[]> {
  const q = query(
    collection(db, HISTORY_COL),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      sectionId: data.sectionId as string,
      sectionTitle: data.sectionTitle as string,
      action: data.action as B200HistoryEntry['action'],
      userId: data.userId as string,
      userName: data.userName as string,
      timestamp: (data.timestamp as Timestamp)?.toDate() ?? new Date(),
    }
  })
}


export const DEFAULT_B200_SECTIONS: Omit<B200Section, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'primera-alimentacion',
    title: '1ra Alimentación',
    order: 1,
    type: 'ajuste',
    description: 'Ajuste de la primera alimentación: chapaletas, silleta y resortes. No siempre a la distancia de 32-28mm que indica el catálogo original; por lo general es menos medida.',
    steps: [
      { text: 'Ajustar la distancia de las chapaletas (Fig 2-4) de manera que no roce con la silleta.' },
      { text: 'Centrar las chapaletas con los segmentos Fig 5.' },
      { text: 'Verificar que no haya roce con el perno Fig 6.' },
      { text: 'Cuando la materia prima se trabaja a temperatura menor a 0°C, dar más presión al resorte.', important: true },
      { text: 'La presión del resorte se ajusta con la tuerca Fig 6.' },
    ],
    measurements: [
      { name: 'Distancia referencia catálogo', value: '32-28', unit: 'mm', note: 'En la práctica generalmente es menos' },
    ],
    notes: [
      'No ajustar siempre a la medida del catálogo — usar la medida que corresponda a las condiciones reales.',
      'Con temperatura de materia prima bajo 0°C se requiere mayor presión en el resorte.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-03.jpg', caption: '1ra Alimentación — Ajuste chapaletas y silleta' }],
  },
  {
    id: 'segunda-alimentacion',
    title: '2da Alimentación',
    order: 2,
    type: 'ajuste',
    description: 'Ajuste de la segunda alimentación: posición de la leva, chapaletas y topes de seguridad.',
    steps: [
      { text: 'Desplazar la silleta hasta la posición de reposo de la máquina.' },
      { text: 'La leva debe quedar igual como lo indica la figura (2da leva del lado del operador).' },
      { text: 'Ajustar las chapaletas Fig 3-4 de manera que queden por dentro del filo de los cuchillos dorsales ±0.5mm (casi chocando entre sí). Regular con pernos topes 1-2.' },
      { text: 'Si las chapaletas quedan desalineadas, regularlas con los segmentos pos 10-11.' },
      { text: 'Posterior a esto regular los topes de seguridad a 0.5mm de los amortiguadores Fig 14-15.' },
      { text: 'Asegurarse que los resortes estén con la misma tensión. Regular con tuercas de seguridad 5-6.' },
      { text: 'Al cambiar cuchillos nuevos, reajustar chapaletas de la 2da alimentación con pernos M10 Fig 4-5.', important: true },
    ],
    measurements: [
      { name: 'Tolerancia chapaletas vs filo cuchillos dorsales', value: '±0.5', unit: 'mm', note: 'Por lo general es más, casi chocando' },
      { name: 'Topes de seguridad vs amortiguadores', value: '0.5', unit: 'mm' },
    ],
    notes: [
      'Al cambiar cuchillos nuevos, al bajar el mando dorsal los cuchillos en trabajo normal rozarían con las chapaletas. Reajustar siempre con pernos M10.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-04.jpg', caption: '2da Alimentación — Posición leva y chapaletas' }],
  },
  {
    id: 'levantadores-aletas',
    title: 'Levantadores de Aletas (1ro y 2do)',
    order: 3,
    type: 'ajuste',
    description: 'Ajuste del 1er y 2do levantador de aletas con pernos de tope y biela de mando.',
    steps: [
      { text: 'Ajustar el 1er levantador con pernos de tope Fig 2-4 según medida indicada: 30mm.' },
      { text: 'Ajustar el 2do levantador con pernos de tope Fig 2-4 según medida indicada: 50mm.' },
      { text: 'Si el 1er levantador queda muy alto, regular con pernos M8 de la parte superior pos 1 de manera que no roce con las chapaletas de la 1ra alimentación.' },
      { text: 'El 2do levantador se baja más de lo normal por no contar con chapas guías de aleta.' },
      { text: 'La parte inferior delantera del 2do levantador debe estar a 5mm del contradiente al paso de las aletas.', important: true },
      { text: 'Si la distancia no es 5mm, regular con la biela de mando Fig 6 justo con el contradiente debajo de este.' },
    ],
    measurements: [
      { name: '1er levantador — medida de tope', value: '30', unit: 'mm' },
      { name: '2do levantador — medida de tope', value: '50', unit: 'mm' },
      { name: 'Distancia parte inferior delantera vs contradiente', value: '5', unit: 'mm' },
    ],
    notes: [
      'El 2do levantador no tiene chapas guías de aleta, por lo tanto se baja más de lo normal.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-05.jpg', caption: 'Levantadores de aletas — 1er y 2do levantador' }],
  },
  {
    id: 'cuchillos-ventrales',
    title: 'Cuchillos Ventrales',
    order: 4,
    type: 'ajuste',
    description: 'Ajuste y calibración de los cuchillos ventrales usando cruz patrón y medida de referencia.',
    steps: [
      { text: 'Ajustar la medida "a" de 5mm de avance de los cuchillos ventrales.' },
      { text: 'Tomar medida de referencia de 177.5mm a la cara interna del cuchillo izquierdo (con medida patrón o reglilla).' },
      { text: 'Colocar cruz patrón para la regulación y calibración del cuchillo. Realizar con cobos de sujeción pos 8-9 derecho.' },
      { text: 'Avanzar la silleta hasta que quede en el centro de los cuchillos ventrales.' },
      { text: 'Regular la distancia de los cuchillos en relación al paso de la silleta con la biela de mando pos 13-14.' },
      { text: 'Los pernos de fijación pos 1-2 solo se mueven en etapa de mantención anual para el alineamiento de los cuchillos entre sí.', important: true },
    ],
    measurements: [
      { name: 'Avance cuchillos ventrales "a"', value: '5', unit: 'mm' },
      { name: 'Referencia cara interna cuchillo izquierdo', value: '177.5', unit: 'mm' },
    ],
    notes: [
      'Los pernos de fijación pos 1-2 SOLO se mueven en mantención anual.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-06.jpg', caption: 'Cuchillos ventrales — Medida y calibración' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-07.jpg', caption: 'Principio de corte ventrales y dorsales' }],
  },
  {
    id: 'guias-flotantes',
    title: 'Guías Flotantes',
    order: 5,
    type: 'ajuste',
    description: 'Ajuste de las guías flotantes posterior al ajuste de cuchillos ventrales.',
    steps: [
      { text: 'Realizar este ajuste SIEMPRE después del ajuste de cuchillos ventrales.', important: true },
      { text: 'Las guías flotantes deben solapar los cuchillos ventrales en la cara interior.' },
      { text: 'La abertura de las guías flotantes no debe ser más de 4.8mm. Ajustar con pernos parker M6 (dos de cada lado en los soportes de los cojinetes).' },
      { text: 'Regular la altura: 5mm por debajo de las guías de la 2da alimentación.' },
      { text: 'Todos estos ajustes deben realizarse con la silleta en posición de reposo de la máquina.', important: true },
    ],
    measurements: [
      { name: 'Abertura máxima guías flotantes', value: '4.8', unit: 'mm' },
      { name: 'Altura vs guías 2da alimentación', value: '5', unit: 'mm', note: 'Por debajo' },
    ],
    notes: [
      'SIEMPRE realizar con silleta en posición de reposo.',
      'Ajustar siempre después de los cuchillos ventrales.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-08.jpg', caption: 'Guías flotantes — Ajuste de abertura' }],
  },
  {
    id: 'cuchillos-dorsales',
    title: 'Cuchillos Dorsales',
    order: 6,
    type: 'ajuste',
    description: 'Ajuste de la distancia de abertura de los cuchillos dorsales usando cruz patrón.',
    steps: [
      { text: 'Colocar la máquina en posición de reposo.' },
      { text: 'Colocar una cruz patrón entre los cuchillos ventrales para alineamiento entre ventrales y dorsales.' },
      { text: 'Ajustar la distancia de abertura "b" con los cubos sujetadores pos 3.' },
    ],
    measurements: [
      { name: 'Distancia entre ventrales y dorsales', value: '12', unit: 'mm' },
    ],
    notes: [
      'La cruz patrón asegura que los cuchillos ventrales y dorsales queden exactamente alineados entre sí.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-09.jpg', caption: 'Cuchillos dorsales — Abertura y alineamiento' }],
  },
  {
    id: 'medidas-cuchillos',
    title: 'Medidas de Cuchillos',
    order: 7,
    type: 'ajuste',
    description: 'Verificación y ajuste de la distancia entre cuchillos ventrales y dorsales.',
    steps: [
      { text: 'Verificar la distancia de 12mm entre cuchillos ventrales y dorsales. Hacerlo especialmente al cambiar cuchillos nuevos.', important: true },
      { text: 'Si la distancia no es correcta, los cuchillos rozarían con las chapaletas de la 2da alimentación.' },
      { text: 'Ajustar la distancia de 12mm con los pernos topes pos 4-5 en posición de reposo.' },
    ],
    measurements: [
      { name: 'Distancia cuchillos ventrales vs dorsales', value: '12', unit: 'mm', note: 'Verificar siempre al cambiar cuchillos' },
    ],
    notes: [
      'Verificar SIEMPRE al cambiar cuchillos nuevos para evitar que rocen con las chapaletas.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-10.jpg', caption: 'Medidas entre cuchillos ventrales y dorsales' }],
  },
  {
    id: 'mando-cuchillos-dorsales',
    title: 'Mando de Cuchillos Dorsales',
    order: 8,
    type: 'ajuste',
    description: 'Ajuste del levante de los cuchillos dorsales al paso de la silleta.',
    steps: [
      { text: 'Los cuchillos dorsales deben levantar 20mm al paso de la silleta.' },
      { text: 'Esta altura la da la palanca del trinquete. Ajustar con pernos pos 11 de manera que quede a 12mm de la entalla.' },
      { text: 'Si no se produce el levantamiento, verificar primero la posición del trinquete.', important: true },
      { text: 'Posterior a eso verificar el bulón con gollete del mando dorsales en el conjunto del carter de las levas.' },
    ],
    measurements: [
      { name: 'Levante de cuchillos dorsales al paso silleta', value: '20', unit: 'mm' },
      { name: 'Distancia pernos pos 11 a la entalla', value: '12', unit: 'mm' },
    ],
    notes: [
      'Si no hay levantamiento: 1ro verificar trinquete, 2do verificar bulón con gollete en carter de levas.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-11.jpg', caption: 'Mando de cuchillos dorsales — Palanca trinquete' }],
  },
]

export const DEFAULT_B200_SECTIONS_PART2: Omit<B200Section, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'guias-espinas-superiores',
    title: 'Guías de Espinas Superiores',
    order: 9,
    type: 'ajuste',
    description: 'Ajuste de guías superiores e inferiores de espinas con pernos de posición.',
    steps: [
      { text: 'Ajustar guías superiores pos 3 a 2mm aprox. en relación al contradiente de la silleta con pernos pos 9-11.' },
      { text: 'El perno separador entre las guías delanteras y la guía de espinas superior debe estar suelto (pos 14) para no interferir en la regulación.' },
      { text: 'Desplazar la silleta de manera que quede justo por debajo de las dos guías.' },
      { text: 'Ajustar la guía delantera pos 4 con el perno pos 5 de manera que queden niveladas.' },
      { text: 'Verificar que el filo de los cuchillos quede escondido 1mm sobre dichas guías. Ajustar con perno M10 pos 7.' },
      { text: 'Desplazar la silleta a posición de reposo. Ajustar guías a 3mm sobre el filo de los cuchillos dorsales.' },
      { text: 'Reapretar el perno separador a 0.5mm de la guía superior pos 14.', important: true },
    ],
    measurements: [
      { name: 'Guías superiores pos 3 vs contradiente silleta', value: '2', unit: 'mm' },
      { name: 'Filo cuchillos vs guías (escondido)', value: '1', unit: 'mm' },
      { name: 'Guías vs filo cuchillos dorsales (posición reposo)', value: '3', unit: 'mm' },
      { name: 'Perno separador vs guía superior', value: '0.5', unit: 'mm' },
    ],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-12.jpg', caption: 'Guías de espinas superiores — Ajuste pos 3' }],
  },
  {
    id: 'cuchillos-punzones',
    title: 'Cuchillos Punzones',
    order: 10,
    type: 'ajuste',
    description: 'Ajuste de caída, altura mínima y altura de trabajo de los cuchillos punzones.',
    steps: [
      { text: 'Ajustar la caída del cuchillo 7mm antes de la llegada de la silleta al fin B (pos 1-2) con el segmento de la leva fin D pos 3.' },
      { text: 'La altura mínima debe ser a 1mm de la superficie de la ranura de la guía de espinas inferiores. Ajustar con el tope del rodillo de la leva (zona carter) Fig A pos 4.' },
      { text: 'La altura de trabajo: al pasar la silleta, la distancia entre la punta del diente y la cuchilla debe ser 3-4mm.' },
      { text: 'La separación entre cuchillos debe ser 8mm.' },
      { text: 'Regular la altura de trabajo con la biela de mando Fig A pos 2, con la silleta en medio de los cuchillos.' },
      { text: 'Si uno está más alto o bajo que el otro, regular con las bielas de mando de cada cuchillo individualmente.' },
      { text: 'Fijar pernos topes de seguridad a 0.5mm y reapretar.' },
      { text: 'Cuchillos más altos de lo normal → gay ping en el filete a lo largo del esquelon.', important: true },
      { text: 'Cuchillos más bajos → corta la espina del flanco y los cuchillos rascadores no cumplen función.', important: true },
    ],
    measurements: [
      { name: 'Caída antes de llegada silleta', value: '7', unit: 'mm' },
      { name: 'Altura mínima vs ranura guía espinas inferiores', value: '1', unit: 'mm' },
      { name: 'Distancia punta diente vs cuchilla (altura trabajo)', value: '3-4', unit: 'mm' },
      { name: 'Separación entre cuchillos', value: '8', unit: 'mm' },
      { name: 'Topes de seguridad', value: '0.5', unit: 'mm' },
    ],
    notes: [
      'Cuchillos muy altos → gay ping en el filete a lo largo del esquelon.',
      'Cuchillos muy bajos → corta espina del flanco y cuchillos rascadores no funcionan.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-13.jpg', caption: 'Cuchillos punzones — Ajuste caída y altura' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-14.jpg', caption: 'Principio de corte cuchillos de punta' }],
  },
  {
    id: 'cuchillos-rascadores-ajuste',
    title: 'Cuchillos Rascadores — Ajuste',
    order: 11,
    type: 'ajuste',
    description: 'Ajuste de los cuchillos rascadores con silleta en posición 1350.',
    steps: [
      { text: 'Desplazar la silleta a 1350mm aproximadamente (Fig B).', important: true },
      { text: 'En esta posición los cuchillos se encontrarán por debajo de la guía inferior de espinas.' },
      { text: 'Ajustar con los topes de seguridad de los rodillos de cada leva. Solo se puede realizar en esa posición.' },
    ],
    measurements: [
      { name: 'Posición silleta para ajuste', value: '1350', unit: 'mm', note: 'Aprox.' },
    ],
    notes: [
      'Este ajuste SOLO se puede realizar con la silleta en posición 1350mm.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-15.jpg', caption: 'Cuchillos rascadores — Ajuste posición' }],
  },
  {
    id: 'cuchillos-rascadores-altura',
    title: 'Cuchillos Rascadores — Altura de Trabajo',
    order: 12,
    type: 'ajuste',
    description: 'Ajuste de la altura de trabajo y abertura de los cuchillos rascadores.',
    steps: [
      { text: 'La altura de trabajo se determina en relación a la silleta: 3mm sobre la base del diente.' },
      { text: 'Ajustar con la biela de mando del brazo del soporte de cada cuchillo.' },
      { text: 'La abertura debe ser entre 17-18mm. Ajustar en posición de trabajo.', important: true },
      { text: 'Como referencia para la abertura: tomar la abertura de las guías superiores de espinas entre el contradiente y el primer diente.' },
    ],
    measurements: [
      { name: 'Altura de trabajo vs base del diente', value: '3', unit: 'mm' },
      { name: 'Abertura cuchillos rascadores', value: '17-18', unit: 'mm' },
    ],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-16.jpg', caption: 'Altura de trabajo cuchillos rascadores' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-17.jpg', caption: 'Abertura cuchillos rascadores' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-18.jpg', caption: 'Principio de corte cuchillos rascadores' }],
  },
  {
    id: 'cuchillos-cola-contrabancadas',
    title: 'Cuchillos de Cola y Contrabancadas',
    order: 13,
    type: 'ajuste',
    description: 'Ajuste de cuchillos circulares de corte de cola y su relación con la contrabancada.',
    steps: [
      { text: 'Ajustar los cuchillos circulares de la zona de corte de cola para que entren en el hueco de la contrabancada. Usar pernos M8 apretando o soltando tuercas.' },
      { text: 'Deben quedar a 0.5mm entre la pieza intercalada y los soportes de sección tuercas pos 3.' },
      { text: 'Asegurarse que la altura mínima sea correcta y no roce con la guía de espinas inferiores.' },
      { text: 'Regular la altura mínima con el perno tope pos 1.', important: true },
      { text: 'Verificar que el rodillo de la biela pos 11 no toque el tope de seguridad pos 12. Si toca, regular con la biela pos 5.' },
    ],
    measurements: [
      { name: 'Distancia pieza intercalada vs soportes pos 3', value: '0.5', unit: 'mm' },
    ],
    notes: [
      'Si el rodillo biela pos 11 toca el tope pos 12, regular primero con biela pos 5 antes del perno tope pos 1.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-19.jpg', caption: 'Cuchillos de cola y contrabancadas' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-20.jpg', caption: 'Principio de corte cuchillos de cola' }],
  },
  {
    id: 'embrague',
    title: 'Embrague',
    order: 14,
    type: 'ajuste',
    description: 'Reajuste del embrague cuando no hay causal justificada de bloqueo.',
    steps: [
      { text: 'Verificar que no haya objeto (pescado u otro) interpuesto al accionamiento normal de la máquina.' },
      { text: 'El embrague tiene un perno M8 parker como seguro. En posición vertical queda un hilo M8 al lado izquierdo.' },
      { text: 'Colocar un perno hexagonal en el hilo M8 como palanca de ajuste (Fig b pos 1).' },
      { text: 'Usar un perfil 30×30×130mm de largo como palanca adicional.' },
      { text: 'Sacar el perno parker para la operación.', important: true },
      { text: 'Girar el volante en el sentido de las manecillas del reloj.' },
      { text: 'Girar 180° el eje (media vuelta) → aparecerá el otro canal chavetero.' },
      { text: 'Colocar nuevamente el prisionero en el canal chavetero.' },
    ],
    measurements: [
      { name: 'Longitud perfil para palanca', value: '130', unit: 'mm' },
      { name: 'Tamaño perfil', value: '30×30', unit: 'mm' },
    ],
    notes: [
      'Reajuste solo cuando no hay causal justificada de bloqueo (no hay objeto interpuesto).',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-21.jpg', caption: 'Embrague — Ajuste y reajuste' }],
  },
  {
    id: 'sistema-seguridad',
    title: 'Sistema de Seguridad',
    order: 15,
    type: 'seguridad',
    description: 'Los 9 puntos del sistema de seguridad de la Baader 200.',
    steps: [
      { text: '1. Límite de carrera de entrada.', important: true },
      { text: '2. Parada de emergencia.', important: true },
      { text: '3. Límite de carrera corte de cola.', important: true },
      { text: '4. Sensor de seguridad guía dorsal.', important: true },
      { text: '5. Sensor de seguridad pasillo (zona 5).', important: true },
      { text: '6. Sensor de seguridad pasillo (zona 6).', important: true },
      { text: '7. Sensor de seguridad pasillo (zona 7).', important: true },
      { text: '8. Sensor de seguridad pasillo (zona 8).', important: true },
      { text: '9. Interruptor principal.', important: true },
    ],
    measurements: [],
    notes: [
      'El circuito de control incluye: límites, sensores y botoneras.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-34.jpg', caption: 'Sistema de seguridad — 9 puntos' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-35.jpg', caption: 'Circuito de control eléctrico' }],
  },
  {
    id: 'precauciones-cambio-cuchillos',
    title: 'Precauciones — Cambio de Cuchillos Nuevos',
    order: 16,
    type: 'precaucion',
    description: 'Procedimientos obligatorios al realizar cambio de cuchillos ventrales y dorsales nuevos.',
    steps: [
      { text: 'Ajustar a medida patrón 12mm entre cuchillos ventrales y dorsales.', important: true },
      { text: 'Realizar nuevo ajuste entre cuchillos ventrales y guías flotantes.', important: true },
      { text: 'Realizar nuevo ajuste entre cuchillos dorsales y guías frontales.' },
      { text: 'Si es necesario, realizar nuevo ajuste con guía superior.' },
      { text: 'Realizar ajuste de guías flotantes nuevamente para asegurar la calidad del filo de los cuchillos nuevos.', important: true },
    ],
    measurements: [
      { name: 'Distancia entre cuchillos ventrales y dorsales', value: '12', unit: 'mm' },
    ],
    notes: [
      'Con cuchillos nuevos SIEMPRE verificar y reajustar la distancia de 12mm.',
      'SIEMPRE reajustar guías flotantes con cuchillos nuevos.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-36.jpg', caption: 'Precauciones cambio cuchillos nuevos' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-37.jpg', caption: 'Ajuste de guías flotantes post-cambio' }],
  },
]

export const DEFAULT_B200_TROUBLESHOOTING: Omit<B200Section, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'ts-cortes-filetes',
    title: 'Detalles / Cortes en Filetes',
    order: 17,
    type: 'troubleshooting',
    description: 'Diagnóstico y solución cuando se producen detalles o cortes en los filetes.',
    steps: [
      { text: 'Verificar filo de cuchillos dorsales (resortes complementarios 1ro y 2do).', important: true },
      { text: 'Verificar alineamiento del 1er y 2do levantador en relación a la silleta.' },
      { text: 'Verificar alimentación 1ra y 2da (seg-dentado) en relación a los cuchillos dorsales.' },
      { text: 'Verificar aberturas de guías frontales (resortes y ejes).' },
    ],
    measurements: [],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-22.jpg', caption: 'Detalles o cortes en filetes' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-23.jpg', caption: 'Ajustes para hueso esquelón' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-24.jpg', caption: 'Tabla de ajustes' }],
  },
  {
    id: 'ts-gay-ping-filete',
    title: 'Gay Ping en la Mitad del Filete (a lo largo)',
    order: 18,
    type: 'troubleshooting',
    description: 'Gay ping a lo largo del filete en la línea del esquelon.',
    steps: [
      { text: 'Verificar filo del cuchillo de punta.', important: true },
      { text: 'Verificar altura de trabajo del cuchillo de punta.' },
      { text: 'Verificar nivelación del cuchillo de punta (si el defecto es solo en un lado).' },
      { text: 'Verificar altura de trabajo del cuchillo rascador.' },
      { text: 'Verificar abertura de cuchillos rascadores.' },
    ],
    measurements: [],
    notes: [
      'Si el gay ping es solo en un lado del filete, verificar nivelación individual del cuchillo de punta de ese lado.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-25.jpg', caption: 'Gay ping en mitad del filete' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-26.jpg', caption: 'Ajustes correctivos' }],
  },
  {
    id: 'ts-espina-belly',
    title: 'Espina Belly',
    order: 19,
    type: 'troubleshooting',
    description: 'Presencia de espina belly en el filete.',
    steps: [
      { text: 'Verificar altura de los cuchillos rascadores.', important: true },
      { text: 'Verificar la calidad del eviscerado: no debe quedar esófago ni riñón.' },
    ],
    measurements: [],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-27.jpg', caption: 'Espina Belly — Verificación' }],
  },
  {
    id: 'ts-trim-d-e',
    title: 'Ajuste Trim D y Trim E',
    order: 20,
    type: 'troubleshooting',
    description: 'Ajuste normal y rápido para Trim D y Trim E según condición de la materia prima.',
    steps: [
      { text: 'Realizar ajuste normal para condición estándar de materia prima.' },
      { text: 'Para ajuste rápido: adaptar según condición específica de la materia prima en el momento.' },
    ],
    measurements: [],
    notes: [
      'El ajuste rápido Trim D/E depende de la condición de la materia prima en ese momento.',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-28.jpg', caption: 'Ajuste normal y rápido Trim D' }, { url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-29.jpg', caption: 'Ajuste Trim E' }],
  },
  {
    id: 'ts-gay-ping-cola',
    title: 'Gay Ping Zona Cola / Aleta Anal',
    order: 21,
    type: 'troubleshooting',
    description: 'Gay ping debajo del esquelon en la zona de la cola o aleta anal.',
    steps: [
      { text: 'Verificar diámetro de cuchillos ventrales: deben ser los de mayor diámetro, lo más cercano a 200mm.', important: true },
      { text: 'Verificar calidad del filo de cuchillos ventrales: debe estar en excelente estado.' },
      { text: 'Verificar separación entre cuchillos ventrales y dorsales: máximo 12mm.' },
      { text: 'Verificar presión de resortes de guías flotantes, o si alguno está quebrado.' },
      { text: 'Verificar accionamiento de la leva del mando dorsal: que no esté levantando antes de lo normal.' },
      { text: 'Para el caso de aleta anal: agregar abertura de la guía flotante en relación a los cuchillos ventrales como referencia 4.8mm + 30.' },
    ],
    measurements: [
      { name: 'Diámetro cuchillos ventrales (objetivo)', value: '~200', unit: 'mm' },
      { name: 'Separación ventrales vs dorsales (máximo)', value: '12', unit: 'mm' },
      { name: 'Referencia abertura guía flotante (aleta anal)', value: '4.8+30', unit: 'mm' },
    ],
    notes: [
      'Los cuchillos ventrales de mayor diámetro deben estar instalados (más cercano a 200mm).',
    ],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-30.jpg', caption: 'Gay ping zona cola / aleta anal' }],
  },
  {
    id: 'ts-colgajo-esquelon',
    title: 'Colgajo en Zona de la Línea del Esquelon',
    order: 22,
    type: 'troubleshooting',
    description: 'Presencia de colgajo en la línea del esquelon del filete.',
    steps: [
      { text: 'Verificar filo y abertura de cuchillos de punta.', important: true },
      { text: 'Verificar abertura de desviadores en cuchillos de cola.' },
      { text: 'Verificar abertura y filo de cuchillos de cola.' },
    ],
    measurements: [],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-31.jpg', caption: 'Colgajo en línea del esquelón' }],
  },
  {
    id: 'ts-exceso-aleta-anal',
    title: 'Exceso de Aleta Anal (Lado Izquierdo o Derecho)',
    order: 23,
    type: 'troubleshooting',
    description: 'Exceso de aleta anal en uno o ambos lados del filete.',
    steps: [
      { text: 'Verificar alineamiento de guías flotantes.', important: true },
      { text: 'Verificar calidad de filo de cuchillos ventrales.' },
      { text: 'Verificar calidad de resortes de guías flotantes.' },
    ],
    measurements: [],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-32.jpg', caption: 'Exceso de aleta anal' }],
  },
  {
    id: 'ts-entrada-rapida',
    title: 'Entrada Pescado Demasiado Rápida (+ Condición mmpp)',
    order: 24,
    type: 'troubleshooting',
    description: 'Problemas causados por entrada demasiado rápida del pescado sumada a la condición de la materia prima.',
    steps: [
      { text: 'Verificar filo de cuchillos ventrales y dorsales.', important: true },
      { text: 'Verificar regulación de guías frontales.' },
      { text: 'Verificar accionamientos del mando dorsal.' },
    ],
    measurements: [],
    notes: [],
    images: [{ url: (import.meta.env.BASE_URL || '/') + 'baader200-manual/page-33.jpg', caption: 'Entrada pescado demasiado rápida' }],
  },
]

export const ALL_DEFAULT_SECTIONS = [
  ...DEFAULT_B200_SECTIONS,
  ...DEFAULT_B200_SECTIONS_PART2,
  ...DEFAULT_B200_TROUBLESHOOTING,
]

export async function seedB200Sections(userId: string): Promise<void> {
  for (const section of ALL_DEFAULT_SECTIONS) {
    await saveB200Section({ ...section, updatedBy: userId }, userId)
  }
  const order = ALL_DEFAULT_SECTIONS.map(s => s.id)
  await saveB200SectionOrder(order)
}
