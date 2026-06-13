import { useState } from 'react';

const initialItems = [
  { id: 1, material: 'Steel', grade: 'St3', thickness: '2.0', size: '1500x6000', qty: 15, customer: 'ПромСтальМаш', status: 'Ожидает', note: '' },
];

export default function Deficit() {
  const [items, setItems] = useState(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ material: '', grade: '', thickness: '', size: '', qty: '', customer: '', note: '' });

  const handleAdd = () => {
    if (!form.material || !form.thickness) return;
    setItems([...items, { id: Date.now(), ...form, qty: parseInt(form.qty) || 0, status: 'Ожидает' }]);
    setForm({ material: '', grade: '', thickness: '', size: '', qty: '', customer: '', note: '' });
    setShowForm(false);
  };

  const handleDelete = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Заявить о нехватке'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom: 15}}>
          <h3>Новая заявка о дефиците</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Материал</label>
              <input value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="Steel" />
            </div>
            <div className="form-group">
              <label>Марка</label>
              <input value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} placeholder="St3" />
            </div>
            <div className="form-group">
              <label>Толщина, мм</label>
              <input value={form.thickness} onChange={e => setForm({...form, thickness: e.target.value})} placeholder="2.0" />
            </div>
            <div className="form-group">
              <label>Размер</label>
              <input value={form.size} onChange={e => setForm({...form, size: e.target.value})} placeholder="1500x6000" />
            </div>
            <div className="form-group">
              <label>Количество</label>
              <input type="number" value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} placeholder="15" />
            </div>
            <div className="form-group">
              <label>Заказчик</label>
              <input value={form.customer} onChange={e => setForm({...form, customer: e.target.value})} placeholder="ПромСтальМаш" />
            </div>
          </div>
          <div className="form-group">
            <label>Примечание</label>
            <input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Дополнительно..." />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} style={{marginTop: 10}}>Добавить</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Материал</th>
              <th>Марка</th>
              <th>Толщ.</th>
              <th>Размер</th>
              <th>Кол-во</th>
              <th>Заказчик</th>
              <th>Статус</th>
              <th>Примечание</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: 'center', padding: 20}}>Нет заявок о дефиците</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td>{item.material}</td>
                <td>{item.grade}</td>
                <td>{item.thickness}</td>
                <td>{item.size}</td>
                <td>{item.qty}</td>
                <td>{item.customer}</td>
                <td><span className="badge bg-queue">{item.status}</span></td>
                <td>{item.note}</td>
                <td>
                  <button className="btn btn-danger" onClick={() => handleDelete(item.id)} style={{padding: '4px 8px', fontSize: 11}}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}