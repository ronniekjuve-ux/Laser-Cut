import { useState, useMemo } from 'react';

export default function CostCalculator({ layouts, supply_material, thickness, steel_grade, total_weight, weight_source, parts_weight }) {
  const [pricePerCut, setPricePerCut] = useState('');
  const [pricePerPierce, setPricePerPierce] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [customOtherWeight, setCustomOtherWeight] = useState('');
  const [weightSource, setWeightSource] = useState('auto'); // 'auto' | 'sheet' | 'parts' | 'custom'

  const totals = useMemo(() => {
    let cutLength = 0;
    let pierces = 0;
    let sheetWeight = 0;
    let partsWeight = 0;
    for (const l of (layouts || [])) {
      cutLength += l.cut_length || 0;
      pierces += l.pierces || 0;
      sheetWeight += (l.sheet_weight || 0) * (l.sheet_count || 1);
      partsWeight += (l.parts || []).reduce((sum, p) => sum + (p.weight || 0) * (p.quantity || 0), 0);
    }
    return { cutLength, pierces, sheetWeight, partsWeight };
  }, [layouts]);

  const cutLengthMeters = totals.cutLength / 1000;
  const cutCost = (parseFloat(pricePerCut) || 0) * cutLengthMeters;
  const pierceCost = (parseFloat(pricePerPierce) || 0) * totals.pierces;

  const effectivePartsWeight = parts_weight || totals.partsWeight;

  const effectiveWeight = useMemo(() => {
    if (weightSource === 'sheet') return total_weight || 0;
    if (weightSource === 'parts') return effectivePartsWeight || 0;
    if (weightSource === 'custom') return parseFloat(customOtherWeight) || 0;
    // auto: prefer file weight, then sheet, then parts
    return total_weight || totals.sheetWeight || effectivePartsWeight;
  }, [weightSource, customOtherWeight, total_weight, effectivePartsWeight, totals]);

  const materialCost = (parseFloat(pricePerKg) || 0) * effectiveWeight;
  const totalCost = cutCost + pierceCost + materialCost;

  const fmt = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const hasFileWeight = total_weight != null && total_weight > 0;
  const isCalculated = weight_source === 'calculated';

  return (
    <div style={{
      marginTop: 16, padding: 16, background: '#f0f9ff', border: '1px solid #bae6fd',
      borderRadius: 8, fontSize: 13
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Предварительный расчёт</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 12 }}>
        <div>
          <span style={{ color: '#64748b' }}>Суммарная длина реза: </span>
          <b>{cutLengthMeters.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} м</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Кол-во проколов: </span>
          <b>{totals.pierces}</b>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', color: '#64748b', marginBottom: 2, fontSize: 12 }}>
            Цена за м реза (руб.)
          </label>
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
      </div>

      <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Данные по материалу</div>
        <div style={{ color: '#64748b', marginBottom: 8 }}>
          {steel_grade && <span>Марка: <b>{steel_grade}</b> · </span>}
          {thickness && <span>Толщина: <b>{thickness} мм</b> · </span>}
          {hasFileWeight && (
            <span>Вес листа: <b>{fmt(total_weight)} кг</b>{isCalculated ? ' (расчёт)' : ''} · </span>
          )}
          {effectivePartsWeight > 0 && <span>Вес деталей: <b>{fmt(effectivePartsWeight)} кг</b></span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
          {[
            { key: 'auto', label: 'Авто' },
            ...(hasFileWeight ? [{ key: 'sheet', label: 'Вес листа' }] : []),
            ...(parts_weight != null ? [{ key: 'parts', label: 'Вес деталей' }] : []),
            { key: 'custom', label: 'Другой' },
          ].map(opt => (
            <div
              key={opt.key}
              onClick={() => setWeightSource(opt.key)}
              style={{
                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: 'pointer', textAlign: 'center',
                background: weightSource === opt.key ? '#1d4ed8' : '#f8fafc',
                color: weightSource === opt.key ? '#fff' : '#64748b',
                border: '1px solid ' + (weightSource === opt.key ? '#1d4ed8' : '#e2e8f0'),
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>

        {weightSource === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Другой вес (кг):</label>
            <input
              type="number"
              value={customOtherWeight}
              onChange={e => setCustomOtherWeight(e.target.value)}
              placeholder="0"
              style={{ width: 100, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
            />
          </div>
        )}

        <div style={{ fontSize: 12, color: '#64748b' }}>
          Используется вес: <b>{fmt(effectiveWeight)} кг</b>
          {weightSource === 'auto' && <span> (авто{hasFileWeight ? ' — из файла' : ''})</span>}
          {weightSource === 'sheet' && <span> (лист)</span>}
          {weightSource === 'parts' && <span> (детали)</span>}
          {weightSource === 'custom' && <span> (другой)</span>}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
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
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>Материал</div>
          <div>{fmt(materialCost)} руб.</div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>ИТОГО</div>
          <div style={{ fontSize: 16, color: '#1d4ed8' }}>{fmt(totalCost)} руб.</div>
        </div>
      </div>
    </div>
  );
}
