/* 서비스 워커 — 앱 껍데기를 기기에 저장해서 더 빨리 열리게 합니다.
 * ★ 파일을 고쳐 GitHub 에 올릴 때마다 아래 VERSION 숫자를 올리세요. (모든 기기가 새 버전으로 바뀝니다) */
const VERSION = '2.1.1';
const CACHE = 'lezuro-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/config.js', 'js/util.js', 'js/api.js', 'js/pwa.js', 'js/ui.js', 'js/rec.js',
  'js/screens-auth.js', 'js/screens-courses.js', 'js/screens-holes.js', 'js/screens-pay.js', 'js/screens-admin.js', 'js/app.js', 'vendor/qrcode.js',
  'assets/logo-dark.png', 'assets/logo-light.png', 'assets/nosleep.mp4', 'assets/nosleep.webm', 'assets/fonts/NotoSansKR-Regular.woff2', 'assets/fonts/NotoSansKR-Medium.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    const res = await Promise.allSettled(SHELL.map(function (u) { return cache.add(new Request(u, { cache: 'reload' })); }));
    if (res[1].status !== 'fulfilled') throw new Error('index.html 을 저장하지 못했어요');   // 핵심 파일이 없으면 설치 중단(이전 버전 유지)
  })());
});
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('lezuro-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});
self.addEventListener('message', function (e) { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
async function swr(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(function (res) { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(function () { return null; });
  if (hit) { net.catch(function () {}); return hit; }
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
  return new Response('인터넷에 연결되어 있지 않아요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                  // 저장·로그인(POST)은 절대 가로채지 않음
  if (new URL(req.url).origin === self.location.origin) e.respondWith(swr(req));
});
