import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';

const SHIFT_CYCLE = [
  ['Yura', 'Denis'],
  ['Andrey', 'Denis'],
  ['Andrey', 'Dima'],
  ['Yura', 'Dima'],
];
const SHIFT_OFFSET = 2;

function getShiftInfo(date) {
  const now = new Date();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
  let dayIndex = ((diffDays + SHIFT_OFFSET) % 4 + 4) % 4;
  const pair = SHIFT_CYCLE[dayIndex];
  let nightIndex = ((diffDays + SHIFT_OFFSET) % 8 + 8) % 8;
  const isVovaOn = nightIndex < 4;
  return { pair, isVovaOn };
}

function getActiveOps() {
  const h = new Date().getHours();
  const { pair, isVovaOn } = getShiftInfo(new Date());
  if (h >= 8 && h < 20) {
    return pair[0] + ' (St1) | ' + pair[1] + ' (St2)';
  }
  return isVovaOn ? 'Vova (Night)' : 'Night (Off)';
}

const NAV_ITEMS = [
  { to: '/', label: 'Заявки', icon: '📋', end: true },
  { to: '/deficit', label: 'Дефицит', icon: '⚠️' },
  { to: '/schedule', label: 'График', icon: '📅' },
  { to: '/users', label: 'Пользователи', icon: '👥', roles: ['admin', 'director'] },
  { to: '/audit', label: 'Аудит', icon: '🔐' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clock, setClock] = useState('');
  const [activeOps, setActiveOps] = useState('');

  useEffect(() => {
    const update = () => {
      setClock(new Date().toLocaleString('ru-RU'));
      setActiveOps(getActiveOps());
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const pageTitle = (() => {
    const p = location.pathname;
    if (p === '/') return 'Заявки на резку';
    if (p === '/deficit') return 'Дефицит материалов';
    if (p === '/schedule') return 'График смен';
    if (p === '/users') return 'Пользователи';
    if (p === '/audit') return 'Журнал аудита';
    if (p.startsWith('/applications/')) return 'Детали заявки';
    return 'Заявки на резку';
  })();

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-brand">LaserCut</div>
        {NAV_ITEMS.filter(item => !item.roles || item.roles.includes(user?.role)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({isActive}) => 'nav-item ' + (isActive ? 'active' : '')}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-text">{item.label}</span>
          </NavLink>
        ))}
        <div className="nav-spacer" />
        <div className="nav-item" onClick={handleLogout} style={{cursor: 'pointer'}}>
          <span className="nav-icon">🚪</span>
          <span className="nav-text">Выйти</span>
        </div>
      </div>
      <div className="main">
        <div className="header">
          <div className="header-left">
            <h3>{pageTitle}</h3>
            <div className="active-ops">🟢 На смене: {activeOps}</div>
          </div>
          <div className="header-right">
            <span className="clock">{clock}</span>
            <span className="user-badge">👤 {user?.username || '...'}</span>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}