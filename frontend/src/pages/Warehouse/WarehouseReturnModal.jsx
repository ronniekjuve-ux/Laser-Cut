import { useState } from 'react';
import client from '../../api/client';

export default function WarehouseReturnModal({ item, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) return alert('Укажите количество');

    setLoading(true);
    try {
      await client.post(`/api/v1/warehouse/${item.id}/return`, {
        quantity: qty,
        reason: reason || null,
      });
      onSuccess();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>Возврат на склад</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 6, marginBottom: 16 }}>
            <strong>{item.metal}</strong> {item.grade ? `/ ${item.grade}` : ''} — {item.sheet_w && item.sheet_h ? `${item.sheet_w}x${item.sheet_h}` : item.size}
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Сейчас на складе: <strong>{item.sheet_count}</strong> листов
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Количество листов *</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              min={1}
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Причина (необязательно)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Например: отмена заявки"
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={handleSubmit}
              disabled={loading}
              style={{ flex: 1, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 600 }}
            >
              {loading ? 'Возврат...' : 'Вернуть на склад'}
            </button>
            <button className="btn" onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
