FROM python:3.11-slim

WORKDIR /app

# Копируем HTML файлы
COPY *.html ./

# Открываем порт
EXPOSE 3000

# Запускаем HTTP сервер
CMD ["python", "-m", "http.server", "3000"]