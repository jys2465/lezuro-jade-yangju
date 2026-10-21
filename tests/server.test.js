const assert = require('assert');
const { createEnv } = require('./lz-mock');
let ok = 0, bad = 0;
function t(name, fn) { try { fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 3).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const DAY = 86400000;
const holes9 = (m = 50) => Array.from({ length: 9 }, (_, i) => [3 + (i % 3), m + i + 0.5]);
const rec = (r, n, d = 'R', p = 17, t = '', o = '') => ({ r, n, d, p, t, o });

function fresh(seats) {
  const env = createEnv(); const msg = env.ctx.setup(); const pin = msg.match(/처음 비밀번호: (\d{4})/)[1];
  const A = { env };
  A.call = (p, tok) => env.call(p, tok);
  A.login = (nick, p) => env.call({ a: 'login', nick, pin: p, dev: 'test' });
  A.tok = (nick, p) => { const r = A.login(nick, p); assert.ok(r.ok, JSON.stringify(r)); return r.token; };
  A.admin = A.tok('관리자', pin);
  assert.ok(env.call({ a: 'pin', pin: '8259' }, A.admin).ok);
  if (seats !== undefined) assert.ok(env.call({ a: 'setCfg', seats }, A.admin).ok);
  let n = 0;
  A.mk = (nick, kind, by) => {
    const r = env.call({ a: 'mCreate', nick, kind }, by || A.admin); assert.ok(r.ok, JSON.stringify(r));
    const tk = A.tok(nick, r.pin); const np = ['7391', '6482', '5273', '4164', '3925'][n++ % 5];
    assert.ok(env.call({ a: 'pin', pin: np }, tk).ok); return { tok: tk, pin: np, nick };
  };
  A.front = (tok, name, extra = {}) => env.call(Object.assign({ a: 'regFront', name, holes: holes9() }, extra), tok);
  A.reg = (tok, name) => { const f = A.front(tok, name, { confirm: 1 }); assert.ok(f.ok, JSON.stringify(f)); const b = env.call({ a: 'regBack', id: f.id, holes: holes9(70) }, tok); assert.ok(b.ok, JSON.stringify(b)); return f.id; };
  A.save = (tok, cid, items) => env.call({ a: 'save', cid, items }, tok);
  A.me = tok => env.call({ a: 'me' }, tok);
  return A;
}

console.log('\n[서버 시험 v2 — 등급·결제·대기열·코스 이름]');

t('setup: 시트 9개, 관리자 계정, 결제 처음 값(요금·QR·계좌), 다시 실행해도 안전', () => {
  const A = fresh(); const env = A.env;
  assert.deepStrictEqual(env.ss.sheets.map(s => s.name), ['회원', '로그인기록', '코스', '기록', '공개설정', '결제', '설정', '이력', '신뢰도']);
  const c = env.call({ a: 'adminCfg' }, A.admin).cfg;
  assert.deepStrictEqual([c.price_month, c.price_year, c.bank_name, c.bank_no, c.bank_holder], [1000, 9000, '카카오뱅크', '3333-05-8835107', '주*수']);
  assert.ok(/^https:\/\/qr\.kakaopay\.com\//.test(c.qr_month));
  assert.ok(/이미 준비/.test(env.ctx.setup()));
  assert.strictEqual(A.me(A.admin).user.kind, 'admin');
});

t('예전 회원 옮기기: 고정회원 → 가입일부터 365일 연간, 기간회원 → 월간(기간 유지), 1년 지난 분 안내', () => {
  const env = createEnv(); env.ctx.setup();
  const sh = env.ss.getSheetByName('회원'); const now = env.state.now;
  const add = (nick, kind, start, end, created) => { const r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, 14).setNumberFormat('@').setValues([[nick, kind, start, end, 'h', 's', 0, 1, 0, 0, created, 0, 0, 0]]); };
  add('고정이', 'fixed', '', '', now - 30 * DAY); add('오래된', 'fixed', '', '', now - 400 * DAY); add('기간이', 'term', '2026-10-01', '2026-11-30', now);
  const msg = env.ctx.setup();
  assert.ok(/3명을 새 등급으로/.test(msg) && /오래된/.test(msg.split('바로 기간이 끝난 분')[1] || ''), msg);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  const g = n => rows.find(r => r[0] === n);
  assert.strictEqual(g('고정이')[1], 'year'); assert.strictEqual(g('기간이')[1], 'month'); assert.strictEqual(g('기간이')[3], '2026-11-30');
});

t('관리자: 모든 등급 생성 / 운영자: 체험만 생성, 요금·QR·결제 승인 불가', () => {
  const A = fresh(); const env = A.env;
  const op = A.mk('부장님', 'op');
  for (const k of ['month', 'year', 'op']) assert.strictEqual(env.call({ a: 'mCreate', nick: '가' + k.slice(0, 2), kind: k }, op.tok).err, 'perm', k);
  const tr = env.call({ a: 'mCreate', nick: '체험이', kind: 'trial' }, op.tok); assert.ok(tr.ok);
  assert.strictEqual(tr.member.start, tr.member.end, '체험은 1일');
  for (const a of ['adminCfg', 'setCfg', 'payList', 'payDecide', 'payRefund', 'logoPut']) assert.strictEqual(env.call({ a, id: 'x', slot: 'dark' }, op.tok).err, 'perm', a);
  assert.ok(env.call({ a: 'members' }, op.tok).ok);
  assert.strictEqual(env.call({ a: 'mCreate', nick: '관리자2', kind: 'admin' }, A.admin).err, 'bad');
});

t('체험: 1일, 운영자가 하루씩 최대 2번 연장, 기간 끝나면 읽기만', () => {
  const A = fresh(); const env = A.env; const op = A.mk('부장님', 'op'); const tr = A.mk('체험이', 'trial', op.tok);
  let m = A.me(tr.tok).user; assert.strictEqual(m.kind, 'trial'); assert.strictEqual(m.left, 0); assert.strictEqual(m.st, 'active');
  assert.ok(env.call({ a: 'mUpdate', nick: '체험이', op: 'trialExt' }, op.tok).ok);
  assert.ok(env.call({ a: 'mUpdate', nick: '체험이', op: 'trialExt' }, op.tok).ok);
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '체험이', op: 'trialExt' }, op.tok).err, 'bad', '3번째 연장 거절');
  m = A.me(tr.tok).user; assert.strictEqual(m.left, 2); assert.strictEqual(m.ext, 2);
  for (const o of ['kind', 'extend', 'active', 'delete']) assert.strictEqual(env.call({ a: 'mUpdate', nick: '체험이', op: o, kind: 'year' }, op.tok).err, 'perm', o);
  const fx = A.mk('연간이', 'year'); const cid = A.reg(fx.tok, '시험코스AB');
  assert.ok(A.save(tr.tok, cid, [{ i: 0, rec: rec('f', 1) }]).ok, '체험 중 기록 가능');
  assert.strictEqual(env.call({ a: 'regFront', name: '체험코스AB', holes: holes9() }, tr.tok).err, 'perm', '체험은 코스 등록 불가');
  env.state.now += 3 * DAY;
  assert.strictEqual(A.me(tr.tok).user.st, 'expired'); assert.strictEqual(A.save(tr.tok, cid, [{ i: 1, rec: rec('c', 1) }]).err, 'expired');
  assert.strictEqual(env.call({ a: 'course', id: cid }, tr.tok).mine[0].r, 'f', '내 기록은 읽기 가능');
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '체험이', op: 'kind', kind: 'trial' }, A.admin).err, 'bad', '체험으로 되돌리기 불가');
});

