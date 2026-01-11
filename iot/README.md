# 🤖 Módulo IoT - ESP32 + Firebase

Sistema de monitoreo en tiempo real con ESP32 para equipos industriales.

## 📋 Requisitos

### Hardware
- ESP32 DevKit (el que compraste en MercadoLibre)
- Sensor DHT22 (incluido en el kit)
- Cable USB para conectar al PC
- Cables jumper (incluidos en el kit)

### Software
- Arduino IDE 2.3.2 o superior
- Cuenta Firebase (ya la tienes configurada)

---

## 🚀 GUÍA DE INSTALACIÓN PASO A PASO

### PASO 1: Instalar Arduino IDE

1. **Descargar Arduino IDE:**
   - Ve a: https://www.arduino.cc/en/software
   - Descarga "Windows Win 10 and newer, 64 bits" (ZIP o Installer)
   - Si eliges ZIP: descomprime en `C:\Arduino`
   - Si eliges Installer: ejecuta y sigue el wizard

2. **Abrir Arduino IDE:**
   - Ejecuta `arduino-ide.exe`
   - Primera vez puede tardar 1-2 minutos en cargar

---

### PASO 2: Configurar Soporte para ESP32

1. **Abrir Preferencias:**
   - Ve a: `Archivo → Preferencias` (o `File → Preferences`)

2. **Agregar URL de placas ESP32:**
   - En "URLs Adicionales de Gestor de Tarjetas", copia y pega:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
   - Click en "OK"

3. **Instalar placa ESP32:**
   - Ve a: `Herramientas → Placa → Gestor de Tarjetas`
   - En el buscador escribe: `esp32`
   - Encuentra "esp32 by Espressif Systems"
   - Click en "INSTALAR" (versión 2.0.14 o superior)
   - Espera 2-3 minutos a que descargue e instale

4. **Seleccionar placa ESP32:**
   - Ve a: `Herramientas → Placa → esp32 → ESP32 Dev Module`

---

### PASO 3: Instalar Bibliotecas Necesarias

1. **Abrir Gestor de Bibliotecas:**
   - Ve a: `Herramientas → Administrar Bibliotecas` (o `Sketch → Include Library → Manage Libraries`)

2. **Instalar Firebase:**
   - Busca: `Firebase ESP Client`
   - Por: Mobizt
   - Click en "INSTALAR"
   - Si pregunta por dependencias, instala todo

3. **Instalar DHT:**
   - Busca: `DHT sensor library`
   - Por: Adafruit
   - Click en "INSTALAR"
   - Si pregunta instalar "Adafruit Unified Sensor", di SÍ

---

### PASO 4: Conectar Hardware

#### Conexión del Sensor DHT22:

```
DHT22         ESP32
━━━━━         ━━━━━
VCC (+)   →   3.3V  (pin derecho arriba)
DATA      →   GPIO 4 (D4)
GND (-)   →   GND   (pin al lado del 3.3V)
```

**Diagrama visual:**
```
    ┌─────────────┐
    │   DHT22     │
    │   ┌───┐     │
    │   │ ▓ │     │
    │   └───┘     │
    │  1 2 3 4    │
    └──┬─┬─┬──────┘
       │ │ └────────────┐
       │ └──────────┐   │
       └──────┐     │   │
              │     │   │
           VCC  DATA │  GND
            │    │   │
    ┌───────┼────┼───┼────────┐
    │ ESP32 │    │   │        │
    │      3.3V GPIO4 GND     │
    └────────────────────────┘
```

**Importante:**
- DHT22 tiene 4 pines, usa los 3 primeros (de izquierda a derecha)
- Si tiene un módulo con 3 pines, conecta VCC, DATA, GND

---

### PASO 5: Configurar Credenciales Firebase

1. **Obtener credenciales Firebase:**
   - Ve a: https://console.firebase.google.com
   - Selecciona tu proyecto "mantenimiento-planta"
   - Click en ⚙️ (Configuración) → Configuración del proyecto
   - Baja hasta "Tus apps" y busca "Web API Key"
   - Copia el "Web API Key"
   
