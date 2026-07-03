import { useState, useEffect } from 'react';
import client from '../api/client';

export default function LayoutPreviewModal({ appId, layoutId, onClose }) {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const fetchLayout = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + appId, { signal: controller.signal });
        const layouts = res.data.layouts || [];
        const found = layouts.find(l => l.id === layoutId);
        setLayout(found || null);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Failed to load layout', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLayout();
    return () => controller.abort();
  }, [appId, layoutId]);

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
              Лист: {layout.sheet_size} | Вес: {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'} | Листов: {layout.sheet_count || 1}
            </div>
          )}

          {parts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {parts.map((part, pi) => (
                <div
                  key={pi}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)',
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
          )}
        </div>
      </div>
    </div>
  );
}
