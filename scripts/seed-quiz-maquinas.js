#!/usr/bin/env node
/**
 * Seed: Evaluaciones (quiz) por MAQUINA del Centro de Aprendizaje.
 *
 * Escribe learningContent/{slug}/quiz/{id} (QuizQuestion: question, options[],
 * correctIndex, explanation, order, createdAt, updatedAt) — el mismo path que
 * lee listQuiz() y edita el panel admin.
 *
 * Fuente de los hechos: _CONTEXTO_APRENDIZAJE.md de cada equipo en OneDrive
 * (curado desde los grupos Telegram, verificado 2026-07-24) + manual publicado
 * en el modulo (Grader). NO se invento contenido: las maquinas con contexto
 * pobre (marel-filete, baader-200, fishken, detector-metales) llevan quiz
 * corto; se amplia cuando se curen sus PDF/videos.
 *
 * SEGURIDAD: ninguna pregunta revela claves de servicio (el quiz es publico;
 * las claves viven solo en "Consulta rapida", enmascaradas sin sesion).
 *
 * Idempotente: docId deterministico (q01..), setDoc por id; re-correr no duplica.
 *
 * Uso:
 *   node scripts/seed-quiz-maquinas.js --dry-run
 *   node scripts/seed-quiz-maquinas.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const isDryRun = process.argv.slice(2).includes('--dry-run');
const BASE = Date.parse('2026-07-24T12:00:00-04:00');

const QUIZ = {
  grader: [
    {
      question: '¿Qué le pasa a un pescado cuyo peso/calidad no tiene ninguna compuerta asignada?',
      options: [
        'Se detiene la cinta y suena la alarma',
        'Sigue hasta el punto cero (P0) y se clasifica a mano',
        'Se vuelve a pesar automáticamente',
        'Cae al primer flipper libre',
      ],
      correctIndex: 1,
      explanation: 'P0 = "no había compuerta para ese peso/calidad". Es trabajo manual y es el KPI de rechazo que mira Mantención: distingue un problema de configuración de uno mecánico.',
    },
    {
      question: '¿Cuál es el rango de pesaje del clasificador MS4/12?',
      options: ['0 – 5 kg', '0 – 15 kg', '0 – 30 kg', 'Sin límite'],
      correctIndex: 1,
      explanation: 'El MS4/12 pesa de 0 a 15 kg, con precisión ±20 g entre 0–5 kg y ±50 g entre 5–15 kg.',
    },
    {
      question: '¿Cuál es la precisión del pesaje entre 0 y 5 kg?',
      options: ['±5 g', '±20 g', '±50 g', '±100 g'],
      correctIndex: 1,
      explanation: '±20 g entre 0–5 kg; sobre 5 kg y hasta 15 kg la tolerancia es ±50 g.',
    },
    {
      question: 'En la calibración de básculas por "Explorar can bus", después de tarar con ">0<", ¿qué peso patrón se coloca sobre el pocket?',
      options: ['1 kg', '2 kg', '5 kg', '10 kg'],
      correctIndex: 2,
      explanation: 'La secuencia usa peso patrón de 5 kg (5.000): tara ">0<", peso 5.000, Ok, retirar, ">0<", Ok — según SOP CH-MT-ME-0002.',
    },
    {
      question: 'Al terminar la calibración, ¿qué se hace inmediatamente después de guardar los parámetros con la clave?',
      options: [
        'Pasar producto de prueba',
        'Reiniciar el equipo desde la botonera',
        'Cambiar el parámetro fsWc',
        'Nada, queda operativo al instante',
      ],
      correctIndex: 1,
      explanation: 'Tras aplicar la clave de guardado en "Cambiar parámetros", el equipo se reinicia desde la botonera para que los parámetros queden activos.',
    },
    {
      question: '¿Dónde vive el parámetro fino de calibración fsWc en el menú del Z2?',
      options: [
        'Servicio › Explorar can bus › Pocket',
        'Servicio › Cambiar parámetros › Static Grader › ZBelt › Pocket [1–4]',
        'Configuración › Básculas › Ajuste fino',
        'Producción › Calibres › fsWc',
      ],
      correctIndex: 1,
      explanation: 'fsWc está en MENU › Servicio › Cambiar parámetros › Static Grader › ZBelt › Pocket [1–4]. La calibración con peso patrón, en cambio, va por Explorar can bus.',
    },
    {
      question: 'Si necesitas que un flipper abra ANTES, ¿qué haces con su distancia?',
      options: ['Subir la distancia', 'Bajar la distancia', 'No se puede ajustar', 'Cambiar la velocidad de cinta'],
      correctIndex: 1,
      explanation: 'Bajar dist → el flipper abre antes; subir dist → abre después. Es el criterio anotado del equipo.',
    },
    {
      question: '¿Qué riesgo trae pasar producto más grande que 1100 × 290 mm o fuera del rango de peso?',
      options: [
        'Ninguno, el equipo lo rechaza solo',
        'La lectura se degrada y sube el rechazo a P0',
        'Se activa la parada de emergencia',
        'El flipper se bloquea mecánicamente',
      ],
      correctIndex: 1,
      explanation: 'Producto fuera de especificación degrada el pesaje y aumenta el rechazo al punto cero — antes de calibrar, revisa si el problema es el producto.',
    },
    {
      question: '¿Cuál es la velocidad máxima de la cinta clasificadora?',
      options: ['0,5 m/s', '1,4 m/s', '2,0 m/s', '3,0 m/s'],
      correctIndex: 1,
      explanation: 'La cinta llega hasta 1,4 m/s. Combinado con el rango de pesaje (0–15 kg) define la ventana de operación normal.',
    },
    {
      question: '¿Quién es el distribuidor/fabricante del clasificador MS4/12 instalado en planta?',
      options: ['Marel Chile', 'Marelec Chile · Puerto Montt', 'GEA Chile', 'Baader Chile'],
      correctIndex: 1,
      explanation: 'El Grader es Marelec (controlador Z2), distribuido en Chile por Marelec Chile desde Puerto Montt — no confundir con Marel (otro fabricante, otras máquinas de la línea).',
    },
    {
      question: '¿De qué material está construido el clasificador?',
      options: [
        'Acero inoxidable AISI 304 + plásticos aptos para alimentos',
        'Acero al carbono pintado',
        'Aluminio anodizado',
        'Acero galvanizado',
      ],
      correctIndex: 0,
      explanation: 'Acero inox AISI 304 + plásticos food-grade, estándar para equipos en contacto con alimento.',
    },
  ],

  'marel-hg': [
    {
      question: 'En la calibración dinámica, ¿cuál es la desviación estándar máxima tolerable?',
      options: ['2 gramos', '5 gramos', '10 gramos', '20 gramos'],
      correctIndex: 1,
      explanation: 'La desviación estándar debe ser siempre menor a 5 gramos. Si está sobre eso, hay que corregir.',
    },
    {
      question: 'Si la desviación estándar NO se corrige con el procedimiento normal de contrastación, ¿qué se corrige?',
      options: ['La tara de la báscula', 'El factor dinámico', 'La velocidad de la línea', 'El offset del sensor'],
      correctIndex: 1,
      explanation: 'Cuando contrastar no basta, se corrige el factor dinámico — y eso se hace solo en el menú web service.',
    },
    {
      question: '¿En qué menú se modifica el factor dinámico?',
      options: ['Menú Operador', 'Menú Servicio estándar', 'Menú web service', 'Menú Producción'],
      correctIndex: 2,
      explanation: 'El factor dinámico solo se toca en el menú web service, y únicamente si la desviación no se corrigió por la vía normal.',
    },
    {
      question: '¿Cuál es el orden correcto del procedimiento de contrastación?',
      options: [
        'Calibración dinámica → contrastar → listo',
        'Contrastar → calibración dinámica → volver a contrastar para verificar',
        'Contrastar dos veces seguidas → calibración dinámica',
        'Calibración dinámica → reiniciar → contrastar',
      ],
      correctIndex: 1,
      explanation: 'Siempre: contrastar, presionar calibración dinámica, y volver a contrastar para verificar el resultado.',
    },
    {
      question: '¿Cuántas lecturas se consideran una muestra normal en la calibración dinámica?',
      options: ['5-10 lecturas', '25-30-40 lecturas', '100+ lecturas', '3 lecturas'],
      correctIndex: 1,
      explanation: 'La muestra normal es de 25-30-40 lecturas; con 10-15-20 lecturas iguales en la columna "calidad" ya es una buena muestra.',
    },
    {
      question: 'En la tara de las básculas manuales, ¿cómo se entra al menú?',
      options: [
        'Presionando dos veces la tecla del ticket',
        'Manteniendo presionado el botón "libro" hasta que salga el menú',
        'Apagando y prendiendo la báscula',
        'Con la tecla clear sostenida',
      ],
      correctIndex: 1,
      explanation: 'Se mantiene presionado el botón "libro", luego opción 5, ok (tecla del ticket ✔), clear, ingresar 0,00 y validar con ✔.',
    },
    {
      question: '¿Qué se puede activar manualmente desde el menú Servicio del Marel HG?',
      options: [
        'La velocidad del Baader',
        'Los flippers de entrada al Baader',
        'El programa de limpieza',
        'La presión de vacío',
      ],
      correctIndex: 1,
      explanation: 'Desde Servicio del Marel se activan manualmente los flippers de entrada al Baader — útil para pruebas sin producto.',
    },
    {
      question: 'Al tarar una báscula manual, ¿con qué botón se ingresa la coma del valor 0,00?',
      options: [
        'Con la tecla clear',
        'Con el 4º botón azul circular (de izquierda a derecha) bajo la pantalla',
        'No se ingresa coma, es automática',
        'Con la tecla del ticket',
      ],
      correctIndex: 1,
      explanation: 'La coma se ingresa con el 4º botón azul circular bajo la pantalla, contando de izquierda a derecha.',
    },
    {
      question: 'Después de entrar a la opción 5 del menú "libro" en la báscula manual, ¿qué sigue en la secuencia?',
      options: [
        'Ok (tecla del ticket) → clear → ingresar 0,00 → validar con ✔',
        'Apagar y prender la báscula',
        'Ingresar 0,00 directo sin confirmar nada más',
        'Salir inmediatamente sin guardar',
      ],
      correctIndex: 0,
      explanation: 'Opción 5 → ok (tecla del ticket ✔) → clear → 0,00 → validar con ✔ → salir con el "librito". Saltarse un paso deja la tara mal cargada.',
    },
    {
      question: '¿Qué manuales de respaldo existen para el Marel HG A600?',
      options: [
        'A600 User Manual (ES) y M-Weigher User Manual (SPA)',
        'Solo un PDF genérico de Marel',
        'No hay manuales digitalizados',
        'Manual Marelec Z2',
      ],
      correctIndex: 0,
      explanation: 'El expediente del equipo tiene el A600 User Manual en español y el M-Weigher User Manual en español como respaldo.',
    },
  ],

  'marel-filete': [
    {
      question: '¿Qué modelo es la báscula dinámica de la línea de filete?',
      options: ['Marel A600 M3310', 'Marel M6410', 'Marelec MS4/12', 'Marel M-2200'],
      correctIndex: 1,
      explanation: 'La báscula dinámica de filete es la Marel M6410; la A600 M3310 es el HG de eviscerado.',
    },
    {
      question: '¿Qué dos tipos de calibración tiene registrados el equipo en su procedimiento?',
      options: [
        'Dinámica y estática',
        'Rápida y profunda',
        'De fábrica y de terreno',
        'Solo dinámica',
      ],
      correctIndex: 0,
      explanation: 'El procedimiento registrado del equipo cubre calibración dinámica y calibración estática (video del expediente, 2025-07).',
    },
    {
      question: '¿Qué manuales de respaldo tiene el equipo en su expediente?',
      options: [
        'SmartLine y M-Weigher WTR',
        'Solo el manual del fabricante en inglés',
        'Manual Marelec Z2',
        'No tiene manuales digitalizados',
      ],
      correctIndex: 0,
      explanation: 'En el expediente están SmartLine UM v1.14 SPA, M-Weigher WTR UM v1.02 SPA y el TD del GR8251/GR8252.',
    },
  ],

  'baader-142': [
    {
      question: '¿En qué programa de la máquina se chequean los ajustes de punto cero de las herramientas?',
      options: ['Programa de producción', 'Programa de limpieza', 'Modo manual', 'Programa de mantención'],
      correctIndex: 1,
      explanation: 'Los puntos cero de las herramientas se verifican con la máquina en el programa de limpieza.',
    },
    {
      question: 'En la rutina de punto cero, ¿qué se ajusta PRIMERO?',
      options: [
        'La cuchilla ventral',
        'El carro a la chapaleta de entrada',
        'El expulsador de pescados',
        'El palpador de altura',
      ],
      correctIndex: 1,
      explanation: 'El orden parte por el carro a la chapaleta de entrada, sigue medidor de longitud, palpador de altura, centrador, punzón/dedos, cuchilla ventral y termina en el expulsador.',
    },
    {
      question: '¿Cuál es la función del ajuste del carro a la chapaleta de entrada?',
      options: [
        'Es donde llega la cola del salmón para que la tome la mordaza',
        'Fija la altura del lomo',
        'Alinea la cabeza con la cuchilla',
        'Regula la presión del excavador',
      ],
      correctIndex: 0,
      explanation: 'A la chapaleta de entrada llega la cola del salmón; el ajuste asegura que la mordaza del carro la tome bien.',
    },
    {
      question: 'La correa 800-5M de 25 mm de ancho corresponde a…',
      options: [
        'Las Baader 142 antiguas',
        'Las Baader 142 nuevas',
        'Todas las Baader 142 por igual',
        'La Baader 200',
      ],
      correctIndex: 1,
      explanation: 'La 800-5M de 25 mm (SAP 3300084243) es de las 142 nuevas; la de 15 mm (SAP 3300011872) es la otra variante. Verificar generación antes de pedir.',
    },
    {
      question: '¿Los sensores de puerta son iguales en todas las Baader 142?',
      options: [
        'Sí, es el mismo sensor en todas',
        'No: las nuevas usan 42303080/42303081 y la antigua 42303088/42303087',
        'Solo cambia el largo del cable',
        'Las antiguas no llevan sensores de puerta',
      ],
      correctIndex: 1,
      explanation: 'Difieren por generación: nuevas = 42303080 (lado cable) y 42303081 (lado imán); antigua = 42303088 y 42303087.',
    },
    {
      question: '¿Qué características tiene el motor de la bomba helicoidal del tacho de repaso?',
      options: [
        'Reducción 21,81:1 y 0,75 kW',
        'Reducción 10:1 y 1,5 kW',
        'Motor directo sin reducción, 0,55 kW',
        'Reducción 30:1 y 2,2 kW',
      ],
      correctIndex: 0,
      explanation: 'El motorreductor de la bomba helicoidal es i = 21,81:1 con 0,75 kW.',
    },
    {
      question: '¿Cuál es el último ajuste de la rutina de punto cero, después de la cuchilla ventral?',
      options: [
        'El centrador',
        'El expulsador de pescados',
        'El palpador de altura',
        'El carro a la chapaleta de entrada',
      ],
      correctIndex: 1,
      explanation: 'El orden completo: carro-chapaleta → medidor de longitud → palpador de altura → centrador → punzón y dedos palpadores → cuchilla ventral → expulsador de pescados (último).',
    },
    {
      question: '¿A qué código SAP corresponde el resorte del excavador A en la caja de accionamiento?',
      options: ['3300012041', '3300106055', '3300012257', '3300084243'],
      correctIndex: 0,
      explanation: 'El resorte del excavador A (biela de mando, caja de accionamiento) es SAP 3300012041. No confundir con el resorte de tracción del carro (3300106055).',
    },
  ],

  'baader-200': [
    {
      question: 'Según la regla de la máquina, un tornillo/tuerca CON muesca…',
      options: [
        'Se saca en sentido horario y se pone antihorario',
        'Se saca antihorario y se pone horario',
        'Se saca y se pone en sentido horario',
        'No se debe tocar en terreno',
      ],
      correctIndex: 0,
      explanation: 'Con muesca: se saca horario / se pone antihorario. Sin muesca es al revés (saca antihorario, pone horario).',
    },
    {
      question: 'Y un tornillo/tuerca SIN muesca…',
      options: [
        'Se saca horario y se pone antihorario',
        'Se saca antihorario y se pone horario',
        'Se saca y se pone antihorario',
        'Da lo mismo el sentido',
      ],
      correctIndex: 1,
      explanation: 'Sin muesca: se saca antihorario / se pone horario — la regla espejo de las piezas con muesca.',
    },
    {
      question: '¿Cuál es el manual de ajustes vigente del equipo?',
      options: [
        'Manual de ajuste Baader 200 V4',
        'Manual Boanerges Service rev. 2',
        'Manual de fábrica 1998',
        'No existe manual de ajustes',
      ],
      correctIndex: 0,
      explanation: 'El vigente es el "Nuevo manual de ajuste Baader 200 V4"; la revisión 2 de Boanerges Service quedó como referencia anterior.',
    },
  ],

  fishken: [
    {
      question: '¿Desde qué automático está tomado el general de los moto vibradores?',
      options: ['32 A', '50 A', '80 A', '125 A'],
      correctIndex: 2,
      explanation: 'El general de los moto vibradores está tomado desde un automático de 80 A.',
    },
    {
      question: '¿Los moto vibradores de empaque tienen protección propia?',
      options: [
        'No, cuelgan directo del general',
        'Sí, tienen automáticos propios en el tablero',
        'Solo protección térmica en el motor',
        'Se protegen por variador',
      ],
      correctIndex: 1,
      explanation: 'Además del general de 80 A, los moto vibradores de empaque tienen sus automáticos propios (ubicación del tablero en video del expediente).',
    },
  ],

  'detector-metales': [
    {
      question: '¿Qué modelo es el detector de metales principal de la línea?',
      options: ['IQ3', 'IQ4', 'Vistus V1', 'Safeline X'],
      correctIndex: 1,
      explanation: 'El detector principal es el IQ4 (también hay material del Vistus en el expediente).',
    },
    {
      question: '¿Qué parámetro documentado determina CUÁNDO se acciona el rechazo tras detectar metal?',
      options: [
        'La sensibilidad de esfera',
        'El retardo de rechazo',
        'La frecuencia de trabajo',
        'El umbral de producto',
      ],
      correctIndex: 1,
      explanation: 'El retardo de rechazo (documentado en el PDF del expediente) sincroniza la detección con el momento en que el producto llega al mecanismo de rechazo.',
    },
  ],

  'termoformadora-gea': [
    {
      question: 'Para producto congelado, ¿a qué valor se ajustó el valor teórico del sensor de vacío?',
      options: ['De 1 hPa a 2 hPa', 'De 2 hPa a 1 hPa', 'De 5 hPa a 2 hPa', 'Se mantiene en 2 hPa'],
      correctIndex: 1,
      explanation: 'En el ajuste #congelado el valor teórico del sensor bajó de 2 hPa a 1 hPa (y el retraso subió de 0.00 a 0.10), igual en el vacío inferior.',
    },
    {
      question: 'La tensión de film se regula en pasos de…',
      options: ['50 en 50', '100 en 100', '500 en 500', '1000 en 1000'],
      correctIndex: 2,
      explanation: 'La tensión de film (valor de referencia 14500, antes 12000) se sube de 500 en 500.',
    },
    {
      question: '¿Y la velocidad de caída en pasos de…?',
      options: ['10 en 10', '50 en 50', '100 en 100', '500 en 500'],
      correctIndex: 1,
      explanation: 'La velocidad de caída (valor 200) se regula de 50 en 50.',
    },
    {
      question: 'Para congelado, ¿a cuánto subió la duración del moldeo?',
      options: ['De 2.00 a 2.20', 'De 1.00 a 1.20', 'De 2.20 a 2.00', 'De 0.50 a 0.60'],
      correctIndex: 0,
      explanation: 'Moldeo: duración 2.00 → 2.20. También vacío 1.00 → 1.20 y retraso de vacío 0.50 → 0.60.',
    },
    {
      question: '¿Cómo se ajusta normalmente la leva del film superior?',
      options: [
        'Mecánicamente en cada cambio de producto',
        'Con los parámetros de la hoja 3630 (mecánicamente muy rara vez)',
        'No se puede ajustar',
        'Solo la ajusta el técnico GEA',
      ],
      correctIndex: 1,
      explanation: 'La leva del film superior casi nunca se toca mecánicamente: el ajuste normal es por parámetros en la hoja 3630.',
    },
    {
      question: 'Tras la modificación del técnico GEA al film inferior, ¿hay que tensar el film cada vez que se reanuda el proceso?',
      options: [
        'Sí, siempre',
        'No, ya no es necesario',
        'Solo con film grueso',
        'Solo en congelado',
      ],
      correctIndex: 1,
      explanation: 'Con la modificación al film inferior ya no es necesario tensar el film en cada reanudación.',
    },
    {
      question: 'En la estación de formado, ¿cuántas placas delgadas quedaron por lado?',
      options: ['1', '2', '3', '4'],
      correctIndex: 1,
      explanation: 'Quedaron 2 placas delgadas por lado en formado (y se retiró una placa por lado en la estación de sellado, abertura de elevación 25 → 55).',
    },
    {
      question: '¿Cómo cambió la aceleración en el ajuste realizado?',
      options: ['De 60% a 10%', 'De 10% a 60%', 'De 60% a 30%', 'No se modificó'],
      correctIndex: 0,
      explanation: 'Aceleración bajó de 60% a 10%; en el mismo ajuste la velocidad pasó de 85% a 20% y la elevación de 35 a 25.',
    },
    {
      question: 'En la estación de sellado, ¿a qué valor subió la abertura de elevación?',
      options: ['De 25 a 55', 'De 55 a 25', 'De 25 a 35', 'No se ajustó'],
      correctIndex: 0,
      explanation: 'La abertura de elevación en sellado subió de 25 a 55, y se retiró una placa por lado en esa estación.',
    },
    {
      question: '¿Dónde se guardan los parámetros modificados en el flujo de "recetas" de la termoformadora?',
      options: [
        'Se guardan automáticamente al apagar el equipo',
        'Cargar receta → agregar nueva → guardar parámetros modificados',
        'No es posible guardar cambios de receta',
        'Solo el técnico GEA puede guardar recetas',
      ],
      correctIndex: 1,
      explanation: 'El flujo del video de recetas es: cargar (00:18) → agregar nueva (03:03) → guardar parámetros modificados (04:16).',
    },
  ],
};

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const slugs = Object.keys(QUIZ);
  let total = 0;
  for (const slug of slugs) total += QUIZ[slug].length;
  console.log(`Seed quiz de máquinas: ${slugs.length} máquinas, ${total} preguntas${isDryRun ? ' [DRY-RUN]' : ''}`);

  if (!isDryRun) {
    const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
      console.error('Falta serviceAccountKey.json en la raíz del repo.');
      process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
  }
  const db = isDryRun ? null : admin.firestore();

  for (const slug of slugs) {
    const questions = QUIZ[slug];
    console.log(`\n── ${slug} (${questions.length} preguntas)`);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const id = `q${String(i + 1).padStart(2, '0')}`;
      if (q.options.length < 3 || q.correctIndex >= q.options.length) {
        console.error(`  ✗ ${id} inválida (options/correctIndex)`); process.exit(1);
      }
      const doc = {
        id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        order: i + 1,
        createdAt: BASE,
        updatedAt: BASE,
      };
      if (isDryRun) {
        console.log(`  · ${id}: ${q.question.slice(0, 70)}… → "${q.options[q.correctIndex].slice(0, 40)}"`);
      } else {
        await db.collection('learningContent').doc(slug).collection('quiz').doc(id).set(doc);
        console.log(`  ✓ ${id} escrita`);
      }
    }
  }
  console.log(`\nListo${isDryRun ? ' (dry-run, nada escrito)' : ''}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
