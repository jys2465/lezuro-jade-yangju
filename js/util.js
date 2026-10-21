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

  /* ───── 지점: 화면(이 주소)은 하나, 서버·시트는 지점마다 따로 ─────
   * 주소 끝의 ?s=지점코드 로 지점을 고르고, 폰이 마지막 지점을 기억합니다. 없으면 기본 지점(DEFAULT). */
  LZ.configBroken = !window.LZ_CONFIG;                                           // config.js 에 쉼표·따옴표 실수가 있으면 파일 전체를 못 읽음
  var C = window.LZ_CONFIG || {}, B = {}, clean = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  if (C.BRANCHES) for (var bk in C.BRANCHES) { if (clean(bk)) B[clean(bk)] = { code: clean(bk), name: C.BRANCHES[bk].name || '', API: C.BRANCHES[bk].API || '' }; }
  else B[clean(C.BRANCH) || 'main'] = { code: clean(C.BRANCH) || 'main', name: '', API: C.API || '' };     // 예전 설정 모양(API·BRANCH 한 개)
  LZ.branches = B; LZ.branchList = Object.keys(B); LZ.multiBranch = LZ.branchList.length > 1;
  LZ.branchOn = !!(C.BRANCHES || C.BRANCH);                                          // 서버에 지점 코드를 함께 보낼지
  var DEF = B[clean(C.DEFAULT)] ? clean(C.DEFAULT) : LZ.branchList[0];
  LZ.ready = function (b) { return !!(B[b] && B[b].API && !/^YOUR_/.test(B[b].API)); };
  (function () {
    var q = clean(new URLSearchParams(location.search).get('s')), saved = null;
    try { saved = clean(localStorage.getItem('lz.branch')); } catch (e) { /* 무시 */ }
    LZ.branch = B[q] ? q : B[saved] ? saved : DEF;
    try { localStorage.setItem('lz.branch', LZ.branch); } catch (e) { /* 무시 */ }
  })();
  LZ.branchCfg = B[LZ.branch];
  LZ.switchBranch = function (code) {
    try { localStorage.setItem('lz.branch', code); } catch (e) { /* 무시 */ }
    location.href = location.pathname + '?s=' + encodeURIComponent(code);
  };
  /* 기기 저장소(실패해도 앱이 멈추지 않게).
   * 로그인·기록·임시 저장 같은 값은 지점마다 따로 보관하고("lz@지점코드."), 화면 모드·글씨 크기처럼 폰 전체 설정은 함께 씀 */
  var SHARED = /^lz\.(theme|fs|hintOff|hintAt|installed|inappOk|branch)$/;
  function nk(k, b) { return /^lz\./.test(k) && !SHARED.test(k) ? 'lz@' + (b || LZ.branch) + '.' + k.slice(3) : k; }
  try {                                                                          // 예전 버전(지점 코드 없음)에 남은 값은 기본 지점 것으로 옮김
    if (!localStorage.getItem('lz@' + DEF + '.moved')) {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k0 = localStorage.key(i);
        if (k0 && /^lz\./.test(k0) && !SHARED.test(k0) && localStorage.getItem(nk(k0, DEF)) === null) localStorage.setItem(nk(k0, DEF), localStorage.getItem(k0));
      }
      localStorage.setItem('lz@' + DEF + '.moved', '1');
    }
  } catch (e) { /* 무시 */ }
  u.store = {
    get: function (k) { try { return localStorage.getItem(nk(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(nk(k), v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(nk(k)); } catch (e) { /* 무시 */ } },
    getJSON: function (k) { try { return JSON.parse(u.store.get(k)); } catch (e) { return null; } },
    setJSON: function (k, v) { return u.store.set(k, JSON.stringify(v)); }
  };

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
