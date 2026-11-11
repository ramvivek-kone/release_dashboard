@echo off
rem Opens the dashboard in Microsoft Edge (or Google Chrome if Edge is not found).
rem Add "full" to start full-screen:  Open-Dashboard.cmd full
set "APP=%~dp0index.html"
set "FLAG="
if /i "%~1"=="full" set "FLAG=--start-fullscreen"
where msedge >nul 2>nul && (start "" msedge %FLAG% "%APP%" & goto :eof)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" %FLAG% "%APP%" & goto :eof)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %FLAG% "%APP%" & goto :eof)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" %FLAG% "%APP%" & goto :eof)
rem fallback: default browser
start "" "%APP%"
