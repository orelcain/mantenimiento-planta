# MEMORY — App Mantenimiento Planta (PWA)

Estado canónico del proyecto. Actualizar cuando haya una decisión estable.
Última actualización: 2026-06-25.

## ⭐ META GRANDE / PREMISA (PRIORITARIA — aplica a TODO desarrollo)

Cada módulo, feature o cambio de la app debe cumplir esta premisa: la app existe para
**DEMOSTRAR con elementos cuantificables (gráficos, KPIs, reportes, entregables, exposiciones)
que Mantención SÍ está haciendo el trabajo**, y que **gracias a Mantención el proceso fluye, se
optimiza y mejora continuamente**. Antes de construir algo, preguntarse: *¿cómo ayuda esto a
evidenciar, medir y mejorar el aporte de Mantención al proceso?* Si no aporta a
cuantificar/demostrar/optimizar ese valor, replantearlo para que sí lo haga. Meta final =
**mejora continua demostrable** con datos.

## Qué es / dónde

- App de mantenimiento de planta de ANTARFOOD. PWA React + Vite en `apps/pwa/`. Backend `functions/`. Scripts admin en `scripts/`.
- Repo: `D:\a\APP leventamiento de insidencias en planta` (git remote `github.com/orelcain/mantenimiento-planta`, rama `main`).
- Firebase proyecto `mantenimiento-planta-771a3`. Deploy: push a `main` → GitHub Actions (`deploy.yml`) → Firebase Hosting. NO correr `firebase deploy` manual.
- Esta es la APP VIVA. La copia en OneDrive `_DEPRECATED_mantenimiento-planta_2026-04-09` es legado. `ARIA_MANTENIMIENTO_PLANTA` (OneDrive) es el paraguas de IA local (Ollama), NO una reescritura de esta app.

## Arranque local

- `apps/pwa/.env.local` y `serviceAccountKey.json` (raíz) ya están en disco (no en git). Sin `.env.local` la PWA queda en pantalla negra.
- Preview: Vite en `localhost:5173/mantenimiento-planta/`. Al reiniciar el server se pierde la sesión Firebase → re-login Google.
- Scripts admin: `node scripts/<...>.js` desde la raíz (usan `serviceAccountKey.json`).

## Modelo de datos — repuestos/materiales (normalización 2026-06, COMPLETA en datos)

- **Maestro único `repuestos`** (colección plana, ~7.657 docs): unifica repuestos + insumos + herramientas por código SAP. docId = SAP si existe.
- Campos clave: `codigoSAP|null`, `tieneSap`, `clase` (repuesto·insumo·herramienta·quimico·lubricante·refrigeracion), `equipos:[nodeIds]` (N:M con `hierarchy`), `equiposCodigos`, `parentMaterialId`, `manualesPropios`, specs físicas (marca/modeloTipo/…).
- `hierarchy` (702 nodos) = jerarquía SAP, fuente de verdad de equipos/áreas. Campo `tipoNodo` ('area'|'equipo').
- `bodega` (≈188) = stock por SAP (overlay en runtime; no se guarda en el doc del material).
- `manuales` (colección plana N:M) = PDFs por equipo; un material hereda los de sus `equipos`.
- LEGACY a eliminar (Fase 5 limpieza, con backup): `machines`, `plantAssets`, `insumos` (ya absorbido), subcolecciones huérfanas, `repuestosBaader200`.
- Scripts de migración idempotentes (dry-run primero): `scripts/normalizacion/00..09`. Backup en `backups/normalizacion-2026-06-10T23-53-21/`.

## UI repuestos (apps/pwa/src/pages/repuestos, hooks/repuestos)

