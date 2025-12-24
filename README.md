# Mantenimiento Industrial PWA

Sistema de gestión de mantenimiento industrial con soporte para los 4 tipos de mantenimiento:
- **Correctivo**: Reporte y seguimiento de fallas
- **Preventivo**: Tareas programadas por calendario
- **Predictivo**: Alertas basadas en análisis de datos
- **Proactivo**: Análisis de causa raíz

## 🚀 Características

- ✅ PWA instalable con soporte offline
- ✅ Tema oscuro industrial
- ✅ Sistema de roles (Admin, Supervisor, Técnico)
- ✅ Registro con código de invitación
- ✅ Mapa interactivo con zonas
- ✅ Gestión de equipos
- ✅ Reportes de incidencias con fotos
- ✅ Sistema de validación configurable
- ✅ Firebase (Auth, Firestore, Storage)
- ✅ Deploy automático a GitHub Pages

## 📋 Requisitos

- Node.js 20+
- pnpm 9+
- Cuenta de Firebase

## 🛠️ Instalación

1. Clonar repositorio:
```bash
git clone <repo-url>
cd mantenimiento-industrial
```

2. Instalar dependencias:
```bash
pnpm install
```

3. Configurar Firebase:
   - Crear proyecto en [Firebase Console](https://console.firebase.google.com)
   - Habilitar Authentication (Email/Password)
   - Crear base de datos Firestore
   - Crear bucket de Storage
   - Copiar configuración a `.env.local`:

```bash
cp apps/pwa/.env.example apps/pwa/.env.local
```

```env
VITE_FIREBASE_API_KEY=tu-api-key
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

4. Iniciar desarrollo:
```bash
pnpm dev
```

5. Abrir http://localhost:5173

## 🔐 Crear Usuario Admin Inicial

1. En Firebase Console > Authentication, crear un usuario manualmente
2. En Firestore, crear documento en `users/{userId}`:
```json
{
  "email": "admin@empresa.com",
  "nombre": "Admin",
  "apellido": "Sistema",
  "rol": "admin",
  "activo": true,
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>"
}
```

## 📦 Deploy

### GitHub Pages (Automático)

1. Configurar secrets en GitHub:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

2. Push a `main` branch
3. GitHub Actions construirá y desplegará automáticamente

### Manual

```bash
pnpm build
# El output está en apps/pwa/dist
```

## 📁 Estructura del Proyecto

```
├── apps/pwa/                 # Aplicación PWA principal
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── pages/            # Páginas de la app
│   │   ├── services/         # Servicios Firebase
│   │   ├── store/            # Estado global (Zustand)
│   │   ├── types/            # Tipos TypeScript
│   │   └── lib/              # Utilidades
│   └── public/               # Assets estáticos
├── packages/shared/          # Código compartido
├── functions/                # Firebase Cloud Functions
├── firestore.rules           # Reglas de seguridad
└── .github/workflows/        # CI/CD
```

## 🎨 Tecnologías

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui + Radix UI
- **Estado**: Zustand
- **Backend**: Firebase (Auth, Firestore, Storage)
- **PWA**: vite-plugin-pwa + Workbox
- **Monorepo**: Turborepo + pnpm

## 📄 Licencia

MIT
