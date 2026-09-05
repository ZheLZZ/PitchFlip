@echo off
cd /d "%~dp0"
if not exist "dist\PitchFlip\PitchFlip.exe" (
  echo Please run build.ps1 first.
  pause
  exit /b 1
)
start "" "dist\PitchFlip\PitchFlip.exe" %*
