import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function WarehouseDeductModal({ item, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [layoutId, setLayoutId] = useState('');
  const [reason, setReason] = useState('');
  const [applications, setApplications] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    client.get('/api/v1/applications/', { params: { tab: 'orders', limit: 200 } })
      .then(res => {
        const apps = (res.data.items || res.data || []).filter(a => a.status !== 'cut' && a.status !== 'rejected');
        setApplications(apps);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!applicationId) {
      setLayouts([]);
      setLayoutId('');
      return;
    }
    client.get('/api/v1/applications/' + applicationId)
      .then(res => {
        const l = (res.data.layouts || []).filter(l => l.status === 'active');
        setLayouts(l);
      })
      .catch(() => {});
  }, [applicationId]);

  useEffect(() => {
    if (layoutId && layouts.length > 0) {
      const layout = layouts.find(l => String(l.id) === String(layoutId));
      if (layout) {
        setQuantity(String(layout.sheet_count || 1));
      }
    }
  }, [layoutId, layouts]);

  const handleSubmit = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) return alert('Укажите количество');
    if (qty > item.sheet_count) return alert(`На складе только ${item.sheet_count} листов`);

    setLoading(true);
    try {
      await client.post(`/api/v1/warehouse/${item.id}/deduct`, {
        quantity: qty,
        application_id: applicationId ? parseInt(applicationId) : null,
        layout_id: layoutId ? parseInt(layoutId) : null,
        reason: reason || null,
      });
      onSuccess();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const selectedLayout = layouts.find(l => String(l.id) === String(layoutId));

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>Списание со склада</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 16 }}>
            <div>
              <strong>{item.metal}</strong> {item.grade ? `/ ${item.grade}` : ''} {item.thickness ? `${item.thickness}мм` : ''} — {item.sheet_w && item.sheet_h ? `${item.sheet_w}x${item.sheet_h}` : item.size}
            </div>
            {item.article && <div style={{ fontSize: 12, color: '#64748b' }}>Артикул: {item.article}</div>}
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              На складе: <strong>{item.sheet_count}</strong> листов
              {item.weight && <span>, Вес: {item.weight} кг/лист</span>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Заявка</label>
            <select
              value={applicationId}
              onChange={e => setApplicationId(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            >
              <option value="">Без привязки</option>
              {applications.map(a => (
                <option key={a.id} value={a.id}>
                  {a.order_name} — {a.customer} ({a.material}, {a.thickness}мм)
                </option>
              ))}
            </select>
          </div>

          {layouts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Раскладка</label>
              <select
                value={layoutId}
                onChange={e => setLayoutId(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              >
                <option value="">Все раскладки</option>
                {layouts.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.layout_code} — {l.sheet_size} ({l.sheet_count} листов, {l.machine_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Количество листов *</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              min={1}
              max={item.sheet_count}
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {selectedLayout && item.weight && (
            <div style={{ padding: 8, background: '#eff6ff', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#1d4ed8' }}>
              Вес раскроя: {selectedLayout.sheet_weight ? `${selectedLayout.sheet_weight} кг` : 'неизвестен'}
              <br/>
              Вес листа: {item.weight} кг
              {selectedLayout.sheet_weight && item.weight > selectedLayout.sheet_weight && (
                <span style={{ color: '#92400e', marginLeft: 4 }}>
                  (остаток ~{(item.weight - selectedLayout.sheet_weight).toFixed(1)} кг)
                </span>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Причина (необязательно)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Например: резка заявки #123"
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Списание...' : 'Списать'}
            </button>
            <button className="btn" onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
