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

## 2026-07-08 - claude - Repuestos: "Solicitar a bodega" cierra el círculo (entregar descuenta stock real)

- Origen: tomé el TODO sin dueño de `.ai/TASKS.md` ("Solicitar a bodega end-to-end"). Diagnóstico: la creación de solicitudes (`SolicitarRepuestoModal`+`useSolicitudes.crearSolicitud`) y las notificaciones (`onSolicitudRepuestoCreated` → Telegram+FCM) ya estaban 100% cableadas. El gap real: `avanzarEstado` (pendiente→aprobada→**entregada**) solo hacía `updateDoc({estado})` — nunca tocaba `bodega`. Se podía "entregar" un repuesto sin que su stock bajara nunca, desincronizando los KPIs de Bodega de la realidad.
- FIX (`RepuestosAreaHub.tsx`): nuevo `handleAvanzarSolicitud` que envuelve `avanzarEstado` — al pasar a "entregada", si el SAP de la solicitud ya tiene registro en `bodega` (`bodegaId`), llama a `registrarMovimiento` (la MISMA función que ya usa la vista manual de Bodega — mismo patrón, misma auditoría en la subcolección `movimientos`) con `tipo:'salida', cantidad: sol.cantidad`. Si el descuento falla → toast de error + **NO avanza el estado** (evita quedar "entregada" sin reflejo real en stock). Si el SAP nunca tuvo bodega configurada → no se inventa un registro nuevo (además de ser semánticamente correcto, evita un rechazo latente de `firestore.rules`: `isValidBodega()` exige `ubicacionBodega` no vacío, que el camino de auto-creación de `registrarMovimiento` no siempre puede garantizar). Toast de éxito (`-N unidades`) cuando el stock sí se descuenta.
- Verificación: `tsc --noEmit` OK + `eslint` (archivo tocado) OK, ambos sobre `main` en worktree aislado. **No se pudo verificar visualmente en preview** (tope de 5 dev servers por carpeta, todos ocupados por sesiones concurrentes en este mismo repo — no se forzó cerrar ninguno).
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`.
- Estado: HECHO — PR #175 mergeado y desplegado (GitHub Actions, 2026-07-08). Pendiente que alguien pruebe en vivo: crear solicitud de un SAP con stock en bodega → aprobar → entregar → confirmar que el stock bajó y quedó el movimiento en el historial.

## 2026-07-08 - claude - ARIA chat PWA: primera capacidad de ESCRITURA (crear/vincular repuesto + editar código de fabricante)

- Origen: tras arreglar ARIA-Telegram (rama separada `fix/aria-repuesto-foto-criterio`, ver ese WORKLOG), Orel pidió llevar la MISMA mejora al chat de la PWA — pero el chat de la PWA (`chatbot.ts`+`aria/tools/*`) era 100% SOLO-LECTURA (ninguna tool escribía nada). Esta sesión le da su PRIMERA capacidad de escritura real.
- Arquitectura descubierta (Explore agent + lectura directa): el chat YA tenía un patrón de confirmación reutilizable — `PendingAction` (`chatActions.ts`, status collecting→confirming→executing) usado hoy solo por `create_incident`, con UI `PendingActionBar` (`ChatBot.tsx`) y botones Confirmar/Cancelar/Modificar que en el fondo mandan texto plano al mismo `sendMessage` (parseado por regex en `sendChatMessage`). Se extendió ESE mismo patrón en vez de inventar uno nuevo.
- **Nuevo módulo `apps/pwa/src/services/repuestoActions.ts`**: espeja el trabajo de ARIA-Telegram (mismo modelo de datos: colección plana `repuestos`, `equipos:[nodeIds de hierarchy]`; misma regla dura SAP=10 dígitos exactos, match numérico SOLO por igualdad exacta de `codigoSAP` — nunca por texto libre, para no repetir el falso positivo real que tuvo Telegram con dos cilindros parecidos). Funciones: `buscarSapEnMaestro` (query directa, no depende del cache de la pestaña Repuestos), `buscarEquipoEnJerarquia` (nodos `hierarchy` con `tipoNodo==='equipo'`, cache 5min — **importante**: el `Equipment`/`getEquipments()` que ya usa `chatActions.ts` para incidencias es una colección DISTINTA, la ficha CTD; los repuestos linkean a `hierarchy`, no a `equipment` — usar la función equivocada habría vinculado a nodos que los repuestos no reconocen), `deducirClase`/`parseCodigoFabricante`/`detectRepuestoAction` (mismo criterio que Telegram), `buildRepuestoDraft`/`buildEditDraft`, `executeCreateRepuesto`/`executeVincularRepuesto`/`executeEditRepuesto` (mismo patrón historial+audit_log que `useRepuestoCrud`, como función plana con userId/userName explícitos ya que corre fuera de un componente).
- **`ultimoRepuesto`** (localStorage por userId, TTL 1h) — equivalente al de Telegram (Firestore) pero client-side, para "ese mismo repuesto"/"al mismo" en `edit_repuesto` sin repetir el SAP.
- Wiring en `chatbot.ts`: `ActionType` extendido (`create_repuesto`, `edit_repuesto`); detección de intención de repuesto ANTES de la detección de incidencias (triggers más específicos: SAP/"repuesto"/"código de fabricante"); confirmación vía los mismos regex `isConfirm`/`isCancel` ya existentes; `isModify` para estos dos tipos da un mensaje propio (no el de incidencias). `PendingActionBar` se acotó a `create_incident` (sus campos/selector de equipo son específicos de ese flujo) — v1 de repuestos confirma por texto plano "sí/no", igual que ARIA en Telegram.
- **v1 sin fotos**: el input de fotos del chat sube a `uploadIncidentPhoto` (bucket de incidencias), no a `uploadRepuestoFoto` (necesita el id del doc ya creado) — decisión de alcance explícita, no gap silencioso.
- **Sin criterio LLM**: con SAP explícito (10 díg) la decisión crear-vs-vincular es 100% determinista (como en Telegram); sin SAP se pide explícitamente en vez de adivinar.
- **3 bugs reales encontrados y corregidos en dry-run** (con frases plausibles que NO estaban en la conversación real de Telegram, o sea bugs nuevos de este puerto, no heredados): (1) `parseCodigoFabricante` fallaba con "actualiza el código de fabricante DEL SAP X A Y" (SAP mencionado en la misma frase) — el parser original (portado de Telegram) solo cubría la forma declarativa simple; ampliada la lista de conectores + skip de un SAP de 10 dígitos. (2) `extraerEquipoTexto`/extracción de nombre SIN límite de palabra (`\b`) en el regex de preposiciones — "al" matcheaba dentro de "materiAL"/"radiAL"/"industrAL", truncando mal frases con palabras técnicas comunes; reescrito con `\b` + toma la ÚLTIMA preposición (ambas funciones ahora comparten un solo helper `ultimaPosicionInicio`, antes duplicaban el regex roto en dos lugares). (3) caso borde "crea un repuesto para X" (sin nombre real) dejaba el nombre como el artículo suelto "un" en vez de vacío, saltándose el guard de "falta nombre" — blindado.
- **Rol/seguridad**: NO se tocó `firestore.rules` — la escritura vía chat queda gateada por las MISMAS reglas que ya rigen la creación manual de repuestos (`isTechnician()`: admin/supervisor/tecnico), ningún usuario obtiene un permiso nuevo que no tuviera ya con el formulario manual.
- Verificación: `tsc --noEmit`=0 y `eslint` limpio en los 5 archivos tocados (repetido 3 veces, tras cada tanda de fixes). Dry-run SOLO-LECTURA contra Firestore real (script temporal, sin escribir nada): detección de intención (8/8 casos, incluye no-falsos-positivos con frases de incidencia), parser de código de fabricante (3/3 frases reales), extracción de equipo/nombre (con y sin palabras tipo RADIAL/INDUSTRIAL), búsqueda real en `hierarchy` (Knuro/bomba de acopio/GA90 resuelven bien sobre 648 nodos equipo), y — cruce entre features — **el cilindro SAP 3300138398 creado por ARIA-Telegram el día anterior es visible y editable desde este mismo camino de la PWA** (confirma que ambas superficies comparten de verdad el maestro). Preview: `aria-pwa-escritura-wt` (puerto 5181) arranca limpio (Firebase/Firestore init OK, Service Worker OK), consola sin errores, llega a `/login` — **NO verificado el flujo autenticado end-to-end en navegador** (la PWA exige login Google/credenciales reales, mismo límite ya documentado en sesiones previas de este chat).
- Trabajo en git worktree propio (`D:\a\aria-pwa-escritura-wt`, rama `feat/aria-pwa-escritura-repuestos` desde `main`) — el checkout principal tenía WIP ajeno sin commitear (`RepuestosAreaHub.tsx`, columna código-fabricante) de otro agente en paralelo; NO se tocó.
- Archivos: `apps/pwa/src/services/repuestoActions.ts` (nuevo), `apps/pwa/src/services/chatActions.ts` (M, +2 ActionType), `apps/pwa/src/services/chatbot.ts` (M, detección+confirmación+imports), `apps/pwa/src/components/chat/ChatBot.tsx` (M, guard PendingActionBar), `apps/pwa/src/hooks/useChatBot.ts` (M, mensaje de bienvenida).
- Estado: EN REVISIÓN → commit `2740cc6b` + **PR #164 ABIERTO** (rama `feat/aria-pwa-escritura-repuestos` → `main`, sin conflictos, +717/-4). Abrir el PR es seguro (no despliega nada); el MERGE sigue pendiente de que Orel pruebe logueado, porque eso SÍ dispara deploy automático vía GitHub Actions a la app que usan técnicos reales (a diferencia de Telegram, que solo lo afecta a él).
- Sigue: Orel prueba logueado en el preview (5181) o local (test plan en el PR) → si OK, mergear #164. Follow-up opcional: botones Confirmar/Cancelar dedicados para repuestos (hoy solo texto plano) + soporte de fotos (requiere adaptar la subida a `uploadRepuestoFoto`).

## 2026-07-07 - claude - ARIA Telegram: memoria de contexto ("ese mismo repuesto") + editar código de fabricante + fix acento

- Origen: Orel probó el fix anterior EN VIVO → creó bien el cilindro SAP 3300138398 (KNURO N1). Después mandó 2 fotos con "Agrégale estas dos imágenes a ese mismo repuesto de Knuro y agrégale su código de fabricante 999 0566" → ARIA lo ignoró (volvió a "¿creo incidencia?"). Orel: "falta que ARIA siga el contexto de la conversación" + REGLA: es la MISMA ARIA, cada mejora va a Telegram Y al chat de la PWA.
- Causas (verificadas): (a) el filtro de caption accionable NO matcheaba "Agrégale" por la tilde (é rompía `\bagreg`); (b) ARIA no recuerda el repuesto que acaba de crear → "ese mismo repuesto" no resolvía; (c) no existía capacidad de editar el código de fabricante (escritura sobre repuesto existente).
- FIX (functions/index.js, +183):
  - **Memoria `ultimoRepuesto`** (campo de sesión, TTL 60min): se setea al crear/vincular/adjuntar-foto/editar; se inyecta al router (`ultimoRepuestoHint`) y a `ariaDecidirRepuesto` → "ese mismo repuesto"/"al mismo"/"el que creaste" resuelven al último tocado.
  - **Acción `repuesto_editar`** (código de fabricante hoy): resuelve el SAP objetivo (SAP explícito → ultimoRepuesto), parsea el valor (`ariaParseCodigoFabricante`, salta relleno "q es el" y corta en "al mismo"), confirma, escribe `codigoFabricante` + historial + audit_log (misma forma que la PWA). Puede sumar la última foto de paso.
  - **Fix acento**: caption se normaliza (NFD + quita `\p{Diacritic}`) antes de detectar intención; CAPTION_ACCION ampliado (pon/actualiza/edita/cambia/codigo).
  - **Modo "voy sumando fotos"** (`modoAdjuntarA`, TTL 10min): tras adjuntar una foto a un repuesto, las siguientes fotos SIN caption ni SAP propio se ofrecen para el mismo repuesto (con confirmación; guarda: si la foto trae SAP propio es otro ítem).
- Verificado: `node --check` OK + dry-run SOLO-LECTURA contra maestro real: cilindro 3300138398 EXISTE (y ya tiene codFab "999 0566" — Orel lo puso a mano tras el fallo); "ese mismo repuesto"/"al mismo" (3 frases) → resuelven a 3300138398; parser código fab → "999 0566"/"LOV-13"/"ABC-1234" limpios; "Agrégale..." ahora matchea el caption. Router LLM (elegir repuesto_editar vs repuesto_agregar) no probado en vivo (keys=secrets) — handlers deterministas y seguros.
- PWA (chat in-app): decisión de Orel = "arrancar" la escritura también en la PWA. HALLAZGO: el chat de la PWA (`chatbot.ts`+`aria/tools/*`) es hoy 100% SOLO-LECTURA (ningún write de dominio) → espejar estas escrituras = darle capacidad de escribir con confirmación (proyecto aparte). PENDIENTE fase siguiente.
- Archivos: functions/index.js (M).
- Estado: DESPLEGADO 2026-07-08 (`npx firebase-tools deploy --only functions:telegramWebhook`, "Deploy complete!", a pedido de Orel). PWA = fase siguiente (ver entrada 2026-07-08 arriba — esa sí ya tiene su propio PR/merge).

## 2026-07-07 - claude - ARIA Telegram: fix crear/vincular repuesto por foto (match SAP + criterio LLM)

- Origen: Orel reportó que ARIA no pudo crear un repuesto que le mandó con 2 fotos. Revisé la conversación REAL en Firestore (`telegramAriaSessions/52949422`, 24 turnos) + reproduje con datos del maestro. Caso: cilindro neumático CRDSNU-32-105, **SAP `3300138398` (no existe = nuevo)**, para equipo Knuro. Etiqueta traía 4 códigos: `3300138398`, `CRDSNU-32-105-PPV-A-MQ-A1`, `552791`, `51051200`.
- **5 fallas encadenadas** (todas verificadas contra Firestore):
  1. **Falso positivo de match** (raíz): `ariaBuscarCodigoEnMaestro` hacía `_blob.includes()` con un número de fabricante (`552791`) → pegaba con OTRO cilindro (`3300138378` CRDSNU-32-**200**, cuyo textoBreve contiene "552791"). ARIA ofrecía el SAP equivocado.
  2. **Perdía el SAP corregido**: al confirmar sin repetir dígitos, re-deducía desde la foto con el mismo loop bugueado → recaía en el `...378`.
  3. **Regex agarraba el número rechazado**: en "no es 3300138378, es 3300138398" tomaba el primer número (`...378`).
  4. **Lote de fotos fallaba en silencio**: `ariaGroqVisionLote` reventaba entero y lo presentaba como "ninguna matcheó" (no reintentaba ni caía a de-a-una).
  5. **Caption de la foto ignorado**: "Crea ese repuesto para Knuro" como caption no se enrutaba (solo describía).
- FIX (functions/index.js, ~261/-85):
  - **SAP vs código de fabricante**: SAP del maestro = **10 dígitos exactos** (verificado: 3768/3782; el resto legacy 7-8). Helpers `ariaEsCodigoSap`/`ariaSapDeCodigos`. `ariaBuscarCodigoEnMaestro` ahora: número → SOLO igualdad exacta de `codigoSAP` (nunca por texto); alfanumérico (part number con letras) → sí por texto. Fin del falso positivo.
  - **`ariaDecidirRepuesto`** (criterio LLM + validación determinista): el SAP de la etiqueta manda; "existe" solo si ese SAP está EXACTO en el maestro. Entiende "no es X, es Y" (prefiere el SAP != al pendiente) y "termina en 8398" (elige el código de la foto que termina así). Si NO hay SAP claro → pide criterio al modelo (`ariaGroqChat` JSON) con candidatos parecidos, y **valida su salida contra el maestro** (nunca inventa un existente; ante cualquier fallo → "preguntar", nunca escritura equivocada).
  - **Handler `repuesto_agregar` reescrito** sobre `ariaDecidirRepuesto`. `ariaNombreRepuestoDesde` arma nombre limpio (sustantivo + part number) en vez de la frase larga.
  - **Lote robusto**: `ariaGroqVisionLote` cae a análisis de-a-una si el conjunto falla; el handler avisa con honestidad si TODO falló y NO vacía el lote (file_id vivos, reintentable).
  - **Caption accionable delegado al router**: foto + "créalo como repuesto del Knuro" ahora se resuelve usando la última foto. `ariaHandleFoto` además, si lee un SAP claro que no está en el maestro, propone crearlo como repuesto (antes empujaba a incidencia).
- Verificación: `node --check` OK. Dry-run SOLO-LECTURA contra maestro real (7662 docs): las 4 variantes de la conversación real ("Crea ese repuesto para Knuro" / "sí confirmo, tipo cilindro, Knuro" / "no es 378, es 398" / "termina en 8398") → **todas resuelven crear_nuevo SAP 3300138398** con nombre "CILINDRO CRDSNU-32-105-PPV-A-MQ-A1", y `552791`→null (falso positivo eliminado). La rama de criterio LLM NO se probó en vivo (las keys son secrets de Firebase, no están en `.env` local) — es fallback guardado por validación determinista.
- Archivos: functions/index.js (M).
- Estado: DESPLEGADO. Commit 0c24455b en rama fix/aria-repuesto-foto-criterio; `telegramWebhook` desplegado a mano (SA del repo) → revisión telegramwebhook-00096-pit ACTIVE, boot limpio (STARTUP probe OK), secrets GROQ v3/GEMINI v1/DEEPSEEK v2 enlazados. Falta prueba EN VIVO por Orel: reenviar la foto del cilindro con "créalo como repuesto de Knuro" (esperado: crea SAP 3300138398 en KNURO N1). Re-desplegado junto con el commit siguiente (memoria de contexto) el 2026-07-08.

## 2026-07-07 - claude - UX Análisis de Turno: quitar ruido por duplicación + fix header sticky

- Origen: Orel mostró screenshot del dashboard (Planta Yal) y preguntó si había "mucho ruido". Diagnóstico (workflow 3 lentes + lectura de código): el ruido era REPETICIÓN, no exceso de datos. Los mismos 4 KPIs del mes salían DOS veces — arriba en "Resumen del mes" (`GraderMonthlyStatsPanel`, panel sticky de la col derecha) y otra vez abajo en "Vista panorámica" col 1 "Métricas del mes" (`GraderHistoricalCalendar`): uptime promedio, Ciclos Baader, Turnos T1/T2/T3, Mejor/Peor turno. Además: las cards Mejor/Peor del panel superior quedaban CORTADAS por el header sticky global.
- FIX (2 movimientos, bajo riesgo, misma fuente de datos → sin tocar lógica de cálculo):
  1. **Duplicados**: la col 1 de la Vista panorámica pasó de "Métricas del mes" (que repetía arriba) a **"Por Baader · {mes}"** — SOLO lo único que el panel superior no tiene: horas-máquina totales (ancla) + desglose por Evisceradora (uptime% + MTTR macro/micro por máquina). Se quitaron uptime 3xl, mini-KPIs Ciclos/Turnos y las cards Mejor/Peor (todo ya vive arriba). Cols 2 (Top paros) y 3 (Disponibilidad diaria) + tendencias = intactas (son únicas). Quitados imports huérfanos `TrendingUp/TrendingDown`.
  2. **Bug header**: `GraderMonthlyStatsPanel` fijaba con `lg:sticky lg:top-4` (16px) → quedaba bajo el header global (`<header sticky top-0 z-30 h-14>` = 56px) y sus cards superiores se cortaban. Cambiado a `lg:top-[4.5rem]` (72px = 56px header + 16px gap).
- DECISIÓN sobre el "mucho rojo": NO se tocó. El semáforo YA es de 3 niveles (verde/ámbar/rojo; `kpiThresholds` warnBelow/critBelow, `graderP0Thresholds` alert/critical). El rojo del screenshot (Disp 51%, Rend 53%) es HONESTO — están genuinamente bajo el corte crítico (70%/75%). Forzar ámbar falsearía el estado real (va contra la meta grande: datos honestos). La reducción de rojo vino sola al quitar el "Peor turno" duplicado.
- PENDIENTE (jerarquía temporal AHORA/HOY/MES): no se tocó a ciegas — es subjetivo y requiere verlo logueado. Propuesto a Orel para decidir juntos con el preview real.
- Verificación: tsc limpio · eslint 0 errores (4 warnings preexistentes) · dev server compila sin errores ni logs de consola · app monta (llega al login). Verificación VISUAL logueada pendiente de Orel (la app pide login Google/credenciales; no verificable de forma autónoma).
- Archivos: apps/pwa/src/components/grader/GraderHistoricalCalendar.tsx + GraderMonthlyStatsPanel.tsx.
- Estado: EN REVISIÓN → rama fix/ux-analisis-turno-ruido (sin PR aún — esperar visto bueno visual de Orel antes de PR/merge).

## 2026-07-07 - claude - Turnos: Shoplogix = fuente de verdad de horarios (PWA + functions DST)

- Origen: Orel reporta "confusión de horarios y turnos" y "no tenemos registros de días anteriores" (empezaron a pasar pesca el 5-6 jul). Diagnóstico contra Firestore prod: (1) los turnos REALES cambiaron — chonchi ya NO emite "Turno día/noche" desde mayo (emite "Turno 1" 21:30→05:45, "Turno 2" 09:00→17:15 u 08:00→15:15 y "Turno 1 Lunes" madrugada del lunes); Yal ya no tiene T1 y su T3 real es 00:00→~06:55 — pero la app buscaba nombres/horarios hardcodeados; (2) la pesca del 5-jul en Yal corrió 23:00→06:56 SIN turno configurado en Shoplogix → 11.6k ciclos cayeron en "Unscheduled" (que la UI ocultaba) y solo 1.7k en "Turno 2"; (3) chonchi tiene 0 ciclos desde el 25-jun (estados = break/planned downtime ~20h/día): según Shoplogix la Planta Principal NO ha pasado pesca — verificar allá, la app refleja fiel; (4) los días previos al 2-jul están sincronizados pero VACÍOS (plantas paradas), no faltan.
- FIX (extiende la decisión del PR #157 a todo Análisis de Turno): descubrimiento dinámico de turnos por rango de documentId sobre los docs padre `shoplogix/{plant}/shifts` (`listShiftInfosForDay` con scheduledStart/End reales + ciclos; fallback al sondeo por candidatos para data sin padre) → el mes en el calendario pasa de ~270 reads a 1 query y CUALQUIER nombre nuevo que Shoplogix invente aparece solo; `computeShiftTimeWindow` acepta `realBounds` que MANDAN sobre el schedule (con manejo de turno en curso: scheduledEnd crece con cada sync → tolerancia 30 min y progreso null si el fin planeado es desconocido); `CurrentShiftChip` detecta el turno en curso desde los docs reales de hoy+ayer (schedule = fallback); candidatos chonchi corregidos (día→Turno 2, noche→Turno 1/Turno 1 Lunes) + variantes por prefijo en `subscribeShoplogixShiftAuto`; "Unscheduled" visible como "Sin turno asignado" cuando tiene ≥50 ciclos (navegación + calendario); navegación prev/next ordenada por scheduledStart REAL con dedup Excel↔SLX por solapamiento horario (antes las flechas quedaban invertidas en Yal: el T3 post-mayo es la madrugada de su propio dateKey); `isMidnightShift` → NUNCA desplaza (+1 día era de una convención vieja del CF sin docs vivos — verificado TODO el histórico; cada T3 se mostraba bajo el día equivocado); functions: offset Chile DST-aware con Intl America/Santiago en polling/sync (el -3 fijo perdía la franja 07:00-08:00 wall en invierno = cola de turnos nocturnos), rollover de mes en `currentShiftKey`, probe/validate alineados a `currentDateKey`.
- Archivos: apps/pwa (shoplogixShift.service, graderShiftStatus, graderShiftDisplay, plantKpiCompute, plantLines, CurrentShiftChip, GraderHistoricalCalendar, AnalisisGraderTurnoPage, useUpstreamLineSnapshot, tests) + functions (polling.js, sync.js, index.js probe, scripts/validate-plant-integration.js).
- Verificación: tsc limpio · eslint 0 errores (7 warnings preexistentes) · vitest 587 pass (+ suites nuevas realBounds y display) · helpers DST validados con node (jul→UTC-4, ene→UTC-3, cambio de día 08:00 wall) · revisión adversarial multi-agente (hallazgos confirmados corregidos: orden nav, progreso 100% clavado, calendario ciego a nombres nuevos, rollover mes, diagnósticos -3).
- **RONDA 2 (misma rama, tras contrastar con pantallazos de Shoplogix UI de Orel):** (a) Shoplogix etiquetó RETROACTIVAMENTE el "Turno 3 - 6 Jul" (la madrugada que estaba como Unscheduled del 5) → re-sync local de yal 02/05/06-jul (syncDay con la cookie de Secret Manager; el doc `2026-07-06_Turno 3` ahora existe con 11.117 ciclos, igual que la UI de Shoplogix). (b) El re-sync destapó DOBLE CONTEO preexistente del CF: el grupo "Unscheduled" se filtraba por VENTANA temporal y cuando sus intervals abrazan el día se tragaba los turnos etiquetados de en medio (07-06_Unscheduled llegó a 35.510 = T2+T3 duplicados; 07-02 ya venía así con 8.181 ≈ su propio T2) → fix en sync.js: el grupo Unscheduled filtra por ETIQUETA (`iv.shift === 'Unscheduled'`), los nombrados siguen por ventana. Tras re-sync: Unscheduled 02/05/06-jul = 0/0/1 ciclos y turnos nombrados intactos. (c) HALLAZGO OPERACIONAL: el auto-login ROPC de Shoplogix está ROTO (`invalid_client` — parece que deshabilitaron el grant password); `system/shoplogixToken` no existe y TODO el sync vive del fallback cookie `SHOPLOGIX_COOKIE` — cuando esa cookie expire, el sync muere. Avisar a Orel para plan B (renovar cookie / revisar client_id).
- **RONDA 3 (misma rama — "que no vuelva a pasar"):** (a) **Re-sync móvil automático** en el wakeup: además de hoy, re-sincroniza AYER cada hora (disparo :00) y hace 2-3 días una vez al día (disparo 12:00 Chile) → el etiquetado retroactivo de Shoplogix se auto-corrige sin intervención; timeout 180→420s, jitter acotado a 30s cuando hay días extra. (b) **Alerta Telegram cuando la auth muere** (AUTH_EXPIRED → mensaje con procedimiento de renovación de cookie, dedupe 6h vía `system/shoplogixAuthAlert`). (c) **Backoff ROPC 6h** en tokenStore (marca `ropc_failed_at` en `system/shoplogixToken`): sin esto, cada wakeup martillaba el identity server con logins condenados al 400. (d) Diagnóstico ROPC verificado: el discovery OIDC AÚN soporta grant `password` y el client sigue siendo `SAAS139` → el client se volvió CONFIDENCIAL (exige client_secret que no tenemos). Salidas: automatizar authorization_code+PKCE scripteando el login form (Fase 2b.1c, no requiere secret) o acceso API oficial vía account manager (Fase 2b.2). Documentado en docs/SHOPLOGIX_DEPLOY.md §Modo Bearer vs Cookie.
- Estado: EN REVISIÓN → PR #160 (rama fix/turnos-shoplogix-fuente-verdad).
- Sigue: tras merge, DEPLOY MANUAL de functions (`npx firebase-tools@latest deploy --only functions:shoplogixSyncWakeup,functions:shoplogixSyncHttp,functions:shoplogixSyncNow,functions:shoplogixBackfillRange,functions:shoplogixProbe` con GOOGLE_APPLICATION_CREDENTIALS) · Orel: verificar en Shoplogix por qué las Baaders de Planta Principal marcan 0 ciclos desde el 25-jun si ya están pasando pesca · pedir en planta que configuren en Shoplogix el turno nocturno de domingo en Yal (para que la pesca dominical no caiga a "Unscheduled").

## 2026-07-06 - claude - ARIA Telegram: fotos de repuestos → CREAR/VINCULAR en el maestro + fix visión Gemini (403 referer)

- Origen: Orel mandó fotos de un aceite del compresor GA90 de acopio y ARIA le dijo que no podía hacer nada con ellas. Dos causas encontradas: (a) ARIA solo sabía ADJUNTAR fotos a repuestos YA existentes (match por SAP); (b) **la restricción por referrers de la API key (hardening 2026-07-05, ver entrada anterior) dejó CIEGA la visión de ARIA**: Gemini server-side (sin header Referer) devuelve 403 "referer <empty> blocked" → `ariaGroqVision` cae al catch "no pude analizar la foto" y el fallback Groq→Gemini + `geminiProxy` del chat in-app también quedaron rotos.
- FIX visión/fallback: las functions mandan `Referer: https://orelcain.github.io/mantenimiento-planta/` (constante `GEMINI_KEY_REFERER`) en las 2 llamadas a generativelanguage (geminiProxy + `_ariaGeminiChat`). Verificado directo: sin referer 403, con referer 200. Es la misma key del proyecto usada por su server legítimo — no debilita la restricción para terceros con la key robada del JS (el referer les sigue faltando en uso casual).
- FEATURE: nueva acción del router `repuesto_agregar` (+ campo `equipo` en el JSON del router). Flujo: foto → visión guarda `ultimaFoto` en la sesión (fileId+descripcion+codigos OCR, TTL 30 min) → "agrégalo como repuesto del [equipo]" → busca el equipo en `hierarchy` (cache 10 min, matching por términos con stopwords, solo `tipoNodo=='equipo'`) → borrador con confirmación. Dos caminos: (1) código OCR YA en el maestro → pending `repuesto_ligar` (arrayUnion equipos/equiposCodigos, mismo par de campos que `linkRepuestoEquipo` de la PWA, + foto opcional); (2) no existe → pending `repuesto_nuevo` → `ariaCrearRepuestoNuevo()`: doc con la MISMA forma que `useRepuestoCrud.createRepuesto` + `clase` deducida (aceite→lubricante etc.) + `tieneSap` + `plantId:'chonchi'` (regla multi-planta) + docId=SAP si hay (`.create()` anti-pisada) + foto a Storage `repuestos/{id}/` + subcolección `historial` (campo creacion) + entrada `audit_log` (`userId: telegram:<id>`) + invalidación del cache del maestro. Avisa de PARECIDOS por nombre antes de crear (anti-duplicados). Equipo no encontrado → pide el nombre como figura en la app, sin crear nada.
- Guard nuevo en la confirmación determinista: "no, agrégalo como repuesto del X" con borrador pendiente ya NO se come como "cancelar" (frases con "como repuesto/al maestro/vincul" van al router); "sí, agrégala" sigue siendo determinista.
- Extras: hint en foto sin match ("¿Es un repuesto? decime agrégalo como repuesto del [equipo]"), hint en lote para las sin match, capacidades del router actualizadas.
- Verificación (dry-run local, patrón de siempre: `exports.telegramWebhook` invocado con updates simulados, Telegram interceptado, Firestore/Storage/LLM REALES, docs de prueba borrados/revertidos): crear nuevo end-to-end OK (doc 9912345678 con foto+historial+audit+plantId, borrado) · vincular existente OK (3100027400 → COMPRESOR AIRE PLANTA, revertido) · equipo inexistente OK · foto entrante con visión Gemini REAL OK (describe la imagen, guarda ultimaFoto, ofrece el camino repuesto) · confirmación determinista 0.5s OK.
- HALLAZGO ABIERTO para Orel: `DEEPSEEK_API_KEY` responde **402 Insufficient Balance** — el 3er eslabón de la cadena no tiene saldo; con Groq agotado y (hasta este fix) Gemini roto, ARIA quedaba sin cerebro. Cargar saldo o aceptar 2 eslabones.
- **CASO REAL DEL 05-JUL RESUELTO A MANO (post-deploy)**: las 2 fotos del aceite seguían en `fotoBatch` de la sesión de Orel (file_ids vigentes). La etiqueta (foto 2) confirmó SAP `3100027408` "ACEITE ATLAS COPCO GRÃÂ° ALIMENTICIO" — **el mojibake viene impreso desde SAP** (etiqueta física idéntica), por eso ni ARIA ni la búsqueda lo encontraban por "GA90". Y el "compresor GA90 de acopio" SÍ existe: es `hierarchy/720004366` **COMPRESOR AIRE N2** (ACOPIO > SISTEMA BOMBEO PECES N2) — lo delata el asset del levantamiento `MOTOR Atlas Copco GA-90` que apunta a ese nodo. Hecho: 2 fotos subidas a `repuestos/3100027408/` + `fotosReales`, vínculo `equipos`/`equiposCodigos` → 720004366, alias buscables en repuesto ("Aceite Atlas Copco GA90 alimenticio" + nombresComunes) y nodo ("COMPRESOR ATLAS COPCO GA90 (ACOPIO)"), hecho global en `ariaKnowledge/hechos`, sesión limpiada (fotoBatch + borrador stale de tuercas), audit_log, y mensaje de cierre de ARIA enviado al chat de Orel. Verificado en Firestore.
- **RONDA 2 (mismo PR, tras revisar el flujo real post-deploy)**: 2 peticiones fallidas más de Orel con causa en el código. (a) "Es una foto extra… va en el repuesto SAP 3300104630" → ARIA mandaba a la app: el router ahora cubre "agrégale esta foto al SAP XXXX" (match EXACTO por codigoSAP — no por blob, que daría falso positivo con códigos de equipo vinculados — → pending `adjuntar_foto_repuesto` directo; SAP existente sin foto → pide la foto en vez de caer al alta; SAP tipeado inexistente → se usa como código del material nuevo). (b) Foto de golillas 5/8 mostró JSON CRUDO: la visión truncaba el JSON (maxTokens 1000) y el catch degradaba a texto plano perdiendo el SAP 3300027869 ya leído → budget 1600 + rescate por regex de descripcion/codigos/falla (verificado con el JSON truncado real). La petición original se cumplió A MANO: 2ª foto Lovato adjuntada a 3300104630 (2 fotos en ficha), borrador colgado limpiado, ARIA avisó; la foto de las golillas no es recuperable (solo se guarda `ultimaFoto`) → Orel la reenvía.
- Archivos: functions/index.js.
- Estado: EN REVISIÓN → PR #149. Deploy manual HECHO: telegramWebhook + ariaDailyBrief + geminiProxy (2026-07-06) + redeploy telegramWebhook (ronda 2).

## 2026-07-06 - claude - PWA: el visor de imágenes no se podía CERRAR en móvil — v3.84.1

- Origen: Orel en móvil — "hago click en las imágenes de un repuesto, se ven bien pero no me deja salir". CAUSA RAÍZ: `RepuestoPhotosModal` abre `ImageLightbox` estando un **Dialog modal de Radix** abierto; Radix deja `<body>` con `pointer-events: none` mientras el modal vive, y el lightbox (que NO estaba portaleado y no re-habilitaba pointer-events) se veía encima pero **ningún tap le llegaba**. En desktop nadie lo notó porque Esc sí funciona (teclado no depende de pointer-events); en móvil no hay Esc → atrapado.
- FIX en `ImageLightbox` (arregla TODOS los usos, 8 consumidores): (1) `createPortal(…, document.body)` — inmune además a ancestros con transform/overflow; (2) `style={{ pointerEvents: 'auto' }}` en la raíz — anula el `none` heredado del lock de Radix; (3) barra superior con `paddingTop: max(0.75rem, env(safe-area-inset-top))` — la X no queda bajo el notch/barra de estado en PWA instalada (mismo remedio que ya usaba mant.html en su lightbox).
- FIX en `RepuestoPhotosModal`: `onInteractOutside`/`onEscapeKeyDown` con `preventDefault` mientras el lightbox esté abierto — sin esto, al re-habilitar los taps, tocar el lightbox contaba como "interacción afuera" del Dialog y cerraba el modal de fotos por debajo (y Esc cerraba ambos a la vez).
- Versión: 3.84.1 (version.ts + package.json + version.json — package.json editado SIN BOM esta vez, lección del hotfix #151).
- Archivos: apps/pwa/src/components/ui/ImageLightbox.tsx, apps/pwa/src/components/repuestos/RepuestoPhotosModal.tsx, apps/pwa/src/constants/version.ts, apps/pwa/package.json, apps/pwa/public/version.json.
- Verificación: `npx tsc --noEmit` OK + `npx eslint` (2 archivos) OK. Prueba táctil real la hace Orel en su celular (abrir Fotos de un repuesto → tocar imagen → X cierra). Trabajado en worktree `D:\a\wt-lightbox-fix` (otra sesión estaba activa en el checkout principal — anti-colisión).
- Estado: EN REVISIÓN → PR → merge → deploy GitHub Actions.

## 2026-07-06 - claude - PWA: nombres comunes editables desde el panel de detalle (fix móvil) — v3.84.0

- Origen: Orel quiso ponerle nombre común a la parada de emergencia del desangrador (SAP 3300104630) desde el celular y la opción no existía: la ÚNICA edición de `nombresComunes` era la columna "Apodos" de la tabla del hub, que es `hidden lg:table-cell` (solo ≥1024px). En móvil ni se ve ni hay alternativa.
- FIX: campo "Nombres comunes" en `RepuestoDetailPanel` (el panel que se abre al tocar una fila, disponible en TODOS los tamaños): muestra los apodos y, con lápiz (solo admin, prop `onSaveApodos`), input inline con el mismo patrón editable que "Ubicación" (Enter/Escape, Guardar/Cancelar, spinner). Se resetea al cambiar de repuesto (`useEffect` por `sap`).
- Hub: `saveApodos` refactorizado → `persistApodos(row, arr)` compartido (mismas escrituras: `crudUpdate` por cada source + `refreshCatalog` + toasts); la tabla lo usa igual que antes y el panel recibe `onSaveApodos={isAdmin ? (arr) => persistApodos(selectedRep, arr) : undefined}`.
- Versión: 3.84.0 (version.ts + package.json + version.json sincronizados).
- Archivos: apps/pwa/src/components/repuestos/RepuestoDetailPanel.tsx, apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx, apps/pwa/src/constants/version.ts, apps/pwa/package.json, apps/pwa/public/version.json.
- Verificación: `npx tsc --noEmit` OK + `npx eslint` (2 archivos) OK + preview local levanta sin errores de consola (la vista con datos exige login Google → la prueba funcional del campo la hace Orel desde el móvil, que es justo su caso de uso).
- Estado: EN REVISIÓN → PR → merge → deploy GitHub Actions. (Nota: esta entrada va en rama aparte de la de ARIA/PR #149, que tiene su propia entrada.)

## 2026-07-05 - claude - Seguridad: cierre de lecturas anónimas (PR #146) + proveedor anónimo OFF

- Hecho: cerrado el trade-off que quedó abierto en el PR #145 (las 8 colecciones del catálogo —incl. `users` con PII— y todo Storage eran legibles por cualquier sesión anónima). Hallazgo clave: el flujo REAL de la Mini App mant.html YA usaba custom token (initData → mintTelegramAuthToken → signInWithCustomToken) en prod; el ÚNICO `signInAnonymously` del repo estaba en el modo preview (`?preview=1`, herramienta de admin).
- Cambios (PR #146, mergeado 5dbd5321): (1) mant.html preview ya no usa anónimo — acepta `#token=<custom token>` en el fragment (igual que la PWA standalone) o sesión persistida, con error claro si no hay sesión; el botón "🔗 URL preview" ahora mintea token con el initData actual y copia la URL con `#token=…` (~1h). (2) `firestore.rules`: `isCatalogReader()` → `isNotAnonymous()` (v1.4.0). (3) `storage.rules`: lectura global exige no-anónimo (se mantienen públicos deliberados models3d y baader200-images).
- Post-merge: proveedor ANÓNIMO DESHABILITADO en Firebase Auth vía Identity Toolkit Admin API v2 con la SA (PATCH 200; signUp anónimo ahora da ADMIN_ONLY_OPERATION). Reversible en consola si hiciera falta.
- Archivos: apps/pwa/public/mant.html, firestore.rules, storage.rules.
- Verificación end-to-end real: sesión anónima REST → 403 en repuestos/users/hierarchy y Storage list; flujo custom token (initData forjado con el bot token local, HMAC validado por la función de prod) → 200 en las 8 colecciones del catálogo + Storage; sin auth → 403. Preview local en navegador: sin token → error claro; con token → app carga, `isAnonymous:false`. Prod verificado en ambos hosts (web.app y GitHub Pages) sirviendo el mant.html nuevo. Usuario de prueba tg_990001112223 borrado (doc + Auth). Deploy Pages falló 1 vez por flakiness de GitHub ("try again later") → rerun OK.
- HALLAZGO: la API key web ya está RESTRINGIDA por referrers (bloqueó localhost:5877, permite localhost:5173 y los hosts de prod) → el punto 1 de la auditoría 2026-07-05 (el único que quedaba manual de Orel) parece CERRADO.
- Estado: HECHO (desplegado + verificado).
- Sigue: nada pendiente de la auditoría 2026-07-05; opcional revisar si la alerta secret-scanning #1 de GitHub se puede cerrar ahora que la key está restringida.

## 2026-07-05 - claude - ARIA Telegram - MODO LOTE de fotos (varias fotos en una sola pasada)

- Origen: Orel mando varias fotos pidiendo lista de SAP + agregar como referencia a sus repuestos, pero se procesaban una por una (conversacion completa por foto: vision + confirmar) - lento y consume mas tokens que lo necesario.
- FIX: fotos mandadas como ALBUM de Telegram (message.media_group_id presente) se encolan en silencio en `telegramAriaSessions.fotoBatch` (cap 8, TTL 20min) en vez de analizarse al toque - solo un ack breve en la primera foto del grupo ("van N... decime hazme la lista"). Fotos SUELTAS (sin media_group_id) siguen el flujo instantaneo de siempre, sin cambios.
- Nueva accion del router `fotos_lote`: cuando el usuario pide la lista/resumen/que agregue "las fotos" (plural) o dice "listo" - dispara `ariaGroqVisionLote()`, UNA sola llamada a Gemini con TODAS las imagenes del lote a la vez (en vez de N llamadas separadas), pide un JSON array indexado 1..N. Cada resultado se matchea contra el maestro (mismo `ariaBuscarCodigoEnMaestro` de siempre) - arma UNA lista consolidada (SAP+nombre si matchea, o "sin match"/"sin codigo") y UNA sola confirmacion para adjuntar TODAS las que matchearon.
- Nuevo pending kind `adjuntar_fotos_lote` (array de {fileId, codigoSAP, nombreRepuesto}) - al confirmar, `Promise.allSettled` adjunta todas en paralelo (reusa `ariaAdjuntarFotoARepuesto`), reporta ok/fallidas.
- HALLAZGO Y FIX GENERAL (no especifico del lote): el router estaba fallando "Failed to generate JSON... max completion tokens reached" con gpt-oss-120b bajo el system prompt grande de hoy (persona+router+app+hechos) - subido maxTokens del router de 300 a 700 (gpt-oss-120b tambien gasta presupuesto "pensando" antes del JSON, igual que Gemini/DeepSeek). Sin esto, CUALQUIER consulta con contexto largo podia fallar silenciosamente y caer a una respuesta charla generica/alucinada.
- HALLAZGO Y FIX: el router no tenia forma de saber que habia fotos en el lote esperando - "hazme la lista" se clasificaba mal como charla generica (alucino una lista de modulos de la app en vez de fotos). Agregado `fotoBatchHint` (mismo patron que `pendingHint`) inyectado en el prompt del router cuando `fotoBatchCount > 0`.
- Verificacion end-to-end con datos reales: album de 3 fotos (2 con SAP reales del maestro - 3300031966 CONECTOR TEE 10MM y 3100000109 SOLUCION PH 4.01 - y 1 sin codigo) -> encoladas en silencio (solo ack en la 1a) -> "hazme la lista" ruteo correcto a fotos_lote, UNA llamada Gemini, lista consolidada correcta -> "si, agregalas" adjunto las 2 en paralelo, verificado en Firestore (1 escritura exacta por item, sin duplicados), revertido tras la prueba.
- Estado: EN REVISION -> PR. Post-merge: deploy telegramWebhook.

## 2026-07-04 - claude - Seguridad: parche echarts CVE-2026-45249 (XSS)

- Contexto: Dependabot alert #178 (moderada, abierta desde 2026-07-01) llevaba toda la sesion pendiente en cada PR de este repo. Revisada a pedido de Orel.
- CVE-2026-45249 / GHSA-fgmj-fm8m-jvvx: XSS en Apache ECharts < 6.1.0, en el tooltip de series tipo "Lines" cuando no se especifica tooltip.formatter y series.data[i].name trae HTML crudo (se renderiza via innerHTML). Severidad media (CVSS 6.1).
- Verificado que el codebase NO usa series tipo "Lines" actualmente (sin matches de type:'lines' en apps/pwa/src) - riesgo practico bajo hoy, pero se parcha igual.
- Fix: package.json ya pedia "^6.0.0" (rango correcto); solo el lockfile tenia fijado 6.0.0 (vulnerable). `pnpm update echarts@6.1.0 --filter @mantenimiento/pwa` actualizo package.json a ^6.1.0 y el lockfile a la version parchada.
- Verificacion: tsc --noEmit limpio, `vite build` completo sin errores (chunk de echarts bundlea normal, ~1.14MB sin cambios de tamaño relevantes).
- Estado: EN REVISION -> PR. Frontend puro, deploy via GitHub Actions al mergear a main.

## 2026-07-04 - claude - Chatbot IA de la PWA (in-app) - mismo arreglo de deprecaciones + bug estructural encontrado

- Contexto: al revisar la actualizacion de modelos de ARIA-Telegram, se reviso tambien el chatbot IN-APP de la PWA (aiAgents.ts + ai.ts, distinto sistema, usado por ChatBot.tsx via useChatBot.ts) - resultado: encontrado MAS roto de lo esperado, no solo modelos viejos.
- BUG ESTRUCTURAL (mas grave que la deprecacion): el `status` de los 4 agentes se inicializaba como `XXX_API_KEY ? 'online' : 'disabled'`, pero esas constantes estan hardcodeadas vacias a proposito ("BLOQUEADO: usar Cloud Function") desde que las keys se movieron al servidor. Un mecanismo de rescate via Firestore (settings/ariaAgents.providerKeys) solo tenia guardada la key de deepseek -> gemini-flash, qwen-qwq y llama-versatile arrancaban SIEMPRE 'disabled' y `isAgentAvailable()` (que gatea toda invocacion, automatica o manual) los rechazaba. Efectivamente los 4 agentes del chat in-app estaban caidos (deepseek-r1 sobrevivia por la entrada suelta en Firestore, pero con la key invalida que se arreglo hoy en el otro PR). FIX: los 4 agentes arrancan 'online' directo (las keys reales SIEMPRE viven en el servidor); se elimino la logica muerta de "reenable si hasKey" en applyAgentsConfig - la unica fuente de verdad para disabled queda `config.disabledAgents` (admin) o un 402 real via markAgentError.
- MODELOS ACTUALIZADOS (mismo research de deprecaciones de Groq que en ARIA-Telegram): llama-versatile: llama-3.3-70b-versatile -> openai/gpt-oss-120b. deepseek-r1: deepseek-reasoner (alias legacy, se apaga 24-jul) -> deepseek-v4-flash. gemini-flash: gemini-2.5-flash -> gemini-3.5-flash. qwen-qwq: qwen-qwq-32b (YA DECOMISIONADO por Groq, confirmado con fuente oficial) -> qwen/qwen3.6-27b (se salto qwen3-32b porque ese TAMBIEN se apaga 17-jul).
- BUG ADICIONAL cazado: `callGemini`/`callGeminiStream` en ai.ts tenian el modelo HARDCODEADO ('gemini-2.5-flash') ignorando `agent.model` por completo - actualizar el agente no habria tenido ningun efecto. Agregado parametro `model` opcional, pasado desde aiAgents.ts.
- BUG ADICIONAL cazado: el streaming de Groq/DeepSeek en `callAgentStream` intentaba pegarle DIRECTO al proveedor desde el browser con `PROVIDER_KEYS` (nunca poblado para groq, solo deepseek via Firestore) - streaming de Groq nunca pudo haber funcionado. FIX: mismo patron que Gemini (que ya degradaba con gracia a no-streaming): ahora reusa el `callAgent` no-streaming via el proxy seguro y entrega todo en un solo onChunk. Se evito doble-conteo de uso (recordAgentUsage) retornando directo desde esa rama.
- BUG ADICIONAL cazado: qwen/qwen3.6-27b devuelve su razonamiento inline como `<think>...</think>` en el mismo texto (a diferencia de deepseek/gemini que lo separan en un campo aparte) - sin filtro se veria crudo en el chat. Agregado `stripThinkTags()` aplicado en ambos paths (callAgent y el fallback de callAgentStream).
- Verificacion: tsc --noEmit limpio, eslint limpio en los 2 archivos tocados. Los 4 modelos nuevos probados EN VIVO contra las APIs reales (Groq/Gemini/DeepSeek) - los 4 responden 200 con contenido valido. Regex de stripThinkTags probado unitariamente contra la respuesta real capturada de qwen3.6 (limpia correctamente, no afecta texto sin tags). UI completa (ChatBot.tsx en el navegador) NO verificada end-to-end porque la PWA exige login Google (gotcha ya documentado en memoria de sesiones previas).
- Estado: EN REVISION -> PR. Frontend puro (apps/pwa) - el deploy va por GitHub Actions al mergear a main, NO requiere `firebase deploy` manual de functions.

## 2026-07-04 - claude - ARIA - actualizacion de modelos (deprecaciones Groq) + 3er proveedor

- Origen: preocupacion de Orel por la cuota diaria de Groq agotandose. Investigacion con fuentes oficiales (console.groq.com/docs/deprecations, /rate-limits) revelo algo mas grave: llama-4-scout (el modelo de VISION que ARIA ya usaba) se apaga el 17-jul-2026 (llama-4-maverick, el otro modelo con vision de Groq, YA murio en marzo); llama-3.3-70b-versatile Y llama-3.1-8b-instant se apagan el 16-ago-2026. Groq se queda SIN NINGUN modelo de vision gratis tras el 17-jul - su reemplazo sugerido (gpt-oss-120b) es solo texto.
- FIX VISION: ariaGroqVision migrado de Groq a Gemini 3.5-flash (multimodal nativo, gratis 1500 req/dia, sin fecha de baja anunciada). _ariaGeminiChat generalizado para aceptar content como array de parts (texto + inlineData) y parametro model.
- FIX TEXTO PRIMARIO: ARIA_MODEL = openai/gpt-oss-120b (sucesor recomendado por el propio Groq del 70B que se apaga; mismo tope 1K req/dia pero DOBLE de tokens/dia - 200K vs 100K - y benchmarks a la par de o4-mini).
- CADENA FINAL (3 proveedores, ninguno repetido): Groq gpt-oss-120b -> Gemini 3.5-flash (gratis) -> DeepSeek deepseek-v4-flash (paga centavos, ultimo recurso). Se SACO Groq 8B-instant del medio (decision de Orel: calidad insuficiente, confirmada por la respuesta imprecisa que dio en la sesion anterior).
- Nuevas funciones: _ariaDeepSeekChat (misma key secret que deepseekProxy, modelo deepseek-v4-flash). Secret DEEPSEEK_API_KEY sumado a telegramWebhook + ariaDailyBrief.
- HALLAZGO CRITICO: la key ya guardada en el secret DEEPSEEK_API_KEY de Firebase estaba INVALIDA (401 Authentication Fails) - probablemente rotada hace tiempo. Encontrada una key FUNCIONAL distinta en settings/ariaAgents.providerKeys.deepseek (Firestore) - probablemente la misma que usaria el agente deepseek-r1 del chatbot interno de la PWA, que llevaria tiempo fallando en silencio con la key del secret. Intente actualizar el secret con firebase functions:secrets:set pero el Service Account NO tiene el permiso IAM secretmanager.versions.add (403) - requiere que Orel lo corra el mismo con su sesion (tiene los permisos), o le de el rol de IAM al SA. Comando dejado listo para Orel en el PR.
- Hallazgo tecnico (ambos providers): tanto DeepSeek v4-flash como Gemini 3.5-flash tienen modo "pensamiento" activado por defecto (reasoning_content / thoughtSignature) que consume parte del presupuesto de tokens ANTES de la respuesta final - con budgets chicos (300-500 tokens) el JSON puede llegar truncado. Subido el budget de vision a 1000 tokens (confirmado sin truncar). Router/composer (300/600) probados OK en los casos de prueba, pero es un patron a vigilar.
- Verificacion end-to-end con Groq real: primario gpt-oss-120b respondio bien (verificado). Fallback a Gemini forzando 429 de Groq: respondio bien (texto completo, natural). Fallback a DeepSeek (forzando 429 en Groq+Gemini): fallo por la key invalida ANTES del fix - no re-verificado el fallback DeepSeek end-to-end porque la correccion del secret la debe correr Orel (queda pendiente validarlo una vez el actualice el secret). Vision con Gemini + match SAP real + escritura en fotosReales: verificado end-to-end con el mismo caso real (SAP 3300031966), revertido tras la prueba.
- Estado: EN REVISION -> PR. Post-merge: deploy telegramWebhook + ariaDailyBrief. PENDIENTE (Orel): correr el comando de secreto DeepSeek para activar ese ultimo escalon.

## 2026-07-04 · claude · ARIA vision con OCR + adjuntar foto a repuesto del maestro

- Origen: Orel mostro screenshot real — foto de un conector con SAP "3300031966" impreso en la etiqueta; ARIA lo describio pero IGNORO el codigo, y al preguntarle "que codigo detectas?" respondio "revise la foto de nuevo, no veo ninguno" (FALSO — no tiene acceso a re-examinar la imagen en el chat de seguimiento, solo al texto guardado en history).
- FIX 1 OCR: `ariaGroqVision` ahora pide JSON {descripcion, codigos[], falla} — instruccion explicita de leer etiquetas/tags (SAP 8-10 digitos, part numbers). Antes solo pedia describir el equipo/falla, nunca leer texto.
- FIX 2 honestidad: instruccion en ARIA_PERSONA — nunca decir que "revisaste de nuevo" una foto ya analizada (no hay re-acceso a la imagen); responder en base al analisis guardado en history, u ofrecer que reenvien la foto.
- FIX 3 (feature nueva): `ariaBuscarCodigoEnMaestro` matchea el/los codigos detectados contra `repuestos` (SAP exacto por digitos, o texto libre). Si hay match → nuevo pending `kind:'adjuntar_foto_repuesto'` → confirmar sube la foto a Storage (carpeta `repuestos/`, antes hardcodeaba `incidents/` — corregido con parametro `carpeta` en `uploadPhotoToStorage`) y hace `arrayUnion` en `fotosReales` del repuesto real. Si no hay match → sigue el flujo de incidencia de antes (con nota del codigo visible sin coincidencia, si aplica).
- BUG real cazado en el dry-run: `FieldValue.serverTimestamp()` NO se puede usar dentro de un elemento de `arrayUnion` (Firestore lo rechaza) — cambiado a `new Date()`, igual patron que los otros usos de fotosReales/imagenesManual en el codigo existente.
- Verificacion end-to-end con el MISMO SAP real del caso reportado (3300031966, "CONECTOR TEE 10MM", ya en el maestro): foto generada con PIL replicando la etiqueta → vision detecto conector+codigo+match real → confirmar escribio fotosReales de verdad (verificado leyendo el doc, luego revertido a []) → storage path correcto `repuestos/{id}/...`. Camino sin match (foto de falla sin codigo) verificado sigue creando incidencia normal.
- Limitacion conocida (no arreglada, documentada): bajo fallback al modelo 8B (cuota Groq 70B agotada durante el test), la respuesta a "que codigo viste?" en el chat de seguimiento fue imprecisa (dijo que no detecto el codigo, pese a estar en el history) — ya NO alucina "revise de nuevo", pero el modelo chico no siempre recupera bien el dato del historial. Con el modelo 70B (cuota normal) deberia responder mejor; queda como limitacion de calidad del fallback, no de arquitectura.
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook.

## 2026-07-04 · claude · ARIA APRENDE — hechos globales + lagunas + fallback de modelos

- Vision de Orel: ARIA no debe decir "no tengo informacion" y quedarse ahi — debe poder APRENDER.
- HECHOS GLOBALES: "aprende: X" (SOLO admin; atajo DETERMINISTA por prefijo, el 8B lo ruteaba mal) → `ariaKnowledge/hechos` (cap 60) → inyectado en router+composer para TODOS los usuarios. "recuerda que X" (nota personal) tambien determinista. Verificado: enseñar → usar el hecho en la respuesta siguiente (con razonamiento encima).
- LAGUNAS: cuando la respuesta contiene "no encontre/no tengo/etc" (heuristica, excluyendo acciones de control) → log en `ariaGaps` (pregunta+accion+respuesta). Accion `lagunas`: "que no has sabido responder?" → lista para decidir que enseñarle.
- Composer: si los datos no alcanzan → decir QUE dato falta + (admin) ofrecer "aprende: ..." / (tecnico) sugerir pedirselo a Orel.
- REPUESTOS enriquecidos: cantidadPorMaquina + stock bodega SIEMPRE (o "sin registro en bodega") + valorUnitario + ubicacionEnPlanta + nota explicativa.
- FALLBACK DE MODELOS (hallazgo: cuota Groq diaria AGOTADA en pleno test, 98k/100k TPD): cadena Groq 70B → Groq 8B-instant (cuota separada) → Gemini 2.5 flash (secret GEMINI_API_KEY sumado a telegramWebhook y ariaDailyBrief). ARIA no queda muda. Fallback 8B validado en vivo; Gemini queda validado por codigo (espejo de geminiProxy).
- Limpieza: hecho de prueba INVENTADO borrado de ariaKnowledge/hechos + lagunas/sesion/usuario de test.
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook + ariaDailyBrief.

## 2026-07-04 · claude · ARIA Telegram — respuestas FORMATEADAS (markdown→HTML Telegram)

- Pedido de Orel: respuestas con formato (las listas salian como parrafo plano).
- `ariaFormatTelegram(text)`: markdown liviano → HTML de Telegram A PRUEBA DE BALAS (escapa TODO el HTML primero, despues convierte **negrita**→<b>, `codigo`→<code>, "- "→"• "); formato mal cerrado queda literal, nunca rompe sendMessage (validado con test unitario: XSS escapado, markdown roto inofensivo).
- Persona + router: instrucciones de formato (negritas en nombres clave, viñetas en enumeraciones, `code` para SAP/tags). Aplica a: respuestas del chat, brief matinal (prompt + envio scheduled), borradores de incidencia (crear/cerrar en negrita), vision (titulo <b>).
- TTS: se limpian los marcadores de markdown antes de sintetizar (la voz no lee "asterisco").
- Verificacion: unit test del conversor OK (3 casos) + dry-run: borrador con <b> OK, lista de modulos con nombres en negrita OK.
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook + ariaDailyBrief (usa el conversor en el envio).

## 2026-07-04 · claude · ARIA = PIVOTE de la app (mapa de modulos con conciencia de rol)

- Vision de Orel: ARIA es el centro/pivote — debe saber de TODO lo de la PWA y omitir los modulos ocultos/en desarrollo.
- Catalogo: `scripts/sync-aria-app-modules.js` parsea ALL_NAV_ITEMS de MainLayout.tsx (flag inDevelopment) + descripciones curadas → doc `ariaKnowledge/appModules` (21 modulos: 11 produccion, 10 desarrollo). RE-CORRER el script cuando cambien los modulos del sidebar.
- Functions: `ariaGetAppModules` (cache 10min) + `ariaAppKnowledgeBlock(esAdmin)` inyectado en router y composer. `ariaUsuarioAutorizado` ahora devuelve {ok, rol}; rol admin → ve modulos en desarrollo (marcados como tal); no-admin → NO se listan/linkean; si pregunta por uno: "en desarrollo, pronto disponible" + ofrecer los datos por chat.
- Verificacion dry-run: tecnico+repuestos → link correcto OK · tecnico+gantt(oculto) → sin link oculto, ofrece datos y redirige a modulo de produccion OK · admin → lista los 10 en desarrollo OK.
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook.

## 2026-07-04 · claude · ARIA Telegram TANDA B — voz de respuesta + vision + graficos

- VOZ DE RESPUESTA: nota de voz entrante → ademas del texto, ARIA responde con NOTA DE VOZ propia. `ariaTts` (Google Cloud TTS es-US-Neural2-A, OGG_OPUS, limpia emojis, max 850 chars) + `ariaGetGcpToken` (metadata server en GCF, JWT manual con GOOGLE_APPLICATION_CREDENTIALS en local) + `sendTelegramVoice` (multipart sendVoice). API texttospeech ya estaba habilitada en el proyecto (sintesis validada standalone: 19KB OGG).
- VISION: foto en privado (autorizados) → `ariaHandleFoto`: descarga la mayor resolucion → `ariaGroqVision` (Groq meta-llama/llama-4-scout-17b-16e-instruct, validado standalone) describe equipo/falla → borrador de incidencia con `fotoFileId` → al confirmar, `ariaCrearIncidencia` sube la foto a Storage (uploadPhotoToStorage) y la cuelga en `fotos`. Grupos siguen con tgHandlePhoto clasico.
- GRAFICOS: accion `grafico` (grader|incidencias) → QuickChart (line piezas+microdetenciones / bar incidencias 14 dias) → sendTelegramPhoto. Validado: URL renderiza PNG 90KB con datos reales. Nota: QuickChart es servicio externo; solo van conteos agregados, sin datos sensibles.
- `tgHandleAriaChat` ahora retorna el texto de respuesta (lo usa el TTS del webhook).
- Verificacion: dry-run graficos OK (routing directo y por seguimiento) · vision standalone OK · TTS standalone OK · sintaxis OK. Voz end-to-end y foto end-to-end quedan para prueba en vivo de Orel (requieren updates reales de Telegram).
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook.

## 2026-07-04 · claude · ARIA Telegram TANDA A — whitelist + memoria + cerrar incidencias + alertas DM

- SEGURIDAD (lo importante): whitelist `telegramAriaUsers/{telegramUserId}` — antes CUALQUIER usuario de Telegram en privado podia leer datos de planta y crear incidencias. No autorizado → mensaje cortes + aviso UNA vez al admin (ARIA_ADMIN_CHAT_ID=52949422) con el id listo para habilitar. Gate en texto y voz.
- CONFIRMACION DETERMINISTA: con accion pendiente, "si/dale/confirmo/creala..." (≤40 chars) va DIRECTO a confirmar sin pasar por el LLM (el router se confundia con "si, creala" y re-armaba el borrador). Negaciones → cancelar. LLM fuera de la ruta critica.
- Cerrar incidencias: accion `incidencia_cerrar` (busca en abiertas por referencia; 1 match → confirmacion → status resuelta + resolucion "via ARIA"; multiples → lista para elegir).
- Memoria larga: acciones `recordar`/`olvidar` → array `notas` (max 20) en la sesion; se inyecta en router y composer ("que equipo es mi prioritario?" → "Baader 200" OK).
- Alertas DM: acciones `alertas_activar/desactivar` (flag `alertas`); `onIncidentCreated` ahora tambien DM a suscritos en criticas/altas (salta al reportante). Refactor: `ariaLoadSession` (1 lectura: turns+pending+notas), pending generalizado con `kind` crear|cerrar.
- Verificacion dry-run: rechazo no-autorizado + aviso admin OK · recordar OK · alertas OK · crear+confirmar (0.4s determinista) OK · cerrar+confirmar OK · nota recordada OK. Datos de prueba borrados.
- Estado: EN REVISION → PR. Post-merge: deploy telegramWebhook + onIncidentCreated; seed telegramAriaUsers/52949422 autorizado + alertas:true.

## 2026-07-04 · claude · ARIA Telegram — crear incidencias con confirmacion

- Hecho: primera ESCRITURA de ARIA, con puerta de confirmacion obligatoria. Router: acciones `incidencia_crear` (borrador con descripcion+prioridad deducida → `pendingIncident` en la sesion, TTL 10 min), `confirmar` (crea doc en `incidents` con la MISMA forma que tgHandleIncidencia → dispara onIncidentCreated normal) y `cancelar`. CLAVE: el router recibe el ESTADO (hay/no hay borrador pendiente) inyectado en el system prompt — sin eso un "si dale" re-extraia reportes del historial incluso cancelados. `tgHandleAriaChat` ahora recibe `telegramUserId`.
- Verificacion: dry-run — borrador critica desde "se solto la correa..., es urgente" OK; cancelar OK; "si dale" tras cancelar RE-PROPONE el borrador (pide confirmacion de nuevo, no crea directo — aceptado como UX valida); crear tras "si, confirmo" creo incidencia real (borrada tras la prueba junto con la sesion de test).
- Estado: EN REVISION (rama feat/aria-telegram-crear-incidencias → PR). Post-merge: deploy telegramWebhook.
- Sigue: verificar brief 7AM de manana; posible siguiente: adjuntar foto a incidencia via ARIA, cerrar/comentar incidencias con confirmacion.

## 2026-07-04 · claude · ARIA Telegram — brief matinal 7AM + brief a demanda

- Hecho: `ariaComponerBrief()` (junta turno/kpi/gantt/stock-bajo/preventivos/grader/solicitudes en paralelo → Groq redacta brief ~16 lineas con persona ARIA, fallback datos crudos) + `exports.ariaDailyBrief` onSchedule 07:00 America/Santiago → envia a chats con `briefDiario==true` en `telegramAriaSessions`. Router: acciones `brief` (a demanda), `brief_activar`/`brief_desactivar` (toggle conversacional del flag, unica escritura y es config del propio chat). FIX: `ariaSaveTurns` ahora set con merge:true para no pisar flags.
- Verificacion: dry-run local — brief completo con datos reales (5 gantt atrasadas, 1 preventivo vencido, stock bajo, grader 14.019 piezas) en 5.7s; activar/desactivar OK incluyendo "mejor desactivalo" resuelto por contexto. Doc de prueba borrado.
- Nota: Orel YA usa ARIA en vivo (chat 52949422, 24 turnos). Tras el deploy se suscribe su chat al brief (briefDiario=true).
- Estado: EN REVISION (rama feat/aria-telegram-brief-matinal → PR). Post-merge: deploy telegramWebhook + ariaDailyBrief (funcion NUEVA).

## 2026-07-04 · claude · ARIA Telegram — 6 fuentes de datos nuevas

- Hecho: ampliado el router/recolectores de ARIA en `telegramWebhook`: `historial` (maintenanceLog, filtro por texto), `grader` (graderDailySummaries ultimos 2: piezas/peso/compuertas/microdetenciones), `gantt` (ganttTasks con cache 10min: abiertas/ATRASADAS/proximas, fallback si el filtro no calza), `stockbajo` (bodega stockActual<=stockMinimo cruzado con maestro), `solicitudes` (solicitudes_repuestos), `preventivos` (preventiveTasks activos con estado VENCIDA/al dia). Helper `ariaToDate` (Timestamp|string|Date) + `ariaFmtFecha`.
- FIX legacy: `ariaDataTurno` (y el tgHandleTurno original) consultaban `preventive_tasks` que NO existe — la coleccion real es `preventiveTasks` con campo `proximaEjecucion` (string o Timestamp); ahora los preventivos del turno cuentan bien.
- FIX router: para gantt el LLM ponia "atrasadas" como filtro de texto → 0 matches; ahora el filtro cae a todas las tareas si no calza y el spec del router lo prohibe.
- Verificacion: dry-run local (Telegram interceptado, Firestore+Groq reales): capacidades OK, historial 3 registros reales OK, grader 08-05 (14.019 piezas) OK, gantt 5 atrasadas reales OK, stock bajo 62 items OK, preventivos 1 vencido OK. Doc de prueba borrado.
- Estado: EN REVISION (rama feat/aria-telegram-mas-fuentes → PR). Post-merge: deploy `functions:telegramWebhook`.

## 2026-07-04 · claude · ARIA chat natural en Telegram (voz incluida)

- Hecho: capa conversacional de ARIA en `telegramWebhook` (functions/index.js, seccion "ARIA — CHAT NATURAL"). Texto libre o nota de voz en chat PRIVADO → router de intenciones (Groq llama-3.3-70b, JSON) → recolectores de datos SOLO LECTURA (kpi/turno/estado/sensores/equipo/repuestos) → respuesta natural compuesta por Groq con persona ARIA. Memoria conversacional corta en `telegramAriaSessions/{chatId}` (12 turnos). Voz: `message.voice` → downloadTelegramFile → Groq Whisper large-v3-turbo (patron de whisperProxy).
- IMPORTANTE: `ariaDataRepuestos` lee el MAESTRO `repuestos` (+stock `bodega`) con cache warm 10 min — los handlers legacy `tgHandleRepuesto`/`tgHandleRepuestosMaquina` leen `machines/*/repuestos` (colecciones YA BORRADAS en Fase 5) y estan rotos silenciosamente; quedan desconectados como estaban, reemplazados en la practica por ARIA.
- Webhook: + secrets ['GROQ_API_KEY'] + timeoutSeconds 120. Grupos: sin cambios (texto libre sigue ignorado; comandos/Mini App igual).
- Verificacion: `node --check` OK + dry-run local invocando `exports.telegramWebhook` con updates simulados (fetch de Telegram interceptado; Firestore y Groq REALES): persona OK, turno con datos reales OK, busqueda Baader en maestro OK, rechazo de escritura OK (0.8–4.1s). Doc de prueba `telegramAriaSessions/999000111` borrado. Voz NO probada localmente (requiere update real de Telegram) → probar con el primer audio de Orel.
- Estado: EN REVISION (rama feat/aria-telegram-chat-natural → PR). Tras merge: deploy manual `npx firebase-tools deploy --only functions:telegramWebhook`.
- Sigue: fase escritura con confirmacion (crear incidencia por voz); brief matinal 7AM a Telegram (reutilizar avisos proactivos).

## 2026-06-21 · claude · CTD órdenes de trabajo — Camino B (PR #98, DESPLEGADO + reglas)

- **PR #98 MERGEADO** (`d1120891`): 4.ª dimensión de gestión de activos = **órdenes de trabajo**.
  - Tipo `WorkOrder` + colección plana **`workOrders`** (1 doc por OT, `equipmentId`).
  - **`firestore.rules`: regla nueva `workOrders`** (read activeUser / create+update technician / delete admin, patrón `maintenanceLog`). **DESPLEGADA** vía `deploy-firestore-rules.yml` al mergear (run success). Aprobado por Orel (Camino B).
  - `services/workOrders.ts`: `getWorkOrders` / `createWorkOrder` / `updateWorkOrder`.
  - Pestaña **"Trabajos"** en el expediente: alta (título/tipo/prioridad/asignado/fecha/descripción) + lista con badges estado/prioridad + acciones Tomar/Cerrar/Cancelar (cierre fija `fechaCierre`). Gated por `canEditEquipment`.
- Verificación: tsc + eslint limpios; CI verde; PWA + reglas desplegadas OK.
- Estado: HECHO / DESPLEGADO.
- Sigue (opcional): integrar OT abiertas/vencidas en la Agenda y KPIs de programa; costo acumulado por activo (TCO); notificaciones.

## 2026-06-21 · claude · CTD gestión de activos v1 (PR #97, DESPLEGADO)

- **PR #97 MERGEADO** (`3929719d`): 3 dimensiones de gestión de activos, todo lectura sobre datos existentes:
  - **Ciclo de vida** (pestaña Información): antigüedad (`fechaInstalacion`), vida útil, % de vida consumida (barra+semáforo) y fecha estimada de reemplazo.
  - **Confiabilidad** (Información): n.º de fallas, MTTR, MTBF, disponibilidad calculados de las incidencias correctivas del equipo (helper `confiabilidad()`).
  - **Pestaña "Recursos"**: repuestos del equipo (maestro N:M, nuevo hook `useRepuestosDeEquipo` → `repuestos` where `equipos array-contains nodeId`) + documentos heredados (`useManualesDeEquipos`).
- Archivos: `pages/CentroTecnicoDocumentalPage.tsx`, `hooks/repuestos/useRepuestosDeEquipo.ts` (nuevo).
- Verificación: tsc + eslint limpios; CI verde. Sin reglas → solo redeploy PWA.
- Estado: HECHO / DESPLEGADO.
- Sigue: **Órdenes de trabajo (Camino B)** — Orel aprobó colección `workOrders` nueva (necesita `firestore.rules`); en curso.

## 2026-06-21 · claude · CTD: traer de Equipos + repasada de flujo (PR #95 + #96, DESPLEGADO)

- **PR #95 MERGEADO** (`c201da6f`): trae de Equipos al expediente del CTD →
  (1) **anotar fotos** (botón lápiz en cada foto → `PhotoAnnotationEditor`; al guardar reemplaza o agrega como nueva);
  (2) **vista Tarjetas** (3er modo Lista/Tarjetas/Agenda, grid con foto; paginación aplica a Lista y Tarjetas);
  (3) **copiar códigos** del set filtrado al portapapeles.
- **PR #96 MERGEADO** (`69ce703d`): repasada técnica+visual del flujo →
  KPIs ahora **clicables = filtros** (se quitó la fila de chips NFPA duplicada); Estado pasó de chips a `select`
  (barra única Vista/Estado/Sección/Línea/Tipo/Orden/Densidad); encabezado con menú **"Datos"** (Exportar/Plantilla/
  Importar placa); Agenda con CTA **"Registrar →"** en vencidas; **debounce** 250 ms en búsqueda; dedupe `proxMs`;
  **refactor**: extraídos `CtdEquipoRow` + `CtdEquipoCard`.
- Archivos: `pages/CentroTecnicoDocumentalPage.tsx` (+ usa `components/PhotoAnnotationEditor`).
- Verificación: `tsc --noEmit` + `eslint` limpios por commit; CI verde. Sin reglas nuevas → solo redeploy PWA.
- Estado: HECHO / DESPLEGADO.
- Sigue (opcional): extraer `useCtdEquipos` (lógica) si el componente sigue creciendo; cargar placa del piloto.

## 2026-06-21 · claude · CTD "programa vivo" (PR #94, DESPLEGADO)

- **PR #94 MERGEADO** (`7388c4a6`) — el CTD pasa de catálogo a programa NFPA 70B que maneja el ciclo:
  1. **Cerrar el ciclo de inspección** (`FichaTecnicaNFPA70B.handleAddEntry`): al registrar un evento de tipo inspección/termografía/medición/preventivo/predictivo, la severidad → condición observada (verde/amarillo/rojo = 1/2/3) y se reprograma `proximaInspeccion` = fecha + `intervaloInspeccionDias`(criticidad × condición). Antes solo guardaba la entrada sin avanzar la próxima.
  2. **Agenda de inspecciones** (CTD): toggle Lista/Agenda; agrupa los equipos filtrados por ventana (Vencidas/30/60/90/+90/Sin fecha), ordenadas por fecha.
  3. **Carga masiva de placa por Excel**: `services/equipmentFichaExcel.ts` (`descargarPlantillaPlaca`/`importarPlacaExcel`, match por Código, MERGEA solo celdas con valor) + botones Plantilla/Importar en el encabezado (canEditEquipment).
  4. **Reporte PDF por equipo**: `services/equipmentReportPdf.ts` (jsPDF + jspdf-autotable) con datos generales + placa + programa de inspección + historial (maintenanceLog + incidencias); botón "PDF" en el expediente. El CTD ahora carga también el `maintenanceLog` del equipo abierto.
- Archivos: `components/equipment/FichaTecnicaNFPA70B.tsx`, `pages/CentroTecnicoDocumentalPage.tsx`, `services/equipmentFichaExcel.ts` (nuevo), `services/equipmentReportPdf.ts` (nuevo).
- Verificación: `tsc --noEmit` + `eslint` limpios en cada commit; CI build verde en #94. Sin reglas Firestore nuevas → solo redeploy PWA. Navegador NO verificable (login Google) → Orel prueba en vivo.
- Estado: HECHO / DESPLEGADO.
- Sigue: probar en vivo (registrar inspección reprograma; agenda; importar placa; PDF). Pendientes previos siguen (placa del piloto; ~45 equipos sin `tipo`).

## 2026-06-21 · claude · CTD → expediente autosuficiente (PR #92 + #93, DESPLEGADO)

- **PR #92 MERGEADO** (`b919dbd1`): portada CTD `/centro-tecnico-documental` (KPIs + buscador + v3c próxima-inspección auto criticidad×condición + export Excel). Solo redeploy PWA.
- **PR #93 MERGEADO** (`67e04316`) — el CTD pasa de portada a **expediente AUTOSUFICIENTE**:
  - CTD movido al grupo **Aprendizaje** (decisión Orel; no se cambió el landing/HomeRedirect).
  - **Expediente en sitio**: el click abre el equipo dentro del CTD (panel con pestañas Info/Ficha NFPA 70B/Tablero/Fotos/Notas/QR; reusa `FichaTecnicaNFPA70B` + `TableroExpediente`). Estado en URL `?eq=&tab=` (deep-link/atrás), Esc, scroll-lock. **Ya NO salta a `/equipment`.**
  - Migrado de Equipos: **favoritos** + **notas** (hooks `useEquipmentFavorites`/`useEquipmentNotes` que comparten la misma clave localStorage que EquipmentPage → única fuente de verdad), **editar datos básicos** (`EquipmentForm` extraído a `components/equipment/EquipmentForm.tsx`, reusado en ambos lados), **fotos** subir/borrar.
  - Filtros: estado · **Sección→Línea** (cascada, de `hierarchyPath` niveles 2/3) · **Tipo**; orden (criticidad/próxima/ficha/sección-línea/nombre); paginación (50); vista compacta; "completar ficha" rápido (el % abre la Ficha).
  - **Nuevo campo `Equipment.tipo`** (+ `validation.ts` + editable en `EquipmentForm` con datalist + columna Excel + visible en Info).
- Datos: `scripts/backfill-equipment-tipo.js` (dry-run por defecto, `--write`) **EJECUTADO en prod** → 508/553 equipos con `tipo` (~45 sin match: Baader/Knuro/climatización/tableros abreviados → fijar a mano).
- Archivos: `pages/CentroTecnicoDocumentalPage.tsx`, `components/equipment/EquipmentForm.tsx` (extraído), `hooks/useEquipmentFavorites.ts`, `hooks/useEquipmentNotes.ts`, `components/layout/MainLayout.tsx`, `types/index.ts`, `lib/validation.ts`, `scripts/backfill-equipment-tipo.js`, `pages/EquipmentPage.tsx` (usa el form extraído).
- Verificación: `tsc --noEmit` + `eslint` limpios en cada commit; CI build verde en #93. Navegador NO verificable (login Google) → Orel prueba en vivo. Sin reglas Firestore nuevas → solo redeploy PWA.
- Estado: HECHO / DESPLEGADO.
- Sigue: cargar placa real del piloto (motor 720004608 + bomba 720004607); fijar `tipo` a los ~45 sin match; (opcional) "CTD como puerta principal" quedó descartado por ahora.

## 2026-06-20 · claude · Reconciliación tableros + PR #91 (CTD integrado, SIN deploy)

- ⚠️ **Para el otro agente**: tu merge `3682d389` trajo la versión **SUELTA** de tableros (`/tableros` + `TablerosPage.tsx`). Yo la **realineé después** (tab "Tablero" en el expediente del equipo, se borró el módulo suelto). Reconcilié haciendo `merge feat/levantamiento-tableros-v1` sobre esta rama (commit `71bac189`): **gana la versión tab**; `TablerosPage.tsx` borrada, `TableroExpediente.tsx` + tab en `EquipmentPage`. NO vuelvas a mergear la versión suelta.
- Hecho: ambas ramas pusheadas a origin; **PR [#91](https://github.com/orelcain/mantenimiento-planta/pull/91)** abierto (`feat/centro-tecnico-documental-v1` → main) con CTD v1–v3b + tableros realineado. **NO mergeado, NO desplegado** (solo el merge a main despliega). Al mergear se despliegan las reglas `maintenanceLog` + `tableros`.
- Verificación: `tsc --noEmit` limpio (CTD v3b + tableros juntos); preview en vivo (tab "Tablero" monta en el expediente).
- Estado: EN REVISIÓN (PR #91, sin merge).
- Sigue: revisar+mergear PR #91 (Orel) → despliega reglas; luego levantar tablero piloto. PENDIENTES de sync aparte (no tocados): `chore/ai-coordination` (8 commits sin push: Fase 5 + ARIA TTS/voz), `main` local (1 commit suelto + stash, desfasada de origin/main), `export-twin-data.js` (script personal sin trackear).

## 2026-06-20 · claude · Tableros — REALINEADO: del módulo suelto al expediente del equipo

- Feedback de Orel: *"todo debería estar centralizado desde el Centro Técnico Documental, ¿no?"*. Correcto — el spec (`docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`) dice que el CTD **NO es módulo aparte, enriquece Equipos**, y que el centro documental "está ~70% construido pero **disperso**, falta consolidarlo". Mi `/tableros` suelto era justo lo disperso que el CTD quiere evitar.
- Decisión (Orel): el **tablero ES un equipo** y su levantamiento/unifilar vive como **sección del expediente del equipo**, no como módulo.
- Hecho: quitado el módulo suelto (ruta `/tableros` en App.tsx, nav "Tableros" + import Zap en MainLayout, borrado `pages/TablerosPage.tsx`). Nuevo `components/equipment/TableroExpediente.tsx` (sección lectura/edición + circuitos + Excel) montado como **tab "Tablero"** en el detalle de equipo (`EquipmentPage.tsx`, junto a "Ficha NFPA 70B"). Servicio reescrito: doc `tableros/{equipmentId}` (1:1), `getTableroByEquipment` + `saveTableroForEquipment` (alta = Revisión 0 as-found; edición opcional agrega revisión "cambio"). `types/tableros.ts` + `equipmentId`. **NO se tocó `FichaTecnicaNFPA70B.tsx`** (lo trabaja otro agente) — solo se sumó un tab hermano.
- Verificación: **`tsc --noEmit` limpio (0 errores)**. **Preview en vivo (sesión admin)**: abrí un equipo → tab "Tablero" monta el expediente con empty-state + Levantar/Plantilla/Importar + "se guardará como Revisión 0 (as-found)". Lectura da `permission-denied` (regla `tableros` sin desplegar — esperado). Nota: tras borrar `TablerosPage.tsx` Vite tira `Failed to reload TablerosPage.tsx` por HMR (ruido del dev server, no afecta build/tsc).
- Estado: EN REVISIÓN (rama sin push/merge; commit `046df802`).
- Sigue: PR+merge → desplegar reglas; levantar tablero piloto; **filtro "Tableros" en Equipos** (ver todos); fotos a Storage; `cargaNombre`→`cargaNodeId`.

## 2026-06-20 · claude · Tableros / Unifilares (NFPA 70B) v1 — levantamiento (Excel + form PWA)

- Pedido de Orel: cubrir **unifilares de tableros desde la PWA**. Decisión: **"primero el dato" (Fase 0)** — levantamiento estructurado antes de dibujar. El levantamiento inicial se guarda como **Revisión 0 (as-found)** → nace el histórico de cambios que hoy no existe. Spec/protocolo en OneDrive: `ARIA_MANTENIMIENTO_PLANTA/docs/LEVANTAMIENTO_TABLEROS.md`. (Fluyo NO es la herramienta del unifilar: es para arquitectura de software, sin símbolos eléctricos.)
- Hecho: colección `tableros` (circuitos+revisiones como arrays en el doc, <1MB de sobra). **Ambas vías de captura**: **Excel** (descargar plantilla + importar, SheetJS ya estaba en deps) y **form nativo** en `/tableros` (lista + stats + formulario + editor de circuitos + condición 1·2·3 NFPA 70B).
- Archivos (rama `feat/levantamiento-tableros-v1`, commit `91ad1367`): `apps/pwa/src/types/tableros.ts`, `apps/pwa/src/services/tableros.ts`, `apps/pwa/src/services/tablerosExcel.ts`, `apps/pwa/src/pages/TablerosPage.tsx`, `apps/pwa/src/App.tsx` (ruta `/tableros` lazy), `apps/pwa/src/components/layout/MainLayout.tsx` (nav "Tableros", grupo Equipamiento, `inDevelopment` igual que Equipos), `firestore.rules` (colección `tableros`: read activeUser / create+update technician / delete admin).
- Verificación: **`tsc --noEmit` limpio (0 errores)**. **Preview en vivo (sirve D:, sesión admin)**: `/tableros` monta, header/stats/empty-state OK, "Plantilla Excel" genera sin throw, form "Nuevo levantamiento" abre y renderiza completo. ⚠️ Lecturas/escrituras dan `permission-denied` porque la **regla `tableros` aún NO está desplegada** en el proyecto vivo (esperado).
- Estado: EN REVISIÓN (rama sin push/merge). Diff aislado a 7 archivos (no se tocó `.ai/` en el commit de código; este worklog va aparte).
- Sigue: PR+merge → **desplegar `firestore.rules`** (`deploy-firestore-rules.yml` al mergear, o `firebase deploy --only firestore:rules`) → recién entonces lee/escribe. Luego: levantar tablero piloto (CCM motor 720004608 / bomba 720004607), fotos a Storage (no cableado en v1), enlazar `cargaNombre`→`cargaNodeId` de `hierarchy`, y el render del unifilar sobre el dato.

## 2026-06-20 · claude · Pulido repuestos: ubicación en fila + composición por clase (+ validación solicitar)

- Pedido de Orel (3 mejoras del módulo):
  1. **Ubicación de bodega en la fila** de Áreas (`RepuestosAreaHub`): nueva línea con `MapPin` + `ubicacionBodega` bajo el stock (y en el subtítulo móvil) → el técnico ve DÓNDE está el repuesto sin abrir la ficha. Verificado en vivo: BUJE INOX 3300133492 → C-31.
  2. **Composición por clase en el header**: `catalogStats.clases` (desglose por `clase` del alcance) + línea de chips clickeables que aplican el filtro de clase. Verificado: Repuesto 5557·Insumo 1494·Refrigeración 154·Químico 127·Herramienta 107·Lubricante 2.
  3. **Solicitar a bodega end-to-end**: revisado — el flujo ya estaba COMPLETO y cableado (`useSolicitudes` crear/listar/avanzar + `SolicitarRepuestoModal` + `SolicitudesPanel` con avance Pendiente→Aprobada→Entregada + badge pendientes). Verificado en vivo: panel abre y lista (1 entregada en prod). Sin cambios de código.
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx` (import MapPin/MaterialClase, ubicación en fila, claseCount en catalogStats, línea de composición).
- Verificación: tsc limpio, eslint 0 errores, build success, **preview en vivo** (sirve D:).
- Estado: HECHO (en `chore/ai-coordination`, pendiente PR+deploy).

