import { useState, useEffect } from 'react';
import client from '../../api/client';

const ACTION_LABELS = {
  CREATE: 'Создание',
  UPDATE: 'Обновление',
  DELETE: 'Удаление',
  status: 'Статус',
  priority: 'Приоритет',
  deficit_status: 'Статус дефицита',
  deficit_edit: 'Редакт. дефицита',
  login: 'Вход',
};

function BarChart({ data, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.count), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${d.count}`}>
          <div className="bar-fill" style={{ height: `${(d.count / max) * 100}%` }} />
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function UserActivityModal({ user, onClose }) {
  const [tab, setTab] = useState('today');
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyDays, setHistoryDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [statsRes, actRes] = await Promise.all([
          client.get(`/users/${user.id}/stats`),
          client.get(`/users/${user.id}/activity`),
        ]);
        setStats(statsRes.data);
        setActivity(actRes.data);
      } catch (err) {
        console.error('Failed to load activity', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user.id]);

  useEffect(() => {
    if (tab !== 'history') return;
    const load = async () => {
      try {
        const res = await client.get(`/users/${user.id}/history?days=${historyDays}`);
        setHistory(res.data);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };
    load();
  }, [tab, historyDays, user.id]);

  const hourlyBars = activity?.hourly_activity?.map(h => ({
    label: h.hour.replace(':00', ''),
    count: h.count,
  })) || [];

  const dailyBars = history?.daily_activity?.map(d => ({
    label: d.date.slice(5),
    count: d.count,
  })) || [];

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 800 }}>
        <div className="modal-header">
          <h3>{user.username} — Активность</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Загрузка...</div>
          ) : (
            <>
              <div className="activity-tabs">
                <button
                  className={'activity-tab' + (tab === 'today' ? ' active' : '')}
                  onClick={() => setTab('today')}
                >
                  Сегодня
                </button>
                <button
                  className={'activity-tab' + (tab === 'history' ? ' active' : '')}
                  onClick={() => setTab('history')}
                >
                  История
                </button>
              </div>

              {tab === 'today' && stats && (
                <div className="activity-section">
                  <div className="stats-grid">
                    <div className="stat-card">
                      <h4>Входов сегодня</h4>
                      <div className="value">{stats.logins_today}</div>
                    </div>
                    <div className="stat-card">
                      <h4>Вчера</h4>
                      <div className="value">{stats.logins_yesterday}</div>
                    </div>
                    <div className="stat-card">
                      <h4>Действий сегодня</h4>
                      <div className="value">{stats.actions_today}</div>
                    </div>
                    <div className="stat-card">
                      <h4>Среднее входов/день</h4>
                      <div className="value">{stats.avg_daily_logins}</div>
                    </div>
                  </div>

                  {hourlyBars.some(b => b.count > 0) && (
                    <div className="chart-section">
                      <h4>Активность за 24ч</h4>
                      <BarChart data={hourlyBars} />
                    </div>
                  )}

                  {activity?.actions?.length > 0 && (
                    <div className="actions-section">
                      <h4>Последние действия</h4>
                      <div className="actions-list">
                        {activity.actions.map((a, i) => (
                          <div key={i} className="action-item">
                            <span className="action-time">
                              {new Date(a.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="action-type">
                              {ACTION_LABELS[a.action] || a.action}
                            </span>
                            <span className="action-resource">{a.resource}</span>
                            <span className="action-details">{a.details}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'history' && (
                <div className="activity-section">
                  <div className="history-controls">
                    <span>Период:</span>
                    {[7, 14, 30].map(d => (
                      <button
                        key={d}
                        className={'btn btn-sm' + (historyDays === d ? ' btn-primary' : '')}
                        onClick={() => setHistoryDays(d)}
                      >
                        {d} дн
                      </button>
                    ))}
                  </div>

                  {history && (
                    <>
                      <div className="stats-grid">
                        <div className="stat-card">
                          <h4>Входов за период</h4>
                          <div className="value">{history.total_logins}</div>
                        </div>
                        <div className="stat-card">
                          <h4>Действий за период</h4>
                          <div className="value">{history.total_actions}</div>
                        </div>
                      </div>

                      {dailyBars.some(b => b.count > 0) && (
                        <div className="chart-section">
                          <h4>Активность по дням</h4>
                          <BarChart data={dailyBars} />
                        </div>
                      )}

                      {history.logins?.length > 0 && (
                        <div className="actions-section">
                          <h4>История входов</h4>
                          <div className="table-container">
                            <table>
                              <thead>
                                <tr>
                                  <th>Вход</th>
                                  <th>Выход</th>
                                  <th>IP</th>
                                </tr>
                              </thead>
                              <tbody>
                                {history.logins.map((l, i) => (
                                  <tr key={i}>
                                    <td>{new Date(l.login_at).toLocaleString('ru-RU')}</td>
                                    <td>{l.logout_at ? new Date(l.logout_at).toLocaleString('ru-RU') : '—'}</td>
                                    <td>{l.ip_address || '—'}</td>
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
