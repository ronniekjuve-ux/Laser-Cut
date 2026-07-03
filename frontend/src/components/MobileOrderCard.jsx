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

export default function MobileOrderCard({ app }) {
  const [previewLayout, setPreviewLayout] = useState(null);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const material = app.steel_grade || app.material || '-';
  const priority = app.priority || 'medium';
  const layouts = app.layouts || [];

  const allLayouts = layouts.length > 0
    ? layouts
    : (app.layout_image ? [{ id: 0, layout_code: '001', layout_image: app.layout_image }] : []);

  const handleLayoutClick = (layoutIndex) => {
    setActiveLayoutIndex(layoutIndex);
    if (allLayouts.length > 0) {
      setPreviewLayout(allLayouts[layoutIndex]);
    }
  };

  const handleCardBodyClick = () => {
    if (allLayouts.length > 0) {
      setPreviewLayout(allLayouts[activeLayoutIndex]);
    }
  };

  return (
    <>
      <div className={`order-card priority-${priority}`}>
        <MobileLayoutCarousel
          layouts={allLayouts}
          appId={app.id}
          onLayoutClick={handleLayoutClick}
          onActiveIndexChange={setActiveLayoutIndex}
        />
        <div className="order-card-body" onClick={handleCardBodyClick}>
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
