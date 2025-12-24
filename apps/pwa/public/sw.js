// Service Worker - Solo para limpieza de SW antiguos
// NO cachea nada para evitar problemas con Firebase Storage

self.addEventListener('install', () => {
  console.log('SW: Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activating...');
  event.waitUntil(
    Promise.all([
      // Tomar control de todos los clientes
      self.clients.claim(),
      // Limpiar todos los caches antiguos
      caches.keys().then(names => {
        return Promise.all(
          names.map(name => {
            console.log('SW: Deleting cache:', name);
            return caches.delete(name);
          })
        );
      })
    ])
  );
});

// NO interceptar peticiones de fetch - dejar que pasen directo
// Esto evita problemas de CORS con Firebase Storage
self.addEventListener('fetch', (event) => {
  // No hacer nada - dejar que la petición pase normalmente
  return;
});
