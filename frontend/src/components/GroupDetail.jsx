import { useState, useEffect } from 'react';
import client from '../api/client';
import ConfirmModal from './ConfirmModal';

export default function GroupDetail({ groupId, onClose, onRefresh, onOpenApp }) {
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState(null);

  const fetchGroup = async () => {
    try {
      const res = await client.get('/api/v1/applications/group/' + groupId);
      setGroup(res.data);
    } catch (err) {
      console.error('Failed to load group', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroup(); }, [groupId]);

  const handleRemoveApp = async (appId) => {
    setConfirmRemove(null);
    try {
      await client.patch('/api/v1/applications/group/' + groupId + '/apps', { remove: [appId] });
      fetchGroup();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const handleDeleteGroup = async () => {
    setConfirmDeleteGroup(false);
    try {
      await client.delete('/api/v1/applications/group/' + groupId);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      alert('Ошибка');
    }
  };

  const handleRename = async () => {
    const name = prompt('Введите название группы:', group?.group?.name || '');
    if (name === null) return;
    try {
      await client.patch('/api/v1/applications/group/' + groupId + '/apps', {});
      setGroup(prev => ({ ...prev, group: { ...prev.group, name } }));
    } catch (err) {
      alert('Ошибка');
    }
  };

  const handleOpenApp = (appId) => {
    console.log('CLICKED APP:', appId, 'onOpenApp:', !!onOpenApp);
    if (onOpenApp) {
      onOpenApp({ id: appId });
    }
  };

  if (loading) return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-body" style={{textAlign: 'center', padding: 40}}>Загрузка...</div>
      </div>
    </div>
  );

  if (!group) return null;

  const { group: info, applications: apps, summary } = group;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 800}}>
        <div className="modal-header">
          <h3>
            <span
              onClick={handleRename}
              style={{cursor: 'pointer'}}
              title="Нажмите, чтобы переименовать"
            >
              {info.name || `Группа #${info.id}`}
            </span>
          </h3>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body">
          <div style={{display: 'flex', gap: 20, marginBottom: 16, fontSize: 13}}>
            <div><span style={{fontWeight: 600}}>Заявок:</span> {summary.total_apps}</div>
            <div><span style={{fontWeight: 600}}>Вес:</span> {summary.total_weight ? summary.total_weight.toFixed(1) + ' кг' : '-'}</div>
            <div><span style={{fontWeight: 600}}>Деталей:</span> {summary.total_parts}</div>
            <div><span style={{fontWeight: 600}}>Видов:</span> {summary.total_types}</div>
          </div>

          <div style={{maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6}}>
            <table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{background: '#f8fafc', position: 'sticky', top: 0}}>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>№</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Заказчик</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Материал</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Толщ.</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Станок</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Статус</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}>Прогресс</th>
                  <th style={{padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)'}}></th>
                </tr>
              </thead>
              <tbody>
                {apps.map(app => (
                  <tr key={app.id}
                    style={{background: '#fff', cursor: 'pointer'}}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenApp(app.id); }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: '#64748b'}}>
                      #{app.id}
                    </td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>{app.customer}</td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>{app.material}</td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>{app.thickness} мм</td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>{app.machine || '-'}</td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>
                      <span className={'badge ' + (
                        app.status === 'cut' ? 'bg-done' :
                        app.status === 'in_progress' || app.status === 'partially_cut' ? 'bg-work' : 'bg-approved'
                      )}>
                        {app.status === 'cut' ? 'Вырезано' :
                         app.status === 'in_progress' ? 'В резке' :
                         app.status === 'partially_cut' ? 'Частично' :
                         app.status === 'approved' ? 'В очереди' : app.status}
                      </span>
                    </td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>
                      {app.layouts_count > 0 ? (
                        <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                          <div style={{width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden'}}>
                            <div style={{width: app.progress_pct + '%', height: '100%', background: app.progress_pct === 100 ? '#22c55e' : '#3b82f6'}}/>
                          </div>
                          <span style={{fontSize: 10, color: '#64748b'}}>{app.progress_pct}%</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{padding: '6px 8px', borderBottom: '1px solid var(--border)'}}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmRemove(app.id); }}
                        style={{border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11}}
                      >
                        Убрать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger" onClick={() => setConfirmDeleteGroup(true)}>
            Удалить группу
          </button>
          <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Убрать заявку из группы?"
          message="Заявка останется в системе, но будет отвязана от группы."
          confirmText="Убрать"
          danger={false}
          onConfirm={() => handleRemoveApp(confirmRemove)}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {confirmDeleteGroup && (
        <ConfirmModal
          title="Удалить группу?"
          message="Группа будет удалена. Все заявки останутся в системе."
          onConfirm={handleDeleteGroup}
          onCancel={() => setConfirmDeleteGroup(false)}
        />
      )}
    </div>
  );
}
