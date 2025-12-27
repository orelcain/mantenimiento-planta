# Día 4: Sistema de Asignación de Técnicos ✅

**Fecha:** 27 de diciembre de 2024  
**Commit:** `622851c`  
**Estado:** COMPLETADO ✅

---

## 📋 Resumen

Se implementó un sistema completo de asignación de incidencias a técnicos específicos, con permisos basados en roles y una interfaz intuitiva para supervisores y técnicos.

---

## ✨ Funciones Nuevas

### 1. `getAllUsers()` en `auth.ts`
```typescript
export async function getAllUsers(): Promise<User[]> {
  const snapshot = await getDocs(collection(db, 'users'))
  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as User
    })
    .filter((user) => user.activo) // Solo usuarios activos
}
```

**Características:**
- Obtiene todos los usuarios de Firestore
- Filtra automáticamente usuarios inactivos
- Convierte timestamps de Firestore a Date

---

### 2. `getTechnicians()` en `auth.ts`
```typescript
export async function getTechnicians(): Promise<User[]> {
  const users = await getAllUsers()
  return users.filter(
    (user) => user.rol === 'tecnico' || user.rol === 'supervisor' || user.rol === 'admin'
  )
}
```

**Características:**
- Filtra usuarios por roles con capacidad técnica
- Incluye: técnicos, supervisores y administradores
- Retorna solo usuarios activos

---

### 3. `assignIncident()` en `incidents.ts`
```typescript
export async function assignIncident(
  id: string,
  technicianId: string,
  assignedBy: string
): Promise<void> {
  const docRef = doc(db, COLLECTION, id)
  await updateDoc(docRef, {
    asignadoA: technicianId,
    assignedBy,
    assignedAt: serverTimestamp(),
    status: 'en_proceso',
    updatedAt: serverTimestamp(),
  })
}
```

**Características:**
- Asigna técnico a incidencia
- Cambia estado automáticamente a `en_proceso`
- Registra quién asignó (`assignedBy`)
- Registra timestamp de asignación (`assignedAt`)
- Actualiza `updatedAt` para auditoría

---

## 🎨 Mejoras en UI

### IncidentDetail Component

#### 1. **Estado y Efectos**
```typescript
const [technicians, setTechnicians] = useState<UserType[]>([])
const [selectedTechnician, setSelectedTechnician] = useState<string>('')
const [assignedUser, setAssignedUser] = useState<UserType | null>(null)
const [showAssignForm, setShowAssignForm] = useState(false)

// Cargar técnicos disponibles
useEffect(() => {
  if (permissions.canAssignIncident) {
    getTechnicians()
      .then(setTechnicians)
      .catch((error) => logger.error('Error loading technicians', error))
  }
}, [permissions.canAssignIncident])

// Cargar info del técnico asignado
useEffect(() => {
  if (incident.asignadoA) {
    getUserById(incident.asignadoA)
      .then(setAssignedUser)
      .catch((error) => logger.error('Error loading assigned user', error))
  }
}, [incident.asignadoA])
```

#### 2. **Badge de Usuario Asignado**
```tsx
{assignedUser ? (
  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
    <div className="flex items-center gap-2 mb-1">
      <User className="h-4 w-4 text-primary" />
      <span className="font-medium text-primary">Asignado a:</span>
    </div>
    <p className="text-sm">
      {assignedUser.nombre} {assignedUser.apellido}
    </p>
    <Badge variant="outline" className="mt-1">
      {assignedUser.rol === 'admin' ? 'Admin' :
       assignedUser.rol === 'supervisor' ? 'Supervisor' : 'Técnico'}
    </Badge>
  </div>
) : incident.status === 'confirmada' && permissions.canAssignIncident && (
  <div className="p-3 bg-warning/10 rounded-lg border border-warning/20">
    <div className="flex items-center gap-2 text-warning">
      <AlertTriangle className="h-4 w-4" />
      <span className="text-sm font-medium">Sin asignar</span>
    </div>
  </div>
)}
```

**Características:**
- Muestra nombre completo del técnico asignado
- Badge con rol (Admin, Supervisor, Técnico)
- Alerta visual si está sin asignar y puede asignarse
- Estilos diferenciados por estado

