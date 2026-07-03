import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import useIsMobile, { getForceMobile } from '../hooks/useIsMobile';
import InstallPWA from './InstallPWA';
import BottomNav from './BottomNav';
import UpdateBanner from './UpdateBanner';
import CacheManager from './CacheManager';
import { getShiftForDate, loadOverrides } from '../utils/shifts';

function getActiveOps() {
  const h = new Date().getHours();
  const overrides = loadOverrides();
  const { pair, isVovaOn } = getShiftForDate(new Date(), overrides);
  if (h >= 8 && h < 20) {
    return pair[0] + ' (St1) | ' + pair[1] + ' (St2)';
  }
  return isVovaOn ? 'Vova (Night)' : 'Night (Off)';
}

const NAV_ITEMS = [
  { to: '/', label: 'Заявки', icon: '📋', end: true, roles: ['admin', 'director', 'accountant'] },
  { to: '/orders', label: 'Заказы', icon: '📦', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
  { to: '/completed', label: 'Выполненные', icon: '✅', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
  { to: '/warehouse', label: 'Склад', icon: '🏭', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
  { to: '/deficit', label: 'Дефицит', icon: '⚠️', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
  { to: '/schedule', label: 'График', icon: '📅', roles: ['admin', 'director', 'accountant', 'operator'] },
  { to: '/users', label: 'Пользователи', icon: '👥', roles: ['admin'] },
  { to: '/changelog', label: 'История изменений', icon: '📝', roles: ['admin'] },
  { to: '/audit', label: 'Аудит', icon: '📊', roles: ['admin', 'director', 'accountant'] },
  { to: '/audit-mobile', label: 'Аудит', icon: '📊', roles: ['operator'] },
  { to: '/feedback', label: 'Отзывы', icon: '💬', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const forceMobile = getForceMobile();
  const [clock, setClock] = useState('');
  const [activeOps, setActiveOps] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'notification') {
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  useWebSocket(handleWsMessage);

  useEffect(() => {
    const update = () => {
      setClock(new Date().toLocaleString('ru-RU'));
      setActiveOps(getActiveOps());
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (showNotifs && !e.target.closest('.notif-bell') && !e.target.closest('[style*="z-index: 1000"]')) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showNotifs]);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await client.get('/api/v1/applications/notifications/unread-count');
        setUnreadCount(res.data.count);
      } catch {}
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30000);
    return () => clearInterval(id);
  }, []);

  const openNotifications = async () => {
    if (showNotifs) { setShowNotifs(false); return; }
    try {
      const res = await client.get('/api/v1/applications/notifications');
      setNotifications(res.data);
      setShowNotifs(true);
      // Mark all as read
      for (const n of res.data.filter(x => !x.is_read)) {
        await client.patch('/api/v1/applications/notifications/' + n.id + '/read');
      }
      setUnreadCount(0);
    } catch {}
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const pageTitle = (() => {
    const p = location.pathname;
    if (p === '/') return 'Предварительный расчёт';
    if (p === '/orders') return 'Заказы на резку';
    if (p === '/completed') return 'Выполненные заказы';
    if (p === '/warehouse') return 'Склад металла';
    if (p === '/deficit') return 'Дефицит материалов';
    if (p === '/schedule') return 'График смен';
    if (p === '/users') return 'Пользователи';
    if (p === '/audit') return 'Аудит';
    if (p === '/audit-mobile') return 'Аудит';
    if (p === '/changelog') return 'История изменений';
    if (p === '/feedback') return 'Жалобы и предложения';
    if (p.startsWith('/applications/')) return 'Детали заявки';
    return 'Предварительный расчёт';
  })();

  return (
    <div className={'app-container' + (forceMobile ? ' force-mobile' : '')}>
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
            {!isMobile && <h3>{pageTitle}</h3>}
            <div className="active-ops">👷 На смене: {activeOps}</div>
          </div>
          <div className="header-right">
            <span className="clock">{clock}</span>
            <CacheManager />
            <span className="notif-bell" onClick={openNotifications} style={{cursor: 'pointer', position: 'relative', fontSize: 18}}>
              🔔
              {unreadCount > 0 && (
                <span style={{position: 'absolute', top: -6, right: -8, background: '#ef4444', color: '#fff', borderRadius: '50%', fontSize: 10, padding: '1px 4px', fontWeight: 700}}>
                  {unreadCount}
                </span>
              )}
            </span>
            {showNotifs && (
              <div style={{
                position: 'absolute', top: 45, right: 10, background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: 320, maxHeight: 350,
                overflow: 'auto', zIndex: 1000
              }}>
                <div style={{padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0'}}>Уведомления</div>
                {notifications.length === 0 ? (
                  <div style={{padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13}}>Нет уведомлений</div>
                ) : notifications.map(n => (
                  <div key={n.id} onClick={() => {
                    if (n.related_app_id) {
                      setShowNotifs(false);
                      navigate('/?highlight=' + n.related_app_id);
                    }
                  }} style={{
                    padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13,
                    background: n.is_read ? '#fff' : '#eff6ff',
                    cursor: n.related_app_id ? 'pointer' : 'default'
                  }}>
                    <div>{n.message}</div>
                    <div style={{fontSize: 11, color: '#94a3b8', marginTop: 2}}>
                      {new Date(n.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <span className="user-badge">👤 {user?.username || '...'}</span>
          </div>
        </div>
        <UpdateBanner />
        <div className="content">
          <Outlet />
        </div>
        <InstallPWA />
        {isMobile && <BottomNav user={user} />}
      </div>
    </div>
  );
}