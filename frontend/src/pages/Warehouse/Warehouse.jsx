import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import useIsMobile from '../../hooks/useIsMobile';
import ConfirmModal from '../../components/ConfirmModal';
import ItemNotesChat from '../../components/ItemNotesChat';
import WarehouseDeductModal from './WarehouseDeductModal';
import WarehouseReturnModal from './WarehouseReturnModal';
import WarehouseMovementHistory from './WarehouseMovementHistory';
import RemnantEditor from './RemnantEditor';

function SheetPreview({ item, onClose }) {
  if (!item || !item.sheet_w || !item.sheet_h) return null;
  const W = item.sheet_w, H = item.sheet_h;
  const vertices = item.vertices;
  const scale = Math.min(120 / W, 300 / H);
  const svgW = W * scale, svgH = H * scale;
  const polyPoints = vertices && vertices.length >= 3
    ? vertices.map(v => `${v[0] * scale},${v[1] * scale}`).join(' ')
    : null;
  const area = item.area ? (item.area / 1000000).toFixed(2) : (W * H / 1000000).toFixed(2);
  const weight = item.weight ? parseFloat(item.weight).toFixed(1) : null;
  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>{item.article || `#${item.id}`} — {item.metal} {item.grade || ''} {item.thickness ? item.thickness + 'мм' : ''}</strong>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ border: '2px solid #333', background: '#f8f8f8', flexShrink: 0 }}>
            {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * 500 * scale} y1={0} x2={i * 500 * scale} y2={svgH} stroke="#e5e7eb" strokeWidth="0.5" />
            ))}
            {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 500 * scale} x2={svgW} y2={i * 500 * scale} stroke="#e5e7eb" strokeWidth="0.5" />
            ))}
            {polyPoints ? (
              <>
                <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                <polygon points={polyPoints} fill="#dcfce7" fillOpacity="0.5" stroke="#333" strokeWidth="2" />
              </>
            ) : (
              <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#333" strokeWidth="2" />
            )}
          </svg>
          <div style={{ fontSize: 12, lineHeight: 1.8, color: '#333', whiteSpace: 'nowrap' }}>
            <div><strong>{W}x{H}</strong> мм</div>
            <div>{area} м²</div>
            <div>{item.sheet_count} лист(ов)</div>
            {weight && <div>{weight} кг</div>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {item.owner && <div>Владелец: {item.owner}</div>}
          {item.note && <div>Примечание: {item.note}</div>}
        </div>
      </div>
    </div>
  );
}

