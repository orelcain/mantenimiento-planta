@echo off
REM Envoltorio de referencia para el Programador de tareas de Windows.
REM
REM OJO: la tarea REAL no apunta aqui sino al lanzador que vive fuera del repo
REM (_HERRAMIENTAS\vigia-almacenamiento\vigia-almacenamiento.cmd), que cae a una
REM copia de respaldo cuando el working tree esta en una rama sin este script.
REM Sin ese respaldo la vigilancia se caeria EN SILENCIO, que se lee igual que
REM "todo bien" — mismo patron que la tarea "Verificar arranque turno".
REM
REM Registrar (una sola vez):
REM   schtasks /create /tn "Vigia almacenamiento" /tr "C:\Users\orelc\OneDrive\ANTARFOOD\_HERRAMIENTAS\vigia-almacenamiento\vigia-almacenamiento.cmd" /sc monthly /d 1 /st 09:30 /f
REM
REM Si editas el script del repo, refresca el respaldo:
REM   copy "D:\a\APP leventamiento de insidencias en planta\scripts\vigia-almacenamiento.cjs" "C:\Users\orelc\OneDrive\ANTARFOOD\_HERRAMIENTAS\vigia-almacenamiento\"
REM
REM Este archivo DEBE guardarse con finales de linea CRLF (ver .gitattributes).
node "%~dp0vigia-almacenamiento.cjs" %*
exit /b %ERRORLEVEL%
