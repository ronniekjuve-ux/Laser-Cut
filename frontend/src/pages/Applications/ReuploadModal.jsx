import { useState, useRef } from 'react';
import client from '../../api/client';

function FileDropZone({ label, accept, multiple, files, onFiles, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (multiple) {
      onFiles([...files, ...dropped]);
    } else {
      onFiles(dropped.length > 0 ? [dropped[0]] : []);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); if (!disabled) setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleClick = () => { if (!disabled && inputRef.current) inputRef.current.click(); };

  const handleInputChange = (e) => {
    const selected = Array.from(e.target.files);
    if (multiple) {
      onFiles([...files, ...selected]);
    } else {
      onFiles(selected.length > 0 ? [selected[0]] : []);
    }
    e.target.value = '';
  };

  const removeFile = (idx) => {
    const newFiles = files.filter((_, i) => i !== idx);
    onFiles(newFiles);
  };

  const zoneClass = 'upload-zone' + (dragOver ? ' dragover' : '') + (files.length > 0 ? ' has-file' : '');

  return (
    <div
      className={zoneClass}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      style={{opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto'}}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        style={{display: 'none'}}
      />
      {files.length === 0 ? (
        <div>
          <p style={{fontSize: 24, marginBottom: 4}}>⬇</p>
          <p>{label}</p>
          <p style={{fontSize: 11, color: '#94a3b8'}}>Перетащите файлы сюда или нажмите</p>
        </div>
      ) : (
        <div>
          <p style={{fontSize: 13, fontWeight: 600, color: '#047857'}}>
            Выбрано: {files.length} файл(ов)
          </p>
          {files.map((f, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: 12}}>
              <span>{f.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                style={{cursor: 'pointer', color: '#ef4444', fontWeight: 'bold', padding: '0 4px'}}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReuploadModal({ app, onClose, onSaved }) {
  const [appFiles, setAppFiles] = useState([]);
  const [layoutFiles, setLayoutFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  // Image upload state
  const [imageFiles, setImageFiles] = useState([]);
  const [imageLayoutId, setImageLayoutId] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState('');
  const [imageError, setImageError] = useState('');

  const layouts = app.layouts || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (appFiles.length === 0 && layoutFiles.length === 0) {
      setError('Выберите хотя бы один файл');
      return;
    }

    setUploading(true);
    setError('');
    setProgress('Загрузка...');

    try {
      const fd = new FormData();
      if (appFiles.length > 0) {
        fd.append('application_file', appFiles[0]);
      }
      if (layoutFiles.length > 0) {
        for (const f of layoutFiles) {
          fd.append('layout_files', f);
        }
      }

      const res = await client.post('/api/v1/applications/' + app.id + '/reupload', fd);
      if (res.data?.parts_warning) {
        setProgress(res.data.parts_warning);
        await new Promise(r => setTimeout(r, 3000));
      }
      onSaved();
    } catch (err) {
      console.error('Reupload error:', err);
      setError('Ошибка при загрузке: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  const handleImageUpload = async () => {
    if (!imageFiles.length || !imageLayoutId) {
      setImageError('Выберите изображение и раскладку');
      return;
    }
    setUploadingImage(true);
    setImageError('');
    setImageProgress('Загрузка изображения...');

    try {
      const fd = new FormData();
      fd.append('file', imageFiles[0]);

      const res = await client.post(
        '/api/v1/applications/' + app.id + '/layouts/' + imageLayoutId + '/image',
        fd
      );
      setImageProgress('Изображение загружено!');
      await new Promise(r => setTimeout(r, 1500));
      setImageFiles([]);
      setImageLayoutId('');
      setImageProgress('');
      onSaved();
    } catch (err) {
      console.error('Image upload error:', err);
      setImageError('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingImage(false);
      setImageProgress('');
    }
  };

  return (
    <div className="modal-overlay active" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; onClose(); } }}>
      <div className="modal-content" style={{width: 700}} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Перезагрузка — #{app.id} {app.order_name || ''}</h3>
          <button className="close-btn" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; onClose(); } }}>✕</button>
        </div>
        <div className="modal-body">
          {/* Section 1: Upload DOC files */}
          <div style={{marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)'}}>
            <p style={{fontSize: 13, fontWeight: 600, marginBottom: 8}}>📄 Загрузка DOC файлов</p>
            <p style={{fontSize: 12, color: '#64748b', marginBottom: 8}}>
              Обновление DOC файлов пересчитает данные раскладок и деталей.
            </p>
            <div className="file-zones">
              <FileDropZone
                label="Файл заявки (.doc)"
                accept=".doc,.cnf.doc,.fnf.doc"
                multiple={false}
                files={appFiles}
                onFiles={setAppFiles}
                disabled={uploading}
              />
              <FileDropZone
                label="Файлы раскладок (.cnf.doc, .fnf.doc)"
                accept=".doc,.cnf.doc,.fnf.doc"
                multiple={true}
                files={layoutFiles}
                onFiles={setLayoutFiles}
                disabled={uploading}
              />
            </div>
            {error && <div style={{color: '#ef4444', fontSize: 12, marginTop: 8}}>{error}</div>}
            {progress && <div style={{color: '#0369a1', fontSize: 12, marginTop: 8}}>{progress}</div>}
            {(appFiles.length > 0 || layoutFiles.length > 0) && (
              <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading} style={{marginTop: 8}}>
                {uploading ? 'Загрузка...' : 'Обновить DOC'}
              </button>
            )}
          </div>

          {/* Section 2: Upload layout image */}
          <div>
            <p style={{fontSize: 13, fontWeight: 600, marginBottom: 8}}>🖼 Загрузка изображения раскладки</p>
            <p style={{fontSize: 12, color: '#64748b', marginBottom: 8}}>
              Вручную загрузите изображение (GIF/PNG/JPG) для раскладки, если автоматическое извлечение не сработало.
            </p>

            {layouts.length > 0 ? (
              <>
                <div style={{marginBottom: 8}}>
                  <label style={{fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4}}>Раскладка:</label>
                  <select
                    value={imageLayoutId}
                    onChange={e => setImageLayoutId(e.target.value)}
                    style={{width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12}}
                  >
                    <option value="">Выберите раскладку...</option>
                    {layouts.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.layout_code || `#${l.id}`} — {l.sheet_w}×{l.sheet_h} мм
                        {l.layout_image ? ' ✓ изображение есть' : ' ✗ нет изображения'}
                      </option>
                    ))}
                  </select>
                </div>

                <FileDropZone
                  label="Изображение раскладки (.gif, .png, .jpg)"
                  accept=".gif,.png,.jpg,.jpeg"
                  multiple={false}
                  files={imageFiles}
                  onFiles={setImageFiles}
                  disabled={uploadingImage}
                />

                {imageError && <div style={{color: '#ef4444', fontSize: 12, marginTop: 8}}>{imageError}</div>}
                {imageProgress && <div style={{color: '#0369a1', fontSize: 12, marginTop: 8}}>{imageProgress}</div>}

                {imageFiles.length > 0 && imageLayoutId && (
                  <button className="btn btn-primary" onClick={handleImageUpload} disabled={uploadingImage} style={{marginTop: 8}}>
                    {uploadingImage ? 'Загрузка...' : 'Загрузить изображение'}
                  </button>
                )}
              </>
            ) : (
              <p style={{fontSize: 12, color: '#94a3b8'}}>Сначала загрузите DOC файлы раскладок</p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; onClose(); } }}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
