import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

export default function ChangeLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await client.get('/api/v1/applications/changelog');
        setLogs(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load changelog', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

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
    </div>
  );
}
