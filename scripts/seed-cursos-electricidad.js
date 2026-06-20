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
    intro: 'Objetivo: que el tecnico identifique las tecnicas de rescate electrico y soporte vital basico (SVB) con foco en seguridad electrica, segun la NFPA 70E Ed. 2024. Esta leccion ubica el curso en su contexto legal y de entrenamiento.',
    clave: [
      'La NFPA 70E es la norma (americana) de seguridad electrica en lugares de trabajo; en Chile es de uso obligatorio y se actualiza cada 3 anos (vigente 2024).',
      'Tiene dos lineas: seguridad electrica y proteccion contra incendios.',
      'Chile la incorporo via DS N°8 (consumo BT, reemplazo la NCh 4/2003) y Decreto 109 (instalaciones MT/AT, 2018); se derogo el Decreto 40 (hoy DS 44).',
      'El peligro electrico tiene consecuencias catastroficas para el personal, el equipo y la instalacion; lo primero que se protege son las personas.',
      'El accidente electrico es la 3a causa de muerte a nivel industrial, pero la de mayor impacto. Codigo del Trabajo Art. 184: el empleador debe proteger la vida y salud del trabajador.',
    ],
    terreno: [
      'El entrenamiento debe ser documentado, certificado y trazable (persona calificada vs no calificada).',
      'Reentrenamiento en seguridad electrica: cada 3 anos (o al actualizarse la norma). Rescate y liberacion de contacto: anual.',
      'Meta de respuesta en un rescate: menos de 8 minutos.',
      'Autochequeo: ¿para quienes es catastrofico el peligro electrico? ¿cada cuanto se reentrena el rescate?',
    ],
  },
  {
    id: 'm2-02-peligros-arco',
    title: 'Peligros electricos: efectos de la corriente y arco',
    intro: 'Objetivo: reconocer que le hace la electricidad al cuerpo y por que el arco electrico es tan destructivo. Es la base para entender por que el rescate electrico es distinto a cualquier otro.',
    medidas: [
      'Temperatura del arco electrico: 2.000 a 20.000 °C',
      'El cobre, al evaporarse, se expande 67.000 veces (proyecta metal a mas de 1.120 km/h)',
      'Energia incidente minima para quemadura de 2° grado: 1,2 cal/cm²',
      'El arco puede encender la ropa hasta a 3 m de distancia',
    ],
    clave: [
      'Los 4 efectos de la corriente en el cuerpo: fibrilacion ventricular (la mas grave), tetanizacion (la victima "queda pegada"), asfixia (paro respiratorio) y quemaduras (efecto Joule).',
      'Contacto directo: tocar una parte activa en tension. Contacto indirecto: tocar una parte que quedo en tension accidentalmente (ej. carcasa mal aislada).',
      'El arco electrico se descompone en dos fenomenos: relampago de arco (arc flash) + rafaga/explosion de arco (onda expansiva).',
      'Quemaduras por arco (3 grados): 1° (capas externas, sin cicatriz), 2° (ampollas/flictenas, dolor intenso), 3° (destruye la piel, puede requerir injerto).',
      'Quemaduras internas: por el paso de la corriente; tienen punto de entrada y de salida; la hinchazon aparece a las 24-72 h y pueden requerir fasciotomia o amputacion.',
    ],
    terreno: [
      'Caso real: un tecnico puso en servicio una UPS de 380 V trabajando solo; por tetanizacion no pudo soltarse, sufrio quemadura interna y casi pierde el brazo. Leccion: nunca trabajar solo, ser persona calificada y reportar.',
      'Autochequeo: ¿en que 2 fenomenos se descompone el arco? ¿cual es el efecto mas grave de la corriente?',
    ],
  },
  {
    id: 'm2-03-reglas-oro-epp',
    title: 'Trabajo seguro: las 5 Reglas de Oro y el EPP',
    intro: 'Objetivo: aplicar la secuencia de trabajo sin tension y elegir el EPP correcto para choque y para arco. Es casi seguro que cae en el examen.',
    clave: [
      'Las 5 Reglas de Oro (en orden): 1) abrir con corte visible todas las fuentes de tension; 2) enclavar/bloquear (prevenir realimentacion) + tarjeta "PELIGRO NO OPERAR"; 3) verificar ausencia de tension; 4) puesta a tierra y en cortocircuito; 5) delimitar y senalizar la zona.',
      '3a Regla (clave): verificar el detector antes y despues, en 3 puntos (probar que funciona, medir, reverificar) y para la tension prevista.',
      'Novedad NFPA: la tarjeta de bloqueo debe llevar nombre, RUT y foto de quien bloquea.',
      'EPP contra choque: casco dielectrico (NCh 461), guantes aislantes (NCh 1668), zapatos aislantes (NCh 2147).',
      'EPP contra arco (NFPA 70E): ropa AR (arco-resistente), careta AR, pasamontanas (esclavina).',
      'Proteccion contra choque: frontera limitada, puesta a tierra de proteccion, equipotencialidad, aislacion y protecciones diferenciales. ESE = Elementos de Seguridad Electrica.',
    ],
    terreno: [
      'En la puesta a tierra y cortocircuito: cuchillas cerradas, pinzas con buen contacto, evitar superficies pintadas, usar conjuntos certificados (no improvisar).',
      'Autochequeo: ¿cual es el orden de las 5 Reglas? ¿como se verifica la ausencia de tension?',
    ],
  },
  {
    id: 'm2-04-hemorragias',
    title: 'Control de hemorragias',
    intro: 'Objetivo: identificar el tipo de hemorragia y detenerla con la tecnica correcta. Una hemorragia no controlada lleva a shock y muerte en minutos.',
    medidas: [
      'Volumen de sangre aproximado: 70 cc por kg (ej.: 70 kg ≈ 4.900 cc)',
    ],
    clave: [
      'Hemorragia = salida incontrolada de sangre. Segun origen: interna (la mas grave), externa, exteriorizada (sale por orificios naturales).',
      'Segun el vaso: arterial (roja rutilante, a chorro intermitente, la mas grave), venosa (flujo continuo), capilar (rojo oscuro, en sabana, la mas leve).',
      'Organos que el cuerpo protege ante una perdida de sangre: corazon, cerebro y pulmones (en ese orden).',
      'Ante hemorragia interna: NO dar nada de tomar; trasladar y controlar pulso/respiracion cada 5 min.',
    ],
    terreno: [
      'Protegete siempre de los fluidos antes de actuar.',
      'Autochequeo: ¿cual es la hemorragia mas grave segun el vaso? ¿que NO se debe hacer en hemorragia interna?',
    ],
  },
  {
    id: 'm2-05-quemaduras',
    title: 'Quemaduras electricas',
    intro: 'Objetivo: estimar la gravedad de una quemadura y actuar en orden. En el arco, las zonas mas afectadas son manos y cabeza/cuello.',
    clave: [
      'Severidad (5 factores): profundidad (1°/2°/3°) + extension (% del cuerpo) + regiones criticas (manos, pies, cara, genitales) + edad + salud.',
      'Regla del 9%: estima la extension dividiendo el cuerpo en zonas de 9%. Dano mayor al 15% = grave.',
      'Acciones (en orden): cortar la energia en condiciones seguras, controlar la ropa si arde, iniciar SVB/RCP si hay paro, tratar primero la lesion mas grave, cubrir con aposito limpio y esteril.',
    ],
    terreno: [
      'No apliques cremas ni revientes las ampollas; cubre con aposito esteril y traslada.',
      'Autochequeo: ¿que factores determinan la severidad? ¿para que sirve la Regla del 9%?',
    ],
  },
  {
    id: 'm2-06-trauma',
    title: 'Trauma e inmovilizacion',
    intro: 'Objetivo: reconocer fractura, luxacion y esguince, y proteger la columna cervical al inmovilizar.',
    clave: [
      'Fractura: ruptura de un hueso (abierta/expuesta vs cerrada). Senales: dolor, deformidad, crepitacion osea, impotencia funcional.',
      'Luxacion: el hueso se sale completamente de la articulacion. Esguince: dano de ligamentos.',
      'Tratamiento del esguince: 1° leve -> RICE (reposo, hielo, compresion, elevacion); 2° -> yeso; 3° -> cirugia.',
      'Accion clave: ¡INMOVILIZAR! Primero la columna cervical: manual -> collar cervical -> inmovilizadores laterales sobre tabla espinal.',
    ],
    terreno: [
      'Un collar mal tallado o mal cerrado puede agravar la lesion o dificultar la respiracion.',
      'Caso real: kits de rescate con collares y sueros vencidos y tablas cristalizadas. Tener el equipo no basta: hay que mantenerlo y verificar su vigencia.',
      'Autochequeo: ¿como se llama cuando el hueso se sale de la articulacion?',
    ],
  },
  {
    id: 'm2-07-rcp-svb',
    title: 'RCP / Soporte Vital Basico (SVB)',
    intro: 'Objetivo: ejecutar la secuencia de SVB y la RCP con la tecnica correcta. El 30:2 es la pregunta estrella del examen.',
    medidas: [
      'RCP: 30 compresiones : 2 ventilaciones',
      'Profundidad: comprimir 1/3 del torax',
      'Dano cerebral: empieza a los 4 minutos',
      'Supervivencia: ~43% si la RCP parte en 0-4 min; 0% si parte despues de 12 min',
      'Telefono de emergencia (Chile): 131 (SAMU)',
    ],
    clave: [
      'Secuencia SVB: 1) garantizar seguridad (la tuya primero); 2) evaluar conciencia ("¿esta usted bien?"); 3) pedir ayuda (131); 4) despejar via aerea (frente-menton; si hay sospecha cervical, solo elevacion del menton); 5) ventilacion: evaluar con MES y dar 2 ventilaciones; 6) signos de vida / pulso carotideo; 7) compresiones 30:2; 8) posicion de recuperacion si se recupera.',
      'Tecnica de compresion: talon de la mano sobre el esternon, brazos rectos, usando el peso del cuerpo; victima boca arriba en superficie plana y dura.',
      'MES = Mirar el torax, Escuchar, Sentir (para evaluar la ventilacion).',
      'Cadena de Supervivencia: acceso inmediato -> RCP -> desfibrilacion (DEA) -> cuidados avanzados.',
    ],
    terreno: [
      'DEA obligatorio por ley en recintos con mas de 15 personas por mas de 15 minutos.',
      'Autochequeo: ¿cual es la relacion de RCP? ¿a los cuantos minutos empieza el dano cerebral?',
    ],
  },
  {
    id: 'm2-08-evaluacion-abcde',
    title: 'Evaluacion de la victima: SER y ABCDE',
    intro: 'Objetivo: ordenar la atencion con un metodo: primero tu seguridad, luego lo que mata mas rapido. La evaluacion inicial ABCDE toma unos 15 segundos.',
    clave: [
      'Que mata en trauma (orden): 1° obstruccion de via aerea, 2° hemorragia, 3° dano neurologico (TEC).',
      'Escenario "SER"/seguridad: 1) mi seguridad, 2) la de mi equipo, 3) la de la victima.',
      'Evaluacion inicial = ABCDE (~15 s); secundaria = de cabeza a pies, solo tras resolver el riesgo vital.',
      'ABCDE: A via aerea + columna cervical (barrido con dedo, Heimlich); B buena ventilacion (MES); C circulacion + hemorragias; D dano neurologico (AVDN, PIRRL); E exposicion (evitar el enfriamiento).',
      'Shock: pulso debil/rapido, piel palida/fria/cianotica, PA menor a 90/60, anuria.',
      'AVDN = Alerta / responde a Verbal / responde a Dolor / No responde. PIRRL = Pupilas Iguales, Redondas, Reactivas a la Luz.',
    ],
    terreno: [
      'Autochequeo: ¿que corresponde a la "C" del ABCDE? ¿que mata primero en un trauma?',
    ],
  },
  {
    id: 'm2-11-riesgo-descarga',
    title: 'Riesgo electrico, descarga y tipos de contacto',
    intro: 'Objetivo: distinguir el contacto directo del indirecto y clasificar la descarga segun el tipo de contacto y de falla. Entender el riesgo electrico y la electrocucion. La distincion directo/indirecto es muy preguntada.',
    clave: [
      'Riesgo electrico: posibilidad de que la corriente cause dano a personas, equipos y procesos. La gravedad depende de la intensidad de la corriente y del tiempo de exposicion.',
      'Electrocucion: efecto del paso de corriente por el cuerpo, que va desde una contraccion leve hasta la fibrilacion ventricular y la muerte.',
      'Contacto directo: la persona toca una parte activa de la instalacion o un aparato EN tension.',
      'Contacto indirecto: la persona toca una parte que quedo en tension de forma accidental (ej. una carcasa mal aislada que toca un cable interno).',
      'Segun el tipo de contacto: choque electrico vs relampago/rafaga de arco.',
      'Segun el tipo de falla: contacto directo o indirecto; cortocircuito o sobrecarga; ausencia de energia (blackout/apagon); equipo defectuoso (falta de mantenimiento).',
    ],
    terreno: [
      'En Chile, la mayor cantidad de accidentes electricos con consecuencias graves ocurre en BAJA TENSION (220/380 V), por la falsa percepcion de que "ahi no hay mayor riesgo".',
      'La corriente continua (CC) puede ser mas peligrosa que la alterna a igual tension: en CA, al pasar por el cero del ciclo (50 Hz) la victima tiene chance de soltarse; en CC no hay ese cruce por cero y queda "pegada".',
      'Autochequeo: ¿que diferencia hay entre contacto directo e indirecto? ¿por que la CC dificulta soltarse?',
    ],
  },
  {
    id: 'm2-12-clasificacion-quemaduras',
    title: 'Clasificacion de quemaduras: profundidad, extension y distribucion',
    intro: 'Objetivo: clasificar una quemadura por profundidad (Converse-Smith) y estimar su extension con la Regla del 9%. Saber que zonas del cuerpo golpea mas el arco. Complementa la leccion de Quemaduras.',
    medidas: [
      'Regla del 9% (adulto): cabeza 9% · cada brazo 9% · tronco anterior 18% · tronco posterior 18% · cada pierna 18% · genitales 1%',
      'Quemadura grave: dano mayor al 15% de la superficie corporal, o en cara, manos, pies o genitales',
      'Energia incidente del arco mayor a 1,2 cal/cm² = posible quemadura de 2° grado',
    ],
    clave: [
      'Clasificacion por profundidad (Converse-Smith): 1er grado (eritema, solo epidermis); 2° superficial (flictenular, epidermis y dermis papilar); 2° profundo o AB (intermedia, dermis reticular); 3er grado (espesor total, destruye la piel).',
      'Comparacion clinica: la quemadura tipo A (1°/2° superficial) tiene flictenas, color rojo, dolor intenso y buena recuperacion. La tipo B (3°) NO tiene flictenas, es de color blanco grisaceo, indolora (se daniaron las terminaciones nerviosas) y cicatriza con escara o injerto.',
      'Distribucion por arco electrico: las zonas mas afectadas son las manos y la cabeza/cuello; en mas de 2/3 de los casos se dano la mano derecha (estudio Alemania 1998).',
      'La Regla del 9% sirve para estimar la EXTENSION (% del cuerpo quemado); a mayor extension, mayor gravedad.',
    ],
    terreno: [
      'Una quemadura indolora NO es leve: si no duele, probablemente sea de 3er grado (se destruyeron los nervios).',
      'Autochequeo: ¿que es una quemadura tipo B? ¿cuanto suma cada pierna en la Regla del 9%?',
    ],
  },
  {
    id: 'm2-13-evaluacion-secundaria',
    title: 'Manejo del escenario y evaluacion secundaria',
    intro: 'Objetivo: ordenar la escena con el criterio SER y completar la evaluacion secundaria una vez resuelto el riesgo vital. Profundiza el ABCDE.',
    clave: [
      'Escenario SER (orden de prioridad de la seguridad): 1) MI seguridad, 2) la de mi equipo, 3) la de la victima. Se evalua la escena, la cinematica (como ocurrio) y los recursos (demanda vs disponibilidad).',
      'Que mata en trauma, en orden: 1° obstruccion de via aerea, 2° hemorragia, 3° dano neurologico (TEC). Por eso el ABCDE ataca primero la via aerea.',
      'Evaluacion inicial = ABCDE (global ~15 s, resuelve el riesgo vital). Evaluacion secundaria = recien despues, de cabeza a pies.',
      'Evaluacion secundaria: examen fisico completo por inspeccion (ver), palpacion (tocar) y auscultacion (escuchar), revisando cabeza, cuello, torax, abdomen, pelvis y extremidades (heridas, fracturas, luxaciones, simetria, crepitos).',
      'Aproximadamente el 90% de los traumatizados son LEVES; aun asi, primero se descarta lo que amenaza la vida.',
    ],
    terreno: [
      'La evaluacion secundaria NO se hace hasta haber resuelto el riesgo vital del ABCDE.',
      'Autochequeo: ¿que se prioriza en SER? ¿con que tres tecnicas se hace el examen secundario?',
    ],
  },
  {
    id: 'm2-14-casos-reales',
    title: 'Casos reales y lecciones aprendidas',
    intro: 'Objetivo: aprender de accidentes reales que el relator y la literatura documentan. Cada caso deja una leccion operativa que se repite en la planta.',
    clave: [
      'Tecnico contratista SOLO en una sala electrica: toco una barra y su brazo hizo contacto con el chasis del tablero; las protecciones y la malla de tierra NO operaron. Por tetanizacion no pudo soltarse; penso en su familia. Se salvo porque cayo hacia atras. No reporto el accidente; el brazo se le puso negro ~7 meses y estuvo a punto de perderlo. Lecciones: nunca trabajar solo, ser persona calificada, verificar protecciones/tierra y SIEMPRE reportar.',
      'Kits de rescate vencidos (planta Cardona y otras): collares cervicales con ganchos vencidos, sueros vencidos hace 5 anos, tablas espinales cristalizadas y mal ubicadas. Leccion: tener el equipo no basta; hay que mantenerlo y verificar su vigencia.',
      'Dallas Wiens (EE.UU., 2008): pintando una iglesia, su cara toco una linea de media tension; perdio la vista y el rostro. En 2011 recibio el primer trasplante de cara de EE.UU. Leccion: respetar las distancias de seguridad (fronteras) frente a lineas energizadas.',
      'Caso OSHA (quemadura electrica de alto voltaje): el paso de corriente dejo lesiones internas con punto de entrada y de salida; la mano se hincho (24-72 h) y hubo que abrir el brazo (fasciotomia); se amputaron dedos momificados. Leccion: la quemadura electrica interna es mucho mas grave de lo que se ve por fuera.',
    ],
    terreno: [
      'Hilo conductor: los accidentes graves casi siempre combinan trabajar solo, no ser persona calificada, saltarse el bloqueo/tierra y no reportar.',
      'Autochequeo: ¿que errores se repiten en los casos graves?',
    ],
  },
  {
    id: 'm2-09-autoevaluacion',
    title: 'Autoevaluacion — foco de examen',
    intro: 'La prueba teorica es a libro abierto (~10 min) mas un taller practico (~30 min). Repasa estas preguntas: son las que el relator marco como "pregunta de examen". Las respuestas estan en las lecciones anteriores.',
    clave: [
      'Temperatura del arco -> 2.000 a 20.000 °C.',
      'El cobre se expande -> 67.000 veces.',
      'Energia minima para quemadura de 2° grado -> 1,2 cal/cm².',
      'Efecto mas grave de la corriente -> fibrilacion ventricular.',
      'Orden de las 5 Reglas de Oro -> corte visible, bloquear, verificar ausencia, puesta a tierra, senalizar.',
      'Verificacion de ausencia de tension -> detector antes y despues, en 3 puntos, para la tension prevista.',
      'EPP contra arco -> ropa AR, careta AR, pasamontanas.',
      'Hemorragia mas grave por vaso -> arterial.',
      'Organos que protege el cuerpo -> corazon, cerebro, pulmones.',
      'Factores de severidad de quemadura -> profundidad, extension, regiones criticas, edad, salud.',
      'Relacion de RCP -> 30:2 (1/3 del torax).',
      'Dano cerebral -> a los 4 minutos.',
      '"C" del ABCDE -> circulacion + control de hemorragias.',
      'Reentrenamiento del rescate -> anual.',
    ],
    terreno: [
      'Como es a libro abierto, ten claro en que leccion esta cada tema para responder rapido.',
    ],
  },
  {
    id: 'm2-10-glosario',
    title: 'Glosario de siglas',
    intro: 'Siglas que se usan en todo el modulo. Entre parentesis, la Leccion donde se explica cada una (para ir a verla en contexto).',
    clave: [
      'SVB = Soporte Vital Basico · RCP = Reanimacion Cardiopulmonar · DEA/DAE = Desfibrilador Externo Automatico. (Leccion 7)',
      'MES = Mirar el torax, Escuchar, Sentir (para evaluar la ventilacion). (Leccion 7)',
      'ABCDE = Airway (via aerea), Breathing (ventilacion), Circulation (circulacion), Disability (dano neuro), Exposure (exposicion). (Leccion 8)',
      'AVDN = Alerta / responde a Verbal / responde a Dolor / No responde (nivel de conciencia). (Leccion 8)',
      'PIRRL = Pupilas Iguales, Redondas, Reactivas a la Luz. (Leccion 8)',
      'SER = orden de la Seguridad: yo, mi equipo, la victima (evaluar escena, cinematica y recursos). (Leccion 11)',
      'TEC = Traumatismo Encefalo-Craneano (dano neurologico). (Leccion 11)',
      'RICE = Reposo, Hielo (Ice), Compresion, Elevacion (esguince leve). (Leccion 6)',
      '5 Reglas de Oro = secuencia de trabajo sin tension. (Leccion 3)',
      'EPP = Equipo de Proteccion Personal · ESE = Elementos de Seguridad Electrica · AR = Arco-Resistente. (Leccion 3)',
      'NFPA 70E = norma de seguridad electrica en lugares de trabajo (Ed. 2024). (Leccion 1)',
      'SEC = Superintendencia de Electricidad y Combustibles · RIC = Reglamento de Instalaciones de Consumo. (Leccion 1)',
    ],
  },
];

