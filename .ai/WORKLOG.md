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

> **Compactado el 2026-09-17** (tercera vez; las anteriores fueron el 2026-07-30 y el 2026-08-18).
> - **Enteras, arriba y la más nueva primero:** las entradas del 2026-09-15 en adelante.
> - **Resumidas por tema** (gotchas, causas raíz, decisiones con su porqué, cifras y pendientes):
>   2026-09-01 → 09-12 y 2026-08-11 → 08-26 (esta vez), 2026-08-01 → 08-10 y lo anterior (antes).
> - Respaldo del archivo previo (377 KB) en `.ai/backups/WORKLOG-2026-09-17-pre-compactacion.md`;
>   el detalle entrada por entrada vive en git (`git log -p .ai/WORKLOG.md`).
>
> **Regla:** cada entrada nueva va ARRIBA, justo bajo esta nota (no al final). Si el archivo pasa de
> ~150 KB, compactar lo más viejo del mismo modo.

## 2026-09-18 · Bitacora ronda 34 · MTBF y MTTR con definición y cálculo a la vista
- Pregunta de Orel: la banda de la planilla dice «MTBF - MTTR» pero solo se calculaba MTTR. Se acordó: la banda no se toca (fidelidad al Excel); debajo de la tabla va UNA línea con las dos siglas, su definición entre paréntesis y el cálculo con los números del turno; en el histórico, MTBF del período y por máquina.
- Base del MTBF (decisión de Orel): horas del turno − 1,5 h sin producción (colación 1 h + reunión de inicio + ejercicios compensatorios) − paradas registradas, ÷ fallas con parada. `MINUTOS_SIN_PRODUCCION_POR_TURNO = 90` en `mtbf.ts`. Es el MTBF de la PLANTA con lo que registran los técnicos, aproximado y dicho así; el riguroso por máquina con tiempo de producción real de Shoplogix ya existe en Análisis de Turno (`kpisMantencionTurno`, backend `kpisMantencion.js`).
- Descartado: descontar las ventanas de la rueda máquina por máquina (los eventos no siempre traen máquina de la rueda) y usar el tiempo de producción de Shoplogix (solo línea Grader y sus turnos no calzan con los de Mantención).
- Hecho: `mtbf.ts` (`minutosDelTurno`, `mtbf`, `explicacionMtbfMttr`, `explicacionMtbfMttrPeriodo`); la línea bajo la planilla en correo (HTML y texto), PDF y bloque en vivo; histórico con `mtbfMin` y `minutosTurnos` en `ResumenPeriodo`, `mtbfMin` por equipo, KPI MTBF en pantalla/correo/PDF y «· MTBF 27 h 16 min» en «Equipos que más pararon».
- Gotcha: `formatoMinutos` rellena con cero («3 h 03 min»); la prueba se escribió con «3 h 3 min» y falló.
- Verificación: vitrina (línea bajo el bloque y MTBF por máquina en el histórico); tsc 0; vitest OK; build y auditorías OK.
- Estado: HECHO.

## 2026-09-17 · Bitacora ronda 33 · Las horas corridas al pegar el correo en Outlook
- Foto de Orel (Outlook de escritorio, mensaje nuevo, pegado): la hora de cada evento caía en una posición distinta (21:05 al borde, 22:25 al medio) y cada evento quedaba más sangrado que el anterior.
- Causa: tablas ANIDADAS. Cada evento iba en `<table>` dentro de un `<td>` de otra tabla, y el encabezado (equipo + hora) en una tercera. Word, el motor de Outlook, no respeta `width:100%` en una tabla anidada: la del encabezado se encogía al contenido (la hora quedaba pegada al texto) y cada nivel sumaba sangría.
- Fix en `htmlEvento` (`bitacoraCorreo.ts`): una sola fila de TRES celdas directas en la tabla de eventos: número (36 px) · contenido · hora (96 px, derecha, `nowrap`). Cero tablas anidadas en la fila del evento (la de repuestos sigue dentro del contenido, un nivel, como la de fotos que ya funcionaba).
- Regla para el correo: NUNCA una tabla `width:100%` dentro de una celda para alinear algo a la derecha; usar una celda más en la misma fila.
- Verificación: muestra a 1000 px con las 4 horas alineadas al mismo borde y los 4 números al mismo margen; tsc 0; eslint 30; vitest 2.804 OK; build y auditorías OK. Falta la prueba real de Orel pegando en Outlook (no se puede correr Word aquí).
- Estado: HECHO.

## 2026-09-17 · Bitacora ronda 32 · El formulario habla como la planilla
- Pedido de Orel: que los rótulos del evento coincidan con las columnas del Excel («Título» confundía: en la planilla eso es «Falla»).
- Hecho: «Equipo o área» → «Máquina o área» (`BuscadorEquipo`), «Título» → «Falla · Opcional · en pocas palabras», «Qué pasó y qué se hizo» → «Observaciones · qué pasó y qué se hizo» (`EventoBitacoraSheet`); los avisos de conflicto de borradores dicen «la máquina», «la falla», «Observaciones» (`borradores.ts`). Los campos del modelo no cambian (`equipo`, `titulo`, `descripcion`).
- Ojo: «Falla» también es un TIPO de evento (chip). Se aceptó igual porque así se llama la columna de la planilla; si confunde en un preventivo, la alternativa es «Falla / trabajo».
- Verificación: tsc 0; eslint 30; vitest 2.804 OK; audit-voseo y audit-piel OK; vitrina a 375 px con el editor abierto: los tres rótulos nuevos.
- Estado: HECHO.

## 2026-09-17 · Bitacora ronda 31 · La planilla MTTR en el correo visto desde el celular
- Problema (foto de Orel, iOS Mail): la tabla se adaptaba al ancho del teléfono y quedaba apretada: Observaciones con ~150 px, filas altísimas, «EMPACADORA» montada sobre la columna vecina, y la descripción repetida en Falla y Observaciones.
- Límite: no hay forma fiable de mandar reglas «solo celular» desde un correo pegado en Outlook (Word pisa los `<style>` y las media queries). Lo que sí se controla es cómo se reparte el poco ancho.
- Hecho en `recoleccionMttr.ts`:
  - Columnas en PROPORCIÓN (`table-layout:fixed`, 14/16/21/9/40 %) en vez de píxeles; en PC (~960 px) quedan cerca de la planilla.
  - La banda azul con el logo va en su propia tabla: con `table-layout:fixed` la primera fila manda los anchos y la celda del logo (146 px) pisaba a la columna Fecha.
  - `overflow-wrap:anywhere` en las celdas: las palabras largas se partan en vez de montarse.
  - Sin repetir texto: sin título, «Falla» lleva la primera frase y Observaciones el resto (`primeraFrase`); con título igual a la descripción, Observaciones no la repite. La fecha ya no es `nowrap` (en el celular se parte en 2 líneas).
- Verificación: muestra del correo a 390 px (Observaciones 114 px, sin montajes) y a 1000 px; tsc 0; vitest OK; build y auditorías OK.
- Estado: HECHO. En el teléfono seguirá siendo una tabla de 5 columnas apretada: para leer en el celular está el mensaje de WhatsApp.

## 2026-09-17 · Bitacora ronda 30 · Vista PC: más ancho para el correo, eventos compactos
- Pedido de Orel: en PC la planilla MTTR se veía apretada en la vista previa del correo; dar más espacio a esa columna y achicar letra y espacio de los eventos de la izquierda.
- Hecho: la grilla pasa de 1fr/1,05fr a 2fr/3fr; la fila del evento en `md:` usa `text-subhead` (título, equipo y descripción), `text-footnote` en los repuestos y `py-2.5`; la vitrina de desarrollo sube a `max-w-7xl`.
- Causa raíz de lo «comprimido»: `ANCHO_CORREO` era 720 (el cuerpo de 680 + márgenes). La planilla MTTR va al 100 % del mensaje, y en el Outlook del PC el panel de lectura mide ~1000 px, así que la vista previa la dibujaba a la mitad del ancho real y luego la escalaba. Ahora el correo se arma a 1000 px (el detalle de la bitácora sigue en sus 680) y se escala a la columna: a 1500 px de ventana, columna de 662 px, zoom 0,66, Observaciones legible.
- Verificación: tsc 0; eslint 30; vitest OK; audit-piel/voseo/decimales OK; build OK; vitrina a 1500 px.
- Estado: HECHO.

## 2026-09-17 · Bitacora ronda 29 · La planilla «Recoleccion MTTR» arriba del correo, en vivo y como Excel
- Pedido de Orel: Mantención pega arriba del correo del turno una tabla de Excel («MTBF - MTTR»: Fecha · Máquina · Falla · Duración Falla (Min) · Observaciones) y abajo va el detalle. Debía verse IGUAL al Excel, no con diseño propio.
- Hecho:
  - `recoleccionMttr.ts`: las filas desde la bitácora (título o primera frase como «Falla»; «35min» o «0»; la fecha «17-sept-2026 jue» solo en la primera fila del día, como la llenan), el HTML con el aspecto exacto del archivo y el `.xlsx` real.
  - Correo del turno y del período: la tabla ARRIBA, el detalle debajo. PDF del turno y del período: la misma tabla arriba (`recoleccionMttrPdf.ts`, jspdf-autotable).
  - Pantalla del turno: el bloque «Recolección MTTR · así va arriba del correo» justo arriba de los eventos, llenándose en vivo, con «Bajar Excel». También en la hoja Compartir del teléfono y en los botones de PC.
  - El Excel: `public/plantillas/recoleccion-mttr.xlsx` es una plantilla con la tabla «Captura» (TableStyleMedium2), sus estilos y el logo; en el navegador `fflate` abre el zip, reemplaza la fila 4 por las filas reales y ajusta el rango de la tabla. Validado con openpyxl: fecha como serie con formato, número, tabla e imagen intactos.
- Formato leído del archivo original (`Recoleccion MTTR dia 09-08-2025.xlsx`, que Orel dejó en OneDrive y luego desapareció de ahí): banda B1:E1 `#00557F` Calibri 16 blanca, 42 pt; A1 `#F2F2F2` con el logo (PNG de 257×192 con aire: se recorta a la franja 64–124 y se muestra a 120×28); encabezados `#00557F` blancos; bandas blanco / `#D9E1F2` EMPEZANDO por la primera fila de datos; A–D centradas, E izquierda; anchos 146/184/317/171/929 px.
- Gotchas:
  - El logo salía estirado: el PNG trae aire arriba y abajo; hay que recortar, no escalar.
  - La tabla a 100% de ancho en el teléfono aplastaba Observaciones a 0: `[&_table]:min-w-[760px]` con `overflow-x-auto`.
  - En el Excel de Chile el `dd/mmm/yyyy ddd` se ve con guiones («17-sept-2026 jue»), por eso el HTML usa guiones.
  - `recoleccionMttr` NO importa `escaparHtml` de `bitacoraCorreo` (ciclo): tiene el suyo.
  - MTTR = promedio por parada (25 min en 2 paradas → 13 min); Orel lo confundió con el total. Es correcto.
- Archivos: `recoleccionMttr.ts`, `recoleccionMttrPdf.ts`, `logoRecoleccion.ts`, `public/plantillas/recoleccion-mttr.xlsx`, `bitacoraCorreo.ts`, `bitacoraPdf.ts`, `historialCorreo.ts`, `historialPdf.ts`, `BitacoraTurnoPage.tsx`, `HistorialBitacoraPage.tsx`, `CompartirTurnoSheet.tsx`, test nuevo `recoleccionMttr.test.ts`.
- Verificación: tsc 0; eslint 30 (sin cambio); vitest 2.804 OK; audit-piel/voseo/decimales OK; vitrina a 1100 y 375 px; PDF rasterizado; xlsx abierto con openpyxl.
- Estado: HECHO (pendiente: Orel manda el correo real y abre el Excel en su Outlook).

