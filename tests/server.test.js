// 서버 시험 v3 — 통합 서버(매장별 기록), 회원번호·닉네임, 등급·결제, 신뢰도, 문의·공지, 현황판, 보안
// 실행: node tests/server.test.js
const assert = require('assert');
const vm = require('vm');
const { createEnv } = require('./lz-mock');
let ok = 0, bad = 0;
function t(name, fn) { try { fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 3).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const DAY = 86400000;
const holes9 = (m = 50) => Array.from({ length: 9 }, (_, i) => [3 + (i % 3), m + i + 0.5]);
const rec = (r, n, d = 'R', p = 17, tt = '', o = '') => ({ r, n, d, p, t: tt, o });
const PINS4 = ['7391', '6482', '5273', '4164', '3925', '2816', '1947', '8053'];
const ADMIN_PIN = '825913';

function fresh() {
  const env = createEnv(); const msg = env.ctx.setup(); const pin = msg.match(/처음 비밀번호: (\d{6})/)[1];
  const A = { env, n: 0 };
  A.call = (p, tok) => env.call(p, tok);
  A.login = (nick, p) => env.call({ a: 'login', nick, pin: p, dev: 'test' });
  A.tok = (nick, p) => { const r = A.login(nick, p); assert.ok(r.ok, JSON.stringify(r)); return r.token; };
  A.admin = A.tok('관리자', pin);
  assert.ok(env.call({ a: 'pin', pin: ADMIN_PIN }, A.admin).ok);
  A.mk = (nick, kind, opt = {}) => {
    const r = env.call({ a: 'mCreate', nick, kind, home: opt.home }, opt.by || A.admin); assert.ok(r.ok, JSON.stringify(r));
    const tk = A.tok(nick, r.pin); const np = kind === 'op' ? String(613579 + A.n * 11).slice(0, 6) : PINS4[A.n % PINS4.length]; A.n++;
    const pr = env.call({ a: 'pin', pin: np }, tk); assert.ok(pr.ok, JSON.stringify(pr));
    return { tok: tk, pin: np, nick, uid: r.member.uid };
  };
  A.front = (tok, name, extra = {}) => env.call(Object.assign({ a: 'regFront', name, holes: holes9() }, extra), tok);
  A.reg = (tok, name, br) => { const f = A.front(tok, name, { confirm: 1, br }); assert.ok(f.ok, JSON.stringify(f)); const b = env.call({ a: 'regBack', id: f.id, holes: holes9(70), br }, tok); assert.ok(b.ok, JSON.stringify(b)); return f.id; };
  A.save = (tok, cid, items, br) => env.call({ a: 'save', cid, items, br }, tok);
  A.me = (tok, br) => env.call({ a: 'me', br }, tok);
  A.sheet = name => { const sh = env.ss.getSheetByName(name), out = []; for (let r = 2; r <= sh.getLastRow(); r++) { const row = []; for (let c = 1; c <= 23; c++) row.push(sh.getRange(r, c).getValue()); out.push(row); } return out; };
  return A;
}

console.log('\n[서버 시험 v3 — 통합 서버]');

t('setup: 시트 15개, 매장 2곳(양주·만송), 관리자 6자리·회원번호, 매일·매주 예약, 다시 실행해도 안전', () => {
  const A = fresh(); const env = A.env;
  assert.deepStrictEqual(env.ss.sheets.map(s => s.name), ['회원', '로그인기록', '코스', '기록', '공개설정', '결제', '설정', '이력', '신뢰도', '자주묻는질문', '문의', '지점', '공지', '그림', '환불신청']);
  const me = A.me(A.admin); assert.deepStrictEqual(me.branches.map(b => b.code), ['yangju', 'mansong']); assert.strictEqual(me.br, 'yangju');
  assert.ok(/^u\d+$/.test(me.user.uid)); assert.strictEqual(me.user.pinLen, 6);
  assert.ok(/이미 준비/.test(env.ctx.setup())); assert.strictEqual(A.me(A.admin).branches.length, 2, '매장이 늘지 않음');
  assert.deepStrictEqual(env.triggers.map(x => x.getHandlerFunction()).sort(), ['dailyMaintenance', 'weeklyBackup']);
  assert.strictEqual(env.call({ a: 'cfg' }).service, '파크골프 공략노트');
});

t('v2 → v3 옮기기: 닉네임으로 된 자료를 회원번호로, 기록·신뢰도·문의는 양주점으로, 로그인 유지, 운영진은 6자리로 바꾸게', () => {
  const env = createEnv(); env.ctx.setup();
  const sha = s => env.ctx.sha_(s), set = (name, row) => { const sh = env.ss.getSheetByName(name); const r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, row.length).setValues([row]); };
  /* v2 모양 자료 넣기(회원번호 칸 비움) */
  const salt = 'abc', hash = env.ctx.hashPin_('7391', salt), t0 = env.ctx.today_();
  set('회원', ['다람쥐', 'month', t0, env.ctx.addDays_(t0, 29), hash, salt, 0, 1, 0, 0, Date.now(), 0, 0, 0]);
  set('회원', ['예운영', 'op', '', '', hash, salt, 0, 1, 0, 0, Date.now(), 0, 0, 0]);
  set('로그인기록', [sha('oldtoken'), '다람쥐', Date.now() + 30 * DAY, 'phone', Date.now()]);
  set('코스', ['c7', '옛코스AB', '옛코스ab', '다람쥐', JSON.stringify(holes9().concat(holes9(70))), 1, 1, '다람쥐', 'done']);
  set('기록', ['c7', '다람쥐', 1, JSON.stringify([rec('c', 2)]), 5]);
  set('결제', ['p1', '다람쥐', 'month', 1000, 'kakao', '다람쥐', 'ok', 1, 1, '관리자', t0, t0, 0, 0]);
  set('신뢰도', ['다람쥐', '관리자', 'c7', 1, 1]);
  set('문의', ['q1', '다람쥐', 'app', '', '질문', 'open', 1, 1, 'user', JSON.stringify([{ by: '다람쥐', role: 'user', at: 1, html: 'x' }]), 1, 0, '']);
  env.ctx.setSetting_('schema', 0);
  const msg = env.ctx.setup(); assert.ok(/통합 서버로 옮겼어요/.test(msg), msg);
  const users = env.ss.getSheetByName('회원'); let uid = '', opRow = 0;
  for (let r = 2; r <= users.getLastRow(); r++) { if (users.getRange(r, 1).getValue() === '다람쥐') { uid = users.getRange(r, 15).getValue(); assert.strictEqual(users.getRange(r, 16).getValue(), 'yangju'); } if (users.getRange(r, 1).getValue() === '예운영') opRow = r; }
  assert.ok(/^u\d+$/.test(uid));
  assert.strictEqual(Number(users.getRange(opRow, 7).getValue()), 1, '운영자는 다음 로그인 때 6자리로 바꾸게');
  const g = (name, r, c) => env.ss.getSheetByName(name).getRange(r, c).getValue();
  assert.strictEqual(g('기록', 2, 2), uid); assert.strictEqual(g('기록', 2, 6), 'yangju');
  assert.strictEqual(g('코스', 2, 4), uid); assert.strictEqual(g('결제', 2, 2), uid); assert.strictEqual(g('결제', 2, 15), '다람쥐');
  assert.strictEqual(g('신뢰도', 2, 1), uid); assert.strictEqual(g('문의', 2, 2), uid); assert.strictEqual(g('문의', 2, 14), 'yangju');
  assert.strictEqual(JSON.parse(g('문의', 2, 10))[0].by, uid);
  const me = env.call({ a: 'me' }, 'oldtoken'); assert.ok(me.ok, '예전 로그인 그대로: ' + JSON.stringify(me)); assert.strictEqual(me.user.nick, '다람쥐');
  const cs = env.call({ a: 'course', id: 'c7', br: 'yangju' }, 'oldtoken'); assert.strictEqual(cs.mine[0].r, 'c'); assert.strictEqual(cs.course.reg, '다람쥐'); assert.strictEqual(cs.course.mineReg, true);
  assert.strictEqual(env.call({ a: 'trust' }, 'oldtoken').trust, 1);
  assert.ok(/이미 준비/.test(env.ctx.setup()), '다시 실행해도 안전'); assert.strictEqual(g('기록', 2, 2), uid, '두 번 옮기지 않음');
});

