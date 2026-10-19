/* 앱의 뼈대: 시작, 화면 이동(뒤로 가기 포함), 나갈 때 저장 확인, 로그아웃 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, S = LZ.S;
  LZ.screens = LZ.screens || {};
  LZ.stack = [];
  LZ.guard = null;           // 지금 화면의 "저장 안 한 내용" 감시자: { kind:'auto'|'form', dirty(), save(), discard(), draft?(), body }
  var navBusy = false;

  /* ───── 나갈 때 저장 확인 ───── */
  LZ.leave = async function () {
    var g = LZ.guard;
    if (!g || !g.dirty()) { LZ.guard = null; return true; }
    var c;
    if (g.kind === 'auto') {
      c = await ui.dialog({ title: '저장하지 않은 내용이 있어요', body: '방금 고친 내용이 아직 저장되지 않았어요.', cancel: 'stay',
        buttons: [{ label: '저장하고 나가기', kind: 'y', value: 'save' }, { label: '저장하지 않고 나가기', kind: 'r', value: 'drop' }, { label: '계속 고치기', kind: 'g', value: 'stay' }] });
      if (c === 'save') {
        ui.busy(true, '저장하고 있어요…'); var ok = await g.save(); ui.busy(false);
        if (!ok) { ui.toast('저장하지 못했어요. 인터넷을 확인하고 다시 해 주세요.', 4500); return false; }
      } else if (c === 'drop') { g.discard(); } else return false;
    } else {
      var btns = g.draft ? [{ label: '임시 저장하고 나가기', kind: 'y', value: 'draft' }, { label: '지우고 나가기', kind: 'r', value: 'drop' }, { label: '계속 작성하기', kind: 'g', value: 'stay' }]
        : [{ label: '나가기 (작성한 내용이 사라져요)', kind: 'r', value: 'drop' }, { label: '계속 작성하기', kind: 'y', value: 'stay' }];
      c = await ui.dialog({ title: '작성 중인 내용이 있어요', body: g.body || '지금 나가면 작성한 내용이 저장되지 않아요.', cancel: 'stay', buttons: btns });
      if (c === 'draft') g.draft(); else if (c === 'drop') { g.discard && g.discard(); } else return false;
    }
    LZ.guard = null; return true;
  };
  window.addEventListener('beforeunload', function (e) {
    if (LZ.rec.dirty() || (LZ.guard && LZ.guard.dirty())) { e.preventDefault(); e.returnValue = ''; return ''; }
  });

  /* ───── 화면 이동 ───── */
  var tokenSeq = 0;
  async function render() {
    var cur = LZ.stack[LZ.stack.length - 1], s = LZ.screens[cur.name], root = $('#app'), my = ++tokenSeq;
    var alive = function () { return my === tokenSeq; };                 // 더 새 화면이 열렸으면 false
    var boot = $('#boot'); if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
    root.hidden = false; window.scrollTo(0, 0); LZ.wake.off();
    try { await s.show(cur.p || {}, root, alive); }
    catch (e) {
      if (!alive()) return;
      if (e && e.code === 'auth') return;                                // 로그인 화면으로 이미 이동함
      root.innerHTML = '<div class="bd nt">' + ui.errorBlock(ui.errText(e)) + '</div>';
      var rb = $('[data-retry]', root); if (rb) rb.onclick = function () { render(); };
    }
    LZ.booted = true;
  }
  /* 공통 단추: 뒤로(←), 아래 메뉴 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-back]');
    if (b) { e.preventDefault(); if (LZ.stack.length > 1) history.back(); else LZ.go('courses', {}, { reset: true }); return; }
    var t = e.target.closest('[data-tab]');
    if (t) { e.preventDefault(); if (LZ.stack[LZ.stack.length - 1].name !== t.dataset.tab) LZ.go(t.dataset.tab, {}, { reset: true }); }
  });

  LZ.go = async function (name, p, o) {
    o = o || {};
    if (navBusy) return false;
    navBusy = true;
    try {
      if (o.skipGuard) LZ.guard = null; else if (!(await LZ.leave())) return false;
      if (o.reset) { LZ.stack = [{ name: name, p: p }]; history.replaceState({ i: 0 }, '', location.href); }
      else if (o.replace) { LZ.stack[LZ.stack.length - 1] = { name: name, p: p }; history.replaceState({ i: LZ.stack.length - 1 }, '', location.href); }
      else { LZ.stack.push({ name: name, p: p }); history.pushState({ i: LZ.stack.length - 1 }, '', location.href); }
    } finally { navBusy = false; }
    await render(); return true;
  };
  window.addEventListener('popstate', async function () {
    if (LZ.restoring) { LZ.restoring = false; return; }
    if (LZ.stack.length <= 1) return;                            // 맨 처음 화면에서 뒤로 가기: 앱을 나가도록 둠
    var ok = await LZ.leave();
    if (!ok) { history.pushState({ i: LZ.stack.length - 1 }, '', location.href); return; }   // 못 나가게: 방금 지나온 칸을 다시 채움
    LZ.stack.pop(); await render();
  });

  /* ───── 로그인·로그아웃 ───── */
  LZ.applyFontSize = function () { var f = u.store.get('lz.fs'); document.documentElement.dataset.fs = f === '1' || f === '2' ? f : '0'; };
  LZ.cache = {};                                                   // 코스 목록 등 임시 보관(로그아웃하면 지움)
  LZ.afterLogin = async function (user) {
    S.user = user; u.store.set('lz.nick', user.nick); LZ.cache = {};
    try { history.replaceState(history.state, '', location.pathname + '?u=' + encodeURIComponent(user.nick)); } catch (e) { /* 무시 */ }
    LZ.rec.restore(); LZ.applyFontSize();
    if (user.must) return LZ.go('pin', { first: true }, { reset: true });
    await LZ.go('courses', {}, { reset: true });
    LZ.installHint();
  };
  LZ.onAuthLost = function (msg) {
    S.token = null; S.user = null; u.store.del('lz.t'); LZ.cache = {};
    LZ.guard = null;
    LZ.go('login', { msg: msg }, { reset: true });
  };
  LZ.logout = async function () {
    var c = await ui.dialog({ title: '로그아웃 할까요?', body: '로그아웃하면 다음에 들어올 때 비밀번호를 다시 눌러야 해요.', cancel: false,
      buttons: [{ label: '로그아웃', kind: 'y', value: true }, { label: '취소', kind: 'g', value: false }] });
    if (!c) return;
    if (LZ.rec.dirty()) {
      ui.busy(true, '저장하고 있어요…'); var ok = await LZ.rec.flush(); ui.busy(false);
      if (!ok) {
        var d = await ui.dialog({ title: '저장하지 못한 내용이 있어요', body: '지금 로그아웃하면 방금 고친 내용이 사라질 수 있어요.', cancel: 'stay',
          buttons: [{ label: '다시 저장해 보기', kind: 'y', value: 'retry' }, { label: '저장하지 않고 로그아웃', kind: 'r', value: 'drop' }, { label: '취소', kind: 'g', value: 'stay' }] });
        if (d === 'retry') { ui.busy(true, '저장하고 있어요…'); var ok2 = await LZ.rec.flush(); ui.busy(false); if (!ok2) { ui.toast('아직 저장하지 못했어요. 인터넷을 확인해 주세요.', 4500); return; } }
        else if (d === 'drop') LZ.rec.discard(); else return;
      }
    }
    LZ.guard = null;
    ui.busy(true, '로그아웃 중이에요…');
    try { await LZ.api('logout', {}, { retry: 0, timeout: 8000 }); } catch (e) { /* 서버에 못 알려도 이 폰에서는 로그아웃 */ }
    ui.busy(false);
    S.token = null; S.user = null; u.store.del('lz.t'); LZ.cache = {}; LZ.rec.reset();
    await LZ.go('login', { msg: '로그아웃했어요.' }, { reset: true });
  };
  /* 홈 화면에 추가 안내(처음 한 번, 이후 일주일에 한 번까지) */
  LZ.installHint = async function () {
    if (LZ.pwa.standalone() || u.store.get('lz.hintOff') === '1' || u.store.get('lz.installed') === '1') return;
    var at = +u.store.get('lz.hintAt') || 0; if (Date.now() - at < 7 * 86400000) return;
    u.store.set('lz.hintAt', String(Date.now()));
    var c = await ui.dialog({ title: '홈 화면에 추가해 두세요', body: '휴대폰 바탕화면에 아이콘을 만들어 두면 앱처럼 바로 열 수 있어요.', cancel: 'later',
      buttons: [{ label: '방법 보기', kind: 'y', value: 'show' }, { label: '나중에', kind: 'g', value: 'later' }, { label: '다시 보지 않기', kind: 'g', value: 'off' }] });
    if (c === 'show') LZ.go('install', {});
    else if (c === 'off') u.store.set('lz.hintOff', '1');
  };

  /* ───── 시작 ───── */
  function applyCfg(d) { if (d.store) S.store = d.store; if (d.logos) { if (d.logos.dark) S.logos.dark = d.logos.dark; if (d.logos.light) S.logos.light = d.logos.light; } }
  async function boot() {
    LZ.applyFontSize();
    LZ.pwa.registerSW(function (apply) {
      ui.dialog({ title: '새 버전이 있어요', body: '앱을 새 버전으로 바꿀게요. 잠깐 화면이 다시 열려요.', cancel: false, buttons: [{ label: '지금 바꾸기', kind: 'y', value: true }, { label: '나중에', kind: 'g', value: false }] }).then(function (v) { if (v) apply(); });
    });
    if (!window.LZ_CONFIG || !window.LZ_CONFIG.API || /^YOUR_/.test(window.LZ_CONFIG.API)) {
      var b = $('#boot'); b.innerHTML = '<h2>서버 주소가 아직 없어요</h2><p>개발자에게 js/config.js 의 API 주소를 넣어 달라고 해 주세요.</p>'; return;
    }
    /* 카카오톡 같은 앱 안 브라우저: 기본 브라우저로 열도록 안내 */
    var inapp = LZ.pwa.inApp();
    if (inapp && !LZ.pwa.standalone() && u.store.get('lz.inappOk') !== '1') await LZ.screens.inappGate(inapp);

    /* 매장 이름·로고(저장해 둔 것을 먼저 쓰고, 서버에서 바뀐 것만 새로 받음) */
    var cached = u.store.getJSON('lz.cfg') || {};
    applyCfg(cached);
    try {
      var cfg = await LZ.api('cfg', { lv: cached.logoVer || 0 }, { noAuth: true, retry: 1 });
      var keep = { store: cfg.store, logoVer: cfg.logoVer, logos: cfg.logos || cached.logos };
      applyCfg(keep); u.store.setJSON('lz.cfg', keep);
      if (cfg.logos) { S.logos.dark = cfg.logos.dark || 'assets/logo-dark.png'; S.logos.light = cfg.logos.light || 'assets/logo-light.png'; }
    } catch (e) { /* 서버가 느려도 일단 계속 */ }

    var nickParam = new URLSearchParams(location.search).get('u');
    S.token = u.store.get('lz.t');
    if (S.token && nickParam && u.store.get('lz.nick') && nickParam.toLowerCase() !== u.store.get('lz.nick').toLowerCase()) {   // 다른 사람 링크로 들어옴
      LZ.api('logout', {}, { retry: 0, timeout: 5000 }).catch(function () {}); S.token = null; u.store.del('lz.t'); u.store.del('lz.pend');
    }
    if (S.token) {
      try { var me = await LZ.api('me', {}); S.store = me.store || S.store; await LZ.afterLogin(me.user); return; }
      catch (e) {
        if (e && e.code !== 'auth') { LZ.screens.fatal(e); return; }       // 인터넷 문제 등: 로그아웃시키지 않고 다시 시도 안내
        S.token = null; u.store.del('lz.t');
      }
    }
    await LZ.go('login', {}, { reset: true });
  }
  LZ.screens.fatal = function (e) {
    var b = $('#boot'); if (b) b.parentNode.removeChild(b);
    var root = $('#app'); root.hidden = false; root.innerHTML = '<div class="bd nt"><div class="err"><img src="' + u.esc(S.logos.light) + '" alt="" style="width:180px;margin:0 auto 16px;display:block">' + ui.errorBlock(ui.errText(e)).replace('class="err"', 'class=""') + '</div></div>';
    $('[data-retry]', root).onclick = function () { location.reload(); };
    LZ.booted = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