t('결제: 체험 중 결제 신청 → 관리자 승인 → 즉시 월간 시작(오늘~29일 뒤)', () => {
  const A = fresh(); const env = A.env; const tr = A.mk('체험이', 'trial');
  const info = env.call({ a: 'payInfo' }, tr.tok); assert.ok(info.pay.ok); assert.strictEqual(info.prices.month, 1000);
  assert.strictEqual(info.bank.no, '3333-05-8835107'); assert.strictEqual(info.preview.month.start, A.me(tr.tok).today);
  const r = env.call({ a: 'payReq', plan: 'month', method: 'kakao', depositor: '체험이' }, tr.tok); assert.ok(r.ok); assert.strictEqual(r.pending.amount, 1000);
  assert.strictEqual(A.me(tr.tok).pending.plan, 'month');
  const list = env.call({ a: 'payList' }, A.admin); assert.strictEqual(list.pending.length, 1); assert.strictEqual(list.pending[0].depositor, '체험이');
  const d = env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin); assert.ok(d.ok, JSON.stringify(d));
  const u = A.me(tr.tok).user; assert.strictEqual(u.kind, 'month'); assert.strictEqual(u.left, 29); assert.strictEqual(A.me(tr.tok).pending, null);
  assert.strictEqual(env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin).err, 'nopay', '두 번 승인 안 됨');
});