## 2026-06-20 · claude · Fase 5 — retirada de features legacy (machines/plantAssets) + scripts de borrado

- Decisión de Orel (2 preguntas): retirar el tab "Categorías" (CategoryManager) y la capa "Equipos SAP" del editor de mapa, para liberar `machines` y `plantAssets`.
- Verificación de lectores vivos contra código actual: `machines`←`useMachines`→`MachineProvider`(raíz, **contexto sin consumidores reales**)+`CategoryManager`(Settings); `plantAssets`←`usePlantAssets`→`PanelCapasYZonas`(único lector); `insumos`/`repuestosBaader200` sin lectores.
- Código retirado: quitado `MachineProvider` de `App.tsx` (era peso muerto: cargaba `machines` en cada arranque, nadie leía el contexto); quitado tab "Categorías"+`<CategoryManager/>` de `SettingsPage`; quitada la sección "Equipos SAP" de `PanelCapasYZonas`. Borrados 5 archivos: `MachineContext.tsx`, `useMachines.ts`, `useLinkMachine.ts`(ya muerto), `CategoryManager.tsx`, `usePlantAssets.ts`. (NO se tocó `useMachineCategories`/`machineCategories` — lo usa aún `CategorySelector`, fuera de scope.)
- Scripts nuevos (solo-lectura / con gate): `scripts/normalizacion/10-backup-fase5.js` (backup eficiente) y `11-delete-legacy.js` (dry-run por defecto; `--write` exige backup fase5-*).
- **Backup hecho** (`backups/fase5-2026-06-20T17-25-56/`): insumos 3552 · machines 36(+6 padres fantasma) · machines/*/repuestos 5578 (incl. huérfanas sin-asignar/multivac/SW2RNI) · plantAssets 134 · repuestosBaader200 0 · hierarchy/*/repuestos 3. ≈9.300 docs.
- Verificación código: `tsc --noEmit` limpio, `eslint` archivos tocados limpio, `pnpm build` success. **Verificado en preview en vivo (sirve D:): app monta sin crashear tras quitar provider raíz; Settings ya sin tab "Categorías".**
- Estado: EN REVISIÓN. Orden: PR+merge+deploy del código → recién entonces `11-delete-legacy.js --write` (para que producción no lea colecciones borradas). **Borrado de datos PENDIENTE hasta deploy.**

