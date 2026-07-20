import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Deficit() {
  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const myCustomerNames = user?.customer_names || [];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stdW, setStdW] = useState(1500);
  const [stdH, setStdH] = useState(6000);
  const [appliedW, setAppliedW] = useState(1500);
  const [appliedH, setAppliedH] = useState(6000);
  const [modalRow, setModalRow] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [filterGrade, setFilterGrade] = useState([]);
  const [filterThickness, setFilterThickness] = useState([]);
  const [filterCustomer, setFilterCustomer] = useState([]);
  const [showFilter, setShowFilter] = useState(null);
  const [searchArticle, setSearchArticle] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/warehouse/deficit-analysis', { params: { standard_w: appliedW, standard_h: appliedH } });
      setData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [appliedW, appliedH]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-set customer filter for customer-role users
  useEffect(() => {
    if (isCustomer && myCustomerNames.length > 0 && filterCustomer.length === 0) {
      setFilterCustomer(myCustomerNames);
    }
  }, [isCustomer, myCustomerNames]);

  const applySize = () => {
    setAppliedW(stdW);
    setAppliedH(stdH);
  };
  useEffect(() => { const h = () => setShowFilter(null); if (showFilter) document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [showFilter]);

  const exportExcel = async () => {
    try {
      const params = new URLSearchParams({ standard_w: stdW, standard_h: stdH });
      if (filterGrade.length) params.set('grade', filterGrade.join(','));
      if (filterThickness.length) params.set('thickness', filterThickness.join(','));
      if (filterCustomer.length) params.set('customer', filterCustomer.join(','));
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/warehouse/deficit-export?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'deficit.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert('Ошибка экспорта'); }
  };

  if (loading) return <div className="loading">Загрузка...</div>;
  if (!data) return <div style={{ padding: 20, color: '#64748b' }}>Нет данных</div>;

  const { deficit } = data;
  const stdArea = (appliedW * appliedH / 1000000).toFixed(2);
  const hasCF = filterCustomer.length > 0;

  const allCustomers = [...new Set(deficit.flatMap(r => [
    ...Object.keys(r.demand_by_customer || {}),
    ...Object.keys(r.stock_by_customer || {}),
  ]))].sort();

  const filtered = deficit
    .filter(r => filterGrade.length === 0 || filterGrade.includes(r.grade || '—'))
    .filter(r => filterThickness.length === 0 || filterThickness.includes(r.thickness ? `${r.thickness}мм` : '—'))
    .filter(r => {
      if (!searchArticle) return true;
      const q = searchArticle.toLowerCase();
      // Search in grade, metal, order names, layout codes, and warehouse articles
      if ((r.grade || '').toLowerCase().includes(q)) return true;
      if ((r.metal || '').toLowerCase().includes(q)) return true;
      for (const cust of Object.values(r.demand_by_customer || {})) {
        if (cust.layouts) {
          for (const l of cust.layouts) {
            if ((l.order_name || '').toLowerCase().includes(q) || (l.layout_code || '').toLowerCase().includes(q)) return true;
          }
        }
      }
      for (const cust of Object.values(r.stock_by_customer || {})) {
        if (cust.articles) {
          for (const a of cust.articles) {
            if ((a.article || '').toLowerCase().includes(q)) return true;
          }
        }
      }
      return false;
    })
    .map(r => {
      if (!hasCF) return r;
      let cDemand = 0, cStock = 0, cStockArea = 0;
      for (const c of filterCustomer) { cDemand += (r.demand_by_customer || {})[c]?.area || 0; cStock += (r.stock_by_customer || {})[c]?.sheets || 0; cStockArea += (r.stock_by_customer || {})[c]?.area || 0; }
      return { ...r, _ds: cDemand / (appliedW * appliedH), _da: cDemand, _ss: cStock, _sa: cStockArea, _bal: cStock - cDemand / (appliedW * appliedH) };
    })
    .filter(r => !hasCF || r._da > 0 || r._ss > 0);

  const uniqueGrades = [...new Set(deficit.map(r => r.grade || '—'))];
  const uniqueThicknesses = [...new Set(deficit.map(r => r.thickness ? `${r.thickness}мм` : '—'))];
  const toggleFilter = (setter, val) => setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

  const DD = ({ col, values, selected, setter, label, align }) => (
    <th style={{ position: 'relative', whiteSpace: 'nowrap', borderRight: '1px solid #d1d5db', textAlign: align || 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, background: '#f1f5f9' }}>
      <span onClick={(e) => { e.stopPropagation(); setShowFilter(showFilter === col ? null : col); }} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label} {selected.length > 0 ? '' : '▾'}
      </span>
      {showFilter === col && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 110, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
          {values.map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 3, background: selected.includes(v) ? '#eff6ff' : 'transparent' }}>
              <input type="checkbox" checked={selected.includes(v)} onChange={() => toggleFilter(setter, v)} style={{ margin: 0 }} />
              {v}
            </label>
          ))}
          {selected.length > 0 && <div onClick={() => setter([])} style={{ padding: '2px 6px', fontSize: 10, color: '#ef4444', cursor: 'pointer', borderTop: '1px solid var(--border)', marginTop: 2, textAlign: 'center' }}>Сбросить</div>}
        </div>
      )}
    </th>
  );

  const toggle = (key) => setModalRow(modalRow === key ? null : key);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Стандартный лист:</span>
        <input type="number" value={stdW} onChange={e => setStdW(parseInt(e.target.value) || 1500)} style={{ width: 55, padding: '2px 5px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 3 }} />
        <span style={{ fontSize: 11 }}>×</span>
        <input type="number" value={stdH} onChange={e => setStdH(parseInt(e.target.value) || 6000)} style={{ width: 55, padding: '2px 5px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 3 }} />
        <span style={{ fontSize: 11, color: '#64748b' }}>мм ({stdArea} м²)</span>
        {(stdW !== appliedW || stdH !== appliedH) && (
          <button className="btn btn-primary" onClick={applySize} style={{ padding: '2px 8px', fontSize: 11 }}>Применить</button>
        )}
        {!isCustomer && (
          <>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 12 }}>Заказчик:</span>
            <div style={{ position: 'relative' }}>
              <span onClick={(e) => { e.stopPropagation(); setShowFilter(showFilter === 'customer' ? null : 'customer'); }}
                style={{ cursor: 'pointer', fontSize: 12, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 3, background: hasCF ? '#dbeafe' : '#fff' }}>
                {hasCF ? (filterCustomer.length <= 2 ? filterCustomer.join(', ') : `${filterCustomer[0]} +${filterCustomer.length - 1}`) : 'Все'} ▾
              </span>
              {showFilter === 'customer' && (
                <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 160, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
                  {allCustomers.map(c => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 3, background: filterCustomer.includes(c) ? '#eff6ff' : 'transparent' }}>
                      <input type="checkbox" checked={filterCustomer.includes(c)} onChange={() => toggleFilter(setFilterCustomer, c)} style={{ margin: 0 }} />
                      {c}
                    </label>
                  ))}
                  {hasCF && <div onClick={() => setFilterCustomer([])} style={{ padding: '2px 6px', fontSize: 10, color: '#ef4444', cursor: 'pointer', borderTop: '1px solid var(--border)', marginTop: 2, textAlign: 'center' }}>Сбросить</div>}
                </div>
              )}
            </div>
          </>
        )}
        <button className="btn" onClick={exportExcel} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }}>📥 Excel</button>
        <input
          type="text"
          value={searchArticle}
          onChange={e => setSearchArticle(e.target.value)}
          placeholder="Поиск по артикулу..."
          style={{ width: 180, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
        />
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' }}>
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <colgroup>
            <col style={{ width: '15%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '4%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #9ca3af' }}>
              <DD col="grade" values={uniqueGrades} selected={filterGrade} setter={setFilterGrade} label="Марка" />
              <DD col="thickness" values={uniqueThicknesses} selected={filterThickness} setter={setFilterThickness} label="Толщ." align="center" />
              <th style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center', background: '#dbeafe', borderRight: '1px solid #93c5fd', color: '#1e40af' }}>Заказ, листы</th>
              <th style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center', background: '#dbeafe', borderRight: '1px solid #93c5fd', color: '#1e40af' }}>Заказ, м²</th>
              <th style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center', background: '#dcfce7', borderRight: '1px solid #86efac', color: '#166534' }}>Склад, листы</th>
              <th style={{ padding: '6px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center', background: '#dcfce7', borderRight: '1px solid #86efac', color: '#166534' }}>Склад, м²</th>
              <th style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, textAlign: 'center', background: '#f8fafc', borderRight: '1px solid #d1d5db' }}>Баланс</th>
              <th style={{ width: '4%', background: '#f8fafc', fontSize: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 16, color: '#64748b' }}>Нет данных</td></tr>
            ) : filtered.map((row) => {
              const key = `${row.grade}|${row.thickness}`;
              const dS = hasCF ? row._ds : row.demand_sheets_std;
              const dA = hasCF ? row._da : row.demand_area;
              const sS = hasCF ? row._ss : row.stock_sheets;
              const sA = hasCF ? row._sa : row.stock_area;
              const bal = hasCF ? row._bal : row.deficit_sheets;

              return (
                <tr key={key} onClick={() => toggle(key)} style={{ cursor: 'pointer', borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, borderRight: '1px solid #e5e7eb', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.grade || '—'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', borderRight: '1px solid #e5e7eb', fontSize: 12 }}>{row.thickness ? `${row.thickness}мм` : '—'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', background: '#eff6ff', borderRight: '1px solid #bfdbfe', fontSize: 12, fontWeight: 600 }}>
                    {dS ? (typeof dS === 'number' ? dS.toFixed(1) : dS) : '0'}
                  </td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', background: '#eff6ff', borderRight: '1px solid #bfdbfe', fontSize: 12 }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>{(dA / 1000000).toFixed(1)}м²</span>
                  </td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', background: '#f0fdf4', borderRight: '1px solid #bbf7d0', fontSize: 12, fontWeight: 600 }}>
                    {sS}
                  </td>
                  <td style={{ padding: '6px 6px', textAlign: 'center', background: '#f0fdf4', borderRight: '1px solid #bbf7d0', fontSize: 12 }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>{(sA / 1000000).toFixed(1)}м²</span>
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 12, padding: '1px 6px', borderRadius: 3, display: 'inline-block', minWidth: 36,
                      background: bal < 0 ? '#fee2e2' : bal === 0 ? '#f1f5f9' : '#dcfce7',
                      color: bal < 0 ? '#dc2626' : bal === 0 ? '#6b7280' : '#166534',
                    }}>
                      {bal > 0 ? '+' : ''}{typeof bal === 'number' ? (bal % 1 === 0 ? bal : bal.toFixed(1)) : bal}
                    </span>
                  </td>
                  <td style={{ width: '4%', padding: '6px 2px', textAlign: 'center', fontSize: 9, color: '#9ca3af' }}>▾</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Detail modal */}
      {modalRow && (() => {
        const row = filtered.find(r => `${r.grade}|${r.thickness}` === modalRow);
        if (!row) return null;
        const dA = hasCF ? (filterCustomer.reduce((s, c) => s + ((row.demand_by_customer || {})[c]?.area || 0), 0)) : row.demand_area;
        const sS = hasCF ? (filterCustomer.reduce((s, c) => s + ((row.stock_by_customer || {})[c]?.sheets || 0), 0)) : row.stock_sheets;
        const sA = hasCF ? (filterCustomer.reduce((s, c) => s + ((row.stock_by_customer || {})[c]?.area || 0), 0)) : row.stock_area;
        const dS = hasCF ? (dA / (appliedW * appliedH)) : row.demand_sheets_std;
        const dCusts = hasCF
          ? Object.entries(row.demand_by_customer || {}).filter(([n]) => filterCustomer.includes(n))
          : Object.entries(row.demand_by_customer || {});
        const sCusts = hasCF
          ? Object.entries(row.stock_by_customer || {}).filter(([n]) => filterCustomer.includes(n))
          : Object.entries(row.stock_by_customer || {});
        return (
          <div className="modal-overlay active" onClick={() => { setModalRow(null); setExpandedOrder(null); setSelectedArticle(null); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
              <div className="modal-header">
                <h3 style={{ fontSize: 14 }}>{row.grade || '—'} {row.thickness ? `${row.thickness}мм` : ''}</h3>
                <button className="close-btn" onClick={() => { setModalRow(null); setExpandedOrder(null); setSelectedArticle(null); }}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: 16 }}>
                  {/* Orders — left */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>Заказы</div>
                    {dCusts.length === 0 ? (
                      <div style={{ color: '#9ca3b8', fontSize: 12 }}>Нет активных заказов</div>
                    ) : dCusts.map(([name, v]) => (
                      <div key={name} style={{ borderBottom: '1px solid #e0edff' }}>
                        <div
                          onClick={() => setExpandedOrder(expandedOrder === name ? null : name)}
                          style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', cursor: 'pointer', fontSize: 12 }}
                        >
                          <span>{name}</span>
                          <span style={{ color: '#64748b', whiteSpace: 'nowrap', marginLeft: 8 }}>{v.sheets_std} л · {(v.area / 1000000).toFixed(1)} м² {v.layouts && v.layouts.length > 0 ? '▾' : ''}</span>
                        </div>
                        {expandedOrder === name && v.layouts && v.layouts.length > 0 && (
                          <div style={{ padding: '4px 0 4px 12px', fontSize: 11, color: '#64748b' }}>
                            {v.layouts.map((l, i) => {
                              const area = ((l.sheet_w || 0) * (l.sheet_h || 0) / 1000000).toFixed(2);
                              const code = l.layout_code || '001';
                              return (
                                <div key={i} style={{ padding: '2px 0' }}>
                                  #{l.order_name}.{code}, {l.sheet_w}×{l.sheet_h}, {area}м², {l.sheet_count} лист
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700, fontSize: 13, borderTop: '2px solid #bfdbfe', marginTop: 4 }}>
                      <span>Итого</span>
                      <span>{typeof dS === 'number' ? dS.toFixed(1) : dS} л · {(dA / 1000000).toFixed(1)} м²</span>
                    </div>
                  </div>
                  {/* Stock — right */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>Склад</div>
                    {sCusts.length === 0 ? (
                      <div style={{ color: '#9ca3b8', fontSize: 12 }}>Нет на складе</div>
                    ) : sCusts.map(([name, v]) => (
                      <div key={name} style={{ padding: '4px 0', borderBottom: '1px solid #dcfce7', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{name}</span>
                          <span style={{ color: '#64748b', whiteSpace: 'nowrap', marginLeft: 8 }}>{v.sheets} л · {(v.area / 1000000).toFixed(1)} м²</span>
                        </div>
                        {v.articles && v.articles.length > 0 && (
                          <div style={{ fontSize: 10, color: '#6366f1', fontFamily: 'monospace', marginTop: 2 }}>
                            {v.articles.map((art, i) => (
                              <span
                                key={i}
                                onClick={(e) => { e.stopPropagation(); setSelectedArticle(selectedArticle === art ? null : art); }}
                                style={{ cursor: 'pointer', background: selectedArticle === art ? '#e0e7ff' : 'transparent', padding: '0 2px', borderRadius: 2 }}
                              >
                                {i > 0 ? ', ' : ''}{art}
                              </span>
                            ))}
                          </div>
                        )}
                        {selectedArticle && v.items && v.items.filter(it => it.article === selectedArticle).map((it, i) => {
                          const W = it.sheet_w || 0, H = it.sheet_h || 0;
                          const vertices = it.vertices;
                          const scale = Math.min(80 / Math.max(W, 1), 150 / Math.max(H, 1));
                          const svgW = W * scale, svgH = H * scale;
                          const polyPoints = vertices && vertices.length >= 3
                            ? vertices.map(v => `${v[0] * scale},${v[1] * scale}`).join(' ')
                            : null;
                          const area = (W * H / 1000000).toFixed(2);
                          return (
                            <div key={i} style={{ marginTop: 4, padding: 6, background: '#f0fdf4', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                              <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ border: '1.5px solid #333', background: '#f8f8f8', flexShrink: 0 }}>
                                {polyPoints ? (
                                  <polygon points={polyPoints} fill="#dcfce7" fillOpacity="0.5" stroke="#333" strokeWidth="1.5" />
                                ) : (
                                  <rect x={0} y={0} width={svgW} height={svgH} fill="none" stroke="#333" strokeWidth="1.5" />
                                )}
                              </svg>
                              <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{it.article}</div>
                                <div>{W}×{H} мм · {area} м²</div>
                                <div>{it.sheet_count} лист</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700, fontSize: 13, borderTop: '2px solid #bbf7d0', marginTop: 4 }}>
                      <span>Итого</span>
                      <span>{sS} л · {(sA / 1000000).toFixed(1)} м²</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