t('닉네임: 전체에서 중복 불가, 바꾸면 기록이 따라옴, 7일에 1번, 예전 이름은 7일 보호, 예전 이름으로 로그인하면 안내', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('다람쥐', 'month'), b = A.mk('너구리', 'month', { home: 'mansong' });
  assert.strictEqual(env.call({ a: 'mCreate', nick: '다람쥐', kind: 'trial' }, A.admin).err, 'dupnick', '전체 중복 불가');
  assert.strictEqual(env.call({ a: 'mCreate', nick: '다 람쥐', kind: 'trial' }, A.admin).err, 'dupnick', '띄어쓰기만 다른 이름도');
  const cid = A.reg(a.tok, '닉코스AB'); A.save(a.tok, cid, [{ i: 0, rec: rec('c', 3) }]);
  assert.strictEqual(env.call({ a: 'setNick', nick: '너구리' }, a.tok).err, 'dupnick');
  const r = env.call({ a: 'setNick', nick: '청설모' }, a.tok); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.user.nick, '청설모'); assert.strictEqual(r.user.prev, '다람쥐');
  assert.strictEqual(env.call({ a: 'course', id: cid }, a.tok).mine[0].n, 3, '기록이 따라옴'); assert.strictEqual(env.call({ a: 'course', id: cid }, a.tok).course.reg, '청설모');
  assert.strictEqual(env.call({ a: 'setNick', nick: '하늘이' }, a.tok).err, 'soon', '7일에 1번');
  assert.ok(/최근에 다른 분이 쓰던/.test(env.call({ a: 'mCreate', nick: '다람쥐', kind: 'trial' }, A.admin).msg), '예전 이름 보호');
  assert.ok(/바뀐 새 닉네임/.test(A.login('다람쥐', a.pin).msg));
  assert.ok(A.login('청설모', a.pin).ok);
  env.state.now += 8 * DAY;
  assert.ok(env.call({ a: 'mCreate', nick: '다람쥐', kind: 'trial' }, A.tok('관리자', ADMIN_PIN)).ok, '7일 뒤엔 다른 사람이 쓸 수 있음');
  const a2 = A.tok('청설모', a.pin); env.call({ a: 'payReq', plan: 'month' }, a2);
  env.state.now += 20 * DAY; const a3 = A.tok('청설모', a.pin);
  assert.strictEqual(env.call({ a: 'payReq', plan: 'month' }, a3).ok, true);
  assert.strictEqual(env.call({ a: 'setNick', nick: '하늘이' }, a3).err, 'pending', '입금 대기 중에는 못 바꿈');
  assert.strictEqual(env.call({ a: 'setNick', nick: '새관리' }, A.tok('관리자', ADMIN_PIN)).err, 'perm', '처음 관리자 계정은 이름 고정');
});

t('매장: 기록은 매장별, 다른 매장에서는 기본 매장 내 기록이 참고(ref)로, 매장 기억(useBranch), 기본 매장 30일에 1번', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('다람쥐', 'year'), b = A.mk('너구리', 'year');
  const cid = A.reg(a.tok, '매장코스AB');
  A.save(a.tok, cid, [{ i: 0, rec: rec('c', 2) }], 'yangju');
  let v = env.call({ a: 'course', id: cid, br: 'mansong' }, a.tok);
  assert.strictEqual(v.mine[0].r, '', '만송점 기록은 따로'); assert.strictEqual(v.ref.store, '제이드 양주점'); assert.strictEqual(v.ref.recs[0].n, 2, '양주(기본 매장) 내 기록 참고');
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'yangju' }, a.tok).ref, null, '기본 매장에서는 참고 없음');
  A.save(a.tok, cid, [{ i: 0, rec: rec('c', 5) }], 'mansong');
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'mansong' }, a.tok).mine[0].n, 5);
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'yangju' }, a.tok).mine[0].n, 2, '양주 기록은 그대로');
  A.save(b.tok, cid, [{ i: 0, rec: rec('f', 1) }], 'mansong');
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'yangju' }, a.tok).authors.length, 0, '양주에서는 너구리 만송 기록 안 보임');
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'mansong' }, a.tok).authors[0].nick, '너구리');
  const list = env.call({ a: 'courses', br: 'mansong' }, a.tok).courses.find(c => c.id === cid); assert.deepStrictEqual([list.mine, list.homeMine, list.others], [1, 1, 1]);
  assert.strictEqual(env.call({ a: 'useBranch', br: 'mansong' }, a.tok).store, '양주만송점');
  assert.strictEqual(A.login('다람쥐', a.pin).user.lastBr, 'mansong', '다음 로그인 때 만송점');
  assert.strictEqual(A.me(a.tok).br, 'mansong', '매장을 안 보내면 마지막 매장');
  const h = env.call({ a: 'setHome', br: 'mansong' }, a.tok); assert.strictEqual(h.user.home, 'mansong');
  assert.strictEqual(env.call({ a: 'setHome', br: 'yangju' }, a.tok).err, 'soon', '30일에 1번');
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'yangju' }, a.tok).ref.store, '양주만송점', '이제 기본 매장은 만송');
  assert.strictEqual(env.call({ a: 'me', br: 'nowhere' }, a.tok).err, 'branch');
});

t('운영자 소속 매장: 그 매장 회원만 보고 관리, 체험은 소속 매장으로, 소속은 관리자가 바꿈', () => {
  const A = fresh(); const env = A.env;
  const om = A.mk('만송운영', 'op', { home: 'mansong' }), oy = A.mk('양주운영', 'op', { home: 'yangju' });
  const y1 = A.mk('양주회원', 'trial', { home: 'yangju' });
  const t1 = env.call({ a: 'mCreate', nick: '만송체험', kind: 'trial', home: 'yangju' }, om.tok); assert.strictEqual(t1.member.home, 'mansong', '운영자가 만들면 소속 매장');
  assert.deepStrictEqual(env.call({ a: 'members' }, om.tok).members.map(m => m.nick).sort(), ['만송운영', '만송체험']);
  assert.strictEqual(env.call({ a: 'mUpdate', uid: y1.uid, op: 'trialExt' }, om.tok).err, 'perm', '다른 매장 회원은 못 건드림');
  assert.ok(env.call({ a: 'mUpdate', uid: y1.uid, op: 'trialExt' }, oy.tok).ok);
  assert.strictEqual(env.call({ a: 'mUpdate', uid: oy.uid, op: 'pin' }, om.tok).err, 'perm', '운영자끼리는 못 건드림');
  assert.strictEqual(env.call({ a: 'setHome', br: 'yangju' }, om.tok).err, 'perm');
  assert.ok(env.call({ a: 'mUpdate', uid: om.uid, op: 'home', br: 'yangju' }, A.admin).ok);
  assert.ok(env.call({ a: 'members' }, om.tok).members.some(m => m.nick === '양주회원'), '소속을 바꾸면 그 매장 회원이 보임');
  assert.strictEqual(env.call({ a: 'mCreate', nick: '월간이', kind: 'month' }, om.tok).err, 'perm', '운영자는 체험만');
  assert.strictEqual(env.call({ a: 'setCfg', price_year: 5000 }, om.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'payList' }, om.tok).err, 'perm');
});

