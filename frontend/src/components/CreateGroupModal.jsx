import { useState } from 'react';
import client from '../api/client';

export default function CreateGroupModal({ appIds, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await client.post('/api/v1/applications/group', {
        app_ids: appIds,
        name: name || null
      });
      if (onCreated) onCreated(res.data.group_id);
      onClose();
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400}}>
        <div className="modal-header">
          <h3>Создать группу</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          <div style={{marginBottom: 12, fontSize: 13, color: '#64748b'}}>
            Выбрано заявок: <strong>{appIds.length}</strong>
          </div>
          <label style={{display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500}}>
            Название группы (необязательно)
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: Промстальмаш 16мм"
            style={{
              width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 13, boxSizing: 'border-box'
            }}
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Создание...' : 'Создать'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