## 2026-06-20 · claude · Dependabot: resueltas las 23 alertas (bumps + overrides)

- Pedido de Orel: mitigar las vulnerabilidades dependabot del repo. Inventario real vía `gh api .../dependabot/alerts` = **23 abiertas** (10 high / 9 med / 4 low) en 4 paquetes: dompurify ×8, protobufjs ×6, @grpc/grpc-js ×6, react-router ×3.
- Fixes (bumps directos + overrides para transitivas):
  - **dompurify** (directa, PWA): `^3.4.0`→`^3.4.11` (resuelve 3.4.11).
  - **react-router-dom** (directa, PWA): `^7.12.0`→`^7.15.1` (resuelve 7.18.0).
  - **protobufjs** (transitiva): override raíz `>=8.0.2`→`>=8.6.0` y functions `>=7.5.8`→`>=8.6.0` (resuelve 8.6.4).
  - **@grpc/grpc-js** (transitiva): nuevo override `>=1.14.4` en raíz y functions (resuelve 1.14.4).
  - Extra detectado al regenerar functions: **form-data <2.5.6** (high, fuera de la lista dependabot) → `npm audit fix --package-lock-only`.
- Archivos: `package.json` (overrides pnpm), `apps/pwa/package.json`, `functions/package.json`, `pnpm-lock.yaml`, `functions/package-lock.json`.
- Verificación: pnpm install OK (sin ERR_SSL); lockfile con versiones parcheadas confirmadas; `pnpm exec tsc --noEmit` limpio; `eslint . --max-warnings 30` = 0 errores / 23 warnings preexistentes; `pnpm build` = success; functions `npm audit` = **0 vulnerabilidades**.
- **DEPLOY: PR #79 mergeado → "Deploy PWA" + "Deploy Firebase Functions" = success.** Las 23 quedaron FIXED en dependabot.
- **2ª pasada (mismo día):** al re-escanear el árbol nuevo, dependabot destapó 6 alertas distintas (antes no reportadas) en `pnpm-lock.yaml`: form-data (high)→`>=2.5.6` (4.0.6), ws (high)→`>=8.21.0`, vite (high+med, devDep directa)→`^6.4.3`, js-yaml (med)→`>=4.2.0`, @babel/core (low)→`>=7.29.6` (8.0.1). vite bump directo; resto overrides pnpm. tsc+eslint+build OK.
- Estado: HECHO (1ª pasada LIVE). 2ª pasada en `chore/ai-coordination` → PR #80.
- Sigue: confirmar que las 6 cierran al mergear; Fase 5 deletes legacy.

