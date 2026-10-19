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

  /* 기기 저장소(실패해도 앱이 멈추지 않게) */
  u.store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
    getJSON: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    setJSON: function (k, v) { return u.store.set(k, JSON.stringify(v)); }
  };

  /* 기록 한 칸: r=기준(f 최초화면, c 홀컵, u 내가 정한 곳) t=이름 d=방향(L/R) n=칸 o=참고사항 */
  u.emptyRec = function () { return { r: '', t: '', d: 'R', n: 0, p: 0, o: '' }; };
  u.cloneRec = function (r) { return { r: r.r || '', t: r.t || '', d: r.d === 'L' ? 'L' : 'R', n: r.n | 0, p: r.p | 0, o: r.o || '' }; };
  /* 타격감: 17 = 50M, 1마다 5M → "17(50M) 정도" */
  u.pwM = function (p) { return 5 * p - 35; };
  u.pwText = function (p) { return p ? p + '(' + u.pwM(p) + 'M) 정도' : ''; };
  u.filled = function (a) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] && a[i].r) n++; return n; };
  function base(r) { return r.r === 'f' ? '최초화면' : r.r === 'c' ? '홀컵' : (r.t || '내가 정한 곳'); }
  u.sent = function (r) {
    if (!r || !r.r) return null;
    return (r.n ? base(r) + '에서 ' + (r.d === 'L' ? '왼쪽' : '오른쪽') + ' ' + r.n + '칸' : base(r) + ' 그대로') + (r.p ? ' · 타격감 ' + u.pwText(r.p) : '');
  };
  u.sentHTML = function (r) {
    if (!r || !r.r) return '<span class="none">아직 기록하지 않았어요</span>';
    var b = u.esc(base(r));
    return (r.n ? b + '에서 <span class="dv ' + r.d + '">' + (r.d === 'L' ? '왼쪽' : '오른쪽') + ' ' + r.n + '칸</span>' : b + ' 그대로') + (r.p ? '<span class="pw">타격감 ' + u.pwText(r.p) + '</span>' : '');
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