- Hub `RepuestosAreaHub` lee/escribe el maestro vía `useGlobalSearch` (v4: 2 queries hierarchy+repuestos). Búsqueda tier SAP-first (con-SAP arriba, despiece sin-SAP con divisor), filtro de `clase`, badges.
- Ficha `RepuestoDetailPanel`: "dónde se usa" N:M, manuales heredados (`useManualesDeEquipos`), flujos asignar-SAP y asignar-equipo, "Solicitar" solo con SAP.
- `BodegaView` abre en filtro "configurados".

## Regla de diseño: preparación MULTI-PLANTA (decisión Orel 2026-07-04)

Hoy la app es de UNA planta (Antarfood Chonchi, ecosistema AquaChile). En el futuro puede haber
otra planta AquaChile (Quellón, Puerto Montt) u otra empresa. Decisión de arquitectura:

- **Misma empresa, otra planta → multi-tenant en esta base** (campo `plantId`), porque habilita
  comparativas entre plantas (benchmarking del aporte de Mantención = META GRANDE).
- **Otra empresa → proyecto Firebase SEPARADO siempre** (aislamiento de datos no negociable);
  el código se parametriza (white-label), no se comparte base.

Hábitos OBLIGATORIOS desde ya (costo ~cero hoy, ahorran la migración mañana):
1. Toda colección o feature NUEVA incluye `plantId: 'chonchi'` desde su nacimiento.
2. NO hardcodear "Antarfood"/"Chonchi" en código/prompts nuevos — usar/crear config central
   (doc `config`) cuando se toquen esas zonas.
3. Al diseñar queries nuevas, no asumir que "todo el contenido de la colección es de esta planta":
   dejar el filtro por `plantId` aunque hoy tenga un solo valor.

Semillas que ya existen: `maintenanceLog.plantLineId`, `shoplogixShiftDelayChecks.plant/plantLabel`,
`hierarchy` clonable por planta. NO refactorizar lo existente todavía (YAGNI) — la migración se
decide cuando la segunda planta sea real.

## Convenciones de código

- Stack: React + Vite + TypeScript + Tailwind + Firebase (Firestore/Storage/Auth Google). Radix UI. lucide-react.
- Verificación obligatoria antes de PR: `npx tsc --noEmit` + `npx eslint <archivos>` limpios. UI → verificar en preview.
- NO tocar `firestore.rules` / `functions/` / `firebase.json` salvo pedido explícito (proyecto Firebase compartido).
- Detalle fino de la normalización en la memoria de Claude del proyecto (`.claude/projects/.../memory/`).

## Centro Técnico Documental (NFPA 70B) — diseño aprobado 2026-06-20

- **NO es módulo nuevo:** se enriquece el módulo Equipos existente (`/equipment`, `EquipmentPage`,
  que ya tiene `criticidad`+fotos+QR+incidencias). Distinto de `/aprendizaje` (formación). Es el
  **expediente por equipo** según NFPA 70B. Spec: `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`. **AÚN sin codear.**
- Ficha en el registro `equipment`; hereda repuestos (`repuestos` N:M) y manuales (`manuales` N:M) del
  nodo `hierarchy` vía `hierarchyNodeId`. **NO sobre `plantAssets`** (legacy). Falta: datos de placa,
  condición 1/2/3 e historial.
- Decisiones: `fichaTecnica` = campo dedicado tipado en `equipment`; `maintenanceLog` = colección plana
  con `equipmentId` (necesita regla nueva en `firestore.rules` → pedir OK); criticidad = NFPA 70B §2.4
  (amenaza a personal/propiedad/producto) + **condición 1/2/3 = semáforo 🟢🟡🔴** (Cap. 9); próxima
  inspección = criticidad × condición (Tabla 9.2.2). Piloto: motor `720004608` + bomba `720004607` (NH₃)
  — verificar que existen como registros `equipment`.

## Pendientes mayores

Ver `TASKS.md`. Resumen: solicitar-a-bodega end-to-end, chatbot ARIA in-app → leer el maestro (hoy lee `machines/*/repuestos` viejo), Mapas (`CatalogoBases`) → maestro, Fase 5 limpieza de colecciones legacy.
