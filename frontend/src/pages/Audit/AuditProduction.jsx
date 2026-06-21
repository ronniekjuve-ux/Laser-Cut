import React, { useState, useEffect, useMemo } from 'react';
import client from '../../api/client';
import { computeMonthShifts, loadOverridesFromServer } from '../../utils/shifts';

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU');
}

function monthKey(iso) {
  if (!iso) return 'Без даты';
  const d = new Date(iso);
  return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

const EXPORT_COLUMNS = [
  { key: 'customer', label: 'Заказчик' },
  { key: 'order_name', label: 'Заявка' },
  { key: 'created_at', label: 'Дата' },
  { key: 'steel_grade', label: 'Марка' },
  { key: 'thickness', label: 'Толщ.' },
  { key: 'supply_material', label: 'Дав.мат' },
  { key: 'machine', label: 'Станок' },
  { key: 'layouts_count', label: 'Раскладок' },
  { key: 'total_cut_length', label: 'Длина реза' },
  { key: 'total_pierces', label: 'Проколы' },
  { key: 'total_parts_weight', label: 'Масса дет.' },
  { key: 'total_weight', label: 'Масса заявки' },
];

function ApplicationsTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [groupBy, setGroupBy] = useState('date');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [expandedApps, setExpandedApps] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState(
    EXPORT_COLUMNS.map(c => c.key)
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (customerId) params.customer_id = customerId;
      const res = await client.get('/audit/applications', { params });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load audit data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    client.get('/audit/customers').then(r => setCustomers(Array.isArray(r.data) ? r.data : []));
  }, []);

  const handleFilter = () => { fetchData(); };

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'Все заявки', items: data }];
    const map = {};
    for (const item of data) {
      let key;
      if (groupBy === 'date') {
        key = monthKey(item.created_at);
      } else {
        key = item.customer || 'Без заказчика';
      }
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return Object.entries(map).map(([key, items]) => ({ key, label: key, items }));
  }, [data, groupBy]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleApp = (id) => {
    setExpandedApps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleColumn = (key) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAllColumns = () => setSelectedColumns(EXPORT_COLUMNS.map(c => c.key));
  const deselectAllColumns = () => setSelectedColumns([]);

  const exportToExcel = async () => {
    if (selectedColumns.length === 0) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const cols = EXPORT_COLUMNS.filter(c => selectedColumns.includes(c.key));
    const rows = [];

    for (const g of grouped) {
      for (const item of g.items) {
        const row = {};
        cols.forEach(col => { row[col.label] = getCellValue(item, col.key); });
        rows.push(row);
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows, { header: cols.map(c => c.label), skipHeader: false });
    ws['!cols'] = cols.map(() => ({ wch: 14 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Заявки');
    XLSX.writeFile(wb, `audit_${new Date().toISOString().slice(0,10)}.xlsx`);
    setShowExportModal(false);
  };

  const getCellValue = (item, key) => {
    switch (key) {
      case 'customer': return item.customer || '';
      case 'order_name': return item.order_name || '';
      case 'created_at': return formatDate(item.created_at);
      case 'steel_grade': return item.steel_grade || item.material || '-';
      case 'thickness': return item.thickness ?? '';
      case 'supply_material': return item.supply_material ? 'Да' : item.supply_material === false ? 'Нет' : '-';
      case 'machine': return item.machine || '';
      case 'layouts_count': return item.layouts_count ?? '';
      case 'total_cut_length': return item.total_cut_length ?? '';
      case 'total_pierces': return item.total_pierces ?? '';
      case 'total_parts_weight': return item.total_parts_weight ?? '';
      case 'total_weight': return item.total_weight ?? '';
      default: return '';
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap'}}>
        <label style={{fontSize:13}}>от:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}} />
        <label style={{fontSize:13}}>до:</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}} />
        <select value={customerId} onChange={e => setCustomerId(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
          <option value="">Все заказчики</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
          <option value="date">По дате</option>
          <option value="customer">По заказчику</option>
          <option value="none">Без группировки</option>
        </select>
        <button className="btn btn-primary" onClick={handleFilter} style={{fontSize:13}}>Применить</button>
        <button className="btn" onClick={() => setShowExportModal(true)} style={{fontSize:13, marginLeft:'auto'}}>Экспорт в Excel</button>
      </div>

      {showExportModal && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}
          onClick={() => setShowExportModal(false)}>
          <div style={{background:'#fff', borderRadius:12, padding:24, minWidth:420, maxWidth:600,
            boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}
            onClick={e => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <h3 style={{margin:0, fontSize:16}}>Выбор столбцов для экспорта</h3>
              <button onClick={() => setShowExportModal(false)}
                style={{border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#64748b'}}>×</button>
            </div>

            <div style={{display:'flex', gap:8, marginBottom:12}}>
              <button className="btn" onClick={selectAllColumns} style={{fontSize:12}}>Все</button>
              <button className="btn" onClick={deselectAllColumns} style={{fontSize:12}}>Нет</button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:16}}>
              {EXPORT_COLUMNS.map(col => (
                <label key={col.key} style={{display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer',
                  padding:'4px 8px', borderRadius:4, background: selectedColumns.includes(col.key) ? '#eff6ff' : 'transparent'}}>
                  <input type="checkbox" checked={selectedColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>

            <div style={{fontSize:12, color:'#64748b', marginBottom:12}}>
              Предпросмотр: {selectedColumns.length} столбцов, {data.length} заявок
            </div>

            <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn" onClick={() => setShowExportModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={exportToExcel}
                disabled={selectedColumns.length === 0}
                style={{opacity: selectedColumns.length === 0 ? 0.5 : 1}}>
                Экспорт
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{fontSize:13, color:'#64748b', marginBottom:8}}>
        Найдено: {data.length} заявок
      </div>

      {grouped.map(g => (
        <div key={g.key} style={{marginBottom:8}}>
          {groupBy !== 'none' && (
            <div
              onClick={() => toggleGroup(g.key)}
              style={{padding:'8px 12px', background:'#f1f5f9', borderRadius:6, cursor:'pointer',
                fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between', alignItems:'center'}}
            >
              <span>{expandedGroups.has(g.key) ? '\u25BC' : '\u25B6'} {g.label} ({g.items.length})</span>
              <span style={{fontSize:12, fontWeight:400, color:'#64748b'}}>
                Масса: {g.items.reduce((s,i) => s + (i.total_weight||0), 0).toFixed(1)} кг |
                Рез: {g.items.reduce((s,i) => s + (i.total_cut_length||0), 0).toFixed(0)} мм |
                Проколы: {g.items.reduce((s,i) => s + (i.total_pierces||0), 0)}
              </span>
            </div>
          )}
          {(groupBy === 'none' || expandedGroups.has(g.key)) && (
            <div className="table-container" style={{marginTop: groupBy !== 'none' ? 4 : 0}}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Заказчик</th>
                    <th>Заявка</th>
                    <th>Дата</th>
                    <th>Марка</th>
                    <th>Толщ.</th>
                    <th>Дав.мат</th>
                    <th>Станок</th>
                    <th>Раскладок</th>
                    <th>Длина реза</th>
                    <th>Проколы</th>
                    <th>Масса заявки</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(item => (
                    <React.Fragment key={item.id}>
                      <tr onClick={() => toggleApp(item.id)} style={{cursor:'pointer'}}>
                        <td style={{width:30, textAlign:'center'}}>{expandedApps.has(item.id) ? '\u25BC' : '\u25B6'}</td>
                        <td>{item.customer}</td>
                        <td><b>{item.order_name}</b></td>
                        <td style={{fontFamily:'monospace', fontSize:12}}>{formatDate(item.created_at)}</td>
                        <td>{item.steel_grade || item.material}</td>
                        <td>{item.thickness}</td>
                        <td>{item.supply_material ? 'Да' : item.supply_material === false ? 'Нет' : '-'}</td>
                        <td>{item.machine}</td>
                        <td>{item.layouts_count}</td>
                        <td>{item.total_cut_length}</td>
                        <td>{item.total_pierces}</td>
                        <td>{item.total_weight}</td>
                      </tr>
                      {expandedApps.has(item.id) && item.layouts.map((l, li) => (
                        <tr key={li} style={{background:'#f8fafc', fontSize:12}}>
                          <td></td>
                          <td></td>
                          <td colSpan={3} style={{color:'#475569'}}>
                            Раскладка {l.layout_code} | {l.sheet_w}x{l.sheet_h} | {l.sheet_weight ? l.sheet_weight.toFixed(1) + ' кг' : '-'}
                          </td>
                          <td></td>
                          <td></td>
                          <td style={{color:'#475569'}}>{l.machine_type}</td>
                          <td style={{color:'#475569'}}>{l.parts_count} дет.</td>
                          <td style={{color:'#475569'}}>{l.cut_length || '-'}</td>
                          <td style={{color:'#475569'}}>{l.pierces || '-'}</td>
                          <td style={{color:'#475569'}}>{l.sheet_weight ? l.sheet_weight.toFixed(1) + ' кг' : '-'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


function OperatorsTab() {
  const [shifts, setShifts] = useState([]);
  const [stats, setStats] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [expandedOps, setExpandedOps] = useState(new Set());
  const [editingStat, setEditingStat] = useState(null);
  const [editValues, setEditValues] = useState({});

  const syncMonthFromSchedule = async (monthStr) => {
    try {
      const [y, m] = monthStr.split('-').map(Number);
      const overrides = await loadOverridesFromServer(monthStr);
      const shifts = computeMonthShifts(y, m - 1, overrides);
      await client.post('/audit/operators/sync', { month: monthStr, shifts });
    } catch (err) {
      console.error('Failed to sync schedule to audit', err);
    }
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      await syncMonthFromSchedule(month);
      const res = await client.get('/audit/operators', { params: { month } });
      setShifts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load shifts', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await client.get('/audit/operators/stats', { params: { month } });
      setStats(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  };

  useEffect(() => { fetchShifts(); fetchStats(); }, [month]);
  useEffect(() => {
    client.get('/audit/operators/users').then(r => setOperators(Array.isArray(r.data) ? r.data : []));
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Удалить смену?')) return;
    try {
      await client.delete(`/audit/operators/${id}`);
      fetchShifts();
    } catch (err) {
      console.error('Failed to delete shift', err);
    }
  };

  const toggleOp = (userId) => {
    setExpandedOps(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const startEditStat = (stat, field) => {
    setEditingStat(`${stat.user_id}-${field}`);
    setEditValues({ [field]: stat[field] ?? 0 });
  };

  const saveStat = async (userId, field) => {
    const value = parseFloat(editValues[field]) || 0;
    try {
      await client.post('/audit/operators/stats', {
        user_id: userId,
        month,
        [field]: value,
      });
      setEditingStat(null);
      fetchStats();
    } catch (err) {
      console.error('Failed to save stat', err);
    }
  };

  const aggregated = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const [y, m] = month.split('-').map(Number);
    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
    const endOfMonth = new Date(y, m, 0);

    const uniqueStats = [];
    const seenUserIds = new Set();
    for (const s of stats) {
      if (!seenUserIds.has(s.user_id)) {
        seenUserIds.add(s.user_id);
        uniqueStats.push(s);
      }
    }

    const ops = operators.map(u => {
      const opShifts = shifts.filter(s => s.user_id === u.id);
      const actualHours = opShifts
        .filter(s => {
          if (!isCurrentMonth) return true;
          const shiftDate = new Date(s.date);
          return shiftDate <= today;
        })
        .reduce((sum, s) => sum + (s.hours || 0), 0);
      const stat = uniqueStats.find(s => s.user_id === u.id) || {
        planned_hours: 0, sick_hours: 0, vacation_hours: 0, overtime_hours: 0, hourly_rate: 0,
      };
      return {
        id: u.id,
        username: u.username,
        actualHours,
        shifts: opShifts,
        planned_hours: stat.planned_hours,
        sick_hours: stat.sick_hours,
        vacation_hours: stat.vacation_hours,
        overtime_hours: stat.overtime_hours,
        hourly_rate: stat.hourly_rate,
      };
    });
    return ops.filter(o => o.shifts.length > 0 || o.planned_hours > 0 || o.sick_hours > 0 || o.vacation_hours > 0);
  }, [operators, shifts, stats, month]);

  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthOptions.push({ val, label: `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}` });
  }

  const renderEditable = (opId, field, value) => {
    const key = `${opId}-${field}`;
    if (editingStat === key) {
      return (
        <span style={{display:'inline-flex', alignItems:'center', gap:4}}>
          <input type="number" step="0.5" value={editValues[field] ?? 0}
            onChange={e => setEditValues({ ...editValues, [field]: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') saveStat(opId, field);
              if (e.key === 'Escape') setEditingStat(null);
            }}
            autoFocus
            style={{width:60, padding:'4px', fontSize:13, border:'1px solid var(--border)', borderRadius:4}} />
          <button onClick={() => saveStat(opId, field)}
            style={{cursor:'pointer', border:'none', background:'none', color:'#16a34a', fontWeight:700, fontSize:13}}>OK</button>
          <button onClick={() => setEditingStat(null)}
            style={{cursor:'pointer', border:'none', background:'none', color:'#dc2626', fontSize:13}}>X</button>
        </span>
      );
    }
    return (
      <span style={{display:'inline-flex', alignItems:'center', gap:4}}>
        <span>{value ?? 0}</span>
        <button onClick={() => { setEditingStat(key); setEditValues({ [field]: value ?? 0 }); }}
          style={{cursor:'pointer', border:'none', background:'none', color:'#3b82f6', fontSize:11, padding:0}}>
          ✏️
        </button>
      </span>
    );
  };

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap'}}>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
          {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
      </div>

      {loading ? <div className="loading">Загрузка...</div> : (
        <div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Оператор</th>
                  <th>Запланировано</th>
                  <th>Фактически</th>
                  <th>Больничные</th>
                  <th>Отпускные</th>
                  <th>Переработка</th>
                  <th>Руб/ч</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map(op => (
                  <React.Fragment key={op.id}>
                    <tr>
                      <td style={{width:30, textAlign:'center', cursor:'pointer'}} onClick={() => toggleOp(op.id)}>
                        {expandedOps.has(op.id) ? '\u25BC' : '\u25B6'}
                      </td>
                      <td><b>{op.username}</b></td>
                      <td>{renderEditable(op.id, 'planned_hours', op.planned_hours)}</td>
                      <td><b>{op.actualHours.toFixed(1)}</b></td>
                      <td>{renderEditable(op.id, 'sick_hours', op.sick_hours)}</td>
                      <td>{renderEditable(op.id, 'vacation_hours', op.vacation_hours)}</td>
                      <td>{renderEditable(op.id, 'overtime_hours', op.overtime_hours)}</td>
                      <td>{renderEditable(op.id, 'hourly_rate', op.hourly_rate)}</td>
                      <td></td>
                    </tr>
                    {expandedOps.has(op.id) && op.shifts.map(sh => (
                      <tr key={sh.id} style={{background:'#f8fafc', fontSize:12}}>
                        <td></td>
                        <td style={{color:'#475569'}}>{formatDate(sh.date)}</td>
                        <td colSpan={2} style={{color:'#475569'}}>
                          {sh.shift_type === 'day' ? 'День' : 'Ночь'} | {sh.hours} ч
                        </td>
                        <td colSpan={2} style={{color:'#475569'}}>
                          {sh.machine_type || '-'}
                        </td>
                        <td colSpan={2}></td>
                        <td>
                          <button onClick={() => handleDelete(sh.id)}
                            style={{border:'none', background:'none', cursor:'pointer', color:'#dc2626', fontSize:12}}>
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                {aggregated.length === 0 && (
                  <tr><td colSpan={9} style={{textAlign:'center', padding:20, color:'#64748b'}}>Нет данных за этот месяц</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


export default function AuditProduction() {
  const [tab, setTab] = useState('applications');

  return (
    <div>
      <div style={{display:'flex', gap:0, marginBottom:20}}>
        <button
          onClick={() => setTab('applications')}
          style={{padding:'10px 20px', fontSize:14, fontWeight: tab === 'applications' ? 600 : 400,
            border:'1px solid var(--border)', borderBottom: tab === 'applications' ? '2px solid #3b82f6' : '1px solid var(--border)',
            borderRadius:'8px 8px 0 0', cursor:'pointer', background: tab === 'applications' ? '#eff6ff' : 'transparent'}}>
          Заявки
        </button>
        <button
          onClick={() => setTab('operators')}
          style={{padding:'10px 20px', fontSize:14, fontWeight: tab === 'operators' ? 600 : 400,
            border:'1px solid var(--border)', borderBottom: tab === 'operators' ? '2px solid #3b82f6' : '1px solid var(--border)',
            borderRadius:'8px 8px 0 0', cursor:'pointer', background: tab === 'operators' ? '#eff6ff' : 'transparent'}}>
          Операторы
        </button>
      </div>

      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'operators' && <OperatorsTab />}
    </div>
  );
}
