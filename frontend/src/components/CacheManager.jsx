import { useState, useEffect, useRef } from 'react';

export default function CacheManager() {
  const [open, setOpen] = useState(false);
  const [swStatus, setSwStatus] = useState('...');
  const [checking, setChecking] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const getStatus = async () => {
      if (!('serviceWorker' in navigator)) {
        setSwStatus('Не поддерживается');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setSwStatus('Не зарегистрирован');
        return;
      }
      if (reg.waiting) {
        setSwStatus('Ожидает активации');
      } else if (reg.active) {
        setSwStatus('Активен');
      } else {
        setSwStatus('Устанавливается...');
      }
    };
    getStatus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        // Re-check status after update
        setTimeout(async () => {
          const updated = await navigator.serviceWorker.getRegistration();
          if (updated?.waiting) {
            setSwStatus('Ожидает активации');
          } else if (updated?.active) {
            setSwStatus('Активен (актуальная версия)');
          }
          setChecking(false);
        }, 1000);
      } else {
        setSwStatus('Не зарегистрирован');
        setChecking(false);
      }
    } catch {
      setChecking(false);
    }
  };

  const clearCache = async () => {
    // Clear all caches directly, then reload
    try {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    } catch {}
    window.location.reload();
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          cursor: 'pointer', fontSize: 18, padding: '4px 6px',
          borderRadius: 6, display: 'inline-block',
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
        onMouseLeave={(e) => e.target.style.background = 'transparent'}
        title="Настройки кэша"
      >
        ⚙️
      </span>

      {open && (
        <div style={{
          position: 'absolute', top: 35, right: 0, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          width: 240, zIndex: 1001, overflow: 'hidden'
        }}>
          <div style={{
            padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid #e2e8f0',
            fontSize: 13, color: '#334155'
          }}>
            Управление кэшем
          </div>

          <div style={{ padding: '6px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
            Статус SW: <span style={{ fontWeight: 600, color: '#334155' }}>{swStatus}</span>
          </div>

          <div
            onClick={checkUpdates}
            style={{
              padding: '10px 12px', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid #f1f5f9'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            🔄 {checking ? 'Проверка...' : 'Проверить обновления'}
          </div>

          <div
            onClick={clearCache}
            style={{
              padding: '10px 12px', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
              color: '#dc2626'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            🗑 Очистить кэш и перезагрузить
          </div>
        </div>
      )}
    </div>
  );
}
