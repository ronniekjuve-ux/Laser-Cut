# Mobile UI Redesign Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mobile-ui-redesign.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the mobile experience with swipeable layout cards, improved filters, priority-based card borders, a simplified layout preview modal, and a bottom navigation bar.

**Architecture:** Backend returns all layout images in list API. Frontend gets new components: MobileLayoutCarousel (swipeable images), LayoutPreviewModal (simplified layout view), BottomNav (mobile navigation), and FilterBar (machine toggle + filter chips). Layout.jsx conditionally renders sidebar vs bottom nav based on viewport.

**Tech Stack:** React 18, CSS (no new dependencies), touch events for swiping.

## Global Constraints

- Mobile breakpoint: 768px (existing convention)
- All existing desktop functionality must remain unchanged
- Backend API changes must be backward-compatible
- No new npm dependencies
- CSS-only animations where possible

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `app/api/v1/router_applications.py:463-492` | Modify | Add `layouts` array to list API response |
| `frontend/src/hooks/useIsMobile.js` | Create | Shared mobile detection hook |
| `frontend/src/components/MobileLayoutCarousel.jsx` | Create | Swipeable layout images in card |
| `frontend/src/components/LayoutPreviewModal.jsx` | Create | Simplified layout detail modal |
| `frontend/src/components/MobileOrderCard.jsx` | Modify | Use carousel, add priority border |
| `frontend/src/components/BottomNav.jsx` | Create | Mobile bottom navigation bar |
| `frontend/src/components/Layout.jsx` | Modify | Conditional sidebar/bottom nav |
| `frontend/src/styles/global.css` | Modify | New CSS for bottom nav, carousel, filters |
| `frontend/src/pages/Orders/OrdersList.jsx` | Modify | Add tab bar, filter chips, use shared hook |
| `frontend/src/pages/Orders/CompletedOrdersList.jsx` | Modify | Use shared hook |
| `frontend/src/pages/Applications/ApplicationsList.jsx` | Modify | Use shared hook, mobile cards |

---

## Task 1: Backend — Add layouts array to list API

**Covers:** S2 (swipeable layouts need all layout data)

**Files:**
- Modify: `app/api/v1/router_applications.py:463-492`

**Interfaces:**
- Produces: `layouts` field in list response — `[{id, layout_code, layout_image}]` for active layouts

- [ ] **Step 1: Add layouts query to list endpoint**

In `router_applications.py`, after line 465 (`first_layout_image = ...`), add a query to fetch all active layouts with their images:

```python
        # All active layouts for carousel
        all_active_layouts_data = []
        for al in active_layouts:
            all_active_layouts_data.append({
                "id": al.id,
                "layout_code": al.layout_code,
                "layout_image": al.layout_image,
            })
```

- [ ] **Step 2: Add layouts to enriched response**

In the `enriched.append({...})` block (around line 467-492), add after `"sheet_count": total_sheets,`:

```python
            "layouts": all_active_layouts_data,
```

- [ ] **Step 3: Verify API response**

Test with: `curl http://localhost:8000/api/v1/applications/?tab=orders | python -m json.tool | grep -A5 layouts`

Expected: Each item has `"layouts": [{"id": N, "layout_code": "001", "layout_image": "..."}]`

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/router_applications.py
git commit -m "feat: return all layout images in list API for mobile carousel"
```

---

## Task 2: Shared mobile detection hook

**Covers:** S1 (reusable mobile detection)

**Files:**
- Create: `frontend/src/hooks/useIsMobile.js`

**Interfaces:**
- Produces: `useIsMobile()` hook returning boolean

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect } from 'react';

export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
```

- [ ] **Step 2: Replace duplicated detection in OrdersList.jsx**

In `OrdersList.jsx`, remove lines 100-107 (the `isMobile` state and useEffect). Add import at top:

```javascript
import useIsMobile from '../../hooks/useIsMobile';
```

Replace with:

```javascript
const isMobile = useIsMobile();
```

- [ ] **Step 3: Replace in CompletedOrdersList.jsx**

