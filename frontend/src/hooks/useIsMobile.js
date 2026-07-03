import { useState, useEffect } from 'react';

const FORCE_KEY = 'laser_force_mobile';

export function getForceMobile() {
  return localStorage.getItem(FORCE_KEY) === 'true';
}

export function setForceMobile(val) {
  if (val) {
    localStorage.setItem(FORCE_KEY, 'true');
  } else {
    localStorage.removeItem(FORCE_KEY);
  }
}

export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (getForceMobile()) return true;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    if (getForceMobile()) {
      setIsMobile(true);
      return;
    }
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
