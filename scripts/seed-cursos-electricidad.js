#!/usr/bin/env node
/**
 * Seed: Cursos de electricidad (Programa Mantenimiento Industrial) como temas
 * del Centro de Aprendizaje, en `learningContent`.
 *
 *   Modulo 2 -> slug `rescate-svb`  (Rescate Electrico y SVB · NFPA 70E 2024)
 *   Modulo 3 -> slug `nfpa-70b`     (Mantenimiento del Equipo Electrico · NFPA 70B 2023)
 *
 * El contenido es DIDACTICO (no transcripcion ni PDF): destila el manual oficial,
 * los audios diarizados del relator, el resumen, las pruebas y el glosario en una
 * estructura de aprendizaje. Cada tema usa las 4 pestanas de la app:
 *   manual / procedures / flows / diagnosis
 *
 * Estructura escrita (paths leidos por apps/pwa/src/services/learningContent.ts):
 *   learningContent/{slug}/manual/{id}      ManualSection { id,title,content,order,createdAt,updatedAt }
 *   learningContent/{slug}/procedures/{id}  Procedure     { id,title,description,steps[],createdAt,updatedAt }
 *   learningContent/{slug}/flows/{id}       Flow          { id,title,trigger,actions[],createdAt,updatedAt }
 *   learningContent/{slug}/diagnosis/{id}   DiagnosisEntry{ id,title,symptom,possibleCauses[],solution,createdAt,updatedAt }
 *
 * El campo `content` del manual usa el mini-formato que entiende parseManualContent()
 * (cabeceras exactas: "Medidas / tolerancias:", "Puntos clave:", "Notas operativas:").
 *
 * NOTA: para que los dos temas APAREZCAN en el hub hay que agregarlos tambien al
 * catalogo estatico apps/pwa/src/data/learningMachines.ts (area "Capacitacion /
 * Normativa") y desplegar. El contenido (este seed) es independiente.
 *
 * Idempotente: docId determinístico; re-correrlo NO duplica (setDoc por id).
 *
 * Requisitos: serviceAccountKey.json en la raiz del repo (o GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Uso:
 *   node scripts/seed-cursos-electricidad.js --dry-run   # previsualizar sin escribir
 *   node scripts/seed-cursos-electricidad.js             # sembrar / actualizar
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const isDryRun = process.argv.slice(2).includes('--dry-run');

// Timestamp fijo del contenido (idempotente + badge "Nuevo" 14 dias desde la carga).
const BASE = Date.parse('2026-06-20T12:00:00-04:00');

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
// MODULO 2 — Rescate Electrico y SVB (slug rescate-svb)
// ════════════════════════════════════════════════════════════════════════════

const M2_MANUAL = [
  {
    id: 'm2-01-marco-normativo',
    title: 'Marco normativo y objetivo del curso',
    intro: 'Objetivo: que el técnico identifique las técnicas de rescate eléctrico y soporte vital básico (SVB) con foco en seguridad eléctrica, según la NFPA 70E Ed. 2024. Esta lección ubica el curso en su contexto legal y de entrenamiento.',
    clave: [
      'La NFPA 70E es la norma (americana) de seguridad eléctrica en lugares de trabajo; en Chile es de uso obligatorio y se actualiza cada 3 años (vigente 2024).',
      'Tiene dos líneas: seguridad eléctrica y protección contra incendios.',
      'Chile la incorporó vía DS N°8 (consumo BT, reemplazo la NCh 4/2003) y Decreto 109 (instalaciones MT/AT, 2018); se derogó el Decreto 40 (hoy DS 44).',
      'El peligro eléctrico tiene consecuencias catastróficas para el personal, el equipo y la instalación; lo primero que se protege son las personas.',
      'El accidente eléctrico es la 3a causa de muerte a nivel industrial, pero la de mayor impacto. Código del Trabajo Art. 184: el empleador debe proteger la vida y salud del trabajador.',
    ],
    terreno: [
      'El entrenamiento debe ser documentado, certificado y trazable (persona calificada vs no calificada).',
      'Reentrenamiento en seguridad eléctrica: cada 3 años (o al actualizarse la norma). Rescate y liberación de contacto: anual.',
      'Meta de respuesta en un rescate: menos de 8 minutos.',
      'Autochequeo: ¿para quiénes es catastrófico el peligro eléctrico? ¿cada cuánto se reentrena el rescate?',
    ],
  },
  {
    id: 'm2-02-peligros-arco',
    title: 'Peligros eléctricos: efectos de la corriente y arco',
    intro: 'Objetivo: reconocer que le hace la electricidad al cuerpo y por qué el arco eléctrico es tan destructivo. Es la base para entender por qué el rescate eléctrico es distinto a cualquier otro.',
    medidas: [
      'Temperatura del arco eléctrico: 2.000 a 20.000 °C',
      'El cobre, al evaporarse, se expande 67.000 veces (proyecta metal a más de 1.120 km/h)',
      'Energía incidente mínima para quemadura de 2° grado: 1,2 cal/cm²',
      'El arco puede encender la ropa hasta a 3 m de distancia',
    ],
    clave: [
      'Los 4 efectos de la corriente en el cuerpo: fibrilación ventricular (la más grave), tetanización (la víctima "queda pegada"), asfixia (paro respiratorio) y quemaduras (efecto Joule).',
      'Contacto directo: tocar una parte activa en tensión. Contacto indirecto: tocar una parte que quedó en tensión accidentalmente (ej. carcasa mal aislada).',
      'El arco eléctrico se descompone en dos fenómenos: relámpago de arco (arc flash) + ráfaga/explosión de arco (onda expansiva).',
      'Quemaduras por arco (3 grados): 1° (capas externas, sin cicatriz), 2° (ampollas/flictenas, dolor intenso), 3° (destruye la piel, puede requerir injerto).',
      'Quemaduras internas: por el paso de la corriente; tienen punto de entrada y de salida; la hinchazón aparece a las 24-72 h y pueden requerir fasciotomía o amputación.',
    ],
    terreno: [
      'Caso real: un técnico puso en servicio una UPS de 380 V trabajando solo; por tetanización no pudo soltarse, sufrió quemadura interna y casi pierde el brazo. Lección: nunca trabajar solo, ser persona calificada y reportar.',
      'Autochequeo: ¿en qué 2 fenómenos se descompone el arco? ¿cuál es el efecto más grave de la corriente?',
    ],
  },
  {
    id: 'm2-03-reglas-oro-epp',
    title: 'Trabajo seguro: las 5 Reglas de Oro y el EPP',
    intro: 'Objetivo: aplicar la secuencia de trabajo sin tensión y elegir el EPP correcto para choque y para arco. Es casi seguro que cae en el examen.',
    clave: [
      'Las 5 Reglas de Oro (en orden): 1) abrir con corte visible todas las fuentes de tensión; 2) enclavar/bloquear (prevenir realimentación) + tarjeta "PELIGRO NO OPERAR"; 3) verificar ausencia de tensión; 4) puesta a tierra y en cortocircuito; 5) delimitar y señalizar la zona.',
      '3a Regla (clave): verificar el detector antes y después, en 3 puntos (probar que funciona, medir, reverificar) y para la tensión prevista.',
      'Novedad NFPA: la tarjeta de bloqueo debe llevar nombre, RUT y foto de quien bloquea.',
      'EPP contra choque: casco dieléctrico (NCh 461), guantes aislantes (NCh 1668), zapatos aislantes (NCh 2147).',
      'EPP contra arco (NFPA 70E): ropa AR (arco-resistente), careta AR, pasamontañas (esclavina).',
      'Protección contra choque: frontera limitada, puesta a tierra de protección, equipotencialidad, aislación y protecciones diferenciales. ESE = Elementos de Seguridad Eléctrica.',
    ],
    terreno: [
      'En la puesta a tierra y cortocircuito: cuchillas cerradas, pinzas con buen contacto, evitar superficies pintadas, usar conjuntos certificados (no improvisar).',
      'Autochequeo: ¿cuál es el orden de las 5 Reglas? ¿cómo se verifica la ausencia de tensión?',
    ],
  },
  {
    id: 'm2-04-hemorragias',
    title: 'Control de hemorragias',
    intro: 'Objetivo: identificar el tipo de hemorragia y detenerla con la técnica correcta. Una hemorragia no controlada lleva a shock y muerte en minutos.',
    medidas: [
      'Volumen de sangre aproximado: 70 cc por kg (ej.: 70 kg ≈ 4.900 cc)',
    ],
    clave: [
      'Hemorragia = salida incontrolada de sangre. Según origen: interna (la más grave), externa, exteriorizada (sale por orificios naturales).',
      'Según el vaso: arterial (roja rutilante, a chorro intermitente, la más grave), venosa (flujo continuo), capilar (rojo oscuro, en sábana, la más leve).',
      'Órganos que el cuerpo protege ante una pérdida de sangre: corazón, cerebro y pulmones (en ese orden).',
      'Ante hemorragia interna: NO dar nada de tomar; trasladar y controlar pulso/respiración cada 5 min.',
    ],
    terreno: [
      'Protégete siempre de los fluidos antes de actuar.',
      'Autochequeo: ¿cuál es la hemorragia más grave según el vaso? ¿qué NO se debe hacer en hemorragia interna?',
    ],
  },
  {
    id: 'm2-05-quemaduras',
    title: 'Quemaduras eléctricas',
    intro: 'Objetivo: estimar la gravedad de una quemadura y actuar en orden. En el arco, las zonas más afectadas son manos y cabeza/cuello.',
    clave: [
      'Severidad (5 factores): profundidad (1°/2°/3°) + extensión (% del cuerpo) + regiones críticas (manos, pies, cara, genitales) + edad + salud.',
      'Regla del 9%: estima la extensión dividiendo el cuerpo en zonas de 9%. Daño mayor al 15% = grave.',
      'Acciones (en orden): cortar la energía en condiciones seguras, controlar la ropa si arde, iniciar SVB/RCP si hay paro, tratar primero la lesión más grave, cubrir con apósito limpio y estéril.',
    ],
    terreno: [
      'No apliques cremas ni revientes las ampollas; cubre con apósito estéril y traslada.',
      'Autochequeo: ¿qué factores determinan la severidad? ¿para qué sirve la Regla del 9%?',
    ],
  },
  {
    id: 'm2-06-trauma',
    title: 'Trauma e inmovilización',
    intro: 'Objetivo: reconocer fractura, luxación y esguince, y proteger la columna cervical al inmovilizar.',
    clave: [
      'Fractura: ruptura de un hueso (abierta/expuesta vs cerrada). Señales: dolor, deformidad, crepitación osea, impotencia funcional.',
      'Luxación: el hueso se sale completamente de la articulación. Esguince: daño de ligamentos.',
      'Tratamiento del esguince: 1° leve -> RICE (reposo, hielo, compresión, elevación); 2° -> yeso; 3° -> cirugía.',
      'Acción clave: ¡INMOVILIZAR! Primero la columna cervical: manual -> collar cervical -> inmovilizadores laterales sobre tabla espinal.',
    ],
    terreno: [
      'Un collar mal tallado o mal cerrado puede agravar la lesión o dificultar la respiración.',
      'Caso real: kits de rescate con collares y sueros vencidos y tablas cristalizadas. Tener el equipo no basta: hay que mantenerlo y verificar su vigencia.',
      'Autochequeo: ¿cómo se llama cuando el hueso se sale de la articulación?',
    ],
  },
  {
    id: 'm2-07-rcp-svb',
    title: 'RCP / Soporte Vital Básico (SVB)',
    intro: 'Objetivo: ejecutar la secuencia de SVB y la RCP con la técnica correcta. El 30:2 es la pregunta estrella del examen.',
    medidas: [
      'RCP: 30 compresiones : 2 ventilaciones',
      'Profundidad: comprimir 1/3 del tórax',
      'Daño cerebral: empieza a los 4 minutos',
      'Supervivencia: ~43% si la RCP parte en 0-4 min; 0% si parte después de 12 min',
      'Teléfono de emergencia (Chile): 131 (SAMU)',
    ],
    clave: [
      'Secuencia SVB: 1) garantizar seguridad (la tuya primero); 2) evaluar conciencia ("¿está usted bien?"); 3) pedir ayuda (131); 4) despejar vía aérea (frente-mentón; si hay sospecha cervical, solo elevación del mentón); 5) ventilación: evaluar con MES y dar 2 ventilaciones; 6) signos de vida / pulso carotídeo; 7) compresiones 30:2; 8) posición de recuperación si se recupera.',
      'Técnica de compresión: talón de la mano sobre el esternón, brazos rectos, usando el peso del cuerpo; víctima boca arriba en superficie plana y dura.',
      'MES = Mirar el tórax, Escuchar, Sentir (para evaluar la ventilación).',
      'Cadena de Supervivencia: acceso inmediato -> RCP -> desfibrilación (DEA) -> cuidados avanzados.',
    ],
    terreno: [
      'DEA obligatorio por ley en recintos con más de 15 personas por más de 15 minutos.',
      'Autochequeo: ¿cuál es la relación de RCP? ¿a los cuántos minutos empieza el daño cerebral?',
    ],
  },
  {
    id: 'm2-08-evaluacion-abcde',
    title: 'Evaluación de la víctima: SER y ABCDE',
    intro: 'Objetivo: ordenar la atención con un método: primero tu seguridad, luego lo que mata más rápido. La evaluación inicial ABCDE toma unos 15 segundos.',
    clave: [
      'Que mata en trauma (orden): 1° obstrucción de vía aérea, 2° hemorragia, 3° daño neurológico (TEC).',
      'Escenario "SER"/seguridad: 1) mi seguridad, 2) la de mi equipo, 3) la de la víctima.',
      'Evaluación inicial = ABCDE (~15 s); secundaria = de cabeza a pies, solo tras resolver el riesgo vital.',
      'ABCDE: A vía aérea + columna cervical (barrido con dedo, Heimlich); B buena ventilación (MES); C circulación + hemorragias; D daño neurológico (AVDN, PIRRL); E exposición (evitar el enfriamiento).',
      'Shock: pulso débil/rápido, piel pálida/fría/cianótica, PA menor a 90/60, anuria.',
      'AVDN = Alerta / responde a Verbal / responde a Dolor / No responde. PIRRL = Pupilas Iguales, Redondas, Reactivas a la Luz.',
    ],
    terreno: [
      'Autochequeo: ¿qué corresponde a la "C" del ABCDE? ¿qué mata primero en un trauma?',
    ],
  },
  {
    id: 'm2-11-riesgo-descarga',
    title: 'Riesgo eléctrico, descarga y tipos de contacto',
    intro: 'Objetivo: distinguir el contacto directo del indirecto y clasificar la descarga según el tipo de contacto y de falla. Entender el riesgo eléctrico y la electrocución. La distinción directo/indirecto es muy preguntada.',
    clave: [
      'Riesgo eléctrico: posibilidad de que la corriente cause daño a personas, equipos y procesos. La gravedad depende de la intensidad de la corriente y del tiempo de exposición.',
      'Electrocución: efecto del paso de corriente por el cuerpo, que va desde una contracción leve hasta la fibrilación ventricular y la muerte.',
      'Contacto directo: la persona toca una parte activa de la instalación o un aparato EN tensión.',
      'Contacto indirecto: la persona toca una parte que quedó en tensión de forma accidental (ej. una carcasa mal aislada que toca un cable interno).',
      'Según el tipo de contacto: choque eléctrico vs relámpago/ráfaga de arco.',
      'Según el tipo de falla: contacto directo o indirecto; cortocircuito o sobrecarga; ausencia de energía (blackout/apagón); equipo defectuoso (falta de mantenimiento).',
    ],
    terreno: [
      'En Chile, la mayor cantidad de accidentes eléctricos con consecuencias graves ocurre en BAJA Tensión (220/380 V), por la falsa percepción de que "ahí no hay mayor riesgo".',
      'La corriente continua (CC) puede ser más peligrosa que la alterna a igual tensión: en CA, al pasar por el cero del ciclo (50 Hz) la víctima tiene chance de soltarse; en CC no hay ese cruce por cero y queda "pegada".',
      'Autochequeo: ¿qué diferencia hay entre contacto directo e indirecto? ¿por qué la CC dificulta soltarse?',
    ],
  },
  {
    id: 'm2-12-clasificacion-quemaduras',
    title: 'Clasificación de quemaduras: profundidad, extensión y distribución',
    intro: 'Objetivo: clasificar una quemadura por profundidad (Converse-Smith) y estimar su extensión con la Regla del 9%. Saber que zonas del cuerpo golpea más el arco. Complementa la lección de Quemaduras.',
    medidas: [
      'Regla del 9% (adulto): cabeza 9% · cada brazo 9% · tronco anterior 18% · tronco posterior 18% · cada pierna 18% · genitales 1%',
      'Quemadura grave: daño mayor al 15% de la superficie corporal, o en cara, manos, pies o genitales',
      'Energía incidente del arco mayor a 1,2 cal/cm² = posible quemadura de 2° grado',
    ],
    clave: [
      'Clasificación por profundidad (Converse-Smith): 1er grado (eritema, solo epidermis); 2° superficial (flictenular, epidermis y dermis papilar); 2° profundo o AB (intermedia, dermis reticular); 3er grado (espesor total, destruye la piel).',
      'Comparación clínica: la quemadura tipo A (1°/2° superficial) tiene flictenas, color rojo, dolor intenso y buena recuperación. La tipo B (3°) NO tiene flictenas, es de color blanco grisáceo, indolora (se dañaron las terminaciones nerviosas) y cicatriza con escara o injerto.',
      'Distribución por arco eléctrico: las zonas más afectadas son las manos y la cabeza/cuello; en más de 2/3 de los casos se daño la mano derecha (estudio Alemania 1998).',
      'La Regla del 9% sirve para estimar la Extensión (% del cuerpo quemado); a mayor extensión, mayor gravedad.',
    ],
    terreno: [
      'Una quemadura indolora NO es leve: si no duele, probablemente sea de 3er grado (se destruyeron los nervios).',
      'Autochequeo: ¿qué es una quemadura tipo B? ¿cuánto suma cada pierna en la Regla del 9%?',
    ],
  },
  {
    id: 'm2-13-evaluacion-secundaria',
    title: 'Manejo del escenario y evaluación secundaria',
    intro: 'Objetivo: ordenar la escena con el criterio SER y completar la evaluación secundaria una vez resuelto el riesgo vital. Profundiza el ABCDE.',
    clave: [
      'Escenario SER (orden de prioridad de la seguridad): 1) MI seguridad, 2) la de mi equipo, 3) la de la víctima. Se evalúa la escena, la cinemática (como ocurrió) y los recursos (demanda vs disponibilidad).',
      'Que mata en trauma, en orden: 1° obstrucción de vía aérea, 2° hemorragia, 3° daño neurológico (TEC). Por eso el ABCDE ataca primero la vía aérea.',
      'Evaluación inicial = ABCDE (global ~15 s, resuelve el riesgo vital). Evaluación secundaria = recién después, de cabeza a pies.',
      'Evaluación secundaria: examen físico completo por inspección (ver), palpación (tocar) y auscultación (escuchar), revisando cabeza, cuello, tórax, abdomen, pelvis y extremidades (heridas, fracturas, luxaciones, simetría, crépitos).',
      'Aproximadamente el 90% de los traumatizados son LEVES; aun así, primero se descarta lo que amenaza la vida.',
    ],
    terreno: [
      'La evaluación secundaria NO se hace hasta haber resuelto el riesgo vital del ABCDE.',
      'Autochequeo: ¿qué se prioriza en SER? ¿con qué tres técnicas se hace el examen secundario?',
    ],
  },
  {
    id: 'm2-14-casos-reales',
    title: 'Casos reales y lecciones aprendidas',
    intro: 'Objetivo: aprender de accidentes reales que el relator y la literatura documentan. Cada caso deja una lección operativa que se repite en la planta.',
    clave: [
      'Técnico contratista SOLO en una sala eléctrica: toco una barra y su brazo hizo contacto con el chasis del tablero; las protecciones y la malla de tierra NO operaron. Por tetanización no pudo soltarse; pensó en su familia. Se salvó porque cayó hacia atrás. No reportó el accidente; el brazo se le puso negro ~7 meses y estuvo a punto de perderlo. Lecciones: nunca trabajar solo, ser persona calificada, verificar protecciones/tierra y SIEMPRE reportar.',
      'Kits de rescate vencidos (planta Cardona y otras): collares cervicales con ganchos vencidos, sueros vencidos hace 5 años, tablas espinales cristalizadas y mal ubicadas. Lección: tener el equipo no basta; hay que mantenerlo y verificar su vigencia.',
      'Dallas Wiens (EE.UU., 2008): pintando una iglesia, su cara toco una línea de media tensión; perdió la vista y el rostro. En 2011 recibió el primer trasplante de cara de EE.UU. Lección: respetar las distancias de seguridad (fronteras) frente a líneas energizadas.',
      'Caso OSHA (quemadura eléctrica de alto voltaje): el paso de corriente dejó lesiones internas con punto de entrada y de salida; la mano se hinchó (24-72 h) y hubo que abrir el brazo (fasciotomía); se amputaron dedos momificados. Lección: la quemadura eléctrica interna es mucho más grave de lo que se ve por fuera.',
    ],
    terreno: [
      'Hilo conductor: los accidentes graves casi siempre combinan trabajar solo, no ser persona calificada, saltarse el bloqueo/tierra y no reportar.',
      'Autochequeo: ¿qué errores se repiten en los casos graves?',
    ],
  },
  {
    id: 'm2-09-autoevaluacion',
    title: 'Autoevaluación — foco de examen',
    intro: 'La prueba teórica es a libro abierto (~10 min) más un taller práctico (~30 min). Repasa estas preguntas: son las que el relator marco como "pregunta de examen". Las respuestas están en las lecciones anteriores.',
    clave: [
      'Temperatura del arco -> 2.000 a 20.000 °C.',
      'El cobre se expande -> 67.000 veces.',
      'Energía mínima para quemadura de 2° grado -> 1,2 cal/cm².',
      'Efecto más grave de la corriente -> fibrilación ventricular.',
      'Orden de las 5 Reglas de Oro -> corte visible, bloquear, verificar ausencia, puesta a tierra, señalizar.',
      'Verificación de ausencia de tensión -> detector antes y después, en 3 puntos, para la tensión prevista.',
      'EPP contra arco -> ropa AR, careta AR, pasamontañas.',
      'Hemorragia más grave por vaso -> arterial.',
      'Órganos que protege el cuerpo -> corazón, cerebro, pulmones.',
      'Factores de severidad de quemadura -> profundidad, extensión, regiones críticas, edad, salud.',
      'Relación de RCP -> 30:2 (1/3 del tórax).',
      'Daño cerebral -> a los 4 minutos.',
      '"C" del ABCDE -> circulación + control de hemorragias.',
      'Reentrenamiento del rescate -> anual.',
    ],
    terreno: [
      'Como es a libro abierto, ten claro en que lección está cada tema para responder rápido.',
    ],
  },
];

const M2_PROCEDURES = [
  {
    id: 'm2-proc-5-reglas-oro',
    title: 'Aplicar las 5 Reglas de Oro',
    description: 'Secuencia obligatoria para trabajar sin tensión. Se ejecuta en orden, sin saltarse pasos.\n\nEjemplo: para intervenir una bomba de 380 V abres y bloqueas su partidor, verificas ausencia de tensión, pones a tierra y señalizas antes de abrir la caja de conexiones.',
    steps: [
      'Abrir con corte visible todas las fuentes de tensión.',
      'Enclavar/bloquear los aparatos de corte en posición de apertura y colocar tarjeta "PELIGRO NO OPERAR" (con nombre, RUT y foto).',
      'Verificar ausencia de tensión: probar el detector en un punto conocido, medir en los 3 puntos y reverificar, para la tensión prevista.',
      'Poner a tierra y en cortocircuito todas las posibles fuentes (cuchillas cerradas, buen contacto, evitar superficies pintadas).',
      'Delimitar y señalizar la zona de trabajo (barreras / barricado).',
    ],
  },
  {
    id: 'm2-proc-liberar-tetanizacion',
    title: 'Liberar a una víctima atrapada por tetanización',
    description: 'La víctima quedó en contacto con el conductor y no puede soltarse. La prioridad es no convertirte en segunda víctima.\n\nEjemplo: un compañero quedó agarrado a un cable energizado. NO lo tocas: corres al tablero y cortas, o lo separas con un palo de escoba seco; recién ahí lo evalúas.',
    steps: [
      'Garantiza tu seguridad: NO toques a la víctima mientras esté energizada.',
      'Corta la energía desde el tablero o interruptor (corte visible).',
      'Si no puedes cortar, separa a la víctima del conductor con un elemento aislante seco (pértiga, madera seca), nunca con las manos.',
      'Una vez liberada y en zona segura, evalúa conciencia y respiración.',
      'Activa emergencia (131) e inicia SVB si es necesario.',
    ],
  },
  {
    id: 'm2-proc-rcp-30-2',
    title: 'RCP 30:2 — secuencia de SVB',
    description: 'Reanimación cardiopulmonar básica para un adulto en paro.\n\nEjemplo: encuentras a un compañero que no responde ni respira; gritas pidiendo ayuda, llamas al 131 y arrancas 30 compresiones : 2 ventilaciones sin parar hasta que llegue el DEA o el SAMU.',
    steps: [
      'Garantiza la seguridad de la escena (la tuya primero).',
      'Evalúa conciencia: sacude y grita "¿está usted bien?".',
      'Pide ayuda: llama al 131 (SAMU) o activa la emergencia.',
      'Despeja la vía aérea con la maniobra frente-mentón (si hay sospecha cervical, solo eleva el mentón).',
      'Evalúa la ventilación con MES (Mirar, Escuchar, Sentir); si no respira, da 2 ventilaciones que eleven el tórax.',
      'Inicia compresiones 30:2 comprimiendo 1/3 del tórax, talón de la mano sobre el esternón, brazos rectos.',
      'Si recupera signos de vida, colócala en posición de recuperación (lateral de seguridad).',
    ],
  },
  {
    id: 'm2-proc-hemorragia-externa',
    title: 'Control de hemorragia externa',
    description: 'Detener una hemorragia visible de forma escalonada, sin retirar los apósitos ya colocados.\n\nEjemplo: un corte profundo en el antebrazo sangra mucho; aprietas con una gasa, si se empapa pones otra encima (sin sacar la primera) y vendas; si no cede, presionas la arteria humeral.',
    steps: [
      'Protégete de los fluidos (guantes).',
      'Limpia las impurezas con suero fisiológico.',
      'Aplica presión directa sobre la herida con un apósito.',
      'Agrega más apósitos si es necesario, SIN retirar el primero.',
      'Coloca un vendaje compresivo.',
      'Si no cede, aplica presión digital en el punto de presión (humeral o femoral).',
      'Torniquete solo como último recurso; eleva la extremidad lesionada.',
    ],
  },
  {
    id: 'm2-proc-inmovilizacion-cervical',
    title: 'Inmovilización de columna cervical',
    description: 'Proteger la columna ante sospecha de trauma. Lo principal es la cervical.\n\nEjemplo: un trabajador cayó de un andamio; le sujetas la cabeza con las manos en posición neutra, le pones collar y lo mueves en bloque sobre la tabla espinal.',
    steps: [
      'Inmoviliza manualmente la cabeza en posición neutra.',
      'Coloca un collar cervical de la talla correcta.',
      'Añade inmovilizadores laterales.',
      'Asegura a la víctima sobre la tabla espinal moviéndola como una sola unidad.',
      'Controla vía aérea y respiración durante todo el proceso.',
    ],
  },
  {
    id: 'm2-proc-evaluacion-abcde',
    title: 'Evaluar a la víctima con el ABCDE',
    description: 'Evaluación inicial ordenada (~15 s) que ataca primero lo que mata más rápido.\n\nEjemplo: ante un electrocutado revisas en orden A (¿respira?), B (¿ventila bien?), C (¿sangra?, ¿hay pulso?), D (¿responde?, ¿pupilas?) y E (lo abrigas) — todo en unos 15 segundos.',
    steps: [
      'A — Vía aérea + columna cervical: evalúa la permeabilidad; despeja con barrido de dedo o maniobra de Heimlich; si sospechas lesión espinal, manéjala como si la tuviera.',
      'B — Buena ventilación: evalúa con MES (Mirar el tórax, Escuchar, Sentir); si no ventila bien, da ventilación asistida.',
      'C — Circulación + hemorragias: controla pulso y conciencia, detiene hemorragias (presión -> torniquete) y vigila signos de shock.',
      'D — Daño neurológico: evalúa conciencia (AVDN), pupilas (PIRRL) y focalización.',
      'E — Exposición: expón lo necesario para evaluar y EVITA EL ENFRIAMIENTO (abriga).',
      'Resuelto el riesgo vital, recién entonces pasa a la evaluación secundaria (de cabeza a pies).',
    ],
  },
  {
    id: 'm2-proc-posicion-recuperacion',
    title: 'Colocar en posición de recuperación (lateral de seguridad)',
    description: 'Para una víctima inconsciente que respira y tiene pulso: evita que la lengua o un vómito obstruyan la vía aérea.\n\nEjemplo: la víctima recuperó la respiración pero sigue inconsciente; la giras de lado en bloque para que, si vomita, no se ahogue, y la vigilas hasta que llegue ayuda.',
    steps: [
      'Confirma que la víctima respira y tiene signos de vida.',
      'Arrodíllate a un lado; coloca su brazo más cercano en ángulo recto.',
      'Flexiona la pierna más lejana y úsala de palanca para girarla hacia ti como una sola unidad.',
      'Apoya el dorso de su mano bajo la mejilla para mantener la cabeza ligeramente extendida.',
      'Vigila la respiración y el pulso hasta que llegue ayuda avanzada.',
    ],
  },
  {
    id: 'm2-proc-uso-dea',
    title: 'Usar el DEA (desfibrilador externo automático)',
    description: 'El DEA se integra a la RCP en la Cadena de Supervivencia. Es obligatorio por ley en recintos con más de 15 personas por más de 15 minutos.\n\nEjemplo: durante una RCP llega el DEA; lo enciendes, pegas los parches, dejas que analice sin tocar a la víctima y, si pide descarga, te apartas y pulsas el botón.',
    steps: [
      'Pide el DEA apenas confirmes un paro y enciéndelo.',
      'Coloca los parches sobre el tórax desnudo y seco, según el dibujo (infraclavicular derecho y costado izquierdo).',
      'No toques a la víctima mientras el DEA analiza el ritmo.',
      'Si indica descarga, asegura que nadie toque a la víctima y pulsa el botón.',
      'Reinicia de inmediato RCP 30:2 y sigue las indicaciones del DEA hasta que llegue ayuda avanzada.',
    ],
  },
];

const M2_FLOWS = [
  {
    id: 'm2-flow-descarga-pegado',
    title: 'Alguien recibe una descarga y no puede soltarse',
    trigger: 'La víctima está en contacto con un conductor energizado y no se suelta (tetanización).',
    actions: [
      'No la toques con las manos.',
      'Corta la energía desde el tablero (corte visible).',
      'Si no puedes cortar, sepárala con un elemento aislante seco.',
      'En zona segura, evalúa conciencia y respiración.',
      'Llama al 131 e inicia SVB si no respira.',
    ],
  },
  {
    id: 'm2-flow-inconsciente',
    title: 'Encuentro a una persona inconsciente',
    trigger: 'Persona que no responde; hay que descartar paro y actuar rápido.',
    actions: [
      'Garantiza la seguridad de la escena.',
      'Evalúa conciencia ("¿está usted bien?").',
      'Pide ayuda: llama al 131.',
      'Abre la vía aérea (frente-mentón).',
      'Evalúa con MES; si no respira, da 2 ventilaciones e inicia RCP 30:2.',
    ],
  },
  {
    id: 'm2-flow-hemorragia-grave',
    title: 'Hay una hemorragia grave',
    trigger: 'Sangrado abundante que no se detiene solo.',
    actions: [
      'Protégete de los fluidos.',
      'Aplica presión directa con apósito.',
      'Agrega más apósitos sin retirar el primero y venda.',
      'Si no cede, presión digital en el punto de presión.',
      'Torniquete como último recurso; eleva la extremidad y traslada.',
    ],
  },
  {
    id: 'm2-flow-trauma-columna',
    title: 'Sospecho lesión de columna / trauma',
    trigger: 'Caída, golpe fuerte o proyección por arco; posible lesión de columna.',
    actions: [
      'No muevas a la víctima innecesariamente.',
      'Inmoviliza la cabeza manualmente en posición neutra.',
      'Coloca collar cervical y asegura sobre tabla espinal como una sola unidad.',
      'Controla el ABCDE.',
      'Traslada con cuidado.',
    ],
  },
  {
    id: 'm2-flow-quemadura-electrica',
    title: 'Hay una quemadura eléctrica',
    trigger: 'Persona quemada por contacto o por arco eléctrico.',
    actions: [
      'Corta la energía en condiciones seguras.',
      'Controla la ropa si está ardiendo, sin exponerte.',
      'Si hay paro, inicia SVB/RCP.',
      'Trata primero la lesión más grave.',
      'Cubre con apósito limpio y estéril; no apliques cremas; traslada.',
    ],
  },
  {
    id: 'm2-flow-atragantamiento',
    title: 'Alguien se atraganta (obstrucción de vía aérea)',
    trigger: 'La vía aérea está obstruida (cuerpo extraño o la lengua). Recuerda: la obstrucción de vía aérea es lo que mata primero en trauma.',
    actions: [
      'Evalúa si puede toser o hablar.',
      'Si la obstrucción es completa, aplica la maniobra de Heimlich (compresiones abdominales).',
      'Si la víctima queda inconsciente, bájala al suelo e inicia RCP.',
      'Revisa la boca y haz barrido con el dedo solo si ves el objeto.',
      'Llama al 131.',
    ],
  },
  {
    id: 'm2-flow-fractura-expuesta',
    title: 'Hay una fractura expuesta',
    trigger: 'El hueso rompió la piel (fractura abierta/expuesta): compromiso severo y riesgo de hemorragia e infección.',
    actions: [
      'Protégete de los fluidos.',
      'No intentes recolocar el hueso ni lo empujes hacia adentro.',
      'Controla la hemorragia con presión alrededor de la herida (no sobre el hueso).',
      'Cubre con apósito limpio y estéril e inmoviliza la zona.',
      'Trata primero la lesión más grave y traslada.',
    ],
  },
];

const M2_DIAGNOSIS = [
  {
    id: 'm2-dx-paro',
    title: 'Paro cardiorrespiratorio',
    symptom: 'La persona no responde y no respira (o respira de forma agónica).',
    possibleCauses: [
      'Fibrilación ventricular por el paso de la corriente',
      'Asfixia / paro respiratorio',
      'Más de 4 min sin oxígeno comienza a dañar el cerebro',
    ],
    solution: 'Activa el 131, inicia RCP 30:2 comprimiendo 1/3 del tórax y usa el DEA apenas esté disponible. No interrumpas hasta que llegue ayuda avanzada o la víctima recupere signos de vida. Ejemplo: compañero electrocutado que no respira: 131 + RCP 30:2 + DEA apenas llegue.',
  },
  {
    id: 'm2-dx-shock',
    title: 'Shock (hipovolémico)',
    symptom: 'Pulso débil y rápido, piel pálida/fría/cianótica, presión menor a 90/60, poca o nula orina.',
    possibleCauses: [
      'Hemorragia importante (interna o externa)',
      'Pérdida de volumen sanguíneo',
    ],
    solution: 'Controla la hemorragia, acuesta a la víctima y abrígala para evitar el enfriamiento, no le des nada de tomar y trasládala de inmediato controlando pulso y respiración cada 5 min. Ejemplo: tras una caída con sangrado interno, la persona se pone pálida, sudorosa y con pulso rápido: controla, abriga y traslada.',
  },
  {
    id: 'm2-dx-tetanizacion',
    title: 'Víctima "pegada" al conductor (tetanización)',
    symptom: 'La persona quedó en contacto con la parte energizada y no puede soltarse.',
    possibleCauses: [
      'Contracción muscular incontrolada por el paso de la corriente',
    ],
    solution: 'Nunca la toques mientras esté energizada. Corta la energía (corte visible) o sepárala con un elemento aislante seco; recién entonces evalúa y atiende. Ejemplo: la mano quedó cerrada sobre la herramienta energizada; corta la energía, no tires de la persona.',
  },
  {
    id: 'm2-dx-hemorragia-arterial',
    title: 'Hemorragia arterial',
    symptom: 'Sangre roja rutilante que sale a chorro intermitente (pulsátil).',
    possibleCauses: [
      'Lesión de una arteria',
    ],
    solution: 'Presión directa firme con apósito; si no cede, presión digital en el punto de presión (humeral/femoral) y, como último recurso, torniquete. Eleva la extremidad y traslada. Ejemplo: un corte en el muslo que late y mancha en chorro: presión firme y, si no cede, presión en la femoral.',
  },
  {
    id: 'm2-dx-tec',
    title: 'Sospecha de daño neurológico (TEC)',
    symptom: 'Alteración de conciencia, pupilas desiguales o que no reaccionan a la luz.',
    possibleCauses: [
      'Traumatismo encéfalo-craneano',
      'Lesión de columna asociada',
    ],
    solution: 'Maneja a la víctima como si tuviera lesión de columna: inmoviliza la cervical, controla el ABCDE y traslada con cuidado. Evalúa nivel de conciencia (AVDN) y pupilas (PIRRL). Ejemplo: golpe fuerte en la cabeza con una pupila más grande que la otra: inmoviliza la cervical y traslada urgente.',
  },
  {
    id: 'm2-dx-quemadura-interna',
    title: 'Quemadura eléctrica interna (paso de corriente)',
    symptom: 'Hay un punto de entrada y otro de salida de la corriente; la zona se hincha entre 24 y 72 h y el miembro se pone oscuro.',
    possibleCauses: [
      'Paso de corriente por el cuerpo (efecto Joule)',
      'Tetanización que prolongó el contacto',
    ],
    solution: 'Trata como lesión grave aunque por fuera parezca menor: corta la energía en condiciones seguras, inicia SVB si hay paro, cubre con apósito estéril y traslada URGENTE. Puede requerir fasciotomía (abrir para aliviar la presión) o amputación. Reporta siempre el accidente.',
  },
  {
    id: 'm2-dx-luxacion-esguince',
    title: 'Luxación o esguince',
    symptom: 'Dolor articular, deformidad e impotencia funcional tras un golpe o caída.',
    possibleCauses: [
      'Luxación: el hueso se salió completamente de la articulación',
      'Esguince: torcedura/distensión con daño de ligamentos',
    ],
    solution: 'Inmoviliza sin intentar reducir la luxación. Para el esguince aplica RICE (reposo, hielo, compresión, elevación) si es leve (1° grado); el 2° requiere yeso y el 3° cirugía. Traslada para evaluación.',
  },
];

const M2_QUIZ = [
  {
    id: 'm2-q-rcp',
    question: '¿Cuál es la relación correcta de compresiones y ventilaciones en la RCP de un adulto?',
    options: ['15:1', '30:2', '5:1', '20:2'],
    correctIndex: 1,
    explanation: '30 compresiones por 2 ventilaciones, comprimiendo 1/3 del tórax. Es la pregunta estrella del examen.',
  },
  {
    id: 'm2-q-efecto-grave',
    question: '¿Cuál es el efecto más grave de la corriente sobre el cuerpo?',
    options: ['Tetanizacion', 'Quemaduras', 'Fibrilación ventricular', 'Asfixia'],
    correctIndex: 2,
    explanation: 'La fibrilación ventricular (arritmia) es la lesión más grave para la recuperación.',
  },
  {
    id: 'm2-q-arco',
    question: '¿En qué dos fenómenos se descompone el arco eléctrico?',
    options: ['Relámpago de arco y ráfaga/explosión', 'Chispa y humo', 'Calor y luz', 'Cortocircuito y sobrecarga'],
    correctIndex: 0,
    explanation: 'Relámpago de arco (arc flash) + ráfaga/explosión de arco (onda expansiva).',
  },
  {
    id: 'm2-q-energia',
    question: '¿Cuál es la energía incidente mínima para una quemadura de 2° grado?',
    options: ['0,5 cal/cm²', '1,2 cal/cm²', '12 cal/cm²', '40 cal/cm²'],
    correctIndex: 1,
    explanation: '1,2 cal/cm² (como la llama de un encendedor a 1 cm durante ~2 s).',
  },
  {
    id: 'm2-q-reglas-oro',
    question: '¿Cuál es el orden correcto de las 5 Reglas de Oro?',
    options: [
      'Bloquear, cortar, señalizar, verificar, tierra',
      'Corte visible, bloquear, verificar ausencia de tensión, puesta a tierra, señalizar',
      'Verificar, cortar, tierra, bloquear, señalizar',
      'Señalizar, cortar, bloquear, tierra, verificar',
    ],
    correctIndex: 1,
    explanation: '1) corte visible, 2) bloquear, 3) verificar ausencia de tensión, 4) puesta a tierra y cortocircuito, 5) delimitar/señalizar.',
  },
  {
    id: 'm2-q-hemorragia',
    question: '¿Cuál es la hemorragia más grave según el vaso afectado?',
    options: ['Capilar', 'Venosa', 'Arterial', 'Exteriorizada'],
    correctIndex: 2,
    explanation: 'La arterial: sangre roja rutilante que sale a chorro intermitente.',
  },
  {
    id: 'm2-q-control-hemorragia',
    question: '¿Cuál es el primer paso para controlar una hemorragia externa?',
    options: ['Aplicar torniquete', 'Presión directa con apósito', 'Elevar la extremidad', 'Dar agua a la víctima'],
    correctIndex: 1,
    explanation: 'Presión directa con apósito. El torniquete es el último recurso.',
  },
  {
    id: 'm2-q-abcde',
    question: 'En el ABCDE, ¿qué corresponde a la letra C?',
    options: ['Cabeza', 'Circulación + control de hemorragias', 'Columna cervical', 'Conciencia'],
    correctIndex: 1,
    explanation: 'C = circulación + control de hemorragias.',
  },
  {
    id: 'm2-q-tiempo',
    question: '¿A los cuántos minutos comienza el daño cerebral en un paro?',
    options: ['1 minuto', '4 minutos', '10 minutos', '30 minutos'],
    correctIndex: 1,
    explanation: 'El daño cerebral empieza a los 4 minutos; 0% de supervivencia si la RCP parte después de 12 min.',
  },
  {
    id: 'm2-q-reentrenamiento',
    question: '¿Cada cuánto se hace el reentrenamiento de rescate y liberación de contacto?',
    options: ['Mensual', 'Anual', 'Cada 3 años', 'Cada 5 años'],
    correctIndex: 1,
    explanation: 'Rescate y liberación de contacto: anual. La seguridad eléctrica (NFPA 70E): cada 3 años.',
  },
  {
    id: 'm2-q-contacto-indirecto',
    question: '¿Qué es un contacto eléctrico indirecto?',
    options: [
      'Tocar una parte activa en tensión',
      'Tocar una parte que quedó en tensión de forma accidental (ej. carcasa mal aislada)',
      'Acercarse a un cable sin tocarlo',
      'Trabajar con guantes aislantes',
    ],
    correctIndex: 1,
    explanation: 'Indirecto = tocar algo que quedó en tensión por accidente. El directo es tocar una parte activa en tensión.',
  },
  {
    id: 'm2-q-arco-temp',
    question: '¿Qué temperatura puede alcanzar un arco eléctrico?',
    options: ['100 a 500 °C', '500 a 1.000 °C', '2.000 a 20.000 °C', '50.000 a 100.000 °C'],
    correctIndex: 2,
    explanation: 'Entre 2.000 y 20.000 °C; puede encender la ropa hasta a 3 m del punto de falla.',
  },
  {
    id: 'm2-q-cobre',
    question: '¿Cuánto se expande el cobre al evaporarse en un arco eléctrico?',
    options: ['67 veces', '6.700 veces', '67.000 veces', '670.000 veces'],
    correctIndex: 2,
    explanation: '67.000 veces; proyecta metal fundido a más de 1.120 km/h.',
  },
  {
    id: 'm2-q-organos',
    question: '¿Qué órganos protege prioritariamente el cuerpo ante una pérdida de sangre?',
    options: ['Hígado, riñones y bazo', 'Corazón, cerebro y pulmones', 'Estómago, intestino y vejiga', 'Piel, músculos y huesos'],
    correctIndex: 1,
    explanation: 'Corazón, cerebro y pulmones (en ese orden).',
  },
  {
    id: 'm2-q-regla9',
    question: '¿Para qué sirve la Regla del 9%?',
    options: [
      'Para estimar la profundidad de la quemadura',
      'Para estimar la extensión (% del cuerpo) de la quemadura',
      'Para medir la energía incidente del arco',
      'Para calcular el volumen de sangre',
    ],
    correctIndex: 1,
    explanation: 'Estima la extensión: divide el cuerpo en zonas de 9%. Daño mayor al 15% = grave.',
  },
  {
    id: 'm2-q-luxacion',
    question: '¿Cómo se llama cuando un hueso se sale completamente de su articulación?',
    options: ['Fractura', 'Esguince', 'Luxacion', 'Crepitacion'],
    correctIndex: 2,
    explanation: 'Luxación. El esguince es daño de ligamentos; la fractura es ruptura del hueso.',
  },
  {
    id: 'm2-q-mes',
    question: '¿Qué significa la sigla MES en la evaluación de la ventilación?',
    options: ['Medir, Evaluar, Sostener', 'Mirar, Escuchar, Sentir', 'Mover, Estabilizar, Señalizar', 'Masaje, Estímulo, Soporte'],
    correctIndex: 1,
    explanation: 'Mirar el tórax, Escuchar el aire, Sentir el flujo. Sirve para evaluar la ventilación.',
  },
  {
    id: 'm2-q-que-mata-trauma',
    question: 'En un trauma, ¿qué mata primero (orden)?',
    options: [
      'Hemorragia, vía aérea, daño neurológico',
      'Obstrucción de vía aérea, hemorragia, daño neurológico (TEC)',
      'Daño neurológico, hemorragia, vía aérea',
      'Fractura, quemadura, shock',
    ],
    correctIndex: 1,
    explanation: '1° obstrucción de vía aérea, 2° hemorragia, 3° daño neurológico (TEC). Por eso el ABCDE ataca primero la vía aérea.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// MODULO 3 — NFPA 70B, Mantenimiento del Equipo Electrico (slug nfpa-70b)
// ════════════════════════════════════════════════════════════════════════════

const M3_MANUAL = [
  {
    id: 'm3-01-que-es-nfpa70b',
    title: 'Que es la NFPA 70B y la autoridad competente',
    intro: 'Objetivo: entender el alcance de la norma de mantenimiento del equipo eléctrico y quien fiscaliza en Chile. La pregunta confirmada del examen: la autoridad competente en Chile es la SEC.',
    medidas: [
      'Niveles de tensión: Baja menor o igual a 1 kV; Media mayor a 1 kV hasta 23 kV; Alta mayor a 23 kV hasta 230 kV',
      'El 80% de los equipos falla en algún momento por falta de mantenimiento',
    ],
    clave: [
      'NFPA 70B = Norma para el Mantenimiento del Equipo Eléctrico, edición 2023 (Nivel 1). Es la norma líder en mantenimiento eléctrico.',
      'Nació en 1968 como "Práctica Recomendada"; hoy es Norma (2023).',
      'Se concentra en el MEP (Mantenimiento Eléctrico Preventivo) para disminuir fallas a personas, equipos y procesos.',
      'Aplica a instalaciones comerciales e industriales (SEP). NO considera el nivel doméstico.',
      'Autoridad Competente (AC) en Chile = la SEC (Superintendencia de Electricidad y Combustibles). Es pregunta confirmada de examen.',
    ],
    terreno: [
      'Definiciones base: arco eléctrico (descarga disruptiva por ionización), choque eléctrico (corriente que fluye por el cuerpo), energía incidente en cal/cm².',
      'Autochequeo: ¿de qué año es la edición vigente? ¿quién es la autoridad competente en Chile?',
    ],
  },
  {
    id: 'm3-02-cuatro-pilares',
    title: 'Los 4 pilares de la norma',
    intro: 'Objetivo: conocer las cuatro columnas sobre las que se construye todo programa de mantenimiento según la NFPA 70B.',
    clave: [
      '1) Seguridad a las Personas: factor primordial; personal idóneo + EPP; si no son especialistas, se externaliza.',
      '2) Gestión de Mantenimiento: un programa bien administrado salva vidas, reduce costos y minimiza fallas no programadas.',
      '3) Procedimientos Específicos para cada Equipo: registro acabado para decidir bien ante una falla.',
      '4) Análisis de la Información: permite corregir, analizar fallas y mejorar los programas.',
      'RCM = Mantenimiento Centrado en la Confiabilidad: optimiza recursos a partir del análisis estadístico de fallas.',
    ],
    terreno: [
      'Autochequeo: nombra los 4 pilares de la norma.',
    ],
  },
  {
    id: 'm3-03-mep-planificacion',
    title: 'El MEP: planificar el mantenimiento',
    intro: 'Objetivo: saber cómo se arma un programa de mantenimiento preventivo. El relator lo destacó: "el examen de la planificación, página 15".',
    clave: [
      '4 aspectos básicos del MEP: 1) recopilar un listado de TODOS los equipos; 2) determinar los más críticos; 3) desarrollar un sistema de supervisión (monitoreo); 4) definir el personal (interno o externo).',
      'Una sola persona asume la responsabilidad completa de implementar el MEP, con Autoridad y Calificación.',
      'Las 5 preguntas (5W): Why (¿por qué intervenir?), Where (¿en qué parte/equipo?), What (¿qué intervención?), Who (¿quién?), How (¿cómo?).',
      'Información necesaria: procedimientos de inspección y prueba, informes anteriores, diagramas unilineales y esquemáticos, datos de rotulación, catálogos del fabricante.',
      'Equipos importados: catálogos, manuales y planos en el idioma del usuario.',
    ],
    terreno: [
      'Seguridad del personal / EPP: consideración primordial, basada en la NFPA 70E.',
      'Autochequeo: ¿cuáles son los 4 aspectos básicos del MEP? ¿cuántas personas asumen la responsabilidad?',
    ],
  },
  {
    id: 'm3-04-criticidad-riesgo',
    title: 'Criticidad y riesgo',
    intro: 'Objetivo: decidir que equipo es crítico y priorizar con un criterio de riesgo, no por tamaño.',
    medidas: [
      'Matriz de criticidad: Alta (rojo) 50-125; Media (amarillo) 30-49; Baja (verde) 5-29',
    ],
    clave: [
      'Un equipo es crítico si su falla causa una seria amenaza al personal, la propiedad o el producto. La criticidad la da su función en el proceso, no su tamaño.',
      'Riesgo = Probabilidad de falla x Consecuencia de la falla. Consecuencias: impacto a personas, ambiental, costo de reparación, pérdidas de producción/reputación/mercado.',
      'Lugares peligrosos: mantenimiento solo por personal calificado, en lo posible fuera del área clasificada; equipos a prueba de explosión / seguridad aumentada.',
    ],
    terreno: [
      'TPEF = Tiempo Promedio Entre Fallas (categorías de 1 a 5 según la frecuencia esperada).',
      'Autochequeo: ¿qué define que un equipo sea crítico? ¿cómo se calcula el riesgo?',
    ],
  },
  {
    id: 'm3-05-tipos-mantenimiento',
    title: 'Tipos de mantenimiento',
    intro: 'Objetivo: distinguir las estrategias de mantenimiento y cuando usar cada una.',
    medidas: [
      'Frecuencia de pruebas: ciclo típico de 6 meses a 3 años según uso y condiciones',
    ],
    clave: [
      '3 tipos: Preventivo; Sistemático (por frecuencia); Predictivo (por condición, usa sensores).',
      'Frase clave: "las averías no aparecen de repente, tienen una evolución".',
      'Filosofías/técnicas: RCM (confiabilidad), TPM (productivo total), MBC (basado en condición), CMMS (administración computacional).',
      'El equipo debe estar desenergizado para inspección, prueba o reparación.',
    ],
    terreno: [
      'Autochequeo: ¿cuáles son los 3 tipos de mantenimiento? ¿cómo debe estar el equipo para intervenirlo?',
    ],
  },
  {
    id: 'm3-06-pruebas-mediciones',
    title: 'Pruebas y mediciones',
    intro: 'Objetivo: conocer las pruebas del MEP y los datos clave del taller práctico: puesta a tierra, calidad de energía y termografía.',
    medidas: [
      'Resistencia de puesta a tierra: óptima menor o igual a 5 ohm; la norma apunta a ~2 ohm; el reglamento tolera hasta 20 ohm',
      'Voltaje admisible: 0,95 a 1,05 p.u.; desbalance entre fases menor a 3%',
      'Instrumentos de medición integrados en tableros: obligatorios desde 100 A',
      'Iluminación industrial: 400-500 lux promedio',
    ],
    clave: [
      'Métodos de prueba: termografía infrarroja, análisis de vibración, ultrasonido, descargas parciales, medición de aislación, calidad de energía, medición de puesta a tierra.',
      '"Prueba" = la variable que tomo (medición/registro); "método" = como la hago (instrumento/procedimiento).',
      'Puesta a tierra: dos tipos, de servicio (asociada al neutro) y de protección (PE, cable verde o verde-amarillo, protege a las personas).',
      'El telurómetro mide la resistencia de puesta a tierra. El megóhmetro (megger) mide aislación: no confundir.',
      'Armónicos múltiplos de 3 = los más críticos (calientan el conductor neutro). Se miden con instrumentos True RMS.',
    ],
    terreno: [
      'Caso real: con cámara termográfica (Fluke) se detectan puntos calientes / arco incipiente sin contacto; si una de las 3 fases tiene temperatura muy distinta, hay que revisar (conexión floja).',
      'Retención de registros de prueba/mantenimiento: al menos 5 años (dato del relator).',
      'Autochequeo: ¿qué instrumento mide la puesta a tierra? ¿qué armónicos son los más críticos?',
    ],
  },
  {
    id: 'm3-07-gestion-phva',
    title: 'Gestión y mejora continua (PHVA)',
    intro: 'Objetivo: cerrar el ciclo. Un MEP no es una lista de tareas, es un sistema de gestión que mejora con el tiempo.',
    clave: [
      'Ciclo PHVA: Planificar (liderar y apoyar) -> Hacer (implementar y operar) -> Evaluar (monitorear y controlar) -> Actuar (mejorar).',
      'Estructura del sistema de gestión: contexto de la organización -> liderazgo -> planificación (riesgos y oportunidades) -> apoyo -> operación -> evaluación del desempeño -> auditoría interna.',
      'Por qué paga el MEP: el deterioro es normal y la falla inevitable; el MEP detecta y corrige causas antes de que sean mayores (Prevenir / Medir / Reparar).',
    ],
    terreno: [
      'Gestión estratégica: comparar costos de preventivo vs correctivo; definir quién, cuándo y cuánto sustituir o reparar.',
      'Autochequeo: ¿cuáles son las 4 etapas del PHVA?',
    ],
  },
  {
    id: 'm3-10-definiciones-base',
    title: 'Definiciones base y niveles de tensión',
    intro: 'Objetivo: manejar el vocabulario de la norma: arco, choque, energía incidente, persona calificada y los niveles de tensión. Es la base para entender el resto del módulo.',
    medidas: [
      'Niveles de tensión: Baja menor o igual a 1 kV; Media mayor a 1 kV hasta 23 kV; Alta mayor a 23 kV hasta 230 kV',
      'Tensión reducida: de 0 a 100 V (según el código eléctrico chileno)',
      'Energía incidente: se mide en cal/cm² (calorías por centímetro cuadrado)',
    ],
    clave: [
      'Arco eléctrico: descarga disruptiva por ionización de un medio gaseoso entre dos superficies a distinto potencial.',
      'Choque eléctrico: estimulación física que ocurre cuando la corriente eléctrica fluye por el cuerpo humano.',
      'MEP: programa administrado de inspección, pruebas, análisis y servicios de los equipos.',
      'Persona Calificada: tiene habilidades y conocimiento de la construcción y operación del equipo, más entrenamiento para reconocer los peligros. Persona No Calificada: todas las demás.',
      'La distribuidora local entrega en media tensión hasta un máximo de 23 kV; dentro de la planta conviven 220 V y 380 V en baja tensión.',
    ],
    terreno: [
      'La mayor cantidad de accidentes con consecuencias fatales está en baja tensión, por la falsa sensación de seguridad del 220/380 V.',
      'Autochequeo: ¿qué es un arco eléctrico? ¿hasta qué tensión es Media?',
    ],
  },
  {
    id: 'm3-11-practicas-mantenimiento',
    title: 'Prácticas de mantenimiento: por qué paga el MEP',
    intro: 'Objetivo: entender por qué conviene mantener, cómo se estructura un programa y que se revisa en el sistema de protecciones (Lección 3 del manual).',
    clave: [
      'Por qué paga el MEP: el deterioro es normal y la falla es inevitable; el MEP detecta y corrige causas potenciales ANTES de que sean mayores. Resumen: Prevenir / Medir / Reparar el deterioro.',
      'Programa de mantenimiento: prevención diaria -> revisión periódica -> tratamiento oportuno; el seguimiento es anual o semestral según el tamaño de la planta.',
      'Causas de falla del arco: evolutivas (debilitamiento del aislamiento) y operacionales (contacto accidental, error de maniobra, contaminación, corrosión).',
      'Plan de protección: pruebas periódicas, lubricación y limpieza de relés y dispositivos; verificar el tipo y amperaje de los fusibles; saber interpretar las curvas tiempo-corriente.',
      'Pruebas de aceptación al poner en marcha: plan de puesta en marcha (Px) y pruebas de desempeño funcional (FPT).',
    ],
    terreno: [
      'El equipo debe estar DESENERGIZADO para inspección, prueba o reparación.',
      'Autochequeo: ¿qué tres verbos resumen el programa de mantenimiento? ¿qué se interpreta con las curvas tiempo-corriente?',
    ],
  },
  {
    id: 'm3-12-calidad-energia',
    title: 'Calidad de energía y perturbaciones',
    intro: 'Objetivo: reconocer las perturbaciones de la red y cómo se miden. Datos del taller práctico (audios 10-14). Complementa Pruebas y mediciones.',
    medidas: [
      'Voltaje admisible: 0,95 a 1,05 p.u.; desbalance entre fases menor a 3%',
      'Instrumentos de medición integrados en tableros: obligatorios desde 100 A (antes 200 A)',
      'Iluminación industrial: 400 a 500 lux promedio',
    ],
    clave: [
      'Perturbaciones de calidad de energía: transitorios, dips/sags (huecos de tensión), swells (sobretensiones), outages (cortes), desbalance, variación de frecuencia, flicker (parpadeo), notches y armónicos.',
      'Armónicos: múltiplos de la frecuencia fundamental. Los múltiplos de 3 son los más críticos porque se suman en el conductor NEUTRO y lo calientan.',
      'Se miden con instrumentos True RMS (valor eficaz verdadero), que captan todo el espectro de frecuencia. Un instrumento "instantáneo" barato solo mide a 50 Hz y falla si hay armónicos.',
      'Los tableros modernos integran medición multifunción (V, A, potencia, coseno fi) desde 100 A.',
    ],
    terreno: [
      'Para certificar calidad de energía se usa un equipo True RMS (ej. Fluke); no sirve un tester común.',
      'Autochequeo: ¿qué armónicos son los más críticos y por qué? ¿qué mide un True RMS que no mide un tester común?',
    ],
  },
  {
    id: 'm3-13-puesta-a-tierra',
    title: 'Puesta a tierra',
    intro: 'Objetivo: distinguir los tipos de tierra, su instrumento de medida y los valores objetivo. Muy preguntado en el taller práctico.',
    medidas: [
      'Resistencia de puesta a tierra: óptima menor o igual a 5 ohm; la norma apunta a ~2 ohm en equipos críticos; el reglamento tolera hasta 20 ohm',
    ],
    clave: [
      'Dos tipos: tierra de SERVICIO (asociada al neutro, estabiliza/cierra el sistema) y tierra de Protección (PE, cable verde o verde-amarillo, protege a las personas).',
      'El telurómetro (telurímetro) mide la resistencia de puesta a tierra. El megóhmetro (megger) mide la aislación: no confundir.',
      'Antes de diseñar o verificar una malla se hace un estudio de suelo (resistividad).',
      'La puesta a tierra crea un camino de baja impedancia para la corriente de falla, limita las tensiones de paso y de contacto y permite que operen las protecciones.',
    ],
    terreno: [
      'Evita poner las pinzas de tierra sobre superficies pintadas; el buen contacto es clave para que la medida sea valida.',
      'Autochequeo: ¿qué instrumento mide la tierra? ¿cuál es el valor óptimo de resistencia?',
    ],
  },
  {
    id: 'm3-14-protecciones-sep',
    title: 'Protecciones y equipos del sistema eléctrico',
    intro: 'Objetivo: repasar los equipos y protecciones del SEP que el relator paso como contexto (base de la guía grupal N°1).',
    medidas: [
      'Protección diferencial obligatoria en el RIC: 30 mA',
      'Grado de protección IP: 1er dígito = sólidos/polvo, 2° dígito = agua (ej. IP65/IP66 en lugares húmedos)',
    ],
    clave: [
      'Etapas de un Sistema Eléctrico de Potencia (SEP): generación, transmisión y distribución. Quien fiscaliza en Chile es la SEC (el CDEC era el coordinador de despacho, hoy Coordinador Eléctrico Nacional).',
      'Protecciones eléctricas: detectan, ubican y AISLAN la falla, desconectando solo la zona afectada -> protegen personas y equipos.',
      'Protección diferencial: detecta fugas de corriente -> protege del choque eléctrico; en el RIC el diferencial de 30 mA es obligatorio.',
      'Interruptores: conectan/desconectan CON carga; desconectadores: solo SIN carga. Los interruptores se clasifican por el medio de extinción del arco, la capacidad de ruptura y el nivel de tensión/aislación.',
      'Equipos primarios en MT: transformadores, protecciones y pararrayos. SCADA: monitorea variables del SEP y permite maniobras remotas.',
    ],
    terreno: [
      'La trampa de onda (line trap) sirve para comunicación por onda portadora (PLC), NO para descargas atmosféricas; de los rayos se encargan el pararrayos y el cable/hilo de guarda.',
      'En interruptores en aceite, el arco descompone el aceite liberando hidrógeno, que ayuda a extinguir el arco.',
      'Autochequeo: ¿qué protege un diferencial y de cuanto es en el RIC? ¿para qué sirve realmente la trampa de onda?',
    ],
  },
  {
    id: 'm3-15-mantenimiento-externo-gestion',
    title: 'Mantenimiento externo y gestión estratégica',
    intro: 'Objetivo: saber que pedir cuando el mantenimiento se externaliza y cómo se decide entre preventivo y correctivo.',
    clave: [
      'Elementos de un contrato de mantenimiento externo: alcance, detalle paso a paso, normativa aplicable, metodología de precios, calificación del personal, garantía, documentación y una caminata de revisión previa y posterior.',
      'Mantenimiento con intervalos largos entre paradas: cuidar el aspecto humano (trabajador en condiciones físicas y mentales adecuadas) y el aspecto técnico (personal calificado que conoce el equipo).',
      'Gestión estratégica: comparar costos de preventivo vs correctivo; decidir QUIEN lo hace (centralizado/descentralizado, propio o contratista), CUÁNDO sustituir o reparar y CUÁNTO (sustitución individual o en grupo).',
      'Programa sistemático: depende de la atmósfera/ambiente, las condiciones de carga, el registro histórico y la frecuencia de inspecciones.',
    ],
    terreno: [
      'Los registros de prueba y mantenimiento se guardan al menos 5 años (dato del relator).',
      'Autochequeo: ¿qué dos aspectos se cuidan en paradas largas? ¿qué se compara en la gestión estratégica?',
    ],
  },
  {
    id: 'm3-08-autoevaluacion',
    title: 'Autoevaluación — foco de examen',
    intro: 'Examen a libro abierto. Repasa estas preguntas confirmadas y marcadas por el relator. Las respuestas están en las lecciones anteriores.',
    clave: [
      'Edición vigente de la NFPA 70B -> 2023.',
      'Los 4 pilares -> Seguridad a las Personas, Gestión de Mantenimiento, Procedimientos Específicos, Análisis de la Información.',
      '% de equipos que falla por falta de mantenimiento -> 80%.',
      'Hasta que tensión es Media -> hasta 23 kV (mayor a 1 kV).',
      'Los 4 aspectos básicos del MEP -> listar equipos, determinar críticos, sistema de supervisión, definir personal.',
      '¿Cuántas personas implementan el MEP? -> una sola (con autoridad y calificación).',
      '¿Qué hace crítico a un equipo? -> que su falla amenace al personal, la propiedad o el producto (por su función).',
      'Norma en que se basa el EPP -> NFPA 70E.',
      'Rango del ciclo de pruebas -> de 6 meses a 3 años.',
      'Los 3 tipos de mantenimiento -> preventivo, sistemático, predictivo.',
      'Riesgo -> Probabilidad de falla x Consecuencia de la falla.',
      '¿Cómo debe estar el equipo para intervenirlo? -> desenergizado.',
      'Autoridad competente en Chile -> la SEC.',
    ],
    terreno: [
      'Ojo: la trampa de onda (line trap) sirve para comunicación por onda portadora (PLC), NO para descargas atmosféricas; de eso se encargan el pararrayos y el cable de guarda.',
    ],
  },
];

const M3_PROCEDURES = [
  {
    id: 'm3-proc-iniciar-mep',
    title: 'Iniciar un MEP (los 4 aspectos básicos)',
    description: 'Punto de partida para montar un programa de mantenimiento eléctrico preventivo.\n\nEjemplo: en una planta nueva listas todos los tableros y motores, marcas como críticos la sala eléctrica principal y el chiller, defines quien los monitorea y nombras un responsable con autoridad.',
    steps: [
      'Recopila un listado de TODOS los sistemas y equipos.',
      'Determina cuales son los más críticos (por su función en el proceso, no por su tamaño).',
      'Desarrolla un sistema de supervisión / monitoreo.',
      'Define el personal necesario (interno o externo).',
      'Asigna un responsable único con Autoridad y Calificación.',
    ],
  },
  {
    id: 'm3-proc-medir-tierra',
    title: 'Medir la resistencia de puesta a tierra',
    description: 'Verificación de la malla de tierra. Mucho del taller práctico gira en torno a esto.\n\nEjemplo: mides la malla de la sala eléctrica con el telurómetro y da 8 ohm; está sobre el óptimo (≤5 ohm), así que revisas uniones y agregas una barra de tierra.',
    steps: [
      'Asegura el equipo desenergizado y condiciones seguras.',
      'Usa un telurómetro (no un megger, que mide aislación).',
      'Si vas a verificar o diseñar la malla, realiza un estudio de suelo (resistividad).',
      'Compara contra el objetivo: óptima menor o igual a 5 ohm (la norma apunta a ~2 ohm; máximo reglamentario 20 ohm).',
      'Si está fuera de rango, revisa uniones y mejora la malla.',
    ],
  },
  {
    id: 'm3-proc-criticidad',
    title: 'Evaluar la criticidad de un equipo (5W + matriz)',
    description: 'Método para decidir cuánto y cómo intervenir un equipo.\n\nEjemplo: un motor de respaldo poco usado pero que detiene toda la línea si falla puntúa alto en consecuencia; aunque sea chico, queda como crítico (rojo) en la matriz.',
    steps: [
      'Why: ¿por qué hay que intervenirlo?',
      'Where: ¿en qué parte / equipo?',
      'What: ¿qué tipo de intervención?',
      'Who: ¿quién lo hará?',
      'How: ¿cómo se hará el servicio?',
      'Calcula Riesgo = Probabilidad x Consecuencia y ubícalo en la matriz (Alta 50-125 / Media 30-49 / Baja 5-29).',
    ],
  },
  {
    id: 'm3-proc-termografia',
    title: 'Inspección con termografía',
    description: 'Detección sin contacto de puntos calientes y arco incipiente.\n\nEjemplo: en termografía una fase de un interruptor marca 70 °C y las otras 40 °C; marcas el punto, lo reaprietas desenergizado y vuelves a medir para confirmar.',
    steps: [
      'Con el equipo en carga normal, apunta la cámara termográfica a conexiones y barras.',
      'Compara la temperatura entre las 3 fases.',
      'Si una fase está notoriamente más caliente, marca el punto (posible conexión floja o arco incipiente).',
      'Programa la corrección con el equipo desenergizado.',
      'Registra la medición (se guarda al menos 5 años).',
    ],
  },
  {
    id: 'm3-proc-calidad-energia',
    title: 'Medir la calidad de energía',
    description: 'Verificar tensión, desbalance y armónicos en un tablero.\n\nEjemplo: el neutro de un tablero de luminarias LED se calienta; con un True RMS ves armónicos de 3er orden altos y rediseñas el reparto de cargas.',
    steps: [
      'Usa un instrumento True RMS (no un tester común) para captar todo el espectro de frecuencia.',
      'Mide la tensión y verifica que esté en el rango 0,95-1,05 p.u.',
      'Comprueba que el desbalance entre fases sea menor a 3%.',
      'Revisa los armónicos, en especial los múltiplos de 3 (calientan el neutro).',
      'Registra los valores; si el neutro se calienta, busca cargas no lineales.',
    ],
  },
  {
    id: 'm3-proc-plan-proteccion',
    title: 'Revisar el sistema de protecciones',
    description: 'Mantenimiento del plan de protecciones: relés, fusibles y coordinación.\n\nEjemplo: en la mantención semestral limpias los relés, confirmas que los fusibles son del amperaje correcto y revisas que la coordinación (curvas tiempo-corriente) abra primero la protección más cercana a la falla.',
    steps: [
      'Con el equipo desenergizado, limpia y lubrica los relés y dispositivos.',
      'Verifica el tipo y amperaje de cada fusible.',
      'Prueba la operación de las protecciones y el estado/apriete de los contactos.',
      'Revisa la coordinación de la operación (curvas tiempo-corriente).',
      'Registra y programa la próxima revisión.',
    ],
  },
  {
    id: 'm3-proc-intervencion-segura',
    title: 'Intervenir un equipo de forma segura',
    description: 'Secuencia mínima antes de tocar un equipo, basada en la NFPA 70E.\n\nEjemplo: para revisar un transformador de MT lees el procedimiento, lo desenergizas, verificas 0 V, pones a tierra y usas el EPP NFPA 70E antes de entrar a la celda.',
    steps: [
      'Lee primero el procedimiento de trabajo.',
      'Desenergiza el equipo.',
      'Verifica ausencia de tensión con instrumento (probado antes y después).',
      'Pon a tierra.',
      'Usa el EPP según la NFPA 70E y recién entonces interviene.',
    ],
  },
];

const M3_FLOWS = [
  {
    id: 'm3-flow-frecuencia-prueba',
    title: 'Debo definir cada cuánto probar un equipo',
    trigger: 'Necesitas fijar la frecuencia de pruebas/mantenimiento de un equipo.',
    actions: [
      'Parte del rango típico: 6 meses a 3 años.',
      'Considera el uso, la carga y las condiciones ambientales.',
      'Revisa la recomendación del fabricante...',
      '...pero ajusta según la tasa de fallas (la norma es más estricta).',
      'Documenta la frecuencia elegida en el MEP.',
    ],
  },
  {
    id: 'm3-flow-priorizar',
    title: 'Tengo que priorizar que equipos mantener primero',
    trigger: 'Recursos limitados y muchos equipos: hay que ordenar.',
    actions: [
      'Lista todos los equipos.',
      'Evalúa la criticidad por función en el proceso.',
      'Calcula Riesgo = Probabilidad x Consecuencia.',
      'Ordena por la matriz de criticidad (rojo primero).',
      'Asigna los recursos a los equipos críticos.',
    ],
  },
  {
    id: 'm3-flow-intervenir-mt',
    title: 'Voy a intervenir un equipo de media tensión',
    trigger: 'Trabajo sobre un circuito o equipo de MT.',
    actions: [
      'Lee primero el procedimiento de trabajo.',
      'Desenergiza y verifica ausencia de tensión.',
      'Pon a tierra.',
      'Usa el EPP según la NFPA 70E.',
      'Recién entonces interviene.',
    ],
  },
  {
    id: 'm3-flow-lugar-peligroso',
    title: 'Mantengo un equipo en lugar peligroso / clasificado',
    trigger: 'El equipo está en un área clasificada (riesgo de explosión/ignición).',
    actions: [
      'Solo personal calificado.',
      'Trabaja fuera del área clasificada en lo posible.',
      'Desconecta la energía y toda fuente de ignición.',
      'Usa solo repuestos aprobados.',
      'Equipos a prueba de explosión / seguridad aumentada.',
    ],
  },
  {
    id: 'm3-flow-trampa-onda',
    title: 'Me preguntan por la trampa de onda (pregunta trampa)',
    trigger: 'Afirman que la trampa de onda de las subestaciones sirve para disminuir las descargas atmosféricas.',
    actions: [
      'Es FALSO.',
      'La trampa de onda (line trap) sirve para comunicación por onda portadora (PLC) sobre la línea de AT.',
      'Lo que mitiga la descarga atmosférica es el pararrayos + el cable/hilo de guarda.',
      'No confundas comunicación con protección contra rayos.',
    ],
  },
  {
    id: 'm3-flow-diferencial-dispara',
    title: 'El diferencial dispara',
    trigger: 'La protección diferencial se activa y corta el circuito.',
    actions: [
      'El diferencial detecta una fuga de corriente: protege del choque eléctrico.',
      'Revisa si hay un equipo con aislación deteriorada o humedad.',
      'Mide la aislación con megger (no con telurómetro).',
      'En el RIC el diferencial de 30 mA es obligatorio: no lo anules.',
      'Repara la fuga antes de reponer el servicio.',
    ],
  },
];

const M3_DIAGNOSIS = [
  {
    id: 'm3-dx-fase-caliente',
    title: 'Una fase más caliente que las otras (termografía)',
    symptom: 'En la termografía, una de las 3 fases muestra una temperatura notablemente mayor.',
    possibleCauses: [
      'Conexión floja',
      'Punto caliente / arco incipiente',
      'Desbalance de carga',
    ],
    solution: 'Programa la corrección con el equipo desenergizado: reaprieta la conexión y revisa el estado del contacto. Vuelve a medir para confirmar. Registra la intervención. Ejemplo: en un interruptor, la fase R marca 70 °C y S/T marcan 40 °C: hay una conexión floja en R.',
  },
  {
    id: 'm3-dx-tierra-alta',
    title: 'Resistencia de puesta a tierra alta',
    symptom: 'El telurómetro mide una resistencia de tierra por encima de lo óptimo (menor o igual a 5 ohm).',
    possibleCauses: [
      'Malla deteriorada o mal unida',
      'Suelo de alta resistividad',
      'Conexiones sueltas',
    ],
    solution: 'Revisa y reaprieta las uniones de la malla, considera mejorarla (más electrodos / tratamiento de suelo) y verifica con un estudio de resistividad. Objetivo: acercarse a ~2 ohm; máximo reglamentario 20 ohm. Ejemplo: la malla de la sala da 18 ohm; aunque "pasa" el reglamento, está lejos del óptimo: mejora uniones y agrega electrodos.',
  },
  {
    id: 'm3-dx-neutro-caliente',
    title: 'Conductor neutro recalentado',
    symptom: 'El neutro se calienta más de lo esperado pese a cargas equilibradas en apariencia.',
    possibleCauses: [
      'Armónicos múltiplos de 3 que se suman en el neutro',
      'Cargas no lineales',
    ],
    solution: 'Mide con un instrumento True RMS (no uno de solo 50 Hz). Identifica las cargas no lineales y evalúa filtrado/redistribución. Un instrumento barato "instantáneo" no detecta armónicos. Ejemplo: tablero de cargadores y luminarias LED con neutro más caliente que las fases: son armónicos de 3er orden sumándose en el neutro.',
  },
  {
    id: 'm3-dx-desbalance',
    title: 'Desbalance de tensión entre fases',
    symptom: 'La diferencia de tensión entre fases supera el 3%.',
    possibleCauses: [
      'Cargas monofásicas mal repartidas',
      'Conexión deficiente',
    ],
    solution: 'Redistribuye las cargas entre fases y revisa conexiones. Mantén el voltaje dentro de 0,95-1,05 p.u. y el desbalance bajo 3%. Ejemplo: un motor trifásico vibra y se calienta; al medir, una fase está 6% más baja: redistribuye las cargas monofásicas.',
  },
  {
    id: 'm3-dx-diferencial',
    title: 'Fuga de corriente / diferencial que dispara',
    symptom: 'La protección diferencial se dispara de forma repetida.',
    possibleCauses: [
      'Aislación deteriorada de un equipo',
      'Humedad / ingreso de agua',
      'Cable o conexión dañada',
    ],
    solution: 'Identifica el circuito afectado y mide la aislación con megóhmetro (megger). Repara la fuga; no anules ni "puentees" el diferencial (30 mA obligatorio en el RIC). El diferencial protege a las personas del choque eléctrico.',
  },
  {
    id: 'm3-dx-tablero-humedo',
    title: 'Tablero en lugar húmedo',
    symptom: 'Tablero expuesto a agua o humedad, con riesgo de falla o disparo.',
    possibleCauses: [
      'Grado de protección IP insuficiente para el ambiente',
      'Sellos o prensaestopas en mal estado',
    ],
    solution: 'Usa tableros con grado IP adecuado al ambiente (1er dígito = sólidos/polvo, 2° = agua; en lugares húmedos IP alto, ej. IP65/IP66). Revisa sellos y entradas de cables; mantenlo cerrado y estanco.',
  },
];

const M3_QUIZ = [
  {
    id: 'm3-q-autoridad',
    question: '¿Quién es la autoridad competente en Chile según la NFPA 70B?',
    options: ['El CDEC', 'La SEC', 'El INN', 'La mutualidad'],
    correctIndex: 1,
    explanation: 'La SEC (Superintendencia de Electricidad y Combustibles). Pregunta confirmada de examen.',
  },
  {
    id: 'm3-q-edicion',
    question: '¿De qué año es la edición vigente de la NFPA 70B?',
    options: ['2018', '2021', '2023', '2024'],
    correctIndex: 2,
    explanation: 'Edición 2023 (Nivel 1).',
  },
  {
    id: 'm3-q-pilares',
    question: '¿Cuáles son los 4 pilares de la norma?',
    options: [
      'Seguridad, Gestión de Mantenimiento, Procedimientos por equipo, Análisis de la información',
      'Generación, Transmisión, Distribución, Consumo',
      'Preventivo, Predictivo, Correctivo, Sistemático',
      'Personas, Procesos, Tecnología, Datos',
    ],
    correctIndex: 0,
    explanation: '1) Seguridad a las Personas, 2) Gestión de Mantenimiento, 3) Procedimientos específicos por equipo, 4) Análisis de la información.',
  },
  {
    id: 'm3-q-estadistica',
    question: '¿Qué porcentaje de los equipos falla en algún momento por falta de mantenimiento?',
    options: ['20%', '50%', '80%', '95%'],
    correctIndex: 2,
    explanation: 'El 80% (estadística internacional).',
  },
  {
    id: 'm3-q-media-tension',
    question: '¿Hasta qué tensión se considera Media Tensión?',
    options: ['Hasta 1 kV', 'Hasta 23 kV', 'Hasta 230 kV', 'Hasta 500 kV'],
    correctIndex: 1,
    explanation: 'Media: mayor a 1 kV hasta 23 kV. Baja menor o igual a 1 kV; Alta mayor a 23 kV hasta 230 kV.',
  },
  {
    id: 'm3-q-riesgo',
    question: '¿Cómo se calcula el riesgo?',
    options: ['Probabilidad + Consecuencia', 'Probabilidad x Consecuencia', 'Consecuencia / Probabilidad', 'Frecuencia x Tiempo'],
    correctIndex: 1,
    explanation: 'Riesgo = Probabilidad de falla x Consecuencia de la falla.',
  },
  {
    id: 'm3-q-tipos',
    question: '¿Cuáles son los 3 tipos de mantenimiento?',
    options: ['Preventivo, Sistemático, Predictivo', 'Manual, Automático, Mixto', 'Diario, Semanal, Anual', 'Interno, Externo, Mixto'],
    correctIndex: 0,
    explanation: 'Preventivo, Sistemático (por frecuencia) y Predictivo (por condición).',
  },
  {
    id: 'm3-q-telurometro',
    question: '¿Qué instrumento mide la resistencia de puesta a tierra?',
    options: ['Megóhmetro (megger)', 'Telurometro', 'Multimetro', 'Osciloscopio'],
    correctIndex: 1,
    explanation: 'El telurómetro. El megger mide aislación (no confundir).',
  },
  {
    id: 'm3-q-ciclo',
    question: '¿Cuál es el rango típico del ciclo de pruebas?',
    options: ['1 a 7 días', '1 a 4 semanas', '6 meses a 3 años', '5 a 10 años'],
    correctIndex: 2,
    explanation: 'De 6 meses a 3 años según uso y condiciones.',
  },
  {
    id: 'm3-q-desenergizado',
    question: '¿Cómo debe estar el equipo para inspección, prueba o reparación?',
    options: ['Energizado a media carga', 'Energizado en vacío', 'Desenergizado', 'En cortocircuito'],
    correctIndex: 2,
    explanation: 'Desenergizado.',
  },
  {
    id: 'm3-q-1968',
    question: '¿Cómo nació la NFPA 70B?',
    options: [
      'Como Norma obligatoria en 2023',
      'Como "Práctica Recomendada" en 1968',
      'Como un decreto chileno',
      'Como parte del NEC en 1990',
    ],
    correctIndex: 1,
    explanation: 'Nació en 1968 como Práctica Recomendada; hoy es Norma (edición 2023).',
  },
  {
    id: 'm3-q-concentra',
    question: '¿En qué se concentra principalmente la NFPA 70B?',
    options: [
      'En el mantenimiento correctivo tras la falla',
      'En el Mantenimiento Eléctrico Preventivo (MEP)',
      'En el diseño de instalaciones nuevas',
      'En la facturación de la energía',
    ],
    correctIndex: 1,
    explanation: 'En el MEP, para disminuir fallas a personas, equipos y procesos.',
  },
  {
    id: 'm3-q-aplica',
    question: '¿A qué instalaciones aplica la NFPA 70B?',
    options: [
      'Solo a instalaciones domésticas',
      'A instalaciones comerciales e industriales (no considera el nivel doméstico)',
      'Solo a generación eléctrica',
      'A cualquier instalación, incluido el hogar',
    ],
    correctIndex: 1,
    explanation: 'Aplica a instalaciones comerciales e industriales (SEP). NO considera el nivel doméstico.',
  },
  {
    id: 'm3-q-5w',
    question: 'Las 5 preguntas (5W) del MEP incluyen Why, Where, What, Who y...',
    options: ['When', 'How', 'Which', 'Whose'],
    correctIndex: 1,
    explanation: 'How (¿cómo se hará el servicio?). Las 5W: Why, Where, What, Who, How.',
  },
  {
    id: 'm3-q-tierra-valor',
    question: '¿Cuál es el valor óptimo de resistencia de puesta a tierra?',
    options: ['Menor o igual a 5 ohm', 'Entre 50 y 100 ohm', 'Exactamente 220 ohm', 'No importa el valor'],
    correctIndex: 0,
    explanation: 'Óptima menor o igual a 5 ohm (la norma apunta a ~2 ohm; el reglamento tolera hasta 20 ohm).',
  },
  {
    id: 'm3-q-armonicos',
    question: '¿Qué armónicos son los más críticos y por qué?',
    options: [
      'Los pares, porque bajan la tensión',
      'Los múltiplos de 3, porque se suman en el neutro y lo calientan',
      'Los de alta frecuencia, porque cortan el suministro',
      'Ninguno es crítico',
    ],
    correctIndex: 1,
    explanation: 'Los múltiplos de 3 se suman en el conductor neutro y lo calientan. Se miden con instrumentos True RMS.',
  },
  {
    id: 'm3-q-trampa-onda',
    question: '¿Para qué sirve realmente la trampa de onda (line trap) de las subestaciones?',
    options: [
      'Para disminuir las descargas atmosféricas',
      'Para comunicación por onda portadora (PLC)',
      'Para medir la puesta a tierra',
      'Para apagar incendios',
    ],
    correctIndex: 1,
    explanation: 'Sirve para comunicación por onda portadora (PLC), NO para los rayos: de eso se encargan el pararrayos y el cable de guarda. (Pregunta trampa de la guía grupal.)',
  },
  {
    id: 'm3-q-diferencial',
    question: '¿De qué protege la protección diferencial y de cuanto es la obligatoria en el RIC?',
    options: [
      'De la sobrecarga; 100 A',
      'Del choque eléctrico (fuga de corriente); 30 mA',
      'Del cortocircuito; 10 kA',
      'De los rayos; 30 A',
    ],
    correctIndex: 1,
    explanation: 'Detecta fugas de corriente y protege del choque eléctrico; en el RIC es obligatorio el diferencial de 30 mA.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// MODULO 1 — NFPA 70E, Seguridad Electrica en Lugares de Trabajo (slug seguridad-electrica)
// ════════════════════════════════════════════════════════════════════════════

const M1_MANUAL = [
  {
    id: 'm1-01-marco-nfpa70e',
    title: 'Marco y estructura de la NFPA 70E',
    intro: 'Objetivo: identificar los aspectos de la NFPA 70E 2024 y los requisitos de un Programa de Seguridad Eléctrica (PSE). Este módulo es el cimiento del programa: la seguridad eléctrica antes de rescatar (Módulo 2) o mantener (Módulo 3).',
    clave: [
      'NFPA 70E = Norma para la Seguridad Eléctrica en Lugares de Trabajo, edición 2024 (español). Propósito: proveer un área de trabajo segura frente a los riesgos del uso de la electricidad.',
      'La NFPA (National Fire Protection Association, EE.UU.) es la autoridad mundial en seguridad contra incendios y eléctrica.',
      'Estructura: Artículo 90 (introducción); Capítulo 1 - Prácticas de trabajo (Art 100 Definiciones, Art 110 Requisitos generales, Art 120 Condición de trabajo segura, Art 130 Trabajos con peligros); Capítulo 2 - Mantenimiento; Capítulo 3 - Equipos especiales; Anexos A a S (informativos, no obligatorios).',
      'En Chile la fiscaliza la SEC (Superintendencia de Electricidad y Combustibles); se incorporó vía DS N°8 (RIC, reemplazo la NCh 4/2003) y DS N°109 (MT/AT).',
      'Niveles de tensión: Baja (BT) menor o igual a 1 kV; Media (MT) mayor a 1 kV hasta 23 kV; Alta (AT) mayor a 23 kV hasta 230 kV.',
    ],
    terreno: [
      'Persona Calificada = demostró habilidades + capacitación en seguridad para identificar y evitar peligros. Persona No Calificada = todas las demás.',
      'Anexos útiles: C (límites de aproximación), D (cálculo de energía incidente), E (Programa de Seguridad Eléctrica), G (ejemplo de Bloqueo/Etiquetado), H (selección de EPP), Q (desempeño/error humano).',
      'Autochequeo: ¿qué artículo define la condición de trabajo eléctricamente segura? ¿quién fiscaliza en Chile?',
    ],
  },
  {
    id: 'm1-02-tres-peligros',
    title: 'Peligros eléctricos: los tres grandes',
    intro: 'Objetivo: reconocer los 3 peligros que define la NFPA 70E y por qué las lesiones eléctricas son tan graves.',
    medidas: [
      'Triángulo de seguridad: general = 1 fatalidad cada 300 lesiones; Eléctrico = 1 fatalidad cada 10 lesiones',
      'Referencia: ~8.000 lesiones por contacto eléctrico al año',
      '98% de las fatalidades eléctricas laborales son por choque eléctrico',
      'Más del 40% de las fatalidades involucran contacto con líneas eléctricas',
    ],
    clave: [
      'Los 3 peligros NFPA 70E: choque eléctrico (corriente por el cuerpo), relámpago de arco / arc flash (calor y luz), ráfaga / explosión de arco / arc blast (onda de presión).',
      'Peligro eléctrico = condición donde el contacto o falla de equipos puede causar choque, quemadura por relámpago de arco, quemadura térmica o lesión por ráfaga.',
      'Las lesiones eléctricas tienen una tasa de fatalidad mucho mayor que la mayoría de las otras lesiones.',
    ],
    terreno: [
      'Estadística del curso: en lugares de trabajo, casi todos los días se electrocuta una persona.',
      'Autochequeo: ¿cuáles son los 3 peligros que define la norma? ¿qué proporción tiene el triángulo de seguridad eléctrico?',
    ],
  },
  {
    id: 'm1-03-choque-cuerpo',
    title: 'Choque eléctrico: cómo afecta al cuerpo',
    intro: 'Objetivo: entender que determina la gravedad de un choque y leer la tabla de efectos de la corriente.',
    medidas: [
      'Resistencia del cuerpo humano (mano a mano): ~2.000 ohms',
      'Contacto a 380 V: I = 380/2000 = 190 mA. Contacto a 220 V: I = 220/2000 = 110 mA',
      '0-3 mA: umbral de percepción',
      '3-10 mA: no poder soltarse (tetanización del brazo)',
      '10-30 mA: parálisis respiratoria (frecuentemente fatal)',
      '30-75 mA: umbral de fibrilación',
      '75-250 mA: fibrilación ventricular (fatalidad esperada)',
    ],
    clave: [
      'Parámetros que influyen: intensidad de corriente, tiempo de exposición, trayectoria por el cuerpo, naturaleza (CA/CC), resistencia del cuerpo y tensión aplicada.',
      'Lesiones del choque: fibrilación ventricular (la más grave), tetanización ("queda pegado"), paro respiratorio y quemaduras.',
      'Ley de Ohm: I = V / R. A menor resistencia (piel húmeda, mayor área de contacto) circula más corriente.',
    ],
    terreno: [
      'El tiempo importa tanto como la corriente: la fibrilación depende de intensidad x tiempo (curva IEC 479 / NTP 400).',
      'Autochequeo: ¿qué resistencia de cuerpo usa la norma? ¿a partir de qué corriente hay parálisis respiratoria?',
    ],
  },
  {
    id: 'm1-04-arco-causas',
    title: 'Arco eléctrico: características y causas',
    intro: 'Objetivo: entender que es el arco eléctrico, su energía destructiva y por qué falla.',
    medidas: [
      'Temperatura del arco: 2.000 a 20.000 °C (funde cualquier material)',
      'El cobre se expande 67.000 veces al pasar de sólido a vapor; proyecta metal fundido a más de 1.120 km/h',
      'El arco puede encender la ropa hasta a 3 m del punto de falla',
      'Categorías de EPP por energía incidente: Cat 1 = 4 cal/cm² · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm²',
    ],
    clave: [
      'El arco es el flujo de corriente por el aire entre conductores (fase-fase, fase-neutro o fase-tierra). Libera calor radiante, luz intensa y grandes presiones.',
      'Se descompone en relámpago de arco (arc flash) + ráfaga de arco (arc blast).',
      'Causas de falla de arco: sobretensiones, mecánicas (animales, objetos), evolutivas (debilitamiento del aislamiento, condensación, puntos calientes por conexiones flojas) y operacionales (error de maniobra, contacto accidental, contaminación, corrosión, falta de mantenimiento).',
    ],
    terreno: [
      'Falla evolutiva típica: energizar una instalación tras varios días de parada -> condensación sobre el aislamiento -> arco.',
      'Una conexión floja o un borne aflojado genera un punto caliente que puede evolucionar a una falla trifásica.',
      'Autochequeo: ¿en cuánto se expande el cobre? ¿cuántas cal/cm² es la Categoría 2 de EPP?',
    ],
  },
  {
    id: 'm1-05-cinco-reglas-oro',
    title: 'Las 5 Reglas de Oro (condición de trabajo segura)',
    intro: 'Objetivo: establecer una condición de trabajo SIN energía (Art 120). Lo más seguro es trabajar desenergizado; las 5 Reglas de Oro son el corazón del trabajo eléctrico seguro.',
    clave: [
      'Las 5 Reglas de Oro, en orden: 1) Desconectar con corte visible o efectivo todas las fuentes de tensión; 2) Prevenir cualquier realimentación (enclavar/bloquear) + tarjeta "PELIGRO NO OPERAR"; 3) Verificar ausencia de tensión; 4) Poner a tierra y en cortocircuito; 5) Delimitar y señalizar la zona.',
      'Una instalación DESCONECTADA no es lo mismo que SEGURA: hasta cumplir las 5 reglas, cualquier intervención se considera trabajo con tensión.',
      '3a Regla: verificar el detector antes y después, en cada conductor; durante la verificación la instalación se considera con tensión (usar EPP).',
      '4a Regla: partir por el punto de conexión a tierra; pinzas con buen contacto; evitar superficies pintadas.',
    ],
    terreno: [
      'Corte visible se logra: viendo abiertas las cuchillas del desconectador, retirando el interruptor de su celda, o retirando fusibles/puentes.',
      'Autochequeo: ¿cuál es el orden de las 5 Reglas? ¿una instalación desconectada ya es segura para intervenir?',
    ],
  },
  {
    id: 'm1-06-loto',
    title: 'Bloqueo y Etiquetado (LOTO)',
    intro: 'Objetivo: aplicar el Programa de Bloqueo/Etiquetado para que nadie reenergice el equipo mientras se trabaja (Anexo G).',
    clave: [
      'LOTO = Lock Out / Tag Out (Bloqueo / Etiquetado): garantiza que los dispositivos de corte queden inmovilizados y señalizados.',
      'Bloqueo: inmovilizar el mando con candado/cerradura, o impedir el funcionamiento (retirar fusibles de control), o colocar un elemento aislante.',
      'Etiquetado: tarjeta "PELIGRO NO OPERAR" + tarjeta que identifica a quien bloquea (nombre, RUT, foto).',
      'Cada persona que interviene coloca su propio candado; nadie retira el candado de otro.',
    ],
    terreno: [
      'La señalización es la protección mínima cuando no se puede inmovilizar materialmente el aparato de corte.',
      'Autochequeo: ¿qué dice la tarjeta de bloqueo? ¿quién puede retirar tu candado?',
    ],
  },
  {
    id: 'm1-07-fronteras-epp',
    title: 'Fronteras de aproximación y EPP',
    intro: 'Objetivo: respetar las distancias de seguridad y elegir el EPP correcto cuando hay partes energizadas expuestas.',
    medidas: [
      'Frontera de Aproximación Limitada (FAL) típica en BT (50-750 V): ~3,1 m con conductor móvil',
      'Frontera de Aproximación Restringida (FAR) en 151-750 V: ~0,3 m',
      'Categorías de EPP: Cat 1 = 4 cal/cm² · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm²',
      'Pruebas de guantes aislantes: cada 6 meses; mantas y mangas: cada 12 meses',
    ],
    clave: [
      'Frontera de Aproximación Limitada (FAL): solo la cruza personal calificado.',
      'Frontera de Aproximación Restringida (FAR): mayor riesgo de arco; bajo ninguna circunstancia una persona no calificada la cruza, ni siquiera escoltada.',
      'El EPP se elige por la energía incidente (cal/cm²) esperada -> categoría de ropa arco-resistente (AR). ATPV = Valor de Protección Térmica del Arco (cal/cm², bordado en la prenda).',
      'EPP / ESE: guantes aislantes, careta AR, ropa AR, pasamontañas, pértigas.',
    ],
    terreno: [
      'El EPP es el Último recurso de la jerarquía de control: primero se elimina o controla el peligro.',
      'Autochequeo: ¿quién puede cruzar la frontera limitada? ¿cuántas cal/cm² es la Categoría 4?',
    ],
  },
  {
    id: 'm1-08-riesgos-jerarquia',
    title: 'Evaluación de riesgos y jerarquía de control',
    intro: 'Objetivo: evaluar el riesgo eléctrico (choque y arco) y aplicar la jerarquía de control para reducirlo.',
    clave: [
      'La evaluación de riesgo de CHOQUE determina la tensión a la que estará expuesto el personal, las fronteras y el EPP necesario.',
      'La evaluación de riesgo de ARCO determina la energía incidente y el límite de relámpago de arco.',
      'Jerarquía de control de riesgos (de más a menos efectiva): 1) Eliminación, 2) Sustitución, 3) Controles de ingeniería, 4) Avisos / advertencias, 5) Controles administrativos, 6) EPP.',
      'Permiso de Trabajo Eléctrico Energizado: solo cuando desenergizar no es factible o aumenta el riesgo; requiere justificación, análisis y autorización (Anexo J).',
    ],
    terreno: [
      'Anexo Q (Error Humano): el factor humano es clave; usar herramientas de desempeño humano para reducir errores.',
      'Autochequeo: ¿cuál es el primer nivel de la jerarquía de control? ¿cuándo se permite trabajo energizado?',
    ],
  },
  {
    id: 'm1-09-autoevaluacion',
    title: 'Autoevaluación — foco',
    intro: 'Repasa estas preguntas clave del módulo de seguridad eléctrica. Las respuestas están en las lecciones anteriores.',
    clave: [
      'Norma del módulo -> NFPA 70E 2024 (seguridad eléctrica en lugares de trabajo).',
      'Los 3 peligros -> choque, relámpago de arco, ráfaga de arco.',
      'Resistencia del cuerpo (norma) -> ~2.000 ohms.',
      'Corriente con parálisis respiratoria -> 10-30 mA.',
      'Efecto más grave de la corriente -> fibrilación ventricular.',
      'Temperatura del arco -> 2.000 a 20.000 °C.',
      'Expansión del cobre -> 67.000 veces.',
      'Orden de las 5 Reglas de Oro -> desconectar, prevenir realimentación, verificar ausencia, poner a tierra, señalizar.',
      'Quien cruza la frontera restringida -> nadie no calificado (ni escoltado).',
      'Primer nivel de la jerarquía de control -> eliminación.',
      'Autoridad en Chile -> SEC.',
    ],
    terreno: [
      'El examen apunta fuerte a las 5 Reglas, las fronteras, la tabla de efectos de la corriente y la jerarquía de control.',
    ],
  },
];

const M1_PROCEDURES = [
  {
    id: 'm1-proc-condicion-segura',
    title: 'Establecer condición de trabajo eléctricamente segura (5 Reglas de Oro)',
    description: 'Secuencia para trabajar SIN energía. En orden, sin saltarse pasos.\n\nEjemplo: vas a cambiar un contactor en un CCM de 380 V. Abres el interruptor (corte visible), bloqueas con tu candado y tarjeta, verificas con detector que no hay tensión en las 3 fases, pones a tierra y delimitas la zona. Recién ahí trabajas.',
    steps: [
      'Desconectar con corte visible o efectivo todas las fuentes de tensión.',
      'Prevenir realimentación: enclavar/bloquear + tarjeta "PELIGRO NO OPERAR".',
      'Verificar ausencia de tensión (detector probado antes y después, en cada conductor).',
      'Poner a tierra y en cortocircuito, partiendo por el punto de conexión a tierra.',
      'Delimitar y señalizar la zona de trabajo.',
    ],
  },
  {
    id: 'm1-proc-loto',
    title: 'Bloqueo y Etiquetado (LOTO)',
    description: 'Asegurar que nadie reenergice el equipo mientras se trabaja.\n\nEjemplo: dos técnicos intervienen el mismo tablero; cada uno pone su propio candado en la pinza múltiple. El equipo no puede reenergizarse hasta que AMBOS retiren su candado.',
    steps: [
      'Identifica TODAS las fuentes de energía del equipo (eléctrica y almacenada).',
      'Apaga / desconecta por el procedimiento normal.',
      'Aisla y bloquea cada dispositivo de corte con tu propio candado.',
      'Coloca la tarjeta "PELIGRO NO OPERAR" con tu identificación (nombre, RUT, foto).',
      'Verifica ausencia de tensión y descarga la energía almacenada.',
      'Al terminar, retira SOLO tu propio candado.',
    ],
  },
  {
    id: 'm1-proc-verificar-tension',
    title: 'Verificar ausencia de tensión',
    description: 'La 3a Regla de Oro hecha bien: el detector se prueba antes y después.\n\nEjemplo: antes de tocar la barra, pruebas el detector en un enchufe con tensión (funciona), mides la barra (0 V en las 3 fases) y vuelves a probar el detector en el enchufe (sigue funcionando): recién ahí la lectura de 0 V es valida.',
    steps: [
      'Ponte el EPP (guantes aislantes): la instalación se considera con tensión.',
      'Prueba el detector en una fuente conocida CON tensión.',
      'Mide en cada conductor (todas las fases y el neutro).',
      'Vuelve a probar el detector en la fuente conocida (confirma que sigue funcionando).',
      'Recién ahí declara ausencia de tensión.',
    ],
  },
  {
    id: 'm1-proc-epp-arco',
    title: 'Seleccionar EPP por categoría de arco',
    description: 'Elegir la ropa arco-resistente según la energía incidente.\n\nEjemplo: el estudio de arco da 7 cal/cm² en un tablero; eliges ropa AR con ATPV mayor o igual a 8 (Categoría 2), careta AR y guantes aislantes.',
    steps: [
      'Determina la energía incidente esperada (cal/cm²) del punto de trabajo.',
      'Ubica la categoría: Cat 1 = 4 · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm².',
      'Elige ropa AR cuyo ATPV sea igual o mayor a esa energía.',
      'Completa con careta AR, guantes aislantes y pasamontañas.',
      'Verifica la vigencia de las pruebas (guantes cada 6 meses).',
    ],
  },
];

const M1_FLOWS = [
  {
    id: 'm1-flow-intervenir',
    title: 'Voy a intervenir un equipo eléctrico',
    trigger: 'Necesitas trabajar en un equipo o circuito eléctrico.',
    actions: [
      'Primero intenta desenergizar: es lo más seguro.',
      'Aplica las 5 Reglas de Oro.',
      'Bloquea y etiqueta (LOTO) con tu candado.',
      'Verifica ausencia de tensión antes de tocar.',
      'Si NO se puede desenergizar, tramita un Permiso de Trabajo Energizado.',
    ],
  },
  {
    id: 'm1-flow-punto-caliente',
    title: 'Detecto un punto caliente o conexión floja',
    trigger: 'Termografía o inspección muestra un punto caliente / conexión floja.',
    actions: [
      'No lo intervengas energizado.',
      'Programa la corrección con el equipo desenergizado.',
      'Reaprieta o repara la conexión.',
      'Es una causa evolutiva de arco: registra y da seguimiento.',
    ],
  },
  {
    id: 'm1-flow-no-calificado',
    title: 'Una persona no calificada se acerca a zona energizada',
    trigger: 'Alguien sin calificación se aproxima a partes energizadas expuestas.',
    actions: [
      'Detenlo antes de la Frontera de Aproximación Limitada.',
      'Solo personal calificado cruza la FAL.',
      'Nadie no calificado cruza la Frontera Restringida, ni escoltado.',
      'Señaliza y delimita la zona.',
    ],
  },
];

const M1_DIAGNOSIS = [
  {
    id: 'm1-dx-paralisis',
    title: 'Corriente de 10-30 mA por el cuerpo',
    symptom: 'Una persona recibe entre 10 y 30 mA: dificultad para respirar / parálisis respiratoria.',
    possibleCauses: [
      'Paso de corriente por el tórax',
      'Tetanización de los músculos respiratorios',
    ],
    solution: 'Corta la energía o separa a la víctima con un elemento aislante seco, llama a emergencia (131) e inicia SVB/RCP si no respira. Recuerda: 10-30 mA es frecuentemente fatal. Ejemplo: alguien toca un cable pelado de 220 V con la mano húmeda y no puede respirar bien; cortar la energía y aplicar SVB de inmediato.',
  },
  {
    id: 'm1-dx-arco-parada',
    title: 'Arco al energizar tras una parada larga',
    symptom: 'Al reenergizar un equipo después de varios días detenido, se produce una falla de arco.',
    possibleCauses: [
      'Condensación sobre el aislamiento',
      'Debilitamiento evolutivo del aislamiento',
      'Contaminación / polvo en superficies aislantes',
    ],
    solution: 'Antes de reenergizar tras una parada larga, inspecciona y seca; usa termografía para detectar puntos calientes. Es una falla evolutiva: el mantenimiento preventivo la previene. Ejemplo: un tablero parado el fin de semana junta condensación; el lunes, al cerrarlo energizado, hace un arco. Inspecciona y seca antes de energizar.',
  },
  {
    id: 'm1-dx-contacto-linea',
    title: 'Contacto con línea energizada',
    symptom: 'Un trabajador hace contacto con una línea o parte energizada expuesta.',
    possibleCauses: [
      'No se estableció condición de trabajo segura',
      'Cruce de frontera sin EPP / sin calificación',
    ],
    solution: 'No toques a la víctima mientras esté energizada: corta la energía o sepárala con un aislante seco. Luego evalúa y aplica SVB. Se previene aplicando las 5 Reglas de Oro y respetando las fronteras. Ejemplo: un trabajador toca una barra "que creía muerta"; nunca se hizo la verificación de ausencia de tensión.',
  },
];

const M1_QUIZ = [
  {
    id: 'm1-q-peligros',
    question: '¿Cuántos peligros eléctricos define la NFPA 70E y cuales son?',
    options: ['Uno: el choque', 'Dos: choque y arco', 'Tres: choque, relámpago de arco y ráfaga de arco', 'Cuatro: choque, arco, incendio y explosión'],
    correctIndex: 2,
    explanation: 'Tres: choque eléctrico, relámpago de arco (arc flash) y ráfaga de arco (arc blast).',
  },
  {
    id: 'm1-q-resistencia',
    question: 'Según la norma, ¿qué resistencia se considera para el cuerpo humano (mano a mano)?',
    options: ['200 ohms', '2.000 ohms', '20.000 ohms', '200.000 ohms'],
    correctIndex: 1,
    explanation: '~2.000 ohms. A 220 V eso da ~110 mA; a 380 V, ~190 mA.',
  },
  {
    id: 'm1-q-paralisis',
    question: '¿A partir de qué rango de corriente hay parálisis respiratoria?',
    options: ['0-3 mA', '3-10 mA', '10-30 mA', 'mayor a 5 A'],
    correctIndex: 2,
    explanation: '10-30 mA: parálisis respiratoria, frecuentemente fatal.',
  },
  {
    id: 'm1-q-reglas-oro',
    question: '¿Cuál es el orden correcto de las 5 Reglas de Oro?',
    options: [
      'Verificar, desconectar, tierra, bloquear, señalizar',
      'Desconectar, prevenir realimentación, verificar ausencia de tensión, poner a tierra, señalizar',
      'Bloquear, señalizar, desconectar, tierra, verificar',
      'Desconectar, verificar, señalizar, tierra, bloquear',
    ],
    correctIndex: 1,
    explanation: '1) desconectar (corte visible), 2) prevenir realimentación (bloquear), 3) verificar ausencia de tensión, 4) poner a tierra y cortocircuito, 5) señalizar.',
  },
  {
    id: 'm1-q-desconectada',
    question: 'Una instalación DESCONECTADA, ¿ya es segura para intervenir?',
    options: ['Si, basta con desconectar', 'No: hasta cumplir las 5 Reglas se considera trabajo con tensión', 'Solo si es de baja tensión', 'Solo si está señalizada'],
    correctIndex: 1,
    explanation: 'Desconectada no es segura: hasta completar las 5 Reglas de Oro, cualquier intervención se considera trabajo con tensión.',
  },
  {
    id: 'm1-q-far',
    question: 'La Frontera de Aproximación Restringida (FAR)...',
    options: ['La puede cruzar cualquiera', 'Solo la cruza personal no calificado', 'Bajo ninguna circunstancia la cruza una persona no calificada, ni escoltada', 'Solo se aplica en alta tensión'],
    correctIndex: 2,
    explanation: 'La FAR no la cruza una persona no calificada bajo ninguna circunstancia, ni escoltada. La Frontera Limitada solo la cruza personal calificado.',
  },
  {
    id: 'm1-q-categoria',
    question: '¿Cuántas cal/cm² corresponden a la Categoría 2 de EPP?',
    options: ['4 cal/cm²', '8 cal/cm²', '25 cal/cm²', '40 cal/cm²'],
    correctIndex: 1,
    explanation: 'Cat 1 = 4 · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm². El EPP se elige por la energía incidente esperada.',
  },
  {
    id: 'm1-q-jerarquia',
    question: '¿Cuál es el primer (más efectivo) nivel de la jerarquía de control de riesgos?',
    options: ['EPP', 'Controles administrativos', 'Eliminación del peligro', 'Senalizacion'],
    correctIndex: 2,
    explanation: 'Jerarquía: Eliminación > Sustitución > Controles de ingeniería > Avisos > Controles administrativos > EPP. El EPP es el último recurso.',
  },
  {
    id: 'm1-q-cobre',
    question: '¿Cuánto se expande el cobre al pasar de sólido a vapor en una ráfaga de arco?',
    options: ['67 veces', '6.700 veces', '67.000 veces', '670.000 veces'],
    correctIndex: 2,
    explanation: '67.000 veces; proyecta metal fundido a más de 1.120 km/h.',
  },
  {
    id: 'm1-q-loto',
    question: 'La tarjeta de bloqueo "PELIGRO NO OPERAR"...',
    options: ['La puede retirar cualquier supervisor', 'Solo la retira quien la colocó (su propio candado)', 'Se retira al final del turno automáticamente', 'No es obligatoria'],
    correctIndex: 1,
    explanation: 'Cada persona coloca su propio candado y tarjeta; nadie retira el candado de otro. La tarjeta identifica a quien bloquea.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// GLOSARIOS — pestana propia "Glosario" (term / definition / lesson para redirigir)
// ════════════════════════════════════════════════════════════════════════════

const M1_GLOSSARY = [
  { term: 'NFPA 70E', definition: 'Norma de Seguridad Eléctrica en Lugares de Trabajo (la de este módulo).', lesson: 1 },
  { term: 'PSE', definition: 'Programa de Seguridad Eléctrica.', lesson: 1 },
  { term: 'BT / MT / AT', definition: 'Baja (≤1 kV) / Media (>1-23 kV) / Alta (>23-230 kV) Tensión.', lesson: 1 },
  { term: 'Persona Calificada / No Calificada', definition: 'Quien tiene (o no) habilidades y entrenamiento para reconocer y evitar el peligro eléctrico.', lesson: 1 },
  { term: 'SEC', definition: 'Superintendencia de Electricidad y Combustibles (fiscaliza en Chile).', lesson: 1 },
  { term: 'RIC', definition: 'Reglamento de Instalaciones de Consumo.', lesson: 1 },
  { term: 'Energía incidente', definition: 'Energía (cal/cm²) que un arco entrega sobre una superficie a una distancia dada.', lesson: 4 },
  { term: '5 Reglas de Oro', definition: 'Secuencia para dejar la instalación sin tensión.', lesson: 5 },
  { term: 'LOTO', definition: 'Lock Out / Tag Out (Bloqueo / Etiquetado).', lesson: 6 },
  { term: 'FAL', definition: 'Frontera de Aproximación Limitada.', lesson: 7 },
  { term: 'FAR', definition: 'Frontera de Aproximación Restringida.', lesson: 7 },
  { term: 'EPP', definition: 'Equipo de Protección Personal.', lesson: 7 },
  { term: 'ESE', definition: 'Elementos de Seguridad Eléctrica.', lesson: 7 },
  { term: 'AR', definition: 'Arco-Resistente (ropa de protección contra arco).', lesson: 7 },
  { term: 'FR', definition: 'Resistente a la Llama.', lesson: 7 },
  { term: 'ATPV', definition: 'Valor de Protección Térmica del Arco (cal/cm², bordado en la prenda).', lesson: 7 },
  { term: 'Jerarquía de control', definition: 'Eliminación > Sustitución > Ingeniería > Avisos > Administrativos > EPP.', lesson: 8 },
];

const M2_GLOSSARY = [
  { term: 'SVB', definition: 'Soporte Vital Básico.', lesson: 7 },
  { term: 'RCP', definition: 'Reanimación Cardiopulmonar.', lesson: 7 },
  { term: 'DEA / DAE', definition: 'Desfibrilador Externo Automático.', lesson: 7 },
  { term: 'MES', definition: 'Mirar el tórax, Escuchar, Sentir (para evaluar la ventilación).', lesson: 7 },
  { term: 'ABCDE', definition: 'Airway (vía aérea), Breathing (ventilación), Circulation (circulación), Disability (daño neuro), Exposure (exposición).', lesson: 8 },
  { term: 'AVDN', definition: 'Alerta / responde a Verbal / responde a Dolor / No responde (nivel de conciencia).', lesson: 8 },
  { term: 'PIRRL', definition: 'Pupilas Iguales, Redondas, Reactivas a la Luz.', lesson: 8 },
  { term: 'SER', definition: 'Orden de la Seguridad: yo, mi equipo, la víctima (escena, cinemática, recursos).', lesson: 11 },
  { term: 'TEC', definition: 'Traumatismo Encéfalo-Craneano (daño neurológico).', lesson: 11 },
  { term: 'RICE', definition: 'Reposo, Hielo (Ice), Compresión, Elevación (esguince leve).', lesson: 6 },
  { term: '5 Reglas de Oro', definition: 'Secuencia de trabajo sin tensión.', lesson: 3 },
  { term: 'EPP', definition: 'Equipo de Protección Personal.', lesson: 3 },
  { term: 'ESE', definition: 'Elementos de Seguridad Eléctrica.', lesson: 3 },
  { term: 'AR', definition: 'Arco-Resistente.', lesson: 3 },
  { term: 'NFPA 70E', definition: 'Norma de seguridad eléctrica en lugares de trabajo (Ed. 2024).', lesson: 1 },
  { term: 'SEC', definition: 'Superintendencia de Electricidad y Combustibles.', lesson: 1 },
  { term: 'RIC', definition: 'Reglamento de Instalaciones de Consumo.', lesson: 1 },
];

const M3_GLOSSARY = [
  { term: 'NFPA 70B', definition: 'Norma para el Mantenimiento del Equipo Eléctrico (la de este módulo).', lesson: 1 },
  { term: 'NFPA 70E', definition: 'Norma de Seguridad Eléctrica en lugares de trabajo.', lesson: 1 },
  { term: 'NFPA 70 / NEC', definition: 'Código Eléctrico Nacional (National Electrical Code).', lesson: 1 },
  { term: 'AC', definition: 'Autoridad Competente (en Chile = la SEC).', lesson: 1 },
  { term: 'SEC', definition: 'Superintendencia de Electricidad y Combustibles (fiscaliza en Chile).', lesson: 1 },
  { term: 'MEP', definition: 'Mantenimiento Eléctrico Preventivo: programa de inspección, pruebas, análisis y servicios.', lesson: 3 },
  { term: 'TPEF', definition: 'Tiempo Promedio Entre Fallas (categorías 1 a 5).', lesson: 4 },
  { term: 'PHVA', definition: 'Planificar / Hacer / Verificar / Actuar (ciclo de mejora).', lesson: 7 },
  { term: 'BT / MT / AT', definition: 'Baja (≤1 kV) / Media (>1-23 kV) / Alta (>23-230 kV) Tensión.', lesson: 8 },
  { term: 'RCM', definition: 'Mantenimiento Centrado en la Confiabilidad.', lesson: 9 },
  { term: 'TPM', definition: 'Mantenimiento Productivo Total.', lesson: 9 },
  { term: 'MBC', definition: 'Mantenimiento Basado en la Condición.', lesson: 9 },
  { term: 'CMMS', definition: 'Sistema de Administración del Mantenimiento Computacional.', lesson: 9 },
  { term: 'Px', definition: 'Plan de puesta en marcha.', lesson: 9 },
  { term: 'FPT', definition: 'Pruebas de Desempeño Funcional.', lesson: 9 },
  { term: 'True RMS', definition: 'Valor eficaz verdadero (mide todo el espectro de frecuencia).', lesson: 10 },
  { term: 'p.u.', definition: 'Por unidad (rango de tensión admisible 0,95-1,05).', lesson: 10 },
  { term: 'PE', definition: 'Conductor de protección a tierra (verde / verde-amarillo).', lesson: 11 },
  { term: 'SEP', definition: 'Sistema Eléctrico de Potencia.', lesson: 12 },
  { term: 'SSEE', definition: 'Subestaciones Eléctricas.', lesson: 12 },
  { term: 'IP', definition: 'Grado de Protección (1er dígito sólidos/polvo, 2° agua).', lesson: 12 },
  { term: 'PLC', definition: 'Comunicación por onda portadora (Power Line Carrier).', lesson: 12 },
  { term: 'RIC', definition: 'Reglamento de Instalaciones de Consumo (diferencial de 30 mA obligatorio).', lesson: 12 },
];

// ════════════════════════════════════════════════════════════════════════════
// BIBLIOGRAFIAS — pestana propia "Bibliografia" (label / url). Fuentes del manual.
// ════════════════════════════════════════════════════════════════════════════

const M1_BIBLIO = [
  { label: 'NFPA 70E — Norma de Seguridad Eléctrica en Lugares de Trabajo, edición en español 2024.', url: 'https://link.nfpa.org/all-publications/70E/2024' },
  { label: 'OSHA 1910.269 — Estandares de Seguridad y Salud Ocupacional, Subparte R (Generación, Transmisión y Distribución de Energía Eléctrica).', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.269' },
  { label: 'Ministerio de Salud — Departamento de Estadisticas e Información de Salud (DEIS), MINSAL.', url: 'https://deis.minsal.cl/' },
  { label: 'SEC — Superintendencia de Electricidad y Combustibles.', url: 'https://www.sec.cl' },
  { label: 'DS 08/2019 — Reglamento de Instalaciones de Consumo (RIC) y pliegos técnicos.', url: 'https://www.sec.cl/reglamento-de-seguridad-de-las-instalaciones-de-consumo-de-energia-electrica-decreto-08/' },
  { label: 'Decreto Supremo 109 (2018) — Reglamento de Seguridad de instalaciones eléctricas, Ministerio de Energía.', url: 'https://www.sec.cl/centro-de-descargas/' },
  { label: 'Pliego Técnico Normativo RPTD N°15 — Operación y mantenimiento.', url: null },
  { label: 'Pliego Técnico Normativo RPTD N°17.', url: null },
  { label: 'R. H. Lee, "The Other Electrical Hazard: Electrical Arc Blast Burns", IEEE Transactions on Industry Applications, Vol. 1A-18, N°3, 1982.', url: null },
  { label: 'Normas ASTM — Sociedad Americana de Ensayos y Materiales.', url: 'https://www.astm.org' },
  { label: 'Normas IEEE — Instituto de Ingenieros Eléctricos y Electronicos.', url: 'https://www.ieee.org/standards/' },
  { label: 'Manual de Primeros Auxilios ACHS.', url: null },
  { label: 'Manuales del curso, OTEC ADVISOR Capacitaciones SpA.', url: 'https://advisorcapacitacion.cl/' },
];

const M2_BIBLIO = [
  { label: 'NFPA 70E — Norma de seguridad eléctrica en lugares de trabajo, version en español 2024.', url: 'https://link.nfpa.org/all-publications/70E/2024' },
  { label: 'OSHA 1910.269 — Estandares de Seguridad y Salud Ocupacional, Subparte R.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.269' },
  { label: 'Ministerio de Salud — DEIS, MINSAL.', url: 'https://deis.minsal.cl/' },
  { label: 'SEC — Superintendencia de Electricidad y Combustibles.', url: 'https://www.sec.cl' },
  { label: 'DS 08/2019 — Reglamento de Instalaciones de Consumo (RIC) y pliegos técnicos.', url: 'https://www.sec.cl/reglamento-de-seguridad-de-las-instalaciones-de-consumo-de-energia-electrica-decreto-08/' },
  { label: 'Decreto Supremo 109 (2018) — Reglamento de Seguridad de instalaciones eléctricas, Ministerio de Energía.', url: 'https://www.sec.cl/centro-de-descargas/' },
  { label: 'Pliegos Técnicos Normativos RPTD N°15 (Operación y mantenimiento) y N°17.', url: null },
  { label: 'R. H. Lee, "The Other Electrical Hazard: Electrical Arc Blast Burns", IEEE Transactions on Industry Applications, 1982.', url: null },
  { label: 'RCP Corp. — Norma Nacional de Reanimación Cardiopulmonar Básica del Adulto y Pediatrica.', url: null },
  { label: 'Manual de Primeros Auxilios ACHS.', url: null },
  { label: 'Normas ASTM — Sociedad Americana de Ensayos y Materiales.', url: 'https://www.astm.org' },
  { label: 'Normas IEEE — Instituto de Ingenieros Eléctricos y Electronicos.', url: 'https://www.ieee.org/standards/' },
  { label: 'Manuales Rescate Eléctrico y SVB, OTEC ADVISOR Capacitaciones SpA.', url: 'https://advisorcapacitacion.cl/' },
];

const M3_BIBLIO = [
  { label: 'NFPA 70B — Norma para el Mantenimiento del Equipo Eléctrico (edición 2023).', url: null },
  { label: 'OSHA 1910.269 — Estandares de Seguridad y Salud Ocupacional, Subparte R.', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.269' },
  { label: 'Ministerio de Salud — DEIS, MINSAL.', url: 'https://deis.minsal.cl/' },
  { label: 'SEC — Superintendencia de Electricidad y Combustibles.', url: 'https://www.sec.cl' },
  { label: 'DS 08/2019 — Reglamento de Instalaciones de Consumo (RIC) y pliegos técnicos.', url: 'https://www.sec.cl/reglamento-de-seguridad-de-las-instalaciones-de-consumo-de-energia-electrica-decreto-08/' },
  { label: 'Decreto Supremo 109 (2018) — Reglamento de Seguridad de instalaciones eléctricas, Ministerio de Energía.', url: 'https://www.sec.cl/centro-de-descargas/' },
  { label: 'Pliegos Técnicos Normativos RPTD N°15 (Operación y mantenimiento) y N°17.', url: null },
  { label: 'Normas ASTM — Sociedad Americana de Ensayos y Materiales.', url: 'https://www.astm.org' },
  { label: 'Normas IEEE — Instituto de Ingenieros Eléctricos y Electronicos.', url: 'https://www.ieee.org/standards/' },
  { label: 'Comision Nacional de Energía (CNE).', url: 'https://www.cne.cl' },
  { label: 'Ministerio de Energía.', url: 'https://energia.gob.cl' },
  { label: 'Manuales del curso, OTEC ADVISOR Capacitaciones SpA.', url: 'https://advisorcapacitacion.cl/' },
];

// ════════════════════════════════════════════════════════════════════════════
// MODULO 4 — Codigo Electrico Nacional NFPA 70 / NEC 2023 (slug codigo-electrico-nec)
// Curso teorico (dia 1) + practico (dia 2): NEC + reglamentos SEC (RIC / RPTD).
// ════════════════════════════════════════════════════════════════════════════

const M4_MANUAL = [
  {
    id: 'm4-01-que-es-nec',
    title: 'Que es el NEC y cómo se organiza',
    intro: 'Objetivo: ubicar el Código Eléctrico Nacional NFPA 70 (NEC) 2023, Nivel 1, y entender como está estructurado. El curso cruza el NEC (código internacional de referencia) con la normativa chilena de la SEC.',
    clave: [
      'NFPA 70 (NEC) = Código Eléctrico Nacional. Su objetivo es que las instalaciones estén esencialmente libres de peligros; NO garantiza que sean eficientes ni con capacidad para el futuro.',
      'Estructura del código: Capítulos 1 al 4 = aplicación general a todas las instalaciones; Capítulos 5 al 7 = ocupaciones, equipos y condiciones especiales; Capítulo 8 = comunicaciones (independiente salvo referencia).',
      'Lenguaje del código (pregunta de examen): obligatorio = "debe" / "no debe" (mandatorio, no hay opción); permisivo = "debe estar permitido". Las notas informativas son solo explicativas.',
      'En Chile el NEC se aplica vinculado a la normativa de la SEC (Decreto 8 / RIC para consumo, Decreto 109 / RPTD para MT-AT).',
    ],
    terreno: [
      'Regla mnemotécnica: si el código dice "debe", es obligatorio; subraya siempre los valores máximos y mínimos, que son pregunta de prueba.',
      'Autochequeo: ¿qué capítulos del NEC son de aplicación general? ¿qué significa la palabra "debe"?',
    ],
  },
  {
    id: 'm4-02-articulo-110',
    title: 'Artículo 110: requisitos generales de instalación',
    intro: 'Objetivo: conocer las exigencias básicas del Artículo 110 sobre cómo se instala y se accede a los equipos eléctricos. Es la base de todo el código.',
    medidas: [
      'Espacio de trabajo: ancho mínimo 30 pulgadas (~76 cm) o el ancho del equipo, lo que sea mayor',
      'Equipos grandes (>= 1200 A y > 6 pies / 1,8 m de ancho): accesos/salidas en ambos extremos para evacuación',
    ],
    clave: [
      'Solo se aceptan conductores y equipos APROBADOS. En Chile, los materiales deben estar certificados y llevar el código QR de la SEC.',
      'Ejecución mecánica profesional: cerrar las aberturas no utilizadas de cajas y gabinetes.',
      'Identificación: los medios de desconexión y circuitos deben estar marcados según su propósito; tableros con etiqueta de Riesgo de Relámpago de Arco y la corriente de falla calculada.',
      'El espacio de trabajo del tablero es EXCLUSIVO: prohibido guardar material combustible o inflamable, o usarlo de bodega.',
    ],
    terreno: [
      'Advertencia del relator: en Chile se comercializa de todo, por lo que no todos los materiales están certificados; verifica el código QR de la SEC.',
      'Autochequeo: ¿ancho mínimo del espacio de trabajo? ¿qué se exige para equipos de 1200 A o más?',
    ],
  },
  {
    id: 'm4-03-dimensionamiento-proteccion',
    title: 'Dimensionamiento de conductores y protección (Art. 210/215/240/310)',
    intro: 'Objetivo: aplicar las reglas del NEC para que el conductor y su protección soporten la carga sin sobrecalentarse. Acá aparece la famosa regla del 125 %.',
    medidas: [
      'Carga continua: la corriente máxima persiste 3 horas o más',
      'Regla del 125 %: conductor y dispositivo de sobrecorriente (DSC) se dimensionan al 125 % de la carga continua',
      'Temperatura de terminal: 60 °C o 75 °C (no el 90 °C del aislante)',
      'Ocupación de canalización: máximo 40 % de la sección con más de 2 conductores',
    ],
    clave: [
      'Carga continua (3 h o más) vs intermitente / breve duración (menos de 3 h, ej. una que opera 15 min).',
      'Error común: dimensionar el conductor solo por el aislante (90 °C). Manda la clasificación del TERMINAL (60/75 °C); ya no se permite conectar el conductor directo al automático sin terminal.',
      'Los DSC deben interrumpir los TRES: sobrecarga + cortocircuito + falla a tierra (pregunta de examen).',
      'Falla a tierra = una fase que se va a la estructura/carcasa (ej. motor con pérdida de aislación que energiza el chasis). La corriente busca el camino más corto a tierra.',
    ],
    terreno: [
      'Si pones un conductor chico con un automático grande, el conductor "funciona de hilo fusible" (se derrite antes de que opere la protección).',
      'Autochequeo: ¿desde cuántas horas una carga es continua? ¿a qué temperatura de terminal se dimensiona?',
    ],
  },
  {
    id: 'm4-04-articulo-250-tierra',
    title: 'Artículo 250: puesta a tierra y conexión equipotencial',
    intro: 'Objetivo: distinguir la puesta a tierra del sistema, la del equipo y el bonding, y por qué la tierra física no basta. Es el pilar de la seguridad eléctrica.',
    clave: [
      'Puesta a tierra del sistema: conecta intencionalmente un conductor a tierra para limitar sobretensiones y estabilizar el voltaje.',
      'Conexión equipotencial / bonding: une las partes metálicas no portadoras de corriente para crear una trayectoria de baja impedancia que haga operar rápido la protección.',
      'La tierra física (el suelo) NO se considera trayectoria efectiva de falla por su alta impedancia; se requiere un conductor de cobre/metal instalado para ese fin.',
      'Corte omnipolar: desconectar TODOS los conductores activos, incluido el neutro (obligatorio en tableros generales y de distribución, salvo dispositivos > 630 A).',
    ],
    terreno: [
      'En terreno: el bonding es lo que permite que el diferencial o el disyuntor "vean" la falla y corten; sin buena trayectoria de retorno, la protección no opera.',
      'Autochequeo: ¿la tierra física sirve como trayectoria de falla? ¿qué es el corte omnipolar?',
    ],
  },
  {
    id: 'm4-05-marco-sec',
    title: 'Marco legal chileno: SEC, RIC y RPTD',
    intro: 'Objetivo: conocer como Chile adoptó el NEC a través de la SEC y sus reglamentos. Acá están los pliegos técnicos que rigen el trabajo real.',
    medidas: [
      'Baja Tensión (BT): <= 1 kV',
      'Media Tensión (MT): > 1 kV hasta 23 kV',
      'Resistencia máxima de puesta a tierra de servicio en MT: 20 ohm',
      'Tensión de seguridad en lugares húmedos: 24 V',
      'Subestaciones: cierros exteriores altura mínima 2,0 m',
    ],
    clave: [
      'Autoridad Competente (AC) en Chile = la SEC (Superintendencia de Electricidad y Combustibles): interpreta reglas, aprueba equipos y métodos alternativos.',
      'Decreto 8 -> RIC (Reglamento de Instalaciones de Consumo), reemplaza a la NCh Elec 4/2003; 19 pliegos técnicos (RIC N°01 a N°19).',
      'Decreto 109 -> RPTD (instalaciones de MT/AT, publicado 12-jun-2018); 17 pliegos (RPTD N°01 a N°17).',
      'Pliegos RIC clave: N°02 Tableros (IP 41 mínimo interior), N°05 Tensiones peligrosas (24 V húmedos), N°06 Puesta a tierra, N°17 Operación y mantenimiento, N°18 Presentación de proyectos, N°19 Puesta en servicio.',
    ],
    terreno: [
      'RIC N°18 exige el Informe de Imágenes (termografías) para declarar el proyecto. RIC N°19: el primer ensayo antes de la puesta en servicio es la continuidad de los conductores de protección, con instrumentos certificados IEC 61557.',
      'Autochequeo: ¿quién es la AC en Chile? ¿cuántos pliegos RIC hay? ¿resistencia máxima de tierra en MT?',
    ],
  },
  {
    id: 'm4-06-spt-electrodos',
    title: 'Sistemas de puesta a tierra (SPT) y electrodos',
    intro: 'Objetivo: conocer los tipos de electrodos y para que sirve cada configuración de puesta a tierra. Muy preguntado en el examen.',
    clave: [
      'El SPT limita las tensiones respecto a tierra en las masas metálicas, asegura la operación de las protecciones y reduce el riesgo a personas y cosas.',
      'Tipos de electrodos (pregunta de examen): barras verticales, conductores horizontales, placas, y la combinación (malla de tierra). El material preferido es el COBRE.',
      'Barras: la forma más común cuando no se requiere controlar potenciales de superficie; económicas; alcanzan capas profundas de baja resistividad.',
      'Mallas: reticulado de conductores horizontales (+ barras verticales); se usan cuando el objetivo es controlar los potenciales de superficie con baja resistencia.',
    ],
    terreno: [
      'Se DEBE evaluar cada caso según el terreno; antes se echaba sal para "mejorar" la tierra, pero la sal es altamente corrosiva y daña el electrodo.',
      'Autochequeo: ¿qué material se prefiere para los electrodos? ¿cuándo se usa una malla en vez de barras?',
    ],
  },
  {
    id: 'm4-07-reglas-oro-rescate',
    title: 'Las 5 Reglas de Oro y el rescate eléctrico',
    intro: 'Objetivo: aplicar la secuencia de trabajo sin tensión (NFPA 70E) y conocer los requisitos de rescate. El Decreto 8 llamó a la NFPA 70E como referencia de seguridad.',
    clave: [
      'Las 5 Reglas de Oro: 1) corte efectivo de todas las fuentes de tensión; 2) prevenir la realimentación (bloqueo y etiquetado / LOTO); 3) verificar la ausencia de tensión (3er paso obligatorio); 4) puesta a tierra y en cortocircuito; 5) señalizar la zona de trabajo.',
      'La verificación de ausencia de tensión es una de las primeras pruebas antes de intervenir.',
      'RIC N°17 (Op. y Mantenimiento), Art. 5: define el Programa de Seguridad Eléctrica (PSE), obligatorio en instalaciones > 300 kW o alimentadas en MT.',
      'Rescate (NFPA 70E Ed. 2024, Art. 110.4): entrenamiento en liberación de víctimas, primeros auxilios, RCP y uso de DEA; verificación y actualización anual.',
    ],
    terreno: [
      'La empresa de mantenimiento debe tener al menos un instalador eléctrico autorizado por la SEC (RIC N°17, Art. 5.4).',
      'Autochequeo: ¿cuál es el 3er paso de las 5 Reglas? ¿desde qué potencia es obligatorio el PSE?',
    ],
  },
  {
    id: 'm4-08-protecciones',
    title: 'Protecciones eléctricas y tipos de diferencial',
    intro: 'Objetivo: reconocer para que sirve cada protección y elegir el diferencial correcto. Base del Taller 2 (fallas eléctricas habituales).',
    medidas: [
      'Sensibilidad diferencial: 10 mA (alta, zonas húmedas/hospitales) · 30 mA (estándar, protección de personas) · 300 mA (baja, incendios por arco)',
      'Diferencial típico en tablero: 2x25 A de 30 mA (bipolar, 25 A nominal, 30 mA de sensibilidad)',
    ],
    clave: [
      'Disyuntor (termomagnético): protege contra sobrecargas y cortocircuitos. Diferencial (RCD): protege del choque eléctrico (detecta fuga a masa). SPD: limita sobretensiones transitorias. AFDD: detecta falla de arco (previene incendios).',
      'Clasificación de diferenciales según la falla que detectan: Tipo AC (alterna senoidal, cargas lineales), Tipo A (+ pulsantes CC, cargas no lineales/electrónica), Tipo F (Ex Hpi, + alta frecuencia), Tipo B (+ fugas en CC: fotovoltaica, variadores, datacenters).',
      'Forma constructiva: interruptor diferencial, bloque diferencial (se acopla a un magnetotérmico), disyuntor diferencial (combina todo) y relé diferencial (industrial, con toroide externo).',
      'AFDD: un microprocesador distingue el arco peligroso del arco convencional (conexión/desconexión), en serie y en paralelo. Norma IEC 62606.',
    ],
    terreno: [
      'Ubicación en planta: Tableros Generales (TG), Tableros de Distribución (TD, max 25 circuitos por protección) y Centros de Control de Motores (CCM).',
      'Criterio de selección: para cargas no lineales o motores con variador se usan diferenciales Tipo A o B (un Tipo AC común no los "ve").',
      'Autochequeo: ¿qué protege el diferencial? ¿qué tipo se usa con variadores de frecuencia?',
    ],
  },
  {
    id: 'm4-09-dimensionar-conductores',
    title: 'Dimensionamiento de conductores: las 3 comprobaciones',
    intro: 'Objetivo (día 2, práctico): dimensionar un conductor con las 3 comprobaciones que exige la norma. Es el corazón del día 2.',
    medidas: [
      'Protección de sobrecarga: Iz > In (con corrección Iz x fn x ft > In)',
      'Caída de tensión: <= 3 % por tramo/circuito y <= 5 % total del voltaje nominal',
      'En 220 V, el 3 % equivale a 6,6 V',
      'Fórmula de caída de tensión: Vp = (rho x L x I x k) / S  (rho = 0,018 cobre; k = 2 monofásico, √3 trifásico)',
    ],
    clave: [
      'Las 3 comprobaciones del conductor: 1) protección de sobrecarga, 2) comprobación de la caída de tensión, 3) protección contra cortocircuitos.',
      '1) Sobrecarga: la capacidad del conductor (Iz) siempre debe ser mayor que la corriente de la protección (In). Iz se corrige por número de conductores (fn) y temperatura ambiente (ft).',
      'La ampacidad se lee de la Tabla SEC (T° ambiente 30 °C): según aislante 60/75/90 °C; Grupo A = hasta 3 conductores en ducto/enterrado; Grupo B = conductor simple al aire libre (mayor ampacidad).',
      '2) Caída de tensión: límite 3 % por tramo, 5 % total. 3) Cortocircuito: el conductor y la protección deben soportar/interrumpir la corriente de cortocircuito del punto.',
    ],
    terreno: [
      'Subalimentadores: los que se derivan de un alimentador directamente o vía un tablero general auxiliar (E -> TG -> TGAux -> TD).',
      'Autochequeo: ¿cuáles son las 3 comprobaciones? ¿límite de caída de tensión por tramo y total?',
    ],
  },
  {
    id: 'm4-10-puesta-tierra-proteccion',
    title: 'Puesta a tierra de protección (Taller 4, RIC N°6)',
    intro: 'Objetivo: verificar los requisitos de la puesta a tierra de protección (T.p.) en una planta. Base del Taller 4 del día 2.',
    medidas: [
      'Resistencia: Rtp = Vs / Io (Vs = tensión de seguridad; Io = corriente de operación de la protección)',
      'Sección del conductor de protección (PE): si S <= 25 mm² -> igual a la fase; si S > 50 mm² -> al menos S/2; mínimo 4 mm²',
      'Uniones enterradas: soldadura exotérmica, vida útil >= 15 años',
    ],
    clave: [
      'La tierra de protección = puesta a tierra de toda pieza conductora que NO forma parte del circuito activo pero que en falla puede quedar energizada.',
      'Objetivos: proteger a las personas (tensiones de contacto peligrosas), limitar tensiones, asegurar la operación de las protecciones y controlar riesgos.',
      'Integridad del camino: PROHIBIDO intercalar dispositivos de desconexión o fusibles en el conductor de tierra de protección.',
      'Prohibiciones: no usar como PE las tuberías de gas, líquidos inflamables, calefacción ni cables fiadores.',
    ],
    terreno: [
      'Rtp = Vs/Io: la resistencia no debe permitir tensiones de contacto superiores a la tensión de seguridad.',
      'Autochequeo: ¿cómo se calcula Rtp? ¿sección mínima del conductor de protección? ¿se pueden poner fusibles en el PE?',
    ],
  },
  {
    id: 'm4-11-pararrayos',
    title: 'Pararrayos (Sistema de Protección contra Rayos)',
    intro: 'Objetivo: conocer los requisitos de un sistema de protección contra rayos (SPCR). Parte 3 del Taller 4.',
    medidas: [
      'Terminal de captación en cobre: cinta sólida de área >= 50 mm² y espesor 2 mm',
      'Conductores bajantes: al menos 2, sección >= 50 mm², recorrido rectilíneo y vertical (evitar curvas con radio < 20 cm)',
    ],
    clave: [
      'Evaluación de riesgo: la instalación es obligatoria cuando lo defina el nivel isoceráunico de la región o una evaluación según IEC 62305-2 o NFPA 780.',
      'Metodología de diseño: método electrogeométrico o de "esfera rodante".',
      'Bajantes: al menos 2 en el perímetro (preferentemente esquinas opuestas), recorrido rectilíneo y vertical.',
      'Interconexión: la puesta a tierra del pararrayos se une a la de la instalación (equipotencialidad).',
    ],
    terreno: [
      'Uso de estructuras: elementos metálicos que sobresalgan (antenas, chimeneas) pueden servir de captadores si se garantiza continuidad e interconexión.',
      'Autochequeo: ¿qué método de diseño se usa? ¿cuántas bajantes mínimas y de que sección?',
    ],
  },
  {
    id: 'm4-12-calculo-protecciones',
    title: 'Cálculo de protecciones (disyuntores y motores)',
    intro: 'Objetivo: dimensionar el disyuntor de una carga y la protección de un motor. Base del Taller 3 (cálculo y dimensionamiento).',
    medidas: [
      'Carga común: protección al 125 % de la corriente (carga continua)',
      'Motor: hasta 250 % de la CPC para permitir el arranque (Artículo 430)',
      'Ejemplo carga 220 V / 2500 W: I = 2500/220 = 11,36 A -> x1,25 = 14,2 A -> disyuntor 16 A',
      'Ejemplo motor 380 V / 3 HP (FP 0,85): I = 2238/(√3x380x0,85) = 4,0 A -> x2,5 = 10 A',
    ],
    clave: [
      'Carga común: I = P/V (monofásico) o I = P/(√3xVxFP) (trifásico); luego protección al 125 % y se sube al valor comercial (16, 20, 25 A...).',
      'Motor (Art. 430): se calcula la Corriente a Plena Carga (CPC/FLC) y la protección contra cortocircuito/falla a tierra se permite hasta el 250 % de la CPC para tolerar el arranque.',
      'El arranque de un motor puede ser 6 a 8 veces la corriente nominal; la protección debe soportarlo sin dispararse.',
      'Regla mental: carga común -> 125 %; motor -> CPC y hasta 250 % (Art. 430).',
    ],
    terreno: [
      'Ejemplo del relator: "te sale 4 amperios -> te cambian el cable y te ponen protección de 4 A" (dimensionar la protección a la corriente real).',
      'Autochequeo: ¿qué porcentaje para carga común? ¿y para el arranque de un motor?',
    ],
  },
  {
    id: 'm4-13-fundamentos',
    title: 'Fundamentos eléctricos (repaso)',
    intro: 'Objetivo: repasar los fundamentos que el relator uso de apoyo el día 2: Ley de Ohm, factor de potencia y sistemas trifásicos.',
    clave: [
      'Ley de Ohm y potencia: P = V x I = I² x R = V²/R. De ahí se despejan V, I, R y P según lo que se conozca.',
      'Factor de potencia: FP = P/S = cos phi (relación entre Potencia Activa P y Potencia Aparente S).',
      'Sistemas trifásicos: hay 2 niveles de tensión. Fase-Neutro (Vfn, tensión de fase o simple) y Fase-Fase (Vff, tensión de línea o compuesta); ambas desfasadas 120°.',
      'Tipos de señal: continua (unidireccional, sin frecuencia, polaridad +/-) y alterna (cíclica sinusoidal, con frecuencia, fase/neutro).',
    ],
    terreno: [
      'Etapas de un Sistema Eléctrico de Potencia (SEP): Generación, Transmisión y Distribución.',
      'Autochequeo: ¿qué es el factor de potencia? ¿qué desfase hay entre las tensiones en trifásico?',
    ],
  },
];

const M4_PROCEDURES = [
  {
    id: 'm4-proc-disyuntor-carga',
    title: 'Dimensionar el disyuntor de una carga (regla del 125 %)',
    description: 'Seleccionar la protección termomagnética de una carga común.\n\nEjemplo: una carga de 220 V / 2500 W da 11,36 A; al 125 % son 14,2 A, así que instalas un disyuntor comercial de 16 A.',
    steps: [
      'Calcula la corriente de carga: I = P/V (monofásico) o I = P/(√3 x V x FP) (trifásico).',
      'Determina si es carga continua (opera 3 h o más).',
      'Aplica el factor de seguridad: multiplica por 1,25 (125 %).',
      'Sube al valor nominal comercial inmediato superior (16, 20, 25 A...).',
      'Verifica que el conductor tenga ampacidad (Iz) mayor que la protección (In).',
    ],
  },
  {
    id: 'm4-proc-proteccion-motor',
    title: 'Dimensionar la protección de un motor (Art. 430)',
    description: 'Los motores siguen reglas especiales por la corriente de arranque.\n\nEjemplo: un motor de 380 V / 3 HP con FP 0,85 tiene CPC de 4,0 A; al 250 % da 10 A, así que instalas una protección de 10 A (o un guardamotor ajustado a 4 A).',
    steps: [
      'Convierte la potencia mecánica a eléctrica: 1 HP = 746 W.',
      'Calcula la Corriente a Plena Carga (CPC/FLC): I = P/(√3 x V x FP).',
      'Para la protección contra cortocircuito y falla a tierra, permite hasta el 250 % de la CPC (interruptor de tiempo inverso).',
      'Selecciona el valor nominal comercial que cumpla.',
      'Confirma que soporta el arranque (6 a 8 veces la corriente nominal) sin dispararse.',
    ],
  },
  {
    id: 'm4-proc-caida-tension',
    title: 'Comprobar la caída de tensión de un circuito',
    description: 'Verificar que la caída de tensión esté dentro de norma.\n\nEjemplo: un tramo de 63 A, 12 m y 21,2 mm² da Vp = 0,018x12x63x2/21,2 = 1,28 V, muy por debajo del 3 %.',
    steps: [
      'Aplica la fórmula: Vp = (rho x L x I x k) / S, con rho = 0,018 (cobre) y k = 2 (monofásico) o √3 (trifásico).',
      'Calcula la caída de cada tramo y compara con el límite de 3 % del voltaje nominal.',
      'Suma las caídas de todos los tramos en serie.',
      'Verifica que la caída total no supere el 5 % del voltaje nominal.',
      'Si se pasa, aumenta la sección (S) del conductor o acorta el recorrido.',
    ],
  },
  {
    id: 'm4-proc-dimensionar-conductor',
    title: 'Dimensionar un conductor (las 3 comprobaciones)',
    description: 'Elegir la sección del conductor cumpliendo sobrecarga, caída de tensión y cortocircuito.\n\nEjemplo: para 32 A eliges una sección de tabla cuya ampacidad (Iz corregida) supere los 32 A, verificas la caída < 3 % y que soporte el cortocircuito del punto.',
    steps: [
      'Sobrecarga: elige una sección cuya ampacidad Iz (Tabla SEC) sea mayor que la corriente de la protección In.',
      'Corrige Iz por número de conductores (fn) y temperatura ambiente (ft): Iz x fn x ft > In.',
      'Elige el Grupo correcto de la tabla: Grupo A (ducto/enterrado) o Grupo B (aire libre), y la temperatura del aislante (60/75/90 °C).',
      'Caída de tensión: comprueba que Vp <= 3 % por tramo y <= 5 % total.',
      'Cortocircuito: verifica que el conductor soporte la corriente de cortocircuito del punto.',
    ],
  },
  {
    id: 'm4-proc-puesta-tierra-proteccion',
    title: 'Verificar una puesta a tierra de protección (T.p.)',
    description: 'Comprobar que la puesta a tierra de protección cumple los requisitos del RIC N°6.\n\nEjemplo: para una fase de 35 mm² el conductor de protección debe ser al menos 16 mm² (S/2, ya que 35 > 25), nunca menos de 4 mm².',
    steps: [
      'Confirma que todas las masas metálicas no activas estén conectadas a la puesta a tierra de protección.',
      'Verifica la sección del PE: si la fase S <= 25 mm² igual sección; si S > 50 mm² al menos S/2; nunca menos de 4 mm².',
      'Comprueba que NO haya fusibles ni desconectadores intercalados en el conductor de protección.',
      'Revisa que las uniones enterradas sean con soldadura exotérmica o conectores para enterramiento.',
      'Verifica que Rtp = Vs/Io no permita tensiones de contacto peligrosas.',
    ],
  },
  {
    id: 'm4-proc-5-reglas-oro',
    title: 'Aplicar las 5 Reglas de Oro',
    description: 'Secuencia de trabajo sin tensión antes de intervenir un equipo.\n\nEjemplo: para cambiar un automático abres y bloqueas el interruptor general, verificas 0 V con el detector (probado antes y después), pones a tierra y señalizas la zona.',
    steps: [
      'Corte efectivo de todas las fuentes de tensión.',
      'Prevenir la realimentación: bloqueo y etiquetado (LOTO) con tarjeta "PELIGRO NO OPERAR".',
      'Verificar la ausencia de tensión (probar el detector antes y después).',
      'Puesta a tierra y en cortocircuito.',
      'Señalizar y delimitar la zona de trabajo.',
    ],
  },
  {
    id: 'm4-proc-verificar-tablero',
    title: 'Verificar los requisitos de un tablero',
    description: 'Chequeo de un tablero según el NEC y el RIC N°02.\n\nEjemplo: en un tablero interior confirmas grado IP 41, tapas las aberturas sin usar, revisas la etiqueta de arco y que el interruptor general corte fase y neutro (omnipolar).',
    steps: [
      'Verifica el grado de protección: mínimo IP 41 para interiores (RIC N°02).',
      'Confirma que las aberturas no utilizadas estén cerradas.',
      'Revisa la identificación de circuitos y medios de desconexión, y la etiqueta de Riesgo de Relámpago de Arco.',
      'Comprueba el corte omnipolar (fase + neutro) en el general y en distribución.',
      'Deja el espacio de trabajo despejado (30 pulgadas mínimo), sin material combustible.',
    ],
  },
];

const M4_FLOWS = [
  {
    id: 'm4-flow-dimensionar-disyuntor',
    title: 'Necesito dimensionar el disyuntor de una carga',
    trigger: 'Tienes una carga (W y V) y debes elegir la protección.',
    actions: [
      'Calcula la corriente: I = P/V (monofásico) o I = P/(√3 x V x FP) (trifásico).',
      '¿Es carga continua (3 h o más)? Aplica el 125 %.',
      'Sube al valor comercial inmediato superior (16, 20, 25 A...).',
      'Si es un MOTOR, usa el Artículo 430: hasta 250 % de la CPC para el arranque.',
      'Verifica que el conductor tenga ampacidad mayor que la protección (Iz > In).',
    ],
  },
  {
    id: 'm4-flow-elegir-diferencial',
    title: 'Debo elegir el tipo de diferencial',
    trigger: 'Vas a proteger un circuito y no sabes que tipo de diferencial usar.',
    actions: [
      'Carga lineal / instalación común: Tipo AC.',
      'Cargas electrónicas, generadores, fotovoltaica (pulsantes de CC): Tipo A.',
      'Circuitos de computación / alta frecuencia: Tipo F.',
      'Variadores de frecuencia, ascensores, datacenters (fuga en CC pura): Tipo B.',
      'Elige la sensibilidad: 30 mA para protección de personas; 10 mA en zonas húmedas.',
    ],
  },
  {
    id: 'm4-flow-intervenir-equipo',
    title: 'Voy a intervenir un equipo eléctrico',
    trigger: 'Necesitas trabajar sobre un equipo o circuito.',
    actions: [
      'Corte efectivo de todas las fuentes de tensión.',
      'Bloqueo y etiquetado (LOTO); evita la realimentación.',
      'Verifica la ausencia de tensión (detector probado antes y después).',
      'Puesta a tierra y en cortocircuito.',
      'Señaliza la zona y recién entonces interviene.',
    ],
  },
  {
    id: 'm4-flow-verificar-caida',
    title: 'Me piden verificar la caída de tensión',
    trigger: 'Un circuito es largo o hay equipos que "no arrancan bien".',
    actions: [
      'Aplica Vp = rho x L x I x k / S (rho = 0,018 cobre, k = 2 monofásico).',
      'Calcula tramo por tramo y compara con el 3 % del voltaje nominal.',
      'Suma las caídas: la total no debe superar el 5 %.',
      'Si se pasa, aumenta la sección del conductor o reduce el largo.',
    ],
  },
  {
    id: 'm4-flow-corte-omnipolar',
    title: '¿Corte omnipolar si o no?',
    trigger: 'Dudas si la protección debe cortar también el neutro.',
    actions: [
      'Regla general: corte omnipolar obligatorio en tableros generales y de distribución.',
      'Desconecta TODOS los conductores activos, incluido el neutro.',
      'Excepción: dispositivos > 630 A en alimentadores específicos.',
      'Objetivo: que no queden retornos peligrosos energizados.',
    ],
  },
  {
    id: 'm4-flow-verificar-pararrayos',
    title: 'Debo verificar un pararrayos',
    trigger: 'Revisión de un sistema de protección contra rayos (SPCR).',
    actions: [
      'Confirma que el diseño use el método de esfera rodante / electrogeométrico (IEC 62305-2 o NFPA 780).',
      'Terminal de captación: cobre, cinta >= 50 mm² y 2 mm de espesor, sin material radiactivo.',
      'Al menos 2 bajantes en el perímetro (esquinas opuestas), sección >= 50 mm², recorrido recto y vertical.',
      'La puesta a tierra del pararrayos se interconecta con la de la instalación (equipotencialidad).',
    ],
  },
];

const M4_DIAGNOSIS = [
  {
    id: 'm4-dx-disyuntor-dispara-arranque',
    title: 'El disyuntor del motor dispara al arrancar',
    symptom: 'Cada vez que arranca el motor, la protección se dispara aunque el motor esté bien.',
    possibleCauses: [
      'Protección dimensionada a la corriente nominal sin margen de arranque',
      'No se aplicó el Artículo 430 (250 % de la CPC)',
      'Curva de disparo inadecuada',
    ],
    solution: 'Redimensiona la protección según el Art. 430: el arranque puede ser 6 a 8 veces la corriente nominal, y para cortocircuito/falla a tierra se permite hasta el 250 % de la CPC. Usa una curva adecuada (o un guardamotor). Ejemplo: motor con CPC 4,0 A -> protección de 10 A (4,0 x 2,5) para tolerar el arranque.',
  },
  {
    id: 'm4-dx-caida-tension-alta',
    title: 'Caída de tensión excesiva en un circuito',
    symptom: 'Al final de un circuito largo la tensión llega baja y los equipos funcionan mal.',
    possibleCauses: [
      'Conductor de sección insuficiente',
      'Recorrido demasiado largo',
      'Corriente elevada',
    ],
    solution: 'Calcula Vp = rho x L x I x k / S. Si supera el 3 % por tramo o el 5 % total, aumenta la sección (S) del conductor o acorta el recorrido. Ejemplo: en 220 V el 3 % son 6,6 V; si un tramo da 9 V hay que subir la sección del cable.',
  },
  {
    id: 'm4-dx-diferencial-variador',
    title: 'El diferencial no protege bien un equipo con variador',
    symptom: 'Un equipo con variador de frecuencia tiene fugas que el diferencial común no detecta, o dispara sin motivo.',
    possibleCauses: [
      'Diferencial Tipo AC en una carga no lineal',
      'Fuga con componente continua que el Tipo AC no "ve"',
    ],
    solution: 'Cambia a un diferencial Tipo A o Tipo B, capaces de detectar corrientes con componentes continuas o pulsantes. El Tipo AC solo detecta alterna senoidal. Ejemplo: un variador trifásico requiere Tipo B (fuga en CC pura); un Tipo AC común lo ignoraría.',
  },
  {
    id: 'm4-dx-terminal-caliente',
    title: 'Conexión sin terminal recalentada',
    symptom: 'Un conductor conectado directo al automático o a la barra se calienta en el punto de conexión.',
    possibleCauses: [
      'Conductor conectado sin terminal de compresión',
      'Temperatura de operación sobre la clasificación del terminal',
      'Apriete insuficiente',
    ],
    solution: 'Usa el terminal adecuado (ya no se permite entrar con el conductor directo). Dimensiona según la clasificación del terminal (60/75 °C), no solo por el aislante (90 °C). Reaprieta y vuelve a medir. Ejemplo: cambiar el cable directo por uno con terminal de compresión baja la temperatura del punto.',
  },
  {
    id: 'm4-dx-pe-sin-continuidad',
    title: 'Falla la continuidad del conductor de protección (PE)',
    symptom: 'En la puesta en servicio, el ensayo de continuidad del conductor de protección no pasa.',
    possibleCauses: [
      'Unión floja o corroída',
      'Fusible o desconectador intercalado en el PE (prohibido)',
      'Sección del PE insuficiente',
    ],
    solution: 'Revisa y reaprieta las uniones; retira cualquier fusible o desconexión del conductor de protección (la integridad del camino es obligatoria). Verifica la sección (mínimo 4 mm²) y usa un instrumento certificado IEC 61557. El primer ensayo del RIC N°19 es justamente la continuidad del PE.',
  },
  {
    id: 'm4-dx-material-sin-certificar',
    title: 'Material eléctrico sin certificación SEC',
    symptom: 'Se instaló material que no tiene el código QR ni certificación de la SEC.',
    possibleCauses: [
      'Compra de material no certificado (en Chile se comercializa de todo)',
      'Falta de verificación en la recepción',
    ],
    solution: 'Solo se aceptan conductores y equipos aprobados (Art. 110). Verifica el código QR de la SEC en el material antes de instalarlo; retira y reemplaza lo no certificado. Ejemplo: un automático sin sello ni QR de la SEC no debe montarse aunque "funcione".',
  },
];

const M4_QUIZ = [
  {
    id: 'm4-q-lenguaje',
    question: 'En el código, ¿qué significa la palabra "debe"?',
    options: ['Es una recomendación', 'Es obligatorio / mandatorio', 'Es opcional', 'Es una nota informativa'],
    correctIndex: 1,
    explanation: '"Debe" / "no debe" es lenguaje obligatorio (mandatorio). "Debe estar permitido" es permisivo. Pregunta confirmada de examen.',
  },
  {
    id: 'm4-q-estructura',
    question: '¿Qué capítulos del NEC son de aplicación general a todas las instalaciones?',
    options: ['Capítulos 5 al 7', 'Capítulo 8', 'Capítulos 1 al 4', 'Solo el capítulo 1'],
    correctIndex: 2,
    explanation: 'Capítulos 1 al 4 = aplicación general; 5 al 7 = condiciones especiales; 8 = comunicaciones.',
  },
  {
    id: 'm4-q-125',
    question: '¿A qué porcentaje se dimensiona el conductor y la protección de una carga continua?',
    options: ['100 %', '110 %', '125 %', '150 %'],
    correctIndex: 2,
    explanation: 'Al 125 % de la carga continua (la que persiste 3 horas o más).',
  },
  {
    id: 'm4-q-terminal',
    question: '¿A qué temperatura de terminal se dimensiona normalmente un conductor?',
    options: ['30 °C', '60 o 75 °C', '90 °C', '120 °C'],
    correctIndex: 1,
    explanation: 'Manda la clasificación del terminal (60/75 °C), no el 90 °C del aislante.',
  },
  {
    id: 'm4-q-dsc',
    question: '¿Qué debe ser capaz de interrumpir un dispositivo de sobrecorriente (DSC)?',
    options: ['Solo sobrecarga', 'Sobrecarga y cortocircuito', 'Sobrecarga, cortocircuito y falla a tierra', 'Solo cortocircuito'],
    correctIndex: 2,
    explanation: 'Los tres: sobrecarga, cortocircuito y falla a tierra. Pregunta de examen.',
  },
  {
    id: 'm4-q-tierra-fisica',
    question: '¿La tierra física (el suelo) sirve como trayectoria efectiva de falla?',
    options: ['Si, siempre', 'No, por su alta impedancia', 'Solo en media tensión', 'Solo si está húmeda'],
    correctIndex: 1,
    explanation: 'No: por su alta impedancia se requiere un conductor de cobre instalado. El bonding crea la trayectoria de baja impedancia.',
  },
  {
    id: 'm4-q-ac',
    question: '¿Quién es la Autoridad Competente en Chile?',
    options: ['El CDEC', 'La SEC', 'El INN', 'La mutualidad'],
    correctIndex: 1,
    explanation: 'La SEC (Superintendencia de Electricidad y Combustibles).',
  },
  {
    id: 'm4-q-mt',
    question: '¿Hasta qué tensión llega la Media Tensión (MT) en Chile?',
    options: ['1 kV', '23 kV', '110 kV', '230 kV'],
    correctIndex: 1,
    explanation: 'MT: > 1 kV hasta 23 kV. BT: <= 1 kV.',
  },
  {
    id: 'm4-q-caida',
    question: '¿Cuáles son los límites de caída de tensión?',
    options: ['1 % por tramo, 3 % total', '3 % por tramo, 5 % total', '5 % por tramo, 10 % total', '10 % por tramo, 15 % total'],
    correctIndex: 1,
    explanation: '<= 3 % por tramo/circuito y <= 5 % total del voltaje nominal.',
  },
  {
    id: 'm4-q-caida-220',
    question: 'En un circuito de 220 V, ¿cuánto es el 3 % de caída de tensión?',
    options: ['2,2 V', '6,6 V', '11 V', '22 V'],
    correctIndex: 1,
    explanation: '3 % de 220 V = 6,6 V.',
  },
  {
    id: 'm4-q-comprobaciones',
    question: '¿Cuáles son las 3 comprobaciones al dimensionar un conductor?',
    options: [
      'Sobrecarga, caída de tensión y cortocircuito',
      'Color, largo y marca',
      'Generación, transmisión y distribución',
      'Continuo, alterno y trifásico',
    ],
    correctIndex: 0,
    explanation: 'Protección de sobrecarga (Iz > In), comprobación de la caída de tensión y protección contra cortocircuitos.',
  },
  {
    id: 'm4-q-rtp',
    question: '¿Cómo se calcula la resistencia de la puesta a tierra de protección?',
    options: ['Rtp = V x I', 'Rtp = Vs / Io', 'Rtp = P / V', 'Rtp = I / V'],
    correctIndex: 1,
    explanation: 'Rtp = Vs / Io (tensión de seguridad / corriente de operación de la protección).',
  },
  {
    id: 'm4-q-pe',
    question: '¿Cuál es la sección mínima del conductor de protección (PE)?',
    options: ['1,5 mm²', '2,5 mm²', '4 mm²', '10 mm²'],
    correctIndex: 2,
    explanation: 'Mínimo 4 mm². Si la fase S <= 25 mm² el PE es igual; si S > 50 mm², al menos S/2.',
  },
  {
    id: 'm4-q-pararrayos',
    question: '¿Qué método se usa para diseñar un pararrayos?',
    options: ['Método del 125 %', 'Esfera rodante / electrogeométrico', 'Regla de la mano derecha', 'Método de Ohm'],
    correctIndex: 1,
    explanation: 'Método electrogeométrico o de "esfera rodante" (IEC 62305-2 / NFPA 780).',
  },
  {
    id: 'm4-q-motor-430',
    question: 'Para un motor, ¿hasta qué porcentaje de la CPC se permite la protección de cortocircuito?',
    options: ['125 %', '150 %', '250 %', '400 %'],
    correctIndex: 2,
    explanation: 'Hasta el 250 % de la CPC para tolerar el arranque (Artículo 430).',
  },
  {
    id: 'm4-q-diferencial-variador',
    question: '¿Qué tipo de diferencial se usa con variadores de frecuencia?',
    options: ['Tipo AC', 'Tipo A o B', 'Ninguno', 'Solo fusible'],
    correctIndex: 1,
    explanation: 'Tipo A o B: detectan componentes continuas/pulsantes que el Tipo AC común ignora.',
  },
  {
    id: 'm4-q-omnipolar',
    question: '¿Qué significa corte omnipolar?',
    options: [
      'Cortar solo la fase',
      'Desconectar todos los conductores activos, incluido el neutro',
      'Cortar solo en emergencia',
      'Cortar en media tensión',
    ],
    correctIndex: 1,
    explanation: 'Desconectar TODOS los conductores activos, incluido el neutro (obligatorio en TG y TD salvo > 630 A).',
  },
  {
    id: 'm4-q-fp',
    question: '¿Qué es el factor de potencia?',
    options: ['P x S', 'FP = P/S = cos phi', 'V x I', 'La frecuencia de la red'],
    correctIndex: 1,
    explanation: 'FP = P/S = cos phi (relación entre Potencia Activa y Potencia Aparente).',
  },
];

const M4_GLOSSARY = [
  { term: 'NFPA 70 / NEC', definition: 'Código Eléctrico Nacional (National Electrical Code), la norma de este módulo.', lesson: 1 },
  { term: 'NFPA 70E', definition: 'Norma de Seguridad Eléctrica en lugares de trabajo (5 Reglas de Oro, rescate).', lesson: 7 },
  { term: 'SEC', definition: 'Superintendencia de Electricidad y Combustibles: la Autoridad Competente en Chile.', lesson: 5 },
  { term: 'AC', definition: 'Autoridad Competente (en Chile = la SEC).', lesson: 5 },
  { term: 'RIC', definition: 'Reglamento de Instalaciones de Consumo (Decreto 8): 19 pliegos técnicos.', lesson: 5 },
  { term: 'RPTD', definition: 'Reglamento de instalaciones de MT/AT (Decreto 109): 17 pliegos técnicos.', lesson: 5 },
  { term: 'BT / MT', definition: 'Baja Tensión (<= 1 kV) / Media Tensión (> 1 kV hasta 23 kV).', lesson: 5 },
  { term: 'DSC', definition: 'Dispositivo de Sobrecorriente (disyuntor/protección): corta sobrecarga, cortocircuito y falla a tierra.', lesson: 3 },
  { term: 'Bonding', definition: 'Conexión equipotencial: une partes metálicas para una trayectoria de baja impedancia.', lesson: 4 },
  { term: 'RCD', definition: 'Interruptor diferencial: protege del choque eléctrico (detecta fuga a masa).', lesson: 8 },
  { term: 'SPD', definition: 'Limitador de sobretensión (Surge Protective Device).', lesson: 8 },
  { term: 'AFDD', definition: 'Dispositivo de detección de falla de arco (norma IEC 62606).', lesson: 8 },
  { term: 'TG / TD / CCM', definition: 'Tablero General / Tablero de Distribución / Centro de Control de Motores.', lesson: 8 },
  { term: 'Iz / In', definition: 'Ampacidad del conductor (Iz) / corriente nominal de la protección (In). Regla: Iz > In.', lesson: 9 },
  { term: 'Vp', definition: 'Caída de tensión: Vp = rho x L x I x k / S (rho = 0,018 cobre). Límite 3 % tramo, 5 % total.', lesson: 9 },
  { term: 'T.p. / Rtp', definition: 'Tierra de protección y su resistencia (Rtp = Vs/Io). Sección PE mínima 4 mm².', lesson: 10 },
  { term: 'PE', definition: 'Conductor de protección (tierra), verde/verde-amarillo. Sin fusibles intercalados.', lesson: 10 },
  { term: 'SPCR', definition: 'Sistema de Protección contra Rayos (pararrayos): esfera rodante, IEC 62305-2 / NFPA 780.', lesson: 11 },
  { term: 'CPC / FLC', definition: 'Corriente a Plena Carga de un motor (Full Load Current). Protección hasta 250 % (Art. 430).', lesson: 12 },
  { term: 'FP / cos phi', definition: 'Factor de potencia: FP = P/S (Potencia Activa / Aparente).', lesson: 13 },
  { term: 'SEP', definition: 'Sistema Eléctrico de Potencia: Generación, Transmisión y Distribución.', lesson: 13 },
  { term: 'IEC 61557', definition: 'Norma de certificación de instrumentos de prueba (continuidad del PE, RIC N°19).', lesson: 5 },
];

const M4_BIBLIO = [
  { label: 'NFPA 70 (NEC) — Código Eléctrico Nacional, edición 2023.', url: 'https://link.nfpa.org/all-publications/70/2023' },
  { label: 'NFPA 70E — Norma de Seguridad Eléctrica en Lugares de Trabajo, edición 2024.', url: 'https://link.nfpa.org/all-publications/70E/2024' },
  { label: 'NFPA 780 — Standard for the Installation of Lightning Protection Systems.', url: 'https://www.nfpa.org/product/nfpa-780-standard/p0780code' },
  { label: 'SEC — Superintendencia de Electricidad y Combustibles.', url: 'https://www.sec.cl' },
  { label: 'DS 08/2019 — Reglamento de Instalaciones de Consumo (RIC) y los 19 pliegos técnicos.', url: 'https://www.sec.cl/reglamento-de-seguridad-de-las-instalaciones-de-consumo-de-energia-electrica-decreto-08/' },
  { label: 'Decreto Supremo 109 (2018) — Reglamento de Seguridad de instalaciones de MT/AT (RPTD), Ministerio de Energía.', url: 'https://www.sec.cl/centro-de-descargas/' },
  { label: 'Ley General de Servicios Eléctricos — DFL N°4/20.018 (2006).', url: 'https://www.bcn.cl/leychile/navegar?idNorma=258171' },
  { label: 'IEC 62305 — Protección contra rayos (evaluación de riesgo).', url: 'https://webstore.iec.ch/publication/6793' },
  { label: 'IEC 62606 — Dispositivos de detección de falla de arco (AFDD).', url: 'https://webstore.iec.ch/publication/7297' },
  { label: 'IEC 61557 — Seguridad eléctrica: equipos para ensayo y medición de protecciones.', url: 'https://webstore.iec.ch/publication/5471' },
  { label: 'Comision Nacional de Energía (CNE) y Ministerio de Energía.', url: 'https://www.cne.cl' },
  { label: 'Manuales del curso NFPA 70 (NEC) Nivel 1, OTEC ADVISOR Capacitaciones SpA.', url: 'https://advisorcapacitacion.cl/' },
];

// ════════════════════════════════════════════════════════════════════════════
// ENSAMBLAJE
// ════════════════════════════════════════════════════════════════════════════

const MODULES = [
  { slug: 'seguridad-electrica', prefix: 'm1', name: 'Seguridad Eléctrica (NFPA 70E)', manual: M1_MANUAL, procedures: M1_PROCEDURES, flows: M1_FLOWS, diagnosis: M1_DIAGNOSIS, quiz: M1_QUIZ, glossary: M1_GLOSSARY, bibliografia: M1_BIBLIO },
  { slug: 'rescate-svb', prefix: 'm2', name: 'Rescate Eléctrico y SVB', manual: M2_MANUAL, procedures: M2_PROCEDURES, flows: M2_FLOWS, diagnosis: M2_DIAGNOSIS, quiz: M2_QUIZ, glossary: M2_GLOSSARY, bibliografia: M2_BIBLIO },
  { slug: 'nfpa-70b', prefix: 'm3', name: 'NFPA 70B Mantenimiento Eléctrico', manual: M3_MANUAL, procedures: M3_PROCEDURES, flows: M3_FLOWS, diagnosis: M3_DIAGNOSIS, quiz: M3_QUIZ, glossary: M3_GLOSSARY, bibliografia: M3_BIBLIO },
  { slug: 'codigo-electrico-nec', prefix: 'm4', name: 'Código Eléctrico Nacional (NFPA 70/NEC)', manual: M4_MANUAL, procedures: M4_PROCEDURES, flows: M4_FLOWS, diagnosis: M4_DIAGNOSIS, quiz: M4_QUIZ, glossary: M4_GLOSSARY, bibliografia: M4_BIBLIO },
];

function buildDocs(mod) {
  // manual: ordenado por `order` asc
  const manual = mod.manual.map((s, i) => ({
    id: s.id,
    data: {
      id: s.id,
      title: s.title,
      content: manualContent(s),
      order: i + 1,
      createdAt: BASE,
      updatedAt: BASE,
    },
  }));
  // procedures/flows/diagnosis: la app ordena por updatedAt desc -> el indice 0 debe ser el mayor
  const procedures = mod.procedures.map((p, i) => ({
    id: p.id,
    data: {
      id: p.id,
      title: p.title,
      description: p.description,
      steps: p.steps.map((text, j) => ({ order: j + 1, title: `Paso ${j + 1}`, description: text, imageUrl: null })),
      createdAt: BASE,
      updatedAt: BASE - i * 1000,
      createdBy: 'seed-cursos-electricidad',
    },
  }));
  const flows = mod.flows.map((f, i) => ({
    id: f.id,
    data: { id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, createdAt: BASE, updatedAt: BASE - i * 1000 },
  }));
  const diagnosis = mod.diagnosis.map((d, i) => ({
    id: d.id,
    data: {
      id: d.id,
      title: d.title,
      symptom: d.symptom,
      possibleCauses: d.possibleCauses,
      solution: d.solution,
      createdAt: BASE,
      updatedAt: BASE - i * 1000,
    },
  }));
  // quiz: ordenado por `order` asc (mismo criterio que el manual)
  const quiz = (mod.quiz || []).map((qz, i) => ({
    id: qz.id,
    data: {
      id: qz.id,
      question: qz.question,
      options: qz.options,
      correctIndex: qz.correctIndex,
      explanation: qz.explanation,
      order: i + 1,
      createdAt: BASE,
      updatedAt: BASE,
    },
  }));
  // glosario: ordenado por `order` asc (term/definition/lesson)
  const glossary = (mod.glossary || []).map((g, i) => {
    const id = `${mod.prefix}-glo-${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      data: { id, term: g.term, definition: g.definition, lesson: g.lesson ?? null, order: i + 1, createdAt: BASE, updatedAt: BASE },
    };
  });
  // bibliografia: ordenada por `order` asc (label/url)
  const bibliografia = (mod.bibliografia || []).map((b, i) => {
    const id = `${mod.prefix}-bib-${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      data: { id, label: b.label, url: b.url ?? null, order: i + 1, createdAt: BASE, updatedAt: BASE },
    };
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

async function seedSection(slug, section, items) {
  let written = 0;
  for (const item of items) {
    if (!isDryRun) {
      await db.collection('learningContent').doc(slug).collection(section).doc(item.id).set(item.data);
    }
    written++;
  }
  return written;
}

async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('SEED — Cursos de electricidad en Centro de Aprendizaje (learningContent)');
  console.log('='.repeat(64));
  if (isDryRun) console.log('** MODO DRY-RUN: no se escribe en Firestore **');

  // El glosario paso de ser una leccion del manual a su pestana propia.
  // Borramos los docs-glosario huerfanos que quedaron en la coleccion `manual`.
  const ORPHAN_MANUAL_GLOSSARY = [
    { slug: 'seguridad-electrica', id: 'm1-10-glosario' },
    { slug: 'rescate-svb', id: 'm2-10-glosario' },
    { slug: 'nfpa-70b', id: 'm3-09-glosario' },
  ];
  if (!isDryRun) {
    for (const o of ORPHAN_MANUAL_GLOSSARY) {
      await db.collection('learningContent').doc(o.slug).collection('manual').doc(o.id).delete();
    }
    console.log(`\nLimpieza: ${ORPHAN_MANUAL_GLOSSARY.length} docs-glosario huerfanos borrados de la coleccion manual.`);
  }

  for (const mod of MODULES) {
    const docs = buildDocs(mod);
    console.log(`\n[${mod.slug}] ${mod.name}`);
    const m = await seedSection(mod.slug, 'manual', docs.manual);
    const p = await seedSection(mod.slug, 'procedures', docs.procedures);
    const f = await seedSection(mod.slug, 'flows', docs.flows);
    const d = await seedSection(mod.slug, 'diagnosis', docs.diagnosis);
    const q = await seedSection(mod.slug, 'quiz', docs.quiz);
    const g = await seedSection(mod.slug, 'glossary', docs.glossary);
    const b = await seedSection(mod.slug, 'bibliografia', docs.bibliografia);
    console.log(`   manual: ${m}  ·  procedimientos: ${p}  ·  flujos: ${f}  ·  diagnostico: ${d}  ·  examen: ${q}  ·  glosario: ${g}  ·  bibliografia: ${b}`);
  }

  console.log('\n' + '-'.repeat(64));
  console.log(isDryRun
    ? 'DRY-RUN completo. Corre sin --dry-run para aplicar.'
    : 'Seed aplicado. Falta agregar los 2 temas al catalogo (learningMachines.ts) y desplegar.');
  console.log('-'.repeat(64) + '\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR fatal:', err.message);
  process.exit(1);
});
