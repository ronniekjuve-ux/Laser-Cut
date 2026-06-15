import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Deficit() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ material: '', thickness: '', size: '', qty: '', customer: '', note: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchDeficit = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/applications/deficit');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load deficit', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeficit(); }, [fetchDeficit]);

  const handleAdd = async () => {
    if (!form.material) return;
    try {
      await client.post('/api/v1/applications/deficit', {
        material: form.material,
        thickness: form.thickness,
        size: form.size,
        quantity: form.qty,
        customer_name: form.customer,
        note: form.note,
      });
      setForm({ material: '', thickness: '', size: '', qty: '', customer: '', note: '' });
      setShowForm(false);
      fetchDeficit();
    } catch (err) {
      alert('Ошибка: ' + (typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.response?.data?.detail?.[0]?.msg || err.message));
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'resolved' ? 'pending' : 'resolved';
    try {
      await client.patch('/api/v1/applications/deficit/' + id + '/resolve?status=' + newStatus);
      fetchDeficit();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      material: item.material || '',
      thickness: item.thickness || '',
      size: item.size || '',
      quantity: item.quantity || '',
      customer_name: item.customer_name || '',
      note: item.note || ''
    });
  };

  const saveEdit = async (id) => {
    try {
      await client.patch('/api/v1/applications/deficit/' + id, {
        material: editForm.material,
        thickness: editForm.thickness ? parseFloat(editForm.thickness) : null,
        size: editForm.size || null,
        quantity: editForm.quantity ? parseInt(editForm.quantity) : null,
        customer_name: editForm.customer_name || null,
        note: editForm.note || null
      });
      setEditingId(null);
      fetchDeficit();
    } catch (err) {
      alert('Ошибка: ' + (typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.response?.data?.detail?.[0]?.msg || err.message));
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Заявить о нехватке'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom: 15}}>
          <h3>Новая заявка о дефиците</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Материал</label>
              <input value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="Steel" />
            </div>
            <div className="form-group">
              <label>Толщина, мм</label>
              <input value={form.thickness} onChange={e => setForm({...form, thickness: e.target.value})} placeholder="2.0" />
            </div>
            <div className="form-group">
              <label>Размер</label>
              <input value={form.size} onChange={e => setForm({...form, size: e.target.value})} placeholder="1500x6000" />
            </div>
            <div className="form-group">
              <label>Количество</label>
              <input type="number" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} placeholder="15" />
            </div>
            <div className="form-group">
              <label>Заказчик</label>
              <input value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} placeholder="Название компании" />
            </div>
          </div>
          <div className="form-group">
            <label>Примечание</label>
            <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Дополнительно..." />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} style={{marginTop: 10}}>Добавить</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Толщ.</th>
              <th>Размер</th>
              <th>Кол-во</th>
              <th>Заказчик</th>
              <th>Примечание</th>
              <th>Сообщил</th>
              <th>Статус</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={10} style={{textAlign: 'center', padding: 20}}>Нет заявок о дефиците</td></tr>
            ) : items.map(item => (
              <tr key={item.id} style={editingId === item.id ? {background: '#f0f9ff'} : {}}>
                {editingId === item.id ? (
                  <>
                    <td><input value={editForm.material} onChange={e => setEditForm({...editForm, material: e.target.value})} style={{width: 80, padding: '2px 4px', fontSize: 12}} /></td>
                    <td><input value={editForm.thickness} onChange={e => setEditForm({...editForm, thickness: e.target.value})} style={{width: 50, padding: '2px 4px', fontSize: 12}} /></td>
                    <td><input value={editForm.size} onChange={e => setEditForm({...editForm, size: e.target.value})} style={{width: 100, padding: '2px 4px', fontSize: 12}} /></td>
                    <td><input value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: e.target.value})} style={{width: 50, padding: '2px 4px', fontSize: 12}} /></td>
                    <td><input value={editForm.customer_name} onChange={e => setEditForm({...editForm, customer_name: e.target.value})} style={{width: 100, padding: '2px 4px', fontSize: 12}} /></td>
                    <td><input value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})} style={{width: 100, padding: '2px 4px', fontSize: 12}} /></td>
                    <td>{item.created_by || '-'}</td>
                    <td>
                      <span className={'badge ' + (item.status === 'resolved' ? 'bg-done' : 'bg-queue')}>
                        {item.status === 'resolved' ? 'Решено' : 'Ожидает'}
                      </span>
                    </td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <div style={{display: 'flex', gap: 4}}>
                        <button className="btn btn-primary" onClick={() => saveEdit(item.id)} style={{padding: '3px 8px', fontSize: 11}}>OK</button>
                        <button className="btn" onClick={() => setEditingId(null)} style={{padding: '3px 8px', fontSize: 11}}>Отмена</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{item.material}</td>
                    <td>{item.thickness || '-'}</td>
                    <td>{item.size || '-'}</td>
                    <td>{item.quantity || '-'}</td>
                    <td>{item.customer_name || '-'}</td>
                    <td>{item.note || '-'}</td>
                    <td>{item.created_by || '-'}</td>
                    <td>
                      <span
                        onClick={() => handleToggleStatus(item.id, item.status)}
                        className={'badge ' + (item.status === 'resolved' ? 'bg-done' : 'bg-queue')}
                        style={{cursor: 'pointer'}}
                        title="Нажмите для смены статуса"
                      >
                        {item.status === 'resolved' ? 'Решено' : 'Ожидает'}
                      </span>
                    </td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <button className="btn" onClick={() => startEdit(item)} style={{padding: '3px 8px', fontSize: 11}} title="Редактировать">
                        ✏️
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
