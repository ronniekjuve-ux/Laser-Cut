import React, { useState, useEffect, useCallback, useMemo } from 'react';
import client from '../../api/client';
import useIsMobile, { getForceMobile } from '../../hooks/useIsMobile';
import ApplicationDetail from '../Applications/ApplicationDetail';
import MobileOrderCard from '../../components/MobileOrderCard';
import MobileOrderDetail from '../../components/MobileOrderDetail';

export default function CompletedOrdersList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('cut_at');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({});
  const [showFilter, setShowFilter] = useState(null);
  const isMobile = useIsMobile();
  const isRealMobile = isMobile && window.innerWidth <= 768;
  const PAGE_SIZE = 15;

  const fetchCompleted = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/applications/', {
        params: { tab: 'orders', status: 'cut', limit: 500 }
      });
      const items = res.data.items || (Array.isArray(res.data) ? res.data : []);
      setApplications(items);
    } catch (err) {
      console.error('Failed to load completed orders', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompleted(); }, [fetchCompleted]);

  const handleCancelCut = async (e, appId) => {
    e.stopPropagation();
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=approved');
      fetchCompleted();
    } catch {
      alert('Ошибка');
    }
  };

  const filtered = useMemo(() => {
    let list = applications;

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(app =>
        String(app.id).includes(q) ||
        (app.customer || '').toLowerCase().includes(q) ||
        (app.steel_grade || app.material || '').toLowerCase().includes(q) ||
        (app.machine || '').toLowerCase().includes(q)
      );
    }

    // Filters
    if (filters.customer?.length) list = list.filter(app => filters.customer.includes(app.customer));
    if (filters.machine?.length) list = list.filter(app => filters.machine.includes(app.machine));
    if (filters.material?.length) list = list.filter(app => filters.material.includes(app.steel_grade || app.material));
    if (filters.thickness?.length) list = list.filter(app => filters.thickness.includes(String(app.thickness)));

    // Sort
    list = [...list].sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
      if (sortCol === 'id') { va = a.id || 0; vb = b.id || 0; return sortDir === 'asc' ? va - vb : vb - va; }
      if (sortCol === 'thickness') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return sortDir === 'asc' ? va - vb : vb - va; }
      if (sortCol === 'cut_at' || sortCol === 'created_at') {
        va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ru') : vb.localeCompare(va, 'ru');
    });

    return list;
  }, [applications, search, sortCol, sortDir, filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, sortCol, sortDir, filters]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filterVals = (col) => [...new Set(applications.map(app => {
    if (col === 'material') return app.steel_grade || app.material || '-';
    return String(app[col] || '-');
  }))];

  const toggleFilter = (col, val) => {
    setFilters(prev => {
      const current = prev[col] || [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [col]: next.length > 0 ? next : undefined };
    });
  };

  const TH = ({ col, label }) => (
    <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'relative' }}>
      <span>{label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '▾'}</span>
      {showFilter === col && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 140, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
          {filterVals(col).map(v => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 3, background: (filters[col] || []).includes(v) ? '#eff6ff' : 'transparent' }}>
              <input type="checkbox" checked={(filters[col] || []).includes(v)} onChange={() => toggleFilter(col, v)} style={{ margin: 0 }} />
              {v}
            </label>
          ))}
        </div>
      )}
    </th>
  );

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>Выполнено: {filtered.length} заказов</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по №, заказчику, материалу..."
          style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, width: 220 }}
        />
      </div>

      {isRealMobile ? (
        <div className="order-cards">
          {filtered.map(app => (
            <div key={app.id} style={{ position: 'relative' }}>
              <MobileOrderCard app={app} />
              <button
                className="btn"
                onClick={(e) => handleCancelCut(e, app.id)}
                title="Вернуть в заказы"
                style={{
                  position: 'absolute', top: 8, right: 8, padding: '4px 8px', fontSize: 11,
                  background: '#fff', zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              >
                ↩️
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет выполненных заказов</div>
          )}
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <TH col="id" label="№" />
                  <TH col="customer" label="Заказчик" />
                  <TH col="machine" label="Станок" />
                  <TH col="material" label="Материал" />
                  <TH col="thickness" label="Толщ." />
                  <th>Поступил</th>
                  <TH col="cut_at" label="Выполнена" />
                  <th>Оператор</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paged.map(app => {
                  const hasUnbound = (app.layouts || []).some(l => {
                    const runs = Array.isArray(l.completed_runs) ? l.completed_runs : [];
                    const bindings = l.warehouse_bindings || {};
                    const total = l.sheet_count || 1;
                    return Array.from({length: total}, (_, i) => runs[i] && bindings[i] == null).some(Boolean);
                  });
                  return (
                  <tr key={app.id} onClick={() => setSelectedApp(app)} style={{
                    cursor: 'pointer',
                    opacity: 0.7,
                    background: hasUnbound ? '#fef2f2' : undefined,
                    borderLeft: hasUnbound ? '3px solid #ef4444' : undefined,
                  }}>
                    <td style={{ fontWeight: 600, color: '#64748b' }}>#{app.id}</td>
                    <td>{app.customer}</td>
                    <td>{app.machine}</td>
                    <td>{app.steel_grade || app.material}</td>
                    <td>{app.thickness}</td>
                    <td>{app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : ''}</td>
                    <td>{app.cut_at ? new Date(app.cut_at).toLocaleDateString('ru-RU') : ''}</td>
                    <td>{app.cut_by || ''}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={(e) => handleCancelCut(e, app.id)}
                        title="Вернуть в заказы"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                      >
                        ↩️
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                      Нет выполненных заказов
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
              <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: 12 }}>«</button>
              <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ fontSize: 12 }}>‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button key={p} className={'btn' + (p === page ? ' btn-primary' : '')}
                    onClick={() => setPage(p)}
                    style={{ fontSize: 12 }}>{p}</button>
                );
              })}
              <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ fontSize: 12 }}>›</button>
              <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ fontSize: 12 }}>»</button>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{filtered.length} заказов | Стр. {page}/{totalPages}</span>
            </div>
          )}
        </>
      )}

      {selectedApp && (
        isRealMobile ? (
          <MobileOrderDetail
            app={selectedApp}
            onClose={() => setSelectedApp(null)}
            onUpdate={() => fetchCompleted()}
          />
        ) : (
          <ApplicationDetail
            app={selectedApp}
            onClose={() => setSelectedApp(null)}
            onUpdate={() => fetchCompleted()}
          />
        )
      )}
    </div>
  );
}
