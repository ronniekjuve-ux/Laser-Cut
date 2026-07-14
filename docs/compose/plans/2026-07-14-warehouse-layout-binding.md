# Warehouse-Layout Binding Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve warehouse-to-layout binding with smart dropdowns, per-run binding, area validation, visual indicators, and sheet reservation.

**Architecture:** Replace singular `warehouse_item_id` with JSON `warehouse_bindings` mapping run_index to warehouse_item_id. Add smart filtering, area checks, and reservation state to warehouse items.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL, React, vanilla JS/CSS

---

## Task 1: Database Migration — Add `warehouse_bindings` JSON column

**Covers:** Per-run binding data model

**Files:**
- Modify: `scripts/apply_sql_migrations.py`
- Modify: `app/db/models.py`

**Interfaces:**
- Produces: `ApplicationLayout.warehouse_bindings` (JSON column, nullable)

- [ ] **Step 1: Add migration #38 to apply_sql_migrations.py**

```python
# 38. Add warehouse_bindings JSON to application_layouts (per-run binding)
"ALTER TABLE application_layouts ADD COLUMN IF NOT EXISTS warehouse_bindings JSON;",
```

- [ ] **Step 2: Add model field to ApplicationLayout in models.py**

After line 164 (`layout_sheets_used`), add:

```python
warehouse_bindings: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 3: Migrate existing warehouse_item_id data**

Add migration to copy existing `warehouse_item_id` into `warehouse_bindings` for layouts with `sheet_count=1`:

```python
# 38b. Migrate existing warehouse_item_id to warehouse_bindings
"""DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, warehouse_item_id, sheet_count
             FROM application_layouts
             WHERE warehouse_item_id IS NOT NULL
    LOOP
        UPDATE application_layouts
        SET warehouse_bindings = json_build_object('0', r.warehouse_item_id)
        WHERE id = r.id;
    END LOOP;
END $$;""",
```

- [ ] **Step 4: Commit**

```bash
git add scripts/apply_sql_migrations.py app/db/models.py
git commit -m "feat: add warehouse_bindings JSON column for per-run binding"
```

---

## Task 2: Backend — New Bind/Unbind Endpoints

**Covers:** Per-run binding API, area validation, reservation check

**Files:**
- Modify: `app/api/v1/router_applications.py`

**Interfaces:**
- Consumes: `ApplicationLayout.warehouse_bindings` (JSON)
- Produces: `PATCH /layouts/{layout_id}/bind-run` (run_index + warehouse_item_id)
- Produces: `GET /warehouse/` returns `reserved_by` field

- [ ] **Step 1: Add bind-run endpoint**

After the existing `PATCH /layouts/{layout_id}/warehouse` endpoint (line ~2300), add:

```python
@router.patch("/layouts/{layout_id}/bind-run")
async def bind_layout_run(
        layout_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    run_index = body.get("run_index")
    warehouse_item_id = body.get("warehouse_item_id")
    
    if run_index is None:
        raise HTTPException(status_code=400, detail="run_index обязателен")
    
    result = await db.execute(select(ApplicationLayout).where(ApplicationLayout.id == layout_id))
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Раскладка не найдена")
    
    # Parse existing bindings
    bindings = {}
    if layout.warehouse_bindings:
        try:
            bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
        except Exception:
            bindings = {}
    
    # Unbind
    if warehouse_item_id is None:
        bindings.pop(str(run_index), None)
        layout.warehouse_bindings = json.dumps(bindings) if bindings else None
        await db.commit()
        return {"status": "success", "warehouse_bindings": bindings}
    
    # Validate warehouse item exists and has stock
    wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == warehouse_item_id))
    wh_item = wh_result.scalar_one_or_none()
    if not wh_item:
        raise HTTPException(status_code=404, detail="Позиция на складе не найдена")
    if wh_item.sheet_count < 1:
        raise HTTPException(status_code=400, detail="Нет листов на складе")
    
    # Check reservation: if this item is bound to another uncut run, block
    # (Skip check if binding to same run — re-binding)
    old_binding = bindings.get(str(run_index))
    if old_binding != warehouse_item_id:
        # Check if item is reserved by any other layout run
        layouts_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.id != layout_id,
                ApplicationLayout.status == "active"
            )
        )
        for other_layout in layouts_result.scalars().all():
            if other_layout.warehouse_bindings:
                try:
                    other_bindings = json.loads(other_layout.warehouse_bindings) if isinstance(other_layout.warehouse_bindings, str) else other_layout.warehouse_bindings
                    for ri, bid in other_bindings.items():
                        if bid == warehouse_item_id:
                            # Check if that run is not yet cut
                            other_runs = json.loads(other_layout.completed_runs) if other_layout.completed_runs else []
                            if int(ri) < len(other_runs) and not other_runs[int(ri)]:
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Лист уже зарезервирован раскладкой {other_layout.layout_code} (рез #{int(ri)+1})"
                                )
                except Exception:
                    pass
    
    # Area validation (warning only — we return flag, frontend shows alert)
    area_ok = True
    if wh_item.sheet_w and wh_item.sheet_h and layout.sheet_w and layout.sheet_h:
        wh_area = wh_item.sheet_w * wh_item.sheet_h
        layout_area = layout.sheet_w * layout.sheet_h
        if wh_area < layout_area:
            area_ok = False
    
    # Bind
    bindings[str(run_index)] = warehouse_item_id
    layout.warehouse_bindings = json.dumps(bindings)
    await db.commit()
    
    return {
        "status": "success",
        "warehouse_bindings": bindings,
        "area_warning": not area_ok
    }
