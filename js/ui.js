/* 화면 공통 부품: 알림창, 안내 문구, 머리글, 하단 메뉴, 숫자 키패드 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, $ = u.$, esc = u.esc;
  var ui = LZ.ui = {};
  LZ.screens = LZ.screens || {};
  LZ.S = LZ.S || { token: null, user: null, store: '', logos: { dark: 'assets/logo-dark.png', light: 'assets/logo-light.png' } };

  var toastT;
  ui.toast = function (msg, ms) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 3500);
  };

  /* 큰 버튼이 세로로 쌓이는 알림창. 눌린 버튼의 value 를 돌려줌 */
  ui.dialog = function (o) {
    return new Promise(function (resolve) {
      var layer = $('#layer'), div = document.createElement('div');
      div.className = 'dlg'; div.setAttribute('role', 'dialog'); div.setAttribute('aria-modal', 'true');
      div.innerHTML = '<div class="box"><h3>' + esc(o.title || '') + '</h3>' + (o.body ? '<p>' + esc(o.body) + '</p>' : '') + (o.html || '') + '<div class="btns">' +
        (o.buttons || [{ label: '확인', value: true }]).map(function (b, i) { return '<button class="btn ' + (b.kind || 'g') + '" data-i="' + i + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
      layer.appendChild(div);
      function done(v) { if (o.collect) { var inp = div.querySelector('input,select,textarea'); v = { v: v, val: inp ? inp.value : '' }; } if (div.parentNode) div.parentNode.removeChild(div); resolve(v); }
      div.addEventListener('click', function (e) {
        var b = e.target.closest('[data-i]');
        if (b) return done((o.buttons || [{ value: true }])[+b.dataset.i].value);
        if (e.target === div && o.dismiss !== false) done(o.cancel === undefined ? null : o.cancel);
      });
      var first = div.querySelector('button'); if (first) first.focus();
    });
  };
  ui.confirm = function (title, body, okLabel, danger) {
    return ui.dialog({ title: title, body: body, cancel: false, buttons: [{ label: okLabel || '확인', kind: danger ? 'r' : 'y', value: true }, { label: '취소', kind: 'g', value: false }] });
  };

  var busyEl = null;
  ui.busy = function (on, text) {
    if (!on) { if (busyEl && busyEl.parentNode) busyEl.parentNode.removeChild(busyEl); busyEl = null; return; }
    if (busyEl) { busyEl.querySelector('p').textContent = text || '잠시만요…'; return; }
    busyEl = document.createElement('div'); busyEl.className = 'dlg'; busyEl.style.alignItems = 'center';
    busyEl.innerHTML = '<div class="box" style="border-radius:20px;max-width:300px;text-align:center;padding:26px 18px"><div class="spin" style="margin:0 auto 12px"></div><p style="margin:0">' + esc(text || '잠시만요…') + '</p></div>';
    $('#layer').appendChild(busyEl);
  };

  ui.skeleton = function (n) { var s = ''; for (var i = 0; i < (n || 4); i++) s += '<div class="sk"></div>'; return s; };
  ui.errorBlock = function (msg) {
    return '<div class="err"><p>' + esc(msg) + '</p><button class="btn" data-retry style="max-width:260px;margin:0 auto">다시 시도</button></div>';
  };

  ui.isStaff = function (usr) { usr = usr || LZ.S.user; return !!usr && (usr.kind === 'admin' || usr.kind === 'op'); };
  ui.isAdmin = function (usr) { usr = usr || LZ.S.user; return !!usr && usr.kind === 'admin'; };
  ui.expired = function () { return !!LZ.S.user && LZ.S.user.st === 'expired'; };
  /* 등급 이름 + 남은 날 */
  ui.kindLabel = function (m) {
    if (!m) return '';
    var n = m.kindName || { admin: '관리자', op: '운영자', trial: '체험회원', month: '월간회원', year: '연간회원' }[m.kind] || m.kind;
    if (m.kind === 'admin' || m.kind === 'op') return n;
    if (m.st === 'expired') return n + ' · 기간 끝남';
    return n + ' · ' + u.dday(m.left);
  };
  /* 머리글 오른쪽: 첫 줄 닉네임(굵게), 둘째 줄 회원 종류 · D-남은 날 */
  ui.tag = function (usr) { return usr ? '<b>' + esc(usr.nick) + '</b><span>' + esc(ui.kindLabel(usr)) + '</span>' : ''; };
  /* ───── 화면 모드: 'light' 밝게, 'dark' 어둡게, 'auto' 휴대폰 설정대로(처음 값) ───── */
  var T = LZ.theme = {
    mode: function () { var m = u.store.get('lz.theme'); return m === 'light' || m === 'dark' ? m : 'auto'; },
    sysDark: function () { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); },
    isDark: function () { var m = T.mode(); return m === 'dark' || (m === 'auto' && T.sysDark()); },
    apply: function () {
      var d = T.isDark(); document.documentElement.dataset.theme = d ? 'dark' : 'light';
      var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = d ? '#17191E' : '#FFFFFF';
      Array.prototype.forEach.call(document.querySelectorAll('img[data-logo]'), function (im) { im.src = ui.logoSrc(); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-thm]'), function (b) { b.innerHTML = ui.themeIcon(); b.setAttribute('aria-label', d ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기'); });
    },
    set: function (m) { if (m === 'auto') u.store.del('lz.theme'); else u.store.set('lz.theme', m); T.apply(); },
    toggle: function () { T.set(T.isDark() ? 'light' : 'dark'); }
  };
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); var onSys = function () { if (T.mode() === 'auto') T.apply(); }; if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys); }
  ui.themeIcon = function () {
    return T.isDark()
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  };
  ui.themeBtn = function () { var d = T.isDark(); return '<button type="button" class="thm" data-thm aria-label="' + (d ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기') + '">' + ui.themeIcon() + '</button>'; };

  /* 로고: 화면 모드에 맞는 그림(어두운 화면이면 dark) */
  ui.logoSrc = function () { return LZ.S.logos[T.isDark() ? 'dark' : 'light'] || LZ.S.logos.light; };
  ui.logo = function () { return '<img data-logo src="' + esc(ui.logoSrc()) + '" alt="파크골프 공략노트">'; };
  /* 지점 띠: 모든 화면 위쪽에 지금 지점(누르면 지점 바꾸기) */
  ui.band = function (sub) {
    var nm = LZ.S.store || '지점';
    return '<div class="store"><button type="button" class="brb" data-branch aria-label="지금 지점 ' + esc(nm) + ', 눌러서 지점 바꾸기"><b>📍 ' + esc(nm) + '</b><i aria-hidden="true">▾</i></button><span>' + esc(sub || '파크골프 공략노트') + '</span></div>';
  };
  ui.hdr = function (sub) {
    return '<header class="hd">' + ui.logo() + '<div class="rt"><div class="who">' + ui.tag(LZ.S.user) + '</div>' + ui.themeBtn() + '</div></header>' + ui.band(sub);
  };
  /* 안쪽 화면 머리글: ← 버튼, 제목, 오른쪽 문구 */
  ui.hdr2 = function (title, right, noBack) {
    return '<header class="hd2">' + (noBack ? '<span style="width:12px"></span>' : '<button class="bk" data-back aria-label="뒤로">←</button>') +
      '<span class="ttl">' + esc(title) + '</span>' + (right || '') + ui.themeBtn() + '<span style="width:6px"></span></header>' + (LZ.S.user ? ui.band() : '');
  };

  var ICON = {
    dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V11M10 20V5M16 20v-7M22 20H2"/></svg>',
    qna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M9 9.5h6M9 12.5h4"/></svg>',
    courses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21V3"/><path d="M7 4l10 3.5L7 11"/><ellipse cx="12" cy="21" rx="6" ry="1.4"/></svg>',
    members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14.5c2.5 0 4.5 1.6 4.5 4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>'
  };
  ui.icon = function (n) { return ICON[n] || ''; };
  ui.tabs = function (cur) {
    var me = LZ.S.me || {}, staff = ui.isStaff(), q = me.qnaOn && me.qna > 0 ? me.qna : 0, nt = LZ.noticeUnread ? LZ.noticeUnread() : 0;
    var list = [['courses', '코스']];
    if (staff) list.push(['dash', '현황']);
    if (staff) list.push(['members', '회원']);
    if (staff && me.qnaOn) list.push(['qna', '문의']);                       // 운영진: 답할 문의 수
    list.push(['settings', '설정']);                                         // 회원: 답변 온 문의 + 안 읽은 공지
    return '<nav class="tabs" aria-label="주 메뉴">' + list.map(function (x) {
      var n = x[0] === 'qna' ? q : x[0] === 'settings' ? (staff ? 0 : q) + nt : 0;
      var bd = n ? '<i class="bdg" aria-label="' + n + '건">' + (n > 99 ? '99+' : n) + '</i>' : '';
      return '<button data-tab="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '" ' + (x[0] === cur ? 'aria-current="page"' : '') + '><span class="ti">' + ICON[x[0]] + bd + '</span>' + x[1] + '</button>';
    }).join('') + '</nav>';
  };

  /* 숫자 키패드(휴대폰 기본 키보드 대신 큰 버튼) */
  ui.keypad = function (host, len, onChange) {
    var v = '', keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '지움', '0', '←'];
    host.innerHTML = '<div class="dots" role="img" aria-label="비밀번호 입력 칸"></div><div class="pad">' + keys.map(function (k) {
      return '<button type="button" class="' + (k.length > 1 || k === '←' ? 'sub' : '') + '" data-k="' + k + '" aria-label="' + (k === '←' ? '한 자 지우기' : k === '지움' ? '모두 지우기' : k) + '">' + k + '</button>';
    }).join('') + '</div>';
    var dots = $('.dots', host);
    function draw() { var s = ''; for (var i = 0; i < len; i++) s += '<i class="' + (i < v.length ? 'f' : '') + '"></i>'; dots.innerHTML = s; }
    draw();
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b) return;
      var k = b.dataset.k;
      if (k === '지움') v = ''; else if (k === '←') v = v.slice(0, -1); else if (v.length < len) v += k; else { u.buzz('edge'); return; }
      u.buzz(v.length === len && k.length === 1 ? 'ok' : '');
      draw(); if (onChange) onChange(v);
    });
    return { get value() { return v; }, get len() { return len; }, reset: function () { v = ''; draw(); if (onChange) onChange(v); }, setLen: function (n) { len = n; v = v.slice(0, n); draw(); } };
  };

  /* 화면 꺼짐 방지 안내 띠 */
  ui.wakeBan = function (host) {
    if (!host) return;
    LZ.wake.onchange = function (m) {
      if (!host.isConnected) return;
      if (m === 'lock' || m === 'video') { host.style.display = 'block'; host.className = 'ban g'; host.textContent = '이 코스를 보는 동안 휴대폰 화면이 꺼지지 않아요.'; }
      else if (m === 'none') { host.style.display = 'block'; host.className = 'ban'; host.textContent = '이 휴대폰에서는 화면 꺼짐 방지가 안 될 수 있어요. 휴대폰 설정에서 "화면 자동 꺼짐" 시간을 길게 해 주세요.'; }
      else host.style.display = 'none';
    };
    LZ.wake.onchange(LZ.wake.mode);
  };
  /* 되돌리기 단추가 있는 알림 */
  ui.toastUndo = function (msg, label, fn, ms) {
    var t = $('#toast'); if (!t) return;
    t.innerHTML = esc(msg) + ' <button type="button">' + esc(label || '되돌리기') + '</button>'; t.classList.add('on'); clearTimeout(toastT);
    $('button', t).onclick = function () { t.classList.remove('on'); fn(); };
    toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 8000);
  };

  /* 서버 오류를 사람이 읽을 문구로 */
  ui.errText = function (e) { return e && e.isApi ? e.message : '문제가 생겼어요. 잠시 뒤에 다시 해 주세요.'; };
})();
