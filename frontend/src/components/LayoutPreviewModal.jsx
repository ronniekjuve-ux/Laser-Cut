import { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { key: 'approved', label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  { key: 'in_progress', label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  { key: 'partially_cut', label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  { key: 'cut', label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
];

export default function LayoutPreviewModal({ appId, layoutId, onClose, onStatusChange }) {
  const { user } = useAuth();
  const [layout, setLayout] = useState(null);
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartImage, setShowPartImage] = useState(null);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const canChangeStatus = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + appId, { signal: controller.signal });
        const layouts = res.data.layouts || [];
        const found = layouts.find(l => l.id === layoutId);
        setLayout(found || null);
        setAppData(res.data.application || null);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Failed to load layout', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [appId, layoutId]);

  const changeStatus = async (newStatus) => {
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=' + newStatus);
      setAppData(prev => prev ? { ...prev, status: newStatus } : prev);
      setStatusDropdown(false);
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
  const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
  const doneCount = runs.filter(Boolean).length;
  const layoutTotal = layout.sheet_count || 1;
  const statusConf = STATUS_OPTIONS.find(s => s.key === appData?.status) || STATUS_OPTIONS[0];

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 14 }}>
            {appId}.{layout.layout_code || '?'}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '0 12px 12px' }}>
          {layout.layout_image && (
            <img
              src={layout.layout_image}
              alt={`Раскладка ${appId}.${layout.layout_code}`}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}
            />
          )}

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>
            {totalQty} деталей ({uniqueTypes} типов)
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
          {layoutTotal > 1 && (
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
