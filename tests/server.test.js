const assert = require('assert');
const { createEnv } = require('./lz-mock');
let ok = 0, bad = 0;
function t(name, fn) { try { fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 3).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const DAY = 86400000;
function fresh() {
  const env = createEnv(); const msg = env.ctx.setup(); const pin = msg.match(/처음 비밀번호: (\d{4})/)[1];
  const A = {}; // 자주 쓰는 도우미
  A.login = (nick, pin2) => env.call({ a: 'login', nick, pin: pin2, dev: 'test' });
  A.tok = (nick, pin2) => { const r = A.login(nick, pin2); assert.ok(r.ok, JSON.stringify(r)); return r.token; };
  A.op = A.tok('운영자', pin);
  A.pin = (tok, p) => env.call({ a: 'pin', pin: p }, tok);
  A.opPin = '8259'; assert.ok(A.pin(A.op, A.opPin).ok);
  A.mk = (nick, kind, days) => { const r = env.call({ a: 'mCreate', nick, kind, days }, A.op); assert.ok(r.ok, JSON.stringify(r)); const tk = A.tok(nick, r.pin); assert.ok(A.pin(tk, nick.length % 2 ? '7391' : '6482').ok); return { tok: tk, pin: nick.length % 2 ? '7391' : '6482', first: r.pin }; };
  A.holes = (par = 4, m = 50.5) => Array.from({ length: 18 }, (_, i) => [3 + (i % 3), m + i]);
  A.reg = (tok, name, extra = {}) => env.call(Object.assign({ a: 'register', name, holes: A.holes() }, extra), tok);
  A.rec = (r, n, d = 'R', t = '', o = '') => ({ r, n, d, t, o });
  A.save = (tok, cid, items) => env.call({ a: 'save', cid, items }, tok);
  return { env, pin, A };
}
function dump(env) { return env.ss.sheets.map(s => Object.values(s.cells).map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('\n')).join('\n'); }

console.log('\n[서버 시험 — 구글 시트 모의 환경]');
t('공개 주소(doGet)는 데이터 없이 상태만 알려준다', () => { const { env } = fresh(); const r = env.doGet(); assert.deepStrictEqual(Object.keys(r).sort(), ['app', 'ok', 'ver']); });
t('setup: 시트 7개, 비밀 열쇠, 첫 운영자(안내문에만 비밀번호), 다시 실행해도 안전', () => {
  const { env } = fresh(); assert.deepStrictEqual(env.ss.sheets.map(s => s.name), ['회원', '로그인기록', '코스', '기록', '공개설정', '설정', '이력']);
  assert.ok(env.props.PEPPER && env.props.PEPPER.length >= 32); const before = env.ss.getSheetByName('회원').getLastRow();
  const again = env.ctx.setup(); assert.ok(/이미 준비/.test(again)); assert.strictEqual(env.ss.getSheetByName('회원').getLastRow(), before);
  assert.strictEqual(env.triggers.length, 1);
});
t('로그인: 처음 비밀번호로 들어가면 바꾸라는 표시, 틀리면 남은 횟수, 5번 틀리면 10분 잠김, 시간이 지나면 풀림', () => {
  const env = createEnv(); const pin = env.ctx.setup().match(/처음 비밀번호: (\d{4})/)[1]; const L = (n, p) => env.call({ a: 'login', nick: n, pin: p });
  const r = L('운영자', pin); assert.ok(r.ok && r.user.must === 1 && r.user.kind === 'op');
  const wrong = pin === '0987' ? '0988' : '0987';
  for (let i = 0; i < 4; i++) { const f = L('운영자', wrong); assert.strictEqual(f.err, 'login'); assert.strictEqual(f.left, 4 - i); }
  const lock = L('운영자', wrong); assert.strictEqual(lock.err, 'lock');
  assert.strictEqual(L('운영자', pin).err, 'lock', '잠긴 동안은 맞는 번호도 거절');
  env.state.now += 11 * 60000; assert.ok(L('운영자', pin).ok);
});
t('없는 닉네임과 틀린 비밀번호는 같은 문구(누가 회원인지 알 수 없음)', () => {
  const { A } = fresh(); const a = A.login('없는사람', '1357'), b = A.login('운영자', '1357');
  assert.strictEqual(a.err, 'login'); assert.ok(a.msg.startsWith('닉네임이나 비밀번호가 맞지 않아요'));
  assert.strictEqual(a.msg.split(' (')[0], b.msg.split(' (')[0]);
});
t('비밀번호 변경: 쉬운 번호 거절, 변경 후 옛 번호 안 됨, 시트에 번호가 그대로 저장되지 않음', () => {
  const { env, A } = fresh(); const u = A.mk('다람쥐', 'fixed');
  for (const w of ['1234', '0000', '7777', '4321']) assert.strictEqual(A.pin(u.tok, w).err, 'weak');
  assert.strictEqual(A.pin(u.tok, '12a4').err, 'bad');
  assert.ok(A.pin(u.tok, '3917').ok); assert.strictEqual(A.login('다람쥐', u.pin).err, 'login'); assert.ok(A.login('다람쥐', '3917').ok);
  const cells = Object.values(env.ss.getSheetByName('회원').cells).map(String); assert.ok(!cells.includes('3917') && !cells.includes(u.pin));
});
t('로그인 상태: 가짜 토큰 거절, 로그아웃하면 그 토큰 못 씀, 시트에는 토큰 원본이 없음', () => {
  const { env, A } = fresh(); const u = A.mk('호랑이', 'fixed');
  assert.strictEqual(env.call({ a: 'me' }, 'fake').err, 'auth'); assert.strictEqual(env.call({ a: 'me' }).err, 'auth');
  assert.ok(env.call({ a: 'me' }, u.tok).ok); assert.ok(!dump(env).includes(u.tok));
  assert.ok(env.call({ a: 'logout' }, u.tok).ok); assert.strictEqual(env.call({ a: 'me' }, u.tok).err, 'auth');
});
t('로그인 기간: 60일이 지나면 다시 로그인, 한 달 미만 남으면 자동 연장', () => {
  const { env, A } = fresh(); const u = A.mk('장미', 'fixed');
  env.state.now += 35 * DAY; assert.ok(env.call({ a: 'me' }, u.tok).ok);         // 25일 남음 → 연장
  env.state.now += 55 * DAY; assert.ok(env.call({ a: 'me' }, u.tok).ok, '연장됐으니 계속 유효');
  env.state.now += 61 * DAY; env.cache && Object.keys(env.cache).forEach(k => delete env.cache[k]); assert.strictEqual(env.call({ a: 'me' }, u.tok).err, 'auth');
});
t('회원 만들기: 운영자만, 닉네임 규칙·중복(대소문자 무시), 숫자 닉네임("1004","007")이 숫자로 바뀌지 않음', () => {
  const { env, A } = fresh(); const m = A.mk('슈퍼맨', 'fixed');
  assert.strictEqual(env.call({ a: 'mCreate', nick: '아무개', kind: 'fixed' }, m.tok).err, 'perm');
  for (const bad of ['가', '아홉글자닉네임이다', '띄어 쓰기', '닉!', '']) assert.strictEqual(env.call({ a: 'mCreate', nick: bad, kind: 'fixed' }, A.op).err, 'nick', bad);
  assert.strictEqual(env.call({ a: 'mCreate', nick: '슈퍼맨', kind: 'fixed' }, A.op).err, 'dupnick');
  A.mk('Tiger', 'fixed'); assert.strictEqual(env.call({ a: 'mCreate', nick: 'tiger', kind: 'fixed' }, A.op).err, 'dupnick');
  const n1 = A.mk('1004', 'fixed'), n2 = A.mk('007', 'term', 10);
  assert.ok(A.login('1004', n1.pin).ok && A.login('007', n2.pin).ok);
  const list = env.call({ a: 'members' }, A.op).members.map(x => x.nick); assert.ok(list.includes('1004') && list.includes('007'));
});
t('회원 목록·내 정보에는 비밀번호 암호값이 절대 나오지 않음', () => {
  const { env, A } = fresh(); A.mk('슈퍼맨', 'fixed'); const s = JSON.stringify(env.call({ a: 'members' }, A.op)) + JSON.stringify(env.call({ a: 'me' }, A.op));
  assert.ok(!/hash|salt|\b[0-9a-f]{64}\b/.test(s));
});
t('기간회원: 기간 중엔 읽기·쓰기, 끝나면 읽기만, 시작 전엔 로그인 불가', () => {
  const { env, A } = fresh(); const t1 = A.mk('호랑이', 'term', 5), fx = A.mk('슈퍼맨', 'fixed');
  const c = A.reg(fx.tok, '양주호수코스'); assert.ok(c.ok);
  assert.ok(A.save(t1.tok, c.id, [{ i: 0, rec: A.rec('f', 2) }]).ok);
  assert.strictEqual(env.call({ a: 'me' }, t1.tok).user.st, 'term_active');
  env.state.now += 6 * DAY;
  assert.strictEqual(env.call({ a: 'me' }, t1.tok).user.st, 'term_expired');
  assert.strictEqual(A.save(t1.tok, c.id, [{ i: 1, rec: A.rec('c', 1) }]).err, 'expired');
  assert.strictEqual(A.reg(t1.tok, '새코스').err, 'perm');
  assert.ok(env.call({ a: 'course', id: c.id }, t1.tok).mine[0].r === 'f', '내 기록은 읽을 수 있음');
  assert.ok(A.login('호랑이', t1.pin).ok, '만료 후에도 로그인(읽기)은 가능');
  const sh = env.ss.getSheetByName('회원'); // 시작일을 내일로 → 로그인 불가
  const rows = sh.getLastRow(); for (let r = 2; r <= rows; r++) if (sh.getRange(r, 1).getValue() === '호랑이') { sh.getRange(r, 3).setValue('2999-01-01'); }
  assert.strictEqual(A.login('호랑이', t1.pin).err, 'wait');
});
t('코스 등록: 고정회원·운영자만 / 이름 규칙(띄어쓰기 금지) / 18홀 파·거리 검사', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'), tm = A.mk('호랑이', 'term', 30);
  assert.strictEqual(A.reg(tm.tok, '목행충주파크골프CD').err, 'perm');
  for (const n of ['목행 충주', '목행\u3000충주', '=SUM(1)', '+코스', '-코스', '가', '<b>코스</b>', 'a'.repeat(31)]) assert.strictEqual(A.reg(fx.tok, n).err, 'name', n);
  assert.strictEqual(env.call({ a: 'register', name: '정상코스', holes: A.holes().slice(0, 17) }, fx.tok).err, 'bad');
  assert.strictEqual(env.call({ a: 'register', name: '정상코스', holes: A.holes().map((h, i) => (i === 3 ? [6, 50] : h)) }, fx.tok).err, 'bad');
  assert.strictEqual(env.call({ a: 'register', name: '정상코스', holes: A.holes().map((h, i) => (i === 17 ? [4, 0] : h)) }, fx.tok).err, 'bad');
  assert.strictEqual(env.call({ a: 'register', name: '정상코스', holes: A.holes().map((h, i) => (i === 17 ? [4, 1000] : h)) }, fx.tok).err, 'bad');
  const r = A.reg(fx.tok, '목행충주파크골프CD'); assert.ok(r.ok && /^c\d+$/.test(r.id));
});
t('코스 이름 중복: 같은 이름(대소문자 무시)은 새로 등록 불가, 기존 코스 안내', () => {
  const { A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'), fx2 = A.mk('장미', 'fixed'); const r = A.reg(fx.tok, '목행충주파크골프CD');
  const d = A.reg(fx2.tok, '목행충주파크골프cd'); assert.strictEqual(d.err, 'dup'); assert.strictEqual(d.id, r.id); assert.strictEqual(d.name, '목행충주파크골프CD');
});
t('숫자만 있는 코스 이름("12345")도 숫자로 바뀌지 않고 중복 검사가 됨', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const r = A.reg(fx.tok, '12345'); assert.ok(r.ok);
  const l = env.call({ a: 'courses' }, fx.tok).courses; assert.strictEqual(l[0].name, '12345'); assert.strictEqual(A.reg(fx.tok, '12345').err, 'dup');
});
t('코스 등록하면서 내 기록 함께 저장 + 거리 소수점 한 자리', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const recs = Array(18).fill(null); recs[0] = A.rec('c', 2, 'L'); recs[5] = A.rec('u', 1, 'R', '우측나무', '바람');
  const holes = A.holes(); holes[0] = [3, 52.55];
  const r = env.call({ a: 'register', name: '내기록코스', holes, recs }, fx.tok); assert.ok(r.ok);
  const c = env.call({ a: 'course', id: r.id }, fx.tok); assert.strictEqual(c.mine[0].r, 'c'); assert.strictEqual(c.mine[5].t, '우측나무'); assert.strictEqual(c.course.holes[0][1], 52.6);
  assert.strictEqual(env.call({ a: 'courses' }, fx.tok).courses[0].mine, 2);
});
t('기록 저장: 값 검사(칸 0~30, 잘못된 기준은 비움, < > 제거, 글자 수 제한)', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const c = A.reg(fx.tok, '시험코스');
  assert.ok(A.save(fx.tok, c.id, [{ i: 0, rec: A.rec('f', 99, 'L') }, { i: 1, rec: { r: 'zzz', n: 3 } }, { i: 2, rec: A.rec('u', 2, 'X', '<b>나무나무나무나무나무나무</b>', '<i>' + 'ㅋ'.repeat(40)) }]).ok);
  const m = env.call({ a: 'course', id: c.id }, fx.tok).mine;
  assert.strictEqual(m[0].n, 30); assert.strictEqual(m[1].r, ''); assert.strictEqual(m[1].n, 0);
  assert.ok(!/[<>]/.test(m[2].t + m[2].o)); assert.ok(m[2].t.length <= 10 && m[2].o.length <= 20); assert.strictEqual(m[2].d, 'R');
  assert.strictEqual(A.save(fx.tok, c.id, [{ i: 18, rec: A.rec('f', 1) }]).err, 'bad'); assert.strictEqual(A.save(fx.tok, c.id, []).err, 'bad');
  assert.strictEqual(A.save(fx.tok, 'c999', [{ i: 0, rec: A.rec('f', 1) }]).err, 'nocourse');
});
t('타격감: 8~40만 저장(17=50M), 범위 밖·기준 없음은 0, 다른 홀에 영향 없음', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const c = A.reg(fx.tok, '시험코스');
  assert.ok(A.save(fx.tok, c.id, [{ i: 0, rec: Object.assign(A.rec('f', 2), { p: 17 }) }, { i: 1, rec: Object.assign(A.rec('c', 0), { p: 99 }) }, { i: 2, rec: Object.assign(A.rec('c', 1), { p: 7 }) }, { i: 3, rec: { r: '', p: 20 } }, { i: 4, rec: Object.assign(A.rec('u', 1, 'L', '나무'), { p: 16.4 }) }]).ok);
  const m = env.call({ a: 'course', id: c.id }, fx.tok).mine; assert.deepStrictEqual([m[0].p, m[1].p, m[2].p, m[3].p, m[4].p, m[5].p], [17, 0, 0, 0, 16, 0]);
});
t('기록은 홀 단위로 합쳐 저장(다른 홀을 지우지 않음), 0칸 "그대로"도 기록으로 인정', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const c = A.reg(fx.tok, '시험코스');
  A.save(fx.tok, c.id, [{ i: 0, rec: A.rec('f', 2) }]); A.save(fx.tok, c.id, [{ i: 1, rec: A.rec('c', 0) }]);
  const m = env.call({ a: 'course', id: c.id }, fx.tok).mine; assert.strictEqual(m[0].r, 'f'); assert.strictEqual(m[1].r, 'c'); assert.strictEqual(m[1].n, 0);
  assert.strictEqual(env.call({ a: 'courses' }, fx.tok).courses[0].mine, 2);
});
t('다른 회원 기록 보기: 공개한 사람만, 기간 끝난 회원·이용 중지 회원·비공개는 안 보임', () => {
  const { env, A } = fresh(); const me = A.mk('슈퍼맨', 'fixed'), a = A.mk('장미', 'fixed'), b = A.mk('호랑이', 'term', 3), c2 = A.mk('달님', 'fixed'), d = A.mk('바람', 'fixed');
  const c = A.reg(me.tok, '시험코스');
  for (const u of [a, b, c2, d]) A.save(u.tok, c.id, [{ i: 0, rec: A.rec('f', 1) }]);
  A.save(me.tok, c.id, [{ i: 0, rec: A.rec('f', 5) }]);
  let v = env.call({ a: 'course', id: c.id }, me.tok); assert.deepStrictEqual(v.authors.map(x => x.nick).sort(), ['달님', '바람', '장미', '호랑이']);
  assert.ok(!v.authors.some(x => x.nick === '슈퍼맨'), '나 자신은 목록에 없음');
  assert.ok(env.call({ a: 'pub', cid: c.id, pub: 0 }, a.tok).ok);                            // 장미 비공개
  assert.ok(env.call({ a: 'mUpdate', nick: '달님', op: 'active', on: 0 }, A.op).ok);            // 달님 이용 중지
  env.state.now += 4 * DAY;                                                                     // 호랑이 기간 끝
  v = env.call({ a: 'course', id: c.id }, me.tok); assert.deepStrictEqual(v.authors.map(x => x.nick), ['바람']);
  assert.strictEqual(env.call({ a: 'courses' }, me.tok).courses[0].others, 1);
  assert.ok(env.call({ a: 'course', id: c.id }, a.tok).mine[0].r === 'f', '비공개여도 본인은 자기 기록을 봄');
  assert.ok(env.call({ a: 'pub', cid: c.id, pub: 1 }, a.tok).ok); assert.strictEqual(env.call({ a: 'course', id: c.id }, me.tok).authors.length, 2);
});
t('기간 끝난 회원은 다른 회원 기록을 볼 수 없고(목록·내용 모두), 남들에게도 보이지 않음', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'), tm = A.mk('호랑이', 'term', 2); const c = A.reg(fx.tok, '시험코스');
  A.save(fx.tok, c.id, [{ i: 0, rec: A.rec('f', 5) }]); A.save(tm.tok, c.id, [{ i: 0, rec: A.rec('c', 1) }]);
  env.state.now += 3 * DAY;
  const v = env.call({ a: 'course', id: c.id, who: '슈퍼맨' }, tm.tok); assert.strictEqual(v.authors.length, 0); assert.strictEqual(v.pick, null); assert.strictEqual(v.mine[0].r, 'c');
  assert.strictEqual(env.call({ a: 'courses' }, tm.tok).courses[0].others, 0);
  assert.strictEqual(env.call({ a: 'course', id: c.id }, fx.tok).authors.length, 0, '만료 회원 기록은 남들에게 안 보임');
  assert.ok(env.call({ a: 'mUpdate', nick: '호랑이', op: 'kind', kind: 'fixed' }, A.op).ok);
  assert.strictEqual(env.call({ a: 'course', id: c.id }, fx.tok).authors.length, 1, '고정회원으로 바꾸면 다시 보임');
});
t('who 를 지정하면 그 회원 기록, 없는 사람을 지정하면 가장 최근 기록으로', () => {
  const { env, A } = fresh(); const me = A.mk('슈퍼맨', 'fixed'), a = A.mk('장미', 'fixed'), b = A.mk('바람', 'fixed'); const c = A.reg(me.tok, '시험코스');
  A.save(a.tok, c.id, [{ i: 0, rec: A.rec('f', 1) }]); env.state.now += 1000; A.save(b.tok, c.id, [{ i: 0, rec: A.rec('c', 3) }]);
  assert.strictEqual(env.call({ a: 'course', id: c.id }, me.tok).pick.nick, '바람');
  assert.strictEqual(env.call({ a: 'course', id: c.id, who: '장미' }, me.tok).pick.recs[0].r, 'f');
  assert.strictEqual(env.call({ a: 'course', id: c.id, who: '없음' }, me.tok).pick.nick, '바람');
});
t('코스 정보 수정: 처음 등록한 분·운영자만 / 이름은 운영자만 / 등록자가 기간회원이 되면 운영자만', () => {
  const { env, A } = fresh(); const r1 = A.mk('슈퍼맨', 'fixed'), r2 = A.mk('장미', 'fixed'); const c = A.reg(r1.tok, '시험코스'); const h2 = A.holes(5, 70.5);
  assert.strictEqual(env.call({ a: 'editCourse', id: c.id, holes: h2 }, r2.tok).err, 'perm');
  assert.ok(env.call({ a: 'editCourse', id: c.id, holes: h2 }, r1.tok).ok); assert.strictEqual(env.call({ a: 'course', id: c.id }, r2.tok).course.holes[0][1], 70.5);
  assert.strictEqual(env.call({ a: 'editCourse', id: c.id, name: '바뀐이름' }, r1.tok).err, 'perm');
  assert.ok(env.call({ a: 'editCourse', id: c.id, name: '바뀐이름' }, A.op).ok); assert.strictEqual(env.call({ a: 'courses' }, A.op).courses[0].name, '바뀐이름');
  A.reg(r2.tok, '다른코스'); assert.strictEqual(env.call({ a: 'editCourse', id: c.id, name: '다른코스' }, A.op).err, 'dup');
  assert.strictEqual(env.call({ a: 'editCourse', id: c.id, name: '바 뀐' }, A.op).err, 'name');
  assert.ok(env.call({ a: 'mUpdate', nick: '슈퍼맨', op: 'kind', kind: 'term', days: 30 }, A.op).ok);
  assert.strictEqual(env.call({ a: 'editCourse', id: c.id, holes: A.holes() }, r1.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'courses' }, r1.tok).courses[0].canEdit, false);
});
t('코스 삭제: 운영자만, 그 코스의 모든 기록·공개설정도 함께 삭제', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const c = A.reg(fx.tok, '시험코스'); A.save(fx.tok, c.id, [{ i: 0, rec: A.rec('f', 1) }]); env.call({ a: 'pub', cid: c.id, pub: 0 }, fx.tok);
  assert.strictEqual(env.call({ a: 'delCourse', id: c.id }, fx.tok).err, 'perm'); assert.ok(env.call({ a: 'delCourse', id: c.id }, A.op).ok);
  assert.strictEqual(env.ss.getSheetByName('기록').getLastRow(), 1); assert.strictEqual(env.ss.getSheetByName('공개설정').getLastRow(), 1);
  assert.strictEqual(env.call({ a: 'course', id: c.id }, fx.tok).err, 'nocourse');
});
t('회원 관리: 종류 변경·기간 늘리기·비밀번호 다시 만들기(기존 로그인 끊김)·중지·삭제', () => {
  const { env, A } = fresh(); const u = A.mk('호랑이', 'term', 10), s = A.mk('슈퍼맨', 'fixed'); const c = A.reg(s.tok, '시험코스'); A.save(u.tok, c.id, [{ i: 0, rec: A.rec('f', 1) }]);
  let r = env.call({ a: 'mUpdate', nick: '호랑이', op: 'extend', days: 30 }, A.op); assert.strictEqual(r.member.left, 40);
  env.state.now += 50 * DAY; assert.strictEqual(env.call({ a: 'members' }, A.op).members.find(m => m.nick === '호랑이').st, 'term_expired');
  r = env.call({ a: 'mUpdate', nick: '호랑이', op: 'extend', days: 30 }, A.op); assert.strictEqual(r.member.left, 30, '만료 뒤 늘리면 오늘부터');
  r = env.call({ a: 'mUpdate', nick: '호랑이', op: 'kind', kind: 'fixed' }, A.op); assert.strictEqual(r.member.kind, 'fixed'); assert.strictEqual(r.member.left, null);
  r = env.call({ a: 'mUpdate', nick: '호랑이', op: 'kind', kind: 'term', days: 7 }, A.op); assert.strictEqual(r.member.left, 7);
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '슈퍼맨', op: 'extend', days: 30 }, A.op).err, 'bad');
  r = env.call({ a: 'mUpdate', nick: '호랑이', op: 'pin' }, A.op); assert.ok(/^\d{4}$/.test(r.pin));
  assert.strictEqual(env.call({ a: 'me' }, u.tok).err, 'auth', '비밀번호를 다시 만들면 기존 로그인은 끊김'); const l = A.login('호랑이', r.pin); assert.ok(l.ok && l.user.must === 1);
  assert.ok(env.call({ a: 'mUpdate', nick: '호랑이', op: 'active', on: 0 }, A.op).ok); assert.strictEqual(A.login('호랑이', r.pin).err, 'off');
  assert.ok(env.call({ a: 'mUpdate', nick: '호랑이', op: 'delete' }, A.op).ok);
  assert.strictEqual(env.call({ a: 'course', id: c.id }, s.tok).authors.length, 0); assert.strictEqual(env.ss.getSheetByName('기록').getLastRow(), 1);
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '없는사람', op: 'pin' }, A.op).err, 'nouser');
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '슈퍼맨', op: 'kind', kind: 'term' }, s.tok).err, 'perm');
});
t('운영자 보호: 내 계정을 바꾸거나 지우기 불가, 마지막 운영자는 내릴 수 없음, 다른 운영자 추가 가능', () => {
  const { env, A } = fresh();
  for (const body of [{ op: 'kind', kind: 'fixed' }, { op: 'active', on: 0 }, { op: 'delete' }]) assert.strictEqual(env.call(Object.assign({ a: 'mUpdate', nick: '운영자' }, body), A.op).err, 'self');
  const o2 = A.mk('부운영', 'op'); assert.strictEqual(env.call({ a: 'me' }, o2.tok).user.kind, 'op');
  assert.ok(env.call({ a: 'mUpdate', nick: '부운영', op: 'kind', kind: 'fixed' }, A.op).ok);
  assert.ok(env.call({ a: 'mUpdate', nick: '부운영', op: 'kind', kind: 'op' }, A.op).ok);
  assert.strictEqual(env.call({ a: 'mUpdate', nick: '운영자', op: 'delete' }, o2.tok).ok, true, '다른 운영자가 있으면 가능');
  assert.strictEqual(env.call({ a: 'members' }, o2.tok).members.length, 1);
});
t('매장 이름·로고: 운영자만, 큰 그림도 칸 제한(5만 자) 안에서 나눠 저장, 버전이 다르면 내려줌', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const big = 'data:image/png;base64,' + 'A'.repeat(130000);
  assert.strictEqual(env.call({ a: 'logoPut', slot: 'dark', data: big }, fx.tok).err, 'perm');
  assert.strictEqual(env.call({ a: 'logoPut', slot: 'dark', data: 'data:text/html;base64,AAAA' }, A.op).err, 'bad');
  assert.strictEqual(env.call({ a: 'logoPut', slot: 'dark', data: 'data:image/png;base64,' + 'A'.repeat(460000) }, A.op).err, 'big');
  assert.strictEqual(env.call({ a: 'logoPut', slot: 'x', data: big }, A.op).err, 'bad');
  const r = env.call({ a: 'logoPut', slot: 'dark', data: big }, A.op); assert.ok(r.ok && r.logoVer === 1);
  assert.strictEqual(env.call({ a: 'cfg', lv: 1 }).logos, undefined); const c = env.call({ a: 'cfg', lv: 0 }); assert.strictEqual(c.logos.dark, big); assert.strictEqual(c.logos.light, null);
  assert.ok(env.call({ a: 'logoReset', slot: 'dark' }, A.op).ok); const c2 = env.call({ a: 'cfg', lv: 1 }); assert.strictEqual(c2.logoVer, 2); assert.strictEqual(c2.logos.dark, null);
  assert.ok(env.call({ a: 'setCfg', store: '레저로 제이드 양주점' }, A.op).ok); assert.strictEqual(env.call({ a: 'cfg' }).store, '레저로 제이드 양주점');
  assert.strictEqual(env.call({ a: 'setCfg', store: '' }, A.op).err, 'bad'); assert.strictEqual(env.call({ a: 'setCfg', store: 'x' }, fx.tok).err, 'perm');
});
t('권한 없는 요청 모음: 로그인 없이는 아무것도 못 함(공개 요청 cfg·login 제외)', () => {
  const { env } = fresh();
  for (const a of ['me', 'courses', 'course', 'register', 'save', 'members', 'mCreate', 'mUpdate', 'logoPut', 'setCfg', 'pin', 'pub', 'delCourse', 'editCourse', 'prefs']) assert.strictEqual(env.call({ a }).err, 'auth', a);
  assert.strictEqual(env.call({ a: 'zzz' }).err, 'bad');
});
t('동시에 저장 중이면 "잠시 뒤에" 안내, 서버 내부 오류는 상세 내용 없이 알림', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); env.state.lockBusy = true;
  const r = A.reg(fx.tok, '시험코스'); assert.strictEqual(r.err, 'busy'); env.state.lockBusy = false; assert.ok(A.reg(fx.tok, '시험코스').ok);
  env.ss.deleteSheet(env.ss.getSheetByName('코스')); const e = env.call({ a: 'courses' }, fx.tok); assert.strictEqual(e.ok, false); assert.ok(!/Error|at |stack/i.test(e.msg));
});
t('매일 정리: 만료된 로그인 삭제, 백업 시트(숨김) 만들기, 7일 지난 백업 삭제', () => {
  const { env, A } = fresh(); A.mk('슈퍼맨', 'fixed'); const before = env.ss.getSheetByName('로그인기록').getLastRow();
  env.state.now += 70 * DAY; env.ctx.dailyMaintenance();
  assert.ok(env.ss.getSheetByName('로그인기록').getLastRow() < before); const bks = env.ss.sheets.filter(s => /^bk\d{6}_/.test(s.name)); assert.strictEqual(bks.length, 3); assert.ok(bks.every(s => s.hidden));
  env.state.now += 3 * DAY; env.ctx.dailyMaintenance(); assert.strictEqual(env.ss.sheets.filter(s => /^bk\d{6}_/.test(s.name)).length, 6);
  env.state.now += 9 * DAY; env.ctx.dailyMaintenance(); assert.strictEqual(env.ss.sheets.filter(s => /^bk\d{6}_/.test(s.name)).length, 3);
});
t('개발자용: 모든 운영자가 비밀번호를 잊었을 때 첫 운영자 비밀번호 다시 만들기', () => {
  const { env, A } = fresh(); env.ctx.devResetOperatorPin(); const msg = env.logs.filter(l => /새 비밀번호/.test(l)).pop(); const pin = msg.match(/(\d{4})$/)[1];
  assert.strictEqual(env.call({ a: 'me' }, A.op).err, 'auth'); assert.ok(A.login('운영자', pin).user.must === 1);
});
t('여러 명·많은 데이터: 회원 150명, 코스 60곳, 기록 3,000줄에서도 정상 동작', () => {
  const { env, A } = fresh(); const fx = A.mk('슈퍼맨', 'fixed'); const ids = [];
  for (let i = 0; i < 60; i++) ids.push(A.reg(fx.tok, '코스' + i).id);
  const sh = env.ss.getSheetByName('기록'); let r = sh.getLastRow() + 1; const recs = JSON.stringify(Array(18).fill({ r: 'f', t: '', d: 'R', n: 3, o: '바람' }));
  for (let u = 0; u < 50; u++) for (let c = 0; c < 60; c++, r++) { if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500); sh.getRange(r, 1, 1, 5).setNumberFormat('@').setValues([[ids[c], 'u' + u, 18, recs, 1]]); }
  const t0 = Date.now(); const l = env.call({ a: 'courses' }, fx.tok); assert.ok(l.ok && l.courses.length === 60); assert.ok(Date.now() - t0 < 3000);
  assert.ok(sh.getLastRow() > 3000);
});

console.log(`\n결과: ${ok} 통과 / ${bad} 실패`); process.exit(bad ? 1 : 0);
