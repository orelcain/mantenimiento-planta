#!/usr/bin/env node
/**
 * Seed: curso "Imputación de Fallas" en el Centro de Aprendizaje.
 *
 *   slug `imputacion-fallas`  ·  area "Capacitacion / Normativa"
 *
 * Fuente: capacitación interna "Capacitación de Imputación de Fallas V12"
 * (autor: Roger Tornavaca Castañeda), el curso con el que se capacita a los
 * supervisores para anotar las detenciones. 6 categorías, 46 hojas.
 *
 * El contenido es DIDÁCTICO, no una copia del HTML: se reordenó al formato de
 * curso de la app (Lecciones / Práctica / Casos / Examen / Glosario /
 * Bibliografía) y se le agregó lo que el original no tiene — qué pasa con la
 * imputación DESPUÉS de anotarla (cascada de pérdidas, Pareto, MTTR) y las 6
 * hojas que viven en dos categorías a la vez.
 *
 * Las etiquetas de las causales son las MISMAS que usa
 * `apps/pwa/src/services/shoplogix/imputacionTaxonomy.ts`: el curso y el
 * clasificador tienen que hablar igual o el Pareto no cuadra con lo que se
 * enseña.
 *
 * Estructura escrita (paths de apps/pwa/src/services/learningContent.ts):
 *   learningContent/imputacion-fallas/manual/{id}
 *   learningContent/imputacion-fallas/procedures/{id}
 *   learningContent/imputacion-fallas/flows/{id}
 *   learningContent/imputacion-fallas/diagnosis/{id}
 *   learningContent/imputacion-fallas/quiz/{id}
 *   learningContent/imputacion-fallas/glossary/{id}
 *   learningContent/imputacion-fallas/bibliografia/{id}
 *
 * Idempotente: docId determinístico; re-correrlo NO duplica.
 *
 * Uso:
 *   node scripts/seed-curso-imputacion-fallas.js --dry-run
 *   node scripts/seed-curso-imputacion-fallas.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const isDryRun = process.argv.slice(2).includes('--dry-run');

const SLUG = 'imputacion-fallas';
const PREFIX = 'imp';
// Timestamp fijo del contenido (idempotente + badge "Nuevo" 14 días desde la carga).
const BASE = Date.parse('2026-08-09T12:00:00-04:00');

// ── Builder del campo `content` del manual (mini-formato de parseManualContent) ──
function manualContent({ intro = '', medidas = [], clave = [], terreno = [] }) {
  const parts = [];
  if (intro) parts.push(intro.trim());
  if (medidas.length) parts.push(['Medidas / tolerancias:', ...medidas.map(x => `- ${x}`)].join('\n'));
  if (clave.length) parts.push(['Puntos clave:', ...clave.map(x => `- ${x}`)].join('\n'));
  if (terreno.length) parts.push(['Notas operativas:', ...terreno.map(x => `- ${x}`)].join('\n'));
  return parts.join('\n\n');
}

// ════════════════════════════════════════════════════════════════════════════
// LECCIONES
// ════════════════════════════════════════════════════════════════════════════

const MANUAL = [
  {
    id: 'imp-01-que-es-imputar',
    title: 'Qué es imputar una detención',
    intro: 'Imputar es asignar la detención a la causa que realmente originó la pérdida de tiempo. No es "elegir un nombre de la lista": es dejar registrado por qué se perdió ese tiempo, para que después se pueda atacar. Una detención mal imputada no se pierde sola — se lleva consigo el análisis del turno.',
    clave: [
      'Se imputa la CAUSA que originó el paro, no el equipo que quedó detenido.',
      'La imputación es el único dato que explica POR QUÉ se perdió el tiempo: el resto (duración, hora, máquina) lo registra el sistema solo.',
      'Una buena imputación permite ver tendencias, atacar causas repetidas, mejorar el OEE y decidir con datos.',
      'Una mala imputación no genera un error visible: genera un Pareto que apunta al lugar equivocado, y se trabaja meses sobre la causa que no era.',
      'Imputar bien es lo que permite demostrar con números qué parte de la pérdida es de Mantención y qué parte no lo es.',
    ],
    terreno: [
      'Si dudas entre dos causales, imputa la que originó el paro y escribe la otra en el comentario. El comentario es gratis; el dato mal clasificado, no.',
      'La imputación se hace pensando en quién va a leer el reporte dentro de un mes, no en cerrar rápido la pantalla.',
    ],
  },
  {
    id: 'imp-02-causa-no-efecto',
    title: 'La regla de oro: la causa, no el efecto',
    intro: 'Siempre se imputa la causa que origina la detención, no el efecto visible. El efecto es la máquina parada; la causa es lo que le faltó o lo que se rompió. Casi todos los errores de imputación son la misma equivocación: anotar lo que se vio en vez de lo que pasó.',
    clave: [
      'Ejemplo correcto: la Baader 142 se detiene porque no hay aire en la red. La imputación es Falla Abastecimiento / Servicios > Aire.',
      'Ejemplo incorrecto: imputar esa misma detención como Baader 142 > Motores solo porque la máquina se paró.',
      'Cuatro preguntas antes de anotar: ¿Qué originó el paro? ¿La falla fue del equipo o externa? ¿Es una condición planificada? ¿Faltó materia prima?',
      'Si la respuesta a "qué originó el paro" es algo que le pasó a OTRO sistema (aire, energía, agua, SAP), la imputación es de ese sistema, no de la máquina.',
      'Cuando una falla provoca otra, se imputa la PRIMERA. Si una cinta se rompe y por eso se acumula producto, la causa es la cinta, no la acumulación.',
    ],
    terreno: [
      'Errores comunes: imputar por el equipo detenido y no por la causa raíz; confundir falla mecánica con ajuste operacional; clasificar como eléctrica una pérdida de aire o de energía externa; usar "falla operacional" como cajón de sastre sin revisar si fue MMPP, aseo, cambio de lote o ajuste; imputar paros programados como pérdidas de equipo.',
      'Prueba rápida: si el servicio hubiera estado disponible, ¿la máquina habría seguido trabajando? Si la respuesta es sí, la causa es el servicio.',
    ],
  },
  {
    id: 'imp-03-las-seis-categorias',
    title: 'Las 6 categorías del árbol',
    intro: 'La estructura vigente tiene 6 categorías y 46 hojas. Elegir bien la categoría es más de la mitad del trabajo: dentro de la categoría correcta, la hoja casi siempre es evidente.',
    clave: [
      'Falla Abastecimiento / Servicios (7 hojas): a la máquina le falta un servicio para poder trabajar. Está sana.',
      'Falla Eléctrica (8 hojas): el origen está en alimentación, señal, control o accionamiento eléctrico.',
      'Falla Mecánica (11 hojas): hay daño físico, desgaste, trabamiento o pérdida de condición mecánica.',
      'MMPP (4 hojas): el problema está en el flujo de producto, no en el equipo.',
      'Operacionales (10 hojas): ejecución, coordinación, ajustes y esperas del proceso.',
      'Paros Programados (6 hojas): pausas previstas por organización del turno o planificación.',
    ],
    terreno: [
      'Orden de descarte que funciona: ¿estaba planificado? -> Programados. ¿Faltó un servicio? -> Abastecimiento. ¿Faltó o se trancó el producto? -> MMPP. ¿Se rompió algo? -> Mecánica o Eléctrica. ¿Nada de lo anterior? -> Operacionales.',
      'Operacionales es la última opción, no la primera. Si se usa como cajón de sastre, el Pareto queda ciego.',
    ],
  },
  {
    id: 'imp-04-abastecimiento',
    title: 'Falla Abastecimiento / Servicios',
    intro: 'Agrupa detenciones originadas por recursos o servicios externos al funcionamiento propio del equipo. La máquina puede estar en perfectas condiciones, pero no puede operar porque le falta una condición básica de soporte. Suele afectar a más de un equipo o a toda una zona.',
    clave: [
      'Agua: falta de agua, baja presión o suministro indisponible para proceso, lavado o higiene. No incluye fallas de bombas propias del equipo.',
      'Aire: falta de aire comprimido o presión neumática insuficiente; cilindros, actuadores o válvulas no operan. No incluye una electroválvula dañada (esa es del equipo).',
      'Energía: falta de suministro eléctrico general o externo — cortes, microcortes, caída del sector. No incluye fallas internas de motor, protección o lógica de un equipo.',
      'Flow Ice: el proceso no puede continuar porque no llega Flow Ice al punto de uso.',
      'Innova: el sistema Innova no está disponible y bloquea trazabilidad, validación o avance del proceso.',
      'Insumos / Bodegas: falta de bolsas, etiquetas, film, cajas o materiales auxiliares. NO es MMPP.',
      'SAP: bloqueo, caída o falta de respuesta de SAP que impide ejecutar una acción necesaria del proceso.',
    ],
    terreno: [
      'La confusión más cara de esta categoría: falta de etiquetas o bolsas se imputa a Insumos / Bodegas, nunca a MMPP. MMPP es la materia prima principal (el pescado), no el material de empaque.',
      'Si el corte de energía dejó parados varios equipos, es UNA detención por Energía en cada equipo afectado — no se reparte en las causales propias de cada máquina.',
    ],
  },
  {
    id: 'imp-05-electrica',
    title: 'Falla Eléctrica',
    intro: 'Detenciones originadas por componentes eléctricos, de control o de lógica, tanto en la Baader 142 como en equipos auxiliares. La causa está en la alimentación, la señal, el control o el accionamiento eléctrico.',
    clave: [
      'Baader 142 > Lógica: secuencia de control, señales, permisos, sensores o enclavamientos que impiden operar. No incluye roturas físicas ni producto atrapado.',
      'Baader 142 > Motores: el motor no parte o se detiene por causa eléctrica (protección disparada, falta de comando, falla de circuito). No incluye motores trabados mecánicamente.',
      'Equipo Auxiliar > Balanzas: la balanza no energiza, no comunica o no opera por causa eléctrica.',
      'Equipo Auxiliar > Bombas: la bomba no opera por alimentación, control o protección eléctrica.',
      'Equipo Auxiliar > Cintas: la cinta no parte o se detiene por motor, señal, variador, alimentación o control.',
      'Equipo Auxiliar > Ciclón: pérdida de operación por control o alimentación eléctrica.',
      'Equipo Auxiliar > Estación de Calidad: queda fuera de servicio por pérdida de alimentación o señal.',
      'Equipo Auxiliar > Grader: falla eléctrica en sensores, motores o control del grader.',
    ],
    terreno: [
      'Antes de imputar eléctrica, responde tres cosas: ¿la falla nació en el control o en la potencia?; ¿es eléctrica o en realidad es mecánica?; ¿no será falta de energía general del sector (eso es Abastecimiento > Energía)?',
      'Si el motor no gira porque está trabado, NO es eléctrica aunque la protección haya disparado: la protección disparó por consecuencia. La causa es mecánica.',
    ],
  },
  {
    id: 'imp-06-mecanica',
    title: 'Falla Mecánica',
    intro: 'Detenciones originadas por desgaste, rotura, desalineación, trabamiento, daño físico o pérdida de condición mecánica, en equipo principal y auxiliares. Es la categoría con más hojas (11).',
    clave: [
      'Baader 142 > Correas: la correa se corta, se suelta, se sale de posición o pierde su condición de trabajo.',
      'Baader 142 > Cuchillos / Guillotinas: desgaste, rotura, mala regulación física o daño del sistema de corte.',
      'Baader 142 > Motores (Mecánica): rodamiento tomado, eje trabado, acople dañado o resistencia mecánica interna.',
      'Baader 142 > Pernos / Resortes: soltura, rotura o daño en pernos y resortes que hace perder la fijación.',
      'Baader 142 > Punto Cero: pérdida de la referencia física o del ajuste mecánico base del equipo.',
      'Equipo Auxiliar (Mecánica): Balanzas, Bombas, Cintas, Estación de Calidad, Grader y Knuro, cuando el daño es físico.',
    ],
    terreno: [
      'No corresponde a esta categoría: problemas de lógica o señal, falta de servicios externos, falta de materia prima.',
      'Regla práctica para separar de eléctrica: si al liberar el elemento a mano gira o se mueve, sospecha eléctrica; si está duro, trabado o roto, es mecánica.',
    ],
  },
  {
    id: 'imp-07-mmpp',
    title: 'MMPP (materia prima)',
    intro: 'Pérdidas relacionadas con el flujo de materia prima, no con una falla del equipo. La máquina puede estar disponible, pero no puede operar por una condición del producto o por su ausencia. Solo 4 hojas, pero es donde más se confunde.',
    clave: [
      'Falta MMPP: no hay materia prima disponible para continuar; la línea queda esperando producto.',
      'Atascamiento: bloqueo o taco de producto dentro del proceso, por condición del producto o mala circulación.',
      'Acumulación rechazo: el rechazo acumulado interfiere con el flujo y obliga a detener para despejar.',
      'Materia prima inactiva: mortalidad o pescado muerto que altera el ritmo de alimentación y genera pérdida de tiempo. Hay producto, pero su condición retrasa el proceso.',
    ],
    terreno: [
      'Falta MMPP vs Materia prima inactiva: si NO hay pescado, es Falta MMPP; si hay pescado pero viene muerto y retrasa, es Materia prima inactiva.',
      'MMPP vs Insumos: falta de pescado es MMPP; falta de bolsas o etiquetas es Abastecimiento > Insumos / Bodegas.',
      'Atascamiento vs Mecánica: si el taco lo produjo la condición del producto, es Atascamiento; si lo produjo una pieza rota, la causa es la pieza.',
      'Si la acumulación se originó por una cinta rota o una falla técnica clara, se imputa la causa inicial, no la acumulación.',
    ],
  },
  {
    id: 'imp-08-operacionales',
    title: 'Operacionales',
    intro: 'Detenciones provocadas por ejecución operativa, coordinación, ajustes, esperas o actividades no planificadas del proceso. Son 10 hojas y conviene conocerlas bien: es la categoría que más se usa mal, porque parece servir para todo.',
    clave: [
      'Ajuste mantenimiento: intervención menor de mantenimiento para corregir, regular o dejar operativo el equipo.',
      'Ajuste operador: el operador detiene para corregir parámetros o condiciones de operación.',
      'Cambio lote / MMPP: transición entre lotes o cambios vinculados a la materia prima.',
      'Contrastación: tiempo para contrastar, verificar o validar equipos o resultados.',
      'Emergencia / Evacuación: condición de seguridad, alarma, emergencia real o evacuación.',
      'Falla operacional: error de operación o ejecución que no encaja mejor en otra categoría más específica.',
      'Liberación: espera por autorización, liberación o validación para seguir operando.',
      'Retraso aseo: el aseo o la sanitización no terminó a tiempo.',
      'Tiempo de respuestas: espera por atención, soporte, definición o llegada del personal necesario.',
      'Trabajos contratistas / propios: ejecución de trabajos planificados o necesarios, internos o externos.',
    ],
    terreno: [
      'Ajuste mantenimiento vs Ajuste operador: la diferencia es QUIÉN interviene, no qué se toca. Si fue mantención, es Ajuste mantenimiento — y ese tiempo entra en la cuenta de Mantención, así que registrarlo bien es lo que permite mostrar la intervención.',
      '"Falla operacional" es la última opción. Antes de usarla, descarta MMPP, aseo, cambio de lote, liberación y ajuste.',
      'Cambio lote / MMPP es OPERACIONAL, no MMPP, aunque el nombre lleve la sigla. Es tiempo de transición planificable, no falta de producto.',
    ],
  },
  {
    id: 'imp-09-programados',
    title: 'Paros Programados',
    intro: 'Pausas previstas por organización del turno, metas o planificación operacional. No son fallas y no deben contarse como pérdidas de equipo: si se imputan como falla, inflan artificialmente la pérdida de Mantención.',
    clave: [
      'Cambio turno: pausa programada por relevo entre turnos.',
      'Colación: pausa planificada para alimentación del personal.',
      'Reunión inicio turno: reunión planificada de inicio o coordinación.',
      'Detención programada: paro planificado previamente por agenda de producción, mantención u organización.',
      'Ejercicio compensatorio - Paro: pausa programada definida por la organización.',
      'Cumplimiento cuota: paro por alcanzar la meta o el criterio de producción definido.',
    ],
    terreno: [
      'Una detención programada nunca es una falla imprevista: si se anota como falla, el turno aparece con una pérdida de equipo que no existió.',
      'Cumplimiento cuota es un paro previsto, pero no es tiempo perdido por planificación de mantención: es la línea que llegó a su meta.',
    ],
  },
  {
    id: 'imp-10-del-registro-al-kpi',
    title: 'Qué pasa con tu imputación después (y por qué importa)',
    intro: 'Esta lección no está en el curso original y es la razón de fondo para imputar bien. Lo que se anota en la detención no se queda ahí: alimenta la cascada de pérdidas del turno, el Pareto por causal y los indicadores con los que se discute el desempeño de la planta.',
    clave: [
      'Cada causal tiene un dueño en la cascada de pérdidas: Abastecimiento y MMPP caen en externo, Eléctrica y Mecánica en mantención, Paros Programados en planificado.',
      'Si una pérdida externa se imputa como falla de equipo, esa pérdida se le carga a Mantención en el reporte del turno.',
      'Al revés también cuenta: Ajuste mantenimiento y Trabajos contratistas / propios son tiempo de Mantención. Registrarlos bien es lo que permite mostrar el trabajo hecho, no esconderlo.',
      'El Pareto del turno ordena las causales por tiempo perdido. Con imputaciones correctas señala dónde atacar; con imputaciones cómodas, señala "Falla operacional" y no sirve para nada.',
      'El MTTR y el MTBF se calculan sobre las detenciones imputadas a falla: una falla mal clasificada distorsiona los dos indicadores.',
    ],
    terreno: [
      'Seis hojas viven en DOS categorías a la vez: Motores, Balanzas, Bombas, Cintas, Estación de Calidad y Grader existen en Falla Eléctrica y en Falla Mecánica. El sistema recibe la hoja sola ("MOTORES"), sin la ruta completa, así que desde el dato NO se puede saber cuál de las dos fue.',
      'Por eso, en esas seis, escribe en el comentario si fue eléctrica o mecánica. Es la única forma de que el Pareto "eléctrica vs mecánica" sea real. Para la cascada da igual (ambas son mantención); para decidir dónde reforzar, no.',
      'Un comentario útil tiene tres cosas: qué se vio, qué se hizo y si quedó operativo o pendiente. Con eso la detención sirve como historial del equipo, no solo como tiempo perdido.',
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// PRÁCTICA
// ════════════════════════════════════════════════════════════════════════════

const PROCEDURES = [
  {
    id: 'imp-proc-imputar-paso-a-paso',
    title: 'Imputar una detención paso a paso',
    description: 'El orden que evita casi todos los errores de clasificación.\n\nEjemplo: la línea se detiene y el operador avisa que "la máquina no acciona". Al revisar, la red de aire está en 3 bar. La imputación no es de la máquina: es Falla Abastecimiento / Servicios > Aire.',
    steps: [
      'Pregunta qué pasó PRIMERO, no qué se vio al final. Si hay una cadena de eventos, quédate con el primer eslabón.',
      '¿Estaba planificado? Si sí, es Paros Programados y terminaste.',
      '¿Faltó un servicio (agua, aire, energía, Flow Ice, Innova, SAP, insumos)? Si sí, es Abastecimiento / Servicios.',
      '¿Faltó o se trancó el producto? Si sí, es MMPP.',
      '¿Se rompió, se trabó o se desajustó algo físico? Es Mecánica. ¿Fue señal, control, comando o protección? Es Eléctrica.',
      'Si nada de lo anterior aplica, recién ahí es Operacionales: elige la hoja específica (liberación, aseo, ajuste, espera) antes de usar "Falla operacional".',
      'Escribe el comentario: qué se vio, qué se hizo, si quedó operativo. En las 6 hojas ambiguas, anota si fue eléctrica o mecánica.',
    ],
  },
  {
    id: 'imp-proc-electrica-o-mecanica',
    title: 'Decidir entre Falla Eléctrica y Falla Mecánica',
    description: 'Las dos categorías comparten seis hojas (Motores, Balanzas, Bombas, Cintas, Estación de Calidad, Grader), así que la distinción hay que hacerla en terreno y dejarla escrita.\n\nEjemplo: el motor no gira y la protección está disparada. Si al girarlo a mano está trabado, es mecánica: la protección disparó por consecuencia.',
    steps: [
      'Verifica si el elemento se mueve libremente a mano (con el equipo seguro y bloqueado).',
      'Si está duro, trabado, roto o desalineado: Falla Mecánica.',
      'Si se mueve libre pero no recibe orden, no tiene tensión o la protección lo corta sin carga: Falla Eléctrica.',
      'Si la protección disparó, pregunta por qué: sobrecarga mecánica es mecánica; falla de circuito o de comando es eléctrica.',
      'Descarta que sea falta de energía general del sector: eso es Abastecimiento / Servicios > Energía, no una falla del equipo.',
      'Anota en el comentario cuál de las dos fue: el sistema recibe la hoja sin la ruta y no puede distinguirlo solo.',
    ],
  },
  {
    id: 'imp-proc-mmpp-o-abastecimiento',
    title: 'Decidir entre MMPP y Abastecimiento / Servicios',
    description: 'Los dos son "falta algo", pero se cargan a lugares distintos y el error es frecuente.\n\nEjemplo: la línea para porque no llegaron etiquetas. No es MMPP: es Abastecimiento / Servicios > Insumos / Bodegas.',
    steps: [
      'Pregunta qué faltó exactamente.',
      'Si faltó materia prima principal (pescado): MMPP > Falta MMPP.',
      'Si faltó material de empaque o auxiliar (bolsas, etiquetas, film, cajas): Abastecimiento / Servicios > Insumos / Bodegas.',
      'Si faltó un servicio (agua, aire, energía, Flow Ice) o un sistema (Innova, SAP): Abastecimiento / Servicios, en su hoja.',
      'Si hay pescado pero viene muerto y retrasa el proceso: MMPP > Materia prima inactiva, no Falta MMPP.',
    ],
  },
  {
    id: 'imp-proc-cascada-causa-inicial',
    title: 'Detención encadenada: imputar la causa inicial',
    description: 'Cuando una falla provoca otra, se imputa la primera. Es el error que más distorsiona el Pareto, porque el efecto suele durar más que la causa y parece "lo importante".\n\nEjemplo: se rompe una cinta, el producto se acumula aguas arriba y hay que parar a despejar. La imputación es la cinta (Mecánica), no Acumulación rechazo.',
    steps: [
      'Reconstruye la secuencia: ¿qué pasó primero, qué pasó después?',
      'Identifica el primer evento que rompió la operación normal.',
      'Imputa ese evento, con su categoría y su hoja.',
      'Si el efecto posterior tuvo tiempo propio y separable (por ejemplo, despejar la línea después de reparar), regístralo aparte y explícalo en el comentario.',
      'No abras una detención nueva por cada consecuencia de la misma causa: infla el conteo de eventos y arruina el MTBF.',
    ],
  },
  {
    id: 'imp-proc-operacional-o-programado',
    title: 'Decidir entre Operacionales y Paros Programados',
    description: 'La pregunta que separa las dos categorías es si la pausa estaba prevista.\n\nEjemplo: la línea se detiene para cambio de lote. Aunque sea rutinario, no es paro programado: es Operacionales > Cambio lote / MMPP.',
    steps: [
      '¿La pausa estaba prevista en la organización del turno (colación, cambio de turno, reunión, detención agendada)? Es Paros Programados.',
      '¿Es una actividad del proceso que ocurre cuando toca, pero no está agendada (cambio de lote, ajuste, contrastación, liberación)? Es Operacionales.',
      'Si es una espera, elige la hoja por lo que se está esperando: autorización es Liberación; personal o soporte es Tiempo de respuestas; aseo es Retraso aseo.',
      'Si intervino mantención, es Ajuste mantenimiento o Trabajos contratistas / propios, no "Falla operacional".',
      'Deja "Falla operacional" solo para el error de ejecución que no encaja en ninguna hoja más específica.',
    ],
  },
  {
    id: 'imp-proc-comentario-util',
    title: 'Escribir un comentario que sirva después',
    description: 'La causal clasifica; el comentario explica. Sin comentario, la detención es un número de minutos sin historia.\n\nEjemplo útil: "Sensor de posición S3 sin confirmar, se limpió y se reapretó conector, quedó operativo. Reincidente: 3ª vez este mes."',
    steps: [
      'Escribe qué se vio (el síntoma concreto, con nombre de componente si lo tienes).',
      'Escribe qué se hizo (la acción, no la intención).',
      'Escribe cómo quedó: operativo, operativo con pendiente, o detenido a la espera de repuesto.',
      'Si la hoja es una de las seis ambiguas (Motores, Balanzas, Bombas, Cintas, Estación de Calidad, Grader), indica si fue eléctrica o mecánica.',
      'Si es reincidente, dilo: es el dato que convierte una detención suelta en una causa a atacar.',
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CASOS — flujos (señal -> acción)
// ════════════════════════════════════════════════════════════════════════════

const FLOWS = [
  {
    id: 'imp-flow-sin-aire',
    title: 'La máquina no acciona y sospecho del aire',
    trigger: 'Cilindros, actuadores o válvulas neumáticas no responden.',
    actions: [
      'Verifica la presión de la red en el manómetro del sector.',
      'Si la presión está baja o no hay aire: Falla Abastecimiento / Servicios > Aire.',
      'Si la presión está normal y falla un solo actuador o electroválvula: es del equipo, revisa si es eléctrica (bobina, señal) o mecánica (vástago trabado).',
      'Comprueba si hay otros equipos afectados: si sí, refuerza que el origen es la red.',
    ],
  },
  {
    id: 'imp-flow-corte-energia',
    title: 'Se cortó la energía del sector',
    trigger: 'Varios equipos se detienen a la vez o el tablero general queda sin alimentación.',
    actions: [
      'Confirma el alcance: ¿un equipo o toda la zona?',
      'Si es general o externo al equipo: Falla Abastecimiento / Servicios > Energía.',
      'Imputa Energía en los equipos afectados; no repartas la causa entre las causales propias de cada máquina.',
      'Si fue solo un equipo por su propia protección o circuito: Falla Eléctrica, en la hoja del equipo.',
    ],
  },
  {
    id: 'imp-flow-motor-no-gira',
    title: 'El motor no gira',
    trigger: 'Un motor no parte o se detiene durante la operación.',
    actions: [
      'Con el equipo bloqueado, verifica si el eje gira libre a mano.',
      'Trabado o duro: Falla Mecánica > Motores (Mecánica).',
      'Gira libre pero no arranca (sin comando, protección disparada sin carga, falla de circuito): Falla Eléctrica > Motores.',
      'Anota en el comentario cuál de las dos fue: la hoja "Motores" existe en ambas categorías.',
    ],
  },
  {
    id: 'imp-flow-acumulacion',
    title: 'Se acumuló producto y hay que parar',
    trigger: 'El flujo se tranca o el rechazo se acumula y obliga a detener.',
    actions: [
      '¿Hubo antes una falla técnica (cinta, motor, guía)? Entonces imputa esa falla, no la acumulación.',
      'Si el taco es por condición del producto o mala circulación: MMPP > Atascamiento.',
      'Si es rechazo acumulado que interfiere con el flujo: MMPP > Acumulación rechazo.',
      'Deja escrito en el comentario si la acumulación fue causa o consecuencia.',
    ],
  },
  {
    id: 'imp-flow-espera-producto',
    title: 'La línea está esperando producto',
    trigger: 'No entra materia prima y la línea queda detenida.',
    actions: [
      '¿No hay pescado disponible? MMPP > Falta MMPP.',
      '¿Hay pescado pero viene muerto o sin actividad y retrasa el manejo? MMPP > Materia prima inactiva.',
      '¿Lo que falta es empaque o material auxiliar? Abastecimiento / Servicios > Insumos / Bodegas.',
      '¿Se está esperando una autorización para seguir? Operacionales > Liberación.',
    ],
  },
  {
    id: 'imp-flow-sistema-no-deja',
    title: 'El sistema no deja avanzar',
    trigger: 'No se puede registrar, liberar o continuar por causa de un sistema.',
    actions: [
      'Si el bloqueo es de SAP: Abastecimiento / Servicios > SAP.',
      'Si el bloqueo es de Innova (trazabilidad, validación, avance de lote): Abastecimiento / Servicios > Innova.',
      'Si el sistema funciona y el problema fue de uso u operación: Operacionales > Falla operacional.',
      'Si lo que falta es la autorización de alguien, no el sistema: Operacionales > Liberación.',
    ],
  },
  {
    id: 'imp-flow-planificado',
    title: 'La detención estaba planificada',
    trigger: 'La línea para por una pausa prevista.',
    actions: [
      'Colación, cambio de turno o reunión de inicio: Paros Programados, en su hoja.',
      'Paro agendado de producción o mantención: Paros Programados > Detención programada.',
      'Se alcanzó la meta de producción: Paros Programados > Cumplimiento cuota.',
      'Si la pausa NO estaba prevista aunque sea rutinaria (cambio de lote, ajuste): es Operacionales.',
      'Nunca imputes un paro programado como falla: infla la pérdida de equipo del turno.',
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CASOS — diagnóstico (síntoma -> causas -> solución)
// ════════════════════════════════════════════════════════════════════════════

const DIAGNOSIS = [
  {
    id: 'imp-dx-etiquetas-como-mmpp',
    title: 'Falta de etiquetas imputada como MMPP',
    symptom: 'La línea para por falta de etiquetas o bolsas y la detención queda registrada en MMPP.',
    possibleCauses: [
      'Se asocia "faltó material" con materia prima',
      'La hoja Insumos / Bodegas no se conoce o no se busca',
    ],
    solution: 'Corresponde a Falla Abastecimiento / Servicios > Insumos / Bodegas. MMPP es la materia prima principal del proceso (el pescado); el material de empaque y auxiliar es insumo. Impacto de la confusión: la pérdida se le carga al flujo de producto en vez de a bodega, y el Pareto no muestra el problema de abastecimiento que sí existe.',
  },
  {
    id: 'imp-dx-sensor-como-ajuste',
    title: 'Sensor sin confirmar imputado como ajuste del operador',
    symptom: 'La Baader no parte porque un sensor no confirma posición, y se registra como Ajuste operador.',
    possibleCauses: [
      'El operador intervino para destrabar la condición y se imputa a quien intervino',
      'No se distingue entre corregir un parámetro y una falla de control',
    ],
    solution: 'Corresponde a Falla Eléctrica > Baader 142 > Lógica: la causa es una condición de control que no se cumple, no un ajuste de proceso. Ajuste operador es cuando el operador corrige parámetros por decisión operativa, sin falla detrás. Impacto: las fallas de lógica desaparecen del Pareto y no se llega nunca al sensor reincidente.',
  },
  {
    id: 'imp-dx-cinta-electrica-o-mecanica',
    title: 'Cinta detenida: no se sabe si fue eléctrica o mecánica',
    symptom: 'La detención dice "Cintas" pero el reporte no permite saber en qué categoría cae.',
    possibleCauses: [
      'La hoja Cintas existe en Falla Eléctrica y en Falla Mecánica',
      'El sistema recibe la hoja sin la ruta completa del árbol',
      'El comentario no aclara el tipo de falla',
    ],
    solution: 'Determina en terreno: si la cinta está trabada, rota o desalineada es mecánica; si no recibe comando, no tiene tensión o falla el variador es eléctrica. Anótalo en el comentario. Aplica igual a Motores, Balanzas, Bombas, Estación de Calidad y Grader: son las 6 hojas compartidas.',
  },
  {
    id: 'imp-dx-rodamiento-como-electrica',
    title: 'Rodamiento tomado imputado como falla eléctrica',
    symptom: 'El motor no gira, la protección disparó y se imputa a Falla Eléctrica > Motores.',
    possibleCauses: [
      'La protección disparada se lee como falla eléctrica',
      'No se verificó el giro libre del eje antes de imputar',
    ],
    solution: 'La protección disparó por sobrecarga mecánica: la causa es Falla Mecánica > Motores (Mecánica). Verifica el giro a mano con el equipo bloqueado antes de decidir. Impacto: se busca el problema en el tablero mientras el rodamiento sigue destruyéndose, y la falla vuelve.',
  },
  {
    id: 'imp-dx-cinta-rota-como-acumulacion',
    title: 'Cinta rota imputada como acumulación de rechazo',
    symptom: 'Se rompe una cinta, el producto se acumula y la detención queda imputada a MMPP > Acumulación rechazo.',
    possibleCauses: [
      'Se imputa el efecto más visible (la acumulación) en vez de la causa',
      'El tiempo de despeje es mayor que el de la falla y parece lo principal',
    ],
    solution: 'Se imputa la causa inicial: Falla Mecánica > Equipo Auxiliar > Cintas. Impacto de la confusión: una falla de mantención se registra como problema de flujo de producto, la pérdida cambia de dueño y la cinta reincidente nunca aparece en el Pareto.',
  },
  {
    id: 'imp-dx-pescado-muerto-como-falta',
    title: 'Pescado muerto imputado como Falta MMPP',
    symptom: 'Ingresa mortalidad, el proceso se ralentiza y se registra como Falta MMPP.',
    possibleCauses: [
      'Ambas hojas son de la misma categoría y se usan indistintamente',
      'No se distingue ausencia de producto de condición del producto',
    ],
    solution: 'Corresponde a MMPP > Materia prima inactiva: hay producto, pero su condición (mortalidad, pescado muerto) genera el retraso. Falta MMPP es cuando NO hay producto para alimentar. Impacto: se pierde la trazabilidad del problema de calidad de la materia prima recibida.',
  },
  {
    id: 'imp-dx-corte-general-repartido',
    title: 'Corte general repartido entre las causales de cada equipo',
    symptom: 'Un corte de energía del sector aparece en el reporte como varias fallas distintas, una por máquina.',
    possibleCauses: [
      'Cada equipo se imputa por su propia causal al quedar detenido',
      'No se identifica que el origen es único y externo',
    ],
    solution: 'Todos los equipos afectados se imputan a Falla Abastecimiento / Servicios > Energía. Impacto: repartir el corte entre causales de equipo genera fallas de mantención que no ocurrieron y esconde el problema real de suministro.',
  },
  {
    id: 'imp-dx-ajuste-mantencion-invisible',
    title: 'Trabajo de mantención registrado como falla operacional',
    symptom: 'Mantención interviene para regular una guía o un sensor y la detención queda como Falla operacional.',
    possibleCauses: [
      '"Falla operacional" se usa como cajón de sastre',
      'No se distingue quién intervino',
    ],
    solution: 'Corresponde a Operacionales > Ajuste mantenimiento (o Trabajos contratistas / propios si es un trabajo planificado). Es la hoja que hace visible la intervención de Mantención: usarla mal borra del registro el trabajo realizado, y después no hay cómo mostrarlo con datos.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// EXAMEN — 30 preguntas (base: las 80 del curso original, deduplicadas y con
// explicación; se agregaron 2 sobre el uso posterior del dato)
// ════════════════════════════════════════════════════════════════════════════

const QUIZ = [
  {
    id: 'imp-q-01-que-se-imputa',
    question: '¿Qué se debe imputar en una detención?',
    options: ['El último equipo que se detuvo', 'La causa que originó la detención', 'El área con más tiempo perdido'],
    correctIndex: 1,
    explanation: 'Regla de oro del curso: se imputa la causa que originó el paro, no el efecto visible ni el equipo que quedó detenido.',
  },
  {
    id: 'imp-q-02-mala-imputacion',
    question: 'Imputar por el efecto y no por la causa genera:',
    options: ['Distorsión del análisis', 'Más precisión en el reporte', 'Ningún impacto real'],
    correctIndex: 0,
    explanation: 'El error no se ve al momento: aparece después, como un Pareto que apunta a la causa equivocada y decisiones tomadas sobre un dato falso.',
  },
  {
    id: 'imp-q-03-causa-raiz',
    question: 'La causa raíz de una detención es:',
    options: ['El síntoma visible', 'El comentario del operador', 'El origen real del paro'],
    correctIndex: 2,
    explanation: 'El síntoma es lo que se ve (máquina parada); la causa raíz es lo que lo originó. Se imputa la segunda.',
  },
  {
    id: 'imp-q-04-aire',
    question: 'Falta aire comprimido en la red y la máquina no acciona. Corresponde a:',
    options: ['Falla Abastecimiento / Servicios > Aire', 'Falla Eléctrica > Motores', 'Operacionales > Ajuste operador'],
    correctIndex: 0,
    explanation: 'La máquina está sana; le falta un servicio de soporte. Si la presión hubiera estado normal, habría seguido trabajando.',
  },
  {
    id: 'imp-q-05-etiquetas',
    question: 'La línea se detiene porque no llegaron etiquetas desde bodega. Corresponde a:',
    options: ['MMPP > Falta MMPP', 'Abastecimiento / Servicios > Insumos / Bodegas', 'Operacionales > Liberación'],
    correctIndex: 1,
    explanation: 'MMPP es la materia prima principal (el pescado). Etiquetas, bolsas, film y cajas son insumos: van a Insumos / Bodegas.',
  },
  {
    id: 'imp-q-06-corte-sector',
    question: 'Varias máquinas se detienen por un corte de energía del sector. Corresponde a:',
    options: ['Falla Eléctrica > Motores en cada equipo', 'Operacionales', 'Abastecimiento / Servicios > Energía'],
    correctIndex: 2,
    explanation: 'El origen es externo y único. Repartirlo entre las causales de cada máquina inventa fallas de equipo que no ocurrieron.',
  },
  {
    id: 'imp-q-07-sap',
    question: 'No se puede registrar el avance del proceso porque SAP está caído. Corresponde a:',
    options: ['Abastecimiento / Servicios > SAP', 'Operacionales > Falla operacional', 'MMPP'],
    correctIndex: 0,
    explanation: 'SAP e Innova son sistemas de soporte: cuando su indisponibilidad detiene el proceso, la causal es de Abastecimiento / Servicios.',
  },
  {
    id: 'imp-q-08-agua',
    question: 'El proceso requiere agua y no hay presión en la red. Corresponde a:',
    options: ['Falla Mecánica > Bombas', 'Abastecimiento / Servicios > Agua', 'Operacionales > Liberación'],
    correctIndex: 1,
    explanation: 'Es falta del servicio. Solo sería mecánica si la falla estuviera en una bomba propia del equipo.',
  },
  {
    id: 'imp-q-09-logica',
    question: 'La Baader 142 no parte porque un sensor no confirma posición y la secuencia queda bloqueada. Corresponde a:',
    options: ['Falla Mecánica > Correas', 'Operacionales > Ajuste operador', 'Falla Eléctrica > Baader 142 > Lógica'],
    correctIndex: 2,
    explanation: 'Es una condición de control que no se cumple: secuencia, permisos, sensores y enclavamientos son Lógica.',
  },
  {
    id: 'imp-q-10-cinta-electrica',
    question: 'Una cinta no parte porque no recibe comando de marcha. Corresponde a:',
    options: ['Falla Eléctrica > Equipo Auxiliar > Cintas', 'Falla Mecánica > Equipo Auxiliar > Cintas', 'MMPP > Atascamiento'],
    correctIndex: 0,
    explanation: 'Falta de comando, señal, variador o alimentación es eléctrica. Si la cinta estuviera trabada o rota, sería mecánica.',
  },
  {
    id: 'imp-q-11-proteccion',
    question: 'Un motor no arranca por una protección disparada, sin carga mecánica anormal. Corresponde a:',
    options: ['Paros Programados', 'Falla Eléctrica > Motores', 'MMPP'],
    correctIndex: 1,
    explanation: 'Protección, comando y circuito son eléctricos. Distinto es cuando la protección dispara por sobrecarga mecánica: ahí la causa es mecánica.',
  },
  {
    id: 'imp-q-12-no-es-electrica',
    question: 'Una falla eléctrica NO incluye:',
    options: ['Secuencia bloqueada', 'Falta de comando de marcha', 'Rodamiento tomado'],
    correctIndex: 2,
    explanation: 'Rodamiento tomado, eje trabado o acople dañado son Falla Mecánica > Motores (Mecánica), aunque haya disparado la protección.',
  },
  {
    id: 'imp-q-13-rodamiento',
    question: 'El motor intenta girar pero el rodamiento está tomado. Corresponde a:',
    options: ['Falla Eléctrica', 'Falla Mecánica', 'Operacionales'],
    correctIndex: 1,
    explanation: 'Hay una condición física que impide el giro. Verifica siempre el giro libre a mano, con el equipo bloqueado, antes de imputar eléctrica.',
  },
  {
    id: 'imp-q-14-cuchillos',
    question: 'El corte sale defectuoso porque los cuchillos están desgastados. Corresponde a:',
    options: ['Baader 142 > Cuchillos / Guillotinas', 'Baader 142 > Lógica', 'Abastecimiento / Servicios > SAP'],
    correctIndex: 0,
    explanation: 'Desgaste, rotura o mala regulación física del sistema de corte es mecánica, no un ajuste operacional.',
  },
  {
    id: 'imp-q-15-punto-cero',
    question: 'El equipo perdió su referencia física y necesita recuperar el ajuste base. Corresponde a:',
    options: ['Operacionales > Tiempo de respuestas', 'Falla Mecánica > Punto Cero', 'Falla Eléctrica > Lógica'],
    correctIndex: 1,
    explanation: 'Punto Cero es la pérdida de la referencia mecánica base del equipo.',
  },
  {
    id: 'imp-q-16-no-es-mecanica',
    question: 'Una falla mecánica NO corresponde a:',
    options: ['Correa cortada', 'Sensor sin señal', 'Rodamiento tomado'],
    correctIndex: 1,
    explanation: 'Sensores, señales y secuencias son Falla Eléctrica > Lógica. La mecánica es daño físico, desgaste o trabamiento.',
  },
  {
    id: 'imp-q-17-falta-mmpp',
    question: 'La línea queda esperando porque no llegó pescado. Corresponde a:',
    options: ['MMPP > Falta MMPP', 'Falla Mecánica', 'Paros Programados > Cambio turno'],
    correctIndex: 0,
    explanation: 'Ausencia de materia prima principal disponible para continuar la producción.',
  },
  {
    id: 'imp-q-18-atascamiento',
    question: 'El producto se tranca dentro del proceso, sin que se haya roto nada. Corresponde a:',
    options: ['Falla Mecánica > Cintas', 'Abastecimiento / Servicios > SAP', 'MMPP > Atascamiento'],
    correctIndex: 2,
    explanation: 'Taco por condición del producto o mala circulación es Atascamiento. Si el taco lo produjo una pieza rota, se imputa la pieza.',
  },
  {
    id: 'imp-q-19-materia-inactiva',
    question: 'Hay pescado, pero viene muerto y retrasa el manejo del flujo. Corresponde a:',
    options: ['MMPP > Materia prima inactiva', 'MMPP > Falta MMPP', 'Abastecimiento / Servicios > Energía'],
    correctIndex: 0,
    explanation: 'Hay producto, pero su condición (mortalidad) genera la pérdida. Falta MMPP es cuando NO hay producto.',
  },
  {
    id: 'imp-q-20-no-es-mmpp',
    question: 'MMPP NO corresponde a:',
    options: ['Atascamiento de producto', 'Falta de pescado', 'Rotura de una cinta'],
    correctIndex: 2,
    explanation: 'La rotura de una cinta es Falla Mecánica, aunque provoque acumulación de producto: se imputa la causa inicial.',
  },
  {
    id: 'imp-q-21-cascada',
    question: 'Una falla técnica provoca acumulación de producto y hay que parar a despejar. Se imputa:',
    options: ['La acumulación, que duró más', 'La causa técnica inicial', 'Las dos, como detenciones separadas'],
    correctIndex: 1,
    explanation: 'Cuando una falla provoca otra, se imputa la primera. Imputar el efecto cambia el dueño de la pérdida y esconde la falla reincidente.',
  },
  {
    id: 'imp-q-22-ajuste-operador',
    question: 'El operador detiene brevemente para corregir una regulación del proceso. Corresponde a:',
    options: ['Falla Mecánica', 'Operacionales > Ajuste operador', 'Abastecimiento / Servicios > Agua'],
    correctIndex: 1,
    explanation: 'Ajuste operador es corrección de parámetros o condiciones de operación, sin una falla detrás.',
  },
  {
    id: 'imp-q-23-ajuste-mantencion',
    question: 'Mantención interviene para regular una guía y dejar el equipo operativo. Corresponde a:',
    options: ['Operacionales > Ajuste mantenimiento', 'Operacionales > Falla operacional', 'Paros Programados > Detención programada'],
    correctIndex: 0,
    explanation: 'La diferencia con Ajuste operador es QUIÉN interviene. Registrarlo bien es lo que deja constancia del trabajo de Mantención.',
  },
  {
    id: 'imp-q-24-liberacion',
    question: 'La línea espera una autorización para continuar. Corresponde a:',
    options: ['Paros Programados > Cumplimiento cuota', 'Falla Eléctrica > Lógica', 'Operacionales > Liberación'],
    correctIndex: 2,
    explanation: 'Liberación es la espera por autorización, liberación o validación para seguir operando.',
  },
  {
    id: 'imp-q-25-tiempo-respuestas',
    question: 'La línea está detenida esperando que llegue el soporte técnico. Corresponde a:',
    options: ['Operacionales > Tiempo de respuestas', 'MMPP > Falta MMPP', 'Falla Mecánica > Punto Cero'],
    correctIndex: 0,
    explanation: 'Tiempo de respuestas es la espera por atención, soporte, definición o llegada del personal necesario.',
  },
  {
    id: 'imp-q-26-retraso-aseo',
    question: 'La producción no puede partir porque el aseo no terminó a tiempo. Corresponde a:',
    options: ['Paros Programados > Colación', 'Operacionales > Retraso aseo', 'Falla Mecánica'],
    correctIndex: 1,
    explanation: 'Hoja específica de Operacionales. Usar "Falla operacional" acá esconde un problema de coordinación que sí se puede corregir.',
  },
  {
    id: 'imp-q-27-cambio-lote',
    question: 'La línea se detiene para hacer cambio de lote. Corresponde a:',
    options: ['MMPP > Falta MMPP', 'Paros Programados > Detención programada', 'Operacionales > Cambio lote / MMPP'],
    correctIndex: 2,
    explanation: 'Aunque la hoja lleve la sigla MMPP, es Operacional: es tiempo de transición del proceso, no falta de producto.',
  },
  {
    id: 'imp-q-28-colacion',
    question: 'Colación, cambio de turno y reunión de inicio corresponden a:',
    options: ['Paros Programados', 'Operacionales', 'Falla Abastecimiento / Servicios'],
    correctIndex: 0,
    explanation: 'Son pausas previstas por la organización del turno. Imputarlas como falla infla artificialmente la pérdida de equipo.',
  },
  {
    id: 'imp-q-29-hojas-ambiguas',
    question: 'La detención llega al sistema como "MOTORES", sin la ruta completa. ¿Qué hay que hacer para que el Pareto distinga eléctrica de mecánica?',
    options: [
      'Nada: el sistema lo deduce por el equipo',
      'Cambiar la causal a una hoja que exista en una sola categoría',
      'Escribir en el comentario si fue eléctrica o mecánica',
    ],
    correctIndex: 2,
    explanation: 'Seis hojas (Motores, Balanzas, Bombas, Cintas, Estación de Calidad, Grader) existen en Falla Eléctrica y en Falla Mecánica, y el dato llega sin la ruta. Solo el comentario permite distinguirlas.',
  },
  {
    id: 'imp-q-30-para-que-sirve',
    question: '¿Para qué sirve, en concreto, imputar bien una detención?',
    options: [
      'Para que la pérdida se le asigne al dueño correcto y el Pareto muestre dónde atacar',
      'Para cerrar el registro más rápido al final del turno',
      'Para justificar el tiempo perdido ante producción',
    ],
    correctIndex: 0,
    explanation: 'La causal define el dueño de la pérdida en la cascada del turno (mantención, externo o planificado) y alimenta el Pareto, el MTTR y el MTBF. Mal imputada, la pérdida cambia de dueño y el análisis apunta al lugar equivocado.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// GLOSARIO
// ════════════════════════════════════════════════════════════════════════════

const GLOSSARY = [
  { term: 'Imputar', definition: 'Asignar una detención a la causa que originó la pérdida de tiempo, usando la estructura oficial de clasificación.', lesson: 1 },
  { term: 'Causa raíz', definition: 'El origen real del paro, no el síntoma visible ni el equipo que quedó detenido.', lesson: 2 },
  { term: 'Efecto / síntoma', definition: 'Lo que se ve cuando la línea para (máquina detenida, producto acumulado). No es lo que se imputa.', lesson: 2 },
  { term: 'Hoja', definition: 'La causal específica al final del árbol (ej: Aire, Lógica, Punto Cero). El árbol tiene 46.', lesson: 3 },
  { term: 'MMPP', definition: 'Materia prima principal del proceso (el pescado). No incluye insumos ni material de empaque.', lesson: 7 },
  { term: 'Insumos / Bodegas', definition: 'Material auxiliar y de empaque: bolsas, etiquetas, film, cajas. Es Abastecimiento, no MMPP.', lesson: 4 },
  { term: 'Flow Ice', definition: 'Sistema de hielo líquido que abastece la línea; su indisponibilidad es Abastecimiento / Servicios.', lesson: 4 },
  { term: 'Innova', definition: 'Sistema de trazabilidad y validación del proceso; si bloquea la operación, es Abastecimiento / Servicios.', lesson: 4 },
  { term: 'SAP', definition: 'Sistema de gestión; su caída o bloqueo, cuando impide continuar, es Abastecimiento / Servicios.', lesson: 4 },
  { term: 'Lógica', definition: 'Fallas de secuencia, señal, permiso de marcha, sensores o enclavamientos de la Baader 142. Categoría eléctrica.', lesson: 5 },
  { term: 'Punto Cero', definition: 'Referencia mecánica base del equipo; su pérdida obliga a recuperar la posición correcta. Categoría mecánica.', lesson: 6 },
  { term: 'Knuro', definition: 'Equipo auxiliar con hoja propia dentro de Falla Mecánica.', lesson: 6 },
  { term: 'Grader', definition: 'Clasificador de la línea. Tiene hoja en Falla Eléctrica y en Falla Mecánica: hay que aclarar cuál en el comentario.', lesson: 10 },
  { term: 'Estación de Calidad', definition: 'Puesto de control de calidad de la línea. También existe en las dos categorías de falla.', lesson: 10 },
  { term: 'Atascamiento', definition: 'Taco o bloqueo de materia prima dentro del proceso por condición del producto, no por pieza rota.', lesson: 7 },
  { term: 'Acumulación rechazo', definition: 'Rechazo acumulado que interfiere con el flujo y obliga a detener para despejar.', lesson: 7 },
  { term: 'Falta MMPP', definition: 'No hay materia prima disponible para continuar la producción.', lesson: 7 },
  { term: 'Materia prima inactiva', definition: 'Hay producto, pero viene muerto o sin actividad (mortalidad) y retrasa el proceso.', lesson: 7 },
  { term: 'Ajuste operador', definition: 'El operador detiene para corregir parámetros o condiciones de operación, sin falla detrás.', lesson: 8 },
  { term: 'Ajuste mantenimiento', definition: 'Intervención menor de mantención para dejar el equipo operativo. Es tiempo de Mantención y debe quedar registrado como tal.', lesson: 8 },
  { term: 'Liberación', definition: 'Espera por autorización, liberación o validación para seguir operando.', lesson: 8 },
  { term: 'Contrastación', definition: 'Tiempo usado para contrastar, verificar o validar equipos o resultados del proceso.', lesson: 8 },
  { term: 'Tiempo de respuestas', definition: 'Espera por atención, soporte, definición o llegada del personal necesario.', lesson: 8 },
  { term: 'Cumplimiento cuota', definition: 'Paro por haber alcanzado la meta o el criterio de producción definido. Es paro programado.', lesson: 9 },
  { term: 'Ejercicio compensatorio - Paro', definition: 'Pausa programada asociada al ejercicio compensatorio definido por la organización.', lesson: 9 },
  { term: 'Cascada de pérdidas', definition: 'Reparto del tiempo del turno entre sus dueños (mantención, externo, planificado, producción). La causal imputada define en qué bucket cae la detención.', lesson: 10 },
  { term: 'Pareto de causales', definition: 'Ranking de causas por tiempo perdido. Es el producto directo de las imputaciones del turno.', lesson: 10 },
  { term: 'MTTR / MTBF', definition: 'Tiempo medio de reparación y tiempo medio entre fallas. Se calculan sobre las detenciones imputadas a falla: una mal clasificada distorsiona ambos.', lesson: 10 },
  { term: 'OEE', definition: 'Eficiencia general del equipo (disponibilidad x rendimiento x calidad). Las detenciones mal imputadas mueven la disponibilidad al casillero equivocado.', lesson: 1 },
];

// ════════════════════════════════════════════════════════════════════════════
// BIBLIOGRAFÍA
// ════════════════════════════════════════════════════════════════════════════

const BIBLIO = [
  { label: 'Capacitación de Imputación de Fallas V12 — Roger Tornavaca Castañeda (curso interno, fuente de este módulo)', url: null },
  { label: 'Estructura vigente de clasificación de detenciones: 6 categorías y 46 causales', url: null },
  { label: 'Análisis de Turno de la app — cascada de pérdidas y Pareto por causal', url: null },
  { label: 'Registro de detenciones en Shoplogix (origen del dato que alimenta los KPIs)', url: null },
];

// ── Construcción de documentos ──────────────────────────────────────────────

function buildDocs() {
  const manual = MANUAL.map((s, i) => ({
    id: s.id,
    data: { id: s.id, title: s.title, content: manualContent(s), order: i + 1, createdAt: BASE, updatedAt: BASE },
  }));
  const procedures = PROCEDURES.map((p, i) => ({
    id: p.id,
    data: {
      id: p.id,
      title: p.title,
      description: p.description,
      steps: p.steps.map((text, j) => ({ order: j + 1, title: `Paso ${j + 1}`, description: text, imageUrl: null })),
      createdAt: BASE,
      updatedAt: BASE - i * 1000,
      createdBy: 'seed-curso-imputacion-fallas',
    },
  }));
  const flows = FLOWS.map((f, i) => ({
    id: f.id,
    data: { id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, createdAt: BASE, updatedAt: BASE - i * 1000 },
  }));
  const diagnosis = DIAGNOSIS.map((d, i) => ({
    id: d.id,
    data: { id: d.id, title: d.title, symptom: d.symptom, possibleCauses: d.possibleCauses, solution: d.solution, createdAt: BASE, updatedAt: BASE - i * 1000 },
  }));
  const quiz = QUIZ.map((qz, i) => ({
    id: qz.id,
    data: { id: qz.id, question: qz.question, options: qz.options, correctIndex: qz.correctIndex, explanation: qz.explanation, order: i + 1, createdAt: BASE, updatedAt: BASE },
  }));
  const glossary = GLOSSARY.map((g, i) => {
    const id = `${PREFIX}-glo-${String(i + 1).padStart(2, '0')}`;
    return { id, data: { id, term: g.term, definition: g.definition, lesson: g.lesson ?? null, order: i + 1, createdAt: BASE, updatedAt: BASE } };
  });
  const bibliografia = BIBLIO.map((b, i) => {
    const id = `${PREFIX}-bib-${String(i + 1).padStart(2, '0')}`;
    return { id, data: { id, label: b.label, url: b.url ?? null, order: i + 1, createdAt: BASE, updatedAt: BASE } };
  });
  return { manual, procedures, flows, diagnosis, quiz, glossary, bibliografia };
}

// ── Init Firebase Admin ──
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  let config = null;
  if (fs.existsSync(serviceAccountPath)) {
    config = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    console.log('OK serviceAccountKey.json encontrada');
  } else {
    console.log('AVISO: serviceAccountKey.json no encontrada, usando GOOGLE_APPLICATION_CREDENTIALS');
  }
  if (!admin.apps.length) {
    admin.initializeApp(config ? { credential: admin.credential.cert(config) } : {});
  }
} catch (err) {
  console.error('ERROR inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

async function seedSection(section, items) {
  let written = 0;
  for (const item of items) {
    if (!isDryRun) {
      await db.collection('learningContent').doc(SLUG).collection(section).doc(item.id).set(item.data);
    }
    written++;
  }
  return written;
}

async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('SEED — Curso "Imputación de Fallas" (learningContent/' + SLUG + ')');
  console.log('='.repeat(64));
  if (isDryRun) console.log('** MODO DRY-RUN: no se escribe en Firestore **');

  const docs = buildDocs();

  // Chequeo de calidad: el quiz no debe concentrar la respuesta en una posición.
  const dist = QUIZ.reduce((acc, q) => { acc[q.correctIndex] = (acc[q.correctIndex] || 0) + 1; return acc; }, {});
  console.log(`\nDistribución de respuestas correctas del examen: ${JSON.stringify(dist)} (de ${QUIZ.length})`);
  const idsDuplicados = QUIZ.length - new Set(QUIZ.map(q => q.id)).size;
  if (idsDuplicados) { console.error(`ERROR: hay ${idsDuplicados} ids de pregunta duplicados`); process.exit(1); }

  const m = await seedSection('manual', docs.manual);
  const p = await seedSection('procedures', docs.procedures);
  const f = await seedSection('flows', docs.flows);
  const d = await seedSection('diagnosis', docs.diagnosis);
  const q = await seedSection('quiz', docs.quiz);
  const g = await seedSection('glossary', docs.glossary);
  const b = await seedSection('bibliografia', docs.bibliografia);

  console.log(`\n[${SLUG}]`);
  console.log(`   lecciones: ${m}  ·  práctica: ${p}  ·  flujos: ${f}  ·  casos: ${d}  ·  examen: ${q}  ·  glosario: ${g}  ·  bibliografía: ${b}`);

  console.log('\n' + '-'.repeat(64));
  console.log(isDryRun
    ? 'DRY-RUN completo. Corre sin --dry-run para aplicar.'
    : 'Seed aplicado. El curso aparece en el hub una vez desplegado learningMachines.ts.');
  console.log('-'.repeat(64) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR fatal:', err.message);
  process.exit(1);
});
