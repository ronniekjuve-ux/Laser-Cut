import { useState, useMemo } from 'react';

export default function CostCalculator({ layouts, supply_material, thickness, steel_grade, showMeters }) {
  const [pricePerCut, setPricePerCut] = useState('');
  const [pricePerPierce, setPricePerPierce] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');

  const totals = useMemo(() => {
    let cutLength = 0;
    let pierces = 0;
    let sheetWeight = 0;
    let sheetW = 0;
    let sheetH = 0;
    for (const l of (layouts || [])) {
      cutLength += l.cut_length || 0;
      pierces += l.pierces || 0;
      if (!sheetWeight) sheetWeight = l.sheet_weight || l.parts_weight || 0;
      if (!sheetW && l.sheet_w) sheetW = l.sheet_w;
      if (!sheetH && l.sheet_h) sheetH = l.sheet_h;
    }
    return { cutLength, pierces, sheetWeight, sheetW, sheetH };
  }, [layouts]);

  const cutCost = (parseFloat(pricePerCut) || 0) * totals.cutLength;
  const pierceCost = (parseFloat(pricePerPierce) || 0) * totals.pierces;
  const materialCost = !supply_material ? (parseFloat(pricePerKg) || 0) * totals.sheetWeight : 0;
  const totalCost = cutCost + pierceCost + materialCost;

  const fmt = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div style={{
      marginTop: 16, padding: 16, background: '#f0f9ff', border: '1px solid #bae6fd',
      borderRadius: 8, fontSize: 13
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Предварительный расчёт</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
        <div>
          <span style={{ color: '#64748b' }}>Суммарная длина реза: </span>
          <b>{showMeters ? (totals.cutLength / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 4 }) + ' м' : fmt(totals.cutLength) + ' мм'}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Кол-во проколов: </span>
          <b>{totals.pierces}</b>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', color: '#64748b', marginBottom: 2, fontSize: 12 }}>Цена за мм реза (руб.)</label>
          <input
            type="number"
            value={pricePerCut}
            onChange={e => setPricePerCut(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', color: '#64748b', marginBottom: 2, fontSize: 12 }}>Цена за прокол (руб.)</label>
          <input
            type="number"
            value={pricePerPierce}
            onChange={e => setPricePerPierce(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        {!supply_material && (
          <div>
            <label style={{ display: 'block', color: '#64748b', marginBottom: 2, fontSize: 12 }}>Цена за кг материала (руб.)</label>
            <input
              type="number"
              value={pricePerKg}
              onChange={e => setPricePerKg(e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {!supply_material && totals.sheetWeight > 0 && (
        <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Данные по материалу</div>
          <div style={{ color: '#64748b' }}>
            {steel_grade && <span>Марка: <b>{steel_grade}</b> · </span>}
            {thickness && <span>Толщина: <b>{thickness} мм</b> · </span>}
            {totals.sheetW > 0 && totals.sheetH > 0 && <span>Лист: <b>{totals.sheetW}×{totals.sheetH} мм</b> · </span>}
            <span>Вес листа: <b>{fmt(totals.sheetWeight)} кг</b></span>
          </div>
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: !supply_material ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr',
        gap: 8, padding: '10px 12px', background: '#e0f2fe', borderRadius: 6, fontWeight: 600
      }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>Резка</div>
          <div>{fmt(cutCost)} руб.</div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>Проколы</div>
          <div>{fmt(pierceCost)} руб.</div>
        </div>
        {!supply_material && (
          <div>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>Материал</div>
            <div>{fmt(materialCost)} руб.</div>
          </div>
        )}
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>ИТОГО</div>
          <div style={{ fontSize: 16, color: '#1d4ed8' }}>{fmt(totalCost)} руб.</div>
        </div>
      </div>
    </div>
  );
}
