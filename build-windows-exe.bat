@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js / npm wurde nicht gefunden.
  echo Installiere zuerst Node.js LTS und starte diese Datei danach erneut.
  pause
  exit /b 1
)
if not exist "node_modules\electron-builder\out\cli\cli.js" (
  echo Installiere Build-Abhaengigkeiten ...
  call npm install
  if errorlevel 1 (
    echo Installation fehlgeschlagen.
    pause
    exit /b 1
  )
)
call npm run build:windows
if errorlevel 1 (
  echo Build fehlgeschlagen.
  pause
  exit /b 1
)
echo.
echo Fertig: dist\Lunar-Setup-1.4.7.exe
pause
