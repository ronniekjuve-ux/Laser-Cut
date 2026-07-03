import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useIsMobile, { getForceMobile, setForceMobile } from '../hooks/useIsMobile';
import UsersList from './Users/UsersList';
import ChangeLog from './ChangeLog/ChangeLog';
import Feedback from './Feedback';

const TABS = [
  { key: 'feedback', label: 'Отзывы', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
  { key: 'users', label: 'Пользователи', roles: ['admin'] },
  { key: 'changelog', label: 'История', roles: ['admin'] },
];

export default function MorePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [forceMobile, setForceMobileState] = useState(getForceMobile());
  const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key || 'feedback');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleForceMobile = () => {
    const newVal = !forceMobile;
    setForceMobileState(newVal);
    setForceMobile(newVal);
    window.location.reload();
  };

  if (!isMobile && !forceMobile) {
    return (
      <div>
        <Feedback />
        <div style={{ marginTop: 20, padding: 12 }}>
          <button onClick={toggleForceMobile} style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)',
            background: '#f1f5f9', color: '#334155', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 8,
          }}>
            📱 Переключить на мобильную версию
          </button>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid #fee2e2',
            background: '#fee2e2', color: '#991b1b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Выйти из приложения
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 12 }}>
        {visibleTabs.map(tab => (
          <div
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--primary)' : '#64748b',
              marginBottom: -2,
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {activeTab === 'users' && <UsersList />}
      {activeTab === 'changelog' && <ChangeLog />}
      {activeTab === 'feedback' && <Feedback />}

      <div style={{ marginTop: 20, padding: 12 }}>
        <button onClick={toggleForceMobile} style={{
          width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)',
          background: '#f1f5f9', color: '#334155', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 8,
        }}>
          🖥️ Переключить на компьютерную версию
        </button>
        <button onClick={handleLogout} style={{
          width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid #fee2e2',
          background: '#fee2e2', color: '#991b1b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          Выйти из приложения
        </button>
      </div>
    </div>
  );
}
