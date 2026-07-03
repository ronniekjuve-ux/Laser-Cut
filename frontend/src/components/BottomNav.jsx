import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_GROUPS = [
  {
    id: 'orders',
    label: 'Заказы',
    icon: '📋',
    items: [
      { to: '/', label: 'Заявки', roles: ['admin', 'director', 'accountant'] },
      { to: '/orders', label: 'Заказы', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
      { to: '/completed', label: 'Выполненные', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
    ],
  },
  {
    id: 'warehouse',
    label: 'Склад',
    icon: '📦',
    items: [
      { to: '/warehouse', label: 'Склад', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
      { to: '/deficit', label: 'Дефицит', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
    ],
  },
  {
    id: 'schedule',
    label: 'Календарь',
    icon: '📅',
    items: [
      { to: '/schedule', label: 'График', roles: ['admin', 'director', 'accountant', 'operator'] },
    ],
  },
  {
    id: 'audit',
    label: 'Аудит',
    icon: '📊',
    items: [
      { to: '/audit', label: 'Аудит', roles: ['admin', 'director', 'accountant'] },
    ],
  },
  {
    id: 'more',
    label: 'Ещё',
    icon: '⋯',
    items: [
      { to: '/users', label: 'Пользователи', roles: ['admin'] },
      { to: '/changelog', label: 'История изменений', roles: ['admin'] },
      { to: '/feedback', label: 'Отзывы', roles: ['admin', 'director', 'accountant', 'operator', 'customer'] },
    ],
  },
];

export default function BottomNav({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState(null);

  const handleNavClick = (group) => {
    const visibleItems = group.items.filter(item => !item.roles || item.roles.includes(user?.role));
    if (visibleItems.length === 1) {
      navigate(visibleItems[0].to);
      setOpenGroup(null);
    } else {
      setOpenGroup(openGroup === group.id ? null : group.id);
    }
  };

  const handleItemClick = (to) => {
    navigate(to);
    setOpenGroup(null);
  };

  const isActive = (group) => {
    return group.items.some(item => {
      if (item.to === '/') return location.pathname === '/';
      return location.pathname.startsWith(item.to);
    });
  };

  return (
    <>
      {openGroup && (
        <div className="bottom-nav-overlay" onClick={() => setOpenGroup(null)} />
      )}
      {openGroup && (
        <div className="bottom-nav-popup">
          {NAV_GROUPS
            .find(g => g.id === openGroup)
            ?.items.filter(item => !item.roles || item.roles.includes(user?.role))
            .map(item => (
              <div
                key={item.to}
                className="bottom-nav-popup-item"
                onClick={() => handleItemClick(item.to)}
              >
                {item.label}
              </div>
            ))}
        </div>
      )}
      <div className="bottom-nav">
        {NAV_GROUPS.map(group => {
          const visibleCount = group.items.filter(item => !item.roles || item.roles.includes(user?.role)).length;
          if (visibleCount === 0) return null;
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
    </>
  );
}