t('체험 5일 + 하루씩 2번(최대 7일), 기간 끝나면 로그인·내 기록 보기만(다른 회원·쓰기·가져오기·등록 막힘)', () => {
  const A = fresh(); const env = A.env;
  const tr = A.mk('체험이', 'trial'), y = A.mk('연간이', 'year');
  const me = A.me(tr.tok).user, t0 = env.call({ a: 'cfg' }).today;
  assert.strictEqual(me.end, env.ctx.addDays_(t0, 4)); assert.strictEqual(me.left, 4);
  env.call({ a: 'mUpdate', uid: tr.uid, op: 'trialExt' }, A.admin); env.call({ a: 'mUpdate', uid: tr.uid, op: 'trialExt' }, A.admin);
  assert.strictEqual(A.me(tr.tok).user.end, env.ctx.addDays_(t0, 6)); assert.strictEqual(env.call({ a: 'mUpdate', uid: tr.uid, op: 'trialExt' }, A.admin).err, 'bad', '2번까지');
  const cid = A.reg(y.tok, '체험코스AB'); A.save(y.tok, cid, [{ i: 0, rec: rec('c', 1) }]); A.save(tr.tok, cid, [{ i: 1, rec: rec('f', 2) }]);
  env.state.now += 8 * DAY; const tt = A.tok('체험이', tr.pin);
  assert.strictEqual(A.me(tt).user.st, 'expired');
  const v = env.call({ a: 'course', id: cid }, tt); assert.strictEqual(v.mine[1].n, 2, '내 기록은 보임'); assert.strictEqual(v.authors.length, 0, '다른 회원 안 보임'); assert.strictEqual(v.pick, null);
  assert.strictEqual(A.save(tt, cid, [{ i: 0, rec: rec('c', 1) }]).err, 'expired');
  assert.strictEqual(env.call({ a: 'use', cid, from: y.uid }, tt).err, 'expired');
  assert.strictEqual(A.front(tt, '새코스AB').err, 'perm');
  assert.strictEqual(env.call({ a: 'courses' }, tt).courses.find(c => c.id === cid).others, 0);
  assert.ok(env.call({ a: 'payInfo' }, tt).ok, '결제는 가능');
});

t('결제(전 매장 공통): 체험→월간·연간, 14일 전 연장 이어 붙임, 두 번 승인 막기, 환불(9,000원 기준), 만송점에서도 같은 이용권', () => {
  const A = fresh(); const env = A.env; const t0 = env.call({ a: 'cfg' }).today, add = env.ctx.addDays_;
  const pay = (tok, plan) => { const r = env.call({ a: 'payReq', plan }, tok); assert.ok(r.ok, JSON.stringify(r)); const d = env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin); assert.ok(d.ok, JSON.stringify(d)); return r.pending.id; };
  const m = A.mk('월체험', 'trial', { home: 'mansong' }); pay(m.tok, 'month');
  let u = A.me(m.tok).user; assert.deepStrictEqual([u.kind, u.start, u.end, u.left], ['month', t0, add(t0, 29), 29]);
  assert.strictEqual(A.me(m.tok, 'yangju').user.st, 'active', '다른 매장에서도 같은 이용권');
  const y = A.mk('연체험', 'trial'); const pid = pay(y.tok, 'year');
  assert.strictEqual(env.call({ a: 'payRefund', id: pid }, A.admin).calc.amount, 9000);
  const w = A.mk('우리집', 'trial'); const r = env.call({ a: 'payReq', plan: 'month' }, w.tok);
  assert.ok(env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin).ok);
  env.ss.getSheetByName('결제').getRange(env.ss.getSheetByName('결제').getLastRow(), 7).setValue('pending');
  assert.strictEqual(env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin).err, 'nopay', '두 번 승인 막음'); assert.strictEqual(A.me(w.tok).user.left, 29);
  assert.strictEqual(env.call({ a: 'payReq', plan: 'month' }, m.tok).err, 'nopay', '14일보다 많이 남으면 연장 불가');
  env.state.now += 16 * DAY; const mt = A.tok('월체험', m.pin); pay(mt, 'month');
  u = A.me(mt).user; assert.deepStrictEqual([u.start, u.end], [t0, add(t0, 59)]);
  const list = env.call({ a: 'payList' }, A.tok('관리자', ADMIN_PIN)); assert.ok(list.recent.every(p => p.nick), '결제 목록에 지금 닉네임');
});

t('신뢰도: 같은 매장 기록만 가져오기, 같은 사람·매장·코스는 1점, 다른 매장은 따로 1점, 점수는 합쳐서, 목록에 매장', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('원작자', 'year'), b = A.mk('가져감', 'year');
  const cid = A.reg(a.tok, '신뢰코스AB');
  A.save(a.tok, cid, [{ i: 0, rec: rec('c', 2) }], 'yangju');
  assert.strictEqual(env.call({ a: 'use', cid, from: a.uid, br: 'mansong' }, b.tok).err, 'bad', '만송에는 원작자 기록 없음');
  let r = env.call({ a: 'use', cid, from: a.uid, br: 'yangju' }, b.tok); assert.ok(r.created && r.trust === 1);
  env.state.now += 60000; r = env.call({ a: 'use', cid, from: a.uid, br: 'yangju' }, b.tok); assert.ok(!r.created && r.trust === 1);
  A.save(a.tok, cid, [{ i: 0, rec: rec('c', 4) }], 'mansong');
  env.state.now += 60000; r = env.call({ a: 'use', cid, from: a.uid, br: 'mansong' }, b.tok); assert.strictEqual(r.trust, 2, '다른 매장은 따로');
  assert.strictEqual(env.call({ a: 'unuse', cid, from: a.uid, br: 'mansong' }, b.tok).removed, 1, '방금 생긴 1점은 되돌리기로 빠짐');
  env.call({ a: 'use', cid, from: a.uid, br: 'mansong' }, b.tok);
  const l = env.call({ a: 'trust' }, a.tok); assert.strictEqual(l.trust, 2); assert.deepStrictEqual(l.list.map(x => [x.user, x.store]), [['가져감', '양주만송점'], ['가져감', '제이드 양주점']]);
  assert.strictEqual(A.me(a.tok).trust, 2);
  assert.strictEqual(env.call({ a: 'trust', uid: a.uid }, b.tok).err, 'perm'); assert.strictEqual(env.call({ a: 'trust', uid: a.uid }, A.admin).trust, 2);
  assert.strictEqual(env.call({ a: 'course', id: cid, br: 'yangju' }, b.tok).authors[0].trust, 2);
});

t('문의: 매장별(운영자는 소속 매장 문의만), 결제·매장 추가 요청은 관리자만 답변, 알림 숫자, 시험 모드', () => {
  const A = fresh(); const env = A.env; env.call({ a: 'setCfg', qna_mode: 'on' }, A.admin);
  const m = A.mk('문의이', 'month'), om = A.mk('만송운영', 'op', { home: 'mansong' }), oy = A.mk('양주운영', 'op', { home: 'yangju' });
  const ask = (cat, br) => env.call({ a: 'qnaAsk', cat, title: cat, html: '<b>질문</b>', br }, m.tok).qna;
  const qy = ask('app', 'yangju'), qm = ask('course', 'mansong'), qb = ask('branch', 'yangju');
  assert.deepStrictEqual(env.call({ a: 'qnaList' }, om.tok).list.map(x => x.id), [qm.id], '만송 운영자는 만송 문의만');
  assert.strictEqual(env.call({ a: 'qnaGet', id: qy.id }, om.tok).err, 'noqna');
  assert.ok(env.call({ a: 'qnaReply', id: qy.id, html: '답' }, oy.tok).ok);
  assert.strictEqual(env.call({ a: 'qnaReply', id: qb.id, html: '답' }, oy.tok).err, 'perm', '매장 추가 요청은 관리자만');
  assert.ok(env.call({ a: 'qnaReply', id: qb.id, html: '만들어 드릴게요' }, A.admin).ok);
  assert.strictEqual(A.me(m.tok).qna, 2); assert.strictEqual(A.me(om.tok).qna, 1); assert.strictEqual(A.me(A.admin).qna, 1);
  const g = env.call({ a: 'qnaGet', id: qb.id }, m.tok); assert.strictEqual(g.qna.msgs[1].by, '관리자'); assert.strictEqual(g.qna.store, '제이드 양주점');
  env.call({ a: 'setCfg', qna_mode: 'test', qna_testers: '' }, A.admin); assert.strictEqual(A.me(m.tok).qnaOn, false); assert.strictEqual(A.me(om.tok).qnaOn, true);
  assert.strictEqual(env.call({ a: 'faqList' }, om.tok).faq.length, 11, 'FAQ 처음 11개');
});

