@echo off
REM ── Manhwa Video Generator — lanzador con UTF-8 forzado ──────────────────────
cd /d "D:\a\APP leventamiento de insidencias en planta\manhwa-video-gen"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
python main.py %*
