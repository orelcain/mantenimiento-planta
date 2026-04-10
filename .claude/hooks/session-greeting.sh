#!/bin/bash
# UserPromptSubmit hook — proyecto mantenimiento-planta
# Nota: la rutina de inicio de sesión (router de proyectos) está en el hook
# global SessionStart (~/.claude/hooks/session-start-rutina.json).
# Este hook agrega contexto específico del proyecto cuando ya se está dentro de él.

set -euo pipefail

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

# Si el usuario menciona trabajar en este proyecto, inyectar contexto de ruta
if echo "$PROMPT" | grep -qiE "(mantenimiento|planta|grader|repuesto|equipo|firestore|deploy|pwa)"; then
  python3 -c "
import json
ctx = {
    'additionalContext': (
        'Contexto del proyecto activo: mantenimiento-planta (PWA React/TypeScript).\n'
        'Ruta local: D:/a/APP leventamiento de insidencias en planta/\n'
        'Subcarpeta front: apps/pwa/src/\n'
        'Para editar código usar siempre la ruta D:/a/, nunca OneDrive.'
    )
}
print(json.dumps(ctx))
"
fi
