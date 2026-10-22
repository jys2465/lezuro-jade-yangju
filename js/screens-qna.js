/* 문의하기: 글자 꾸미기 편집기 · 자주 묻는 질문(FAQ) · 1:1 문의 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;
  var CAT = { pay: '결제·이용권', course: '코스 정보 수정 요청', app: '앱 사용·오류', acct: '계정·비밀번호', branch: '지점 추가 요청', nick: '닉네임 확인 요청', etc: '기타' };
  var CAT_HINT = { pay: '관리자가 답변해요', course: '코스 이름·파·거리가 틀렸을 때', app: '화면이 이상하거나 잘 안 될 때', acct: '닉네임·비밀번호', branch: '다니는 매장이 목록에 없을 때 (관리자가 답변해요)', nick: '내 닉네임을 다른 분이 쓰고 있을 때 (관리자가 답변해요)', etc: '그 밖의 모든 것' };
  var ST = { open: ['답변 기다리는 중', 'y'], answered: ['답변 완료', 'gr'], closed: ['종료', ''] };
  var ST_STAFF = { open: ['답변 필요', 'r'], answered: ['답변 완료', 'gr'], closed: ['종료', ''] };

  /* ───── 안전한 글자 꾸미기: 굵게 <b>, 크게 <span class="big">, 색 <span class="c-r|c-b|c-g">, 줄바꿈 <br> 만 ───── */
  LZ.safeHtml = function (h) {
    h = String(h || ''); var out = '', re = /<[^>]*>/g, last = 0, m, open = [];
    function text(t) { return t.replace(/&(?!(amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/[<>"]/g, function (c) { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'; }); }
    while ((m = re.exec(h))) {
      out += text(h.slice(last, m.index)); last = re.lastIndex;
      var tag = m[0].toLowerCase().replace(/\s+/g, ' ');
      if (tag === '<br>') out += '<br>';
      else if (tag === '<b>') { out += '<b>'; open.push('b'); }
      else if (/^<span class="(big|c-r|c-b|c-g)">$/.test(tag)) { out += tag; open.push('span'); }
      else if ((tag === '</b>' || tag === '</span>') && open.length && open[open.length - 1] === (tag === '</b>' ? 'b' : 'span')) { open.pop(); out += tag; }
    }
    out += text(h.slice(last));
    while (open.length) out += open.pop() === 'b' ? '</b>' : '</span>';
    return out;
  };
  function nearColor(c) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); if (!m) { m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); if (m) m = [0, parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; }
    if (!m) return ''; var r = +m[1], g = +m[2], b = +m[3];
    if (r > 150 && r > g + 60 && r > b + 60) return 'c-r';
    if (b > 120 && b > r + 40 && b >= g) return 'c-b';
    if (g > 100 && g > r + 30 && g > b) return 'c-g';
    return '';
  }
  /* 편집기 안의 내용(브라우저가 만든 태그)을 허용된 모양으로 바꿈 */
  function serialize(root) {
    var runs = [];
    function walk(n, f) {
      if (n.nodeType === 3) { if (n.nodeValue) runs.push({ t: n.nodeValue.replace(/ /g, ' '), b: f.b, big: f.big, c: f.c }); return; }
      if (n.nodeType !== 1) return;
      var tg = n.tagName, st = n.style || {}, g = { b: f.b, big: f.big, c: f.c };
      if (tg === 'BR') { runs.push({ nl: 1 }); return; }
      if (tg === 'B' || tg === 'STRONG' || parseInt(st.fontWeight, 10) >= 600 || st.fontWeight === 'bold') g.b = true;
      if (st.fontWeight === 'normal' || st.fontWeight === '400') g.b = false;
      if ((tg === 'FONT' && +n.getAttribute('size') >= 4) || /large|x-large|xx-large/.test(st.fontSize || '') || (n.classList && n.classList.contains('big'))) g.big = true;
      var col = (tg === 'FONT' && n.getAttribute('color')) || st.color;
      if (col) g.c = nearColor(col);
      if (n.classList) ['c-r', 'c-b', 'c-g'].forEach(function (k) { if (n.classList.contains(k)) g.c = k; });
      var block = /^(DIV|P|LI|H\d)$/.test(tg);
      if (block && runs.length && !runs[runs.length - 1].nl) runs.push({ nl: 1 });
      for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i], g);
    }
    for (var i = 0; i < root.childNodes.length; i++) walk(root.childNodes[i], {});
    var out = '', plain = '';
    runs.forEach(function (r) {
      if (r.nl) { out += '<br>'; plain += '\n'; return; }
      var t = esc(r.t).replace(/&#39;/g, "'"); plain += r.t;
      if (r.b) t = '<b>' + t + '</b>'; if (r.big) t = '<span class="big">' + t + '</span>'; if (r.c) t = '<span class="' + r.c + '">' + t + '</span>';
      out += t;
    });
    out = out.replace(/(<\/b>)<b>/g, '').replace(/^(<br>)+|(<br>)+$/g, '');
    return { html: LZ.safeHtml(out), text: plain.replace(/^\n+|\n+$/g, '') };
  }
  /* 편집기: 굵게 · 크게 · 빨강 · 파랑 · 초록 · 보통 글자 */
  LZ.rich = function (host, o) {
    o = o || {}; var max = o.max || 500;
    host.innerHTML = '<div class="rtb" role="toolbar" aria-label="글자 꾸미기">' +
      '<button type="button" data-x="b" aria-label="굵게"><b>굵게</b></button><button type="button" data-x="big" aria-label="크게"><span style="font-size:1.15em">크게</span></button>' +
      '<button type="button" data-x="c-r" aria-label="빨간 글자"><span class="c-r">빨강</span></button><button type="button" data-x="c-b" aria-label="파란 글자"><span class="c-b">파랑</span></button><button type="button" data-x="c-g" aria-label="초록 글자"><span class="c-g">초록</span></button>' +
      '<button type="button" data-x="plain" aria-label="꾸미기 지우기">보통</button></div>' +
      '<div class="red rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="' + esc(o.label || '내용') + '" data-ph="' + esc(o.placeholder || '') + '"></div><div class="rcnt"></div>';
    var ed = $('.red', host), cnt = $('.rcnt', host);
    if (o.html) ed.innerHTML = LZ.safeHtml(o.html);
    function count() { var n = serialize(ed).text.length; cnt.textContent = n + '/' + max + '자'; cnt.classList.toggle('bad', n > max); ed.classList.toggle('empty', !ed.textContent.trim()); if (o.onChange) o.onChange(); }
    ed.addEventListener('input', count);
    ed.addEventListener('paste', function (e) {                                  // 붙여 넣을 때는 글자만
      e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    ed.addEventListener('drop', function (e) { e.preventDefault(); });          // 끌어다 놓기도 막음(글자만 쓰기)
    var COL = { 'c-r': '#D40E1A', 'c-b': '#1F5FD1', 'c-g': '#1E8A43' };
    $$('.rtb [data-x]', host).forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });        // 누를 때 선택한 글자가 풀리지 않게
      b.addEventListener('click', function (e) {
        e.preventDefault(); ed.focus(); var x = b.dataset.x;
        try { document.execCommand('styleWithCSS', false, false); } catch (er) { /* 무시 */ }
        if (x === 'b') document.execCommand('bold');
        else if (x === 'big') { var sel = window.getSelection(), cur = sel && sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : sel.anchorNode); var isBig = cur && cur.closest && cur.closest('font[size="5"], .big'); document.execCommand('fontSize', false, isBig ? '3' : '5'); }
        else if (COL[x]) document.execCommand('foreColor', false, COL[x]);
        else if (x === 'plain') document.execCommand('removeFormat');
        count();
      });
    });
    count();
    return {
      value: function () { return serialize(ed); },
      dirty: function () { return !!ed.textContent.trim(); },
      clear: function () { ed.innerHTML = ''; count(); },
      focus: function () { ed.focus(); },
      over: function () { return serialize(ed).text.length > max; }
    };
  };

  function when(ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function setBadge(n) { if (typeof n === 'number') S.me = Object.assign({}, S.me, { qna: n }); }
  function staff() { return ui.isStaff(); }

  /* ───── 문의하기: [자주 묻는 질문] [내 문의 / 문의 목록] ───── */
  LZ.screens.qna = {
    show: async function (p, root, alive) {
      var tab = p.tab || (staff() ? 'list' : 'faq'), filt = staff() ? 'open' : 'all', open = {};
      var asTab = staff() && !p.fromSettings;
      function frame(inner) {
        return '<div class="scr">' + (asTab ? ui.hdr('문의') : ui.hdr2('문의하기')) + '<div class="bd' + (asTab ? '' : ' nt') + '">' +
          '<div class="seg" id="qt" style="margin-bottom:10px"><button type="button" data-t="faq" class="' + (tab === 'faq' ? 'on' : '') + '">자주 묻는 질문</button><button type="button" data-t="list" class="' + (tab === 'list' ? 'on' : '') + '">' + (staff() ? '문의 목록' : '내 문의') + '</button></div>' +
          inner + '</div>' + (asTab ? ui.tabs('qna') : '') + '</div>';
      }
      root.innerHTML = frame(ui.skeleton(3));
      var faq = null, list = null;
      async function loadTab() {
        if (tab === 'faq' && !faq) faq = await LZ.api('faqList', {});
        if (tab === 'list' && !list) { var r = await LZ.api('qnaList', {}); list = r.list; setBadge(r.badge); }
      }
      function faqHtml() {
        return (faq.canEdit ? '<button class="btn g sm2" id="fadd" type="button" style="margin-bottom:10px">질문 추가 (관리자)</button>' : '') +
          (faq.faq.map(function (f, i) {
            return '<div class="faq' + (open[f.id] ? ' on' : '') + '"><button type="button" class="fq" data-f="' + esc(f.id) + '" aria-expanded="' + !!open[f.id] + '"><span>Q.</span>' + esc(f.q) + '</button>' +
              (open[f.id] ? '<div class="fa rich">' + LZ.safeHtml(f.a) + '</div>' + (faq.canEdit ? '<div class="fe"><button class="sm" data-fe="' + esc(f.id) + '" type="button">고치기</button><button class="sm" data-fm="' + esc(f.id) + '" data-d="-1" type="button"' + (i ? '' : ' disabled') + '>위로</button><button class="sm" data-fm="' + esc(f.id) + '" data-d="1" type="button"' + (i < faq.faq.length - 1 ? '' : ' disabled') + '>아래로</button></div>' : '') : '') + '</div>';
          }).join('') || '<div class="ann">아직 등록된 질문이 없어요.</div>') +
          (staff() ? '' : '<div class="ban b" style="margin-top:12px">찾는 답이 없나요? <button class="sm" id="ask2" type="button" style="margin-top:6px">1:1 문의하기</button></div>');
      }
      function listHtml() {
        var l = list.filter(function (x) { return filt === 'all' || x.status === filt; }), S2 = staff() ? ST_STAFF : ST;
        return (staff() ? '<div class="seg" id="qf" style="margin-bottom:8px">' + [['open', '답변 필요'], ['answered', '답변 완료'], ['all', '전체']].map(function (f) { return '<button type="button" data-q="' + f[0] + '" class="' + (filt === f[0] ? 'on' : '') + '" style="font-size:14px">' + f[1] + '</button>'; }).join('') + '</div>'
          : '<button class="btn" id="ask" type="button" style="margin-bottom:10px">새 문의 남기기</button>') +
          (l.map(function (x) {
            var s = S2[x.status] || ['', ''];
            return '<div class="card" role="button" tabindex="0" data-q2="' + esc(x.id) + '" style="min-height:0"><div style="flex:1;min-width:0"><div class="t" style="font-size:16px">' + (x.unread ? '<i class="dot" aria-label="새 글"></i>' : '') + esc(x.title) + '</div>' +
              '<div class="s">' + (staff() && !x.mine ? esc(x.nick) + '님 · ' : '') + (staff() && x.store ? esc(x.store) + ' · ' : '') + esc(x.catName) + ' · ' + when(x.updated) + ' · 글 ' + x.count + '개</div>' +
              '<span class="chip ' + s[1] + '">' + s[0] + '</span>' + (staff() && !x.mine && (x.cat === 'pay' || x.cat === 'branch' || x.cat === 'nick') && !x.canAnswer ? ' <span class="chip">관리자 답변</span>' : '') + '</div><span style="font-size:22px;color:var(--mut2)" aria-hidden="true">›</span></div>';
          }).join('') || '<div class="ann">' + (staff() ? '해당하는 문의가 없어요.' : '아직 남긴 문의가 없어요. 궁금한 점은 먼저 "자주 묻는 질문"을 봐 주세요.') + '</div>');
      }
      async function draw() {
        try { await loadTab(); } catch (e) { if (!alive()) return; root.innerHTML = frame(ui.errorBlock(ui.errText(e))); $('[data-retry]', root).onclick = draw; return; }
        if (!alive()) return;
        root.innerHTML = frame(tab === 'faq' ? faqHtml() : listHtml());
        $$('#qt button').forEach(function (b) { b.onclick = function () { tab = b.dataset.t; draw(); }; });
        $$('#qf button').forEach(function (b) { b.onclick = function () { filt = b.dataset.q; draw(); }; });
        $$('[data-f]').forEach(function (b) { b.onclick = function () { open[b.dataset.f] = !open[b.dataset.f]; draw(); }; });
        $$('[data-fe]').forEach(function (b) { b.onclick = function () { LZ.go('faqEdit', { id: b.dataset.fe }); }; });
        $$('[data-fm]').forEach(function (b) { b.onclick = async function () { try { faq = await LZ.api('faqMove', { id: b.dataset.fm, dir: +b.dataset.d }, { retry: 0 }); draw(); } catch (e) { ui.toast(ui.errText(e), 4000); } }; });
        var fa = $('#fadd'); if (fa) fa.onclick = function () { LZ.go('faqEdit', {}); };
        ['#ask', '#ask2'].forEach(function (s) { var b = $(s); if (b) b.onclick = function () { LZ.go('qnaNew', {}); }; });
        $$('[data-q2]').forEach(function (c) { function go() { LZ.go('qnaView', { id: c.dataset.q2 }); } c.onclick = go; c.onkeydown = function (e) { if (e.key === 'Enter') go(); }; });
      }
      draw();
    }
  };

  /* ───── 새 문의 ───── */
  LZ.screens.qnaNew = {
    show: function (p, root) {
      var cat = p.cat || '', ed;
      root.innerHTML = '<div class="scr">' + ui.hdr2('새 문의') + '<div class="bd nt">' +
        '<label class="lbl" style="margin-top:0">분류를 골라 주세요</label><div class="qcat" id="qc">' + Object.keys(CAT).filter(function (k) { return !(staff() && (k === 'pay' || k === 'branch' || k === 'nick')); }).map(function (k) {
          return '<button type="button" data-c="' + k + '" class="' + (cat === k ? 'on' : '') + '"><b>' + CAT[k] + '</b><small>' + CAT_HINT[k] + '</small></button>';
        }).join('') + '</div>' +
        '<label class="lbl" for="qtl">제목 (30자까지)</label><input class="inp" id="qtl" maxlength="30" value="' + esc(p.title || (p.cat === 'branch' ? '지점 추가 요청' : '')) + '" placeholder="예: 송금했는데 시작이 안 돼요">' +
        '<label class="lbl">내용 (500자까지) <span style="font-size:12px">— 글자를 고른 뒤 굵게·크게·색을 누르면 꾸밀 수 있어요</span></label><div id="ed"></div>' +
        (p.cid ? '<div class="hint">코스: <b>' + esc(p.cname || '') + '</b> (자동으로 함께 보내요)</div>' : '') +
        '<div class="msg" id="err" role="alert"></div><button class="btn" id="send" type="button" style="margin-top:12px">문의 남기기</button>' +
        '<p class="hint">답변은 이 앱의 <b>설정 → 문의하기</b>에서 볼 수 있어요. 답변이 오면 빨간 숫자로 알려 드려요.</p></div></div>';
      ed = LZ.rich($('#ed'), { max: 500, label: '문의 내용', placeholder: p.cat === 'branch' ? '추가하고 싶은 매장 이름과 동네를 적어 주세요. 예: 제이드 수유점 (서울 강북구)' : p.cat === 'course' ? '어느 홀의 무엇이 틀렸는지 적어 주세요. 예: 3홀 거리가 52.5m가 아니라 62.5m예요' : '궁금한 점을 적어 주세요' });
      LZ.guard = { kind: 'form', dirty: function () { return ed.dirty() || !!$('#qtl').value.trim(); }, body: '작성 중인 문의가 사라져요.' };
      $$('#qc button').forEach(function (b) { b.onclick = function () { cat = b.dataset.c; $$('#qc button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $('#send').onclick = async function () {
        var err = $('#err'), v = ed.value(), title = $('#qtl').value.trim(); err.textContent = '';
        if (!cat) { err.textContent = '분류를 골라 주세요.'; return; }
        if (!title) { err.textContent = '제목을 적어 주세요.'; $('#qtl').focus(); return; }
        if (!v.text.trim()) { err.textContent = '내용을 적어 주세요.'; ed.focus(); return; }
        if (ed.over()) { err.textContent = '내용은 500자까지 쓸 수 있어요.'; return; }
        var b = $('#send'); if (b.disabled) return; b.disabled = true; ui.busy(true, '보내고 있어요…');
        try {
          var r = await LZ.api('qnaAsk', { cat: cat, title: title, html: v.html, cid: p.cid || '', meta: LZ.pwa.device + ' · 앱 ' + LZ.appVersion + ' · ' + LZ.branch }, { retry: 0 });
          ui.busy(false); LZ.guard = null; ui.toast('문의를 남겼어요. 답변이 오면 알려 드릴게요.', 4000);
          await LZ.go('qnaView', { id: r.qna.id }, { replace: true, skipGuard: true });
        } catch (e) { ui.busy(false); b.disabled = false; err.textContent = ui.errText(e); }
      };
    }
  };

  /* ───── 문의 보기 · 답변 · 이어 묻기 · 종료 ───── */
  LZ.screens.qnaView = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('문의') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('qnaGet', { id: p.id }); if (!alive()) return;
      var q = d.qna, ed = null; setBadge(d.badge);
      function draw() {
        var mine = q.mine !== undefined ? q.mine : q.uid === S.user.uid, st = (staff() && !mine ? ST_STAFF : ST)[q.status] || ['', ''];
        var canWrite = q.status !== 'closed' && (mine || q.canAnswer);
        root.innerHTML = '<div class="scr">' + ui.hdr2(q.catName) + '<div class="bd nt">' +
          '<div class="row2" style="margin:0 0 4px;align-items:flex-start"><h3 style="font-size:18px;word-break:break-all">' + esc(q.title) + '</h3><span class="chip ' + st[1] + '">' + st[0] + '</span></div>' +
          '<div class="meta" style="margin-bottom:8px">' + (staff() && !mine ? '<b>' + esc(q.nick) + '님</b> · ' : '') + (q.store ? esc(q.store) + ' · ' : '') + esc(q.catName) + ' · 처음 ' + when(q.created) + (staff() && q.meta ? '<br>' + esc(q.meta) : '') + '</div>' +
          (q.course ? '<div class="ban" style="margin-bottom:8px">코스: <b>' + esc(q.course.name) + '</b> <button class="sm" id="gc" type="button" style="margin-top:6px">' + (staff() ? '코스 수정하러 가기' : '코스 보기') + '</button></div>' : '') +
          (d.qna.pending !== undefined ? '<div class="ban ' + (d.qna.pending ? 'b' : '') + '" style="margin-bottom:8px">' + (d.qna.pending ? '입금 확인 대기: ' + esc(d.qna.pending.planName) + ' ' + u.won(d.qna.pending.amount) + ' · 보낸 분 표시 <b>' + esc(d.qna.pending.depositor) + '</b>' + (ui.isAdmin() ? ' <button class="sm" id="gp" type="button" style="margin-top:6px">결제 확인으로</button>' : '') : '이 회원은 지금 입금 확인 대기 중인 결제가 없어요.') + '</div>' : '') +
          '<div class="thread">' + q.msgs.map(function (m) {
            var me = m.byUid ? m.byUid === S.user.uid : m.by === S.user.nick, who = m.role === 'staff' ? '운영진 답변 · ' + esc(m.by) : esc(m.by) + '님';
            return '<div class="msgb ' + (m.role === 'staff' ? 'st' : 'us') + (me ? ' me' : '') + '"><div class="who">' + who + ' · ' + when(m.at) + '</div><div class="rich">' + LZ.safeHtml(m.html) + '</div></div>';
          }).join('') + '</div>' +
          (q.status === 'closed' ? '<div class="ann">종료된 문의예요. 더 궁금한 점은 새 문의로 남겨 주세요.</div>'
            : staff() && !mine && !q.canAnswer ? '<div class="ban r">' + (q.cat === 'pay' || q.cat === 'branch' || q.cat === 'nick' ? '결제·이용권, 지점 추가, 닉네임 확인 요청은 관리자만 답변할 수 있어요.' : '다른 지점 문의라서 그 지점 운영자가 답변해요.') + '</div>'
            : '<label class="lbl">' + (mine ? '이어서 묻기' : '답변 쓰기') + '</label><div id="ed"></div><div class="msg" id="err" role="alert"></div>' +
              '<button class="btn" id="send" type="button" style="margin-top:10px">' + (mine ? '보내기' : '답변 보내기') + '</button>') +
          (canWrite ? '<button class="btn g" id="close" type="button" style="margin-top:8px">' + (mine ? '해결됐어요 (문의 종료)' : '문의 종료') + '</button>' : '') + '</div></div>';
        var eh = $('#ed'); ed = eh ? LZ.rich(eh, { max: mine ? 500 : 1000, label: mine ? '이어서 묻기' : '답변' }) : null;
        LZ.guard = ed ? { kind: 'form', dirty: function () { return ed.dirty(); }, body: '작성 중인 글이 사라져요.' } : null;
        var gc = $('#gc'); if (gc) gc.onclick = function () { LZ.guard = null; LZ.go(staff() ? 'courseEdit' : 'holes', { id: q.course.id }); };
        var gp = $('#gp'); if (gp) gp.onclick = function () { LZ.guard = null; LZ.go('payments', {}); };
        var sb = $('#send'); if (sb) sb.onclick = async function () {
          var v = ed.value(), err = $('#err'); err.textContent = '';
          if (!v.text.trim()) { err.textContent = '내용을 적어 주세요.'; ed.focus(); return; }
          if (ed.over()) { err.textContent = '글자 수가 너무 많아요.'; return; }
          if (sb.disabled) return; sb.disabled = true; ui.busy(true, '보내고 있어요…');
          try { var r = await LZ.api('qnaReply', { id: q.id, html: v.html }, { retry: 0 }); ui.busy(false); q = Object.assign(q, r.qna); setBadge(r.badge); LZ.guard = null; draw(); ui.toast(mine ? '보냈어요' : '답변을 보냈어요', 2500); }
          catch (e) { ui.busy(false); sb.disabled = false; err.textContent = ui.errText(e); }
        };
        var cb = $('#close'); if (cb) cb.onclick = async function () {
          if (!(await ui.confirm('문의를 종료할까요?', '종료한 문의에는 더 글을 쓸 수 없어요. 궁금한 점이 생기면 새 문의로 남겨 주세요.', '종료'))) return;
          ui.busy(true, '처리하고 있어요…');
          try { var r = await LZ.api('qnaClose', { id: q.id }, { retry: 0 }); ui.busy(false); q = Object.assign(q, r.qna); setBadge(r.badge); LZ.guard = null; draw(); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4000); }
        };
      }
      draw();
    }
  };

  /* ───── FAQ 쓰기·고치기 (관리자) ───── */
  LZ.screens.faqEdit = {
    show: async function (p, root, alive) {
      var item = { q: '', a: '' };
      if (p.id) { var d = await LZ.api('faqList', {}); if (!alive()) return; item = d.faq.filter(function (f) { return f.id === p.id; })[0] || item; }
      root.innerHTML = '<div class="scr">' + ui.hdr2(p.id ? '자주 묻는 질문 고치기' : '자주 묻는 질문 추가') + '<div class="bd nt">' +
        '<label class="lbl" for="fq" style="margin-top:0">질문 (60자까지)</label><input class="inp" id="fq" maxlength="60" value="' + esc(item.q) + '">' +
        '<label class="lbl">답 (2,000자까지)</label><div id="ed"></div><div class="msg" id="err" role="alert"></div>' +
        '<button class="btn" id="save" type="button" style="margin-top:10px">저장</button>' + (p.id ? '<button class="btn r" id="del" type="button" style="margin-top:8px">이 질문 지우기</button>' : '') + '</div></div>';
      var ed = LZ.rich($('#ed'), { max: 2000, html: item.a, label: '답' }), orig = JSON.stringify([item.q, ed.value().html]);
      LZ.guard = { kind: 'form', dirty: function () { return JSON.stringify([$('#fq').value, ed.value().html]) !== orig; }, body: '고친 내용이 저장되지 않아요.' };
      $('#save').onclick = async function () {
        var qv = $('#fq').value.trim(), v = ed.value(); if (!qv || !v.text.trim()) { $('#err').textContent = '질문과 답을 모두 적어 주세요.'; return; }
        ui.busy(true, '저장하고 있어요…');
        try { await LZ.api('faqSave', { id: p.id || '', q: qv, ans: v.html }, { retry: 0 }); ui.busy(false); LZ.guard = null; ui.toast('저장했어요'); history.back(); }
        catch (e) { ui.busy(false); $('#err').textContent = ui.errText(e); }
      };
      var dl = $('#del'); if (dl) dl.onclick = async function () {
        if (!(await ui.confirm('이 질문을 지울까요?', '"' + item.q + '"', '지우기', true))) return;
        try { await LZ.api('faqDel', { id: p.id }, { retry: 0 }); LZ.guard = null; ui.toast('지웠어요'); history.back(); } catch (e) { ui.toast(ui.errText(e), 4000); }
      };
    }
  };
})();
