# ESP32 - Alta manual desde cualquier PC (USB inicial + OTA desde PWA)

## Objetivo
Dejar cada ESP32 listo para este flujo:
1. **Primera carga local por USB** (obligatoria por única vez en cada placa nueva).
2. Configurar WiFi/equipo.
3. A partir de ahí, **actualizaciones remotas** leyendo manifiesto publicado junto a la PWA.

---

## 1) Qué necesitas en cualquier PC

- Cable USB de datos (no solo carga).
- Drivers USB del chip de la placa (CH340/CP210x si aplica).
- Git (opcional, para clonar repo).
- VS Code + PlatformIO (recomendado), o PlatformIO CLI.

### Instalación mínima (manual)
1. Instala VS Code.
2. Instala extensión **PlatformIO IDE**.
3. Abre carpeta del proyecto.
4. Verifica que existe `iot/esp32-sensor/platformio.ini`.

---

## 2) Primera carga USB (obligatoria por placa)

> Esta primera carga es obligatoria porque define firmware base + tabla de particiones OTA.

1. Conecta ESP32 por USB.
2. Identifica puerto COM en Windows.
3. Abre `iot/esp32-sensor/src/config.h` y completa:
   - WiFi inicial (`WIFI_SSID_*`, `WIFI_PASSWORD_*`).
   - Firebase (`FIREBASE_API_KEY`, `FIREBASE_DATABASE_URL`).
   - `FIRMWARE_VERSION` (ej. `2.14.1`).
   - `OTA_REMOTE_MANIFEST_URL` (URL pública del manifiesto OTA).
4. Compila:
   - `platformio run`
5. Sube por USB (forzado, aunque exista OTA):
   - `platformio run --target upload --upload-protocol esptool --upload-port COMX`
6. Si falla en "Connecting...", mantén botón `BOOT` durante el inicio del upload.

Resultado esperado:
- ESP32 arranca, conecta WiFi, publica estado en RTDB y queda listo para OTA remota pull.

---

## 3) Emparejar con equipo desde PWA

1. Abre PWA módulo sensores.
2. Busca el `deviceId` nuevo en `devices/*`.
3. Asigna `assignedEquipmentId` desde la UI.
4. Verifica que escribe en:
   - `devices/{deviceId}/telemetry`
   - `sensors/{equipmentId}`

---

## 4) Publicar actualizaciones OTA "desde la PWA"

La PWA (sitio estático) sirve también los archivos OTA.

## Estructura recomendada

- `apps/pwa/public/ota/manifest.json`
- `apps/pwa/public/ota/firmware-<version>.bin`

## Flujo manual por versión

1. Compila firmware en local.
2. Toma binario generado:
   - `iot/esp32-sensor/.pio/build/esp32dev/firmware.bin`
3. Copia binario a:
   - `apps/pwa/public/ota/firmware-<version>.bin`
4. Edita `apps/pwa/public/ota/manifest.json`:
   - `version`: nueva versión
   - `url`: URL pública absoluta del `.bin` en tu dominio PWA
5. Deploy de la PWA (el mismo deploy normal).

Cuando el ESP32 consulte el manifiesto:
- Si `manifest.version` > `FIRMWARE_VERSION` actual, descarga e instala.

---

## 5) Forzar check OTA manual

Sin esperar el intervalo automático:

- `POST http://IP_DEL_ESP32/api/ota/check`

Ejemplo PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri "http://192.168.1.50/api/ota/check"
```

---

## 6) Reglas operativas importantes

- **Sí**, cada ESP32 nuevo requiere primera carga USB.
- Después de esa primera carga, actualizas remoto.
- Si cambias tabla de particiones en el futuro, requerirá otra carga USB de migración.
- Mantén versionado semántico (`x.y.z`) para comparación OTA.

---

## 7) Checklist de alta por cada ESP32 nuevo

- [ ] Conectar USB y detectar COM.
- [ ] Configurar `config.h` base.
- [ ] Flashear por USB una vez.
- [ ] Verificar publicación en `devices/*`.
- [ ] Emparejar equipo en PWA.
- [ ] Probar `POST /api/ota/check`.
- [ ] Registrar placa en inventario (deviceId, ubicación, equipo asignado).

---

## 8) Troubleshooting rápido

- No aparece COM: cambiar cable/driver/puerto USB.
- OTA no aplica: verificar `manifest.json`, URL pública del `.bin` y conectividad internet del ESP.
- Sin datos en PWA: validar auth RTDB y `assignedEquipmentId`.