function MobileWarehouseCard({ item, onEdit, onDelete, onDeduct, onReturn, onCut, onMerge, onNotes, onPreview }) {
  const W = item.sheet_w || 0, H = item.sheet_h || 0;
  const scale = Math.min(60 / Math.max(W, 1), 100 / Math.max(H, 1));
  const svgW = W * scale, svgH = H * scale;

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: '1px solid var(--border)',
      padding: 12, marginBottom: 8, cursor: 'pointer',
    }} onClick={() => { if (W > 0 && H > 0) onPreview(item); }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {W > 0 && H > 0 && (
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ border: '1px solid #333', background: '#f8f8f8', flexShrink: 0 }}>
            <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#333" strokeWidth="1.5" />
          </svg>
        )}
        <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: item.parent_article ? '#6366f1' : '#333' }}>{item.article || '-'}</div>
          <div>{item.metal}{item.grade ? ` ${item.grade}` : ''} {item.thickness ? `${item.thickness}мм` : ''}</div>
          <div>{W}x{H} мм | <strong>{(item.sheet_count || 0) > 0 ? item.sheet_count : (item.original_sheet_count || 0)}</strong> шт</div>
          {item.owner && <div style={{ color: '#64748b' }}>{item.owner}</div>}
          {(item.bound_to || []).length > 0 && <div style={{ color: '#6366f1', fontSize: 11 }}>Закреплено: {item.bound_to.join(', ')}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        <button className="btn" onClick={() => onEdit(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Редактировать">✏️</button>
        <button className="btn" onClick={() => onNotes(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Примечания">💬</button>
        {item.sheet_count > 0 ? (
          <>
            <button className="btn" onClick={() => onDeduct(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef3c7', color: '#92400e' }} title="Списание">↓</button>
            {W > 0 && H > 0 && <button className="btn" onClick={() => onCut(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#dbeafe', color: '#1d4ed8' }} title="Резка">✂️</button>}
            {item.parent_article && <button className="btn" onClick={() => onMerge(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', color: '#991b1b' }} title="Откат">↩</button>}
          </>
        ) : (
          <button className="btn" onClick={() => onReturn(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#dcfce7', color: '#166534' }} title="Возврат">↑</button>
        )}
        <button className="btn" onClick={() => onDelete(item.id)} style={{ padding: '3px 8px', fontSize: 11 }} title="Удалить">🗑️</button>
      </div>
    </div>
  );
}

function WarehouseTable({ items, title, color, editingId, editForm, setEditForm, sortCol, sortDir, onSort, filterOwner, filterGrade, filterThickness, filterMaterial, setFilterOwner, setFilterGrade, setFilterThickness, setFilterMaterial, showFilters, setShowFilters, onEdit, onSave, onCancel, onDelete, onDeduct, onReturn, onCut, onMerge, onNotes, onPreview }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Reset page when items change (e.g., after delete/deduct/return)
  useEffect(() => { setPage(1); }, [items.length]);

  const filtered = items
    .filter(i => filterOwner.length === 0 || filterOwner.includes(i.owner || '-'))
    .filter(i => filterGrade.length === 0 || filterGrade.includes(i.grade || '-'))
    .filter(i => filterThickness.length === 0 || filterThickness.includes(String(i.thickness || '-')))
    .filter(i => filterMaterial.length === 0 || filterMaterial.includes(i.metal || '-'))
    .sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (sortCol === 'thickness' || sortCol === 'sheet_count') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
      if (sortCol === 'created_at') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0; return sortDir === 'asc' ? va - vb : vb - va; }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const vals = (col) => [...new Set(items.map(i => col === 'thickness' ? String(i[col] || '-') : (i[col] || '-')))];

  const getFilterState = (col) => {
    if (col === 'owner') return filterOwner;
    if (col === 'grade') return filterGrade;
    if (col === 'thickness') return filterThickness;
    if (col === 'metal') return filterMaterial;
    return [];
  };
  const setFilterState = (col) => {
    if (col === 'owner') return setFilterOwner;
    if (col === 'grade') return setFilterGrade;
    if (col === 'thickness') return setFilterThickness;
    if (col === 'metal') return setFilterMaterial;
    return () => {};
  };
  const hasActiveFilters = filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length > 0;

  const DD = ({ col, label }) => (
    <th style={{ position: 'relative', whiteSpace: 'nowrap' }}>
      <span onClick={(e) => { e.stopPropagation(); setShowFilters(showFilters === col ? null : col); }} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label} {hasActiveFilters && getFilterState(col).length > 0 ? '' : '▾'}
      </span>
      {showFilters === col && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 120, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
          {vals(col).map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 3, background: getFilterState(col).includes(v) ? '#eff6ff' : 'transparent' }}>
              <input type="checkbox" checked={getFilterState(col).includes(v)} onChange={() => { const setter = setFilterState(col); setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]); }} style={{ margin: 0 }} />
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
              <TH col="article" label="Артикул" />
              <DD col="owner" label="Владелец" />
              <DD col="metal" label="Материал" />
              <DD col="thickness" label="Толщ." />
              <th>Размер</th>
              <th>Кол-во</th>
              <th>Закреплено</th>
              <TH col="created_at" label="Дата" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 13 }}>Пусто</td></tr>
            ) : paged.map(item => (
              <tr key={item.id} style={editingId === item.id ? { background: '#f0f9ff' } : { cursor: 'pointer' }}
                onClick={(e) => { if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return; if (editingId === item.id) return; if (item.sheet_w > 0 && item.sheet_h > 0) onPreview(item); }}>
                {editingId === item.id ? (
                  <>
                    <td style={{ fontSize: 11, color: '#94a3b8' }}>{item.article || '-'}</td>
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
                    <td></td>
                    <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onSave(item.id); }} style={{ padding: '3px 8px', fontSize: 11 }}>OK</button><button className="btn" onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ padding: '3px 8px', fontSize: 11 }}>Отмена</button></div></td>
                  </>
                ) : (
                  <>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: item.parent_article ? '#6366f1' : '#333' }}>{item.article || '-'}</td>
                    <td>{item.owner || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{item.metal}{item.grade ? ` ${item.grade}` : ''}</td>
                    <td>{item.thickness ? `${item.thickness}мм` : '-'}</td>
                    <td>{sizeLabel(item)}</td>
                    <td style={{ fontWeight: 600, color: item.sheet_count <= (item.min_quantity || 0) ? '#dc2626' : undefined }}>
                      {(item.sheet_count || 0) > 0 ? item.sheet_count : (item.original_sheet_count || 0)}
                    </td>
                    <td style={{ fontSize: 11, color: '#6366f1' }}>
                      {(item.bound_to || []).length > 0 ? item.bound_to.join(', ') : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        <button className="btn" onClick={() => onEdit(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Редактировать">✏️</button>
                        <button className="btn" onClick={() => onNotes(item)} style={{ padding: '3px 8px', fontSize: 11 }} title="Примечания">💬</button>
                        {item.sheet_count > 0 ? (
                          <>
                            <button className="btn" onClick={() => onDeduct(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef3c7', color: '#92400e' }} title="Списание">↓</button>
                            {item.sheet_w && item.sheet_h && <button className="btn" onClick={() => onCut(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#dbeafe', color: '#1d4ed8' }} title="Резка">✂️</button>}
                            {item.parent_article && item.sheet_count > 0 && (
                              <button className="btn" onClick={() => onMerge(item)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', color: '#991b1b' }} title="Откат разрезания">↩</button>
                            )}
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
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: 11, padding: '2px 6px' }}>«</button>
          <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ fontSize: 11, padding: '2px 6px' }}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => setPage(p)}
                style={{ fontSize: 11, padding: '2px 6px' }}>{p}</button>
            );
          })}
          <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ fontSize: 11, padding: '2px 6px' }}>›</button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ fontSize: 11, padding: '2px 6px' }}>»</button>
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{filtered.length} записей | Стр. {page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}

function MergeCutModal({ items, item, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sibling = items.find(i =>
    i.id !== item.id &&
    i.parent_article === item.parent_article &&
    i.parent_article != null
  );

  const parentW = item.parent_sheet_w || sibling?.parent_sheet_w;
  const parentH = item.parent_sheet_h || sibling?.parent_sheet_h;
  const canMerge = sibling && parentW && parentH;

  const handleMerge = async () => {
    if (!canMerge) return;

    setLoading(true);
    setError('');
    try {
      await client.post('/api/v1/warehouse/merge-cut', {
        item_id_1: item.id,
        item_id_2: sibling.id,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>Откат разрезания</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: 10, background: '#f0f9ff', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            <div><strong>{item.article}</strong> — {item.sheet_w}x{item.sheet_h}</div>
            {sibling && <div style={{ marginTop: 4 }}><strong>{sibling.article}</strong> — {sibling.sheet_w}x{sibling.sheet_h}</div>}
            {!sibling && <div style={{ color: '#dc2626', marginTop: 4 }}>Соседний кусок не найден</div>}
          </div>

          {canMerge ? (
            <div style={{ padding: 10, background: '#f0fdf4', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              <div>Исходный лист: <strong>{parentW}x{parentH} мм</strong></div>
            </div>
          ) : (
            <div style={{ padding: 10, background: '#fef2f2', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
              Не удалось определить размер исходного листа
            </div>
          )}

          {error && <div style={{ padding: 8, background: '#fef2f2', borderRadius: 6, color: '#991b1b', fontSize: 12, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleMerge} disabled={loading || !canMerge}
              style={{ flex: 1, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 600 }}>
              {loading ? 'Слияние...' : 'Вернуть целый лист'}
            </button>
            <button className="btn" onClick={onClose}>Отмена</button>
          </div>
        </div>
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
  const [filterMaterial, setFilterMaterial] = useState([]);
  const [showFilters, setShowFilters] = useState(null);
  const [activeTab, setActiveTab] = useState('stock');
  const [mergeItem, setMergeItem] = useState(null);
  const isMobile = useIsMobile();
  const isRealMobile = isMobile && window.innerWidth <= 768;

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

  const shared = { editingId, editForm, setEditForm, sortCol, sortDir, onSort: handleSort, filterOwner, filterGrade, filterThickness, filterMaterial, setFilterOwner, setFilterGrade, setFilterThickness, setFilterMaterial, showFilters, setShowFilters, onEdit: startEdit, onSave: saveEdit, onCancel: () => setEditingId(null), onDelete: (id) => setConfirmDelete(id), onDeduct: setDeductItem, onReturn: setReturnItem, onCut: setRemnantEditorItem, onMerge: setMergeItem, onNotes: setNotesChat, onPreview: setPreviewItem };

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

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 12 }}>
        {[
          { key: 'stock', label: `В наличии (${inStock.length})` },
          { key: 'deducted', label: `Списано (${deducted.length})` },
        ].map(tab => (
          <div
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--primary)' : '#64748b',
              marginBottom: -2,
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {activeTab === 'stock' ? (
        isRealMobile ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#166534' }}>В наличии ({inStock.length})</div>
            {inStock.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Пусто</div>}
            {inStock.map(item => (
              <MobileWarehouseCard key={item.id} item={item}
                onEdit={startEdit} onDelete={(id) => setConfirmDelete(id)}
                onDeduct={setDeductItem} onReturn={setReturnItem}
                onCut={setRemnantEditorItem} onMerge={setMergeItem}
                onNotes={setNotesChat} onPreview={setPreviewItem} />
            ))}
          </div>
        ) : (
          <WarehouseTable items={inStock} title="В наличии" color="#166534" {...shared} />
        )
      ) : (
        isRealMobile ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#dc2626' }}>Списано ({deducted.length})</div>
            {deducted.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Пусто</div>}
            {deducted.map(item => (
              <MobileWarehouseCard key={item.id} item={item}
                onEdit={startEdit} onDelete={(id) => setConfirmDelete(id)}
                onDeduct={setDeductItem} onReturn={setReturnItem}
                onCut={setRemnantEditorItem} onMerge={setMergeItem}
                onNotes={setNotesChat} onPreview={setPreviewItem} />
            ))}
          </div>
        ) : (
          <WarehouseTable items={deducted} title="Списано" color="#dc2626" {...shared} />
        )
      )}

      {confirmDelete && <ConfirmModal title="Удалить запись?" message="Запись склада будет удалена безвозвратно." onConfirm={confirmDeleteAction} onCancel={() => setConfirmDelete(null)} />}
      {notesChat && <ItemNotesChat itemType="warehouse" itemId={notesChat.id} onClose={() => setNotesChat(null)} />}
      {deductItem && <WarehouseDeductModal item={deductItem} onClose={() => setDeductItem(null)} onSuccess={() => { setDeductItem(null); fetchItems(); }} />}
      {returnItem && <WarehouseReturnModal item={returnItem} onClose={() => setReturnItem(null)} onSuccess={() => { setReturnItem(null); fetchItems(); }} />}
      {movementsItem && <WarehouseMovementHistory item={movementsItem} onClose={() => setMovementsItem(null)} />}
      {remnantEditorItem && <RemnantEditor item={remnantEditorItem} onClose={() => setRemnantEditorItem(null)} onSuccess={() => fetchItems()} />}
      {previewItem && <SheetPreview item={previewItem} onClose={() => setPreviewItem(null)} />}
      {mergeItem && <MergeCutModal items={items} item={mergeItem} onClose={() => setMergeItem(null)} onSuccess={() => { setMergeItem(null); fetchItems(); }} />}
    </div>
  );
}
