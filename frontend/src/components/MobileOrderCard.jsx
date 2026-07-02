import React from 'react';

const STATUS_CONFIG = {
  approved: { label: 'В очереди', bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { label: 'В резке', bg: '#fef3c7', color: '#b45309' },
  partially_cut: { label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
  cut: { label: 'Вырезано', bg: '#d1fae5', color: '#047857' },
};

export default function MobileOrderCard({ app, onClick }) {
  const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.approved;
  const material = app.steel_grade || app.material || '-';

  return (
    <div className="order-card" onClick={() => onClick(app)}>
      {app.layout_image ? (
        <img
          className="order-card-image"
          src={app.layout_image}
          alt={`Раскладка #${app.id}`}
          loading="lazy"
        />
      ) : (
        <div className="order-card-no-image">Нет изображения</div>
      )}
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
    </div>
  );
}
