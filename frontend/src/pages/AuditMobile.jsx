import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

export default function AuditMobile() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [shifts, setShifts] = useState([]);
  const [stats, setStats] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOps, setExpandedOps] = useState(new Set());

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [shiftsRes, statsRes, opsRes] = await Promise.all([
        client.get('/audit/operators', { params: { month } }),
        client.get('/audit/operators/stats', { params: { month } }),
        client.get('/audit/operators/users'),
      ]);
      setShifts(Array.isArray(shiftsRes.data) ? shiftsRes.data : []);
      setStats(Array.isArray(statsRes.data) ? statsRes.data : []);
      setOperators(Array.isArray(opsRes.data) ? opsRes.data : []);
    } catch (err) {
      console.error('Failed to load audit data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [month]);

  const aggregated = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const [y, m] = month.split('-').map(Number);
    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;

    const uniqueStats = [];
    const seenUserIds = new Set();
    for (const s of stats) {
      if (!seenUserIds.has(s.user_id)) {
        seenUserIds.add(s.user_id);
        uniqueStats.push(s);
      }
    }

    return operators.map(u => {
      const opShifts = shifts.filter(s => s.user_id === u.id);
      const actualHours = opShifts
        .filter(s => {
          if (!isCurrentMonth) return true;
          return new Date(s.date) <= today;
        })
        .reduce((sum, s) => sum + (s.hours || 0), 0);
      const stat = uniqueStats.find(s => s.user_id === u.id) || {
        planned_hours: null, sick_hours: 0, vacation_hours: 0,
      };
      const plannedHours = stat.planned_hours;
      const overtimeHours = plannedHours > 0 ? Math.max(0, actualHours - plannedHours) : 0;
      const st1 = opShifts.filter(s => s.machine_type === 'станок 1').reduce((sum, s) => sum + (s.hours || 0), 0);
      const st2 = opShifts.filter(s => s.machine_type === 'станок 2').reduce((sum, s) => sum + (s.hours || 0), 0);
      const night = opShifts.filter(s => s.shift_type === 'night').reduce((sum, s) => sum + (s.hours || 0), 0);
      return {
        id: u.id, username: u.username, actualHours, plannedHours,
        sick_hours: stat.sick_hours, vacation_hours: stat.vacation_hours,
        overtime_hours: overtimeHours, st1, st2, night,
        total: st1 + st2 + night,
      };
    }).filter(o => o.total > 0 || o.sick_hours > 0 || o.vacation_hours > 0);
  }, [operators, shifts, stats, month]);

  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthOptions.push({ val, label: `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}` });
  }

  const toggleOp = (userId) => {
    setExpandedOps(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, width: '100%' }}>
          {monthOptions.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
        </select>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Загрузка...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {aggregated.map(op => (
            <div key={op.id} style={{
              background: '#fff', borderRadius: 10, overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid var(--border)',
            }}>
              {/* Operator header */}
              <div onClick={() => toggleOp(op.id)} style={{
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', background: '#f8fafc',
              }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {expandedOps.has(op.id) ? '▼' : '▶'}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{op.username}</span>
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: op.overtime_hours > 0 ? '#dc2626' : '#047857',
                }}>
                  {op.actualHours.toFixed(1)} ч
                </span>
              </div>

              {/* Stats row */}
              <div style={{ padding: '8px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatBadge label="План" value={op.plannedHours != null ? `${op.plannedHours} ч` : '-'} color="#3b82f6" />
                <StatBadge label="Факт" value={`${op.actualHours.toFixed(1)} ч`} color="#047857" />
                {op.sick_hours > 0 && <StatBadge label="Больн." value={`${op.sick_hours} ч`} color="#f59e0b" />}
                {op.vacation_hours > 0 && <StatBadge label="Отпуск" value={`${op.vacation_hours} ч`} color="#8b5cf6" />}
                {op.overtime_hours > 0 && <StatBadge label="Перераб." value={`${op.overtime_hours.toFixed(1)} ч`} color="#dc2626" />}
              </div>

              {/* Expanded details */}
              {expandedOps.has(op.id) && (
                <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)', fontSize: 13, color: '#475569' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span>Станок 1: <b>{op.st1}</b> ч</span>
                    <span>Станок 2: <b>{op.st2}</b> ч</span>
                    <span>Ночь: <b>{op.night}</b> ч</span>
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    Итого: <b>{op.total}</b> ч
                  </div>
                </div>
              )}
            </div>
          ))}
          {aggregated.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Нет данных за этот месяц</div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: color + '15', color, border: `1px solid ${color}30`,
    }}>
      {label}: {value}
    </span>
  );
}
