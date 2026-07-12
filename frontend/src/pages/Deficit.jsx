import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

export default function Deficit() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stdW, setStdW] = useState(1500);
  const [stdH, setStdH] = useState(6000);
  const [expanded, setExpanded] = useState(null); // key: grade|thickness
  const [filterGrade, setFilterGrade] = useState([]);
  const [filterThickness, setFilterThickness] = useState([]);
  const [filterCustomer, setFilterCustomer] = useState([]);
  const [showFilter, setShowFilter] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/warehouse/deficit-analysis', { params: { standard_w: stdW, standard_h: stdH } });
      setData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [stdW, stdH]);

  useEffect(() => { fetchData(); }, [fetchData]);
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
  const stdArea = (stdW * stdH / 1000000).toFixed(2);
  const hasCF = filterCustomer.length > 0;

  const allCustomers = [...new Set(deficit.flatMap(r => [
    ...Object.keys(r.demand_by_customer || {}),
    ...Object.keys(r.stock_by_customer || {}),
  ]))].sort();

  const filtered = deficit
    .filter(r => filterGrade.length === 0 || filterGrade.includes(r.grade || '—'))
    .filter(r => filterThickness.length === 0 || filterThickness.includes(r.thickness ? `${r.thickness}мм` : '—'))
    .map(r => {
      if (!hasCF) return r;
      let cDemand = 0, cStock = 0, cStockArea = 0;
      for (const c of filterCustomer) { cDemand += (r.demand_by_customer || {})[c]?.area || 0; cStock += (r.stock_by_customer || {})[c]?.sheets || 0; cStockArea += (r.stock_by_customer || {})[c]?.area || 0; }
      return { ...r, _ds: cDemand / (stdW * stdH), _da: cDemand, _ss: cStock, _sa: cStockArea, _bal: cStock - cDemand / (stdW * stdH) };
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

  const toggle = (key) => setExpanded(expanded === key ? null : key);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Стандартный лист:</span>
        <input type="number" value={stdW} onChange={e => setStdW(parseInt(e.target.value) || 1500)} style={{ width: 55, padding: '2px 5px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 3 }} />
        <span style={{ fontSize: 11 }}>×</span>
        <input type="number" value={stdH} onChange={e => setStdH(parseInt(e.target.value) || 6000)} style={{ width: 55, padding: '2px 5px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 3 }} />
        <span style={{ fontSize: 11, color: '#64748b' }}>мм ({stdArea} м²)</span>
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
        <button className="btn" onClick={exportExcel} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }}>📥 Excel</button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' }}>
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #9ca3af' }}>
              <DD col="grade" values={uniqueGrades} selected={filterGrade} setter={setFilterGrade} label="Марка" />
              <DD col="thickness" values={uniqueThicknesses} selected={filterThickness} setter={setFilterThickness} label="Толщ." align="center" />
              <th style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, textAlign: 'center', background: '#dbeafe', borderRight: '1px solid #93c5fd', color: '#1e40af' }}>Заказы</th>
              <th style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, textAlign: 'center', background: '#dcfce7', borderRight: '1px solid #86efac', color: '#166534' }}>Склад</th>
              <th style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, textAlign: 'center', background: '#f8fafc', borderRight: '1px solid #d1d5db' }}>Баланс</th>
              <th style={{ width: 20, background: '#f8fafc' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16, color: '#64748b' }}>Нет данных</td></tr>
            ) : filtered.map((row) => {
              const key = `${row.grade}|${row.thickness}`;
              const isOpen = expanded === key;
              const dS = hasCF ? row._ds : row.demand_sheets_std;
              const dA = hasCF ? row._da : row.demand_area;
              const sS = hasCF ? row._ss : row.stock_sheets;
              const sA = hasCF ? row._sa : row.stock_area;
              const bal = hasCF ? row._bal : row.deficit_sheets;

              // Filter detail to selected customers only
              const dCusts = hasCF
                ? Object.entries(row.demand_by_customer || {}).filter(([n]) => filterCustomer.includes(n))
                : Object.entries(row.demand_by_customer || {});
              const sCusts = hasCF
                ? Object.entries(row.stock_by_customer || {}).filter(([n]) => filterCustomer.includes(n))
                : Object.entries(row.stock_by_customer || {});

              return (
                <tr key={key} style={{ borderBottom: isOpen ? 'none' : '1px solid #e5e7eb' }}>
                  <td colSpan={6} style={{ padding: 0 }}>
                    {/* Main row */}
                    <div onClick={() => toggle(key)} style={{ display: 'flex', cursor: 'pointer', background: isOpen ? '#f8fafc' : '#fff', borderBottom: isOpen ? '1px solid #e5e7eb' : 'none' }}>
                      <div style={{ width: '18%', padding: '6px 10px', fontWeight: 600, borderRight: '1px solid #e5e7eb', fontSize: 13 }}>{row.grade || '—'}</div>
                      <div style={{ width: '10%', padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #e5e7eb', fontSize: 13 }}>{row.thickness ? `${row.thickness}мм` : '—'}</div>
                      <div style={{ width: '20%', padding: '6px 10px', textAlign: 'center', background: '#eff6ff', borderRight: '1px solid #bfdbfe', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{dS ? (typeof dS === 'number' ? dS.toFixed(1) : dS) : '0'}</span>
                        <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 3 }}>{(dA / 1000000).toFixed(1)}м²</span>
                      </div>
                      <div style={{ width: '20%', padding: '6px 10px', textAlign: 'center', background: '#f0fdf4', borderRight: '1px solid #bbf7d0', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{sS}</span>
                        <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 3 }}>{(sA / 1000000).toFixed(1)}м²</span>
                      </div>
                      <div style={{ width: '16%', padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                        <span style={{
                          fontWeight: 700, fontSize: 13, padding: '1px 8px', borderRadius: 3, display: 'inline-block', minWidth: 40,
                          background: bal < 0 ? '#fee2e2' : bal === 0 ? '#f1f5f9' : '#dcfce7',
                          color: bal < 0 ? '#dc2626' : bal === 0 ? '#6b7280' : '#166534',
                        }}>
                          {bal > 0 ? '+' : ''}{typeof bal === 'number' ? (bal % 1 === 0 ? bal : bal.toFixed(1)) : bal}
                        </span>
                      </div>
                      <div style={{ width: '16%', padding: '6px 8px', textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</div>
                    </div>
                    {/* Detail row */}
                    {isOpen && (
                      <div style={{ display: 'flex', background: '#fafbfc', borderBottom: '1px solid #e5e7eb', fontSize: 12 }}>
                        {/* Spacer for Марка + Толщ columns */}
                        <div style={{ width: '28%', borderRight: '1px solid #e5e7eb' }}></div>
                        {/* Orders detail — under Заказы column */}
                        <div style={{ width: '20%', padding: '6px 8px', background: '#f0f7ff', borderRight: '1px solid #bfdbfe' }}>
                          <div style={{ fontWeight: 700, marginBottom: 3, color: '#2563eb', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Заказы по клиентам</div>
                          {dCusts.length === 0 ? (
                            <div style={{ color: '#9ca3b8', fontSize: 10, fontStyle: 'italic' }}>Нет активных заказов</div>
                          ) : dCusts.map(([name, v]) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 11, borderBottom: '1px solid #e0edff' }}>
                              <span style={{ color: '#374151' }}>{name}</span>
                              <span style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: 10 }}>{v.sheets_std} л · {(v.area / 1000000).toFixed(1)}м²</span>
                            </div>
                          ))}
                        </div>
                        {/* Stock detail — under Склад column */}
                        <div style={{ width: '20%', padding: '6px 8px', background: '#f0fdf4', borderRight: '1px solid #bbf7d0' }}>
                          <div style={{ fontWeight: 700, marginBottom: 3, color: '#16a34a', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Склад по владельцам</div>
                          {sCusts.length === 0 ? (
                            <div style={{ color: '#9ca3b8', fontSize: 10, fontStyle: 'italic' }}>Нет на складе</div>
                          ) : sCusts.map(([name, v]) => (
                            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 11, borderBottom: '1px solid #dcfce7' }}>
                              <span style={{ color: '#374151' }}>{name}</span>
                              <span style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: 10 }}>{v.sheets} л · {(v.area / 1000000).toFixed(1)}м²</span>
                            </div>
                          ))}
                        </div>
                        {/* Spacer for Баланс + arrow columns */}
                        <div style={{ width: '32%' }}></div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
