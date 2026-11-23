@echo off
rem Run a command inside the MSVC x64 environment pinned to the complete 10.0.19041.0 SDK
rem (the newest SDK 10.0.26100 is a broken install on this machine) with cargo on PATH.
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 10.0.19041.0 >nul
if errorlevel 1 exit /b %errorlevel%
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
%*
