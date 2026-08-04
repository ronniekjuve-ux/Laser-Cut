import React, { useState } from 'react';
import client from '../api/client';

const STATUS_CONFIG = {
  approved: { label: 'В очереди', cls: 'bg-approved' },
  in_progress: { label: 'В резке', cls: 'bg-work' },
  partially_cut: { label: 'Частично', cls: 'bg-work' },
  cut: { label: 'Вырезано', cls: 'bg-done' },
};

const PRIORITY_OPTIONS = [
  { key: 'low', label: 'Низкий', cls: 'priority-low', icon: '🟢' },
  { key: 'medium', label: 'Средний', cls: 'priority-medium', icon: '🔵' },
  { key: 'high', label: 'Высокий', cls: 'priority-high', icon: '🟠' },
  { key: 'urgent', label: 'Срочно', cls: 'priority-urgent', icon: '🔴' },
];

function ViewToggle({ mode, onChange }) {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn ${mode === 'table' ? 'active' : ''}`}
        onClick={() => onChange('table')}
        title="Таблица"
      >
        ☰
      </button>
      <button
        className={`view-toggle-btn ${mode === 'cards' ? 'active' : ''}`}
        onClick={() => onChange('cards')}
        title="Карточки"
      >
        ⊞
      </button>
    </div>
  );
}

function LayoutImage({ layouts, layoutImage }) {
  const [idx, setIdx] = useState(0);
  const all = layouts && layouts.length > 0
    ? layouts
    : (layoutImage ? [{ id: 0, layout_code: '001', layout_image: layoutImage }] : []);
  const current = all[idx] || all[0] || {};
  if (!current.layout_image) return null;

  return (
    <div className="desktop-card-image">
      <img src={current.layout_image} alt="раскладка" />
      {all.length > 1 && (
        <div className="desktop-card-image-nav" onClick={e => e.stopPropagation()}>
          <button onClick={() => setIdx(i => (i - 1 + all.length) % all.length)}>‹</button>
          <span>{idx + 1}/{all.length}</span>
          <button onClick={() => setIdx(i => (i + 1) % all.length)}>›</button>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority, appId, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const p = PRIORITY_OPTIONS.find(o => o.key === priority) || PRIORITY_OPTIONS[1];

  const changePriority = async (e, newPriority) => {
    e.stopPropagation();
    setOpen(false);
    try {
      await client.patch('/api/v1/applications/' + appId + '/priority?priority=' + newPriority);
      if (onChange) onChange(newPriority);
    } catch { alert('Ошибка'); }
  };

  const toggleDrop = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  return (
    <span className="desktop-card-priority-wrap" onClick={e => e.stopPropagation()}>
      <span
        className={`desktop-card-priority-click ${p.cls}`}
        onClick={toggleDrop}
        title="Изменить приоритет"
      >
        {p.icon} {p.label}
      </span>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="desktop-card-priority-dropdown" style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 1000 }}>
            {PRIORITY_OPTIONS.map(opt => (
              <div
                key={opt.key}
                className={`desktop-card-priority-option ${opt.key === priority ? 'active' : ''}`}
                onClick={(e) => changePriority(e, opt.key)}
              >
                {opt.icon} {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

function OrderCard({ app, onClick, onReupload, onEdit, onDelete, onCalc }) {
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const created = app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '';
  const [priority, setPriority] = useState(app.priority || 'medium');
  const [showHistory, setShowHistory] = React.useState(false);
  const layouts = app.layouts || [];
  const hasRuns = layouts.some(l => {
    const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
    return runs.some(Boolean);
  });

  return (
    <div className={`desktop-card priority-${priority}`} onClick={() => onClick(app)}>
      <LayoutImage layouts={app.layouts} layoutImage={app.layout_image} />
      <div className="desktop-card-header">
        <span className="desktop-card-id">#{app.id}</span>
        <span className={`desktop-card-badge badge ${status.cls}`}>{status.label}</span>
      </div>
      <div className="desktop-card-customer" title={app.customer}>{app.customer || '—'}</div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Мат:</span>
          <span className="desktop-card-meta-value">{app.steel_grade || app.material || '—'}</span>
        </span>
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Толщ:</span>
          <span className="desktop-card-meta-value">{app.thickness ? app.thickness + ' мм' : '—'}</span>
        </span>
        <PriorityBadge priority={priority} appId={app.id} onChange={setPriority} />
      </div>
      <div className="desktop-card-tags">
        {app.group_name && <span className="desktop-card-tag tag-group">{app.group_name}</span>}
        {app.machine && <span className="desktop-card-tag tag-machine">{app.machine}</span>}
        {app.supply_material && <span className="desktop-card-tag tag-supply">Дав. мат</span>}
      </div>
      <div className="desktop-card-footer">
        <span>{created}</span>
        <div className="desktop-card-actions" onClick={e => e.stopPropagation()}>
          {onCalc && <button className="btn btn-sm" onClick={() => onCalc(app)} title="Калькулятор" style={{ padding: '2px 6px', fontSize: 11 }}>🧮</button>}
          {hasRuns && <button className="btn btn-sm" onClick={() => setShowHistory(true)} title="История" style={{ padding: '2px 6px', fontSize: 11 }}>📋</button>}
          {onReupload && <button className="btn btn-sm" onClick={() => onReupload(app)} title="Перезагрузить" style={{ padding: '2px 6px', fontSize: 11 }}>📤</button>}
          {onEdit && <button className="btn btn-sm" onClick={() => onEdit(app)} title="Редактировать" style={{ padding: '2px 6px', fontSize: 11 }}>✏️</button>}
          {onDelete && <button className="btn btn-sm" onClick={() => onDelete(app.id)} title="Удалить" style={{ padding: '2px 6px', fontSize: 11, color: '#ef4444' }}>🗑</button>}
        </div>
      </div>
      {showHistory && <CutHistoryModal app={app} onClose={() => setShowHistory(false)} showHeader={false} />}
    </div>
  );
}

function ApplicationCard({ app, onClick }) {
  const created = app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '';

  return (
    <div className="desktop-card" onClick={() => onClick(app)}>
      <LayoutImage layouts={app.layouts} layoutImage={app.layout_image} />
      <div className="desktop-card-header">
        <span className="desktop-card-id">#{app.id}</span>
        <span className="desktop-card-badge badge bg-approved">Заявка</span>
      </div>
      <div className="desktop-card-customer" title={app.customer}>{app.customer || '—'}</div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Мат:</span>
          <span className="desktop-card-meta-value">{app.steel_grade || app.material || '—'}</span>
        </span>
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Толщ:</span>
          <span className="desktop-card-meta-value">{app.thickness ? app.thickness + ' мм' : '—'}</span>
        </span>
        {app.supply_material && (
          <span className="desktop-card-meta-item">
            <span className="desktop-card-tag tag-supply">Дав. мат</span>
          </span>
        )}
      </div>
      <div className="desktop-card-tags">
        {app.group_name && <span className="desktop-card-tag tag-group">{app.group_name}</span>}
      </div>
      <div className="desktop-card-footer">
        <span>{created}</span>
        {app.comments && <span title={app.comments}>📝</span>}
      </div>
    </div>
  );
}

function CutHistoryModal({ app, onClose, showHeader = true }) {
  if (!app) return null;
  const layouts = (app.layouts || []).slice().sort((a, b) => {
    const ca = (a.layout_code || '').localeCompare(b.layout_code || '');
    return ca;
  });
  const cutAt = app.cut_at ? new Date(app.cut_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>История вырезки — #{app.id} {app.customer || ''}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {showHeader && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#475569' }}>
              <div><strong>Станок:</strong> {app.machine || '—'}</div>
              <div><strong>Материал:</strong> {app.steel_grade || app.material || '—'} {app.thickness ? app.thickness + 'мм' : ''}</div>
              {cutAt && <div><strong>Завершено:</strong> {cutAt}</div>}
            </div>
          )}
          {layouts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {layouts.map((layout, li) => {
                const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
                const total = layout.sheet_count || 1;
                return (
                  <div key={layout.id || li} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ padding: '6px 10px', background: '#f8fafc', fontWeight: 600, fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Раскладка {layout.layout_code || String(li + 1).padStart(3, '0')}</span>
                      <span>{runs.filter(Boolean).length}/{total} лист.</span>
                    </div>
                    <div style={{ padding: '6px 10px' }}>
                      {Array.from({ length: total }, (_, si) => {
                        const run = runs[si];
                        if (!run) return (
                          <div key={si} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, color: '#94a3b8', borderBottom: si < total - 1 ? '1px solid #f1f5f9' : 'none' }}>
                            <span>Лист {si + 1}</span>
                            <span>Не вырезан</span>
                          </div>
                        );
                        const isObj = typeof run === 'object' && run !== null;
                        const cutBy = isObj ? run.cut_by : null;
                        const cutTime = isObj && run.cut_at ? new Date(run.cut_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                        return (
                          <div key={si} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, color: '#047857', borderBottom: si < total - 1 ? '1px solid #f1f5f9' : 'none' }}>
                            <span>Лист {si + 1}{cutBy ? ` — ${cutBy}` : ''}</span>
                            <span>{cutTime || '✓'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {layouts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>Нет данных о раскладках</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompletedCard({ app, onClick, onCancelCut, onCalc, onReturn }) {
  const created = app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '';
  const cutAt = app.cut_at ? new Date(app.cut_at).toLocaleDateString('ru-RU') : '';
  const layouts = app.layouts || [];
  const [showHistory, setShowHistory] = React.useState(false);

  return (
    <div className="desktop-card" onClick={() => onClick(app)}>
      <LayoutImage layouts={app.layouts} layoutImage={app.layout_image} />
      <div className="desktop-card-header">
        <span className="desktop-card-id">#{app.id}</span>
        <span className={`desktop-card-badge badge bg-done`}>Вырезано</span>
      </div>
      <div className="desktop-card-customer" title={app.customer}>{app.customer || '—'}</div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Мат:</span>
          <span className="desktop-card-meta-value">{app.steel_grade || app.material || '—'}</span>
        </span>
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Толщ:</span>
          <span className="desktop-card-meta-value">{app.thickness ? app.thickness + ' мм' : '—'}</span>
        </span>
        {app.machine && (
          <span className="desktop-card-meta-item">
            <span className="desktop-card-meta-label">Станок:</span>
            <span className="desktop-card-meta-value">{app.machine}</span>
          </span>
        )}
      </div>
      <div className="desktop-card-footer">
        <span>Поступил: {created}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span>Выполнен: {cutAt}</span>
          {onCalc && (
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onCalc(app); }} title="Калькулятор" style={{ padding: '2px 6px', fontSize: 11 }}>
              🧮
            </button>
          )}
          {(app.cut_by || cutAt) && (
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setShowHistory(true); }} title="История" style={{ padding: '2px 6px', fontSize: 11, background: '#f0f9ff', color: '#1d4ed8', border: '1px solid #bae6fd' }}>
              📋
            </button>
          )}
          {onReturn && (
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onReturn(app); }} title="Вернуть в резку" style={{ padding: '2px 6px', fontSize: 11, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
              ↩
            </button>
          )}
        </div>
      </div>
      {showHistory && <CutHistoryModal app={app} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function SheetShape({ item }) {
  if (!item.sheet_w || !item.sheet_h) return null;
  const MAX_W = 1500;
  const MAX_H = 6000;
  const svgW = 180;
  const svgH = 50;
  const scale = Math.min(svgW / MAX_H, svgH / MAX_W);
  const boxW = MAX_H * scale;
  const boxH = MAX_W * scale;
  const pad = 2;

  const vertices = item.vertices;
  if (vertices && vertices.length > 2) {
    const pts = vertices.map(v => `${v[1] * scale + pad},${v[0] * scale + pad}`).join(' ');
    return (
      <svg viewBox={`0 0 ${boxW + pad * 2} ${boxH + pad * 2}`} style={{ width: '100%', height: '100%' }}>
        <rect x={pad} y={pad} width={boxW} height={boxH} fill="none" stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2" rx="1" />
        <polygon points={pts} fill="#b0b8c4" stroke="#8892a0" strokeWidth="1" />
      </svg>
    );
  }

  const sheetW = item.sheet_h * scale;
  const sheetH = item.sheet_w * scale;
  const offsetX = (boxW - sheetW) / 2;
  const offsetY = (boxH - sheetH) / 2;

  return (
    <svg viewBox={`0 0 ${boxW + pad * 2} ${boxH + pad * 2}`} style={{ width: '100%', height: '100%' }}>
      <rect x={pad} y={pad} width={boxW} height={boxH} fill="none" stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2" rx="1" />
      <rect x={offsetX + pad} y={offsetY + pad} width={sheetW} height={sheetH} fill="#b0b8c4" stroke="#8892a0" strokeWidth="1" rx="1" />
    </svg>
  );
}

function WarehouseCard({ item, onClick, onEdit, onDeduct, onCut, onMerge, onDelete }) {
  const created = item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '';
  const dims = (item.sheet_w && item.sheet_h) ? `${item.sheet_w}×${item.sheet_h}` : '—';

  return (
    <div className="desktop-card" onClick={() => onClick && onClick(item)}>
      <div className="desktop-card-warehouse-shape">
        <SheetShape item={item} />
      </div>
      <div className="desktop-card-header">
        <span className="desktop-card-id">{item.article || '—'}</span>
      </div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Владелец:</span>
          <span className="desktop-card-meta-value">{item.owner || '—'}</span>
        </span>
      </div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Материал:</span>
          <span className="desktop-card-meta-value">{[item.metal, item.grade].filter(Boolean).join(' ') || '—'}</span>
        </span>
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Толщ:</span>
          <span className="desktop-card-meta-value">{item.thickness ? item.thickness + ' мм' : '—'}</span>
        </span>
      </div>
      <div className="desktop-card-meta">
        <span className="desktop-card-meta-item">
          <span className="desktop-card-meta-label">Размер:</span>
          <span className="desktop-card-meta-value">{dims}</span>
        </span>
        {item.bound_to && (
          <span className="desktop-card-meta-item">
            <span className="desktop-card-tag tag-group">{item.bound_to}</span>
          </span>
        )}
      </div>
      <div className="desktop-card-footer">
        <span>Вес: {item.weight ? (item.weight).toFixed(1) + ' кг' : '—'}</span>
        <span>{created}</span>
        <div className="desktop-card-actions" onClick={e => e.stopPropagation()}>
          {onEdit && <button className="btn btn-sm" onClick={() => onEdit(item)} title="Редактировать">✏️</button>}
          {item.sheet_count > 0 && onDeduct && <button className="btn btn-sm" onClick={() => onDeduct(item)} title="Списание" style={{ background: '#fef3c7', color: '#92400e' }}>↓</button>}
          {item.sheet_count > 0 && item.sheet_w && item.sheet_h && onCut && <button className="btn btn-sm" onClick={() => onCut(item)} title="Резка" style={{ background: '#dbeafe', color: '#1d4ed8' }}>✂️</button>}
          {item.sheet_count > 0 && item.parent_article && onMerge && <button className="btn btn-sm" onClick={() => onMerge(item)} title="Откат разрезания" style={{ color: '#991b1b' }}>↩</button>}
          {onDelete && <button className="btn btn-sm" onClick={() => onDelete(item.id)} title="Удалить" style={{ color: '#ef4444' }}>🗑</button>}
        </div>
      </div>
    </div>
  );
}

function DeficitCard({ row, onClick }) {
  const balance = row.deficit_sheets;
  const balanceCls = balance > 0 ? 'negative' : balance < 0 ? 'positive' : 'neutral';

  return (
    <div className="desktop-card" onClick={() => onClick && onClick(row)}>
      <div className="desktop-card-header">
        <span className="desktop-card-customer">{row.grade || '—'}</span>
        <span className="desktop-card-meta-value">{row.thickness ? row.thickness + ' мм' : ''}</span>
      </div>
      <div className="desktop-card-deficit-grid">
        <div className="desktop-card-deficit-cell">
          <span className="desktop-card-deficit-label">Заказ, листы</span>
          <span className="desktop-card-deficit-value">{row.demand_sheets_std || 0}</span>
        </div>
        <div className="desktop-card-deficit-cell">
          <span className="desktop-card-deficit-label">Склад, листы</span>
          <span className="desktop-card-deficit-value">{row.stock_sheets || 0}</span>
        </div>
        <div className="desktop-card-deficit-cell">
          <span className="desktop-card-deficit-label">Заказ, м²</span>
          <span className="desktop-card-deficit-value">{row.demand_area ? row.demand_area.toFixed(1) : '0'}</span>
        </div>
        <div className="desktop-card-deficit-cell">
          <span className="desktop-card-deficit-label">Склад, м²</span>
          <span className="desktop-card-deficit-value">{row.stock_area ? row.stock_area.toFixed(1) : '0'}</span>
        </div>
      </div>
      <div className="desktop-card-footer">
        <span>Баланс:</span>
        <span className={`desktop-card-deficit-value ${balanceCls}`}>
          {balance > 0 ? '+' : ''}{balance} лист.
        </span>
      </div>
    </div>
  );
}

export { ViewToggle, OrderCard, ApplicationCard, CompletedCard, WarehouseCard, DeficitCard };