t('문의 제한·글자 꾸미기 안전·자동 정리', () => {
  const A = fresh(); const env = A.env; env.call({ a: 'setCfg', qna_mode: 'on' }, A.admin);
  const m = A.mk('많이', 'month');
  for (let i = 0; i < 3; i++) assert.ok(env.call({ a: 'qnaAsk', cat: 'etc', title: 't' + i, html: 'x' }, m.tok).ok);
  assert.strictEqual(env.call({ a: 'qnaAsk', cat: 'etc', title: 't4', html: 'x' }, m.tok).err, 'limit');
  env.call({ a: 'qnaList' }, m.tok).list.forEach(q => env.call({ a: 'qnaClose', id: q.id }, m.tok));
  const r = env.call({ a: 'qnaAsk', cat: 'etc', title: '<b>제목</b>', html: '<img src=x onerror=alert(1)><b onclick=x>a</b><span class="c-r">빨강</span><script>y</script>' }, m.tok);
  const h = r.qna.msgs[0].html; assert.ok(!/<img|onerror|onclick|script/i.test(h) && /<span class="c-r">빨강<\/span>/.test(h), h); assert.ok(!/[<>]/.test(r.qna.title));
  assert.strictEqual(env.call({ a: 'qnaAsk', cat: 'etc', title: 'l', html: 'a'.repeat(501) }, m.tok).err, 'big');
  env.call({ a: 'qnaReply', id: r.qna.id, html: '답' }, A.admin);
  env.state.now += 8 * DAY; env.ctx.dailyMaintenance();
  const ad = A.tok('관리자', ADMIN_PIN); assert.strictEqual(env.call({ a: 'qnaList' }, ad).list.find(x => x.id === r.qna.id).status, 'closed');
  env.state.now += 366 * DAY; env.ctx.dailyMaintenance(); assert.strictEqual(env.call({ a: 'qnaList' }, A.tok('관리자', ADMIN_PIN)).list.length, 0);
});

t('공지: 관리자는 모든 매장·특정 매장, 운영자는 소속 매장만, 게시 기간·상단 고정·팝업, 앱을 열 때 목록(me.notices)', () => {
  const A = fresh(); const env = A.env; const t0 = env.call({ a: 'cfg' }).today, add = env.ctx.addDays_;
  const om = A.mk('만송운영', 'op', { home: 'mansong' }), m = A.mk('회원이', 'month');
  assert.ok(env.call({ a: 'noticeSave', br: '', title: '전체 공지', html: '<b>요금</b> 안내', popup: 1 }, A.admin).ok);
  assert.ok(env.call({ a: 'noticeSave', br: 'mansong', title: '만송 오픈', html: '오픈했어요', pin: 1 }, om.tok).ok);
  assert.strictEqual(env.call({ a: 'noticeSave', br: 'yangju', title: 'x', html: 'x' }, om.tok).err, 'perm', '운영자는 다른 매장 공지 불가');
  assert.strictEqual(env.call({ a: 'noticeSave', br: '', title: 'x', html: 'x' }, om.tok).err, 'perm', '운영자는 전체 공지 불가');
  assert.strictEqual(env.call({ a: 'noticeSave', br: '', title: 'x', html: 'x' }, m.tok).err, 'perm', '회원은 불가');
  env.call({ a: 'noticeSave', br: '', title: '나중 공지', html: '곧', start: add(t0, 3) }, A.admin);
  assert.deepStrictEqual(env.call({ a: 'noticeList', br: 'mansong' }, m.tok).list.filter(n => n.id !== 'npromo1').map(n => n.title), ['만송 오픈', '전체 공지'], '고정 먼저, 시작 전 공지는 안 보임');
  assert.deepStrictEqual(env.call({ a: 'noticeList', br: 'yangju' }, m.tok).list.filter(n => n.id !== 'npromo1').map(n => n.title), ['전체 공지']);
  const heads = A.me(m.tok, 'mansong').notices; assert.strictEqual(heads.length, 3, '홍보 공지 포함'); assert.strictEqual(heads.find(n => n.title === '전체 공지').popup, 1);
  const mg = env.call({ a: 'noticeList', manage: 1 }, om.tok).list; assert.ok(mg.find(n => n.title === '만송 오픈').canEdit && !mg.find(n => n.title === '전체 공지').canEdit);
  const id = mg.find(n => n.title === '만송 오픈').id;
  assert.ok(env.call({ a: 'noticeDel', id }, om.tok).ok);
  env.state.now += 4 * DAY; assert.ok(env.call({ a: 'noticeList', br: 'yangju' }, A.tok('회원이', m.pin)).list.some(n => n.title === '나중 공지'), '시작일이 되면 보임');
});

t('현황판: 매장별 회원 수·오늘 접속·곧 끝나는 회원·최근 가입·입금 대기·답변 대기, 이번 달 결제는 관리자만', () => {
  const A = fresh(); const env = A.env; env.call({ a: 'setCfg', qna_mode: 'on' }, A.admin);
  const om = A.mk('만송운영', 'op', { home: 'mansong' });
  const a = A.mk('양주월간', 'month', { home: 'yangju' }), b = A.mk('만송체험', 'trial', { home: 'mansong' }), c = A.mk('만송연간', 'year', { home: 'mansong' });
  const r = env.call({ a: 'payReq', plan: 'year' }, b.tok); env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin);
  env.call({ a: 'payReq', plan: 'month' }, A.mk('대기이', 'trial', { home: 'mansong' }).tok);
  env.call({ a: 'qnaAsk', cat: 'app', title: 'x', html: 'x', br: 'mansong' }, c.tok);
  const d = env.call({ a: 'dash' }, A.admin);
  assert.strictEqual(d.total.all, 4); const ms = d.branches.find(x => x.code === 'mansong'); assert.deepStrictEqual([ms.year, ms.trial, ms.all], [2, 1, 3]);
  assert.strictEqual(d.month.amount, 9000); assert.strictEqual(d.pending, 1); assert.strictEqual(d.qnaOpen, 1); assert.ok(d.today >= 4);
  assert.ok(d.soon.some(x => x.nick === '대기이'), '체험 5일 → 곧 끝남'); assert.strictEqual(d.recent.length, 4);
  const dm = env.call({ a: 'dash', br: 'mansong' }, A.admin); assert.strictEqual(dm.total.all, 3);
  const od = env.call({ a: 'dash', br: 'yangju' }, om.tok); assert.strictEqual(od.br, 'mansong', '운영자는 소속 매장만'); assert.strictEqual(od.month, undefined, '운영자에게 결제 금액 없음'); assert.strictEqual(od.qnaOpen, 1);
  assert.strictEqual(env.call({ a: 'dash' }, a.tok).err, 'perm');
});

t('매장 관리(관리자): 매장 추가(앱에서 바로), 코드 규칙, 이름 바꾸기, 닫으면 회원은 못 고름', () => {
  const A = fresh(); const env = A.env;
  const m = A.mk('회원이', 'year');
  assert.strictEqual(env.call({ a: 'branchSave', code: 'Su Yu', name: '강북수유점', create: 1 }, A.admin).err, 'bad');
  const l = env.call({ a: 'branchSave', code: 'suyu', name: '강북수유점', create: 1 }, A.admin); assert.deepStrictEqual(l.branches.map(b => b.code), ['yangju', 'mansong', 'suyu']);
  assert.ok(A.me(m.tok).branches.some(b => b.code === 'suyu'), '회원에게 바로 보임');
  assert.strictEqual(env.call({ a: 'me', br: 'suyu' }, m.tok).store, '강북수유점');
  env.call({ a: 'branchSave', code: 'suyu', name: '수유점', active: 0 }, A.admin);
  assert.ok(!A.me(m.tok).branches.some(b => b.code === 'suyu'), '닫으면 안 보임'); assert.strictEqual(env.call({ a: 'me', br: 'suyu' }, m.tok).br, 'yangju', '닫힌 매장을 보내면 기본 매장으로');
  assert.strictEqual(env.call({ a: 'me', br: 'suyu' }, A.admin).br, 'suyu', '관리자는 닫힌 매장도 볼 수 있음');
  assert.strictEqual(env.call({ a: 'setHome', br: 'suyu' }, m.tok).err, 'branch');
  assert.strictEqual(env.call({ a: 'branchSave', code: 'x1', name: 'x', create: 1 }, m.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'cfg', br: 'mansong' }).store, '양주만송점', '로그인 화면용 매장 이름');
});

