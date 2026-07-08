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

      await client.post('/api/v1/applications/' + app.id + '/reupload', fd);
      onSaved();
    } catch (err) {
      console.error('Reupload error:', err);
      setError('Ошибка при загрузке: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Перезагрузка — #{app.id} {app.order_name || ''}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize: 13, color: '#64748b', marginBottom: 12}}>
            Загрузите новые файлы для обновления данных заказа. Все связанные раскладки и детали будут пересчитаны.
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

          {error && <div style={{color: '#ef4444', fontSize: 13, marginTop: 8}}>{error}</div>}
          {progress && <div style={{color: '#0369a1', fontSize: 13, marginTop: 8}}>{progress}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={uploading}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading}>
            {uploading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>
    </div>
  );
}
