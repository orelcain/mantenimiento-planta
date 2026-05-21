# AnimeTracker Bot — Contexto del Proyecto

> Bot Telegram **`@anime_estreno_bot`** (display: AnimeTracker) + Mini App. Implementado como Cloud Functions de Firebase + HTML standalone para la Mini App, **dentro del repo `mantenimiento-planta`**.

---

## ⚠️ Importante antes de empezar

Este bot **NO es un proyecto separado** a pesar de su nombre. Vive en el monorepo `mantenimiento-planta` y comparte infraestructura con la PWA de planta:
- Mismo proyecto Firebase: `mantenimiento-planta-771a3`
- Mismo `functions/index.js` (4588 líneas) — donde conviven con las funciones del bot de planta
- Mismo Firebase Hosting

**Hay un backup histórico** del bot anterior (Node-RED v0, mediados 2025) en `github.com/orelcain/anime-estreno-bot-nodered-archive`. Es **arqueología**, no producción. No mezclar.

---

## 1. Resumen ejecutivo

Bot personal de tracking de anime con Mini App embebida en Telegram. Funcionalidades:
- **Listas:** viendo · interesante · pendiente · completado · descartado
- **Estrenos diarios:** cron a las 23:00 hora Santiago envía resumen de animes que estrenan al día siguiente, separado entre "trackeados" (en tu lista) y "discovery" (sugerencias)
- **Mini App:** UI de Telegram WebApp con vistas Estrenos / Buscar / Viendo / Pendiente / Listas. Búsqueda, filtros, tracking de episodios
- **Auth:** Mini App valida initData de Telegram contra el bot token y emite custom token Firebase

**Estado:** producción, uso personal de Danilo. Migró de Node-RED → Cloud Functions hace tiempo (entre mediados 2025 y mayo 2026). Corre 24/7 en cloud, no depende de PC encendida.

