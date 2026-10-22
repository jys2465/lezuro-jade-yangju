/* 이용권 결제(닉네임 송금 → 관리자 확인) · 회원 상태 안내 띠 */
(function () {
  'use strict';
  var LZ = window.LZ, u = LZ.u, ui = LZ.ui, $ = u.$, $$ = u.$$, esc = u.esc, S = LZ.S;
  var METHOD = { kakao: '카카오페이', bank: '계좌이체' };
  LZ.METHOD = METHOD;

  /* ───── 코스 목록 위의 안내 띠 ───── */
  LZ.memberBanner = function () {
    var us = S.user, me = S.me || {}, pend = me.pending, h = '';
    if (!us) return '';
    var nu = LZ.noticeUnread ? LZ.noticeUnread() : 0;
    if (nu) { var sn = u.store.getJSON('lz.ntSeen') || {}, nf = (me.notices || []).filter(function (n) { return sn[n.id] !== n.upd; })[0]; h += '<button type="button" class="ntb" data-nt>📢 새 공지 ' + nu + '건' + (nf ? ' · ' + esc(nf.title) : '') + ' ›</button>'; }
    if (me.qnaOn && me.qna > 0 && !ui.isStaff(us)) h += '<div class="ban b">운영진 답변이 도착했어요 (' + me.qna + '건). <button class="sm" data-qna type="button" style="margin-top:6px">문의 보기</button></div>';
    if (ui.isStaff(us)) return h;
    var per = u.period(us.start, us.end), rf = me.refund;
    if (rf && rf.req) h += '<div class="ban b">환불 신청을 확인하고 있어요 (예상 ' + u.won(rf.req.amount) + ' · ' + esc(rf.req.bank) + ' ' + esc(rf.req.acct) + '). 관리자가 보내면 알려 드려요. <button class="sm" data-refund type="button" style="margin-top:6px">환불 신청 보기</button></div>';
    else if (rf && rf.recent && rf.recent.status === 'done') h += '<div class="ban g">환불 <b>' + u.won(rf.recent.amount) + '</b>을 ' + esc(rf.recent.bank) + ' ' + esc(rf.recent.acct) + ' 계좌로 보냈어요. (' + u.fmtDate(rf.recent.decided) + ')</div>';
    else if (rf && rf.recent && rf.recent.status === 'rejected') h += '<div class="ban r">환불 신청이 반려됐어요: ' + esc(rf.recent.note) + ' <button class="sm" data-refund type="button" style="margin-top:6px">자세히</button></div>';
    if (pend) h += '<div class="ban b">입금 확인을 기다리고 있어요 (' + esc(pend.planName) + ' ' + u.won(pend.amount) + '). 관리자가 확인하면 바로 이용이 시작돼요. <button class="sm" data-pay type="button" style="margin-top:6px">결제 상태 보기</button></div>';
    if (us.st === 'expired') return h + (pend ? '' : '<div class="ban r"><b>' + esc(us.kindName || '') + ' 기간이 끝났어요</b> (' + per + ')<br>지금은 로그인해서 내 기록을 보는 것만 할 수 있어요. 기록 쓰기·고치기·가져오기, 다른 회원 기록 보기, 코스 등록은 결제하면 다시 돼요.<br><button class="btn" data-pay type="button" style="margin-top:8px;min-height:48px">이용권 결제하기</button></div>');
    if (us.kind === 'trial') return h + (pend ? '' : '<div class="ban' + (us.left <= 2 ? ' r' : '') + '"><b>' + (us.left <= 2 ? '체험이 곧 끝나요' : '체험회원') + '</b> · ' + (us.left > 0 ? 'D-' + us.left : '오늘까지') + ' (' + per + ')<br>' + (us.left <= 2 ? '지금 결제하면 기록을 계속 쓰고 다른 회원 기록도 계속 볼 수 있어요.' : '체험 중에 결제하면 확인 즉시 이용권이 시작돼요.') + '<br><button class="btn" data-pay type="button" style="margin-top:8px;min-height:48px">이용권 결제하기</button></div>');
    if (me.pay && me.pay.ok && !pend) return h + '<div class="ban"><b>' + esc(us.kindName) + '</b> · ' + u.dday(us.left) + ' (' + per + ')<br>지금 연장하면 끝나는 날 다음 날부터 이어서 시작돼요. <button class="sm" data-pay type="button" style="margin-top:6px">연장 결제</button></div>';
    return h + '<div class="hint" style="margin:0 2px 10px">' + esc(us.kindName) + ' · ' + per + ' (' + u.dday(us.left) + ')</div>';
  };
  LZ.bindMemberBanner = function (root) {
    $$('[data-pay]', root).forEach(function (b) { b.onclick = function () { LZ.go('pay', {}); }; });
    $$('[data-nt]', root).forEach(function (b) { b.onclick = function () { LZ.go('notices', {}); }; });
    $$('[data-refund]', root).forEach(function (b) { b.onclick = function () { LZ.go('refund', {}); }; });
    $$('[data-trust]', root).forEach(function (b) { b.onclick = function () { LZ.go('trust', {}); }; });
    $$('[data-qna]', root).forEach(function (b) { b.onclick = function () { LZ.go('qna', { tab: 'list', fromSettings: !ui.isStaff() }); }; });
  };
  /* 내 기록 신뢰도: 다른 회원이 내 기록을 가져다 쓴 수(코스마다 1점) */
  LZ.trustChip = function () {
    var t = S.me && typeof S.me.trust === 'number' ? S.me.trust : null;
    return t === null ? '' : '<button type="button" class="sm" data-trust style="margin:0 0 10px;width:100%;justify-content:space-between"><span>내 기록 신뢰도</span><b style="color:var(--pri)">' + t + '점 ›</b></button>';
  };

  /* ───── 신뢰도 목록: 언제(가장 최근), 누가, 어느 코스 ───── */
  LZ.screens.trust = {
    show: async function (p, root, alive) {
      var other = (p.uid && p.uid !== S.user.uid) || (p.nick && p.nick !== S.user.nick), title = other ? p.nick + '님 신뢰도' : '내 기록 신뢰도';
      root.innerHTML = '<div class="scr">' + ui.hdr2(title) + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.capi('trust', other ? (p.uid ? { uid: p.uid } : { nick: p.nick }) : {}, { onFresh: LZ.fresh('trust') }); if (!alive()) return;
      if (!other) S.me = Object.assign({}, S.me, { trust: d.trust });
      function when(ts) { var x = new Date(ts); return x.getFullYear() + '. ' + (x.getMonth() + 1) + '. ' + x.getDate() + '. ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); }
      root.innerHTML = '<div class="scr">' + ui.hdr2(title) + '<div class="bd nt">' +
        '<div class="sumg" style="grid-template-columns:1fr"><div><b style="font-size:36px;color:var(--pri)">' + d.trust + '점</b>' + (other ? esc(d.nick) + '님 기록을 가져다 쓴 수' : '다른 회원이 내 기록을 가져다 쓴 수') + '</div></div>' +
        '<p class="hint" style="margin:0 0 10px">모든 매장 점수를 합친 거예요. 한 회원이 한 매장·한 코스에서 가져다 쓰면 1점이에요. 같은 코스를 여러 번 가져가도 1점이고, 날짜만 가장 최근으로 바뀌어요. 최근 순으로 보여요.</p>' +
        (d.list.map(function (x) {
          return '<div class="paybox" role="button" tabindex="0" data-c="' + esc(x.cid) + '" style="cursor:pointer"><div class="t">' + esc(x.course) + '<span class="brtag">' + esc(x.store) + '</span></div><div class="meta"><b>' + esc(x.user) + '님</b>이 가져다 썼어요 · ' + when(x.at) + (x.first !== x.at ? ' (처음 ' + when(x.first).slice(0, -6) + ')' : '') + '</div></div>';
        }).join('') || '<div class="ann">아직 없어요. 코스에 기록을 남기고 공개해 두면, 다른 회원이 가져다 쓸 때마다 올라가요.</div>') + '</div></div>';
      $$('[data-c]', root).forEach(function (b) { b.onclick = function () { if (b.dataset.c && !/지워진/.test(b.innerText)) LZ.go('holes', { id: b.dataset.c }); }; });
    }
  };

  function drawQR(host, text) {
    return u.loadScript('vendor/qrcode.js').then(function () {
      var q = window.qrcode(0, 'M'); q.addData(text); q.make();
      host.innerHTML = '<img alt="카카오페이 송금 QR" src="' + q.createDataURL(6, 2) + '">';
    }).catch(function () { host.innerHTML = ''; });
  }

  /* ───── 환불 신청: 받을 계좌를 적어서 신청 → 관리자가 보낸 뒤 완료 ─────
   * 계좌번호·예금주는 내 화면에서도 일부를 *로 가려서 보여요(관리자만 처리할 때 전체 번호를 봐요) */
  var BANKS = ['카카오뱅크', 'KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '토스뱅크', '케이뱅크', 'SC제일', '새마을금고', '우체국', '신협', '수협', '지역농·축협', '부산', '경남', '대구(iM뱅크)', '광주', '전북', '제주', '씨티'];
  LZ.screens.refund = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('환불 신청') + '<div class="bd nt">' + ui.skeleton(3) + '</div></div>';
      var d = await LZ.api('refundInfo', {}); if (!alive()) return;
      function stView(x) {
        var st = { req: ['확인 중', 'b'], done: ['보냈어요', 'g'], rejected: ['반려', 'r'] }[x.status] || ['', ''];
        return '<div class="blk"><h4>환불 신청 <span class="chip ' + (st[1] === 'g' ? 'gr' : st[1] === 'r' ? 'r' : 'y') + '">' + st[0] + '</span></h4><div class="ann">이용권: ' + esc(x.planName) + ' ' + u.won(x.paid) + '\n' +
          (x.status === 'done' ? '보낸 금액: ' + u.won(x.amount) : '예상 환불: ' + u.won(x.amount) + ' (' + esc(x.why) + ')') + '\n받을 계좌: ' + esc(x.bank) + ' ' + esc(x.acct) + '\n예금주: ' + esc(x.holder) +
          (x.reason ? '\n사유: ' + esc(x.reason) : '') + '\n신청: ' + u.fmtDT(x.created) + (x.decided ? '\n처리: ' + u.fmtDT(x.decided) : '') + (x.note ? '\n관리자 안내: ' + esc(x.note) : '') + '</div>' +
          (x.status === 'req' ? '<p class="hint">관리자가 계좌로 보내면 이용 기간이 신청한 날로 끝나요. 계좌번호는 안전을 위해 일부를 가려서 보여 드려요.</p><button class="btn g" id="rfc" type="button">환불 신청 취소</button>' : '') + '</div>';
      }
      function draw() {
        var st = d.state || {}, body = '';
        if (st.req) body = stView(st.req);
        else if (!d.pay) body = (st.recent ? stView(st.recent) : '') + '<div class="ban">환불할 수 있는 결제가 없어요. (가장 최근에 승인된 결제만 환불할 수 있어요)</div>';
        else {
          var c = d.calc;
          body = (st.recent ? stView(st.recent) : '') +
            '<div class="blk"><h4>환불할 결제</h4><div class="ann">' + esc(d.pay.planName) + ' ' + u.won(d.pay.amount) + ' (' + u.period(d.pay.start, d.pay.end) + ')\n예상 환불 금액: <b>' + u.won(c.amount) + '</b>\n' + esc(c.why) + '</div>' +
            '<p class="hint">결제 후 ' + d.fullDays + '일 이내이고 기록을 쓰지 않았으면 전액, 그 밖에는 남은 날짜만큼 나눠서 돌려드려요. 금액은 <b>신청한 날</b> 기준이에요.</p></div>' +
            '<div class="blk"><h4>돌려받을 계좌</h4>' +
            '<label class="lbl" for="rb" style="margin-top:0">은행</label><select class="inp" id="rb"><option value="">은행을 골라 주세요</option>' + BANKS.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '<option value="_">직접 적기</option></select>' +
            '<input class="inp" id="rbx" maxlength="20" placeholder="은행 이름" style="display:none;margin-top:6px">' +
            '<label class="lbl" for="ra">계좌번호</label><input class="inp" id="ra" inputmode="numeric" maxlength="30" autocomplete="off" placeholder="숫자만 적어도 돼요">' +
            '<label class="lbl" for="rh">예금주</label><input class="inp" id="rh" maxlength="20" autocomplete="off" placeholder="통장에 적힌 이름">' +
            '<label class="lbl" for="rr">사유 (선택)</label><input class="inp" id="rr" maxlength="100" placeholder="예: 이사해서 매장에 못 가요">' +
            '<label class="chk" style="margin-top:8px"><input type="checkbox" id="rag"> 환불하면 이용 기간이 신청한 날로 끝나는 것을 확인했어요</label>' +
            '<div class="msg" id="err" role="alert"></div><button class="btn" id="rgo" type="button" style="margin-top:8px">환불 신청하기</button>' +
            '<p class="hint">계좌번호는 관리자가 송금할 때만 보고, 처리가 끝나면 일부를 가린 번호만 남겨요.</p></div>';
        }
        root.innerHTML = '<div class="scr">' + ui.hdr2('환불 신청') + '<div class="bd nt">' + body + '</div></div>';
        var rb = $('#rb'); if (rb) rb.onchange = function () { $('#rbx').style.display = rb.value === '_' ? 'block' : 'none'; };
        var ra = $('#ra'); if (ra) ra.oninput = function () { var v = ra.value.replace(/[^\d-]/g, ''); if (v !== ra.value) ra.value = v; };
        var go = $('#rgo'); if (go) go.onclick = async function () {
          var err = $('#err'), bank = rb.value === '_' ? $('#rbx').value.trim() : rb.value, acct = $('#ra').value.trim(), holder = $('#rh').value.trim(); err.textContent = '';
          if (!bank) { err.textContent = '은행을 골라 주세요.'; return; }
          var nd = acct.replace(/\D/g, '').length; if (nd < 6 || nd > 20) { err.textContent = '계좌번호를 숫자로 정확히 적어 주세요.'; return; }
          if (!holder) { err.textContent = '예금주 이름을 적어 주세요.'; return; }
          if (!$('#rag').checked) { err.textContent = '확인 내용에 체크해 주세요.'; return; }
          if (!(await ui.confirm('환불을 신청할까요?', '예상 ' + u.won(d.calc.amount) + '\n' + bank + ' ' + acct + ' (' + holder + ')\n계좌번호가 맞는지 한 번 더 확인해 주세요.', '신청하기'))) return;
          ui.busy(true, '신청하고 있어요…');
          try { var r = await LZ.api('refundReq', { bank: bank, acct: acct, holder: holder, reason: $('#rr').value, agree: 1 }, { retry: 0 }); ui.busy(false); d.state = r.state; S.me = Object.assign({}, S.me, { refund: r.state }); draw(); ui.toast('환불을 신청했어요. 관리자가 확인한 뒤 보내 드려요.', 4500); }
          catch (e) { ui.busy(false); if ($('#err')) $('#err').textContent = ui.errText(e); }
        };
        var cn = $('#rfc'); if (cn) cn.onclick = async function () {
          if (!(await ui.confirm('환불 신청을 취소할까요?', '취소하면 지금처럼 계속 이용해요.', '신청 취소', true))) return;
          ui.busy(true, '취소하고 있어요…');
          try { var r = await LZ.api('refundCancel', {}, { retry: 0 }); ui.busy(false); S.me = Object.assign({}, S.me, { refund: r.state }); d = await LZ.api('refundInfo', {}); if (alive()) draw(); ui.toast('환불 신청을 취소했어요.'); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
        };
      }
      draw();
    }
  };

  /* ───── 이용권 결제 ───── */
  LZ.screens.pay = {
    show: async function (p, root, alive) {
      root.innerHTML = '<div class="scr">' + ui.hdr2('이용권 결제') + '<div class="bd nt">' + ui.skeleton(4) + '</div></div>';
      var d = await LZ.api('payInfo', {}); if (!alive()) return;
      var plan = p.plan || 'year', method = 'kakao', dep = S.user.nick, showHow = false;
      S.user = Object.assign({}, S.user, d.user); S.me = Object.assign({}, S.me, { pay: d.pay, pending: d.pending });
      var nick = S.user.nick;

      function head() {
        var us = S.user;
        return '<div class="blk"><h4>내 이용권</h4><div style="font-size:17px"><b>' + esc(us.kindName) + '</b> · ' + (us.st === 'expired' ? '<span style="color:var(--rt)">기간 끝남</span>' : u.dday(us.left)) + '</div><div class="meta">' + (u.period(us.start, us.end) || '-') + '</div></div>';
      }
      function howTo(pl, amount) {
        var qr = d.qr[pl] || '';
        if (method === 'kakao') {
          return '<div class="ban r" style="font-size:15px">송금할 때 <b>메시지</b>에 내 닉네임 <b>"' + esc(nick) + '"</b>을 꼭 적어 주세요. 닉네임으로 누가 보냈는지 확인해요.</div>' +
            '<button class="sm" id="cpn" type="button" style="margin-bottom:8px">닉네임 복사</button>' +
            (qr ? '<a class="btn kp" id="kgo" href="' + esc(qr) + '" target="_blank" rel="noopener">카카오페이로 ' + u.won(amount) + ' 송금하기</a><div class="qrbox" id="qrb"></div><p class="hint" style="text-align:center;margin-top:0">다른 휴대폰으로 보고 있다면 이 QR을 카카오페이로 찍어도 돼요.</p>' +
              '<div class="ann">· 금액 <b>' + u.won(amount) + '</b>이 자동으로 들어가지 않으면 직접 넣어 주세요.\n· 카카오페이를 쓰지 않으면 위에서 "계좌이체"를 골라 주세요.</div>'
              : '<div class="ban">아직 카카오페이 QR이 준비되지 않았어요. 계좌이체를 이용해 주세요.</div>');
        }
        return '<div class="acct">은행: <b>' + esc(d.bank.name) + '</b><br>계좌번호: <b>' + esc(d.bank.no) + '</b> <button class="sm" id="cpa" type="button" style="min-height:36px">복사</button><br>예금주: <b>' + esc(d.bank.holder) + '</b><br>금액: <b>' + u.won(amount) + '</b></div>' +
          '<div class="ban r" style="font-size:15px;margin-top:8px">이체할 때 <b>받는 분 통장 표시</b>(보내는 분 이름)에 내 닉네임 <b>"' + esc(nick) + '"</b>을 적어 주세요.</div><button class="sm" id="cpn" type="button">닉네임 복사</button>';
      }
      function bindHow() {
        var cpn = $('#cpn'); if (cpn) cpn.onclick = async function () { ui.toast((await u.copy(nick)) ? '닉네임 "' + nick + '"을 복사했어요. 송금 메시지에 붙여 넣으세요.' : '복사하지 못했어요. 직접 적어 주세요.', 4000); };
        var cpa = $('#cpa'); if (cpa) cpa.onclick = async function () { ui.toast((await u.copy(d.bank.no.replace(/-/g, ''))) ? '계좌번호를 복사했어요.' : '복사하지 못했어요. 직접 적어 주세요.', 3000); };
        var qb = $('#qrb'); if (qb) drawQR(qb, d.qr[plan]);
        $$('#seg2 button').forEach(function (b) { b.onclick = function () { method = b.dataset.m; draw(); }; });
      }
      function pendingView() {
        var pd = d.pending;
        return '<div class="blk"><h4>입금 확인을 기다리고 있어요</h4><div class="ann">이용권: ' + esc(pd.planName) + ' ' + u.won(pd.amount) + '\n방법: ' + METHOD[pd.method] + '\n보낸 분 표시: ' + esc(pd.depositor) + '\n신청: ' + new Date(pd.created).toLocaleString('ko-KR') + '</div>' +
          '<p class="hint">관리자가 입금을 확인하면 바로 이용이 시작돼요. 아직 송금하지 않았다면 아래 안내대로 보내 주세요.</p>' +
          '<div style="display:grid;gap:8px;margin-top:10px"><button class="btn" id="chk" type="button">승인됐는지 확인하기</button><button class="btn g" id="how" type="button">' + (showHow ? '송금 안내 접기' : '송금 안내 다시 보기') + '</button><button class="btn r" id="cnc" type="button">신청 취소</button></div></div>' +
          (showHow ? '<div class="blk"><div class="seg" id="seg2" style="margin-bottom:10px">' + ['kakao', 'bank'].map(function (m) { return '<button type="button" data-m="' + m + '" class="' + (method === m ? 'on' : '') + '">' + METHOD[m] + '</button>'; }).join('') + '</div>' + howTo(pd.plan, pd.amount) + '</div>' : '');
      }
      function draw() {
        var body;
        if (d.pending) body = pendingView();
        else if (!d.pay.ok) body = '<div class="ban">' + esc(d.pay.why || '지금은 결제할 수 없어요.') + '</div>';
        else {
          var pv = d.preview[plan];
          body = '<div class="blk"><h4>1. 이용권 고르기</h4><div class="pl">' + ['month', 'year'].map(function (k) {
            return '<button type="button" data-pl="' + k + '" class="' + (plan === k ? 'on' : '') + '" aria-pressed="' + (plan === k) + '"><b>' + (k === 'month' ? '월간회원' : '연간회원') + '</b><span>' + u.won(d.prices[k]) + '</span><small>' + d.days[k] + '일</small></button>';
          }).join('') + '</div><div class="ann">이용 기간: <b>' + u.period(pv.start, pv.end) + '</b>' + (S.user.kind === 'month' || S.user.kind === 'year' ? (S.user.st === 'expired' ? '\n기간이 끝나서 확인한 날부터 시작돼요.' : '\n지금 기간이 끝나는 다음 날부터 이어서 시작돼요.') : '\n관리자가 입금을 확인한 날부터 시작돼요.') + '</div></div>' +
            '<div class="blk"><h4>2. 송금하기</h4><div class="seg" id="seg2" style="margin-bottom:10px">' + ['kakao', 'bank'].map(function (m) { return '<button type="button" data-m="' + m + '" class="' + (method === m ? 'on' : '') + '">' + METHOD[m] + '</button>'; }).join('') + '</div>' + howTo(plan, d.prices[plan]) + '</div>' +
            '<div class="blk"><h4>3. 송금했다고 알리기</h4><label class="lbl" for="dep" style="margin-top:0">송금할 때 적은 이름 (보통 닉네임)</label><input class="inp" id="dep" maxlength="10" value="' + esc(dep) + '">' +
            '<button class="btn" id="sent" type="button" style="margin-top:10px">송금했어요</button><p class="hint">관리자가 입금을 확인하면 이용이 시작돼요.</p></div>' +
            '<details class="blk"><summary style="font-size:15px;cursor:pointer">환불 안내</summary><div class="ann">· 기본은 기간 끝까지 이용해요.\n· 결제 후 7일 이내이고 기록을 쓰지 않았으면 전액 환불해요.\n· 그 밖에는 남은 날짜만큼 나눠서 환불해요. (100원 미만 버림)\n· 환불은 매장이나 관리자에게 말씀해 주세요.</div></details>';
        }
        root.innerHTML = '<div class="scr">' + ui.hdr2('이용권 결제') + '<div class="bd nt">' + head() + body + '</div></div>';
        $$('.pl [data-pl]').forEach(function (b) { b.onclick = function () { plan = b.dataset.pl; draw(); }; });
        var di = $('#dep'); if (di) di.oninput = function () { dep = di.value; };
        bindHow();
        var sb = $('#sent'); if (sb) sb.onclick = async function () {
          if (sb.dataset.busy) return; sb.dataset.busy = '1';
          try { await sendIt(); } finally { if (sb.isConnected) delete sb.dataset.busy; }
        };
        async function sendIt() {
          var v = (dep || '').trim(); if (!v) return ui.toast('송금할 때 적은 이름을 넣어 주세요.');
          if (!(await ui.confirm('송금하셨나요?', METHOD[method] + '로 ' + u.won(d.prices[plan]) + '을 보냈다고 관리자에게 알려요.\n보낸 분 표시: ' + v, '네, 보냈어요'))) return;
          ui.busy(true, '알리고 있어요…');
          try { var r = await LZ.api('payReq', { plan: plan, method: method, depositor: v }, { retry: 0 }); ui.busy(false); d.pending = r.pending; S.me = Object.assign({}, S.me, { pending: r.pending }); showHow = false; draw(); ui.toast('관리자에게 알렸어요. 확인되면 바로 시작돼요.', 4500); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 5000); }
        }
        var ch = $('#chk'); if (ch) ch.onclick = async function () {
          ui.busy(true, '확인하고 있어요…');
          try {
            d = await LZ.api('payInfo', {}, { retry: 0 }); ui.busy(false);
            S.user = Object.assign({}, S.user, d.user); S.me = Object.assign({}, S.me, { pay: d.pay, pending: d.pending }); LZ.cache.courses = null;
            if (!d.pending) { ui.toast('확인됐어요! ' + d.user.kindName + ' 이용이 시작됐어요. (' + u.period(d.user.start, d.user.end) + ')', 6000); return LZ.go('courses', {}, { reset: true }); }
            ui.toast('아직 확인 전이에요. 조금 뒤에 다시 눌러 주세요.', 3500); draw();
          } catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
        };
        var hw = $('#how'); if (hw) hw.onclick = function () { showHow = !showHow; draw(); };
        var cn = $('#cnc'); if (cn) cn.onclick = async function () {
          if (!(await ui.confirm('결제 신청을 취소할까요?', '이미 송금했다면 취소하지 말고 관리자에게 말씀해 주세요.', '신청 취소', true))) return;
          ui.busy(true, '취소하고 있어요…');
          try { await LZ.api('payCancel', {}, { retry: 0 }); ui.busy(false); d.pending = null; S.me = Object.assign({}, S.me, { pending: null }); draw(); ui.toast('신청을 취소했어요.'); }
          catch (e) { ui.busy(false); ui.toast(ui.errText(e), 4500); }
        };
      }
      draw();
    }
  };
})();
