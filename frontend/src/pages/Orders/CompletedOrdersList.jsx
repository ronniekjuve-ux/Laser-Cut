import React, { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import ApplicationDetail from '../Applications/ApplicationDetail';

export default function CompletedOrdersList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCompleted = useCallback(async (pageNum = page) => {
    try {
      const res = await client.get('/api/v1/applications/', {
        params: { tab: 'orders', status: 'cut', page: pageNum, limit: 15 }
      });
      if (res.data.items) {
        setApplications(res.data.items);
        setTotal(res.data.total);
        setTotalPages(res.data.pages);
      } else {
        setApplications(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load completed orders', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

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
        Выполнено: {total} заказов
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

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
          <button className="btn" onClick={() => { setPage(1); fetchCompleted(1); }} disabled={page <= 1} style={{ fontSize: 12 }}>«</button>
          <button className="btn" onClick={() => { const p = page - 1; setPage(p); fetchCompleted(p); }} disabled={page <= 1} style={{ fontSize: 12 }}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => { setPage(p); fetchCompleted(p); }}
                style={{ fontSize: 12 }}>{p}</button>
            );
          })}
          <button className="btn" onClick={() => { const p = page + 1; setPage(p); fetchCompleted(p); }} disabled={page >= totalPages} style={{ fontSize: 12 }}>›</button>
          <button className="btn" onClick={() => { setPage(totalPages); fetchCompleted(totalPages); }} disabled={page >= totalPages} style={{ fontSize: 12 }}>»</button>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{total} заказов | Стр. {page} из {totalPages}</span>
        </div>
      )}

      {selectedApp && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={() => fetchCompleted()}
        />
      )}
    </div>
  );
}
