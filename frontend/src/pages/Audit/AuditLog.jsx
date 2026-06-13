import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await client.get('/audit/logs');
        setLogs(Array.isArray(res.data) ? res.data : res.data.items || []);
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => l.resource === filter);

  if (loading) return <div className="loading">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>;

  return (
    <div>
      <div className="toolbar">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{padding: '9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13}}
        >
          <option value="all">{'\u0412\u0441\u0435'}</option>
          <option value="user">{'\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438'}</option>
          <option value="application">{'\u0417\u0430\u044f\u0432\u043a\u0438'}</option>
          <option value="order">{'\u0417\u0430\u043a\u0430\u0437\u044b'}</option>
        </select>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{'\u0412\u0440\u0435\u043c\u044f'}</th>
              <th>{'\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c'}</th>
              <th>{'\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435'}</th>
              <th>{'\u0420\u0435\u0441\u0443\u0440\u0441'}</th>
              <th>{'\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={log.id || i}>
                <td style={{fontFamily: 'monospace', fontSize: 12}}>
                  {log.created_at_display || (log.created_at ? new Date(log.created_at).toLocaleString('ru-RU') : '-')}
                </td>
                <td>{log.user_id || log.username || '-'}</td>
                <td>{log.action || '-'}</td>
                <td>{log.resource || '-'}</td>
                <td>{log.details || log.changes || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  {'\u0416\u0443\u0440\u043d\u0430\u043b \u043f\u0443\u0441\u0442'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}