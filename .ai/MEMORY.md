# MEMORY — App Mantenimiento Planta (PWA)

Estado canónico del proyecto. Actualizar cuando haya una decisión estable.
Última actualización: 2026-06-12.

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

## Convenciones de código

- Stack: React + Vite + TypeScript + Tailwind + Firebase (Firestore/Storage/Auth Google). Radix UI. lucide-react.
- Verificación obligatoria antes de PR: `npx tsc --noEmit` + `npx eslint <archivos>` limpios. UI → verificar en preview.
- NO tocar `firestore.rules` / `functions/` / `firebase.json` salvo pedido explícito (proyecto Firebase compartido).
- Detalle fino de la normalización en la memoria de Claude del proyecto (`.claude/projects/.../memory/`).

## Pendientes mayores

Ver `TASKS.md`. Resumen: solicitar-a-bodega end-to-end, chatbot ARIA in-app → leer el maestro (hoy lee `machines/*/repuestos` viejo), Mapas (`CatalogoBases`) → maestro, Fase 5 limpieza de colecciones legacy.