const M2_PROCEDURES = [
  {
    id: 'm2-proc-5-reglas-oro',
    title: 'Aplicar las 5 Reglas de Oro',
    description: 'Secuencia obligatoria para trabajar sin tension. Se ejecuta en orden, sin saltarse pasos.\n\nEjemplo: para intervenir una bomba de 380 V abres y bloqueas su partidor, verificas ausencia de tension, pones a tierra y senalizas antes de abrir la caja de conexiones.',
    steps: [
      'Abrir con corte visible todas las fuentes de tension.',
      'Enclavar/bloquear los aparatos de corte en posicion de apertura y colocar tarjeta "PELIGRO NO OPERAR" (con nombre, RUT y foto).',
      'Verificar ausencia de tension: probar el detector en un punto conocido, medir en los 3 puntos y reverificar, para la tension prevista.',
      'Poner a tierra y en cortocircuito todas las posibles fuentes (cuchillas cerradas, buen contacto, evitar superficies pintadas).',
      'Delimitar y senalizar la zona de trabajo (barreras / barricado).',
    ],
  },
  {
    id: 'm2-proc-liberar-tetanizacion',
    title: 'Liberar a una victima atrapada por tetanizacion',
    description: 'La victima quedo en contacto con el conductor y no puede soltarse. La prioridad es no convertirte en segunda victima.\n\nEjemplo: un companero quedo agarrado a un cable energizado. NO lo tocas: corres al tablero y cortas, o lo separas con un palo de escoba seco; recien ahi lo evaluas.',
    steps: [
      'Garantiza tu seguridad: NO toques a la victima mientras este energizada.',
      'Corta la energia desde el tablero o interruptor (corte visible).',
      'Si no puedes cortar, separa a la victima del conductor con un elemento aislante seco (pertiga, madera seca), nunca con las manos.',
      'Una vez liberada y en zona segura, evalua conciencia y respiracion.',
      'Activa emergencia (131) e inicia SVB si es necesario.',
    ],
  },
  {
    id: 'm2-proc-rcp-30-2',
    title: 'RCP 30:2 — secuencia de SVB',
    description: 'Reanimacion cardiopulmonar basica para un adulto en paro.\n\nEjemplo: encuentras a un companero que no responde ni respira; gritas pidiendo ayuda, llamas al 131 y arrancas 30 compresiones : 2 ventilaciones sin parar hasta que llegue el DEA o el SAMU.',
    steps: [
      'Garantiza la seguridad de la escena (la tuya primero).',
      'Evalua conciencia: sacude y grita "¿esta usted bien?".',
      'Pide ayuda: llama al 131 (SAMU) o activa la emergencia.',
      'Despeja la via aerea con la maniobra frente-menton (si hay sospecha cervical, solo eleva el menton).',
      'Evalua la ventilacion con MES (Mirar, Escuchar, Sentir); si no respira, da 2 ventilaciones que eleven el torax.',
      'Inicia compresiones 30:2 comprimiendo 1/3 del torax, talon de la mano sobre el esternon, brazos rectos.',
      'Si recupera signos de vida, colocala en posicion de recuperacion (lateral de seguridad).',
    ],
  },
  {
    id: 'm2-proc-hemorragia-externa',
    title: 'Control de hemorragia externa',
    description: 'Detener una hemorragia visible de forma escalonada, sin retirar los apositos ya colocados.\n\nEjemplo: un corte profundo en el antebrazo sangra mucho; aprietas con una gasa, si se empapa pones otra encima (sin sacar la primera) y vendas; si no cede, presionas la arteria humeral.',
    steps: [
      'Protegete de los fluidos (guantes).',
      'Limpia las impurezas con suero fisiologico.',
      'Aplica presion directa sobre la herida con un aposito.',
      'Agrega mas apositos si es necesario, SIN retirar el primero.',
      'Coloca un vendaje compresivo.',
      'Si no cede, aplica presion digital en el punto de presion (humeral o femoral).',
      'Torniquete solo como ultimo recurso; eleva la extremidad lesionada.',
    ],
  },
  {
    id: 'm2-proc-inmovilizacion-cervical',
    title: 'Inmovilizacion de columna cervical',
    description: 'Proteger la columna ante sospecha de trauma. Lo principal es la cervical.\n\nEjemplo: un trabajador cayo de un andamio; le sujetas la cabeza con las manos en posicion neutra, le pones collar y lo mueves en bloque sobre la tabla espinal.',
    steps: [
      'Inmoviliza manualmente la cabeza en posicion neutra.',
      'Coloca un collar cervical de la talla correcta.',
      'Anade inmovilizadores laterales.',
      'Asegura a la victima sobre la tabla espinal moviendola como una sola unidad.',
      'Controla via aerea y respiracion durante todo el proceso.',
    ],
  },
  {
    id: 'm2-proc-evaluacion-abcde',
    title: 'Evaluar a la victima con el ABCDE',
    description: 'Evaluacion inicial ordenada (~15 s) que ataca primero lo que mata mas rapido.\n\nEjemplo: ante un electrocutado revisas en orden A (¿respira?), B (¿ventila bien?), C (¿sangra?, ¿hay pulso?), D (¿responde?, ¿pupilas?) y E (lo abrigas) — todo en unos 15 segundos.',
    steps: [
      'A — Via aerea + columna cervical: evalua la permeabilidad; despeja con barrido de dedo o maniobra de Heimlich; si sospechas lesion espinal, manejala como si la tuviera.',
      'B — Buena ventilacion: evalua con MES (Mirar el torax, Escuchar, Sentir); si no ventila bien, da ventilacion asistida.',
      'C — Circulacion + hemorragias: controla pulso y conciencia, detiene hemorragias (presion -> torniquete) y vigila signos de shock.',
      'D — Dano neurologico: evalua conciencia (AVDN), pupilas (PIRRL) y focalizacion.',
      'E — Exposicion: expon lo necesario para evaluar y EVITA EL ENFRIAMIENTO (abriga).',
      'Resuelto el riesgo vital, recien entonces pasa a la evaluacion secundaria (de cabeza a pies).',
    ],
  },
  {
    id: 'm2-proc-posicion-recuperacion',
    title: 'Colocar en posicion de recuperacion (lateral de seguridad)',
    description: 'Para una victima inconsciente que respira y tiene pulso: evita que la lengua o un vomito obstruyan la via aerea.\n\nEjemplo: la victima recupero la respiracion pero sigue inconsciente; la giras de lado en bloque para que, si vomita, no se ahogue, y la vigilas hasta que llegue ayuda.',
    steps: [
      'Confirma que la victima respira y tiene signos de vida.',
      'Arrodillate a un lado; coloca su brazo mas cercano en angulo recto.',
      'Flexiona la pierna mas lejana y usala de palanca para girarla hacia ti como una sola unidad.',
      'Apoya el dorso de su mano bajo la mejilla para mantener la cabeza ligeramente extendida.',
      'Vigila la respiracion y el pulso hasta que llegue ayuda avanzada.',
    ],
  },
  {
    id: 'm2-proc-uso-dea',
    title: 'Usar el DEA (desfibrilador externo automatico)',
    description: 'El DEA se integra a la RCP en la Cadena de Supervivencia. Es obligatorio por ley en recintos con mas de 15 personas por mas de 15 minutos.\n\nEjemplo: durante una RCP llega el DEA; lo enciendes, pegas los parches, dejas que analice sin tocar a la victima y, si pide descarga, te apartas y pulsas el boton.',
    steps: [
      'Pide el DEA apenas confirmes un paro y enciendelo.',
      'Coloca los parches sobre el torax desnudo y seco, segun el dibujo (infraclavicular derecho y costado izquierdo).',
      'No toques a la victima mientras el DEA analiza el ritmo.',
      'Si indica descarga, asegura que nadie toque a la victima y pulsa el boton.',
      'Reinicia de inmediato RCP 30:2 y sigue las indicaciones del DEA hasta que llegue ayuda avanzada.',
    ],
  },
];

