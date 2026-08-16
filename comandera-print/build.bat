@echo off
REM ── Compilar KIKU Print ──────────────────────────────────────────────
REM Requiere Go instalado (https://go.dev/dl) y conexion a internet la
REM primera vez (baja 2 librerias: websocket y qrcode).
cd /d %~dp0
echo Descargando dependencias...
go mod tidy
if errorlevel 1 goto error
echo Compilando...
go build -ldflags "-s -w" -o KikuPrint.exe .
if errorlevel 1 goto error
echo.
echo   =========================================
echo   Listo! Se creo KikuPrint.exe
echo   =========================================
pause
exit /b 0
:error
echo.
echo   Hubo un error. Revisa el mensaje de arriba.
pause
exit /b 1