2. **Obtener Database URL:**
   - En el menú izquierdo: `Compilación → Realtime Database`
   - Si no está activado, click en "Crear base de datos"
   - Selecciona ubicación (us-central1)
   - Modo: "Iniciar en modo de prueba" (por ahora)
   - Copia la URL que aparece (ej: https://tu-proyecto.firebaseio.com)

3. **Editar archivo `config.h`:**
   - Abre el archivo `iot/esp32-sensor/config.h`
   - Reemplaza con tus datos:
   ```cpp
   #define WIFI_SSID "TU_NOMBRE_WIFI"
   #define WIFI_PASSWORD "TU_PASSWORD_WIFI"
   #define FIREBASE_API_KEY "tu-web-api-key-de-firebase"
   #define FIREBASE_DATABASE_URL "https://tu-proyecto.firebaseio.com"
   #define EQUIPMENT_ID "ID_DEL_EQUIPO_A_MONITOREAR"
   ```

---

### PASO 6: Subir Código al ESP32

1. **Conectar ESP32 al PC:**
   - Conecta el cable USB al ESP32 y al PC
   - Windows instalará drivers automáticamente (espera 30 seg)

2. **Seleccionar Puerto COM:**
   - Ve a: `Herramientas → Puerto`
   - Selecciona el puerto que dice "COM3" o "COM4" (o similar)
   - Si no aparece ninguno: desconecta y reconecta el USB

3. **Configurar velocidad:**
   - Ve a: `Herramientas → Upload Speed → 115200`

4. **Abrir el código:**
   - En Arduino IDE: `Archivo → Abrir`
   - Navega a: `iot/esp32-sensor/esp32-sensor.ino`

5. **Compilar y Subir:**
   - Click en el botón "→" (Subir) arriba a la izquierda
   - Verás mensajes en la consola inferior
   - Espera mensaje: "Connecting......"
   - Si se queda en "Connecting...": presiona el botón "BOOT" en la ESP32
   - Espera mensaje: "Leaving... Hard resetting via RTS pin..."
   - ✅ Listo!

---

### PASO 7: Verificar Funcionamiento

1. **Abrir Monitor Serie:**
   - En Arduino IDE: `Herramientas → Monitor Serie`
   - Selecciona velocidad: `115200 baud`

2. **Ver mensajes:**
   ```
   Conectando a WiFi...
   WiFi conectado!
   IP: 192.168.1.100
   Conectando a Firebase...
   Firebase conectado!
   
   [10:30:00] Enviando datos...
   Temperatura: 22.5°C
   Humedad: 45.0%
   ✓ Datos enviados
   ```

3. **Verificar en Firebase:**
   - Ve a Firebase Console → Realtime Database
   - Deberías ver:
   ```
   sensors/
     └─ tu-equipo-id/
        ├─ temperatura: { value: 22.5, unit: "°C", ... }
        └─ humedad: { value: 45, unit: "%", ... }
   ```

---

## 🎯 SIGUIENTE PASO

Una vez que veas datos en Firebase, abre la PWA y ve al equipo que configuraste.
Verás una nueva pestaña "📡 IoT" con los datos en tiempo real!

---

## 🆘 Solución de Problemas

### No aparece puerto COM
- Desconecta y reconecta el USB
- Prueba otro cable USB (algunos solo cargan, no transmiten datos)
- Instala drivers CH340/CP2102: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers

### Error "Failed to connect to ESP32"
- Presiona y mantén el botón "BOOT" en la ESP32
- Mientras lo mantienes, click en "Subir"
- Suelta "BOOT" cuando veas "Connecting..."

### WiFi no conecta
- Verifica SSID y password en `config.h`
- ESP32 solo soporta WiFi 2.4GHz (no 5GHz)
- Verifica que tu router tenga 2.4GHz habilitado

### Firebase no conecta
- Verifica API Key y Database URL
- Ve a Firebase Console → Realtime Database → Reglas
- Cambia temporalmente a:
  ```json
  {
    "rules": {
      ".read": true,
      ".write": true
    }
  }
  ```

---

## 📞 Soporte

Si tienes problemas, revisa el Monitor Serie para ver mensajes de error detallados.
