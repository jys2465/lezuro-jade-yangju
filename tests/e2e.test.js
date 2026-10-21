// 실제 브라우저(Chromium, 휴대폰 크기)로 처음부터 끝까지 눌러 보는 시험 — v2
// 실행: node tests/e2e.test.js   (스크린샷은 tests/shots/ 에 저장)
const { chromium } = require('playwright'); const { start } = require('./e2e-server'); const assert = require('assert');
const SH = __dirname + '/shots/'; require('fs').mkdirSync(SH, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
let ok = 0, bad = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const AND = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const WAKE = () => { window.__wl = { req: 0, rel: 0, active: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.req++; __wl.active++; const l = new EventTarget(); let on = true; l.release = async () => { if (!on) return; on = false; __wl.rel++; __wl.active--; l.dispatchEvent(new Event('release')); }; return l; } } }); };

(async () => {
  const srv = await start(), env = srv.env, browser = await chromium.launch(), errors = [];
  async function phone(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', userAgent: AND, hasTouch: true });
    await ctx.addInitScript(WAKE);
    await ctx.addInitScript(() => { window.LZ_QPOLL = 700; try { localStorage.setItem('lz.hintOff', '1'); } catch (e) { /* 무시 */ } });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    p.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    return p;
  }
  const scr = p => p.evaluate(() => window.LZ && LZ.stack.length ? LZ.stack[LZ.stack.length - 1].name : '');
  const waitScr = (p, n, ms = 8000) => p.waitForFunction(n => window.LZ && LZ.stack.length && LZ.stack[LZ.stack.length - 1].name === n && !document.querySelector('#app .sk') && !document.querySelector('#layer .spin'), n, { timeout: ms });
  const pad = async (p, d) => { for (const c of d) await p.click(`#app .pad button[data-k="${c}"]`); };
  const text = (p, s = '#app') => p.locator(s).first().innerText();
  const dlg = async (p, label) => { await p.waitForSelector('.dlg .btn'); await p.click(`.dlg .btn:has-text("${label}")`); await sleep(120); };
  const toast = p => p.locator('#toast').innerText();
  const shot = (p, n) => p.screenshot({ path: SH + n + '.png' });
  async function setPin(p, pin) { await waitScr(p, 'pin'); await pad(p, pin); await sleep(60); await pad(p, pin); await waitScr(p, 'courses'); }
  async function firstLogin(p, nick, pin, newPin) {
    await p.goto('http://localhost:8801/?u=' + encodeURIComponent(nick)); await waitScr(p, 'login');
    await pad(p, pin); await p.click('#go'); await setPin(p, newPin);
  }
  const admTok = () => env.call({ a: 'login', nick: '관리자', pin: '8259', dev: 't' }).token;
  const recsOf = nick => { const sh = env.ss.getSheetByName('기록'); for (let r = 2; r <= sh.getLastRow(); r++) if (sh.getRange(r, 2).getValue() === nick) return JSON.parse(sh.getRange(r, 4).getValue()); return null; };
  const waitFor = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(120); } return false; };
  async function makeMember(p, nick, kind) {
    await p.fill('#nn', nick);
    if (kind) await p.click(`#kind button[data-k="${kind}"]`);
    await p.click('#mk'); await p.waitForSelector('#inv');
    return (await text(p, '#inv')).match(/처음 비밀번호: (\d{4})/)[1];
  }

  console.log('\n[실제 브라우저 종단 시험 v2 — 처음부터 끝까지]');
  const A = await phone('관리자'); const pins = {};

  /* ───────── 관리자 ───────── */
  await t('A1 관리자 첫 로그인 → 비밀번호 바꾸기 강제 → 코스 화면, 흰 머리글·해달 단추, 지점별 저장(lz@yangju.)', async () => {
    await A.goto('http://localhost:8801/'); await waitScr(A, 'login'); await shot(A, 'a1-login');
    await A.fill('#nick', '관리자'); await pad(A, srv.pin); await A.click('#go');
    await waitScr(A, 'pin'); assert.ok(/처음 오셨네요/.test(await text(A)));
    await pad(A, '8259'); await sleep(60); await pad(A, '8259'); await waitScr(A, 'courses');
    assert.ok(await A.$('.hd [data-thm]'), '해·달 단추');
    assert.strictEqual(await A.evaluate(() => getComputedStyle(document.querySelector('.hd')).backgroundColor), 'rgb(255, 255, 255)');
    const keys = await A.evaluate(() => Object.keys(localStorage));
    assert.ok(keys.includes('lz@yangju.t') && !keys.includes('lz.t'), keys.join(','));
    assert.ok(/회원/.test(await text(A, '.tabs')), '관리자는 회원 탭');
  });
  await t('A2 관리자가 운영자·월간·연간 계정 만들기(처음 비밀번호와 안내문)', async () => {
    await A.click('[data-tab="members"]'); await waitScr(A, 'members');
    await A.fill('#nn', '운영자'); await A.click('#kind button[data-k="op"]'); await A.click('#mk'); await dlg(A, '만들기'); await A.waitForSelector('#inv');
    pins.op = (await text(A, '#inv')).match(/처음 비밀번호: (\d{4})/)[1];
    pins.m = await makeMember(A, '다람쥐', 'month'); pins.y = await makeMember(A, '너구리', 'year');
    assert.ok(/\?u=%EB%84%88%EA%B5%AC%EB%A6%AC/.test(await text(A, '#inv')), '개인 주소');
    const x = await text(A); assert.ok(/월간회원 · D-29/.test(x) && /연간회원 · D-364/.test(x), x.slice(0, 400));
    await shot(A, 'a2-members');
  });

  /* ───────── 운영자 ───────── */
  const O = await phone('운영자');
  await t('B1 운영자: 회원 탭, 체험회원만 만들 수 있음, 체험 하루 연장(1/2), 월간회원에는 비밀번호만', async () => {
    await firstLogin(O, '운영자', pins.op, '5813');
    await O.click('[data-tab="members"]'); await waitScr(O, 'members');
    assert.ok(!(await O.$('#kind')), '등급 고르기 없음'); assert.ok(/체험회원.*만 만들 수 있어요/.test(await text(O)));
    pins.t = await makeMember(O, '체험이');
    await O.click('.mem:has-text("체험이") [data-mg]'); await O.click('.mp [data-a="trialExt"]'); await dlg(O, '하루 늘리기');
    await O.waitForFunction(() => /체험 연장 1\/2/.test(document.querySelector('#ml').innerText));
    await O.click('.mem:has-text("다람쥐") [data-mg]');
    const btns = await O.$$eval('.mp button', b => b.map(x => x.dataset.a)); assert.deepStrictEqual(btns, ['pin']);
    assert.strictEqual(env.call({ a: 'setCfg', price_year: 5000 }, (env.call({ a: 'login', nick: '운영자', pin: '5813' })).token).err, 'perm', '운영자는 요금 설정 불가');
  });

  /* ───────── 코스 등록(월간회원) ───────── */
  const M = await phone('다람쥐'); let cid = '';
  await t('C1 이름 확인: 기존 "목행충주호파크골프AB"가 있으면 "목행충주CD" → "목행충주호파크골프CD"로 고치자고 제안', async () => {
    const at = admTok(); const h9 = Array.from({ length: 9 }, (_, i) => [4, 60 + i]);
    const f = env.call({ a: 'regFront', name: '목행충주호파크골프AB', holes: h9 }, at); env.call({ a: 'regBack', id: f.id, holes: h9 }, at);
    await firstLogin(M, '다람쥐', pins.m, '7391');
    await M.click('#fab'); await waitScr(M, 'reg');
    await M.fill('#rn', '목행충주 CD'); assert.strictEqual(await M.inputValue('#rn'), '목행충주CD', '띄어쓰기 지움');
    await M.waitForSelector('#nb [data-sug]'); assert.ok(/목행충주호파크골프CD/.test(await text(M, '#nb')));
    await M.click('#nb [data-sug]'); await M.waitForFunction(() => /등록할 수 있는 이름/.test(document.querySelector('#nb').innerText));
    assert.strictEqual(await M.inputValue('#rn'), '목행충주호파크골프CD');
  });
  await t('C2 전반 9홀(파 버튼 색 바뀜, 1홀 내 기록도 넣기) → "전반 9홀 저장이 완료되었어요" → 후반 화면, 아직 다른 회원에게는 안 보임', async () => {
    const holes = await M.$$('#hl .hole');
    for (let k = 0; k < 9; k++) { await holes[k].$eval('[data-p="4"]', b => b.click()); await (await holes[k].$('[data-m]')).fill(String(50 + k) + '.5'); }
    assert.ok(await holes[0].$eval('[data-p="4"]', b => b.classList.contains('on') && getComputedStyle(b).backgroundColor === 'rgb(212, 14, 26)'), '고른 파 버튼은 빨강');
    await holes[0].$eval('[data-on]', b => b.click()); await M.click('#hl .hole >> nth=0 >> [data-ref="c"]');
    assert.ok(/홀컵 그대로\s*타격감 17\(50M\) 정도/.test(await text(M, '#hl .hole >> nth=0 >> .sbox')), await text(M, '#hl .hole >> nth=0 >> .sbox'));
    await shot(M, 'c2-front'); await M.click('#save');
    await M.waitForSelector('.dlg'); assert.ok(/전반 9홀 저장이 완료되었어요/.test(await text(M, '.dlg'))); await dlg(M, '후반 9홀 입력하기');
    await waitScr(M, 'regBack'); cid = (await M.evaluate(() => LZ.stack[LZ.stack.length - 1].p.id));
    const yt = env.call({ a: 'login', nick: '관리자', pin: '8259' }).token;
    const other = env.call({ a: 'mCreate', nick: '구경꾼', kind: 'year' }, yt); const ot = env.call({ a: 'login', nick: '구경꾼', pin: other.pin }).token;
    assert.ok(!env.call({ a: 'courses' }, ot).courses.some(c => c.id === cid), '전반만 저장된 코스는 다른 회원에게 안 보임');
  });
  await t('C3 후반 9홀 → 등록하기 → 코스 표(화면 꺼짐 방지 켜짐), 1홀 내 기록 저장됨', async () => {
    const holes = await M.$$('#hl .hole');
    for (let k = 0; k < 9; k++) { await holes[k].$eval('[data-p="3"]', b => b.click()); await (await holes[k].$('[data-m]')).fill(String(70 + k)); }
    await M.click('#save'); await waitScr(M, 'holes');
    assert.ok(/파 63/.test(await text(M)), await text(M));
    assert.ok(await M.evaluate(() => __wl.active === 1), '화면 꺼짐 방지');
    assert.strictEqual(recsOf('다람쥐')[0].r, 'c'); assert.strictEqual(recsOf('다람쥐')[0].p, 17);
  });
  await t('C4 홀 편집: 최초화면·좌측 2칸·타격감 20(65M), 자동 저장(시트 확인), 좌측/우측 표기', async () => {
    await M.click('.rw.me >> nth=1'); await waitScr(M, 'edit');
    assert.strictEqual(await M.inputValue('[data-pin]'), '17', '타격감 17이 처음부터 채워짐');
    await M.click('[data-ref="f"]'); await M.click('[data-d="L"]'); await M.click('[data-s="1"]');
    await M.fill('[data-pin]', '20');
    const s = await text(M, '[data-sent]'); assert.ok(/최초화면에서 좌측 2칸/.test(s) && /20\(65M\)/.test(s), s);
    assert.ok(/좌측/.test(await text(M, '.lr')) && !/왼쪽/.test(await text(M)));
    assert.ok(await waitFor(() => { const r = recsOf('다람쥐'); return r && r[1].r === 'f' && r[1].n === 2 && r[1].d === 'L' && r[1].p === 20; }), '시트 저장');
    await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent));
    assert.ok(await M.evaluate(() => __wl.active === 1)); await shot(M, 'c4-edit');
    await M.click('[data-back]'); await waitScr(M, 'holes'); await M.click('[data-back]'); await waitScr(M, 'courses');
    assert.ok(await M.evaluate(() => __wl.active === 0), '코스 화면을 나가면 꺼짐 방지 해제');
  });

  /* ───────── 가져오기·비교(연간회원) ───────── */
  const Y = await phone('너구리');
  await t('D1 다른 회원 기록 가져오기: 빈 홀만 채우기(2홀) → 되돌리기 → 모두 덮어쓰기', async () => {
    await firstLogin(Y, '너구리', pins.y, '6482');
    await Y.click(`.card[data-id="${cid}"]`); await waitScr(Y, 'holes');
    assert.ok(/다람쥐님/.test(await text(Y, '#who')));
    await Y.click('#imp'); await Y.waitForSelector('.dlg'); assert.ok(/빈 홀만 채우기 \(2홀\)/.test(await text(Y, '.dlg'))); await dlg(Y, '빈 홀만 채우기');
    await Y.waitForSelector('#ud'); assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && r[1].r === 'f'; }), '가져온 기록 저장');
    await Y.click('#ud'); assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && !r[0].r && !r[1].r; }), '되돌리기 저장');
    await Y.click('#imp'); await dlg(Y, '모두 덮어쓰기');
    assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && r[1].n === 2; }));
  });
  await t('D2 비교 분석: 같은 2홀 → 2홀을 우측으로 바꾸면 "다른 홀 1", "좌측으로 4칸 더"', async () => {
    await Y.click('#cmp'); await waitScr(Y, 'compare');
    assert.ok(/2\s*같은 홀/.test(await text(Y, '.sumg')), await text(Y, '.sumg'));
    await Y.click('[data-ed="1"]'); await waitScr(Y, 'edit'); await Y.click('[data-d="R"]');
    await Y.click('[data-back]'); await sleep(300); if (await Y.$('.dlg')) await dlg(Y, '저장하고 나가기');
    await waitScr(Y, 'compare'); const x = await text(Y);
    assert.ok(/1\s*다른 홀/.test(x) && /다람쥐님이 좌측으로 4칸 더/.test(x), x.slice(0, 600));
    assert.ok(await Y.evaluate(() => __wl.active === 1), '비교 화면도 꺼짐 방지'); await shot(Y, 'd2-compare');
  });
  await t('D3 내 기록만 보기: 다른 회원 줄이 사라지고, 다시 열어도 기억', async () => {
    await Y.click('[data-back]'); await waitScr(Y, 'holes');
    assert.ok(await Y.$$eval('#ht .rw:not(.me)', r => r.length) > 0);
    await Y.check('#om'); assert.strictEqual(await Y.$$eval('#ht .rw:not(.me)', r => r.length), 0);
    await Y.reload(); await waitScr(Y, 'courses').catch(() => {}); await Y.evaluate(id => LZ.go('holes', { id }), cid); await waitScr(Y, 'holes');
    assert.ok(await Y.isChecked('#om'));
  });

  /* ───────── 결제(체험회원) ───────── */
  const T = await phone('체험이');
  await t('E1 체험회원: 안내 띠 → 결제 화면(연간 9,000원·월간 1,000원, 계좌 주*수, 닉네임 안내, 카카오페이 QR)', async () => {
    await firstLogin(T, '체험이', pins.t, '4164');
    assert.ok(/체험회원/.test(await text(T, '.ban')));
    assert.ok(/월간·연간/.test(await text(T, '#fab')), '체험은 코스 등록 불가');
    await T.click('[data-pay]'); await waitScr(T, 'pay');
    assert.ok(/9,000원/.test(await text(T, '.pl')) && /1,000원/.test(await text(T, '.pl')));
    assert.ok(/"체험이"/.test(await text(T)) && /qr\.kakaopay\.com/.test(await T.getAttribute('#kgo', 'href')));
    await T.waitForSelector('#qrb img'); await shot(T, 'e1-pay');
    await T.click('[data-pl="month"]'); await T.click('#seg2 [data-m="bank"]');
    const x = await text(T); assert.ok(/3333-05-8835107/.test(x) && /주\*수/.test(x) && /카카오뱅크/.test(x) && /받는 분 통장 표시/.test(x), x.slice(0, 500));
    await T.click('#sent'); await dlg(T, '네, 보냈어요');
    await T.waitForFunction(() => /입금 확인을 기다리고/.test(document.querySelector('#app').innerText));
  });
  await t('E2 관리자 결제 확인 → 승인 → 체험회원이 "승인됐는지 확인"을 누르면 월간회원으로 바로 시작', async () => {
    await A.click('[data-tab="settings"]'); await waitScr(A, 'settings'); await A.click('#pays'); await waitScr(A, 'payments');
    assert.ok(/체험이님 · 월간회원 1,000원/.test(await text(A))); await shot(A, 'e2-payments');
    await A.click('[data-ok]'); await dlg(A, '승인'); await A.waitForFunction(() => /확인 대기 0건/.test(document.querySelector('#app').innerText));
    await T.click('#chk'); await waitScr(T, 'courses');
    assert.ok(/월간회원/.test(await text(T, '.hd')), await text(T, '.hd'));
  });
  await t('E3 환불 계산: 7일 이내·기록 안 씀 → 전액 1,000원', async () => {
    await A.click('[data-rf]'); await A.waitForSelector('.dlg h3'); const d = await text(A, '.dlg'); await dlg(A, '취소');
    assert.ok(/환불 1,000원/.test(d) && /전액/.test(d), d);
  });

  /* ───────── 대기열 ───────── */
  await t('F1 좌석 1개: 두 번째 회원은 대기 화면("앞에 0명") → 첫 회원이 로그아웃하면 자동으로 들어감', async () => {
    assert.ok(env.call({ a: 'setCfg', seats: 1 }, admTok()).ok);
    delete env.cache.seats; delete env.cache.queue;
    await M.reload(); await waitScr(M, 'courses');
    await Y.reload(); await Y.waitForSelector('.qwait'); assert.ok(/0명/.test(await text(Y, '.qwait')) && /지금 이용하는 분이 많아요/.test(await text(Y, '.qwait')));
    await shot(Y, 'f1-queue');
    await M.click('[data-tab="settings"]'); await waitScr(M, 'settings'); await M.click('#out'); await dlg(M, '로그아웃'); await waitScr(M, 'login');
    await Y.waitForSelector('.qwait', { state: 'detached', timeout: 8000 }); await waitScr(Y, 'courses');
    assert.ok(env.call({ a: 'setCfg', seats: 40 }, admTok()).ok);
  });

  /* ───────── 기간 끝남 ───────── */
  await t('G1 40일 뒤 월간회원 만료: 빨간 안내 + 결제 단추, 다른 회원 기록 안 보임, 홀 편집은 읽기만', async () => {
    env.state.now += 40 * DAY;
    await M.goto('http://localhost:8801/?u=' + encodeURIComponent('다람쥐')); await waitScr(M, 'login'); await pad(M, '7391'); await M.click('#go'); await waitScr(M, 'courses');
    const x = await text(M); assert.ok(/기간이 끝났어요/.test(x) && /이용권 결제하기/.test(x), x.slice(0, 300));
    assert.ok(!/다른 회원/.test(await text(M, '#clist')));
    await M.click(`.card[data-id="${cid}"]`); await waitScr(M, 'holes'); assert.ok(/이용 기간이 끝나서/.test(await text(M)));
    await M.click('.rw.me >> nth=0'); await waitScr(M, 'edit'); assert.ok(/읽기만 가능/.test(await text(M, '#sv')));
    await shot(M, 'g1-expired');
  });

  /* ───────── 나가기 확인 · 화면 모드 ───────── */
  await t('H1 코스 등록 중 뒤로 → "작성 중인 내용" → 임시 저장 → 다시 열면 이어서 쓰기 질문', async () => {
    await Y.click('#fab'); await waitScr(Y, 'reg'); await Y.fill('#rn', '양주시험코스AB');
    await Y.click('[data-back]');
    try { await Y.waitForSelector('.dlg', { timeout: 4000 }); } catch (e) { console.log('      [진단]', await Y.evaluate(() => JSON.stringify({ st: LZ.stack.map(x => x.name), g: !!LZ.guard, d: LZ.guard && LZ.guard.dirty(), h: history.length }))); await shot(Y, 'h1-debug'); throw e; }
    assert.ok(/작성 중인 내용이 있어요/.test(await text(Y, '.dlg')));
    await dlg(Y, '임시 저장하고 나가기'); await waitScr(Y, 'courses');
    await Y.click('#fab'); await Y.waitForSelector('.dlg'); assert.ok(/양주시험코스AB/.test(await text(Y, '.dlg'))); await dlg(Y, '이어서 쓰기');
    await waitScr(Y, 'reg'); assert.strictEqual(await Y.inputValue('#rn'), '양주시험코스AB');
  });
  await t('H2 해·달 단추로 어두운 화면 → 새로고침해도 유지(폰 전체 설정 lz.theme), 설정 화면 모드 단추와 맞음', async () => {
    await A.click('[data-thm]'); assert.strictEqual(await A.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.strictEqual(await A.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(23, 25, 30)');
    await A.reload(); await waitScr(A, 'courses');
    assert.strictEqual(await A.evaluate(() => document.documentElement.dataset.theme + '|' + localStorage.getItem('lz.theme')), 'dark|dark');
    await A.click('[data-tab="settings"]'); await waitScr(A, 'settings'); assert.ok(await A.$eval('#thm [data-t="dark"]', b => b.classList.contains('on')));
    await shot(A, 'h2-dark');
  });
  await t('H5 서버가 안 될 때 고친 기록: "저장 못 했어요" 표시 → 앱을 닫았다가 다시 열면 이어서 저장됨', async () => {
    await Y.evaluate(id => LZ.go('edit', { id, i: 3 }, { skipGuard: true }), cid); await waitScr(Y, 'edit');
    srv.log.fail = true;
    try { await Y.click('[data-ref="c"]'); } catch (e) { srv.log.fail = false; throw e; } await Y.waitForFunction(() => /저장 못 했어요|다시 저장 중/.test(document.querySelector('#sv').textContent), null, { timeout: 12000 });
    const Y2 = await Y.context().newPage(); await Y.close();
    srv.log.fail = false;
    await Y2.goto('http://localhost:8801/'); await waitScr(Y2, 'courses');
    assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && r[3].r === 'c'; }, 10000), '다시 열었을 때 저장');
    assert.ok(await Y2.evaluate(() => !localStorage.getItem('lz@yangju.pend')), '저장 후 임시 보관 지움');
  });
  await t('H3 지점 코드가 다른 주소로 보내면 서버가 거절', async () => {
    const r = await A.evaluate(async () => { const res = await fetch(LZ_CONFIG.API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ a: 'cfg', b: 'uijeongbu' }) }); return res.json(); });
    assert.strictEqual(r.err, 'branch');
  });
  await t('H4 사전요청(OPTIONS) 없음, 화면 오류 없음', async () => {
    assert.strictEqual(srv.log.options, 0);
    assert.deepStrictEqual(errors, []);
  });

  console.log(`\n결과: ${ok} 통과 / ${bad} 실패`);
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
