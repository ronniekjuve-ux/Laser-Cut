import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = { complaint: 'Жалоба', suggestion: 'Предложение' };
const STATUS_LABELS = { new: 'Новый', processing: 'В работе', resolved: 'Решено' };
const STATUS_COLORS = { new: '#ef4444', processing: '#f59e0b', resolved: '#10b981' };

export default function Feedback() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'director';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'suggestion', text: '' });
  const [respondingId, setRespondingId] = useState(null);
  const [responseText, setResponseText] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/feedback/');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load feedback', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSubmit = async () => {
    if (!form.text.trim()) return;
    try {
      await client.post('/api/v1/feedback/', { type: form.type, text: form.text });
      setForm({ type: 'suggestion', text: '' });
      setShowForm(false);
      fetchItems();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await client.patch('/api/v1/feedback/' + id, { status: newStatus });
      fetchItems();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const handleRespond = async (id) => {
    if (!responseText.trim()) return;
    try {
      await client.patch('/api/v1/feedback/' + id, { admin_response: responseText, status: 'processing' });
      setRespondingId(null);
      setResponseText('');
      fetchItems();
    } catch (err) {
      alert('Ошибка');
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Оставить отзыв'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Новый отзыв</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                className={'btn' + (form.type === key ? ' btn-primary' : '')}
                onClick={() => setForm({ ...form, type: key })}
              >
                {key === 'complaint' ? '⚠️' : '💡'} {label}
              </button>
            ))}
          </div>
          <div className="form-group">
            <label>Текст *</label>
            <textarea
              value={form.text}
              onChange={e => setForm({ ...form, text: e.target.value })}
              placeholder="Опишите вашу жалобу или предложение..."
              rows={4}
              style={{ width: '100%', padding: 8, border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleSubmit} style={{ marginTop: 8 }}>Отправить</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Текст</th>
              {isAdmin && <th>Автор</th>}
              <th>Статус</th>
              <th>Ответ</th>
              <th>Дата</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет отзывов</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td>
                  <span style={{ fontWeight: 600 }}>
                    {item.type === 'complaint' ? '⚠️ Жалоба' : '💡 Предложение'}
                  </span>
                </td>
                <td style={{ maxWidth: 300, whiteSpace: 'pre-wrap', fontSize: 13 }}>{item.text}</td>
                {isAdmin && <td style={{ fontSize: 12, color: '#64748b' }}>{item.username}</td>}
                <td>
                  {isAdmin ? (
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      style={{
                        padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0',
                        fontSize: 11, fontWeight: 600, color: STATUS_COLORS[item.status],
                        cursor: 'pointer', background: 'white'
                      }}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: STATUS_COLORS[item.status] + '20',
                      color: STATUS_COLORS[item.status]
                    }}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  )}
                </td>
                <td style={{ maxWidth: 200, fontSize: 12, color: '#64748b' }}>
                  {item.admin_response || '—'}
                </td>
                <td style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}
                </td>
                {isAdmin && (
                  <td>
                    {respondingId === item.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <textarea
                          value={responseText}
                          onChange={e => setResponseText(e.target.value)}
                          placeholder="Ответ..."
                          rows={2}
                          style={{ width: 150, padding: 4, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, resize: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" onClick={() => handleRespond(item.id)} style={{ padding: '2px 6px', fontSize: 10 }}>OK</button>
                          <button className="btn" onClick={() => { setRespondingId(null); setResponseText(''); }} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn" onClick={() => { setRespondingId(item.id); setResponseText(item.admin_response || ''); }} style={{ padding: '3px 8px', fontSize: 11 }} title="Ответить">
                        💬
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
