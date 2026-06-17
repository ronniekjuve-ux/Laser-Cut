import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import InstallPWA from './InstallPWA';

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
  { to: '/', label: 'Р—Р°СЏРІРєРё', icon: 'рџ“‹', end: true, roles: ['admin', 'director', 'operator', 'customer'] },
  { to: '/orders', label: 'Р—Р°РєР°Р·С‹', icon: 'рџ“¦', roles: ['admin', 'director'] },
  { to: '/warehouse', label: 'РЎРєР»Р°Рґ', icon: 'рџЏ­', roles: ['admin', 'director', 'operator'] },
  { to: '/deficit', label: 'Р”РµС„РёС†РёС‚', icon: 'вљ пёЏ', roles: ['admin', 'director', 'operator', 'customer'] },
  { to: '/schedule', label: 'Р“СЂР°С„РёРє', icon: 'рџ“…', roles: ['admin', 'director', 'operator'] },
  { to: '/users', label: 'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё', icon: 'рџ‘Ґ', roles: ['admin', 'director'] },
  { to: '/changelog', label: 'РСЃС‚РѕСЂРёСЏ РёР·РјРµРЅРµРЅРёР№', icon: 'рџ“ќ', roles: ['admin', 'director'] },
  { to: '/audit', label: 'РђСѓРґРёС‚', icon: 'рџ”ђ', roles: ['admin', 'director'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
    if (p === '/') return 'Р—Р°СЏРІРєРё РЅР° СЂРµР·РєСѓ';
    if (p === '/orders') return 'Р—Р°РєР°Р·С‹';
    if (p === '/warehouse') return 'РЎРєР»Р°Рґ РјРµС‚Р°Р»Р»Р°';
    if (p === '/deficit') return 'Р”РµС„РёС†РёС‚ РјР°С‚РµСЂРёР°Р»РѕРІ';
    if (p === '/schedule') return 'Р“СЂР°С„РёРє СЃРјРµРЅ';
    if (p === '/users') return 'РџРѕР»СЊР·РѕРІР°С‚РµР»Рё';
    if (p === '/audit') return 'РђСѓРґРёС‚';
    if (p === '/changelog') return 'РСЃС‚РѕСЂРёСЏ РёР·РјРµРЅРµРЅРёР№';
    if (p.startsWith('/applications/')) return 'Р”РµС‚Р°Р»Рё Р·Р°СЏРІРєРё';
    return 'Р—Р°СЏРІРєРё РЅР° СЂРµР·РєСѓ';
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
          <span className="nav-icon">рџљЄ</span>
          <span className="nav-text">Р’С‹Р№С‚Рё</span>
        </div>
      </div>
      <div className="main">
        <div className="header">
          <div className="header-left">
            <h3>{pageTitle}</h3>
            <div className="active-ops">рџџў РќР° СЃРјРµРЅРµ: {activeOps}</div>
          </div>
          <div className="header-right">
            <span className="clock">{clock}</span>
            <span className="notif-bell" onClick={openNotifications} style={{cursor: 'pointer', position: 'relative', fontSize: 18}}>
              рџ””
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
                <div style={{padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0'}}>РЈРІРµРґРѕРјР»РµРЅРёСЏ</div>
                {notifications.length === 0 ? (
                  <div style={{padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13}}>РќРµС‚ СѓРІРµРґРѕРјР»РµРЅРёР№</div>
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
            <span className="user-badge">рџ‘¤ {user?.username || '...'}</span>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
        <InstallPWA />
      </div>
    </div>
  );
}