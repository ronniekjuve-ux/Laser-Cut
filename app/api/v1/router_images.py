# -*- coding: utf-8 -*-
import re
import tempfile
import subprocess
import shutil
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pathlib import Path

router = APIRouter(prefix="/images", tags=["Images"])

IMAGES_DIR = Path("/app/data/images")
UPLOAD_DIR = Path("/app/data/uploads")


@router.post("/debug/extract")
async def debug_extract_image(file: UploadFile = File(...)):
    """
    Debug эндпоинт для тестирования извлечения изображений из DOC файла.
    Сохраняет файл в data/uploads/ для автоконвертации через Word.
    """
    if not file.filename.lower().endswith('.doc'):
        raise HTTPException(status_code=400, detail="Только .doc файлы")

    # Сохраняем файл в data/uploads/ (aut_convert.py следит за этой папкой)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / file.filename
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Проверяем есть ли уже изображение для этого файла
    stem = Path(file.filename).stem.replace(" ", "_").replace(".", "_")
    existing_images = list(IMAGES_DIR.glob(f"{stem}_*.gif")) + \
                      list(IMAGES_DIR.glob(f"{stem}_*.png")) + \
                      list(IMAGES_DIR.glob(f"{stem}_*.jpg"))

    if existing_images:
        return {
            "status": "ready",
            "filename": file.filename,
            "images": [{"name": img.name, "size": img.stat().st_size} for img in existing_images]
        }

    return {
        "status": "processing",
        "filename": file.filename,
        "message": "Файл отправлен на конвертацию через Word. Изображение появится через несколько секунд."
    }


@router.get("/debug/check/{filename:path}")
async def check_images(filename: str):
    """Проверяет наличие изображений для файла."""
    stem = Path(filename).stem.replace(" ", "_").replace(".", "_")
    images = list(IMAGES_DIR.glob(f"{stem}_*.gif")) + \
             list(IMAGES_DIR.glob(f"{stem}_*.png")) + \
             list(IMAGES_DIR.glob(f"{stem}_*.jpg"))
    return {
        "filename": filename,
        "images": [{"name": img.name, "size": img.stat().st_size} for img in images]
    }


