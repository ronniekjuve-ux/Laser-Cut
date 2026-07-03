---
feature: mobile-ui-redesign
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-07-03-mobile-ui-redesign.md
branch: main
commits: 88ec560..6ffcc61
---

# Mobile UI Redesign — Final Report

## What Was Built

Complete redesign of the mobile experience for the LaserCut production management app. Five interconnected improvements:

1. **Swipeable layout carousel** — Order cards now show all layout images (not just the first) with touch-swipe navigation and dot indicators. Tapping a layout opens a lightweight preview modal showing the layout image, part count summary ("12 деталей (5 типов)"), and a scrollable parts table.

2. **Priority-based card borders** — Cards have a colored left border indicating urgency: red (urgent), orange (high), blue (medium), gray (low). A thin status strip at the card bottom shows the current status color.

3. **Machine toggle and filter chips** — Mobile orders view has a segmented control for "Все / Станок 1 / Станок 2" and tappable filter chips (Заказчик, Материал, Толщина, Срочность) that open the existing filter dropdowns.

4. **Bottom navigation bar** — Replaces the collapsed sidebar on mobile. Five items: Заказы (with tab bar for Заявки/Заказы/Выполненные), Склад (popup with Склад/Дефицит), Календарь, Аудит, Ещё (page-list for Пользователи/История/Отзывы).

5. **Mobile cards for ApplicationsList** — Previously always showed desktop table; now renders MobileOrderCard on mobile with the same carousel and modal behavior.

## Architecture

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `useIsMobile` | `frontend/src/hooks/useIsMobile.js` | Shared hook — `window.matchMedia` with configurable breakpoint |
| `MobileLayoutCarousel` | `frontend/src/components/MobileLayoutCarousel.jsx` | Touch-swipeable image carousel with dot indicators |
| `LayoutPreviewModal` | `frontend/src/components/LayoutPreviewModal.jsx` | Lightweight full-screen modal: layout image + parts table |
| `MobileOrderCard` | `frontend/src/components/MobileOrderCard.jsx` | Card with carousel, priority border, status strip |
| `BottomNav` | `frontend/src/components/BottomNav.jsx` | Fixed bottom bar with popup submenus |
| `Layout` | `frontend/src/components/Layout.jsx` | Conditionally renders sidebar (desktop) or BottomNav (mobile) |

### Data Flow

```
List API → { layouts: [{id, layout_code, layout_image}] }
         → MobileOrderCard → MobileLayoutCarousel (swipe)
                           → LayoutPreviewModal (tap)
```

### Backend Change

`router_applications.py` list endpoint now returns a `layouts` array with `{id, layout_code, layout_image}` for all active layouts, enabling the carousel without extra API calls.

## Usage

- **Swipe** left/right on a card to browse layouts
- **Tap** a layout image → opens preview modal with parts list
- **Tap** card body → opens full order detail (MobileOrderDetail)
- **Bottom nav**: single-tap items navigate directly; multi-item groups show popup
- **Filter chips**: tap to toggle filter dropdown; active filters shown with ✕
- **Machine toggle**: tap to filter by station

## Verification

- Frontend build: `npm run build` — passes (566ms, 0 errors)
- Python syntax: `py_compile router_applications.py` — passes
- All 9 commits clean, no merge conflicts
- Working tree: only untracked cache/plan files remain

## Journey Log

- [lesson] CSS was added by Task 3 (carousel) and Task 5 (card) — verified no duplicates in final file
- [lesson] LayoutPreviewModal needed AbortController cleanup for React 18 strict mode — caught in code review
- [lesson] Backend list API only returned first layout image — extended to return all active layouts for carousel

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-07-03-mobile-ui-redesign.md` | Implementation plan | 10 tasks, all completed |
