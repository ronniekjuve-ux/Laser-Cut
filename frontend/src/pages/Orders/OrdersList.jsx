import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const fetchOrders = useCallback(async () => {
    try {
      const res = await client.get('/api/v1/orders/');
      setOrders(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'done' || s === '\u0433\u043e\u0442\u043e\u0432\u043e') return 'badge bg-done';
    if (s === 'in_progress' || s === '\u0432 \u0440\u0430\u0431\u043e\u0442\u0435') return 'badge bg-in_progress';
    return 'badge bg-pending';
  };

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    const text = [o.number, o.customer_name, o.object_name, o.steel_grade, o.status].join(' ').toLowerCase();
    return text.includes(q);
  }).sort((a, b) => {
    if (!sortCol) return 0;
    const va = a[sortCol] || '';
    const vb = b[sortCol] || '';
    const cmp = String(va).localeCompare(String(vb), 'ru');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) return <div className="loading">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'}</div>;

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          placeholder={'\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('number')}>
                {'\u041d\u043e\u043c\u0435\u0440'}
                {sortCol === 'number' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('customer_name')}>
                {'\u0417\u0430\u043a\u0430\u0437\u0447\u0438\u043a'}
                {sortCol === 'customer_name' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('object_name')}>
                {'\u041e\u0431\u044a\u0435\u043a\u0442'}
                {sortCol === 'object_name' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('steel_grade')}>
                {'\u041c\u0430\u0440\u043a\u0430 \u0441\u0442\u0430\u043b\u0438'}
                {sortCol === 'steel_grade' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('status')}>
                {'\u0421\u0442\u0430\u0442\u0443\u0441'}
                {sortCol === 'status' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('created_at')}>
                {'\u0414\u0430\u0442\u0430'}
                {sortCol === 'created_at' && <span className="sort-indicator">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(order => (
              <tr key={order.id}>
                <td>{order.number || order.id}</td>
                <td>{order.customer_name || '-'}</td>
                <td>{order.object_name || '-'}</td>
                <td>{order.steel_grade || '-'}</td>
                <td>
                  <span className={getStatusBadge(order.status)}>
                    {order.status || '\u0412 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u0438'}
                  </span>
                </td>
                <td>{order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{textAlign: 'center', padding: 20, color: '#64748b'}}>
                  {'\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}