@router.get("/debug/test")
async def test_extract_page():
    """Страница для тестирования извлечения изображений"""
    html = """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Тест извлечения изображений из DOC</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { margin-bottom: 20px; color: #333; }
        .upload-zone { border: 2px dashed #ccc; border-radius: 8px; padding: 40px; text-align: center; background: white; margin-bottom: 20px; cursor: pointer; transition: all 0.2s; }
        .upload-zone:hover { border-color: #007bff; background: #f8f9fa; }
        .upload-zone.dragover { border-color: #007bff; background: #e3f2fd; }
        .upload-zone input { display: none; }
        .results { background: white; border-radius: 8px; padding: 20px; margin-top: 20px; }
        .results h2 { margin-bottom: 15px; color: #333; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-card .value { font-size: 24px; font-weight: bold; color: #007bff; }
        .stat-card .label { font-size: 12px; color: #666; margin-top: 5px; }
        .images-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
        .image-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .image-card img { width: 100%; min-height: 200px; object-fit: contain; background: #f5f5f5; }
        .image-card .info { padding: 10px; font-size: 12px; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .error { background: #ffebee; color: #c62828; padding: 15px; border-radius: 8px; margin-top: 20px; }
        .preview-link { display: inline-block; margin-top: 10px; padding: 5px 10px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; }
        .preview-link:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Тест извлечения изображений из DOC</h1>
        
        <div class="upload-zone" id="dropZone">
            <input type="file" id="fileInput" accept=".doc" />
            <p style="font-size: 48px; margin-bottom: 10px;">📄</p>
            <p>Перетащите DOC файл сюда или нажмите</p>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">Конвертация через LibreOffice (Docker)</p>
        </div>

        <div id="results" style="display: none;">
            <div class="results">
                <h2>Результаты (LibreOffice)</h2>
                <div id="resultsContent"></div>
            </div>
        </div>

        <div style="background: #fff3e0; border: 2px solid #ff9800; border-radius: 8px; padding: 20px; margin-top: 30px;">
            <h2 style="color: #e65100;">🎤 Локальный Word (рекомендуется)</h2>
            <p style="margin: 10px 0; font-size: 14px;">
                Для лучшего качества изображений используйте <strong>локальный Microsoft Word</strong>:
            </p>
            <ol style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
                <li>Откройте терминал в папке проекта</li>
                <li>Запустите: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">python local_server.py</code></li>
                <li>Перетащите DOC файл ниже (он будет конвертирован через Word)</li>
            </ol>
            <p id="localStatus" style="font-size: 13px; color: #666;">⏳ Ожидание запуска local_server.py...</p>
        </div>

        <div class="upload-zone" id="localDropZone" style="border-color: #ff9800; background: #fff8e1;">
            <input type="file" id="localFileInput" accept=".doc" />
            <p style="font-size: 48px; margin-bottom: 10px;">📝</p>
            <p>Перетащите DOC файл для конвертации через <strong>локальный Word</strong></p>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">Сначала запустите: python local_server.py</p>
        </div>

        <div id="localResults" style="display: none;">
            <div class="results" style="border: 2px solid #4caf50;">
                <h2 style="color: #2e7d32;">Результаты (локальный Word)</h2>
                <div id="localResultsContent"></div>
            </div>
        </div>

        <div id="loading" style="display: none;">
            <div class="loading">
                <p>⏳ Обработка файла...</p>
            </div>
        </div>

        <div id="error" style="display: none;"></div>
    </div>

    <script>
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const localDropZone = document.getElementById('localDropZone');
        const localFileInput = document.getElementById('localFileInput');
        const results = document.getElementById('results');
        const localResults = document.getElementById('localResults');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const localStatus = document.getElementById('localStatus');

        // Проверяем доступность локального сервера
        async function checkLocalServer() {
            try {
                const res = await fetch('http://localhost:8001/images/', { method: 'HEAD' });
                localStatus.innerHTML = '✅ Локальный сервер доступен! Можно конвертировать через Word.';
                localStatus.style.color = '#2e7d32';
                return true;
            } catch {
                localStatus.innerHTML = '⚠️ Локальный сервер не запущен. Запустите: <code>python local_server.py</code>';
                localStatus.style.color = '#e65100';
                return false;
            }
        }
        checkLocalServer();

        // === LibreOffice (Docker) ===
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) processFile(e.target.files[0]); });

        async function processFile(file) {
            if (!file.name.toLowerCase().endsWith('.doc')) { showError('Только .doc файлы'); return; }
            loading.style.display = 'block';
            results.style.display = 'none';
            error.style.display = 'none';
            document.getElementById('resultsContent').innerHTML = '<p>⏳ Загрузка файла...</p>';
            results.style.display = 'block';
            
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch('/api/v1/images/debug/extract', { method: 'POST', body: formData });
                if (!response.ok) { const err = await response.json(); throw new Error(err.detail); }
                const data = await response.json();
                
                if (data.status === 'ready') {
                    showImages(data.images, data.filename);
                } else {
                    // Ждем пока автоконвертер обработает
                    document.getElementById('resultsContent').innerHTML = `
                        <p style="font-size: 16px;">⏳ ${data.message}</p>
                        <p style="font-size: 13px; color: #666; margin-top: 10px;">Проверяю каждые 2 секунды...</p>
                    `;
                    await waitForImages(file.name);
                }
            } catch (err) { showError(err.message); } finally { loading.style.display = 'none'; }
        }

        async function waitForImages(filename, attempts = 0) {
            if (attempts > 15) {
                document.getElementById('resultsContent').innerHTML = '<p style="color: #c62828;">⏱ Таймаут. Проверьте что auto_convert.py запущен.</p>';
                return;
            }
            
            await new Promise(r => setTimeout(r, 2000));
            
            try {
                const checkResponse = await fetch('/api/v1/images/debug/check/' + encodeURIComponent(filename));
                const data = await checkResponse.json();
                
                if (data.images && data.images.length > 0) {
                    showImages(data.images, filename);
                } else {
                    document.getElementById('resultsContent').innerHTML = `
                        <p style="font-size: 16px;">⏳ Конвертация через Word... (${attempts + 1}/15)</p>
                        <p style="font-size: 13px; color: #666;">Проверяю каждые 2 секунды...</p>
                    `;
                    await waitForImages(filename, attempts + 1);
                }
            } catch {
                await waitForImages(filename, attempts + 1);
            }
        }

        function showImages(images, filename) {
            let html = `<h2>✅ Изображения (${filename})</h2>`;
            html += '<div class="images-grid">';
            images.forEach(img => {
                const imgUrl = '/api/v1/images/' + img.name;
                html += `<div class="image-card">
                    <img src="${imgUrl}" alt="${img.name}" />
                    <div class="info">
                        <div class="name">${img.name}</div>
                        <div class="size">${(img.size / 1024).toFixed(1)} KB</div>
                        <a href="${imgUrl}" target="_blank" class="preview-link">Открыть в новой вкладке</a>
                    </div>
                </div>`;
            });
            html += '</div>';
            document.getElementById('resultsContent').innerHTML = html;
        }

        // === Локальный Word ===
        localDropZone.addEventListener('click', () => localFileInput.click());
        localDropZone.addEventListener('dragover', (e) => { e.preventDefault(); localDropZone.classList.add('dragover'); });
        localDropZone.addEventListener('dragleave', () => localDropZone.classList.remove('dragover'));
        localDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            localDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) processLocalFile(e.dataTransfer.files[0]);
        });
        localFileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) processLocalFile(e.target.files[0]); });

        async function processLocalFile(file) {
            if (!file.name.toLowerCase().endsWith('.doc')) { showError('Только .doc файлы'); return; }
            loading.style.display = 'block';
            localResults.style.display = 'none';
            error.style.display = 'none';
            
            // Получаем путь к файлу (работает только в некоторых браузерах)
            // Вместо этого просто показываем инструкцию
            loading.style.display = 'none';
            document.getElementById('localResultsContent').innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <p style="font-size: 18px; margin-bottom: 15px;">📄 Файл: <strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)</p>
                    <p style="margin-bottom: 15px;">Для конвертации через локальный Word выполните:</p>
                    <code style="display: block; background: #f5f5f5; padding: 15px; border-radius: 8px; font-size: 14px;">
                        python local_convert.py "${file.name}"
                    </code>
                    <p style="margin-top: 15px; font-size: 13px; color: #666;">
                        Или перетащите файл на страницу после запуска <code>python local_server.py</code>
                    </p>
                </div>
            `;
            localResults.style.display = 'block';
        }

        function showError(message) {
            error.innerHTML = `<div class="error">❌ ${message}</div>`;
            error.style.display = 'block';
        }
    </script>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/debug/extract/{filename:path}")
async def debug_extract_from_uploads(filename: str):
    """
    Debug эндпоинт для тестирования извлечения из уже загруженного файла.
    """
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Файл не найден: {filename}")

    # Конвертируем DOC → HTML
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        try:
            subprocess.run(
                ['libreoffice', '--headless', '--convert-to', 'html', '--outdir', str(tmpdir), str(file_path)],
                check=True,
                capture_output=True,
                timeout=60
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка конвертации: {str(e)}")

        html_files = list(tmpdir.glob("*.html"))
        if not html_files:
            raise HTTPException(status_code=500, detail="HTML не создан")

        html_path = html_files[0]
        html_content = html_path.read_text(encoding='utf-8', errors='ignore')

        stem = html_path.stem
        files_dir = tmpdir / f"{stem}_files"

        IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf', '.tiff', '.tif'}
        images = []

        if files_dir.exists():
            for img_file in files_dir.iterdir():
                if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                    # Копируем в images для доступа через API
                    dest_dir = IMAGES_DIR / "debug"
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    dest_path = dest_dir / img_file.name
                    shutil.copy2(img_file, dest_path)
                    images.append({
                        "name": img_file.name,
                        "size": img_file.stat().st_size,
                        "url": f"/api/v1/images/debug/{img_file.name}"
                    })

        img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+)', html_content)

        return {
            "filename": filename,
            "html_size": html_path.stat().st_size,
            "images_found": len(images),
            "images": images,
            "img_tags_in_html": len(img_tags),
            "img_tag_srcs": img_tags[:20]
        }


# IMPORTANT: catch-all route MUST be last
@router.get("/{full_path:path}")
async def get_image(full_path: str):
    """Получить изображение по полному пути от images/"""
    file_path = IMAGES_DIR / full_path

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    content_type = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.emf': 'image/emf',
        '.svg': 'image/svg+xml',
    }.get(file_path.suffix.lower(), 'application/octet-stream')

    return FileResponse(file_path, media_type=content_type)
