# 🤖 Configuración de IA con Groq (GRATIS)

## 🎯 Paso 1: Obtener API Key

### **Si GitHub NO funciona, prueba esto:**

#### **Opción A: Modo Incógnito** 🔒
1. Abre tu navegador en **modo incógnito/privado**
2. Ve a https://console.groq.com/keys
3. Click en **"Continue with GitHub"**
4. **IGNORA** los mensajes rojos en consola (son normales)
5. Autoriza cuando GitHub lo pida

#### **Opción B: Email** ⚡ (Más rápido - 2 minutos)
1. Ve a https://console.groq.com/keys
2. Click en **"Continue with Email"**
3. Ingresa tu email
4. Verifica desde tu correo
5. ¡Listo!

#### **Opción C: Deshabilitar extensiones**
- Deshabilita bloqueadores (uBlock, Privacy Badger)
- Habilita cookies de terceros temporalmente
- Intenta con GitHub de nuevo

---

### **Proceso normal (después de login):**
1. **Abrir** https://console.groq.com/keys
2. **Registrarse/Login** con Email, Google o GitHub
3. **Crear API Key**:
   - Click en "Create API Key"
   - Nombre: "Mantenimiento Planta"
   - Copiar la key (empieza con `gsk_...`)

**⚠️ Importante**: Guardar la key inmediatamente, solo se muestra una vez.

---

## 📝 Paso 2: Configurar .env

Crear archivo `apps/pwa/.env` con tu key:

```bash
# Groq AI (GRATIS - 14,400 requests/día)
VITE_GROQ_API_KEY=gsk_tu_key_aqui_reemplazar

# Firebase (ya configurado)
VITE_FIREBASE_API_KEY=tu_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=tu_firebase_domain
VITE_FIREBASE_PROJECT_ID=tu_firebase_project
VITE_FIREBASE_STORAGE_BUCKET=tu_firebase_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_firebase_sender
VITE_FIREBASE_APP_ID=tu_firebase_app_id
```

---

## ✅ Paso 3: Verificar Instalación

```powershell
# Ver contenido del .env (sin mostrar keys completas)
cd "d:\a\APP leventamiento de insidencias en planta\apps\pwa"
Get-Content .env | Select-String "GROQ"
```

Debe mostrar:
```
VITE_GROQ_API_KEY=gsk_...
```

---

## 🧪 Paso 4: Probar en Desarrollo

```powershell
# Iniciar servidor dev
cd "d:\a\APP leventamiento de insidencias en planta\apps\pwa"
npm run dev
```

**Prueba:**
1. Abrir http://localhost:5173
2. Crear nueva incidencia
3. Seleccionar un equipo (Bomba, Motor, etc.)
4. Ver badge "✨ Sugerencias IA"
5. Los síntomas cambiarán según el equipo

---

## 📊 Límites de Groq (Gratis)

| Concepto | Límite Gratis |
|----------|---------------|
| **Requests/día** | 14,400 |
| **Requests/minuto** | 30 |
| **Tokens/minuto** | 7,000 |
| **Modelos** | llama-3.3-70b, mixtral-8x7b, gemma-7b |
| **Costo** | $0 USD |

**Tu uso estimado**: 175 requests/día = **1.2%** del límite

---

## 🔧 Troubleshooting

### Error: "GROQ_API_KEY no configurada"
**Solución**: Verificar que `.env` existe en `apps/pwa/`

### Error: "Rate limit exceeded"
**Solución**: Implementar cache (ya incluido en `ai.ts`)

### Error: "Invalid API key"
**Solución**: 
1. Regenerar key en console.groq.com
2. Actualizar `.env`
3. Reiniciar servidor dev

---

## 🎯 Funciones Disponibles

### 1. `generateSymptoms(equipment)`
Genera síntomas contextuales por equipo.

**Ejemplo:**
```typescript
const symptoms = await generateSymptoms({
  nombre: "Bomba Centrífuga #3",
  marca: "Grundfos",
  modelo: "CR15-3"
})
// ["Cavitación", "Vibración excesiva", "Fuga en sello mecánico", ...]
```

### 2. `analyzeRecurrentIssues(incidents)`
Detecta patrones en incidencias repetitivas.

**Ejemplo:**
```typescript
const analysis = await analyzeRecurrentIssues(incidents)
// { patterns: [...], confidence: 0.85 }
```

### 3. `predictNextFailure(equipmentId, history)`
Predice próxima falla con días estimados.

**Ejemplo:**
```typescript
const prediction = await predictNextFailure("motor-01", historicalData)
// { probability: 0.72, estimatedDays: 14, recommendation: "..." }
```

### 4. `analyzeRootCause(incidents)`
Encuentra causa raíz con solución y ROI.

**Ejemplo:**
```typescript
const rootCause = await analyzeRootCause(recurringIncidents)
// { rootCause: "...", solution: "...", estimatedCost: 250, estimatedSavings: 1200 }
```

---

## 💡 Alternativa: Google Gemini (también gratis)

Si prefieres Gemini:

1. Obtener key: https://makersuite.google.com/app/apikey
2. Actualizar `.env`:
   ```bash
   VITE_AI_PROVIDER=gemini
   VITE_GEMINI_API_KEY=tu_gemini_key
   ```
3. Modificar `ai.ts` para usar Gemini API

**Límites Gemini:**
- 1,000,000 tokens/día (gratis)
- Modelo: gemini-1.5-flash

---

## 📚 Recursos

- [Groq Console](https://console.groq.com)
- [Groq Docs](https://console.groq.com/docs)
- [Modelos disponibles](https://console.groq.com/docs/models)
- [Pricing](https://groq.com/pricing) (FREE tier permanente)

---

## ✅ Checklist

- [ ] Cuenta Groq creada
- [ ] API Key obtenida
- [ ] Archivo `.env` creado
- [ ] Key agregada a `.env`
- [ ] Servidor dev reiniciado
- [ ] Síntomas IA funcionando
