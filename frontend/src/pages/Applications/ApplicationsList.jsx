import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ApplicationDetail from './ApplicationDetail';
import NewOrderModal from './NewOrderModal';

const COLUMNS = [
  { key: 'customer', label: 'Заказчик', sortable: true, filterable: true },
  { key: 'machine', label: 'Станок', sortable: true, filterable: true },
  { key: 'material', label: 'Материал', sortable: true, filterable: true },
  { key: 'thickness', label: 'Толщ.', sortable: true, filterable: true },
  { key: 'supply_material', label: 'Дав. мат', sortable: true, filterable: true },
  { key: 'priority', label: 'Приоритет', sortable: true, filterable: true },
  { key: 'status', label: 'Статус', sortable: true, filterable: true },
  { key: 'received', label: 'Поступил', sortable: true, filterable: false },
  { key: 'notes', label: 'Заметки', sortable: false, filterable: false, type: 'notes' },
  { key: 'actions', label: '', sortable: false, filterable: false },
];

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function ApplicationsList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [filterPos, setFilterPos] = useState({top: 0, left: 0});
  const [selectedApp, setSelectedApp] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [notesModal, setNotesModal] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const filterRef = useRef(null);
  const navigate = useNavigate();

  // Подсветка заявки из уведомления
  useEffect(() => {
    if (highlightId && applications.length > 0) {
      // Очищаем параметр через 3 секунды
      const timer = setTimeout(() => setSearchParams({}), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, applications]);

  const fetchApplications = useCallback(async (searchQuery, pageNum = page) => {
    try {
      const params = { page: pageNum, limit: 50 };
      if (searchQuery) params.search = searchQuery;
      const res = await client.get('/api/v1/applications/', { params });
      if (res.data.items) {
        setApplications(res.data.items);
        setTotal(res.data.total);
        setTotalPages(res.data.pages);
      } else {
        setApplications(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load applications', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Debounced поиск по backend
  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      fetchApplications(search || undefined, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handleClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target) && !e.target.closest('.filter-icon')) {
        setOpenFilter(null);
      }
      if (!e.target.closest('[id^="supply-dropdown-"]') && !e.target.closest('button')) {
        document.querySelectorAll('[id^="supply-dropdown-"]').forEach(el => el.style.display = 'none');
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const getRowData = (app) => ({
    customer: app.customer || '',
    machine: app.machine || '',
    material: app.steel_grade || app.material || '',
    thickness: app.thickness || '',
    supply_material: app.supply_material === true ? 'Да' : app.supply_material === false ? 'Нет' : '',
    priority: app.priority || 'medium',
    status: app.status || 'pending',
    operator: app.operator || '',
    received: app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '',
    completed: app.completed_at ? new Date(app.completed_at).toLocaleDateString('ru-RU') : '',
    notes: app.comments || '',
  });

  const FILTER_LABELS = {
    priority: { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочно' },
    status: { pending: 'В очереди', in_progress: 'В работе', partially_cut: 'Частично', cut: 'Вырезано' },
    supply_material: { 'Да': 'Да', 'Нет': 'Нет' },
  };

  const getFilterValues = (colKey) => {
    const vals = new Set();
    applications.forEach(app => {
      const rd = getRowData(app);
      if (rd[colKey]) vals.add(String(rd[colKey]).trim());
    });
    return [...vals].sort();
  };

  const handleSort = (colKey) => {
    const col = COLUMNS.find(c => c.key === colKey);
    if (!col || !col.sortable) return;
    if (sortCol === colKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colKey);
      setSortDir('asc');
    }
  };

  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const str = String(text);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return str;
    return (
      <>
        {str.slice(0, idx)}
        <mark style={{background: '#fde047', padding: '0 2px', borderRadius: 2}}>{str.slice(idx, idx + query.length)}</mark>
        {str.slice(idx + query.length)}
      </>
    );
  };

  const filtered = applications.filter(app => {
    const rd = getRowData(app);
    for (const [key, values] of Object.entries(filters)) {
      if (values && values.length > 0) {
        const val = String(rd[key] || '').trim();
        if (!values.includes(val)) return false;
      }
    }
    return true;
  }).sort((a, b) => {
    if (!sortCol) return 0;
    const ra = getRowData(a);
    const rb = getRowData(b);
    let va = ra[sortCol] || '';
    let vb = rb[sortCol] || '';
    if (sortCol === 'thickness') {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
    }
    if (sortCol === 'priority') {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      va = order[va] !== undefined ? order[va] : 4;
      vb = order[vb] !== undefined ? order[vb] : 4;
    }
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), 'ru');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const activeApps = filtered.filter(app => app.status !== 'cut');
  const completedApps = filtered.filter(app => app.status === 'cut');

  const toggleFilterItem = (colKey, val) => {
    setFilters(prev => {
      const current = prev[colKey] || [];
      const next = current.includes(val)
        ? current.filter(v => v !== val)
        : [...current, val];
      return { ...prev, [colKey]: next.length > 0 ? next : null };
    });
  };

  const clearFilter = (colKey) => {
    setFilters(prev => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
    setOpenFilter(null);
  };

  const activeFilterEntries = Object.entries(filters).filter(([, v]) => v && v.length > 0);

  const handleDelete = async (e, appId) => {
    e.stopPropagation();
    if (!window.confirm('Удалить заявку?')) return;
    try {
      await client.delete('/api/v1/applications/' + appId);
      fetchApplications();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleEdit = (e, app) => {
    e.stopPropagation();
    setSelectedApp(app);
  };

  const handleCancelCut = async (e, appId) => {
    e.stopPropagation();
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=pending');
      fetchApplications(search || undefined);
    } catch (err) {
      alert('Ошибка');
    }
  };

  if (loading) return <div className="loading">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>;

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          placeholder={'\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0447\u0438\u043a\u0443, \u0441\u0442\u0430\u043b\u0438, \u0434\u0435\u0442\u0430\u043b\u044f\u043c...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => setShowNewOrder(true)}>
          + {'\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430'}
        </button>
        <span style={{marginLeft: 'auto', fontSize: 13, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center'}}>
          Всего: {total} заявок | Стр. {page} из {totalPages || 1}
          <button className="btn" onClick={async () => {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/applications/export', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'applications.xlsx';
            a.click();
            URL.revokeObjectURL(url);
          }} style={{fontSize: 12}}>
            📥 Excel
          </button>
        </span>
      </div>

      {activeFilterEntries.length > 0 && (
        <div className="active-filters-bar">
          {activeFilterEntries.map(([key, values]) =>
            values.map(val => (
              <div key={key + val} className="filter-badge">
                {key}: {val}
                <span className="remove" onClick={() => toggleFilterItem(key, val)}>{'\u2715'}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && (
                    <span className="sort-indicator">
                      {sortCol === col.key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u21c5'}
                    </span>
                  )}
                  {col.filterable && (
                    <span
                      className="filter-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openFilter === col.key) { setOpenFilter(null); return; }
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFilterPos({top: rect.bottom + 4, left: rect.left});
                        setOpenFilter(col.key);
                        setFilterSearch('');
                      }}
                      style={{marginLeft: 5, cursor: 'pointer', fontSize: 12, position: 'relative'}}
                    >
                      {'\u25bc'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeApps.map(app => (
              <React.Fragment key={app.id}>
              <tr onClick={() => setSelectedApp(app)} style={{
                cursor: 'pointer',
                background: highlightId && app.id === parseInt(highlightId) ? '#fef08a' : undefined
              }}>
                {COLUMNS.map(col => (
                  <td key={col.key}>
                    {col.key === 'status' ? (
                      <span className={'badge ' + (
                        app.status === 'cut' ? 'bg-done' :
                        app.status === 'in_progress' || app.status === 'partially_cut' ? 'bg-work' : 'bg-queue'
                      )}>
                        {app.status === 'cut' ? 'Вырезано' :
                         app.status === 'in_progress' ? 'В работе' :
                         app.status === 'partially_cut' ? 'Частично' : 'В очереди'}
                      </span>
                    ) : col.key === 'supply_material' ? (
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const openId = 'supply-dropdown-' + app.id;
                            const el = document.getElementById(openId);
                            if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
                          }}
                          style={{
                            cursor: 'pointer', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)',
                            background: app.supply_material === true ? '#d1fae5' : app.supply_material === false ? '#fee2e2' : '#f1f5f9',
                            color: app.supply_material === true ? '#047857' : app.supply_material === false ? '#b91c1c' : '#94a3b8',
                          }}
                        >
                          {app.supply_material === true ? 'Да' : app.supply_material === false ? 'Нет' : '—'} ▾
                        </button>
                        <div
                          id={'supply-dropdown-' + app.id}
                          style={{
                            display: 'none', position: 'absolute', top: '100%', left: 0, zIndex: 100,
                            background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 80,
                          }}
                        >
                          {[
                            { val: true, label: 'Да', bg: '#d1fae5', color: '#047857' },
                            { val: false, label: 'Нет', bg: '#fee2e2', color: '#b91c1c' },
                            { val: null, label: '—', bg: '#f1f5f9', color: '#94a3b8' },
                          ].map(opt => (
                            <div
                              key={opt.label}
                              onClick={(e) => {
                                e.stopPropagation();
                                const val = opt.val === true ? 'true' : opt.val === false ? 'false' : '';
                                client.patch('/api/v1/applications/' + app.id + '/supply_material?value=' + val)
                                  .then(() => fetchApplications(search || undefined));
                                document.getElementById('supply-dropdown-' + app.id).style.display = 'none';
                              }}
                              style={{
                                padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                                background: app.supply_material === opt.val ? opt.bg : '#fff',
                                color: app.supply_material === opt.val ? opt.color : '#334155',
                                fontWeight: app.supply_material === opt.val ? 600 : 400,
                              }}
                            >
                              {opt.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : col.key === 'priority' ? (
                      (user?.role === 'admin' || user?.role === 'director') ? (
                        <select
                          value={app.priority || 'medium'}
                          onChange={(e) => {
                            e.stopPropagation();
                            client.patch('/api/v1/applications/' + app.id + '/priority?priority=' + e.target.value)
                              .then(() => fetchApplications(search || undefined));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: 12, padding: '2px 4px', borderRadius: 4
                          }}
                        >
                          <option value="low">🟢 Низкий</option>
                          <option value="medium">🔵 Средний</option>
                          <option value="high">🟠 Высокий</option>
                          <option value="urgent">🔴 Срочно</option>
                        </select>
                      ) : (
                        <span>
                          {({low: '🟢 Низкий', medium: '🔵 Средний', high: '🟠 Высокий', urgent: '🔴 Срочно'})[app.priority] || '🔵 Средний'}
                        </span>
                      )
                    ) : col.key === 'notes' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setNotesModal(app); }}
                        style={{
                          background: app.comments ? '#eff6ff' : '#f8fafc',
                          border: '1px solid ' + (app.comments ? '#bfdbfe' : 'var(--border)'),
                          borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer',
                          color: app.comments ? '#1e40af' : '#94a3b8', maxWidth: 120,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'block', textAlign: 'left'
                        }}
                        title={app.comments || 'Добавить заметку'}
                      >
                        {app.comments || '📝'}
                      </button>
                    ) : col.key === 'actions' ? (
                      <div style={{display: 'flex', gap: 4}}>
                        <button className="btn" onClick={(e) => handleEdit(e, app)} title="Редактировать" style={{padding: '4px 8px', fontSize: 11}}>✏️</button>
                        <button className="btn btn-danger" onClick={(e) => handleDelete(e, app.id)} title="Удалить" style={{padding: '4px 8px', fontSize: 11}}>🗑️</button>
                      </div>
                    ) : (
                      highlightText(getRowData(app)[col.key], search)
                    )}
                  </td>
                ))}
              </tr>
              {search && app.matched_parts && app.matched_parts.length > 0 && (
                <tr style={{background: '#fefce8'}}>
                  <td colSpan={COLUMNS.length} style={{padding: '4px 10px', fontSize: 12}}>
                    {'\uD83D\uDD0D '}Совпадения:{' '}
                    {app.matched_parts.map((p, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <span
                          onClick={(e) => { e.stopPropagation(); setSelectedApp({...app, highlightPart: p}); }}
                          style={{background: '#fde047', padding: '1px 4px', borderRadius: 3, fontWeight: 500, cursor: 'pointer'}}
                        >
                          {p}
                        </span>
                      </span>
                    ))}
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {activeApps.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  {'\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0437\u0430\u044f\u0432\u043e\u043a'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {completedApps.length > 0 && (
        <div style={{marginTop: 20}}>
          <h4 style={{margin: '0 0 8px 0', fontSize: 14, color: '#64748b'}}>{'\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u044b\u0435 \u0437\u0430\u044f\u0432\u043a\u0438'}</h4>
          <div className="table-container" style={{maxHeight: 150, overflowY: 'auto'}}>
            <table>
              <thead style={{position: 'sticky', top: 0, zIndex: 1}}>
                <tr>
                  <th>Заказчик</th>
                  <th>Станок</th>
                  <th>Материал</th>
                  <th>Толщ.</th>
                  <th>Дав. мат</th>
                  <th>Поступил</th>
                  <th>Выполнена</th>
                  <th>Оператор</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {completedApps.map(app => (
                  <tr key={app.id} onClick={() => setSelectedApp(app)} style={{cursor: 'pointer', opacity: 0.7}}>
                    <td>{app.customer}</td>
                    <td>{app.machine}</td>
                    <td>{app.steel_grade || app.material}</td>
                    <td>{app.thickness}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: app.supply_material === true ? '#d1fae5' : app.supply_material === false ? '#fee2e2' : '#f1f5f9',
                        color: app.supply_material === true ? '#047857' : app.supply_material === false ? '#b91c1c' : '#94a3b8',
                      }}>
                        {app.supply_material === true ? 'Да' : app.supply_material === false ? 'Нет' : '—'}
                      </span>
                    </td>
                    <td>{app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : ''}</td>
                    <td>{app.cut_at ? new Date(app.cut_at).toLocaleDateString('ru-RU') : ''}</td>
                    <td>{app.cut_by || ''}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={(e) => handleCancelCut(e, app.id)}
                        title="Отменить вырезание"
                        style={{padding: '3px 8px', fontSize: 11}}
                      >
                        ↩️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center'}}>
          <button className="btn" onClick={() => { setPage(1); fetchApplications(search, 1); }} disabled={page <= 1} style={{fontSize: 12}}>
            «
          </button>
          <button className="btn" onClick={() => { const p = page - 1; setPage(p); fetchApplications(search, p); }} disabled={page <= 1} style={{fontSize: 12}}>
            ‹
          </button>
          {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button key={p} className={`btn ${p === page ? 'btn-primary' : ''}`}
                onClick={() => { setPage(p); fetchApplications(search, p); }}
                style={{fontSize: 12, minWidth: 32}}>
                {p}
              </button>
            );
          })}
          <button className="btn" onClick={() => { const p = page + 1; setPage(p); fetchApplications(search, p); }} disabled={page >= totalPages} style={{fontSize: 12}}>
            ›
          </button>
          <button className="btn" onClick={() => { setPage(totalPages); fetchApplications(search, totalPages); }} disabled={page >= totalPages} style={{fontSize: 12}}>
            »
          </button>
        </div>
      )}

      {selectedApp && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={fetchApplications}
        />
      )}

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); fetchApplications(); }}
        />
      )}

      {notesModal && (
        <div className="modal-overlay active" onClick={() => setNotesModal(null)}>
          <div className="modal-content" style={{width: 500}} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Заметка — {notesModal.order_name || notesModal.id}</h3>
              <button className="close-btn" onClick={() => setNotesModal(null)}>{'\u2715'}</button>
            </div>
            <div className="modal-body">
              <div style={{whiteSpace: 'pre-wrap', lineHeight: 1.6}}>{notesModal.comments}</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setNotesModal(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {openFilter && (
        <div
          ref={filterRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 1000,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: 8, minWidth: 160, maxHeight: 250, overflow: 'auto'
          }}
        >
          <input
            type="text"
            placeholder="Фильтр..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            style={{width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box'}}
            autoFocus
          />
          {getFilterValues(openFilter)
            .filter(v => !filterSearch || v.toLowerCase().includes(filterSearch.toLowerCase()))
            .map(val => (
              <label key={val} style={{display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12, cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  checked={(filters[openFilter] || []).includes(val)}
                  onChange={() => toggleFilterItem(openFilter, val)}
                />
                {(FILTER_LABELS[openFilter] && FILTER_LABELS[openFilter][val]) || val || '(пусто)'}
              </label>
            ))
          }
          {(filters[openFilter] || []).length > 0 && (
            <div style={{borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4}}>
              <span onClick={() => clearFilter(openFilter)} style={{fontSize: 11, color: '#ef4444', cursor: 'pointer'}}>
                Сбросить
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}