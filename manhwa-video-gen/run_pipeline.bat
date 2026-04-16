@echo off
REM ── Manhwa Video Generator — lanzador con UTF-8 y modelos Ollama ─────────────
cd /d "D:\a\APP leventamiento de insidencias en planta\manhwa-video-gen"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set OLLAMA_MODELS=D:\.ollama\models
python main.py %*