#### 3. **Formulario de Asignación**
```tsx
{showAssignForm && (
  <div className="p-4 bg-muted rounded-lg space-y-4">
    <h4 className="font-medium">Asignar técnico</h4>
    <div className="space-y-2">
      <Label htmlFor="technician">Técnico responsable *</Label>
      <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
        <SelectTrigger>
          <SelectValue placeholder="Seleccionar técnico..." />
        </SelectTrigger>
        <SelectContent>
          {technicians.map((tech) => (
            <SelectItem key={tech.id} value={tech.id}>
              {tech.nombre} {tech.apellido} ({tech.rol === 'admin' ? 'Admin' :
               tech.rol === 'supervisor' ? 'Supervisor' : 'Técnico'})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setShowAssignForm(false)}>
        Cancelar
      </Button>
      <Button
        onClick={handleAssign}
        disabled={isLoading || !selectedTechnician}
      >
        {isLoading ? <Spinner size="sm" /> : 'Asignar Técnico'}
      </Button>
    </div>
  </div>
)}
```

**Características:**
- Dropdown con todos los técnicos disponibles
- Muestra nombre completo y rol
- Validación: botón deshabilitado sin selección
- Estados de carga con spinner
- Botones de cancelar y confirmar

#### 4. **Botón de Asignar en Footer**
```tsx
{incident.status === 'confirmada' && 
  !incident.asignadoA && 
  permissions.canAssignIncident && 
  !showAssignForm && (
  <Button
    variant="default"
    onClick={() => setShowAssignForm(true)}
  >
    <UserPlus className="h-4 w-4 mr-2" />
    Asignar Técnico
  </Button>
)}
```

**Condiciones:**
- Solo si estado es `confirmada`
- Solo si NO está asignada aún
- Solo si usuario tiene permiso `canAssignIncident`
- Solo si no hay otro formulario abierto

---

### IncidentsPage Component

#### 1. **Filtro "Mis Incidencias"**
```typescript
const [filterAssigned, setFilterAssigned] = useState<boolean>(false)

// En el filtro
const matchesAssigned = !filterAssigned || incident.asignadoA === user?.id
```

#### 2. **Botón Toggle**
```tsx
<Button
  variant={filterAssigned ? 'default' : 'outline'}
  onClick={() => setFilterAssigned(!filterAssigned)}
  className="w-full sm:w-auto"
>
  <User className="h-4 w-4 mr-2" />
  Mis Incidencias
  {filterAssigned && <Badge className="ml-2">{stats.misIncidencias}</Badge>}
</Button>
```

**Características:**
- Toggle on/off con cambio de estilo
- Badge con contador cuando está activo
- Icono de usuario para identificación rápida
- Responsive (full width en mobile)

#### 3. **Tarjeta de Estadísticas**
```tsx
<Card>
  <CardContent className="p-4">
    <div className="text-2xl font-bold text-blue-600">{stats.misIncidencias}</div>
    <div className="text-sm text-muted-foreground">Mis Incidencias</div>
  </CardContent>
</Card>
```

**Características:**
- Contador en tiempo real
- Color distintivo (azul) para diferenciación
- Integrado en grid de 5 columnas
- Actualización automática con cambios

---

## 🔐 Integración con Permisos

### Hook usePermissions()
```typescript
const permissions = usePermissions()

// Permisos utilizados:
canAssignIncident: isAdmin || isSupervisor  // Solo supervisores asignan
canWorkOnIncident: (assignedUserId?: string) => {
  if (isAdmin || isSupervisor) return true
  if (isTechnician && assignedUserId === userId) return true
  return false
}
```

### Firestore Rules (ya existentes)
```javascript
// Solo supervisores pueden asignar
&& (!('asignadoA' in request.resource.data) || isSupervisor())

// Técnico puede actualizar si está asignado
|| (isTechnician() && resource.data.asignadoA == request.auth.uid)
```

**Características:**
- Validación en frontend Y backend
- Técnicos solo ven botón "Cerrar" si está asignado a ellos
- Supervisores/admin pueden asignar a cualquiera
- Seguridad en múltiples capas

---

## 📊 Flujo de Trabajo

### Escenario 1: Supervisor asigna técnico
1. ✅ Supervisor abre incidencia `confirmada`
2. ✅ Ve botón "Asignar Técnico"
3. ✅ Hace clic y aparece formulario
4. ✅ Selecciona técnico del dropdown
5. ✅ Confirma asignación
6. ✅ Estado cambia a `en_proceso`
7. ✅ Badge muestra técnico asignado

