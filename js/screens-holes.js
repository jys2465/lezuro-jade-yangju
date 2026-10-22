/* 코스 페이지: 9홀 표 · 홀 기록 편집 · 비교 분석 (모두 화면 꺼짐 방지) */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;

  function load(id, who) {
    return LZ.api('course', { id: id, who: who || u.store.get('lz.who.' + id) || '' }).then(function (d) {
      var cur = { course: d.course, mine: d.mine, authors: d.authors, pick: d.pick, ref: d.ref, br: d.br || LZ.branch, fetched: Date.now(), stale: false };
      LZ.cache.course = cur; (LZ.cache.courseMap = LZ.cache.courseMap || {})[id] = cur; return cur;
    });
  }
  async function getCur(id, root, alive, title) {
    var ok = function (c) { return c && c.course.id === id && !c.stale && c.br === LZ.branch && Date.now() - c.fetched < 180000; };   // 3분 안에 연 코스는 바로
    var cur = ok(LZ.cache.course) ? LZ.cache.course : ok((LZ.cache.courseMap || {})[id]) ? LZ.cache.courseMap[id] : null;
    if (cur) { LZ.cache.course = cur; return cur; }
    root.innerHTML = '<div class="scr">' + ui.hdr2(title || '코스 불러오는 중') + '<div class="bd nt">' + ui.skeleton(5) + '</div></div>';
    cur = await load(id); if (!alive()) return null;
    return cur;
  }
  /* 다른 회원을 바꿔서 다시 불러옴(내 기록은 이 화면에서 고친 것을 그대로 둠) */
  async function switchWho(cur, uid) {
    u.store.set('lz.who.' + cur.course.id, uid); ui.busy(true, '불러오고 있어요…');
    try { var mine = cur.mine, n = await load(cur.course.id, uid); n.mine = mine; LZ.cache.course = n; ui.busy(false); return n; }
    catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); return null; }
  }
  function rowSent(r) { return u.sentHTML(r) + (r && r.o ? '<small>참고사항: ' + esc(r.o) + '</small>' : ''); }
  function sameRec(a, b) { return a.r === b.r && (a.r !== 'u' || u.key(a.t) === u.key(b.t)) && a.d === b.d && (a.n | 0) === (b.n | 0) && (a.p | 0) === (b.p | 0) && (a.o || '') === (b.o || ''); }
  function maxHole(c) { return c.stage === 'done' ? 18 : 9; }

  /* 기록 가져오기 (mode: 'empty' 빈 홀만, 'all' 모두 덮어쓰기, 숫자: 그 홀만). src: 다른 회원(cur.pick) 또는 기본 매장 내 기록(refSrc). 되돌리기 함수를 돌려줌 */
  function refSrc(cur) { return cur.ref ? { recs: cur.ref.recs, nick: cur.ref.store + ' 내 기록', mine: true } : null; }
  function srcName(src) { return src.mine ? src.nick : src.nick + '님 기록'; }
  function importRecs(cur, mode, src) {
    src = src || cur.pick;
    var c = cur.course, o = src.recs, changed = [], before = {};
    for (var i = 0; i < maxHole(c); i++) {
      if (typeof mode === 'number' && i !== mode) continue;
      if (!o[i] || !o[i].r) continue;
      if (mode === 'empty' && cur.mine[i].r) continue;
      if (sameRec(cur.mine[i], o[i])) continue;
      before[i] = u.cloneRec(cur.mine[i]); cur.mine[i] = u.cloneRec(o[i]); LZ.rec.queue(c.id, i, cur.mine[i]); changed.push(i);
    }
    /* 신뢰도: 다른 회원 기록을 가져다 쓴 것을 서버에 알림(같은 코스는 몇 번이든 1점). 내 기록(기본 매장)은 점수 없음. 되돌리면 방금 생긴 1점은 뺌 */
    var from = src.uid, used = changed.length && !src.mine ? LZ.api('use', { cid: c.id, from: from }, { retry: 1 }).then(function (r) { setTrust(cur, from, r.trust); return r; }, function () { return null; }) : null;
    return { n: changed.length, done: used, undo: function () {
      changed.forEach(function (i) { cur.mine[i] = before[i]; LZ.rec.queue(c.id, i, cur.mine[i]); });
      if (used) used.then(function (r) { if (r && r.created) LZ.api('unuse', { cid: c.id, from: from }, { retry: 1 }).then(function () { setTrust(cur, from, Math.max(0, (r.trust || 1) - 1)); }, function () {}); });
    } };
  }
  function setTrust(cur, uid, t) {
    if (typeof t !== 'number') return;
    if (cur.pick && cur.pick.uid === uid) cur.pick.trust = t;
    (cur.authors || []).forEach(function (a) { if (a.uid === uid) a.trust = t; });
  }
  function authorLabel(a) { return esc(a.nick) + '님 · <b>신뢰도 ' + (a.trust || 0) + '점</b> · ' + a.filled + '홀'; }
  function countFor(cur, src) {
    var o = (src || cur.pick).recs, e = 0, a = 0;
    for (var i = 0; i < maxHole(cur.course); i++) { if (!o[i] || !o[i].r || sameRec(cur.mine[i], o[i])) continue; a++; if (!cur.mine[i].r) e++; }
    return { empty: e, all: a };
  }
  async function askImport(cur, src) {
    src = src || cur.pick;
    var nk = srcName(src), n = countFor(cur, src);
    if (!n.all) { ui.toast(nk + ' 중에 가져올 것이 없어요. (이미 같거나 기록이 없어요)', 4000); return null; }
    var v = await ui.dialog({ title: nk + ' 가져오기', body: '어떻게 가져올까요?\n· 빈 홀만 채우기: 내가 아직 기록하지 않은 홀만 채워요.\n· 모두 덮어쓰기: ' + nk + '이 있는 홀은 모두 그 기록으로 바꿔요.\n' + (src.mine ? '매장마다 센서·파워가 달라서 가져온 뒤 이 매장에 맞게 고쳐 주세요.\n' : '') + '가져온 뒤에도 "되돌리기"로 돌아갈 수 있어요.', cancel: null,
      buttons: [{ label: '빈 홀만 채우기 (' + n.empty + '홀)', kind: 'y', value: 'empty' }, { label: '모두 덮어쓰기 (' + n.all + '홀 바뀜)', kind: 'r', value: 'all' }, { label: '취소', kind: 'g', value: null }] });
    if (!v) return null;
    if (v === 'empty' && !n.empty) { ui.toast('빈 홀 중에 ' + nk + '이 있는 홀이 없어요.', 4000); return null; }
    return importRecs(cur, v, src);
  }

  /* ───── 9홀 표 ───── */
  LZ.screens.holes = {
    wake: true,
    show: async function (p, root, alive) {
      var cur = await getCur(p.id, root, alive); if (!cur) return;
      var c = cur.course;
      if (c.stage !== 'done') { if (c.mineReg) await LZ.go('regBack', { id: c.id }, { replace: true, skipGuard: true }); else root.innerHTML = '<div class="scr">' + ui.hdr2(c.name) + '<div class="bd nt"><div class="ban">아직 등록 중인 코스예요.</div></div></div>'; return; }
      var half = p.half || 0, zoom = 1, onlyMine = u.store.get('lz.onlyMine') === '1', undoFn = null;
      function par() { return c.holes.reduce(function (s, h) { return s + h[0]; }, 0); }
      function total() { return c.holes.reduce(function (s, h) { return s + h[1]; }, 0); }
      function draw() {
        var ex = ui.expired(), pk = cur.pick;
        root.innerHTML = '<div class="scr">' + ui.hdr2(c.name) + '<div class="bd nt" style="padding:10px 8px calc(24px + var(--sab))">' +
          '<div class="ban g" id="wk" style="display:none;margin:0 4px 8px"></div>' +
          '<div class="hint" style="margin:0 6px 8px">18홀 · 파 ' + par() + ' · 총 ' + u.fmt(total()) + 'm · 처음 등록한 분: ' + esc(c.reg) + '님' + (c.regFrom ? ' (' + esc(c.regFrom) + ')' : '') + '</div>' +
          (c.canEdit ? '' : '<div class="ban" style="margin:0 4px 8px">' + (c.regFrom ? '이 코스는 다른 매장(' + esc(c.regFrom) + ')에서 등록한 코스예요. ' : '') + '코스 정보(파·거리·이름)를 고쳐야 하면 <b>운영자에게 수정을 요청</b>해 주세요.' + (S.me && S.me.qnaOn ? ' <button class="sm" id="req" type="button" style="margin-top:6px">수정 요청하기</button>' : '') + '</div>') +
          (c.canEdit ? '<div style="margin:0 4px 8px"><button class="sm" id="info" type="button">파·거리 고치기</button></div>' : '') +
          (ex ? '<div class="ban r" style="margin:8px 4px">이용 기간이 끝나서 다른 회원 기록은 볼 수 없고, 내 기록도 읽기만 돼요. <button class="sm" id="payb" type="button" style="margin-top:6px">이용권 결제하기</button></div>'
            : pk ? '<div class="blk" style="margin:0 4px 8px"><div class="row2" style="margin:0 0 8px"><span style="font-size:14px;color:var(--mut)">참고할 회원 (이 매장)</span><button class="sm" id="who" type="button"><b>' + esc(pk.nick) + '님</b>&nbsp;· 신뢰도 ' + (pk.trust || 0) + '점 ▾</button></div><div id="wl" style="display:none;margin:0 0 8px"></div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><button class="sm" id="imp" type="button" style="justify-content:center">' + esc(pk.nick) + '님 기록 가져오기</button><button class="sm" id="cmp" type="button" style="justify-content:center">비교 분석</button></div>' +
              '<div id="undo"></div></div>'
              : '<div class="ban" style="margin:8px 4px">이 매장에는 이 코스에 공개된 다른 회원 기록이 아직 없어요.</div>') +
          (cur.ref ? '<div class="blk ref" style="margin:0 4px 8px"><div style="font-size:14px;color:var(--mut);margin-bottom:6px">📍 기본 매장 <b>' + esc(cur.ref.store) + '</b>의 내 기록이 있어요. 매장마다 센서가 달라서 흐리게 참고로 보여 드려요.</div>' +
            (ex ? '' : '<button class="sm" id="impref" type="button">' + esc(cur.ref.store) + ' 내 기록 가져오기</button>') + '</div>' : '') +
          '<div class="seg" id="half" style="margin:0 4px"><button type="button" data-h="0" class="' + (half ? '' : 'on') + '">전반 9홀</button><button type="button" data-h="1" class="' + (half ? 'on' : '') + '">후반 9홀</button></div>' +
          '<div class="row2" style="margin:6px 4px"><label class="chk"><input type="checkbox" id="om" ' + (onlyMine ? 'checked' : '') + '>내 기록만 보기</label><span style="display:flex;gap:6px"><button class="sm" id="zm" type="button" aria-label="표 작게">작게</button><button class="sm" id="zp" type="button" aria-label="표 크게">크게</button></span></div>' +
          '<div class="hint" style="margin:0 6px 6px"><span id="zl"></span> · ' + (half ? '1홀(10홀) ~ 9홀(18홀)' : '1홀 ~ 9홀') + ' · 옆으로 밀면 전반↔후반</div>' +
          '<div class="zoomwrap" id="zw"><div id="ht"></div></div><p class="hint" style="margin:6px 6px 2px">' + (ex ? '' : '"내 기록" 줄을 누르면 크게 보고 고칠 수 있어요. ') + '두 손가락으로 벌려서 키울 수도 있어요.</p></div></div>';
        ui.wakeBan($('#wk'));
        $('#info') && ($('#info').onclick = function () { LZ.go('courseEdit', { id: c.id }); });
        $('#req') && ($('#req').onclick = function () { LZ.go('qnaNew', { cat: 'course', cid: c.id, cname: c.name, title: (c.name + ' 수정 요청').slice(0, 30) }); });
        $('#payb') && ($('#payb').onclick = function () { LZ.go('pay', {}); });
        $$('#half button').forEach(function (b) { b.onclick = function () { half = +b.dataset.h; draw(); }; });
        $('#zp').onclick = function () { setZoom(zoom + 0.25); }; $('#zm').onclick = function () { setZoom(zoom - 0.25); };
        $('#om').onchange = function (e) { onlyMine = e.target.checked; u.store.set('lz.onlyMine', onlyMine ? '1' : '0'); table(); };
        var w = $('#who'); if (w) w.onclick = pickWho;
        var im = $('#imp'); if (im) im.onclick = async function () {
          var r = await askImport(cur); if (!r) return;
          undoFn = r.undo; table(); showUndo(r.n);
          if (r.done) r.done.then(function () { if (alive()) { draw(); showUndo(r.n); } });   // 올라간 신뢰도 점수 바로 보이기
          ui.toastUndo(cur.pick.nick + '님 기록 ' + r.n + '홀을 가져왔어요.', '되돌리기', doUndo);
        };
        var ir = $('#impref'); if (ir) ir.onclick = async function () {
          var r = await askImport(cur, refSrc(cur)); if (!r) return;
          undoFn = r.undo; table(); showUndo(r.n);
          ui.toastUndo(cur.ref.store + ' 내 기록 ' + r.n + '홀을 가져왔어요.', '되돌리기', doUndo);
        };
        var cm = $('#cmp'); if (cm) cm.onclick = function () { LZ.go('compare', { id: c.id }); };
        showUndo(); table(); gestures();
      }
      function showUndo(n) {
        var h = $('#undo'); if (!h) return;
        h.innerHTML = undoFn ? '<div class="ban g" style="margin:8px 0 0">방금 ' + (n ? n + '홀을 ' : '') + '가져왔어요. <button class="sm" id="ud" type="button" style="margin-top:6px">되돌리기</button></div>' : '';
        var b = $('#ud'); if (b) b.onclick = doUndo;
      }
      function doUndo() { if (!undoFn) return; undoFn(); undoFn = null; if (alive()) { table(); showUndo(); } ui.toast('가져오기 전으로 되돌렸어요.'); }
      function table() {
        var from = half * 9, h = '', o = cur.pick && !ui.expired() && !onlyMine ? cur.pick.recs : null;
        for (var i = from; i < from + 9; i++) {
          h += '<div class="hole"><div class="hh"><b>' + u.LBL(i) + '</b><span class="chip y" style="padding:1px 8px">파 ' + c.holes[i][0] + '</span><span>' + u.fm(c.holes[i][1]) + 'm</span></div>' +
            (o ? '<div class="rw"><div class="nm">' + esc(cur.pick.nick) + '님<small style="display:block;color:var(--pri);font-size:11px">신뢰도 ' + (cur.pick.trust || 0) + '점</small></div><div class="tx">' + rowSent(o[i]) + '</div></div>' : '') +
            (cur.ref && cur.ref.recs[i] && cur.ref.recs[i].r ? '<div class="rw ref"><div class="nm">' + esc(cur.ref.store) + '<small style="display:block;font-size:11px">내 기록(참고)</small></div><div class="tx">' + rowSent(cur.ref.recs[i]) + '</div></div>' : '') +
            '<div class="rw me" role="button" tabindex="0" data-i="' + i + '"><div class="nm">내 기록</div><div class="tx">' + rowSent(cur.mine[i]) + '</div></div></div>';
        }
        var ht = $('#ht'); ht.innerHTML = h; ht.style.width = $('#zw').clientWidth + 'px'; ht.style.zoom = zoom; $('#zl').textContent = '표 크기 ' + Math.round(zoom * 100) + '%';
        $$('#ht .rw.me').forEach(function (r) {
          function open() { LZ.go('edit', { id: c.id, i: +r.dataset.i }); }
          r.onclick = open; r.onkeydown = function (e) { if (e.key === 'Enter') open(); };
        });
      }
      function setZoom(z) { zoom = Math.max(1, Math.min(2.2, Math.round(z * 100) / 100)); var ht = $('#ht'); ht.style.zoom = zoom; $('#zl').textContent = '표 크기 ' + Math.round(zoom * 100) + '%'; }
      /* 두 손가락으로 벌리면 확대, 옆으로 밀면 전반↔후반 */
      function gestures() {
        var zw = $('#zw'), d0 = 0, z0 = 1, x0 = 0, y0 = 0, two = false;
        function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
        zw.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { two = true; d0 = dist(e.touches); z0 = zoom; } else { two = false; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
        zw.addEventListener('touchmove', function (e) { if (e.touches.length === 2 && d0) { e.preventDefault(); setZoom(z0 * dist(e.touches) / d0); } }, { passive: false });
        zw.addEventListener('touchend', function (e) {
          if (two) { if (e.touches.length === 0) two = false; return; }
          var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && zw.scrollWidth <= zw.clientWidth + 2) { half = dx < 0 ? 1 : 0; draw(); }
        }, { passive: true });
      }
      function pickWho() {
        var l = $('#wl'); if (l.style.display === 'block') { l.style.display = 'none'; return; }
        l.style.display = 'block';
        l.innerHTML = '<div class="hint" style="margin:0 0 6px">이 코스에 기록을 공개한 회원만, 신뢰도 높은 순으로 나와요. 신뢰도는 다른 회원이 그 기록을 가져다 쓴 수예요.</div><div style="display:grid;gap:6px">' +
          cur.authors.map(function (a) { return '<button class="sm ' + (a.uid === cur.pick.uid ? 'on' : '') + '" type="button" data-a="' + esc(a.uid) + '">' + authorLabel(a) + '</button>'; }).join('') + '</div>';
        $$('#wl [data-a]').forEach(function (b) {
          b.onclick = async function () { var n = await switchWho(cur, b.dataset.a); if (!n || !alive()) return; cur = n; undoFn = null; draw(); };
        });
      }
      draw();
    }
  };

  /* ───── 홀 기록 편집 ───── */
  LZ.screens.edit = {
    wake: true,
    show: async function (p, root, alive) {
      var cur = LZ.cache.course;
      if (!cur || cur.course.id !== p.id) { cur = await getCur(p.id, root, alive, '불러오는 중'); if (!cur) return; }
      var c = cur.course, i = p.i, rec = cur.mine[i], ex = ui.expired(), last = maxHole(c) - 1;
      LZ.guard = { kind: 'auto', dirty: function () { return LZ.rec.dirty(); }, save: function () { return LZ.rec.flush(); }, discard: function () { LZ.rec.discard(); if (LZ.cache.course) LZ.cache.course.stale = true; } };

      root.innerHTML = '<div class="scr">' + ui.hdr2(u.LBL(i) + ' · 파' + c.holes[i][0] + ' · ' + u.fm(c.holes[i][1]) + 'm', '<span class="sv" id="sv" role="status"></span>') +
        '<div class="bd nt">' + (ex ? '<div class="ban r">이용 기간이 끝나서 기록을 고칠 수 없어요. 이용권을 결제하면 다시 고칠 수 있어요.</div>' : '<div class="ban g" id="wk" style="display:none"></div>') +
        '<div id="sb"></div><div id="rh"></div>' +
        (cur.ref && cur.ref.recs[i] && cur.ref.recs[i].r ? '<div class="ann ref" id="refh"></div>' + (ex ? '' : '<button class="btn g" id="cpref" type="button" style="margin-bottom:8px">' + esc(cur.ref.store) + ' 내 기록 가져오기</button>') : '') +
        (!ex && cur.pick ? '<div class="ann" id="oth"></div><button class="btn g" id="cp" type="button" style="margin-bottom:8px">' + esc(cur.pick.nick) + '님 이 홀 기록 가져오기</button>' : '') +
        '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn g" id="prev" type="button" style="flex:1"' + (i === 0 ? ' disabled' : '') + '>이전 홀</button><button class="btn" id="next" type="button" style="flex:1">' + (i < last ? '다음 홀' : '표로 가기') + '</button></div></div></div>';

      var off, hadErr = false;
      function showStatus(s) {
        var el = $('#sv'), sb = $('#sb'); if (!el) return;
        if (s === 'err') hadErr = true; else if (s === 'ok') hadErr = false;
        var m = { ok: ['자동 저장됨', 'sv sv-ok'], wait: ['고치는 중…', 'sv sv-wait'], saving: ['저장 중…', 'sv sv-wait'], err: ['저장 못 했어요', 'sv sv-bad'] }[s] || ['', 'sv'];
        if (hadErr && s !== 'ok') m = s === 'err' ? m : ['다시 저장 중…', 'sv sv-bad'];
        el.textContent = ex ? '읽기만 가능' : m[0]; el.className = ex ? 'sv' : m[1];
        sb.innerHTML = hadErr && s !== 'ok' ? '<div class="ban r">저장하지 못했어요. 인터넷을 확인해 주세요. 자동으로 다시 시도하고 있어요. 고친 내용은 이 폰에 남아 있어요.<br><button class="sm" id="rt" type="button" style="margin-top:8px">지금 다시 저장</button></div>' : '';
        var rt = $('#rt'); if (rt) rt.onclick = function () { LZ.rec.flush(); };
      }
      off = LZ.rec.on(function (s) { if (!alive()) { off(); return; } showStatus(s); });
      showStatus(LZ.rec.status());

      LZ.recUI($('#rh'), rec, { disabled: ex, msg: '이용 기간이 끝나서 기록을 고칠 수 없어요.', onChange: function (r) { LZ.rec.queue(c.id, i, r); } });
      if (cur.ref && $('#refh')) {
        var rr = cur.ref.recs[i];
        $('#refh').textContent = cur.ref.store + ' 내 기록 (참고)\n' + (u.sent(rr) || '기록 없음') + (rr.o ? '\n참고사항: ' + rr.o : '');
        var cpr = $('#cpref'); if (cpr) cpr.onclick = async function () {
          if (rec.r && !sameRec(rec, rr) && !(await ui.confirm('내 기록을 바꿀까요?', '이 홀의 내 기록이 ' + cur.ref.store + ' 내 기록으로 바뀌어요.', '바꾸기'))) return;
          var r = importRecs(cur, i, refSrc(cur));
          await LZ.go('edit', { id: c.id, i: i }, { replace: true, skipGuard: true });
          if (r.n) ui.toastUndo(cur.ref.store + ' 내 기록을 가져왔어요. 이 매장에 맞게 고쳐 주세요.', '되돌리기', function () { r.undo(); LZ.go('edit', { id: c.id, i: i }, { replace: true, skipGuard: true }); });
        };
      }
      if (!ex && cur.pick) {
        var o = cur.pick.recs[i];
        $('#oth').textContent = cur.pick.nick + '님 기록\n' + (u.sent(o) || '기록 없음') + (o.o ? '\n참고사항: ' + o.o : '');
        $('#cp').onclick = async function () {
          if (!o.r) return ui.toast(cur.pick.nick + '님은 이 홀에 기록이 없어요.');
          if (rec.r && !sameRec(rec, o) && !(await ui.confirm('내 기록을 바꿀까요?', '이 홀의 내 기록이 ' + cur.pick.nick + '님 기록으로 바뀌어요.', '바꾸기'))) return;
          var r = importRecs(cur, i);
          await LZ.go('edit', { id: c.id, i: i }, { replace: true, skipGuard: true });
          if (r.n) ui.toastUndo(cur.pick.nick + '님 기록을 가져왔어요. 이제 마음대로 고치세요.', '되돌리기', function () { r.undo(); LZ.go('edit', { id: c.id, i: i }, { replace: true, skipGuard: true }); });
        };
      }
      function nav(ni) { LZ.go('edit', { id: c.id, i: ni }, { replace: true, skipGuard: true }); }
      $('#prev').onclick = function () { if (i > 0) nav(i - 1); };
      $('#next').onclick = function () { if (i < last) nav(i + 1); else history.back(); };
      if (!ex) ui.wakeBan($('#wk'));
    }
  };

  /* ───── 비교 분석: 나와 선택한 회원의 홀별 차이 ───── */
  function sig(r) { return r.n ? (r.d === 'L' ? -r.n : r.n) : 0; }
  function compareHole(a, b, nk) {
    if (!a.r && !b.r) return { k: 'none', t: '둘 다 기록이 없어요' };
    if (!a.r) return { k: 'theirs', t: nk + '님만 기록했어요' };
    if (!b.r) return { k: 'mine', t: '나만 기록했어요' };
    if (a.r !== b.r || (a.r === 'u' && u.key(a.t) !== u.key(b.t))) return { k: 'ref', t: '기준이 달라요 (나: ' + u.base(a) + ' / ' + nk + '님: ' + u.base(b) + ') — 칸 수는 직접 비교하기 어려워요' };
    var ds = sig(b) - sig(a), dp = (b.p | 0) - (a.p | 0), parts = [];
    if (ds) parts.push(nk + '님이 ' + (ds > 0 ? '우측' : '좌측') + '으로 ' + Math.abs(ds) + '칸 더');
    if (dp) parts.push('타격감은 ' + nk + '님이 ' + Math.abs(dp) + ' ' + (dp > 0 ? '더 셈' : '더 약함') + ' (' + (dp > 0 ? '+' : '−') + Math.abs(dp) * 5 + 'M)');
    if (!parts.length) return { k: 'same', t: '방향·칸·타격감이 같아요' };
    return { k: 'diff', t: parts.join(' · ') };
  }
  LZ.screens.compare = {
    wake: true,
    show: async function (p, root, alive) {
      var cur = await getCur(p.id, root, alive, '비교 분석'); if (!cur) return;
      var c = cur.course, onlyDiff = false;
      function draw() {
        if (ui.expired() || !cur.pick) { root.innerHTML = '<div class="scr">' + ui.hdr2('비교 분석') + '<div class="bd nt"><div class="ban">비교할 다른 회원 기록이 없어요.</div></div></div>'; return; }
        var nk = cur.pick.nick, cnt = { same: 0, diff: 0, one: 0 }, rows = [];
        for (var i = 0; i < 18; i++) {
          var a = cur.mine[i], b = cur.pick.recs[i], r = compareHole(a, b, nk);
          if (r.k === 'same') cnt.same++; else if (r.k === 'diff' || r.k === 'ref') cnt.diff++; else if (r.k !== 'none') cnt.one++;
          if (onlyDiff && (r.k === 'same' || r.k === 'none')) continue;
          var cls = r.k === 'same' ? 'same' : r.k === 'diff' ? 'diff' : r.k === 'ref' ? 'ref' : 'one';
          rows.push('<div class="cmpc"><div class="hh"><b>' + u.LBL(i) + '</b><span class="chip y" style="padding:1px 8px">파 ' + c.holes[i][0] + '</span><span>' + u.fm(c.holes[i][1]) + 'm</span></div><div class="bd2"><div class="vs"><span class="k">내 기록</span><span>' + u.sentHTML(a) + '</span><span class="k">' + esc(nk) + '님</span><span>' + u.sentHTML(b) + '</span></div>' +
            (r.k === 'none' ? '' : '<div class="res ' + cls + '">' + esc(r.t) + '</div>') +
            ((r.k === 'theirs' || r.k === 'diff' || r.k === 'ref') ? '<button class="sm" type="button" data-take="' + i + '" style="margin-top:6px">이 홀 ' + esc(nk) + '님 기록으로</button>' : '') +
            ' <button class="sm" type="button" data-ed="' + i + '" style="margin-top:6px">내 기록 고치기</button></div></div>');
        }
        root.innerHTML = '<div class="scr">' + ui.hdr2('비교 분석 · ' + c.name) + '<div class="bd nt">' +
          '<div class="ban g" id="wk" style="display:none"></div>' +
          '<div class="row2" style="margin:0 0 6px"><span style="font-size:15px">나 ↔ <b>' + esc(nk) + '님</b> <span class="chip r">신뢰도 ' + (cur.pick.trust || 0) + '점</span></span><button class="sm" id="who" type="button">다른 회원 ▾</button></div><div id="wl" style="display:none;margin-bottom:8px"></div>' +
          '<div class="sumg"><div><b>' + cnt.same + '</b>같은 홀</div><div><b>' + cnt.diff + '</b>다른 홀</div><div><b>' + cnt.one + '</b>한쪽만 기록</div></div>' +
          '<p class="hint" style="margin:0 0 8px">같은 기준일 때만 칸 수를 비교해요. 좌측은 −, 우측은 +로 계산해요. 타격감 1 = 5M.</p>' +
          '<label class="chk"><input type="checkbox" id="od" ' + (onlyDiff ? 'checked' : '') + '>다른 홀만 보기</label>' +
          (rows.join('') || '<div class="ann">모든 홀이 같아요.</div>') + '</div></div>';
        ui.wakeBan($('#wk'));
        $('#od').onchange = function (e) { onlyDiff = e.target.checked; draw(); };
        $$('[data-ed]').forEach(function (b) { b.onclick = function () { LZ.go('edit', { id: c.id, i: +b.dataset.ed }); }; });
        $$('[data-take]').forEach(function (b) {
          b.onclick = async function () {
            var i = +b.dataset.take;
            if (cur.mine[i].r && !(await ui.confirm(u.LBL(i) + ' 내 기록을 바꿀까요?', '이 홀의 내 기록이 ' + nk + '님 기록으로 바뀌어요.', '바꾸기'))) return;
            var r = importRecs(cur, i); draw();
            if (r.n) ui.toastUndo(u.LBL(i) + '을 ' + nk + '님 기록으로 바꿨어요.', '되돌리기', function () { r.undo(); if (alive()) draw(); });
          };
        });
        $('#who').onclick = function () {
          var l = $('#wl'); if (l.style.display === 'block') { l.style.display = 'none'; return; }
          l.style.display = 'block';
          l.innerHTML = '<div style="display:grid;gap:6px">' + cur.authors.map(function (a) { return '<button class="sm ' + (a.uid === cur.pick.uid ? 'on' : '') + '" type="button" data-a="' + esc(a.uid) + '">' + authorLabel(a) + '</button>'; }).join('') + '</div>';
          $$('#wl [data-a]').forEach(function (b) { b.onclick = async function () { var n = await switchWho(cur, b.dataset.a); if (!n || !alive()) return; cur = n; draw(); }; });
        };
      }
      draw();
    }
  };
})();
