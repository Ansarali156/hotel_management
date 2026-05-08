// Clear Service Worker Script
// Run this in browser console to unregister service workers during development

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister().then(function(boolean) {
        console.log('✅ Service Worker unregistered:', boolean);
      });
    }
  });
}

// Clear all caches
caches.keys().then(function(names) {
  for (let name of names) {
    caches.delete(name).then(function(boolean) {
      console.log('✅ Cache deleted:', name, boolean);
    });
  }
});

console.log('🔄 Service workers and caches cleared! Please refresh the page.');
