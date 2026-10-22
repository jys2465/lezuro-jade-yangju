/* 홀 기록 입력 부품(recUI)과 자동 저장 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, $ = u.$, $$ = u.$$;

  /* 기록 한 칸을 고치는 화면. rec 를 직접 고치고 onChange(rec) 를 부릅니다. */
  var MAXN = 15;                                                         // 좌측·우측 각각 15칸까지
  function sig(r) { return r.n ? (r.d === 'L' ? -r.n : r.n) : 0; }        // 좌측은 −, 우측은 +
  LZ.recUI = function (host, rec, o) {
    o = o || {};
    var dis = !!o.disabled;
    host.innerHTML = '<div class="recui' + (o.cmp ? ' cmp' : '') + '"><div class="sbox" data-sent aria-live="polite"></div>' +
      '<div class="l2"><span>기준을 하나 고르세요</span></div>' +
      '<div class="refs"><button type="button" data-ref="f">최초화면</button><button type="button" data-ref="c">홀컵</button><button type="button" data-ref="u">내가 정한 곳</button></div>' +
      '<div data-un style="display:none"><div class="l2"><span>이름을 적어 주세요</span></div><input class="inp" data-name maxlength="10" placeholder="예: 우측 나무" aria-label="내가 정한 곳 이름"><div class="qn">' +
      ['나무', '깃대', '벤치', '표지판', '벙커'].map(function (n) { return '<button type="button" class="sm" data-qn="' + n + '">' + n + '</button>'; }).join('') + '</div></div>' +
      '<div class="l2"><span>방향과 칸 수</span><span>− 좌측 · + 우측 (15칸까지)</span></div>' +
      '<div class="stepper dir"><button type="button" class="L" data-s="-1" aria-label="좌측으로 한 칸">−</button><output data-dir aria-live="polite"><b>0</b><small>그대로</small></output><button type="button" class="R" data-s="1" aria-label="우측으로 한 칸">+</button></div>' +
      '<div class="dscale" aria-hidden="true"><span>◀ 좌측</span><span>0 = 그대로</span><span>우측 ▶</span></div>' +
      '<div class="quick" role="group" aria-label="칸 수 바로 고르기">' + [-10, -5, -3, 0, 3, 5, 10].map(function (v) { return '<button type="button" data-q="' + v + '" class="' + (v < 0 ? 'L' : v > 0 ? 'R' : 'Z') + '" aria-label="' + (v < 0 ? '좌측 ' + (-v) + '칸' : v > 0 ? '우측 ' + v + '칸' : '그대로') + '">' + (v > 0 ? '+' + v : v < 0 ? '−' + (-v) : '0') + '</button>'; }).join('') + '</div>' +
      '<div class="l2"><span>타격감 (17 = 50M, 1마다 5M)</span><button type="button" class="lnk" data-pclear>17로 되돌리기</button></div>' +
      '<div class="stepper" data-pw><button type="button" data-ps="-1" aria-label="타격감 줄이기">−</button><input class="pin" data-pin type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="17" aria-label="타격감 숫자 직접 입력"><button type="button" data-ps="1" aria-label="타격감 늘리기">+</button></div>' +
      '<div class="hint" data-pm style="margin:0 0 4px;text-align:center"></div>' +
      '<div class="l2"><span>참고사항</span><span data-cnt>0/20</span></div><input class="inp" data-note maxlength="20" placeholder="예: 바람 약, 살짝 짧게" aria-label="참고사항"></div>';
    function q(s) { return $(s, host); }
    function upd() {
      var s = u.sent(rec);
      q('[data-sent]').innerHTML = s ? u.sentHTML(rec) : '<span class="none">기준을 하나 골라 주세요</span>';
      $$('[data-ref]', host).forEach(function (b) { b.classList.toggle('on', b.dataset.ref === rec.r); });
      q('[data-un]').style.display = rec.r === 'u' ? 'block' : 'none';
      var sv = sig(rec), out = q('[data-dir]');
      out.className = sv < 0 ? 'L' : sv > 0 ? 'R' : '';
      $$('[data-q]', host).forEach(function (b) { b.classList.toggle('on', +b.dataset.q === sv); });
      out.innerHTML = '<b>' + (sv > 0 ? '+' + sv : sv < 0 ? '−' + (-sv) : '0') + '</b><small>' + (sv < 0 ? '좌측 ' + (-sv) + '칸' : sv > 0 ? '우측 ' + sv + '칸' : '그대로') + '</small>';
      var pi = q('[data-pin]'); if (document.activeElement !== pi) pi.value = String(rec.p >= 8 && rec.p <= 40 ? rec.p : u.PW0);
      if (!(rec.p >= 8 && rec.p <= 40)) rec.p = u.PW0;
      q('[data-pm]').innerHTML = '<b style="font-size:1.25em;color:var(--ink)">' + rec.p + '(' + u.pwM(rec.p) + 'M) 정도</b>' + (rec.p === u.PW0 ? ' <span style="color:var(--mut)">(기본값)</span>' : '');
      q('[data-pclear]').style.visibility = rec.p !== u.PW0 ? 'visible' : 'hidden';
      q('[data-cnt]').textContent = (rec.o || '').length + '/20';
    }
    function ch() { upd(); if (o.onChange) o.onChange(rec); }
    function blocked() { if (o.msg) LZ.ui.toast(o.msg); }
    function needRef() { $('.refs', host).classList.add('warn'); setTimeout(function () { var r = $('.refs', host); if (r) r.classList.remove('warn'); }, 1800); }
    q('[data-name]').value = rec.t || ''; q('[data-note]').value = rec.o || '';
    if (dis) $$('input', host).forEach(function (i) { i.disabled = true; });
    $$('[data-ref]', host).forEach(function (b) { b.onclick = function () { if (dis) return blocked(); rec.r = b.dataset.ref; $('.refs', host).classList.remove('warn'); ch(); }; });
    $$('[data-qn]', host).forEach(function (b) { b.onclick = function () { if (dis) return; rec.t = b.dataset.qn; q('[data-name]').value = rec.t; ch(); }; });
    q('[data-name]').oninput = function (e) { rec.t = e.target.value.replace(/[<>]/g, ''); ch(); };
    q('[data-note]').oninput = function (e) { rec.o = e.target.value.replace(/[<>]/g, ''); ch(); };
    function bindStep(b, fn) {
      var t, iv;
      function step() { if (dis) return blocked(); if (!rec.r) return needRef(); if (fn() === false) { u.buzz('edge'); stop(); return; } u.buzz(); ch(); }
      function stop() { clearTimeout(t); clearInterval(iv); }
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); stop(); step(); t = setTimeout(function () { iv = setInterval(step, 110); }, 450); });      // 꾹 누르면 빠르게
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, stop); });
      b.addEventListener('click', function (e) { if (e.detail === 0) step(); });                                                                                       // 키보드로 누를 때
    }
    $$('[data-s]', host).forEach(function (b) { var d = +b.dataset.s; bindStep(b, function () { var was = sig(rec), v = Math.max(-MAXN, Math.min(MAXN, was + d)); if (v === was) return false; rec.n = Math.abs(v); if (v) rec.d = v < 0 ? 'L' : 'R'; }); });
    $$('[data-q]', host).forEach(function (b) {                              // 빠른 칸 수: 누르면 그 값으로 바로
      b.onclick = function () { if (dis) return blocked(); if (!rec.r) return needRef(); var v = +b.dataset.q; rec.n = Math.abs(v); if (v) rec.d = v < 0 ? 'L' : 'R'; u.buzz(); ch(); };
    });
    $$('[data-ps]', host).forEach(function (b) { var d = +b.dataset.ps; bindStep(b, function () { var was = rec.p || u.PW0, v = Math.max(8, Math.min(40, was + d)); if (v === was) return false; rec.p = v; }); });
    q('[data-pclear]').onclick = function () { if (dis) return blocked(); rec.p = u.PW0; q('[data-pin]').value = String(u.PW0); ch(); };
    /* 타격감 숫자 직접 입력(8~40). 고르는 즉시 "20(65M) 정도"로 보여 줌 */
    var pin = q('[data-pin]');
    if (dis) pin.disabled = true;
    pin.addEventListener('focus', function () { if (!rec.r) { pin.blur(); needRef(); } });
    pin.addEventListener('input', function () {
      var v = pin.value.replace(/\D/g, '').slice(0, 2); if (v !== pin.value) pin.value = v;
      var pm = q('[data-pm]');
      if (!v) { pm.innerHTML = '<span style="color:var(--mut)">숫자를 넣어 주세요. 비워 두면 17로 저장돼요.</span>'; return; }
      var n = +v;
      if (n >= 8 && n <= 40) { rec.p = n; ch(); }
      else pm.innerHTML = '<span style="color:var(--rt)">8부터 40까지 넣어 주세요. (17 = 50M, 1마다 5M)</span>';
    });
    pin.addEventListener('blur', function () { pin.value = String(rec.p || u.PW0); upd(); });
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') pin.blur(); });
    upd();
  };

  /* ───── 자동 저장: 고치고 1.5초 뒤 저장, 실패하면 계속 다시 시도, 기기에도 임시 보관 ───── */
  var pend = {}, ver = 0, timer = null, retryT = null, running = null, rerun = false, status = 'ok', lastErr = null, ls = [];
  function count() { var n = 0; for (var c in pend) for (var i in pend[c]) n++; return n; }
  function persist() {
    if (count()) u.store.setJSON('lz.pend', { uid: LZ.S.user && LZ.S.user.uid, nick: LZ.S.user && LZ.S.user.nick, pend: pend }); else u.store.del('lz.pend');
  }
  function setStatus(s, err) { status = s; lastErr = err || null; ls.slice().forEach(function (f) { try { f(status, lastErr); } catch (e) { /* 무시 */ } }); }

  function doFlush() {
    setStatus('saving');
    var snap = JSON.parse(JSON.stringify(pend)), cids = Object.keys(snap);
    function next(k) {
      if (k >= cids.length) return Promise.resolve(true);
      var cid = cids[k], items = Object.keys(snap[cid]).map(function (i) { return { i: +i, rec: snap[cid][i].rec }; });
      var at = cid.indexOf('|'), br = at >= 0 ? cid.slice(0, at) : '', body = { cid: at >= 0 ? cid.slice(at + 1) : cid, items: items };   // 고친 그 지점에 저장
      if (br) body.br = br;
      return LZ.api('save', body, { retry: 1 }).then(function () {
        for (var i in snap[cid]) if (pend[cid] && pend[cid][i] && pend[cid][i].v === snap[cid][i].v) delete pend[cid][i];   // 저장 중에 또 고친 것은 남겨 둠
        if (pend[cid] && !Object.keys(pend[cid]).length) delete pend[cid];
        return next(k + 1);
      }, function (e) {
        if (e && (e.code === 'expired' || e.code === 'nocourse' || e.code === 'perm' || e.code === 'branch')) { delete pend[cid]; LZ.ui.toast(e.message, 5000); return next(k + 1); }   // 다시 해도 안 되는 오류
        throw e;
      });
    }
    return next(0).then(function () {
      persist();
      if (count()) { setStatus('wait'); timer = setTimeout(R.flush, 300); return false; }
      setStatus('ok'); return true;
    }, function (e) {
      persist(); setStatus('err', e);
      if (!(e && e.code === 'auth')) { clearTimeout(retryT); retryT = setTimeout(R.flush, 8000); }
      return false;
    });
  }

  var R = LZ.rec = {
    on: function (f) { ls.push(f); return function () { ls = ls.filter(function (x) { return x !== f; }); }; },
    status: function () { return status; },
    error: function () { return lastErr; },
    dirty: function () { return count() > 0; },
    queue: function (cid0, i, rec) {
      var cid = (LZ.branch || '') + '|' + cid0;                                   // 지점마다 기록이 따로라서 지점도 함께 기억
      pend[cid] = pend[cid] || {}; pend[cid][i] = { rec: u.cloneRec(rec), v: ++ver };
      persist(); setStatus('wait'); clearTimeout(timer); clearTimeout(retryT);
      timer = setTimeout(function () { R.flush(); }, 1500);
    },
    flush: function () {
      clearTimeout(timer); clearTimeout(retryT);
      if (running) { rerun = true; return running; }
      if (!count()) { setStatus('ok'); return Promise.resolve(true); }
      running = doFlush().then(function (ok) { running = null; if (rerun) { rerun = false; return R.flush(); } return ok; });
      return running;
    },
    discard: function () { pend = {}; persist(); clearTimeout(timer); clearTimeout(retryT); setStatus('ok'); },
    /* 앱을 다시 열었을 때, 저장 못 한 것이 기기에 남아 있으면 이어서 저장 */
    restore: function () {
      var d = u.store.getJSON('lz.pend');
      if (d && d.pend && LZ.S.user && (d.uid ? d.uid === LZ.S.user.uid : d.nick === LZ.S.user.nick)) {
        pend = d.pend; for (var c in pend) for (var i in pend[c]) ver = Math.max(ver, pend[c][i].v || 0);
        if (count()) { setStatus('wait'); R.flush(); }
      } else if (d) u.store.del('lz.pend');
    },
    reset: function () { pend = {}; u.store.del('lz.pend'); clearTimeout(timer); clearTimeout(retryT); status = 'ok'; lastErr = null; }
  };
  window.addEventListener('online', function () { if (count()) R.flush(); });
})();
