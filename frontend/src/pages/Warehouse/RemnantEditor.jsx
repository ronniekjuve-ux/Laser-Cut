import { useState, useEffect, useRef, useCallback } from 'react';
import client from '../../api/client';

const SNAP_THRESHOLD = 50;

// Check if a polygon is an axis-aligned rectangle
function isRectangle(vertices) {
  if (!vertices || vertices.length !== 4) return false;
  const xs = [...new Set(vertices.map(v => v[0]))].sort((a, b) => a - b);
  const ys = [...new Set(vertices.map(v => v[1]))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2) return false;
  // All 4 corners must exist
  const corners = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]], [xs[0], ys[1]]];
  return corners.every(([cx, cy]) => vertices.some(([vx, vy]) => Math.abs(vx - cx) < 0.1 && Math.abs(vy - cy) < 0.1));
}

function rectBounds(vertices) {
  const xs = vertices.map(v => v[0]);
  const ys = vertices.map(v => v[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return { x, y, w, h };
}

export default function RemnantEditor({ item, onClose, onSuccess }) {
  const svgRef = useRef(null);
  const [remnants, setRemnants] = useState([]);
  const [selectedRemnant, setSelectedRemnant] = useState(null);
  const [cutRect, setCutRect] = useState(null);
  const [splitResult, setSplitResult] = useState(null);
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);

  const SCALE = 0.05;
  const W = item.sheet_w || 1500;
  const H = item.sheet_h || 6000;
  const SVG_W = W * SCALE;
  const SVG_H = H * SCALE;

  const fetchRemnants = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/warehouse/remnants', { params: { item_id: item.id } });
      setRemnants(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load remnants', err);
    }
  }, [item.id]);

  useEffect(() => { fetchRemnants(); }, [fetchRemnants]);

  const getSnapPoints = useCallback(() => {
    const points = [
      { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H },
      { x: 0, y: null }, { x: W, y: null },
      { x: null, y: 0 }, { x: null, y: H },
    ];
    for (const r of remnants) {
      const verts = r.vertices || [];
      for (const v of verts) {
        points.push({ x: v[0], y: null });
        points.push({ x: null, y: v[1] });
      }
    }
    return points;
  }, [W, H, remnants]);

  const snapPoint = (pt) => {
    let { x, y } = pt;
    for (const sp of getSnapPoints()) {
      if (sp.x !== null && Math.abs(x - sp.x) < SNAP_THRESHOLD) x = sp.x;
      if (sp.y !== null && Math.abs(y - sp.y) < SNAP_THRESHOLD) y = sp.y;
    }
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  };

  const getSVGPoint = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return snapPoint({ x: (e.clientX - rect.left) / SCALE, y: (e.clientY - rect.top) / SCALE });
  };

  const handleMouseDown = (e) => {
    if (!placing) return;
    const pt = getSVGPoint(e);
    const w = parseFloat(dimW) || 0;
    const h = parseFloat(dimH) || 0;
    setCutRect({ x: Math.max(0, Math.min(W - w, pt.x)), y: Math.max(0, Math.min(H - h, pt.y)), w, h });
    setPlacing(false);
  };

  const handleMouseMove = (e) => {
    if (!placing) return;
    const pt = getSVGPoint(e);
    const w = parseFloat(dimW) || 0;
    const h = parseFloat(dimH) || 0;
    setCutRect({ x: Math.max(0, Math.min(W - w, pt.x)), y: Math.max(0, Math.min(H - h, pt.y)), w, h });
  };

  const startPlacing = () => {
    const w = parseFloat(dimW);
    const h = parseFloat(dimH);
    if (!w || !h || w < 10 || h < 10) return alert('Укажите ширину и высоту (мин. 10 мм)');
    if (w > W || h > H) return alert(`Размер не может превышать лист ${W}x${H} мм`);
    setPlacing(true);
    setCutRect({ x: 0, y: 0, w, h });
  };

  const handleSplit = async () => {
    if (!cutRect || cutRect.w < 10 || cutRect.h < 10) return alert('Минимальный размер 10x10 мм');
    try {
      if (!selectedRemnant) {
        const res = await client.post('/api/v1/warehouse/remnants', {
          warehouse_item_id: item.id, original_w: W, original_h: H,
          vertices: [[0, 0], [W, 0], [W, H], [0, H]], weight: item.weight,
        });
        const splitRes = await client.post(`/api/v1/warehouse/remnants/${res.data.id}/split`, {
          x: cutRect.x, y: cutRect.y, w: cutRect.w, h: cutRect.h,
        });
        setSplitResult(splitRes.data);
      } else {
        const splitRes = await client.post(`/api/v1/warehouse/remnants/${selectedRemnant.id}/split`, {
          x: cutRect.x, y: cutRect.y, w: cutRect.w, h: cutRect.h,
        });
        setSplitResult(splitRes.data);
      }
      fetchRemnants();
      setCutRect(null);
      setSelectedRemnant(null);
      setDimW('');
      setDimH('');
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSaveCut = async () => {
    setSaving(true);
    try {
      // Find the latest remaining remnant for this sheet
      const remnantRes = await client.get('/api/v1/warehouse/remnants', { params: { item_id: item.id } });
      const latestRemnants = (Array.isArray(remnantRes.data) ? remnantRes.data : []);

      // Decrease original sheet count by 1
      const newCount = Math.max(0, item.sheet_count - 1);
      if (newCount > 0) {
        await client.patch(`/api/v1/warehouse/${item.id}`, { sheet_count: newCount });
      } else {
        // If count reaches 0, delete the original (parts are created)
        await client.delete(`/api/v1/warehouse/${item.id}`);
      }

      // Check if any remaining remnant is a rectangle → create as warehouse item
      for (const r of latestRemnants) {
        const verts = r.vertices || [];
        if (isRectangle(verts)) {
          const { w, h } = rectBounds(verts);
          if (w >= 10 && h >= 10) {
            // Create remaining as warehouse item
            await client.post('/api/v1/warehouse/', {
              metal: item.metal,
              grade: item.grade,
              thickness: item.thickness,
              sheet_w: w,
              sheet_h: h,
              sheet_count: 1,
              weight: r.weight,
              article: null, // auto-generate
              item_type: 'standard',
              owner: item.owner,
              note: `Остаток от ${item.article || '#' + item.id}`,
            });
            // Delete the remnant since it's now a warehouse item
            await client.delete(`/api/v1/warehouse/remnants/${r.id}`);
          }
        }
      }

      fetchRemnants();
      if (onSuccess) onSuccess();
      setSplitResult(null);
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const remnantEdges = [];
  for (const r of remnants) {
    const verts = r.vertices || [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i], b = verts[(i + 1) % verts.length];
      if (a[0] === b[0]) remnantEdges.push({ type: 'v', x: a[0] });
      if (a[1] === b[1]) remnantEdges.push({ type: 'h', y: a[1] });
    }
  }

  const s = { padding: '3px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 3 };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 900, width: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '6px 14px', flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Резка — {item.metal} {item.grade || ''} {W}x{H} (остаток: {item.sheet_count})</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '4px 14px 8px', display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
          {/* SVG left */}
          <div style={{ flex: '0 0 auto' }}>
            <svg ref={svgRef} width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              style={{ border: '2px solid #333', background: '#f8f8f8', cursor: placing ? 'crosshair' : 'default' }}
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}>
              {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
                <line key={`v${i}`} x1={i * 500 * SCALE} y1={0} x2={i * 500 * SCALE} y2={SVG_H} stroke="#e5e7eb" strokeWidth="0.5" />
              ))}
              {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 500 * SCALE} x2={SVG_W} y2={i * 500 * SCALE} stroke="#e5e7eb" strokeWidth="0.5" />
              ))}
              <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="none" stroke="#333" strokeWidth="2" />
              <text x={SVG_W / 2} y={-4} textAnchor="middle" fontSize="10" fill="#666">{W} мм</text>
              <text x={-4} y={SVG_H / 2} textAnchor="middle" fontSize="10" fill="#666" transform={`rotate(-90, -4, ${SVG_H / 2})`}>{H} мм</text>
              {placing && remnantEdges.map((edge, i) =>
                edge.type === 'v'
                  ? <line key={`re${i}`} x1={edge.x * SCALE} y1={0} x2={edge.x * SCALE} y2={SVG_H} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="2,2" />
                  : <line key={`re${i}`} x1={0} y1={edge.y * SCALE} x2={SVG_W} y2={edge.y * SCALE} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="2,2" />
              )}
              {remnants.map(r => {
                const verts = r.vertices || [];
                if (verts.length < 3) return null;
                const points = verts.map(v => `${v[0] * SCALE},${v[1] * SCALE}`).join(' ');
                const isSel = selectedRemnant?.id === r.id;
                return (
                  <g key={r.id}>
                    <polygon points={points} fill={isSel ? '#3b82f6' : '#22c55e'} fillOpacity={isSel ? 0.3 : 0.15}
                      stroke={isSel ? '#3b82f6' : '#22c55e'} strokeWidth={isSel ? 3 : 2}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setSelectedRemnant(isSel ? null : r); }} />
                    <text x={verts.reduce((s, v) => s + v[0], 0) / verts.length * SCALE}
                      y={verts.reduce((s, v) => s + v[1], 0) / verts.length * SCALE}
                      textAnchor="middle" fontSize="9" fill="#166534" style={{ pointerEvents: 'none' }}>
                      {r.area ? `${(r.area / 1000000).toFixed(1)}м²` : ''}
                    </text>
                  </g>
                );
              })}
              {cutRect && (
                <>
                  <rect x={cutRect.x * SCALE} y={cutRect.y * SCALE} width={cutRect.w * SCALE} height={cutRect.h * SCALE}
                    fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />
                  {cutRect.x === 0 && <line x1={0} y1={0} x2={0} y2={SVG_H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" />}
                  {cutRect.x + cutRect.w >= W - 1 && <line x1={SVG_W} y1={0} x2={SVG_W} y2={SVG_H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" />}
                  {cutRect.y === 0 && <line x1={0} y1={0} x2={SVG_W} y2={0} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" />}
                  {cutRect.y + cutRect.h >= H - 1 && <line x1={0} y1={SVG_H} x2={SVG_W} y2={SVG_H} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3,3" />}
                </>
              )}
            </svg>
            <div style={{ marginTop: 3, fontSize: 10, color: '#64748b', textAlign: 'center' }}>
              1px = {1 / SCALE} мм | Привязка: {SNAP_THRESHOLD} мм
            </div>
          </div>

          {/* Controls right — compact */}
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
            <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Размер вырезки</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input type="number" value={dimW} onChange={e => setDimW(e.target.value)} placeholder="Ш мм" style={{ ...s, flex: 1 }} />
                <input type="number" value={dimH} onChange={e => setDimH(e.target.value)} placeholder="В мм" style={{ ...s, flex: 1 }} />
              </div>
              {placing && <div style={{ fontSize: 10, color: '#1d4ed8', marginBottom: 3 }}>Кликните на лист</div>}
              <button className="btn" onClick={placing ? () => { setPlacing(false); setCutRect(null); } : startPlacing}
                style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontWeight: 600,
                  background: placing ? '#fee2e2' : '#dbeafe', color: placing ? '#991b1b' : '#1d4ed8',
                  border: placing ? '1px solid #fca5a5' : '1px solid #93c5fd' }}>
                {placing ? 'Отмена' : 'Разместить'}
              </button>
            </div>
            {cutRect && (
              <div style={{ padding: '6px 8px', background: '#fef3c7', borderRadius: 6, fontSize: 11 }}>
                <strong>{Math.round(cutRect.w)}x{Math.round(cutRect.h)} мм</strong> ({(cutRect.w * cutRect.h / 1000000).toFixed(3)} м²)
                <button className="btn btn-primary" onClick={handleSplit}
                  style={{ width: '100%', marginTop: 4, padding: '4px 8px', fontSize: 11 }}>Вырезать</button>
              </div>
            )}
            {splitResult && (
              <div style={{ padding: '6px 8px', background: '#dcfce7', borderRadius: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: '#166534' }}>Вырезано: {splitResult.cut_article}</div>
                {splitResult.remaining_area > 0 && <div>Остаток: {(splitResult.remaining_area / 1000000).toFixed(3)} м²</div>}
                <button className="btn" onClick={handleSaveCut} disabled={saving}
                  style={{ width: '100%', marginTop: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600,
                    background: '#059669', color: '#fff', border: '1px solid #047857' }}>
                  {saving ? '...' : 'Заменить лист на части'}
                </button>
              </div>
            )}
            {remnants.length > 0 && (
              <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>Остатки ({remnants.length})</div>
                {remnants.map(r => (
                  <div key={r.id} onClick={() => setSelectedRemnant(selectedRemnant?.id === r.id ? null : r)}
                    style={{ padding: '3px 6px', marginBottom: 2, borderRadius: 3, fontSize: 10,
                      background: selectedRemnant?.id === r.id ? '#dbeafe' : '#fff',
                      border: '1px solid ' + (selectedRemnant?.id === r.id ? '#93c5fd' : '#e5e7eb'),
                      cursor: 'pointer' }}>
                    <strong>{r.article || `#${r.id}`}</strong>
                    {r.area && <span style={{ marginLeft: 4, color: '#64748b' }}>{(r.area / 1000000).toFixed(2)} м²</span>}
                  </div>
                ))}
              </div>
            )}
            <button className="btn" onClick={async () => {
              try {
                await client.post('/api/v1/warehouse/remnants', {
                  warehouse_item_id: item.id, original_w: W, original_h: H,
                  vertices: [[0, 0], [W, 0], [W, H], [0, H]], weight: item.weight,
                });
                fetchRemnants();
              } catch (err) { alert('Ошибка: ' + (err.response?.data?.detail || err.message)); }
            }}
              style={{ width: '100%', padding: '4px 8px', fontSize: 11, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
              Создать остаток из листа
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