### Escenario 2: Técnico ve sus incidencias
1. ✅ Técnico entra a página de incidencias
2. ✅ Ve tarjeta con contador "Mis Incidencias"
3. ✅ Hace clic en botón "Mis Incidencias"
4. ✅ Filtro se activa (botón azul con badge)
5. ✅ Solo ve incidencias donde `asignadoA === user.id`

### Escenario 3: Técnico cierra su incidencia
1. ✅ Técnico abre incidencia asignada a él
2. ✅ Ve badge "Asignado a: [Su nombre]"
3. ✅ Ve botón "Cerrar Incidencia" (permiso: `canWorkOnIncident`)
4. ✅ Completa formulario de resolución
5. ✅ Incidencia pasa a estado `cerrada`

---

## 🔍 Detalles Técnicos

### Campos de Incident Type
```typescript
interface Incident {
  // ... campos existentes
  asignadoA?: string          // ID del técnico asignado
  assignedBy?: string         // ID del supervisor que asignó
  assignedAt?: Timestamp      // Momento de asignación
}
```

### Estados de Incidencia
```
pendiente → confirmada → en_proceso → cerrada
                      ↓
                  rechazada
```

**Transición automática:** `confirmada` → `en_proceso` al asignar técnico

---

## ✅ Testing Manual

### Casos probados:
- ✅ Asignación exitosa cambia estado a `en_proceso`
- ✅ Badge muestra correctamente nombre y rol
- ✅ Filtro "Mis Incidencias" funciona
- ✅ Contador en tarjeta se actualiza en tiempo real
- ✅ Solo supervisores ven botón "Asignar"
- ✅ Técnicos solo cierran incidencias asignadas a ellos
- ✅ Dropdown carga todos los técnicos activos
- ✅ Formularios se cancelan correctamente
- ✅ Spinners muestran estados de carga
- ✅ Sin asignación muestra alerta visual

---

## 📝 Commits

**Commit principal:** `622851c`
```
feat: Sistema de asignación de técnicos (Día 4)

✨ Nuevas funciones
- getAllUsers() y getTechnicians() en auth.ts
- assignIncident() en incidents.ts

🎨 UI mejorada en IncidentDetail
- Selector de técnicos con filtro por rol
- Botón 'Asignar Técnico' (solo supervisores)
- Badge de usuario asignado con rol
- Alerta visual si está sin asignar

📊 Filtro 'Mis Incidencias' en IncidentsPage
- Botón toggle para ver solo mis asignadas
- Contador en tarjeta de estadísticas
- Badge en botón activo

✅ Permisos integrados
- canAssignIncident: solo supervisores/admin
- canWorkOnIncident: técnico solo si está asignado
- Firestore rules ya validaban asignadoA

📝 Cambios de estado automáticos
- Al asignar → status cambia a 'en_proceso'
- Campos: assignedBy, assignedAt, updatedAt
```

**Archivos modificados:**
- `apps/pwa/src/services/auth.ts` (+26 líneas)
- `apps/pwa/src/services/incidents.ts` (+14 líneas)
- `apps/pwa/src/components/incidents/IncidentDetail.tsx` (+120 líneas)
- `apps/pwa/src/pages/IncidentsPage.tsx` (+40 líneas)

---

## 🎯 Próximos Pasos

### Día 5: Sistema de Notificaciones Push
- [ ] Configurar Firebase Cloud Messaging (FCM)
- [ ] Solicitar permisos de notificaciones
- [ ] Crear Cloud Functions para auto-envío
- [ ] Tipos de notificaciones:
  - Nueva incidencia reportada
  - Técnico asignado
  - Incidencia validada
  - Incidencia cerrada
- [ ] UI de configuración de notificaciones

---

## 📌 Notas

1. **Escalabilidad:** El sistema soporta múltiples técnicos sin límite
2. **Performance:** Carga de técnicos se hace solo una vez por apertura de modal
3. **UX:** Feedback visual claro en cada paso del proceso
4. **Seguridad:** Validación en frontend, backend (rules) y base de datos
5. **Auditoría:** Se registra quién asignó y cuándo (`assignedBy`, `assignedAt`)

---

**Estado Final Día 4:** ✅ COMPLETADO (80% → 100%)  
**Progreso Option B:** 4/5 días completados (80%)
