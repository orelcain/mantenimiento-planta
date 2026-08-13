# WORKLOG — bitácora de agentes (append-only)

Una entrada por bloque de trabajo. La más reciente arriba. Formato:

```
## YYYY-MM-DD · <agente> · <tarea>
- Hecho: ...
- Archivos: ...
- Verificación: tsc/eslint/preview ...
- Estado: HECHO | EN REVISIÓN | PENDIENTE
- Sigue: ...
```

---

## 2026-08-13 - claude - Curva de velocidad: horas reales, zoom y paneo (#517)

- Hecho: eje de la curva pasa de "h+1" a horas reales del reloj (08:00, 09:00...); zoom
  1x/2x/4x con paneo y recentrado en el final (mismo mecanismo del comparador); bloque
  movido ARRIBA de "Piezas por tramo de 5 min".
- Archivos: apps/pwa/src/pages/monitor/MonitorShiftParts.tsx, PublicShiftMonitorPage.tsx
- Verificación: preview :5175 contra turno VIVO de Filete (390px); tsc y eslint limpios.
- Estado: HECHO
- Sigue: nada pendiente de este cambio.

---

## 2026-08-13 - claude - Curva de velocidad de linea (pz/min) a lo largo del turno (#515)

- Hecho: el KPI "Ultimos 30 min" da la velocidad de AHORA; nueva curva da la historia del
  turno (rampa, baches, crucero). Cruda de 5 min (tenue, piso del dato de Shoplogix) + media
  movil de 15 min (protagonista); 2 lineas de referencia punteadas ("necesitas" y "lo normal")
  y bandas de convenio de fondo para que la colacion no parezca falla. Bloque plegable entre
  el grafico de tramos y "A donde se va el tiempo".
- Archivos: `pages/monitor/MonitorShiftParts.tsx` (componente `VelocidadDeLinea`),
  `pages/PublicShiftMonitorPage.tsx`.
- Verificación: preview contra el turno VIVO de Filete (8,5 pz/min, necesitas 12,7, lo normal
  7,5), 390px sin overflow. tsc y eslint limpios. Diseño elegido por Orel en mockup.
- Estado: HECHO. Merge squash a main `386d0a6f`.

---

## 2026-08-13 - claude - Bitacora del turno: todos los comentarios del operador (#513)

- Hecho: los comentarios del operador (unico texto en castellano que sube del piso) solo se leian
  si coincidian con un tramo de brecha. Bloque plegado "Comentarios del operador" bajo Hora por
  hora: hora + causa (salta al grafico) + texto; fusiona tramos contiguos del mismo comentario
  (el sensor lo corta al cambiar de estado) y descarta los que cubren horas enteras (regla de 2 h
  de las brechas). Si no hay comentarios, el bloque no aparece.
- Archivos: `pages/monitor/MonitorShiftParts.tsx` (componente `BitacoraOperador`),
  `pages/PublicShiftMonitorPage.tsx`.
- Verificación: preview contra el monitor real de Filete (fusion incluida), 390px sin overflow,
  claro y oscuro. tsc y eslint limpios.
- Estado: HECHO. Merge squash a main `5a48a793`.

---

## 2026-08-13 - claude - Boton para abrir el monitor en vivo sin pasar por compartir (#511)

- Hecho: generar link/QR es para COMPARTIR; para mirar el monitor uno mismo faltaba un boton de
  un click. `handleAbrirMonitor` reusa el token de linea via `createPublicShiftMonitor`
  (invariante: no crea token nuevo, solo extiende vigencia) y abre `/monitor/{token}` en pestana
  nueva; la pestana se abre ANTES del await para que el bloqueador de popups no la mate.
- Archivos: `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificación: tsc y eslint limpios (1 warning preexistente ajeno). Pendiente de verificación
  humana: el click con sesion de supervisor (no probado en navegador, sin login).
- Estado: HECHO. Merge squash a main `14564470`.

---

## 2026-08-13 - claude - Fix: la brecha se calcula contra la MISMA referencia que el grafico (#509)

- Hecho: el v3 (#505) dejo el grafico comparando contra la referencia del chip pero la lista
  "Donde se abrio la brecha" seguia clavada al mejor dia: dos rivales distintos a 20 px de
  distancia. La referencia elegida ahora vive en ComparadorDias y alimenta a ambos (grafico y
  BrechaDelDia recibe `contra` por prop); el titulo la sigue ("con la cuota" / "con lun 10").
- Archivos: `pages/monitor/MonitorCompareChart.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: preview contra el monitor real de Filete con los tres chips (cuota, lun 10, mar
  11); tsc, eslint y vitest de monitorCompare (51/51) limpios.
- Estado: HECHO. Merge squash a main `f9089e91`.

---

## 2026-08-13 - claude - Monitor ronda 2: pie sin alarma nocturna, estado por maquina y record (#507)

- Hecho: con el turno cerrado el pie dice "Turno cerrado - ultimo dato de las HH:MM" en tono
  neutro (antes alarmaba de noche con "la sincronizacion puede estar detenida"; la alerta ambar
  queda solo con turno vivo). "Por maquina" ahora dice el estado de AHORA ("· produciendo" o
  "parada · causa (hace X)") usando currentReason/currentSinceAt, sin puntos con turno cerrado.
  Linea de record bajo "Vas a" cuando el ritmo de hoy supera al mejor turno reciente.
- Archivos: `PublicShiftMonitorPage.tsx`.
- Verificación: tsc y eslint limpios; preview contra Filete cerrado (pie neutro, sin puntos rojos)
  y turno vivo de Yal (record real: 44,9 vs 41,8 pz/min). Rama "parada · causa" por maquina no
  se pudo ver en vivo (las 3 Baader producian) — replica el patron ya probado del "Ahora mismo".
- Estado: HECHO. Merge squash a main `371310d6`.

---

## 2026-08-13 - claude - Comparador v3: hoy contra UNA referencia con la brecha pintada (#505)

- Hecho: el modo diferencia dibujaba hasta 6 deltas contra el cero y la cuota "caia" aunque el
  turno fuera bien. Ahora hoy y la referencia elegida por chip (cuota o un dia anterior) SUBEN
  las dos, con la brecha sombreada (rojo abajo, verde arriba, cruce interpolado) y la cuota
  aplanandose en las paradas de convenio. El dia que mas llevaba a esta altura lleva "· mejor"
  en su chip. La tabla de dias queda solo informativa (la seleccion vive en los chips).
- Archivos: `pages/monitor/MonitorCompareChart.tsx` (reescrito), `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc, eslint y vitest de monitorCompare (51/51) limpios; preview contra el turno
  real de Filete (cuota y mar 11), 390px, claro y oscuro.
- Estado: HECHO. Merge squash a main `d0338c51`.

---

## 2026-08-12 - claude - Sin "Ahora mismo" con turno cerrado y produccion real en el veredicto (#503)

- Hecho: con el turno cerrado, el bloque "Ahora mismo — Linea detenida" pintaba alarmante una
  noche normal (esperable tras el cierre); ahora solo aparece con el turno en curso. Ademas el
  veredicto del comparador dice cuanto de la altura del turno fue produccion real, ej. "Se
  lograron 4.486 pz en 8 h 20 de turno, de las que 5 h 40 fueron de produccion real" (solo cuando
  produccion < altura del turno).
- Archivos: `PublicShiftMonitorPage.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc y eslint limpios; preview contra Filete cerrado y turno vivo de Yal.
- Estado: HECHO. Merge squash a main `2764cd5e`.

---

## 2026-08-12 - claude - La cabecera del turno vivo mostraba el ultimo sync, no el cierre previsto (#501)

- Hecho: en el monitor publico, con el turno en curso la cabecera mostraba el ultimo intervalo
  sincronizado como hora de termino ("15:00-21:52" con la linea aun produciendo); ahora muestra
  el cierre previsto ("15:00 -> 23:57") con marca "est." (sin marca si esta fijado a mano). Turno
  cerrado sigue mostrando el rango real. De paso, "A donde se va el tiempo" pasa a decir "de
  operacion" en vez de "de turno" para no repetir la palabra que usa el comparador de tiempo corrido.
- Archivos: `PublicShiftMonitorPage.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc y eslint limpios; preview contra turno vivo de Yal y Filete cerrado, 390px,
  ambos temas.
- Estado: HECHO.

---

## 2026-08-12 - claude - El header de movil montaba los botones sobre el titulo (#478)

Orel, con captura: *"mira se ven todos montados los botones ojo con el orden en el modo movil"*.

- **No era truncado feo, era DESBORDE.** El header sticky es UNA fila: titulo en `flex-1 min-w-0`
  y acciones en `shrink-0`. Los 7 botones ocupan ~290 de los 351 px utiles, asi que al titulo le
  quedaban ~60 — y como sus etiquetas (turno, horario) tambien son `shrink-0`, **no se recortaban:
  se salian del contenedor**, y los botones, que se pintan despues, quedaban ENCIMA.
  ⚠ Patron transferible: `min-w-0` en el contenedor no alcanza si los hijos son `shrink-0`. O se
  les saca el `shrink-0`, o el contenedor lleva `overflow-hidden`, o se cambia el layout.
- **Arreglo**: en movil dos filas (`basis-full sm:basis-auto` en los dos grupos) — arriba QUE TURNO
  estas mirando, abajo QUE PODES HACER con el, pegado al borde derecho. Dentro de la 2a fila:
  primero las acciones sobre ESTE turno (clasificar, compartir, exportar) y al final
  Anterior/Siguiente, que es irse a otro. `overflow-hidden` en el grupo del titulo como cinturon.
- **Desktop no cambia**: los dos grupos siguen en una fila de 46 px (medido antes y despues).
- Archivos: `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` (solo clases).
- Verificacion en prod (`buildSha` = `02f1637`), 375px, claro y oscuro: **0 elementos fuera del
  header** medidos con `getBoundingClientRect` sobre TODOS sus descendientes, y sin scroll
  horizontal (`scrollWidth === clientWidth === 375`). Caso peor probado inyectando por DOM un
  titulo largo ("Turno 1 Lunes — Madrugada extendida") mas un badge extra: sigue sin desbordar.
  ⚠ Medir el desborde con el DOM y no a ojo fue lo que dio la certeza: a ojo "se ve bien" no
  distingue entre recortado y tapado.
  tsc 0, eslint 0 nuevos, 1.162 tests OK.
- Estado: HECHO.

## 2026-08-12 - claude - Corte de control a mitad de turno + las 12 compuertas directas (#476)

Orel: *"dale con el corte de control a mitad de turno y en gates debemos poder setear directo las
12 gates ... sin ir a la configuracion de grader"*.

- **Corte de control** (`MidShiftCheckCard` + `graderMidShiftCheck.ts`): con el turno EN CURSO y un
  Excel cargado —aunque cubra un tramo— dice qué calibre viene apretado, cuántas piezas de ese
  calibre quedan al ritmo medido, y qué gate mover. Si el Excel quedó viejo (>90 min) eso se dice
  PRIMERO: todo lo demás describe un turno de hace horas. El Resumen lleva un aviso de una línea
  que abre Gates — la tarjeta vive donde se actúa, pero enterrada ahí Control de Producción no la ve.
  Reusa `compareGatesVsHistory`/`suggestGateMoves` de #474 a propósito: los umbrales tienen que ser
  los mismos en las tres vistas (post-turno, pre-turno, mitad de turno). NO promete "piezas mejor
  clasificadas" — a dónde caen las que desbordan no lo dice el Excel.
- **Las 12 compuertas directas**: la tabla ya estaba en Gates pero detrás de un acordeón cerrado Y
  una sub-pestaña. Ahora abre por defecto y en "12 Gates" (prop `defaultTab`).

### ⚠ Dos cosas para no repetir

1. **CORRECCIÓN a #474.** Ahí escribí que "la mayoría de los turnos no tiene `configHistory`, la
   config vive en plantillas". **Es falso.** Lo medí con `collection('graderShifts').get()`, que
   devuelve 2 turnos — y en Firestore **una subcolección puede vivir bajo un documento padre que NO
   existe**, así que esa consulta no la ve. Con `collectionGroup('configHistory')` son **386
   turnos**. Regla general: para contar subcolecciones usar `collectionGroup`, nunca
   `collection(padre).get()`. El fallback a plantilla sigue siendo necesario (un turno nuevo empieza
   sin snapshot) pero por esa razón, no por la que escribí.
2. **Snapshots fantasma de "0 cambios".** El editor de gates publica con debounce apenas monta —es
   "esto es lo que muestro", no "el usuario cambió algo"— y `saveConfigSnapshot` NO puede
   distinguirlo: sin snapshot previo el diff es `[]` por construcción, así que su guarda de "sin
   cambios" no aplica y escribe igual. Al abrir el panel por defecto, CADA visita a Gates dejaba un
   snapshot firmado por quien pasó. Cortado con una huella de la última emisión (la primera tras
   montar nunca se guarda). En prod hay **125 de 659** snapshots así, de antes.
   ⚠ Dos de esos 125 los generé YO en esta sesión antes de detectarlo: `2026-08-11__Turno 2`
   (2026-08-12T00:49Z) y `2026-08-07__Turno día` (2026-08-12T00:01Z). No los borré —borrar datos
   de producción es decisión de Orel—; quedan anotados acá.

- Archivos: `services/grader/graderMidShiftCheck.ts` (nuevo, puro),
  `components/grader/MidShiftCheckCard.tsx` (nuevo), `AnalisisGraderGatesConfigPage.tsx`
  (prop `defaultTab`), `AnalisisGraderTurnoPage.tsx`, `GateChangeModal.tsx`,
  `GatesHistoryHintCard.tsx` (comentarios corregidos).
- Verificación: 15 tests nuevos sobre el reparto REAL del `2026-08-11 Turno 2`. En el navegador,
  forzando el turno a "en curso": estima ≈5.907 piezas por pasar y ≈3.484 del calibre apretado, y
  los dos movimientos llevan el ratio de 2,4× a 1,4×. El aviso del Resumen abre Gates. Con el turno
  cerrado no aparece ninguno. Pruebas revertidas. Confirmado que ya no se escriben snapshots al
  abrir Gates. Claro, oscuro y 375px. tsc 0, eslint 0 nuevos, 1.162 tests OK.
- Estado: HECHO (`3899d2a` en prod).
- Sigue: el camino C de la propuesta — aviso por Telegram al detectar saturación, que ahora sí
  tiene de dónde salir (reusa el canal de los briefs de turno).

## 2026-08-11 - claude - Gates: setear sin Excel, imputaciones a "¿Que hacer?", aviso por historial (#473, #474)

Orel: *"dale con las dos y pensemos como podriamos ayudar a control de produccion a corregir los
gates segun lo q vaya pasando por la grader"*.

### #473 - dos mudanzas
- **Gates ya no exige el Excel**. Estaba DESHABILITADA sin el archivo: configurar las compuertas,
  que es trabajo de ANTES del turno, pedia el Excel que recien existe al CERRARLO. Los 4 campos
  que pedia Orel (calibre, calidad, conservacion, producto) YA existian, tapados detras de eso.
- **Las imputaciones se mudaron de "Linea" a "¿Que hacer?"** y suman al badge. Eran lo unico de
  Linea donde el tecnico ESCRIBE, enterrado bajo tres graficos. "¿Que hacer?" tambien se habilita
  sin Excel si hay datos del sensor: Filete y Eviscerado llegan con el turno entero sin causa.
- ⚠ El panel se monta SIEMPRE y se oculta por CSS: es el quien carga las anotaciones y publica el
  pendiente, asi que con render condicional el badge marcaria 0 hasta entrar a la pestaña.

### #474 - "¿Esta config aguanta lo que suele venir?"
Analisis de saturacion corrido al ANTES: compara las gates asignadas contra el reparto de
calibres de los turnos anteriores. Acusa el caso REAL de Chonchi: el 8-10 lb es el 55% de la
produccion y la config le deja 3 de 12 gates (2,2x), mientras el 2-4 lb tiene 2 gates para el 1,3%.

**Tres cosas que sin mirar los datos reales habrian salido mal** (valen para cualquier feature
que agregue turnos historicos):
1. **El calibre viene SIN NORMALIZAR de Matrix**: "8-10 lb" en agosto y "8 - 10 LB" el 3 de
   agosto. Agrupando por el string crudo el historico ve 10 calibres en vez de 5 y TODOS los
   porcentajes salen mal. Normalizar con `calibreKey()` (lowercase + sin espacios).
2. **La config de gates NO vive en el turno**: la mayoria de los turnos no tiene `configHistory`
   — se guarda como PLANTILLA (`graderGatesTemplates`) y se reusa. Leyendo solo el snapshot, la
   tarjeta no aparecia nunca. Regla de fallback: "Plantilla 1" o la primera, igual que el editor.
3. **`GateChangeModal` tenia el mismo agujero**: sin snapshot abria con el selector de gates y
   NINGUN campo abajo. Arreglado en la raiz -> ademas revive el boton "Cambiar gate" del
   historial, que estaba muerto justo en los turnos donde todavia se podia cambiar algo.

Decisiones de criterio: compara por CALIBRE y no por calibre x calidad (`calibreDistribution`
guarda solo el calibre); NO filtra por lote (`lotsInShift` esta vacio en 36 de 37 turnos reales)
y por eso DICE que turnos y fechas miro; nunca deja un calibre en 0 gates aunque el ratio lo
justifique; deshace un movimiento que satura al donante; excluye el propio turno del historico.

- Archivos: `services/grader/graderCalibreHistory.ts` (nuevo, puro),
  `components/grader/GatesHistoryHintCard.tsx` (nuevo),
  `components/grader/modals/GateChangeModal.tsx`, `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 22 tests nuevos sobre los NUMEROS REALES de produccion (6 turnos de Chonchi + la
  plantilla vigente), no datos inventados. En prod (`buildSha` = `fd67a19`) la tarjeta acusa el
  8-10 lb y el modal abre pre-rellenado. En Yal no aparece. No se registro ningun cambio de gate:
  eso es decision de Orel. Claro, oscuro y 375px. tsc 0, eslint 0 nuevos, 1.147 tests OK.
