// 포토 월드맵 서비스워커
// - 우리 사이트 파일만 캐시 (쿠팡 광고·CDN 등 외부 요청은 건드리지 않음)
// - 갤러리 '공유'로 들어온 사진을 받아 페이지로 넘김
const VERSION = 'pwm-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for(const k of await caches.keys()) if(k !== VERSION && k !== 'share-inbox') await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1) 공유 받기: 사진을 캐시에 넣고 ?shared=1 페이지로 이동
  if(e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')){
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('photos').filter(f => f && typeof f !== 'string');
        const inbox = await caches.open('share-inbox');
        let i = 0;
        for(const f of files){
          await inbox.put(new Request(`./__shared/${Date.now()}-${i++}`), new Response(f, { headers: {
            'content-type': f.type || 'application/octet-stream',
            'x-name': encodeURIComponent(f.name || 'shared.jpg'),
            'x-modified': String(f.lastModified || Date.now())
          }}));
        }
      } catch(err) { console.error('share-target', err); }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  // 2) 같은 사이트의 GET만: 네트워크 우선, 실패 시 캐시 (업데이트가 바로 반영되도록)
  if(e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if(res.ok && !url.search){ const c = await caches.open(VERSION); c.put(e.request, res.clone()); }
      return res;
    } catch {
      return (await caches.match(e.request)) || (await caches.match('./index.html')) || Response.error();
    }
  })());
});