t('재결제: 종료 14일 전부터만, 승인하면 종료일 다음 날부터 이어 붙임 / 기간 끝난 뒤 결제는 오늘부터', () => {
  const A = fresh(); const env = A.env; const m = A.mk('월간이', 'month');
  let p = env.call({ a: 'payInfo' }, m.tok).pay; assert.strictEqual(p.ok, false); assert.ok(/14일 전부터/.test(p.why));
  assert.strictEqual(env.call({ a: 'payReq', plan: 'year' }, m.tok).err, 'nopay');
  env.state.now += 16 * DAY;   // 남은 13일
  const end0 = A.me(m.tok).user.end;
  const r = env.call({ a: 'payReq', plan: 'year', method: 'bank' }, m.tok); assert.ok(r.ok, JSON.stringify(r));
  env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin);
  const u = A.me(m.tok).user; assert.strictEqual(u.kind, 'year');
  const pay = env.call({ a: 'payList' }, A.admin).recent[0];
  assert.strictEqual(pay.start, A.env.ctx.addDays_(end0, 1)); assert.strictEqual(u.end, A.env.ctx.addDays_(end0, 365));
  env.state.now += 500 * DAY; const mt = A.tok('월간이', m.pin), ad = A.tok('관리자', '8259'); assert.strictEqual(A.me(mt).user.st, 'expired');
  const r2 = env.call({ a: 'payReq', plan: 'month' }, mt); env.call({ a: 'payDecide', id: r2.pending.id, ok: 1 }, ad);
  const u2 = A.me(mt).user; assert.strictEqual(u2.start, A.me(mt).today); assert.strictEqual(u2.left, 29);
});

t('결제 거절·회원이 신청 취소·다시 신청하면 이전 신청은 취소로', () => {
  const A = fresh(); const env = A.env; const tr = A.mk('체험이', 'trial');
  const r1 = env.call({ a: 'payReq', plan: 'month' }, tr.tok); const r2 = env.call({ a: 'payReq', plan: 'year' }, tr.tok);
  assert.strictEqual(env.call({ a: 'payList' }, A.admin).pending.length, 1); assert.strictEqual(env.call({ a: 'payDecide', id: r1.pending.id, ok: 1 }, A.admin).err, 'nopay');
  assert.ok(env.call({ a: 'payCancel' }, tr.tok).ok); assert.strictEqual(env.call({ a: 'payList' }, A.admin).pending.length, 0);
  const r3 = env.call({ a: 'payReq', plan: 'month' }, tr.tok); assert.ok(env.call({ a: 'payDecide', id: r3.pending.id, ok: 0 }, A.admin).ok);
  assert.strictEqual(A.me(tr.tok).user.kind, 'trial'); assert.strictEqual(env.call({ a: 'payList' }, A.admin).recent[0].status, 'rejected');
  assert.strictEqual(r2.ok, true);
});

t('환불: 7일 이내·기록 안 씀 → 전액 / 그 밖 → 남은 일수 일할(100원 미만 버림), 기간은 오늘로 끝', () => {
  const A = fresh(); const env = A.env; const tr = A.mk('체험이', 'trial');
  let r = env.call({ a: 'payReq', plan: 'year' }, tr.tok); env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin);
  let calc = env.call({ a: 'payRefund', id: r.pending.id }, A.admin).calc; assert.strictEqual(calc.amount, 9000); assert.ok(calc.full);
  const fx = A.mk('연간이', 'year'); const cid = A.reg(fx.tok, '시험코스AB');
  env.state.now += 100 * DAY; const ad = A.tok('관리자', '8259'), tt = A.tok('체험이', tr.pin); A.save(tt, cid, [{ i: 0, rec: rec('f', 1) }]);
  calc = env.call({ a: 'payRefund', id: r.pending.id }, ad).calc; assert.strictEqual(calc.remain, 265); assert.strictEqual(calc.amount, 6500); assert.ok(!calc.full);
  const done = env.call({ a: 'payRefund', id: r.pending.id, confirm: 1 }, ad); assert.ok(done.ok); assert.strictEqual(done.member.st, 'expired');
  assert.strictEqual(env.call({ a: 'payRefund', id: r.pending.id, confirm: 1 }, ad).err, 'nopay', '두 번 환불 안 됨');
  const m = { tok: 1 };
  // 월간 1,000원, 관리자가 만든 계정은 결제 기록이 없으므로 결제로 시험
  const env2 = fresh(); const t2 = env2.mk('월결제', 'trial'); const q = env2.env.call({ a: 'payReq', plan: 'month' }, t2.tok); env2.env.call({ a: 'payDecide', id: q.pending.id, ok: 1 }, env2.admin);
  const c2 = env2.reg(env2.mk('연간이', 'year').tok, '시험코스AB'); env2.env.state.now += 10 * DAY; env2.save(t2.tok, c2, [{ i: 0, rec: rec('f', 1) }]);
  assert.strictEqual(env2.env.call({ a: 'payRefund', id: q.pending.id }, env2.admin).calc.amount, 600);
  assert.ok(m.tok);
});

