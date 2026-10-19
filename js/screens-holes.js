/* 9홀 표 · 홀 기록 편집(자동 저장, 화면 꺼짐 방지) */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;

  function load(id, who) {
    return LZ.api('course', { id: id, who: who || u.store.get('lz.who.' + id) || '' }).then(function (d) {
      var cur = { course: d.course, mine: d.mine, authors: d.authors, pick: d.pick, fetched: Date.now(), stale: false };
      LZ.cache.course = cur; return cur;
    });
  }
  function expired() { return S.user.st === 'term_expired'; }
  function rowSent(r) { return u.sentHTML(r) + (r && r.o ? '<small>참고사항: ' + esc(r.o) + '</small>' : ''); }

  /* ───── 9홀 표 ───── */
  LZ.screens.holes = {
    show: async function (p, root, alive) {
      var cur = LZ.cache.course && LZ.cache.course.course.id === p.id && !LZ.cache.course.stale ? LZ.cache.course : null;
      var half = p.half || 0, zoom = 1;
      if (!cur) {
        root.innerHTML = '<div class="scr">' + ui.hdr2('코스 불러오는 중') + '<div class="bd nt">' + ui.skeleton(5) + '</div></div>';
        cur = await load(p.id); if (!alive()) return;
      }
      var c = cur.course;
      function par() { return c.holes.reduce(function (s, h) { return s + h[0]; }, 0); }
      function total() { return c.holes.reduce(function (s, h) { return s + h[1]; }, 0); }
      function draw() {
        var ex = expired();
        root.innerHTML = '<div class="scr">' + ui.hdr2(c.name) + '<div class="bd nt" style="padding:10px 8px calc(24px + var(--sab))">' +
          '<div class="hint" style="margin:0 6px 8px">18홀 · 파 ' + par() + ' · 총 ' + u.fmt(total()) + 'm · 처음 등록한 분: ' + esc(c.reg) + '님</div>' +
          (c.canEdit ? '<div style="margin:0 4px 8px"><button class="sm" id="info" type="button">파·거리 고치기</button></div>' : '<div class="hint" style="margin:0 6px 8px">파나 거리가 틀렸다면 처음 등록한 분이나 운영자에게 알려 주세요.</div>') +
          '<div class="seg" id="half"><button type="button" data-h="0" class="' + (half ? '' : 'on') + '">전반 9홀</button><button type="button" data-h="1" class="' + (half ? 'on' : '') + '">후반 9홀</button></div>' +
          '<div class="hint" style="margin:6px 6px 0">' + (half ? '1홀(10홀) ~ 9홀(18홀)' : '1홀 ~ 9홀') + ' · 화면을 옆으로 밀어도 바뀌어요</div>' +
          (ex ? '<div class="ban r" style="margin:8px 4px">이용 기간이 끝나서 다른 회원 기록은 볼 수 없고, 내 기록도 읽기만 돼요.</div>'
            : cur.authors.length ? '<div class="row2" style="margin:8px 4px"><span style="font-size:14px;color:#5A6277">다른 회원 기록 보기</span><button class="sm" id="who" type="button"><b>' + esc(cur.pick.nick) + '님</b> ▾</button></div><div id="wl" style="display:none;margin:0 4px 8px"></div>'
              : '<div class="ban" style="margin:8px 4px">이 코스에는 공개된 다른 회원 기록이 아직 없어요.</div>') +
          '<div class="row2" style="margin:6px 4px"><span class="hint" id="zl" style="margin:0"></span><span style="display:flex;gap:6px"><button class="sm" id="zm" type="button">작게</button><button class="sm" id="zp" type="button">크게</button></span></div>' +
          '<div class="zoomwrap" id="zw"><div id="ht"></div></div><p class="hint" style="margin:6px 6px 2px">노란 줄이 내 기록이에요. ' + (ex ? '' : '누르면 크게 고칠 수 있어요. ') + '표는 두 손가락으로 벌려서 키울 수도 있어요.</p></div></div>';
        $('#info') && ($('#info').onclick = function () { LZ.go('reg', { id: c.id }); });
        $$('#half button').forEach(function (b) { b.onclick = function () { half = +b.dataset.h; draw(); }; });
        $('#zp').onclick = function () { setZoom(zoom + 0.25); }; $('#zm').onclick = function () { setZoom(zoom - 0.25); };
        var w = $('#who'); if (w) w.onclick = pickWho;
        table(); gestures();
      }
      function table() {
        var from = half * 9, h = '', o = cur.pick ? cur.pick.recs : null;
        for (var i = from; i < from + 9; i++) {
          h += '<div class="hole"><div class="hh"><b>' + u.LBL(i) + '</b><span class="chip y" style="padding:1px 8px">파 ' + c.holes[i][0] + '</span><span>' + u.fm(c.holes[i][1]) + 'm</span></div>' +
            (o && !expired() ? '<div class="rw"><div class="nm">' + esc(cur.pick.nick) + '님</div><div class="tx">' + rowSent(o[i]) + '</div></div>' : '') +
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
        l.innerHTML = '<div class="ann" style="margin:0 0 6px;font-size:13px">이 코스에 기록을 공개한 회원만 나와요</div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
          cur.authors.map(function (a) { return '<button class="sm ' + (a.nick === cur.pick.nick ? 'on' : '') + '" type="button" data-a="' + esc(a.nick) + '">' + esc(a.nick) + '님 (' + a.filled + '홀)</button>'; }).join('') + '</div>';
        $$('#wl [data-a]').forEach(function (b) {
          b.onclick = async function () {
            u.store.set('lz.who.' + c.id, b.dataset.a); ui.busy(true, '불러오고 있어요…');
            try { var mine = cur.mine; cur = await load(c.id, b.dataset.a); cur.mine = mine; LZ.cache.course = cur; ui.busy(false); if (!alive()) return; draw(); }
            catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
          };
        });
      }
      draw();
    }
  };

  /* ───── 홀 기록 편집 ───── */
  LZ.screens.edit = {
    show: async function (p, root, alive) {
      var cur = LZ.cache.course;
      if (!cur || cur.course.id !== p.id) { root.innerHTML = '<div class="scr">' + ui.hdr2('불러오는 중') + '<div class="bd nt">' + ui.skeleton(4) + '</div></div>'; cur = await load(p.id); if (!alive()) return; }
      var c = cur.course, i = p.i, rec = cur.mine[i], write = !expired();
      var ex = expired();
      LZ.guard = { kind: 'auto', dirty: function () { return LZ.rec.dirty(); }, save: function () { return LZ.rec.flush(); }, discard: function () { LZ.rec.discard(); if (LZ.cache.course) LZ.cache.course.stale = true; } };

      root.innerHTML = '<div class="scr">' + ui.hdr2(u.LBL(i) + ' · 파' + c.holes[i][0] + ' · ' + u.fm(c.holes[i][1]) + 'm', '<span class="sv" id="sv" role="status"></span>') +
        '<div class="bd nt">' + (ex ? '<div class="ban r">이용 기간이 끝나서 기록을 고칠 수 없어요. 운영자에게 문의해 주세요.</div>' : '<div class="ban g" id="wk" style="display:none"></div>') +
        '<div id="sb"></div><div id="rh"></div>' +
        (!ex && cur.pick ? '<div class="ann" id="oth"></div><button class="btn g" id="cp" type="button" style="margin-bottom:8px">' + esc(cur.pick.nick) + '님 기록 가져오기</button>' : '') +
        '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn g" id="prev" type="button" style="flex:1"' + (i === 0 ? ' disabled' : '') + '>이전 홀</button><button class="btn" id="next" type="button" style="flex:1">' + (i < 17 ? '다음 홀' : '표로 가기') + '</button></div></div></div>';

      /* 저장 상태 표시 */
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
      if (!ex && cur.pick) {
        var o = cur.pick.recs[i];
        $('#oth').textContent = cur.pick.nick + '님 기록\n' + (u.sent(o) || '기록 없음') + (o.o ? '\n참고사항: ' + o.o : '');
        $('#cp').onclick = function () {
          if (!o.r) return ui.toast(cur.pick.nick + '님은 이 홀에 기록이 없어요.');
          cur.mine[i] = u.cloneRec(o); LZ.rec.queue(c.id, i, cur.mine[i]);
          LZ.go('edit', { id: c.id, i: i }, { replace: true, skipGuard: true }).then(function () { ui.toast(cur.pick.nick + '님 기록을 내 기록으로 가져왔어요. 이제 마음대로 고치세요.', 4500); });
        };
      }
      function nav(ni) { LZ.go('edit', { id: c.id, i: ni }, { replace: true, skipGuard: true }); }
      $('#prev').onclick = function () { if (i > 0) nav(i - 1); };
      $('#next').onclick = function () { if (i < 17) nav(i + 1); else history.back(); };

      /* 화면이 꺼지지 않게 (이 화면에서만) */
      if (!ex) {
        LZ.wake.onchange = function (m) {
          var w = $('#wk'); if (!w) return;
          if (m === 'lock' || m === 'video') { w.style.display = 'block'; w.className = 'ban g'; w.textContent = '이 화면을 보는 동안 휴대폰 화면이 꺼지지 않아요.'; }
          else if (m === 'none') { w.style.display = 'block'; w.className = 'ban'; w.textContent = '이 휴대폰에서는 화면 꺼짐 방지가 안 될 수 있어요. 휴대폰 설정에서 "화면 자동 꺼짐" 시간을 길게 해 주세요.'; }
          else w.style.display = 'none';
        };
        LZ.wake.on(); LZ.wake.onchange(LZ.wake.mode);
      }
    }
  };
})();
