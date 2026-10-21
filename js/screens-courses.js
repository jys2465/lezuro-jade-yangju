/* 코스 목록 · 코스 등록(전반 → 후반 두 단계) · 파·거리 고치기 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;
  function draftKey(stage, id) { return 'lz.draft.' + (S.user ? S.user.nick : '') + '.' + stage + (id ? '.' + id : ''); }
  var okM = function (v) { return /^\d{1,3}(\.\d)?$/.test(v) && parseFloat(v) > 0; };
  function blank9() { return { par: Array(9).fill(null), m: Array(9).fill(''), rec: Array.from({ length: 9 }, u.emptyRec), on: Array(9).fill(false) }; }

  /* ───── 코스 목록 ───── */
  LZ.screens.courses = {
    show: async function (p, root, alive) {
      var data = LZ.cache.courses || null, canReg = LZ.cache.canReg, q = '';
      function list() {
        var key = u.key(q), l = data.filter(function (c) { return !key || u.key(c.name).indexOf(key) >= 0; });
        $('#cnt').textContent = key ? '"' + q + '" 검색 결과 ' + l.length + '곳' : '등록된 코스 ' + data.filter(function (c) { return c.stage === 'done'; }).length + '곳';
        var ex = ui.expired();
        $('#clist').innerHTML = l.map(function (c) {
          if (c.stage === 'front') {
            return '<div class="card" role="button" tabindex="0" data-id="' + esc(c.id) + '" data-front="1" style="border-color:var(--pri)"><div style="flex:1;min-width:0"><div class="t">' + esc(c.name) + '</div><div class="s">전반 9홀만 저장됨 · 나에게만 보여요</div><span class="chip r">후반 9홀 입력 필요</span></div><span style="font-size:24px;color:var(--mut2)" aria-hidden="true">›</span></div>';
          }
          var par = 0, m = 0; c.holes.forEach(function (h) { par += h[0]; m += h[1]; });
          return '<div class="card" role="button" tabindex="0" data-id="' + esc(c.id) + '"><div style="flex:1;min-width:0"><div class="t">' + esc(c.name) + '</div><div class="s">18홀 · 파 ' + par + ' · 총 ' + u.fmt(m) + 'm</div>' +
            '<span class="chip ' + (c.mine ? 'y' : '') + '">내 기록 ' + c.mine + '/18홀</span>' + (!ex ? ' <span class="chip">다른 회원 ' + c.others + '명</span>' : '') + '</div><span style="font-size:24px;color:var(--mut2)" aria-hidden="true">›</span></div>';
        }).join('') || '<div class="ann">' + (data.length ? '찾는 코스가 없어요. ' + (canReg ? '스크린에 나오는 이름 그대로 아래 버튼으로 등록할 수 있어요.' : '월간·연간회원이 되면 직접 등록할 수 있어요.') : '아직 등록된 코스가 없어요. ' + (canReg ? '아래 버튼으로 첫 코스를 등록해 보세요.' : '')) + '</div>';
        $$('#clist .card').forEach(function (c) {
          function open() { if (c.dataset.front) LZ.go('regBack', { id: c.dataset.id }); else LZ.go('holes', { id: c.dataset.id }); }
          c.onclick = open; c.onkeydown = function (e) { if (e.key === 'Enter') open(); };
        });
      }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr('코스') + '<div class="bd">' + LZ.memberBanner() +
          '<input class="inp" id="q" type="search" placeholder="코스 이름 검색 (띄어쓰기 없이)" aria-label="코스 검색" autocomplete="off" value="' + esc(q) + '">' +
          '<div class="row2" style="margin:10px 0 8px"><span class="hint" id="cnt" style="margin:0"></span><button class="sm" id="rf" type="button">새로고침</button></div><div id="clist"></div></div>' +
          '<button class="fab ' + (canReg ? '' : 'off') + '" id="fab" type="button">코스 등록' + (canReg ? '' : ' (월간·연간)') + '</button>' + ui.tabs('courses') + '</div>';
        LZ.bindMemberBanner(root);
        $('#q').oninput = function (e) { var v = u.stripSpaces(e.target.value); if (v !== e.target.value) e.target.value = v; q = v; list(); };
        $('#fab').onclick = function () {
          if (!canReg) return ui.toast(ui.expired() ? '이용 기간이 끝났어요. 이용권을 결제하면 코스를 등록할 수 있어요.' : '코스 등록은 월간·연간회원부터 할 수 있어요.', 4500);
          LZ.go('reg', {});
        };
        $('#rf').onclick = function () { load(true); };
        list();
      }
      async function load(force) {
        if (!force && data) draw();
        else if (!data) root.innerHTML = '<div class="scr">' + ui.hdr('코스') + '<div class="bd">' + ui.skeleton(4) + '</div>' + ui.tabs('courses') + '</div>';
        try {
          var both = await Promise.all([LZ.api('courses', {}), LZ.refreshMe()]);
          if (!alive()) return; data = LZ.cache.courses = both[0].courses; canReg = LZ.cache.canReg = !!both[0].canReg; draw();
          if (force) ui.toast('새로 불러왔어요', 1800);
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

  /* ───── 9홀 입력 칸(전반 또는 후반) ───── */
  function holeForm(host, half, st, o) {
    o = o || {};
    var h = '';
    for (var k = 0; k < 9; k++) {
      var i = half * 9 + k;
      h += '<div class="hole" data-k="' + k + '"><div class="hh"><b>' + u.LBL(i) + '</b></div><div style="padding:8px 10px"><div class="row2" style="margin:0 0 8px"><span>파</span><div class="seg s3" style="flex:1;max-width:220px">' +
        [3, 4, 5].map(function (pp) { return '<button type="button" data-p="' + pp + '" class="' + (st.par[k] === pp ? 'on' : '') + '" aria-pressed="' + (st.par[k] === pp) + '">' + pp + '</button>'; }).join('') + '</div></div>' +
        '<div class="row2" style="margin:0 0 6px"><span>거리</span><span style="display:flex;align-items:center;gap:6px"><input class="inp" data-m inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="' + u.LBL(i) + ' 거리(미터)" value="' + esc(st.m[k]) + '" placeholder="예: 52.5" style="width:124px;text-align:right"><span>m</span></span></div>' +
        (o.rec ? '<div class="row2" style="margin:6px 0 0"><span>내 기록도 넣기</span><label class="sw"><input type="checkbox" data-on ' + (st.on[k] ? 'checked' : '') + ' aria-label="' + u.LBL(i) + ' 내 기록 넣기"><i></i></label></div><div data-rec style="' + (st.on[k] ? '' : 'display:none') + '"></div>' : '') + '</div></div>';
    }
    host.innerHTML = h;
    $$('.hole', host).forEach(function (el) {
      var k = +el.dataset.k;
      $$('[data-p]', el).forEach(function (b) { b.onclick = function () { st.par[k] = +b.dataset.p; $$('[data-p]', el).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); el.classList.remove('miss'); o.onChange && o.onChange(); }; });
      var mi = $('[data-m]', el);
      mi.oninput = function () { st.m[k] = mi.value.trim(); var bad = st.m[k] !== '' && !okM(st.m[k]); mi.classList.toggle('bad', bad); o.onErr && o.onErr(bad ? '거리는 숫자로, 소수점 첫째 자리까지만 쓸 수 있어요. (예: 52.5)' : ''); o.onChange && o.onChange(); };
      mi.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var nx = $$('[data-m]', host)[k + 1]; if (nx) nx.focus(); else mi.blur(); } };
      var on = $('[data-on]', el);
      if (on) {
        var rh = $('[data-rec]', el);
        var mk = function () { LZ.recUI(rh, st.rec[k], { cmp: true, onChange: function () { o.onChange && o.onChange(); } }); };
        if (st.on[k]) mk();
        on.onchange = function () { st.on[k] = on.checked; rh.style.display = on.checked ? 'block' : 'none'; if (on.checked) mk(); else st.rec[k] = u.emptyRec(); o.onChange && o.onChange(); };
      }
    });
  }
  function missing(st) { var miss = []; for (var k = 0; k < 9; k++) if (!st.par[k] || !okM(st.m[k])) miss.push(k); return miss; }
  function markMiss(host, miss) { $$('.hole', host).forEach(function (el) { el.classList.toggle('miss', miss.indexOf(+el.dataset.k) >= 0); }); var f = $('.hole.miss', host); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function holesOf(st) { return st.par.map(function (pp, k) { return [pp, parseFloat(st.m[k])]; }); }
  function recsOf(st) { return st.rec.map(function (r, k) { return st.on[k] && r.r ? u.cloneRec(r) : null; }); }
  function recCount(st) { var n = 0; for (var k = 0; k < 9; k++) if (st.on[k] && st.rec[k].r) n++; return n; }
  function restore(dr) { var st = blank9(); if (!dr) return st; ['par', 'm', 'on'].forEach(function (f) { if (Array.isArray(dr[f])) st[f] = dr[f].slice(0, 9); }); if (Array.isArray(dr.rec)) st.rec = dr.rec.slice(0, 9).map(u.cloneRec); while (st.rec.length < 9) st.rec.push(u.emptyRec()); return st; }

  /* 이름 확인 결과 상자 */
  function nameBox(res) {
    if (!res) return '<div class="ban g" style="margin-top:8px">등록할 수 있는 이름이에요.</div>';
    if (res.code === 'dup') return '<div class="ban r" style="margin-top:8px">' + esc(res.msg) + '<br><button class="sm" data-open="' + esc(res.id) + '" type="button" style="margin-top:8px">"' + esc(res.name) + '" 열고 내 기록 넣기</button></div>';
    if (res.code === 'suggest') return '<div class="ban" style="margin-top:8px">' + esc(res.msg) + '<br><button class="sm on" data-sug="' + esc(res.suggest) + '" type="button" style="margin-top:8px">"' + esc(res.suggest) + '"(으)로 바꾸기</button></div>';
    if (res.code === 'similar') return '<div class="ban" style="margin-top:8px">' + esc(res.msg) + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="sm on" data-conf type="button">네, 다른 코스예요</button><button class="sm" data-open="' + esc(res.id) + '" type="button">"' + esc(res.name) + '" 열기</button></div></div>';
    return '<div class="ban r" style="margin-top:8px">' + esc(res.msg) + '</div>';
  }

  /* ───── 코스 등록 1단계: 이름 + 전반 9홀 ───── */
  LZ.screens.reg = {
    show: async function (p, root, alive) {
      var st = blank9(), name = '', confirmed = false, chk = undefined, chkFor = null;
      var dr = u.store.getJSON(draftKey('front'));
      if (dr && dr.name !== undefined) {
        var c = await ui.dialog({ title: '작성하던 코스가 있어요', body: '"' + (dr.name || '이름 없음') + '" 코스를 쓰다가 나가셨어요. 이어서 쓸까요?', cancel: 'new', buttons: [{ label: '이어서 쓰기', kind: 'y', value: 'cont' }, { label: '새로 시작하기', kind: 'g', value: 'new' }] });
        if (!alive()) return;
        if (c === 'cont') { st = restore(dr); name = dr.name || ''; } else u.store.del(draftKey('front'));
      }
      function dirty() { return !!(name || st.par.some(Boolean) || st.m.some(Boolean) || st.on.some(Boolean)); }
      LZ.guard = { kind: 'form', dirty: dirty, body: '지금 나가면 작성한 내용이 사라지거나, 임시 저장할 수 있어요.',
        draft: function () { u.store.setJSON(draftKey('front'), { name: name, par: st.par, m: st.m, rec: st.rec, on: st.on }); ui.toast('임시 저장했어요. 다음에 코스 등록을 누르면 이어서 쓸 수 있어요.', 4500); },
        discard: function () { u.store.del(draftKey('front')); } };

      root.innerHTML = '<div class="scr">' + ui.hdr2('코스 등록 · 1단계 전반') + '<div class="bd nt">' +
        '<div class="ban">스크린에 나오는 코스 이름을 <b>띄어쓰기 없이 한 칸에</b> 그대로 적어 주세요. 끝의 AB·CD·BC 같은 조합까지 함께 적어요.<br>먼저 <b>전반 9홀</b>을 저장하고, 이어서 후반 9홀을 넣어요.</div>' +
        '<label class="lbl" for="rn" style="margin-top:0">코스 이름</label><input class="inp" id="rn" value="' + esc(name) + '" maxlength="30" autocomplete="off" autocapitalize="characters" placeholder="예: 목행충주호파크골프CD"><div id="nb"></div>' +
        '<div class="hint">파(3·4·5)와 거리(m, 소수점 첫째 자리까지)를 9홀 모두 넣어 주세요. 원하면 홀마다 내 기록도 함께 넣을 수 있어요.</div>' +
        '<h3 style="font-size:17px;margin:16px 0 8px">전반 9홀 (1홀 ~ 9홀)</h3><div id="hl"></div><div class="msg" id="err" role="alert"></div><div class="ann" id="sum"></div>' +
        '<button class="btn" id="save" type="button">전반 저장하고 후반으로</button></div></div>';
      var rn = $('#rn');
      function summary() { var a = 9 - missing(st).length; $('#sum').textContent = '파·거리 입력 ' + a + '/9홀 · 내 기록 입력 ' + recCount(st) + '홀'; }
      function bindBox() {
        $$('#nb [data-open]').forEach(function (b) { b.onclick = function () { LZ.go('holes', { id: b.dataset.open }, { replace: true }); }; });
        $$('#nb [data-sug]').forEach(function (b) { b.onclick = function () { name = rn.value = b.dataset.sug; confirmed = false; check(); }; });
        $$('#nb [data-conf]').forEach(function (b) { b.onclick = function () { confirmed = true; $('#nb').innerHTML = '<div class="ban g" style="margin-top:8px">다른 코스로 등록할게요.</div>'; }; });
      }
      var seq = 0;
      async function check() {
        var my = ++seq, v = name; if (!v) { $('#nb').innerHTML = ''; chk = undefined; return; }
        try {
          var r = await LZ.api('nameCheck', { name: v, confirm: confirmed ? 1 : 0 }, { retry: 0, timeout: 15000 });
          if (my !== seq || !alive()) return; chk = r.res; chkFor = v;
          if (chk && chk.code === 'similar' && confirmed) chk = null;
          $('#nb').innerHTML = nameBox(chk); bindBox();
        } catch (e) { if (my === seq && $('#nb')) $('#nb').innerHTML = ''; }
      }
      var later = u.debounce(check, 600);
      rn.oninput = function (e) { var v = u.stripSpaces(e.target.value); if (v !== e.target.value) e.target.value = v; name = v; confirmed = false; chk = undefined; rn.classList.remove('bad'); later(); };
      holeForm($('#hl'), 0, st, { rec: true, onChange: summary, onErr: function (t) { $('#err').textContent = t; } });
      summary(); if (name) check();

      async function handleName(code, d) {
        if (code === 'dup') {
          var a = await ui.dialog({ title: '이미 등록된 코스예요', body: (d.msg || '') + '\n입력한 내 기록은 그 코스에서 다시 넣어 주세요.', cancel: 'stay', buttons: [{ label: '"' + d.name + '" 열기', kind: 'y', value: 'open' }, { label: '이름 고치기', kind: 'g', value: 'stay' }] });
          if (a === 'open') { LZ.guard = null; u.store.del(draftKey('front')); LZ.go('holes', { id: d.id }, { replace: true }); }
          return false;
        }
        if (code === 'suggest') {
          var b = await ui.dialog({ title: '이름을 이렇게 고칠까요?', body: d.msg, cancel: 'stay', buttons: [{ label: '"' + d.suggest + '"(으)로 등록', kind: 'y', value: 'ok' }, { label: '이름 다시 보기', kind: 'g', value: 'stay' }] });
          if (b === 'ok') { name = rn.value = d.suggest; confirmed = false; return true; }
          return false;
        }
        if (code === 'similar') {
          var c2 = await ui.dialog({ title: '비슷한 코스가 있어요', body: d.msg, cancel: 'stay', buttons: [{ label: '네, 다른 코스예요', kind: 'y', value: 'ok' }, { label: '"' + d.name + '" 열기', kind: 'g', value: 'open' }, { label: '이름 고치기', kind: 'g', value: 'stay' }] });
          if (c2 === 'ok') { confirmed = true; return true; }
          if (c2 === 'open') { LZ.guard = null; LZ.go('holes', { id: d.id }, { replace: true }); }
          return false;
        }
        return false;
      }
      async function save() {
        var err = $('#err'); err.textContent = '';
        if (!/^[^=+\-@<>"'`\\][^<>"'`\\]{1,29}$/.test(name)) { err.textContent = '코스 이름을 띄어쓰기 없이 2~30자로 적어 주세요. (예: 목행충주호파크골프CD)'; rn.classList.add('bad'); rn.focus(); return; }
        var miss = missing(st);
        if (miss.length) { err.textContent = '파와 거리를 모두 넣어 주세요: ' + miss.map(function (k) { return u.LBL(k); }).join(', '); markMiss($('#hl'), miss); return; }
        for (var tries = 0; tries < 3; tries++) {
          $('#save').disabled = true; ui.busy(true, '전반 9홀을 저장하고 있어요…');
          try {
            var r = await LZ.api('regFront', { name: name, holes: holesOf(st), recs: recsOf(st), confirm: confirmed ? 1 : 0 }, { retry: 0 });
            ui.busy(false); u.store.del(draftKey('front')); LZ.guard = null; LZ.cache.courses = null;
            await ui.dialog({ title: '전반 9홀 저장 완료', body: '전반 9홀 저장이 완료되었어요.\n후반 9홀 등록으로 갈게요.', cancel: true, buttons: [{ label: '후반 9홀 입력하기', kind: 'y', value: true }] });
            await LZ.go('regBack', { id: r.id, fresh: 1 }, { replace: true, skipGuard: true });
            return;
          } catch (e) {
            ui.busy(false); var sb = $('#save'); if (sb) sb.disabled = false;
            if (['dup', 'suggest', 'similar'].indexOf(e.code) >= 0) {
              var again = await handleName(e.code, Object.assign({ msg: e.message }, e.data));
              if (!alive()) return;
              check(); if (again) continue; return;
            }
            if ($('#err')) $('#err').textContent = ui.errText(e);
            return;
          }
        }
      }
      $('#save').onclick = save;
    }
  };

  /* ───── 코스 등록 2단계: 후반 9홀 ───── */
  LZ.screens.regBack = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('코스 등록 · 2단계 후반') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('course', { id: p.id, who: '' }); if (!alive()) return;
      var c = d.course;
      if (c.stage === 'done') { await LZ.go('holes', { id: c.id }, { replace: true, skipGuard: true }); return; }
      var st = restore(u.store.getJSON(draftKey('back', c.id)));
      function dirty() { return st.par.some(Boolean) || st.m.some(Boolean) || st.on.some(Boolean); }
      LZ.guard = { kind: 'form', dirty: dirty, body: '후반 9홀을 넣어야 다른 회원에게도 코스가 보여요. 지금 나가면 작성한 내용이 사라지거나, 임시 저장할 수 있어요.',
        draft: function () { u.store.setJSON(draftKey('back', c.id), { par: st.par, m: st.m, rec: st.rec, on: st.on }); ui.toast('임시 저장했어요. 코스 목록에서 이 코스를 누르면 이어서 쓸 수 있어요.', 4500); },
        discard: function () { u.store.del(draftKey('back', c.id)); } };
      var fp = 0, fm = 0; c.holes.slice(0, 9).forEach(function (h) { fp += h[0]; fm += h[1]; });
      root.innerHTML = '<div class="scr">' + ui.hdr2('코스 등록 · 2단계 후반') + '<div class="bd nt">' +
        '<div class="ban g"><b>' + esc(c.name) + '</b><br>전반 9홀 저장 완료 (파 ' + fp + ' · ' + u.fmt(fm) + 'm)</div>' +
        '<div class="ban">후반 9홀까지 넣어야 다른 회원에게도 이 코스가 보여요. 그 전까지는 나에게만 보여요.</div>' +
        '<h3 style="font-size:17px;margin:12px 0 8px">후반 9홀 (1홀(10홀) ~ 9홀(18홀))</h3><div id="hl"></div><div class="msg" id="err" role="alert"></div><div class="ann" id="sum"></div>' +
        '<button class="btn" id="save" type="button">등록하기</button>' +
        '<button class="btn g" id="del" type="button" style="margin-top:10px">이 코스 등록 취소 (전반도 지워요)</button></div></div>';
      function summary() { $('#sum').textContent = '파·거리 입력 ' + (9 - missing(st).length) + '/9홀 · 내 기록 입력 ' + recCount(st) + '홀'; }
      holeForm($('#hl'), 1, st, { rec: true, onChange: summary, onErr: function (t) { $('#err').textContent = t; } });
      summary();
      $('#save').onclick = async function () {
        var err = $('#err'); err.textContent = '';
        var miss = missing(st);
        if (miss.length) { err.textContent = '파와 거리를 모두 넣어 주세요: ' + miss.map(function (k) { return u.LBL(9 + k); }).join(', '); markMiss($('#hl'), miss); return; }
        $('#save').disabled = true; ui.busy(true, '등록하고 있어요…');
        try {
          await LZ.api('regBack', { id: c.id, holes: holesOf(st), recs: recsOf(st) }, { retry: 0 });
          ui.busy(false); u.store.del(draftKey('back', c.id)); LZ.guard = null; LZ.cache.courses = null; LZ.cache.course = null;
          ui.toast('"' + c.name + '" 18홀 등록을 마쳤어요. 이제 모든 회원에게 보여요.', 5000);
          await LZ.go('holes', { id: c.id }, { replace: true, skipGuard: true });
        } catch (e) { ui.busy(false); var sb = $('#save'); if (sb) sb.disabled = false; if ($('#err')) $('#err').textContent = ui.errText(e); }
      };
      $('#del').onclick = async function () {
        if (!(await ui.confirm('등록을 취소할까요?', '"' + c.name + '" 코스의 전반 9홀과 넣어 둔 내 기록이 지워져요.', '등록 취소', true))) return;
        ui.busy(true, '지우고 있어요…');
        try { await LZ.api('delCourse', { id: c.id }, { retry: 0 }); ui.busy(false); u.store.del(draftKey('back', c.id)); LZ.guard = null; LZ.cache.courses = null; ui.toast('등록을 취소했어요'); await LZ.go('courses', {}, { reset: true, skipGuard: true }); }
        catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
      };
    }
  };

  /* ───── 파·거리 고치기 (처음 등록한 분, 운영자·관리자) ───── */
  LZ.screens.courseEdit = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('파·거리 고치기') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('course', { id: p.id, who: '' }); if (!alive()) return;
      var c = d.course, staff = ui.isStaff(), admin = ui.isAdmin(), half = 0, name = c.name;
      var H = [0, 1].map(function (hf) { var st = blank9(); for (var k = 0; k < 9; k++) { var h = c.holes[hf * 9 + k] || [0, 0]; st.par[k] = h[0] || null; st.m[k] = h[1] ? u.fm(h[1]) : ''; } return st; });
      var orig = JSON.stringify([name, H[0].par, H[0].m, H[1].par, H[1].m]);
      LZ.guard = { kind: 'form', dirty: function () { return JSON.stringify([name, H[0].par, H[0].m, H[1].par, H[1].m]) !== orig; }, body: '고친 내용이 아직 저장되지 않았어요.' };
      root.innerHTML = '<div class="scr">' + ui.hdr2('파·거리 고치기') + '<div class="bd nt">' +
        '<div class="ban">' + (staff ? '이름과 ' : '이름은 운영자·관리자만 바꿀 수 있어요. ') + '파와 거리를 고칠 수 있어요. 고친 내용은 모든 회원에게 바로 적용돼요.</div>' +
        '<label class="lbl" for="rn" style="margin-top:0">코스 이름</label><input class="inp" id="rn" value="' + esc(name) + '" ' + (staff ? '' : 'disabled') + ' maxlength="30" autocomplete="off">' +
        (c.stage === 'done' ? '<div class="seg" id="half" style="margin-top:12px"><button type="button" data-h="0" class="on">전반 9홀</button><button type="button" data-h="1">후반 9홀</button></div>' : '') +
        '<div id="hl" style="margin-top:10px"></div><div class="msg" id="err" role="alert"></div>' +
        '<button class="btn" id="save" type="button">수정 저장</button>' + (admin ? '<button class="btn r" id="del" type="button" style="margin-top:10px">이 코스 지우기 (관리자)</button>' : '') + '</div></div>';
      var rn = $('#rn'); rn.oninput = function (e) { var v = u.stripSpaces(e.target.value); if (v !== e.target.value) e.target.value = v; name = v; };
      function form() { holeForm($('#hl'), half, H[half], { onErr: function (t) { $('#err').textContent = t; } }); }
      $$('#half button').forEach(function (b) { b.onclick = function () { half = +b.dataset.h; $$('#half button').forEach(function (x) { x.classList.toggle('on', x === b); }); form(); }; });
      form();
      $('#save').onclick = async function () {
        var err = $('#err'); err.textContent = '';
        for (var hf = 0; hf < (c.stage === 'done' ? 2 : 1); hf++) {
          var miss = missing(H[hf]);
          if (miss.length) { if (half !== hf) { half = hf; $$('#half button').forEach(function (x) { x.classList.toggle('on', +x.dataset.h === hf); }); form(); } err.textContent = '파와 거리를 모두 넣어 주세요.'; markMiss($('#hl'), miss); return; }
        }
        var body = { id: c.id, front: holesOf(H[0]) }; if (c.stage === 'done') body.back = holesOf(H[1]);
        if (staff && name !== c.name) body.name = name;
        $('#save').disabled = true; ui.busy(true, '저장하고 있어요…');
        try { await LZ.api('editCourse', body, { retry: 0 }); ui.busy(false); LZ.cache.courses = null; LZ.cache.course = null; LZ.guard = null; ui.toast('고쳤어요'); history.back(); }
        catch (e) { ui.busy(false); var sb = $('#save'); if (sb) sb.disabled = false; if ($('#err')) $('#err').textContent = ui.errText(e); }
      };
      var del = $('#del');
      if (del) del.onclick = async function () {
        if (!(await ui.confirm('이 코스를 지울까요?', '"' + c.name + '" 코스와 모든 회원의 이 코스 기록이 함께 사라져요. 되돌릴 수 없어요.', '지우기', true))) return;
        if (!(await ui.confirm('정말 지울까요?', '한 번 더 확인해요. 지우면 모든 회원의 기록이 없어져요.', '네, 지울게요', true))) return;
        ui.busy(true, '지우고 있어요…');
        try { await LZ.api('delCourse', { id: c.id }, { retry: 0 }); ui.busy(false); LZ.cache.courses = null; LZ.cache.course = null; LZ.guard = null; ui.toast('코스를 지웠어요'); await LZ.go('courses', {}, { reset: true }); }
        catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
      };
    }
  };
})();
