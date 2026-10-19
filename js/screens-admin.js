/* 설정 · 회원 관리(운영자) · 매장 이름·로고(운영자) */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S, P = LZ.pwa;
  var VERSION = '1.0.0';
  LZ.appUrl = function () { return location.origin + location.pathname.replace(/index\.html$/, ''); };

  /* ───── 설정 ───── */
  LZ.screens.settings = {
    show: async function (p, root, alive) {
      var us = S.user, op = us.kind === 'op';
      function banner() {
        if (us.st === 'term_expired') return '<div class="ban r">이용 기간이 끝났어요. 내 기록 읽기만 할 수 있어요. 기간을 늘리려면 운영자에게 문의해 주세요.</div>';
        if (us.kind === 'term') return '<div class="ban">' + (us.left > 0 ? '이용 기간이 ' + us.left + '일 남았어요. (' + esc(us.end) + '까지)' : '이용 기간이 오늘까지예요.') + '</div>';
        return '';
      }
      var fs = u.store.get('lz.fs') || '0';
      root.innerHTML = '<div class="scr">' + ui.hdr('설정') + '<div class="bd">' + banner() +
        '<div class="blk"><h4>비밀번호</h4><button class="btn g" id="pw" type="button">비밀번호 바꾸기</button></div>' +
        '<div class="blk"><h4>글씨 크기</h4><div class="seg" id="fs">' + [['0', '보통'], ['1', '크게'], ['2', '아주 크게']].map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (fs === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div>' +
        (P.standalone() ? '' : '<div class="blk"><h4>홈 화면에 추가</h4><button class="btn g" id="inst" type="button">추가하는 방법 보기</button></div>') +
        '<div class="blk"><h4>내 기록 공개</h4><p class="hint" style="margin:-4px 0 8px">켜 두면 같은 코스를 쓰는 회원이 내 기록을 찾아서 볼 수 있어요. 기본은 공개예요.' + (us.st === 'term_expired' ? ' (이용 기간이 끝나서 지금은 다른 회원에게 보이지 않아요.)' : '') + '</p><div id="pubs">' + ui.skeleton(1) + '</div></div>' +
        (op ? '<div class="blk"><h4>매장 이름·로고</h4><button class="btn g" id="sys" type="button">바꾸기</button></div>' : '') +
        '<button class="btn g" id="out" type="button">로그아웃</button><p class="hint" style="text-align:center">앱 버전 ' + VERSION + ' · ' + esc(P.device) + '</p></div>' + ui.tabs('settings') + '</div>';
      $('#pw').onclick = function () { LZ.go('pin', {}); };
      $$('#fs button').forEach(function (b) { b.onclick = function () { u.store.set('lz.fs', b.dataset.f); LZ.applyFontSize(); $$('#fs button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      var i = $('#inst'); if (i) i.onclick = function () { LZ.go('install', {}); };
      var sy = $('#sys'); if (sy) sy.onclick = function () { LZ.go('system', {}); };
      $('#out').onclick = function () { LZ.logout(); };
      try {
        var cs = LZ.cache.courses || (await LZ.api('courses', {})).courses, pr = await LZ.api('prefs', {}); if (!alive()) return;
        LZ.cache.courses = cs;
        var mine = cs.filter(function (c) { return c.mine > 0; });
        $('#pubs').innerHTML = mine.map(function (c) {
          return '<div class="row2" style="margin:0;padding:8px 0;border-top:1px solid #EAECF2"><span style="font-size:16px;word-break:break-all">' + esc(c.name) + '</span><label class="sw"><input type="checkbox" data-c="' + esc(c.id) + '" ' + (pr.off.indexOf(c.id) >= 0 ? '' : 'checked') + ' aria-label="' + esc(c.name) + ' 공개"><i></i></label></div>';
        }).join('') || '<p class="hint" style="margin:0">기록을 남긴 코스가 여기에 나와요.</p>';
        $$('#pubs [data-c]').forEach(function (x) {
          x.onchange = async function () {
            try { await LZ.api('pub', { cid: x.dataset.c, pub: x.checked ? 1 : 0 }, { retry: 0 }); ui.toast(x.checked ? '이 코스 기록을 공개해요' : '이 코스 기록을 나만 볼 수 있어요', 2500); }
            catch (e) { x.checked = !x.checked; ui.toast(ui.errText(e), 4500); }
          };
        });
      } catch (e) { if (alive() && $('#pubs')) $('#pubs').innerHTML = '<p class="hint" style="margin:0">' + esc(ui.errText(e)) + '</p>'; }
    }
  };

  /* ───── 회원 관리 ───── */
  function inviteText(nick, pin) {
    return '[' + S.store + '] 파크골프 방향 기록장\n아래 주소를 눌러 들어오세요.\n' + LZ.appUrl() + '?u=' + encodeURIComponent(nick) + '\n닉네임: ' + nick + '\n처음 비밀번호: ' + pin + '\n처음 들어오면 나만의 비밀번호 4자리로 바꾸게 돼요.\n(카카오톡에서 열리면 오른쪽 위 ⋯ 메뉴의 "다른 브라우저로 열기"를 눌러 주세요.)';
  }
  var KIND = { fixed: '고정회원', term: '기간회원', op: '운영자' };
  function tag(m) { return m.kind === 'term' ? '기간회원 · ' + (m.left > 0 ? 'D-' + m.left : m.left === 0 ? '오늘까지' : '기간 끝남') : KIND[m.kind]; }

  LZ.screens.members = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr('회원 관리') + '<div class="bd">' + ui.skeleton(4) + '</div>' + ui.tabs('members') + '</div>';
      var list = (await LZ.api('members', {})).members; if (!alive()) return;
      var kind = 'fixed', days = 30, open = null, del = null, result = null;
      LZ.guard = { kind: 'form', dirty: function () { var n = $('#nn'); return !!(n && n.value.trim()); }, body: '입력 중인 닉네임이 사라져요.', discard: function () {} };
      function resultCard() {
        if (!result) return '';
        return '<div class="ban g" style="margin-top:12px"><b>' + esc(result.title) + '</b><br>처음 비밀번호는 <b style="font-size:22px;letter-spacing:4px">' + esc(result.pin) + '</b> 이에요. 이 화면을 닫으면 다시 볼 수 없어요.</div><div class="ann" id="inv">' + esc(inviteText(result.nick, result.pin)) + '</div>' +
          '<div style="display:grid;gap:8px"><button class="btn y" id="shr" type="button">카카오톡·문자로 보내기</button><button class="btn g" id="cpy" type="button">안내문 복사</button></div>';
      }
      function draw() {
        var me = S.user.nick.toLowerCase();
        root.innerHTML = '<div class="scr">' + ui.hdr('회원 관리') + '<div class="bd"><div class="blk"><h4>새 계정 만들기</h4><label class="lbl" for="nn" style="margin-top:0">닉네임 (한글·영문·숫자 2~8자)</label><input class="inp" id="nn" maxlength="8" autocomplete="off" placeholder="예: 다람쥐"><div class="msg" id="nnE" role="alert"></div>' +
          '<label class="lbl">회원 종류</label><div class="seg" id="kind">' + [['fixed', '고정회원'], ['term', '기간회원'], ['op', '운영자']].map(function (k) { return '<button type="button" data-k="' + k[0] + '" class="' + (kind === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>' +
          (kind === 'term' ? '<label class="lbl">이용 기간</label><div class="seg" id="days">' + [30, 90, 180].map(function (d) { return '<button type="button" data-d="' + d + '" class="' + (days === d ? 'on' : '') + '">' + d + '일</button>'; }).join('') + '</div>' : '') +
          '<p class="hint">처음 비밀번호는 자동으로 만들어져요.</p><button class="btn y" id="mk" type="button">계정 만들기</button>' + resultCard() + '</div>' +
          '<div class="hint" style="margin:6px 0">회원 ' + list.length + '명</div><div id="ml">' + list.map(function (m, i) {
            var self = m.nick.toLowerCase() === me;
            return '<div class="mem"><div class="top"><div class="av">' + esc(m.nick[0]) + '</div><div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:500;word-break:break-all">' + esc(m.nick) + (self ? ' (나)' : '') + '</div><span class="chip ' + (m.st === 'term_expired' ? 'r' : m.kind === 'term' ? 'y' : '') + '">' + tag(m) + '</span>' + (m.active ? '' : ' <span class="chip r">이용 중지</span>') + '</div>' + (self ? '' : '<button class="sm" type="button" data-mg="' + i + '">관리</button>') + '</div>' + (open === i ? panel(m, i) : '') + '</div>';
          }).join('') + '</div></div>' + ui.tabs('members') + '</div>';
        $$('#kind button').forEach(function (b) { b.onclick = function () { kind = b.dataset.k; keep(); }; });
        $$('#days button').forEach(function (b) { b.onclick = function () { days = +b.dataset.d; keep(); }; });
        $('#mk').onclick = create;
        $$('[data-mg]').forEach(function (b) { b.onclick = function () { open = open === +b.dataset.mg ? null : +b.dataset.mg; del = null; keep(); }; });
        $$('.mp [data-a]').forEach(function (b) { b.onclick = function () { act(+b.dataset.i, b.dataset.a, b.dataset.v); }; });
        var s = $('#shr'); if (s) s.onclick = async function () { var t = inviteText(result.nick, result.pin); if (!(await u.share(t, S.store))) { var ok = await u.copy(t); ui.toast(ok ? '안내문을 복사했어요. 카카오톡에 붙여 넣어 보내세요.' : '복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.', 4500); } };
        var c = $('#cpy'); if (c) c.onclick = async function () { var ok = await u.copy(inviteText(result.nick, result.pin)); ui.toast(ok ? '안내문을 복사했어요. 카카오톡에 붙여 넣어 보내세요.' : '복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.', 4500); };
      }
      function keep() { var v = $('#nn') ? $('#nn').value : ''; draw(); $('#nn').value = v; }
      function panel(m, i) {
        var b = function (a, v, label, cls) { return '<button type="button" class="' + (cls || '') + '" data-a="' + a + '" data-v="' + (v || '') + '" data-i="' + i + '">' + label + '</button>'; };
        var h = '<div class="mp">';
        ['fixed', 'term', 'op'].forEach(function (k) { if (m.kind !== k) h += b('kind', k, KIND[k] + '(으)로 바꾸기' + (k === 'term' ? ' (30일)' : '')); });
        if (m.kind === 'term') h += b('extend', '30', '기간 한 달 늘리기') + b('extend', '90', '기간 석 달 늘리기');
        h += b('pin', '', '비밀번호 다시 만들기') + b('active', m.active ? '0' : '1', m.active ? '이용 중지' : '이용 다시 시작');
        h += del === i ? b('delok', '', '정말 삭제할게요 (기록도 함께 지워져요)', 'dng') + b('delno', '', '취소') : b('del', '', '삭제', 'dng');
        return h + '</div>';
      }
      async function create() {
        var nick = $('#nn').value.trim(), e = $('#nnE'); e.textContent = ''; $('#nn').classList.remove('bad');
        if (!/^[가-힣A-Za-z0-9]{2,8}$/.test(nick)) { e.textContent = '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)'; $('#nn').classList.add('bad'); return; }
        ui.busy(true, '계정을 만들고 있어요…');
        try {
          var r = await LZ.api('mCreate', { nick: nick, kind: kind, days: days }, { retry: 0 });
          list.unshift(r.member); result = { nick: nick, pin: r.pin, title: nick + '님 계정을 만들었어요.' }; ui.busy(false); draw(); $('#nn').value = '';
          var rc = $('#inv'); if (rc) rc.scrollIntoView({ block: 'center' });
        } catch (er) { ui.busy(false); $('#nnE').textContent = ui.errText(er); $('#nn').classList.add('bad'); }
      }
      async function act(i, a, v) {
        var m = list[i];
        if (a === 'del') { del = i; return keep(); } if (a === 'delno') { del = null; return keep(); }
        var body = { nick: m.nick, op: a };
        if (a === 'kind') { body.kind = v; if (v === 'term') body.days = 30; if (!(await ui.confirm(m.nick + '님을 ' + KIND[v] + '(으)로 바꿀까요?', v === 'term' ? '오늘부터 30일 동안 쓸 수 있어요. 기간이 끝나면 읽기만 가능해요.' : '', '바꾸기'))) return; }
        else if (a === 'extend') body.days = +v;
        else if (a === 'pin') { if (!(await ui.confirm(m.nick + '님 비밀번호를 다시 만들까요?', '지금 로그인되어 있는 폰에서는 로그아웃돼요. 새 비밀번호를 알려 주셔야 해요.', '다시 만들기'))) return; }
        else if (a === 'active') { body.on = +v; if (!+v && !(await ui.confirm(m.nick + '님 이용을 중지할까요?', '로그인할 수 없고, 다른 회원에게 기록도 보이지 않아요.', '이용 중지', true))) return; }
        else if (a === 'delok') body.op = 'delete';
        ui.busy(true, '처리하고 있어요…');
        try {
          var r = await LZ.api('mUpdate', body, { retry: 0 }); ui.busy(false);
          if (body.op === 'delete') { list.splice(i, 1); open = null; del = null; ui.toast(m.nick + '님 계정을 지웠어요'); }
          else { list[i] = r.member; if (body.op === 'pin') { result = { nick: m.nick, pin: r.pin, title: m.nick + '님 비밀번호를 다시 만들었어요.' }; open = null; } else ui.toast('바꿨어요', 2500); }
          LZ.cache.courses = null; keep();
          if (result && body.op === 'pin') { var rc = $('#inv'); if (rc) rc.scrollIntoView({ block: 'center' }); }
        } catch (er) { ui.busy(false); ui.toast(ui.errText(er), 5000); }
      }
      draw();
    }
  };

  /* ───── 매장 이름 · 로고 ───── */
  LZ.screens.system = {
    show: function (p, root) {
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2('매장 이름·로고') + '<div class="bd nt"><div class="blk"><h4>매장 이름</h4><input class="inp" id="sn" maxlength="20" value="' + esc(S.store) + '" aria-label="매장 이름"><p class="hint">모든 화면 위쪽 노란 띠와 로그인 화면에 나와요.</p><button class="btn y sm2" id="sns" type="button">이름 저장</button></div>' +
          '<div class="blk"><h4>로고 바꾸기 <span class="chip y">모든 회원에게 적용</span></h4>' + ['dark', 'light'].map(function (slot) {
            return '<div class="logobox" style="' + (slot === 'light' ? 'margin-top:8px' : '') + '"><div class="tn" style="background:' + (slot === 'dark' ? '#111A39' : '#fff;border:1px solid #DDE0E8') + '"><img src="' + esc(S.logos[slot]) + '" alt=""></div><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:500">' + (slot === 'dark' ? '어두운 배경용' : '밝은 배경용') + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><label class="sm" style="cursor:pointer">파일 고르기<input type="file" accept="image/png,image/jpeg,image/webp" data-slot="' + slot + '" style="display:none"></label><button class="sm" type="button" data-reset="' + slot + '">처음 로고로</button></div></div></div>';
          }).join('') + '<p class="hint">어두운 배경용은 밝은 글자, 밝은 배경용은 어두운 글자의 로고를 올려 주세요. 큰 그림은 자동으로 줄여서 올려요.</p><div class="msg" id="err" role="alert"></div></div></div></div>';
        $('#sns').onclick = async function () {
          var v = $('#sn').value.trim(); if (!v) return ui.toast('매장 이름을 적어 주세요');
          ui.busy(true, '저장하고 있어요…');
          try { var r = await LZ.api('setCfg', { store: v }, { retry: 0 }); S.store = r.store; var c = u.store.getJSON('lz.cfg') || {}; c.store = r.store; u.store.setJSON('lz.cfg', c); ui.busy(false); ui.toast('매장 이름을 바꿨어요'); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
        };
        $$('input[type=file]').forEach(function (f) {
          f.onchange = async function () {
            var file = f.files[0]; if (!file) return; $('#err').textContent = '';
            ui.busy(true, '그림을 줄여서 올리고 있어요…');
            try {
              var data = await u.resizeImage(file, 640, 400000), r = await LZ.api('logoPut', { slot: f.dataset.slot, data: data }, { retry: 0, timeout: 60000 });
              S.logos[f.dataset.slot] = data; var c = u.store.getJSON('lz.cfg') || {}; c.logoVer = r.logoVer; c.logos = c.logos || {}; c.logos[f.dataset.slot] = data; u.store.setJSON('lz.cfg', c);
              ui.busy(false); ui.toast('로고를 바꿨어요. 모든 회원에게 적용돼요.', 4500); draw();
            } catch (e) { ui.busy(false); $('#err').textContent = ui.errText(e); }
          };
        });
        $$('[data-reset]').forEach(function (b) {
          b.onclick = async function () {
            if (!(await ui.confirm('처음 로고로 되돌릴까요?', '올려 둔 로고가 없어지고 기본 로고로 돌아가요.', '되돌리기'))) return;
            ui.busy(true, '되돌리고 있어요…');
            try {
              var r = await LZ.api('cfg', { lv: 0 }, { noAuth: true }); await LZ.api('logoReset', { slot: b.dataset.reset }, { retry: 0 });
              S.logos[b.dataset.reset] = 'assets/logo-' + b.dataset.reset + '.png'; var c = u.store.getJSON('lz.cfg') || {}; c.logoVer = (r.logoVer || 0) + 1; c.logos = c.logos || {}; c.logos[b.dataset.reset] = null; u.store.setJSON('lz.cfg', c);
              ui.busy(false); ui.toast('처음 로고로 되돌렸어요'); draw();
            } catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
          };
        });
      }
      draw();
    }
  };
})();
