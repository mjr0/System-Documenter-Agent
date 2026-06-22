' System Documenter Agent — Inicializador silencioso para o Windows Startup
' Este script inicia o servidor sem abrir janela de terminal visível.
' Criado para uso com o Agendador de Tarefas do Windows.

Dim WShell
Set WShell = CreateObject("WScript.Shell")

Dim projectPath
projectPath = "c:\DEV\System Documenter - Agent"

' Inicia o servidor Node.js em background, sem janela
WShell.Run "cmd /c cd /d """ & projectPath & """ && node dist/server.js >> """ & projectPath & "\server.log"" 2>&1", 0, False

Set WShell = Nothing
