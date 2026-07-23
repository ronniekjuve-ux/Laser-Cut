# LaserCut Local Converter — Инструкция

## Что это?
Программа для конвертации раскладок (DOC файлов) в изображения (GIF) с сохранением кривых и дуг.

**Проблема:** LibreOffice на сервере не сохраняет кривые при конвертации DOC → HTML.  
**Решение:** Использовать Microsoft Word на вашем компьютере для конвертации.

---

## Быстрый старт (локально)

### Шаг 1: Скачайте файл
Скачайте `lasercut_converter.exe` из папки `tools/dist/`

### Шаг 2: Запустите
Дважды кликните на `lasercut_converter.exe`  
Появится окно терминала — **не закрывайте его!**

### Шаг 3: Загружайте раскладки
Откройте http://localhost:3000  
Загружайте DOC файлы раскладок как обычно  
Изображения автоматически будут с кривыми

---

## Установка на другой компьютер (→ laser-cut.pro)

### Шаг 1: Скачайте файл
Скачайте `lasercut_converter.exe`

### Шаг 2: Запустите с указанием сервера
```cmd
lasercut_converter.exe --server https://laser-cut.pro
```

Или через переменную окружения:
```cmd
set LASERCUT_SERVER_URL=https://laser-cut.pro
lasercut_converter.exe
```

### Шаг 3: Загружайте раскладки
Откройте https://laser-cut.pro  
Загружайте DOC файлы раскладок  
Конвертер автоматически:
1. Конвертирует DOC → HTML → GIF (через MS Word)
2. Сохраняет GIF локально в `data/images/`
3. **Отправляет GIF на сервер** laser-cut.pro

Изображения на сервере будут с кривыми и дугами.

---

## Что нужно для работы

| Компонент | Требование |
|-----------|------------|
| Windows | 7/10/11 |
| MS Word | 2003 или новее |
| Python | **Не нужен** (exe уже собран) |

---

## Как это работает

```
Локально (localhost:3000):
1. Вы загружаете DOC файл через браузер
2. Файл сохраняется в папку data/uploads/
3. Конвертер автоматически находит файл
4. Открывает его в Word и сохраняет как HTML
5. Извлекает GIF изображение
6. Сохраняет в папку data/images/
7. Веб-приложение показывает изображение

Удалённо (laser-cut.pro):
1. Конвертер запущен с --server https://laser-cut.pro
2. Вы загружаете DOC файл через браузер
3. Сервер пытается извлечь изображение (LibreOffice — теряет кривые)
4. Конвертер конвертирует DOC → HTML → GIF (MS Word — сохраняет кривые)
5. Конвертер отправляет GIF на сервер через API
6. Сервер использует загруженное GIF изображение
```

---

## Параметры командной строки

```
lasercut_converter.exe [опции]

Опции:
  --server URL, -s URL    URL удалённого сервера для загрузки изображений
                          (или переменная окружения LASERCUT_SERVER_URL)

Примеры:
  lasercut_converter.exe                           # Только локально
  lasercut_converter.exe --server https://laser-cut.pro  # Локально + удалённо
  lasercut_converter.exe -s http://localhost:8000        # Другой локальный сервер
```

---

## Если конвертер не запущен

Если `lasercut_converter.exe` не запущен:
- Изображения всё равно появятся (через LibreOffice)
- Но **кривые и дуги могут отсутствовать**
- Конвертер можно запустить позже и перезагрузить страницу

---

## Автозапуск (опционально)

Чтобы конвертер запускался автоматически при входе в Windows:

1. Нажмите `Win + R`, введите `shell:startup`
2. Создайте ярлык на `lasercut_converter.exe` с нужными параметрами

Пример ярлыка для laser-cut.pro:
```
C:\path\to\lasercut_converter.exe --server https://laser-cut.pro
```

---

## Устранение проблем

**"ERROR: pywin32 not installed"**
```bash
pip install pywin32
```

**"ERROR: Microsoft Word not found"**
Установите Microsoft Word

**Конвертер запущен, но изображения без кривых**
1. Закройте конвертер
2. Запустите заново
3. Загрузите раскладку повторно

**Порт 8001 занят**
Закройте другие программы, использующий порт 8001

**Изображение не загружается на сервер**
- Проверьте URL сервера: `--server https://laser-cut.pro`
- Проверьте подключение к интернету
- Проверьте логи конвертера (converter.log)

---

## Для разработчиков

Исходный код: `tools/lasercut_converter.py`  
Сборка .exe: `tools/build_converter.bat`

### API конвертера (локальный)

```
POST http://localhost:8001/convert
Body: {"path": "/path/to/file.doc"}
Response: {"images": [{"name": "file.gif", "size": 12345, "url": "/api/v1/images/file.gif"}]}

GET http://localhost:8001/health
Response: {"status": "ok", "word": true}
```

### API сервера (загрузка изображений)

```
POST https://laser-cut.pro/api/v1/images/upload
Content-Type: multipart/form-data
Body: file=<GIF изображение>
Response: {"ok": true, "name": "filename.gif", "url": "/api/v1/images/filename.gif"}
```
