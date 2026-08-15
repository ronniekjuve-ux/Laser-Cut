import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';

export default function TrashPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchTrash = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await client.get('/api/v1/applications/trash/list', { params: { page: p, limit: 50 } });
      setItems(res.data.items || []);
      setTotalPages(res.data.pages || 0);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to load trash', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrash(page); }, [page, fetchTrash]);

  const handleRestore = async (deletedId) => {
    setConfirmAction(null);
    try {
      await client.post('/api/v1/applications/trash/restore/' + deletedId);
      fetchTrash(page);
    } catch (err) {
      alert('Ошибка восстановления: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handlePermanentDelete = async (deletedId) => {
    setConfirmAction(null);
    try {
      await client.delete('/api/v1/applications/trash/delete/' + deletedId);
      fetchTrash(page);
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleClearAll = async () => {
    setConfirmAction(null);
    try {
      await client.delete('/api/v1/applications/trash/clear');
      fetchTrash(1);
    } catch (err) {
      alert('Ошибка очистки');
    }
  };

  const statusLabels = {
    pending: 'Ожидает',
    approved: 'В очереди',
    rejected: 'Отклонена',
    in_progress: 'В резке',
    partially_cut: 'Частично вырезано',
    cut: 'Вырезано',
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>В корзине: {total} записей</span>
        {total > 0 && (
          <button
            className="btn btn-danger"
            onClick={() => setConfirmAction({ type: 'clearAll' })}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            🗑️ Очистить корзину
          </button>
        )}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Заказ</th>
              <th>Заказчик</th>
              <th>Материал</th>
              <th>Толщ.</th>
              <th>Статус</th>
              <th>Удалил</th>
              <th>Время удаления</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                  Корзина пуста
                </td>
              </tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600, color: '#64748b' }}>#{item.original_id}</td>
                <td>{item.order_name || '-'}</td>
                <td>{item.customer_id || '-'}</td>
                <td>{item.steel_grade || item.material || '-'}</td>
                <td>{item.thickness} мм</td>
                <td>
                  <span className="badge" style={{
                    background: item.status === 'cut' ? '#dcfce7' : '#fef3c7',
                    color: item.status === 'cut' ? '#166534' : '#92400e',
                  }}>
                    {statusLabels[item.status] || item.status}
                  </span>
                </td>
                <td>{item.deleted_by}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {item.deleted_at ? new Date(item.deleted_at).toLocaleString('ru-RU') : '-'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn"
                      onClick={() => handleRestore(item.id)}
                      title="Восстановить"
                      style={{ padding: '3px 8px', fontSize: 11, background: '#d1fae5', color: '#047857', border: '1px solid #86efac' }}
                    >
                      ↩ Восстановить
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => setConfirmAction({ type: 'permanentDelete', id: item.id, name: item.order_name })}
                      title="Удалить навсегда"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: 12 }}>«</button>
          <button className="btn" onClick={() => setPage(page - 1)} disabled={page <= 1} style={{ fontSize: 12 }}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => setPage(p)} style={{ fontSize: 12 }}>
                {p}
              </button>
            );
          })}
          <button className="btn" onClick={() => setPage(page + 1)} disabled={page >= totalPages} style={{ fontSize: 12 }}>›</button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ fontSize: 12 }}>»</button>
        </div>
      )}

      {confirmAction && (
        <div className="modal-overlay active" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; setConfirmAction(null); } }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Подтверждение</h3>
              <button className="close-btn" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; setConfirmAction(null); } }}>✕</button>
            </div>
            <div className="modal-body">
              {confirmAction.type === 'clearAll' && (
                <p>Очистить всю корзину? Все записи будут удалены безвозвратно.</p>
              )}
              {confirmAction.type === 'permanentDelete' && (
                <p>Удалить навсегда заявку "{confirmAction.name}"? Это действие необратимо.</p>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirmAction.type === 'clearAll') handleClearAll();
                  else if (confirmAction.type === 'permanentDelete') handlePermanentDelete(confirmAction.id);
                }}
              >
                {confirmAction.type === 'clearAll' ? 'Очистить' : 'Удалить'}
              </button>
              <button className="btn" onMouseDown={e => e.target === e.currentTarget && (window.__overlayMouseDownTarget = e.currentTarget)} onMouseUp={e => { if (e.target === e.currentTarget && window.__overlayMouseDownTarget === e.currentTarget) { window.__overlayMouseDownTarget = null; setConfirmAction(null); } }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
