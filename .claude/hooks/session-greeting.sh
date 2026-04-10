#!/bin/bash
# UserPromptSubmit hook: detecta saludos y presenta el menú de inicio de sesión
# Para proyecto: orelcain/mantenimiento-planta

set -euo pipefail

# Leer input JSON desde stdin
INPUT=$(cat)

# Extraer el prompt del usuario
PROMPT=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('prompt', '').strip())
except:
    print('')
" 2>/dev/null || echo "")

# Detectar si es un saludo simple de inicio de sesión
if echo "$PROMPT" | grep -qiE "^(hola|hi|hey|buenas|buenos (dias|tardes|noches)|good (morning|afternoon|evening)|saludos|inicio|start|comenzar)[!.,\s]*$"; then
  python3 -c "
import json
menu = {
    'additionalContext': (
        'El usuario acaba de saludar al inicio de una sesión nueva en el proyecto mantenimiento-planta. '
        'Responde SIEMPRE con este menú exacto (en español, conciso):\n\n'
        '**¿Por dónde empezamos?**\n'
        '1. 🔍 Auditar deploys\n'
        '2. 📋 Revisar pendientes\n'
        '3. 🔄 Sync rápido con GitHub\n'
        '4. 💬 Otra cosa\n\n'
        'Espera la elección del usuario antes de hacer cualquier otra acción.'
    )
}
print(json.dumps(menu))
"
fi
