import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { key: 'approved', label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'in_progress', label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  { key: 'partially_cut', label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  { key: 'cut', label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
];

export default function MobileOrderDetail({ app, onClose, onUpdate }) {
  const { user } = useAuth();
  const [fullApp, setFullApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartInfo, setShowPartInfo] = useState(null);
  const [activeLayout, setActiveLayout] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [runSelections, setRunSelections] = useState({});
  const [showAllSheets, setShowAllSheets] = useState({});
  const canChangeStatus = user?.role === 'admin' || user?.role === 'director' || user?.role === 'operator';
  const canBind = user?.role === 'admin' || user?.role === 'director';

  useEffect(() => {
    const fetchFull = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + app.id);
        setFullApp(res.data);
        setNotesText(res.data.application?.comments || '');
      } catch (err) {
        console.error('Failed to load application detail', err);
        setFullApp({ application: app, layouts: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchFull();
  }, [app.id]);

  useEffect(() => {
    if (canBind) {
      client.get('/api/v1/warehouse/').then(res => {
        setWarehouseItems(Array.isArray(res.data) ? res.data : []);
      }).catch(() => {});
    }
  }, [canBind]);

  const bindRun = async (layoutId, runIndex) => {
    const key = `${layoutId}_${runIndex}`;
    const whId = runSelections[key];
    if (!whId) return alert('Выберите позицию на складе');
    try {
      await client.patch('/api/v1/applications/layouts/' + layoutId + '/bind-run', {
        run_index: runIndex,
        warehouse_item_id: parseInt(whId),
      });
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
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
      const res = await client.get('/api/v1/applications/' + app.id);
      setFullApp(res.data);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const data = fullApp ? (fullApp.application || fullApp) : app;
  const layouts = fullApp
    ? [...(fullApp.layouts || [])].sort((a, b) => (a.layout_code || '').localeCompare(b.layout_code || '', undefined, { numeric: true }))
    : [];
  const totalPartsWeight = layouts.reduce((sum, l) => {
    return sum + (l.parts || []).reduce((ps, p) => ps + (p.weight || 0) * (p.quantity || 0), 0);
  }, 0);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await client.patch('/api/v1/applications/' + app.id + '/comments?comments=' + encodeURIComponent(notesText));
      setFullApp(prev => prev ? { ...prev, application: { ...prev.application, comments: notesText } } : prev);
      if (onUpdate) onUpdate();
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setSavingNotes(false);
    }
  };

  const changeStatus = async (newStatus) => {
    try {
      await client.patch('/api/v1/applications/' + app.id + '/status?status=' + newStatus);
      setStatusDropdown(false);
      // Re-fetch to get updated completed_runs from backend
      try {
        const res = await client.get('/api/v1/applications/' + app.id);
        setFullApp(res.data);
      } catch {
        setFullApp(prev => prev ? { ...prev, application: { ...prev.application, status: newStatus } } : prev);
      }
      if (onUpdate) onUpdate();
    } catch {
      alert('Ошибка смены статуса');
    }
  };

  const toggleRun = async (layoutId, runIndex) => {
    try {
      const res = await client.patch('/api/v1/applications/layouts/' + layoutId + '/toggle-run?run_index=' + runIndex);
      setFullApp(prev => {
        if (!prev) return prev;
        const updatedLayouts = prev.layouts.map(l => l.id === layoutId ? { ...l, completed_runs: res.data.completed_runs } : l);
        const updatedApp = res.data.app_status ? { ...prev.application, status: res.data.app_status } : prev.application;
        return { ...prev, layouts: updatedLayouts, application: updatedApp };
      });
    } catch {
      alert('Ошибка');
    }
  };

  if (loading) return (
    <div className="modal-overlay active">
      <div className="modal-content" style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0 }}>
        <div className="modal-body" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
      </div>
    </div>
  );

  const currentLayout = activeLayout !== null ? layouts[activeLayout] : null;
  const statusConf = STATUS_OPTIONS.find(s => s.key === data.status) || STATUS_OPTIONS[0];

  if (activeLayout !== null && currentLayout) {
    const runs = Array.isArray(currentLayout.completed_runs) ? currentLayout.completed_runs : [];
    const doneCount = runs.filter(Boolean).length;
    const layoutTotal = currentLayout.sheet_count || 1;
    const isDisabled = currentLayout.replaced || currentLayout.status === 'merge_cancelled';

    return (
      <div className="modal-overlay active" onClick={() => setActiveLayout(null)}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' }}>
          <div className="modal-header">
            <h3 style={{ fontSize: 14 }}>
              {data.id}.{currentLayout.layout_code || '?'}
              <button className="btn" style={{ marginLeft: 8, fontSize: 11, padding: '3px 8px' }} onClick={() => setActiveLayout(null)}>
                Назад
              </button>
            </h3>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body" style={{ padding: '0 12px 12px' }}>
            {currentLayout.layout_image && (
              <img
                src={currentLayout.layout_image}
                alt={`Раскладка ${data.id}.${currentLayout.layout_code}`}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}
              />
            )}

            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <div><span style={{ fontWeight: 600 }}>Размер листа:</span> {currentLayout.sheet_size}</div>
              <div><span style={{ fontWeight: 600 }}>Вес листа:</span> {currentLayout.sheet_weight ? currentLayout.sheet_weight + ' кг' : '-'}</div>
              <div><span style={{ fontWeight: 600 }}>Листов:</span> {layoutTotal}</div>
            </div>

            {layoutTotal >= 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Вырезано: {doneCount} из {layoutTotal}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: layoutTotal }, (_, i) => {
                    const done = runs[i] || false;
                    const isNext = i === doneCount;
                    const canClick = isNext || done;
                    return (
                      <div
                        key={i}
                        onClick={() => canClick && toggleRun(currentLayout.id, i)}
                        style={{
                          width: 36, height: 36, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 600, cursor: canClick ? 'pointer' : 'not-allowed',
                          background: done ? '#22c55e' : isNext ? '#bfdbfe' : '#e2e8f0',
                          color: done || isNext ? '#fff' : '#64748b',
                          border: done ? '2px solid #16a34a' : isNext ? '2px solid #3b82f6' : '2px solid transparent',
                          opacity: !canClick ? 0.4 : 1,
                        }}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warehouse binding UI */}
            {canBind && !isDisabled && (
              <div style={{ marginBottom: 12, padding: 8, background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Привязка к складу</div>
                {Array.from({ length: layoutTotal }, (_, runIdx) => {
                  const bindings = currentLayout.warehouse_bindings || {};
                  const boundId = bindings[runIdx];
                  const isCut = runs[runIdx] || false;
                  const selKey = `${currentLayout.id}_${runIdx}`;
                  const items = warehouseItems.filter(w => w.sheet_count > 0);
                  const showAll = showAllSheets[selKey];
                  const matching = items.filter(w => {
                    const gm = !data.steel_grade || !w.grade || w.grade.toLowerCase() === data.steel_grade.toLowerCase();
                    const tm = !data.thickness || !w.thickness || w.thickness === data.thickness;
                    return gm && tm;
                  });
                  const others = items.filter(w => {
                    const gm = !data.steel_grade || !w.grade || w.grade.toLowerCase() === data.steel_grade.toLowerCase();
                    const tm = !data.thickness || !w.thickness || w.thickness === data.thickness;
                    return !(gm && tm);
                  });
                  return (
                    <div key={runIdx} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: runIdx < layoutTotal - 1 ? 4 : 0, fontSize: 11 }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 600,
                        background: isCut ? '#22c55e' : boundId ? '#3b82f6' : '#e2e8f0',
                        color: isCut || boundId ? '#fff' : '#64748b',
                        flexShrink: 0,
                      }}>
                        {runIdx + 1}
                      </span>
                      {boundId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                          <span style={{ color: '#166534', fontWeight: 600, fontSize: 10 }}>
                            {warehouseItems.find(x => x.id === boundId)?.article || `#${boundId}`}
                          </span>
                          {!isCut && (
                            <button onClick={() => unbindRun(currentLayout.id, runIdx)}
                              style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', cursor: 'pointer' }}>
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flex: 1 }}>
                          <select value={runSelections[selKey] || ''} onChange={e => {
                            if (e.target.value === '__show_all') { setShowAllSheets(prev => ({ ...prev, [selKey]: true })); return; }
                            setRunSelections(prev => ({ ...prev, [selKey]: e.target.value }));
                          }} style={{ flex: 1, padding: '2px 4px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 3 }}>
                            <option value="">Склад...</option>
                            {matching.map(w => <option key={w.id} value={w.id}>{w.article || `#${w.id}`}</option>)}
                            {!showAll && others.length > 0 && <option value="__show_all" style={{ fontWeight: 600, color: '#64748b' }}>— Другой ({others.length}) —</option>}
                            {showAll && others.map(w => <option key={w.id} value={w.id}>{w.article || `#${w.id}`}</option>)}
                          </select>
                          <button onClick={() => bindRun(currentLayout.id, runIdx)}
                            style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Привязать
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {currentLayout.parts && currentLayout.parts.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Детали ({currentLayout.parts.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {currentLayout.parts.map((part, pi) => (
                    <div
                      key={pi}
                      onClick={() => setShowPartInfo(part)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      {part.image_path ? (
                        <img src={part.image_path} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 4, background: '#e2e8f0', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{part.name || ''}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {part.dx} x {part.dy} | x{part.quantity}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {showPartInfo && (
          <div className="modal-overlay active" style={{ zIndex: 1100 }} onClick={() => setShowPartInfo(null)}>
            <div className="modal-content" style={{ width: '95%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ fontSize: 14 }}>{showPartInfo.name}</h3>
                <button className="close-btn" onClick={() => setShowPartInfo(null)}>✕</button>
              </div>
              <div className="modal-body" style={{ textAlign: 'center' }}>
                {showPartInfo.image_path ? (
                  <img src={showPartInfo.image_path} alt={showPartInfo.name} style={{ maxWidth: '100%', maxHeight: 350, borderRadius: 6 }} />
                ) : (
                  <div style={{ padding: 30, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6 }}>Изображение недоступно</div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setShowPartInfo(null)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 14 }}>#{data.id} {data.order_name || ''}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '0 12px 12px' }}>
          {/* Main layout image */}
          {layouts.length > 0 && layouts[0].layout_image && (
            <img
              src={layouts[0].layout_image}
              alt={`Раскладка #${data.id}`}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}
            />
          )}

          {/* Info */}
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <div><span style={{ fontWeight: 600 }}>Заказчик:</span> {data.customer || '-'}</div>
            <div><span style={{ fontWeight: 600 }}>Материал:</span> {data.material || data.steel_grade || '-'}</div>
            <div><span style={{ fontWeight: 600 }}>Толщина:</span> {data.thickness != null && data.thickness !== '' ? data.thickness + ' мм' : '-'}</div>
            {data.total_weight != null && data.total_weight !== '' && <div><span style={{ fontWeight: 600 }}>Вес:</span> {data.total_weight} кг</div>}
            {totalPartsWeight > 0 && <div><span style={{ fontWeight: 600 }}>Вес деталей:</span> {totalPartsWeight.toFixed(2)} кг</div>}
            <div><span style={{ fontWeight: 600 }}>Раскладок:</span> {layouts.length}</div>
          </div>

          {/* Group */}
          {data.group_name && (
            <div style={{ marginBottom: 12 }}>
              <span style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                background: '#ede9fe', color: '#7c3aed',
              }}>
                Группа: {data.group_name}
              </span>
            </div>
          )}

          {/* Supply material */}
          <div style={{ marginBottom: 12 }}>
            <span style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              background: data.supply_material === true ? '#d1fae5' : data.supply_material === false ? '#fee2e2' : '#f1f5f9',
              color: data.supply_material === true ? '#047857' : data.supply_material === false ? '#b91c1c' : '#94a3b8',
            }}>
              Давальческий: {data.supply_material === true ? 'Да' : data.supply_material === false ? 'Нет' : '—'}
            </span>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Статус</div>
            {canChangeStatus ? (
              <>
                <div
                  onClick={() => setStatusDropdown(!statusDropdown)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: statusConf.bg, color: statusConf.color, border: '1px solid ' + statusConf.bg,
                  }}
                >
                  {statusConf.label} ▾
                </div>
                {statusDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 180, overflow: 'hidden',
                  }}>
                    {STATUS_OPTIONS.map(s => (
                      <div
                        key={s.key}
                        onClick={() => changeStatus(s.key)}
                        style={{
                          padding: '10px 14px', fontSize: 13, cursor: 'pointer', fontWeight: data.status === s.key ? 600 : 400,
                          background: data.status === s.key ? s.bg : '#fff',
                          color: data.status === s.key ? s.color : '#334155',
                        }}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span style={{
                display: 'inline-block', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                background: statusConf.bg, color: statusConf.color,
              }}>
                {statusConf.label}
              </span>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Заметки</div>
            <textarea
              value={notesText}
              onChange={e => setNotesText(e.target.value)}
              placeholder="Добавить заметку..."
              style={{
                width: '100%', minHeight: 60, padding: 8, border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            {notesText !== (data.comments || '') && (
              <button
                className="btn btn-primary"
                onClick={saveNotes}
                disabled={savingNotes}
                style={{ marginTop: 6, fontSize: 12, padding: '5px 12px' }}
              >
                {savingNotes ? 'Сохранение...' : 'Сохранить заметку'}
              </button>
            )}
          </div>

          {/* Layout cards */}
          {layouts.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Раскладки</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {layouts.map((layout, li) => {
                  const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
                  const doneCount = runs.filter(Boolean).length;
                  const layoutTotal = layout.sheet_count || 1;
                  const isComplete = doneCount >= layoutTotal;
                  const isDisabled = layout.replaced || layout.status === 'merge_cancelled';
                  return (
                    <div
                      key={layout.id || li}
                      onClick={() => !isDisabled && setActiveLayout(li)}
                      style={{
                        padding: 10, border: '1px solid var(--border)', borderRadius: 8,
                        cursor: isDisabled ? 'default' : 'pointer', opacity: isDisabled ? 0.45 : 1,
                        background: isComplete ? '#f0fdf4' : '#fff',
                        borderColor: isComplete ? '#bbf7d0' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {data.id}.{layout.layout_code || String(li + 1).padStart(3, '0')}
                        </span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {doneCount}/{layoutTotal}
                        </span>
                      </div>
                      {layout.sheet_count >= 1 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {Array.from({ length: layoutTotal }, (_, i) => {
                            const done = runs[i] || false;
                            const bindings = layout.warehouse_bindings || {};
                            const hasBinding = bindings[i] != null;
                            return (
                              <div key={i} style={{
                                width: 18, height: 18, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 600,
                                background: done ? '#22c55e' : hasBinding ? '#3b82f6' : '#e2e8f0',
                                color: done || hasBinding ? '#fff' : '#64748b',
                              }}>
                                {i + 1}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
