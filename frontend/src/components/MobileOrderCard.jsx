import React, { useState, useCallback } from 'react';
import MobileLayoutCarousel from './MobileLayoutCarousel';
import LayoutPreviewModal from './LayoutPreviewModal';

const STATUS_CONFIG = {
  approved: { label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  partially_cut: { label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  cut: { label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
};

export default function MobileOrderCard({ app }) {
  const [previewLayout, setPreviewLayout] = useState(null);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
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

  // Total progress across ALL layouts (independent of carousel position)
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
          {totalSheetsAll > 0 && (
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
