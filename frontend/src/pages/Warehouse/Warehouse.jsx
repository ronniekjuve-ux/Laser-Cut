import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import useIsMobile from '../../hooks/useIsMobile';
import ConfirmModal from '../../components/ConfirmModal';
import ItemNotesChat from '../../components/ItemNotesChat';
import WarehouseDeductModal from './WarehouseDeductModal';
import WarehouseReturnModal from './WarehouseReturnModal';
import WarehouseMovementHistory from './WarehouseMovementHistory';
import RemnantEditor from './RemnantEditor';
import { ViewToggle, WarehouseCard } from '../../components/DesktopCards';

function polyEdgeLengths(vertices) {
  if (!vertices || vertices.length < 2) return [];
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const len = Math.round(Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2));
    if (len > 0) edges.push(len);
  }
  return edges;
}

function EdgeLabels({ vertices, scale, offset = -12, fontSize = 10 }) {
  if (!vertices || vertices.length < 2) return null;
  return vertices.map((v, i) => {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const len = Math.round(Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2));
    if (len === 0) return null;
    const mx = (a[0] + b[0]) / 2 * scale;
    const my = (a[1] + b[1]) / 2 * scale;
    const angle = Math.atan2((b[1] - a[1]) * scale, (b[0] - a[0]) * scale) * 180 / Math.PI;
    // Normal direction (perpendicular to edge, pointing outward)
    const dx = (b[0] - a[0]) * scale, dy = (b[1] - a[1]) * scale;
    const lenPx = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / lenPx * offset, ny = dx / lenPx * offset;
    const rot = angle > 90 || angle < -90 ? angle + 180 : angle;
    return (
      <text key={i} x={mx + nx} y={my + ny} textAnchor="middle" dominantBaseline="middle"
        fontSize={fontSize} fill="#dc2626" fontWeight="600"
        transform={`rotate(${rot}, ${mx + nx}, ${my + ny})`}
        style={{ pointerEvents: 'none' }}>
        {len}
      </text>
    );
  });
}

