#!/usr/bin/env node
/*
 * 부하 시험 — 실제 배포한 앱스크립트 서버가 동시에 몇 명까지 버티는지 재고, 좌석 수를 추천합니다.
 *
 * 실행 (컴퓨터에 Node.js 18 이상 필요):
 *   node tools/loadtest.js "https://script.google.com/macros/s/…/exec" 관리자비밀번호 [지점코드] [--apply]
 *
 * 하는 일
 *  1) 관리자로 로그인 → 좌석 제한을 잠시 끔(0)
 *  2) 시험용 체험회원 lt01 ~ lt80 을 만듦 (이미 있으면 지우고 새로)
 *  3) 동시에 10명 → 20명 → 40명 → 80명이 코스 목록 보기·코스 열기·기록 저장·접속 알림을 한꺼번에 보냄
 *  4) 단계마다 응답 시간(중간값·느린 쪽 5%)과 오류 수를 표로 보여 줌
 *  5) "느린 쪽 5%가 3초 이하이고 오류가 없는" 가장 큰 단계의 70%를 좌석 수로 추천
 *  6) 시험용 회원과 그 기록을 모두 지우고, 좌석 설정을 원래대로 돌려놓음 (--apply 를 붙이면 추천 좌석 수로 저장)
 *
 * 주의: 회원이 거의 없는 시간(예: 새벽)에 실행하세요. 몇 분 걸리고, 구글의 하루 사용량을 조금 씁니다.
 */
const [, , API, PIN, BRANCH_ARG, FLAG] = process.argv;
if (!API || !/^https?:\/\//.test(API) || !/^\d{4,6}$/.test(PIN || '')) {
  console.log('사용법: node tools/loadtest.js "<웹 앱 URL>" <관리자 비밀번호 6자리> [지점코드] [--apply]');
  process.exit(1);
}
const BRANCH = BRANCH_ARG && BRANCH_ARG !== '--apply' ? BRANCH_ARG : 'yangju';
const APPLY = FLAG === '--apply' || BRANCH_ARG === '--apply';
const LEVELS = [10, 20, 40, 80], N = Math.max(...LEVELS), LIMIT_MS = 3000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nick = i => 'lt' + String(i + 1).padStart(2, '0');

async function call(a, body, t) {
  const payload = Object.assign({}, body, { a, br: BRANCH }); if (t) payload.t = t;
  const t0 = Date.now();
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
    const txt = await res.text(); let d;
    try { d = JSON.parse(txt); } catch (e) { d = { ok: false, err: 'http', msg: txt.slice(0, 80) }; }
    return Object.assign(d, { ms: Date.now() - t0 });
  } catch (e) { return { ok: false, err: 'net', msg: String(e.message || e), ms: Date.now() - t0 }; }
}
function must(r, what) { if (!r.ok) { console.error('\n✗ ' + what + ' 실패: ' + (r.msg || r.err)); process.exit(1); } return r; }
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

