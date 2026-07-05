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
