// 시험용 서버: 앱 파일(8801) + 모의 앱스크립트 API 두 지점(양주 8802, 만송 8803, 사전요청(OPTIONS)은 거부 — 실제 앱스크립트와 같은 조건)
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
function start() {
  const env = createEnv(), msg = env.ctx.setup(), pin = msg.match(/처음 비밀번호: (\d{4})/)[1];
  const env2 = createEnv({ vars: { BRANCH: 'mansong', STORE_DEFAULT: '양주만송점' } }), pin2 = env2.ctx.setup().match(/처음 비밀번호: (\d{4})/)[1];
  const log = { posts: 0, options: 0, delay: 0, fail: false, actions: [] }, log2 = { posts: 0, options: 0, delay: 0, fail: false, actions: [] };
  const api = apiServer(env, log), api2 = apiServer(env2, log2);
  const CONFIG = "window.LZ_CONFIG={DEFAULT:'yangju',BRANCHES:{yangju:{name:'제이드 양주점',API:'http://localhost:8802/exec'},mansong:{name:'양주만송점',API:'http://localhost:8803/exec'},soon:{name:'준비중점',API:'YOUR_URL'}}};";
  const stat = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/lezuro/, ''); if (p === '' || p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    let data = fs.readFileSync(f);
    if (p === '/js/config.js') data = Buffer.from(CONFIG);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
  return new Promise(r => api.listen(8802, () => api2.listen(8803, () => stat.listen(8801, () => r({ env, pin, log, env2, pin2, log2, close: () => { api.close(); api2.close(); stat.close(); } })))));
}
module.exports = { start };