function SheetPreview({ item, onClose }) {
  if (!item || !item.sheet_w || !item.sheet_h) return null;
  const W = item.sheet_w, H = item.sheet_h;
  let vertices = item.vertices;
  // Parse vertices if they're a string
  if (typeof vertices === 'string') {
    try { vertices = JSON.parse(vertices); } catch { vertices = null; }
  }
  const isPoly = vertices && Array.isArray(vertices) && vertices.length >= 3;
  const edges = isPoly ? polyEdgeLengths(vertices) : [];
  const isRect = edges.length === 4;
  const scale = Math.min(120 / W, 300 / H);
  const svgW = W * scale, svgH = H * scale;
  const polyPoints = isPoly
    ? vertices.map(v => `${v[0] * scale},${v[1] * scale}`).join(' ')
    : null;
  const area = item.area ? (item.area / 1000000).toFixed(2) : (W * H / 1000000).toFixed(2);
  const weight = item.weight ? parseFloat(item.weight).toFixed(1) : null;
  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90vw', height: '75vh', padding: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
          <strong style={{ fontSize: 13 }}>{item.article || `#${item.id}`} — {item.metal} {item.grade || ''} {item.thickness ? item.thickness + 'мм' : ''}</strong>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet"
              style={{ width: '100%', height: '100%', border: '2px solid #333', background: '#f8f8f8', maxHeight: 'calc(75vh - 100px)' }}>
              {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
                <line key={`v${i}`} x1={i * 500 * scale} y1={0} x2={i * 500 * scale} y2={svgH} stroke="#e5e7eb" strokeWidth="0.5" />
              ))}
              {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 500 * scale} x2={svgW} y2={i * 500 * scale} stroke="#e5e7eb" strokeWidth="0.5" />
              ))}
              {polyPoints ? (
                <>
                  <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#e5e7eb" strokeWidth="1" />
                  <polygon points={polyPoints} fill="#b0b8c4" fillOpacity="0.7" stroke="#333" strokeWidth="2" />
                  <EdgeLabels vertices={vertices} scale={scale} />
                </>
              ) : (
                <>
                  <rect x={0} y={0} width={svgW} height={svgH} fill="#b0b8c4" fillOpacity="0.7" stroke="#333" strokeWidth="2" />
                </>
              )}
            </svg>
          </div>
          <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: '#333' }}>
              <div><strong>{W}x{H}</strong> мм</div>
              <div>{area} м²</div>
              <div>{item.sheet_count} лист(ов)</div>
              {weight && <div>{weight} кг</div>}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 'auto' }}>
              {item.owner && <div>Владелец: {item.owner}</div>}
              {item.note && <div>Примечание: {item.note}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileWarehouseCard({ item, onEdit, onDelete, onDeduct, onReturn, onCut, onMerge, onNotes, onPreview }) {
  const W = item.sheet_w || 0, H = item.sheet_h || 0;
  const vertices = item.vertices;
  const hasShape = vertices && vertices.length >= 3;
  const scale = Math.min(60 / Math.max(W, 1), 100 / Math.max(H, 1));
  const svgW = W * scale, svgH = H * scale;
  const polyPoints = hasShape ? vertices.map(v => `${v[0] * scale},${v[1] * scale}`).join(' ') : null;
  const area = item.area ? (item.area / 1000000).toFixed(2) : (W * H / 1000000).toFixed(2);

  return (
    <div style={{
      background: '#fff', borderRadius: 8, border: '1px solid var(--border)',
      padding: 12, marginBottom: 8, cursor: 'pointer',
    }} onClick={() => { if (W > 0 && H > 0) onPreview(item); }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {W > 0 && H > 0 && (
          <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ border: '1px solid #333', background: '#f8f8f8', flexShrink: 0 }}>
            {hasShape ? (
              <polygon points={polyPoints} fill="#b0b8c4" fillOpacity="0.7" stroke="#333" strokeWidth="1.5" />
            ) : (
              <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#333" strokeWidth="1.5" />
            )}
          </svg>
        )}
        <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: item.parent_article ? '#6366f1' : '#333' }}>{item.article || '-'}</div>
          <div>{item.metal}{item.grade ? ` ${item.grade}` : ''} {item.thickness ? `${item.thickness}мм` : ''}</div>
          <div>{W}x{H} мм | {area} м² | <strong>{(item.sheet_count || 0) > 0 ? item.sheet_count : (item.original_sheet_count || 0)}</strong> шт</div>
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

