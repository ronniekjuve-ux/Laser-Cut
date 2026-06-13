import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await client.get('/users/');
        setUsers(Array.isArray(res.data) ? res.data : res.data.items || []);
      } catch (err) {
        console.error('Failed to load users', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) return <div className="loading">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>;

  return (
    <div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{'\u0418\u043c\u044f'}</th>
              <th>{'\u0420\u043e\u043b\u044c'}</th>
              <th>{'\u0421\u0442\u0430\u043d\u043e\u043a/\u0421\u043c\u0435\u043d\u0430'}</th>
              <th>{'\u0421\u0442\u0430\u0442\u0443\u0441'}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td><strong>{user.username || user.name}</strong></td>
                <td>
                  <span className="user-role">
                    {user.role === 'admin' ? '\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440' :
                     user.role === 'director' ? '\u0414\u0438\u0440\u0435\u043a\u0442\u043e\u0440' :
                     user.role === 'operator' ? '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440' :
                     user.role === 'customer' ? '\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a' :
                     user.role}
                  </span>
                </td>
                <td>{user.machine || '-'}</td>
                <td>
                  <span className={'badge ' + (user.is_active !== false ? 'bg-active' : 'bg-pending')}>
                    {user.is_active !== false ? '\u0410\u043a\u0442\u0438\u0432\u0435\u043d' : '\u041d\u0435 \u0430\u043a\u0442\u0438\u0432\u0435\u043d'}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  {'\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}