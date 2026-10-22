// 시험용 서버: 앱 파일(8801) + 모의 통합 앱스크립트 API(8802, 사전요청(OPTIONS)은 거부 — 실제 앱스크립트와 같은 조건)
const http = require('http'), fs = require('fs'), path = require('path');
const { createEnv } = require('./lz-mock');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function apiServer(env, log) {
  return http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') { log.options++; res.writeHead(405, cors); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(env.ctx.doGet().getContent()); }
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      log.posts++;
      const go = () => {
        if (log.fail) { res.writeHead(500, cors); return res.end('boom'); }
        let out; try { const q = JSON.parse(body); log.actions.push(q.a); out = env.ctx.doPost({ postData: { contents: body } }).getContent(); } catch (e) { out = JSON.stringify({ ok: false, err: 'server', msg: String(e) }); }
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(out);
      };
      log.delay ? setTimeout(go, log.delay) : go();
    });
  });
}
function start(o) {
  o = o || {};
  const env = createEnv(), msg = env.ctx.setup(), pin = msg.match(/처음 비밀번호: (\d{6})/)[1];
  const nt = env.ss.getSheetByName('공지'); if (!o.promoPopup && nt && nt.getLastRow() >= 2) nt.getRange(2, 8).setValue(0);   // 홍보 공지 팝업은 따로 시험(J5)
  const log = { posts: 0, options: 0, delay: 0, fail: false, actions: [] };
  const api = apiServer(env, log);
  const CONFIG = o.legacyConfig
    ? "window.LZ_CONFIG={DEFAULT:'yangju',BRANCHES:{yangju:{name:'제이드 양주점',API:'http://localhost:8802/exec'}}};"
    : "window.LZ_CONFIG={API:'http://localhost:8802/exec'};";
  const stat = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/lezuro/, ''); if (p === '' || p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    let data = fs.readFileSync(f);
    if (p === '/js/config.js') data = Buffer.from(CONFIG);
    if (p === '/index.html') data = Buffer.from(String(data).replace("connect-src 'self'", "connect-src 'self' http://localhost:8802"));   // 시험 서버 주소만 허용(보안 정책은 그대로)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
  return new Promise(r => api.listen(8802, () => stat.listen(8801, () => r({ env, pin, log, close: () => { api.close(); stat.close(); } }))));
}
module.exports = { start };