function WarehouseTable({ items, title, color, editingId, editForm, setEditForm, sortCol, sortDir, onSort, filterOwner, filterGrade, filterThickness, filterMaterial, setFilterOwner, setFilterGrade, setFilterThickness, setFilterMaterial, showFilters, setShowFilters, searchArticle, onEdit, onSave, onCancel, onDelete, onDeduct, onReturn, onCut, onMerge, onNotes, onPreview, viewMode, onStartModalEdit, combinedMaterial, normalizeMaterial, vals }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Reset page when items change (e.g., after delete/deduct/return)
  useEffect(() => { setPage(1); }, [items.length]);

  const filtered = items
    .filter(i => !searchArticle || (i.article || '').toLowerCase().includes(searchArticle.toLowerCase()))
    .filter(i => filterOwner.length === 0 || filterOwner.includes(i.owner || '-'))
    .filter(i => filterMaterial.length === 0 || filterMaterial.some(f => normalizeMaterial(f) === normalizeMaterial(combinedMaterial(i))))
    .filter(i => filterThickness.length === 0 || filterThickness.includes(String(i.thickness || '-')))
    .sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (sortCol === 'thickness' || sortCol === 'sheet_count') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
      if (sortCol === 'created_at') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0; return sortDir === 'asc' ? va - vb : vb - va; }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
    });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getFilterState = (col) => {
    if (col === 'owner') return filterOwner;
    if (col === 'material_combined') return filterMaterial;
    if (col === 'thickness') return filterThickness;
    return [];
  };
  const setFilterState = (col) => {
    if (col === 'owner') return setFilterOwner;
    if (col === 'material_combined') return setFilterMaterial;
    if (col === 'thickness') return setFilterThickness;
    return () => {};
  };
  const hasActiveFilters = filterOwner.length + filterMaterial.length + filterThickness.length > 0;

  const DD = ({ col, label }) => (
    <th style={{ position: 'relative', whiteSpace: 'nowrap' }}>
      <span onClick={(e) => { e.stopPropagation(); setShowFilters(showFilters === col ? null : col); }} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label} {hasActiveFilters && getFilterState(col).length > 0 ? '' : '▾'}
      </span>
      {showFilters === col && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 120, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
          {vals(col, items).map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 3, background: col === 'material_combined' ? (getFilterState(col).some(f => normalizeMaterial(f) === normalizeMaterial(v)) ? '#eff6ff' : 'transparent') : (getFilterState(col).includes(v) ? '#eff6ff' : 'transparent') }}>
              <input type="checkbox" checked={col === 'material_combined' ? getFilterState(col).some(f => normalizeMaterial(f) === normalizeMaterial(v)) : getFilterState(col).includes(v)} onChange={() => { const setter = setFilterState(col); if (col === 'material_combined') { const nv = normalizeMaterial(v); setter(p => p.some(f => normalizeMaterial(f) === nv) ? p.filter(x => normalizeMaterial(x) !== nv) : [...p, v]); } else { setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]); } }} style={{ margin: 0 }} />
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
      {viewMode === 'cards' || (typeof window !== 'undefined' && window.innerWidth <= 768) ? (
        <div className="desktop-cards">
          {paged.map(item => (
            <WarehouseCard
              key={item.id}
              item={item}
              onClick={() => onPreview(item)}
              onEdit={() => onStartModalEdit(item)}
              onDeduct={item.sheet_count > 0 ? () => onDeduct(item) : undefined}
              onCut={item.sheet_count > 0 && item.sheet_w && item.sheet_h ? () => onCut(item) : undefined}
              onMerge={item.sheet_count > 0 && item.parent_article ? () => onMerge(item) : undefined}
              onDelete={() => onDelete(item.id)}
            />
          ))}
          {paged.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#64748b' }}>Пусто</div>
          )}
        </div>
      ) : (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <TH col="article" label="Артикул" />
              <DD col="owner" label="Владелец" />
              <DD col="material_combined" label="Материал" />
              <DD col="thickness" label="Толщ." />
              <th>Размер</th>
              <th>Закреплено</th>
              <th style={{ fontSize: 10, color: '#6b7280' }}>Вес листа</th>
              <th style={{ fontSize: 10, color: '#6b7280' }}>Вес раск.</th>
              <th style={{ fontSize: 10, color: '#6b7280' }}>Вес деталей</th>
              <TH col="created_at" label="Дата" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 13 }}>Пусто</td></tr>
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
                    <td></td>
                    <td></td>
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
                    <td style={{ fontSize: 11, color: '#6366f1' }}>
                      {(item.bound_to || []).length > 0 ? item.bound_to.join(', ') : '-'}
                    </td>
                    <td style={{ fontSize: 11, color: '#6b7280' }}>
                      {item.weight ? `${parseFloat(item.weight).toFixed(1)} кг` : '-'}
                    </td>
                    <td style={{ fontSize: 11, color: '#6b7280' }}>
                      {item.layout_sheet_weight ? `${item.layout_sheet_weight.toFixed(1)} кг` : '-'}
                    </td>
                    <td style={{ fontSize: 11, color: '#6b7280' }}>
                      {item.parts_weight ? `${item.parts_weight.toFixed(1)} кг` : '-'}
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
      )}
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
  const [modalEditItem, setModalEditItem] = useState(null);
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
  const combinedMaterial = (i) => {
    const parts = [i.metal, i.grade].filter(Boolean);
    if (parts.length === 0) return '—';
    return parts.join(' ');
  };
  const normalizeMaterial = (s) => (s || '').toLowerCase().trim();
  const vals = (col, itemsList) => {
    if (col === 'material_combined') {
      const seen = new Set();
      return itemsList.map(combinedMaterial).filter(v => { const n = normalizeMaterial(v); if (seen.has(n)) return false; seen.add(n); return true; }).sort();
    }
    if (col === 'owner') return [...new Set(itemsList.map(i => i.owner || '-'))].sort();
    if (col === 'thickness') return [...new Set(itemsList.map(i => String(i.thickness || '-')))].sort();
    return [];
  };
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode_warehouse') || 'table');
  const [filterChipPos, setFilterChipPos] = useState({ top: 0, left: 0 });

  useEffect(() => { localStorage.setItem('viewMode_warehouse', viewMode); }, [viewMode]);
  const [showFilters, setShowFilters] = useState(null);
  const [activeTab, setActiveTab] = useState('stock');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(null);
  const [mergeItem, setMergeItem] = useState(null);
  const [searchArticle, setSearchArticle] = useState('');
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
  const startModalEdit = (item) => { setModalEditItem(item); setEditForm({ metal: item.metal || '', grade: item.grade || '', thickness: item.thickness || '', sheet_w: item.sheet_w || '', sheet_h: item.sheet_h || '', sheet_count: item.sheet_count || '', owner: item.owner || '', note: item.note || '' }); };
  const saveEdit = async (id) => { try { await client.patch('/api/v1/warehouse/' + id, { metal: editForm.metal, grade: editForm.grade || null, thickness: editForm.thickness ? parseFloat(editForm.thickness) : null, sheet_w: editForm.sheet_w ? parseFloat(editForm.sheet_w) : null, sheet_h: editForm.sheet_h ? parseFloat(editForm.sheet_h) : null, sheet_count: editForm.sheet_count ? parseInt(editForm.sheet_count) : 0, owner: editForm.owner || null, note: editForm.note || null }); setEditingId(null); fetchItems(); } catch (err) { alert('Ошибка: ' + (err.response?.data?.detail || err.message)); } };
  const handleSort = (col) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };

  if (loading) return <div className="loading">Загрузка...</div>;

  const shared = { editingId, editForm, setEditForm, sortCol, sortDir, onSort: handleSort, filterOwner, filterGrade, filterThickness, filterMaterial, setFilterOwner, setFilterGrade, setFilterThickness, setFilterMaterial, showFilters, setShowFilters, searchArticle, onEdit: startEdit, onSave: saveEdit, onCancel: () => setEditingId(null), onDelete: (id) => setConfirmDelete(id), onDeduct: setDeductItem, onReturn: setReturnItem, onCut: setRemnantEditorItem, onMerge: setMergeItem, onNotes: setNotesChat, onPreview: setPreviewItem, viewMode, onStartModalEdit: startModalEdit, combinedMaterial, normalizeMaterial, vals };

  return (
    <div>
      <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Отмена' : '+ Добавить на склад'}</button>
        <input
          type="text"
          value={searchArticle}
          onChange={e => setSearchArticle(e.target.value)}
          placeholder="Поиск по артикулу..."
          style={{ flex: '1 1 200px', minWidth: 150, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
        />
        {!isRealMobile && <ViewToggle mode={viewMode} onChange={setViewMode} />}
      </div>

      {/* Filter chips for desktop */}
      {!isRealMobile && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
          {[
            { key: 'owner', label: 'Владелец', sel: filterOwner, set: setFilterOwner },
            { key: 'material_combined', label: 'Материал', sel: filterMaterial, set: setFilterMaterial },
            { key: 'thickness', label: 'Толщина', sel: filterThickness, set: setFilterThickness },
          ].map(chip => (
            <div
              key={chip.key}
              className="filter-chip"
              onClick={(e) => {
                e.stopPropagation();
                if (chip.sel.length) { chip.set([]); return; }
                const rect = e.currentTarget.getBoundingClientRect();
                setFilterChipPos({ top: rect.bottom + 4, left: rect.left });
                setShowFilters(showFilters === chip.key ? null : chip.key);
              }}
              style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                background: chip.sel.length ? '#dbeafe' : '#f1f5f9',
                color: chip.sel.length ? '#1d4ed8' : '#64748b',
                border: '1px solid ' + (chip.sel.length ? '#93c5fd' : 'var(--border)'),
              }}
            >
              {chip.label} {chip.sel.length ? '✕' : '▾'}
            </div>
          ))}
          {showFilters && (
            <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: filterChipPos.top, left: filterChipPos.left, zIndex: 1000, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 130, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 12 }}>{showFilters === 'owner' ? 'Владелец' : showFilters === 'material_combined' ? 'Материал' : 'Толщина'}</strong>
                <span onClick={() => setShowFilters(null)} style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>✕</span>
              </div>
              {vals(showFilters, items).map(v => {
                const sel = showFilters === 'owner' ? filterOwner : showFilters === 'material_combined' ? filterMaterial : filterThickness;
                const setSel = showFilters === 'owner' ? setFilterOwner : showFilters === 'material_combined' ? setFilterMaterial : setFilterThickness;
                return (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 3, background: (showFilters === 'material_combined' ? sel.some(f => normalizeMaterial(f) === normalizeMaterial(v)) : sel.includes(v)) ? '#eff6ff' : 'transparent' }}>
                    <input type="checkbox" checked={showFilters === 'material_combined' ? sel.some(f => normalizeMaterial(f) === normalizeMaterial(v)) : sel.includes(v)} onChange={() => { if (showFilters === 'material_combined') { const nv = normalizeMaterial(v); setSel(p => p.some(f => normalizeMaterial(f) === nv) ? p.filter(x => normalizeMaterial(x) !== nv) : [...p, v]); } else { setSel(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]); } }} style={{ margin: 0 }} />
                    {v}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>В наличии ({inStock.length})</div>
              <button className="btn" onClick={() => setMobileFilterOpen(mobileFilterOpen ? null : 'stock')}
                style={{ padding: '2px 8px', fontSize: 11, background: (filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length > 0) ? '#dbeafe' : undefined }}>
                Фильтр {(filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length > 0) ? `(${filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length})` : '▾'}
              </button>
            </div>
            {mobileFilterOpen === 'stock' && (
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, marginBottom: 8, border: '1px solid var(--border)' }}>
                {[{
                  label: 'Владелец', values: [...new Set(inStock.map(i => i.owner || '-'))],
                  selected: filterOwner, setter: setFilterOwner
                }, {
                  label: 'Марка', values: [...new Set(inStock.map(i => i.grade || '-'))],
                  selected: filterGrade, setter: setFilterGrade
                }, {
                  label: 'Толщина', values: [...new Set(inStock.map(i => String(i.thickness || '-')))],
                  selected: filterThickness, setter: setFilterThickness
                }, {
                  label: 'Материал', values: [...new Set(inStock.map(i => i.metal || '-'))],
                  selected: filterMaterial, setter: setFilterMaterial
                }].map(f => (
                  <div key={f.label} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {f.values.map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, cursor: 'pointer', padding: '1px 4px', borderRadius: 3, background: f.selected.includes(v) ? '#dbeafe' : '#fff', border: '1px solid var(--border)' }}>
                          <input type="checkbox" checked={f.selected.includes(v)}
                            onChange={() => f.setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])}
                            style={{ margin: 0, width: 10, height: 10 }} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {inStock.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Пусто</div>}
            {inStock.filter(i => filterOwner.length === 0 || filterOwner.includes(i.owner || '-'))
              .filter(i => filterGrade.length === 0 || filterGrade.includes(i.grade || '-'))
              .filter(i => filterThickness.length === 0 || filterThickness.includes(String(i.thickness || '-')))
              .filter(i => filterMaterial.length === 0 || filterMaterial.includes(i.metal || '-'))
              .sort((a, b) => {
              let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
              if (sortCol === 'thickness') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
              va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
              return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
            }).map(item => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>Списано ({deducted.length})</div>
              <button className="btn" onClick={() => setMobileFilterOpen(mobileFilterOpen ? null : 'deducted')}
                style={{ padding: '2px 8px', fontSize: 11, background: (filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length > 0) ? '#dbeafe' : undefined }}>
                Фильтр {(filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length > 0) ? `(${filterOwner.length + filterGrade.length + filterThickness.length + filterMaterial.length})` : '▾'}
              </button>
            </div>
            {mobileFilterOpen === 'deducted' && (
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: 8, marginBottom: 8, border: '1px solid var(--border)' }}>
                {[{
                  label: 'Владелец', values: [...new Set(deducted.map(i => i.owner || '-'))],
                  selected: filterOwner, setter: setFilterOwner
                }, {
                  label: 'Марка', values: [...new Set(deducted.map(i => i.grade || '-'))],
                  selected: filterGrade, setter: setFilterGrade
                }, {
                  label: 'Толщина', values: [...new Set(deducted.map(i => String(i.thickness || '-')))],
                  selected: filterThickness, setter: setFilterThickness
                }, {
                  label: 'Материал', values: [...new Set(deducted.map(i => i.metal || '-'))],
                  selected: filterMaterial, setter: setFilterMaterial
                }].map(f => (
                  <div key={f.label} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {f.values.map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, cursor: 'pointer', padding: '1px 4px', borderRadius: 3, background: f.selected.includes(v) ? '#dbeafe' : '#fff', border: '1px solid var(--border)' }}>
                          <input type="checkbox" checked={f.selected.includes(v)}
                            onChange={() => f.setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])}
                            style={{ margin: 0, width: 10, height: 10 }} />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {deducted.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Пусто</div>}
            {deducted.filter(i => filterOwner.length === 0 || filterOwner.includes(i.owner || '-'))
              .filter(i => filterGrade.length === 0 || filterGrade.includes(i.grade || '-'))
              .filter(i => filterThickness.length === 0 || filterThickness.includes(String(i.thickness || '-')))
              .filter(i => filterMaterial.length === 0 || filterMaterial.includes(i.metal || '-'))
              .sort((a, b) => {
              let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
              if (sortCol === 'thickness') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
              va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
              return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
            }).map(item => (
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
      {modalEditItem && (
        <div className="modal-overlay active" onClick={() => setModalEditItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Редактирование — {modalEditItem.article || `#${modalEditItem.id}`}</h3>
              <button className="close-btn" onClick={() => setModalEditItem(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label>Материал</label><input value={editForm.metal} onChange={e => setEditForm({...editForm, metal: e.target.value})} /></div>
                <div className="form-group"><label>Марка</label><input value={editForm.grade} onChange={e => setEditForm({...editForm, grade: e.target.value})} /></div>
                <div className="form-group"><label>Толщина</label><input type="number" step="0.1" value={editForm.thickness} onChange={e => setEditForm({...editForm, thickness: e.target.value})} /></div>
                <div className="form-group"><label>Ширина</label><input type="number" value={editForm.sheet_w} onChange={e => setEditForm({...editForm, sheet_w: e.target.value})} /></div>
                <div className="form-group"><label>Длина</label><input type="number" value={editForm.sheet_h} onChange={e => setEditForm({...editForm, sheet_h: e.target.value})} /></div>
                <div className="form-group"><label>Кол-во</label><input type="number" value={editForm.sheet_count} onChange={e => setEditForm({...editForm, sheet_count: e.target.value})} /></div>
                <div className="form-group"><label>Владелец</label><input value={editForm.owner} onChange={e => setEditForm({...editForm, owner: e.target.value})} /></div>
                <div className="form-group"><label>Примечание</label><input value={editForm.note} onChange={e => setEditForm({...editForm, note: e.target.value})} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={async () => { await saveEdit(modalEditItem.id); setModalEditItem(null); }}>Сохранить</button>
              <button className="btn" onClick={() => setModalEditItem(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
