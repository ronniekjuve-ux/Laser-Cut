import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [responseImageFile, setResponseImageFile] = useState(null);
  const [responseImagePreview, setResponseImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const responseFileInputRef = useRef(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const [filterType, setFilterType] = useState([]);
  const [filterStatus, setFilterStatus] = useState([]);
  const [filterAuthor, setFilterAuthor] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [allAuthors, setAllAuthors] = useState([]);
  const [allTypes] = useState(Object.entries(TYPE_LABELS));
  const [allStatuses] = useState(Object.entries(STATUS_LABELS));

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/api/v1/feedback/', {
        params: { page, limit: 15, sort_by: sortBy, sort_dir: sortDir }
      });
      const data = res.data;
      const fetchedItems = data.items || [];
      setItems(fetchedItems);
      setTotal(data.total || 0);
      setTotalPages(data.pages || 1);

      if (isAdmin) {
        const authors = [...new Set(fetchedItems.map(i => i.username))];
        setAllAuthors(prev => [...new Set([...prev, ...authors])]);
      }
    } catch (err) {
      console.error('Failed to load feedback', err);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, isAdmin]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => { setPage(1); }, [sortBy, sortDir, filterType, filterStatus, filterAuthor]);

  const toggleFilter = (arr, setArr, val) => {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const filteredItems = items.filter(item => {
    if (filterType.length > 0 && !filterType.includes(item.type)) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(item.status)) return false;
    if (filterAuthor.length > 0 && !filterAuthor.includes(item.username)) return false;
    return true;
  });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!form.text.trim()) return;
    setUploading(true);
    try {
      let imageUrl = null;
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        const uploadRes = await client.post('/api/v1/feedback/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        imageUrl = uploadRes.data.url;
      }
      await client.post('/api/v1/feedback/', { type: form.type, text: form.text, image_url: imageUrl });
      setForm({ type: 'suggestion', text: '' });
      setImageFile(null);
      setImagePreview(null);
      setShowForm(false);
      fetchItems();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
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

  const handleDelete = async (id) => {
    if (!confirm('Удалить отзыв?')) return;
    try {
      await client.delete('/api/v1/feedback/' + id);
      fetchItems();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleRespond = async (id) => {
    if (!responseText.trim() && !responseImageFile) return;
    setUploading(true);
    try {
      let imageUrl = null;
      if (responseImageFile) {
        const formData = new FormData();
        formData.append('file', responseImageFile);
        const uploadRes = await client.post('/api/v1/feedback/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        imageUrl = uploadRes.data.url;
      }
      await client.patch('/api/v1/feedback/' + id, {
        admin_response: responseText,
        admin_response_image: imageUrl,
        status: 'processing'
      });
      setRespondingId(null);
      setResponseText('');
      setResponseImageFile(null);
      setResponseImagePreview(null);
      fetchItems();
    } catch (err) {
      alert('Ошибка');
    } finally {
      setUploading(false);
    }
  };

  const hasActiveFilters = filterType.length > 0 || filterStatus.length > 0 || filterAuthor.length > 0;

  if (loading && items.length === 0) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Оставить отзыв'}
        </button>
        <button
          className={'btn' + (showFilters ? ' btn-primary' : '')}
          onClick={() => setShowFilters(!showFilters)}
        >
          🔍 Фильтры {hasActiveFilters && <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', padding: '0 5px', fontSize: 10, marginLeft: 4 }}>{filterType.length + filterStatus.length + filterAuthor.length}</span>}
        </button>
        {hasActiveFilters && (
          <button
            className="btn"
            onClick={() => { setFilterType([]); setFilterStatus([]); setFilterAuthor([]); }}
            style={{ fontSize: 12, color: '#ef4444' }}
          >
            ✕ Сбросить
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasActiveFilters ? `${filteredItems.length} из ${total}` : `Всего: ${total}`}
        </span>
      </div>

      {showFilters && (
        <div style={{ background: 'white', borderRadius: 8, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Тип</div>
            {allTypes.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={filterType.includes(key)}
                  onChange={() => toggleFilter(filterType, setFilterType, key)}
                />
                {key === 'complaint' ? '⚠️' : '💡'} {label}
              </label>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Статус</div>
            {allStatuses.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={filterStatus.includes(key)}
                  onChange={() => toggleFilter(filterStatus, setFilterStatus, key)}
                />
                <span style={{ color: STATUS_COLORS[key] }}>{label}</span>
              </label>
            ))}
          </div>
          {isAdmin && allAuthors.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Автор</div>
              {allAuthors.map(author => (
                <label key={author} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={filterAuthor.includes(author)}
                    onChange={() => toggleFilter(filterAuthor, setFilterAuthor, author)}
                  />
                  {author}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
          <div style={{ marginTop: 8 }}>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
              style={{ marginBottom: 8 }}
            >
              📷 Прикрепить изображение
            </button>
            {imagePreview && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={imagePreview}
                  alt="Превью"
                  style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  style={{
                    position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff',
                    border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer',
                    fontSize: 12, lineHeight: '20px', textAlign: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading} style={{ marginTop: 8 }}>
            {uploading ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Текст</th>
              <th>Фото</th>
              {isAdmin && <th>Автор</th>}
              <th>Статус</th>
              <th>Ответ</th>
              <th>Дата</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                {hasActiveFilters ? 'Нет отзывов по фильтрам' : 'Нет отзывов'}
              </td></tr>
            ) : filteredItems.map(item => (
              <tr key={item.id}>
                <td>
                  <span style={{ fontWeight: 600 }}>
                    {item.type === 'complaint' ? '⚠️ Жалоба' : '💡 Предложение'}
                  </span>
                </td>
                <td style={{ maxWidth: 300, whiteSpace: 'pre-wrap', fontSize: 13 }}>{item.text}</td>
                <td>
                  {item.image_url ? (
                    <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={item.image_url}
                        alt="Фото"
                        style={{ maxWidth: 60, maxHeight: 60, borderRadius: 4, border: '1px solid #e2e8f0', cursor: 'pointer' }}
                      />
                    </a>
                  ) : '—'}
                </td>
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
                  {item.admin_response_image && (
                    <div style={{ marginTop: 4 }}>
                      <a href={item.admin_response_image} target="_blank" rel="noopener noreferrer">
                        <img
                          src={item.admin_response_image}
                          alt="Фото ответа"
                          style={{ maxWidth: 60, maxHeight: 60, borderRadius: 4, border: '1px solid #e2e8f0', cursor: 'pointer' }}
                        />
                      </a>
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}
                </td>
                {!isAdmin && item.user_id === user?.id && (
                  <td>
                    <button className="btn" onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', fontSize: 11, color: '#ef4444' }} title="Удалить">
                      🗑️
                    </button>
                  </td>
                )}
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
                        <input
                          type="file"
                          accept="image/*"
                          ref={responseFileInputRef}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setResponseImageFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () => setResponseImagePreview(reader.result);
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        <button
                          className="btn"
                          onClick={() => responseFileInputRef.current?.click()}
                          style={{ padding: '2px 6px', fontSize: 10 }}
                        >
                          📷 Фото
                        </button>
                        {responseImagePreview && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img
                              src={responseImagePreview}
                              alt="Превью"
                              style={{ maxWidth: 100, maxHeight: 80, borderRadius: 4, border: '1px solid #e2e8f0' }}
                            />
                            <button
                              onClick={() => { setResponseImageFile(null); setResponseImagePreview(null); }}
                              style={{
                                position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff',
                                border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer',
                                fontSize: 10, lineHeight: '16px', textAlign: 'center'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" onClick={() => handleRespond(item.id)} disabled={uploading} style={{ padding: '2px 6px', fontSize: 10 }}>
                            {uploading ? '...' : 'OK'}
                          </button>
                          <button className="btn" onClick={() => { setRespondingId(null); setResponseText(''); setResponseImageFile(null); setResponseImagePreview(null); }} style={{ padding: '2px 6px', fontSize: 10 }}>✕</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn" onClick={() => { setRespondingId(item.id); setResponseText(item.admin_response || ''); }} style={{ padding: '3px 8px', fontSize: 11 }} title="Ответить">
                          💬
                        </button>
                        <button className="btn" onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', fontSize: 11, color: '#ef4444' }} title="Удалить">
                          🗑️
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: 12 }}>«</button>
          <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ fontSize: 12 }}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => setPage(p)}
                style={{ fontSize: 12 }}
              >
                {p}
              </button>
            );
          })}
          <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ fontSize: 12 }}>›</button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ fontSize: 12 }}>»</button>
        </div>
      )}
    </div>
  );
}