const M2_FLOWS = [
  {
    id: 'm2-flow-descarga-pegado',
    title: 'Alguien recibe una descarga y no puede soltarse',
    trigger: 'La victima esta en contacto con un conductor energizado y no se suelta (tetanizacion).',
    actions: [
      'No la toques con las manos.',
      'Corta la energia desde el tablero (corte visible).',
      'Si no puedes cortar, separala con un elemento aislante seco.',
      'En zona segura, evalua conciencia y respiracion.',
      'Llama al 131 e inicia SVB si no respira.',
    ],
  },
  {
    id: 'm2-flow-inconsciente',
    title: 'Encuentro a una persona inconsciente',
    trigger: 'Persona que no responde; hay que descartar paro y actuar rapido.',
    actions: [
      'Garantiza la seguridad de la escena.',
      'Evalua conciencia ("¿esta usted bien?").',
      'Pide ayuda: llama al 131.',
      'Abre la via aerea (frente-menton).',
      'Evalua con MES; si no respira, da 2 ventilaciones e inicia RCP 30:2.',
    ],
  },
  {
    id: 'm2-flow-hemorragia-grave',
    title: 'Hay una hemorragia grave',
    trigger: 'Sangrado abundante que no se detiene solo.',
    actions: [
      'Protegete de los fluidos.',
      'Aplica presion directa con aposito.',
      'Agrega mas apositos sin retirar el primero y venda.',
      'Si no cede, presion digital en el punto de presion.',
      'Torniquete como ultimo recurso; eleva la extremidad y traslada.',
    ],
  },
  {
    id: 'm2-flow-trauma-columna',
    title: 'Sospecho lesion de columna / trauma',
    trigger: 'Caida, golpe fuerte o proyeccion por arco; posible lesion de columna.',
    actions: [
      'No muevas a la victima innecesariamente.',
      'Inmoviliza la cabeza manualmente en posicion neutra.',
      'Coloca collar cervical y asegura sobre tabla espinal como una sola unidad.',
      'Controla el ABCDE.',
      'Traslada con cuidado.',
    ],
  },
  {
    id: 'm2-flow-quemadura-electrica',
    title: 'Hay una quemadura electrica',
    trigger: 'Persona quemada por contacto o por arco electrico.',
    actions: [
      'Corta la energia en condiciones seguras.',
      'Controla la ropa si esta ardiendo, sin exponerte.',
      'Si hay paro, inicia SVB/RCP.',
      'Trata primero la lesion mas grave.',
      'Cubre con aposito limpio y esteril; no apliques cremas; traslada.',
    ],
  },
  {
    id: 'm2-flow-atragantamiento',
    title: 'Alguien se atraganta (obstruccion de via aerea)',
    trigger: 'La via aerea esta obstruida (cuerpo extrano o la lengua). Recuerda: la obstruccion de via aerea es lo que mata primero en trauma.',
    actions: [
      'Evalua si puede toser o hablar.',
      'Si la obstruccion es completa, aplica la maniobra de Heimlich (compresiones abdominales).',
      'Si la victima queda inconsciente, bajala al suelo e inicia RCP.',
      'Revisa la boca y haz barrido con el dedo solo si ves el objeto.',
      'Llama al 131.',
    ],
  },
  {
    id: 'm2-flow-fractura-expuesta',
    title: 'Hay una fractura expuesta',
    trigger: 'El hueso rompio la piel (fractura abierta/expuesta): compromiso severo y riesgo de hemorragia e infeccion.',
    actions: [
      'Protegete de los fluidos.',
      'No intentes recolocar el hueso ni lo empujes hacia adentro.',
      'Controla la hemorragia con presion alrededor de la herida (no sobre el hueso).',
      'Cubre con aposito limpio y esteril e inmoviliza la zona.',
      'Trata primero la lesion mas grave y traslada.',
    ],
  },
];

const M2_DIAGNOSIS = [
  {
    id: 'm2-dx-paro',
    title: 'Paro cardiorrespiratorio',
    symptom: 'La persona no responde y no respira (o respira de forma agonica).',
    possibleCauses: [
      'Fibrilacion ventricular por el paso de la corriente',
      'Asfixia / paro respiratorio',
      'Mas de 4 min sin oxigeno comienza a danar el cerebro',
    ],
    solution: 'Activa el 131, inicia RCP 30:2 comprimiendo 1/3 del torax y usa el DEA apenas este disponible. No interrumpas hasta que llegue ayuda avanzada o la victima recupere signos de vida. Ejemplo: companero electrocutado que no respira: 131 + RCP 30:2 + DEA apenas llegue.',
  },
  {
    id: 'm2-dx-shock',
    title: 'Shock (hipovolemico)',
    symptom: 'Pulso debil y rapido, piel palida/fria/cianotica, presion menor a 90/60, poca o nula orina.',
    possibleCauses: [
      'Hemorragia importante (interna o externa)',
      'Perdida de volumen sanguineo',
    ],
    solution: 'Controla la hemorragia, acuesta a la victima y abrigala para evitar el enfriamiento, no le des nada de tomar y trasladala de inmediato controlando pulso y respiracion cada 5 min. Ejemplo: tras una caida con sangrado interno, la persona se pone palida, sudorosa y con pulso rapido: controla, abriga y traslada.',
  },
  {
    id: 'm2-dx-tetanizacion',
    title: 'Victima "pegada" al conductor (tetanizacion)',
    symptom: 'La persona quedo en contacto con la parte energizada y no puede soltarse.',
    possibleCauses: [
      'Contraccion muscular incontrolada por el paso de la corriente',
    ],
    solution: 'Nunca la toques mientras este energizada. Corta la energia (corte visible) o separala con un elemento aislante seco; recien entonces evalua y atiende. Ejemplo: la mano quedo cerrada sobre la herramienta energizada; corta la energia, no tires de la persona.',
  },
  {
    id: 'm2-dx-hemorragia-arterial',
    title: 'Hemorragia arterial',
    symptom: 'Sangre roja rutilante que sale a chorro intermitente (pulsatil).',
    possibleCauses: [
      'Lesion de una arteria',
    ],
    solution: 'Presion directa firme con aposito; si no cede, presion digital en el punto de presion (humeral/femoral) y, como ultimo recurso, torniquete. Eleva la extremidad y traslada. Ejemplo: un corte en el muslo que late y mancha en chorro: presion firme y, si no cede, presion en la femoral.',
  },
  {
    id: 'm2-dx-tec',
    title: 'Sospecha de dano neurologico (TEC)',
    symptom: 'Alteracion de conciencia, pupilas desiguales o que no reaccionan a la luz.',
    possibleCauses: [
      'Traumatismo encefalo-craneano',
      'Lesion de columna asociada',
    ],
    solution: 'Maneja a la victima como si tuviera lesion de columna: inmoviliza la cervical, controla el ABCDE y traslada con cuidado. Evalua nivel de conciencia (AVDN) y pupilas (PIRRL). Ejemplo: golpe fuerte en la cabeza con una pupila mas grande que la otra: inmoviliza la cervical y traslada urgente.',
  },
  {
    id: 'm2-dx-quemadura-interna',
    title: 'Quemadura electrica interna (paso de corriente)',
    symptom: 'Hay un punto de entrada y otro de salida de la corriente; la zona se hincha entre 24 y 72 h y el miembro se pone oscuro.',
    possibleCauses: [
      'Paso de corriente por el cuerpo (efecto Joule)',
      'Tetanizacion que prolongo el contacto',
    ],
    solution: 'Trata como lesion grave aunque por fuera parezca menor: corta la energia en condiciones seguras, inicia SVB si hay paro, cubre con aposito esteril y traslada URGENTE. Puede requerir fasciotomia (abrir para aliviar la presion) o amputacion. Reporta siempre el accidente.',
  },
  {
    id: 'm2-dx-luxacion-esguince',
    title: 'Luxacion o esguince',
    symptom: 'Dolor articular, deformidad e impotencia funcional tras un golpe o caida.',
    possibleCauses: [
      'Luxacion: el hueso se salio completamente de la articulacion',
      'Esguince: torcedura/distension con dano de ligamentos',
    ],
    solution: 'Inmoviliza sin intentar reducir la luxacion. Para el esguince aplica RICE (reposo, hielo, compresion, elevacion) si es leve (1° grado); el 2° requiere yeso y el 3° cirugia. Traslada para evaluacion.',
  },
];

