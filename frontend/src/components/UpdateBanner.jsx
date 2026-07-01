import { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingSW, setWaitingSW] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reg;

    const checkForUpdates = async () => {
      try {
        reg = await navigator.serviceWorker.register('/sw.js');
        console.log('SW registered:', reg.scope);

        // Check for updates on load
        reg.update();

        // Listen for new SW installing
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
              setWaitingSW(newSW);
            }
          });
        });
      } catch (err) {
        console.log('SW registration failed:', err);
      }
    };

    checkForUpdates();
  }, []);

  const handleUpdate = () => {
    if (waitingSW) {
      waitingSW.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  if (!updateAvailable) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
      background: '#16a34a', color: '#fff', padding: '10px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, fontSize: 14, fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      Доступна новая версия!
      <button onClick={handleUpdate} style={{
        background: '#fff', color: '#16a34a', border: 'none',
        padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
        fontWeight: 700, fontSize: 13
      }}>
        Обновить
      </button>
    </div>
  );
}
