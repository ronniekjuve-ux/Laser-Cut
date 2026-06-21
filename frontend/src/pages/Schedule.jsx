import { useState, useEffect, useMemo } from 'react';
import {
  ALL_OPERATORS,
  dateToKey,
  getShiftForDate,
  loadOverrides,
  saveOverrides,
  getOperatorDaysInMonth,
  computeMonthShifts,
  loadOverridesFromServer,
  saveOverrideToServer,
  deleteOverrideFromServer,
} from '../utils/shifts';
import client from '../api/client';

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DAY_FULL = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

const HOURS_PER_SHIFT = 12;

export default function Schedule() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [overrides, setOverrides] = useState(() => loadOverrides());
  const [editingOverride, setEditingOverride] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ st1: '', st2: '', night: '' });
  const [selectedOps, setSelectedOps] = useState([]);

  useEffect(() => {
    const mm = String(month + 1).padStart(2, '0');
    loadOverridesFromServer(`${year}-${mm}`).then(serverOverrides => {
      const merged = { ...loadOverrides(), ...serverOverrides };
      setOverrides(merged);
      saveOverrides(merged);
    });
  }, [year, month]);

  useEffect(() => { saveOverrides(overrides); }, [overrides]);

  const syncToAudit = async (y, m, ov) => {
    try {
      const mm = String(m + 1).padStart(2, '0');
      const shifts = computeMonthShifts(y, m, ov);
      await client.post('/audit/operators/sync', { month: `${y}-${mm}`, shifts });
    } catch (err) {
      console.error('Failed to sync shifts to audit', err);
    }
  };

  useEffect(() => { syncToAudit(year, month, overrides); }, [overrides, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const goToNow = () => {
    setMonth(now.getMonth());
    setYear(now.getFullYear());
    setSelectedDate(new Date());
  };

  const selectedShift = useMemo(
    () => getShiftForDate(selectedDate, overrides),
    [selectedDate, overrides]
  );

  const operatorStats = useMemo(() => {
    if (selectedOps.length === 0) return null;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const stats = {};
    selectedOps.forEach(op => {
      const days = getOperatorDaysInMonth(year, month, overrides);
      const opDays = days[op] || { st1: 0, st2: 0, night: 0 };
      const totalDays = opDays.st1 + opDays.st2 + opDays.night;
      const totalHours = totalDays * HOURS_PER_SHIFT;

      let workedDays = 0;
      let upcomingDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const { pair, isVovaOn } = getShiftForDate(date, overrides);
        const worksDay = pair[0] === op || pair[1] === op;
        const worksNight = isVovaOn && op === 'Vova';
        if (!worksDay && !worksNight) continue;

        if (date <= todayDate) workedDays++;
        else upcomingDays++;
      }

      stats[op] = {
        st1: opDays.st1,
        st2: opDays.st2,
        night: opDays.night,
        totalDays,
        totalHours,
        workedDays,
        workedHours: workedDays * HOURS_PER_SHIFT,
        upcomingDays,
        upcomingHours: upcomingDays * HOURS_PER_SHIFT,
      };
    });
    return stats;
  }, [selectedOps, year, month, overrides, daysInMonth]);

  const toggleOp = (op) => {
    setSelectedOps(prev =>
      prev.includes(op) ? prev.filter(x => x !== op) : [...prev, op]
    );
  };

  const startEditOverride = (date) => {
    const key = dateToKey(date);
    const existing = overrides[key] || {};
    setEditingOverride(key);
    setOverrideForm({
      st1: existing.st1 || '',
      st2: existing.st2 || '',
      night: existing.night || '',
    });
  };

  const saveOverride = () => {
    const hasAny = overrideForm.st1 || overrideForm.st2 || overrideForm.night;
    if (!hasAny) {
      const next = { ...overrides };
      delete next[editingOverride];
      setOverrides(next);
      deleteOverrideFromServer(editingOverride);
    } else {
      setOverrides({ ...overrides, [editingOverride]: { ...overrideForm } });
      saveOverrideToServer(editingOverride, overrideForm.st1, overrideForm.st2, overrideForm.night);
    }
    setEditingOverride(null);
  };

  const resetOverride = (key) => {
    const next = { ...overrides };
    delete next[key];
    setOverrides(next);
    deleteOverrideFromServer(key);
    setEditingOverride(null);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={prevMonth}>← Предыдущий</button>
        <button className="btn" onClick={goToNow}>Текущий месяц</button>
        <button className="btn btn-primary">{MONTH_NAMES[month]} {year}</button>
        <button className="btn" onClick={nextMonth}>Следующий →</button>
      </div>

      <div style={{display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap'}}>
        <span style={{fontSize: 13, color: '#64748b', fontWeight: 600}}>Фильтр:</span>
        {ALL_OPERATORS.map(op => (
          <label key={op} style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={selectedOps.includes(op)}
              onChange={() => toggleOp(op)}
              style={{cursor: 'pointer'}}
            />
            {op}
          </label>
        ))}
        {selectedOps.length > 0 && (
          <button className="btn btn-sm" onClick={() => setSelectedOps([])} style={{fontSize: 11}}>
            Сбросить фильтр
          </button>
        )}
      </div>

      <div className="sched-wrapper">
        <div className="sched-main">
          <div className="sched-grid">
            {DAY_NAMES.map(d => <div key={d} className="sched-header">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={'empty-' + i} className="sched-day" style={{background: '#f8fafc'}} />;
              const date = new Date(year, month, d);
              const shift = getShiftForDate(date, overrides);
              const isToday = isCurrentMonth && d === now.getDate();
              const isSelected = date.toDateString() === selectedDate.toDateString();

              const hasOp = selectedOps.length === 0 || selectedOps.some(op =>
                shift.pair[0] === op || shift.pair[1] === op || (shift.isVovaOn && op === 'Vova')
              );

              return (
                <div
                  key={d}
                  className={
                    'sched-day'
                    + (isToday ? ' sched-today' : '')
                    + (isSelected ? ' sched-selected' : '')
                    + (selectedOps.length > 0 && !hasOp ? ' operator-filtered' : '')
                    + (selectedOps.length > 0 && hasOp ? ' operator-active' : '')
                  }
                  onClick={() => setSelectedDate(date)}
                  style={{cursor: 'pointer'}}
                >
                  <div className="sched-cell">
                    <div style={{fontSize: 14, fontWeight: 600, marginBottom: 2}}>{d}</div>
                    <div className={'sched-op' + (shift.isOverride ? ' override' : '')}>
                      St1: {shift.pair[0] || '—'}
                    </div>
                    <div className={'sched-op' + (shift.isOverride ? ' override' : '')}>
                      St2: {shift.pair[1] || '—'}
                    </div>
                    {shift.isVovaOn && <div className="sched-op sched-night">N: Vova</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sched-sidebar">
          {selectedOps.length > 0 && operatorStats ? (
            <>
              <h3>📊 Статистика</h3>
              {selectedOps.map(op => {
                const s = operatorStats[op];
                if (!s) return null;
                return (
                  <div key={op} className="operator-stat-block">
                    <div style={{fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0f172a'}}>
                      {op} — {MONTH_NAMES[month]} {year}
                    </div>
                    <div style={{fontSize: 12, color: '#64748b', lineHeight: 1.8}}>
                      <div>Станок 1: <b>{s.st1}</b> дн ({s.st1 * HOURS_PER_SHIFT}ч)</div>
                      <div>Станок 2: <b>{s.st2}</b> дн ({s.st2 * HOURS_PER_SHIFT}ч)</div>
                      {op === 'Vova' && <div>Ночь: <b>{s.night}</b> дн ({s.night * HOURS_PER_SHIFT}ч)</div>}
                      <div style={{borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 4}}>
                        Всего: <b>{s.totalDays}</b> дн / <b>{s.totalHours}</b>ч
                      </div>
                      <div style={{color: '#16a34a'}}>Отработано: <b>{s.workedDays}</b> дн / <b>{s.workedHours}</b>ч</div>
                      <div style={{color: '#2563eb'}}>Предстоит: <b>{s.upcomingDays}</b> дн / <b>{s.upcomingHours}</b>ч</div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : editingOverride ? (
            <>
              <h3>✏️ Изменить смену</h3>
              <div style={{fontSize: 12, color: '#64748b', marginBottom: 12}}>
                {new Date(
                  parseInt(editingOverride.slice(0, 4)),
                  parseInt(editingOverride.slice(5, 7)) - 1,
                  parseInt(editingOverride.slice(8, 10))
                ).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{marginBottom: 10}}>
                <label style={{fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4}}>Станок 1 (день)</label>
                <select
                  value={overrideForm.st1}
                  onChange={e => setOverrideForm({...overrideForm, st1: e.target.value})}
                  style={{width: '100%', padding: 6, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13}}
                >
                  <option value="">— расписание —</option>
                  {ALL_OPERATORS.filter(x => x !== 'Vova').map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
              <div style={{marginBottom: 10}}>
                <label style={{fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4}}>Станок 2 (день)</label>
                <select
                  value={overrideForm.st2}
                  onChange={e => setOverrideForm({...overrideForm, st2: e.target.value})}
                  style={{width: '100%', padding: 6, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13}}
                >
                  <option value="">— расписание —</option>
                  {ALL_OPERATORS.filter(x => x !== 'Vova').map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
              <div style={{marginBottom: 14}}>
                <label style={{fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4}}>Ночь (20:00-08:00)</label>
                <select
                  value={overrideForm.night}
                  onChange={e => setOverrideForm({...overrideForm, night: e.target.value})}
                  style={{width: '100%', padding: 6, border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13}}
                >
                  <option value="">— нет —</option>
                  <option value="Vova">Vova</option>
                </select>
              </div>
              <div style={{display: 'flex', gap: 6}}>
                <button className="btn btn-primary" onClick={saveOverride} style={{fontSize: 12}}>Сохранить</button>
                {overrides[editingOverride] && (
                  <button className="btn" onClick={() => resetOverride(editingOverride)} style={{fontSize: 12, color: '#ef4444'}}>
                    Сбросить
                  </button>
                )}
                <button className="btn" onClick={() => setEditingOverride(null)} style={{fontSize: 12}}>Отмена</button>
              </div>
            </>
          ) : (
            <>
              <h3>📅 Детали дня</h3>
              <div style={{marginBottom: 15, color: '#64748b', fontSize: 12}}>
                {DAY_FULL[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
              </div>
              <div className="operator-block">
                <div className="label">Станок 1 (День)</div>
                <div className="value">{selectedShift.pair[0] || '—'}</div>
              </div>
              <div className="operator-block">
                <div className="label">Станок 2 (День)</div>
                <div className="value">{selectedShift.pair[1] || '—'}</div>
              </div>
              <div className="operator-block" style={{background: '#f3e8ff', border: '1px solid #c084fc'}}>
                <div className="label">Ночь (20:00-08:00)</div>
                <div className="value">{selectedShift.isVovaOn ? 'Vova' : 'Выходной'}</div>
              </div>
              {selectedShift.isOverride && (
                <div style={{marginTop: 8, padding: '6px 8px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, fontSize: 12, color: '#92400e'}}>
                  ✏️ Ручное изменение
                </div>
              )}
              <button
                className="btn"
                onClick={() => startEditOverride(selectedDate)}
                style={{marginTop: 12, width: '100%', justifyContent: 'center', fontSize: 12}}
              >
                ✏️ Изменить смену
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
