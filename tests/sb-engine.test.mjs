// 수파베이스 엔진 시험: 서버 여러 대(메모리 따로)·동시 요청·바뀐 줄만 받기·지운 줄·정리 뒤 다시 받기·요청당 데이터베이스 호출 수
// 실행: node tests/sb-engine.test.mjs
import assert from 'assert';
import { createSbEnv } from './sb-env.mjs';
let ok = 0, bad = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const ADMIN_PIN = '825913';
async function boot() {
  const env = await createSbEnv(); const pin = env.msg.match(/처음 비밀번호: (\d{6})/)[1];
  await env.op(c => c.fn.setSetting_('idle_logout_min', 0));
  let r = await env.call({ a: 'login', nick: '관리자', pin, dev: 'x' }); const admin = r.token;
  assert.ok((await env.call({ a: 'pin', pin: ADMIN_PIN }, admin)).ok);
  env.admin = admin;
  env.mk = async (nick, kind) => { const m = await env.call({ a: 'mCreate', nick, kind }, admin); assert.ok(m.ok, JSON.stringify(m)); const tk = (await env.call({ a: 'login', nick, pin: m.pin })).token; assert.ok((await env.call({ a: 'pin', pin: '7391' }, tk)).ok); return { tok: tk, uid: m.member.uid }; };
  return env;
}
console.log('\n[수파베이스 엔진 시험]');

await t('서버 두 대: 한 대에서 바꾼 것이 다른 대에서 바로 보임(바뀐 줄만 받아 옴), 지운 회원은 다른 대 메모리에서도 사라짐', async () => {
  const env = await boot(), B = env.server();
  const m = await env.mk('다람쥐', 'month');
  assert.strictEqual((await B.call({ a: 'me' }, m.tok)).user.nick, '다람쥐', 'B 서버도 로그인 인정');
  assert.ok((await B.call({ a: 'setNick', nick: '청설모' }, m.tok)).ok);
  assert.strictEqual((await env.call({ a: 'me' }, m.tok)).user.nick, '청설모', 'A 서버에 바로 반영');
  const x = await env.mk('지울이', 'trial');
  assert.ok((await B.call({ a: 'members' }, env.admin)).members.some(u => u.nick === '지울이'));
  assert.ok((await env.call({ a: 'mUpdate', uid: x.uid, op: 'delete' }, env.admin)).ok);
  assert.ok(!(await B.call({ a: 'members' }, env.admin)).members.some(u => u.nick === '지울이'), 'B 메모리에서도 지워짐');
  assert.strictEqual((await B.call({ a: 'me' }, x.tok)).err, 'auth');
});

await t('동시에 두 서버에서 같은 결제 승인 → 한 번만 처리(데이터베이스 잠금)', async () => {
  const env = await boot(), B = env.server();
  const m = await env.mk('결제이', 'trial');
  const r = await env.call({ a: 'payReq', plan: 'month' }, m.tok); assert.ok(r.ok);
  const [a, b] = await Promise.all([env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, env.admin), B.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, env.admin)]);
  assert.strictEqual([a, b].filter(x => x.ok).length, 1, JSON.stringify([a, b]));
  assert.strictEqual((await env.call({ a: 'me' }, m.tok)).user.left, 29, '30일 한 번만');
});

await t('동시에 같은 닉네임 가입 20건 → 1명만', async () => {
  const env = await boot(), B = env.server();
  const dev = n => ('e' + n).padEnd(32, 'a');
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? B : env).call({ a: 'join', nick: '동시가입', pin: '2580', br: 'yangju', agree: 1, dev: dev(i) })));
  assert.strictEqual(res.filter(x => x.ok).length, 1, JSON.stringify(res.map(x => x.err)));
  const n = (await env.pg.query("select count(*)::int n from lz where tab = 'users' and d->>0 = '동시가입'")).rows[0].n; assert.strictEqual(n, 1);
});

await t('기록 저장 동시 18건(홀마다 따로) → 모두 남음', async () => {
  const env = await boot(), B = env.server();
  const y = await env.mk('기록이', 'year');
  const h9 = m => Array.from({ length: 9 }, (_, i) => [3, m + i]);
  const f = await env.call({ a: 'regFront', name: '동시코스AB', holes: h9(50), confirm: 1 }, y.tok); assert.ok(f.ok, JSON.stringify(f));
  assert.ok((await env.call({ a: 'regBack', id: f.id, holes: h9(60) }, y.tok)).ok);
  await Promise.all(Array.from({ length: 18 }, (_, i) => (i % 2 ? B : env).call({ a: 'save', cid: f.id, items: [{ i, rec: { r: 'c', n: i % 9, d: 'R', p: 17 } }] }, y.tok)));
  const mine = (await env.call({ a: 'course', id: f.id }, y.tok)).mine;
  assert.strictEqual(mine.filter(r => r.r === 'c').length, 18);
  const rows = (await env.pg.query("select count(*)::int n from lz where tab = 'records'")).rows[0].n; assert.strictEqual(rows, 1, '한 줄에 모음');
});

