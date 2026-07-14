import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';

export default function ApplicationDetail({ app, onClose, onUpdate }) {
  const { user } = useAuth();
  const [fullApp, setFullApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartInfo, setShowPartInfo] = useState(null);
  const [activeLayout, setActiveLayout] = useState(null);
  const [showDeficitForm, setShowDeficitForm] = useState(false);
  const [deficitNote, setDeficitNote] = useState('');
  const [deficitSize, setDeficitSize] = useState('');
  const [deficitQty, setDeficitQty] = useState('');
  const [deficitSending, setDeficitSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnmerge, setConfirmUnmerge] = useState(null);
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [reservedItems, setReservedItems] = useState({});
  const [selectedWhItem, setSelectedWhItem] = useState('');
  const [sheetsUsed, setSheetsUsed] = useState('');
  const [confirmCancelDeduct, setConfirmCancelDeduct] = useState(false);

  const highlightPart = app.highlightPart || null;

  const updateStatus = async (newStatus) => {
    try {
      await client.patch('/api/v1/applications/' + app.id + '/status?status=' + newStatus);
      // Re-fetch to get updated completed_runs from backend
      try {
        const res = await client.get('/api/v1/applications/' + app.id);
        setFullApp(res.data);
      } catch {
        setFullApp(prev => ({
          ...prev,
          application: { ...prev.application, status: newStatus }
        }));
      }
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка смены статуса');
    }
  };

  const toggleRun = async (layoutId, runIndex) => {
    try {
      const res = await client.patch('/api/v1/applications/layouts/' + layoutId + '/toggle-run?run_index=' + runIndex);
      setFullApp(prev => {
        if (!prev) return prev;
        const layouts = prev.layouts.map(l => {
          if (l.id === layoutId) {
            return { ...l, completed_runs: res.data.completed_runs };
          }
          return l;
        });
        const app = res.data.app_status
          ? { ...prev.application, status: res.data.app_status }
          : prev.application;
        return { ...prev, layouts, application: app };
      });
    } catch (err) {
      alert('Ошибка');
    }
  };

  const submitDeficit = async () => {
    setDeficitSending(true);
    try {
      const fd = new FormData();
      fd.append('material', data.material || data.steel_grade || '');
      fd.append('thickness', data.thickness ? String(data.thickness) : '');
      fd.append('size', deficitSize || '');
      fd.append('quantity', deficitQty || '');
      fd.append('note', deficitNote || '');
      await client.post('/api/v1/applications/' + app.id + '/deficit', fd);
      setShowDeficitForm(false);
      setDeficitNote('');
      alert('Заявка о нехватке металла отправлена');
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeficitSending(false);
    }
  };

  useEffect(() => {
    const fetchFull = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + app.id);
        setFullApp(res.data);
      } catch (err) {
        console.error('Failed to load application detail', err);
        setFullApp({ application: app, layouts: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchFull();
  }, [app.id]);

  // Автооткрытие раскладки с подсвечиваемой деталью
  useEffect(() => {
    if (!fullApp || !highlightPart || activeLayout !== null) return;
    const layouts = fullApp.layouts || [];
    for (let i = 0; i < layouts.length; i++) {
      const found = (layouts[i].parts || []).some(p => p.name === highlightPart);
      if (found) { setActiveLayout(i); break; }
    }
  }, [fullApp, highlightPart]);

  const handleDelete = async () => {
    setConfirmDelete(true);
  };

  const confirmDeleteAction = async () => {
    setConfirmDelete(false);
    try {
      await client.delete('/api/v1/applications/' + app.id);
      onUpdate();
      onClose();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleUnmerge = async (layoutId, action) => {
    setConfirmUnmerge({ layoutId, action });
  };

  const confirmUnmergeAction = async () => {
    const { layoutId, action } = confirmUnmerge;
    setConfirmUnmerge(null);
    try {
      await client.post('/api/v1/applications/layouts/' + layoutId + '/unmerge?action=' + action);
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const fetchWarehouseItems = async () => {
    try {
      const [itemsRes, reservedRes] = await Promise.all([
        client.get('/api/v1/warehouse/'),
        client.get('/api/v1/warehouse/reserved').catch(() => ({ data: {} })),
      ]);
      setWarehouseItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setReservedItems(reservedRes.data || {});
    } catch (err) {
      console.error('Failed to load warehouse', err);
    }
  };

  const bindWarehouse = async () => {
    if (!selectedWhItem) return alert('Выберите позицию на складе');
    const qty = parseInt(sheetsUsed);
    if (!qty || qty <= 0) return alert('Укажите количество листов');
    try {
      await client.patch('/api/v1/applications/' + app.id + '/warehouse', {
        warehouse_item_id: parseInt(selectedWhItem),
        sheets_used: qty,
      });
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      setSelectedWhItem('');
      setSheetsUsed('');
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const [layoutWhSelections, setLayoutWhSelections] = useState({});
  const [runSelections, setRunSelections] = useState({});
  const [showAllSheets, setShowAllSheets] = useState({});

  const bindLayoutWarehouse = async (layoutId) => {
    const whId = layoutWhSelections[layoutId];
    if (!whId) return alert('Выберите позицию на складе');
    try {
      await client.patch('/api/v1/applications/layouts/' + layoutId + '/warehouse', {
        warehouse_item_id: parseInt(whId),
      });
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      setLayoutWhSelections(prev => ({ ...prev, [layoutId]: '' }));
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const unbindLayoutWarehouse = async (layoutId) => {
    try {
      await client.patch('/api/v1/applications/layouts/' + layoutId + '/warehouse', {
        warehouse_item_id: null,
      });
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const bindRun = async (layoutId, runIndex) => {
    const key = `${layoutId}_${runIndex}`;
    const whId = runSelections[key];
    if (!whId) return alert('Выберите позицию на складе');
    try {
      const res = await client.patch('/api/v1/applications/layouts/' + layoutId + '/bind-run', {
        run_index: runIndex,
        warehouse_item_id: parseInt(whId),
      });
      if (res.data.area_warning) {
        if (!confirm('Лист меньше по площади, чем раскладка. Продолжить?')) {
          return;
        }
      }
      const appRes = await client.get('/api/v1/applications/' + app.id);
      setFullApp(appRes.data);
      setRunSelections(prev => ({ ...prev, [key]: '' }));
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const unbindRun = async (layoutId, runIndex) => {
    try {
      await client.patch('/api/v1/applications/layouts/' + layoutId + '/bind-run', {
        run_index: runIndex,
        warehouse_item_id: null,
      });
      const appRes = await client.get('/api/v1/applications/' + app.id);
      setFullApp(appRes.data);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const doCancelDeduct = async () => {
    setConfirmCancelDeduct(false);
    try {
      await client.post('/api/v1/applications/' + app.id + '/cancel-deduct');
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  useEffect(() => {
    fetchWarehouseItems();
  }, []);

  if (loading) return (
    <div className="modal-overlay active">
      <div className="modal-content">
        <div className="modal-body" style={{textAlign: 'center', padding: 40}}>Загрузка...</div>
      </div>
    </div>
  );

  const data = fullApp ? (fullApp.application || fullApp) : app;
  const layouts = fullApp ? [...(fullApp.layouts || [])].sort((a, b) => {
    const ca = a.layout_code || '';
    const cb = b.layout_code || '';
    return ca.localeCompare(cb, undefined, { numeric: true });
  }) : [];
  const uniquePartNames = new Set();
  layouts.forEach(l => {
    (l.parts || []).forEach(p => uniquePartNames.add(p.name));
  });
  const uniquePartTypes = uniquePartNames.size;
  const totalPartsQty = data.ordered_parts || data.placed_parts || layouts.reduce((sum, l) => {
    const partsQty = (l.parts || []).reduce((ps, p) => ps + (p.quantity || 0), 0);
    return sum + partsQty;
  }, 0);
  const placedParts = data.placed_parts;
  const orderedParts = data.ordered_parts;
  const partsMismatch = placedParts != null && orderedParts != null && placedParts !== orderedParts;

  return (
    <div className="modal-overlay active" onClick={activeLayout !== null ? () => setActiveLayout(null) : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{width: 800}}>
        <div className="modal-header">
          <h3>{data.order_name || 'Заявка'} #{data.id}</h3>
          <div>
            {activeLayout !== null && (
              <span className="btn" style={{marginRight: 8, cursor: 'pointer'}} onClick={() => setActiveLayout(null)}>
                ⬅ Назад к заявке
              </span>
            )}
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          {activeLayout === null ? (
            <>
              <div style={{display: 'flex', gap: 20}}>
                <div style={{flex: 1}}>
                  <div style={{marginBottom: 12}}>
                    <div><span style={{fontWeight: 600}}>Заказчик:</span> {data.customer || '-'}</div>
                    <div><span style={{fontWeight: 600}}>Материал:</span> {data.material || data.steel_grade || '-'}</div>
                    <div><span style={{fontWeight: 600}}>Толщина:</span> {data.thickness != null && data.thickness !== '' ? data.thickness + ' мм' : '-'}</div>
                    <div><span style={{fontWeight: 600}}>Вес:</span> {data.total_weight != null && data.total_weight !== '' ? data.total_weight + ' кг' : '-'}</div>
                    <div><span style={{fontWeight: 600}}>Раскладок:</span> {layouts.length}</div>
                    <div><span style={{fontWeight: 600}}>Видов деталей:</span> {uniquePartTypes}</div>
                    <div><span style={{fontWeight: 600}}>Всего деталей:</span> {totalPartsQty}</div>
                    {partsMismatch && (
                      <div style={{color: '#dc2626', fontWeight: 600, marginTop: 4}}>
                        ⚠ Размещено {placedParts} из {orderedParts} заказанных деталей — количество не совпадает!
                      </div>
                    )}
                    <div><span style={{fontWeight: 600}}>Дата:</span> {data.created_at ? new Date(data.created_at).toLocaleDateString('ru-RU') : '-'}</div>
                    {data.comments && <div><span style={{fontWeight: 600}}>Комментарий:</span> {data.comments}</div>}
                  </div>

                  {data.status === 'pending' && user?.role === 'admin' && (
                    <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                      <div style={{fontWeight: 600, marginBottom: 8}}>Решение:</div>
                      <div style={{display: 'flex', gap: 8}}>
                        <button
                          onClick={() => updateStatus('approved')}
                          style={{
                            padding: '8px 18px', borderRadius: 6, border: '1px solid #86efac',
                            background: '#dcfce7', color: '#166534', fontWeight: 600,
                            cursor: 'pointer', fontSize: 13
                          }}
                        >
                          ✅ Утвердить
                        </button>
                        <button
                          onClick={() => updateStatus('rejected')}
                          style={{
                            padding: '8px 18px', borderRadius: 6, border: '1px solid #fca5a5',
                            background: '#fee2e2', color: '#991b1b', fontWeight: 600,
                            cursor: 'pointer', fontSize: 13
                          }}
                        >
                          ❌ Отклонить
                        </button>
                      </div>
                    </div>
                  )}

                  {data.status === 'rejected' && user?.role === 'admin' && (
                    <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                      <div style={{fontWeight: 600, marginBottom: 8}}>Решение:</div>
                      <button
                        onClick={() => updateStatus('approved')}
                        style={{
                          padding: '8px 18px', borderRadius: 6, border: '1px solid #86efac',
                          background: '#dcfce7', color: '#166534', fontWeight: 600,
                          cursor: 'pointer', fontSize: 13
                        }}
                      >
                        ✅ Утвердить
                      </button>
                    </div>
                  )}

                  {(user?.role === 'operator') && (
                    <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                      {!showDeficitForm ? (
                        <button
                          className="btn"
                          onClick={() => {
                            const firstLayout = layouts[0];
                            setDeficitSize(firstLayout ? firstLayout.sheet_size : '');
                            setDeficitQty(firstLayout ? String(firstLayout.sheet_count || 1) : '1');
                            setDeficitNote('');
                            setShowDeficitForm(true);
                          }}
                          style={{background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d'}}
                        >
                          ⚠️ Заказать материал
                        </button>
                      ) : (
                        <div style={{padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6}}>
                          <div style={{fontWeight: 600, marginBottom: 6}}>Нехватка металла</div>
                          <div style={{fontSize: 13, color: '#64748b', marginBottom: 6}}>
                            Материал: {data.material || data.steel_grade || '-'}, Толщина: {data.thickness || '-'} мм
                          </div>
                          <div style={{display: 'flex', gap: 8, marginBottom: 6}}>
                            <div style={{flex: 1}}>
                              <label style={{fontSize: 12, color: '#64748b'}}>Размер листа</label>
                              <input
                                value={deficitSize}
                                onChange={e => setDeficitSize(e.target.value)}
                                placeholder="1500x6000"
                                style={{width: '100%', padding: 4, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box'}}
                              />
                            </div>
                            <div style={{width: 80}}>
                              <label style={{fontSize: 12, color: '#64748b'}}>Кол-во</label>
                              <input
                                type="number"
                                value={deficitQty}
                                onChange={e => setDeficitQty(e.target.value)}
                                placeholder="1"
                                style={{width: '100%', padding: 4, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box'}}
                              />
                            </div>
                          </div>
                          <textarea
                            value={deficitNote}
                            onChange={e => setDeficitNote(e.target.value)}
                            placeholder="Комментарий (необязательно)"
                            style={{width: '100%', padding: 6, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, minHeight: 50, boxSizing: 'border-box'}}
                          />
                          <div style={{display: 'flex', gap: 6, marginTop: 6}}>
                            <button className="btn btn-primary" onClick={submitDeficit} disabled={deficitSending}>
                              {deficitSending ? 'Отправка...' : 'Отправить'}
                            </button>
                            <button className="btn" onClick={() => { setShowDeficitForm(false); setDeficitNote(''); }}>
                              Отмена
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {confirmDelete && (
                    <ConfirmModal
                      title="Удалить заявку?"
                      message="Заявка и все раскладки будут удалены."
                      onConfirm={confirmDeleteAction}
                      onCancel={() => setConfirmDelete(false)}
                    />
                  )}

                  {layouts.length > 0 && (
                    <div style={{marginTop: 16}}>
                      <h4>Раскладки</h4>
                      {layouts.map((layout, li) => {
                        const isReplaced = layout.replaced;
                        const isMergeCancelled = layout.status === 'merge_cancelled';
                        const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
                        const layoutDone = runs.filter(Boolean).length;
                        const layoutTotal = layout.sheet_count || 1;
                        const isComplete = layoutDone >= layoutTotal;
                        const pct = layoutTotal > 0 ? Math.round((layoutDone / layoutTotal) * 100) : 0;
                        const isDisabled = isReplaced || isMergeCancelled;
                        const bindings = layout.warehouse_bindings || {};
                        const hasUnboundCutRuns = Array.from({length: layoutTotal}, (_, i) => runs[i] && bindings[i] == null).some(Boolean);
                        return (
                          <div
                            key={layout.id || li}
                            style={{
                              padding: 10, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8,
                              cursor: isDisabled ? 'default' : 'pointer',
                              opacity: isDisabled ? 0.45 : 1,
                              background: isMergeCancelled ? '#fef2f2' : isReplaced ? '#f1f5f9'
                                : isComplete && hasUnboundCutRuns ? '#fef2f2'
                                : isComplete ? '#f0fdf4' : undefined,
                              borderColor: isComplete && hasUnboundCutRuns ? '#fca5a5'
                                : isComplete ? '#bbf7d0' : undefined,
                              borderLeft: isComplete && hasUnboundCutRuns
                                ? '3px solid #ef4444' : undefined,
                            }}
                            onClick={() => !isDisabled && setActiveLayout(li)}
                          >
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                              <strong>{layout.layout_code ? (`Раскладка ${data.id}.${layout.layout_code}`) : (`Раскладка ${data.id}.${String(li + 1).padStart(3, '0')}`)}</strong>
                              <span style={{fontSize: 12, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center'}}>
                                {isMergeCancelled && (
                                  <span style={{background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600}}>
                                    Слияние отменено
                                  </span>
                                )}
                                {isReplaced && !isMergeCancelled && (
                                  <span style={{background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600}}>
                                    Заменена
                                  </span>
                                )}
                                {layout.merged_from && !isMergeCancelled && !isReplaced && (
                                  <span style={{background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontSize: 11}}>
                                    Слияние: {(layout.merged_from.layouts || []).map(l => `${l.app_id || '?'}.${l.code}`).join(' + ')}
                                  </span>
                                )}
                                {hasUnboundCutRuns && isComplete && (
                                  <span style={{fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d'}}>
                                    {Array.from({length: layoutTotal}, (_, i) => runs[i] && bindings[i] == null).filter(Boolean).length} без листа
                                  </span>
                                )}
                                {!isDisabled && `${layout.machine_type || ''} | ${layout.sheet_size} | Деталей: ${layout.parts_count}`}
                                {layout.merged_from && !isMergeCancelled && !isReplaced && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnmerge(layout.id, 'cancel');
                                    }}
                                    style={{
                                      fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #fca5a5',
                                      background: '#fef2f2', color: '#991b1b', cursor: 'pointer', fontWeight: 600
                                    }}
                                  >
                                    Отменить слияние
                                  </button>
                                )}
                                {isMergeCancelled && layout.merged_from && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnmerge(layout.id, 'restore');
                                    }}
                                    style={{
                                      fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #86efac',
                                      background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontWeight: 600
                                    }}
                                  >
                                    Восстановить
                                  </button>
                                )}
                              </span>
                            </div>
                            {!isReplaced && layout.sheet_count >= 1 && (
                              <div style={{marginTop: 8}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4}}>
                                  <span>Вырезано: {layoutDone} из {layoutTotal} листов</span>
                                  <span style={{fontWeight: 600, color: isComplete ? '#166534' : '#64748b'}}>{pct}%</span>
                                </div>
                                <div style={{background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden'}}>
                                  <div style={{
                                    width: pct + '%', height: '100%', borderRadius: 4,
                                    background: isComplete ? '#22c55e' : '#3b82f6',
                                    transition: 'width 0.3s ease'
                                  }}/>
                                </div>
                                <div style={{display: 'flex', gap: 3, marginTop: 6}}>
                                  {Array.from({length: layoutTotal}, (_, i) => {
                                    const done = runs[i] || false;
                                    const bindings = layout.warehouse_bindings || {};
                                    const hasBinding = bindings[i] != null;
                                    return (
                                      <div
                                        key={i}
                                        style={{
                                          width: 20, height: 20, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontSize: 9, fontWeight: 600,
                                          background: done ? '#22c55e' : hasBinding ? '#3b82f6' : '#e2e8f0',
                                          color: done || hasBinding ? '#fff' : '#64748b',
                                          border: done ? '2px solid #16a34a' : hasBinding ? '2px solid #2563eb' : '1px solid #cbd5e1'
                                        }}
                                      >
                                        {i + 1}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {(user?.role === 'admin' || user?.role === 'operator' || user?.role === 'director') && !isDisabled && (
                              <div style={{marginTop: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid var(--border)'}} onClick={e => e.stopPropagation()}>
                                {Array.from({length: layoutTotal}, (_, runIdx) => {
                                  const bindings = layout.warehouse_bindings || {};
                                  const boundId = bindings[runIdx];
                                  const isCut = runs[runIdx] || false;
                                  const selKey = `${layout.id}_${runIdx}`;

                                  const renderDropdown = (key, onSelect) => {
                                    const items = warehouseItems.filter(w => w.sheet_count > 0);
                                    const showAll = showAllSheets[key];
                                    const matching = items.filter(w => {
                                      const gm = !app.steel_grade || !w.grade || w.grade.toLowerCase() === app.steel_grade.toLowerCase();
                                      const tm = !app.thickness || !w.thickness || w.thickness === app.thickness;
                                      return gm && tm;
                                    });
                                    const others = items.filter(w => {
                                      const gm = !app.steel_grade || !w.grade || w.grade.toLowerCase() === app.steel_grade.toLowerCase();
                                      const tm = !app.thickness || !w.thickness || w.thickness === app.thickness;
                                      return !(gm && tm);
                                    });
                                    const renderOpt = (w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.article || `${w.metal}/${w.grade || 'XX'}/${w.id}`}
                                        {(reservedItems[w.id] || []).length > 0 ? ` [резерв]` : ''}
                                      </option>
                                    );
                                    return (
                                      <select
                                        value={runSelections[key] || ''}
                                        onChange={e => {
                                          if (e.target.value === '__show_all') {
                                            setShowAllSheets(prev => ({ ...prev, [key]: true }));
                                            return;
                                          }
                                          onSelect(e.target.value);
                                        }}
                                        style={{flex: 1, padding: '1px 3px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 3}}
                                      >
                                        <option value="">Склад...</option>
                                        {matching.map(renderOpt)}
                                        {!showAll && others.length > 0 && (
                                          <option value="__show_all" style={{fontWeight: 600, color: '#64748b'}}>
                                            — Другой лист ({others.length}) —
                                          </option>
                                        )}
                                        {showAll && others.map(renderOpt)}
                                      </select>
                                    );
                                  };

                                  const getWhLabel = (id) => {
                                    const w = warehouseItems.find(x => x.id === id);
                                    return w ? (w.article || `Склад #${w.id}`) : `Склад #${id}`;
                                  };

                                  return (
                                    <div key={runIdx} style={{display: 'flex', alignItems: 'center', gap: 4, marginBottom: runIdx < layoutTotal - 1 ? 4 : 0, fontSize: 11}}>
                                      <span style={{
                                        width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 9, fontWeight: 600,
                                        background: isCut ? '#22c55e' : boundId ? '#3b82f6' : '#e2e8f0',
                                        color: isCut || boundId ? '#fff' : '#64748b'
                                      }}>
                                        {runIdx + 1}
                                      </span>
                                      {boundId ? (
                                        <div style={{display: 'flex', alignItems: 'center', gap: 4, flex: 1}}>
                                          <span style={{color: '#166534', fontWeight: 600, fontSize: 10}}>
                                            {getWhLabel(boundId)}
                                          </span>
                                          {!isCut && (
                                            <button
                                              onClick={() => unbindRun(layout.id, runIdx)}
                                              style={{fontSize: 9, padding: '0px 4px', borderRadius: 3, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', cursor: 'pointer'}}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <div style={{display: 'flex', gap: 3, alignItems: 'center', flex: 1}}>
                                          {renderDropdown(selKey, (val) => setRunSelections(prev => ({ ...prev, [selKey]: val })))}
                                          <button
                                            onClick={() => bindRun(layout.id, runIdx)}
                                            style={{fontSize: 9, padding: '1px 4px', borderRadius: 3, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'}}
                                          >
                                            Привязать
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(user?.role === 'admin' || user?.role === 'operator') && ['approved', 'in_progress', 'partially_cut', 'cut'].includes(data.status) && (
                  <div style={{width: 180, flexShrink: 0}}>
                    {(() => {
                      const totalSheets = layouts.reduce((s, l) => s + (l.sheet_count || 1), 0);
                      const doneSheets = layouts.reduce((s, l) => {
                        const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
                        return s + runs.filter(Boolean).length;
                      }, 0);
                      const pct = totalSheets > 0 ? Math.round((doneSheets / totalSheets) * 100) : 0;
                      const statusColors = {
                        approved: { bg: '#f0fdf4', bar: '#22c55e', text: '#15803d', label: 'В очереди' },
                        in_progress: { bg: '#eff6ff', bar: '#3b82f6', text: '#1d4ed8', label: 'В резке' },
                        partially_cut: { bg: '#fffbeb', bar: '#f59e0b', text: '#92400e', label: 'Частично вырезано' },
                        cut: { bg: '#f0fdf4', bar: '#22c55e', text: '#166534', label: 'Вырезано' },
                      };
                      const sc = statusColors[data.status] || statusColors.approved;
                      return (
                        <div style={{padding: '12px 0'}}>
                          <div style={{
                            padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: sc.bg, color: sc.text, textAlign: 'center', marginBottom: 12
                          }}>
                            {sc.label}
                          </div>
                          <div style={{position: 'relative', height: 200, width: 32, margin: '0 auto 12px'}}>
                            <div style={{
                              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                              width: 8, height: '100%', borderRadius: 4, background: '#e2e8f0'
                            }}/>
                            <div style={{
                              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                              width: 8, borderRadius: 4, bottom: 0,
                              height: pct + '%', background: sc.bar,
                              transition: 'height 0.3s ease'
                            }}/>
                            <div style={{
                              position: 'absolute', left: '50%', transform: 'translate(-50%, 50%)',
                              bottom: pct + '%', width: 28, height: 28, borderRadius: '50%',
                              background: sc.bar, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: '#fff', border: '2px solid #fff',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                            }}>
                              {pct}%
                            </div>
                          </div>
                          <div style={{fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 12}}>
                            {doneSheets} из {totalSheets} листов
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                            {layouts.map((layout, li) => {
                              const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
                              const layoutDone = runs.filter(Boolean).length;
                              const layoutTotal = layout.sheet_count || 1;
                              const isComplete = layoutDone >= layoutTotal;
                              const isDisabled = layout.replaced || layout.status === 'merge_cancelled';
                              return (
                                <div key={layout.id || li} style={{
                                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                                  borderRadius: 4, fontSize: 11,
                                  background: isDisabled ? '#f1f5f9' : isComplete ? '#f0fdf4' : '#f8fafc',
                                  border: '1px solid ' + (isDisabled ? '#e2e8f0' : isComplete ? '#bbf7d0' : '#e2e8f0'),
                                  opacity: isDisabled ? 0.5 : 1,
                                }}>
                                  <span style={{
                                    width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, fontWeight: 600, flexShrink: 0,
                                    background: isDisabled ? '#e2e8f0' : isComplete ? '#22c55e' : '#e2e8f0',
                                    color: isDisabled ? '#94a3b8' : isComplete ? '#fff' : '#64748b'
                                  }}>
                                    {isDisabled ? '—' : isComplete ? '✓' : (li + 1)}
                                  </span>
                                  <span style={{flex: 1, fontWeight: 500}}>
                                    {layout.layout_code ? `${data.id}.${layout.layout_code}` : `${data.id}.${String(li + 1).padStart(3, '0')}`}
                                  </span>
                                  <span style={{
                                    fontSize: 10, padding: '1px 4px', borderRadius: 3,
                                    background: isDisabled ? '#f1f5f9' : isComplete ? '#dcfce7' : '#f1f5f9',
                                    color: isDisabled ? '#94a3b8' : isComplete ? '#166534' : '#64748b'
                                  }}>
                                    {isDisabled ? '—' : `${layoutDone}/${layoutTotal}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          ) : (
            (() => {
              const layout = layouts[activeLayout];
              if (!layout) return null;

              const layoutImg = layout.layout_image;

              return (
                <div>
                  <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
                    <div style={{flex: '0 0 65%'}}>
                      {layoutImg ? (
                        <img src={layoutImg} alt={`${data.id}.${layout.layout_code}`} style={{width: '100%', borderRadius: 6, border: '1px solid var(--border)'}} />
                      ) : (
                        <div style={{background: '#f1f5f9', borderRadius: 6, padding: 60, textAlign: 'center', color: '#94a3b8'}}>Раскладка</div>
                      )}
                    </div>
                    <div style={{flex: 1, fontSize: 13}}>
                      <div><span style={{fontWeight: 600}}>Материал:</span> {data.material || data.steel_grade || '-'}</div>
                      <div><span style={{fontWeight: 600}}>Размер листа:</span> {layout.sheet_size}</div>
                      <div><span style={{fontWeight: 600}}>Вес листа:</span> {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'}</div>
                      <div><span style={{fontWeight: 600}}>Резка (время):</span> {layout.cut_time}</div>
                      <div><span style={{fontWeight: 600}}>Перемещение (время):</span> {layout.move_time}</div>
                      <div><span style={{fontWeight: 600}}>Проколы (время):</span> {layout.pierce_time}</div>
                      {layout.cut_length != null && <div><span style={{fontWeight: 600}}>Резка (мм):</span> {layout.cut_length}</div>}
                      {layout.travel_length != null && <div><span style={{fontWeight: 600}}>Перемещение (мм):</span> {layout.travel_length}</div>}
                      {layout.pierces != null && <div><span style={{fontWeight: 600}}>Кол-во проколов:</span> {layout.pierces}</div>}
                      <div><span style={{fontWeight: 600}}>Кол-во листов:</span> {layout.sheet_count || 1}</div>
                    </div>
                  </div>

                  {layout.sheet_count >= 1 && (
                    <div style={{marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)'}}>
                      {(() => {
                        const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
                        const doneCount = runs.filter(Boolean).length;
                        return (
                          <>
                            <div style={{fontWeight: 600, marginBottom: 8, fontSize: 13}}>Вырезано ({doneCount} из {layout.sheet_count} листов)</div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                              {Array.from({length: layout.sheet_count}, (_, i) => {
                                const done = runs[i] || false;
                                const isNext = i === doneCount;
                                const canClick = isNext || done;
                                return (
                                  <div
                                    key={i}
                                    onClick={() => {
                                      if (!canClick) return;
                                      if (isNext) {
                                        toggleRun(layout.id, i);
                                      } else if (done) {
                                        toggleRun(layout.id, i);
                                      }
                                    }}
                                    style={{
                                      width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 11, fontWeight: 600, cursor: canClick ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                      background: done ? '#22c55e' : isNext ? '#bfdbfe' : '#e2e8f0',
                                      color: done || isNext ? '#fff' : '#64748b',
                                      border: done ? '2px solid #16a34a' : isNext ? '2px solid #3b82f6' : '2px solid transparent',
                                      opacity: !canClick ? 0.4 : 1
                                    }}
                                  >
                                    {i + 1}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {layout.parts && layout.parts.length > 0 && (
                    <div style={{marginTop: 12}}>
                      <h4>Список деталей ({layout.parts.length})</h4>
                      <table className="parts-table">
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>DX</th>
                            <th>DY</th>
                            <th>Кол-во</th>
                            <th>Вес, кг</th>
                          </tr>
                        </thead>
                        <tbody>
                          {layout.parts.map((part, pi) => (
                            <tr key={pi} onClick={() => setShowPartInfo(part)} style={{
                              cursor: 'pointer',
                              background: highlightPart && part.name === highlightPart ? '#fef08a' : undefined
                            }}>
                              <td><span className="part-link">{part.name || ''}</span></td>
                              <td>{part.dx || '-'}</td>
                              <td>{part.dy || '-'}</td>
                              <td>{part.quantity || '-'}</td>
                              <td>{part.weight != null ? part.weight.toFixed(3) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger" onClick={handleDelete}>Удалить</button>
          <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      {showPartInfo && (
        <div className="modal-overlay active" style={{zIndex: 1001}} onClick={(e) => { e.stopPropagation(); setShowPartInfo(null); }}>
          <div className="modal-content" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showPartInfo.name || ''}</h3>
              <button className="close-btn" onClick={() => setShowPartInfo(null)}>✕</button>
            </div>
            <div className="modal-body" style={{textAlign: 'center'}}>
              {showPartInfo.image_path ? (
                <img src={showPartInfo.image_path} alt={showPartInfo.name} style={{maxWidth: '100%', maxHeight: 400, borderRadius: 6}} />
              ) : (
                <div style={{padding: 40, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6}}>
                  Изображение детали недоступно
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowPartInfo(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить заявку?"
          message="Заявка и все связанные раскладки будут удалены безвозвратно."
          onConfirm={confirmDeleteAction}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmUnmerge && (
        <ConfirmModal
          title={confirmUnmerge.action === 'cancel' ? "Отменить слияние?" : "Восстановить слияние?"}
          message={confirmUnmerge.action === 'cancel'
            ? "Исходные раскладки вернутся в рабочее состояние."
            : "Слияние будет восстановлено. Исходные раскладки снова будут заменены."}
          confirmText={confirmUnmerge.action === 'cancel' ? "Отменить слияние" : "Восстановить"}
          danger={confirmUnmerge.action === 'cancel'}
          onConfirm={confirmUnmergeAction}
          onCancel={() => setConfirmUnmerge(null)}
        />
      )}
    </div>
  );
}