const M2_QUIZ = [
  {
    id: 'm2-q-rcp',
    question: '¿Cual es la relacion correcta de compresiones y ventilaciones en la RCP de un adulto?',
    options: ['15:1', '30:2', '5:1', '20:2'],
    correctIndex: 1,
    explanation: '30 compresiones por 2 ventilaciones, comprimiendo 1/3 del torax. Es la pregunta estrella del examen.',
  },
  {
    id: 'm2-q-efecto-grave',
    question: '¿Cual es el efecto mas grave de la corriente sobre el cuerpo?',
    options: ['Tetanizacion', 'Quemaduras', 'Fibrilacion ventricular', 'Asfixia'],
    correctIndex: 2,
    explanation: 'La fibrilacion ventricular (arritmia) es la lesion mas grave para la recuperacion.',
  },
  {
    id: 'm2-q-arco',
    question: '¿En que dos fenomenos se descompone el arco electrico?',
    options: ['Relampago de arco y rafaga/explosion', 'Chispa y humo', 'Calor y luz', 'Cortocircuito y sobrecarga'],
    correctIndex: 0,
    explanation: 'Relampago de arco (arc flash) + rafaga/explosion de arco (onda expansiva).',
  },
  {
    id: 'm2-q-energia',
    question: '¿Cual es la energia incidente minima para una quemadura de 2° grado?',
    options: ['0,5 cal/cm²', '1,2 cal/cm²', '12 cal/cm²', '40 cal/cm²'],
    correctIndex: 1,
    explanation: '1,2 cal/cm² (como la llama de un encendedor a 1 cm durante ~2 s).',
  },
  {
    id: 'm2-q-reglas-oro',
    question: '¿Cual es el orden correcto de las 5 Reglas de Oro?',
    options: [
      'Bloquear, cortar, senalizar, verificar, tierra',
      'Corte visible, bloquear, verificar ausencia de tension, puesta a tierra, senalizar',
      'Verificar, cortar, tierra, bloquear, senalizar',
      'Senalizar, cortar, bloquear, tierra, verificar',
    ],
    correctIndex: 1,
    explanation: '1) corte visible, 2) bloquear, 3) verificar ausencia de tension, 4) puesta a tierra y cortocircuito, 5) delimitar/senalizar.',
  },
  {
    id: 'm2-q-hemorragia',
    question: '¿Cual es la hemorragia mas grave segun el vaso afectado?',
    options: ['Capilar', 'Venosa', 'Arterial', 'Exteriorizada'],
    correctIndex: 2,
    explanation: 'La arterial: sangre roja rutilante que sale a chorro intermitente.',
  },
  {
    id: 'm2-q-control-hemorragia',
    question: '¿Cual es el primer paso para controlar una hemorragia externa?',
    options: ['Aplicar torniquete', 'Presion directa con aposito', 'Elevar la extremidad', 'Dar agua a la victima'],
    correctIndex: 1,
    explanation: 'Presion directa con aposito. El torniquete es el ultimo recurso.',
  },
  {
    id: 'm2-q-abcde',
    question: 'En el ABCDE, ¿que corresponde a la letra C?',
    options: ['Cabeza', 'Circulacion + control de hemorragias', 'Columna cervical', 'Conciencia'],
    correctIndex: 1,
    explanation: 'C = circulacion + control de hemorragias.',
  },
  {
    id: 'm2-q-tiempo',
    question: '¿A los cuantos minutos comienza el dano cerebral en un paro?',
    options: ['1 minuto', '4 minutos', '10 minutos', '30 minutos'],
    correctIndex: 1,
    explanation: 'El dano cerebral empieza a los 4 minutos; 0% de supervivencia si la RCP parte despues de 12 min.',
  },
  {
    id: 'm2-q-reentrenamiento',
    question: '¿Cada cuanto se hace el reentrenamiento de rescate y liberacion de contacto?',
    options: ['Mensual', 'Anual', 'Cada 3 anos', 'Cada 5 anos'],
    correctIndex: 1,
    explanation: 'Rescate y liberacion de contacto: anual. La seguridad electrica (NFPA 70E): cada 3 anos.',
  },
  {
    id: 'm2-q-contacto-indirecto',
    question: '¿Que es un contacto electrico indirecto?',
    options: [
      'Tocar una parte activa en tension',
      'Tocar una parte que quedo en tension de forma accidental (ej. carcasa mal aislada)',
      'Acercarse a un cable sin tocarlo',
      'Trabajar con guantes aislantes',
    ],
    correctIndex: 1,
    explanation: 'Indirecto = tocar algo que quedo en tension por accidente. El directo es tocar una parte activa en tension.',
  },
  {
    id: 'm2-q-arco-temp',
    question: '¿Que temperatura puede alcanzar un arco electrico?',
    options: ['100 a 500 °C', '500 a 1.000 °C', '2.000 a 20.000 °C', '50.000 a 100.000 °C'],
    correctIndex: 2,
    explanation: 'Entre 2.000 y 20.000 °C; puede encender la ropa hasta a 3 m del punto de falla.',
  },
  {
    id: 'm2-q-cobre',
    question: '¿Cuanto se expande el cobre al evaporarse en un arco electrico?',
    options: ['67 veces', '6.700 veces', '67.000 veces', '670.000 veces'],
    correctIndex: 2,
    explanation: '67.000 veces; proyecta metal fundido a mas de 1.120 km/h.',
  },
  {
    id: 'm2-q-organos',
    question: '¿Que organos protege prioritariamente el cuerpo ante una perdida de sangre?',
    options: ['Higado, rinones y bazo', 'Corazon, cerebro y pulmones', 'Estomago, intestino y vejiga', 'Piel, musculos y huesos'],
    correctIndex: 1,
    explanation: 'Corazon, cerebro y pulmones (en ese orden).',
  },
  {
    id: 'm2-q-regla9',
    question: '¿Para que sirve la Regla del 9%?',
    options: [
      'Para estimar la profundidad de la quemadura',
      'Para estimar la extension (% del cuerpo) de la quemadura',
      'Para medir la energia incidente del arco',
      'Para calcular el volumen de sangre',
    ],
    correctIndex: 1,
    explanation: 'Estima la extension: divide el cuerpo en zonas de 9%. Dano mayor al 15% = grave.',
  },
  {
    id: 'm2-q-luxacion',
    question: '¿Como se llama cuando un hueso se sale completamente de su articulacion?',
    options: ['Fractura', 'Esguince', 'Luxacion', 'Crepitacion'],
    correctIndex: 2,
    explanation: 'Luxacion. El esguince es dano de ligamentos; la fractura es ruptura del hueso.',
  },
  {
    id: 'm2-q-mes',
    question: '¿Que significa la sigla MES en la evaluacion de la ventilacion?',
    options: ['Medir, Evaluar, Sostener', 'Mirar, Escuchar, Sentir', 'Mover, Estabilizar, Senalizar', 'Masaje, Estimulo, Soporte'],
    correctIndex: 1,
    explanation: 'Mirar el torax, Escuchar el aire, Sentir el flujo. Sirve para evaluar la ventilacion.',
  },
  {
    id: 'm2-q-que-mata-trauma',
    question: 'En un trauma, ¿que mata primero (orden)?',
    options: [
      'Hemorragia, via aerea, dano neurologico',
      'Obstruccion de via aerea, hemorragia, dano neurologico (TEC)',
      'Dano neurologico, hemorragia, via aerea',
      'Fractura, quemadura, shock',
    ],
    correctIndex: 1,
    explanation: '1° obstruccion de via aerea, 2° hemorragia, 3° dano neurologico (TEC). Por eso el ABCDE ataca primero la via aerea.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// MODULO 3 — NFPA 70B, Mantenimiento del Equipo Electrico (slug nfpa-70b)
// ════════════════════════════════════════════════════════════════════════════

const M3_MANUAL = [
  {
    id: 'm3-01-que-es-nfpa70b',
    title: 'Que es la NFPA 70B y la autoridad competente',
    intro: 'Objetivo: entender el alcance de la norma de mantenimiento del equipo electrico y quien fiscaliza en Chile. La pregunta confirmada del examen: la autoridad competente en Chile es la SEC.',
    medidas: [
      'Niveles de tension: Baja menor o igual a 1 kV; Media mayor a 1 kV hasta 23 kV; Alta mayor a 23 kV hasta 230 kV',
      'El 80% de los equipos falla en algun momento por falta de mantenimiento',
    ],
    clave: [
      'NFPA 70B = Norma para el Mantenimiento del Equipo Electrico, edicion 2023 (Nivel 1). Es la norma lider en mantenimiento electrico.',
      'Nacio en 1968 como "Practica Recomendada"; hoy es Norma (2023).',
      'Se concentra en el MEP (Mantenimiento Electrico Preventivo) para disminuir fallas a personas, equipos y procesos.',
      'Aplica a instalaciones comerciales e industriales (SEP). NO considera el nivel domestico.',
      'Autoridad Competente (AC) en Chile = la SEC (Superintendencia de Electricidad y Combustibles). Es pregunta confirmada de examen.',
    ],
    terreno: [
      'Definiciones base: arco electrico (descarga disruptiva por ionizacion), choque electrico (corriente que fluye por el cuerpo), energia incidente en cal/cm².',
      'Autochequeo: ¿de que ano es la edicion vigente? ¿quien es la autoridad competente en Chile?',
    ],
  },
  {
    id: 'm3-02-cuatro-pilares',
    title: 'Los 4 pilares de la norma',
    intro: 'Objetivo: conocer las cuatro columnas sobre las que se construye todo programa de mantenimiento segun la NFPA 70B.',
    clave: [
      '1) Seguridad a las Personas: factor primordial; personal idoneo + EPP; si no son especialistas, se externaliza.',
      '2) Gestion de Mantenimiento: un programa bien administrado salva vidas, reduce costos y minimiza fallas no programadas.',
      '3) Procedimientos Especificos para cada Equipo: registro acabado para decidir bien ante una falla.',
      '4) Analisis de la Informacion: permite corregir, analizar fallas y mejorar los programas.',
      'RCM = Mantenimiento Centrado en la Confiabilidad: optimiza recursos a partir del analisis estadistico de fallas.',
    ],
    terreno: [
      'Autochequeo: nombra los 4 pilares de la norma.',
    ],
  },
  {
    id: 'm3-03-mep-planificacion',
    title: 'El MEP: planificar el mantenimiento',
    intro: 'Objetivo: saber como se arma un programa de mantenimiento preventivo. El relator lo destaco: "el examen de la planificacion, pagina 15".',
    clave: [
      '4 aspectos basicos del MEP: 1) recopilar un listado de TODOS los equipos; 2) determinar los mas criticos; 3) desarrollar un sistema de supervision (monitoreo); 4) definir el personal (interno o externo).',
      'Una sola persona asume la responsabilidad completa de implementar el MEP, con Autoridad y Calificacion.',
      'Las 5 preguntas (5W): Why (¿por que intervenir?), Where (¿en que parte/equipo?), What (¿que intervencion?), Who (¿quien?), How (¿como?).',
      'Informacion necesaria: procedimientos de inspeccion y prueba, informes anteriores, diagramas unilineales y esquematicos, datos de rotulacion, catalogos del fabricante.',
      'Equipos importados: catalogos, manuales y planos en el idioma del usuario.',
    ],
    terreno: [
      'Seguridad del personal / EPP: consideracion primordial, basada en la NFPA 70E.',
      'Autochequeo: ¿cuales son los 4 aspectos basicos del MEP? ¿cuantas personas asumen la responsabilidad?',
    ],
  },
  {
    id: 'm3-04-criticidad-riesgo',
    title: 'Criticidad y riesgo',
    intro: 'Objetivo: decidir que equipo es critico y priorizar con un criterio de riesgo, no por tamano.',
    medidas: [
      'Matriz de criticidad: Alta (rojo) 50-125; Media (amarillo) 30-49; Baja (verde) 5-29',
    ],
    clave: [
      'Un equipo es critico si su falla causa una seria amenaza al personal, la propiedad o el producto. La criticidad la da su funcion en el proceso, no su tamano.',
      'Riesgo = Probabilidad de falla x Consecuencia de la falla. Consecuencias: impacto a personas, ambiental, costo de reparacion, perdidas de produccion/reputacion/mercado.',
      'Lugares peligrosos: mantenimiento solo por personal calificado, en lo posible fuera del area clasificada; equipos a prueba de explosion / seguridad aumentada.',
    ],
    terreno: [
      'TPEF = Tiempo Promedio Entre Fallas (categorias de 1 a 5 segun la frecuencia esperada).',
      'Autochequeo: ¿que define que un equipo sea critico? ¿como se calcula el riesgo?',
    ],
  },
  {
    id: 'm3-05-tipos-mantenimiento',
    title: 'Tipos de mantenimiento',
    intro: 'Objetivo: distinguir las estrategias de mantenimiento y cuando usar cada una.',
    medidas: [
      'Frecuencia de pruebas: ciclo tipico de 6 meses a 3 anos segun uso y condiciones',
    ],
    clave: [
      '3 tipos: Preventivo; Sistematico (por frecuencia); Predictivo (por condicion, usa sensores).',
      'Frase clave: "las averias no aparecen de repente, tienen una evolucion".',
      'Filosofias/tecnicas: RCM (confiabilidad), TPM (productivo total), MBC (basado en condicion), CMMS (administracion computacional).',
      'El equipo debe estar desenergizado para inspeccion, prueba o reparacion.',
    ],
    terreno: [
      'Autochequeo: ¿cuales son los 3 tipos de mantenimiento? ¿como debe estar el equipo para intervenirlo?',
    ],
  },
  {
    id: 'm3-06-pruebas-mediciones',
    title: 'Pruebas y mediciones',
    intro: 'Objetivo: conocer las pruebas del MEP y los datos clave del taller practico: puesta a tierra, calidad de energia y termografia.',
    medidas: [
      'Resistencia de puesta a tierra: optima menor o igual a 5 ohm; la norma apunta a ~2 ohm; el reglamento tolera hasta 20 ohm',
      'Voltaje admisible: 0,95 a 1,05 p.u.; desbalance entre fases menor a 3%',
      'Instrumentos de medicion integrados en tableros: obligatorios desde 100 A',
      'Iluminacion industrial: 400-500 lux promedio',
    ],
    clave: [
      'Metodos de prueba: termografia infrarroja, analisis de vibracion, ultrasonido, descargas parciales, medicion de aislacion, calidad de energia, medicion de puesta a tierra.',
      '"Prueba" = la variable que tomo (medicion/registro); "metodo" = como la hago (instrumento/procedimiento).',
      'Puesta a tierra: dos tipos, de servicio (asociada al neutro) y de proteccion (PE, cable verde o verde-amarillo, protege a las personas).',
      'El telurometro mide la resistencia de puesta a tierra. El megohmetro (megger) mide aislacion: no confundir.',
      'Armonicos multiplos de 3 = los mas criticos (calientan el conductor neutro). Se miden con instrumentos True RMS.',
    ],
    terreno: [
      'Caso real: con camara termografica (Fluke) se detectan puntos calientes / arco incipiente sin contacto; si una de las 3 fases tiene temperatura muy distinta, hay que revisar (conexion floja).',
      'Retencion de registros de prueba/mantenimiento: al menos 5 anos (dato del relator).',
      'Autochequeo: ¿que instrumento mide la puesta a tierra? ¿que armonicos son los mas criticos?',
    ],
  },
  {
    id: 'm3-07-gestion-phva',
    title: 'Gestion y mejora continua (PHVA)',
    intro: 'Objetivo: cerrar el ciclo. Un MEP no es una lista de tareas, es un sistema de gestion que mejora con el tiempo.',
    clave: [
      'Ciclo PHVA: Planificar (liderar y apoyar) -> Hacer (implementar y operar) -> Evaluar (monitorear y controlar) -> Actuar (mejorar).',
      'Estructura del sistema de gestion: contexto de la organizacion -> liderazgo -> planificacion (riesgos y oportunidades) -> apoyo -> operacion -> evaluacion del desempeno -> auditoria interna.',
      'Por que paga el MEP: el deterioro es normal y la falla inevitable; el MEP detecta y corrige causas antes de que sean mayores (Prevenir / Medir / Reparar).',
    ],
    terreno: [
      'Gestion estrategica: comparar costos de preventivo vs correctivo; definir quien, cuando y cuanto sustituir o reparar.',
      'Autochequeo: ¿cuales son las 4 etapas del PHVA?',
    ],
  },
  {
    id: 'm3-10-definiciones-base',
    title: 'Definiciones base y niveles de tension',
    intro: 'Objetivo: manejar el vocabulario de la norma: arco, choque, energia incidente, persona calificada y los niveles de tension. Es la base para entender el resto del modulo.',
    medidas: [
      'Niveles de tension: Baja menor o igual a 1 kV; Media mayor a 1 kV hasta 23 kV; Alta mayor a 23 kV hasta 230 kV',
      'Tension reducida: de 0 a 100 V (segun el codigo electrico chileno)',
      'Energia incidente: se mide en cal/cm² (calorias por centimetro cuadrado)',
    ],
    clave: [
      'Arco electrico: descarga disruptiva por ionizacion de un medio gaseoso entre dos superficies a distinto potencial.',
      'Choque electrico: estimulacion fisica que ocurre cuando la corriente electrica fluye por el cuerpo humano.',
      'MEP: programa administrado de inspeccion, pruebas, analisis y servicios de los equipos.',
      'Persona Calificada: tiene habilidades y conocimiento de la construccion y operacion del equipo, mas entrenamiento para reconocer los peligros. Persona No Calificada: todas las demas.',
      'La distribuidora local entrega en media tension hasta un maximo de 23 kV; dentro de la planta conviven 220 V y 380 V en baja tension.',
    ],
    terreno: [
      'La mayor cantidad de accidentes con consecuencias fatales esta en baja tension, por la falsa sensacion de seguridad del 220/380 V.',
      'Autochequeo: ¿que es un arco electrico? ¿hasta que tension es Media?',
    ],
  },
  {
    id: 'm3-11-practicas-mantenimiento',
    title: 'Practicas de mantenimiento: por que paga el MEP',
    intro: 'Objetivo: entender por que conviene mantener, como se estructura un programa y que se revisa en el sistema de protecciones (Leccion 3 del manual).',
    clave: [
      'Por que paga el MEP: el deterioro es normal y la falla es inevitable; el MEP detecta y corrige causas potenciales ANTES de que sean mayores. Resumen: Prevenir / Medir / Reparar el deterioro.',
      'Programa de mantenimiento: prevencion diaria -> revision periodica -> tratamiento oportuno; el seguimiento es anual o semestral segun el tamano de la planta.',
      'Causas de falla del arco: evolutivas (debilitamiento del aislamiento) y operacionales (contacto accidental, error de maniobra, contaminacion, corrosion).',
      'Plan de proteccion: pruebas periodicas, lubricacion y limpieza de reles y dispositivos; verificar el tipo y amperaje de los fusibles; saber interpretar las curvas tiempo-corriente.',
      'Pruebas de aceptacion al poner en marcha: plan de puesta en marcha (Px) y pruebas de desempeno funcional (FPT).',
    ],
    terreno: [
      'El equipo debe estar DESENERGIZADO para inspeccion, prueba o reparacion.',
      'Autochequeo: ¿que tres verbos resumen el programa de mantenimiento? ¿que se interpreta con las curvas tiempo-corriente?',
    ],
  },
  {
    id: 'm3-12-calidad-energia',
    title: 'Calidad de energia y perturbaciones',
    intro: 'Objetivo: reconocer las perturbaciones de la red y como se miden. Datos del taller practico (audios 10-14). Complementa Pruebas y mediciones.',
    medidas: [
      'Voltaje admisible: 0,95 a 1,05 p.u.; desbalance entre fases menor a 3%',
      'Instrumentos de medicion integrados en tableros: obligatorios desde 100 A (antes 200 A)',
      'Iluminacion industrial: 400 a 500 lux promedio',
    ],
    clave: [
      'Perturbaciones de calidad de energia: transitorios, dips/sags (huecos de tension), swells (sobretensiones), outages (cortes), desbalance, variacion de frecuencia, flicker (parpadeo), notches y armonicos.',
      'Armonicos: multiplos de la frecuencia fundamental. Los multiplos de 3 son los mas criticos porque se suman en el conductor NEUTRO y lo calientan.',
      'Se miden con instrumentos True RMS (valor eficaz verdadero), que captan todo el espectro de frecuencia. Un instrumento "instantaneo" barato solo mide a 50 Hz y falla si hay armonicos.',
      'Los tableros modernos integran medicion multifuncion (V, A, potencia, coseno fi) desde 100 A.',
    ],
    terreno: [
      'Para certificar calidad de energia se usa un equipo True RMS (ej. Fluke); no sirve un tester comun.',
      'Autochequeo: ¿que armonicos son los mas criticos y por que? ¿que mide un True RMS que no mide un tester comun?',
    ],
  },
  {
    id: 'm3-13-puesta-a-tierra',
    title: 'Puesta a tierra',
    intro: 'Objetivo: distinguir los tipos de tierra, su instrumento de medida y los valores objetivo. Muy preguntado en el taller practico.',
    medidas: [
      'Resistencia de puesta a tierra: optima menor o igual a 5 ohm; la norma apunta a ~2 ohm en equipos criticos; el reglamento tolera hasta 20 ohm',
    ],
    clave: [
      'Dos tipos: tierra de SERVICIO (asociada al neutro, estabiliza/cierra el sistema) y tierra de PROTECCION (PE, cable verde o verde-amarillo, protege a las personas).',
      'El telurometro (telurimetro) mide la resistencia de puesta a tierra. El megohmetro (megger) mide la aislacion: no confundir.',
      'Antes de disenar o verificar una malla se hace un estudio de suelo (resistividad).',
      'La puesta a tierra crea un camino de baja impedancia para la corriente de falla, limita las tensiones de paso y de contacto y permite que operen las protecciones.',
    ],
    terreno: [
      'Evita poner las pinzas de tierra sobre superficies pintadas; el buen contacto es clave para que la medida sea valida.',
      'Autochequeo: ¿que instrumento mide la tierra? ¿cual es el valor optimo de resistencia?',
    ],
  },
  {
    id: 'm3-14-protecciones-sep',
    title: 'Protecciones y equipos del sistema electrico',
    intro: 'Objetivo: repasar los equipos y protecciones del SEP que el relator paso como contexto (base de la guia grupal N°1).',
    medidas: [
      'Proteccion diferencial obligatoria en el RIC: 30 mA',
      'Grado de proteccion IP: 1er digito = solidos/polvo, 2° digito = agua (ej. IP65/IP66 en lugares humedos)',
    ],
    clave: [
      'Etapas de un Sistema Electrico de Potencia (SEP): generacion, transmision y distribucion. Quien fiscaliza en Chile es la SEC (el CDEC era el coordinador de despacho, hoy Coordinador Electrico Nacional).',
      'Protecciones electricas: detectan, ubican y AISLAN la falla, desconectando solo la zona afectada -> protegen personas y equipos.',
      'Proteccion diferencial: detecta fugas de corriente -> protege del choque electrico; en el RIC el diferencial de 30 mA es obligatorio.',
      'Interruptores: conectan/desconectan CON carga; desconectadores: solo SIN carga. Los interruptores se clasifican por el medio de extincion del arco, la capacidad de ruptura y el nivel de tension/aislacion.',
      'Equipos primarios en MT: transformadores, protecciones y pararrayos. SCADA: monitorea variables del SEP y permite maniobras remotas.',
    ],
    terreno: [
      'La trampa de onda (line trap) sirve para comunicacion por onda portadora (PLC), NO para descargas atmosfericas; de los rayos se encargan el pararrayos y el cable/hilo de guarda.',
      'En interruptores en aceite, el arco descompone el aceite liberando hidrogeno, que ayuda a extinguir el arco.',
      'Autochequeo: ¿que protege un diferencial y de cuanto es en el RIC? ¿para que sirve realmente la trampa de onda?',
    ],
  },
  {
    id: 'm3-15-mantenimiento-externo-gestion',
    title: 'Mantenimiento externo y gestion estrategica',
    intro: 'Objetivo: saber que pedir cuando el mantenimiento se externaliza y como se decide entre preventivo y correctivo.',
    clave: [
      'Elementos de un contrato de mantenimiento externo: alcance, detalle paso a paso, normativa aplicable, metodologia de precios, calificacion del personal, garantia, documentacion y una caminata de revision previa y posterior.',
      'Mantenimiento con intervalos largos entre paradas: cuidar el aspecto humano (trabajador en condiciones fisicas y mentales adecuadas) y el aspecto tecnico (personal calificado que conoce el equipo).',
      'Gestion estrategica: comparar costos de preventivo vs correctivo; decidir QUIEN lo hace (centralizado/descentralizado, propio o contratista), CUANDO sustituir o reparar y CUANTO (sustitucion individual o en grupo).',
      'Programa sistematico: depende de la atmosfera/ambiente, las condiciones de carga, el registro historico y la frecuencia de inspecciones.',
    ],
    terreno: [
      'Los registros de prueba y mantenimiento se guardan al menos 5 anos (dato del relator).',
      'Autochequeo: ¿que dos aspectos se cuidan en paradas largas? ¿que se compara en la gestion estrategica?',
    ],
  },
  {
    id: 'm3-08-autoevaluacion',
    title: 'Autoevaluacion — foco de examen',
    intro: 'Examen a libro abierto. Repasa estas preguntas confirmadas y marcadas por el relator. Las respuestas estan en las lecciones anteriores.',
    clave: [
      'Edicion vigente de la NFPA 70B -> 2023.',
      'Los 4 pilares -> Seguridad a las Personas, Gestion de Mantenimiento, Procedimientos Especificos, Analisis de la Informacion.',
      '% de equipos que falla por falta de mantenimiento -> 80%.',
      'Hasta que tension es Media -> hasta 23 kV (mayor a 1 kV).',
      'Los 4 aspectos basicos del MEP -> listar equipos, determinar criticos, sistema de supervision, definir personal.',
      '¿Cuantas personas implementan el MEP? -> una sola (con autoridad y calificacion).',
      '¿Que hace critico a un equipo? -> que su falla amenace al personal, la propiedad o el producto (por su funcion).',
      'Norma en que se basa el EPP -> NFPA 70E.',
      'Rango del ciclo de pruebas -> de 6 meses a 3 anos.',
      'Los 3 tipos de mantenimiento -> preventivo, sistematico, predictivo.',
      'Riesgo -> Probabilidad de falla x Consecuencia de la falla.',
      '¿Como debe estar el equipo para intervenirlo? -> desenergizado.',
      'Autoridad competente en Chile -> la SEC.',
    ],
    terreno: [
      'Ojo: la trampa de onda (line trap) sirve para comunicacion por onda portadora (PLC), NO para descargas atmosfericas; de eso se encargan el pararrayos y el cable de guarda.',
    ],
  },
  {
    id: 'm3-09-glosario',
    title: 'Glosario de siglas',
    intro: 'Siglas que se usan en todo el modulo. Entre parentesis, la Leccion donde se explica cada una (para ir a verla en contexto).',
    clave: [
      'NFPA 70B = Norma para el Mantenimiento del Equipo Electrico (la de este modulo) · NFPA 70E = Seguridad Electrica en lugares de trabajo · NFPA 70 / NEC = Codigo Electrico Nacional. (Leccion 1)',
      'AC = Autoridad Competente (en Chile = la SEC) · SEC = Superintendencia de Electricidad y Combustibles. (Leccion 1)',
      'MEP = Mantenimiento Electrico Preventivo: programa de inspeccion, pruebas, analisis y servicios. (Leccion 3)',
      'TPEF = Tiempo Promedio Entre Fallas (categorias 1 a 5). (Leccion 4)',
      'PHVA = Planificar / Hacer / Verificar / Actuar (ciclo de mejora). (Leccion 7)',
      'BT / MT / AT = Baja (≤1 kV) / Media (>1-23 kV) / Alta (>23-230 kV) Tension. (Leccion 8)',
      'RCM = Centrado en la Confiabilidad · TPM = Productivo Total · MBC = Basado en la Condicion · CMMS = Administracion del Mantenimiento Computacional. (Leccion 9)',
      'Px = plan de puesta en marcha · FPT = pruebas de desempeno funcional. (Leccion 9)',
      'True RMS = valor eficaz verdadero (mide todo el espectro de frecuencia) · p.u. = por unidad (rango 0,95-1,05). (Leccion 10)',
      'PE = conductor de proteccion a tierra (verde / verde-amarillo). (Leccion 11)',
      'SEP = Sistema Electrico de Potencia · SSEE = Subestaciones. (Leccion 12)',
      'IP = Grado de Proteccion (1er digito solidos/polvo, 2° agua) · PLC = comunicacion por onda portadora · RIC = Reglamento de Instalaciones de Consumo. (Leccion 12)',
    ],
  },
];

const M3_PROCEDURES = [
  {
    id: 'm3-proc-iniciar-mep',
    title: 'Iniciar un MEP (los 4 aspectos basicos)',
    description: 'Punto de partida para montar un programa de mantenimiento electrico preventivo.\n\nEjemplo: en una planta nueva listas todos los tableros y motores, marcas como criticos la sala electrica principal y el chiller, defines quien los monitorea y nombras un responsable con autoridad.',
    steps: [
      'Recopila un listado de TODOS los sistemas y equipos.',
      'Determina cuales son los mas criticos (por su funcion en el proceso, no por su tamano).',
      'Desarrolla un sistema de supervision / monitoreo.',
      'Define el personal necesario (interno o externo).',
      'Asigna un responsable unico con Autoridad y Calificacion.',
    ],
  },
  {
    id: 'm3-proc-medir-tierra',
    title: 'Medir la resistencia de puesta a tierra',
    description: 'Verificacion de la malla de tierra. Mucho del taller practico gira en torno a esto.\n\nEjemplo: mides la malla de la sala electrica con el telurometro y da 8 ohm; esta sobre el optimo (≤5 ohm), asi que revisas uniones y agregas una barra de tierra.',
    steps: [
      'Asegura el equipo desenergizado y condiciones seguras.',
      'Usa un telurometro (no un megger, que mide aislacion).',
      'Si vas a verificar o disenar la malla, realiza un estudio de suelo (resistividad).',
      'Compara contra el objetivo: optima menor o igual a 5 ohm (la norma apunta a ~2 ohm; maximo reglamentario 20 ohm).',
      'Si esta fuera de rango, revisa uniones y mejora la malla.',
    ],
  },
  {
    id: 'm3-proc-criticidad',
    title: 'Evaluar la criticidad de un equipo (5W + matriz)',
    description: 'Metodo para decidir cuanto y como intervenir un equipo.\n\nEjemplo: un motor de respaldo poco usado pero que detiene toda la linea si falla puntua alto en consecuencia; aunque sea chico, queda como critico (rojo) en la matriz.',
    steps: [
      'Why: ¿por que hay que intervenirlo?',
      'Where: ¿en que parte / equipo?',
      'What: ¿que tipo de intervencion?',
      'Who: ¿quien lo hara?',
      'How: ¿como se hara el servicio?',
      'Calcula Riesgo = Probabilidad x Consecuencia y ubicalo en la matriz (Alta 50-125 / Media 30-49 / Baja 5-29).',
    ],
  },
  {
    id: 'm3-proc-termografia',
    title: 'Inspeccion con termografia',
    description: 'Deteccion sin contacto de puntos calientes y arco incipiente.\n\nEjemplo: en termografia una fase de un interruptor marca 70 °C y las otras 40 °C; marcas el punto, lo reaprietas desenergizado y vuelves a medir para confirmar.',
    steps: [
      'Con el equipo en carga normal, apunta la camara termografica a conexiones y barras.',
      'Compara la temperatura entre las 3 fases.',
      'Si una fase esta notoriamente mas caliente, marca el punto (posible conexion floja o arco incipiente).',
      'Programa la correccion con el equipo desenergizado.',
      'Registra la medicion (se guarda al menos 5 anos).',
    ],
  },
  {
    id: 'm3-proc-calidad-energia',
    title: 'Medir la calidad de energia',
    description: 'Verificar tension, desbalance y armonicos en un tablero.\n\nEjemplo: el neutro de un tablero de luminarias LED se calienta; con un True RMS ves armonicos de 3er orden altos y rediseñas el reparto de cargas.',
    steps: [
      'Usa un instrumento True RMS (no un tester comun) para captar todo el espectro de frecuencia.',
      'Mide la tension y verifica que este en el rango 0,95-1,05 p.u.',
      'Comprueba que el desbalance entre fases sea menor a 3%.',
      'Revisa los armonicos, en especial los multiplos de 3 (calientan el neutro).',
      'Registra los valores; si el neutro se calienta, busca cargas no lineales.',
    ],
  },
  {
    id: 'm3-proc-plan-proteccion',
    title: 'Revisar el sistema de protecciones',
    description: 'Mantenimiento del plan de protecciones: reles, fusibles y coordinacion.\n\nEjemplo: en la mantencion semestral limpias los reles, confirmas que los fusibles son del amperaje correcto y revisas que la coordinacion (curvas tiempo-corriente) abra primero la proteccion mas cercana a la falla.',
    steps: [
      'Con el equipo desenergizado, limpia y lubrica los reles y dispositivos.',
      'Verifica el tipo y amperaje de cada fusible.',
      'Prueba la operacion de las protecciones y el estado/apriete de los contactos.',
      'Revisa la coordinacion de la operacion (curvas tiempo-corriente).',
      'Registra y programa la proxima revision.',
    ],
  },
  {
    id: 'm3-proc-intervencion-segura',
    title: 'Intervenir un equipo de forma segura',
    description: 'Secuencia minima antes de tocar un equipo, basada en la NFPA 70E.\n\nEjemplo: para revisar un transformador de MT lees el procedimiento, lo desenergizas, verificas 0 V, pones a tierra y usas el EPP NFPA 70E antes de entrar a la celda.',
    steps: [
      'Lee primero el procedimiento de trabajo.',
      'Desenergiza el equipo.',
      'Verifica ausencia de tension con instrumento (probado antes y despues).',
      'Pon a tierra.',
      'Usa el EPP segun la NFPA 70E y recien entonces interviene.',
    ],
  },
];

const M3_FLOWS = [
  {
    id: 'm3-flow-frecuencia-prueba',
    title: 'Debo definir cada cuanto probar un equipo',
    trigger: 'Necesitas fijar la frecuencia de pruebas/mantenimiento de un equipo.',
    actions: [
      'Parte del rango tipico: 6 meses a 3 anos.',
      'Considera el uso, la carga y las condiciones ambientales.',
      'Revisa la recomendacion del fabricante...',
      '...pero ajusta segun la tasa de fallas (la norma es mas estricta).',
      'Documenta la frecuencia elegida en el MEP.',
    ],
  },
  {
    id: 'm3-flow-priorizar',
    title: 'Tengo que priorizar que equipos mantener primero',
    trigger: 'Recursos limitados y muchos equipos: hay que ordenar.',
    actions: [
      'Lista todos los equipos.',
      'Evalua la criticidad por funcion en el proceso.',
      'Calcula Riesgo = Probabilidad x Consecuencia.',
      'Ordena por la matriz de criticidad (rojo primero).',
      'Asigna los recursos a los equipos criticos.',
    ],
  },
  {
    id: 'm3-flow-intervenir-mt',
    title: 'Voy a intervenir un equipo de media tension',
    trigger: 'Trabajo sobre un circuito o equipo de MT.',
    actions: [
      'Lee primero el procedimiento de trabajo.',
      'Desenergiza y verifica ausencia de tension.',
      'Pon a tierra.',
      'Usa el EPP segun la NFPA 70E.',
      'Recien entonces interviene.',
    ],
  },
  {
    id: 'm3-flow-lugar-peligroso',
    title: 'Mantengo un equipo en lugar peligroso / clasificado',
    trigger: 'El equipo esta en un area clasificada (riesgo de explosion/ignicion).',
    actions: [
      'Solo personal calificado.',
      'Trabaja fuera del area clasificada en lo posible.',
      'Desconecta la energia y toda fuente de ignicion.',
      'Usa solo repuestos aprobados.',
      'Equipos a prueba de explosion / seguridad aumentada.',
    ],
  },
  {
    id: 'm3-flow-trampa-onda',
    title: 'Me preguntan por la trampa de onda (pregunta trampa)',
    trigger: 'Afirman que la trampa de onda de las subestaciones sirve para disminuir las descargas atmosfericas.',
    actions: [
      'Es FALSO.',
      'La trampa de onda (line trap) sirve para comunicacion por onda portadora (PLC) sobre la linea de AT.',
      'Lo que mitiga la descarga atmosferica es el pararrayos + el cable/hilo de guarda.',
      'No confundas comunicacion con proteccion contra rayos.',
    ],
  },
  {
    id: 'm3-flow-diferencial-dispara',
    title: 'El diferencial dispara',
    trigger: 'La proteccion diferencial se activa y corta el circuito.',
    actions: [
      'El diferencial detecta una fuga de corriente: protege del choque electrico.',
      'Revisa si hay un equipo con aislacion deteriorada o humedad.',
      'Mide la aislacion con megger (no con telurometro).',
      'En el RIC el diferencial de 30 mA es obligatorio: no lo anules.',
      'Repara la fuga antes de reponer el servicio.',
    ],
  },
];

const M3_DIAGNOSIS = [
  {
    id: 'm3-dx-fase-caliente',
    title: 'Una fase mas caliente que las otras (termografia)',
    symptom: 'En la termografia, una de las 3 fases muestra una temperatura notablemente mayor.',
    possibleCauses: [
      'Conexion floja',
      'Punto caliente / arco incipiente',
      'Desbalance de carga',
    ],
    solution: 'Programa la correccion con el equipo desenergizado: reaprieta la conexion y revisa el estado del contacto. Vuelve a medir para confirmar. Registra la intervencion. Ejemplo: en un interruptor, la fase R marca 70 °C y S/T marcan 40 °C: hay una conexion floja en R.',
  },
  {
    id: 'm3-dx-tierra-alta',
    title: 'Resistencia de puesta a tierra alta',
    symptom: 'El telurometro mide una resistencia de tierra por encima de lo optimo (menor o igual a 5 ohm).',
    possibleCauses: [
      'Malla deteriorada o mal unida',
      'Suelo de alta resistividad',
      'Conexiones sueltas',
    ],
    solution: 'Revisa y reaprieta las uniones de la malla, considera mejorarla (mas electrodos / tratamiento de suelo) y verifica con un estudio de resistividad. Objetivo: acercarse a ~2 ohm; maximo reglamentario 20 ohm. Ejemplo: la malla de la sala da 18 ohm; aunque "pasa" el reglamento, esta lejos del optimo: mejora uniones y agrega electrodos.',
  },
  {
    id: 'm3-dx-neutro-caliente',
    title: 'Conductor neutro recalentado',
    symptom: 'El neutro se calienta mas de lo esperado pese a cargas equilibradas en apariencia.',
    possibleCauses: [
      'Armonicos multiplos de 3 que se suman en el neutro',
      'Cargas no lineales',
    ],
    solution: 'Mide con un instrumento True RMS (no uno de solo 50 Hz). Identifica las cargas no lineales y evalua filtrado/redistribucion. Un instrumento barato "instantaneo" no detecta armonicos. Ejemplo: tablero de cargadores y luminarias LED con neutro mas caliente que las fases: son armonicos de 3er orden sumandose en el neutro.',
  },
  {
    id: 'm3-dx-desbalance',
    title: 'Desbalance de tension entre fases',
    symptom: 'La diferencia de tension entre fases supera el 3%.',
    possibleCauses: [
      'Cargas monofasicas mal repartidas',
      'Conexion deficiente',
    ],
    solution: 'Redistribuye las cargas entre fases y revisa conexiones. Manten el voltaje dentro de 0,95-1,05 p.u. y el desbalance bajo 3%. Ejemplo: un motor trifasico vibra y se calienta; al medir, una fase esta 6% mas baja: redistribuye las cargas monofasicas.',
  },
  {
    id: 'm3-dx-diferencial',
    title: 'Fuga de corriente / diferencial que dispara',
    symptom: 'La proteccion diferencial se dispara de forma repetida.',
    possibleCauses: [
      'Aislacion deteriorada de un equipo',
      'Humedad / ingreso de agua',
      'Cable o conexion danada',
    ],
    solution: 'Identifica el circuito afectado y mide la aislacion con megohmetro (megger). Repara la fuga; no anules ni "puentees" el diferencial (30 mA obligatorio en el RIC). El diferencial protege a las personas del choque electrico.',
  },
  {
    id: 'm3-dx-tablero-humedo',
    title: 'Tablero en lugar humedo',
    symptom: 'Tablero expuesto a agua o humedad, con riesgo de falla o disparo.',
    possibleCauses: [
      'Grado de proteccion IP insuficiente para el ambiente',
      'Sellos o prensaestopas en mal estado',
    ],
    solution: 'Usa tableros con grado IP adecuado al ambiente (1er digito = solidos/polvo, 2° = agua; en lugares humedos IP alto, ej. IP65/IP66). Revisa sellos y entradas de cables; mantenlo cerrado y estanco.',
  },
];

const M3_QUIZ = [
  {
    id: 'm3-q-autoridad',
    question: '¿Quien es la autoridad competente en Chile segun la NFPA 70B?',
    options: ['El CDEC', 'La SEC', 'El INN', 'La mutualidad'],
    correctIndex: 1,
    explanation: 'La SEC (Superintendencia de Electricidad y Combustibles). Pregunta confirmada de examen.',
  },
  {
    id: 'm3-q-edicion',
    question: '¿De que ano es la edicion vigente de la NFPA 70B?',
    options: ['2018', '2021', '2023', '2024'],
    correctIndex: 2,
    explanation: 'Edicion 2023 (Nivel 1).',
  },
  {
    id: 'm3-q-pilares',
    question: '¿Cuales son los 4 pilares de la norma?',
    options: [
      'Seguridad, Gestion de Mantenimiento, Procedimientos por equipo, Analisis de la informacion',
      'Generacion, Transmision, Distribucion, Consumo',
      'Preventivo, Predictivo, Correctivo, Sistematico',
      'Personas, Procesos, Tecnologia, Datos',
    ],
    correctIndex: 0,
    explanation: '1) Seguridad a las Personas, 2) Gestion de Mantenimiento, 3) Procedimientos especificos por equipo, 4) Analisis de la informacion.',
  },
  {
    id: 'm3-q-estadistica',
    question: '¿Que porcentaje de los equipos falla en algun momento por falta de mantenimiento?',
    options: ['20%', '50%', '80%', '95%'],
    correctIndex: 2,
    explanation: 'El 80% (estadistica internacional).',
  },
  {
    id: 'm3-q-media-tension',
    question: '¿Hasta que tension se considera Media Tension?',
    options: ['Hasta 1 kV', 'Hasta 23 kV', 'Hasta 230 kV', 'Hasta 500 kV'],
    correctIndex: 1,
    explanation: 'Media: mayor a 1 kV hasta 23 kV. Baja menor o igual a 1 kV; Alta mayor a 23 kV hasta 230 kV.',
  },
  {
    id: 'm3-q-riesgo',
    question: '¿Como se calcula el riesgo?',
    options: ['Probabilidad + Consecuencia', 'Probabilidad x Consecuencia', 'Consecuencia / Probabilidad', 'Frecuencia x Tiempo'],
    correctIndex: 1,
    explanation: 'Riesgo = Probabilidad de falla x Consecuencia de la falla.',
  },
  {
    id: 'm3-q-tipos',
    question: '¿Cuales son los 3 tipos de mantenimiento?',
    options: ['Preventivo, Sistematico, Predictivo', 'Manual, Automatico, Mixto', 'Diario, Semanal, Anual', 'Interno, Externo, Mixto'],
    correctIndex: 0,
    explanation: 'Preventivo, Sistematico (por frecuencia) y Predictivo (por condicion).',
  },
  {
    id: 'm3-q-telurometro',
    question: '¿Que instrumento mide la resistencia de puesta a tierra?',
    options: ['Megohmetro (megger)', 'Telurometro', 'Multimetro', 'Osciloscopio'],
    correctIndex: 1,
    explanation: 'El telurometro. El megger mide aislacion (no confundir).',
  },
  {
    id: 'm3-q-ciclo',
    question: '¿Cual es el rango tipico del ciclo de pruebas?',
    options: ['1 a 7 dias', '1 a 4 semanas', '6 meses a 3 anos', '5 a 10 anos'],
    correctIndex: 2,
    explanation: 'De 6 meses a 3 anos segun uso y condiciones.',
  },
  {
    id: 'm3-q-desenergizado',
    question: '¿Como debe estar el equipo para inspeccion, prueba o reparacion?',
    options: ['Energizado a media carga', 'Energizado en vacio', 'Desenergizado', 'En cortocircuito'],
    correctIndex: 2,
    explanation: 'Desenergizado.',
  },
  {
    id: 'm3-q-1968',
    question: '¿Como nacio la NFPA 70B?',
    options: [
      'Como Norma obligatoria en 2023',
      'Como "Practica Recomendada" en 1968',
      'Como un decreto chileno',
      'Como parte del NEC en 1990',
    ],
    correctIndex: 1,
    explanation: 'Nacio en 1968 como Practica Recomendada; hoy es Norma (edicion 2023).',
  },
  {
    id: 'm3-q-concentra',
    question: '¿En que se concentra principalmente la NFPA 70B?',
    options: [
      'En el mantenimiento correctivo tras la falla',
      'En el Mantenimiento Electrico Preventivo (MEP)',
      'En el diseno de instalaciones nuevas',
      'En la facturacion de la energia',
    ],
    correctIndex: 1,
    explanation: 'En el MEP, para disminuir fallas a personas, equipos y procesos.',
  },
  {
    id: 'm3-q-aplica',
    question: '¿A que instalaciones aplica la NFPA 70B?',
    options: [
      'Solo a instalaciones domesticas',
      'A instalaciones comerciales e industriales (no considera el nivel domestico)',
      'Solo a generacion electrica',
      'A cualquier instalacion, incluido el hogar',
    ],
    correctIndex: 1,
    explanation: 'Aplica a instalaciones comerciales e industriales (SEP). NO considera el nivel domestico.',
  },
  {
    id: 'm3-q-5w',
    question: 'Las 5 preguntas (5W) del MEP incluyen Why, Where, What, Who y...',
    options: ['When', 'How', 'Which', 'Whose'],
    correctIndex: 1,
    explanation: 'How (¿como se hara el servicio?). Las 5W: Why, Where, What, Who, How.',
  },
  {
    id: 'm3-q-tierra-valor',
    question: '¿Cual es el valor optimo de resistencia de puesta a tierra?',
    options: ['Menor o igual a 5 ohm', 'Entre 50 y 100 ohm', 'Exactamente 220 ohm', 'No importa el valor'],
    correctIndex: 0,
    explanation: 'Optima menor o igual a 5 ohm (la norma apunta a ~2 ohm; el reglamento tolera hasta 20 ohm).',
  },
  {
    id: 'm3-q-armonicos',
    question: '¿Que armonicos son los mas criticos y por que?',
    options: [
      'Los pares, porque bajan la tension',
      'Los multiplos de 3, porque se suman en el neutro y lo calientan',
      'Los de alta frecuencia, porque cortan el suministro',
      'Ninguno es critico',
    ],
    correctIndex: 1,
    explanation: 'Los multiplos de 3 se suman en el conductor neutro y lo calientan. Se miden con instrumentos True RMS.',
  },
  {
    id: 'm3-q-trampa-onda',
    question: '¿Para que sirve realmente la trampa de onda (line trap) de las subestaciones?',
    options: [
      'Para disminuir las descargas atmosfericas',
      'Para comunicacion por onda portadora (PLC)',
      'Para medir la puesta a tierra',
      'Para apagar incendios',
    ],
    correctIndex: 1,
    explanation: 'Sirve para comunicacion por onda portadora (PLC), NO para los rayos: de eso se encargan el pararrayos y el cable de guarda. (Pregunta trampa de la guia grupal.)',
  },
  {
    id: 'm3-q-diferencial',
    question: '¿De que protege la proteccion diferencial y de cuanto es la obligatoria en el RIC?',
    options: [
      'De la sobrecarga; 100 A',
      'Del choque electrico (fuga de corriente); 30 mA',
      'Del cortocircuito; 10 kA',
      'De los rayos; 30 A',
    ],
    correctIndex: 1,
    explanation: 'Detecta fugas de corriente y protege del choque electrico; en el RIC es obligatorio el diferencial de 30 mA.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// MODULO 1 — NFPA 70E, Seguridad Electrica en Lugares de Trabajo (slug seguridad-electrica)
// ════════════════════════════════════════════════════════════════════════════

const M1_MANUAL = [
  {
    id: 'm1-01-marco-nfpa70e',
    title: 'Marco y estructura de la NFPA 70E',
    intro: 'Objetivo: identificar los aspectos de la NFPA 70E 2024 y los requisitos de un Programa de Seguridad Electrica (PSE). Este modulo es el cimiento del programa: la seguridad electrica antes de rescatar (Modulo 2) o mantener (Modulo 3).',
    clave: [
      'NFPA 70E = Norma para la Seguridad Electrica en Lugares de Trabajo, edicion 2024 (espanol). Proposito: proveer un area de trabajo segura frente a los riesgos del uso de la electricidad.',
      'La NFPA (National Fire Protection Association, EE.UU.) es la autoridad mundial en seguridad contra incendios y electrica.',
      'Estructura: Articulo 90 (introduccion); Capitulo 1 - Practicas de trabajo (Art 100 Definiciones, Art 110 Requisitos generales, Art 120 Condicion de trabajo segura, Art 130 Trabajos con peligros); Capitulo 2 - Mantenimiento; Capitulo 3 - Equipos especiales; Anexos A a S (informativos, no obligatorios).',
      'En Chile la fiscaliza la SEC (Superintendencia de Electricidad y Combustibles); se incorporo via DS N°8 (RIC, reemplazo la NCh 4/2003) y DS N°109 (MT/AT).',
      'Niveles de tension: Baja (BT) menor o igual a 1 kV; Media (MT) mayor a 1 kV hasta 23 kV; Alta (AT) mayor a 23 kV hasta 230 kV.',
    ],
    terreno: [
      'Persona Calificada = demostro habilidades + capacitacion en seguridad para identificar y evitar peligros. Persona No Calificada = todas las demas.',
      'Anexos utiles: C (limites de aproximacion), D (calculo de energia incidente), E (Programa de Seguridad Electrica), G (ejemplo de Bloqueo/Etiquetado), H (seleccion de EPP), Q (desempeno/error humano).',
      'Autochequeo: ¿que articulo define la condicion de trabajo electricamente segura? ¿quien fiscaliza en Chile?',
    ],
  },
  {
    id: 'm1-02-tres-peligros',
    title: 'Peligros electricos: los tres grandes',
    intro: 'Objetivo: reconocer los 3 peligros que define la NFPA 70E y por que las lesiones electricas son tan graves.',
    medidas: [
      'Triangulo de seguridad: general = 1 fatalidad cada 300 lesiones; ELECTRICO = 1 fatalidad cada 10 lesiones',
      'Referencia: ~8.000 lesiones por contacto electrico al ano',
      '98% de las fatalidades electricas laborales son por choque electrico',
      'Mas del 40% de las fatalidades involucran contacto con lineas electricas',
    ],
    clave: [
      'Los 3 peligros NFPA 70E: choque electrico (corriente por el cuerpo), relampago de arco / arc flash (calor y luz), rafaga / explosion de arco / arc blast (onda de presion).',
      'Peligro electrico = condicion donde el contacto o falla de equipos puede causar choque, quemadura por relampago de arco, quemadura termica o lesion por rafaga.',
      'Las lesiones electricas tienen una tasa de fatalidad mucho mayor que la mayoria de las otras lesiones.',
    ],
    terreno: [
      'Estadistica del curso: en lugares de trabajo, casi todos los dias se electrocuta una persona.',
      'Autochequeo: ¿cuales son los 3 peligros que define la norma? ¿que proporcion tiene el triangulo de seguridad electrico?',
    ],
  },
  {
    id: 'm1-03-choque-cuerpo',
    title: 'Choque electrico: como afecta al cuerpo',
    intro: 'Objetivo: entender que determina la gravedad de un choque y leer la tabla de efectos de la corriente.',
    medidas: [
      'Resistencia del cuerpo humano (mano a mano): ~2.000 ohms',
      'Contacto a 380 V: I = 380/2000 = 190 mA. Contacto a 220 V: I = 220/2000 = 110 mA',
      '0-3 mA: umbral de percepcion',
      '3-10 mA: no poder soltarse (tetanizacion del brazo)',
      '10-30 mA: paralisis respiratoria (frecuentemente fatal)',
      '30-75 mA: umbral de fibrilacion',
      '75-250 mA: fibrilacion ventricular (fatalidad esperada)',
    ],
    clave: [
      'Parametros que influyen: intensidad de corriente, tiempo de exposicion, trayectoria por el cuerpo, naturaleza (CA/CC), resistencia del cuerpo y tension aplicada.',
      'Lesiones del choque: fibrilacion ventricular (la mas grave), tetanizacion ("queda pegado"), paro respiratorio y quemaduras.',
      'Ley de Ohm: I = V / R. A menor resistencia (piel humeda, mayor area de contacto) circula mas corriente.',
    ],
    terreno: [
      'El tiempo importa tanto como la corriente: la fibrilacion depende de intensidad x tiempo (curva IEC 479 / NTP 400).',
      'Autochequeo: ¿que resistencia de cuerpo usa la norma? ¿a partir de que corriente hay paralisis respiratoria?',
    ],
  },
  {
    id: 'm1-04-arco-causas',
    title: 'Arco electrico: caracteristicas y causas',
    intro: 'Objetivo: entender que es el arco electrico, su energia destructiva y por que falla.',
    medidas: [
      'Temperatura del arco: 2.000 a 20.000 °C (funde cualquier material)',
      'El cobre se expande 67.000 veces al pasar de solido a vapor; proyecta metal fundido a mas de 1.120 km/h',
      'El arco puede encender la ropa hasta a 3 m del punto de falla',
      'Categorias de EPP por energia incidente: Cat 1 = 4 cal/cm² · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm²',
    ],
    clave: [
      'El arco es el flujo de corriente por el aire entre conductores (fase-fase, fase-neutro o fase-tierra). Libera calor radiante, luz intensa y grandes presiones.',
      'Se descompone en relampago de arco (arc flash) + rafaga de arco (arc blast).',
      'Causas de falla de arco: sobretensiones, mecanicas (animales, objetos), evolutivas (debilitamiento del aislamiento, condensacion, puntos calientes por conexiones flojas) y operacionales (error de maniobra, contacto accidental, contaminacion, corrosion, falta de mantenimiento).',
    ],
    terreno: [
      'Falla evolutiva tipica: energizar una instalacion tras varios dias de parada -> condensacion sobre el aislamiento -> arco.',
      'Una conexion floja o un borne aflojado genera un punto caliente que puede evolucionar a una falla trifasica.',
      'Autochequeo: ¿en cuanto se expande el cobre? ¿cuantas cal/cm² es la Categoria 2 de EPP?',
    ],
  },
  {
    id: 'm1-05-cinco-reglas-oro',
    title: 'Las 5 Reglas de Oro (condicion de trabajo segura)',
    intro: 'Objetivo: establecer una condicion de trabajo SIN energia (Art 120). Lo mas seguro es trabajar desenergizado; las 5 Reglas de Oro son el corazon del trabajo electrico seguro.',
    clave: [
      'Las 5 Reglas de Oro, en orden: 1) Desconectar con corte visible o efectivo todas las fuentes de tension; 2) Prevenir cualquier realimentacion (enclavar/bloquear) + tarjeta "PELIGRO NO OPERAR"; 3) Verificar ausencia de tension; 4) Poner a tierra y en cortocircuito; 5) Delimitar y senalizar la zona.',
      'Una instalacion DESCONECTADA no es lo mismo que SEGURA: hasta cumplir las 5 reglas, cualquier intervencion se considera trabajo con tension.',
      '3a Regla: verificar el detector antes y despues, en cada conductor; durante la verificacion la instalacion se considera con tension (usar EPP).',
      '4a Regla: partir por el punto de conexion a tierra; pinzas con buen contacto; evitar superficies pintadas.',
    ],
    terreno: [
      'Corte visible se logra: viendo abiertas las cuchillas del desconectador, retirando el interruptor de su celda, o retirando fusibles/puentes.',
      'Autochequeo: ¿cual es el orden de las 5 Reglas? ¿una instalacion desconectada ya es segura para intervenir?',
    ],
  },
  {
    id: 'm1-06-loto',
    title: 'Bloqueo y Etiquetado (LOTO)',
    intro: 'Objetivo: aplicar el Programa de Bloqueo/Etiquetado para que nadie reenergice el equipo mientras se trabaja (Anexo G).',
    clave: [
      'LOTO = Lock Out / Tag Out (Bloqueo / Etiquetado): garantiza que los dispositivos de corte queden inmovilizados y senalizados.',
      'Bloqueo: inmovilizar el mando con candado/cerradura, o impedir el funcionamiento (retirar fusibles de control), o colocar un elemento aislante.',
      'Etiquetado: tarjeta "PELIGRO NO OPERAR" + tarjeta que identifica a quien bloquea (nombre, RUT, foto).',
      'Cada persona que interviene coloca su propio candado; nadie retira el candado de otro.',
    ],
    terreno: [
      'La senalizacion es la proteccion minima cuando no se puede inmovilizar materialmente el aparato de corte.',
      'Autochequeo: ¿que dice la tarjeta de bloqueo? ¿quien puede retirar tu candado?',
    ],
  },
  {
    id: 'm1-07-fronteras-epp',
    title: 'Fronteras de aproximacion y EPP',
    intro: 'Objetivo: respetar las distancias de seguridad y elegir el EPP correcto cuando hay partes energizadas expuestas.',
    medidas: [
      'Frontera de Aproximacion Limitada (FAL) tipica en BT (50-750 V): ~3,1 m con conductor movil',
      'Frontera de Aproximacion Restringida (FAR) en 151-750 V: ~0,3 m',
      'Categorias de EPP: Cat 1 = 4 cal/cm² · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm²',
      'Pruebas de guantes aislantes: cada 6 meses; mantas y mangas: cada 12 meses',
    ],
    clave: [
      'Frontera de Aproximacion Limitada (FAL): solo la cruza personal calificado.',
      'Frontera de Aproximacion Restringida (FAR): mayor riesgo de arco; bajo ninguna circunstancia una persona no calificada la cruza, ni siquiera escoltada.',
      'El EPP se elige por la energia incidente (cal/cm²) esperada -> categoria de ropa arco-resistente (AR). ATPV = Valor de Proteccion Termica del Arco (cal/cm², bordado en la prenda).',
      'EPP / ESE: guantes aislantes, careta AR, ropa AR, pasamontanas, pertigas.',
    ],
    terreno: [
      'El EPP es el ULTIMO recurso de la jerarquia de control: primero se elimina o controla el peligro.',
      'Autochequeo: ¿quien puede cruzar la frontera limitada? ¿cuantas cal/cm² es la Categoria 4?',
    ],
  },
  {
    id: 'm1-08-riesgos-jerarquia',
    title: 'Evaluacion de riesgos y jerarquia de control',
    intro: 'Objetivo: evaluar el riesgo electrico (choque y arco) y aplicar la jerarquia de control para reducirlo.',
    clave: [
      'La evaluacion de riesgo de CHOQUE determina la tension a la que estara expuesto el personal, las fronteras y el EPP necesario.',
      'La evaluacion de riesgo de ARCO determina la energia incidente y el limite de relampago de arco.',
      'Jerarquia de control de riesgos (de mas a menos efectiva): 1) Eliminacion, 2) Sustitucion, 3) Controles de ingenieria, 4) Avisos / advertencias, 5) Controles administrativos, 6) EPP.',
      'Permiso de Trabajo Electrico Energizado: solo cuando desenergizar no es factible o aumenta el riesgo; requiere justificacion, analisis y autorizacion (Anexo J).',
    ],
    terreno: [
      'Anexo Q (Error Humano): el factor humano es clave; usar herramientas de desempeno humano para reducir errores.',
      'Autochequeo: ¿cual es el primer nivel de la jerarquia de control? ¿cuando se permite trabajo energizado?',
    ],
  },
  {
    id: 'm1-09-autoevaluacion',
    title: 'Autoevaluacion — foco',
    intro: 'Repasa estas preguntas clave del modulo de seguridad electrica. Las respuestas estan en las lecciones anteriores.',
    clave: [
      'Norma del modulo -> NFPA 70E 2024 (seguridad electrica en lugares de trabajo).',
      'Los 3 peligros -> choque, relampago de arco, rafaga de arco.',
      'Resistencia del cuerpo (norma) -> ~2.000 ohms.',
      'Corriente con paralisis respiratoria -> 10-30 mA.',
      'Efecto mas grave de la corriente -> fibrilacion ventricular.',
      'Temperatura del arco -> 2.000 a 20.000 °C.',
      'Expansion del cobre -> 67.000 veces.',
      'Orden de las 5 Reglas de Oro -> desconectar, prevenir realimentacion, verificar ausencia, poner a tierra, senalizar.',
      'Quien cruza la frontera restringida -> nadie no calificado (ni escoltado).',
      'Primer nivel de la jerarquia de control -> eliminacion.',
      'Autoridad en Chile -> SEC.',
    ],
    terreno: [
      'El examen apunta fuerte a las 5 Reglas, las fronteras, la tabla de efectos de la corriente y la jerarquia de control.',
    ],
  },
  {
    id: 'm1-10-glosario',
    title: 'Glosario de siglas y terminos',
    intro: 'Terminos y siglas clave del modulo. Entre parentesis, la Leccion donde se explica cada uno (para ir a verlo en contexto).',
    clave: [
      'NFPA 70E = Norma de Seguridad Electrica en Lugares de Trabajo (la de este modulo). (Leccion 1)',
      'PSE = Programa de Seguridad Electrica. (Leccion 1)',
      'BT / MT / AT = Baja (≤1 kV) / Media (>1-23 kV) / Alta (>23-230 kV) Tension. (Leccion 1)',
      'Persona Calificada / No Calificada = quien tiene (o no) habilidades y entrenamiento para reconocer y evitar el peligro electrico. (Leccion 1)',
      'SEC = Superintendencia de Electricidad y Combustibles (fiscaliza en Chile) · RIC = Reglamento de Instalaciones de Consumo. (Leccion 1)',
      'Energia incidente = energia (cal/cm²) que un arco entrega sobre una superficie a una distancia dada. (Leccion 4)',
      '5 Reglas de Oro = secuencia para dejar la instalacion sin tension. (Leccion 5)',
      'LOTO = Lock Out / Tag Out (Bloqueo / Etiquetado). (Leccion 6)',
      'FAL = Frontera de Aproximacion Limitada · FAR = Frontera de Aproximacion Restringida. (Leccion 7)',
      'EPP = Equipo de Proteccion Personal · ESE = Elementos de Seguridad Electrica. (Leccion 7)',
      'AR = Arco-Resistente · FR = Resistente a la Llama · ATPV = Valor de Proteccion Termica del Arco (cal/cm², bordado en la prenda). (Leccion 7)',
      'Jerarquia de control = Eliminacion > Sustitucion > Ingenieria > Avisos > Administrativos > EPP. (Leccion 8)',
    ],
  },
];

const M1_PROCEDURES = [
  {
    id: 'm1-proc-condicion-segura',
    title: 'Establecer condicion de trabajo electricamente segura (5 Reglas de Oro)',
    description: 'Secuencia para trabajar SIN energia. En orden, sin saltarse pasos.\n\nEjemplo: vas a cambiar un contactor en un CCM de 380 V. Abres el interruptor (corte visible), bloqueas con tu candado y tarjeta, verificas con detector que no hay tension en las 3 fases, pones a tierra y delimitas la zona. Recien ahi trabajas.',
    steps: [
      'Desconectar con corte visible o efectivo todas las fuentes de tension.',
      'Prevenir realimentacion: enclavar/bloquear + tarjeta "PELIGRO NO OPERAR".',
      'Verificar ausencia de tension (detector probado antes y despues, en cada conductor).',
      'Poner a tierra y en cortocircuito, partiendo por el punto de conexion a tierra.',
      'Delimitar y senalizar la zona de trabajo.',
    ],
  },
  {
    id: 'm1-proc-loto',
    title: 'Bloqueo y Etiquetado (LOTO)',
    description: 'Asegurar que nadie reenergice el equipo mientras se trabaja.\n\nEjemplo: dos tecnicos intervienen el mismo tablero; cada uno pone su propio candado en la pinza multiple. El equipo no puede reenergizarse hasta que AMBOS retiren su candado.',
    steps: [
      'Identifica TODAS las fuentes de energia del equipo (electrica y almacenada).',
      'Apaga / desconecta por el procedimiento normal.',
      'Aisla y bloquea cada dispositivo de corte con tu propio candado.',
      'Coloca la tarjeta "PELIGRO NO OPERAR" con tu identificacion (nombre, RUT, foto).',
      'Verifica ausencia de tension y descarga la energia almacenada.',
      'Al terminar, retira SOLO tu propio candado.',
    ],
  },
  {
    id: 'm1-proc-verificar-tension',
    title: 'Verificar ausencia de tension',
    description: 'La 3a Regla de Oro hecha bien: el detector se prueba antes y despues.\n\nEjemplo: antes de tocar la barra, pruebas el detector en un enchufe con tension (funciona), mides la barra (0 V en las 3 fases) y vuelves a probar el detector en el enchufe (sigue funcionando): recien ahi la lectura de 0 V es valida.',
    steps: [
      'Ponte el EPP (guantes aislantes): la instalacion se considera con tension.',
      'Prueba el detector en una fuente conocida CON tension.',
      'Mide en cada conductor (todas las fases y el neutro).',
      'Vuelve a probar el detector en la fuente conocida (confirma que sigue funcionando).',
      'Recien ahi declara ausencia de tension.',
    ],
  },
  {
    id: 'm1-proc-epp-arco',
    title: 'Seleccionar EPP por categoria de arco',
    description: 'Elegir la ropa arco-resistente segun la energia incidente.\n\nEjemplo: el estudio de arco da 7 cal/cm² en un tablero; eliges ropa AR con ATPV mayor o igual a 8 (Categoria 2), careta AR y guantes aislantes.',
    steps: [
      'Determina la energia incidente esperada (cal/cm²) del punto de trabajo.',
      'Ubica la categoria: Cat 1 = 4 · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm².',
      'Elige ropa AR cuyo ATPV sea igual o mayor a esa energia.',
      'Completa con careta AR, guantes aislantes y pasamontanas.',
      'Verifica la vigencia de las pruebas (guantes cada 6 meses).',
    ],
  },
];

const M1_FLOWS = [
  {
    id: 'm1-flow-intervenir',
    title: 'Voy a intervenir un equipo electrico',
    trigger: 'Necesitas trabajar en un equipo o circuito electrico.',
    actions: [
      'Primero intenta desenergizar: es lo mas seguro.',
      'Aplica las 5 Reglas de Oro.',
      'Bloquea y etiqueta (LOTO) con tu candado.',
      'Verifica ausencia de tension antes de tocar.',
      'Si NO se puede desenergizar, tramita un Permiso de Trabajo Energizado.',
    ],
  },
  {
    id: 'm1-flow-punto-caliente',
    title: 'Detecto un punto caliente o conexion floja',
    trigger: 'Termografia o inspeccion muestra un punto caliente / conexion floja.',
    actions: [
      'No lo intervengas energizado.',
      'Programa la correccion con el equipo desenergizado.',
      'Reaprieta o repara la conexion.',
      'Es una causa evolutiva de arco: registra y da seguimiento.',
    ],
  },
  {
    id: 'm1-flow-no-calificado',
    title: 'Una persona no calificada se acerca a zona energizada',
    trigger: 'Alguien sin calificacion se aproxima a partes energizadas expuestas.',
    actions: [
      'Detenlo antes de la Frontera de Aproximacion Limitada.',
      'Solo personal calificado cruza la FAL.',
      'Nadie no calificado cruza la Frontera Restringida, ni escoltado.',
      'Senaliza y delimita la zona.',
    ],
  },
];

const M1_DIAGNOSIS = [
  {
    id: 'm1-dx-paralisis',
    title: 'Corriente de 10-30 mA por el cuerpo',
    symptom: 'Una persona recibe entre 10 y 30 mA: dificultad para respirar / paralisis respiratoria.',
    possibleCauses: [
      'Paso de corriente por el torax',
      'Tetanizacion de los musculos respiratorios',
    ],
    solution: 'Corta la energia o separa a la victima con un elemento aislante seco, llama a emergencia (131) e inicia SVB/RCP si no respira. Recuerda: 10-30 mA es frecuentemente fatal. Ejemplo: alguien toca un cable pelado de 220 V con la mano humeda y no puede respirar bien; cortar la energia y aplicar SVB de inmediato.',
  },
  {
    id: 'm1-dx-arco-parada',
    title: 'Arco al energizar tras una parada larga',
    symptom: 'Al reenergizar un equipo despues de varios dias detenido, se produce una falla de arco.',
    possibleCauses: [
      'Condensacion sobre el aislamiento',
      'Debilitamiento evolutivo del aislamiento',
      'Contaminacion / polvo en superficies aislantes',
    ],
    solution: 'Antes de reenergizar tras una parada larga, inspecciona y seca; usa termografia para detectar puntos calientes. Es una falla evolutiva: el mantenimiento preventivo la previene. Ejemplo: un tablero parado el fin de semana junta condensacion; el lunes, al cerrarlo energizado, hace un arco. Inspecciona y seca antes de energizar.',
  },
  {
    id: 'm1-dx-contacto-linea',
    title: 'Contacto con linea energizada',
    symptom: 'Un trabajador hace contacto con una linea o parte energizada expuesta.',
    possibleCauses: [
      'No se establecio condicion de trabajo segura',
      'Cruce de frontera sin EPP / sin calificacion',
    ],
    solution: 'No toques a la victima mientras este energizada: corta la energia o separala con un aislante seco. Luego evalua y aplica SVB. Se previene aplicando las 5 Reglas de Oro y respetando las fronteras. Ejemplo: un trabajador toca una barra "que creia muerta"; nunca se hizo la verificacion de ausencia de tension.',
  },
];

const M1_QUIZ = [
  {
    id: 'm1-q-peligros',
    question: '¿Cuantos peligros electricos define la NFPA 70E y cuales son?',
    options: ['Uno: el choque', 'Dos: choque y arco', 'Tres: choque, relampago de arco y rafaga de arco', 'Cuatro: choque, arco, incendio y explosion'],
    correctIndex: 2,
    explanation: 'Tres: choque electrico, relampago de arco (arc flash) y rafaga de arco (arc blast).',
  },
  {
    id: 'm1-q-resistencia',
    question: 'Segun la norma, ¿que resistencia se considera para el cuerpo humano (mano a mano)?',
    options: ['200 ohms', '2.000 ohms', '20.000 ohms', '200.000 ohms'],
    correctIndex: 1,
    explanation: '~2.000 ohms. A 220 V eso da ~110 mA; a 380 V, ~190 mA.',
  },
  {
    id: 'm1-q-paralisis',
    question: '¿A partir de que rango de corriente hay paralisis respiratoria?',
    options: ['0-3 mA', '3-10 mA', '10-30 mA', 'mayor a 5 A'],
    correctIndex: 2,
    explanation: '10-30 mA: paralisis respiratoria, frecuentemente fatal.',
  },
  {
    id: 'm1-q-reglas-oro',
    question: '¿Cual es el orden correcto de las 5 Reglas de Oro?',
    options: [
      'Verificar, desconectar, tierra, bloquear, senalizar',
      'Desconectar, prevenir realimentacion, verificar ausencia de tension, poner a tierra, senalizar',
      'Bloquear, senalizar, desconectar, tierra, verificar',
      'Desconectar, verificar, senalizar, tierra, bloquear',
    ],
    correctIndex: 1,
    explanation: '1) desconectar (corte visible), 2) prevenir realimentacion (bloquear), 3) verificar ausencia de tension, 4) poner a tierra y cortocircuito, 5) senalizar.',
  },
  {
    id: 'm1-q-desconectada',
    question: 'Una instalacion DESCONECTADA, ¿ya es segura para intervenir?',
    options: ['Si, basta con desconectar', 'No: hasta cumplir las 5 Reglas se considera trabajo con tension', 'Solo si es de baja tension', 'Solo si esta senalizada'],
    correctIndex: 1,
    explanation: 'Desconectada no es segura: hasta completar las 5 Reglas de Oro, cualquier intervencion se considera trabajo con tension.',
  },
  {
    id: 'm1-q-far',
    question: 'La Frontera de Aproximacion Restringida (FAR)...',
    options: ['La puede cruzar cualquiera', 'Solo la cruza personal no calificado', 'Bajo ninguna circunstancia la cruza una persona no calificada, ni escoltada', 'Solo se aplica en alta tension'],
    correctIndex: 2,
    explanation: 'La FAR no la cruza una persona no calificada bajo ninguna circunstancia, ni escoltada. La Frontera Limitada solo la cruza personal calificado.',
  },
  {
    id: 'm1-q-categoria',
    question: '¿Cuantas cal/cm² corresponden a la Categoria 2 de EPP?',
    options: ['4 cal/cm²', '8 cal/cm²', '25 cal/cm²', '40 cal/cm²'],
    correctIndex: 1,
    explanation: 'Cat 1 = 4 · Cat 2 = 8 · Cat 3 = 25 · Cat 4 = 40 cal/cm². El EPP se elige por la energia incidente esperada.',
  },
  {
    id: 'm1-q-jerarquia',
    question: '¿Cual es el primer (mas efectivo) nivel de la jerarquia de control de riesgos?',
    options: ['EPP', 'Controles administrativos', 'Eliminacion del peligro', 'Senalizacion'],
    correctIndex: 2,
    explanation: 'Jerarquia: Eliminacion > Sustitucion > Controles de ingenieria > Avisos > Controles administrativos > EPP. El EPP es el ultimo recurso.',
  },
  {
    id: 'm1-q-cobre',
    question: '¿Cuanto se expande el cobre al pasar de solido a vapor en una rafaga de arco?',
    options: ['67 veces', '6.700 veces', '67.000 veces', '670.000 veces'],
    correctIndex: 2,
    explanation: '67.000 veces; proyecta metal fundido a mas de 1.120 km/h.',
  },
  {
    id: 'm1-q-loto',
    question: 'La tarjeta de bloqueo "PELIGRO NO OPERAR"...',
    options: ['La puede retirar cualquier supervisor', 'Solo la retira quien la coloco (su propio candado)', 'Se retira al final del turno automaticamente', 'No es obligatoria'],
    correctIndex: 1,
    explanation: 'Cada persona coloca su propio candado y tarjeta; nadie retira el candado de otro. La tarjeta identifica a quien bloquea.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ENSAMBLAJE
// ════════════════════════════════════════════════════════════════════════════

const MODULES = [
  { slug: 'seguridad-electrica', name: 'Seguridad Electrica (NFPA 70E)', manual: M1_MANUAL, procedures: M1_PROCEDURES, flows: M1_FLOWS, diagnosis: M1_DIAGNOSIS, quiz: M1_QUIZ },
  { slug: 'rescate-svb', name: 'Rescate Electrico y SVB', manual: M2_MANUAL, procedures: M2_PROCEDURES, flows: M2_FLOWS, diagnosis: M2_DIAGNOSIS, quiz: M2_QUIZ },
  { slug: 'nfpa-70b', name: 'NFPA 70B Mantenimiento Electrico', manual: M3_MANUAL, procedures: M3_PROCEDURES, flows: M3_FLOWS, diagnosis: M3_DIAGNOSIS, quiz: M3_QUIZ },
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
  return { manual, procedures, flows, diagnosis, quiz };
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

  for (const mod of MODULES) {
    const docs = buildDocs(mod);
    console.log(`\n[${mod.slug}] ${mod.name}`);
    const m = await seedSection(mod.slug, 'manual', docs.manual);
    const p = await seedSection(mod.slug, 'procedures', docs.procedures);
    const f = await seedSection(mod.slug, 'flows', docs.flows);
    const d = await seedSection(mod.slug, 'diagnosis', docs.diagnosis);
    const q = await seedSection(mod.slug, 'quiz', docs.quiz);
    console.log(`   manual: ${m}  ·  procedimientos: ${p}  ·  flujos: ${f}  ·  diagnostico: ${d}  ·  examen: ${q}`);
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
