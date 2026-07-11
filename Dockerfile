FROM python:3.11-slim

# Устанавливаем LibreOffice (для конвертации .doc -> .docx)
# Это займет время при сборке, но оно того стоит!
RUN apt-get update && apt-get install -y \
    libreoffice-writer \
    libreoffice-core \
    fonts-liberation \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем зависимости и устанавливаем их
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Создаем папку для загрузок
RUN mkdir -p /app/data/uploads

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]