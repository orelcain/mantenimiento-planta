@echo off
REM Envoltorio para el Programador de tareas de Windows.
REM
REM Registrar (una sola vez):
REM   schtasks /create /tn "Vigia almacenamiento" /tr "<ruta a este .cmd>" /sc monthly /d 1 /st 09:30 /f
REM
REM OJO: este archivo DEBE guardarse con finales de linea CRLF (ver
REM .gitattributes). Con LF, cmd.exe lo lee mal y no ejecuta nada.
REM
REM El script usa rutas derivadas de su propia ubicacion, asi que no importa el
REM cwd con que lo lance la tarea (suele ser C:\Windows\system32).
node "%~dp0vigia-almacenamiento.cjs" %*
exit /b %ERRORLEVEL%