**Bot:** [@anime_estreno_bot](https://t.me/anime_estreno_bot) (display "AnimeTracker")
**Mini App URL:** `https://mantenimiento-planta-771a3.web.app/anime.html`
**Repo:** `github.com/orelcain/mantenimiento-planta` (público — ver archivos clave abajo)
**Backup histórico (Node-RED v0):** `github.com/orelcain/anime-estreno-bot-nodered-archive` (PRIVADO)

---

## 2. Stack técnico

### Backend
- **Firebase Cloud Functions v2** (`onRequest`, `onSchedule`)
- **Node.js 22** runtime
- **Region:** `us-central1`
- **Memory:** 256 MiB por función
- **Secrets:** `TELEGRAM_BOT_TOKEN` (bot de planta) + `ANIME_BOT_TOKEN` (bot de anime, distinto)
- API externa: **AniList GraphQL** (`graphql.anilist.co`)
- Persistencia: **Firestore** (proyecto `mantenimiento-planta-771a3`, colección `animelists`)

### Frontend (Mini App)
- **HTML/CSS/JS vanilla** en un único archivo (`apps/pwa/public/anime.html`, 3000 líneas)
- **`telegram-web-app.js`** — SDK Mini App
- **Firebase JS SDK** compat — auth + Firestore
- **Sin framework, sin build** — se edita directo y se deploya como archivo estático de Hosting

### Deploy
- **Hosting:** Firebase Hosting (sitio `mantenimiento-planta-771a3.web.app`)
- **Functions:** Firebase Functions
- **Triggered by:** workflows GitHub Actions en `.github/workflows/`:
  - `deploy.yml` → PWA + Hosting (incluye `anime.html`)
  - `deploy-functions.yml` → Cloud Functions (las 6 del bot + las 25+ de la PWA)
  - `deploy-firestore-rules.yml` → `firestore.rules`

---

## 3. Arquitectura

```
┌─────────────────────────────┐
│ Usuario Telegram             │
│                             │
│ ┌─────────────────────────┐ │
│ │ Chat @anime_estreno_bot │ │
│ └────────────┬────────────┘ │
│              │ /start, /nav │
│              │ etc.         │
│ ┌────────────▼────────────┐ │
│ │ Botón "Abrir Mini App"  │ │
│ └────────────┬────────────┘ │
└──────────────┼──────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌──────────────┐  ┌──────────────────────────┐
│ webhook      │  │ Mini App HTML            │
│ /telegram-   │  │ (carga desde Hosting)    │
│  Webhook     │  │                          │
│ Cloud Fn     │  │ ┌──────────────────────┐ │
│              │  │ │ telegram-web-app.js  │ │
│ recibe       │  │ │ → initData           │ │
│ updates,     │  │ └──────────┬───────────┘ │
│ rutea según  │  │            │             │
│ comando      │  │ ┌──────────▼───────────┐ │
└──────┬───────┘  │ │ POST mintTelegram-   │ │
       │          │ │  AuthToken           │ │
       │          │ │ → custom Firebase    │ │
       │          │ │   token              │ │
       │          │ └──────────┬───────────┘ │
       │          │            │             │
       │          │ ┌──────────▼───────────┐ │
       │          │ │ firebase.auth()      │ │
       │          │ │  .signInWithCustom-  │ │
       │          │ │  Token(...)          │ │
       │          │ └──────────┬───────────┘ │
       │          │            │             │
       │          │ ┌──────────▼───────────┐ │
       │          │ │ Firestore SDK       │ │
       │          │ │ collection('anime-  │ │
       │          │ │ lists').doc(uid)    │ │
       │          │ └──────────┬───────────┘ │
       │          │            │             │
       │          │ ┌──────────▼───────────┐ │
       │          │ │ AniList GraphQL     │ │
       │          │ │ búsqueda directa    │ │
       │          │ └──────────────────────┘ │
       │          └──────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Cloud Functions (us-central1)            │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ animeEstrenosDiarios                │ │
│ │ schedule: 'every day 23:00'         │ │
│ │ timezone: America/Santiago          │ │
│ │ secret: ANIME_BOT_TOKEN             │ │
│ │ → fetch AniList airing HOY          │ │
│ │   (medianoche Santiago → now+1h)    │ │
│ │ → separar tracked vs discovery      │ │
│ │ → enviar a Telegram                 │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ animeEstrenosManual (HTTPS)         │ │
│ │ → mismo que diarios pero trigger    │ │
│ │   manual                            │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ mintTelegramAuthToken (HTTPS, CORS) │ │
│ │ → valida HMAC-SHA256 initData       │ │
│ │ → emite Firebase custom token       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ Firestore mantenimiento-planta-771a3     │
│                                          │
│ Colección: animelists/{userId}          │
│ Rule: allow read, write: if true        │
│ (sin auth — comentario explica que es   │
│  "bot personal sin auth")               │
└──────────────────────────────────────────┘
```

### Bot Telegram vs bot de mantenimiento (VERIFICADO 2026-05-20)

✅ **Hay 2 bots Telegram distintos** que coexisten en este proyecto pero NO comparten webhook handler:

1. **Bot de mantenimiento-planta** — secret `TELEGRAM_BOT_TOKEN`. Su webhook (`telegramWebhook` Cloud Function) maneja 20+ comandos (`/incidencia`, `/equipo`, `/sensores`, `/kpi`, etc.) via funciones `tgHandle*` en `functions/index.js`.

2. **Bot de anime `@anime_estreno_bot`** — secret `ANIME_BOT_TOKEN` distinto.
   - **NO tiene webhook handler.** `telegramWebhook` está configurado vía `setTelegramWebhook` para escuchar al bot de planta, no al de anime.
   - **Es un bot pasivo:** solo (a) envía notificación diaria via `animeEstrenosDiarios`, y (b) expone Menu Button "Abrir Mini App" registrado con BotFather a través de `setBotCommands` (Cloud Function en línea ~3169 de `functions/index.js`).
   - **Toda la interactividad** (búsqueda, tracking, listas, episodios) está dentro de la Mini App, NO en el bot.
   - Por eso `/start`, `/nav` y los botones inline que se ven en Telegram parecen "manejados por el bot" pero realmente solo abren la Mini App.

**Lo que es 100% del bot de anime:**
- 2 Cloud Functions scheduled/HTTPS: `animeEstrenosDiarios` + `animeEstrenosManual`
- Mini App: `apps/pwa/public/anime.html`
- Colecciones Firestore: `animelists/{userId}` + `anime_notifications/{dateKey}`
- Secret: `ANIME_BOT_TOKEN`
- Bot Menu Commands: configurados via `setBotCommands` Cloud Function

**Compartido con bot de planta (mismo Cloud Function, distintos consumidores):**
- `mintTelegramAuthToken` — emite Firebase custom tokens. **Lo usa la Mini App de planta (`mant.html`), NO la Mini App de anime.** Usa `TELEGRAM_BOT_TOKEN`.
- `setBotCommands` — registra Menu Button + commands en BotFather. Probablemente se llama para ambos bots (configuración inicial).

---

## 4. Estructura de archivos relevantes

Dentro del repo `mantenimiento-planta`:

```
mantenimiento-planta/
├── functions/
│   └── index.js                            # 4588 líneas — funciones del bot:
│                                            #   animeEstrenosDiarios  (~4510)
│                                            #   animeEstrenosManual   (~4526)
│                                            #   _runAnimeEstrenos     (~4416) — helper
│                                            #   mintTelegramAuthToken (~3271)
│                                            #   telegramWebhook       (~2972)
│                                            #   setTelegramWebhook    (~3127)
│                                            #   setupTelegramTopics   (~3200)
├── apps/pwa/public/
│   ├── anime.html                          # 3000 líneas — Mini App actual
│   └── mant.html                           # Mini App de planta (otro bot)
├── firestore.rules                         # línea ~1341: rule para animelists
├── .github/workflows/
│   ├── deploy.yml                          # deploy PWA + Hosting (incluye anime.html)
│   ├── deploy-functions.yml                # deploy Cloud Functions
│   └── deploy-firestore-rules.yml
└── CLAUDE.md                               # sección "Bot @anime_estreno_bot"
```

---

## 5. Cloud Functions del bot — detalle

### `animeEstrenosDiarios` (scheduled, ~línea 4510)
- **Schedule:** `'every day 23:00'`
- **Timezone:** `America/Santiago`
- **Timeout:** 60s
- **Memory:** 256 MiB
- **Retry:** 0 (no reintenta)
- **Secret:** `ANIME_BOT_TOKEN`
- **Lógica:** llama a `_runAnimeEstrenos(token)`

### `animeEstrenosManual` (HTTPS, ~línea 4526)
- POST only
- Mismo `_runAnimeEstrenos(token)` pero on-demand
- Útil para testing

### `_runAnimeEstrenos(token)` (helper, ~línea 4416)
Lógica core. Hace:
1. **Calcula `dateKey`:** `today.setHours(0,0,0,0).toISOString().substring(0,10)` → "YYYY-MM-DD" **en UTC** (no Santiago — bug latente, ver sección 13)
2. **Dedup check:** lee `anime_notifications/{dateKey}`. Si `sent === true`, hace `return` y loggea "ya enviada".
3. **Fetch AniList:** query GraphQL `airingSchedules` con rango `from` (medianoche UTC hoy) a `to` (now + 1h). **Son estrenos de HOY ya emitidos** (no mañana). Si no hay schedules, sale.
4. **Lee user listas:** `animelists/{ANIME_CHAT_ID}` (donde `ANIME_CHAT_ID = '52949422'`). Construye `trackedIds` (Set) y `trackedMap` (id → nombre lista).
5. **Particiona schedules:** los que tienen `media.id` en `trackedIds` van a `tracked`, el resto a `discovery`.
6. **Formatea mensaje HTML:** título "📺 Estrenos del día — {fecha en español Santiago}" + bloque "⭐ Tus series (N)" + bloque "📡 Descubrimiento (N)" truncado a 8 con "… y N más en la app".
7. **Envía:** `_sendTelegram(botToken, ANIME_CHAT_ID, text, replyMarkup)` con botón inline que abre la Mini App.
8. **Persiste log:** `anime_notifications/{dateKey}.set({ sent: true, sentAt: serverTimestamp, tracked: tracked.length, discovery: discovery.length, total: schedules.length })`.

### Init Firestore (Admin SDK — bypasea rules)
```js
// functions/index.js líneas 6-7
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
// ...
const db = getFirestore()
```
Las Cloud Functions del bot usan **Admin SDK**, no client SDK. Esto significa que **bypasean firestore.rules** — el bot puede leer/escribir `anime_notifications/` aunque no tenga rule explícita. **El riesgo de "rules mal escritas" solo aplica si algún cliente (Mini App) intenta acceder a esa colección — actualmente no lo hace.**

### `mintTelegramAuthToken` (HTTPS, ~línea 3271)
- **Compartido** con la Mini App de planta
- CORS abierto (`Allow-Origin: *`) — Mini App corre en WebView Telegram, origin variable
- POST con body `{ initData }`
- Valida HMAC-SHA256 del initData contra `TELEGRAM_BOT_TOKEN`
- Si válido, emite Firebase custom token con uid = telegram user id
- Mini App luego hace `signInWithCustomToken` y obtiene acceso Firestore

### `telegramWebhook` (HTTPS, ~línea 2972)
- POST only (recibe updates de Telegram)
- Maneja callback queries (botones inline) y mensajes (texto/comandos/fotos)
- **Mayoría de handlers son del bot de planta** (`tgHandleIncidencia`, `tgHandleSensores`, etc.)
- Routing del bot de anime dentro de este handler **no verificado** en este doc

### `setTelegramWebhook` (HTTPS, ~línea 3127)
- Llamada GET para registrar URL del webhook contra Telegram Bot API
- URL hardcoded: `https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/telegramWebhook`
- Usa `TELEGRAM_BOT_TOKEN`

### `setupTelegramTopics` (HTTPS, ~línea 3200)
- Setup de topics para grupos Telegram
- Compartido con el bot de planta

---

## 6. Mini App — vistas y features

`apps/pwa/public/anime.html` (3000 líneas, ~143 funciones JS, sin build).

### Stack en el archivo
- `<script src="https://telegram.org/js/telegram-web-app.js">` — SDK Mini App
- `<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js">`
- `<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js">`
- Plus auth SDK (verificar en archivo)

### Vistas (bottom nav)
- **Estrenos** — calendario de animes airing por día
- **Buscar** — input + AniList GraphQL directo + filtros
- **Viendo** — lista con progress, botones +/- episodio
- **Pendiente** — lista de "interesante" + "pendiente"
- **Listas** — gestión de listas custom + tags

### Filtros
- Temporada (winter/spring/summer/fall)
- Año
- Día de emisión
- Estudio
- Género
- Sort: rating / progreso / fecha / alfabético

### Componentes especiales
- `#img-viewer` — viewer fullscreen con pinch-zoom para posters
- `#list-modal` — crear/editar listas custom
- Status dot online/offline en header — health check Firestore

### Auth flow (VERIFICADO 2026-05-20 — corregido vs versión previa de este doc)

**La Mini App NO autentica con Firebase Auth.** Verifiqué leyendo `anime.html`:

```javascript
// Líneas 576-581 de anime.html
firebase.initializeApp({...})
const db = firebase.firestore()
// NO hay signInWithCustomToken, NO hay mintTelegramAuthToken, NO hay firebase.auth().signIn*
```

Lo que hace en cambio:
1. Telegram inyecta `initDataUnsafe.user.id` en `Telegram.WebApp` (cliente Telegram)
2. Mini App lee este ID directamente para identificar al usuario y construir el doc path `animelists/{userId}`
3. Firestore acepta lectura/escritura **porque la rule es `allow read, write: if true`** — sin auth requerida
4. La API key Firebase (en `firebase.initializeApp`) es la única "credencial" — pero como la rule es permissive, cualquiera con la key puede acceder a cualquier `animelists/{cualquierID}`

⚠️ **Implicación crítica:** la rule de `animelists` **DEBE permanecer `if true`** mientras la Mini App no migre a `signInWithCustomToken`. Si endureces la rule sin actualizar la Mini App, el bot deja de funcionar.

**Para endurecer la rule (refactor futuro):**
1. Implementar en `anime.html`: `mintTelegramAuthToken` POST → `signInWithCustomToken(customToken)`
2. Cambiar rule a: `allow read, write: if request.auth.uid == userId;`
3. Test E2E porque puede haber side effects en flows de la Mini App que asumen lectura sin auth

**¿Por qué la Mini App de planta (`mant.html`) sí autentica pero la de anime no?** La de planta accede a colecciones sensibles (incidents, equipment) que SÍ tienen rules estrictas. La de anime accede solo a `animelists` que es info personal sin sensibilidad de seguridad — se priorizó simplicidad.

---

## 7. APIs externas

### AniList GraphQL
- Llamadas desde:
  - Mini App (búsquedas, autocompletado, detalles)
  - `_runAnimeEstrenos` (Cloud Function, schedule diario)
- Sin auth, rate limit ~90 req/min por IP
- Sin cache — cada call es fresca
- Manejo de errores: try/catch básico, status `offline` en Mini App si falla

### Firestore (cliente Mini App)
- Lectura directa de `animelists/{telegramUserId}` desde Mini App
- Escrituras igualmente directas (rule actual permite todo)
- También usado por las Cloud Functions del bot para logs

### Telegram Bot API
- Webhook entrante: `telegramWebhook` Cloud Function
- Salida (notificaciones): `_runAnimeEstrenos` envía via Bot API con `ANIME_BOT_TOKEN`

---

## 8. Modelo de datos

### Colección: `animelists/{telegramUserId}`

```javascript
// Ejemplo: animelists/52949422 (Danilo)
{
  viendo: [
    {
      id: 12345,                       // AniList anime ID
      title: "Re:ZERO Season 4",
      type: "TV",                      // TV | MOVIE | OVA | ONA | SPECIAL | TV_SHORT
      format: "TV",
      episode: 5,                       // episodio actual visto
      total: 19,                        // total
      poster: "https://...",
      rating: 87,                       // % MAL/AniList
      genres: ["Action", "Drama"],
      tags: [...],
      season: "SPRING",
      year: 2026,
      airTime: "21:00",
      airDay: "Wednesday",
      addedAt: 1715000000,
    }
  ],
  interesante: [...],
  pendiente: [...],
  completado: [...],
  descartado: [...],
  config: {
    // preferencias del usuario
  }
}
```

### Colección `anime_notifications/{dateKey}` (VERIFICADO)

`_runAnimeEstrenos` usa esta colección para deduplicación de envíos:

```javascript
// Path exacto: anime_notifications/{dateKey} donde dateKey = "YYYY-MM-DD"
// Línea 4422: chequear si ya envió hoy
const sentDoc = await db.collection('anime_notifications').doc(dateKey).get();
if (sentDoc.exists && sentDoc.data().sent) return;

// Línea ~4489: persistir log al final del envío exitoso
await db.collection('anime_notifications').doc(dateKey).set({
  sent: true,
  sentAt: serverTimestamp,
  tracked: <number>,    // animes airing que están en alguna lista del usuario
  discovery: <number>,  // animes airing nuevos (no en lista)
  total: <number>
})
```

⚠️ **Esta colección NO está en `firestore.rules` con regla explícita.** Si se aplica una regla deny-all global y no se agrega excepción para `anime_notifications`, el bot empieza a enviar **notificaciones duplicadas** (no puede comprobar "ya envié hoy"). Verificar firestore.rules incluye también esta colección al endurecer reglas.

### Rule actual de Firestore
```
match /animelists/{userId} {
  allow read, write: if true;
}
```
Sin auth requerida, sin match por userId. Pensado para bot personal — endurecer si se abre a más usuarios.

---

## 9. Cron / jobs

| Job | Frecuencia | Hora local | Función | Propósito |
|---|---|---|---|---|
| Estrenos diarios | Diario | 23:00 Santiago | `animeEstrenosDiarios` | Notifica películas/OVAs/specials del día siguiente, separando tracked (en lista del user) vs discovery |
| (Manual) | On demand | — | `animeEstrenosManual` | Mismo que diarios pero trigger HTTPS |

A diferencia del bot Node-RED v0, **no hay polling cada 20 min** para detectar episodios nuevos. El bot actual envía solo el resumen diario.

---

## 10. Variables de entorno / secrets

### Firebase Functions Secrets
| Secret | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot de mantenimiento-planta (recibe webhook + auth Mini App) |
| `ANIME_BOT_TOKEN` | Bot de anime `@anime_estreno_bot` (envía estrenos) |

Acceder a los valores:
```
firebase functions:config:get --project mantenimiento-planta-771a3
```

**NO hardcodear nunca tokens en código.**

### Firestore project
- Project ID: `mantenimiento-planta-771a3` (no es secret, es público)
- Firebase API key (web): aparece en `anime.html` y `firebase.initializeApp` — protegida por security rules

---

## 11. Deployment

### Workflow automático (recomendado)
1. Push a `main` en `mantenimiento-planta`
2. GitHub Actions triggers:
   - `deploy.yml` → deploy de PWA + Hosting (incluye `anime.html`)
   - `deploy-functions.yml` → deploy de Cloud Functions
   - `deploy-firestore-rules.yml` → solo si `firestore.rules` cambió

### Manual (si falla CI)
```bash
firebase deploy --only functions:animeEstrenosDiarios,functions:animeEstrenosManual,functions:mintTelegramAuthToken --project mantenimiento-planta-771a3
firebase deploy --only hosting --project mantenimiento-planta-771a3
firebase deploy --only firestore:rules --project mantenimiento-planta-771a3
```

### Logs
```
firebase functions:log --only animeEstrenosDiarios --project mantenimiento-planta-771a3
firebase functions:log --only telegramWebhook --project mantenimiento-planta-771a3
```

### Verificación post-deploy
- Bot: probar `/start` en Telegram al `@anime_estreno_bot`
- Mini App: abrir desde botón del bot, verificar que carga Firestore y AniList
- Schedule: ver próxima ejecución en consola Firebase → Cloud Scheduler

---

## 12. Decisiones técnicas relevantes

| Decisión | Por qué | Trade-off |
|---|---|---|
| **Cloud Functions en vez de Node-RED 24/7** | Eliminar dependencia de PC encendida. Costo Firebase plan Spark suficiente. | Latencia primera invocación (cold start). Sin UI visual del flujo. |
| **Mini App como un solo HTML standalone** | Cero build, deploy = copiar a Hosting. Editar en cualquier editor. | 3000 líneas en un archivo — costoso de mantener. Sin tree-shaking. |
| **AniList en vez de Jikan** | API más rica, mejor estructurada, GraphQL permite queries específicas | Distinto al ANIME_TRACKER SPA (Jikan) — duplica conocimiento de dominio |
| **Firestore project compartido con la PWA** | Convenia, ya existía proyecto pago | Acoplamiento — cambios a security rules afectan ambos |
| **Tokens distintos por bot** (`TELEGRAM_BOT_TOKEN` vs `ANIME_BOT_TOKEN`) | Aislamiento — token comprometido afecta solo un bot | Setup más complejo, 2 secrets que mantener |
| **`mintTelegramAuthToken` compartido** entre Mini App de planta y de anime | Reutilizar lógica de validación initData | Si cambia el contrato, ambas Mini Apps se ven afectadas |
| **Rule `allow read, write: if true`** | Bot personal sin necesidad de multi-tenant | Si se filtra la API key, cualquiera puede leer/escribir `animelists` |
| **Solo cron diario (sin polling 20 min)** | Más simple, menos costo, suficiente para uso personal | Latencia hasta 24h para notificar episodio nuevo |

---

## 13. Bugs conocidos / limitaciones / preguntas abiertas

### Limitaciones
- **Sin notificación en tiempo real de episodios nuevos** — solo resumen diario 23:00. Trade-off intencional, pero diferencia con v0 Node-RED que polleaba cada 20 min.
- **Bot personal** — USER_ID Telegram destinatario hardcoded probablemente en lógica de `_runAnimeEstrenos` (verificar).

### Preguntas que YA fueron resueltas (2026-05-20)
1. ✅ **Routing telegramWebhook:** `@anime_estreno_bot` NO procesa webhook entrante — es bot pasivo (notif diaria + Menu Button). Ver sección Arquitectura.
2. ✅ **Path log envío:** `anime_notifications/{dateKey}` con dateKey = ISO YYYY-MM-DD. Ver sección Modelo de datos.
3. ✅ **Estructura `animelists/{userId}`:** confirmada — keys son listas (viendo/interesante/pendiente/completado/descartado), valores son arrays de objetos con al menos `{id, ...campos AniList}`. Doc ID hardcoded en const `ANIME_CHAT_ID = '52949422'` en línea 4390 de `functions/index.js`.
4. ✅ **Auth Mini App:** NO usa `signInWithCustomToken` — depende de rule permissive `if true`. Ver sección "Auth flow" arriba.

### Preguntas todavía abiertas
- **¿`setBotCommands` se ejecutó alguna vez para el bot de anime?** O sus Menu Button vienen configurados manualmente en BotFather. Verificar logs históricos de la función.
- **¿Hay logs históricos de `animeEstrenosDiarios` que muestren ejecuciones recientes?** `firebase functions:log --only animeEstrenosDiarios --project mantenimiento-planta-771a3 --lines 50`

### Riesgos
- **Acoplamiento con PWA mantenimiento-planta:** modificar `firestore.rules` sin preservar regla `animelists` rompe el bot silenciosamente. (Advertido también en CLAUDE.md de mantenimiento-planta.)
- **Funciones del bot conviven con 25+ funciones de la PWA en `functions/index.js`** (4588 líneas total). Refactor o renaming requiere cuidado.

### ✅ Bug timezone UTC vs Santiago — CORREGIDO 2026-05-20 (commit `69f88c2a`)

**El fix ya está aplicado.** Solución:
- `dateKey` usa `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })`
- Helper `_tzOffsetMin(date, tz)` calcula offset DST-safe (-240 CLT / -180 CLST)
- `from` query = medianoche Santiago real (`Date.UTC(y,mo-1,d) - offsetMin*60000`)
- `dateLabel` derivado de `dateKey` → coherente con dedup
- Validado: cron 03:00 UTC → dateKey `2026-05-20` Santiago, dateLabel "20 de mayo"

Lo de abajo se conserva como referencia histórica del bug original.

**Síntoma original (ya no ocurre):** desincronización entre `dateKey` del log y la fecha mostrada al usuario en mensajes.

**Causa:**
```js
const today = new Date();
today.setHours(0, 0, 0, 0);                                  // ← medianoche LOCAL del servidor = UTC en Cloud Functions us-central1
const dateKey = today.toISOString().substring(0, 10);        // ← "YYYY-MM-DD" UTC
// ...
const dateLabel = today.toLocaleDateString('es-CL', {
  timeZone: 'America/Santiago'                                // ← muestra en zona Santiago (UTC-3 o UTC-4)
});
```

**Escenario:** cron corre `23:00 America/Santiago` = `03:00 UTC del día siguiente`:
- `today` después de `setHours(0,0,0,0)` → medianoche UTC del día siguiente
- `dateKey` → ej "2026-05-21" (UTC)
- `dateLabel` con `timeZone: 'America/Santiago'` → "martes 20 de mayo" (Santiago)
- **Resultado:** el log dice "envié notif del 21" pero el mensaje al usuario dice "Estrenos del 20"

**Impacto real bajo en operación normal:** la cron diaria siempre tiene `dateKey` distinto al anterior, dedup funciona.

**Impacto en trigger manual cerca de medianoche:** si alguien ejecuta `animeEstrenosManual` cerca de las 21:00 Santiago, puede:
- Disparar otra vez aunque el bot ya envió en el cron (porque calcula otro `dateKey` UTC)
- O no disparar aunque debería (si cae en el mismo `dateKey` UTC del cron)

**Fix posible (NO aplicado todavía):**
```js
// usar timezone explícito en lugar de UTC implícito
const todaySantiago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
todaySantiago.setHours(0, 0, 0, 0);
const dateKey = todaySantiago.toLocaleDateString('en-CA');  // YYYY-MM-DD formato
```
O migrar a librería de fechas con timezone explícito (date-fns-tz, luxon).

---

## 14. Mejoras pendientes / ideas

### Prioridad alta
- [ ] **Auditar security rules** de `animelists` y endurecer si se quiere multi-usuario
- [ ] **Documentar estructura real Firestore** (TypeScript types o JSON Schema)

### Prioridad media
- [ ] Notificación en tiempo real (no solo daily) — similar al v0 Node-RED pero como otra Cloud Function scheduled cada N min
- [ ] Logs persistentes con búsqueda (Firestore o BigQuery export)
- [ ] Test E2E del flujo bot → Mini App → Firestore

### Ideas
- Vista de calendario mensual en Mini App
- Sincronización con cuenta AniList/MAL real (no solo lookup)
- Recomendaciones basadas en historial
- Tema custom para la Mini App (más allá de Telegram theme)

---

## 15. Cómo continuar el desarrollo desde claude.ai web

### Archivos a subir al Project knowledge (este Project)
Total ~250 KB:

| Archivo | Tamaño | Para qué sirve |
|---|---|---|
| `CONTEXT.md` (este archivo) | ~30 KB | Léelo primero — contexto maestro |
| `anime.html` | 149 KB | Mini App completa (3000 líneas) |
| `bot-functions-extract.js` | ~30 KB | Extracto de las 6 funciones del bot de `functions/index.js` (sin las 25+ de la PWA) |
| `firestore-rules-animelists.txt` | <1 KB | La rule actual de `animelists` |
| `CLAUDE-mant-bot-section.md` | ~2 KB | Sección sobre el bot extraída del `CLAUDE.md` de mantenimiento-planta |

Generadas automáticamente por `sync-claude-ai-bot.sh` en el repo mantenimiento-planta.

### Crear el Project en claude.ai

1. claude.ai → Projects → **Create project**
2. Nombre: `AnimeTracker Bot` (o `Bot Anime Cloud` para distinguir aún más del archivo histórico Node-RED)
3. Descripción:
   ```
   Bot Telegram @anime_estreno_bot + Mini App. Stack Firebase Cloud Functions + AniList + Firestore. Vive dentro de mantenimiento-planta. Ver CONTEXT.md.
   ```
4. Instrucciones del Project:
   ```
   Eres asistente técnico para el bot Telegram @anime_estreno_bot. Lee CONTEXT.md primero.

   El bot vive DENTRO del repo mantenimiento-planta, no es un proyecto separado.

   ANTES de proponer cambios:
   - Distinguir si el cambio es en Cloud Functions (functions/index.js) o en la Mini App (anime.html) o en Firestore rules
   - Considerar que el bot comparte proyecto Firebase con la PWA de planta
   - Notar las diferencias con el archivo histórico Node-RED v0 (otro repo, deprecated)

   REGLAS:
   - Responder SIEMPRE en español
   - Citar archivo:línea cuando sea posible
   - NO inventar código que no aparece en el knowledge
   - Si propones cambios a firestore.rules o functions/index.js, advertir el riesgo de afectar la PWA
   - El usuario es Danilo, prefiere respuestas técnicas directas
   ```
5. Drag-drop los 5 archivos de `_claude_ai_bot_upload/` (no `_INSTRUCCIONES.md`)

### Mantener sincronizado

Cada vez que edites el bot:
```bash
cd "D:/a/APP leventamiento de insidencias en planta"
# (edits a functions/index.js o anime.html)
git push                                        # workflow GH Actions deploya
bash sync-claude-ai-bot.sh                      # regenera _claude_ai_bot_upload/
# luego: subir manualmente al Project en claude.ai (eliminar viejos, drag-drop nuevos)
```