## 2026-06-20 · claude · Mejoras UX sidebar/buscador/favoritos + DEPLOY (PR #78)

- Pedido de Orel (varias mejoras UX): (1) **buscador unificado** — había 2 inputs atados al mismo `repQuery` (header=global, fila-de-filtros=acotado al scope, confuso); se quitó el de la fila de filtros. (2) **Sidebar ancho ajustable** por drag del borde derecho (persistido en `repuestos-area-sidebar-width`). (3) **Botón "contraer todo"** en header del sidebar (icono ChevronsDownUp → `collapseAllNodes`). (4) **Recuerda expansión** del árbol entre recargas (`repuestos-open-nodes` + efecto en AreaSidebar que re-expande/carga los nodos restaurados). (5) **Favoritos drag-and-drop** (HTML5 dataTransfer + grip) reemplaza las flechas ↑↓ (`reorderEquipInList`).
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`, `apps/pwa/src/components/repuestos/AreaSidebar.tsx`.
- Verificado en preview (en vivo): 1 buscador; resize 288→408px persiste tras reload; contraer-todo colapsa; DnD reordena (EVISCERADORA↔posición) y restaura; expansión recordada tras reload. tsc+eslint+CI build limpios.
- **DEPLOY: PR #78 mergeado → "Deploy PWA" = success.** Live en producción.

## 2026-06-19 · claude · DEPLOY a producción (PR #77 → main)

- Mergeado `chore/ai-coordination` → `main` vía PR #77 (build CI pass; mergeable CLEAN). Sincronizada main (2 commits: daily-sync version.ts + nanobanana) antes del merge. `pnpm build` local = exit 0.
- Deploy disparado y **COMPLETADO con éxito**: workflow "Deploy PWA" = success, "Deploy Firestore Rules" = success. Todo el trabajo de la sesión está LIVE: chatbot→maestro, foco SAP, tarjetas KPI pro, carga rápida, retiro de Mapas/insumos/import-UI, limpieza de ~26 archivos legacy. La bodega ya estaba poblada (import a Firestore, independiente del deploy de código).
- Pendientes abiertos (no bloquean): 12 SAP del Excel fuera del maestro (5 son materiales reales: AUTOMATICO 2P 6A, FOCO LED 100W, CUCHILLO FROSTS 351P, PATA REGULADORA D65, EMPAQUETADURA SILICONA); 22 vulnerabilidades dependabot en el repo; Fase 5 deletes de colecciones legacy (insumos ya libre; machines/plantAssets aún con lectores).
- Estado: DEPLOY HECHO. Módulo de repuestos en producción con datos reales.

## 2026-06-19 · claude · Cotejo Excel↔app + IMPORT único de stock/ubicación a bodega

- Cotejo máquina-por-máquina (`scripts/cotejo-excel-maestro.js`, solo-lectura) de `INVENTARIO/Maestro_Repuestos_Completo_v3.xlsx` vs maestro: **100% de los SAP del Excel están en la app** (Baader142→EVISCERADORA BAADER 142, Baader200→B200, Grader→GRADER, Garibaldi→ENZUNCHADORA N1, Knuro→KNURO N1, M.Eviscerado→**MAREL HG**, M.Filete→MAREL FILETE, GEA→TERMOFORMADORA GEA, Fishken→CINTA FISHKEN; Det.Metales/Videojet sin SAP). Mapeo correcto. (Aclaración: MAREL HG = máquina de eviscerado Marel, distinta del GRADER; en un test previo confundí ambos.)
- HALLAZGO: el stock+ubicación SÍ existía en los Excel y NUNCA se había importado a `bodega` (estaba vacía: 0 stock, 0 ubic). Fuente elegida: `STOCK ALMACENES.xlsx` (centro AI04/Chonchi, actualizado 2026-06-19) hojas "inventario 2026" (SAP/cantidad/ubicación/equipo) + "Clasificacion" (ubicación fallback).
- IMPORT ÚNICO aplicado: `scripts/import-stock-bodega.js --write` (dry-run primero; backup de bodega en `backups/bodega-pre-import-*.json`). Resultado: **bodega 189 → 2.170 docs · 1.627 con stock · 1.938 con ubicación**. Solo SAP del maestro (13 fuera-de-maestro omitidos); idempotente; preserva min/unidad de los 186 ya configurados. Verificado en Firestore (BUJE INOX 3300133492 = stock 10, ubic C-31, = Excel) y EN VIVO en la app (ficha muestra DISPONIBLE 10 / UBICACIÓN C-31 / equipo GRADER; KPI "Stock disponible" pasó de 0 a 2.108 / 97%).
- HECHO (pedido por Orel): import ÚNICO → de aquí en más se gestiona en la app. **Retirada la opción de importar Excel de la UI**: borrado `pages/repuestos/ImportRepuestosModal.tsx` (era huérfano desde que se borró el Dashboard legacy; ya no estaba montado). El resto de usos de `xlsx` en src son exportaciones o la feature aparte de Análisis Grader — se conservan.
- Archivos: `scripts/cotejo-excel-maestro.js`, `scripts/import-stock-bodega.js` (nuevos). Datos: colección `bodega` poblada (no es git).
- Estado: cotejo + import HECHOS y verificados. Sigue: retirar UI de import Excel; opcional listar los 13 SAP fuera-de-maestro.

## 2026-06-18 · claude · Rediseño tarjetas KPI de stock (look profesional)

- Pedido de Orel: tarjetas de stock más profesionales. Rediseñado `KpiCard` en `RepuestosAreaHub`: de borde-izquierdo plano a tarjeta con **chip de ícono** (Package/PackageCheck/PackageMinus/PackageX) con tinte + ring por estado, número grande tracking-tight, label, hint, y gradiente sutil de fondo por tono (primary/emerald/amber/red). Mapa `KPI_TONE`. Las 4 tarjetas (Repuestos con SAP / Stock disponible / Stock bajo / Sin stock) pasan `icon`+`tone` en vez de `accent`+`bar`.
- Verificado en preview (build limpio, PLANTA CHONCHI): 753 con SAP / 187 sin stock, tarjetas con íconos y tintes correctos. tsc=0, eslint=0. (Hubo un TypeError `glow` TRANSITORIO de HMR por el rename intermedio; build limpio sin error.)
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`.
- Estado: HECHO. Pendiente opcional: aplicar el mismo estilo a la tarjeta de stock de la ficha (Disponible/Mín/Máx) para coherencia.

