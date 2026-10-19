/* 화면 공통 부품: 알림창, 안내 문구, 머리글, 하단 메뉴, 숫자 키패드 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, $ = u.$, esc = u.esc;
  var ui = LZ.ui = {};
  LZ.screens = LZ.screens || {};
  LZ.S = LZ.S || { token: null, user: null, store: '제이드 양주점', logos: { dark: 'assets/logo-dark.png', light: 'assets/logo-light.png' } };

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
      function done(v) { if (div.parentNode) div.parentNode.removeChild(div); resolve(v); }
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

  ui.tag = function (usr) {
    if (!usr) return '';
    var l = usr.kind === 'op' ? '운영자' : usr.kind === 'fixed' ? '고정회원' : (usr.st === 'term_expired' ? '기간 끝남' : '기간회원 ' + u.dday(usr.left));
    return esc(usr.nick) + ' · ' + l;
  };
  ui.logo = function (slot) { return '<img src="' + esc(LZ.S.logos[slot]) + '" alt="레저로 스크린 파크골프">'; };
  ui.hdr = function (sub) {
    return '<header class="hd">' + ui.logo('dark') + '<div class="who">' + ui.tag(LZ.S.user) + '</div></header>' +
      '<div class="store"><b>' + esc(LZ.S.store) + '</b><span>' + esc(sub || '') + '</span></div>';
  };
  /* 안쪽 화면 머리글: ← 버튼, 제목, 오른쪽 문구 */
  ui.hdr2 = function (title, right, noBack) {
    return '<header class="hd2">' + (noBack ? '<span style="width:12px"></span>' : '<button class="bk" data-back aria-label="뒤로">←</button>') +
      '<span class="ttl">' + esc(title) + '</span>' + (right || '') + '</header><div class="store cp"><b>' + esc(LZ.S.store) + '</b><span>레저로 스크린 파크골프</span></div>';
  };

  var ICON = {
    courses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 21V3"/><path d="M7 4l10 3.5L7 11"/><ellipse cx="12" cy="21" rx="6" ry="1.4"/></svg>',
    members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14.5c2.5 0 4.5 1.6 4.5 4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>'
  };
  ui.icon = function (n) { return ICON[n] || ''; };
  ui.tabs = function (cur) {
    var list = [['courses', '코스']];
    if (LZ.S.user && LZ.S.user.kind === 'op') list.push(['members', '회원']);
    list.push(['settings', '설정']);
    return '<nav class="tabs" aria-label="주 메뉴">' + list.map(function (x) {
      return '<button data-tab="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '" ' + (x[0] === cur ? 'aria-current="page"' : '') + '>' + ICON[x[0]] + x[1] + '</button>';
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
      if (k === '지움') v = ''; else if (k === '←') v = v.slice(0, -1); else if (v.length < len) v += k;
      draw(); if (onChange) onChange(v);
    });
    return { get value() { return v; }, reset: function () { v = ''; draw(); if (onChange) onChange(v); } };
  };

  /* 서버 오류를 사람이 읽을 문구로 */
  ui.errText = function (e) { return e && e.isApi ? e.message : '문제가 생겼어요. 잠시 뒤에 다시 해 주세요.'; };
})();
