@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js / npm wurde nicht gefunden.
  echo Installiere zuerst Node.js LTS und starte diese Datei danach erneut.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installiere benoetigte Abhaengigkeiten ...
  call npm install
  if errorlevel 1 (
    echo Installation fehlgeschlagen.
    pause
    exit /b 1
  )
)
call npm start
