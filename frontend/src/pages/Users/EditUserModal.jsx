import { useState } from 'react';
import client from '../../api/client';

const ROLES = [
  { value: 'admin', label: 'Администратор' },
  { value: 'director', label: 'Директор' },
  { value: 'operator', label: 'Оператор' },
  { value: 'customer', label: 'Заказчик' },
  { value: 'accountant', label: 'Бухгалтер' },
];

export default function EditUserModal({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const saveRole = async () => {
    setSaving(true);
    setError('');
    try {
      await client.patch('/users/' + user.id, { role });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!newPassword.trim()) {
      setError('Введите новый пароль');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await client.patch('/users/' + user.id, { password: newPassword });
      setSuccess('Пароль обновлён');
      setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async () => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    setSaving(true);
    setError('');
    try {
      await client.patch('/users/' + user.id, { status: newStatus });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (!confirm('Удалить пользователя ' + user.username + '?')) return;
    setSaving(true);
    setError('');
    try {
      await client.delete('/users/' + user.id);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка удаления');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>{user.username}</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          {success && <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 8 }}>{success}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Роль</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={saveRole} disabled={saving} style={{ fontSize: 13 }}>
                OK
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Новый пароль</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Введите пароль"
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
              />
              <button className="btn" onClick={resetPassword} disabled={saving} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                Сбросить
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={toggleBlock}
              disabled={saving}
              style={{
                flex: 1, fontSize: 13,
                background: user.status === 'active' ? '#fee2e2' : '#dcfce7',
                color: user.status === 'active' ? '#b91c1c' : '#166534',
                border: '1px solid ' + (user.status === 'active' ? '#fca5a5' : '#86efac'),
              }}
            >
              {user.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
            </button>
            <button
              className="btn btn-danger"
              onClick={deleteUser}
              disabled={saving}
              style={{ flex: 1, fontSize: 13 }}
            >
              Удалить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
