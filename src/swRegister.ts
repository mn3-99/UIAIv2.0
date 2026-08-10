export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('✅ ServiceWorker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('⚠️ ServiceWorker registration failed:', err);
        });
    });
  }
}
