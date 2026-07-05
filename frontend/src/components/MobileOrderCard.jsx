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

export default function MobileOrderCard({ app }) {
  const [previewLayout, setPreviewLayout] = useState(null);
  const [activeLayoutIndex, setActiveLayoutIndex] = useState(0);
  const [localLayouts, setLocalLayouts] = useState(null);
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const material = app.steel_grade || app.material || '-';
  const priority = app.priority || 'medium';
  const layouts = localLayouts || app.layouts || [];

  const allLayouts = layouts.length > 0
    ? layouts
    : (app.layout_image ? [{ id: 0, layout_code: '001', layout_image: app.layout_image, sheet_size: app.sheet_size, sheet_count: app.sheet_count }] : []);

  const currentLayout = allLayouts[activeLayoutIndex] || {};
  const totalSheetCount = allLayouts.reduce((sum, l) => sum + (l.sheet_count || 0), 0);
  const currentSheetCount = currentLayout.sheet_count || 0;

  const openPreview = useCallback(() => {
    if (allLayouts.length > 0) {
      setPreviewLayout(allLayouts[activeLayoutIndex]);
    }
  }, [allLayouts, activeLayoutIndex]);

  const toggleRun = useCallback(async (e, layoutId, runIndex) => {
    e.stopPropagation();
    try {
      const res = await client.patch('/api/v1/applications/layouts/' + layoutId + '/toggle-run?run_index=' + runIndex);
      setLocalLayouts(prev => {
        const current = prev || app.layouts || [];
        return current.map(l => l.id === layoutId ? { ...l, completed_runs: res.data.completed_runs } : l);
      });
    } catch {
      alert('Ошибка');
    }
  }, [app.layouts]);

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
          <div className="order-card-footer">
            <span
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: status.bg, color: status.color,
              }}
            >
              {status.label}
            </span>
            {allLayouts.length === 1 && allLayouts[0].sheet_count >= 1 && (() => {
              const layout = allLayouts[0];
              const runs = Array.isArray(layout.completed_runs) ? layout.completed_runs : [];
              const done = runs[0] || false;
              return (
                <div
                  onClick={(e) => toggleRun(e, layout.id, 0)}
                  style={{
                    width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    background: done ? '#22c55e' : '#e2e8f0',
                    color: done ? '#fff' : '#64748b',
                    border: done ? '2px solid #16a34a' : '2px solid transparent',
                  }}
                >
                  {done ? '✓' : '1'}
                </div>
              );
            })()}
            {allLayouts.length > 1 && (() => {
              const totalSheets = allLayouts.reduce((sum, l) => sum + (l.sheet_count || 1), 0);
              const cutSheets = allLayouts.reduce((sum, l) => {
                const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
                return sum + runs.filter(Boolean).length;
              }, 0);
              if (cutSheets > 0 && cutSheets < totalSheets) {
                return (
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: '#fef3c7', color: '#92400e',
                  }}>
                    {cutSheets}/{totalSheets} лист
                  </span>
                );
              }
              return null;
            })()}
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
