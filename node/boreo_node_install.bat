@echo off
setlocal

set "VER=22.23.2"
set "BASE=C:\Wapp\Wapp_With_Baileys"
set "MSI=%BASE%\node\node-v%VER%-x64.msi"
set "LOG=%BASE%\node\boreo_node_install.log"
set "NPM=%ProgramFiles%\nodejs\npm.cmd"

del "%MSI%" >nul 2>&1

curl.exe -fL --retry 3 -o "%MSI%" "https://nodejs.org/dist/v%VER%/node-v%VER%-x64.msi"
if errorlevel 1 exit /b 101

if not exist "%MSI%" exit /b 102

for %%A in ("%MSI%") do (
    if %%~zA LSS 10000000 exit /b 103
)

start "" /wait "%SystemRoot%\System32\msiexec.exe" /i "%MSI%" /qn /norestart /l*v "%LOG%"
set "RC=%ERRORLEVEL%"

del "%MSI%" >nul 2>&1

if not "%RC%"=="0" if not "%RC%"=="3010" exit /b %RC%

if not exist "%NPM%" exit /b 104

cd /d "%BASE%"

set "npm_config_yes=true"

call "%NPM%" run start

set "RC=%ERRORLEVEL%"

exit /b %RC%