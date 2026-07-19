import React, { useState, useEffect, useMemo } from 'react';
import client from '../../api/client';

function formatHMS(seconds) {
  if (!seconds || seconds <= 0) return '0ч 0м';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function formatNum(n) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('ru-RU');
}

const MACHINE_COLORS = {
  'Станок 1 (CNF)': '#3b82f6',
  'Станок 2 (FNF)': '#f59e0b',
};

const MACHINE_ORDER = ['Станок 1 (CNF)', 'Станок 2 (FNF)'];

function sortMachines(machines) {
  return [...machines].sort((a, b) => {
    const ai = MACHINE_ORDER.indexOf(a.name);
    const bi = MACHINE_ORDER.indexOf(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function CompactBarChart({ data, maxValue, labelKey, valueKey, colorKey, formatValue, title }) {
  const barW = 50;
  const gap = 20;
  const chartW = data.length * (barW + gap) + 50;
  const chartH = 130;
  const topP = 22;
  const plotH = chartH - topP - 22;

  return (
    <div style={{ flex: '1 1 200px', minWidth: 180, background: 'white', borderRadius: 10, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a', marginBottom: 6 }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ overflow: 'visible' }}>
        {[0, 0.5, 1].map((frac, i) => (
          <g key={i}>
            <line x1={30} y1={topP + plotH * (1 - frac)} x2={chartW - 5} y2={topP + plotH * (1 - frac)}
              stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray={frac > 0 ? "3,3" : "0"} />
            <text x={26} y={topP + plotH * (1 - frac) + 3} textAnchor="end" fontSize="7" fill="#94a3b8">
              {formatValue ? formatValue(maxValue * frac) : Math.round(maxValue * frac)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = 35 + i * (barW + gap);
          const val = d[valueKey] || 0;
          const barH = maxValue > 0 ? (val / maxValue) * plotH : 0;
          const color = d[colorKey] || '#3b82f6';
          return (
            <g key={i}>
              <rect x={x} y={topP + plotH - barH} width={barW} height={barH} fill={color} rx="3" opacity="0.85" />
              <text x={x + barW / 2} y={topP + plotH - barH - 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="#334155">
                {formatValue ? formatValue(val) : formatNum(val)}
              </text>
              <text x={x + barW / 2} y={chartH - 6} textAnchor="middle" fontSize="8" fill="#64748b">
                {d[labelKey]?.replace('Станок ', 'С')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MachineCard({ machine }) {
  const color = MACHINE_COLORS[machine.name] || '#64748b';
  return (
    <div style={{
      background: 'white', borderRadius: 10, border: `2px solid ${color}20`,
      padding: '12px 14px', flex: '1 1 280px', minWidth: 250,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{machine.name}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px', fontSize: 11 }}>
        <div style={{ color: '#64748b' }}>Раскладок:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.layouts_count)}</div>
        <div style={{ color: '#64748b' }}>Листов:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.sheets_count)}</div>
        <div style={{ color: '#64748b' }}>Заявок:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.applications_count)}</div>
        <div style={{ color: '#64748b' }}>Время реза:</div>
        <div style={{ fontWeight: 600, color: '#1d4ed8' }}>{machine.cut_time_hms}</div>
        <div style={{ color: '#64748b' }}>Длина реза:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.cut_length)} м</div>
        <div style={{ color: '#64748b' }}>Проколы:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.pierces)}</div>
        <div style={{ color: '#64748b' }}>Масса:</div>
        <div style={{ fontWeight: 600 }}>{formatNum(machine.weight)} кг</div>
      </div>
    </div>
  );
}

export default function MachinesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [view, setView] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('unfinished');

  const fetchData = async (status) => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (status) params.status = status;
      const res = await client.get('/audit/machines', { params });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load machine data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(statusFilter); }, []);

  const handleStatusChange = (s) => {
    setStatusFilter(s);
    fetchData(s);
  };

  const machines = useMemo(() => sortMachines(data?.machines || []), [data]);
  const byMaterial = data?.by_material || {};

  const maxCutTime = useMemo(() => Math.max(...machines.map(m => m.cut_time_seconds), 1), [machines]);
  const maxSheets = useMemo(() => Math.max(...machines.map(m => m.sheets_count), 1), [machines]);
  const maxCutLength = useMemo(() => Math.max(...machines.map(m => m.cut_length), 1), [machines]);

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Загрузка...</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>С</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 2 }}>По</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
        </div>
        <button className="btn btn-primary" onClick={() => fetchData(statusFilter)}
          style={{ padding: '5px 14px', fontSize: 12, alignSelf: 'flex-end' }}>
          Показать
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[
            { key: 'overview', label: 'Обзор' },
            { key: 'materials', label: 'По материалу' },
          ].map(v => (
            <button key={v.key} className="btn" onClick={() => setView(v.key)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: view === v.key ? 600 : 400,
                background: view === v.key ? '#eff6ff' : 'transparent',
                border: `1px solid ${view === v.key ? '#3b82f6' : 'var(--border)'}`,
                color: view === v.key ? '#1d4ed8' : '#475569',
              }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Machine cards — only in overview */}
      {machines.length > 0 && view === 'overview' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {machines.map(m => <MachineCard key={m.name} machine={m} />)}
        </div>
      )}

      {machines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          Нет данных за выбранный период
        </div>
      ) : (
        <>
          {view === 'overview' && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <CompactBarChart data={machines} maxValue={maxCutTime} labelKey="name" valueKey="cut_time_seconds"
                colorKey="name" formatValue={formatHMS} title="Время резы" />
              <CompactBarChart data={machines} maxValue={maxSheets} labelKey="name" valueKey="sheets_count"
                colorKey="name" formatValue={v => formatNum(v)} title="Листы" />
              <CompactBarChart data={machines} maxValue={maxCutLength} labelKey="name" valueKey="cut_length"
                colorKey="name" formatValue={v => `${formatNum(v)} м`} title="Длина реза" />
            </div>
          )}

          {view === 'materials' && (
            <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  Загрузка по материалу и станкам
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button className="btn" onClick={() => handleStatusChange('unfinished')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: statusFilter === 'unfinished' ? 600 : 400,
                      background: statusFilter === 'unfinished' ? '#fef3c7' : 'transparent',
                      border: `1px solid ${statusFilter === 'unfinished' ? '#f59e0b' : 'var(--border)'}`,
                      color: statusFilter === 'unfinished' ? '#92400e' : '#475569',
                    }}>
                    Невыполненные
                  </button>
                  <button className="btn" onClick={() => handleStatusChange('completed')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: statusFilter === 'completed' ? 600 : 400,
                      background: statusFilter === 'completed' ? '#dcfce7' : 'transparent',
                      border: `1px solid ${statusFilter === 'completed' ? '#10b981' : 'var(--border)'}`,
                      color: statusFilter === 'completed' ? '#166534' : '#475569',
                    }}>
                    Выполненные
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)', color: '#64748b' }}>Материал</th>
                      {machines.map(m => (
                        <th key={m.name} colSpan={3} style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid var(--border)', color: '#64748b', fontSize: 11 }}>{m.name}</th>
                      ))}
                    </tr>
                    <tr>
                      <th />
                      {machines.map(m => (
                        <React.Fragment key={m.name}>
                          <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: '#94a3b8', fontSize: 10 }}>Время</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: '#94a3b8', fontSize: 10 }}>Листы</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: '#94a3b8', fontSize: 10 }}>Раск.</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byMaterial).length === 0 && (
                      <tr><td colSpan={1 + machines.length * 3} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Нет данных</td></tr>
                    )}
                    {Object.entries(byMaterial).map(([mat, matData]) => (
                      <tr key={mat}>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{mat}</td>
                        {machines.map(m => {
                          const d = matData[m.name] || {};
                          return (
                            <React.Fragment key={m.name}>
                              <td style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{formatHMS(d.cut_seconds || 0)}</td>
                              <td style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{d.sheets || 0}</td>
                              <td style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>{d.layouts || 0}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
