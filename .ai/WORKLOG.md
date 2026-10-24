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

## 2026-10-24 · cerrador-pr · Clon HMI GEA PowerPak (PR #1318)
- Hecho: simulador del HMI B&R de la GEA PowerPak 50520184, 35 pantallas, ayuda por parámetro (168 manual, 57 deducidas, 18 por confirmar), buscador, esquema de Producción. Ruta `/aprendizaje/hmi-gea`.
- Verificación: tsc 0, eslint 0 errores, vitest 4029 ok, dev server dentro del iframe.
- Estado: HECHO
- Sigue: fotos faltantes de pantallas; confirmar en terreno los 18 parámetros.

## 2026-10-21 · Claude · Repuestos: favoritos por equipo (se suman a los globales)
- Hecho: con un equipo seleccionado en el hub aparecen los chips «Favoritos (todos)» (el de siempre, renombrado) y «Favoritos de este equipo N» + uno por lista con nombre del equipo; tocar filtra la tabla. Cada fila trae un botón de lista (44 px) y el panel de detalle un ítem «Favorito de este equipo…»; ambos abren `FavoritosEquipoSheet` (marcar, poner en listas, crear lista). Los globales (`repuestoFavs`, `useRepuestoFavoritos`, listas globales) no cambian.
- Modelo: `user_preferences/{uid}.repuestoFavLists[equipKey] = {name, repuestoIds}[]` (el campo de 2540bad2). Clave de equipo = `selectedEquipMachineId` (id del nodo = `r.equipos[].machineId`); repuestos = `rowKeyDeRepuesto`. «Favoritos de este equipo» = unión de listas; la estrella del equipo escribe en la lista «Favoritos». Migración EN LECTURA de las listas viejas (`utils/repuestos/favoritosEquipo.ts`): `inv-<SAP>`→SAP, id estático `baader-142-…-<fab>`→`fab:<fab>` (puede calzar con más de un SAP), docId borrado se conserva sin calzar. No se borra nada; al primer cambio se guarda traducido solo esa clave.
- Datos: `scripts/favoritos-equipo-grader.js` (dry-run por defecto, `--write`, idempotente) agregó «Sensores» (3300103452, 3300133489, 3300133488) al nodo `uLtr5iGJPmaDgiODrdJv` (CONJ BALANZA ESTATICA "STATIC GRADER") del usuario sIXdQHw0q8aCxJk90WSeryszQoO2. `saveRepuestoFavLists` ahora hace merge profundo de esa clave (antes leía y reescribía todo el mapa).
- Archivos: hooks/repuestos/useRepuestoFavoritosEquipo.ts, utils/repuestos/favoritosEquipo.ts, components/repuestos/FavoritosEquipoSheet.tsx, RepuestosAreaHub.tsx, RepuestoDetailPanel.tsx, services/userPreferences.ts + 2 tests.
- Verificación: vitest, tsc, eslint; hoja revisada en PC claro y celular oscuro con un arnés aparte (la app exige login, no se pudo recorrer el hub real).
- Estado: EN REVISIÓN (PR feat/favoritos-por-equipo)
- Sigue: probar el hub real con sesión (chips con las listas de BAADER 142 y Grader).

## 2026-10-14 · Claude · Cierre de merges: repuestos con dibujo propio (#1274) y rutas de inspección R-MAN-CH-004 (#1178)
- Hecho: PR #1274 «feat(repuestos): cada máquina muestra su propio dibujo del manual», mergeado squash (commit c47a2fd2); build verde y deploy de la PWA completado OK. PR #1178 «Rutas de inspección: las 7 áreas del registro R-MAN-CH-004», rama actualizada contra main, build verde, mergeado squash (commit 70a47a7d); deploy de reglas Firestore (agrega `rutasInspeccion` y `recorridos`) y deploy de la PWA completados OK.
- Verificación: prod sirve `version.json` 4.2.0 con build del 2026-10-14.
- Estado: HECHO
- Sigue (PRs abiertos): #1272 falta prueba en terreno (Outlook PC + compartir con fotos desde celular; comparte `RepuestosAreaHub.tsx`); #1273 falta prueba en iPhone real; #1134 listo pero mueve números ya mostrados, avisar a gerencia antes de mergear; #1159 draft, NO mergear sin rol IAM.

## 2026-10-07 · Claude · HMI Knuro: ayuda de campos opción B (globo PC + lista y hoja celular)
- Hecho: globo anclado al campo en PC (≥768 px) y lista + hoja inferior en celular, con chip de origen (Manual · pág. N / Deducido / Sin dato) y Predeterminado → Actual. Íconos en los 178 campos (antes 30 sin ícono: 2ª columna de c1pr/c1p2/h2pr y vac-b-0..11). Fix: cambiar de preset ya no borra los íconos (applyPescRows tocaba textContent).
- Seguridad: el texto de los globos se sanea a lista blanca `<b> <i> <br>` sin atributos antes de cualquier innerHTML (globo, hoja, lista), también en la página pública sin login. El iframe solo acepta mensajes del padre same-origin.
- Decisión clave de edición: la clave vive en `hmi-knuro-config/tooltip-pwd`, que es de lectura pública, así que mandarla al iframe no protegía nada. Ahora HmiKnuroPage (tras AdminRoute; Firestore exige isSupervisor para escribir `hmi-knuro-tooltips`) manda `canEdit:true` en `hmi:init` y no la clave; se quitó `hmi:save-pwd`. La pública manda `readonly:true` y nunca recibió ni recibe clave. El iframe borra la copia que dejaban versiones anteriores en localStorage y ya no siembra `'admin'`. Standalone (abrir el .html directo, guarda solo en localStorage) pide definir una clave la primera vez.
- Archivos: apps/pwa/public/hmi-knuro-embed.html, pages/HmiKnuroPage.tsx, pages/HmiKnuroPublicPage.tsx.
- Verificación: tsc 0, eslint 0 en los .tsx, vite build OK, Playwright a 1280 y 375 px en claro y oscuro (globos de h2-2as-epv-0, c1pr-1, vac-b-4, ev-0 sin tapar el campo; lista con filas de 58 px; hoja al 58 % con el campo visible arriba), inyección `<img onerror>` mostrada escapada y sin alertas.
- Estado: EN REVISIÓN (rama feat/hmi-knuro-globos-ayuda)
- Sigue: probar la edición en la página admin con sesión de supervisor. Fuera de alcance: `tooltip-pwd` sigue legible por cualquiera (TrashPanel y Ajustes la usan como clave) y `getHmiTooltipPwd` devuelve `'admin'` si falta; en la pública, cambiar de preset navega a `/learn/…` y cae en login.

