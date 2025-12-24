// Este Service Worker se auto-destruye para limpiar cualquier SW viejo
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.registration.unregister().then(() => {
    console.log('Service Worker eliminado');
  });
  // Limpiar todos los caches
  caches.keys().then(names => {
    names.forEach(name => caches.delete(name));
  });
});
