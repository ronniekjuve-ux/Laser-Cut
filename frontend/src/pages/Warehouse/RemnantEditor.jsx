import { useState, useEffect, useRef, useMemo } from 'react';
import client from '../../api/client';
import useIsMobile from '../../hooks/useIsMobile';

const EDGE_SNAP = 30;
const PAD = 20; // padding around sheet in mm

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

function EdgeLabels({ vertices, scale, offset = 8, fontSize = 7 }) {
  if (!vertices || vertices.length < 2) return null;
  return vertices.map((v, i) => {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const len = Math.round(Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2));
    if (len === 0) return null;
    const mx = (a[0] + b[0]) / 2 * scale;
    const my = (a[1] + b[1]) / 2 * scale;
    const angle = Math.atan2((b[1] - a[1]) * scale, (b[0] - a[0]) * scale) * 180 / Math.PI;
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
  const m = 0.5;
  return pointInPolygon(rx + m, ry + m, vertices) &&
    pointInPolygon(rx + rw - m, ry + m, vertices) &&
    pointInPolygon(rx + m, ry + rh - m, vertices) &&
    pointInPolygon(rx + rw - m, ry + rh - m, vertices);
}

function findValidPosition(x, y, w, h, W, H, vertices) {
  if (!vertices) {
    return { x: Math.max(0, Math.min(W - w, x)), y: Math.max(0, Math.min(H - h, y)) };
  }
  const cx = Math.max(0, Math.min(W - w, x));
  const cy = Math.max(0, Math.min(H - h, y));
  if (rectInPolygon(cx, cy, w, h, vertices)) return { x: cx, y: cy };

  const xs = new Set([0]);
  const ys = new Set([0]);
  for (let i = 0; i < vertices.length; i++) {
    const vx = vertices[i][0], vy = vertices[i][1];
    xs.add(Math.max(0, Math.min(W - w, vx)));
    xs.add(Math.max(0, Math.min(W - w, vx - w)));
    ys.add(Math.max(0, Math.min(H - h, vy)));
    ys.add(Math.max(0, Math.min(H - h, vy - h)));
  }

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

function parseVertices(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  return Array.isArray(v) && v.length >= 3 ? v : null;
}

export default function RemnantEditor({ item, onClose, onSuccess }) {
  const isMobile = useIsMobile();
  const svgRef = useRef(null);
  const [cutRect, setCutRect] = useState(null);
  const [result, setResult] = useState(null);
  const [savedCut, setSavedCut] = useState(null);
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState(null);

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const cutRectRef = useRef(null);
  const placingRef = useRef(false);

  const S = 0.05;
  const W = item.sheet_w || 1500;
  const H = item.sheet_h || 6000;
  const sW = W * S, sH = H * S;

  const rawVertices = item.vertices;
  const vertices = parseVertices(rawVertices);
  const hasShape = !!vertices;
  const polyPoints = useMemo(() =>
    hasShape ? vertices.map(v => `${(v[0] + PAD) * S},${(v[1] + PAD) * S}`).join(' ') : null,
    [hasShape, vertices, S]
  );

  // ViewBox includes padding
  const vbW = (W + PAD * 2) * S;
  const vbH = (H + PAD * 2) * S;

  useEffect(() => {
    setCutRect(null);
    setResult(null);
    setSavedCut(null);
    setDimW('');
    setDimH('');
    setPlacing(false);
    setHighlight(null);
    draggingRef.current = false;
  }, [item]);

  useEffect(() => { cutRectRef.current = cutRect; }, [cutRect]);
  useEffect(() => { placingRef.current = placing; }, [placing]);

  // Convert screen coords to sheet mm using SVG CTM
  const clientToSheet = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    try {
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      if (!isFinite(svgPt.x) || !isFinite(svgPt.y)) return null;
      return { x: (svgPt.x / S) - PAD, y: (svgPt.y / S) - PAD };
    } catch {
      return null;
    }
  };

  // Global mouse/touch handlers
  useEffect(() => {
    const handleMove = (clientX, clientY) => {
      const pt = clientToSheet(clientX, clientY);
      if (!pt) return;

      if (placingRef.current) {
        const cr = cutRectRef.current;
        if (!cr) return;
        // Edge snapping in placing mode — snap when cursor is near sheet edges
        let sx = pt.x, sy = pt.y;
        if (Math.abs(sy) < EDGE_SNAP) sy = 0;
        else if (Math.abs(sy + cr.h - H) < EDGE_SNAP) sy = H - cr.h;
        if (Math.abs(sx) < EDGE_SNAP) sx = 0;
        else if (Math.abs(sx + cr.w - W) < EDGE_SNAP) sx = W - cr.w;
        const pos = findValidPosition(sx, sy, cr.w, cr.h, W, H, hasShape ? vertices : null);
        if (pos) setCutRect({ ...pos, w: cr.w, h: cr.h });
        return;
      }

      if (draggingRef.current && cutRectRef.current) {
        const cr = cutRectRef.current;
        let newX = pt.x - dragOffsetRef.current.x;
        let newY = pt.y - dragOffsetRef.current.y;

        if (Math.abs(newX) < EDGE_SNAP) newX = 0;
        else if (Math.abs(newX + cr.w - W) < EDGE_SNAP) newX = W - cr.w;
        if (Math.abs(newY) < EDGE_SNAP) newY = 0;
        else if (Math.abs(newY + cr.h - H) < EDGE_SNAP) newY = H - cr.h;

        const pos = findValidPosition(newX, newY, cr.w, cr.h, W, H, hasShape ? vertices : null);
        if (pos) setCutRect({ ...cr, x: pos.x, y: pos.y });
      }
    };

    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => { draggingRef.current = false; };
    const onTouchMove = (e) => { try { e.preventDefault(); } catch {} handleMove(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchEnd = () => { draggingRef.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [W, H, hasShape, vertices, S]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    const pt = clientToSheet(e.clientX, e.clientY);
    if (!pt) return;

    if (placingRef.current) {
      const cr = cutRectRef.current;
      if (!cr) return;
      const pos = findValidPosition(pt.x, pt.y, cr.w, cr.h, W, H, hasShape ? vertices : null);
      if (!pos) return;
      placingRef.current = false;
      setPlacing(false);
      setCutRect({ ...pos, w: cr.w, h: cr.h });
      return;
    }

    const cr = cutRectRef.current;
    if (cr && !result) {
      if (pt.x >= cr.x && pt.x <= cr.x + cr.w && pt.y >= cr.y && pt.y <= cr.y + cr.h) {
        draggingRef.current = true;
        dragOffsetRef.current = { x: pt.x - cr.x, y: pt.y - cr.y };
      }
    }
  };

  const startPlace = () => {
    const w = parseFloat(dimW), h = parseFloat(dimH);
    if (!w || !h || w < 10 || h < 10) return alert('Мин. 10x10 мм');
    if (w > W || h > H) return alert(`Макс. ${W}x${H} мм`);
    if (hasShape && !findValidPosition(0, 0, w, h, W, H, vertices)) {
      return alert('Вырезка такого размера не помещается');
    }
    setPlacing(true);
    setCutRect({ x: 0, y: 0, w, h });
  };

  const cancelPlace = () => {
    placingRef.current = false;
    setPlacing(false);
    setCutRect(null);
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

  const st = { padding: '3px 5px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 3, boxSizing: 'border-box' };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: isMobile ? '100vw' : 900, width: isMobile ? '100vw' : '90vw', height: isMobile ? '100dvh' : '75vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ padding: '6px 14px', flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>
            Резка — {item.metal} {item.grade || ''} {W}x{H}
            {item.article && <span style={{ fontWeight: 400, color: '#64748b' }}> [{item.article}]</span>}
          </h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: isMobile ? '4px 8px 8px' : '4px 14px 8px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 6 : 10, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* SVG Sheet — left */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', ...(isMobile ? { flex: 'none', height: '45vh', minHeight: 200 } : {}) }}>
            <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet"
              style={{ width: '100%', height: '100%', border: '2px solid #333', background: '#f8f8f8',
                cursor: placing ? 'crosshair' : (cutRect && !result ? 'grab' : 'default'), touchAction: 'none' }}
              onMouseDown={handlePointerDown} onTouchStart={handlePointerDown}>
              {hasShape && (
                <defs>
                  <clipPath id="sheet-clip"><polygon points={polyPoints} /></clipPath>
                </defs>
              )}
              <g transform={`translate(${PAD * S}, ${PAD * S})`}>
                <g clipPath={hasShape ? 'url(#sheet-clip)' : undefined}>
                  {Array.from({ length: Math.floor(W / 500) + 1 }, (_, i) => (
                    <line key={`v${i}`} x1={i * 500 * S} y1={0} x2={i * 500 * S} y2={sH} stroke="#e5e7eb" strokeWidth="0.5" />
                  ))}
                  {Array.from({ length: Math.floor(H / 500) + 1 }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i * 500 * S} x2={sW} y2={i * 500 * S} stroke="#e5e7eb" strokeWidth="0.5" />
                  ))}
                  {hasShape ? (
                    <polygon points={vertices.map(v => `${v[0] * S},${v[1] * S}`).join(' ')} fill="#f0fdf4" stroke="none" />
                  ) : (
                    <rect x={0} y={0} width={sW} height={sH} fill="none" stroke="#333" strokeWidth="2" />
                  )}
                </g>
                {hasShape && <polygon points={vertices.map(v => `${v[0] * S},${v[1] * S}`).join(' ')} fill="none" stroke="#333" strokeWidth="2" style={{ pointerEvents: 'none' }} />}
                {cutRect && !result && (
                  <rect x={cutRect.x * S} y={cutRect.y * S} width={cutRect.w * S} height={cutRect.h * S}
                    fill="#ef4444" fillOpacity={0.3} stroke="#ef4444" strokeWidth={2} strokeDasharray="5,3" />
                )}
                {result && savedCut && (
                  <>
                    <rect x={savedCut.x * S} y={savedCut.y * S} width={savedCut.w * S} height={savedCut.h * S}
                      fill={highlight === 'cut' ? '#3b82f6' : '#93c5fd'} fillOpacity={highlight === 'cut' ? 0.5 : 0.3}
                      stroke="#3b82f6" strokeWidth={highlight === 'cut' ? 3 : 2}
                      style={{ cursor: 'pointer' }} onClick={() => setHighlight(highlight === 'cut' ? null : 'cut')} />
                    {(() => { const rv = parseVertices(result.remain_item?.vertices); return rv ? (
                      <>
                        <polygon points={rv.map(v => `${v[0] * S},${v[1] * S}`).join(' ')}
                          fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08}
                          stroke={highlight === 'remain' ? '#16a34a' : '#86efac'} strokeWidth={highlight === 'remain' ? 3 : 1}
                          style={{ pointerEvents: 'none' }} />
                        <EdgeLabels vertices={rv} scale={S} offset={12} fontSize={7} />
                      </>
                    ) : (
                      <>
                        <rect x={0} y={0} width={sW} height={sH} fill="none" stroke={highlight === 'remain' ? '#16a34a' : '#86efac'} strokeWidth={highlight === 'remain' ? 3 : 1} strokeDasharray="4,2" style={{ pointerEvents: 'none' }} />
                        <rect x={0} y={0} width={sW} height={savedCut.y * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                        <rect x={0} y={savedCut.y * S} width={savedCut.x * S} height={savedCut.h * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                        <rect x={(savedCut.x + savedCut.w) * S} y={savedCut.y * S} width={(W - savedCut.x - savedCut.w) * S} height={savedCut.h * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                        <rect x={0} y={(savedCut.y + savedCut.h) * S} width={sW} height={(H - savedCut.y - savedCut.h) * S} fill="#22c55e" fillOpacity={highlight === 'remain' ? 0.2 : 0.08} style={{ pointerEvents: 'none' }} />
                      </>
                    )})()}
                    <text x={(savedCut.x + savedCut.w / 2) * S} y={(savedCut.y + savedCut.h / 2) * S}
                      textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#1d4ed8" fontWeight="600" style={{ pointerEvents: 'none' }}>
                      {result.cut_item?.article}
                    </text>
                  </>
                )}
              </g>
            </svg>
            <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', flexShrink: 0 }}>1px = {1 / S} мм</div>
          </div>

          {/* Controls — right */}
          <div style={{ width: isMobile ? '100%' : 270, flex: isMobile ? 1 : 'none', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto', minHeight: 0 }}>
            <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Размер вырезки</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                <input type="number" value={dimW} onChange={e => setDimW(e.target.value)} placeholder="Ш" style={{ ...st, width: 70 }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>×</span>
                <input type="number" value={dimH} onChange={e => setDimH(e.target.value)} placeholder="В" style={{ ...st, width: 70 }} />
                <span style={{ fontSize: 10, color: '#94a3b8' }}>мм</span>
              </div>
              {placing && <div style={{ fontSize: 10, color: '#1d4ed8', marginBottom: 4 }}>Кликните на лист для закрепления</div>}
              {placing ? (
                <button className="btn" onClick={cancelPlace}
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontWeight: 600,
                    background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                  Отмена
                </button>
              ) : (
                <button className="btn" onClick={startPlace}
                  style={{ width: '100%', padding: '5px 8px', fontSize: 11, fontWeight: 600,
                    background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>
                  Разместить
                </button>
              )}
            </div>

            {cutRect && !result && !placing && (
              <div style={{ padding: '8px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{Math.round(cutRect.w)}×{Math.round(cutRect.h)} мм</div>
                <div style={{ fontSize: 10, color: '#92400e' }}>x: {Math.round(cutRect.x)} y: {Math.round(cutRect.y)}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <button className="btn" onClick={cancelPlace}
                    style={{ flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 600,
                      background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                    Отмена
                  </button>
                  <button className="btn btn-primary" onClick={doCut} disabled={saving}
                    style={{ flex: 1, padding: '5px 6px', fontSize: 11, fontWeight: 700 }}>
                    {saving ? '...' : 'Вырезать'}
                  </button>
                </div>
              </div>
            )}

            {result && (
              <div style={{ padding: '8px 10px', background: '#dcfce7', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: '#166534', marginBottom: 6 }}>Лист разрезан!</div>
                {result.cut_item && (
                  <div onClick={() => setHighlight(highlight === 'cut' ? null : 'cut')}
                    style={{ padding: '5px 8px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
                      background: highlight === 'cut' ? '#bfdbfe' : '#eff6ff', border: '2px solid ' + (highlight === 'cut' ? '#3b82f6' : '#93c5fd') }}>
                    <span style={{ color: '#3b82f6' }}>&#9632;</span> <strong>{result.cut_item.article}</strong>
                    <span style={{ marginLeft: 4, color: '#64748b', fontSize: 11 }}>{result.cut_item.sheet_w}×{result.cut_item.sheet_h}</span>
                  </div>
                )}
                {result.remain_item && (() => {
                  const verts = parseVertices(result.remain_item.vertices);
                  const edges = polyEdgeLengths(verts);
                  const isRect = edges.length === 4;
                  return (
                    <div onClick={() => setHighlight(highlight === 'remain' ? null : 'remain')}
                      style={{ padding: '5px 8px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
                        background: highlight === 'remain' ? '#bbf7d0' : '#f0fdf4', border: '2px solid ' + (highlight === 'remain' ? '#22c55e' : '#86efac') }}>
                      <span style={{ color: '#22c55e' }}>&#9632;</span> <strong>{result.remain_item.article}</strong>
                      <span style={{ marginLeft: 4, color: '#64748b', fontSize: 11 }}>{result.remain_item.sheet_w}×{result.remain_item.sheet_h}</span>
                      {isRect ? (
                        <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>Прямоугольник: {edges[0]}×{edges[1]} мм</div>
                      ) : (
                        <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>
                          Стороны: {edges.join(' × ')} мм
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Нажмите для подсветки</div>
              </div>
            )}

            <div style={{ marginTop: 'auto' }}>
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
    </div>
  );
}
