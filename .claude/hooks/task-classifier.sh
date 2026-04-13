#!/bin/bash
# UserPromptSubmit hook — Clasificador de tareas para optimización de modelos Claude
# Lee el prompt entrante, lo clasifica y agrega una sugerencia de modelo
# como contexto adicional para que Claude elija el subagente correcto.
set -euo pipefail

INPUT=$(cat)

# Extraer el prompt del usuario desde el JSON de entrada
PROMPT=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('prompt', '').strip())
except:
    print('')
" 2>/dev/null || echo "")

# Si el prompt está vacío, salir sin hacer nada
if [ -z "$PROMPT" ]; then
    exit 0
fi

# Ruta al script del orquestador
ORCHESTRATOR="$CLAUDE_PROJECT_DIR/.claude/scripts/claude-orchestrator.js"

if [ ! -f "$ORCHESTRATOR" ]; then
    exit 0
fi

# Clasificar la tarea
CLASSIFICATION=$(node "$ORCHESTRATOR" classify "$PROMPT" 2>/dev/null || echo '{"model":"sonnet","reason":"default"}')

MODEL=$(echo "$CLASSIFICATION" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('model', 'sonnet'))
except:
    print('sonnet')
" 2>/dev/null || echo "sonnet")

REASON=$(echo "$CLASSIFICATION" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('reason', ''))
except:
    print('')
" 2>/dev/null || echo "")

# Construir el hint según el modelo sugerido
case "$MODEL" in
    haiku)
        HINT="🐦 ORQUESTADOR (haiku) — $REASON. Para esta tarea usa Agent(model='haiku'). Haiku es suficiente y ahorra ~95% de tokens vs Opus."
        ;;
    sonnet)
        HINT="🎵 ORQUESTADOR (sonnet) — $REASON. Para sub-tareas delegables usa Agent(model='sonnet'). Sonnet = 5x más barato que Opus para código."
        ;;
    opus)
        HINT="🎭 ORQUESTADOR (opus) — $REASON. Esta tarea justifica Opus para razonamiento profundo."
        ;;
    *)
        exit 0
        ;;
esac

# Emitir contexto adicional para Claude
python3 -c "
import json, sys
hint = sys.argv[1]
print(json.dumps({'additionalContext': hint}))
" "$HINT"