t('코스 이름: 같으면 거절, 영문 조합이 다르면 새 코스, 줄인 이름은 정식 이름 제안', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year');
  const ab = A.reg(y.tok, '목행충주호파크골프AB');
  let r = A.front(y.tok, '목행충주호 파크골프AB'); assert.strictEqual(r.err, 'dup'); assert.strictEqual(r.id, ab);
  assert.strictEqual(A.front(y.tok, '목행충주호파크골프ab').err, 'dup', '대소문자 무시');
  r = A.front(y.tok, '목행충주호파크골프CD'); assert.ok(r.ok, 'CD는 새 코스'); env.call({ a: 'regBack', id: r.id, holes: holes9() }, y.tok);
  assert.ok(A.front(y.tok, '목행충주호파크골프BC').ok, 'BC도 새 코스');
  r = A.front(y.tok, '목행충주EF'); assert.strictEqual(r.err, 'suggest'); assert.strictEqual(r.suggest, '목행충주호파크골프EF');
  r = A.front(y.tok, '목행충주CD'); assert.strictEqual(r.err, 'dup', '고친 이름이 이미 있으면 그 코스로 안내'); assert.strictEqual(r.name, '목행충주호파크골프CD');
  r = A.front(y.tok, '목행충주호파크꼴프EF'); assert.strictEqual(r.err, 'suggest', '한 글자 차이');
  assert.ok(A.front(y.tok, '한탄강파크골프AB').ok, '전혀 다른 구장');
  A.reg(y.tok, '양주1구장AB'); assert.ok(A.front(y.tok, '양주2구장AB').ok, '숫자만 다르면 다른 코스');
});

t('코스 이름: 한글 조합은 같은 이름만 거절, 비슷하면 확인(similar) 후 등록', () => {
  const A = fresh(); const y = A.mk('연간이', 'year');
  A.reg(y.tok, '양주호수파크골프가나');
  assert.strictEqual(A.front(y.tok, '양주호수파크골프가나').err, 'dup');
  const s = A.front(y.tok, '양주호수파크골프다라'); assert.strictEqual(s.err, 'similar'); assert.ok(/같은 구장의 다른 조합/.test(s.msg));
  assert.ok(A.front(y.tok, '양주호수파크골프다라', { confirm: 1 }).ok);
  assert.ok(A.front(y.tok, '양주호수파크골프가다', { confirm: 1 }).ok, '한 글자 차이 한글 조합도 확인 후 등록 가능');
  assert.strictEqual(A.env.call({ a: 'nameCheck', name: '양주호수파크골프가나' }, y.tok).res.code, 'dup');
  assert.strictEqual(A.env.call({ a: 'nameCheck', name: '완전새코스' }, y.tok).res, null);
});

t('전반만 저장: 등록한 본인(과 관리자)에게만 보임, 후반 저장 뒤 모두에게 보임, 내 기록도 함께', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const o = A.mk('다른이', 'month');
  const recs = Array(9).fill(null); recs[0] = rec('c', 2, 'L', 18);
  const f = A.front(y.tok, '시험코스AB', { recs }); assert.ok(f.ok);
  assert.strictEqual(env.call({ a: 'courses' }, o.tok).courses.length, 0); assert.strictEqual(env.call({ a: 'course', id: f.id }, o.tok).err, 'nocourse');
  const mine = env.call({ a: 'courses' }, y.tok).courses; assert.strictEqual(mine[0].stage, 'front'); assert.strictEqual(mine[0].mine, 1);
  assert.strictEqual(env.call({ a: 'courses' }, A.admin).courses.length, 1);
  assert.strictEqual(A.front(o.tok, '시험코스AB').err, 'dup', '등록 중인 코스 이름도 막음');
  assert.strictEqual(env.call({ a: 'regBack', id: f.id, holes: holes9() }, o.tok).err, 'perm');
  const back = Array(9).fill(null); back[8] = rec('u', 1, 'R', 20, '나무');
  assert.ok(env.call({ a: 'regBack', id: f.id, holes: holes9(80), recs: back }, y.tok).ok);
  const c = env.call({ a: 'course', id: f.id }, o.tok); assert.strictEqual(c.course.stage, 'done'); assert.strictEqual(c.course.holes[9][1], 80.5);
  const m = env.call({ a: 'course', id: f.id }, y.tok).mine; assert.strictEqual(m[0].p, 18); assert.strictEqual(m[17].t, '나무'); assert.strictEqual(m[5].p, 17, '기록 안 한 홀 타격감 기본 17');
  assert.strictEqual(env.call({ a: 'regBack', id: f.id, holes: holes9() }, y.tok).err, 'done');
});

