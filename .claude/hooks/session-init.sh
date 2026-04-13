#!/bin/bash
# SessionStart hook — Inicializa el orquestador al comenzar una sesión nueva.
# Solo resetea el contador en sesiones nuevas (source=startup), no en resume.
set -euo pipefail

INPUT=$(cat)

SOURCE=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('source', ''))
except:
    print('')
" 2>/dev/null || echo "")

ORCHESTRATOR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/scripts/claude-orchestrator.js"

# Solo resetear en sesión nueva (no en resume, clear o compact)
if [ "$SOURCE" = "startup" ] && [ -f "$ORCHESTRATOR" ]; then
    node "$ORCHESTRATOR" reset 2>/dev/null || true
    echo "🎯 Orquestador de modelos inicializado. Tokens reseteados."
fi

exit 0
