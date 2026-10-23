// 옮기기 시험: 예전 서버(Code.gs, 모의 시트)에 자료를 만들고 → 옮기기.gs 실행 → 같은 자료를 수파베이스(PGlite)에 넣고 → 새 서버로 똑같이 쓰이는지
// 실행: node tests/sb-migrate.test.mjs
import assert from 'assert'; import fs from 'fs'; import vm from 'vm'; import { createRequire } from 'module';
import { newDb, newServer } from './sb-env.mjs';
const require = createRequire(import.meta.url);
const { createEnv } = require('./lz-mock.js');
let ok = 0, bad = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
console.log('\n[구글 시트 → 수파베이스 옮기기 시험]');

await t('예전 자료 그대로 옮겨짐: 비밀번호·로그인 상태·기록·결제·공지 그림·로고·문의, 예전 서버는 닫힘', async () => {
  /* 1) 예전 서버에 자료 만들기 */
  const old = createEnv(); const pin = old.ctx.setup().match(/처음 비밀번호: (\d{6})/)[1];
  old.ctx.setSetting_('idle_logout_min', 0); old.ctx.setSetting_('qna_mode', 'on');
  const C = (p, tk) => old.call(p, tk);
  const ad = C({ a: 'login', nick: '관리자', pin }).token; assert.ok(C({ a: 'pin', pin: '825913' }, ad).ok);
  const mk = (nick, kind, home) => { const r = C({ a: 'mCreate', nick, kind, home }, ad); const tk = C({ a: 'login', nick, pin: r.pin }).token; assert.ok(C({ a: 'pin', pin: '7391' }, tk).ok); return { tk, uid: r.member.uid }; };
  const a = mk('다람쥐', 'year'), b = mk('너구리', 'trial', 'mansong');
  const h9 = m => Array.from({ length: 9 }, (_, i) => [3 + (i % 3), m + i]);
  const f = C({ a: 'regFront', name: '옮김코스AB', holes: h9(50), confirm: 1 }, a.tk); assert.ok(C({ a: 'regBack', id: f.id, holes: h9(60) }, a.tk).ok);
  assert.ok(C({ a: 'save', cid: f.id, items: [{ i: 0, rec: { r: 'c', n: 3, d: 'L', p: 19 } }, { i: 17, rec: { r: 'f', n: 0 } }] }, a.tk).ok);
  assert.ok(C({ a: 'save', cid: f.id, br: 'mansong', items: [{ i: 1, rec: { r: 'c', n: 5 } }] }, a.tk).ok);
  const pr = C({ a: 'payReq', plan: 'month', method: 'kakao' }, b.tk); assert.ok(C({ a: 'payDecide', id: pr.pending.id, ok: 1 }, ad).ok);
  const big = 'data:image/png;base64,' + 'Q'.repeat(100000);
  const img = C({ a: 'imgPut', data: big }, ad).id; assert.ok(C({ a: 'noticeSave', title: '그림 공지', html: 'x', img }, ad).ok);
  const logo = 'data:image/png;base64,' + 'L'.repeat(60000); assert.ok(C({ a: 'logoPut', slot: 'dark', data: logo }, ad).ok);
  const q = C({ a: 'qnaAsk', cat: 'app', title: '질문', html: '<b>안녕</b>' }, a.tk); assert.ok(q.ok);
  const before = { me: C({ a: 'me' }, a.tk), course: C({ a: 'course', id: f.id }, a.tk), pays: C({ a: 'payList' }, ad), members: C({ a: 'members' }, ad).members.length };

  /* 2) 옮기기.gs 실행(수파베이스 요청은 기록해 뒀다가 아래에서 진짜 DB 에 넣음) */
  const calls = [], sent = {};
  old.ctx.UrlFetchApp = { fetch: (url, o) => {
    const fn = url.split('/rpc/')[1], body = JSON.parse(o.payload); calls.push([fn, body]);
    assert.strictEqual(o.headers.apikey, 'sb_secret_test');
    let out = null;
    if (fn === 'lz_import') { sent[body.p_tab] = (sent[body.p_tab] || 0) + body.p_rows.length; out = body.p_rows.length; }
    if (fn === 'lz_counts') out = sent;
    if (fn === 'lz_import_begin' || fn === 'lz_import_done') out = 'ok';
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(out) };
  } };
  vm.runInContext(fs.readFileSync(new URL('../apps-script/옮기기.gs', import.meta.url), 'utf8'), old.ctx, { filename: '옮기기.gs' });
  vm.runInContext("SB_SECRET = 'sb_secret_test';", old.ctx);
  const msg = old.ctx.moveToSupabase(); assert.ok(/옮기기 끝/.test(msg), msg);
  assert.strictEqual(C({ a: 'me' }, a.tk).err, 'moved', '예전 서버는 닫힘'); assert.strictEqual(C({ a: 'cfg' }).err, 'moved');
  assert.ok(!calls.some(([fn, b]) => fn === 'lz_import' && b.p_tab === 'settings' && b.p_rows.some(r => r[0] === 'moved_to' || /^logo_dark_\d/.test(r[0]))), '옮김 표시·로고는 설정에서 뺌');

  /* 3) 수파베이스(PGlite)에 같은 요청 넣기 */
  const base = await newDb(), state = { now: Date.now() }, logs = [];
  for (const [fn, b] of calls) {
    if (fn === 'lz_import_begin') await base.pg.query('select lz_import_begin($1, $2)', [b.p_pepper, b.p_force]);
    if (fn === 'lz_import_done') await base.pg.query('select lz_import_done()');
    if (fn === 'lz_import') { const r = await base.pg.query('select lz_import($1, $2::jsonb) as n', [b.p_tab, JSON.stringify(b.p_rows)]); assert.strictEqual(r.rows[0].n, b.p_rows.length); }
  }
  const cnt = (await base.pg.query('select lz_counts() as c')).rows[0].c; assert.deepStrictEqual(cnt, sent);
  const S = newServer(base, state, logs);

  /* 4) 새 서버에서 똑같이 */
  const me = await S.call({ a: 'me' }, a.tk); assert.ok(me.ok, '예전 로그인 그대로: ' + JSON.stringify(me)); assert.deepStrictEqual(me.user, before.me.user);
  const cs = await S.call({ a: 'course', id: f.id }, a.tk); assert.deepStrictEqual(cs.mine, before.course.mine); assert.deepStrictEqual(cs.ref, before.course.ref);
  assert.ok((await S.call({ a: 'login', nick: '너구리', pin: '7391' })).ok, '같은 비밀번호');
  const ad2 = (await S.call({ a: 'login', nick: '관리자', pin: '825913' })).token; assert.ok(ad2);
  const pays = await S.call({ a: 'payList' }, ad2); assert.deepStrictEqual(pays.recent.map(p => p.id), before.pays.recent.map(p => p.id));
  assert.strictEqual((await S.call({ a: 'members' }, ad2)).members.length, before.members);
  assert.strictEqual((await S.call({ a: 'imgGet', id: img }, a.tk)).data, big, '공지 그림');
  const cfg = await S.call({ a: 'cfg', lv: 0 }); assert.strictEqual(cfg.logos.dark, logo, '로고');
  assert.strictEqual((await S.call({ a: 'qnaGet', id: q.qna.id }, a.tk)).qna.title, '질문');
  assert.strictEqual(logs.length, 0, logs.join('\n'));
  /* 다시 옮기기는 막힘(FORCE 없이) */
  let again = ''; try { await base.pg.query('select lz_import_begin($1, false)', ['x'.repeat(40)]); } catch (e) { again = e.message; } assert.ok(/이미 옮기기를 마쳤어요/.test(again), again);
  /* 새 서버에서 계속 쓰기 */
  assert.ok((await S.call({ a: 'save', cid: f.id, items: [{ i: 2, rec: { r: 'u', t: '나무', n: 1 } }] }, a.tk)).ok);
  assert.strictEqual((await S.call({ a: 'course', id: f.id }, a.tk)).mine[2].t, '나무');
  const nm = await S.call({ a: 'mCreate', nick: '새회원', kind: 'trial' }, ad2); assert.ok(nm.ok); assert.ok(Number(nm.member.uid.slice(1)) > 3, '회원번호 이어서');
});

console.log(`\n결과: ${ok} 통과 / ${bad} 실패`); process.exit(bad ? 1 : 0);
