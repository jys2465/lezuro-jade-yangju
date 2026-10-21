/* 서버(구글 앱스크립트)와 이야기하는 부분 + 동시 사용 대기열 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u;

  function ApiError(code, msg, data) { this.code = code; this.message = msg; this.data = data || {}; this.isApi = true; }
  ApiError.prototype = Object.create(Error.prototype);
  LZ.ApiError = ApiError;

  function post(a, body, o) {
    var url = (window.LZ_CONFIG || {}).API;
    if (!url || /^YOUR_/.test(url)) return Promise.reject(new ApiError('config', '서버 주소가 아직 설정되지 않았어요.\n개발자에게 js/config.js 를 확인해 달라고 해 주세요.'));
    var payload = {}; for (var k in (body || {})) payload[k] = body[k];
    payload.a = a; if (window.LZ_CONFIG && window.LZ_CONFIG.BRANCH) payload.b = LZ.branch;   // 지점 코드: 서버가 다른 지점 주소면 거절
    if (LZ.S && LZ.S.token && !o.noAuth) payload.t = LZ.S.token;
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 40000) : null;
    /* 사전요청(OPTIONS)이 생기지 않도록 text/plain 으로 보냄 */
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (timer) clearTimeout(timer); return r.text(); }, function () { if (timer) clearTimeout(timer); throw new ApiError('net', '인터넷에 연결되어 있는지 확인해 주세요.'); })
      .then(function (txt) {
        var d;
        try { d = JSON.parse(txt); } catch (e) { throw new ApiError('server', '서버 응답을 읽을 수 없어요.\n개발자에게 앱스크립트 배포 설정(액세스: 모든 사용자)을 확인해 달라고 해 주세요.'); }
        if (d && d.ok) return d;
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
      ov.innerHTML = '<img src="' + u.esc(LZ.S.logos.light) + '" alt="레저로 스크린 파크골프"><h2 style="font-size:20px;margin-bottom:6px">지금 이용하는 분이 많아요</h2>' +
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

  LZ.api = function (a, body, o) {
    o = o || {};
    var tries = o.retry === undefined ? (/^(cfg|me|courses|course|members|prefs|payInfo|payList|adminCfg)$/.test(a) ? 1 : 0) : o.retry;
    function run(left) {
      return post(a, body, o).catch(function (e) {
        if (e && e.code === 'net' && left > 0) return u.sleep(1200).then(function () { return run(left - 1); });
        if (e && e.code === 'queue' && !o.noQueue) return LZ.queueWait(e.data).then(function () { return run(left); });
        if (e && e.code === 'auth' && LZ.S && LZ.S.token && LZ.onAuthLost && !o.noAuth) LZ.onAuthLost(e.message);
        throw e;
      });
    }
    return run(tries);
  };

  /* ───── 좌석 유지: 최근 1분 안에 화면을 만졌을 때만 1분마다 알림(10분 동안 움직임이 없으면 서버가 좌석을 비움) ───── */
  var lastAct = Date.now(), lastPing = Date.now();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true, capture: true }); });
  LZ.notePing = function () { lastPing = Date.now(); };
  setInterval(function () {
    if (!LZ.S || !LZ.S.token || waiting || document.visibilityState !== 'visible') return;
    var now = Date.now();
    if (now - lastAct < 70000 && now - lastPing > 55000) { lastPing = now; LZ.api('ping', {}, { retry: 0, timeout: 15000 }).catch(function () { /* 무시 */ }); }
  }, 15000);
})();
