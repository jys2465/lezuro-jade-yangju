// 실제 브라우저(Chromium, 휴대폰 크기)로 처음부터 끝까지 눌러 보는 시험 — v3 (통합 서버 · 지점)
// 실행: node tests/e2e.test.js   (스크린샷은 tests/shots/ 에 저장)
const { chromium } = require('playwright'); const { start } = require('./e2e-server'); const assert = require('assert');
const SH = __dirname + '/shots/'; require('fs').mkdirSync(SH, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
let ok = 0, bad = 0, cspBlocked = 0; const PAGES = [];
async function t(name, fn) {
  try { await fn(); ok++; console.log('  ✓', name); }
  catch (e) {
    bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join(' | ')); if (process.env.TRACE) console.log(e.stack);
    const tag = name.split(' ')[0];                                        // 실패하면 열린 폰마다 화면과 현재 화면 이름을 남김
    for (const [nm, pg] of PAGES) { try { if (pg.isClosed()) continue; const st = await pg.evaluate(() => (window.LZ && LZ.stack.map(x => x.name).join('>')) + ' | ' + (document.querySelector('#layer') || {}).innerText); console.log('       [' + nm + '] ' + String(st).replace(/\n/g, ' ').slice(0, 160)); await pg.screenshot({ path: SH + 'fail-' + tag + '-' + nm + '.png' }); } catch (er) { /* 무시 */ } }
  }
}
const AND = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const WAKE = () => { window.__wl = { req: 0, rel: 0, active: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.req++; __wl.active++; const l = new EventTarget(); let on = true; l.release = async () => { if (!on) return; on = false; __wl.rel++; __wl.active--; l.dispatchEvent(new Event('release')); }; return l; } } }); };

