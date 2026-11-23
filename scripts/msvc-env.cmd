@echo off
rem Run a command inside an MSVC x64 environment with cargo on PATH. (No setlocal: with it the
rem tauri CLI loses INCLUDE/LIB in build scripts; each npm script is its own cmd process anyway.)
rem On this machine the newest Windows SDK (10.0.26100) is a broken install, so we pin the
rem complete 10.0.19041.0 SDK. If that Build Tools path is missing we locate Visual Studio
rem with vswhere; if none is found the command just runs directly (normal dev machine).
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
if exist "%VCVARS%" goto :havepinned
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto :run
set "VSPATH="
for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if not defined VSPATH goto :run
set "VCVARS=%VSPATH%\VC\Auxiliary\Build\vcvarsall.bat"
if not exist "%VCVARS%" goto :run
goto :havevcvars
:havepinned
call "%VCVARS%" x64 10.0.19041.0 >nul
if errorlevel 1 exit /b %errorlevel%
goto :run
:havevcvars
call "%VCVARS%" x64 >nul
if errorlevel 1 exit /b %errorlevel%
:run
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
%*
exit /b %errorlevel%
