@echo off
:: Script para registrar o System Documenter Agent no Agendador de Tarefas do Windows
:: Execute este arquivo como ADMINISTRADOR uma única vez.

echo ============================================================
echo  Registrando System Documenter Agent no Startup do Windows
echo ============================================================
echo.

set "SCRIPT_PATH=c:\DEV\System Documenter - Agent\iniciar_silencioso.vbs"
set "TASK_NAME=SystemDocumenterAgent"

:: Remove a tarefa antiga se existir
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Cria nova tarefa: executa ao fazer login, sem janela, com delay de 15s para aguardar rede
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "wscript.exe \"%SCRIPT_PATH%\"" ^
  /sc ONLOGON ^
  /delay 0000:15 ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Tarefa criada com sucesso!
    echo      O servidor sera iniciado automaticamente ao ligar o Windows.
    echo.
    echo      Nome da tarefa : %TASK_NAME%
    echo      Dashboard      : http://localhost:3001/dashboard
    echo.
) else (
    echo.
    echo [ERRO] Falha ao criar a tarefa. Execute este script como ADMINISTRADOR.
    echo.
)

pause
