import { useState, useEffect, useRef, useMemo } from 'react';
import client from '../../api/client';

const SNAP = 10;

function pointInPolygon(px, py, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i][0], yi = vertices[i][1];
    const xj = vertices[j][0], yj = vertices[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function rectInPolygon(rx, ry, rw, rh, vertices) {
  // Check with small inset to avoid boundary issues
  const m = 0.5;
  return pointInPolygon(rx + m, ry + m, vertices) &&
    pointInPolygon(rx + rw - m, ry + m, vertices) &&
    pointInPolygon(rx + m, ry + rh - m, vertices) &&
    pointInPolygon(rx + rw - m, ry + rh - m, vertices);
}

function findValidPosition(x, y, w, h, W, H, vertices) {
  if (!vertices) {
    // Simple rectangle: just clamp
    return { x: Math.max(0, Math.min(W - w, x)), y: Math.max(0, Math.min(H - h, y)) };
  }
  // Try exact position first (clamped to bounding box)
  const cx = Math.max(0, Math.min(W - w, x));
  const cy = Math.max(0, Math.min(H - h, y));
  if (rectInPolygon(cx, cy, w, h, vertices)) return { x: cx, y: cy };

  // Collect all candidate x and y positions from polygon edges
  const xs = new Set([0]);
  const ys = new Set([0]);
  for (let i = 0; i < vertices.length; i++) {
    const vx = vertices[i][0], vy = vertices[i][1];
    // Positions where rect edge aligns with polygon vertex
    xs.add(Math.max(0, Math.min(W - w, vx)));
    xs.add(Math.max(0, Math.min(W - w, vx - w)));
    ys.add(Math.max(0, Math.min(H - h, vy)));
    ys.add(Math.max(0, Math.min(H - h, vy - h)));
  }

  // Find closest valid candidate
  let best = null, bestDist = Infinity;
  for (const tx of xs) {
    for (const ty of ys) {
      if (rectInPolygon(tx, ty, w, h, vertices)) {
        const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
        if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
      }
    }
  }
  if (best) return best;

  // Fallback: coarse grid search (10mm steps)
  for (let step = 10; step <= 100; step += 10) {
    for (let ty = 0; ty <= H - h; ty += step) {
      for (let tx = 0; tx <= W - w; tx += step) {
        if (rectInPolygon(tx, ty, w, h, vertices)) {
          const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
          if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
        }
      }
    }
    if (best) return best;
  }
  return null;
}

export default function RemnantEditor({ item, onClose, onSuccess }) {
  const svgRef = useRef(null);
  const [cutRect, setCutRect] = useState(null);
  const [result, setResult] = useState(null);
  const [savedCut, setSavedCut] = useState(null);
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const S = 0.05;
  const W = item.sheet_w || 1500;
  const H = item.sheet_h || 6000;
  const sW = W * S, sH = H * S;

  const vertices = item.vertices;
  const hasShape = vertices && vertices.length >= 3;
  const polyPoints = useMemo(() =>
    hasShape ? vertices.map(v => `${v[0] * S},${v[1] * S}`).join(' ') : null,
    [hasShape, vertices, S]
  );

  useEffect(() => {
    setCutRect(null);
    setResult(null);
    setSavedCut(null);
    setDimW('');
    setDimH('');
    setPlacing(false);
    setHighlight(null);
    setDragging(false);
  }, [item]);

  const toSVG = (e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const mx = Math.max(0, Math.min(r.width, clientX - r.left));
    const my = Math.max(0, Math.min(r.height, clientY - r.top));
    const x = mx / S, y = my / S;
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  };

  const onMouseDown = (e) => {
    const pt = toSVG(e);
    if (!pt) return;

    if (placing) {
      const w = parseFloat(dimW) || 0, h = parseFloat(dimH) || 0;
      const pos = findValidPosition(pt.x, pt.y, w, h, W, H, hasShape ? vertices : null);
      if (!pos) return alert('Вырезка не помещается в форму листа');
      setCutRect({ ...pos, w, h });
      setPlacing(false);
      return;
    }

    // Check if clicking on existing cut rect to start drag
    if (cutRect && !result) {
      if (pt.x >= cutRect.x && pt.x <= cutRect.x + cutRect.w &&
          pt.y >= cutRect.y && pt.y <= cutRect.y + cutRect.h) {
        setDragging(true);
        setDragOffset({ x: pt.x - cutRect.x, y: pt.y - cutRect.y });
      }
    }
  };

  const onMouseMove = (e) => {
    const pt = toSVG(e);
    if (!pt) return;

    if (placing) {
      const w = parseFloat(dimW) || 0, h = parseFloat(dimH) || 0;
      const pos = findValidPosition(pt.x, pt.y, w, h, W, H, hasShape ? vertices : null);
      if (pos) setCutRect({ ...pos, w, h });
      return;
    }

    if (dragging && cutRect) {
      const newX = pt.x - dragOffset.x;
      const newY = pt.y - dragOffset.y;
      const pos = findValidPosition(newX, newY, cutRect.w, cutRect.h, W, H, hasShape ? vertices : null);
      if (pos) setCutRect({ ...cutRect, x: pos.x, y: pos.y });
    }
  };

  const onMouseUp = () => {
    setDragging(false);
  };

  // Touch handlers
  const onTouchStart = (e) => {
    e.preventDefault();
    onMouseDown(e);
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    onMouseMove(e);
  };

  const onTouchEnd = () => {
    setDragging(false);
  };

  const startPlace = () => {
    const w = parseFloat(dimW), h = parseFloat(dimH);
    if (!w || !h || w < 10 || h < 10) return alert('Мин. 10x10 мм');
    if (w > W || h > H) return alert(`Макс. ${W}x${H} мм`);
    if (hasShape && !findValidPosition(0, 0, w, h, W, H, vertices)) {
      return alert('Вырезка такого размера не помещается в форму листа');
    }
    setPlacing(true);
    setCutRect({ x: 0, y: 0, w, h });
  };

  const doCut = async () => {
    if (!cutRect || cutRect.w < 10 || cutRect.h < 10) return;
    setSaving(true);
    try {
      const res = await client.post(`/api/v1/warehouse/remnants/0/split`, {
        x: cutRect.x, y: cutRect.y, w: cutRect.w, h: cutRect.h,
        warehouse_item_id: item.id,
      });
      setSavedCut({ ...cutRect });
      setResult(res.data);
      setCutRect(null);
      setDimW('');
      setDimH('');
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const st = { padding: '3px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 3 };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 900, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '6px 14px', flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>
            Резка — {item.metal} {item.grade || ''} {W}x{H}
            {item.article && <span style={{ fontWeight: 400, color: '#64748b' }}> [{item.article}]</span>}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '4px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <svg ref={svgRef} width={sW} height={sH} viewBox={`0 0 ${sW} ${sH}`}
              style={{ border: '2px solid #333', background: '#f8f8f8', cursor: placing ? 'crosshair' : dragging ? 'grabbing' : (cutRect && !result ? 'grab' : 'default'), touchAction: 'none', maxWidth: '60vw' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
              {hasShape && (
                <defs>
                  <clipPath id="sheet-clip">
                    <polygon points={polyPoints} />
                  </clipPath>
                </defs>
              )}
              <g clipPath={hasShape ? 'url(#sheet-clip)' : undefined}>
                {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * 500 * S} y1={0} x2={i * 500 * S} y2={sH} stroke="#e5e7eb" strokeWidth="0.5" />
                ))}
                {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * 500 * S} x2={sW} y2={i * 500 * S} stroke="#e5e7eb" strokeWidth="0.5" />
                ))}
                {hasShape ? (
                  <polygon points={polyPoints} fill="#f0fdf4" stroke="none" />
                ) : (
                  <rect x={0} y={0} width={sW} height={sH} fill="none" stroke="#333" strokeWidth="2" />
                )}
              </g>

              {/* Shape outline on top of clip */}
              {hasShape && (
                <polygon points={polyPoints} fill="none" stroke="#333" strokeWidth="2" style={{ pointerEvents: 'none' }} />
              )}

              {/* Cut preview */}
              {cutRect && !result && (
                <rect x={cutRect.x * S} y={cutRect.y * S} width={cutRect.w * S} height={cutRect.h * S}
                  fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />
              )}

              {/* After cut: show both pieces */}
              {result && savedCut && (
                <>
                  {/* Cut piece - blue */}
                  <rect x={savedCut.x * S} y={savedCut.y * S} width={savedCut.w * S} height={savedCut.h * S}
                    fill={highlight === 'cut' ? '#3b82f6' : '#93c5fd'} fillOpacity={highlight === 'cut' ? 0.5 : 0.3}
                    stroke="#3b82f6" strokeWidth={highlight === 'cut' ? 3 : 2}
                    style={{ cursor: 'pointer' }} onClick={() => setHighlight(highlight === 'cut' ? null : 'cut')} />
                  {/* Remainder - use vertices from API if available, else fallback to rectangles */}
                  {result.remain_item?.vertices && result.remain_item.vertices.length >= 3 ? (
                    <polygon
                      points={result.remain_item.vertices.map(v => `${v[0] * S},${v[1] * S}`).join(' ')}
                      fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08}
                      stroke={highlight === 'remain' ? '#16a34a' : '#86efac'} strokeWidth={highlight === 'remain' ? 3 : 1}
                      style={{ pointerEvents: 'none' }} />
                  ) : (
                    <>
                      <rect x={0} y={0} width={sW} height={sH} fill="none" stroke={highlight === 'remain' ? '#16a34a' : '#86efac'} strokeWidth={highlight === 'remain' ? 3 : 1} strokeDasharray="4,2"
                        style={{ pointerEvents: 'none' }} />
                      <rect x={0} y={0} width={sW} height={savedCut.y * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                      <rect x={0} y={savedCut.y * S} width={savedCut.x * S} height={savedCut.h * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                      <rect x={(savedCut.x + savedCut.w) * S} y={savedCut.y * S} width={(W - savedCut.x - savedCut.w) * S} height={savedCut.h * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                      <rect x={0} y={(savedCut.y + savedCut.h) * S} width={sW} height={(H - savedCut.y - savedCut.h) * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                    </>
                  )}
                  {/* Labels */}
                  <text x={(savedCut.x + savedCut.w / 2) * S} y={(savedCut.y + savedCut.h / 2) * S}
                    textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#1d4ed8" fontWeight="600" style={{ pointerEvents: 'none' }}>
                    {result.cut_item?.article}
                  </text>
                </>
              )}
            </svg>
            <div style={{ marginTop: 2, fontSize: 10, color: '#64748b', textAlign: 'center' }}>1px = {1 / S} мм</div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 140px', padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Размер вырезки</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input type="number" value={dimW} onChange={e => setDimW(e.target.value)} placeholder="Ш мм" style={{ ...st, width: 70, flex: 'none' }} />
                <input type="number" value={dimH} onChange={e => setDimH(e.target.value)} placeholder="В мм" style={{ ...st, width: 70, flex: 'none' }} />
              </div>
              {placing && <div style={{ fontSize: 10, color: '#1d4ed8', marginBottom: 3 }}>Кликните на лист</div>}
              <button className="btn" onClick={placing ? () => { setPlacing(false); setCutRect(null); } : startPlace}
                style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontWeight: 600,
                  background: placing ? '#fee2e2' : '#dbeafe', color: placing ? '#991b1b' : '#1d4ed8',
                  border: placing ? '1px solid #fca5a5' : '1px solid #93c5fd' }}>
                {placing ? 'Отмена' : 'Разместить'}
              </button>
            </div>

            {cutRect && !result && (
              <div style={{ padding: '6px 8px', background: '#fef3c7', borderRadius: 6, fontSize: 11 }}>
                <strong>{Math.round(cutRect.w)}x{Math.round(cutRect.h)} мм</strong>
                <button className="btn btn-primary" onClick={doCut} disabled={saving}
                  style={{ width: '100%', marginTop: 4, padding: '6px 8px', fontSize: 12, fontWeight: 700 }}>
                  {saving ? 'Вырезка...' : 'Вырезать'}
                </button>
              </div>
            )}

            {result && (
              <div style={{ padding: '6px 8px', background: '#dcfce7', borderRadius: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>Лист разрезан!</div>
                {result.cut_item && (
                  <div onClick={() => setHighlight(highlight === 'cut' ? null : 'cut')}
                    style={{ padding: '5px 8px', marginBottom: 3, borderRadius: 4, cursor: 'pointer',
                      background: highlight === 'cut' ? '#bfdbfe' : '#eff6ff', border: '2px solid ' + (highlight === 'cut' ? '#3b82f6' : '#93c5fd') }}>
                    <span style={{ color: '#3b82f6' }}>&#9632;</span> <strong>{result.cut_item.article}</strong>
                    <span style={{ marginLeft: 4, color: '#64748b' }}>{result.cut_item.sheet_w}x{result.cut_item.sheet_h}</span>
                  </div>
                )}
                {result.remain_item && (
                  <div onClick={() => setHighlight(highlight === 'remain' ? null : 'remain')}
                    style={{ padding: '5px 8px', marginBottom: 3, borderRadius: 4, cursor: 'pointer',
                      background: highlight === 'remain' ? '#bbf7d0' : '#f0fdf4', border: '2px solid ' + (highlight === 'remain' ? '#22c55e' : '#86efac') }}>
                    <span style={{ color: '#22c55e' }}>&#9632;</span> <strong>{result.remain_item.article}</strong>
                    <span style={{ marginLeft: 4, color: '#64748b' }}>{result.remain_item.sheet_w}x{result.remain_item.sheet_h}</span>
                  </div>
                )}
                {result.remain_remnant && !result.remain_item && (
                  <div onClick={() => setHighlight(highlight === 'remain' ? null : 'remain')}
                    style={{ padding: '5px 8px', marginBottom: 3, borderRadius: 4, cursor: 'pointer',
                      background: highlight === 'remain' ? '#bbf7d0' : '#f0fdf4', border: '2px solid ' + (highlight === 'remain' ? '#22c55e' : '#86efac') }}>
                    <span style={{ color: '#22c55e' }}>&#9632;</span> <strong>{result.remain_remnant.article || 'Остаток'}</strong>
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>Нажмите для подсветки на листе</div>
              </div>
            )}

            {result ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn" onClick={() => { if (onSuccess) onSuccess(); onClose(); }}
                  style={{ flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: '#059669', color: '#fff', border: '1px solid #047857' }}>
                  Сохранить
                </button>
                <button className="btn" onClick={onClose}
                  style={{ flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                  Отмена
                </button>
              </div>
            ) : (
              <button className="btn" onClick={onClose}
                style={{ width: '100%', padding: '6px 8px', fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                Закрыть
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