t('보안: 잠금이 점점 길어짐(10분→1시간→하루), 닉네임별·전체 시도 수 제한, 운영진 6자리, 쉬운 번호 거절, 다른 폰 로그아웃', () => {
  const A = fresh(); const env = A.env;
  const m = A.mk('잠금이', 'month');
  const fail5 = () => { let r; for (let i = 0; i < 5; i++) r = A.login('잠금이', '0000'); return r; };
  assert.strictEqual(fail5().min, 10); env.state.now += 11 * 60000;
  assert.strictEqual(fail5().min, 60); env.state.now += 61 * 60000;
  assert.strictEqual(fail5().min, 1440); env.state.now += 1441 * 60000;
  assert.ok(A.login('잠금이', m.pin).ok, '맞히면 풀림');
  let last; for (let i = 0; i < 16; i++) last = A.login('없는사람', '1111'); assert.strictEqual(last.err, 'lock', '없는 닉네임도 10분에 15번까지');
  env.state.now += 11 * 60000;
  const op = env.call({ a: 'mCreate', nick: '육자리', kind: 'op' }, A.admin); assert.strictEqual(op.pin.length, 6);
  const ot = A.tok('육자리', op.pin); assert.strictEqual(A.me(ot).user.pinLen, 6);
  assert.strictEqual(env.call({ a: 'pin', pin: '4821' }, ot).err, 'bad', '운영자는 6자리');
  assert.strictEqual(env.call({ a: 'pin', pin: '123456' }, ot).err, 'weak'); assert.strictEqual(env.call({ a: 'pin', pin: '121212' }, ot).err, 'weak');
  assert.ok(env.call({ a: 'pin', pin: '583917' }, ot).ok);
  env.call({ a: 'mUpdate', uid: m.uid, op: 'kind', kind: 'op' }, A.admin);
  assert.strictEqual(A.login('잠금이', m.pin).user.must, 1, '운영자가 되면 다음 로그인 때 6자리로 바꾸게');
  const t1 = A.tok('잠금이', m.pin), t2 = A.tok('잠금이', m.pin);
  assert.ok(env.call({ a: 'pin', pin: '683914', others: 1 }, t1).ok);
  assert.strictEqual(A.me(t2).err, 'auth', '다른 폰은 로그아웃'); assert.ok(A.me(t1).ok, '이 폰은 그대로');
  const all = env.ss.sheets.map(s => JSON.stringify(s.cells)).join(''); assert.ok(!all.includes('"683914"') && !all.includes(t1), '비밀번호·토큰 원본 없음');
  for (let i = 0; i < 130; i++) A.login('사람' + i, '1111'); assert.strictEqual(A.login('또다른', '1111').err, 'busy', '전체 1분당 제한');
});

t('코스 이름 규칙: 같으면 거절, 조합 다르면 새 코스, 줄인 이름은 정식 이름 제안, 숫자만 다르면 다른 코스', () => {
  const A = fresh(); const env = A.env; const y = A.mk('등록이', 'year');
  A.reg(y.tok, '목행충주호파크골프AB');
  assert.strictEqual(A.front(y.tok, '목행충주호파크골프AB').err, 'dup');
  assert.ok(A.front(y.tok, '목행충주호파크골프BC').ok);
  const s = A.front(y.tok, '목행충주CD'); assert.strictEqual(s.err, 'suggest'); assert.strictEqual(s.suggest, '목행충주호파크골프CD');
  A.reg(y.tok, '양주1구장AB'); assert.ok(A.front(y.tok, '양주2구장AB').ok);
  A.reg(y.tok, '호수바위가나'); assert.strictEqual(A.front(y.tok, '호수바위다라').err, 'similar'); assert.ok(A.front(y.tok, '호수바위다라', { confirm: 1 }).ok);
});

t('코스 권한: 등록자(회원번호)·운영자는 고치기, 이름은 운영진만, 지우기는 관리자, 전반만 저장된 코스는 본인만 보임', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('등록이', 'year'), b = A.mk('남이', 'year'), op = A.mk('운영이', 'op', { home: 'mansong' });
  const f = A.front(a.tok, '반쪽코스AB', { confirm: 1 }); assert.ok(!env.call({ a: 'courses' }, b.tok).courses.some(c => c.id === f.id));
  const cid = A.reg(a.tok, '권한코스AB');
  const H = Array.from({ length: 9 }, () => [3, 40]);
  assert.ok(env.call({ a: 'editCourse', id: cid, front: H }, a.tok).ok);
  assert.strictEqual(env.call({ a: 'editCourse', id: cid, front: H }, b.tok).err, 'perm');
  assert.ok(env.call({ a: 'editCourse', id: cid, front: H, name: '권한코스CD', br: 'mansong' }, op.tok).ok, '어느 매장 운영자든 코스 수정(코스는 공통)');
  assert.strictEqual(env.call({ a: 'editCourse', id: cid, name: '바꿔AB' }, a.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'delCourse', id: cid }, op.tok).err, 'perm'); assert.ok(env.call({ a: 'delCourse', id: cid }, A.admin).ok);
});

t('대기열: 좌석 2개, 3번째는 대기, 로그아웃하면 들어감, 운영진은 대기 없음', () => {
  const A = fresh(); const env = A.env;
  const a = A.mk('하나', 'year'), b = A.mk('둘이', 'year'), c = A.mk('셋이', 'year'); env.call({ a: 'setCfg', seats: 2 }, A.admin);
  delete env.cache.seats; delete env.cache.queue;
  assert.ok(A.me(a.tok).ok); assert.ok(A.me(b.tok).ok); const q = A.me(c.tok); assert.strictEqual(q.err, 'queue'); assert.strictEqual(q.ahead, 0);
  env.call({ a: 'logout' }, a.tok); assert.ok(A.me(c.tok).ok);
  assert.ok(A.me(A.admin).ok);
});

t('기록: 타격감 기본 17, 범위 밖은 17, 좌측/우측, 전반만 저장된 코스는 후반 기록 불가', () => {
  const A = fresh(); const env = A.env; const y = A.mk('기록이', 'year');
  const cid = A.reg(y.tok, '기록코스AB');
  A.save(y.tok, cid, [{ i: 0, rec: { r: 'c', n: 2, d: 'L', p: 99 } }, { i: 1, rec: { r: 'f', n: 0 } }]);
  const m = env.call({ a: 'course', id: cid }, y.tok).mine; assert.deepStrictEqual([m[0].p, m[0].d, m[1].p, m[2].p], [17, 'L', 17, 17]);
  const f = A.front(y.tok, '반코스AB', { confirm: 1 }); assert.strictEqual(A.save(y.tok, f.id, [{ i: 10, rec: rec('c', 1) }]).err, 'bad');
});

t('매일 정리: 백업 시트 7일, 1년 지난 입금자 이름 가림 / 매주 백업: 드라이브에 사본, 8주 보관', () => {
  const A = fresh(); const env = A.env;
  const m = A.mk('입금이', 'trial'); const r = env.call({ a: 'payReq', plan: 'month', depositor: '주영수' }, m.tok); env.call({ a: 'payDecide', id: r.pending.id, ok: 1 }, A.admin);
  env.ctx.dailyMaintenance(); assert.ok(env.ss.sheets.some(s => /^bk\d{6}_결제/.test(s.name)));
  env.state.now += 370 * DAY; env.ctx.dailyMaintenance();
  assert.strictEqual(env.ss.getSheetByName('결제').getRange(2, 6).getValue(), '*', '입금자 이름 가림');
  for (let i = 0; i < 10; i++) { env.state.now += 7 * DAY; env.ctx.weeklyBackup(); }
  const files = env.ctx.DriveApp._files.filter(f => !f.trashed); assert.strictEqual(files.length, 8);
});

t('관리자 비밀번호 다시 만들기(6자리), 활동 기록 보기', () => {
  const A = fresh(); const env = A.env;
  const m = env.ctx.devResetAdminPin(); const pin = m.match(/(\d{6})$/)[1];
  assert.strictEqual(A.me(A.admin).err, 'auth', '기존 로그인 끊김'); const t1 = A.tok('관리자', pin); assert.strictEqual(A.me(t1).user.must, 1);
  assert.strictEqual(env.call({ a: 'log' }, t1).err, 'must', '새 비밀번호로 바꾸기 전에는 다른 기능 막힘(서버에서)');
  assert.ok(env.call({ a: 'pin', pin: '582914' }, t1).ok);
  const log = env.call({ a: 'log' }, t1); assert.ok(log.ok && log.list.some(x => /비밀번호 변경/.test(x.act)));
});

