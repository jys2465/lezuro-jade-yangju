/* v3 화면: 닉네임 바꾸기 · 공지사항(보기·쓰기) · 현황판 · 지점 관리 · 활동 기록 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;

  /* ───── 닉네임 바꾸기: 모든 지점에서 하나뿐, 7일에 한 번, 예전 이름은 7일 동안 보호 ───── */
  LZ.screens.nick = {
    show: function (p, root) {
      var us = S.user, wait = us.nickNext && us.nickNext > Date.now(), first = us.kind === 'admin' && us.nick === '관리자';
      root.innerHTML = '<div class="scr">' + ui.hdr2('닉네임 바꾸기') + '<div class="bd nt">' +
        '<div class="ban">닉네임은 <b>모든 지점에서 하나뿐</b>이에요. <b>7일에 한 번</b> 바꿀 수 있고, 예전 닉네임은 7일 동안 다른 분이 쓸 수 없게 지켜 둬요. 기록·이용권·신뢰도는 그대로 이어져요.</div>' +
        '<div style="font-size:16px;margin:6px 0 4px">지금 닉네임: <b>' + esc(us.nick) + '</b></div>' +
        (first ? '<div class="ban r">처음 만든 관리자 계정은 닉네임을 바꿀 수 없어요.</div>'
          : wait ? '<div class="ban r">' + u.fmtDate(us.nickNext) + ' ' + new Date(us.nickNext).getHours() + '시부터 다시 바꿀 수 있어요.</div>'
            : '<label class="lbl" for="nn">새 닉네임 (한글·영문·숫자 2~8자)</label><input class="inp" id="nn" maxlength="8" autocomplete="off" placeholder="예: 다람쥐"><div class="msg" id="err" role="alert"></div>' +
              '<p class="hint">바꾸면 다음 로그인부터 새 닉네임으로 들어와요. 입금 확인을 기다리는 중에는 바꿀 수 없어요.</p><button class="btn" id="go" type="button">바꾸기</button>') + '</div></div>';
      var go = $('#go'); if (!go) return;
      LZ.guard = { kind: 'form', dirty: function () { var n = $('#nn'); return !!(n && n.value.trim()); }, body: '입력한 닉네임이 사라져요.' };
      go.onclick = async function () {
        var v = $('#nn').value.trim(), err = $('#err'); err.textContent = '';
        if (!/^[가-힣A-Za-z0-9]{2,8}$/.test(v)) { err.textContent = '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)'; return; }
        if (!(await ui.confirm('"' + v + '"(으)로 바꿀까요?', '바꾸면 7일 동안 다시 바꿀 수 없어요.', '바꾸기'))) return;
        ui.busy(true, '바꾸고 있어요…');
        try {
          var r = await LZ.api('setNick', { nick: v }, { retry: 0 }); ui.busy(false);
          S.user = Object.assign({}, S.user, r.user); u.store.set('lz.nick', r.user.nick); LZ.guard = null;
          try { history.replaceState(history.state, '', location.pathname + LZ.linkQuery(r.user.nick)); } catch (e) { /* 무시 */ }
          ui.toast('닉네임을 "' + r.user.nick + '"(으)로 바꿨어요.', 4000); LZ.go('settings', {}, { reset: true, skipGuard: true });
        } catch (e) { ui.busy(false); err.textContent = ui.errText(e); }
      };
    }
  };

  /* ───── 공지 내용 그리기: 그림 · 글(https 주소는 눌러서 열림) · 단추(앱 화면 또는 주소) ───── */
  var NT_TO = { join: '가입 화면', invite: '친구에게 알리기', pay: '이용권 결제', qna: '문의하기', notices: '공지 목록', courses: '코스 목록' };
  LZ.NT_TO = NT_TO;
  LZ.imgCache = {};
  LZ.imgSrc = async function (img) {
    if (!img) return '';
    if (/^assets\//.test(img)) return img;
    if (LZ.imgCache[img]) return LZ.imgCache[img];
    var r = await LZ.api('imgGet', { id: img }, { retry: 1 }); LZ.imgCache[img] = r.data; return r.data;
  };
  LZ.fillImgs = function (host) {
    $$('img[data-img]', host).forEach(function (im) {
      LZ.imgSrc(im.dataset.img).then(function (src) { im.src = src; im.removeAttribute('data-img'); }, function () { im.alt = '그림을 불러오지 못했어요'; im.classList.add('bad'); });
    });
  };
  LZ.linkify = function (html) {
    return String(html).replace(/(^|[\s>(])(https:\/\/[^\s<>"']+)/g, function (m, a, url) {
      var clean = url.replace(/[.,)]+$/, ''), tail = url.slice(clean.length);
      return a + '<a href="' + clean + '" target="_blank" rel="noopener noreferrer nofollow">' + clean + '</a>' + tail;
    });
  };
  LZ.noticeBody = function (n, noBtns) {
    return (n.img ? '<img class="ntpic" data-img="' + esc(n.img) + '" alt="' + esc(n.title) + '">' : '') +
      '<div class="rich">' + LZ.linkify(LZ.safeHtml(n.html)) + '</div>' +
      (!noBtns && n.btns && n.btns.length ? '<div class="ntbtns">' + n.btns.map(function (b, i) { return '<button type="button" class="btn ' + (i ? 'g' : '') + '" data-nto="' + esc(b.to) + '">' + esc(b.label) + (/^https:/.test(b.to) ? ' ↗' : '') + '</button>'; }).join('') + '</div>' : '');
  };
  LZ.goTo = function (to) {
    if (/^https:\/\//.test(to)) { window.open(to, '_blank', 'noopener'); return; }
    if (to === 'qna' && !(S.me && S.me.qnaOn)) { ui.toast('문의하기는 아직 준비 중이에요.'); return; }
    if (!NT_TO[to]) return;
    LZ.go(to, {}, to === 'courses' ? { reset: true } : {});
  };
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-nto]'); if (!b || !S.user) return; e.preventDefault(); LZ.goTo(b.dataset.nto); });

  /* ───── 공지사항 ───── */
  function ntMeta(n) {
    return '<span class="brtag" style="margin-left:0">' + esc(n.store) + '</span> ' + u.fmtDate(n.upd) + (n.start || n.end ? ' · 게시 ' + (n.start ? u.ymd(n.start) : '') + ' ~ ' + (n.end ? u.ymd(n.end) : '') : '') + (n.popup ? ' · 팝업' : '');
  }
  LZ.screens.notices = {
    show: async function (p, root, alive) {
      var manage = !!p.manage && ui.isStaff(), title = manage ? '공지 쓰기 · 관리' : '공지사항';
      root.innerHTML = '<div class="scr">' + ui.hdr2(title) + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('noticeList', manage ? { manage: 1 } : {}); if (!alive()) return;
      var open = {}, seen = u.store.getJSON('lz.ntSeen') || {};
      if (!manage) LZ.noticeMarkSeen(d.list);
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2(title) + '<div class="bd nt">' +
          (manage ? '<button class="btn" id="new" type="button" style="margin-bottom:10px">새 공지 쓰기</button><p class="hint" style="margin-top:0">' + (ui.isAdmin() ? '모든 지점 또는 한 지점에 올릴 수 있어요.' : '운영자는 소속 지점(' + esc(S.user.homeName || '') + ') 공지만 쓸 수 있어요.') + ' 게시 기간이 지난 공지도 여기에는 보여요.</p>'
            : '<p class="hint" style="margin-top:0">📍 ' + esc(S.store) + '와 모든 지점 공지가 보여요.</p>') +
          (d.list.map(function (n) {
            var isNew = !manage && seen[n.id] !== n.upd, on = open[n.id] || (!manage && d.list.length === 1);
            return '<div class="nt-item"><button class="nh" type="button" data-o="' + esc(n.id) + '">' + (n.pin ? '<span class="pinmark">📌 고정</span>' : '') + '<span style="flex:1">' + (isNew ? '<i class="dot"></i>' : '') + esc(n.title) + '<small style="display:block;font-size:12.5px;color:var(--mut);margin-top:3px">' + ntMeta(n) + '</small></span><span aria-hidden="true">' + (on ? '▴' : '▾') + '</span></button>' +
              (on ? '<div class="nb">' + LZ.noticeBody(n) + (manage && n.canEdit ? '<div style="display:flex;gap:6px;margin-top:10px"><button class="sm" data-e="' + esc(n.id) + '" type="button">고치기</button><button class="sm" data-d="' + esc(n.id) + '" type="button">지우기</button></div>' : '') + '<p class="hint" style="margin:8px 0 0">' + esc(n.by) + '</p></div>' : '') + '</div>';
          }).join('') || '<div class="ann">' + (manage ? '아직 쓴 공지가 없어요.' : '지금 올라온 공지가 없어요.') + '</div>') + '</div></div>';
        LZ.fillImgs(root);
        $$('[data-o]', root).forEach(function (b) { b.onclick = function () { open[b.dataset.o] = !open[b.dataset.o]; draw(); }; });
        var nb = $('#new', root); if (nb) nb.onclick = function () { LZ.go('noticeEdit', {}); };
        $$('[data-e]', root).forEach(function (b) { b.onclick = function () { LZ.go('noticeEdit', { item: d.list.filter(function (x) { return x.id === b.dataset.e; })[0], branches: d.branches }); }; });
        $$('[data-d]', root).forEach(function (b) {
          b.onclick = async function () {
            if (!(await ui.confirm('이 공지를 지울까요?', '지우면 되돌릴 수 없어요.', '지우기', true))) return;
            ui.busy(true, '지우고 있어요…');
            try { d = await LZ.api('noticeDel', { id: b.dataset.d }, { retry: 0 }); ui.busy(false); ui.toast('공지를 지웠어요'); draw(); }
            catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
          };
        });
      }
      draw();
    }
  };
  LZ.screens.noticeEdit = {
    show: function (p, root) {
      var it = p.item || {}, admin = ui.isAdmin(), brs = (p.branches || S.branches || []);
      var br = it.id ? it.br : (admin ? '' : S.user.home);
      root.innerHTML = '<div class="scr">' + ui.hdr2(it.id ? '공지 고치기' : '새 공지') + '<div class="bd nt">' +
        '<label class="lbl" style="margin-top:0">올릴 곳</label>' +
        (admin ? '<select class="inp" id="nb"><option value="">모든 지점</option>' + brs.map(function (b) { return '<option value="' + esc(b.code) + '"' + (b.code === br ? ' selected' : '') + '>' + esc(b.name) + (b.active ? '' : ' (닫힘)') + '</option>'; }).join('') + '</select>'
          : '<div style="font-size:16px"><b>' + esc(S.user.homeName || '') + '</b></div>') +
        '<label class="lbl" for="nt">제목 (40자까지)</label><input class="inp" id="nt" maxlength="40" value="' + esc(it.title || '') + '" placeholder="예: 10월 센서 교체 안내">' +
        '<label class="lbl">내용 (2000자까지) <span style="font-size:12px">— https:// 주소를 적으면 눌러서 열 수 있어요</span></label><div id="ed"></div>' +
        '<label class="lbl">그림 (1장, 선택)</label><div id="pic"></div>' +
        '<label class="lbl">단추 (2개까지, 선택) <span style="font-size:12px">— 누르면 앱 화면이나 주소로 가요</span></label><div id="bts"></div>' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:8px"><label class="lbl" style="margin:0;min-width:0">게시 시작일<input class="inp" id="ns" type="date" value="' + esc(it.start || '') + '"></label><label class="lbl" style="margin:0;min-width:0">게시 끝나는 날<input class="inp" id="ne" type="date" value="' + esc(it.end || '') + '"></label></div>' +
        '<p class="hint">비워 두면 바로 올라가고 계속 보여요.</p>' +
        '<label class="chk"><input type="checkbox" id="np"' + (it.pin ? ' checked' : '') + '> 맨 위에 고정</label>' +
        '<label class="chk"><input type="checkbox" id="nq"' + (it.popup ? ' checked' : '') + '> 앱을 열 때 팝업으로 한 번 보여 주기</label>' +
        '<div class="msg" id="err" role="alert"></div><button class="btn" id="save" type="button" style="margin-top:10px">' + (it.id ? '고친 내용 저장' : '공지 올리기') + '</button></div></div>';
      var ed = LZ.rich($('#ed'), { max: 2000, html: it.html || '', label: '공지 내용', placeholder: '공지 내용을 적어 주세요.' });
      var img = it.img || '', newData = '', btns = (it.btns || []).slice(0, 2).map(function (b) { return { label: b.label, to: b.to }; });
      while (btns.length < 2) btns.push({ label: '', to: '' });
      function picDraw() {
        $('#pic').innerHTML = (newData || img ? '<img class="ntpic" ' + (newData ? 'src="' + newData + '"' : 'data-img="' + esc(img) + '"') + ' alt="공지 그림">' : '') +
          '<div style="display:flex;gap:6px;flex-wrap:wrap"><label class="sm" style="cursor:pointer">' + (newData || img ? '다른 사진으로' : '사진 고르기') + '<input type="file" accept="image/png,image/jpeg,image/webp" id="pf" style="display:none"></label>' + (newData || img ? '<button class="sm" type="button" id="px">그림 빼기</button>' : '') + '</div>';
        LZ.fillImgs($('#pic'));
        $('#pf').onchange = async function () { var f = this.files[0]; if (!f) return; ui.busy(true, '사진을 줄이고 있어요…'); try { newData = await u.resizeImage(f, 1080, 440000); ui.busy(false); picDraw(); } catch (e) { ui.busy(false); ui.toast(e.message || '사진을 읽지 못했어요', 4500); } };
        var px = $('#px'); if (px) px.onclick = function () { newData = ''; img = ''; picDraw(); };
      }
      function btnDraw() {
        $('#bts').innerHTML = btns.map(function (b, i) {
          var url = /^https:/.test(b.to), sel = url ? 'url' : b.to;
          return '<div class="ntbe"><input class="inp" data-bl="' + i + '" maxlength="16" placeholder="단추 글자 (예: 친구에게 알리기)" value="' + esc(b.label) + '">' +
            '<select class="inp" data-bt="' + i + '"><option value="">— 단추 없음 —</option>' + Object.keys(NT_TO).map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>앱: ' + NT_TO[k] + '</option>'; }).join('') + '<option value="url"' + (sel === 'url' ? ' selected' : '') + '>인터넷 주소(https://)</option></select>' +
            '<input class="inp" data-bu="' + i + '" placeholder="https://…" value="' + esc(url ? b.to : '') + '" style="' + (sel === 'url' ? '' : 'display:none') + '"></div>';
        }).join('');
        $$('[data-bl]').forEach(function (x) { x.oninput = function () { btns[+x.dataset.bl].label = x.value; }; });
        $$('[data-bt]').forEach(function (x) { x.onchange = function () { var i = +x.dataset.bt, b = btns[i]; b.to = x.value === 'url' ? 'https://' : x.value; if (x.value && !b.label) b.label = x.value === 'url' ? '자세히 보기' : NT_TO[x.value]; btnDraw(); }; });
        $$('[data-bu]').forEach(function (x) { x.oninput = function () { btns[+x.dataset.bu].to = x.value.trim(); }; });
      }
      picDraw(); btnDraw();
      var orig = JSON.stringify([it.title || '', ed.value().html]);
      LZ.guard = { kind: 'form', dirty: function () { return JSON.stringify([$('#nt').value.trim(), ed.value().html]) !== orig || !!newData; }, body: '작성 중인 공지가 사라져요.' };
      $('#save').onclick = async function () {
        var err = $('#err'), v = ed.value(), title = $('#nt').value.trim(); err.textContent = '';
        if (!title) { err.textContent = '제목을 적어 주세요.'; return; }
        if (!v.text.trim()) { err.textContent = '내용을 적어 주세요.'; return; }
        if (ed.over()) { err.textContent = '내용이 2000자를 넘었어요.'; return; }
        var bl = btns.filter(function (b) { return b.to && b.to !== 'https://'; });
        for (var k = 0; k < bl.length; k++) { if (!bl[k].label.trim()) { err.textContent = '단추 글자를 적어 주세요.'; return; } if (!NT_TO[bl[k].to] && !/^https:\/\/[^\s<>"']{4,}$/.test(bl[k].to)) { err.textContent = '단추 주소는 https:// 로 시작해야 해요.'; return; } }
        var body = { id: it.id || '', br: admin ? $('#nb').value : S.user.home, title: title, html: v.html, start: $('#ns').value, end: $('#ne').value, pin: $('#np').checked ? 1 : 0, popup: $('#nq').checked ? 1 : 0, img: img, btns: bl };
        ui.busy(true, '저장하고 있어요…');
        try {
          if (newData) { ui.busy(true, '사진을 올리고 있어요…'); var up = await LZ.api('imgPut', { data: newData }, { retry: 0, timeout: 60000 }); body.img = up.id; LZ.imgCache[up.id] = newData; newData = ''; img = up.id; ui.busy(true, '저장하고 있어요…'); }
          await LZ.api('noticeSave', body, { retry: 0 }); ui.busy(false); LZ.guard = null;
          if (body.popup) { var pop = u.store.getJSON('lz.ntPop') || {}; u.store.setJSON('lz.ntPop', pop); }
          LZ.refreshMe(); ui.toast(it.id ? '공지를 고쳤어요' : '공지를 올렸어요'); history.back();
        } catch (e) { ui.busy(false); err.textContent = ui.errText(e); }
      };
    }
  };

  /* ───── 현황판 (관리자 첫 화면 · 운영자는 소속 지점, 결제 금액 제외) ───── */
  LZ.screens.dash = {
    show: async function (p, root, alive) {
      var admin = ui.isAdmin(), br = admin ? (u.store.get('lz.dashBr') || '') : '';
      root.innerHTML = '<div class="scr">' + ui.hdr('현황판') + '<div class="bd">' + ui.skeleton(4) + '</div>' + ui.tabs('dash') + '</div>';
      async function load() {
        var d = await LZ.api('dash', { br: br }); if (!alive()) return;
        LZ.refreshMe();
        var t = d.total || {};
        function kpi(n, label, sub, go) { return '<div' + (go ? ' role="button" tabindex="0" data-go="' + go + '"' : '') + '><b>' + n + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
        root.innerHTML = '<div class="scr">' + ui.hdr('현황판') + '<div class="bd">' +
          (admin ? '<div class="seg" id="dbr" style="margin-bottom:10px;flex-wrap:wrap">' + [['', '모든 지점']].concat((S.branches || []).map(function (b) { return [b.code, b.name]; })).map(function (f) { return '<button type="button" data-b="' + esc(f[0]) + '" class="' + (br === f[0] ? 'on' : '') + '" style="font-size:14px">' + esc(f[1]) + '</button>'; }).join('') + '</div>' : '<p class="hint" style="margin-top:0">📍 ' + esc(d.store) + ' 기준이에요.</p>') +
          '<div class="kpi">' +
          kpi(d.today, '오늘 들어온 회원', '접속 중 ' + d.seats.used + '명' + (d.seats.waiting ? ' · 대기 ' + d.seats.waiting : ''), 'members') +
          kpi(t.all || 0, '회원 (운영진 제외)', '체험 ' + (t.trial || 0) + ' · 월간 ' + (t.month || 0) + ' · 연간 ' + (t.year || 0) + ' · 끝남 ' + (t.expired || 0), 'members') +
          (admin ? kpi(u.won(d.month.net), d.month.label.replace('-', '년 ') + '월 결제', d.month.count + '건' + (d.month.refund ? ' · 환불 ' + u.won(d.month.refund) : ''), 'payments') + kpi(d.pending, '입금 확인 대기', d.pending ? '눌러서 확인하기' : '', 'payments') : '') +
          kpi(d.qnaOpen, '답할 문의', '', S.me && S.me.qnaOn ? 'qna' : '') +
          kpi(d.soon.length, '7일 안에 끝나는 회원', '', '') +
          kpi(d.joinsToday || 0, '오늘 직접 가입', '', 'members') +
          kpi(d.conv && d.conv.joined ? Math.round(d.conv.paid * 100 / d.conv.joined) + '%' : '-', '최근 30일 가입 → 결제', d.conv ? '가입 ' + d.conv.joined + '명(직접 ' + d.conv.self + ') · 결제 ' + d.conv.paid + '명' : '', '') +
          '</div>' +
          '<div class="blk"><h4>지점별 회원</h4><table class="tbl"><thead><tr><th>지점</th><th>체험</th><th>월간</th><th>연간</th><th>끝남</th><th>오늘</th></tr></thead><tbody>' +
          d.branches.map(function (r) { return '<tr><td>' + esc(r.name) + (r.active === 0 ? ' <span class="chip">닫힘</span>' : '') + '</td><td>' + r.trial + '</td><td>' + r.month + '</td><td>' + r.year + '</td><td>' + r.expired + '</td><td>' + r.today + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<div class="blk"><h4>7일 안에 끝나는 회원</h4>' + (d.soon.map(function (m) { return '<div class="row2" style="margin:0;padding:7px 0;border-top:1px solid var(--line2)"><span><b>' + esc(m.nick) + '</b> <span class="brtag">' + esc(m.homeName) + '</span><br><small class="hint" style="margin:0">' + esc(m.kindName) + ' · ' + u.ymd(m.end) + '까지</small></span><span class="chip ' + (m.left <= 1 ? 'r' : 'y') + '">' + (m.left <= 0 ? '오늘까지' : 'D-' + m.left) + '</span></div>'; }).join('') || '<p class="hint" style="margin:0">없어요.</p>') + '</div>' +
          '<div class="blk"><h4>최근 7일 가입</h4>' + (d.recent.map(function (m) { return '<div class="row2" style="margin:0;padding:7px 0;border-top:1px solid var(--line2)"><span><b>' + esc(m.nick) + '</b> <span class="brtag">' + esc(m.homeName) + '</span></span><small class="hint" style="margin:0">' + esc(m.kindName) + ' · ' + u.fmtDate(m.created) + '</small></div>'; }).join('') || '<p class="hint" style="margin:0">없어요.</p>') + '</div>' +
          '<button class="sm" id="rf" type="button">새로고침</button></div>' + ui.tabs('dash') + '</div>';
        $$('#dbr button', root).forEach(function (b) { b.onclick = function () { br = b.dataset.b; u.store.set('lz.dashBr', br); load().catch(function (e) { ui.toast(ui.errText(e), 4000); }); }; });
        $$('[data-go]', root).forEach(function (k) { var go = function () { LZ.go(k.dataset.go, k.dataset.go === 'qna' ? {} : {}, k.dataset.go === 'payments' ? {} : { reset: true }); }; k.onclick = go; k.onkeydown = function (e) { if (e.key === 'Enter') go(); }; });
        $('#rf', root).onclick = function () { load().then(function () { ui.toast('새로 불러왔어요', 1800); }, function (e) { ui.toast(ui.errText(e), 4000); }); };
      }
      await load();
    }
  };

  /* ───── 지점 관리 (관리자): 추가 · 이름 바꾸기 · 열기/닫기 ───── */
  LZ.screens.branches = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('지점 관리') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('branchList', {}); if (!alive()) return;
      function sync() { S.branches = d.branches.map(function (b) { return { code: b.code, name: b.name, active: b.active }; }); var c = S.branches.filter(function (b) { return b.code === LZ.branch; })[0]; if (c) LZ.setBranch(c.code, c.name); }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2('지점 관리') + '<div class="bd nt">' +
          '<div class="ban">지점은 서버 하나 안에서 나뉘어요. 지점마다 <b>기록</b>이 따로이고, 회원·이용권·코스 목록은 함께 써요. 회원이 문의(지점 추가 요청)를 남기면 여기서 만들어 주세요.</div>' +
          d.branches.map(function (b) {
            return '<div class="blk"><div class="row2" style="margin:0 0 8px"><span style="font-size:17px"><b>' + esc(b.name) + '</b> ' + (b.active ? '' : '<span class="chip r">닫힘</span>') + '</span><span class="hint" style="margin:0">회원 ' + b.members + '명</span></div>' +
              '<div class="hint" style="margin:0 0 8px">지점 코드 <b>' + esc(b.code) + '</b> · 초대 주소 끝 <b>?s=' + esc(b.code) + '</b></div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="sm" type="button" data-rn="' + esc(b.code) + '">이름 바꾸기</button><button class="sm" type="button" data-ac="' + esc(b.code) + '">' + (b.active ? '닫기' : '다시 열기') + '</button></div></div>';
          }).join('') +
          '<div class="blk"><h4>새 지점 만들기</h4><label class="lbl" for="bn" style="margin-top:0">지점 이름 (20자까지)</label><input class="inp" id="bn" maxlength="20" placeholder="예: 제이드 수유점">' +
          '<label class="lbl" for="bc">지점 코드 (영문 소문자·숫자 2~16자, 바꿀 수 없어요)</label><input class="inp" id="bc" maxlength="16" autocapitalize="none" autocomplete="off" placeholder="예: suyu">' +
          '<div class="msg" id="err" role="alert"></div><button class="btn" id="mk" type="button" style="margin-top:8px">지점 만들기</button></div></div></div>';
        $('#bc', root).oninput = function (e) { var v = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''); if (v !== e.target.value) e.target.value = v; };
        $('#mk', root).onclick = async function () {
          var name = $('#bn').value.trim(), code = $('#bc').value.trim(), err = $('#err'); err.textContent = '';
          if (!name) { err.textContent = '지점 이름을 적어 주세요.'; return; }
          if (!/^[a-z][a-z0-9]{1,15}$/.test(code)) { err.textContent = '지점 코드는 영문 소문자로 시작하는 2~16자로 적어 주세요. 예: suyu'; return; }
          if (d.branches.some(function (b) { return b.code === code; })) { err.textContent = '이미 있는 지점 코드예요.'; return; }
          if (!(await ui.confirm(name + ' 지점을 만들까요?', '지점 코드 "' + code + '"는 나중에 바꿀 수 없어요.', '만들기'))) return;
          ui.busy(true, '만들고 있어요…');
          try { d = await LZ.api('branchSave', { code: code, name: name, create: 1 }, { retry: 0 }); ui.busy(false); sync(); ui.toast(name + ' 지점을 만들었어요'); draw(); }
          catch (e) { ui.busy(false); err.textContent = ui.errText(e); }
        };
        $$('[data-rn]', root).forEach(function (b) {
          b.onclick = async function () {
            var br = d.branches.filter(function (x) { return x.code === b.dataset.rn; })[0];
            var v = await ui.dialog({ title: '지점 이름 바꾸기', html: '<input class="inp" id="rnv" maxlength="20" value="' + esc(br.name) + '" style="margin-bottom:12px">', cancel: null, collect: true, buttons: [{ label: '저장', kind: 'y', value: 'ok' }, { label: '취소', kind: 'g', value: null }] });
            var nv = v && v.v === 'ok' ? v.val.trim() : '';
            if (!nv || nv === br.name) return;
            ui.busy(true, '저장하고 있어요…');
            try { d = await LZ.api('branchSave', { code: br.code, name: nv }, { retry: 0 }); ui.busy(false); sync(); ui.toast('이름을 바꿨어요'); draw(); }
            catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
          };
        });
        $$('[data-ac]', root).forEach(function (b) {
          b.onclick = async function () {
            var br = d.branches.filter(function (x) { return x.code === b.dataset.ac; })[0], on = !br.active;
            if (!on && !(await ui.confirm(br.name + '을(를) 닫을까요?', '닫으면 회원이 이 지점을 고를 수 없어요. 기록은 지워지지 않고, 다시 열면 그대로 보여요.', '닫기', true))) return;
            ui.busy(true, '저장하고 있어요…');
            try { d = await LZ.api('branchSave', { code: br.code, name: br.name, active: on ? 1 : 0 }, { retry: 0 }); ui.busy(false); sync(); ui.toast(on ? '다시 열었어요' : '닫았어요'); draw(); }
            catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
          };
        });
      }
      draw();
    }
  };

  /* ───── 활동 기록 (관리자, 최근 100줄) ───── */
  LZ.screens.alog = {
    show: async function (p, root, alive) {
      var all = !!p.all;
      root.innerHTML = '<div class="scr">' + ui.hdr2('활동 기록') + '<div class="bd nt">' + ui.skeleton(4) + '</div></div>';
      var d = await LZ.api('log', { all: all ? 1 : 0 }); if (!alive()) return;
      root.innerHTML = '<div class="scr">' + ui.hdr2('활동 기록') + '<div class="bd nt">' +
        '<label class="chk"><input type="checkbox" id="la"' + (all ? ' checked' : '') + '> 로그인 기록도 보기</label>' +
        '<table class="tbl"><thead><tr><th>내용</th><th>때</th></tr></thead><tbody>' + d.list.map(function (x) {
          return '<tr><td><b>' + esc(x.nick) + '</b> · ' + esc(x.act) + (x.info ? '<br><small style="color:var(--mut)">' + esc(x.info) + '</small>' : '') + '</td><td>' + u.fmtDT(x.ts) + '</td></tr>';
        }).join('') + '</tbody></table>' + (d.list.length ? '' : '<div class="ann">기록이 없어요.</div>') + '</div></div>';
      $('#la', root).onchange = function (e) { LZ.go('alog', { all: e.target.checked ? 1 : 0 }, { replace: true }); };
    }
  };
})();
