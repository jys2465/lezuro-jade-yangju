/* 서버(구글 앱스크립트)와 이야기하는 부분 + 동시 사용 대기열 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u;

  function ApiError(code, msg, data) { this.code = code; this.message = msg; this.data = data || {}; this.isApi = true; }
  ApiError.prototype = Object.create(Error.prototype);
  LZ.ApiError = ApiError;

  function post(a, body, o) {
    var url = LZ.API;
    if (!url || /^YOUR_/.test(url)) return Promise.reject(new ApiError('config', '앱 설정이 아직 끝나지 않았어요.\n매장 운영자에게 알려 주세요.'));
    var payload = {}; for (var k in (body || {})) payload[k] = body[k];
    payload.a = a; if (LZ.branch && payload.br === undefined) payload.br = LZ.branch;   // 지금 매장(서버가 없는 매장이면 거절)
    if (LZ.S && LZ.S.token && !o.noAuth) payload.t = LZ.S.token;
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 40000) : null;
    /* 사전요청(OPTIONS)이 생기지 않도록 text/plain 으로 보냄 */
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (timer) clearTimeout(timer); return r.text(); }, function () { if (timer) clearTimeout(timer); throw new ApiError('net', '인터넷에 연결되어 있는지 확인해 주세요.'); })
      .then(function (txt) {
        var d;
        try { d = JSON.parse(txt); } catch (e) { throw new ApiError('server', '서버와 연결이 잠시 원활하지 않아요.\n잠시 뒤에 다시 해 주세요. 계속되면 매장 운영자에게 알려 주세요.'); }
        if (d && d.ok) { if (d.br && d.store && /^(me|courses|course|useBranch)$/.test(a)) LZ.setBranch(d.br, d.store); return d; }   // 서버가 정한 매장으로 맞춤
        throw new ApiError((d && d.err) || 'server', (d && d.msg) || '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.', d);
      });
  }

  /* ───── 대기열: 좌석이 모두 차면 "앞에 N명"을 보여 주고 15초마다 다시 확인 ───── */
  var waiting = null;
  LZ.queueWait = function (first) {
    if (waiting) return waiting;
    var ov = document.createElement('div'); ov.className = 'qwait'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-live', 'polite');
    function paint(d) {
      d = d || {};
      ov.innerHTML = LZ.ui.logo() + '<h2 style="font-size:20px;margin-bottom:6px">지금 이용하는 분이 많아요</h2>' +
        '<p>내 앞에 기다리는 분</p><div class="n">' + (d.ahead || 0) + '명</div>' +
        '<p>자리가 나면 자동으로 들어가요. 이 화면을 켜 둔 채로 잠시만 기다려 주세요.' + (d.waiting ? '<br><span style="font-size:14px;color:var(--mut)">전체 대기 ' + d.waiting + '명</span>' : '') + '</p>' +
        '<div class="spin" style="margin:10px auto 0"></div>';
    }
    paint(first); document.body.appendChild(ov);
    waiting = new Promise(function (resolve) {
      function again() {
        setTimeout(function () {
          post('ping', {}, { timeout: 20000 }).then(function () {
            if (ov.parentNode) ov.parentNode.removeChild(ov); waiting = null; resolve();
          }, function (e) {
            if (e && e.code === 'queue') paint(e.data);
            else if (e && e.code === 'auth') { if (ov.parentNode) ov.parentNode.removeChild(ov); waiting = null; resolve(); return; }
            again();
          });
        }, window.LZ_QPOLL || 15000);                              // 15초마다 다시 확인(시험에서는 짧게)
      }
      again();
    });
    return waiting;
  };

  /* ───── 빠른 화면: 읽기 요청은 기억해 두었다가 바로 보여 주고, 뒤에서 새로 받아 바뀌었으면 화면만 다시 그림 ─────
   * 쓰기 요청이 성공하면 기억을 모두 지워서 옛 내용이 보이지 않게 해요. */
  var READS = /^(cfg|me|ping|courses|course|prefs|trust|faqList|qnaList|noticeList|payInfo|payList|refundList|refundInfo|members|dash|branchList|adminCfg|log|joinCheck|refName|refInfo|imgGet|nameCheck)$/;
  var C = {}, gen = 0, F = {};
  LZ.capiClear = function () { C = {}; F = {}; gen++; };
  LZ.capi = function (a, body, o) {
    o = o || {};
    var key = a + '|' + JSON.stringify(body || {}) + '|' + (LZ.branch || '') + '|' + (LZ.S && LZ.S.user ? LZ.S.user.uid : ''), hit = C[key], g = gen, age = hit ? Date.now() - hit.t : 1e12;
    function fetch() {
      var p = F[key] || (F[key] = LZ.api(a, body, o).then(function (d) { delete F[key]; return d; }, function (e) { delete F[key]; throw e; }));   // 같은 요청이 이미 가는 중이면 함께 기다림
      return p.then(function (d) {
        if (g !== gen) return d;                                                 // 그사이에 저장이 있었으면 이 결과는 기억하지 않음
        var changed = !C[key] || JSON.stringify(C[key].d) !== JSON.stringify(d);
        C[key] = { d: d, t: Date.now() };
        if (hit && changed && o.onFresh) o.onFresh(d);
        return d;
      });
    }
    if (!hit) return fetch();
    if (age > (o.fresh || 0)) fetch().catch(function () { /* 뒤에서 받기 실패는 조용히 */ });   // 기억한 내용은 바로 보여 주고, 뒤에서 항상 새로 받음
    return Promise.resolve(hit.d);
  };
  LZ.api = function (a, body, o) {
    o = o || {};
    var tries = o.retry === undefined ? (/^(cfg|me|courses|course|members|prefs|payInfo|payList|adminCfg)$/.test(a) ? 1 : 0) : o.retry;
    function run(left) {
      return post(a, body, o).catch(function (e) {
        if (e && e.code === 'net' && left > 0) return u.sleep(1200).then(function () { return run(left - 1); });
        if (e && e.code === 'queue' && !o.noQueue) return LZ.queueWait(e.data).then(function () { return run(left); });
        if (e && e.code === 'branch' && LZ.branch && !o._brRetry && !(body && body.br)) { LZ.setBranch(''); o._brRetry = true; return run(left); }   // 없어진 매장을 기억하고 있으면 서버가 정해 준 매장으로
        if (e && e.code === 'auth' && LZ.S && LZ.S.token && LZ.onAuthLost && !o.noAuth) LZ.onAuthLost(e.message);
        if (e && e.code === 'must' && LZ.go && LZ.stack && LZ.stack.length && LZ.stack[LZ.stack.length - 1].name !== 'pin') LZ.go('pin', { first: true }, { reset: true, skipGuard: true });
        throw e;
      });
    }
    return run(tries).then(function (d) { if (!READS.test(a)) LZ.capiClear(); return d; });
  };

  /* ───── 앱을 닫거나 다른 앱으로 가면 "접속 중"을 바로 끝냄(로그인은 유지) → 돌아오면 다시 접속 중 ─────
   * 화면이 가려질 때는 보통 요청이 끝까지 못 가서, 닫혀도 전달되는 sendBeacon 을 써요. */
  var awaySent = false;
  function bye() {
    if (!LZ.S || !LZ.S.token || awaySent || !LZ.API) return;
    awaySent = true;
    var body = JSON.stringify({ a: 'bye', t: LZ.S.token });
    try { if (navigator.sendBeacon && navigator.sendBeacon(LZ.API, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return; } catch (e) { /* 아래로 */ }
    try { fetch(LZ.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true }); } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') bye();
    else if (LZ.S && LZ.S.token && LZ.idleOver()) { awaySent = false; LZ.autoLogout(); }          // 닫아 둔 사이에 30분이 지났으면 바로 로그아웃
    else if (awaySent && LZ.S && LZ.S.token) { awaySent = false; lastAct = Date.now(); lastPing = Date.now(); LZ.api('ping', {}, { retry: 0, timeout: 15000 }).catch(function () { /* 무시 */ }); }
  });
  window.addEventListener('pagehide', bye);
  /* ───── 좌석 유지: 최근 1분 안에 화면을 만졌을 때만 1분마다 알림(10분 동안 움직임이 없으면 서버가 좌석을 비움) ───── */
  var lastAct = Date.now(), lastPing = Date.now(), actSaved = 0;
  LZ.noteAct = function () {                                               // 화면을 만질 때마다(15초에 한 번 기기에 적어 둠: 앱을 닫았다 열어도 이어서 셈)
    lastAct = Date.now();
    if (lastAct - actSaved > 15000) { actSaved = lastAct; u.store.set('lz.act', String(lastAct)); }
    if (warnEl) closeWarn();
  };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, LZ.noteAct, { passive: true, capture: true }); });

  /* ───── 30분 동안 쓰지 않으면 자동 로그아웃(회원·운영자·관리자 모두) — 2분 전에 "계속 쓰기" 안내 ───── */
  var warnEl = null, autoBusy = false;
  function idleLim() { var m = LZ.S && LZ.S.idleMin; return (m === undefined || m === null ? 30 : +m) * 60000; }
  LZ.idleOver = function () { var lim = idleLim(), last = Math.max(lastAct, +u.store.get('lz.act') || 0); return lim > 0 && Date.now() - last > lim; };
  function closeWarn() { if (warnEl && warnEl.parentNode) warnEl.parentNode.removeChild(warnEl); warnEl = null; }
  function showWarn(ms) {
    var sec = Math.max(1, Math.round(ms / 1000));
    if (!warnEl) {
      warnEl = document.createElement('div'); warnEl.className = 'idlew'; warnEl.setAttribute('role', 'alertdialog');
      warnEl.innerHTML = '<div class="box"><b>곧 자동으로 로그아웃돼요</b><p data-idles></p><button type="button" class="btn" data-idlego>계속 쓰기</button></div>';
      document.body.appendChild(warnEl);
      warnEl.querySelector('[data-idlego]').onclick = function () { LZ.noteAct(); closeWarn(); LZ.api('ping', {}, { retry: 0, timeout: 15000 }).catch(function () {}); };
    }
    var p = warnEl.querySelector('[data-idles]'); if (p) p.textContent = Math.round(idleLim() / 60000) + '분 동안 쓰지 않아서 ' + (sec >= 60 ? Math.ceil(sec / 60) + '분' : sec + '초') + ' 뒤에 로그아웃돼요. 계속 쓰려면 아래 단추를 눌러 주세요.';
  }
  LZ.autoLogout = async function () {
    if (autoBusy || !LZ.S || !LZ.S.token) return; autoBusy = true; closeWarn();
    try { if (LZ.rec && LZ.rec.dirty()) await Promise.race([LZ.rec.flush(), u.sleep(4000)]); } catch (e) { /* 저장 못 한 기록은 기기에 남아 다음 로그인 때 이어서 저장 */ }
    var body = JSON.stringify({ a: 'logout', t: LZ.S.token });
    try { fetch(LZ.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true }).catch(function () {}); } catch (e) { /* 무시 */ }
    LZ.guard = null;
    if (LZ.onAuthLost) LZ.onAuthLost(Math.round(idleLim() / 60000) + '분 동안 쓰지 않아서 자동으로 로그아웃됐어요. 다시 로그인해 주세요.');
    autoBusy = false;
  };
  LZ.idleCheck = function () {
    if (!LZ.S || !LZ.S.token) { closeWarn(); return; }
    var lim = idleLim(); if (!lim) return;
    var idle = Date.now() - Math.max(lastAct, +u.store.get('lz.act') || 0);
    if (idle > lim) LZ.autoLogout();
    else if (idle > lim - 120000 && document.visibilityState === 'visible') showWarn(lim - idle);
  };
  setInterval(LZ.idleCheck, 5000);
  LZ.notePing = function () { lastPing = Date.now(); };
  setInterval(function () {
    if (!LZ.S || !LZ.S.token || waiting || document.visibilityState !== 'visible') return;
    var now = Date.now();
    if (now - lastAct < 70000 && now - lastPing > 55000) { lastPing = now; LZ.api('ping', {}, { retry: 0, timeout: 15000 }).catch(function () { /* 무시 */ }); }
  }, 15000);
})();
