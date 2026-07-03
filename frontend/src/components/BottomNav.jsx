import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_GROUPS = [
  {
    id: 'orders',
    label: 'Заказы',
    icon: '📋',
    to: '/',
    roles: ['admin', 'director', 'accountant', 'operator', 'customer'],
  },
  {
    id: 'warehouse',
    label: 'Склад',
    icon: '📦',
    to: '/warehouse',
    roles: ['admin', 'director', 'accountant', 'operator', 'customer'],
  },
  {
    id: 'schedule',
    label: 'Календарь',
    icon: '📅',
    to: '/schedule',
    roles: ['admin', 'director', 'accountant', 'operator'],
  },
  {
    id: 'audit',
    label: 'Аудит',
    icon: '📊',
    to: '/audit',
    roles: ['admin', 'director', 'accountant', 'operator'],
  },
  {
    id: 'more',
    label: 'Ещё',
    icon: '⋯',
    to: '/more',
    roles: ['admin', 'director', 'accountant', 'operator', 'customer'],
  },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (group) => {
    if (group.id === 'orders') {
      return ['/', '/orders', '/completed'].some(p => p === location.pathname);
    }
    if (group.id === 'warehouse') {
      return ['/warehouse', '/deficit'].some(p => location.pathname === p);
    }
    if (group.id === 'audit') {
      return ['/audit', '/audit-mobile'].some(p => location.pathname === p);
    }
    if (group.id === 'more') {
      return ['/users', '/changelog', '/feedback', '/more'].some(p => location.pathname === p);
    }
    return location.pathname === group.to;
  };

  const handleNavClick = (group) => {
    if (group.id === 'audit' && user?.role === 'operator') {
      navigate('/audit-mobile');
    } else {
      navigate(group.to);
    }
  };

  return (
    <div className="bottom-nav">
      {NAV_GROUPS.map(group => {
        const visible = !group.roles || group.roles.includes(undefined) || true;
        if (!visible) return null;
        return (
          <div
            key={group.id}
            className={'bottom-nav-item' + (isActive(group) ? ' active' : '')}
            onClick={() => handleNavClick(group)}
          >
            <span className="bottom-nav-icon">{group.icon}</span>
            <span className="bottom-nav-label">{group.label}</span>
          </div>
        );
      })}
    </div>
  );
}
