/**
 * Script de Seed para cargar ETT de ejemplo
 * Crea 2 ETTs con la información exacta de los ejemplos originales
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'serviceAccountKey.json'), 'utf8')
)

initializeApp({
  credential: cert(serviceAccount)
})

const db = getFirestore()

// =====================================================
// ETT 1: PANELES ENTRETECHO EVISCERADO
// =====================================================
const ETT_PANELES = {
  general: {
    titulo: 'Reubicación tablero control - Paneles R.E. (PIR) Cielo Baader/Grader',
    codigo: 'ETT-2025-001',
    fecha: Timestamp.fromDate(new Date('2025-04-23')),
    solicitante: 'Dpto. Mantención Chonchi',
    responsable: 'Área Mandante',
    empresa: 'AquaChile',
    area: 'Planta de Procesos / Centro AI04 / Dirección Camino A Huicha S/N',
    descripcion_general: `Corresponde al sector de cielo indicado en las imágenes adjuntas, marcado con color amarillo. La superficie a intervenir corresponde a la cubierta del área de trabajo sobre las líneas de procesamiento Baader y Grader.

Se requiere:
- Desmontar los paneles existentes con cuidado
- Instalar los nuevos paneles asegurando alineación, nivel y correcta fijación estructural
- Garantizar condiciones de seguridad industrial
- Retiro de escombros y paneles antiguos`,
    observaciones: `CONSIDERACIONES PREVIAS:
• Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.
• La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia.
• Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios.
• Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.
• Se considerará la realización de visita en terreno.

GARANTÍA EXIGIDA: 06 (meses) Garantía Temporada Alta`
  },
  trabajo_descripcion: `ESPECIFICACIÓN DEL SERVICIO:

Área de intervención:
Corresponde al sector de cielo indicado en las imágenes adjuntas, marcado con color amarillo. La superficie a intervenir corresponde a la cubierta del área de trabajo sobre las líneas de procesamiento Baader y Grader.

Paneles R.E. (PIR) - Cielo Baader / Grader:
- Largo: 12 M
- Ancho: 1.15 M
- Espesor: 100 mm
- Cantidad: 19 unidades

No se incluyen elementos de montaje, por lo tanto, el contratista deberá proporcionar:
• Cadenas de suspensión
• Tensores
• "Gorros chinos" M10
• Ángulo metálico de soporte u otra estructura necesaria para el montaje seguro

Responsabilidades del contratista:
• Desmontar los paneles existentes con cuidado, evitando dañar equipos eléctricos, redes de tuberías o estructuras adyacentes.
• Instalar los nuevos paneles asegurando alineación, nivel y correcta fijación estructural.
• Garantizar condiciones de seguridad industrial y orden en el lugar durante y después de la faena.
• Retiro de escombros y paneles antiguos del lugar de trabajo.`,
  materiales: [
    {
      id: 'mat-1',
      nombre: 'Paneles R.E. (PIR)',
      descripcion: 'Paneles de cielo para área Baader/Grader',
      cantidad: 19,
      unidad: 'unidades',
      especificaciones: 'Largo: 12m, Ancho: 1.15m, Espesor: 100mm',
      notas: 'Paneles tipo PIR (Poliisocianurato)'
    },
    {
      id: 'mat-2',
      nombre: 'Cadenas de suspensión',
      descripcion: 'Para montaje de paneles',
      cantidad: 38,
      unidad: 'unidades',
      especificaciones: 'Acero galvanizado, capacidad según carga de paneles',
      notas: 'Suministrado por contratista'
    },
    {
      id: 'mat-3',
      nombre: 'Tensores',
      descripcion: 'Para ajuste de cadenas',
      cantidad: 38,
      unidad: 'unidades',
      especificaciones: 'Compatibles con cadenas de suspensión',
      notas: 'Suministrado por contratista'
    },
    {
      id: 'mat-4',
      nombre: 'Gorros chinos M10',
      descripcion: 'Elementos de fijación',
      cantidad: 76,
      unidad: 'unidades',
      especificaciones: 'M10, acero galvanizado',
      notas: 'Suministrado por contratista'
    },
    {
      id: 'mat-5',
      nombre: 'Ángulo metálico de soporte',
      descripcion: 'Estructura para montaje seguro',
      cantidad: 1,
      unidad: 'lote',
      especificaciones: 'Según diseño estructural necesario',
      notas: 'Suministrado por contratista'
    }
  ],
  procedimientos: [
    {
      id: 'proc-1',
      numero: 1,
      titulo: 'Preparación del área de trabajo',
      descripcion: 'Delimitar zona de trabajo con señalización. Verificar que el área esté despejada de personal no autorizado. Instalar protecciones para equipos eléctricos y tuberías.',
      tiempo_estimado: '2 horas',
      precauciones: 'Coordinar con área de producción para evitar interferencias',
      personal_requerido: 2,
      notas: 'Verificar habilitación en plataforma Ksec'
    },
    {
      id: 'proc-2',
      numero: 2,
      titulo: 'Desmontaje de paneles existentes',
      descripcion: 'Retirar cuidadosamente los paneles existentes evitando dañar equipos eléctricos, redes de tuberías o estructuras adyacentes. Clasificar material para retiro.',
      tiempo_estimado: '8 horas',
      precauciones: 'Usar arnés de seguridad. No dañar instalaciones eléctricas ni tuberías.',
      personal_requerido: 4,
      notas: 'Trabajos en altura'
    },
    {
      id: 'proc-3',
      numero: 3,
      titulo: 'Instalación de estructura de soporte',
      descripcion: 'Montar ángulos metálicos, cadenas de suspensión y tensores según diseño estructural aprobado.',
      tiempo_estimado: '6 horas',
      precauciones: 'Verificar capacidad de carga de estructura existente',
      personal_requerido: 3,
      notas: 'Requiere aprobación de ingeniería'
    },
    {
      id: 'proc-4',
      numero: 4,
      titulo: 'Instalación de nuevos paneles',
      descripcion: 'Instalar los 19 paneles R.E. (PIR) asegurando alineación, nivel y correcta fijación estructural. Usar gorros chinos M10 para fijación.',
      tiempo_estimado: '12 horas',
      precauciones: 'Verificar nivelación. Asegurar fijación correcta antes de soltar.',
      personal_requerido: 4,
      notas: '19 paneles de 12m x 1.15m x 100mm'
    },
    {
      id: 'proc-5',
      numero: 5,
      titulo: 'Limpieza y entrega',
      descripcion: 'Retiro de escombros y paneles antiguos. Limpieza completa del área. Segregación de residuos en tolvas correspondientes.',
      tiempo_estimado: '4 horas',
      precauciones: 'Cumplir normas de protección de alimentos',
      personal_requerido: 2,
      notas: 'Entrega para recepción del servicio'
    }
  ],
  riesgos: [
    {
      id: 'riesgo-1',
      peligro: 'Caída de altura durante desmontaje/montaje de paneles',
      probabilidad: 'media',
      consecuencia: 'grave',
      medidas_preventivas: 'Uso obligatorio de arnés de seguridad con línea de vida. Plataformas de trabajo estables. Capacitación en trabajos en altura.',
      equipos_seguridad: ['Arnés de seguridad', 'Línea de vida', 'Casco con barbiquejo']
    },
    {
      id: 'riesgo-2',
      peligro: 'Golpes por caída de materiales',
      probabilidad: 'media',
      consecuencia: 'grave',
      medidas_preventivas: 'Delimitar área de trabajo. No transitar bajo cargas suspendidas. Uso de redes de protección.',
      equipos_seguridad: ['Casco de seguridad', 'Zapatos de seguridad', 'Guantes']
    },
    {
      id: 'riesgo-3',
      peligro: 'Contacto eléctrico',
      probabilidad: 'baja',
      consecuencia: 'muy_grave',
      medidas_preventivas: 'Desenergizar instalaciones eléctricas cercanas. Verificar ausencia de tensión. Bloqueo y etiquetado (LOTO).',
      equipos_seguridad: ['Guantes dieléctricos', 'Calzado dieléctrico']
    },
    {
      id: 'riesgo-4',
      peligro: 'Contaminación de productos alimenticios',
      probabilidad: 'media',
      consecuencia: 'grave',
      medidas_preventivas: 'Cumplir normas de buenas prácticas de protección de alimentos. Uso de cofia y mascarilla. Limpieza continua.',
      equipos_seguridad: ['Cofia', 'Mascarilla', 'Ropa de trabajo limpia']
    }
  ],
  adjuntos: [],
  createdBy: 'seed-script',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  estado: 'borrador'
}

// =====================================================
// ETT 2: CAMBIO COLLARINES 90 Y 75 MM
// =====================================================
const ETT_COLLARINES = {
  general: {
    titulo: 'Cambio y estandarización de collarines, piping y mejoras en líneas de agua – Planta Principal',
    codigo: 'ETT-2025-002',
    fecha: Timestamp.fromDate(new Date('2025-06-02')),
    solicitante: 'Dpto. Mantención Chonchi',
    responsable: 'Área Mandante',
    empresa: 'AquaChile',
    area: 'Planta de Procesos / Centro AI04 / Dirección Camino A Huicha S/N',
    descripcion_general: `Área de intervención: Entretecho de planta principal.
Líneas de tuberías PVC hidráulico, con diámetros 90mm y 75mm.

Se requiere cambio de collarines existentes por nuevos collarines estandarizados:
- 45 unidades collarín 90mm salida 32mm
- 45 unidades collarín 75mm salida 32mm

Instalación de piping completo asociado a cada collarín nuevo.
Mejoras solicitadas en líneas troncales (75mm y 90mm).`,
    observaciones: `CONSIDERACIONES PREVIAS:
• Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.
• La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia.
• Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios.
• Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.
• Se considerará la realización de visita en terreno.

GARANTÍA EXIGIDA: 06 (meses) Garantía Temporada Alta`
  },
  trabajo_descripcion: `ESPECIFICACIÓN DEL SERVICIO:

Área de intervención:
Entretecho de planta principal (ver imágenes adjuntas).
Líneas de tuberías PVC hidráulico, con diámetros 90mm y 75mm.

Descripción de los trabajos solicitados:

1. Cambio de collarines existentes por nuevos collarines estandarizados:
   • 45 unidades collarín 90mm salida 32mm
   • 45 unidades collarín 75mm salida 32mm

2. Instalación de piping completo asociado a cada collarín nuevo:
   • Terminal hembra 32mm
   • Tramo de tubería PVC hidráulico 32mm
   • Codo 90° PVC 32mm HI
   • Bajada completa en PVC hidráulico 32mm hasta la llave de corte más cercana
   • Varios asociados a la instalación propiamente tal de los collarines

3. Mejoras solicitadas en líneas troncales (75mm y 90mm):
   • Instalación de nuevas llaves de corte (75mm y 90mm) para seccionar por tramos
   • Instalación de collarines de despiche con llave de corte y elementos asociados como tubería PVC para vaciado de líneas al intervenir

Responsabilidades del contratista:
• Retiro de collarines actuales y piping antiguo evitando dañar estructuras
• Instalación de nuevos elementos cumpliendo nivelación, fijación y sellado
• Revisión de estanqueidad en todas las conexiones
• Entrega de documentación final esquemática de intervenciones y nuevas conexiones instaladas
• Limpieza del área intervenida y retiro de residuos
• Cumplir normativa sanitaria y de inocuidad vigente`,
  materiales: [
    {
      id: 'mat-1',
      nombre: 'Collarín 90mm salida 32mm',
      descripcion: 'Collarín estandarizado para tubería PVC 90mm',
      cantidad: 45,
      unidad: 'unidades',
      especificaciones: 'PVC hidráulico, salida 32mm, presión nominal según norma',
      notas: 'Incluye elementos de sellado'
    },
    {
      id: 'mat-2',
      nombre: 'Collarín 75mm salida 32mm',
      descripcion: 'Collarín estandarizado para tubería PVC 75mm',
      cantidad: 45,
      unidad: 'unidades',
      especificaciones: 'PVC hidráulico, salida 32mm, presión nominal según norma',
      notas: 'Incluye elementos de sellado'
    },
    {
      id: 'mat-3',
      nombre: 'Terminal hembra 32mm',
      descripcion: 'Para conexión de piping',
      cantidad: 90,
      unidad: 'unidades',
      especificaciones: 'PVC hidráulico 32mm',
      notas: 'Uno por cada collarín'
    },
    {
      id: 'mat-4',
      nombre: 'Tubería PVC hidráulico 32mm',
      descripcion: 'Para bajadas y conexiones',
      cantidad: 200,
      unidad: 'metros',
      especificaciones: 'PVC hidráulico clase 10, 32mm diámetro',
      notas: 'Cantidad estimada, ajustar según medición en terreno'
    },
    {
      id: 'mat-5',
      nombre: 'Codo 90° PVC 32mm HI',
      descripcion: 'Codo hembra interior',
      cantidad: 90,
      unidad: 'unidades',
      especificaciones: 'PVC hidráulico 32mm, ángulo 90°',
      notas: 'Uno por cada collarín'
    },
    {
      id: 'mat-6',
      nombre: 'Llaves de corte 90mm',
      descripcion: 'Para seccionamiento de líneas troncales',
      cantidad: 8,
      unidad: 'unidades',
      especificaciones: 'Válvula de bola PVC 90mm, operación manual',
      notas: 'Mejora en líneas troncales'
    },
    {
      id: 'mat-7',
      nombre: 'Llaves de corte 75mm',
      descripcion: 'Para seccionamiento de líneas troncales',
      cantidad: 8,
      unidad: 'unidades',
      especificaciones: 'Válvula de bola PVC 75mm, operación manual',
      notas: 'Mejora en líneas troncales'
    },
    {
      id: 'mat-8',
      nombre: 'Collarines de despiche',
      descripcion: 'Con llave de corte para vaciado de líneas',
      cantidad: 16,
      unidad: 'unidades',
      especificaciones: 'Con válvula integrada para despiche',
      notas: 'Para vaciado de líneas al intervenir'
    },
    {
      id: 'mat-9',
      nombre: 'Pegamento PVC',
      descripcion: 'Adhesivo para uniones PVC',
      cantidad: 10,
      unidad: 'litros',
      especificaciones: 'Para tubería presión, secado rápido',
      notas: 'Incluye limpiador'
    },
    {
      id: 'mat-10',
      nombre: 'Teflón y sellador',
      descripcion: 'Para conexiones roscadas',
      cantidad: 1,
      unidad: 'lote',
      especificaciones: 'Teflón industrial + sellador de roscas',
      notas: 'Cantidad suficiente para 90 conexiones'
    }
  ],
  procedimientos: [
    {
      id: 'proc-1',
      numero: 1,
      titulo: 'Preparación y planificación',
      descripcion: 'Revisar planos existentes. Identificar y marcar collarines a reemplazar. Planificar secuencia de trabajo por tramos. Coordinar cortes de agua.',
      tiempo_estimado: '4 horas',
      precauciones: 'Verificar habilitación en plataforma Ksec. Coordinar con producción.',
      personal_requerido: 2,
      notas: 'Elaborar cronograma de intervención'
    },
    {
      id: 'proc-2',
      numero: 2,
      titulo: 'Instalación de llaves de seccionamiento',
      descripcion: 'Instalar nuevas llaves de corte en líneas troncales de 75mm y 90mm para permitir seccionamiento por tramos. Incluye collarines de despiche.',
      tiempo_estimado: '8 horas',
      precauciones: 'Corte de agua general. Despresurizar líneas antes de intervenir.',
      personal_requerido: 3,
      notas: '16 llaves de corte + 16 collarines de despiche'
    },
    {
      id: 'proc-3',
      numero: 3,
      titulo: 'Retiro de collarines existentes',
      descripcion: 'Cerrar válvula del tramo. Despresurizar mediante collarín de despiche. Retirar collarines antiguos y piping asociado evitando dañar estructuras.',
      tiempo_estimado: '16 horas',
      precauciones: 'Verificar ausencia de presión. Contener derrames de agua.',
      personal_requerido: 3,
      notas: 'Trabajar por tramos según seccionamiento'
    },
    {
      id: 'proc-4',
      numero: 4,
      titulo: 'Instalación de nuevos collarines',
      descripcion: 'Instalar collarines nuevos (45 de 90mm + 45 de 75mm). Asegurar sellado correcto. Instalar terminal hembra 32mm en cada salida.',
      tiempo_estimado: '20 horas',
      precauciones: 'Verificar alineación. Respetar tiempos de curado del pegamento.',
      personal_requerido: 4,
      notas: '90 collarines total'
    },
    {
      id: 'proc-5',
      numero: 5,
      titulo: 'Instalación de piping de bajada',
      descripcion: 'Instalar tubería PVC 32mm, codos 90° y bajadas completas hasta llaves de corte existentes. Usar pegamento PVC y sellador.',
      tiempo_estimado: '24 horas',
      precauciones: 'Asegurar pendientes correctas. Soportar tuberías adecuadamente.',
      personal_requerido: 4,
      notas: 'Aproximadamente 200m de tubería'
    },
    {
      id: 'proc-6',
      numero: 6,
      titulo: 'Pruebas de estanqueidad',
      descripcion: 'Realizar prueba de presión por tramos. Verificar ausencia de fugas en todas las conexiones nuevas. Reparar si es necesario.',
      tiempo_estimado: '8 horas',
      precauciones: 'Presurizar gradualmente. Inspeccionar cada conexión.',
      personal_requerido: 2,
      notas: 'Documentar resultados de pruebas'
    },
    {
      id: 'proc-7',
      numero: 7,
      titulo: 'Documentación y entrega',
      descripcion: 'Elaborar documentación esquemática de intervenciones. Registrar ubicación de nuevas válvulas y conexiones. Limpieza del área.',
      tiempo_estimado: '4 horas',
      precauciones: 'Cumplir normativa sanitaria en limpieza',
      personal_requerido: 2,
      notas: 'Entrega de planos actualizados'
    }
  ],
  riesgos: [
    {
      id: 'riesgo-1',
      peligro: 'Caída de altura en trabajos en entretecho',
      probabilidad: 'media',
      consecuencia: 'grave',
      medidas_preventivas: 'Uso obligatorio de arnés de seguridad. Verificar resistencia de superficies de trabajo. Iluminación adecuada.',
      equipos_seguridad: ['Arnés de seguridad', 'Línea de vida', 'Casco con barbiquejo', 'Linterna']
    },
    {
      id: 'riesgo-2',
      peligro: 'Contacto con agua a presión',
      probabilidad: 'media',
      consecuencia: 'leve',
      medidas_preventivas: 'Despresurizar líneas antes de intervenir. Verificar cierre de válvulas. Usar collarines de despiche.',
      equipos_seguridad: ['Ropa impermeable', 'Lentes de seguridad', 'Guantes']
    },
    {
      id: 'riesgo-3',
      peligro: 'Exposición a vapores de pegamento PVC',
      probabilidad: 'alta',
      consecuencia: 'leve',
      medidas_preventivas: 'Ventilación adecuada del área. Uso de mascarilla con filtro. Rotación de personal.',
      equipos_seguridad: ['Mascarilla con filtro orgánico', 'Guantes de nitrilo', 'Lentes de seguridad']
    },
    {
      id: 'riesgo-4',
      peligro: 'Contaminación de productos alimenticios',
      probabilidad: 'media',
      consecuencia: 'grave',
      medidas_preventivas: 'Cumplir normativa sanitaria y de inocuidad vigente. Limpieza continua. Uso de cofia y mascarilla.',
      equipos_seguridad: ['Cofia', 'Mascarilla', 'Ropa de trabajo limpia', 'Guantes']
    },
    {
      id: 'riesgo-5',
      peligro: 'Cortes con herramientas de corte de tubería',
      probabilidad: 'media',
      consecuencia: 'leve',
      medidas_preventivas: 'Uso de cortadores de tubería adecuados. Verificar filo de herramientas. Concentración en la tarea.',
      equipos_seguridad: ['Guantes anticorte', 'Lentes de seguridad']
    }
  ],
  adjuntos: [],
  createdBy: 'seed-script',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  estado: 'borrador'
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================
async function seedETT() {
  console.log('🚀 Iniciando carga de ETT de ejemplo...\n')

  try {
    // Crear ETT 1: Paneles
    console.log('📄 Creando ETT 1: Paneles Entretecho Eviscerado...')
    const docRef1 = await db.collection('ett').add(ETT_PANELES)
    console.log(`   ✅ Creada con ID: ${docRef1.id}`)

    // Crear ETT 2: Collarines
    console.log('📄 Creando ETT 2: Cambio Collarines 90/75mm...')
    const docRef2 = await db.collection('ett').add(ETT_COLLARINES)
    console.log(`   ✅ Creada con ID: ${docRef2.id}`)

    console.log('\n' + '='.repeat(60))
    console.log('✅ SEED COMPLETADO')
    console.log('='.repeat(60))
    console.log(`\n📊 Resumen:`)
    console.log(`   - ETT 1 (Paneles): ${ETT_PANELES.materiales.length} materiales, ${ETT_PANELES.procedimientos.length} procedimientos, ${ETT_PANELES.riesgos.length} riesgos`)
    console.log(`   - ETT 2 (Collarines): ${ETT_COLLARINES.materiales.length} materiales, ${ETT_COLLARINES.procedimientos.length} procedimientos, ${ETT_COLLARINES.riesgos.length} riesgos`)
    console.log('\n🔗 IDs creados:')
    console.log(`   - ${docRef1.id}`)
    console.log(`   - ${docRef2.id}`)
    console.log('\n💡 Ahora puedes abrir la app y verificar las ETTs en /admin/ett')
    console.log('   Luego exporta a Word y PDF para comparar con los originales.\n')

  } catch (error) {
    console.error('❌ Error en seed:', error)
    process.exit(1)
  }

  process.exit(0)
}

seedETT()
