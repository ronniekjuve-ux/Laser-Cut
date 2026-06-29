import { useState } from 'react';
import client from '../../api/client';

const ROLES = [
  { value: 'admin', label: 'Администратор' },
  { value: 'director', label: 'Директор' },
  { value: 'operator', label: 'Оператор' },
  { value: 'customer', label: 'Заказчик' },
  { value: 'accountant', label: 'Бухгалтер' },
];

export default function CreateUserModal({ onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Логин и пароль обязательны');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.post('/users/', {
        username: username.trim(),
        password: password,
        role: role,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>Новый пользователь</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Логин</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Введите логин"
              autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Пароль</label>
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Введите пароль"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Роль</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Создание...' : 'Создать'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
