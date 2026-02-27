# 🏭 Plan Técnico v2.67.0 — Mapa Isométrico de Planta + Sistema de Gamificación

**Fecha**: Enero 2025  
**Versión objetivo**: v2.67.0  
**Estado**: 📋 PLANIFICACIÓN  
**Inspiración**: [FossFLOW](https://github.com/stan-smith/FossFLOW) — Herramienta de diagramación isométrica open-source (18.9k ★)

---

## 📑 Índice

1. [Visión General](#1-visión-general)
2. [Análisis de Tecnologías](#2-análisis-de-tecnologías)
3. [Arquitectura del Mapa Isométrico](#3-arquitectura-del-mapa-isométrico)
4. [Sistema de Gamificación](#4-sistema-de-gamificación)
5. [Modelo de Datos Firestore](#5-modelo-de-datos-firestore)
6. [Componentes React](#6-componentes-react)
7. [Integración con Sistemas Existentes](#7-integración-con-sistemas-existentes)
8. [Plan de Implementación por Fases](#8-plan-de-implementación-por-fases)
9. [Wireframes y UX](#9-wireframes-y-ux)
10. [Riesgos y Mitigaciones](#10-riesgos-y-mitigaciones)

---

## 1. Visión General

### 1.1 Objetivo
Crear una visualización **isométrica 2.5D** estilo SimCity/RollerCoaster Tycoon de las plantas industriales (Acopio, Chonchi, Yal), donde cada equipo, zona y sensor se represente como un elemento interactivo sobre un mapa isométrico. Superponer un **sistema de gamificación completo** que motive a los técnicos a resolver incidencias, completar preventivos y mantener rachas de trabajo.

### 1.2 Alcance

| Módulo | Descripción |
|--------|-------------|
| **Mapa Isométrico** | Visualización 2.5D de la planta con equipos, zonas, sensores y estado en tiempo real |
| **Editor de Mapa** | Herramienta para construir/editar el layout isométrico de la planta (admin) |
| **XP & Niveles** | Sistema de puntos de experiencia con 10 niveles de progresión |
| **Badges/Logros** | 30+ insignias desbloqueables por acciones específicas |
| **Ranking** | Tabla de clasificación semanal/mensual/global |
| **Rachas** | Conteo de días consecutivos con actividad |
| **Misiones Semanales** | Desafíos auto-generados cada lunes |
| **Perfil Gamificado** | Página de perfil con stats, badges, historial |

### 1.3 Usuario objetivo

| Rol | Interacción con Mapa | Gamificación |
|-----|----------------------|--------------|
| `admin` | Editar layout, configurar XP | Ver leaderboard global, configurar misiones |
| `supervisor` | Ver estado global, drill-down zonas | Ver leaderboard de su equipo |
| `tecnico` | Ver equipos asignados, estado, navegar | **Protagonista**: gana XP, desbloquea badges, compite |
| `usuario` | Ver mapa en modo lectura | Ver su perfil básico |

---

## 2. Análisis de Tecnologías

### 2.1 Opción A: Isoflow / FossFLOW (RECOMENDADA)

**FossFLOW** es un fork activo de **Isoflow** por @markmanx. Es una librería React para crear diagramas isométricos.

```
npm install isoflow @isoflow/isopacks
```

| Aspecto | Detalle |
|---------|---------|
| **Licencia** | MIT |
| **Stack** | React 18, TypeScript, Zustand, Paper.js, GSAP |
| **Rendering** | Canvas HTML5 (Paper.js) con overlay React |
| **Iconos** | Sistema extensible de isopacks (AWS, Azure, GCP, K8s) → crear isopack industrial |
| **Interacción** | Drag & drop, zoom, pan, selección, conectores |
| **Estado** | Zustand stores (Model, Scene, UiState) |
| **Exportación** | JSON (serializable), SVG, PNG |
| **Tamaño** | ~200KB gzipped (con Paper.js + GSAP) |

**Pros:**
- ✅ Listo para React — se integra como componente `<Isoflow />`
- ✅ Sistema de iconos extensible — perfecto para crear iconos de equipos industriales
- ✅ Zoom/pan/selección ya resueltos
- ✅ Conectores entre nodos — útil para mostrar flujos de proceso
- ✅ JSON serializable — se guarda directo en Firestore
- ✅ MIT license, comunidad activa

**Contras:**
- ⚠️ Paper.js añade ~150KB al bundle
- ⚠️ No tiene overlay de datos en tiempo real (hay que construirlo)
- ⚠️ Iconos por defecto son de IT/Cloud, no industriales

### 2.2 Opción B: Canvas Propio con Pixi.js

| Aspecto | Detalle |
|---------|---------|
| **Librería** | Pixi.js v7 (~300KB) |
| **Rendering** | WebGL con fallback Canvas |
| **Ventaja** | Máximo rendimiento, 100% personalizable |
| **Desventaja** | Todo desde cero: grid, zoom, pan, iconos, interacción |

### 2.3 Opción C: Three.js Isometric (Existente)

Ya tenemos `Visor3DViewerPage.tsx` con Three.js. Se podría crear una cámara ortográfica para vista isométrica.

| Aspecto | Detalle |
|---------|---------|
| **Ventaja** | Ya está en el proyecto, orbit controls, annotations |
| **Desventaja** | Overkill para 2.5D, más pesado, harder to integrate 2D UI overlays |

### 2.4 Decisión: **Opción A — Isoflow con extensiones custom**

| Razón | Peso |
|-------|------|
| Menor tiempo de desarrollo | ⭐⭐⭐ |
| Grid isométrico ya resuelto | ⭐⭐⭐ |
| Sistema de iconos extensible | ⭐⭐⭐ |
| Serialización JSON → Firestore | ⭐⭐ |
| Comunidad activa + MIT | ⭐⭐ |

---

## 3. Arquitectura del Mapa Isométrico

### 3.1 Componentes de alto nivel

```
┌─────────────────────────────────────────────────────────┐
│                  IsometricPlantView                      │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Isoflow Canvas (Paper.js)             │  │
│  │                                                    │  │
│  │   🏭 Zona Acopio        🏭 Zona Producción        │  │
│  │   ┌──────────┐          ┌──────────────┐          │  │
│  │   │ 🔵 Bomba │──────────│ ⚙️  Motor     │          │  │
│  │   │ 🔵 Bomba │  flujo   │ ⚙️  Motor     │          │  │
│  │   │ 🔵 Bomba │──────────│ 🌡️ Sensor    │          │  │
│  │   └──────────┘          └──────────────┘          │  │
│  │                                                    │  │
│  │   Leyenda:                                         │  │
│  │   🟢 Operativo  🟡 Warning  🔴 Crítico  ⚫ Offline │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ MiniMap  │  │ Filtros  │  │  Panel Detalle Equipo │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │        Barra Gamificación (XP, Racha, Nivel)      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Iconos Industriales Custom (Isopack)

Crear un **isopack industrial** personalizado con iconos isométricos para:

| Categoría | Iconos | Descripción |
|-----------|--------|-------------|
| **Bombas** | `pump-centrifugal`, `pump-vacuum`, `pump-flow` | Bombas de diferentes tipos |
| **Motores** | `motor-electric`, `motor-diesel`, `motor-pneumatic` | Motores industriales |
| **Sensores** | `sensor-temp`, `sensor-vibration`, `sensor-pressure`, `sensor-flow` | Sensores IoT |
| **Estructura** | `building-plant`, `building-warehouse`, `pipe-horizontal`, `pipe-vertical`, `pipe-elbow` | Estructura de planta |
| **Equipos** | `conveyor-belt`, `tank-water`, `tank-chemical`, `compressor`, `valve` | Equipos de proceso |
| **Estado** | `alert-warning`, `alert-critical`, `checkmark-ok`, `wrench-maintenance` | Indicadores de estado |
| **Personas** | `technician`, `supervisor`, `operator` | Personajes para gamificación |

Formato SVG isométrico siguiendo la guía de estilo de Isoflow:
- Perspectiva isométrica 30° (2:1 ratio)
- Tamaños estándar: 1x1, 2x1, 2x2 tiles
- Paleta de colores consistente con la app (MUI theme)

### 3.3 Estructura de Datos del Mapa (JSON → Firestore)

```typescript
// Tipo para el mapa isométrico guardado en Firestore
interface IsometricPlantMap {
  id: string;
  nombre: string;                    // "Planta Acopio"
  descripcion?: string;
  version: number;                   // Versionado del layout
  
  // Configuración del canvas
  config: {
    gridSize: number;               // Tamaño de la grilla (ej: 20x20)
    tileSize: number;               // Pixels por tile
    backgroundColor: string;
    showGrid: boolean;
  };
  
  // Nodos (equipos, zonas, sensores posicionados)
  items: IsometricItem[];
  
  // Conectores (tuberías, cables, flujos)
  connectors: IsometricConnector[];
  
  // Rectángulos (zonas/áreas)
  rectangles: IsometricRectangle[];
  
  // Iconos disponibles (isopack industrial)
  icons: IsometricIcon[];
  
  // Metadatos
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IsometricItem {
  id: string;
  iconId: string;                    // Referencia al icono del isopack
  label: string;                     // "Bomba Vacío N1"
  position: { x: number; y: number }; // Coordenada en grilla isométrica
  
  // Vinculación con datos reales
  linkedEntityType?: 'equipment' | 'sensor' | 'plantAsset' | 'zone';
  linkedEntityId?: string;           // ID del equipo/sensor en Firestore
  
  // Estado visual (calculado en runtime, no persistido)
  // runtimeStatus?: 'ok' | 'warning' | 'critical' | 'offline' | 'maintenance';
  
  // Metadatos del item
  metadata?: Record<string, any>;
}

interface IsometricConnector {
  id: string;
  fromItemId: string;
  toItemId: string;
  label?: string;                    // "Flujo 200L/min"
  style: 'pipe' | 'cable' | 'flow' | 'signal';
  color?: string;
  animated?: boolean;                // Flujo animado
}

interface IsometricRectangle {
  id: string;
  label: string;                     // "Zona Acopio"
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: string;
  opacity: number;
  linkedZoneId?: string;             // Vinculación con Zone existente
}
```

### 3.4 Overlay de Datos en Tiempo Real

El mapa isométrico base es estático (layout de planta). Los **datos en tiempo real** se superponen como overlays:

```
┌─────────────────────────────────────────┐
│           Capas del Mapa                 │
│                                          │
│  Layer 4: 🎮 Gamificación               │  ← Avatares, XP flotante, badges
│  Layer 3: ⚠️  Alertas & Incidencias      │  ← Iconos de alerta, contadores
│  Layer 2: 📊 Datos Sensores             │  ← Valores en tiempo real
│  Layer 1: 🏭 Layout de Planta           │  ← Isoflow canvas (estático)
│  Layer 0: 📐 Grid Isométrico            │  ← Grilla base
│                                          │
└─────────────────────────────────────────┘
```

Cada layer se implementa como un componente React superpuesto al canvas de Isoflow:

```typescript
function IsometricPlantView({ mapId }: { mapId: string }) {
  return (
    <div className="isometric-container" style={{ position: 'relative' }}>
      {/* Layer 0-1: Isoflow canvas con layout */}
      <IsoflowCanvas mapData={mapData} icons={industrialIsopack} />
      
      {/* Layer 2: Overlay de sensores */}
      <SensorDataOverlay 
        items={mapData.items.filter(i => i.linkedEntityType === 'sensor')} 
      />
      
      {/* Layer 3: Alertas e incidencias */}
      <AlertOverlay 
        incidents={activeIncidents}
        predictions={activePredictions}
      />
      
      {/* Layer 4: Gamificación */}
      <GamificationOverlay 
        activeUsers={onlineTechnicians}
        recentXP={recentXPEvents}
      />
      
      {/* UI Controls */}
      <MiniMap />
      <FilterPanel />
      <DetailSidebar />
      <GamificationBar />
    </div>
  );
}
```

---

## 4. Sistema de Gamificación

### 4.1 Sistema de XP (Puntos de Experiencia)

#### Tabla de XP por Acción

| Acción | XP Base | Multiplicador Prioridad | XP Máx |
|--------|---------|------------------------|--------|
| **Resolver incidencia** | 50 | ×1 baja, ×1.5 media, ×2 alta, ×3 crítica | 150 |
| **Resolver en < 1 hora** | +30 bonus | — | 30 |
| **Resolver en < 30 min** | +50 bonus | — | 50 |
| **Completar preventivo** | 30 | — | 30 |
| **Completar checklist 100%** | +15 bonus | — | 15 |
| **Reportar incidencia** | 10 | — | 10 |
| **Agregar evidencia fotográfica** | 5 | — | 5 |
| **Completar análisis causa raíz** | 40 | — | 40 |
| **Autoasignarse incidencia** | 15 | — | 15 |
| **Dar feedback a ARIA** | 5 | — | 5 |
| **Responder correctamente a ARIA** | 10 | — | 10 |
| **Mantener racha diaria** | 10/día | ×streak_multiplier | 50 |
| **Completar misión semanal** | 100 | — | 100 |
| **Primera resolución del día** | +20 bonus | — | 20 |

#### Multiplicadores

```typescript
// Multiplicador por racha consecutiva
function getStreakMultiplier(streakDays: number): number {
  if (streakDays >= 30) return 2.0;   // Racha de 30+ días
  if (streakDays >= 14) return 1.75;  // Racha de 14+ días
  if (streakDays >= 7)  return 1.5;   // Racha de 7+ días
  if (streakDays >= 3)  return 1.25;  // Racha de 3+ días
  return 1.0;
}

// Multiplicador por hora (incentivar turnos nocturnos)
function getTimeMultiplier(hour: number): number {
  if (hour >= 22 || hour < 6) return 1.5;  // Nocturno
  if (hour >= 6 && hour < 8)  return 1.25; // Madrugada
  return 1.0;
}
```

### 4.2 Sistema de Niveles

10 niveles con progresión exponencial:

| Nivel | Nombre | XP Requerido | XP Acumulado | Icono | Beneficio |
|-------|--------|-------------|--------------|-------|-----------|
| 1 | **Novato** | 0 | 0 | 🟤 | Acceso básico |
| 2 | **Aprendiz** | 200 | 200 | 🟠 | Ver mini-stats en dashboard |
| 3 | **Técnico Jr.** | 500 | 700 | 🟡 | Badge en perfil |
| 4 | **Técnico** | 1,000 | 1,700 | 🟢 | Autoasignación prioritaria |
| 5 | **Técnico Sr.** | 2,000 | 3,700 | 🔵 | Acceso a análisis avanzado |
| 6 | **Especialista** | 3,500 | 7,200 | 🟣 | Puede mentorear novatos |
| 7 | **Experto** | 5,000 | 12,200 | 💎 | Avatar premium en mapa |
| 8 | **Maestro** | 8,000 | 20,200 | 🏆 | Banner personalizado |
| 9 | **Leyenda** | 12,000 | 32,200 | ⭐ | Título en leaderboard |
| 10 | **Héroe de Planta** | 20,000 | 52,200 | 👑 | Corona en avatar, mención especial |

```typescript
interface LevelDefinition {
  level: number;
  nombre: string;
  xpRequired: number;      // XP necesario para este nivel (no acumulado)
  xpAccumulated: number;   // XP total acumulado para alcanzar este nivel
  icon: string;             // Emoji o URL de icono
  color: string;            // Color del nivel (MUI theme)
  beneficio: string;
}

const LEVELS: LevelDefinition[] = [
  { level: 1,  nombre: 'Novato',           xpRequired: 0,     xpAccumulated: 0,     icon: '🟤', color: '#795548', beneficio: 'Acceso básico' },
  { level: 2,  nombre: 'Aprendiz',         xpRequired: 200,   xpAccumulated: 200,   icon: '🟠', color: '#ff9800', beneficio: 'Mini-stats en dashboard' },
  { level: 3,  nombre: 'Técnico Jr.',      xpRequired: 500,   xpAccumulated: 700,   icon: '🟡', color: '#ffc107', beneficio: 'Badge en perfil' },
  { level: 4,  nombre: 'Técnico',          xpRequired: 1000,  xpAccumulated: 1700,  icon: '🟢', color: '#4caf50', beneficio: 'Autoasignación prioritaria' },
  { level: 5,  nombre: 'Técnico Sr.',      xpRequired: 2000,  xpAccumulated: 3700,  icon: '🔵', color: '#2196f3', beneficio: 'Análisis avanzado' },
  { level: 6,  nombre: 'Especialista',     xpRequired: 3500,  xpAccumulated: 7200,  icon: '🟣', color: '#9c27b0', beneficio: 'Mentoría' },
  { level: 7,  nombre: 'Experto',          xpRequired: 5000,  xpAccumulated: 12200, icon: '💎', color: '#00bcd4', beneficio: 'Avatar premium' },
  { level: 8,  nombre: 'Maestro',          xpRequired: 8000,  xpAccumulated: 20200, icon: '🏆', color: '#ff5722', beneficio: 'Banner personalizado' },
  { level: 9,  nombre: 'Leyenda',          xpRequired: 12000, xpAccumulated: 32200, icon: '⭐', color: '#ffd700', beneficio: 'Título en leaderboard' },
  { level: 10, nombre: 'Héroe de Planta',  xpRequired: 20000, xpAccumulated: 52200, icon: '👑', color: '#e91e63', beneficio: 'Corona + mención especial' },
];
```

### 4.3 Badges (Insignias / Logros)

#### Categorías de Badges

**🔧 Resolución de Incidencias**

| Badge | Nombre | Condición | XP Bonus |
|-------|--------|-----------|----------|
| 🔧 | **Primera Reparación** | Resolver 1 incidencia | 20 |
| 🔧🔧 | **Reparador** | Resolver 10 incidencias | 50 |
| 🔧🔧🔧 | **Maestro Reparador** | Resolver 50 incidencias | 100 |
| ⚡ | **Rayo** | Resolver incidencia en < 15 min | 30 |
| ⚡⚡ | **Velocidad Luz** | Resolver 5 incidencias en < 15 min | 75 |
| 🔴 | **Domador de Crisis** | Resolver incidencia crítica | 40 |
| 🔴🔴 | **Anti-Catástrofe** | Resolver 10 incidencias críticas | 100 |
| 🎯 | **Ojo de Águila** | Completar 5 análisis causa raíz | 60 |

**🛡️ Mantenimiento Preventivo**

| Badge | Nombre | Condición | XP Bonus |
|-------|--------|-----------|----------|
| 🛡️ | **Previsor** | Completar 5 tareas preventivas | 30 |
| 🛡️🛡️ | **Guardián** | Completar 25 tareas preventivas | 75 |
| 🛡️🛡️🛡️ | **Protector** | Completar 100 tareas preventivas | 150 |
| ✅ | **Perfeccionista** | Completar checklist al 100% 10 veces | 50 |
| 📸 | **Documentador** | Agregar evidencia fotográfica 20 veces | 40 |

**🔥 Rachas**

| Badge | Nombre | Condición | XP Bonus |
|-------|--------|-----------|----------|
| 🔥 | **En Llamas** | Racha de 3 días | 15 |
| 🔥🔥 | **Imparable** | Racha de 7 días | 40 |
| 🔥🔥🔥 | **Incombustible** | Racha de 14 días | 80 |
| 💀 | **Inmortal** | Racha de 30 días | 200 |

**🤖 ARIA & IA**

| Badge | Nombre | Condición | XP Bonus |
|-------|--------|-----------|----------|
| 🤖 | **Amigo de ARIA** | Dar 10 feedbacks a ARIA | 25 |
| 🧠 | **Maestro IA** | ARIA aprende de tus correcciones 5 veces | 50 |
| 💬 | **Comunicador** | Usar chat ARIA 50 veces | 30 |

**🏆 Especiales**

| Badge | Nombre | Condición | XP Bonus |
|-------|--------|-----------|----------|
| 🌙 | **Búho Nocturno** | Resolver incidencia entre 22:00 y 06:00 | 25 |
| 🏅 | **#1 Semanal** | Ser #1 en ranking semanal | 100 |
| 👑 | **Rey del Mes** | Ser #1 en ranking mensual | 250 |
| 🎓 | **Graduado** | Alcanzar nivel 5 | 75 |
| 🦸 | **Héroe** | Alcanzar nivel 10 | 500 |
| 🏗️ | **Constructor** | Contribuir al mapa isométrico (admin) | 50 |
| 🗺️ | **Explorador** | Visitar todas las zonas del mapa | 30 |

```typescript
interface BadgeDefinition {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;                     // Emoji o URL
  categoria: 'resolucion' | 'preventivo' | 'rachas' | 'aria' | 'especial';
  condicion: BadgeCondition;
  xpBonus: number;
  secreto?: boolean;                 // Badge oculto hasta desbloqueado
}

interface BadgeCondition {
  tipo: 'count' | 'streak' | 'time' | 'level' | 'ranking' | 'custom';
  metrica: string;                  // Ej: 'incidents_resolved', 'streak_days'
  objetivo: number;                 // Valor a alcanzar
  filtro?: Record<string, any>;     // Ej: { prioridad: 'critica' } o { tiempoMaxMinutos: 15 }
}

interface UserBadge {
  badgeId: string;
  unlockedAt: Date;
  progress: number;                 // 0-100% hacia el siguiente
  notified: boolean;                // Si se mostró la notificación
}
```

### 4.4 Ranking / Leaderboard

```typescript
interface LeaderboardEntry {
  userId: string;
  nombre: string;
  apellido: string;
  photoURL?: string;
  nivel: number;
  nivelNombre: string;
  nivelIcon: string;
  xpTotal: number;
  xpPeriodo: number;                // XP ganado en el período actual
  incidenciasResueltas: number;
  preventivosCompletados: number;
  rachaActual: number;
  badgesCount: number;
  rank: number;                     // Posición en el ranking
  rankChange: number;               // Cambio respecto al período anterior (+2, -1, 0)
}

// Períodos del leaderboard
type LeaderboardPeriod = 'semanal' | 'mensual' | 'global';
```

El leaderboard se calcula bajo demanda con Cloud Functions o en el cliente grouping los datos:

```
leaderboard/
  └─ {period}_{date}/             // ej: "semanal_2025-W04", "mensual_2025-01"
     └─ entries: LeaderboardEntry[]
```

### 4.5 Rachas (Streaks)

```typescript
interface UserStreak {
  currentStreak: number;            // Días consecutivos actuales
  longestStreak: number;            // Récord personal
  lastActivityDate: string;         // "2025-01-20" (fecha local, no timestamp)
  streakStartDate: string;          // Inicio de la racha actual
  
  // Historial resumido
  streakHistory: {
    startDate: string;
    endDate: string;
    days: number;
  }[];
}
```

**Reglas de racha:**
- Se considera "actividad" cualquier acción que otorgue XP
- La racha se reinicia a 0 si pasan más de 36 horas sin actividad (gracia de 12h para cambio de turno)
- La racha se calcula en horario local de Chile (UTC-3 / UTC-4)
- Al perder una racha de 7+ días, se muestra animación motivacional

### 4.6 Misiones Semanales

Cada lunes a las 00:00 (hora Chile) se generan 3-5 misiones para cada técnico:

```typescript
interface WeeklyMission {
  id: string;
  weekId: string;                   // "2025-W04"
  userId: string;
  
  missions: Mission[];
  
  generatedAt: Date;
  expiresAt: Date;                  // Domingo 23:59
}

interface Mission {
  id: string;
  tipo: MissionType;
  titulo: string;                   // "Resolver 3 incidencias esta semana"
  descripcion: string;
  icono: string;
  
  objetivo: number;                 // Valor a alcanzar
  progreso: number;                 // Progreso actual
  completada: boolean;
  completadaAt?: Date;
  
  xpRecompensa: number;            // XP al completar
  badgeRecompensa?: string;        // Badge especial (opcional)
  
  dificultad: 'facil' | 'normal' | 'dificil';
}

type MissionType = 
  | 'resolve_incidents'             // Resolver N incidencias
  | 'resolve_critical'              // Resolver N críticas
  | 'fast_resolution'               // Resolver N en < X minutos
  | 'complete_preventive'           // Completar N preventivos
  | 'perfect_checklist'             // Checklist 100% N veces
  | 'photo_evidence'                // Agregar N evidencias
  | 'aria_feedback'                 // Dar N feedbacks a ARIA
  | 'root_cause_analysis'           // Completar N análisis
  | 'maintain_streak'               // Mantener racha N días
  | 'explore_zones';                // Visitar N zonas del mapa
```

**Algoritmo de generación de misiones:**

```typescript
function generateWeeklyMissions(userId: string, userStats: UserStats): Mission[] {
  const missions: Mission[] = [];
  
  // 1 misión fácil (siempre)
  missions.push(pickEasyMission(userStats));
  
  // 2 misiones normales
  missions.push(pickNormalMission(userStats));
  missions.push(pickNormalMission(userStats));
  
  // 1 misión difícil (si nivel >= 3)
  if (userStats.level >= 3) {
    missions.push(pickHardMission(userStats));
  }
  
  // 1 misión bonus aleatoria (si nivel >= 5)
  if (userStats.level >= 5) {
    missions.push(pickBonusMission(userStats));
  }
  
  return missions;
}
```

---

## 5. Modelo de Datos Firestore

### 5.1 Nuevas Colecciones

```
FIRESTORE (nuevas colecciones)
│
├─ 🗺️  isometricMaps                    ← Layouts isométricos de plantas
│  └─ {mapId}
│     ├─ nombre, descripcion, version
│     ├─ config: { gridSize, tileSize, ... }
│     ├─ items: IsometricItem[]
│     ├─ connectors: IsometricConnector[]
│     ├─ rectangles: IsometricRectangle[]
│     ├─ icons: IsometricIcon[]
│     └─ createdBy, createdAt, updatedAt
│
├─ 🎮 gamification                       ← Perfiles de gamificación por usuario
│  └─ {userId}
│     ├─ xpTotal: number                 ← XP acumulado total
│     ├─ xpThisWeek: number
│     ├─ xpThisMonth: number
│     ├─ level: number
│     ├─ levelName: string
│     │
│     ├─ streak: {                       ← Datos de racha
│     │    current, longest,
│     │    lastActivityDate, startDate
│     │  }
│     │
│     ├─ badges: UserBadge[]             ← Badges desbloqueados
│     │
│     ├─ stats: {                        ← Estadísticas acumuladas
│     │    incidenciasResueltas: number,
│     │    incidenciasCriticasResueltas: number,
│     │    preventivosCompletados: number,
│     │    tiempoPromedioResolucionMin: number,
│     │    resoluciones_rapidas: number,  // < 30 min
│     │    feedbacksARIA: number,
│     │    fotos_evidencia: number,
│     │    analisis_causa_raiz: number,
│     │    checklist_perfectos: number,
│     │  }
│     │
│     └─ updatedAt: Date
│
├─ 🎯 weeklyMissions                    ← Misiones semanales generadas
│  └─ {weekId}_{userId}                  ← ej: "2025-W04_uid123"
│     ├─ weekId, userId
│     ├─ missions: Mission[]
│     ├─ generatedAt, expiresAt
│     └─ allCompleted: boolean
│
├─ 📊 xpEvents                          ← Log de eventos XP (para auditoría)
│  └─ {eventId}
│     ├─ userId: string
│     ├─ action: string                  ← "resolve_incident", "complete_preventive"
│     ├─ xpAmount: number
│     ├─ multiplier: number
│     ├─ entityId?: string               ← ID de la incidencia/tarea
│     ├─ entityType?: string             ← "incident", "preventive", "feedback"
│     ├─ metadata?: {}
│     └─ createdAt: Date
│
└─ 🏆 leaderboards                      ← Rankings precalculados
   └─ {periodId}                         ← "semanal_2025-W04", "mensual_2025-01", "global"
      ├─ period, startDate, endDate
      ├─ entries: LeaderboardEntry[]
      └─ updatedAt: Date
```

### 5.2 Reglas Firestore (Adiciones)

```javascript
// === GAMIFICATION ===
match /gamification/{userId} {
  allow read: if isAuthenticated();
  allow write: if isAuthenticated() && request.auth.uid == userId;
  // Solo el propio usuario puede escribir su perfil de gamificación
  // Cloud Functions también pueden escribir (service account)
}

match /xpEvents/{eventId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated();
  // No se pueden modificar ni eliminar eventos de XP (inmutables)
  allow update, delete: if false;
}

match /weeklyMissions/{docId} {
  allow read: if isAuthenticated();
  // Crear/actualizar solo si es el propio usuario o admin
  allow write: if isAuthenticated() && (
    resource == null || 
    resource.data.userId == request.auth.uid || 
    isAdmin()
  );
}

match /leaderboards/{periodId} {
  allow read: if isAuthenticated();
  // Solo Cloud Functions o admin pueden escribir rankings
  allow write: if isAdmin();
}

// === ISOMETRIC MAPS ===
match /isometricMaps/{mapId} {
  allow read: if isAuthenticated();
  allow create: if isAdmin() || isSupervisor();
  allow update: if isAdmin() || isSupervisor();
  allow delete: if isAdmin();
}
```

### 5.3 Modificaciones a Colecciones Existentes

**users/{userId}** — Agregar campo:
```typescript
{
  // ... campos existentes ...
  gamificationEnabled: boolean;      // Opt-in/opt-out de gamificación
  gamificationProfile?: string;      // Referencia al doc en gamification/
}
```

---

## 6. Componentes React

### 6.1 Árbol de Componentes — Mapa Isométrico

```
pages/
  └─ IsometricMap/
     ├─ IsometricMapPage.tsx           ← Página principal (/mapa-isometrico)
     ├─ IsometricMapEditor.tsx         ← Editor admin (/admin/mapa-isometrico)
     └─ components/
        ├─ IsoflowCanvas.tsx           ← Wrapper de Isoflow con data binding
        ├─ IndustrialIsopack.tsx       ← Registro de iconos industriales
        ├─ SensorDataOverlay.tsx       ← Overlay con valores de sensores
        ├─ AlertOverlay.tsx            ← Overlay de alertas/incidencias
        ├─ GamificationOverlay.tsx     ← Avatares, XP flotante
        ├─ EquipmentDetailPanel.tsx    ← Panel lateral al clickear equipo
        ├─ MiniMap.tsx                 ← Miniatura de navegación
        ├─ MapFilterPanel.tsx          ← Filtros (zona, tipo, estado)
        └─ MapLegend.tsx              ← Leyenda de colores/estados
```

### 6.2 Árbol de Componentes — Gamificación

```
components/
  └─ gamification/
     ├─ XPBar.tsx                      ← Barra de XP con animación
     ├─ LevelBadge.tsx                 ← Badge de nivel actual
     ├─ StreakCounter.tsx              ← Contador de racha con llama
     ├─ XPNotification.tsx            ← "+50 XP!" animación flotante
     ├─ LevelUpModal.tsx              ← Modal de subida de nivel
     ├─ BadgeUnlockModal.tsx          ← Modal de badge desbloqueado
     ├─ WeeklyMissionsCard.tsx        ← Card de misiones semanales
     ├─ MissionProgressBar.tsx        ← Barra de progreso de misión
     ├─ LeaderboardTable.tsx          ← Tabla de ranking
     ├─ LeaderboardPodium.tsx         ← Top 3 con podio visual
     ├─ UserProfileCard.tsx           ← Tarjeta de perfil gamificado
     ├─ BadgeGrid.tsx                 ← Grid de todos los badges
     ├─ StatsOverview.tsx             ← Resumen de estadísticas
     └─ GamificationDashboard.tsx     ← Dashboard completo

pages/
  └─ Gamification/
     ├─ GamificationPage.tsx           ← Página principal (/gamificacion)
     ├─ LeaderboardPage.tsx            ← Ranking (/ranking)
     ├─ ProfilePage.tsx                ← Perfil gamificado (/perfil/:userId)
     └─ MissionsPage.tsx              ← Misiones (/misiones)
```

### 6.3 Servicios

```
services/
  ├─ gamification.ts                   ← CRUD gamificación, cálculos XP
  │   ├─ awardXP(userId, action, entityId)
  │   ├─ checkBadgeUnlocks(userId)
  │   ├─ updateStreak(userId)
  │   ├─ getLeaderboard(period)
  │   ├─ getUserGamificationProfile(userId)
  │   └─ calculateLevel(xpTotal)
  │
  ├─ weeklyMissions.ts                 ← Generación y seguimiento de misiones
  │   ├─ generateMissions(userId)
  │   ├─ updateMissionProgress(userId, missionId, progress)
  │   └─ getActiveMissions(userId)
  │
  └─ isometricMap.ts                   ← CRUD mapas isométricos
      ├─ getMap(mapId)
      ├─ saveMap(mapData)
      ├─ getItemsWithRealTimeData(mapId)
      └─ subscribeToMapAlerts(mapId, callback)
```

### 6.4 Hooks Custom

```typescript
// hooks/useGamification.ts
function useGamification(userId: string) {
  // Retorna perfil de gamificación en tiempo real
  return { profile, level, xp, streak, badges, loading };
}

// hooks/useLeaderboard.ts
function useLeaderboard(period: LeaderboardPeriod) {
  return { entries, myRank, loading };
}

// hooks/useWeeklyMissions.ts
function useWeeklyMissions(userId: string) {
  return { missions, completedCount, totalCount, loading };
}

// hooks/useIsometricMap.ts
function useIsometricMap(mapId: string) {
  // Map data + real-time overlays
  return { mapData, sensorData, alerts, loading };
}

// hooks/useXPAnimation.ts
function useXPAnimation() {
  // Cola de animaciones XP para mostrar "+50 XP!" 
  return { xpEvents, showXP, dismissXP };
}
```

---

## 7. Integración con Sistemas Existentes

### 7.1 Puntos de Otorgamiento de XP

Los XP se otorgan **automáticamente** cuando ocurren acciones en el sistema existente:

```typescript
// En incidents.ts — al resolver incidencia
async function resolveIncident(incidentId: string, resolution: string) {
  // ... lógica existente ...
  
  // ✨ NUEVO: Otorgar XP
  const incident = await getIncident(incidentId);
  const resolvedBy = incident.resolvedBy!;
  const tiempoResolucion = incident.tiempoResolucionMinutos || 0;
  
  let xp = 50; // Base
  xp *= getPriorityMultiplier(incident.prioridad);
  
  if (tiempoResolucion < 30) xp += 50;
  else if (tiempoResolucion < 60) xp += 30;
  
  await awardXP(resolvedBy, 'resolve_incident', incidentId, xp);
  await updateStreak(resolvedBy);
  await checkBadgeUnlocks(resolvedBy);
  await updateMissionProgress(resolvedBy, 'resolve_incidents', 1);
}
```

### 7.2 Mapeo Mapa Isométrico ↔ Datos Existentes

| Entidad Isométrica | Fuente Firestore | Campo de Enlace |
|--------------------|--------------------|----------------|
| Nodo "Bomba Vacío N1" | `plantAssets/asset-720004340` | `linkedEntityId` |
| Nodo "Motor Siemens" | `equipment/eq-001` | `linkedEntityId` |
| Nodo "Sensor Temp" | `iotDevices/dev-esp32-01` | `linkedEntityId` |
| Rectángulo "Zona Acopio" | `zones/zone-acopio` | `linkedZoneId` |
| Alerta en nodo | `incidents?equipmentId=X&status=pendiente` | Real-time query |
| Valor sensor | `sensorData?deviceId=X` | Real-time listener |

### 7.3 Rutas Nuevas

```typescript
// En App.tsx — agregar rutas
const IsometricMapPage = lazy(() => import('./pages/IsometricMap/IsometricMapPage'));
const IsometricMapEditor = lazy(() => import('./pages/IsometricMap/IsometricMapEditor'));
const GamificationPage = lazy(() => import('./pages/Gamification/GamificationPage'));
const LeaderboardPage = lazy(() => import('./pages/Gamification/LeaderboardPage'));
const MissionsPage = lazy(() => import('./pages/Gamification/MissionsPage'));

// Rutas:
// /mapa-isometrico           → Vista del mapa isométrico (todos)
// /mapa-isometrico/:mapId    → Mapa específico
// /admin/mapa-isometrico     → Editor de mapa (admin/supervisor)
// /gamificacion              → Dashboard de gamificación
// /ranking                   → Leaderboard
// /misiones                  → Misiones semanales
// /perfil/:userId            → Perfil gamificado (reutilizar existente?)
```

### 7.4 Navegación

Agregar al sidebar/drawer:

```
📊 Dashboard
📋 Incidencias
🔧 Equipos
🗺️ Mapa (existente)
🏭 Mapa 3D (isométrico)        ← NUEVO
🛡️ Preventivo
📈 Predictivo
🤖 ARIA Chat
---
🎮 Gamificación                   ← NUEVO
🏆 Ranking                        ← NUEVO
🎯 Misiones                       ← NUEVO
---
⚙️ Admin
```

---

## 8. Plan de Implementación por Fases

### Fase 1: Fundación Gamificación (v2.67.0) — ~3-4 días

**Objetivo**: Sistema de XP, niveles y badges funcional

| # | Tarea | Estimación |
|---|-------|-----------|
| 1 | Crear tipos TypeScript para gamificación | 2h |
| 2 | Crear servicio `gamification.ts` con `awardXP`, `calculateLevel`, `updateStreak` | 4h |
| 3 | Crear colecciones Firestore + reglas | 1h |
| 4 | Crear componentes `XPBar`, `LevelBadge`, `StreakCounter` | 3h |
| 5 | Crear `XPNotification` (animación "+50 XP!") | 2h |
| 6 | Crear `LevelUpModal` y `BadgeUnlockModal` | 3h |
| 7 | Integrar XP en resolución de incidencias | 2h |
| 8 | Integrar XP en completar preventivos | 2h |
| 9 | Agregar barra de gamificación al layout principal | 1h |
| 10 | Definir 30+ badges con condiciones | 2h |
|  | **Total Fase 1** | **~22h** |

### Fase 2: Leaderboard y Misiones (v2.68.0) — ~2-3 días

| # | Tarea | Estimación |
|---|-------|-----------|
| 1 | Crear `LeaderboardTable` y `LeaderboardPodium` | 4h |
| 2 | Crear `LeaderboardPage` con tabs (semanal/mensual/global) | 3h |
| 3 | Crear servicio `weeklyMissions.ts` con generador | 4h |
| 4 | Crear `WeeklyMissionsCard` y `MissionProgressBar` | 3h |
| 5 | Crear `MissionsPage` | 2h |
| 6 | Cloud Function para generar misiones cada lunes | 3h |
| 7 | Cloud Function para calcular leaderboard diario | 2h |
|  | **Total Fase 2** | **~21h** |

### Fase 3: Mapa Isométrico Base (v2.69.0) — ~4-5 días

| # | Tarea | Estimación |
|---|-------|-----------|
| 1 | Instalar Isoflow y configurar en el proyecto | 2h |
| 2 | Crear isopack industrial (20+ iconos SVG isométricos) | 8h |
| 3 | Crear `IsometricMapPage` con Isoflow integrado | 4h |
| 4 | Crear `IsometricMapEditor` (admin) con save/load a Firestore | 6h |
| 5 | Implementar vinculación items ↔ equipos/sensores | 3h |
| 6 | Crear `EquipmentDetailPanel` (al clickear nodo) | 3h |
| 7 | Crear `MiniMap` y `MapLegend` | 2h |
| 8 | Diseñar layout isométrico de Planta Acopio (primer mapa) | 4h |
|  | **Total Fase 3** | **~32h** |

### Fase 4: Datos en Tiempo Real en Mapa (v2.70.0) — ~3 días

| # | Tarea | Estimación |
|---|-------|-----------|
| 1 | Crear `SensorDataOverlay` con listeners real-time | 4h |
| 2 | Crear `AlertOverlay` vinculado a incidencias activas | 3h |
| 3 | Crear `GamificationOverlay` (avatares de técnicos en mapa) | 4h |
| 4 | Animaciones de estado (pulso warning, parpadeo critical) | 3h |
| 5 | Conectores animados (flujo de proceso) | 3h |
| 6 | `MapFilterPanel` (filtrar por tipo, estado, zona) | 2h |
|  | **Total Fase 4** | **~19h** |

### Fase 5: Perfil y Dashboard Gamificado (v2.71.0) — ~2 días

| # | Tarea | Estimación |
|---|-------|-----------|
| 1 | Crear `GamificationDashboard` con stats overview | 4h |
| 2 | Crear `BadgeGrid` con todos los badges y progreso | 3h |
| 3 | Crear `UserProfileCard` mejorado | 2h |
| 4 | Agregar gamificación al dashboard principal | 2h |
| 5 | Notificaciones push para level-up y badges | 3h |
|  | **Total Fase 5** | **~14h** |

### Resumen de Fases

```
Fase 1 (v2.67.0): ████████████████████████ 22h  — XP, Niveles, Badges
Fase 2 (v2.68.0): █████████████████████    21h  — Leaderboard, Misiones
Fase 3 (v2.69.0): ████████████████████████████████ 32h  — Mapa Isométrico Base
Fase 4 (v2.70.0): ███████████████████      19h  — Real-time Data en Mapa
Fase 5 (v2.71.0): ██████████████           14h  — Perfil & Dashboard
─────────────────────────────────────────────
TOTAL:                                     108h  (~14 días laborales)
```

---

## 9. Wireframes y UX

### 9.1 Mapa Isométrico — Vista Principal

```
┌─────────────────────────────────────────────────────────────┐
│  🏭 Mapa Isométrico — Planta Acopio                    [≡] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───┐  ┌─────────────────────────────────────────────┐     │
│  │   │  │                                              │     │
│  │ M │  │      ╱╲    ╱╲    ╱╲    ╱╲    ╱╲             │     │
│  │ i │  │    ╱    ╲╱    ╲╱ 🔵 ╲╱    ╲╱    ╲           │     │
│  │ n │  │   │  ZONA ACOPIO  │   │  ZONA    │          │     │
│  │ i │  │   │  🔵 🔵 🔵    │   │  PROD    │          │     │
│  │   │  │    ╲    ┌───────┐╱   │  ⚙️  ⚙️   │          │     │
│  │ M │  │     ╲   │⚠️ 2   │    │  🌡️25°C  │          │     │
│  │ a │  │      ╲  │alerts │╱    ╲         ╱           │     │
│  │ p │  │       ╲ └───────╱      ╲  ╱╲  ╱             │     │
│  │   │  │        ╲      ╱        ╲╱    ╲╱              │     │
│  └───┘  │                                              │     │
│         └─────────────────────────────────────────────┘     │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────┐     │
│  │ 🔍 Filtros       │  │ 📊 Panel: Bomba Vacío N1     │     │
│  │ ☑ Bombas         │  │ Estado: 🟢 Operativo         │     │
│  │ ☑ Motores        │  │ Temp: 25.3°C | Vib: 2.1mm/s │     │
│  │ ☑ Sensores       │  │ Última incidencia: hace 3d   │     │
│  │ ☐ Alertas solo   │  │ [Ver detalle] [Crear incid.] │     │
│  └──────────────────┘  └──────────────────────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🎮 Nivel 5 ⭐ Técnico Sr. │ XP: 3,700/5,700 ████░░ │   │
│  │ 🔥 Racha: 7 días          │ 🏆 #3 esta semana       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Dashboard Gamificación

```
┌─────────────────────────────────────────────────────────────┐
│  🎮 Gamificación                                        [≡] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  👤 Juan Pérez                                        │   │
│  │  🔵 Nivel 5 — Técnico Sr.                            │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░  3,700 / 5,700 XP   │   │
│  │  🔥 Racha: 7 días   │  🏅 12 Badges   │  #3 Ranking  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── 🎯 Misiones Semanales ─────────────────────────────┐  │
│  │                                                        │  │
│  │  ✅ Resolver 3 incidencias      3/3  ██████████ +100XP │  │
│  │  🔄 Completar 2 preventivos     1/2  █████░░░░░  +50XP │  │
│  │  🔄 Dar feedback a ARIA 5 veces 3/5  ██████░░░░  +30XP │  │
│  │  ⬜ Resolver crítica en < 30min  0/1  ░░░░░░░░░░ +150XP │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── 🏅 Badges Recientes ──────────────────────────────┐   │
│  │  🔧 Primera Reparación  │  🛡️ Previsor  │  🔥 En Llamas │   │
│  │  ⚡ Rayo                │  📸 Documentador │  (12/30)   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─── 🏆 Ranking Semanal ───────────────────────────────┐   │
│  │  🥇 Carlos M.   │ Nivel 7  │ 850 XP  │ ↑ +2          │   │
│  │  🥈 Ana R.      │ Nivel 6  │ 720 XP  │ ↓ -1          │   │
│  │  🥉 Juan P.     │ Nivel 5  │ 680 XP  │ → 0           │   │
│  │  4. Pedro L.    │ Nivel 4  │ 450 XP  │ ↑ +1          │   │
│  │  5. María G.    │ Nivel 3  │ 320 XP  │ ↓ -2          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Notificación XP (Toast animado)

```
                    ┌──────────────────────┐
                    │  ✨ +50 XP           │
                    │  Incidencia resuelta! │
                    │  ⚡ Bonus velocidad   │
                    │  +30 XP              │
                    └──────────────────────┘
                            ↑
                    (aparece y sube con fade)
```

### 9.4 Modal Level Up

```
┌───────────────────────────────────────────┐
│                                            │
│           ✨ ¡SUBISTE DE NIVEL! ✨         │
│                                            │
│              🔵 → 🟣                       │
│         Técnico Sr. → Especialista          │
│                                            │
│     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                 100%                        │
│                                            │
│  🎁 Nuevo beneficio: Mentoría              │
│     Ahora puedes mentorear novatos         │
│                                            │
│          [ 🎉 ¡Genial! ]                   │
│                                            │
└───────────────────────────────────────────┘
```

---

## 10. Riesgos y Mitigaciones

| # | Riesgo | Impacto | Probabilidad | Mitigación |
|---|--------|---------|--------------|------------|
| 1 | **Isoflow no soporta nuestros requisitos** | Alto | Media | Evaluar en Fase 3, tener Pixi.js como plan B |
| 2 | **Iconos isométricos industriales complejos** | Medio | Alta | Empezar con iconos simples geométricos, iterar |
| 3 | **Performance con muchos overlays real-time** | Alto | Media | Throttle updates a 5s, virtualizar nodos fuera de viewport |
| 4 | **Gamificación puede sentirse "forzada"** | Medio | Baja | Hacer opt-in, permitir desactivar notificaciones |
| 5 | **Cálculo de XP inconsistente en concurrencia** | Medio | Media | Usar transacciones Firestore para atomicidad |
| 6 | **Bundle size crece con Isoflow + Paper.js** | Bajo | Alta | Lazy loading del módulo isométrico (~200KB extra) |
| 7 | **Misiones mal balanceadas** | Bajo | Media | Ajustar según data real después de 2 semanas |
| 8 | **Técnicos gaming the system** | Bajo | Baja | Auditoría de xpEvents, caps por acción, review semanal |

---

## 📦 Dependencias Nuevas

```json
{
  "dependencies": {
    "isoflow": "^1.x.x",
    "@isoflow/isopacks": "^1.x.x",
    "canvas-confetti": "^1.9.0",
    "framer-motion": "^11.x"
  }
}
```

| Paquete | Propósito | Tamaño |
|---------|-----------|--------|
| `isoflow` | Motor de diagramas isométricos | ~180KB gz |
| `@isoflow/isopacks` | Paquetes de iconos base | ~50KB gz |
| `canvas-confetti` | Animación confetti para level-up | ~5KB gz |
| `framer-motion` | Animaciones XP y transiciones (si no ya está) | ~35KB gz |

---

## 📐 Decisiones Arquitectónicas

| Decisión | Alternativa | Razón |
|----------|-------------|-------|
| XP calculado client-side | Cloud Function | Simplicidad, offline-first, menos latencia |
| Leaderboard precalculado | Query en tiempo real | Performance con muchos usuarios |
| Badges evaluados on-action | Cron job | Feedback inmediato al usuario |
| Isoflow como librería | Fork completo | Mantenibilidad, updates upstream |
| Iconos SVG isométricos | 3D models | Ligereza, consistencia, facilidad de crear |

---

## ✅ Criterios de Aceptación (Definition of Done)

### Mapa Isométrico
- [ ] Admin puede crear/editar layout isométrico de planta
- [ ] Equipos, sensores y zonas se muestran como iconos isométricos  
- [ ] Click en equipo muestra panel de detalle con datos reales
- [ ] Datos de sensores se actualizan en tiempo real (< 10s)
- [ ] Incidencias activas se muestran como overlay de alerta
- [ ] Funciona en desktop y tablet (responsive mínimo 768px)

### Gamificación
- [ ] XP se otorga automáticamente al resolver incidencias y completar preventivos
- [ ] Niveles se calculan correctamente y muestran en UI
- [ ] Al subir de nivel, aparece modal celebratorio
- [ ] Badges se desbloquean automáticamente al cumplir condiciones
- [ ] Leaderboard muestra ranking semanal/mensual/global
- [ ] Rachas se calculan y muestran correctamente
- [ ] Misiones semanales se generan cada lunes
- [ ] El sistema es opt-in (se puede desactivar por usuario)

---

## 🔗 Referencias

- [FossFLOW GitHub](https://github.com/stan-smith/FossFLOW) — Diagrama isométrico open-source (18.9k ★)
- [Isoflow](https://github.com/markmanx/isoflow) — Librería base para diagramas isométricos
- [Isoflow Docs](https://isoflow.io/docs) — Documentación oficial
- [@rammcodes_ Instagram Reel](https://www.instagram.com/reel/DU7qHMhCOWh/) — Inspiración original
- [Paper.js](http://paperjs.org/) — Motor de rendering vectorial usado por Isoflow
- [GSAP](https://gsap.com/) — Librería de animaciones usada por Isoflow

---

*Documento generado como parte de la planificación v2.67.0. Sujeto a revisión y ajustes durante la implementación.*
