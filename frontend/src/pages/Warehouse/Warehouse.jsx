import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';

export default function Warehouse() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ metal: '', grade: '', size: '', sheet_count: '', owner: '', note: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchItems = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/warehouse/');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load warehouse', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!form.metal) return;
    try {
      await client.post('/api/v1/warehouse/', {
        metal: form.metal,
        grade: form.grade,
        size: form.size,
        sheet_count: form.sheet_count,
        owner: form.owner,
        note: form.note,
      });
      setForm({ metal: '', grade: '', size: '', sheet_count: '', owner: '', note: '' });
      setShowForm(false);
      fetchItems();
    } catch (err) {
      alert('Ошибка: ' + (typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить запись?')) return;
    try {
      await client.delete('/api/v1/warehouse/' + id);
      fetchItems();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      metal: item.metal || '',
      grade: item.grade || '',
      size: item.size || '',
      sheet_count: item.sheet_count || '',
      owner: item.owner || '',
      note: item.note || '',
    });
  };

  const saveEdit = async (id) => {
    try {
      await client.patch('/api/v1/warehouse/' + id, {
        metal: editForm.metal,
        grade: editForm.grade || null,
        size: editForm.size || null,
        sheet_count: editForm.sheet_count ? parseInt(editForm.sheet_count) : 0,
        owner: editForm.owner || null,
        note: editForm.note || null,
      });
      setEditingId(null);
      fetchItems();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Добавить на склад'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 15 }}>
          <h3>Новая позиция на складе</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Металл *</label>
              <input value={form.metal} onChange={e => setForm({...form, metal: e.target.value})} placeholder="Сталь" />
            </div>
            <div className="form-group">
              <label>Марка</label>
              <input value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} placeholder="Ст3" />
            </div>
            <div className="form-group">
              <label>Размер</label>
              <input value={form.size} onChange={e => setForm({...form, size: e.target.value})} placeholder="1500x6000" />
            </div>
            <div className="form-group">
              <label>Кол-во листов</label>
              <input type="number" value={form.sheet_count} onChange={e => setForm({...form, sheet_count: e.target.value})} placeholder="10" />
            </div>
            <div className="form-group">
              <label>Владелец</label>
              <input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} placeholder="Название компании" />
            </div>
          </div>
          <div className="form-group">
            <label>Примечание</label>
            <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Дополнительно..." />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} style={{ marginTop: 10 }}>Добавить</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Металл</th>
              <th>Марка</th>
              <th>Размер</th>
              <th>Кол-во листов</th>
              <th>Владелец</th>
              <th>Примечание</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Склад пуст</td></tr>
            ) : items.map(item => (
              <tr key={item.id} style={editingId === item.id ? { background: '#f0f9ff' } : {}}>
                {editingId === item.id ? (
                  <>
                    <td><input value={editForm.metal} onChange={e => setEditForm({...editForm, metal: e.target.value})} style={{ width: 80, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><input value={editForm.grade} onChange={e => setEditForm({...editForm, grade: e.target.value})} style={{ width: 60, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><input value={editForm.size} onChange={e => setEditForm({...editForm, size: e.target.value})} style={{ width: 100, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><input value={editForm.sheet_count} onChange={e => setEditForm({...editForm, sheet_count: e.target.value})} style={{ width: 50, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><input value={editForm.owner} onChange={e => setEditForm({...editForm, owner: e.target.value})} style={{ width: 100, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><input value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})} style={{ width: 100, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary" onClick={() => saveEdit(item.id)} style={{ padding: '3px 8px', fontSize: 11 }}>OK</button>
                        <button className="btn" onClick={() => setEditingId(null)} style={{ padding: '3px 8px', fontSize: 11 }}>Отмена</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td><strong>{item.metal}</strong></td>
                    <td>{item.grade || '-'}</td>
                    <td>{item.size || '-'}</td>
                    <td>{item.sheet_count || 0}</td>
                    <td>{item.owner || '-'}</td>
                    <td>{item.note || '-'}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn" onClick={() => startEdit(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Редактировать">✏️</button>
                        <button className="btn" onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', fontSize: 11 }} title="Удалить">🗑️</button>
                      </div>
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
