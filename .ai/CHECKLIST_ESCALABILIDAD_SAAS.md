# Checklist de escalabilidad — apps para 100+ usuarios / SaaS

> Nota de alcance: esta app (mantenimiento-planta) es de USO INTERNO de una sola planta,
> no necesita este nivel de preparación hoy. Este checklist se guarda acá porque es el único
> repo con memoria persistente accesible desde Claude Code Web en este momento, pero aplica a
> **futuros proyectos SaaS / multi-tenant / con usuarios externos** — ej. la app NFPA/NEC para
> Google. Si tienes acceso a la memoria empresa (OneDrive `AI_PROJECT_MEMORY.md`), replicar
> este contenido ahí para que quede visible entre todos los proyectos.
>
> Origen: auditoría 2026-07-23 sobre mantenimiento-planta, a raíz de un post IG sobre "qué le
> falta a tu app antes de producción" (vibecoding → producción real).

## Contexto: qué del post genérico aplica y qué no

El post hablaba de: connection pooling, caché, índices DB, manejo de errores, CDN, escalado
horizontal/serverless, pruebas de carga, logs/monitoreo. Con stack Firebase/serverless (como
mantenimiento-planta), **connection pooling no aplica** (Firestore no usa conexiones
persistentes) y escalado horizontal viene gratis. El resto sí es relevante y es donde hay que
poner foco real.

## Los 6 puntos que SÍ hay que revisar antes de lanzar a 100+ usuarios

1. **Índices de la base de datos**
   - Firestore: mantener `firestore.indexes.json` al día con cada query multi-campo nueva.
   - Verificar cobertura: si hay más `getDocs()`/queries que `limit()` aplicados, hay riesgo de
     traer colecciones completas sin paginar.

2. **Listeners/queries sin límite (`onSnapshot` sin `limit()`)**
   - Cualquier listener sobre una colección que crece con el uso (incidencias, eventos, logs)
     necesita `limit()` + paginación desde el día 1, no como optimización después.
   - Si una vista necesita "todo" (ej. catálogo de equipos para búsqueda), usar una capa de
     caché explícita en memoria con TTL (patrón ya usado acá:
     `useGlobalEquipmentSearch.ts`, TTL 5 min) en lugar de re-consultar en cada render.

3. **Manejo de errores en la capa de servicios (no solo UI)**
   - Un `ErrorBoundary` de React cubre errores de render, pero NO cubre errores de
     red/permisos en llamadas a la base de datos (`setDoc`/`updateDoc`/`getDocs`/`onSnapshot`
     sin try/catch fallan silenciosamente o rompen sin contexto).
   - Regla: todo servicio que escribe/lee de la BD en el flujo crítico del usuario debe tener
     try/catch con mensaje accionable, no solo `console.error`.

4. **Logs y monitoreo de producción (esto es lo que más se posterga y más se paga después)**
   - Sin Sentry / Firebase Performance Monitoring / equivalente, un fallo se descubre porque el
     usuario avisa, no antes. Con 100+ usuarios el volumen de "avisos manuales" no escala.
   - Firebase Performance Monitoring es gratis y de bajo esfuerzo de setup — buen default para
     cualquier app nueva sobre Firebase.

5. **Cloud Functions bajo carga**
   - Configurar `minInstances` (evita cold starts en picos) y pensar concurrencia/memoria por
     función desde el diseño, no reactivamente cuando ya duele.
   - Memoria explícita por función sí es buena práctica (ya se hace acá), pero no alcanza sola.

6. **Rate limiting / abuso**
   - Las reglas de Firestore validan auth + shape de datos, pero normalmente NO limitan
     frecuencia de escritura por usuario. Para una app con usuarios externos/públicos (a
     diferencia de esta, interna y de confianza), esto es más crítico — evaluar App Check +
     límites a nivel de Cloud Function si hay endpoints públicos.

## Lo que normalmente SÍ viene resuelto por diseño (no reinventar)

- **Code-splitting / bundle inicial**: `React.lazy()` por página + `manualChunks` en Vite
  (vendor/firebase/ui separados). Aplicar desde el arranque de cualquier app nueva, es barato.
- **CDN de assets estáticos**: viene gratis con Firebase Hosting / Vercel / similar.
- **Escalado horizontal**: gratis en Firestore/Cloud Functions (serverless), no hay que
  diseñarlo a mano.

## Aplicación a la app NFPA/NEC (Google) — qué priorizar desde el diseño inicial

Como esa app sí apunta a más usuarios/uso externo (a diferencia de mantenimiento-planta):
- Definir desde el día 1: monitoreo (punto 4) y manejo de errores en servicios (punto 3) como
  parte del esqueleto inicial, no como deuda técnica a pagar después.
- Diseñar queries con `limit()`/paginación desde la primera versión de cualquier listado que
  pueda crecer sin tope.
- Si tiene usuarios anónimos/públicos o multi-tenant real: revisar rate limiting/App Check
  antes del lanzamiento, no después de un abuso.
