import React, { useState, useEffect, useMemo } from 'react';
import client from '../../api/client';

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

  const exportToExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const rows = [];
    for (const g of grouped) {
      if (groupBy !== 'none') {
        rows.push({ A: g.label, B: `${g.items.length} заявок` });
      }
      for (const item of g.items) {
        rows.push({
          A: item.customer,
          B: item.order_name,
          C: formatDate(item.created_at),
          D: item.steel_grade || item.material,
          E: item.thickness,
          F: item.supply_material ? 'Да' : item.supply_material === false ? 'Нет' : '-',
          G: item.machine,
          H: item.layouts_count,
          I: item.total_cut_length,
          J: item.total_pierces,
          K: item.total_parts_weight,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['Заказчик', 'Заявка', 'Дата', 'Марка', 'Толщ.', 'Дав.мат', 'Станок', 'Раскладок', 'Длина реза', 'Проколы', 'Масса дет.'],
    });

    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
      { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Заявки');
    XLSX.writeFile(wb, `audit_${new Date().toISOString().slice(0,10)}.xlsx`);
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
        <button className="btn" onClick={exportToExcel} style={{fontSize:13, marginLeft:'auto'}}>Экспорт в Excel</button>
      </div>

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
                Масса: {g.items.reduce((s,i) => s + (i.total_parts_weight||0), 0).toFixed(1)} кг |
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
                    <th>Масса дет.</th>
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
                        <td>{item.total_parts_weight}</td>
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
                          <td style={{color:'#475569'}}>{l.parts_weight} кг</td>
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
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [showAdd, setShowAdd] = useState(false);
  const [newShift, setNewShift] = useState({ user_id: '', date: '', shift_type: 'day', hours: 8, machine_type: '' });
  const [editingId, setEditingId] = useState(null);
  const [editHours, setEditHours] = useState('');

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await client.get('/audit/operators', { params: { month } });
      setShifts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load shifts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShifts(); }, [month]);
  useEffect(() => {
    client.get('/audit/operators/users').then(r => setOperators(Array.isArray(r.data) ? r.data : []));
  }, []);

  const handleAdd = async () => {
    if (!newShift.user_id || !newShift.date) return;
    try {
      await client.post('/audit/operators', {
        user_id: parseInt(newShift.user_id),
        date: newShift.date,
        shift_type: newShift.shift_type,
        hours: parseFloat(newShift.hours),
        machine_type: newShift.machine_type || null,
      });
      setShowAdd(false);
      setNewShift({ user_id: '', date: '', shift_type: 'day', hours: 8, machine_type: '' });
      fetchShifts();
    } catch (err) {
      console.error('Failed to add shift', err);
    }
  };

  const handleSaveHours = async (id) => {
    try {
      await client.put(`/audit/operators/${id}`, { hours: parseFloat(editHours) });
      setEditingId(null);
      fetchShifts();
    } catch (err) {
      console.error('Failed to update shift', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить смену?')) return;
    try {
      await client.delete(`/audit/operators/${id}`);
      fetchShifts();
    } catch (err) {
      console.error('Failed to delete shift', err);
    }
  };

  const totalHours = shifts.reduce((s, sh) => s + (sh.hours || 0), 0);

  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthOptions.push({ val, label: `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}` });
  }

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap'}}>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
          {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)} style={{fontSize:13}}>
          {showAdd ? 'Отмена' : '+ Добавить смену'}
        </button>
        <span style={{marginLeft:'auto', fontSize:13, color:'#64748b'}}>
          Итого: {shifts.length} смен | {totalHours.toFixed(1)} ч
        </span>
      </div>

      {showAdd && (
        <div style={{display:'flex', gap:8, marginBottom:12, padding:12, background:'#f8fafc', borderRadius:8, alignItems:'end', flexWrap:'wrap'}}>
          <div>
            <label style={{fontSize:12, display:'block', marginBottom:2}}>Оператор</label>
            <select value={newShift.user_id} onChange={e => setNewShift({...newShift, user_id: e.target.value})}
              style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
              <option value="">Выбрать</option>
              {operators.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12, display:'block', marginBottom:2}}>Дата</label>
            <input type="date" value={newShift.date} onChange={e => setNewShift({...newShift, date: e.target.value})}
              style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}} />
          </div>
          <div>
            <label style={{fontSize:12, display:'block', marginBottom:2}}>Смена</label>
            <select value={newShift.shift_type} onChange={e => setNewShift({...newShift, shift_type: e.target.value})}
              style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
              <option value="day">День</option>
              <option value="night">Ночь</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:12, display:'block', marginBottom:2}}>Часы</label>
            <input type="number" step="0.5" value={newShift.hours} onChange={e => setNewShift({...newShift, hours: e.target.value})}
              style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13, width:70}} />
          </div>
          <div>
            <label style={{fontSize:12, display:'block', marginBottom:2}}>Станок</label>
            <select value={newShift.machine_type} onChange={e => setNewShift({...newShift, machine_type: e.target.value})}
              style={{padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:13}}>
              <option value="">-</option>
              <option value="станок 1">станок 1</option>
              <option value="станок 2">станок 2</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleAdd} style={{fontSize:13}}>Сохранить</button>
        </div>
      )}

      {loading ? <div className="loading">Загрузка...</div> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Оператор</th>
                <th>Дата</th>
                <th>Смена</th>
                <th>Часы</th>
                <th>Станок</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(sh => (
                <tr key={sh.id}>
                  <td><b>{sh.username}</b></td>
                  <td style={{fontFamily:'monospace', fontSize:12}}>{formatDate(sh.date)}</td>
                  <td>{sh.shift_type === 'day' ? 'День' : 'Ночь'}</td>
                  <td>
                    {editingId === sh.id ? (
                      <span>
                        <input type="number" step="0.5" value={editHours}
                          onChange={e => setEditHours(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveHours(sh.id)}
                          style={{width:60, padding:'4px', fontSize:13, border:'1px solid var(--border)', borderRadius:4}} />
                        <button onClick={() => handleSaveHours(sh.id)}
                          style={{marginLeft:4, cursor:'pointer', border:'none', background:'none', color:'#16a34a', fontWeight:700}}>OK</button>
                        <button onClick={() => setEditingId(null)}
                          style={{cursor:'pointer', border:'none', background:'none', color:'#dc2626'}}>X</button>
                      </span>
                    ) : (
                      <span onDoubleClick={() => { setEditingId(sh.id); setEditHours(String(sh.hours)); }}
                        style={{cursor:'pointer', borderBottom:'1px dashed #94a3b8'}}>
                        {sh.hours}
                      </span>
                    )}
                  </td>
                  <td>{sh.machine_type || '-'}</td>
                  <td>
                    <button onClick={() => handleDelete(sh.id)}
                      style={{border:'none', background:'none', cursor:'pointer', color:'#dc2626', fontSize:13}}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:'center', padding:20, color:'#64748b'}}>Нет смен за этот месяц</td></tr>
              )}
            </tbody>
          </table>
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
