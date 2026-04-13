#!/bin/bash
# Stop hook — Muestra el resumen de tokens al final de cada respuesta
# Solo muestra si hubo al menos 1 llamada directa al orquestador en la sesión.
# (No bloquea a Claude — siempre sale con 0)
set -euo pipefail

ORCHESTRATOR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/scripts/claude-orchestrator.js"

if [ -f "$ORCHESTRATOR" ]; then
    # Solo mostrar si hay llamadas registradas (no spamear en cada respuesta)
    SESSION_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/session-tokens.json"
    if [ -f "$SESSION_FILE" ]; then
        HAS_CALLS=$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    totals = d.get('totals', {})
    total_calls = sum(v.get('calls', 0) for v in totals.values())
    print('yes' if total_calls > 0 else 'no')
except:
    print('no')
" "$SESSION_FILE" 2>/dev/null || echo "no")

        if [ "$HAS_CALLS" = "yes" ]; then
            node "$ORCHESTRATOR" status 2>/dev/null || true
        fi
    fi
fi

exit 0
