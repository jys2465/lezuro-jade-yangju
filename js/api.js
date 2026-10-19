/* 서버(구글 앱스크립트)와 이야기하는 부분 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u;

  function ApiError(code, msg, data) { this.code = code; this.message = msg; this.data = data || {}; this.isApi = true; }
  ApiError.prototype = Object.create(Error.prototype);
  LZ.ApiError = ApiError;

  /* 쓰기·읽기 모두: 사전요청(OPTIONS)이 생기지 않도록 text/plain 으로 보냄 */
  LZ.api = function (a, body, o) {
    o = o || {};
    var url = (window.LZ_CONFIG || {}).API;
    if (!url || /^YOUR_/.test(url)) return Promise.reject(new ApiError('config', '서버 주소가 아직 설정되지 않았어요.\n개발자에게 js/config.js 를 확인해 달라고 해 주세요.'));
    var payload = {}; for (var k in (body || {})) payload[k] = body[k];
    payload.a = a;
    if (LZ.S && LZ.S.token && !o.noAuth) payload.t = LZ.S.token;
    var tries = o.retry === undefined ? (/^(cfg|me|courses|course|members|prefs)$/.test(a) ? 1 : 0) : o.retry;

    function once() {
      var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 40000) : null;
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (timer) clearTimeout(timer); return r.text(); }, function () { if (timer) clearTimeout(timer); throw new ApiError('net', '인터넷에 연결되어 있는지 확인해 주세요.'); })
        .then(function (txt) {
          var d;
          try { d = JSON.parse(txt); } catch (e) { throw new ApiError('server', '서버 응답을 읽을 수 없어요.\n개발자에게 앱스크립트 배포 설정(액세스: 모든 사용자)을 확인해 달라고 해 주세요.'); }
          if (d && d.ok) return d;
          var err = new ApiError((d && d.err) || 'server', (d && d.msg) || '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.', d);
          if (err.code === 'auth' && LZ.S && LZ.S.token && LZ.onAuthLost) LZ.onAuthLost(err.message);
          throw err;
        });
    }
    function run(left) {
      return once().catch(function (e) {
        if (e && e.code === 'net' && left > 0) return u.sleep(1200).then(function () { return run(left - 1); });
        throw e;
      });
    }
    return run(tries);
  };
})();