t('많은 데이터: 회원 150명·코스 60곳·기록 3,000줄에서도 3초 안에', () => {
  const A = fresh(); const env = A.env; const y = A.mk('많이', 'year');
  const us = env.ss.getSheetByName('회원'); for (let i = 0; i < 150; i++) { const r = us.getLastRow() + 1; us.getRange(r, 1, 1, 23).setValues([['n' + i, 'year', '2026-01-01', '2099-01-01', 'h', 's', 0, 1, 0, 0, 1, 0, 0, 0, 'u9' + i, 'yangju', 0, 0, '', 0, 'yangju', 0, 4]]); }
  const cs = env.ss.getSheetByName('코스'); const ids = [];
  for (let c = 0; c < 60; c++) { const r = cs.getLastRow() + 1; ids.push('c9' + c); cs.getRange(r, 1, 1, 9).setValues([['c9' + c, 'C' + c + 'AB', 'c' + c + 'ab', 'u1', JSON.stringify(holes9().concat(holes9())), 1, 1, 'u1', 'done']]); }
  env.cache.courses && delete env.cache.courses;
  const sh = env.ss.getSheetByName('기록'); const js = JSON.stringify(Array.from({ length: 18 }, () => rec('c', 1))); let r = 2;
  for (let u = 0; u < 50; u++) for (let c = 0; c < 60; c++, r++) { if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500); sh.getRange(r, 1, 1, 6).setNumberFormat('@').setValues([[ids[c], 'u9' + u, 18, js, 1, 'yangju']]); }
  const t0 = Date.now(); assert.strictEqual(env.call({ a: 'courses' }, y.tok).courses.length, 60); assert.ok(env.call({ a: 'members' }, A.admin).ok); assert.ok(env.call({ a: 'dash' }, A.admin).ok); assert.ok(Date.now() - t0 < 3000, (Date.now() - t0) + 'ms');
});

/* ───────── v3.1: 직접 가입 · 추천 보상 · 공지 그림/단추 ───────── */
const DEV = (n) => ('d' + n).padEnd(32, 'a').replace(/[^a-f0-9]/g, 'a');
t('직접 가입: 닉네임·기본 매장·비밀번호로 바로 체험 5일, 로그인 상태로 시작, 닉네임 중복·쉬운 번호·동의·닫힌 매장 거절', () => {
  const A = fresh(); const env = A.env;
  assert.strictEqual(env.call({ a: 'cfg' }).join.on, true, '처음에는 켜짐');
  assert.strictEqual(env.call({ a: 'joinCheck', nick: '관리자' }).res.code, 'dupnick');
  assert.strictEqual(env.call({ a: 'joinCheck', nick: '새친구' }).res, null);
  const base = { a: 'join', nick: '새친구', pin: '2580', br: 'mansong', agree: 1, dev: DEV(1) };
  assert.strictEqual(env.call(Object.assign({}, base, { pin: '1234' })).err, 'weak');
  assert.strictEqual(env.call(Object.assign({}, base, { agree: 0 })).err, 'bad');
  assert.strictEqual(env.call(Object.assign({}, base, { br: 'nowhere' })).err, 'branch');
  assert.strictEqual(env.call(Object.assign({}, base, { dev: 'x' })).err, 'dev');
  const r = env.call(base); assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual([r.user.kind, r.user.home, r.user.must, r.user.left], ['trial', 'mansong', 0, 4]);
  assert.strictEqual(A.me(r.token).br, 'mansong', '기본 매장으로 시작');
  assert.ok(A.login('새친구', '2580').ok, '정한 비밀번호로 로그인');
  assert.strictEqual(env.call(Object.assign({}, base, { dev: DEV(2) })).err, 'dupnick', '같은 닉네임 다시 가입 불가');
  const mem = env.call({ a: 'members' }, A.admin).members.find(m => m.nick === '새친구'); assert.deepStrictEqual([mem.src, mem.isNew], ['self', 1]);
  assert.strictEqual(env.call({ a: 'members' }, A.admin).members.find(m => m.nick === '관리자').src, 'staff');
});
t('직접 가입 악용 막기: 한 폰 30일에 1번(그 닉네임 알려 줌), 하루 한도, 관리자가 끄기, 같은 폰 계정 수 표시', () => {
  const A = fresh(); const env = A.env;
  assert.ok(env.call({ a: 'join', nick: '하나', pin: '2580', br: 'yangju', agree: 1, dev: DEV(3) }).ok);
  const again = env.call({ a: 'join', nick: '둘째', pin: '2580', br: 'yangju', agree: 1, dev: DEV(3) }); assert.strictEqual(again.err, 'dev'); assert.ok(/하나/.test(again.msg));
  env.state.now += 31 * DAY;
  assert.ok(env.call({ a: 'join', nick: '둘째', pin: '2580', br: 'yangju', agree: 1, dev: DEV(3) }).ok, '30일 뒤에는 가능');
  assert.strictEqual(env.call({ a: 'members' }, A.admin).members.find(m => m.nick === '둘째').sameDev, 1, '같은 폰 다른 계정 1개');
  assert.ok(env.call({ a: 'setCfg', join_per_day: 2 }, A.admin).ok);
  assert.ok(env.call({ a: 'join', nick: '셋째', pin: '2580', br: 'yangju', agree: 1, dev: DEV(4) }).ok);
  assert.strictEqual(env.call({ a: 'join', nick: '넷째', pin: '2580', br: 'yangju', agree: 1, dev: DEV(5) }).err, 'busy', '하루 한도');
  assert.ok(env.call({ a: 'setCfg', join_mode: 'off', join_per_day: 100 }, A.admin).ok);
  assert.strictEqual(env.call({ a: 'cfg' }).join.on, false);
  assert.strictEqual(env.call({ a: 'join', nick: '넷째', pin: '2580', br: 'yangju', agree: 1, dev: DEV(5) }).err, 'off');
});
t('운영자: 소속 매장 체험회원 이용 중지 가능(월간은 불가), 관리자 닉네임 정리(예전 이름 바로 풀림), 닉네임 확인 요청은 관리자만 답변', () => {
  const A = fresh(); const env = A.env; const op = A.mk('운영', 'op');
  const j = env.call({ a: 'join', nick: '장난', pin: '2580', br: 'yangju', agree: 1, dev: DEV(6) }); const mo = A.mk('월간', 'month');
  assert.ok(env.call({ a: 'mUpdate', uid: j.user.uid, op: 'active', on: 0 }, op.tok).ok, '체험 중지');
  assert.strictEqual(A.login('장난', '2580').err, 'off');
  assert.strictEqual(env.call({ a: 'mUpdate', uid: mo.uid, op: 'active', on: 0 }, op.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'mUpdate', uid: j.user.uid, op: 'rename', to: '정리됨' }, op.tok).err, 'perm');
  assert.ok(env.call({ a: 'mUpdate', uid: j.user.uid, op: 'rename', to: '정리됨' }, A.admin).ok);
  assert.ok(env.call({ a: 'join', nick: '장난', pin: '2580', br: 'yangju', agree: 1, dev: DEV(7) }).ok, '정리된 예전 이름은 바로 쓸 수 있음');
  assert.ok(env.call({ a: 'setCfg', qna_mode: 'on' }, A.admin).ok);
  const q = env.call({ a: 'qnaAsk', cat: 'nick', title: '제 닉네임', html: '누가 써요' }, mo.tok); assert.ok(q.ok);
  assert.strictEqual(env.call({ a: 'qnaReply', id: q.qna.id, html: 'x' }, op.tok).err, 'perm');
});
t('추천 보상: 초대 링크로 가입한 친구가 월간·연간을 결제(승인)하면 초대한 회원 +7일, 한 친구당 한 번, 환불하면 다시 뺌, 같은 폰 추천은 무시', () => {
  const A = fresh(); const env = A.env; const me = A.mk('초대왕', 'month');
  const end0 = A.me(me.tok).user.end;
  const f = env.call({ a: 'join', nick: '친구1', pin: '2580', br: 'yangju', agree: 1, dev: DEV(8), ref: me.uid }); assert.ok(f.ok);
  assert.strictEqual(env.call({ a: 'refInfo' }, me.tok).friends.length, 1);
  const pay = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, f.token); assert.ok(pay.ok);
  const d = env.call({ a: 'payDecide', id: pay.pending.id, ok: 1 }, A.admin); assert.ok(d.ok && d.reward && d.reward.days === 7, JSON.stringify(d.reward));
  const end1 = A.me(me.tok).user.end; assert.strictEqual(Date.parse(end1) - Date.parse(end0), 7 * DAY, end0 + ' → ' + end1);
  const ri = env.call({ a: 'refInfo' }, me.tok); assert.deepStrictEqual([ri.friends[0].paid, ri.total], [1, 7]);
  env.state.now += 20 * DAY;
  const pay2 = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, f.token); assert.ok(pay2.ok, JSON.stringify(pay2));
  assert.ok(env.call({ a: 'payDecide', id: pay2.pending.id, ok: 1 }, A.admin).ok); assert.strictEqual(A.me(me.tok).user.end, end1, '두 번째 결제에는 보상 없음');
  assert.strictEqual(env.call({ a: 'payRefund', id: pay.pending.id, confirm: 1 }, A.admin).err, 'nopay', '최근 결제부터 환불');
  assert.ok(env.call({ a: 'payRefund', id: pay2.pending.id, confirm: 1 }, A.admin).ok); assert.strictEqual(A.me(me.tok).user.end, end1, '보상과 무관한 결제 환불은 그대로');
  assert.ok(env.call({ a: 'payRefund', id: pay.pending.id, confirm: 1 }, A.admin).ok); assert.strictEqual(A.me(me.tok).user.end, end0, '보상받은 결제를 환불하면 7일 뺌');
  /* 기간 끝난 회원도 보상을 받으면 오늘부터 7일 */
  env.state.now += 35 * DAY; assert.strictEqual(A.me(me.tok).user.st, 'expired');
  const g = env.call({ a: 'join', nick: '친구2', pin: '2580', br: 'yangju', agree: 1, dev: DEV(9), ref: me.uid });
  const p3 = env.call({ a: 'payReq', plan: 'month', method: 'bank' }, g.token); env.call({ a: 'payDecide', id: p3.pending.id, ok: 1 }, A.admin);
  const u = A.me(me.tok).user; assert.deepStrictEqual([u.st, u.left], ['active', 6]);
  /* 같은 폰 추천 무시 */
  const s1 = env.call({ a: 'join', nick: '셀프', pin: '2580', br: 'yangju', agree: 1, dev: DEV(10) });
  env.state.now += 31 * DAY;
  const s2 = env.call({ a: 'join', nick: '셀프2', pin: '2580', br: 'yangju', agree: 1, dev: DEV(10), ref: s1.user.uid }); assert.ok(s2.ok);
  assert.strictEqual(env.call({ a: 'refInfo' }, s1.token).friends.length, 0, '같은 폰 추천 인정 안 함');
  assert.ok(env.call({ a: 'setCfg', ref_on: 0 }, A.admin).ok); assert.strictEqual(env.call({ a: 'cfg' }).join.refOn, false);
});
t('공지 그림·단추: 그림 올리기(나눠 저장)·불러오기, 단추는 앱 화면 또는 https 주소만, 지우면 그림도 지움, 홍보 공지가 처음부터 있음', () => {
  const A = fresh(); const env = A.env; const m = A.mk('회원', 'month');
  const promo = env.call({ a: 'noticeList' }, m.tok).list.find(n => n.id === 'npromo1');
  assert.ok(promo && promo.pin && promo.popup && promo.img === 'assets/promo-invite.jpg' && promo.btns.map(b => b.to).join() === 'invite,join', JSON.stringify(promo));
  assert.ok(/7일/.test(promo.title));
  env.ctx.setup(); assert.strictEqual(env.call({ a: 'noticeList' }, m.tok).list.filter(n => n.id === 'npromo1').length, 1, '다시 setup 해도 한 번만');
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(100000);
  assert.strictEqual(env.call({ a: 'imgPut', data: big }, m.tok).err, 'perm', '회원은 그림 못 올림');
  const up = env.call({ a: 'imgPut', data: big }, A.admin); assert.ok(up.ok);
  assert.strictEqual(env.ss.getSheetByName('그림').getLastRow(), 1 + 3, '45,000자씩 3칸');
  assert.strictEqual(env.call({ a: 'imgGet', id: up.id }, m.tok).data, big);
  assert.strictEqual(env.call({ a: 'noticeSave', title: 'x', html: 'y', btns: [{ label: '열기', to: 'javascript:alert(1)' }] }, A.admin).err, 'bad');
  const sv = env.call({ a: 'noticeSave', title: '사진 공지', html: '자세히 https://example.com', img: up.id, btns: [{ label: '가입', to: 'join' }, { label: '안내', to: 'https://example.com/a' }, { label: '셋째', to: 'pay' }] }, A.admin); assert.ok(sv.ok);
  const n = sv.list.find(x => x.title === '사진 공지'); assert.deepStrictEqual(n.btns.map(b => b.to), ['join', 'https://example.com/a'], '2개까지');
  assert.strictEqual(n.img, up.id);
  assert.ok(env.call({ a: 'noticeDel', id: n.id }, A.admin).ok); assert.strictEqual(env.call({ a: 'imgGet', id: up.id }, m.tok).err, 'noimg', '공지를 지우면 그림도');
});

