import React, { useState } from 'react';
import client from '../../api/client';

export default function EditModal({ app, onClose, onSaved }) {
  const [customerName, setCustomerName] = useState(app.customer || '');
  const [material, setMaterial] = useState(app.steel_grade || app.material || '');
  const [machineType, setMachineType] = useState(app.machine || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        customer_name: customerName,
        steel_grade: material,
      };
      if (machineType === 'станок 1') body.machine_type = 'CNF';
      else if (machineType === 'станок 2') body.machine_type = 'FNF';
      else if (machineType) body.machine_type = machineType;
      await client.patch('/api/v1/applications/' + app.id + '/edit', body);
      onSaved();
    } catch (err) {
      alert('Ошибка сохранения: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <h3>Редактирование — #{app.id} {app.order_name || ''}</h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Заказчик</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Название заказчика"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Материал / Марка стали</label>
            <input
              type="text"
              value={material}
              onChange={e => setMaterial(e.target.value)}
              placeholder="Например: ст3, нерж, 09Г2С"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>Станок</label>
            <select
              value={machineType}
              onChange={e => setMachineType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="">— не указан —</option>
              <option value="станок 1">станок 1 (CNF)</option>
              <option value="станок 2">станок 2 (FNF)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
