@echo off
setlocal
set "VER=22.23.2"
set "MSI=C:\Wapp\Wapp_With_Baileys\node\node-v%VER%-x64.msi"
set "LOG=C:\Wapp\Wapp_With_Baileys\node\boreo_node_install.log"

del "%MSI%" >nul 2>&1

curl.exe -fL --retry 3 -o "%MSI%" "https://nodejs.org/dist/v%VER%/node-v%VER%-x64.msi"
if errorlevel 1 exit /b 101
if not exist "%MSI%" exit /b 102
for %%A in ("%MSI%") do if %%~zA LSS 10000000 exit /b 103

start "" /wait "%SystemRoot%\System32\msiexec.exe" /i "%MSI%" /qn /norestart /l*v "%LOG%"
set RC=%ERRORLEVEL%

del "%MSI%" >nul 2>&1
exit /b %RC%