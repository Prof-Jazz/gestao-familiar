// Service worker mínimo: sempre busca a versão mais nova dos arquivos do app
// (revalida com o servidor) e só usa a cópia guardada se estiver sem internet.
const CACHE = 'gf-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp.ok) { const c = await caches.open(CACHE); c.put(req, resp.clone()); }
      return resp;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
