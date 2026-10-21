/* 로그인 · 처음 비밀번호 정하기 · 홈 화면에 추가 안내 · 앱 안 브라우저 안내 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, esc = u.esc, S = LZ.S, P = LZ.pwa;

  /* ───── 로그인 ───── */
  LZ.screens.login = {
    show: function (p, root) {
      var urlNick = (new URLSearchParams(location.search).get('u') || '').trim();
      var saved = urlNick || u.store.get('lz.nick') || '', editing = !saved;
      function draw() {
        root.innerHTML = '<div class="scr"><div class="hero">' + ui.themeBtn() + ui.logo('light') + '<div class="pill">' + esc(S.store) + '</div><p>파크골프 방향 기록장</p></div><div class="bd nt">' +
          (p.msg ? '<div class="ban b">' + esc(p.msg) + '</div>' : '') +
          (editing ? '<label class="lbl" for="nick">닉네임</label><input class="inp" id="nick" value="' + esc(saved) + '" autocomplete="username" autocapitalize="none" maxlength="8" placeholder="운영자가 알려 준 닉네임">'
            : '<div class="row2" style="margin:14px 0 4px"><div style="font-size:20px"><b>' + esc(saved) + '</b>님</div><button class="sm" id="other" type="button">다른 닉네임</button></div>') +
          '<label class="lbl c">비밀번호 숫자 4자리를 눌러 주세요</label><div id="kp"></div><div class="msg" id="err" role="alert" style="text-align:center"></div>' +
          '<button class="btn" id="go" type="button" style="margin-top:6px">로그인</button><p class="hint" style="text-align:center">비밀번호를 잊으셨나요? 운영자에게 말씀해 주세요.</p>' +
          (P.standalone() ? '' : '<p class="hint" style="text-align:center"><a href="#" id="howto" style="color:var(--rt)">홈 화면에 추가하는 방법</a></p>') + '</div></div>';
        var kp = ui.keypad($('#kp'), 4, function () { $('#err').textContent = ''; });
        var other = $('#other'); if (other) other.onclick = function () { editing = true; saved = ''; draw(); var n = $('#nick'); if (n) n.focus(); };
        var how = $('#howto'); if (how) how.onclick = function (e) { e.preventDefault(); LZ.go('install', { from: 'login' }); };
        async function submit() {
          var nick = editing ? $('#nick').value.trim() : saved, err = $('#err');
          if (!nick) { err.textContent = '닉네임을 적어 주세요.'; return; }
          if (kp.value.length < 4) { err.textContent = '비밀번호 숫자 4자리를 눌러 주세요.'; return; }
          $('#go').disabled = true; ui.busy(true, '확인하고 있어요…');
          try {
            var r = await LZ.api('login', { nick: nick, pin: kp.value, dev: P.device }, { noAuth: true, retry: 0 });
            S.token = r.token; u.store.set('lz.t', r.token); ui.busy(false);
            await LZ.afterLogin(r.user);
          } catch (e) {
            ui.busy(false); var b = $('#go'); if (b) b.disabled = false;
            if ($('#err')) $('#err').textContent = ui.errText(e); kp.reset(); if ($('#err')) $('#err').textContent = ui.errText(e);
          }
        }
        $('#go').onclick = submit;
        var nk = $('#nick'); if (nk) nk.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
      }
      draw();
      document.onkeydown = null;
    }
  };

  /* ───── 비밀번호 정하기(처음 로그인할 때 반드시, 설정에서도 가능) ───── */
  var WEAK = ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210', '0000'];
  LZ.screens.pin = {
    show: function (p, root) {
      var step = 1, first = '';
      root.innerHTML = '<div class="scr">' + (p.first ? '<div class="hero" style="padding-bottom:18px">' + ui.logo('light') + '<p style="font-size:22px;color:var(--ink);margin-top:4px">처음 오셨네요</p></div>' : ui.hdr2('비밀번호 바꾸기')) +
        '<div class="bd nt"><p class="hint" id="pinS" style="font-size:18px;text-align:center;margin:8px 0 0;color:var(--ink)">나만 아는 숫자 4자리를 정해 주세요</p><div id="kp"></div><div class="msg" id="err" role="alert" style="text-align:center"></div>' +
        '<p class="hint" style="text-align:center">1234, 0000 같은 쉬운 번호는 쓸 수 없어요.</p></div></div>';
      var kp = ui.keypad($('#kp'), 4, async function (v) {
        if (v.length < 4) return;
        var err = $('#err'); err.textContent = '';
        if (step === 1) {
          if (WEAK.indexOf(v) >= 0 || /^(\d)\1{3}$/.test(v)) { err.textContent = '너무 쉬운 번호예요. 다른 숫자로 정해 주세요.'; kp.reset(); return; }
          first = v; step = 2; $('#pinS').textContent = '확인을 위해 한 번 더 눌러 주세요'; kp.reset(); return;
        }
        if (v !== first) { step = 1; first = ''; $('#pinS').textContent = '숫자가 달라요. 처음부터 다시 정해 주세요'; kp.reset(); return; }
        ui.busy(true, '저장하고 있어요…');
        try {
          var r = await LZ.api('pin', { pin: v }, { retry: 0 }); ui.busy(false);
          S.user = r.user; ui.toast('비밀번호가 바뀌었어요. 다음부터는 이 숫자로 들어오세요.', 4500);
          if (p.first && !P.standalone() && u.store.get('lz.hintOff') !== '1') await LZ.go('install', { first: true }, { reset: true });
          else if (p.first) await LZ.go('courses', {}, { reset: true });
          else history.back();
        } catch (e) { ui.busy(false); step = 1; first = ''; $('#pinS').textContent = '나만 아는 숫자 4자리를 정해 주세요'; $('#err').textContent = ui.errText(e); kp.reset(); }
      });
    }
  };

  /* ───── 홈 화면에 추가 안내 ───── */
  var SHARE = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="공유 버튼"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  LZ.screens.install = {
    show: function (p, root) {
      function body() {
        var h = '', ia = P.inApp();
        if (P.standalone()) h = '<div class="ban g">이미 홈 화면에서 열고 있어요. 이대로 쓰시면 돼요.</div>';
        else if (ia) h = '<div class="ban">지금은 ' + (ia === 'kakao' ? '카카오톡' : ia === 'naver' ? '네이버' : '다른 앱') + ' 안에서 열려 있어요. 홈 화면에 추가하려면 먼저 휴대폰 기본 브라우저로 열어야 해요.</div><button class="btn y" id="ext">기본 브라우저로 열기</button><p class="hint">열리지 않으면 화면 오른쪽 위(또는 아래) ⋯ 메뉴에서 "다른 브라우저로 열기" 또는 "Safari로 열기"를 눌러 주세요.</p>';
        else if (P.isIOS) h = '<ol class="steps"><li>화면 아래(또는 위) 가운데에 있는 공유 버튼 ' + SHARE + ' 을 눌러요.</li><li>목록을 위로 올려 <b>"홈 화면에 추가"</b>를 눌러요.</li><li>오른쪽 위의 <b>"추가"</b>를 누르면 끝이에요.</li></ol><div class="ban">아이폰은 <b>Safari</b>에서만 가능해요. 다른 브라우저라면 Safari로 열어 주세요.</div>';
        else if (P.isAndroid) {
          if (P.canPrompt()) h = '<button class="btn y" id="addnow">홈 화면에 추가</button><p class="hint">누르면 "추가" 또는 "설치"를 묻는 창이 나와요. 그대로 눌러 주세요.</p>';
          else if (P.isSamsung) h = '<ol class="steps"><li>화면 오른쪽 아래의 <b>≡ 메뉴</b>를 눌러요.</li><li><b>"현재 페이지 추가"</b>를 누르고 <b>"홈 화면"</b>을 골라요.</li><li><b>"추가"</b>를 누르면 끝이에요.</li></ol>';
          else h = '<ol class="steps"><li>화면 오른쪽 위의 <b>⋮ 메뉴</b>를 눌러요.</li><li><b>"홈 화면에 추가"</b>(또는 "앱 설치")를 눌러요.</li><li><b>"추가"</b>(또는 "설치")를 누르면 끝이에요.</li></ol>';
        } else h = '<div class="ban">이 안내는 휴대폰에서 보여요. 휴대폰 브라우저로 이 주소를 열어 주세요.</div>';
        if (P.isIOS && !P.standalone()) h += '<p class="hint">홈 화면 아이콘으로 처음 열면 비밀번호를 한 번 더 눌러야 할 수 있어요. 아이폰은 인터넷 화면과 홈 화면 앱이 따로 저장되기 때문이에요.</p>';
        return h;
      }
      function draw() {
        root.innerHTML = '<div class="scr">' + (p.first ? '<div class="hero" style="padding-bottom:18px">' + ui.logo('light') + '<p style="font-size:22px;color:var(--ink);margin-top:4px">홈 화면에 추가해 두세요</p></div>' : ui.hdr2('홈 화면에 추가')) +
          '<div class="bd nt"><p style="font-size:17px;line-height:1.7;margin:4px 0 14px">휴대폰 바탕화면에 아이콘을 만들어 두면 앱처럼 바로 열 수 있어요.</p>' + body() +
          '<div style="display:grid;gap:8px;margin-top:14px"><button class="btn g" id="done">' + (p.first || p.from === 'login' ? '건너뛰고 계속하기' : '닫기') + '</button>' + (p.first ? '<button class="btn g" id="never">다시 보지 않기</button>' : '') + '</div></div></div>';
        var ext = $('#ext'); if (ext) ext.onclick = function () { if (!P.openExternal()) ui.toast('오른쪽 위(또는 아래) ⋯ 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.', 6000); };
        var add = $('#addnow'); if (add) add.onclick = async function () { var ok = await P.prompt(); if (ok) { u.store.set('lz.installed', '1'); ui.toast('홈 화면에 추가했어요!'); } draw(); };
        $('#done').onclick = function () { if (p.first) LZ.go('courses', {}, { reset: true }); else history.back(); };
        var nv = $('#never'); if (nv) nv.onclick = function () { u.store.set('lz.hintOff', '1'); LZ.go('courses', {}, { reset: true }); };
      }
      P.onready = function () { if (LZ.stack[LZ.stack.length - 1].name === 'install') draw(); };
      draw();
    }
  };

  /* ───── 카카오톡 같은 앱 안에서 열렸을 때 ───── */
  LZ.screens.inappGate = function (kind) {
    return new Promise(function (resolve) {
      var b = $('#boot'); if (b && b.parentNode) b.parentNode.removeChild(b);
      var ov = document.createElement('div'); ov.className = 'ov'; ov.setAttribute('role', 'dialog');
      ov.innerHTML = '<img src="assets/logo-light.png" alt="레저로 스크린 파크골프"><h2>' + (kind === 'kakao' ? '카카오톡' : '다른 앱') + ' 안에서 열렸어요</h2>' +
        '<p>휴대폰 <b>기본 브라우저</b>(크롬·삼성 인터넷·사파리)로 열어야 홈 화면에 추가할 수 있고, 로그인도 오래 유지돼요.</p>' +
        '<button class="btn y" id="gx" style="margin-bottom:10px">기본 브라우저로 열기</button><button class="btn g" id="gc">그냥 여기서 쓸게요</button>' +
        '<p class="hint" style="margin-top:14px">버튼을 눌러도 열리지 않으면 화면 오른쪽 위(또는 아래) ⋯ 메뉴에서 "다른 브라우저로 열기" 또는 "Safari로 열기"를 눌러 주세요.</p>';
      document.body.appendChild(ov);
      $('#gx', ov).onclick = function () { if (!P.openExternal()) ui.toast('⋯ 메뉴에서 "다른 브라우저로 열기"를 눌러 주세요.', 6000); };
      $('#gc', ov).onclick = function () { u.store.set('lz.inappOk', '1'); ov.parentNode.removeChild(ov); resolve(); };
    });
  };
})();
