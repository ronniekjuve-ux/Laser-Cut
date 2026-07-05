import React, { useState, useCallback } from 'react';
import MobileLayoutCarousel from './MobileLayoutCarousel';
import LayoutPreviewModal from './LayoutPreviewModal';
import client from '../api/client';

const STATUS_CONFIG = {
  approved: { label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  partially_cut: { label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  cut: { label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
};

const PRIORITY_OPTIONS = [
  { key: 'low', label: '🟢 Низкий', bg: '#f0fdf4', color: '#15803d' },
  { key: 'medium', label: '🔵 Средний', bg: '#eff6ff', color: '#1d4ed8' },
  { key: 'high', label: '🟠 Высокий', bg: '#fff7ed', color: '#c2410c' },
  { key: 'urgent', label: '🔴 Срочно', bg: '#fef2f2', color: '#dc2626' },
];

function ProgressPopup({ allLayouts, onClose }) {
  const totalSheets = allLayouts.reduce((sum, l) => sum + (l.sheet_count || 1), 0);
  const cutSheets = allLayouts.reduce((sum, l) => {
    const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
    return sum + runs.filter(Boolean).length;
  }, 0);

  return (
    <div className="modal-overlay active" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 70, left: 12, right: 12,
          background: '#fff', borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Прогресс заказа</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: cutSheets === totalSheets ? '#047857' : '#0f172a' }}>
            {cutSheets}/{totalSheets}
          </span>
        </div>
        <div style={{ padding: '8px 14px', maxHeight: 250, overflowY: 'auto' }}>
          {allLayouts.map((layout, i) => {
            const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
            const done = runs.filter(Boolean).length;
            const total = layout.sheet_count || 1;
            const isComplete = done >= total;
            return (
              <div key={layout.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: i < allLayouts.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 50 }}>
                  {layout.layout_code || String(i + 1).padStart(3, '0')}
                </span>
                <div style={{ flex: 1, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from({ length: total }, (_, j) => {
                    const d = runs[j] || false;
                    return (
                      <div key={j} style={{
                        width: 20, height: 20, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 600, background: d ? '#22c55e' : '#e2e8f0',
                        color: d ? '#fff' : '#94a3b8',
                      }}>
                        {j + 1}
                      </div>
                    );
                  })}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, minWidth: 30, textAlign: 'right',
                  color: isComplete ? '#047857' : '#64748b',
                }}>
                  {done}/{total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MobileOrderCard({ app, showProgress = true }) {
  const [previewLayout, setPreviewLayout] = useState(null);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const [showProgressPopup, setShowProgressPopup] = useState(false);
  const [priorityDropdown, setPriorityDropdown] = useState(false);
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const material = app.steel_grade || app.material || '-';
  const priority = app.priority || 'medium';
  const layouts = app.layouts || [];

  const allLayouts = layouts.length > 0
    ? layouts
    : (app.layout_image ? [{ id: 0, layout_code: '001', layout_image: app.layout_image, sheet_size: app.sheet_size, sheet_count: app.sheet_count }] : []);

  const currentLayout = allLayouts[activeLayoutIndex] || {};
  const totalSheetCount = allLayouts.reduce((sum, l) => sum + (l.sheet_count || 0), 0);
  const currentSheetCount = currentLayout.sheet_count || 0;

  const totalSheetsAll = allLayouts.reduce((sum, l) => sum + (l.sheet_count || 1), 0);
  const cutSheetsAll = allLayouts.reduce((sum, l) => {
    const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
    return sum + runs.filter(Boolean).length;
  }, 0);

  const openPreview = useCallback(() => {
    if (allLayouts.length > 0) {
      setPreviewLayout(allLayouts[activeLayoutIndex]);
    }
  }, [allLayouts, activeLayoutIndex]);

  const changePriority = async (e, newPriority) => {
    e.stopPropagation();
    setPriorityDropdown(false);
    try {
      await client.patch('/api/v1/applications/' + app.id + '/priority?priority=' + newPriority);
    } catch {
      alert('Ошибка');
    }
  };

  const priorityConf = PRIORITY_OPTIONS.find(p => p.key === priority) || PRIORITY_OPTIONS[1];

  return (
    <>
      <div
        className={`order-card priority-${priority}`}
        onClick={openPreview}
      >
        <MobileLayoutCarousel
          layouts={allLayouts}
          appId={app.id}
          onActiveIndexChange={setActiveLayoutIndex}
        />
        <div className="order-card-body">
          <div className="order-card-customer">{app.customer || '-'}</div>
          <div className="order-card-meta">
            <span>{material}</span>
            <span>{app.thickness ? `${app.thickness} мм` : ''}</span>
            {currentLayout.sheet_size && <span>{currentLayout.sheet_size}</span>}
            {currentSheetCount > 0 && (
              <span>{currentSheetCount}{totalSheetCount > currentSheetCount ? `/${totalSheetCount}` : ''} лист.</span>
            )}
          </div>
          {showProgress && totalSheetsAll > 0 && (
            <div style={{ fontSize: 12, color: cutSheetsAll === totalSheetsAll ? '#047857' : '#64748b', marginTop: 4, fontWeight: 500 }}>
              Всего вырезано: <span style={{ fontWeight: 700, color: cutSheetsAll === totalSheetsAll ? '#047857' : '#0f172a' }}>{cutSheetsAll}/{totalSheetsAll}</span>
            </div>
          )}
          <div className="order-card-footer">
            <span
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: status.bg, color: status.color,
              }}
            >
              {status.label}
            </span>
            {/* Priority selector (admin/director only) */}
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <span
                onClick={() => setPriorityDropdown(!priorityDropdown)}
                style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: priorityConf.bg, color: priorityConf.color,
                  border: '1px solid ' + priorityConf.bg,
                }}
              >
                {priorityConf.label} ▾
              </span>
              {priorityDropdown && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, zIndex: 100, marginBottom: 4,
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, overflow: 'hidden',
                }}>
                  {PRIORITY_OPTIONS.map(p => (
                    <div
                      key={p.key}
                      onClick={(e) => changePriority(e, p.key)}
                      style={{
                        padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                        fontWeight: priority === p.key ? 600 : 400,
                        background: priority === p.key ? p.bg : '#fff',
                        color: priority === p.key ? p.color : '#334155',
                      }}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            {/* Progress icon for multi-layout orders */}
            {showProgress && allLayouts.length > 1 && (
              <span
                onClick={(e) => { e.stopPropagation(); setShowProgressPopup(true); }}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: cutSheetsAll === totalSheetsAll ? '#d1fae5' : '#eff6ff',
                  color: cutSheetsAll === totalSheetsAll ? '#047857' : '#1d4ed8',
                  border: '1px solid ' + (cutSheetsAll === totalSheetsAll ? '#bbf7d0' : '#bfdbfe'),
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}
              >
                📊 {cutSheetsAll}/{totalSheetsAll}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
              #{app.id}
            </span>
          </div>
        </div>
      </div>

      {previewLayout && (
        <LayoutPreviewModal
          appId={app.id}
          layoutId={previewLayout.id}
          allLayoutIds={allLayouts.map(l => l.id)}
          onClose={() => setPreviewLayout(null)}
        />
      )}

      {showProgressPopup && (
        <ProgressPopup allLayouts={allLayouts} onClose={() => setShowProgressPopup(false)} />
      )}
    </>
  );
}