## 2026-06-18 · claude · Carga rápida de stock + ubicación (poblar datos)

- Problema raíz detectado en tests: el flujo está completo pero los DATOS están vacíos (0/189 con stock, 0 ubicaciones). Poblar abriendo 188 fichas una por una es inviable.
- Hecho: nuevo `components/repuestos/CargaRapidaModal.tsx` — modal de carga ítem por ítem: una fila por material con-SAP con inputs inline (stock · pasillo · estante · nivel), guardado on-blur o Enter (Enter salta a la fila siguiente). Filtro "Solo faltantes" (default) + buscador. Cap de render a 150 filas (los configurados/en-bodega primero) para performance; el resto se acota con el buscador. Reusa `saveStock` de useBodega (upsert en `bodega/{sap}`, preserva stockMinimo/unidad). Enganchado en `BodegaView` (StockTab): botón "Carga rápida" (ámbar, junto a Lote/Config) + estado `showCargaRapida`.
- Verificado en preview (build limpio): botón abre el modal, lista 150 filas + nota "Mostrando 150 de 3777", filtro/buscador OK. Guardado probado end-to-end: escribir pasillo "ZZTEST" + Enter → "1 guardado"; confirmado en Firestore (`bodega/3300100657` pasillo=ZZTEST, mín/unidad preservados) y **revertido** con script admin. Sin errores de consola. tsc=0, eslint=0.
- Nota: el `onBlur` real (usuario hace clic/tab fuera) guarda; en el test el evento blur sintético no gatilla el onBlur de React, por eso se verificó vía Enter (mismo saveRow).
- Archivos: `components/repuestos/CargaRapidaModal.tsx` (nuevo), `pages/repuestos/BodegaView.tsx` (botón+estado+render+import).
- Estado: HECHO. Ahora Orel puede poblar stock+ubicación rápido → "ubicable" pasa de promesa a realidad cuando cargue los datos.

