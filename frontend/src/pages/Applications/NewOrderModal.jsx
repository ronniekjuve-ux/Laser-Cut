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
          <p style={{fontSize: 24, marginBottom: 4}}>{'\u2b07'}</p>
          <p>{label}</p>
          <p style={{fontSize: 11, color: '#94a3b8'}}>{'\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u0430\u0439\u043b\u044b \u0441ю\u0434\u0430 \u043d\u0430\u043c\u043d\u0435 \u0438\u043b\u0438 \u043d\u0430\u0436\u043c\u0438\u0442\u0435'}</p>
        </div>
      ) : (
        <div>
          <p style={{fontSize: 13, fontWeight: 600, color: '#047857'}}>
            {'\u0412\u044b\u0431\u0440\u0430\u043d\u043e'}: {files.length} {'\u0444\u0430\u0439\u043b(\u043e\u0432)'}
          </p>
          {files.map((f, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', fontSize: 12}}>
              <span>{f.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                style={{cursor: 'pointer', color: '#ef4444', fontWeight: 'bold', padding: '0 4px'}}
              >
                {'\u2715'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewOrderModal({ onClose, onCreated }) {
  const [customerName, setCustomerName] = useState('');
  const [steelGrade, setSteelGrade] = useState('');
  const [comments, setComments] = useState('');
  const [supplyMaterial, setSupplyMaterial] = useState('');
  const [appFiles, setAppFiles] = useState([]);
  const [layoutFiles, setLayoutFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (appFiles.length === 0) {
      setError('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u0430\u0439\u043b \u0437\u0430\u044f\u0432\u043a\u0438');
      return;
    }

    setUploading(true);
    setError('');
    setProgress('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0437\u0430\u044f\u0432\u043a\u0438...');

    try {
      const fd = new FormData();
      fd.append('file', appFiles[0]);
      if (customerName) fd.append('customer_name', customerName);
      if (steelGrade) fd.append('steel_grade', steelGrade);
      if (comments) fd.append('comments', comments);
      if (supplyMaterial) fd.append('supply_material', supplyMaterial);

      const res = await client.post('/api/v1/applications/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const appId = res.data.application_id;

      if (layoutFiles.length > 0) {
        for (let i = 0; i < layoutFiles.length; i++) {
          setProgress('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043a\u0438 ' + (i + 1) + ' \u0438\u0437 ' + layoutFiles.length + '...');
          const lfd = new FormData();
          lfd.append('file', layoutFiles[i]);
          await client.post('/api/v1/applications/' + appId + '/layouts/upload', lfd, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }

      onCreated();
    } catch (err) {
      console.error('Upload error:', err);
      setError('\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0435: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" style={{width: 700}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{'\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430'}</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} className="order-form">
            <div className="form-row">
              <div className="form-group">
                <label>{'\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a'}</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u0447\u0438\u043a\u0430'}
                />
              </div>
              <div className="form-group">
                <label>{'\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b'}</label>
                <input
                  type="text"
                  value={steelGrade}
                  onChange={(e) => setSteelGrade(e.target.value)}
                  placeholder={'\u041d\u0430\u043f\u0440. St3, 09\u0413\u0421'}
                />
              </div>
              <div className="form-group">
                <label>{'\u0414\u0430\u0432. \u043c\u0430\u0442'}</label>
                <select
                  value={supplyMaterial}
                  onChange={(e) => setSupplyMaterial(e.target.value)}
                >
                  <option value="">{'\u2014'}</option>
                  <option value="true">{'\u0414\u0430'}</option>
                  <option value="false">{'\u041d\u0435\u0442'}</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>{'\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438'}</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={'\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438'}
              />
            </div>

            <div className="file-zones">
              <FileDropZone
                label={'\u0424\u0430\u0439\u043b \u0437\u0430\u044f\u0432\u043a\u0438 (.doc)'}
                accept=".doc,.cnf.doc,.fnf.doc"
                multiple={false}
                files={appFiles}
                onFiles={setAppFiles}
                disabled={uploading}
              />
              <FileDropZone
                label={'\u0424\u0430\u0439\u043b\u044b \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043e\u043a (.cnf.doc, .fnf.doc)'}
                accept=".doc,.cnf.doc,.fnf.doc"
                multiple={true}
                files={layoutFiles}
                onFiles={setLayoutFiles}
                disabled={uploading}
              />
            </div>

            {error && <div style={{color: '#ef4444', fontSize: 13}}>{error}</div>}
            {progress && <div style={{color: '#0369a1', fontSize: 13}}>{progress}</div>}

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8}}>
              <button type="button" className="btn" onClick={onClose} disabled={uploading}>
                {'\u041e\u0442\u043c\u0435\u043d\u0430'}
              </button>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...' : '\u0421\u043e\u0437\u0434\u0430\u0442\u044c'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}