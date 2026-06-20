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
    intro: 'Siglas que se usan en todo el modulo.',
    clave: [
      'SVB = Soporte Vital Basico. RCP = Reanimacion Cardiopulmonar. DEA/DAE = Desfibrilador Externo Automatico.',
      'EPP = Equipo de Proteccion Personal. ESE = Elementos de Seguridad Electrica. AR = Arco-Resistente.',
      'ABCDE = Airway, Breathing, Circulation, Disability (dano neuro), Exposure. MES = Mirar, Escuchar, Sentir. SER = Seguridad (escena/recursos).',
      'AVDN = Alerta/Verbal/Dolor/No responde. PIRRL = Pupilas Iguales, Redondas, Reactivas a la Luz.',
      'NFPA 70E = norma de seguridad electrica (Ed. 2024). RICE = Reposo, Hielo, Compresion, Elevacion.',
      'SEC = Superintendencia de Electricidad y Combustibles. RIC = Reglamento de Instalaciones de Consumo. TEC = Traumatismo Encefalo-Craneano.',
    ],
  },
];

const M2_PROCEDURES = [
  {
    id: 'm2-proc-5-reglas-oro',
    title: 'Aplicar las 5 Reglas de Oro',
    description: 'Secuencia obligatoria para trabajar sin tension. Se ejecuta en orden, sin saltarse pasos.',
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
    description: 'La victima quedo en contacto con el conductor y no puede soltarse. La prioridad es no convertirte en segunda victima.',
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
    description: 'Reanimacion cardiopulmonar basica para un adulto en paro.',
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
    description: 'Detener una hemorragia visible de forma escalonada, sin retirar los apositos ya colocados.',
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
    description: 'Proteger la columna ante sospecha de trauma. Lo principal es la cervical.',
    steps: [
      'Inmoviliza manualmente la cabeza en posicion neutra.',
      'Coloca un collar cervical de la talla correcta.',
      'Anade inmovilizadores laterales.',
      'Asegura a la victima sobre la tabla espinal moviendola como una sola unidad.',
      'Controla via aerea y respiracion durante todo el proceso.',
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
    solution: 'Activa el 131, inicia RCP 30:2 comprimiendo 1/3 del torax y usa el DEA apenas este disponible. No interrumpas hasta que llegue ayuda avanzada o la victima recupere signos de vida.',
  },
  {
    id: 'm2-dx-shock',
    title: 'Shock (hipovolemico)',
    symptom: 'Pulso debil y rapido, piel palida/fria/cianotica, presion menor a 90/60, poca o nula orina.',
    possibleCauses: [
      'Hemorragia importante (interna o externa)',
      'Perdida de volumen sanguineo',
    ],
    solution: 'Controla la hemorragia, acuesta a la victima y abrigala para evitar el enfriamiento, no le des nada de tomar y trasladala de inmediato controlando pulso y respiracion cada 5 min.',
  },
  {
    id: 'm2-dx-tetanizacion',
    title: 'Victima "pegada" al conductor (tetanizacion)',
    symptom: 'La persona quedo en contacto con la parte energizada y no puede soltarse.',
    possibleCauses: [
      'Contraccion muscular incontrolada por el paso de la corriente',
    ],
    solution: 'Nunca la toques mientras este energizada. Corta la energia (corte visible) o separala con un elemento aislante seco; recien entonces evalua y atiende.',
  },
  {
    id: 'm2-dx-hemorragia-arterial',
    title: 'Hemorragia arterial',
    symptom: 'Sangre roja rutilante que sale a chorro intermitente (pulsatil).',
    possibleCauses: [
      'Lesion de una arteria',
    ],
    solution: 'Presion directa firme con aposito; si no cede, presion digital en el punto de presion (humeral/femoral) y, como ultimo recurso, torniquete. Eleva la extremidad y traslada.',
  },
  {
    id: 'm2-dx-tec',
    title: 'Sospecha de dano neurologico (TEC)',
    symptom: 'Alteracion de conciencia, pupilas desiguales o que no reaccionan a la luz.',
    possibleCauses: [
      'Traumatismo encefalo-craneano',
      'Lesion de columna asociada',
    ],
    solution: 'Maneja a la victima como si tuviera lesion de columna: inmoviliza la cervical, controla el ABCDE y traslada con cuidado. Evalua nivel de conciencia (AVDN) y pupilas (PIRRL).',
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
    intro: 'Siglas que se usan en todo el modulo.',
    clave: [
      'NFPA 70B = Norma para el Mantenimiento del Equipo Electrico. NFPA 70E = Seguridad Electrica en lugares de trabajo. NFPA 70 / NEC = Codigo Electrico Nacional.',
      'MEP = Mantenimiento Electrico Preventivo. RCM = Centrado en la Confiabilidad. TPM = Productivo Total. MBC = Basado en la Condicion. CMMS = Administracion del Mantenimiento Computacional.',
      'SEP = Sistema Electrico de Potencia. SSEE = Subestaciones. BT/MT/AT = Baja/Media/Alta Tension.',
      'AC = Autoridad Competente (en Chile = SEC). SEC = Superintendencia de Electricidad y Combustibles.',
      'PE = conductor de proteccion a tierra. IP = Grado de Proteccion (solidos/agua). TPEF = Tiempo Promedio Entre Fallas. PHVA = Planificar/Hacer/Verificar/Actuar.',
    ],
  },
];

const M3_PROCEDURES = [
  {
    id: 'm3-proc-iniciar-mep',
    title: 'Iniciar un MEP (los 4 aspectos basicos)',
    description: 'Punto de partida para montar un programa de mantenimiento electrico preventivo.',
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
    description: 'Verificacion de la malla de tierra. Mucho del taller practico gira en torno a esto.',
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
    description: 'Metodo para decidir cuanto y como intervenir un equipo.',
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
    description: 'Deteccion sin contacto de puntos calientes y arco incipiente.',
    steps: [
      'Con el equipo en carga normal, apunta la camara termografica a conexiones y barras.',
      'Compara la temperatura entre las 3 fases.',
      'Si una fase esta notoriamente mas caliente, marca el punto (posible conexion floja o arco incipiente).',
      'Programa la correccion con el equipo desenergizado.',
      'Registra la medicion (se guarda al menos 5 anos).',
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
    solution: 'Programa la correccion con el equipo desenergizado: reaprieta la conexion y revisa el estado del contacto. Vuelve a medir para confirmar. Registra la intervencion.',
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
    solution: 'Revisa y reaprieta las uniones de la malla, considera mejorarla (mas electrodos / tratamiento de suelo) y verifica con un estudio de resistividad. Objetivo: acercarse a ~2 ohm; maximo reglamentario 20 ohm.',
  },
  {
    id: 'm3-dx-neutro-caliente',
    title: 'Conductor neutro recalentado',
    symptom: 'El neutro se calienta mas de lo esperado pese a cargas equilibradas en apariencia.',
    possibleCauses: [
      'Armonicos multiplos de 3 que se suman en el neutro',
      'Cargas no lineales',
    ],
    solution: 'Mide con un instrumento True RMS (no uno de solo 50 Hz). Identifica las cargas no lineales y evalua filtrado/redistribucion. Un instrumento barato "instantaneo" no detecta armonicos.',
  },
  {
    id: 'm3-dx-desbalance',
    title: 'Desbalance de tension entre fases',
    symptom: 'La diferencia de tension entre fases supera el 3%.',
    possibleCauses: [
      'Cargas monofasicas mal repartidas',
      'Conexion deficiente',
    ],
    solution: 'Redistribuye las cargas entre fases y revisa conexiones. Manten el voltaje dentro de 0,95-1,05 p.u. y el desbalance bajo 3%.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ENSAMBLAJE
// ════════════════════════════════════════════════════════════════════════════

const MODULES = [
  { slug: 'rescate-svb', name: 'Rescate Electrico y SVB', manual: M2_MANUAL, procedures: M2_PROCEDURES, flows: M2_FLOWS, diagnosis: M2_DIAGNOSIS },
  { slug: 'nfpa-70b', name: 'NFPA 70B Mantenimiento Electrico', manual: M3_MANUAL, procedures: M3_PROCEDURES, flows: M3_FLOWS, diagnosis: M3_DIAGNOSIS },
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
  return { manual, procedures, flows, diagnosis };
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
    console.log(`   manual: ${m}  ·  procedimientos: ${p}  ·  flujos: ${f}  ·  diagnostico: ${d}`);
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