## 2026-09-30 · Claude · Repuestos: cuadre del maestro y la bodega con el stock SAP del 29-09
- Hecho: el planificador de Mantención mandó «REPUESTOS CHONCHI 29-09.xlsx» (export SAP, centro AI04, almacén M001, 7 hojas por marca, 1.317 SAP). Script `scripts/cuadrar-sap-29-09.js` (dry-run + `--write`, ya corrido en prod con snapshots previos `_snapshots/repuestos__2026-09-30T22-49*` y `bodega__2026-09-30T22-49*`): 398 fichas actualizadas (338 renombradas al nombre SAP, el viejo pasa a `alias` solo si no nombraba otra pieza; 175 códigos de fabricante, 203 valores y 480 unidades completados), 247 SAP enlazados a fichas de despiece por código de fabricante (29 de ellas piezas repetidas en 142 y 200, fusionadas en una ficha con los equipos de ambas), 285 fichas nuevas (id = SAP, sin equipo, `origen.de: ['sap-export']`), 529 stocks de bodega puestos al valor SAP con movimiento `ajuste` trazable (`realizadoPor: script:cuadrar-sap-29-09`), 153 docs de bodega nuevos. Copia del Excel con tildes reparadas en `OneDrive\ANTARFOOD\INVENTARIO\`.
- Archivos: scripts/cuadrar-sap-29-09.js, _snapshots/cuadrar-sap-29-09__plan.json (plan completo con antes/después).
- Verificación: lectura posterior de fichas nuevas, renombradas (historial `textoBreve`), enlace, fusión y bodega con movimiento; `99-stats-maestro`: 7.952 docs, 4.392 con SAP, 2.408 SAP con stock. Los SAP de la BAADER 200 inventariados el 25-09 cuadraban exactos con SAP antes de escribir.
- Estado: HECHO (datos en prod)
- Sigue: 24 SAP cuyo código de fabricante ya tenía OTRO SAP en el maestro quedaron como ficha aparte (ver `plan.conflictos`); 1.069 SAP con stock en la app que el export no trae (pedir export completo del almacén M001); 3.195 SAP sin equipo asignado.

## 2026-09-23 · Claude · Correo de bitácora: dos bloques y eventos en tabla (ronda 5)
- Hecho: la bitácora abre con su propia banda azul («Bitácora de Mantención · Planta»), la misma de la planilla, y entre los dos bloques va aire + raya de tinta. Cada evento es una tabla propia con cabecera celeste (número · equipo · hora a la derecha) y el desglose debajo (tipo y N° de equipo, impacto, texto, repuestos, técnicos, fotos). Opción A del mockup elegida por Orel.
- Archivos: services/bitacora/bitacoraCorreo.ts + 3 tests (estandar, repuestosEvento, whatsappYEvento).
- Verificación: vitest 306/306, tsc, eslint; render Playwright a 760 px normal, «aplanado» simulado y 375 px (el desglose mide 350 px con dos fotos: cabe en el teléfono).
- Estado: EN REVISIÓN (PR)
- Sigue: test 5 de Orel desde el PC del trabajo.

## 2026-09-23 · Claude · Correo de bitácora: pulido de estructura (ronda 4)
- Hecho: cinco ajustes para que cada elemento quede separado y legible en cualquier compositor. Planilla MTTR: «Falla» se corta en palabra completa y «Observaciones» dice solo qué se hizo y si quedó pendiente (los repuestos con SAP y el impacto se leen en el detalle). Rótulo de foto solo cuando es Antes/Después. Evento sin equipo ni título ya no repite el tipo («Mejora / Mejora»). Filete sobre el rótulo de cada sección (aguanta el pegado que aplana). Línea «MTTR x · MTBF y» en negrita antes de la explicación.
- Archivos: services/bitacora/{documentoCorreo,bitacoraCorreo,recoleccionMttr}.ts + recoleccionMttr.test.ts.
- Verificación: vitest 306/306, tsc, eslint; render normal y «aplanado» simulado lado a lado.
- Estado: EN REVISIÓN (PR)
- Sigue: test 5 de Orel desde el PC del trabajo. Descartado: 3 fotos por fila en PC (3×156 supera los 351 px del teléfono).

## 2026-09-23 · Claude · Correo de bitácora: jerarquía que sobrevive al pegado que aplana
- Hecho: el Outlook nuevo con «Combinar formato» (predeterminado en cualquier PC ajeno) borra todo font-size/color al pegar; solo respeta <b>, <i>, <small> y fondos de celda (medido en Outlook web). Ahora cada nivel lleva doble señal: título en <b>, secundarios en <small>, cifras en <b> + <small>; cabecera de la planilla celeste con texto tinta (blanco sobre azul quedaba negro sobre azul). Texto de ayuda del panel Correo actualizado.
- Archivos: services/bitacora/{documentoCorreo,bitacoraCorreo,recoleccionMttr}.ts, pages/BitacoraTurnoPage.tsx + 5 tests.
- Verificación: vitest 306/306, tsc, eslint; render normal y «aplanado» simulado lado a lado.
- Estado: EN REVISIÓN (PR)
- Sigue: test 5 de Orel desde el PC del trabajo (Outlook nuevo con «Combinar formato»).

## 2026-09-23 · Claude · Correo de bitácora: sobrevivir al pegado desde el iPhone
- Hecho: el compositor de Outlook iOS reescribe el HTML al pegar (estilos calculados, sin atributos, sin imágenes remotas). Tablas sin `width:100%` (las fijaba a 680 px), colores de la planilla por tres vías (`background-color`, `bgcolor`, `<font color>`) porque borraba el blanco de los títulos y las bandas celestes.
- Archivos: services/bitacora/{bitacoraCorreo,recoleccionMttr}.ts + test.
- Verificación: vitest 306/306, tsc, eslint; render 390/900. Pendiente: pegar de nuevo desde iPhone (normal e «incrustadas») y desde PC.
- Estado: EN REVISIÓN (PR)
- Sigue: si el iPhone sigue botando las fotos, el camino es que la app MANDE el correo (Graph) o adjunte el PDF.

## 2026-09-23 · Claude · Correo de bitácora que quepa en el celular
- Hecho: fotos de a dos de 156 px, evento en dos celdas con la hora en la línea de datos, cifras de a tres, planilla MTTR de un día sin columna Fecha (la fecha va en la banda). Causa: el teléfono encoge el correo al elemento más ancho (≈650 px fijos contra 351 útiles) y Word borra `vertical-align` (sobrevive `valign`).
- Archivos: services/bitacora/{bitacoraCorreo,documentoCorreo,recoleccionMttr}.ts + 4 tests.
- Verificación: vitest 306/306, tsc, eslint; render a 390/680 px con Playwright. Falta la prueba real: correo del turno abierto en el teléfono.
- Estado: EN REVISIÓN (PR)
- Sigue: si en el teléfono sigue apretada la planilla, evaluar quitarla del cuerpo (va adjunta en .xlsx).

> **Compactado el 2026-10-14** (cuarta vez; las anteriores: 2026-07-30, 2026-08-18 y 2026-09-17).
> - **Enteras, arriba y la más nueva primero:** las entradas del 2026-10-07 en adelante.
> - **Resumidas por tema** (gotchas, causas raíz, decisiones con su porqué, cifras y pendientes): 2026-09-15 → 09-22 (esta vez); 2026-09-01 → 09-12, 2026-08-11 → 08-26, 2026-08-01 → 08-10 y lo anterior (antes).
> - Respaldo del archivo previo (266 KB) en `.ai/backups/WORKLOG-2026-10-14-pre-compactacion.md`; el detalle entrada por entrada vive en git (`git log -p .ai/WORKLOG.md`).
>
> **Regla:** cada entrada nueva va ARRIBA, justo bajo el encabezado de plantilla (no al final). Si el archivo pasa de ~150 KB, compactar lo más viejo del mismo modo.

# Historial resumido · 2026-09-15 → 2026-09-22

> Compactado el 2026-10-14 desde ~160 KB de entradas ronda por ronda. El detalle completo vive en git
> (`git log -p .ai/WORKLOG.md`) y en el respaldo `.ai/backups/WORKLOG-2026-10-14-pre-compactacion.md`.

## Monitor: accesos directos desde Inicio, móvil y PC (PR #1160, 09-22)
- Pedido de Orel: llegar al monitor costaba ~4 toques. Ahora Inicio lleva «Monitor <área>» (píldora «En turno / Sin turno») bajo «Principal · Eviscerado» y «Principal · Filete»; dentro del monitor, con sesión supervisor/admin, «‹ Inicio» + selector `Eviscerado | Filete`. Solo Principal (Yal no). PC: tarjeta «Monitores de línea» junto a la bitácora (`MonitorCell` movido a `components/home/`, prop `anidada`).
- `monitorDeLinea.ts`: el token sale de `createPublicShiftMonitor` modo línea (`ensureLineMonitor` REUSA el link fijo, no crea otro: `27b0e71c` Chonchi y `10e3596b` Filete, los de Telegram) y se recuerda en localStorage (`monitor-linea:{slug}`). «En turno» = `turnoEnCurso.ts`: turno arrancado, SIN `endBriefSentAt` y `lastSyncAt` < 20 min. ⚠ No sirve solo `lastSyncAt`: el re-sync horario toca turnos cerrados de ayer (medido: sync hace 7 min); tampoco `scheduledEnd`.
- El monitor se monta con `key={token}`: cambiar de línea por la misma ruta arrastraba estado local de la otra. ⚠ A 375 px «Monitor Eviscerado» partía en 2 renglones (subhead + sangría corta); `h-11` mide 37 px en móvil → `min-h-[44px]`.

## Historial de bitácora: «línea perdida» y un gráfico por pregunta (rondas 64-65, 09-19)
- **Línea perdida** (para esto se hizo el editor de líneas): 30 min parados en una de 3 BAADER cuestan su cuota (≈10 min) a Eviscerado. Bloque «¿Cuánto de eso le costó a la línea?» (gris = máquina detenida, azul = línea perdida). `pesoDeLinea.ts` (+5 tests) cruza `resumen.equiposTodos` con `pesosPorLinea`; llave `EventoBitacora.equipoId` = `NodoGrafo.id`. NO INVENTA: lo no convertible se informa aparte (`sin-ubicar`, `fuera-de-linea`, `en-circulo`). ⚠ Redondear ANTES de restar («5 min = 3 min, absorbió 3» sumaba más que el total).
- **Ronda 64, referencias en cada cifra** (regla de Orel, `feedback_reglas_analisis_datos`: «30 h sin referencia no dice nada»): dos preguntas («¿Cuánto paró la línea?», «¿Cómo trabajó Mantención?»); `useHistorialBitacora` lee el período y el ANTERIOR en una consulta; `compararPeriodos` da «▲/▼ antes X» verde/rojo según mejor/peor. ⚠ Solo si el anterior tiene ≥60 % de los turnos del actual (la bitácora parte el 15-09); parada y fallas como TASA; <5 % = «igual».
- **Ronda 65, un gráfico por PREGUNTA** (Orel: «el gráfico no explica nada»): fuera las barras por turno (30 barras = «reja») y «Equipos que más pararon». 5 paneles con pregunta gris · RESPUESTA como título · referencia dibujada: tendencia del % parado (≥10 % entre mitades y ≥4 puntos para decir «parando menos»; ⚠ el turno EN CURSO va hueco y NO cuenta en promedio), Pareto con % acumulado (rojo hasta 70 %; «Otros» nunca es prioridad), sin detener vs detenida, mediana de reparación («la mitad en X; 8 de cada 10 en Y»), fallas repetidas (2+, va PRIMERO: pide acción). `preguntasHistorial.ts` (14 tests). Siguiente: base del % desde turnos PROGRAMADOS de Shoplogix.

## Jerarquía: el aviso «hay datos nuevos» nunca funcionó (09-19)
- `useHierarchyTree` sondeaba cada 30 s en TODA pantalla que usa el árbol aunque solo `HierarchyPage` lee `hasUpdates`, y la consulta fallaba SIEMPRE: `where('activo','==',true)` + rango en `actualizadoEn` + `orderBy` exige un índice compuesto ausente de `firestore.indexes.json` → `failed-precondition` cada 30 s. Arreglo sin índice (regla de costos): un solo campo de rango + `limit(1)`, sondeo solo con `vigilarCambios: true` y cada 2 min.

## Editor de líneas de proceso (`/admin/lineas-proceso`, 09-19)
- **Origen**: Orel, «tiempo reloj no es tiempo máquina» (1 de 3 Baader = 33 % de Eviscerado); «arrastras y unes con líneas». `AdminRoute` + `RequireReAuth`; React Flow (`@xyflow/react` 12.11, chunk perezoso ~70 KB gz). ⚠ Se agregó con **pnpm**: `npm install` falla en este repo por el `prepare` de react-zoom-pan-pinch. Ruta `/dev/lineas-proceso` (solo DEV, nada se guarda).
- **Modelo** `modeloLineas.ts`: `pesosPorLinea` (Kahn): entra al 100 %, se reparte parejo en cada bifurcación (3 Baader → 33,3 %, al juntarse vuelve a 100 %); no conectado = 0 %; ciclo no inventa flujo. `propuestaChonchi.ts` deduce del árbol por NOMBRE (dudas fuera). Firestore `lineasProceso/{plantId}` (flechas `{a,b}`: no hay arreglos de arreglos); regla lectura `isActiveUser() || paseBitacoraActivo()`, escritura `isAdmin()` con topes; 117/117. Teléfono/`pointer: coarse` = SOLO LECTURA.
- **Acopio y servicios**: ⚠ **el Sistema de bombeo N2 NO se movió en el árbol**: ACOPIO (`aq-in-cho-acop`) cuelga del SITIO junto a PLANTA CHONCHI y PLANTA YAL, ubicación técnica de SAP; «Sistema 1 es de Chonchi, Sistema 2 de Yal» → `DE_OTRA_PLANTA`. Zona `tipo:'apoyo'` (violeta, punteada: estanques, pozos, RILES, caldera, freón, subestación, caseta agua mar) con flechas «abastece/recibe» que `pesosPorLinea` IGNORA (el efecto no es proporcional).
- **HIG del editor**: inspector («si se detiene 30 min = N min de línea»), deshacer/rehacer, aviso al salir, grilla 16 px. Pantalla completa: `requestFullscreen` del DOCUMENTO (⚠ no del contenedor: los avisos viven en un portal del body).
- **Contenedores**: pertenencia explícita (`NodoGrafo.zona`; `''` = ninguno; sin campo = por posición); cambios SIEMPRE confirmados. ⚠ Los nodos de `onNodeDragStop` traen `data` de la VISTA: leer la pertenencia del estado (`contenedorDeNodo`). Mover un contenedor por su título: asa manual con eventos de puntero (⚠ un nodo `draggable` recibe `nopan`) y `pointerEvents:'all'` (React Flow deja `none` a los no seleccionables).
- **Uniones**: a 37 % de zoom cada punto medía **4 px**. Agarre `28/zoom` con tope 36; durante el arrastre TODA la tarjeta es destino; modo «Unir equipos» (dos toques, encadena); dos clics muertos por #1122 (punto izquierdo como adorno).
- **⚠ LAS FLECHAS DEL EDITOR NUNCA SE VIERON: `--primary` no existe.** Color `rgb(var(--primary))`; la variable de la app es **`--brand`** → `stroke: none`: la flecha existía, se seleccionaba y borraba, pero invisible (y en `MantencionTurnoTab.tsx`). ⚠ Verificar un token con `getComputedStyle`, no con el atributo `style`. También `vector-effect: non-scaling-stroke` y avisos al rechazar una unión.
- **Un círculo de flechas dejaba todo en 0 % sin decirlo**: Acopio entero en 0 % por una flecha de vuelta (`BOMBA VACIO ANILLO LIQUIDO N2 → DUCTO SUCCION PECES SISTEMA N1`) → `PesoEnLinea.ciclo` («en círculo · hay una flecha de vuelta») y el inspector nombra la sobrante.
- **Piel** (opción «barra de reparto»; Orel RECHAZÓ ortogonal: «debe verse fluido» → bezier): tarjeta 188×68 con barra de cuota; sin borde verde/ámbar/rojo por peso (esos colores significan estado: una BAADER sana al 33,3 % parecía en falla); grosor de flecha = flujo; grupos en paralelo derivados y a mano (`grupos: GrupoParalelo[]`; ⚠ no depender de Ctrl/Mayús+clic: la multiselección no se disparó; el asa es la píldora). Flechas «como cuerdas» (`CurvaFlecha`, Catmull-Rom → Bézier). ⚠⚠ Dos trampas: **caché de Vite podrida** (lienzo sin aristas, 0 en DOM/43 en estado, sin error → `rm -rf apps/pwa/node_modules/.vite`; comprobar contra main antes de culpar al código) y **`selected` NO llega por props** a una arista propia en @xyflow/react 12 (`useStore(st => !!st.edgeLookup.get(id)?.selected)`).

## Bitácora: rondas 56-63, HIG, medición y editor (09-19; PR #1111 `339e16e`)
- **R56**: el 18-09 no hubo producción (Fiestas Patrias). `scripts/medir-bitacora.cjs` (solo lectura; hora de Chile con Intl); línea base 16→17-09: 5/15 con término, 6 registrados >2 h después, 6 con turno cerrado, mediana 31 min. Primer informe HIG completo (12 hallazgos; regla de Orel: cada cambio se revisa contra el HIG local).
- **R57** (lote 1, sin cambio visible): `navigator.storage.persist()`, Ctrl+Enter, PDF/Excel por `navigator.share` (`compartirArchivo.ts`).
- **R58** (lote 2, #1 y #2): ⚠ `horaSugeridaParaEvento` devolvía el INICIO DEL TURNO para un evento nuevo de un turno ya terminado: hora con forma real que nadie escribió y nunca «obligatoria». Nueva `horaInicioNuevoEvento()`; Guardar dice «Falta completar: X, Y, Z» (`faltaObligatorio` derivado de `faltantes`). Mutación comprobada.
- **R59** (lote 3, #5/#6/#7/#10/#11): fotos por arrastrar/Ctrl+V, `Sheet` se cierra deslizando. ⚠ `.piel-sheet-in` (fill `both`) le gana al `transform` en línea.
- **R60**: estrella de favoritos en el buscador de repuestos, combinada con el alcance; los MISMOS favoritos de Repuestos/Centro Técnico (`user_preferences.repuestoFavs`, clave SAP; cero datos nuevos);. Color #985800 claro / #FF9F0A oscuro.
- **R61** (#12, cierra el informe): el viewport tenía `maximum-scale=1, user-scalable=no` desde el release inicial (nadie lo decidió) → zoom de dos dedos en toda la app. Letra que sigue al teléfono SOLO en la bitácora: `fontSize` tailwind = `px × var(--escala-texto, 1)` (con 1 idéntico), variable en `<html>` y se QUITA al salir; iPhone `font: -apple-system-body`; Android/PC Normal/Grande 118 %/Muy grande 135 % (tope = lo revisado). **Playwright instalado** (`playwright-core` 1.63 en `C:\Users\orelc\dev\capturas`, Edge del sistema). ⚠ `waitUntil:'networkidle'` nunca llega con Vite (HMR).
- **R62**: error propio: «Falta completar: Quién lo registró» salía con ese campo LLENO (`etiquetaQuien`). **R63**: los 4 bloques de «quién» en UNA tarjeta de filas de 44 px. **Orel: «el que edita y el que registra deberían ser el mismo técnico»** → una pregunta «Técnico» (publicado = AUTOR/`registradoPor`; el «editado por» sale del nombre recordado para conservar la traza).

## Bitácora: rondas 48-55, impacto, tipo, equipo vinculado y «¿Cuánto duró?» (09-18 → 09-19)
- **R48, EL IMPACTO**: medidos 22 eventos de 4 turnos reales: **19 «No aplica»**, 2 «con parada» sin minutos, **17 sin término** → 0 min de parada, MTTR y MTBF «—»: cero evidencia, lo contrario de la meta. CAUSA nuestra: `impacto` arrancaba en `'no-aplica'` y `minutosParadaDe` sin término vale 0. Criterio de Orel: hay un escalón que la app no registraba (la goma de la tolva de riles no detiene, pero las vísceras dejan de salir y alguien las retira A MANO) → `afecta-sin-detener` + `contingencia`; 4 respuestas apiladas con ejemplo, **ninguna marcada** y obligatoria para publicar. **KPI (Orel): el escalón NO suma minutos de parada** (MTTR cuadrable con Shoplogix); el resumen gana «Siguió gracias a Mantención» (ámbar #8A5A00 en WhatsApp). Eventos viejos NO se migran.
- **R49, EL TIPO dice qué se hizo; la FALLA se deduce**: de 22 eventos, **9 «Falla» y 4 describían otra cosa**; «Planificado» y «Ajuste» nadie los usó y «Rutinario» se escribió a mano 3 veces. CAUSA: dos ejes mezclados («Falla» = qué pasó; «correctivo/preventivo…» = qué se hizo) y «Falla» preseleccionada era el cajón de sastre. «¿Qué se hizo?» sin tipo marcado; «Falla»/«Planificado» a `TIPOS_LEGADO`. **`esFalla(e)`** = (detuvo o afectó) && (correctivo o legado falla). **MTTR/MTBF corregidos (los números CAMBIAN, avisar)**: `mtbf()` divide por fallas, no paradas; MTTR = `minutosFalla / (fallasConParada − fallasSinDuracion)` (⚠ el primer intento incluía fallas sin detener: 6,67 min donde correspondían 20; lo cazó un test). ⚠ `FIJO_POR_NOMBRE` se armaba desde `TIPOS_EVENTO`: ahora desde `ETIQUETA_TIPO`.
- **R50**: «Montaje/desmontaje» ES «Rutinario» (sinónimos lado a lado) → lista final de 7; fuera «Ubicación en el turno» (**1 de 22** usó `posicionMin`). ⚠ NO se quitó el estado `posicion`: el arrastre lo sigue escribiendo y editar un evento sin hora no le borra su lugar.
- **R51**: la hipótesis «vincular al buscar» fue **MEDIDA Y DESCARTADA**: 12 eventos sin `equipoId` contra **702 nodos**: 0 coinciden (se escribe OTRA COSA: «KNURO» sin número, conjuntos «CINTAS FILETE/HG», «Linea manual HG»…). Se construyó el aviso ámbar «no quedó vinculado» (no bloquea). ⚠ No aparece con `el.blur()` por script: para foco/blur, interacción real. **R52**: Orel confirmó **HG es EVISCERADO**; creadas CINTAS FILETE, CINTAS HG y LINEA MANUAL HG (`scripts/crear-areas-conjuntos-bitacora.js --write`), las primeras áreas de NIVEL 5. ⚠ `tipoNodo:'area'` EXPLÍCITO (`createNode` no lo escribe) y `orden` empatado en 19 (contador por padre).
- **R53**: la caja de «no quedó vinculado» no mostraba planta (un técnico de Chonchi podía vincular la Baader de Yal) y buscar «BAADER» daba YAL primero → `buscarEquipos(..., { planta })` suma **+20** (> equipo +5, < empezar por el texto +100).
- **R54, «Terminó ahora» solo cuando es verdad**: de 15 eventos con inicio, 6 se registraron >2 h después. La TOLVA GENERAL RILES (parada real de 20 min, cargada 18:55) habría quedado en 7 h 55 min y el MTTR del turno pasaba de 12,5 min a 4 h. `terminoAhora()`: solo si el turno corre (holgura 1 h) y dura 1-120 min. ⚠ Diferencia CON SIGNO (`minutosEntre` da la vuelta por medianoche: un inicio futuro daba 1.437 min). Corrección a R48: el 17-09 sumaba 25 min, no 0. **R55**: «¿Cuánto duró?» (5·10·15·20·30·45·60 min, un toque pone el término) cuando «Terminó ahora» no aplica; la carga a fin de turno es la norma.

## Almacenamiento y vigía (09-18)
- **Medido antes de proponer**: bucket **2,19 GB en 2.696 objetos; fotos de la bitácora = 0,2 % (4,8 MB)**; 73 % son 836 Excel del Grader (~1,9 MB, `graderUploads/`) que nunca se releen. Gratis hasta 5 GB: hoy **cero**; se cruzan a mediados de 2027; en 2029 (~15 GB) ≈ CLP 190/mes. No amenaza el techo de CLP 20.000.
- Hecho: regla de ciclo de vida `graderUploads/` → COLDLINE a 90 días. ⚠⚠ La clase del bucket es **REGIONAL** (legacy), NO `STANDARD`: con `['STANDARD']` nunca habría disparado → `['STANDARD','REGIONAL']`; ⚠ no incluir `MULTI_REGIONAL` (la API lo toma como cambio de clase del bucket → 400). Fotos: 1600 px (Orel: «distinguir con calidad, lo más livianas posibles»), calidad 0.82→0.75, `targetBytes` 350→250 KB (336→~163 KB medido); el valor es la SUBIDA por 4G. No WebP: el correo referencia la URL de Storage y Outlook clásico no lo muestra.
- **Vigía mensual** `scripts/vigia-almacenamiento.cjs` (día 1, 09:30, Telegram solo si hay algo): techo 4/8 GB, salto >1,5 GB, huérfanas, regla puesta. ⚠ Marcaba «2,14 GB fríos» por comparar `!== 'STANDARD'` (se compara contra NEARLINE/COLDLINE/ARCHIVE). **Lanzador con respaldo** (`_HERRAMIENTAS\vigia-almacenamiento\`): si la rama no tiene el script cae a una copia (sin ella la vigilancia se cae EN SILENCIO = «todo bien»). ⚠ `functions/.env` y `serviceAccountKey.json` (gitignored) existen en el clon principal, NO en los worktrees → se buscan en REPO y luego en el principal. ⚠ REGLA: literales con barras invertidas se escriben con Write/Edit, nunca generados por otro script (3.ª vez que el escape muerde).

## Bitácora: rondas 41-47, HIG por etapas y MINIATURAS DE VERDAD (09-18)
- **R47, MINIATURAS DE VERDAD (la causa raíz)**: miniaturas rotas DESPUÉS del arreglo de la R44. Medido: 13 fotos del turno = **3.444 KB**, bitácora **4.625 KB en 18 fotos**: la lista bajaba la foto ENTERA (1600 px, ~300 KB) para pintar 48 px; por 4G con 13 en paralelo, y en iPhone ~100 MB de bitmap decodificado, WebKit deja la imagen rota. El visor pide UNA sola: por eso abría bien. La teoría del service worker (R44) NO era la causa de fondo. Al subir se guarda además `t_<id>.jpg` de 320 px (~20 KB, `thumbUrl/thumbPath`, extra con su try/catch; el borrado la deriva con `miniaturaDe()`). Backfill `scripts/backfill-miniaturas-bitacora.js` (dry-run por defecto; necesita `npm i --no-save sharp`; ⚠ por admin SDK escribir `firebaseStorageDownloadTokens` a mano). **4.625 → 328 KB (−93 %)**, ya corrido en prod. Visor/correo/PDF siguen con la original.
- **R44, BUG: miniaturas de fotos de OTROS técnicos con ícono roto** (las propias se veían; el visor mostraba todas). URLs iguales en forma (descartado permisos). CAUSA parcial: el service worker interceptaba imágenes de Storage; un `<img>` cross-origin pide en `no-cors` → respuesta OPACA, nunca cacheable, y si el `fetch` del SW rechaza queda rota para siempre (un `<img>` no reintenta). Fix: SW deja pasar `no-cors` y usa try/catch; `Miniatura` reintenta 2 veces con `&r=N`. ⚠ El SW viejo vive hasta que cada teléfono recargue con red.
- **R41, HIG aprendido en local** (Orel: «cada revisión del HIG nos come ~200 k tokens»): `ARIA_MANTENIMIENTO_PLANTA\docs\hig\` (`HIG_DESTILADO.md` ~10 KB + 31 páginas, 307 KB, solo grep), skill `/hig-apple`; las páginas salen del JSON `developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json` (la web es SPA). 15 mejoras candidatas, Orel eligió todas (R42-46)
- **R42** (etapa 1): fuera toasts de éxito redundantes; sincronización pasiva como Mail («Al día · Actualizado 14:32»); Guardar deshabilitado hasta tener lo obligatorio, Enter guarda, horas de 5 en 5. **R43** (etapa 2): primitivo `ActionSheet` (destructivo ARRIBA en rojo, `role="alertdialog"`, `z-[120]`); ⚠ Escape interceptado en CAPTURA con `stopPropagation` o cerraba también la hoja de abajo; un publicado no se autoguarda, así que cerrar con cambios los perdía en silencio. **R45** (3a): Deshacer al soltar un arrastre (`mover(id, null)`), Reduce Motion REEMPLAZA desplazamientos por fundido de 200 ms (no los apaga); ⚠ el placeholder «Buscar equipo · Planta Chonchi» era FALSO (la lista trae las dos plantas). **R46** (3b): pill «Nuevo» en el evento que llega de otro teléfono (se apaga al abrir o a 90 s); hoja oscura ya elevada (#2C2C2E sobre #1C1C1E; HIG #2C2C2E/#3A3A3C).

## Bitácora: vista PC y composición, rondas 34-40 (09-18)
- **R35, «Escritorio de turno»** (iOS 27, split de tres columnas): toolbar con UN botón relleno + cápsula `glass-nav` Historial · Acceso QR · «Compartir ⌄»; grilla `grid-template-areas` (≥1280: 300/1fr/380). **R36, vitrina con turno REAL** (`/dev/bitacora-real`, `scripts/exportar-turno-real.cjs`): ⚠ primero quedó en `public/dev/` y el build lo copió a `dist/` (se habría PUBLICADO con datos de la planta) → `dev-data/` (git-ignorado), servido por el plugin `turnoRealLocal` (`apply:'serve'`).
- **R38**: encabezado «dos ejes», fila «Dos niveles» (118-122 px vs 103-170). **Bug real en `lib/utils.ts`**: `tailwind-merge` tomaba `text-caption` por un color → `Tag` a 14 px en TODA la app; `extendTailwindMerge` con grupo `font-size` (ahora 11 px). `nombreEquipoLegible` pasa MAYÚSCULAS SAP a frase (envíos con nombre crudo). **R39**: contexto con `ListGroup`/`ListCell`. Gotcha repetido: heredoc de bash con `\n` dentro de un string de Python rompe el script → scripts con Write/Edit.
- **R34, MTBF y MTTR con definición a la vista**: la banda dice «MTBF - MTTR» y solo se calculaba MTTR; debajo va una línea con definición y cálculo. **Base del MTBF (Orel)**: horas del turno − 1,5 h sin producción (`MINUTOS_SIN_PRODUCCION_POR_TURNO = 90`: colación 1 h + reunión + ejercicios) − paradas, ÷ fallas con parada; MTBF de la PLANTA con lo registrado, aproximado y dicho así (el riguroso por máquina con Shoplogix está en Análisis de Turno, `kpisMantencion.js`).

## Bitácora: rondas 25-33, formatos de envío y planilla MTTR (09-17)
- **R33, horas corridas al pegar en Outlook**: CAUSA tablas ANIDADAS (Word no respeta `width:100%` en tabla anidada). `htmlEvento`: una fila de TRES celdas (número 36 · contenido · hora 96 px `nowrap`). **Regla del correo: NUNCA una tabla `width:100%` dentro de una celda para alinear a la derecha; usar una celda más.** Falta probar pegando en Outlook real.
- **R31/R30, correo en celular y PC**: no hay forma fiable de reglas «solo celular» en un correo pegado en Outlook (Word pisa `<style>`/media queries) → columnas en PROPORCIÓN (`table-layout:fixed`, 14/16/21/9/40 %), banda del logo en su propia tabla, `overflow-wrap:anywhere`, sin repetir texto. **Causa raíz de lo «comprimido» en PC**: `ANCHO_CORREO` 720 vs ~1000 px del panel de lectura de Outlook → ahora se arma a 1000 px y se escala.
- **R29, planilla «Recolección MTTR»** (Fecha · Máquina · Falla · Duración (Min) · Observaciones) arriba del correo, en vivo y como Excel, IGUAL al Excel de Mantención: `recoleccionMttr.ts`, `recoleccionMttrPdf.ts`, plantilla `public/plantillas/recoleccion-mttr.xlsx` (tabla «Captura»; `fflate` reemplaza la fila 4; validado con openpyxl). Formato: banda #00557F, A1 #F2F2F2, bandas #D9E1F2. MTTR = promedio por parada (Orel lo confundió con el total).
- **R28**: `gruposDelTurno()` en `resumenBitacora.ts` = UN origen del orden para pantalla, WhatsApp, correo y PDF (misma numeración); el círculo del pendiente va tintado, no relleno (`--ink-warn` cambia entre pieles). **R27**: correo y PDF con el formato nuevo; mirar el PDF sin navegador = mockear `jspdf` en un test temporal y rasterizar con PyMuPDF.
- **R26, WhatsApp cortaba el mensaje en el 4.º evento**: al compartir imágenes + texto, el texto es PIE DE FOTO, cortado en ~1.024 caracteres (el turno medía ~1.900). Fix: `envioEnDosPasos` si hay láminas y >1.000 caracteres («1 · mensaje», «2 · láminas», cada uno con su toque). ⚠ El monoespaciado NO evita los enlaces del iPhone; solo lo evitarían caracteres invisibles (descartado: se copiarían a SAP).
- **R25**: año en los turnos solo si no es el actual (`etiquetaCortaTurno(id, anioActual)`; ⚠ las pruebas fijan el reloj en 2026); WhatsApp A2 en secciones en mayúscula/negrita, eventos numerados, cita `> `, separador `──────────`, `protegerNumeros`. Compactación previa del WORKLOG (09-17, 377→150 KB): faltaban citados #908 y #538 (agregados).

## Bitácora: rondas 16-24, iOS 27, repuestos, turno movible (09-17)
- **R24, cambiar el turno de un evento**: Orel resolvió el pendiente del bandejón (línea manual HG) y quedó en el turno DÍA 17-09 cuando fue en NOCHE. Datos corregidos a mano (evento `lcDOGQ1BvCV6qkrGRHLN` → `2026-09-17_noche`, pendiente `b9Sy6sTIdHIbRm2iAiks`, borrador vacío `Y1lfBCr0EbtoDvOnshFj` borrado). ⚠ Verificar «Resolver» SOLO en la vitrina: el autoguardado crea el borrador en prod. Fila «Turno» (7 días, nunca futuro); se aplica solo al publicar. **Regla**: `turnoId` ya no es inmutable (`turnoMovible`: entre hace 10 días y mañana); 111/111.
- **R23/R22, iOS 27** (la 1/2 es #1072): `SwipeRow` (Editar · Pendiente · Borrar), borrar con Deshacer 5 s, asa ≡ para sin hora (⚠ el destino se calcula con la Y del `pointerup`; ⚠ cambiar el contenedor al empezar a arrastrar remontaba el asa y perdía la captura). R22: KPI en tinta normal + punto de estado, «+» central de la barra de pestañas abre «Nuevo evento» (`pedirNuevoEvento.ts`), Compartir en cápsula. ⚠ Para probar gestos por script esperar ~40 ms entre `touchmove`.
- **R19-21**: pulido medido a 375 px en prod con los medidores de DESIGN.md §11; cabecera que medía 478 px → chip «Hoy ›»/«En curso» junto al nombre; «Editas como X · Cambiar»; `BarraSincronizacion` como línea de 13 px; «Salir» y «Lista de técnicos» 36→44 px; fondo del visor opaco. R21: 1 hallazgo → pulido visual CERRADO.
- **R18b**: repuestos en lista («• 3300135877 · Filtro FRL ×1», cantidad SIEMPRE) en WhatsApp/correo/PDF (viñeta DIBUJADA: Helvetica no trae «•»)/lámina; Historial con `ResumenPeriodo.repuestos` y 2 KPIs más. **R18a**: Orel «no deja modificar el técnico»: lo bloqueado era `registradoPor` en publicado (regla del 16-09) → editable (`DatosEvento.registradoPor` solo si cambió: un `undefined` pisaba el autor); el pase solo si `actualizadoPorNombre == token.nombre`.
- **R17**: editor ancho en PC; buscador de repuestos «En este equipo · Todos» por código, nombre SAP y **nombre común**; «Todos» usa el **índice liviano `repuestosIndice/sap`** (3.790 entradas, ~179 KB, una vez por sesión; mantenido por el trigger `onRepuestoEscritoIndice`, que sale temprano si no cambió nombre/común/SAP). Reglas 104/104.
- **R16, Fishken/E-PACK (datos)**: Orel no pudo anotar el FRL de la E-PACK. CAUSA: la hoja «Fishken» del Excel maestro se migró al nodo hijo CINTA FISHKEN, no a EMPACADORA E-PACK (720004590); además el maestro está desactualizado (8 de 11 «sin SAP» sí tienen código en `STOCK ALMACENES.xlsx`; FK-005 apunta a otra pieza: 3100061329 tarjeta vs cable 3300061329). Corregido por script (respaldo de 127 docs en `OneDrive\ANTARFOOD\_BACKUP_MEMORIA_CLAUDE\2026-09-17\repuestos-fishken-clasif-backup.json`): 20 repuestos → E-PACK, 5 fichas fusionadas, 107 materiales vinculados por el patrón de su máquina; MULTIVAC (50) y WITT (23) NO se vinculan (Orel). Sin equipo 3.022 → 2.910; `areaIds` recalculado a mano.

## Bitácora: rondas 11-15, cooperativa, pase QR, WhatsApp, repuestos (09-16)
- **R15**: `equipoCodigo` (N° del equipo) y `repuestos[{codigoSAP,nombre,cantidad}]` (≤20). Por nombre solo con equipo elegido, UNA lectura por sesión (BAADER 142 N2: 1.803 docs, ~2 MB); NO se carga el maestro entero (7.673 lecturas por apertura: techo de costos).
- **R14, pase de bitácora (QR + PIN personal)**: QR 30 días, PIN de 4 dígitos asignado por supervisor (5 fallos → 15 min). Callable `paseBitacora` (sin triggers ni crons; costo fijo cero): `entrar` valida token+PIN en transacción y crea cuenta `pase_…` con claims `{pase_bitacora, plantId, nombre}`. **Reglas — el límite en un punto central**: `isAuthenticated()` es falso para un token con `pase_bitacora` → fuera de TODA la app (~80 lecturas `isNotAnonymous()`); solo entra por `paseBitacoraActivo()` y firma con SU nombre. Storage: `sesionApp()` reemplaza 38 `request.auth != null`. 90/90 Firestore + 14/14 Storage. `App.tsx` reconoce el claim ANTES de buscar `users/{uid}` (si no, cerraba la sesión); el token va en el `#` (el 404.html lo conserva); campo PIN `readOnly` al enviar (`disabled` cerraba el teclado).
- **R13, WhatsApp**: WhatsApp no intercala texto y fotos y WhatsApp Web recibe UNA imagen por Ctrl+V (pegar el HTML pierde las fotos) → mensaje + una LÁMINA por evento (canvas 1080 px, `laminaWhatsapp.ts`; Chrome solo copia `image/png`; las láminas se generan al abrir la vista para que el copiado ocurra dentro del toque).
- **R12**: «Quedaron sin publicar · N» (borradores de turnos anteriores). **R11, bitácora cooperativa** (el borrador lo ve TODO el turno; eliminar = creador + supervisores): autoguardado a 1,5 s, un borrador NO cuenta en nada (`soloListos`), **fusión campo por campo** (`fusionarFormulario`: se adopta lo que cambió otro equipo si yo no lo toqué; si ambos, se avisa «Usar la suya / Mantener la mía»), presencia (`bitacoraPresencia`, latido por minuto solo con pestaña visible; vigencia con la hora del SERVIDOR porque los relojes de planta no son confiables). **R11b, revisión adversaria (5 ALTA de pérdida de datos, arregladas)**: se escribe SOLO lo que cambió (`camposACambiar`: un autoguardado atrasado de un teléfono sin señal pisaba lo de otro); un publicado no vuelve a borrador (regla); abrir-mirar-cerrar no escribe; un borrador no se recorta. Técnicos del turno parten VACÍOS (pedido de Orel: el calendario a veces no refleja el turno real).

