import React, { useState, useEffect } from 'react';
import client from '../../api/client';

const STATUS_LABELS = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      const res = await client.get('/orders/', { params });
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchOrders(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleDelete = async (e, orderId) => {
    e.stopPropagation();
    if (!window.confirm('Удалить заказ?')) return;
    try {
      await client.delete('/orders/' + orderId);
      fetchOrders();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Поиск по номеру, заказчику..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Заказчик</th>
              <th>Объект</th>
              <th>Марка</th>
              <th>Статус</th>
              <th>Версия</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id} onClick={() => setSelectedOrder(order)} style={{cursor: 'pointer'}}>
                <td><b>{order.number}</b></td>
                <td>{order.customer}</td>
                <td>{order.object || '-'}</td>
                <td>{order.steel_grade}</td>
                <td>
                  <span className={'badge ' + (
                    order.status === 'completed' ? 'bg-done' :
                    order.status === 'in_progress' ? 'bg-work' : 'bg-queue'
                  )}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </td>
                <td>v{order.active_version || 1}</td>
                <td style={{fontFamily: 'monospace', fontSize: 12}}>
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : '-'}
                </td>
                <td>
                  <button className="btn btn-danger" onClick={(e) => handleDelete(e, order.id)}
                    style={{padding: '4px 8px', fontSize: 11}}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  Нет заказов
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="modal-overlay active" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Заказ {selectedOrder.number}</h3>
              <button className="close-btn" onClick={() => setSelectedOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                <div><b>Заказчик:</b> {selectedOrder.customer}</div>
                <div><b>Объект:</b> {selectedOrder.object || '-'}</div>
                <div><b>Марка стали:</b> {selectedOrder.steel_grade}</div>
                <div><b>Статус:</b> {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}</div>
                <div><b>Активная версия:</b> v{selectedOrder.active_version || 1}</div>
                <div><b>Дата создания:</b> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString('ru-RU') : '-'}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSelectedOrder(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
