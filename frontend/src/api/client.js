import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

// Device fingerprint generation
function getDeviceId() {
  const STORAGE_KEY = 'device_fingerprint';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (deviceId) return deviceId;

  // Generate fingerprint from canvas + user agent + screen
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();

    const components = [
      canvasData,
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.language
    ].join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < components.length; i++) {
      const char = components.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    deviceId = 'fp_' + Math.abs(hash).toString(36);
  } catch {
    deviceId = 'fp_' + Date.now().toString(36);
  }

  localStorage.setItem(STORAGE_KEY, deviceId);
  return deviceId;
}

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Send device fingerprint
  config.headers['X-Device-Id'] = getDeviceId();
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default client;
