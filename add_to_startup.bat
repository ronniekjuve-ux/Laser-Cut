@echo off
chcp 65001 >nul
echo ============================================
echo   Добавление в автозагрузку Windows
echo ============================================
echo.

set "SCRIPT_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo cd /d "%SCRIPT_DIR%" > "%STARTUP_DIR%\lasercut_converter.bat"
echo python auto_convert.py >> "%STARTUP_DIR%\lasercut_converter.bat"

echo Готово! Автоконвертер добавлен в автозагрузку.
echo.
echo Теперь при включении компьютера автоконвертер
echo будет запускаться автоматически.
echo.
echo Чтобы убрать из автозагрузки, удалите файл:
echo %STARTUP_DIR%\lasercut_converter.bat
echo.
pause
