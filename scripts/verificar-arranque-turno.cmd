@echo off
REM Envoltorio para el Programador de tareas de Windows.
REM
REM Registrar (una sola vez, hora de planta):
REM   schtasks /create /tn "Verificar arranque turno" /tr "<ruta a este .cmd>" /sc daily /st 09:12 /f
REM
REM El script usa rutas derivadas de su propia ubicacion, asi que no importa el
REM cwd con que lo lance la tarea (suele ser C:\Windows\system32).
node "%~dp0verificar-arranque-turno.cjs" %*
exit /b %ERRORLEVEL%
