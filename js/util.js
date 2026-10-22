/* 작은 도구 모음 */
(function () {
  'use strict';
  var LZ = window.LZ = window.LZ || {};
  var u = LZ.u = {};

  u.$ = function (s, r) { return (r || document).querySelector(s); };
  u.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  u.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  u.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  u.fm = function (m) { return String(Math.round(m * 10) / 10); };                                  // 52.5, 80
  u.fmt = function (m) { return (Math.round(m * 10) / 10).toLocaleString('ko-KR'); };               // 1,343.5
  u.LBL = function (i) { return i < 9 ? (i + 1) + '홀' : (i - 8) + '홀 (' + (i + 1) + '홀)'; };   // 전반 1홀~9홀, 후반 1홀 (10홀)~9홀 (18홀)
  u.stripSpaces = function (s) { return String(s).replace(/[\s\u3000\u200b\ufeff]+/g, ''); };
  u.key = function (s) { return u.stripSpaces(s).toLowerCase(); };
  u.debounce = function (fn, ms) { var t; var f = function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; f.cancel = function () { clearTimeout(t); }; return f; };

  /* ───── 통합 서버 하나 + 지점(서버 안의 칸) ─────
   * 서버 주소는 하나(config.js 의 API). 지점은 서버가 알려 주고, 주소 끝의 ?s=지점코드 로 열거나 앱 위쪽 지점 이름을 눌러 바꿉니다. */
  LZ.configBroken = !window.LZ_CONFIG;                                           // config.js 에 쉼표·따옴표 실수가 있으면 파일 전체를 못 읽음
  var C = window.LZ_CONFIG || {}, clean = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  LZ.API = C.API || (function () {                                               // 예전 설정 모양(지점마다 주소)이면 기본 지점 주소를 씀
    if (!C.BRANCHES) return '';
    var d = C.BRANCHES[C.DEFAULT] || C.BRANCHES[Object.keys(C.BRANCHES)[0]] || {};
    return d.API || '';
  })();
  LZ.ready = function () { return !!(LZ.API && !/^YOUR_/.test(LZ.API)); };
  LZ.clean = clean;
  (function () {
    var q = clean(new URLSearchParams(location.search).get('s')), saved = null;
    try { saved = clean(localStorage.getItem('lz.br')) || clean(localStorage.getItem('lz.branch')); } catch (e) { /* 무시 */ }
    LZ.branch = q || saved || '';                                                // 비어 있으면 서버가 마지막 지점·기본 지점으로 정해 줌
    LZ.branchFromUrl = !!q;
  })();
  LZ.setBranch = function (code, name) {
    LZ.branch = code || ''; if (name && LZ.S) LZ.S.store = name;
    try { localStorage.setItem('lz.br', LZ.branch); } catch (e) { /* 무시 */ }
  };
  /* 기기 저장소(실패해도 앱이 멈추지 않게). 앱 것은 "lz@app." 아래에 모아 두고, 화면 모드·글씨 크기·지점은 폰 전체 설정 */
  var SHARED = /^lz\.(theme|fs|hintOff|hintAt|installed|inappOk|branch|br|dev|ref|buzz)$/, NS = 'lz@app.';
  function nk(k) { return /^lz\./.test(k) && !SHARED.test(k) ? NS + k.slice(3) : k; }
  try {                                                                          // 예전 버전 값(lz.○○, 지점별 lz@yangju.○○)을 옮겨 와서 로그인 유지
    if (!localStorage.getItem(NS + 'moved')) {
      var olds = [];
      for (var i = localStorage.length - 1; i >= 0; i--) { var k0 = localStorage.key(i); if (k0) olds.push(k0); }
      olds.forEach(function (k0) {
        var m = /^lz@([a-z0-9]+)\.(.+)$/.exec(k0), rest = m ? m[2] : (/^lz\./.test(k0) && !SHARED.test(k0) ? k0.slice(3) : null);
        if (!rest || (m && m[1] === 'app')) return;
        if (m && m[1] !== 'yangju' && localStorage.getItem(NS + rest) !== null) return;          // 양주점 값을 먼저
        if (localStorage.getItem(NS + rest) === null || (m && m[1] === 'yangju')) localStorage.setItem(NS + rest, localStorage.getItem(k0));
      });
      localStorage.setItem(NS + 'moved', '1');
    }
  } catch (e) { /* 무시 */ }
  u.store = {
    get: function (k) { try { return localStorage.getItem(nk(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(nk(k), v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(nk(k)); } catch (e) { /* 무시 */ } },
    getJSON: function (k) { try { return JSON.parse(u.store.get(k)); } catch (e) { return null; } },
    setJSON: function (k, v) { return u.store.set(k, JSON.stringify(v)); }
  };
  /* 누를 때 짧은 진동(설정에서 끌 수 있음)
   * 안드로이드: 진동. 아이폰은 진동 기능을 열어 주지 않아서, iOS 18 이상에서 되는 "스위치 누름 느낌"을 대신 써요(손가락으로 누를 때만). */
  var iosSw = null;
  function iosTap() {
    try {
      if (!iosSw) {
        var lb = document.createElement('label'), cb = document.createElement('input');
        cb.type = 'checkbox'; cb.setAttribute('switch', ''); cb.tabIndex = -1; cb.setAttribute('aria-hidden', 'true');
        lb.appendChild(cb); lb.setAttribute('aria-hidden', 'true');
        lb.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(lb); iosSw = lb;
      }
      iosSw.click();
    } catch (e) { /* 무시 */ }
  }
  u.buzzOn = function () { return u.store.get('lz.buzz') !== '0'; };
  u.buzz = function (kind) {
    if (!u.buzzOn()) return;
    var pat = kind === 'err' ? [40, 60, 40] : kind === 'edge' ? 35 : kind === 'ok' ? [15, 40, 15] : 12;
    if (navigator.vibrate) { try { navigator.vibrate(pat); } catch (e) { /* 무시 */ } return; }
    if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) { iosTap(); if (kind === 'err' || kind === 'ok') setTimeout(iosTap, 120); }
  };
  /* 이 휴대폰 번호(직접 가입 1인 1회 확인용, 개인정보 아님) · 초대 링크의 추천 코드(?r=) */
  LZ.devId = function () {
    var d = u.store.get('lz.dev');
    if (!/^[a-f0-9]{32}$/.test(d || '')) {
      var a = new Uint8Array(16); try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
      d = Array.prototype.map.call(a, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); u.store.set('lz.dev', d);
    }
    return d;
  };
  (function () {
    var qs = new URLSearchParams(location.search), r = qs.get('r');
    if (r && /^u\d{1,9}$/.test(r)) u.store.set('lz.ref', r);
    LZ.wantJoin = qs.get('join') === '1';
  })();


  /* 기록 한 칸: r=기준(f 최초화면, c 홀컵, u 내가 정한 곳) t=이름 d=방향(L/R) n=칸 o=참고사항 */
  u.PW0 = 17;                                                                                       // 타격감 기본값(17 = 50M)
  u.emptyRec = function () { return { r: '', t: '', d: 'R', n: 0, p: u.PW0, o: '' }; };
  u.cloneRec = function (r) { var p = r.p | 0; return { r: r.r || '', t: r.t || '', d: r.d === 'L' ? 'L' : 'R', n: r.n | 0, p: p >= 8 && p <= 40 ? p : u.PW0, o: r.o || '' }; };
  u.side = function (d) { return d === 'L' ? '좌측' : '우측'; };
  /* 타격감: 17 = 50M, 1마다 5M → "17(50M) 정도" */
  u.pwM = function (p) { return 5 * p - 35; };
  u.pwText = function (p) { return p ? p + '(' + u.pwM(p) + 'M) 정도' : ''; };
  u.filled = function (a) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] && a[i].r) n++; return n; };
  function base(r) { return r.r === 'f' ? '최초화면' : r.r === 'c' ? '홀컵' : (r.t || '내가 정한 곳'); }
  u.sent = function (r) {
    if (!r || !r.r) return null;
    return (r.n ? base(r) + '에서 ' + u.side(r.d) + ' ' + r.n + '칸' : base(r) + ' 그대로') + (r.p ? ' · 타격감 ' + u.pwText(r.p) : '');
  };
  u.sentHTML = function (r) {
    if (!r || !r.r) return '<span class="none">아직 기록하지 않았어요</span>';
    var b = u.esc(base(r));
    return (r.n ? b + '에서 <span class="dv ' + r.d + '">' + u.side(r.d) + ' ' + r.n + '칸</span>' : b + ' 그대로') + (r.p ? '<span class="pw">타격감 ' + u.pwText(r.p) + '</span>' : '');
  };
  u.base = base;
  /* 날짜 'YYYY-MM-DD' → '10월 21일' / 기간 표시 */
  u.md = function (d) { if (!d) return ''; var a = String(d).split('-'); return (+a[1]) + '월 ' + (+a[2]) + '일'; };
  u.ymd = function (d) { if (!d) return ''; var a = String(d).split('-'); return a[0] + '. ' + (+a[1]) + '. ' + (+a[2]) + '.'; };
  u.period = function (s, e) { return s && e ? u.ymd(s) + ' ~ ' + u.ymd(e) : ''; };
  u.fmtDate = function (ts) { if (!ts) return ''; var d = new Date(+ts); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; };
  u.fmtDT = function (ts) { if (!ts) return ''; var d = new Date(+ts), p = function (n) { return (n < 10 ? '0' : '') + n; }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  u.today = function () { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  u.won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR') + '원'; };
  u.ago = function (ts) {
    if (!ts) return '접속 기록 없음';
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 10) return '지금 접속 중'; if (m < 60) return m + '분 전'; if (m < 1440) return Math.floor(m / 60) + '시간 전';
    return Math.floor(m / 1440) + '일 전';
  };
  /* 필요할 때만 불러오는 파일(QR 라이브러리 등) */
  var loaded = {};
  u.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error('파일을 불러오지 못했어요: ' + src)); }; document.head.appendChild(s); });
    return loaded[src];
  };
  u.dday = function (left) { return left === null || left === undefined ? '' : left > 0 ? 'D-' + left : left === 0 ? '오늘까지' : '기간 끝남'; };

  u.copy = function (text) {
    return new Promise(function (resolve) {
      function fallback() {
        try {
          var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = document.execCommand('copy'); document.body.removeChild(ta); resolve(!!ok);
        } catch (e) { resolve(false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
      else fallback();
    });
  };
  u.share = function (text, title) {
    if (!navigator.share) return Promise.resolve(false);
    return navigator.share({ text: text, title: title || '' }).then(function () { return true; }, function (e) { return e && e.name === 'AbortError' ? true : false; });
  };

  /* 그림 파일을 가로 maxW 이하로 줄여서 data 주소(png)로 바꿈 — 로고 올리기용 */
  u.resizeImage = function (file, maxW, maxChars) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('파일을 읽지 못했어요')); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('그림 파일이 아니에요')); };
        img.onload = function () {
          var w = maxW;
          for (var k = 0; k < 6; k++) {
            var s = Math.min(1, w / img.width), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            var d = c.toDataURL('image/png');
            if (d.length <= maxChars) return resolve(d);
            w = Math.round(w * 0.75);
          }
          reject(new Error('그림이 너무 커요. 더 단순한 그림을 써 주세요'));
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  };
})();
