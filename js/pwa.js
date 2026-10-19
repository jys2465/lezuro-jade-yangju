/* 홈 화면 추가 · 카카오톡 같은 앱 안 브라우저 처리 · 화면 꺼짐 방지 · 서비스 워커 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, P = LZ.pwa = {};
  var ua = navigator.userAgent || '';

  P.isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  P.isAndroid = /Android/i.test(ua);
  P.isSamsung = /SamsungBrowser/i.test(ua);
  P.device = P.isIOS ? '아이폰' : P.isAndroid ? '안드로이드' : '컴퓨터';
  P.standalone = function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; };
  P.inApp = function () {
    if (/KAKAOTALK/i.test(ua)) return 'kakao';
    if (/NAVER\(inapp/i.test(ua)) return 'naver';
    if (/DaumApps/i.test(ua)) return 'daum';
    if (/Line\//i.test(ua)) return 'line';
    if (/FBAN|FBAV|Instagram/i.test(ua)) return 'sns';
    return null;
  };
  /* 앱 안 브라우저에서 기본 브라우저(크롬·삼성인터넷·사파리)로 다시 열기 */
  P.externalUrl = function () {
    var url = location.href;
    if (/KAKAOTALK/i.test(ua)) return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    if (P.isAndroid) return 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=' + location.protocol.replace(':', '') + ';package=com.android.chrome;end';
    return '';
  };
  P.openExternal = function () { var x = P.externalUrl(); if (!x) return false; location.href = x; return true; };

  /* 안드로이드: 버튼 한 번으로 홈 화면에 추가 */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (P.onready) P.onready(); });
  window.addEventListener('appinstalled', function () { deferred = null; u.store.set('lz.installed', '1'); if (P.onready) P.onready(); });
  P.canPrompt = function () { return !!deferred; };
  P.prompt = function () {
    if (!deferred) return Promise.resolve(false);
    var d = deferred; deferred = null;
    d.prompt();
    return d.userChoice.then(function (r) { return r && r.outcome === 'accepted'; }, function () { return false; });
  };

  /* 서비스 워커(앱 껍데기 저장) + 새 버전 알림 */
  P.registerSW = function (onUpdate) {
    if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.protocol + '//' + location.hostname)) return;
    var had = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloaded || !had) return; reloaded = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function offer(w) { onUpdate && onUpdate(function () { w.postMessage({ type: 'SKIP_WAITING' }); }); }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      setInterval(function () { reg.update().catch(function () { /* 오프라인 */ }); }, 3600000);
    }).catch(function (e) { console.warn('서비스 워커 등록 실패', e); });
  };

  /* ───── 화면 꺼짐 방지 (홀 편집 화면에서만 켬) ─────
   * 1순위: 화면 켜짐 유지 기능(Wake Lock). 2순위/아이폰 보조: 보이지 않는 짧은 영상을 계속 재생.
   * 앱을 다른 화면으로 옮겼다가 돌아오면 자동으로 다시 켭니다. */
  var W = LZ.wake = { mode: 'off', onchange: null };
  var want = false, lock = null, vid = null, tick = null;
  function setMode(m) { if (W.mode !== m) { W.mode = m; if (W.onchange) W.onchange(m); } }
  function stopVideo() { if (vid) { try { vid.pause(); } catch (e) { /* 무시 */ } if (vid.parentNode) vid.parentNode.removeChild(vid); vid = null; } }
  function startVideo() {
    if (vid) return Promise.resolve(true);
    var v = document.createElement('video');
    v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.loop = true; v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.02;pointer-events:none;z-index:-1';
    var s1 = document.createElement('source'); s1.src = 'assets/nosleep.mp4'; s1.type = 'video/mp4';
    var s2 = document.createElement('source'); s2.src = 'assets/nosleep.webm'; s2.type = 'video/webm';
    v.appendChild(s1); v.appendChild(s2); document.body.appendChild(v); vid = v;
    var pr; try { pr = v.play(); } catch (e) { pr = Promise.reject(e); }
    return Promise.resolve(pr).then(function () { return true; }, function () { stopVideo(); return false; });
  }
  function acquire() {
    if (!want) return Promise.resolve();
    var tasks = [];
    if (navigator.wakeLock && !lock) {
      tasks.push(navigator.wakeLock.request('screen').then(function (l) {
        lock = l;
        l.addEventListener('release', function () { lock = null; if (want && document.visibilityState === 'visible') acquire(); else if (want) refresh(); });
        return true;
      }, function () { return false; }));
    } else tasks.push(Promise.resolve(!!lock));
    return Promise.all(tasks).then(function (r) {
      var gotLock = !!lock;
      if (!gotLock || P.isIOS) return startVideo().then(function (okV) { setMode(gotLock || okV ? (gotLock ? 'lock' : 'video') : 'none'); });
      stopVideo(); setMode('lock');
    });
  }
  function refresh() { setMode(lock ? 'lock' : (vid ? 'video' : (want ? 'none' : 'off'))); }
  W.on = function () {
    want = true; acquire();
    clearInterval(tick); tick = setInterval(function () { if (want && document.visibilityState === 'visible' && !lock && !vid) acquire(); }, 20000);
  };
  W.off = function () {
    want = false; clearInterval(tick);
    if (lock) { try { lock.release(); } catch (e) { /* 무시 */ } lock = null; }
    stopVideo(); setMode('off');
  };
  document.addEventListener('visibilitychange', function () { if (want && document.visibilityState === 'visible') { lock = null; acquire(); } });
  window.addEventListener('pageshow', function () { if (want) acquire(); });
})();
