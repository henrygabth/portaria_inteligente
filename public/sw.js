// Service worker da Portaria Inteligente.
// - /api NUNCA vai para o cache (pedidos, liberações e mensagens são sempre ao vivo).
// - Páginas: rede primeiro; sem internet, mostra a última versão salva ou offline.html.
// - CSS, JS e imagens: entrega o que está salvo e atualiza em segundo plano.
const VERSAO = 'pi-v2';
const ESSENCIAIS = ['/offline.html', '/css/acessibilidade.css', '/js/general/acessibilidade.js',
    '/img/icones/icone-192.png', '/img/logo_pi.png', '/manifest.webmanifest'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys()
        .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;           // VLibras, fontes, CDNs: direto na rede
    if (url.pathname.startsWith('/api/')) return;              // dados sempre ao vivo
    if (req.headers.get('accept') === 'text/event-stream') return;

    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then(resp => {
            if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
            return resp;
        }).catch(() => caches.match(req).then(r => r || caches.match('/offline.html'))));
        return;
    }
    e.respondWith(caches.open(VERSAO).then(cache => cache.match(req).then(salvo => {
        const rede = fetch(req).then(resp => { if (resp.ok) cache.put(req, resp.clone()); return resp; }).catch(() => salvo);
        return salvo || rede;
    })));
});

// ------------------------------------------------------------------ notificações (Web Push)
self.addEventListener('push', e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data && e.data.text() }; }
    const titulo = d.titulo || 'Portaria Inteligente';
    e.waitUntil(self.registration.showNotification(titulo, {
        body: d.corpo || '',
        icon: '/img/icones/icone-192.png',
        badge: '/img/icones/icone-192.png',
        tag: d.tag || undefined,
        renotify: !!d.tag,
        requireInteraction: !!d.urgente,
        vibrate: d.urgente ? [200, 100, 200, 100, 300] : [150],
        lang: 'pt-BR',
        data: { url: d.url || '/' }
    }));
});

// Toque na notificação: abre (ou traz para frente) a tela certa.
self.addEventListener('notificationclick', e => {
    e.notification.close();
    const destino = new URL(e.notification.data && e.notification.data.url || '/', self.location.origin).href;
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
        const mesma = janelas.find(j => j.url.split('?')[0] === destino.split('?')[0]);
        if (mesma) return mesma.focus().then(j => (j && j.navigate ? j.navigate(destino) : j));
        return self.clients.openWindow(destino);
    }));
});