- Estado: HECHO (#473 en `8cb1427`, #474 en `fd67a19`).
- Sigue: los otros dos caminos de la propuesta, sin construir — (B) corte de control a mitad de
  turno con Excel parcial (la app YA entiende cobertura parcial), y (C) aviso por Telegram al
  detectar saturacion, que depende de B. Propuesta visual completa:
  https://claude.ai/code/artifact/046435ab-b88f-4f0c-9c8a-eef62b0302d9

## 2026-08-11 - claude - Resumen a ancho completo y Calidad+Timeline juntas (#471)

Orel, mirando el resultado de #469: *"el resumen deberia ocupar toda la pagina verdad no estar
recortado"* y *"calidad y timeline deberian estar en la misma pestaña para al seleccionar la
calidad las muestre en el timeline"*. Las dos observaciones eran correctas — dos regresiones
que introdujo #467/#469.

- **El Resumen se veia recortado**: al mudar "¿Que hacer?" a su pestaña quedo vivo el grid de 3
  columnas. El contenido seguia en `col-span-2` y la tercera columna quedaba VACIA → media
  pantalla de aire al lado de la tarjeta. Ahora es una sola columna a ancho completo (medido:
  1189 de 1189 px utiles).
- **Calidad y Timeline vuelven a ser UNA pestaña**. ⚠ La leccion, para no repetirla: `selectedCauses`
  es estado COMPARTIDO entre `P0CausesPanel` y `ShiftTimelineView`. Separar dos bloques que
  comparten estado no los separa: mata la interaccion, porque el efecto queda en una pestaña
  que no estas mirando. **Antes de mover un bloque a otra pestaña, revisar que estado comparte
  con lo que deja atras.** Queda comentado en el JSX de la vista `calidad`.
- **Efecto lateral que casi se escapa**: `handleExportPdf` saltaba a `setActiveView('timeline')`
  para montar el grafico. Con la pestaña borrada el PDF habria salido SIN grafico y en silencio
  (el codigo ya tiene un `logger.warn` para ese caso, no un error). Ahora salta a `calidad`.
- Archivos: `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` (unico).
- Verificacion: turno `2026-08-03__Turno 1` con Excel del Grader, local contra Firestore de prod.
  Pestañas = `Resumen · Calidad · Gates · Linea · ¿Que hacer?`. Al marcar "Fuera de limites" el
  timeline muestra `Fuera de limites 347 · 347 pzas con peso` con el scatter pintado. Claro,
  oscuro y 375px. tsc 0, 1.125 tests OK. Desplegado y confirmado: `buildSha` = `70374cd`.
- Estado: HECHO.
- Sigue: dos preguntas de Orel sin construir todavia — (a) setear gates: el editor YA existe
  (`ShiftConfigPanel` → `GateChangeModal`, con calidad/calibre/conservacion/producto), pero solo
  aparece si `configSnapshots.length > 0` y con el turno `live`; el hueco real es el turno SIN
  config, que es justo cuando querrias setearla. (b) separar "Linea": son 4 tarjetas y una de
  ellas (`SensorStopsCausePanel`, las imputaciones) es CARGA DE DATOS mezclada con analisis.
- Pendiente menor visto de paso (no tocado, fuera de alcance): a 375px en `P0CausesPanel` el
  chip `paraguas · 6 sub` se superpone con `89.7% del P0`.

## 2026-08-11 - claude - Pestaña "Calidad" y herramientas fuera del Resumen (#469)

Orel: *"si datos grader deberiamos tambien tener en las pestañas lo ordenado o no? como la linea"*.

- **El diagnostico**: "Linea" se lee ordenada porque contiene UNA sola cosa (todo Shoplogix junto).
  El Resumen mezclaba TRES: el titular del turno, el analisis del Grader (P0, calibres, calidad,
  lotes) y herramientas (compartir, QR, IA).
- **Regla del modulo, ya explicita en el codigo**: una pestaña = una pregunta.
    resumen ¿como fue? · calidad ¿por que se rechazo? · timeline ¿cuando paso? ·
    gates ¿como estaban las compuertas? · linea ¿como estuvieron las maquinas? · accion ¿que hago?
- **Calidad** es el espejo de Linea: se lleva `P0CausesPanel`, `ShiftBreakdownsCard` y el analisis
  IA. Sin Excel queda deshabilitada con su motivo, como Timeline y Gates.
- **Las herramientas salen de las pestañas**: compartir turno y link/QR del monitor se abren con un
  boton en la barra superior (junto a exportar). ⚠ Los paneles siguen renderizandose abajo —estan
  en ramas distintas del JSX y unificarlos en un modal movia ~150 lineas—, asi que el toggle hace
  **scrollIntoView**: un panel que aparece fuera de la vista se lee como un boton que no responde
  (lo mismo que paso en #467 con las pestañas debajo del contenido).
- El aviso de config desalineada se QUEDA en el Resumen: afecta a como leer todo el turno.
- Verificacion: en el navegador con datos de prod — 6 pestañas; el Resumen ya no trae
  P0/compartir/monitor/IA; Calidad muestra las causas; el boton despliega las herramientas desde
  cualquier pestaña. 1.125 tests, tsc limpio. Bundle `94f045e`.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Pestañas siempre presentes + "¿Que hacer?" como pestaña (#467)

Orel: *"deberiamos establecer un estandar"* y *"veamos como ocultar o agregarlo como una pestaña
mas el que hacer"*. Cierra el estandar que empezo la tarjeta de #465.

- ⚠⚠ **Las pestañas vivian DENTRO de `{summary && shiftWindow && (...)}`**: un turno sin Excel no
  mostraba ninguna. Dos navegaciones distintas para la misma pantalla, y sin forma de saber que
  esas vistas existen. **Tercera aparicion del mismo patron hoy** (#438 la tarjeta invisible en
  Filete, #455 la navegacion): envolver estructura en el gate de un dato la hace desaparecer.
- Ahora la barra va fuera del gate y ANTES del contenido. Las vistas que necesitan Excel salen
  DESHABILITADAS con el motivo (`title`): Timeline/Gates "Necesita el Excel del Grader"; ¿Que
  hacer? "Las acciones se calculan con el Excel". Resumen y Linea quedan usables — sin Excel las
  dos muestran el estado de las maquinas, asi que en vez de dejar Linea muerta se la deja abrir.
- **"¿Que hacer?" pasa de tercera columna permanente a pestaña propia**: gana ancho para leerse y
  el Resumen recupera el ancho completo. El tab lleva el CONTADOR de acciones para que no se
  pierda de vista (sin eso, mover el panel a una pestaña lo volveria invisible).
- ⚠ Los modales del panel se quedan montados en el Resumen: `handleActionTrigger` puede
  dispararlos desde cualquier vista.
- ⚠ Al mover el bloque quedo DESPUES del contenido en el JSX y las pestañas aparecian debajo de la
  tarjeta. Se veia solo mirando: el DOM las tenia y el test de existencia pasaba igual.
- Verificacion: en pantalla con datos de prod — con Excel 5 pestañas y "¿Que hacer? 5"; sin Excel
  la misma barra con 3 en gris. 1.125 tests, tsc limpio. Bundle `9139cdf`, confirmado en prod.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - La tarjeta de turno se agrupa por PREGUNTA, no por fuente (#465)

Orel: *"el de grader esta todo como desordenado, no se como explicarlo"*. Rediseño elegido por el
en un mockup de 3 opciones (opcion B, "Dos preguntas"); la directora-creativa lo produjo con los
dos estados lado a lado y medicion de contraste.

- **El diagnostico**: la tarjeta agrupaba por PROCEDENCIA (columnas "Shoplogix" y "Grader") — 12
  numeros ordenados por algo que no sirve para decidir. Y los dos estados eran disenos distintos,
  asi que cargar el Excel se sentia cambiar de pantalla.
- Ahora: izquierda *cuanto salio*, derecha *donde estuvo la limitacion*. La mitad derecha es el
  MISMO componente en ambos estados (`ShiftMachinesHalf`) — es lo que da el parentesco.
- Jerarquia: el numero grande pasa a ser el del turno (13.366 pz; antes el `text-5xl` se lo llevaba
  el P0 2,3%). El uptime sube al nivel de la produccion: es el argumento de Mantencion. La
  composicion Baader vs linea manual sube del pie (explica por que piezas ≠ ciclos).
- Fuera: fondo tintado de toda la tarjeta y borde de 2 px de color (el estado va en el chip),
  encabezados por fuente (al pie como procedencia), ciclos/hr suelto y "maq. con datos".
- ⚠ Los tokens `--ink-*` YA EXISTIAN (derivados contra el peor fondo, con variante oscura). Empece
  a crear `--ok-ink/--warn-ink/--bad-ink` y lo revertí al encontrarlos: habria sido la misma regla
  en dos lugares (el error de #453). **Buscar el token antes de crearlo.**
- ⚠ La barra de uptime usa el color del UPTIME, no el del veredicto combinado: con 82% de uptime y
  ritmo bajo salia ambar con el numero verde al lado. Se detecto MIRANDO la pantalla.
- Verificacion: en pantalla con datos de prod — oscuro, claro y 375 px, en los dos estados (11-ago
  con Grader / 10-ago solo Shoplogix). 1.125 tests, tsc y eslint limpios. Bundle `31547dc`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **estandarizar las pestañas** (Resumen/Timeline/Gates/Linea aparecen y desaparecen segun
  haya Excel; deberian estar SIEMPRE, con las que dependen del Excel deshabilitadas y el motivo).
  Es la otra mitad del "estandar" que pidio Orel.

---

## 2026-08-11 - claude - El chip decia "Turno dia" para un turno llamado "Turno 2" (#463)

Orel: *"el mismo turno se ve de dos formas... el de grader esta todo como desordenado"*.

- **Cadena del bug** (el "desorden" tenia una causa de datos, no solo estetica):
  1. El chip de turno vigente cae a un FALLBACK por schedule cuando ningun doc de Shoplogix
     contiene la hora actual.
  2. Ese fallback filtraba por una lista fija elegida con `isClassificationPlant` — que mide OTRA
     cosa — y para Chonchi daba `['Turno dia','Turno noche']`: nombres que la planta DEJO DE EMITIR
     en 2026-05 y que sobreviven en el schedule solo como ventanas anchas para Excels viejos.
  3. "Turno dia" es 07:00-19:00 → a las 16:00, con el Turno 2 real ya cerrado (07:15-15:00), el chip
     anunciaba "En curso · Turno dia".
  4. Al tocarlo iba a `2026-08-11__Turno dia`: la MISMA jornada sin el Excel (guardado bajo
     "Turno 2"), con el cartel "Solo Shoplogix · Sin Excel del Grader" ofreciendo cargar uno ya
     cargado.
- Fix: `bySpecificity()` — el fallback recorre el schedule ordenado por ventana MAS CORTA primero.
  A las 16:00 gana "Turno 2" (8h15) sobre "Turno dia" (12h). Sin listas de nombres que mantener.
- ⚠⚠ **Tercera vez en el dia que `isClassificationPlant` decide algo que no le corresponde** (#455
  la navegacion, #463 el nombre del turno). Si aparece en un `if`, sospechar: solo significa "esta
  linea clasifica por calibre/calidad".
- Verificacion: 1.125 tests (4 nuevos con el schedule real de Chonchi, comparando el antes/despues
  a las 16:00) + navegador. Bundle `71d48e1`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **rediseño de la tarjeta de turno**. Orel eligio la opcion B del mockup ("Dos preguntas":
  izquierda cuanto salio, derecha donde estuvo la limitacion; la mitad derecha IGUAL con o sin
  Grader). Mockup: `scratchpad/tarjeta-resumen-turno.html` + artifact. Incluye estandarizar las
  pestañas (que existan siempre, deshabilitadas con el motivo cuando falta el Excel) y la
  correccion de contraste de los semanticos en tema claro (miden 2,7-3,1:1 como texto).

---

## 2026-08-11 - claude - La linea de "No aplicable" estaba en la tarjeta equivocada (#461)

Orel abrio el turno del 11-ago y la linea que agregue en #459 NO estaba.

- Causa: la puse en `GraderTurnoDetailView` ("Piezas totales"), pero la vista de turno CON Grader
  pinta el `HeroScorecard` — el bloque "13.366 piezas · Marelec". Dos tarjetas distintas para el
  mismo dato, y elegi la que esa vista no muestra.
- ⚠⚠ La leccion, otra vez la misma: **di por bueno #459 sin mirar la pantalla**. tsc, 1.121 tests y
  el deploy en verde, y el cambio publicado donde nadie lo veia. Es el mismo patron de #438 (la
  tarjeta invisible en Filete). Cuando el entregable es algo que se VE, no esta hecho hasta verlo.
- Ahora sale bajo el total: "+ 163 no aplicables · Matrix: 13.529", con el detalle en el tooltip.
- Verificado EN PRODUCCION con screenshot (bundle `7773690`, con la sesion de Orel en el navegador).
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Los registros "No aplicable" del Grader (#459)

Orel cargo el Excel del 11-ago y no le cuadraba: el Matrix decia *"se han recuperado 13.529
registros"* y la app mostraba 13.366 piezas.

- **Diagnostico**: las 163 de diferencia son filas con `Cantidad de piezas` en 0 y `Peso de las
  piezas` en "No aplicable" — eventos que el grader registra SIN pieza detras. El parser las
  descartaba en silencio (`if (pieces <= 0) continue`), asi que la diferencia parecia produccion
  perdida. **El letrero del Matrix cuenta REGISTROS; la app cuenta PIEZAS.**
    13.529 registros = 13.366 piezas + 163 no aplicables
- Hecho: se separan en `notApplicableRecords` **con su timestamp** (no entran a `pieceRecords`:
  valen 0 piezas y los arrastrarian a cada calculo), se **reparten por turno** con la misma regla
  que las piezas, el summary guarda el conteo y la tarjeta "Piezas totales" lo muestra con el
  numero del Matrix al lado. El wizard avisa al cargar.
- Verificacion: 1.121 tests (7 nuevos — 4 del parser con la cabecera REAL de Chonchi, incluido uno
  que comprueba que piezas + no aplicables reconstruye el numero del letrero). Bundle `ac1b96e`.
  El doc del turno ya cargado se completo a mano con los 163 para que cuadre sin recargar el Excel.
- ⚠ Como se consiguio el dato: los Excel llegaron por correo y **el conector M365 trunca a 200.000
  caracteres** (del pieza-a-pieza solo llego el 17,6%). Sirvio igual porque el patron aparece en
  cualquier tramo, pero para contar el total hay que bajar el archivo. Un SUBAGENTE hizo esa lectura
  para no gastar el contexto principal — patron a repetir con adjuntos grandes.
- ⚠ Cabecera real del pieza-a-pieza de Chonchi (distinta del P0):
  `Fecha | Hora | Peso de las piezas | Cantidad de piezas | Lote | Gate | Calidad | Conservacion |
  Calibre | Producto | Turno`. El parser mapea por NOMBRE, no por posicion, asi que no le afecta.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **Orel confirma en pantalla** que la tarjeta muestra "+163 no aplicables (Matrix: 13.529)";
  no se pudo ver en el navegador de pruebas.

---

## 2026-08-11 - claude - Fuera el bucket Unscheduled del carrusel de turnos (#457)

Pedido de Orel tras ver que en Filete el "turno anterior" que ofrecian las flechas era el bucket.

- `Unscheduled` NO es un turno: es donde Shoplogix deja lo que cae fuera de las ventanas
  configuradas. Desde #451/#453 esa produccion se atribuye al turno CONTIGUO, asi que ofrecerlo como
  destino llevaba a una pantalla con piezas que YA estan contadas en el turno de al lado.
- Se conserva UNA excepcion: si es el que se esta mirando (si no, la vista abierta no se encontraria
  en la cadena y las flechas saldrian de posicion).
- Lo que quede sin atribuir (un dia entero sin turnos configurados) se sigue viendo en la MATRIZ,
  que es donde el bloque suelto SIRVE: es la señal de que falta configurar ese turno en Shoplogix.
- Verificacion (local, datos de prod): filete 10-ago Anterior pasa de "mismo dia · Unscheduled" a
  "2026-08-08 · Turno Dia" (el 09 es domingo sin proceso); eviscerado sin cambios. Bundle `1b77b44`.
- ⚠ Leer los botones por su `title`, no por `innerText`: el texto va con `hidden md:inline` y en
  pantalla angosta el boton no tiene texto.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Anterior/Siguiente no funcionaban en Filete ni Eviscerado (#455)

Orel: *"los botones de anterior y siguiente (turno) no funcionan en filete ni eviscerado; debo poder
cambiar de turno tanto en el de monitoreo como en el analisis de turno"*.

- **Causa en Analisis de Turno** (verificada leyendo `disabled`/`title`, sin depender de clics): los
  dos botones estaban DESHABILITADOS. `setAdjacentShifts(idx === -1 ? {prev:null,next:null} : ...)`
  anulaba la navegacion entera si el turno abierto no figuraba en la cadena. Y no figuraba:
  · EVISCERADO — la cadena solo consultaba Shoplogix con `isClassificationPlant === false`, que mide
    OTRA cosa (si la linea clasifica por calibre/calidad). Eviscerado SI clasifica → navegaba solo
    entre dias con Excel del Grader, y los 5 Excel que hay ni tienen `plantLineId`. Cadena vacia.
    Ahora usa `shoplogixEnabled`, que es justo "esta linea tiene datos de Shoplogix".
  · FILETE — basta que la etiqueta de la URL no calce exacto con la de Shoplogix ("Turno dia" del
    Grader vs "Turno Dia"). Ahora, si el turno abierto no esta en la cadena, **se lo INYECTA** en su
    lugar cronologico: no ubicarse a uno mismo no es motivo para encerrar al usuario en un turno.
- **Monitor publico**: el turno mirado pasa de `useState`+refs a la URL (`?turno=<shiftDocId>`) y el
  indice se DERIVA. Desaparece el efecto que restauraba la posicion y peleaba con la navegacion; la
  eleccion sobrevive a recargas y el turno queda **compartible**.
- Verificado (local, datos de prod): filete Anterior "mismo dia · Unscheduled" / Siguiente
  "2026-08-11 · Turno Dia"; eviscerado Anterior "mismo dia · Turno 2" / Siguiente "2026-08-11 ·
  Turno 2" — antes los cuatro deshabilitados. Monitor con `?turno=2026-08-10_Turno Dia` abre ese
  turno (4.915 pz). Bundle publicado `b1cbea4`.
- ⚠⚠ **GOTCHA DE VERIFICACION que costo una hora**: la pestaña de prueba corre en SEGUNDO PLANO y
  React difiere el flush de los updates. Sintoma engañoso: la URL cambia, `console.log` del handler
  aparece, y la vista NO se actualiza — parece un bug de la app y es del entorno. Se detecta porque
  al RECARGAR con el estado en la URL sí se ve. Verificar por `disabled`/`title`/atributos (que se
  leen del DOM ya renderizado) en vez de por el efecto de un clic.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **Orel confirma en uso real** el sintoma "toco el boton y no pasa nada" del monitor, que no
  se pudo reproducir de forma fiable. Menor: en Filete el turno "anterior" que ofrece es el bucket
  `Unscheduled`; ahora que su produccion se atribuye al turno, quiza convenga sacarlo del carrusel.

---

## 2026-08-11 - claude - La matriz alineada con la regla de continuidad (#453)

Orel: *"alinea la matriz tambien con la regla nueva"*. Con esto las CUATRO superficies (monitor
publico, brief de Telegram, vista de turno y matriz) deciden igual de quien es un bloque fuera de
horario.

- Hecho: la matriz atribuye por BLOQUE y reusa `esColaDeEsteTurno`. `MAX_ADJACENCY_MIN` (Infinity)
  ELIMINADO — la distancia la fija `MAX_CONTINUIDAD_MS`, una sola constante compartida. Los
  candidatos pasan a ser los turnos del mismo dia Y los ADYACENTES (la continuidad cruza medianoche:
  las 23:30 son el arranque del turno de las 00:00, no la cola de uno que cerro a las 15:00); con eso
  sobra la rama especial de "dia sin turnos".
- ⚠⚠ Dos correcciones al umbral que salieron de tests reales que iban a romperse:
  1. **ENCADENAR los tramos antes de decidir**: la produccion real viene con huecos. Yal 10-jul son
     2.296 pz a las 14:05, 14:40 y 15:00 antes de un turno de las 15:15; tramo a tramo, la primera
     quedaba a 65 min y se perdia entera.
  2. **60 -> 90 min**: con 1 h ese mismo bloque quedaba fuera POR CINCO MINUTOS. Lo que la regla debe
     excluir esta a otra escala (14 h el caso Chonchi, 10 h el 02-ago). Se cambio en los DOS lados.
- ⚠ Cambio de comportamiento: un dia SIN turnos configurados ya no se cuelga del turno de otro dia
  (Chonchi 02-ago, 293 cic a 10 h) — el bloque queda VISIBLE. Revierte en parte la decision del
  03-ago pero solo para lo de FUERA: lo que cae DENTRO de una ventana se sigue atribuyendo.
- ⚠ El test del caso Yal 03-ago fijaba un escenario RECORTADO (un solo turno 00:06-07:18). Contra
  Firestore ese dia hubo 3 turnos y la produccion de 08:00-12:12 cae DENTRO del Turno 1: no se
  afecta. Se reescribio el test con los turnos reales.
- Verificacion: 219 tests functions + 23 matriz, tsc/eslint limpios. **Impacto medido sobre agosto
  completo contra Firestore: 0 piezas dejan de atribuirse** (chonchi 4.258, yal 3.395, filete 2.661
  siguen igual) — no mueve totales, corrige a QUIEN se asignan. Bundle publicado `dc288c3`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: nada de esta feature. Queda de la sesion anterior ver un cierre de turno REAL de Filete
  (que el brief espere la cola y anuncie el total completo).

---

## 2026-08-11 - claude - La cola fuera de horario se la llevaba cualquier turno del dia (#451)

Orel lo vio en Eviscerado: *"para el turno noche de ayer conto unos minutos de las 7 y tanto am y
despues de las 9 y tanto de la noche... los mostro en el grafico tambien y conto piezas demas"*.

- Causa: para decidir si un tramo del `Unscheduled` era la cola del turno bastaba con que NO cayera
  dentro de la ventana de NINGUN turno. Como esos bloques no caen en ninguna, **cualquier turno del
  dia se los quedaba**. El turno noche (21:15→05:00) sumaba 1.317 pz ajenas —1.048 de las 07:15,
  cola del turno que cerro a esa hora, y 269 de las 17:00— y mostraba **13.487 en vez de 12.170**.
  La barra de las 7 AM en el grafico venia de `operacionReal`, que extiende la ventana con esos
  rangos y corre haya Grader o no (por eso se veia en Eviscerado, que no usa el scorecard).
- Regla nueva de Orel: la cola cuenta **solo si es continua al turno**, no piezas de horas despues.
  CONTINUIDAD (≤1 h) + CERCANIA (ningun otro turno mas cerca). Un tramo va a UN turno, nunca a dos
  ni a ninguno: el empate se desempata a favor del que ya CERRO en vez de descartarse.
- ⚠ La distancia se mide del **BORDE del tramo**, no de cada intervalo suelto: un bloque 07:00→07:30
  antes de un turno de las 08:00 esta a 30 min, no a 60. Medirlo mal descartaba arranques
  anticipados legitimos — lo destapo el test que los fija (habria sido una regresion silenciosa).
- Archivos: `functions/publicMonitor.js` (monitor + brief) y `apps/pwa/src/hooks/useShiftOutsidePieces.ts`
  (que ademas ni miraba los otros turnos) + `graderUnscheduledLoad.loadDayShiftWindows` (1 lectura).
- Verificacion: 219 tests functions + 23 front (7 nuevos). Contra Firestore REAL del 10-ago:
  noche 12.170+0, Turno 1 Lunes 9.543+689 (07:25-07:50), Turno 2 9.902+56 (17:10-17:20),
  Filete 4.410+505 (sin cambios). En pantalla (local, datos de prod): 12.170, rango 21:15–05:00,
  operacion real 21:30–04:50, sin rastro de las 7 AM.
- Estado: HECHO — mergeado (`d114da2`) y desplegado.
- Sigue: **decision de Orel** — la MATRIZ quedo con la regla vieja (`MAX_ADJACENCY_MIN = Infinity`,
  decision suya del 03-ago). Alinearla moveria solo 65 pz en todo agosto, pero choca con el caso
  Yal 03-ago de los 1.835 cic que el decidio atribuir. No se toco por eso.

---

## 2026-08-11 - claude - Avisos de turno de Filete por Telegram + el brief anunciaba menos piezas (#449)

Orel pregunto si se podian mandar los avisos por WhatsApp. Respuesta: se puede, pero el costo es
el TRAMITE con Meta (cuenta business verificada, numero dedicado que se quema, plantillas
pre-aprobadas, opt-in por persona, cobro por mensaje) — 1-2 semanas casi sin programar. Eligio
encender Telegram, que da lo mismo hoy y gratis.

**El hallazgo**: encender el canal NO bastaba. `componerBriefFinTurno` ya existia y estaba
configurado para Filete (umbral 200 pz), pero:

- se disparaba con el horario oficial (15:30 + 10 min) **con la linea todavia produciendo**;
- sumaba **solo el doc del turno**. Evidencia dura: el brief de hoy ya salio por push a las 15:40
  anunciando **4.338 piezas** cuando la jornada termino en **4.915** — 12% menos.

- Hecho:
  - `sumarColaAMaquinas` (publicMonitor.js): suma la cola fuera de horario a cada maquina y
    devuelve el desglose. Reusa `loadOutsideShiftProduction` con su dedupe por (maquina, timestamp).
  - El brief **espera a que la linea deje de producir**; tope de 2 h por si el sensor queda colgado.
  - Mensaje: desglose "4.410 dentro del horario + 505 despues (15:40-16:30)" y horario hasta la
    ultima pieza real (decia "hasta 15:30" con produccion hasta las 16:30).
  - ⚠ `endBriefSnapshot` guarda el total SIN cola: `checkShiftReconciliation` lo compara contra el
    doc padre y habria avisado una "correccion Shoplogix" falsa de -505 **cada dia**.
  - ⚠ `resumenParos` ignora states de duracion CERO y repetidos: eran **27 de 85** "micro" — Telegram
    decia 85 y el monitor 58 **del mismo turno**. Misma clase de bug que el listado vs el grafico
    de #447: dos superficies contando distinto el mismo dato.
  - Config `notificationConfig/filete`: telegram ON (dest `bot` = DM del admin, igual que chonchi y
    yal), inicio + fin ON, **paros y primera pieza OFF** (Filete pidio el avance, no el ruido).
- Archivos: `functions/publicMonitor.js`, `functions/shoplogix/turnoBrief.js`, `functions/index.js`,
  + 2 archivos de test.
- Verificacion: 220 tests en verde (211 + 9 nuevos). **Dry-run con los datos reales de Filete del
  10-ago** (sin enviar nada): 4.915 pz, horario 07:45→16:30, 58 micro — coincide con el monitor
  publico. Sin cola el mensaje queda byte a byte igual (Chonchi/Yal no cambian, con test).
  Funcion desplegada y ACTIVE (revision 00044, updateTime 02:34).
- Estado: HECHO — mergeado (`da650be`) y desplegado; canal encendido.
- Sigue: **falta ver un turno real** — el proximo cierre de Filete es la primera prueba de fuego
  (que el brief espere la cola y anuncie el total completo). Si Orel quiere que llegue al GRUPO y
  no a su DM, es cambiar `telegramDest` a `grupo` desde el panel admin.

---

## 2026-08-10 - claude - Grafico del monitor: ubicar las detenciones y marcar el mejor ritmo (#447)

Orel: *"poder seleccionar del listado el tipo de detencion y q las ubique en el grafico"* +
*"deja el mejor ritmo real 83"*.

- Hecho: al tocar una causa del listado, el grafico marca donde ocurrio cada parada de esa causa.
  Ademas eje de horas (4 marcas) y linea de referencia punteada con el mejor tramo REAL del turno
  (83 pz), que es contra lo que se compara cada barra.
- **Los dos bugs que solo aparecieron al MIRAR** (todo verde antes):
  1. El listado decia "85x" y el grafico pintaba 55 bandas. Venian de DOS calculos distintos
     (estados duplicados + estados de duracion cero). Ahora el backend publica `stopReasons` +
     `stopEvents` y listado y grafico salen de la MISMA fuente deduplicada.
  2. Las bandas quedaban corridas a la derecha y 3 caian fuera del area: se ubicaban por
     aritmetica de tiempo, pero **la serie NO es continua** (solo trae los tramos que el sensor
     registro). Se corrigio buscando el INDICE del tramo en la serie.
- Archivos: `functions/publicMonitor.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`. Payload +3 KB (tope 300 eventos).
- Verificacion: 202 tests functions + 1107 PWA, tsc 0, eslint 0. **En PRODUCCION con clic real de
  mouse** sobre el turno de Filete del 10-ago: COLACION 4x -> 4 bandas en 13:40/13:55/14:10/14:35
  (escalonadas por grupo), REUNION INICIO TURNO 1x -> 1 banda en x=1,1 de 100 (al comienzo),
  Micro Detencion 58x -> 58 bandas, y la "x" del chip limpia el filtro.
- Gotcha de tooling: en el tab de claude-in-chrome el `.click()` programatico NO tomaba y el
  screenshot fallaba por `document_idle` perpetuo (la suscripcion de Firestore deja la pagina
  "cargando"). Se verifico con el navegador interno + clic real por `ref`.
- Estado: HECHO — mergeado (`3c2b8b0`) y desplegado.
- Sigue: sin pendientes de esta feature.

---

## 2026-08-10 - claude - Apodos de aparatos: resolver con lo que sabe el usuario, no con huellas

Orel: *"los aparatos tipo celular han sido los mismos, solo yo lo he probado... debemos poder
identificar si es el mismo o va a contar uno nuevo cada vez"*.

**El diagnostico primero**: los 5 "aparatos" que veia eran en su mayoria MIS pings de prueba con
viewerIds inventados. Borrados. El mecanismo si distingue: el mismo navegador cuenta como UNO
porque el id vive en su localStorage.

**El limite real que Orel intuyo bien**: el mismo celular figura dos veces si el link se abre con
navegadores distintos — y el caso frecuente es abrirlo desde WhatsApp/Telegram, que usan su webview
propio con storage aparte. Resolverlo por medios tecnicos exigiria **fingerprinting** (UA +
resolucion + huso + idioma), que es exactamente lo que esta pantalla prometio NO hacer.

**La salida sin cruzar esa linea**: usar lo que el usuario SI sabe. Se le puede poner nombre a cada
aparato ("celular de Control") y **dos filas con el mismo nombre se fusionan** — se suman sus
aperturas y su tiempo, y el contador de arriba pasa a contar aparatos fusionados, no navegadores
sueltos. La fila avisa "(2 navegadores)" para que la fusion sea visible y no magia.

Los apodos viven en **`publicShiftMonitorLabels/{token}`**, coleccion aparte con `write: if
isSupervisor()`. NUNCA se copian al doc publico: son notas internas y quien abre el link no tiene
por que ver como lo llamaron del otro lado.

⚠ **Bug propio detectado probando**: el guardado del nombre fallaba y el editor se cerraba igual, o
sea que el usuario creia haber guardado. Ahora el editor se queda abierto, el borde se pone rojo y
dice "no se pudo guardar". (El fallo era la regla sin desplegar, pero el silencio era mio.)

De paso: la etiqueta "nuevo" solo aparece si el link YA lleva mas de un dia en uso — recien creado,
todos los aparatos son nuevos por definicion y la etiqueta no distingue nada. Y `fmtDuracion` dice
"<1 min" en vez de "0 min".

- Archivos: `firestore.rules`, `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 1.107 tests del PWA en verde; tsc y eslint limpios. La lista se vio con datos reales
  distinguiendo un aparato con 2 aperturas de otros con 1. **El guardado del nombre NO se pudo
  probar todavia**: la regla se despliega con el merge.
- Estado: HECHO (mergeado)
- Sigue: probar el guardado del apodo end-to-end una vez desplegada la regla.

## 2026-08-10 - claude - La vista de turno tambien cuenta la cola + umbral unificado + UX

Orel revisando la app en el celular. Cinco cosas:

1. **El scorecard seguia mostrando 4.410.** El monitor y la matriz ya contaban la produccion de
   fuera del horario, pero la vista de turno no: era la tercera superficie con el mismo dato y un
   numero distinto. Nuevo hook `useShiftOutsidePieces` con el MISMO umbral y el MISMO dedupe →
   ahora **4.915** con el desglose "4.410 en el turno + 505 fuera del horario (15:40–16:30)".
   Cuesta 1 lectura: los intervals del turno ya estan en el snapshot cargado.
2. **El horario decia 15:30** cuando la linea siguio hasta las 16:30. Sin Grader el "Produjo" iba
   vacio y solo quedaba el programado; ahora cae a la ventana REAL del sensor (cola incluida):
   *Programado 07:45–15:30 · Produjo 07:55–16:30*.
3. **Umbral unificado en la matriz.** ⚠ Al aplicarlo tal cual, dos tests reales fallaron: castigaba
   ciclos sueltos DENTRO del horario del turno, que son del turno sin discusion. El umbral solo
   aplica FUERA de las ventanas. Y hubo que **actualizar un test que fijaba la decision anterior**
   ("ningun ciclo sin turno", 03-ago): el caso Yal pasa de 1.836 a 1.835 cic porque 1 ciclo suelto
   a las 09:30 es ruido. Queda escrito en el test por que cambio.
4. **Boton "Abrir"** junto a Copiar/Revocar: se podia compartir el monitor pero no entrar a mirarlo.
5. **Detalle por aparato en la telemetria**: "5 aperturas · 5 aparatos" no distinguia *una persona
   que abrio 5 veces* de *5 personas que abrieron una vez*, que es justo lo que hay que saber. Ahora
   lista los 5 aparatos mas recientes con sus aperturas, su tiempo y cuando fue la ultima.

- Archivos: `apps/pwa/src/hooks/useShiftOutsidePieces.ts` (nuevo),
  `apps/pwa/src/components/grader/ShoplogixOnlyScorecard.tsx`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx`,
  `apps/pwa/src/components/grader/LossCascadeCard.tsx`,
  `apps/pwa/src/services/grader/graderUnscheduledAttribution.ts`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` y su test.
- Verificacion: 1.107 tests del PWA y 202 de functions en verde; tsc y eslint limpios. En el
  navegador con sesion real: hero 4.915, desglose correcto, "Produjo 07:55–16:30", boton Abrir.
- Estado: HECHO (mergeado)
- ⚠ **SIN VERIFICAR**: el arreglo de los textos que se salian por el borde en el celular (filas de
  "Piezas perdidas por causal", que llevaban 6 elementos `shrink-0` sin poder envolver). El fix es
  `flex-wrap` + anchos fijos solo en desktop, pero **no se pudo mirar en un viewport movil real**:
  `resize_window` no cambia el viewport de la pestaña del Chrome del usuario, y el navegador de la
  herramienta —que si emula movil— no tiene su sesion. Pedido spot-check a Orel.

## 2026-08-10 - claude - El monitor publico pasa a ser theme-aware (claro/oscuro)

Pedido de Orel. La pantalla nacio dark-only por decision explicita ("un tablero de planta se mira
mejor asi") pero se abre tambien de dia y en oficina. Ahora usa los tokens de la app y tiene su
propio boton sol/luna; el tema se guarda en el MISMO `app-theme` que el resto, asi que quien tenga
la PWA en claro abre el link en claro.

57 hardcodes convertidos siguiendo el playbook `/tema-claro-oscuro`: `bg-gray-950`→`bg-background`,
`bg-white/[0.04]`→`bg-card`, `border-white/10`→`border-border`, la escala de `text-white/NN` a
`text-foreground` / `text-muted-foreground`, y los acentos con el patron `-700/-800 dark:-300/-400`
(un -300 sobre fondo claro queda lavado). Los tintes de estado subieron de `/10` a `/20` (patron C:
en claro un /10 colapsa contra la superficie).

⚠ **Dos cosas que solo aparecieron MIRANDO la pantalla en claro**:

1. **El "% produciendo" se habia hundido de 72% a 58%** — y no era del tema. Al rescatar la cola de
   despues del cierre entraban tambien los states `Planned Downtime`, que es el relleno de las horas
   en que la planta NO estaba operando (la memoria del proyecto ya decia que se EXCLUYE del
   denominador). Ademas encabezaba el ranking de detenciones: el primer lugar era "no estabamos
   trabajando". Excluido de las dos partes → vuelve a **76,5%**.
2. **El aviso de linea detenida desaparecia**: `bg-red-500/15` con borde `/25` sobre superficie
   clara no se ve. Borde a `/40` en claro, oscuro intacto.

**Contraste medido, no mirado** (regla 4d del playbook). Primera medicion dio 2,48:1 y 1,94:1 —
falsos: el script no componia el alfa de los tintes. Con el alfa compuesto: chip "Detenida" 4,25:1,
**bajo el 4,5 de AA** → `-700`→`-800` y quedo en **5,46:1**. Resto en claro: numero grande 12,34,
KPI 5,17, secundario 7,18, chip ambar 4,78. En oscuro: 15,47 / 9,49 / 7,33 / 7,25 y fondo
`rgb(13,23,34)`, el de siempre.

- Archivos: `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`, `functions/publicMonitor.js`.
- Verificacion: 202 tests functions y 1.107 del PWA en verde; tsc y eslint limpios; build OK.
  Screenshot en CLARO y en OSCURO con datos reales, toggle probado en ambos sentidos, y el fondo
  oscuro verificado byte a byte contra el valor del playbook.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - La MATRIZ contaba dos veces las piezas del borde del turno

Mismo bug que se corrigio en el monitor (#434), ahora en la matriz de turnos, que es donde se mira
el mes completo. Shoplogix reporta algunos minutos en el doc del turno Y dentro de `Unscheduled`;
la atribucion los sumaba igual. Caso real 10-ago Filete: 15:30=47 y 15:35=65 identicos en los dos
docs → **112 piezas contadas dos veces**. La celda decia 5.033 y ahora dice **4.921**.

`attributeUnscheduledCycles` acepta ahora las claves `machineid|epochMs` que los turnos del dia YA
tienen contadas y descarta esos tramos (`duplicated` queda en el resultado, auditable). Las claves
las carga `loadCountedKeysForDate` **solo de los dias que tienen Unscheduled** — 1-3 docs por dia,
no los ~80 turnos del mes, respetando la nota de costo que ya tenia el modulo.

⚠ **Bug propio que costo una vuelta**: para armar la ruta del doc use `s.key.slice(11)`, pero la
key es `${dateKey}__${shiftId}` con DOS guiones bajos y el doc de Firestore lleva UNO. Resultado:
la ruta no existia, el `catch` devolvia un set vacio y el dedupe no hacia nada — con todo en verde.
Se detecto **mirando la matriz en el navegador**: seguia diciendo 5.033. Ahora usa `s.shiftId`.

**Diferencia intencional con el monitor**: la matriz marca 4.921 y el monitor 4.915. Son las 6
piezas de higiene de las 06:10. El monitor descarta tramos <20 piezas (decision de Orel de hoy); la
matriz atribuye todo (decision de Orel del 03-ago: *ningun ciclo queda sin turno*). Las dos reglas
conviven a proposito; si algun dia se quieren iguales, es el mismo umbral en los dos lados.

- Archivos: `apps/pwa/src/services/grader/graderUnscheduledAttribution.ts`,
  `apps/pwa/src/services/grader/graderUnscheduledLoad.ts`, `apps/pwa/src/hooks/useGraderShiftPeriod.ts`,
  `apps/pwa/src/services/grader/__tests__/graderUnscheduledAttribution.test.ts`.
- Verificacion: **1.107 tests del PWA** (3 nuevos, incluido uno que fija el comportamiento ANTERIOR
  para dejar el bug documentado) y 202 de functions en verde; tsc y eslint limpios. En el navegador
  con datos reales: la celda del 10-ago bajo de 5.033 a 4.921.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - Tres arreglos de la pantalla publica vistos por Orel

Los tres los detecto Orel mirando la pantalla, no los tests:

1. **El grafico mentia por recorte.** El eje decia "12:30–16:25" para un turno que arranco a las
   07:55: `SERIES_MAX_POINTS` estaba en 48 tramos (4 h) y cortaba la mañana entera. Subido a 192
   (16 h) — el turno del 10-ago pasa de 48 a **106 tramos** y el eje ahora dice 07:40–16:25. Un
   grafico que se come la mitad del turno no es un grafico incompleto: es uno que engaña.
2. **Chip "Sigue el turno vigente" fuera.** Redundante: el encabezado ya dice el turno y la barra de
   navegacion ya dice "Turno actual". El pie sigue explicando que el link no caduca con el turno,
   que es lo unico que no se deduce mirando.
3. **Navegacion en los dos sentidos.** Habia "Turno anterior" y "Volver al actual", pero no se podia
   avanzar de a uno. Ahora `‹ Anterior` / `Siguiente ›` (deshabilitados en los extremos) y el atajo
   "Ir al actual" aparece solo cuando hay mas de un turno que saltar.

- Archivos: `functions/publicMonitor.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`.
- Verificacion: 202 tests functions y 1.104 del PWA en verde; tsc y eslint limpios. En el navegador
  con datos reales: 106 barras, eje 07:40–16:25, "Siguiente" se habilita al retroceder y "Ir al
  actual" aparece recien a 2 turnos atras.
- Estado: HECHO (mergeado)
- Sigue: el mismo doble conteo del monitor existe en la MATRIZ (`graderUnscheduledAttribution`) —
  Orel pidio arreglarlo tambien; va en su propio PR porque toca una vista central.

## 2026-08-10 - claude - Telemetria anonima del monitor publico

Orel: *"¿se puede mostrar quienes usan el QR?"*. Identidad no —quien abre el link no tiene sesion,
no dio consentimiento y muchas veces ni trabaja en la empresa— pero el USO si se puede medir, y es
justo lo que permite defender la herramienta con datos: aperturas, aparatos distintos, tiempo
mirado, ultima vez, celular vs PC, distribucion por hora, aperturas por dia y cuantas vistas fueron
a turnos anteriores (mide si el deslizamiento sirve).

**Lo que NO se guarda, a proposito**: IP, geolocalizacion, user-agent crudo, nombres, correos. Lo
unico que distingue a un aparato de otro es un `viewerId` ALEATORIO que genera su propio navegador
y vive en su localStorage — no se deriva de nada del aparato ni de la persona, y borrar los datos
del navegador lo reinicia. Del user-agent solo se deriva "movil" u "escritorio". La pantalla
publica lo dice en el pie: *"Se cuentan las aperturas de forma anonima... No se registra quien la
abre"*.

**Donde viven los contadores**: coleccion APARTE, `publicShiftMonitorStats/{token}`, con
`read: if isNotAnonymous()` y `write: if false`. NO en el doc del monitor: ese es de lectura
publica, asi que ahi la telemetria quedaria expuesta a los propios visitantes y engordaria lo que
se descarga en cada refresco.

**Endpoint abierto, defensas explicitas** (`publicMonitorPing`): solo acepta tokens de monitores
VIGENTES, el `viewerId` se valida contra un formato fijo (`danilo@empresa.cl` NO entra), el tiempo
que suma un latido esta topeado, una apertura del mismo aparato no vuelve a contar antes de 10 min
(recargar la pestaña no son visitas), y el doc se poda a 60 aparatos y 14 dias. Un abusador con el
link solo puede inflar sus propios contadores: no lee nada ni toca los datos del turno.

Los latidos van cada 2 min y **solo con la pestaña visible** — el tiempo en segundo plano no es
tiempo mirado.

⚠ **Un test destapo un bug real**: `applyEvent` mutaba el objeto del dia del estado previo
(`{...s.byDay}` es copia superficial y el objeto del dia se modificaba in situ) — dentro de una
transaccion Firestore eso es exactamente la clase de cosa que produce numeros irreproducibles. El
test "no muta el estado que recibe" lo encontro antes de que llegara a produccion.

- Archivos: `functions/publicMonitorStats.js` (nuevo), `functions/index.js`,
  `functions/__tests__/publicMonitorStats.test.js` (nuevo), `firestore.rules`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx` (nuevo),
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: **202 tests functions** (9 nuevos) y 1.104 del PWA en verde; tsc y eslint limpios;
  build OK. La agregacion se corrio contra el doc REAL del monitor de Filete con 6 visitas
  simuladas: 3 aperturas (la recarga se deduplico), 3 aparatos, 7 min mirados, 2 moviles + 1 PC,
  1 vista a turno anterior. La pantalla publica se abrio en el navegador: genera su `viewerId`,
  muestra la nota del pie y **sigue funcionando con el endpoint caido** (el fetch falla y se traga
  en silencio, que es la unica conducta aceptable para telemetria).
- Estado: HECHO (mergeado)
- Sigue: el ping real end-to-end solo se puede confirmar con la funcion desplegada.

## 2026-08-10 - claude - La tarjeta del monitor NO aparecia en Filete (el caso de uso principal)

Orel: *"no lo veo"*. Tenia razon. La tarjeta "Monitor en vivo (link / QR)" estaba anidada dentro de
`{summary && shiftWindow && (...)}` — y ese `summary` es **el del Excel del Grader**. Filete no
tiene Grader, asi que en Filete el bloque entero no se renderizaba: la tarjeta no existia justo en
la linea para la que se construyo la feature. Movida fuera de ese gate.

**Por que no se detecto antes**: tsc, eslint, 1.104 tests, el build y la vista publica estaban todos
en verde, y la vista publica se verifico a fondo. Lo que nunca se hizo fue **abrir la pagina de la
app y mirar la tarjeta**, porque requiere sesion y el navegador de la herramienta no la tiene. Se
declaro como "pendiente: falta apretar Generar link" cuando la conclusion honesta era "no se sabe si
la tarjeta aparece". *Un pendiente de verificacion no es un detalle: es exactamente donde estaba el
bug.*

**Como se verifico ahora**: con `claude-in-chrome` sobre el Chrome REAL de Orel, que ya tiene la
sesion iniciada, contra un `vite` en el puerto 5173 (el autorizado por Firebase). Recorrido
completo: Analisis de Turno → Filete → matriz de turnos → Ver turno → la tarjeta aparece al final →
**Generar link** crea el link y el QR → **Revocar** lo borra (verificado en Firestore: vuelve a
quedar un solo monitor de linea). Con eso queda cerrado el ultimo pendiente del circuito.

De paso, el callable en modo linea pasa a ser **idempotente**: si la linea ya tiene un link vigente
devuelve ESE (y solo refresca sus etiquetas), en vez de crear un segundo link. Sin esto, el QR
pegado en la pared y el que acaba de copiar el supervisor serian distintos.

- Archivos: `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`, `functions/index.js`,
  `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`.
- Verificacion: 193 tests functions (1 nuevo) y 1.104 del PWA en verde; tsc limpio; build OK; y el
  recorrido completo hecho a mano en el navegador con sesion real.
- Estado: HECHO (mergeado)
- Sigue: Orel pregunta si se puede saber quien usa el QR — sin sesion no hay identidad; lo que si se
  puede medir es cuantas aperturas y desde cuantos dispositivos, de forma anonima.

## 2026-08-10 - claude - `Unscheduled` ganaba como turno vigente del monitor

Encontrado **verificando en produccion** justo despues del deploy anterior: el monitor de linea de
Filete estaba mostrando `2026-08-10_Unscheduled` con **623 pz** como si fuera el turno, mientras el
`Turno Dia` real llevaba **4.915**. Ganaba por horario (su ventana arranca antes y termina despues)
y pasaba el filtro porque tenia mas de 50 ciclos.

El umbral de 50 venia de la PWA, pero **desde que el monitor rescata las piezas fuera de horario ya
no aplica**: esas 623 piezas YA se suman al turno real, asi que elegir el bucket como turno las
mostraba dos veces y con la etiqueta equivocada. Ahora `Unscheduled` no puede ser el turno vigente
nunca; solo se acepta si la linea no tiene NINGUN turno con nombre en hoy/ayer y aun asi hubo
proceso (mejor produccion mal etiquetada que una pantalla vacia teniendo datos).

Vale como recordatorio de la regla que ya estaba escrita para la PWA —*nunca caer a `Unscheduled`
como fallback de un turno nombrado*— y de que **un cambio puede invalidar un umbral que llevaba
meses siendo correcto**.

- Archivos: `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`.
- Verificacion: 192 tests functions (2 nuevos con el escenario exacto) en verde. Tras el fix,
  `resolveCurrentShiftDocId` contra prod devuelve chonchi → `Turno 2`, yal → `Turno 2`,
  filete → `Turno Dia`.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - Deslizar a turnos anteriores desde el link publico

Pedido de Orel. El link mostraba solo el turno vigente; ahora publica ademas los **6 turnos
anteriores** con proceso y se navega con flechas o **swipe** (que es la interaccion natural: el QR
se abre en el celular).

**Lo que evita que sea caro**: un turno cerrado ya no cambia, asi que el historial se REUSA del doc
anterior en vez de recomponerse cada 5 min. Solo se recompone el turno inmediatamente anterior,
que todavia se mueve por el re-sync movil (reescribe ayer cada hora y hace 2-3 dias una vez al
dia). Sin ese reuso serian ~40 lecturas por refresco por monitor.

⚠ **Ordenar por el id NO sirve**: en Chonchi "Turno 1" arranca 21:30 y "Turno 2" a las 09:00, asi
que alfabeticamente el historial sale al reves. Se ordena por `scheduledStart` real. Se descartan
los `Unscheduled` y los turnos con <50 piezas (no hubo proceso).

⚠ **Bug de React que costo una vuelta**: el efecto que reubica la vista cuando arranca un turno
nuevo dependia tambien de `idx`, asi que se disparaba en la navegacion del propio usuario y lo
devolvia al turno actual — **el boton parecia no responder**. El efecto debe depender SOLO de
`vistas`; quien navega actualiza el ref a mano. Detectado clickeando el boton en el navegador, no
por tsc ni por los tests.

- Archivos: `functions/publicMonitor.js` (`buildMonitorHistory`), `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`, `scripts/public-monitor-probe.js`.
- Verificacion: **190 tests functions** (3 nuevos, incluido el del orden cronologico y el del
  reuso) y 1.104 del PWA en verde; tsc y eslint limpios; build OK (chunk publico 15 kB / 4,7 gzip).
  En el navegador con datos REALES: recorridos los 6 turnos de Filete (3.454 → 4.364 → 3.754 →
  3.398 → 3.168 → 2.410), el boton se deshabilita en el ultimo, "Volver al actual" funciona, el
  swipe sintetico navega, y a 375px no hay scroll horizontal ni texto bajo 11px. Al mirar un turno
  pasado el rotulo cambia a "Piezas de ese turno" y desaparece el bloque "Ahora mismo", que no
  aplica.
- Estado: HECHO (mergeado)
- Sigue: el historial se llena en el primer refresco del trigger (o al crear el link). Un link
  creado antes de este cambio no tiene `history` hasta que el sync lo toque.

## 2026-08-10 - claude - El monitor cuenta las piezas que Shoplogix deja fuera del turno

Reporte de Orel: "hoy termino filete pero Shoplogix conto hasta las 15:30 y siguieron pasando
piezas hasta las 17:00". Confirmado en los datos del 10-ago: el turno estaba definido 07:45→15:30
con 4.410 pz, y el doc `Unscheduled` del mismo dia tenia otras 623 pz — produccion real que el
monitor no mostraba. **La jornada eran ~4.900 piezas y el link decia 4.410.**

Ahora `buildMonitorLive` rescata los intervals/states de los docs `Unscheduled` del mismo dia que
no caen dentro de la ventana de NINGUN turno con nombre, los fusiona en la serie/cadencia/estado, y
publica el desglose: `shiftPieces` + `outsidePieces` + `outsideRanges` (con `kind` antes/despues).
La pantalla lo muestra como "4.410 dentro del turno + 505 fuera del horario (15:40–16:30)".

⚠⚠ **El bug que casi se cuela: DOBLE CONTEO.** El doc del turno guarda intervals MAS ALLA de su
propio `scheduledEnd` (15:30 y 15:35) y Shoplogix repite esos mismos minutos en `Unscheduled` —
**identicos, 112 piezas**. Filtrar por la ventana declarada no los atrapa. Se detecto **mirando la
pantalla**: el "maximo del tramo" del grafico salto de 83 a 130 pz, que es justo 65+65. Fix: dedupe
por (maquina, timestamp del interval) contra lo que el turno ya tiene, no por ventana. En esta
pantalla el doble conteo es el peor error posible — quien mira el link no tiene con que contrastar.

**Dos numeros mas que hubo que arreglar por efecto domino:**
- La CADENCIA se diluia: al estirar la ventana hasta la ultima pieza del dia, un hueco de 1,5 h en
  la manana convertia 557 pz/h en 487. Ahora el denominador son las horas de OPERACION (se
  descuentan los huecos ≥30 min sin una sola pieza).
- El % PRODUCIENDO pasa a calcularse sobre el tiempo RASTREADO (uptime/(uptime+down+break)) en vez
  del `shiftRuntime` de Shoplogix, que solo conoce el turno. Con la cola vacia da el mismo numero
  que antes (18.105/24.705 = 73,3% vs su 73,28%), asi que no rompe lo ya verificado.

**Umbral de ruido**: un tramo fuera de turno cuenta solo si tiene ≥20 piezas. Nace de un dato real
—6 piezas sueltas a las 06:10, hora y media antes del turno, probablemente higiene— pero se dejo
como UMBRAL y no como regla "ignorar todo lo anterior al turno", porque el arranque anticipado real
existe y ya costo un fix entero (ver [[continuity-ventana-turno-inicio-anticipado]]).

- Archivos: `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`.
- Verificacion: **187 tests functions** (6 nuevos, incluido el del doble conteo — comprobado que
  falla al revertir el dedupe) y 1.104 del PWA en verde; tsc limpio; build OK. Contra los datos
  REALES del 10-ago: 4.915 pz = 4.410 + 505, tramo 15:40→16:30, 573 pz/h, 72% produciendo, meta al
  98% (antes marcaba 88% con 4.410). Revisado en el navegador con un monitor real.
- Estado: HECHO (mergeado)
- Sigue: pedido de Orel — poder **deslizar a turnos anteriores** desde la misma pantalla.

## 2026-08-10 - claude - El link del monitor llega por Telegram al arrancar el turno

Tercera parte. El link ya seguia el turno vigente, pero habia que ir a buscarlo a la app. Ahora
llega solo: al crearse el doc de un turno (`onShoplogixShiftStarted`), el aviso de arranque incluye
el link del monitor listo para reenviar a Control de Produccion.

**La invariante que manda: el TOKEN NO CAMBIA.** `ensureLineMonitor` reusa siempre el link de linea
vigente y solo le extiende la vigencia cuando le quedan <7 dias (a 30). Crear uno nuevo en cada
arranque habria pasado cualquier test de contenido y aun asi habria roto lo unico que hace util al
link: que el QR impreso y el mensaje de Telegram de ayer sigan abriendo la misma pantalla. Hay 4
tests sobre eso, y se comprobo que fallan mutando el codigo.

⚠ **Hallazgo que cambio el diseno: Filete NO tenia el canal Telegram abierto** (`notificationConfig`
solo existe para chonchi y yal; filete heredaba `telegram:false`). O sea, la linea donde mas se pide
el monitor era justo la que no iba a recibir nada. Se resolvio con un flag propio,
`monitorLink.enabled` (default true, `ttlDays` 30), independiente de `channels.telegram`:
  - Chonchi/Yal (canal abierto): el link va DENTRO del brief de inicio de siempre, sin mensajes nuevos.
  - Filete (canal cerrado): un aviso corto y aparte, solo con el link. **No se le abrio el canal de
    alertas**: activar `telegram:true` habria traido tambien detenciones y fin de turno de Filete,
    que nadie pidio.

El envio por Telegram salio ademas de dentro del gate `eligibleIds.length > 0`: ese gate son las
preferencias de push de los usuarios de la app, y el mensaje va al chat del admin o al grupo. Que
alguien apague su push no puede dejar sin link a Control de Produccion.

- Hecho: `monitorLink` en la config de notificaciones (3 capas, ajustable por planta desde
  Firestore), `ensureLineMonitor` (reusa/renueva/crea), `resolveMonitorUrlForPlant` (nunca tumba el
  aviso: ante error devuelve null y el mensaje sale sin la linea), linea del link en
  `componerBriefInicioTurno` + `componerAvisoMonitor` para el caso sin canal. De paso, dedupe de
  `lineLabel`/`areaLabel` en la cabecera publica ("Filete · Filete").
- Archivos: `functions/index.js`, `functions/publicMonitor.js`, `functions/shoplogix/notifConfig.js`,
  `functions/shoplogix/turnoBrief.js`, `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`.
- Verificacion: **181 tests functions** (5 nuevos) y 1.104 del PWA en verde; `tsc` limpio; el modulo
  `index.js` carga sin TDZ. Contra PRODUCCION: dos corridas seguidas de `ensureLineMonitor` sobre
  filete devolvieron **el mismo token** (`created:true` y luego `false`), el monitor quedo con datos
  reales (4.408 pz) y vigencia al 9-sep, y la pagina se abrio sin sesion. Los dos mensajes se
  renderizaron con el composer real antes de tocar nada.
- Estado: HECHO (mergeado)
- Sigue: **el envio real solo se puede confirmar en el proximo arranque de turno** — no se disparo
  ningun Telegram de prueba a proposito (mandar mensajes es del usuario, no mio). Si el primer aviso
  no llega, mirar `monitorLink.enabled` en `notificationConfig/{planta}` y los logs
  `[publicShiftMonitor] link de linea ...`.

## 2026-08-10 - claude - El link del monitor sigue el turno vigente (no se regenera)

Continuacion de la entrada de abajo. El link nacia atado a UN turno, asi que al dia siguiente
habia que generar otro: inservible para un QR pegado en la pared. Ahora el modo por defecto es
**`line`**: el mismo link sigue el turno que este corriendo.

**Como se resuelve el turno vigente** (`resolveCurrentShiftDocId`): entre los padres de HOY y AYER
en wall-clock (un turno noche que arranca 21:30 queda archivado bajo el dia en que arranco), gana
el que contiene el reloj de planta con 30 min de gracia; si no hay ninguno —estamos entre turnos—
gana el ultimo que YA empezo, porque quien abre el QR a las 20:00 quiere ver como termino el
turno, no una pantalla vacia. `Unscheduled` con <50 ciclos se descarta (mismo umbral que la PWA).
Se leen 2-6 docs padre, ningun `machines/`, y sin indices nuevos (`listDocuments` + filtro por
prefijo de fecha).

⚠ **Lo que NO se hace, y es el punto entero:** el monitor de linea **nunca adopta el turno que
disparo el trigger**. El re-sync movil reescribe padres de ayer y de hace 2-3 dias; adoptarlos
haria saltar el link a un turno viejo justo cuando alguien lo esta mirando. Siempre se re-resuelve.

El trigger atiende las dos audiencias con **una sola query** (`where scope in [plant|shiftDoc,
line|plant]`, dos igualdades, sin indice compuesto) y resuelve el turno vigente **una vez por
planta** aunque haya varios links de esa linea.

Tres estados en la pantalla publica, los tres verificados: turno corriendo (chip "Sigue el turno
vigente"), link vencido/revocado, y **"Esperando el proximo turno"** — un link de linea puede
nacer un domingo y no esta roto, esta esperando; decirle "no disponible" mandaria a pedir otro
link que tampoco mostraria nada.

- Hecho: modo `line` en el callable (permite crear fuera de turno, pero no sobre una linea que
  nunca sincronizo), `buildMonitorPatch` que ademas reapunta dateKey/shiftId, trigger que cubre
  ambos scopes, vigencia nueva de **30 dias** (default del modo linea), selector "Que sigue" en la
  tarjeta de generacion, chip + nota al pie en la vista publica, y `--current` en el probe para
  contrastar que turno se considera vigente en cada planta.
- Archivos: `functions/publicMonitor.js`, `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`,
  `scripts/public-monitor-probe.js`.
- Verificacion: `tsc` limpio, eslint sin errores nuevos, **176 tests functions** (6 nuevos del modo
  linea) y **1.104 del PWA** en verde, build OK. **Contrastado contra las 3 lineas reales a las
  15:11**: chonchi → `Turno 2` 09:15→15:05 (6.751 pz), yal → `Turno 2` recien arrancado 15:00,
  filete → `Turno Dia` 07:45→15:05 (4.010 pz). Los tres estados de la pantalla vistos en el
  navegador con docs reales de Firestore.
- Estado: HECHO (mergeado)
- Sigue: sigue faltando ejercitar el boton "Generar link" con sesion de supervisor (el callable
  necesita usuario). Los links de linea se refrescan solo cuando el sync escribe algun padre de esa
  planta — si una planta deja de sincronizar, el link conserva el ultimo turno y lo dice con la
  frescura, que es lo correcto.

## 2026-08-10 - claude - Monitor publico de turno en vivo (link/QR sin sesion)

Control de Produccion necesitaba seguir el avance de piezas de la Baader 200 de Filete sin entrar
a Shoplogix ni tener cuenta en la PWA. Se agrega un link/QR **de solo lectura** que se actualiza
solo: `/monitor/{token}`.

**Que muestra:** piezas acumuladas del turno (con avance vs la meta de 5.000 pz de Filete),
**pz/min y pz/hora**, cadencia de los ultimos 30 min, % de tiempo produciendo, **turno + dia +
horario programado**, ventana real de produccion (primera->ultima pieza), estado actual
(produciendo/detenida con la razon y desde cuando), barras de piezas por tramo de 5 min y el
top de detenciones del turno. Sin comentarios de operador (texto libre que puede traer nombres).

**Arquitectura — por que un espejo y no lectura directa:** `shoplogix/**` exige `isNotAnonymous()`
y abrirla expondria todos los turnos de todas las plantas. En cambio se publica un doc espejo
`publicShiftMonitors/{token}` que escribe SIEMPRE el Admin SDK (`write: if false` en rules) y que
lee cualquiera **solo mientras no venza** (`timestamp.value(expiresAt) > request.time`, reloj del
servidor). Lo refresca un trigger enganchado al **doc padre** del turno — no a `machines/{id}` —
porque el padre se escribe una vez por ciclo de sync y la subcoleccion dispara un evento por
maquina (3 en Eviscerado) que compondrian el mismo payload. Frescura efectiva: ~5 min.

**Bug encontrado y corregido con datos reales (turno del 10-ago EN CURSO):** el turno vivo se
anunciaba como **"Turno cerrado"**. Causa: en Filete el `scheduledEnd` se DERIVA del ultimo
intervalo sincronizado, o sea que siempre queda unos minutos en el pasado (fin derivado 14:36 con
la linea produciendo a las 14:40). Fix: margen de 30 min **y** exigir que ninguna maquina este en
uptime. Hay test que falla si se revierte cualquiera de las dos condiciones (verificado mutando el
codigo, no asumido).

**Gotcha de UI reusable:** el root de la app corre a 85% (13,6px), asi que **`text-xs` renderiza a
10,2px reales** — por debajo del piso de 11px de la piel nueva. En esta pantalla los tamanos van en
px explicitos. `capitalize` de Tailwind ademas capitaliza CADA palabra ("Lunes, 10 De Agosto"):
usar `first-letter:uppercase`.

- Hecho: `functions/publicMonitor.js` (composicion del payload) + callables
  `createPublicShiftMonitor`/`revokePublicShiftMonitor` + trigger
  `onShoplogixShiftWrittenPublicMonitor`; regla `publicShiftMonitors`; pagina publica
  `/monitor/:token`; bloque "Monitor en vivo (link/QR)" en Analisis de Turno (visible para
  supervisor/admin en cualquier linea con Shoplogix, **no depende del Grader** — por eso sirve en
  Filete); vigencia elegible 12 h / 1 d / 3 d / 7 d y revocacion; `scripts/public-monitor-probe.js`
  para inspeccionar el payload antes de exponerlo.
- Archivos: `functions/publicMonitor.js`, `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`, `firestore.rules`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`, `apps/pwa/src/App.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`,
  `scripts/public-monitor-probe.js`.
- Verificacion: `tsc --noEmit` limpio; eslint sin errores nuevos; **1.104 tests PWA** y **170 tests
  functions** en verde (6 nuevos); build de produccion OK (chunk publico 11,6 kB / 3,7 kB gzip, sin
  echarts); payload contrastado contra el turno REAL de Filete del 10-ago (3.727 pz, 9,3 pz/min,
  557 pz/h, 73% produciendo, 350 pz en los ultimos 30 min = 11,7 pz/min); vista revisada en el
  preview a 375px y 1280px, sin scroll horizontal, y la pantalla de "link no disponible" probada
  contra Firestore real (permission-denied => mensaje claro, no pantalla en blanco).
- Estado: HECHO (mergeado)
- Sigue: **falta el unico tramo que no se puede probar sin sesion de usuario**: apretar "Generar
  link" desde la app como supervisor (el callable). Verificado en cambio el resto del circuito en
  produccion tras el deploy. Idea futura: link "de linea" que siga el turno vigente en vez de uno
  fijo, para no regenerarlo cada dia.

## 2026-08-09 - claude - El aviso del protocolo NUNCA llegaba: topic de Telegram roto

Verificación end-to-end del circuito recién desplegado, contra producción. Encontró un bug que
tsc, eslint, los 18 tests y el deploy en verde no podían ver.

**Lo que ya estaba bien (verificado, no asumido):** la colección tenía **1 lectura, escrita por
Danilo** desde la app el 08-08 a las 13:38 — o sea la **regla de Firestore y el índice compuesto
ya estaban probados con uso real**, que era justo lo que quedaba pendiente. Pero ese doc es
ANTERIOR al despliegue de las functions (09-08 16:57), así que el trigger nunca había corrido.

**Cómo se probó el trigger sin ensuciar el grupo:** crear una lectura **sana** (todos los
contadores en 0). El trigger corre, evalúa, no encuentra nada y no manda mensaje; el log
`protocolo baader142: baader-n3 sin alertas` es la prueba de que está enganchado. Después, una
con alerta (`fecha: '1999-01-01'` para que sea inconfundiblemente una prueba) para probar el
envío. **Ese segundo caso destapó el bug.**

**El bug:** Telegram devolvía `400 "Bad Request: message thread not found"` — el topic `equipos`
apunta a un hilo que ya no existe en el grupo. Y como `sendTelegramMessage` **loguea sin lanzar**,
la función terminaba en verde (`1 alerta(s) en baader-n3`) con el mensaje perdido. Todos los
viernes habría fallado en silencio.

**Dos arreglos (#412):**
1. `sendTelegramMessage` reintenta **sin topic** (hilo principal del grupo) cuando el error es
   "thread not found". Arregla de raíz el problema para cualquier función cuyo topic alguien
   borre — la línea ~2649 también usa `equipos` y muy probablemente venía fallando igual.
2. Las dos funciones del protocolo pasan a `getTopicId('general')`, que tiene uso diario
   verificado (Grader y Shoplogix mandan ahí). **Topics sanos: general, incidencias, repuestos.**

**Evidencia del antes y después**, misma prueba, mismo doc:
- 17:50:36 → `E ... 400 message thread not found` + `1 alerta(s) en baader-n3` (mensaje perdido)
- 18:02:04 → `1 alerta(s) en baader-n3`, **sin error** (mensaje enviado)

Los docs de prueba se borraron; la colección queda con la lectura real de Danilo, intacta.

- Estado: HECHO — #412 mergeado y desplegado.
- Sigue: confirmar visualmente en el grupo que llegó el aviso de prueba (fecha 1999) y avisar al
  equipo que era una prueba técnica.

## 2026-08-09 - claude - El protocolo de las Baader 142 ahora sale a buscar a la persona

El módulo Perilla 5 ya dejaba registrar los 13 contadores y ver la tendencia, pero había que
acordarse de ir a mirarla. Sin esto, la promesa de "intervenir ANTES de que pare" dependía de
la memoria de alguien. Dos funciones nuevas, con criterios deliberadamente distintos:

- **`recordatorioProtocoloBaader142`** (`onSchedule '30 16 * * 5'`, America/Santiago): viernes
  16:30, antes de que termine el turno. **Solo manda mensaje si falta registrar alguna de las
  tres máquinas**; si están todas, calla — un aviso que llega siempre se deja de leer (mismo
  criterio que el verificador de arranque de turno). Lista las que faltan con la fecha de su
  última lectura y repite la regla de no resetear.
- **`onProtocoloBaader142Created`** (trigger `onDocumentCreated`): al guardar una lectura la
  evalúa contra las dos anteriores de ESA máquina y avisa solo si hay algo que mirar.
- Ambas al grupo de mantención, topic `equipos`.

**Los tres criterios de alerta, y por qué cada uno:**
1. `umbral` — la tasa llegó a intervenir (30) o crítico (100). Es el ESTADO, no el movimiento:
   aunque no haya subido esta semana, sigue sin arreglarse (el mensaje lo dice: "Igual que la
   lectura anterior: sigue sin corregirse").
2. `tendencia` — subió en las dos últimas lecturas seguidas. **Se exige además llegar a
   "vigilar" (5)**, porque 0 → 1 → 2 por mil es ruido, no una tendencia; sin ese piso, el aviso
   se volvería ruido y nadie lo leería a la tercera semana.
3. `falla-dura` — paró con las correcciones en cero. No es desgaste: es inductivo, cable o
   bloqueo, y el mensaje manda a mirar el inductivo (B1…B5), no la correa. Avisa aunque la tasa
   sea baja, porque la máquina ya se detuvo.

- **La lógica vive aparte y con tests**: `functions/baader142/protocoloAlertas.js` (funciones
  puras sobre datos ya leídos) + `__tests__/protocoloAlertas.test.js`, **18 tests, todos verdes**
  con `node --test`. Se sigue el patrón de `functions/shoplogix/`, no el index monolítico.
  ⚠ **Esos tests NO corren en CI**: el vitest de `apps/pwa` solo incluye `src/**`, así que los
  12 tests de shoplogix tampoco corren. Deuda preexistente del repo, no la introduce este PR;
  se corrieron a mano y queda anotado.
- **Verificación mirando, no solo asserts**: `__tests__/previewMensajes.js` imprime los 7
  mensajes renderizados (sin HTML) para revisar la redacción antes de soltarla al grupo. Ahí se
  confirmó que el caso "más pescados con las mismas correcciones" NO dispara alerta, porque
  compara tasas y no totales — un test que solo mirara el total habría dado un falso positivo.
- **Sin índice nuevo**: el trigger y el recordatorio reusan
  `(plantId, maquina, fecha desc, createdAt desc)` que ya existe. El recordatorio hace 3 queries
  de `limit 1` en vez de una con `where fecha >=`, justamente para no pedir un índice más.
- **El primer deploy quedó en ROJO y hay que saber por qué (aplica a toda function nueva):** un
  `onDocumentCreated('col/{id}', fn)` **sin `region` explícita** lo crea firebase-functions v7 en
  la región de la BASE DE DATOS (`southamerica-west1`), no en us-central1. Las dos funciones
  quedaron desplegadas y operativas, pero el paso final del deploy falló con *"could not set up
  cleanup policy in location southamerica-west1"* → **exit 1**. O sea: CI en rojo con las
  funciones andando, que es la peor combinación porque esconde el próximo fallo de verdad.
  Fix (#410): forma con objeto `{ document, region: 'us-central1' }`, igual que
  `onShoplogixShiftStarted`. Y **hubo que borrar la función de la región vieja a mano**
  (`firebase functions:delete onProtocoloBaader142Created --region southamerica-west1 --force`)
  porque cambiar de región implica borrar+crear y el CI corre `--non-interactive` sin `--force`.
  Verificado después: `functions:list` no deja nada en southamerica-west1 y las dos funciones
  figuran en us-central1; deploy en verde.
- Estado: HECHO — #409 y #410 mergeados y desplegados.
- Sigue: la primera alerta real se verá cuando se guarde una lectura. Para probar el trigger sin
  esperar al viernes, basta guardar una lectura con `E82x-C` sobre 30 y ver si llega el mensaje.

## 2026-08-08 - claude - Perilla 5: notas compartidas, tema claro/oscuro y menos cascarón

Segunda tanda de feedback de Orel sobre el módulo.

- **Notas compartidas (era el pedido principal)**: hasta ahora vivían en el localStorage de
  cada teléfono, así que lo que anotaba un técnico no lo veía el del turno siguiente. Ahora
  van a **`baader142Notas`** vía PUENTE postMessage (el iframe no hereda la sesión de Firebase
  — mismo patrón que `PlanosAguasPage`). **La foto NO va en el documento**: se sube a Storage
  (`baader142Notas/{figura}/`) y en Firestore queda su URL, porque con la imagen en base64
  traer las notas de todas las figuras costaría decenas de MB; así cada doc pesa ~½ KB.
  Contenido vivo, no evidencia: cada uno edita y borra lo suyo, los admin cualquiera
  (regla como `planoNotas`, no como `variadoresCambios`). Abierto suelto desde OneDrive sigue
  usando localStorage + export/import, y el menú dice en cuál de los dos modos está.
- **Tema claro/oscuro**: el embed era una isla clara dentro de la app en oscuro. Se tokenizaron
  los ~26 colores fijos que quedaban (`--flag-*`, `--row-alt`, `--field`, `--map-*`…) y se agregó
  `:root[data-theme="dark"]` alineado con los tokens `--lc-*` del Centro de Aprendizaje. El tema
  entra por `?theme=` al montar (evita el parpadeo) y después por postMessage, porque recargar
  el iframe perdería el zoom y la figura abierta. **Las figuras conservan fondo blanco a
  propósito**: un dibujo técnico en negativo no se lee.
- **Cabecera**: ocupaba ~200 px con un título gigante y un párrafo de tres líneas, y dentro de la
  PWA además repetía el título que ya pone la página. Ahora es **una sola línea**, y embebida se
  oculta entera (`body.embed`).
- **"Mapa" → "Piezas"**, y su SVG de 660 px fijos (scroll horizontal obligado en el teléfono, y lo
  que Orel señaló como "metido a la fuerza") se rehízo como **tarjetas responsivas**: columna en
  móvil, grilla en pantalla ancha. Se conserva lo que valía —el orden de las estaciones y el
  "se revisa de la primera a la última"— y se gana legibilidad.
- **Ancho en PC**: la herramienta pasa de `max-w-5xl` a `max-w-[1400px]` y el `.wrap` del embed de
  820 a 1180 px. La vista de protocolo se queda angosta: es un formulario.
- **"Vacío" NO se quita** (Orel preguntó): es la causa raíz de "esófago demasiado largo" y
  "vísceras mal chupadas", que son los defectos de corte que más reporta el operador. Sin esa
  sección el técnico busca en el motor lo que está en el ciclón. Es §21 del manual, verificable.
- ⚠ **Bug de encoding que casi se publica**: ensamblar `part5.html` con
  `Get-Content | Set-Content -Encoding UTF8` en PowerShell 5.1 dejó BOM + **284 caracteres en
  mojibake** (`alcanzÃ³`, `SOLUCIÃ³N`) — visible en pantalla, invisible para tsc/eslint/tests.
  Reparado línea a línea (el archivo había quedado mixto: lo ensamblado roto, lo editado después
  sano). **Regla para el futuro: ensamblar SIEMPRE con Python `io.open(encoding='utf-8')`,
  nunca con `Get-Content | Set-Content`.**
- Verificación: tsc 0 · eslint 0 · **1038 tests verdes** · en 402×874 y en 1325 px de ancho:
  tema claro y oscuro, cabecera oculta al embeber, tarjetas de estaciones sin scroll horizontal,
  **paneo probado con arrastre sintético** (se mueve y frena en el borde: tras arrastrar 1500 px
  el clamp deja `tx=0`), y el flujo de nota **sin sesión** avisa y no pierde lo escrito.
- **NO verificado**: guardar/editar/borrar una nota CON sesión — necesita el login de Orel y la
  regla desplegada. Probar con una nota de prueba tras el merge.
- Estado: EN REVISIÓN — PR abierto. Rama `claude/perilla5-notas-compartidas`.

## 2026-08-08 - claude - Perilla 5: figuras anotables, zoom real y ajuste a iPhone

Feedback de Orel sobre el módulo recién desplegado: figuras repetidas, faltaba zoom/paneo,
quería anotar sobre las figuras, y el layout no cuadraba en su iPhone 16 Pro.

- **Duplicados: eran muchos más de los que se veían.** Un chequeo por hash perceptual
  (dHash 12×12, umbral Hamming ≤12) sobre las 55 figuras encontró que **9 de las 12 "fotos de
  campo" de Telegram eran capturas de páginas del manual** que ya estaban extraídas en mejor
  calidad (`foto-aj-centrador` = dib. 20, `foto-aj-expulsador` = dib. 63, etc.), y que
  **dib. 64 es la MISMA foto que dib. 35** — BAADER la publica dos veces (pág. 41 y 85).
  Se borraron 10 archivos, se dejó `ALIAS={'dib-64':'dib-35'}` para que el enlace del texto
  siga funcionando con un solo recurso, y sobrevivieron las 2 fotos realmente únicas (la
  disposición real de prismas y la nota manuscrita de medidas). De paso aparecieron **dib. 16
  y 17 (§12.3.1), que faltaban**: el grep textual no los encuentra porque su rótulo es solo el
  número dentro del cajón. Neto: 55 → **46 figuras**, y el HTML bajó de 2,5 a 2,07 MB.
- **Visor reescrito**: pinch-zoom, doble toque (acerca al punto / vuelve a encuadrar), paneo con
  clamp a los bordes, rueda en escritorio, botones ±/ajustar. Los pins se **contra-escalan**
  (`scale(1/s)`) para no crecer con el zoom — verificado: 28 px a 100% y a 225%.
- **Anotaciones sobre la figura**: pin en coordenadas relativas (0-1) para que quede en el mismo
  punto del dibujo con cualquier zoom o pantalla. Tres tipos: *nota* (círculo numerado, texto al
  tocar), *cota* (la medida se escribe sobre el dibujo, estilo LCD) y *foto* (se abre en el
  propio visor con su zoom). Hover en escritorio, hoja inferior en táctil. Persisten en
  localStorage con export/import JSON; las fotos del celular se comprimen a WebP ≤1100 px
  (una foto de iPhone de ~4 MB queda en ~100 KB) porque sin eso dos fotos llenaban la cuota.
  Las miniaturas con notas se marcan con borde naranja y contador.
- **iPhone 16 Pro (402×874)**: safe-areas (Dynamic Island y home indicator), breakpoint ≤460 px
  que cubre iPhone 16/16 Pro/Pro Max, **todos los inputs a 16 px** (bajo eso Safari hace zoom
  solo al enfocar), tocables ≥46 px, y en la PWA la descripción larga se oculta en móvil para
  que el iframe pase de 65% a **83% del alto** (el visor es `position:fixed` dentro del iframe,
  así que su pantalla completa ES ese alto).
- **Bug encontrado al verificar, no en el código**: el stage centraba por flex Y por transform a
  la vez, así que la figura terminaba fuera de pantalla (translate sumado al centrado del flex).
  Se ve solo mirando: los tests de estado daban todos verdes. Fix: canvas `position:absolute` en
  0,0 y el encuadre lo hace únicamente `fit()`.
- Verificación: tsc 0 · eslint 0 (1 warning preexistente) · **1038 tests verdes** · emulación
  402×874: sin scroll horizontal, flujo completo de nota/cota/foto probado punta a punta
  (crear → pin → tocar → ver foto ampliada → borrar), badges y export.
- Estado: EN REVISIÓN — PR abierto. Rama `claude/perilla5-visor-movil`.
- Sigue: si se quiere que las notas se compartan entre técnicos (hoy viven en cada teléfono),
  el paso es el puente postMessage → Firestore, como hace PlanosAguasPage.

## 2026-08-08 - claude - Perilla 5 · Diagnóstico BAADER 142 → módulo de Aprendizaje

- Origen: handoff de Claude mobile (sesión de terreno con Danilo, 08-08). La herramienta HTML de
  diagnóstico del selector 5 (S24) ya venía validada en planta; acá se integró a la PWA y se le dio
  la parte cuantificable: registro persistente del protocolo del Upgrade Kit + tendencia.
- **Módulo especial `/aprendizaje/perilla-5`** (patrón Variadores): entrada en SPECIAL_MODULES,
  ruta lazy en App.tsx, página `Perilla5Page.tsx` con dos vistas por `?vista=`:
  - `herramienta` (default): embed del HTML standalone (`public/perilla5-baader142-embed.html`,
    2.5 MB: 14 secciones, interpretador, 46 códigos con solución didáctica resumen/completo con
    porqués, 43 figuras del manual 1420000804 + 12 fotos de planta incrustadas como WebP).
    Acepta deep-links `?t=<sección>&q=<búsqueda>`.
  - `protocolo`: formulario de los 13 contadores (tasas /1000 en vivo con umbrales), guardado en
    **`baader142Protocolo`** (plantId 'chonchi' desde nacimiento, evidencia histórica: solo
    create+read) + tendencia Chart.js de las 5 tasas E82x-C por herramienta + historial con
    dominante. Máquinas: **baader-n1 (antigua) / n2 / n3** (orden confirmado por Orel).
- **Modo práctica runbook→herramienta**: `perilla5Practice.ts` (26 targets) + dispatcher por slug
  en `HmiPracticeButton` (antes hard-coded a grader). Los diagnosis E8xx de la ficha 142 ahora
  tienen botón "Abrir en Perilla 5" que abre el buscador con el código precargado.
- **firestore.rules**: bloque `baader142Protocolo` con validación campo a campo (estilo
  variadoresCambios: enum de máquina, fecha regex, 17 contadores int acotados, creadoPor==uid).
  ⚠ REQUIERE OK DE OREL (regla nueva). **firestore.indexes.json**: índice compuesto
  (plantId, maquina, fecha desc) — sin él la query de lecturas devolvería [] en silencio.
- Umbrales 5/30/100 etiquetados "criterio interno de Mantención ANTARFOOD" (sin respaldo de manual,
  regla del PR #310); todo lo demás citado a §22.4 / runbook E8xx.
- Verificación: tsc 0 · eslint 0 (1 warning preexistente de main en LearningHubPage) · **1038
  tests verdes (78 archivos)** · preview en wt (5174): herramienta carga con figuras y deep-link
  `?t=px&q=825` funciona, formulario precarga base 08-08 con tasas correctas (373 crítico rojo),
  tema claro Y oscuro OK, 375px sin scroll horizontal. NO verificado: escritura real a Firestore
  (la regla no está desplegada hasta el merge) — probar con UNA lectura tras el deploy.
- Gotcha de verificación que costó 10 min: un service worker viejo de otra sesión en :5174 servía
  un bundle sin la ruta nueva → redirect a /login. Desregistrar SW + borrar caches antes de
  verificar en un puerto reciclado.
- **Revisión cruzada** (subagente, protocolo de equipo): 5 hallazgos reales, todos corregidos en el
  2º commit — (1) staleness guard al cambiar de máquina (la respuesta lenta de N1 pisaba la lista
  de N2); (2) fecha por defecto LOCAL, no UTC (a las 20:00 de Chile el default caía en mañana —
  justo la ventana "fin de turno" del caso de uso); (3) orderBy secundario `createdAt` + índice
  de 4 campos (semanal + pre-reset el mismo día es el caso esperado); (4) tope de `fish` bajado a
  1M para calzar con los contadores (una lectura legítima con fish>2,7M era rechazada); (5) los
  mensajes guardado/error se limpian al cambiar de máquina.
- Estado: EN REVISIÓN — PR #402 abierto, CI build verde. Rama `claude/perilla5-baader142` (worktree wt-perilla5).
- Sigue: OK de Orel a la regla; tras merge+deploy: guardar 1 lectura real de prueba, después las
  base del 08-08; pedir a Danilo los datos pendientes del handoff (SM1/SM2 en pos.5, código del
  excavador A de la N1, test de persistencia de contadores, kit de N2/N3).

## 2026-08-05 - claude - Checklist de escalabilidad SaaS (docs, no toca la app)

- Hecho: auditoría de preparación de este repo para 100+ usuarios concurrentes (a raíz de
  una consulta del usuario, no de una tarea de TASKS.md). Diagnóstico real con evidencia:
  índices Firestore parcial, listeners `onSnapshot` sin `limit()` en incidents/photoEvidence,
  caché client-side solo puntual, 0 try/catch en `incidents.ts`, sin monitoreo de producción,
  Cloud Functions sin `minInstances`, sin rate limiting en rules. Conclusión: esta PWA (uso
  interno, una planta) no lo necesita hoy, pero se documentó como checklist reutilizable para
  proyectos futuros con más usuarios (ej. app NFPA/NEC).
- Archivos: `.ai/CHECKLIST_ESCALABILIDAD_SAAS.md` (nuevo), `CLAUDE.md` (sección Cambios recientes).
- Verificación: N/A — cambio 100% documental, sin tsc/eslint/preview.
- Estado: HECHO — PR #254 mergeado a `main`.
- Sigue: nada pendiente de esta sesión. El checklist queda para consultarlo cuando arranque
  un proyecto SaaS/multi-usuario nuevo.

## 2026-08-05 - claude - El sync captura el arranque anticipado del turno (FASE 2)

- Cierra lo que la fase 1 (#373) solo podia AVISAR: ahora los ciclos de antes de las 08:00 entran en el turno que les corresponde.
- **Tres cambios en `functions/shoplogix/sync.js`:**
  1. `fullDayWindow` empieza a las **06:00** en vez de las 08:00 (`WINDOW_START_HOUR`). El turno de dia arranca antes de las 08:00 de forma habitual — Chonchi 07:15, Filete 07:30, Yal 07:45 — y esos minutos caian en la consulta del dia ANTERIOR. **06:00 y no antes**: el nocturno de Chonchi termina 05:00, y arrancar antes metia su cola en el dia siguiente (el mismo problema con el signo cambiado).
  2. `deriveShiftGroups` separa por **continuidad temporal** ademas de por nombre: un hueco > 8 h entre intervals del mismo turno significa que son turnos de dias distintos. Sin esto, con la ventana ensanchada el "Turno 2" de ayer y el de hoy colapsaban en un grupo de 24 h — que es exactamente el bug que se veia en produccion. La clave del grupo pasa a ser `nombre + dia de inicio`.
  3. **`isTruncatedHeadOfPrevWindow`**, espejo del guard de cola del PR #354. Hace falta PORQUE la ventana se ensancho: ahora la consulta de un dia ve la cola del nocturno del dia anterior (Yal `Turno 3` iba 00:00->08:00) y ese fragmento apunta al mismo doc que la ventana anterior ya escribio entero. Mismas dos condiciones que el de cola, y por la misma razon: solo una de las dos romperia un turno legitimo.
- `shoplogixProbe` ahora llama a `fullDayWindow` en vez de replicar la ventana a mano. La copia desfasada ya habia hecho que el debug concluyera "no hay datos" en falso.
- **Tests: de 104 a 138.** Las cuatro funciones del corazon del sync (`fullDayWindow`, `deriveShiftGroups`, `shiftDateKeyFromStart`, `currentDateKey`) **no tenian ninguno** — se escribieron ANTES de tocar nada, y de los 14 iniciales 12 pasaban (red de seguridad) y 2 fallaban a proposito (los dos cambios). Uno de mis tests estaba mal, no el codigo: `currentDateKey` a las 06:30 de Chile SI devuelve el dia anterior.
- **Verificacion con la serie REAL** (`serieRealArranqueAnticipado.test.js`): reconstruida a partir de la respuesta del probe, reproduce sus tres conteos exactos (93 Turno 2 / 102 Unscheduled / 93 Turno 1), lo que confirma que representa el dia de verdad. Con ella: el Turno 2 se separa en dos, el de ayer termina 15:00 y deja de absorber, el de hoy arranca 07:15, el nocturno no se parte y el Unscheduled sale como UN bloque 15:00->07:15 igual que en Shoplogix.
- Mutation test: volver la ventana a 08:00, quitar la separacion por hueco y ponerla en 1 h hacen fallar sus tests respectivos.
- Estado: EN REVISION - PR abierto. **El deploy de functions es automatico al mergear.**
- **Sigue, y hay que hacerlo con cuidado:** despues del deploy, correr `shoplogixBackfillRange` de UN dia (05-ago), verificar los docs con la lectura de Firestore, y recien entonces backfillear el resto de los dias contaminados (Filete 12, Yal 6, Chonchi 2). Antes del backfill masivo, snapshot.

## 2026-08-05 - claude - La ventana del turno la manda Shoplogix, no una tabla del codigo (FASE 1)

- Orel reporto que el turno de hoy corrio desde las 7:15 pero el Analisis lo tomaba desde las 8:00. Investigado contra PRODUCCION (probe de Shoplogix + lectura de Firestore), y result?? ser mas grave: **las piezas no se pierden, se le suman al dia anterior**.
- `2026-08-04_Turno 2` esta guardado como 04-ago 08:00 -> **05-ago 08:00** (24 h) con 16.398 ciclos: incluye los 45 min de arranque de HOY. Y el doc de hoy nace a las 08:00 sin ellos.
- Causa: `fullDayWindow` consulta 08:00 -> 08:00, asi que lo producido antes del ancla cae en la consulta del dia anterior. **No es un evento raro: es sistematico** — Filete 12 de 31 docs (arranca 07:30 todos los dias), Yal 6 (07:45), Chonchi 2 (07:15).
- **El dato correcto YA estaba guardado**: `officialSchedule` (rollup del whiteboard) dice 07:15->15:00 en los dos docs. El pipeline lo ignoraba.
- Y el "Programado 09:00-17:15" que mostraba la app **no venia de Shoplogix**: es un literal de `plantLines.ts:144` que en turno EN CURSO le ganaba a Shoplogix. Llevaba dias desactualizado.
- **Esta fase NO toca el sync ni los datos.** Arregla lo que se AFIRMA sobre ellos: `graderShiftWindow.resolveShiftWindow` resuelve la ventana real y expone `missingHeadMin` (minutos de arranque sin datos) y `earlyStartMin` (arranque anticipado real). Nuevo componente `TurnoVentanaAviso` lo dice en pantalla en vez de dibujar un turno que empieza a las 08:00 como si fuera la realidad.
- **Dos reglas que costaron una iteracion cada una**, ambas encontradas por tests existentes:
  1. NO se puede preferir siempre el oficial: en `yal 2026-08-02` el turno produjo desde las 14:00 con el whiteboard declarando 16:15 — arranque anticipado real de 2 h 15 que solo lo observado ve.
  2. NO se pueden UNIR siempre las dos ventanas: un turno declarado 09:00-17:15 que produjo 09:05-17:02 corrio 09:05-17:02; unir infla la ventana con tiempo muerto y empeora la disponibilidad. La regla final es **manda lo observado salvo que venga contaminado por el borde**, detectado por evidencia contra lo declarado (cabeza en el ancla / cola desbordada), nunca por duracion — un `Unscheduled` real dura 16 h 48 y es legitimo.
- La matriz de periodo usaba `effective`, que viene CLIPEADO a la ventana de consulta y por eso heredaba el recorte (24 h en el doc de ayer). Ahora las dos superficies usan la MISMA funcion.
- Verificacion: tsc y eslint limpios (1 warning preexistente, verificado con stash) - **801 tests** (20 nuevos) - mutation test: mover el ancla de 8 a 9 hace caer 2 tests - los 5 casos reales de produccion comprobados en el navegador con los modulos reales - la matriz sobre el fixture de julio no cambia (44 turnos, ninguno sobre 20 h).
- **NO verificado**: la vista de turno renderizada (pide sesion). Por eso el aviso se extrajo a componente propio, que si tiene test de render.
- Estado: EN REVISION - PR abierto.
- **Sigue (FASE 2, el backend)**: ensanchar `fullDayWindow` hacia atras y separar los grupos por dia para que los ciclos de 07:15-08:00 entren en el turno correcto. Toca el CF que corre cada hora, no tiene NINGUN test (`fullDayWindow`, `deriveShiftGroups`, `shiftDateKeyFromStart` y `syncDay` estan sin cubrir) y hay 9 lugares acoplados al ancla 08:00, incluido el guard del PR #354. Ademas queda backfillear los dias ya contaminados.

## 2026-08-05 - claude - Comparativo de periodo (formato C): la hoja que contesta "vamos mejor?"

- Cierra los tres formatos del mockup aprobado. A (#359) y B (#364/#366) explican UN turno; un turno aislado nunca puede demostrar mejora continua. Este toma el mes.
- **La decision que ordena todo el texto**: separar lo que Mantencion controla (MTTR, averias resueltas, micro absorbidas) de lo que no (cuantas maquinas arrancan el turno). Mezclarlos produce el reporte de siempre — "el mes estuvo malo" — que no dice a quien le toca hacer que.
- **No inventar tendencias.** Con menos de 4 turnos la hoja dice que no hay tendencia en vez de dibujar una flecha. Las mitades se comparan por MEDIANA, no por media: un solo turno catastrofico al final arrastraba la media y daba "sin tendencia" en un mes que subio de 45% a 80%.
- **Tabla adaptativa**: hasta 12 turnos va uno por fila; sobre eso agrupa por tipo de turno (que contesta "hay un turno que anda peor?") y DICE que esta agrupando. Nunca se recorta en silencio.
- **Primitivas de dibujo compartidas** (`graderExecutiveCanvas`): encabezado, veredicto, KPIs, cierre y pie ahora viven una sola vez, y las usan el PNG del turno y el del periodo. El refactor del PNG de turno se probo comparando el canvas fila por fila contra el original: **2.094 filas identicas, 0 diferencias**; la unica variacion es que la hoja crecio 40 px de margen inferior, porque la medicion de los KPIs decia 108 y el dibujo avanzaba 128 (desfase preexistente, ahora corregido).
- Las pausas NO vienen en el hook del periodo (viven en una subcoleccion y encareceran la matriz, que se abre muchas veces al dia): `graderPeriodReliability` las carga recien cuando alguien pide el comparativo, y saca el conteo por turno llamando a `computeMaintenanceReliability` turno a turno en vez de reimplementar el criterio de que pausa cuenta como averia.
- **Mirar la hoja encontro 4 bugs que ningun test habria pillado**: el cierre declaraba "disponibilidad resuelta" con 58% de uptime; se rankeaba "mas disponible" un 59% contra un 58%; el titulo decia "Agosto de 2026"; el rango repetia el mes ("1 ago - 5 ago"). Con datos reales de julio de Yal aparecio un quinto: un tipo de turno con UN solo registro al 0% se llevaba la etiqueta "menos disponible" del mes. Todos con test.
- Banco de pruebas nuevo en **`/dev/resumen-periodo`** (6 casos, una por rama del veredicto) y los botones enchufados tambien a `/dev/matriz-turnos`, para poder verlos sin sesion.
- Verificacion: tsc y eslint limpios - **781 tests** (27 nuevos) - mutation test: subir `ROW_H` y bajar `HEALTHY_UPTIME_PCT` hacen fallar sus tests. Con **jsPDF real** en el navegador: 1 sola pagina. Los botones se probaron con clic real en `/dev/matriz-turnos`: disparan `resumen-periodo_fixture.png`. **NO verificado**: la carga de pausas desde Firestore, que necesita sesion.
- Estado: EN REVISION - PR abierto.
- Sigue: que Orel baje el comparativo de agosto real y confirme que se entiende.

## 2026-08-05 - claude - Boton del resumen ejecutivo (PNG) en la vista de turno

- Cierra el enganche que quedaba de los formatos A y B: el PNG solo existia en el banco de pruebas. Ahora hay un boton propio junto al de PDF en la barra del detalle de turno.
- Usa el MISMO modelo que la pagina 1 del PDF (`buildExecutiveSummary`), asi que ambos cuentan lo mismo del turno. A diferencia del PDF **no necesita el grafico de ECharts**: se dibuja entero en canvas, asi que no hay que esperar a que ninguna pestana renderice — el PDF si tiene ese sondeo desde que el detalle paso a pestanas (#361).
- La ventana del turno sale de `shiftWindow` (la real de Shoplogix) con fallback al `startAt/endAt` del Excel. `shiftWindow` trae ISO strings y el resumen espera `Date`: helper `toDateOrNull` para no repetir la conversion.
- El nombre del archivo usa `displayShiftName`, asi que sale `resumen-turno_2026-08-03_Turno-1.png` y no "Turno 1 Lunes" con espacios.
- Verificacion: tsc limpio; el warning de eslint en esa pagina es PREEXISTENTE (verificado con stash). En el navegador se ejecuto la **replica exacta del handler** con los modulos reales: `Turno 1 Lunes` -> titulo "Turno 1", veredicto "Baader 2 no produjo un solo ciclo", KPI de disponibilidad 39% desde `lineAvailability`, canvas 2480x1930 dibujado. **NO se vio el boton en pantalla**: la vista de turno pide sesion.
- Estado: EN REVISION - PR abierto.
- Sigue: que Orel confirme el boton y el PNG resultante. Queda el **formato C** (comparativo de periodo), que necesita decidir que periodo compara por defecto.

## 2026-08-05 - claude - PDF de turno con el resumen ejecutivo como pagina 1 (formato B)

- Cierra el formato B del mockup. El PDF abria con el timeline minuto a minuto: habia que leer tres paginas para saber si el turno estuvo bien o mal. Ahora la pagina 1 es el resumen ejecutivo (mismo modelo que el PNG del #359) y el detalle arranca en hoja nueva.
- **graderExecutivePdfPage.ts** - renderiza el ExecutiveSummary en jsPDF. Comparte modelo con el PNG a proposito: si el PNG dice que el turno se perdio por la Baader 2, el PDF no puede decir otra cosa. Se tipa contra una interfaz PdfDoc minima (solo lo que se usa) en vez de contra jsPDF entero.
- El resumen se arma DENTRO de exportTurnToPDF con lo que ya recibia (summary + pauses + upstreamSnapshot): computeMaintenanceReliability se llama ahi, asi que **no hubo que tocar el llamador**. Se agregaron shiftStart/shiftEnd opcionales para la ventana real.
- **Secciones vacias**: las 4-7 ya tenian guardas. La que faltaba era la tabla de KPIs, que con totalPieces=0 imprimia "0 pz / 0,00% P0" - eso se lee como "no hubo piezas malas" cuando en realidad NO SE MIDIO. Ahora sin Excel dice "Datos del Grader: sin Excel cargado".
- **Rompi los tests existentes de graderTurnToPDF** (16): su mock de jsPDF no tenia setLineWidth/setFillColor/rect/splitTextToSize, que la pagina ejecutiva si usa. Arreglado el mock - un mock que no refleja la API usada da verde falso.
- Verificacion: tsc y eslint limpios; **556 tests** en la suite grader (7 nuevos de la pagina PDF, con doble de jsPDF que registra lo dibujado). **Comprobado que los tests pueden fallar**: rompiendo contentW cae el de "nada se sale del ancho". Con jsPDF REAL en el navegador: la pagina ejecutiva termina en y=203,9 de 297 mm (93 mm libres, 1 sola pagina, 10,7 kB) y el flujo completo corre sin errores de consola.
- Banco de pruebas: /dev/resumen-turno ahora tiene "Descargar PDF completo" ademas del PNG.
- Estado: EN REVISION - PR abierto.
- Sigue: **formato C** (comparativo de periodo) - necesita decidir que periodo compara por defecto. Falta enganchar el boton del PNG en la vista de turno real (el PDF ya usa el boton existente).

## 2026-08-04 - claude - Resumen ejecutivo del turno (PNG) - formato A del mockup

- La exportacion anterior apilaba todo (timeline, KPIs, pausas, gates, causas, upstream) sin jerarquia ni conclusion: sirve de registro tecnico, no de entregable. Mockup con 3 formatos aprobado por Orel; se construye el A (ejecutivo) y despues el B (PDF completo con este como pagina 1).
- **graderExecutiveSummary.ts** - logica PURA que responde 4 preguntas EN ORDEN: como fue (verdict), por que (cause+machines), que hizo Mantencion (maintenance), que se necesita (ask). Los dos renderers consumen el mismo modelo, asi que PNG y PDF no pueden contar historias distintas del mismo turno.
- Decisiones de redaccion que importan: el veredicto NOMBRA la maquina parada (no solo "turno malo"); los KPIs traen su contexto ("39% de 7 h 09 de turno" en vez de "39%"); MTTR bajo se marca OK - es el unico KPI donde menos es mejor, y sin eso un turno malo con buena respuesta se lee como todo malo; sin Excel del Grader lo DICE en vez de imprimir ceros que se leen como "no hubo".
- **Bug que cazo un test**: el lossDriver no tenia opcion "ninguna" y caia a 'ritmo' por defecto, asi que un turno sano al 95% afirmaba haber corrido bajo el objetivo. Un reporte que inventa una perdida inexistente es peor que uno que no dice nada. Se agrego 'ninguna' + umbrales explicitos.
- **graderExecutiveSummaryPng.ts** - canvas nativo, NO html2canvas: el DOM real depende del tema, del CSS que soporte el parser y de que el nodo este visible; para algo que se manda a gerencia es demasiada superficie de falla. Dibujo determinista, siempre en claro (se imprime).
- **pages/dev/ResumenTurnoDevPage** (solo dev, /dev/resumen-turno): dibuja el PNG real con 3 turnos conocidos, sin login. El entregable hay que MIRARLO antes de que salga.
- Verificacion: tsc y eslint limpios; 15 tests con el turno REAL del 3-ago (Baader 2 en cero). En el navegador: canvas 2480x2094 dibujado, veredicto y pedido correctos, y barrido de pixeles del margen - la unica tinta cerca del borde son los bordes de los recuadros con su antialiasing (3 franjas, a 4-7 px), no texto desbordado.
- Estado: EN REVISION - PR abierto.
- Sigue: **formato B** (PDF con este resumen como pagina 1 y el detalle detras) y despues el C (comparativo de periodo, que necesita decidir que periodo compara). Falta enganchar el boton en la vista de turno real.

## 2026-08-04 - claude - Leyenda del grafico de ritmo: dejaba de estar tapada por las lineas

- Orel: "los puntos de baader 1... baader 2... quedan ocultos". Causa exacta en `ProductionRateLineEC`: `legend.top: 0` con `grid.top: 6` — ECharts NO reserva el alto de la leyenda solo, asi que la leyenda se dibujaba ENCIMA del area del grafico y las lineas (incluidas las punteadas de Promedio y Objetivo) pasaban por detras del texto, que se leia tachado. Con un canvas de 120 px el solape era total.
- Hecho: `grid.top` 6 → 22 (reserva la banda de la leyenda), alto del contenedor 120 → 142 para devolverle al plot lo que la leyenda ahora ocupa, texto de leyenda 9 → 10 px y de `#64748b` a `#94a3b8` (es la clave de lectura del grafico, no chrome secundario), `itemGap: 12`.
- Geometria verificable sin navegador: area de datos 114 px → 120 px. El grafico NO se achica — gana 6 px Y deja de estar tapado.
- Revisado si el patron se repetia: `UpstreamMachinesPanel` ya tenia `grid.top: 30` con `legend.top: 0` (correcto) y `StateTimelineEC` no tiene leyenda. El bug era solo de este componente.
- Archivos: `components/grader/ProductionRateLineEC.tsx`.
- Verificacion: tsc limpio; los 6 warnings de eslint son PREEXISTENTES (verificado con stash: 6 con y sin el cambio). NO verificado visualmente: el grafico vive en el detalle de turno, que pide sesion.
- Estado: EN REVISION — PR abierto.
- Sigue: que Orel confirme que ya se leen. Pendiente mayor: exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos de gerencia).

## 2026-08-03 - claude - La card de cuota del turno se ve siempre

- Orel: "recuerdo q antes podiamos asignarle a cada turno la cuota... ahora no veo la opcion". No era una regresion: `ShiftQuotaCard` seguia montada en el detalle del turno, pero hacia `return null` cuando NO habia cuota definida Y el usuario no tenia permiso (`allowEdit={isAdmin || isSupervisor}`). Resultado practico: la funcion entera parecia no existir — nadie sabia que habia cuota por turno.
- Hecho: sin cuota la card SIEMPRE se renderiza. Con permiso, el CTA "Definir cuota" de siempre. Sin permiso, el mismo estado + "La define un supervisor" — se dice que falta y quien puede hacerlo, en vez de ofrecer un boton que seria un callejon sin salida.
- Regla que deja el caso: **un `return null` por permisos esconde la FUNCIONALIDAD, no solo el control**. Si el usuario no puede actuar, mostrar el estado y quien puede.
- Archivos: `components/grader/ShiftQuotaCard.tsx` (+ doc de cabecera, que describia el comportamiento viejo), `components/grader/__tests__/ShiftQuotaCard.visibility.test.tsx` (nuevo).
- Verificacion: tsc y eslint limpios; 4 tests que renderizan el componente real. **Comprobado que los tests pueden fallar**: restaurando el `return null` caen 2 de 4. NO verificado en la app viva — el detalle de turno pide sesion y la del preview se perdio al reiniciar el server.
- Estado: EN REVISION — PR abierto.
- Sigue: que Orel confirme que ahora la ve. Pendientes de la sesion: exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos de gerencia) y leyenda ilegible del grafico de Baaders.

## 2026-08-03 - claude - Afinado de la matriz de turnos: 4 fixes de uso real

- Orel probo la vista en prod y reporto 4 cosas. Todas verificadas en el navegador, no solo compiladas.
- **"Ver turno" no hacia nada** (bug real): navegaba a `/analisis-grader?date=…&shift=…&autoload=1`, pero ya estabamos EN esa ruta → React Router no remontaba nada. Existe una ruta CANONICA de detalle, `/analisis-grader/turno/:dateKey__:shiftId`, que es a donde apunta ahora. Verificado: navega a `/analisis-grader/turno/2026-08-03__Turno%201%20Lunes`.
- **"Turno 1 Lunes"**: Shoplogix pega el dia de la semana a algunos shiftId. El dia ya se ve en la columna de la matriz, asi que repetirlo confunde ("¿por que Lunes? quitalo"). Nuevo `displayShiftName()` quita SOLO el sufijo de dia; el shiftId crudo se conserva intacto (es la clave de Firestore y lo que se manda a la ruta de detalle). Tambien en el aria-label, que decia una cosa distinta a la pantalla.
- **Vista Lista retirada** ("no la entiendo... mejor quitemosla y solo con la vista matriz"). Se borro el componente y el toggle. En pantalla angosta la matriz hace scroll horizontal — se ve menos mes, pero lo que se ve es cierto.
- **Salto de layout al seleccionar un turno**: el panel de abajo pasaba de una linea de placeholder a una fila de datos (que ademas envuelve a 2 en pantallas medianas) y la pagina daba un tironazo. Alto reservado con `min-h`. Medido en el navegador: delta 0 en el panel, en `scrollHeight` y en la posicion de las celdas.
- Archivos: `services/grader/graderShiftDisplay.ts` (+`displayShiftName`), `components/grader/GraderShiftPeriodMatrix.tsx`, `GraderShiftPeriodView.tsx`, borrado `GraderShiftPeriodList.tsx`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificacion: tsc y eslint limpios; 534 tests verdes (4 nuevos de `displayShiftName`, incluido "solo el SUFIJO" y "nunca devuelve vacio"); los 4 fixes comprobados en el navegador con datos reales.
- Estado: EN REVISION — PR abierto.
- Sigue: Orel pidio mejorar la exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos tipicos de gerencia) — trabajo aparte, no entra aca.

## 2026-08-03 - claude - Retirado GraderHistoricalCalendar (5.756 lineas) del bundle

- Cierra el pendiente que dejo #349: el calendario ya no se montaba en el Wizard, pero seguia entrando al bundle por imports estaticos. Ahora se borro el archivo.
- Hallazgo al revisar antes de borrar: `AnalisisGraderUploadPage` SI lo montaba (`<GraderHistoricalCalendar />`, linea 446), pero en una rama inalcanzable — el Wizard es su unico consumidor y siempre pasa `compact`, que retorna antes en la linea 386. Codigo muerto en runtime, peso vivo en el bundle.
- Lo que exportaba y habia que mudar antes de borrar: `fmtSecPanoramic` y el tipo `SlxMonthlyStats` (los usan `GraderMonthlyStatsPanel` y el Wizard) → pasan a `graderPeriodMonthlyStats.ts`, su nuevo dueno, con `SlxMonthlyStats` como alias del tipo nuevo para no tocar consumidores. Se agregaron los contadores `t1/t2/t3ShiftsWithData` que el panel usa y que mi tipo no tenia.
- Efecto colateral detectado y cubierto: el calendario era el UNICO emisor de `graderSelectionStore.setSelectedHistorical`, que consume `AnalisisGraderGatesConfigPage` para calibrar el peso medio. Sin reemplazo esa pagina caia siempre a su fallback (summary mas reciente de 60 dias) en silencio → ahora lo emite `GraderShiftPeriodContainer` al seleccionar un turno.
- Medicion: el chunk `AnalisisGraderWizardPage` pasa de **481 kB** (lo que sirve prod hoy, medido por curl al bundle publicado) a **344 kB** — **-137 kB, -28%**.
- Archivos: borrado `components/grader/GraderHistoricalCalendar.tsx`; tocados `services/grader/graderPeriodMonthlyStats.ts`, `components/grader/{GraderMonthlyStatsPanel,GraderShiftPeriodContainer}.tsx`, `pages/AnalisisGrader/{AnalisisGraderUploadPage,AnalisisGraderWizardPage}.tsx`.
- Verificacion: tsc y eslint limpios (el warning de `lineId` en UploadPage es PREEXISTENTE — verificado con stash contra main); 530 tests verdes en la suite grader; `vite build` OK.
- Estado: EN REVISION — PR abierto.
- Sigue: uso real en prod. `graderSelectionStore` quedo con un solo emisor nuevo — si la matriz cambia de forma, revisar que GatesConfigPage siga recibiendo la seleccion.

## 2026-08-03 - claude - Matriz de turnos reemplaza al calendario mensual del Analisis Grader

- Problema raiz (planteado por Orel): el calendario usa el DIA como contenedor, asi que un turno que cruza medianoche se partia en dos fragmentos (`salida` + `madrugada`), con 4 `CardKind` solo para tapar el corte. El contenedor pasa a ser el TURNO: una fila por shiftId presente, una columna por dia, cada turno UNA celda anclada al dia en que arranca. Toggle Matriz/Lista (nunca ambas; bajo 700 px fuerza Lista), tooltip flotante al hover, panel del turno seleccionado con boton "Ver turno" (mismo destino que el "Cargar" del calendario), navegacion de mes y stats mensuales portadas (`computePeriodMonthlyStats`).
- **Unscheduled**: investigado contra Firestore crudo — NO es un turno, es la ventana 00:00-24:00 donde Shoplogix reporta lo que cae fuera de las ventanas configuradas, pero su subcoleccion trae `intervals[]` con timestamps. Decision de Orel (reafirmada 3 veces): CERO ciclos sin asignar → se atribuyen al turno mas cercano (mismo dia primero; si el dia no tiene turnos, cruza de dia). Auditable en `attributedCycles` → "(+N)" ambar en tooltip/panel; chip informativo "fuera de ventana N %". Verificado en vivo: la madrugada huerfana del 02-ago (293 cic) fue al Turno 1 Lunes del 03 (3.720+293=4.013 exacto). Diagnostico completo y correcciones de Shoplogix en `ARIA_MANTENIMIENTO_PLANTA/docs/INFORME_UNSCHEDULED_SHOPLOGIX.md` (hallazgo gordo: Yal dejo ~126k ciclos fuera de ventana en mayo).
- Datos: 2 queries/mes (padres con agregados + summaries) + 1 query por bloque Unscheduled (2-3/mes). Un padre = una entrada → el doble conteo por alias (`Turno dia`→`Turno 2`) es imposible por construccion, no mitigado. Rampa secuencial de 4 pasos derivada del azul de marca en OKLCH y validada por script (tokens `--shift-ramp-*` en index.css, claro y oscuro por separado).
- Bug que solo aparecio validando contra prod: `2026-07-31_Turno 1` de Chonchi tiene dateKey 31-jul pero su produccion real fue 01:34-05:11 del 1-ago — medir el cruce start-vs-end no lo detectaba; ahora los offsets se miden contra el dia de anclaje (`startDayOffset`/`endDayOffset`, marcador ⁺¹ siempre). Ademas: terminar 00:00 en punto NO es cruce (4 de 5 "cruces" de Yal-julio eran eso).
- Archivos: `services/grader/{graderShiftPeriod,graderShiftMatrixKpi,graderPeriodMonthlyStats,graderUnscheduledAttribution,graderUnscheduledLoad}.ts`, `hooks/useGraderShiftPeriod.ts`, `components/grader/GraderShiftPeriod{Matrix,List,View,Container}.tsx`, `pages/dev/MatrizTurnosDevPage.tsx` (banco de pruebas con fixture real, solo dev), `__tests__/` (4 suites + fixture `shiftPeriod.real.json` con datos de prod), `scripts/{validate-shift-period,export-shift-period-fixture}.js` (solo lectura), `App.tsx`, `index.css`, `AnalisisGraderWizardPage.tsx` (calendario retirado).
- Verificacion: tsc y eslint limpios; 56 tests de la vista (21 casos escritos + regresion contra 165 turnos reales exportados de Firestore, con test de conservacion: ni un ciclo perdido ni duplicado); grader suite completa 462 verdes (falla preexistente de `graderShoplogixWindows` por .env, tambien en main); verificado EN VIVO en la pagina real con sesion de Orel (tooltip a 8 px de la celda, atribucion 3.720+293, fila "Sin turno" desaparecida).
- Estado: EN REVISION — PR abierto.
- Sigue: correcciones de configuracion en Shoplogix segun el informe (ventana T2 de Yal, madrugadas de Chonchi); despues de corregir, `backfill-shoplogix-history.js` para limpiar en origen. `SlxMonthlyStats.perMachineMonth.maintMacro/Micro` depende de que los padres traigan `stateAggregates` (los viejos no). Retirar `GraderHistoricalCalendar` del bundle cuando la matriz se asiente (hoy quedo sin montar pero el archivo sigue).

## 2026-08-02 - claude - Primer turno real de Filete revisado + 2 textos que asumian eviscerado

- Revision del turno del sabado 01-08 (el primero real de Filete) con datos de Firestore y la vista en el navegador. Resultado del TURNO: 180 pz en "Turno Dia" + 60 en Unscheduled = 240 de las 5.000 planificadas (4%), 22 min de uptime sobre una ventana efectiva de 12:57→14:45, velocidad real maxima 7,2 pz/min contra un objetivo de 20, y 16 paros (11 micro). Fue arranque, no produccion.
- Dato importante para el modelo: **Shoplogix YA acota el turno de Filete** (08:00→14:45, no las 24 h de la semana pasada), asi que el "Turno Dia" dejo de ser un bucket de 24 h. El encuadre automatico igual se activa porque la operacion real ocupa el 26% del turno.
- **`scrapReasons` volvio VACIO** con produccion real → se descarta la Calidad automatica en Filete. Su OEE se queda en A×R (ya rotulado).
- 0 de 16 paros trajeron causa del sensor → confirma que el panel de causas dictadas es la unica via. Nadie lo uso todavia (0 anotaciones).
- Bugs de copy encontrados al revisar (mismo patron de siempre: texto que asume eviscerado): (1) `shortMachineName` renombraba a "Baader N" cualquier maquina terminada en numero, asi que la Baader 200 —que Shoplogix llama "Linea 1"— aparecia como "Baader 1" en la cascada de perdidas, confundiendola con las 142; ahora solo traduce evisceradoras y el resto se muestra tal cual. (2) `DayTimeSummaryBar` decia "las 3 Baader" tambien en Filete; ahora el texto sale de las maquinas de la linea ("la Baader 200" / "las 3 Baader 142").
- Nota: `endBriefSentAt` se estampa en el claim ANTES de evaluar el umbral de piezas, asi que marca "procesado", no "enviado". El turno de 180 pz quedo marcado pero NO se mando brief (180 < 200) — comportamiento correcto, nombre de campo enganoso.
- Archivos: `apps/pwa/src/services/grader/{graderMachineNames.ts,__tests__/graderMachineNames.test.ts}`, `apps/pwa/src/components/grader/DayTimeSummaryBar.tsx`.
- Verificacion: 864 tests verdes (2 nuevos de regresion), tsc y eslint limpios. En el navegador con el turno real: Filete dice "la Baader 200" y "Linea 1"; Yal sigue diciendo "las 3 Baader 142" y "Baader 1/2/3".
- Estado: EN REVISION — PR abierto.
- Sigue: cuando haya un turno de verdad (~5.000 pz) revisar el grafico de barras con la maquina corriendo, y que alguien dicte la primera causa en planta.

## 2026-08-01 - claude - El encuadre del eje ahora funciona en TODAS las lineas (y en turno en curso)

- Orel: "ahora si funciona en filete... podemos ponerlo en las demas?". El chip YA aparecia en Yal y Chonchi, pero ahi no hacia nada: el estado era un booleano "ver turno completo" y el encuadre pasaba SIEMPRE por la heuristica, que en esas lineas dice que no hace falta acotar (su turno si esta acotado). O sea el boton era de una sola via.
- Hecho: el estado pasa a override de 3 valores — `auto` (heuristica) / `produccion` / `turno` — y los explicitos MANDAN. Regla extraida a `resolveFraming` (pura, testeada) y usada por el TurnoPage.
- Verificado con datos reales en las 3 lineas, leyendo `data-axis-*` (el rango EFECTIVO, no la etiqueta): Yal 15:15–23:00 → 15:30–22:05 · Chonchi arranca acotado 09:00–12:50 · Filete 09:45–16:25 ↔ 08:00–08:00. Y **en el turno EN CURSO de Yal** (17.872 ciclos, sync hace 5 min): 15:15–23:16 ↔ 16:00–23:19, con el borde derecho avanzando con la ultima pieza.
- Bug adicional encontrado en el camino: el chip mostraba el rango del PROP y el eje dibujaba otro (en turno en curso decia "14:45–00:00" mientras el eje era 15:15–23:09, los bounds del snapshot que crecen con cada sync). Ahora la etiqueta sale de la ventana RESUELTA — un chip que anuncia un rango distinto al dibujado es peor que no tener chip.
- Archivos: `apps/pwa/src/components/grader/{UpstreamMachinesPanel.tsx,shiftTimelineHelpers.ts,__tests__/resolvePanelWindow.test.ts}`, `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 789 tests verdes (4 nuevos de `resolveFraming`, incluido "el usuario puede forzar el encuadre donde la heuristica dice que no"), tsc y eslint limpios.
- Estado: EN REVISION — PR abierto.
- Sigue: hoy sabado arranca el proceso normal de Filete (5.000 pz/turno, 2 turnos).
## 2026-08-01 - claude - Barrido de worktrees y ramas locales: 141 ramas -> 11, 6 worktrees -> 3 (+ PR #324)

- Contexto: el repo habia acumulado 141 ramas locales y 6 worktrees de trabajo ya cerrado. Se barrio en tandas, verificando cada una antes de borrar. Ningun cambio de codigo salvo el PR #324.
- **Criterio que se uso (y por que el obvio NO sirve):** "el PR esta MERGED" es insuficiente. Como el repo mergea con SQUASH, los commits de la rama no quedan como ancestros de main (`git merge-base --is-ancestor` da falso, y `git cherry` marca todo como ausente por patch-id distinto). El criterio correcto resulto ser: comparar el **SHA local de la rama contra `headRefOid` del PR** (la punta que tenia al mergear, se saca en UNA llamada: `gh pr list --state merged --json headRefName,headRefOid`). Si coinciden, todo su trabajo entro. Si el local es distinto, la rama AVANZO despues del merge y hay commits sin publicar.
- **Ese criterio evito borrar trabajo en curso:** 4 ramas habian avanzado tras su merge, entre ellas `fix/b142-diagnosis-overrides`, cuyo commit posterior (`3fa043be`, el fix que hace que la 142 lea los diagnosticos del admin) todavia no estaba en main. Con el criterio ingenuo se habria borrado el trabajo en curso de otra sesion.
- Hecho: (1) 121 ramas con PR mergeado y punta identica a la mergeada; (2) 11 de las 12 que NO tenian PR — 9 del HMI Grader (main tiene `hmi-grader-embed.html` en 2578 lineas vs 1071-2360 de las ramas; sus lineas propias son andamiaje de fases intermedias), `feat/levantamiento-tableros-v1` (0 commits propios) y `feat/analisis-confiabilidad-mantencion` (sus simbolos `MachineKPI`/`PlantKPIs`/`computeMachineKPI`/`aggregateShifts` SI estan en main, hubo refactor a `plantKpiCompute.ts`); (3) worktrees `wt-filete`, `wt-brief-timescale`, `wt-powerbi-button`, `wt-shoplogix-freeze`.
- **La rama 12 no se borro a ciegas:** `fix/grader-shift-window-tz` (sin PR) tenia 3 casos de test ausentes en main. Se verificaron contra main, PASABAN, y cubrian logica viva (`graderShiftStatus.ts:123`, fallback a la ventana del dia de produccion 08:00→08:00 cuando el shiftId no esta en el schedule). Los tests que main ya tenia para ese branch solo verificaban `closed` con "margen amplio para no depender del huso del runner": nunca fijaban la ventana ni el estado `live`. Se rescataron en el **PR #324 (MERGED)** y recien ahi se borro la rama.
- Gotchas anotados para la proxima: (a) `git worktree remove` deja atras los archivos no versionados (cache de Vite) y falla si un dev server tiene la carpeta tomada — hubo que matar un Vite en :5173 que seguia vivo 12 h despues del merge; (b) para correr los tests en un worktree hace falta `.env.local` (no esta en git) o 7 archivos fallan al importar con `auth/invalid-api-key` — parece un fallo del cambio y no lo es; (c) si se enlaza `node_modules` al worktree con un junction, **quitar el junction ANTES** del `rm -rf` o se borra el `node_modules` real a traves del enlace.
- Archivos: solo `.ai/WORKLOG.md`. El PR #324 toco `apps/pwa/src/services/grader/__tests__/graderShiftStatus.test.ts` (+32/-0).
- Verificacion: PR #324 con tsc y eslint limpios, 788 tests verdes (5 skipped), CI `build pass`. Estado final: 11 ramas locales (4 con trabajo sin publicar, el resto de worktrees activos) y 3 worktrees.
- Estado: HECHO. Sigue: quedan 4 ramas con trabajo nunca publicado que hay que mirar una por una — `chore/ai-coordination` (docs de cierre de Fase 5), `wip/ctd-oee-2026-06-29`, `feat/enzunchadora-tp6000-aprendizaje` y `feature/aprendizaje-baader142-refuerzo` (estas dos avanzaron tras su merge). No se tocaron.

## 2026-08-01 - claude - El boton de encuadre del eje no hacia nada (bug propio)

- Reporte de Orel: "no hace nada el boton". Tenia razon y el bug era mio.
- Causa raiz: el panel resuelve su ventana temporal con una prioridad — (1) zoom, (2) bounds del snapshot Shoplogix, (3) prop `shiftWindow`. El encuadre "solo con proceso" viaja por el PROP, o sea la fuente #3, asi que los bounds del snapshot (08:00→08:00, las 24 h de Filete) le ganaban siempre. El chip cambiaba de estado (lo alimenta el prop) y el eje seguia clavado.
- Por que no lo detecte antes: verifique el TEXTO del chip y el prop, no el eje que realmente dibuja el chart. Como ECharts pinta en canvas, no habia forma de leer el eje desde fuera → ahora el contenedor expone `data-axis-start/end` con el rango EFECTIVO, y con eso la verificacion es real (y automatizable).
- Fix: la prioridad se extrae a `resolvePanelWindow` (pura y testeada) con el encuadre explicito en el puesto 1b, sobre los bounds del snapshot. El panel la usa, asi que los tests protegen el codigo real y no una copia.
- Archivos: `apps/pwa/src/components/grader/{UpstreamMachinesPanel.tsx,shiftTimelineHelpers.ts,__tests__/resolvePanelWindow.test.ts (nuevo)}`.
- Verificacion: 785 tests verdes (5 nuevos de prioridad, incluido "con encuadre activo la ventana acotada GANA a los bounds del snapshot"), tsc y eslint limpios. En el navegador, leyendo `data-axis-*`: el eje pasa de 09:45–16:25 a 08:00–08:00 al togglear — antes se quedaba en 08:00–08:00 siempre.
- Estado: EN REVISION — PR abierto.
- Sigue: Orel confirma en pantalla. El sabado, Filete con 5.000 pz reales.

> **Compactado el 2026-07-30.** Las entradas anteriores al 2026-07-19 se resumieron en bloques
> temáticos al final de este archivo (el detalle completo de cada una vive en git:
> `git log -p .ai/WORKLOG.md`, y en los commits de cada PR). Los pendientes que seguían abiertos
> se consolidaron en "Pendientes que vienen de atrás" — no se perdió ninguno.
> El archivo pasó de 143 KB a 36 KB porque estaba duplicando lo que ya dicen los commits.

## 2026-07-30 - claude - Baader 200: 9 medios MEDIOS + 2 menores corregidos, mostrando ambas fuentes planta/OEM (PR #320, MERGED, 43/43 medios cerrados)

- Hecho: cierra los 9 hallazgos MEDIOS de la auditoria del 2026-07-30 para la Baader 200. Criterio: donde habia choque de fuentes (manual de planta sin distinguir especie vs. manual OEM V4 con tablas por especie), se conserva el valor de planta como valor de la medida y se agrega la cota del OEM como nota con pagina (rascadores, guias flotantes, ventrales, punzones x2). Ademas: "avance a" -> "abertura entre cuchillos a" (errata de planta), 1ra Alimentacion separada en 2 cotas (32 mm entrada / 26 mm salida, el rango "32-28" no existia), mando de dorsales reatribuido (20 mm = distancia de control, no carrera; 12 mm entre trinquete y fiador), Trim D/E transcrito desde laminas rasterizadas del manual (sin texto de procedimiento), silleta 1350 mm etiquetada como criterio de planta, sensores de pasillo sin "zona N" inventada.
- Archivos: `apps/pwa/src/services/baader200Learning.ts`, `apps/pwa/src/services/learningContent.ts`, `apps/pwa/src/data/learningQuickRef.ts`, `scripts/fix-b200-medios-auditoria.js` (nuevo, dry-run por defecto, ya corrido con --confirm: 9 docs de Firestore `baader200-sections` actualizados).
- Verificacion: `tsc --noEmit` limpio, 780 tests verdes (5 skipped); paridad Firestore <-> fallback verificada con script; verificador-web 3 pasadas (las 2 primeras encontraron superficies sin sincronizar - objetivo/quiz y Consulta rapida - corregidas antes de cerrar).
- Estado: HECHO. Sigue: nada pendiente de esta tanda; con esto quedan 43 de 43 medios de la auditoria `verificar-contenido-fichas` cerrados.

## 2026-07-30 - claude - Marel Filete: corregida identidad (M-Weigher WTR, no SmartLine) + hardware inexistente eliminado (PR #317, MERGED, 7a tanda de MEDIOS)

- Contexto: Orel confirmo en planta que el equipo de Filete es un **M-Weigher WTR (GR8251)** con indicador M6410, NO una linea SmartLine. Verificado contra `M-WeigherWTR_UM_v1.02_SPA.pdf` (71 pags): "brazo" y "lote" dan 0 coincidencias en el manual.
- Hecho: identidad reescrita (recorrido real + 9 piezas segun Tabla 1, con nota de que no tiene descarga/brazos/bandejas), tagline corregido, M6410 aclarado como indicador (no bascula), mantenimiento/limpieza/arranque ajustados al manual, calibracion marcada como criterio de planta (no cubierta por el manual del WTR). Se elimino hardware inexistente: unidad de descarga y creacion de lotes, 2 diagnosticos, grupo de Consulta rapida de brazos/cilindros SmartLine, fila de arranque "Steady en M3210".
- Archivos: `marelFileteContent.json`, `marelFileteLearning.ts`, `learningMachines.ts`, `learningQuickRef.ts`, `scripts/seed-quiz-maquinas.js`.
- Verificacion: `tsc --noEmit` limpio, 780 tests verdes (5 skipped); verificador-web 2 pasadas (1ra encontro 3 superficies fuera del seed - tagline, Consulta rapida, quiz - corregidas antes de cerrar).
- Estado: HECHO. Sigue: 5 secciones de manual minadas en Firestore (`learningContent/marel-filete/manual`, ids 100-104) mezclan contenido del WTR con contenido del SmartLine viejo (101, 102, 103) — requiere decision, no se toco. La pregunta 1 del quiz en produccion sigue vieja hasta que se re-siembre Firestore.

## 2026-07-30 - claude - Baader 142 diagnosis: NO se borro (los 10 docs son conocimiento de planta, no basura)

- Contexto: venia como pendiente del PR #312 y de la limpieza de Marel HG de mas abajo, etiquetado como "10 docs muertos". Se pidio limpiarlo. **No se borro nada** — al leer el contenido antes de borrar, la premisa resulto falsa.
- Hallazgo: los ids son `diag_<timestamp>_<random>`, el formato que genera `saveDiagnosis()` desde el editor admin — no son restos de un seed viejo, los escribio una persona en una sola sesion de 53 min el 21-may-2026. Contienen datos que el seed (34 entradas) no tiene, verificado por grep sobre `baader142Content.json`: bomba de vacio **SB 1100D0** (0 menciones en el seed), **tiempo de recuperacion de vacio vs piezas/min** como variable de ajuste (0 menciones), remision a **codigos SAP** del catalogo (0 menciones), la jerarquia "interruptor 3 = PRINCIPAL SOLUCION", y el E777 desglosado en (a) esporadico = tecnica del operador vs (b) recurrente = muelle de traccion del carro roto, con el porque mecanico. Ademas agrupan por **sintoma observable por el operador**, mientras el seed reproduce la taxonomia del manual: son dos ejes distintos, no duplicados.
- Colision detectada: otro chat esta resolviendo lo mismo por el camino contrario en la rama `fix/b142-diagnosis-overrides` (cambios sin commitear en el working tree compartido): `listDiagnosis` para B142 pasa a usar `withDiagnosisOverrides` sobre `mergeSeedOverrides`, mas `_deleted:true` para ids `b142-diag-*` y counts de la tarjeta corregidos. Borrar la coleccion habria roto esa feature (mergearia contra vacio); migrar al seed ademas habria dejado cada diagnostico DUPLICADO al mergear.
- Decision (Orel, 2026-07-30): se descarta el plan de migrar-al-seed-y-borrar; sigue el enfoque de overrides, que arregla la causa (el editor admin escribia a un lugar que nadie leia) y usa el patron ya establecido del repo.
- Archivos: solo `.ai/MEMORY.md` (seccion de seed vs overrides reescrita con la senal para distinguir contenido humano de basura) y este WORKLOG. Cero cambios de codigo y cero escrituras a Firestore/Storage.
- Verificacion: snapshot fresco en `_snapshots/learningContent__baader-142__diagnosis__2026-07-30T23-19-06-565Z.json` (10 docs, intactos en produccion).
- Estado: HECHO (como no-accion deliberada). Sigue: la rama `fix/b142-diagnosis-overrides` termina y mergea; al mergear, revisar que los 10 no queden solapados con entradas equivalentes del seed (ej. esofago largo, A3C, recto retenido) — puede convenir despues consolidar, pero eso es contenido, no limpieza.

## 2026-07-30 - claude - Marel HG: borrados 2 procedimientos huerfanos en Firestore + 6 imagenes en Storage (sin PR, solo datos)

- Contexto: `learningContent/marel-hg/procedures` tenia 2 docs que la app nunca muestra. `listProcedures()` (`services/learningContent.ts:618`) despacha a `listMarelHgProcedures()` (`services/marelHg/marelHgLearning.ts:101`), que devuelve el seed puro de `marelHgContent.json` sin mergear overrides. Usaban ids del esquema viejo (`activar-flippers-entrada-baader`, `modificar-distancia-flipper`) vs `mhg-proc-*` del seed. Mismo patron que el caso hermano `learningContent/baader-142/diagnosis` anotado en el PR #312.
- Riesgo que lo justificaba: `activar-flippers-entrada-baader` era la version ANTERIOR del procedimiento de flippers, la que la auditoria del 2026-07-30 marco CRITICO por riesgo de lesion — su `description` decia "util para pruebas y despeje de atascos" y arrancaba directo en la clave de Servicio, sin paso de seguridad. La version corregida (seed, `mhg-proc-activar-flippers-entrada-baader`) dice explicito "NO es un metodo para desatascar producto" y suma el paso 1 de LOTO citando el A600. Si alguien cambiaba el dispatch para mergear overrides, reaparecia el texto peligroso.
- Hecho: (1) borrado REAL de los 2 docs — no `_deleted:true`, porque esa convencion es para tapar docs que el seed si publica, y estos no existen en el seed bajo esos ids; la coleccion quedo en 0 docs. (2) Borradas las 6 imagenes huerfanas de Storage bajo `procedures/activar-flippers-entrada-baader/` y `procedures/modificar-distancia-flipper/`; eran duplicados byte a byte de las del seed (mismos tamanos exactos, subidas 8 min antes). Bajo `procedures/` quedan solo los 6 archivos `mhg-proc-*`.
- Archivos: ninguno de codigo. Solo datos de PRODUCCION (Firestore + Storage). Respaldos en `_snapshots/` (gitignored): `learningContent__marel-hg__procedures__2026-07-30T22-57-23-398Z.json` (restaurable con `--restore ... --confirm`) y `storage__marel-hg__procedures-huerfanas__2026-07-30/` (6 JPG).
- Verificacion: `firestore-snapshot.js --dump` de la coleccion ahora responde "esta vacia o no existe"; listado de Storage muestra 6 objetos, todos `mhg-proc-*`; las 3 `imageUrl` del seed responden HTTP 200 (las imagenes que la app si muestra siguen sirviendo); 0 referencias a los ids viejos en `apps/` y ninguna URL del seed apunta a las carpetas borradas.
- Estado: HECHO. Sigue: nada de este PR.
- ⚠ CORRECCION (mismo dia, ver entrada de abajo): el caso `learningContent/baader-142/diagnosis` NO es analogo a este y **NO se debe borrar**. Se reviso el contenido y es conocimiento de planta escrito a mano, no basura. Queda en manos de la rama `fix/b142-diagnosis-overrides`.

## 2026-07-30 - claude - Detector de Metales: 3 medios + 2 menores corregidos (PR #314, MERGED, 6a tanda de MEDIOS)

- Contexto: Orel confirmo en planta que el equipo instalado es un Vistus (no un IQ4), lo que desbloquea la auditoria `verificar-contenido-fichas` del 2026-07-30 sobre el manual correcto (`845_BA_Vistus-es_0_20110413.pdf`, 223 pags, citando pagina impresa).
- Hecho: (1) privilegios reales de Operador (§4.7 pag 23) incluyen aprendizaje rapido, remedio explicito ante rechazo masivo por cambio de producto (§13.3.3 pag 152) — la ficha lo dejaba esperando a un ingeniero; (2) regla de deteccion de alambres corregida (§4.9.4 pag 27): en alambres el Fe se detecta peor que el VA en 2 de 3 orientaciones, al reves de lo que decia la ficha; el dato sobre AISI 304 quedo acotado a bolas de test (pag 131); (3) codigos E010C, W0207 y E010B recategorizados como accionables (remiten a red o muestran detalle en pantalla), no todo el rango E0100-E01xx es Sartorius; menores: la sal como causa de efecto de producto se etiqueto como criterio de planta (no esta en el manual) + citas de pagina unificadas a numeracion impresa.
- Archivos: `apps/pwa/src/services/detectorMetales/detectorMetalesContent.json`, `apps/pwa/src/services/detectorMetalesLearning.ts`.
- Verificacion: tsc limpio, 780 tests verdes (5 skipped), verificador-web PASA en 8 puntos incluyendo 2 preguntas de quiz respondidas, ambos temas, consola limpia.
- Estado: HECHO. Sigue: 28 de 43 medios corregidos acumulados.

## 2026-07-30 - claude - Baader 142: 3 medios + 1 menor corregidos (PR #312, MERGED, 5a tanda de MEDIOS)

- Contexto: siguiendo la auditoria `verificar-contenido-fichas` del 2026-07-30, se corrigen los 3 hallazgos MEDIOS de la Baader 142 mas 1 menor, cruzados contra `498_142-Manual de Instrucciones-2005-12-E.pdf` citando pagina.
- Hecho: (1) mapeo X de la tabla "E 8 N X" estaba invertido (el manual pag 41/45 dice 1=SM1 Centraje, 2=SM2 Cuchilla abridora, al reves de la tabla original) — afecta E801-E805, E821-E825, E831-E835, E841-E845, E851-E855, E861-E865; se publica el mapeo confirmado y se deja explicita la contradiccion; (2) E770-E775 (6 codigos) marcados CONDICIONAL: solo existen con el Upgrade Kit (nota pag 42, S22.4.4 pag 87), pendiente confirmar en planta si esta 142 lo tiene; (3) procedimiento del palpador (S12.4 pag 28) se saltaba los dos extremos del orden de conexion con la clavija de tope, reordenado de 7 a 9 pasos; (4) menor: chapaleta medidora de largos "400 mm" -> "400 ±2 mm" (dib. 15) con advertencia de su efecto en la medicion de largos.
- Archivos: `apps/pwa/src/services/baader142/baader142Content.json`.
- Verificacion: tsc limpio, 780 tests verdes (5 skipped), verificador-web PASA en 4 puntos con las 6 entradas E77x verificadas una por una, ambos temas, sin scroll horizontal en 375px.
- Estado: HECHO. Sigue: 25 de 43 medios corregidos acumulados; nota aparte (fuera de este PR): `learningContent/baader-142/diagnosis` tiene 10 docs de diagnostico por sintoma que `listDiagnosis` nunca despacha (la ficha usa el seed puro) — contenido distinto y mas rico, snapshot en `_snapshots/learningContent__baader-142__diagnosis__2026-07-30T22-37-54-098Z.json`.

## 2026-07-30 - claude - Grader: 7 medios + 3 menores corregidos (PR #310, MERGED, 4a tanda de MEDIOS)

- Contexto: siguiendo la auditoria `verificar-contenido-fichas` del 2026-07-30, se corrigen los 7 hallazgos MEDIOS del Grader cruzados contra el manual Marelec MS4/12 y el instructivo "Basculas Grader", citando pagina.
- Hecho: (1) ±20 g corregido de tolerancia a desviacion estandar (manual pag 6) — el quiz repetia el mismo error; (2) juego vertical en flipper: rodamientos 6005 2RSR, no bujes (pag 25/58) — el quiz daba la respuesta incorrecta como correcta; (3-7) 5 umbrales sin respaldo documental retirados o etiquetados como criterio interno de Mantención ANTARFOOD (P0<2%, ruta redistribuir-gates, slow-mo-flipper con bobina 15-30 Ω inventada, ajuste-eye-sync 50-150 ms, tachometro-cinta gap 1-3 mm); mas 3 menores (motor-tambor: termometro laser en vez de tacto a 60°C; limpieza-fotocelula: baja presion no paño con alcohol; peso patron redactado sin ambiguedad). Los 11 runbooks y sus 6 triggers automaticos (`metric`) quedaron intactos.
- Archivos: `apps/pwa/src/services/graderLearning.ts`, `apps/pwa/src/services/grader/graderRunbooks.ts`.
- Verificacion: tsc limpio, 780 tests verdes (5 skipped), verificador-web PASA en 11 puntos respondiendo las 2 preguntas de quiz corregidas, ambos temas, sin scroll horizontal en 375px.
- Estado: HECHO. Sigue: 22 de 43 medios corregidos acumulados; quedan medios sin tocar en otros equipos.

## 2026-07-30 - claude - Fishken: 6 medios + restos de quiz/"por que importa" corregidos (PR #308, MERGED, 3a tanda de MEDIOS)

- Contexto: siguiendo la auditoria `verificar-contenido-fichas` del 2026-07-30, se corrigen los 6 hallazgos MEDIOS de la Fishken cruzados contra los 4 manuales del equipo (E-Pack S28, Hardware, Diagramas de Conexion, FishKen Web), citando pagina.
- Hecho: (1) procedimiento de arranque saltaba el Autozero (pag 10), ahora 7 pasos + Pausar/Detener; (2) rango de calibre no se edita en el E-Pack, se corrige en FishKen Web > Calibres; (3) causas de sobrepeso estaban al reves de lo documentado (deshabilitar compuerta SUBE el sobrepeso, no lo baja); (4) "compuertas no accionan" culpaba directo a la tarjeta NUMATO en vez de aire/electrovalvulas/24V primero; (5) "celda sucia" no es causa documentada, se agrego bloque de mantencion semanal con causas mecanicas reales; (6) cambio de producto no se hace en el E-Pack sino en FishKen Web > Configuracion, y no existe boton "reiniciar estadisticas". Ademas se corrigieron restos en `fishkenLearning.ts` (por que importa + quiz seguian atribuyendo sobrepeso a "celda sucia") y en `marelHgLearning.ts` (resto del PR #306: Metodos de clasificacion y Alarmas contradecian el JSON ya corregido).
- Archivos: `apps/pwa/src/services/fishken/fishkenContent.json`, `apps/pwa/src/services/fishkenLearning.ts`, `apps/pwa/src/services/marelHgLearning.ts`.
- Verificacion: tsc limpio, 780 tests verdes (5 skipped), verificador-web en dos pasadas (1a detecto la falla de los `*Learning.ts`, 2a dio PASA en 5 puntos leidos del DOM en ambas fichas, incluyendo responder el quiz).
- Estado: HECHO. Sigue: 15 de 43 medios corregidos acumulados; quedan medios sin tocar en otros equipos (4a tanda).

## 2026-07-30 - claude - Marel HG: 7 medios + 3 menores corregidos (PR #306, MERGED, 2a tanda de MEDIOS)

- Contexto: siguiendo la auditoria `verificar-contenido-fichas` del 2026-07-30, se corrigen los 7 hallazgos MEDIOS de la Marel HG mas 3 menores de las mismas secciones, cruzados contra `785_A600 User Manual_ES.pdf` citando pagina impresa.
- Hecho: (1) terminar lotes apuntaba a Last Batches (solo historico) en vez de Production > Buffers > Terminate all; (2) metodo de clasificacion se elige por PRODUCTO (pantalla Products), no en el programa; (3) definicion correcta de que es un programa (plantilla de unidades/tara, no metodo/rangos/destinos); (4) pasos inventados en agregar/copiar programa; (5) "eliminar informes" no existe, el unico borrado es Reset (borra todo lo anterior, se agrego advertencia de exportar antes); (6) cambiar de programa con produccion en curso interrumpe lotes abiertos; menores: Main da acceso a 4 pantallas no a todas, alarmas son 3 niveles no 2, 8 citas de pagina unificadas a numeracion impresa.
- Archivos: `apps/pwa/src/services/marelHg/marelHgContent.json`.
- Verificacion: tsc limpio, 780 tests verdes (5 skipped, 52 archivos), verificador-web PASA en 11 puntos/ambos temas/sin errores de consola/sin scroll horizontal (888px y 375px).
- Estado: HECHO. Sigue: quedan ~34 hallazgos MEDIOS de la auditoria sin tocar (2a tanda, 9 de 43 acumulados).

## 2026-07-30 - claude - Enzunchadora: reubica 2 causas de troubleshooting (PR #305, MERGED, 1a tanda de MEDIOS)

- Contexto: siguiendo la auditoria `verificar-contenido-fichas` del 2026-07-30, se corrigen los 2 hallazgos MEDIOS de la Enzunchadora TP-6000 — causas asignadas a la fila equivocada de la tabla de Troubleshooting (manual pag. 22 / PDF pag. 28).
- Hecho: (1) "STOP bloqueado" pasa de la fila "piloto no enciende" a "piloto enciende, no opera" (con STOP bloqueado la maquina sigue energizada, pag. 5); (2) "enhebrado incorrecto en portabobina" pasa de "piloto enciende, no opera" a "avance/recogida incorrectos". Las 5 entradas de diagnostico ahora cubren las 26 causas del manual sin solapes ni huecos (3+4+12+4+3=26).
- Archivos: `apps/pwa/src/services/enzunchadora/enzunchadoraContent.json`.
- Verificacion: tsc limpio, 773 tests verdes (5 skipped), verificacion en navegador (`/aprendizaje/maquina/enzunchadora-n2`) en ambos temas, consola limpia.
- Estado: HECHO. Sigue: quedan ~42 hallazgos MEDIOS de la auditoria sin tocar (esta fue la 1a tanda, 2 de 43).

## 2026-07-30 - claude - Corrige 9 criticos de la auditoria de contenido (PR #301, MERGED)

- Contexto: la auditoria de contenido (workflow `verificar-contenido-fichas`, 26 agentes) encontro 9 errores criticos en fichas de Centro de Aprendizaje, uno de seguridad (Marel HG). Cada correccion cita la pagina del manual fuente.
- Hecho: (1) Marel HG - paso 1 de seguridad (cortar energia/aire) antes de activar flippers manualmente; (2) Baader 200 - "4.8+30" (numero de diapositiva pegado) corregido a 4,8 mm; (3) Baader 200 - los 12 mm de "Medidas de Cuchillos" no eran la abertura "b" de Cuchillos Dorsales (real: 5/4/7 mm por especie); (4)-(5) Grader - comandos de capacho/flipper en rangos continuos que se solapaban (tipear 141 activaba el flipper 5 en vez del capacho), corregidos a 3 grupos reales cada uno, quiz ampliado 2→4 preguntas; (6) Detector de Metales - W0001 describia la W0003, separadas las 3 alarmas; (7)-(8) Fishken - calibracion de compuertas incompleta + pantalla equivocada ("Ajuste de puertas" en vez de "Calibracion"); (9) Baader 142 - lubricacion agregada a limpieza diaria/mantenimiento (era solo semanal, el manual la exige cada 8 h).
- Hallazgo de proceso: el Baader 200 lee su contenido de Firestore (`baader200-sections`, 23 docs) en produccion, no del `.ts` (solo fallback) - se corrigio tambien ahi con snapshot previo.
- Archivos: `apps/pwa/src/services/{marelHg/marelHgContent.json,baader200Learning.ts,graderLearning.ts,detectorMetales/detectorMetalesContent.json,fishken/fishkenContent.json,baader142/baader142Content.json}`, `apps/pwa/src/data/learningQuickRef.ts`, `.claude/workflows/verificar-contenido-fichas.js`.
- Verificacion: tsc limpio, 761 tests verdes, verificacion en navegador (DOM real) de las 5 fichas afectadas, Baader 200 re-verificado tras el fix de Firestore, movil 375px sin scroll horizontal, consola limpia.
- Estado: HECHO. Sigue: ~36 hallazgos MEDIOS del informe sin tocar; 2 preguntas de planta abiertas (detector Vistus/IQ4, Marel Filete SmartLine/M-Weigher); capacho 3 del Grader transcrito "130" tal cual (probable errata) marcado para verificar en maquina.

## 2026-07-30 - claude - Arregla el toggle de brecha (merge de ECharts) + chip de eje autoexplicativo

- Contexto: Orel probo en Filete y reporto dos cosas — "ocultar brecha no funciona" y "el boton operacion real no se que hace".
- Causa raiz del toggle: `setOption` de ECharts MERGEA por defecto, asi que sacar la serie de brecha del array NO la borra del grafico. Prender funcionaba, apagar no. Fix: la serie existe SIEMPRE en modo barras y lo que cambia son los DATOS (`gapSeriesData` devuelve todos null cuando esta apagada) — el merge si reemplaza datos. Ademas el `stack` de la barra real queda FIJO en vez de alternar entre undefined y un id, que dejaba al merge con una config a medias.
- Chip del eje: la etiqueta era "operacion real / turno completo", que no dice que recorta ni sobre que. Ahora dice **"eje: solo con proceso · 09:45–16:25"** vs **"eje: turno completo · 08:00–08:00"** — el rango visible va en el propio chip (desktop) y el tooltip aclara que el Gantt y el grafico comparten ese eje.
- Archivos: `apps/pwa/src/components/grader/{ProductionRateLineEC.tsx,UpstreamMachinesPanel.tsx,__tests__/productionRateTarget.test.ts}`.
- Verificacion: 780 tests verdes (4 nuevos de `gapSeriesData`, incluido "apagada = mismos puntos en null" y "nunca negativa"), tsc y eslint limpios. En el navegador el chip alterna y el RANGO cambia de verdad: 08:00–08:00 ↔ 09:45–16:25 (evidencia del efecto, no solo del texto).
- Estado: EN REVISION — PR abierto.
- Sigue: Orel confirma que la brecha ahora se apaga. El sabado, Filete con 5.000 pz.

## 2026-07-30 - claude - Grafico de pz/min: el encoding depende de la linea (barras 1 maq / lineas 2+)

- Contexto: Orel reviso el grafico en Yal (turno de anoche, 3 Baader) y lo llamo "muy sucio". Tenia razon: 3 series x ~100 tramos son barras de 1-2 px pegadas — una reja. Las barras resolvian Filete (1 maquina, 14 tramos sueltos) y arruinaban Yal.
- Hecho: `rateChartMode(machineCount)` decide el encoding — **1 maquina → barras, 2+ → lineas** (vuelve al encoding original de Yal/Chonchi, que respondia la pregunta correcta: cual Baader bajo primero y cuanto se separan). Todo lo demas del trabajo anterior se mantiene en los dos modos: eje acotado a la operacion real, objetivo conectado, bandas de "parada con objetivo" y agrupacion a 15 min. El toggle "ver brecha" queda solo con 1 maquina (se apila sobre la barra; en modo linea no hay donde apilar).
- Archivos: `apps/pwa/src/components/grader/{ProductionRateLineEC.tsx,UpstreamMachinesPanel.tsx,__tests__/productionRateTarget.test.ts}`.
- Verificacion: 776 tests verdes (3 nuevos de `rateChartMode`), tsc y eslint limpios. En el navegador: Yal SIN toggle de brecha y en "turno completo"; Filete CON toggle y en "operacion real".
- ⚠ La verificacion VISUAL sigue dependiendo de Orel (el pane de esta sesion no compone frames; ECharts pinta en canvas).
- Estado: EN REVISION — PR abierto.
- Sigue: confirmar con captura que Yal volvio a verse limpio. El sabado, Filete con 5.000 pz reales.

## 2026-07-30 - claude - Grafico de pz/min: barras por tramo + eje acotado a la operacion real

- Contexto: Orel mando una captura del grafico en produccion. Dos problemas visibles: el eje cubria 24 h (08:00→08:00) para un turno que produjo 6 h, y el objetivo aparecia como rayitas flotantes sueltas.
- Diagnostico con datos: el turno del 28-jul tiene **14 tramos con dato sobre 288 posibles**, en dos racimos (09:55 y 14:30-16:10). Una LINEA dibujaba continuidad donde no hubo ni un tramo con produccion.
- Hecho (mockup aprobado A+B, C como toggle): (1) el eje se acota a la ventana real de produccion cuando el turno no esta acotado en Shoplogix, con chip "operacion real / turno completo" para alternar. El encuadre va a nivel de PANEL porque el Gantt y el grafico comparten eje (van sincronizados) — acotar solo uno los desalinearia. (2) El grafico pasa de linea a BARRAS por tramo: los tramos sin dato quedan huecos, no una linea que baja a cero. (3) El objetivo se conecta entre tramos (`connectNulls`) porque es una consigna, no desaparece. (4) Toggle "ver brecha al objetivo" que apila lo que falto en cada tramo (opcion C, apagada por default: en un turno normal seria ruido). (5) Agrupacion a 15 min cuando el rango visible pasa de 4 h, para que las barras no se apelmacen.
- Helpers nuevos y testeados: `effectiveProductionWindow` / `shouldFrameOnProduction` (shoplogixNormalizer) y `regroupRates` (ProductionRateLineEC).
- Archivos: `apps/pwa/src/components/grader/{ProductionRateLineEC.tsx,UpstreamMachinesPanel.tsx,__tests__/productionRateTarget.test.ts}`, `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`, `apps/pwa/src/services/shoplogix/{shoplogixNormalizer.ts,__tests__/shoplogixNormalizer.test.ts}`.
- Verificacion: 773 tests verdes (12 nuevos: encuadre con los datos reales del 28-jul, y agrupacion que NO afirma produccion cero donde solo falta el dato), tsc y eslint limpios. En el navegador: Filete arranca en "operacion real", Yal en "turno completo" (su turno SI esta acotado → su eje no se toca), los 2 toggles alternan, y 0 botones anidados tras corregir un `<button>` dentro de `<button>` que React reportaba.
- ⚠ PENDIENTE de verificacion VISUAL: el pane del navegador de esta sesion no compone frames (ECharts pinta en canvas), asi que las barras, la brecha apilada y las bandas no las pude VER. La logica esta cubierta por tests; Orel manda captura tras el deploy.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado con 5.000 piezas el grafico se ve muy distinto (barras casi llenas) — ahi se valida el encoding de verdad.

## 2026-07-30 - claude - Target de planificacion de Filete (5.000 pz/turno)

- Contexto: produccion definio ~5.000 piezas por turno y 2 turnos en Filete (los horarios no se fijan: los define Shoplogix y la app ya descubre los turnos de los docs).
- Hecho: `shiftTargetPieces` por linea en `plantLines.ts` (Filete 5.000) con espejo `PLANT_SHIFT_TARGET_PIECES` en `functions/shoplogix/machines.js`. Se usa como REFERENCIA DE CUMPLIMIENTO donde Shoplogix no manda target oficial — el caso de Filete: (a) el brief de fin de turno agrega "🟡 84% de lo planificado (5.000)", rotulado DISTINTO del target del sensor porque son dos numeros diferentes; (b) la vista de turno muestra "1% de 5.000 planificadas" bajo el total de ciclos. Si algun dia llega el target oficial del rollup, ese GANA.
- Ademas: el label corto de maquina sale del MODELO (`machineShortLabel`: B142/B200/HG/KN) — en Filete la Baader 200 aparecia como "Ev 1" (evisceradora); y con una sola maquina se omite el numero ("B200", no "B200 1").
- Umbral del brief confirmado contra el dato nuevo: `minPieces` 200 = 4% de 5.000 → un turno real (5.000) manda brief, un turno malo al 10% (500) TAMBIEN (hay que reportarlo), un lote de prueba (59) no.
- Archivos: `apps/pwa/src/config/plantLines.ts`, `apps/pwa/src/components/grader/ShoplogixOnlyScorecard.tsx`, `apps/pwa/src/services/shoplogix/shoplogixMachines.ts`, `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`, `functions/shoplogix/{machines.js,turnoBrief.js,__tests__/turnoBrief.test.js}`, `functions/index.js`.
- Verificacion: 93 tests de functions (3 nuevos: usa lo planificado, el oficial le gana, y sin ninguno NO inventa porcentaje) + 761 de la PWA, tsc y eslint limpios. Chip verificado en el navegador con el turno real ("1% de 5.000 planificadas" y "B200" en vez de "Ev 1"); brief renderizado para un turno simulado de 4.200 pz → "🟡 84% de lo planificado (5.000)".
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado, primer turno real → ajustar 5.000 si el pedido cambia, y confirmar como nombra Shoplogix a los 2 turnos.

## 2026-07-30 - claude - Pobla la Enzunchadora TP-6000: 9a y ultima maquina del Centro de Aprendizaje (PR #296)

- Hecho: la Enzunchadora N2 (Transpak TP-6000-1) estaba en 0/4 secciones; la memoria decia que no habia material en OneDrive pero SI existe (`TRANSPAK_TP-6000-1_Manual_operacion_y_repuestos.pdf`, 124 pags) — la busqueda vieja fallaba por buscar "N2" en vez de "TP-6000". Se curo del manual (ingles, PARTE I pags. 1-22, con la tabla de Troubleshooting rasterizada y transcrita): 7 secciones de Manual, 5 Procedimientos, 4 Flujos, 5 Diagnosticos, Consulta rapida (8 grupos, sin "Claves de acceso" porque no hay clave documentada) y 18 preguntas de Evaluacion. Con esto el Centro de Aprendizaje queda completo, 9/9 maquinas. Se corrigio ademas el shuffle de opciones del seed (concentraba correctas en B) por uno deterministico, y se agrego `--only=<slug>` a `seed-quiz-maquinas.js` para no pisar preguntas de otras maquinas ya editadas desde el panel admin.
- Archivos: `apps/pwa/src/services/enzunchadora/enzunchadoraContent.json` (nuevo), `apps/pwa/src/services/enzunchadoraLearning.ts` (nuevo), `apps/pwa/src/services/learningContent.ts`, `apps/pwa/src/data/{learningMachines.ts,learningQuickRef.ts}`, `scripts/seed-quiz-maquinas.js`.
- Verificacion: tsc limpio; seed a Firestore con `--only=enzunchadora-n2` (dry-run antes); verificador-web PASA CON RESERVAS contando por numero (8/7/5/4/5, evaluacion "01/18" responde CORRECTO con explicacion); card del hub 4/4 con badge "Nuevo"; buscador por sintoma "fleje"→3 resultados y "sello"→1 (el seed SI entra al indice); movil 375px sin scroll horizontal.
- Estado: HECHO — PR #296 mergeado (squash+admin), deploy a GitHub Pages disparado automaticamente al mergear.
- Sigue: buscar "sellado" (literal) no encuentra nada — el indice cubre titulo+sintoma, no el texto completo de la solucion (no bloqueante); falta verificar tema claro/oscuro en esta ficha y las 18 preguntas una por una; falta uso real de un tecnico en terreno.

## 2026-07-30 - claude - Alertas y brief de Filete con umbrales propios

- Hecho: (1) la config de notificaciones pasa a 3 capas en `functions/shoplogix/notifConfig.js` (DEFAULTS -> overrides por planta -> Firestore) con `shiftEnd.minPieces` nuevo: Filete exige 200 piezas y el eviscerado sigue en 50. Motivo REAL: el lote de prueba de 59 piezas del 28-jul disparo un brief de fin de turno como si fuera un turno productivo. (2) El brief muestra la OPERACION REAL (`effectiveStart/End`) cuando la ventana del turno es >=25% mas ancha: decia "Horario real: 08:00 -> 08:00" porque el "Turno Dia" de Filete abarca 24 h; ahora dice "Operacion real: 09:56 -> 16:11". (3) Nueva linea "N paros sin causa anotada (Nm) — anotala en Analisis de Turno", que cruza los paros del sensor con las anotaciones de `paros` (via la misma clave determinística `sensorStopKey`) — el brief es el momento en que alguien todavia se acuerda de lo que paso. (4) `minPieces` editable en el Panel Admin. (5) Copy: "piezas por Baader" -> "por maquina" en briefs/tools, y la tool de produccion de ARIA ahora detecta filete.
- Archivos: `functions/shoplogix/{notifConfig.js (nuevo),turnoBrief.js,__tests__/{notifConfig.test.js (nuevo),turnoBrief.test.js}}`, `functions/index.js`, PWA: `pages/admin/ShoplogixNotificationsConfigPage.tsx`, `services/shoplogix/shoplogixNotifConfig.service.ts`.
- Verificacion: 90 tests de functions verdes (5 nuevos de notifConfig + 3 del brief), 761 de la PWA, tsc y eslint limpios. Renderice el brief con los DATOS REALES del 28-jul antes y despues: antes "Horario real: 08:00 -> 08:00" y se enviaba con 59 piezas; ahora con 59 piezas NO se envia (umbral 200) y con un turno real sale "Operacion real: 09:56 -> 16:11" + "1 paro sin causa anotada (23m)".
- ⚠ PENDIENTE de verificacion visual: el Panel Admin de notificaciones exige re-autenticacion con contraseña, asi que el input nuevo de `minPieces` no lo pude ver en pantalla (el resto se verifico). Orel: mirarlo al entrar.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado, primer turno real de Filete — confirmar que el brief sale con la ventana real y que el umbral de 200 es el adecuado; ver si `scrapReasons` viene poblado (habilitaria OEE completo A*P*Q).

## 2026-07-30 - claude - OEE del AREA: maquina instrumentada + etapas sin sensor (la GEA)

- Hecho: la tarjeta de OEE de linea pasa a ser OEE del AREA y se habilita en toda linea con Shoplogix (antes solo con Grader, asi que Filete no la veia). Calculo extraido a `services/grader/areaOeeCompute.ts` (testeado): `A_area = uptime / (tiempo rastreado por el sensor + paros de etapa)`, R del cuello de botella, y donde no hay Grader el OEE se muestra como **A×R con chip rotulado** en vez de fingir calidad 100%. El pareto ahora reparte el downtime de la maquina POR CAUSA ANOTADA (el pago de la feature anterior) y expone lo que falta anotar en vez de esconderlo.
- ⚠ Doble conteo resuelto con una REGLA explicita: un paro de etapa solo suma tiempo si NO detuvo la maquina. Si la detuvo, ya esta en el downtime del sensor y va como causa de ese paro (`origen:'shoplogix'`, que `computeAreaOee` excluye del tiempo adicional).
- Fixes que salieron de mirar datos reales: `MachineKPI` expone `uptimeMin/downtimeMin/setupMin` (antes la base de tiempo se DERIVABA de `downtime/(1-A)` y fallaba sin averias macro); `machineType` se propaga a los KPIs y en la agregacion gana el primer tipo CONOCIDO (los turnos sin produccion quedan congelados en 'other' y borraban el modelo del mes); etapas sin sensor por linea en `plantLines.ts` (Filete: GEA, cintas, enzunchadora — antes ofrecia Bombeo/Chiller/Grader del eviscerado); `getAreaDisplayLabel` para que el titulo no diga "Filete · Filete".
- Bug de UX encontrado probando: registrar un paro no movia el OEE hasta recargar (la card leia los paros solo al montar). Ahora `ParoEtapaCapture` avisa (`onChanged`) y la card relee.
- Archivos: `services/grader/{areaOeeCompute.ts (nuevo),plantKpiCompute.ts,__tests__/areaOeeCompute.test.ts (nuevo)}`, `components/grader/{LineOeeCard.tsx,ParoEtapaCapture.tsx}`, `services/shoplogix/shoplogixMachines.ts`, `config/plantLines.ts`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificacion: tsc limpio, eslint sin errores, 761 tests (9 nuevos de `computeAreaOee`, incluido el caso de doble conteo). Punta a punta en produccion con Filete: registre un paro de la GEA de 45 min → OEE maquina 7% vs **OEE area 3%** ("disponibilidad 33% → 14%, base 1h 19m") y pareto "1. GEA (etapa) 45 min · 2. Paros sin causa anotada (maquina) 23 min"; al borrarlo desde la UI volvio a 7% SIN recargar. Produccion quedo limpia (0 paros, 0 maintenanceLog).
- Estado: EN REVISION — PR abierto.
- Sigue: #6 (alertas y brief de Filete con umbrales propios). El sabado: primer turno real.
## 2026-07-30 - claude - Arregla los 2 crones que fallaban por la proteccion de main (PR #292)

- Hecho: causa raiz comun — `main` exige el check "build" con `enforce_admins: true`, ninguna escritura directa entra. `Daily Sync (versions)` fallaba desde el 24-jul (`GH006`): se le quito el `schedule` y `version.ts` ahora se sincroniza solo via `prebuild` y el nuevo `dev` (`sync:version && vite`); el workflow queda de auditoria manual. `Weekly NanoBanana Check` fallaba 3 domingos seguidos (`HTTP 409`): ahora sube a la rama sin proteccion `nanobanana-assets`.
- Archivos: `.github/workflows/{sync-version.yml,nanobanana-weekly.yml}` (o equivalentes), `apps/pwa/package.json` (script `dev`), `.claude/launch.json` (`autoPort`).
- Verificacion: sintaxis .py/.yaml OK; sync manual llevo `version.ts` 3.99.1→3.99.6; `pnpm dev` encadena bien; los 2 workflows disparados a mano en `success` (antes fallaban siempre); NanoBanana genero imagen valida (PNG real, HTTP 200) y abrio issue #291. Check "build" del PR: pass.
- Estado: HECHO — PR #292 mergeado (squash+admin), deploy a GitHub Pages y Firebase Hosting disparado automaticamente al mergear.
- Sigue: confirmar en el proximo domingo/medianoche que los 2 crones corren solos sin intervencion.

## 2026-07-30 - claude - Grafico velocidad real vs objetivo del sensor

- Hecho: el grafico de tasa (pz/min) de la vista de turno ahora superpone el OBJETIVO por bucket que reporta el sensor (`targetRate`, con `expectedCycles/duracion` de respaldo en docs viejos) como linea punteada, y sombrea los tramos con objetivo vigente y produccion 0 ("parada con objetivo"). Ademas corrige el objetivo NOMINAL: se tomaba del PRIMER bucket con expected>0 — que es parcial y miente (en el turno del 28-jul de la Baader 200 daba 5 pz/min cuando el objetivo real era 20). Ahora es el maximo por bucket, mismo criterio que `targetCpmFromIntervals`.
- Por que importa: separa "la maquina no da el ritmo" de "la maquina estuvo parada". En el 28-jul la Baader 200 llego a 19,0 contra objetivo 20 → el turno no se perdio por velocidad sino por 20 min parada.
- Archivos: `apps/pwa/src/components/grader/ProductionRateLineEC.tsx`, `apps/pwa/src/components/grader/__tests__/productionRateTarget.test.ts` (nuevo).
- Verificacion: tsc limpio, eslint sin errores nuevos, 752 tests verdes — incluidos 6 nuevos que corren `buildRateSeries` con la SERIE REAL del 28-jul y fijan: nominal 20 (no 5), objetivo variable por bucket, el bloque unico de 20 min parado, real != objetivo, y degradacion limpia sin `targetRate` ni `expectedCycles`.
- ⚠ PENDIENTE de verificacion VISUAL: el panel del navegador dejo de componer frames a mitad de la sesion (ECharts pinta en canvas, no renderiza sin pane visible), asi que el grafico no se pudo ver corriendo. La logica esta cubierta por los tests con datos reales, pero hay que mirarlo con ojos antes de darlo por cerrado.
- Estado: EN REVISION — PR abierto.
- Sigue: mirar el grafico en pantalla (Filete 28-jul y un turno de Yal con 3 maquinas, cada una con su propio objetivo 16/19). Pendientes #5 (OEE de area con la GEA manual) y #6 (alertas de Filete).

## 2026-07-30 - claude - Causa de los paros del sensor (dictado) + parametros del sensor

- Hecho: (1) el sync guarda lo que el sensor mandaba y se descartaba — `targetRate` por intervalo (cadencia OBJETIVO, no la real: `expectedCycles = rate x 5min` y hay tramos con rate 20 y cycles 0), `uptimeCycles`/`scheduledCycles`, `scrapByReason`/`scrapTotal` (unica fuente posible de Calidad en Filete) y las unidades; `machineType` de la Baader 200 ya no cae en 'other'. (2) La vista de turno dejo de contar falso en lineas sin turno acotado: el ritmo se mide sobre la ventana REAL de operacion (Filete pasaba de 2 a 9 pz/h) y el copy "Baader 142"/"Evisceradoras" se deriva de `machineType`. (3) NUEVO panel "Causa de los paros": lista los paros que el sensor midio, el tecnico dicta el por que (voz -> `refineText` -> guardar), se clasifica por responsable (mantencion/operacion/externo/planificado) y las de Mantencion pueden ir al historial del equipo.
- Modelo de datos: las causas van a `paros` con `origen:'shoplogix'` + doc id determinístico `sensorStopKey(...)` (re-anotar CORRIGE, no duplica). Se reusa `paros` en vez de crear coleccion nueva para no tocar `firestore.rules`. ⚠ `LineOeeCard` sumaba todos los `paros` al OEE de area: ahora filtra `origen !== 'shoplogix'`, porque esos minutos ya los descuenta la Disponibilidad del sensor (habria sido doble conteo).
- Archivos: `functions/shoplogix/{normalizer.js,__tests__/normalizer.test.js}`; PWA: `components/grader/{SensorStopsCausePanel.tsx (nuevo),ShoplogixOnlyScorecard.tsx,UpstreamMachinesPanel.tsx,LineOeeCard.tsx}`, `services/{paros.ts,shoplogix/*}`, `types/index.ts`, `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: tsc limpio, eslint sin errores, 746 tests PWA + 20 de functions verdes. Punta a punta en produccion con el turno real del 28-jul: el panel listo el unico paro real (22,8 min a las 15:45, ≈455 pz al objetivo de 20 pz/min), se guardo la causa, quedo el doc en `paros` con su stopKey y la entrada en `maintenanceLog` (origen `paro_sensor`) — los 2 docs de prueba se borraron despues. En Yal (paros ya clasificados por el sensor) el panel muestra los 5 mas largos con boton "Detallar" y un toggle para el resto.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado, primer turno real de Filete → mirar si `scrapReasons` viene poblado (habilitaria OEE completo A*P*Q sin Grader), validar el objetivo de 20 pz/min y probar el dictado por voz en planta. Pendientes #3 (grafico velocidad real vs objetivo), #5 (OEE de area con la GEA manual) y #6 (alertas de Filete).

## 2026-07-29 - claude - Filete visible en calendario y resumen del mes ("Turno Dia")

- Hecho: con los datos ya sincronizados aparecieron 4 puntos donde el nombre del turno se comparaba contra listas/strings fijos y Filete quedaba invisible: (1) el calendario buscaba solo `Turno 1/2/3` → ahora descubre los turnos REALES del dia desde los docs; (2) `dayScanned` miraba solo claves de Chonchi; (3) el bucket dia/noche usaba una heuristica horaria de Yal que mandaba "Turno Dia" (07:30 local) a la noche → ahora el nombre explicito manda; (4) `SHIFT_META_TABLE` no tenia "Turno Dia" → la UI mostraba "?". Ademas, la grilla T1/T2/T3 del resumen mensual cae a Dia/Noche cuando la linea no usa esa nomenclatura (antes mostraba 0/0/0 con turnos productivos).
- Archivos: `apps/pwa/src/components/grader/{GraderHistoricalCalendar.tsx,GraderMonthlyStatsPanel.tsx}`, `apps/pwa/src/services/grader/graderShiftDisplay.ts`.
- Verificacion: `tsc` limpio, 741 tests verdes, eslint sin errores. En preview con datos reales: el 28-jul pasa de "sin proceso" a **D · 59**, y el resumen del mes de "07-28 · ?" + "T1 0 · T2 0 · T3 0" a "07-28 · Dia" + "1 Dia · 0 Noche". Yal (mayo) sin regresion: mantiene sus chips Excel Dia/Noche + SLX T2/T3.
- Estado: EN REVISION — PR abierto.
- Sigue: el sabado arranca el proceso normal de Filete; mirar el primer turno real y ajustar `defaultShiftSchedule` con los horarios que emita Shoplogix.

## 2026-07-29 - claude - Filete conectado a Shoplogix (deja de ser "próx.")

- Hecho: la pestaña Filete de Análisis de Turno pasa de deshabilitada a línea viva con datos Shoplogix. Nuevo `plantSlug` **`filete`** (doc `shoplogix/filete`) con la ÚNICA máquina instrumentada del área: la **Baader 200 de Línea 1** (`3c0581da-…`, área Filetes areaid 8181). La GEA de filete no tiene integración todavía y no hay Grader aguas abajo → sin Excel, sin P0%, sin Calidad (el OEE queda en A·P, igual que Yal). De paso se parametrizaron los textos que decían "las 3 Baader"/"Evisceradora" en el KPI board: ahora salen de `machineKind`/`kpiScopeNote` de `plantLines.ts`, así que Filete no hereda copy del Eviscerado.
- Archivos: `functions/shoplogix/{machines.js,sync.js}` (registry + `ACTIVE_PLANTS`), `functions/index.js` (mapa plant→plantLineId para el deep-link de notificaciones, detección "filete" en ARIA), `functions/scripts/validate-plant-integration.js`; PWA: `config/plantLines.ts`, `services/shoplogix/{shoplogixMachines.ts,types.ts,shoplogixShift.service.ts}`, `components/grader/{PlantKPIBoard.tsx,UpstreamMachinesPanel.tsx}`, `components/settings/ProcessNotificationsPanel.tsx`, `services/aria/{tools/grader.ts,proactiveAlerts.ts}`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificación: `tsc --noEmit` limpio; eslint sin errores (solo warnings preexistentes); 741 tests PWA verdes; 78 tests de `functions/shoplogix` verdes; preview en `?linea=chonchi-filete` muestra la pestaña habilitada, el alcance correcto y "Sin datos Shoplogix" (esperado: el sync de `filete` recién corre cuando se despliegan las functions). Eviscerado sin regresión.
- Estado: HECHO — PR #286 mergeado y desplegado (functions + hosting en verde).
- Datos reales confirmados el mismo dia: el sync escribio `shoplogix/filete/shifts/*` solo, y el backfill 20→28 jul trajo el dia de pruebas de la Baader 200: **2026-07-28 "Turno Dia" = 59 ciclos** (el probe daba 42 en la ventana consultada + 17 Unscheduled). A 17.6% · P 21.1% · Calidad N/A.
- Aprendizaje clave: **Filete nombra su turno "Turno Dia"** (sin tilde, D mayuscula), distinto de Chonchi (T1/T2) y Yal (T1/T2/T3).
- Sigue: tras el merge, (1) `shoplogixProbe?plantSlug=filete` para ver qué turnos emite Shoplogix en el área, (2) `shoplogixBackfillRange?plantSlug=filete&from=…&to=…` para poblar histórico, (3) `node functions/scripts/validate-plant-integration.js filete <fecha>`, (4) ajustar `defaultShiftSchedule` de la línea con los horarios reales.

## 2026-07-26 - claude - Snapshot/restore de Firestore + workflow de eval de contenido (PR #284)

- Hecho: cierre de los 2 huecos pendientes del sistema agéntico. `scripts/firestore-snapshot.js` (list/dump/restore con dry-run por defecto) como red de seguridad antes de escrituras masivas a producción. `.claude/workflows/verificar-contenido-fichas.js` escrito para auditar contenido técnico de las 7 fichas contra manuales PDF, aún no ejecutado a propósito.
- Archivos: `scripts/firestore-snapshot.js`, `.claude/workflows/verificar-contenido-fichas.js`, `.gitignore` (`_snapshots/`).
- Verificación: 5 pruebas reales contra producción del script de snapshot (list, dump, rechazo de ruta de documento, restore en dry-run, ayuda sin argumentos). El workflow de eval no se corrió (a propósito).
- Estado: HECHO — PR #284 mergeado y desplegado.
- Sigue: correr `verificar-contenido-fichas.js` cuando Orel lo pida.

## 2026-07-26 - claude - Sistema agéntico + optimización de contexto

- Hecho: capa de ejecución por costo con 3 subagentes globales en `~/.claude/agents/` (`verificador-web`, `implementador-patron`, `cerrador-pr`, todos model=sonnet) para que verificación en navegador, aplicación de patrones y cierre de PR no corran al precio del modelo del bucle principal. Nueva skill global `mockup-antes-de-construir` que vuelve mecánica la regla de mostrar mockup antes de construir UI. Optimización de contexto: `CLAUDE.md` con regla de costo obligatoria (nunca leer completo `_novedades.json` ~840 KB/210k tokens ni los `_MANIFIESTO.json`, solo grep/jq), lectura obligatoria partida en "siempre" (~20 KB) vs "según la tarea" (~42 KB). Memoria del Centro de Aprendizaje compactada de 68 KB a 15 KB (−78%).
- Archivos: `~/.claude/agents/*.md` (3 nuevos), `~/.claude/skills/mockup-antes-de-construir/SKILL.md`, `OneDrive\ANTARFOOD\CLAUDE.md`, memoria de Claude. Respaldo en `OneDrive\ANTARFOOD\_BACKUP_MEMORIA_CLAUDE\2026-07-26\`.
- Verificación: skill activa de inmediato; los 3 agentes requirieron reinicio de sesión para registrarse (confirmado). Ningún cambio en código de la app.
- Estado: HECHO
- Sigue: cerrar 2 huecos del checklist agéntico — recuperación (snapshot antes de escrituras masivas a Firestore) y evaluación (verificar contenido de las 9 fichas contra manuales fuente).

## 2026-07-25 - claude - Componentes del equipo: fotos reales con hotspots editables (PRs #278-#283)

- Hecho: "Componentes del equipo" del Grader pasó de ilustración SVG abstracta a 10 fotos reales con puntos numerados clicables y zoom/paneo. #278 primera foto real; #279 galería de 9 fotos más; #280 cada foto con hotspots + zoom/paneo (`ImageLightbox`); #281 migración a Firestore (`learningContent/{slug}/components/{id}`) + editor admin clic-para-agregar/arrastrar-para-mover; #282 botón "Administrar" en cada sección editable; #283 nota del punto activo fija bajo la foto + grid 2 columnas en desktop. Causa raíz del mal posicionamiento inicial: `object-fit:cover` con altura fija recortaba la foto; se resolvió con `aspectRatio` real de cada imagen.
- Archivos: `apps/pwa/src/components/learning/{GraderVisualPilot.tsx,HotspotDiagram.tsx}`, `apps/pwa/src/pages/{MachineLearningPage.tsx,LearningAdminMachinePage.tsx}`, `apps/pwa/src/services/learningContent.ts`, `apps/pwa/src/styles/learningDossier.css`, `scripts/seed-grader-components.js`, 10 fotos en `apps/pwa/public/learning-assets/grader/`.
- Verificación: tsc 0 en cada PR; check "build" verde en los 6; verificado en preview y en producción con las 10 fotos y hotspots bien posicionados.
- Estado: HECHO — 6 PRs mergeados y desplegados.
- Sigue: Orel debe probar el editor admin en vivo y decidir si marca los 4 candidatos SAP como repuestos comunes del Grader (`3300110019`, `3300103437`, `3300103438`, `3300103452`). Falta extender "Componentes del equipo" a las otras 8 máquinas.

## 2026-07-22 - claude - Fase 2: Cascada del mes (pestaña default) + Tendencia v3 con modo Comparar

- Hecho: (1) Pestaña "Cascada del mes" en la Vista panorámica (nueva DEFAULT — es la vista de la meta grande): cascada de pérdidas agregada de todos los turnos del mes desde `stateAggregates` del doc padre (0 reads; `cascadeFromMonthAggregates` en lossBuckets inyecta el uptime que los agregados excluyen). Muestra uso real vs uptime clásico lado a lado, techo de máquina, uso real por Baader, piezas máx teóricas del mes y top-10 piezas perdidas por causal con dueño y ×N eventos. Excluye Unscheduled (tiene su chip propio). (2) Tendencia v3: etiquetas de TODOS los días (solo número de día, interval 0 — el "4/7 no sale" era el eje saltando día por medio), marcador gris "sin proceso" al pie en días vacíos, y modo "Comparar" (default) con barras T2|T3 agrupadas + ambos promedios móviles; "Por máquina" solo en foco de un turno (en Comparar serían 6 series). (3) Fix previo verificando en prod: horario de columna de disponibilidad por MODA del mes (no primer turno hallado) y etiquetas sin adjetivos de jornada (T1 "mañana" mentía: su único día de julio es la madrugada renombrada del 8-jul); "~" ámbar cuando el horario sale de ≤2 días.
- Archivos: `apps/pwa/src/components/grader/{GraderHistoricalCalendar.tsx,UpstreamMachinesPanel.tsx}`, `apps/pwa/src/services/shoplogix/{lossBuckets.ts,__tests__/lossBuckets.test.ts}`.
- Verificación: tsc 0, lossBuckets 10/10. Prod verificado por DOM/canvas (pane de captura con glitch de render — screenshots negros; verificar por innerText/getImageData).
- Estado: EN DEPLOY con este push.
- Sigue: confirmar significado de LOGICA con el supervisor (17h de julio sin clasificar); considerar promover "uso real" a los KPIs del Resumen del mes tras validación de Orel.

## 2026-07-21 - claude - Cascada de pérdidas + ventana efectiva + taxonomía de causales (fase 1)

- Hecho: (1) `syncDay` guarda `effectiveStart/effectiveEnd` en el doc padre (primer→último estado uptime entre máquinas = "primer pescado→último"); backfill julio Yal 21/21 OK — ej. real: T2 14-07 programado 14:45→00:00 pero efectivo 14:54→21:30. (2) `lossBuckets.ts`: taxonomía causal→bucket con dueño (planificado=personas / externo=proceso / mantención=equipos / sin-clasificar visible / fuera-turno), calcada de los reasons REALES de julio en Firestore (COLACION, CUMPLIMIENTO CUOTA, FALTA MMPP, AJUSTE MANTENIMIENTO, CINTAS, ENERGIA→externo, Micro). Motiva: `shiftRuntime` actual incluye colación en el denominador (normalizer.js:215) → uptime subestimado e injusto. (3) `LossCascadeCard` en el panel upstream del TurnoPage: barra sobre el TECHO real (turno − planificado), cascada numérica con dueños, piezas máx teóricas (techo × cadencia real por máquina) y piezas perdidas por causal. (4) Tooltips calendario: horario real efectivo + uso de máquinas + labels reales T1/T2/T3 (fix "D/N (Shoplogix)" en Yal).
- Archivos: `functions/shoplogix/sync.js`, `apps/pwa/src/services/shoplogix/{lossBuckets.ts,shoplogixShift.service.ts,__tests__/lossBuckets.test.ts}`, `apps/pwa/src/components/grader/{LossCascadeCard.tsx,UpstreamMachinesPanel.tsx,GraderHistoricalCalendar.tsx}`, test fixture slxMonthResolve.
- Verificación: tsc 0, vitest 113/113 (8 nuevos lossBuckets), node --test functions 71/71. Functions desplegadas (sync wakeup/now/http/backfill) + backfill ejecutado y verificado contra docs reales.
- Estado: functions EN PROD; PWA se despliega con este push.
- Sigue: fase 2 — usar `usoReal` (techo) como uptime oficial en KPIs/mes; clasificar ENERGIA con Orel; cascada agregada mensual.

## 2026-07-21 - claude - Calendario Grader: tooltips mobile + total 24h + reconciliación post-brief Shoplogix

- Hecho: (1) `ChipTooltip` en `GraderHistoricalCalendar` — tooltip tap+hover (portal, cierre tap-fuera, patrón de `ui/InfoTooltip`) reemplaza los `title=` nativos de los chips Excel (primary/secondary/orphan), que eran invisibles en mobile; `renderShiftChip` pasó a componente `ShiftChip`. (2) Footer "Σ 24h" por celda: total del día calendario 00:00→24:00 sumando chips Excel primary + SLX día/noche visibles (sin doble conteo — mutuamente excluyentes vía hasExcelDay/Night); tooltip con desglose por turno, escala solo cuando Yal retome 3 turnos. (3) `checkShiftReconciliation` (CF NUEVA, cron 30 min): al enviar el brief de fin de turno se guarda `endBriefSnapshot`; se re-verifica +3h y +24h contra el doc padre; si el total cambió >20 pz o >3% → alerta Telegram "🔄 Corrección Shoplogix" (antes/después por máquina) + `correctionDetected`/`reconciliationNote` en el doc. (4) Brief de FIN de turno gana línea `🕐 Horario real` (scheduledStart/End de intervals — el de INICIO muestra la plantilla oficial del rollup, que puede diferir del horario real trabajado; no había horas hardcodeadas). (5) PWA lee los campos nuevos (`parseShiftParent`) y muestra badge 🔄 en los chips SLX del calendario con el detalle en tooltip.
- Archivos: `apps/pwa/src/components/grader/GraderHistoricalCalendar.tsx`, `apps/pwa/src/services/shoplogix/shoplogixShift.service.ts`, `apps/pwa/src/services/grader/__tests__/slxMonthResolve.test.ts`, `functions/index.js`, `functions/shoplogix/turnoBrief.js`.
- Verificación: tsc 0, vitest slxMonthResolve 16/16, node --test turnoBrief 16/16, `node --check` functions OK. Functions DESPLEGADAS a mano (service account) y confirmadas con `functions:list`: checkShiftReconciliation creada, checkShiftEndBriefs actualizada.
- Estado: HECHO — functions en prod; PWA se despliega con este push a main.
- Sigue: verificar la 1ª corrección real detectada (alerta 🔄 + badge en calendario); probar tooltips en mobile real.

## 2026-07-19 - claude - Power BI: export Grader + página "Análisis de Turno" — PR #252

- Hecho: retomado el pendiente de pulir el tablero Power BI piloto. `scripts/powerbi/export-powerbi-datasets.js` gana 3 tablas nuevas del Grader (`graderDailySummaries` → `fact_grader_turnos`/`fact_grader_p0_causas`/`fact_grader_calibres`) más fix de `plantId` hardcodeado en `fact_shoplogix_turnos/estados` (afectaba 781/1582 filas con Yal en temporada). El resto del trabajo (modelo, medidas DAX, página nueva, publish) fue en Power BI Desktop directamente (fuera de este repo) vía sesión de computer-use: relaciones dims↔facts + `dim_fecha`, medidas `P0 %`/`Disponibilidad %`/`Averia Macro Horas`/`Piezas Grader`, página "Análisis de Turno" con 4 KPIs + Pareto P0 + mix calibres + Pareto averías Shoplogix (filtrado `esAveria=1`, excluye Planned Downtime). Publicado y verificado en vivo en app.powerbi.com.
- Archivos: `scripts/powerbi/export-powerbi-datasets.js` (+71). Detalle completo (medidas, relaciones, gotchas del publish) en memoria de Claude `project_correo_empresa_m365_orelcain.md`.
- Verificación: export corrido contra Firestore real (10 CSVs OK). Publish a Power BI Service confirmado vía navegador (timestamp + página visible con datos).
- Estado: HECHO — PR #252 mergeado, `.pbix` publicado.
- Sigue (no bloqueante): slicer de fecha en la página, medidas MTTR/MTBF, filtro Planned Downtime a nivel de página en vez de solo el gráfico de averías.

## 2026-07-19 - claude - Shoplogix: turnos EN CURSO se congelaban tras la 1ª escritura — PR #251 (URGENTE)

- Origen: Orel reporta que la PWA no muestra data de Yal Turno 2 con Shoplogix entregando hace +20 min. Diagnóstico con Firestore + logs de `shoplogixSyncWakeup`: el poller vivo y con datos frescos, pero cada poll saltea el turno por "congelado" — doc pegado en su 1ª escritura (16:23, 0 ciclos).
- Causa raíz: `isShiftAlreadyFrozen` compara `scheduledEnd` (wall-clock-as-UTC) contra `now`/`lastSyncAt` (UTC reales) → `closedForMs` inflado +4h (invierno) > gracia 2h → cualquier turno, incluso en curso, se congela apenas tiene una escritura. No se vio antes: freeze reciente (optimización writes) y sin turnos vivos con producción (Chonchi 0 ciclos desde 21-06; Yal arrancó temporada HOY). Días pasados se ven bien porque el re-sync retroactivo usa forceAll.
- Fix: convertir el cierre a UTC real (`+ chileUtcOffsetHours(syncedAt)`) antes del freeze check, en el call site de `syncDay`. Self-healing al desplegar (el próximo poll reescribe los turnos pegados del día; no hay pérdida de data).
- Archivos: `functions/shoplogix/sync.js` (+12/-2).
- Verificación: 71/71 tests del módulo shoplogix OK (frozenShift 15/15). Diagnóstico validado contra doc real `shoplogix/yal/shifts/2026-07-19_Turno 2` y logs de prod.
- Estado: HECHO — mergeado (squash, OK de Orel) 22:00Z, deploy functions verde 2m46s, y VERIFICADO en prod: wakeup 22:03Z reescribió `2026-07-19_Turno 2` (ciclos 581/592/448, frozenSkipped=0, paros reales CINTAS/FALTA MMPP). Vista en vivo revivida sin pérdida de data.

## 2026-07-19 - claude - Admin: botón "Actualizar Power BI" (export + refresh a demanda) — PR #250

- Hecho: página `/admin/powerbi-export` (patrón sync-telegram): la PWA deja la orden en el doc de control `powerbiExport/chonchi`; el agente del PC (`C:\Users\orelc\automation\agente_powerbi.py`, tarea "ANTARFOOD PowerBI Agente" c/15 min, YA creada y probada) corre el export de CSVs → OneDrive empresa y dispara el refresh del dataset `KPIs_Mantencion_Piloto` en Power BI Service (REST + token MSAL en caché, `powerbi_auth.py`). La página muestra heartbeat, estado, refreshOk, duración e historial (`corridas`, solo Admin SDK). También se commiteó `scripts/powerbi/export-powerbi-datasets.js` (corría en prod local pero estaba fuera de git).
- Archivos: `apps/pwa/src/services/powerbiExport.service.ts` (nuevo), `apps/pwa/src/pages/admin/PowerBIExportPage.tsx` (nuevo), `App.tsx`, `AdminPanelPage.tsx`, `firestore.rules` (bloque `powerbiExport/{plantId}` calcado de `telegramSync`), `scripts/powerbi/export-powerbi-datasets.js`.
- Verificación: tsc 0 + eslint 0 + build prod OK (worktree `D:\a\wt-powerbi-button`). Ciclo end-to-end probado con orden simulada vía Admin SDK: export real OK (31,4 s), refresh falla limpio con "Power BI requiere login" (esperado), doc + corrida escritos.
- Estado: HECHO — Danilo corrió el login device-code (token OK), PR #250 mergeado con su OK (squash 22:09Z), deploys PWA + rules verdes, y ciclo E2E verificado: orden→agente→export 33 s→refresh ViaApi **Completed** en Power BI Service (22:10:48→22:11:10). Doc de control: estado ok / refreshOk true.
- Sigue: solo el clic real de Orel en `/admin/powerbi-export` cuando quiera usarlo.

---

# Historial resumido (anterior al 2026-07-19)

Bloques temáticos. Cada uno resume varias entradas; el detalle está en git.

## 2026-07-04 → 2026-07-18 · ARIA, seguridad, turnos y sync de Telegram

- **ARIA Telegram nació casi completa en una sola tanda (04-jul)**: chat natural con voz, 6 fuentes
  de datos nuevas, brief matinal 7AM + a demanda, crear incidencias con confirmación, whitelist +
  memoria + cerrar incidencias + alertas DM, voz de respuesta + visión + gráficos, respuestas
  formateadas (markdown→HTML de Telegram), "ARIA aprende" (hechos globales + lagunas + fallback de
  modelos) y ARIA como pivote de la app (mapa de módulos con conciencia de rol).
- **ARIA + repuestos por foto (06 al 07-jul)**: visión con OCR, adjuntar foto a un repuesto del
  maestro, crear/vincular repuesto desde foto (match SAP + criterio LLM), modo lote de fotos, y
  memoria de contexto para entender "ese mismo repuesto".
- **ARIA chat de la PWA (08-jul)**: primera capacidad de ESCRITURA — crear/vincular repuesto y
  editar código de fabricante desde el chat in-app.
- **Modelos**: actualización por deprecaciones de Groq + un 3er proveedor de respaldo.
- **Seguridad**: cierre de lecturas anónimas (PR #146) y proveedor anónimo apagado; parche de
  echarts por CVE-2026-45249 (XSS).
- **Turnos**: Shoplogix pasa a ser la fuente de verdad de horarios (PWA + manejo de DST en functions).
- **Repuestos**: "Solicitar a bodega" cierra el círculo (entregar descuenta stock real) y los nombres
  comunes se editan desde el panel de detalle.
- **PWA**: recuperación robusta ante "Failed to fetch dynamically imported module" post-deploy, y fix
  del visor de imágenes que no se podía cerrar en móvil.
- **Sync Telegram→OneDrive**: controlado desde el panel admin (PWA ↔ agente del PC), con historial de
  corridas, multi-grupo y layout responsive.
- **Barrido autónomo (18-jul, Sonnet 5 en loop)**: 13 PRs de pendientes + diagnósticos + limpieza.

## 2026-06-17 → 2026-06-21 · Centro Técnico Documental, tableros y cierre de la normalización

- **CTD en 5 pasos**: expediente autosuficiente (#92+#93) → "programa vivo" (#94) → traer de Equipos
  y repasada de flujo (#95+#96) → gestión de activos v1 (#97) → órdenes de trabajo, Camino B (#98).
- **Tableros / Unifilares (NFPA 70B)**: levantamiento con Excel + formulario en la PWA, realineado de
  "módulo suelto" a parte del expediente del equipo, y reconciliación en PR #91.
- **Dependabot**: las 23 alertas resueltas (bumps + overrides).
- **Fase 5 de limpieza — CERRADA el 2026-06-20**: retirada de features legacy (`machines` /
  `plantAssets`) con sus scripts de borrado, barrido de código muerto, chatbot ARIA in-app apuntando
  al maestro unificado, y retiro de `/insumos` y de la pestaña Mapas. El borrado **se ejecutó**:
  `11-delete-legacy.js --write` borró 9.303 docs (backup en `backups/fase5-2026-06-20T17-25-56/`) y
  se verificó en vivo que `insumos`/`machines`/`plantAssets`/`repuestosBaader200`/`hierarchy/*/repuestos`
  quedaran en **0**, con maestro (7657) / bodega (2170) / hierarchy (702) intactos.
  Pendiente menor que quedó suelto: `EquipoPlacementTool` en `PlantaLeafletEditable.tsx` quedó inerte
  (su trigger se fue con el panel "Equipos SAP") → limpiar como código muerto junto con los campos
  `equipoToPlaceId` del store.
- **Repuestos**: pulido (ubicación en la fila, composición por clase), mejoras de sidebar/buscador/
  favoritos (#78), rediseño de las tarjetas KPI de stock, carga rápida de stock+ubicación, cotejo
  Excel↔app con import único a bodega, y foco SAP por defecto en la pestaña Áreas.
- **Deploy a producción** (#77).

## 2026-06-12 · Arranque

Normalización del maestro de repuestos (Fases 0-6) + rework de UI + coordinación multi-agente.
Desde acá el flujo pasó a ser estricto: **todo por rama + PR**.

---

# Pendientes que vienen de atrás

Estos seguían abiertos cuando se compactó el historial (2026-07-30):

- **Tablero piloto sin levantar**: CCM motor `720004608` / bomba `720004607` — falta cargar su placa
  real. Viene arrastrándose desde el 20-jun.
- **~45 equipos sin `tipo`** asignado en el CTD.
- **`useAppVersion.reload()` duplica a mano** la limpieza de caches y service workers → candidato a
  usar `clearCachesAndServiceWorkers()` en vez de repetir la lógica.
- Opcional: revisar si la alerta de secret-scanning #1 de GitHub se puede cerrar, ahora que la key
  quedó restringida.
- Opcional: botones Confirmar/Cancelar dedicados para repuestos en el chat ARIA de la PWA (hoy es
  solo texto plano) + soporte de fotos.
