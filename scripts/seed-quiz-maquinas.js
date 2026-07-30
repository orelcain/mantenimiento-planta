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
    {
      question: '¿Qué debe hacerse después de usar productos de limpieza convencionales en el Grader?',
      options: ['Enjuagar con agua dulce', 'Lubricar todos los cilindros', 'Subir la presión sobre los sensores', 'Retirar eslabones de la cinta'],
      correctIndex: 0,
      explanation: 'El manual exige enjuagar con agua dulce después de limpiar con productos químicos para evitar daño.',
    },
    {
      question: '¿Qué indica una holgura vertical en los flippers, según el mantenimiento mensual?',
      options: ['Que se deben reemplazar los rodamientos', 'Que falta presión de aire de 10 bar', 'Que hay que cambiar el computador Z2', 'Que el producto está fuera de rango de 15 kg'],
      correctIndex: 0,
      explanation: 'Holgura vertical en flippers → reemplazar rodamientos; holgura horizontal → reemplazar rodamientos de bola del cilindro.',
    },
    {
      question: '¿Cuándo se reemplaza la cinta modular del Grader?',
      options: [
        'Si se alargó demasiado, hay desgaste superior excesivo o queda rígida tras limpieza profunda',
        'Solo cada semana sin importar su condición',
        'Solo si el Z2 demora más de 30 s en arrancar',
        'Cuando el aire comprimido está seco',
      ],
      correctIndex: 0,
      explanation: 'Los tres criterios de reemplazo son: alargamiento por desgaste de varillas, desgaste superior excesivo, o rigidez tras limpieza profunda.',
    },
    {
      question: '¿Qué pasa al encender el Marelec Z2?',
      options: [
        'Arranca en ~30 s y luego abre/cierra todos los flippers varias veces (autochequeo)',
        'Arranca en 5 minutos y calibra el aceite',
        'Solo arranca si hay producto en los pockets',
        'No mueve las salidas por seguridad',
      ],
      correctIndex: 0,
      explanation: 'El Z2 demora ~30 s en arrancar y luego chequea las salidas abriendo y cerrando todos los flippers varias veces.',
    },
    {
      question: 'En el regulador de caudal de los cilindros, ¿qué giro AUMENTA la velocidad?',
      options: ['CCW (antihorario) aumenta, CW (horario) reduce', 'CW aumenta, CCW reduce', 'Ambos giros aumentan la velocidad', 'La velocidad no se ajusta por caudal'],
      correctIndex: 0,
      explanation: 'CCW (antihorario) aumenta la velocidad del cilindro; CW (horario) la reduce.',
    },
    {
      question: '¿Hacia dónde debe apuntar la flecha indentada del motor de tambor?',
      options: ['Hacia arriba', 'Hacia abajo', 'Hacia el lado de descarga', 'No importa si hay aceite alimentario'],
      correctIndex: 0,
      explanation: 'La flecha indentada en el eje opuesto a la caja de cables debe apuntar hacia arriba para asegurar inmersión adecuada en aceite.',
    },
    {
      question: '¿Qué desviación angular obliga a reposicionar los ejes de fijación del motor de tambor?',
      options: ['Más de 45°', 'Más de 5°', 'Exactamente 18 mm', 'Menos de 3 bar'],
      correctIndex: 0,
      explanation: 'Se permiten desviaciones hasta ~40°; si supera 45° hay que reposicionar los ejes de fijación.',
    },
    {
      question: 'Para cambiar la velocidad de un cilindro sin afectar su fuerza, ¿qué se ajusta?',
      options: ['Solo el flujo del tubo de escape', 'El flujo que crea la fuerza', 'La longitud máxima del producto', 'La desviación estándar de pesaje'],
      correctIndex: 0,
      explanation: 'Se ajusta solo el flujo del tubo de escape — tocar el flujo que crea la fuerza afectaría la fuerza de accionamiento.',
    },
    {
      question: '¿Qué presión mínima debe tener el filtro-regulador para ajustar la velocidad de los cilindros?',
      options: ['0,5 MPa (5 bar)', '0,2 MPa (2 bar)', '6 bar exactos', '10 bar como mínimo'],
      correctIndex: 0,
      explanation: 'El filtro-regulador debe ajustarse a mínimo 0,5 MPa (5 bar) antes de tocar el caudal de cada válvula.',
    },
    {
      question: '¿Por qué no debe tocar la rueda del pocket con el gancho cuando está cerrado?',
      options: ['Porque influye en el trabajo de las celdas de carga', 'Porque impide lavar la cinta con agua dulce', 'Porque reduce la presión del regulador a menos de 5 bar', 'Porque cambia el ancho de la cinta clasificadora'],
      correctIndex: 0,
      explanation: 'Cualquier contacto entre gancho y rueda en posición cerrada influye en el trabajo de las celdas de carga (loadcells).',
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
    {
      question: '¿Qué condición debe cumplir el producto para que la M-Weigher WTR pese correctamente cada pieza?',
      options: ['Fila recta y suficiente separación entre piezas', 'Piezas superpuestas para aumentar capacidad', 'Cinta de alimentación más rápida que la de pesaje', 'Sensor en modo oscuridad'],
      correctIndex: 0,
      explanation: 'El manual exige que las piezas pasen en fila recta y con separación suficiente entre ellas para pesar bien.',
    },
    {
      question: '¿Qué dos datos combina la M-Weigher WTR para calcular el peso integrado?',
      options: ['Velocidad de la cinta y peso sobre la plataforma', 'Temperatura ambiente y presión de aire', 'Ancho total y número de salidas', 'Voltaje de red y masa de la máquina'],
      correctIndex: 0,
      explanation: 'El codificador registra la velocidad de cinta; esa velocidad combinada con el peso en plataforma da el peso integrado.',
    },
    {
      question: '¿Cuántos eslabones debe tener una cinta MW1900?',
      options: ['324', '252', '180', '1900'],
      correctIndex: 0,
      explanation: 'MW1000 = 180 eslabones, MW1450 = 252, MW1900 = 324. Nunca se quitan eslabones para acortar la cinta — afecta la precisión.',
    },
    {
      question: '¿Qué pasa si las cintas SmartLine quedan tocándose entre sí?',
      options: ['Pueden dañarse y bajar la precisión de pesaje', 'Aumenta la precisión por continuidad mecánica', 'Se habilita el modo Lavado', 'Se elimina la necesidad de nivelar la plataforma'],
      correctIndex: 0,
      explanation: 'El contacto entre cintas puede dañarlas y reduce la precisión de pesaje — deben quedar alineadas pero sin tocarse.',
    },
    {
      question: '¿Cuál es la deformación máxima permitida al revisar la plataforma de peso con regla y lámina calibradora?',
      options: ['0,2 mm', '0,5 mm', '1,0 mm', '15 mm'],
      correctIndex: 0,
      explanation: 'La plataforma de peso no debe superar 0,2 mm de deformación — es el punto crítico de la nivelación.',
    },
    {
      question: '¿A qué presión se ajusta el aire de funcionamiento en SmartLine?',
      options: ['6 bar (85–87 psi)', '3 bar', '10 bar', '0,5 MPa único'],
      correctIndex: 0,
      explanation: 'El regulador de las cabinas de aire se ajusta a 6 bar de presión de funcionamiento.',
    },
    {
      question: '¿Qué debe mostrar el M3210 antes de operar, tras iniciar las cintas al vacío?',
      options: ['Steady (Estable)', 'Wash (Lavado)', 'Problem en rojo', 'Emergency stop'],
      correctIndex: 0,
      explanation: 'La puesta en marcha diaria exige dejar las cintas al vacío hasta que el M3210 muestre "Steady".',
    },
    {
      question: '¿Por qué NO se debe apagar SmartLine con el interruptor principal después de parar la cinta?',
      options: ['Para mantener el M3210 encendido y evitar condensación por el calor', 'Para que la presión suba sobre 10 bar', 'Para que el sensor detecte piezas de 3 mm', 'Para borrar la curva de pesaje'],
      correctIndex: 0,
      explanation: 'Dejar el interruptor en ON mantiene el M3210 encendido; el calor generado evita condensación de humedad en el armario eléctrico.',
    },
    {
      question: '¿Qué separación correcta debe haber entre el brazo de puerta y la cinta en SmartLine?',
      options: ['1–2 mm', '0,2 mm', '15–25 mm', '100 mm'],
      correctIndex: 0,
      explanation: 'El espacio correcto entre brazo de puerta y cinta es de 1 a 2 mm.',
    },
    {
      question: 'Ante la alarma "parada de emergencia activada", ¿qué debe hacer el técnico?',
      options: ['Revisar todos los interruptores y restablecer con el botón de reset del armario', 'Agregar eslabones a la cinta', 'Subir la presión sobre 10 bar', 'Apagar siempre el interruptor principal'],
      correctIndex: 0,
      explanation: 'Prioridad roja: revisar todos los interruptores de emergencia y restablecer el sistema desde el botón de reset del armario eléctrico.',
    },
    {
      question: '¿Qué solución da el manual para la alarma "cero demasiado antiguo"?',
      options: ['Detener la alimentación para que la báscula adopte un nuevo perfil cero', 'Limpiar las bielas con aceite al final de la semana', 'Aumentar la velocidad de alimentación', 'Cambiar todos los inversores Lenze'],
      correctIndex: 0,
      explanation: 'Detener la alimentación le da a la balanza el espacio para adoptar un nuevo perfil cero.',
    },
  ],

  'baader-142': [
    {
      question: "¿Qué debe hacerse con el interruptor principal antes de limpiar, mantener o lubricar la BAADER 142?",
      options: [
        "Cambiarlo a Test 12",
        "Ponerlo en posición 0 y asegurarlo",
        "Desconectar solo la bomba de vacío",
        "Dejarlo en I para mantener el A3C activo"
      ],
      correctIndex: 1,
      explanation: "El manual indica desconectar la máquina, poner el interruptor principal en posición 0 y asegurarlo antes de limpieza, mantenimiento y lubricación.",
    },
    {
      question: "¿Qué pescado admite la BAADER 142 según los datos técnicos?",
      options: [
        "Salmón y trucha marina frescos, enteros con cabeza, 2 - 7 kgs",
        "Solo trucha eviscerada y sin aleta anal",
        "Salmón congelado de 1 - 3 kgs sin cabeza",
        "Cualquier pescado blanco de 7 - 12 kgs"
      ],
      correctIndex: 0,
      explanation: "El manual especifica salmón y trucha marina frescos, no eviscerados, con cabeza, con aleta anal, de 2 - 7 kgs; no admite congelados ni rigor mortis.",
    },
    {
      question: "¿Qué restricción de instalación protege la refrigeración del controlador de pescado?",
      options: [
        "Usar agua solo por encima de 60°C",
        "Cerrar la toma de agua al arrancar la bomba de vacío",
        "No instalar grifos de cierre delante de la máquina",
        "Trabajar sin aire comprimido para evitar condensación"
      ],
      correctIndex: 2,
      explanation: "El manual advierte que no deben instalarse grifos de cierre delante de la máquina ni interrumpirse la refrigeración del controlador de pescado.",
    },
    {
      question: "¿Qué condición hace que la BAADER 142 deba detenerse por sus dispositivos de seguridad?",
      options: [
        "Rociar agua en las aberturas de aspiración durante limpieza",
        "Seleccionar la clase de pescado con el selector 5",
        "Levantar cubiertas, girar puertas protectoras hacia arriba o accionar emergencia",
        "Arrancar la bomba de vacío antes de producción"
      ],
      correctIndex: 2,
      explanation: "Los dispositivos de seguridad detienen la máquina al levantarse cubiertas, al girarse puertas protectoras hacia arriba y al accionarse emergencias de la BAADER 142 o del ciclón.",
    },
    {
      question: "¿Qué calcula el A3C durante el funcionamiento?",
      options: [
        "La presión exacta de grasa en cada punto",
        "Recorridos a partir del largo, contorno y posición del ano",
        "La temperatura del agua de enjuague químico",
        "El código SAP de cada repuesto instalado"
      ],
      correctIndex: 1,
      explanation: "En funcionamiento, el A3C calcula los recorridos de trabajo a partir del largo, el contorno y la posición del ano del pescado.",
    },
    {
      question: "¿Para qué sirve la posición cero de las herramientas?",
      options: [
        "Para aumentar el rendimiento sobre 16 pescados/min",
        "Para que pescados no medidos correctamente pasen sin dañarse",
        "Para resetear automáticamente todos los errores E7xx",
        "Para cerrar los tubos de aspiración"
      ],
      correctIndex: 1,
      explanation: "El manual define la posición cero como la posición más alta de las herramientas, permitiendo que pescados no medidos correctamente pasen sin dañarse.",
    },
    {
      question: "¿Cuál es la diferencia funcional entre el excavador A y el excavador B?",
      options: [
        "El A separa el recto; el B suelta sangre del riñón y saca el corazón",
        "El A centra el pescado; el B acciona la chapaleta de ciclo",
        "El A corta el esófago; el B mide el largo",
        "El A abre la válvula de vacío; el B resetea el contador"
      ],
      correctIndex: 0,
      explanation: "El manual indica que el excavador A separa el recto, mientras que el excavador B suelta sangre del riñón y saca el corazón.",
    },
    {
      question: "En el selector 5, ¿qué diferencia hay entre Test 12 y Test 13?",
      options: [
        "Test 12 prueba la máquina completa; Test 13 prueba solo herramientas",
        "Test 12 lubrica cadenas; Test 13 abre grifos esféricos",
        "Test 12 resetea el contador; Test 13 selecciona salmón",
        "Test 12 detiene el ciclón; Test 13 apaga el A3C"
      ],
      correctIndex: 0,
      explanation: "El esquema de programas describe Test 12 como marcha de prueba de máquina completa y Test 13 como marcha de prueba solo de herramientas.",
    },
    {
      question: "Durante la limpieza diaria, ¿qué indica explícitamente el procedimiento sobre el interruptor principal?",
      options: [
        "Debe ponerse siempre en 0 desde el primer paso",
        "Debe alternarse entre I y 0 cada carro",
        "No debe desconectarse el interruptor principal",
        "Debe usarse solo para apagar la bomba BNM"
      ],
      correctIndex: 2,
      explanation: "En el procedimiento de limpieza diaria, el último paso remarca que no debe desconectarse el interruptor principal.",
    },
    {
      question: "En limpieza química, ¿cuándo se usa P3-topax 56 en lugar de P3-topax 17?",
      options: [
        "Diariamente, para desinfección final",
        "Solo para limpiar tableros eléctricos",
        "Una vez por semana, para capas de cal",
        "Cada 40 horas, como lubricante de cadena"
      ],
      correctIndex: 2,
      explanation: "El procedimiento de limpieza principal indica espumar con 2 - 5% P3-topax 17 y usar 2 - 5% P3-topax 56 una vez por semana para capas de cal.",
    },
    {
      question: "¿Cuál es la presión máxima indicada para la boquilla de la pistola de grasa?",
      options: [
        "30 bar",
        "190 bar",
        "4 bar",
        "2 bar"
      ],
      correctIndex: 1,
      explanation: "El mantenimiento especifica lubricar con GLS 380/N3 y que la presión máxima en la boquilla de la pistola no debería sobrepasar 190 bar.",
    },
    {
      question: "¿Qué indica el error E 777?",
      options: [
        "Pescado en la entrada por fallo de introducción, abrazadera o muelle roto si se repite",
        "Transmisor B25 defectuoso del excavador B",
        "Motor paso a paso sin posición cero después de producción",
        "Fallo en placa de unidad de control"
      ],
      correctIndex: 0,
      explanation: "El diagnóstico E 777 corresponde a pescado en la entrada; puede deberse a fallo de introducción por operador, fallo de abrazadera o, si se repite, muelle de tracción roto en el carro.",
    },
    {
      question: "¿Qué solución entrega el manual para los errores E 900 - E 999?",
      options: [
        "Desconectar el interruptor principal por 5 segundos, por lo menos",
        "Rociar la bomba BNM con 10 l de agua",
        "Cambiar el selector 5 a Cleaning Position",
        "Aumentar la presión de aire a 6 bar de servicio"
      ],
      correctIndex: 0,
      explanation: "Para E 900 - E 999, asociados a fallos de unidad de control o fenómenos inexplicables, el manual indica desconectar el interruptor principal por al menos 5 segundos.",
    },
    {
      question: "Según la tabla eléctrica, ¿qué alimentación aparece con frecuencia 60 Hz y corriente nominal 8 A?",
      options: [
        "380V, 400V y 415V",
        "110V y 24V",
        "220V y 230V",
        "440V y 480V"
      ],
      correctIndex: 3,
      explanation: "Los diagramas eléctricos listan 440V 60 Hz con Nennstrom 8 A y 480V 60 Hz con Nennstrom 8 A.",
    },
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
      question: "Según la regla de la máquina, un tornillo/tuerca CON muesca…",
      options: [
        "Se saca en sentido horario y se pone antihorario",
        "Se saca antihorario y se pone horario",
        "Se saca y se pone en sentido horario",
        "No se debe tocar en terreno"
      ],
      correctIndex: 0,
      explanation: "Con muesca: se saca horario / se pone antihorario. Sin muesca es al revés (saca antihorario, pone horario).",
    },
    {
      question: "Y un tornillo/tuerca SIN muesca…",
      options: [
        "Se saca horario y se pone antihorario",
        "Se saca antihorario y se pone horario",
        "Se saca y se pone antihorario",
        "Da lo mismo el sentido"
      ],
      correctIndex: 1,
      explanation: "Sin muesca: se saca antihorario / se pone horario — la regla espejo de las piezas con muesca.",
    },
    {
      question: "¿Cuál es el manual de ajustes vigente del equipo?",
      options: [
        "Manual de ajuste Baader 200 V4",
        "Manual Boanerges Service rev. 2",
        "Manual de fábrica 1998",
        "No existe manual de ajustes"
      ],
      correctIndex: 0,
      explanation: "El vigente es el \"Nuevo manual de ajuste Baader 200 V4\"; la revisión 2 de Boanerges Service quedó como referencia anterior.",
    },
    {
      question: "¿Qué hay que hacer si la materia prima se trabaja a temperatura menor a 0°C, en la 1ra Alimentación?",
      options: [
        "Aflojar el resorte de la silleta",
        "Bajar la velocidad de la cinta",
        "Dar más presión al resorte (tuerca Fig 6)",
        "Aumentar la distancia de las chapaletas a 32mm"
      ],
      correctIndex: 2,
      explanation: "Con materia prima bajo 0°C hay que dar más presión al resorte, ajustable con la tuerca Fig 6.",
    },
    {
      question: "En la 2da Alimentación, ¿qué tolerancia deben tener las chapaletas respecto al filo de los cuchillos dorsales?",
      options: [
        "±0.5mm (casi chocando entre sí)",
        "12mm de holgura",
        "No hay tolerancia, deben tocarse siempre",
        "5mm de holgura"
      ],
      correctIndex: 0,
      explanation: "Las chapaletas Fig 3-4 deben quedar por dentro del filo de los cuchillos dorsales a ±0.5mm, casi chocando entre sí.",
    },
    {
      question: "¿Por qué el 2do levantador de aletas se baja más de lo normal?",
      options: [
        "Por no contar con chapas guías de aleta",
        "Por temperatura de la materia prima",
        "Por error de fábrica",
        "Por desgaste del motor"
      ],
      correctIndex: 0,
      explanation: "El 2do levantador no tiene chapas guías de aleta, por lo tanto se baja más de lo normal que el 1ro.",
    },
    {
      question: "¿Cuál es la medida de avance \"a\" de los cuchillos ventrales?",
      options: [
        "177.5mm",
        "12mm",
        "5mm",
        "20mm"
      ],
      correctIndex: 2,
      explanation: "La medida \"a\" de avance de los cuchillos ventrales es de 5mm.",
    },
    {
      question: "¿En qué orden hay que hacer el ajuste de guías flotantes respecto a los cuchillos ventrales?",
      options: [
        "Solo en mantención anual",
        "Siempre DESPUÉS del ajuste de cuchillos ventrales",
        "Siempre ANTES del ajuste de cuchillos ventrales",
        "Da lo mismo el orden"
      ],
      correctIndex: 1,
      explanation: "El ajuste de guías flotantes debe realizarse SIEMPRE después del ajuste de cuchillos ventrales.",
    },
    {
      question: "¿Cuál es la distancia de referencia entre cuchillos ventrales y dorsales que hay que verificar SIEMPRE al cambiar cuchillos nuevos?",
      options: [
        "12mm",
        "8mm",
        "20mm",
        "17-18mm"
      ],
      correctIndex: 0,
      explanation: "La distancia de 12mm entre cuchillos ventrales y dorsales debe verificarse siempre al cambiar cuchillos nuevos, para que no rocen con las chapaletas de la 2da alimentación.",
    },
    {
      question: "¿Cuánto deben levantar los cuchillos dorsales al paso de la silleta?",
      options: [
        "30mm",
        "12mm",
        "20mm",
        "5mm"
      ],
      correctIndex: 2,
      explanation: "Los cuchillos dorsales deben levantar 20mm al paso de la silleta, altura dada por la palanca del trinquete.",
    },
    {
      question: "Según los cuchillos punzones, ¿qué pasa si quedan más ALTOS de lo normal?",
      options: [
        "Cortan la espina del flanco",
        "No afecta el corte",
        "Gay ping en el filete a lo largo del esquelón",
        "Los rascadores no cumplen su función"
      ],
      correctIndex: 2,
      explanation: "Cuchillos punzones más altos de lo normal producen gay ping en el filete a lo largo del esquelón; más bajos cortan la espina del flanco y los rascadores no funcionan.",
    },
    {
      question: "¿Cuál es la abertura correcta de los cuchillos rascadores?",
      options: [
        "8mm",
        "17-18mm",
        "3mm",
        "0.5mm"
      ],
      correctIndex: 1,
      explanation: "La abertura de los cuchillos rascadores debe ser entre 17-18mm, ajustada en posición de trabajo.",
    },
    {
      question: "En el sistema de seguridad de la Baader 200, ¿cuántos puntos de seguridad tiene el circuito?",
      options: [
        "12",
        "7",
        "5",
        "9"
      ],
      correctIndex: 3,
      explanation: "El sistema de seguridad tiene 9 puntos: límite de carrera de entrada, parada de emergencia, límite de carrera corte de cola, sensor guía dorsal, 4 sensores de pasillo (zonas 5-8) e interruptor principal.",
    },
    {
      question: "Al hacer precauciones por cambio de cuchillos nuevos, además de ajustar la medida patrón de 12mm, ¿qué más hay que reajustar SIEMPRE?",
      options: [
        "El sistema de seguridad",
        "Las guías flotantes",
        "La velocidad de la silleta",
        "El embrague"
      ],
      correctIndex: 1,
      explanation: "Con cuchillos nuevos siempre hay que reajustar las guías flotantes, para asegurar la calidad del filo de los cuchillos nuevos.",
    },
    {
      question: "Ante gay ping en la zona de cola o aleta anal, ¿qué característica deben tener los cuchillos ventrales instalados?",
      options: [
        "El diámetro más cercano a 200mm (el mayor)",
        "No influye el diámetro",
        "El diámetro más chico disponible",
        "Cuchillos nuevos sin usar"
      ],
      correctIndex: 0,
      explanation: "Para evitar gay ping en cola/aleta anal, los cuchillos ventrales deben ser los de mayor diámetro, lo más cercano a 200mm, y en excelente estado de filo.",
    },
    {
      question: "¿Cuándo se debe reajustar el embrague de la Baader 200?",
      options: [
        "Nunca, es de fábrica",
        "Solo cuando no hay causal justificada de bloqueo (sin objeto interpuesto)",
        "Cada vez que se cambian cuchillos",
        "Todos los días al arrancar"
      ],
      correctIndex: 1,
      explanation: "El reajuste del embrague se hace solo cuando no hay causal justificada de bloqueo, es decir, cuando se verificó que no hay ningún objeto interpuesto al accionamiento normal.",
    },
    ],

  fishken: [
    {
      question: "¿Desde qué automático está tomado el general de los moto vibradores?",
      options: [
        "32 A",
        "50 A",
        "80 A",
        "125 A"
      ],
      correctIndex: 2,
      explanation: "El general de los moto vibradores está tomado desde un automático de 80 A.",
    },
    {
      question: "¿Los moto vibradores de empaque tienen protección propia?",
      options: [
        "No, cuelgan directo del general",
        "Sí, tienen automáticos propios en el tablero",
        "Solo protección térmica en el motor",
        "Se protegen por variador"
      ],
      correctIndex: 1,
      explanation: "Además del general de 80 A, los moto vibradores de empaque tienen sus automáticos propios (ubicación del tablero en video del expediente).",
    },
    {
      question: "¿Cuántas compuertas tiene la Fishken E-Pack S28?",
      options: [
        "12",
        "28",
        "18",
        "24"
      ],
      correctIndex: 1,
      explanation: "La E-Pack S28 tiene 28 compuertas, cada una con su propia celda de carga.",
    },
    {
      question: "¿Cómo se ve en pantalla una compuerta deshabilitada?",
      options: [
        "En color rojo",
        "Transparente",
        "Con un candado",
        "Parpadeando en amarillo"
      ],
      correctIndex: 0,
      explanation: "Las compuertas habilitadas se ven con transparencia; las deshabilitadas, en color rojo.",
    },
    {
      question: "¿Cuáles son las 2 opciones del menú principal del software E-Pack?",
      options: [
        "Iniciar Proceso y Servicio FishKen",
        "Producción y Mantención",
        "Especie y Calibre",
        "Calibración y Reportes"
      ],
      correctIndex: 0,
      explanation: "El menú principal del E-Pack tiene Iniciar Proceso (control del proceso productivo) y Servicio FishKen (calibración, puertas, conexiones).",
    },
    {
      question: "¿Qué 3 grupos verifican las Pruebas de conexión de Servicio FishKen?",
      options: [
        "Especie, Calidad y Calibre",
        "Red, Software y Firmware",
        "Base de Datos, Tarjetas de Relé y Tarjetas de Pesaje",
        "Compuertas, Celdas y Motores"
      ],
      correctIndex: 2,
      explanation: "Las Pruebas de conexión verifican Base de Datos, Tarjetas de Relé (NUMATO) y Tarjetas de Pesaje.",
    },
    {
      question: "¿Qué tarjetas accionan físicamente las compuertas?",
      options: [
        "Tarjetas de Red",
        "Tarjetas de Pesaje",
        "Tarjetas de Base de Datos",
        "Tarjetas de Relé (NUMATO)"
      ],
      correctIndex: 3,
      explanation: "Las Tarjetas de Relé (NUMATO) son las que accionan (abren/cierran) las compuertas según la combinatoria.",
    },
    {
      question: "Para deshabilitar una compuerta con problemas de pesaje, ¿qué se hace?",
      options: [
        "Se llama directo a soporte técnico",
        "Servicio FishKen › Ajuste de puertas: desmarcar Activo y Guardar Cambios",
        "Se reinicia todo el software",
        "Se corta el automático del tablero"
      ],
      correctIndex: 1,
      explanation: "En Servicio FishKen › Ajuste de puertas se desmarca la casilla Activo de la compuerta y se guarda — queda en rojo hasta resolver el problema.",
    },
    {
      question: "¿Qué mide el \"% de sobrepeso\" de una caja?",
      options: [
        "El peso total de todas las cajas del turno",
        "Cuánto se pasa la caja del peso objetivo (menor es mejor)",
        "La cantidad de compuertas deshabilitadas",
        "El tiempo que demora en armarse la caja"
      ],
      correctIndex: 1,
      explanation: "El sobrepeso (y su %) mide cuánto se pasa la caja del peso objetivo: cuanto menor, mejor rendimiento de la combinatoria.",
    },
    {
      question: "¿Qué tipos de reporte ofrece FishKen Web?",
      options: [
        "Solo por operador",
        "Por consumo eléctrico",
        "Solo por turno",
        "Por Especie, Calidad y Calibre (General o Detallado)"
      ],
      correctIndex: 3,
      explanation: "FishKen Web entrega reportes por Especie, Calidad y Calibre, cada uno en versión General o Detallado.",
    },
    {
      question: "Ante sobrepeso alto o muchas cajas rechazadas, ¿qué se revisa primero?",
      options: [
        "Compuertas con pesaje impreciso, rango de celda mal configurado o celda sucia/descalibrada",
        "La versión del software",
        "El automático general de 80 A",
        "El cableado de red"
      ],
      correctIndex: 0,
      explanation: "Sobrepeso/rechazo alto suele venir de compuertas con pesaje malo, rango de celda incorrecto o celdas sucias/descalibradas.",
    },
    {
      question: "¿Dónde se calibra el sistema de pesaje de la Fishken?",
      options: [
        "FishKen Web › Reportes",
        "Iniciar Proceso › Estadísticas",
        "Servicio FishKen › Calibración",
        "No se calibra, es automático"
      ],
      correctIndex: 2,
      explanation: "La calibración del sistema de pesaje se hace desde Servicio FishKen › Calibración.",
    },
    {
      question: "Antes de presionar Iniciar en el proceso, ¿qué hay que confirmar?",
      options: [
        "La fecha del último reporte",
        "Solo que el software esté abierto",
        "El nivel de aceite de los motores",
        "El producto configurado y que las compuertas necesarias estén habilitadas (sin rojo)"
      ],
      correctIndex: 3,
      explanation: "Antes de iniciar hay que confirmar el producto configurado (especie, calibre, orden, caja master) y que las compuertas necesarias estén habilitadas.",
    },
    ],

  'detector-metales': [
    {
      question: "¿Qué modelo es el detector de metales principal de la línea?",
      options: [
        "IQ3",
        "IQ4",
        "Vistus V1",
        "Safeline X"
      ],
      correctIndex: 1,
      explanation: "El detector principal es el IQ4 (también hay material del Vistus en el expediente).",
    },
    {
      question: "¿Qué parámetro documentado determina CUÁNDO se acciona el rechazo tras detectar metal?",
      options: [
        "La sensibilidad de esfera",
        "El retardo de rechazo",
        "La frecuencia de trabajo",
        "El umbral de producto"
      ],
      correctIndex: 1,
      explanation: "El retardo de rechazo (documentado en el PDF del expediente) sincroniza la detección con el momento en que el producto llega al mecanismo de rechazo.",
    },
    {
      question: "¿Qué debe APRENDER primero el detector Vistus para poder distinguir metal del propio producto?",
      options: [
        "El efecto de producto",
        "El peso del producto",
        "El código del operador",
        "La velocidad de la cinta"
      ],
      correctIndex: 0,
      explanation: "Muchos productos generan señal propia (efecto de producto); el detector debe aprenderlo primero para no confundirlo con una contaminación metálica.",
    },
    {
      question: "¿Cuántos productos libres de metal se necesitan como mínimo para el ajuste automático de un perfil?",
      options: [
        "5",
        "1",
        "10",
        "3"
      ],
      correctIndex: 3,
      explanation: "El ajuste automático de producto requiere dejar pasar un mínimo de 3 productos libres de metal por la abertura.",
    },
    {
      question: "Con transporte de acero inoxidable, ¿cuánto debe ser la zona libre de metales aguas arriba y abajo del detector?",
      options: [
        "5 veces la altura de la abertura",
        "2 veces la altura de la abertura",
        "4 veces la altura de la abertura",
        "3 veces la altura de la abertura"
      ],
      correctIndex: 3,
      explanation: "Con transporte de acero inoxidable la zona libre es 3 veces la altura de la abertura; con acero (no inox) es 4 veces.",
    },
    {
      question: "Entre AISI 420 (magnético) y AISI 304 (no magnético), ¿cuál acero inoxidable es MÁS DIFÍCIL de detectar?",
      options: [
        "Ambos igual de fáciles",
        "AISI 304",
        "Ninguno se puede detectar",
        "AISI 420"
      ],
      correctIndex: 1,
      explanation: "El acero inoxidable no magnético (AISI 304 / V2A) es el más difícil de detectar de los dos.",
    },
    {
      question: "Cuando el semáforo se pone ROJO (mensaje de error, E), ¿qué pasa con la detección?",
      options: [
        "Se detiene y se dispara el relé Error",
        "Baja la sensibilidad a la mitad",
        "Se reinicia automáticamente",
        "Sigue funcionando normal"
      ],
      correctIndex: 0,
      explanation: "Un mensaje de error (E) pone el semáforo en rojo, detiene la detección y dispara el relé Error.",
    },
    {
      question: "¿Qué privilegio se necesita para confirmar un mensaje de ERROR?",
      options: [
        "Jefe de calidad únicamente",
        "No se puede confirmar, hay que reiniciar",
        "Ingeniero",
        "Cualquier operador"
      ],
      correctIndex: 2,
      explanation: "Confirmar un error requiere privilegio de ingeniero; advertencias y detecciones las puede confirmar operador o ingeniero.",
    },
    {
      question: "Ante la advertencia W0008 (demasiados productos en el recipiente colector), ¿qué se hace?",
      options: [
        "Aumentar la sensibilidad",
        "Vaciar el recipiente colector",
        "Reiniciar el detector",
        "Cambiar el perfil de producto"
      ],
      correctIndex: 1,
      explanation: "W0008 indica que hay demasiados productos en el recipiente colector — hay que vaciarlo; si el número de rechazos es anormalmente alto, además revisar el perfil.",
    },
    {
      question: "Ante W0019 (sistema de transporte sucio), ¿qué riesgo hay si no se corrige?",
      options: [
        "Ninguno, es solo informativo",
        "Falsas activaciones y pérdida de sensibilidad",
        "Se bloquea el separador permanentemente",
        "Se borra la memoria del equipo"
      ],
      correctIndex: 1,
      explanation: "Un sistema de transporte sucio (cinta o cadena) genera riesgo de falsas activaciones y pérdida de sensibilidad — hay que limpiar o sustituir la cinta/cadena.",
    },
    {
      question: "Ante el error EFF07 (\"distancia de separación demasiado corta\"), ¿cuál es la solución?",
      options: [
        "Acercar el separador al detector",
        "Cambiar la batería del terminal",
        "Aumentar la distancia entre el separador y el detector",
        "Aumentar la tensión del transmisor"
      ],
      correctIndex: 2,
      explanation: "EFF07 indica que el tiempo de desplazamiento para separar el producto es muy corto — se soluciona aumentando la distancia entre separador y detector.",
    },
    {
      question: "¿Qué batería usa el terminal del detector y cada cuánto se agota aproximadamente?",
      options: [
        "AA alcalina, 1 año",
        "No tiene batería, es de red",
        "Litio 3V tipo CR2032, unos 3 años",
        "Recargable 9V, 6 meses"
      ],
      correctIndex: 2,
      explanation: "La batería del reloj interno es de litio 3V tipo CR2032 y dura aproximadamente 3 años; al agotarse se pierden fecha y hora.",
    },
    {
      question: "¿Cuál es el máximo de caracteres para el nombre de producto y el número de artículo en un perfil?",
      options: [
        "8 caracteres",
        "Sin límite",
        "15 caracteres",
        "25 caracteres"
      ],
      correctIndex: 2,
      explanation: "El nombre de producto y el número de artículo no deben superar 15 caracteres para verse completos en el área línea/producto.",
    },
    {
      question: "¿Qué se debe hacer ANTES de confirmar un mensaje de error?",
      options: [
        "Solventar la causa del error",
        "Nada, solo tocar Confirmar",
        "Esperar 24 horas",
        "Reiniciar el terminal"
      ],
      correctIndex: 0,
      explanation: "Hay que solventar la causa antes de confirmar — un error confirmado sin resolver la causa reaparece.",
    },
    {
      question: "Si el detector rechaza producto sano (falso rechazo) de forma reiterada, ¿qué se revisa primero?",
      options: [
        "El idioma de la pantalla",
        "El número de artículo del perfil",
        "La batería del terminal",
        "El aprendizaje del efecto de producto y la zona libre de metales"
      ],
      correctIndex: 3,
      explanation: "Los falsos rechazos suelen venir de un efecto de producto mal aprendido (cambió humedad/sal/temperatura) o de que la zona libre de metales esté invadida.",
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

  // Enzunchadora Transpak TP-6000-1. Fuente: manual de operación
  // TRANSPAK_TP-6000-1_Manual_operacion_y_repuestos.pdf (págs. 1-22), incluida la
  // tabla de troubleshooting de la pág. 22. Manual en inglés, traducido al curar.
  'enzunchadora-n2': [
    {
      question: '¿Con qué método sella el fleje la TP-6000?',
      options: ['Con grapa metálica', 'Con adhesivo', 'Por calor', 'Por presión en frío'],
      correctIndex: 2,
      explanation: 'El método de sellado es por calor: el calentador funde el fleje de PP y el cabezal lo sella.',
    },
    {
      question: '¿Qué tipo de fleje se puede usar en esta máquina?',
      options: ['Solo PET', 'PP o PET indistintamente', 'Cordón de poliéster', 'Solo PP (polipropileno)'],
      correctIndex: 3,
      explanation: 'Solo fleje PP. El manual prohíbe expresamente el fleje PET y el cordón de poliéster.',
    },
    {
      question: '¿Cuál es el rango de espesor de fleje admitido?',
      options: ['0,55 a 0,75 mm', '0,20 a 0,40 mm', '1,0 a 1,5 mm', 'Cualquiera'],
      correctIndex: 0,
      explanation: 'De 0,55 mm a 0,75 mm. Fuera de ese rango hay que reajustar el mecanismo de avance y recogida.',
    },
    {
      question: '¿Y el rango de ancho de fleje?',
      options: ['5 a 7 mm', '8 a 12 mm', '15 a 20 mm', '20 a 25 mm'],
      correctIndex: 1,
      explanation: 'De 8 mm a 12 mm (3/8" - 1/2"). Cambiar de ancho requiere el kit de conversión, que es opcional.',
    },
    {
      question: '¿Cuál es el peso máximo del paquete a flejar?',
      options: ['200 kg', '50 kg', '100 kg', 'Sin límite'],
      correctIndex: 2,
      explanation: '100 kg. Además el paquete no debe ser menor a 100 mm de ancho por 20 mm de alto.',
    },
    {
      question: 'El fleje NO alcanza la posición de sellado. ¿Qué temporizador hay que revisar?',
      options: ['T2, que controla la alimentación', 'T1, que controla la recogida', 'Ninguno: es el calentador', 'Los dos por igual'],
      correctIndex: 0,
      explanation: 'T2 determina el tiempo de alimentación del fleje. Si es demasiado corto, el fleje no llega al punto de sellado.',
    },
    {
      question: '¿Qué controla el temporizador T1?',
      options: ['La temperatura del calentador', 'El tiempo de alimentación del fleje', 'La velocidad de la mesa', 'El tiempo de recogida (take-up), o sea el tensado'],
      correctIndex: 3,
      explanation: 'T1 determina el tiempo de recogida del fleje. Referencia: ≈0,4 s en trifásica y ≈0,3 s en monofásica.',
    },
    {
      question: 'Para una caja de cartón, ¿en qué posición se deja normalmente la perilla de tensión?',
      options: ['9 o 10', '4 o 5', '0 o 1', 'Siempre al máximo'],
      correctIndex: 1,
      explanation: 'El rango de la perilla es 0 a 10; para caja de cartón normalmente corresponde la posición 4 o 5.',
    },
    {
      question: '¿En qué posición se fija la temperatura del calentador?',
      options: ['3 o 4', '1 o 2', '5 o 6', 'Siempre en 6'],
      correctIndex: 0,
      explanation: 'El rango es 1 a 6 y el manual indica fijarla en 3 o 4, corrigiendo de a poco hasta obtener el sello óptimo.',
    },
    {
      question: '¿Cuánto tiempo hay que esperar tras encender antes de empezar a flejar?',
      options: ['No hay que esperar', 'Unos 30 segundos', 'Unos 3 minutos', 'Unos 15 minutos'],
      correctIndex: 2,
      explanation: 'Hay que esperar alrededor de 3 minutos hasta que el calentador alcance su temperatura de operación; si no, el sello no pega.',
    },
    {
      question: 'En una pausa corta, ¿cómo se evita perder el precalentamiento del calentador?',
      options: ['Desenchufando la máquina', 'Apagando el interruptor de poder', 'Bajando la temperatura a 1', 'Dejando el STOP bloqueado'],
      correctIndex: 3,
      explanation: 'Con el STOP bloqueado la máquina se detiene pero el calentador mantiene su temperatura, y queda lista sin esperar el precalentamiento.',
    },
    {
      question: '¿Qué hace el switch F/R girado en sentido antihorario?',
      options: ['Alimenta el fleje alrededor del arco', 'Retrocede el fleje al acumulador', 'Apaga el calentador', 'Cambia de AUTO a HAND'],
      correctIndex: 0,
      explanation: 'Antihorario alimenta el fleje alrededor del arco; horario lo retrocede y lo devuelve a la caja acumuladora.',
    },
    {
      question: '¿Cuánto debe ser la holgura del mecanismo de avance y recogida?',
      options: ['Cero siempre', '1 mm fijo', 'Igual al espesor del fleje en uso', 'El doble del espesor del fleje'],
      correctIndex: 2,
      explanation: 'La holgura debe ser igual al espesor del fleje que se está usando. De fábrica viene ajustada para fleje de 0,55 a 0,60 mm.',
    },
    {
      question: 'Falta fleje en la caja acumuladora. ¿Hacia dónde se gira el tornillo de ajuste?',
      options: ['Horario', 'Antihorario', 'No se ajusta: se cambia el resorte', 'Media vuelta en cualquier sentido'],
      correctIndex: 1,
      explanation: 'Si falta fleje se afloja la tuerca y se gira el tornillo en antihorario; si sobra fleje, en horario.',
    },
    {
      question: 'La lámpara piloto NO enciende y la máquina no responde. ¿Qué se revisa primero?',
      options: [
        'La temperatura del calentador',
        'Suministro eléctrico, fusible, cable cortado y si el STOP quedó bloqueado',
        'El temporizador T2',
        'La perilla de tensión',
      ],
      correctIndex: 1,
      explanation: 'Con piloto apagado las causas del manual son: sin suministro eléctrico, fusible quemado o desalojado, cable cortado o desconectado, y STOP bloqueado.',
    },
    {
      question: 'El fleje se aplica pero la unión se abre (no queda sellada). ¿Qué NO es causa según el manual?',
      options: [
        'Cable del calentador cortado o flojo',
        'Ajuste de temperatura inadecuado',
        'Valor de la perilla de tensión demasiado alto',
        'Cantidad excesiva de fleje en el acumulador',
      ],
      correctIndex: 3,
      explanation: 'El exceso de fleje en el acumulador es causa de AVANCE Y RECOGIDA incorrectos, no de fleje sin sellar. Para fleje sin sellar el manual lista el cableado del calentador, la temperatura, que el fleje no llegue al punto de sellado (LS-3) y la tensión demasiado alta.',
    },
    {
      question: 'El relé de sobrecarga cortó la energía. ¿Qué corresponde para volver a operación normal?',
      options: ['Accionar el switch magnético', 'Cambiar el fusible', 'Reiniciar el temporizador T2', 'Esperar a que se enfríe solo'],
      correctIndex: 0,
      explanation: 'El relé de sobrecarga es una protección de corriente que corta automáticamente; para operación normal hay que accionar el switch magnético.',
    },
    {
      question: 'La máquina no se usará por un período largo. ¿Qué corresponde hacer con el fleje?',
      options: ['Dejarlo como está', 'Tensarlo al máximo', 'Cortarlo y botarlo', 'Sacarlo del acumulador y rebobinarlo en el portabobina'],
      correctIndex: 3,
      explanation: 'Se saca de la caja acumuladora y se rebobina en el portabobina para evitar que el fleje se deforme.',
    },
  ],
};

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // `--only=<slug>` limita la escritura a UNA máquina. Sin el flag escribe las 9, y eso
  // sobrescribiría cualquier pregunta que se haya editado después desde el panel admin
  // (el docId es determinístico: q01, q02…). Al agregar una máquina nueva, usar --only.
  const onlyArg = process.argv.slice(2).find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : null;
  if (only && !QUIZ[only]) {
    console.error(`--only=${only} no existe en QUIZ. Disponibles: ${Object.keys(QUIZ).join(', ')}`);
    process.exit(1);
  }

  const slugs = only ? [only] : Object.keys(QUIZ);
  let total = 0;
  for (const slug of slugs) total += QUIZ[slug].length;
  console.log(`Seed quiz de máquinas: ${slugs.length} máquina(s), ${total} preguntas${only ? ` [SOLO ${only}]` : ''}${isDryRun ? ' [DRY-RUN]' : ''}`);
  if (!only) {
    console.log('⚠ Sin --only se reescriben las 9 máquinas: pisa ediciones hechas desde el admin.');
  }

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