## 2026-09-17 · Bitacora ronda 28 · La pantalla del turno se alinea con lo que se envía
- Hecho (opciones C y E del mockup https://claude.ai/artifact/BcLAK48eg3NSdU6yNUcs4U):
  - C: la lista del turno se parte en «Eventos del turno N» y «Pendiente para el turno siguiente N» (punto ámbar), y cada evento lleva el MISMO número que en WhatsApp, el correo y el PDF. Los borradores van al final de la primera sección, sin número.
  - E: los repuestos del evento pasan de una línea corrida a una lista: cantidad, nombre común (o el del maestro) y debajo el código SAP con el nombre SAP.
- Un solo origen del orden: `gruposDelTurno(turno, eventos)` en `resumenBitacora.ts` (ordena, saca borradores y separa por `fuePendiente`). Lo usan la pantalla, WhatsApp, el correo y el PDF; antes cada uno repetía el filtro.
- Arrastre: cada grupo tiene su propia lista y su propio contenedor (`listaRef` / `listaPendientesRef`); mover con el asa o con las flechas se calcula dentro del grupo. Verificado en la vitrina: el evento «Sin hora» sube un lugar y la numeración se recalcula sola.
- Gotcha: el círculo del pendiente NO va relleno de ámbar. `--ink-warn` cambia de tono entre pieles (una lo tiene en 172 150 110) y el texto encima perdía contraste; va tintado (`bg-ink-warn/15 text-ink-warn`), como las píldoras.
- Archivos: `resumenBitacora.ts`, `BitacoraTurnoPage.tsx`, `EventoBitacoraFila.tsx`, `bitacoraWhatsapp.ts`, `bitacoraCorreo.ts`, `bitacoraPdf.ts`, `ordenYNombreComun.test.ts`.
- Verificación: tsc 0; eslint 30 (sin cambio); vitest 2.798 OK; audit-piel/voseo/decimales OK; build OK; vitrina a 375 px.
- Estado: HECHO (pendiente: Orel lo prueba en el turno real).
- Sigue: quedaron sin construir A (resumen con MTTR y repuestos como números propios) y B+D (marcar de un toque a los técnicos sugeridos, «N° 720004412»).

## 2026-09-17 · Bitacora ronda 27 · Correo y PDF con el formato nuevo + nombre SAP en WhatsApp
- Hecho: WhatsApp ahora muestra en cada repuesto el nombre común y, entre paréntesis, el nombre del maestro SAP (bodega busca por ese). El correo y el PDF se rehicieron según el mockup aprobado (https://claude.ai/artifact/LWeL9CmkwfowfNkxHc77HW):
  - Cabecera: «Bitácora de Mantención · planta», luego «Turno tarde · Miércoles 16-09-2026» y el horario con los técnicos de turno. Se quitó «Registrado por», porque ahora cada evento dice sus técnicos.
  - KPI: cifras en tinta neutra con un punto de color. MTTR solo si hubo paradas. Se agregó el KPI «repuestos usados» (códigos SAP distintos).
  - Secciones «Eventos del turno N» y «Pendiente para el turno siguiente N» (raya ámbar). Los eventos van numerados en círculo, con la misma numeración de WhatsApp.
  - Cada evento lleva: equipo y hora en una línea, el título, «Tipo · N° de equipo», etiquetas de impacto de color, el texto del técnico en un recuadro con barra, repuestos en tabla (Código SAP | común en negrita + nombre SAP | Cant.) y los técnicos.
- Gotchas:
  - jsPDF: medir `getTextWidth` con la negrita puesta, o el texto siguiente se monta.
  - Correo: sin anchos fijos, la columna del código ocupaba media tabla; se fijaron 96/48 px.
  - Para mirar el PDF sin navegador: mockear `jspdf` en un test temporal (el `save` es propiedad de la instancia, `spyOn` al prototipo falla) y rasterizar con PyMuPDF.
- Archivos: `bitacoraCorreo.ts`, `bitacoraPdf.ts`, `bitacoraWhatsapp.ts`, 3 tests.
- Verificación: tsc 0; eslint 30 (sin cambio); vitest 2.797 OK; audit-piel/voseo/decimales OK; build OK. Correo y PDF de muestra revisados a 720 px y A4.
- Estado: HECHO (pendiente: Orel prueba el envío real desde el iPhone/PC).

## 2026-09-17 · Bitacora ronda 26 · WhatsApp cortaba el mensaje en el 4.º evento

Orel compartió el turno tarde 16-09 (8 eventos) con el formato A2 y el texto llegó hasta «4. BALANZA
PESAJE MAREL · 21:00 / *Cinta infeed marel» (con el asterisco de negrita sin cerrar).
- **Causa:** al compartir imágenes + texto, WhatsApp pone el texto como PIE DE FOTO, que se corta en
  ~1.024 caracteres. El formato A2 tiene más líneas y llega antes al límite (el mensaje de ese turno
  mide ~1.900).
- **Fix:** si hay láminas y el mensaje pasa de 1.000 caracteres (`envioEnDosPasos`), la hoja envía en
  DOS pasos, cada uno con su toque (el navegador no deja abrir el menú de compartir dos veces sin un
  gesto): «1 · Enviar el mensaje» (`compartirMensaje`, solo texto, llega entero) y «2 · Enviar las N
  láminas» (`compartirLaminas`, solo archivos). Mensaje corto: igual que antes, todo junto.
- ⚠ **El monoespaciado NO evita los enlaces del iPhone:** en la captura de Orel los números de 8+
  dígitos siguen en verde (teléfono) y las horas subrayadas. Se deja el monoespaciado porque ordena;
  lo único que lo evitaría es insertar caracteres invisibles (descartado: se copiarían a SAP).
- Verificado en la vitrina a 375 px con `navigator.share` simulado: paso 1 = texto de 1.866
  caracteres sin archivos; paso 2 = 5 archivos sin texto; la hoja se cierra. vitest ok, eslint 30/30,
  audits ok, build ok.

## 2026-09-17 · Bitacora ronda 25 · Año en los turnos + mensaje de WhatsApp en secciones (A2)

**Año.** Los ids ya traen el año (`2026-09-16_tarde`): el dato estaba a salvo. Faltaba en lo que se
muestra. `etiquetaCortaTurno(id, anioActual)` agrega `-AAAA` solo si el turno no es del año en curso
(como Fotos/Mail de iOS): «Turno noche 29-12-2026» visto en 2027. El título del Historial (se
archiva) lo lleva siempre: `rangoDelPeriodo` → «04-09 al 17-09-2026» o «28-12-2026 al 10-01-2027».
⚠ Las pruebas que leen etiquetas cortas fijan el reloj en 2026 (`vi.useFakeTimers({ toFake: ['Date'] })`
en entregaTurno, bitacora y whatsappYEvento): si no, fallaban al cambiar de año.

**WhatsApp (mockup https://claude.ai/artifact/HKW8nyZAjk6ijNN3bNzHhm, Orel eligió A2).** Orel lo
envió al grupo y no se leía estructurado; en su iPhone las horas salían subrayadas y «10000202885»
como enlace de teléfono.
- Secciones en mayúscula y negrita (WhatsApp no tiene tamaños): BITÁCORA DE MANTENCIÓN, RESUMEN (en
  viñetas `- `; MTTR solo si hay paradas), OBSERVACIONES (cita), EVENTOS DEL TURNO, PENDIENTE PARA EL
  TURNO SIGUIENTE, SIGUE PENDIENTE DE TURNOS ANTERIORES.
- Eventos numerados en todo el mensaje (`*2. EMPACADORA E-PACK* · \`20:00–20:20\``), título en su
  propia línea, `_tipo · impacto_`, «N° de equipo \`…\`», lo que escribió el técnico como cita (`> `),
  repuestos `- \`sap\` nombre común ×n`, «Técnicos:» SIEMPRE (la cabecera ya no dice «Registrado
  por»), «Fotos: 3 · lámina 1».
- Separación A2: línea en blanco + `──────────` + línea en blanco entre eventos y antes de cada sección
  de pendientes (la divisoria sobrevive si WhatsApp junta líneas vacías).
- Horas, códigos y números de 8+ dígitos del técnico en `monoespaciado` (`protegerNumeros`) para que
  el teléfono no los convierta en enlaces. ⚠ Falta confirmarlo en el iPhone de Orel.
- La lámina dice «Evento 2 · lámina 2 de 5» (`numeroEvento` en `LaminaWhatsapp` y en su clave).
- La vista previa del PC dibuja citas, viñetas, monoespaciado y la divisoria (`LineaWhatsapp`).
- El correo y el PDF no cambian.
- Verificado: vista previa con el turno real del 16-09 y láminas en la vitrina; vitest 2796, eslint
  30/30, audits ok, build ok.

## 2026-09-17 · Compactación del WORKLOG (377 KB → 150 KB)

Pedido de Orel. El archivo había pasado de ~150 KB (377 KB) y además estaba desordenado: las entradas
del 15 al 17-09 se habían ido agregando AL FINAL (después de los resúmenes) y el título con la
plantilla había quedado enterrado a mitad del archivo.
- Enteras y arriba, la más nueva primero: las 22 entradas del 2026-09-15 al 17-09.
- Resumidas por tema: 2026-09-01 → 09-12 (141 KB → 24 KB, 13 temas) y 2026-08-11 → 08-26
  (128 KB → 22 KB, 19 temas). Se revisó que cada PR de la fuente siga citado (faltaban #908 y #538;
  agregados) y que los ⚠ sobrevivan (57 → 47 y 59 → 47: los perdidos eran avisos de tamaño del
  propio archivo y repeticiones).
- Sin tocar: los resúmenes del 2026-08-01 → 08-10 y anteriores, y «Pendientes que vienen de atrás».
- Respaldo completo en `.ai/backups/WORKLOG-2026-09-17-pre-compactacion.md`.
- ⚠ Para el próximo agente: la entrada nueva va ARRIBA, bajo la nota de compactación.

## 2026-09-17 · Bitacora ronda 24 · Cambiar el turno de un evento

Orel resolvió el pendiente del bandejón (línea manual HG, tarde 16-09) tocando «Resolver» el 17-09
por la mañana: la soldadura de Matías Serpa con Leandro Igor quedó en el turno DÍA 17-09 y el
pendiente decía «Resuelto en día 17-09». La soldadura fue en el turno NOCHE 17-09 (decisión de Orel).
- **Datos corregidos a mano** (admin SDK, respaldo en el scratchpad de la sesión): evento
  `lcDOGQ1BvCV6qkrGRHLN` → `2026-09-17_noche`; `cierre.turnoId` del pendiente `b9Sy6sTIdHIbRm2iAiks`
  → `2026-09-17_noche`. Borrado el borrador vacío `Y1lfBCr0EbtoDvOnshFj` (TOLDO PORTERIA, noche 17-09)
  que dejó una verificación de la ronda 21 al abrir «Resolver» con la sesión real.
  ⚠ Verificar «Resolver» SOLO en la vitrina: el autoguardado crea el borrador en prod.
- **Fila «Turno»** en el editor (nuevo, editar y resolver): `<select>` nativo con los últimos 7 días
  (`turnosElegibles`, 21 turnos, nunca futuro, nunca antes del turno del pendiente que cierra) y
  nombres cortos («Noche 17-09 · del pendiente»). Nota debajo cuando cambia. Se aplica SOLO al
  publicar o guardar (el autoguardado no mueve un borrador: si no, el editor lo daba por borrado).
  La hora tiene que calzar con el turno nuevo (`horaCalzaEnTurno`, ±1 h de holgura).
- Hook: `datos.turnoId` → crea en ese turno o escribe `turnoId`, `fechaTurno`, `banda` y
  `posicionMin: null`; el cierre del pendiente usa el turno destino; si el evento ya estaba publicado
  y cerraba un pendiente, `reubicarCierre` actualiza `cierre.turnoId` (solo si el cierre es suyo).
- Página: toast «Evento movido al turno noche 17-09 · Ver». Vitrina: mueve entre turnos de ejemplo.
- **Regla**: `turnoId` ya no es inmutable: `turnoMovible` exige id = fecha + banda y un turno entre hace
  10 días y mañana (`timestamp.date(int…)`). 111/111 en local (5 casos nuevos, fechas relativas a hoy).
- Verificado en la vitrina a 375 px: error de hora, mover con toast y «Ver», opciones de «Resolver».

## 2026-09-17 · Bitacora ronda 23 · iOS 27 (2/2): deslizar, Deshacer, arrastrar, visor con gestos y vibracion

Segunda mitad del mockup https://claude.ai/artifact/8b4xbwjvMUzUeJJgkAJn27 (C, H, D, G, I). La 1/2 es #1072.
- C: la fila del evento va dentro de `SwipeRow`: Editar · Pendiente/Quitar pendiente · Borrar
  (Descartar en borradores; Borrar solo autor o supervisor). `marcarPendiente` en el hook escribe solo
  `pendiente` (+ `cierre: null` al reabrir, + `actualizadoPorNombre`). La fila lleva `bg-card` (las
  acciones quedan debajo) y el separador pasa al contenedor exterior (`first:` dejaba de servir).
- H: borrar ya no pide «toca de nuevo»: el evento se esconde (`ocultos`, tampoco cuenta en los numeros),
  toast «Evento borrado · Deshacer» (5 s) y el borrado real (fotos incluidas) corre al vencer el plazo,
  al salir de la pantalla o en `pagehide`. El editor usa el mismo camino.
- D: el evento sin hora lleva un asa ≡ (pointer events + `setPointerCapture`, `touch-none`); linea
  azul donde queda; `posicionEnIndice` (nuevo, con test) da la `posicionMin` entre los vecinos. Teclado:
  flechas en el asa (reusa `posicionAlMover`).
  ⚠ El destino se calcula con la Y del `pointerup` y la ref se adelanta al render: con eventos
  seguidos, el estado aun no tenia el destino al soltar. ⚠ Cambiar el contenedor al empezar a
  arrastrar remontaba el asa y se perdia la captura: `SwipeRow` siempre, con `trailing=[]`.
- G: visor: deslizar cambia de foto (60 px), bajar cierra (110 px, el fondo se aclara), doble toque
  ×2, pellizco hasta ×4, arrastrar con zoom; puntos abajo; flechas solo con `hover:hover`.
- I: `services/bitacora/vibrar.ts` (15 ms; error = 20·80·20) al publicar, cerrar pendiente, marcar
  pendiente, soltar, mover y borrar; en errores de escritura del hook.
- ⚠ Para probar gestos por script: esperar ~40 ms entre `touchmove` (SwipeRow lee `dx` del render).
- Verificado en la vitrina a 375 px (claro/oscuro) y PC con mouse real; vitest 2790, eslint 30/30,
  audits ok, build ok.

## 2026-09-17 · Bitacora ronda 22 · iOS 27 (1/2): resumen sin color, una capa abajo, Compartir y barra compacta

Mockup aprobado (8 cambios, todos): https://claude.ai/artifact/8b4xbwjvMUzUeJJgkAJn27. Este PR lleva A, B, E, F.
- A: cifras de KPI en tinta normal y el estado en un punto de 8 px junto al rotulo (turno, tarjeta
  del Inicio, Historial). DESIGN.md §10 lo pedia; `Stat`/`Kpi` cambian `tinta` por `punto`.
- B: sin la barra fija «Nuevo evento». El «+» central de la barra de pestanas, dentro de `/bitacora*`,
  abre «Nuevo evento» (`services/bitacora/pedirNuevoEvento.ts`: en el turno emite
  `bitacora:nuevo-evento` y conserva el turno mirado; desde el historial navega a `?nuevo=1`). En el
  resto de la app sigue «Registrar incidencia». El pase suma su «+» al centro (Turno · + · Historial).
  Rotulo «Nuevo evento» sobre el «+» las 3 primeras veces por telefono (`bitacora.rotuloMas.v1`).
  El boton del chat vuelve a `bottom-24` en todas partes (se revierte lo de la ronda 19).
- E: telefono: Historial, Compartir y QR como iconos en una capsula `glass-nav`; «Compartir» abre
  `CompartirTurnoSheet` (correo, WhatsApp →hoja existente, PDF). Se quito la fila Copiar · PDF · WhatsApp.
  PC sin cambios.
- F: barra compacta fija (IntersectionObserver sobre la cabecera) con «Turno tarde 16-09 · horario ·
  N eventos» y la capsula; en el pase baja 52 px (su cabecera).
- Verificado a 375 px (turno, historial, Inicio, pase) y PC; vitest ok, eslint 30/30, audits ok, build ok.

## 2026-09-17 · Bitacora ronda 21 · Tercera pasada: converge (1 hallazgo)

Medido: tarjeta de la bitacora en el Inicio, visor de fotos, «Resolver pendiente», «Ya no aplica»
(0 objetivos bajo 44, 0 overflow). Unico hallazgo: el fondo del visor de fotos al 92 % dejaba ver los
botones de la pagina detras de la foto → opaco (Fotos de iOS). Dos rondas seguidas casi sin hallazgos:
el pulido visual de la bitacora queda cerrado; lo que sigue es de uso en planta o de fondo.

## 2026-09-17 · Bitacora ronda 20 · Pulido iOS 27, segunda pasada (sin mockup: causas claras)

Recorrido de lo que no entro en la ronda 19: crear evento, hoja de tecnicos, observacion, entrada del
pase, editor en PC e Historial en PC. Tres hallazgos, todos con la causa a la vista:
- La cabecera del TURNO ACTUAL seguia cortando el QR: pildora «En curso» (95 px) + Historial + QR = 428
  px en 375. La pildora pasa al mismo lugar que «Hoy ›» (junto al nombre del turno); la cabecera
  queda con titulo + Historial + QR en los dos casos (Historial 182–299, QR 303–359).
- «Salir» del pase (36 px) y «Lista de tecnicos» en la hoja de tecnicos (36 px) → 44 px (Button sin `sm`).
- Sin hallazgos: editor de creacion (26 controles, 0 bajo 44), observacion, entrada del pase y PIN,
  modo bitacora del pase (0 overflow), editor en PC (dos columnas parejas), Historial en PC.

## 2026-09-17 · Bitacora ronda 19 · Pulido iOS 27 medido en produccion (375 px)

Recorrido con la sesion real (localhost:5189, turno tarde 16-09) y los medidores de DESIGN.md §11:
0 diminutos, 0 mayusculas, 0 objetivos bajo 44 en turno e Historial; 1 en el editor (16 px). El resto
era composicion. Mockup (7 puntos, todos aprobados): https://claude.ai/artifact/E9CwvzvPwZ8qsW6EKJYeWc
1. Cabecera: «Ir al turno actual» + Historial + QR median 478 px en 375 («Histo…»). Ahora es un chip
   tinted «Hoy ›» junto al nombre del turno (solo cuando no es el actual). Historial 182–299, QR 303–359.
2. El FAB del chat (bottom-24, z-45) pisaba «Nuevo evento» y la fila Copiar·PDF·WhatsApp: en
   `/bitacora` sube a `bottom-[8.75rem]` (`useLocation` en ChatBot; el chat abierto ya iba a 9rem).
3. `BarraSincronizacion`: sin nada que decir (Sincronizado, sin novedad, nadie mas) es una LINEA de
   13 px en el telefono («● Todo al dia · hace 4 s · Danilo Cortes en el celular ˅»); tocarla abre la
   tarjeta; en PC la tarjeta sigue entera (`hidden md:flex`).
4. Fila del evento: «Repuestos: Filtro FRL 3300135877 ×1» (nombre comun o del maestro, codigo,
   cantidad siempre), igual que WhatsApp/correo/Historial.
5. Editor: al editar, «Editas como Danilo Cortes · Cambiar» (o «Continuas como» en borrador) en vez de
   los chips de «Quien edita»; «Cambiar» los despliega. Al crear no cambia.
6. Repuestos: «Editar nombre comun» en su propia linea de 44 px; placeholder «Buscar por codigo o nombre».
7. Acceso QR: acciones en grilla 2×2 (Generar otro QR en plain, confirmable); cada tecnico en UNA fila
   de 52 px con «Asignar PIN» / «PIN ˅» a la derecha (despliega Reiniciar / Quitar). `botonConfirmable`
   pasa a 44 px (tambien «Quitar» en telefonos).
- Verificado en 375 px claro y oscuro y en PC; vitest 2789, eslint 30/30 (sin nuevos), audit-piel ok.
- ⚠ Medidor: `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Nuevo evento')`
  agarra primero el boton de PC (display:none, rect 0): filtrar por altura > 0 antes de comparar.

## 2026-09-17 · Bitacora ronda 18b · Repuestos en lista al enviar + «Repuestos usados» en el Historial

Mockup aprobado (las dos recomendadas): https://claude.ai/artifact/NgKHSJLgSFcyEgSv61Wd5F
- **Al enviar (WhatsApp, correo, texto plano, PDF, lamina):** `lineasRepuestos()` = rotulo «Repuestos
  usados:» + un renglon por repuesto «• 3300135877 · Filtro FRL (Filtro 1/2 purga…) ×1» (la cantidad
  va SIEMPRE; `renglonRepuesto`). Correo: `<ul>` de verdad y 18 px entre eventos (era 12). PDF: rotulo
  en negrita y viñeta DIBUJADA (`pdf.circle`: la Helvetica estandar no trae «•»). Lamina: hasta 5
  lineas. WhatsApp: `SEPARADOR_EVENTOS` («──────────») entre evento y evento; con uno solo no sale.
  `lineaRepuestos()` (una linea) sigue viva para la clave de la lamina y la fila.
- **Historial:** `ResumenPeriodo.repuestos` (`RepuestoDelPeriodo`: codigo, nombre, nombre comun,
  unidades, eventos, equipos con numero, ultimo turno; solo eventos `listo`) y `unidadesRepuestos`.
  Pantalla: bloque «Repuestos usados» entre «Equipos que mas pararon» y «Quien registro» (8 a la vista,
  «Ver todos (N)»), y DOS KPIs mas (repuestos usados · unidades): la grilla pasa a 2×4 / 4×2. Correo
  (8 KPIs + lista), texto plano («REPUESTOS USADOS») y PDF (8 KPIs + lista) con los mismos numeros.
- Vitrina: los eventos con parada del historial de ejemplo llevan repuestos reales del maestro.
- Verificado: 120 pruebas en services/bitacora (2 nuevas, 1 ajustada), vitest 2789, eslint 30/30,
  audits ok, build ok; vitrina en PC y 375 px (claro y oscuro). Fuera de alcance, visto de paso: en la
  vitrina a 375 px la cabecera «En curso / Historial» de `BitacoraTurnoVista` desborda a 432 px
  (scroll horizontal); no lo toque.

## 2026-09-17 · Bitacora ronda 18a · Corregir quien registro un evento publicado

Orel: «no deja modificar el tecnico que edito ni el que participo». Diagnostico en la vitrina:
los participantes SI se guardaban (fila «Mauricio, Danilo» → «Mauricio, Danilo, Leandro»); lo
bloqueado era **quien lo registro** en un evento publicado: el editor lo mostraba como texto fijo
(«Registro: X») y la regla del 16-09 solo dejaba cambiarlo en borrador.
- Editor: en un evento publicado aparece «Quien lo registro» (`SelectorTecnico` con `recordar={false}`
  y `vacio="Elige al tecnico"`: elegir a otro NO pisa «mi nombre» en el telefono). `DatosEvento.registradoPor`
  viaja solo si cambio (clave condicional: un `undefined` pisaba el autor en la vitrina). Quien corrige
  queda en `actualizadoPorNombre`. El pase QR tambien lo ve («Edita: Leandro Igor» + selector). Un
  borrador ajeno sigue con «Lo empezo: X» (ahi el autor se ajusta con «Quien continua»).
- Regla: cae «solo se ajusta mientras es borrador». El pase puede corregir `registradoPor` SOLO si
  `actualizadoPorNombre == token.nombre` (deja su firma). 106/106 en local (2 casos nuevos, 1 invertido).
- Sin mockup: es el mismo selector que ya existia. Verificado en la vitrina (PC y 375 px) y en el modo
  pase. Pendiente de esta ronda (mockup https://claude.ai/artifact/NgKHSJLgSFcyEgSv61Wd5F): historial
  de repuestos usados y repuestos en lista + separador entre eventos en WhatsApp/correo/PDF.

## 2026-09-17 · Bitacora ronda 17 · Editor ancho en PC, buscador de repuestos con dos alcances, nombre comun y orden de los sin hora

Pedidos de Orel tras probar los repuestos en la E-PACK. Mockup (3 decisiones, todas las recomendadas):
https://claude.ai/artifact/MtKR1Po46t5N3jdePikyrN
- **Editor en PC:** `Sheet size="wide"` (60rem) y el formulario en dos columnas desde `md` (que paso /
  repuestos, impacto, fotos, pendiente). En el telefono, una columna como antes.
- **Buscador de repuestos:** un campo + `SegmentedControl` «En este equipo · Todos» (solo con equipo
  elegido; sin equipo busca en todos). Busca por codigo, nombre SAP y **nombre comun**; un codigo
  completo aparece aunque no sea del equipo (se ofrece «no esta vinculado a este equipo»). «Todos»
  usa el **indice liviano `repuestosIndice/sap`** (`m: {sap: [nombre, comun]}`, 3.790 entradas,
  ~179 KB, bajado una vez por sesion) construido con `scripts/normalizacion/construir-indice-repuestos.cjs`
  y mantenido por la funcion `onRepuestoEscritoIndice` (trigger sobre `repuestos/{id}`, escribe solo
  la entrada que cambio y sale temprano si no cambio nombre/comun/SAP; logica pura en
  `functions/repuestosIndice.js`, 3 tests). Cada resultado y cada elegido muestra ubicacion y stock
  de `bodega/{sap}` (una lectura por codigo, maximo 10). Por que el codigo «no salia arriba»: el
  campo viejo solo actuaba con Enter/Agregar; ahora los resultados salen mientras se escribe.
- **Nombre comun:** se ve en resultados y elegidos (comun en negrita, SAP debajo) y se edita en
  linea; se guarda en `repuestos/{sap}.nombresComunes` (al frente, sin duplicar: `conNombreComunAlFrente`),
  el mismo campo de Repuestos. El evento copia `nombreComun`; correo/WhatsApp/lamina dicen
  «3300135877 Filtro FRL (Filtro 1/2 purga…)». El pase QR lo ve pero no lo edita (regla).
- **Eventos sin hora:** `posicionMin` (minutos desde el inicio del turno, fraccionario; solo sin
  hora, regla lo exige). Flechas ▲▼ en la fila (`posicionAlMover`: pasa al otro lado del vecino,
  entre el y el siguiente) y en el editor chips «Ubicacion en el turno» (`opcionesUbicacion`: al
  inicio / despues de cada evento con hora / al final). `mover()` en el hook escribe solo ese campo.
- Reglas: `posicionMin` (-1440..2880, solo con hora vacia), `repuestosIndice` lectura (app y pase),
  `bodega` lectura tambien para el pase. 104/104 (`probar-reglas-bitacora.cjs --local`, 8 nuevos).
- 119 pruebas en services/bitacora (6 nuevas). Verificado en la vitrina: PC dos columnas (840 px en
  el panel), buscar «filtro» en Todos → agregar → «＋ nombre comun» → «Filtro FRL» propagado a los
  resultados; celular una columna; flechas mueven el evento sin hora hasta el inicio y el chip «Al
  inicio» queda marcado.

## 2026-09-17 · Bitacora ronda 16 · Fishken/E-PACK y vinculos desde STOCK ALMACENES (datos)

Orel intento anotar el FRL de la E-PACK y la bitacora dijo «no tiene repuestos con codigo SAP».
- **Causa:** la hoja «Fishken» del Excel maestro se migro al nodo hijo CINTA FISHKEN (s/c), no a
  EMPACADORA E-PACK (720004590, alias FISHKEN). Bitacora, CTD y Repuestos buscan por el equipo
  exacto. Ademas el maestro Excel esta desactualizado: 8 de 11 «sin SAP» si tienen codigo en
  `STOCK ALMACENES.xlsx` (hoja Clasificacion, sub-familia FISHKEN), y FK-005 apunta a un SAP que
  es otra pieza (3100061329 tarjeta; el cable AXT100-DS25 es 3300061329).
- **Datos corregidos por script** (respaldo de los 127 docs en
  `OneDrive\ANTARFOOD\_BACKUP_MEMORIA_CLAUDE\2026-09-17\repuestos-fishken-clasif-backup.json`,
  escritura de a uno): 20 repuestos → E-PACK (el motor de la cinta se queda en CINTA FISHKEN);
  5 fichas sin SAP fusionadas en su ficha con SAP (`fusionadoDe`) y borradas; 107 materiales de
  Clasificacion vinculados con el patron ya usado por su maquina (Baader 142 → 6 evisceradoras 58,
  Marelec → Static Grader 28, Garibaldi → 3 enzunchadoras 19, Baader 200 2). Decision de Orel:
  MULTIVAC (50) y WITT (23) NO se vinculan. Resultado: E-PACK 17 (13 con SAP); sin equipo
  3.022 → 2.910. `areaIds` se recalculo ([nodeId, ...path]): no lo mantiene ninguna funcion.
- Codigo: la lista de repuestos por equipo de la bitacora vence a los 5 min (antes vivia toda la
  sesion y un vinculo nuevo desde el CTD no aparecia).

## 2026-09-16 · Bitacora ronda 15 · Repuestos usados y número del equipo

Pedido de Orel tras probar el QR con un técnico: incluir (opcional) los códigos SAP de repuestos
usados en el evento y mostrar el número del equipo elegido. Mockup:
https://claude.ai/artifact/UEk6L3pijTCp8dodhcxjfe — eligió código SAP + búsqueda por nombre dentro de
los repuestos del equipo, con cantidad (1 por defecto).

- **Número del equipo:** `equipoCodigo` se copia del `codigo` del nodo al elegirlo en el buscador
  (equipo → 720004447; área → ubicación técnica AQ-IN-CHO-EXTE-CASI). Va con el equipo en la fusión
  y en la escritura (`CAMPOS_DOC`); un evento anterior lo completa al abrirse. Se ve en el editor
  («Planta · Área · N° de equipo»), la fila, el correo/PDF/WhatsApp («EQUIPO (720004447)») y la
  lámina («N° 720004447»).
- **Repuestos usados:** `repuestos: [{codigoSAP, nombre, cantidad}]` (≤ 20, nombre copiado del
  maestro). Por código: `getDoc(repuestos/{código})` (el id ES el SAP; si no, query por
  `codigoSAP`) — un código que no está queda solo con el código. Por nombre: solo con equipo
  elegido, `leer … where equipos array-contains` UNA vez por sesión (BAADER 142 N2: 1.803 docs,
  ~2 MB, 476 con SAP). NO se carga el maestro entero (7.673 lecturas por apertura: techo de costos).
  Nombres con `formatNombreSAP`. En el formulario se comparan como JSON normalizado.
- Reglas: `equipoCodigo` ≤ 40, `repuestos` lista ≤ 20; el pase de bitácora ahora LEE `repuestos`.
  96/96 (`probar-reglas-bitacora.cjs --local`, 6 nuevos + el caso del pase cambiado a ALLOW).
- 113 pruebas en services/bitacora (13 nuevas). Verificado en la vitrina a 375 px tecleando: código
  del maestro, código desconocido, búsqueda «pern» → 2 pernos reales, guardar → fila y correo.

## 2026-09-16 · Bitacora ronda 14 · Pase de bitácora (QR + PIN personal)

Pedido de Orel: un QR para que los técnicos entren fácil a la bitácora y agreguen/editen eventos, con
acceso SOLO a la bitácora. Mockup y decisiones: https://claude.ai/artifact/4e6aS7naozKBQLzmdqB7of
(v2). Decidió: pase de bitácora + nombre de la lista de habilitados + PIN personal de 4 dígitos
(lo asigna un supervisor; 5 fallos → 15 min); QR por 30 días, «Renovar» mantiene el mismo QR; los
teléfonos que ya entraron siguen hasta «Quitar» o hasta que se le quite/reinicie el PIN al técnico.

- **Función `paseBitacora`** (callable, `functions/paseBitacora.js`, sin triggers ni crons, costo fijo
  cero; maxInstances 3). Públicas: `info` (técnicos con PIN) y `entrar` (valida token + PIN en
  transacción, crea una cuenta `pase_…` por teléfono con claims `{pase_bitacora, plantId, nombre}`
  vía `setCustomUserClaims` + custom token, y `bitacoraDispositivos/{uid}`). Supervisor: `generar`,
  `renovar`, `asignarPin` (devuelve el PIN una vez; guarda scrypt + sal), `quitarPin`,
  `quitarDispositivo` (desactiva + `updateUser disabled` + `revokeRefreshTokens`). El teléfono:
  `salir`. 15 fallos sin acierto bloquean hasta reiniciar el PIN (10.000 PIN posibles).
- **Reglas — el límite está en un punto central:** `isAuthenticated()` es falso para un token con
  `pase_bitacora`, así que el pase queda fuera de TODA la app (incl. las ~80 lecturas
  `isNotAnonymous()` y el create de `users`). Solo entra por `paseBitacoraActivo()` (get de su
  dispositivo) a bitacoraEventos/Presencia/Turnos, lee bitacoraConfig, hierarchy y calendario, y
  firma con SU nombre (`registradoPor`/presencia == claim). `bitacoraPines` no la lee nadie.
  Storage: `sesionApp()` reemplaza los 38 `request.auth != null`; el pase solo en `bitacora/`
  (el cross-service sigue roto en prod: allí basta el claim; al quitarlo, <1 h).
  90/90 Firestore (`probar-reglas-bitacora.cjs --local`, 33 nuevos; el helper `auth()` ahora acepta
  claims) y 14/14 Storage (`scripts/probar-reglas-storage-pase.cjs`, nuevo).
- **App:** `App.tsx` reconoce el claim ANTES de buscar `users/{uid}` (si no, cerraba la sesión) y
  monta otro árbol de rutas: `PaseBitacoraLayout` (sin MainLayout ni sus listeners de incidencias y
  equipos) con Turno/Historial y «Salir»; todo lo demás redirige a /bitacora. El watchdog de 24 h no
  corre para el pase. `/pase-bitacora#p=…&t=…` (el token va en el `#`; el 404.html lo conserva) =
  nombre → PIN (campo `readOnly` al enviar: `disabled` le quitaba el foco y cerraba el teclado).
  En la bitácora el pase firma fijo (sin selector), no edita la lista de técnicos, y si un
  supervisor lo quita el teléfono cierra sesión con aviso (escucha su propio dispositivo).
  Supervisores: botón «Acceso QR» → hoja con QR (imprimir por iframe, renovar, copiar, generar otro
  con doble toque), técnicos con PIN/bloqueos (asignar, reiniciar, quitar) y teléfonos (quitar).
- Vitrina `/dev/pase-bitacora` (API de mentira, PIN 4729) y `?vista=modo`. 9 pruebas de la función,
  5 del cliente. Verificado a 375 px y PC: PIN malo/correcto tecleando, asignar y reiniciar PIN con
  confirmación, modo bitácora sin «Acceso QR».
- **Sin probar todavía:** el flujo real (necesita la función desplegada y que Orel genere el QR y
  asigne PIN a los técnicos).

## 2026-09-16 · Bitacora ronda 13 · WhatsApp + evento con título, sin hora y tipos propios

Pedido de Orel: copiar la bitácora «como un correo, con fotos» para mandarla por WhatsApp Web, y en el
evento: poder no poner la hora, un título aparte del equipo y la descripción, y más tipos (correctivo,
planificado…) además de uno escrito a mano. Mockup aprobado con las 4 recomendaciones:
https://claude.ai/artifact/BiADNnwFmfGvfe1R2PChEJ

- **WhatsApp = mensaje + una LÁMINA por evento con fotos.** WhatsApp no intercala texto y fotos en un
  mensaje y WhatsApp Web recibe UNA imagen por Ctrl+V: pegar el HTML del correo pierde las fotos. La
  lámina (canvas 1080 px, `laminaWhatsapp.ts`) junta fotos completas (sin recortar), hora, equipo,
  título, impacto, descripción (10 líneas máx.) y técnicos; más de 4 fotos → dos láminas.
  - PC: botón «Copiar para WhatsApp» (copia el mensaje) + columna derecha con segmentado
    Correo/WhatsApp: pasos «Copiar mensaje» / «Copiar lámina N» (PNG al portapapeles, Chrome solo
    acepta `image/png`) y vista previa del chat. Las láminas se generan al abrir la vista, para que
    el copiado ocurra dentro del toque.
  - Celular: botón «WhatsApp» → hoja con «Compartir» (Web Share con las láminas + el mensaje; el
    mensaje queda además en el portapapeles por si WhatsApp no lo toma). Sin soporte de compartir
    archivos → los mismos pasos del PC.
  - Mensaje con formato de WhatsApp (`*negrita*`, `_cursiva_`), cada evento dice en qué lámina están
    sus fotos; un `*`/`_` del texto se cambia por un carácter igual para no romper el formato.
- **Evento:** `titulo` opcional (el título manda en la fila; el equipo baja a la línea de abajo),
  interruptor «Sin hora» (`horaInicio: ''`, sin término; se ubica por `createdAt`, leído con
  `serverTimestamps: 'estimate'`), tipos Falla · Correctivo · Preventivo · Planificado · Inspección ·
  Ajuste · Novedad · Otro… (`tipo: 'otro'` + `tipoOtro`, sugeridos los ya publicados; al publicar,
  un «Otro» que coincide con un tipo fijo queda como ese tipo). Presentación común en
  `presentacionEvento.ts` (fila, correo, PDF, WhatsApp dicen lo mismo).
- Reglas: 8 tipos, `tipoOtro` ≤ 40, `titulo` ≤ 120, `horaInicio` '' permitido solo sin término.
  57/57 con `probar-reglas-bitacora.cjs --local` (11 nuevos).
- Revisión propia: agrupar las dos horas en una escritura pisaba un inicio cambiado por otro equipo →
  cada hora se escribe por separado; una lámina cancelada a medio dibujar dejaba una URL sin liberar;
  el tipo a medio escribir de un borrador aparecía como sugerencia → sugerencias solo de publicados.
- 100 pruebas en services/bitacora (21 nuevas). Verificado en la vitrina (datos de ejemplo): PC
  claro/oscuro, 375 px, tecleando en «Otro…» y título con autoguardado (el foco no se pierde),
  «Sin hora», publicar, copiar mensaje y lámina, compartir (con `navigator.share` simulado).
- **Sin probar todavía:** pegar en WhatsApp Web real y compartir desde un Android real.

## 2026-09-16 · Bitacora ronda 12 · Borradores que quedaron del turno anterior

Pendiente anotado en la ronda 11: un borrador que nadie publicó antes del cambio de turno no contaba
en nada y nadie lo veía después.

- `borradoresAnteriores` (puro, 1 prueba) + `useBorradoresAnteriores` (igualdad `plantId` +
  `estado`, sin índice compuesto). En el turno EN CURSO aparece «Quedaron sin publicar · N» debajo de
  «Vienen de turnos anteriores», con origen («Turno noche 16-09 · 00:00 · Leandro Igor»), aviso de que
  no cuenta ni salió en el correo, «Continuar» (abre el borrador en SU turno, donde se publica) y
  «Descartar» con doble toque (solo autor o supervisor).
- Al continuar un borrador de otro turno, la lista de ese turno tarda en cargar: la hoja mostraba
  un instante «Este evento ya no está en la bitácora». Ahora «visto» se marca recién cuando el
  documento llega, y «Listo» solo crea si el documento lo creó esta misma hoja.
- Producción sigue en 0 eventos/0 presencia (la pestaña de Orel estaba oculta: no late, por diseño).
- 79 pruebas en services/bitacora. Verificado en la vitrina: sección, «Continuar» → `?turno=` del
  borrador + «Continuar borrador» sin aviso falso.

## 2026-09-16 · Bitacora ronda 11 · Bitacora cooperativa (borrador autoguardado + presencia)

Pedido de Orel: iniciar la bitacora en celular o PC, que se guarde sola, que se sincronice entre
equipos, que indique que esta sincronizada, y que varios la llenen a la vez. Mockup aprobado:
https://claude.ai/artifact/19kjxjdMAPVPjUknLtZQW2 . Decisiones de Orel: el borrador lo ve TODO el
turno; eliminar = quien lo creo + supervisores (como antes).

- **Borrador que se guarda solo** (`estado: 'borrador' | 'listo'`, sin campo = listo). La hoja
  guarda tras 1,5 s sin teclear (`AUTOGUARDADO_MS`); abrir y cerrar sin escribir no crea nada
  (`tieneContenido`). «Cerrar» GUARDA; «Listo» publica; «Descartar borrador» borra doc + fotos.
  Irse de la pantalla tambien guarda (cleanup de desmontaje). Un borrador NO cuenta en ningun
  numero, correo, PDF, historial ni entrega de turno (`soloListos` en cada consumidor) y un
  borrador que venia de «Resolver» cierra el pendiente recien al publicarse.
- **Fusion campo por campo en vivo** (`fusionarFormulario`, 7 pruebas): lo que cambia otro equipo
  mientras la hoja esta abierta se adopta si yo no toque ese campo; si los dos cambiamos distinto,
  queda lo mio y se AVISA con «Usar la suya / Mantener la mia». Asi «empezar en el celular y seguir
  en el PC» funciona aunque la hoja siga abierta en el celular. Fotos que agrega o quita el otro se
  incorporan. Avisos si el evento lo borraron o lo publicaron en otro equipo.
- **Presencia** (`bitacoraPresencia/{plantId}_{turnoId}_{dispositivoId}`, latido por minuto solo
  con la pestana a la vista): quien tiene la bitacora abierta y que evento escribe. La vigencia se
  mide con la hora del SERVIDOR (desfase estimado con el latido propio): los relojes de los
  telefonos de planta no son confiables. Menos de 1.500 escrituras por turno con tres equipos.
- **Barra de sincronizacion** (`BarraSincronizacion`): Sincronizado / Guardando / Sin senal (con
  cuantos cambios quedaron en el telefono) + «Leandro agrego un evento» cuando llega algo de otro
  equipo + avatares de conectados (lista abierta en PC, desplegable en celular).
- Filas: «En redaccion», «X lo esta escribiendo», «Continuar en este equipo» (PC), y «X lo tiene
  abierto» en eventos publicados. Tarjeta del Inicio: «1 en redaccion».
- Reglas: borrador puede ir sin descripcion; publicado la exige; `estado` y `dispositivo` con
  valores cerrados; presencia con `hasOnly`, id que calza, `vistoEn == request.time` y
  `uid == auth.uid`. **41/41 casos** con `probar-reglas-bitacora.cjs --local` (14 nuevos).
- 74 pruebas en services/bitacora (18 nuevas). Verificado en el navegador TECLEANDO: el foco no se
  pierde, «Guardando borrador…» → «Borrador guardado · 14:20 · el turno lo ve», cerrar deja el
  borrador en la lista, continuar el de otro muestra el aviso de presencia, «Listo» lo publica y
  el resumen pasa de 4 a 5 eventos.

### Ronda 11b · revisión adversaria de la cooperativa (antes del merge)

Revisión adversaria: 5 ALTA de pérdida de datos. Arreglados todos antes de mergear.

- **Se escribe SOLO lo que cambió** (`camposACambiar`, 4 pruebas). Cada autoguardado mandaba el
  documento entero: uno atrasado en la cola de un teléfono sin señal devolvía a su valor viejo lo que
  otro equipo cambió, y la fusión del otro lado lo adoptaba sin avisar.
- **Un evento publicado no vuelve a borrador**: el autoguardado nunca manda `estado` y la regla lo
  prohíbe (un autoguardado atrasado lo sacaba de números, correo y entrega de turno sin que nadie lo notara).
- **Abrir, mirar y cerrar no escribe** (antes dejaba en cola una copia vieja del evento).
- **Un borrador no se recorta** (el espacio que se estaba tecleando desaparecía bajo el cursor).
- **«Cerrar» avisa también por las fotos que fallaron por falta de señal** (se perdían sin aviso).
- Autoguardado decidido al ABRIR: si otro publica, lo tecleado sigue guardándose (antes el mismo
  botón pasaba a «Cancelar» y lo descartaba). Creación fallida → se vuelve a crear, no se actualiza
  un documento inexistente; «Listo» crea si nunca se vio el documento. Sin hora de inicio no se
  intenta guardar y se avisa.
- Participantes entran en la fusión. Descartar un borrador de «Resolver» no reabre el pendiente.
  «Volver a crearlo» sin las fotos borradas. Eliminar se muestra solo a quien puede (autor/supervisor).
- Regla: `registradoPor` solo cambia mientras es borrador. 46/46 casos contra la API (5 nuevos).
- Presencia: desfase solo con el latido PROPIO recién confirmado (uno viejo en caché daba horas de
  desfase y todos figuraban conectados); un id por PESTAÑA; sin actividad en 15 min deja de latir.
- **Nombre en «conectados»** (pregunta de Orel: «¿por qué dice Matias Serpa en PC?»): salía del último
  técnico elegido en ese navegador. Ahora: cuenta personal → su nombre; cuenta compartida → «PC de
  Mantención» en el PC y el técnico elegido en el celular (`nombreEnPresencia`).
- **Técnicos del turno parten VACÍOS** (pedido de Orel: el calendario a veces no refleja el turno
  real): cada uno se agrega a mano; el calendario queda como «El calendario sugiere: …» y como
  etiqueta dentro de la hoja, sin marcar a nadie (`sugeridosPorCalendario`).
- 78 pruebas en services/bitacora. Verificado tecleando: el espacio final sobrevive al autoguardado,
  sin conflicto falso.
- Pendiente anotado: un borrador abandonado al cambiar de turno no se avisa en el turno siguiente.

## 2026-09-15 · Bitacora ronda 10 · Fotos: nada se pierde y nada queda huerfano

Revision adversaria del camino de FOTOS y del copiado al correo (7 hallazgos, 3 ALTA).

- **Cola de borrados pendientes** (`services/bitacora/borradosPendientes.ts`, en localStorage).
  Todo borrado de limpieza era `catch(() => undefined)`: con la senal de planta cayendose, cada
  falla dejaba en Storage una foto que NINGUN documento menciona — imposible de encontrar despues
  y pagandose para siempre. Ahora `borrarFotoOEncolar` anota lo que falla y `purgarFotosPendientes`
  vacia la cola al abrir la bitacora y cada vez que vuelve la senal.
- **Limpieza al desmontar**: irse de la pantalla sin tocar Cancelar ni Guardar (lo llaman por radio
  y toca otra pestana) dejaba huerfanas las fotos ya subidas. El cleanup lee `subidasNuevas.current`
  al desmontar; si el evento se guardo, `guardar` ya lo vacio y no borra nada.
- **Subida de a DOS** (`LOTE_SUBIDA`): `createImageBitmap` decodifica la foto ORIGINAL (12 MP ~ 36 MB
  de pixeles) antes de achicarla; ocho a la vez recargaban la pestana en un celular de gama media y
  se perdia el formulario entero.
- **Boton «Quitar» en una subida en curso o fallida**: antes, un HEIC que nunca iba a subir obligaba
  a cancelar el evento entero. Las descartadas se anotan (`descartadas`) y si llegan a terminar se
  borran solas de Storage.
- El correo ya no inventa un 4:3 cuando faltan las dimensiones (una foto vertical salia estirada).
- 55 pruebas en services/bitacora (3 nuevas de la cola, con almacen falso).

**Anotado, no arreglable:** la URL de descarga de Storage lleva un token que ignora las reglas, asi
que cualquiera que reciba o reenvie el correo ve esas fotos sin autenticarse. Es inherente a mandar
fotos por correo; las reglas de Storage NO son la proteccion de esas URLs.

## 2026-09-15 · Bitacora ronda 9 · Historial: la tesis no puede insinuar paradas que no hubo

Revision adversaria del modulo Historial (10 hallazgos, 3 ALTA). Arreglados los 10.

- **La tesis mentia por implicatura.** Decia "De N intervenciones, M se hicieron sin detener la
  linea" con N = TODOS los eventos, incluidos los `no-aplica` (rondas, novedades), asi que un
  periodo con 2 rondas y 1 ajuste en colacion sugeria 2 paradas inexistentes. Ahora el denominador
  son las intervenciones SOBRE LA LINEA (`conImpacto` = con-parada + en-ventana) y hay frases
  propias para "ninguno con impacto en produccion" y "todas con la maquina detenida".
  `parteSinDetener` usa el mismo denominador.
- **"max 1 min" con cero paradas**: el 1 era la guarda anti-division-por-cero y se filtraba al
  rotulo. Ahora se muestra el maximo REAL o "sin paradas en el periodo".
- **Carrera al cambiar de periodo**: el `.finally` no tenia el guard `vivo`, asi que la respuesta
  del periodo viejo apagaba "cargando" y en esa ventana Copiar/PDF salian con numeros viejos.
- Consulta acotada por los dos lados (`<= hasta`, evita el evento "de manana" de un reloj
  adelantado), `orderBy fechaTurno desc` + `limit(1500)` (si se pasa el tope se pierde lo mas
  viejo, no lo de ayer) y `setError(null)` al empezar.
- **Turno EN CURSO marcado** (`FilaTurno.enCurso`): pildora en la lista y "(en curso)" en correo
  y PDF; sus numeros son parciales.
- Barras con `min-w-[5px]` + `overflow-x-auto`: con 30 dias (hasta 90 turnos) quedaban invisibles.
- El PDF recupera el codigo de color (rojo parada / verde sin detener) y la pantalla muestra los
  SEIS KPI del correo (antes 4).
- `turnosSinParada` (campo sin uso) ahora se muestra: "7 de 30 turnos cerraron sin ninguna parada".
- Un evento con `turnoId` corrupto ya no suma al total sin aparecer en ninguna fila.
- 52 pruebas en services/bitacora (2 nuevas, 2 corregidas al comportamiento correcto).

## 2026-09-15 · Bitacora ronda 8 · Robustez de la entrega de turno (revision adversaria)

Una revision adversaria del codigo de entrega de turno encontro 10 bugs; se arreglaron los 10.

- **El lote ya no puede perder el evento.** `update()` lleva precondicion de existencia: si el
  pendiente original ya no estaba, el lote fallaba ENTERO y el evento recien escrito (con sus
  fotos) se perdia con un aviso que hablaba de senal. Ahora el evento se escribe primero y el
  cierre del pendiente va aparte (`cerrarPendienteResuelto`), con aviso propio.
- **Borrar ya no deja el evento atrapado**: el borrado tambien se separo del reabrir. Antes, si el
  pendiente original no existia, el evento quedaba IMPOSIBLE de borrar y el aviso culpaba a los
  permisos.
- **No se reabre un pendiente que otro evento ya resolvio** (`reabrirPendiente` compara
  `cierre.eventoId`), y **"Ya no aplica" no pisa un cierre "resuelto"**.
- **Reabrir un pendiente cerrado borra el cierre** (`cierreAntes`): antes la fila decia
  "Pendiente" y "Resuelto en..." a la vez y la entrega de turno no lo volvia a mostrar nunca.
- **El tope de 8 fotos se calcula contra el estado vivo del servidor**, no contra lo que vio este
  telefono: dos que agregaban a la vez dejaban el evento en 10 fotos y la regla congelaba toda
  edicion posterior.
- **La bitacora archivada ya no cambia sola**: `pendientesDelTurno` cuenta tambien los pendientes
  que un turno POSTERIOR cerro, asi que reexportar un turno viejo sigue coincidiendo con el correo
  que se envio; el KPI dice "3 pendientes (2 ya cerrados)" y el evento muestra "Resuelto en Turno
  noche 16-09 por ...". Los "pendientes anteriores" solo salen en el turno EN CURSO.
- **Pantalla, correo y PDF dicen lo mismo**: la pantalla suma "(2, 1 sin duracion)" y el PDF suma
  el KPI de pendientes cerrados; `pendientesCerrados` cuenta pendientes distintos, no eventos.
- **Corte del orden a 16 h** del inicio del turno (antes 20 h): el minuto en que el orden salta
  queda a 8 h de cualquier hora real.
- **Mensaje honesto en la validacion de 12 h** (antes afirmaba que el termino iba antes del inicio)
  y **"guardar sin las fotos que faltan" se vuelve a pedir por cada foto nueva**.
- Ademas: la grilla del Historial tenia **scroll horizontal a 375 px** (hijo de grilla con
  `min-width:auto` estirado a 396 px) — medido y corregido con `min-w-0`.
- 4 pruebas nuevas (50 en total en bitacora).

## 2026-09-15 · Bitacora ronda 7 · Historial del periodo (7/14/30 dias)

- `services/bitacora/historialBitacora.ts` + tests (6): `filasPorTurno`, `resumirPeriodo`
  (turnos, eventos, sin detener, MTTR, pendientes cerrados/abiertos, equipos top-5,
  quien registro) y `tesisDelPeriodo` — la frase que demuestra el aporte de Mantencion.
- `historialCorreo.ts` (HTML + texto plano) y `historialPdf.ts` (jsPDF + autoTable).
- `hooks/useHistorialBitacora.ts`: un solo `getDocs` con rango sobre `fechaTurno` y filtro
  de `plantId` en memoria (evita indice compuesto).
- `pages/HistorialBitacoraPage.tsx`: chips de periodo, tesis resaltada, KPIs, grafico de
  barras CSS (rojo = con parada, verde = turno sin paradas), lista de turnos que abre la
  bitacora de ese turno por query param, equipos top y quien registro. Ruta
  `bitacora/historial` + boton "Historial" en la cabecera. Vitrina en `/dev/bitacora`.
- Barras con `bg-ink-crit`/`bg-ink-ok` (tokens): la deuda de piel BAJO 1 (baseline al dia).
- Verificado a 375 px en el preview 5189: tesis, KPIs, grafico, 30 turnos, equipos y
  "Quien registro" renderizan; sin errores nuevos en consola.

## 2026-09-15 · Bitácora de turno de Mantención (módulo nuevo, PR abierto)

Pedido de Orel: una bitácora por turno que se llena en el celular (texto + fotos antes/después),
se ve actualizada en el PC y desde el PC se copia al correo de Mantención o se exporta a PDF.
Ruta `/bitacora` + tarjeta arriba del Inicio móvil + entrada en el menú lateral.
Mockup aprobado: https://claude.ai/artifact/JYnbiYBeKLujwRgpYYCcQY (opción A, línea de tiempo).

Decisiones de Orel (15-09): turno de **Mantención por reloj** (día 08-16, tarde 16-00, noche 00-08,
no Shoplogix) · bitácora **compartida** del turno (cada evento firmado) · cada evento lleva
**minutos de parada (MTTR)** o, si se intervino sin detener, **en qué ventana** (colación HG,
colación empaque…) · Outlook "varía" → dos formas de copiar.

- Datos: colección plana `bitacoraEventos` (`plantId`, `turnoId` = `YYYY-MM-DD_banda`), fotos en
  Storage `bitacora/{turnoId}/{eventoId}/{archivo}`. Reglas nuevas en `firestore.rules` y
  `storage.rules` (se despliegan al mergear). Costo: 1 onSnapshot por turno abierto + 1 lectura del
  calendario cada 5 min; despreciable frente al techo de CLP 20.000.
- Lógica pura con 20 tests en `services/bitacora/` (turno, resumen/MTTR, técnicos del calendario
  real, HTML del correo). Los técnicos de turno salen de `calendario_mantencion_state/current`.
- Correo: HTML con estilos en línea + `<table>` + `<img width height>` (lo único que respeta
  Outlook clásico al pegar). «Copiar con fotos incrustadas» (base64) para Outlook nuevo/web.
- Vitrina `/dev/bitacora` (solo DEV) con datos de ejemplo: verificado ahí a 375 px y en PC, ambos
  temas, crear/editar/guardar, copiar (portapapeles con HTML + texto) y PDF (2 págs, fotos).

⚠ Gotchas encontrados (cada uno costó una vuelta):
- **CORS del bucket autoriza SOLO `https://orelcain.github.io`**, no localhost: en local el PDF y la
  copia incrustada no pueden leer fotos reales de Storage (en prod sí). Medido con curl + Origin.
- **La CSP (`connect-src`) no admite `data:`** → `fetch(dataUrl)` falla. Fotos a canvas con `<img>`
  y dataURL→Blob a mano.
- **`processImageForUpload` devuelve un WebP chico TAL CUAL aunque se pida `preferWebP:false`**
  (idempotencia). Outlook clásico y jsPDF no aceptan WebP → se re-codifica en `fotosBitacora.ts`.
- **Flex vertical con alto acotado + hijo `overflow-x-auto` = hijo de 0 px** (la fila de tipos
  desaparecía en el Sheet). Fix: `[&>*]:shrink-0`.
- jsPDF: «NH₃» salía «NH» (el saneo cp1252 descarta subíndices) → `normalize('NFKC')` antes.
- Con el editor abierto el turno se CONGELA: si el reloj cruza las 16:00 a mitad de escribir, el
  formulario se reseteaba y el evento caía en el turno siguiente.

Pendiente: prueba real de Orel en el celular (fotos de cámara) y pegado en SU Outlook; ver si
«Copiar para correo» basta o hace falta la variante incrustada.

### 2026-09-15 · Bitácora · ronda de pulido 1 (mismo PR #1021)

- **Guardar sin señal**: `await setDoc` se resuelve recién con el ACK del servidor → sin señal
  «Guardar» giraba para siempre. Ahora no se espera (la app ya usa `persistentLocalCache`: la
  escritura queda en el teléfono y el onSnapshot la muestra con «Guardando…»); si el servidor la
  rechaza, toast. Igual para borrar y para la observación.
- **Fotos sin señal**: aviso inmediato («se sube sola cuando vuelva la conexión») en vez de la
  ruedita de 10 min de Storage; reintento automático con el evento `online`; guardar con fotos sin
  subir pide un segundo toque (nunca se pierde una foto en silencio).
- **Observación general del turno** (estaba en el mockup aprobado y faltaba): doc
  `bitacoraTurnos/{plantId}_{turnoId}` + regla; sale en correo, texto plano y PDF.
- **Copiar asunto** en la vista previa del PC (el portapapeles lleva solo el cuerpo).
- **Fotos en grande**: tocar una miniatura abre un visor a pantalla completa (flechas/teclado/Esc).
- **«Nuevo evento» fijo** sobre la barra de pestañas en el celular.
- **Vista previa del correo escalada**: se dibuja a su ancho real (720 px) y se aplica `zoom` para
  caber en la columna; antes la 2ª foto quedaba cortada (la columna mide distinto con/sin menú).
- Verificado en `/dev/bitacora` (5189): observación, visor, dock 52 px, flujo offline completo
  simulando `navigator.onLine`, correo sin scroll horizontal. 21 tests, lint 28/30, audit-piel OK.

### 2026-09-15 · Bitácora · PR #1021 en producción + «Quién registra»

- **#1021 mergeado** (`9b10975`) y verificado en prod: `version.json` con el sha, chunks
  `BitacoraTurnoPage` / `BitacoraTurnoCard` / `useBitacoraTurno` publicados, reglas de Firestore y
  Storage publicadas 21:29 UTC con los `match` nuevos (API firebaserules, no el estado del workflow).
- **`scripts/probar-reglas-bitacora.cjs`**: prueba el ruleset PUBLICADO con `projects:test`
  (16 casos ALLOW/DENY con usuarios simulados, no escribe datos). 16/16.
- **Decisión de Orel**: no hay cuentas por técnico; usan la **cuenta compartida de Mantención**
  (`mantencion.plantach…`, activa) y **cada uno elige su nombre de la planilla del calendario**.
  → selector «Quién registra» (técnicos de turno primero + «Otro técnico» con la planilla completa),
  recordado por teléfono en localStorage. Se guarda `registradoPor` al crear y
  `actualizadoPorNombre` al editar (registradoPor no se pisa). Lista, correo y PDF muestran el
  técnico elegido (`autorVisible`), nunca el nombre de la cuenta. También en la observación.
- Sin cambios de reglas (campo extra permitido). 23 tests.

### 2026-09-15 · Bitácora · técnicos del turno, participantes, lista maestra y buscador de equipos

Pedido de Orel (las tres opciones + buscador), mockup aprobado «tal cual»:
https://claude.ai/artifact/Ubsj3WqTs5EZ8agfUkf7bc

- **Técnicos del turno**: fila en la página + hoja con buscador para marcar quién está de verdad.
  Se guarda por turno en `bitacoraTurnos.presentes` (merge con la observación); sin ajuste manda el
  calendario. Da los botones rápidos del editor y el «Técnicos de turno» del correo.
- **Varios técnicos por evento**: «También participaron» (toggles + «Otro») → `participantes[]`.
  Correo/PDF: línea «Técnicos: …» solo si hubo participantes.
- **Lista maestra**: `bitacoraConfig/{plantId}` = ajustes sobre la planilla del calendario
  (agregados / ocultos / renombres). Quitar a alguien del calendario lo OCULTA; el calendario no se
  toca. Presentes guardados se traducen con los renombres vigentes.
- **Buscador de equipos**: jerarquía completa (702 nodos, 1 carga cada 30 min, se filtra en el
  teléfono), sin tildes, por palabras en cualquier orden, nombre/alias/código, con PLANTA y ÁREA
  (hay equipos con el mismo nombre en Chonchi y Yal), resaltado, teclado, texto libre permitido.
  Guarda `equipoId` del nodo (para contar paradas por máquina después).
- Reglas: `bitacoraConfig` nueva, `bitacoraTurnos` con observación/presentes opcionales, eventos con
  `participantes` (≤12) y `equipoId`. `scripts/probar-reglas-bitacora.cjs --local` prueba el archivo
  ANTES de publicar: 23/23.
- ⚠ Gotcha: la hoja de presentes reiniciaba lo marcado en cada re-render (dependía de un array que
  se recrea) → cargar solo al abrir, vía ref.
- 33 tests de bitácora, verificado en `/dev/bitacora` a 375 px.

### 2026-09-15 · Bitácora · entrega de turno + 12 hallazgos de revisión adversaria

**Entrega de turno** (mockup aprobado «tal cual»: https://claude.ai/artifact/VXnx3kC7rPNVf7F8kdB9Vf):
los pendientes abiertos de turnos anteriores aparecen arriba de la bitácora del turno que llega
(turno de origen, técnico, «hace N turnos»). «Resolver» abre el editor precargado y en UN lote crea
el evento (`resuelvePendiente`) y cierra el original (`pendiente:false`, `cierre`). «Ya no aplica»
cierra con motivo sin contar como resuelto. Borrar el evento que resolvía reabre el pendiente.
Correo/PDF: KPI «pendientes cerrados», «Cierra pendiente del Turno …» y recuadro «Sigue pendiente de
turnos anteriores». Consulta por igualdad `plantId + pendiente==true` (sin índice compuesto).

**Revisión adversaria** (subagente, 12 hallazgos, todos corregidos):
1. ⚠⚠ ALTA — **el primitivo `Sheet` devolvía el foco al disparador en CADA tecla** (efecto con
   `onClose` inline en dependencias) → en el celular el teclado se cerraba letra a letra. Afecta a
   TODA la app que use `Sheet` con `onClose` inline. Fix: `onClose` en ref. Probado A/B tecleando de
   verdad: sin fix el foco termina en `DIV/dialog`, con fix queda en el campo.
2. Editar pisaba fotos agregadas desde otro teléfono → fotos como `arrayUnion/arrayRemove` en lote.
3. Topes de las reglas sin topes en el formulario → maxLength/max + validación.
4. Guardar bloqueado hasta 10 min con señal mala → se puede guardar sin las fotos que suben (2º toque).
5/3b. Fotos borradas de Storage ANTES del OK del servidor → se borran en `.then` del commit.
6. PDF cortaba líneas largas → `splitTextToSize`.
7. Término < inicio (typo) daba paradas de ~24 h → validación >12 h; orden de eventos previos al inicio.
8. Nombre recordado que ya no existe se guardaba igual → solo si sigue en la lista.
9. Foto que termina de subir tras cancelar se colaba en otro evento → «sesión» del formulario.
10. Marcas de técnicos se perdían al ir y volver de la lista → borrador controlado en la página.
11. Spinner eterno del buscador → `setCargando(false)` siempre.
12. Parada sin duración no contaba → cuenta, fuera del MTTR, «(N, M sin duración)».

Reglas 27/27 `--local`. 40 tests de bitácora. ⚠ Lección: mis pruebas llenaban campos por script y
NO podían ver el bug del foco; en formularios hay que TECLEAR (`computer type`) en la verificación.

## 2026-09-15 · Fuera `maplibre-gl`: las 2 alertas críticas de Dependabot eran una dependencia muerta (chore/quitar-maplibre)

Dependabot #241 (lock) + #242 (package.json) = **una sola** vulnerabilidad: GHSA-jrc7-96c5-q579 / CVE-2026-85061
(CVSS 10, XSS sin clic por el texto de atribución; `DOM.sanitize` se salta un atributo al borrar
el anterior). Parche solo en 6.4.1, sin backport a 5.x; la instalada era 5.23.0 con el código
vulnerable. **No era explotable**: la agregó `ffb4d364` (08-03) y `b00c69e7` (13-03) la reemplazó
por Three.js, pero quedó en el `package.json`. Medido: 0 imports en el repo (control del grep: 69
archivos con `firebase/firestore`); bundle de prod 4.2.0 recorrido entero = 261 chunks, 0 con
maplibre (control: sí alcanza el chunk lazy de Three.js).

Fix: `pnpm --filter @mantenimiento/pwa remove maplibre-gl` → solo borra (1 línea de package.json +
195 del lock, 27 paquetes transitivos: `@mapbox/*`, `@maplibre/*`, supercluster, pbf, earcut…).
Verificado local: `install --frozen-lockfile`, tsc, eslint, vitest 2633 ✓, build ✓, `dist` sin maplibre.
⚠ El sw.js de Pages es la página 404: para listar chunks de prod hay que recorrer el grafo desde
`index-*.js`. Queda sin tocar `docs/DEMO_COMPARATIVA_MAPAS_3D_CHONCHI.html` (demo que carga 5.19.0 de unpkg).

## 2026-09-15 · Los tests de `functions/__tests__` no corrían en CI (fix/tests-functions-ci)

`deploy.yml` corría `shoplogix/__tests__/*.test.js` + `__tests__/solicitudRepuesto.test.js`: el
resto de `functions/__tests__` (publicMonitor, publicMonitorStats, pulse, pulseHoraExtra,
vigiaTurno, archivarSerieMinuto, briefFinTurnoCola) **no corría nunca**. A mano: 106 tests, 2 rotos.

**Diagnóstico por bisect** (cada commit y su padre, `git archive` de `functions/`):
- «los minutos que el turno YA tiene…» (612 vs 500): se rompió en **#529** (13-08), que cambió A
  PROPÓSITO el criterio de «fuera del horario» a la HORA del tramo (hora extra visible desde el
  primer minuto). El total no cambió (5.012); el test seguía con el criterio viejo. **Test viejo.**
- «el historial reusa…» (1000 vs 888888): se rompió en **#564** (15-08), que exige
  `timeBreakdown.tbv === 2` para reusar (cache poisoning). El fixture no traía `tbv`. **Test viejo.**
Ninguno de los dos commits tocó el test. Código de prod SIN cambios.

**Lo que se sumó**: aserción de `shiftPieces` (4.400), caso «live sin tbv se recompone» (el guard de
#564 no tenía test), y mutaciones M1–M6 que caen con el síntoma exacto.

⚠ **Relojes**: barriendo las 24 h con un `Date` falso (`NODE_OPTIONS=--require fake-now.js`)
aparecieron 2 tests más que fallaban según la hora — «modo línea: elige el turno…» a las 00:xx de
Chile y «entre turnos cae al último…» a las 03:xx. Eran FIXTURES que empataban (dos turnos a las
00:00), no el código. Sumarlos así a CI tumbaba los deploys de madrugada. Ahora usan reloj fijo
(`resolveCurrentShiftDocId` lo recibe por parámetro) + caso nuevo «pasada la medianoche sigue al
turno noche de AYER». Barrido final: **192 corridas (cada 10 min + cambios de horario + fin de
mes/año), 454/454 en todas**. Receta del preload: si otro test depende del reloj, barrer así.

CI: `node --test shoplogix/__tests__/*.test.js __tests__/*.test.js` (glob: los nuevos entran solos).

---

# Historial resumido · 2026-09-01 → 2026-09-12

> Compactado el 2026-09-17 desde ~141 KB de entradas PR por PR. El detalle completo vive en git
> (`git log -p .ai/WORKLOG.md`) y en el respaldo `.ai/backups/WORKLOG-2026-09-17-pre-compactacion.md`.

## Fuga de costos GCP de agosto (PR #895–#900, 09-01 → 09-02)
- Agosto: **CLP 71.013** (5x lo normal). 64 % = 114M lecturas Firestore del monitor público: 7 `listDocuments()` de toda la colección de turnos × hasta 12 `buildMonitorLive` por patch × ~2 patches/min. Firestore reads CLP 45.247, Cloud Run CPU CLP 20.593.
- #895: `loadShiftIndex()` lee los turnos UNA vez por evento (45 días por rango de `documentId`); debounce con `parentSinCambioReal`; el pulso de 1 min sale temprano si todos los monitores tienen `live.shiftClosed`; los turnos bajo el piso de piezas no se reconstruyen. Protocolo en `docs/COSTOS_GCP.md`.
- #896: ⚠ Cloud Run cobra la CPU mientras la función duerme. El jitter de `shoplogixSyncWakeup` (0-120 s, cada 5 min, 24/7) costaba ~4,8 h CPU/día (~CLP 9.000/mes) → 0-20 s (0-10 s con re-sync). `pauseBetweenMachines` intacto.
- #898: ⚠ se factura vCPU **asignada**, no usada. Sync y `shoplogixPulseWakeup` (~95 % espera de red) → `cpu: 0.25` + `concurrency: 1` (obligatorio con cpu<1). Ahorro ~CLP 3-4.000/mes.
- #900 (auditoría de los 11 jobs): `shoplogixTokenRefresh` nunca arrancó (bundle 133 MiB > 128 MiB; parte del «ROPC en backoff») → 256 MiB. `purgeSensorReadings` moría por OOM: carga todo `sensors/` con `once('value')` y al fallar el árbol crece (espiral) → 512 MiB; deuda: recorrer por equipo.
- Pendiente: confirmar en Cloud Billing la baja de lecturas y CPU; verificar que ambas funciones dejan de dar OOM (purga a las 03:00).

## Auth: permission-denied al entrar (PR #902–#903, 09-05 → 09-06)
- `mantencion.plantach@aquachile.com` autenticaba y no podía leer `users/{uid}`. Reglas vivas = repo (`getFirestoreRuleset()` + `diff --strip-trailing-cr`) y `firebaserules :test` PERMITE.
- Causa (vía `errorLogs`): login y TV del monitor (`?pantalla=1`) del mismo PC fallaron el MISMO segundo → token compartido vencido en pestañas dormidas; el login fresco reutilizó la conexión con la credencial vieja.
- ⚠ `createTime` del servidor contra `timestamp` del cliente delata pestañas congeladas (36 s a 53 min).
- ⚠ Un token SIN claim `firebase` hace que `isNotAnonymous()` falle con error, no con false.
- #902: `getUserByIdConTokenFresco` reintenta UNA vez con `getIdToken(true)` en signIn, Google y el listener de `App.tsx`. Remedio en el PC: cerrar TODAS las pestañas (incluida la TV).
- #903: `subscribeToUserPermissions` quedaba muerto tras el primer error. Ahora, con el mismo uid, refresca y re-suscribe UNA vez; otro error, segundo rechazo o uid distinto → fallback.

## Storage: fotos y borrados mudos (PR #919, #922, #924, 09-08)
- #919: reglas vivas OK (token de admin vía `signInWithCustomToken` con header `Referer`, la API key restringe referer). Causa en el cliente: `RepuestoPhotosModal` exigía `machineId` y **3.025 de 7.673 repuestos (39 %)** tienen `equipos: []`. Sin equipo el path es `repuestos/sin-equipo/{repuestoId}/fotos/` (cumple la regla de 4 segmentos).
- ⚠ `web.app` NO es producción (build detenido el 31-08); prod = `orelcain.github.io/mantenimiento-planta/version.json`.
- ⚠ `pwa-5184` sirve el checkout que diga `dev5184.cmd` (ese día `D:\a\wt-r6`).
- #922: `deleteRepuestoFoto`/`deleteBodegaPhoto` tragaban el error → archivos huérfanos. Helper `deleteStorageObjectByUrl` propaga; solo tolera `storage/object-not-found`. Toast en modal y drawer. `incidents/{id}/{file}` ganó `allow delete` para sesión no anónima.
- Regla: **todo `try` sobre Storage lleva `catch` que avise o propague; `logger.error` solo es esconder el fallo.**
- #924: `deleteFile` y `deleteMapImage` al mismo helper (`storage.delete.test.ts` con `describe.each`). ⚠ **`deleteMapImage` nunca funcionó**: la app usa `maps/{fileName}` (2 segmentos) y la regla es `maps/{locationId}/{fileName}` (3) — mismo desajuste que #894; además sin `allow delete` y con `isAdmin()`, que en Storage deniega siempre (falta rol IAM).
- Pendiente (Orel): regla de `/maps` (quién sube y borra planos); la subida de mapas está rota por la misma causa.

## Pureza por puerta: base y rondas 1-5 (PR #905–#917, 09-07)
- #905: «Ver turno» faltaba en el turno en curso: `useGraderShiftPeriod.refresh` nadie lo llamaba y `buildPeriodShifts` descarta turnos con <50 ciclos. Fix: `refreshKey` + botones en el banner del wizard. Pendiente: probarlo con la próxima carga de un turno en curso.
- ⚠ CI cayó por `audit-piel`: correr `node scripts/audit-piel.mjs` desde la RAÍZ antes de pushear UI.
- #906: `gateMix` en `GraderDailySummary` desde `computeShiftSummary` (0 lecturas, ~2 KB, solo con gates activas → Yal no paga). `assignedCalibre = 'Other'` = cualquiera. ⚠ ISO sin `Z` lo toma `Date.parse` como hora LOCAL → `parseWallClock`.
- #907: `PurezaPorPuertaCard` (≥95 pura · 85–95 atención · <85 mezclada). Banco `/dev/pureza-puerta`. ⚠ `cn()` DESCARTA `text-caption`/`text-title3` junto a `text-ink-*` (toma el tamaño como color): van en template string.
- #909: el wizard clasificaba con SU borrador; ahora usa `getLatestSnapshot` o registra el borrador como snapshot inicial. (`getGatesAtTs` del reclasificador FASE 26 no lo llama nadie.)
- #910 gateMix v2: se guarda la OBSERVACIÓN (`computeGateObservations`) en `meta/gateMix` (~12 KB, fuera del summary que la matriz lee por mes); `deriveGateMix` juzga con `configTimelineFromSnapshots`. Topes 40 bloques / 8 combinaciones. v1 queda de fallback. ⚠ Snapshots en hora REAL UTC y piezas en hora de pared con Z → `realIsoToWallClockMs` (`America/Santiago`).
- #911: `classifyGateCauses` (calibre vecino/lejano, calidad, conservación, sin dato, otros; prioridad calibre > calidad > conservación). `GateEvolutionChart` caía 3-4 h corrido → corregido.
- #912: `classifyGate0Records` acepta `ConfigTimeline` (config de la hora de cada pieza); `recomputeShiftP0Causes` deja la vigente en `gatesUsed` para que `detectConfigDrift` no entre en loop. Límite: un snapshot insertado hacia atrás con la misma config vigente no marca desfase.
- Ronda 1 (#913): la columna Calibre/Calidad del Excel es la DECISIÓN de la máquina. El 07-09 daba **0 % en 5 de 11 puertas** por seteo desactualizado, no mezcla → `seteoDistinto` (dominante ≥ 90 %) + «Adoptar seteo de la máquina» (`adoptarSeteoMaquina`). «Other» = `calibre_no_reconocido`.
- Ronda 2 (#914): histograma de peso `weightByBucket`; `derivePesoPorPuerta` con rangos override del turno → línea → constantes. ⚠ Con bins de 250 g el «al límite» es resolución. Backfill (OK de Orel) de `meta/gateMix` en **37 turnos**, 395 KB; 21 de febrero sin `pieceRecords`. Script: esbuild (`node_modules/.pnpm/esbuild@0.25.12`) sobre el TS real, corrido como `scripts/_x.tmp.js` desde la raíz del repo principal.
- Ronda 3 (#915): `GATE_OBS_WEIGHT_BIN_G = 100`, `weightBinGrams` (ausente = 250). Re-backfill 612 KB (1,5×, no 2,5×; máx. 20,7 KB). **9 turnos de agosto (13-08 → 18-08)** tienen `gatesUsed` del borrador → no se juzgan por peso + «Adoptar en N puertas» (`onAdoptarSeteoTodas`). 23 turnos con `gatesUsed` vacío.
  - Regla: **la observación se guarda una vez; todo juicio se deriva con la config vigente.**
  - Pendiente (Orel): adoptar el seteo en esos 9 turnos de agosto.
- Ronda 4 (#916): 8-10 = 3.665–5.000 g y 10-12 = 5.000–5.900 g en `graderModuleConfigs/global.customWeightRanges`; el editor no regeneraba la etiqueta → `handleSave`. Hallazgo: los programas 8-10 y 10-12 del Z2 se solapan ~400 g (el 11-08 y 02-09 cortaba limpio en 4,58/4,59 kg) → `detectSolapesDeRango` (p2–p98, ≥30 pz, ≥200 g). `classifyRecordToMatrix` usaba constantes en cuatro lugares; ahora todos reciben `ranges`. «Fuera por peso» exige ≥30 pz.
- Ronda 5 (#917): «Todas puras» con 12 puertas sin asignación mentía → `inferirSeteoFaltante` («· inferido»). Solapes agrupados por el programa del Z2. `normalizarCalibre` en `splitCombo` normaliza etiquetas crudas («2 - 4 LB», «HG 6-8») al LEER.
- #908: chips y líneas seleccionadas en «Evolución de gates» (relleno sólido del color del gate, nombre al final de la línea, cromo por tema).

## Pureza: cargas parciales, cambios de programa, 12-UP (PR #918, #923, #925–#929, 09-08 → 09-09)
- #918, primera carga parcial real: el snapshot inicial salió del BORRADOR (8 de 12 «seteo ≠ máquina», 74 P0 falsos). `graderSeteoInicial.ts` (`pickUltimoSeteo`, `elegirSeteoInicial`): sin snapshot usa el último `gatesUsed` de la línea (21 días) salvo que el usuario tocara las gates.
- #923 ronda 7: la «mezcla» de G10 (15 %) y G4 (4 %) eran cambios de programa no registrados. `detectCambiosDePrograma` + «Registrar cambio desde las HH:MM» (`saveConfigSnapshotAt`, `wallClockMsToRealIso`).
  - ⚠ Propagar el cambio a los snapshots posteriores que no tocaron esa puerta; si cae antes de todos, dejar línea base un minuto antes (antes del primero rige `gatesUsed`, la config MÁS RECIENTE).
  - `rangesFingerprint` en el summary: si los rangos difieren, se recalcula P0 una vez. Coincidencia 84,3 % → **98,9 %**.
- #925 ronda 8 (medir los 37 turnos primero, `medir-cambios.js`): `CAMBIO_MIN_PIEZAS = 100` (los de 9–45 pz eran el barrido de fin de turno). ⚠ El parser mapeaba «12-UP» al 10-12 y «12» a `Other` → calibre canónico **`12-UP lb`** (`CALIBRE_12_UP`); «12», «12-UP», «12+», «N≥12-UP» → 12-UP; «10», «10-UP» → 10-12. ⚠ Espacio final `"12-UP lb "` → `trim()` en modal y `getModuleRanges`.
- #926: ⚠ `savePieceRecordsBatch` deduplicaba con calibre/calidad en la clave: recargar habría DUPLICADO piezas. `pieceIdentityKey` (ts · gate · piezas · peso · lote) + `planPieceRecordWrites` (agrega, actualiza en su doc, salta). Se guardan `conservation` y `product`. `listGatePieceRecords` (4–3.600 lecturas, nunca ~18.000). ⚠ Dos guardados de Orel no llegaron a Firestore.
- #927 ronda 9: la pureza era ciega a la conservación (G8 100 % con 2.032 congelado + 1.537 fresco). `deriveMezcla`: conservación contra la dominante del **bloque de 30 min** (la del turno habría dado G8 57 %). Titular 98,4 %. ⚠ cat-4 en oscuro es byte-idéntico a `--ink-warn` (reservado al peso). «Ver cada pieza» dice su costo en lecturas antes del botón. Poda de Gates 5.615 → 2.648 px. Wizard: aviso si «Guardar en Calendario» pasa de 60 s (cerrar TODAS las pestañas). Sin tocar: warning «Cannot update a component while rendering» de `AnalisisGraderGatesConfigPage`.
- #928: en turno cerrado «Adoptar» reescribe la puerta en TODOS los snapshots (`graderAdoptarSeteo.ts`; `turnoCerrado: status !== 'live'`). 98,9 → 99,9 %.
- #929 ronda 10: la dispersión decía «95 Otro» porque los gate=0 del pieza a pieza no traen causa → `loadGate0Records` (`p0Fuente = gate0Input ?? gate0Pieces`). 37 de 96 P0 de 0,34–0,90 kg sin puerta → `p0SinPuerta` + bloque «Rechazos sin puerta». «hasta las 00:00» → `hastaIso = summary.endAt`.
- Pendiente (Orel/Z2): G11 71 % más liviano que 4,99 kg (el 10-12 del Z2 arranca en ~4,5): decidir el límite en el Z2 o en la app y espejarlo en Configuración del Grader.

## Timeline de Calidad y fuentes del P0 (PR #930–#932, #938–#940, 09-09 → 09-10)
- #930: la capa por causa existía y estaba ciega: gate=0 sin causa (→ `p0Fuente`); ⚠ `classifyPiece` comparaba hora real con hora de pared y usaba `CALIBRE_WEIGHT_RANGES`; el paraguas marcaba solo el estricto (→ `onToggleFamily`). #931: se elimina `PieceScatterChart` (pedido de Orel).
- #932: ⚠ el P0 del 08-09 T1 cubría hasta 23:57 (116) y el pieza a pieza hasta 02:37 (211): el resumen decía **0,92 %** (real 1,67 %). `mergeParsedData` agrega los gate=0 fuera de la ventana del P0 con causa inferida (`inferGate0FromPieceRecords`) + `p0CoverageWarning` en el banner. Pedir a Orel exportar ambos con el mismo rango.
- #938: a 375 px «Fuera de límites» se partía en tres renglones; el lote (9 dígitos) se dibujaba vertical → «L» + 4 dígitos cada ≥25 min; rótulos de 9 px. «Total unsorted pcs (Matrix)» queda en inglés (nombre del HMI).
- #939 riel de eventos (mockup aprobado): a 375 px, 0,58 px/min; 7 de 16 turnos completos tenían choques. `agruparEventosRiel` agrupa en píxeles y fusiona el mismo minuto (63 de 122 turnos). Salen 15-17 rótulos del lienzo; el riel va en el canvas porque el PNG sale de ahí. ⚠ Los bordes de pausa sin `label` dibujaban el valor del eje.
- #940 lista por tramo de configuración: ⚠ `computeSegmentVerdicts` indexa por `snap.id`, no por `at`; ⚠ lista y tramos deben usar el mismo criterio (`!synthetic`); ⚠ un tramo de 6 pz afirmaba «▼ 31,5 pts» → `TRAMO_MIN_PIEZAS` = 30. Sin blanco táctil de 44 px en marcadores (un `rect` tapaba el eje). Sin versalitas (§10).

## Simplificación de pestañas del turno (PR #933–#937, #947–#949, 09-09 → 09-10)
- #933 Gates: la píldora muestra UN aviso por prioridad (cambio sin registrar > mezcla > atención > seteo ≠ máquina > no reconocido > peso); fuera la tira de 30 min, el editor completo y el historial (a «Más análisis»).
- #934 (Orel): Línea sin Gantts (5.103 → 4.096 px); el detalle por máquina es `MachineShiftDetail` dentro de `MantencionTurnoTab` (antes `MachineRow`).
- #935: ⚠ `derivePesoPorPuerta` sobrescribe `p.rango` por bloque: **454 piezas** bajo la banda equivocada en 4 puertas → `tramosDeCalibre`, una banda por tramo. SVG 1:1 con ResizeObserver (antes «5.5» a 32 px en PC y texto a 7 px en móvil).
- #936: la correlación Baader → P0 afirmaba dirección en 25 de 28 turnos, 14 con R² < 0,10 (máx. histórico 0,22) → `r2Max`, `explica`, `SCATTER_R2_MIN` = 0,10. «Priorizar la máquina» solo si una concentra ≥ 50 %. Mantención con una cifra por bloque (806 → 653 px).
- #937: ⚠ el scatter dibujaba buckets de <5 pz que las estadísticas descartan y estiraban el eje al 100 % (256 de 377 turnos) → solo usables + `scatterYMax` al p98 con aviso. Paleta por tema; leyenda 6 → 3; «min» → «tramos». Paros señalan algo en **6 de 40**; ritmo R² ≥ 0,10 en **11 de 28**.
- #947 (vara de Orel: Calidad informa mejor): veredicto `OrigenDelTurnoCard` + `origenDelTurno.ts`, detalle en hoja. 1.018 → 157 px.
  - ⚠⚠ `useUpstreamLineSnapshot` emite más de una vez; con `machines` vacío el veredicto decía «causas internas». Calla mientras `loading` o sin máquinas.
  - ⚠ Docblock viejo en `UpstreamCorrelationCard`. ⚠ Un diálogo es más angosto que la página (`min-w-[8rem]` cortaba). `text-primary` 4,2:1 → `text-brand-ink`.
  - Pendiente: fundir los duplicados dentro de la hoja.
- #948: ⚠⚠ «Gates 5.551 px» era un `disclosure:*` abierto en el navegador (real 3.305). Antes de inventariar: borrar `disclosure:*` y confirmar `window.innerWidth`. ⚠⚠ `useState(peor)` congelado antes de llegar `mezcla`: abría G10 con 53,5 % crudo (luego 97 %) o G12 en vez de G10 → sigue a `peor` hasta que el usuario toca. Decisión de Orel: abre solo con mezcla real (`puertaQueAbreSola`). 3.305 → 2.001 px.
- #949: ⚠⚠ tres cifras de «piezas perdidas» con tres varas (cadencia de línea, máximo teórico, neta); difieren en 7 de 7 turnos, hasta 7× (374 contra 2.647). La vara va en la frase. `MachineSpeedMeaningCard` plegada con la conclusión afuera; Línea 3.790 → 3.147 px. ⚠ `resize_window` se pierde al navegar: va en el mismo `browser_batch`.

## Exportaciones del turno (PR #941–#944, 09-10)
- #941: tras #939 el PNG salía con «◈»/«▮» sin explicar → pie con umbrales y eventos por tramo. ⚠ «Fecha desconocida»: `shiftDoc` solo existe si hubo acción o carga; usar `summaryId`. `formatter: '◈ 3'` con `lineHeight` giraba el contador.
- #942: ⚠ CSV ordenado con `hourLabel.localeCompare` (noche `00…04, 21…23`) → por instante. Nombre `resumen-<summaryId>.csv`. Chip «Línea 68 % del target oficial».
- #943: ⚠⚠ la hoja ejecutiva acusaba `machines[length-1]` (menos ciclos): **65 de 144** turnos a otra máquina, 11 a la MEJOR. `buildCause` por peor ritmo; con <5 puntos de diferencia no acusa (criterio de `PlantKPIBoard`).
- #944: ⚠ Helvetica/WinAnsi no tiene `→` y jsPDF pasa TODA la cadena a UTF-16 («21:28 ! 05:21»). `textoParaPdf` + `conTextoSeguro` (envuelve también `splitTextToSize`).
- Estos defectos solo se ven mirando el archivo exportado.

## Monitor público y turno programado (PR #945–#946, 09-10)
- #945: de 42 motivos solo «Planned Downtime» (301 apariciones) en inglés → `motivoEnEspanol`. Concordancia con fallas, no con máquinas. «Cambiar cuota» está detrás de `esAdminMonitor && esActual` (sin sesión no aparece).
- #946: ⚠⚠ `graderShiftStatus` calcula `future` y nadie lo consumía: un turno por empezar decía CERRADO + banner rojo «Turno Turno 1… no encontrado».
  - En prod el doc `shoplogix/chonchi/shifts/2026-09-10_Turno 1` apareció 6 min 41 s después del arranque. Horario configurado desfasado: Turno 1 21:30 contra 21:15 real en 28 de 51 (mediana 15 min); Turno 2 09:00 contra 07:15 en 33 de 64 (105 min).
  - Badge «Programado», cuenta regresiva (solo <24 h), canales en `<details>`, auto-refresh también en programado. Campo `ShiftTimeWindow.startsInMin`.
  - ⚠ `allowEdit={status === 'live'}`: no se extendió a `future` porque «Cambié gate» guarda `at: new Date()`. Botón de 40 px (`html{font-size:85%}`).
  - Pendiente: la grilla «Turnos del período» probablemente pinta el futuro como cerrado. `audit-piel` da −8 contra su baseline desde `origin/main`.

## Vista PC (PR #950–#953, 09-11)
- #950 (Orel: el móvil no se toca): ⚠⚠ `chartHeight = 108 + legendRowCount * 15` achicaba el gráfico en PC (1.109×123, 9:1). `graderRateChartLayout.ts` (~4:1, piso 108; módulo aparte por `react-refresh/only-export-components`). ⚠ `z2Path` truncado en `max-w-[240px]` sin otro lugar donde leerlo: 3 de 6 runbooks idénticos. ⚠ `zoom` con región no funciona en el Browser pane: medir por geometría.
- #951: abrir un turno angostaba 590 px (listado 1.869, detalle 1.280). Orel eligió **C · Carriles** (artifact 469e337c). `max-w-[1760px]` en Wizard, Turno, Dashboard y Periodo (Config queda en 1.280). ⚠ `container` de Tailwind topa en 1536. Línea: `grid min-[1700px]:grid-cols-5` con `items-start` obligatorio; 2.089 → 1.751 px. ⚠ `ALTO_MAX_PLOT = 280` calibrado para 1.223 px daba 5,8:1 → 380. Regla: al cambiar un ancho, volver a medir los gráficos.
- #952: Mantención en dos columnas por secuencia, 1.471 → 1.117 px. ⚠ Revisar qué hijo queda en cada columna. Timeline de Calidad tenía alto fijo → 1.689 × 380.
- #953: Wizard y Dashboard limpios; `AnalisisGraderDashboardPage` no es ruta (se monta en `AnalisisGraderWizardPage.tsx:1069`). Periodo: `h-64 lg:h-80` topaba en `lg` → `min-[1700px]:h-[26rem]`. ⚠ Un comentario JSX no puede ir dentro de un ternario.
- Tres causas del mismo achatamiento: alto ligado a la leyenda, alto fijo en JS, clase que topa en `lg`.

## Página Periodo (PR #954–#955, 09-11)
- #954: ⚠⚠ la tendencia comparaba `slice(0,7)` con `slice(-7)`, solapados con <14 días (8 días: 86 %). La temporada 2026-27 arrancó con 7 días en agosto y 4 en septiembre: el período por defecto son 8 días y el trimestre 12. Con 228 días tiraba el 94 %. Ahora compara mitades; ⚠ con 8 días el signo se daba vuelta (−0,14 → +0,11 pp). «Mejor semana» exige ≥14 días. `graderTendenciaPeriodo.ts`.
- #955: ⚠ la tabla no desempataba y en Chonchi los nombres no siguen el reloj («Turno 1» noche ~21:15, «Turno 2» mañana ~07:15, «Turno 1 Lunes» desde 00:00) → desempate por `startAt` (`graderPeriodoTabla.ts`). CSV `grader--ltimo-mes.csv` → `grader-ultimo-mes.csv`. ⚠ No dejar `/[\u0300-\u036f]/` literal (guarda combinantes invisibles). ⚠ Backticks por `node -e` en bash se ejecutan: usar un `.mjs` escrito con Write.

## Flujo de carga del Excel del Grader (PR #956–#969, 09-11 → 09-12)
- #956: ⚠⚠ `fileMeta.warnings` se escribía y nadie lo leía; tilde verde sobre archivos con avisos (2 de 3). Aviso si el turno cae fuera del rango del archivo. `graderAvisosDeCarga.ts`. ⚠ `text-ink-warn` sobre `bg-muted` = 4,4:1 en claro. Excel reales: `OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ GRADER/temporada 2025-2026/{pieza a pieza,punto 0}/<mes>/`.
- #957: ⚠⚠ el Wizard monta `AnalisisGraderUploadPage` SIEMPRE con `compact`, y esa rama cortaba antes de la lista: nunca se vieron nombres, avisos ni errores. ⚠ `lineId` fuera de las dependencias de `handleFiles`: guardaba y borraba en la línea equivocada. ⚠ `graderUploads` está dominada por un backfill (700+ en segundos) y su `createdAt` es **string ISO**, no Timestamp.
- #960: ⚠⚠ `deleteDailySummary` corría siempre, una vez por archivo, antes de saber si el archivo contenía el turno. Julio 2025: pieza a pieza 07-01 → **07-14**, Puerta 0 → **07-30**. Ahora `cubreElTurno()` y un borrado por turno. Merge PP+P0 medido sin defectos (orden indiferente; duplicados los quita el dedupe del Wizard). ⚠ vitest no muestra `console.log`: escribir a archivo.
- #962: ⚠⚠ la invalidación sobraba: `saveDailySummaryBatch` sobrescribe con pieza a pieza y hace `merge` con P0 suelto para preservar KPIs que el borrado destruía (entró en `chore: lint y mejoras grader`). Se quitó. Quitar el archivo dejaba el turno sin resumen (3 de 243 días). ⚠ `updateFiles` fuera del `try` quitaba la fila aunque el servidor fallara. Regla: antes de compensar un efecto destructivo, preguntar si hacía falta.
- #966: método = reproducir el pipeline del Wizard en un test sin escribir. ⚠⚠ Cargar los dos Excel de julio da **54 turnos, 37 sin piezas** (69 %) → `avisoDeTurnosSinPiezas`. ⚠ `isP0Only` mira el archivo entero. ⚠ `pwa-5184` lo define el `launch.json` de `ANTARFOOD/.claude/`; para un worktree, `.cmd` con `cd /d`; un puerto nuevo no tiene sesión. ⚠ Tras un rebase, `gh pr checks` muestra el run VIEJO.
- #969: ⚠⚠ dos pieza a pieza de noviembre (`20251110-20251120`, `20251120-20251130`) dan cero registros: `sheet1.xml` corta en la fila ~204.100 de 308.539 y **SheetJS no avisa** → `graderArchivoIncompleto`. Remedio: dos archivos de 5 días. Diagnóstico: `unzip -p … xl/worksheets/sheet1.xml | tail -c 200`. No era el tamaño (135 MB parsea bien).

## Doble conteo de piezas en julio 2025 (PR #973–#977, 09-12)
- #973: **756 de 791 uploads** son recortes por turno (`*_pp.xlsx`) sin `lot`, `product`, `conservation` ni `shift`; `dedupePieceRecords` tenía `lot` en la clave → 11.228 = 2 × 5.614. Clave nueva `ts | gate | pieces | quality | calibre | weightKg` (conserva la copia más completa); sobre **5.374.920 registros** detecta los mismos 555 duplicados. Método: bajar de Storage el archivo de `sourceFileNames` y comparar campo por campo.
  - Regla: una clave de identidad no puede incluir campos que una fuente válida puede no traer.
- #975 (APLICADO EN PROD): ⚠⚠ `scripts/load-missing-shifts.js` tenía su propia copia de la clave. Regla: grepear copias en `scripts/`. **12 resúmenes** de julio 2025 con factor exacto 2.000 regenerados con `rehacer-turnos-inflados.js` (`require` del script, envuelto en `if (require.main === module)`); dry-run, respaldo JSON, de a uno, sumas internas (`avgWeightGrams` igual, 5.198). ⚠ El P0 de esos turnos estaba a la MITAD: julio 2025 se veía mejor. Los 335 del script y los 50 de la app no se tocaron.
- #977: `dedupeGate0Records` fallaba por `calibre` (838 en vez de 419); `error` se queda. Nada que regenerar. ⚠ `detectFileKind` usa el nombre: medir con el `path.basename` real.

## Revisión: repuestos por equipo (sin PR, 09-12)
- La UI funciona; los datos no. **458 de 511 nodos hoja sin repuestos.**
- Las **seis Baader 142** tienen 1.803-1.804 cada una contra un BOM real de **476 líneas**; 99,9 % vinculado a 6 o más equipos. **73,6 % sin SAP** y **707 filas sobran** por nombre repetido.
- ⚠ Los nodos de `hierarchy` usan `tipoNodo`, no `tipo`.
- Pendiente (Orel): reemplazar el vínculo masivo por el BOM real y consolidar duplicados sin SAP.

---

# Historial resumido · 2026-08-11 → 2026-08-26

> Compactado el 2026-09-17 desde ~128 KB de entradas PR por PR. El detalle completo vive en git
> (`git log -p .ai/WORKLOG.md`) y en el respaldo `.ai/backups/WORKLOG-2026-09-17-pre-compactacion.md`.

## Cola fuera de horario, brief de Filete y navegación de turnos (PR #449–#457, 11-ago)
- #449: WhatsApp descartado por el trámite con Meta (1-2 semanas); Orel eligió Telegram. El brief de fin (`componerBriefFinTurno`) salía al horario oficial con la línea produciendo y sumaba solo el doc del turno: anunció 4.338 pz de una jornada de 4.915 (−12%).
- Fix: `sumarColaAMaquinas` (publicMonitor.js, reusa `loadOutsideShiftProduction` con dedupe máquina+timestamp); el brief espera que la línea pare (tope 2 h) y desglosa «4.410 dentro + 505 después (15:40-16:30)».
- ⚠ `endBriefSnapshot` guarda el total SIN cola: `checkShiftReconciliation` lo compara con el doc padre y avisaría una corrección falsa de −505 cada día.
- ⚠ `resumenParos` ignora states de duración cero y repetidos (27 de 85 «micro»: Telegram 85 vs monitor 58).
- `notificationConfig/filete`: telegram ON, dest `bot` (DM admin), inicio+fin ON, paros y primera pieza OFF. Al grupo: `telegramDest` = `grupo`.
- #451: cualquier turno del día se quedaba con la cola `Unscheduled`. Noche 10-ago (21:15→05:00) sumaba 1.317 pz ajenas: 13.487 en vez de 12.170. Regla de Orel: la cola cuenta solo si es CONTINUA (continuidad + cercanía; un tramo va a un solo turno; empate al que ya cerró). Archivos: `functions/publicMonitor.js`, `hooks/useShiftOutsidePieces.ts`, `graderUnscheduledLoad.loadDayShiftWindows`.
- ⚠ La distancia se mide desde el BORDE del tramo, no por intervalo suelto.
- #453: la matriz usa la misma regla (`esColaDeEsteTurno`); `MAX_ADJACENCY_MIN` eliminado, manda `MAX_CONTINUIDAD_MS`; candidatos incluyen días adyacentes (cruza medianoche). Las 4 superficies deciden igual.
- ⚠⚠ ENCADENAR tramos antes de decidir (Yal 10-jul: 2.296 pz con huecos antes de un turno de 15:15; tramo a tramo se perdían).
- ⚠⚠ Umbral 60 → 90 min, en los DOS lados (con 60 ese bloque quedaba fuera por 5 min; lo que se excluye está a 10-14 h).
- ⚠ Un día SIN turnos ya no se cuelga de otro día (Chonchi 02-ago, 293 cic): el bloque queda visible. Revierte en parte la decisión del 03-ago, solo para lo de fuera.
- Impacto en agosto: 0 piezas dejan de atribuirse (chonchi 4.258, yal 3.395, filete 2.661); cambia a quién.
- #455: Anterior/Siguiente deshabilitados si el turno no estaba en la cadena. Eviscerado usaba `isClassificationPlant === false` → ahora `shoplogixEnabled`; Filete no calzaba la etiqueta («Turno dia»/«Turno Dia») → el turno abierto se inyecta en su lugar. Monitor: turno en la URL (`?turno=<shiftDocId>`), compartible.
- ⚠⚠ Pestaña de prueba en segundo plano: React difiere el flush; la URL cambia y la vista no. Verificar por `disabled`/`title` o recargando con estado en la URL (costó una hora).
- Pendiente: Orel confirma en uso real «toco el botón y no pasa nada» del monitor.
- #457: fuera el bucket `Unscheduled` del carrusel (salvo si es el que se mira); lo no atribuido se ve en la MATRIZ.
- ⚠ Leer botones por `title`, no `innerText` (`hidden md:inline`).

## Grader: «No aplicable», tarjeta de turno y pestañas (PR #459–#471, 11-ago)
- #459: Matrix 13.529 registros vs app 13.366 piezas. 163 filas con cantidad 0 y peso «No aplicable» se descartaban. **Matrix cuenta REGISTROS; la app PIEZAS.** Van a `notApplicableRecords` (no a `pieceRecords`), repartidas por turno; el doc ya cargado se completó a mano.
- ⚠ El conector M365 trunca adjuntos a 200.000 caracteres (llegó el 17,6%); bajar el archivo con un subagente.
- ⚠ Cabecera pieza-a-pieza Chonchi: `Fecha | Hora | Peso de las piezas | Cantidad de piezas | Lote | Gate | Calidad | Conservacion | Calibre | Producto | Turno` (el parser mapea por nombre).
- #461: ⚠⚠ #459 se dio por bueno sin mirar: la línea quedó en `GraderTurnoDetailView` y la vista pinta `HeroScorecard`. Lo que se VE no está hecho hasta verlo.
- #463: el chip decía «Turno dia» para «Turno 2»: el fallback filtraba con `isClassificationPlant` y daba nombres que Chonchi dejó de emitir en 2026-05. Fix `bySpecificity()` (ventana más corta primero).
- ⚠⚠ `isClassificationPlant` solo significa «clasifica por calibre/calidad»; sospechar si decide otra cosa.
- #465 (opción B elegida por Orel): tarjeta por PREGUNTA (cuánto salió / dónde estuvo la limitación), mitad derecha común (`ShiftMachinesHalf`); número grande = piezas; uptime al nivel de producción.
- ⚠ Los tokens `--ink-*` ya existían: buscar el token antes de crearlo. ⚠ La barra de uptime usa el color del uptime, no del veredicto.
- #467: ⚠⚠ las pestañas vivían dentro de `{summary && shiftWindow && ...}` y sin Excel desaparecían (tercer caso del patrón «gate de dato esconde estructura»). Ahora siempre visibles; las que piden Excel, deshabilitadas con motivo. «¿Qué hacer?» es pestaña con contador.
- ⚠ Modales del panel montados en Resumen (`handleActionTrigger`). ⚠ Las pestañas quedaron debajo del contenido y el test pasaba: solo se vio mirando.
- #469: una pestaña = una pregunta (resumen/calidad/timeline/gates/línea/acción). Calidad lleva `P0CausesPanel`, `ShiftBreakdownsCard` e IA; compartir y QR a un botón superior con `scrollIntoView`.
- #471: Resumen a ancho completo; Calidad y Timeline juntas otra vez.
- ⚠ `selectedCauses` es estado compartido entre `P0CausesPanel` y `ShiftTimelineView`: revisar estado compartido antes de mover un bloque de pestaña.
- ⚠ `handleExportPdf` saltaba a `timeline` para montar el gráfico; ahora a `calidad` (si no, PDF sin gráfico y en silencio).
- Pendiente menor: a 375 px en `P0CausesPanel` el chip `paraguas · 6 sub` se superpone con `89.7% del P0`.

## Gates: sin Excel, saturación y corte a mitad de turno (PR #473–#476, 11–12 ago)
- #473: Gates usable sin Excel; imputaciones de «Línea» a «¿Qué hacer?» (suman al badge).
- ⚠ El panel se monta siempre y se oculta por CSS: carga las anotaciones y publica el pendiente.
- #474: compara gates contra el reparto histórico de calibres. Chonchi: 8-10 lb = 55% con 3 de 12 gates (2,2x); 2-4 lb con 2 gates para el 1,3%. Archivos `services/grader/graderCalibreHistory.ts`, `GatesHistoryHintCard.tsx`.
- ⚠ Calibre sin normalizar en Matrix («8-10 lb» vs «8 - 10 LB»): `calibreKey()`.
- Fallback a plantilla `graderGatesTemplates`; `GateChangeModal` sin snapshot abría vacío (arreglado). Compara por calibre; no filtra por lote (`lotsInShift` vacío en 36 de 37); nunca deja un calibre en 0 gates. Ningún cambio de gate registrado (decisión de Orel).
- #476: `MidShiftCheckCard` + `graderMidShiftCheck.ts`, con Excel parcial; si el Excel tiene >90 min lo dice primero; reusa `compareGatesVsHistory`/`suggestGateMoves`. Caso real: ratio 2,4× → 1,4×. Las 12 gates abren por defecto (`defaultTab`).
- ⚠⚠ Corrección a #474: `collection('graderShifts').get()` ve 2 turnos (subcolecciones bajo padres inexistentes); `collectionGroup('configHistory')` ve **386**. Contar subcolecciones siempre con `collectionGroup`.
- ⚠⚠ Snapshots fantasma de «0 cambios»: el editor publica al montar y `saveConfigSnapshot` no lo distingue. Cortado con huella de la última emisión. En prod hay 125 de 659; dos del agente (`2026-08-11__Turno 2` 2026-08-12T00:49Z, `2026-08-07__Turno día` 2026-08-12T00:01Z), sin borrar (decisión de Orel).
- Pendiente: aviso por Telegram al detectar saturación (camino C). Propuesta: https://claude.ai/code/artifact/046435ab-b88f-4f0c-9c8a-eef62b0302d9

## Header móvil de Análisis de Turno (PR #478, 12-ago)
- Los botones tapaban el título: sus etiquetas `shrink-0` desbordaban. Fix: dos filas en móvil (`basis-full sm:basis-auto`); desktop igual.
- ⚠ `min-w-0` no alcanza si los hijos son `shrink-0`. ⚠ Medir desborde con `getBoundingClientRect`, no a ojo.

## Monitor público: espejo, contador vivo y hora extra (PR #501–#531, 12–13 ago)
- #501: cabecera en vivo con cierre previsto («est.»). #503: «Ahora mismo» solo en turno en curso; veredicto dice cuánto fue producción real. #507: pie neutro con turno cerrado; estado por máquina (`currentReason`/`currentSinceAt`); línea de récord.
- #511: `handleAbrirMonitor` reusa el token de línea; la pestaña se abre ANTES del await (bloqueador de popups). Pendiente: probar con sesión de supervisor.
- #519: «datos hasta las HH:MM» = fin del último tramo (t + 5 min), no `lastSyncAt`.
- #526: `officialLive` = acumulado real del rollup (endpoint del whiteboard), dentro del write del padre (cero writes extra). Cuadró con planta (3.850 = 3.850).
- #529: «fuera de horario» por hora real, no por doc de origen; `officialLive` dentro del guard `isOfficialScheduleSane` (Shoplogix devolvía la plantilla del día siguiente y lo pisaba con 0). Verdict `hora-extra`. Pendiente: verlo en una hora extra real.
- #531: `shoplogixLive` solo con `totalCycles > 0`.

## Monitor: comparador y veredicto (PR #505–#525, 13-ago)
- #505: hoy contra UNA referencia por chip, brecha sombreada, cuota aplanada en convenio, chip «· mejor». #509: la referencia vive en `ComparadorDias` y alimenta también `BrechaDelDia`.
- #515/#517: curva de velocidad (luego fusionada en #552). #513: bitácora del operador (luego eliminada).
- #521: verdict `exigente` (bajo el techo pero sobre el mayor entre promedio y última media hora, margen 5%).
- #525 (Orel): sobre +30% del ritmo real es «no se alcanza»; «solo apurando» = 1,05x-1,3x.

## Monitor: pronóstico e historial del mismo turno (PR #534–#546, 13–14 ago)
- #534 `monitorForecast.ts`: desde el minuto 240; método por backtesting leave-one-out. 34 turnos: Filete proporcional (5,2% vs 11,3%), Yal aditivo (8,8%; proporcional 12-24%). Causa física: Filete = velocidad; Yal = tiempo andando + paradas. Con error >15% se calla.
- #536: cono de proyección; número y dibujo de la misma `proyectar`.
- #540: `forecastHistory` = hasta 10 turnos del mismo nombre, 5 KB, fallback a `history`.
- #542 ⚠⚠ Firestore no admite arrays anidados: pares `[m, p]` hicieron fallar el write ENTERO y el doc quedó congelado ~40 min. Ahora `{m, p}`. Verificar con el write real, no solo el cómputo.
- #544: el piso de ancho de barra dejaba 15 de 118 barras fuera del viewBox (~2 h). Paso `W / n`.
- #546: tres grados de «la meta entra» (ninguno / menos de un tercio / un tercio o más).
- #538 «Dónde se gana en esta línea»: por línea, qué factor del total manda (tiempo andando × velocidad), medido por DISPERSIÓN de los últimos 6 turnos y no por correlación (con 6 turnos un coeficiente es ruido). En Filete manda la velocidad; en Yal, el tiempo andando. Más tarde Orel pidió quitar el bloque (ver «Fuera … Dónde se gana»).

## Monitor: colación y ritmo andando (PR #548–#551, 14-ago)
- #548: `timeBreakdown.windowMin` son minutos HASTA AHORA, no la duración; la cuota trepaba en la hora 4. Ventana `scheduledStart→plannedEnd`, convenio previsto (`breaks`). −2.995 → −929.
- Colores: `monitorColors.ts` pasó de 7 hex (1,9:1) a 3 roles OKLCH con `--mon-*`.
- ⚠ En SVG, colores por `style={{ stroke }}` (el atributo no resuelve `var()`). ⚠ Los hex de gráficos no pasan por `tailwind.config.js`: medir contraste en ambos temas.
- Dos cierres contradictorios: `pace` proyecta a `plannedEnd`, el pronóstico a la duración mediana (8 h 45); la diferencia es la hora extra habitual (505/311/413 pz). Cada número lleva su hora; `ForecastResult.horizonMin`.
- ⚠ `stopEvents` trae todas las detenciones y su `r` es un ÍNDICE a `stopReasons`. Paradas de convenio desde `comparacion.breaks` (`plannedBreaks()`).
- ⚠ El aviso de próxima parada contaba desde `scheduledStart` y `plannedBreaks` desde el primer tramo con dato (5 min tarde).
- #551: `computePaceToTarget` con `pendingBreakMin` → `workMin` (piso 5 min).
- ⚠⚠ `mergeBreaks` usaba `fromMin > currentMinute`: la colación dejaba de contar mientras ocurría → `toMin > currentMinute`.
- ⚠⚠ La parada EN CURSO no está en `stopEvents`: se arma desde `currentReason`/`currentSinceAt` y `extendOngoingBreaks` la estira a la mediana histórica.
- `breaksTurno` = fuente única; `breakMinutesBetween` y `extendOngoingBreaks` en `monitorCompare`.
- ⚠⚠ REGLA (Orel): un ritmo requerido sobre tiempo productivo solo se compara con ritmos productivos. Filete: andando mediana 11,0 / mejor 13,2; reloj 8,1 / 9,7. `ritmoAndando` desde `forecastHistory` y `live.uptimeSec`; `recentPerHour` null. «Tiempo produciendo» sobre tiempo disponible: 68% → 84%. Lectura: la línea anda sobre la mediana; lo que falta es tiempo.

## Monitor: menos ruido, Pareto, silletas y gráfico (PR #552, 14-ago)
- Inventario: 11 bloques, 2.766 px; tres respondían «¿llegamos?», cuatro «¿va rápido?», nadie «¿se repite?».
- Pareto (`monitorPareto.ts`): dos ejes (minutos y en cuántos turnos; bajo la mitad en gris) y agrupado por equipo (antes de la primera barra de `Equipo/Parte`). Filete 7 turnos: 4 causas = 84% (Micro Detencion 35%, Baader 200 22%, ATASCAMIENTO 15%, ACUMULACION 12% en 2/7).
- Un solo gráfico de 5 min (`VelocidadDeLinea` borrado). ⚠ Referencias solo si caben (≤1,3× el máximo).
- Tarjeta «Ahora» unificada; 2.766 → 1.420 px (−49%). ⚠ Desde 2× el mejor turno el requerido se dice en palabras. ⚠ Tests de `PronosticoCierre` abren por el botón (`aria-expanded`), no por `localStorage`.
- Silletas (Orel): Baader 200 de Filete, 5 silletas, máx. funcional 22 pz/min, se opera a 18; el límite es abastecimiento/atascamiento, no velocidad. 614 tramos: máx. 16,6, p95 14,0, mediana 10,2; ninguno al 90% de llenado; se llenan 61-64 de cada 100.
- ⚠ Las 142 no tienen silletas: `SPECS` por MODELO en `monitorMaquina.ts`. ⚠ `imposible` contra el máximo (22), no el set point. ⚠⚠ El set point no viaja en los datos: la pantalla siempre lo muestra.
- Pendiente: ver «harían falta N» en pantalla; confirmar si 18/22 cambian por producto o calibre.
- Gráfico: eje Y hasta la velocidad de la máquina (antes autoescalaba); alto 80 → 170 px en px; chips de series en localStorage; zoom por gesto con «ver todo · N×». Mockup: https://claude.ai/code/artifact/115ffa5f-c34e-4ddf-a00f-0899e80cf153
- ⚠⚠ `wheel`/`touchmove` nativos con `passive: false` (React los registra pasivos). ⚠⚠ El pellizco corta la propagación (swipe de cambio de turno, umbral 60 px). ⚠ Sin modificador la rueda no hace zoom.
- Pendiente: probar el pellizco en un celular.

## Monitor: pérdidas, dueños, contra ayer y contexto (14–15 ago)
- `monitorPerdidas.ts`: cada parada se valoriza al ritmo previo (mediana de tramos limpios de 30 min, sobre tiempo andando). 14-08: 719 → 662 pz (−8%).
- ⚠ Excluir de la referencia tramos con parada y en cero sin parada. ⚠ El titular se suma de las filas; la parada en curso va al promedio. `sinLocal` reporta los eventos del arranque.
- Fuera «Comentarios del operador» y «Dónde se gana» (Orel). ⚠ Se pierden anotaciones de causas sin fila, de >2 h, mecánicas sin fila y las que pasan el tope de 2 de `notasPorCausa`.
- «Qué pasó en el turno»: por dueño (Mantención/Externo/Sin imputar/Programado) con el árbol OFICIAL (`imputacionTaxonomy.ts`, curso V12); 14 de 21 causas matchean. «Evitable» ≠ «de Mantención» (14-08: 410 externos + 252 sin imputar, cero de máquina).
- Extensión (Orel): 5 hojas `extension: 'filete-baader200'`; 140 min de fallas caían en «sin imputar». `TOTAL_HOJAS_CURSO` sigue en 46. Notas a `notasOperador.ts` (eslint 30 → 28).
- ⚠ No se puede el Pareto eléctrica vs mecánica: Shoplogix aplana el árbol.
- `monitorVsAyer.ts`: Δpz en duración/convenio/paradas/velocidad + residuo (14-08: −1.001, −213, +88, +276, +63 = −788). Solo con turno cerrado; récords por componente con mínimo 3 turnos; 12 de 23 turnos sin datos se saltan; residuo >35% → «datos incompletos».
- ⚠⚠ `history` cacheado usa metodología vieja (07-08: 397 vs 351 min); manda `forecastHistory`.
- Capa de contexto (guías en `ANTARFOOD/_GUIAS/_DESTILADO_VISUALIZACION.md`): banda normal, umbrales ▲110%/▼75%, meta como bullet. La meta 5.000 supera todo lo cerrado (3.168–4.915).
- ⚠⚠ En el monitor, lo que dependa de «hoy» usa `vista`, no `data` (el turno visto se colaba en su propia banda). Con <5 turnos válidos no hay banda.

## Monitor: turno noche, set point, rejilla y guardia de gráficos (PR #562, 15-ago)
- Regla de Orel: Shoplogix manda, cero horarios hardcodeados. El verificador diario avisa por Telegram un nombre de turno nuevo (`scripts/.turnos-vistos.json`, gitignoreado).
- Set point: `graderModuleConfigs.monitorSetPoint` → `live.setPoint`, editable (`setMonitorSetPoint` en `pinShiftEnd.ts`). Sembrado 18 pz/min (Orel, 15-08); el máximo 21 sale del manual.
- ⚠ El set point se resuelve ANTES de buscar la entrada de horario.
- #562: la rejilla de `timeBreakdown` se dimensionaba con minutos de operación y se indexaba por hora real: el 14-08 perdía 50 min de cola. El ritmo 13,5 era ~11,6 (récord falso) y el 13-08 escondía una falla (CUCHILLERIA DORSAL 15 min·3×).
- Fix: rejilla `effectiveStart→effectiveEnd`; `tbv: 2` invalida la caché de `forecastHistory`; eventos a ≤10 s se funden en episodios.
- 9 fixes de gráficos contra las guías (calibres con `utils/calibres.ts`, bug duplicado en Pivote y timeline). `scripts/audit-graficos.mjs` en CI con línea base por archivo; cazó 8 `.sort()` pelados.
- Pendiente: leyenda de `GraderTimelineChart` angosta y ejes de compuertas en ambos temas.

## Monitor: Pareto en piezas (PR #598–#604, 16-ago)
- #598: `buildPareto` valoriza cada causa al cpm andando de su turno (rango 9,1–12,4). #600: tira con % y ≈pz (`fmtPzCorto`). #602: un solo significado para el ámbar. #604 (Orel): sin mediana punteada; filas suman 100% con `repartir100()`.

## Piel: targets táctiles y home móvil (PR #606–#608, 16–17 ago)
- #606: «Análisis de Turno» en home con 3 accesos por línea; banner sin semver (`formatDesfase`/`formatHora`).
- #608: ⚠ `min-h-11` da 37 px (root al 87,5%/85%). Px literales en `components/piel/` (`GroupedList`, `Button md`, `Disclosure section`, `TabBar`).

## Monitor: Filete nocturno sin turno (PR #610–#618, 17-ago)
- #612 (reemplaza #610): el turno empieza en la primera pieza, `desdePrimeraPieza()` en `monitorActividad.ts`; antes 12 filas en cero y comparador corrido 12 h. #614: la cabecera también.
- #616: con hueco >60 min tras el primer tramo, el inicio es el bloque siguiente (3 pz de prueba a las 21:45). `inferShiftEndFromDuration()`: sin cierre conocido, arranque + duración mediana (452 min), al final de la cascada.
- ⚠ `functions/publicMonitor.test.js` da 35/37; los 2 fallos son preexistentes.
- Pendiente: definir el turno nocturno de Filete en Shoplogix (como `Unscheduled` queda fuera del Pareto y el historial).
- #618: sin `plannedEnd` la ventana caía a `windowMin` y se restaba contra `scheduledStart` (24 h atrás): «−3.171 vs cuota» falso. Sin cierre, cuota `0`.

## Monitor: regla de ritmo y pulso (PR #620–#641, 17–18 ago)
- #620: `.tap-44` (`::after` 44×44) en 20 controles; chip activo a `text-foreground` (2,81 → 10,64). #622: ejes 9 → 11 px (Constitución §9/§64).
- #624: 6 cifras de ritmo → una regla; `monitorRitmo.ts` es la única fuente de la media móvil.
- #626 revertido por #628: filtrar por nombre falló (Filete pasó a «Turno Noche L», 00:20–07:51, y dejó un «Turno Dia» de 4 h). Ahora la persona elige el turno por chip; el filtro por nombre sigue en banda/récords/vsAyer/Pareto. `buildDayComparison` no filtra (Yal compara sus 3 turnos).
- #633 (Orel): las tres cifras de la regla en base andando, con la base escrita.
- #635: la marca = ritmo requerido en base andando (sin extrapolar con <15 min). Scheduler `shoplogixPulseWakeup` (1 min) lee el acumulado vivo sin tocar buckets ni sync.
- #637: ⚠ `functions/index.js` no tiene `admin` en scope (`getFirestore`, `FieldValue`, `FieldPath` sueltos). Deploy OK ≠ función corriendo: revisar logs de la primera ejecución.
- #639: ⚠ Shoplogix refresca el contador cada 2 min: ritmo sobre las últimas 5 lecturas (serie real de test).
- #641: endpoint `publicMonitorRefrescar` (~1 s, throttle 20 s en servidor, `yaFresco: true`) y botón con cuenta regresiva.
- Pendiente: verificar el endpoint y el bloque con acumulado > 0 en un turno vivo.
- Conocido y ajeno: error ROPC de `yal` en backoff.

## Plano de partes BAADER 142 (PR #699, 23-ago)
- Catálogo 1420000821 (254 figuras, 3.664 filas) en modo `despiece` (`planos/baader-142-despiece/`), con puente B14↔pieza en los eléctricos 888/860 (`partes.json`, telemetría `planoUsos`). 2.527 posiciones, 14 sensores B.
- Pendiente: al terminar el OCR por teselas, re-subir los JSON y bumpear `vAssets` (PR solo de datos).

## Ventanas de intervención (PR #789, 26-ago)
- Pestaña en `/calendario-mantencion` (en prod, `buildSha 285e0bf`). Dos capas por tramo de 5 min; ocupante `X` = higiene en colación (choque estructural con Mantención).
- `ruedaCarga`: capacidad = `min(máquinas disponibles, dotación)`, no el producto.
- ⚠ `ruedaProgramacion`: el veredicto sale del ENCAJE, no de la suma (13,7 h contra 107 h «cabía» y solo entraban 5 de 10 ejecuciones).
- Link `/rueda/:token` (30 días). Reglas `rueda_ventanas_state` y `ruedaVentanasPublicTokens`.
- ⚠ Los horarios cargados son una BASE DE EJEMPLO.

## `--brand-ink` y lockfile de pnpm (PR #820–#823, 26-ago)
- #820: `--brand-ink` oscuro heredaba #2a6aa6 (2,75:1) → #71ade1 (6,60:1). El claro tampoco pasaba (3,71:1 sobre #d7e5f2) → primary-700 #245a8c (4,72:1).
- ⚠ El peor fondo es el de la app, no la tarjeta. ⚠ Un token heredado entre pieles necesita un par por piel (4 pares en `scripts/check-contrast.mjs`).
- #823: `pnpm-lock.yaml` desincronizado desde #643 (`jspdf`); sin bug en prod (`deploy-functions.yml` usa `npm ci`).
- ⚠ `deploy.yml`, `deploy-miniapps.yml` y `daily-sync.yml` desactivan `--frozen-lockfile`: un guardarraíl apagado no avisa. ⚠ Regenerar con la pnpm de `packageManager` (10.33.0) y `--lockfile-only`.
- Pendiente (Orel): volver los tres workflows a `--frozen-lockfile`.

## Mantenimiento del WORKLOG (13-ago)
- Segunda compactación: 195 → ~146 KB; respaldo `.ai/backups/WORKLOG-2026-08-13-pre-compactacion.md`. Luego volvió a ~216 KB.

---

# Historial resumido · 2026-08-01 → 2026-08-10

Narración PR-por-PR colapsada (vive en git y en los PRs). Se conservan los gotchas, las causas
raíz, las decisiones con su porqué y las cifras medidas.

---

## Monitor público de turno (link/QR sin sesión) · 2026-08-10

**Entregas, todas HECHAS y desplegadas** (#434, #447 y PRs asociados): monitor `/monitor/{token}` con
doc espejo · modo `line` que sigue el turno vigente · link por Telegram al arrancar el turno · rescate
de las piezas de fuera del turno · swipe a los 6 turnos anteriores · `Unscheduled` deja de ganar como
turno vigente · la tarjeta aparece en Filete + callable idempotente · telemetría anónima · eje sin
recorte / navegación en ambos sentidos · fix del doble conteo en la MATRIZ · theme-aware · la vista de
turno cuenta también la cola · apodos de aparatos · detenciones ubicadas en el gráfico.

**Arquitectura y decisiones vigentes:**
- **Espejo, no lectura directa**: `shoplogix/**` exige `isNotAnonymous()` y abrirla expondría todos
  los turnos de todas las plantas. Se publica `publicShiftMonitors/{token}`, que escribe SIEMPRE el
  Admin SDK (`write: if false`) y lee cualquiera solo mientras no venza
  (`timestamp.value(expiresAt) > request.time`, reloj del servidor).
- **El trigger va al doc PADRE del turno, no a `machines/{id}`**: el padre se escribe una vez por
  ciclo de sync; la subcolección dispararía un evento por máquina (3 en Eviscerado) componiendo el
  mismo payload. Frescura ~5 min. Sin comentarios de operador (texto libre con nombres).
- **La invariante del modo línea: el TOKEN NO CAMBIA.** `ensureLineMonitor` reusa el link vigente y
  solo extiende la vigencia (a 30 d) cuando le quedan <7. Crear uno nuevo en cada arranque pasaría
  cualquier test de contenido y rompería lo único que hace útil al link: que el QR de la pared y el
  Telegram de ayer abran la misma pantalla (4 tests, comprobados mutando el código).
- ⚠ **El monitor de línea NUNCA adopta el turno que disparó el trigger**: el re-sync móvil reescribe
  padres de ayer y de hace 2-3 días, y adoptarlos haría saltar el link a un turno viejo mientras
  alguien lo mira. Siempre se re-resuelve (`resolveCurrentShiftDocId`: padres de hoy y ayer en
  wall-clock, gana el que contiene el reloj de planta con 30 min de gracia; entre turnos gana el
  último que YA empezó, porque quien abre el QR a las 20:00 quiere ver cómo terminó).
- Tres estados verificados: corriendo · vencido/revocado · **"Esperando el próximo turno"** (un link
  de línea puede nacer un domingo: no está roto, espera).

**Gotchas y causas raíz:**
- ⚠⚠ **DOBLE CONTEO, el bug que casi se cuela.** El doc del turno guarda intervals MÁS ALLÁ de su
  `scheduledEnd` y Shoplogix repite esos minutos en `Unscheduled` — **idénticos, 112 piezas** (15:30 y
  15:35 del 10-ago en Filete). Filtrar por la ventana declarada NO los atrapa: **dedupe por (máquina,
  timestamp del interval), nunca por ventana.** Se detectó MIRANDO: el máximo del tramo saltó de 83 a
  130 pz, justo 65+65. Acá el doble conteo es el peor error posible: quien mira el link no tiene con
  qué contrastar.
- ⚠ **El mismo doble conteo en la MATRIZ, con un bug propio que costó una vuelta**: usé
  `s.key.slice(11)` para armar la ruta, pero la key es `${dateKey}__${shiftId}` con **DOS** guiones
  bajos y el doc lleva **UNO**. La ruta no existía, el `catch` devolvía un set vacío y el dedupe no
  hacía nada — todo en verde. Detectado mirando la matriz: seguía diciendo 5.033 (real 4.921). Usar
  `s.shiftId`.
- **Diferencia intencional monitor 4.915 vs matriz 4.921** = las 6 pz de higiene de las 06:10. El
  monitor descarta tramos <20 pz; la matriz atribuye todo (decisión de Orel del 03-ago: *ningún ciclo
  queda sin turno*). Conviven a propósito.
- **El umbral de ruido ≥20 pz fuera de turno** nace de un dato real (6 pz sueltas a las 06:10,
  higiene) pero se dejó como UMBRAL y no como "ignorar todo lo anterior al turno", porque el arranque
  anticipado real existe y ya costó un fix entero.
- ⚠ **`Unscheduled` ganaba como turno vigente**: mostraba 623 pz mientras el `Turno Dia` real llevaba
  4.915 — ganaba por horario y pasaba el filtro de 50 ciclos. **Un cambio puede invalidar un umbral
  que llevaba meses siendo correcto**: desde que el monitor rescata la cola, esas 623 YA están en el
  turno real. Regla: nunca caer a `Unscheduled` como fallback de un turno nombrado; solo se acepta si
  la línea no tiene NINGÚN turno con nombre en hoy/ayer y aun así hubo proceso.
- ⚠ **Ordenar el historial por el id NO sirve**: en Chonchi "Turno 1" arranca 21:30 y "Turno 2" a las
  09:00, así que alfabéticamente sale al revés. Ordenar por `scheduledStart`.
- ⚠ **Bug de React**: el efecto que reubica la vista al arrancar un turno nuevo dependía también de
  `idx`, así que se disparaba con la navegación del propio usuario y lo devolvía al turno actual —
  **el botón parecía no responder**. Debe depender SOLO de `vistas`; quien navega actualiza el ref a
  mano. No lo vieron tsc ni los tests.
- **Costo**: un turno cerrado ya no cambia, así que el historial se REUSA del doc anterior; sin ese
  reuso serían ~40 lecturas por refresco por monitor.
- ⚠ **"Turno cerrado" con el turno vivo**: en Filete el `scheduledEnd` se DERIVA del último intervalo
  sincronizado, o sea que siempre queda en el pasado. Fix: margen de 30 min **Y** exigir que ninguna
  máquina esté en uptime (test que falla si se revierte cualquiera de las dos).
- ⚠ **Gotcha de UI reusable**: el root de la app corre a **85% (13,6px)**, así que **`text-xs` renderiza
  a 10,2px reales**, bajo el piso de 11px de la piel nueva → en pantallas públicas los tamaños van en
  px explícitos. Y `capitalize` de Tailwind capitaliza CADA palabra ("Lunes, 10 De Agosto"): usar
  `first-letter:uppercase`.
- ⚠ **El gráfico mentía por recorte**: `SERIES_MAX_POINTS` en 48 tramos (4 h) cortaba la mañana entera
  y el eje decía "12:30–16:25" para un turno que arrancó 07:55. Subido a 192 (16 h): 48 → 106 tramos.
  *Un gráfico que se come la mitad del turno no es incompleto: engaña.*
- ⚠ **Listado y gráfico salían de DOS cálculos distintos** (listado "85x", gráfico 55 bandas): estados
  duplicados + estados de duración cero. El backend publica `stopReasons` + `stopEvents` desde la MISMA
  fuente deduplicada.
- ⚠ **Las bandas se ubicaban por aritmética de tiempo y quedaban corridas** (3 fuera del área):
  **la serie NO es continua**, solo trae los tramos que el sensor registró → hay que buscar el ÍNDICE
  del tramo en la serie.
- ⚠ **La cadencia se diluía**: al estirar la ventana hasta la última pieza del día, un hueco de 1,5 h
  en la mañana convertía 557 pz/h en 487. El denominador son las horas de **OPERACIÓN** (se descuentan
  los huecos ≥30 min sin una sola pieza). El **% produciendo** se calcula sobre el tiempo RASTREADO
  (uptime/(uptime+down+break)), no sobre el `shiftRuntime` de Shoplogix, que solo conoce el turno (con
  la cola vacía da 73,3% vs su 73,28%: no rompe lo verificado).
- ⚠ **`Planned Downtime` NO es detención**: es el relleno de las horas en que la planta no operaba. Al
  rescatar la cola entraba al denominador y hundía el "% produciendo" de 72% a 58%, y además encabezaba
  el ranking de detenciones ("el primer lugar era: no estábamos trabajando"). Excluido de las dos
  partes → vuelve a **76,5%**.
- ⚠ **La tarjeta del monitor NO aparecía en Filete**, el caso de uso principal: estaba anidada dentro
  de `{summary && shiftWindow && (...)}` y ese `summary` es **el del Excel del Grader**, que Filete no
  tiene. tsc, eslint, 1.104 tests, build y vista pública, todos en verde. Nunca se abrió la página a
  mirar la tarjeta, y se declaró "pendiente: falta apretar Generar link" cuando lo honesto era "no se
  sabe si la tarjeta aparece". **Un pendiente de verificación no es un detalle: es exactamente donde
  estaba el bug.**
- **Cómo se verifica con sesión**: `claude-in-chrome` sobre el Chrome REAL de Orel contra un `vite` en
  el **puerto 5173**, el autorizado por Firebase. ⚠ En ese tab el `.click()` programático NO toma y el
  screenshot falla por `document_idle` perpetuo (la suscripción de Firestore deja la página
  "cargando") → verificar con el navegador interno y clic real por `ref`. ⚠ **No hay viewport móvil
  real**: `resize_window` no cambia el viewport del Chrome del usuario, y el navegador de la
  herramienta —que sí emula móvil— no tiene su sesión.
- ⚠ **Filete NO tenía el canal Telegram abierto** (`notificationConfig` solo existía para chonchi y
  yal): la línea donde más se pide el monitor era la que no iba a recibir nada. Flag propio
  `monitorLink.enabled` (default true, `ttlDays` 30) independiente de `channels.telegram` — **no se le
  abrió el canal de alertas**, porque habría traído detenciones y fin de turno que nadie pidió. Y el
  envío salió del gate `eligibleIds.length > 0`: ese gate son las preferencias de push de los usuarios
  y el mensaje va al chat del admin, así que apagar el push propio no puede dejar sin link a Control de
  Producción.
- **Telemetría anónima y sus límites**: identidad no (quien abre el link no tiene sesión ni dio
  consentimiento), uso sí. **NO se guarda** IP, geolocalización, user-agent crudo, nombres ni correos;
  lo único que distingue un aparato es un `viewerId` **aleatorio** que genera su propio navegador en
  localStorage. Contadores en colección APARTE `publicShiftMonitorStats/{token}`
  (`read: if isNotAnonymous()`, `write: if false`) — NO en el doc del monitor, que es de lectura
  pública y engordaría cada refresco. Endpoint abierto con defensas: solo tokens vigentes, formato fijo
  de `viewerId` (`danilo@empresa.cl` NO entra), tiempo topeado, 10 min de ventana antidoble por
  apertura, poda a 60 aparatos y 14 días. Latidos cada 2 min **solo con la pestaña visible** (el tiempo
  en segundo plano no es tiempo mirado). Con el endpoint caído el fetch se traga en silencio: única
  conducta aceptable para telemetría.
- ⚠ **Un test destapó un bug real**: `applyEvent` mutaba el objeto del día del estado previo
  (`{...s.byDay}` es copia superficial) — dentro de una transacción Firestore, exactamente la clase de
  cosa que produce números irreproducibles.
- **Apodos: se resuelve con lo que sabe el usuario, no con huellas.** El mismo celular figura dos veces
  si el link se abre con navegadores distintos (WhatsApp/Telegram usan webview propio con storage
  aparte); resolverlo técnicamente exigiría **fingerprinting**, que es justo lo que esta pantalla
  prometió NO hacer. Salida: nombrar cada aparato y **fusionar las filas con el mismo nombre**,
  avisando "(2 navegadores)" para que la fusión sea visible y no magia. Los apodos viven en
  `publicShiftMonitorLabels/{token}`, colección aparte, y **NUNCA se copian al doc público**.
  ⚠ Bug propio detectado probando: el guardado fallaba y el editor se cerraba igual, o sea que el
  usuario creía haber guardado. *El fallo era la regla sin desplegar, pero el silencio era mío.*
  La etiqueta "nuevo" solo aparece si el link lleva más de un día: recién creado todos son nuevos.
- ⚠ **Umbral unificado en la matriz**: aplicarlo tal cual hizo fallar dos tests reales porque castigaba
  ciclos sueltos DENTRO del horario del turno, que son del turno sin discusión. **El umbral solo aplica
  FUERA de las ventanas.** Hubo que actualizar un test que fijaba la decisión anterior (Yal 1.836 →
  1.835 cic) dejando escrito en el test por qué cambió.
- **Tema claro/oscuro** (57 hardcodes, playbook `/tema-claro-oscuro`): acentos con `-700/-800
  dark:-300/-400` (un `-300` sobre fondo claro queda lavado); tintes de estado de `/10` a `/20` (en
  claro un /10 colapsa contra la superficie); `bg-red-500/15` con borde `/25` es invisible en claro →
  borde `/40`. ⚠ **Contraste medido, no mirado**: la primera medición dio 2,48:1 y 1,94:1 y eran
  **falsos** porque el script no componía el alfa de los tintes; con alfa compuesto el chip "Detenida"
  daba 4,25:1, **bajo el 4,5 de AA** → `-700`→`-800` y quedó en **5,46:1**. Resto en claro: número
  grande 12,34 · KPI 5,17 · secundario 7,18 · chip ámbar 4,78. En oscuro: 15,47 / 9,49 / 7,33 / 7,25,
  fondo `rgb(13,23,34)`.
- **La vista de turno era la tercera superficie con el mismo dato y un número distinto** (4.410 vs
  4.915): hook `useShiftOutsidePieces` con el MISMO umbral y el MISMO dedupe; cuesta 1 lectura.

---

## Protocolo BAADER 142 y avisos por Telegram · 2026-08-09

**Entregas** (#409, #410, #412, desplegadas): recordatorio semanal `recordatorioProtocoloBaader142`
(viernes 16:30) + trigger `onProtocoloBaader142Created` que evalúa cada lectura contra las dos
anteriores de esa máquina.

- **Criterio: un aviso que llega siempre se deja de leer.** El recordatorio solo manda mensaje si falta
  registrar alguna de las tres máquinas; si están todas, calla (igual que el verificador de arranque).
- **Los tres criterios de alerta y su porqué**: (1) `umbral` — llegó a intervenir (30) o crítico (100);
  es el ESTADO, no el movimiento, así que avisa aunque no haya subido. (2) `tendencia` — subió en las
  dos últimas lecturas **y además llegó a "vigilar" (5)**, porque 0→1→2 por mil es ruido y sin ese piso
  nadie leería el aviso a la tercera semana. (3) `falla-dura` — paró con las correcciones en cero: no
  es desgaste, es inductivo/cable/bloqueo, y el mensaje manda a mirar el inductivo (B1…B5), no la correa.
- ⚠⚠ **EL AVISO NUNCA LLEGABA: topic de Telegram roto.** Telegram devolvía
  `400 "Bad Request: message thread not found"` — el topic `equipos` apunta a un hilo que ya no existe.
  Y como **`sendTelegramMessage` loguea sin lanzar**, la función terminaba en verde con el mensaje
  perdido: todos los viernes habría fallado en silencio. Fix doble: `sendTelegramMessage` **reintenta
  sin topic** (hilo principal) cuando el error es "thread not found", y el protocolo pasa a
  `getTopicId('general')`. **Topics sanos verificados: `general`, `incidencias`, `repuestos`.**
- **Cómo probar un trigger sin ensuciar el grupo**: primero una lectura **sana** (contadores en 0) — el
  trigger corre, no encuentra nada, no manda mensaje, y el log prueba que está enganchado. Después una
  con alerta y `fecha: '1999-01-01'` para que sea inconfundiblemente una prueba. Borrar los docs al
  terminar.
- ⚠ **Los tests de `functions/` NO corren en CI**: el vitest de `apps/pwa` solo incluye `src/**`, así
  que los 18 de `protocoloAlertas` y los 12 de shoplogix tampoco corren. Deuda preexistente; se corren
  a mano con `node --test`.
- ⚠⚠ **Toda function nueva: `region` explícita, o el deploy queda ROJO con las funciones andando.** Un
  `onDocumentCreated('col/{id}', fn)` **sin `region`** lo crea firebase-functions v7 en la región de la
  BASE DE DATOS (`southamerica-west1`). Las funciones quedan operativas pero el deploy falla con *"could
  not set up cleanup policy in location southamerica-west1"* → **exit 1**: CI en rojo con todo
  funcionando, la peor combinación porque esconde el próximo fallo de verdad. Fix: forma con objeto
  `{ document, region: 'us-central1' }`. Y **hubo que borrar a mano la función de la región vieja**
  (`firebase functions:delete <fn> --region southamerica-west1 --force`), porque cambiar de región
  implica borrar+crear y el CI corre `--non-interactive` sin `--force`.
- **Verificación mirando, no solo asserts**: `__tests__/previewMensajes.js` imprime los 7 mensajes
  renderizados para revisar la redacción antes de soltarla al grupo. Ahí se confirmó que "más pescados
  con las mismas correcciones" NO dispara alerta, porque compara **tasas** y no totales — un test que
  solo mirara el total habría dado un falso positivo.

---

## Perilla 5 · módulo BAADER 142 en Aprendizaje · 2026-08-08

**Entregas** (PR #402 y dos siguientes): módulo `/aprendizaje/perilla-5` (patrón Variadores) con vista
`herramienta` (embed HTML standalone) y vista `protocolo` (13 contadores, tasas /1000 en vivo,
tendencia Chart.js, guardado en `baader142Protocolo`) · visor con pinch-zoom, paneo y anotaciones sobre
las figuras · notas compartidas en Firestore, tema claro/oscuro y menos cascarón.

- **Máquinas: `baader-n1` (antigua) / `n2` / `n3`**, orden confirmado por Orel. **Umbrales 5/30/100
  etiquetados "criterio interno de Mantención ANTARFOOD"** (sin respaldo de manual, regla del PR #310);
  el resto citado a §22.4 / runbook E8xx.
- ⚠ **Índice compuesto (plantId, maquina, fecha desc) + `createdAt`**: sin él la query de lecturas
  devolvería `[]` **en silencio**.
- ⚠⚠ **Bug de encoding que casi se publica**: ensamblar el HTML con
  `Get-Content | Set-Content -Encoding UTF8` en **PowerShell 5.1** dejó BOM + **284 caracteres en
  mojibake** (`alcanzÃ³`, `SOLUCIÃ³N`) — visible en pantalla, invisible para tsc/eslint/tests, y el
  archivo quedó mixto. **Regla: ensamblar SIEMPRE con Python `io.open(encoding='utf-8')`, nunca con
  `Get-Content | Set-Content`.**
- ⚠ **Gotcha de verificación que costó 10 min**: un **service worker viejo de otra sesión** en un puerto
  reciclado (:5174) servía un bundle sin la ruta nueva → redirect a `/login`. **Desregistrar el SW y
  borrar caches antes de verificar en un puerto reciclado.**
- **Duplicados por hash perceptual** (dHash 12×12, Hamming ≤12): **9 de las 12 "fotos de campo" de
  Telegram eran capturas de páginas del manual** ya extraídas en mejor calidad, y **dib. 64 es la MISMA
  foto que dib. 35** (BAADER la publica dos veces, págs. 41 y 85) → `ALIAS={'dib-64':'dib-35'}` para no
  romper enlaces. Aparecieron además dib. 16 y 17 (§12.3.1) que faltaban: **el grep textual no los
  encuentra porque su rótulo es solo el número dentro del cajón.** Neto 55 → **46 figuras**, HTML 2,5 →
  2,07 MB.
- **Notas compartidas vía PUENTE postMessage** (el iframe no hereda la sesión de Firebase — mismo patrón
  que `PlanosAguasPage`), en `baader142Notas`. **La foto NO va en el documento**: se sube a Storage y en
  Firestore queda su URL, porque con base64 traer las notas de todas las figuras costaría decenas de MB
  (así cada doc pesa ~½ KB). Contenido vivo, no evidencia: regla como `planoNotas`, no como
  `variadoresCambios`.
- **Las figuras conservan fondo blanco a propósito**: un dibujo técnico en negativo no se lee. El tema
  entra por `?theme=` al montar (evita el parpadeo) y después por postMessage, porque recargar el iframe
  perdería el zoom y la figura abierta.
- **"Vacío" NO se quita** (Orel preguntó): es la causa raíz de "esófago demasiado largo" y "vísceras mal
  chupadas", los defectos de corte que más reporta el operador. Sin esa sección el técnico busca en el
  motor lo que está en el ciclón. §21 del manual, verificable.
- **iPhone 16 Pro (402×874)**: safe-areas, breakpoint ≤460 px, **inputs a 16 px** (bajo eso Safari hace
  zoom solo al enfocar), tocables ≥46 px. Fotos comprimidas a WebP ≤1100 px (~4 MB → ~100 KB): sin eso
  dos fotos llenaban la cuota de localStorage. Los pins se contra-escalan (`scale(1/s)`).
- ⚠ **Bug encontrado al verificar, no en el código**: el stage centraba por flex **Y** por transform a la
  vez, así que la figura terminaba fuera de pantalla. Se ve solo mirando; los tests de estado daban todos
  verdes. Fix: canvas `position:absolute` en 0,0 y el encuadre solo con `fit()`.
- **Revisión cruzada por subagente — 5 hallazgos reales**: (1) staleness guard al cambiar de máquina (la
  respuesta lenta de N1 pisaba la lista de N2); (2) **fecha por defecto LOCAL, no UTC** — a las 20:00 de
  Chile el default caía en mañana, justo la ventana "fin de turno" del caso de uso; (3) `orderBy`
  secundario `createdAt` (semanal + pre-reset el mismo día es el caso esperado); (4) tope de `fish`
  bajado a 1M para calzar con los contadores (rechazaba lecturas legítimas); (5) los mensajes de
  guardado/error se limpian al cambiar de máquina.

---

## Ventana del turno: el arranque anticipado (FASES 1 y 2) · 2026-08-05

**Entregas**: FASE 1 (#373, lo que se AFIRMA sobre los datos) y FASE 2 (#374, el sync).

- **El hallazgo**: el turno corrió desde las 7:15 pero el Análisis lo tomaba desde las 8:00, y **las
  piezas no se pierden, se le suman al día anterior**: `2026-08-04_Turno 2` estaba guardado como 04-ago
  08:00 → **05-ago 08:00** (24 h) con 16.398 ciclos, incluyendo los 45 min de arranque de HOY. Causa:
  `fullDayWindow` consultaba 08:00 → 08:00. **No es un evento raro, es sistemático**: Filete 12 de 31
  docs (arranca 07:30), Yal 6 (07:45), Chonchi 2 (07:15).
- ⚠ **El "Programado 09:00-17:15" que mostraba la app NO venía de Shoplogix**: es un literal de
  `plantLines.ts:144` que en turno EN CURSO le ganaba a Shoplogix, desactualizado hacía días.
- ⚠ **Dos reglas que costaron una iteración cada una**, ambas encontradas por tests existentes:
  1. **NO preferir siempre el horario oficial**: en `yal 2026-08-02` el turno produjo desde las 14:00
     con el whiteboard declarando 16:15 — arranque anticipado real de 2 h 15 que solo lo observado ve.
  2. **NO unir siempre las dos ventanas**: un turno declarado 09:00-17:15 que produjo 09:05-17:02
     corrió 09:05-17:02; unir infla la ventana con tiempo muerto y empeora la disponibilidad. Regla
     final: **manda lo observado salvo que venga contaminado por el borde**, detectado por evidencia
     contra lo declarado (cabeza en el ancla / cola desbordada), **nunca por duración** — un
     `Unscheduled` real dura 16 h 48 y es legítimo.
- **FASE 2, los tres cambios de `functions/shoplogix/sync.js`:**
  1. `fullDayWindow` empieza a las **06:00**. **06:00 y no antes**: el nocturno de Chonchi termina 05:00
     y arrancar antes metía su cola en el día siguiente (el mismo problema con el signo cambiado).
  2. `deriveShiftGroups` separa por **continuidad temporal** además de por nombre: un hueco > 8 h
     significa turnos de días distintos. Sin esto, con la ventana ensanchada el "Turno 2" de ayer y el
     de hoy colapsaban en un grupo de 24 h — el bug que se veía en producción. Clave del grupo:
     `nombre + día de inicio`.
  3. **`isTruncatedHeadOfPrevWindow`**, espejo del guard de cola del #354, necesario **porque** la
     ventana se ensanchó: ahora la consulta de un día ve la cola del nocturno anterior.
- **Tests: de 104 a 138.** Las cuatro funciones del corazón del sync (`fullDayWindow`,
  `deriveShiftGroups`, `shiftDateKeyFromStart`, `currentDateKey`) **no tenían ninguno**; se escribieron
  ANTES de tocar nada (12 de 14 pasaban como red de seguridad, 2 fallaban a propósito). ⚠ **Uno de mis
  tests estaba mal, no el código**: `currentDateKey` a las 06:30 de Chile SÍ devuelve el día anterior.
  Verificación con la serie REAL reconstruida del probe (reproduce sus tres conteos exactos: 93 Turno 2
  / 102 Unscheduled / 93 Turno 1) + mutation test.
- ⚠ **`shoplogixProbe` replicaba la ventana a mano** y la copia desfasada ya había hecho que un debug
  concluyera "no hay datos" en falso. Ahora llama a `fullDayWindow`.
- ⚠ **Backfill con cuidado**: `shoplogixBackfillRange` de UN día, verificar los docs leyendo Firestore,
  y recién entonces el resto de los días contaminados. **Snapshot antes del backfill masivo.**

---

## Exportaciones ejecutivas del turno · formatos A, B y C · 2026-08-04 / 08-05

**Entregas** (#359 PNG del turno, #364/#366 PDF con el resumen como página 1, #368 comparativo de
periodo, + el botón en la vista de turno): los tres formatos del mockup aprobado por Orel.

- **Un solo modelo, dos renderers** (`graderExecutiveSummary.ts`, lógica pura que responde 4 preguntas
  EN ORDEN: cómo fue · por qué · qué hizo Mantención · qué se necesita). Si el PNG dice que el turno se
  perdió por la Baader 2, el PDF no puede decir otra cosa.
- **Canvas nativo, NO html2canvas**: el DOM real depende del tema, del CSS que soporte el parser y de
  que el nodo esté visible; para algo que se manda a gerencia es demasiada superficie de falla. Dibujo
  determinista, siempre en claro (se imprime). El PNG **no necesita ECharts**, a diferencia del PDF, que
  sí tiene un sondeo desde que el detalle pasó a pestañas (#361).
- **Decisiones de redacción**: el veredicto NOMBRA la máquina parada; los KPIs traen su contexto ("39%
  de 7 h 09 de turno"); MTTR bajo se marca OK — es el único KPI donde menos es mejor, y sin eso un turno
  malo con buena respuesta se lee como todo malo; **sin Excel del Grader lo DICE**, en vez de imprimir
  ceros que se leen como "no hubo piezas malas" cuando en realidad NO SE MIDIÓ.
- ⚠ **Bug que cazó un test**: el `lossDriver` no tenía opción "ninguna" y caía a `'ritmo'` por defecto,
  así que un turno sano al 95% afirmaba haber corrido bajo el objetivo. **Un reporte que inventa una
  pérdida inexistente es peor que uno que no dice nada.**
- ⚠ **Rompí los 16 tests existentes de `graderTurnToPDF`**: su mock de jsPDF no tenía
  `setLineWidth/setFillColor/rect/splitTextToSize`. **Un mock que no refleja la API usada da verde falso.**
- **Formato C — la decisión que ordena todo el texto**: separar lo que Mantención controla (MTTR,
  averías resueltas, micro absorbidas) de lo que no (cuántas máquinas arrancan el turno). Mezclarlos
  produce el reporte de siempre —"el mes estuvo malo"— que no dice a quién le toca hacer qué.
- ⚠ **No inventar tendencias**: con menos de 4 turnos la hoja dice que no hay tendencia en vez de dibujar
  una flecha. **Las mitades se comparan por MEDIANA, no por media**: un solo turno catastrófico al final
  arrastraba la media y daba "sin tendencia" en un mes que subió de 45% a 80%. Tabla adaptativa: hasta 12
  turnos uno por fila, sobre eso agrupa por tipo de turno **y lo DICE**; nunca se recorta en silencio.
- ⚠⚠ **MIRAR la hoja encontró 5 bugs que ningún test habría pillado**: el cierre declaraba
  "disponibilidad resuelta" con 58% de uptime; se rankeaba "más disponible" un 59% contra un 58%; el
  título decía "Agosto de 2026"; el rango repetía el mes ("1 ago - 5 ago"); y con datos reales de julio
  de Yal, un tipo de turno con UN solo registro al 0% se llevaba la etiqueta "menos disponible" del mes.
  **Banco de pruebas sin sesión en `/dev/resumen-turno` y `/dev/resumen-periodo`: el entregable hay que
  MIRARLO antes de que salga.**
- **Refactor verificado fila por fila**: al extraer las primitivas compartidas (`graderExecutiveCanvas`)
  se comparó el canvas contra el original — **2.094 filas idénticas, 0 diferencias**; la única variación
  fue +40 px de margen inferior por un desfase preexistente (los KPIs medían 108 y el dibujo avanzaba 128).
- **Costo**: las pausas no vienen en el hook del periodo (viven en una subcolección y encarecerían la
  matriz, que se abre muchas veces al día): se cargan recién cuando alguien pide el comparativo.

---

## Matriz de turnos y afinado de la vista · 2026-08-01 → 08-03

**Entregas** (#349, #351 y siguientes): la matriz reemplaza al calendario mensual · 4 fixes de uso real ·
retirado `GraderHistoricalCalendar` del bundle · la card de cuota se ve siempre.

- **Problema raíz**: el calendario usaba el DÍA como contenedor, así que un turno que cruza medianoche se
  partía en dos fragmentos, con 4 `CardKind` solo para tapar el corte. **El contenedor pasa a ser el
  TURNO**: una fila por shiftId, una columna por día, cada turno UNA celda anclada al día en que arranca.
- **`Unscheduled` NO es un turno**: es la ventana 00:00-24:00 donde Shoplogix reporta lo que cae fuera de
  las ventanas configuradas. **Decisión de Orel, reafirmada 3 veces: CERO ciclos sin asignar** → se
  atribuyen al turno más cercano (mismo día primero; si el día no tiene turnos, cruza de día), auditable
  en `attributedCycles`. Verificado en vivo: la madrugada huérfana del 02-ago (293 cic) fue al Turno 1
  Lunes del 03 (3.720+293 = 4.013 exacto).
- **Un padre = una entrada** → el doble conteo por alias (`Turno dia`→`Turno 2`) es imposible **por
  construcción**, no mitigado. Costo: 2 queries/mes + 1 por bloque Unscheduled (2-3/mes).
- ⚠ **Bug que solo apareció validando contra prod**: `2026-07-31_Turno 1` de Chonchi tiene dateKey 31-jul
  pero su producción real fue 01:34-05:11 del 1-ago — **medir el cruce start-vs-end no lo detecta**; los
  offsets se miden contra el día de anclaje (`startDayOffset`/`endDayOffset`). Además: **terminar a las
  00:00 en punto NO es cruce** (4 de 5 "cruces" de Yal-julio eran eso).
- ⚠ **"Ver turno" no hacía nada**: navegaba a `/analisis-grader?date=…&shift=…&autoload=1` pero ya
  estábamos EN esa ruta → React Router no remontaba nada. La ruta canónica de detalle es
  `/analisis-grader/turno/:dateKey__:shiftId`.
- **"Turno 1 Lunes"**: Shoplogix pega el día de la semana a algunos shiftId. `displayShiftName()` quita
  **solo** el sufijo de día; **el shiftId crudo se conserva intacto** porque es la clave de Firestore y
  lo que va en la ruta. También en el `aria-label`, que decía algo distinto a la pantalla.
- **Vista Lista retirada** ("no la entiendo"). En pantalla angosta la matriz hace scroll horizontal: se
  ve menos mes, pero lo que se ve es cierto.
- **`GraderHistoricalCalendar` (5.756 líneas) borrado**: ya no se montaba pero seguía entrando al bundle
  por imports estáticos, y `AnalisisGraderUploadPage` sí lo montaba en una rama **inalcanzable** — código
  muerto en runtime, peso vivo en el bundle. Medición: el chunk `AnalisisGraderWizardPage` pasa de
  **481 kB** (medido por curl al bundle publicado en prod) a **344 kB** — **−137 kB, −28%**.
- ⚠ **Efecto colateral cubierto al borrar**: el calendario era el ÚNICO emisor de
  `graderSelectionStore.setSelectedHistorical`, que consume `AnalisisGraderGatesConfigPage` para calibrar
  el peso medio. Sin reemplazo esa página caía a su fallback **en silencio**. Ahora lo emite
  `GraderShiftPeriodContainer`.
- ⚠ **Regla que deja el caso de la card de cuota**: `ShiftQuotaCard` hacía `return null` sin cuota y sin
  permiso, así que **la función entera parecía no existir** — nadie sabía que había cuota por turno.
  **Un `return null` por permisos esconde la FUNCIONALIDAD, no solo el control**: si el usuario no puede
  actuar, mostrar el estado y quién puede.
- **Salto de layout** al seleccionar un turno: alto reservado con `min-h`, medido en el navegador (delta 0
  en el panel, en `scrollHeight` y en la posición de las celdas).

---

## Sueltos de agosto que valen por el gotcha · 08-01 → 08-05

- ⚠ **Leyenda del gráfico de ritmo tapada por las líneas** (`ProductionRateLineEC`): `legend.top: 0` con
  `grid.top: 6`. **ECharts NO reserva el alto de la leyenda solo**, así que la leyenda se dibujaba ENCIMA
  del área y las líneas pasaban por detrás del texto. Fix: `grid.top` 6→22 y contenedor 120→142 px (el
  área de datos pasa de 114 a 120: el gráfico **no** se achica). `UpstreamMachinesPanel` ya lo tenía bien.
- ⚠ **El botón de encuadre del eje no hacía nada (bug propio)**: el panel resuelve su ventana con una
  prioridad —(1) zoom, (2) bounds del snapshot Shoplogix, (3) prop `shiftWindow`— y el encuadre viajaba
  por el prop, así que los bounds del snapshot (08:00→08:00, las 24 h de Filete) le ganaban siempre. El
  chip cambiaba de estado y el eje seguía clavado. **No se detectó antes porque se verificó el TEXTO del
  chip y el prop, no el eje que realmente dibuja el chart.** Como **ECharts pinta en canvas** no había
  forma de leer el eje desde fuera → el contenedor expone **`data-axis-start/end`** con el rango
  EFECTIVO, y con eso la verificación es real y automatizable. La prioridad se extrajo a
  `resolvePanelWindow` (pura y testeada). Después el estado pasó de booleano a override de 3 valores
  (`auto`/`produccion`/`turno`), porque en Yal y Chonchi el chip aparecía pero no hacía nada: la
  heurística decía que no hacía falta acotar. ⚠ **El chip anunciaba un rango distinto al dibujado**
  (decía "14:45–00:00" mientras el eje era 15:15–23:09) → la etiqueta sale de la ventana RESUELTA.
- **Primer turno real de Filete (01-08)**: 240 pz de 5.000 (4%), 22 min de uptime, velocidad máxima real
  7,2 pz/min contra objetivo de 20, 16 paros (11 micro). Fue arranque, no producción. **Shoplogix YA
  acota el turno de Filete** (08:00→14:45, no las 24 h de antes). ⚠ **`scrapReasons` volvió VACÍO con
  producción real → se descarta la Calidad automática en Filete**; su OEE se queda en A×R. 0 de 16 paros
  trajeron causa del sensor → el panel de causas dictadas es la única vía.
- ⚠ **`shortMachineName` renombraba a "Baader N" cualquier máquina terminada en número**, así que la
  Baader 200 —que Shoplogix llama "Linea 1"— aparecía como "Baader 1", confundiéndola con las 142. Ahora
  solo traduce evisceradoras. Mismo patrón: `DayTimeSummaryBar` decía "las 3 Baader" también en Filete.
- ⚠ **`endBriefSentAt` se estampa en el claim ANTES de evaluar el umbral de piezas**: marca "procesado",
  no "enviado". El turno de 180 pz quedó marcado pero NO se mandó brief (180 < 200) — comportamiento
  correcto, nombre de campo engañoso.
- **Barrido de worktrees y ramas: 141 ramas → 11, 6 worktrees → 3** (+ PR #324).
  ⚠ **El criterio obvio NO sirve**: como el repo mergea con **SQUASH**, los commits de la rama no quedan
  como ancestros de main (`git merge-base --is-ancestor` da falso y `git cherry` marca todo como ausente
  por patch-id distinto). **El criterio correcto es comparar el SHA local de la rama contra el
  `headRefOid` del PR** (`gh pr list --state merged --json headRefName,headRefOid`): si coinciden, todo
  su trabajo entró; si difieren, la rama AVANZÓ tras el merge y hay commits sin publicar. **Ese criterio
  evitó borrar trabajo en curso**: 4 ramas habían avanzado tras su merge, entre ellas
  `fix/b142-diagnosis-overrides` con un fix que aún no estaba en main.
  Gotchas de worktree: (a) `git worktree remove` deja atrás los archivos no versionados y falla si un dev
  server tiene la carpeta tomada (hubo que matar un Vite en :5173 vivo 12 h después del merge); (b) **para
  correr los tests en un worktree hace falta `.env.local`** (no está en git) o 7 archivos fallan con
  `auth/invalid-api-key` — parece un fallo del cambio y no lo es; (c) si se enlaza `node_modules` con un
  junction, **quitar el junction ANTES del `rm -rf`** o se borra el `node_modules` real a través del enlace.
- **Checklist de escalabilidad SaaS** (#254, solo docs): `.ai/CHECKLIST_ESCALABILIDAD_SAAS.md`, con el
  diagnóstico con evidencia (índices Firestore parciales, `onSnapshot` sin `limit()` en
  incidents/photoEvidence, 0 try/catch en `incidents.ts`, sin monitoreo de producción, functions sin
  `minInstances`, sin rate limiting en rules). Conclusión: esta PWA (uso interno, una planta) no lo
  necesita hoy; el checklist queda para proyectos futuros con más usuarios.

> **Compactado el 2026-07-30, el 2026-08-13 y el 2026-08-18.** Las entradas anteriores al
> 2026-08-01 están resumidas en bloques temáticos más abajo; las del 2026-08-01 al 2026-08-10, en
> el bloque inmediatamente anterior. El detalle completo de cada una vive en git
> (`git log -p .ai/WORKLOG.md`, y en los commits de cada PR) y en `.ai/backups/`.
> Los pendientes que seguían abiertos se consolidaron abajo — no se perdió ninguno.

---

# Historial resumido (anterior al 2026-08-01)

Bloques temáticos. Cada uno resume varias entradas; el detalle está en git
(y en `.ai/backups/WORKLOG-2026-08-13-pre-compactacion.md` para julio 19–30).

## 2026-07-29 → 2026-07-30 · Filete en vivo: conexión Shoplogix, gráficos pz/min y OEE de área

- **Filete conectado a Shoplogix** (PR #286): nuevo `plantSlug` `filete` con la única máquina
  instrumentada del área (Baader 200 de Línea 1); sin Grader aguas abajo → OEE queda en A·P.
  Copy parametrizado por `machineKind`/`kpiScopeNote` de `plantLines.ts`. Primer dato real:
  2026-07-28 "Turno Dia" = 59 ciclos. **Gotcha**: Filete nombra su turno **"Turno Dia"** (sin
  tilde), distinto de Chonchi (T1/T2) y Yal (T1/T2/T3); el calendario y el resumen del mes
  dejaron de comparar contra listas fijas y ahora descubren los turnos reales desde los docs.
- **Causa de los paros del sensor** (dictado por voz): las causas van a `paros` con
  `origen:'shoplogix'` y doc id determinístico `sensorStopKey(...)` (re-anotar corrige, no
  duplica). **Gotcha doble conteo**: `LineOeeCard` filtra `origen !== 'shoplogix'` porque esos
  minutos ya los descuenta la Disponibilidad del sensor. El sync además guarda lo que antes se
  descartaba: `targetRate` por intervalo, `uptimeCycles`/`scheduledCycles`, `scrapByReason`.
- **Gráfico pz/min real vs objetivo**: objetivo NOMINAL = máximo por bucket (el primer bucket
  con expected>0 es parcial y miente: daba 5 cuando el real era 20). Separa "no da el ritmo"
  de "estuvo parada".
- **Encuadre y encoding del gráfico**: eje acotado a la operación real
  (`effectiveProductionWindow`/`shouldFrameOnProduction`) a nivel de PANEL porque el Gantt y el
  gráfico comparten eje; barras por tramo con huecos donde no hay dato; agrupación a 15 min si
  el rango >4 h. `rateChartMode(machineCount)`: **1 máquina → barras, 2+ → líneas** (3 series
  en barras son una reja ilegible). **Gotcha ECharts**: `setOption` MERGEA por defecto — para
  apagar una serie no se saca del array (no la borra), se dejan sus DATOS en null
  (`gapSeriesData`) y el `stack` queda fijo.
- **OEE del ÁREA** (`areaOeeCompute.ts`): máquina instrumentada + etapas sin sensor (la GEA).
  **Regla anti doble conteo**: un paro de etapa solo suma tiempo si NO detuvo la máquina (si la
  detuvo ya está en el downtime del sensor y va como causa). Sin Grader, el OEE se muestra como
  A×R con chip rotulado, no fingiendo calidad 100%.
- **Target de planificación de Filete**: 5.000 pz/turno en `shiftTargetPieces` (`plantLines.ts`)
  con espejo `PLANT_SHIFT_TARGET_PIECES` en functions; si llega target oficial del rollup, ese
  GANA. `machineShortLabel` sale del MODELO (B200/B142/HG/KN), no "Ev 1".
- **Alertas/brief de Filete**: `notifConfig.js` en 3 capas (DEFAULTS → overrides por planta →
  Firestore); `shiftEnd.minPieces` 200 en Filete (un lote de prueba de 59 pz disparaba brief).
  El brief muestra "Operación real: HH:MM → HH:MM" cuando la ventana del turno es ≥25% más ancha,
  y cruza paros del sensor sin causa anotada vía `sensorStopKey`.
- **Crones arreglados** (PR #292): `main` protegido (check "build" + `enforce_admins`) rechaza
  toda escritura directa — `Daily Sync` perdió el `schedule` (`version.ts` se sincroniza vía
  `prebuild` y `dev`), NanoBanana sube a la rama sin protección `nanobanana-assets`.
- **Enzunchadora TP-6000 poblada** (PR #296): 9/9 máquinas del Centro de Aprendizaje. El manual
  SÍ existía en OneDrive (la búsqueda vieja fallaba por buscar "N2" en vez de "TP-6000").
  `seed-quiz-maquinas.js` ganó `--only=<slug>` para no pisar quizzes editados desde admin.

## 2026-07-30 · Auditoría de contenido: 9 críticos + 43/43 medios cerrados (PRs #301–#320)

Workflow `verificar-contenido-fichas` (26 agentes) auditó las fichas contra los manuales fuente;
se cerró TODO: 9 críticos (PR #301, uno de seguridad: LOTO antes de activar flippers en Marel HG)
y 43/43 medios en 8 tandas (#305 Enzunchadora, #306 Marel HG, #308 Fishken, #310 Grader,
#312 Baader 142, #314 Detector de Metales, #317 Marel Filete, #320 Baader 200). Cada corrección
cita página del manual. Gotchas y decisiones que sobreviven al arco:

- **Criterio de fuentes**: choque planta vs OEM → se conserva el valor de planta como valor de la
  medida y la cota del OEM va como nota con página. Umbrales sin respaldo documental → se retiran
  o se etiquetan "criterio de planta" (no se inventan).
- **Baader 200 lee su contenido de Firestore** (`baader200-sections`, 23 docs) en producción; el
  `.ts` es solo fallback → toda corrección va a AMBOS, con snapshot previo y verificación de
  paridad por script.
- **Superficies duplicadas**: el verificador-web encontró repetidamente contenido corregido en el
  JSON pero viejo en tagline / Consulta rápida / quiz / `*Learning.ts` → al corregir una ficha,
  sincronizar TODAS sus superficies.
- **Identidades confirmadas en planta**: Detector de Metales es **Vistus** (no IQ4, manual
  `845_BA_Vistus`); el equipo de Filete es **M-Weigher WTR (GR8251)** con indicador M6410, NO una
  línea SmartLine — se eliminó hardware inexistente (descarga, brazos, lotes).
- **`learningContent/baader-142/diagnosis` NO se borró**: los 10 docs venían etiquetados como
  "muertos" pero al LEER el contenido antes de borrar resultó conocimiento de planta escrito a
  mano (ids `diag_<timestamp>_<random>` de `saveDiagnosis()`, datos que el seed no tiene: bomba
  SB 1100D0, E777 desglosado esporádico vs recurrente, agrupación por síntoma del operador).
  Decisión de Orel: enfoque overrides (rama `fix/b142-diagnosis-overrides`), no migrar-y-borrar.
  **Lección**: leer el contenido antes de borrar; ids de editor admin + datos ausentes del seed =
  contenido humano, no basura.
- **Marel HG sí tenía huérfanos peligrosos**: 2 procedimientos en Firestore que la app nunca
  despacha (el dispatch devuelve seed puro), uno era la versión PRE-LOTO de activar flippers →
  borrado REAL (no `_deleted:true`, esa convención es solo para tapar docs que el seed publica)
  + 6 imágenes duplicadas en Storage. Snapshots en `_snapshots/` antes de todo.
- **Hallazgos de contenido con impacto operativo**: mapeo X de "E 8 N X" de la B142 estaba
  invertido (1=SM1 Centraje, 2=SM2 Cuchilla, afecta E801–E865); E770–E775 solo existen con
  Upgrade Kit (CONDICIONAL, confirmar en planta); ±20 g del Grader es desviación estándar, no
  tolerancia; comandos de capacho/flipper del Grader eran rangos solapados (tipear 141 activaba
  el flipper 5 en vez del capacho).

## 2026-07-19 → 2026-07-26 · Power BI, fix congelamiento Shoplogix, sistema agéntico, cascada de pérdidas

- **PR #251 (URGENTE) — turnos EN CURSO se congelaban** tras la 1ª escritura: `isShiftAlreadyFrozen`
  comparaba `scheduledEnd` (wall-clock-as-UTC) contra `now` (UTC real) → `closedForMs` inflado +4 h
  → todo turno con una escritura se congelaba. Fix: convertir con `chileUtcOffsetHours()` antes del
  freeze check. Self-healing al desplegar. **Gotcha recurrente**: cualquier comparación de tiempos
  Shoplogix debe convertir wall-clock-as-UTC antes de mezclar con relojes reales.
- **Power BI**: export Grader (`fact_grader_turnos`/`p0_causas`/`calibres`) + fix `plantId`
  hardcodeado; botón admin `/admin/powerbi-export` con doc de control `powerbiExport/chonchi` y
  agente del PC (`agente_powerbi.py`, tarea programada c/15 min) que exporta CSVs y dispara el
  refresh del dataset (PRs #250, #252). Ciclo E2E verificado en Power BI Service.
- **Cascada de pérdidas + ventana efectiva** (fase 1 y 2): `syncDay` guarda
  `effectiveStart/effectiveEnd` en el doc padre; `lossBuckets.ts` clasifica causales por dueño
  (planificado/externo/mantención/sin-clasificar), calcado de los reasons reales de julio;
  "Cascada del mes" como pestaña default de la Vista panorámica (0 reads extra, desde
  `stateAggregates`). Motivo: `shiftRuntime` incluía colación en el denominador → uptime injusto.
- **`checkShiftReconciliation`** (CF, cron 30 min): re-verifica el turno +3 h y +24 h después del
  brief; si el total cambió >20 pz o >3% → alerta Telegram "🔄 Corrección Shoplogix" + badge en
  el calendario.
- **Sistema agéntico** (2026-07-26): 3 subagentes globales model=sonnet (`verificador-web`,
  `implementador-patron`, `cerrador-pr`), skill `mockup-antes-de-construir`,
  `scripts/firestore-snapshot.js` (list/dump/restore, dry-run por defecto) como red de seguridad
  antes de escrituras masivas, y el workflow `verificar-contenido-fichas.js` (el que después
  produjo la auditoría de arriba).
- **Componentes del equipo con fotos reales** (PRs #278–#283): 10 fotos con hotspots numerados
  clicables + zoom/paneo, migradas a Firestore con editor admin clic-para-agregar. **Gotcha**:
  `object-fit:cover` con altura fija recortaba la foto y desposicionaba los hotspots → usar
  `aspectRatio` real de cada imagen.
- **Calendario Grader**: tooltips tap+hover (los `title=` nativos son invisibles en móvil),
  footer "Σ 24h" por celda sin doble conteo.

### Sueltos que quedaron abiertos al compactar (2026-08-13)

- Marel Filete: 5 secciones de manual en Firestore (`learningContent/marel-filete/manual`, ids
  100–104) mezclan contenido WTR con SmartLine viejo — requiere decisión; la pregunta 1 del quiz
  en producción sigue vieja hasta re-sembrar.
- B142: al mergear `fix/b142-diagnosis-overrides`, revisar solapes de los 10 docs con el seed;
  confirmar en planta si esta 142 tiene el Upgrade Kit (E770–E775).
- Grader: capacho 3 transcrito "130" tal cual (probable errata) — verificar en máquina.
- Extender "Componentes del equipo" (fotos + hotspots) a las otras 8 máquinas.

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