t('코스 고치기·지우기 권한: 등록자·운영자 고치기, 이름은 운영자·관리자, 지우기는 관리자(전반만 저장된 내 코스는 본인도)', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const o = A.mk('다른이', 'month'); const op = A.mk('부장님', 'op');
  const id = A.reg(y.tok, '시험코스AB');
  assert.strictEqual(env.call({ a: 'editCourse', id, front: holes9(60) }, o.tok).err, 'perm');
  assert.ok(env.call({ a: 'editCourse', id, front: holes9(60) }, y.tok).ok);
  assert.strictEqual(env.call({ a: 'editCourse', id, name: '바뀐코스AB' }, y.tok).err, 'perm');
  assert.ok(env.call({ a: 'editCourse', id, name: '바뀐코스AB' }, op.tok).ok);
  assert.strictEqual(env.call({ a: 'delCourse', id }, op.tok).err, 'perm'); assert.ok(env.call({ a: 'delCourse', id }, A.admin).ok);
  const f = A.front(y.tok, '임시코스AB'); assert.ok(env.call({ a: 'delCourse', id: f.id }, y.tok).ok, '전반만 저장된 내 코스는 지울 수 있음');
});

t('다른 회원 기록: 공개·기간 중인 회원만, 기간 끝난 회원은 남의 기록 못 봄', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const tr = A.mk('체험이', 'trial');
  const id = A.reg(y.tok, '시험코스AB');
  A.save(y.tok, id, [{ i: 0, rec: rec('f', 3, 'L', 19) }]); A.save(tr.tok, id, [{ i: 0, rec: rec('c', 1) }]);
  let v = env.call({ a: 'course', id }, tr.tok); assert.strictEqual(v.pick.nick, '연간이'); assert.strictEqual(v.pick.recs[0].p, 19);
  env.state.now += 2 * DAY;
  v = env.call({ a: 'course', id }, tr.tok); assert.strictEqual(v.authors.length, 0); assert.strictEqual(v.pick, null);
  assert.strictEqual(env.call({ a: 'course', id }, y.tok).authors.length, 0, '기간 끝난 체험회원 기록은 숨김');
});

t('대기열: 좌석 2개, 3번째는 대기 1번째, 로그아웃하면 들어감, 10분 쉬면 좌석 비움, 운영자는 대기 없음', () => {
  const A = fresh(2); const env = A.env;
  const a = A.mk('일번', 'year'), b = A.mk('이번', 'year');
  const c = env.call({ a: 'mCreate', nick: '삼번', kind: 'year' }, A.admin); const cl = A.login('삼번', c.pin); assert.ok(cl.ok, '로그인 자체는 됨');
  let q = env.call({ a: 'me' }, cl.token); assert.strictEqual(q.err, 'queue'); assert.strictEqual(q.pos, 1); assert.strictEqual(q.ahead, 0);
  const d = env.call({ a: 'mCreate', nick: '사번', kind: 'year' }, A.admin); const dl = A.login('사번', d.pin);
  q = env.call({ a: 'me' }, dl.token); assert.strictEqual(q.pos, 2); assert.strictEqual(q.ahead, 1);
  assert.strictEqual(env.call({ a: 'members' }, A.admin).seats.waiting, 2);
  assert.ok(env.call({ a: 'logout' }, a.tok).ok);
  assert.strictEqual(env.call({ a: 'me' }, dl.token).err, 'queue', '앞 사람이 먼저');
  assert.ok(env.call({ a: 'me' }, cl.token).ok, '대기 1번이 들어감');
  env.state.now += 30000; env.call({ a: 'me' }, dl.token);
  env.state.now += 10 * 60000 + 1000;  // 이번·삼번 10분 넘게 조용함
  env.call({ a: 'me' }, dl.token);
  assert.ok(env.call({ a: 'me' }, dl.token).ok, '좌석이 비어 들어감');
  const op = A.mk('부장님', 'op'); assert.ok(A.me(op.tok).ok);
  assert.ok(env.call({ a: 'setCfg', seats: 0 }, A.admin).ok); assert.ok(env.call({ a: 'me' }, b.tok).ok, '0 = 제한 없음');
});

t('회원 목록: 접속 중 표시(최근 10분), 기록한 코스 수, 결제 대기 표시', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const tr = A.mk('체험이', 'trial');
  const id1 = A.reg(y.tok, '시험코스AB'), id2 = A.reg(y.tok, '시험코스CD');
  A.save(y.tok, id1, [{ i: 0, rec: rec('f', 1) }]); A.save(y.tok, id2, [{ i: 0, rec: rec('f', 1) }]);
  env.call({ a: 'payReq', plan: 'month' }, tr.tok);
  let l = env.call({ a: 'members' }, A.admin).members; const g = n => l.find(m => m.nick === n);
  assert.strictEqual(g('연간이').courses, 2); assert.strictEqual(g('연간이').online, 1); assert.strictEqual(g('체험이').pendingPay, 1);
  env.state.now += 11 * 60000; A.me(tr.tok);
  l = env.call({ a: 'members' }, A.admin).members; assert.strictEqual(g('연간이').online, 0); assert.strictEqual(g('체험이').online, 1);
  assert.ok(g('연간이').seenAt > 0);
});

