import { useState, useEffect } from 'react';

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstall(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  if (!showInstall) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#3b82f6', color: '#fff', padding: '12px 20px',
      borderRadius: 12, boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
      cursor: 'pointer', fontSize: 14, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 8,
      animation: 'slideUp 0.3s ease'
    }} onClick={handleInstall}>
      📲 Установить приложение
    </div>
  );
}