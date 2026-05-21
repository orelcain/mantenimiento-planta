#!/usr/bin/env bash
# sync-claude-ai-bot.sh — Genera _claude_ai_bot_upload/ para el Project "AnimeTracker Bot" en claude.ai
#
# Extrae las piezas relevantes al bot @anime_estreno_bot desde este monorepo grande:
#   - 6 funciones Cloud Functions del bot (de functions/index.js)
#   - Mini App (apps/pwa/public/anime.html)
#   - Rule de animelists (de firestore.rules)
#   - Sección del bot del CLAUDE.md
#
# Uso: bash sync-claude-ai-bot.sh
# Cuándo: después de editar functions/index.js (lógica bot) o apps/pwa/public/anime.html.

set -e
cd "$(dirname "$0")"

OUT="_claude_ai_bot_upload"
mkdir -p "$OUT"

echo "🔄 Sincronizando $OUT/ ..."

# 1. CONTEXT.md (el documento maestro ya está acá, mantener actualizado)
if [ -f "$OUT/CONTEXT.md" ]; then
  echo "  ✅ CONTEXT.md (ya existe — editar manualmente si arquitectura cambió)"
else
  echo "  ⚠️  CONTEXT.md NO existe en $OUT/ — generarlo manualmente la primera vez"
fi

# 2. Mini App actual
cp apps/pwa/public/anime.html "$OUT/"
echo "  ✅ anime.html"

# 3. Extraer secciones del bot de functions/index.js
#    Líneas ~2972-3290 (handlers Telegram bot + mintTelegramAuthToken)
#    Líneas ~4400-4540 (animeEstrenosDiarios, animeEstrenosManual, _runAnimeEstrenos)
{
  echo "// =============================================================="
  echo "// EXTRACTO: Funciones del bot @anime_estreno_bot"
  echo "// Origen: functions/index.js del repo mantenimiento-planta"
  echo "// Generado por sync-claude-ai-bot.sh — NO EDITAR DIRECTO"
  echo "// =============================================================="
  echo ""
  echo "// ─── BLOQUE 1: telegramWebhook + setTelegramWebhook + setupTelegramTopics + mintTelegramAuthToken ───"
  echo "// (handlers Telegram compartidos con bot de planta. mintTelegramAuthToken también usado por Mini App de planta)"
  echo ""
  sed -n '2965,3320p' functions/index.js
  echo ""
  echo ""
  echo "// ─── BLOQUE 2: animeEstrenosDiarios + animeEstrenosManual + _runAnimeEstrenos (helper) ───"
  echo "// (las únicas funciones puramente de anime)"
  echo ""
  sed -n '4400,4540p' functions/index.js
} > "$OUT/bot-functions-extract.js"
echo "  ✅ bot-functions-extract.js (extracción de functions/index.js)"

# 4. Rule de animelists desde firestore.rules
{
  echo "// Rule actual para animelists/ en firestore.rules"
  echo "// (línea ~1340 del archivo)"
  echo ""
  grep -A 2 "AnimeTracker Mini App" firestore.rules || echo "(no encontrada — verificar firestore.rules)"
} > "$OUT/firestore-rules-animelists.txt"
echo "  ✅ firestore-rules-animelists.txt"

# 5. Sección del bot del CLAUDE.md
{
  echo "# Sección 'Bot @anime_estreno_bot' (extraída de CLAUDE.md de mantenimiento-planta)"
  echo ""
  # Extraer desde "Bot \`@anime_estreno_bot\`" hasta el próximo "##" o "---"
  awk '/^### 🤖 Bot `@anime_estreno_bot`/,/^---$/' CLAUDE.md
} > "$OUT/CLAUDE-mant-bot-section.md"
echo "  ✅ CLAUDE-mant-bot-section.md"

# 6. Instrucciones de upload
cat > "$OUT/_INSTRUCCIONES.md" <<'EOF'
# Cómo subir a claude.ai (Project: AnimeTracker Bot)

1. Abre claude.ai > Proyectos > "AnimeTracker Bot"
   (si no existe el Project, créalo siguiendo CONTEXT.md sección 15)
2. En "Archivos" del Project, elimina las versiones viejas (icono basurero)
3. Arrastra los archivos de esta carpeta al área "Archivos":
   - CONTEXT.md
   - anime.html
   - bot-functions-extract.js
   - firestore-rules-animelists.txt
   - CLAUDE-mant-bot-section.md
4. NO subas este `_INSTRUCCIONES.md` — es solo para ti.
5. Espera ~1-2 min a que termine "Indexando"

## Verificación rápida
En un chat dentro del Project, pregunta:
> "¿Qué hace _runAnimeEstrenos y desde qué línea? Cita el archivo."

Si responde "bot-functions-extract.js (corresponde a línea ~4416 de functions/index.js de mantenimiento-planta)" → todo cableado.
EOF
echo "  ✅ _INSTRUCCIONES.md"

echo ""
echo "📊 Resumen:"
ls -la "$OUT/" | tail -n +2 | head -20
echo ""
echo "📤 Próximo paso: subir a claude.ai (ver $OUT/_INSTRUCCIONES.md)"
