const { chromium } = require('playwright'); const { start } = require('./e2e-server'); const assert = require('assert');
const SH = __dirname + '/shots/'; require('fs').mkdirSync(SH, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join(' | ')); if (process.env.TRACE) console.log(e.stack); } }
const AND = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SAMSUNG = AND.replace('Chrome/120.0.0.0', 'SamsungBrowser/23.0 Chrome/115.0.0.0');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const KAKAO = AND + ' KAKAOTALK 10.4.5';
const WAKE = () => { window.__wl = { req: 0, rel: 0, active: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.req++; __wl.active++; const l = new EventTarget(); let on = true; l.release = async () => { if (!on) return; on = false; __wl.rel++; __wl.active--; l.dispatchEvent(new Event('release')); }; return l; } } }); };

(async () => {
  const srv = await start(), browser = await chromium.launch(), errors = [];
  async function phone(ua = AND, extra = {}) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', userAgent: ua, hasTouch: true, acceptDownloads: true }, extra));
    await ctx.addInitScript(WAKE);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(ua.slice(20, 30) + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|the server responded/.test(m.text())) errors.push('console: ' + m.text()); });
    return { ctx, p };
  }
  const scr = p => p.evaluate(() => window.LZ.stack.length ? window.LZ.stack[window.LZ.stack.length - 1].name : '');
  const waitScr = (p, n, ms = 8000) => p.waitForFunction(n => window.LZ.stack.length && window.LZ.stack[window.LZ.stack.length - 1].name === n && !document.querySelector('.sk, .layer .spin'), n, { timeout: ms });
  const pad = async (p, d) => { for (const c of d) await p.click(`#app .pad button[data-k="${c}"]`); };
  const text = (p, s = '#app') => p.locator(s).first().innerText();
  const dlg = async (p, label) => { await p.waitForSelector('.dlg .btn'); await p.click(`.dlg .btn:has-text("${label}")`); await sleep(80); };
  async function login(p, nick, pin) {
    await waitScr(p, 'login');
    const inp = await p.$('#nick'); if (inp) await p.fill('#nick', nick);
    await pad(p, pin); await p.click('#go');
  }
  async function setPin(p, pin) { await waitScr(p, 'pin'); await pad(p, pin); await sleep(60); await pad(p, pin); }
  const skipInstall = async p => { await waitScr(p, 'install'); await p.click('#done'); await waitScr(p, 'courses'); };
  const sheetRows = name => { const sh = srv.env.ss.getSheetByName(name); const out = []; for (let r = 2; r <= sh.getLastRow(); r++) { const row = []; for (let c = 1; c <= 12; c++) row.push(sh.getRange(r, c).getValue()); out.push(row); } return out; };
  const waitSheet = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(120); } return false; };

  console.log('\n[실제 브라우저(Chromium, 휴대폰 크기) 종단 시험 — 처음부터 끝까지]');
  const op = await phone(); const P = op.p;
  let invite = '', pinMember = '', pinTerm = '', pinMember2 = '';

  /* ───────── A. 운영자: 첫 로그인 → 비밀번호 정하기 → 회원 만들기 ───────── */
  await t('A1 처음 열면 로그인 화면(닉네임 입력칸), 안내 숫자 없음, 글꼴 Noto Sans KR 적용', async () => {
    await P.goto('http://localhost:8801/'); await waitScr(P, 'login');
    assert.ok(await P.$('#nick')); const x = await text(P); assert.ok(!/\b\d{4}\b/.test(x.replace(/4자리/g, '')), '화면에 4자리 숫자가 보임'); assert.ok(/운영자에게 말씀해 주세요/.test(x));
    assert.strictEqual(await P.evaluate(() => getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '')), 'Noto Sans KR');
    assert.ok(await P.evaluate(async () => { await document.fonts.ready; return document.fonts.check('400 16px "Noto Sans KR"') && [...document.fonts].some(f => f.family.includes('Noto Sans KR') && f.status === 'loaded'); }));
    await P.screenshot({ path: SH + 'a1-login.png' });
  });
  await t('A2 틀린 비밀번호는 남은 횟수 안내(없는 닉네임과 같은 문구)', async () => {
    await P.fill('#nick', '운영자'); await pad(P, srv.pin === '9999' ? '9998' : '9999'); await P.click('#go'); await P.waitForFunction(() => /맞지 않아요/.test(document.querySelector('#err').textContent));
    assert.ok(/4번 더 틀리면/.test(await text(P, '#err'))); assert.strictEqual(await P.evaluate(() => document.querySelectorAll('.dots i.f').length), 0, '틀리면 입력 칸이 비워짐');
  });
  await t('A3 처음 비밀번호로 로그인하면 "처음 오셨네요" 비밀번호 정하기가 강제됨(쉬운 번호 거절, 두 번 입력)', async () => {
    await pad(P, srv.pin); await P.click('#go'); await waitScr(P, 'pin'); assert.ok(/처음 오셨네요/.test(await text(P)));
    assert.ok(!(await P.$('[data-back]')), '처음에는 뒤로 갈 수 없음');
    await pad(P, '1234'); await P.waitForFunction(() => /너무 쉬운 번호/.test(document.querySelector('#err').textContent));
    await pad(P, '8259'); await P.waitForFunction(() => /한 번 더/.test(document.querySelector('#pinS').textContent));
    await pad(P, '1111'); await P.waitForFunction(() => /숫자가 달라요/.test(document.querySelector('#pinS').textContent));
    await pad(P, '8259'); await sleep(50); await pad(P, '8259'); await waitScr(P, 'install');
  });
  await t('A4 안드로이드(크롬): 홈 화면 추가 방법 안내가 나오고 건너뛸 수 있음', async () => {
    const x = await text(P); assert.ok(/⋮ 메뉴/.test(x) && /홈 화면에 추가/.test(x)); await P.screenshot({ path: SH + 'a4-install.png' }); await P.click('#done'); await waitScr(P, 'courses');
  });
  await t('A5 빈 코스 목록: 안내 문구, 운영자는 아래 메뉴에 "회원" 탭이 보임', async () => {
    const x = await text(P); assert.ok(/아직 등록된 코스가 없어요/.test(x)); assert.ok(await P.$('.tabs [data-tab="members"]')); assert.ok(/운영자 · 운영자/.test(await text(P, '.who')));
  });
  await t('A6 회원 만들기: 닉네임 검사, 고정회원 계정 → 처음 비밀번호와 안내문(개인 링크 포함)', async () => {
    await P.click('.tabs [data-tab="members"]'); await waitScr(P, 'members');
    await P.fill('#nn', '가'); await P.click('#mk'); assert.ok(/2~8자/.test(await text(P, '#nnE')));
    await P.fill('#nn', '슈퍼맨'); await P.click('#mk'); await P.waitForSelector('#inv');
    const inv = await text(P, '#inv'); assert.ok(/닉네임: 슈퍼맨/.test(inv) && /\?u=%EC%8A%88/.test(inv) && /다른 브라우저로 열기/.test(inv));
    pinMember = inv.match(/처음 비밀번호: (\d{4})/)[1]; invite = inv.match(/(http\S+)/)[1]; assert.ok(/localhost:8801\/\?u=/.test(invite), invite);
    await P.screenshot({ path: SH + 'a6-members.png' });
  });
  await t('A7 기간회원(30일)·같은 닉네임 중복 거절', async () => {
    await P.fill('#nn', '호랑이'); await P.click('#kind [data-k="term"]'); await P.waitForSelector('#days'); assert.ok(await P.$('#nn')); await P.click('#days [data-d="30"]');
    assert.strictEqual(await P.inputValue('#nn'), '호랑이', '종류를 바꿔도 입력한 닉네임이 유지'); await P.click('#mk'); await P.waitForFunction(() => /호랑이님 계정을 만들었어요/.test(document.querySelector('#inv') ? document.body.innerText : ''));
    pinTerm = (await text(P, '#inv')).match(/처음 비밀번호: (\d{4})/)[1];
    await P.fill('#nn', '슈퍼맨'); await P.click('#mk'); await P.waitForFunction(() => /이미 있는 닉네임/.test(document.querySelector('#nnE').textContent));
    assert.ok(/D-30/.test(await text(P, '#ml')));
  });
  await t('A8 안내문을 쓴 채로 다른 화면으로 가려 하면 확인창(나가기/계속 작성)', async () => {
    await P.fill('#nn', '임시닉'); await P.click('.tabs [data-tab="settings"]'); await P.waitForSelector('.dlg'); assert.ok(/작성 중인 내용이 있어요/.test(await text(P, '.dlg')));
    await dlg(P, '계속 작성하기'); assert.strictEqual(await scr(P), 'members'); await P.fill('#nn', '');
  });
  await t('A9 로그아웃: 확인창 → 로그인 화면, 닉네임은 기억(큰 글씨 "운영자님")', async () => {
    await P.click('.tabs [data-tab="settings"]'); await waitScr(P, 'settings'); await P.click('#out'); await dlg(P, '로그아웃'); await waitScr(P, 'login');
    assert.ok(/로그아웃했어요/.test(await text(P))); assert.ok(!(await P.$('#nick'))); assert.ok(/운영자님/.test(await text(P))); assert.strictEqual(await P.evaluate(() => localStorage.getItem('lz.t')), null);
    await P.click('#other'); assert.ok(await P.$('#nick')); await P.reload(); await waitScr(P, 'login'); assert.ok(/운영자님/.test(await text(P)), '새로고침해도 마지막 닉네임 기억');
  });

  /* ───────── B. 고정회원 폰: 개인 링크로 들어와 코스 등록·기록 ───────── */
  const me = await phone(AND); const M = me.p;
  await t('B1 개인 링크(?u=닉네임)로 열면 닉네임이 미리 들어가 있고 비밀번호만 누르면 됨', async () => {
    await M.goto(invite); await waitScr(M, 'login'); assert.ok(/슈퍼맨님/.test(await text(M))); assert.ok(!(await M.$('#nick')));
    await pad(M, '2468'); await M.click('#go'); await M.waitForFunction(() => /맞지 않아요/.test(document.querySelector('#err').textContent));
    await pad(M, pinMember); await M.click('#go'); await setPin(M, '7391'); await skipInstall(M);
    assert.ok(/슈퍼맨 · 고정회원/.test(await text(M, '.who'))); assert.ok(!(await M.$('.tabs [data-tab="members"]')), '일반 회원에겐 회원 탭 없음');
  });
  await t('B2 코스 등록: 이름의 띄어쓰기는 자동으로 지워짐, 빠진 홀 안내, 거리 한 자리 검사', async () => {
    await M.click('#fab'); await waitScr(M, 'reg');
    await M.fill('#rn', '목행 충주 파크골프 CD'); assert.strictEqual(await M.inputValue('#rn'), '목행충주파크골프CD');
    await M.click('#save'); assert.ok(/코스 이름|파와 거리/.test(await text(M, '#err'))); assert.ok(/1홀, 2홀, 3홀, 4홀, 5홀, 6홀 외 12홀/.test(await text(M, '#err')));
    await M.fill('#hl [data-m] >> nth=0', '52.55'); assert.ok(/소수점 첫째 자리/.test(await text(M, '#err'))); await M.fill('#hl [data-m] >> nth=0', '');
  });
  await t('B3 18홀 파·거리를 입력하고(1홀·10홀은 내 기록도 함께) 등록하면 그 코스의 9홀 표가 열림', async () => {
    const fill = async (half) => { for (let k = 0; k < 9; k++) { const i = half * 9 + k, par = [3, 4, 5][i % 3]; await M.click(`#hl .hole >> nth=${k} >> [data-p="${par}"]`); await M.fill(`#hl .hole >> nth=${k} >> [data-m]`, String(40 + i * 3 + (i % 2 ? 0.5 : 0))); } };
    await fill(0);
    await M.evaluate(() => { const c = document.querySelector('#hl .hole [data-on]'); c.click(); });
    await M.click('#hl .hole >> nth=0 >> [data-ref="c"]'); await M.click('#hl .hole >> nth=0 >> [data-s="1"]'); await M.click('#hl .hole >> nth=0 >> [data-s="1"]'); await M.click('#hl .hole >> nth=0 >> [data-d="L"]');
    assert.ok(/홀컵에서 왼쪽 2칸/.test(await text(M, '#hl .hole >> nth=0 >> .sbox')));
    await M.click('#half [data-h="1"]'); assert.deepStrictEqual(await M.locator('#hl .hh b').allInnerTexts(), ['1홀 (10홀)', '2홀 (11홀)', '3홀 (12홀)', '4홀 (13홀)', '5홀 (14홀)', '6홀 (15홀)', '7홀 (16홀)', '8홀 (17홀)', '9홀 (18홀)']);
    await fill(1); assert.ok(/파·거리 입력 18\/18홀 · 내 기록 입력 1홀/.test(await text(M, '#sum'))); await M.screenshot({ path: SH + 'b3-reg.png' });
    await M.click('#save'); await waitScr(M, 'holes'); assert.ok(/목행충주파크골프CD/.test(await text(M, '.hd2'))); assert.ok(/등록했어요/.test(await text(M, '#toast')));
    assert.ok(/홀컵에서 왼쪽 2칸/.test(await text(M, '#ht .rw.me >> nth=0'))); assert.deepStrictEqual(await M.locator('#ht .hh b').allInnerTexts().then(a => a.slice(0, 3)), ['1홀', '2홀', '3홀']);
  });
  await t('B4 전반/후반 탭: 후반은 "1홀 (10홀) ~ 9홀 (18홀)" 표기, 처음 등록한 분은 "파·거리 고치기" 가능', async () => {
    assert.ok(await P.evaluate(() => true) && await M.$('#info')); await M.click('#half [data-h="1"]'); assert.strictEqual((await M.locator('#ht .hh b').allInnerTexts())[8], '9홀 (18홀)'); assert.ok(/1홀\(10홀\) ~ 9홀\(18홀\)/.test(await text(M)));
    assert.ok(/이 코스에는 공개된 다른 회원 기록이 아직 없어요/.test(await text(M))); await M.click('#half [data-h="0"]'); await M.screenshot({ path: SH + 'b4-holes.png' });
  });
  await t('B5 같은 이름(대소문자 달라도) 다시 등록하려 하면 막고 "이 코스 열기"', async () => {
    await M.click('[data-back]'); await waitScr(M, 'courses'); assert.ok(/목행충주파크골프CD/.test(await text(M)) && /내 기록 1\/18홀/.test(await text(M)));
    await M.click('#fab'); await waitScr(M, 'reg'); await M.fill('#rn', '목행충주파크골프cd'); assert.ok(/이미 등록된 코스예요/.test(await text(M, '#dup'))); await M.click('#save'); assert.ok(/이미 등록된 코스예요/.test(await text(M, '#err')));
    assert.ok(await M.locator('#dup [data-open]').count()); await M.fill('#rn', '목행충주'); assert.ok(/비슷한 코스가 있어요/.test(await text(M, '#dup')));
  });
  await t('B6 작성 중에 나가면 "임시 저장/지우고 나가기/계속 작성" → 임시 저장하면 다음에 이어서 쓸 수 있음', async () => {
    await M.fill('#rn', '임시저장코스'); await M.click('#hl .hole >> nth=0 >> [data-p="4"]'); await M.click('[data-back]'); await M.waitForSelector('.dlg');
    const x = await text(M, '.dlg'); assert.ok(/작성 중인 내용이 있어요/.test(x) && /임시 저장하고 나가기/.test(x) && /지우고 나가기/.test(x) && /계속 작성하기/.test(x));
    await dlg(M, '계속 작성하기'); assert.strictEqual(await scr(M), 'reg'); await M.click('[data-back]'); await dlg(M, '임시 저장하고 나가기'); await waitScr(M, 'courses');
    await M.click('#fab'); await M.waitForSelector('.dlg'); assert.ok(/작성하던 코스가 있어요/.test(await text(M, '.dlg'))); await dlg(M, '이어서 쓰기'); await waitScr(M, 'reg');
    assert.strictEqual(await M.inputValue('#rn'), '임시저장코스'); assert.ok(await M.locator('#hl .hole >> nth=0 >> [data-p="4"].on').count());
    await M.click('[data-back]'); await dlg(M, '지우고 나가기'); await waitScr(M, 'courses'); await M.click('#fab'); await waitScr(M, 'reg'); assert.strictEqual(await M.inputValue('#rn'), '', '지웠으면 새로 시작');
    await M.click('[data-back]'); await waitScr(M, 'courses');
  });

  /* ───────── C. 홀 기록: 자동 저장, 나갈 때 확인, 화면 꺼짐 방지 ───────── */
  await t('C1 홀 기록: 기준·방향·칸 → 문장, 0이면 "그대로", 길게 누르면 빠르게 올라감', async () => {
    await M.click('#clist .card >> nth=0'); await waitScr(M, 'holes'); await M.click('#ht .rw.me >> nth=1'); await waitScr(M, 'edit');
    assert.ok(/기준을 하나 골라/.test(await text(M, '.sbox')));
    await M.click('[data-d="R"]'); assert.ok(await M.locator('.refs.warn').count(), '기준을 안 고르고 누르면 안내 표시');
    await M.click('[data-ref="f"]'); await M.click('[data-s="1"]'); await M.click('[data-s="1"]'); await M.click('[data-d="R"]'); assert.strictEqual((await text(M, '.sbox')).replace(/\s+/g, ' '), '최초화면에서 오른쪽 2칸');
    await M.click('[data-s="-1"]'); await M.click('[data-s="-1"]'); assert.strictEqual((await text(M, '.sbox')).trim(), '최초화면 그대로');
    await M.click('[data-ref="u"]'); await M.fill('[data-name]', '우측 나무'); await M.click('[data-d="R"]'); assert.strictEqual((await text(M, '.sbox')).replace(/\s+/g, ' '), '우측 나무에서 오른쪽 1칸');
    await M.hover('[data-s="1"]'); await M.mouse.down(); await sleep(1200); await M.mouse.up(); assert.ok(+(await text(M, '.stepper output')) >= 5, '길게 누르기');
    assert.ok(/아직 정하지 않았어요/.test(await text(M, '[data-pm]')));
    await M.click('[data-ps="1"]'); assert.strictEqual((await text(M, '[data-pm]')).trim(), '17(50M) 정도'); await M.click('[data-ps="1"]'); assert.strictEqual((await text(M, '[data-pm]')).trim(), '18(55M) 정도');
    await M.click('[data-ps="-1"]'); await M.click('[data-ps="-1"]'); assert.strictEqual((await text(M, '[data-pm]')).trim(), '16(45M) 정도'); assert.ok(/타격감 16\(45M\) 정도/.test(await text(M, '.sbox')));
    await M.fill('[data-pin]', '20'); assert.strictEqual((await text(M, '[data-pm]')).trim(), '20(65M) 정도', '직접 입력');
    await M.fill('[data-pin]', '5'); assert.ok(/8부터 40까지/.test(await text(M, '[data-pm]'))); await M.fill('[data-pin]', '16'); await M.click('.sbox'); assert.strictEqual(await M.inputValue('[data-pin]'), '16'); await M.fill('[data-note]', '바람 조심'); await M.screenshot({ path: SH + 'c1-edit.png' });
  });
  await t('C2 자동 저장: 1.5초 뒤 "자동 저장됨", 시트(기록)에 홀 단위로 저장, 다른 홀 기록은 그대로', async () => {
    await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 8000 });
    assert.ok(await waitSheet(() => sheetRows('기록').some(r => /우측 나무/.test(String(r[3])))), '시트에 저장 안 됨');
    const row = sheetRows('기록').find(r => String(r[1]) === '슈퍼맨'); const recs = JSON.parse(row[3]); assert.strictEqual(recs[1].t, '우측 나무'); assert.strictEqual(recs[1].o, '바람 조심'); assert.strictEqual(recs[1].p, 16); assert.strictEqual(recs[0].r, 'c', '1홀 기록 유지'); assert.strictEqual(+row[2], 2);
  });
  await t('C3 화면 꺼짐 방지: 홀 편집 화면에서 켜지고(안내 문구), 다른 화면으로 가면 꺼짐', async () => {
    const w = await M.evaluate(() => window.__wl); assert.ok(w.req >= 1 && w.active === 1, JSON.stringify(w)); assert.ok(/화면이 꺼지지 않아요/.test(await text(M, '#wk'))); assert.strictEqual(await M.evaluate(() => LZ.wake.mode), 'lock');
    await M.click('[data-back]'); await waitScr(M, 'holes'); await sleep(100); const w2 = await M.evaluate(() => window.__wl); assert.strictEqual(w2.active, 0, JSON.stringify(w2)); assert.strictEqual(await M.evaluate(() => LZ.wake.mode), 'off');
  });
  await t('C4 다른 앱에 갔다 돌아오면(화면이 숨겨졌다 다시 보임) 화면 꺼짐 방지를 다시 켬', async () => {
    await M.click('#ht .rw.me >> nth=1'); await waitScr(M, 'edit'); await sleep(150); const before = await M.evaluate(() => window.__wl.req);
    await M.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await M.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(250);
    const w = await M.evaluate(() => window.__wl); assert.ok(w.req > before && w.active >= 1, JSON.stringify(w));
  });
  await t('C5 고친 직후(1.5초 안에) 뒤로 가면 "저장하고 나가기/저장하지 않고 나가기/계속 고치기"', async () => {
    await M.click('[data-s="1"]'); await M.click('[data-back]'); await M.waitForSelector('.dlg'); const x = await text(M, '.dlg');
    assert.ok(/저장하지 않은 내용이 있어요/.test(x) && /저장하고 나가기/.test(x) && /저장하지 않고 나가기/.test(x) && /계속 고치기/.test(x)); await M.screenshot({ path: SH + 'c5-leave.png' });
    await dlg(M, '계속 고치기'); assert.strictEqual(await scr(M), 'edit');
    await M.click('[data-back]'); await dlg(M, '저장하고 나가기'); await waitScr(M, 'holes');
    const recs = JSON.parse(sheetRows('기록').find(r => String(r[1]) === '슈퍼맨')[3]); assert.ok(recs[1].n >= 6, '저장하고 나갔으니 반영됨'); assert.ok(/에서 오른쪽/.test(await text(M, '#ht .rw.me >> nth=1')));
  });
  await t('C6 "저장하지 않고 나가기"를 고르면 그 수정은 버려지고, 표는 서버 값으로 다시 보임', async () => {
    await M.click('#ht .rw.me >> nth=2'); await waitScr(M, 'edit'); await M.click('[data-ref="c"]'); await M.click('[data-back]'); await dlg(M, '저장하지 않고 나가기'); await waitScr(M, 'holes'); await sleep(2200);
    assert.ok(/아직 기록하지 않았어요/.test(await text(M, '#ht .rw.me >> nth=2'))); assert.ok(!sheetRows('기록').some(r => String(r[1]) === '슈퍼맨' && JSON.parse(r[3])[2].r));
  });
  await t('C7 이전 홀/다음 홀로 옮길 때는 묻지 않고(저장 대기분은 계속 자동 저장)', async () => {
    await M.click('#ht .rw.me >> nth=3'); await waitScr(M, 'edit'); await M.click('[data-ref="f"]'); await M.click('[data-s="1"]'); await M.click('#next'); await sleep(200);
    assert.ok(!(await M.$('.dlg')), '묻지 않음'); assert.ok(/4홀 · 파/.test(await text(M, '.hd2')) === false && /5홀 · 파/.test(await text(M, '.hd2'))); await M.click('#prev'); await sleep(200); assert.ok(/4홀 · 파/.test(await text(M, '.hd2')));
    await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 8000 }); assert.ok(await waitSheet(() => JSON.parse(sheetRows('기록').find(r => String(r[1]) === '슈퍼맨')[3])[3].r === 'f'));
    await M.click('[data-back]'); await waitScr(M, 'holes');
  });
  await t('C8 인터넷이 끊기면 "저장 못 했어요" + 자동 재시도, 나가려 하면 확인, 다시 연결되면 저장됨', async () => {
    await M.click('#ht .rw.me >> nth=4'); await waitScr(M, 'edit'); await me.ctx.setOffline(true); await M.click('[data-ref="c"]'); await M.click('[data-s="1"]');
    await M.waitForFunction(() => /저장 못 했어요/.test(document.querySelector('#sv').textContent), null, { timeout: 12000 }); assert.ok(/인터넷을 확인해 주세요/.test(await text(M, '#sb')));
    await M.click('[data-back]'); await M.waitForSelector('.dlg'); assert.ok(/저장하지 않은 내용이 있어요/.test(await text(M, '.dlg'))); await dlg(M, '저장하고 나가기'); await M.waitForFunction(() => /저장하지 못했어요/.test(document.body.innerText) || document.querySelector('#toast.on'), null, { timeout: 15000 });
    assert.strictEqual(await scr(M), 'edit', '저장 못 했으면 나가지 않음'); assert.ok(await M.evaluate(() => !!localStorage.getItem('lz.pend')), '이 폰에 임시 보관');
    await me.ctx.setOffline(false); await M.click('#rt'); await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 10000 });
    assert.ok(await waitSheet(() => JSON.parse(sheetRows('기록').find(r => String(r[1]) === '슈퍼맨')[3])[4].r === 'c')); assert.ok(await M.evaluate(() => !localStorage.getItem('lz.pend')));
  });
  await t('C9 브라우저/휴대폰 "뒤로 가기" 버튼도 같은 확인창을 거침', async () => {
    await M.click('[data-s="1"]'); await M.goBack(); await M.waitForSelector('.dlg'); assert.ok(/저장하지 않은 내용이 있어요/.test(await text(M, '.dlg'))); await dlg(M, '계속 고치기'); assert.strictEqual(await scr(M), 'edit');
    await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 8000 }); await M.goBack(); await waitScr(M, 'holes'); await M.goBack(); await waitScr(M, 'courses');
  });
  await t('C10 로그아웃할 때 저장 안 된 내용이 있으면 먼저 저장하고, 못 하면 확인', async () => {
    await M.click('#clist .card >> nth=0'); await waitScr(M, 'holes'); await M.click('#ht .rw.me >> nth=5'); await waitScr(M, 'edit'); await M.click('[data-ref="f"]'); await M.click('[data-s="1"]');
    await M.click('.hd2 [data-back]'); await dlg(M, '저장하고 나가기'); await waitScr(M, 'holes'); await M.click('#ht .rw.me >> nth=5'); await waitScr(M, 'edit'); await me.ctx.setOffline(true); await M.click('[data-s="1"]');
    await M.evaluate(() => LZ.logout()); await dlg(M, '로그아웃'); await M.waitForSelector('.dlg .btn:has-text("다시 저장해 보기")', { timeout: 15000 }); assert.ok(/저장하지 못한 내용이 있어요/.test(await text(M, '.dlg')));
    await dlg(M, '취소'); assert.strictEqual(await scr(M), 'edit'); await me.ctx.setOffline(false); await M.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 15000 });
    await M.evaluate(() => LZ.logout()); await dlg(M, '로그아웃'); await waitScr(M, 'login');
  });

  /* ───────── D. 기간회원 폰: 다른 회원 기록 보기·가져오기, 권한, 기간 끝나면 읽기만 ───────── */
  const tm = await phone(SAMSUNG); const T = tm.p;
  await t('D1 기간회원: 삼성 인터넷은 "≡ 메뉴" 안내, 코스 등록 버튼은 흐리고 눌러도 등록 화면이 안 열림', async () => {
    await T.goto('http://localhost:8801/?u=' + encodeURIComponent('호랑이')); await login(T, '', pinTerm); await setPin(T, '6482'); await waitScr(T, 'install'); assert.ok(/≡ 메뉴/.test(await text(T))); await T.click('#done'); await waitScr(T, 'courses');
    assert.ok(/기간회원 D-30/.test(await text(T, '.who'))); assert.ok(/이용 기간이 30일 남았어요/.test(await text(T))); assert.ok(await T.locator('#fab.off').count()); await T.click('#fab'); assert.ok(/고정회원부터/.test(await text(T, '#toast'))); assert.strictEqual(await scr(T), 'courses');
  });
  await t('D2 다른 회원 기록: 목록에 "슈퍼맨님", 선택하면 그분 기록이 위 줄, 내 기록은 아래 노란 줄', async () => {
    await T.click('#clist .card >> nth=0'); await waitScr(T, 'holes'); assert.ok(/다른 회원 1명/.test('다른 회원 1명')); assert.ok(/슈퍼맨님/.test(await text(T, '#who'))); assert.ok(/우측 나무에서 오른쪽/.test(await text(T, '#ht')));
    assert.ok(/내 기록/.test(await text(T, '#ht .rw.me >> nth=0'))); assert.ok(!(await T.$('#info')), '남이 등록한 코스의 파·거리는 못 고침'); assert.ok(/파나 거리가 틀렸다면/.test(await text(T))); await T.screenshot({ path: SH + 'd2-holes.png' });
  });
  await t('D3 "슈퍼맨님 기록 가져오기"를 누르면 내 기록으로 복사되고 자동 저장, 이후 마음대로 고칠 수 있음', async () => {
    await T.click('#ht .rw.me >> nth=1'); await waitScr(T, 'edit'); assert.ok(/슈퍼맨님 기록/.test(await text(T, '#oth')));
    await T.click('#cp'); await T.waitForFunction(() => /가져왔어요/.test(document.querySelector('#toast').textContent)); assert.ok(/우측 나무에서 오른쪽/.test(await text(T, '.sbox'))); assert.ok(/타격감 16\(45M\) 정도/.test(await text(T, '.sbox')), '타격감도 함께 가져옴');
    await T.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 8000 }); assert.ok(await waitSheet(() => sheetRows('기록').some(r => String(r[1]) === '호랑이')));
    await T.click('[data-s="-1"]'); await T.waitForFunction(() => /자동 저장됨/.test(document.querySelector('#sv').textContent), null, { timeout: 8000 }); await T.click('[data-back]'); await waitScr(T, 'holes');
  });
  await t('D4 공개 끄기: 슈퍼맨 폰에서 비공개로 바꾸면 호랑이 목록에서 사라짐', async () => {
    await T.click('[data-back]'); await waitScr(T, 'courses');
    await login((await (async () => { await M.reload(); return M; })()), '', '7391'); await waitScr(M, 'courses'); await M.click('.tabs [data-tab="settings"]'); await waitScr(M, 'settings'); await M.waitForSelector('#pubs [data-c]');
    await M.evaluate(() => document.querySelector('#pubs [data-c]').click()); await M.waitForFunction(() => /나만 볼 수 있어요/.test(document.querySelector('#toast').textContent));
    await T.click('#rf'); await T.waitForFunction(() => /다른 회원 0명/.test(document.body.innerText), null, { timeout: 8000 });
    await M.evaluate(() => document.querySelector('#pubs [data-c]').click()); await M.waitForFunction(() => /공개해요/.test(document.querySelector('#toast').textContent)); await T.click('#rf'); await T.waitForFunction(() => /다른 회원 1명/.test(document.body.innerText), null, { timeout: 8000 });
  });
  await t('D5 이용 기간이 끝나면: 코스 목록에 안내, 다른 회원 기록 안 보임, 내 기록은 읽기만, 화면 꺼짐 방지 안 함', async () => {
    srv.env.state.now += 31 * 86400000; await T.reload(); await waitScr(T, 'courses'); const x = await text(T);
    assert.ok(/기간 끝남/.test(await text(T, '.who')) && /읽기만 할 수 있어요/.test(x) && !/다른 회원 \d+명/.test(x), x.slice(0, 200)); await T.click('#clist .card >> nth=0'); await waitScr(T, 'holes');
    assert.ok(!(await T.$('#who'))); assert.ok(/다른 회원 기록은 볼 수 없고/.test(await text(T))); assert.strictEqual(await T.locator('#ht .rw:not(.me)').count(), 0); assert.ok(/우측 나무에서 오른쪽/.test(await text(T, '#ht .rw.me >> nth=1')), '내 기록은 보임');
    await T.click('#ht .rw.me >> nth=1'); await waitScr(T, 'edit'); assert.ok(/기록을 고칠 수 없어요/.test(await text(T, '.ban.r'))); assert.ok(await T.locator('[data-name]').isDisabled()); await T.click('[data-s="1"]'); assert.ok(/고칠 수 없어요/.test(await text(T, '#toast')));
    assert.ok(!(await T.$('#cp'))); assert.strictEqual(await T.evaluate(() => window.__wl.req), 0, '읽기만 하는 화면은 꺼짐 방지 안 함'); assert.ok(/읽기만 가능/.test(await text(T, '#sv'))); await T.screenshot({ path: SH + 'd5-expired.png' });
  });
  await t('D6 기간이 끝난 회원의 기록은 슈퍼맨에게도 안 보임 → 운영자가 고정회원으로 바꾸면 다시 보이고 쓸 수 있음', async () => {
    await M.click('.tabs [data-tab="courses"]'); await waitScr(M, 'courses'); await M.click('#rf'); await M.waitForFunction(() => /다른 회원 0명/.test(document.body.innerText), null, { timeout: 8000 });
    await P.reload(); await login(P, '운영자', '8259'); await waitScr(P, 'courses'); await P.click('.tabs [data-tab="members"]'); await waitScr(P, 'members'); await P.click('[data-mg="1"], .mem:has-text("호랑이") [data-mg]'); await P.click('.mp [data-a="kind"][data-v="fixed"]'); await dlg(P, '바꾸기'); await P.waitForFunction(() => /바꿨어요/.test(document.querySelector('#toast').textContent));
    await M.click('#rf'); await M.waitForFunction(() => /다른 회원 1명/.test(document.body.innerText), null, { timeout: 8000 });
    await T.reload(); await waitScr(T, 'courses'); assert.ok(/호랑이 · 고정회원/.test(await text(T, '.who'))); await T.click('#clist .card >> nth=0'); await waitScr(T, 'holes'); assert.ok(await T.$('#who'));
  });

  /* ───────── E. 운영자 기능 ───────── */
  await t('E1 회원 관리: 기간 늘리기·비밀번호 다시 만들기(새 비밀번호 안내)·중지·삭제(2단계 확인)', async () => {
    await P.click('.tabs [data-tab="members"]'); await waitScr(P, 'members');
    await P.fill('#nn', '달님'); await P.click('#kind [data-k="term"]'); await P.click('#mk'); await P.waitForSelector('#inv');
    const idx = async n => P.evaluate(n => [...document.querySelectorAll('.mem')].findIndex(e => e.innerText.includes(n)), n);
    await P.click(`[data-mg="${await idx('달님')}"]`); await P.click('.mp [data-a="extend"][data-v="30"]'); await P.waitForFunction(() => /D-60/.test(document.querySelector('#ml').innerText));
    await P.click('.mp [data-a="pin"]'); await dlg(P, '다시 만들기'); await P.waitForFunction(() => /비밀번호를 다시 만들었어요/.test(document.body.innerText)); assert.ok(/처음 비밀번호: \d{4}/.test(await text(P, '#inv')));
    await P.click(`[data-mg="${await idx('달님')}"]`); await P.click('.mp [data-a="active"]'); await dlg(P, '이용 중지'); await P.waitForFunction(() => /이용 중지/.test(document.querySelector('#ml').innerText));
    await P.click('.mp [data-a="del"]'); assert.ok(/정말 삭제할게요/.test(await text(P, '.mp'))); await P.click('.mp [data-a="delno"]'); assert.ok(!/정말 삭제할게요/.test(await text(P, '#ml')));
    await P.click('.mp [data-a="del"]'); await P.click('.mp [data-a="delok"]'); await P.waitForFunction(() => !/달님/.test(document.querySelector('#ml').innerText));
    assert.ok(!(await P.$(`#ml .mem:has-text("운영자") [data-mg]`)), '내 계정에는 관리 버튼 없음');
  });
  await t('E2 매장 이름 바꾸기 → 모든 화면의 노란 띠에 반영, 로고 올리기(자동 축소) → 다른 폰 로그인 화면에도 적용, 처음 로고로 되돌리기', async () => {
    await P.click('.tabs [data-tab="settings"]'); await waitScr(P, 'settings'); await P.click('#sys'); await waitScr(P, 'system');
    await P.fill('#sn', '레저로 제이드 양주점'); await P.click('#sns'); await P.waitForFunction(() => /이름을 바꿨어요/.test(document.querySelector('#toast').textContent));
    await P.setInputFiles('input[data-slot="dark"]', '/mnt/user-data/uploads/1792381309476_image.png'); await P.waitForFunction(() => /로고를 바꿨어요/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
    const logo = await P.evaluate(() => LZ.S.logos.dark); assert.ok(/^data:image\/png;base64,/.test(logo) && logo.length < 400000, 'len ' + logo.length);
    const other = await phone(AND); await other.p.goto('http://localhost:8801/'); await waitScr(other.p, 'login'); assert.ok(/레저로 제이드 양주점/.test(await text(other.p))); assert.ok(/^data:image\/png/.test(await other.p.evaluate(() => LZ.S.logos.dark)));
    await P.click('[data-reset="dark"]'); await dlg(P, '되돌리기'); await P.waitForFunction(() => /처음 로고로 되돌렸어요/.test(document.querySelector('#toast').textContent)); assert.ok(/assets\/logo-dark\.png/.test(await P.evaluate(() => LZ.S.logos.dark)));
    await other.p.reload(); await waitScr(other.p, 'login'); assert.ok(/assets\/logo-dark\.png/.test(await other.p.evaluate(() => LZ.S.logos.dark)), '되돌림도 다른 폰에 적용'); await other.ctx.close();
    await P.fill('#sn', '제이드 양주점'); await P.click('#sns'); await sleep(300);
  });
  await t('E3 운영자는 코스 이름을 바꾸고 지울 수 있음(지우기는 2단계 확인), 남의 코스 파·거리도 고칠 수 있음', async () => {
    await P.click('.hd2 [data-back]'); await waitScr(P, 'settings'); await P.click('.tabs [data-tab="courses"]'); await waitScr(P, 'courses'); await P.click('#clist .card >> nth=0'); await waitScr(P, 'holes'); assert.ok(await P.$('#info'));
    await P.click('#info'); await waitScr(P, 'reg'); assert.ok(!(await P.locator('#rn').isDisabled())); await P.fill('#rn', '목행충주CD코스'); await P.click('#hl .hole >> nth=0 >> [data-p="5"]'); await P.fill('#hl .hole >> nth=0 >> [data-m]', '99.9'); await P.click('#save');
    await waitScr(P, 'holes'); assert.ok(/목행충주CD코스/.test(await text(P, '.hd2'))); assert.ok(/파 5/.test(await text(P, '#ht .hh >> nth=0')) && /99\.9m/.test(await text(P, '#ht .hh >> nth=0')));
    await P.click('#info'); await waitScr(P, 'reg'); await P.click('#del'); await dlg(P, '지우기'); await dlg(P, '네, 지울게요'); await waitScr(P, 'courses'); assert.ok(/아직 등록된 코스가 없어요/.test(await text(P)));
    assert.strictEqual(sheetRows('기록').length, 0, '지운 코스의 기록도 함께 삭제');
  });

  /* ───────── F. 홈 화면 추가·앱 안 브라우저·글씨 크기·오프라인 ───────── */
  await t('F1 아이폰(사파리): 공유 버튼 → 홈 화면에 추가 3단계 안내 + 사파리 안내 + 닉네임 링크 유지', async () => {
    const ph = await phone(IOS); const I = ph.p; await I.goto('http://localhost:8801/?u=' + encodeURIComponent('슈퍼맨')); await login(I, '', '7391'); await waitScr(I, 'courses');
    await I.click('.tabs [data-tab="settings"]'); await waitScr(I, 'settings'); await I.click('#inst'); await waitScr(I, 'install'); const x = await text(I);
    assert.ok(/공유 버튼/.test(x) && /홈 화면에 추가/.test(x) && /Safari/.test(x) && /다시 눌러야 할 수 있어요/.test(x)); assert.ok(await I.locator('.steps svg').count()); assert.ok(/\?u=%EC%8A%88/.test(I.url()), '주소에 닉네임이 남아 있어 홈 화면 추가 때 따라감'); await I.screenshot({ path: SH + 'f1-ios.png' }); await ph.ctx.close();
  });
  await t('F2 안드로이드: 설치 가능 신호가 오면 "홈 화면에 추가" 한 번 누름 버튼', async () => {
    const ph = await phone(AND); const A = ph.p; await A.goto('http://localhost:8801/'); await waitScr(A, 'login');
    await A.evaluate(() => { window.__pr = 0; const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__pr++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
    await A.click('#howto'); await waitScr(A, 'install'); await A.click('#addnow'); await sleep(200); assert.strictEqual(await A.evaluate(() => window.__pr), 1); assert.ok(/홈 화면에 추가했어요/.test(await text(A, '#toast'))); await ph.ctx.close();
  });
  await t('F3 카카오톡 안에서 열리면 "기본 브라우저로 열기" 안내(카카오 전용 주소), "그냥 쓸게요"로 계속 가능', async () => {
    const ph = await phone(KAKAO); const K = ph.p; await K.goto('http://localhost:8801/?u=abc'); await K.waitForSelector('.ov'); assert.ok(/카카오톡 안에서 열렸어요/.test(await text(K, '.ov')));
    assert.ok(/^kakaotalk:\/\/web\/openExternal\?url=http/.test(await K.evaluate(() => LZ.pwa.externalUrl()))); await K.screenshot({ path: SH + 'f3-kakao.png' }); await K.click('#gc'); await waitScr(K, 'login'); assert.ok(!(await K.$('.ov'))); await ph.ctx.close();
  });
  await t('F4 글씨 크기 "크게"를 고르면 화면 전체 글씨가 커지고 기억됨', async () => {
    await P.click('.tabs [data-tab="settings"]'); await waitScr(P, 'settings'); const w0 = await P.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.btn')).fontSize));
    await P.click('#fs [data-f="2"]'); const w1 = await P.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.btn')).fontSize)); assert.ok(w1 > w0 * 1.15, w0 + ' → ' + w1); await P.reload(); await waitScr(P, 'settings'); assert.strictEqual(await P.evaluate(() => document.documentElement.dataset.fs), '2'); await P.click('#fs [data-f="0"]');
  });
  await t('F5 서버가 느리거나 안 될 때: 로그인한 채로 두고 "다시 시도" 안내(로그아웃되지 않음)', async () => {
    srv.log.fail = true; await P.reload(); await P.waitForSelector('[data-retry]', { timeout: 10000 }); assert.ok(/서버 응답을 읽을 수 없어요|인터넷/.test(await text(P))); assert.ok(await P.evaluate(() => !!localStorage.getItem('lz.t')), '토큰 유지');
    srv.log.fail = false; await P.click('[data-retry]'); await waitScr(P, 'courses', 12000);
  });
  await t('F6 서비스 워커: 한 번 열어 두면 인터넷이 없어도 앱 화면이 열림(서버 연결만 안내)', async () => {
    const ph = await phone(AND); const O = ph.p; await O.goto('http://localhost:8801/'); await waitScr(O, 'login'); await O.evaluate(() => navigator.serviceWorker.ready); await sleep(800);
    await ph.ctx.setOffline(true); await O.reload(); await waitScr(O, 'login', 12000); await O.fill('#nick', '슈퍼맨'); await pad(O, '7391'); await O.click('#go'); await O.waitForFunction(() => /인터넷에 연결되어 있는지/.test(document.querySelector('#err').textContent), null, { timeout: 15000 });
    await ph.ctx.setOffline(false); await ph.ctx.close();
  });
  await t('F7 사전요청(OPTIONS) 없이 동작, 서버 호출은 text/plain POST', async () => { assert.strictEqual(srv.log.options, 0); assert.ok(srv.log.posts > 40); });
  await t('G JS 오류가 하나도 없다', async () => assert.deepStrictEqual(errors, []));

  console.log(`\n결과: ${ok} 통과 / ${bad} 실패`);
  await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