t('배포 전 점검 보완: 관리자 회원 목록은 모든 매장(br 빈 값), 결제 처리 중 오류면 다시 누를 수 있음, 긴 문의는 안내, 쓰이지 않는 그림 정리, 그림 캐시', () => {
  const A = fresh(); const env = A.env;
  const ms = A.mk('만송회원', 'month', { home: 'mansong' });
  assert.ok(env.call({ a: 'members', br: '' }, A.admin).members.some(m => m.nick === '만송회원'), '양주점에 있어도 모든 매장 회원');
  assert.ok(!env.call({ a: 'members', br: 'yangju' }, A.admin).members.some(m => m.nick === '만송회원'));
  /* 결제 처리 중 오류 → 표시가 남지 않아 다시 처리 가능 */
  const t = env.call({ a: 'join', nick: '결제왕', pin: '2580', br: 'yangju', agree: 1, dev: 'ab'.repeat(16) });
  const pr = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, t.token);
  const real = env.ctx.saveUser_; env.ctx.saveUser_ = () => { throw new Error('boom'); };
  assert.strictEqual(env.call({ a: 'payDecide', id: pr.pending.id, ok: 1 }, A.admin).err, 'server');
  env.ctx.saveUser_ = real;
  assert.ok(env.call({ a: 'payDecide', id: pr.pending.id, ok: 1 }, A.admin).ok, '다시 누르면 처리됨');
  /* 긴 문의 */
  assert.ok(env.call({ a: 'setCfg', qna_mode: 'on' }, A.admin).ok);
  const q = env.call({ a: 'qnaAsk', cat: 'app', title: '길게', html: 'x' }, ms.tok); let err = null;
  for (let i = 0; i < 59 && !err; i++) { const r = env.call({ a: 'qnaReply', id: q.qna.id, html: ('<b></b>'.repeat(120)) + '가'.repeat(400) }, i % 2 ? ms.tok : A.admin); if (!r.ok) err = r; }
  assert.ok(err && err.err === 'limit' && /새 문의/.test(err.msg), JSON.stringify(err));
  /* 그림: 공지에 안 쓰인 것은 하루 뒤 정리, 쓰인 것은 남김 */
  const img = 'data:image/png;base64,' + 'B'.repeat(1000);
  const keep = env.call({ a: 'imgPut', data: img }, A.admin).id, lost = env.call({ a: 'imgPut', data: img }, A.admin).id;
  assert.ok(env.call({ a: 'noticeSave', title: '그림', html: 'y', img: keep }, A.admin).ok);
  assert.strictEqual(env.call({ a: 'imgGet', id: keep }, ms.tok).data, img); assert.ok(env.cache['img:' + keep], '캐시에 저장');
  env.state.now += 2 * DAY; env.ctx.dailyMaintenance();
  assert.strictEqual(env.call({ a: 'imgGet', id: lost }, A.admin).err, 'noimg', '안 쓰인 그림 정리');
  delete env.cache['img:' + keep]; assert.strictEqual(env.call({ a: 'imgGet', id: keep }, A.admin).data, img, '공지 그림은 남음');
});