## Bitácora de turno: módulo base y rondas 1-10 (PR #1021, 09-15)
- **Módulo base** (pedido de Orel: bitácora por turno en el celular con texto + fotos antes/después, vista en PC, copia al correo o PDF). Decisiones de Orel: turno de **Mantención por reloj** (día 08-16, tarde 16-00, noche 00-08; no Shoplogix) · bitácora **compartida** (cada evento firmado) · cada evento lleva **minutos de parada (MTTR)** o, si se intervino sin detener, **la ventana** (colación HG, empaque…). Datos: `bitacoraEventos` (`turnoId` = `YYYY-MM-DD_banda`), fotos en `bitacora/{turnoId}/{eventoId}/`; costo 1 onSnapshot por turno. Correo: HTML con estilos en línea + `<table>` + `<img width height>` (lo único que respeta Outlook clásico) + variante con fotos base64.
- ⚠ **Gotchas**: **CORS del bucket autoriza SOLO `https://orelcain.github.io`**, no localhost; **la CSP `connect-src` no admite `data:`** (fotos a canvas con `<img>` y dataURL→Blob a mano); **`processImageForUpload` devuelve un WebP chico TAL CUAL aunque se pida `preferWebP:false`** y Outlook clásico/jsPDF no lo aceptan → re-codificar en `fotosBitacora.ts`; **flex vertical con alto acotado + hijo `overflow-x-auto` = hijo de 0 px** (`[&>*]:shrink-0`). `await setDoc` espera el ACK del servidor: sin señal «Guardar» giraba para siempre → no se espera (`persistentLocalCache`).
- **PR #1021 mergeado** (`9b10975`) y verificado en prod; `scripts/probar-reglas-bitacora.cjs` prueba el ruleset PUBLICADO con `projects:test` (`--local` el archivo, antes de publicar). **Decisión de Orel**: sin cuentas por técnico; usan la **cuenta compartida de Mantención** y **cada uno elige su nombre de la planilla del calendario** (`registradoPor` no se pisa; `actualizadoPorNombre`). Buscador de equipos: 702 nodos, con PLANTA y ÁREA (mismo nombre en Chonchi y Yal), guarda `equipoId`. ⚠ La hoja de presentes reiniciaba lo marcado en cada re-render (dependía de un array recreado).
- **Entrega de turno**: los pendientes abiertos aparecen arriba del turno que llega; «Resolver» crea el evento y cierra el original en UN lote; «Ya no aplica»; borrar el evento reabre el pendiente. **Revisión adversaria (12 hallazgos, corregidos)**: ⚠⚠ el primitivo `Sheet` devolvía el foco al disparador en CADA tecla (efecto con `onClose` inline en dependencias): en el celular el teclado se cerraba letra a letra, en TODA la app que use `Sheet` con `onClose` inline; fix: `onClose` en ref. ⚠ **Lección: las pruebas que llenan campos por script NO ven el bug del foco; en formularios hay que TECLEAR.**
- **R7**: Historial del período (7/14/30 días; `historialBitacora.ts`, un `getDocs` con rango sobre `fechaTurno` y `plantId` en memoria: evita índice compuesto; `tesisDelPeriodo` = la frase que demuestra el aporte de Mantención). **R8, robustez de la entrega (10 bugs)**: el lote perdía el evento (con sus fotos) si el pendiente original ya no existía y el aviso hablaba de señal → evento primero, cierre aparte (`cerrarPendienteResuelto`); no se reabre un pendiente que otro evento ya resolvió; la bitácora archivada no cambia sola; grilla del Historial con scroll horizontal a 375 px (`min-w-0`). **R9, la tesis no puede insinuar paradas que no hubo**: «De N intervenciones, M sin detener» contaba TODOS los eventos (incluso `no-aplica`) → denominador = intervenciones SOBRE LA LÍNEA; carrera al cambiar de período; `limit(1500)`.
- **R10, fotos: nada se pierde ni queda huérfano**: cola `borradosPendientes.ts` (antes `catch(() => undefined)` dejaba fotos que ningún documento menciona, pagándose para siempre); limpieza al desmontar; **subida de a DOS** (`createImageBitmap` decodifica la ORIGINAL, 12 MP ≈ 36 MB; ocho a la vez recargaban la pestaña en gama media). **Anotado, no arreglable**: la URL de descarga de Storage lleva un token que ignora las reglas → quien reciba el correo ve esas fotos sin autenticarse.