t('관리자 설정: 요금·QR(카카오페이 주소만)·계좌·좌석, 바뀐 값이 결제 화면에 바로 반영', () => {
  const A = fresh(); const env = A.env; const tr = A.mk('체험이', 'trial');
  assert.strictEqual(env.call({ a: 'setCfg', qr_month: 'https://evil.example.com/x' }, A.admin).err, 'bad');
  assert.strictEqual(env.call({ a: 'setCfg', price_month: '50' }, A.admin).err, 'bad');
  assert.strictEqual(env.call({ a: 'setCfg', bank_no: '12ab' }, A.admin).err, 'bad');
  assert.ok(env.call({ a: 'setCfg', price_month: '2,000', qr_year: 'https://qr.kakaopay.com/ABC123' }, A.admin).ok);
  const i = env.call({ a: 'payInfo' }, tr.tok); assert.strictEqual(i.prices.month, 2000); assert.strictEqual(i.qr.year, 'https://qr.kakaopay.com/ABC123');
  assert.strictEqual(env.call({ a: 'payReq', plan: 'month' }, tr.tok).pending.amount, 2000);
});

t('기록: 타격감 기본 17, 범위 밖은 17, 좌측/우측 저장, 전반만 저장된 코스는 후반 기록 불가', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const id = A.reg(y.tok, '시험코스AB');
  A.save(y.tok, id, [{ i: 0, rec: rec('f', 2, 'L', 99) }, { i: 1, rec: { r: 'c', n: 1, d: 'R' } }]);
  const m = env.call({ a: 'course', id }, y.tok).mine; assert.strictEqual(m[0].p, 17); assert.strictEqual(m[0].d, 'L'); assert.strictEqual(m[1].p, 17);
  const f = A.front(y.tok, '임시코스AB'); assert.strictEqual(A.save(y.tok, f.id, [{ i: 10, rec: rec('f', 1) }]).err, 'bad'); assert.ok(A.save(y.tok, f.id, [{ i: 2, rec: rec('f', 1) }]).ok);
});

t('보안: 로그인 없이 불가, 비밀번호·토큰 원본은 시트에 없음, 5번 틀리면 잠김', () => {
  const A = fresh(); const env = A.env;
  for (const a of ['me', 'courses', 'payInfo', 'payReq', 'members', 'adminCfg', 'regFront']) assert.strictEqual(env.call({ a }).err, 'auth', a);
  const all = env.ss.sheets.map(s => JSON.stringify(s.cells)).join(''); assert.ok(!all.includes('"8259"') && !all.includes(A.admin));
  for (let i = 0; i < 4; i++) assert.strictEqual(A.login('관리자', '0001').err, 'login'); assert.strictEqual(A.login('관리자', '0001').err, 'lock');
});

t('개발자용 관리자 비밀번호 다시 만들기, 매일 정리(결제 시트 백업 포함)', () => {
  const A = fresh(); const env = A.env; env.ctx.devResetAdminPin();
  const pin = env.logs.filter(l => /새 비밀번호/.test(l)).pop().match(/(\d{4})$/)[1]; assert.ok(A.login('관리자', pin).ok);
  env.state.now += 70 * DAY; env.ctx.dailyMaintenance(); assert.strictEqual(env.ss.sheets.filter(s => /^bk\d{6}_/.test(s.name)).length, 4);
});

t('많은 데이터: 회원 150명·코스 60곳·기록 3,000줄에서도 3초 안에', () => {
  const A = fresh(); const env = A.env; const y = A.mk('연간이', 'year'); const ids = [];
  for (let i = 0; i < 60; i++) ids.push(A.reg(y.tok, '구장' + i + '번파크골프AB'));
  const sh = env.ss.getSheetByName('기록'); let r = sh.getLastRow() + 1; const js = JSON.stringify(Array(18).fill({ r: 'f', t: '', d: 'R', n: 3, p: 17, o: '바람' }));
  for (let u = 0; u < 50; u++) for (let c = 0; c < 60; c++, r++) { if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500); sh.getRange(r, 1, 1, 5).setNumberFormat('@').setValues([[ids[c], 'u' + u, 18, js, 1]]); }
  const t0 = Date.now(); assert.ok(env.call({ a: 'courses' }, y.tok).courses.length === 60); assert.ok(env.call({ a: 'members' }, A.admin).ok); assert.ok(Date.now() - t0 < 3000);
});

