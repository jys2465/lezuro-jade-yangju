/* v3.1 화면: 체험 직접 가입 · 첫 사용 안내 · 친구에게 알리기 · 가입 QR 포스터 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;
  LZ.joinUrl = function (br, ref) { return LZ.appUrl() + '?s=' + encodeURIComponent(br || LZ.branch || '') + '&join=1' + (ref ? '&r=' + encodeURIComponent(ref) : ''); };

  /* ───── 5일 무료 체험 가입 (로그인 화면에서) ─────
   * 로그인한 상태로 열면 "미리 보기": 친구에게 보낼 가입 화면이 어떻게 보이는지 보여 주고 가입은 막음 */
  LZ.screens.join = {
    show: function (p, root) {
      var J = S.join || { on: true, trialDays: 5, refDays: 7, refOn: true }, preview = !!S.user, ref = u.store.get('lz.ref') || '';
      var brs = (S.branches || []).filter(function (b) { return b.active; }), br = (brs.some(function (b) { return b.code === LZ.branch; }) ? LZ.branch : (brs[0] || {}).code) || '';
      var pin = '', step = 1, chk = null, seq = 0;
      root.innerHTML = '<div class="scr">' + ui.hdr2(J.trialDays + '일 무료 체험 가입') + '<div class="bd nt">' +
        (preview ? '<div class="ban b">미리 보기예요. 친구가 초대 링크를 열면 이 화면이 나와요. <button class="sm" id="inv" type="button" style="margin-top:6px">친구에게 알리기</button></div>' : '') +
        (!J.on ? '<div class="ban r">지금은 직접 가입을 받지 않아요. 매장 운영자에게 계정을 만들어 달라고 해 주세요.</div>' : '') +
        '<img class="jpic" src="assets/og-card.jpg" alt="파크골프 공략노트 소개: 홀별 공략을 기록하고 함께 보세요">' +
        (ref && !preview ? '<div class="ban g" id="refb">🎁 친구 초대 링크로 들어왔어요. 가입하면 바로 ' + J.trialDays + '일 체험이 시작돼요.</div>' : '') +
        '<ul class="jfeat"><li><b>홀마다</b> 기준·방향·칸 수·타격감 기록</li><li><b>같은 매장</b> 회원 기록 참고·비교</li><li><b>결제 없이</b> ' + J.trialDays + '일 동안 모든 기능</li></ul>' +
        '<label class="lbl" for="jn">닉네임 <span style="font-size:12px">— 스크린 파크골프에서 쓰는 닉네임</span></label><input class="inp" id="jn" maxlength="8" autocomplete="off" autocapitalize="none" placeholder="한글·영문·숫자 2~8자"><div class="msg" id="jnE" role="status"></div>' +
        '<label class="lbl" for="jb">자주 가는 기본 매장</label><select class="inp" id="jb">' + brs.map(function (b) { return '<option value="' + esc(b.code) + '"' + (b.code === br ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' +
        '<p class="hint" style="margin-top:4px">다니는 매장이 목록에 없으면 가입한 뒤 문의하기 → <b>매장 추가 요청</b>을 남겨 주세요. 다른 매장도 언제든 골라 쓸 수 있어요.</p>' +
        '<label class="lbl c" id="jpl">비밀번호로 쓸 숫자 4자리를 눌러 주세요</label><div id="kp"></div><div class="msg" id="jpE" role="alert" style="text-align:center"></div>' +
        '<div class="blk jagree"><b>가입 전에 확인해 주세요</b><ul><li>체험은 <b>' + J.trialDays + '일</b>이고 한 사람당 한 번이에요.</li><li>체험이 끝나면 로그인해서 내 기록만 볼 수 있어요. 이용권을 결제하면 바로 다시 써요.</li><li>내 기록은 기본으로 같은 매장 회원에게 공개돼요. 설정에서 코스마다 끌 수 있어요.</li><li>비밀번호를 잊으면 기본 매장 운영자에게 말씀해 주세요.</li></ul>' +
        '<p class="hint" style="margin:6px 0 0">받는 정보: 닉네임, 기본 매장, 휴대폰 종류(문의할 때), 결제할 때 송금 표시 이름. 전화번호·실명은 받지 않아요.</p>' +
        '<label class="chk" style="margin-top:6px"><input type="checkbox" id="jag"> 위 내용을 확인했어요</label></div>' +
        '<div class="msg" id="err" role="alert"></div><button class="btn" id="go" type="button"' + (preview || !J.on ? ' disabled' : '') + '>' + J.trialDays + '일 무료 체험 시작하기</button>' +
        (preview ? '' : '<p class="hint" style="text-align:center">이미 계정이 있나요? <a href="#" id="tologin" style="color:var(--rt)">로그인</a></p>') + '</div></div>';
      var nn = $('#jn'), jnE = $('#jnE'), kp;
      if (ref && !preview) LZ.api('refName', { ref: ref }, { noAuth: true, retry: 0, timeout: 15000 }).then(function (r) {   // "○○님의 초대"
        var b = $('#refb'); if (b && r.nick) b.innerHTML = '🎁 <b>' + esc(r.nick) + '</b>님의 초대로 가입해요. 가입하면 바로 ' + J.trialDays + '일 체험이 시작돼요.';
      }, function () { /* 이름을 못 불러와도 가입은 그대로 */ });
      LZ.guard = preview ? null : { kind: 'form', dirty: function () { return !!nn.value.trim(); }, body: '입력한 가입 정보가 사라져요.' };
      var later = u.debounce(async function () {
        var my = ++seq, v = nn.value; if (!v) { jnE.textContent = ''; chk = null; return; }
        try {
          var r = await LZ.api('joinCheck', { nick: v }, { noAuth: true, retry: 0, timeout: 15000 }); if (my !== seq) return;
          chk = r.res; jnE.textContent = chk ? chk.msg : '쓸 수 있는 닉네임이에요.'; jnE.style.color = chk ? 'var(--rt)' : 'var(--gt)';
        } catch (e) { if (my === seq) jnE.textContent = ''; }
      }, 500);
      nn.oninput = function () { var v = u.stripSpaces(nn.value); if (v !== nn.value) nn.value = v; chk = undefined; jnE.textContent = ''; later(); };
      $('#jb').onchange = function () { br = $('#jb').value; };
      kp = ui.keypad($('#kp'), 4, function (v) {
        if (v.length === 1) $('#jpE').textContent = '';
        if (v.length < 4) return;
        if (step === 1) {
          if (LZ.weakPin(v)) { u.buzz('err'); $('#jpE').textContent = '너무 쉬운 번호예요. 다른 숫자로 정해 주세요.'; kp.reset(); return; }
          pin = v; step = 2; $('#jpl').textContent = '확인을 위해 한 번 더 눌러 주세요'; kp.reset(); return;
        }
        if (step === 2) {
          if (v !== pin) { u.buzz('err'); step = 1; pin = ''; $('#jpl').textContent = '숫자가 달라요. 처음부터 다시 눌러 주세요'; kp.reset(); return; }
          step = 3; $('#jpl').textContent = '비밀번호를 정했어요 ✓'; $('#jpl').style.color = 'var(--gt)';
        }
      });
      var tl = $('#tologin'); if (tl) tl.onclick = function (e) { e.preventDefault(); LZ.guard = null; if (LZ.stack.length > 1) history.back(); else LZ.go('login', {}, { reset: true }); };
      var inv = $('#inv'); if (inv) inv.onclick = function () { LZ.go('invite', {}); };
      $('#go').onclick = async function () {
        var err = $('#err'), nick = nn.value.trim(); err.textContent = '';
        if (!/^[가-힣A-Za-z0-9]{2,8}$/.test(nick)) { err.textContent = '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)'; nn.focus(); return; }
        if (chk && chk.code) { err.textContent = chk.msg; nn.focus(); return; }
        if (!br) { err.textContent = '기본 매장을 골라 주세요.'; return; }
        if (step !== 3) { err.textContent = step === 2 ? '비밀번호를 한 번 더 눌러 주세요.' : '비밀번호로 쓸 숫자 4자리를 눌러 주세요.'; return; }
        if (!$('#jag').checked) { err.textContent = '가입 전 확인 내용을 읽고 체크해 주세요.'; return; }
        $('#go').disabled = true; ui.busy(true, '가입하고 있어요…');
        try {
          var r = await LZ.api('join', { nick: nick, pin: pin, br: br, agree: 1, dev: LZ.devId(), ref: ref, ua: LZ.pwa.device }, { noAuth: true, retry: 0 });
          ui.busy(false); LZ.guard = null; u.store.del('lz.ref');
          S.token = r.token; u.store.set('lz.t', r.token); u.store.set('lz.plen', '4'); if (r.branches) S.branches = r.branches;
          LZ.setBranch(r.user.home, LZ.brName(r.user.home)); LZ.skipPopupOnce = true; LZ.joining = true;
          await LZ.afterLogin(r.user); LZ.joining = false;
          await LZ.go('guide', { first: 1 });
        } catch (e) {
          ui.busy(false); var g = $('#go'); if (g) g.disabled = false;
          if (e && (e.code === 'weak')) { step = 1; pin = ''; kp.reset(); $('#jpl').textContent = '비밀번호로 쓸 숫자 4자리를 눌러 주세요'; $('#jpl').style.color = ''; }
          if (e && e.code === 'dev' && e.data && e.data.nick) {
            var c = await ui.dialog({ title: '이미 체험 가입을 했어요', body: ui.errText(e), cancel: 'stay', buttons: [{ label: '"' + e.data.nick + '"(으)로 로그인', kind: 'y', value: 'login' }, { label: '닫기', kind: 'g', value: 'stay' }] });
            if (c === 'login') { LZ.guard = null; u.store.set('lz.nick', e.data.nick); LZ.go('login', {}, { reset: true }); }
            return;
          }
          if ($('#err')) $('#err').textContent = ui.errText(e);
        }
      };
    }
  };

  /* ───── 첫 사용 안내 (가입 직후, 설정 → 사용 방법) ───── */
  var GUIDE = [
    ['① 기준을 하나 골라요', '<div class="gx"><span class="on">최초화면</span><span>홀컵</span><span>내가 정한 곳</span></div>', '스크린에 처음 보이는 화면, 홀컵, 또는 나무·깃대처럼 내가 정한 곳 중에서 하나를 기준으로 삼아요.'],
    ['② − 는 좌측, + 는 우측', '<div class="gx"><span class="on" style="background:#1D4ED8;border-color:#1D4ED8">−</span><b style="font-size:30px;margin:0 8px;color:#1D4ED8">−2</b><span>+</span></div><div class="dscale" style="max-width:240px;margin:8px auto 0"><span>◀ 좌측</span><span>0 = 그대로</span><span>우측 ▶</span></div>', '− 를 두 번 누르면 "좌측 2칸", + 를 세 번 누르면 "우측 3칸"이에요. 0이면 "그대로"로 저장돼요. 좌측·우측 각각 15칸까지예요.'],
    ['③ 타격감 17 = 50M', '<div class="gx"><b style="font-size:28px">20</b><span style="border:0">→ 65M 정도</span></div>', '타격감 1마다 5M씩 달라져요. 손대지 않으면 17로 저장되고, 고치면 자동으로 저장돼요.'],
    ['④ 같은 매장 회원 기록 참고', '<div class="gx"><span>참고할 회원 · 신뢰도 높은 순</span></div>', '코스 화면에서 다른 회원 기록을 보고 가져오거나 비교할 수 있어요. 기록은 매장마다 따로라서 위쪽 📍 매장을 꼭 확인하세요.']
  ];
  LZ.screens.guide = {
    show: function (p, root) {
      var i = 0;
      function draw() {
        var g = GUIDE[i], last = i === GUIDE.length - 1;
        root.innerHTML = '<div class="scr">' + ui.hdr2(p.first ? '환영해요! 사용 방법' : '사용 방법', '', !!p.first) + '<div class="bd nt">' +
          (p.first && i === 0 ? '<div class="ban g"><b>' + esc(S.user.nick) + '</b>님, 체험이 시작됐어요. (' + esc(u.period(S.user.start, S.user.end)) + ')</div>' : '') +
          '<div class="guide"><div class="gdots">' + GUIDE.map(function (x, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</div><h3>' + g[0] + '</h3>' + g[1] + '<p>' + g[2] + '</p></div>' +
          '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn g" id="gp" type="button" style="flex:1"' + (i ? '' : ' disabled') + '>이전</button><button class="btn" id="gn" type="button" style="flex:2">' + (last ? (p.first ? '시작하기' : '닫기') : '다음') + '</button></div>' +
          (p.first && !last ? '<p class="hint" style="text-align:center"><a href="#" id="gs" style="color:var(--mut)">건너뛰기</a></p>' : '') + '</div></div>';
        $('#gp').onclick = function () { if (i) { i--; draw(); } };
        $('#gn').onclick = function () { if (!last) { i++; draw(); } else done(); };
        var gs = $('#gs'); if (gs) gs.onclick = function (e) { e.preventDefault(); done(); };
      }
      function done() { if (p.first) { LZ.go('courses', {}, { reset: true }); if (LZ.installHint) LZ.installHint(); } else history.back(); }
      draw();
    }
  };

  /* ───── 친구에게 알리기 (추천 링크 + 초대한 친구 목록) ───── */
  LZ.screens.invite = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('친구에게 알리기') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.capi('refInfo', {}, { onFresh: LZ.fresh('invite') }); if (!alive()) return;
      var link = LZ.joinUrl(d.home, d.code);
      var msg = '[파크골프 공략노트]\n스크린 파크골프 홀별 공략(방향·칸 수·타격감)을 기록하고 같은 매장 회원 기록도 참고할 수 있어요.\n지금 가입하면 5일 무료 체험!\n' + link;
      root.innerHTML = '<div class="scr">' + ui.hdr2('친구에게 알리기') + '<div class="bd nt">' +
        '<img class="jpic" src="assets/promo-invite.jpg" alt="친구에게 알리고 7일 더 받으세요">' +
        (d.on && !d.staff ? '<div class="ban g">내 링크로 친구가 가입하면 친구는 <b>5일 무료 체험</b>, 그 친구가 <b>월간·연간 이용권을 결제</b>하면 나에게 <b>' + d.days + '일</b>을 더 드려요. (친구 한 명당 한 번)</div>'
          : d.staff ? '<div class="ban">운영진은 보상 대상이 아니지만, 이 링크로 회원을 모을 수 있어요.</div>' : '<div class="ban">지금은 추천 보상을 쉬고 있어요. 링크로 가입은 그대로 돼요.</div>') +
        '<label class="lbl">내 초대 링크</label><div class="ann" id="lk" style="user-select:all">' + esc(link) + '</div>' +
        '<div style="display:grid;gap:8px"><button class="btn" id="shr" type="button">카카오톡·문자로 보내기</button><button class="btn g" id="cpy" type="button">링크 복사</button><button class="btn g" id="pv" type="button">친구가 보는 가입 화면 미리 보기</button></div>' +
        '<h3 style="font-size:17px;margin:18px 0 8px">초대한 친구 ' + d.friends.length + '명' + (d.total ? ' · 받은 보상 ' + d.total + '일' : '') + '</h3>' +
        (d.friends.map(function (f) {
          return '<div class="row2" style="margin:0;padding:9px 0;border-top:1px solid var(--line2)"><span><b>' + esc(f.nick) + '</b> <span class="brtag">' + esc(f.homeName) + '</span><br><small class="hint" style="margin:0">' + u.fmtDate(f.created) + ' 가입</small></span>' +
            (f.paid ? '<span class="chip gr">+' + f.days + '일 받음</span>' : '<span class="chip">결제 전</span>') + '</div>';
        }).join('') || '<div class="ann">아직 없어요. 링크를 보내 보세요.</div>') + '</div></div>';
      $('#shr').onclick = async function () { if (!(await u.share(msg, '파크골프 공략노트'))) { var ok = await u.copy(msg); ui.toast(ok ? '안내문과 링크를 복사했어요. 카카오톡에 붙여 넣어 보내세요.' : '복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.', 4500); } };
      $('#cpy').onclick = async function () { var ok = await u.copy(link); ui.toast(ok ? '링크를 복사했어요.' : '복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.', 3500); };
      $('#pv').onclick = function () { LZ.go('join', {}); };
    }
  };

  /* ───── 가입 QR 포스터 (운영자·관리자): 매장에 붙이는 A4 그림 ───── */
  function qrCanvas(text, size) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), cv = document.createElement('canvas'), m = 4, cell = Math.floor(size / (n + m * 2));
    cv.width = cv.height = cell * (n + m * 2); var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#0B1F1D';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + m) * cell, (r + m) * cell, cell, cell);
    return cv;
  }
  function loadImg(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; }); }
  async function drawPoster(br, name) {
    var W = 1240, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), F = '"Noto Sans KR", sans-serif';
    try { await Promise.all([document.fonts.load('500 60px "Noto Sans KR"'), document.fonts.load('400 40px "Noto Sans KR"')]); } catch (e) { /* 기본 글꼴 */ }
    await u.loadScript('vendor/qrcode.js');
    var g = c.createLinearGradient(0, 0, W, 900); g.addColorStop(0, '#0F766E'); g.addColorStop(1, '#0B4A45');
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.fillStyle = g; c.fillRect(0, 0, W, 980);
    c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 3; [[1050, 120, 380], [1050, 120, 230]].forEach(function (a) { c.beginPath(); c.arc(a[0], a[1], a[2], 0, Math.PI * 2); c.stroke(); });
    var icon = await loadImg('icons/icon-512.png'); c.drawImage(icon, 96, 96, 150, 150);
    c.fillStyle = '#FDBA74'; c.font = '500 36px ' + F; c.fillText('스크린 파크골프', 280, 150);
    c.fillStyle = '#fff'; c.font = '500 84px ' + F; c.fillText('공략노트', 276, 238);
    c.font = '500 92px ' + F; c.fillText('홀별 공략,', 96, 450); c.fillStyle = '#FDBA74'; c.fillText('기록하고 함께 보세요', 96, 568);
    c.fillStyle = '#E6FFFA'; c.font = '400 44px ' + F;
    ['기준·방향·칸 수·타격감을 홀마다 기록', '같은 매장 회원 기록 참고·비교', '휴대폰으로 바로, 설치 없이'].forEach(function (t, i) { c.fillStyle = '#FB923C'; c.beginPath(); c.arc(112, 668 + i * 74, 11, 0, Math.PI * 2); c.fill(); c.fillStyle = '#E6FFFA'; c.fillText(t, 144, 684 + i * 74); });
    c.fillStyle = '#FB923C'; var bx = 96, by = 1030, bw = 600, bh = 110; c.beginPath(); c.roundRect ? c.roundRect(bx, by, bw, bh, 55) : c.rect(bx, by, bw, bh); c.fill();
    c.fillStyle = '#fff'; c.font = '500 56px ' + F; c.fillText('5일 무료 체험', bx + 70, by + 76);
    c.fillStyle = '#134E4A'; c.font = '500 60px ' + F; c.fillText(name, 96, 1260);
    c.fillStyle = '#334155'; c.font = '400 40px ' + F; c.fillText('휴대폰 카메라로 QR을 찍으면', 96, 1350); c.fillText('가입 화면이 바로 열려요', 96, 1410);
    c.fillText('① 닉네임  ② 기본 매장  ③ 비밀번호 4자리', 96, 1500);
    var url = LZ.joinUrl(br, ''), qr = qrCanvas(url, 440); c.drawImage(qr, W - 96 - 440, 1030, 440, 440);
    c.fillStyle = '#64748B'; c.font = '400 26px ' + F; c.fillText(url.replace(/^https?:\/\//, ''), 96, H - 90);
    c.fillStyle = '#0F766E'; c.fillRect(0, H - 40, W, 40);
    return cv;
  }
  LZ.screens.poster = {
    show: function (p, root) {
      var admin = ui.isAdmin(), brs = (S.branches || []).filter(function (b) { return b.active && (admin || b.code === S.user.home); }), br = (brs.filter(function (b) { return b.code === LZ.branch; })[0] || brs[0] || {}).code;
      root.innerHTML = '<div class="scr">' + ui.hdr2('가입 QR 포스터') + '<div class="bd nt">' +
        '<p class="hint" style="margin-top:0">매장 계산대나 스크린 옆에 붙여 두면, 손님이 휴대폰 카메라로 찍어 바로 체험 가입을 해요. 인쇄는 A4 세로로 맞춰져 있어요.</p>' +
        (brs.length > 1 ? '<select class="inp" id="pb">' + brs.map(function (b) { return '<option value="' + esc(b.code) + '"' + (b.code === br ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' : '') +
        '<div id="pw" style="margin:10px 0">' + ui.skeleton(2) + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><a class="btn" id="dl" download="공략노트_가입포스터.png" href="#">그림 저장</a><button class="btn g" id="pr" type="button">인쇄</button></div>' +
        '<p class="hint">카카오톡 단톡방에는 그림을 보내거나, 설정 → 친구에게 알리기의 링크를 보내 주세요.</p></div></div>';
      async function make() {
        var b = brs.filter(function (x) { return x.code === br; })[0]; if (!b) { $('#pw').innerHTML = '<div class="ann">열려 있는 매장이 없어요.</div>'; return; }
        try {
          var cv = await drawPoster(b.code, b.name), url = cv.toDataURL('image/png');
          $('#pw').innerHTML = '<img id="pimg" src="' + url + '" alt="' + esc(b.name) + ' 가입 QR 포스터" style="width:100%;border:1px solid var(--line);border-radius:10px">';
          $('#dl').href = url; $('#dl').download = '공략노트_가입포스터_' + b.name + '.png';
        } catch (e) { $('#pw').innerHTML = '<div class="ann">포스터를 만들지 못했어요. 다시 열어 주세요.</div>'; }
      }
      var pb = $('#pb'); if (pb) pb.onchange = function () { br = pb.value; make(); };
      $('#pr').onclick = function () { document.body.classList.add('printing'); setTimeout(function () { window.print(); setTimeout(function () { document.body.classList.remove('printing'); }, 500); }, 50); };
      make();
    }
  };
})();