(async () => {
  console.log('\n[파크골프 공략노트 부하 시험] ' + new Date().toLocaleString('ko-KR') + '  지점: ' + BRANCH);
  const adm = must(await call('login', { nick: '관리자', pin: PIN, dev: 'loadtest' }), '관리자 로그인').token;
  const cfg = must(await call('adminCfg', {}, adm), '설정 읽기').cfg, oldSeats = cfg.seats;
  must(await call('setCfg', { seats: 0 }, adm), '좌석 제한 끄기');
  console.log('· 좌석 제한을 잠시 껐어요 (원래 ' + oldSeats + '석)');

  let accounts = [];
  async function cleanup() {
    process.stdout.write('· 시험용 회원 지우는 중');
    const list = (await call('members', {}, adm)).members || [];
    for (const m of list.filter(m => /^lt\d\d$/.test(m.nick))) { await call('mUpdate', { nick: m.nick, op: 'delete' }, adm); process.stdout.write('.'); }
    console.log(' 끝');
  }
  try {
    await cleanup();
    process.stdout.write('· 시험용 체험회원 ' + N + '명 만드는 중');
    for (let i = 0; i < N; i++) {
      const c = must(await call('mCreate', { nick: nick(i), kind: 'trial' }, adm), nick(i) + ' 만들기');
      const l = must(await call('login', { nick: nick(i), pin: c.pin, dev: 'loadtest' }), nick(i) + ' 로그인');
      must(await call('pin', { pin: '2580' }, l.token), nick(i) + ' 비밀번호 정하기');   // v3.1: 처음 비밀번호 그대로는 다른 기능이 막혀요
      accounts.push(l.token); if (i % 10 === 9) process.stdout.write(' ' + (i + 1));
    }
    console.log(' 끝');
    const cs = (await call('courses', {}, accounts[0])).courses || [];
    const cid = cs.length ? cs[0].id : null;
    console.log('· 시험에 쓸 코스: ' + (cid ? cs[0].name : '(등록된 코스 없음 — 목록 보기·접속 알림만 시험)'));

    const rows = [];
    for (const L of LEVELS) {
      await sleep(3000);
      const times = [], errs = {};
      const one = async (k) => {
        const tok = accounts[k], steps = [['courses', {}], ['ping', {}]];
        if (cid) steps.push(['course', { id: cid }], ['save', { cid, items: [{ i: k % 9, rec: { r: 'c', d: 'R', n: k % 5, p: 17, o: '부하시험' } }] }]);
        for (const [a, b] of steps) {
          const r = await call(a, b, tok); times.push(r.ms);
          if (!r.ok) errs[r.err] = (errs[r.err] || 0) + 1;
        }
      };
      const t0 = Date.now();
      await Promise.all(Array.from({ length: L }, (_, k) => one(k)));
      const row = { L, n: times.length, p50: pct(times, 0.5), p95: pct(times, 0.95), max: Math.max(...times), err: Object.values(errs).reduce((a, b) => a + b, 0), errs, sec: (Date.now() - t0) / 1000 };
      rows.push(row);
      console.log(`  동시 ${String(L).padStart(2)}명: 요청 ${row.n}개 · 중간 ${(row.p50 / 1000).toFixed(1)}초 · 느린 쪽 5% ${(row.p95 / 1000).toFixed(1)}초 · 가장 느림 ${(row.max / 1000).toFixed(1)}초 · 오류 ${row.err}` + (row.err ? ' ' + JSON.stringify(row.errs) : ''));
      if (row.err > row.n * 0.2) { console.log('  (오류가 많아서 다음 단계는 건너뜀)'); break; }
    }
    const good = rows.filter(r => r.err === 0 && r.p95 <= LIMIT_MS);
    const best = good.length ? good[good.length - 1].L : 0;
    const seats = best ? Math.max(5, Math.floor(best * 0.7)) : 7;
    console.log('\n결과: ' + (best ? `동시 ${best}명까지 느린 쪽 5%가 3초 이하, 오류 없음.` : '동시 10명에서도 느리거나 오류가 있었어요. 잠시 뒤 다시 해 보세요.'));
    console.log('추천 좌석 수: ' + seats + '석  (버틴 인원의 70% — 여유를 남김)');
    console.log('  * 회원이 화면을 "보는 동안"은 요청이 드물어서, 실제로는 좌석 수보다 훨씬 많은 사람이 동시에 들어와 있어도 괜찮아요.');
    if (APPLY) { must(await call('setCfg', { seats }, adm), '좌석 저장'); console.log('· 좌석 수를 ' + seats + '석으로 저장했어요.'); }
    else { await call('setCfg', { seats: oldSeats }, adm); console.log('· 좌석 설정을 원래대로(' + oldSeats + '석) 돌려놓았어요. 추천 값으로 저장하려면 끝에 --apply 를 붙여 다시 실행하거나, 관리자 설정 화면에서 바꾸세요.'); }
  } finally {
    await cleanup();
    if (!APPLY) await call('setCfg', { seats: oldSeats }, adm);
  }
})();
