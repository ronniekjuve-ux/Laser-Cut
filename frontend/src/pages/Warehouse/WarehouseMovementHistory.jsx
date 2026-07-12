import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function WarehouseMovementHistory({ item, onClose }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get(`/api/v1/warehouse/${item.id}/movements`)
      .then(res => setMovements(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error('Failed to load movements', err))
      .finally(() => setLoading(false));
  }, [item.id]);

  const typeLabels = {
    initial: { text: 'Создание', color: '#64748b', bg: '#f1f5f9' },
    deduction: { text: 'Списание', color: '#92400e', bg: '#fef3c7' },
    return: { text: 'Возврат', color: '#166534', bg: '#dcfce7' },
    manual_adjustment: { text: 'Корректировка', color: '#1d4ed8', bg: '#dbeafe' },
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>История движения</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: 8, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            <strong>{item.metal}</strong> {item.grade ? `/ ${item.grade}` : ''} — {item.sheet_w && item.sheet_h ? `${item.sheet_w}x${item.sheet_h}` : item.size}
            <span style={{ marginLeft: 8, color: '#64748b' }}>Остаток: {item.sheet_count} листов</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Загрузка...</div>
          ) : movements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет записей о движении</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {movements.map(m => {
                const tl = typeLabels[m.movement_type] || typeLabels.manual_adjustment;
                return (
                  <div key={m.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '8px 0', borderBottom: '1px solid #f1f5f9'
                  }}>
                    <div style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: tl.bg, color: tl.color, whiteSpace: 'nowrap', flexShrink: 0
                    }}>
                      {tl.text}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: m.quantity_change > 0 ? '#166534' : '#dc2626' }}>
                          {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                        </span> листов
                        {m.application_id && (
                          <span style={{ color: '#64748b', marginLeft: 6 }}>заявка #{m.application_id}</span>
                        )}
                      </div>
                      {m.reason && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{m.reason}</div>
                      )}
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {m.created_by && <span>{m.created_by} · </span>}
                        {m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