t('지점 코드: 설정 시트에 branch=yangju, 같은 지점은 통과, 다른 지점 주소는 거절, 지점 코드 없이 보내도 통과(예전 화면)', () => {
  const A = fresh(); const env = A.env;
  assert.strictEqual(env.call({ a: 'cfg' }).branch, 'yangju');
  assert.strictEqual(env.call({ a: 'adminCfg', b: 'yangju' }, A.admin).cfg.branch, 'yangju');
  assert.strictEqual(env.call({ a: 'me', b: 'uijeongbu' }, A.admin).err, 'branch');
  assert.ok(env.call({ a: 'me' }, A.admin).ok);
  const sh = env.ss.getSheetByName('설정'); let found = false;
  for (let k = 2; k <= sh.getLastRow(); k++) if (sh.getRange(k, 1).getValue() === 'branch' && sh.getRange(k, 2).getValue() === 'yangju') found = true;
  assert.ok(found, '설정 시트에 branch 줄이 있어야 함');
});

t('기간 계산: 체험→월간 30일·연간 365일(오늘부터), 종료 14일 전 연장은 다음 날부터 이어 붙임, 끝난 뒤 결제는 오늘부터', () => {
  const A = fresh(); const env = A.env; const DAYMS = 86400000;
  const today = env.call({ a: 'cfg' }).today;
  const add = (d, n) => { const p = d.split('-'); const t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return t.toISOString().slice(0, 10); };
  const pay = (tok, plan) => { const r = env.call({ a: 'payReq', plan }, tok); assert.ok(r.ok, JSON.stringify(r)); const d = env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.tok('관리자', '8259')); assert.ok(d.ok, JSON.stringify(d)); return d; };
  const m = A.mk('월체험', 'trial'); pay(m.tok, 'month');
  let u = A.me(m.tok).user; assert.deepStrictEqual([u.kind, u.start, u.end, u.left], ['month', today, add(today, 29), 29]);
  const y = A.mk('연체험', 'trial'); pay(y.tok, 'year');
  u = A.me(y.tok).user; assert.deepStrictEqual([u.kind, u.start, u.end, u.left], ['year', today, add(today, 364), 364]);
  assert.strictEqual(env.call({ a: 'payReq', plan: 'month' }, m.tok).err, 'nopay', '남은 날이 14일보다 많으면 아직 연장 불가');
  env.state.now += 16 * DAYMS; const t2 = env.call({ a: 'cfg' }).today; const mt = A.tok('월체험', m.pin);
  const pv = env.call({ a: 'payInfo' }, mt).preview.month; assert.deepStrictEqual([pv.start, pv.end], [add(today, 30), add(today, 59)], '미리보기 = 종료 다음 날부터 30일');
  pay(mt, 'month'); u = A.me(mt).user; assert.deepStrictEqual([u.start, u.end, u.left], [today, add(today, 59), 59 - 16]);
  env.state.now += 60 * DAYMS; const t3 = env.call({ a: 'cfg' }).today; const mt2 = A.tok('월체험', m.pin);
  assert.strictEqual(A.me(mt2).user.st, 'expired'); pay(mt2, 'month'); u = A.me(mt2).user;
  assert.deepStrictEqual([u.st, u.start, u.end], ['active', t3, add(t3, 29)], '끝난 뒤 결제 = 오늘부터');
});

t('두 번 승인 방지: 같은 결제를 두 번 승인해도 기간은 한 번만, 쓰기 요청마다 시트에 바로 기록(flush)', () => {
  const A = fresh(); const env = A.env; const today = env.call({ a: 'cfg' }).today;
  const w = A.mk('우리집', 'trial'); const r = env.call({ a: 'payReq', plan: 'month' }, w.tok);
  const f0 = env.state.flushes || 0;
  assert.ok(env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin).ok);
  assert.ok((env.state.flushes || 0) > f0, 'flush 호출');
  // 시트가 늦게 반영되는 상황을 흉내: 결제 줄을 다시 "대기"로 되돌려도 두 번째 승인은 거절
  const sh = env.ss.getSheetByName('결제'); sh.getRange(2, 7).setValue('pending');
  const again = env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin);
  assert.strictEqual(again.err, 'nopay');
  const u = A.me(w.tok).user; assert.strictEqual(u.left, 29); assert.strictEqual(u.start, today);
});

