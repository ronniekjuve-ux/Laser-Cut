import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import ApplicationDetail from './ApplicationDetail';
import NewOrderModal from './NewOrderModal';

const COLUMNS = [
  { key: 'customer', label: 'Заказчик', sortable: true, filterable: true },
  { key: 'machine', label: 'Станок', sortable: true, filterable: true },
  { key: 'material', label: 'Материал', sortable: true, filterable: true },
  { key: 'thickness', label: 'Толщ.', sortable: true, filterable: true },
  { key: 'status', label: 'Статус', sortable: true, filterable: true },
  { key: 'operator', label: 'Оператор', sortable: true, filterable: true },
  { key: 'received', label: 'Поступил', sortable: true, filterable: false },
  { key: 'completed', label: 'Вып.', sortable: true, filterable: false },
  { key: 'notes', label: 'Заметки', sortable: false, filterable: false, type: 'notes' },
  { key: 'actions', label: '', sortable: false, filterable: false },
];

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function ApplicationsList() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [notesModal, setNotesModal] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const filterRef = useRef(null);
  const navigate = useNavigate();

  const fetchApplications = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/applications/');
      setApplications(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) {
      console.error('Failed to load applications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  useEffect(() => {
    const handleClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target) && !e.target.closest('.filter-icon')) {
        setOpenFilter(null);
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
    status: app.status || '',
    operator: app.operator || '',
    received: app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '',
    completed: app.completed_at ? new Date(app.completed_at).toLocaleDateString('ru-RU') : '',
    notes: app.comments || '',
  });

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

  const filtered = applications.filter(app => {
    const rd = getRowData(app);
    for (const [key, values] of Object.entries(filters)) {
      if (values && values.length > 0) {
        const val = String(rd[key] || '').trim();
        if (!values.includes(val)) return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      const allText = Object.values(rd).join(' ').toLowerCase();
      if (!allText.includes(q)) return false;
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
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), 'ru');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

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
                      onClick={(e) => { e.stopPropagation(); setOpenFilter(openFilter === col.key ? null : col.key); setFilterSearch(''); }}
                      style={{marginLeft: 5, cursor: 'pointer', fontSize: 12}}
                    >
                      {'\u25bc'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(app => (
              <tr key={app.id} onClick={() => setSelectedApp(app)} style={{cursor: 'pointer'}}>
                {COLUMNS.map(col => (
                  <td key={col.key}>
                    {col.key === 'status' ? (
                      <span className={'badge ' + (
                        (app.status || '').toLowerCase() === '\u0433\u043e\u0442\u043e\u0432\u043e' ? 'bg-done' :
                        (app.status || '').toLowerCase() === '\u0432 \u0440\u0435\u0437\u043a\u0435' ? 'bg-work' : 'bg-queue'
                      )}>
                        {app.status || '\u0412 \u043e\u0447\u0435\u0440\u0435\u0434\u0438'}
                      </span>
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
                      getRowData(app)[col.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  {'\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}