FROM python:3.11-slim

# Устанавливаем LibreOffice (для конвертации .doc -> .docx)
# --no-install-recommends ускоряет установку, беря только необходимые пакеты
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    fonts-liberation \
    poppler-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/*

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