(async () => {
  const srv = await start(), env = srv.env, browser = await chromium.launch(), errors = [];
  async function phone(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', userAgent: AND, hasTouch: true });
    await ctx.addInitScript(WAKE);
    await ctx.addInitScript(() => { window.__vib = 0; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__vib++; return true; } }); });
    await ctx.addInitScript(() => { window.LZ_QPOLL = 700; try { localStorage.setItem('lz.hintOff', '1'); } catch (e) { /* 무시 */ } });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000); PAGES.push([name, p]);
    p.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() !== 'error' || /Failed to load resource|ERR_|net::/.test(m.text())) return; if (/Refused to execute inline event handler/.test(m.text())) { cspBlocked++; return; } errors.push(name + ' console: ' + m.text()); });
    return p;
  }
  const scr = p => p.evaluate(() => window.LZ && LZ.stack.length ? LZ.stack[LZ.stack.length - 1].name : '');
  const waitScr = (p, n, ms = 8000) => p.waitForFunction(n => window.LZ && LZ.stack.length && LZ.stack[LZ.stack.length - 1].name === n && !document.querySelector('#app .sk') && !document.querySelector('#layer .spin'), n, { timeout: ms });
  const pad = async (p, d) => { for (const c of d) await p.click(`#app .pad button[data-k="${c}"]`); };
  const text = (p, s = '#app') => p.locator(s).first().innerText();
  const dlg = async (p, label) => { await p.waitForSelector('.dlg .btn'); await p.click(`.dlg .btn:has-text("${label}")`); await sleep(120); };
  const toast = p => p.locator('#toast').innerText();
  const shot = (p, n) => p.screenshot({ path: SH + n + '.png' });
  async function setPin(p, pin, land) { await waitScr(p, 'pin'); await pad(p, pin); await sleep(60); await pad(p, pin); await waitScr(p, land || (pin.length === 6 ? 'dash' : 'courses')); }
  async function firstLogin(p, nick, pin, newPin, q) {
    await p.goto('http://localhost:8801/' + (q || '?u=' + encodeURIComponent(nick))); await waitScr(p, 'login');
    if (pin.length === 6) await p.click('#plen');
    await pad(p, pin); await p.click('#go'); await setPin(p, newPin);
  }
  const ADMIN_PIN = '825913', OP_PIN = '581392';
  const admTok = () => env.call({ a: 'login', nick: '관리자', pin: ADMIN_PIN, dev: 't' }).token;
  const uidOf = nick => { const sh = env.ss.getSheetByName('회원'); for (let r = 2; r <= sh.getLastRow(); r++) if (sh.getRange(r, 1).getValue() === nick) return sh.getRange(r, 15).getValue(); return null; };
  const recsOf = (nick, br = 'yangju') => { const id = uidOf(nick), sh = env.ss.getSheetByName('기록'); for (let r = 2; r <= sh.getLastRow(); r++) if (sh.getRange(r, 2).getValue() === id && (sh.getRange(r, 6).getValue() || 'yangju') === br) return JSON.parse(sh.getRange(r, 4).getValue()); return null; };
  const trustTotal = () => env.ss.getSheetByName('신뢰도').getLastRow();
  async function dismiss(p, until) {                                    // 앱을 열 때 뜨는 공지 팝업 닫기(until 이 보이면 멈춤)
    for (let i = 0; i < 6; i++) {
      try { await p.waitForSelector('.dlg', { timeout: 1500 }); } catch (e) { return false; }
      if (until && new RegExp(until).test(await text(p, '.dlg'))) return true;
      await p.click('.dlg .btn:has-text("확인")'); await sleep(200);
    }
    return false;
  }
  const waitFor = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(120); } return false; };
  async function makeMember(p, nick, kind) {
    await p.fill('#nn', nick);
    if (kind) await p.click(`#kind button[data-k="${kind}"]`);
    await p.click('#mk');
    await p.waitForFunction(n => { const e = document.querySelector('#inv'); return e && e.innerText.includes('닉네임: ' + n); }, nick);   // 앞 계정 안내문이 아니라 새 계정 것이 나올 때까지
    return (await text(p, '#inv')).match(/처음 비밀번호: (\d{4,6})/)[1];
  }

  console.log('\n[실제 브라우저 종단 시험 v3 — 처음부터 끝까지]');
  const A = await phone('관리자'); const pins = {};

  /* ───────── 관리자 ───────── */
  await t('A1 관리자 첫 로그인(6자리) → 쉬운 번호 거절 → 6자리로 바꾸기 → 현황판, 위쪽 "📍 지점 ▾" 띠, 저장소 lz@app.', async () => {
    await A.goto('http://localhost:8801/'); await waitScr(A, 'login'); await shot(A, 'a1-login');
    assert.ok(/파크골프 공략노트/.test(await A.title()));
    await A.click('#plen'); await A.fill('#nick', '관리자'); await pad(A, srv.pin); await A.click('#go');
    await waitScr(A, 'pin'); assert.ok(/6자리/.test(await text(A)));
    await pad(A, '123456'); assert.ok(/쉬운 번호/.test(await text(A, '#err')), '123456 거절');
    assert.ok(await A.evaluate(() => window.__vib) >= 12, '비밀번호 누를 때 진동');
    await pad(A, ADMIN_PIN); await sleep(60); await pad(A, ADMIN_PIN); await waitScr(A, 'dash');
    assert.ok(await A.$('.hd [data-thm]'), '해·달 단추');
    assert.strictEqual(await A.evaluate(() => getComputedStyle(document.querySelector('.hd')).backgroundColor), 'rgb(255, 255, 255)');
    assert.ok(/📍 제이드 양주점/.test(await text(A, '.store [data-branch]')), await text(A, '.store'));
    const keys = await A.evaluate(() => Object.keys(localStorage));
    assert.ok(keys.includes('lz@app.t') && !keys.includes('lz.t') && keys.includes('lz.br'), keys.join(','));
    assert.ok(/현황/.test(await text(A, '.tabs')) && /회원/.test(await text(A, '.tabs')), '관리자는 현황·회원 탭');
    assert.ok(/회원 \(운영진 제외\)/.test(await text(A, '.kpi')), '현황판');
    assert.strictEqual(env.call({ a: 'login', nick: '관리자', pin: srv.pin }).err, 'login', '처음 번호는 이제 안 됨');
    await shot(A, 'a1-dash');
  });
  await t('A2 관리자가 운영자·월간·연간 계정 만들기(처음 비밀번호와 안내문)', async () => {
    await A.click('[data-tab="members"]'); await waitScr(A, 'members');
    await A.fill('#nn', '운영자'); await A.click('#kind button[data-k="op"]'); await A.click('#mk'); await dlg(A, '만들기'); await A.waitForSelector('#inv');
    pins.op = (await text(A, '#inv')).match(/처음 비밀번호: (\d{6})/)[1];
    assert.ok(/6자리로 바꾸게/.test(await text(A, '#inv')), '운영자 안내문은 6자리');
    pins.m = await makeMember(A, '다람쥐', 'month'); pins.y = await makeMember(A, '너구리', 'year');
    assert.ok(/\?s=yangju&u=%EB%84%88%EA%B5%AC%EB%A6%AC/.test(await text(A, '#inv')), '개인 주소(지점 포함)');
    const x = await text(A); assert.ok(/월간회원 · D-29/.test(x) && /연간회원 · D-364/.test(x), x.slice(0, 400));
    await shot(A, 'a2-members');
  });

  /* ───────── 운영자 ───────── */
  const O = await phone('운영자');
  await t('B1 운영자: 회원 탭, 체험회원만 만들 수 있음, 체험 하루 연장(1/2), 월간회원에는 비밀번호만', async () => {
    await firstLogin(O, '운영자', pins.op, OP_PIN);
    await O.click('[data-tab="courses"]'); await waitScr(O, 'courses');
    await O.click('[data-tab="members"]'); await waitScr(O, 'members');
    assert.ok(!(await O.$('#kind')), '등급 고르기 없음'); assert.ok(/체험회원.*만 만들 수 있어요/.test(await text(O)));
    pins.t = await makeMember(O, '체험이');
    await O.click('.mem:has-text("체험이") [data-mg]'); await O.click('.mp [data-a="trialExt"]'); await dlg(O, '하루 늘리기');
    await O.waitForFunction(() => /체험 연장 1\/2/.test(document.querySelector('#ml').innerText));
    await O.click('.mem:has-text("다람쥐") [data-mg]');
    const btns = await O.$$eval('.mp button', b => b.map(x => x.dataset.a)); assert.deepStrictEqual(btns, ['trust', 'pin']);
    assert.strictEqual(env.call({ a: 'setCfg', price_year: 5000 }, (env.call({ a: 'login', nick: '운영자', pin: OP_PIN })).token).err, 'perm', '운영자는 요금 설정 불가');
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
    assert.ok(await holes[0].$eval('[data-p="4"]', b => b.classList.contains('on') && getComputedStyle(b).backgroundColor === 'rgb(15, 118, 110)'), '고른 파 버튼은 청록(브랜드 색)');
    await holes[0].$eval('[data-on]', b => b.click()); await M.click('#hl .hole >> nth=0 >> [data-ref="c"]');
    assert.ok(/홀컵 그대로\s*타격감 17\(50M\) 정도/.test(await text(M, '#hl .hole >> nth=0 >> .sbox')), await text(M, '#hl .hole >> nth=0 >> .sbox'));
    await shot(M, 'c2-front'); await M.click('#save');
    await M.waitForSelector('.dlg'); await M.waitForFunction(() => /전반 9홀 저장이 완료되었어요/.test(document.querySelector('#layer').innerText), null, { timeout: 8000 }).catch(async () => { throw new Error('대화창: ' + await text(M, '#layer') + ' / ' + await text(M, '#err')); }); await dlg(M, '후반 9홀 입력하기');
    await waitScr(M, 'regBack'); cid = (await M.evaluate(() => LZ.stack[LZ.stack.length - 1].p.id));
    const yt = admTok();
    const other = env.call({ a: 'mCreate', nick: '구경꾼', kind: 'year' }, yt); const ot = env.call({ a: 'login', nick: '구경꾼', pin: other.pin }).token; assert.strictEqual(env.call({ a: 'courses' }, ot).err, 'must', '처음 비밀번호 그대로면 막힘'); env.call({ a: 'pin', pin: '7531' }, ot);
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
    assert.ok(!(await M.$('[data-d]')), '좌측·우측 단추는 없음');
    await M.click('[data-ref="f"]'); await M.click('[data-s="-1"]'); await M.click('[data-s="-1"]');
    assert.ok(/−2\s*좌측 2칸/.test(await text(M, '[data-dir]')), await text(M, '[data-dir]'));
    for (let i = 0; i < 16; i++) await M.click('[data-s="-1"]');
    assert.ok(/−15\s*좌측 15칸/.test(await text(M, '[data-dir]')), '좌측 15칸까지 ' + await text(M, '[data-dir]'));
    for (let i = 0; i < 13; i++) await M.click('[data-s="1"]');
    assert.ok(/−2/.test(await text(M, '[data-dir]')));
    await M.click('[data-q="5"]'); assert.ok(/\+5\s*우측 5칸/.test(await text(M, '[data-dir]')) && await M.$eval('[data-q="5"]', b => b.classList.contains('on')), '빠른 단추 +5');
    await M.click('[data-q="-3"]'); await M.click('[data-s="1"]'); assert.ok(/−2/.test(await text(M, '[data-dir]')), '−3 에서 + 한 번이면 −2');
    assert.ok(await M.evaluate(() => window.__vib) >= 30, '누를 때마다 진동');
    const v0 = await M.evaluate(() => window.__vib); await M.evaluate(() => localStorage.setItem('lz.buzz', '0')); await M.click('[data-s="-1"]'); await M.click('[data-s="1"]');
    assert.strictEqual(await M.evaluate(() => window.__vib), v0, '진동 끄면 안 떨림'); await M.evaluate(() => localStorage.removeItem('lz.buzz'));
    await M.fill('[data-pin]', '20');
    const s = await text(M, '[data-sent]'); assert.ok(/최초화면에서 좌측 2칸/.test(s) && /20\(65M\)/.test(s), s);
    assert.ok(!/왼쪽/.test(await text(M)));
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
    assert.ok(/운영자에게 수정을 요청/.test(await text(Y)) && !(await Y.$('#info')), '등록자가 아니면 수정 단추 대신 운영자 요청 안내');
    await Y.click('#imp'); await Y.waitForSelector('.dlg'); assert.ok(/빈 홀만 채우기 \(2홀\)/.test(await text(Y, '.dlg'))); await dlg(Y, '빈 홀만 채우기');
    await Y.waitForSelector('#ud'); assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && r[1].r === 'f'; }), '가져온 기록 저장');
    const trustOf = n => (env.call({ a: 'members' }, admTok()).members.find(m => m.nick === n) || {}).trust;
    assert.ok(await waitFor(() => trustOf('다람쥐') === 1), '가져가면 다람쥐 신뢰도 1점');
    await Y.waitForFunction(() => /신뢰도 1점/.test(document.querySelector('#who').innerText));
    await Y.click('#ud'); assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && !r[0].r && !r[1].r; }), '되돌리기 저장');
    assert.ok(await waitFor(() => trustOf('다람쥐') === 0), '되돌리면 방금 생긴 1점은 빠짐');
    await Y.click('#imp'); await dlg(Y, '모두 덮어쓰기');
    assert.ok(await waitFor(() => { const r = recsOf('너구리'); return r && r[1].n === 2; }));
    assert.ok(await waitFor(() => trustOf('다람쥐') === 1), '다시 가져가면 1점');
  });
  await t('D2 비교 분석: 같은 2홀 → 2홀을 우측으로 바꾸면 "다른 홀 1", "좌측으로 4칸 더"', async () => {
    await Y.click('#cmp'); await waitScr(Y, 'compare');
    assert.ok(/2\s*같은 홀/.test(await text(Y, '.sumg')), await text(Y, '.sumg'));
    await Y.click('[data-ed="1"]'); await waitScr(Y, 'edit'); for (let i = 0; i < 4; i++) await Y.click('[data-s="1"]');
    assert.ok(/\+2\s*우측 2칸/.test(await text(Y, '[data-dir]')), '− 2 에서 + 네 번이면 우측 2칸');
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

  await t('D4 신뢰도: 다람쥐 코스 화면에 "내 기록 신뢰도 1점" → 누르면 언제·누가(너구리)·어느 코스', async () => {
    await M.reload(); await waitScr(M, 'courses');
    assert.ok(/내 기록 신뢰도\s*1점/.test(await text(M, '[data-trust]')), await text(M, '[data-trust]'));
    await M.click('[data-trust]'); await waitScr(M, 'trust');
    const x = await text(M); assert.ok(/너구리님/.test(x) && /목행충주호파크골프CD/.test(x) && /2026\. /.test(x), x.slice(0, 400));
    await shot(M, 'd4-trust'); await M.click('[data-back]'); await waitScr(M, 'courses');
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
    const u = await T.evaluate(() => LZ.S.user), today = env.call({ a: 'cfg' }).today;
    const end = new Date(Date.parse(today + 'T00:00:00Z') + 29 * DAY).toISOString().slice(0, 10);
    assert.deepStrictEqual([u.kind, u.start, u.end, u.left], ['month', today, end, 29], JSON.stringify(u));
    assert.strictEqual(await text(T, '.who b'), '체험이'); assert.strictEqual(await text(T, '.who span'), '월간회원 · D-29');
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
    await A.reload(); await waitScr(A, 'dash');
    assert.ok(/logo-dark/.test(await A.getAttribute('.hd img[data-logo]', 'src')), '어두운 화면 로고');
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
    assert.ok(await Y2.evaluate(() => !localStorage.getItem('lz@app.pend')), '저장 후 임시 보관 지움');
  });
  await t('H6 머리글: 좁은 폰(320px)·긴 닉네임에서도 첫 줄 닉네임(굵게, 오른쪽 정렬), 둘째 줄 회원 종류·D-day가 각각 한 줄', async () => {
    const at = admTok(); const c = env.call({ a: 'mCreate', nick: '긴닉네임여덟자', kind: 'year' }, at); const tk = env.call({ a: 'login', nick: '긴닉네임여덟자', pin: c.pin }).token;
    env.call({ a: 'pin', pin: '3925' }, tk);
    const N = await phone('좁은폰'); await N.setViewportSize({ width: 320, height: 700 });
    await N.goto('http://localhost:8801/'); await N.evaluate(t => { localStorage.setItem('lz@app.t', t); localStorage.setItem('lz@app.nick', '긴닉네임여덟자'); }, tk);
    await N.goto('http://localhost:8801/'); await waitScr(N, 'courses');
    const g = await N.evaluate(() => { const b = document.querySelector('.who b').getBoundingClientRect(), sp = document.querySelector('.who span').getBoundingClientRect(), hd = document.querySelector('.hd').getBoundingClientRect(); const lh = parseFloat(getComputedStyle(document.querySelector('.who span')).lineHeight) || 16;
      return { bH: b.height, sH: sp.height, lh, below: sp.top >= b.bottom - 1, right: Math.abs(b.right - sp.right) < 2, fw: getComputedStyle(document.querySelector('.who b')).fontWeight, inside: hd.right >= b.right && b.left >= 0, txt: document.querySelector('.who').innerText }; });
    assert.ok(g.below && g.right && +g.fw >= 500 && g.inside && g.sH < g.lh * 1.6, JSON.stringify(g));
    await shot(N, 'h6-narrow-header');
  });
  await t('H7 지점 바꾸기: 너구리(기본 양주점) → 양주만송점, 기록은 따로·양주점 내 기록은 흐리게 참고 → 가져오기(신뢰도 없음) → 양주점으로 돌아옴', async () => {
    const W = await phone('너구리3');
    await W.goto('http://localhost:8801/?u=' + encodeURIComponent('너구리')); await waitScr(W, 'login'); await pad(W, '6482'); await W.click('#go'); await waitScr(W, 'courses');
    await W.click('.store [data-branch]'); await waitScr(W, 'branch');
    assert.ok(/기본 지점/.test(await text(W, '.card:has-text("제이드 양주점")')), '기본 지점 표시'); await shot(W, 'h7-branch');
    await W.click('[data-b="mansong"]'); await waitScr(W, 'courses');
    assert.ok(/📍 양주만송점/.test(await text(W, '.store')), await text(W, '.store'));
    assert.ok(/제이드 양주점 \d+홀/.test(await text(W, `.card[data-id="${cid}"]`)), '양주점 기록 칩');
    const before = trustTotal();
    await W.click(`.card[data-id="${cid}"]`); await waitScr(W, 'holes');
    assert.ok(await W.$('.blk.ref') && await W.$$eval('#ht .rw.ref', r => r.length) > 0, '양주점 내 기록(참고) 줄');
    assert.ok(/이 지점에는 이 코스에 공개된 다른 회원 기록이 아직 없어요/.test(await text(W)), '만송점에는 다람쥐 기록 없음');
    await W.click('#impref'); await dlg(W, '모두 덮어쓰기');
    assert.ok(await waitFor(() => { const r = recsOf('너구리', 'mansong'); return r && r[1].r === 'f'; }), '만송점 기록으로 저장');
    assert.ok(recsOf('너구리', 'yangju')[1].d === 'R', '양주점 기록은 그대로');
    await sleep(400); assert.strictEqual(trustTotal(), before, '내 기록을 가져와도 신뢰도는 그대로');
    await shot(W, 'h7-ref');
    await W.reload(); await waitScr(W, 'courses'); assert.ok(/양주만송점/.test(await text(W, '.store')), '다시 열어도 마지막 지점');
    await W.click('.store [data-branch]'); await waitScr(W, 'branch'); await W.click('[data-b="yangju"]'); await waitScr(W, 'courses');
    assert.ok(/제이드 양주점/.test(await text(W, '.store'))); await W.close();
  });
  await t('H8 닉네임 바꾸기: 체험이 → 체험왕, 예전 이름 로그인은 안내, 7일 안에 또 바꾸기 막힘, 기록·이용권 그대로', async () => {
    await T.evaluate(() => LZ.go('settings', {}, { reset: true, skipGuard: true })); await waitScr(T, 'settings');
    await T.click('#nk'); await waitScr(T, 'nick'); await T.fill('#nn', '다람쥐'); await T.click('#go'); await dlg(T, '바꾸기');
    await T.waitForFunction(() => /이미|쓰고/.test(document.querySelector('#err').textContent)); 
    await T.fill('#nn', '체험왕'); await T.click('#go'); await dlg(T, '바꾸기'); await waitScr(T, 'settings');
    assert.strictEqual(await text(T, '.who b'), '체험왕');
    assert.ok(/최근에 바뀌었어요/.test(env.call({ a: 'login', nick: '체험이', pin: '4164' }).msg));
    assert.ok(env.call({ a: 'login', nick: '체험왕', pin: '4164' }).ok);
    await T.click('#nk'); await waitScr(T, 'nick'); assert.ok(/부터 다시 바꿀 수 있어요/.test(await text(T)));
    await T.click('[data-back]'); await waitScr(T, 'settings');
  });
  await t('H10 현황판·지점 관리: 지점별 회원 표, 운영자는 소속 지점만(결제 금액 없음), 관리자가 새 지점(강북수유점) 추가 → 회원 지점 목록에 보임', async () => {
    await A.evaluate(() => LZ.go('dash', {}, { reset: true, skipGuard: true })); await waitScr(A, 'dash');
    const x = await text(A); assert.ok(/양주만송점/.test(x) && /제이드 양주점/.test(x) && /결제/.test(x), x.slice(0, 500));
    await O.evaluate(() => LZ.go('dash', {}, { reset: true, skipGuard: true })); await waitScr(O, 'dash');
    const ox = await text(O); assert.ok(!/월 결제|입금 확인/.test(await text(O, '.kpi')) && !/양주만송점/.test(await text(O, '.tbl')), ox.slice(0, 400));
    await A.evaluate(() => LZ.go('branches', {}, { skipGuard: true })); await waitScr(A, 'branches');
    await A.fill('#bn', '강북수유점'); await A.fill('#bc', 'Suyu!'); assert.strictEqual(await A.inputValue('#bc'), 'suyu');
    await A.click('#mk'); await dlg(A, '만들기'); await A.waitForFunction(() => /강북수유점/.test(document.querySelector('#app').innerText) && /\?s=suyu/.test(document.querySelector('#app').innerText));
    await shot(A, 'h10-branches');
    const yt = env.call({ a: 'login', nick: '너구리', pin: '6482' }).token;
    assert.ok(env.call({ a: 'me' }, yt).branches.some(b => b.code === 'suyu'), '회원 지점 목록');
    const ms = env.call({ a: 'mCreate', nick: '만송이', kind: 'month', home: 'mansong' }, admTok()); assert.ok(ms.ok);
    const om = env.call({ a: 'members' }, env.call({ a: 'login', nick: '운영자', pin: OP_PIN }).token).members.map(m => m.nick);
    assert.ok(!om.includes('만송이') && om.includes('너구리'), '운영자는 소속 지점 회원만 ' + om.join(','));
  });
  await t('H11 예전 링크 ?s=없는지점 이어도 열림(기본 지점), 만송 회원 초대 링크 ?s=mansong 으로 만송점에서 시작', async () => {
    const V = await phone('옛링크'); await V.goto('http://localhost:8801/?s=uijeongbu'); await waitScr(V, 'login');
    assert.ok(/제이드 양주점/.test(await text(V, '.pill')), await text(V, '.hero'));
    const mp = env.call({ a: 'mUpdate', nick: '만송이', op: 'pin' }, admTok()).pin;
    await firstLogin(V, '만송이', mp, '2580', '?s=mansong&u=' + encodeURIComponent('만송이'));
    assert.ok(/양주만송점/.test(await text(V, '.store')), await text(V, '.store')); await V.close();
  });
  /* ───────── 문의하기(시험 모드) ───────── */
  let QY = null, qid = '';
  await t('Q1 시험 모드: 처음엔 시험 회원이 아니면 안 보임 → 관리자가 시험 회원(너구리) 지정 → 설정에 문의하기, FAQ 8개 펼치기', async () => {
    QY = await phone('너구리2');
    await QY.goto('http://localhost:8801/?u=' + encodeURIComponent('너구리')); await waitScr(QY, 'login'); await pad(QY, '6482'); await QY.click('#go'); await waitScr(QY, 'courses');
    await QY.click('[data-tab="settings"]'); await waitScr(QY, 'settings'); assert.ok(!(await QY.$('#qna')), '시험 회원 아니면 없음');
    await A.evaluate(() => LZ.go('settings', {}, { reset: true, skipGuard: true })); await waitScr(A, 'settings'); await A.click('#acfg'); await waitScr(A, 'adminCfg');
    assert.ok(await A.$eval('#qm [data-m="test"]', b => b.classList.contains('on')), '처음은 시험');
    await A.fill('#qt', '너구리'); await A.click('#save'); await A.waitForFunction(() => /설정을 저장했어요/.test(document.querySelector('#toast').textContent));
    await QY.reload(); await waitScr(QY, 'courses'); await QY.click('[data-tab="settings"]'); await waitScr(QY, 'settings'); await QY.click('#qna'); await waitScr(QY, 'qna');
    assert.strictEqual(await QY.$$eval('.faq', x => x.length), 11);
    await QY.click('.faq:has-text("타격감 17") .fq'); assert.ok(/17 = 50M/.test(await text(QY, '.faq.on .fa')));
    await shot(QY, 'q1-faq');
  });
  await t('Q2 1:1 문의: 분류·제목·내용을 쓰고 글자를 골라 굵게·빨강 → 보내면 꾸민 그대로 보임', async () => {
    await QY.click('#qt [data-t="list"]'); await QY.click('#ask'); await waitScr(QY, 'qnaNew');
    await QY.click('#qc [data-c="app"]'); await QY.fill('#qtl', '화면이 작아요');
    await QY.click('.red'); await QY.keyboard.type('글씨를 더 크게 하고 싶어요');
    await QY.evaluate(() => { const ed = document.querySelector('.red'), r = document.createRange(), t = ed.firstChild; r.setStart(t, 0); r.setEnd(t, 2); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await QY.click('.rtb [data-x="b"]'); await QY.click('.rtb [data-x="c-r"]');
    assert.ok(/12\/500자/.test(await text(QY, '.rcnt')) || /\/500자/.test(await text(QY, '.rcnt')));
    await shot(QY, 'q2-new'); await QY.click('#send'); await waitScr(QY, 'qnaView');
    qid = await QY.evaluate(() => LZ.stack[LZ.stack.length - 1].p.id);
    const h = await QY.$eval('.msgb .rich', e => e.innerHTML); assert.ok(/<b>/.test(h) && /c-r/.test(h) && /글씨/.test(h), h);
    const saved = srv.env.call({ a: 'qnaGet', id: qid }, admTok()).qna.msgs[0].html; assert.ok(/<b>/.test(saved) && /class="c-r"/.test(saved), saved);
  });
  await t('Q3 운영자: 문의 탭 빨간 숫자 1 → 답변(크게) → 회원은 설정 탭 숫자·코스 화면 "답변이 도착했어요" → 열면 숫자 사라짐', async () => {
    await O.reload(); await waitScr(O, 'courses').catch(() => {}); await O.evaluate(() => LZ.go('courses', {}, { reset: true, skipGuard: true })); await waitScr(O, 'courses');
    await O.waitForFunction(() => { const b = document.querySelector('[data-tab="qna"] .bdg'); return b && b.textContent === '1'; }, null, { timeout: 4000 }).catch(async () => { throw new Error('문의 숫자: ' + await O.evaluate(() => document.querySelector('.tabs').innerHTML.replace(/<svg.*?<\/svg>/g, ''))); });

    await O.click('[data-tab="qna"]'); await waitScr(O, 'qna'); await O.click(`[data-q2="${qid}"]`); await waitScr(O, 'qnaView');
    assert.ok(/안드로이드/.test(await text(O, '.meta')), '폰 정보가 함께 옴');
    await O.click('.red'); await O.keyboard.type('설정에서 글씨 크기를 크게로 바꿔 보세요');
    await O.keyboard.press('Control+A'); await O.click('.rtb [data-x="big"]'); await O.click('#send');
    await O.waitForFunction(() => document.querySelectorAll('.msgb').length === 2);
    await QY.evaluate(() => LZ.go('courses', {}, { reset: true, skipGuard: true })); await waitScr(QY, 'courses');
    assert.ok(/운영진 답변이 도착했어요/.test(await text(QY)), '코스 화면 띠'); assert.strictEqual(await text(QY, '[data-tab="settings"] .bdg'), String(1 + await QY.evaluate(() => LZ.noticeUnread())), '답변 1 + 안 읽은 공지');
    await QY.click('[data-qna]'); await waitScr(QY, 'qna'); await QY.click(`[data-q2="${qid}"]`); await waitScr(QY, 'qnaView');
    assert.ok(/운영진 답변/.test(await text(QY, '.thread')) && /big/.test(await QY.$eval('.msgb.st .rich', e => e.innerHTML)));
    await shot(QY, 'q3-thread');
    await QY.click('[data-back]'); await QY.click('[data-back]').catch(() => {}); await QY.evaluate(() => LZ.go('courses', {}, { reset: true, skipGuard: true })); await waitScr(QY, 'courses');
    assert.strictEqual(await QY.evaluate(() => { const b = document.querySelector('[data-tab="settings"] .bdg'); return (b ? +b.textContent : 0) - LZ.noticeUnread(); }), 0, '열어 보면 답변 숫자 사라짐(남은 건 안 읽은 공지)');
  });
  await t('Q4 결제 문의는 운영자 답변 불가(관리자만), 코스 화면 [수정 요청하기] → 코스 분류로 바로 문의, 위험한 태그는 제거', async () => {
    await QY.evaluate(id => LZ.go('holes', { id }), cid); await waitScr(QY, 'holes');
    await QY.click('#req'); await waitScr(QY, 'qnaNew');
    assert.ok(await QY.$eval('#qc [data-c="course"]', b => b.classList.contains('on')) && /수정 요청/.test(await QY.inputValue('#qtl')));
    await QY.evaluate(() => { document.querySelector('.red').innerHTML = '<img src=x onerror="window.__x=1">3홀 <a href="javascript:alert(1)">거리</a>가 틀려요<script>window.__y=1</script>'; document.querySelector('.red').dispatchEvent(new Event('input')); });
    await QY.click('#send'); await waitScr(QY, 'qnaView');
    const h = await QY.$eval('.msgb .rich', e => e.innerHTML); assert.ok(!/<img|<a|script/i.test(h) && /3홀/.test(h), h);
    const cq = await QY.evaluate(() => LZ.stack[LZ.stack.length - 1].p.id);
    await O.evaluate(() => { window.__x = 0; window.__y = 0; }); await O.evaluate(id => LZ.go('qnaView', { id }, { skipGuard: true }), cq); await waitScr(O, 'qnaView');
    assert.ok(await O.evaluate(() => !window.__x && !window.__y && !document.querySelector('.thread img, .thread a, .thread script')), '보는 사람 화면에서 아무것도 실행되지 않음');
    assert.ok(cspBlocked >= 1, '편집 칸에 억지로 넣은 onerror 도 보안 정책(CSP)이 막음');
    assert.ok(/코스 수정하러 가기/.test(await text(O)), '운영자에게 코스 수정 바로 가기');
    await QY.evaluate(() => LZ.go('qnaNew', { cat: 'pay' }, { skipGuard: true })); await waitScr(QY, 'qnaNew');
    await QY.fill('#qtl', '입금 확인 부탁해요'); await QY.click('.red'); await QY.keyboard.type('어제 보냈어요'); await QY.click('#send'); await waitScr(QY, 'qnaView');
    const pq = await QY.evaluate(() => LZ.stack[LZ.stack.length - 1].p.id);
    await O.evaluate(id => LZ.go('qnaView', { id }, { skipGuard: true }), pq); await waitScr(O, 'qnaView');
    assert.ok(/관리자만 답변할 수 있어요/.test(await text(O)) && !(await O.$('.red')));
    await A.evaluate(id => LZ.go('qnaView', { id }, { skipGuard: true }), pq); await waitScr(A, 'qnaView');
    assert.ok(await A.$('.red'), '관리자는 답변 칸'); assert.ok(/입금 확인 대기 중인 결제가 없어요|입금 확인 대기/.test(await text(A)));
  });
  await t('Q5 시험 회원이 아닌 회원은 문의하기가 안 보임 → "모두에게"로 바꾸면 보임', async () => {
    await T.evaluate(() => LZ.go('settings', {}, { reset: true, skipGuard: true })); await waitScr(T, 'settings'); assert.ok(!(await T.$('#qna')));
    assert.ok(srv.env.call({ a: 'setCfg', qna_mode: 'on' }, admTok()).ok);
    await T.reload(); await waitScr(T, 'courses'); await T.click('[data-tab="settings"]'); await waitScr(T, 'settings'); assert.ok(await T.$('#qna'));
  });
  await t('H9 공지: 관리자가 모든 지점 팝업 공지(굵게) → 회원이 앱을 열면 팝업 한 번 → 다시 열면 안 뜸, 공지 목록', async () => {
    await A.evaluate(() => LZ.go('notices', { manage: 1 }, { reset: true, skipGuard: true })); await waitScr(A, 'notices');
    await A.click('#new'); await waitScr(A, 'noticeEdit');
    await A.fill('#nt', '센서 점검 안내'); await A.click('.red'); await A.keyboard.type('토요일 오전 점검');
    await A.keyboard.press('Control+A'); await A.click('.rtb [data-x="b"]'); await A.check('#nq'); await A.check('#np');
    await A.click('#save'); await waitScr(A, 'notices'); assert.ok(/센서 점검 안내/.test(await text(A)) && /모든 지점/.test(await text(A)));
    await T.reload(); await T.waitForSelector('.dlg'); assert.ok(/센서 점검 안내/.test(await text(T, '.dlg')) && /<b>/.test(await T.$eval('.dlg .rich', e => e.innerHTML)));
    await shot(T, 'h9-popup'); await dlg(T, '확인');
    await T.reload(); await waitScr(T, 'courses'); await sleep(500); assert.ok(!(await T.$('.dlg')), '두 번째에는 팝업 없음');
    await T.click('[data-tab="settings"]'); await waitScr(T, 'settings'); await T.click('#nts'); await waitScr(T, 'notices');
    assert.ok(/📌/.test(await text(T)) && /센서 점검 안내/.test(await text(T)));
    const op = env.call({ a: 'login', nick: '운영자', pin: OP_PIN }).token;
    assert.strictEqual(env.call({ a: 'noticeSave', br: 'mansong', title: '남의 지점', html: 'x' }, op).err, 'perm', '운영자는 다른 지점 공지 불가');
  });
  /* ───────── v3.1: 직접 가입 · 친구 초대 · 공지 그림/단추 · 포스터 ───────── */
  let JN = null;
  await t('J1 로그인 화면 "5일 무료 체험 시작하기" → 닉네임 중복 확인 → 기본 매장(만송) → 비밀번호 두 번 → 동의 → 가입 → 사용 방법 4장 → 코스(만송점, 체험 D-4)', async () => {
    JN = await phone('새싹이');
    await JN.goto('http://localhost:8801/'); await waitScr(JN, 'login');
    assert.ok(/처음이세요/.test(await text(JN, '.joinbox'))); await shot(JN, 'j1-login');
    await JN.click('#join'); await waitScr(JN, 'join');
    await JN.fill('#jn', '다람쥐'); await JN.waitForFunction(() => /이미 쓰고/.test(document.querySelector('#jnE').textContent));
    await JN.fill('#jn', '새싹이'); await JN.waitForFunction(() => /쓸 수 있는 닉네임/.test(document.querySelector('#jnE').textContent));
    await JN.selectOption('#jb', 'mansong');
    await pad(JN, '1111'); assert.ok(/쉬운 번호/.test(await text(JN, '#jpE')));
    await pad(JN, '2580'); await sleep(60); await pad(JN, '2580'); assert.ok(/정했어요/.test(await text(JN, '#jpl')));
    await JN.click('#go'); assert.ok(/체크해/.test(await text(JN, '#err')), '동의 안 하면 막음');
    await JN.check('#jag'); await shot(JN, 'j1-join'); await JN.click('#go');
    await waitScr(JN, 'guide'); assert.ok(/새싹이/.test(await text(JN)) && /기준을 하나/.test(await text(JN)));
    await shot(JN, 'j1-guide');
    for (let i = 0; i < 3; i++) await JN.click('#gn');
    await JN.click('#gn'); await waitScr(JN, 'courses');
    assert.ok(/양주만송점/.test(await text(JN, '.store')) && /체험회원 · D-4/.test(await text(JN, '.who span')), await text(JN, '.who'));
    const m = env.call({ a: 'members' }, admTok()).members.find(x => x.nick === '새싹이'); assert.deepStrictEqual([m.src, m.kind, m.home], ['self', 'trial', 'mansong']);
  });
  await t('J2 같은 휴대폰으로 또 체험 가입 → "이미 체험 가입을 했어요" → 그 닉네임으로 로그인 안내', async () => {
    await JN.evaluate(() => { localStorage.removeItem('lz@app.t'); }); await JN.goto('http://localhost:8801/?join=1'); await waitScr(JN, 'join');
    await JN.fill('#jn', '새싹둘'); await pad(JN, '2580'); await sleep(60); await pad(JN, '2580'); await JN.check('#jag'); await JN.click('#go');
    await JN.waitForSelector('.dlg'); assert.ok(/새싹이/.test(await text(JN, '.dlg'))); await dlg(JN, '(으)로 로그인'); await waitScr(JN, 'login');
    assert.ok(/새싹이/.test(await text(JN)));
  });
  await t('J3 친구에게 알리기: 내 초대 링크(?join=1&r=) → 친구 폰에서 열면 바로 가입 화면 🎁 → 가입 → 친구가 월간 결제(승인) → 내 기간 +7일, 초대 목록 "+7일 받음"', async () => {
    const I = await phone('초대자'); await I.goto('http://localhost:8801/?u=' + encodeURIComponent('너구리')); await waitScr(I, 'login'); await pad(I, '6482'); await I.click('#go'); await waitScr(I, 'courses'); await dismiss(I);
    await I.evaluate(() => LZ.go('settings', {}, { reset: true, skipGuard: true })); await waitScr(I, 'settings'); await I.click('#invt'); await waitScr(I, 'invite');
    const link = await text(I, '#lk'); assert.ok(/\?s=yangju&join=1&r=u\d+/.test(link), link); await shot(I, 'j3-invite');
    const F = await phone('초대친구'); await F.goto(link.replace(/^https?:\/\/[^/]+\//, 'http://localhost:8801/')); await waitScr(F, 'join');
    assert.ok(/친구 초대 링크/.test(await text(F)));
    await F.fill('#jn', '초대친구'); await F.waitForFunction(() => /쓸 수 있는/.test(document.querySelector('#jnE').textContent)); await pad(F, '3691'); await sleep(60); await pad(F, '3691'); await F.check('#jag'); await F.click('#go'); await waitScr(F, 'guide');
    const ft = env.call({ a: 'login', nick: '초대친구', pin: '3691' }).token, before = env.call({ a: 'me' }, env.call({ a: 'login', nick: '너구리', pin: '6482' }).token).user.end;
    const pr = env.call({ a: 'payReq', plan: 'month', method: 'kakao' }, ft); assert.ok(pr.ok, JSON.stringify(pr));
    const dc = env.call({ a: 'payDecide', id: pr.pending.id, ok: 1 }, admTok()); assert.ok(dc.reward && dc.reward.days === 7, JSON.stringify(dc));
    const after = env.call({ a: 'me' }, env.call({ a: 'login', nick: '너구리', pin: '6482' }).token).user.end; assert.strictEqual(Date.parse(after) - Date.parse(before), 7 * DAY);
    await I.evaluate(() => LZ.go('invite', {}, { replace: true, skipGuard: true })); await waitScr(I, 'invite');
    assert.ok(/초대친구/.test(await text(I)) && /\+7일 받음/.test(await text(I)), await text(I)); await I.close(); await F.close();
  });
  await t('J4 공지에 사진·단추: 관리자가 사진 올리고 단추 2개(앱: 친구에게 알리기, https 주소)와 본문 주소 → 회원 공지에 사진·눌리는 주소·단추 → 단추로 친구 초대 화면', async () => {
    await A.evaluate(() => LZ.go('notices', { manage: 1 }, { reset: true, skipGuard: true })); await waitScr(A, 'notices'); await A.click('#new'); await waitScr(A, 'noticeEdit');
    await A.fill('#nt', '사진 공지'); await A.click('.red'); await A.keyboard.type('자세한 안내 https://example.com/park 를 보세요');
    await A.setInputFiles('#pf', __dirname + '/../assets/promo-invite.jpg'); await A.waitForSelector('#pic img[src^="data:image"]');
    await A.selectOption('[data-bt="0"]', 'invite'); assert.strictEqual(await A.inputValue('[data-bl="0"]'), '친구에게 알리기', '단추 글자 자동');
    await A.selectOption('[data-bt="1"]', 'url'); await A.fill('[data-bl="1"]', '안내 보기'); await A.fill('[data-bu="1"]', 'javascript:alert(1)'); await A.click('#save');
    assert.ok(/https:\/\//.test(await text(A, '#err')), '위험한 주소 막음');
    await A.fill('[data-bu="1"]', 'https://example.com/guide'); await shot(A, 'j4-edit'); await A.click('#save'); await waitScr(A, 'notices');
    const W = await phone('공지보기'); await W.goto('http://localhost:8801/?u=' + encodeURIComponent('다람쥐')); await waitScr(W, 'login'); await pad(W, '7391'); await W.click('#go'); await waitScr(W, 'courses'); await dismiss(W);
    await W.evaluate(() => LZ.go('notices', {})); await waitScr(W, 'notices'); await W.click('.nt-item:has-text("사진 공지") .nh');
    await W.waitForSelector('.nt-item .ntpic[src^="data:image"]');
    assert.strictEqual(await W.getAttribute('.nt-item .rich a', 'href'), 'https://example.com/park');
    assert.ok(await W.$('[data-nto="https://example.com/guide"]')); await shot(W, 'j4-notice');
    await W.click('[data-nto="invite"]'); await waitScr(W, 'invite'); await W.close();
  });
  await t('J5 홍보 공지(처음부터 있음): 앱을 열면 그림과 함께 팝업 → "친구에게 알리기" 단추로 바로 초대 화면, "가입 화면 보기"는 미리 보기', async () => {
    env.ss.getSheetByName('공지').getRange(2, 8).setValue(1);
    const W = await phone('홍보'); await W.goto('http://localhost:8801/?u=' + encodeURIComponent('운영자')); await waitScr(W, 'login'); await W.click('#plen'); await pad(W, OP_PIN); await W.click('#go');
    assert.ok(await dismiss(W, '친구에게 알리고'), '홍보 팝업'); await W.waitForSelector('.dlg .ntpic'); assert.ok(/친구에게 알리고 7일/.test(await text(W, '.dlg')) && /promo-invite\.jpg/.test(await W.getAttribute('.dlg .ntpic', 'src')));
    await shot(W, 'j5-promo'); await dlg(W, '친구에게 알리기'); await waitScr(W, 'invite');
    await W.click('#pv'); await waitScr(W, 'join'); assert.ok(/미리 보기/.test(await text(W)) && await W.$eval('#go', b => b.disabled)); await W.close();
  });
  await t('J6 가입 QR 포스터: 매장 고르기 → A4 그림(QR 안 주소는 ?s=지점&join=1) → 그림 저장 단추, 회원 관리에 "직접 가입"·"NEW" 표시, 운영자는 체험 이용 중지 가능', async () => {
    await A.evaluate(() => LZ.go('settings', {}, { reset: true, skipGuard: true })); await waitScr(A, 'settings'); await A.click('#pst'); await waitScr(A, 'poster');
    await A.waitForSelector('#pimg'); await A.selectOption('#pb', 'mansong'); await A.waitForFunction(() => /양주만송점/.test(document.querySelector('#pimg').alt));
    assert.ok(/^data:image\/png/.test(await A.getAttribute('#dl', 'href')));
    const sz = await A.$eval('#pimg', i => [i.naturalWidth, i.naturalHeight]); assert.deepStrictEqual(sz, [1240, 1754]); await shot(A, 'j6-poster');
    await A.evaluate(() => LZ.go('members', {}, { reset: true, skipGuard: true })); await waitScr(A, 'members');
    assert.ok(/직접 가입/.test(await text(A, '.mem:has-text("초대친구")')) && /NEW/.test(await text(A, '.mem:has-text("초대친구")')));
    const op = env.call({ a: 'login', nick: '운영자', pin: OP_PIN }).token, f = env.call({ a: 'members' }, admTok()).members.find(m => m.nick === '초대친구');
    assert.strictEqual(env.call({ a: 'mUpdate', uid: f.uid, op: 'active', on: 0 }, op).err, 'perm', '월간이 된 회원은 운영자가 못 멈춤');
    const tr = env.call({ a: 'members' }, admTok()).members.find(m => m.nick === '새싹이');
    const opM = env.call({ a: 'mCreate', nick: '만송운영', kind: 'op', home: 'mansong' }, admTok()); const ot = env.call({ a: 'login', nick: '만송운영', pin: opM.pin }).token; env.call({ a: 'pin', pin: '864213' }, ot);
    assert.ok(env.call({ a: 'mUpdate', uid: tr.uid, op: 'active', on: 0 }, ot).ok, '소속 지점 체험회원 이용 중지');
  });
  await t('J7 카카오톡 미리보기 카드: og 제목·설명·그림(1200×630) 태그와 그림 파일', async () => {
    const html = await (await fetch('http://localhost:8801/index.html')).text();
    assert.ok(/og:title" content="파크골프 공략노트/.test(html) && /og:image" content="assets\/og-card\.jpg/.test(html));
    const r = await fetch('http://localhost:8801/assets/og-card.jpg'); assert.strictEqual(r.status, 200);
  });
  await t('H3 없는 지점 코드로 보내면 서버가 거절', async () => {
    const r = await A.evaluate(async () => { const res = await fetch(LZ.API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ a: 'me', t: LZ.S.token, br: 'uijeongbu' }) }); return res.json(); });
    assert.strictEqual(r.err, 'branch');
  });
  await t('H4 사전요청(OPTIONS) 없음, 화면 오류 없음', async () => {
    assert.strictEqual(srv.log.options, 0);
    assert.deepStrictEqual(errors, [], errors.join(' // '));
  });

  console.log(`\n결과: ${ok} 통과 / ${bad} 실패`);
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