await t('데이터베이스 호출 수: 따뜻한 서버에서 화면 요청은 1~3번, 쓰기도 몇 번', async () => {
  const env = await boot();
  const m = await env.mk('빠른이', 'month');
  await env.call({ a: 'me' }, m.tok); await env.call({ a: 'courses' }, m.tok); await env.call({ a: 'me' }, m.tok);   // 배움
  const q0 = env.stats.queries; await env.call({ a: 'me' }, m.tok); const me = env.stats.queries - q0;
  const q1 = env.stats.queries; await env.call({ a: 'courses' }, m.tok); const cs = env.stats.queries - q1;
  const q2 = env.stats.queries; await env.call({ a: 'useBranch', br: 'mansong' }, m.tok); const ub = env.stats.queries - q2;
  console.log('        me', me, '· courses', cs, '· useBranch(쓰기)', ub);
  assert.ok(me <= 3 && cs <= 5 && ub <= 8, [me, cs, ub].join(','));
});

await t('받는 데이터: 따뜻한 서버는 바뀐 줄만(회원 300명이어도 다시 안 받음)', async () => {
  const env = await boot();
  const rows = Array.from({ length: 300 }, (_, i) => ['n' + i, 'year', '2026-01-01', '2099-01-01', 'h', 's', 0, 1, 0, 0, 1, 0, 0, 0, 'u9' + i, 'yangju', 0, 0, '', 0, 'yangju', 0, 4, 'staff', '', '', ''].map(String));
  await env.pg.query(`insert into lz (tab, d) select 'users', x from jsonb_array_elements($1::jsonb) x`, [JSON.stringify(rows)]);
  const m = await env.mk('보는이', 'month');
  await env.call({ a: 'me' }, m.tok);
  let got = 0; const orig = env.base.db.q;
  env.base.db.q = async (s, p) => { const r = await orig(s, p); if (/from lz where v >/.test(s)) got += r.length; return r; };
  for (let i = 0; i < 5; i++) await env.call({ a: 'me' }, m.tok);
  env.base.db.q = orig;
  assert.ok(got <= 5 * 3, '받은 줄 ' + got);
});

await t('매일 SQL 정리(lz_daily) 뒤: 지운 줄 기록이 정리되면 오래된 서버는 모두 새로 받음(꼬이지 않음)', async () => {
  const env = await boot(), B = env.server();
  const a = await env.mk('하나', 'trial'), b = await env.mk('둘이', 'trial');
  await B.call({ a: 'members' }, env.admin);                                    // B 가 회원 표를 기억
  assert.ok((await env.call({ a: 'mUpdate', uid: a.uid, op: 'delete' }, env.admin)).ok);
  await env.pg.query('select lz_daily()');                                       // 지운 줄 기록 정리
  const l = (await B.call({ a: 'members' }, env.admin)).members.map(x => x.nick);
  assert.ok(!l.includes('하나') && l.includes('둘이'), l.join());
});

await t('매일 정리 예약(_cron): 열쇠가 맞아야 실행', async () => {
  const env = await boot();
  assert.strictEqual((await env.engine.cron({ key: 'x' })).ok, false);
  const key = (await env.pg.query("select v from lz_prop where k = 'CRON_KEY'")).rows[0].v;
  assert.strictEqual(JSON.parse(await env.engine.handle(JSON.stringify({ a: '_cron', key }))).ok, true);
});

await t('SQL 로 관리자 비밀번호 다시 만들기: select lz_reset_admin() → 그 번호로 로그인, 바로 바꾸게', async () => {
  const env = await boot();
  const msg = (await env.pg.query('select lz_reset_admin() as m')).rows[0].m; const pin = msg.match(/(\d{6})$/)[1];
  assert.strictEqual((await env.call({ a: 'me' }, env.admin)).err, 'auth', '기존 로그인 끊김');
  const r = await env.call({ a: 'login', nick: '관리자', pin }); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.user.must, 1);
});

await t('보안: 공개 열쇠(anon) 역할로는 표를 읽을 수 없음', async () => {
  const env = await boot();
  let err = ''; try { await env.pg.query('set role anon'); await env.pg.query('select * from lz limit 1'); } catch (e) { err = String(e.message); } finally { await env.pg.query('reset role'); }
  assert.ok(/permission denied/.test(err), err);
});

