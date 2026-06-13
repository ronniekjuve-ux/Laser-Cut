import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function ApplicationDetail({ app, onClose, onUpdate }) {
  const [fullApp, setFullApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPartInfo, setShowPartInfo] = useState(null);
  const [activeLayout, setActiveLayout] = useState(null);

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
  const totalParts = layouts.reduce((sum, l) => sum + (l.parts_count || 0), 0);

  const detailImages = data.detail_images ? (() => {
    try { return JSON.parse(data.detail_images); } catch { return []; }
  })() : [];

  return (
    <div className="modal-overlay active" onClick={onClose}>
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
                <div><span style={{fontWeight: 600}}>Марка стали:</span> {data.steel_grade || data.material || '-'}</div>
                <div><span style={{fontWeight: 600}}>Толщина:</span> {data.thickness ? data.thickness + ' мм' : '-'}</div>
                <div><span style={{fontWeight: 600}}>Вес:</span> {data.total_weight ? data.total_weight + ' кг' : '-'}</div>
                <div><span style={{fontWeight: 600}}>Раскладок:</span> {layouts.length}</div>
                <div><span style={{fontWeight: 600}}>Всего деталей:</span> {totalParts}</div>
                <div><span style={{fontWeight: 600}}>Дата:</span> {data.created_at ? new Date(data.created_at).toLocaleDateString('ru-RU') : '-'}</div>
                {data.comments && <div><span style={{fontWeight: 600}}>Комментарий:</span> {data.comments}</div>}
              </div>

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
                      <div><span style={{fontWeight: 600}}>Материал:</span> {data.material || '-'}</div>
                      <div><span style={{fontWeight: 600}}>Марка стали:</span> {data.steel_grade || data.material || '-'}</div>
                      <div><span style={{fontWeight: 600}}>Размер листа:</span> {layout.sheet_size}</div>
                      <div><span style={{fontWeight: 600}}>Вес листа:</span> {layout.sheet_weight ? layout.sheet_weight + ' кг' : '-'}</div>
                      <div><span style={{fontWeight: 600}}>Резка:</span> {layout.cut_time}</div>
                      <div><span style={{fontWeight: 600}}>Перемещение:</span> {layout.move_time}</div>
                      <div><span style={{fontWeight: 600}}>Проколы:</span> {layout.pierce_time}</div>
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
                            <tr key={pi} onClick={() => setShowPartInfo({...part, imageIndex: pi})} style={{cursor: 'pointer'}}>
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
        <div className="modal-overlay active" style={{zIndex: 1001}} onClick={() => setShowPartInfo(null)}>
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
