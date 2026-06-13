import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const QUICK_USERS = [
  { username: 'admin', password: 'admin', label: 'Администратор' },
  { username: 'Andrey', password: 'password', label: 'Оператор: Андрей' },
  { username: 'Denis', password: 'password', label: 'Оператор: Денис' },
  { username: 'Promstalmash', password: 'password', label: 'Заказчик: ПромСтальМаш' },
  { username: 'GSKB', password: 'password', label: 'Заказчик: ГСКБ' },
  { username: 'Director_V', password: 'password', label: 'Директор В.' },
  { username: 'Director_D', password: 'password', label: 'Директор Д.' },
];

export default function Login() {
  const [selectedUser, setSelectedUser] = useState(QUICK_USERS[0].username);
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(selectedUser, password);
      navigate('/');
    } catch (err) {
      setError('Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-box">
        <h2>LaserCut Login</h2>
        <form onSubmit={handleLogin}>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            {QUICK_USERS.map((u) => (
              <option key={u.username} value={u.username}>{u.label}</option>
            ))}
          </select>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
          />
          <div className="login-check">
            <input type="checkbox" defaultChecked />
            <label>Авто-ввод пароля при входе</label>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти в систему'}
          </button>
        </form>
      </div>
    </div>
  );
}