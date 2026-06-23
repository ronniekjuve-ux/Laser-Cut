import React from 'react';

export default function ConfirmModal({ title, message, onConfirm, onCancel, confirmText = 'Удалить', danger = true }) {
  return (
    <div className="modal-overlay active" onClick={onCancel} style={{ zIndex: 2000 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 400, borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ padding: '24px 24px 0', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
            background: danger ? '#fee2e2' : '#dbeafe',
          }}>
            {danger ? '⚠️' : '❓'}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div style={{ padding: '20px 24px 24px', display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            className="btn"
            onClick={onCancel}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: '1px solid var(--border)', background: '#fff', cursor: 'pointer',
              flex: 1,
            }}
          >
            Отмена
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', flex: 1,
              background: danger ? '#ef4444' : '#3b82f6',
              color: '#fff',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
