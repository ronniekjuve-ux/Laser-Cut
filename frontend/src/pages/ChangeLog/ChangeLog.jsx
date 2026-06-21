import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function ChangeLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const res = await client.get('/api/v1/applications/changelog', { params: { page: p, limit: 15 } });
      const data = res.data;
      setLogs(Array.isArray(data.items) ? data.items : []);
      setTotalPages(data.pages || 0);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load changelog', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const typeLabels = {
    status: 'Статус',
    priority: 'Приоритет',
    comment: 'Заметка',
    create: 'Создание',
    delete: 'Удаление',
    deficit: 'Дефицит',
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Пользователь</th>
              <th>Изменение</th>
              <th>Описание</th>
              <th>Было</th>
              <th>Стало</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  История изменений пуста
                </td>
              </tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap'}}>
                  {log.created_at ? new Date(log.created_at).toLocaleString('ru-RU') : '-'}
                </td>
                <td>{log.user_name || '-'}</td>
                <td>
                  <span className="badge" style={{background: '#eff6ff', color: '#1e40af'}}>
                    {typeLabels[log.change_type] || log.change_type}
                  </span>
                </td>
                <td>
                  {log.resource_id ? (
                    <span
                      onClick={() => navigate('/?highlight=' + log.resource_id)}
                      style={{color: '#1e40af', cursor: 'pointer', textDecoration: 'underline'}}
                    >
                      {log.description || '-'}
                    </span>
                  ) : (log.description || '-')}
                </td>
                <td style={{color: '#ef4444'}}>{log.old_value || '-'}</td>
                <td style={{color: '#16a34a'}}>{log.new_value || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center'}}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{fontSize: 12}}>«</button>
          <button className="btn" onClick={() => setPage(page - 1)} disabled={page <= 1} style={{fontSize: 12}}>‹</button>
          {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => setPage(p)} style={{fontSize: 12}}>
                {p}
              </button>
            );
          })}
          <button className="btn" onClick={() => setPage(page + 1)} disabled={page >= totalPages} style={{fontSize: 12}}>›</button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{fontSize: 12}}>»</button>
          <span style={{fontSize: 12, color: '#64748b', marginLeft: 8}}>Всего: {total}</span>
        </div>
      )}
    </div>
  );
}