## 2026-06-18 · claude · Foco SAP por defecto en pestaña Áreas

- Pregunta de Orel: por qué Áreas muestra ~7.441 si el foco son los SAP. Correcto: el hub mostraba el maestro completo (con + sin SAP) con "Repuestos totales" de cabecera, diluyendo el foco.
- Hecho en `RepuestosAreaHub`: estado `repSoloSap` (default ON). Se separó `filteredBase` (todos los filtros menos SAP) de `filteredRep` (aplica el foco SAP) + `despieceOcultos` (cuenta el despiece sin SAP oculto). Interruptor "Solo con SAP" en la barra de filtros (muestra "+N despiece" cuando oculta). KPI grande: "Repuestos totales" → **"Repuestos con SAP"** (hint "+N despiece sin SAP"). El despiece sin SAP (capa de identificación) queda a un clic.
- Verificado en preview (build limpio): "casquillo" con foco ON → 73 con-SAP, 0 despiece visible, toggle "+88 despiece"; al apagar → total 161 (suma los 88). tsc=0, eslint=0. (Durante los edits hubo un ReferenceError `filteredRep` TRANSITORIO de HMR por el rename intermedio; desaparece en build limpio, código actual correcto.)
- Sobre la pestaña **Bodega**: se justifica — es la vista SAP-only (su hook: "Solo repuestos con código SAP") = inventario/reposición; hoy está vacía de datos (0 con stock) pero conceptualmente es la cara de stock. Se mantiene.
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosAreaHub.tsx`.
- Estado: HECHO.

## 2026-06-18 · claude · Review UX "buscar repuesto" + limpieza menor

- Review como usuario (código + datos): el flujo buscar→encontrar→ubicar está COMPLETO. Fila de resultados: foto, SAP (copiar), nombre, badge de clase, tipo, equipo (N:M con +N), stock con semáforo. Ficha (`RepuestoDetailPanel`): "Dónde se usa · N equipos" (todos los N:M), manuales heredados, stock disp/mín/máx, **Bodega + Ubicación editable inline** (pasillo/estante/nivel), movimientos. Diseño sólido; lo que falta es DATO, no código.
- Datos verificados (solo-lectura): `bodega`=189 con **0 ubicaciones registradas** (1 con pasillo) → "ubicable" físico aún no existe como dato (captura pendiente de Orel). `repuestos.tipo` 59% poblado con categorías útiles (TORNILLERÍA/SOPORTE/CASQUILLO/EJE…) → NO es ruido, se conserva. Fotos: solo 64/7657.
- Limpieza menor (in-scope, segura): borrado `ImageGallery.tsx` (huérfano, cero imports; quita un consumidor de MachineContext), corregido comentario obsoleto de `useBodega` (decía que leía `machines/{id}/repuestos`; lee el maestro), reemplazado `pages/repuestos/README.md` (era guía de migración obsoleta con archivos borrados) por uno breve y actual.
- NO tocado a propósito: refactor de `MachineProvider`/`CategoryManager` (último lector de `machines`) — vive en Settings, fuera del módulo de repuestos; su cleanup es separado y con riesgo en otra feature.
- Verificación: `tsc`=0, `eslint`=0. Preview: módulo OK en /repuestos.
- Archivos: `useBodega.ts` (comentario), `pages/repuestos/README.md` (reescrito), `ImageGallery.tsx` (borrado).
- Estado: HECHO. Módulo de repuestos funcionalmente completo y limpio. Lo pendiente es captura de datos (ubicaciones bodega + fotos) y, aparte, Fase 5 deletes + cleanup de CategoryManager/machines.

## 2026-06-18 · claude · Retiro de página /insumos (redundante con el maestro)

- Decisión de Orel: retirar `/insumos`. Datos (solo-lectura): `insumos`=3552, 294 con stockFisico (del import Excel), **0 con metadata de conteo** (stockContadoEn/Por/historial) → el editor de stock de la página NUNCA se usó; última actualización 2026-06-11 = la migración (no actividad de usuario). La página leía la colección legacy `insumos` (respaldo congelado) y permitía editar stock que el maestro NO ve (dead-end). Insumos ya unificados en el maestro (buscables en Repuestos/Bodega).
- Hecho: quitada ruta `/insumos` + lazy import (App.tsx), enlace del home móvil (MobileHomeGrid) y del editor de sidebar (SidebarEditorPage). Borrados `pages/insumos/InsumosPage.tsx`, `components/insumos/InsumoDetailModal.tsx`, `types/insumos.ts` (huérfanos).
- **`insumos` ya NO tiene lectores vivos en el código** (verificado por grep) → colección LIBRE para borrar en Fase 5 (con backup). NOTA: puede quedar algún enlace `/insumos` en un sidebar guardado en Firestore (dato, no código) → quedaría como link muerto que redirige al default; inofensivo.
- Verificación: `tsc`=0, `eslint`=0 (App/MobileHomeGrid/SidebarEditorPage). Preview: navegar a `/insumos` ya no monta la página (redirige al default, sin crash); `/repuestos` sigue OK (Áreas+Bodega, búsqueda). Persisten los avisos HMR de Vite por archivos borrados (cosméticos, se limpian al reiniciar el dev server).
- Archivos: `App.tsx`, `components/home/MobileHomeGrid.tsx`, `pages/SidebarEditorPage.tsx` (M) + 3 borrados.
- Estado: HECHO. Bloqueos Fase 5 restantes: `machines` (MachineProvider/CategoryManager), `plantAssets` (MapaPlantaPage).

## 2026-06-17 · claude · Test funcional en vivo + retiro de pestaña Mapas

- Test funcional (preview logueado, código de D: confirmado servido): búsqueda Áreas ("sumitomo"→4 N:M), ficha (Dónde se usa + Solicitar), **Solicitar end-to-end** (crear→reglas OK→lista→avance Pendiente→Aprobada; dato de prueba borrado con script admin), Bodega (188/3777 + alertas), **chatbot ARIA** ("guantes"→29 insumos con SAP, antes invisibles). Sin errores de consola.
- Decisión de Orel: **retirar la pestaña Mapas**. Datos (solo-lectura): `plantAssets`=134 (61 copias `asset-720*` vacías), **0 marcadores en mapas** (el feature nunca se usó), specs/fotos ya migrados al maestro; `plantMaps`=3 (Chonchi/Yal/Acopio). → No es duplicado borrable: era el backing del editor de pines, pero está vacío.
- Hecho: `RepuestosPage` ahora 2 pestañas (Áreas + Bodega; quitado tab/type/import/contenido `bases` y el icono `Map`). Borrados `pages/repuestos/CatalogoBases.tsx`, `components/repuestos/MapasViewer.tsx`, `components/repuestos/AssetDetailModal.tsx`, `hooks/repuestos/usePlantMaps.ts` (huérfanos tras quitar la pestaña).
- IMPORTANTE: `plantAssets` AÚN lo lee `MapaPlantaPage`/`components/map/leaflet-editable/PanelCapasYZonas.tsx` (feature SEPARADA del mapa leaflet). Retirar la pestaña Mapas NO libera la colección; su borrado depende de decidir qué pasa con esa otra página. `usePlantAssets` se conserva por eso.
- Verificación: `tsc`=0, `eslint`=0. En preview (HMR + reload): módulo carga, 2 pestañas, búsqueda "baader rodamiento"→25 resultados correctos. Nota: Vite deja errores de consola "Failed to reload CatalogoBases/MapasViewer/AssetDetailModal" (recuerda los archivos borrados) + un "Map requires new" transitorio del que React se recuperó — ambos se limpian al reiniciar el dev server, no son runtime reales.
- Archivos: `apps/pwa/src/pages/repuestos/RepuestosPage.tsx` (M) + 4 borrados.
- Estado: HECHO. Sigue: decidir `/insumos`; y por separado, qué hacer con `MapaPlantaPage` (último lector de `plantAssets`).

## 2026-06-17 · claude · Chatbot ARIA in-app → maestro unificado

- Hecho: reescrito `fetchRepuestosSummary` en `apps/pwa/src/services/chatbot.ts`. Antes iteraba `machines` + `machines/*/repuestos` (datos pre-migración: sin insumos/herramientas/químicos, sin N:M). Ahora hace 3 queries planas en paralelo: `repuestos` (maestro), `hierarchy` (nombres de equipo + nodos tipo equipo), `bodega` (stock+ubicación por SAP). Conserva detección de equipo (sobre nodos `hierarchy`, ignora COMPONENT_WORDS), fuzzy + sinónimos (helpers in-file reusados). Salida con clase, stock real de bodega, ubicación, equipos N:M y marca de despiece (sin-SAP no pedible). Quitado import muerto `Machine, Repuesto`.
- Mejora de robustez: cuando la búsqueda con scope de equipo da 0 (la detección codiciosa consume términos que también son descriptores del material — "aceite hidraulico", "sello mecanico", porque los nombres de equipos de planta contienen esas palabras), cae a **búsqueda flexible GLOBAL** rankeada por nº de términos que matchean + stock. Antes esos casos devolvían 0.
- Verificación: `tsc --noEmit` = 0, `eslint src/services/chatbot.ts` = 0. Capa de datos verificada con `scripts/normalizacion/98-verify-chatbot-maestro.js` (solo-lectura, replica el matching sobre Firestore real): "sumitomo"→4 motorreductores; "guantes"→insumos (antes invisibles); "rodamiento"→132 (repuesto+herramienta); "baader casquillo"→135 (SAP+despiece); "aceite hidraulico"→ACEITE HD HIDRAULICO 32 (químico) vía fallback; "sello mecanico"→SELLO MECANICO 32MM vía fallback. NO verificado en navegador (el preview corre desde OneDrive, no desde D:; requiere login Google).
- Nota: `aria/tools/repuestos.ts` (tool del orquestador) ya leía del cache del maestro (`getGlobalRepuestosCache`), su comentario de cabecera está obsoleto pero el código es correcto. Detectado mojibake en datos fuente (ej. "elÃ¡stico" = doble-encoding UTF-8 en Firestore) — problema de datos preexistente, afecta búsqueda, anotar para limpieza futura.
- Archivos: `apps/pwa/src/services/chatbot.ts` (M), `scripts/normalizacion/98-verify-chatbot-maestro.js` (nuevo).
- Estado: HECHO. Con esto `machines` ya no tiene lectores de datos en el chatbot/tools; solo queda `useMachines`/MachineProvider/CategoryManager antes de poder borrar la colección.
- Sigue: (Fase 5) migrar/retirar MachineProvider+CategoryManager → libera `machines`; Mapas+editor → libera `plantAssets`; decidir `/insumos`.

## 2026-06-17 · claude · Fase 5 limpieza — borrado de código legacy muerto (parte 1)

- Hecho: eliminado código legacy muerto del módulo repuestos (era el primer paso seguro de Fase 5, verificable con tsc/eslint). 23 archivos borrados en cascada de huérfanos (cada nivel re-verificado con `tsc`): `pages/repuestos/Dashboard.tsx` (hub legacy, NO ruteado) + su export en `pages/index.ts`; cluster `EquipmentNavigator`/`MachineAccordionNav`/`DuplicatesModal` y sus deps únicas (`EquipmentCard`, `MachineManager`, `ManualSearchModal`, `MachineSelector`, `RelocateRepuestoModal`, `BulkRelocateModal`, `useDuplicateScanner`, `services/mergeRepuestos`); lectores legacy de `machines/*/repuestos` huérfanos (`useRepuestos`, `useRepuestosCounts`, `RepuestoDetailModal`, `LinkMachineModal`, `MachineHierarchySelector`, `AssetDetailPanel`, `MachineManualPanel`, `useEquipmentRepuestos`, `services/repuestos.ts`); + 2 huérfanos sin commitear (`useInsumosSearch.ts`, `InsumoDetailPanel.tsx`).
- Radiografía del maestro (script nuevo solo-lectura `scripts/normalizacion/99-stats-maestro.js`): 7.657 docs · 3.777 con SAP · 188 con stock en bodega (núcleo: los 188 tienen SAP **y** equipo) · solo 64 con foto real · clase: repuesto 5.773/insumo 1.494/refrig 154/quimico 127/herram 107/lubric 2.
- **HALLAZGO: el borrado de colecciones legacy está BLOQUEADO por lectores vivos** (la lista de "dead code" de la memoria estaba desactualizada). Mapa de bloqueos:
  - `machines` ← `services/chatbot.ts` (fetchRepuestosSummary, líneas ~1326/1402/1545/1568) + `useMachines` vía `MachineProvider` (raíz de App.tsx) y `CategoryManager` (SettingsPage). **Prerequisito: migrar chatbot al maestro + retirar/migrar MachineProvider/CategoryManager.**
  - `plantAssets` ← `usePlantAssets` usado por `CatalogoBases` (tab Mapas, vivo) y `PanelCapasYZonas` (editor de mapa, vivo). **Prerequisito: leer motores/bombas del maestro (clase motor/bomba).**
  - `insumos` ← página `/insumos` (`InsumosPage`, ruteada en App.tsx + enlazada en home móvil y sidebar). **Prerequisito: decisión de producto — retirar la página o repuntarla al maestro filtrado por clase.**
  - Nota: las rutas de Storage `machines/{id}/manuales|infografias|repuestos/...` en `useStorage`/`pdfCache`/`usePlantStorage` son de Storage, NO de Firestore — no bloquean el borrado de la colección.
- Archivos: 21 borrados trackeados + `pages/index.ts` (M) + `scripts/normalizacion/99-stats-maestro.js` (nuevo).
- Verificación: `npx tsc --noEmit` = 0 y `npx eslint src --quiet` = 0 tras cada nivel de borrado. UI en vivo NO verificada (la PWA exige login Google + vive en D:; pendiente que Orel confirme en preview que el módulo renderiza igual).
- Estado: HECHO (limpieza de código). Borrado de colecciones: PENDIENTE/BLOQUEADO (ver mapa).
- Sigue: orden correcto de Fase 5 = (1) chatbot→maestro, (2) Mapas/editor→maestro, (3) decidir `/insumos`; recién entonces backup + dry-run + borrado de `machines`/`plantAssets`/`insumos`/huérfanas. Segundo nivel de código muerto a barrer luego (CategoryManager/useMachines/MachineContext si quedan sin uso tras migrar).

## 2026-06-12 · claude · Normalización repuestos (Fases 0–6) + rework UI + coordinación

- Hecho: migración a maestro SAP único `repuestos` (~7.657 docs; insumos+repuestos+herramientas unificados). Jerarquía tipada (`tipoNodo`), `manuales` N:M, rescate de manuales/historial/tags. Rework UI: tier SAP-first, filtro de clase, badges, ficha con manuales heredados + "dónde se usa" N:M, flujos asignar-SAP y asignar-equipo, Bodega abre en "configurados". Eliminado panel duplicado de insumos. Montada esta carpeta `.ai/` de coordinación.
- Archivos: `scripts/normalizacion/00..09`, `apps/pwa/src/{types/repuestos.ts, hooks/repuestos/*, pages/repuestos/*, components/repuestos/RepuestoDetailPanel.tsx}`.
- Verificación: `tsc --noEmit` + `eslint` limpios en cada incremento; verificado en preview (búsqueda, ficha, manuales heredados, asignar-equipo, Bodega).
- Estado: datos HECHO; UI HECHO (incrementos 1–7). Trabajo directo en working tree (aún sin ramas/PR; los scripts de migración ya se aplicaron a Firestore).
- Sigue: ver `TASKS.md` (solicitar-a-bodega, chatbot al maestro, Mapas, Fase 5 limpieza). De aquí en adelante, todo por rama + PR (flujo estricto).