t('추천인 보완: 초대 링크 이름 보여 주기, 결제 목록에 추천인·보상 예정, 관리자가 추천인 정하기(첫 결제 전까지·자기 자신·서로·같은 폰 막음)', () => {
  const A = fresh(); const env = A.env; const me = A.mk('소개왕', 'month');
  assert.strictEqual(env.call({ a: 'refName', ref: me.uid }).nick, '소개왕');
  assert.strictEqual(env.call({ a: 'refName', ref: 'u999' }).nick, '');
  const f = env.call({ a: 'join', nick: '그냥가입', pin: '2580', br: 'yangju', agree: 1, dev: 'cd'.repeat(16) });
  const mem = () => env.call({ a: 'members', br: '' }, A.admin).members.find(m => m.nick === '그냥가입');
  assert.deepStrictEqual([mem().refNick, mem().canRef], ['', 1]);
  assert.strictEqual(env.call({ a: 'mUpdate', uid: f.user.uid, op: 'ref', to: '그냥가입' }, A.admin).err, 'bad', '자기 자신');
  assert.strictEqual(env.call({ a: 'mUpdate', uid: f.user.uid, op: 'ref', to: '없는사람' }, A.admin).err, 'nouser');
  const op = A.mk('운영', 'op');
  assert.strictEqual(env.call({ a: 'mUpdate', uid: f.user.uid, op: 'ref', to: '소개왕' }, op.tok).err, 'perm', '운영자는 못 정함');
  assert.ok(env.call({ a: 'mUpdate', uid: f.user.uid, op: 'ref', to: '소개왕' }, A.admin).ok);
  assert.strictEqual(mem().refNick, '소개왕');
  assert.strictEqual(env.call({ a: 'mUpdate', uid: me.uid, op: 'ref', to: '그냥가입' }, A.admin).err, 'bad', '서로 추천 불가');
  const pr = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, f.token);
  const pl = env.call({ a: 'payList' }, A.admin).pending.find(x => x.id === pr.pending.id); assert.deepStrictEqual([pl.refNick, pl.refWill, pl.refDone], ['소개왕', 7, 0]);
  const d = env.call({ a: 'payDecide', id: pr.pending.id, ok: 1 }, A.admin); assert.strictEqual(d.reward.nick, '소개왕');
  const rc = env.call({ a: 'payList' }, A.admin).recent.find(x => x.id === pr.pending.id); assert.deepStrictEqual([rc.refNick, rc.refThis], ['소개왕', 7]);
  assert.strictEqual(env.call({ a: 'mUpdate', uid: f.user.uid, op: 'ref', to: '' }, A.admin).err, 'bad', '첫 결제 뒤에는 못 바꿈');
  assert.deepStrictEqual([mem().canRef, mem().refPaid], [0, 1]);
  /* 운영진을 추천인으로 정하면 결제 목록에 "보상 없음" */
  const g = env.call({ a: 'join', nick: '운영소개', pin: '2580', br: 'yangju', agree: 1, dev: 'ef'.repeat(16) });
  assert.ok(env.call({ a: 'mUpdate', uid: g.user.uid, op: 'ref', to: '운영' }, A.admin).ok);
  const p2 = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, g.token);
  assert.strictEqual(env.call({ a: 'payList' }, A.admin).pending.find(x => x.id === p2.pending.id).refWill, 0);
});

t('환불 신청: 회원이 은행·계좌·예금주를 적어 신청(본인 화면은 일부 * 가림) → 관리자만 전체 번호 → 송금 후 완료(신청한 날 기준 계산·기간 끝냄) → 시트에서도 전체 번호 지움, 반려·취소', () => {
  const A = fresh(); const env = A.env; const m = A.mk('환불왕', 'trial'); const op = A.mk('운영', 'op');
  const pr = env.call({ a: 'payReq', plan: 'year', method: 'kakao' }, m.tok); assert.ok(env.call({ a: 'payDecide', id: pr.pending.id, ok: 1 }, A.admin).ok);
  let info = env.call({ a: 'refundInfo' }, m.tok); assert.ok(info.state.can && info.calc.full && info.calc.amount === 9000, JSON.stringify(info.calc));
  assert.strictEqual(A.me(m.tok).refund.can, 1);
  const base = { a: 'refundReq', bank: '카카오뱅크', acct: '3333-05-8835107', holder: '주영수', reason: '이사', agree: 1 };
  assert.strictEqual(env.call(Object.assign({}, base, { acct: '12' }), m.tok).err, 'bad');
  assert.strictEqual(env.call(Object.assign({}, base, { agree: 0 }), m.tok).err, 'bad');
  const r = env.call(base, m.tok); assert.ok(r.ok, JSON.stringify(r));
  assert.deepStrictEqual([r.state.req.acct, r.state.req.holder, r.state.req.amount], ['333*-**-****107', '주*수', 9000], '본인 화면은 가림');
  assert.strictEqual(env.call(base, m.tok).err, 'dup', '두 번 신청 불가');
  assert.strictEqual(env.call({ a: 'refundList' }, op.tok).err, 'perm', '운영자는 못 봄');
  env.state.now += 20 * DAY;                                                         // 관리자가 늦게 처리해도 신청한 날 기준
  const L = env.call({ a: 'refundList' }, A.admin); assert.deepStrictEqual([L.pending[0].acct, L.pending[0].holder, L.pending[0].nick], ['3333-05-8835107', '주영수', '환불왕'], '관리자는 전체 번호');
  const done = env.call({ a: 'refundDecide', id: L.pending[0].id, ok: 1 }, A.admin); assert.strictEqual(done.amount, 9000, '신청할 때 전액 조건이면 전액');
  assert.strictEqual(env.call({ a: 'refundDecide', id: L.pending[0].id, ok: 1 }, A.admin).err, 'nopay', '두 번 처리 안 됨');
  const sh = env.ss.getSheetByName('환불신청'); assert.deepStrictEqual([sh.getRange(2, 7).getValue(), sh.getRange(2, 8).getValue()], ['333*-**-****107', '주*수'], '시트에서도 전체 번호 지움');
  const me = A.me(m.tok); assert.strictEqual(me.user.st, 'expired', '이용 끝'); assert.deepStrictEqual([me.refund.recent.status, me.refund.recent.amount, me.refund.can], ['done', 9000, 0]);
  assert.strictEqual(env.call({ a: 'payList' }, A.admin).recent.find(x => x.id === pr.pending.id).status, 'refunded');
  /* 반려 · 취소 */
  const m2 = A.mk('반려왕', 'trial');
  const p2 = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, m2.tok); env.call({ a: 'payDecide', id: p2.pending.id, ok: 1 }, A.admin);
  assert.ok(env.call(Object.assign({}, base, { acct: '110-123-456789', holder: '김철수' }), m2.tok).ok);
  assert.ok(env.call({ a: 'refundCancel' }, m2.tok).ok); assert.strictEqual(A.me(m2.tok).refund.can, 1, '취소하면 다시 신청 가능');
  assert.ok(env.call(Object.assign({}, base, { acct: '110-123-456789', holder: '김철수' }), m2.tok).ok);
  env.state.now += 20 * DAY;
  assert.ok(/환불 신청 중에는 결제할 수 없어요/.test(env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, m2.tok).msg || ''), '환불 신청 중에는 결제 막음');
  const id2 = env.call({ a: 'refundList' }, A.admin).pending[0].id;
  assert.ok(env.call({ a: 'refundDecide', id: id2, ok: 0, note: '이용 기간이 거의 끝났어요' }, A.admin).ok);
  const st = A.me(m2.tok).refund; assert.deepStrictEqual([st.recent.status, st.recent.note, st.recent.acct], ['rejected', '이용 기간이 거의 끝났어요', '110-***-***789']);
  assert.strictEqual(A.me(m2.tok).user.st, 'active', '반려면 이용 그대로');
  assert.strictEqual(env.call({ a: 'dash' }, A.admin).refundReq, 0);
});

console.log(`\n결과: ${ok} 통과 / ${bad} 실패`); process.exit(bad ? 1 : 0);
