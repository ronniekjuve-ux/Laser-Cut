import { useState, useEffect } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import CostCalculator from './CostCalculator';

export default function ApplicationDetail({ app, onClose, onUpdate }) {
  const { user } = useAuth();
  const [fullApp, setFullApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartInfo, setShowPartInfo] = useState(null);
  const [activeLayout, setActiveLayout] = useState(null);
  const [showDeficitForm, setShowDeficitForm] = useState(false);
  const [deficitNote, setDeficitNote] = useState('');
  const [deficitSize, setDeficitSize] = useState('');
  const [deficitQty, setDeficitQty] = useState('');
  const [deficitSending, setDeficitSending] = useState(false);

  const highlightPart = app.highlightPart || null;

  const updateStatus = async (newStatus) => {
    try {
      await client.patch('/api/v1/applications/' + app.id + '/status?status=' + newStatus);
      setFullApp(prev => ({
        ...prev,
        application: { ...prev.application, status: newStatus }
      }));
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Ошибка смены статуса');
    }
  };

  const submitDeficit = async () => {
    setDeficitSending(true);
    try {
      const fd = new FormData();
      fd.append('material', data.material || data.steel_grade || '');
      fd.append('thickness', data.thickness ? String(data.thickness) : '');
      fd.append('size', deficitSize || '');
      fd.append('quantity', deficitQty || '');
      fd.append('note', deficitNote || '');
      await client.post('/api/v1/applications/' + app.id + '/deficit', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowDeficitForm(false);
      setDeficitNote('');
      alert('Заявка о нехватке металла отправлена');
    } catch (err) {
      alert('Ошибка: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeficitSending(false);
    }
  };

  useEffect(() => {
    const fetchFull = async () => {
      try {
        const res = await client.get('/api/v1/applications/' + app.id);
        setFullApp(res.data);
      } catch (err) {
        console.error('Failed to load application detail', err);
        setFullApp({ application: app, layouts: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchFull();
  }, [app.id]);

  // Автооткрытие раскладки с подсвечиваемой деталью
  useEffect(() => {
    if (!fullApp || !highlightPart || activeLayout !== null) return;
    const layouts = fullApp.layouts || [];
    for (let i = 0; i < layouts.length; i++) {
      const found = (layouts[i].parts || []).some(p => p.name === highlightPart);
      if (found) { setActiveLayout(i); break; }
    }
  }, [fullApp, highlightPart]);

  const handleDelete = async () => {
    if (!window.confirm('Удалить заявку?')) return;
    try {
      await client.delete('/api/v1/applications/' + app.id);
      onUpdate();
      onClose();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  if (loading) return (
    <div className="modal-overlay active">
      <div className="modal-content">
        <div className="modal-body" style={{textAlign: 'center', padding: 40}}>Загрузка...</div>
      </div>
    </div>
  );

  const data = fullApp ? (fullApp.application || fullApp) : app;
  const layouts = fullApp ? (fullApp.layouts || []) : [];
  const uniquePartTypes = layouts.reduce((sum, l) => sum + (l.parts_count || 0), 0);
  const totalPartsQty = layouts.reduce((sum, l) => {
    const partsQty = (l.parts || []).reduce((ps, p) => ps + (p.quantity || 0), 0);
    return sum + partsQty;
  }, 0);

  return (
    <div className="modal-overlay active" onClick={activeLayout !== null ? () => setActiveLayout(null) : onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{width: 800}}>
        <div className="modal-header">
          <h3>{data.order_name || 'Заявка'} #{data.id}</h3>
          <div>
            {activeLayout !== null && (
              <span className="btn" style={{marginRight: 8, cursor: 'pointer'}} onClick={() => setActiveLayout(null)}>
                ⬅ Назад к заявке
              </span>
            )}
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          {activeLayout === null ? (
            <>
              <div style={{marginBottom: 12}}>
                <div><span style={{fontWeight: 600}}>Заказчик:</span> {data.customer || '-'}</div>
                <div><span style={{fontWeight: 600}}>Материал:</span> {data.material || data.steel_grade || '-'}</div>
                <div><span style={{fontWeight: 600}}>Толщина:</span> {data.thickness ? data.thickness + ' мм' : '-'}</div>
                <div><span style={{fontWeight: 600}}>Вес:</span> {data.total_weight ? data.total_weight + ' кг' : '-'}</div>
                <div><span style={{fontWeight: 600}}>Раскладок:</span> {layouts.length}</div>
                <div><span style={{fontWeight: 600}}>Видов деталей:</span> {uniquePartTypes}</div>
                <div><span style={{fontWeight: 600}}>Всего деталей:</span> {totalPartsQty}</div>
                <div><span style={{fontWeight: 600}}>Дата:</span> {data.created_at ? new Date(data.created_at).toLocaleDateString('ru-RU') : '-'}</div>
                {data.comments && <div><span style={{fontWeight: 600}}>Комментарий:</span> {data.comments}</div>}
              </div>

              {layouts.length > 0 && ['pending', 'rejected'].includes(data.status) && (
                <CostCalculator
                  layouts={layouts}
                  supply_material={data.supply_material}
                  thickness={data.thickness}
                  steel_grade={data.steel_grade || data.material}
                />
              )}

              {data.status === 'pending' && user?.role === 'admin' && (
                <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                  <div style={{fontWeight: 600, marginBottom: 8}}>Решение:</div>
                  <div style={{display: 'flex', gap: 8}}>
                    <button
                      onClick={() => updateStatus('approved')}
                      style={{
                        padding: '8px 18px', borderRadius: 6, border: '1px solid #86efac',
                        background: '#dcfce7', color: '#166534', fontWeight: 600,
                        cursor: 'pointer', fontSize: 13
                      }}
                    >
                      ✅ Утвердить
                    </button>
                    <button
                      onClick={() => updateStatus('rejected')}
                      style={{
                        padding: '8px 18px', borderRadius: 6, border: '1px solid #fca5a5',
                        background: '#fee2e2', color: '#991b1b', fontWeight: 600,
                        cursor: 'pointer', fontSize: 13
                      }}
                    >
                      ❌ Отклонить
                    </button>
                  </div>
                </div>
              )}

              {data.status === 'rejected' && user?.role === 'admin' && (
                <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                  <div style={{fontWeight: 600, marginBottom: 8}}>Решение:</div>
                  <button
                    onClick={() => updateStatus('approved')}
                    style={{
                      padding: '8px 18px', borderRadius: 6, border: '1px solid #86efac',
                      background: '#dcfce7', color: '#166534', fontWeight: 600,
                      cursor: 'pointer', fontSize: 13
                    }}
                  >
                    ✅ Утвердить
                  </button>
                </div>
              )}

              {(user?.role === 'admin' || user?.role === 'operator') && ['approved', 'in_progress', 'partially_cut', 'cut'].includes(data.status) && (
                <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                  <div style={{fontWeight: 600, marginBottom: 8}}>Статус:</div>
                  <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                    {[
                      { key: 'in_progress', label: 'В резке', bg: '#dbeafe', color: '#1d4ed8' },
                      { key: 'partially_cut', label: 'Частично вырезано', bg: '#fef3c7', color: '#92400e' },
                      { key: 'cut', label: 'Вырезано', bg: '#dcfce7', color: '#166534' },
                    ].map(s => (
                      <button
                        key={s.key}
                        onClick={() => updateStatus(s.key)}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: '2px solid',
                          borderColor: data.status === s.key ? s.color : 'transparent',
                          background: data.status === s.key ? s.bg : '#f8fafc',
                          color: s.color, fontWeight: data.status === s.key ? 700 : 400,
                          cursor: 'pointer', fontSize: 13
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(user?.role === 'operator') && (
                <div style={{marginBottom: 16, padding: '10px 0', borderTop: '1px solid var(--border)'}}>
                  {!showDeficitForm ? (
                    <button
                      className="btn"
                      onClick={() => {
                        const firstLayout = layouts[0];
                        setDeficitSize(firstLayout ? firstLayout.sheet_size : '');
                        setDeficitQty(firstLayout ? String(firstLayout.sheet_count || 1) : '1');
                        setDeficitNote('');
                        setShowDeficitForm(true);
                      }}
                      style={{background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d'}}
                    >
                      ⚠️ Заказать материал
                    </button>
                  ) : (
                    <div style={{padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6}}>
                      <div style={{fontWeight: 600, marginBottom: 6}}>Нехватка металла</div>
                      <div style={{fontSize: 13, color: '#64748b', marginBottom: 6}}>
                        Материал: {data.material || data.steel_grade || '-'}, Толщина: {data.thickness || '-'} мм
                      </div>
                      <div style={{display: 'flex', gap: 8, marginBottom: 6}}>
                        <div style={{flex: 1}}>
                          <label style={{fontSize: 12, color: '#64748b'}}>Размер листа</label>
                          <input
                            value={deficitSize}
                            onChange={e => setDeficitSize(e.target.value)}
                            placeholder="1500x6000"
                            style={{width: '100%', padding: 4, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box'}}
                          />
                        </div>
                        <div style={{width: 80}}>
                          <label style={{fontSize: 12, color: '#64748b'}}>Кол-во</label>
                          <input
                            type="number"
                            value={deficitQty}
                            onChange={e => setDeficitQty(e.target.value)}
                            placeholder="1"
                            style={{width: '100%', padding: 4, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box'}}
                          />
                        </div>
                      </div>
                      <textarea
                        value={deficitNote}
                        onChange={e => setDeficitNote(e.target.value)}
                        placeholder="Комментарий (необязательно)"
                        style={{width: '100%', padding: 6, border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, minHeight: 50, boxSizing: 'border-box'}}
                      />
                      <div style={{display: 'flex', gap: 6, marginTop: 6}}>
                        <button className="btn btn-primary" onClick={submitDeficit} disabled={deficitSending}>
                          {deficitSending ? 'Отправка...' : 'Отправить'}
                        </button>
                        <button className="btn" onClick={() => { setShowDeficitForm(false); setDeficitNote(''); }}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {layouts.length > 0 && (
                <div style={{marginTop: 16}}>
                  <h4>Раскладки</h4>
                  {layouts.map((layout, li) => (
                    <div
                      key={layout.id || li}
                      style={{padding: 10, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8, cursor: 'pointer'}}
                      onClick={() => setActiveLayout(li)}
                    >
                      <div style={{display: 'flex', justifyContent: 'space-between'}}>
                        <strong>{layout.layout_code ? ('Раскладка ' + layout.layout_code) : ('Раскладка ' + (li + 1))}</strong>
                        <span style={{fontSize: 12, color: '#64748b'}}>
                          {layout.machine_type || ''} | {layout.sheet_size} | Деталей: {layout.parts_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            (() => {
              const layout = layouts[activeLayout];
              if (!layout) return null;

              const layoutImg = layout.layout_image;

              return (
                <div>
                  <div style={{display: 'flex', gap: 20, alignItems: 'flex-start'}}>
                    <div style={{flex: '0 0 65%'}}>
                      {layoutImg ? (
                        <img src={layoutImg} alt={layout.layout_code} style={{width: '100%', borderRadius: 6, border: '1px solid var(--border)'}} />
                      ) : (
                        <div style={{background: '#f1f5f9', borderRadius: 6, padding: 60, textAlign: 'center', color: '#94a3b8'}}>Раскладка</div>
                      )}
                    </div>
                    <div style={{flex: 1, fontSize: 13}}>
                      <div><span style={{fontWeight: 600}}>Материал:</span> {data.material || data.steel_grade || '-'}</div>
                      <div><span style={{fontWeight: 600}}>Размер листа:</span> {layout.sheet_size}</div>
                      <div><span style={{fontWeight: 600}}>Вес листа:</span> {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'}</div>
                      <div><span style={{fontWeight: 600}}>Резка (время):</span> {layout.cut_time}</div>
                      <div><span style={{fontWeight: 600}}>Перемещение (время):</span> {layout.move_time}</div>
                      <div><span style={{fontWeight: 600}}>Проколы (время):</span> {layout.pierce_time}</div>
                      {layout.cut_length != null && <div><span style={{fontWeight: 600}}>Резка (мм):</span> {layout.cut_length}</div>}
                      {layout.travel_length != null && <div><span style={{fontWeight: 600}}>Перемещение (мм):</span> {layout.travel_length}</div>}
                      {layout.pierces != null && <div><span style={{fontWeight: 600}}>Кол-во проколов:</span> {layout.pierces}</div>}
                    </div>
                  </div>

                  {layout.parts && layout.parts.length > 0 && (
                    <div style={{marginTop: 12}}>
                      <h4>Список деталей ({layout.parts.length})</h4>
                      <table className="parts-table">
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>DX</th>
                            <th>DY</th>
                            <th>Кол-во</th>
                            <th>Вес, кг</th>
                          </tr>
                        </thead>
                        <tbody>
                          {layout.parts.map((part, pi) => (
                            <tr key={pi} onClick={() => setShowPartInfo(part)} style={{
                              cursor: 'pointer',
                              background: highlightPart && part.name === highlightPart ? '#fef08a' : undefined
                            }}>
                              <td><span className="part-link">{part.name || ''}</span></td>
                              <td>{part.dx || '-'}</td>
                              <td>{part.dy || '-'}</td>
                              <td>{part.quantity || '-'}</td>
                              <td>{part.weight != null ? part.weight.toFixed(3) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-danger" onClick={handleDelete}>Удалить</button>
          <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      {showPartInfo && (
        <div className="modal-overlay active" style={{zIndex: 1001}} onClick={(e) => { e.stopPropagation(); setShowPartInfo(null); }}>
          <div className="modal-content" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{showPartInfo.name || ''}</h3>
              <button className="close-btn" onClick={() => setShowPartInfo(null)}>✕</button>
            </div>
            <div className="modal-body" style={{textAlign: 'center'}}>
              {showPartInfo.image_path ? (
                <img src={showPartInfo.image_path} alt={showPartInfo.name} style={{maxWidth: '100%', maxHeight: 400, borderRadius: 6}} />
              ) : (
                <div style={{padding: 40, color: '#94a3b8', background: '#f1f5f9', borderRadius: 6}}>
                  Изображение детали недоступно
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowPartInfo(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
