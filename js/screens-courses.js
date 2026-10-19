/* 코스 목록 · 코스 등록/수정 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;
  function canReg() { var k = S.user && S.user.kind; return k === 'op' || k === 'fixed'; }
  function draftKey() { return 'lz.draft.' + (S.user ? S.user.nick : ''); }

  /* ───── 코스 목록 ───── */
  LZ.screens.courses = {
    show: async function (p, root, alive) {
      var data = LZ.cache.courses || null, q = '';
      function banner() {
        var us = S.user;
        if (us.st === 'term_expired') return '<div class="ban r">이용 기간이 끝나서 내 기록 읽기만 할 수 있어요. 다른 회원 기록은 볼 수 없어요.</div>';
        if (us.kind === 'term') return '<div class="ban">' + (us.left > 0 ? '이용 기간이 ' + us.left + '일 남았어요.' : '이용 기간이 오늘까지예요.') + '</div>';
        return '';
      }
      function list() {
        var key = u.key(q), l = data.filter(function (c) { return !key || u.key(c.name).indexOf(key) >= 0; });
        $('#cnt').textContent = key ? '"' + q + '" 검색 결과 ' + l.length + '곳' : '등록된 코스 ' + data.length + '곳';
        $('#clist').innerHTML = l.map(function (c) {
          var par = 0, m = 0; c.holes.forEach(function (h) { par += h[0]; m += h[1]; });
          return '<div class="card" role="button" tabindex="0" data-id="' + esc(c.id) + '"><div style="flex:1;min-width:0"><div class="t">' + esc(c.name) + '</div><div class="s">18홀 · 파 ' + par + ' · 총 ' + u.fmt(m) + 'm</div>' +
            '<span class="chip ' + (c.mine ? 'y' : '') + '">내 기록 ' + c.mine + '/18홀</span>' + (S.user.st !== 'term_expired' ? ' <span class="chip">다른 회원 ' + c.others + '명</span>' : '') + '</div><span style="font-size:24px;color:#7B8396" aria-hidden="true">›</span></div>';
        }).join('') || '<div class="ann">' + (data.length ? '찾는 코스가 없어요. ' + (canReg() ? '스크린에 나오는 이름 그대로 아래 노란 버튼으로 등록할 수 있어요.' : '고정회원이나 운영자에게 등록을 부탁해 보세요.') : '아직 등록된 코스가 없어요. ' + (canReg() ? '아래 노란 버튼으로 첫 코스를 등록해 보세요.' : '')) + '</div>';
        $$('#clist .card').forEach(function (c) {
          function open() { LZ.go('holes', { id: c.dataset.id }); }
          c.onclick = open; c.onkeydown = function (e) { if (e.key === 'Enter') open(); };
        });
      }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr('코스') + '<div class="bd">' + banner() +
          '<input class="inp" id="q" type="search" placeholder="코스 이름 검색 (띄어쓰기 없이)" aria-label="코스 검색" autocomplete="off" value="' + esc(q) + '">' +
          '<div class="row2" style="margin:10px 0 8px"><span class="hint" id="cnt" style="margin:0"></span><button class="sm" id="rf" type="button">새로고침</button></div><div id="clist"></div></div>' +
          '<button class="fab ' + (canReg() ? '' : 'off') + '" id="fab" type="button">코스 등록' + (canReg() ? '' : ' (고정회원부터)') + '</button>' + ui.tabs('courses') + '</div>';
        $('#q').oninput = function (e) { var v = u.stripSpaces(e.target.value); if (v !== e.target.value) e.target.value = v; q = v; list(); };
        $('#fab').onclick = function () {
          if (!canReg()) return ui.toast('코스 등록은 고정회원부터 할 수 있어요. 운영자에게 문의해 주세요.', 4500);
          LZ.go('reg', {});
        };
        $('#rf').onclick = function () { load(true); };
        list();
      }
      async function load(force) {
        if (!force && data) { draw(); }
        else if (!data) { root.innerHTML = '<div class="scr">' + ui.hdr('코스') + '<div class="bd">' + ui.skeleton(4) + '</div>' + ui.tabs('courses') + '</div>'; }
        try {
          var r = await LZ.api('courses', {});
          if (!alive()) return; data = LZ.cache.courses = r.courses; draw(); if (force) ui.toast('새로 불러왔어요', 1800);
        } catch (e) {
          if (!alive()) return;
          if (data) { ui.toast(ui.errText(e), 4000); return; }
          if (e.code === 'auth') return;
          root.innerHTML = '<div class="scr">' + ui.hdr('코스') + '<div class="bd">' + ui.errorBlock(ui.errText(e)) + '</div>' + ui.tabs('courses') + '</div>'; $('[data-retry]', root).onclick = function () { load(); };
        }
      }
      await load();
    }
  };

  /* ───── 코스 등록 / 파·거리 고치기 ───── */
  var okName = /^[^\s\u3000\u200b\ufeff=+\-@<>"'`\\][^\s\u3000\u200b\ufeff<>"'`\\]{1,29}$/;
  var okM = function (v) { return /^\d{1,3}(\.\d)?$/.test(v) && parseFloat(v) > 0; };
  function blankState() { return { mode: 'new', id: null, name: '', par: Array(18).fill(null), m: Array(18).fill(''), rec: Array.from({ length: 18 }, u.emptyRec), on: Array(18).fill(false), half: 0 }; }

  LZ.screens.reg = {
    show: async function (p, root, alive) {
      var R, orig = '', isOp = S.user.kind === 'op';
      if (p.id) {                                                     // 파·거리 고치기
        root.innerHTML = '<div class="scr">' + ui.hdr2('파·거리 고치기') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
        var d = await LZ.api('course', { id: p.id, who: '' }); if (!alive()) return;
        R = blankState(); R.mode = 'edit'; R.id = d.course.id; R.name = d.course.name; R.par = d.course.holes.map(function (h) { return h[0]; }); R.m = d.course.holes.map(function (h) { return u.fm(h[1]); });
        orig = JSON.stringify([R.name, R.par, R.m]);
      } else {
        R = blankState(); var dr = u.store.getJSON(draftKey());
        if (dr && dr.name !== undefined) {
          var c = await ui.dialog({ title: '작성하던 코스가 있어요', body: '"' + (dr.name || '이름 없음') + '" 코스를 쓰다가 나가셨어요. 이어서 쓸까요?', cancel: 'new', buttons: [{ label: '이어서 쓰기', kind: 'y', value: 'cont' }, { label: '새로 시작하기', kind: 'g', value: 'new' }] });
          if (!alive()) return;
          if (c === 'cont') { R = Object.assign(blankState(), dr); R.rec = (dr.rec || []).map(u.cloneRec); while (R.rec.length < 18) R.rec.push(u.emptyRec()); } else u.store.del(draftKey());
        }
      }
      var ed = R.mode === 'edit';
      function dirty() {
        if (ed) return JSON.stringify([R.name, R.par, R.m]) !== orig;
        return !!(R.name || R.par.some(Boolean) || R.m.some(Boolean) || R.on.some(Boolean));
      }
      LZ.guard = { kind: 'form', dirty: dirty, body: ed ? '고친 내용이 아직 저장되지 않았어요.' : '지금 나가면 작성한 내용이 사라지거나, 임시 저장할 수 있어요.',
        draft: ed ? null : function () { u.store.setJSON(draftKey(), { name: R.name, par: R.par, m: R.m, rec: R.rec, on: R.on, half: R.half }); ui.toast('임시 저장했어요. 다음에 코스 등록을 누르면 이어서 쓸 수 있어요.', 4500); },
        discard: function () { if (!ed) u.store.del(draftKey()); } };
      if (ed) LZ.guard.draft = null;

      var courses = LZ.cache.courses || [];
      function dupInfo() {
        var v = R.name; if (ed || !v) return '';
        var k = u.key(v), ex = courses.filter(function (c) { return u.key(c.name) === k; })[0];
        if (ex) return '<div class="ban r" style="margin-top:8px">이미 등록된 코스예요. 새로 등록할 수 없고, 이 코스를 쓰시면 돼요.<br><button class="sm" data-open="' + esc(ex.id) + '" type="button" style="margin-top:8px">이 코스 열기</button></div>';
        var sim = k.length >= 3 ? courses.filter(function (c) { var ck = u.key(c.name); return ck.indexOf(k) >= 0 || k.indexOf(ck) >= 0; })[0] : null;
        return sim ? '<div class="ban" style="margin-top:8px">비슷한 코스가 있어요: ' + esc(sim.name) + '. 같은 코스인지 확인해 주세요.</div>' : '';
      }
      function summary() {
        var a = 0, rc = 0; for (var i = 0; i < 18; i++) { if (R.par[i] && okM(R.m[i])) a++; if (R.on[i] && R.rec[i].r) rc++; }
        $('#sum').textContent = '파·거리 입력 ' + a + '/18홀' + (ed ? '' : ' · 내 기록 입력 ' + rc + '홀');
      }
      function holes() {
        var from = R.half * 9, h = '';
        for (var i = from; i < from + 9; i++) {
          h += '<div class="hole" data-i="' + i + '"><div class="hh"><b>' + u.LBL(i) + '</b></div><div style="padding:8px 10px"><div class="row2" style="margin:0 0 8px"><span>파</span><div class="seg s3" style="flex:1;max-width:220px">' +
            [3, 4, 5].map(function (pp) { return '<button type="button" data-p="' + pp + '" class="' + (R.par[i] === pp ? 'on' : '') + '">' + pp + '</button>'; }).join('') + '</div></div>' +
            '<div class="row2" style="margin:0 0 6px"><span>거리</span><span style="display:flex;align-items:center;gap:6px"><input class="inp" data-m inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="' + u.LBL(i) + ' 거리(미터)" value="' + esc(R.m[i]) + '" placeholder="예: 52.5" style="width:124px;text-align:right"><span>m</span></span></div>' +
            (ed ? '' : '<div class="row2" style="margin:6px 0 0"><span>내 기록도 넣기</span><label class="sw"><input type="checkbox" data-on ' + (R.on[i] ? 'checked' : '') + ' aria-label="' + u.LBL(i) + ' 내 기록 넣기"><i></i></label></div><div data-rec style="' + (R.on[i] ? '' : 'display:none') + '"></div>') + '</div></div>';
        }
        $('#hl').innerHTML = h;
        $$('#hl .hole').forEach(function (el, k) {
          var i = +el.dataset.i;
          $$('[data-p]', el).forEach(function (b) { b.onclick = function () { R.par[i] = +b.dataset.p; $$('[data-p]', el).forEach(function (x) { x.classList.toggle('on', x === b); }); summary(); }; });
          var mi = $('[data-m]', el);
          mi.oninput = function () { R.m[i] = mi.value.trim(); mi.classList.toggle('bad', R.m[i] !== '' && !okM(R.m[i])); $('#err').textContent = R.m[i] !== '' && !okM(R.m[i]) ? '거리는 숫자로, 소수점 첫째 자리까지만 쓸 수 있어요. (예: 52.5)' : ''; summary(); };
          mi.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var nx = $$('#hl [data-m]')[k + 1]; if (nx) nx.focus(); else mi.blur(); } };
          var on = $('[data-on]', el);
          if (on) {
            var host = $('[data-rec]', el);
            function mk() { LZ.recUI(host, R.rec[i], { cmp: true, onChange: summary }); }
            if (R.on[i]) mk();
            on.onchange = function () { R.on[i] = on.checked; host.style.display = on.checked ? 'block' : 'none'; if (on.checked) mk(); else R.rec[i] = u.emptyRec(); summary(); };
          }
        });
        $$('#hl .hole').forEach(function () { /* 자리 표시 */ });
      }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2(ed ? '파·거리 고치기' : '코스 등록') + '<div class="bd nt">' +
          (ed ? '<div class="ban">' + (isOp ? '이름과 ' : '이름은 바꿀 수 없어요. ') + '파와 거리를 고칠 수 있어요. 고친 내용은 모든 회원에게 바로 적용돼요.</div>' : '<div class="ban">스크린에 나오는 코스 이름을 <b>띄어쓰기 없이</b> 그대로 적어 주세요. 이미 등록된 코스는 새로 등록할 수 없고, 그 코스를 쓰시면 돼요.</div>') +
          '<label class="lbl" for="rn" style="margin-top:0">코스 이름</label><input class="inp" id="rn" value="' + esc(R.name) + '" ' + (ed && !isOp ? 'disabled' : '') + ' maxlength="30" autocomplete="off" autocapitalize="none" placeholder="예: 목행충주파크골프CD"><div id="dup">' + dupInfo() + '</div>' +
          '<div class="hint">홀은 모두 18홀이에요. 파(3·4·5)와 거리(m, 소수점 첫째 자리까지)를 모든 홀에 넣어 주세요.' + (ed ? '' : ' 원하면 홀마다 내 기록도 함께 넣을 수 있어요.') + '</div>' +
          '<div class="seg" id="half" style="margin-top:12px"><button type="button" data-h="0" class="' + (R.half ? '' : 'on') + '">전반 9홀</button><button type="button" data-h="1" class="' + (R.half ? 'on' : '') + '">후반 9홀</button></div>' +
          '<div id="hl" style="margin-top:10px"></div><div class="msg" id="err" role="alert"></div><div class="ann" id="sum"></div>' +
          '<button class="btn y" id="save" type="button">' + (ed ? '수정 저장' : '등록하기') + '</button>' +
          (ed && isOp ? '<button class="btn r" id="del" type="button" style="margin-top:10px">이 코스 지우기 (운영자)</button>' : '') + '</div></div>';
        var rn = $('#rn');
        rn.oninput = function (e) { var v = u.stripSpaces(e.target.value); if (v !== e.target.value) e.target.value = v; R.name = v; e.target.classList.remove('bad'); $('#dup').innerHTML = dupInfo(); bindDup(); };
        function bindDup() { $$('[data-open]').forEach(function (b) { b.onclick = function () { LZ.go('holes', { id: b.dataset.open }, { replace: true }); }; }); }
        bindDup();
        $$('#half button').forEach(function (b) { b.onclick = function () { R.half = +b.dataset.h; $$('#half button').forEach(function (x) { x.classList.toggle('on', x === b); }); holes(); }; });
        holes(); summary();
        $('#save').onclick = save;
        var del = $('#del'); if (del) del.onclick = remove;
      }
      async function save() {
        var err = $('#err'); err.textContent = '';
        var name = R.name.trim();
        if (!ed || isOp) {
          if (!okName.test(name)) { err.textContent = '코스 이름을 띄어쓰기 없이 2~30자로 적어 주세요. (예: 목행충주파크골프CD)'; $('#rn').classList.add('bad'); $('#rn').focus(); return; }
          var k = u.key(name), ex = courses.filter(function (c) { return u.key(c.name) === k && c.id !== R.id; })[0];
          if (ex) { err.textContent = '이미 등록된 코스예요. 위의 "이 코스 열기"를 눌러 주세요.'; return; }
        }
        var miss = []; for (var i = 0; i < 18; i++) if (!R.par[i] || !okM(R.m[i])) miss.push(i);
        if (miss.length) {
          err.textContent = '파와 거리를 모두 넣어 주세요: ' + miss.slice(0, 6).map(u.LBL).join(', ') + (miss.length > 6 ? ' 외 ' + (miss.length - 6) + '홀' : '');
          if (!miss.some(function (i) { return Math.floor(i / 9) === R.half; })) { R.half = Math.floor(miss[0] / 9); $$('#half button').forEach(function (x) { x.classList.toggle('on', +x.dataset.h === R.half); }); holes(); }
          $$('#hl .hole').forEach(function (el) { el.classList.toggle('miss', miss.indexOf(+el.dataset.i) >= 0); });
          return;
        }
        var holesArr = R.par.map(function (pp, i) { return [pp, parseFloat(R.m[i])]; });
        $('#save').disabled = true; ui.busy(true, ed ? '저장하고 있어요…' : '등록하고 있어요…');
        try {
          if (ed) {
            var body = { id: R.id, holes: holesArr }; if (isOp && name !== JSON.parse(orig)[0]) body.name = name;
            await LZ.api('editCourse', body, { retry: 0 }); ui.busy(false);
            LZ.cache.courses = null; LZ.cache.course = null; LZ.guard = null; ui.toast('파와 거리를 고쳤어요'); history.back();
          } else {
            var recs = R.rec.map(function (r, i) { return R.on[i] && r.r ? r : null; });
            var r = await LZ.api('register', { name: name, holes: holesArr, recs: recs }, { retry: 0 }); ui.busy(false);
            u.store.del(draftKey()); LZ.cache.courses = null; LZ.guard = null; ui.toast('"' + name + '" 코스를 등록했어요', 4500);
            await LZ.go('holes', { id: r.id }, { replace: true });
          }
        } catch (e) {
          ui.busy(false); var sb = $('#save'); if (sb) sb.disabled = false;
          if (e.code === 'dup' && e.data && e.data.id) { courses = courses.concat([{ id: e.data.id, name: e.data.name }]); $('#dup').innerHTML = dupInfo(); bindDup2(); }
          if ($('#err')) $('#err').textContent = ui.errText(e);
        }
      }
      function bindDup2() { $$('[data-open]').forEach(function (b) { b.onclick = function () { LZ.guard = null; LZ.go('holes', { id: b.dataset.open }, { replace: true }); }; }); }
      async function remove() {
        var c1 = await ui.confirm('이 코스를 지울까요?', '"' + R.name + '" 코스와 모든 회원의 이 코스 기록이 함께 사라져요. 되돌릴 수 없어요.', '지우기', true);
        if (!c1) return;
        var c2 = await ui.confirm('정말 지울까요?', '한 번 더 확인해요. 지우면 모든 회원의 기록이 없어져요.', '네, 지울게요', true);
        if (!c2) return;
        ui.busy(true, '지우고 있어요…');
        try { await LZ.api('delCourse', { id: R.id }, { retry: 0 }); ui.busy(false); LZ.cache.courses = null; LZ.guard = null; ui.toast('코스를 지웠어요'); await LZ.go('courses', {}, { reset: true }); }
        catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
      }
      draw();
    }
  };
})();
