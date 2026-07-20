import { useState, useEffect, useRef, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { key: 'approved', label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'in_progress', label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  { key: 'partially_cut', label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  { key: 'cut', label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
];

export default function LayoutPreviewModal({ appId, layoutId, allLayoutIds, onClose, onStatusChange }) {
  const { user } = useAuth();
  const [layout, setLayout] = useState(null);
  const [allLayouts, setAllLayouts] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartImage, setShowPartImage] = useState(null);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [runSelections, setRunSelections] = useState({});
  const [showAllSheets, setShowAllSheets] = useState({});
  const canChangeStatus = user?.role === 'admin' || user?.role === 'director';
  const canBind = user?.role === 'admin' || user?.role === 'director';

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (canBind) {
      client.get('/api/v1/warehouse/').then(res => {
        setWarehouseItems(Array.isArray(res.data) ? res.data : []);
      }).catch(() => {});
    }
  }, [canBind]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + appId, { signal: controller.signal });
        const layouts = (res.data.layouts || []).sort((a, b) =>
          (a.layout_code || '').localeCompare(b.layout_code || '', undefined, { numeric: true })
        );
        setAllLayouts(layouts);
        setAppData(res.data.application || null);
        const idx = layouts.findIndex(l => l.id === layoutId);
        setCurrentIdx(idx >= 0 ? idx : 0);
        setLayout(idx >= 0 ? layouts[idx] : layouts[0] || null);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Failed to load layout', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [appId, layoutId]);

  const goToLayout = useCallback((idx) => {
    if (idx >= 0 && idx < allLayouts.length) {
      setCurrentIdx(idx);
      setLayout(allLayouts[idx]);
    }
  }, [allLayouts]);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && dy < 50) {
      if (dx < -50 && currentIdx < allLayouts.length - 1) {
        goToLayout(currentIdx + 1);
      } else if (dx > 50 && currentIdx > 0) {
        goToLayout(currentIdx - 1);
      }
    }
  }, [currentIdx, allLayouts.length, goToLayout]);

  const changeStatus = async (newStatus) => {
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=' + newStatus);
      setStatusDropdown(false);
      try {
        const res = await client.get('/api/v1/applications/' + appId);
        const data = res.data;
        setAppData(data.application || data);
        const sorted = (data.layouts || []).sort((a, b) =>
          (a.layout_code || '').localeCompare(b.layout_code || '', undefined, { numeric: true })
        );
        setAllLayouts(sorted);
        const found = sorted.find(l => l.id === layoutId);
        if (found) setLayout(found);
      } catch {
        setAppData(prev => prev ? { ...prev, status: newStatus } : prev);
      }
      if (onStatusChange) onStatusChange();
    } catch {
      alert('Ошибка смены статуса');
    }
  };

  const toggleRun = async (runIndex) => {
    if (!layout) return;
    try {
      const res = await client.patch('/api/v1/applications/layouts/' + layout.id + '/toggle-run?run_index=' + runIndex);
      setLayout(prev => prev ? { ...prev, completed_runs: res.data.completed_runs } : prev);
      // Update in allLayouts too
      setAllLayouts(prev => prev.map(l => l.id === layout.id ? { ...l, completed_runs: res.data.completed_runs } : l));
    } catch {
      alert('Ошибка');
    }
  };

  const bindRun = async (runIndex) => {
    if (!layout) return;
    const key = `${layout.id}_${runIndex}`;
    const whId = runSelections[key];
    if (!whId) return alert('Выберите позицию на складе');
    try {
      await client.patch('/api/v1/applications/layouts/' + layout.id + '/bind-run', {
        run_index: runIndex,
        warehouse_item_id: parseInt(whId),
      });
      const res = await client.get('/api/v1/applications/' + appId);
      const sorted = (res.data.layouts || []).sort((a, b) =>
        (a.layout_code || '').localeCompare(b.layout_code || '', undefined, { numeric: true })
      );
      setAllLayouts(sorted);
      const found = sorted.find(l => l.id === layout.id);
      if (found) setLayout(found);
      setRunSelections(prev => ({ ...prev, [key]: '' }));
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const unbindRun = async (runIndex) => {
    if (!layout) return;
    try {
      await client.patch('/api/v1/applications/layouts/' + layout.id + '/bind-run', {
        run_index: runIndex,
        warehouse_item_id: null,
      });
      const res = await client.get('/api/v1/applications/' + appId);
      const sorted = (res.data.layouts || []).sort((a, b) =>
        (a.layout_code || '').localeCompare(b.layout_code || '', undefined, { numeric: true })
      );
      setAllLayouts(sorted);
      const found = sorted.find(l => l.id === layout.id);
      if (found) setLayout(found);
    } catch {
      alert('Ошибка');
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal-content" style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal-content" style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: 40 }}>Раскладка не найдена</div>
        </div>
      </div>
    );
  }

  const parts = layout.parts || [];
  const totalQty = parts.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const uniqueTypes = parts.length;
  const totalPartsWeight = parts.reduce((sum, p) => sum + (p.weight || 0) * (p.quantity || 0), 0);
  const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
  const doneCount = runs.filter(Boolean).length;
  const layoutTotal = layout.sheet_count || 1;
  const statusConf = STATUS_OPTIONS.find(s => s.key === appData?.status) || STATUS_OPTIONS[0];
  const hasMultiple = allLayouts.length > 1;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 14 }}>
            {appId}.{layout.layout_code || '?'}
            {hasMultiple && (
              <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>
                {currentIdx + 1}/{allLayouts.length}
              </span>
            )}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '0 12px 12px' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Navigation arrows for multiple layouts */}
          {hasMultiple && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <button
                className="btn"
                onClick={() => goToLayout(currentIdx - 1)}
                disabled={currentIdx === 0}
                style={{ fontSize: 12, padding: '4px 10px', opacity: currentIdx === 0 ? 0.3 : 1 }}
              >
                ← Пред
              </button>
              <div style={{ display: 'flex', gap: 4 }}>
                {allLayouts.map((_, i) => (
                  <div
                    key={i}
                    onClick={() => goToLayout(i)}
                    style={{
                      width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                      background: i === currentIdx ? '#2563eb' : '#cbd5e1',
                    }}
                  />
                ))}
              </div>
              <button
                className="btn"
                onClick={() => goToLayout(currentIdx + 1)}
                disabled={currentIdx === allLayouts.length - 1}
                style={{ fontSize: 12, padding: '4px 10px', opacity: currentIdx === allLayouts.length - 1 ? 0.3 : 1 }}
              >
                След →
              </button>
            </div>
          )}

          {layout.layout_image && (
            <img
              src={layout.layout_image}
              alt={`Раскладка ${appId}.${layout.layout_code}`}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}
            />
          )}

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>
            {totalQty} деталей ({uniqueTypes} типов)
            {totalPartsWeight > 0 && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 8, fontSize: 12 }}>Вес деталей: {totalPartsWeight.toFixed(2)} кг</span>}
          </div>

          {layout.sheet_size && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Лист: {layout.sheet_size} | Вес: {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'} | Листов: {layoutTotal}
            </div>
          )}

          {/* Status change for operators */}
          {appData && canChangeStatus && (
            <div style={{ marginBottom: 12, position: 'relative' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Статус</div>
              <div
                onClick={() => setStatusDropdown(!statusDropdown)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: statusConf.bg, color: statusConf.color,
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
                        padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                        fontWeight: appData.status === s.key ? 600 : 400,
                        background: appData.status === s.key ? s.bg : '#fff',
                        color: appData.status === s.key ? s.color : '#334155',
                      }}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Run progress */}
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
                      onClick={() => canClick && toggleRun(i)}
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

          {/* Warehouse binding */}
          {canBind && layoutTotal >= 1 && (
            <div style={{ marginBottom: 12, padding: 8, background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Привязка к складу</div>
              {Array.from({ length: layoutTotal }, (_, runIdx) => {
                const bindings = layout.warehouse_bindings || {};
                const boundId = bindings[runIdx];
                const isCut = runs[runIdx] || false;
                const selKey = `${layout.id}_${runIdx}`;
                const items = warehouseItems.filter(w => w.sheet_count > 0);
                const showAll = showAllSheets[selKey];
                const matching = items.filter(w => {
                  const gm = !appData?.steel_grade || !w.grade || w.grade.toLowerCase() === appData.steel_grade.toLowerCase();
                  const tm = !appData?.thickness || !w.thickness || w.thickness === appData.thickness;
                  return gm && tm;
                });
                const others = items.filter(w => {
                  const gm = !appData?.steel_grade || !w.grade || w.grade.toLowerCase() === appData.steel_grade.toLowerCase();
                  const tm = !appData?.thickness || !w.thickness || w.thickness === appData.thickness;
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
                          <button onClick={() => unbindRun(runIdx)}
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
                        <button onClick={() => bindRun(runIdx)}
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

          {/* Parts list */}
          {parts.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Детали</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {parts.map((part, pi) => (
                  <div
                    key={pi}
                    onClick={() => part.image_path && setShowPartImage(part)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)',
                      cursor: part.image_path ? 'pointer' : 'default',
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
                        {part.dx} x {part.dy} | x{part.quantity} шт
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Part image zoom */}
      {showPartImage && (
        <div className="modal-overlay active" style={{ zIndex: 1100 }} onClick={(e) => { e.stopPropagation(); setShowPartImage(null); }}>
          <div className="modal-content" style={{ width: '95%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 14 }}>{showPartImage.name}</h3>
              <button className="close-btn" onClick={() => setShowPartImage(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <img src={showPartImage.image_path} alt={showPartImage.name} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 6 }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowPartImage(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
