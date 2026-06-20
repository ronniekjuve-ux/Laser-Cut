import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function MergeModal({ onClose, onMerged }) {
  const [step, setStep] = useState(1);
  const [allApps, setAllApps] = useState([]);
  const [selected, setSelected] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([
      client.get('/api/v1/applications/', { params: { tab: 'applications', limit: 200 } }),
      client.get('/api/v1/applications/', { params: { tab: 'orders', limit: 200 } }),
    ]).then(([res1, res2]) => {
      const apps1 = (res1.data.items || []).map(a => ({ ...a, _tab: 'applications' }));
      const apps2 = (res2.data.items || []).map(a => ({ ...a, _tab: 'orders' }));
      setAllApps([...apps1, ...apps2]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleApp = (appId) => {
    setSelected(prev => prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId]);
  };

  const handleMerge = async () => {
    if (!file || selected.length < 2) return;
    setMerging(true);
    try {
      const refs = [];
      for (const appId of selected) {
        const app = allApps.find(a => a.id === appId);
        if (!app) continue;
        refs.push({ app_id: appId, layout_id: null, order_name: app.order_name });
      }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('layout_ids', JSON.stringify(refs));

      const res = await client.post('/api/v1/applications/merge', fd);
      setResult(res.data);
      if (res.data.warnings && res.data.warnings.length > 0) {
        setStep(3);
      } else {
        if (onMerged) onMerged();
        onClose();
      }
    } catch (err) {
      alert('Ошибка слияния: ' + (err.response?.data?.detail || err.message));
    } finally {
      setMerging(false);
    }
  };

  const handleConfirmWithWarnings = async () => {
    setMerging(true);
    try {
      const refs = [];
      for (const appId of selected) {
        refs.push({ app_id: appId, layout_id: null });
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('layout_ids', JSON.stringify(refs));

      const res = await client.post('/api/v1/applications/merge', fd);
      setResult(res.data);
      if (onMerged) onMerged();
      onClose();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setMerging(false);
    }
  };

  const selectedApps = allApps.filter(a => selected.includes(a.id));

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '80vh' }}>
        <div className="modal-header">
          <h3>Слияние раскладок</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Загрузка...</div>
          ) : step === 1 ? (
            <>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>
                Выберите 2 или более заявки/заказа для слияния:
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}></th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Заказ</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Заказчик</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Материал</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Вкладка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allApps.map(app => (
                      <tr
                        key={app.id}
                        onClick={() => toggleApp(app.id)}
                        style={{
                          cursor: 'pointer',
                          background: selected.includes(app.id) ? '#eff6ff' : '#fff',
                        }}
                      >
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                          <input
                            type="checkbox"
                            checked={selected.includes(app.id)}
                            onChange={() => toggleApp(app.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{app.order_name}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{app.customer}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{app.steel_grade || app.material} {app.thickness}мм</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{app._tab === 'applications' ? 'Заявки' : 'Заказы'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.length >= 2 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Выбрано: {selected.length} заявок</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    {selectedApps.map(a => a.order_name).join(' + ')}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Загрузите объединённую раскладку (.doc):</label>
                    <input
                      type="file"
                      accept=".doc,.docx"
                      onChange={e => setFile(e.target.files[0])}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : step === 3 && result ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>
                Обнаружены расхождения:
              </div>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>⚠ {w}</div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Вы всё равно хотите выполнить слияние?
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          {step === 1 && selected.length >= 2 && file && (
            <button className="btn btn-primary" onClick={handleMerge} disabled={merging}>
              {merging ? 'Слияние...' : 'Проверить и объединить'}
            </button>
          )}
          {step === 3 && (
            <>
              <button className="btn btn-primary" onClick={handleConfirmWithWarnings} disabled={merging}>
                {merging ? 'Слияние...' : 'Объединить всё равно'}
              </button>
              <button className="btn" onClick={() => { setStep(1); setResult(null); }}>Назад</button>
            </>
          )}
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
