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
    root.hidden = false; if (!render.keepScroll) window.scrollTo(0, 0);
    if (s.wake) LZ.wake.on(); else LZ.wake.off();                        // 코스 화면(표·홀 편집·비교)에서는 화면이 꺼지지 않게
    try { await s.show(cur.p || {}, root, alive); }
    catch (e) {
      if (!alive()) return;
      if (e && e.code === 'auth') return;                                // 로그인 화면으로 이미 이동함
      root.innerHTML = '<div class="bd nt">' + ui.errorBlock(ui.errText(e)) + '</div>';
      var rb = $('[data-retry]', root); if (rb) rb.onclick = function () { render(); };
    }
    LZ.booted = true;
  }
  /* 뒤에서 새 내용을 받았을 때 지금 화면을 조용히 다시 그림(입력 중이거나 고치는 중이면 다음에) */
  LZ.busyUI = function () {                                                // 입력 중·창이 떠 있음·저장 안 한 내용 → 화면을 바꾸지 않음
    var ae = document.activeElement;
    return navBusy || (LZ.guard && LZ.guard.dirty()) || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) || (ae && ae.isContentEditable) || !!document.querySelector('#layer .dlg') || !!document.querySelector('.qwait');
  };
  /* 지금 바꿀 수 없으면 조용해질 때까지 1초마다 기다렸다가(최대 30초, 같은 화면일 때만) 실행 */
  LZ.whenQuiet = function (fn, name) {
    var tries = 0, at = LZ.stack.length && LZ.stack[LZ.stack.length - 1];
    (function go() {
      var cur = LZ.stack[LZ.stack.length - 1];
      if (!cur || cur !== at || (name && cur.name !== name)) return;
      if (!LZ.busyUI()) { fn(); return; }
      if (++tries < 30) setTimeout(go, 1000);
    })();
  };
  LZ.softRefresh = function (name) { LZ.whenQuiet(redraw, name); };
  function redraw() {
    var y = window.scrollY; render.keepScroll = true;
    render().then(function () { render.keepScroll = false; window.scrollTo(0, y); }, function () { render.keepScroll = false; });
  }
  LZ.fresh = function (name) { return function () { LZ.softRefresh(name); }; };
  /* 공통 단추: 뒤로(←), 아래 메뉴 */
  document.addEventListener('click', function (e) {
    var lo = e.target.closest('[data-logout]');
    if (lo) { e.preventDefault(); if (S.user) LZ.logout(); return; }
    var th = e.target.closest('[data-thm]');
    if (th) { e.preventDefault(); LZ.theme.toggle(); return; }
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

  /* 개인 링크 뒤에 붙는 부분: ?s=매장&u=닉네임 */
  LZ.linkQuery = function (nick, br) { br = br || LZ.branch; return '?' + (br ? 's=' + encodeURIComponent(br) + '&' : '') + 'u=' + encodeURIComponent(nick); };
  /* 매장 띠(📍 매장 ▾)를 누르면 매장 고르기 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-branch]'); if (!b || !S.user) return;
    e.preventDefault(); if (LZ.stack[LZ.stack.length - 1].name !== 'branch') LZ.go('branch', {});
  });
  LZ.brName = function (code) { var l = S.branches || []; for (var i = 0; i < l.length; i++) if (l[i].code === code) return l[i].name; return code || ''; };

  /* ───── 매장 바꾸기 ─────
   * 매장마다 센서·파워가 달라서 기록은 매장마다 따로예요. 이용권·닉네임·신뢰도는 모든 매장 공통. */
  LZ.switchBranch = async function (code, o) {
    o = o || {};
    if (LZ.rec.dirty()) { ui.busy(true, '저장하고 있어요…'); var ok = await LZ.rec.flush(); ui.busy(false); if (!ok) { ui.toast('저장하지 못한 기록이 있어요. 인터넷을 확인하고 다시 해 주세요.', 4500); return false; } }
    var before = LZ.branch;
    ui.busy(true, '매장을 바꾸고 있어요…');
    try {
      LZ.setBranch(code, LZ.brName(code));
      var r = await LZ.api('useBranch', { br: code }, { retry: 1 });
      LZ.setBranch(r.br, r.store);
    } catch (e) { ui.busy(false); LZ.setBranch(before, LZ.brName(before)); ui.toast(ui.errText(e), 4500); return false; }
    ui.busy(false);
    LZ.cache = {}; LZ.guard = null; LZ.capiClear();
    try { history.replaceState(history.state, '', location.pathname + LZ.linkQuery(S.user.nick)); } catch (e) { /* 무시 */ }
    LZ.refreshMe(true).then(function () { LZ.noticePopup(); });
    if (!o.quiet) ui.toast('📍 ' + S.store + '(으)로 바꿨어요. 기록은 매장마다 따로예요.', 3500);
    await LZ.go('courses', {}, { reset: true, skipGuard: true });
    return true;
  };
  LZ.screens.branch = {
    show: function (p, root) {
      var me = S.user || {}, list = S.branches || [], admin = ui.isAdmin(), op = me.kind === 'op';
      var homeLine = op ? '운영자의 소속 매장은 관리자가 바꿔요.' : me.homeNext ? '기본 매장은 ' + u.fmtDate(me.homeNext) + '부터 다시 바꿀 수 있어요.' : '기본 매장은 30일에 한 번 바꿀 수 있어요.';
      root.innerHTML = '<div class="scr">' + ui.hdr2('매장 고르기') + '<div class="bd nt">' +
        '<div class="ban b" style="margin-top:0">매장마다 센서와 파워가 달라서 <b>기록은 매장마다 따로</b> 저장돼요. 이용권·닉네임·신뢰도는 모든 매장에서 같아요.</div>' +
        list.map(function (b) {
          var on = b.code === LZ.branch, home = b.code === me.home, closed = !b.active;
          return '<div class="card" style="' + (on ? 'border-color:var(--pri);' : '') + (closed ? 'opacity:.6;' : '') + 'display:block">' +
            '<button type="button" data-b="' + u.esc(b.code) + '" style="all:unset;display:flex;align-items:center;width:100%;cursor:pointer;min-height:48px">' +
            '<div style="flex:1"><div class="t">' + u.esc(b.name) + (home ? ' <span class="chip g">기본 매장</span>' : '') + (closed ? ' <span class="chip">닫힘</span>' : '') + '</div>' +
            '<div class="s">' + (on ? '지금 쓰는 매장' : '이 매장으로 바꾸기') + '</div></div>' + (on ? '<span class="chip r">지금</span>' : '<span style="font-size:24px;color:var(--mut2)">›</span>') + '</button>' +
            (!home && !op && !closed ? '<button type="button" class="sm" data-home="' + u.esc(b.code) + '" style="margin-top:6px"' + (me.homeNext && !admin ? ' disabled' : '') + '>기본 매장으로 정하기</button>' : '') + '</div>';
        }).join('') +
        '<p class="hint">기본 매장: <b>' + u.esc(me.homeName || LZ.brName(me.home)) + '</b> · ' + homeLine + '<br>다른 매장에서는 기본 매장의 내 기록을 흐리게 보여 드리고, 가져올 수 있어요.</p>' +
        '<p class="hint">찾는 매장이 없나요? ' + (S.me && S.me.qnaOn ? '<a href="#" id="ask" style="color:var(--rt)">매장 추가 요청</a>을 남겨 주세요.' : '운영자에게 말씀해 주세요.') + '</p></div></div>';
      u.$$('[data-b]', root).forEach(function (b) {
        b.onclick = function () { var c = b.dataset.b; if (c === LZ.branch) { history.back(); return; } LZ.switchBranch(c); };
      });
      u.$$('[data-home]', root).forEach(function (b) {
        b.onclick = async function () {
          var c = b.dataset.home, nm = LZ.brName(c);
          var ok = await ui.dialog({ title: nm + '을(를) 기본 매장으로 할까요?', body: '로그인하면 기본 매장으로 열려요. 다른 매장에서는 기본 매장의 내 기록을 참고로 볼 수 있어요.' + (admin ? '' : '\n바꾸면 30일 동안 다시 바꿀 수 없어요.'), cancel: false,
            buttons: [{ label: '기본 매장으로 정하기', kind: 'y', value: true }, { label: '취소', kind: 'g', value: false }] });
          if (!ok) return;
          ui.busy(true, '저장하고 있어요…');
          try { var r = await LZ.api('setHome', { br: c }, { retry: 0 }); ui.busy(false); S.user = Object.assign({}, S.user, r.user); LZ.cache = {}; ui.toast(nm + '을(를) 기본 매장으로 정했어요.'); LZ.go('branch', {}, { replace: true, skipGuard: true }); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
        };
      });
      var ask = $('#ask', root); if (ask) ask.onclick = function (e) { e.preventDefault(); LZ.go('qnaNew', { cat: 'branch' }); };
    }
  };

  /* ───── 공지: 안 읽은 수, 앱을 열 때 팝업(한 번) ───── */
  LZ.noticeUnread = function () {
    var hs = (S.me && S.me.notices) || [], seen = u.store.getJSON('lz.ntSeen') || {};
    return hs.filter(function (n) { return seen[n.id] !== n.upd; }).length;
  };
  LZ.noticeMarkSeen = function (list) {
    var seen = u.store.getJSON('lz.ntSeen') || {}, keep = {};
    (S.me && S.me.notices || []).concat(list || []).forEach(function (n) { if (seen[n.id] !== undefined) keep[n.id] = seen[n.id]; });
    (list || []).forEach(function (n) { keep[n.id] = n.upd; });
    u.store.setJSON('lz.ntSeen', keep);
  };
  var popBusy = false;
  LZ.noticePopup = async function () {
    if (popBusy || !S.me || !S.me.notices) return;
    var shown = u.store.getJSON('lz.ntPop') || {}, want = S.me.notices.filter(function (n) { return n.popup && shown[n.id] !== n.upd; });
    if (LZ.skipPopupOnce) { LZ.skipPopupOnce = false; want.forEach(function (n) { shown[n.id] = n.upd; }); u.store.setJSON('lz.ntPop', shown); return; }   // 방금 가입한 분은 안내부터
    if (!want.length) return;
    popBusy = true;
    try {
      var r = await LZ.api('noticeList', {}, { retry: 0 }), map = {};
      r.list.forEach(function (n) { map[n.id] = n; });
      for (var i = 0; i < want.length && i < 3; i++) {
        var n = map[want[i].id]; shown[want[i].id] = want[i].upd; u.store.setJSON('lz.ntPop', shown);
        if (!n) continue;
        LZ.noticeMarkSeen([n]);
        var bt = (n.btns || []).map(function (b, k) { return { label: b.label + (/^https:/.test(b.to) ? ' ↗' : ''), kind: k ? 'g' : 'y', value: 'to:' + b.to }; });
        var vp = ui.dialog({ title: '📢 ' + n.title, html: '<div class="ntpop">' + LZ.noticeBody(n, true) + '</div><p class="hint" style="margin-bottom:0">' + u.esc(n.store) + ' · ' + u.fmtDate(n.upd) + '</p>', cancel: 'ok',
          buttons: bt.concat([{ label: '확인', kind: bt.length ? 'g' : 'y', value: 'ok' }, { label: '공지 모두 보기', kind: 'g', value: 'all' }]) });
        LZ.fillImgs($('#layer'));
        var v = await vp;
        if (v === 'all') { LZ.go('notices', {}); break; }
        if (v && String(v).indexOf('to:') === 0) { LZ.goTo(String(v).slice(3)); break; }
      }
    } catch (e) { /* 다음에 다시 */ }
    popBusy = false;
  };

  /* ───── 로그인·로그아웃 ───── */
  LZ.applyFontSize = function () { var f = u.store.get('lz.fs'); document.documentElement.dataset.fs = f === '1' || f === '2' ? f : '0'; };
  LZ.cache = {};                                                   // 코스 목록 등 임시 보관(로그아웃하면 지움)
  LZ.setMe = function (me) {
    if (me.user) S.user = Object.assign({}, S.user, me.user);
    if (me.branches) S.branches = me.branches;
    S.me = { pay: me.pay, pending: me.pending, trust: me.trust, qnaOn: me.qnaOn, qna: me.qna, notices: me.notices || [], refund: me.refund || null };
    if (me.br) LZ.setBranch(me.br, me.store);
  };
  LZ.afterLogin = async function (user, me) {
    if (LZ.noteAct) LZ.noteAct();                                             // 로그인한 때부터 30분을 셈
    S.user = user; u.store.set('lz.nick', user.nick); LZ.cache = {};
    if (!user.must) u.store.set('lz.plen', String(user.pinLen || 4));
    /* 매장: 링크의 ?s= → 마지막에 쓴 매장 → 기본 매장 */
    var want = (LZ.branchFromUrl && LZ.branch) || user.lastBr || user.home || LZ.branch;
    if (!me || me.br !== want) {
      try { if (want) LZ.setBranch(want, LZ.brName(want)); LZ.setMe(await LZ.api('me', {}, { retry: 1 })); }
      catch (e) { if (e && e.code === 'auth') return; if (me) LZ.setMe(me); }
    } else LZ.setMe(me);
    if (S.user.lastBr !== LZ.branch) LZ.api('useBranch', {}, { retry: 0 }).catch(function () { /* 무시 */ });
    LZ.branchFromUrl = false;
    try { history.replaceState(history.state, '', location.pathname + LZ.linkQuery(user.nick)); } catch (e) { /* 무시 */ }
    LZ.rec.restore(); LZ.applyFontSize();
    if (user.must) return LZ.go('pin', { first: true }, { reset: true });
    await LZ.go(ui.isAdmin() ? 'dash' : 'courses', {}, { reset: true });
    setTimeout(LZ.prefetch, 1500);
    await LZ.noticePopup();
    if (!ui.isStaff() && !LZ.joining) LZ.installHint();                   // 방금 가입한 분은 사용 방법을 다 본 뒤에
  };
  /* 내 등급·기간·결제 상태를 서버에서 다시 받음(결제 승인 뒤 바로 반영되도록) */
  var meAt = 0, meLater = null;
  LZ.refreshMe = async function (force) {
    var wait = 8000 - (Date.now() - meAt);
    if (!force && wait > 0) {                                                // 8초 안에 또 부르면 한 번으로 모아서 8초가 지나면 받음
      if (!meLater) meLater = u.sleep(wait).then(function () { meLater = null; return LZ.refreshMe(); });
      return meLater;
    }
    meAt = Date.now();
    try {
      var me = await LZ.api('me', {}, { retry: 0 });
      var sig = function () { var m = S.me || {}; return [S.user && S.user.kind, S.user && S.user.st, S.user && S.user.end, m.qna, m.pending && m.pending.id, JSON.stringify(m.refund || null), (m.notices || []).map(function (n) { return n.id + n.upd; }).join()].join('|'); };
      var was = sig();
      LZ.setMe(me);
      return was !== sig();                                                   // 등급·기간·답변·결제·환불·공지가 바뀌었는지
    } catch (e) { return false; }
  };
  /* 자주 여는 탭을 미리 받아 둠(처음 누를 때도 바로 보이게) */
  LZ.prefetch = function () {
    if (!S.user || S.user.must) return;
    var q = [['courses', {}], ['prefs', {}]];
    if (ui.isStaff()) q.push(['dash', { br: ui.isAdmin() ? (u.store.get('lz.dashBr') || '') : '' }], ['members', { br: '' }]);
    q.forEach(function (x, i) { setTimeout(function () { if (S.user) LZ.capi(x[0], x[1]).catch(function () {}); }, i * 400); });
  };
  LZ.onAuthLost = function (msg) {
    S.token = null; S.user = null; u.store.del('lz.t'); LZ.cache = {}; LZ.capiClear();
    LZ.guard = null; S.me = null;
    LZ.go('login', { msg: msg }, { reset: true });
  };
  LZ.logout = async function () {
    var c = await ui.dialog({ title: '로그아웃 할까요?', body: '로그아웃하면 다음에 들어올 때 비밀번호를 다시 눌러야 해요.', cancel: false,
      buttons: [{ label: '로그아웃', kind: 'y', value: true }, { label: '취소', kind: 'g', value: false }] });
    if (!c) return;
    var g = LZ.guard; if (g && g.kind === 'form' && g.dirty() && !(await LZ.leave())) return;   // 쓰던 글(문의·공지·코스 등록)이 있으면 먼저 물어봄
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
    S.token = null; S.user = null; S.me = null; u.store.del('lz.t'); LZ.cache = {}; LZ.capiClear(); LZ.rec.reset();
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
  function applyCfg(d) { if (d.store && !S.store) S.store = d.store; if (d.logos) { if (d.logos.dark) S.logos.dark = d.logos.dark; if (d.logos.light) S.logos.light = d.logos.light; } }
  async function boot() {
    LZ.applyFontSize(); LZ.theme.apply();
    LZ.pwa.registerSW(function (apply) {
      ui.dialog({ title: '새 버전이 있어요', body: '앱을 새 버전으로 바꿀게요. 잠깐 화면이 다시 열려요.', cancel: false, buttons: [{ label: '지금 바꾸기', kind: 'y', value: true }, { label: '나중에', kind: 'g', value: false }] }).then(function (v) { if (v) apply(); });
    });
    if (LZ.configBroken) {
      $('#boot').innerHTML = '<h2>설정 파일(js/config.js)을 읽지 못했어요</h2><p>따옴표(\')가 짝이 맞지 않거나 쉼표(,)가 빠졌을 때 생겨요. js/config.js 를 확인해 주세요.</p>';
      return;
    }
    if (!LZ.ready()) { $('#boot').innerHTML = '<h2>서버 주소가 아직 없어요</h2><p>js/config.js 의 API 에 앱스크립트 배포 주소를 넣어 주세요.</p>'; return; }
    /* 카카오톡 같은 앱 안 브라우저: 기본 브라우저로 열도록 안내 */
    var inapp = LZ.pwa.inApp();
    if (inapp && !LZ.pwa.standalone() && u.store.get('lz.inappOk') !== '1') await LZ.screens.inappGate(inapp);

    /* 매장 이름·로고(저장해 둔 것을 먼저 쓰고, 서버에서 바뀐 것만 새로 받음) */
    var cached = u.store.getJSON('lz.cfg') || {};
    applyCfg(cached);
    try {
      var cfg = await LZ.api('cfg', { lv: cached.logoVer || 0 }, { noAuth: true, retry: 1 });
      var keep = { store: cfg.store, logoVer: cfg.logoVer, logos: cfg.logos || cached.logos };
      if (cfg.branches) S.branches = cfg.branches;
      if (cfg.join) S.join = cfg.join;
      if (cfg.idleMin !== undefined) S.idleMin = cfg.idleMin;
      if (LZ.branch && cfg.branch !== LZ.branch) { LZ.setBranch(''); LZ.branchFromUrl = false; }   // 없어진 매장 코드(예전 링크)면 서버가 정하게
      S.store = cfg.store || S.store;
      applyCfg(keep); u.store.setJSON('lz.cfg', keep);
      if (cfg.logos) { S.logos.dark = cfg.logos.dark || 'assets/logo-dark.png'; S.logos.light = cfg.logos.light || 'assets/logo-light.png'; }
    } catch (e) { /* 서버가 느려도 일단 계속 */ }

    var nickParam = new URLSearchParams(location.search).get('u');
    S.token = u.store.get('lz.t');
    var other = S.token && nickParam && u.store.get('lz.nick') && nickParam.toLowerCase() !== u.store.get('lz.nick').toLowerCase();
    if (other) {                                                                    // 다른 사람 링크로 들어옴(내 예전 닉네임이면 그대로)
      var mine = null; try { mine = await LZ.api('me', {}, { retry: 0 }); } catch (e) { mine = null; }
      var nk = nickParam.toLowerCase(), me0 = mine && mine.user;
      if (me0 && (me0.nick.toLowerCase() === nk || (me0.prev || '').toLowerCase() === nk)) { u.store.set('lz.nick', me0.nick); await LZ.afterLogin(me0, mine); return; }
      LZ.api('logout', {}, { retry: 0, timeout: 5000 }).catch(function () {}); S.token = null; u.store.del('lz.t'); u.store.del('lz.pend');
    }
    var loginMsg = '';
    if (S.token && LZ.idleOver()) {                                          // 앱을 닫아 둔 사이에 30분이 지남 → 자동 로그아웃
      try { fetch(LZ.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a: 'logout', t: S.token }), keepalive: true }).catch(function () {}); } catch (e) { /* 무시 */ }
      S.token = null; u.store.del('lz.t'); loginMsg = (S.idleMin || 30) + '분 동안 쓰지 않아서 자동으로 로그아웃됐어요. 다시 로그인해 주세요.';
    }
    if (S.token) {
      try { var me = await LZ.api('me', {}); u.store.del('lz.ref'); await LZ.afterLogin(me.user, me); return; }
      catch (e) {
        if (e && e.code !== 'auth') { LZ.screens.fatal(e); return; }       // 인터넷 문제 등: 로그아웃시키지 않고 다시 시도 안내
        S.token = null; u.store.del('lz.t'); loginMsg = e.message || '';
      }
    }
    await LZ.go('login', loginMsg ? { msg: loginMsg } : {}, { reset: true });
    if (LZ.wantJoin && S.join && S.join.on) await LZ.go('join', {});                // 초대 링크·QR(?join=1)은 가입 화면으로 바로
  }
  LZ.screens.fatal = function (e) {
    var b = $('#boot'); if (b) b.parentNode.removeChild(b);
    var root = $('#app'); root.hidden = false; root.innerHTML = '<div class="bd nt"><div class="err"><img src="' + u.esc(ui.logoSrc()) + '" alt="" style="width:180px;margin:0 auto 16px;display:block">' + ui.errorBlock(ui.errText(e)).replace('class="err"', 'class=""') + '</div></div>';
    $('[data-retry]', root).onclick = function () { location.reload(); };
    LZ.booted = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
