import { useState, useEffect } from 'react';

const SHIFT_CYCLE = [
  ['Yura', 'Denis'],
  ['Andrey', 'Denis'],
  ['Andrey', 'Dima'],
  ['Yura', 'Dima'],
];
const SHIFT_OFFSET = 2;

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const DAY_FULL = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

function getShiftInfo(date) {
  const now = new Date();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
  let dayIndex = ((diffDays + SHIFT_OFFSET) % 4 + 4) % 4;
  const pair = SHIFT_CYCLE[dayIndex];
  let nightIndex = ((diffDays + SHIFT_OFFSET) % 8 + 8) % 8;
  const isVovaOn = nightIndex < 4;
  return { pair, isVovaOn };
}

export default function Schedule() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeOps, setActiveOps] = useState('');

  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      const { pair, isVovaOn } = getShiftInfo(new Date());
      if (h >= 8 && h < 20) {
        setActiveOps(pair[0] + ' (St1) | ' + pair[1] + ' (St2)');
      } else {
        setActiveOps(isVovaOn ? 'Vova (Night)' : 'Night (Off)');
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

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

  const { pair: todayPair, isVovaOn: todayVova } = getShiftInfo(selectedDate);
  const h = new Date().getHours();
  const isDay = h >= 8 && h < 20;

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

      <div className="sched-wrapper">
        <div className="sched-main">
          <div className="sched-grid">
            {DAY_NAMES.map(d => <div key={d} className="sched-header">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={'empty-' + i} className="sched-day" style={{background: '#f8fafc'}} />;
              const date = new Date(year, month, d);
              const { pair, isVovaOn } = getShiftInfo(date);
              const isToday = isCurrentMonth && d === now.getDate();
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <div key={d} className={'sched-day' + (isToday ? ' sched-today' : '') + (isSelected ? ' sched-selected' : '')}
                     onClick={() => setSelectedDate(date)} style={{cursor: 'pointer'}}>
                  <div className="sched-cell">
                    <div style={{fontSize: 14, fontWeight: 600, marginBottom: 2}}>{d}</div>
                    <div className="sched-op">St1: {pair[0]}</div>
                    <div className="sched-op">St2: {pair[1]}</div>
                    {isVovaOn && <div className="sched-op sched-night">N: Vova</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sched-sidebar">
          <h3>📅 Детали дня</h3>
          <div style={{marginBottom: 15, color: '#64748b', fontSize: 12}}>
            {DAY_FULL[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </div>
          <div className="operator-block">
            <div className="label">Станок 1 (День)</div>
            <div className="value">{todayPair[0]}</div>
          </div>
          <div className="operator-block">
            <div className="label">Станок 2 (День)</div>
            <div className="value">{todayPair[1]}</div>
          </div>
          <div className="operator-block" style={{background: '#f3e8ff', border: '1px solid #c084fc'}}>
            <div className="label">Ночь (20:00-08:00)</div>
            <div className="value">{todayVova ? 'Vova' : 'Выходной'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}