## CI y dependencias (09-15)
- **Fuera `maplibre-gl`**: las 2 alertas críticas de Dependabot (#241 lock + #242 package.json) eran **una sola**, GHSA-jrc7-96c5-q579 / CVE-2026-85061 (CVSS 10, XSS por el texto de atribución; parche solo en 6.4.1, instalada 5.23.0). **No era explotable**: la agregó `ffb4d364` (08-03), `b00c69e7` (13-03) la reemplazó por Three.js y quedó muerta en el `package.json`. Medido: 0 imports; bundle de prod 4.2.0 = 261 chunks, 0 con maplibre. `pnpm --filter @mantenimiento/pwa remove maplibre-gl` (27 transitivos); ⚠ el sw.js de Pages es la página 404: listar chunks de prod desde `index-*.js`.
- **Los tests de `functions/__tests__` no corrían en CI**: `deploy.yml` corría solo `shoplogix/__tests__` + `solicitudRepuesto.test.js`; publicMonitor, pulse, vigiaTurno, archivarSerieMinuto, briefFinTurnoCola… nunca (106 tests a mano, 2 rotos). Bisect: «los minutos que el turno YA tiene…» se rompió en **#529** (13-08, cambió A PROPÓSITO «fuera del horario» a la HORA del tramo); «el historial reusa…» en **#564** (15-08, exige `timeBreakdown.tbv === 2`, cache poisoning; el fixture no traía `tbv`). Tests viejos, prod sin cambios. Se sumó el caso «live sin tbv se recompone» (el guard de #564 no tenía test) y mutaciones M1-M6.
- ⚠ **Relojes**: barriendo 24 h con `Date` falso (`NODE_OPTIONS=--require fake-now.js`) fallaban 2 tests más según la hora (00:xx y 03:xx de Chile): FIXTURES que empataban (dos turnos a las 00:00), no el código; sumarlos así tumbaba deploys de madrugada → reloj fijo por parámetro. Barrido final: **192 corridas, 454/454**. CI: `node --test shoplogix/__tests__/*.test.js __tests__/*.test.js` (los nuevos entran solos).

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
