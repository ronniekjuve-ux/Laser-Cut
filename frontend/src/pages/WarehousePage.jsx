import { useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import Warehouse from './Warehouse/Warehouse';
import Deficit from './Deficit';

const TABS = [
  { key: 'warehouse', label: 'Склад' },
  { key: 'deficit', label: 'Дефицит' },
];

export default function WarehousePage() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('warehouse');

  if (!isMobile) {
    return <Warehouse />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 12 }}>
        {TABS.map(tab => (
          <div
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--primary)' : '#64748b',
              marginBottom: -2,
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {activeTab === 'warehouse' && <Warehouse />}
      {activeTab === 'deficit' && <Deficit />}
    </div>
  );
}