Same change in `CompletedOrdersList.jsx` (lines 14-21).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useIsMobile.js frontend/src/pages/Orders/OrdersList.jsx frontend/src/pages/Orders/CompletedOrdersList.jsx
git commit -m "refactor: extract mobile detection into shared useIsMobile hook"
```

---

## Task 3: MobileLayoutCarousel component

**Covers:** S2 (swipeable layout images in cards)

**Files:**
- Create: `frontend/src/components/MobileLayoutCarousel.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `layouts` array `[{id, layout_code, layout_image}]`, `appId`, `onLayoutClick(layoutIndex)`
- Produces: Touch-swipeable image carousel with dot indicators

- [ ] **Step 1: Create MobileLayoutCarousel.jsx**

```javascript
import { useState, useRef, useCallback } from 'react';

export default function MobileLayoutCarousel({ layouts, appId, onLayoutClick }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e) => {
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const threshold = 50;
    if (touchDeltaX.current < -threshold && activeIndex < layouts.length - 1) {
      setActiveIndex(prev => prev + 1);
    } else if (touchDeltaX.current > threshold && activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
    touchDeltaX.current = 0;
  }, [activeIndex, layouts.length]);

  if (!layouts || layouts.length === 0) {
    return (
      <div className="order-card-no-image">Нет изображения</div>
    );
  }

  const layout = layouts[activeIndex];

  return (
    <div className="carousel-container">
      <div
        ref={containerRef}
        className="carousel-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => onLayoutClick(activeIndex)}
      >
        <img
          className="carousel-image"
          src={layout.layout_image}
          alt={`Раскладка ${appId}.${layout.layout_code}`}
          loading="lazy"
        />
      </div>
      {layouts.length > 1 && (
        <div className="carousel-dots">
          {layouts.map((_, i) => (
            <span
              key={i}
              className={'carousel-dot' + (i === activeIndex ? ' active' : '')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add carousel CSS to global.css**

Append to `global.css` before the closing `}` of the mobile media query (before line 227):

```css
  /* Carousel */
  .carousel-container { position: relative; width: 100%; }
  .carousel-viewport { width: 100%; overflow: hidden; touch-action: pan-y; }
  .carousel-image { width: 100%; display: block; }
  .carousel-dots { display: flex; justify-content: center; gap: 5px; padding: 6px 0; }
  .carousel-dot { width: 6px; height: 6px; border-radius: 50%; background: #cbd5e1; transition: background 0.2s; }
  .carousel-dot.active { background: #2563eb; }

  /* Priority border */
  .order-card.priority-urgent { border-left: 4px solid #ef4444; }
  .order-card.priority-high { border-left: 4px solid #f97316; }
  .order-card.priority-medium { border-left: 4px solid #3b82f6; }
  .order-card.priority-low { border-left: 4px solid #9ca3af; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MobileLayoutCarousel.jsx frontend/src/styles/global.css
git commit -m "feat: add MobileLayoutCarousel with touch swipe and dot indicators"
```

---

## Task 4: LayoutPreviewModal component

**Covers:** S2 (simplified layout modal with part count)

**Files:**
- Create: `frontend/src/components/LayoutPreviewModal.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `appId`, `layoutId`, `onClose()`
- Fetches: `GET /api/v1/applications/{appId}` — extracts specific layout by `layoutId`
- Produces: Full-screen modal with layout image, "N деталей (M типов)" header, parts table

- [ ] **Step 1: Create LayoutPreviewModal.jsx**

```javascript
import { useState, useEffect } from 'react';
import client from '../api/client';

export default function LayoutPreviewModal({ appId, layoutId, onClose }) {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + appId);
        const layouts = res.data.layouts || [];
        const found = layouts.find(l => l.id === layoutId);
        setLayout(found || null);
      } catch (err) {
        console.error('Failed to load layout', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLayout();
  }, [appId, layoutId]);

  if (loading) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal-content" style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: 40 }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal-content" style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0 }}>
          <div className="modal-body" style={{ textAlign: 'center', padding: 40 }}>Раскладка не найдена</div>
        </div>
      </div>
    );
  }

  const parts = layout.parts || [];
  const totalQty = parts.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const uniqueTypes = parts.length;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '100%', height: '100%', borderRadius: 0, maxHeight: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: 14 }}>
            {appId}.{layout.layout_code || '?'}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '0 12px 12px' }}>
          {layout.layout_image && (
            <img
              src={layout.layout_image}
              alt={`Раскладка ${appId}.${layout.layout_code}`}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}
            />
          )}

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>
            {totalQty} деталей ({uniqueTypes} типов)
          </div>

          {layout.sheet_size && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Лист: {layout.sheet_size} | Вес: {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'} | Листов: {layout.sheet_count || 1}
            </div>
          )}

          {parts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {parts.map((part, pi) => (
                <div
                  key={pi}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                    background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)',
                  }}
                >
                  {part.image_path ? (
                    <img src={part.image_path} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: '#e2e8f0', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{part.name || ''}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {part.dx} x {part.dy} | x{part.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LayoutPreviewModal.jsx
git commit -m "feat: add LayoutPreviewModal with part count and parts table"
```

---

## Task 5: Update MobileOrderCard with carousel and priority border

**Covers:** S2 (carousel), S4 (priority border color)

**Files:**
- Modify: `frontend/src/components/MobileOrderCard.jsx`

**Interfaces:**
- Consumes: `app` with `layouts` array, `priority` field
- Produces: Card with priority border, swipeable carousel, layout click opens LayoutPreviewModal

- [ ] **Step 1: Rewrite MobileOrderCard.jsx**

```javascript
import React, { useState } from 'react';
import MobileLayoutCarousel from './MobileLayoutCarousel';
import LayoutPreviewModal from './LayoutPreviewModal';

const STATUS_CONFIG = {
  approved: { label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  partially_cut: { label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  cut: { label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
};

const STATUS_BAR = {
  approved: '#3b82f6',
  in_progress: '#f59e0b',
  partially_cut: '#f97316',
  cut: '#10b981',
};

export default function MobileOrderCard({ app, onClick }) {
  const [previewLayout, setPreviewLayout] = useState(null);
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const material = app.steel_grade || app.material || '-';
  const priority = app.priority || 'medium';
  const layouts = app.layouts || [];

  const handleLayoutClick = (layoutIndex) => {
    if (layouts.length > 0) {
      setPreviewLayout(layouts[layoutIndex]);
    }
  };

  return (
    <>
      <div
        className={`order-card priority-${priority}`}
        onClick={() => onClick(app)}
      >
        <MobileLayoutCarousel
          layouts={layouts.length > 0 ? layouts : (app.layout_image ? [{ id: 0, layout_code: '001', layout_image: app.layout_image }] : [])}
          appId={app.id}
          onLayoutClick={handleLayoutClick}
        />
        <div className="order-card-body">
          <div className="order-card-customer">{app.customer || '-'}</div>
          <div className="order-card-meta">
            <span>{material}</span>
            <span>{app.thickness ? `${app.thickness} мм` : ''}</span>
            {app.sheet_size && <span>{app.sheet_size}</span>}
            {app.sheet_count > 0 && <span>{app.sheet_count} лист.</span>}
          </div>
          <div className="order-card-footer">
            <span
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: status.bg, color: status.color,
              }}
            >
              {status.label}
            </span>
            {app.group_name && (
              <span
                style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: '#ede9fe', color: '#7c3aed',
                }}
              >
                {app.group_name}
              </span>
            )}
            {app.supply_material === true && (
              <span
                style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: '#d1fae5', color: '#047857',
                }}
              >
                Дав. мат
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
              #{app.id}
            </span>
          </div>
        </div>
        <div style={{ height: 3, background: STATUS_BAR[app.status] || '#3b82f6', borderRadius: '0 0 10px 10px' }} />
      </div>

      {previewLayout && (
        <LayoutPreviewModal
          appId={app.id}
          layoutId={previewLayout.id}
          onClose={() => setPreviewLayout(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Fix CSS — remove fixed image height**

In `global.css`, change line 220:

```css
  .order-card-image { width: 100%; height: 180px; object-fit: contain; background: #f8fafc; display: block; }
```

To:

```css
  .order-card-image { width: 100%; object-fit: contain; background: #f8fafc; display: block; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MobileOrderCard.jsx frontend/src/styles/global.css
git commit -m "feat: MobileOrderCard with carousel, priority border, and status strip"
```

---

## Task 6: Bottom navigation bar

**Covers:** S5 (mobile bottom nav)

**Files:**
- Create: `frontend/src/components/BottomNav.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `user` (for role filtering), `location` (for active state), `navigate`
- Produces: Fixed bottom bar with 5 icons, popup submenus for Заказы and Ещё

- [ ] **Step 1: Create BottomNav.jsx**

```javascript
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
```

- [ ] **Step 2: Add bottom nav CSS to global.css**

Append before the mobile media query closing brace (or add a new section):

```css
/* Bottom navigation */
.bottom-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #0f172a;
  color: #cbd5e1;
  z-index: 900;
  padding: 6px 0 env(safe-area-inset-bottom, 8px);
  justify-content: space-around;
  border-top: 1px solid #1e293b;
}
.bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 6px;
  transition: 0.2s;
  min-width: 0;
}
.bottom-nav-item:active { background: #1e293b; }
.bottom-nav-item.active { color: #60a5fa; }
.bottom-nav-icon { font-size: 20px; }
.bottom-nav-label { font-size: 10px; white-space: nowrap; }
.bottom-nav-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 899;
}
.bottom-nav-popup {
  position: fixed;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  z-index: 901;
  overflow: hidden;
  min-width: 160px;
}
.bottom-nav-popup-item {
  padding: 12px 20px;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.bottom-nav-popup-item:last-child { border-bottom: none; }
.bottom-nav-popup-item:active { background: #f1f5f9; }
```

- [ ] **Step 3: Add responsive styles inside mobile media query**

Inside the `@media (max-width: 768px)` block in global.css, add:

```css
  .bottom-nav { display: flex; }
  .sidebar { display: none; }
  .content { padding-bottom: 70px; }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BottomNav.jsx frontend/src/styles/global.css
git commit -m "feat: add mobile bottom navigation with popup submenus"
```

---

## Task 7: Integrate BottomNav into Layout.jsx

**Covers:** S5 (bottom nav integration)

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Consumes: `BottomNav` component, `useIsMobile` hook

- [ ] **Step 1: Add imports**

At top of Layout.jsx, add:

```javascript
import BottomNav from './BottomNav';
import useIsMobile from '../hooks/useIsMobile';
```

- [ ] **Step 2: Add isMobile detection**

Inside the `Layout` component, after line 37 (`const location = useLocation();`), add:

```javascript
const isMobile = useIsMobile();
```

- [ ] **Step 3: Conditionally render BottomNav**

After `<InstallPWA />` (line 192), before the closing `</div>` of `.main`, add:

```javascript
        {isMobile && <BottomNav user={user} />}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat: integrate BottomNav into Layout for mobile"
```

---

## Task 8: OrdersList — tab bar and filter chips

**Covers:** S3 (machine toggle + filter chips), tabbed interface

**Files:**
- Modify: `frontend/src/pages/Orders/OrdersList.jsx`
- Modify: `frontend/src/styles/global.css`

**Interfaces:**
- Consumes: `useIsMobile` hook
- Produces: Mobile tab bar (Заявки/Заказы/Выполненные), machine toggle, filter chips

- [ ] **Step 1: Add tab state and machine filter state**

In OrdersList.jsx, after the `isMobile` line, add:

```javascript
const [activeTab, setActiveTab] = useState('applications');
const [machineFilter, setMachineFilter] = useState(null);
```

- [ ] **Step 2: Add mobile tab bar and filter chips**

Before the `{isMobile ? (...)` block (around line 367), add mobile-only UI:

```jsx
      {isMobile && (
        <div style={{ marginBottom: 12 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 10 }}>
            {[
              { key: 'applications', label: 'Заявки' },
              { key: 'orders', label: 'Заказы' },
              { key: 'completed', label: 'Выполненные' },
            ].map(tab => (
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

          {/* Machine toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[null, 'станок 1', 'станок 2'].map(machine => (
              <div
                key={machine || 'all'}
                onClick={() => setMachineFilter(machine)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: machineFilter === machine ? 'var(--primary)' : '#f1f5f9',
                  color: machineFilter === machine ? '#fff' : '#64748b',
                  border: '1px solid ' + (machineFilter === machine ? 'var(--primary)' : 'var(--border)'),
                }}
              >
                {machine || 'Все'}
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'customer', label: 'Заказчик' },
              { key: 'material', label: 'Материал' },
              { key: 'thickness', label: 'Толщина' },
              { key: 'priority', label: 'Срочность' },
            ].map(chip => (
              <div
                key={chip.key}
                onClick={() => {
                  // Toggle filter chip — same logic as column filter
                  if (openFilter === chip.key) {
                    setOpenFilter(null);
                  } else {
                    setOpenFilter(chip.key);
                    setFilterSearch('');
                  }
                }}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                  background: filters[chip.key] ? '#dbeafe' : '#f1f5f9',
                  color: filters[chip.key] ? '#1d4ed8' : '#64748b',
                  border: '1px solid ' + (filters[chip.key] ? '#93c5fd' : 'var(--border)'),
                }}
              >
                {chip.label} {filters[chip.key] ? '✕' : '▾'}
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Wire machine filter to API calls**

In `fetchOrders` function, add after `if (filters.priority) params.priority = filters.priority[0];`:

```javascript
      if (machineFilter) params.machine = machineFilter;
```

Also add `machineFilter` to the `useCallback` dependency array.

- [ ] **Step 4: Wire tab switching**

Add a `useEffect` that changes the API `tab` param based on `activeTab`:

```javascript
useEffect(() => {
  setPage(1);
  fetchOrders(search || undefined, 1);
}, [activeTab, machineFilter]);
```

And in `fetchOrders`, use the active tab:

```javascript
const tabParam = activeTab === 'applications' ? 'applications' : 'orders';
const params = { page: pageNum, limit: 15, tab: tabParam };
if (activeTab === 'completed') params.status = 'cut';
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Orders/OrdersList.jsx frontend/src/styles/global.css
git commit -m "feat: add mobile tab bar, machine toggle, and filter chips to OrdersList"
```

---

## Task 9: Update CompletedOrdersList and ApplicationsList

**Covers:** S1 (shared hook), consistent mobile card rendering

**Files:**
- Modify: `frontend/src/pages/Applications/ApplicationsList.jsx`

**Interfaces:**
- Consumes: `useIsMobile`, `MobileOrderCard`

- [ ] **Step 1: Add imports to ApplicationsList.jsx**

```javascript
import useIsMobile from '../../hooks/useIsMobile';
import MobileOrderCard from '../../components/MobileOrderCard';
```

- [ ] **Step 2: Add mobile detection and card rendering**

In `ApplicationsList.jsx`, add `const isMobile = useIsMobile();` after the state declarations.

Then, wrap the table in a conditional:

```jsx
{isMobile ? (
  <div className="order-cards">
    {filtered.map(app => (
      <MobileOrderCard
        key={app.id}
        app={app}
        onClick={(a) => setSelectedApp(a)}
      />
    ))}
    {filtered.length === 0 && (
      <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет заявок</div>
    )}
  </div>
) : (
  // existing table JSX
)}
```

- [ ] **Step 3: Add mobile detail modal**

After the existing `ApplicationDetail` modal rendering, add:

```jsx
{selectedApp && isMobile && (
  <MobileOrderDetail
    app={selectedApp}
    onClose={() => setSelectedApp(null)}
    onUpdate={() => fetchApps()}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Applications/ApplicationsList.jsx
git commit -m "feat: add mobile card view to ApplicationsList"
```

---

## Task 10: Final CSS polish and testing

**Covers:** S1-S5 (all sections)

**Files:**
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Ensure order-card-image has no fixed height in default CSS**

The `.order-card-image` class is only used in the `@media (max-width: 768px)` block. Verify the change from Task 5 step 2 is correct — remove `height: 180px`.

- [ ] **Step 2: Add padding-bottom to content for bottom nav**

In the mobile media query, add:

```css
  .content { padding-bottom: 70px; }
```

- [ ] **Step 3: Test all flows**

Verify:
1. Cards show swipeable layout images (no empty space)
2. Tapping a layout in carousel opens LayoutPreviewModal with part count
3. Card border color matches priority (red/orange/blue/gray)
4. Status strip shows at card bottom
5. Bottom nav appears on mobile with 5 items
6. Заказы → tab bar with Заявки/Заказы/Выполненные
7. Склад → popup with Склад/Дефицит
8. Ещё → popup with Пользователи/История/Отзывы
9. Machine toggle filters correctly
10. Filter chips open dropdowns
11. Desktop UI unchanged

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/global.css
git commit -m "chore: final CSS polish for mobile UI redesign"
```
