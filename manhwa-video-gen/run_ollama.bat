@echo off
REM ── Ollama con modelos en D:\.ollama ─────────────────────────────────────────
REM Usar este script para iniciar Ollama con los modelos en D:\
REM Si Ollama ya corre, cerrarlo antes: taskkill /F /IM ollama.exe

set OLLAMA_MODELS=D:\.ollama\models
echo Iniciando Ollama (modelos en %OLLAMA_MODELS%)...
ollama serve
