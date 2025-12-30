# ✅ Solución Rápida: Groq con Email

## El problema con GitHub login:
Los errores en consola son por CORS/redirect. Usar **email** es más confiable.

## Pasos (2 minutos):

1. **Ir a**: https://console.groq.com/keys
2. **Click** en "Continue with email"
3. **Ingresar** tu email
4. **Revisar** inbox (puede estar en spam)
5. **Click** en link de verificación
6. **Crear API Key**

## Una vez que tengas la key:

```powershell
# Crear .env
cd "d:\a\APP leventamiento de insidencias en planta\apps\pwa"
@"
VITE_GROQ_API_KEY=gsk_tu_key_aqui
"@ | Out-File -FilePath ".env" -Encoding UTF8
```

---

## OPCIÓN 2: Usar API Key de prueba temporal

Para probar AHORA mismo, puedo crear un endpoint proxy que use una key de demostración.

## OPCIÓN 3: Postergar IA

Implementar todo lo demás (IoT, permisos) y agregar IA después.

---

¿Qué prefieres? Te recomiendo OPCIÓN 1 (email), toma 2 minutos.
