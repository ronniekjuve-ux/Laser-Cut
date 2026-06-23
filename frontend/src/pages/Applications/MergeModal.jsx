import React, { useState, useEffect } from 'react';
import client from '../../api/client';

export default function MergeModal({ onClose, onMerged }) {
  const [step, setStep] = useState(1);
  const [allApps, setAllApps] = useState([]);
  const [layoutsByApp, setLayoutsByApp] = useState({});
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [selectedLayouts, setSelectedLayouts] = useState({});
  const [expandedApps, setExpandedApps] = useState(new Set());
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

  const toggleOrder = (appId) => {
    setSelectedOrders(prev => {
      const next = prev.includes(appId) ? prev.filter(id => id !== appId) : [...prev, appId];
      if (!prev.includes(appId) && layoutsByApp[appId]) {
        setSelectedLayouts(prev2 => {
          const next2 = { ...prev2 };
          next2[appId] = layoutsByApp[appId].map(l => l.id);
          return next2;
        });
      } else if (prev.includes(appId)) {
        setSelectedLayouts(prev2 => {
          const next2 = { ...prev2 };
          delete next2[appId];
          return next2;
        });
      }
      return next;
    });
  };

  const toggleLayout = (appId, layoutId) => {
    setSelectedLayouts(prev => {
      const current = prev[appId] || [];
      const next = current.includes(layoutId)
        ? current.filter(id => id !== layoutId)
        : [...current, layoutId];
      const result = { ...prev, [appId]: next };
      if (next.length === 0) {
        setSelectedOrders(prev2 => prev2.filter(id => id !== appId));
      } else if (!selectedOrders.includes(appId)) {
        setSelectedOrders(prev2 => [...prev2, appId]);
      }
      return result;
    });
  };

  const toggleExpand = async (appId) => {
    if (expandedApps.has(appId)) {
      setExpandedApps(prev => { const n = new Set(prev); n.delete(appId); return n; });
      return;
    }
    setExpandedApps(prev => new Set(prev).add(appId));
    if (!layoutsByApp[appId]) {
      try {
        const res = await client.get('/api/v1/applications/' + appId);
        const layouts = res.data.layouts || [];
        setLayoutsByApp(prev => ({ ...prev, [appId]: layouts }));
        if (selectedOrders.includes(appId)) {
          setSelectedLayouts(prev => ({ ...prev, [appId]: layouts.map(l => l.id) }));
        }
      } catch (err) {
        console.error('Failed to load layouts', err);
      }
    }
  };

  const selectAllLayouts = (appId) => {
    if (layoutsByApp[appId]) {
      setSelectedLayouts(prev => ({ ...prev, [appId]: layoutsByApp[appId].map(l => l.id) }));
      if (!selectedOrders.includes(appId)) {
        setSelectedOrders(prev => [...prev, appId]);
      }
    }
  };

  const getSelectedLayoutIds = () => {
    const ids = [];
    for (const appId of selectedOrders) {
      const layouts = selectedLayouts[appId] || [];
      ids.push(...layouts);
    }
    return ids;
  };

  const handleMerge = async () => {
    const layoutIds = getSelectedLayoutIds();
    if (!file || layoutIds.length < 2) return;
    setMerging(true);
    try {
      const refs = layoutIds.map(lid => ({ layout_id: lid }));
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
    const layoutIds = getSelectedLayoutIds();
    setMerging(true);
    try {
      const refs = layoutIds.map(lid => ({ layout_id: lid }));
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

  const selectedLayoutCount = getSelectedLayoutIds().length;

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
                Выберите заказы и раскладки для слияния:
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}></th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}></th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontWeight: 600, color: '#64748b' }}>№</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Заказ</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Заказчик</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Материал</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allApps.map(app => {
                      const isExpanded = expandedApps.has(app.id);
                      const isSelected = selectedOrders.includes(app.id);
                      const appLayouts = layoutsByApp[app.id] || [];
                      const selectedLayoutCountForApp = (selectedLayouts[app.id] || []).length;
                      return (
                        <React.Fragment key={app.id}>
                          <tr
                            style={{
                              cursor: 'pointer',
                              background: isSelected ? '#eff6ff' : '#fff',
                            }}
                          >
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOrder(app.id)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td
                              style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', width: 24, textAlign: 'center' }}
                              onClick={() => toggleExpand(app.id)}
                            >
                              {isExpanded ? '\u25BC' : '\u25B6'}
                            </td>
                            <td
                              style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: '#64748b' }}
                              onClick={() => toggleExpand(app.id)}
                            >
                              #{app.id}
                            </td>
                            <td
                              style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}
                              onClick={() => toggleExpand(app.id)}
                            >
                              {app.order_name}
                              {isSelected && appLayouts.length > 0 && (
                                <span style={{ color: '#64748b', marginLeft: 6 }}>({selectedLayoutCountForApp}/{appLayouts.length})</span>
                              )}
                            </td>
                            <td
                              style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}
                              onClick={() => toggleExpand(app.id)}
                            >{app.customer}</td>
                            <td
                              style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}
                              onClick={() => toggleExpand(app.id)}
                            >{app.steel_grade || app.material} {app.thickness}мм</td>
                          </tr>
                          {isExpanded && appLayouts.length > 0 && (
                            <tr>
                              <td colSpan={6} style={{ padding: '4px 0 4px 40px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                  <button
                                    onClick={() => selectAllLayouts(app.id)}
                                    style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 3, background: '#fff', cursor: 'pointer' }}
                                  >
                                    Все раскладки
                                  </button>
                                </div>
                                {appLayouts.map(l => {
                                  const lSelected = (selectedLayouts[app.id] || []).includes(l.id);
                                  return (
                                    <div
                                      key={l.id}
                                      onClick={() => toggleLayout(app.id, l.id)}
                                      style={{
                                        padding: '3px 8px', cursor: 'pointer', fontSize: 11,
                                        background: lSelected ? '#dbeafe' : 'transparent',
                                        borderRadius: 3, marginBottom: 2
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={lSelected}
                                        readOnly
                                        style={{ marginRight: 6 }}
                                      />
                                      {l.layout_code ? `${app.id}.${l.layout_code}` : `${app.id}.???`} | {l.sheet_w}x{l.sheet_h} | {l.sheet_count || 1} лист. | {l.parts_count || 0} дет.
                                    </div>
                                  );
                                })}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedLayoutCount >= 2 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Выбрано: {selectedLayoutCount} раскладок</div>
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
                  <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>{w}</div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Вы всё равно хотите выполнить слияние?
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          {step === 1 && selectedLayoutCount >= 2 && file && (
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
