import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import ConfirmModal from '../../components/ConfirmModal';
import ItemNotesChat from '../../components/ItemNotesChat';
import WarehouseDeductModal from './WarehouseDeductModal';
import WarehouseReturnModal from './WarehouseReturnModal';
import WarehouseMovementHistory from './WarehouseMovementHistory';
import RemnantEditor from './RemnantEditor';

function SheetPreview({ item, onClose }) {
  if (!item || !item.sheet_w || !item.sheet_h) return null;
  const W = item.sheet_w, H = item.sheet_h;
  const scale = Math.min(120 / W, 300 / H);
  const svgW = W * scale, svgH = H * scale;
  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>{item.article || `#${item.id}`} — {item.metal} {item.grade || ''} {item.thickness ? item.thickness + 'мм' : ''}</strong>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ border: '2px solid #333', background: '#f8f8f8' }}>
            {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * 500 * scale} y1={0} x2={i * 500 * scale} y2={svgH} stroke="#e5e7eb" strokeWidth="0.5" />
            ))}
            {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 500 * scale} x2={svgW} y2={i * 500 * scale} stroke="#e5e7eb" strokeWidth="0.5" />
            ))}
            <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#333" strokeWidth="2" />
            <text x={svgW / 2} y={svgH / 2 - 6} textAnchor="middle" fontSize="12" fill="#333" fontWeight="600">{W}x{H} мм</text>
            <text x={svgW / 2} y={svgH / 2 + 12} textAnchor="middle" fontSize="10" fill="#64748b">{item.sheet_count} лист(ов)</text>
            {item.weight && <text x={svgW / 2} y={svgH / 2 + 26} textAnchor="middle" fontSize="10" fill="#64748b">{item.weight} кг</text>}
          </svg>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {item.owner && <div>Владелец: {item.owner}</div>}
          {item.note && <div>Примечание: {item.note}</div>}
        </div>
      </div>
    </div>
  );
}