```

- [ ] **Step 2: Add endpoint to get reserved items**

Add to `router_warehouse.py`:

```python
@router.get("/reserved")
async def get_reserved_items(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    """Return map of warehouse_item_id → list of layout codes that reserve it."""
    layouts_result = await db.execute(
        select(ApplicationLayout).where(
            ApplicationLayout.status == "active",
            ApplicationLayout.warehouse_bindings.isnot(None)
        )
    )
    reserved = {}
    for layout in layouts_result.scalars().all():
        try:
            bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
            runs = json.loads(layout.completed_runs) if layout.completed_runs else []
            for ri, bid in bindings.items():
                ri_int = int(ri)
                # Reserved if run is not yet cut
                if ri_int >= len(runs) or not runs[ri_int]:
                    if bid not in reserved:
                        reserved[bid] = []
                    reserved[bid].append({
                        "layout_code": layout.layout_code,
                        "run_index": ri_int
                    })
        except Exception:
            pass
    return reserved
```

- [ ] **Step 3: Update warehouse list endpoint to include reservation status**

In `router_warehouse.py`, modify the `GET /` endpoint to include `reserved_by` field for each item. Add after the main query:

```python
# Build reservation map
reserved_map = {}
layouts_result = await db.execute(
    select(ApplicationLayout).where(
        ApplicationLayout.status == "active",
        ApplicationLayout.warehouse_bindings.isnot(None)
    )
)
for layout in layouts_result.scalars().all():
    try:
        bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
        runs = json.loads(layout.completed_runs) if layout.completed_runs else []
        for ri, bid in bindings.items():
            ri_int = int(ri)
            if ri_int >= len(runs) or not runs[ri_int]:
                if bid not in reserved_map:
                    reserved_map[bid] = []
                reserved_map[bid].append(layout.layout_code)
    except Exception:
        pass
```

Then in each item's serialization, add `"reserved_by": reserved_map.get(item.id, [])`.

- [ ] **Step 4: Update layout serialization to include warehouse_bindings**

In `router_applications.py`, add `"warehouse_bindings"` to both layout serialization points (list view ~line 733 and detail view ~line 1594):

```python
"warehouse_bindings": json.loads(al.warehouse_bindings) if al.warehouse_bindings else {},
```

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/router_applications.py app/api/v1/router_warehouse.py
git commit -m "feat: add per-run bind/unbind endpoints with reservation and area check"
```

---

## Task 3: Backend — Update toggle-run to use warehouse_bindings

**Covers:** Per-run deduction logic

**Files:**
- Modify: `app/api/v1/router_applications.py`

**Interfaces:**
- Consumes: `ApplicationLayout.warehouse_bindings` (JSON)
- Modifies: `toggle_layout_run` endpoint (line ~1772)

- [ ] **Step 1: Update toggle_layout_run to use per-run bindings**

Replace the warehouse deduction section (lines 1805-1834) with:

```python
    # Per-run warehouse deduction: deduct 1 sheet when marking as cut, return when unmarking
    from datetime import datetime, timezone
    
    # Parse per-run bindings
    run_bindings = {}
    if layout.warehouse_bindings:
        try:
            run_bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
        except Exception:
            run_bindings = {}
    
    bound_wh_id = run_bindings.get(str(run_index))
    if bound_wh_id:
        wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == bound_wh_id))
        wh_item = wh_result.scalar_one_or_none()
        if wh_item:
            if not was_checked and completed[run_index]:
                # Marking sheet as cut — deduct from warehouse
                if wh_item.sheet_count >= 1:
                    wh_item.sheet_count -= 1
                    wh_item.last_deducted_at = datetime.now(timezone.utc)
                    db.add(WarehouseMovement(
                        warehouse_item_id=wh_item.id,
                        application_id=layout.application_id,
                        quantity_change=-1,
                        movement_type="deduction",
                        reason=f"Списание при резке раскладки {layout.layout_code} (рез #{run_index+1})",
                        created_by=user.id,
                    ))
                    # Remove binding after deduction
                    run_bindings.pop(str(run_index), None)
                    layout.warehouse_bindings = json.dumps(run_bindings) if run_bindings else None
            elif was_checked and not completed[run_index]:
                # Unmarking — return sheet to warehouse
                wh_item.sheet_count += 1
                db.add(WarehouseMovement(
                    warehouse_item_id=wh_item.id,
                    application_id=layout.application_id,
                    quantity_change=1,
                    movement_type="return",
                    reason=f"Возврат при отмене резки раскладки {layout.layout_code} (рез #{run_index+1})",
                    created_by=user.id,
                ))
```

- [ ] **Step 2: Commit**

```bash
git add app/api/v1/router_applications.py
git commit -m "feat: toggle-run uses per-run warehouse_bindings for deduction"
```

---

## Task 4: Frontend — Smart Dropdown with Material Filtering

**Covers:** Smart dropdown filtering

**Files:**
- Modify: `frontend/src/pages/Applications/ApplicationDetail.jsx`

**Interfaces:**
- Consumes: `warehouseItems` (from API), `layout` (material/grade/thickness)
- Produces: Filtered dropdown with "Другой лист" option

- [ ] **Step 1: Add state for "show all sheets" toggle**

After `layoutWhSelections` state (line ~171), add:

```javascript
const [showAllSheets, setShowAllSheets] = useState({});
```

- [ ] **Step 2: Replace warehouse dropdown with filtered version**

Replace the `<select>` block (lines ~516-527) with:

```jsx
<select
  value={layoutWhSelections[layout.id] || ''}
  onChange={e => {
    if (e.target.value === '__show_all') {
      setShowAllSheets(prev => ({ ...prev, [layout.id]: true }));
      return;
    }
    setLayoutWhSelections(prev => ({ ...prev, [layout.id]: e.target.value }));
  }}
  style={{flex: 1, padding: '2px 4px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 3}}
>
  <option value="">Склад...</option>
  {(() => {
    const items = warehouseItems.filter(w => w.sheet_count > 0);
    const showAll = showAllSheets[layout.id];
    
    // Match by grade + thickness from layout's material info
    // Layout material comes from app.steel_grade and app.thickness
    const matchingItems = items.filter(w => {
      const gradeMatch = !app.steel_grade || !w.grade || 
        w.grade.toLowerCase() === app.steel_grade.toLowerCase();
      const thicknessMatch = !app.thickness || !w.thickness || 
        w.thickness === app.thickness;
      return gradeMatch && thicknessMatch;
    });
    
    const otherItems = items.filter(w => {
      const gradeMatch = !app.steel_grade || !w.grade || 
        w.grade.toLowerCase() === app.steel_grade.toLowerCase();
      const thicknessMatch = !app.thickness || !w.thickness || 
        w.thickness === app.thickness;
      return !(gradeMatch && thicknessMatch);
    });
    
    const renderOption = (w) => (
      <option key={w.id} value={w.id}>
        {w.article ? w.article + ' | ' : ''}{w.metal} {w.grade ? `/ ${w.grade}` : ''} — {w.sheet_w && w.sheet_h ? `${w.sheet_w}x${w.sheet_h}` : w.size} ({w.sheet_count})
      </option>
    );
    
    return (
      <>
        {matchingItems.map(renderOption)}
        {!showAll && otherItems.length > 0 && (
          <option value="__show_all" style={{fontWeight: 600, color: '#64748b'}}>
            — Другой лист ({otherItems.length}) —
          </option>
        )}
        {showAll && otherItems.map(renderOption)}
      </>
    );
  })()}
</select>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Applications/ApplicationDetail.jsx
git commit -m "feat: smart dropdown filters warehouse by layout material"
```

---

## Task 5: Frontend — Per-Run Binding UI

**Covers:** Per-run binding, visual indicators for unbound runs

**Files:**
- Modify: `frontend/src/pages/Applications/ApplicationDetail.jsx`

**Interfaces:**
- Consumes: `layout.warehouse_bindings` (object), `layout.completed_runs` (array)
- Produces: Per-run binding UI with colored indicators

- [ ] **Step 1: Add bindRun function**

After `unbindLayoutWarehouse` (line ~200), add:

```javascript
const bindRun = async (layoutId, runIndex) => {
  const key = `${layoutId}_${runIndex}`;
  const whId = runSelections[key];
  if (!whId) return alert('Выберите позицию на складе');
  try {
    const res = await client.patch('/api/v1/applications/layouts/' + layoutId + '/bind-run', {
      run_index: runIndex,
      warehouse_item_id: parseInt(whId),
    });
    if (res.data.area_warning) {
      if (!confirm('Лист меньше по площади, чем раскладка. Продолжить?')) {
        return;
      }
    }
    const appRes = await client.get('/api/v1/applications/' + app.id);
    setFullApp(appRes.data);
    setRunSelections(prev => ({ ...prev, [key]: '' }));
    if (onUpdate) onUpdate();
  } catch (err) {
    alert('Ошибка: ' + (err.response?.data?.detail || err.message));
  }
};

const unbindRun = async (layoutId, runIndex) => {
  try {
    await client.patch('/api/v1/applications/layouts/' + layoutId + '/bind-run', {
      run_index: runIndex,
      warehouse_item_id: null,
    });
    const appRes = await client.get('/api/v1/applications/' + app.id);
    setFullApp(appRes.data);
    if (onUpdate) onUpdate();
  } catch (err) {
    alert('Ошибка: ' + (err.response?.data?.detail || err.message));
  }
};
```

- [ ] **Step 2: Add runSelections state**

After `layoutWhSelections` state, add:

```javascript
const [runSelections, setRunSelections] = useState({});
```

- [ ] **Step 3: Replace layout warehouse binding section with per-run UI**

Replace the entire warehouse binding `<div>` (lines ~502-537) with per-run binding UI. Each run gets its own bind/unbind controls:

```jsx
{(user?.role === 'admin' || user?.role === 'operator' || user?.role === 'director') && !isDisabled && (
  <div style={{marginTop: 8, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid var(--border)'}} onClick={e => e.stopPropagation()}>
    {Array.from({length: layoutTotal}, (_, runIdx) => {
      const bindings = layout.warehouse_bindings || {};
      const boundId = bindings[runIdx];
      const isCut = runs[runIdx] || false;
      const selKey = `${layout.id}_${runIdx}`;
      
      return (
        <div key={runIdx} style={{display: 'flex', alignItems: 'center', gap: 4, marginBottom: runIdx < layoutTotal - 1 ? 4 : 0, fontSize: 11}}>
          <span style={{width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, background: isCut ? '#22c55e' : boundId ? '#3b82f6' : '#e2e8f0', color: isCut || boundId ? '#fff' : '#64748b'}}>
            {runIdx + 1}
          </span>
          {boundId ? (
            <div style={{display: 'flex', alignItems: 'center', gap: 4, flex: 1}}>
              <span style={{color: '#166534', fontWeight: 600, fontSize: 10}}>
                {(() => { const w = warehouseItems.find(x => x.id === boundId); return w ? (w.article || `Склад #${w.id}`) : `Склад #${boundId}`; })()}
              </span>
              {!isCut && (
                <button
                  onClick={() => unbindRun(layout.id, runIdx)}
                  style={{fontSize: 9, padding: '0px 4px', borderRadius: 3, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', cursor: 'pointer'}}
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <div style={{display: 'flex', gap: 3, alignItems: 'center', flex: 1}}>
              <select
                value={runSelections[selKey] || ''}
                onChange={e => {
                  if (e.target.value === '__show_all') {
                    setShowAllSheets(prev => ({ ...prev, [selKey]: true }));
                    return;
                  }
                  setRunSelections(prev => ({ ...prev, [selKey]: e.target.value }));
                }}
                style={{flex: 1, padding: '1px 3px', fontSize: 10, border: '1px solid var(--border)', borderRadius: 3}}
              >
                <option value="">Склад...</option>
                {(() => {
                  const items = warehouseItems.filter(w => w.sheet_count > 0);
                  const showAll = showAllSheets[selKey];
                  const matching = items.filter(w => {
                    const gm = !app.steel_grade || !w.grade || w.grade.toLowerCase() === app.steel_grade.toLowerCase();
                    const tm = !app.thickness || !w.thickness || w.thickness === app.thickness;
                    return gm && tm;
                  });
                  const others = items.filter(w => {
                    const gm = !app.steel_grade || !w.grade || w.grade.toLowerCase() === app.steel_grade.toLowerCase();
                    const tm = !app.thickness || !w.thickness || w.thickness === app.thickness;
                    return !(gm && tm);
                  });
                  return (
                    <>
                      {matching.map(w => (
                        <option key={w.id} value={w.id}>{w.article ? w.article + ' | ' : ''}{w.metal} {w.grade ? `/ ${w.grade}` : ''} — {w.sheet_w}x{w.sheet_h} ({w.sheet_count})</option>
                      ))}
                      {!showAll && others.length > 0 && (
                        <option value="__show_all" style={{fontWeight: 600, color: '#64748b'}}>— Другой лист ({others.length}) —</option>
                      )}
                      {showAll && others.map(w => (
                        <option key={w.id} value={w.id}>{w.article ? w.article + ' | ' : ''}{w.metal} {w.grade ? `/ ${w.grade}` : ''} — {w.sheet_w}x{w.sheet_h} ({w.sheet_count})</option>
                      ))}
                    </>
                  );
                })()}
              </select>
              <button
                onClick={() => bindRun(layout.id, runIdx)}
                style={{fontSize: 9, padding: '1px 4px', borderRadius: 3, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'}}
              >
                Привязать
              </button>
            </div>
          )}
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Applications/ApplicationDetail.jsx
git commit -m "feat: per-run binding UI with smart dropdown and colored indicators"
```

---

## Task 6: Frontend — Visual Indicators for Cut Layouts

**Covers:** Unbound layout highlighting, green squares for unbound runs

**Files:**
- Modify: `frontend/src/pages/Applications/ApplicationDetail.jsx`

**Interfaces:**
- Consumes: `layout.warehouse_bindings`, `layout.completed_runs`
- Produces: Highlighted unbound layouts in cut status

- [ ] **Step 1: Add unbound indicator in layout card header**

In the layout rendering (around line ~440), after the layout code display, add a badge if layout is cut but has unbound runs:

```jsx
{/* After layout code / machine_type display */}
{(() => {
  const bindings = layout.warehouse_bindings || {};
  const unboundRuns = Array.from({length: layoutTotal}, (_, i) => {
    const isCut = runs[i] || false;
    const hasBinding = bindings[i] != null;
    return isCut && !hasBinding;
  }).filter(Boolean).length;
  
  if (unboundRuns > 0 && isComplete) {
    return (
      <span style={{fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', marginLeft: 6}}>
        {unboundRuns} без листа
      </span>
    );
  }
  return null;
})()}
```

- [ ] **Step 2: Update run squares to show binding status**

Replace the run squares rendering (lines ~482-499) with enhanced version showing binding status:

```jsx
<div style={{display: 'flex', gap: 3, marginTop: 6}}>
  {Array.from({length: layoutTotal}, (_, i) => {
    const done = runs[i] || false;
    const bindings = layout.warehouse_bindings || {};
    const hasBinding = bindings[i] != null;
    return (
      <div
        key={i}
        style={{
          width: 20, height: 20, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 600,
          background: done ? '#22c55e' : hasBinding ? '#3b82f6' : '#e2e8f0',
          color: done || hasBinding ? '#fff' : '#64748b',
          border: done ? '2px solid #16a34a' : hasBinding ? '2px solid #2563eb' : '1px solid #cbd5e1'
        }}
      >
        {i + 1}
      </div>
    );
  })}
</div>
```

- [ ] **Step 3: Update layout card background for unbound cut layouts**

In the layout card container style (around line ~430), add conditional background:

```jsx
style={{
  // ... existing styles
  background: isComplete && Object.keys(layout.warehouse_bindings || {}).length === 0 
    ? '#fef2f2'  // Red tint for cut but unbound
    : isComplete ? '#f0fdf4' : '#fff',
  borderLeft: isComplete && Object.keys(layout.warehouse_bindings || {}).length === 0
    ? '3px solid #ef4444' : undefined,
}}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Applications/ApplicationDetail.jsx
git commit -m "feat: visual indicators for unbound cut layouts and per-run binding status"
```

---

## Task 7: Frontend — Reservation Display in Warehouse Dropdown

**Covers:** Sheet reservation visual feedback

**Files:**
- Modify: `frontend/src/pages/Applications/ApplicationDetail.jsx`

**Interfaces:**
- Consumes: `warehouseItems` with `reserved_by` field
- Produces: Reserved items shown with distinct styling in dropdown

- [ ] **Step 1: Add reserved items state and fetch**

In `fetchWarehouseItems` (line ~143), also fetch reserved items:

```javascript
const fetchWarehouseItems = async () => {
  try {
    const [itemsRes, reservedRes] = await Promise.all([
      client.get('/api/v1/warehouse/'),
      client.get('/api/v1/warehouse/reserved').catch(() => ({ data: {} })),
    ]);
    setWarehouseItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
    setReservedItems(reservedRes.data || {});
  } catch (err) {
    console.error('Failed to load warehouse', err);
  }
};
```

Add state:

```javascript
const [reservedItems, setReservedItems] = useState({});
```

- [ ] **Step 2: Update dropdown to show reservation status**

In the dropdown option rendering, append reservation info:

```jsx
<option key={w.id} value={w.id} disabled={reservedBy.length > 0 && !isCurrentBinding}>
  {w.article ? w.article + ' | ' : ''}{w.metal} {w.grade ? `/ ${w.grade}` : ''} — {w.sheet_w}x{w.sheet_h} ({w.sheet_count})
  {reservedBy.length > 0 ? ` 🔒 ${reservedBy[0]}` : ''}
</option>
```

Where `reservedBy = reservedItems[w.id] || []` and `isCurrentBinding` checks if this item is already bound to the current run.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Applications/ApplicationDetail.jsx
git commit -m "feat: show reservation status in warehouse dropdown"
```

---

## Task 8: Deploy and Verify

**Covers:** All features end-to-end

**Files:**
- None (deployment only)

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Run SQL migration in Docker**

```bash
docker exec laser-cut-backend-backend-1 python scripts/apply_sql_migrations.py
```

- [ ] **Step 2: Rebuild frontend**

```bash
docker compose build frontend
docker compose up -d frontend
```

- [ ] **Step 3: Restart backend**

```bash
docker compose restart backend
```

- [ ] **Step 4: Flush Redis cache**

```bash
docker exec laser-cut-backend-redis-1 redis-cli FLUSHALL
```

- [ ] **Step 5: Verify in browser**

1. Open application detail with a layout
2. Check dropdown shows matching material first + "Другой лист" option
3. Bind different runs to different sheets
4. Mark a run as cut — verify deduction and binding removal
5. Check reserved items show locked status
6. Check unbound cut layouts show red indicator

- [ ] **Step 6: Commit all changes**

```bash
git add -A
git commit -m "feat: warehouse-layout binding improvements - per-run, smart dropdown, reservation"
```