await t('예전 시트에서 옮긴 자료 그대로 로그인·기록 보기(같은 PEPPER, 같은 로그인 토큰)', async () => {
  const env = await createSbEnv();          // 빈 DB 에 setup 이 먼저 돌았지만, 옮기기는 표를 비우고 넣음
  await env.pg.exec('delete from lz; delete from lz_gone;'); env.engine.forget();
  const pep = 'p'.repeat(40), salt = 'abcd';
  const crypto = await import('crypto'); const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  await env.pg.query("insert into lz_prop (k, v) values ('PEPPER', $1) on conflict (k) do update set v = excluded.v", [pep]);
  const T = Date.now(), today = new Date(T + 9 * 3600e3).toISOString().slice(0, 10);
  const ins = (tab, rows) => env.pg.query(`insert into lz (tab, d) select $1, x from jsonb_array_elements($2::jsonb) with ordinality t(x, o) order by o`, [tab, JSON.stringify(rows.map(r => r.map(String)))]);
  await ins('branches', [['yangju', '제이드 양주점', 1, 1, 1]]);
  await ins('settings', [['uidSeq', 5], ['idle_logout_min', 0]]);
  await ins('users', [['다람쥐', 'month', today, '2099-12-31', sha(salt + ':7391:' + pep), salt, 0, 1, 0, 0, 1, 0, 0, 0, 'u3', 'yangju', 0, 0, '', 0, 'yangju', 0, 4, 'staff', '', '', '']]);
  await ins('sessions', [[sha('oldtoken'), 'u3', T + 30 * 86400000, 'phone', T, T]]);
  await ins('courses', [['c7', '옛코스AB', '옛코스ab', 'u3', JSON.stringify(Array.from({ length: 18 }, () => [3, 50])), 1, 1, 'u3', 'done']]);
  await ins('records', [['c7', 'u3', 1, JSON.stringify([{ r: 'c', n: 2, d: 'L', p: 17 }]), 5, 'yangju']]);
  const me = await env.call({ a: 'me' }, 'oldtoken'); assert.ok(me.ok, JSON.stringify(me));
  assert.strictEqual((await env.call({ a: 'course', id: 'c7' }, 'oldtoken')).mine[0].n, 2);
  assert.ok((await env.call({ a: 'login', nick: '다람쥐', pin: '7391' })).ok, '같은 비밀번호로 로그인');
});

await t('좌석 2개에 5명이 동시에(서버 두 대) → 들어간 사람은 2명만(좌석 저장은 잠금 안에서)', async () => {
  const env = await boot(), B = env.server();
  const ms = []; for (let i = 0; i < 5; i++) ms.push(await env.mk('좌석' + i, 'year'));
  assert.ok((await env.call({ a: 'setCfg', seats: 2 }, env.admin)).ok);
  await env.pg.query("delete from lz_kv where k in ('seats', 'queue')");
  const res = await Promise.all(ms.map((m, i) => (i % 2 ? B : env).call({ a: 'me' }, m.tok)));
  assert.strictEqual(res.filter(r => r.ok).length, 2, JSON.stringify(res.map(r => r.err || 'ok')));
  assert.strictEqual(res.filter(r => r.err === 'queue').length, 3);
});

await t('매일 정리 뒤 다시 받기는 한 번만(그 뒤 요청은 바뀐 줄만)', async () => {
  const env = await boot();
  const a = await env.mk('하나', 'trial'), b = await env.mk('둘이', 'trial');
  await env.call({ a: 'me' }, b.tok);
  assert.ok((await env.call({ a: 'mUpdate', uid: a.uid, op: 'delete' }, env.admin)).ok);   // 마지막 변경이 "지우기"
  await env.pg.query('select lz_daily()');
  let fulls = 0; const orig = env.base.db.q;
  env.base.db.q = async (s, p) => { if (/from lz where v >/.test(s) && p && p[2] !== '[]') fulls++; return orig(s, p); };
  for (let i = 0; i < 4; i++) assert.ok((await env.call({ a: 'ping' }, b.tok)).ok);
  env.base.db.q = orig;
  assert.ok(fulls <= 1, '표 전체를 받은 횟수 ' + fulls);
});

await t('SQL 로 관리자 비밀번호를 바꿔도 이미 돌던 서버(B)가 바로 앎', async () => {
  const env = await boot(), B = env.server();
  await B.call({ a: 'me' }, env.admin);
  const pin = (await env.pg.query('select lz_reset_admin() as m')).rows[0].m.match(/(\d{6})$/)[1];
  assert.ok((await B.call({ a: 'login', nick: '관리자', pin })).ok);
  assert.strictEqual((await B.call({ a: 'me' }, env.admin)).err, 'auth', '예전 로그인은 B 에서도 끊김');
});

console.log(`\n결과: ${ok} 통과 / ${bad} 실패`); process.exit(bad ? 1 : 0);
