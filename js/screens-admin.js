/* 설정 · 회원 관리(운영자·관리자) · 결제 확인(관리자) · 관리자 설정(요금·QR·계좌·좌석·매장·로고) */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S, P = LZ.pwa;
  var VERSION = '3.1.0';
  LZ.appVersion = VERSION;
  LZ.appUrl = function () { return location.origin + location.pathname.replace(/index\.html$/, ''); };

  /* ───── 설정 ───── */
  LZ.screens.settings = {
    show: async function (p, root, alive) {
      var us = S.user, staff = ui.isStaff(), admin = ui.isAdmin();
      var fs = u.store.get('lz.fs') || '0';
      function memBlock() {
        if (staff) return '<div class="blk"><h4>내 등급</h4><div style="font-size:17px"><b>' + esc(us.kindName || (admin ? '관리자' : '운영자')) + '</b></div></div>';
        var pend = S.me && S.me.pending;
        return '<div class="blk"><h4>내 이용권</h4><div style="font-size:17px"><b>' + esc(us.kindName) + '</b> · ' + (us.st === 'expired' ? '<span style="color:var(--rt)">기간 끝남</span>' : u.dday(us.left)) + '</div>' +
          '<div class="meta">시작일 ' + (u.ymd(us.start) || '-') + ' · 종료일 ' + (u.ymd(us.end) || '-') + '</div>' +
          (pend ? '<div class="ban b" style="margin:8px 0 0">입금 확인 중: ' + esc(pend.planName) + ' ' + u.won(pend.amount) + '</div>' : '') +
          '<button class="btn" id="pay" type="button" style="margin-top:10px">' + (pend ? '결제 상태 보기' : us.kind === 'trial' || us.st === 'expired' ? '이용권 결제하기' : '이용권 연장 · 결제') + '</button></div>';
      }
      var nu = LZ.noticeUnread();
      function acctBlock() {
        return '<div class="blk"><h4>내 계정</h4>' +
          '<div class="row2" style="margin:0;padding:8px 0"><span>닉네임 <b>' + esc(us.nick) + '</b>' + (us.prev ? '<br><small class="hint" style="margin:0">예전 이름 ' + esc(us.prev) + '(은)는 잠시 다른 분이 쓸 수 없게 지켜 둬요</small>' : '') + '</span><button class="sm" id="nk" type="button">바꾸기</button></div>' +
          '<div class="row2" style="margin:0;padding:8px 0;border-top:1px solid var(--line2)"><span>기본 지점 <b>' + esc(us.homeName || LZ.brName(us.home)) + '</b></span>' + (us.kind === 'op' ? '<span class="hint" style="margin:0">관리자가 정해요</span>' : '<button class="sm" id="hm" type="button">바꾸기</button>') + '</div>' +
          '<div class="row2" style="margin:0;padding:8px 0;border-top:1px solid var(--line2)"><span>지금 지점 <b>' + esc(S.store) + '</b></span><button class="sm" id="brc" type="button">지점 고르기</button></div>' +
          '<p class="hint" style="margin:4px 0 0">이용권·닉네임·신뢰도는 모든 지점 공통이고, 기록은 지점마다 따로예요.</p></div>';
      }
      root.innerHTML = '<div class="scr">' + ui.hdr('설정') + '<div class="bd">' + memBlock() + LZ.trustChip() +
        (admin ? '<div class="blk"><h4>관리자</h4><div style="display:grid;gap:8px"><button class="btn g" id="dsh" type="button">현황판</button><button class="btn g" id="pays" type="button">결제 확인 · 환불</button><button class="btn g" id="brs" type="button">지점 관리</button><button class="btn g" id="acfg" type="button">요금 · QR · 계좌 · 좌석 · 문의 · 로고</button><button class="btn g" id="alog" type="button">활동 기록</button></div></div>' : '') +
        acctBlock() +
        '<div class="blk"><h4>알리기</h4><div style="display:grid;gap:8px"><button class="btn" id="invt" type="button">🎁 친구에게 알리기</button>' + (staff ? '<button class="btn g" id="pst" type="button">가입 QR 포스터 만들기</button>' : '') + '<button class="btn g" id="gde" type="button">사용 방법 보기</button></div></div>' +
        '<div class="blk"><h4>공지사항' + (nu ? ' <span class="chip r">새 공지 ' + nu + '</span>' : '') + '</h4><button class="btn g" id="nts" type="button">공지 보기</button>' + (staff ? '<button class="btn g" id="ntm" type="button" style="margin-top:8px">공지 쓰기 · 관리</button>' : '') + '</div>' +
        (S.me && S.me.qnaOn ? '<div class="blk"><h4>문의하기' + (!staff && S.me.qna ? ' <span class="chip r">새 답변 ' + S.me.qna + '</span>' : '') + '</h4><p class="hint" style="margin:-4px 0 8px">자주 묻는 질문을 보거나, 운영진에게 1:1로 물어볼 수 있어요.</p><button class="btn g" id="qna" type="button">문의하기</button></div>' : '') +
        '<div class="blk"><h4>비밀번호</h4><button class="btn g" id="pw" type="button">비밀번호 바꾸기</button></div>' +
        '<div class="blk"><h4>화면 모드</h4><div class="seg" id="thm">' + [['light', '밝게'], ['dark', '어둡게'], ['auto', '자동']].map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (LZ.theme.mode() === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><p class="hint">자동은 휴대폰 설정(다크 모드)을 따라가요. 맨 위의 해·달 단추로도 바로 바꿀 수 있어요.</p></div>' +
        '<div class="blk"><h4>누를 때 진동</h4><div class="seg" id="bz">' + [['1', '켜기'], ['0', '끄기']].map(function (f) { return '<button type="button" data-b="' + f[0] + '" class="' + ((u.buzzOn() ? '1' : '0') === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div><p class="hint">비밀번호·칸 수·타격감 단추를 누를 때 휴대폰이 짧게 떨려요. 안드로이드는 진동, 아이폰은 iOS 18 이상에서 가벼운 누름 느낌이에요(휴대폰 무음·진동 설정에 따라 다를 수 있어요).</p></div>' +
        '<div class="blk"><h4>글씨 크기</h4><div class="seg" id="fs">' + [['0', '보통'], ['1', '크게'], ['2', '아주 크게']].map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (fs === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div>' +
        (P.standalone() ? '' : '<div class="blk"><h4>홈 화면에 추가</h4><button class="btn g" id="inst" type="button">추가하는 방법 보기</button></div>') +
        '<div class="blk"><h4>내 기록 공개</h4><p class="hint" style="margin:-4px 0 8px">켜 두면 같은 지점·같은 코스를 쓰는 회원이 내 기록을 보고 비교할 수 있어요. 기본은 공개예요. 코스마다 모든 지점에 함께 적용돼요.' + (us.st === 'expired' ? ' (이용 기간이 끝나서 지금은 다른 회원에게 보이지 않아요.)' : '') + '</p><div id="pubs">' + ui.skeleton(1) + '</div></div>' +
        '<button class="btn g" id="out" type="button">로그아웃</button><p class="hint" style="text-align:center">앱 버전 ' + VERSION + ' · ' + esc(P.device) + '</p></div>' + ui.tabs('settings') + '</div>';
      var pb = $('#pay'); if (pb) pb.onclick = function () { LZ.go('pay', {}); };
      LZ.bindMemberBanner(root);
      var ps = $('#pays'); if (ps) ps.onclick = function () { LZ.go('payments', {}); };
      var ac = $('#acfg'); if (ac) ac.onclick = function () { LZ.go('adminCfg', {}); };
      $('#pw').onclick = function () { LZ.go('pin', {}); };
      var qb = $('#qna'); if (qb) qb.onclick = function () { LZ.go('qna', { fromSettings: true }); };
      var brc = $('#brc'); if (brc) brc.onclick = function () { LZ.go('branch', {}); };
      var hm = $('#hm'); if (hm) hm.onclick = function () { LZ.go('branch', {}); };
      $('#nk').onclick = function () { LZ.go('nick', {}); };
      $('#invt').onclick = function () { LZ.go('invite', {}); };
      $('#gde').onclick = function () { LZ.go('guide', {}); };
      var pst = $('#pst'); if (pst) pst.onclick = function () { LZ.go('poster', {}); };
      $('#nts').onclick = function () { LZ.go('notices', {}); };
      var ntm = $('#ntm'); if (ntm) ntm.onclick = function () { LZ.go('notices', { manage: 1 }); };
      var dsh = $('#dsh'); if (dsh) dsh.onclick = function () { LZ.go('dash', {}, { reset: true }); };
      var brs = $('#brs'); if (brs) brs.onclick = function () { LZ.go('branches', {}); };
      var alog = $('#alog'); if (alog) alog.onclick = function () { LZ.go('alog', {}); };
      $$('#thm button').forEach(function (b) { b.onclick = function () { LZ.theme.set(b.dataset.t); $$('#thm button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $$('#bz button').forEach(function (b) { b.onclick = function () { u.store.set('lz.buzz', b.dataset.b); $$('#bz button').forEach(function (x) { x.classList.toggle('on', x === b); }); if (b.dataset.b === '1') u.buzz('ok'); }; });
      $$('#fs button').forEach(function (b) { b.onclick = function () { u.store.set('lz.fs', b.dataset.f); LZ.applyFontSize(); $$('#fs button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      var i = $('#inst'); if (i) i.onclick = function () { LZ.go('install', {}); };
      $('#out').onclick = function () { LZ.logout(); };
      try {
        var cs = (LZ.cache.coursesBr === LZ.branch && LZ.cache.courses) || (await LZ.api('courses', {})).courses, pr = await LZ.api('prefs', {}); if (!alive()) return;
        LZ.cache.courses = cs; LZ.cache.coursesBr = LZ.branch;
        var mine = cs.filter(function (c) { return (c.mine > 0 || c.homeMine > 0) && c.stage === 'done'; });
        $('#pubs').innerHTML = mine.map(function (c) {
          return '<div class="row2" style="margin:0;padding:8px 0;border-top:1px solid var(--line2)"><span style="font-size:16px;word-break:break-all">' + esc(c.name) + '</span><label class="sw"><input type="checkbox" data-c="' + esc(c.id) + '" ' + (pr.off.indexOf(c.id) >= 0 ? '' : 'checked') + ' aria-label="' + esc(c.name) + ' 공개"><i></i></label></div>';
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
  function inviteText(nick, pin, home, staffAcc) {
    var nm = LZ.brName(home) || S.store;
    return '[파크골프 공략노트 · ' + nm + ']\n아래 주소를 눌러 들어오세요.\n' + LZ.appUrl() + LZ.linkQuery(nick, home) + '\n닉네임: ' + nick + '\n처음 비밀번호: ' + pin + '\n처음 들어오면 나만의 비밀번호 ' + (staffAcc ? '6' : '4') + '자리로 바꾸게 돼요.\n(카카오톡에서 열리면 오른쪽 위 ⋯ 메뉴의 "다른 브라우저로 열기"를 눌러 주세요.)';
  }
  var KIND = { trial: '체험회원', month: '월간회원', year: '연간회원', op: '운영자', admin: '관리자' };
  function chipCls(m) { return m.st === 'expired' ? 'r' : m.kind === 'trial' ? 'y' : m.kind === 'year' || m.kind === 'month' ? 'gr' : ''; }

  LZ.screens.members = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr('회원 관리') + '<div class="bd">' + ui.skeleton(4) + '</div>' + ui.tabs('members') + '</div>';
      var res = await LZ.api('members', { br: '' }); if (!alive()) return;   // 관리자는 모든 지점 회원을 받고 화면에서 거름
      var list = res.members, seats = res.seats, admin = ui.isAdmin(), kind = 'trial', open = null, del = null, result = null, q = '', filt = 'all';
      var brs = res.branches || S.branches || [], brF = u.store.get('lz.memBr') || '', newHome = LZ.branch || S.user.home;
      if (!admin) brF = '';
      LZ.guard = { kind: 'form', dirty: function () { var n = $('#nn'); return !!(n && n.value.trim()); }, body: '입력 중인 닉네임이 사라져요.', discard: function () {} };
      function resultCard() {
        if (!result) return '';
        return '<div class="ban g" style="margin-top:12px"><b>' + esc(result.title) + '</b><br>처음 비밀번호는 <b style="font-size:22px;letter-spacing:4px">' + esc(result.pin) + '</b> 이에요. 이 화면을 닫으면 다시 볼 수 없어요.</div><div class="ann" id="inv">' + esc(inviteText(result.nick, result.pin, result.home, result.staff)) + '</div>' +
          '<div style="display:grid;gap:8px"><button class="btn" id="shr" type="button">카카오톡·문자로 보내기</button><button class="btn g" id="cpy" type="button">안내문 복사</button></div>';
      }
      function memRow(m, i) {
        var self = m.uid === S.user.uid, per = u.period(m.start, m.end);
        return '<div class="mem"><div class="top"><div class="av">' + esc(m.nick[0]) + (m.online ? '<i class="on" title="접속 중"></i>' : '') + '</div><div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:500;word-break:break-all">' + esc(m.nick) + (self ? ' (나)' : '') + '</div>' +
          '<span class="chip ' + chipCls(m) + '">' + esc(ui.kindLabel(m)) + '</span>' + (m.active ? '' : ' <span class="chip r">이용 중지</span>') + (m.pendingPay ? ' <span class="chip r">입금 확인 대기</span>' : '') + (admin && m.homeName ? ' <span class="brtag">' + esc(m.homeName) + '</span>' : '') + (ui.isStaff(m) ? '' : m.src === 'self' ? ' <span class="chip">직접 가입</span>' : '') + (m.isNew && !ui.isStaff(m) ? ' <span class="chip y">NEW</span>' : '') + (m.sameDev ? ' <span class="chip r" title="같은 휴대폰으로 가입한 다른 계정">같은 폰 ' + m.sameDev + '개 더</span>' : '') + (m.stale ? ' <span class="chip">정리 대상</span>' : '') + (m.prev ? ' <span class="hint" style="margin:0;font-size:12px">(예전 ' + esc(m.prev) + ')</span>' : '') +
          '<div class="meta">' + (per ? per + '<br>' : '') + (m.online ? '<b style="color:var(--gt)">● 지금 접속 중</b>' : '마지막 접속: ' + u.ago(m.seenAt || m.last)) + ' · 기록한 코스 ' + (m.courses || 0) + '곳 · 신뢰 ' + (m.trust || 0) + '점' + (m.kind === 'trial' ? ' · 체험 연장 ' + (m.ext || 0) + '/2' : '') + '</div></div>' +
          (self || m.kind === 'admin' || (!admin && (m.kind === 'op')) ? '' : '<button class="sm" type="button" data-mg="' + i + '">관리</button>') + '</div>' + (open === i ? panel(m, i) : '') + '</div>';
      }
      function shown() {
        var k = u.key(q);
        return list.map(function (m, i) { return [m, i]; }).filter(function (x) {
          var m = x[0];
          if (k && u.key(m.nick).indexOf(k) < 0 && u.key(m.prev || '').indexOf(k) < 0) return false;
          if (brF === '_staff' && !ui.isStaff(m)) return false;
          if (brF && brF !== '_staff' && (m.home !== brF || ui.isStaff(m))) return false;
          if (filt === 'on') return !!m.online; if (filt === 'pay') return !!m.pendingPay; if (filt === 'exp') return m.st === 'expired';
          if (filt === 'new') return !!m.isNew && !ui.isStaff(m); if (filt === 'stale') return !!m.stale;
          return true;
        });
      }
      function draw() {
        var on = list.filter(function (m) { return m.online; }).length, pend = list.filter(function (m) { return m.pendingPay; }).length;
        root.innerHTML = '<div class="scr">' + ui.hdr('회원 관리') + '<div class="bd">' +
          '<div class="sumg"><div><b>' + on + '</b>접속 중</div><div><b>' + (seats.cap ? seats.used + '/' + seats.cap : seats.used) + '</b>좌석 사용</div><div><b>' + seats.waiting + '</b>대기</div></div>' +
          (admin && pend ? '<button class="btn" id="gopay" type="button" style="margin-bottom:10px">입금 확인 대기 ' + pend + '건 보기</button>' : '') +
          (admin ? '<div class="seg" id="brf" style="margin-bottom:10px;flex-wrap:wrap">' + [['', '모든 지점']].concat(brs.map(function (b) { return [b.code, b.name]; })).concat([['_staff', '운영진']]).map(function (f) { return '<button type="button" data-b="' + esc(f[0]) + '" class="' + (brF === f[0] ? 'on' : '') + '" style="font-size:14px">' + esc(f[1]) + '</button>'; }).join('') + '</div>' : '') +
          '<div class="blk"><h4>새 계정 만들기</h4><label class="lbl" for="nn" style="margin-top:0">닉네임 (한글·영문·숫자 2~8자)</label><input class="inp" id="nn" maxlength="8" autocomplete="off" placeholder="예: 다람쥐"><div class="msg" id="nnE" role="alert"></div>' +
          (admin ? '<label class="lbl">회원 종류</label><div class="seg" id="kind">' + [['trial', '체험'], ['month', '월간'], ['year', '연간'], ['op', '운영자']].map(function (k) { return '<button type="button" data-k="' + k[0] + '" class="' + (kind === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>'
            : '<p class="hint">운영자는 <b>체험회원</b>만 만들 수 있어요. 기본 지점은 <b>' + esc(S.user.homeName || '') + '</b>이에요.</p>') +
          (admin ? '<label class="lbl" for="nh">기본 지점</label><select class="inp" id="nh">' + brs.filter(function (b) { return b.active; }).map(function (b) { return '<option value="' + esc(b.code) + '"' + (b.code === newHome ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' : '') +
          '<p class="hint">' + (kind === 'trial' ? '체험회원: 오늘부터 5일 · 하루씩 2번까지 늘릴 수 있어요. 한 사람당 한 번만 만들어 주세요.' : kind === 'op' ? '운영자: 기본 지점 회원의 체험 만들기·연장, 비밀번호 다시 만들기, 그 지점 문의 답변·공지. 비밀번호는 6자리예요.' : KIND[kind] + ': 오늘부터 ' + (kind === 'month' ? 30 : 365) + '일') + ' 처음 비밀번호는 자동으로 만들어져요. 닉네임은 모든 지점에서 하나뿐이어야 해요.</p><button class="btn" id="mk" type="button">계정 만들기</button>' + resultCard() + '</div>' +
          '<input class="inp" id="mq" type="search" placeholder="닉네임 찾기" value="' + esc(q) + '" style="height:48px;margin-bottom:8px"><div class="seg" id="flt" style="margin-bottom:6px">' + [['all', '전체'], ['on', '접속 중'], ['new', '새 가입'], ['pay', '입금 대기'], ['exp', '기간 끝남']].concat(admin ? [['stale', '정리 대상']] : []).map(function (f) { return '<button type="button" data-f="' + f[0] + '" class="' + (filt === f[0] ? 'on' : '') + '" style="font-size:14px">' + f[1] + '</button>'; }).join('') + '</div>' +
          '<div class="hint" style="margin:6px 0">' + (admin ? '' : esc(S.user.homeName || '') + ' ') + '회원 ' + shown().length + '명</div><div id="ml">' + shown().map(function (x) { return memRow(x[0], x[1]); }).join('') + '</div>' +
          '<button class="sm" id="rf" type="button" style="margin-top:10px">새로고침</button></div>' + ui.tabs('members') + '</div>';
        $$('#kind button').forEach(function (b) { b.onclick = function () { kind = b.dataset.k; keep(); }; });
        $$('#flt button').forEach(function (b) { b.onclick = function () { filt = b.dataset.f; keep(); }; });
        $$('#brf button').forEach(function (b) { b.onclick = function () { brF = b.dataset.b; u.store.set('lz.memBr', brF); keep(); }; });
        var nh = $('#nh'); if (nh) nh.onchange = function () { newHome = nh.value; };
        $('#mq').oninput = function (e) { q = e.target.value; var pos = e.target.selectionStart; keep(); var mq = $('#mq'); mq.focus(); try { mq.setSelectionRange(pos, pos); } catch (er) { /* 무시 */ } };
        $('#mk').onclick = create;
        $('#rf').onclick = async function () { ui.busy(true, '불러오고 있어요…'); try { res = await LZ.api('members', { br: '' }); list = res.members; seats = res.seats; ui.busy(false); keep(); } catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4000); } };
        var gp = $('#gopay'); if (gp) gp.onclick = function () { LZ.go('payments', {}); };
        $$('[data-mg]').forEach(function (b) { b.onclick = function () { open = open === +b.dataset.mg ? null : +b.dataset.mg; del = null; keep(); }; });
        $$('.mp [data-a]').forEach(function (b) { b.onclick = function () { act(+b.dataset.i, b.dataset.a, b.dataset.v); }; });
        var s = $('#shr'); if (s) s.onclick = async function () { var t = inviteText(result.nick, result.pin, result.home, result.staff); if (!(await u.share(t, S.store))) { var ok = await u.copy(t); ui.toast(ok ? '안내문을 복사했어요. 카카오톡에 붙여 넣어 보내세요.' : '복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.', 4500); } };
        var c = $('#cpy'); if (c) c.onclick = async function () { var ok = await u.copy(inviteText(result.nick, result.pin, result.home, result.staff)); ui.toast(ok ? '안내문을 복사했어요. 카카오톡에 붙여 넣어 보내세요.' : '복사하지 못했어요. 글자를 길게 눌러 복사해 주세요.', 4500); };
      }
      function keep() { var v = $('#nn') ? $('#nn').value : ''; var y = window.scrollY; draw(); $('#nn').value = v; window.scrollTo(0, y); }
      function panel(m, i) {
        var b = function (a, v, label, cls) { return '<button type="button" class="' + (cls || '') + '" data-a="' + a + '" data-v="' + (v || '') + '" data-i="' + i + '">' + label + '</button>'; };
        var h = '<div class="mp">';
        if (m.kind === 'trial') h += (m.ext || 0) < 2 ? b('trialExt', '', '체험 하루 늘리기 (' + (m.ext || 0) + '/2번 사용)') : '<div class="hint" style="margin:0">체험 연장을 2번 모두 썼어요.</div>';
        if (admin) {
          ['month', 'year', 'op'].forEach(function (k) { if (m.kind !== k) h += b('kind', k, KIND[k] + '(으)로 바꾸기' + (k === 'month' ? ' (오늘부터 30일)' : k === 'year' ? ' (오늘부터 365일)' : '')); });
          if (m.kind === 'month' || m.kind === 'year') h += b('extend', '30', '기간 30일 늘리기') + b('extend', '365', '기간 365일 늘리기');
        }
        h += b('trust', '', '신뢰도 보기 (' + (m.trust || 0) + '점)') + b('pin', '', '비밀번호 다시 만들기');
        if (admin) h += b('home', '', '기본 지점 바꾸기 (지금 ' + (m.homeName || '-') + ')') + b('rename', '', '닉네임 정리 (닉네임 확인 요청 처리)');
        if (!admin && m.kind === 'trial') h += b('active', m.active ? '0' : '1', m.active ? '이용 중지 (장난 가입 등)' : '이용 다시 시작');
        if (admin) {
          h += b('active', m.active ? '0' : '1', m.active ? '이용 중지' : '이용 다시 시작');
          h += del === i ? b('delok', '', '정말 삭제할게요 (기록도 함께 지워져요)', 'dng') + b('delno', '', '취소') : b('del', '', '삭제', 'dng');
        }
        return h + '</div>';
      }
      async function create() {
        if (working) return; working = true;
        try { await create2(); } finally { working = false; }
      }
      async function create2() {
        var nick = $('#nn').value.trim(), e = $('#nnE'); e.textContent = ''; $('#nn').classList.remove('bad');
        if (!/^[가-힣A-Za-z0-9]{2,8}$/.test(nick)) { e.textContent = '닉네임은 한글·영문·숫자 2~8자로 적어 주세요. (띄어쓰기 없이)'; $('#nn').classList.add('bad'); return; }
        var k = admin ? kind : 'trial';
        var home = admin ? newHome : S.user.home;
        if (k === 'op' && !(await ui.confirm(nick + '님을 ' + LZ.brName(home) + ' 운영자로 만들까요?', '운영자는 이 지점이 기본 지점인 회원의 체험을 만들고 늘릴 수 있고, 이 지점 문의 답변과 공지를 쓸 수 있어요.', '만들기'))) return;
        ui.busy(true, '계정을 만들고 있어요…');
        try {
          var r = await LZ.api('mCreate', { nick: nick, kind: k, home: home }, { retry: 0 });
          list.unshift(r.member); result = { nick: r.member.nick, pin: r.pin, home: r.member.home, staff: k === 'op', title: r.member.nick + '님 계정을 만들었어요. (' + KIND[k] + ' · ' + (r.member.homeName || '') + ')' }; ui.busy(false); draw(); $('#nn').value = '';
          var rc = $('#inv'); if (rc) rc.scrollIntoView({ block: 'center' });
        } catch (er) { ui.busy(false); $('#nnE').textContent = ui.errText(er); $('#nn').classList.add('bad'); }
      }
      var working = false;
      async function act(i, a, v) {
        if (working) return; working = true;
        try { await act2(i, a, v); } finally { working = false; }
      }
      async function act2(i, a, v) {
        var m = list[i];
        if (a === 'del') { del = i; return keep(); } if (a === 'delno') { del = null; return keep(); }
        if (a === 'trust') { LZ.guard = null; return LZ.go('trust', { uid: m.uid, nick: m.nick }); }
        var body = { uid: m.uid, op: a };
        if (a === 'rename') {
          var rv = await ui.dialog({ title: m.nick + '님 닉네임 정리', body: '닉네임을 다른 분이 먼저 차지했다는 확인 요청을 처리할 때 써요. 바꾸면 예전 닉네임은 바로 다른 분이 쓸 수 있어요.', html: '<input class="inp" maxlength="8" placeholder="새 닉네임" style="margin-bottom:12px">', cancel: null, collect: true,
            buttons: [{ label: '바꾸기', kind: 'y', value: 'ok' }, { label: '취소', kind: 'g', value: null }] });
          if (!rv || rv.v !== 'ok' || !rv.val.trim()) return; body.to = rv.val.trim();
        }
        if (a === 'home') {
          var pick = await ui.dialog({ title: m.nick + '님 기본 지점', body: '지금: ' + (m.homeName || '-') + (ui.isStaff(m) ? '\n운영자는 기본 지점의 회원·문의·공지를 맡아요.' : '\n이 회원을 관리하는 운영자가 바뀌어요.'), cancel: null,
            buttons: brs.filter(function (x) { return x.active && x.code !== m.home; }).map(function (x) { return { label: x.name + '(으)로', kind: 'y', value: x.code }; }).concat([{ label: '취소', kind: 'g', value: null }]) });
          if (!pick) return; body.br = pick;
        }
        if (a === 'kind') { body.kind = v; if (!(await ui.confirm(m.nick + '님을 ' + KIND[v] + '(으)로 바꿀까요?', v === 'op' ? '운영자는 기간 없이 쓸 수 있어요.' : '오늘부터 ' + (v === 'month' ? 30 : 365) + '일 동안 쓸 수 있어요. 결제로 생긴 기간이 있다면 "기간 늘리기"를 쓰세요.', '바꾸기'))) return; }
        else if (a === 'extend') body.days = +v;
        else if (a === 'trialExt') { if (!(await ui.confirm(m.nick + '님 체험을 하루 늘릴까요?', '체험은 하루씩 2번까지 늘릴 수 있어요. (지금 ' + (m.ext || 0) + '번 사용)', '하루 늘리기'))) return; }
        else if (a === 'pin') { if (!(await ui.confirm(m.nick + '님 비밀번호를 다시 만들까요?', '지금 로그인되어 있는 폰에서는 로그아웃돼요. 새 비밀번호를 알려 주셔야 해요.', '다시 만들기'))) return; }
        else if (a === 'active') { body.on = +v; if (!+v && !(await ui.confirm(m.nick + '님 이용을 중지할까요?', '로그인할 수 없고, 다른 회원에게 기록도 보이지 않아요.', '이용 중지', true))) return; }
        else if (a === 'delok') body.op = 'delete';
        ui.busy(true, '처리하고 있어요…');
        try {
          var r = await LZ.api('mUpdate', body, { retry: 0 }); ui.busy(false);
          if (body.op === 'delete') { list.splice(i, 1); open = null; del = null; ui.toast(m.nick + '님 계정을 지웠어요'); }
          else {
            var keepX = { online: m.online, seenAt: m.seenAt, courses: m.courses, pendingPay: m.pendingPay, trust: m.trust };
            list[i] = Object.assign(r.member, keepX);
            if (body.op === 'pin') { result = { nick: m.nick, pin: r.pin, home: m.home, staff: ui.isStaff(m), title: m.nick + '님 비밀번호를 다시 만들었어요.' }; open = null; }
            else ui.toast(body.op === 'trialExt' ? '체험을 ' + u.ymd(r.member.end) + '까지 늘렸어요' : body.op === 'home' ? '기본 지점을 ' + r.member.homeName + '(으)로 바꿨어요' : body.op === 'rename' ? '닉네임을 "' + r.member.nick + '"(으)로 바꿨어요' : '바꿨어요', 3000);
          }
          LZ.cache.courses = null; keep();
          if (result && body.op === 'pin') { var rc = $('#inv'); if (rc) rc.scrollIntoView({ block: 'center' }); }
        } catch (er) { ui.busy(false); ui.toast(ui.errText(er), 5000); }
      }
      draw();
    }
  };

  /* ───── 결제 확인 · 환불 (관리자) ───── */
  var STATUS = { ok: '승인', rejected: '거절', refunded: '환불', pending: '확인 대기' };
  LZ.screens.payments = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('결제 확인 · 환불') + '<div class="bd nt">' + ui.skeleton(4) + '</div></div>';
      var d = await LZ.api('payList', {}); if (!alive()) return;
      function when(ts) { return ts ? new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2('결제 확인 · 환불') + '<div class="bd nt">' +
          '<div class="ban">카카오페이 내역이나 통장에서 <b>보낸 분 표시(닉네임)</b>와 금액을 확인한 뒤 승인해 주세요. 승인하면 그 회원의 이용이 바로 시작돼요.</div>' +
          '<h3 style="font-size:17px;margin:12px 0 8px">확인 대기 ' + d.pending.length + '건</h3>' +
          (d.pending.map(function (x) {
            return '<div class="paybox"><div class="t">' + esc(x.nick) + '님 · ' + esc(x.planName) + ' ' + u.won(x.amount) + '</div><div class="meta">' + LZ.METHOD[x.method] + ' · 보낸 분 표시: <b>' + esc(x.depositor) + '</b> · ' + when(x.created) + '</div>' +
              '<div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;margin-top:8px"><button class="btn sm2" data-ok="' + esc(x.id) + '" type="button">입금 확인 · 승인</button><button class="btn g sm2" data-no="' + esc(x.id) + '" type="button">거절</button></div></div>';
          }).join('') || '<div class="ann">확인할 결제가 없어요.</div>') +
          '<h3 style="font-size:17px;margin:18px 0 8px">최근 처리</h3>' +
          (d.recent.map(function (x) {
            return '<div class="paybox"><div class="t">' + esc(x.nick) + '님 · ' + esc(x.planName) + ' ' + u.won(x.amount) + ' <span class="chip ' + (x.status === 'ok' ? 'gr' : 'r') + '">' + STATUS[x.status] + '</span></div><div class="meta">' + LZ.METHOD[x.method] + ' · ' + esc(x.depositor) + ' · 처리 ' + when(x.decided) + ' (' + esc(x.by) + ')' +
              (x.start ? '<br>기간 ' + u.period(x.start, x.end) : '') + (x.status === 'refunded' ? '<br>환불 ' + u.won(x.refund) + ' · ' + when(x.refundAt) : '') + '</div>' +
              (x.status === 'ok' ? '<button class="sm" data-rf="' + esc(x.id) + '" type="button" style="margin-top:6px">환불 계산하기</button>' : '') + '</div>';
          }).join('') || '<div class="ann">아직 없어요.</div>') + '</div></div>';
        $$('[data-ok]').forEach(function (b) { b.onclick = function () { decide(b.dataset.ok, true); }; });
        $$('[data-no]').forEach(function (b) { b.onclick = function () { decide(b.dataset.no, false); }; });
        $$('[data-rf]').forEach(function (b) { b.onclick = function () { refund(b.dataset.rf); }; });
      }
      function find(id) { return d.pending.concat(d.recent).filter(function (x) { return x.id === id; })[0]; }
      async function reload() { d = await LZ.api('payList', {}); if (alive()) draw(); }
      var working = false;                                                   // 처리 중에는 다른 단추를 눌러도 무시(두 번 처리 방지)
      async function decide(id, ok) {
        if (working) return; var x = find(id); working = true;
        try { await decide2(x, id, ok); } finally { working = false; }
      }
      async function decide2(x, id, ok) {
        if (!(await ui.confirm(ok ? '승인할까요?' : '거절할까요?', x.nick + '님 ' + x.planName + ' ' + u.won(x.amount) + '\n보낸 분 표시: ' + x.depositor + (ok ? '\n입금을 확인했을 때만 승인해 주세요.' : '\n입금이 확인되지 않을 때 거절해요.'), ok ? '승인' : '거절', !ok))) return;
        ui.busy(true, '처리하고 있어요…');
        try { var r = await LZ.api('payDecide', { id: id, ok: ok ? 1 : 0 }, { retry: 0 }); ui.busy(false); ui.toast(ok ? x.nick + '님 ' + x.planName + ' 시작: ' + u.period(r.pay.start, r.pay.end) : '거절했어요', 5000); await reload(); }
        catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); reload(); }
      }
      async function refund(id) {
        if (working) return; working = true;
        try { await refund2(id); } finally { working = false; }
      }
      async function refund2(id) {
        var x = find(id);
        ui.busy(true, '환불 금액을 계산하고 있어요…');
        try {
          var c = (await LZ.api('payRefund', { id: id }, { retry: 0 })).calc; ui.busy(false);
          var go = await ui.dialog({ title: '환불 ' + u.won(c.amount), body: x.nick + '님 ' + x.planName + ' ' + u.won(x.amount) + '\n' + c.why + '\n남은 날: ' + c.remain + '일 / ' + c.total + '일\n\n환불 처리하면 이 회원의 이용 기간이 어제로 끝나요. 돈은 직접 돌려보내 주세요.', cancel: false,
            buttons: [{ label: u.won(c.amount) + ' 환불 처리', kind: 'r', value: true }, { label: '취소', kind: 'g', value: false }] });
          if (!go) return;
          ui.busy(true, '처리하고 있어요…');
          await LZ.api('payRefund', { id: id, confirm: 1 }, { retry: 0 }); ui.busy(false); ui.toast('환불 처리했어요. ' + u.won(c.amount) + '을 회원에게 돌려보내 주세요.', 6000); await reload();
        } catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
      }
      draw();
    }
  };

  /* ───── 관리자 설정 ───── */
  LZ.screens.adminCfg = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('관리자 설정') + '<div class="bd nt">' + ui.skeleton(4) + '</div></div>';
      var d = await LZ.api('adminCfg', {}); if (!alive()) return;
      var c = d.cfg;
      function f(id, label, val, attrs) { return '<label class="lbl" for="' + id + '">' + label + '</label><input class="inp" id="' + id + '" value="' + esc(val) + '" ' + (attrs || '') + '>'; }
      function draw() {
        root.innerHTML = '<div class="scr">' + ui.hdr2('관리자 설정') + '<div class="bd nt">' +
          '<p class="hint" style="margin-top:0">요금·결제·좌석·문의·로고는 모든 지점 공통이에요. 지점 이름은 설정 → 지점 관리에서 바꿔요.</p>' +
          '<div class="blk"><h4>요금</h4>' + f('pm', '월간회원 (30일) 요금, 원', c.price_month, 'inputmode="numeric"') + f('py', '연간회원 (365일) 요금, 원', c.price_year, 'inputmode="numeric"') + '</div>' +
          '<div class="blk"><h4>카카오페이 송금 QR</h4><p class="hint" style="margin-top:0">카카오페이 앱 → 송금 → "QR로 송금받기"에서 만든 QR 사진을 올리면 주소를 자동으로 읽어요. 월간·연간을 따로 만들어 금액을 넣어 두면 편해요.</p>' +
          ['month', 'year'].map(function (k) {
            return '<label class="lbl">' + (k === 'month' ? '월간' : '연간') + ' QR 주소</label><input class="inp" id="qr_' + k + '" value="' + esc(c['qr_' + k]) + '" placeholder="https://qr.kakaopay.com/…" style="font-size:15px">' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><label class="sm" style="cursor:pointer">QR 사진에서 읽기<input type="file" accept="image/*" data-qr="' + k + '" style="display:none"></label><button class="sm" type="button" data-test="' + k + '">열어서 시험하기</button></div>';
          }).join('') + '</div>' +
          '<div class="blk"><h4>계좌이체</h4>' + f('bn', '은행', c.bank_name) + f('bno', '계좌번호', c.bank_no, 'inputmode="numeric"') + f('bh', '예금주 (회원에게 보이는 이름)', c.bank_holder) + '</div>' +
          '<div class="blk"><h4>문의하기 (시험 모드)</h4><div class="seg" id="qm">' + [['off', '끄기'], ['test', '시험'], ['on', '모두에게']].map(function (m) { return '<button type="button" data-m="' + m[0] + '" class="' + (c.qna_mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
            '<p class="hint">시험: 관리자·운영자와 아래 시험 회원에게만 보여요. 충분히 써 본 뒤 "모두에게"로 바꾸세요.</p>' + f('qt', '시험 회원 닉네임 (쉼표로 나눠서)', c.qna_testers, 'placeholder="예: 우리집, 다람쥐"') + '</div>' +
          '<div class="blk"><h4>직접 체험 가입 (로그인 화면)</h4><div class="seg" id="jm">' + [['on', '받기'], ['off', '멈추기']].map(function (m) { return '<button type="button" data-m="' + m[0] + '" class="' + (c.join_mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
            f('jd', '하루 가입 한도 (서버 전체)', c.join_per_day, 'inputmode="numeric"') + '<p class="hint">한 휴대폰에서는 30일에 1번만 가입돼요. 1시간에 30건이 넘으면 잠시 마감돼요. 운영자가 만들어 주는 계정은 한도와 상관없어요.</p></div>' +
          '<div class="blk"><h4>추천 보상</h4><label class="chk"><input type="checkbox" id="ro"' + (c.ref_on ? ' checked' : '') + '> 친구가 내 링크로 가입하고 이용권을 결제하면 보상</label>' + f('rd', '보상 일수', c.ref_days, 'inputmode="numeric"') +
            '<p class="hint">친구가 처음 월간·연간을 결제(승인)할 때 한 번만 줘요. 그 결제를 환불하면 보상도 빠져요.</p></div>' +
          '<div class="blk"><h4>동시 사용 좌석</h4>' + f('st', '좌석 수 (0 = 제한 없음)', c.seats, 'inputmode="numeric"') + '<p class="hint">지금 사용 ' + d.seats.used + '명 · 대기 ' + d.seats.waiting + '명. 좌석이 모두 차면 새로 들어오는 회원은 대기 화면에서 순서를 기다려요. 10분 동안 움직임이 없으면 좌석이 비워져요. 운영자·관리자는 기다리지 않아요. 좌석 수는 README의 부하 시험 결과로 정해 주세요.</p></div>' +
          '<div class="msg" id="err" role="alert"></div><button class="btn" id="save" type="button">설정 저장</button>' +
          '<div class="blk" style="margin-top:14px"><h4>로고 바꾸기 <span class="chip y">모든 회원에게 적용</span></h4>' + ['light', 'dark'].map(function (slot) {
            return '<div class="logobox" style="' + (slot === 'dark' ? 'margin-top:8px' : '') + '"><div class="tn" style="background:' + (slot === 'dark' ? '#17191E' : '#fff;border:1px solid #DDE0E8') + '"><img src="' + esc(S.logos[slot]) + '" alt=""></div><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:500">' + (slot === 'dark' ? '어두운 화면용' : '밝은 화면용') + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><label class="sm" style="cursor:pointer">파일 고르기<input type="file" accept="image/png,image/jpeg,image/webp" data-slot="' + slot + '" style="display:none"></label><button class="sm" type="button" data-reset="' + slot + '">처음 로고로</button></div></div></div>';
          }).join('') + '<div class="msg" id="lerr" role="alert"></div></div></div></div>';
        $$('#qm button').forEach(function (b) { b.onclick = function () { $$('#qm button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        $$('#jm button').forEach(function (b) { b.onclick = function () { $$('#jm button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
        $$('[data-qr]').forEach(function (inp) {
          inp.onchange = async function () {
            var file = inp.files[0]; if (!file) return; ui.busy(true, 'QR을 읽고 있어요…');
            try {
              await u.loadScript('vendor/jsQR.js');
              var url = await readQR(file); ui.busy(false);
              if (!url) return ui.toast('QR을 찾지 못했어요. QR이 크게 나온 사진으로 다시 해 주세요.', 5000);
              if (!/^https:\/\/qr\.kakaopay\.com\//.test(url)) return ui.toast('카카오페이 송금 QR이 아니에요: ' + url.slice(0, 40), 6000);
              $('#qr_' + inp.dataset.qr).value = url; ui.toast('QR 주소를 읽었어요. "설정 저장"을 눌러 주세요.', 4500);
            } catch (e) { ui.busy(false); ui.toast(e.message || '읽지 못했어요', 5000); }
            inp.value = '';
          };
        });
        $$('[data-test]').forEach(function (b) { b.onclick = function () { var v = $('#qr_' + b.dataset.test).value.trim(); if (!v) return ui.toast('QR 주소가 비어 있어요'); window.open(v, '_blank', 'noopener'); }; });
        $('#save').onclick = async function () {
          var qmB = $('#qm .on'), body = { qna_mode: qmB ? qmB.dataset.m : c.qna_mode, qna_testers: $('#qt').value, price_month: $('#pm').value, price_year: $('#py').value, qr_month: $('#qr_month').value.trim(), qr_year: $('#qr_year').value.trim(), bank_name: $('#bn').value, bank_no: $('#bno').value.trim(), bank_holder: $('#bh').value, seats: $('#st').value.trim(), join_mode: ($('#jm .on') || {}).dataset ? $('#jm .on').dataset.m : c.join_mode, join_per_day: $('#jd').value.trim(), ref_on: $('#ro').checked ? 1 : 0, ref_days: $('#rd').value.trim() };
          $('#err').textContent = ''; ui.busy(true, '저장하고 있어요…');
          try { var r = await LZ.api('setCfg', body, { retry: 0 }); ui.busy(false); d = r; c = r.cfg; LZ.guard = null; draw(); ui.toast('설정을 저장했어요'); }
          catch (e) { ui.busy(false); $('#err').textContent = ui.errText(e); }
        };
        $$('input[data-slot]').forEach(function (fl) {
          fl.onchange = async function () {
            var file = fl.files[0]; if (!file) return; $('#lerr').textContent = '';
            ui.busy(true, '그림을 줄여서 올리고 있어요…');
            try {
              var data = await u.resizeImage(file, 640, 400000), r = await LZ.api('logoPut', { slot: fl.dataset.slot, data: data }, { retry: 0, timeout: 60000 });
              S.logos[fl.dataset.slot] = data; var cc = u.store.getJSON('lz.cfg') || {}; cc.logoVer = r.logoVer; cc.logos = cc.logos || {}; cc.logos[fl.dataset.slot] = data; u.store.setJSON('lz.cfg', cc);
              ui.busy(false); ui.toast('로고를 바꿨어요. 모든 회원에게 적용돼요.', 4500); draw();
            } catch (e) { ui.busy(false); $('#lerr').textContent = ui.errText(e); }
          };
        });
        $$('[data-reset]').forEach(function (b) {
          b.onclick = async function () {
            if (!(await ui.confirm('처음 로고로 되돌릴까요?', '올려 둔 로고가 없어지고 기본 로고로 돌아가요.', '되돌리기'))) return;
            ui.busy(true, '되돌리고 있어요…');
            try {
              await LZ.api('logoReset', { slot: b.dataset.reset }, { retry: 0 }); var r = await LZ.api('cfg', { lv: 0 }, { noAuth: true });
              S.logos[b.dataset.reset] = 'assets/logo-' + b.dataset.reset + '.png'; var cc = u.store.getJSON('lz.cfg') || {}; cc.logoVer = r.logoVer || 0; cc.logos = cc.logos || {}; cc.logos[b.dataset.reset] = null; u.store.setJSON('lz.cfg', cc);
              ui.busy(false); ui.toast('처음 로고로 되돌렸어요'); draw();
            } catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
          };
        });
      }
      draw();
    }
  };
  /* QR 사진 → 주소 (여러 크기로 시도) */
  function readQR(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('파일을 읽지 못했어요')); };
      rd.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('그림 파일이 아니에요')); };
        img.onload = function () {
          var sizes = [1000, 700, 1400, 500];
          for (var k = 0; k < sizes.length; k++) {
            var s = Math.min(1, sizes[k] / Math.max(img.width, img.height)), cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
            var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, cv.width, cv.height);
            var px = ctx.getImageData(0, 0, cv.width, cv.height), code = window.jsQR(px.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
            if (code && code.data) return resolve(code.data);
          }
          resolve(null);
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
})();
