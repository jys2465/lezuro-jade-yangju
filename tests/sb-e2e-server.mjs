// 화면 시험용 서버(수파베이스 판): 앱 파일(8801) + 엔진 API(8802, OPTIONS 는 거부 → 사전요청이 없어야 통과)
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { createSbEnv } from './sb-env.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
export async function start(o = {}) {
  const env = await createSbEnv(), pin = env.msg.match(/처음 비밀번호: (\d{6})/)[1];
  env.ctx = { setSetting_: (k, v) => env.op(c => c.fn.setSetting_(k, v)) };
  env.rows = name => env.op(c => c.fn.rows_(name));
  if (!o.idle) await env.ctx.setSetting_('idle_logout_min', 0);
  if (!o.promoPopup) await env.op(c => c.fn.setCell_('notices', 2, 8, 0));
  const log = { posts: 0, options: 0, delay: 0, fail: false, actions: [] };
  const api = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') { log.options++; res.writeHead(405, cors); return res.end(); }
    if (req.method === 'GET') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(env.engine.doGet()); }
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      log.posts++;
      const go = async () => {
        if (log.fail) { res.writeHead(500, cors); return res.end('boom'); }
        let out; try { log.actions.push(JSON.parse(body).a); } catch (e) { /* 무시 */ }
        try { out = await env.engine.handle(body); } catch (e) { out = JSON.stringify({ ok: false, err: 'server', msg: String(e) }); }
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(out);
      };
      log.delay ? setTimeout(go, log.delay) : go();
    });
  });
  const CONFIG = "window.LZ_CONFIG={API:'http://localhost:8802/functions/v1/api'};";
  const stat = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/lezuro/, ''); if (p === '' || p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    let data = fs.readFileSync(f);
    if (p === '/js/config.js') data = Buffer.from(CONFIG);
    if (p === '/index.html') data = Buffer.from(String(data).replace("connect-src 'self'", "connect-src 'self' http://localhost:8802"));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
  await new Promise(r => api.listen(8802, () => stat.listen(8801, r)));
  return { env, pin, log, close: () => { api.close(); stat.close(); } };
}
