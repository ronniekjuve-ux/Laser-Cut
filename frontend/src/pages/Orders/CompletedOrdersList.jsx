import React, { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import ApplicationDetail from '../Applications/ApplicationDetail';

export default function CompletedOrdersList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);

  const fetchCompleted = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/applications/', { params: { tab: 'orders', limit: 100 } });
      const items = res.data.items || (Array.isArray(res.data) ? res.data : []);
      setApplications(items.filter(app => app.status === 'cut'));
    } catch (err) {
      console.error('Failed to load completed orders', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompleted(); }, [fetchCompleted]);

  const handleCancelCut = async (e, appId) => {
    e.stopPropagation();
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=approved');
      fetchCompleted();
    } catch {
      alert('Ошибка');
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
        Выполнено: {applications.length} заказов
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Заказчик</th>
              <th>Станок</th>
              <th>Материал</th>
              <th>Толщ.</th>
              <th>Дав. мат</th>
              <th>Поступил</th>
              <th>Выполнена</th>
              <th>Оператор</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map(app => (
              <tr key={app.id} onClick={() => setSelectedApp(app)} style={{ cursor: 'pointer', opacity: 0.7 }}>
                <td style={{ fontWeight: 600, color: '#64748b' }}>#{app.id}</td>
                <td>{app.customer}</td>
                <td>{app.machine}</td>
                <td>{app.steel_grade || app.material}</td>
                <td>{app.thickness}</td>
                <td>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: app.supply_material === true ? '#d1fae5' : app.supply_material === false ? '#fee2e2' : '#f1f5f9',
                    color: app.supply_material === true ? '#047857' : app.supply_material === false ? '#b91c1c' : '#94a3b8',
                  }}>
                    {app.supply_material === true ? 'Да' : app.supply_material === false ? 'Нет' : '—'}
                  </span>
                </td>
                <td>{app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : ''}</td>
                <td>{app.cut_at ? new Date(app.cut_at).toLocaleDateString('ru-RU') : ''}</td>
                <td>{app.cut_by || ''}</td>
                <td>
                  <button
                    className="btn"
                    onClick={(e) => handleCancelCut(e, app.id)}
                    title="Вернуть в заказы"
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    ↩️
                  </button>
                </td>
              </tr>
            ))}
            {applications.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                  Нет выполненных заказов
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedApp && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={fetchCompleted}
        />
      )}
    </div>
  );
}
