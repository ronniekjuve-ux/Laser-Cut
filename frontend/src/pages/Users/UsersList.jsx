import { useState, useEffect } from 'react';
import client from '../../api/client';
import UserActivityModal from './UserActivityModal';
import CreateUserModal from './CreateUserModal';
import EditUserModal from './EditUserModal';

const ROLE_LABELS = {
  admin: 'Администратор',
  director: 'Директор',
  operator: 'Оператор',
  customer: 'Заказчик',
  accountant: 'Бухгалтер',
};

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const now = new Date();
  const then = new Date(isoStr);
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return mins + ' мин назад';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' ч назад';
  const days = Math.floor(hours / 24);
  return days + ' дн назад';
}

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await client.get('/users/');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const id = setInterval(fetchUsers, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Новый пользователь
        </button>
        <span style={{marginLeft: 'auto', fontSize: 13, color: '#64748b'}}>
          Всего: {users.length} пользователей
        </span>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Роль</th>
              <th>Устройство</th>
              <th>Статус</th>
              <th style={{width: 60}}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{opacity: user.status === 'suspended' ? 0.5 : 1}}>
                <td>
                  <button
                    className="user-link-btn"
                    onClick={() => setSelectedUser(user)}
                  >
                    {user.username}
                  </button>
                </td>
                <td>
                  <span className="user-role">
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </td>
                <td style={{fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {user.device_info || '—'}
                </td>
                <td>
                  {user.status === 'suspended' ? (
                    <span style={{color: '#b91c1c', fontSize: 12, fontWeight: 600}}>Заблокирован</span>
                  ) : user.is_online ? (
                    <span className="online-indicator">
                      <span className="online-dot" /> Онлайн
                    </span>
                  ) : (
                    <span className="last-seen">
                      {user.last_active ? 'Был(а) ' + timeAgo(user.last_active) : 'Нет данных'}
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="btn"
                    onClick={() => setEditUser(user)}
                    title="Редактировать"
                    style={{padding: '4px 8px', fontSize: 11}}
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  Пользователи не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserActivityModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchUsers(); }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}
