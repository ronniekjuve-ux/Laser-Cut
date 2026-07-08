import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import useIsMobile, { getForceMobile } from '../../hooks/useIsMobile';
import ApplicationDetail from '../Applications/ApplicationDetail';
import MobileOrderCard from '../../components/MobileOrderCard';
import NewOrderModal from '../Applications/NewOrderModal';
import MergeModal from '../Applications/MergeModal';
import ConfirmModal from '../../components/ConfirmModal';
import GroupDetail from '../../components/GroupDetail';
import CreateGroupModal from '../../components/CreateGroupModal';
import EditModal from '../Applications/EditModal';
import ReuploadModal from '../Applications/ReuploadModal';

function NotesModal({ app, onClose, onSaved }) {
  const [text, setText] = useState(app.comments || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await client.patch('/api/v1/applications/' + app.id + '/comments?comments=' + encodeURIComponent(text));
      onSaved();
    } catch (err) {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>Заметки — {app.order_name}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Введите заметку..."
            style={{ width: '100%', minHeight: 100, padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button className="btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: 'checkbox', label: '', sortable: false, filterable: false },
  { key: 'number', label: '№', sortable: true, filterable: false },
  { key: 'customer', label: 'Заказчик', sortable: true, filterable: true },
  { key: 'group', label: 'Группа', sortable: true, filterable: true },
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

export default function OrdersList({ initialTab }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('priority');
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [filterPos, setFilterPos] = useState({ top: 0, left: 0 });
  const [selectedApp, setSelectedApp] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [notesModal, setNotesModal] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusDropdown, setStatusDropdown] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [groupDetailId, setGroupDetailId] = useState(null);
  const [selectedApps, setSelectedApps] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [reuploadModal, setReuploadModal] = useState(null);
  const [filterValues, setFilterValues] = useState({});
  const filterRef = useRef(null);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(initialTab || 'orders');
  const [machineFilter, setMachineFilter] = useState(null);
  const PAGE_SIZE = 15;

  const fetchOrders = useCallback(async (searchQuery) => {
    try {
      const tabParam = activeTab === 'applications' ? 'applications' : 'orders';
      const params = { tab: tabParam, limit: 1000 };
      if (activeTab === 'completed') params.status = 'cut';
      if (filters.customer) params.customer_name = filters.customer[0];
      if (filters.machine) params.machine = filters.machine[0];
      if (filters.material) params.material = filters.material[0];
      if (filters.thickness) params.thickness = filters.thickness[0];
      if (filters.supply_material) params.supply_material = filters.supply_material[0] === 'Да' ? 'true' : 'false';
      if (filters.priority) params.priority = filters.priority[0];
      if (machineFilter) params.machine = machineFilter;
      const res = await client.get('/api/v1/applications/', { params });
      if (res.data.items) {
        setAllOrders(res.data.items);
        if (res.data.filter_values) setFilterValues(res.data.filter_values);
      } else {
        setAllOrders(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  }, [filters, activeTab, machineFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
    fetchOrders();
  }, [activeTab, machineFilter]);

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters]);

  useEffect(() => {
    const handleClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target) && !e.target.closest('.filter-icon') && !e.target.closest('.filter-chip')) {
        setOpenFilter(null);
      }
      if (!e.target.closest('[id^="supply-dropdown-"]') && !e.target.closest('button')) {
        document.querySelectorAll('[id^="supply-dropdown-"]').forEach(el => el.style.display = 'none');
      }
      if (!e.target.closest('.badge') && !e.target.closest('[style*="position: absolute"]')) {
        setStatusDropdown(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const getRowData = (app) => ({
    number: app.id || '',
    customer: app.customer || '',
    group: app.group_name || '',
    machine: app.machine || '',
    material: app.steel_grade || app.material || '',
    thickness: app.thickness || '',
    supply_material: app.supply_material === true ? 'Да' : app.supply_material === false ? 'Нет' : '',
    priority: app.priority || 'medium',
    status: app.status || 'approved',
    received: app.created_at ? new Date(app.created_at).toLocaleDateString('ru-RU') : '',
    notes: app.comments || '',
  });

  const FILTER_LABELS = {
    priority: { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочно' },
    status: { approved: 'В очереди', in_progress: 'В резке', partially_cut: 'Частично вырезано', cut: 'Вырезано' },
    supply_material: { 'Да': 'Да', 'Нет': 'Нет' },
  };

  const getFilterValues = (colKey) => {
    if (filterValues[colKey]) return filterValues[colKey];
    const vals = new Set();
    allOrders.forEach(app => {
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
        <mark style={{ background: '#fde047', padding: '0 2px', borderRadius: 2 }}>{str.slice(idx, idx + query.length)}</mark>
        {str.slice(idx + query.length)}
      </>
    );
  };

  const filtered = allOrders.filter(app => {
    if (!search) return true;
    const q = search.toLowerCase();
    const rd = getRowData(app);
    return (
      String(rd.customer).toLowerCase().includes(q) ||
      String(rd.number).includes(q) ||
      String(app.order_name || '').toLowerCase().includes(q) ||
      String(rd.material).toLowerCase().includes(q) ||
      String(rd.notes).toLowerCase().includes(q) ||
      String(rd.group).toLowerCase().includes(q)
    );
  }).sort((a, b) => {
    const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
    const getPriorityVal = (app) => {
      const p = getRowData(app).priority;
      return PRIORITY_ORDER[p] !== undefined ? PRIORITY_ORDER[p] : 4;
    };

    if (sortCol === 'priority') {
      const pa = getPriorityVal(a);
      const pb = getPriorityVal(b);
      return sortDir === 'asc' ? pa - pb : pb - pa;
    }

    const pa = getPriorityVal(a);
    const pb = getPriorityVal(b);
    if (pa !== pb) return pa - pb;

    if (!sortCol) return 0;
    const ra = getRowData(a);
    const rb = getRowData(b);
    let va = ra[sortCol] || '';
    let vb = rb[sortCol] || '';
    if (sortCol === 'thickness') {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
    }
    if (sortCol === 'number') {
      va = parseInt(va) || 0;
      vb = parseInt(vb) || 0;
    }
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), 'ru');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const activeApps = activeTab === 'completed' ? filtered : filtered.filter(app => app.status !== 'cut');

  const totalPages = Math.ceil(activeApps.length / PAGE_SIZE);
  const pageItems = activeApps.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    setConfirmDelete(appId);
  };

  const confirmDeleteAction = async () => {
    const appId = confirmDelete;
    setConfirmDelete(null);
    try {
      await client.delete('/api/v1/applications/' + appId);
      fetchOrders();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const handleEdit = (e, app) => {
    e.stopPropagation();
    setEditModal(app);
  };

  const handleCancelCut = async (e, appId) => {
    e.stopPropagation();
    try {
      await client.patch('/api/v1/applications/' + appId + '/status?status=approved');
      fetchOrders();
    } catch (err) {
      alert('Ошибка');
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div className="toolbar">
        {(user?.role === 'admin' || user?.role === 'director') && (
          <button className="btn btn-primary" onClick={() => setShowNewOrder(true)}>
            + Новый заказ
          </button>
        )}
        {(user?.role === 'admin' || user?.role === 'director') && (
          <button className="btn" onClick={() => setShowMerge(true)} style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047' }}>
            🔗 Слияние
          </button>
        )}
        {(user?.role === 'admin' || user?.role === 'director') && selectedApps.length >= 2 && (
          <button className="btn" onClick={() => setShowCreateGroup(true)} style={{ background: '#ede9fe', color: '#7c3aed', border: '1px solid #c4b5fd' }}>
            📁 Создать группу ({selectedApps.length})
          </button>
        )}
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' }}>
          Всего: {activeApps.length} заказов | Стр. {page} из {totalPages || 1}
          <button className="btn" onClick={async () => {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/applications/export?tab=orders', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'orders.xlsx';
            a.click();
            URL.revokeObjectURL(url);
          }} style={{ fontSize: 12 }}>
            📥 Excel
          </button>
        </span>
      </div>

      {activeFilterEntries.length > 0 && (
        <div className="active-filters-bar">
          {activeFilterEntries.map(([key, values]) =>
            values.map(val => (
              <div key={key + val} className="filter-badge">
                {FILTER_LABELS[key]?.[val] || val}
                <span className="remove" onClick={() => toggleFilterItem(key, val)}>✕</span>
              </div>
            ))
          )}
        </div>
      )}

      {isMobile && (<div style={{ marginBottom: 12 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 10 }}>
            {(user?.role === 'operator' ? [
              { key: 'orders', label: 'Заказы' },
              { key: 'completed', label: 'Выполненные' },
            ] : [
              { key: 'applications', label: 'Заявки' },
              { key: 'orders', label: 'Заказы' },
              { key: 'completed', label: 'Выполненные' },
            ]).map(tab => (
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

          {/* Machine toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[null, 'CNF', 'FNF'].map(machine => (
              <div
                key={machine || 'all'}
                onClick={() => setMachineFilter(machine)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: machineFilter === machine ? 'var(--primary)' : '#f1f5f9',
                  color: machineFilter === machine ? '#fff' : '#64748b',
                  border: '1px solid ' + (machineFilter === machine ? 'var(--primary)' : 'var(--border)'),
                }}
              >
                {machine === 'CNF' ? 'станок 1' : machine === 'FNF' ? 'станок 2' : 'Все'}
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'customer', label: 'Заказчик' },
              { key: 'material', label: 'Материал' },
              { key: 'thickness', label: 'Толщина' },
              { key: 'priority', label: 'Срочность' },
            ].map(chip => (
              <div
                key={chip.key}
                className="filter-chip"
                onClick={(e) => {
                  if (filters[chip.key]) {
                    clearFilter(chip.key);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setFilterPos({ top: rect.bottom + 4, left: rect.left });
                  if (openFilter === chip.key) {
                    setOpenFilter(null);
                  } else {
                    setOpenFilter(chip.key);
                    setFilterSearch('');
                  }
                }}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                  background: filters[chip.key] ? '#dbeafe' : '#f1f5f9',
                  color: filters[chip.key] ? '#1d4ed8' : '#64748b',
                  border: '1px solid ' + (filters[chip.key] ? '#93c5fd' : 'var(--border)'),
                }}
              >
                {chip.label} {filters[chip.key] ? '✕' : '▾'}
              </div>
            ))}
          </div>
        </div>
      )}

      {isMobile ? (
        <div className="order-cards">
          {pageItems.map(app => (
            <MobileOrderCard
              key={app.id}
              app={app}
            />
          ))}
          {pageItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет активных заказов</div>
          )}
        </div>
      ) : (
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
                        {sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ⇅'}
                      </span>
                    )}
                    {col.filterable && (
                      <span
                        className="filter-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openFilter === col.key) { setOpenFilter(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setFilterPos({ top: rect.bottom + 4, left: rect.left });
                          setOpenFilter(col.key);
                          setFilterSearch('');
                        }}
                        style={{ marginLeft: 5, cursor: 'pointer', fontSize: 12, position: 'relative' }}
                      >
                        ▼
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(app => (
                <React.Fragment key={app.id}>
                  <tr onClick={() => setSelectedApp(app)} style={{
                    cursor: 'pointer',
                    background: highlightId && app.id === parseInt(highlightId) ? '#fef08a' : app.is_replaced ? '#f9fafb' : app.has_merged ? '#fde68a' : undefined,
                    opacity: app.is_replaced ? 0.5 : 1,
                  }}>
                    {COLUMNS.map(col => (
                      <td key={col.key}>
                        {col.key === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={selectedApps.includes(app.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedApps(prev =>
                                prev.includes(app.id)
                                  ? prev.filter(id => id !== app.id)
                                  : [...prev, app.id]
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : col.key === 'number' ? (
                          <span style={{fontWeight: 600, color: '#64748b'}}>
                            #{app.id}
                            {app.has_merged && (
                              <span title="Содержит слияние" style={{
                                marginLeft: 4, fontSize: 10, padding: '1px 4px', borderRadius: 3,
                                background: '#fef9c3', color: '#854d0e', fontWeight: 600, verticalAlign: 'middle'
                              }}>
                                { '\u{1F517}' }
                              </span>
                            )}
                          </span>
                        ) : col.key === 'group' ? (
                          app.group_name ? (
                            <span
                              onClick={(e) => { e.stopPropagation(); setGroupDetailId(app.group_id); }}
                              style={{
                                background: '#ede9fe', color: '#7c3aed', padding: '2px 6px', borderRadius: 4,
                                fontSize: 11, fontWeight: 600, cursor: 'pointer'
                              }}
                              title="Открыть группу"
                            >
                              {app.group_name}
                            </span>
                          ) : (
                            <span style={{color: '#cbd5e1', fontSize: 11}}>—</span>
                          )
                        ) : col.key === 'status' ? (
                            (user?.role === 'admin' || user?.role === 'operator') ? (
                              <div style={{ position: 'relative' }}>
                                <span
                                  className={'badge ' + (
                                    app.status === 'cut' ? 'bg-done' :
                                    app.status === 'in_progress' || app.status === 'partially_cut' ? 'bg-work' : 'bg-approved'
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStatusDropdown(statusDropdown === app.id ? null : app.id);
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {app.status === 'cut' ? 'Вырезано' :
                                   app.status === 'in_progress' ? 'В резке' :
                                   app.status === 'partially_cut' ? 'Частично вырезано' : 'В очереди'} ▾
                                </span>
                                {statusDropdown === app.id && (
                                  <div
                                    style={{
                                      position: 'absolute', top: '100%', left: 0, zIndex: 9999,
                                      background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 160, marginTop: 4,
                                    }}
                                  >
                                    {[
                                      { key: 'approved', label: 'В очереди', bg: '#f0fdf4', color: '#15803d' },
                                      { key: 'in_progress', label: 'В резке', bg: '#dbeafe', color: '#1d4ed8' },
                                      { key: 'partially_cut', label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
                                      { key: 'cut', label: 'Вырезано', bg: '#dcfce7', color: '#166534' },
                                    ].map(s => (
                                      <div
                                        key={s.key}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          client.patch('/api/v1/applications/' + app.id + '/status?status=' + s.key)
                                            .then(() => { setStatusDropdown(null); fetchOrders(); });
                                        }}
                                        style={{
                                          padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                                          background: app.status === s.key ? s.bg : '#fff',
                                          color: app.status === s.key ? s.color : '#334155',
                                          fontWeight: app.status === s.key ? 600 : 400,
                                        }}
                                      >
                                        {s.label}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className={'badge ' + (
                                app.status === 'cut' ? 'bg-done' :
                                app.status === 'in_progress' || app.status === 'partially_cut' ? 'bg-work' : 'bg-approved'
                              )}>
                                {app.status === 'cut' ? 'Вырезано' :
                                 app.status === 'in_progress' ? 'В резке' :
                                 app.status === 'partially_cut' ? 'Частично вырезано' : 'В очереди'}
                              </span>
                            )
                          ) : col.key === 'supply_material' ? (
                            <div style={{ position: 'relative' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const openId = 'supply-dropdown-' + app.id;
                                  const el = document.getElementById(openId);
                                  if (el) {
                                    if (el.style.display === 'block') {
                                      el.style.display = 'none';
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      el.style.display = 'block';
                                      el.style.position = 'fixed';
                                      el.style.top = (rect.bottom + 4) + 'px';
                                      el.style.left = rect.left + 'px';
                                    }
                                  }
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
                                  display: 'none', position: 'fixed', zIndex: 9999,
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
                                        .then(() => fetchOrders());
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
                                    .then(() => fetchOrders());
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
                                {({ low: '🟢 Низкий', medium: '🔵 Средний', high: '🟠 Высокий', urgent: '🔴 Срочно' })[app.priority] || '🔵 Средний'}
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
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn" onClick={(e) => { e.stopPropagation(); setReuploadModal(app); }} title="Перезагрузить файлы" style={{ padding: '4px 8px', fontSize: 11 }}>📤</button>
                              <button className="btn" onClick={(e) => handleEdit(e, app)} title="Редактировать" style={{ padding: '4px 8px', fontSize: 11 }}>✏️</button>
                              <button className="btn btn-danger" onClick={(e) => handleDelete(e, app.id)} title="Удалить" style={{ padding: '4px 8px', fontSize: 11 }}>🗑️</button>
                            </div>
                          ) : (
                            highlightText(getRowData(app)[col.key], search)
                          )}
                      </td>
                    ))}
                  </tr>
                  {search && app.matched_parts && app.matched_parts.length > 0 && (
                    <tr style={{ background: '#fefce8' }}>
                      <td colSpan={COLUMNS.length} style={{ padding: '4px 10px', fontSize: 12 }}>
                        🔍 Совпадения:{' '}
                        {app.matched_parts.map((p, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            <span
                              onClick={(e) => { e.stopPropagation(); setSelectedApp({ ...app, highlightPart: p }); }}
                              style={{ background: '#fde047', padding: '1px 4px', borderRadius: 3, fontWeight: 500, cursor: 'pointer' }}
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
                  <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                    Нет активных заказов
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
          <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} style={{ fontSize: 12 }}>
            «
          </button>
          <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ fontSize: 12 }}>
            ‹
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                className={'btn' + (p === page ? ' btn-primary' : '')}
                onClick={() => setPage(p)}
                style={{ fontSize: 12 }}
              >
                {p}
              </button>
            );
          })}
          <button className="btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ fontSize: 12 }}>
            ›
          </button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages} style={{ fontSize: 12 }}>
            »
          </button>
        </div>
      )}

      {openFilter && (
        <div ref={filterRef} style={{
          position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 200,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 160, maxHeight: 250, overflowY: 'auto', padding: 8
        }}>
          <input
            type="text"
            placeholder="Фильтр..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
            autoFocus
          />
          {getFilterValues(openFilter)
            .filter(v => !filterSearch || v.toLowerCase().includes(filterSearch.toLowerCase()))
            .map(val => (
              <div
                key={val}
                onClick={() => toggleFilterItem(openFilter, val)}
                style={{
                  padding: '4px 8px', cursor: 'pointer', fontSize: 12, borderRadius: 4,
                  background: (filters[openFilter] || []).includes(val) ? '#eff6ff' : 'transparent',
                  fontWeight: (filters[openFilter] || []).includes(val) ? 600 : 400
                }}
              >
                {(FILTER_LABELS[openFilter] && FILTER_LABELS[openFilter][val]) || val || '(пусто)'}
              </div>
            ))
          }
          {filters[openFilter] && (
            <div
              onClick={() => clearFilter(openFilter)}
              style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#ef4444', borderTop: '1px solid var(--border)', marginTop: 4 }}
            >
              Сбросить
            </div>
          )}
        </div>
      )}

      {notesModal && (
        <NotesModal
          app={notesModal}
          onClose={() => setNotesModal(null)}
          onSaved={() => { setNotesModal(null); fetchOrders(); }}
        />
      )}

      {selectedApp && !isMobile && (
        <ApplicationDetail
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={() => fetchOrders()}
        />
      )}

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); fetchOrders(); }}
          status="approved"
        />
      )}

      {showMerge && (
        <MergeModal
          onClose={() => setShowMerge(false)}
          onMerged={() => { setShowMerge(false); fetchOrders(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить заявку?"
          message="Заявка и все связанные раскладки будут удалены безвозвратно."
          onConfirm={confirmDeleteAction}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {groupDetailId && (
        <GroupDetail
          groupId={groupDetailId}
          onClose={() => setGroupDetailId(null)}
          onRefresh={() => fetchOrders()}
        />
      )}

      {showCreateGroup && (
        <CreateGroupModal
          appIds={selectedApps}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(groupId) => {
            setSelectedApps([]);
            fetchOrders();
          }}
        />
      )}

      {editModal && (
        <EditModal
          app={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); fetchOrders(); }}
        />
      )}

      {reuploadModal && (
        <ReuploadModal
          app={reuploadModal}
          onClose={() => setReuploadModal(null)}
          onSaved={() => { setReuploadModal(null); fetchOrders(); }}
        />
      )}
    </div>
  );
}