t('신뢰도: 가져가면 1점, 같은 코스 여러 번은 1점(날짜만 최근), 다른 코스는 따로, 되돌리기는 30분 안만, 목록은 본인·운영진만', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('원작자', 'year'), b = A.mk('가져감', 'month'), c = A.mk('또가져감', 'month');
  const c1 = A.reg(a.tok, '신뢰코스AB'), c2 = A.reg(a.tok, '신뢰코스CD');
  A.save(a.tok, c1, [{ i: 0, rec: rec('c', 2) }]); A.save(a.tok, c2, [{ i: 0, rec: rec('f', 1) }]);
  let r = env.call({ a: 'use', cid: c1, from: '원작자' }, b.tok); assert.ok(r.ok && r.created && r.trust === 1, JSON.stringify(r));
  env.state.now += 3600000;
  r = env.call({ a: 'use', cid: c1, from: '원작자' }, b.tok); assert.ok(r.ok && !r.created && r.trust === 1, '같은 코스 다시 → 그대로 1점');
  assert.ok(env.call({ a: 'unuse', cid: c1, from: '원작자' }, b.tok).removed === 0, '30분 지난 1점은 되돌리기로 안 빠짐');
  env.state.now += 60000; r = env.call({ a: 'use', cid: c2, from: '원작자' }, b.tok); assert.strictEqual(r.trust, 2, '다른 코스 → 2점');
  r = env.call({ a: 'use', cid: c1, from: '원작자' }, c.tok); assert.strictEqual(r.trust, 3, '다른 사람 → 3점');
  assert.strictEqual(env.call({ a: 'unuse', cid: c1, from: '원작자' }, c.tok).removed, 1, '방금 생긴 1점은 되돌리기로 빠짐');
  assert.strictEqual(A.me(a.tok).trust, 2);
  const list = env.call({ a: 'trust' }, a.tok); assert.strictEqual(list.trust, 2);
  assert.deepStrictEqual(list.list.map(x => [x.user, x.course]), [['가져감', '신뢰코스CD'], ['가져감', '신뢰코스AB']]);
  assert.ok(list.list[1].at > list.list[1].first, '같은 코스를 다시 가져가면 날짜가 최근으로');
  assert.strictEqual(env.call({ a: 'trust', nick: '원작자' }, b.tok).err, 'perm', '남의 목록은 못 봄');
  assert.strictEqual(env.call({ a: 'trust', nick: '원작자' }, A.admin).trust, 2, '관리자는 봄');
  const au = env.call({ a: 'course', id: c1 }, b.tok); assert.strictEqual(au.authors[0].trust, 2); assert.strictEqual(au.pick.trust, 2);
  assert.strictEqual(env.call({ a: 'members' }, A.admin).members.find(m => m.nick === '원작자').trust, 2);
  assert.strictEqual(env.call({ a: 'use', cid: c1, from: '가져감' }, a.tok).err, 'bad', '기록 없는 회원 것은 1점 안 됨');
  assert.strictEqual(env.call({ a: 'use', cid: c1, from: '원작자' }, a.tok).err, 'bad', '내 것은 안 됨');
  env.call({ a: 'delCourse', id: c2 }, A.admin); assert.strictEqual(A.me(a.tok).trust, 1, '코스를 지우면 그 코스 점수도 정리');
});

t('신뢰도 순서: 참고할 회원은 신뢰도 높은 순, 기간 끝난 회원은 1점을 줄 수 없음', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('하나', 'year'), b = A.mk('둘이', 'year'), u = A.mk('보는이', 'month');
  const cid = A.reg(a.tok, '순서코스AB');
  A.save(a.tok, cid, [{ i: 0, rec: rec('c', 1) }]); A.save(b.tok, cid, [{ i: 0, rec: rec('c', 2) }, { i: 1, rec: rec('c', 2) }]);
  assert.strictEqual(env.call({ a: 'course', id: cid }, u.tok).authors[0].nick, '둘이', '같은 신뢰도면 기록 많은 순');
  env.call({ a: 'use', cid, from: '하나' }, u.tok);
  assert.strictEqual(env.call({ a: 'course', id: cid }, u.tok).authors[0].nick, '하나', '신뢰도 높은 순');
  env.state.now += 40 * 86400000; const ut = A.tok('보는이', u.pin);
  assert.strictEqual(env.call({ a: 'use', cid, from: '둘이' }, ut).err, 'expired');
});

t('새 버전 탭(신뢰도)이 없는 예전 시트: setup 을 안 돌려도 처음 쓸 때 저절로 만들어짐', () => {
  const A = fresh(); const env = A.env;
  env.ss.sheets = env.ss.sheets.filter(s => s.name !== '신뢰도');
  const r = env.call({ a: 'me' }, A.admin); assert.ok(r.ok && r.trust === 0, JSON.stringify(r));
  assert.ok(env.ss.getSheetByName('신뢰도'), '탭이 생김');
});

console.log(`\n결과: ${ok} 통과 / ${bad} 실패`); process.exit(bad ? 1 : 0);
