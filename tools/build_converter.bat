@echo off
chcp 65001 >nul
title LaserCut Converter - Build

echo ============================================
echo   Building LaserCut Converter .exe
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found
    pause
    exit /b 1
)

:: Install PyInstaller if needed
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

:: Install dependencies
echo Installing dependencies...
pip install pywin32

:: Build exe
echo Building .exe...
pyinstaller --onefile --name lasercut_converter --icon=NUL tools\lasercut_converter.py

if errorlevel 1 (
    echo.
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Build complete!
echo   EXE: dist\lasercut_converter.exe
echo ============================================
echo.
pause
