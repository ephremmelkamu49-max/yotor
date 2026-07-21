self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Must use respondWith to satisfy Chrome's PWA installable criteria
  e.respondWith(
    fetch(e.request).catch(() => {
      const url = new URL(e.request.url);
      const isApi = url.pathname.startsWith('/api/') || e.request.headers.get('accept')?.includes('json');
      
      if (isApi) {
        return new Response(
          JSON.stringify({ 
            error: "Offline Mode", 
            offline: true,
            prompt: "Offline Mode: Please check your internet connection.", // in case they call /api/generate-prompt
            scenes: [] // in case they call /api/analyze-script
          }), 
          { 
            status: 503, 
            headers: { 'Content-Type': 'application/json' } 
          }
        );
      }
      return new Response("Offline Mode");
    })
  );
});
