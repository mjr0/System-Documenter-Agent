@echo off
title System Documenter Agent — Servidor :3001
echo ============================================================
echo   SYSTEM DOCUMENTER AGENT — SERVIDOR (PORTA 3001)
echo ============================================================
echo.
echo  Dashboard: http://localhost:3001/dashboard
echo  Para encerrar, pressione Ctrl+C ou feche esta janela.
echo.

cd /d "%~dp0"

:: Usa o dist já compilado para iniciar mais rápido
:: Se o dist não existir, compila antes
if not exist "dist\server.js" (
    echo [INFO] Compilando TypeScript antes de iniciar...
    call npm run build
    echo.
)

node dist/server.js
pause