function WarehouseTable({ items, title, color, editingId, editForm, setEditForm, sortCol, sortDir, onSort, filterOwner, filterGrade, filterThickness, setFilterOwner, setFilterGrade, setFilterThickness, showFilters, setShowFilters, onEdit, onSave, onCancel, onDelete, onDeduct, onReturn, onCut, onNotes, onPreview }) {
  const filtered = items
    .filter(i => filterOwner.length === 0 || filterOwner.includes(i.owner || '-'))
    .filter(i => filterGrade.length === 0 || filterGrade.includes(i.grade || '-'))
    .filter(i => filterThickness.length === 0 || filterThickness.includes(String(i.thickness || '-')))
    .sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (sortCol === 'thickness' || sortCol === 'sheet_count') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
      if (sortCol === 'created_at') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0; return sortDir === 'asc' ? va - vb : vb - va; }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
    });

  const vals = (col) => [...new Set(items.map(i => col === 'thickness' ? String(i[col] || '-') : (i[col] || '-')))];

  const DD = ({ col, label }) => (
    <th style={{ position: 'relative', whiteSpace: 'nowrap' }}>
      <span onClick={(e) => { e.stopPropagation(); setShowFilters(showFilters === col ? null : col); }} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label} {filterOwner.length + filterGrade.length + filterThickness.length > 0 && (col === 'owner' ? filterOwner.length : col === 'grade' ? filterGrade.length : filterThickness.length) > 0 ? '' : '▾'}
      </span>
      {showFilters === col && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 120, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
          {vals(col).map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 3, background: (col === 'owner' ? filterOwner : col === 'grade' ? filterGrade : filterThickness).includes(v) ? '#eff6ff' : 'transparent' }}>
              <input type="checkbox" checked={(col === 'owner' ? filterOwner : col === 'grade' ? filterGrade : filterThickness).includes(v)} onChange={() => { const setter = col === 'owner' ? setFilterOwner : col === 'grade' ? setFilterGrade : setFilterThickness; setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]); }} style={{ margin: 0 }} />
              {v}
            </label>
          ))}
        </div>
      )}
    </th>
  );

  const TH = ({ col, label }) => (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  const sizeLabel = (i) => i.sheet_w && i.sheet_h ? `${i.sheet_w}x${i.sheet_h}` : i.size || '-';

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color }}>{title} ({filtered.length})</div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <DD col="owner" label="Владелец" />
              <th>Материал</th>
              <DD col="thickness" label="Толщ." />
              <th>Размер</th>
              <th>Кол-во</th>
              <TH col="created_at" label="Дата" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 13 }}>Пусто</td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} style={editingId === item.id ? { background: '#f0f9ff' } : { cursor: 'pointer' }}
                onClick={(e) => { if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return; if (editingId === item.id) return; if (item.sheet_w && item.sheet_h) onPreview(item); }}>
                {editingId === item.id ? (
                  <>
                    <td><input value={editForm.owner} onChange={e => setEditForm({...editForm, owner: e.target.value})} style={{ width: 100, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <input value={editForm.metal} onChange={e => setEditForm({...editForm, metal: e.target.value})} style={{ width: 70, padding: '2px 4px', fontSize: 12 }} />
                        <input value={editForm.grade} onChange={e => setEditForm({...editForm, grade: e.target.value})} style={{ width: 50, padding: '2px 4px', fontSize: 12 }} />
                      </div>
                    </td>
                    <td><input value={editForm.thickness} onChange={e => setEditForm({...editForm, thickness: e.target.value})} style={{ width: 45, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td><div style={{ display: 'flex', gap: 2 }}><input value={editForm.sheet_w} onChange={e => setEditForm({...editForm, sheet_w: e.target.value})} style={{ width: 45, padding: '2px 4px', fontSize: 12 }} /><span style={{ fontSize: 12, alignSelf: 'center' }}>x</span><input value={editForm.sheet_h} onChange={e => setEditForm({...editForm, sheet_h: e.target.value})} style={{ width: 45, padding: '2px 4px', fontSize: 12 }} /></div></td>
                    <td><input value={editForm.sheet_count} onChange={e => setEditForm({...editForm, sheet_count: e.target.value})} style={{ width: 50, padding: '2px 4px', fontSize: 12 }} /></td>
                    <td></td>
                    <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onSave(item.id); }} style={{ padding: '3px 8px', fontSize: 11 }}>OK</button><button className="btn" onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ padding: '3px 8px', fontSize: 11 }}>Отмена</button></div></td>
                  </>
                ) : (
                  <>
                    <td>{item.owner || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{item.metal}{item.grade ? ` ${item.grade}` : ''}</td>
                    <td>{item.thickness ? `${item.thickness}мм` : '-'}</td>
                    <td>{sizeLabel(item)}</td>
                    <td style={{ fontWeight: 600, color: item.sheet_count <= (item.min_quantity || 0) ? '#dc2626' : undefined }}>{item.sheet_count || 0}</td>
                    <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        <button className="btn" onClick={() => onEdit(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Редактировать">✏️</button>
                        <button className="btn" onClick={() => onNotes(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Примечания">💬</button>
                        {item.sheet_count > 0 ? (
                          <>
                            <button className="btn" onClick={() => onDeduct(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef3c7', color: '#92400e' }} title="Списание">↓</button>
                            {item.sheet_w && item.sheet_h && <button className="btn" onClick={() => onCut(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#dbeafe', color: '#1d4ed8' }} title="Резка">✂️</button>}
                          </>
                        ) : (
                          <button className="btn" onClick={() => onReturn(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#dcfce7', color: '#166534' }} title="Вернуть на склад">↑</button>
                        )}
                        <button className="btn" onClick={() => onDelete(item.id)} style={{ padding: '3px 8px', fontSize: 11 }} title="Удалить">🗑️</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Warehouse() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ material: '', thickness: '', sheet_w: '', sheet_h: '', sheet_count: '', owner: '', note: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [notesChat, setNotesChat] = useState(null);
  const [deductItem, setDeductItem] = useState(null);
  const [returnItem, setReturnItem] = useState(null);
  const [movementsItem, setMovementsItem] = useState(null);
  const [remnantEditorItem, setRemnantEditorItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [filterOwner, setFilterOwner] = useState([]);
  const [filterGrade, setFilterGrade] = useState([]);
  const [filterThickness, setFilterThickness] = useState([]);
  const [showFilters, setShowFilters] = useState(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/warehouse/');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) { console.error('Failed to load warehouse', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { const h = () => setShowFilters(null); if (showFilters) document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [showFilters]);

  const inStock = items.filter(i => (i.sheet_count || 0) > 0);
  const deducted = items.filter(i => (i.sheet_count || 0) <= 0);

  const handleAdd = async () => {
    if (!form.material) return;
    try {
      // material = "Сталь Ст3" → metal="Сталь", grade="Ст3"
      const parts = form.material.trim().split(/\s+/);
      const metal = parts[0] || '';
      const grade = parts.slice(1).join(' ') || null;
      await client.post('/api/v1/warehouse/', {
        metal, grade,
        thickness: form.thickness ? parseFloat(form.thickness) : null,
        sheet_w: form.sheet_w ? parseFloat(form.sheet_w) : null,
        sheet_h: form.sheet_h ? parseFloat(form.sheet_h) : null,
        sheet_count: form.sheet_count ? parseInt(form.sheet_count) : 0,
        owner: form.owner || null, note: form.note || null,
      });
      setForm({ material: '', thickness: '', sheet_w: '', sheet_h: '', sheet_count: '', owner: '', note: '' });
      setShowForm(false); fetchItems();
    } catch (err) { alert('Ошибка: ' + (typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.message)); }
  };

  const confirmDeleteAction = async () => { const id = confirmDelete; setConfirmDelete(null); try { await client.delete('/api/v1/warehouse/' + id); fetchItems(); } catch (err) { alert('Ошибка'); } };
  const startEdit = (item) => { setEditingId(item.id); setEditForm({ metal: item.metal || '', grade: item.grade || '', thickness: item.thickness || '', sheet_w: item.sheet_w || '', sheet_h: item.sheet_h || '', sheet_count: item.sheet_count || '', owner: item.owner || '', note: item.note || '' }); };
  const saveEdit = async (id) => { try { await client.patch('/api/v1/warehouse/' + id, { metal: editForm.metal, grade: editForm.grade || null, thickness: editForm.thickness ? parseFloat(editForm.thickness) : null, sheet_w: editForm.sheet_w ? parseFloat(editForm.sheet_w) : null, sheet_h: editForm.sheet_h ? parseFloat(editForm.sheet_h) : null, sheet_count: editForm.sheet_count ? parseInt(editForm.sheet_count) : 0, owner: editForm.owner || null, note: editForm.note || null }); setEditingId(null); fetchItems(); } catch (err) { alert('Ошибка: ' + (err.response?.data?.detail || err.message)); } };
  const handleSort = (col) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };

  if (loading) return <div className="loading">Загрузка...</div>;

  const shared = { editingId, editForm, setEditForm, sortCol, sortDir, onSort: handleSort, filterOwner, filterGrade, filterThickness, setFilterOwner, setFilterGrade, setFilterThickness, showFilters, setShowFilters, onEdit: startEdit, onSave: saveEdit, onCancel: () => setEditingId(null), onDelete: (id) => setConfirmDelete(id), onDeduct: setDeductItem, onReturn: setReturnItem, onCut: setRemnantEditorItem, onNotes: setNotesChat, onPreview: setPreviewItem };

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Отмена' : '+ Добавить на склад'}</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 15 }}>
          <h3>Новая позиция на складе</h3>
          <div className="form-grid">
            <div className="form-group"><label>Материал *</label><input value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="Сталь Ст3" /></div>
            <div className="form-group"><label>Толщина (мм)</label><input type="number" step="0.1" value={form.thickness} onChange={e => setForm({...form, thickness: e.target.value})} placeholder="3" /></div>
            <div className="form-group"><label>Ширина (мм)</label><input type="number" value={form.sheet_w} onChange={e => setForm({...form, sheet_w: e.target.value})} placeholder="1500" /></div>
            <div className="form-group"><label>Длина (мм)</label><input type="number" value={form.sheet_h} onChange={e => setForm({...form, sheet_h: e.target.value})} placeholder="6000" /></div>
            <div className="form-group"><label>Кол-во листов</label><input type="number" value={form.sheet_count} onChange={e => setForm({...form, sheet_count: e.target.value})} placeholder="10" /></div>
            <div className="form-group"><label>Владелец</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} placeholder="Название компании" /></div>
          </div>
          <div className="form-group"><label>Примечание</label><input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Дополнительно..." /></div>
          <button className="btn btn-primary" onClick={handleAdd} style={{ marginTop: 10 }}>Добавить</button>
        </div>
      )}

      <WarehouseTable items={inStock} title="В наличии" color="#166534" {...shared} />
      {deducted.length > 0 && <WarehouseTable items={deducted} title="Списано" color="#dc2626" {...shared} />}

      {confirmDelete && <ConfirmModal title="Удалить запись?" message="Запись склада будет удалена безвозвратно." onConfirm={confirmDeleteAction} onCancel={() => setConfirmDelete(null)} />}
      {notesChat && <ItemNotesChat itemType="warehouse" itemId={notesChat.id} onClose={() => setNotesChat(null)} />}
      {deductItem && <WarehouseDeductModal item={deductItem} onClose={() => setDeductItem(null)} onSuccess={() => { setDeductItem(null); fetchItems(); }} />}
      {returnItem && <WarehouseReturnModal item={returnItem} onClose={() => setReturnItem(null)} onSuccess={() => { setReturnItem(null); fetchItems(); }} />}
      {movementsItem && <WarehouseMovementHistory item={movementsItem} onClose={() => setMovementsItem(null)} />}
      {remnantEditorItem && <RemnantEditor item={remnantEditorItem} onClose={() => setRemnantEditorItem(null)} onSuccess={() => { setRemnantEditorItem(null); fetchItems(); }} />}
      {previewItem && <SheetPreview item={previewItem} onClose={() => setPreviewItem(null)} />}
    </div>
  );
}
