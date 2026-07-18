@echo off
chcp 65001 >nul
title LaserCut Development

echo ============================================
echo   LaserCut - Запуск приложения
echo ============================================
echo.

:: Проверяем Docker
docker ps >nul 2>&1
if errorlevel 1 (
    echo [!] Запустите Docker Desktop и повторите
    pause
    exit /b 1
)

echo [*] Запуск Docker...
docker compose up -d >nul 2>&1

echo [*] Ожидание backend...
timeout /t 3 /nobreak >nul

echo [*] Запуск конвертера Word...
start "Word Converter" python auto_convert.py

echo [*] Запуск фронтента...
echo.
echo ============================================
echo   Приложение запущено!
echo ============================================
echo.
echo   Откройте: http://localhost:5173
echo.
echo   Конвертер Word работает в отдельном окне.
echo   Не закрывайте его!
echo ============================================
echo.

cd frontend && npm run dev
